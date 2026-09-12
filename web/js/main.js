import { Compositor } from "./compositor.js";
import { SceneAnalyzer, ParamSolver } from "./analyzer.js";
import { CanvasRecorder, isSupported as recSupported } from "./recorder.js";
import { STEPS } from "./flow.js";
import { drawCertificate, dientes, estados, LIMITES, limpiar,
         SIZE as CERT_SIZE } from "./certificate.js";
import { t, IDIOMAS, idioma, idiomaInicial, fijarIdioma } from "./i18n.js";

const ANALYZE_EVERY = 10;   // misma cadencia que el dispositivo (seccion 2 de la arquitectura)
const OFFSCREEN = 10.0;     // origen del overlay cuando no debe verse: el shader lo descarta

const el = (id) => document.getElementById(id);

// Valores de fabrica. Estan aqui y no dentro de `state` porque "Restablecer" necesita
// poder volver a ellos, y un objeto que se muta no se acuerda de como empezo.
const CFG_DEFECTO = {
  // Arranque pensado para un cuarto CON algo de luz (lamparita, tira LED, pasillo).
  key: 1.15,
  whiteBalance: 0.5,
  exposureMin: 0.5, exposureMax: 1.4,
  grainMin: 0.015, grainMax: 0.09,
  softness: 0.8,
  smoothing: 0.15,
  limitedRange: false,
  mic: true,          // la narracion en vivo del padre es funcion, no ruido
  rejilla: true,      // los tercios sobre el visor: ayudan a colocar al raton
  manual: false,
  manualExposure: 1.0, manualGrain: 0.03,
};

const state = {
  step: "inicio",
  catalog: [],
  fxIndex: 0,
  meta: null,
  transform: { x: 0.5, y: 0.72, scaleFactor: 0.35 },
  facing: "environment",
  // Modo FOTO. Va aparte de transform a proposito: el encuadre de una foto con el nino
  // no tiene nada que ver con el del video del cuarto, y compartir estado obligaria a
  // recolocar el raton cada vez que se cambia de modo. y=1 es el borde inferior; el
  // raton se ancla por los pies.
  sticker: { x: 0.5, y: 0.94, h: 0.45, mirror: false },
  frame: 0,
  fps: 0,
  cfg: { ...CFG_DEFECTO },
};

let compositor, analyzer, solver, recorder, cameraVideo, overlayVideo, cameraTrack;

// Lo ultimo que se produjo, guardado para poder REPINTARLO en otro idioma. Un resultado en
// pantalla no se puede volver a generar -el clip tardo cuarenta segundos en grabarse- pero
// su linea de metadatos, sus botones y el nombre del archivo si se vuelven a escribir.
let ultimoClip = null;
const guardables = {};

function fail(msg) {
  el("error").textContent = msg;
  el("error").hidden = false;
  clearTimeout(fail._t);
  fail._t = setTimeout(() => { el("error").hidden = true; }, 6000);
  console.error(msg);
}

function toast(msg) {
  el("toast").textContent = msg;
  el("toast").hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el("toast").hidden = true; }, 2600);
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
    scaleX, scaleY,
  };
}

/** Rectangulo del overlay llevado a coords de TEXTURA de camara, para el analyzer. */
function toCameraRect(rect, canvasW, canvasH) {
  const fit = Compositor.coverFit(cameraVideo.videoWidth, cameraVideo.videoHeight,
                                  canvasW, canvasH);
  const map = (v, i) => Math.min(1, Math.max(0, v * fit.scale[i] + fit.offset[i]));
  return {
    x0: map(rect.originX, 0), x1: map(rect.originX + rect.scaleX, 0),
    y0: map(rect.originY, 1), y1: map(rect.originY + rect.scaleY, 1),
  };
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

/**
 * El titulo y la pista del paso actual, en el idioma de ahora.
 *
 * Aparte de setStep() porque hay dos motivos para repintarlos y solo uno es cambiar de
 * paso: el otro es cambiar de idioma sin moverse del sitio. `flow.js` ya no guarda
 * textos, asi que las claves salen del NOMBRE del paso.
 */
function pintarPaso() {
  const nombre = state.step;
  const pista = t(`pasos.${nombre}.pista`);
  el("step-title").textContent = t(`pasos.${nombre}.titulo`);
  el("hint").textContent = pista;
  // En FOTO la pista no es una caja fija sino una pastilla que se va sola: ahi el hueco
  // de arriba lo ocupa el visor, y una caja de instrucciones tapa lo unico que hay que
  // mirar.
  el("hint").hidden = !pista || nombre === "foto" || !!recorder?.isRecording;
  if (nombre === "foto") mostrarPista(pista);
  return pista;
}

function setStep(name) {
  const step = STEPS[name];
  const previous = state.step;
  state.step = name;

  // FOTO no lleva el cromo de la app: lleva el suyo, que es el de una camara. Una barra
  // de navegacion encima del visor es justo lo que delata que no lo es.
  const enFoto = name === "foto";
  pintarPaso();
  el("reticle").hidden = !step.reticle;
  el("chrome").hidden = name === "inicio" || enFoto;
  el("bar").hidden = enFoto;
  el("inicio-head").hidden = name !== "inicio";   // el titular solo vive en INICIO
  el("back").hidden = !step.back;

  // El engranaje de los AJUSTES solo en INICIO (y en el arranque, que no pasa por aqui).
  // En los pasos de la camara su sitio -arriba a la derecha- lo ocupa CERRAR, y la
  // convencion de las esquinas manda: dos cosas distintas en el mismo punto de la
  // pantalla segun el paso es justo lo que obliga a mirar antes de tocar.
  el("ajustes-abrir").hidden = name !== "inicio";
  // Y las opciones de CAMARA solo dentro de la camara: en INICIO no hay escena que mirar
  // mientras se mueve un deslizador, que es lo unico que los hace utiles.
  el("camopts-bar").hidden = name === "inicio" || enFoto;

  for (const k of Object.keys(STEPS)) el(`ui-${k}`).hidden = k !== name;

  overlayVideo.loop = !!step.loop;
  if (step.loop) overlayVideo.play().catch(() => {});
  else overlayVideo.pause();

  el("sticker").hidden = !step.sticker;
  if (step.sticker) positionSticker();
  if (step.reticle) positionReticle();

  // La camara frontal pertenece al paso FOTO y solo a el. Se cambia aqui y no en el
  // manejador del boton porque a FOTO se entra por un camino pero se sale por tres
  // (atras, inicio y el propio boton de cambiar camara).
  if (name === "foto" && previous !== "foto") setCamera("user");
  else if (previous === "foto" && name !== "foto") setCamera("environment");
}

/**
 * La caja contra la que se mide el raton del paso FOTO.
 *
 * Es el VISOR y no la pantalla entera, y eso es lo que hace que lo que se ve sea lo que
 * se guarda: si se midiera contra la pantalla, el raton se podria arrastrar a las bandas
 * -donde el velo lo tapa- y ademas la foto, que se recorta al visor, se lo comeria.
 */
function cajaFoto() {
  const v = el("visor");
  const r = v.getBoundingClientRect();
  return r.height > 0 ? r : el("stage").getBoundingClientRect();
}

/**
 * El aviso del paso FOTO: una pastilla que se desvanece a los cuatro segundos.
 *
 * La caja de instrucciones tapaba justo lo que hay que mirar -la cama, el suelo, el
 * nino- y se leia entera cada noche aunque fuera la quinta vez. En una camara canta el
 * doble: ninguna camara del mundo te explica como se hace una foto encima de la foto.
 */
function mostrarPista(texto) {
  const n = el("cam-pista");
  n.textContent = texto.split("\n")[0];
  n.classList.remove("ido");
  clearTimeout(mostrarPista._t);
  mostrarPista._t = setTimeout(() => n.classList.add("ido"), 4000);
}

function positionSticker() {
  const r = cajaFoto();
  const n = el("sticker");
  n.style.height = `${state.sticker.h * r.height}px`;
  n.style.left = `${r.left + state.sticker.x * r.width}px`;
  n.style.top = `${r.top + state.sticker.y * r.height}px`;
  n.classList.toggle("mirror", state.sticker.mirror);
}

function positionReticle() {
  const r = el("stage").getBoundingClientRect();
  const n = el("reticle");
  n.style.left = `${state.transform.x * r.width}px`;
  n.style.top = `${state.transform.y * r.height}px`;
}

/** Vuelve al bucle de vista previa tras grabar. */
function resumeLoop() {
  if (!STEPS[state.step].loop) return;
  overlayVideo.loop = true;
  overlayVideo.play().catch(() => {});
}

// ---------------------------------------------------------------------------
// Catalogo de efectos
// ---------------------------------------------------------------------------

/**
 * El nombre de la animacion que se esta enseñando.
 *
 * Se traduce POR ID y no dentro del asset: el `.json` que acompaña al video lo genera
 * `tools/build_effect.py` y describe el MATERIAL -fps, cuadros, luma de referencia-, no la
 * interfaz. Meter ahi tres titulos por idioma obligaria a regenerar los assets para
 * corregir una palabra. Si el id no esta traducido, se enseña el titulo del asset, que al
 * menos dice algo.
 */
function tituloEfecto(entry) {
  const traducido = t(`efectos.${entry.id}`);
  return traducido === `efectos.${entry.id}` ? (entry.title ?? "") : traducido;
}

function pintarEfecto() {
  const entry = state.catalog[state.fxIndex];
  if (entry) el("fx-title").textContent = tituloEfecto(entry);
}

async function loadEffect(index) {
  const entry = state.catalog[index];
  state.fxIndex = index;
  state.meta = await (await fetch(`${entry.base}.json`)).json();
  pintarEfecto();

  // H.264 primero, VP9 de respaldo: hay builds de Chromium y Firefox sin codecs
  // propietarios donde el <video> falla con "no supported sources", que en pantalla se
  // ve igual que si el shader no dibujara nada.
  let lastError = null;
  for (const src of [`${entry.base}.mp4`, `${entry.base}.webm`]) {
    try {
      await new Promise((resolve, reject) => {
        const ok = () => { off(); resolve(); };
        const err = () => { off(); reject(new Error(`no reproducible: ${src}`)); };
        const off = () => {
          overlayVideo.removeEventListener("loadeddata", ok);
          overlayVideo.removeEventListener("error", err);
        };
        overlayVideo.addEventListener("loadeddata", ok, { once: true });
        overlayVideo.addEventListener("error", err, { once: true });
        overlayVideo.src = src;
        overlayVideo.load();
      });
      solver = new ParamSolver(state.cfg);   // el asset cambio: reinicia el EMA
      return;
    } catch (e) { lastError = e; }
  }
  throw new Error(`${t("resultado.sinEfecto", { titulo: tituloEfecto(entry) })}\n` +
                  `${lastError?.message ?? ""}`);
}

async function cycleEffect(delta) {
  const n = state.catalog.length;
  try {
    await loadEffect((state.fxIndex + delta + n) % n);
    if (STEPS[state.step].loop) overlayVideo.play().catch(() => {});
  } catch (e) { fail(e.message); }
}

// ---------------------------------------------------------------------------
// Camara
// ---------------------------------------------------------------------------

/**
 * Abre la camara indicada y deja el <video> reproduciendo.
 *
 * Cierra la anterior ANTES de pedir la nueva: un movil sirve una sola camara a la vez,
 * y pedir la frontal con la trasera todavia abierta falla en iOS con NotReadableError.
 * El precio es que si la nueva no existe hay que reabrir la vieja, que es lo que hace
 * setCamera().
 */
async function openCamera(facing) {
  cameraVideo.srcObject?.getTracks().forEach((t) => t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing },
             width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,   // el microfono se pide aparte, solo al grabar
  });
  cameraVideo.srcObject = stream;
  cameraTrack = stream.getVideoTracks()[0];
  state.facing = facing;
  await cameraVideo.play();

  // La linterna es de la trasera: la frontal no la tiene y el boton sobra.
  el("torch").hidden = !(cameraTrack.getCapabilities?.().torch);
  el("torch").classList.remove("on");
}

/** Cambia de camara sin dejar la pantalla en negro si la nueva no se puede abrir. */
async function setCamera(facing) {
  if (state.facing === facing) return;
  const previous = state.facing;
  try {
    await openCamera(facing);
  } catch (e) {
    toast(t(facing === "user" ? "camara.sinFrontal" : "camara.sinTrasera"));
    try { await openCamera(previous); } catch (e2) { fail(e2.message); }
  }
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

async function boot() {
  state.catalog = (await (await fetch("assets/catalog.json")).json()).effects;

  compositor = new Compositor(el("stage"));
  await compositor.init();
  analyzer = new SceneAnalyzer();
  solver = new ParamSolver(state.cfg);

  overlayVideo = el("overlay");
  overlayVideo.addEventListener("ended", () => {
    if (recorder?.isRecording) stopRecording();
  });

  cameraVideo = el("camera");
  await openCamera("environment");

  await loadEffect(0);
  await overlayVideo.play().catch(() => {});
  overlayVideo.pause();

  recorder = new CanvasRecorder(el("stage"), 30);
  el("record").disabled = !recSupported();

  el("boot").hidden = true;
  el("bar").hidden = false;
  setStep("inicio");
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Bucle de render
// ---------------------------------------------------------------------------

let frames = 0, fpsT = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  if (!cameraVideo || cameraVideo.readyState < 2) return;

  const rect = el("stage").getBoundingClientRect();
  const { w, h } = compositor.resize(rect.width, rect.height, window.devicePixelRatio || 1);
  const showOverlay = STEPS[state.step].overlay;
  const ov = overlayRect(w, h);

  if (showOverlay && state.frame % ANALYZE_EVERY === 0) {
    const ref = state.meta.referenceColor ??
      Array(3).fill(state.meta.referenceLuma ?? 0.5);
    solver.update(analyzer.measure(cameraVideo, toCameraRect(ov, w, h)), ref);
  }

  const params = state.cfg.manual
    ? { exposure: Array(3).fill(state.cfg.manualExposure), grain: state.cfg.manualGrain }
    : { exposure: solver.exposure ?? [1, 1, 1], grain: solver.grain ?? 0 };

  compositor.render({
    cameraVideo,
    overlayVideo: overlayVideo.readyState >= 2 ? overlayVideo : null,
    // Fuera de pantalla en vez de un uniform de visibilidad: el shader ya descarta
    // cualquier fragmento cuyo ouv caiga fuera de [0,1].
    transform: showOverlay ? ov : { ...ov, originX: OFFSCREEN, originY: OFFSCREEN },
    params: { ...params, softness: state.cfg.softness, limitedRange: state.cfg.limitedRange },
    timeSec: now / 1000,
  });

  if (recorder?.isRecording) {
    el("rec-time").textContent = `${(recorder.elapsedMs / 1000).toFixed(1)}s`;
  }

  state.frame++;
  frames++;
  if (now - fpsT > 500) {
    state.fps = (frames * 1000) / (now - fpsT);
    frames = 0;
    fpsT = now;
    if (!el("camopts").hidden && !el("diagnostico").hidden) updateHud(params);
  }
}

/**
 * El HUD de diagnostico, y es lo UNICO de la app que no se traduce.
 *
 * No es un descuido: son los nombres reales de los uniforms del shader
 * (`uExposureMatch`, `uGrainAmount`) y los numeros que van a
 * `docs/receta-grading.md`. Quien los lee esta comparandolos con el codigo del nativo, y
 * un HUD traducido obligaria a traducir mentalmente de vuelta para buscar el uniform.
 */
function updateHud(params) {
  const e = params.exposure;
  const rgb = analyzer.last.sceneRgb ?? [0, 0, 0];
  const spread = Math.max(...e) / Math.max(Math.min(...e), 1e-3);
  el("dbg").textContent =
    `fps ${state.fps.toFixed(0)}   paso ${state.step}\n` +
    `uExposureMatch ${e.map((v) => v.toFixed(3)).join(" ")}\n` +
    `  ganancia     ${solver.rawExposure.toFixed(3)} crudo\n` +
    `  dominante    ${spread.toFixed(2)}x  (wb ${state.cfg.whiteBalance.toFixed(2)})\n` +
    `uGrainAmount   ${params.grain.toFixed(4)}\n` +
    `uSoftness      ${state.cfg.softness.toFixed(2)}\n` +
    `escena RGB     ${rgb.map((v) => v.toFixed(3)).join(" ")}\n` +
    `escena sigma   ${analyzer.last.sigma.toFixed(4)}\n` +
    `escala         ${state.transform.scaleFactor.toFixed(2)}`;

  const clamping = !state.cfg.manual &&
    (solver.rawExposure < state.cfg.exposureMin || solver.rawExposure > state.cfg.exposureMax);
  el("clamp-warn").hidden = !clamping;
  if (clamping) {
    el("clamp-warn").textContent = t("opciones.recorte");
  }
}

// ---------------------------------------------------------------------------
// Gestos: dependen del paso, como en el asistente de la referencia
// ---------------------------------------------------------------------------

function setupGestures() {
  const stage = el("stage");
  const pointers = new Map();
  let pinch = null;

  const norm = (e) => {
    const r = STEPS[state.step].sticker ? cajaFoto() : stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
                s: STEPS[state.step].sticker ? state.sticker.h : state.transform.scaleFactor };
    } else {
      apply(e);
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (pointers.size === 2 && pinch) {
      const g = STEPS[state.step].gesture;
      if (g !== "scale" && g !== "moveAndScale") return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const factor = d / Math.max(pinch.d, 1);
      if (g === "moveAndScale") {
        state.sticker.h = Math.min(1.6, Math.max(0.08, pinch.s * factor));
        positionSticker();
      } else {
        state.transform.scaleFactor = Math.min(0.9, Math.max(0.06, pinch.s * factor));
      }
    } else if (pointers.size === 1) {
      apply(e);
    }
  });

  const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);

  function apply(e) {
    const g = STEPS[state.step].gesture;
    const p = norm(e);
    if (g === "moveAndScale") {
      // En FOTO se arrastra el PNG, no el overlay del shader.
      state.sticker.x = clamp01(p.x);
      state.sticker.y = clamp01(p.y);
      positionSticker();
    } else if (g === "move") {
      state.transform.x = clamp01(p.x);
      state.transform.y = clamp01(p.y);
      positionReticle();
    } else if (g === "moveY" || g === "scale") {
      // La referencia solo deja ajustar arriba/abajo en el paso SUPERFICIE.
      state.transform.y = clamp01(p.y);
    }
  }
}

// ---------------------------------------------------------------------------
// Grabacion y foto
// ---------------------------------------------------------------------------

async function startRecording() {
  try {
    if (state.cfg.mic && !recorder.micEnabled && !(await recorder.enableMic())) {
      toast(t("opciones.micSinPermiso"));
    }
    recorder.start();
  } catch (e) { return fail(e.message); }

  // Grabar y reproducir son la misma accion, igual que startRecording() en el contrato
  // nativo (seccion 5 de la arquitectura).
  overlayVideo.loop = false;
  overlayVideo.currentTime = 0;
  overlayVideo.play();

  el("record").classList.add("on");
  el("hint").hidden = true;          // comparte posicion con el badge de grabacion
  el("rec-badge").hidden = false;
}

async function stopRecording() {
  let result;
  try { result = await recorder.stop(); }
  catch (e) { return fail(e.message); }
  finally {
    el("record").classList.remove("on");
    el("rec-badge").hidden = true;
    el("hint").hidden = !t(`pasos.${state.step}.pista`);
  }

  resumeLoop();

  const url = URL.createObjectURL(result.blob);
  const video = el("clip-video");
  if (video.src) URL.revokeObjectURL(video.src);
  video.src = url;
  el("clip").hidden = false;
  ultimoClip = { ...result, conMic: recorder.micEnabled };
  pintarMetaClip();

  // Arranca reproduciendo: MediaRecorder no escribe la duracion en el contenedor, asi
  // que el <video> no pinta ningun frame hasta reproducir y se veria un rectangulo
  // negro que parece una grabacion fallida.
  video.play().catch(() => {});

  const ext = CanvasRecorder.extensionFor(result.mimeType);
  el("clip-save").href = url;
  offerSave("clip", result.blob, () => `${t("resultado.archivoVideo")}.${ext}`,
    ext === "mp4" ? "resultado.pistaVideoMp4" : "resultado.pistaVideoWebm",
    "resultado.pistaVideoDescarga");
}

/** La linea de metadatos del clip. Aparte, porque tambien la repinta cambiar de idioma. */
function pintarMetaClip() {
  if (!ultimoClip) return;
  el("clip-meta").textContent =
    `${(ultimoClip.durationMs / 1000).toFixed(1)}s · ` +
    `${(ultimoClip.blob.size / 1e6).toFixed(1)} MB · ` +
    `${ultimoClip.mimeType.split(";")[0]} · ` +
    t(ultimoClip.conMic ? "resultado.conMic" : "resultado.sinAudio") +
    (CanvasRecorder.isAmbiguous(ultimoClip.requestedMimeType)
      ? ` · ${t("resultado.codecDudoso")}` : "");
}

function capturePhoto() {
  composeShot().toBlob((blob) => {
    if (!blob) return fail(t("resultado.sinLienzo"));
    const url = URL.createObjectURL(blob);
    const img = el("shot-img");
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = url;
    el("shot").hidden = false;
    el("shot-save").href = url;

    // La ultima foto, abajo a la izquierda, como el carrete del telefono.
    const mini = el("foto-ultima");
    mini.querySelector("img").src = url;
    mini.hidden = false;
    offerSave("shot", blob, () => t("resultado.archivoFoto"),
      "resultado.pistaFoto", "resultado.pistaFotoDescarga");
  }, "image/png");
}

/**
 * Lienzo listo para guardar.
 *
 * Fuera del paso FOTO es el propio #stage (lo dibuja todo el shader). En FOTO el raton
 * es un <img> del DOM que el shader no ve, asi que hay que repetir en 2D la misma
 * geometria que usa positionSticker(): el lienzo cubre exactamente la misma caja CSS,
 * asi que las coordenadas normalizadas valen igual y no hace falta convertir nada mas
 * que la escala de la sombra.
 */
function composeShot() {
  const stage = el("stage");
  const sticker = el("sticker");
  if (!STEPS[state.step].sticker || !sticker.naturalWidth) return stage;

  // El recorte del VISOR, llevado a pixeles de lienzo. La foto sale 4:3 como la del
  // telefono, y sobre todo sale IGUAL a lo que se estaba viendo: las bandas no entran.
  const cajaLienzo = stage.getBoundingClientRect();
  const v = cajaFoto();
  const k = stage.width / Math.max(cajaLienzo.width, 1);
  const sx = (v.left - cajaLienzo.left) * k;
  const sy = (v.top - cajaLienzo.top) * k;
  const sw = v.width * k;
  const sh = v.height * k;

  const out = document.createElement("canvas");
  out.width = Math.round(sw);
  out.height = Math.round(sh);
  const ctx = out.getContext("2d");
  ctx.drawImage(stage, sx, sy, sw, sh, 0, 0, out.width, out.height);

  // Las coordenadas del raton ya son relativas al visor, asi que valen tal cual.
  const h = state.sticker.h * out.height;
  const w = h * (sticker.naturalWidth / sticker.naturalHeight);
  const x = state.sticker.x * out.width - w / 2;
  const y = state.sticker.y * out.height - h;

  // Misma sombra que el drop-shadow del CSS, en pixeles de lienzo: sin ella el raton se
  // ve pegado encima de la foto en vez de apoyado en la escena.
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 16 * k;
  ctx.shadowOffsetY = 8 * k;

  if (state.sticker.mirror) {
    ctx.translate(x + w / 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sticker, -w / 2, y, w, h);
  } else {
    ctx.drawImage(sticker, x, y, w, h);
  }
  return out;
}

/**
 * Deja listos los dos caminos para quedarse con el archivo.
 *
 * NINGUNA PAGINA WEB PUEDE ESCRIBIR EN LA GALERIA. No hay API: ni en iOS ni en Android.
 * La unica via es la hoja de compartir del sistema, donde "Guardar imagen" / "Guardar
 * video" si mete el archivo en el carrete. El <a download> hace otra cosa distinta -en
 * iOS deja el archivo en Archivos, no en Fotos- asi que se queda como plan B y pierde la
 * prioridad visual: era exactamente la confusion que hacia que las fotos acabaran donde
 * nadie las busca.
 */
function offerSave(kind, blob, nombre, claveShare, claveDescarga) {
  guardables[kind] = { blob, nombre, claveShare, claveDescarga };
  pintarGuardado(kind);
}

/**
 * Pinta los dos caminos de un resultado ya ofrecido.
 *
 * Se guarda lo que hace falta para repetirlo -el blob y las CLAVES, no las frases- porque
 * cambiar de idioma con un resultado en pantalla tiene que cambiar tambien sus botones,
 * su explicacion y el NOMBRE DEL ARCHIVO. Por eso el nombre llega como funcion: el del
 * clip lleva pegada la extension real, que depende del codec y no del idioma.
 */
function pintarGuardado(kind) {
  const g = guardables[kind];
  if (!g) return;
  const btn = el(`${kind}-share`);
  const link = el(`${kind}-save`);
  const archivo = g.nombre();
  const file = new File([g.blob], archivo, { type: g.blob.type });
  const can = !!navigator.canShare?.({ files: [file] });

  link.download = archivo;
  btn.hidden = !can;
  btn.onclick = async () => {
    try { await navigator.share({ files: [file] }); }
    catch (e) {
      if (e.name !== "AbortError") fail(t("resultado.sinMenu", { error: e.message }));
    }
  };

  // Sin hoja del sistema (escritorio, navegadores viejos) la descarga es lo unico que
  // hay, y entonces si es la accion principal.
  link.classList.toggle("primary", !can);
  el(`${kind}-tip`).innerHTML = can ? t(g.claveShare) : t(g.claveDescarga);
}

/** La misma linterna, con un botón en GRABAR y otro en FOTO: se encienden los dos. */
async function toggleTorch() {
  const botones = [el("torch"), el("foto-luz")];
  const on = !botones[0].classList.contains("on");
  try {
    await cameraTrack.applyConstraints({ advanced: [{ torch: on }] });
    for (const b of botones) b.classList.toggle("on", on);
  } catch (e) {
    fail(t("camara.sinLinterna"));
  }
}

// ---------------------------------------------------------------------------
// Certificado
// ---------------------------------------------------------------------------

const cert = {
  nombre: "", fecha: hoyISO(), diente: "primero", estado: "super", premio: "", nota: "",
};
let certRaton;          // el PNG del personaje, ya decodificado

function hoyISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Las dos filas de fichas del formulario. Las etiquetas dependen del idioma; los `id`
 *  con los que se guarda la eleccion, no: cambiar de idioma no puede perder lo elegido. */
function pintarChipsCarta() {
  pintarChips(el("cert-diente"), dientes(), "diente");
  pintarChips(el("cert-estado"), estados(), "estado");
}

function pintarChips(contenedor, opciones, campo) {
  contenedor.innerHTML = "";
  for (const o of opciones) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = o.etiqueta;
    b.setAttribute("aria-pressed", String(cert[campo] === o.id));
    b.onclick = () => {
      cert[campo] = o.id;
      for (const otro of contenedor.children) {
        otro.setAttribute("aria-pressed", String(otro === b));
      }
    };
    contenedor.appendChild(b);
  }
}

/**
 * Genera el documento y pasa al segundo paso.
 *
 * El certificado se dibuja UNA VEZ, al pulsar. La versión anterior lo redibujaba en cada
 * tecla para enseñar una vista previa en vivo; separado en dos pasos eso deja de hacer
 * falta, y de paso se ahorra redibujar entero -grano del papel incluido- treinta veces
 * mientras se escribe un nombre.
 */
function generarCertificado() {
  drawCertificate(el("cert-canvas"), cert, certRaton);
  prepararGuardadoCert();
  pasoCert("documento");
}

/**
 * Cambia de paso y deja la pantalla entera de acuerdo con el nuevo.
 *
 * Va junto y no repartido por los sitios que cambian de paso porque son TRES cosas que
 * tienen que moverse a la vez -el atributo, el rótulo de la barra y el desplazamiento- y
 * separadas se olvida siempre alguna: el rótulo se quedaba diciendo el paso anterior.
 *
 * El rótulo dice EN QUÉ PASO SE ESTÁ, no cómo se llama la pantalla: el nombre ya lo dice
 * el titular grande de debajo, y repetirlo dos veces a dos tamaños no informa de nada.
 */
function pasoCert(paso) {
  el("cert").dataset.paso = paso;
  // Se deja puesta la CLAVE y se resuelve, en vez de escribir la frase: asi el repaso del
  // documento al cambiar de idioma se lo lleva por delante sin que esto se entere.
  const rotulo = el("cert-paso-titulo");
  rotulo.dataset.t = paso === "documento" ? "carta.pasoCarta" : "carta.pasoDatos";
  rotulo.textContent = t(rotulo.dataset.t);
  el("cert-scroll").scrollTo(0, 0);
}

/** El nombre es lo único que no se puede dejar en blanco: sin él no hay a quién escribir. */
function revisarNombre() {
  // `limpiar` y no `trim`: un nombre de puros espacios, o de caracteres invisibles
  // pegados desde otro sitio, no es un nombre.
  const hay = limpiar(cert.nombre, LIMITES.nombre).length > 0;
  el("cert-generar").disabled = !hay;
  // Un botón apagado sin explicación se lee como una app rota. El aviso solo sale cuando
  // ya se ha tocado el campo: delante de un formulario recién abierto sería una regañina.
  el("cert-nombre-aviso").hidden = hay || !el("cert-nombre").dataset.tocado;
  return hay;
}

/** Deja listos guardar y compartir con la imagen actual. */
function prepararGuardadoCert() {
  el("cert-canvas").toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = el("cert-save");
    if (link.dataset.url) URL.revokeObjectURL(link.dataset.url);
    link.dataset.url = url;
    link.href = url;
    offerSave("cert", blob, () => t("resultado.archivoCarta"),
      "carta.pistaGuardar", "carta.pistaDescargar");
  }, "image/png");
}

async function abrirCertificado() {
  if (!certRaton) {
    certRaton = new Image();
    certRaton.src = "assets/raton_perez.png";
    try { await certRaton.decode(); } catch { /* sin el personaje, el resto se dibuja */ }
  }
  el("cert-fecha").value = cert.fecha;
  el("cert-nombre").value = cert.nombre;
  el("cert-premio").value = cert.premio;
  el("cert-nota").value = cert.nota;
  contarNota();
  contarPremio();
  delete el("cert-nombre").dataset.tocado;
  pintarChipsCarta();
  revisarNombre();
  // El paso se fija ANTES de enseñar la pantalla: al revés, quien vuelve a entrar después
  // de haber escrito una carta ve un fotograma del documento anterior antes del formulario.
  el("cert").dataset.paso = "datos";     // siempre se entra por los datos
  el("cert").hidden = false;
  pasoCert("datos");
}

/** Cierra la carta y devuelve al inicio, que es de donde se entra. */
function cerrarCertificado() { el("cert").hidden = true; }

/**
 * La cuenta de lo que queda por escribir, para los campos que tienen límite.
 *
 * Solo aparece cuando ya se lleva algo escrito: un contador a cero delante de un campo
 * vacío se lee como un deber, y esto es opcional. Y avisa de verdad -en rojo- solo en el
 * último tramo, que es cuando sirve de algo.
 */
function contar(id, limite, aviso) {
  const campo = el(id);
  const salida = el(`${id}-cuenta`);
  if (!salida) return;
  const quedan = limite - campo.value.length;
  salida.textContent = campo.value ? t("carta.quedan", { n: quedan }) : "";
  salida.classList.toggle("apurado", quedan <= aviso);
}

function contarNota() { contar("cert-nota", LIMITES.nota, 40); }
function contarPremio() { contar("cert-premio", LIMITES.premio, 6); }

/**
 * La fecha, acotada a un rango con sentido.
 *
 * Sin esto se puede fechar la carta en 1901 o en 2099: el `<input type=date>` no limita
 * nada por su cuenta, y en un ordenador se escribe a mano. `min` y `max` frenan al
 * selector, pero NO a lo que se teclea, así que además hay que corregirlo al vuelo.
 */
function rangoFechas() {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - LIMITES.dias);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-` +
                     `${String(d.getDate()).padStart(2, "0")}`;
  return { min: iso(desde), max: iso(hoy) };
}

function revisarFecha() {
  const { min, max } = rangoFechas();
  const campo = el("cert-fecha");
  const v = campo.value;
  if (!v) { campo.value = cert.fecha = max; return; }
  if (v > max) { campo.value = cert.fecha = max; toast(t("carta.fechaFutura")); }
  else if (v < min) { campo.value = cert.fecha = min; toast(t("carta.fechaVieja")); }
  else cert.fecha = v;
}

function setupCertificado() {
  // Los limites los pone el PAPEL, no el HTML: `LIMITES` vive en el modulo del dibujo,
  // que es quien sabe cuanto cabe. Escritos a mano en los dos sitios se separan en cuanto
  // alguien toca un tamaño, y el que se queda corto siempre es el del formulario.
  el("cert-nombre").maxLength = LIMITES.nombre;
  el("cert-premio").maxLength = LIMITES.premio;
  el("cert-nota").maxLength = LIMITES.nota;

  const { min, max } = rangoFechas();
  el("cert-fecha").min = min;
  el("cert-fecha").max = max;

  for (const [id, campo] of [["cert-nombre", "nombre"], ["cert-fecha", "fecha"],
                             ["cert-premio", "premio"], ["cert-nota", "nota"]]) {
    el(id).oninput = (e) => {
      cert[campo] = e.target.value;
      if (campo === "nombre") revisarNombre();
      if (campo === "nota") contarNota();
      if (campo === "premio") contarPremio();
    };
  }
  // La fecha se corrige al SALIR del campo y no en cada tecla: mientras se teclea "09" de
  // un año, el valor pasa por fechas absurdas y corregirlas a medias es pelearse con
  // quien escribe.
  el("cert-fecha").onchange = revisarFecha;
  el("cert-fecha").onblur = revisarFecha;
  el("cert-nombre").onblur = () => {
    el("cert-nombre").dataset.tocado = "si";
    revisarNombre();
  };
  // El límite lo pone el PAPEL, no el formulario: LIMITE_NOTA sale de medir cuánto cabe
  // en la carta antes de tocar la firma. Ponerlo aquí a mano seria tener dos numeros que
  // se separan en cuanto alguien cambie un tamaño del dibujo.
  el("go-cert").onclick = abrirCertificado;
  el("cert-generar").onclick = () => { if (revisarNombre()) generarCertificado(); };
  // Arriba a la izquierda se VUELVE, y vuelve siempre: desde la carta, al formulario; desde
  // el formulario, al inicio, que es de donde se vino. Antes el botón no existía en el
  // primer paso, y la única salida era la X: quien entraba a mirar el formulario tenía que
  // CERRAR para volver, que no es lo mismo aunque acabe en el mismo sitio.
  // Volver a los datos conserva lo escrito: se corrige una errata sin repetirlo todo.
  el("cert-volver").onclick = () => {
    if (el("cert").dataset.paso === "documento") pasoCert("datos");
    else cerrarCertificado();
  };
  el("cert-close").onclick = cerrarCertificado;
  el("cert-print").onclick = () => window.print();
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

/**
 * Tres estados, no dos: claro, oscuro y "el que diga el sistema".
 *
 * El tercero es el que importa y el que casi todas las apps se saltan: un telefono que
 * cambia solo al anochecer ya sabe que hora es, y esta app se usa de noche.
 *
 * Y se presentan LOS TRES A LA VEZ, no como un boton que rota. Un icono que cambia al
 * tocarlo obliga a dar toques hasta acertar y nunca dice cuantas opciones hay; el tema es
 * de las poquisimas cosas que un usuario quiere elegir, y elegir necesita ver la lista.
 */
// El glifo se queda aqui y el nombre se va a `idiomas/`: un simbolo de luna no se
// traduce, y ponerlo en los tres catalogos solo daria tres sitios donde equivocarse.
const TEMAS = [
  { id: "auto", glifo: "\u25D0" },
  { id: "claro", glifo: "\u2600" },
  { id: "oscuro", glifo: "\u263E" },
];

function temaActual() {
  return document.documentElement.dataset.tema || "auto";
}

function aplicarTema(id) {
  if (id === "auto") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = id;
  try {
    if (id === "auto") localStorage.removeItem("tema");
    else localStorage.setItem("tema", id);
  } catch (e) { /* en privado no se puede guardar; el tema vale para esta sesión */ }

  for (const boton of el("tema").children) {
    boton.setAttribute("aria-pressed", String(boton.dataset.tema === id));
  }
  el("tema-pie").textContent = t(`ajustes.temas.${id}.pie`);
}

function setupTema() {
  el("tema").replaceChildren(...TEMAS.map((tema) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.tema = tema.id;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span class="glifo" aria-hidden="true"></span><span></span>`;
    b.firstChild.textContent = tema.glifo;
    b.lastChild.textContent = t(`ajustes.temas.${tema.id}.nombre`);
    b.onclick = () => aplicarTema(tema.id);
    return b;
  }));
  aplicarTema(temaActual());
}

/**
 * El idioma, y ahora cambia la app ENTERA: interfaz, avisos y la carta que se imprime.
 *
 * Cambia EN CALIENTE, sin recargar. Este selector se toca estando ya dentro -a veces con
 * un vídeo grabado en pantalla, o con media carta escrita- y una recarga perdería todo
 * eso para ahorrarse cuatro llamadas. Lo que cuesta es acordarse de repintar lo que no
 * vive en el HTML, y de eso va `refrescarIdioma()`.
 *
 * Lo que NO cambia es lo elegido: el diente y el estado se guardan por `id`, no por su
 * etiqueta, así que una carta a medias sobrevive al cambio.
 */
function aplicarIdioma(id) {
  fijarIdioma(id);          // guarda, pone el <html lang> de verdad y repasa el documento
  refrescarIdioma();
}

/**
 * Todo lo que el repaso del documento no alcanza.
 *
 * `i18n.traducir()` se ocupa de lo que está marcado en el HTML. Aquí va lo que se pinta
 * desde el código: las dos listas de botones, el paso actual, la animación elegida, las
 * fichas del formulario y los resultados que haya en pantalla. La regla para no olvidarse
 * de ninguno es sencilla: si un texto se escribe con `textContent` fuera de esta función,
 * o deja su clave en `dataset.t`, o hay que repintarlo aquí.
 */
function refrescarIdioma() {
  setupTema();
  setupIdioma();
  pintarPaso();
  pintarEfecto();
  if (el("cert-diente").children.length) pintarChipsCarta();
  contarNota();
  contarPremio();
  for (const kind of Object.keys(guardables)) pintarGuardado(kind);
  pintarMetaClip();
  // La carta ya dibujada se vuelve a dibujar: es un lienzo, y ahí dentro no hay ni un
  // `data-t` que valga. Solo si está a la vista, que es cuando importa.
  if (!el("cert").hidden && el("cert").dataset.paso === "documento") {
    drawCertificate(el("cert-canvas"), cert, certRaton);
    prepararGuardadoCert();
  }
}

function setupIdioma() {
  el("idioma").replaceChildren(...IDIOMAS.map((x) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.idioma = x.id;
    // El nombre de cada idioma va SIEMPRE en sí mismo y no se traduce: quien busca el
    // suyo en una lista busca la palabra que conoce.
    b.textContent = x.nombre;
    b.setAttribute("aria-pressed", String(x.id === idioma()));
    b.onclick = () => aplicarIdioma(x.id);
    return b;
  }));
  el("idioma-pie").textContent = t("ajustes.idiomaPie");
}

/**
 * DOS hojas, y la linea que las separa es donde estas cuando las abres.
 *
 * AJUSTES son los de la app -tema e idioma-: se abren desde el arranque, antes de
 * encender la camara. OPCIONES DE CAMARA son las de lo que estas mirando -cuadricula,
 * microfono, ajuste fino, diagnostico-: se abren desde dentro de la camara, que es el
 * unico sitio donde los deslizadores sirven de algo porque se ve la escena al moverlos.
 *
 * Antes era una sola hoja con todo dentro, y ahi el tema de la app convivia con el grano
 * del compositor, que no tienen nada que ver.
 */

const DESLIZADORES = [
  ["s-key", "key", 2], ["s-wb", "whiteBalance", 2],
  ["s-exp-min", "exposureMin", 2], ["s-exp-max", "exposureMax", 2],
  ["s-softness", "softness", 2], ["s-grain-max", "grainMax", 3],
];

/** Lleva `state.cfg` a los controles. Lo usan el arranque y "Restablecer". */
function sincronizarAjustes() {
  for (const [id, key, digits] of DESLIZADORES) {
    el(id).value = state.cfg[key];
    el(`${id}-v`).textContent = state.cfg[key].toFixed(digits);
  }
  el("s-limited").checked = state.cfg.limitedRange;
  el("s-mic").checked = state.cfg.mic;
  el("s-rejilla").checked = state.cfg.rejilla;
  el("ui-foto").dataset.rejilla = state.cfg.rejilla ? "si" : "no";
}

function abrirHoja(id) {
  el(id).hidden = false;
  el(`${id}-scroll`).scrollTo(0, 0);
}
const abrirAjustes = () => abrirHoja("ajustes");
const abrirCamOpts = () => abrirHoja("camopts");

function setupAjustes() {
  // El microfono es una PREFERENCIA y sobrevive a cerrar la app; el ajuste fino no, que
  // es afinado de una escena concreta y lo contrario seria heredar de noche el arreglo
  // que se hizo ayer en otro cuarto.
  try {
    if (localStorage.getItem("mic") === "no") state.cfg.mic = false;
    if (localStorage.getItem("rejilla") === "no") state.cfg.rejilla = false;
  } catch (e) { /* sin almacenamiento, el valor de fabrica */ }

  // El idioma, ANTES que nada: fija el <html lang>, deja el documento traducido y solo
  // entonces se pintan los selectores, que ya salen en el idioma que toca. Al reves, la
  // app se enseña un instante en castellano a quien la abre en ingles.
  fijarIdioma(idiomaInicial());
  setupTema();
  setupIdioma();
  sincronizarAjustes();

  // El engranaje -arranque e INICIO- abre los AJUSTES. El ••• de la camara y el boton de
  // la barra del asistente abren las OPCIONES DE CAMARA: los dos se pulsan estando dentro
  // de la camara, que es donde esos controles sirven.
  el("ajustes-abrir").onclick = abrirAjustes;
  el("camopts-bar").onclick = abrirCamOpts;

  for (const id of ["ajustes", "camopts"]) {
    const cerrar = () => { el(id).hidden = true; };
    el(`${id}-close`).onclick = cerrar;
    el(`${id}-listo`).onclick = cerrar;
    // Tocar fuera de la hoja cierra; dentro, no. El velo ES la hoja, asi que basta con
    // comprobar que el toque no venia de un hijo.
    el(id).onclick = (e) => { if (e.target === el(id)) cerrar(); };
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !el(id).hidden) cerrar(); });
  }

  for (const [id, key, digits] of DESLIZADORES) {
    el(id).oninput = () => {
      state.cfg[key] = parseFloat(el(id).value);
      el(`${id}-v`).textContent = state.cfg[key].toFixed(digits);
    };
  }

  el("s-limited").onchange = (e) => { state.cfg.limitedRange = e.target.checked; };

  el("s-rejilla").onchange = (e) => {
    state.cfg.rejilla = e.target.checked;
    el("ui-foto").dataset.rejilla = state.cfg.rejilla ? "si" : "no";
    try { localStorage.setItem("rejilla", state.cfg.rejilla ? "si" : "no"); } catch (err) { /* da igual */ }
  };

  el("s-mic").onchange = async (e) => {
    state.cfg.mic = e.target.checked;
    if (!state.cfg.mic) recorder?.disableMic();
    else if (recorder && !(await recorder.enableMic())) {
      e.target.checked = state.cfg.mic = false;
      fail(t("opciones.micNegado"));
    }
    try { localStorage.setItem("mic", state.cfg.mic ? "si" : "no"); } catch (err) { /* da igual */ }
  };

  el("ajustes-reset").onclick = () => {
    // Se MUTA en el sitio en vez de reasignar: `state.cfg` viaja por referencia (el
    // ParamSolver se lo queda), y sustituir el objeto dejaria a quien lo guardo mirando
    // el de antes. El microfono no es ajuste fino y no se toca desde aqui.
    const { mic, rejilla } = state.cfg;
    Object.assign(state.cfg, CFG_DEFECTO, { mic, rejilla });
    solver = new ParamSolver(state.cfg);   // y ademas reinicia el EMA, que venia sesgado
    sincronizarAjustes();
    toast(t("opciones.restablecido"));
  };

  // Diagnostico: numeros crudos, para quien desarrolla. Con ?dev=1 o con siete toques en
  // el titulo -el mismo gesto de toda la vida, y el unico que no descubre nadie por
  // accidente-. El usuario final no tiene que ver un uExposureMatch en su vida.
  let toques = 0;
  const abrirDiagnostico = () => {
    el("diagnostico").hidden = false;
    el("avanzado").open = true;
    toast(t("opciones.diagnosticoOn"));
  };
  if (new URLSearchParams(location.search).has("dev")) el("diagnostico").hidden = false;
  el("camopts-titulo").onclick = () => {
    if (++toques >= 7 && el("diagnostico").hidden) abrirDiagnostico();
  };
}

function setupControls() {
  el("go-video").onclick = () => setStep("escanear");
  el("go-photo").onclick = () => setStep("foto");
  el("snap").onclick = capturePhoto;
  el("flip").onclick = () => setCamera(state.facing === "user" ? "environment" : "user");
  el("sticker-flip").onclick = () => {
    state.sticker.mirror = !state.sticker.mirror;
    positionSticker();
  };

  // Los controles propios de la camara.
  el("foto-salir").onclick = () => setStep("inicio");
  el("foto-mas").onclick = abrirCamOpts;
  el("foto-ultima").onclick = () => { el("shot").hidden = false; };
  for (const b of el("cam-modos").children) {
    b.onclick = () => setStep(b.dataset.modo === "foto" ? "foto" : "escanear");
  }
  el("place").onclick = () => setStep("superficie");
  el("next-superficie").onclick = () => setStep("tamano");
  el("next-tamano").onclick = () => setStep("editar");
  el("select-fx").onclick = () => setStep("grabar");
  el("fx-prev").onclick = () => cycleEffect(-1);
  el("fx-next").onclick = () => cycleEffect(1);

  el("home").onclick = () => setStep("inicio");
  el("back").onclick = () => setStep(STEPS[state.step].back ?? "inicio");

  el("record").onclick = () => (recorder?.isRecording ? stopRecording() : startRecording());
  el("photo").onclick = capturePhoto;
  el("torch").onclick = toggleTorch;
  el("foto-luz").onclick = toggleTorch;

  setupCertificado();

  el("clip-close").onclick = () => { el("clip").hidden = true; el("clip-video").pause(); };
  el("shot-close").onclick = () => { el("shot").hidden = true; };

  addEventListener("resize", () => {
    if (STEPS[state.step].reticle) positionReticle();
    if (STEPS[state.step].sticker) positionSticker();
  });
}

setupAjustes();

/** El rotulo del boton de arranque, dejando puesta la clave para que se traduzca solo. */
function rotuloArranque(clave) {
  el("start").dataset.t = clave;
  el("start").textContent = t(clave);
}

el("start").onclick = async () => {
  el("start").disabled = true;
  rotuloArranque("arranque.abriendo");
  try {
    setupGestures();
    setupControls();
    await boot();
  } catch (e) {
    el("start").disabled = false;
    rotuloArranque("arranque.reintentar");
    fail(`${e.message}\n\n${t("arranque.sinCamara")}`);
  }
};
