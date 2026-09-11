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
page.on('response', (r) => { if (!r.ok()) problems.push(`http ${r.status()}: ${r.url()}`); });

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

console.log('temas');
// Se prueba ANTES de encender la cámara porque ahí es donde vive el conmutador y donde
// el usuario lo usa: eligiendo con qué luz quiere la app antes de empezar.
// Dos temas y tres estados. Lo que hay que demostrar es que el tema CAMBIA de verdad
// (no solo que el atributo se pone), que el ciclo vuelve a "automático" y que la elección
// sobrevive a recargar, que es lo que un usuario nota si falla.
const estadoTema = () => page.evaluate(() => ({
  tema: document.documentElement.dataset.tema || 'auto',
  fondo: getComputedStyle(document.body).backgroundColor,
  texto: getComputedStyle(document.body).color,
}));

const ciclo = [];
for (let i = 0; i < 4; i++) {
  ciclo.push(await estadoTema());
  await page.click('#tema');
  await page.waitForTimeout(120);
}

console.log(`  ciclo: ${ciclo.map((e) => `${e.tema}=${e.fondo}`).join(' → ')}`);
check('el conmutador recorre automático, claro y oscuro', () =>
  assert.deepEqual(ciclo.map((e) => e.tema), ['auto', 'claro', 'oscuro', 'auto']));
check('el tema oscuro cambia los colores de verdad', () => {
  const claro = ciclo.find((e) => e.tema === 'claro');
  const oscuro = ciclo.find((e) => e.tema === 'oscuro');
  assert.notEqual(claro.fondo, oscuro.fondo, 'el fondo no cambió entre temas');
  assert.notEqual(claro.texto, oscuro.texto, 'el texto no cambió entre temas');
});

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

const hud = await page.evaluate(() => {
  document.getElementById('dbg-toggle').click();
  return new Promise((r) => setTimeout(() => r(document.getElementById('dbg').textContent), 900));
});
const exposure = hud.match(/uExposureMatch ([\d.]+) ([\d.]+) ([\d.]+)/);
check('SceneAnalyzer resuelve un vec3 de exposición', () => {
  assert(exposure, `el HUD no trae uExposureMatch:\n${hud}`);
  for (const v of exposure.slice(1)) {
    assert(Number(v) > 0 && Number(v) < 3, `exposición fuera de rango: ${v}`);
  }
});

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
await page.click('#dbg-toggle');
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
  // Caja donde quedó el ratón: anclado por los pies en (0.5, 0.717) y con una altura de
  // 0.45 de la pantalla, el cuerpo cae en el tercio central.
  const box = [Math.round(c.width * 0.36), Math.round(c.height * 0.40),
               Math.round(c.width * 0.28), Math.round(c.height * 0.25)];
  ctx.drawImage(img, 0, 0);
  const conRaton = ctx.getImageData(...box).data;
  ctx.drawImage(stage, 0, 0);          // el lienzo NO lleva el ratón: es solo la cámara
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
check('el ratón está DENTRO de la foto, no solo en pantalla', () =>
  assert(captura.diff > 12,
    `la zona del ratón es casi idéntica a la cámara sola: ${captura.diff.toFixed(1)}/255`));

revisarGuardado('shot', await caminoDeGuardado('shot'));

await page.click('#shot-close');
await page.click('#home');
const deFotoAInicio = await page.isVisible('#ui-inicio');
check('foto vuelve al principio', () => assert(deFotoAInicio));

console.log('certificado');
// Lo que hay que demostrar es que el certificado se RELLENA y sale del formulario
// convertido en un archivo: el nombre del peque tiene que acabar dibujado en el lienzo,
// y la hoja que se manda a la impresora no puede llevar interfaz encima.
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
check('el certificado es A4 a 150 ppp', () =>
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
  assert.notEqual(otro.datos, lleno.datos, 'cambiar el nombre no cambió el certificado'));

const guardado = await caminoDeGuardado('cert');
revisarGuardado('cert', guardado);
const href = await page.getAttribute('#cert-save', 'href');
check('el certificado se puede descargar', () =>
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
check('al imprimir solo va el certificado', () => {
  assert(impreso.canvas, 'el certificado no se imprime');
  for (const [k, v] of Object.entries(impreso)) {
    if (k !== 'canvas') assert(!v, `"${k}" se cuela en el papel`);
  }
});

// Se cierra DESDE EL DOCUMENTO: al partir el flujo en dos, el botón de cerrar se quedó
// solo en el paso de los datos y el documento no tenía salida. Lo cazó esta prueba.
const cerrarVisibleEnDoc = await page.isVisible('#cert-close');
await page.click('#cert-close');
const certCerrado = !(await page.isVisible('#cert'));
check('el certificado se cierra desde el documento', () => {
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
