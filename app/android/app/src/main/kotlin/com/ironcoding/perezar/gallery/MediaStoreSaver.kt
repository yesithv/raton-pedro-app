package com.ironcoding.perezar.gallery

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

/**
 * Guardado en la galeria del sistema y hoja de compartir.
 *
 * Sin esto el producto no existe: el video se graba en el directorio privado de la app,
 * donde el usuario no puede verlo ni mandarlo. La app de referencia lo resuelve con un
 * "Video Saved to Gallery" nada mas terminar, y es lo correcto: el padre no quiere
 * gestionar archivos, quiere abrir WhatsApp.
 *
 * Dos caminos porque minSdk es 24:
 *   - API 29+ : MediaStore con almacenamiento por ambito. Sin permisos.
 *   - API 24-28: escritura directa a Movies/ y notificacion al MediaScanner, que exige
 *                WRITE_EXTERNAL_STORAGE (declarado con maxSdkVersion=28 en el manifest).
 */
object MediaStoreSaver {

    private const val ALBUM = "Ratón Pérez"

    fun saveVideo(context: Context, sourcePath: String, displayName: String): Uri =
        save(context, sourcePath, displayName, "video/mp4",
             MediaStore.Video.Media.EXTERNAL_CONTENT_URI, Environment.DIRECTORY_MOVIES)

    fun saveImage(context: Context, sourcePath: String, displayName: String): Uri =
        save(context, sourcePath, displayName, "image/png",
             MediaStore.Images.Media.EXTERNAL_CONTENT_URI, Environment.DIRECTORY_PICTURES)

    private fun save(
        context: Context,
        sourcePath: String,
        displayName: String,
        mimeType: String,
        collection: Uri,
        directory: String,
    ): Uri {
        val source = File(sourcePath)
        require(source.exists() && source.length() > 0) { "no hay nada que guardar en $sourcePath" }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return saveLegacy(
            context, source, displayName, mimeType, directory,
        )

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "$directory/$ALBUM")
            // IS_PENDING oculta el archivo de la galeria mientras se copia. Sin esto, una
            // app de galeria puede indexarlo a medias y mostrar un video corrupto.
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        val resolver = context.contentResolver
        val uri = resolver.insert(collection, values)
            ?: error("MediaStore rechazo la insercion")

        try {
            resolver.openOutputStream(uri)?.use { out -> source.inputStream().use { it.copyTo(out) } }
                ?: error("no pude abrir el destino en MediaStore")
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }

        resolver.update(uri, ContentValues().apply {
            put(MediaStore.MediaColumns.IS_PENDING, 0)
        }, null, null)
        return uri
    }

    /**
     * Camino para API 24-28: copiar al directorio publico e insertar la fila a mano.
     *
     * Se inserta en MediaStore en vez de avisar al MediaScanner, y no es un capricho: el
     * scanner solo notifica por callback asincrono, mientras que la insercion devuelve
     * el content:// al momento. Y hace falta un content://, porque compartir un file://
     * lanza FileUriExposedException desde API 24 -justo el minimo de esta app-.
     *
     * DATA esta obsoleta desde API 29, pero este camino no se ejecuta ahi.
     */
    @Suppress("DEPRECATION")
    private fun saveLegacy(
        context: Context,
        source: File,
        displayName: String,
        mimeType: String,
        directory: String,
    ): Uri {
        val album = File(Environment.getExternalStoragePublicDirectory(directory), ALBUM)
        album.mkdirs()
        val target = File(album, displayName)
        source.inputStream().use { input -> target.outputStream().use { input.copyTo(it) } }

        val collection = if (mimeType.startsWith("video/")) {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.DATA, target.absolutePath)
            put(MediaStore.MediaColumns.SIZE, target.length())
        }
        return context.contentResolver.insert(collection, values)
            ?: error("MediaStore rechazo la insercion heredada")
    }

    /**
     * Abre el archivo en la app de galería del usuario.
     *
     * Mejor que embeber un reproductor: la galería del teléfono ya sabe reproducir,
     * compartir y borrar, y el video está justo ahí. Embeber uno añadiría ExoPlayer al
     * APK para hacer peor lo que el sistema ya hace bien.
     */
    fun openInGallery(context: Context, uri: Uri, mimeType: String) {
        context.startActivity(
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            },
        )
    }

    /** Hoja de compartir del sistema. */
    fun share(context: Context, uri: Uri, mimeType: String, title: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(
            Intent.createChooser(intent, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
