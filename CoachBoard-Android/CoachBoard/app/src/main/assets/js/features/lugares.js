/* =============================================================
   CoachBoard · features/lugares.js
   Buscador de campos e instalaciones.

   Usa Nominatim, el buscador de OpenStreetMap: no hace falta clave ni
   cuenta de nadie. A cambio hay que ser buen vecino con su servicio,
   así que solo se consulta cuando el entrenador pulsa Buscar, nunca
   tecla a tecla, y los resultados llevan su atribución.

   Es lo único de toda la aplicación que necesita internet. Si no hay
   red, se avisa y se puede escribir el nombre a mano como siempre.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;

  var API = "https://nominatim.openstreetmap.org/search";
  var ESPERA = 10000;                 // corta la consulta si tarda demasiado
  var destino = null;                 // { valor, onOk } de la edición en curso
  var ultimos = [];

  function url(texto) {
    return API + "?format=jsonv2&limit=8&addressdetails=1&accept-language=es" +
      "&q=" + encodeURIComponent(texto);
  }

  /* Nominatim devuelve el nombre en `name` y la dirección desglosada.
     Se arma algo que un entrenador reconozca: el campo y el pueblo. */
  function limpiar(r) {
    var a = r.address || {};
    var nombre = r.name || (r.display_name || "").split(",")[0] || "Sin nombre";
    var pueblo = a.city || a.town || a.village || a.municipality || a.county || "";
    var resto = (r.display_name || "").split(",").slice(1).join(",").trim();
    return {
      lugar: nombre,
      dir: resto || pueblo,
      pueblo: pueblo,
      lat: String(r.lat || ""),
      lon: String(r.lon || "")
    };
  }

  function elegir(actual, onOk) {
    destino = { valor: actual || {}, onOk: onOk };
    ultimos = [];
    pintar(actual && actual.lugar ? actual.lugar : "", null);
  }

  function pintar(texto, estado) {
    var v = destino ? destino.valor : {};
    var cuerpo =
      '<div class="row-x" style="gap:8px">' +
        '<input id="lqBusca" placeholder="Campo Municipal, polideportivo…" ' +
          'value="' + U.esc(texto || "") + '" style="flex:1" ' +
          'onkeydown="if(event.key===\'Enter\'){event.preventDefault();CB.lugares.buscar();}">' +
        '<button class="btn" onclick="CB.lugares.buscar()">' + U.svg("search") + '</button>' +
      '</div>';

    if (estado === "buscando") {
      cuerpo += '<p class="hint mt2">Buscando…</p>';
    } else if (estado === "sinred") {
      cuerpo += '<div class="empty mt2"><b>Sin conexión</b>' +
        'No se ha podido consultar el buscador. Escribe el nombre a mano y guarda: ' +
        'podrás añadir la ubicación más adelante.</div>';
    } else if (estado === "vacio") {
      cuerpo += '<div class="empty mt2"><b>Ningún resultado</b>' +
        'Prueba con el nombre del pueblo detrás, por ejemplo "Campo Municipal, Telde".</div>';
    } else if (ultimos.length) {
      cuerpo += '<div class="plist mt2">' + ultimos.map(function (r, i) {
        return '<div class="prow tap" onclick="CB.lugares.tomar(' + i + ')">' +
          '<span class="num-badge sm">' + U.svg("pin") + '</span>' +
          '<div class="pmain"><div class="nm">' + U.esc(r.lugar) + '</div>' +
          '<div class="sub">' + U.esc(r.dir) + '</div></div></div>';
      }).join("") + '</div>' +
      '<p class="hint mt1">Resultados de OpenStreetMap.</p>';
    } else {
      cuerpo += '<p class="hint mt2">Escribe el nombre del campo y pulsa buscar. ' +
        'Al elegirlo se guarda su ubicación y podrás abrirla en el mapa del móvil.</p>';
    }

    if (v.lugar) {
      cuerpo += '<div class="section mt3"><span class="eyebrow">Guardado ahora</span></div>' +
        '<div class="prow"><span class="num-badge sm">' + U.svg("pin") + '</span>' +
        '<div class="pmain"><div class="nm">' + U.esc(v.lugar) + '</div>' +
        '<div class="sub">' + U.esc(v.dir || (v.lat ? "con ubicación" : "sin ubicación")) + '</div></div></div>';
    }

    window.CB.shell.openSheet("Campo o instalación", cuerpo, [
      { text: "Cancelar", cls: "ghost", fn: function () { destino = null; window.CB.shell.closeSheet(); } },
      { text: "Usar lo escrito", cls: "", fn: aMano }
    ]);
    var i = U.$("lqBusca");
    if (i) i.focus();
  }

  /* Escribirlo a mano sigue valiendo: hay campos que no están en
     ningún mapa, y sin red esto es lo único que funciona. */
  function aMano() {
    var t = (U.val("lqBusca") || "").trim();
    if (!t) { U.toast("Escribe un nombre"); return; }
    entregar({ lugar: t, dir: "", lat: "", lon: "" });
  }

  function buscar() {
    var t = (U.val("lqBusca") || "").trim();
    if (t.length < 3) { U.toast("Escribe al menos tres letras"); return; }
    pintar(t, "buscando");

    var corta = null, ctrl = null;
    try {
      ctrl = new AbortController();
      corta = setTimeout(function () { ctrl.abort(); }, ESPERA);
    } catch (e) { ctrl = null; }

    fetch(url(t), ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (lista) {
        if (corta) clearTimeout(corta);
        if (!destino) return;                      // se cerró mientras tanto
        ultimos = (lista || []).map(limpiar);
        pintar(t, ultimos.length ? null : "vacio");
      })
      .catch(function () {
        if (corta) clearTimeout(corta);
        if (!destino) return;
        ultimos = [];
        pintar(t, "sinred");
      });
  }

  function tomar(i) {
    var r = ultimos[i];
    if (r) entregar(r);
  }

  function entregar(v) {
    var fn = destino ? destino.onOk : null;
    destino = null;
    window.CB.shell.closeSheet();
    if (fn) fn(v);
  }

  /* ---------------------------------------------------------
     Abrir en el mapa del dispositivo
     --------------------------------------------------------- */
  function abrir(lat, lon, nombre) {
    if (!lat || !lon) { U.toast("Este sitio no tiene ubicación guardada"); return; }
    if (typeof window.abrirMapa === "function") {
      window.abrirMapa(String(lat), String(lon), String(nombre || ""));
      return;
    }
    /* En el navegador del PC no hay app de mapas: se abre la web. */
    window.open("https://www.openstreetmap.org/?mlat=" + encodeURIComponent(lat) +
      "&mlon=" + encodeURIComponent(lon) + "#map=17/" + lat + "/" + lon, "_blank");
  }

  window.CB.lugares = {
    elegir: elegir, buscar: buscar, tomar: tomar, abrir: abrir, limpiar: limpiar
  };
})();
