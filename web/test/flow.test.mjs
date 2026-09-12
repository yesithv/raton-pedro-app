// Recorrido completo del asistente sobre una cámara falsa.
//
// Es la prueba que protege lo único que está verificado de verdad en este repo: que la
// composición dibuja, que el SceneAnalyzer resuelve uniforms razonables, y que se puede
// grabar un clip con pista de audio. Ha cazado ya tres bugs reales (el .mp4 que contenía
// VP9, el `video { display:none }` que apagaba la previsualización, y la dependencia de
// poder buscar en el vídeo).
//
// Requiere un servidor sirviendo la RAÍZ del repo, porque la página carga el shader desde
// ../shaders/ — una sola fuente de verdad compartida con el nativo.

import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';

const BASE = process.env.BASE_URL ?? 'http://localhost:8099';
const FAKE_CAM = process.env.FAKE_CAM;
const OUT = process.env.SHOT_DIR ?? '/tmp';

assert(FAKE_CAM, 'define FAKE_CAM con la ruta al .y4m de la cámara falsa');

// CHROMIUM_PATH permite usar un Chromium ya instalado en el sistema en vez del que
// descarga Playwright. En CI se deja vacío y `npx playwright install` hace su trabajo.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${FAKE_CAM}`,
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--no-sandbox',
  ],
});

const ctx = await browser.newContext({
  viewport: { width: 412, height: 892 },
  deviceScaleFactor: 2,
  permissions: ['camera', 'microphone'],
});
const page = await ctx.newPage();

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
// 304 es "no ha cambiado, usa tu copia": la respuesta correcta a una revalidación de
// caché, y la que da el servidor al recargar. ok() solo acepta 200-299, así que hay que
// dejarla pasar a mano o la prueba se cae por un acierto del servidor.
page.on('response', (r) => {
  if (!r.ok() && r.status() !== 304) problems.push(`http ${r.status()}: ${r.url()}`);
});

const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`  ok   ${label}`); }
  catch (e) { failures++; console.log(`  FALLA ${label}\n       ${e.message}`); }
};

console.log('arranque');
await page.goto(`${BASE}/web/index.html`, { waitUntil: 'networkidle' });

// ---------------------------------------------------------------------------
// La convención de los botones de navegación
// ---------------------------------------------------------------------------
// IZQUIERDA se vuelve, DERECHA se cierra, en todas las pantallas y siempre a la misma
// altura. Y dibujados en SVG, no escritos con caracteres (✕ ← ⌂): un carácter lo dibuja
// la fuente del sistema, se ve distinto en cada teléfono y no siempre existe.
const nav = await page.evaluate(() => {
  const lados = (sel) => [...document.querySelectorAll(sel)].map((e) => {
    const c = getComputedStyle(e);
    return { izq: c.left !== 'auto', der: c.right !== 'auto',
             icono: e.querySelector('use')?.getAttribute('href') ?? null };
  });
  // Los botones de navegación de toda la app: los de esquina y los de las cabeceras.
  const todos = [...document.querySelectorAll(
    '.esquina-cerrar, .esquina-atras, .hoja-head button, #chrome button, #foto-salir')];
  return {
    atras: lados('.esquina-atras'),
    cerrar: lados('.esquina-cerrar'),
    iconos: todos.map((e) => e.querySelector('use')?.getAttribute('href') ?? e.textContent.trim()),
    // El cromo del asistente: volver a la izquierda, cerrar a la derecha.
    chrome: [...document.querySelectorAll('#chrome > *')].map((e) => e.id || e.tagName),
  };
});

check('volver va siempre a la izquierda y cerrar siempre a la derecha', () => {
  assert(nav.atras.length > 0 && nav.cerrar.length > 0, 'no hay botones de esquina');
  for (const b of nav.atras) assert(b.izq && !b.der, 'un "volver" no está a la izquierda');
  for (const b of nav.cerrar) assert(b.der && !b.izq, 'un "cerrar" no está a la derecha');
});
check('el cromo del asistente sigue la convención', () =>
  assert.deepEqual(nav.chrome, ['back', 'step-title', 'home'],
    'el orden del cromo no es volver · título · cerrar'));
check('ningún botón de navegación se dibuja con un carácter de texto', () => {
  const conCaracter = nav.iconos.filter((i) => i && !i.startsWith('#ic-'));
  assert.equal(conCaracter.length, 0,
    `estos van con carácter y no con SVG: ${conCaracter.join(' ')}`);
});

console.log('ajustes y temas');
// Se prueban ANTES de encender la cámara porque ahí es donde vive el botón de ajustes y
// donde el usuario lo usa: eligiendo con qué luz quiere la app antes de empezar.
//
// Lo que hay que demostrar del tema es que CAMBIA de verdad (no solo que el atributo se
// pone), que las tres opciones están a la vista, y que la elección sobrevive a recargar,
// que es lo que un usuario nota si falla.
const estadoTema = () => page.evaluate(() => ({
  tema: document.documentElement.dataset.tema || 'auto',
  fondo: getComputedStyle(document.body).backgroundColor,
  texto: getComputedStyle(document.body).color,
  marcada: [...document.getElementById('tema').children]
    .filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.tema),
}));

const ajustesAlEmpezar = await page.getAttribute('#ajustes', 'hidden');
check('la hoja de ajustes empieza cerrada', () => assert.equal(ajustesAlEmpezar, ''));

await page.click('#ajustes-abrir');
await page.waitForSelector('#ajustes:not([hidden])', { timeout: 5_000 });
await shot('0_ajustes');

const opciones = await page.$$eval('#tema button', (bs) => bs.map((b) => b.dataset.tema));
check('las tres opciones de tema están a la vista a la vez', () =>
  assert.deepEqual(opciones, ['auto', 'claro', 'oscuro']));

const porTema = {};
for (const id of ['claro', 'oscuro', 'auto']) {
  await page.click(`#tema button[data-tema="${id}"]`);
  await page.waitForTimeout(120);
  porTema[id] = await estadoTema();
}

console.log(`  temas: ${Object.values(porTema).map((e) => `${e.tema}=${e.fondo}`).join(' · ')}`);
check('elegir un tema lo deja elegido, y solo a él', () => {
  for (const [id, e] of Object.entries(porTema)) {
    assert.equal(e.tema, id, `pedí "${id}" y quedó "${e.tema}"`);
    assert.deepEqual(e.marcada, [id], `marcadas ${e.marcada.join()} habiendo pedido ${id}`);
  }
});
check('el tema oscuro cambia los colores de verdad', () => {
  assert.notEqual(porTema.claro.fondo, porTema.oscuro.fondo, 'el fondo no cambió entre temas');
  assert.notEqual(porTema.claro.texto, porTema.oscuro.texto, 'el texto no cambió entre temas');
});

// Recargar con el tema elegido: el guardado se aplica en un script EN LINEA antes de la
// hoja de estilos justo para que no haya destello, y las tres opciones tienen que volver
// marcadas donde tocaba. Es la parte que solo se rompe en la recarga, nunca en el clic.
await page.click('#tema button[data-tema="oscuro"]');
await page.reload({ waitUntil: 'networkidle' });
const trasRecargar = await page.evaluate(() => ({
  tema: document.documentElement.dataset.tema || 'auto',
  fondo: getComputedStyle(document.body).backgroundColor,
}));
await page.click('#ajustes-abrir');
await page.waitForSelector('#ajustes:not([hidden])', { timeout: 5_000 });
const marcadaTrasRecargar = await page.$$eval('#tema button[aria-pressed="true"]',
  (bs) => bs.map((b) => b.dataset.tema));
check('el tema elegido sobrevive a recargar', () => {
  assert.equal(trasRecargar.tema, 'oscuro', 'la página volvió sin el tema guardado');
  assert.equal(trasRecargar.fondo, porTema.oscuro.fondo, 'volvió el atributo pero no los colores');
  assert.deepEqual(marcadaTrasRecargar, ['oscuro'], 'la opción no volvió marcada');
});
await page.click('#tema button[data-tema="auto"]');

// El idioma: por ahora SOLO el selector. Lo que hay que comprobar es que se puede
// elegir, que la elección se queda puesta, y -sobre todo- que la app NO miente diciendo
// que ya está traducida: el pie tiene que avisar de que los textos llegan después.
const idiomas = await page.$$eval('#idioma button', (bs) => bs.map((b) => b.dataset.idioma));
check('el selector de idioma ofrece las tres opciones', () =>
  assert.deepEqual(idiomas, ['es', 'en', 'pt']));

await page.click('#idioma button[data-idioma="en"]');
const trasIdioma = await page.evaluate(() => ({
  marcado: [...document.querySelectorAll('#idioma button[aria-pressed="true"]')]
    .map((b) => b.dataset.idioma),
  pie: document.getElementById('idioma-pie').textContent,
  lang: document.documentElement.lang,
}));
check('elegir un idioma lo deja elegido y avisa de que aún no traduce', () => {
  assert.deepEqual(trasIdioma.marcado, ['en'], 'la opción no quedó marcada');
  assert(/más adelante|español/i.test(trasIdioma.pie),
    `el pie no avisa de que los textos faltan: "${trasIdioma.pie}"`);
  // `lang` se queda en es a propósito: los textos SIGUEN en castellano, y decirle otra
  // cosa al lector de pantalla es peor que no ofrecer el idioma.
  assert.equal(trasIdioma.lang, 'es', 'el <html lang> miente sobre el idioma real');
});
await page.click('#idioma button[data-idioma="es"]');

// Los ajustes de la app NO llevan nada de la cámara: eso vive en las opciones de cámara,
// que es donde los deslizadores sirven porque se ve la escena al moverlos.
const dentroDeAjustes = await page.$$eval('#ajustes-scroll h3', (hs) => hs.map((h) => h.textContent));
check('los ajustes de la app son solo tema e idioma', () =>
  assert.deepEqual(dentroDeAjustes, ['Tema', 'Idioma']));

await page.click('#ajustes-listo');
const ajustesTrasListo = await page.getAttribute('#ajustes', 'hidden');
check('"Listo" cierra la hoja', () => assert.equal(ajustesTrasListo, ''));

// Los tokens del tema oscuro están DUPLICADOS en el CSS -uno para el sistema y otro para
// la elección explícita- porque sin preprocesador no hay forma de evitarlo. Si alguien
// toca uno y olvida el otro, la app se comporta distinto según cómo llegaste al oscuro.
const duplicado = await page.evaluate(async () => {
  const css = await (await fetch('app.css')).text();
  const bloque = (inicio, fin) => {
    const a = css.indexOf(inicio);
    const b = fin ? css.indexOf(fin) : css.length;
    return Object.fromEntries([...css.slice(a, b).matchAll(/(--[a-z-]+):\s*([^;]+);/g)]
      .map((m) => [m[1], m[2].trim()]));
  };
  const porSistema = bloque('@media (prefers-color-scheme: dark)', ':root[data-tema="oscuro"]');
  const porEleccion = bloque(':root[data-tema="oscuro"] {', '/* Que los controles nativos');
  return { sistema: porSistema, eleccion: porEleccion };
});
check('los dos bloques del tema oscuro siguen siendo iguales', () => {
  assert(Object.keys(duplicado.sistema).length > 10, 'no se encontraron los tokens oscuros');
  assert.deepEqual(duplicado.sistema, duplicado.eleccion,
    'los dos bloques del tema oscuro se han separado: tocaron uno y no el otro');
});

await page.click('#start');
await page.waitForSelector('#bar:not([hidden])', { timeout: 30_000 });
await page.waitForTimeout(2000);

const catalog = await page.evaluate(() =>
  fetch('assets/catalog.json').then((r) => r.json()).then((d) => d.effects));
check('el catálogo trae las tres animaciones', () => assert.equal(catalog.length, 3));

console.log('asistente');
await page.click('#go-video');
const reticleVisible = await page.isVisible('#reticle');
check('ESCANEAR muestra el retículo', () => assert(reticleVisible));
await page.mouse.click(206, 640);
await shot('1_escanear');

await page.click('#place');
const superficie = await page.textContent('#step-title');
check('paso POSICIÓN', () => assert.equal(superficie, 'POSICIÓN'));
await shot('2_superficie');

await page.click('#next-superficie');
const tamano = await page.textContent('#step-title');
check('paso TAMAÑO', () => assert.equal(tamano, 'TAMAÑO'));
await shot('3_tamano');

await page.click('#next-tamano');
const editar = await page.textContent('#step-title');
check('paso EDITAR', () => assert.equal(editar, 'EDITAR'));
const first = await page.textContent('#fx-title');
await page.click('#fx-next');
await page.waitForTimeout(900);
const second = await page.textContent('#fx-title');
check('el selector cambia de animación', () => assert.notEqual(first, second));
await shot('4_editar');

await page.click('#select-fx');
const grabar = await page.textContent('#step-title');
check('paso GRABAR', () => assert.equal(grabar, 'GRABAR'));

console.log('composición');
// Que el personaje esté REALMENTE dibujado, no solo que no haya errores.
//
// La primera versión de esta comprobación medía la zona del personaje contra otra zona
// del fondo y exigía una diferencia mayor que un umbral inventado. Era frágil por
// construcción: la escena tiene un degradado, así que dos zonas cualesquiera ya difieren,
// y el umbral acabó fallando en CI por 0.0002. Ahora se mide contra el RUIDO PROPIO de
// la escena: se lee dos veces la misma región con el overlay apagado para saber cuánto
// cambia sola, y luego con el overlay encendido. Si dibuja, la diferencia tiene que
// destacar sobre ese suelo de ruido. Sin umbrales a ojo.
const sampleRegion = () => page.evaluate(() => {
  const c = document.getElementById('stage');
  const gl = c.getContext('webgl2');
  // Caja alrededor del punto donde se tocó (0.5, 0.717), hacia arriba: ahí está el
  // cuerpo, porque se posiciona por el punto de CONTACTO con el suelo.
  const w = Math.round(c.width * 0.22);
  const h = Math.round(c.height * 0.16);
  const x = Math.round(c.width * 0.39);
  const y = Math.round(c.height * 0.20);   // origen de GL abajo-izquierda
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const acc = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) {
    acc[0] += px[i]; acc[1] += px[i + 1]; acc[2] += px[i + 2];
  }
  const n = w * h * 255;
  return [acc[0] / n, acc[1] / n, acc[2] / n];
});
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// EL OVERLAY ES UNA ANIMACIÓN, y eso manda sobre cómo se mide.
//
// Esta comprobación ha fallado dos veces por el mismo sitio, y las dos veces el arreglo
// atacó un síntoma distinto:
//
//   1º  Medía el "ruido" restando dos lecturas separadas medio segundo. Eso no es ruido:
//       la cámara falsa es un vídeo que se mueve, así que medía movimiento de escena.
//   2º  Se pasó a promediar cinco lecturas de cada estado y comparar las MEDIAS. Mejor,
//       pero volvió a fallar con señal 0,00693 contra un listón de 0,00705.
//
// La causa de fondo es la del segundo fallo: el personaje NO está quieto. El overlay es
// una animación en bucle -entra, se le descubre, se va- y el recorte que se muestrea es
// fijo, así que hay frames en los que el personaje no está dentro. Promediar los cinco
// mezcla los frames en los que se ve con los que no, y hunde la señal justo por debajo
// del listón.
//
// Lo que hay que demostrar es "el overlay dibuja", no "el overlay dibuja en todos los
// frames". Así que la señal es el MÁXIMO de las lecturas y no su media: si en algún
// momento el personaje cambia la imagen, está dibujando. El suelo sigue siendo la peor
// dispersión observada, que es el otro extremo y captura los picos del movimiento, así
// que se compara extremo contra extremo y no extremo contra media.
const muestrearVarias = async (n = 7) => {
  const lecturas = [];
  for (let i = 0; i < n; i++) {
    lecturas.push(await sampleRegion());
    await page.waitForTimeout(120);
  }
  const media = [0, 1, 2].map((c) => lecturas.reduce((a, l) => a + l[c], 0) / lecturas.length);
  return { lecturas, media, dispersion: Math.max(...lecturas.map((l) => distance(l, media))) };
};

await page.click('#home');            // inicio: overlay apagado
await page.waitForTimeout(700);
const sinOverlay = await muestrearVarias();

// Volver a GRABAR por el mismo camino: la colocación y el tamaño se conservan.
for (const id of ['#go-video', '#place', '#next-superficie', '#next-tamano', '#select-fx']) {
  await page.click(id);
  await page.waitForTimeout(250);
}
await page.waitForTimeout(700);
const conOverlay = await muestrearVarias();

// El frame en el que más se nota el personaje, medido contra la escena sin él.
const senal = Math.max(...conOverlay.lecturas.map((l) => distance(l, sinOverlay.media)));
const ruido = sinOverlay.dispersion;   // cuánto se mueve la escena sola

console.log(`  señal ${senal.toFixed(5)} · dispersión de la escena ${ruido.toFixed(5)}`);
check('el overlay cambia la imagen más que el ruido de la escena', () =>
  assert(senal > Math.max(ruido * 3, 0.002),
    `el overlay no destaca sobre el ruido: señal ${senal.toFixed(5)}, dispersión ${ruido.toFixed(5)}`));

// ---------------------------------------------------------------------------
// Las opciones de cámara
// ---------------------------------------------------------------------------
// Se abren desde DENTRO de la cámara -el botón de la barra del asistente y el ••• de
// FOTO-, que es el único sitio donde los deslizadores sirven de algo: mueves uno y ves
// la escena cambiar. En los ajustes de la app no pintaban nada.
await page.click('#camopts-bar');
await page.waitForSelector('#camopts:not([hidden])', { timeout: 5_000 });
const dentroDeCamara = await page.evaluate(() => ({
  ajustesCerrados: document.getElementById('ajustes').hidden,
  tieneAjusteFino: !!document.querySelector('#camopts #avanzado'),
  tieneRejilla: !!document.querySelector('#camopts #s-rejilla'),
  tieneTema: !!document.querySelector('#camopts #tema'),
}));
check('el botón de la barra abre las opciones de CÁMARA, no los ajustes', () => {
  assert(dentroDeCamara.ajustesCerrados, 'se abrieron los ajustes de la app');
  assert(dentroDeCamara.tieneAjusteFino, 'el ajuste fino no está en las opciones de cámara');
  assert(dentroDeCamara.tieneRejilla, 'la cuadrícula no está en las opciones de cámara');
  assert(!dentroDeCamara.tieneTema, 'el tema se ha colado en las opciones de cámara');
});

// El ajuste fino puede dejar la imagen inservible; "Restablecer" es la salida. Se mueve
// un deslizador, se comprueba que se movió, y se restablece.
const leerKey = () => page.evaluate(() => ({
  input: Number(document.getElementById('s-key').value),
  visible: document.getElementById('s-key-v').textContent,
}));
await page.click('#avanzado summary');
const keyDeFabrica = await leerKey();
await page.$eval('#s-key', (i) => {
  i.value = i.max;
  i.dispatchEvent(new Event('input', { bubbles: true }));
});
const keyTocado = await leerKey();
await page.click('#ajustes-reset');
const keyRestablecido = await leerKey();
check('el ajuste fino se mueve y "Restablecer" lo devuelve', () => {
  assert.notEqual(keyTocado.input, keyDeFabrica.input, 'el deslizador no se movió');
  assert.equal(keyTocado.visible, String(keyTocado.input.toFixed(2)),
    'el número de al lado no sigue al deslizador');
  assert.deepEqual(keyRestablecido, keyDeFabrica, 'Restablecer no volvió a los valores de fábrica');
});

// El diagnóstico son números crudos y no tiene por qué verlos un padre a las dos de la
// mañana: siete toques en el título, el gesto de siempre.
const dxAlEmpezar = await page.getAttribute('#diagnostico', 'hidden');
for (let i = 0; i < 7; i++) await page.click('#camopts-titulo');
const dxTrasSieteToques = await page.getAttribute('#diagnostico', 'hidden');
check('el diagnóstico no está a la vista de entrada', () => assert.equal(dxAlEmpezar, ''));
check('siete toques en el título lo destapan', () => assert.equal(dxTrasSieteToques, null));

const hud = await page.evaluate(() =>
  new Promise((r) => setTimeout(() => r(document.getElementById('dbg').textContent), 900)));
const exposure = hud.match(/uExposureMatch ([\d.]+) ([\d.]+) ([\d.]+)/);
check('SceneAnalyzer resuelve un vec3 de exposición', () => {
  assert(exposure, `el HUD no trae uExposureMatch:\n${hud}`);
  for (const v of exposure.slice(1)) {
    assert(Number(v) > 0 && Number(v) < 3, `exposición fuera de rango: ${v}`);
  }
});
await page.click('#camopts-listo');

// Ninguna página puede escribir en la galería: o hay hoja del sistema (y el botón que la
// abre es la acción principal) o solo queda la descarga (y entonces la principal es esa).
// Lo que NO puede pasar es que no haya ninguna, o que no se explique cuál lleva al carrete.
const caminoDeGuardado = (kind) => page.evaluate((k) => {
  const file = new File([new Blob(['x'])], 'a.bin', { type: 'application/octet-stream' });
  return {
    can: !!navigator.canShare?.({ files: [file] }),
    tip: document.getElementById(`${k}-tip`).textContent.trim(),
    shareVisible: !document.getElementById(`${k}-share`).hidden,
    savePrimary: document.getElementById(`${k}-save`).classList.contains('primary'),
  };
}, kind);

const revisarGuardado = (kind, guardado) => check(
  `${kind}: siempre hay un camino visible para quedarse con el archivo`, () => {
    assert(guardado.tip.length > 0, 'no se explica cómo guardar');
    assert.equal(guardado.shareVisible, guardado.can,
      'el botón de la hoja del sistema no coincide con si el navegador la tiene');
    assert.equal(guardado.savePrimary, !guardado.can,
      'la descarga tiene que ser la acción principal solo cuando no hay hoja del sistema');
  });

console.log('grabación');
await page.click('#record');
await page.waitForSelector('#rec-badge:not([hidden])', { timeout: 10_000 });
await shot('5_grabando');
await page.waitForSelector('#clip:not([hidden])', { timeout: 40_000 });
await page.waitForTimeout(1200);
await shot('6_resultado');

const clip = await page.evaluate(async () => {
  const v = document.getElementById('clip-video');
  const blob = await (await fetch(v.src)).blob();
  return { w: v.videoWidth, h: v.videoHeight, bytes: blob.size, type: blob.type };
});
console.log(`  clip ${clip.w}x${clip.h} · ${(clip.bytes / 1e6).toFixed(2)} MB · ${clip.type}`);
check('el clip tiene dimensiones y peso', () => {
  assert(clip.w > 0 && clip.h > 0, 'clip sin dimensiones');
  assert(clip.bytes > 50_000, `clip sospechosamente pequeño: ${clip.bytes} bytes`);
});
const meta = await page.textContent('#clip-meta');
check('el códec del contenedor está garantizado', () =>
  // Se comprueba el aviso visible, no el contenedor: el mimeType que REPORTA el
  // navegador viene normalizado ("video/mp4" aunque se pidiera con codecs=avc1…), así
  // que juzgar por él da un falso positivo en cuanto el navegador tiene H.264.
  assert(!meta.includes('ojo:'), `la app avisa de contenedor ambiguo:\n${meta}`));
check('la grabación incluye micrófono', () => assert(meta.includes('micrófono'), meta));
revisarGuardado('clip', await caminoDeGuardado('clip'));

console.log('navegación');
await page.click('#clip-close');
await page.click('#back');
const back = await page.textContent('#step-title');
check('atrás vuelve a EDITAR', () => assert.equal(back, 'EDITAR'));
await page.click('#home');
const atHome = await page.isVisible('#ui-inicio');
check('inicio vuelve al principio', () => assert(atHome));

console.log('foto con el ratón');
// El modo FOTO no pasa por el shader: el ratón es un PNG con alfa encima de la cámara y
// la captura lo compone en 2D. Lo que hay que demostrar es justo eso — que el personaje
// acaba DENTRO del archivo guardado, no solo dibujado en la pantalla.
await page.click('#go-photo');
const foto = await page.textContent('#step-title');
check('paso FOTO', () => assert.equal(foto, 'FOTO'));
const stickerVisible = await page.isVisible('#sticker');
const editorVisible = await page.isVisible('#ui-editar');
check('el ratón está a la vista', () => assert(stickerVisible));
check('el catálogo de animaciones no pinta aquí', () => assert(!editorVisible));

// FOTO imita la cámara del teléfono, y lo que se imita son MEDIDAS tomadas de una
// captura real: visor 4:3 exacto, bandas 1:1,84, velo en vez de negro opaco, cuadrícula
// en los tercios y obturador de 68 px. Si alguien toca el CSS y se pierden, la pantalla
// deja de leerse como una cámara y no hay forma de verlo leyendo el código.
const cam = await page.evaluate(() => {
  const caja = (sel) => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  const v = caja('#visor');
  return {
    visor: v, arriba: caja('#cam-arriba'), abajo: caja('#cam-abajo'),
    aro: caja('.disparador'), disco: caja('.disparador span'),
    velo: getComputedStyle(document.getElementById('cam-arriba')).backgroundColor,
    botones: [...document.querySelectorAll('#ui-foto .cam-btn')]
      .map((n) => Math.round(n.getBoundingClientRect().width)),
    // Cada línea, como fracción del lado del visor por el que corre.
    rejilla: [...document.querySelectorAll('#rejilla i')].map((n) => {
      const b = n.getBoundingClientRect();
      return b.height <= 2 ? (b.y - v.y) / v.h : (b.x - v.x) / v.w;
    }),
    cromo: { chrome: !document.getElementById('chrome').hidden,
             bar: !document.getElementById('bar').hidden,
             hint: !document.getElementById('hint').hidden },
  };
});

console.log(`  visor ${Math.round(cam.visor.w)}x${Math.round(cam.visor.h)} · ` +
            `bandas 1:${(cam.abajo.h / cam.arriba.h).toFixed(2)} · velo ${cam.velo}`);

check('el visor es 4:3 exacto, como el de la cámara del teléfono', () => {
  const r = cam.visor.h / cam.visor.w;
  assert(Math.abs(r - 4 / 3) < 0.01, `el visor va en ${r.toFixed(3)}, no en 1,333`);
});
check('las bandas enmarcan el visor en la proporción medida', () => {
  assert(cam.arriba.h > 40 && cam.abajo.h > 120, 'alguna banda se quedó sin alto');
  const rel = cam.abajo.h / cam.arriba.h;
  assert(rel > 1.4 && rel < 2.4, `las bandas van 1:${rel.toFixed(2)} y se midió 1:1,84`);
});
check('las bandas son un velo y no negro opaco', () => {
  // Es lo que hace el teléfono: se sigue viendo la escena por encima y por debajo del
  // recuadro. Con negro opaco se pierde de vista la mitad de a lo que estás apuntando.
  const partes = cam.velo.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
  assert.equal(partes.length, 4, `la banda es opaca: ${cam.velo}`);
  assert(partes[3] > 0.35 && partes[3] < 0.8, `velo al ${partes[3]}, se midió ~0,55`);
});
check('el obturador mide los 68 px de la cámara nativa, con su aro', () => {
  assert.equal(Math.round(cam.disco.w), 68, `el disco mide ${cam.disco.w}`);
  assert(cam.aro.w > cam.disco.w + 4, 'el disco no tiene aro alrededor');
});
check('los botones de icono son todos del mismo tamaño y se pueden tocar', () => {
  const unico = [...new Set(cam.botones)];
  assert.equal(unico.length, 1, `hay botones de tamaños distintos: ${unico.join(', ')}`);
  assert(unico[0] >= 44, `${unico[0]} px se queda por debajo del mínimo táctil de 44`);
});
check('la cuadrícula cae en los tercios', () => {
  const esperado = [1 / 3, 2 / 3, 1 / 3, 2 / 3];
  cam.rejilla.forEach((v, i) => assert(Math.abs(v - esperado[i]) < 0.01,
    `la línea ${i + 1} cae en ${v.toFixed(3)} y debería caer en ${esperado[i].toFixed(3)}`));
});
check('en FOTO no se ve el cromo de la app', () => {
  assert(!cam.cromo.chrome, 'la barra de navegación se cuela en la cámara');
  assert(!cam.cromo.bar, 'la barra inferior de la app se cuela en la cámara');
  assert(!cam.cromo.hint, 'la caja de instrucciones tapa el visor');
});

await page.mouse.click(206, 640);     // los pies del ratón, a media pantalla
await page.click('#flip');            // cambiar de cámara y seguir vivo
await page.waitForTimeout(1200);
const camaraViva = await page.evaluate(() =>
  document.getElementById('camera').readyState >= 2);
check('la cámara sigue dando imagen tras cambiarla', () => assert(camaraViva));
await shot('7_foto');

await page.click('#snap');
await page.waitForSelector('#shot:not([hidden])', { timeout: 15_000 });
await shot('8_foto_resultado');

const captura = await page.evaluate(async () => {
  const img = document.getElementById('shot-img');
  await img.decode();
  const stage = document.getElementById('stage');
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  // Caja donde quedó el ratón: anclado por los pies cerca del borde de abajo del visor y
  // con una altura de 0.45, el cuerpo cae en el tercio central a media altura.
  const box = [Math.round(c.width * 0.36), Math.round(c.height * 0.58),
               Math.round(c.width * 0.28), Math.round(c.height * 0.25)];
  ctx.drawImage(img, 0, 0);
  const conRaton = ctx.getImageData(...box).data;
  // El lienzo NO lleva el ratón: es solo la cámara. Y hay que recortarlo IGUAL que la
  // foto -al visor- o se estarían comparando dos trozos distintos de la escena, y la
  // comprobación pasaría aunque el ratón no estuviera dentro del archivo.
  const cajaLienzo = stage.getBoundingClientRect();
  const v = document.getElementById('visor').getBoundingClientRect();
  const k = stage.width / cajaLienzo.width;
  ctx.drawImage(stage, (v.left - cajaLienzo.left) * k, (v.top - cajaLienzo.top) * k,
                v.width * k, v.height * k, 0, 0, c.width, c.height);
  const sinRaton = ctx.getImageData(...box).data;
  let acc = 0;
  for (let i = 0; i < conRaton.length; i += 4) {
    acc += Math.abs(conRaton[i] - sinRaton[i]) +
           Math.abs(conRaton[i + 1] - sinRaton[i + 1]) +
           Math.abs(conRaton[i + 2] - sinRaton[i + 2]);
  }
  return { w: img.naturalWidth, h: img.naturalHeight, diff: acc / (conRaton.length / 4 * 3) };
});
console.log(`  foto ${captura.w}x${captura.h} · diferencia media ${captura.diff.toFixed(1)}/255`);
check('la foto guardada tiene el tamaño del lienzo', () =>
  assert(captura.w > 0 && captura.h > 0, 'foto sin dimensiones'));
check('la foto sale con el recorte del visor, no con el de la pantalla', () => {
  const r = captura.h / captura.w;
  assert(Math.abs(r - 4 / 3) < 0.02,
    `la foto sale en ${r.toFixed(3)}: lo que se ve en el visor no es lo que se guarda`);
});
check('el ratón está DENTRO de la foto, no solo en pantalla', () =>
  assert(captura.diff > 12,
    `la zona del ratón es casi idéntica a la cámara sola: ${captura.diff.toFixed(1)}/255`));

revisarGuardado('shot', await caminoDeGuardado('shot'));

// ---------------------------------------------------------------------------
// Que el ratón SE PUEDA MOVER
// ---------------------------------------------------------------------------
// Con la pantalla del resultado todavía abierta, el toque cae en la foto y no en el
// visor: hay que volver a la cámara antes de probar los gestos.
await page.click('#shot-close');
await page.waitForTimeout(200);

// Esto se colaba entero: la prueba tocaba la pantalla para colocar al ratón pero nunca
// comprobaba que se hubiera movido, así que cuando el contenedor de la cámara empezó a
// tragarse los toques -ocupa la pantalla entera por encima del lienzo- el ratón se quedó
// clavado y la suite siguió en verde. Un gesto que no se comprueba es un gesto que no
// está probado.
const dondeCaeElToque = await page.evaluate(() => {
  const b = document.getElementById('visor').getBoundingClientRect();
  return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2).id;
});
check('el toque en el visor llega al lienzo, no al cromo de la cámara', () =>
  assert.equal(dondeCaeElToque, 'stage',
    `el toque se lo queda "${dondeCaeElToque}": el ratón no se va a poder arrastrar`));

const donde = () => page.evaluate(() => {
  const s = document.getElementById('sticker');
  return { x: parseFloat(s.style.left), y: parseFloat(s.style.top),
           alto: parseFloat(s.style.height) };
});
const visorCaja = await page.evaluate(() => {
  const b = document.getElementById('visor').getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});
const centroX = Math.round(visorCaja.x + visorCaja.w / 2);
const centroY = Math.round(visorCaja.y + visorCaja.h / 2);

const antesDeArrastrar = await donde();
await page.mouse.move(centroX, centroY);
await page.mouse.down();
await page.mouse.move(centroX - 90, centroY - 70, { steps: 8 });
await page.mouse.up();
const trasArrastrar = await donde();
check('arrastrar mueve al ratón', () => {
  assert(Math.abs(trasArrastrar.x - antesDeArrastrar.x) > 40,
    `no se movió en horizontal: ${antesDeArrastrar.x} → ${trasArrastrar.x}`);
  assert(Math.abs(trasArrastrar.y - antesDeArrastrar.y) > 40,
    `no se movió en vertical: ${antesDeArrastrar.y} → ${trasArrastrar.y}`);
});

// El pellizco a mano: Playwright no tiene gesto de dos dedos, así que se mandan los dos
// punteros al lienzo, que es exactamente lo que hace el navegador.
await page.evaluate(([x, y]) => {
  const stage = document.getElementById('stage');
  stage.setPointerCapture = () => {};
  const ev = (t, id, cx, cy) => stage.dispatchEvent(new PointerEvent(t, {
    pointerId: id, clientX: cx, clientY: cy, bubbles: true, pointerType: 'touch' }));
  ev('pointerdown', 1, x - 40, y); ev('pointerdown', 2, x + 40, y);
  ev('pointermove', 1, x - 100, y); ev('pointermove', 2, x + 100, y);
  ev('pointerup', 1, x - 100, y); ev('pointerup', 2, x + 100, y);
}, [centroX, centroY]);
await page.waitForTimeout(150);
const trasPellizcar = await donde();
check('pellizcar cambia el tamaño del ratón', () =>
  assert(trasPellizcar.alto > trasArrastrar.alto * 1.3,
    `el tamaño no cambió: ${trasArrastrar.alto} → ${trasPellizcar.alto}`));

// Se sale por la ✕ de la cámara y no por el botón de casa de la app: en FOTO el cromo
// de la app no existe, que es precisamente lo que la hace parecer una cámara.
await page.click('#foto-salir');
const deFotoAInicio = await page.isVisible('#ui-inicio');
check('foto vuelve al principio por la salida de la cámara', () => assert(deFotoAInicio));

console.log('carta del Ratón');
// Lo que hay que demostrar es que la carta se RELLENA y sale del formulario convertida
// en un archivo: el nombre del peque tiene que acabar dibujado en el lienzo, y la hoja
// que se manda a la impresora no puede llevar interfaz encima.
await page.click('#go-cert');
await page.waitForSelector('#cert:not([hidden])', { timeout: 10_000 });

const lienzoCert = () => page.evaluate(() => {
  const c = document.getElementById('cert-canvas');
  return { w: c.width, h: c.height, datos: c.toDataURL('image/png').length };
});
const paso = () => page.getAttribute('#cert', 'data-paso');

// Se entra por los DATOS, no por el documento.
const pasoInicial = await paso();
const docOculto = !(await page.isVisible('#cert-doc'));
const generarApagado = await page.isDisabled('#cert-generar');
check('se entra por el formulario, con el documento aún sin generar', () => {
  assert.equal(pasoInicial, 'datos');
  assert(docOculto, 'el documento se ve antes de rellenar nada');
});
// Sin nombre no hay certificado: el botón no deja pasar.
check('sin nombre no se puede generar', () => assert(generarApagado));

await page.fill('#cert-nombre', 'Lucía');
await page.fill('#cert-premio', 'Una moneda');
await page.click('#cert-estado .chip:nth-child(2)');
const generarEncendido = !(await page.isDisabled('#cert-generar'));
check('con nombre ya se puede generar', () => assert(generarEncendido));
await shot('9_certificado_datos');

await page.click('#cert-generar');
await page.waitForTimeout(600);
const pasoFinal = await paso();
const lleno = await lienzoCert();
check('al generar se pasa al documento', () => assert.equal(pasoFinal, 'documento'));
check('la carta es A4 a 150 ppp', () =>
  assert.equal(`${lleno.w}x${lleno.h}`, '1240x1754'));
await shot('10_certificado_documento');

// El documento lleva lo que se escribió: con otro nombre tiene que salir otro dibujo.
await page.click('#cert-volver');
const vuelveConDatos = await page.inputValue('#cert-nombre');
check('volver a los datos conserva lo escrito', () => assert.equal(vuelveConDatos, 'Lucía'));
await page.fill('#cert-nombre', 'Mateo');
await page.click('#cert-generar');
await page.waitForTimeout(600);
const otro = await lienzoCert();
check('el documento se genera con los datos del formulario', () =>
  assert.notEqual(otro.datos, lleno.datos, 'cambiar el nombre no cambió la carta'));

// ---------------------------------------------------------------------------
// Las palabras del padre
// ---------------------------------------------------------------------------
// Dos cosas distintas que comprobar: que se ESCRIBEN dentro de la carta como un párrafo
// más, y que el LÍMITE de caracteres es de verdad -que una nota de exactamente ese largo
// cabe en el papel sin llegar a la despedida-. El límite salió de medir, y esta
// comprobación es lo que impide que se quede obsoleto cuando alguien toque un tamaño.
await page.click('#cert-volver');

// ---------------------------------------------------------------------------
// Validación del formulario
// ---------------------------------------------------------------------------
// Todos los campos tienen tope y todos los topes salen del MÓDULO DEL DIBUJO, que es
// quien sabe cuánto cabe en el papel. Lo que hay que demostrar es que el formulario y el
// papel siguen diciendo lo mismo: escritos a mano en los dos sitios se separan en cuanto
// alguien toca un tamaño, y el que se queda corto siempre es el del formulario.
const limites = await page.evaluate(async () =>
  (await import('./js/certificate.js')).LIMITES);
const limite = limites.nota;

const topes = await page.evaluate(() => ({
  nombre: document.getElementById('cert-nombre').maxLength,
  premio: document.getElementById('cert-premio').maxLength,
  nota: document.getElementById('cert-nota').maxLength,
  fechaMin: document.getElementById('cert-fecha').min,
  fechaMax: document.getElementById('cert-fecha').max,
}));
check('los tres campos de texto llevan el tope del papel', () => {
  assert.equal(topes.nombre, limites.nombre, 'el nombre no coincide con el papel');
  assert.equal(topes.premio, limites.premio, 'el premio no coincide con el papel');
  assert.equal(topes.nota, limites.nota, 'la nota no coincide con el papel');
  assert(limite >= 200, `el límite de la nota se quedó en nada: ${limite}`);
});
check('la fecha está acotada a un rango con sentido', () => {
  assert(topes.fechaMin && topes.fechaMax, 'la fecha no tiene rango: vale cualquier año');
  const dias = (new Date(topes.fechaMax) - new Date(topes.fechaMin)) / 86400000;
  assert(Math.abs(dias - limites.dias) <= 1, `el rango son ${dias} días, no ${limites.dias}`);
  assert.equal(topes.fechaMax, new Date().toISOString().slice(0, 10),
    'se puede fechar la carta en el futuro: un diente no se cae mañana');
});

// Una fecha fuera de rango se puede TECLEAR aunque haya min y max: el navegador no la
// rechaza, solo la marca. Si no se corrige, la carta sale fechada en 1901.
await page.fill('#cert-fecha', '2999-12-31');
await page.dispatchEvent('#cert-fecha', 'change');
const fechaCorregida = await page.inputValue('#cert-fecha');
check('una fecha imposible se corrige sola', () =>
  assert.equal(fechaCorregida, topes.fechaMax,
    `se quedó en ${fechaCorregida}: el rango no se está aplicando a lo tecleado`));

// El botón apagado tiene que DECIR por qué. Un botón mudo se lee como una app rota.
await page.fill('#cert-nombre', '   ');
await page.dispatchEvent('#cert-nombre', 'blur');
const conEspacios = await page.evaluate(() => ({
  apagado: document.getElementById('cert-generar').disabled,
  aviso: !document.getElementById('cert-nombre-aviso').hidden,
}));
check('un nombre de solo espacios no cuela, y se explica por qué', () => {
  assert(conEspacios.apagado, 'tres espacios pasan por nombre');
  assert(conEspacios.aviso, 'el botón se apaga sin decir qué falta');
});

// Lo que se pega o se mete desde el código se salta el maxlength del navegador. El
// dibujo es la última línea de defensa y tiene que recortar por su cuenta.
const desbordado = await page.evaluate(async (lim) => {
  const { drawCertificate, limpiar, LIMITES } = await import('./js/certificate.js');
  const lienzo = document.createElement('canvas');
  const bestia = { nombre: 'N'.repeat(400), fecha: '2026-09-11', diente: 'muela',
                   estado: 'super', premio: 'P'.repeat(400), nota: 'x '.repeat(4000) };
  return {
    caja: drawCertificate(lienzo, bestia).__caja,
    limpio: limpiar('  hola\n\nqué   tal  ', LIMITES.nombre),
    recortado: limpiar('N'.repeat(400), LIMITES.nombre).length,
  };
}, limites);
check('un texto desbordado no rompe el dibujo', () => {
  assert(desbordado.caja.cabe,
    'con campos gigantes la carta se sale: el dibujo no está recortando');
  assert.equal(desbordado.limpio, 'hola qué tal',
    `limpiar() no junta los espacios ni quita los saltos: "${desbordado.limpio}"`);
  assert.equal(desbordado.recortado, limites.nombre, 'limpiar() no recorta al límite');
});

// El peor caso: la muela lleva la frase más larga, y el premio va al máximo del campo.
const PEOR = {
  nombre: 'Maximiliano', diente: 'muela', estado: 'super', premio: 'M'.repeat(24),
};
const caja = await page.evaluate(async ({ datos, n }) => {
  const { drawCertificate, LIMITES } = await import('./js/certificate.js');
  const palabras = ('felicidades te portaste muy bien en el colegio este trimestre te he ' +
    'visto haciendo las tareas aprendiendo inglés continúa así orgulloso lograr').split(' ');
  let nota = '';
  while (nota.length < n) nota += (nota ? ' ' : '') + palabras[nota.length % palabras.length];
  const lienzo = document.createElement('canvas');
  const sin = drawCertificate(lienzo, { ...datos, fecha: '2026-09-11', nota: '' }).__caja;
  const con = drawCertificate(lienzo, { ...datos, fecha: '2026-09-11',
                                        nota: nota.slice(0, LIMITES.nota) }).__caja;
  return { sin, con };
}, { datos: PEOR, n: limite + 40 });

console.log(`  peor caso: sin nota acaba en ${caja.sin.fin}, con ${limite} acaba en ${caja.con.fin}`);
check('una nota del largo máximo sigue cabiendo en el peor caso', () => {
  assert(caja.con.cabe,
    `con ${limite} caracteres la carta se sale: la posdata cae en ${caja.con.fin}`);
  assert(caja.con.tam >= 28, `la letra se encogió por debajo del suelo: ${caja.con.tam}px`);
  assert(caja.con.fin > caja.sin.fin, 'la nota no ha alargado la carta: ¿se está dibujando?');
});

// Que la nota salga DENTRO de la carta y no como una cita aparte no se puede afirmar
// mirando píxeles, pero sí se puede comprobar lo que la delataría: que el dibujo cambia
// al escribirla, y que no se le añaden comillas por el camino.
const fuenteDelDibujo = await page.evaluate(async () =>
  (await fetch('js/certificate.js')).text());
check('las palabras del padre van sin comillas ni cursiva', () => {
  assert(!/[«»]/.test(fuenteDelDibujo), 'el dibujo todavía mete comillas angulares');
  assert(/if \(nota\) ps\.push\(nota\)/.test(fuenteDelDibujo),
    'la nota ya no entra como un párrafo más de la carta');
});

await page.fill('#cert-nombre', 'Mateo');
await page.click('#cert-generar');
await page.waitForTimeout(600);

const guardado = await caminoDeGuardado('cert');
revisarGuardado('cert', guardado);
const href = await page.getAttribute('#cert-save', 'href');
check('la carta se puede descargar', () =>
  assert(href?.startsWith('blob:'), `href inesperado: ${href}`));

// La hoja impresa: el certificado y nada más.
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(200);
const impreso = await page.evaluate(() => {
  const visible = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  return { canvas: visible('#cert-canvas'), form: visible('#cert-form'),
           acciones: visible('#cert-actions'), barra: visible('#bar') };
});
await page.emulateMedia({ media: 'screen' });
check('al imprimir solo va la carta', () => {
  assert(impreso.canvas, 'la carta no se imprime');
  for (const [k, v] of Object.entries(impreso)) {
    if (k !== 'canvas') assert(!v, `"${k}" se cuela en el papel`);
  }
});

// Se cierra DESDE EL DOCUMENTO: al partir el flujo en dos, el botón de cerrar se quedó
// solo en el paso de los datos y el documento no tenía salida. Lo cazó esta prueba.
const cerrarVisibleEnDoc = await page.isVisible('#cert-close');
await page.click('#cert-close');
const certCerrado = !(await page.isVisible('#cert'));
check('la carta se cierra desde el documento', () => {
  assert(cerrarVisibleEnDoc, 'no hay forma de cerrar el documento');
  assert(certCerrado);
});

await browser.close();

console.log();
if (problems.length) {
  console.log('PROBLEMAS EN LA PÁGINA:');
  for (const p of problems) console.log(`  ${p}`);
}
const total = failures + problems.length;
console.log(total === 0 ? 'TODO OK' : `${total} problema(s)`);
process.exit(total === 0 ? 0 : 1);
