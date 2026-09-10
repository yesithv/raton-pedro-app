package com.ironcoding.perezar.media

import android.content.res.AssetFileDescriptor
import android.graphics.SurfaceTexture
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.view.Surface

/**
 * Decodifica el asset empaquetado bajo demanda de PTS.
 *
 * EL RELOJ MAESTRO ES LA CAMARA, no este decoder. Cuando llega un frame de camara con
 * timestamp t, se pide aqui el frame de overlay correspondiente a (t - t_inicio). Es la
 * decision de la seccion 2 de la arquitectura, y no es cosmetica: si el overlay corriera
 * con su propio reloj, en gama baja se desfasaria de la camara y el efecto perderia el
 * timing -el raton aparece cuando la escena ya paso-. Asi, si el dispositivo se ahoga,
 * pierde frames de forma consistente en ambos.
 *
 * La salida va a una SurfaceTexture ligada a la textura OES del compositor: se evita
 * entera la mineria de color formats de MediaCodec.
 */
class OverlayDecoder(private val textureId: Int) {

    val surfaceTexture = SurfaceTexture(textureId).apply { setDefaultBufferSize(1, 1) }
    private val outputSurface = Surface(surfaceTexture)

    private var extractor: MediaExtractor? = null
    private var codec: MediaCodec? = null
    private var inputDone = false

    /** PTS del ultimo frame entregado a la SurfaceTexture, en microsegundos. */
    var lastRenderedUs = -1L; private set

    var durationUs = 0L; private set
    var width = 0; private set
    var height = 0; private set

    private val bufferInfo = MediaCodec.BufferInfo()

    fun load(afd: AssetFileDescriptor) {
        release()
        val ex = MediaExtractor().apply {
            setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        }
        val track = (0 until ex.trackCount).firstOrNull {
            ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true
        } ?: error("El asset no trae pista de video")

        ex.selectTrack(track)
        val format = ex.getTrackFormat(track)
        width = format.getInteger(MediaFormat.KEY_WIDTH)
        height = format.getInteger(MediaFormat.KEY_HEIGHT)
        durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) {
            format.getLong(MediaFormat.KEY_DURATION)
        } else 0L

        surfaceTexture.setDefaultBufferSize(width, height)

        codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!).apply {
            configure(format, outputSurface, null, 0)
            start()
        }
        extractor = ex
        inputDone = false
        lastRenderedUs = -1L
    }

    fun rewind() {
        val ex = extractor ?: return
        ex.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
        codec?.flush()
        inputDone = false
        lastRenderedUs = -1L
    }

    /**
     * Avanza hasta el frame que corresponde a [targetUs] y lo publica en la
     * SurfaceTexture. Devuelve true si publico un frame nuevo -entonces el hilo GL debe
     * llamar a updateTexImage().
     *
     * Los frames intermedios se descartan sin renderizar: publicar todos encolaria buffers
     * que nadie va a consumir y el decoder acabaria bloqueado esperando que se liberen.
     */
    fun advanceTo(targetUs: Long): Boolean {
        val codec = this.codec ?: return false
        val extractor = this.extractor ?: return false
        if (lastRenderedUs >= targetUs) return false

        var rendered = false
        var guard = 0

        while (guard++ < MAX_STEPS_PER_FRAME) {
            if (!inputDone) {
                val index = codec.dequeueInputBuffer(0)
                if (index >= 0) {
                    val buffer = codec.getInputBuffer(index)!!
                    val size = extractor.readSampleData(buffer, 0)
                    if (size < 0) {
                        codec.queueInputBuffer(
                            index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM,
                        )
                        inputDone = true
                    } else {
                        codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
                        extractor.advance()
                    }
                }
            }

            when (val out = codec.dequeueOutputBuffer(bufferInfo, 0)) {
                MediaCodec.INFO_TRY_AGAIN_LATER -> return rendered
                MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> Unit
                else -> if (out >= 0) {
                    val reachedTarget = bufferInfo.presentationTimeUs >= targetUs
                    // render=true solo en el frame que toca; los anteriores se sueltan.
                    codec.releaseOutputBuffer(out, reachedTarget)
                    if (reachedTarget) {
                        lastRenderedUs = bufferInfo.presentationTimeUs
                        return true
                    }
                    rendered = false
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        return rendered
                    }
                }
            }
        }
        return rendered
    }

    val isFinished: Boolean
        get() = durationUs > 0 && lastRenderedUs >= durationUs - FRAME_SLACK_US

    fun release() {
        codec?.runCatching { stop(); release() }
        extractor?.release()
        codec = null
        extractor = null
    }

    fun releaseSurfaces() {
        outputSurface.release()
        surfaceTexture.release()
    }

    private companion object {
        /**
         * Techo de trabajo por frame de camara. Sin el, un salto grande de tiempo -por
         * ejemplo tras un onPause- haria decodificar cientos de frames en el hilo GL y
         * la preview se congelaria visiblemente.
         */
        const val MAX_STEPS_PER_FRAME = 12
        const val FRAME_SLACK_US = 33_000L
    }
}
