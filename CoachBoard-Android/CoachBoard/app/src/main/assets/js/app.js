/* =============================================================
   CoachBoard · app.js
   Arranque y conexión entre pantallas.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;

  function renderAll() {
    window.CB.dashboard.render();
    window.CB.squad.render();
    window.CB.agenda.render();
    window.CB.attendance.render();
    window.CB.match.render();
    window.CB.drills.render();
    window.CB.tactics.render();
  }

  function ajustarLienzos() {
    if (window.CB.drills.fit) window.CB.drills.fit();
    if (window.CB.tactics.fit) window.CB.tactics.fit();
  }

  function boot() {
    S.load();

    window.CB.shell.init();
    U.txt("topSub", S.club());

    /* Al abrir se reponen los avisos: el calendario puede haber
       cambiado desde la última vez. */
    try { window.CB.avisos.programar(); } catch (e) { /* sin contenedor */ }

    /* Cada pantalla se refresca al entrar: así nunca se ve
       información vieja aunque se haya editado en otro sitio. */
    window.CB.shell.onEnter("home", function () { window.CB.dashboard.render(); });
    window.CB.shell.onEnter("squad", function () { window.CB.squad.render(); });
    window.CB.shell.onEnter("agenda", function () { window.CB.agenda.render(); });
    window.CB.shell.onEnter("att", function () { window.CB.attendance.render(); });
    window.CB.shell.onEnter("match", function () { window.CB.match.render(); });
    window.CB.shell.onEnter("board", function () { window.CB.drills.onEnter(); });
    window.CB.shell.onEnter("tac", function () { window.CB.tactics.onEnter(); });

    window.CB.drills.init();
    window.CB.tactics.init();
    renderAll();
    ajustarLienzos();

    /* El reloj nunca se reanuda solo: el entrenador decide. */
    if (window.DB.match) window.DB.match.run = false;
  }

  window.addEventListener("resize", function () {
    clearTimeout(window._cbrz);
    window._cbrz = setTimeout(ajustarLienzos, 150);
  });
  window.addEventListener("orientationchange", function () {
    setTimeout(ajustarLienzos, 320);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) S.save();
  });
  window.addEventListener("beforeunload", function () { S.save(); });

  window.CB.app = { boot: boot, renderAll: renderAll, ajustarLienzos: ajustarLienzos };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
