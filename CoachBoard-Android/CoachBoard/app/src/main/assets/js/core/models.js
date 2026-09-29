/* =============================================================
   CoachBoard · core/models.js
   Constantes de dominio y fábricas de objetos.
   ============================================================= */
(function () {
  "use strict";
  var U = window.CB.util;

  /* --- plantilla -------------------------------------------- */
  var POS = ["POR", "DFC", "LTD", "LTI", "MCD", "MC", "MCO", "ED", "EI", "SD", "DC"];
  var POS_LARGO = {
    POR: "Portero", DFC: "Defensa central", LTD: "Lateral derecho", LTI: "Lateral izquierdo",
    MCD: "Mediocentro defensivo", MC: "Mediocentro", MCO: "Mediapunta",
    ED: "Extremo derecho", EI: "Extremo izquierdo", SD: "Segundo delantero", DC: "Delantero centro"
  };
  var PIES = ["Diestro", "Zurdo", "Ambidiestro"];
  var ESTADOS = ["Disponible", "Lesionado", "Sancionado", "Baja"];

  /* --- asistencia ------------------------------------------- */
  var ATT_STATES = ["Presente", "Ausente", "Justificado", "Pendiente"];
  var ATT_GLYPH = { Presente: "✓", Ausente: "✕", Justificado: "!", Pendiente: "?" };

  /* --- calendario ------------------------------------------- */
  var TIPOS_SESION = ["Entrenamiento", "Partido", "Amistoso", "Torneo"];
  var CONDICIONES = ["Local", "Visitante", "Neutral"];

  /* --- partido ----------------------------------------------

     No todas las categorías juegan 2 x 45: fútbol 7 son 2 x 25, sala
     2 x 20 y en formación se juega a cuartos. La duración viaja con
     cada partido y de ella salen los nombres de los periodos y el
     minuto en el que arranca cada uno.

     Después de las partes van siempre dos prórrogas y la tanda de
     penaltis, que ocupa un hueco de periodo aunque no tenga reloj. */
  var DUR_DEF = { partes: 2, min: 45, desc: 15, prorroga: 15 };

  var FORMATOS = [
    { label: "Fútbol 11",  partes: 2, min: 45, desc: 15, prorroga: 15 },
    { label: "Fútbol 8/7", partes: 2, min: 25, desc: 10, prorroga: 10 },
    { label: "Fútbol sala", partes: 2, min: 20, desc: 10, prorroga: 5 },
    { label: "Cuatro cuartos", partes: 4, min: 15, desc: 10, prorroga: 5 }
  ];

  function normDur(d) {
    d = d || {};
    return {
      partes: clampNum(d.partes, 1, 6, DUR_DEF.partes),
      min: clampNum(d.min, 1, 60, DUR_DEF.min),
      desc: clampNum(d.desc, 0, 30, DUR_DEF.desc),
      prorroga: clampNum(d.prorroga, 0, 30, DUR_DEF.prorroga)
    };
  }
  function clampNum(v, lo, hi, def) {
    v = parseInt(v, 10);
    if (isNaN(v)) return def;
    return Math.min(hi, Math.max(lo, v));
  }

  var ORD = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª"];
  var ORD_M = ["1er", "2º", "3er", "4º", "5º", "6º"];

  /* Nombres de los periodos: partes, dos prórrogas y la tanda. */
  function periodos(dur) {
    var d = normDur(dur), a = [], i;
    for (i = 0; i < d.partes; i++) {
      if (d.partes === 2) a.push(ORD[i] + " parte");
      else if (d.partes === 4) a.push(ORD_M[i] + " cuarto");
      else a.push(ORD_M[i] + " periodo");
    }
    a.push("Prórroga 1", "Prórroga 2", "Penaltis");
    return a;
  }

  /* Segundo en el que empieza cada periodo, para que el reloj siga
     contando hacia arriba en vez de volver a cero en cada parte. */
  function periodoBase(dur) {
    var d = normDur(dur), a = [], i, t = 0;
    for (i = 0; i < d.partes; i++) { a.push(t); t += d.min * 60; }
    a.push(t); t += d.prorroga * 60;   // prórroga 1
    a.push(t); t += d.prorroga * 60;   // prórroga 2
    a.push(t);                         // penaltis
    return a;
  }

  function penIndex(dur) { return normDur(dur).partes + 2; }

  /* Descanso de este cambio de parte: el largo es el del intermedio;
     entre cuartos solo se cambia de campo. */
  function descansoSeg(dur, perQueAcaba) {
    var d = normDur(dur);
    var medio = Math.floor(d.partes / 2) - 1;
    if (perQueAcaba === medio) return d.desc * 60;
    return Math.min(d.desc, 5) * 60;
  }

  function durTexto(dur) {
    var d = normDur(dur);
    return d.partes + " × " + d.min + " min";
  }

  var TIPOS_GOL = ["Jugada", "Penalti", "Falta directa", "Corner", "En propia del rival"];
  var TIPOS_GOL_RIVAL = ["Jugada", "Penalti", "Falta directa", "Corner", "En propia puerta"];

  /* --- pizarra ---------------------------------------------- */
  var COLS = {
    Azul: "#4C8DFF", Rojo: "#EF4444", Amarillo: "#F5B942", Verde: "#32D583",
    Naranja: "#FF8C42", Blanco: "#F5F7FA", Negro: "#161A21"
  };

  /* Cada herramienta declara qué pieza crea y si admite rotación. */
  var TOOLS = [
    { id: "Mover",        label: "Mover",     icon: "t_player", select: true },
    { id: "Jugador",      label: "Jugador",   icon: "t_player" },
    { id: "Rival",        label: "Rival",     icon: "t_player" },
    { id: "Portero",      label: "Portero",   icon: "t_player" },
    { id: "Balon",        label: "Balón",     icon: "t_ball" },
    { id: "Cono",         label: "Cono",      icon: "t_cone" },
    { id: "Pica",         label: "Pica",      icon: "t_pole" },
    { id: "Aro",          label: "Aro",       icon: "t_hoop" },
    { id: "Valla",        label: "Valla",     icon: "t_hurdle" },
    { id: "Escalera",     label: "Escalera",  icon: "t_ladder" },
    { id: "Maniqui",      label: "Maniquí",   icon: "t_dummy" },
    { id: "Porteria",     label: "Portería",  icon: "t_goal" },
    { id: "Miniporteria", label: "Mini",      icon: "t_minigoal" },
    { id: "Flecha",       label: "Flecha",    icon: "t_arrow" },
    { id: "Pase",         label: "Pase",      icon: "t_line" },
    { id: "Conduccion",   label: "Conducción", icon: "t_arrow" },
    { id: "Linea",        label: "Línea",     icon: "t_line" },
    { id: "Zona",         label: "Zona",      icon: "t_zone" },
    { id: "Texto",        label: "Texto",     icon: "t_text" }
  ];

  /* Piezas de dos extremos: se orientan arrastrando, no rotando. */
  var DOS_PUNTAS = ["Flecha", "Zona"];
  function esDosPuntas(it) { return DOS_PUNTAS.indexOf(it.tipo) >= 0; }

  var MODOS_CAMPO = [
    { id: "Completo", label: "Campo entero" },
    { id: "Medio", label: "Medio campo" },
    { id: "Pizarra", label: "En blanco" }
  ];

  var CATEGORIAS = ["Posesión", "Finalización", "Salida de balón", "Presión",
                    "Transiciones", "Balón parado", "Físico", "Técnica", "Calentamiento", "Partido"];

  /* Fábrica de piezas: todo lo que necesita el motor de escena. */
  function makeItem(tool, nx, ny, color, contexto) {
    var it = {
      id: U.uid(),
      tipo: tool,
      x: nx, y: ny,
      x2: nx + 0.09, y2: ny,
      rot: 0,
      scale: 1,
      color: color || "Azul",
      txt: "",
      estilo: ""
    };
    var items = (contexto && contexto.items) || [];

    if (tool === "Rival") {
      it.tipo = "Jugador"; it.color = "Rojo";
      it.txt = String(items.filter(function (i) {
        return i.tipo === "Jugador" && i.color === "Rojo";
      }).length + 1);
    } else if (tool === "Jugador") {
      it.txt = String(items.filter(function (i) {
        return i.tipo === "Jugador" && i.color !== "Rojo";
      }).length + 1);
    } else if (tool === "Portero") {
      it.txt = "P"; it.color = "Amarillo";
    } else if (tool === "Flecha" || tool === "Pase" || tool === "Conduccion" || tool === "Linea") {
      it.tipo = "Flecha";
      it.estilo = tool === "Flecha" ? "Desplazamiento" : tool;
    } else if (tool === "Zona") {
      it.x2 = nx + 0.14; it.y2 = ny + 0.14;
    }
    return it;
  }

  /* --- formaciones (coordenadas normalizadas, ataque a la derecha) --- */
  var FORMS = {
    "4-4-2":      [[.055,.5],[.2,.16],[.19,.38],[.19,.62],[.2,.84],[.33,.14],[.31,.39],[.31,.61],[.33,.86],[.44,.4],[.44,.6]],
    "4-3-3":      [[.055,.5],[.2,.16],[.19,.38],[.19,.62],[.2,.84],[.3,.3],[.28,.5],[.3,.7],[.44,.16],[.46,.5],[.44,.84]],
    "4-2-3-1":    [[.055,.5],[.2,.16],[.19,.38],[.19,.62],[.2,.84],[.27,.38],[.27,.62],[.38,.16],[.37,.5],[.38,.84],[.46,.5]],
    "4-1-4-1":    [[.055,.5],[.2,.16],[.19,.38],[.19,.62],[.2,.84],[.26,.5],[.35,.14],[.34,.39],[.34,.61],[.35,.86],[.46,.5]],
    "3-5-2":      [[.055,.5],[.19,.28],[.18,.5],[.19,.72],[.3,.1],[.31,.32],[.29,.5],[.31,.68],[.3,.9],[.44,.4],[.44,.6]],
    "3-4-3":      [[.055,.5],[.19,.28],[.18,.5],[.19,.72],[.31,.13],[.3,.39],[.3,.61],[.31,.87],[.44,.18],[.46,.5],[.44,.82]],
    "5-3-2":      [[.055,.5],[.19,.1],[.18,.3],[.17,.5],[.18,.7],[.19,.9],[.31,.3],[.3,.5],[.31,.7],[.44,.4],[.44,.6]],
    "4-4-2 rombo":[[.055,.5],[.2,.16],[.19,.38],[.19,.62],[.2,.84],[.27,.5],[.33,.24],[.33,.76],[.39,.5],[.46,.4],[.46,.6]]
  };

  window.CB.models = {
    POS: POS, POS_LARGO: POS_LARGO, PIES: PIES, ESTADOS: ESTADOS,
    ATT_STATES: ATT_STATES, ATT_GLYPH: ATT_GLYPH,
    TIPOS_SESION: TIPOS_SESION, CONDICIONES: CONDICIONES,
    DUR_DEF: DUR_DEF, FORMATOS: FORMATOS, normDur: normDur,
    periodos: periodos, periodoBase: periodoBase, penIndex: penIndex,
    descansoSeg: descansoSeg, durTexto: durTexto,
    TIPOS_GOL: TIPOS_GOL, TIPOS_GOL_RIVAL: TIPOS_GOL_RIVAL,
    COLS: COLS, TOOLS: TOOLS, MODOS_CAMPO: MODOS_CAMPO, CATEGORIAS: CATEGORIAS,
    esDosPuntas: esDosPuntas, makeItem: makeItem, FORMS: FORMS
  };
})();
