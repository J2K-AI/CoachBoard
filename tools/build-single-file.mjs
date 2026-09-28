#!/usr/bin/env node
/**
 * Genera CoachBoard.html: la aplicación entera en un solo archivo.
 *
 * Toma el index.html del proyecto Android y sustituye los <link> y los
 * <script src> por el contenido de cada archivo, manteniendo el orden de
 * carga y un comentario con el origen de cada bloque.
 *
 *   node tools/build-single-file.mjs            genera CoachBoard.html
 *   node tools/build-single-file.mjs --check    comprueba que está al día
 *
 * El modo --check es el que usa la integración continua: si alguien toca
 * los archivos de assets y no regenera el HTML, el repositorio quedaría
 * con dos versiones distintas de la misma aplicación.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(RAIZ, "CoachBoard-Android", "CoachBoard", "app", "src", "main", "assets");
const SALIDA = join(RAIZ, "CoachBoard.html");

function construir() {
  let html = readFileSync(join(ASSETS, "index.html"), "utf8");

  const hojas = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

  if (!hojas.length || !scripts.length) {
    throw new Error("index.html no enlaza hojas de estilo o scripts: ¿ha cambiado su estructura?");
  }

  // --- CSS ---
  const css = hojas.map(h => `/* ===== ${h} ===== */\n${leer(h)}`);
  const bloqueCss = "<style>\n" + css.join("\n") + "\n</style>";
  const primerLink = html.indexOf('<link rel="stylesheet"');
  const ultimoLink = html.lastIndexOf('<link rel="stylesheet"');
  const finLink = html.indexOf(">", ultimoLink) + 1;
  html = html.slice(0, primerLink) + bloqueCss + html.slice(finLink);

  // --- JS ---
  const js = scripts.map(s => {
    const contenido = leer(s);
    if (contenido.includes("</script")) {
      throw new Error(`${s} contiene </script y rompería el archivo único`);
    }
    return `<script>\n/* ===== ${s} ===== */\n${contenido}\n</script>`;
  });
  const bloqueJs = js.join("\n");
  const primerScript = html.indexOf('<script src="');
  const ultimoScript = html.lastIndexOf('<script src="');
  const finScript = html.indexOf("</script>", ultimoScript) + "</script>".length;
  html = html.slice(0, primerScript) + bloqueJs + html.slice(finScript);

  // --- nota para quien abra el archivo ---
  html = html.replace(
    "<title>CoachBoard</title>",
    "<title>CoachBoard</title>\n" +
    "<!-- Archivo único generado desde el proyecto Android.\n" +
    "     Para que se guarden los datos, ábrelo con CoachBoard.ps1\n" +
    "     (Chrome y Edge no permiten almacenamiento en file://). -->"
  );

  return html;
}

function leer(rel) {
  const ruta = join(ASSETS, rel);
  if (!existsSync(ruta)) throw new Error(`falta ${rel}`);
  return readFileSync(ruta, "utf8");
}

const comprobar = process.argv.includes("--check");
const generado = construir();

if (comprobar) {
  const actual = existsSync(SALIDA) ? readFileSync(SALIDA, "utf8") : "";
  if (actual !== generado) {
    console.error("CoachBoard.html NO está al día con los archivos de assets.");
    console.error("Ejecuta:  npm run build:single   y añade el resultado al commit.");
    console.error(`(esperado ${generado.length} bytes, encontrado ${actual.length})`);
    process.exit(1);
  }
  console.log("CoachBoard.html está al día.");
} else {
  writeFileSync(SALIDA, generado, "utf8");
  console.log(`Escrito CoachBoard.html (${Math.round(generado.length / 1024)} KB, ` +
              `${hojasContadas(generado)} estilos y ${scriptsContados(generado)} scripts incrustados)`);
}

function hojasContadas(h) { return (h.match(/\/\* ===== css\//g) || []).length; }
function scriptsContados(h) { return (h.match(/\/\* ===== js\//g) || []).length; }
