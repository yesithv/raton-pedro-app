package com.ironcoding.perezar.media

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.os.SystemClock
import android.view.Surface
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Encoder de video por input Surface + encoder AAC del microfono + muxer.
 *
 * El microfono va incluido: la app de referencia hace de la narracion en vivo del padre
 * una funcion destacada, y es probablemente la mitad de por que el video se comparte
 * despues. Ver docs/plan-de-trabajo.md, hallazgo 1.
 */
class Recorder(
    private val outputPath: String,
    width: Int,
    height: Int,
    private val withAudio: Boolean,
    private val bitRate: Int = 12_000_000,
) {

    /**
     * Los encoders de gama baja fallan -a veces en silencio, dando un mp4 verde- con
     * dimensiones que no son multiplo de 16. Se redondea hacia abajo para no salirse del
     * FBO. Ver seccion 4 de la arquitectura.
     */
    val videoWidth = width / 16 * 16
    val videoHeight = height / 16 * 16

    private lateinit var videoCodec: MediaCodec
    private var audioCodec: MediaCodec? = null
    private var audioRecord: AudioRecord? = null
    private lateinit var muxer: MediaMuxer

    private var videoTrack = -1
    private var audioTrack = -1
    private var muxerStarted = false

    private val running = AtomicBoolean(false)
    private var audioThread: Thread? = null

    private val videoInfo = MediaCodec.BufferInfo()
    private val audioInfo = MediaCodec.BufferInfo()

    /** Superficie que consume el compositor como segundo destino de presentacion. */
    lateinit var inputSurface: Surface; private set

    /**
     * Desfase entre el dominio de reloj de la camara y el de AudioRecord, en nanosegundos.
     *
     * Si SENSOR_INFO_TIMESTAMP_SOURCE devuelve UNKNOWN, los timestamps de la camara NO
     * estan en el mismo dominio que SystemClock.elapsedRealtimeNanos() que usa
     * AudioRecord, y el audio queda desfasado respecto al video. Se mide una vez al
     * iniciar y se aplica a cada muestra de audio. Ver seccion 4 de la arquitectura.
     */
    var audioClockOffsetNs = 0L

    fun prepare() {
        check(videoWidth > 0 && videoHeight > 0) { "Dimensiones invalidas tras redondear a 16" }

        val format = MediaFormat.createVideoFormat(MIME_VIDEO, videoWidth, videoHeight).apply {
            // COLOR_FormatSurface: al usar input Surface se evita entero el infierno de
            // los color formats de MediaCodec. Nunca queueInputBuffer con arrays de bytes.
            setInteger(MediaFormat.KEY_COLOR_FORMAT,
                MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            setInteger(MediaFormat.KEY_FRAME_RATE, 30)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }
        videoCodec = MediaCodec.createEncoderByType(MIME_VIDEO).apply {
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        }
        inputSurface = videoCodec.createInputSurface()

        File(outputPath).parentFile?.mkdirs()
        muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

        if (withAudio) prepareAudio()
    }

    private fun prepareAudio() {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
        )
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuffer, BUFFER_BYTES) * 2,
        )

        val format = MediaFormat.createAudioFormat(MIME_AUDIO, SAMPLE_RATE, 1).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, BUFFER_BYTES)
        }
        audioCodec = MediaCodec.createEncoderByType(MIME_AUDIO).apply {
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        }
    }

    fun start() {
        videoCodec.start()
        audioCodec?.start()
        running.set(true)

        audioRecord?.let { record ->
            record.startRecording()
            audioThread = Thread({ pumpAudio(record) }, "perezar-audio").apply { start() }
        }
    }

    private fun pumpAudio(record: AudioRecord) {
        val codec = audioCodec ?: return
        val buffer = ByteArray(BUFFER_BYTES)
        while (running.get()) {
            val read = record.read(buffer, 0, buffer.size)
            if (read <= 0) continue
            val index = codec.dequeueInputBuffer(10_000)
            if (index < 0) continue
            codec.getInputBuffer(index)!!.apply { clear(); put(buffer, 0, read) }
            val ptsUs = (SystemClock.elapsedRealtimeNanos() + audioClockOffsetNs) / 1_000
            codec.queueInputBuffer(index, 0, read, ptsUs, 0)
            drain(codec, audioInfo, audio = true)
        }
        val index = codec.dequeueInputBuffer(10_000)
        if (index >= 0) {
            codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        }
    }

    /** Llamar desde el hilo GL tras cada eglSwapBuffers sobre la superficie del encoder. */
    fun drainVideo() = drain(videoCodec, videoInfo, audio = false)

    @Synchronized
    private fun drain(codec: MediaCodec, info: MediaCodec.BufferInfo, audio: Boolean) {
        while (true) {
            when (val index = codec.dequeueOutputBuffer(info, 0)) {
                MediaCodec.INFO_TRY_AGAIN_LATER -> return
                MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    val track = muxer.addTrack(codec.outputFormat)
                    if (audio) audioTrack = track else videoTrack = track
                    // El muxer solo arranca cuando estan todas las pistas declaradas.
                    if (videoTrack >= 0 && (!withAudio || audioTrack >= 0)) {
                        muxer.start()
                        muxerStarted = true
                    }
                }
                else -> if (index >= 0) {
                    val buffer = codec.getOutputBuffer(index)!!
                    val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (!isConfig && info.size > 0 && muxerStarted) {
                        buffer.position(info.offset)
                        buffer.limit(info.offset + info.size)
                        muxer.writeSampleData(
                            if (audio) audioTrack else videoTrack, buffer, info,
                        )
                    }
                    codec.releaseOutputBuffer(index, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }

    /**
     * Cierra limpiamente. DEBE llamarse tambien desde onPause durante una grabacion.
     *
     * Un mp4 sin atomo moov es un archivo corrupto, y en este producto el momento es
     * irrepetible: el nino solo pierde ese diente una vez. Ver seccion 5.
     */
    fun stop(framesSubmitted: Int, framesDropped: Int): RecordingResult {
        val startedStop = SystemClock.elapsedRealtime()
        running.set(false)
        audioThread?.join(1_000)
        audioRecord?.runCatching { stop(); release() }

        videoCodec.runCatching { signalEndOfInputStream() }
        drainVideo()
        audioCodec?.let { drain(it, audioInfo, audio = true) }

        videoCodec.runCatching { stop(); release() }
        audioCodec?.runCatching { stop(); release() }
        inputSurface.release()

        if (muxerStarted) muxer.runCatching { stop() }
        muxer.runCatching { release() }

        val file = File(outputPath)
        return RecordingResult(
            path = outputPath,
            sizeBytes = file.length(),
            framesSubmitted = framesSubmitted,
            framesDropped = framesDropped,
            // Tiempo desde que el usuario suelta el boton hasta tener el archivo. Es lo
            // que percibe como "espera", y una de las metricas de salida del spike.
            exportMs = SystemClock.elapsedRealtime() - startedStop,
        )
    }

    private companion object {
        const val MIME_VIDEO = MediaFormat.MIMETYPE_VIDEO_AVC
        const val MIME_AUDIO = MediaFormat.MIMETYPE_AUDIO_AAC
        const val SAMPLE_RATE = 44_100
        const val BUFFER_BYTES = 8_192
    }
}

/**
 * Metricas de salida del spike, seccion 1 de la arquitectura: frames caidos, tiempo de
 * export y tamano del archivo. Se emiten a Dart para poder anotarlas sin conectar un
 * depurador, que es lo que hace falta al probar en tres dispositivos de gama baja.
 */
data class RecordingResult(
    val path: String,
    val sizeBytes: Long,
    val framesSubmitted: Int,
    val framesDropped: Int,
    val exportMs: Long,
)
