package com.entrenador.pro.web

/**
 * Puente que se inyecta en la página cuando termina de cargar.
 *
 * Un WebView no sabe imprimir ni descargar archivos por su cuenta, así
 * que aquí se sustituyen `window.print` y `window.download` por
 * llamadas al contenedor nativo. La aplicación web sigue funcionando
 * igual en un navegador: si el puente no existe, usa su propia versión.
 */
object BridgeScript {

    val JS: String = """
        (function () {
          if (window.__coachboardReady) return;
          window.__coachboardReady = true;

          /* El sistema tarda en recoger la página al imprimir: damos
             margen antes de vaciar el área del documento. */
          window.PRINT_CLEAR_MS = 20000;

          window.print = function () {
            try { AndroidApp.printPage(document.title || 'CoachBoard'); }
            catch (e) { console.log('print', e); }
          };

          window.download = function (name, blob) {
            try {
              var r = new FileReader();
              r.onloadend = function () {
                var b64 = String(r.result).split(',')[1] || '';
                AndroidApp.saveFile(name, blob.type || 'application/octet-stream', b64);
              };
              r.readAsDataURL(blob);
            } catch (e) { console.log('download', e); }
          };

          window.abrirMapa = function (lat, lon, nombre) {
            try { AndroidApp.openMap(String(lat), String(lon), String(nombre || '')); }
            catch (e) { console.log('mapa', e); }
          };

          window.compartirArchivo = function (name, blob) {
            var r = new FileReader();
            r.onloadend = function () {
              AndroidApp.share(name, blob.type || 'application/octet-stream',
                               String(r.result).split(',')[1] || '');
            };
            r.readAsDataURL(blob);
          };
        })();
    """.trimIndent()

    /** El botón atrás cierra primero la hoja abierta; si no hay, sale. */
    val BACK_JS: String = """
        (function () {
          var s = document.getElementById('sheet');
          if (s && !s.classList.contains('hidden')) { s.classList.add('hidden'); return true; }
          return false;
        })();
    """.trimIndent()

    /** Guarda el estado antes de que el sistema detenga la actividad. */
    val SAVE_JS: String = "try{ CB.store.save(); }catch(e){}"
}
