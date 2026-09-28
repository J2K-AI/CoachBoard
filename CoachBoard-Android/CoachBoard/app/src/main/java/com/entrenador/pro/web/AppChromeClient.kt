package com.entrenador.pro.web

import android.app.Activity
import android.net.Uri
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog

/**
 * Diálogos nativos para la página.
 *
 * Sin esto, `confirm()` y `prompt()` no hacen nada dentro de un WebView
 * y acciones como anotar una incidencia o confirmar un cambio se
 * quedarían mudas.
 */
class AppChromeClient(
    private val activity: Activity,
    private val pedirArchivo: (ValueCallback<Array<Uri>>, WebChromeClient.FileChooserParams) -> Boolean
) : WebChromeClient() {

    override fun onJsAlert(view: WebView?, url: String?, message: String?, result: JsResult): Boolean {
        AlertDialog.Builder(activity)
            .setMessage(message)
            .setPositiveButton("Entendido") { _, _ -> result.confirm() }
            .setOnCancelListener { result.cancel() }
            .show()
        return true
    }

    override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult): Boolean {
        AlertDialog.Builder(activity)
            .setMessage(message)
            .setPositiveButton("Sí") { _, _ -> result.confirm() }
            .setNegativeButton("No") { _, _ -> result.cancel() }
            .setOnCancelListener { result.cancel() }
            .show()
        return true
    }

    override fun onJsPrompt(
        view: WebView?, url: String?, message: String?,
        defaultValue: String?, result: JsPromptResult
    ): Boolean {
        val input = EditText(activity)
        input.setText(defaultValue ?: "")
        input.setSelection(input.text.length)
        AlertDialog.Builder(activity)
            .setMessage(message)
            .setView(input)
            .setPositiveButton("Aceptar") { _, _ -> result.confirm(input.text.toString()) }
            .setNegativeButton("Cancelar") { _, _ -> result.cancel() }
            .setOnCancelListener { result.cancel() }
            .show()
        return true
    }

    override fun onShowFileChooser(
        view: WebView?,
        callback: ValueCallback<Array<Uri>>,
        params: FileChooserParams
    ): Boolean {
        return try {
            pedirArchivo(callback, params)
        } catch (e: Exception) {
            Toast.makeText(activity, "No se ha podido abrir el selector de archivos", Toast.LENGTH_LONG).show()
            false
        }
    }
}
