/**
 * Andamiaje común de las pruebas: abre una página, recoge los errores de
 * JavaScript y da una función `paso` que informa en una línea por prueba.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const CAPTURAS = "tests/capturas";

export async function abrirPagina(browser, url, opciones = {}) {
  const contexto = await browser.newContext({
    viewport: opciones.viewport || { width: 412, height: 915 },
    deviceScaleFactor: opciones.escala || 1,
    hasTouch: opciones.tactil !== false
  });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on("pageerror", e => errores.push("PAGEERROR: " + e.message));
  pagina.on("console", m => {
    if (m.type() === "error") errores.push("CONSOLE: " + m.text());
  });
  await pagina.goto(url);
  await pagina.waitForTimeout(450);
  return { contexto, pagina, errores };
}

export function crearRunner(titulo, errores, pagina) {
  let fallos = 0;
  console.log(`\n── ${titulo} ──`);

  return {
    async paso(nombre, fn) {
      const antes = errores.length;
      try {
        await fn();
      } catch (e) {
        errores.push(`PASO "${nombre}": ${e.message}`);
      }
      await pagina.waitForTimeout(120);
      const nuevos = errores.slice(antes);
      if (nuevos.length) {
        fallos++;
        console.log(`  FALLA  ${nombre}`);
        nuevos.forEach(n => console.log(`         ${n}`));
        await capturar(pagina, nombre);
      } else {
        console.log(`  ok     ${nombre}`);
      }
    },
    get fallos() { return fallos; }
  };
}

async function capturar(pagina, nombre) {
  try {
    mkdirSync(CAPTURAS, { recursive: true });
    const limpio = nombre.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
    await pagina.screenshot({ path: join(CAPTURAS, `fallo-${limpio}.png`), fullPage: true });
  } catch { /* una captura fallida no debe tapar el error real */ }
}
