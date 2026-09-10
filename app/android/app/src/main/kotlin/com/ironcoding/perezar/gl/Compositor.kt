package com.ironcoding.perezar.gl

import android.content.Context
import android.opengl.GLES11Ext
import android.opengl.GLES30
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Parametros de grading que resuelve SceneAnalyzer o ARCore. Ver docs/receta-grading.md. */
data class GradingParams(
    val exposure: FloatArray = floatArrayOf(1f, 1f, 1f),   // vec3: iguala tambien la dominante
    val grain: Float = 0.03f,
    val softness: Float = 0.8f,
    val limitedRange: Boolean = false,
)

/** Rectangulo del overlay en coordenadas de PANTALLA normalizadas. */
data class OverlayRect(
    val originX: Float, val originY: Float,
    val scaleX: Float, val scaleY: Float,
)

/**
 * Compositor GL. Es el puerto directo de web/js/compositor.js, y consume el MISMO
 * shaders/composite.{vert,frag} -copiado a assets/ por el build- con OVERLAY_EXTERNAL
 * definido.
 */
class Compositor(private val context: Context) {

    private var program = 0
    private val uniforms = HashMap<String, Int>()

    var cameraTextureId = 0; private set
    var overlayTextureId = 0; private set

    private var fbo = 0
    private var fboTexture = 0
    private var fboW = 0
    private var fboH = 0

    private var quad = 0
    private var blitProgram = 0
    private var blitTexUniform = 0

    private val identity = floatArrayOf(1f,0f,0f,0f, 0f,1f,0f,0f, 0f,0f,1f,0f, 0f,0f,0f,1f)

    fun init() {
        val vert = readAsset("shaders/composite.vert")
        val frag = readAsset("shaders/composite.frag")

        // En Android el overlay llega de MediaCodec por una SurfaceTexture, que es una
        // textura OES externa igual que la camara. La macro selecciona ese camino dentro
        // del mismo archivo de shader que usa el prototipo web.
        program = link(vert, injectDefine(frag, "OVERLAY_EXTERNAL"))
        for (name in UNIFORM_NAMES) {
            uniforms[name] = GLES30.glGetUniformLocation(program, name)
        }

        blitProgram = link(BLIT_VERT, BLIT_FRAG)
        blitTexUniform = GLES30.glGetUniformLocation(blitProgram, "uTex")

        cameraTextureId = createExternalTexture()
        overlayTextureId = createExternalTexture()
        quad = createFullscreenTriangle()
    }

    /** Inserta el #define despues de la linea #version, que debe ir siempre primero. */
    private fun injectDefine(source: String, name: String): String {
        val newline = source.indexOf('\n')
        return source.substring(0, newline + 1) + "#define $name 1\n" + source.substring(newline + 1)
    }

    private fun createExternalTexture(): Int {
        val ids = IntArray(1)
        GLES30.glGenTextures(1, ids, 0)
        val target = GLES11Ext.GL_TEXTURE_EXTERNAL_OES
        GLES30.glBindTexture(target, ids[0])
        // CLAMP_TO_EDGE es obligatorio: con REPEAT los taps del blur en la costura del
        // empaquetado envolverian de la mitad del matte a la del color por el otro lado.
        GLES30.glTexParameteri(target, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(target, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(target, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(target, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        return ids[0]
    }

    fun resize(width: Int, height: Int) {
        if (width == fboW && height == fboH) return
        releaseFbo()
        fboW = width
        fboH = height

        val tex = IntArray(1)
        GLES30.glGenTextures(1, tex, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex[0])
        GLES30.glTexImage2D(
            GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, width, height, 0,
            GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null,
        )
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        fboTexture = tex[0]

        val ids = IntArray(1)
        GLES30.glGenFramebuffers(1, ids, 0)
        fbo = ids[0]
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo)
        GLES30.glFramebufferTexture2D(
            GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0,
            GLES30.GL_TEXTURE_2D, fboTexture, 0,
        )
        check(GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER) == GLES30.GL_FRAMEBUFFER_COMPLETE) {
            "FBO incompleto a $width x $height"
        }
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    /**
     * Compone camara + overlay en el FBO. Un solo pase.
     *
     * @param camXform      Matriz de coordenadas del feed. Con Camera2 viene de
     *                      SurfaceTexture.getTransformMatrix() -rotacion del sensor,
     *                      volteo de la frontal-; con ARCore se deriva de
     *                      transformCoordinates2d().
     * @param overlayXform  lo mismo para la salida del decoder. Suele ser identidad pero
     *                      hay dispositivos que devuelven un volteo o un recorte de borde.
     * @param overlaySize   tamano del atlas empaquetado en pixeles, del JSON del asset.
     * @param visible       false en los pasos del asistente que no muestran al personaje.
     */
    fun compose(
        camXform: FloatArray,
        overlayXform: FloatArray,
        overlaySize: Pair<Int, Int>,
        camUvScale: FloatArray,
        camUvOffset: FloatArray,
        rect: OverlayRect,
        params: GradingParams,
        timeSec: Float,
        visible: Boolean,
    ) {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo)
        GLES30.glViewport(0, 0, fboW, fboH)
        GLES30.glUseProgram(program)

        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTextureId)
        GLES30.glUniform1i(uniforms["uCamera"]!!, 0)

        GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
        GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, overlayTextureId)
        GLES30.glUniform1i(uniforms["uOverlay"]!!, 1)

        GLES30.glUniformMatrix4fv(uniforms["uCamXform"]!!, 1, false, camXform, 0)
        GLES30.glUniformMatrix4fv(uniforms["uOverlayXform"]!!, 1, false, overlayXform, 0)
        GLES30.glUniform2f(
            uniforms["uOverlayTexel"]!!,
            1f / overlaySize.first, 1f / overlaySize.second,
        )

        // El ajuste "cover" lo decide el driver: con ARCore la propia matriz de
        // coordenadas ya mapea la textura al viewport, y aqui va la identidad.
        GLES30.glUniform2f(uniforms["uCamUVScale"]!!, camUvScale[0], camUvScale[1])
        GLES30.glUniform2f(uniforms["uCamUVOffset"]!!, camUvOffset[0], camUvOffset[1])

        // Fuera de pantalla en vez de un uniform de visibilidad: el shader ya descarta
        // cualquier fragmento cuyo ouv caiga fuera de [0,1].
        val ox = if (visible) rect.originX else 10f
        val oy = if (visible) rect.originY else 10f
        GLES30.glUniform2f(uniforms["uOverlayOrigin"]!!, ox, oy)
        GLES30.glUniform2f(uniforms["uOverlayScale"]!!, rect.scaleX, rect.scaleY)
        GLES30.glUniform2f(uniforms["uGyroOffset"]!!, 0f, 0f)  // seccion 0.4, aun sin usar

        GLES30.glUniform3fv(uniforms["uExposureMatch"]!!, 1, params.exposure, 0)
        GLES30.glUniform1f(uniforms["uGrainAmount"]!!, params.grain)
        GLES30.glUniform1f(uniforms["uSoftness"]!!, params.softness)
        GLES30.glUniform1f(uniforms["uTime"]!!, timeSec)
        GLES30.glUniform1i(uniforms["uLimitedRange"]!!, if (params.limitedRange) 1 else 0)

        drawQuad(program)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    /** Presenta el FBO ya compuesto en la EGLSurface que este activa. Barato. */
    fun blitToCurrentSurface(width: Int, height: Int) {
        GLES30.glViewport(0, 0, width, height)
        GLES30.glUseProgram(blitProgram)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, fboTexture)
        GLES30.glUniform1i(blitTexUniform, 0)
        drawQuad(blitProgram)
    }

    private fun drawQuad(prog: Int) {
        val loc = GLES30.glGetAttribLocation(prog, "aPos")
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quad)
        GLES30.glEnableVertexAttribArray(loc)
        GLES30.glVertexAttribPointer(loc, 2, GLES30.GL_FLOAT, false, 0, 0)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, 3)
        GLES30.glDisableVertexAttribArray(loc)
    }

    private fun createFullscreenTriangle(): Int {
        // Un solo triangulo que cubre el viewport: menos vertices y sin costura diagonal
        // en el centro, que con blur puede notarse.
        val data = floatArrayOf(-1f, -1f, 3f, -1f, -1f, 3f)
        val buffer = ByteBuffer.allocateDirect(data.size * 4)
            .order(ByteOrder.nativeOrder()).asFloatBuffer().put(data).also { it.position(0) }
        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, ids[0])
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, data.size * 4, buffer, GLES30.GL_STATIC_DRAW)
        return ids[0]
    }

    private fun link(vertSource: String, fragSource: String): Int {
        val prog = GLES30.glCreateProgram()
        GLES30.glAttachShader(prog, compile(GLES30.GL_VERTEX_SHADER, vertSource))
        GLES30.glAttachShader(prog, compile(GLES30.GL_FRAGMENT_SHADER, fragSource))
        GLES30.glLinkProgram(prog)
        val status = IntArray(1)
        GLES30.glGetProgramiv(prog, GLES30.GL_LINK_STATUS, status, 0)
        check(status[0] != 0) { "El programa no linkea:\n${GLES30.glGetProgramInfoLog(prog)}" }
        return prog
    }

    private fun compile(type: Int, source: String): Int {
        val shader = GLES30.glCreateShader(type)
        GLES30.glShaderSource(shader, source)
        GLES30.glCompileShader(shader)
        val status = IntArray(1)
        GLES30.glGetShaderiv(shader, GLES30.GL_COMPILE_STATUS, status, 0)
        check(status[0] != 0) { "Shader no compila:\n${GLES30.glGetShaderInfoLog(shader)}\n$source" }
        return shader
    }

    private fun readAsset(path: String): String =
        context.assets.open(path).bufferedReader().use { it.readText() }

    private fun releaseFbo() {
        if (fbo != 0) GLES30.glDeleteFramebuffers(1, intArrayOf(fbo), 0)
        if (fboTexture != 0) GLES30.glDeleteTextures(1, intArrayOf(fboTexture), 0)
        fbo = 0
        fboTexture = 0
    }

    fun release() {
        releaseFbo()
        if (program != 0) GLES30.glDeleteProgram(program)
        if (blitProgram != 0) GLES30.glDeleteProgram(blitProgram)
        GLES30.glDeleteTextures(2, intArrayOf(cameraTextureId, overlayTextureId), 0)
        if (quad != 0) GLES30.glDeleteBuffers(1, intArrayOf(quad), 0)
    }

    companion object {
        private val UNIFORM_NAMES = listOf(
            "uCamera", "uOverlay", "uCamXform", "uOverlayXform", "uOverlayTexel",
            "uCamUVScale", "uCamUVOffset", "uOverlayOrigin", "uOverlayScale", "uGyroOffset",
            "uExposureMatch", "uGrainAmount", "uSoftness", "uTime", "uLimitedRange",
        )

        /** Ajuste "cover" del feed sobre la superficie. Devuelve [scaleX, scaleY, offX, offY]. */
        fun coverFit(srcW: Int, srcH: Int, dstW: Int, dstH: Int): FloatArray {
            val srcA = srcW.toFloat() / srcH
            val dstA = dstW.toFloat() / dstH
            return if (srcA > dstA) {
                val sx = dstA / srcA
                floatArrayOf(sx, 1f, (1f - sx) / 2f, 0f)
            } else {
                val sy = srcA / dstA
                floatArrayOf(1f, sy, 0f, (1f - sy) / 2f)
            }
        }

        private const val BLIT_VERT = """#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
"""

        private const val BLIT_FRAG = """#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUV;
out vec4 fragColor;
void main() { fragColor = texture(uTex, vUV); }
"""
    }
}
