/* =============================================================
   CoachBoard · features/reports.js
   Documentos imprimibles: acta del partido y ficha del jugador.
   La maqueta es A4; el sistema los convierte en PDF.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;
  var M = window.CB.models;

  function nombreEnActa(a, id) {
    var f = (a.jug || []).filter(function (x) { return x.j === id; })[0];
    if (f) return f.dorsal + " " + f.nombre;
    var j = S.jug(id);
    return j ? (j.dorsal + " " + j.nombre) : "-";
  }

  /* ---------------------------------------------------------
     Acta del partido
     --------------------------------------------------------- */
  function actaHtml(a) {
    var e = S.ev(a.ev) || {};
    var club = S.club();
    var rival = a.rival || "Rival";
    var local = e.cond !== "Visitante";
    var izq = local ? club : rival, der = local ? rival : club;
    var mIzq = local ? a.gf : a.gc, mDer = local ? a.gc : a.gf;

    var cab = [e.comp || e.tipo || "Partido", a.fecha ? U.fmtDate(a.fecha) : "", e.hora || "", e.lugar || "",
               e.cond ? "condición: " + e.cond.toLowerCase() : ""]
      .filter(Boolean).join(" &middot; ");

    var goles = (a.goles || []).slice().sort(function (x, y) { return x.min - y.min; });
    var filasGol = goles.length
      ? goles.map(function (g) {
          return '<tr><td class="n">' + g.min + "'</td>" +
            "<td>" + (g.eq === "A" ? U.esc(club) : U.esc(rival)) + "</td>" +
            "<td>" + (g.j ? U.esc(nombreEnActa(a, g.j)) : "&mdash;") + "</td>" +
            "<td>" + U.esc(g.tipo || "Jugada") + "</td>" +
            "<td>" + (g.a ? U.esc(nombreEnActa(a, g.a)) : "&mdash;") + "</td></tr>";
        }).join("")
      : '<tr><td colspan="5">Sin goles anotados con detalle. Resultado: ' + a.gf + " - " + a.gc + '.</td></tr>';

    var penaltis = function (id) {
      return goles.filter(function (g) { return g.j === id && g.tipo === "Penalti"; }).length;
    };
    var tit = a.titulares || [];
    var jj = a.jug.slice().sort(function (x, y) {
      return (tit.indexOf(y.j) >= 0 ? 1 : 0) - (tit.indexOf(x.j) >= 0 ? 1 : 0) || y.min - x.min;
    });
    var filasJug = jj.map(function (f) {
      var p = penaltis(f.j);
      return '<tr class="' + (tit.indexOf(f.j) >= 0 ? "start" : "") + '">' +
        '<td class="n">' + (f.dorsal || "") + "</td>" +
        "<td>" + U.esc(f.nombre || "") + "</td>" +
        "<td>" + U.esc(f.pos || (S.jug(f.j) || {}).pos || "") + "</td>" +
        "<td>" + (tit.indexOf(f.j) >= 0 ? "Titular" : "Suplente") + "</td>" +
        '<td class="n">' + f.min + "'</td>" +
        '<td class="n">' + (f.gol || 0) + (p ? " (" + p + " p.)" : "") + "</td>" +
        '<td class="n">' + (f.asi || 0) + "</td>" +
        '<td class="n">' + (f.fal || 0) + "</td>" +
        '<td class="n">' + (f.ta || 0) + "</td>" +
        '<td class="n">' + (f.tr ? "Sí" : "") + "</td>" +
        "<td>" + U.esc(f.st || "") + "</td></tr>";
    }).join("");

    var disc = a.jug.filter(function (f) { return f.ta || f.tr; });
    var filasDisc = disc.length
      ? disc.map(function (f) {
          return '<tr><td class="n">' + (f.dorsal || "") + "</td><td>" + U.esc(f.nombre) + "</td>" +
            "<td>" + (f.ta ? f.ta + " amarilla" + (f.ta > 1 ? "s" : "") : "&mdash;") + "</td>" +
            "<td>" + (f.tr ? "Expulsado" : "&mdash;") + "</td></tr>";
        }).join("")
      : '<tr><td colspan="4">Sin amonestaciones.</td></tr>';

    var totMin = a.jug.reduce(function (s, f) { return s + (f.min || 0); }, 0);
    var cron = a.log.slice().reverse().map(function (l) {
      return "<div><b>" + l.m + "'</b> &nbsp;" + U.esc(l.t) +
        (l.sub ? " &mdash; " + U.esc(l.sub) : "") + "</div>";
    }).join("");

    return '<div class="acta">' +
      '<div class="ah"><div class="ah-t">ACTA DE PARTIDO</div><div class="ah-s">' + cab + "</div></div>" +
      '<div class="ares"><div class="tm r">' + U.esc(izq) + "</div>" +
        '<div class="sc">' + mIzq + " &ndash; " + mDer + "</div>" +
        '<div class="tm">' + U.esc(der) + "</div></div>" +

      "<h4>Goles</h4>" +
      '<table><thead><tr><th class="n">Min</th><th>Equipo</th><th>Goleador</th><th>Tipo</th>' +
      "<th>Asistencia</th></tr></thead><tbody>" + filasGol + "</tbody></table>" +

      "<h4>Participación</h4>" +
      '<table><thead><tr><th class="n">Dor</th><th>Jugador</th><th>Pos</th><th>Rol</th>' +
      '<th class="n">Min</th><th class="n">G</th><th class="n">A</th><th class="n">F</th>' +
      '<th class="n">TA</th><th class="n">TR</th><th>Situación final</th></tr></thead>' +
      "<tbody>" + filasJug + "</tbody></table>" +
      '<p style="font-size:8pt;color:#555;margin:5px 0 0">Convocados: ' + a.jug.length +
        " &middot; titulares: " + tit.length + " &middot; minutos repartidos: " + totMin +
        " &middot; los penaltis se indican entre paréntesis en la columna de goles.</p>" +

      "<h4>Disciplina</h4>" +
      '<table><thead><tr><th class="n">Dor</th><th>Jugador</th><th>Amonestaciones</th>' +
      "<th>Expulsión</th></tr></thead><tbody>" + filasDisc + "</tbody></table>" +

      "<h4>Crónica</h4>" +
      '<div class="chron">' + (cron || "<div>Sin incidencias registradas.</div>") + "</div>" +

      '<div class="sig"><div>Firma del entrenador</div><div>Firma del delegado</div></div>' +
      '<div class="foot"><span>' + U.esc(club) + " &middot; acta generada el " +
        new Date().toLocaleDateString("es-ES") + "</span><span>CoachBoard</span></div></div>";
  }

  function actaPdf(a) {
    if (!a) { U.toast("No hay acta"); return; }
    window.CB.shell.closeSheet();
    U.printDoc("Acta " + (a.fecha || "") + " " + (a.rival || ""), actaHtml(a));
  }
  function actaPdfPorId(id) {
    actaPdf(window.DB.partidos.filter(function (p) { return p.id === id; })[0]);
  }

  function actaTxt(a) {
    if (!a) return;
    var club = S.club();
    var txt = "ACTA DEL PARTIDO\r\nFecha: " + a.fecha + "   Rival: " + a.rival +
      "\r\nResultado: " + a.gf + " - " + a.gc + "\r\n\r\nGOLES\r\n";
    (a.goles || []).forEach(function (g) {
      txt += String(g.min).padStart(3) + "'  " +
        (g.eq === "A" ? club : "rival") + "  " +
        (g.j ? nombreEnActa(a, g.j) : "-") + "  (" + g.tipo + ")" +
        (g.a ? "  asist. " + nombreEnActa(a, g.a) : "") + "\r\n";
    });
    txt += "\r\nMINUTOS POR JUGADOR\r\n";
    a.jug.slice().sort(function (x, y) { return y.min - x.min; }).forEach(function (f) {
      txt += String(f.dorsal).padStart(3) + "  " + String(f.nombre).padEnd(24) +
        String(f.min + "'").padStart(5) + "   goles:" + f.gol + "  asist:" + f.asi +
        "  faltas:" + (f.fal || 0) + "  TA:" + f.ta + "  TR:" + f.tr + "   " + f.st + "\r\n";
    });
    txt += "\r\nCRONICA\r\n";
    a.log.slice().reverse().forEach(function (l) {
      txt += String(l.m).padStart(3) + "'  " + l.t + (l.sub ? " - " + l.sub : "") + "\r\n";
    });
    window.download("acta_" + a.fecha + "_" + String(a.rival || "partido").replace(/[^\w-]/g, "_") + ".txt",
      new Blob([txt], { type: "text/plain;charset=utf-8" }));
    U.toast("Acta en texto descargada");
    window.CB.shell.closeSheet();
  }
  function actaTxtPorId(id) {
    actaTxt(window.DB.partidos.filter(function (p) { return p.id === id; })[0]);
  }

  /* ---------------------------------------------------------
     Ficha del jugador
     --------------------------------------------------------- */
  function fichaHtml(id) {
    var s = window.CB.stats.player(id), j = s.j;
    var club = S.club();
    var edad = (function () {
      if (!j.fechaNac) return "";
      var d = new Date(j.fechaNac);
      return isNaN(d) ? "" : Math.floor((Date.now() - d) / 31557600000) + " años";
    })();
    var cab = [U.esc(M.POS_LARGO[j.pos] || j.pos || ""), U.esc(j.pie || ""), edad, U.esc(j.estado || "")]
      .filter(Boolean).join(" &middot; ");

    var fila = function (l, v) { return "<tr><td>" + l + '</td><td class="n">' + v + "</td></tr>"; };

    var tipos = window.CB.stats.tiposOrdenados(s.tipos).map(function (t) {
      return "<tr><td>" + U.esc(t) + '</td><td class="n">' + s.tipos[t] + "</td>" +
        '<td class="n">' + Math.round(100 * s.tipos[t] / s.g) + "%</td></tr>";
    }).join("") || '<tr><td colspan="3">Sin goles registrados.</td></tr>';

    var part = s.partidos.map(function (p) {
      return "<tr><td>" + (p.fecha || "") + "</td><td>" + U.esc(p.rival || "") + "</td>" +
        "<td>" + p.res + "</td><td>" + p.rol + "</td>" +
        '<td class="n">' + p.min + "'</td><td class=\"n\">" + p.gol + "</td>" +
        '<td class="n">' + p.asi + '</td><td class="n">' + p.fal + "</td>" +
        '<td class="n">' + p.ta + '</td><td class="n">' + (p.tr ? "Sí" : "") + "</td></tr>";
    }).join("") || '<tr><td colspan="10">Sin partidos con acta cerrada.</td></tr>';

    return '<div class="acta">' +
      '<div class="ah"><div class="ah-t">FICHA DE JUGADOR</div>' +
      '<div class="ah-s">' + U.esc(club) + " &middot; temporada en curso &middot; " +
        new Date().toLocaleDateString("es-ES") + "</div></div>" +
      '<div class="ares"><div class="tm r">' + U.esc(j.nombre) + "</div>" +
        '<div class="sc">' + (j.dorsal || "-") + "</div>" +
        '<div class="tm">' + cab + "</div></div>" +

      "<h4>Resumen de la temporada</h4><table><tbody>" +
        fila("Convocatorias", s.conv) +
        fila("Partidos jugados", s.pj) +
        fila("Como titular", s.tit) +
        fila("Minutos totales", s.min + "'") +
        fila("Media por partido", s.media + "'") +
        fila("Goles", s.g) +
        fila("Asistencias", s.a) +
        fila("Marca un gol cada", s.minGol ? s.minGol + " minutos" : "&mdash;") +
        fila("Da una asistencia cada", s.minAsi ? s.minAsi + " minutos" : "&mdash;") +
        fila("Participa en gol cada", s.minPart ? s.minPart + " minutos" : "&mdash;") +
        fila("Faltas cometidas", s.fal + " (" + s.falPart + " por partido)") +
        fila("Comete una falta cada", s.minFal ? s.minFal + " minutos" : "&mdash;") +
        fila("Tarjetas amarillas", s.ta) +
        fila("Expulsiones", s.tr) +
        fila("Asistencia a entrenamientos",
          s.att ? s.att.pct + "% (" + s.att.p + " de " + s.att.t + ")" : "&mdash;") +
      "</tbody></table>" +

      "<h4>De dónde vienen sus goles</h4>" +
      '<table><thead><tr><th>Origen</th><th class="n">Goles</th><th class="n">Peso</th></tr></thead>' +
      "<tbody>" + tipos + "</tbody></table>" +
      (s.favorito ? '<p style="font-size:8pt;color:#555;margin:5px 0 0">La mayoría de sus goles llegan de esta forma: ' +
        U.esc(s.favorito.toLowerCase()) + ".</p>" : "") +

      "<h4>Partido a partido</h4>" +
      '<table><thead><tr><th>Fecha</th><th>Rival</th><th>Res.</th><th>Rol</th>' +
      '<th class="n">Min</th><th class="n">G</th><th class="n">A</th><th class="n">Faltas</th>' +
      '<th class="n">TA</th><th class="n">TR</th></tr></thead><tbody>' + part + "</tbody></table>" +

      '<div class="foot"><span>' + U.esc(club) + " &middot; ficha generada el " +
        new Date().toLocaleDateString("es-ES") + "</span><span>CoachBoard</span></div></div>";
  }

  function fichaPdf(id) {
    window.CB.shell.closeSheet();
    var j = S.jug(id) || {};
    U.printDoc("Ficha " + (j.nombre || "jugador"), fichaHtml(id));
  }

  window.CB.reports = {
    actaHtml: actaHtml, actaPdf: actaPdf, actaPdfPorId: actaPdfPorId,
    actaTxt: actaTxt, actaTxtPorId: actaTxtPorId,
    fichaHtml: fichaHtml, fichaPdf: fichaPdf
  };
})();
