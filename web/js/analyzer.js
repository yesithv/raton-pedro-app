// SceneAnalyzer. Puerto directo de tools/compose.py: mismas dos medidas, mismas dos
// correcciones, misma cadencia. El nativo tiene que producir estos mismos numeros.

const LUMA = [0.2126, 0.7152, 0.0722];
const MIP = 64;    // suficiente para luminancia media
const CROP = 96;   // ventana a resolucion NATIVA para el ruido

function makeCtx(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c.getContext("2d", { willReadFrequently: true });
}

/** Mediana sin ordenar el array completo. */
function median(arr) {
  const a = Float32Array.from(arr).sort();
  const n = a.length;
  return n % 2 ? a[(n - 1) >> 1] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
}

export class SceneAnalyzer {
  constructor() {
    this.mipCtx = makeCtx(MIP);
    this.cropCtx = makeCtx(CROP);
    this.last = { sceneLuma: 0.2, sigma: 0.03 };
  }

  /**
   * @param video        <video> del feed
   * @param camRect      zona bajo el personaje, en coords de TEXTURA de camara (0..1)
   */
  measure(video, camRect) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return this.last;

    const sx = Math.max(0, Math.floor(camRect.x0 * vw));
    const sy = Math.max(0, Math.floor(camRect.y0 * vh));
    const sw = Math.max(1, Math.min(vw - sx, Math.ceil((camRect.x1 - camRect.x0) * vw)));
    const sh = Math.max(1, Math.min(vh - sy, Math.ceil((camRect.y1 - camRect.y0) * vh)));

    // --- Luminancia: sobre un mip. Barato y suficiente, la luz del cuarto no cambia.
    this.mipCtx.drawImage(video, sx, sy, sw, sh, 0, 0, MIP, MIP);
    const mip = this.mipCtx.getImageData(0, 0, MIP, MIP).data;
    let sum = 0;
    for (let i = 0; i < mip.length; i += 4) {
      sum += (LUMA[0] * mip[i] + LUMA[1] * mip[i + 1] + LUMA[2] * mip[i + 2]) / 255;
    }
    const sceneLuma = sum / (MIP * MIP);

    // --- Ruido: sobre un recorte a resolucion NATIVA, nunca sobre el mip.
    // Un mip es un filtro paso-bajo: promedia exactamente la senal que se quiere medir.
    // Ver tools/README.md, hallazgo 1.
    const cw = Math.min(CROP, sw), chh = Math.min(CROP, sh);
    const cx = sx + ((sw - cw) >> 1), cy = sy + ((sh - chh) >> 1);
    this.cropCtx.clearRect(0, 0, CROP, CROP);
    this.cropCtx.drawImage(video, cx, cy, cw, chh, 0, 0, cw, chh);
    const crop = this.cropCtx.getImageData(0, 0, cw, chh).data;

    const lum = new Float32Array(cw * chh);
    for (let i = 0, p = 0; p < lum.length; i += 4, p++) {
      lum[p] = (LUMA[0] * crop[i] + LUMA[1] * crop[i + 1] + LUMA[2] * crop[i + 2]) / 255;
    }

    // Paso-alto 3x3 y MAD, no desviacion estandar: la desviacion estandar cuenta los
    // bordes reales de la escena como ruido y sobreestima en cuartos con muebles.
    const hp = [];
    for (let y = 1; y < chh - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const i = y * cw + x;
        const lo = 0.25 * (lum[i - 1] + lum[i + 1] + lum[i - cw] + lum[i + cw]);
        hp.push(lum[i] - lo);
      }
    }
    const med = hp.length ? median(hp) : 0;
    const sigma = hp.length ? median(hp.map((v) => Math.abs(v - med))) * 1.4826 : 0.03;

    this.last = { sceneLuma, sigma };
    return this.last;
  }
}

/**
 * Resuelve los uniforms a partir de la medida y los suaviza.
 *
 * referenceLuma viene del JSON del asset, calculado en build time por build_effect.py.
 * Estimarla por frame hace que los frames de solo-portal, que es emisivo y muy
 * brillante, disparen el estimador. Ver tools/README.md, hallazgo 2.
 */
export class ParamSolver {
  constructor(cfg) {
    this.cfg = cfg;
    this.exposure = null;
    this.grain = null;
    this.clampedFrames = 0;
    this.rawExposure = 1;
  }

  update({ sceneLuma, sigma }, referenceLuma) {
    const c = this.cfg;
    const raw = (sceneLuma * c.key) / Math.max(referenceLuma, 1e-3);
    this.rawExposure = raw;
    if (raw < c.exposureMin || raw > c.exposureMax) this.clampedFrames++;

    const tgtE = Math.min(c.exposureMax, Math.max(c.exposureMin, raw));
    const tgtG = Math.min(c.grainMax, Math.max(c.grainMin, sigma));

    // EMA. Sin esto los uniforms saltan en escalon cada N frames y el personaje
    // parpadea de brillo, que delata mas que no igualar nada.
    const k = c.smoothing;
    this.exposure = this.exposure === null ? tgtE : this.exposure + k * (tgtE - this.exposure);
    this.grain = this.grain === null ? tgtG : this.grain + k * (tgtG - this.grain);
    return { exposure: this.exposure, grain: this.grain };
  }
}
