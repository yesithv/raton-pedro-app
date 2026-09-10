// Compositor WebGL2. Consume shaders/composite.frag SIN COPIARLO: hay una sola fuente
// de verdad del shader, y la reescritura a WebGL esta acotada y documentada abajo.

const SHADER_PATHS = {
  vert: ["../shaders/composite.vert", "shaders/composite.vert"],
  frag: ["../shaders/composite.frag", "shaders/composite.frag"],
};

async function fetchFirst(candidates) {
  const errors = [];
  for (const path of candidates) {
    try {
      const res = await fetch(path);
      if (res.ok) return await res.text();
      errors.push(`${path} -> HTTP ${res.status}`);
    } catch (e) {
      errors.push(`${path} -> ${e.message}`);
    }
  }
  throw new Error(`No pude cargar el shader:\n${errors.join("\n")}`);
}

// Las UNICAS dos diferencias entre el shader del dispositivo y el de WebGL:
//
//  1. samplerExternalOES no existe en WebGL. En Android la textura de camara es una
//     textura OES externa entregada por SurfaceTexture; en el navegador es una textura
//     2D normal subida desde un <video>. El muestreo es identico.
//  2. La directiva #extension que lo habilita sobra por lo mismo.
//
// Cualquier otra divergencia seria un bug: la matematica tiene que ser la misma o el
// prototipo deja de valer como referencia del nativo.
function toWebGL(src) {
  return src
    .replace(/^#extension\s+GL_OES_EGL_image_external_essl3.*$/m, "")
    // El bloque #ifdef OVERLAY_EXTERNAL se compila SIN definir la macro: en el navegador
    // el overlay llega de un <video> como textura 2D. En Android llega de MediaCodec por
    // una SurfaceTexture, que es externa, y alli si se define.
    .replace(/#ifdef\s+OVERLAY_EXTERNAL[\s\S]*?#else\n([\s\S]*?)#endif/g, "$1")
    .replace(/samplerExternalOES/g, "sampler2D");
}

// Las matrices de coordenadas de SurfaceTexture no existen en web: identidad.
const IDENTITY4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`${label} no compila:\n${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

export class Compositor {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true, // para que toBlob() capture la foto
    });
    if (!gl) throw new Error("Este navegador no tiene WebGL2.");
    this.gl = gl;
  }

  async init() {
    const gl = this.gl;
    const [vertSrc, fragSrc] = await Promise.all([
      fetchFirst(SHADER_PATHS.vert),
      fetchFirst(SHADER_PATHS.frag),
    ]);

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, toWebGL(vertSrc), "composite.vert"));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, toWebGL(fragSrc), "composite.frag"));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`El programa no linkea:\n${gl.getProgramInfoLog(prog)}`);
    }
    this.prog = prog;
    gl.useProgram(prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of ["uCamera", "uOverlay", "uCamUVScale", "uCamUVOffset",
                        "uOverlayOrigin", "uOverlayScale", "uGyroOffset",
                        "uCamXform", "uOverlayXform", "uOverlayTexel",
                        "uExposureMatch", "uGrainAmount", "uSoftness", "uTime",
                        "uLimitedRange"]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    this.texCamera = this._makeTexture(0);
    this.texOverlay = this._makeTexture(1);
    gl.uniform1i(this.u.uCamera, 0);
    gl.uniform1i(this.u.uOverlay, 1);
    gl.uniform2f(this.u.uGyroOffset, 0, 0); // seccion 0.4: el uniform existe, no se usa aun
    gl.uniformMatrix4fv(this.u.uCamXform, false, IDENTITY4);
    gl.uniformMatrix4fv(this.u.uOverlayXform, false, IDENTITY4);
  }

  _makeTexture(unit) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // CLAMP_TO_EDGE es obligatorio: con REPEAT el blur de la costura envolveria de la
    // mitad del matte a la del color por el otro lado.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return { tex, unit };
  }

  _upload(target, source) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + target.unit);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  /** Ajuste "cover" del feed sobre el lienzo. Devuelve {scale, offset} en coords de textura. */
  static coverFit(srcW, srcH, dstW, dstH) {
    const srcA = srcW / srcH, dstA = dstW / dstH;
    if (srcA > dstA) {
      const sx = dstA / srcA;
      return { scale: [sx, 1], offset: [(1 - sx) / 2, 0] };
    }
    const sy = srcA / dstA;
    return { scale: [1, sy], offset: [0, (1 - sy) / 2] };
  }

  resize(cssW, cssH, dpr, maxSide = 1440) {
    const scale = Math.min(1, maxSide / Math.max(cssW * dpr, cssH * dpr));
    const w = Math.max(2, Math.round(cssW * dpr * scale));
    const h = Math.max(2, Math.round(cssH * dpr * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return { w, h };
  }

  render({ cameraVideo, overlayVideo, transform, params, timeSec }) {
    const gl = this.gl;
    const { width: cw, height: ch } = this.canvas;

    this._upload(this.texCamera, cameraVideo);
    if (overlayVideo) this._upload(this.texOverlay, overlayVideo);

    if (overlayVideo) {
      // El tamano del overlay se pasa como uniform en vez de consultarlo con
      // textureSize(): sobre un sampler externo no esta garantizado, y en la CPU se
      // conoce de todos modos.
      gl.uniform2f(this.u.uOverlayTexel,
        1 / Math.max(overlayVideo.videoWidth, 1), 1 / Math.max(overlayVideo.videoHeight, 1));
    }

    const fit = Compositor.coverFit(cameraVideo.videoWidth, cameraVideo.videoHeight, cw, ch);
    gl.uniform2fv(this.u.uCamUVScale, fit.scale);
    gl.uniform2fv(this.u.uCamUVOffset, fit.offset);

    gl.uniform2f(this.u.uOverlayOrigin, transform.originX, transform.originY);
    gl.uniform2f(this.u.uOverlayScale, transform.scaleX, transform.scaleY);
    gl.uniform3fv(this.u.uExposureMatch, params.exposure);
    gl.uniform1f(this.u.uGrainAmount, params.grain);
    gl.uniform1f(this.u.uSoftness, params.softness);
    gl.uniform1f(this.u.uTime, timeSec);
    gl.uniform1i(this.u.uLimitedRange, params.limitedRange ? 1 : 0);

    gl.viewport(0, 0, cw, ch);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
