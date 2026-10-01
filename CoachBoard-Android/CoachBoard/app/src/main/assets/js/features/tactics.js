/* =============================================================
   CoachBoard · features/tactics.js
   Pizarra táctica: once contra once sobre el campo completo.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;
  var M = window.CB.models;
  var P = window.CB.pitch;

  var canvas = null, g = null;
  var fichas = [];
  var sel = null;
  var arrastre = null;
  var verRival = true;
  var ultimoToque = 0;
  var iniciado = false;

  function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }
  function W() { return canvas.width / dpr(); }
  function H() { return canvas.height / dpr(); }
  function radio() { return Math.max(12, Math.min(22, W() / 32)); }

  function init() {
    if (iniciado) return;
    iniciado = true;
    canvas = U.$("cTac");
    g = canvas.getContext("2d");

    if (window.DB.tac && window.DB.tac.length) {
      fichas = window.DB.tac;
      asegurarBalon();          // las pizarras de antes no lo traían
      guardarEstado();
    } else {
      reiniciar();
      guardarEstado();          // deja el estado inicial ya persistido
    }
    verRival = fichas.some(function (f) { return f.eq === "B" && f.vis; });

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    construirSelectores();
    fit();
  }

  function reiniciar() {
    fichas = [];
    M.FORMS["4-4-2"].forEach(function (c, i) {
      fichas.push({ id: U.uid(), eq: "A", x: c[0], y: c[1], d: String(i + 1), n: "", vis: true });
    });
    M.FORMS["4-3-3"].forEach(function (c, i) {
      fichas.push({ id: U.uid(), eq: "B", x: 1 - c[0], y: c[1], d: String(i + 1), n: "", vis: true });
    });
    asegurarBalon();
  }

  /* El balón es una ficha más, pero de un equipo que no existe: así
     las formaciones, los nombres del once y el botón de ocultar al
     rival (que filtran por "A" y "B") no lo tocan nunca. */
  function esBalon(f) { return f.eq === "BAL"; }
  function asegurarBalon() {
    if (fichas.some(esBalon)) return;
    fichas.push({ id: U.uid(), eq: "BAL", x: 0.5, y: 0.5, d: "", n: "", vis: true });
  }

  function construirSelectores() {
    var ops = Object.keys(M.FORMS);
    U.set("tacForm1", ops.map(function (f) {
      return '<option ' + (f === "4-4-2" ? "selected" : "") + '>' + f + '</option>';
    }).join(""));
    U.set("tacForm2", ops.map(function (f) {
      return '<option ' + (f === "4-3-3" ? "selected" : "") + '>' + f + '</option>';
    }).join(""));
  }

  function fit() {
    if (!canvas) return;
    var w = canvas.parentElement.clientWidth;
    if (!w) return;
    var apaisado = window.innerWidth > window.innerHeight;
    var h = Math.round(apaisado
      ? Math.min(w * 0.62, Math.max(220, window.innerHeight - 180))
      : w * 0.66);
    var d = dpr();
    canvas.width = w * d;
    canvas.height = h * d;
    canvas.style.height = h + "px";
    g.setTransform(d, 0, 0, d, 0, 0);
    paint();
  }

  function paint() {
    if (!canvas) return;
    var w = W(), h = H(), r = radio();
    g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    P.drawPitch(g, w, h, "Completo");
    /* El balón se pinta el último para que quede por encima de las
       fichas: si queda debajo parece que ha desaparecido. */
    fichas.forEach(function (f) {
      if (!f.vis || esBalon(f)) return;
      var col = f.eq === "A"
        ? (f.d === "1" ? M.COLS.Amarillo : M.COLS.Azul)
        : (f.d === "1" ? M.COLS.Amarillo : M.COLS.Rojo);
      P.token(g, f.x * w, f.y * h, r, col, f.d, f.n || "", sel === f.id);
    });
    fichas.forEach(function (f) {
      if (!f.vis || !esBalon(f)) return;
      P.ball(g, f.x * w, f.y * h, r * 0.62, sel === f.id);
    });
  }

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, W: r.width, H: r.height };
  }

  function onDown(e) {
    canvas.setPointerCapture(e.pointerId);
    var p = pos(e), r = radio();
    var hit = null;
    /* El balón se busca primero: se pinta encima, así que también
       tiene que cogerse antes aunque esté sobre una ficha. */
    for (var b = fichas.length - 1; b >= 0 && !hit; b--) {
      var fb = fichas[b];
      if (esBalon(fb) && fb.vis &&
          Math.hypot(p.x - fb.x * p.W, p.y - fb.y * p.H) < r * 1.3) hit = fb;
    }
    for (var i = fichas.length - 1; i >= 0 && !hit; i--) {
      var f = fichas[i];
      if (f.vis && !esBalon(f) &&
          Math.hypot(p.x - f.x * p.W, p.y - f.y * p.H) < r * 1.6) hit = f;
    }
    var ahora = Date.now();
    if (hit && !esBalon(hit) && ahora - ultimoToque < 330 && sel === hit.id) {
      ultimoToque = 0;
      editarFicha(hit);
      return;
    }
    ultimoToque = ahora;
    sel = hit ? hit.id : null;
    arrastre = hit;
    paint();
  }

  function onMove(e) {
    if (!arrastre) return;
    var p = pos(e);
    arrastre.x = U.clamp(p.x / p.W, .02, .98);
    arrastre.y = U.clamp(p.y / p.H, .03, .97);
    paint();
  }

  function onUp() {
    if (arrastre) {
      arrastre = null;
      guardarEstado();
    }
  }

  function guardarEstado() {
    window.DB.tac = fichas;
    S.save();
  }

  function editarFicha(f) {
    window.CB.shell.openSheet("Ficha",
      '<div class="grid-2">' +
      '<div><label class="f">Dorsal</label><input id="tfD" value="' + U.esc(f.d) + '" inputmode="numeric"></div>' +
      '<div><label class="f">Nombre corto</label><input id="tfN" value="' + U.esc(f.n || "") + '"></div>' +
      '</div>',
      [
        { text: "Cancelar", cls: "ghost", fn: window.CB.shell.closeSheet },
        {
          text: "Aceptar", cls: "pri", fn: function () {
            var d = U.val("tfD").trim();
            if (d) f.d = d;
            f.n = U.val("tfN").trim();
            guardarEstado();
            window.CB.shell.closeSheet();
            paint();
          }
        }
      ]);
  }

  /* ---------------------------------------------------------
     Formaciones
     --------------------------------------------------------- */
  function aplicar(eq) {
    var nombre = U.val(eq === "A" ? "tacForm1" : "tacForm2");
    var c = M.FORMS[nombre] || M.FORMS["4-4-2"];
    fichas.filter(function (f) { return f.eq === eq; }).forEach(function (f, i) {
      if (!c[i]) return;
      f.x = eq === "A" ? c[i][0] : 1 - c[i][0];
      f.y = c[i][1];
    });
    guardarEstado();
    paint();
    U.toast(nombre + " aplicado");
  }

  function nombresPlantilla() {
    var once = [];
    if (window.DB.match && window.DB.match.campo.length) once = window.DB.match.campo;
    else once = window.DB.jugadores.slice()
      .sort(function (a, b) { return (a.dorsal || 99) - (b.dorsal || 99); })
      .slice(0, 11).map(function (j) { return j.id; });
    if (!once.length) { U.toast("No hay plantilla"); return; }
    fichas.filter(function (f) { return f.eq === "A"; }).forEach(function (f, i) {
      var j = S.jug(once[i]);
      if (j) { f.d = String(j.dorsal); f.n = String(j.nombre).split(" ")[0]; }
    });
    guardarEstado();
    paint();
    U.toast("Nombres del once cargados");
  }

  function alternarRival() {
    verRival = !verRival;
    fichas.filter(function (f) { return f.eq === "B"; }).forEach(function (f) { f.vis = verRival; });
    guardarEstado();
    paint();
    render();
  }

  /* ---------------------------------------------------------
     Pizarras guardadas
     --------------------------------------------------------- */
  function guardar() {
    window.CB.shell.openSheet("Guardar pizarra",
      '<label class="f">Nombre</label><input id="tacNom" placeholder="Plan de partido" value="">',
      [
        { text: "Cancelar", cls: "ghost", fn: window.CB.shell.closeSheet },
        {
          text: "Guardar", cls: "pri", fn: function () {
            var nombre = U.val("tacNom").trim();
            if (!nombre) { U.toast("Ponle un nombre"); return; }
            window.DB.tacticas = window.DB.tacticas.filter(function (t) { return t.nombre !== nombre; });
            window.DB.tacticas.push({
              id: U.uid(), nombre: nombre,
              form1: U.val("tacForm1"), form2: U.val("tacForm2"),
              fichas: JSON.parse(JSON.stringify(fichas))
            });
            S.save();
            window.CB.shell.closeSheet();
            render();
            U.toast("Pizarra guardada");
          }
        }
      ]);
  }

  function cargar(id) {
    var t = window.DB.tacticas.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    fichas = JSON.parse(JSON.stringify(t.fichas));
    asegurarBalon();            // pizarras guardadas antes del balón
    sel = null;
    verRival = fichas.some(function (f) { return f.eq === "B" && f.vis; });
    if (t.form1) U.$("tacForm1").value = t.form1;
    if (t.form2) U.$("tacForm2").value = t.form2;
    guardarEstado();
    paint();
    render();
    window.scrollTo(0, 0);
    U.toast("Pizarra cargada");
  }

  function borrar(id) {
    if (!window.CB.shell.confirmar("¿Eliminar esta pizarra?")) return;
    window.DB.tacticas = window.DB.tacticas.filter(function (x) { return x.id !== id; });
    S.save();
    render();
  }

  function png() {
    var W2 = 1600, H2 = 1040;
    var c = document.createElement("canvas");
    c.width = W2; c.height = H2;
    var gg = c.getContext("2d");
    P.drawPitch(gg, W2, H2, "Completo");
    fichas.forEach(function (f) {
      if (!f.vis) return;
      var col = f.eq === "A"
        ? (f.d === "1" ? M.COLS.Amarillo : M.COLS.Azul)
        : (f.d === "1" ? M.COLS.Amarillo : M.COLS.Rojo);
      P.token(gg, f.x * W2, f.y * H2, 28, col, f.d, f.n || "", false);
    });
    c.toBlob(function (b) { window.download("tactica.png", b); }, "image/png");
    U.toast("Imagen descargada");
  }

  function render() {
    var h = '<div class="grid-3">' +
      '<button class="btn sm" onclick="CB.tactics.nombres()">' + U.svg("squad") + 'Nombres</button>' +
      '<button class="btn sm" onclick="CB.tactics.rival()">' + U.svg(verRival ? "x" : "check") +
        (verRival ? "Sin rival" : "Con rival") + '</button>' +
      '<button class="btn sm" onclick="CB.tactics.png()">' + U.svg("download") + 'PNG</button>' +
      '</div>';

    h += '<button class="btn sm pri wide mt1" onclick="CB.tactics.guardar()">' +
      U.svg("save") + 'Guardar pizarra</button>';

    h += '<div class="section"><span class="eyebrow">Pizarras guardadas</span>' +
      '<span class="link">' + window.DB.tacticas.length + '</span></div>';

    h += window.DB.tacticas.length
      ? '<div class="plist">' + window.DB.tacticas.slice().reverse().map(function (t) {
          return '<div class="prow">' +
            '<span class="num-badge sm">' + U.svg("tactics") + '</span>' +
            '<div class="pmain" onclick="CB.tactics.cargar(\'' + t.id + '\')">' +
            '<div class="nm">' + U.esc(t.nombre) + '</div>' +
            '<div class="sub">' + U.esc(t.form1 || "") + (t.form2 ? " vs " + U.esc(t.form2) : "") + '</div></div>' +
            '<button class="btn sm ghost" onclick="CB.tactics.borrar(\'' + t.id + '\')">' + U.svg("trash") + '</button>' +
            '</div>';
        }).join("") + '</div>'
      : '<div class="empty">Coloca a los tuyos y guarda el plan para el próximo rival.</div>';

    U.set("tacBody", h);
  }

  function onEnter() {
    init();
    requestAnimationFrame(fit);
    render();
  }

  window.CB.tactics = {
    init: init, onEnter: onEnter, render: render, fit: fit,
    aplicar: aplicar, nombres: nombresPlantilla, rival: alternarRival,
    guardar: guardar, cargar: cargar, borrar: borrar, png: png
  };
})();
