/* =============================================================
   CoachBoard · ui/shell.js
   Navegación, hojas modales y armazón de pantallas.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;

  /* Orden de las pantallas. `nav` marca las que van en la barra
     inferior del teléfono; el resto vive dentro de "Más". */
  var VIEWS = [
    { id: "home",   label: "Inicio",    title: "CoachBoard",   icon: "home",       nav: true },
    { id: "squad",  label: "Plantilla", title: "Plantilla",    icon: "squad",      nav: true },
    { id: "match",  label: "Partido",   title: "Partido",      icon: "match",      nav: true },
    { id: "board",  label: "Entrenos",  title: "Entrenamientos", icon: "drills",   nav: true },
    { id: "agenda", label: "Calendario", title: "Calendario",  icon: "calendar" },
    { id: "att",    label: "Asistencia", title: "Asistencia",  icon: "attendance" },
    { id: "tac",    label: "Tácticas",  title: "Tácticas",     icon: "tactics" }
  ];

  var hooks = {};
  var actual = "home";

  function view(id) {
    return VIEWS.filter(function (v) { return v.id === id; })[0];
  }

  function onEnter(id, fn) {
    hooks[id] = (hooks[id] || []).concat(fn);
  }

  /* ---------------------------------------------------------
     Navegación
     --------------------------------------------------------- */
  function buildNav() {
    var nav = U.$("nav");
    var items = VIEWS.filter(function (v) { return v.nav; });
    nav.innerHTML = items.map(function (v) {
      return '<button data-v="' + v.id + '" aria-label="' + v.label + '">' +
        U.svg(v.icon) + v.label + '<span class="pip"></span></button>';
    }).join("") +
      '<button data-v="__more" aria-label="Más">' + U.svg("more") + 'Más<span class="pip"></span></button>';

    nav.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.v === "__more") openMore();
        else go(b.dataset.v);
      };
    });

    var rail = U.$("rail");
    rail.innerHTML = '<div class="logo">' + U.svg("drills") + '</div>' +
      VIEWS.map(function (v) {
        return '<button data-v="' + v.id + '" aria-label="' + v.label + '">' +
          U.svg(v.icon) + v.label + '</button>';
      }).join("") +
      '<div class="spacer"></div>' +
      '<button data-v="__settings" aria-label="Ajustes">' + U.svg("settings") + 'Ajustes</button>';

    rail.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.v === "__settings") window.CB.settings.open();
        else go(b.dataset.v);
      };
    });
  }

  function markNav(id) {
    var enBarra = VIEWS.filter(function (v) { return v.nav; })
      .some(function (v) { return v.id === id; });
    document.querySelectorAll("#nav button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.v === id || (!enBarra && b.dataset.v === "__more"));
    });
    document.querySelectorAll("#rail button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.v === id);
    });
  }

  function go(id) {
    var v = view(id);
    if (!v) return;
    actual = id;
    VIEWS.forEach(function (x) {
      var el = U.$("v-" + x.id);
      if (el) el.classList.toggle("on", x.id === id);
    });
    markNav(id);
    U.txt("topTitle", v.title);
    U.txt("topSub", id === "home" ? (window.CB.store.club()) : (window.CB.store.club()));
    window.scrollTo(0, 0);
    (hooks[id] || []).forEach(function (fn) { fn(); });
  }

  function openMore() {
    var extra = VIEWS.filter(function (v) { return !v.nav; });
    var html = '<div class="plist">' + extra.map(function (v) {
      return '<button class="prow" style="width:100%;text-align:left" onclick="CB.shell.goFromSheet(\'' + v.id + '\')">' +
        '<span class="num-badge">' + U.svg(v.icon) + '</span>' +
        '<span class="pmain"><span class="nm">' + v.label + '</span></span>' +
        '<span class="pend">' + U.svg("chev") + '</span></button>';
    }).join("") +
      '<button class="prow" style="width:100%;text-align:left" onclick="CB.shell.closeSheet();CB.settings.open()">' +
      '<span class="num-badge">' + U.svg("settings") + '</span>' +
      '<span class="pmain"><span class="nm">Ajustes</span>' +
      '<span class="sub">Equipo, copias de seguridad y ayuda</span></span>' +
      '<span class="pend">' + U.svg("chev") + '</span></button></div>';
    openSheet("Más", html, [{ text: "Cerrar", cls: "ghost", fn: closeSheet }]);
  }

  function goFromSheet(id) { closeSheet(); go(id); }

  /* ---------------------------------------------------------
     Hoja modal
     --------------------------------------------------------- */
  function openSheet(title, bodyHtml, buttons) {
    U.txt("sheetTitle", title);
    U.set("sheetBody", bodyHtml);
    var f = U.$("sheetFoot");
    f.innerHTML = "";
    (buttons || []).forEach(function (b) {
      var el = document.createElement("button");
      el.className = "btn " + (b.cls || "");
      el.textContent = b.text;
      el.onclick = b.fn;
      f.appendChild(el);
    });
    U.$("sheet").classList.remove("hidden");
  }

  function closeSheet() {
    U.$("sheet").classList.add("hidden");
  }

  /* Confirmación con el diálogo nativo que aporta el contenedor. */
  function confirmar(msg) { return window.confirm(msg); }

  function init() {
    buildNav();
    U.$("sheet").addEventListener("click", function (e) {
      if (e.target.id === "sheet") closeSheet();
    });
    U.$("btnSettings").onclick = function () { window.CB.settings.open(); };
    go("home");
  }

  window.CB.shell = {
    VIEWS: VIEWS, init: init, go: go, goFromSheet: goFromSheet,
    openSheet: openSheet, closeSheet: closeSheet, onEnter: onEnter,
    confirmar: confirmar, current: function () { return actual; }
  };

  window.openSheet = openSheet;
  window.closeSheet = closeSheet;
})();
