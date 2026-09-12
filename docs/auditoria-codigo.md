# Auditoría de código, arquitectura y sistema de diseño

**Qué es esto.** Una revisión doble —código y sistema de diseño— del prototipo web que
hoy está publicado en Pages. **No propone cambiar ni una funcionalidad.** La carta y la
foto están aprobadas y se quedan exactamente como están; el vídeo sigue en construcción y
aquí solo se mira su código, no su alcance. Todo lo que se propone es reordenar lo que ya
hay de manera que el comportamiento observable sea idéntico.

**Cómo leerla.** Cada hallazgo trae la prueba (archivo y línea), por qué importa —no en
abstracto, sino qué se rompe el día que se rompa— y el cambio concreto. Al final hay un
plan por fases, y una lista de lo que **no** conviene hacer.

**Qué se auditó.** `web/` entero (1.218 líneas de `main.js`, 962 de `app.css`, 539 de
`index.html`, 680 de `certificate.js`, los cuatro módulos de apoyo, los tres catálogos de
idioma y las 1.173 líneas de prueba), más una pasada por `app/` (la capa Flutter) y por
los dos workflows.

---

## Veredicto en una página

**Lo que está bien y hay que proteger.** No es cortesía: son decisiones que la mayoría de
los proyectos de este tamaño no tienen y que condicionan lo que se puede proponer.

- **Una sola fuente de verdad del shader.** `web/js/compositor.js` consume
  `shaders/composite.frag` sin copiarlo, y documenta las dos únicas divergencias. Es la
  pieza mejor diseñada del repositorio.
- **Los textos fuera del código.** `i18n.js` + `idiomas/` con traducción en caliente sobre
  el documento ya montado, y la carta impresa traducida también. Añadir un idioma es
  añadir un archivo… casi (ver A6).
- **Los límites del formulario los pone el papel.** `LIMITES` vive en `certificate.js` y
  `main.js` los lee; la prueba dibuja el peor caso en los tres idiomas y falla si se sale.
  Eso es un invariante bien construido.
- **Los comentarios explican el porqué.** El repositorio conserva las razones —el mp4 con
  VP9 dentro, el `seekable` en `[0,0]`, el `input[type=date]` que ensanchaba la rejilla—.
  Esa memoria vale más que el código y **ninguna** propuesta de aquí la sacrifica.
- **La capa nativa ya está mejor separada que la web.** `ArController` envuelve los
  canales, `kSteps` es una tabla y las vistas están en widgets. El track que se despliega
  es justo el que menos estructura tiene.

**Los cinco problemas de fondo.** Todo lo demás son consecuencias de estos:

| # | Problema | Síntoma medible |
|---|---|---|
| 1 | `main.js` hace de todo | 1.218 líneas, 40 funciones, 9 responsabilidades distintas |
| 2 | La máquina de estados está declarada a medias | `flow.js` es una tabla, pero `setStep()` decide por `nombre === "foto"` |
| 3 | El acoplamiento al DOM es por cadena de texto | 150 llamadas a `el("…")` sobre 82 identificadores |
| 4 | La pirámide de pruebas está invertida | 0 pruebas unitarias; 1 recorrido e2e de 1.173 líneas que necesita ffmpeg, numpy y un Chromium |
| 5 | La marca vive en tres sitios | `#B22420` escrito en `app.css`, en `certificate.js` y en `proto/index.html` |

Ninguno es urgente: la app funciona y está probada de punta a punta. Todos son **coste de
cambio**: encarecen la próxima funcionalidad, y la próxima es el vídeo.

---

# Auditoría A — código y arquitectura

## A1. `main.js` es un módulo-dios (SRP)

**Prueba.** Un solo archivo contiene: el estado global (`web/js/main.js:31`), la geometría
del overlay (:75), la máquina de pasos (:122), el catálogo de efectos (:237), la cámara
(:289), el arranque (:322), el bucle de render (:357), el HUD (:408), los gestos (:435), la
grabación (:505), la foto (:568), el guardado y compartido (:649), **el controlador entero
del formulario de la carta** (:702-914), el tema (:937), el idioma (:987) y los ajustes
(:1046-1153).

**Por qué importa.** Nueve motivos para tocar el mismo archivo son nueve maneras de que
un cambio de la carta rompa la cámara. Y lo notable es que el repositorio ya sabe separar:
`compositor.js`, `analyzer.js`, `recorder.js`, `certificate.js` e `i18n.js` tienen una
responsabilidad cada uno y están limpios. Lo que pasó es que **todo lo que no encontró
módulo se quedó en `main.js`**, y ya pesa tanto como los otros cinco juntos.

**Cambio.** Trocear por pantalla, no por tipo de cosa. Sin framework, sin bundler:

```
web/js/
  main.js            ~120 líneas: arranque, bucle de render y nada más
  app/estado.js      state, cfg y CFG_DEFECTO, con setters
  app/avisos.js      fail() y toast()
  app/preferencias.js  localStorage con su try/catch UNA vez (ver A6)
  camara/camara.js   openCamera, setCamera, linterna
  camara/gestos.js   setupGestures
  camara/geometria.js overlayRect, toCameraRect, cajaFoto, composeShot  ← funciones puras
  pantallas/pasos.js     setStep, pintarPaso, retículo y sticker
  pantallas/carta.js     TODO el controlador del formulario (hoy :702-914)
  pantallas/ajustes.js   tema, idioma, hojas, deslizadores
  pantallas/resultado.js offerSave, pintarGuardado y los tres paneles (ver B5)
```

Es mover código, no reescribirlo. La prueba e2e no se entera: sigue tocando los mismos
botones.

## A2. La máquina de estados está declarada a medias (OCP)

**Prueba.** `flow.js` dice en su cabecera que ahí solo vive el **comportamiento** de cada
paso. Pero `setStep()` (`main.js:122-161`) decide con el nombre del paso en la mano:

```js
const enFoto = name === "foto";
el("chrome").hidden = name === "inicio" || enFoto;
el("inicio-head").hidden = name !== "inicio";
el("ajustes-abrir").hidden = name !== "inicio";
el("camopts-bar").hidden = name === "inicio" || enFoto;
if (name === "foto" && previous !== "foto") setCamera("user");
else if (previous === "foto" && name !== "foto") setCamera("environment");
```

Y `pintarPaso()` (:117) repite `nombre === "foto"` para decidir si la pista es caja o
pastilla.

**Por qué importa.** Es exactamente el caso de libro de *abierto a extensión, cerrado a
modificación* al revés: añadir un paso —y el vídeo va a añadir alguno— obliga a editar
seis condiciones repartidas en dos funciones, y olvidarse de una no rompe nada hasta que
alguien llega a ese paso por el camino raro. Ya pasó una vez: el comentario de :156
explica que a FOTO "se entra por un camino pero se sale por tres".

**Cambio.** Que la tabla diga todo lo que la pantalla necesita saber:

```js
foto: {
  overlay: false, sticker: true, gesture: "moveAndScale", back: "inicio",
  cromo: false,          // la barra de navegación de la app
  barra: false,          // la barra inferior
  camara: "user",        // qué cámara pertenece a este paso
  pista: "pastilla",     // cómo se presenta el texto de ayuda
  opciones: "ninguna",   // qué botón de ajustes se ofrece
},
```

y que `setStep()` no vuelva a mencionar un nombre de paso. El cambio de cámara se vuelve
`if (step.camara !== STEPS[previous].camara) setCamera(step.camara)`, que además elimina
el tercer camino de salida como caso especial.

## A3. El acoplamiento al DOM es por cadena de texto (DIP)

**Prueba.** 150 llamadas a `el("…")` sobre 82 identificadores distintos, todas en
`main.js`. `el()` es `document.getElementById` sin red: un identificador mal escrito
devuelve `null` y revienta con `Cannot set properties of null`, en ejecución, en el
teléfono del usuario.

**Por qué importa.** El HTML y el JavaScript están casados por 82 cadenas que nadie
verifica. Renombrar un `id` en `index.html` no rompe ninguna compilación —no hay
compilación— y solo lo caza la prueba e2e si ese botón está en el recorrido. Además
`el("stage")`, `el("camopts")` y `el("diagnostico")` se resuelven **dentro del bucle de
render** (`main.js:361, 396`), o sea 60 búsquedas por segundo de algo que no cambia.

**Cambio.** Un mapa resuelto una vez al arrancar, que falla ruidosamente y pronto:

```js
// dom.js
export function mapear(ids) {
  const salida = {};
  for (const [nombre, id] of Object.entries(ids)) {
    const n = document.getElementById(id);
    if (!n) throw new Error(`Falta #${id} en el HTML (esperado como "${nombre}")`);
    salida[nombre] = n;
  }
  return Object.freeze(salida);
}
```

Un `id` mal escrito deja de ser un fallo en el cuarto del usuario y pasa a ser un error en
el arranque, que la prueba ve en la primera pantalla. De paso desaparecen las búsquedas
por frame.

## A4. Estado mutable compartido, sin nadie que avise

**Prueba.** Hay tres depósitos de estado independientes —`state` (:31), `cert` (:702) y
`guardables` (:54)— y siete variables sueltas de módulo (:48, :53). Nada notifica: cada
sitio que muta tiene que acordarse de llamar al repintado correcto. El propio código lo
dice con todas las letras en `refrescarIdioma()` (:1001):

> «La regla para no olvidarse de ninguno es sencilla: si un texto se escribe con
> `textContent` fuera de esta función, o deja su clave en `dataset.t`, o hay que
> repintarlo aquí.»

**Por qué importa.** Eso es un invariante que solo existe en un comentario. Funciona
mientras alguien lo lea; el día que no, el síntoma es sutil —un texto que se queda en el
idioma anterior— y solo aparece cambiando de idioma con algo a medias en pantalla, que es
justo lo que nadie prueba a mano.

**Cambio, en dos tramos.** Primero el barato: que `refrescarIdioma()` no sea una lista
escrita a mano sino un registro. Cada pantalla se apunta al arrancar
(`alCambiarIdioma(() => pintarChipsCarta())`), y añadir una pantalla nueva no obliga a
acordarse de editar una función lejana. Segundo, si se quiere ir más allá: un emisor de
30 líneas (`estado.set("step", "foto")` → notifica) en vez de mutar el objeto a pelo. No
hace falta más, y desde luego no hace falta un framework.

## A5. La pirámide de pruebas está invertida

**Prueba.** `web/test/flow.test.mjs`: 1.173 líneas, un solo archivo, secuencial, con su
propio `check()` en vez de un corredor. Necesita Python con numpy y pillow, ffmpeg, un
Chromium de Playwright y un servidor sobre la raíz del repo. Pruebas unitarias: **cero**.

**Por qué importa.** Esa prueba es excelente en lo suyo —ha cazado tres bugs reales y
vigila la composición, que es lo único difícil de este repositorio— y **no se toca**. El
problema es lo que *no* cubre barato: hay lógica pura, determinista y sin DOM que hoy solo
se puede probar levantando un navegador con una cámara falsa:

| Función | Dónde | Qué se le puede preguntar |
|---|---|---|
| `limpiar()` | `certificate.js:143` | controles, espacios pegados, recorte por code point |
| `fechaLarga()` | `certificate.js:75` | ISO inválido, mes 13, cadena vacía |
| `envolver()` / `ajustar()` | `certificate.js:207, 230` | una palabra más ancha que la columna |
| `Compositor.coverFit()` | `compositor.js:131` | vertical, apaisado, cuadrado |
| `ParamSolver.update()` | `analyzer.js:103` | recortes, dominante neutra, arranque del EMA |
| `pickMimeType()`, `extensionFor()`, `isAmbiguous()` | `recorder.js` | la tabla de códecs entera |
| `t()` y la caída al original | `i18n.js:66` | clave ausente, hueco sin variable |
| `delTelefono()` | `i18n.js:99` | `pt-BR`, `en-GB`, lista vacía |

**Cambio.** `node --test` (viene con Node 22, que ya usa el CI; cero dependencias nuevas)
sobre esas funciones. Media hora de escritura, se ejecuta en menos de un segundo y
convierte cada refactor de los de abajo en algo verificable sin arrancar un navegador. Y
como el CI ya instala Node, es un paso más en `ci-web.yml`, no un workflow nuevo.

La geometría (`overlayRect`, `toCameraRect`, `composeShot`) entra en esa lista **en cuanto
se extraiga a `camara/geometria.js` con parámetros explícitos** en vez de leer `state`. Es
la mejor razón para hacer A1.

## A6. Fugas en las fuentes únicas de verdad

Tres, y la primera contradice una promesa escrita:

**a) El idioma se declara en dos sitios.** `i18n.js` promete que «añadir un idioma es
añadir un archivo y una línea aquí». No es verdad: el script en línea de
`index.html:21` lleva la lista escrita a mano en una expresión regular,

```js
if (/^(es|en|pt)$/.test(idioma || "")) document.documentElement.lang = idioma;
```

y lo mismo con los temas (`"claro" || "oscuro"`, línea 15) y con los nombres de las claves
de almacenamiento (`"tema"`, `"idioma"`). Un cuarto idioma arranca en castellano hasta que
cargan los módulos, y nada lo prueba.

**Cambio.** El script en línea tiene que seguir siendo mínimo y previo a la hoja de
estilos —el motivo (evitar el destello) es correcto y no se discute—, pero puede dejar de
saber cuáles son los idiomas: basta con validar la **forma** (`/^[a-z]{2}$/`) y dejar que
`i18n.js` corrija después si no lo hablamos, que es lo que ya hace. Los nombres de las
claves, a un `preferencias.js` que también absorba los **seis** `try/catch` repetidos
alrededor de `localStorage` (`main.js:951, 1076, 1116, 1126`, `i18n.js:86, 123`).

**b) Código muerto.** `flow.js:87` exporta `ORDER`, que no importa nadie.
`certificate.js:129` exporta `LIMITE_NOTA` «porque la prueba y `main.js` ya lo usaban» —
y hoy no lo usa ninguno de los dos: solo aparece en comentarios y en el README. Se borran
los dos y se corrigen las tres menciones.

**c) Comentarios que ya no son verdad.** `certificate.js:61` y `:365` justifican dibujar
la firma a mano con que «la CSP lo prohíbe» cargar una fuente. **No hay ninguna CSP en el
repositorio** — ni meta en `index.html`, ni cabecera en Pages. La decisión de trazar la
firma sigue siendo buena por el otro motivo (ninguna cursiva está garantizada en los tres
sistemas), pero el argumento es falso. Dos salidas, y la segunda es mejor:

1. Corregir los comentarios.
2. **Añadir la CSP de verdad**, que es un `<meta http-equiv>` de tres líneas y convierte la
   afirmación en cierta: esta app no carga nada de terceros, así que una política estricta
   (`default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:;
   style-src 'self' 'unsafe-inline'`) no le quita nada y cierra la puerta a que un
   descuido futuro cargue una fuente o un script de fuera. Ojo con el `script-src`: el
   script del tema va en línea y necesitaría su `'sha256-…'` o quedarse fuera de la
   política. Es trabajo de media hora y hay que verificarlo con la prueba, porque una CSP
   mal puesta apaga la app en silencio.

## A7. `drawCertificate()`: función larga, números sueltos y una puerta trasera

**Prueba.** `certificate.js:525-680`, 155 líneas que hacen papel, grano, halo, marcos,
rombos, membrete, encabezado, filete, fecha, saludo, cuerpo con ajuste de tamaño, posdata,
despedida, firma, sello y personaje. Las posiciones son literales dentro del cuerpo: `150`,
`228`, `266`, `322`, `402`, `640`, `632`, `408`, `1306`, `122`, `250`.

Y la última línea:

```js
canvas.__caja = { tam, alto, fin: yDeseado, cabe: yDeseado <= TOPE };
```

**Por qué importa.** El troceado es evidente porque los comentarios ya marcan las
secciones (`--- Papel ---`, `--- Marcos ---`, `--- Membrete ---`…): son funciones con
nombre esperando a existir. Y `canvas.__caja` es una puerta trasera para la prueba colgada
de un nodo del DOM: el código de producción carga con un accesorio de laboratorio, y
cualquiera que lea la función tiene que averiguar quién lee esa propiedad.

**Cambio.** `pintarPapel(ctx)`, `pintarMarcos(ctx)`, `pintarMembrete(ctx, datos)`,
`pintarCuerpo(ctx, datos) → caja`, `pintarCierre(ctx, caja, raton)`; las posiciones a un
objeto `MAQUETA` junto a `SIZE`; y que `drawCertificate()` **devuelva** la caja en vez de
colgarla del lienzo. La prueba pasa a leer el valor devuelto —ya evalúa dentro de la
página, le cuesta lo mismo—. Ni un píxel se mueve, y eso se verifica comparando la captura
antes y después.

## A8. Rendimiento y corrección: cuatro detalles pequeños

1. **Una medición de layout por frame.** `main.js:361` llama a
   `el("stage").getBoundingClientRect()` dentro de `loop()`. Es una lectura forzada de
   geometría 60 veces por segundo para un valor que solo cambia al girar el teléfono. Un
   `ResizeObserver` sobre `#stage` guarda el tamaño y el bucle lo lee. Gratis, y en gama
   baja se nota.
2. **El comentario de `median()` dice lo contrario de lo que hace.** `analyzer.js:14`:
   «Mediana sin ordenar el array completo» y debajo `Float32Array.from(arr).sort()`, que
   ordena el array completo. O se corrige el comentario, o se implementa el *quickselect*
   que promete. En un archivo que se declara «puerto directo de `tools/compose.py`», el
   comentario falso es más caro que el coste de ordenar.
3. **Basura por cada análisis.** `analyzer.js:70-79` construye un `Array` con ~8.800
   `push`, y luego `hp.map(...)` crea otro. Cada diez frames. Con un `Float32Array`
   preasignado en el constructor —su tamaño solo depende de `CROP`— desaparece la presión
   sobre el recolector justo mientras se graba.
4. **Dos escuchas de teclado permanentes.** `main.js:1101` registra un `keydown` global
   dentro del bucle de las dos hojas y no lo quita nunca. Funciona, pero es el patrón que
   hace crecer las escuchas sin que nadie lo vea; van dentro del ciclo de vida de la hoja.

## A9. Accesibilidad estructural

No es una auditoría de accesibilidad completa —el marcado está bastante cuidado: hay
`aria-pressed`, `aria-label` traducidos, `role="group"` y `aria-modal`—, pero hay tres
huecos que son estructurales y salen casi gratis:

1. **Los avisos no se anuncian.** `#toast` y `#error` (`index.html:534-535`) no tienen
   `role="status"` / `role="alert"` ni `aria-live`. Un lector de pantalla no dice ni «no
   hay cámara frontal» ni el error de arranque. Dos atributos.
2. **Las hojas no atrapan ni devuelven el foco.** Tienen `role="dialog" aria-modal="true"`,
   que esconde el fondo para el lector, pero con el teclado se sale de la hoja tabulando y
   al cerrarla el foco no vuelve al botón que la abrió. Unas veinte líneas en el módulo de
   hojas, una sola vez para las dos. `#cert`, que ocupa la pantalla entera, ni siquiera se
   declara como diálogo.
3. **Un `aria-pressed` que nadie actualiza.** `#cam-modos` (`index.html:277-279`) escribe
   `aria-pressed` a mano en el HTML y `main.js:1169` nunca lo cambia. Hoy no miente por
   casualidad —esa barra solo se ve en FOTO—, pero es un estado declarado que no sigue al
   estado real, que es la definición de lo que acaba mintiendo.

## A10. La prueba e2e, como pieza de software

Merece su propio punto porque es el activo más valioso y el más frágil de mantener. Es
**un script**: 1.173 líneas, orden fijo, estado compartido de arriba abajo. Si falla la
sección de composición, las de grabación, foto, carta e idiomas siguen corriendo sobre una
página en un estado que ya no es el que esperaban, y el informe final mezcla el fallo real
con sus consecuencias.

**Cambio, sin perder nada.** Partirlo por asunto —`arranque`, `navegacion`, `composicion`,
`grabacion`, `foto`, `carta`, `idiomas`— conservando **un solo navegador y un solo
contexto** (levantarlo es lo que cuesta; el recorrido, no). Cada archivo declara de qué
pantalla parte. El `check()` actual puede quedarse: no hace falta un corredor nuevo.

---

# Auditoría B — sistema de diseño

## B1. La marca vive en tres sitios

**Prueba.** El rojo del chándal, `#B22420`, está escrito en `web/app.css:41`
(`--accent`), en `web/js/certificate.js:48` (`ORO`) y en `web/proto/index.html:24`
(`--accent`). El magenta de las zapatillas, `#C63A6C`, en dos de los tres. Lo mismo el
fondo, la tinta y el gris del pelaje.

**Por qué importa.** No es duplicación teórica: son tres superficies del mismo producto
—la interfaz, el documento que se imprime y la maqueta— y el día que la marca ajuste el
rojo, dos de las tres se quedan con el viejo. Y la que se queda vieja con más facilidad es
la carta, que es el entregable que el usuario guarda.

**Cambio.** Un único `web/js/marca.js` con la paleta como datos, del que salgan las dos
lecturas:

```js
export const MARCA = {
  rojo: "#B22420", magenta: "#C63A6C", tinta: "#1A1719",
  papel: "#FAF5EE", pelaje: "#8A7F72", lente: "#B9BEE8",
};
```

`certificate.js` lo importa (deja de tener paleta propia) y el CSS recibe los tokens de
ese mismo módulo al arrancar (`documentElement.style.setProperty`) **o**, si no se quiere
depender de JavaScript para pintar, se deja el bloque `:root` como está y se añade una
comprobación unitaria que falle si los dos se separan. La segunda opción es más humilde y
probablemente la correcta aquí: el CSS sigue siendo autosuficiente, y la prueba impide la
deriva.

## B2. La regla de los colores está escrita… y rota 25 veces

**Prueba.** `app.css:15` lo dice sin ambigüedad:

> «Regla para quien añada estilos: NADA de colores escritos a mano fuera de este bloque.»

Fuera de ese bloque hay **25 colores literales**: ocho `#fff`, `#111`, `#d4d4d4`,
`rgba(255,255,255,0.16 / 0.22 / 0.3 / 0.4 / 0.65 / 0.1)`, `rgba(0,0,0,0.35 / 0.55 / 0.7)`,
`rgba(255,244,242,0.16 / 0.82)`, `rgba(224,46,41,0.35)`, `rgba(178,36,32,0.45)`,
`rgba(158,154,145,0.55)`.

**Y casi todos están justificados**, lo que es exactamente el diagnóstico: no son
descuidos, son **una capa de tokens que falta**. Hay tres superficies con reglas de color
distintas y solo una tiene vocabulario:

| Superficie | Regla | Vocabulario hoy |
|---|---|---|
| Cromo de la app | sigue el tema del sistema | 22 tokens, completo |
| **Cromo de la cámara** (paso FOTO) | oscuro **siempre**, porque ninguna cámara tiene marco blanco | ninguno: 14 literales |
| **El papel** (la carta) | claro **siempre**, porque se imprime | ninguno: constantes en JS |

**Cambio.** Dos juegos de tokens más, con su regla escrita al lado, en el mismo bloque
`:root` y sin variante oscura porque no la tienen:

```css
/* Cromo de cámara: oscuro en los dos temas. Lo que manda aquí es el vídeo de debajo. */
--cam-tinta: #fff;
--cam-fondo: rgba(0, 0, 0, 0.55);     /* el velo medido: 62 de brillo sobre 135 */
--cam-boton: rgba(255, 255, 255, 0.16);
--cam-boton-pulsado: rgba(255, 255, 255, 0.3);
--cam-rejilla: rgba(255, 255, 255, 0.22);
--cam-borde: rgba(255, 255, 255, 0.4);
/* Tinta sobre el acento: es del acento, no del tema, e igual en los dos. */
--sobre-acento-suave: rgba(255, 244, 242, 0.16);
--sobre-acento-tenue: rgba(255, 244, 242, 0.82);
```

Los dos derivados (`rgba(224,46,41,0.35)` del `--rec` y `rgba(178,36,32,0.45)` del
acento) pueden dejar de ser literales con `color-mix(in srgb, var(--accent) 45%,
transparent)`, que está disponible desde Safari 16.2 y Chrome 111 — dentro del objetivo
declarado (iOS 15+) habría que comprobarlo o dejarlos como token explícito.

Con eso, la regla del archivo vuelve a ser cierta, y un `grep` de colores literales puede
entrar en el CI como comprobación de una línea.

## B3. No hay escala: ni de espacio, ni de tipografía, ni de radio (a medias)

**Prueba.** Hay tres tokens de radio (`--r-btn`, `--r-pill`, `--r-card`) y, junto a ellos,
**diez radios escritos a mano**: 2, 5, 6, 8, 9, 10, 12, 14, 26 y 999 px. Tamaños de letra:
**doce valores distintos** (11, 12, 12.5, 13, 14, 15, 16, 17, 19, 20, 26, 38). Rellenos y
huecos: 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17, 18, 20, 26 px.

**Por qué importa.** No es pureza: es que sin escala, cada pantalla nueva **inventa** su
número. Las tres apariciones de `font-size: 26px` son el mismo titular escrito tres veces
(`#inicio-head h2`, `.titulo-hoja`, `#boot h1` va aparte a 38), y hoy solo coinciden
porque alguien se acordó. La diferencia entre 12 y 12.5 px, repetida en cinco reglas, no
la decidió nadie: se arrastró.

**Cambio.** Una escala corta, en el mismo bloque de tokens, con los valores que **ya** se
usan más (no inventar una nueva y reescribir la app):

```css
/* Espaciado: rejilla de 4. Lo que hay hoy cae en estos seis salvo ±1 px. */
--e-1: 4px; --e-2: 8px; --e-3: 12px; --e-4: 16px; --e-5: 20px; --e-6: 28px;

/* Tipografía: cinco papeles, no doce tamaños. */
--t-pie: 12px;      /* ayudas, metadatos, la letra pequeña */
--t-cuerpo: 13px;   /* el tamaño por defecto de la interfaz */
--t-campo: 16px;    /* mínimo para que iOS no haga zoom al enfocar: NO se baja */
--t-fuerte: 17px;   /* el título de una tarjeta */
--t-titular: 26px;  /* los titulares de pantalla */

/* Radios: los tres que ya hay, más los dos que faltaban. */
--r-campo: 14px; --r-pastilla: 999px;
```

Y una regla de convivencia, porque esto no se hace de una vez: **lo nuevo usa la escala;
lo viejo se convierte cuando se toque por otro motivo.** La conversión es verificable
píxel a píxel comparando las capturas que el CI ya sube como artefacto.

## B4. El bloque del tema oscuro está duplicado — y se puede quitar

**Prueba.** `app.css:59-104`: 22 declaraciones, dos veces idénticas, una para
`@media (prefers-color-scheme: dark)` y otra para `:root[data-tema="oscuro"]`. El propio
comentario admite que «no hay forma de evitarlo sin un preprocesador» y encarga a la
prueba vigilar que no se separen.

**Sí hay forma, y dos.**

1. **Resolver `auto` en JavaScript.** El script en línea del `<head>` ya lee el tema
   guardado; que además resuelva `auto` a `claro`/`oscuro` mirando `matchMedia`, y escriba
   siempre `data-tema`. El CSS se queda con **un solo** bloque `[data-tema="oscuro"]` y
   desaparecen 22 líneas duplicadas. Coste: hay que escuchar
   `matchMedia("(prefers-color-scheme: dark)").addEventListener("change", …)` para que un
   teléfono que cambia solo al anochecer siga cambiando con la app abierta —que es
   precisamente el caso que el comentario de `main.js:924` dice que importa—. Compatible
   con todo el objetivo declarado.
2. **`light-dark()`**, que define los dos valores en una línea
   (`--bg: light-dark(#FFFFFF, #0D0C0F)`). Es la solución limpia y elimina también la
   tercera repetición (la de `color-scheme`), pero exige Safari 17.5 / iOS 17.5, y el
   objetivo del proyecto es **iOS 15+**. Hoy no; anotarla para cuando el suelo suba.

Recomendación: la 1, y que la prueba que hoy compara los dos bloques pase a comprobar que
`data-tema` está siempre puesto tras el arranque.

## B5. Componentes que existen sin tener nombre

**Prueba.** Tres paneles de resultado —`#clip`, `#shot` y el paso «documento» de `#cert`—
repiten la misma anatomía: contenido, línea de metadatos, botón de compartir, enlace de
descarga y una pista debajo. En el CSS son dos selectores agrupados y un tercero aparte
(`app.css:699-708` y `#cert-actions`); en el HTML son tres bloques calcados; en JavaScript
comparten `offerSave()`/`pintarGuardado()` —que **es** la abstracción correcta, y está
bien hecha— pero cada uno lleva su propio abrir y cerrar (`main.js:1189-1190`).

Lo mismo, más leve, con `.card`, `.chip`, `.segmento button` y `.fila`: las cuatro son
«superficie con borde que se enciende en el acento» y las cuatro escriben por separado
`background: var(--accent); color: var(--accent-ink); border-color: transparent`.

**Cambio.** Terminar la abstracción que ya está empezada: un `resultado.js` que reciba
`{ nodo, blob, nombre, pistas }` y se encargue de abrir, cerrar, revocar la URL anterior y
pintar los dos caminos de guardado. Y en CSS, una clase `.encendido` con las tres
declaraciones del acento, que las cuatro familias compartan. Son ~40 líneas menos y, sobre
todo, un sitio donde arreglar el próximo problema de guardado en vez de tres.

## B6. Dos lenguajes de superficie sin frontera escrita

La app tiene dos dialectos visuales deliberados y bien argumentados: el **cromo de la
app** (sigue el tema, velos degradados, nunca planchas opacas sobre la cama) y el **cromo
de la cámara** (oscuro siempre, botones circulares translúcidos, medidas tomadas de una
captura real de iOS). Los dos están explicados en comentarios excelentes, repartidos entre
`index.html:211-226` y `app.css:438-455`.

Lo que falta es que la frontera sea **legible desde el código**: hoy se distingue mirando
si la clase empieza por `cam-`. Basta con declararlo en una nota al principio de `app.css`
—qué familia manda en cada pantalla y por qué, con el enlace a los dos bloques— y con que
los tokens de B2 hagan visible la separación. Es la pieza que convierte «hay dos estilos»
en «hay dos sistemas, y este es el criterio para elegir».

## B7. `web/proto/` es deuda de diseño, no de código

895 líneas que repiten la paleta, los tres temas y media interfaz, para una maqueta cuyas
dos decisiones **ya están tomadas** (`1b` y `1c`, según su propio README). Se conserva
como registro de lo descartado, y eso es razonable.

Lo que no es razonable es dejarlo en el limbo: o se congela explícitamente —una nota en su
cabecera diciendo «esto no se mantiene; su paleta puede haber divergido de `app.css`»— o
entra en la regla de tokens de B1 y se mantiene. Cualquiera de las dos vale; no decidir es
lo que garantiza que dentro de tres meses nadie sepa si el rojo de ahí es el bueno.

---

# Plan por fases

Cada fase deja `./web/test/run.sh` en `TODO OK` y no cambia ni una funcionalidad. El orden
es por relación entre esfuerzo y lo que desbloquea.

### Fase 0 — Limpieza (medio día, riesgo nulo)

- Borrar `ORDER` y `LIMITE_NOTA`; corregir las tres menciones en comentarios y README.
- Corregir el comentario de `median()` y los dos de la CSP (o añadir la CSP, ver abajo).
- `preferencias.js`: los seis `try/catch` de `localStorage` y las cuatro claves, en un sitio.
- `role="status"` / `role="alert"` en `#toast` y `#error`.
- La expresión regular de idiomas del `<head>`, por forma y no por lista.

### Fase 1 — Sistema de diseño (un día, riesgo bajo, verificable por captura)

- Tokens de cámara y de papel (B2); la regla del archivo vuelve a ser cierta.
- Escala de espaciado, tipografía y radios (B3), aplicada a lo nuevo y a lo que se toque.
- `auto` resuelto en JavaScript y un solo bloque oscuro (B4).
- `marca.js` o la comprobación que impide que `app.css` y `certificate.js` se separen (B1).
- Nota de frontera entre los dos dialectos (B6) y decisión sobre `proto/` (B7).

### Fase 2 — Pruebas unitarias (medio día, riesgo nulo, es lo que habilita el resto)

- `node --test` sobre las ocho funciones puras de A5, y el paso en `ci-web.yml`.
- Partir el recorrido e2e por asunto, mismo navegador (A10).

### Fase 3 — Trocear `main.js` (dos o tres días, riesgo medio: es mover código)

- El orden importa: primero `geometria.js` (puro, ya con pruebas), luego `carta.js`
  (aislado, no toca la cámara), luego `ajustes.js`, `resultado.js` y al final `pasos.js`.
- `dom.js` con el mapa que falla al arrancar (A3), y las búsquedas fuera del bucle.
- `drawCertificate()` en cinco funciones, `MAQUETA` con las posiciones, y la caja
  devuelta en vez de colgada del lienzo (A7).

### Fase 4 — La máquina de estados, entera (un día, riesgo medio)

- Todo lo que hoy decide `setStep()` por el nombre del paso, a la tabla de `flow.js` (A2).
- Registro de repintado en vez de la lista a mano de `refrescarIdioma()` (A4).
- Foco atrapado y devuelto en las hojas (A9).

**Y después, no antes: el vídeo.** Ese es el argumento de todo el plan. Las fases 3 y 4
son exactamente el terreno donde va a caer el trabajo del modo vídeo —pasos nuevos,
estado nuevo, un panel de resultado más—, y hacerlas primero es la diferencia entre añadir
un paso y editar seis condiciones repartidas.

---

# Lo que NO recomiendo

Por si alguien lo propone más adelante, y con el motivo:

- **Un framework (React, Vue, Svelte).** La app tiene seis pantallas, un lienzo WebGL y
  cero necesidad de un DOM virtual; el bucle de render no se beneficia en nada y la
  reescritura pondría en riesgo justo lo que está verificado. El problema no es que falte
  un framework: es que falta trocear un archivo.
- **Un empaquetador.** Los módulos nativos funcionan, Pages sirve estático y el
  despliegue son dos workflows que se entienden leyéndolos. Un `build` añade un paso que
  puede fallar entre lo que se prueba y lo que se publica.
- **TypeScript completo.** Lo que hace falta es que un `id` mal escrito se note, y eso lo
  arregla el mapa de A3. Si se quiere tipado, la vía barata es JSDoc más un
  `tsconfig.json` con `checkJs` que solo comprueba y no compila: cero cambios en lo que se
  publica.
- **Rediseño visual.** No hay nada en esta auditoría que pida mover un píxel. Todas las
  propuestas de la parte B son de vocabulario, no de apariencia, y su criterio de éxito es
  que las capturas del CI salgan idénticas.
- **Tocar la prueba e2e para que corra más rápido.** Es lenta porque genera material
  sintético y arranca un navegador con una cámara falsa, y eso es precisamente lo que la
  hace valiosa. Lo que falta es la capa de abajo, no quitar la de arriba.

---

# Cómo comprobar que no se ha roto nada

1. `./web/test/run.sh` en `TODO OK` antes y después de cada fase.
2. Las capturas que el CI sube como artefacto (`capturas-asistente`), comparadas entre la
   rama y `main`: en las fases 0 a 2 tienen que ser idénticas; en la 3 y la 4, también.
3. Para la fase 1, además, una pasada a mano por las seis pantallas en los tres temas
   (claro, oscuro, automático) y los tres idiomas. Es la única parte que un `diff` de
   capturas no cubre del todo, porque el tema automático depende del sistema.
