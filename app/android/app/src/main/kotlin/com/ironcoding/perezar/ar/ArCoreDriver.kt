package com.ironcoding.perezar.ar

import android.app.Activity
import android.opengl.Matrix
import android.util.Log
import com.google.ar.core.Anchor
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Plane
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

/**
 * Driver con ARCore: textura de camara, deteccion de planos, anclas y estimacion de luz.
 *
 * Es la mitad "B" de la decision de arquitectura. El personaje sigue siendo un video alfa
 * pre-renderizado -no un modelo 3D-, pero su posicion y su tamano en pantalla salen de la
 * proyeccion de un ancla real en el mundo, asi que deja de comportarse como calcomania.
 *
 * Limitacion asumida: al ser un billboard, se ve desde el angulo con el que se renderizo.
 * Ver docs/decision-arquitectura.md.
 */
class ArCoreDriver(private val activity: Activity) : ArDriver {

    override val supportsPlanes = true

    private var session: Session? = null
    private var anchor: Anchor? = null

    private var viewportW = 1
    private var viewportH = 1

    override var previewWidth = 1280; private set
    override var previewHeight = 720; private set

    override var hasSurface = false; private set

    /** Multiplicador del paso TAMANO, sobre la altura fisica del personaje. */
    var sizeMultiplier = 1f

    private val view = FloatArray(16)
    private val projection = FloatArray(16)
    private val viewProjection = FloatArray(16)
    private val camXform = FloatArray(16)

    private val viewCoords = ByteBuffer.allocateDirect(3 * 2 * 4)
        .order(ByteOrder.nativeOrder()).asFloatBuffer()
    private val texCoords = ByteBuffer.allocateDirect(3 * 2 * 4)
        .order(ByteOrder.nativeOrder()).asFloatBuffer()

    override fun start(cameraTextureId: Int, viewportWidth: Int, viewportHeight: Int) {
        viewportW = viewportWidth
        viewportH = viewportHeight

        session = Session(activity).apply {
            configure(config.apply {
                planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
                // ARCore entrega gratis lo que SceneAnalyzer calcula a mano: intensidad
                // ambiental y correccion de color. AMBIENT_INTENSITY basta y es mucho mas
                // barato que ENVIRONMENTAL_HDR en gama baja, que es el parque objetivo.
                lightEstimationMode = Config.LightEstimationMode.AMBIENT_INTENSITY
                updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                focusMode = Config.FocusMode.AUTO
            })
            setCameraTextureName(cameraTextureId)
            setDisplayGeometry(activity.windowManager.defaultDisplay.rotation,
                viewportWidth, viewportHeight)
            resume()
        }
    }

    override fun update(): FrameUpdate? {
        val session = this.session ?: return null
        val frame = runCatching { session.update() }.getOrNull() ?: return null
        val camera = frame.camera

        hasSurface = session.getAllTrackables(Plane::class.java)
            .any { it.trackingState == TrackingState.TRACKING }

        if (camera.trackingState != TrackingState.TRACKING) return null

        camera.getViewMatrix(view, 0)
        camera.getProjectionMatrix(projection, 0, NEAR_M, FAR_M)
        Matrix.multiplyMM(viewProjection, 0, projection, 0, view, 0)

        buildCameraTransform(frame)

        return FrameUpdate(
            timestampNs = frame.timestamp,
            camXform = camXform.copyOf(),
            // ARCore ya mapea la textura al viewport completo: el ajuste "cover" lo hace
            // la propia matriz, no hace falta escalar la UV aparte.
            camUvScale = floatArrayOf(1f, 1f),
            camUvOffset = floatArrayOf(0f, 0f),
            anchor = projectAnchor(),
            light = estimateLight(frame),
        )
    }

    /**
     * Deriva la mat4 de UV de camara a partir de ARCore.
     *
     * ARCore no expone una matriz como SurfaceTexture: expone transformCoordinates2d(). La
     * transformacion es afin, asi que basta con mapear tres puntos y reconstruirla.
     */
    private fun buildCameraTransform(frame: com.google.ar.core.Frame) {
        viewCoords.position(0)
        viewCoords.put(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f))
        viewCoords.position(0)
        texCoords.position(0)
        frame.transformCoordinates2d(
            Coordinates2d.VIEW_NORMALIZED, viewCoords,
            Coordinates2d.TEXTURE_NORMALIZED, texCoords,
        )
        texCoords.position(0)
        val t00x = texCoords.get(0); val t00y = texCoords.get(1)
        val t10x = texCoords.get(2); val t10y = texCoords.get(3)
        val t01x = texCoords.get(4); val t01y = texCoords.get(5)

        Matrix.setIdentityM(camXform, 0)
        camXform[0] = t10x - t00x; camXform[1] = t10y - t00y   // columna u
        camXform[4] = t01x - t00x; camXform[5] = t01y - t00y   // columna v
        camXform[12] = t00x;       camXform[13] = t00y         // traslacion
    }

    /**
     * Proyecta el ancla a coordenadas de pantalla y deriva el tamano en pantalla a partir
     * de la altura FISICA del personaje.
     *
     * Es la ventaja concreta de anclar: la escala deja de ser un numero arbitrario que el
     * usuario ajusta a ojo y pasa a significar "este raton mide 25 cm", lo que hace que
     * se encoja al alejar el telefono, como haria un objeto real.
     */
    private fun projectAnchor(): AnchorScreen? {
        val anchor = this.anchor ?: return null
        if (anchor.trackingState != TrackingState.TRACKING) return null

        val t = anchor.pose.translation
        val base = projectPoint(t[0], t[1], t[2]) ?: return null
        val top = projectPoint(t[0], t[1] + CHARACTER_HEIGHT_M * sizeMultiplier, t[2])
            ?: return null

        return AnchorScreen(
            x = base[0],
            y = base[1],
            scaleY = abs(base[1] - top[1]).coerceIn(0.02f, 0.95f),
        )
    }

    /** Devuelve [x, y] en coordenadas de pantalla normalizadas, origen arriba-izquierda. */
    private fun projectPoint(x: Float, y: Float, z: Float): FloatArray? {
        val world = floatArrayOf(x, y, z, 1f)
        val clip = FloatArray(4)
        Matrix.multiplyMV(clip, 0, viewProjection, 0, world, 0)
        if (clip[3] <= 0f) return null           // detras de la camara
        return floatArrayOf(
            (clip[0] / clip[3]) * 0.5f + 0.5f,
            1f - ((clip[1] / clip[3]) * 0.5f + 0.5f),
        )
    }

    private fun estimateLight(frame: com.google.ar.core.Frame): LightEstimate? {
        val estimate = frame.lightEstimate
        if (estimate.state != com.google.ar.core.LightEstimate.State.VALID) return null

        val correction = FloatArray(4)
        estimate.getColorCorrection(correction, 0)
        // correction[3] es la intensidad en espacio gamma; [0..2], la correccion de color
        // por canal ya normalizada a media 1.
        val gain = correction[3]
        return LightEstimate(
            exposure = floatArrayOf(
                correction[0] * gain, correction[1] * gain, correction[2] * gain,
            ),
            // ARCore no estima ruido. Se deja el minimo de la receta: sin ningun grano el
            // personaje se delata sobre un feed ruidoso, y pasarse es peor que quedarse
            // corto. Ver docs/receta-grading.md.
            grain = DEFAULT_GRAIN,
        )
    }

    override fun placeAt(screenX: Float, screenY: Float): Boolean {
        val session = this.session ?: return false
        val frame = runCatching { session.update() }.getOrNull() ?: return false

        val hit = frame.hitTest(screenX * viewportW, screenY * viewportH).firstOrNull { hit ->
            val trackable = hit.trackable
            trackable is Plane && trackable.isPoseInPolygon(hit.hitPose) &&
                trackable.trackingState == TrackingState.TRACKING
        } ?: return false

        anchor?.detach()
        anchor = hit.createAnchor()
        return true
    }

    override fun setTorch(on: Boolean): Boolean {
        // ARCore no expone control de linterna; con la sesion activa la camara es suya.
        Log.i(TAG, "Linterna no disponible con ARCore")
        return false
    }

    override fun stop() {
        anchor?.detach()
        anchor = null
        session?.runCatching { pause(); close() }
        session = null
    }

    private companion object {
        const val TAG = "ArCoreDriver"
        const val NEAR_M = 0.1f
        const val FAR_M = 30f
        /** Altura del personaje en metros. Debe cuadrar con el render del animador. */
        const val CHARACTER_HEIGHT_M = 0.25f
        const val DEFAULT_GRAIN = 0.03f
    }
}
