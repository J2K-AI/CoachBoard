# El puente con JavaScript se invoca por reflexión desde el WebView:
# sus métodos no pueden renombrarse ni eliminarse.
-keepclassmembers class com.entrenador.pro.web.JsBridge {
    public *;
}
-keepattributes JavascriptInterface

# La página también llama a métodos anotados en cualquier interfaz
# registrada con addJavascriptInterface.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
