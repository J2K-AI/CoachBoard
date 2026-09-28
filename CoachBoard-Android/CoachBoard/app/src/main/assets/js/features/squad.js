/* =============================================================
   CoachBoard · features/squad.js
   Plantilla: tarjetas de jugador, ficha y alta/edición.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;
  var M = window.CB.models;

  var orden = "dorsal";
  var filtro = "todos";

  function badgeEstado(j) {
    if (j.estado === "Lesionado") return '<span class="badge bad">Lesionado</span>';
    if (j.estado === "Sancionado") return '<span class="badge warn">Sancionado</span>';
    if (j.estado === "Baja") return '<span class="badge">Baja</span>';
    return '<span class="badge ok">Disponible</span>';
  }

  function lista() {
    var arr = window.DB.jugadores.slice();
    if (filtro === "disponibles") arr = arr.filter(function (j) { return j.estado === "Disponible"; });
    if (filtro === "lesionados") arr = arr.filter(function (j) { return j.estado === "Lesionado"; });
    arr.sort(function (a, b) {
      if (orden === "nombre") return String(a.nombre).localeCompare(String(b.nombre));
      if (orden === "asistencia") {
        var pa = S.attPct(a.id), pb = S.attPct(b.id);
        return (pb ? pb.pct : -1) - (pa ? pa.pct : -1);
      }
      return (a.dorsal || 99) - (b.dorsal || 99);
    });
    return arr;
  }

  function render() {
    var db = window.DB;
    var arr = lista();
    var asis = S.squadAttendance();

    var head = '<div class="grid-3 stagger">' +
      '<div class="kpi"><div class="v">' + db.jugadores.length + '</div><div class="k">Jugadores</div></div>' +
      '<div class="kpi ' + (asis !== null && asis >= 85 ? "accent" : "") + '"><div class="v">' +
        (asis === null ? "—" : asis + "%") + '</div><div class="k">Asistencia</div></div>' +
      '<div class="kpi ' + (db.jugadores.filter(function (j) { return j.estado !== "Disponible"; }).length ? "warnv" : "") +
        '"><div class="v">' + db.jugadores.filter(function (j) { return j.estado !== "Disponible"; }).length +
        '</div><div class="k">Bajas</div></div></div>';

    var chips = '<div class="chiprow mt2">' +
      chip("todos", "Todos") + chip("disponibles", "Disponibles") + chip("lesionados", "Lesionados") +
      '<span style="width:6px;flex:none"></span>' +
      '<button class="chip" onclick="CB.squad.ordenar()">' + U.svg("sort") + ' ' + etiquetaOrden() + '</button>' +
      '</div>';

    var cuerpo;
    if (!db.jugadores.length) {
      cuerpo = '<div class="empty mt3"><b>Todavía no hay jugadores</b>' +
        'Da de alta a tu plantilla o carga una de ejemplo para probar.' +
        '<div class="mt3 grid-2">' +
        '<button class="btn sm pri" onclick="CB.squad.editar(null)">Fichar jugador</button>' +
        '<button class="btn sm" onclick="CB.squad.demo()">Cargar ejemplo</button></div></div>';
    } else if (!arr.length) {
      cuerpo = '<div class="empty mt3"><b>Nadie en este filtro</b>Prueba con "Todos".</div>';
    } else {
      cuerpo = '<div class="plist mt2 stagger">' + arr.map(fila).join("") + '</div>';
    }

    U.set("squadBody", head + chips + cuerpo);
  }

  function chip(id, label) {
    return '<button class="chip ' + (filtro === id ? "on" : "") +
      '" onclick="CB.squad.filtrar(\'' + id + '\')">' + label + '</button>';
  }
  function etiquetaOrden() {
    return orden === "dorsal" ? "Dorsal" : orden === "nombre" ? "Nombre" : "Asistencia";
  }

  function fila(j) {
    var a = S.attPct(j.id);
    var st = window.CB.stats.player(j.id);
    var sub = (M.POS_LARGO[j.pos] || j.pos || "") + " · " + (j.pie || "");
    return '<div class="prow tap" onclick="CB.squad.abrir(\'' + j.id + '\')">' +
      '<span class="num-badge">' + (j.dorsal || "–") + '</span>' +
      '<div class="pmain">' +
        '<div class="nm">' + U.esc(j.nombre) + '</div>' +
        '<div class="sub">' + U.esc(sub) + '</div>' +
      '</div>' +
      '<div class="pend">' +
        '<div class="big">' + (a ? a.pct + "%" : "—") + '</div>' +
        '<div class="small">' + (st.pj ? st.g + "G " + st.a + "A" : "asistencia") + '</div>' +
      '</div></div>';
  }

  function filtrar(f) { filtro = f; render(); }
  function ordenar() {
    orden = orden === "dorsal" ? "nombre" : orden === "nombre" ? "asistencia" : "dorsal";
    render();
    U.toast("Ordenado por " + etiquetaOrden().toLowerCase());
  }

  /* ---------------------------------------------------------
     Ficha del jugador
     --------------------------------------------------------- */
  function abrir(id) {
    var s = window.CB.stats.player(id);
    var j = s.j;

    var barras = window.CB.stats.tiposOrdenados(s.tipos).map(function (t) {
      var n = s.tipos[t], pct = Math.round(100 * n / s.g);
      return '<div class="mt2"><div class="row-x" style="justify-content:space-between;font-size:12.5px">' +
        '<span>' + U.esc(t) + '</span><b class="num">' + n + '</b></div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join("") || '<p class="hint">Todavía no ha marcado.</p>';

    var ultimos = s.partidos.slice(0, 6).map(function (p) {
      return '<div class="prow" style="padding:8px 10px">' +
        '<div class="pmain"><div class="nm" style="font-size:13.5px">' +
          U.esc(p.rival || "Partido") + ' · ' + p.res + '</div>' +
        '<div class="sub">' + U.esc(U.fmtDate(p.fecha)) + ' · ' + p.rol + '</div></div>' +
        '<div class="pend"><div class="big">' + p.min + "'" + '</div>' +
        '<div class="small">' + p.gol + "G " + p.asi + "A" + '</div></div></div>';
    }).join("") || '<p class="hint">Sin partidos con acta cerrada.</p>';

    var body =
      '<div class="row-x" style="gap:12px;margin-bottom:12px">' +
        '<span class="num-badge" style="width:48px;height:48px;font-size:18px">' + (j.dorsal || "–") + '</span>' +
        '<div class="pmain"><div class="nm" style="font-size:17px">' + U.esc(j.nombre) + '</div>' +
        '<div class="sub">' + U.esc(M.POS_LARGO[j.pos] || j.pos || "") + ' · ' + U.esc(j.pie || "") + '</div></div>' +
        badgeEstado(j) +
      '</div>' +
      '<div class="grid-4r">' +
        tile(s.pj, "Partidos") + tile(s.min + "'", "Minutos") +
        tile(s.g, "Goles") + tile(s.a, "Asist.") +
      '</div>' +
      '<div class="section"><span class="eyebrow">Rendimiento</span></div>' +
      dl("Convocatorias", s.conv) +
      dl("Titular / suplente", s.tit + " / " + (s.conv - s.tit)) +
      dl("Media por partido", s.media + "'") +
      dl("Marca un gol cada", s.minGol ? s.minGol + "'" : "—") +
      dl("Gol o asistencia cada", s.minPart ? s.minPart + "'" : "—") +
      dl("Faltas cometidas", s.fal + " (" + s.falPart + " por partido)") +
      dl("Una falta cada", s.minFal ? s.minFal + "'" : "—") +
      dl("Amarillas / rojas", s.ta + " / " + s.tr) +
      dl("Asistencia a entrenos", s.att ? s.att.pct + "% (" + s.att.p + "/" + s.att.t + ")" : "—") +
      '<div class="section"><span class="eyebrow">De dónde vienen sus goles</span></div>' + barras +
      '<div class="section"><span class="eyebrow">Últimos partidos</span></div>' +
      '<div class="plist">' + ultimos + '</div>' +
      (j.notas ? '<div class="section"><span class="eyebrow">Notas del entrenador</span></div>' +
        '<p class="hint" style="color:var(--text)">' + U.esc(j.notas) + '</p>' : "") +
      (j.tel ? dl("Contacto", U.esc(j.tel)) : "");

    window.CB.shell.openSheet("Ficha del jugador", body, [
      { text: "Editar", cls: "ghost", fn: function () { window.CB.shell.closeSheet(); editar(id); } },
      { text: "Ficha PDF", cls: "pri", fn: function () { window.CB.reports.fichaPdf(id); } }
    ]);
  }

  function tile(v, k) {
    return '<div class="kpi flat"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
  }
  function dl(k, v) {
    return '<div class="dl"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  /* ---------------------------------------------------------
     Alta y edición
     --------------------------------------------------------- */
  function editar(id) {
    var j = id ? S.jug(id) : {
      dorsal: "", nombre: "", pos: "MC", pie: "Diestro",
      estado: "Disponible", tel: "", notas: "", fechaNac: ""
    };
    if (!j) return;

    var body =
      '<div class="grid-2">' +
        '<div><label class="f">Dorsal</label><input id="pDor" inputmode="numeric" value="' + U.esc(j.dorsal) + '"></div>' +
        '<div><label class="f">Posición</label><select id="pPos">' +
          M.POS.map(function (p) {
            return '<option ' + (p === j.pos ? "selected" : "") + ' value="' + p + '">' + p + ' · ' + M.POS_LARGO[p] + '</option>';
          }).join("") + '</select></div>' +
      '</div>' +
      '<label class="f">Nombre</label><input id="pNom" value="' + U.esc(j.nombre) + '" placeholder="Nombre y apellidos">' +
      '<div class="grid-2">' +
        '<div><label class="f">Pie</label><select id="pPie">' +
          M.PIES.map(function (p) { return '<option ' + (p === j.pie ? "selected" : "") + '>' + p + '</option>'; }).join("") +
        '</select></div>' +
        '<div><label class="f">Disponibilidad</label><select id="pEst">' +
          M.ESTADOS.map(function (p) { return '<option ' + (p === j.estado ? "selected" : "") + '>' + p + '</option>'; }).join("") +
        '</select></div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div><label class="f">Nacimiento</label><input type="date" id="pNac" value="' + U.esc(j.fechaNac || "") + '"></div>' +
        '<div><label class="f">Contacto</label><input id="pTel" value="' + U.esc(j.tel) + '" placeholder="Teléfono"></div>' +
      '</div>' +
      '<label class="f">Notas del entrenador</label><textarea id="pNot">' + U.esc(j.notas) + '</textarea>';

    var botones = [];
    if (id) {
      botones.push({
        text: "Dar de baja", cls: "ghost", fn: function () {
          if (!window.CB.shell.confirmar("¿Borrar la ficha de " + j.nombre + "?")) return;
          window.DB.jugadores = window.DB.jugadores.filter(function (x) { return x.id !== id; });
          S.save();
          window.CB.shell.closeSheet();
          window.CB.app.renderAll();
          U.toast("Jugador dado de baja");
        }
      });
    } else {
      botones.push({ text: "Cancelar", cls: "ghost", fn: window.CB.shell.closeSheet });
    }
    botones.push({
      text: "Guardar", cls: "pri", fn: function () {
        var n = U.val("pNom").trim();
        if (!n) { U.toast("Escribe el nombre"); return; }
        var o = {
          id: id || U.uid(),
          dorsal: parseInt(U.val("pDor"), 10) || 0,
          nombre: n,
          pos: U.val("pPos"),
          pie: U.val("pPie"),
          estado: U.val("pEst"),
          fechaNac: U.val("pNac"),
          tel: U.val("pTel").trim(),
          notas: U.val("pNot")
        };
        if (id) {
          window.DB.jugadores = window.DB.jugadores.map(function (x) { return x.id === id ? o : x; });
        } else {
          window.DB.jugadores.push(o);
        }
        S.save();
        window.CB.shell.closeSheet();
        window.CB.app.renderAll();
        U.toast(id ? "Ficha actualizada" : "Jugador fichado");
      }
    });

    window.CB.shell.openSheet(id ? "Editar ficha" : "Nuevo jugador", body, botones);
  }

  function demo() {
    var datos = [
      [1, "Álvaro Ruiz", "POR"], [13, "Nico Serra", "POR"], [2, "Hugo Marín", "LTD"],
      [3, "Pablo Cuesta", "LTI"], [4, "Iván Solano", "DFC"], [5, "Marc Delgado", "DFC"],
      [12, "Adrià Bosch", "DFC"], [15, "Leo Ferrer", "LTI"], [6, "Dani Arana", "MCD"],
      [8, "Sergio Pinto", "MC"], [14, "Aitor Vega", "MC"], [10, "Bruno Salas", "MCO"],
      [16, "Jon Etxeberria", "MCD"], [7, "Erik Navas", "ED"], [11, "Samuel Lago", "EI"],
      [17, "Diego Peral", "EI"], [9, "Tomás Quiroga", "DC"], [19, "Raúl Méndez", "DC"]
    ];
    datos.forEach(function (d) {
      window.DB.jugadores.push({
        id: U.uid(), dorsal: d[0], nombre: d[1], pos: d[2],
        pie: "Diestro", estado: "Disponible", tel: "", notas: "", fechaNac: ""
      });
    });
    S.save();
    window.CB.app.renderAll();
    U.toast("18 jugadores cargados");
  }

  window.CB.squad = {
    render: render, abrir: abrir, editar: editar, demo: demo,
    filtrar: filtrar, ordenar: ordenar, badgeEstado: badgeEstado
  };
})();
