/**
 * Diseñador de entrenamientos: colocar, mover, girar, duplicar, borrar,
 * deshacer y zoom.
 *
 * Lo que de verdad protege este archivo es la regla del motor de escena:
 * girar una pieza no puede desplazarla, y moverla no puede cambiar su
 * ángulo. Son dos ramas de código separadas y aquí se comprueba que
 * siguen estándolo.
 */
import { abrirPagina, crearRunner } from "./harness.mjs";

export default async function (browser, url, etiqueta = "pizarra") {
  const { contexto, pagina, errores } = await abrirPagina(browser, url);
  const runner = crearRunner(etiqueta, errores, pagina);
  const paso = runner.paso;

  await pagina.evaluate(() => CB.shell.go("board"));
  await pagina.waitForTimeout(400);

  const caja = await pagina.locator("#cDrill").boundingBox();
  const enCampo = (nx, ny) => ({ x: caja.x + caja.width * nx, y: caja.y + caja.height * ny });
  const piezas = () => pagina.evaluate(() => JSON.parse(JSON.stringify(CB.drills.escena().getItems())));
  const seleccion = () => pagina.evaluate(() => (CB.drills.escena().selected() || {}).id || null);
  const herramienta = t => pagina.evaluate(x => {
    document.querySelectorAll("#drillTools .tool").forEach(b => { if (b.dataset.t === x) b.click(); });
  }, t);

  await paso("el lienzo tiene tamaño", async () => {
    if (!caja || caja.width < 100) throw new Error("lienzo sin dimensiones");
  });

  await paso("colocar un cono tocando el campo", async () => {
    await herramienta("Cono");
    const p = enCampo(0.4, 0.5);
    await pagina.mouse.click(p.x, p.y);
    await pagina.waitForTimeout(150);
    const it = await piezas();
    if (it.length !== 1 || it[0].tipo !== "Cono") throw new Error(JSON.stringify(it));
    if (it[0].rot !== 0) throw new Error("debería nacer sin rotación");
  });

  await paso("seleccionar muestra la barra contextual", async () => {
    await herramienta("Mover");
    const p = enCampo(0.4, 0.5);
    await pagina.mouse.click(p.x, p.y);
    await pagina.waitForTimeout(180);
    if (!await seleccion()) throw new Error("no se seleccionó");
    if (!await pagina.locator("#drillCtx").isVisible()) throw new Error("la barra no apareció");
  });

  await paso("un toque no desplaza la pieza", async () => {
    const antes = (await piezas())[0];
    const p = enCampo(0.4, 0.5);
    await pagina.mouse.move(p.x, p.y);
    await pagina.mouse.down();
    await pagina.mouse.move(p.x + 2, p.y + 1);   // por debajo del umbral
    await pagina.mouse.up();
    await pagina.waitForTimeout(140);
    const d = (await piezas())[0];
    if (Math.abs(d.x - antes.x) > 1e-9 || Math.abs(d.y - antes.y) > 1e-9) {
      throw new Error("la pieza se movió con un simple toque");
    }
  });

  await paso("botón girar: +15° y la posición intacta", async () => {
    const antes = (await piezas())[0];
    await pagina.locator("#ctxRotR").click();
    await pagina.waitForTimeout(140);
    const d = (await piezas())[0];
    if (d.rot !== 15) throw new Error("rot=" + d.rot);
    if (d.x !== antes.x || d.y !== antes.y) throw new Error("la rotación movió la pieza");
  });

  await paso("botón girar a la izquierda vuelve a 0°", async () => {
    await pagina.locator("#ctxRotL").click();
    await pagina.waitForTimeout(140);
    if ((await piezas())[0].rot !== 0) throw new Error("no volvió a cero");
  });

  await paso("tirador de giro: gira libremente y NO mueve", async () => {
    const antes = (await piezas())[0];
    const tirador = await pagina.evaluate(() => {
      const sc = CB.drills.escena(), P = CB.pitch;
      const it = sc.selected();
      const c = document.getElementById("cDrill");
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const W = c.width / d, H = c.height / d;
      const h = P.handlePos(it, W, H, P.baseSize(W));
      const r = c.getBoundingClientRect();
      return { x: r.left + h.x, y: r.top + h.y };
    });
    await pagina.mouse.move(tirador.x, tirador.y);
    await pagina.mouse.down();
    const centro = enCampo(antes.x, antes.y);
    await pagina.mouse.move(centro.x + 90, centro.y, { steps: 12 });   // a la derecha: ~90°
    await pagina.mouse.up();
    await pagina.waitForTimeout(160);
    const d = (await piezas())[0];
    if (Math.abs(d.x - antes.x) > 1e-9 || Math.abs(d.y - antes.y) > 1e-9) {
      throw new Error(`girar desplazó la pieza: ${antes.x} -> ${d.x}`);
    }
    if (d.rot < 80 || d.rot > 100) throw new Error(`rot=${d.rot} (esperaba ~90)`);
  });

  await paso("mover conserva la rotación", async () => {
    const antes = (await piezas())[0];
    const desde = enCampo(antes.x, antes.y);
    await pagina.mouse.move(desde.x, desde.y);
    await pagina.mouse.down();
    await pagina.mouse.move(desde.x + 60, desde.y + 40, { steps: 10 });
    await pagina.mouse.up();
    await pagina.waitForTimeout(160);
    const d = (await piezas())[0];
    if (d.rot !== antes.rot) throw new Error(`la rotación cambió: ${antes.rot} -> ${d.rot}`);
    if (Math.abs(d.x - antes.x) < 0.02) throw new Error("no se movió");
  });

  await paso("duplicar copia tipo y ángulo con otro identificador", async () => {
    const antes = await piezas();
    await pagina.locator("#ctxDup").click();
    await pagina.waitForTimeout(160);
    const d = await piezas();
    if (d.length !== antes.length + 1) throw new Error("n=" + d.length);
    const copia = d[d.length - 1];
    if (copia.rot !== antes[0].rot || copia.tipo !== antes[0].tipo) throw new Error("la copia no coincide");
    if (copia.id === antes[0].id) throw new Error("la copia comparte identificador");
  });

  await paso("eliminar quita solo la seleccionada", async () => {
    await pagina.locator("#ctxDel").click();
    await pagina.waitForTimeout(160);
    if ((await piezas()).length !== 1) throw new Error("borró de más o de menos");
  });

  await paso("deshacer recupera lo borrado", async () => {
    await pagina.evaluate(() => CB.drills.undo());
    await pagina.waitForTimeout(160);
    if ((await piezas()).length !== 2) throw new Error("no recuperó");
  });

  await paso("flecha de conducción: la punta sigue al dedo", async () => {
    await herramienta("Conduccion");
    const a = enCampo(0.2, 0.2), b = enCampo(0.6, 0.3);
    await pagina.mouse.move(a.x, a.y);
    await pagina.mouse.down();
    await pagina.mouse.move(b.x, b.y, { steps: 8 });
    await pagina.mouse.up();
    await pagina.waitForTimeout(160);
    const f = (await piezas()).slice(-1)[0];
    if (f.tipo !== "Flecha" || f.estilo !== "Conduccion") throw new Error(JSON.stringify(f));
    if (Math.abs(f.x2 - 0.6) > 0.05) throw new Error("x2=" + f.x2);
  });

  await paso("zoom con los botones y vuelta al ajuste", async () => {
    const k0 = await pagina.evaluate(() => CB.drills.escena().state.view.k);
    await pagina.evaluate(() => CB.drills.zoom(1.35));
    const k1 = await pagina.evaluate(() => CB.drills.escena().state.view.k);
    if (k1 <= k0) throw new Error(`no amplió: ${k0} -> ${k1}`);
    await pagina.evaluate(() => CB.drills.zoom(0.1));
    const k2 = await pagina.evaluate(() => CB.drills.escena().state.view.k);
    if (k2 !== 1) throw new Error("no vuelve al ajuste: " + k2);
  });

  await paso("guardar el ejercicio con sus datos", async () => {
    await pagina.evaluate(() => { CB.drills.escena().getItems()[0].rot = 45; });
    await pagina.evaluate(() => CB.drills.guardar());
    await pagina.fill("#dNom", "Rondo 4v2");
    await pagina.selectOption("#dCat", "Posesión");
    await pagina.fill("#dMin", "12");
    await pagina.fill("#dJug", "6");
    await pagina.fill("#dDesc", "Dos toques");
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    await pagina.waitForTimeout(220);
    const e = await pagina.evaluate(() => DB.ejercicios[0]);
    if (!e || e.nombre !== "Rondo 4v2" || e.categoria !== "Posesión" ||
        e.min !== "12" || e.jugadores !== "6" || e.desc !== "Dos toques") {
      throw new Error(JSON.stringify(e));
    }
    if (!e.items.some(i => i.rot === 45)) throw new Error("se perdió la rotación al guardar");
  });

  await paso("recargar el ejercicio restaura piezas y rotación", async () => {
    await pagina.evaluate(() => CB.drills.nuevo());
    if ((await piezas()).length !== 0) throw new Error("no se vació");
    await pagina.evaluate(() => CB.drills.cargar(DB.ejercicios[0].id));
    await pagina.waitForTimeout(220);
    const d = await piezas();
    if (d.length < 3) throw new Error("no se recuperó: " + d.length);
    if (!d.some(i => i.rot === 45)) throw new Error("se perdió la rotación al cargar");
  });

  await paso("la media luna acaba justo en la línea del área", async () => {
    /* El fallo: el arco se trazaba con un ángulo fijo de 53°, que solo
       vale si el lienzo tiene la proporción de un campo real. En
       cualquier otra pantalla se metía dentro del área. */
    const casos = await pagina.evaluate(() => {
      const tam = [[1184, 541], [412, 260], [900, 300], [640, 640], [1600, 400], [360, 800]];
      return tam.map(([w, h]) => {
        const G = CB.pitch.pitchGeom(w, h);
        return { w, h, error: G.medio > 0 ? +(G.finX - G.aW).toFixed(6) : null,
                 grados: +(G.medio * 180 / Math.PI).toFixed(1) };
      });
    });
    const malos = casos.filter(c => c.error === null || Math.abs(c.error) > 0.001);
    if (malos.length) throw new Error("no encaja en: " + JSON.stringify(malos));
  });

  await paso("la media luna no pinta nada dentro del área", async () => {
    /* Comprobación sobre los píxeles de verdad: en la franja de la
       media luna, entre el área pequeña y la línea del área grande, no
       puede haber ni un píxel de cal. */
    const dentro = await pagina.evaluate(() => {
      const c = document.createElement("canvas");
      const salidas = [];
      [[1184, 541], [900, 300], [360, 800]].forEach(([w, h]) => {
        c.width = w; c.height = h;
        const g = c.getContext("2d");
        CB.pitch.drawPitch(g, w, h, "Completo");
        const m = Math.max(7, w * 0.012), pw = w - 2 * m, ph = h - 2 * m;
        const G = CB.pitch.pitchGeom(pw, ph);
        const cy = Math.round(m + ph / 2);
        const x0 = Math.round(m + G.gW + 4);          // tras el área pequeña
        const x1 = Math.round(m + G.aW - 3);          // antes de la línea del área
        const y0 = Math.round(cy - G.ry * 0.95), y1 = Math.round(cy + G.ry * 0.95);
        if (x1 <= x0) return;
        const ancho = x1 - x0;
        const d = g.getImageData(x0, y0, ancho, y1 - y0).data;
        /* El punto de penalti cae en esta franja y es cal legítima. */
        const spx = m + G.sp, rPunto = Math.max(2, w / 300) + 3;
        let cal = 0;
        for (let i = 0; i < d.length; i += 4) {
          const p = i / 4, x = x0 + (p % ancho), y = y0 + Math.floor(p / ancho);
          if (Math.hypot(x - spx, y - cy) <= rPunto) continue;
          if (d[i] > 190 && d[i + 1] > 200 && d[i + 2] > 190) cal++;
        }
        if (cal) salidas.push({ w, h, pixeles: cal });
      });
      return salidas;
    });
    if (dentro.length) throw new Error("cal dentro del área: " + JSON.stringify(dentro));
  });

  await paso("exportar la pizarra produce un PNG", async () => {
    const ok = await pagina.evaluate(() => new Promise(res => {
      const c = document.createElement("canvas");
      c.width = 800; c.height = 520;
      CB.pitch.drawScene(c.getContext("2d"), 800, 520, "Completo", CB.drills.escena().getItems(), null);
      c.toBlob(b => res(!!b && b.size > 1000), "image/png");
    }));
    if (!ok) throw new Error("el PNG salió vacío");
  });

  // --- tácticas ---
  await paso("tácticas: arrastrar una ficha", async () => {
    await pagina.evaluate(() => CB.shell.go("tac"));
    await pagina.waitForTimeout(450);
    const t = await pagina.locator("#cTac").boundingBox();
    const f0 = await pagina.evaluate(() => ({ x: DB.tac[5].x, y: DB.tac[5].y }));
    const desde = { x: t.x + t.width * f0.x, y: t.y + t.height * f0.y };
    await pagina.mouse.move(desde.x, desde.y);
    await pagina.mouse.down();
    await pagina.mouse.move(desde.x + 50, desde.y + 30, { steps: 8 });
    await pagina.mouse.up();
    await pagina.waitForTimeout(160);
    const f1 = await pagina.evaluate(() => DB.tac[5].x);
    if (Math.abs(f1 - f0.x) < 0.01) throw new Error("la ficha no se movió");
  });

  await paso("tácticas: aplicar una formación", async () => {
    await pagina.selectOption("#tacForm1", "4-3-3");
    await pagina.evaluate(() => CB.tactics.aplicar("A"));
    await pagina.waitForTimeout(160);
    const x = await pagina.evaluate(() => DB.tac.filter(f => f.eq === "A")[9].x);
    if (Math.abs(x - 0.46) > 0.001) throw new Error("x=" + x);
  });

  await paso("tácticas: guardar y recargar la pizarra", async () => {
    await pagina.evaluate(() => CB.tactics.guardar());
    await pagina.fill("#tacNom", "Plan A");
    await pagina.evaluate(() => document.querySelectorAll("#sheetFoot .btn")[1].click());
    await pagina.waitForTimeout(220);
    if (await pagina.evaluate(() => DB.tacticas.length) !== 1) throw new Error("no se guardó");
    await pagina.evaluate(() => CB.tactics.cargar(DB.tacticas[0].id));
    await pagina.waitForTimeout(160);
    if (await pagina.evaluate(() => DB.tac.length) !== 22) throw new Error("no se recuperaron las 22 fichas");
  });

  await contexto.close();
  return runner.contarFallos();
}
