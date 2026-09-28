/**
 * Recorrido funcional de la aplicación: plantilla, calendario, asistencia,
 * partido en directo, informes, copias de seguridad y migración de datos.
 *
 * Cubre lo que ya existía antes del rediseño, para que un cambio de
 * interfaz no se lleve por delante ninguna función.
 */
import { abrirPagina, crearRunner } from "./harness.mjs";

export default async function (browser, url, etiqueta = "aplicación") {
  const { contexto, pagina, errores } = await abrirPagina(browser, url);
  const runner = crearRunner(etiqueta, errores, pagina);
  const paso = runner.paso;

  await paso("arranca sin errores de JavaScript", async () => {});

  await paso("todos los módulos quedan registrados", async () => {
    const ns = await pagina.evaluate(() => Object.keys(window.CB).sort().join(","));
    for (const m of ["app", "drills", "match", "scene", "store", "tactics"]) {
      if (!ns.includes(m)) throw new Error(`falta ${m} (hay: ${ns})`);
    }
  });

  await paso("ajustes: nombre del equipo", async () => {
    await pagina.evaluate(() => CB.settings.open());
    await pagina.fill("#cfgClub", "UD Ejemplo");
    await pagina.evaluate(() => CB.settings.guardarClub());
    if (await pagina.evaluate(() => DB.club) !== "UD Ejemplo") throw new Error("no se guardó");
    const sub = await pagina.locator("#topSub").innerText();
    if (!sub.includes("UD Ejemplo")) throw new Error("la cabecera no se actualizó");
    await pagina.evaluate(() => CB.shell.closeSheet());
  });

  await paso("plantilla: alta por formulario", async () => {
    await pagina.evaluate(() => { CB.shell.go("squad"); CB.squad.editar(null); });
    await pagina.fill("#pNom", "Prueba Jugador");
    await pagina.fill("#pDor", "77");
    await pagina.selectOption("#pPos", "DC");
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    const j = await pagina.evaluate(() => DB.jugadores.find(x => x.nombre === "Prueba Jugador"));
    if (!j || j.dorsal !== 77 || j.pos !== "DC") throw new Error(JSON.stringify(j));
  });

  await paso("plantilla: editar no duplica la ficha", async () => {
    const id = await pagina.evaluate(() => DB.jugadores[0].id);
    await pagina.evaluate(i => CB.squad.editar(i), id);
    await pagina.fill("#pNom", "Nombre Cambiado");
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    const n = await pagina.evaluate(() => DB.jugadores.length);
    const nom = await pagina.evaluate(i => DB.jugadores.find(x => x.id === i).nombre, id);
    if (n !== 1) throw new Error("duplicó: " + n);
    if (nom !== "Nombre Cambiado") throw new Error("no guardó el cambio");
  });

  await paso("plantilla de ejemplo y filtros", async () => {
    await pagina.evaluate(() => CB.squad.demo());
    await pagina.evaluate(() => CB.squad.filtrar("disponibles"));
    await pagina.evaluate(() => CB.squad.ordenar());
    await pagina.evaluate(() => CB.squad.filtrar("todos"));
    const filas = await pagina.locator("#squadBody .prow").count();
    if (filas < 18) throw new Error("filas=" + filas);
  });

  await paso("ficha del jugador se abre", async () => {
    await pagina.evaluate(() => CB.squad.abrir(DB.jugadores[0].id));
    if (!(await pagina.locator("#sheet").isVisible())) throw new Error("no se abrió");
    await pagina.evaluate(() => CB.shell.closeSheet());
  });

  await paso("calendario: crear, editar y eliminar", async () => {
    await pagina.evaluate(() => { CB.shell.go("agenda"); CB.agenda.editar(null, "Entrenamiento"); });
    await pagina.fill("#eLug", "Campo de prueba");
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    if (await pagina.evaluate(() => DB.eventos.length) !== 1) throw new Error("no se creó");
    const id = await pagina.evaluate(() => DB.eventos[0].id);
    await pagina.evaluate(i => CB.agenda.editar(i), id);
    await pagina.fill("#eRiv", "Rival X");
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    if (await pagina.evaluate(() => DB.eventos[0].rival) !== "Rival X") throw new Error("no se editó");
    pagina.once("dialog", d => d.accept());
    await pagina.evaluate(i => CB.agenda.editar(i), id);
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[0].click());
    await pagina.waitForTimeout(150);
    if (await pagina.evaluate(() => DB.eventos.length) !== 0) throw new Error("no se eliminó");
  });

  await paso("inicio muestra el próximo partido", async () => {
    await pagina.evaluate(() => {
      const d = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      DB.eventos.push({ id: "p1", tipo: "Partido", fecha: d(2), hora: "18:00", rival: "CD Ejemplo",
        cond: "Local", lugar: "Campo Municipal", comp: "Liga", notas: "" });
      DB.eventos.push({ id: "e1", tipo: "Entrenamiento", fecha: d(1), hora: "19:30", rival: "",
        cond: "Local", lugar: "Anexo", comp: "", notas: "" });
      CB.store.save(); CB.app.renderAll(); CB.shell.go("home");
    });
    await pagina.waitForTimeout(250);
    const t = await pagina.locator("#homeBody").innerText();
    if (!t.includes("CD Ejemplo")) throw new Error("no aparece el rival");
    if (!await pagina.locator("#homeBody .hero").count()) throw new Error("sin tarjeta de partido");
  });

  await paso("asistencia: un toque recorre los estados", async () => {
    await pagina.evaluate(() => CB.attendance.abrir("e1"));
    await pagina.waitForTimeout(250);
    const id = await pagina.evaluate(() => DB.jugadores[0].id);
    await pagina.evaluate(i => CB.attendance.ciclar(i), id);   // Pendiente -> Presente
    await pagina.evaluate(i => CB.attendance.ciclar(i), id);   // Presente  -> Ausente
    const e = await pagina.evaluate(i => DB.asistencia[0].regs.find(r => r.j === i).e, id);
    if (e !== "Ausente") throw new Error("estado=" + e);
  });

  await paso("asistencia: todos presentes actualiza el porcentaje", async () => {
    await pagina.evaluate(() => CB.attendance.todos("Presente"));
    const p = await pagina.evaluate(() => CB.store.attPct(DB.jugadores[0].id));
    if (!p || p.pct !== 100) throw new Error(JSON.stringify(p));
  });

  // ---------------------------------------------------------------
  // Partido en directo
  // ---------------------------------------------------------------
  await paso("partido: convocatoria y once inicial", async () => {
    await pagina.evaluate(() => { CB.shell.go("match"); CB.match.seleccionar("p1"); });
    await pagina.waitForTimeout(200);
    await pagina.evaluate(() => {
      const ids = DB.jugadores.slice(0, 16).map(j => j.id);
      CB.match.convocar();
      document.querySelectorAll("#sheetBody input").forEach(i => { i.checked = ids.includes(i.value); });
      document.querySelectorAll("#sheetFoot .btn")[1].click();
    });
    await pagina.waitForTimeout(400);
    await pagina.evaluate(() => {
      const ids = DB.match.conv.slice(0, 11);
      document.querySelectorAll("#sheetBody input").forEach(i => { i.checked = ids.includes(i.value); });
      document.querySelectorAll("#sheetFoot .btn")[1].click();
    });
    const n = await pagina.evaluate(() => DB.match.campo.length);
    if (n !== 11) throw new Error("once=" + n);
  });

  await paso("partido: el reloj suma minutos a los que están en el campo", async () => {
    await pagina.evaluate(() => CB.match.reloj());
    await pagina.waitForTimeout(2300);
    const seg = await pagina.evaluate(() => DB.match.seg);
    const min = await pagina.evaluate(() => DB.match.t[DB.match.campo[0]]);
    await pagina.evaluate(() => CB.match.reloj());
    if (seg < 2 || min < 2) throw new Error(`seg=${seg} minutos=${min}`);
  });

  await paso("partido: gol de jugada pregunta la asistencia", async () => {
    await pagina.evaluate(() => CB.match.gol());
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .prow")[3].click());
    await pagina.waitForTimeout(150);
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .btn")[0].click());
    await pagina.waitForTimeout(400);
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .prow")[0].click());
    await pagina.waitForTimeout(150);
    const g = await pagina.evaluate(() => DB.match.goles[0]);
    if (await pagina.evaluate(() => DB.match.gf) !== 1) throw new Error("marcador");
    if (!g.j || !g.a) throw new Error("gol sin goleador o sin asistente: " + JSON.stringify(g));
  });

  await paso("partido: el penalti no pregunta asistencia", async () => {
    await pagina.evaluate(() => CB.match.gol());
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .prow")[2].click());
    await pagina.waitForTimeout(150);
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .btn")[1].click());
    await pagina.waitForTimeout(350);
    if (await pagina.locator("#sheet").isVisible()) throw new Error("no debería pedir asistencia");
    const g = await pagina.evaluate(() => DB.match.goles[1]);
    if (g.tipo !== "Penalti") throw new Error("tipo=" + g.tipo);
  });

  await paso("partido: cambio", async () => {
    await pagina.evaluate(() => CB.match.cambio());
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .prow")[0].click());
    await pagina.waitForTimeout(350);
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .prow")[0].click());
    await pagina.waitForTimeout(150);
    if (await pagina.evaluate(() => DB.match.log[0].k) !== "cambio") throw new Error("no se registró");
  });

  await paso("partido: amarilla", async () => {
    await pagina.evaluate(() => CB.match.tarjeta("y"));
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .prow")[0].click());
    await pagina.waitForTimeout(150);
    const ta = await pagina.evaluate(() => Object.values(DB.match.ta).reduce((a, b) => a + b, 0));
    if (ta !== 1) throw new Error("amarillas=" + ta);
  });

  // ---------------------------------------------------------------
  // Fin de parte: prórroga, penaltis o final
  // ---------------------------------------------------------------
  await paso("partido: el botón dice en qué parte estás", async () => {
    const t = await pagina.evaluate(() => {
      DB.match.per = 0; CB.match.render();
      return document.querySelector('#matchBody button[onclick*="periodo"]').innerText;
    });
    if (!t.includes("1ª parte")) throw new Error("etiqueta=" + t);
  });

  await paso("partido: de la 1ª a la 2ª parte no pregunta nada", async () => {
    await pagina.evaluate(() => CB.match.periodo());
    await pagina.waitForTimeout(150);
    if (await pagina.locator("#sheet").isVisible()) throw new Error("no debería preguntar");
    if (await pagina.evaluate(() => DB.match.per) !== 1) throw new Error("no avanzó");
  });

  await paso("partido: si está decidido ofrece finalizar, no la prórroga", async () => {
    await pagina.evaluate(() => { DB.match.gf = 2; DB.match.gc = 0; CB.match.periodo(); });
    await pagina.waitForTimeout(200);
    /* El título se pinta en mayúsculas por CSS: se compara sin distinguir. */
    const t = (await pagina.locator("#sheetTitle").innerText()).toLowerCase();
    const primero = await pagina.evaluate(() => document.querySelectorAll("#sheetBody .btn")[0].innerText);
    if (!t.includes("2ª parte")) throw new Error("título=" + t);
    if (!primero.toLowerCase().includes("finalizar")) throw new Error("la primera opción es: " + primero);
    await pagina.evaluate(() => { CB.shell.closeSheet(); });
    if (await pagina.evaluate(() => DB.match.per) !== 1) throw new Error("cancelar no debe avanzar");
  });

  await paso("partido: en empate ofrece prórroga, penaltis o empate", async () => {
    await pagina.evaluate(() => { DB.match.gc = 2; CB.match.periodo(); });
    await pagina.waitForTimeout(200);
    const ops = await pagina.evaluate(() =>
      [...document.querySelectorAll("#sheetBody .btn")].map(b => b.innerText));
    if (ops.length !== 3) throw new Error("opciones=" + JSON.stringify(ops));
    if (!ops.join(" ").includes("penaltis")) throw new Error("falta penaltis: " + ops);
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .btn")[0].click());
    await pagina.waitForTimeout(250);
    if (await pagina.evaluate(() => DB.match.per) !== 2) throw new Error("no entró en la prórroga");
  });

  await paso("partido: de la prórroga 1 a la 2 no pregunta nada", async () => {
    await pagina.evaluate(() => CB.match.periodo());
    await pagina.waitForTimeout(150);
    if (await pagina.locator("#sheet").isVisible()) throw new Error("no debería preguntar");
    if (await pagina.evaluate(() => DB.match.per) !== 3) throw new Error("no avanzó");
  });

  await paso("partido: al final de la prórroga se puede ir a penaltis", async () => {
    await pagina.evaluate(() => CB.match.periodo());
    await pagina.waitForTimeout(200);
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .btn")[0].click());
    await pagina.waitForTimeout(300);
    const r = await pagina.evaluate(() => ({
      per: DB.match.per, fin: CB.models.PER_PENALTIS, pen: !!DB.match.pen
    }));
    if (r.per !== r.fin || !r.pen) throw new Error(JSON.stringify(r));
  });

  await paso("penaltis: se anotan los lanzamientos y no tocan el marcador", async () => {
    const golesAntes = await pagina.evaluate(() => DB.match.gf);
    await pagina.evaluate(() => CB.match.penTiro("a", 1));
    await pagina.waitForTimeout(200);
    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .prow")[0].click());
    await pagina.waitForTimeout(250);
    await pagina.evaluate(() => CB.match.penTiro("b", 0));
    await pagina.waitForTimeout(250);
    const r = await pagina.evaluate(() => ({
      a: DB.match.pen.a, b: DB.match.pen.b, tiros: DB.match.pen.tiros.length,
      gf: DB.match.gf, goles: DB.match.goles.length
    }));
    if (r.a !== 1 || r.b !== 0 || r.tiros !== 2) throw new Error(JSON.stringify(r));
    if (r.gf !== golesAntes || r.goles !== 2) throw new Error("la tanda tocó el marcador: " + JSON.stringify(r));
  });

  await paso("penaltis: el botón de gol normal lleva a la tanda", async () => {
    await pagina.evaluate(() => { CB.shell.closeSheet(); CB.match.gol(); });
    await pagina.waitForTimeout(250);
    const t = (await pagina.locator("#sheetTitle").innerText()).toLowerCase();
    if (!t.includes("tanda")) throw new Error("abrió: " + t);
  });

  await paso("penaltis: deshacer quita el lanzamiento y su línea", async () => {
    const antes = await pagina.evaluate(() => DB.match.log.length);
    await pagina.evaluate(() => CB.match.penDeshacer());
    await pagina.waitForTimeout(250);
    const r = await pagina.evaluate(() => ({ tiros: DB.match.pen.tiros.length, log: DB.match.log.length }));
    if (r.tiros !== 1 || r.log !== antes - 1) throw new Error(JSON.stringify(r));
    await pagina.evaluate(() => CB.shell.closeSheet());
  });

  await paso("partido: cerrar el acta", async () => {
    pagina.once("dialog", d => d.accept());
    await pagina.evaluate(() => CB.match.finalizar());
    await pagina.waitForTimeout(300);
    if (await pagina.evaluate(() => DB.partidos.length) !== 1) throw new Error("no se guardó el acta");
    await pagina.evaluate(() => CB.shell.closeSheet());
  });

  await paso("acta en PDF se genera", async () => {
    const html = await pagina.evaluate(() => CB.reports.actaHtml(DB.partidos[0]));
    if (!html.includes("ACTA DE PARTIDO")) throw new Error("acta vacía");
    if (!html.includes("UD Ejemplo")) throw new Error("falta el nombre del equipo");
  });

  await paso("el acta recoge la tanda de penaltis", async () => {
    const r = await pagina.evaluate(() => ({
      pen: DB.partidos[0].pen,
      html: CB.reports.actaHtml(DB.partidos[0])
    }));
    if (!r.pen || r.pen.tiros.length !== 1) throw new Error("el acta no guardó la tanda");
    if (!r.html.includes("en penaltis")) throw new Error("el resultado no menciona la tanda");
    if (!r.html.includes("Tanda de penaltis")) throw new Error("falta la tabla de la tanda");
  });

  await paso("ficha del jugador en PDF se genera", async () => {
    const html = await pagina.evaluate(() => CB.reports.fichaHtml(DB.jugadores[0].id));
    if (!html.includes("FICHA DE JUGADOR")) throw new Error("ficha vacía");
  });

  // ---------------------------------------------------------------
  // Datos
  // ---------------------------------------------------------------
  await paso("los datos sobreviven a cerrar y reabrir", async () => {
    await pagina.evaluate(() => CB.store.save());
    await pagina.goto("about:blank");
    await pagina.waitForTimeout(150);
    await pagina.goto(url);
    await pagina.waitForTimeout(500);
    const r2 = await pagina.evaluate(() => ({ club: DB.club, j: DB.jugadores.length, p: DB.partidos.length }));
    if (r2.club !== "UD Ejemplo" || r2.j < 18 || r2.p !== 1) throw new Error(JSON.stringify(r2));
  });

  await paso("un partido guardado no reanuda el reloj solo", async () => {
    const corriendo = await pagina.evaluate(() => DB.match && DB.match.run);
    if (corriendo) throw new Error("el cronómetro arrancó al abrir");
  });

  await paso("copia de seguridad y restauración", async () => {
    const copia = await pagina.evaluate(() => JSON.stringify(DB));
    await pagina.evaluate(() => { window.DB = CB.store.normalize({}); CB.store.save(); CB.app.renderAll(); });
    if (await pagina.evaluate(() => DB.jugadores.length) !== 0) throw new Error("no se vació");
    await pagina.evaluate(c => {
      window.DB = CB.store.normalize(JSON.parse(c));
      CB.store.save(); CB.app.renderAll();
    }, copia);
    if (await pagina.evaluate(() => DB.jugadores.length) < 18) throw new Error("no se restauró");
  });

  await paso("navegación: todas las secciones responden", async () => {
    for (const v of ["home", "squad", "agenda", "att", "match", "board", "tac"]) {
      await pagina.evaluate(x => CB.shell.go(x), v);
      await pagina.waitForTimeout(130);
      const on = await pagina.evaluate(x => document.getElementById("v-" + x).classList.contains("on"), v);
      if (!on) throw new Error("no activó " + v);
    }
  });

  await paso("el menú Más lleva a las pantallas secundarias", async () => {
    await pagina.evaluate(() => CB.shell.go("home"));
    await pagina.evaluate(() => document.querySelectorAll("#nav button")[4].click());
    await pagina.waitForTimeout(250);
    const t = await pagina.locator("#sheetBody").innerText();
    for (const x of ["Calendario", "Tácticas", "Ajustes"]) {
      if (!t.includes(x)) throw new Error("falta " + x);
    }
    await pagina.evaluate(() => CB.shell.closeSheet());
  });

  await paso("el chip de ordenar cabe dentro de su píldora", async () => {
    await pagina.evaluate(() => CB.shell.go("squad"));
    await pagina.waitForTimeout(220);
    const r = await pagina.evaluate(() => {
      const b = document.querySelector('#squadBody .chip[onclick*="ordenar"]');
      if (!b) return { falta: true };
      const cb = b.getBoundingClientRect();
      const svg = b.querySelector("svg").getBoundingClientRect();
      const txt = b.querySelector("span").getBoundingClientRect();
      return {
        texto: b.innerText.trim(),
        icono: Math.round(svg.width),
        desbordaTexto: Math.round(txt.right - cb.right),
        desbordaIcono: Math.round(svg.right - cb.right),
        anchoChip: Math.round(cb.width)
      };
    });
    if (r.falta) throw new Error("no se encontró el chip de ordenar");
    if (r.texto !== "Dorsal") throw new Error("texto=" + r.texto);
    if (r.icono > 20) throw new Error("el icono mide " + r.icono + "px: se come la píldora");
    if (r.desbordaTexto > 0 || r.desbordaIcono > 0) {
      throw new Error("se sale de la píldora: " + JSON.stringify(r));
    }
    if (r.anchoChip > 140) throw new Error("píldora de " + r.anchoChip + "px");
  });

  await paso("ninguna pantalla desborda a lo ancho", async () => {
    for (const v of ["home", "squad", "agenda", "att", "match", "board", "tac"]) {
      await pagina.evaluate(x => CB.shell.go(x), v);
      await pagina.waitForTimeout(160);
      const d = await pagina.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: window.innerWidth
      }));
      if (d.sw > d.iw + 1) throw new Error(`${v}: ${d.sw} > ${d.iw}`);
    }
  });

  await contexto.close();

  // --- migración desde la versión anterior, en una instalación limpia ---
  const limpio = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p2 = await limpio.newPage();
  const err2 = [];
  p2.on("pageerror", e => err2.push("PAGEERROR: " + e.message));
  const r2 = crearRunner(etiqueta + " · migración", err2, p2);

  await p2.addInitScript(() => {
    localStorage.setItem("entrenadorpro.v1", JSON.stringify({
      club: "Club Antiguo",
      jugadores: [{ id: "v1", dorsal: 9, nombre: "Viejo", pos: "DC", pie: "Diestro", estado: "Disponible" }],
      eventos: [{ id: "e", tipo: "Entrenamiento", fecha: "2026-01-10", hora: "19:00" }],
      asistencia: [{ ev: "e", regs: [{ j: "v1", e: "Justif." }, { j: "v1", e: "Lesion." }] }],
      ejercicios: [{ id: "x", nombre: "Antiguo", items: [{ id: "i", tipo: "Cono", x: .3, y: .3, color: "Azul" }] }],
      tacticas: [], partidos: []
    }));
  });
  await p2.goto(url);
  await p2.waitForTimeout(600);

  await r2.paso("se leen los datos de la versión anterior", async () => {
    const d = await p2.evaluate(() => ({
      club: DB.club, j: DB.jugadores.length,
      estados: DB.asistencia[0].regs.map(x => x.e),
      rot: DB.ejercicios[0].items[0].rot,
      cat: DB.ejercicios[0].categoria,
      clave: !!localStorage.getItem("coachboard.v1")
    }));
    if (d.club !== "Club Antiguo" || d.j !== 1) throw new Error("no migró: " + JSON.stringify(d));
    if (d.estados.join(",") !== "Justificado,Justificado") throw new Error("estados: " + d.estados);
    if (d.rot !== 0) throw new Error("las piezas no reciben rotación");
    if (d.cat !== "") throw new Error("falta el campo categoría");
    if (!d.clave) throw new Error("no se escribió la clave nueva");
  });

  await limpio.close();
  return runner.contarFallos() + r2.contarFallos();
}
