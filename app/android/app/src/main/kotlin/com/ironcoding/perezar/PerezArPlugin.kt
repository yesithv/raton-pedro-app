package com.ironcoding.perezar

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.hardware.camera2.CameraCharacteristics
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import com.google.ar.core.ArCoreApk
import com.ironcoding.perezar.analysis.SceneAnalyzer
import com.ironcoding.perezar.ar.ArCoreDriver
import com.ironcoding.perezar.ar.ArDriver
import com.ironcoding.perezar.ar.Camera2Driver
import com.ironcoding.perezar.gl.Compositor
import com.ironcoding.perezar.gl.EglCore
import com.ironcoding.perezar.gl.GradingParams
import com.ironcoding.perezar.gl.OverlayRect
import com.ironcoding.perezar.gallery.MediaStoreSaver
import com.ironcoding.perezar.media.OverlayDecoder
import com.ironcoding.perezar.media.Recorder
import com.ironcoding.perezar.sensors.GyroTracker
import java.io.File
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.PluginRegistry
import io.flutter.view.TextureRegistry
import org.json.JSONObject

/**
 * Puente Flutter <-> nativo. Implementa el contrato de la seccion 5 de la arquitectura.
 *
 * Reparto de estado, y la regla no se rompe nunca:
 *   - El TRANSFORM se escribe en Dart y se empuja aqui.
 *   - El RELOJ DE REPRODUCCION se lee aqui y se empuja a Dart.
 * Nunca al reves. Si los dos lados escriben lo mismo aparecen carreras en el ciclo de
 * vida de Android, y el caso feo -onPause durante una grabacion- es justo el que no
 * puede fallar.
 */
class PerezArPlugin :
    FlutterPlugin,
    ActivityAware,
    MethodChannel.MethodCallHandler,
    PluginRegistry.RequestPermissionsResultListener {

    private lateinit var context: Context
    private lateinit var flutterAssets: FlutterPlugin.FlutterAssets
    private var activity: Activity? = null
    private var activityBinding: ActivityPluginBinding? = null
    private var pendingPermissions: MethodChannel.Result? = null

    private lateinit var methodChannel: MethodChannel
    private lateinit var eventChannel: EventChannel
    private var events: EventChannel.EventSink? = null
    private val mainHandler = Handler(android.os.Looper.getMainLooper())

    private lateinit var textures: TextureRegistry
    private var textureEntry: TextureRegistry.SurfaceTextureEntry? = null

    private var renderThread: HandlerThread? = null
    private var render: Handler? = null

    private var egl: EglCore? = null
    private var previewSurface: android.opengl.EGLSurface? = null
    private var encoderSurface: android.opengl.EGLSurface? = null

    private var compositor: Compositor? = null
    private val analyzer = SceneAnalyzer()
    private var decoder: OverlayDecoder? = null
    private var driver: ArDriver? = null
    private var recorder: Recorder? = null
    private var gyro: GyroTracker? = null

    @Volatile private var transform = OverlayRect(0.5f, 0.72f, 0.2f, 0.35f)
    @Volatile private var overlayVisible = false
    @Volatile private var playing = false
    @Volatile private var looping = true
    @Volatile private var effectMeta: JSONObject? = null

    private var viewportW = 1080
    private var viewportH = 1920
    private var frameCount = 0L
    private var playbackStartNs = 0L

    // Metricas de salida del spike (seccion 1 de la arquitectura).
    private var recordStartNs = 0L
    private var lastFrameNs = 0L
    private var framesSubmitted = 0
    private var lastThermal = -1

    // --- Ciclo de vida del plugin -------------------------------------------------

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        flutterAssets = binding.flutterAssets
        textures = binding.textureRegistry
        methodChannel = MethodChannel(binding.binaryMessenger, CHANNEL_CONTROL).apply {
            setMethodCallHandler(this@PerezArPlugin)
        }
        eventChannel = EventChannel(binding.binaryMessenger, CHANNEL_EVENTS).apply {
            setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(args: Any?, sink: EventChannel.EventSink?) { events = sink }
                override fun onCancel(args: Any?) { events = null }
            })
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        disposeAll()
        methodChannel.setMethodCallHandler(null)
        eventChannel.setStreamHandler(null)
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
        activityBinding = binding
        binding.addRequestPermissionsResultListener(this)
    }

    override fun onDetachedFromActivity() {
        activityBinding?.removeRequestPermissionsResultListener(this)
        activityBinding = null
        activity = null
    }

    override fun onReattachedToActivityForConfigChanges(b: ActivityPluginBinding) =
        onAttachedToActivity(b)

    override fun onDetachedFromActivityForConfigChanges() = onDetachedFromActivity()

    // --- Permisos en tiempo de ejecucion --------------------------------------------

    /**
     * Declarar los permisos en el manifest NO basta desde Android 6: hay que pedirlos en
     * ejecucion o la camara falla en silencio y la app se queda en negro. Se resuelve con
     * Activity.requestPermissions del framework, disponible desde API 23, en vez de
     * ActivityCompat: eso evita arrastrar AndroidX solo para esto.
     */
    private fun ensurePermissions(result: MethodChannel.Result) {
        val act = activity
        if (act == null) { result.error("no_activity", "sin Activity", null); return }

        val missing = REQUIRED_PERMISSIONS.filter {
            act.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) { result.success(true); return }

        if (pendingPermissions != null) {
            result.error("busy", "ya hay una solicitud de permisos en curso", null)
            return
        }
        pendingPermissions = result
        act.requestPermissions(missing.toTypedArray(), PERMISSIONS_REQUEST)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ): Boolean {
        if (requestCode != PERMISSIONS_REQUEST) return false
        val result = pendingPermissions ?: return false
        pendingPermissions = null

        // La camara es obligatoria; el microfono no. Sin microfono el video sale mudo,
        // que es peor pero sigue siendo un video; sin camara no hay nada que componer.
        val granted = permissions.withIndex().none { (i, permission) ->
            permission == android.Manifest.permission.CAMERA &&
                grantResults.getOrNull(i) != PackageManager.PERMISSION_GRANTED
        }
        result.success(granted)
        return true
    }

    // --- MethodChannel ------------------------------------------------------------

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "requestPermissions" -> ensurePermissions(result)
            "initialize" -> initialize(call, result)
            "loadEffect" -> post(result) { loadEffect(call.argument<String>("assetPath")!!,
                                                      call.argument<String>("metadata")!!); null }
            "setTransform" -> {
                // Se llama en cada frame del gesto de arrastre. Dart NO espera el retorno.
                transform = OverlayRect(
                    (call.argument<Double>("x") ?: 0.5).toFloat(),
                    (call.argument<Double>("y") ?: 0.72).toFloat(),
                    (call.argument<Double>("scaleX") ?: 0.2).toFloat(),
                    (call.argument<Double>("scaleY") ?: 0.35).toFloat(),
                )
                result.success(null)
            }
            "setOverlayVisible" -> { overlayVisible = call.arguments as Boolean; result.success(null) }
            "placeAt" -> post(result) {
                gyro?.anchorHere()
                driver?.placeAt(
                    (call.argument<Double>("x") ?: 0.5).toFloat(),
                    (call.argument<Double>("y") ?: 0.5).toFloat(),
                ) ?: false
            }
            "switchCamera" -> post(result) { switchCamera(call.argument<Boolean>("front") ?: false) }
            "play" -> post(result) { startPlayback(loop = call.argument<Boolean>("loop") ?: false); null }
            "pause" -> post(result) { playing = false; null }
            "startRecording" -> post(result) { startRecording(call.argument<String>("outputPath")!!,
                                                              call.argument<Boolean>("audio") ?: true); null }
            "stopRecording" -> post(result) { stopRecording() }
            "setTorch" -> post(result) { driver?.setTorch(call.arguments as Boolean) ?: false }
            "setGrading" -> { applyGrading(call); result.success(null) }
            "capturePhoto" -> post(result) { capturePhoto() }
            "saveToGallery" -> post(result) {
                saveToGallery(call.argument<String>("path")!!, call.argument<String>("mimeType")!!)
            }
            "share" -> post(result) {
                MediaStoreSaver.share(
                    context, android.net.Uri.parse(call.argument<String>("uri")!!),
                    call.argument<String>("mimeType") ?: "video/mp4",
                    call.argument<String>("title") ?: "Compartir",
                )
                true
            }
            "openInGallery" -> post(result) {
                MediaStoreSaver.openInGallery(
                    context, android.net.Uri.parse(call.argument<String>("uri")!!),
                    call.argument<String>("mimeType") ?: "video/mp4",
                )
                true
            }
            "dispose" -> post(result) { disposeAll(); null }
            else -> result.notImplemented()
        }
    }

    /** Ejecuta en el hilo GL y devuelve el resultado en el hilo principal. */
    private fun post(result: MethodChannel.Result, block: () -> Any?) {
        val handler = render
        if (handler == null) { result.error("no_init", "initialize() primero", null); return }
        handler.post {
            val value = runCatching(block)
            mainHandler.post {
                value.fold(
                    onSuccess = { result.success(it) },
                    onFailure = { result.error("native", it.message, null) },
                )
            }
        }
    }

    private fun initialize(call: MethodCall, result: MethodChannel.Result) {
        viewportW = call.argument<Int>("width") ?: viewportW
        viewportH = call.argument<Int>("height") ?: viewportH

        val entry = textures.createSurfaceTexture()
        textureEntry = entry
        entry.surfaceTexture().setDefaultBufferSize(viewportW, viewportH)

        renderThread = HandlerThread("perezar-gl").apply { start() }
        render = Handler(renderThread!!.looper)

        render!!.post {
            val core = EglCore()
            egl = core
            previewSurface = core.createWindowSurface(entry.surfaceTexture())
            core.makeCurrent(previewSurface!!)

            val comp = Compositor(context).apply { init(); resize(viewportW, viewportH) }
            compositor = comp
            analyzer.init()
            decoder = OverlayDecoder(comp.overlayTextureId)

            val drv = createDriver()
            drv.start(comp.cameraTextureId, viewportW, viewportH)
            driver = drv

            // El giroscopio solo se usa SIN ARCore. Con ancla el mundo ya manda, y
            // aplicar ambos duplicaria la correccion: el personaje se iria al doble de
            // rapido que el encuadre.
            if (!drv.supportsPlanes) {
                gyro = GyroTracker(context).takeIf { it.available }?.also { it.start() }
            }

            mainHandler.post {
                result.success(mapOf(
                    "textureId" to entry.id(),
                    "previewWidth" to viewportW,
                    "previewHeight" to viewportH,
                    "supportsPlanes" to (driver?.supportsPlanes ?: false),
                ))
                emit("ready", mapOf("supportsPlanes" to (driver?.supportsPlanes ?: false)))
            }
            scheduleFrame()
        }
    }

    /**
     * Elige driver en arranque. Es el punto exacto donde vive la degradacion de la
     * decision B: con ARCore se ancla al mundo, sin el se coloca a dedo, y el resto del
     * codigo no distingue.
     */
    private fun createDriver(): ArDriver {
        val fallback = { Camera2Driver(context, analyzer) }
        val act = activity ?: return fallback()

        if (!ArCoreApk.getInstance().checkAvailability(context).isSupported) {
            Log.i(TAG, "Dispositivo sin ARCore: colocacion por toque")
            return fallback()
        }
        return runCatching { ArCoreDriver(act) as ArDriver }.getOrElse {
            Log.w(TAG, "ARCore no arranco, se cae a Camera2", it)
            fallback()
        }
    }

    /**
     * Alterna entre camara frontal (selfie) y trasera.
     *
     * La frontal siempre se sirve con Camera2Driver: ARCore no ofrece deteccion de
     * planos con ella, asi que no tiene sentido pagar su coste. Al volver a la trasera
     * se reintenta ARCore igual que en el arranque, por si el dispositivo lo soporta.
     */
    private fun switchCamera(front: Boolean): Map<String, Any?> {
        val comp = compositor ?: return mapOf("supportsPlanes" to false)
        val current = driver

        val next: ArDriver = when {
            front && current is Camera2Driver -> current.apply {
                setFacing(CameraCharacteristics.LENS_FACING_FRONT)
            }
            front -> {
                current?.stop()
                Camera2Driver(context, analyzer).apply {
                    start(comp.cameraTextureId, viewportW, viewportH)
                    setFacing(CameraCharacteristics.LENS_FACING_FRONT)
                }
            }
            current is Camera2Driver && current.isFrontFacing -> {
                current.stop()
                createDriver().also { it.start(comp.cameraTextureId, viewportW, viewportH) }
            }
            else -> current ?: createDriver().also { it.start(comp.cameraTextureId, viewportW, viewportH) }
        }
        driver = next

        gyro?.stop()
        gyro = if (!next.supportsPlanes) {
            GyroTracker(context).takeIf { it.available }?.also { it.start() }
        } else {
            null
        }

        return mapOf("supportsPlanes" to next.supportsPlanes)
    }

    // --- Bucle de render ----------------------------------------------------------

    private fun scheduleFrame() {
        render?.postDelayed({ drawFrame(); scheduleFrame() }, FRAME_MS)
    }

    private fun drawFrame() {
        val core = egl ?: return
        val comp = compositor ?: return
        val drv = driver ?: return
        val dec = decoder ?: return

        core.makeCurrent(previewSurface!!)
        val frame = drv.update() ?: return
        lastFrameNs = frame.timestampNs
        if (recorder != null && recordStartNs == 0L) recordStartNs = frame.timestampNs

        // El reloj maestro es la camara. Todo lo demas se deriva de aqui.
        if (playing) {
            if (playbackStartNs == 0L) playbackStartNs = frame.timestampNs
            val elapsedUs = (frame.timestampNs - playbackStartNs) / 1_000
            if (dec.advanceTo(elapsedUs)) dec.surfaceTexture.updateTexImage()
            if (dec.isFinished) {
                if (looping) { dec.rewind(); playbackStartNs = frame.timestampNs }
                else { playing = false; emitOnMain("playbackDone", emptyMap<String, Any>()) }
            }
        }

        val rect = resolveRect(frame.anchor)
        if (overlayVisible && frameCount % ANALYZE_EVERY == 0L && frame.light == null) {
            analyzer.measure(comp.cameraTextureId, cameraRectFor(rect, frame))
        }
        val light = frame.light ?: analyzer.latest()
        val params = GradingParams(
            exposure = light?.exposure ?: floatArrayOf(1f, 1f, 1f),
            grain = light?.grain ?: 0f,
            softness = softness,
            limitedRange = effectMeta?.optBoolean("limitedRange", false) ?: false,
        )

        val overlayXform = FloatArray(16)
        dec.surfaceTexture.getTransformMatrix(overlayXform)

        val gyroOffset = gyro
            ?.let { floatArrayOf(it.offsetX, it.offsetY) }
            ?: FLOAT2_ZERO

        comp.compose(
            gyroOffset = gyroOffset,
            camXform = frame.camXform,
            overlayXform = overlayXform,
            overlaySize = dec.width to dec.height,
            camUvScale = frame.camUvScale,
            camUvOffset = frame.camUvOffset,
            rect = rect,
            params = params,
            timeSec = (frame.timestampNs / 1e9).toFloat(),
            visible = overlayVisible,
        )

        // Un solo pase de shader, dos destinos de presentacion. No se renderiza dos veces.
        comp.blitToCurrentSurface(viewportW, viewportH)
        core.swapBuffers(previewSurface!!)
        textureEntry?.surfaceTexture()

        recorder?.let { rec ->
            core.makeCurrent(encoderSurface!!)
            comp.blitToCurrentSurface(rec.videoWidth, rec.videoHeight)
            // PTS del frame de camara, nunca System.nanoTime(): con wall clock el mp4
            // sale con duracion correcta pero cadencia irregular.
            core.setPresentationTime(encoderSurface!!, frame.timestampNs)
            core.swapBuffers(encoderSurface!!)
            rec.drainVideo()
            framesSubmitted++
        }

        if (frameCount % THERMAL_EVERY == 0L) pollThermal()

        frameCount++
        if (playing && frameCount % TICK_EVERY == 0L) {
            emitOnMain("playbackTick", mapOf("positionMs" to dec.lastRenderedUs / 1000))
        }
    }

    /** Con ancla manda el mundo; sin ella, el transform que empuja Dart. */
    private fun resolveRect(anchor: com.ironcoding.perezar.ar.AnchorScreen?): OverlayRect {
        val meta = effectMeta
        val anchorPoint = meta?.optJSONArray("anchorPoint")
        val ax = (anchorPoint?.optDouble(0) ?: 0.5).toFloat()
        val ay = (anchorPoint?.optDouble(1) ?: 0.86).toFloat()

        if (anchor == null) {
            return OverlayRect(
                transform.originX - ax * transform.scaleX,
                transform.originY - ay * transform.scaleY,
                transform.scaleX, transform.scaleY,
            )
        }
        val trackSize = meta?.optJSONArray("trackSize")
        val tw = (trackSize?.optInt(0) ?: 720).toFloat()
        val th = (trackSize?.optInt(1) ?: 1280).toFloat()
        val scaleX = anchor.scaleY * viewportH * (tw / th) / viewportW
        return OverlayRect(
            anchor.x - ax * scaleX,
            anchor.y - ay * anchor.scaleY,
            scaleX, anchor.scaleY,
        )
    }

    private fun cameraRectFor(
        rect: OverlayRect,
        frame: com.ironcoding.perezar.ar.FrameUpdate,
    ): FloatArray {
        fun map(v: Float, i: Int) =
            (v * frame.camUvScale[i] + frame.camUvOffset[i]).coerceIn(0f, 1f)
        return floatArrayOf(
            map(rect.originX, 0), map(rect.originY, 1),
            map(rect.originX + rect.scaleX, 0), map(rect.originY + rect.scaleY, 1),
        )
    }

    // --- Acciones -----------------------------------------------------------------

    private var softness = 0.8f

    private fun applyGrading(call: MethodCall) {
        call.argument<Double>("key")?.let { analyzer.config.key = it.toFloat() }
        call.argument<Double>("whiteBalance")?.let { analyzer.config.whiteBalance = it.toFloat() }
        call.argument<Double>("exposureMin")?.let { analyzer.config.exposureMin = it.toFloat() }
        call.argument<Double>("exposureMax")?.let { analyzer.config.exposureMax = it.toFloat() }
        call.argument<Double>("softness")?.let { softness = it.toFloat() }
    }

    private fun loadEffect(assetPath: String, metadataJson: String) {
        val meta = JSONObject(metadataJson)
        effectMeta = meta
        meta.optJSONArray("referenceColor")?.let { arr ->
            analyzer.referenceColor = floatArrayOf(
                arr.optDouble(0, 0.5).toFloat(),
                arr.optDouble(1, 0.5).toFloat(),
                arr.optDouble(2, 0.5).toFloat(),
            )
        }
        decoder?.load(context.assets.openFd(flutterAssets.getAssetFilePathByName(assetPath)))
        playbackStartNs = 0L
    }

    private fun startPlayback(loop: Boolean) {
        looping = loop
        decoder?.rewind()
        playbackStartNs = 0L
        playing = true
    }

    private fun startRecording(outputPath: String, audio: Boolean) {
        val rec = Recorder(outputPath, viewportW, viewportH, audio)
        rec.audioClockOffsetNs = (driver as? Camera2Driver)?.audioClockOffsetNs ?: 0L
        rec.prepare()
        encoderSurface = egl!!.createWindowSurface(rec.inputSurface)
        rec.start()
        recorder = rec
        framesSubmitted = 0
        recordStartNs = 0L
        startPlayback(loop = false)
    }

    private fun stopRecording(): Map<String, Any?> {
        val rec = recorder ?: return emptyMap()
        recorder = null
        playing = false

        // Frames caidos = los que el reloj de camara dice que debieron ir menos los que
        // llegaron al encoder. Es la metrica que decide si la gama baja aguanta.
        val elapsedNs = if (recordStartNs == 0L) 0L else lastFrameNs - recordStartNs
        val expected = (elapsedNs / FRAME_NS).toInt()
        val dropped = (expected - framesSubmitted).coerceAtLeast(0)

        val result = rec.stop(framesSubmitted, dropped)
        encoderSurface?.let { egl?.releaseSurface(it) }
        encoderSurface = null

        val uri = runCatching {
            MediaStoreSaver.saveVideo(context, result.path, defaultName("mp4")).toString()
        }.onFailure { Log.e(TAG, "no pude guardar en la galeria", it) }.getOrNull()

        return mapOf(
            "path" to result.path,
            "uri" to uri,
            "sizeBytes" to result.sizeBytes,
            "durationMs" to elapsedNs / 1_000_000,
            "framesSubmitted" to result.framesSubmitted,
            "framesDropped" to result.framesDropped,
            "exportMs" to result.exportMs,
        )
    }

    private fun capturePhoto(): Map<String, Any?> {
        val comp = compositor ?: error("sin compositor")
        val bitmap: Bitmap = comp.capture()
        val file = File(context.cacheDir, defaultName("png"))
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()

        val uri = runCatching {
            MediaStoreSaver.saveImage(context, file.absolutePath, file.name).toString()
        }.onFailure { Log.e(TAG, "no pude guardar la foto", it) }.getOrNull()

        return mapOf("path" to file.absolutePath, "uri" to uri, "sizeBytes" to file.length())
    }

    private fun saveToGallery(path: String, mimeType: String): String? = runCatching {
        val name = File(path).name
        if (mimeType.startsWith("video/")) MediaStoreSaver.saveVideo(context, path, name).toString()
        else MediaStoreSaver.saveImage(context, path, name).toString()
    }.onFailure { Log.e(TAG, "guardado fallido", it) }.getOrNull()

    private fun defaultName(extension: String): String =
        "raton_perez_${System.currentTimeMillis()}.$extension"

    /**
     * Estado termico. En gama baja el throttling es lo que hace caer los fps a los 60
     * segundos, y sin avisar parece un bug del render.
     */
    private fun pollThermal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        val level = (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
            .currentThermalStatus
        if (level != lastThermal) {
            lastThermal = level
            if (level >= PowerManager.THERMAL_STATUS_MODERATE) {
                emitOnMain("thermalWarning", mapOf("level" to level))
            }
        }
    }

    private fun disposeAll() {
        // Si habia grabacion en curso, cerrar el muxer limpiamente. Un mp4 sin atomo moov
        // es un archivo corrupto, y aqui el momento es irrepetible.
        recorder?.let { runCatching { it.stop(framesSubmitted, 0) }.onSuccess { r ->
            emitOnMain("recordingDone", mapOf("path" to r.path, "sizeBytes" to r.sizeBytes))
        } }
        recorder = null

        gyro?.stop()
        gyro = null
        render?.post {
            driver?.stop()
            decoder?.release()
            decoder?.releaseSurfaces()
            analyzer.release()
            compositor?.release()
            previewSurface?.let { egl?.releaseSurface(it) }
            encoderSurface?.let { egl?.releaseSurface(it) }
            egl?.release()
            egl = null
        }
        renderThread?.quitSafely()
        renderThread = null
        render = null
        textureEntry?.release()
        textureEntry = null
    }

    private fun emit(type: String, data: Map<String, Any>) {
        events?.success(mapOf("type" to type) + data)
    }

    private fun emitOnMain(type: String, data: Map<String, Any>) {
        mainHandler.post { emit(type, data) }
    }

    private companion object {
        const val TAG = "PerezArPlugin"
        const val CHANNEL_CONTROL = "ironcoding/perezar/control"
        const val CHANNEL_EVENTS = "ironcoding/perezar/events"
        const val FRAME_MS = 16L
        const val FRAME_NS = 33_333_333L    // 30 fps, la cadencia del asset
        const val ANALYZE_EVERY = 10L
        const val TICK_EVERY = 6L
        const val THERMAL_EVERY = 120L
        const val PERMISSIONS_REQUEST = 0x9E7
        val REQUIRED_PERMISSIONS = arrayOf(
            android.Manifest.permission.CAMERA,
            android.Manifest.permission.RECORD_AUDIO,
        )
        val FLOAT2_ZERO = floatArrayOf(0f, 0f)
    }
}
