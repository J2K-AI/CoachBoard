#!/usr/bin/env node
/**
 * Comprobaciones estáticas rápidas, antes de arrancar ningún navegador:
 *
 *   1. Sintaxis de cada archivo JavaScript.
 *   2. Que index.html no enlace archivos que no existen.
 *   3. Que toda llamada CB.<módulo>.<función>() apunte a algo exportado.
 *   4. Que los identificadores usados con getElementById existan en el
 *      HTML o los genere la propia aplicación.
 *
 * Son errores baratos de cometer y caros de descubrir en el móvil.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(RAIZ, "CoachBoard-Android", "CoachBoard", "app", "src", "main", "assets");

let problemas = 0;
const mal = m => { console.error("  ✗ " + m); problemas++; };
const bien = m => console.log("  ✓ " + m);

// ------------------------------------------------------------------
// 1. Sintaxis
// ------------------------------------------------------------------
console.log("\nSintaxis de los archivos JavaScript");
const archivosJs = [];
(function recorrer(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) recorrer(p);
    else if (n.endsWith(".js")) archivosJs.push(p);
  }
})(join(ASSETS, "js"));

for (const f of archivosJs) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    mal(`${relative(RAIZ, f)}\n${e.stderr ? e.stderr.toString().trim() : e.message}`);
  }
}
if (!problemas) bien(`${archivosJs.length} archivos sin errores de sintaxis`);

// ------------------------------------------------------------------
// 2. Enlaces del HTML
// ------------------------------------------------------------------
console.log("\nArchivos enlazados desde index.html");
const html = readFileSync(join(ASSETS, "index.html"), "utf8");
const enlazados = [
  ...[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]),
  ...[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
];
const perdidos = enlazados.filter(x => !existsSync(join(ASSETS, x)));
if (perdidos.length) mal("no existen: " + perdidos.join(", "));
else bien(`${enlazados.length} archivos enlazados, todos presentes`);

// ------------------------------------------------------------------
// 3. Referencias CB.*
// ------------------------------------------------------------------
console.log("\nReferencias entre módulos");
const exportado = {};
let todo = html;
for (const rel of enlazados.filter(x => x.endsWith(".js"))) {
  const s = readFileSync(join(ASSETS, rel), "utf8");
  todo += "\n" + s;
  for (const m of s.matchAll(/window\.CB\.(\w+)\s*=\s*\{(.*?)\n?\s*\};/gs)) {
    exportado[m[1]] ??= new Set();
    for (const k of m[2].matchAll(/(\w+)\s*:/g)) exportado[m[1]].add(k[1]);
  }
}
const rotas = [];
for (const m of todo.matchAll(/\bCB\.(\w+)\.(\w+)\s*\(/g)) {
  const [, ns, fn] = m;
  if (!exportado[ns] || !exportado[ns].has(fn)) rotas.push(`CB.${ns}.${fn}`);
}
const unicas = [...new Set(rotas)];
if (unicas.length) mal("no están exportadas: " + unicas.join(", "));
else bien(`${Object.keys(exportado).length} módulos, todas las llamadas resuelven`);

// ------------------------------------------------------------------
// 4. Identificadores del DOM
// ------------------------------------------------------------------
console.log("\nIdentificadores del DOM");
// Los que la aplicación genera al vuelo dentro de otros contenedores.
const GENERADOS = new Set([
  "mClock", "mPanel", "mSel", "drillUndo", "attSel",
  "cfgClub", "cfgImp", "pDor", "pPos", "pNom", "pPie", "pEst", "pNac", "pTel", "pNot",
  "eTipo", "eFec", "eHor", "eRiv", "eCon", "eCom", "eLug", "eNot",
  "dNom", "dCat", "dMin", "dJug", "dDesc", "drillTxt", "tacNom", "tfD", "tfN"
]);
const enHtml = new Set([...html.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
const usados = new Set();
for (const rel of enlazados.filter(x => x.endsWith(".js"))) {
  const s = readFileSync(join(ASSETS, rel), "utf8");
  for (const m of s.matchAll(/(?:U\.\$|getElementById)\("([\w-]+)"\)/g)) usados.add(m[1]);
  for (const m of s.matchAll(/U\.(?:set|txt|show)\("([\w-]+)"/g)) usados.add(m[1]);
}
const sinDefinir = [...usados].filter(
  i => !enHtml.has(i) && !GENERADOS.has(i) && !i.includes("-")
);
if (sinDefinir.length) mal("no existen en index.html ni están declarados como generados: " + sinDefinir.join(", "));
else bien(`${usados.size} identificadores comprobados`);

// ------------------------------------------------------------------
console.log("");
if (problemas) {
  console.error(`${problemas} problema(s) encontrados.`);
  process.exit(1);
}
console.log("Comprobaciones estáticas superadas.");
