/* =============================================================
   CoachBoard · core/scene.js
   Motor de la pizarra: selección, arrastre, rotación, duplicado,
   borrado, historial, zoom y desplazamiento.

   Regla de oro del diseño: cada gesto entra en UN solo modo.
   Si el dedo baja sobre el tirador de giro, el gesto es "rotate" y
   jamás escribe en x/y. Si baja sobre el cuerpo, es "move" y jamás
   escribe en rot. Por eso girar no puede desplazar la pieza.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var M = window.CB.models;
  var P = window.CB.pitch;

  var UMBRAL_ARRASTRE = 4;   // px de holgura antes de mover: un toque no empuja
  var SNAP_GRADOS = 15;
  var SNAP_TOLERANCIA = 4;
  var ZOOM_MAX = 4;
  var HISTORIAL_MAX = 40;

  function create(opts) {
    var canvas = opts.canvas;
    var stage = opts.stage;
    var ctxbar = opts.ctxbar || null;
    var pill = opts.pill || null;
    var g = canvas.getContext("2d");

    var st = {
      items: [],
      sel: null,
      tool: "Mover",
      color: "Azul",
      modo: "Completo",
      view: { k: 1, tx: 0, ty: 0 },
      historial: []
    };

    var punteros = new Map();
    var gesto = null;        // { modo, it, ... }
    var pellizco = null;
    var pendiente = null;    // instantánea previa a un arrastre

    /* ---------------------------------------------------------
       Medidas del lienzo
       --------------------------------------------------------- */
    function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }
    function W() { return canvas.width / dpr(); }
    function H() { return canvas.height / dpr(); }

    function fit() {
      var w = canvas.parentElement.clientWidth;
      if (!w) return;
      var apaisado = window.innerWidth > window.innerHeight;
      var h = Math.round(apaisado
        ? Math.min(w * 0.62, Math.max(220, window.innerHeight - 190))
        : w * 0.66);
      var d = dpr();
      canvas.width = w * d;
      canvas.height = h * d;
      canvas.style.height = h + "px";
      clampView();
      paint();
    }

    /* ---------------------------------------------------------
       Conversión pantalla ↔ mundo
       --------------------------------------------------------- */
    function toWorld(sx, sy) {
      return { x: (sx - st.view.tx) / st.view.k, y: (sy - st.view.ty) / st.view.k };
    }
    function toScreen(wx, wy) {
      return { x: wx * st.view.k + st.view.tx, y: wy * st.view.k + st.view.ty };
    }
    function localPos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function clampView() {
      var v = st.view;
      v.k = U.clamp(v.k, 1, ZOOM_MAX);
      var w = W(), h = H();
      v.tx = U.clamp(v.tx, w * (1 - v.k), 0);
      v.ty = U.clamp(v.ty, h * (1 - v.k), 0);
    }

    /* ---------------------------------------------------------
       Pintado
       --------------------------------------------------------- */
    function paint() {
      var d = dpr(), w = W(), h = H();
      g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = "#0F1115";
      g.fillRect(0, 0, w, h);
      g.save();
      g.translate(st.view.tx, st.view.ty);
      g.scale(st.view.k, st.view.k);
      P.drawScene(g, w, h, st.modo, st.items, st.sel);
      g.restore();
      placeCtxBar();
    }

    /* ---------------------------------------------------------
       Barra contextual flotante
       --------------------------------------------------------- */
    /* Distancia que hay que dejar libre alrededor del centro para no
       tapar ni la pieza ni su tirador de giro: el tirador puede estar
       en cualquier punto de esa circunferencia según el ángulo. */
    function despeje(it, S) {
      if (M.esDosPuntas(it)) return S * 1.6;
      return P.itemRadius(it, S) + S * 1.5 + S * 0.62 + 10;
    }

    function placeCtxBar() {
      if (!ctxbar) return;
      var it = selected();
      if (!it || gesto) {                  // se esconde mientras se manipula
        ctxbar.classList.add("hidden");
        return;
      }
      var S = P.baseSize(W());
      var cx = it.x * W(), cy = it.y * H();
      if (M.esDosPuntas(it)) {
        cx = (it.x + it.x2) / 2 * W();
        cy = Math.min(it.y, it.y2) * H();
      }
      var d = despeje(it, S);
      var ALTO = 24;                       // media altura de la barra
      var arriba = toScreen(cx, cy - d).y - ALTO;
      var abajo = toScreen(cx, cy + d).y + ALTO;

      var y = arriba;
      if (arriba < ALTO + 6) {             // no cabe encima: se pone debajo
        y = abajo;
        if (y > canvas.clientHeight - ALTO - 6) y = canvas.clientHeight - ALTO - 6;
      }
      y = U.clamp(y, ALTO + 6, canvas.clientHeight - ALTO - 6);

      var x = U.clamp(toScreen(cx, cy).x, 100, Math.max(100, canvas.clientWidth - 100));
      ctxbar.style.left = x + "px";
      ctxbar.style.top = y + "px";
      ctxbar.classList.remove("hidden");
    }

    function showPill(txt, wx, wy) {
      if (!pill) return;
      var p = toScreen(wx, wy);
      pill.textContent = txt;
      pill.style.left = U.clamp(p.x, 40, canvas.clientWidth - 40) + "px";
      pill.style.top = U.clamp(p.y - 46, 20, canvas.clientHeight - 20) + "px";
      pill.classList.remove("hidden");
    }
    function hidePill() { if (pill) pill.classList.add("hidden"); }

    /* ---------------------------------------------------------
       Historial
       --------------------------------------------------------- */
    function instantanea() { return JSON.stringify(st.items); }
    function apuntar() {
      st.historial.push(instantanea());
      if (st.historial.length > HISTORIAL_MAX) st.historial.shift();
      notify();
    }
    function abrirPendiente() { pendiente = instantanea(); }
    function cerrarPendiente() {
      if (pendiente !== null && pendiente !== instantanea()) {
        st.historial.push(pendiente);
        if (st.historial.length > HISTORIAL_MAX) st.historial.shift();
        notify();
      }
      pendiente = null;
    }
    function undo() {
      if (!st.historial.length) { U.toast("No hay nada que deshacer"); return; }
      st.items = JSON.parse(st.historial.pop());
      st.sel = null;
      paint(); notify();
    }
    function puedeDeshacer() { return st.historial.length > 0; }

    function notify() { if (opts.onChange) opts.onChange(st); }

    /* ---------------------------------------------------------
       Localización de la pieza bajo el dedo
       --------------------------------------------------------- */
    function selected() {
      return st.items.filter(function (i) { return i.id === st.sel; })[0] || null;
    }

    function hitTest(wx, wy) {
      var S = P.baseSize(W()), w = W(), h = H();

      /* 1) El tirador de giro de la pieza seleccionada tiene prioridad
            absoluta: si el dedo cae ahí, el gesto será girar. */
      var sel = selected();
      if (sel && !M.esDosPuntas(sel)) {
        var hp = P.handlePos(sel, w, h, S);
        if (Math.hypot(wx - hp.x, wy - hp.y) < S * 1.5) {
          return { it: sel, modo: "rotate" };
        }
      }

      /* 2) Extremos de flechas y zonas. */
      for (var i = st.items.length - 1; i >= 0; i--) {
        var it = st.items[i];
        if (!M.esDosPuntas(it)) continue;
        var x = it.x * w, y = it.y * h, x2 = it.x2 * w, y2 = it.y2 * h;
        if (Math.hypot(wx - x, wy - y) < S * 1.3) return { it: it, modo: "p1" };
        if (Math.hypot(wx - x2, wy - y2) < S * 1.3) return { it: it, modo: "p2" };
        if (Math.hypot(wx - (x + x2) / 2, wy - (y + y2) / 2) < S * 1.5) return { it: it, modo: "move" };
      }

      /* 3) Cuerpo de las demás piezas, de arriba abajo. */
      for (var k = st.items.length - 1; k >= 0; k--) {
        var p = st.items[k];
        if (M.esDosPuntas(p)) continue;
        if (Math.hypot(wx - p.x * w, wy - p.y * h) < P.itemRadius(p, S) + S * 0.35) {
          return { it: p, modo: "move" };
        }
      }
      return null;
    }

    /* ---------------------------------------------------------
       Gestos
       --------------------------------------------------------- */
    function onDown(e) {
      canvas.setPointerCapture(e.pointerId);
      punteros.set(e.pointerId, localPos(e));

      if (punteros.size === 2) {         // dos dedos: zoom y desplazamiento
        gesto = null;
        hidePill();
        var p = [].concat(Array.from(punteros.values()));
        pellizco = {
          d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1,
          cx: (p[0].x + p[1].x) / 2,
          cy: (p[0].y + p[1].y) / 2,
          k: st.view.k, tx: st.view.tx, ty: st.view.ty
        };
        return;
      }
      if (punteros.size > 2) return;

      var loc = localPos(e);
      var wpt = toWorld(loc.x, loc.y);

      if (st.tool === "Mover") {
        var h = hitTest(wpt.x, wpt.y);
        if (!h) { st.sel = null; paint(); notify(); return; }
        st.sel = h.it.id;
        abrirPendiente();
        gesto = {
          modo: h.modo,
          it: h.it,
          inicio: loc,
          movido: false,
          offx: wpt.x / W() - h.it.x,
          offy: wpt.y / H() - h.it.y,
          rot0: h.it.rot || 0,
          ang0: Math.atan2(wpt.y - h.it.y * H(), wpt.x - h.it.x * W())
        };
        paint();
        return;
      }

      /* Herramienta de creación: la pieza nace donde toca el dedo. */
      crear(st.tool, wpt.x / W(), wpt.y / H(), loc);
    }

    function crear(tool, nx, ny, loc) {
      apuntar();
      var it = M.makeItem(tool, U.clamp(nx, .02, .98), U.clamp(ny, .02, .98), st.color, { items: st.items });
      st.items.push(it);
      st.sel = it.id;

      if (M.esDosPuntas(it)) {
        /* Flechas y zonas se dibujan estirando el segundo extremo. */
        gesto = { modo: "p2", it: it, inicio: loc, movido: true, offx: 0, offy: 0 };
      } else {
        gesto = null;
      }
      paint(); notify();

      if (it.tipo === "Texto" && opts.onEditText) {
        setTimeout(function () { opts.onEditText(it); }, 30);
      }
    }

    function onMove(e) {
      if (punteros.has(e.pointerId)) punteros.set(e.pointerId, localPos(e));

      if (pellizco && punteros.size >= 2) {
        var p = Array.from(punteros.values());
        var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
        var cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
        var k = U.clamp(pellizco.k * (d / pellizco.d), 1, ZOOM_MAX);
        /* El punto entre los dos dedos se queda quieto bajo ellos. */
        st.view.k = k;
        st.view.tx = cx - (pellizco.cx - pellizco.tx) * (k / pellizco.k);
        st.view.ty = cy - (pellizco.cy - pellizco.ty) * (k / pellizco.k);
        clampView();
        paint();
        return;
      }

      if (!gesto) return;
      var loc = localPos(e);

      /* Holgura: hasta que no se recorren unos píxeles no se mueve nada,
         de modo que seleccionar con el dedo no desplaza la pieza. */
      if (!gesto.movido) {
        if (Math.hypot(loc.x - gesto.inicio.x, loc.y - gesto.inicio.y) < UMBRAL_ARRASTRE) return;
        gesto.movido = true;
      }

      var wpt = toWorld(loc.x, loc.y);
      var it = gesto.it;
      var w = W(), h = H();

      if (gesto.modo === "rotate") {
        /* SOLO ángulo. Ni x ni y se tocan en esta rama. */
        var ang = Math.atan2(wpt.y - it.y * h, wpt.x - it.x * w);
        var grados = (ang - gesto.ang0) * 180 / Math.PI + gesto.rot0;
        grados = ((grados % 360) + 360) % 360;
        var cerca = Math.round(grados / SNAP_GRADOS) * SNAP_GRADOS;
        if (Math.abs(grados - cerca) < SNAP_TOLERANCIA) grados = (cerca + 360) % 360;
        it.rot = Math.round(grados);
        showPill(it.rot + "°", it.x * w, it.y * h);
        paint();
        return;
      }

      var nx = U.clamp(wpt.x / w, .01, .99);
      var ny = U.clamp(wpt.y / h, .01, .99);

      if (gesto.modo === "p1") { it.x = nx; it.y = ny; }
      else if (gesto.modo === "p2") { it.x2 = nx; it.y2 = ny; }
      else if (M.esDosPuntas(it)) {
        var dx = nx - gesto.offx - it.x, dy = ny - gesto.offy - it.y;
        it.x += dx; it.y += dy; it.x2 += dx; it.y2 += dy;
      } else {
        /* SOLO posición. La rotación se conserva intacta. */
        it.x = U.clamp(nx - gesto.offx, .01, .99);
        it.y = U.clamp(ny - gesto.offy, .01, .99);
      }
      paint();
    }

    function onUp(e) {
      punteros.delete(e.pointerId);
      if (punteros.size < 2) pellizco = null;
      if (gesto) {
        cerrarPendiente();
        gesto = null;
        hidePill();
        paint();
        notify();
      }
    }

    /* ---------------------------------------------------------
       Operaciones sobre la selección
       --------------------------------------------------------- */
    function rotar(delta) {
      var it = selected();
      if (!it) { U.toast("Toca antes una pieza"); return; }
      if (M.esDosPuntas(it)) { U.toast("Las flechas se orientan arrastrando su punta"); return; }
      apuntar();
      it.rot = ((((it.rot || 0) + delta) % 360) + 360) % 360;
      paint();
      U.toast(it.rot + "°");
    }

    function enderezar() {
      var it = selected();
      if (!it || M.esDosPuntas(it)) return;
      apuntar();
      it.rot = 0;
      paint();
    }

    function duplicar() {
      var it = selected();
      if (!it) { U.toast("Toca antes una pieza"); return; }
      apuntar();
      var copia = JSON.parse(JSON.stringify(it));
      copia.id = U.uid();
      copia.x = U.clamp(copia.x + 0.04, .02, .98);
      copia.y = U.clamp(copia.y + 0.04, .02, .98);
      if (M.esDosPuntas(copia)) {
        copia.x2 = U.clamp(copia.x2 + 0.04, .02, .98);
        copia.y2 = U.clamp(copia.y2 + 0.04, .02, .98);
      }
      st.items.push(copia);
      st.sel = copia.id;
      paint(); notify();
    }

    function borrar() {
      var it = selected();
      if (!it) { U.toast("Toca antes una pieza"); return; }
      apuntar();
      st.items = st.items.filter(function (i) { return i.id !== it.id; });
      st.sel = null;
      paint(); notify();
    }

    function vaciar() {
      if (!st.items.length) return;
      apuntar();
      st.items = [];
      st.sel = null;
      paint(); notify();
    }

    function cargar(items, modo) {
      st.items = (items || []).map(function (i) {
        return window.CB.store.fixItem(JSON.parse(JSON.stringify(i)));
      });
      if (modo) st.modo = modo;
      st.sel = null;
      st.historial = [];
      resetView();
      paint(); notify();
    }

    function resetView() { st.view = { k: 1, tx: 0, ty: 0 }; }

    function zoom(factor) {
      var w = W(), h = H();
      var cx = w / 2, cy = h / 2;
      var k0 = st.view.k;
      st.view.k = U.clamp(k0 * factor, 1, ZOOM_MAX);
      st.view.tx = cx - (cx - st.view.tx) * (st.view.k / k0);
      st.view.ty = cy - (cy - st.view.ty) * (st.view.k / k0);
      clampView();
      paint();
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    return {
      state: st,
      fit: fit,
      paint: paint,
      setTool: function (t) { st.tool = t; if (t !== "Mover") { st.sel = null; paint(); } },
      setColor: function (c) { st.color = c; },
      setMode: function (m) { st.modo = m; paint(); },
      getMode: function () { return st.modo; },
      getItems: function () { return st.items; },
      selected: selected,
      rotar: rotar, enderezar: enderezar, duplicar: duplicar,
      borrar: borrar, vaciar: vaciar, undo: undo, puedeDeshacer: puedeDeshacer,
      cargar: cargar, zoom: zoom, resetView: resetView,
      repaintSel: function () { paint(); }
    };
  }

  window.CB.scene = { create: create };
})();
