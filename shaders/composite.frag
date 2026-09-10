#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require

// highp, NO mediump. Ver nota al final del archivo: hash13() se degrada a basura
// con mediump en los GPUs donde mediump es realmente half float.
precision highp float;

uniform samplerExternalOES uCamera;
uniform sampler2D  uOverlay;        // empaquetado lado a lado: color | matte

uniform vec2  uOverlayOrigin;       // esquina sup-izq del overlay, coords normalizadas
uniform vec2  uOverlayScale;        // tamaño del overlay en coords normalizadas
uniform vec2  uGyroOffset;          // contra-desplazamiento por giroscopio (0,0 en MVP)

uniform vec3  uExposureMatch;       // de SceneAnalyzer. Ganancia POR CANAL, no escalar:
                                    // ver nota de balance de blancos al final
uniform float uGrainAmount;         // de SceneAnalyzer, típico 0.02 - 0.09
uniform float uSoftness;            // blur en píxeles de textura, típico 0.5 - 1.0
uniform float uTime;                // segundos, para animar el grano
uniform bool  uLimitedRange;        // true si el asset se codificó en rango 16-235

in  vec2 vCamUV;      // coordenada de textura del feed (ajuste "cover" del sensor)
in  vec2 vScreenUV;   // coordenada de pantalla 0..1 (donde el usuario toco)
out vec4 fragColor;

// Hash rápido para grano. No es gaussiano perfecto pero a esta amplitud da igual.
float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

void main() {
    vec3 cam = texture(uCamera, vCamUV).rgb;

    // Coordenada local dentro del overlay.
    // OJO: se usa vScreenUV, NO vCamUV. uOverlayOrigin viene de donde el usuario toco
    // la PANTALLA. El feed va recortado en "cover" respecto a la pantalla, asi que los
    // dos espacios difieren por una transformacion afin: mezclarlos coloca al personaje
    // desplazado respecto al dedo, y el error crece con la diferencia de aspecto entre
    // sensor y pantalla. En el compositor offline coinciden (clip y salida tienen la
    // misma resolucion), asi que este bug no aparece ahi: solo en el dispositivo.
    vec2 ouv = (vScreenUV - uOverlayOrigin + uGyroOffset) / uOverlayScale;

    if (ouv.x < 0.0 || ouv.x > 1.0 || ouv.y < 0.0 || ouv.y > 1.0) {
        fragColor = vec4(cam, 1.0);
        return;
    }

    // El atlas está empaquetado lado a lado: color en [0.0, 0.5], matte en [0.5, 1.0]
    vec2 texel = 1.0 / vec2(textureSize(uOverlay, 0));
    vec2 blur  = texel * uSoftness;

    // CLAMP DE COSTURA. Sin esto, los taps del blur (y el propio filtrado bilineal)
    // cruzan la frontera x=0.5 y leen la mitad equivocada: el borde derecho del color
    // muestrea el matte (luma casi blanca donde el personaje es opaco) y aparece una
    // franja brillante. build_effect.py además fuerza un borde de 2px a cero en cada
    // mitad, así que aunque este clamp fallara el sangrado sería negro/transparente.
    float pad = blur.x + texel.x;
    vec2 uvColor = vec2(clamp(ouv.x * 0.5,       pad,       0.5 - pad), ouv.y);
    vec2 uvMatte = vec2(clamp(ouv.x * 0.5 + 0.5, 0.5 + pad, 1.0 - pad), ouv.y);

    // --- Muestreo con suavizado para igualar la MTF pobre de la cámara ---
    vec3 rgbP = texture(uOverlay, uvColor).rgb * 0.5
              + texture(uOverlay, uvColor + vec2( blur.x, 0.0)).rgb * 0.125
              + texture(uOverlay, uvColor + vec2(-blur.x, 0.0)).rgb * 0.125
              + texture(uOverlay, uvColor + vec2(0.0,  blur.y)).rgb * 0.125
              + texture(uOverlay, uvColor + vec2(0.0, -blur.y)).rgb * 0.125;

    float a = texture(uOverlay, uvMatte).r;

    // Expansión de rango si el asset quedó en 16-235 (BT.601 limited)
    if (uLimitedRange) {
        a = clamp((a - 0.0627) * 1.1644, 0.0, 1.0);
    }

    // --- Igualación de exposición y de dominante de color ---
    // rgbP está premultiplicado: escalarlo por un factor es seguro y correcto, y lo
    // sigue siendo canal a canal.
    rgbP *= uExposureMatch;

    // --- Inyección de grano, solo sobre el personaje ---
    // El grano vive en espacio del SENSOR (vCamUV), no del overlay: el ruido de una
    // cámara está en el sensor, no pegado al personaje. Si se mueve con él, se nota.
    float n = hash13(vec3(vCamUV * 1024.0, floor(uTime * 30.0))) - 0.5;
    rgbP += vec3(n) * uGrainAmount * a;

    // --- Composición premultiplicada: suma, no mezcla ---
    fragColor = vec4(rgbP + cam * (1.0 - a), 1.0);
}

// ---------------------------------------------------------------------------
// NOTA SOBRE BALANCE DE BLANCOS
//
// uExposureMatch es un vec3 y no un float porque un escalar no puede igualar una
// dominante de color. Los cuartos infantiles reales rara vez tienen luz neutra: una
// lamparita ámbar, una tira LED RGB en magenta, la luz azulada de un pasillo. Un
// personaje renderizado con luz neutra sobre cualquiera de esos se delata igual que uno
// sin grano, y subir o bajar su brillo de forma uniforme no lo arregla.
//
// SceneAnalyzer lo descompone en dos partes (ver tools/compose.py):
//
//   g = luma_escena * key / luma_referencia            <- ganancia global, escalar
//   c = (rgb_escena/luma_escena) / (rgb_ref/luma_ref)  <- dominante, neutra en luma
//   uExposureMatch = g * mix(vec3(1.0), c, fuerza)
//
// La separación importa: 'fuerza' en 0 reproduce exactamente el comportamiento escalar
// anterior, y en 1 el personaje adopta por completo la dominante del cuarto. El valor
// util está en medio. Adoptarla del todo es un error: el personaje pierde su color
// propio y se convierte en una silueta del color de la pared, que se ve tan falso como
// no igualar nada. Dónde cae exactamente ese número lo decide el test de percepción,
// igual que el piso de exposición.
//
// ---------------------------------------------------------------------------
// NOTA SOBRE PRECISIÓN
//
// Este shader DEBE compilarse con highp. Con `precision mediump float`:
//
//   vCamUV * 1024.0            ->  valores hasta 1024
//   p * 0.1031, fract(...)      ->  fract() de un valor ~100 con mantisa de 10 bits
//                                   deja ~3 bits útiles de fracción
//   p += dot(p, p.yzx + 33.33)  ->  suma ~100, vuelve a comer mantisa
//
// El hash colapsa a unos pocos valores distintos y el "grano" sale como bandas o
// bloques fijos en vez de ruido. Es el modo de fallo clásico de los hash de fract()
// en móvil, y no aparece en un emulador de escritorio (donde mediump == float32):
// solo en el dispositivo real de gama baja, que es justo donde no lo vas a ver hasta
// tarde. En GLSL ES 3.0 highp es obligatorio en el fragment shader, así que no hay
// razón para no usarlo.
//
// Si el grano llegara a costar rendimiento en gama baja, la salida no es bajar la
// precisión: es sustituir el hash por un lookup a una textura de ruido de 256x256
// desplazada por frame.
// ---------------------------------------------------------------------------
