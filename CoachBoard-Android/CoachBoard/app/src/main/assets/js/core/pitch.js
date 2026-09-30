/* =============================================================
   CoachBoard · core/pitch.js
   Motor de dibujo: campo, fichas y piezas de la pizarra.
   Todo se dibuja en coordenadas de mundo (píxeles lógicos del
   lienzo); el zoom y el desplazamiento los aplica scene.js.
   ============================================================= */
(function () {
  "use strict";
  var M = window.CB.models;

  var BG = "#0F1115";
  var TURF = "#17452C";
  var TURF2 = "#1A4F32";
  var CHALK = "#E8F0EA";
  var SEL = "#F5B942";

  /* ------------------------------------------------------------
     Campo

     El campo se estira para llenar el lienzo, y no lo hace igual a lo
     ancho que a lo alto. Por eso los 9,15 m del círculo central y de
     la media luna del área no son un radio, sino dos: uno por eje.
     Dibujarlos como una circunferencia hacía que la media luna se
     metiera dentro del área en cuanto la pantalla no tenía la
     proporción de un campo real.

     Medidas reales de un campo de 105 x 68 m, en tanto por uno:
       9,15 / 105 = 0,0871      9,15 / 68 = 0,1346
     ------------------------------------------------------------ */
  var R_X = 9.15 / 105, R_Y = 9.15 / 68;

  /* Arco de elipse trazado punto a punto. No se usa scale() porque
     deformaría también el grosor de la línea, ni ellipse() porque no
     está en los WebView más antiguos. */
  function arcoElipse(g, cx, cy, rx, ry, t0, t1) {
    var n = Math.max(12, Math.round(Math.abs(t1 - t0) / (Math.PI / 60)));
    g.beginPath();
    for (var i = 0; i <= n; i++) {
      var t = t0 + (t1 - t0) * i / n;
      var x = cx + rx * Math.cos(t), y = cy + ry * Math.sin(t);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }

  /* Geometría del campo, aparte del dibujo para poder comprobarla.
     `medio` es el semiángulo de la media luna: el punto en el que la
     elipse de 9,15 m cruza la línea del área, sea cual sea la
     resolución. Si el área es tan profunda que la elipse no llega a
     salir, no hay media luna que dibujar. */
  function pitchGeom(pw, ph) {
    var g = {
      aW: pw * 0.157, aH: ph * 0.578,      // área grande
      gW: pw * 0.055, gH: ph * 0.265,      // área pequeña
      sp: pw * 0.105,                       // punto de penalti
      rx: pw * R_X, ry: ph * R_Y            // 9,15 m en cada eje
    };
    var d = g.aW - g.sp;                    // del penalti a la línea del área
    g.medio = d < g.rx ? Math.acos(d / g.rx) : 0;
    /* Dónde acaba el arco: tiene que caer justo sobre la línea. */
    g.finX = g.sp + g.rx * Math.cos(g.medio);
    return g;
  }

  function drawPitch(g, W, H, modo) {
    var m = Math.max(7, W * 0.012), vw = W - 2 * m, vh = H - 2 * m;
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);
    if (vw < 40 || vh < 40) return;

    if (modo === "Pizarra") {
      g.fillStyle = "#F7F9FB";
      g.fillRect(m, m, vw, vh);
      g.strokeStyle = "#DFE5EC";
      g.lineWidth = 1;
      var step = Math.max(24, vw / 16);
      for (var x = m; x < m + vw; x += step) { g.beginPath(); g.moveTo(x, m); g.lineTo(x, m + vh); g.stroke(); }
      for (var y = m; y < m + vh; y += step) { g.beginPath(); g.moveTo(m, y); g.lineTo(m + vw, y); g.stroke(); }
      g.strokeStyle = "#B7C0CC"; g.lineWidth = 2; g.strokeRect(m, m, vw, vh);
      return;
    }

    g.fillStyle = TURF;
    g.fillRect(m, m, vw, vh);
    g.fillStyle = TURF2;
    var bw = vw / 10;
    for (var i = 0; i < 10; i += 2) g.fillRect(m + i * bw, m, bw, vh);

    var px, py, pw, ph;
    if (modo === "Medio") {
      g.save(); g.beginPath(); g.rect(m, m, vw, vh); g.clip();
      px = m - vw; py = m; pw = vw * 2; ph = vh;
    } else {
      px = m; py = m; pw = vw; ph = vh;
    }

    var cx = px + pw / 2, cy = py + ph / 2;
    var G = pitchGeom(pw, ph);
    g.strokeStyle = CHALK; g.fillStyle = CHALK;
    g.lineWidth = Math.max(1.5, W / 500);
    g.strokeRect(px, py, pw, ph);
    g.beginPath(); g.moveTo(cx, py); g.lineTo(cx, py + ph); g.stroke();
    /* El círculo central se deja redondo, como estaba: es el aspecto
       de siempre de una pizarra y nadie se ha quejado de él. Lo que
       no encajaba era la media luna, y esa sí va como elipse. */
    g.beginPath(); g.arc(cx, cy, ph * 0.13, 0, 7); g.stroke();
    g.beginPath(); g.arc(cx, cy, Math.max(2, W / 300), 0, 7); g.fill();

    var aW = G.aW, aH = G.aH, gW = G.gW, gH = G.gH, sp = G.sp;
    g.strokeRect(px, cy - aH / 2, aW, aH);
    g.strokeRect(px + pw - aW, cy - aH / 2, aW, aH);
    g.strokeRect(px, cy - gH / 2, gW, gH);
    g.strokeRect(px + pw - gW, cy - gH / 2, gW, gH);
    [px + sp, px + pw - sp].forEach(function (sx) {
      g.beginPath(); g.arc(sx, cy, Math.max(2, W / 300), 0, 7); g.fill();
    });
    if (G.medio > 0.01) {
      arcoElipse(g, px + sp, cy, G.rx, G.ry, -G.medio, G.medio);
      arcoElipse(g, px + pw - sp, cy, G.rx, G.ry, Math.PI - G.medio, Math.PI + G.medio);
    }

    var gd = Math.max(4, pw * 0.012);
    g.strokeRect(px - gd, cy - ph * 0.09, gd, ph * 0.18);
    g.strokeRect(px + pw, cy - ph * 0.09, gd, ph * 0.18);

    var cr = Math.max(5, W / 120);
    [[px, py, 0], [px + pw, py, Math.PI / 2], [px + pw, py + ph, Math.PI], [px, py + ph, Math.PI * 1.5]]
      .forEach(function (c) { g.beginPath(); g.arc(c[0], c[1], cr, c[2], c[2] + Math.PI / 2); g.stroke(); });

    if (modo === "Medio") g.restore();
  }

  /* ------------------------------------------------------------
     Ficha de jugador
     ------------------------------------------------------------ */
  function token(g, x, y, r, col, dorsal, nombre, sel) {
    g.beginPath(); g.arc(x + 1, y + 2, r, 0, 7);
    g.fillStyle = "rgba(0,0,0,.35)"; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, 7);
    g.fillStyle = col; g.fill();
    g.lineWidth = Math.max(1.5, r / 8);
    g.strokeStyle = "#F2F7FC"; g.stroke();

    if (dorsal) {
      g.fillStyle = "#fff";
      g.font = "700 " + Math.round(r * 0.95) + "px system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(dorsal), x, y + 1);
    }
    if (nombre) {
      g.font = "700 " + Math.round(r * 0.62) + "px system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "top";
      var w = g.measureText(nombre).width + 8, h = r * 0.95;
      g.fillStyle = "rgba(10,13,18,.78)";
      g.fillRect(x - w / 2, y + r + 3, w, h);
      g.fillStyle = "#EEF3F8";
      g.fillText(nombre, x, y + r + 4);
    }
    if (sel) {
      g.beginPath(); g.arc(x, y, r + 5, 0, 7);
      g.strokeStyle = SEL; g.lineWidth = 2;
      g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]);
    }
  }

  function arrowHead(g, x1, y1, x2, y2, len) {
    var a = Math.atan2(y2 - y1, x2 - x1);
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 + len * Math.cos(a + 2.6), y2 + len * Math.sin(a + 2.6));
    g.lineTo(x2 + len * Math.cos(a - 2.6), y2 + len * Math.sin(a - 2.6));
    g.closePath();
    g.fill();
  }

  /* ------------------------------------------------------------
     Piezas de la pizarra
     ------------------------------------------------------------ */
  function drawItem(g, it, W, H, S) {
    var x = it.x * W, y = it.y * H;
    var col = M.COLS[it.color] || M.COLS.Azul;
    var s = S * (it.scale || 1);
    var dosPuntas = M.esDosPuntas(it);
    var rot = (it.rot || 0) * Math.PI / 180;

    g.save();
    /* La rotación gira alrededor del propio centro de la pieza, así
       que mover y girar son operaciones totalmente independientes. */
    if (rot && !dosPuntas) {
      g.translate(x, y); g.rotate(rot); g.translate(-x, -y);
    }
    g.strokeStyle = col; g.fillStyle = col;
    g.lineWidth = Math.max(2, s * 0.22);
    g.textAlign = "center"; g.textBaseline = "middle";

    switch (it.tipo) {
      case "Jugador":
        token(g, x, y, s, col, it.txt, "", false);
        break;

      case "Portero":
        token(g, x, y, s, M.COLS.Amarillo, it.txt || "P", "", false);
        break;

      case "Cono":
        g.beginPath();
        g.moveTo(x, y - s * 0.85);
        g.lineTo(x - s * 0.7, y + s * 0.6);
        g.lineTo(x + s * 0.7, y + s * 0.6);
        g.closePath(); g.fill();
        break;

      case "Balon":
        g.beginPath(); g.arc(x, y, s * 0.5, 0, 7);
        g.fillStyle = "#fff"; g.fill();
        g.strokeStyle = "#161A21"; g.lineWidth = 1.2; g.stroke();
        g.fillStyle = "#161A21";
        g.beginPath(); g.arc(x, y, s * 0.18, 0, 7); g.fill();
        break;

      case "Porteria":
        g.strokeStyle = CHALK;
        g.strokeRect(x - s * 1.6, y - s * 0.55, s * 3.2, s * 1.1);
        g.lineWidth = 1;
        for (var i = -s * 1.3; i <= s * 1.3; i += s * 0.45) {
          g.beginPath(); g.moveTo(x + i, y - s * 0.55); g.lineTo(x + i, y + s * 0.55); g.stroke();
        }
        break;

      case "Miniporteria":
        g.strokeStyle = CHALK;
        g.strokeRect(x - s, y - s * 0.35, s * 2, s * 0.7);
        break;

      case "Escalera":
        g.strokeStyle = CHALK;
        g.strokeRect(x - s * 2.4, y - s * 0.8, s * 4.8, s * 1.6);
        for (var k = -s * 1.6; k <= s * 1.6; k += s * 0.8) {
          g.beginPath(); g.moveTo(x + k, y - s * 0.8); g.lineTo(x + k, y + s * 0.8); g.stroke();
        }
        break;

      case "Valla":
        g.strokeStyle = M.COLS.Amarillo;
        g.beginPath();
        g.moveTo(x - s, y - s * 0.45); g.lineTo(x + s, y - s * 0.45);
        g.moveTo(x - s, y - s * 0.45); g.lineTo(x - s, y + s * 0.5);
        g.moveTo(x + s, y - s * 0.45); g.lineTo(x + s, y + s * 0.5);
        g.stroke();
        break;

      case "Pica":
        g.beginPath(); g.moveTo(x, y - s); g.lineTo(x, y + s * 0.7); g.stroke();
        g.beginPath(); g.ellipse(x, y + s * 0.7, s * 0.45, s * 0.2, 0, 0, 7); g.fill();
        break;

      case "Aro":
        g.beginPath(); g.ellipse(x, y, s * 0.95, s * 0.65, 0, 0, 7); g.stroke();
        break;

      case "Maniqui":
        g.beginPath(); g.arc(x, y - s * 0.8, s * 0.42, 0, 7); g.fill();
        g.fillRect(x - s * 0.45, y - s * 0.3, s * 0.9, s * 1.3);
        break;

      case "Texto": {
        var etiqueta = it.txt || "Texto";
        g.font = "700 " + Math.round(s * 1.1) + "px system-ui, sans-serif";
        var tw = g.measureText(etiqueta).width + 12;
        g.fillStyle = "rgba(10,13,18,.78)";
        g.fillRect(x - tw / 2, y - s * 0.85, tw, s * 1.7);
        g.fillStyle = col;
        g.fillText(etiqueta, x, y);
        break;
      }

      case "Zona": {
        var zx2 = it.x2 * W, zy2 = it.y2 * H;
        var rx = Math.min(x, zx2), ry = Math.min(y, zy2);
        var rw = Math.abs(zx2 - x), rh = Math.abs(zy2 - y);
        g.fillStyle = hexA(col, .22);
        g.fillRect(rx, ry, rw, rh);
        g.strokeStyle = col; g.lineWidth = 2;
        g.setLineDash([6, 5]); g.strokeRect(rx, ry, rw, rh); g.setLineDash([]);
        break;
      }

      case "Flecha": {
        var ax2 = it.x2 * W, ay2 = it.y2 * H;
        if (it.estilo === "Pase") g.setLineDash([9, 6]);
        if (it.estilo === "Conduccion") {
          wavy(g, x, y, ax2, ay2, s);
        } else {
          g.beginPath(); g.moveTo(x, y); g.lineTo(ax2, ay2); g.stroke();
        }
        g.setLineDash([]);
        if (it.estilo !== "Linea") arrowHead(g, x, y, ax2, ay2, s * 0.9);
        break;
      }

      default:
        token(g, x, y, s, col, it.txt, "", false);
    }
    g.restore();
  }

  /* Conducción: la onda se apaga en los extremos y el último tramo
     es recto, así la punta cae justo en el destino. */
  function wavy(g, x1, y1, x2, y2, s) {
    var dx = x2 - x1, dy = y2 - y1;
    var L = Math.hypot(dx, dy) || 1;
    var ux = dx / L, uy = dy / L;
    var cola = Math.min(L * 0.35, s * 1.4);
    var Lw = Math.max(1, L - cola);
    var amp = s * 0.35;
    var pasos = Math.max(8, Math.round(Lw / 2.5));
    g.beginPath();
    g.moveTo(x1, y1);
    for (var k = 1; k <= pasos; k++) {
      var d = Lw * k / pasos, t = d / Lw;
      var o = Math.sin(d / 9) * amp * Math.sin(Math.PI * t);
      g.lineTo(x1 + ux * d - uy * o, y1 + uy * d + ux * o);
    }
    g.lineTo(x2, y2);
    g.stroke();
  }

  function hexA(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* ------------------------------------------------------------
     Geometría de selección (la comparte el motor de escena)
     ------------------------------------------------------------ */
  function itemRadius(it, S) {
    var s = S * (it.scale || 1);
    switch (it.tipo) {
      case "Escalera": return s * 2.6;
      case "Porteria": return s * 1.8;
      case "Texto": return s * 1.6;
      case "Miniporteria": return s * 1.3;
      default: return s * 1.25;
    }
  }

  /* El tirador de giro cuelga por encima de la pieza y acompaña su
     rotación, de modo que siempre cae donde el ojo lo espera. */
  function handlePos(it, W, H, S) {
    var off = itemRadius(it, S) + S * 1.5;
    var a = (it.rot || 0) * Math.PI / 180;
    return {
      x: it.x * W + Math.sin(a) * off,
      y: it.y * H - Math.cos(a) * off
    };
  }

  function drawSelection(g, it, W, H, S) {
    var x = it.x * W, y = it.y * H;
    g.save();
    if (M.esDosPuntas(it)) {
      var x2 = it.x2 * W, y2 = it.y2 * H;
      g.strokeStyle = SEL; g.lineWidth = 1.4;
      g.setLineDash([4, 4]);
      g.strokeRect(Math.min(x, x2) - 8, Math.min(y, y2) - 8,
                   Math.abs(x2 - x) + 16, Math.abs(y2 - y) + 16);
      g.setLineDash([]);
      [[x, y], [x2, y2]].forEach(function (p) {
        g.beginPath(); g.arc(p[0], p[1], S * 0.5, 0, 7);
        g.fillStyle = SEL; g.fill();
        g.strokeStyle = "#0F1115"; g.lineWidth = 1.5; g.stroke();
      });
      g.restore();
      return;
    }

    var r = itemRadius(it, S);
    g.strokeStyle = SEL; g.lineWidth = 1.6;
    g.setLineDash([5, 4]);
    g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    g.setLineDash([]);

    var hp = handlePos(it, W, H, S);
    g.beginPath(); g.moveTo(x, y); g.lineTo(hp.x, hp.y);
    g.strokeStyle = "rgba(245,185,66,.55)"; g.lineWidth = 1.4; g.stroke();

    g.beginPath(); g.arc(hp.x, hp.y, S * 0.62, 0, 7);
    g.fillStyle = SEL; g.fill();
    g.strokeStyle = "#0F1115"; g.lineWidth = 1.6; g.stroke();

    /* flechita dentro del tirador para que se lea "girar" */
    g.strokeStyle = "#2A1D02"; g.lineWidth = 1.4;
    g.beginPath(); g.arc(hp.x, hp.y, S * 0.3, -0.6, 3.4); g.stroke();
    g.restore();
  }

  function baseSize(W) { return Math.max(9, Math.min(22, W / 40)); }

  function drawScene(g, W, H, modo, items, selId) {
    g.lineJoin = "round";
    g.lineCap = "round";
    var S = baseSize(W);
    drawPitch(g, W, H, modo);
    items.forEach(function (it) { drawItem(g, it, W, H, S); });
    if (selId) {
      var sel = items.filter(function (i) { return i.id === selId; })[0];
      if (sel) drawSelection(g, sel, W, H, S);
    }
  }

  window.CB.pitch = {
    drawPitch: drawPitch, token: token, arrowHead: arrowHead,
    drawItem: drawItem, drawScene: drawScene, drawSelection: drawSelection,
    itemRadius: itemRadius, handlePos: handlePos, baseSize: baseSize,
    pitchGeom: pitchGeom
  };
})();
