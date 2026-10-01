package com.entrenador.pro.web

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.entrenador.pro.avisos.Avisos
import com.entrenador.pro.io.FileSaver
import com.entrenador.pro.io.PagePrinter

/**
 * Objeto que la página ve como `AndroidApp`.
 *
 * Solo traduce peticiones: no contiene lógica de la aplicación. Cada
 * método salta al hilo de interfaz porque el WebView invoca estos
 * métodos desde su propio hilo de JavaScript.
 */
class JsBridge(
    private val activity: Activity,
    private val webProvider: () -> android.webkit.WebView,
    private val pedirPermisoAvisos: () -> Unit = {}
) {

    @JavascriptInterface
    fun printPage(title: String) {
        activity.runOnUiThread {
            PagePrinter.print(activity, webProvider(), PagePrinter.limpiarNombre(title))
        }
    }

    @JavascriptInterface
    fun saveFile(name: String, mime: String, base64: String) {
        activity.runOnUiThread { FileSaver.toDownloads(activity, name, mime, base64) }
    }

    @JavascriptInterface
    fun share(name: String, mime: String, base64: String) {
        activity.runOnUiThread { FileSaver.share(activity, name, mime, base64) }
    }

    @JavascriptInterface
    fun shareWithText(name: String, mime: String, base64: String, text: String) {
        activity.runOnUiThread { FileSaver.share(activity, name, mime, base64, text) }
    }

    /* --- recordatorios ------------------------------------------ */

    @JavascriptInterface
    fun scheduleReminders(json: String) {
        activity.runOnUiThread { Avisos.programar(activity, json) }
    }

    /** ¿Puede la aplicacion mostrar notificaciones ahora mismo? */
    @JavascriptInterface
    fun notificationsAllowed(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return NotificationManagerCompat.from(activity).areNotificationsEnabled()
        }
        return ContextCompat.checkSelfPermission(
            activity, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    @JavascriptInterface
    fun askNotifications() {
        activity.runOnUiThread { pedirPermisoAvisos() }
    }

    /**
     * Abre unas coordenadas en la aplicacion de mapas del telefono.
     *
     * Se intenta primero el esquema `geo:`, que deja elegir entre las
     * apps instaladas. Si el telefono no tiene ninguna, se recurre a
     * la web. No se usa `resolveActivity` a proposito: desde Android
     * 11 exigiria declarar `<queries>` en el manifiesto, y un
     * try/catch resuelve lo mismo sin pedir mas visibilidad.
     */
    @JavascriptInterface
    fun openMap(lat: String, lon: String, label: String) {
        activity.runOnUiThread {
            val punto = "$lat,$lon"
            val nombre = Uri.encode(label.ifBlank { "Destino" })
            val geo = Uri.parse("geo:$punto?q=$punto($nombre)")
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, geo))
            } catch (e: ActivityNotFoundException) {
                val web = Uri.parse("https://www.openstreetmap.org/?mlat=$lat&mlon=$lon#map=17/$lat/$lon")
                try {
                    activity.startActivity(Intent(Intent.ACTION_VIEW, web))
                } catch (e2: ActivityNotFoundException) {
                    Toast.makeText(activity, "No hay ninguna aplicacion de mapas", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
