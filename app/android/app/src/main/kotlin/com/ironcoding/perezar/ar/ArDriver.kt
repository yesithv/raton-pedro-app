package com.ironcoding.perezar.ar

/** Estimacion de iluminacion de la escena, en las mismas unidades que los uniforms. */
data class LightEstimate(
    val exposure: FloatArray,   // vec3: ganancia global ya combinada con la dominante
    val grain: Float,
)

/** Ancla proyectada a coordenadas de PANTALLA normalizadas. */
data class AnchorScreen(
    val x: Float,          // punto de contacto con la superficie
    val y: Float,
    val scaleY: Float,     // alto del overlay como fraccion del alto de pantalla
)

data class FrameUpdate(
    /**
     * Reloj maestro de todo el pipeline. El decoder del overlay y los PTS del encoder se
     * derivan de aqui, nunca de System.nanoTime(). Ver seccion 2 de la arquitectura.
     */
    val timestampNs: Long,
    val camXform: FloatArray,      // mat4 sobre la UV de camara
    val camUvScale: FloatArray,    // [sx, sy] del ajuste "cover"
    val camUvOffset: FloatArray,   // [ox, oy]
    val anchor: AnchorScreen?,     // null si el driver no ancla, o si aun no hay ancla
    val light: LightEstimate?,     // null si el driver no estima luz
)

/**
 * Fuente de frames de camara y, opcionalmente, de anclaje al mundo.
 *
 * Es la abstraccion que implementa la decision B (ver docs/decision-arquitectura.md): la
 * app funciona con ARCore y sin el, y el resto del codigo no distingue cual esta detras.
 */
interface ArDriver {

    /** true si este driver detecta superficies y puede anclar. */
    val supportsPlanes: Boolean

    /** true cuando ya hay al menos una superficie detectada, para la UI del paso ESCANEAR. */
    val hasSurface: Boolean

    val previewWidth: Int
    val previewHeight: Int

    fun start(cameraTextureId: Int, viewportWidth: Int, viewportHeight: Int)

    /** Llamar en el hilo GL una vez por frame. null si todavia no hay frame nuevo. */
    fun update(): FrameUpdate?

    /**
     * Intenta anclar en el punto de pantalla dado. Devuelve false si no hay superficie
     * ahi, o si el driver no soporta planos -en ese caso la colocacion la lleva Dart-.
     */
    fun placeAt(screenX: Float, screenY: Float): Boolean

    fun setTorch(on: Boolean): Boolean

    fun stop()
}
