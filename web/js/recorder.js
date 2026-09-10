// Grabacion del lienzo compuesto a un archivo de video.
//
// canvas.captureStream() + MediaRecorder. No es el pipeline del nativo (alli son
// MediaCodec sobre una input Surface y AVAssetWriter), pero cierra el bucle completo
// —colocar, ver, grabar, guardar— en un telefono que no tiene nada instalado.
//
// El microfono va incluido a proposito: la app de referencia hace de la narracion en
// vivo del padre una funcion destacada, y es probablemente la mitad de por que el video
// se comparte despues. Ver docs/plan-de-trabajo.md, hallazgo 1.

// Orden de preferencia. Los codecs van EXPLICITOS y "video/mp4" a secas va al final,
// no primero, porque el contenedor no dice nada del contenido: Chromium acepta
// MediaRecorder con "video/mp4" y produce VP9 dentro de un mp4. Ese archivo se llama
// .mp4, no lo abre Fotos de iOS, ni QuickTime, ni WhatsApp, y el usuario acaba con un
// video que no puede compartir, que es justo el punto del producto. Verificado con
// ffmpeg sobre la salida real: "Stream #0:0 Video: vp9 (Profile 0) (vp09)".
//
// Con este orden: Chrome real y Safari caen en mp4/H.264; un Chromium sin codecs
// propietarios cae en webm/VP9, que al menos es honesto sobre lo que contiene.
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01E",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",   // ultimo recurso: en Safari es H.264, en Chromium es VP9 disfrazado
];

export function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";  // el navegador elige; puede fallar, se maneja arriba
}

export function isSupported() {
  return typeof MediaRecorder !== "undefined" &&
         typeof HTMLCanvasElement.prototype.captureStream === "function";
}

export class CanvasRecorder {
  constructor(canvas, fps = 30) {
    this.canvas = canvas;
    this.fps = fps;
    this.micStream = null;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.requestedMimeType = "";
  }

  /** Pide el microfono. Se llama aparte de start() para que el permiso no bloquee. */
  async enableMic() {
    if (this.micStream) return true;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      return true;
    } catch (e) {
      this.micStream = null;
      return false;
    }
  }

  disableMic() {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  get micEnabled() { return !!this.micStream; }

  start() {
    if (!isSupported()) throw new Error("Este navegador no soporta MediaRecorder.");

    const stream = this.canvas.captureStream(this.fps);
    // El audio del propio efecto todavia no se mezcla: haria falta WebAudio para sumar
    // la pista del asset con la del microfono en un solo MediaStreamTrack.
    if (this.micStream) {
      for (const track of this.micStream.getAudioTracks()) stream.addTrack(track);
    }

    const mimeType = pickMimeType();
    this.requestedMimeType = mimeType;
    this.chunks = [];
    this.recorder = new MediaRecorder(stream,
      mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 });
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(250);
    this.startedAt = performance.now();
    return mimeType;
  }

  get elapsedMs() {
    return this.recorder?.state === "recording" ? performance.now() - this.startedAt : 0;
  }

  get isRecording() { return this.recorder?.state === "recording"; }

  /** Detiene y resuelve con {blob, mimeType, durationMs}. */
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        return reject(new Error("No hay grabacion en curso."));
      }
      const durationMs = this.elapsedMs;
      this.recorder.onstop = () => {
        // Dos mimeType, y la distinción importa:
        //   requestedMimeType  lo que se PIDIÓ, que es lo que determinó el códec.
        //   mimeType           lo que el navegador REPORTA, que puede venir normalizado:
        //                      Chrome devuelve "video/mp4" a secas aunque se le pidiera
        //                      "video/mp4;codecs=avc1…".
        // Juzgar la ambigüedad por el reportado da un falso positivo en cuanto el
        // navegador sí tiene H.264. Lo cazó CI: en local, sin H.264, salía webm y la
        // comprobación pasaba; en el runner, con H.264, saltaba sin motivo.
        const mimeType = this.recorder.mimeType || "video/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.chunks = [];
        resolve({
          blob,
          mimeType,
          requestedMimeType: this.requestedMimeType,
          durationMs,
        });
      };
      this.recorder.onerror = (e) => reject(e.error ?? new Error("Fallo la grabacion."));
      this.recorder.stop();
    });
  }

  static extensionFor(mimeType) {
    return mimeType.includes("mp4") ? "mp4" : "webm";
  }

  /**
   * true si el mimeType SOLICITADO no garantiza el códec que sugiere su contenedor.
   *
   * Hay que pasarle requestedMimeType, no mimeType: ver la nota en stop().
   */
  static isAmbiguous(requestedMimeType) {
    return requestedMimeType === "video/mp4" || requestedMimeType === "";
  }
}
