/* =============================================================
   CoachBoard · features/match.js
   Partido en directo. Pensado para usarse de pie, en el banquillo:
   primero se pulsa la acción y después se elige el jugador.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;
  var S = window.CB.store;
  var M = window.CB.models;

  var evId = null;
  var timer = null;
  var panelActivo = "directo";   // directo | plantilla
  var golPendiente = null;       // goleador a la espera de asistencia

  function m() { return window.DB.match; }
  function partidos() { return S.evSorted().filter(S.isMatch).reverse(); }

  function seleccionar(id) {
    evId = id;
    render();
  }

  function elegirPartidoPorDefecto() {
    var lista = partidos();
    if (!lista.length) { evId = null; return; }
    if (m() && lista.some(function (e) { return e.id === m().ev; })) { evId = m().ev; return; }
    if (evId && lista.some(function (e) { return e.id === evId; })) return;
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var futuro = lista.slice().reverse().filter(function (e) { return S.evDate(e) >= hoy; })[0];
    evId = (futuro || lista[0]).id;
  }

  /* ---------------------------------------------------------
     Reloj
     --------------------------------------------------------- */
  /* La duración viaja con el partido, así que los tiempos base y los
     nombres de los periodos se calculan; no son una constante. */
  function dur() { var mt = m(); return M.normDur(mt && mt.dur); }
  function bases() { return M.periodoBase(dur()); }
  function etiquetaPeriodo(i) {
    var p = M.periodos(dur());
    return p[i] || p[p.length - 1];
  }
  function relojSeg() {
    var mt = m();
    return mt ? bases()[mt.per] + mt.seg : 0;
  }
  function minuto() { return m() ? Math.floor(relojSeg() / 60) + 1 : 0; }

  function arrancar() {
    var mt = m();
    mt.run = true;
    clearInterval(timer);
    timer = setInterval(function () {
      var x = m();
      if (!x) { clearInterval(timer); return; }
      x.seg++;
      x.campo.forEach(function (id) { x.t[id] = (x.t[id] || 0) + 1; });
      var c = U.$("mClock");
      if (c) c.textContent = U.mmss(relojSeg());
      if (x.seg % 10 === 0 && panelActivo === "plantilla") pintarPlantilla();
      if (x.seg % 15 === 0) S.save();
    }, 1000);
  }
  function parar() {
    clearInterval(timer);
    timer = null;
    if (m()) m().run = false;
  }

  /* ---------------------------------------------------------
     Descanso

     Antes, al pasar de parte el reloj se quedaba en pausa sin decir
     nada: si el entrenador no le daba a "Reanudar", la segunda parte
     no contaba y el acta se cerraba en 45:00. Ahora el descanso
     arranca solo y el botón grande pasa a "Empezar la 2ª parte", así
     que no queda ningún estado muerto.
     --------------------------------------------------------- */
  function enDescanso() { var mt = m(); return !!(mt && mt.br); }

  function descansoRestante() {
    var mt = m();
    if (!mt || !mt.br) return 0;
    return (mt.br.total || 0) - mt.br.seg;
  }
  function textoDescanso() {
    var r = descansoRestante();
    return (r < 0 ? "+" : "") + U.mmss(Math.abs(r));
  }

  function arrancarDescanso(total) {
    var mt = m();
    mt.br = { seg: 0, total: total, run: true };
    clearInterval(timer);
    timer = setInterval(function () {
      var x = m();
      if (!x || !x.br || !x.br.run) { clearInterval(timer); timer = null; return; }
      x.br.seg++;
      var c = U.$("mClock");
      if (c) c.textContent = textoDescanso();
      if (x.br.seg % 15 === 0) S.save();
    }, 1000);
  }

  /* Cierra el descanso y arranca de verdad la parte que toca. */
  function empezarParte() {
    var mt = m();
    if (!mt) return;
    var gastado = mt.br ? mt.br.seg : 0;
    mt.br = null;
    clearInterval(timer);
    log("Comienza " + conArticulo(mt.per), "periodo",
      "a", gastado ? "Descanso de " + U.mmss(gastado) : "");
    arrancar();
    S.save();
    render();
  }

  function alternarReloj() {
    var mt = m();
    if (!mt) { U.toast("Convoca primero"); return; }
    if (enPenaltis()) { U.toast("La tanda no lleva reloj"); penaltis(); return; }
    if (enDescanso()) { empezarParte(); return; }
    if (mt.run) {
      parar();
      log("Reloj parado", "periodo");
    } else {
      if (!mt.started) {
        if (mt.campo.length < 11 &&
            !window.CB.shell.confirmar("Solo hay " + mt.campo.length + " jugadores en el campo. ¿Empezar igualmente?")) return;
        mt.started = true;
        mt.titulares = mt.campo.slice();
        log("Comienza el partido", "periodo");
      } else {
        log("Se reanuda el juego", "periodo");
      }
      arrancar();
    }
    S.save();
    render();
  }
  function enPenaltis() { var mt = m(); return !!mt && mt.per === M.penIndex(dur()); }

  /* Cambiar la duración con el partido ya convocado: si al programarlo
     se quedó en 2 x 45 por descuido, se arregla aquí sin perder nada. */
  function cambiarDuracion() {
    var mt = m();
    if (!mt) { U.toast("Convoca primero"); return; }
    window.CB.wheel.pedirDuracion(mt.dur, function (nueva) {
      mt.dur = nueva;
      var e = S.ev(mt.ev);
      if (e) e.dur = nueva;
      S.save();
      render();
      U.toast("Duración: " + M.durTexto(nueva));
    });
  }

  /* "la 2ª parte" / "el 3er cuarto": el artículo depende del formato. */
  function femenino(i) { return /parte|[Pp]rórroga/.test(etiquetaPeriodo(i)); }
  function conArticulo(i) {
    return (femenino(i) ? "la " : "el ") + etiquetaPeriodo(i);
  }
  /* Con la contracción: "Fin de la 2ª parte", pero "Fin del 4º cuarto". */
  function finDe(i) {
    return "Fin " + (femenino(i) ? "de la " : "del ") + etiquetaPeriodo(i);
  }

  /* Fin de parte. No es un "siguiente" a ciegas: al acabar el tiempo
     reglamentario y la prórroga hay que decidir, y lo normal es que el
     partido termine ahí. Por eso pregunta en vez de encadenar
     prórrogas él solo. Los índices salen del formato, que puede ser de
     dos partes o de cuatro cuartos. */
  function siguientePeriodo() {
    var mt = m();
    if (!mt) return;
    if (enPenaltis()) { penaltis(); return; }

    var d = dur();
    var ultima = d.partes - 1;     // última parte del tiempo reglamentario
    var pro1 = d.partes;
    var pro2 = d.partes + 1;

    /* Entre partes, y de la prórroga 1 a la 2, no hay nada que decidir. */
    if (mt.per < ultima) { avanzarA(mt.per + 1); return; }
    if (mt.per === pro1) { avanzarA(pro2); return; }

    var empate = mt.gf === mt.gc;
    var marcador = mt.gf + " – " + mt.gc;
    var titulo = finDe(mt.per);

    if (mt.per === ultima) {
      if (empate) {
        elegirOpcion(titulo, "Empate a " + mt.gf + ". ¿Cómo sigue?",
          ["Jugar la prórroga", "Ir directo a los penaltis", "Terminar en empate"],
          function (op) {
            if (op === "Jugar la prórroga") avanzarA(pro1);
            else if (op === "Ir directo a los penaltis") irAPenaltis();
            else terminar();
          });
      } else {
        elegirOpcion(titulo, "Vas " + marcador + ": el partido está decidido.",
          ["Finalizar el partido", "Jugar la prórroga igualmente"],
          function (op) {
            if (op === "Finalizar el partido") terminar();
            else avanzarA(pro1);
          });
      }
      return;
    }

    /* mt.per === pro2: se acaba la prórroga. */
    if (empate) {
      elegirOpcion(titulo, "Seguís empatados a " + mt.gf + ".",
        ["Ir a los penaltis", "Terminar en empate"],
        function (op) { if (op === "Ir a los penaltis") irAPenaltis(); else terminar(); });
    } else {
      elegirOpcion(titulo, "Vas " + marcador + ": el partido está decidido.",
        ["Finalizar el partido", "Ir a los penaltis"],
        function (op) { if (op === "Finalizar el partido") terminar(); else irAPenaltis(); });
    }
  }

  function avanzarA(per) {
    var mt = m();
    var acaba = mt.per;
    parar();
    /* Se anota el tiempo real al que se cerró la parte: si hubo
       añadido, ese minuto no se pierde aunque el reloj de la parte
       siguiente arranque en su minuto de siempre. */
    log(finDe(acaba) + " (" + U.mmss(relojSeg()) + ")", "periodo");
    mt.per = per;
    mt.seg = 0;
    arrancarDescanso(M.descansoSeg(dur(), acaba));
    S.save();
    render();
  }

  /* El botón de la hoja ya es la confirmación: no se pregunta dos veces. */
  function terminar() { finalizar(true); }

  function etiquetaFinParte() {
    var mt = m();
    if (!mt) return "Siguiente parte";
    if (enPenaltis()) return "Tanda de penaltis";
    return finDe(mt.per);
  }

  /* ---------------------------------------------------------
     Crónica
     --------------------------------------------------------- */
  function log(txt, kind, side, sub) {
    var mt = m();
    if (!mt) return;
    mt.log.unshift({ m: minuto(), t: txt, k: kind || "nota", s: side || "a", sub: sub || "" });
  }
  function nombre(id) {
    var j = S.jug(id);
    return j ? (j.dorsal + " " + j.nombre) : "?";
  }
  function rivalNombre() {
    var mt = m();
    var e = mt ? S.ev(mt.ev) : null;
    return (e && e.rival) || "Rival";
  }
  function icono(k) {
    switch (k) {
      case "gol": return '<span class="ic"><i class="i-ball"></i></span>';
      case "golcon": return '<span class="ic"><i class="i-ball con"></i></span>';
      case "amarilla": return '<span class="ic"><i class="i-card y"></i></span>';
      case "doble": return '<span class="ic"><i class="i-card yr"></i></span>';
      case "roja": return '<span class="ic"><i class="i-card r"></i></span>';
      case "cambio": return '<span class="ic i-swap">&#8593;<span>&#8595;</span></span>';
      case "asis": return '<span class="ic"><i class="i-as">A</i></span>';
      case "falta": return '<span class="ic"><i class="i-foul"></i></span>';
      case "pengol": return '<span class="ic"><i class="i-ball pen"></i></span>';
      case "penfallo": return '<span class="ic"><i class="i-ball fallo"></i></span>';
      default: return '<span class="ic"><i class="i-note"></i></span>';
    }
  }

  /* ---------------------------------------------------------
     Pintado
     --------------------------------------------------------- */
  function render() {
    elegirPartidoPorDefecto();
    var e = evId ? S.ev(evId) : null;
    var mt = m();
    var hayActa = e && window.DB.partidos.some(function (p) { return p.ev === e.id; });

    var h = "";

    h += '<div class="row-x" style="gap:8px">' +
      '<select id="mSel" onchange="CB.match.cambiar(this.value)" style="flex:1">' +
      (partidos().length
        ? partidos().map(function (x) {
            return '<option value="' + x.id + '" ' + (x.id === evId ? "selected" : "") + '>' +
              U.fmtDate(x.fecha) + " · " + U.esc(x.rival || "sin rival") + '</option>';
          }).join("")
        : '<option value="">Programa antes un partido</option>') +
      '</select></div>';

    if (!e) {
      U.set("matchBody", h + '<div class="empty mt3"><b>Sin partidos</b>' +
        'Programa un encuentro en el calendario para poder dirigirlo desde aquí.' +
        '<div class="mt3"><button class="btn sm pri" onclick="CB.agenda.editar(null,\'Partido\')">Programar partido</button></div></div>');
      return;
    }

    var local = e.cond !== "Visitante";
    var nosotros = S.club();
    var rival = e.rival || "Rival";
    var izq = local ? nosotros : rival;
    var der = local ? rival : nosotros;
    var gi = mt ? (local ? mt.gf : mt.gc) : 0;
    var gd = mt ? (local ? mt.gc : mt.gf) : 0;

    /* --- marcador --- */
    h += '<div class="board mt2">' +
      '<div class="teams"><div class="tn">' + U.esc(izq) + '</div><div class="tn"></div>' +
      '<div class="tn">' + U.esc(der) + '</div></div>' +
      '<div class="score num"><span>' + gi + '</span><span class="sep">–</span><span>' + gd + '</span></div>' +
      (mt && mt.pen && mt.pen.tiros.length
        ? '<div class="penline num">' + (local ? mt.pen.a : mt.pen.b) + " – " +
          (local ? mt.pen.b : mt.pen.a) + ' <span>en penaltis</span></div>'
        : "") +
      '<div class="clock num ' + claseReloj(mt) + '" id="mClock">' +
        (mt ? (enDescanso() ? textoDescanso() : U.mmss(relojSeg())) : "00:00") + '</div>' +
      '<div class="per">' + (mt && (mt.run || enDescanso()) ? '<span class="live"></span>' : "") +
        (mt ? U.esc(estadoPeriodo(mt)) : "sin convocatoria") + '</div>' +
      '<div class="scoreadj">' +
        '<button onclick="CB.match.corregir(-1,0)" aria-label="Quitar gol nuestro">−</button>' +
        '<span class="eyebrow">corregir</span>' +
        '<button onclick="CB.match.corregir(0,-1)" aria-label="Quitar gol rival">−</button>' +
      '</div>' +
      (mt ? '<button class="durlink" onclick="CB.match.duracion()">' +
        U.esc(M.durTexto(dur())) + ' · cambiar</button>' : "") +
      '</div>';

    if (!mt) {
      h += '<div class="grid-2 mt2">' +
        '<button class="btn pri lg" onclick="CB.match.convocar()">' + U.svg("users2") + 'Convocar</button>' +
        (hayActa ? '<button class="btn lg" onclick="CB.match.recuperarActa()">' + U.svg("undo") + 'Reanudar acta</button>'
                 : '<button class="btn lg" onclick="CB.agenda.editar(\'' + e.id + '\')">' + U.svg("pencil") + 'Editar partido</button>') +
        '</div>';
      h += '<div class="empty mt3"><b>Prepara la convocatoria</b>' +
        'Elige a los citados y después coloca el once inicial. El cronómetro cuenta los minutos de cada jugador.</div>';
      U.set("matchBody", h);
      return;
    }

    /* --- control del reloj (en la tanda no hay reloj que llevar) --- */
    if (enPenaltis()) {
      h += '<button class="btn pri lg wide mt2" onclick="CB.match.penaltis()">' +
        U.svg("ball") + 'Tanda de penaltis</button>';
    } else if (enDescanso()) {
      h += '<button class="btn pri lg wide mt2" onclick="CB.match.empezarParte()">' +
        U.svg("play") + 'Empezar ' + conArticulo(mt.per) + '</button>';
    } else {
      h += '<button class="btn ' + (mt.run ? "warn" : "pri") + ' lg wide mt2" onclick="CB.match.reloj()">' +
        U.svg(mt.run ? "pause" : "play") + (mt.run ? "Pausar" : mt.started ? "Reanudar" : "Iniciar partido") + '</button>';
    }

    /* --- acciones rápidas --- */
    h += '<div class="grid-4 mt2">' +
      accion("ball", "Gol", "CB.match.gol()", "pri") +
      accion("swap", "Cambio", "CB.match.cambio()", "info") +
      accion("card", "Amarilla", "CB.match.tarjeta('y')", "warn") +
      accion("card", "Roja", "CB.match.tarjeta('r')", "danger") +
      '</div>';

    h += '<div class="grid-4 mt1">' +
      accion("ball", "Gol rival", "CB.match.golRival()", "") +
      accion("t_player", "Asist.", "CB.match.asistencia()", "") +
      accion("whistle", "Falta", "CB.match.falta()", "") +
      accion("note", "Nota", "CB.match.nota()", "") +
      '</div>';

    h += '<div class="seg mt2">' +
      '<button class="' + (panelActivo === "directo" ? "on" : "") + '" onclick="CB.match.pestana(\'directo\')">En directo</button>' +
      '<button class="' + (panelActivo === "plantilla" ? "on" : "") + '" onclick="CB.match.pestana(\'plantilla\')">Plantilla y minutos</button>' +
      '</div>';

    h += '<div id="mPanel" class="mt2"></div>';

    h += '<div class="grid-2 mt3">' +
      '<button class="btn sm" onclick="CB.match.periodo()">' + U.svg("clock") +
        '<span class="lbl">' + etiquetaFinParte() + '</span></button>' +
      '<button class="btn sm" onclick="CB.match.alineacion()">' + U.svg("users2") + 'Alineación</button>' +
      '</div>';
    h += '<div class="grid-2 mt1">' +
      '<button class="btn sm ghost" onclick="CB.match.convocar()">Convocatoria</button>' +
      '<button class="btn sm ghost" onclick="CB.match.finalizar()">' + U.svg("flag") + 'Finalizar acta</button>' +
      '</div>';
    if (hayActa) {
      h += '<button class="btn sm wide mt1" onclick="CB.match.actaPdf()">' + U.svg("pdf") + 'Acta en PDF</button>';
    }

    U.set("matchBody", h);
    pintarPanel();
  }

  function claseReloj(mt) {
    if (!mt) return "stop";
    if (enDescanso()) return "des";
    return mt.run ? "" : "stop";
  }
  function estadoPeriodo(mt) {
    if (enDescanso()) return "Descanso · ahora " + etiquetaPeriodo(mt.per);
    return etiquetaPeriodo(mt.per) + " · " +
      (mt.run ? "en juego" : mt.started ? "pausado" : "detenido");
  }

  function accion(icon, label, fn, cls) {
    return '<button class="btn stack ' + (cls || "") + '" onclick="' + fn + '">' +
      U.svg(icon) + '<span class="lbl">' + label + '</span></button>';
  }

  function pestana(p) { panelActivo = p; render(); }

  function pintarPanel() {
    if (panelActivo === "plantilla") pintarPlantilla();
    else pintarDirecto();
  }

  function pintarDirecto() {
    var mt = m();
    if (!mt || !mt.log.length) {
      U.set("mPanel", '<div class="empty">' +
        (mt ? '<b>Aquí verás el partido</b>Goles, tarjetas y cambios se apilan con su minuto en cuanto los anotes.'
            : "Convoca a los jugadores para empezar.") + '</div>');
      return;
    }
    var html = '<div class="tl">' + mt.log.map(function (l) {
      if (l.k === "periodo") {
        return '<div class="per-sep"><span>' + U.esc(l.t) + '</span></div>';
      }
      var caja = '<div class="box">' + icono(l.k) + '<div class="tx"><b>' + U.esc(l.t) + '</b>' +
        (l.sub ? '<small>' + U.esc(l.sub) + '</small>' : "") + '</div></div>';
      return '<div class="ev ' + (l.s === "b" ? "b" : "") + '">' +
        '<div class="side">' + caja + '</div>' +
        '<div class="min">' + l.m + "'" + '</div>' +
        '<div class="pad"></div></div>';
    }).join("") + '</div>';
    U.set("mPanel", html);
  }

  function pintarPlantilla() {
    var mt = m();
    if (!mt) return;
    var html = '<div class="section" style="margin-top:0"><span class="eyebrow">En el campo</span>' +
      '<span class="link">' + mt.campo.length + '/11</span></div>';
    html += mt.campo.length
      ? '<div class="plist">' + mt.campo.map(filaJugador).join("") + '</div>'
      : '<div class="empty">Coloca el once con el botón Alineación.</div>';
    html += '<div class="section"><span class="eyebrow">Banquillo</span>' +
      '<span class="link">' + mt.banq.length + '</span></div>';
    html += mt.banq.length
      ? '<div class="plist">' + mt.banq.map(filaJugador).join("") + '</div>'
      : '<div class="empty">Banquillo vacío.</div>';

    var fuera = mt.conv.filter(function (id) {
      return mt.campo.indexOf(id) < 0 && mt.banq.indexOf(id) < 0;
    });
    if (fuera.length) {
      html += '<div class="section"><span class="eyebrow">Fuera del campo</span></div>' +
        '<div class="plist">' + fuera.map(filaJugador).join("") + '</div>';
    }
    U.set("mPanel", html);
  }

  function filaJugador(id) {
    var mt = m(), j = S.jug(id);
    if (!j) return "";
    var marcas = "";
    for (var i = 0; i < (mt.ta[id] || 0); i++) marcas += '<span class="mk y"></span>';
    if (mt.tr[id]) marcas += '<span class="mk r"></span>';
    if (mt.gol[id]) marcas += '<span class="mk txt g">' + mt.gol[id] + 'G</span>';
    if (mt.asi && mt.asi[id]) marcas += '<span class="mk txt a">' + mt.asi[id] + 'A</span>';
    if (mt.fal && mt.fal[id]) marcas += '<span class="mk txt f">' + mt.fal[id] + 'F</span>';
    return '<div class="prow ' + (mt.st[id] === "Expulsado" ? "muted" : "") + '">' +
      '<span class="num-badge sm">' + (j.dorsal || "–") + '</span>' +
      '<div class="pmain"><div class="nm">' + U.esc(j.nombre) + '</div>' +
      '<div class="sub">' + U.esc(mt.st[id] || "") + '</div></div>' +
      '<div class="marks">' + marcas + '</div>' +
      '<div class="pend"><div class="big">' + Math.floor((mt.t[id] || 0) / 60) + "'" + '</div></div></div>';
  }

  /* ---------------------------------------------------------
     Convocatoria y alineación
     --------------------------------------------------------- */
  function convocar() {
    if (!evId) { U.toast("Programa antes un partido"); return; }
    if (!window.DB.jugadores.length) { U.toast("No hay plantilla"); return; }
    var previos = (m() && m().ev === evId) ? m().conv : window.DB.jugadores.map(function (j) { return j.id; });
    var arr = window.DB.jugadores.slice().sort(function (a, b) { return (a.dorsal || 99) - (b.dorsal || 99); });

    var body = arr.map(function (j) {
      return '<label class="pick"><input type="checkbox" value="' + j.id + '" ' +
        (previos.indexOf(j.id) >= 0 ? "checked" : "") + '>' +
        '<span class="num-badge sm">' + (j.dorsal || "–") + '</span>' +
        '<span class="pmain"><span class="nm">' + U.esc(j.nombre) + '</span>' +
        '<span class="sub">' + U.esc(j.pos) + (j.estado !== "Disponible" ? " · " + U.esc(j.estado) : "") + '</span></span></label>';
    }).join("");

    window.CB.shell.openSheet("Convocatoria", body, [
      { text: "Cancelar", cls: "ghost", fn: window.CB.shell.closeSheet },
      {
        text: "Convocar", cls: "pri", fn: function () {
          var ids = [].slice.call(document.querySelectorAll("#sheetBody input:checked"))
            .map(function (i) { return i.value; });
          if (!ids.length) { U.toast("No has marcado a nadie"); return; }
          nuevoPartido(evId, ids);
          window.CB.shell.closeSheet();
        }
      }
    ]);
  }

  function nuevoPartido(id, ids) {
    var e = S.ev(id);
    var mt = {
      ev: id, conv: ids, campo: [], banq: ids.slice(),
      per: 0, seg: 0, run: false, started: false,
      /* Copia, no referencia: si luego se edita el calendario, el
         partido que se está dirigiendo no cambia de duración solo. */
      dur: M.normDur(e && e.dur),
      br: null,
      gf: 0, gc: 0, log: [], goles: [], titulares: [],
      t: {}, st: {}, ta: {}, tr: {}, gol: {}, asi: {}, fal: {}
    };
    ids.forEach(function (i) {
      mt.t[i] = 0; mt.st[i] = "Banquillo"; mt.ta[i] = 0;
      mt.tr[i] = 0; mt.gol[i] = 0; mt.asi[i] = 0; mt.fal[i] = 0;
    });
    window.DB.match = mt;
    parar();
    S.save();
    render();
    U.toast(ids.length + " convocados");
    setTimeout(alineacion, 250);
  }

  function alineacion() {
    var mt = m();
    if (!mt) { U.toast("Convoca primero"); return; }
    var body = '<p class="hint">Marca a los once que salen de inicio. El resto queda en el banquillo.</p>' +
      mt.conv.map(function (id) {
        var j = S.jug(id);
        if (!j) return "";
        return '<label class="pick"><input type="checkbox" value="' + id + '" ' +
          (mt.campo.indexOf(id) >= 0 ? "checked" : "") + '>' +
          '<span class="num-badge sm">' + (j.dorsal || "–") + '</span>' +
          '<span class="pmain"><span class="nm">' + U.esc(j.nombre) + '</span>' +
          '<span class="sub">' + U.esc(j.pos) + '</span></span></label>';
      }).join("");

    window.CB.shell.openSheet("Once inicial", body, [
      { text: "Cancelar", cls: "ghost", fn: window.CB.shell.closeSheet },
      {
        text: "Confirmar", cls: "pri", fn: function () {
          var ids = [].slice.call(document.querySelectorAll("#sheetBody input:checked"))
            .map(function (i) { return i.value; });
          if (ids.length > 11) { U.toast("Como mucho once jugadores"); return; }
          mt.campo = ids;
          mt.banq = mt.conv.filter(function (x) {
            return ids.indexOf(x) < 0 && mt.st[x] !== "Expulsado";
          });
          mt.conv.forEach(function (x) {
            if (mt.st[x] === "Expulsado") return;
            mt.st[x] = ids.indexOf(x) >= 0 ? "En el campo" : "Banquillo";
          });
          if (!mt.started) mt.titulares = ids.slice();
          S.save();
          window.CB.shell.closeSheet();
          render();
        }
      }
    ]);
  }

  /* ---------------------------------------------------------
     Selector de jugador reutilizable
     --------------------------------------------------------- */
  function elegirJugador(titulo, ids, subtitulo, onPick, extra) {
    if (!ids.length) { U.toast("No hay jugadores disponibles"); return; }
    var body = (subtitulo ? '<p class="hint">' + U.esc(subtitulo) + '</p>' : "") +
      '<div class="plist">' + ids.map(function (id) {
        var j = S.jug(id);
        if (!j) return "";
        var mt = m();
        var extraTxt = mt ? Math.floor((mt.t[id] || 0) / 60) + "'" : "";
        return '<div class="prow tap" onclick="CB.match._pick(\'' + id + '\')">' +
          '<span class="num-badge sm">' + (j.dorsal || "–") + '</span>' +
          '<div class="pmain"><div class="nm">' + U.esc(j.nombre) + '</div>' +
          '<div class="sub">' + U.esc(j.pos) + '</div></div>' +
          '<div class="pend"><div class="big">' + extraTxt + '</div></div></div>';
      }).join("") + '</div>';

    pickHandler = onPick;
    var botones = [{ text: "Cancelar", cls: "ghost", fn: function () { pickHandler = null; window.CB.shell.closeSheet(); } }];
    if (extra) botones.unshift({ text: extra.text, cls: "ghost", fn: extra.fn });
    window.CB.shell.openSheet(titulo, body, botones);
  }
  var pickHandler = null;
  function _pick(id) {
    var fn = pickHandler;
    pickHandler = null;
    window.CB.shell.closeSheet();
    if (fn) fn(id);
  }

  function elegirOpcion(titulo, subtitulo, opciones, onPick) {
    var body = (subtitulo ? '<p class="hint">' + U.esc(subtitulo) + '</p>' : "") +
      opciones.map(function (o, i) {
        return '<button class="btn wide ' + (i === 0 ? "" : "mt1") +
          '" onclick="CB.match._opt(' + i + ')">' + U.esc(o) + '</button>';
      }).join("");
    optHandler = { fn: onPick, ops: opciones };
    window.CB.shell.openSheet(titulo, body, [
      { text: "Cancelar", cls: "ghost", fn: function () { optHandler = null; window.CB.shell.closeSheet(); } }
    ]);
  }
  var optHandler = null;
  function _opt(i) {
    var h = optHandler;
    optHandler = null;
    window.CB.shell.closeSheet();
    if (h && h.fn) h.fn(h.ops[i]);
  }

  /* ---------------------------------------------------------
     Acciones
     --------------------------------------------------------- */
  function gol() {
    var mt = m();
    if (!mt) { U.toast("Convoca primero"); return; }
    /* En la tanda los goles no cuentan en el marcador: se anotan aparte. */
    if (enPenaltis()) { penaltis(); return; }
    var enCampo = mt.campo.slice();
    elegirJugador("Gol · ¿quién marcó?", enCampo, "", function (id) {
      preguntarTipoGol(id);
    }, { text: "Sin goleador", fn: function () { window.CB.shell.closeSheet(); preguntarTipoGol(null); } });
  }

  function preguntarTipoGol(id) {
    golPendiente = id;
    elegirOpcion("¿Cómo fue el gol?", id ? nombre(id) : "Gol a favor", M.TIPOS_GOL, function (tipo) {
      registrarGol(tipo);
    });
  }

  function registrarGol(tipo) {
    var mt = m();
    if (!mt) return;
    var autor = tipo === "En propia del rival" ? null : golPendiente;
    if (autor) mt.gol[autor] = (mt.gol[autor] || 0) + 1;
    mt.gf++;
    mt.goles.push({ min: minuto(), eq: "A", j: autor, a: null, tipo: tipo });
    log(autor ? nombre(autor) : "Gol a favor", "gol", "a", "Gol de " + tipo.toLowerCase());
    S.save();
    render();
    if (autor && (tipo === "Jugada" || tipo === "Corner")) {
      var cand = mt.campo.filter(function (i) { return i !== autor; });
      if (cand.length) {
        setTimeout(function () {
          elegirJugador("¿Quién dio la asistencia?", cand, "", function (aid) {
            anotarAsistencia(aid, true);
          }, { text: "Sin asistencia", fn: function () { golPendiente = null; window.CB.shell.closeSheet(); } });
        }, 220);
        return;
      }
    }
    golPendiente = null;
  }

  function anotarAsistencia(id, ligadaAlGol) {
    var mt = m();
    if (!mt) return;
    mt.asi[id] = (mt.asi[id] || 0) + 1;
    if (ligadaAlGol) {
      for (var i = mt.goles.length - 1; i >= 0; i--) {
        if (mt.goles[i].eq === "A" && mt.goles[i].j === golPendiente && !mt.goles[i].a) {
          mt.goles[i].a = id;
          break;
        }
      }
      var g = mt.log.filter(function (l) { return l.k === "gol"; })[0];
      if (g) g.sub = (g.sub ? g.sub + " · " : "") + "asist. " + nombre(id);
    } else {
      log(nombre(id), "asis", "a", "Asistencia");
    }
    golPendiente = null;
    S.save();
    render();
  }

  function asistencia() {
    var mt = m();
    if (!mt) return;
    elegirJugador("Asistencia", mt.campo.concat(mt.banq), "Suma un pase de gol", function (id) {
      anotarAsistencia(id, false);
    });
  }

  function golRival() {
    var mt = m();
    if (!mt) { U.toast("Convoca primero"); return; }
    if (enPenaltis()) { penaltis(); return; }
    elegirOpcion("Gol del rival", "¿Cómo encajamos?", M.TIPOS_GOL_RIVAL, function (tipo) {
      mt.gc++;
      mt.goles.push({ min: minuto(), eq: "B", j: null, a: null, tipo: tipo });
      log("Gol del rival", "golcon", "b", "De " + tipo.toLowerCase());
      S.save();
      render();
    });
  }

  function corregir(f, c) {
    var mt = m();
    if (!mt) return;
    var eq = f < 0 ? "A" : "B";
    if (eq === "A") { if (mt.gf <= 0) return; mt.gf--; }
    else { if (mt.gc <= 0) return; mt.gc--; }
    for (var i = mt.goles.length - 1; i >= 0; i--) {
      if (mt.goles[i].eq === eq) {
        var g = mt.goles[i];
        if (g.j && mt.gol[g.j]) mt.gol[g.j]--;
        if (g.a && mt.asi[g.a]) mt.asi[g.a]--;
        mt.goles.splice(i, 1);
        break;
      }
    }
    log("Corrección del marcador", "nota");
    S.save();
    render();
  }

  function cambio() {
    var mt = m();
    if (!mt) { U.toast("Convoca primero"); return; }
    if (!mt.started && mt.campo.length < 11 && mt.banq.length) {
      /* Antes del pitido inicial, el "cambio" es simplemente subir al once. */
      elegirJugador("Sube al once", mt.banq, "El partido aún no ha empezado", function (id) {
        mt.banq = mt.banq.filter(function (x) { return x !== id; });
        mt.campo.push(id);
        mt.st[id] = "En el campo";
        S.save();
        render();
      });
      return;
    }
    if (!mt.campo.length) { U.toast("No hay nadie en el campo"); return; }
    if (!mt.banq.length) { U.toast("El banquillo está vacío"); return; }
    elegirJugador("Cambio · ¿quién sale?", mt.campo, "", function (sale) {
      setTimeout(function () {
        elegirJugador("¿Quién entra?", mt.banq, "Sale " + nombre(sale), function (entra) {
          mt.campo = mt.campo.filter(function (x) { return x !== sale; });
          mt.banq = mt.banq.filter(function (x) { return x !== entra; });
          mt.campo.push(entra);
          mt.banq.push(sale);
          mt.st[sale] = "Sustituido";
          mt.st[entra] = "En el campo";
          log(nombre(entra), "cambio", "a", "por " + nombre(sale));
          S.save();
          render();
        });
      }, 200);
    });
  }

  function tarjeta(tipo) {
    var mt = m();
    if (!mt) { U.toast("Convoca primero"); return; }
    var ids = mt.campo.concat(mt.banq);
    elegirJugador(tipo === "y" ? "Tarjeta amarilla" : "Tarjeta roja", ids, "¿A qué jugador?", function (id) {
      if (tipo === "y") {
        mt.ta[id] = (mt.ta[id] || 0) + 1;
        log(nombre(id), mt.ta[id] >= 2 ? "doble" : "amarilla", "a",
            mt.ta[id] >= 2 ? "Segunda amarilla" : "Amonestación");
        S.save();
        render();
        if (mt.ta[id] >= 2 && !mt.tr[id] &&
            window.CB.shell.confirmar(nombre(id) + " acumula dos amarillas. ¿Registrar la expulsión?")) {
          expulsar(id);
        }
      } else {
        expulsar(id);
      }
    });
  }

  function expulsar(id) {
    var mt = m();
    mt.tr[id] = 1;
    mt.st[id] = "Expulsado";
    mt.campo = mt.campo.filter(function (x) { return x !== id; });
    mt.banq = mt.banq.filter(function (x) { return x !== id; });
    log(nombre(id), "roja", "a", "Expulsado · quedamos " + mt.campo.length);
    S.save();
    render();
  }

  function falta() {
    var mt = m();
    if (!mt) { U.toast("Convoca primero"); return; }
    elegirJugador("Falta cometida", mt.campo.concat(mt.banq), "¿Quién la hizo?", function (id) {
      mt.fal[id] = (mt.fal[id] || 0) + 1;
      log(nombre(id), "falta", "a", "Falta · " + mt.fal[id] + " en el partido");
      S.save();
      render();
    });
  }

  function nota() {
    var mt = m();
    if (!mt) return;
    var t = window.prompt("Incidencia (lesión, ocasión, ajuste táctico...)");
    if (t && t.trim()) {
      log(t.trim(), "nota");
      S.save();
      render();
    }
  }

  /* ---------------------------------------------------------
     Tanda de penaltis

     Va aparte del marcador: una tanda no cambia el resultado del
     partido (2-2 sigue siendo 2-2) ni suma goles a las estadísticas
     de nadie. Solo decide quién pasa.
     --------------------------------------------------------- */
  function tanda() {
    var mt = m();
    if (!mt) return null;
    if (!mt.pen) mt.pen = { a: 0, b: 0, tiros: [] };
    return mt.pen;
  }

  function irAPenaltis() {
    var mt = m();
    if (!mt) return;
    parar();
    if (!enPenaltis()) {
      log(finDe(mt.per) + " (" + U.mmss(relojSeg()) + ")", "periodo");
      mt.br = null;
      mt.per = M.penIndex(dur());
      mt.seg = 0;
      tanda();
      log("Comienza la tanda de penaltis", "periodo");
    }
    S.save();
    render();
    penaltis();
  }

  function penaltis() {
    var mt = m();
    if (!mt) { U.toast("Convoca primero"); return; }
    if (!enPenaltis()) {
      if (!window.CB.shell.confirmar("¿Empezar ya la tanda de penaltis?")) return;
      irAPenaltis();
      return;
    }

    var p = tanda();
    var lista = p.tiros.length
      ? '<div class="plist mt2">' + p.tiros.map(function (t, i) {
          var quien = t.eq === "a" ? (t.j ? nombre(t.j) : S.club()) : rivalNombre();
          return '<div class="prow"><span class="num-badge sm">' + (i + 1) + '</span>' +
            '<div class="pmain"><div class="nm">' + U.esc(quien) + '</div>' +
            '<div class="sub">' + (t.eq === "a" ? "Nosotros" : "Rival") + '</div></div>' +
            '<div class="pend"><div class="big">' + (t.ok ? "✓" : "✕") + '</div></div></div>';
        }).join("") + '</div>'
      : '<p class="hint mt2">Todavía no ha lanzado nadie.</p>';

    window.CB.shell.openSheet("Tanda de penaltis",
      '<div class="kpi accent"><div class="v">' + p.a + " – " + p.b + '</div>' +
        '<div class="k">' + U.esc(S.club()) + " · " + U.esc(rivalNombre()) + '</div></div>' +
      '<div class="grid-2 mt2">' +
        '<button class="btn pri" onclick="CB.match.penTiro(\'a\',1)">Marcamos</button>' +
        '<button class="btn" onclick="CB.match.penTiro(\'a\',0)">Fallamos</button>' +
      '</div>' +
      '<div class="grid-2 mt1">' +
        '<button class="btn" onclick="CB.match.penTiro(\'b\',1)">Marca el rival</button>' +
        '<button class="btn" onclick="CB.match.penTiro(\'b\',0)">Falla el rival</button>' +
      '</div>' +
      (p.tiros.length
        ? '<button class="btn sm ghost wide mt2" onclick="CB.match.penDeshacer()">Deshacer el último lanzamiento</button>'
        : "") +
      lista,
      [
        { text: "Finalizar el partido", cls: "pri", fn: function () { window.CB.shell.closeSheet(); finalizar(true); } },
        { text: "Cerrar", cls: "ghost", fn: window.CB.shell.closeSheet }
      ]);
  }

  function penTiro(eq, ok) {
    var mt = m();
    if (!mt) return;
    ok = String(ok) === "1";
    if (eq !== "a") { registrarTiro("b", null, ok); return; }
    var ids = mt.campo.concat(mt.banq);
    if (!ids.length) { registrarTiro("a", null, ok); return; }
    elegirJugador(ok ? "¿Quién marcó?" : "¿Quién falló?", ids, "Lanzamiento de la tanda",
      function (id) { registrarTiro("a", id, ok); },
      { text: "Sin anotar quién", fn: function () {
          pickHandler = null;
          window.CB.shell.closeSheet();
          registrarTiro("a", null, ok);
        } });
  }

  function registrarTiro(eq, id, ok) {
    var p = tanda();
    if (!p) return;
    p.tiros.push({ eq: eq, j: id || null, ok: ok });
    if (ok) { if (eq === "a") p.a++; else p.b++; }
    var quien = eq === "a" ? (id ? nombre(id) : S.club()) : rivalNombre();
    log(quien, ok ? "pengol" : "penfallo", eq,
      (ok ? "Penalti marcado" : "Penalti fallado") + " · tanda " + p.a + "–" + p.b);
    S.save();
    render();
    penaltis();
  }

  function penDeshacer() {
    var mt = m();
    var p = tanda();
    if (!p || !p.tiros.length) return;
    var t = p.tiros.pop();
    if (t.ok) {
      if (t.eq === "a") p.a = Math.max(0, p.a - 1);
      else p.b = Math.max(0, p.b - 1);
    }
    /* Su línea de la crónica es la más reciente de la tanda. */
    for (var i = 0; i < mt.log.length; i++) {
      if (mt.log[i].k === "pengol" || mt.log[i].k === "penfallo") { mt.log.splice(i, 1); break; }
    }
    S.save();
    render();
    penaltis();
  }

  /* ---------------------------------------------------------
     Cierre del acta
     --------------------------------------------------------- */
  function finalizar(sinPreguntar) {
    var mt = m();
    if (!mt) return;
    if (!sinPreguntar && !window.CB.shell.confirmar("¿Cerrar el acta y guardarla?")) return;
    mt.br = null;   // si se cierra durante el descanso, no queda corriendo
    parar();
    log("Final del partido", "periodo");
    var e = S.ev(mt.ev) || { fecha: "", rival: "" };
    var acta = {
      id: U.uid(), ev: mt.ev, fecha: e.fecha, rival: e.rival,
      gf: mt.gf, gc: mt.gc, log: mt.log,
      goles: mt.goles || [], titulares: mt.titulares || [],
      pen: (mt.pen && mt.pen.tiros.length) ? mt.pen : null,
      dur: M.normDur(mt.dur),
      jug: mt.conv.map(function (id) {
        var j = S.jug(id) || {};
        return {
          j: id, dorsal: j.dorsal, nombre: j.nombre, pos: j.pos,
          seg: mt.t[id], min: Math.floor((mt.t[id] || 0) / 60), st: mt.st[id],
          gol: mt.gol[id] || 0, asi: (mt.asi && mt.asi[id]) || 0,
          fal: (mt.fal && mt.fal[id]) || 0, ta: mt.ta[id] || 0, tr: mt.tr[id] || 0
        };
      })
    };
    window.DB.partidos = window.DB.partidos.filter(function (p) { return p.ev !== mt.ev; });
    window.DB.partidos.push(acta);
    S.save();
    render();

    window.CB.shell.openSheet("Acta cerrada",
      '<p class="hint">' + acta.gf + " – " + acta.gc + " frente a " + U.esc(acta.rival || "el rival") +
      '. Ya está guardada en el dispositivo.</p>' +
      '<button class="btn pri wide" onclick="CB.reports.actaPdfPorId(\'' + acta.id + '\')">' +
        U.svg("pdf") + 'Acta en PDF</button>' +
      '<button class="btn wide mt1" onclick="CB.reports.actaTxtPorId(\'' + acta.id + '\')">' +
        U.svg("download") + 'Descargar en texto</button>',
      [{ text: "Cerrar", cls: "ghost", fn: window.CB.shell.closeSheet }]);
  }

  function actaPdf() {
    var a = window.DB.partidos.filter(function (p) { return p.ev === evId; })[0];
    if (!a) { U.toast("Este partido aún no tiene acta"); return; }
    window.CB.reports.actaPdf(a);
  }

  function recuperarActa() {
    var a = window.DB.partidos.filter(function (p) { return p.ev === evId; })[0];
    if (!a) { U.toast("Este partido no tiene acta"); return; }
    var mt = {
      ev: evId, conv: a.jug.map(function (f) { return f.j; }),
      campo: [], banq: [], per: 0, seg: 0, run: false, started: true,
      gf: a.gf, gc: a.gc, log: a.log, goles: a.goles || [], titulares: a.titulares || [],
      pen: a.pen || null, dur: M.normDur(a.dur), br: null,
      t: {}, st: {}, ta: {}, tr: {}, gol: {}, asi: {}, fal: {}
    };
    a.jug.forEach(function (f) {
      mt.t[f.j] = f.seg; mt.st[f.j] = f.st; mt.ta[f.j] = f.ta; mt.tr[f.j] = f.tr;
      mt.gol[f.j] = f.gol; mt.asi[f.j] = f.asi || 0; mt.fal[f.j] = f.fal || 0;
      if (f.st === "En el campo") mt.campo.push(f.j);
      else if (f.st !== "Expulsado") mt.banq.push(f.j);
    });
    window.DB.match = mt;
    parar();
    S.save();
    render();
    U.toast("Acta recuperada");
  }

  function cambiar(id) {
    if (m() && m().ev !== id) {
      if (!window.CB.shell.confirmar("Hay un partido en curso. ¿Cambiar de partido y descartarlo?")) {
        var s = U.$("mSel");
        if (s) s.value = m().ev;
        return;
      }
      parar();
      window.DB.match = null;
      S.save();
    }
    evId = id;
    render();
  }

  window.CB.match = {
    render: render, seleccionar: seleccionar, cambiar: cambiar,
    reloj: alternarReloj, periodo: siguientePeriodo,
    empezarParte: empezarParte, duracion: cambiarDuracion,
    convocar: convocar, alineacion: alineacion,
    gol: gol, golRival: golRival, asistencia: asistencia, cambio: cambio,
    tarjeta: tarjeta, falta: falta, nota: nota, corregir: corregir,
    penaltis: penaltis, penTiro: penTiro, penDeshacer: penDeshacer,
    finalizar: finalizar, actaPdf: actaPdf, recuperarActa: recuperarActa,
    pestana: pestana, detener: parar,
    _pick: _pick, _opt: _opt
  };
})();
