package com.entrenador.pro.web

import android.app.Activity
import android.webkit.JavascriptInterface
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
    private val webProvider: () -> android.webkit.WebView
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
}
