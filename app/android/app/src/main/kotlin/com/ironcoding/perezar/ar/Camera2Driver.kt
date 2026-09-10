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

    private var cameraTextureId = 0
    private var facing = CameraCharacteristics.LENS_FACING_BACK

    /** true si la orientacion activa es la frontal (selfie): entonces se espeja la UV. */
    val isFrontFacing get() = facing == CameraCharacteristics.LENS_FACING_FRONT

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
        this.cameraTextureId = cameraTextureId
        viewportW = viewportWidth
        viewportH = viewportHeight
        openSession()
    }

    /**
     * Cierra la sesion activa y reabre con la orientacion pedida, sin recrear el driver
     * ni la textura GL. Lo usa el modo selfie para saltar entre frontal y trasera.
     */
    fun setFacing(newFacing: Int) {
        if (newFacing == facing && device != null) return
        facing = newFacing
        closeSession()
        openSession()
    }

    private fun openSession() {
        thread = HandlerThread("perezar-camera").apply { start() }
        handler = Handler(thread!!.looper)

        surfaceTexture = SurfaceTexture(cameraTextureId).apply {
            setDefaultBufferSize(previewWidth, previewHeight)
            setOnFrameAvailableListener { frameAvailable = true }
        }

        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val id = manager.cameraIdList.firstOrNull {
            manager.getCameraCharacteristics(it)
                .get(CameraCharacteristics.LENS_FACING) == facing
        } ?: manager.cameraIdList.first()

        measureClockOffset(manager, id)
        openCamera(manager, id)
    }

    private fun closeSession() {
        session?.runCatching { close() }
        device?.runCatching { close() }
        surfaceTexture?.release()
        thread?.quitSafely()
        session = null
        device = null
        surfaceTexture = null
        thread = null
        frameAvailable = false
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

        // La matriz cruda de SurfaceTexture para la webcam de este AVD no es estable:
        // segun la sesion llega identidad o ya rotada 90 (mismo sensorOrientation en
        // ambos casos, asi que ese valor no sirve para decidir). Se detecta mirando la
        // matriz real: si el eje u ya no mapea a u (xform[0] ~ 0) esta rotada, y el
        // recorte "cover" debe calcularse con el sensor invertido, si no el recorte usa
        // ~1/4 del buffer y se ve como zoom excesivo. Solo aplica a la selfie: la
        // trasera (virtualscene) no lo necesita.
        val xformRotated = isFrontFacing && kotlin.math.abs(xform[0]) < 0.5f
        val fit = if (xformRotated) {
            com.ironcoding.perezar.gl.Compositor.coverFit(
                previewHeight, previewWidth, viewportW, viewportH,
            )
        } else {
            com.ironcoding.perezar.gl.Compositor.coverFit(
                previewWidth, previewHeight, viewportW, viewportH,
            )
        }
        // La frontal se espeja en horizontal: es lo que un usuario espera de una camara
        // selfie, tanto en la vista previa como en la foto que se guarda.
        val scaleX = if (isFrontFacing) -fit[0] else fit[0]
        val offsetX = if (isFrontFacing) fit[2] + fit[0] else fit[2]

        return FrameUpdate(
            timestampNs = texture.timestamp,
            camXform = xform.copyOf(),
            camUvScale = floatArrayOf(scaleX, fit[1]),
            camUvOffset = floatArrayOf(offsetX, fit[3]),
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
        closeSession()
    }

    private companion object {
        const val TAG = "Camera2Driver"
    }
}
