/**
 * Servidor estático mínimo para las pruebas.
 *
 * La aplicación se sirve por http en lugar de abrirla como archivo para
 * que el navegador le dé un origen estable, igual que hace el contenedor
 * Android: así localStorage se comporta como en el dispositivo.
 */
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname, resolve, sep } from "node:path";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

/**
 * @param {string} raiz       carpeta a servir
 * @param {string} indice     archivo que responde a "/"
 * @returns {Promise<{url: string, cerrar: () => Promise<void>}>}
 */
export function servir(raiz, indice = "index.html") {
  const base = resolve(raiz);

  const servidor = http.createServer((req, res) => {
    let ruta = decodeURIComponent(req.url.split("?")[0]);
    if (ruta === "/") ruta = "/" + indice;

    const archivo = join(base, ruta);
    // Nadie se sale de la carpeta servida.
    if (!(archivo === base || archivo.startsWith(base + sep)) ||
        !existsSync(archivo) || !statSync(archivo).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("no encontrado");
      return;
    }

    res.writeHead(200, {
      "Content-Type": TIPOS[extname(archivo)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(archivo).pipe(res);
  });

  return new Promise(ok => {
    servidor.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address();
      ok({
        url: `http://127.0.0.1:${port}/`,
        cerrar: () => new Promise(fin => servidor.close(fin))
      });
    });
  });
}
