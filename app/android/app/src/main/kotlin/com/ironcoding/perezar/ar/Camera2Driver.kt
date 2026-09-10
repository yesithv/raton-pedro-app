package com.ironcoding.perezar.ar

import android.content.Context
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import com.ironcoding.perezar.analysis.SceneAnalyzer

/**
 * Respaldo sin ARCore: entrega textura de camara y nada mas. La colocacion es por toque,
 * como en el prototipo web, y la iluminacion la estima SceneAnalyzer a mano.
 *
 * Existe porque una parte del parque de Android de gama baja no esta certificada para
 * ARCore. Con este driver la app funciona igual, solo que el personaje no queda anclado
 * al cuarto. Ver docs/decision-arquitectura.md.
 */
class Camera2Driver(
    private val context: Context,
    private val analyzer: SceneAnalyzer,
) : ArDriver {

    override val supportsPlanes = false
    override val hasSurface = true          // no hay nada que escanear: siempre "listo"

    override var previewWidth = 1280; private set
    override var previewHeight = 720; private set

    private var device: CameraDevice? = null
    private var surfaceTexture: SurfaceTexture? = null
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var requestBuilder: CaptureRequest.Builder? = null
    private var session: android.hardware.camera2.CameraCaptureSession? = null

    private val xform = FloatArray(16)
    private var frameAvailable = false
    private var viewportW = 1
    private var viewportH = 1

    /**
     * Desfase entre el dominio de reloj de la camara y elapsedRealtimeNanos(), que es el
     * que usa AudioRecord.
     *
     * Si SENSOR_INFO_TIMESTAMP_SOURCE devuelve UNKNOWN los dos dominios NO coinciden y el
     * audio queda desfasado respecto al video. Se mide una vez y el Recorder lo aplica a
     * cada muestra. Ver seccion 4 de la arquitectura.
     */
    var audioClockOffsetNs = 0L; private set

    override fun start(cameraTextureId: Int, viewportWidth: Int, viewportHeight: Int) {
        viewportW = viewportWidth
        viewportH = viewportHeight

        thread = HandlerThread("perezar-camera").apply { start() }
        handler = Handler(thread!!.looper)

        surfaceTexture = SurfaceTexture(cameraTextureId).apply {
            setDefaultBufferSize(previewWidth, previewHeight)
            setOnFrameAvailableListener { frameAvailable = true }
        }

        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val id = manager.cameraIdList.firstOrNull {
            manager.getCameraCharacteristics(it)
                .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        } ?: manager.cameraIdList.first()

        measureClockOffset(manager, id)
        openCamera(manager, id)
    }

    private fun measureClockOffset(manager: CameraManager, id: String) {
        val source = manager.getCameraCharacteristics(id)
            .get(CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE)
        audioClockOffsetNs = if (source == CameraMetadata.SENSOR_INFO_TIMESTAMP_SOURCE_REALTIME) {
            0L
        } else {
            // UNKNOWN: la camara usa un reloj monotono propio. Se mide el desfase contra
            // elapsedRealtime una sola vez al inicio de sesion.
            android.os.SystemClock.elapsedRealtimeNanos() - System.nanoTime()
        }
    }

    private fun openCamera(manager: CameraManager, id: String) {
        try {
            manager.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    device = camera
                    createSession(camera)
                }
                override fun onDisconnected(camera: CameraDevice) { camera.close(); device = null }
                override fun onError(camera: CameraDevice, error: Int) {
                    Log.e(TAG, "Camera2 error $error")
                    camera.close()
                    device = null
                }
            }, handler)
        } catch (e: SecurityException) {
            Log.e(TAG, "Sin permiso de camara", e)
        }
    }

    @Suppress("DEPRECATION")
    private fun createSession(camera: CameraDevice) {
        val surface = Surface(surfaceTexture)
        requestBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
            addTarget(surface)
            set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
        }
        camera.createCaptureSession(
            listOf(surface),
            object : android.hardware.camera2.CameraCaptureSession.StateCallback() {
                override fun onConfigured(s: android.hardware.camera2.CameraCaptureSession) {
                    session = s
                    s.setRepeatingRequest(requestBuilder!!.build(), null, handler)
                }
                override fun onConfigureFailed(s: android.hardware.camera2.CameraCaptureSession) {
                    Log.e(TAG, "createCaptureSession fallo")
                }
            },
            handler,
        )
    }

    override fun update(): FrameUpdate? {
        val texture = surfaceTexture ?: return null
        if (!frameAvailable) return null
        frameAvailable = false

        texture.updateTexImage()
        texture.getTransformMatrix(xform)

        val fit = com.ironcoding.perezar.gl.Compositor.coverFit(
            previewWidth, previewHeight, viewportW, viewportH,
        )
        return FrameUpdate(
            timestampNs = texture.timestamp,
            camXform = xform.copyOf(),
            camUvScale = floatArrayOf(fit[0], fit[1]),
            camUvOffset = floatArrayOf(fit[2], fit[3]),
            anchor = null,                       // sin planos: coloca Dart
            light = analyzer.latest(),
        )
    }

    override fun placeAt(screenX: Float, screenY: Float) = false

    override fun setTorch(on: Boolean): Boolean {
        val builder = requestBuilder ?: return false
        val s = session ?: return false
        builder.set(
            CaptureRequest.FLASH_MODE,
            if (on) CaptureRequest.FLASH_MODE_TORCH else CaptureRequest.FLASH_MODE_OFF,
        )
        return runCatching { s.setRepeatingRequest(builder.build(), null, handler) }.isSuccess
    }

    override fun stop() {
        session?.runCatching { close() }
        device?.runCatching { close() }
        surfaceTexture?.release()
        thread?.quitSafely()
        session = null
        device = null
        surfaceTexture = null
        thread = null
        handler = null
    }

    private companion object { const val TAG = "Camera2Driver" }
}
