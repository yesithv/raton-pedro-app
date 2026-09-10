package com.ironcoding.perezar.analysis

import android.opengl.GLES11Ext
import android.opengl.GLES30
import com.ironcoding.perezar.ar.LightEstimate
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Umbrales y constantes de la receta. Ver docs/receta-grading.md. */
data class GradingConfig(
    var key: Float = 1.15f,
    var whiteBalance: Float = 0.5f,
    var exposureMin: Float = 0.5f,
    var exposureMax: Float = 1.4f,
    var grainMin: Float = 0.015f,
    var grainMax: Float = 0.09f,
    var smoothing: Float = 0.15f,
)

/**
 * Puerto de web/js/analyzer.js. Mide el color medio y el ruido del feed bajo el personaje
 * y resuelve los uniforms de grading.
 *
 * Solo se usa cuando el driver no estima luz. Con ARCore, LightEstimate entrega lo mismo
 * de balde. Los dos caminos producen los mismos uniforms, asi que el compositor no se
 * entera de cual esta activo.
 */
class SceneAnalyzer {

    val config = GradingConfig()

    private var program = 0
    private var uTex = 0
    private var uRect = 0
    private var fbo = 0
    private var texture = 0
    private var quad = 0

    private val pixels: ByteBuffer =
        ByteBuffer.allocateDirect(SIZE * SIZE * 4).order(ByteOrder.nativeOrder())

    private var exposure: FloatArray? = null
    private var grain: Float? = null

    /** Ganancia cruda antes de recortar, para poder avisar de que esta tocando el rango. */
    var rawExposure = 1f; private set

    var referenceColor = floatArrayOf(0.5f, 0.5f, 0.5f)

    fun init() {
        program = link(VERT, FRAG)
        uTex = GLES30.glGetUniformLocation(program, "uTex")
        uRect = GLES30.glGetUniformLocation(program, "uRect")

        val tex = IntArray(1)
        GLES30.glGenTextures(1, tex, 0)
        texture = tex[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture)
        GLES30.glTexImage2D(
            GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, SIZE, SIZE, 0,
            GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null,
        )
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_NEAREST)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_NEAREST)

        val ids = IntArray(1)
        GLES30.glGenFramebuffers(1, ids, 0)
        fbo = ids[0]
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo)
        GLES30.glFramebufferTexture2D(
            GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0,
            GLES30.GL_TEXTURE_2D, texture, 0,
        )
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)

        val data = floatArrayOf(-1f, -1f, 3f, -1f, -1f, 3f)
        val buffer = ByteBuffer.allocateDirect(data.size * 4)
            .order(ByteOrder.nativeOrder()).asFloatBuffer().put(data).also { it.position(0) }
        val bufIds = IntArray(1)
        GLES30.glGenBuffers(1, bufIds, 0)
        quad = bufIds[0]
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quad)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, data.size * 4, buffer, GLES30.GL_STATIC_DRAW)
    }

    /**
     * Mide sobre un recorte de la camara a resolucion NATIVA, no sobre un mip.
     *
     * La arquitectura decia que SceneAnalyzer podia correr sobre un mip de 128x128. Para
     * la LUMINANCIA vale y es barato; para el RUIDO no: un mip es un filtro paso-bajo y
     * promedia exactamente la senal que se quiere estimar. Por eso [uvRect] se toma como
     * una ventana de SIZE x SIZE texels centrada en la zona donde cae el personaje, y no
     * como la region entera reducida.
     *
     * @param uvRect [x0, y0, x1, y1] en coords de textura de camara.
     */
    fun measure(cameraTextureId: Int, uvRect: FloatArray) {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo)
        GLES30.glViewport(0, 0, SIZE, SIZE)
        GLES30.glUseProgram(program)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTextureId)
        GLES30.glUniform1i(uTex, 0)
        GLES30.glUniform4fv(uRect, 1, uvRect, 0)

        val loc = GLES30.glGetAttribLocation(program, "aPos")
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quad)
        GLES30.glEnableVertexAttribArray(loc)
        GLES30.glVertexAttribPointer(loc, 2, GLES30.GL_FLOAT, false, 0, 0)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, 3)
        GLES30.glDisableVertexAttribArray(loc)

        // glReadPixels bloquea el pipeline. A 96x96 y una vez cada 10 frames es asumible;
        // si apareciera en el perfilado, la salida es un PBO con lectura asincrona.
        pixels.position(0)
        GLES30.glReadPixels(0, 0, SIZE, SIZE, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, pixels)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)

        solve()
    }

    private fun solve() {
        val n = SIZE * SIZE
        val luma = FloatArray(n)
        var sr = 0f; var sg = 0f; var sb = 0f

        pixels.position(0)
        for (i in 0 until n) {
            val r = (pixels.get(i * 4).toInt() and 0xFF) / 255f
            val g = (pixels.get(i * 4 + 1).toInt() and 0xFF) / 255f
            val b = (pixels.get(i * 4 + 2).toInt() and 0xFF) / 255f
            sr += r; sg += g; sb += b
            luma[i] = LUMA_R * r + LUMA_G * g + LUMA_B * b
        }
        val sceneRgb = floatArrayOf(sr / n, sg / n, sb / n)
        val sceneLuma = LUMA_R * sceneRgb[0] + LUMA_G * sceneRgb[1] + LUMA_B * sceneRgb[2]

        // Paso-alto 3x3 y MAD, no desviacion estandar: la desviacion estandar cuenta los
        // bordes reales de la escena como si fueran ruido y sobreestima el sigma.
        val hp = ArrayList<Float>((SIZE - 2) * (SIZE - 2))
        for (y in 1 until SIZE - 1) {
            for (x in 1 until SIZE - 1) {
                val i = y * SIZE + x
                val lo = 0.25f * (luma[i - 1] + luma[i + 1] + luma[i - SIZE] + luma[i + SIZE])
                hp.add(luma[i] - lo)
            }
        }
        val med = median(hp)
        val sigma = median(ArrayList(hp.map { abs(it - med) })) * 1.4826f

        val refLuma = max(
            LUMA_R * referenceColor[0] + LUMA_G * referenceColor[1] + LUMA_B * referenceColor[2],
            1e-3f,
        )
        rawExposure = sceneLuma * config.key / refLuma
        val gain = min(config.exposureMax, max(config.exposureMin, rawExposure))

        // Dominante de color normalizada para ser neutra en luma: aporta el tinte y nunca
        // el brillo, de modo que el clamp de exposicion sigue controlando el brillo solo.
        val target = FloatArray(3) { i ->
            val cast = (sceneRgb[i] / max(sceneLuma, 1e-3f)) /
                max(referenceColor[i] / refLuma, 1e-3f)
            val clamped = min(CAST_MAX, max(CAST_MIN, cast))
            gain * (1f - config.whiteBalance + config.whiteBalance * clamped)
        }
        val targetGrain = min(config.grainMax, max(config.grainMin, sigma))

        // EMA. Sin esto los uniforms saltan en escalon cada 10 frames y el personaje
        // parpadea de brillo, que delata mas que no igualar nada.
        val k = config.smoothing
        exposure = exposure?.let { prev -> FloatArray(3) { prev[it] + k * (target[it] - prev[it]) } }
            ?: target
        grain = grain?.let { it + k * (targetGrain - it) } ?: targetGrain
    }

    fun latest(): LightEstimate? {
        val e = exposure ?: return null
        return LightEstimate(e, grain ?: 0f)
    }

    private fun median(values: ArrayList<Float>): Float {
        if (values.isEmpty()) return 0f
        values.sort()
        val mid = values.size / 2
        return if (values.size % 2 == 1) values[mid] else (values[mid - 1] + values[mid]) / 2f
    }

    private fun link(vertSource: String, fragSource: String): Int {
        fun compile(type: Int, src: String): Int {
            val s = GLES30.glCreateShader(type)
            GLES30.glShaderSource(s, src)
            GLES30.glCompileShader(s)
            val status = IntArray(1)
            GLES30.glGetShaderiv(s, GLES30.GL_COMPILE_STATUS, status, 0)
            check(status[0] != 0) { "SceneAnalyzer shader:\n${GLES30.glGetShaderInfoLog(s)}" }
            return s
        }
        val p = GLES30.glCreateProgram()
        GLES30.glAttachShader(p, compile(GLES30.GL_VERTEX_SHADER, vertSource))
        GLES30.glAttachShader(p, compile(GLES30.GL_FRAGMENT_SHADER, fragSource))
        GLES30.glLinkProgram(p)
        return p
    }

    fun release() {
        if (program != 0) GLES30.glDeleteProgram(program)
        if (fbo != 0) GLES30.glDeleteFramebuffers(1, intArrayOf(fbo), 0)
        if (texture != 0) GLES30.glDeleteTextures(1, intArrayOf(texture), 0)
        if (quad != 0) GLES30.glDeleteBuffers(1, intArrayOf(quad), 0)
    }

    private companion object {
        /** Ventana a resolucion nativa. Suficiente para una MAD estable y barata de leer. */
        const val SIZE = 96
        const val LUMA_R = 0.2126f
        const val LUMA_G = 0.7152f
        const val LUMA_B = 0.0722f
        const val CAST_MIN = 0.6f
        const val CAST_MAX = 1.7f

        const val VERT = """#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
"""

        const val FRAG = """#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision highp float;
uniform samplerExternalOES uTex;
uniform vec4 uRect;              // x0, y0, x1, y1 en coords de textura de camara
in vec2 vUV;
out vec4 fragColor;
void main() {
    vec2 uv = mix(uRect.xy, uRect.zw, vUV);
    fragColor = vec4(texture(uTex, uv).rgb, 1.0);
}
"""
    }
}
