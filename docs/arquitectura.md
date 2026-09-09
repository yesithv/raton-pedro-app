# Ratón Pérez AR — Arquitectura técnica

Documento de diseño para app de composición de video con canal alfa sobre feed de cámara.
Target: Android 9+ / iOS 15+. Flutter + capa nativa. Procesamiento 100% on-device.

---

## 0. Correcciones al planteamiento inicial

Antes de entrar en detalle, cinco cosas que cambiaría. La 0.1 y la 0.2 son bloqueantes.

### 0.1 — El empaquetado "color arriba, matte abajo" rompe el decoder

Si el contenido es retrato 1080x1920 y se apila verticalmente, el frame empaquetado es
**1080x3840 = 4.15 Mpx**. El nivel garantizado de decodificación H.264 por hardware en
gama baja Android 9 es Level 4.0, que tiene un máximo de 8192 macrobloques por frame
(**~2.07 Mpx**). Habrá decodificación por software, o fallo directo, en una parte
grande del parque de dispositivos objetivo.

**Corrección:** empaquetar **lado a lado** (color izquierda, matte derecha) y bajar la
resolución por track. El personaje ocupa una fracción de la pantalla y además se escala
hacia abajo; no necesita 1080p.

| Esquema | Frame empaquetado | Mpx | Veredicto |
|---|---|---|---|
| 1080x1920 apilado vertical | 1080x3840 | 4.15 | Falla en gama baja |
| 1080x1920 lado a lado | 2160x1920 | 4.15 | Falla igual |
| **720x1280 lado a lado** | **1440x1280** | **1.84** | **Recomendado** |
| 640x1136 lado a lado | 1280x1136 | 1.45 | Margen extra si hay problemas |

Con 720x1280 por track hay holgura dentro de Level 4.0 y sobra resolución
para un personaje que en pantalla mide ~30-40% del alto.

### 0.2 — Alfa recta da halos negros. Usar alfa premultiplicada

El encoder hace submuestreo de croma 4:2:0. Si se guarda color "recto" (sin premultiplicar)
sobre fondo negro, el croma se promedia entre el personaje y el negro del fondo, y en los
bordes aparece una orla oscura sucia — especialmente visible sobre una escena nocturna.

**Corrección:** el track de color se guarda **premultiplicado sobre negro**. La composición
deja de ser una mezcla y pasa a ser una suma:

```
resultado = color_premultiplicado + camara * (1 - alfa)
```

Sin división, sin reconstrucción, sin orla. Es un cambio de una línea en el shader y de un
flag en el render, pero si se descubre en la semana 6 hay que rehacer todos los assets.

Nota complementaria: el matte va en luma (R=G=B), que **no** sufre submuestreo. El alfa
sobrevive limpio. Por eso el matte se puede muestrear del canal rojo directamente.

### 0.3 — H.264, no HEVC

HEVC con alfa nativo existe en iOS desde iOS 13 y es tentador. Pero obliga a dos
pipelines de assets, dos rutas de código y dos matrices de QA, para ganar ~30% de tamaño
de archivo en assets que van a pesar 3 MB.

**Corrección:** un solo asset empaquetado H.264 High Profile para ambas plataformas.
Decodificación por hardware universal en el rango de target. Un shader, un pipeline,
un set de assets.

### 0.4 — Sin ningún tracking, se ve como una calcomanía

Descartar plane detection es correcto. Pero si el padre mueve el teléfono durante los
5 segundos, el personaje se queda pegado a la pantalla en vez de al cuarto, y el cerebro lo
detecta al instante.

No hace falta ARCore para arreglarlo. Hace falta el **sensor de rotación**:

```
offset_pantalla = f(delta_yaw, delta_pitch) * distancia_estimada
```

Se contra-desplaza el overlay según la rotación del giroscopio. Es trigonometría básica,
cero dependencias, y mata la mayor parte de la sensación de calcomanía en movimientos
pequeños. Para movimientos grandes no sirve, pero ahí la UI simplemente debe pedir
"apoya el teléfono y no lo muevas".

Va en el backlog, no en el MVP. Pero el shader se diseña con el uniform de offset ya
presente para no tener que tocarlo después.

### 0.5 — La foto no es la misma pipeline

La función de "selfie" es composición de imagen estática: un frame RGBA sobre una foto.
No comparte nada con el pipeline de video salvo el asset. Es un módulo aparte,
mucho más simple, y se construye **después** — es la red de seguridad si el video se
complica, porque es la mitad del valor percibido a una décima parte del costo.

---

## 1. El riesgo más grande (entregable 5, primero)

**No es el shader. No es la grabación. Es que el resultado no se vea creíble de noche.**

El feed de cámara en un cuarto oscuro a las 11pm es: ISO altísimo, ruido cromático denso,
rango dinámico aplastado, balance de blancos cálido de una lamparita, motion blur, y una
nitidez pobre. El personaje pre-renderizado es: limpio, nítido, bien iluminado, sin ruido,
con negros perfectos.

Pegar el segundo sobre el primero produce algo que **cualquier adulto identifica como falso
en medio segundo**, y probablemente también un niño de 6 años. Ningún avance en el pipeline
de codecs arregla esto. Es un problema de dirección de arte y de *grading* en tiempo real.

Esto es lo que mata el producto, y es barato de validar. Por eso va primero.

### La mitigación: el shader no solo mezcla, iguala

El shader necesita cuatro operaciones más allá del alpha blend:

1. **Igualación de exposición.** Muestrear la luminancia media de la zona del feed donde
   cae el personaje y escalar su brillo para que pertenezca a esa escena.
2. **Inyección de grano.** Sintetizar ruido con la amplitud estimada del ruido de la cámara
   y aplicarlo *solo* sobre el personaje. Un personaje sin ruido sobre fondo ruidoso es la
   delación más obvia.
3. **Pérdida de nitidez.** Un blur mínimo (0.5-1 px) para igualar la MTF pobre de la
   cámara en baja luz.
4. **Sombra de contacto.** Sin sombra el personaje flota. Va horneada en el asset como
   elemento oscuro semitransparente debajo del personaje.

Los puntos 1 y 2 son los que más rinden. El 4 es responsabilidad del animador.

### PoC de 2 semanas

**Días 1-3 — Prueba de percepción. Cero código de app.**

- Grabar 6 videos de cuartos infantiles reales de noche, con 3 teléfonos distintos
  (uno gama alta, dos gama baja/media), en las condiciones reales: luz apagada, quizá
  una lamparita, niño en la cama.
- Componer un ratón placeholder — sirve un asset comprado de
  Sketchfab, no hace falta el personaje final. Dos versiones de cada uno: una con
  composición ingenua (solo alpha over) y otra con el grading aplicado
  (exposición igualada, grano, blur, sombra).
- Mostrárselos a 8-10 padres. Pregunta abierta primero: "¿qué opinas de este video?".
  Solo después: "¿le creerías?".

**Criterio de continuación:** si la versión con grading no convence a la mayoría, el
producto no existe en esta forma y hay que replantear (personaje estilizado tipo caricatura
en lugar de foto-realista, o pivotar a la función de foto, que tolera mucho más).

**Días 4-5 — Cristalizar la receta.**

Documentar los valores exactos que funcionaron: cuánto grano, cuánto blur, curva de
exposición, densidad y difuminado de la sombra. Estos números se convierten en los
uniforms del shader. Sin este paso, el spike técnico no tiene contra qué validarse.

**Días 6-9 — Spike Android. App nativa desnuda, sin Flutter.**

Camera2 → SurfaceTexture → GL con el shader → MediaCodec input Surface → MediaMuxer →
archivo. Probar en al menos 3 dispositivos de gama baja con Android 9/10. Android es la
plataforma riesgosa; iOS casi nunca sorprende aquí.

Métricas de salida: 1080p30 sin frames caídos, tiempo de export, temperatura del
dispositivo a los 60 segundos, tamaño del archivo.

**Días 10-11 — Spike iOS.** Mismo pipeline con AVFoundation + Metal.

**Días 12-13 — Integración a Flutter.** Meter el spike de Android como PlatformView y
verificar que la Texture de Flutter no colapsa el framerate ni pelea por el contexto GL.
Este es el segundo riesgo real y hay que tocarlo antes de comprometerse.

**Día 14 — Go / no-go documentado.**

El orden importa: **la decisión de producto se toma el día 3, antes de escribir una línea
de Kotlin.** Si el resultado no se ve creíble, se ahorran seis semanas.

---

## 2. Arquitectura de la capa nativa

### Flujo de texturas y buffers

```
┌─────────────────┐
│ Camera2 /       │  formato: SurfaceTexture (OES external)
│ AVCaptureSession│  1080p @30fps
└────────┬────────┘
         │ texture OES / CVPixelBuffer
         ▼
┌─────────────────────────────────────────────┐
│           CONTEXTO GL / METAL               │
│                                             │
│  uCamera (OES) ──┐                          │
│                  ├──> SHADER DE COMPOSICIÓN │
│  uOverlay ───────┘         │                │
│    ▲                       │                │
│    │                       ▼                │
│    │                  FBO offscreen         │
│    │                  (RGBA8, 1080x1920)    │
│    │                       │                │
│    │                       ├────────────────┼──> Flutter Texture (preview)
│    │                       │                │
│    │                       └────────────────┼──> Encoder input Surface
│    │                                        │         (solo si grabando)
└────┼────────────────────────────────────────┘
     │
┌────┴─────────────────┐
│ MediaCodec decoder / │  asset empaquetado H.264
│ AVAssetReader        │  1440x1280, 30fps, 150 frames
└──────────────────────┘
         ▲
    ┌────┴─────┐
    │ Reloj de │  Clock maestro de la reproducción.
    │ playback │  Avanza con los timestamps de la cámara,
    └──────────┘  no con wall clock.
```

**Decisión clave: quién manda el reloj.** El reloj maestro son los timestamps de los frames
de cámara. Cuando llega un frame de cámara con PTS *t*, se avanza el decoder del overlay al
frame correspondiente a *t - t_inicio*. Esto garantiza que overlay y cámara nunca se
desincronizan, y que si el dispositivo se ahoga y pierde frames, los pierde de forma
consistente en ambos. Si el overlay corre con su propio reloj, en gama baja se
desfasa y el efecto pierde el timing.

**Regla de render:** un solo pase de shader, un solo FBO, dos destinos de presentación
(preview y encoder) mediante `eglSwapBuffers` sobre dos EGLSurface que comparten contexto.
No renderizar dos veces.

### Componentes

| Componente | Responsabilidad | Vive en |
|---|---|---|
| `CaptureSession` | Configurar cámara, entregar frames + timestamps | Nativo |
| `OverlayDecoder` | Decodificar el asset empaquetado bajo demanda de PTS | Nativo |
| `Compositor` | Contexto GL/Metal, shader, FBO, uniforms | Nativo |
| `SceneAnalyzer` | Estimar luminancia y ruido del feed cada N frames | Nativo |
| `Recorder` | Encoder de video, encoder/mux de audio, muxer | Nativo |
| `TransformController` | Posición, escala, rotación del overlay | Dart (espejado a nativo) |
| `EffectCatalog` | Metadata de efectos, assets, precios | Dart |

`SceneAnalyzer` corre sobre un mip reducido del frame de cámara (128x128 basta), cada 10
frames, y actualiza los uniforms de exposición y grano. No hace falta más frecuencia: la
luz del cuarto no cambia en 5 segundos.

---

## 3. Shader de composición

GLSL ES 3.0. La versión Metal es una traducción directa.

```glsl
#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision mediump float;

uniform samplerExternalOES uCamera;
uniform sampler2D  uOverlay;        // empaquetado lado a lado: color | matte

uniform vec2  uOverlayOrigin;       // esquina sup-izq del overlay, coords normalizadas
uniform vec2  uOverlayScale;        // tamaño del overlay en coords normalizadas
uniform vec2  uGyroOffset;          // contra-desplazamiento por giroscopio (0,0 en MVP)

uniform float uExposureMatch;       // de SceneAnalyzer, típico 0.35 - 1.2
uniform float uGrainAmount;         // de SceneAnalyzer, típico 0.02 - 0.09
uniform float uSoftness;            // blur en píxeles de textura, típico 0.5 - 1.0
uniform float uTime;                // segundos, para animar el grano
uniform bool  uLimitedRange;        // true si el asset se codificó en rango 16-235

in  vec2 vCamUV;
out vec4 fragColor;

// Hash rápido para grano. No es gaussiano perfecto pero a esta amplitud da igual.
float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

void main() {
    vec3 cam = texture(uCamera, vCamUV).rgb;

    // Coordenada local dentro del overlay
    vec2 ouv = (vCamUV - uOverlayOrigin + uGyroOffset) / uOverlayScale;

    if (ouv.x < 0.0 || ouv.x > 1.0 || ouv.y < 0.0 || ouv.y > 1.0) {
        fragColor = vec4(cam, 1.0);
        return;
    }

    // El atlas está empaquetado lado a lado: color en [0.0, 0.5], matte en [0.5, 1.0]
    vec2 uvColor = vec2(ouv.x * 0.5,       ouv.y);
    vec2 uvMatte = vec2(ouv.x * 0.5 + 0.5, ouv.y);

    // --- Muestreo con suavizado para igualar la MTF pobre de la cámara ---
    vec2 texel = uSoftness / vec2(textureSize(uOverlay, 0));
    vec3 rgbP = texture(uOverlay, uvColor).rgb * 0.5
              + texture(uOverlay, uvColor + vec2( texel.x, 0.0)).rgb * 0.125
              + texture(uOverlay, uvColor + vec2(-texel.x, 0.0)).rgb * 0.125
              + texture(uOverlay, uvColor + vec2(0.0,  texel.y)).rgb * 0.125
              + texture(uOverlay, uvColor + vec2(0.0, -texel.y)).rgb * 0.125;

    float a = texture(uOverlay, uvMatte).r;

    // Expansión de rango si el asset quedó en 16-235 (BT.601 limited)
    if (uLimitedRange) {
        a = clamp((a - 0.0627) * 1.1644, 0.0, 1.0);
    }

    // --- Igualación de exposición ---
    // rgbP está premultiplicado: escalarlo por un factor es seguro y correcto.
    rgbP *= uExposureMatch;

    // --- Inyección de grano, solo sobre el personaje ---
    float n = hash13(vec3(vCamUV * 1024.0, floor(uTime * 30.0))) - 0.5;
    rgbP += vec3(n) * uGrainAmount * a;

    // --- Composición premultiplicada: suma, no mezcla ---
    fragColor = vec4(rgbP + cam * (1.0 - a), 1.0);
}
```

**Por qué así:**

- `rgbP + cam * (1 - a)` es la fórmula "over" para alfa premultiplicada. Sin división,
  sin `mix`, sin orla de borde.
- El grano se multiplica por `a` para que aparezca solo sobre el personaje. El fondo ya
  trae su propio ruido real de la cámara.
- El blur de 5 muestras es barato y suficiente. Si hace falta más, subir `uSoftness` antes
  de agregar taps.
- `uLimitedRange` existe porque es un bug de un día perdido: si el matte se codifica en
  rango limitado y no se expande, el personaje nunca queda del todo opaco ni del todo
  transparente. Lo ideal es forzar `yuvj420p` (rango completo) en el encode y dejar el
  uniform en `false`, pero se deja el camino por si un asset se cuela mal.

---

## 4. Pipeline de grabación

### Android

```
Camera2 ──> SurfaceTexture ──> [GL, shader] ──> FBO
                                                 │
                                                 ├─> EGLSurface preview
                                                 └─> EGLSurface del encoder
                                                          │
                                                     MediaCodec (H.264)
                                                          │
AudioRecord ──> MediaCodec (AAC) ─────────────────────> MediaMuxer ──> .mp4
```

Puntos donde se rompe:

- **Timestamps.** Usar `eglPresentationTimeANDROID(display, surface, ptsNanos)` con el
  timestamp del frame de cámara, no con `System.nanoTime()`. Si no, el video queda con
  duración correcta pero cadencia irregular.
- **Dominio de reloj de la cámara.** Consultar
  `SENSOR_INFO_TIMESTAMP_SOURCE`. Si devuelve `UNKNOWN`, los timestamps de la cámara
  **no** están en el mismo dominio que `SystemClock.elapsedRealtimeNanos()` que usa
  `AudioRecord`, y el audio queda desfasado. En ese caso hay que medir el offset una vez
  al inicio de sesión y aplicarlo.
- **Formato de color del encoder.** Al usar input Surface se evita el infierno de los
  color formats de MediaCodec. No usar `queueInputBuffer` con arrays de bytes.
- **Tamaños.** Redondear las dimensiones del encoder a múltiplos de 16. Hay encoders en
  gama baja que fallan silenciosamente si no.

### iOS

```
AVCaptureVideoDataOutput ──> CVPixelBuffer ──> [Metal, shader] ──> CVPixelBuffer
                                                                        │
AVCaptureAudioDataOutput ──> CMSampleBuffer ──────────> AVAssetWriter ──┴──> .mp4
```

Sustancialmente más simple. Los `CMSampleBuffer` de video y audio ya vienen en el mismo
dominio de reloj (`CMClockGetHostTimeClock`), así que la sincronización es gratis. Usar
`AVAssetWriterInputPixelBufferAdaptor` con un `CVPixelBufferPool` para evitar
asignaciones por frame.

### Audio: simplificar

El asset del efecto ya trae su propia pista de audio (sonidos mágicos, el portal). El
micrófono en un cuarto oscuro solo captura ruido de fondo y la respiración del niño.

**Recomendación para el MVP: no grabar el micrófono.** Multiplexar directamente la pista de
audio del asset, copiada sin recodificar. Elimina de un plumazo: el permiso de micrófono
(que además complica la revisión en apps para menores), la sincronización audio/video, el
mixer, y el encoder AAC. Se puede agregar la narración de voz del padre después, como
feature de pago, con una grabación aparte y un mix en post.

---

## 5. Contrato Flutter ↔ nativo

### Canales

```
MethodChannel  "ironcoding/perezar/control"
EventChannel   "ironcoding/perezar/events"
Texture        id entregado por initialize()
```

### Métodos (Dart → nativo)

| Método | Args | Retorna | Notas |
|---|---|---|---|
| `initialize` | `{lens: 'back'\|'front'}` | `{textureId, previewW, previewH}` | Abre cámara y contexto GL |
| `loadEffect` | `{assetPath, metadata}` | `{durationMs, frameCount}` | Prepara decoder, no reproduce |
| `setTransform` | `{x, y, scale, rotation}` | `void` | Coords normalizadas. Alta frecuencia |
| `play` | `{}` | `void` | Reproduce el efecto en preview |
| `startRecording` | `{outputPath}` | `void` | Empieza a grabar Y reproduce |
| `stopRecording` | `{}` | `{path, durationMs, sizeBytes}` | |
| `capturePhoto` | `{outputPath, frameIndex}` | `{path}` | Composición estática |
| `setTorch` | `{on: bool}` | `void` | |
| `dispose` | `{}` | `void` | |

`setTransform` se llama en cada frame del gesto de arrastre. Un MethodChannel aguanta esa
frecuencia sin problema, pero **no hay que esperar el retorno**: dispararlo y seguir.

### Eventos (nativo → Dart)

```dart
sealed class ArEvent {}

class ArReady          extends ArEvent {}
class ArPlaybackTick   extends ArEvent { final int positionMs; }
class ArPlaybackDone   extends ArEvent {}
class ArRecordingDone  extends ArEvent { final String path; }
class ArSceneAnalyzed  extends ArEvent { final double luma, noise; }  // para debug/UI
class ArThermalWarning extends ArEvent { final int level; }
class ArError          extends ArEvent { final String code, message; }
```

### Reparto de estado

**Autoritativo en Dart:** transform actual, efecto seleccionado, catálogo, galería de
resultados, estado de compras, preferencias. Todo lo que sobrevive a un cierre de la
sesión de cámara.

**Autoritativo en nativo:** sesión de cámara, contexto GL, estado del decoder, posición de
reproducción, estado del encoder. Todo lo que tiene un ciclo de vida ligado al hardware.

**La regla:** el transform se escribe en Dart y se empuja a nativo; el reloj de reproducción
se lee en nativo y se empuja a Dart. Nunca al revés. Si ambos lados escriben lo mismo hay
carreras de estado en el ciclo de vida de Android
(`onPause` durante una grabación es el caso feo).

**Ciclo de vida:** al recibir `onPause` / `applicationWillResignActive` durante una
grabación, cerrar el muxer limpiamente y emitir `ArRecordingDone`. Un mp4 sin `moov` atom
es un archivo corrupto y el usuario perdió el momento — que en este producto es
irrepetible, porque el niño solo pierde ese diente una vez.

---

## 6. Especificación para el animador 3D

### Entrega

- **Secuencia PNG RGBA**, 16 bits por canal si el software lo permite, alfa **recta**
  (el pipeline de build hace la premultiplicación).
- **1080x1920** en el máster. El build lo baja a 720x1280.
- **30 fps exactos.** 4-5 segundos = 120-150 frames.
- **Pase de sombra separado**, también PNG RGBA, alineado frame a frame.
- **Archivo de audio** aparte: WAV 48kHz estéreo, misma duración exacta.
- **JSON de metadata** (ver abajo).

El pipeline de build (script ffmpeg, no responsabilidad del animador) hace:
premultiplicar → escalar a 720x1280 → empaquetar lado a lado → codificar H.264 High,
`yuvj420p`, CRF 20, GOP 15 → mux con el audio. Salida esperada: 2-4 MB por efecto.

### Iluminación y render

- **Luz clave**: fría, tenue, desde arriba-izquierda, simulando luz de luna por una ventana.
  Baja intensidad. Es un cuarto a oscuras.
- **Exposición neutra-media.** No renderizar oscuro "para que combine": el shader escala el
  brillo en ambos sentidos, y necesita margen para subir *y* bajar. Un render ya oscuro no
  se puede recuperar.
- **Sin blancos puros.** Nada por encima de ~0.9. Los blancos clipeados son el segundo
  delator más obvio después de la falta de ruido.
- **Sin luces de contorno de colores saturados.** Un rim light cian sobre un cuarto con
  lamparita ámbar destruye la ilusión.
- **Cámara de ~50mm equivalente**, ligeramente en contrapicado (el teléfono está a la altura
  de la cama, mirando ligeramente hacia abajo). Evitar gran angular: la distorsión de
  perspectiva no va a coincidir con la del teléfono.
- **Margen de seguridad del 5%** en todos los bordes. El personaje nunca toca el borde del
  frame.

### La sombra de contacto

Es la diferencia entre un personaje que está en la cama y uno que flota sobre ella.

- Se renderiza como elemento **negro con alfa variable**, no como color oscuro opaco.
- Muy difuminada: la escena real no tiene luces duras.
- Densidad máxima ~0.5 de alfa justo bajo los pies, cayendo a 0 en unos 2-3 anchos de pie.
- Va **debajo** del personaje en la composición, en el mismo RGBA final.
- Debe ser genérica: no se sabe si cae sobre una sábana, una almohada o una mesita.

### El portal

Con alfa premultiplicada, un elemento de **color alto y alfa baja** se comporta
prácticamente como aditivo — que es exactamente lo que se quiere para un glow mágico.

- Renderizar el glow del portal con alfa baja (0.2-0.5) y color brillante.
- El borde del portal puede ser más opaco.
- **Evitar que el portal ilumine el cuarto**: no se puede proyectar luz sobre geometría que
  no existe. Si el portal es una fuente de luz intensa y no ilumina la cama, se nota.
  Mantenerlo contenido, o compensar con un pulso sutil de brillo global que el shader puede
  aplicar al feed de cámara durante esos frames (uniform adicional, fácil de agregar).

### Metadata JSON

```json
{
  "id": "portal_diente_v1",
  "durationMs": 5000,
  "fps": 30,
  "frameCount": 150,
  "packedSize": [1440, 1280],
  "trackSize": [720, 1280],
  "anchorPoint": [0.5, 0.86],
  "defaultScaleFactor": 0.35,
  "hasAudio": true,
  "limitedRange": false,
  "glowFrames": [42, 68]
}
```

`anchorPoint` es crítico: es el punto de contacto del personaje con la superficie, en
coordenadas normalizadas del frame. La app posiciona el overlay por **ese** punto, no por
el centro del frame. Así, cuando el padre toca la cama para colocar al ratón, el ratón
queda parado ahí y no flotando con el frame centrado en el dedo.

`glowFrames` marca el rango donde el portal está encendido, por si se implementa el pulso de
iluminación sobre el feed.

---

## Qué revisar cuando esto crezca

- **Tracking por giroscopio** (sección 0.4): el primer upgrade de realismo, barato.
- **Catálogo de efectos descargable**: hoy van en el bundle; con 15 efectos el APK se hace
  incómodo. Descarga bajo demanda con caché local, sin cambiar el pipeline.
- **Variantes de personaje** (color, accesorios): con este esquema significan assets
  separados. Si eso explota combinatoriamente, ahí sí vale la pena evaluar render en
  tiempo real — pero no antes.
- **Micrófono / narración**: cuando el producto esté validado y valga la pena pagar el
  costo del permiso y la sincronización.
