package com.ironcoding.perezar.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.abs
import kotlin.math.tan

/**
 * Contra-desplazamiento del overlay segun la rotacion del telefono. Seccion 0.4 de la
 * arquitectura.
 *
 * Para que sirve: sin ningun anclaje, el personaje se queda pegado a la PANTALLA en vez
 * de al cuarto, y el cerebro lo detecta al instante. Contra-desplazarlo segun el giro
 * mata la mayor parte de esa sensacion en movimientos pequenos, que son los que ocurren
 * cuando alguien sostiene el telefono "quieto".
 *
 * Solo se usa con Camera2Driver. Con ARCore el ancla ya resuelve esto -y mucho mejor,
 * porque tambien compensa la traslacion-, asi que aplicar ambos duplicaria la
 * correccion.
 *
 * Limite conocido: solo compensa ROTACION. Si el padre camina, no sirve; ahi la UI debe
 * pedir que apoye el telefono.
 */
class GyroTracker(
    private val context: Context,
    /** Campo de visión vertical de la cámara, en radianes. ~60° es típico en móvil. */
    private val verticalFovRad: Float = 1.05f,
) : SensorEventListener {

    private val manager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor: Sensor? =
        manager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            ?: manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

    private val rotation = FloatArray(9)
    private val orientation = FloatArray(3)
    private var reference: FloatArray? = null

    /** Desplazamiento en coordenadas de pantalla normalizadas. */
    @Volatile var offsetX = 0f; private set
    @Volatile var offsetY = 0f; private set

    val available: Boolean get() = sensor != null

    fun start() {
        sensor?.let { manager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    fun stop() {
        manager.unregisterListener(this)
        reference = null
        offsetX = 0f
        offsetY = 0f
    }

    /** Fija la orientación actual como referencia. Se llama al colocar al personaje. */
    fun anchorHere() {
        reference = null   // el siguiente evento la reestablece
        offsetX = 0f
        offsetY = 0f
    }

    override fun onSensorChanged(event: SensorEvent) {
        SensorManager.getRotationMatrixFromVector(rotation, event.values)
        SensorManager.getOrientation(rotation, orientation)

        val ref = reference
        if (ref == null) {
            reference = orientation.copyOf()
            return
        }

        val dYaw = wrap(orientation[0] - ref[0])
        val dPitch = wrap(orientation[1] - ref[1])

        // Un giro de dTheta desplaza el punto proyectado en tan(dTheta) / tan(fov/2)
        // de media pantalla. Se contra-desplaza, de ahi el signo negativo.
        val half = tan(verticalFovRad / 2f)
        offsetX = (-tan(dYaw) / half * 0.5f).coerceIn(-0.5f, 0.5f)
        offsetY = (tan(dPitch) / half * 0.5f).coerceIn(-0.5f, 0.5f)

        // Un giro grande significa que el usuario esta reencuadrando, no temblando:
        // seguir contra-desplazando dejaria al personaje pegado a un borde.
        if (abs(offsetX) > 0.45f || abs(offsetY) > 0.45f) anchorHere()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun wrap(angle: Float): Float {
        var a = angle
        while (a > Math.PI) a -= (2 * Math.PI).toFloat()
        while (a < -Math.PI) a += (2 * Math.PI).toFloat()
        return a
    }
}
