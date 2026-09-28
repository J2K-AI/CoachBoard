#!/usr/bin/env node
/**
 * Lanza todas las pruebas.
 *
 * Se ejecutan dos veces sobre orígenes distintos: los archivos de assets
 * (lo que se edita y lo que empaqueta el APK) y CoachBoard.html (el
 * archivo único que se usa en el PC). Así ninguno de los dos se queda
 * atrás sin que nadie se entere.
 */
import { chromium } from "playwright";
import { servir } from "./server.mjs";
import suiteApp from "./app.test.mjs";
import suiteBoard from "./board.test.mjs";

const ASSETS = "CoachBoard-Android/CoachBoard/app/src/main/assets";

const inicio = Date.now();
let fallos = 0;

const servidorAssets = await servir(ASSETS);
const servidorUnico = await servir(".", "CoachBoard.html");

/* En entornos sin descarga de navegadores se puede apuntar a un
   Chromium ya instalado:  CB_CHROMIUM=/ruta/a/chrome npm test  */
const navegador = await chromium.launch(
  process.env.CB_CHROMIUM ? { executablePath: process.env.CB_CHROMIUM } : {}
);

try {
  fallos += await suiteApp(navegador, servidorAssets.url, "aplicación · assets");
  fallos += await suiteBoard(navegador, servidorAssets.url, "pizarra · assets");
  fallos += await suiteApp(navegador, servidorUnico.url, "aplicación · archivo único");
} finally {
  await navegador.close();
  await servidorAssets.cerrar();
  await servidorUnico.cerrar();
}

const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
console.log(`\n${"─".repeat(46)}`);
if (fallos) {
  console.log(`${fallos} prueba(s) fallida(s) en ${segundos}s`);
  process.exit(1);
}
console.log(`Todo correcto en ${segundos}s`);
