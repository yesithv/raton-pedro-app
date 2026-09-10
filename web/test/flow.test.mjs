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
// El personaje tiene que estar realmente dibujado, no solo "sin errores": se compara la
// zona donde cae con la misma zona del fondo.
const contrast = await page.evaluate(() => {
  const c = document.getElementById('stage');
  const gl = c.getContext('webgl2');
  const read = (x, y, w, h) => {
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) {
      sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    }
    return sum / (w * h) / 255;
  };
  const w = Math.round(c.width * 0.12);
  const h = Math.round(c.height * 0.10);
  return {
    personaje: read(Math.round(c.width * 0.44), Math.round(c.height * 0.24), w, h),
    fondo: read(Math.round(c.width * 0.08), Math.round(c.height * 0.24), w, h),
  };
});
console.log(`  luma personaje ${contrast.personaje.toFixed(4)} · fondo ${contrast.fondo.toFixed(4)}`);
check('el personaje se distingue del fondo', () =>
  assert(Math.abs(contrast.personaje - contrast.fondo) > 0.01,
    `sin contraste: ${JSON.stringify(contrast)}`));

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

console.log('navegación');
await page.click('#clip-close');
await page.click('#back');
const back = await page.textContent('#step-title');
check('atrás vuelve a EDITAR', () => assert.equal(back, 'EDITAR'));
await page.click('#home');
const atHome = await page.isVisible('#ui-inicio');
check('inicio vuelve al principio', () => assert(atHome));

await browser.close();

console.log();
if (problems.length) {
  console.log('PROBLEMAS EN LA PÁGINA:');
  for (const p of problems) console.log(`  ${p}`);
}
const total = failures + problems.length;
console.log(total === 0 ? 'TODO OK' : `${total} problema(s)`);
process.exit(total === 0 ? 0 : 1);
