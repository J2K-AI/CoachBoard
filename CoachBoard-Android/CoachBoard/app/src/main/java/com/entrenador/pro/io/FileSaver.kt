package com.entrenador.pro.io

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/**
 * Guarda y comparte los archivos que genera la aplicación web:
 * actas en texto, copias de seguridad y pizarras en PNG.
 *
 * El WebView no puede escribir por sí mismo en el almacenamiento del
 * teléfono, así que la página entrega los bytes en base64 y aquí se
 * depositan en la carpeta Descargas.
 */
object FileSaver {

    fun toDownloads(ctx: Context, name: String, mime: String, base64: String) {
        try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                guardarConMediaStore(ctx, name, mime, bytes)
            } else {
                guardarEnCarpetaPublica(name, bytes)
            }
            aviso(ctx, "Guardado en Descargas: $name")
        } catch (e: Exception) {
            aviso(ctx, "No se ha podido guardar: ${e.message}")
        }
    }

    private fun guardarConMediaStore(ctx: Context, name: String, mime: String, bytes: ByteArray) {
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mime)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = ctx.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("sin permiso de escritura")
        resolver.openOutputStream(uri)?.use { it.write(bytes) }
        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
    }

    @Suppress("DEPRECATION")
    private fun guardarEnCarpetaPublica(name: String, bytes: ByteArray) {
        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!dir.exists()) dir.mkdirs()
        FileOutputStream(File(dir, name)).use { it.write(bytes) }
    }

    /** Abre el diálogo de compartir del sistema con el archivo generado. */
    fun share(ctx: Context, name: String, mime: String, base64: String) {
        try {
            val dir = File(ctx.cacheDir, "compartir").apply { mkdirs() }
            val f = File(dir, name)
            FileOutputStream(f).use { it.write(Base64.decode(base64, Base64.DEFAULT)) }
            val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", f)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            ctx.startActivity(Intent.createChooser(intent, "Compartir"))
        } catch (e: Exception) {
            aviso(ctx, "No se ha podido compartir: ${e.message}")
        }
    }

    private fun aviso(ctx: Context, msg: String) {
        Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show()
    }
}
