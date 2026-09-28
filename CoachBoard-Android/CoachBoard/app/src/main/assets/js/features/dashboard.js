/* =============================================================
   CoachBoard · features/dashboard.js
   Pantalla de inicio: lo que el entrenador tiene por delante.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;

  function proximoPartido() {
    return S.nextEvents(function (e) { return S.isMatch(e); })[0] || null;
  }
  function proximaSesion() {
    return S.nextEvents(function (e) { return e.tipo === "Entrenamiento"; })[0] || null;
  }

  function render() {
    var db = window.DB;
    var club = S.club();
    var pm = proximoPartido();
    var ps = proximaSesion();
    var entrenos = S.nextEvents(function (e) { return e.tipo === "Entrenamiento"; }).length;
    var partidos = S.nextEvents(function (e) { return S.isMatch(e); }).length;
    var asis = S.squadAttendance();
    var lesionados = db.jugadores.filter(function (j) { return j.estado === "Lesionado"; }).length;

    var h = "";

    /* --- próximo partido --- */
    h += '<div class="section"><span class="eyebrow">Próximo partido</span>' +
         (pm ? '<button class="link" onclick="CB.shell.go(\'agenda\')">Calendario</button>' : "") +
         '</div>';

    if (pm) {
      var local = pm.cond !== "Visitante";
      var izq = local ? club : (pm.rival || "Rival");
      var der = local ? (pm.rival || "Rival") : club;
      h += '<div class="hero">' +
        '<div class="when"><span class="badge ok"><span class="dot"></span>' +
          U.esc(pm.comp || pm.tipo) + '</span>' +
          '<span class="eyebrow">' + U.esc(pm.cond || "") + '</span></div>' +
        '<div class="versus">' +
          '<div class="team a">' + U.esc(izq) + '</div>' +
          '<div class="vs">VS</div>' +
          '<div class="team">' + U.esc(der) + '</div>' +
        '</div>' +
        '<div class="meta">' +
          '<div>Cuándo<b>' + U.esc(U.dayLabel(pm.fecha)) + ' · ' + U.esc(pm.hora || "") + '</b></div>' +
          (pm.lugar ? '<div>Dónde<b>' + U.esc(pm.lugar) + '</b></div>' : "") +
        '</div>' +
        '<button class="btn pri wide mt3" onclick="CB.dashboard.prepararPartido(\'' + pm.id + '\')">' +
          U.svg("whistle") + 'Preparar partido</button>' +
        '</div>';
    } else {
      h += '<div class="empty"><b>Sin partidos programados</b>' +
        'Añade el próximo encuentro y lo tendrás aquí.' +
        '<div class="mt3"><button class="btn sm pri" onclick="CB.agenda.editar(null,\'Partido\')">' +
        U.svg("plus") + 'Programar partido</button></div></div>';
    }

    /* --- indicadores --- */
    h += '<div class="section"><span class="eyebrow">De un vistazo</span></div>';
    h += '<div class="grid-4r stagger">' +
      kpi(db.jugadores.length, "Jugadores", "") +
      kpi(asis === null ? "—" : asis + "%", "Asistencia", asis !== null && asis >= 85 ? "accent" : "") +
      kpi(entrenos, "Entrenos", "") +
      kpi(partidos, "Partidos", "") +
      '</div>';

    if (lesionados) {
      h += '<div class="card mt1" style="border-color:rgba(245,185,66,.3)">' +
        '<div class="row-x"><span class="badge warn">' + lesionados + '</span>' +
        '<span style="font-size:13.5px">' +
        (lesionados === 1 ? "Un jugador lesionado" : lesionados + " jugadores lesionados") +
        '</span><span class="spacer"></span>' +
        '<button class="btn sm ghost" onclick="CB.shell.go(\'squad\')">Ver</button></div></div>';
    }

    /* --- próxima sesión --- */
    h += '<div class="section"><span class="eyebrow">Próxima sesión</span></div>';
    if (ps) {
      h += '<div class="card lead">' +
        '<div class="row-x"><div class="pmain">' +
          '<div class="nm" style="font-size:15.5px">' + U.esc(ps.tipo) + '</div>' +
          '<div class="sub">' + U.esc(U.dayLabel(ps.fecha)) + ' · ' + U.esc(ps.hora || "") +
            (ps.lugar ? " · " + U.esc(ps.lugar) : "") + '</div>' +
        '</div></div>' +
        (ps.notas ? '<p class="hint" style="margin-top:10px">' + U.esc(ps.notas) + '</p>' : "") +
        '<div class="grid-2 mt2">' +
          '<button class="btn sm" onclick="CB.dashboard.verSesion(\'' + ps.id + '\')">Ver sesión</button>' +
          '<button class="btn sm pri" onclick="CB.attendance.abrir(\'' + ps.id + '\')">Pasar lista</button>' +
        '</div></div>';
    } else {
      h += '<div class="empty"><b>Sin entrenamientos previstos</b>' +
        'Programa la semana para tenerla controlada.' +
        '<div class="mt3"><button class="btn sm" onclick="CB.agenda.editar(null,\'Entrenamiento\')">' +
        U.svg("plus") + 'Programar entrenamiento</button></div></div>';
    }

    /* --- accesos --- */
    h += '<div class="section"><span class="eyebrow">Atajos</span></div>';
    h += '<div class="grid-2">' +
      '<button class="btn" onclick="CB.shell.go(\'board\')">' + U.svg("drills") + 'Pizarra</button>' +
      '<button class="btn" onclick="CB.shell.go(\'tac\')">' + U.svg("tactics") + 'Tácticas</button>' +
      '</div>';

    if (!db.jugadores.length) {
      h += '<div class="empty mt3"><b>Empieza por la plantilla</b>' +
        'Sin jugadores no hay convocatorias ni estadísticas.' +
        '<div class="mt3 grid-2">' +
        '<button class="btn sm pri" onclick="CB.squad.editar(null)">Fichar jugador</button>' +
        '<button class="btn sm" onclick="CB.squad.demo()">Plantilla de ejemplo</button>' +
        '</div></div>';
    }

    U.set("homeBody", h);
  }

  function kpi(v, k, cls) {
    return '<div class="kpi ' + (cls || "") + '"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
  }

  function prepararPartido(evId) {
    window.CB.shell.go("match");
    window.CB.match.seleccionar(evId);
  }

  function verSesion(id) {
    var e = S.ev(id);
    if (!e) return;
    var body = '<div class="dl"><span>Tipo</span><b>' + U.esc(e.tipo) + '</b></div>' +
      '<div class="dl"><span>Fecha</span><b>' + U.esc(U.fmtDateLong(e.fecha)) + '</b></div>' +
      '<div class="dl"><span>Hora</span><b>' + U.esc(e.hora || "—") + '</b></div>' +
      (e.lugar ? '<div class="dl"><span>Lugar</span><b>' + U.esc(e.lugar) + '</b></div>' : "") +
      (e.notas ? '<p class="hint mt2">' + U.esc(e.notas) + '</p>' : "");
    window.CB.shell.openSheet(U.esc(e.tipo), body, [
      { text: "Editar", cls: "ghost", fn: function () { window.CB.shell.closeSheet(); window.CB.agenda.editar(id); } },
      { text: "Pasar lista", cls: "pri", fn: function () { window.CB.attendance.abrir(id); } }
    ]);
  }

  window.CB.dashboard = { render: render, prepararPartido: prepararPartido, verSesion: verSesion };
})();
