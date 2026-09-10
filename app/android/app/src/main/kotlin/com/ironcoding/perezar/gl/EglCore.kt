package com.ironcoding.perezar.gl

import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.view.Surface

/**
 * Contexto EGL compartido por los dos destinos de presentacion.
 *
 * La regla de render de la seccion 2 de la arquitectura: un solo pase de shader, un solo
 * FBO, y dos EGLSurface que comparten contexto -la preview de Flutter y la input Surface
 * del encoder-. Renderizar dos veces duplicaria el coste del shader en gama baja, que es
 * justo donde no sobra.
 */
class EglCore {

    /**
     * Sin EGL_RECORDABLE_ANDROID el driver puede elegir un formato de buffer que el
     * encoder no sabe consumir. Falla tarde y de forma confusa: la preview se ve bien y
     * el mp4 sale verde o vacio.
     */
    private val recordableAndroid = 0x3142

    val display: EGLDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY).also {
        check(it != EGL14.EGL_NO_DISPLAY) { "No hay EGLDisplay" }
        val version = IntArray(2)
        check(EGL14.eglInitialize(it, version, 0, version, 1)) { "eglInitialize fallo" }
    }

    private val config: EGLConfig = run {
        val attrs = intArrayOf(
            EGL14.EGL_RED_SIZE, 8,
            EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT or 0x0040, // + ES3
            recordableAndroid, 1,
            EGL14.EGL_NONE,
        )
        val configs = arrayOfNulls<EGLConfig>(1)
        val count = IntArray(1)
        check(EGL14.eglChooseConfig(display, attrs, 0, configs, 0, 1, count, 0) && count[0] > 0) {
            "Ningun EGLConfig compatible (¿sin EGL_RECORDABLE_ANDROID?)"
        }
        configs[0]!!
    }

    val context: EGLContext = EGL14.eglCreateContext(
        display, config, EGL14.EGL_NO_CONTEXT,
        intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE), 0,
    ).also { check(it != EGL14.EGL_NO_CONTEXT) { "eglCreateContext fallo" } }

    fun createWindowSurface(surface: Surface): EGLSurface = create(surface)

    fun createWindowSurface(texture: SurfaceTexture): EGLSurface = create(texture)

    private fun create(nativeWindow: Any): EGLSurface =
        EGL14.eglCreateWindowSurface(
            display, config, nativeWindow, intArrayOf(EGL14.EGL_NONE), 0,
        ).also { check(it != EGL14.EGL_NO_SURFACE) { "eglCreateWindowSurface fallo" } }

    fun makeCurrent(surface: EGLSurface) {
        check(EGL14.eglMakeCurrent(display, surface, surface, context)) { "eglMakeCurrent fallo" }
    }

    /**
     * Marca de tiempo de presentacion del frame.
     *
     * DEBE ser el timestamp del frame de CAMARA, nunca System.nanoTime(). Con wall clock
     * el mp4 sale con la duracion correcta pero la cadencia irregular: el reproductor
     * respeta los PTS y el resultado se ve a tirones aunque no se haya perdido un solo
     * frame. Ver seccion 4 de la arquitectura.
     */
    fun setPresentationTime(surface: EGLSurface, nanos: Long) {
        EGLExt.eglPresentationTimeANDROID(display, surface, nanos)
    }

    fun swapBuffers(surface: EGLSurface): Boolean = EGL14.eglSwapBuffers(display, surface)

    fun releaseSurface(surface: EGLSurface) {
        if (surface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, surface)
    }

    fun release() {
        EGL14.eglMakeCurrent(
            display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT,
        )
        EGL14.eglDestroyContext(display, context)
        EGL14.eglReleaseThread()
        EGL14.eglTerminate(display)
    }
}
