package com.entrenador.pro

import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.entrenador.pro.web.AppChromeClient
import com.entrenador.pro.web.BridgeScript
import com.entrenador.pro.web.JsBridge
import com.entrenador.pro.web.WebAppHost

/**
 * CoachBoard.
 *
 * La actividad solo monta el contenedor y atiende el ciclo de vida.
 * La configuración del WebView está en web/WebAppHost, los diálogos en
 * web/AppChromeClient, el puente con la página en web/JsBridge y el
 * guardado de archivos en io/FileSaver.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val cb = fileCallback
        fileCallback = null
        cb?.onReceiveValue(
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // En la banda el móvil se sostiene en la mano: nada de apagones
        // en mitad de un partido.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val chrome = AppChromeClient(this) { callback, params ->
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            filePicker.launch(params.createIntent())
            true
        }
        val bridge = JsBridge(this) { web }

        web = WebAppHost.create(this, chrome, bridge)
        setContentView(web)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript(BridgeScript.BACK_JS) { valor ->
                    if (valor == "false") finish()
                }
            }
        })

        web.loadUrl(WebAppHost.URL)
    }

    override fun onPause() {
        super.onPause()
        // Asegura el guardado del partido en curso antes de que el
        // sistema nos detenga.
        web.evaluateJavascript(BridgeScript.SAVE_JS, null)
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        super.onDestroy()
    }
}
