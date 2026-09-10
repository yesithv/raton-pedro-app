// STUB DE LA API DE ARCore, ESCRITO A MANO. NO ESTA EN EL REPO.
//
// El artefacto real (com.google.ar:core) vive en maven.google.com, que redirige a
// dl.google.com, y este entorno lo tiene bloqueado por politica de red.
//
// QUE PRUEBA ESTE STUB: que PerezArPlugin.kt y ArCoreDriver.kt son internamente
// consistentes -tipos, nulabilidad, flujo, firmas entre ellos y con el resto del modulo-.
// QUE NO PRUEBA: que la API real de ARCore tenga estas firmas. Eso solo se verifica
// compilando contra el aar de verdad.
package com.google.ar.core

import android.app.Activity
import android.content.Context
import java.nio.FloatBuffer

enum class TrackingState { TRACKING, PAUSED, STOPPED }

enum class Coordinates2d { VIEW_NORMALIZED, TEXTURE_NORMALIZED, OPENGL_NORMALIZED_DEVICE_COORDINATES }

class Pose {
    val translation: FloatArray get() = FloatArray(3)
}

interface Trackable { val trackingState: TrackingState }

class Plane : Trackable {
    override val trackingState: TrackingState get() = TrackingState.TRACKING
    fun isPoseInPolygon(pose: Pose): Boolean = true
}

class Anchor {
    val trackingState: TrackingState get() = TrackingState.TRACKING
    val pose: Pose get() = Pose()
    fun detach() {}
}

class HitResult {
    val trackable: Trackable get() = Plane()
    val hitPose: Pose get() = Pose()
    fun createAnchor(): Anchor = Anchor()
}

class LightEstimate {
    enum class State { NOT_VALID, VALID }
    val state: State get() = State.VALID
    fun getColorCorrection(out: FloatArray, offset: Int) {}
}

class Camera {
    val trackingState: TrackingState get() = TrackingState.TRACKING
    fun getViewMatrix(out: FloatArray, offset: Int) {}
    fun getProjectionMatrix(out: FloatArray, offset: Int, near: Float, far: Float) {}
}

class Frame {
    val camera: Camera get() = Camera()
    val timestamp: Long get() = 0L
    val lightEstimate: LightEstimate get() = LightEstimate()
    fun transformCoordinates2d(
        inputType: Coordinates2d, input: FloatBuffer,
        outputType: Coordinates2d, output: FloatBuffer,
    ) {}
    fun hitTest(x: Float, y: Float): List<HitResult> = emptyList()
}

class Config(session: Session) {
    enum class PlaneFindingMode { DISABLED, HORIZONTAL, VERTICAL, HORIZONTAL_AND_VERTICAL }
    enum class LightEstimationMode { DISABLED, AMBIENT_INTENSITY, ENVIRONMENTAL_HDR }
    enum class UpdateMode { BLOCKING, LATEST_CAMERA_IMAGE }
    enum class FocusMode { FIXED, AUTO }

    var planeFindingMode: PlaneFindingMode = PlaneFindingMode.DISABLED
    var lightEstimationMode: LightEstimationMode = LightEstimationMode.DISABLED
    var updateMode: UpdateMode = UpdateMode.BLOCKING
    var focusMode: FocusMode = FocusMode.FIXED
}

class Session(activity: Activity) {
    val config: Config get() = Config(this)
    fun configure(config: Config) {}
    fun setCameraTextureName(id: Int) {}
    fun setDisplayGeometry(rotation: Int, width: Int, height: Int) {}
    fun resume() {}
    fun pause() {}
    fun close() {}
    fun update(): Frame = Frame()
    fun <T : Trackable> getAllTrackables(filter: Class<T>): Collection<T> = emptyList()
}

class ArCoreApk {
    enum class Availability { SUPPORTED_INSTALLED, UNSUPPORTED_DEVICE_NOT_CAPABLE;
        val isSupported: Boolean get() = this == SUPPORTED_INSTALLED
    }
    fun checkAvailability(context: Context): Availability = Availability.SUPPORTED_INSTALLED
    companion object { @JvmStatic fun getInstance(): ArCoreApk = ArCoreApk() }
}
