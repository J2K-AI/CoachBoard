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
    await pagina.waitForTimeout(200);
    /* El lugar ya no es un campo de texto: se elige en su buscador, y
       "Usar lo escrito" permite guardarlo a mano como siempre. */
    await pagina.evaluate(() => CB.agenda.lugar());
    await pagina.waitForTimeout(200);
    await pagina.fill("#lqBusca", "Campo de prueba");
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    await pagina.waitForTimeout(250);
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    if (await pagina.evaluate(() => DB.eventos.length) !== 1) throw new Error("no se creó");
    if (await pagina.evaluate(() => DB.eventos[0].lugar) !== "Campo de prueba") {
      throw new Error("no guardó el lugar escrito a mano");
    }
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
  await paso("convocatoria: no llega con toda la plantilla marcada", async () => {
    /* Era la causa de que luego las listas de falta, tarjeta o
       asistencia enseñaran al equipo entero. */
    await pagina.evaluate(() => {
      DB.jugadores[0].estado = "Lesionado";
      DB.jugadores[1].estado = "Sancionado";
      CB.store.save();
      CB.shell.go("match"); CB.match.seleccionar("p1");
    });
    await pagina.waitForTimeout(250);
    await pagina.evaluate(() => CB.match.convocar());
    await pagina.waitForTimeout(250);
    const r = await pagina.evaluate(() => ({
      total: document.querySelectorAll('#sheetBody input[type="checkbox"]').length,
      marcados: document.querySelectorAll('#sheetBody input[type="checkbox"]:checked').length,
      recuento: document.getElementById("convN").textContent
    }));
    if (r.marcados !== r.total - 2) {
      throw new Error("marcados " + r.marcados + " de " + r.total + " (deberían faltar los 2 no disponibles)");
    }
    if (!r.recuento.includes(String(r.marcados))) throw new Error("recuento: " + r.recuento);

    await pagina.evaluate(() => CB.match.marcar("ninguno"));
    await pagina.waitForTimeout(150);
    if (await pagina.evaluate(() => document.querySelectorAll('#sheetBody input:checked').length) !== 0) {
      throw new Error("'Ninguno' no desmarcó");
    }
    await pagina.evaluate(() => CB.match.marcar("todos"));
    await pagina.waitForTimeout(150);
    if (await pagina.evaluate(() => document.querySelectorAll('#sheetBody input:checked').length) !== r.total) {
      throw new Error("'Todos' no marcó a todos");
    }
    await pagina.evaluate(() => {
      CB.shell.closeSheet();
      DB.jugadores[0].estado = "Disponible";
      DB.jugadores[1].estado = "Disponible";
      CB.store.save();
    });
  });

  await paso("las acciones del partido solo ofrecen a los convocados", async () => {
    await pagina.evaluate(() => {
      const ids = DB.jugadores.slice(0, 14).map(j => j.id);
      CB.match.seleccionar("p1");
      DB.match = { ev: "p1", conv: ids, campo: ids.slice(0, 11), banq: ids.slice(11),
        per: 0, seg: 0, run: false, started: true, gf: 0, gc: 0, log: [], goles: [],
        titulares: ids.slice(0, 11), dur: CB.models.normDur(null), br: null,
        t: {}, st: {}, ta: {}, tr: {}, gol: {}, asi: {}, fal: {} };
      ids.forEach(i => { DB.match.t[i] = 0; DB.match.st[i] = "Banquillo"; });
      CB.store.save(); CB.match.render();
    });
    await pagina.waitForTimeout(250);
    const plantilla = await pagina.evaluate(() => DB.jugadores.length);
    for (const [fn, max] of [["falta", 14], ["tarjeta", 14], ["asistencia", 14], ["gol", 11]]) {
      await pagina.evaluate(f => (f === "tarjeta" ? CB.match.tarjeta("y") : CB.match[f]()), fn);
      await pagina.waitForTimeout(250);
      const n = await pagina.evaluate(() => document.querySelectorAll("#sheetBody .prow").length);
      await pagina.evaluate(() => CB.shell.closeSheet());
      await pagina.waitForTimeout(120);
      if (n > max) throw new Error(fn + " ofrece " + n + " de " + plantilla + ", máximo " + max);
    }
  });

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

  await paso("descanso: arranca solo al cambiar de parte", async () => {
    const a = await pagina.evaluate(() => ({ br: !!DB.match.br, run: DB.match.br && DB.match.br.run }));
    if (!a.br || !a.run) throw new Error("no arrancó el descanso: " + JSON.stringify(a));
    await pagina.waitForTimeout(2200);
    const seg = await pagina.evaluate(() => DB.match.br.seg);
    if (seg < 2) throw new Error("el descanso no corre: " + seg);
    const reloj = await pagina.evaluate(() => document.getElementById("mClock").textContent);
    if (!/^\d\d:\d\d$/.test(reloj)) throw new Error("reloj del descanso: " + reloj);
  });

  await paso("descanso: el botón grande arranca la parte siguiente", async () => {
    const t = await pagina.evaluate(() =>
      document.querySelector("#matchBody .btn.lg.wide").innerText.trim());
    if (!t.toLowerCase().includes("empezar")) throw new Error("botón: " + t);
    await pagina.evaluate(() => CB.match.empezarParte());
    await pagina.waitForTimeout(1400);
    const r = await pagina.evaluate(() => ({ br: !!DB.match.br, run: DB.match.run, seg: DB.match.seg }));
    if (r.br || !r.run || r.seg < 1) throw new Error(JSON.stringify(r));
  });

  await paso("el reloj no se queda en 45: sigue contando en la 2ª parte", async () => {
    /* El fallo original: al pasar de parte el reloj quedaba en pausa
       y el acta se cerraba en 45:00 aunque se jugara la 2ª entera. */
    const r = await pagina.evaluate(() => {
      DB.match.seg = 40 * 60;            // 40 minutos de 2ª parte
      CB.match.render();
      return document.getElementById("mClock").textContent;
    });
    if (r !== "85:00") throw new Error("marca " + r + ", debería marcar 85:00");
    const fin = await pagina.evaluate(() => {
      DB.match.seg = 45 * 60;
      CB.match.render();
      return document.getElementById("mClock").textContent;
    });
    if (fin !== "90:00") throw new Error("al final de la 2ª marca " + fin);
    await pagina.evaluate(() => { DB.match.seg = 120; CB.match.render(); });
  });

  await paso("el tiempo añadido queda anotado en la crónica", async () => {
    const txt = await pagina.evaluate(() =>
      DB.match.log.filter(l => l.k === "periodo").map(l => l.t).join(" | "));
    if (!/Fin de la 1ª parte \(\d\d:\d\d\)/.test(txt)) throw new Error("crónica: " + txt);
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
      per: DB.match.per, fin: CB.models.penIndex(DB.match.dur), pen: !!DB.match.pen
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

  // ---------------------------------------------------------------
  // Duración del partido
  // ---------------------------------------------------------------
  await paso("duración: la rueda se abre con tres columnas", async () => {
    await pagina.evaluate(() => { CB.shell.go("agenda"); CB.agenda.editar(null, "Partido"); });
    await pagina.waitForTimeout(250);
    await pagina.evaluate(() => CB.agenda.duracion());
    await pagina.waitForTimeout(300);
    const r = await pagina.evaluate(() => ({
      cols: document.querySelectorAll("#sheetBody .wheel").length,
      opciones: document.querySelectorAll("#w-min .wop").length,
      centrada: (document.querySelector("#w-min .wop.on") || {}).textContent,
      snap: getComputedStyle(document.getElementById("w-min")).scrollSnapType
    }));
    if (r.cols !== 3) throw new Error("columnas=" + r.cols);
    if (r.opciones !== 60) throw new Error("minutos=" + r.opciones);
    if (!String(r.centrada).startsWith("45")) throw new Error("centrada=" + r.centrada);
    if (!r.snap.includes("mandatory")) throw new Error("sin encaje: " + r.snap);
  });

  await paso("duración: arrastrar la rueda cambia el valor", async () => {
    await pagina.evaluate(() => {
      const el = document.getElementById("w-min");
      el.scrollTop = 29 * 38;                     // la opción nº 30
      el.dispatchEvent(new Event("scroll"));
    });
    await pagina.waitForTimeout(220);
    const v = await pagina.evaluate(() =>
      (document.querySelector("#w-min .wop.on") || {}).textContent);
    if (!String(v).startsWith("30")) throw new Error("marca " + v);
  });

  await paso("duración: un formato mueve las ruedas y se guarda", async () => {
    await pagina.evaluate(() => CB.wheel.formato(2));      // fútbol sala: 2 x 20
    await pagina.waitForTimeout(700);
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    await pagina.waitForTimeout(350);
    const t = await pagina.evaluate(() =>
      document.querySelector('#sheetBody .btn[onclick*="duracion"]').innerText);
    if (!t.includes("2 × 20")) throw new Error("el formulario dice: " + t);
    await pagina.evaluate(() => {
      document.getElementById("eRiv").value = "CD Sala";
      document.querySelectorAll("#sheetFoot .btn")[1].click();
    });
    await pagina.waitForTimeout(300);
    const ev = await pagina.evaluate(() => DB.eventos.filter(e => e.rival === "CD Sala")[0]);
    if (!ev || ev.dur.min !== 20 || ev.dur.partes !== 2) throw new Error(JSON.stringify(ev && ev.dur));
    const rec = await pagina.evaluate(() => DB.durDef);
    if (!rec || rec.min !== 20) throw new Error("no se recordó para el siguiente");
  });

  await paso("un partido a cuartos numera y cuenta bien", async () => {
    await pagina.evaluate(() => {
      DB.match.dur = { partes: 4, min: 15, desc: 10, prorroga: 5 };
      DB.match.per = 1; DB.match.seg = 0; DB.match.br = null; DB.match.run = false;
      CB.shell.go("match"); CB.match.render();
    });
    await pagina.waitForTimeout(250);
    const r = await pagina.evaluate(() => ({
      reloj: document.getElementById("mClock").textContent,
      per: document.querySelector("#matchBody .board .per").innerText,
      pen: CB.models.penIndex(DB.match.dur),
      dur: document.querySelector("#matchBody .durlink").innerText
    }));
    if (r.reloj !== "15:00") throw new Error("el 2º cuarto arranca en " + r.reloj);
    if (!r.per.toLowerCase().includes("cuarto")) throw new Error("periodo: " + r.per);
    if (r.pen !== 6) throw new Error("los penaltis van en el índice " + r.pen);
    if (!r.dur.includes("4 × 15")) throw new Error("enlace: " + r.dur);
  });

  await paso("a cuartos, solo se decide al final del cuarto", async () => {
    /* Entre cuartos no debe preguntar nada: la decisión de prórroga o
       final llega al acabar el último, no al acabar el segundo. */
    await pagina.evaluate(() => CB.match.periodo());       // 2º -> 3er cuarto
    await pagina.waitForTimeout(200);
    if (await pagina.locator("#sheet").isVisible()) throw new Error("preguntó entre cuartos");
    if (await pagina.evaluate(() => DB.match.per) !== 2) throw new Error("no avanzó al 3er cuarto");
    const et = await pagina.evaluate(() =>
      document.querySelector('#matchBody button[onclick*="periodo"]').innerText);
    if (!et.includes("Fin del 3er cuarto")) throw new Error("el botón dice: " + et);

    await pagina.evaluate(() => { DB.match.br = null; CB.match.periodo(); });  // 3º -> 4º
    await pagina.waitForTimeout(200);
    if (await pagina.evaluate(() => DB.match.per) !== 3) throw new Error("no llegó al 4º cuarto");

    await pagina.evaluate(() => { DB.match.br = null; DB.match.gf = 3; DB.match.gc = 1; CB.match.periodo(); });
    await pagina.waitForTimeout(250);
    const t = (await pagina.locator("#sheetTitle").innerText()).toLowerCase();
    if (!t.includes("4º cuarto")) throw new Error("al acabar el último no ofrece nada: " + t);
    await pagina.evaluate(() => CB.shell.closeSheet());
  });

  // ---------------------------------------------------------------
  // Buscador de campos
  // ---------------------------------------------------------------
  const RESPUESTA = [
    {
      name: "Campo Municipal de Jinámar", lat: "28.0421", lon: "-15.4133",
      display_name: "Campo Municipal de Jinámar, Telde, Las Palmas, Canarias, España",
      address: { town: "Telde", province: "Las Palmas" }
    },
    {
      name: "Estadio de Gran Canaria", lat: "28.1000", lon: "-15.4566",
      display_name: "Estadio de Gran Canaria, Las Palmas de Gran Canaria, España",
      address: { city: "Las Palmas de Gran Canaria" }
    }
  ];

  await paso("campos: buscar y elegir guarda nombre y ubicación", async () => {
    await pagina.route("**/nominatim.openstreetmap.org/**", r =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESPUESTA) }));

    await pagina.evaluate(() => { CB.shell.go("agenda"); CB.agenda.editar(null, "Partido"); });
    await pagina.waitForTimeout(200);
    await pagina.evaluate(() => CB.agenda.lugar());
    await pagina.waitForTimeout(200);
    await pagina.fill("#lqBusca", "campo municipal jinamar");
    await pagina.evaluate(() => CB.lugares.buscar());
    await pagina.waitForTimeout(500);

    const filas = await pagina.evaluate(() =>
      [...document.querySelectorAll("#sheetBody .prow .nm")].map(n => n.textContent));
    if (filas.length !== 2) throw new Error("resultados: " + JSON.stringify(filas));
    if (!filas[0].includes("Jinámar")) throw new Error("el primero es: " + filas[0]);
    const atrib = await pagina.locator("#sheetBody").innerText();
    if (!atrib.includes("OpenStreetMap")) throw new Error("falta la atribución");

    await pagina.evaluate(() => document.querySelectorAll("#sheetBody .prow")[0].click());
    await pagina.waitForTimeout(300);
    const t = await pagina.evaluate(() =>
      document.querySelector('#sheetBody .btn[onclick*="agenda.lugar"]').innerText);
    if (!t.includes("Jinámar")) throw new Error("el formulario dice: " + t);

    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    await pagina.waitForTimeout(250);
    const ev = await pagina.evaluate(() => DB.eventos.filter(e => /Jinámar/.test(e.lugar))[0]);
    if (!ev) throw new Error("no se guardó el evento");
    if (ev.lat !== "28.0421" || ev.lon !== "-15.4133") throw new Error(JSON.stringify(ev));
    if (!ev.dir) throw new Error("sin dirección");
  });

  await paso("campos: sin conexión avisa y deja escribirlo a mano", async () => {
    await pagina.route("**/nominatim.openstreetmap.org/**", r => r.abort("failed"));
    await pagina.evaluate(() => { CB.shell.go("agenda"); CB.agenda.editar(null, "Partido"); });
    await pagina.waitForTimeout(200);
    await pagina.evaluate(() => CB.agenda.lugar());
    await pagina.waitForTimeout(200);
    await pagina.fill("#lqBusca", "campo que no existe");
    await pagina.evaluate(() => CB.lugares.buscar());
    await pagina.waitForTimeout(600);
    const t = await pagina.locator("#sheetBody").innerText();
    if (!t.toLowerCase().includes("sin conexión")) throw new Error("no avisa: " + t);
    /* Y aun así se puede guardar el nombre escrito. */
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    await pagina.waitForTimeout(250);
    const et = await pagina.evaluate(() =>
      document.querySelector('#sheetBody .btn[onclick*="agenda.lugar"]').innerText);
    if (!et.includes("campo que no existe")) throw new Error("no lo guardó: " + et);
    await pagina.evaluate(() => CB.shell.closeSheet());
  }, /ERR_FAILED|Failed to load resource/);

  await paso("campos: sin ubicación no se ofrece el mapa", async () => {
    const hay = await pagina.evaluate(() => {
      CB.agenda.editar(null, "Partido");
      return !!document.querySelector('#sheetBody .btn[onclick*="verMapa"]');
    });
    if (hay) throw new Error("ofrece mapa sin coordenadas");
    await pagina.evaluate(() => CB.shell.closeSheet());
  });

  await paso("campos: cómo llegar usa el puente nativo si existe", async () => {
    const r = await pagina.evaluate(() => {
      let visto = null;
      window.abrirMapa = (lat, lon, n) => { visto = [lat, lon, n]; };
      CB.lugares.abrir("28.0421", "-15.4133", "Campo Municipal de Jinámar");
      delete window.abrirMapa;
      return visto;
    });
    if (!r || r[0] !== "28.0421" || !r[2].includes("Jinámar")) throw new Error(JSON.stringify(r));
  });

  await pagina.unroute("**/nominatim.openstreetmap.org/**");

  // ---------------------------------------------------------------
  // Citación y recordatorios
  // ---------------------------------------------------------------
  await paso("citación: la imagen lleva los tres grupos y los datos", async () => {
    const r = await pagina.evaluate(() => {
      DB.club = "CD Ejemplo";
      DB.eventos.push({ id: "pc", tipo: "Partido", comp: "Liga", fecha: "2026-10-04",
        hora: "18:00", rival: "CD Prueba", cond: "Local", lugar: "Campo de Jinámar",
        notas: "", dur: CB.models.normDur(null), dir: "", lat: "", lon: "" });
      const ids = DB.jugadores.slice(0, 15).map(j => j.id);
      DB.match = { ev: "pc", conv: ids, campo: ids.slice(0, 11), banq: ids.slice(11),
        per: 0, seg: 0, run: false, started: false, gf: 0, gc: 0, log: [], goles: [],
        titulares: [], dur: CB.models.normDur(null), br: null,
        t: {}, st: {}, ta: {}, tr: {}, gol: {}, asi: {}, fal: {} };
      CB.store.save();
      const l = CB.citacion.listas();
      const cv = CB.citacion.dibujar();
      return {
        once: l.once.length, banq: l.banquillo.length, fuera: l.fuera.length,
        ordenado: l.once.map(p => p.orden).every((v, i, a) => i === 0 || a[i - 1] <= v),
        ancho: cv.width, alto: cv.height,
        texto: CB.citacion.texto()
      };
    });
    if (r.once !== 11 || r.banq !== 4) throw new Error(JSON.stringify(r));
    if (r.fuera !== (await pagina.evaluate(() => DB.jugadores.length)) - 15) {
      throw new Error("no convocados: " + r.fuera);
    }
    if (!r.ordenado) throw new Error("el once no sale ordenado por dorsal");
    if (r.ancho !== 1080 || r.alto < 600) throw new Error("imagen " + r.ancho + "x" + r.alto);
    for (const x of ["CD Prueba", "18:00", "Campo de Jinámar", "ONCE INICIAL", "BANQUILLO", "NO CONVOCADOS"]) {
      if (!r.texto.includes(x)) throw new Error("falta en el texto: " + x);
    }
  });

  await paso("citación: compartir usa el puente y manda imagen y texto", async () => {
    const r = await pagina.evaluate(async () => {
      let visto = null;
      window.compartirArchivoConTexto = (n, blob, t) => { visto = { n, tipo: blob.type, bytes: blob.size, t }; };
      CB.citacion.abrir();
      await new Promise(r => setTimeout(r, 400));
      CB.citacion.compartir();
      delete window.compartirArchivoConTexto;
      return visto;
    });
    if (!r) throw new Error("no llamó al puente");
    if (r.tipo !== "image/png" || r.bytes < 2000) throw new Error(JSON.stringify(r));
    if (!/^citacion-.*\.png$/.test(r.n)) throw new Error("nombre: " + r.n);
    if (!r.t.includes("ONCE INICIAL")) throw new Error("sin texto de pie");
    await pagina.evaluate(() => CB.shell.closeSheet());
  });

  await paso("avisos: se calculan víspera y mismo día, con lugar y rival", async () => {
    const r = await pagina.evaluate(() => {
      const d = new Date(Date.now() + 5 * 86400000);
      const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
        "-" + String(d.getDate()).padStart(2, "0");
      DB.eventos = [
        { id: "a1", tipo: "Partido", fecha: iso, hora: "18:00", rival: "CD Prueba",
          cond: "Visitante", lugar: "Campo de Jinámar", comp: "", notas: "",
          dur: CB.models.normDur(null), dir: "", lat: "", lon: "" },
        { id: "a2", tipo: "Entrenamiento", fecha: iso, hora: "19:30", rival: "",
          cond: "Local", lugar: "Anexo", comp: "", notas: "", dir: "", lat: "", lon: "" }
      ];
      DB.avisos = { on: true, vispera: true, visperaHora: 20, antes: 2 };
      CB.store.save();
      return CB.avisos.lista();
    });
    if (r.length !== 4) throw new Error("avisos: " + r.length);

    const partido = r.filter(a => /CD Prueba/.test(a.titulo));
    if (partido.length !== 2) throw new Error("el partido no genera dos avisos");
    const vis = partido.find(a => /mañana/.test(a.titulo));
    if (!vis) throw new Error("falta el de la víspera");
    for (const x of ["18:00", "Campo de Jinámar", "fuera", "CD Prueba"]) {
      if (!vis.texto.includes(x)) throw new Error("el texto no dice " + x + ": " + vis.texto);
    }
    const entreno = r.find(a => /Entrenamiento/.test(a.titulo));
    if (!entreno || !entreno.texto.includes("Anexo")) throw new Error("entreno: " + JSON.stringify(entreno));
    /* Ordenados y todos en el futuro. */
    if (r.some((a, i) => i && r[i - 1].cuando > a.cuando)) throw new Error("sin ordenar");
    if (r.some(a => a.cuando <= Date.now())) throw new Error("hay avisos en el pasado");
    /* Identificadores estables y distintos. */
    if (new Set(r.map(a => a.id)).size !== 4) throw new Error("identificadores repetidos");
  });

  await paso("avisos: apagados no programan nada y el pasado se ignora", async () => {
    const off = await pagina.evaluate(() => {
      DB.avisos = { on: false, vispera: true, visperaHora: 20, antes: 2 };
      return CB.avisos.lista().length;
    });
    if (off !== 0) throw new Error("apagados devuelven " + off);

    const viejo = await pagina.evaluate(() => {
      DB.avisos = { on: true, vispera: true, visperaHora: 20, antes: 2 };
      DB.eventos = [{ id: "v1", tipo: "Partido", fecha: "2020-01-01", hora: "18:00",
        rival: "Antiguo", cond: "Local", lugar: "X", comp: "", notas: "",
        dur: CB.models.normDur(null), dir: "", lat: "", lon: "" }];
      return CB.avisos.lista().length;
    });
    if (viejo !== 0) throw new Error("un partido de 2020 genera " + viejo + " avisos");
  });

  await paso("avisos: se reprograman al tocar el calendario", async () => {
    const r = await pagina.evaluate(async () => {
      const envios = [];
      window.avisosNativos = {
        programar: l => envios.push(l.length),
        permitidos: () => true,
        pedirPermiso: () => {}
      };
      const d = new Date(Date.now() + 9 * 86400000);
      const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
        "-" + String(d.getDate()).padStart(2, "0");
      DB.eventos = [];
      CB.shell.go("agenda");
      CB.agenda.editar(null, "Entrenamiento");
      await new Promise(r => setTimeout(r, 250));
      document.getElementById("eFec").value = iso;
      document.getElementById("eHor").value = "19:00";
      document.querySelectorAll("#sheetFoot .btn")[1].click();
      await new Promise(r => setTimeout(r, 300));
      delete window.avisosNativos;
      return envios;
    });
    if (!r.length) throw new Error("no se reprogramó al guardar");
    if (r[r.length - 1] !== 2) throw new Error("avisos enviados: " + JSON.stringify(r));
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
