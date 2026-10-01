/* =============================================================
   CoachBoard · core/util.js
   Utilidades sin estado: texto, fechas, DOM, iconos, descargas.
   ============================================================= */
(function () {
  "use strict";

  /* --- texto ------------------------------------------------ */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* --- tiempo ----------------------------------------------- */
  function mmss(s) {
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function fmtDate(s) {
    if (!s) return "";
    var d = new Date(s + "T12:00");
    if (isNaN(d)) return s;
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  }
  function fmtDateLong(s) {
    if (!s) return "";
    var d = new Date(s + "T12:00");
    if (isNaN(d)) return s;
    var t = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function dayLabel(s) {
    if (!s) return "";
    var d = new Date(s + "T12:00");
    if (isNaN(d)) return s;
    var t = d.toLocaleDateString("es-ES", { weekday: "long" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function today() { return new Date().toISOString().slice(0, 10); }

  /* --- DOM -------------------------------------------------- */
  function $(id) { return document.getElementById(id); }
  function set(id, html) { var e = $(id); if (e) e.innerHTML = html; }
  function txt(id, t) { var e = $(id); if (e) e.textContent = t; }
  function show(id, on) { var e = $(id); if (e) e.classList.toggle("hidden", !on); }
  function val(id) { var e = $(id); return e ? e.value : ""; }

  function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove("on"); }, 1900);
  }

  /* --- iconos ------------------------------------------------
     Un único juego de trazos, para que toda la app se dibuje igual. */
  var ICON = {
    home: '<path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    squad: '<circle cx="9" cy="8" r="3.1"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 11a3 3 0 1 0-2-5.2"/><path d="M17.6 20c0-2.2-.8-4.1-2.1-5.4"/>',
    match: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V10M9.6 2.5h4.8M19 6l1.3-1.3"/>',
    drills: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M12 4.5v15M3 12h2.4M21 12h-2.4"/><circle cx="12" cy="12" r="2.4"/>',
    tactics: '<circle cx="6" cy="6.5" r="2"/><circle cx="18" cy="6.5" r="2"/><circle cx="12" cy="12.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="18.5" r="2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    attendance: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="2.8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.6 4.4a2 2 0 1 1 4 0A1.6 1.6 0 0 0 16.3 5.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.2 11a2 2 0 1 1 0 4"/>',

    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chev: '<path d="m9 5 7 7-7 7"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    play: '<path d="M7 4.5v15l13-7.5z"/>',
    pause: '<path d="M8 4.5v15M16 4.5v15"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 3.5L16 11H5"/>',
    whistle: '<path d="M4 9h9l6-3v11l-6-3H4z"/><circle cx="4" cy="12" r="2.6"/>',
    ball: '<circle cx="12" cy="12" r="8.6"/><path d="m12 7.4 4 2.9-1.5 4.7h-5L8 10.3z"/>',
    swap: '<path d="M7 5v14M7 5 4 8.3M7 5l3 3.3M17 19V5m0 14-3-3.3m3 3.3 3-3.3"/>',
    card: '<rect x="7" y="3.5" width="10" height="17" rx="1.6"/>',
    rotl: '<path d="M3.5 8.5h6v-6"/><path d="M3.9 15a8.5 8.5 0 1 0 1.3-7.1"/>',
    rotr: '<path d="M20.5 8.5h-6v-6"/><path d="M20.1 15A8.5 8.5 0 1 1 18.8 7.9"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 5.5v-1a1 1 0 0 0-1-1h-10a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/>',
    trash: '<path d="M4 6.5h16M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7M6.5 6.5 7.4 20a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-13.5"/>',
    undo: '<path d="M4 9.5h7.5A5.5 5.5 0 1 1 11.5 20.5H7"/><path d="M7.5 5.5 3.5 9.5l4 4"/>',
    eraser: '<path d="M4.5 16.5 11 10l6 6-3.5 3.5H8z"/><path d="M11 10l3.8-3.8a1.6 1.6 0 0 1 2.3 0l3.7 3.7a1.6 1.6 0 0 1 0 2.3L17 16"/><path d="M4 20.5h16"/>',
    save: '<path d="M5 3.5h11L20.5 8v11.5a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M8 3.5v6h7v-6M8 20.5v-6h8v6"/>',
    pdf: '<path d="M7 3.5h7l4.5 4.5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/>',
    upload: '<path d="M12 15.5v-11M7.5 9 12 4.5 16.5 9M4.5 19.5h15"/>',
    pencil: '<path d="m4.5 19.5 4-.9L19.2 7.9a1.8 1.8 0 0 0 0-2.5l-1.1-1.1a1.8 1.8 0 0 0-2.5 0L5 14.9z"/>',
    sort: '<path d="M7 4.5v15M7 19.5 4 16.5M7 19.5l3-3M17 19.5v-15m0 0-3 3m3-3 3 3"/>',
    zoom: '<path d="M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.4-4.4M8.5 11h5M11 8.5v5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.3 2"/>',
    users2: '<path d="M4 20c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5"/><circle cx="10" cy="7.5" r="3.2"/><path d="M17 14.8c1.9.6 3 2.5 3 5.2"/><circle cx="17.4" cy="8" r="2.4"/>',
    injury: '<path d="M12 4.5v15M4.5 12h15" stroke-width="2.4"/>',
    note: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8 8.5h8M8 12.5h8M8 16.5h5"/>',
    pin: '<path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 1 0-13 0c0 4.9 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4.5 4.5"/>',
    share: '<path d="M12 15.5V4m0 0L8.2 7.8M12 4l3.8 3.8"/><path d="M5 13.5v5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-5"/>',
    bell: '<path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',

    /* piezas de la pizarra */
    t_player: '<circle cx="12" cy="12" r="6.5"/><path d="M12 9v6M9 12h6"/>',
    t_cone: '<path d="M12 4.5 18.5 19h-13z"/><path d="M8.5 14.5h7"/>',
    t_ball: '<circle cx="12" cy="12" r="7.5"/><path d="m12 8 3.4 2.5-1.3 4h-4.2l-1.3-4z"/>',
    t_goal: '<path d="M3 17V7.5h18V17"/><path d="M7 7.5V17M11 7.5V17M15 7.5V17M19 7.5V17M3 12h18"/>',
    t_minigoal: '<path d="M5 15.5v-6h14v6"/><path d="M9.5 9.5v6M14.5 9.5v6"/>',
    t_arrow: '<path d="M4 18 20 6"/><path d="M13.5 6H20v6.5"/>',
    t_line: '<path d="M4 18 20 6" stroke-dasharray="4 3"/>',
    t_zone: '<rect x="4" y="6" width="16" height="12" rx="1.5" stroke-dasharray="4 3"/>',
    t_ladder: '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M7.5 8v8M12 8v8M16.5 8v8"/>',
    t_hurdle: '<path d="M4.5 9.5h15M6 9.5v8M18 9.5v8"/>',
    t_pole: '<path d="M12 3.5v14"/><ellipse cx="12" cy="18.5" rx="4" ry="1.8"/>',
    t_hoop: '<ellipse cx="12" cy="12" rx="8" ry="5"/>',
    t_dummy: '<circle cx="12" cy="6.5" r="2.8"/><path d="M8.5 20.5v-7a3.5 3.5 0 0 1 7 0v7"/>',
    t_text: '<path d="M5 6.5h14M12 6.5v12M9 18.5h6"/>'
  };

  function svg(name, cls) {
    var body = ICON[name] || "";
    return '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : "") + ">" + body + "</svg>";
  }

  /* --- descarga ----------------------------------------------
     Se publica en window para que el contenedor Android pueda
     sustituirla por su puente nativo (guarda en Descargas). */
  window.download = function (name, blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  /* --- impresión ---------------------------------------------
     El contenedor Android reemplaza window.print por el gestor de
     impresión del sistema; en navegador funciona el print normal. */
  function printDoc(title, html) {
    var area = $("printArea");
    if (!area) return;
    area.innerHTML = html;
    var prev = document.title;
    document.title = title || "CoachBoard";
    setTimeout(function () {
      window.print();
      setTimeout(function () {
        document.title = prev;
        area.innerHTML = "";
      }, window.PRINT_CLEAR_MS || 800);
    }, 120);
  }

  window.CB = window.CB || {};
  window.CB.util = {
    esc: esc, uid: uid, clamp: clamp, mmss: mmss,
    fmtDate: fmtDate, fmtDateLong: fmtDateLong, dayLabel: dayLabel, today: today,
    $: $, set: set, txt: txt, show: show, val: val,
    toast: toast, svg: svg, ICON: ICON, printDoc: printDoc
  };

  /* Atajos globales de uso muy frecuente. */
  window.esc = esc;
  window.uid = uid;
  window.toast = toast;
  window.svgIcon = svg;
})();
