/* =============================================================
   CoachBoard · features/citacion.js
   La convocatoria como una imagen para mandar al grupo del equipo.

   Se hace imagen y no texto porque en WhatsApp una foto se ve en el
   propio chat, sin abrir nada, y se reenvía tal cual. El texto va
   igualmente como pie del envío, para quien prefiera copiarlo.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;
  var M = window.CB.models;

  var ANCHO = 1080;
  var FUENTE = '-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
  var ultima = null;          // { url, blob, texto, nombre }

  function listas() {
    var mt = window.DB.match;
    if (!mt) return null;
    var nombre = function (id) {
      var j = S.jug(id);
      return j ? { d: j.dorsal || "–", n: j.nombre, orden: j.dorsal || 99 } : null;
    };
    /* Por dorsal: es como se lee una alineación y como la espera
       cualquiera que mire el mensaje. */
    var porDorsal = function (a, b) { return a.orden - b.orden; };
    var fuera = window.DB.jugadores
      .filter(function (j) { return mt.conv.indexOf(j.id) < 0; })
      .sort(function (a, b) { return (a.dorsal || 99) - (b.dorsal || 99); })
      .map(function (j) {
        return {
          d: j.dorsal || "–", n: j.nombre, orden: j.dorsal || 99,
          nota: j.estado !== "Disponible" ? j.estado : ""
        };
      });
    return {
      once: mt.campo.map(nombre).filter(Boolean).sort(porDorsal),
      banquillo: mt.banq.map(nombre).filter(Boolean).sort(porDorsal),
      fuera: fuera
    };
  }

  function cabecera() {
    var mt = window.DB.match;
    var e = mt ? S.ev(mt.ev) : null;
    var local = !e || e.cond !== "Visitante";
    return {
      club: S.club() || "Mi equipo",
      rival: (e && e.rival) || "Rival",
      local: local,
      fecha: e ? U.fmtDateLong(e.fecha) : "",
      hora: (e && e.hora) || "",
      lugar: (e && e.lugar) || "",
      dir: (e && e.dir) || "",
      comp: (e && (e.comp || e.tipo)) || "",
      dur: M.durTexto(mt && mt.dur)
    };
  }

  /* ---------------------------------------------------------
     Texto plano, que viaja como pie del envío
     --------------------------------------------------------- */
  function texto() {
    var c = cabecera(), l = listas();
    if (!l) return "";
    var fila = function (p) { return p.d + " " + p.n; };
    var t = c.club + " – " + c.rival + "\n";
    if (c.fecha) t += c.fecha + (c.hora ? " · " + c.hora : "") + "\n";
    if (c.lugar) t += c.lugar + (c.local ? "" : " (fuera)") + "\n";
    t += "\nONCE INICIAL\n" + l.once.map(fila).join("\n");
    if (l.banquillo.length) t += "\n\nBANQUILLO\n" + l.banquillo.map(fila).join("\n");
    if (l.fuera.length) {
      t += "\n\nNO CONVOCADOS\n" + l.fuera.map(function (p) {
        return fila(p) + (p.nota ? " (" + p.nota.toLowerCase() + ")" : "");
      }).join("\n");
    }
    return t;
  }

  /* ---------------------------------------------------------
     Imagen
     --------------------------------------------------------- */
  function bloqueAlto(n) {
    if (!n) return 0;
    return 58 + Math.ceil(n / 2) * 46 + 24;      // título + filas a dos columnas
  }

  function dibujar() {
    var c = cabecera(), l = listas();
    if (!l) return null;

    var alto = 300 + bloqueAlto(l.once.length) +
      bloqueAlto(l.banquillo.length) + bloqueAlto(l.fuera.length) + 64;
    var cv = document.createElement("canvas");
    cv.width = ANCHO; cv.height = alto;
    var g = cv.getContext("2d");

    g.fillStyle = "#0F1115"; g.fillRect(0, 0, ANCHO, alto);
    g.fillStyle = "#32D583"; g.fillRect(0, 0, ANCHO, 10);

    var x = 64, y = 86;

    g.fillStyle = "#9299A6";
    g.font = "700 24px " + FUENTE;
    g.fillText("CONVOCATORIA" + (c.comp ? "  ·  " + c.comp.toUpperCase() : ""), x, y);

    y += 62;
    g.fillStyle = "#F5F7FA";
    g.font = "800 52px " + FUENTE;
    var titulo = c.local ? c.club + "  vs  " + c.rival : c.rival + "  vs  " + c.club;
    encajar(g, titulo, ANCHO - 2 * x, 52, 34);
    g.fillText(titulo, x, y);

    y += 50;
    g.fillStyle = "#32D583";
    g.font = "650 28px " + FUENTE;
    var cuando = [c.fecha, c.hora].filter(Boolean).join("  ·  ");
    if (cuando) { g.fillText(cuando, x, y); y += 40; }

    if (c.lugar) {
      g.fillStyle = "#9299A6";
      g.font = "500 26px " + FUENTE;
      g.fillText(c.lugar + (c.local ? "" : "  (fuera)"), x, y);
      y += 38;
    }

    y += 18;
    y = bloque(g, x, y, "ONCE INICIAL", l.once, "#32D583");
    y = bloque(g, x, y, "BANQUILLO", l.banquillo, "#4C8DFF");
    y = bloque(g, x, y, "NO CONVOCADOS", l.fuera, "#9299A6");

    g.fillStyle = "#4A515E";
    g.font = "500 22px " + FUENTE;
    g.fillText(c.club + "  ·  " + c.dur, x, alto - 44);

    return cv;
  }

  /* Reduce el tamaño de letra hasta que el texto quepa a lo ancho. */
  function encajar(g, txt, max, desde, minimo) {
    var t = desde;
    while (t > minimo && g.measureText(txt).width > max) {
      t -= 2;
      g.font = "800 " + t + "px " + FUENTE;
    }
  }

  function bloque(g, x, y, titulo, gente, color) {
    if (!gente.length) return y;
    g.fillStyle = color;
    g.font = "700 24px " + FUENTE;
    g.fillText(titulo + "   " + gente.length, x, y);
    y += 46;

    var colAncho = (ANCHO - 2 * x) / 2;
    gente.forEach(function (p, i) {
      var cx = x + (i % 2) * colAncho;
      var cy = y + Math.floor(i / 2) * 46;
      g.fillStyle = "#1E222B";
      redondo(g, cx, cy - 26, 44, 34, 8);
      g.fillStyle = "#F5F7FA";
      g.font = "700 20px " + FUENTE;
      g.textAlign = "center";
      g.fillText(String(p.d), cx + 22, cy - 2);
      g.textAlign = "left";
      g.font = "500 24px " + FUENTE;
      g.fillStyle = p.nota ? "#9299A6" : "#F5F7FA";
      var nom = p.n + (p.nota ? " · " + p.nota.toLowerCase() : "");
      g.fillText(recortar(g, nom, colAncho - 70), cx + 58, cy);
    });
    return y + Math.ceil(gente.length / 2) * 46 + 36;
  }

  function recortar(g, txt, max) {
    if (g.measureText(txt).width <= max) return txt;
    var t = txt;
    while (t.length > 4 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
    return t + "…";
  }

  function redondo(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fill();
  }

  /* ---------------------------------------------------------
     Hoja
     --------------------------------------------------------- */
  function abrir() {
    var mt = window.DB.match;
    if (!mt) { U.toast("Convoca primero"); return; }
    if (!mt.campo.length) { U.toast("Coloca antes el once inicial"); return; }

    var cv = dibujar();
    if (!cv) return;
    var c = cabecera();
    var nombre = "citacion-" + (c.rival || "partido").replace(/[^\wÁÉÍÓÚÑáéíóúñ -]/g, "")
      .trim().replace(/\s+/g, "-").toLowerCase() + ".png";

    cv.toBlob(function (blob) {
      ultima = { url: cv.toDataURL("image/png"), blob: blob, texto: texto(), nombre: nombre };
      window.CB.shell.openSheet("Citación",
        '<p class="hint">Así se verá en el grupo del equipo.</p>' +
        '<img class="preview" src="' + ultima.url + '" alt="Convocatoria">',
        [
          { text: "Descargar", cls: "ghost", fn: descargar },
          { text: "Compartir", cls: "pri", fn: compartir }
        ]);
    }, "image/png");
  }

  function descargar() {
    if (!ultima) return;
    window.download(ultima.nombre, ultima.blob);
    U.toast("Imagen descargada");
  }

  function compartir() {
    if (!ultima) return;
    /* En el móvil se abre el selector del sistema con la imagen y el
       texto; en el PC no hay tal cosa, así que se descarga. */
    if (typeof window.compartirArchivoConTexto === "function") {
      window.compartirArchivoConTexto(ultima.nombre, ultima.blob, ultima.texto);
      window.CB.shell.closeSheet();
      return;
    }
    if (typeof window.compartirArchivo === "function") {
      window.compartirArchivo(ultima.nombre, ultima.blob);
      window.CB.shell.closeSheet();
      return;
    }
    descargar();
  }

  window.CB.citacion = {
    abrir: abrir, descargar: descargar, compartir: compartir,
    texto: texto, dibujar: dibujar, listas: listas
  };
})();
