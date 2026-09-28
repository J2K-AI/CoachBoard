# CoachBoard

Aplicación Android para entrenadores de fútbol: plantilla, calendario,
asistencia, partido en directo, diseñador de entrenamientos y pizarra táctica.
Funciona **entera sin conexión** — la app ni siquiera declara el permiso de
internet — y genera el acta del partido y la ficha de cada jugador en PDF.

---

## Abrir y compilar

1. Android Studio → **Open** → esta carpeta (la que contiene `settings.gradle.kts`).
2. Espera al primer *Gradle sync*. Si propone actualizar el Android Gradle Plugin
   o Kotlin, acepta: no hay nada atado a una versión concreta.
3. Si avisa de que falta el *Gradle wrapper*, deja que lo genere, o ejecuta
   `gradle wrapper` en la raíz.
4. Conecta el móvil con depuración USB y pulsa **Run ▶**.

### Generar el APK

- **Build → Build Bundle(s) / APK(s) → Build APK(s)**
- Sale en `app/build/outputs/apk/debug/app-debug.apk`.
- Para una versión firmada: **Build → Generate Signed App Bundle / APK**.

---

## Cómo está organizado

CoachBoard es una aplicación web empaquetada en un contenedor nativo. La
interfaz y la lógica viven en `app/src/main/assets`; Kotlin aporta lo que un
WebView no trae de serie (impresión, descargas, diálogos del sistema).

```
app/src/main/
├── AndroidManifest.xml
├── java/com/entrenador/pro/
│   ├── MainActivity.kt          ciclo de vida y montaje del contenedor
│   ├── web/
│   │   ├── WebAppHost.kt        configuración del WebView y del asset loader
│   │   ├── AppChromeClient.kt   confirm(), prompt() y selector de archivos
│   │   ├── JsBridge.kt          interfaz `AndroidApp` que ve la página
│   │   └── BridgeScript.kt      JavaScript que se inyecta al cargar
│   └── io/
│       ├── FileSaver.kt         guardar en Descargas y compartir
│       └── PagePrinter.kt       impresión A4 → PDF
├── assets/
│   ├── index.html               armazón: barras, secciones y lienzos
│   ├── css/
│   │   ├── tokens.css           paleta e identidad visual (único sitio)
│   │   ├── base.css             reset, tipografía y armazón
│   │   ├── components.css       tarjetas, botones, listas, hojas, navegación
│   │   ├── screens.css          estilos propios de cada pantalla
│   │   └── print.css            maqueta A4 del acta y de la ficha
│   └── js/
│       ├── core/
│       │   ├── util.js          texto, fechas, DOM, iconos, descargas
│       │   ├── store.js         persistencia (nadie más toca localStorage)
│       │   ├── models.js        constantes de dominio y fábricas
│       │   ├── pitch.js         dibujo del campo y de las piezas
│       │   ├── stats.js         cálculo de estadísticas
│       │   └── scene.js         motor de la pizarra (ver abajo)
│       ├── ui/shell.js          navegación, hojas modales
│       ├── features/            una pantalla por archivo
│       └── app.js               arranque y conexión entre pantallas
└── res/                         tema, icono y reglas de copia de seguridad
```

Los archivos JavaScript son *scripts clásicos* cargados en orden, cada uno
envuelto en su propia función y publicando su API en `window.CB.<módulo>`. Se
eligió así en lugar de módulos ES por compatibilidad con WebViews antiguos y
porque los manejadores `onclick` necesitan funciones globales.

---

## Rotación de elementos en el diseñador

`core/scene.js` es el motor de la pizarra. Cada pieza guarda:

```js
{ id, tipo, x, y, x2, y2, rot, scale, color, txt, estilo }
```

`x` e `y` van normalizados de 0 a 1, así que el dibujo es independiente del
tamaño de la pantalla y un ejercicio guardado se ve igual en móvil y en tablet.

**La regla de diseño**: cada gesto entra en un único modo y ese modo escribe en
un único grupo de propiedades.

| Dónde baja el dedo | Modo | Qué modifica |
|---|---|---|
| Tirador de giro | `rotate` | solo `rot` |
| Cuerpo de la pieza | `move` | solo `x`, `y` |
| Extremo de flecha o zona | `p1` / `p2` | solo ese extremo |
| Dos dedos | zoom | solo la vista, nunca las piezas |

Por eso girar no puede desplazar el elemento: la rama de rotación no tiene
acceso de escritura a la posición. Además:

- El tirador se comprueba **antes** que el cuerpo, y tiene un radio de toque
  mayor que el dibujado.
- Hay un umbral de 4 px: hasta que el dedo no recorre esa distancia no empieza
  ningún arrastre, de modo que un toque para seleccionar nunca empuja la pieza.
- La barra contextual se coloca fuera del círculo que puede ocupar el tirador,
  para que nunca se solapen.
- Al girar libremente hay imantado cada 15° con 4° de tolerancia.

La rotación se conserva al mover, al duplicar, al guardar y al exportar a PNG.

---

## Dónde se guardan los datos

En el almacenamiento del WebView, dentro de los datos privados de la app, bajo
la clave `coachboard.v1`. Al abrir por primera vez se migran automáticamente los
datos de versiones anteriores (`entrenadorpro.v1`).

Se conservan al cerrar y al actualizar el APK; se pierden si desinstalas la
aplicación o borras sus datos. **Ajustes → Descargar copia de seguridad**
genera un `.json` en la carpeta Descargas.

---

## Notas de mantenimiento

- Los colores se cambian en un solo sitio: `css/tokens.css`. `res/values/colors.xml`
  replica los tres principales para que el tema nativo no parpadee al abrir.
- Añadir una pieza nueva a la pizarra: una entrada en `TOOLS` (`models.js`), un
  `case` en `drawItem` (`pitch.js`) y, si hace falta, un radio en `itemRadius`.
  La rotación, el duplicado y el historial funcionan sin tocar nada más.
- Añadir una pantalla: una entrada en `VIEWS` (`ui/shell.js`), una `<section>` en
  `index.html` y un archivo en `features/`.
