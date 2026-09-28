/* =============================================================
   CoachBoard · core/store.js
   Persistencia y acceso a los datos. Nadie más toca localStorage.
   ============================================================= */
(function () {
  "use strict";

  var KEY = "coachboard.v1";
  var LEGACY = "entrenadorpro.v1";     // datos de versiones anteriores
  var U = window.CB.util;

  /* Función, no constante: si fuera un objeto literal compartido, todas
     las bases de datos "vacías" apuntarían a los mismos arrays y unas
     escribirían sobre otras. */
  function vacio() {
    return {
      club: "",
      jugadores: [],
      eventos: [],
      asistencia: [],
      ejercicios: [],
      tacticas: [],
      partidos: [],
      match: null,
      tac: null
    };
  }

  var storageOk = true;

  /* Rellena lo que falte para que datos antiguos sigan valiendo. */
  function normalize(db) {
    var d = Object.assign(vacio(), db || {});
    ["jugadores", "eventos", "asistencia", "ejercicios", "tacticas", "partidos"].forEach(function (k) {
      if (!Array.isArray(d[k])) d[k] = [];
    });

    d.jugadores.forEach(function (j) {
      if (j.rot === undefined) j.rot = 0;
      if (!j.estado) j.estado = "Disponible";
      if (j.fechaNac === undefined) j.fechaNac = "";
      if (j.notas === undefined) j.notas = "";
      if (j.tel === undefined) j.tel = "";
    });

    /* Estados de asistencia: se unifican los nombres antiguos. */
    d.asistencia.forEach(function (a) {
      if (!Array.isArray(a.regs)) a.regs = [];
      a.regs.forEach(function (r) {
        if (r.e === "Justif.") r.e = "Justificado";
        else if (r.e === "Lesion." || r.e === "Lesionado") r.e = "Justificado";
        else if (r.e === "Tarde") r.e = "Presente";
        if (["Presente", "Ausente", "Justificado", "Pendiente"].indexOf(r.e) < 0) r.e = "Pendiente";
      });
    });

    /* Las piezas de la pizarra necesitan rotación y escala. */
    d.ejercicios.forEach(function (e) {
      if (!Array.isArray(e.items)) e.items = [];
      e.items.forEach(fixItem);
      if (e.categoria === undefined) e.categoria = "";
      if (e.desc === undefined) e.desc = "";
      if (e.jugadores === undefined) e.jugadores = "";
      if (e.min === undefined) e.min = "";
      if (e.modo === undefined) e.modo = "Completo";
    });

    d.tacticas.forEach(function (t) {
      if (!Array.isArray(t.fichas)) t.fichas = [];
    });

    if (d.match && !d.match.fal) d.match.fal = {};
    if (d.match && !d.match.goles) d.match.goles = [];
    if (d.match && !d.match.titulares) d.match.titulares = [];
    if (d.match) d.match.run = false;     // nunca se reanuda solo al abrir

    d.partidos.forEach(function (p) {
      if (!Array.isArray(p.goles)) p.goles = [];
      if (!Array.isArray(p.titulares)) p.titulares = [];
      if (!Array.isArray(p.log)) p.log = [];
      if (!Array.isArray(p.jug)) p.jug = [];
    });

    return d;
  }

  function fixItem(it) {
    if (it.rot === undefined) it.rot = 0;
    if (it.scale === undefined) it.scale = 1;
    if (it.x2 === undefined) it.x2 = it.x;
    if (it.y2 === undefined) it.y2 = it.y;
    if (it.txt === undefined) it.txt = "";
    if (it.estilo === undefined) it.estilo = "";
    if (!it.id) it.id = U.uid();
    return it;
  }

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function load() {
    var data = null;
    try {
      data = read(KEY);
      if (!data) {
        data = read(LEGACY);          // primera apertura tras actualizar
        if (data) { window.DB = normalize(data); save(); return; }
      }
    } catch (e) {
      storageOk = false;
      banner();
    }
    window.DB = normalize(data);
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(window.DB));
    } catch (e) {
      if (storageOk) { storageOk = false; banner(); }
    }
  }

  function banner() {
    var b = U.$("banner");
    if (!b) return;
    b.hidden = false;
    b.textContent = "Este visor no puede guardar datos. Instala la aplicación para conservar la plantilla.";
  }

  /* --- accesos frecuentes ----------------------------------- */
  function jug(id) {
    return window.DB.jugadores.filter(function (j) { return j.id === id; })[0] || null;
  }
  function ev(id) {
    return window.DB.eventos.filter(function (e) { return e.id === id; })[0] || null;
  }
  function club() { return window.DB.club || "Mi equipo"; }

  function evDate(e) { return new Date(e.fecha + "T" + (e.hora || "00:00")); }
  function evSorted() {
    return window.DB.eventos.slice().sort(function (a, b) { return evDate(a) - evDate(b); });
  }
  function evTitle(e) { return e.rival ? e.tipo + " vs " + e.rival : e.tipo; }
  function isMatch(e) { return e.tipo !== "Entrenamiento" && e.tipo !== "Reunion"; }

  function nextEvents(filterFn) {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return evSorted().filter(function (e) {
      return evDate(e) >= now && (!filterFn || filterFn(e));
    });
  }

  /* Porcentaje de asistencia. Los "Pendiente" no cuentan: son
     jugadores sobre los que todavía no se ha decidido nada. */
  function attPct(id) {
    var t = 0, p = 0;
    window.DB.asistencia.forEach(function (a) {
      a.regs.forEach(function (r) {
        if (r.j !== id || r.e === "Pendiente") return;
        t++;
        if (r.e === "Presente") p++;
      });
    });
    return t ? { pct: Math.round(100 * p / t), t: t, p: p } : null;
  }

  function squadAttendance() {
    var tot = 0, n = 0;
    window.DB.jugadores.forEach(function (j) {
      var a = attPct(j.id);
      if (a) { tot += a.pct; n++; }
    });
    return n ? Math.round(tot / n) : null;
  }

  /* --- copia de seguridad ------------------------------------ */
  function backup() {
    window.download(
      "coachboard_" + new Date().toISOString().slice(0, 10) + ".json",
      new Blob([JSON.stringify(window.DB)], { type: "application/json" })
    );
    U.toast("Copia descargada");
  }

  function restore(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        window.DB = normalize(JSON.parse(r.result));
        save();
        window.CB.shell.closeSheet();
        window.CB.app.renderAll();
        U.toast("Copia restaurada");
      } catch (e) {
        U.toast("El archivo no es válido");
      }
    };
    r.readAsText(f);
  }

  window.CB.store = {
    load: load, save: save, normalize: normalize, fixItem: fixItem,
    jug: jug, ev: ev, club: club,
    evDate: evDate, evSorted: evSorted, evTitle: evTitle, isMatch: isMatch,
    nextEvents: nextEvents, attPct: attPct, squadAttendance: squadAttendance,
    backup: backup, restore: restore
  };

  /* Atajos globales usados por todas las pantallas. */
  window.save = save;
  window.jug = jug;
  window.ev = ev;
  window.attPct = attPct;
})();
