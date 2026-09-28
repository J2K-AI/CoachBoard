/* =============================================================
   CoachBoard · features/agenda.js
   Calendario de partidos y entrenamientos.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;
  var M = window.CB.models;

  function render() {
    var ahora = new Date(); ahora.setHours(0, 0, 0, 0);
    var todos = S.evSorted();
    var prox = todos.filter(function (e) { return S.evDate(e) >= ahora; });
    var pasados = todos.filter(function (e) { return S.evDate(e) < ahora; }).reverse();

    var h = '<div class="section"><span class="eyebrow">Próximas</span>' +
      '<span class="link">' + prox.length + '</span></div>';
    h += prox.length
      ? '<div class="plist stagger">' + prox.map(fila).join("") + '</div>'
      : '<div class="empty"><b>Nada programado</b>Añade el próximo entrenamiento o partido.</div>';

    h += '<div class="section"><span class="eyebrow">Ya disputadas</span></div>';
    h += pasados.length
      ? '<div class="plist">' + pasados.slice(0, 40).map(fila).join("") + '</div>'
      : '<div class="empty">Todavía no hay sesiones pasadas.</div>';

    U.set("agendaBody", h);
  }

  function fila(e) {
    var lista = window.DB.asistencia.some(function (a) { return a.ev === e.id; });
    var acta = window.DB.partidos.some(function (p) { return p.ev === e.id; });
    var esPartido = S.isMatch(e);
    var marca = "";
    if (acta) marca = '<span class="badge ok">acta</span>';
    else if (lista) marca = '<span class="badge info">lista</span>';

    return '<div class="prow tap" onclick="CB.agenda.editar(\'' + e.id + '\')">' +
      '<span class="num-badge" style="font-size:9.5px;letter-spacing:.04em">' +
        (esPartido ? "PAR" : "ENT") + '</span>' +
      '<div class="pmain">' +
        '<div class="nm">' + U.esc(S.evTitle(e)) + '</div>' +
        '<div class="sub">' + U.esc(U.fmtDate(e.fecha)) + ' · ' + U.esc(e.hora || "") +
          (e.lugar ? " · " + U.esc(e.lugar) : "") + '</div>' +
      '</div>' + marca + '</div>';
  }

  function editar(id, tipoDefecto) {
    var e = id ? S.ev(id) : {
      tipo: tipoDefecto || "Entrenamiento",
      fecha: U.today(), hora: "19:00",
      rival: "", cond: "Local", lugar: "", comp: "", notas: ""
    };
    if (!e) return;

    var body =
      '<label class="f">Tipo de sesión</label>' +
      '<select id="eTipo">' + M.TIPOS_SESION.map(function (t) {
        return '<option ' + (t === e.tipo ? "selected" : "") + '>' + t + '</option>';
      }).join("") + '</select>' +
      '<div class="grid-2">' +
        '<div><label class="f">Fecha</label><input type="date" id="eFec" value="' + U.esc(e.fecha) + '"></div>' +
        '<div><label class="f">Hora</label><input type="time" id="eHor" value="' + U.esc(e.hora) + '"></div>' +
      '</div>' +
      '<label class="f">Rival</label>' +
      '<input id="eRiv" value="' + U.esc(e.rival) + '" placeholder="Solo si es partido">' +
      '<div class="grid-2">' +
        '<div><label class="f">Condición</label><select id="eCon">' +
          M.CONDICIONES.map(function (t) { return '<option ' + (t === e.cond ? "selected" : "") + '>' + t + '</option>'; }).join("") +
        '</select></div>' +
        '<div><label class="f">Competición</label><input id="eCom" value="' + U.esc(e.comp) + '"></div>' +
      '</div>' +
      '<label class="f">Lugar</label><input id="eLug" value="' + U.esc(e.lugar) + '">' +
      '<label class="f">Objetivo de la sesión</label><textarea id="eNot">' + U.esc(e.notas) + '</textarea>';

    var botones = [];
    if (id) {
      botones.push({
        text: "Eliminar", cls: "ghost", fn: function () {
          if (!window.CB.shell.confirmar("¿Eliminar la sesión y su lista de asistencia?")) return;
          window.DB.eventos = window.DB.eventos.filter(function (x) { return x.id !== id; });
          window.DB.asistencia = window.DB.asistencia.filter(function (a) { return a.ev !== id; });
          S.save();
          window.CB.shell.closeSheet();
          window.CB.app.renderAll();
          U.toast("Sesión eliminada");
        }
      });
    } else {
      botones.push({ text: "Cancelar", cls: "ghost", fn: window.CB.shell.closeSheet });
    }
    botones.push({
      text: "Guardar", cls: "pri", fn: function () {
        var o = {
          id: id || U.uid(),
          tipo: U.val("eTipo"), fecha: U.val("eFec"), hora: U.val("eHor"),
          rival: U.val("eRiv").trim(), cond: U.val("eCon"),
          lugar: U.val("eLug").trim(), comp: U.val("eCom").trim(), notas: U.val("eNot")
        };
        if (!o.fecha) { U.toast("Elige la fecha"); return; }
        if (id) window.DB.eventos = window.DB.eventos.map(function (x) { return x.id === id ? o : x; });
        else window.DB.eventos.push(o);
        S.save();
        window.CB.shell.closeSheet();
        window.CB.app.renderAll();
        U.toast(id ? "Sesión actualizada" : "Sesión programada");
      }
    });

    window.CB.shell.openSheet(id ? "Editar sesión" : "Nueva sesión", body, botones);
  }

  window.CB.agenda = { render: render, editar: editar };
})();
