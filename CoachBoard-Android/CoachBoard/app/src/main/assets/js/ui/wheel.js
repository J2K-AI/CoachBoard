/* =============================================================
   CoachBoard · ui/wheel.js
   Ruedas de selección como las del cronómetro del móvil: columnas
   que se arrastran con el dedo y encajan en el valor del centro.

   No lleva lógica de arrastre propia: es un contenedor con scroll
   vertical y `scroll-snap-type`, así que el desplazamiento y su
   inercia los pone el propio navegador. Eso es lo que hace que se
   sienta nativo en el móvil y que funcione igual con el ratón.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var M = window.CB.models;

  var ALTO = 38;          // alto de cada opción, en píxeles
  var VISIBLES = 5;       // opciones a la vista (impar: hay una centrada)
  var estado = null;      // { cols: {clave: [valores]}, onOk: fn }

  function rango(desde, hasta, paso) {
    var a = [];
    for (var v = desde; v <= hasta; v += (paso || 1)) a.push(v);
    return a;
  }

  /* Una columna. El relleno de arriba y abajo permite que la primera
     y la última opción lleguen al centro. */
  function columna(clave, valores, actual, titulo, sufijo) {
    var pad = ((VISIBLES - 1) / 2) * ALTO;
    var i = valores.indexOf(actual);
    if (i < 0) i = 0;
    return '<div class="wcol">' +
      '<div class="wlab">' + U.esc(titulo) + '</div>' +
      '<div class="wbox">' +
        '<div class="wsel"></div>' +
        '<div class="wheel" id="w-' + clave + '" data-clave="' + clave + '" data-i="' + i + '">' +
          '<div class="wpad" style="height:' + pad + 'px"></div>' +
          valores.map(function (v, k) {
            return '<div class="wop' + (k === i ? " on" : "") + '" data-k="' + k + '">' +
              v + (sufijo ? '<small>' + U.esc(sufijo) + '</small>' : "") + '</div>';
          }).join("") +
          '<div class="wpad" style="height:' + pad + 'px"></div>' +
        '</div>' +
      '</div></div>';
  }

  function conectar() {
    Object.keys(estado.cols).forEach(function (clave) {
      var el = U.$("w-" + clave);
      if (!el) return;
      el.scrollTop = parseInt(el.getAttribute("data-i"), 10) * ALTO;
      marcar(el);
      el.addEventListener("scroll", function () {
        clearTimeout(el._t);
        marcar(el);
        el._t = setTimeout(function () { marcar(el); }, 80);
      });
      /* Tocar una opción también la elige: más rápido que arrastrar
         cuando el valor está a la vista. */
      el.addEventListener("click", function (ev) {
        var op = ev.target.closest ? ev.target.closest(".wop") : null;
        if (!op) return;
        el.scrollTo({ top: parseInt(op.getAttribute("data-k"), 10) * ALTO, behavior: "smooth" });
      });
    });
  }

  function indice(el) {
    var i = Math.round(el.scrollTop / ALTO);
    var n = el.querySelectorAll(".wop").length;
    return Math.min(n - 1, Math.max(0, i));
  }

  function marcar(el) {
    var i = indice(el);
    if (String(i) === el.getAttribute("data-i")) return;
    el.setAttribute("data-i", i);
    var ops = el.querySelectorAll(".wop");
    for (var k = 0; k < ops.length; k++) ops[k].className = "wop" + (k === i ? " on" : "");
  }

  function leer() {
    var out = {};
    Object.keys(estado.cols).forEach(function (clave) {
      var el = U.$("w-" + clave);
      out[clave] = el ? estado.cols[clave][indice(el)] : estado.cols[clave][0];
    });
    return out;
  }

  /* ---------------------------------------------------------
     Duración de un partido
     --------------------------------------------------------- */
  function pedirDuracion(dur, onOk) {
    var d = M.normDur(dur);
    estado = {
      cols: { partes: rango(1, 6), min: rango(1, 60), desc: rango(0, 30) },
      onOk: onOk
    };

    var atajos = '<div class="chiprow mb2">' + M.FORMATOS.map(function (f, i) {
      return '<button class="chip" onclick="CB.wheel.formato(' + i + ')">' +
        U.esc(f.label) + '</button>';
    }).join("") + '</div>';

    var cuerpo = atajos +
      '<div class="wrow">' +
        columna("partes", estado.cols.partes, d.partes, "Partes", "") +
        columna("min", estado.cols.min, d.min, "Minutos", "min") +
        columna("desc", estado.cols.desc, d.desc, "Descanso", "min") +
      '</div>' +
      '<p class="hint mt2">Las prórrogas duran ' + d.prorroga + ' min cada una. ' +
        'El reloj cuenta seguido: la 2ª parte arranca en el minuto que le toque, no en cero.</p>';

    estado.prorroga = d.prorroga;

    window.CB.shell.openSheet("Duración del partido", cuerpo, [
      { text: "Cancelar", cls: "ghost", fn: function () { estado = null; window.CB.shell.closeSheet(); } },
      { text: "Aceptar", cls: "pri", fn: aceptar }
    ]);
    conectar();
  }

  /* Un atajo mueve las ruedas; no cierra la hoja, para poder retocar. */
  function formato(i) {
    var f = M.FORMATOS[i];
    if (!f || !estado) return;
    estado.prorroga = f.prorroga;
    [["partes", f.partes], ["min", f.min], ["desc", f.desc]].forEach(function (par) {
      var el = U.$("w-" + par[0]);
      if (!el) return;
      var k = estado.cols[par[0]].indexOf(par[1]);
      if (k < 0) return;
      el.scrollTo({ top: k * ALTO, behavior: "smooth" });
      setTimeout(function () { marcar(el); }, 260);
    });
    U.toast(f.label);
  }

  function aceptar() {
    var v = leer();
    var fn = estado ? estado.onOk : null;
    var pro = estado ? estado.prorroga : M.DUR_DEF.prorroga;
    estado = null;
    window.CB.shell.closeSheet();
    if (fn) fn(M.normDur({ partes: v.partes, min: v.min, desc: v.desc, prorroga: pro }));
  }

  window.CB.wheel = { pedirDuracion: pedirDuracion, formato: formato };
})();
