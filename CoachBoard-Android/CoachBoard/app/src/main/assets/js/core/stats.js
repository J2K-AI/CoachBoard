/* =============================================================
   CoachBoard · core/stats.js
   Cálculo de estadísticas. Sin DOM: solo números.
   ============================================================= */
(function () {
  "use strict";
  var S = window.CB.store;
  var M = window.CB.models;

  /* Resumen de un jugador a partir de las actas cerradas. */
  function player(id) {
    var j = S.jug(id) || {};
    var min = 0, g = 0, a = 0, ta = 0, tr = 0, fal = 0, pj = 0, tit = 0, conv = 0;
    var tipos = {}, partidos = [];

    window.DB.partidos.slice()
      .sort(function (x, y) { return String(y.fecha).localeCompare(String(x.fecha)); })
      .forEach(function (p) {
        var f = (p.jug || []).filter(function (x) { return x.j === id; })[0];
        if (!f) return;
        conv++;
        var esTit = (p.titulares || []).indexOf(id) >= 0;
        if (esTit) tit++;
        if ((f.min || 0) > 0) pj++;
        min += f.min || 0; g += f.gol || 0; a += f.asi || 0;
        ta += f.ta || 0; tr += f.tr || 0; fal += f.fal || 0;
        (p.goles || []).forEach(function (x) {
          if (x.j === id) {
            var t = x.tipo || "Jugada";
            tipos[t] = (tipos[t] || 0) + 1;
          }
        });
        partidos.push({
          fecha: p.fecha, rival: p.rival, res: p.gf + "-" + p.gc,
          rol: esTit ? "Titular" : "Suplente",
          min: f.min || 0, gol: f.gol || 0, asi: f.asi || 0,
          fal: f.fal || 0, ta: f.ta || 0, tr: f.tr || 0
        });
      });

    var att = S.attPct(id);
    return {
      j: j, id: id, conv: conv, pj: pj, tit: tit, min: min,
      g: g, a: a, ta: ta, tr: tr, fal: fal,
      tipos: tipos, partidos: partidos, att: att,
      media: pj ? Math.round(min / pj) : 0,
      minGol: g ? Math.round(min / g) : null,
      minAsi: a ? Math.round(min / a) : null,
      minPart: (g + a) ? Math.round(min / (g + a)) : null,
      minFal: fal ? Math.round(min / fal) : null,
      falPart: pj ? (fal / pj).toFixed(1) : "0",
      favorito: (function () {
        var o = Object.keys(tipos).sort(function (x, y) { return tipos[y] - tipos[x]; });
        return (o.length && tipos[o[0]] >= 2 && (o.length === 1 || tipos[o[0]] > tipos[o[1]])) ? o[0] : null;
      })()
    };
  }

  /* Orden de tipos de gol estable para las tablas. */
  function tiposOrdenados(tipos) {
    var extra = Object.keys(tipos).filter(function (t) { return M.TIPOS_GOL.indexOf(t) < 0; });
    return M.TIPOS_GOL.concat(extra).filter(function (t) { return tipos[t]; });
  }

  window.CB.stats = { player: player, tiposOrdenados: tiposOrdenados };
})();
