/* =============================================================
   CoachBoard · features/drills.js
   Diseñador de entrenamientos: una pizarra táctica de bolsillo.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;
  var M = window.CB.models;

  var sc = null;                 // instancia del motor de escena
  var ejercicioId = null;
  var meta = { nombre: "Ejercicio sin título", categoria: "", min: "15", jugadores: "", desc: "" };

  function init() {
    if (sc) return;
    sc = window.CB.scene.create({
      canvas: U.$("cDrill"),
      stage: U.$("drillStage"),
      ctxbar: U.$("drillCtx"),
      pill: U.$("drillPill"),
      onEditText: editarTexto,
      onChange: function () { pintarBarraEstado(); }
    });
    construirHerramientas();
    conectarBarraContextual();
    sc.fit();
  }

  /* ---------------------------------------------------------
     Paleta de herramientas
     --------------------------------------------------------- */
  function construirHerramientas() {
    U.set("drillTools", M.TOOLS.map(function (t) {
      return '<button class="tool ' + (t.id === "Mover" ? "on" : "") + '" data-t="' + t.id + '">' +
        U.svg(t.icon) + '<span>' + t.label + '</span></button>';
    }).join(""));

    document.querySelectorAll("#drillTools .tool").forEach(function (b) {
      b.onclick = function () {
        sc.setTool(b.dataset.t);
        document.querySelectorAll("#drillTools .tool").forEach(function (x) {
          x.classList.toggle("on", x === b);
        });
      };
    });

    U.set("drillColors", Object.keys(M.COLS).map(function (c) {
      return '<button class="sw ' + (c === "Azul" ? "on" : "") + '" data-c="' + c +
        '" style="background:' + M.COLS[c] + '" aria-label="' + c + '"></button>';
    }).join(""));

    document.querySelectorAll("#drillColors .sw").forEach(function (b) {
      b.onclick = function () {
        sc.setColor(b.dataset.c);
        document.querySelectorAll("#drillColors .sw").forEach(function (x) {
          x.classList.toggle("on", x === b);
        });
      };
    });

    U.set("drillModes", M.MODOS_CAMPO.map(function (mo) {
      return '<button data-v="' + mo.id + '" class="' + (mo.id === "Completo" ? "on" : "") + '">' +
        mo.label + '</button>';
    }).join(""));

    document.querySelectorAll("#drillModes button").forEach(function (b) {
      b.onclick = function () {
        sc.setMode(b.dataset.v);
        document.querySelectorAll("#drillModes button").forEach(function (x) {
          x.classList.toggle("on", x === b);
        });
      };
    });
  }

  /* Barra flotante sobre la pieza seleccionada. */
  function conectarBarraContextual() {
    U.$("ctxRotL").onclick = function () { sc.rotar(-15); };
    U.$("ctxRotR").onclick = function () { sc.rotar(15); };
    U.$("ctxDup").onclick = function () { sc.duplicar(); };
    U.$("ctxDel").onclick = function () { sc.borrar(); };
  }

  function pintarBarraEstado() {
    var b = U.$("drillUndo");
    if (b) b.disabled = !sc.puedeDeshacer();
  }

  /* ---------------------------------------------------------
     Texto sobre la pizarra
     --------------------------------------------------------- */
  function editarTexto(it) {
    window.CB.shell.openSheet("Texto en la pizarra",
      '<label class="f">Texto</label><input id="drillTxt" value="' + U.esc(it.txt || "") + '" placeholder="Zona de presión">',
      [
        {
          text: "Quitar", cls: "ghost", fn: function () {
            window.CB.shell.closeSheet();
            sc.borrar();
          }
        },
        {
          text: "Aceptar", cls: "pri", fn: function () {
            var t = U.val("drillTxt").trim();
            it.txt = t || "Texto";
            window.CB.shell.closeSheet();
            sc.repaintSel();
          }
        }
      ]);
  }

  /* ---------------------------------------------------------
     Guardar y cargar ejercicios
     --------------------------------------------------------- */
  function guardar() {
    var body =
      '<label class="f">Nombre</label><input id="dNom" value="' + U.esc(meta.nombre) + '" placeholder="Salida de balón 4-3-3">' +
      '<label class="f">Categoría</label><select id="dCat">' +
        '<option value="">Sin categoría</option>' +
        M.CATEGORIAS.map(function (c) {
          return '<option ' + (c === meta.categoria ? "selected" : "") + '>' + c + '</option>';
        }).join("") + '</select>' +
      '<div class="grid-2">' +
        '<div><label class="f">Duración (min)</label><input id="dMin" inputmode="numeric" value="' + U.esc(meta.min) + '"></div>' +
        '<div><label class="f">Jugadores</label><input id="dJug" inputmode="numeric" value="' + U.esc(meta.jugadores) + '"></div>' +
      '</div>' +
      '<label class="f">Descripción</label><textarea id="dDesc" placeholder="Objetivo, reglas y variantes">' +
        U.esc(meta.desc) + '</textarea>';

    window.CB.shell.openSheet("Guardar ejercicio", body, [
      { text: "Cancelar", cls: "ghost", fn: window.CB.shell.closeSheet },
      {
        text: "Guardar", cls: "pri", fn: function () {
          var nombre = U.val("dNom").trim();
          if (!nombre) { U.toast("Ponle un nombre"); return; }
          meta = {
            nombre: nombre,
            categoria: U.val("dCat"),
            min: U.val("dMin"),
            jugadores: U.val("dJug"),
            desc: U.val("dDesc")
          };
          var o = {
            id: ejercicioId || U.uid(),
            nombre: meta.nombre, categoria: meta.categoria,
            min: meta.min, jugadores: meta.jugadores, desc: meta.desc,
            modo: sc.getMode(),
            items: JSON.parse(JSON.stringify(sc.getItems()))
          };
          window.DB.ejercicios = window.DB.ejercicios.filter(function (x) { return x.id !== o.id; });
          window.DB.ejercicios.push(o);
          ejercicioId = o.id;
          S.save();
          window.CB.shell.closeSheet();
          render();
          U.toast("Ejercicio guardado");
        }
      }
    ]);
  }

  function nuevo() {
    sc.cargar([], sc.getMode());
    ejercicioId = null;
    meta = { nombre: "Ejercicio sin título", categoria: "", min: "15", jugadores: "", desc: "" };
    render();
    U.toast("Pizarra vacía");
  }

  function cargar(id) {
    var e = window.DB.ejercicios.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    ejercicioId = e.id;
    meta = {
      nombre: e.nombre, categoria: e.categoria || "",
      min: e.min || "", jugadores: e.jugadores || "", desc: e.desc || ""
    };
    sc.cargar(e.items, e.modo || "Completo");
    document.querySelectorAll("#drillModes button").forEach(function (x) {
      x.classList.toggle("on", x.dataset.v === (e.modo || "Completo"));
    });
    render();
    window.scrollTo(0, 0);
    U.toast("Ejercicio cargado");
  }

  function borrar(id) {
    if (!window.CB.shell.confirmar("¿Eliminar este ejercicio?")) return;
    window.DB.ejercicios = window.DB.ejercicios.filter(function (x) { return x.id !== id; });
    if (ejercicioId === id) ejercicioId = null;
    S.save();
    render();
  }

  function vaciar() {
    if (!sc.getItems().length) return;
    if (!window.CB.shell.confirmar("¿Quitar todas las piezas del campo?")) return;
    sc.vaciar();
  }

  /* ---------------------------------------------------------
     Pintado de la pantalla
     --------------------------------------------------------- */
  function render() {
    var lista = window.DB.ejercicios;
    var h = '<div class="card flat" style="padding:10px 12px">' +
      '<div class="row-x"><div class="pmain">' +
      '<div class="nm">' + U.esc(meta.nombre) + '</div>' +
      '<div class="sub">' +
        (meta.categoria ? U.esc(meta.categoria) + " · " : "") +
        (meta.min ? U.esc(meta.min) + " min" : "sin duración") +
        (meta.jugadores ? " · " + U.esc(meta.jugadores) + " jugadores" : "") +
      '</div></div>' +
      '<button class="btn sm pri" onclick="CB.drills.guardar()">' + U.svg("save") + 'Guardar</button>' +
      '</div></div>';

    h += '<div class="grid-4r mt2">' +
      '<button class="btn sm" id="drillUndo" onclick="CB.drills.undo()">' + U.svg("undo") + 'Deshacer</button>' +
      '<button class="btn sm" onclick="CB.drills.vaciar()">' + U.svg("eraser") + 'Limpiar</button>' +
      '<button class="btn sm" onclick="CB.drills.nuevo()">' + U.svg("plus") + 'Nuevo</button>' +
      '<button class="btn sm" onclick="CB.drills.png()">' + U.svg("download") + 'PNG</button>' +
      '</div>';

    h += '<div class="section"><span class="eyebrow">Mis ejercicios</span>' +
      '<span class="link">' + lista.length + '</span></div>';

    h += lista.length
      ? '<div class="plist">' + lista.slice().reverse().map(function (e) {
          return '<div class="prow">' +
            '<span class="num-badge sm">' + U.svg("drills") + '</span>' +
            '<div class="pmain" onclick="CB.drills.cargar(\'' + e.id + '\')">' +
              '<div class="nm">' + U.esc(e.nombre) + '</div>' +
              '<div class="sub">' +
                (e.categoria ? U.esc(e.categoria) + " · " : "") +
                (e.min ? U.esc(e.min) + " min" : "") +
                (e.jugadores ? " · " + U.esc(e.jugadores) + " jug." : "") +
              '</div></div>' +
            '<button class="btn sm ghost" onclick="CB.drills.borrar(\'' + e.id + '\')">' + U.svg("trash") + '</button>' +
            '</div>';
        }).join("") + '</div>'
      : '<div class="empty">Dibuja un ejercicio y guárdalo: quedará aquí para el resto de la temporada.</div>';

    U.set("drillBody", h);
    pintarBarraEstado();
  }

  function png() {
    var W = 1600, H = 1040;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    window.CB.pitch.drawScene(c.getContext("2d"), W, H, sc.getMode(), sc.getItems(), null);
    var nombre = (meta.nombre || "pizarra").replace(/[^\w\s-]/g, "").trim() || "pizarra";
    c.toBlob(function (b) { window.download(nombre + ".png", b); }, "image/png");
    U.toast("Imagen descargada");
  }

  function onEnter() {
    init();
    requestAnimationFrame(function () { sc.fit(); });
    render();
  }

  window.CB.drills = {
    init: init, render: render, onEnter: onEnter,
    guardar: guardar, nuevo: nuevo, cargar: cargar, borrar: borrar,
    vaciar: vaciar, png: png,
    undo: function () { sc.undo(); },
    zoom: function (f) { sc.zoom(f); },
    fit: function () { if (sc) sc.fit(); },
    /* Acceso al motor de escena: lo usan las pruebas y cualquier
       función futura que necesite manipular la pizarra. */
    escena: function () { return sc; }
  };
})();
