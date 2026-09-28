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

  /* --- partido ---------------------------------------------- */
  /* El último "periodo" es la tanda de penaltis: no tiene reloj, pero
     ocupa un hueco aquí para que el partido pueda avanzar hasta ella. */
  var PERIODOS = ["1ª parte", "2ª parte", "Prórroga 1", "Prórroga 2", "Penaltis"];
  var PERIODO_BASE = [0, 2700, 5400, 6300, 7200];
  var PER_PENALTIS = 4;
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
    PERIODOS: PERIODOS, PERIODO_BASE: PERIODO_BASE, PER_PENALTIS: PER_PENALTIS,
    TIPOS_GOL: TIPOS_GOL, TIPOS_GOL_RIVAL: TIPOS_GOL_RIVAL,
    COLS: COLS, TOOLS: TOOLS, MODOS_CAMPO: MODOS_CAMPO, CATEGORIAS: CATEGORIAS,
    esDosPuntas: esDosPuntas, makeItem: makeItem, FORMS: FORMS
  };
})();
