/* =============================================================
   CoachBoard · features/attendance.js
   Pasar lista en pocos segundos: un toque por jugador.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;
  var M = window.CB.models;

  var evId = null;
  var estado = {};          // jugadorId -> estado

  function sesiones() {
    return S.evSorted().reverse();
  }

  function elegirSesionPorDefecto() {
    var lista = sesiones();
    if (!lista.length) { evId = null; return; }
    if (evId && lista.some(function (e) { return e.id === evId; })) return;
    /* La sesión más cercana a hoy es casi siempre la que se quiere. */
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var futura = lista.slice().reverse().filter(function (e) { return S.evDate(e) >= hoy; })[0];
    evId = (futura || lista[0]).id;
  }

  function cargarEstado() {
    estado = {};
    var guardada = window.DB.asistencia.filter(function (a) { return a.ev === evId; })[0];
    window.DB.jugadores.forEach(function (j) {
      var r = guardada && guardada.regs.filter(function (x) { return x.j === j.id; })[0];
      if (r) estado[j.id] = r.e;
      else estado[j.id] = j.estado === "Lesionado" ? "Justificado" : "Pendiente";
    });
  }

  function guardar() {
    if (!evId) return;
    window.DB.asistencia = window.DB.asistencia.filter(function (a) { return a.ev !== evId; });
    window.DB.asistencia.push({
      ev: evId,
      regs: Object.keys(estado).map(function (j) { return { j: j, e: estado[j] }; })
    });
    S.save();
  }

  function cuenta(e) {
    return Object.keys(estado).filter(function (k) { return estado[k] === e; }).length;
  }

  function render() {
    elegirSesionPorDefecto();
    cargarEstado();

    var e = evId ? S.ev(evId) : null;
    var arr = window.DB.jugadores.slice().sort(function (a, b) { return (a.dorsal || 99) - (b.dorsal || 99); });
    var total = arr.length;
    var presentes = cuenta("Presente");

    var h = "";

    h += '<label class="f">Sesión</label>' +
      '<select id="attSel" onchange="CB.attendance.cambiarSesion(this.value)">' +
      (sesiones().length
        ? sesiones().map(function (x) {
            return '<option value="' + x.id + '" ' + (x.id === evId ? "selected" : "") + '>' +
              U.fmtDate(x.fecha) + " · " + U.esc(S.evTitle(x)) + '</option>';
          }).join("")
        : '<option value="">Programa antes una sesión</option>') +
      '</select>';

    if (!e) {
      U.set("attBody", h + '<div class="empty mt3"><b>Sin sesiones</b>' +
        'Programa un entrenamiento en el calendario.' +
        '<div class="mt3"><button class="btn sm pri" onclick="CB.agenda.editar(null,\'Entrenamiento\')">Programar</button></div></div>');
      return;
    }

    h += '<div class="card mt2">' +
      '<div class="row-x"><div class="pmain">' +
        '<div class="nm" style="font-size:15.5px">' + U.esc(e.tipo) + '</div>' +
        '<div class="sub">' + U.esc(U.fmtDateLong(e.fecha)) + ' · ' + U.esc(e.hora || "") + '</div>' +
      '</div>' +
      '<div class="pend"><div class="big" style="font-size:19px">' + presentes + ' / ' + total + '</div>' +
      '<div class="small">confirmados</div></div></div></div>';

    h += '<div class="attsum">' +
      res("ok", cuenta("Presente"), "Presentes") +
      res("bad", cuenta("Ausente"), "Ausentes") +
      res("info", cuenta("Justificado"), "Justif.") +
      res("warn", cuenta("Pendiente"), "Pendientes") +
      '</div>';

    h += '<div class="grid-2">' +
      '<button class="btn sm" onclick="CB.attendance.todos(\'Presente\')">' + U.svg("check") + 'Todos presentes</button>' +
      '<button class="btn sm ghost" onclick="CB.attendance.todos(\'Pendiente\')">Reiniciar</button>' +
      '</div>';

    if (!total) {
      h += '<div class="empty mt3"><b>No hay jugadores</b>Da de alta la plantilla primero.</div>';
    } else {
      h += '<div class="plist mt2">' + arr.map(filaJugador).join("") + '</div>';
      h += '<div class="section"><span class="eyebrow">Quién viene a entrenar</span></div>' + ranking();
    }

    U.set("attBody", h);
  }

  function res(cls, v, k) {
    return '<div class="s ' + cls + '"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
  }

  function filaJugador(j) {
    var e = estado[j.id] || "Pendiente";
    return '<div class="prow" id="att-' + j.id + '" onclick="CB.attendance.ciclar(\'' + j.id + '\')">' +
      '<span class="attmark ' + e + '" id="attmk-' + j.id + '">' + M.ATT_GLYPH[e] + '</span>' +
      '<div class="pmain"><div class="nm">' + U.esc(j.nombre) + '</div>' +
      '<div class="sub" id="attlb-' + j.id + '">' + e + '</div></div>' +
      '<span class="num-badge sm">' + (j.dorsal || "–") + '</span></div>';
  }

  function ranking() {
    var arr = window.DB.jugadores.map(function (j) { return { j: j, a: S.attPct(j.id) }; })
      .filter(function (x) { return x.a; })
      .sort(function (x, y) { return y.a.pct - x.a.pct; });
    if (!arr.length) return '<div class="empty">Guarda alguna lista para ver el ranking.</div>';
    return '<div class="plist">' + arr.map(function (x) {
      var col = x.a.pct >= 85 ? "var(--accent)" : x.a.pct < 60 ? "var(--danger)" : "var(--text-dim)";
      return '<div class="prow"><span class="num-badge sm">' + (x.j.dorsal || "–") + '</span>' +
        '<div class="pmain"><div class="nm">' + U.esc(x.j.nombre) + '</div>' +
        '<div class="sub">' + x.a.p + ' de ' + x.a.t + ' sesiones</div></div>' +
        '<div class="pend"><div class="big" style="color:' + col + '">' + x.a.pct + '%</div></div></div>';
    }).join("") + '</div>';
  }

  /* Un toque recorre los estados; se guarda al instante. */
  function ciclar(id) {
    var actual = estado[id] || "Pendiente";
    var i = M.ATT_STATES.indexOf(actual);
    estado[id] = M.ATT_STATES[(i + 1) % M.ATT_STATES.length];
    guardar();

    var mk = U.$("attmk-" + id);
    if (mk) {
      mk.className = "attmark " + estado[id] + " pop";
      mk.textContent = M.ATT_GLYPH[estado[id]];
      setTimeout(function () { mk.classList.remove("pop"); }, 140);
    }
    var lb = U.$("attlb-" + id);
    if (lb) lb.textContent = estado[id];
    actualizarResumen();
  }

  function actualizarResumen() {
    var caja = U.$("attBody");
    if (!caja) return;
    var s = caja.querySelectorAll(".attsum .s .v");
    if (s.length === 4) {
      s[0].textContent = cuenta("Presente");
      s[1].textContent = cuenta("Ausente");
      s[2].textContent = cuenta("Justificado");
      s[3].textContent = cuenta("Pendiente");
    }
    var big = caja.querySelector(".card .pend .big");
    if (big) big.textContent = cuenta("Presente") + " / " + window.DB.jugadores.length;
  }

  function todos(e) {
    Object.keys(estado).forEach(function (k) { estado[k] = e; });
    guardar();
    render();
    U.toast(e === "Presente" ? "Todos presentes" : "Lista reiniciada");
  }

  function cambiarSesion(id) { evId = id; render(); }

  function abrir(id) {
    evId = id || evId;
    window.CB.shell.closeSheet();
    window.CB.shell.go("att");
  }

  window.CB.attendance = {
    render: render, ciclar: ciclar, todos: todos,
    cambiarSesion: cambiarSesion, abrir: abrir
  };
})();
