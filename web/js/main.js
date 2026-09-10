import { Compositor } from "./compositor.js";
import { SceneAnalyzer, ParamSolver } from "./analyzer.js";

const EFFECT = "assets/portal_placeholder";
const ANALYZE_EVERY = 10; // misma cadencia que el dispositivo (seccion 2 de la arquitectura)

const el = (id) => document.getElementById(id);

const state = {
  meta: null,
  transform: { x: 0.5, y: 0.72, scaleFactor: 0.35 },
  playing: false,
  frame: 0,
  fps: 0,
  cfg: {
    // Valores de arranque para un cuarto CON algo de luz (lamparita, luz de pasillo).
    // Para oscuridad total hay que bajar el piso y aceptar la discusion de realismo
    // contra legibilidad. Ver docs/receta-grading.md.
    key: 1.15,
    exposureMin: 0.5, exposureMax: 1.4,
    grainMin: 0.015, grainMax: 0.09,
    softness: 0.8,
    smoothing: 0.15,
    limitedRange: false,
    manual: false,
    manualExposure: 1.0, manualGrain: 0.03,
  },
};

let compositor, analyzer, solver, cameraVideo, overlayVideo;

function fail(msg) {
  el("error").textContent = msg;
  el("error").hidden = false;
  console.error(msg);
}

// ---------------------------------------------------------------------------
// Geometria del overlay
// ---------------------------------------------------------------------------

function overlayRect(canvasW, canvasH) {
  const [tw, th] = state.meta.trackSize;
  const scaleY = state.transform.scaleFactor;
  const scaleX = (scaleY * canvasH * (tw / th)) / canvasW;
  const [ax, ay] = state.meta.anchorPoint;
  return {
    originX: state.transform.x - ax * scaleX,
    originY: state.transform.y - ay * scaleY,
    scaleX,
    scaleY,
  };
}

/** Rectangulo del overlay llevado a coords de TEXTURA de camara, para el analyzer. */
function toCameraRect(rect, camVideo, canvasW, canvasH) {
  const fit = Compositor.coverFit(camVideo.videoWidth, camVideo.videoHeight, canvasW, canvasH);
  const map = (v, i) => Math.min(1, Math.max(0, v * fit.scale[i] + fit.offset[i]));
  return {
    x0: map(rect.originX, 0), x1: map(rect.originX + rect.scaleX, 0),
    y0: map(rect.originY, 1), y1: map(rect.originY + rect.scaleY, 1),
  };
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

async function boot() {
  state.meta = await (await fetch(`${EFFECT}.json`)).json();

  compositor = new Compositor(el("stage"));
  await compositor.init();

  analyzer = new SceneAnalyzer();
  solver = new ParamSolver(state.cfg);

  overlayVideo = el("overlay");
  await loadOverlaySource();
  overlayVideo.addEventListener("ended", () => {
    state.playing = false;
    goToPose();
    el("play").textContent = "Reproducir";
  });

  cameraVideo = el("camera");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false, // el MVP no graba microfono. Ver seccion 4 de la arquitectura.
  });
  cameraVideo.srcObject = stream;
  await cameraVideo.play();
  await overlayVideo.play().catch(() => {});
  overlayVideo.pause();
  goToPose();

  el("boot").hidden = true;
  el("hud").hidden = false;
  requestAnimationFrame(loop);
}

/**
 * Carga el asset empaquetado. H.264 primero, VP9 como respaldo.
 *
 * Ningun telefono real necesita el respaldo: iOS Safari y Chrome Android decodifican
 * H.264 por hardware. Existe porque hay builds de Chromium y de Firefox compilados sin
 * los codecs propietarios, y en esos el <video> falla en silencio con "no supported
 * sources" — que se ve identico a "el shader no dibuja nada".
 */
async function loadOverlaySource() {
  const candidates = [`${EFFECT}.mp4`, `${EFFECT}.webm`];
  let lastError = null;
  for (const src of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const onOk = () => { cleanup(); resolve(); };
        const onErr = () => { cleanup(); reject(new Error(`no reproducible: ${src}`)); };
        const cleanup = () => {
          overlayVideo.removeEventListener("loadeddata", onOk);
          overlayVideo.removeEventListener("error", onErr);
        };
        overlayVideo.addEventListener("loadeddata", onOk, { once: true });
        overlayVideo.addEventListener("error", onErr, { once: true });
        overlayVideo.src = src;
        overlayVideo.load();
      });
      state.overlaySource = src;
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`No pude cargar el asset del efecto.\n${lastError?.message ?? ""}`);
}

/** Pose estatica para posicionar: un frame donde el personaje ya esta presente. */
function goToPose() {
  if (overlayVideo.duration) overlayVideo.currentTime = overlayVideo.duration * 0.72;
}

// ---------------------------------------------------------------------------
// Bucle de render
// ---------------------------------------------------------------------------

let lastT = performance.now(), frames = 0, fpsT = lastT;

function loop(now) {
  requestAnimationFrame(loop);
  if (cameraVideo.readyState < 2) return;

  const rect = el("stage").getBoundingClientRect();
  const { w, h } = compositor.resize(rect.width, rect.height, window.devicePixelRatio || 1);
  const ov = overlayRect(w, h);

  if (state.frame % ANALYZE_EVERY === 0) {
    const measured = analyzer.measure(cameraVideo, toCameraRect(ov, cameraVideo, w, h));
    solver.update(measured, state.meta.referenceLuma ?? 0.5);
  }

  const params = state.cfg.manual
    ? { exposure: state.cfg.manualExposure, grain: state.cfg.manualGrain }
    : { exposure: solver.exposure, grain: solver.grain };

  compositor.render({
    cameraVideo,
    overlayVideo: overlayVideo.readyState >= 2 ? overlayVideo : null,
    transform: ov,
    params: { ...params, softness: state.cfg.softness, limitedRange: state.cfg.limitedRange },
    timeSec: now / 1000,
  });

  state.frame++;
  frames++;
  if (now - fpsT > 500) {
    state.fps = (frames * 1000) / (now - fpsT);
    frames = 0;
    fpsT = now;
    updateHud(params);
  }
}

function updateHud(params) {
  el("dbg").textContent =
    `fps ${state.fps.toFixed(0)}\n` +
    `uExposureMatch ${params.exposure.toFixed(3)}` +
    (state.cfg.manual ? " (manual)" : ` (crudo ${solver.rawExposure.toFixed(3)})`) + "\n" +
    `uGrainAmount   ${params.grain.toFixed(4)}\n` +
    `uSoftness      ${state.cfg.softness.toFixed(2)}\n` +
    `escena luma    ${analyzer.last.sceneLuma.toFixed(3)}\n` +
    `escena sigma   ${analyzer.last.sigma.toFixed(4)}\n` +
    `referenceLuma  ${(state.meta.referenceLuma ?? 0).toFixed(4)}\n` +
    `escala         ${state.transform.scaleFactor.toFixed(2)}`;

  const clamping = !state.cfg.manual &&
    (solver.rawExposure < state.cfg.exposureMin || solver.rawExposure > state.cfg.exposureMax);
  el("clamp-warn").hidden = !clamping;
}

// ---------------------------------------------------------------------------
// Interaccion
// ---------------------------------------------------------------------------

function setupGestures() {
  const stage = el("stage");
  const pointers = new Map();
  let pinchStart = null;

  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);
    if (pointers.size === 1) placeAt(e);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
                     scale: state.transform.scaleFactor };
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (pointers.size === 1) placeAt(e);
    else if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      state.transform.scaleFactor = Math.min(0.9, Math.max(0.08,
        pinchStart.scale * (d / Math.max(pinchStart.dist, 1))));
    }
  });

  const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = null; };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);

  function placeAt(e) {
    const r = stage.getBoundingClientRect();
    state.transform.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    state.transform.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  }
}

function play() {
  if (state.playing) {
    overlayVideo.pause();
    state.playing = false;
    el("play").textContent = "Reproducir";
    return;
  }
  overlayVideo.currentTime = 0;
  overlayVideo.play();
  state.playing = true;
  el("play").textContent = "Pausar";
}

function capturePhoto() {
  el("stage").toBlob((blob) => {
    if (!blob) return fail("No pude capturar el lienzo.");
    const url = URL.createObjectURL(blob);
    const img = el("shot-img");
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = url;
    el("shot").hidden = false;
    el("shot-save").href = url;
    el("shot-share").hidden = !navigator.canShare;
    el("shot-share").onclick = async () => {
      const file = new File([blob], "raton-perez.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
    };
  }, "image/png");
}

function setupControls() {
  el("play").onclick = play;
  el("photo").onclick = capturePhoto;
  el("shot-close").onclick = () => { el("shot").hidden = true; };
  el("dbg-toggle").onclick = () => { el("panel").hidden = !el("panel").hidden; };

  for (const [id, key, fmt] of [
    ["s-exp-min", "exposureMin", (v) => v.toFixed(2)],
    ["s-exp-max", "exposureMax", (v) => v.toFixed(2)],
    ["s-key", "key", (v) => v.toFixed(2)],
    ["s-softness", "softness", (v) => v.toFixed(2)],
    ["s-grain-max", "grainMax", (v) => v.toFixed(3)],
  ]) {
    const input = el(id);
    const out = el(`${id}-v`);
    input.value = state.cfg[key];
    out.textContent = fmt(state.cfg[key]);
    input.oninput = () => {
      state.cfg[key] = parseFloat(input.value);
      out.textContent = fmt(state.cfg[key]);
    };
  }
  el("s-limited").onchange = (e) => { state.cfg.limitedRange = e.target.checked; };
}

el("start").onclick = async () => {
  el("start").disabled = true;
  el("start").textContent = "Abriendo cámara…";
  try {
    setupGestures();
    setupControls();
    await boot();
  } catch (e) {
    el("start").disabled = false;
    el("start").textContent = "Reintentar";
    fail(`${e.message}\n\nLa cámara necesita HTTPS (o localhost) y permiso del navegador.`);
  }
};
