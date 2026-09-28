package com.entrenador.pro.web

import android.annotation.SuppressLint
import android.app.Activity
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.entrenador.pro.BuildConfig
import com.entrenador.pro.io.FileSaver

/**
 * Prepara el WebView donde vive CoachBoard.
 *
 * La aplicación se sirve por https://appassets.androidplatform.net en
 * lugar de file:// para que el almacenamiento local tenga un origen
 * estable: de lo contrario la plantilla y las actas se perderían entre
 * arranques.
 */
object WebAppHost {

    const val URL = "https://appassets.androidplatform.net/assets/index.html"

    @SuppressLint("SetJavaScriptEnabled")
    fun create(activity: Activity, chrome: AppChromeClient, bridge: JsBridge): WebView {
        val web = WebView(activity)
        web.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            builtInZoomControls = false
            displayZoomControls = false
            setSupportZoom(false)
            textZoom = 100
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_NO_CACHE
        }
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(activity))
            .build()

        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            override fun onPageFinished(view: WebView, url: String) {
                view.evaluateJavascript(BridgeScript.JS, null)
            }
        }

        web.webChromeClient = chrome
        web.addJavascriptInterface(bridge, "AndroidApp")

        /* Red de seguridad: si alguna descarga no pasa por el puente,
           se recoge aquí igualmente. */
        web.setDownloadListener { url, _, _, mime, _ ->
            if (url.startsWith("data:")) {
                val base64 = url.substringAfter(",", "")
                FileSaver.toDownloads(activity, "coachboard", mime ?: "application/octet-stream", base64)
            }
        }

        return web
    }
}
