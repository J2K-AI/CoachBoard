/* =============================================================
   CoachBoard · features/avisos.js
   Recordatorios de partidos y entrenamientos.

   Aquí se decide cuándo hay que avisar y qué dice el aviso; el
   contenedor Android solo programa las alarmas. Así la lógica es la
   misma en el móvil y en el PC, donde simplemente no hay a quién
   avisar y la pantalla lo dice.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;

  var DEF = { on: false, vispera: true, visperaHora: 20, antes: 2 };

  function cfg() {
    var c = window.DB.avisos || {};
    return {
      on: !!c.on,
      vispera: c.vispera !== false,
      visperaHora: typeof c.visperaHora === "number" ? c.visperaHora : DEF.visperaHora,
      antes: typeof c.antes === "number" ? c.antes : DEF.antes
    };
  }

  function guardar(c) {
    window.DB.avisos = c;
    S.save();
    programar();
  }

  function soportado() {
    return !!(window.avisosNativos && typeof window.avisosNativos.programar === "function");
  }

  /* ---------------------------------------------------------
     Qué dice cada aviso
     --------------------------------------------------------- */
  /* toISOString pasa a UTC y en el borde del día cambia la fecha. */
  function fechaLocal(d) {
    var m = d.getMonth() + 1, dia = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dia < 10 ? "0" : "") + dia;
  }

  function cuando(e) {
    var hora = (e.hora && /^\d{1,2}:\d{2}$/.test(e.hora)) ? e.hora : "00:00";
    var d = new Date(e.fecha + "T" + (hora.length === 4 ? "0" + hora : hora) + ":00");
    return isNaN(d) ? null : d;
  }

  function titulo(e, momento) {
    var partido = S.isMatch(e);
    var que = partido ? "Partido" : (e.tipo || "Entrenamiento");
    if (momento === "vispera") return que + " mañana" + (partido && e.rival ? " · " + e.rival : "");
    return que + " en " + cfg().antes + " h" + (partido && e.rival ? " · " + e.rival : "");
  }

  function cuerpo(e) {
    var p = [];
    if (e.hora) p.push(e.hora);
    if (e.lugar) p.push(e.lugar + (e.cond === "Visitante" ? " (fuera)" : ""));
    if (S.isMatch(e) && e.rival) p.push("contra " + e.rival);
    return p.join(" · ") || "Sin detalles";
  }

  /* Identificador estable por evento y momento: así reprogramar no
     duplica alarmas y cancelar encuentra las de antes. */
  function idAviso(e, momento) {
    var s = e.id + "|" + momento, h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 2000000000;
  }

  /** Lista de avisos futuros, lista para el contenedor. */
  function lista(ahora) {
    var c = cfg();
    if (!c.on) return [];
    var t0 = (ahora || new Date()).getTime();
    var out = [];

    window.DB.eventos.forEach(function (e) {
      var d = cuando(e);
      if (!d) return;
      var inicio = d.getTime();
      if (inicio < t0) return;

      if (c.vispera) {
        var v = new Date(d.getTime());
        v.setDate(v.getDate() - 1);
        v.setHours(c.visperaHora, 0, 0, 0);
        if (v.getTime() > t0) {
          out.push({
            id: idAviso(e, "vispera"), cuando: v.getTime(),
            titulo: titulo(e, "vispera"), texto: cuerpo(e)
          });
        }
      }

      if (c.antes > 0) {
        var a = inicio - c.antes * 3600000;
        if (a > t0) {
          out.push({
            id: idAviso(e, "antes"), cuando: a,
            titulo: titulo(e, "antes"), texto: cuerpo(e)
          });
        }
      }
    });

    out.sort(function (x, y) { return x.cuando - y.cuando; });
    return out;
  }

  function programar() {
    if (!soportado()) return 0;
    var l = lista();
    window.avisosNativos.programar(l);
    return l.length;
  }

  /* ---------------------------------------------------------
     Ajustes
     --------------------------------------------------------- */
  function abrir() {
    var c = cfg();
    var horas = [];
    for (var h = 16; h <= 23; h++) horas.push(h);

    var cuerpoHtml =
      (soportado()
        ? ""
        : '<div class="empty mb2"><b>Solo en el móvil</b>' +
          'Los recordatorios los lanza la aplicación de Android. Aquí puedes ' +
          'dejarlos configurados, pero no sonarán en el navegador.</div>') +
      '<label class="pick"><input type="checkbox" id="avOn"' + (c.on ? " checked" : "") + '>' +
        '<span class="pmain"><span class="nm">Avisarme de partidos y entrenos</span>' +
        '<span class="sub">Con la hora, el campo y el rival</span></span></label>' +
      '<label class="pick"><input type="checkbox" id="avVis"' + (c.vispera ? " checked" : "") + '>' +
        '<span class="pmain"><span class="nm">La víspera</span>' +
        '<span class="sub">El día antes, para preparar la bolsa</span></span></label>' +
      '<label class="f">Hora del aviso de la víspera</label>' +
      '<select id="avHora">' + horas.map(function (h) {
        return '<option value="' + h + '"' + (h === c.visperaHora ? " selected" : "") + '>' +
          (h < 10 ? "0" : "") + h + ':00</option>';
      }).join("") + '</select>' +
      '<label class="f">Aviso el mismo día</label>' +
      '<select id="avAntes">' + [0, 1, 2, 3, 4].map(function (n) {
        return '<option value="' + n + '"' + (n === c.antes ? " selected" : "") + '>' +
          (n === 0 ? "No avisar" : n + " h antes") + '</option>';
      }).join("") + '</select>' +
      '<p class="hint mt2" id="avResumen"></p>';

    window.CB.shell.openSheet("Recordatorios", cuerpoHtml, [
      { text: "Cancelar", cls: "ghost", fn: window.CB.shell.closeSheet },
      { text: "Guardar", cls: "pri", fn: aceptar }
    ]);
    resumen();
    ["avOn", "avVis", "avHora", "avAntes"].forEach(function (id) {
      var el = U.$(id);
      if (el) el.onchange = resumen;
    });
  }

  function leerForm() {
    return {
      on: !!(U.$("avOn") && U.$("avOn").checked),
      vispera: !!(U.$("avVis") && U.$("avVis").checked),
      visperaHora: parseInt(U.val("avHora"), 10) || DEF.visperaHora,
      antes: parseInt(U.val("avAntes"), 10) || 0
    };
  }

  /* Enseña cuántos avisos quedarían y cuál es el siguiente: es la
     forma de que el entrenador compruebe que esto hace algo. */
  function resumen() {
    var previo = window.DB.avisos;
    window.DB.avisos = leerForm();
    var l = lista();
    window.DB.avisos = previo;
    var txt;
    if (!l.length) txt = "Ahora mismo no hay nada que avisar.";
    else {
      var p = new Date(l[0].cuando);
      var hh = String(p.getHours()), mm = String(p.getMinutes());
      txt = l.length + (l.length === 1 ? " aviso programado" : " avisos programados") +
        ". El primero, " + U.fmtDate(fechaLocal(p)) +
        " a las " + (hh.length < 2 ? "0" : "") + hh + ":" + (mm.length < 2 ? "0" : "") + mm + ".";
    }
    U.txt("avResumen", txt);
  }

  function aceptar() {
    var c = leerForm();
    if (c.on && soportado() && window.avisosNativos.permitidos &&
        !window.avisosNativos.permitidos()) {
      pendiente = c;
      window.avisosNativos.pedirPermiso();
      return;
    }
    guardar(c);
    window.CB.shell.closeSheet();
    U.toast(c.on ? "Recordatorios activados" : "Recordatorios desactivados");
  }

  var pendiente = null;

  /** La llama el contenedor cuando el usuario responde al permiso. */
  function respuestaPermiso(ok) {
    var c = pendiente || cfg();
    pendiente = null;
    if (!ok) {
      c.on = false;
      guardar(c);
      window.CB.shell.closeSheet();
      U.toast("Sin permiso de notificaciones no se puede avisar");
      return;
    }
    guardar(c);
    window.CB.shell.closeSheet();
    U.toast("Recordatorios activados");
  }

  window.CB.avisos = {
    abrir: abrir, lista: lista, programar: programar,
    cfg: cfg, respuestaPermiso: respuestaPermiso, soportado: soportado
  };
})();
