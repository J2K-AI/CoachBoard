/* =============================================================
   CoachBoard · features/settings.js
   Ajustes del equipo, copias de seguridad y ayuda.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;

  function open() {
    var body =
      '<label class="f">Nombre del equipo</label>' +
      '<input id="cfgClub" value="' + U.esc(window.DB.club || "") + '" placeholder="UD Ejemplo">' +
      '<p class="hint">Aparece en la cabecera, en el marcador y en los documentos PDF.</p>' +
      '<button class="btn pri wide mt1" onclick="CB.settings.guardarClub()">Guardar nombre</button>' +

      '<div class="section"><span class="eyebrow">Datos</span></div>' +
      '<p class="hint">Todo se guarda en este dispositivo. Descarga una copia de vez en cuando y guárdala donde quieras.</p>' +
      '<button class="btn wide" onclick="CB.store.backup()">' + U.svg("download") + 'Descargar copia de seguridad</button>' +
      '<button class="btn wide mt1" onclick="document.getElementById(\'cfgImp\').click()">' +
        U.svg("upload") + 'Restaurar copia</button>' +
      '<input type="file" id="cfgImp" accept=".json,application/json" hidden onchange="CB.store.restore(this)">' +
      '<button class="btn wide mt1" onclick="CB.settings.ejemplo()">' + U.svg("users2") + 'Cargar plantilla de ejemplo</button>' +

      '<div class="section"><span class="eyebrow">Ayuda</span></div>' +
      '<button class="btn wide" onclick="CB.settings.guia()">' + U.svg("note") + 'Guía rápida</button>';

    window.CB.shell.openSheet("Ajustes", body, [
      { text: "Cerrar", cls: "ghost", fn: window.CB.shell.closeSheet }
    ]);
  }

  function guardarClub() {
    window.DB.club = U.val("cfgClub").trim();
    S.save();
    U.txt("topSub", S.club());
    window.CB.app.renderAll();
    U.toast("Equipo guardado");
  }

  function ejemplo() {
    window.CB.shell.closeSheet();
    window.CB.squad.demo();
  }

  function guia() {
    var body =
      '<div class="dl"><span>Inicio</span><b>Qué viene ahora</b></div>' +
      '<p class="hint">Próximo partido, asistencia media y la siguiente sesión. Desde aquí se prepara el partido de un toque.</p>' +

      '<div class="dl"><span>Partido</span><b>Acción y jugador</b></div>' +
      '<p class="hint">Convoca, coloca el once y arranca el reloj: los minutos de los que están en el campo suben solos. ' +
      'Pulsa primero la acción (gol, cambio, tarjeta) y después elige al jugador. En el gol te pregunta el tipo ' +
      'y, si fue de jugada o de córner, quién dio la asistencia.</p>' +

      '<div class="dl"><span>Asistencia</span><b>Un toque por jugador</b></div>' +
      '<p class="hint">Cada toque recorre presente, ausente, justificado y pendiente. Se guarda al instante.</p>' +

      '<div class="dl"><span>Pizarra</span><b>Colocar y girar</b></div>' +
      '<p class="hint">Elige una pieza en la barra y toca el campo. Con <b>Mover</b> seleccionas: aparece una barra ' +
      'flotante para girar 15°, duplicar o borrar, y un tirador amarillo encima de la pieza para girarla libremente. ' +
      'Girar nunca desplaza la pieza. Con dos dedos se acerca y se desplaza el campo.</p>' +

      '<div class="dl"><span>Tácticas</span><b>22 fichas</b></div>' +
      '<p class="hint">Arrastra a los jugadores y aplica formaciones a cada equipo. Doble toque en una ficha para ' +
      'cambiar dorsal y nombre.</p>' +

      '<div class="dl"><span>Documentos</span><b>Acta y ficha en PDF</b></div>' +
      '<p class="hint">Al cerrar un acta puedes generarla en PDF, y cada jugador tiene su ficha con estadísticas. ' +
      'Elige "Guardar como PDF" en el diálogo de impresión.</p>';

    window.CB.shell.openSheet("Guía rápida", body, [
      { text: "Entendido", cls: "pri", fn: window.CB.shell.closeSheet }
    ]);
  }

  window.CB.settings = { open: open, guardarClub: guardarClub, ejemplo: ejemplo, guia: guia };
})();
