# ¿Se puede llevar esto a Android y a iOS?

**Respuesta corta: a Android sí, y falta poco. A iOS sí, pero hoy no existe ni una línea
de código de iOS en el repositorio, y es la parte más cara de todo el proyecto.**

Este documento dice qué hay de verdad —medido, no supuesto—, qué falta, qué se puede
hacer sin tener un Mac y en qué orden conviene hacerlo.

---

## Qué hay hoy

El repositorio tiene **dos productos distintos** que comparten un shader, no uno solo:

| Track | Qué es | Tamaño | Estado |
|---|---|---|---|
| `web/` | La app que está publicada en Pages | ~4.000 líneas | **Funciona.** Carta y foto aprobadas; vídeo en construcción |
| `app/lib/` | La app Flutter (Dart) | 944 líneas | Recorre el asistente y habla con el nativo |
| `app/android/` | La capa nativa Android (Kotlin) | 2.462 líneas | **Compila, arranca y se prueba en emulador en cada PR** |
| **iOS** | — | **0 líneas** | **No existe**: ni carpeta `ios/`, ni Swift, ni Podfile |

Lo de iOS no es una exageración. `app/.metadata` registra con qué plataformas se creó el
proyecto Flutter, y solo hay dos:

```yaml
migration:
  platforms:
    - platform: root
    - platform: android
```

No hay ningún `.swift`, ningún `.m` y ningún `Podfile` en todo el repositorio.

**Y hay un segundo hueco, más fácil de pasar por alto:** la app nativa **no tiene la
carta**. Su máquina de pasos es `{ inicio, escanear, superficie, tamano, editar, grabar,
selfie }` (`app/lib/src/flow/wizard.dart:5`). El certificado —una de las dos
funcionalidades aprobadas— solo existe en `web/js/certificate.js`, dibujado sobre un
canvas 2D. En la vía Flutter hay que **reescribirlo en Dart** (`CustomPainter`), incluidas
la firma trazada a mano, el sello en arco y el ajuste de tamaño del cuerpo.

---

## Android: sí, y está cerca

Lo que ya está resuelto: el proyecto compila un APK en cada PR (`CI Android`), arranca en
un emulador y no revienta; `applicationId` es `com.ironcoding.perezar`; `minSdk` es 24
(Android 7), coherente con el objetivo declarado; los permisos están en el manifest; y
ARCore entra con degradación automática a Camera2 cuando el teléfono no lo soporta, que
es la decisión de `docs/decision-arquitectura.md`.

Lo que falta para poder publicar, y no es mucho:

1. **Firma de release.** Un `keystore` fuera del repositorio, `signingConfigs` en el
   Gradle y los secretos en GitHub Actions. Hoy solo se compila `--debug`.
2. **Bundle en vez de APK.** Google Play pide `.aab`: es cambiar el comando por
   `flutter build appbundle --release`.
3. **Identidad.** Icono propio (hoy es el de plantilla de Flutter), nombre visible,
   versión y `versionCode` con una regla de subida.
4. **La ficha de la tienda.** Capturas, descripción, política de privacidad —obligatoria
   porque la app pide cámara y micrófono— y el cuestionario de seguridad de datos.
5. **La carta**, si se quiere paridad con la web.

Nada de eso es difícil. **Cuesta dinero una sola vez**: la cuenta de Google Play
Developer, 25 dólares, pago único.

---

## iOS: posible, pero es el trabajo grande

Se puede. Flutter soporta iOS y `flutter create --platforms=ios` genera el esqueleto en
cualquier sistema operativo. Lo que no se genera solo es **todo lo que hace funcionar esta
app en concreto**, porque no es una app de formularios: es una cámara con composición por
GPU y grabación. La capa Android que habría que replicar son ocho subsistemas:

| Hoy, en Kotlin | Su equivalente en iOS |
|---|---|
| `ArCoreDriver.kt` (229 l.) — sesión ARCore, planos, anclas, luz | **ARKit** (`ARSession`, `ARPlaneAnchor`, `ARLightEstimate`) |
| `Camera2Driver.kt` (224 l.) — respaldo sin AR | **AVFoundation** (`AVCaptureSession`) |
| `Compositor.kt` (321 l.) + `EglCore.kt` — GL sobre EGL | **Metal** (`MTLDevice`, `CAMetalLayer`) |
| `OverlayDecoder.kt` (156 l.) — MediaCodec a SurfaceTexture | **AVAssetReader** a `CVPixelBuffer` |
| `Recorder.kt` (227 l.) — MediaCodec a input Surface | **AVAssetWriter** |
| `MediaStoreSaver.kt` (144 l.) — guardar en la galería | **PhotoKit** (`PHPhotoLibrary`) |
| `GyroTracker.kt` (99 l.) — sensor de rotación | **CoreMotion** (`CMMotionManager`) |
| `SceneAnalyzer.kt` (246 l.) — luma, dominante y ruido | **Accelerate/vImage** o un compute shader |

**La buena noticia** es que el lado Dart **no se toca**. `ArController` ya envuelve los
canales y `ArDriver` ya es una interfaz con dos implementaciones detrás; añadir una
tercera —la de iOS— es exactamente el escenario para el que se diseñó (ver
`docs/decision-arquitectura.md`). La app en Dart pide "dónde va el overlay en pantalla" y
recibe un rectángulo; le da igual quién se lo calcule.

### El obstáculo de verdad: el shader deja de tener una sola fuente

Es la pieza mejor diseñada del repositorio y **es justo la que iOS rompe**. Hoy
`shaders/composite.frag` es un solo archivo que usan los dos tracks:

```glsl
#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
uniform samplerExternalOES uCamera;
```

Eso es GLSL ES 3.0 con una extensión de **Android**: la textura externa que entrega
`SurfaceTexture`. En web, `compositor.js` lo adapta con dos sustituciones documentadas. En
iOS no hay adaptación posible que valga: OpenGL ES está **obsoleto desde iOS 12** y el
camino real es **Metal**, que no come GLSL sino **MSL**. Hay tres salidas, y conviene
elegirla **antes** de escribir la primera línea de Swift:

1. **Traducir en tiempo de compilación** (glslang + SPIRV-Cross: GLSL → SPIR-V → MSL) como
   un paso del build de iOS. Mantiene la fuente única, que es el invariante que sostiene
   todo el proyecto. Cuesta montar la cadena y añade una herramienta al build.
2. **Mantener una copia en MSL a mano.** Es lo más rápido de arrancar y lo que este
   repositorio lleva entero intentando evitar: dos copias de la misma matemática que se
   separan en silencio, y el síntoma es que el ratón se ve distinto en un iPhone sin que
   nadie sepa por qué.
3. **Portar los tres a WGSL/Metal** y dejar GL solo para web. Es la más limpia a largo
   plazo y la más cara ahora.

Recomendación: la **1**, y si no se puede montar, la **2 con una prueba** que renderice
el mismo fotograma con los dos shaders y falle si se separan más de un umbral. Sin esa
prueba, la 2 es una trampa.

### Sin Mac y sin cuenta de Apple: qué se puede y qué no

Has dicho que no tienes ninguna de las dos. Eso **no bloquea empezar**, y conviene saber
exactamente dónde está la línea:

**Se puede hacer hoy, sin Mac y sin cuenta:**

- Generar `app/ios/` con `flutter create --platforms=ios` (funciona en Linux y Windows).
- Escribir todo el Swift, el `Podfile`, el `Info.plist` con los textos de permiso de
  cámara y micrófono, y la configuración del proyecto.
- **Compilarlo y verificarlo en CI**: GitHub Actions tiene runners macOS, y
  `flutter build ios --no-codesign` compila sin firma y sin cuenta. Es la pieza que hace
  esto viable: el compilador de Apple dice si el Swift está bien aunque no tengas un Mac
  delante. (Conviene confirmar el coste de esos runners para este repositorio antes de
  montarlo.)
- Correr las pruebas de Dart, que son independientes de la plataforma.

**No se puede sin un Mac de verdad:**

- Abrir el simulador de iPhone y *ver* la app. En CI se puede arrancar un simulador, pero
  depurar una cámara con composición por GPU a través de un log es muy lento.
- Perfilar con Instruments, que es donde se ve si el compositor aguanta 30 fps.

**No se puede sin la cuenta de Apple Developer (99 $/año):**

- Instalar en un iPhone real. Y **esta app no se puede juzgar en un simulador**: no hay
  cámara, no hay ARKit y no hay GPU de teléfono. Todo lo que importa —que el ratón parezca
  estar en el cuarto— solo se ve en un dispositivo.
- TestFlight y la App Store.

En corto: **se puede escribir y compilar iOS entero sin gastar un euro; no se puede
comprobar que funciona.** Y en una app de cámara, eso es una parte muy grande del trabajo.

---

## El plan, por fases

Cada fase es aprobable por separado. Las dos primeras no dependen de tener Mac ni cuenta.

**Fase 1 — Android hasta la tienda.** Firma, `.aab`, icono, nombre, versión y el workflow
de release. Es lo que convierte «compila un APK de depuración» en «hay algo que se puede
instalar y publicar». *No necesita nada que no tengamos, salvo los 25 $ de Google Play
cuando toque publicar de verdad.*

**Fase 2 — El esqueleto de iOS, verificado en CI.** Generar `app/ios/`, el `Info.plist`
con los permisos, el registro del plugin, y un job de GitHub Actions en macOS que compile
sin firma. Al final de esta fase el repositorio **demuestra** que el proyecto iOS es
válido, aunque la app todavía no haga nada en iPhone. *Necesita añadir un workflow, que
según la regla nueva se pregunta antes.*

**Fase 3 — La decisión del shader.** Montar la traducción GLSL → MSL (o decidir la copia
con su prueba de equivalencia). Va antes que el Swift de verdad porque condiciona cómo se
escribe el compositor.

**Fase 4 — La capa iOS, por orden de riesgo.** Cámara (AVFoundation) → compositor (Metal)
→ decodificador del overlay → grabación (AVAssetWriter) → galería (PhotoKit) → ARKit al
final, porque es lo único que ya tiene respaldo diseñado. **Aquí es donde hace falta un
iPhone**: sin dispositivo, esto se escribe a ciegas.

**Fase 5 — Paridad de funciones.** La carta en Dart, para que las dos apps de tienda
tengan lo mismo que la web.

**Sobre el tamaño:** las fases 1 y 2 son días. La 4 son semanas, y son semanas que no se
pueden cerrar sin un iPhone en la mano. Conviene saberlo antes de empezar, no a mitad.

---

## Lo que cuesta dinero

Ninguna de estas cosas se contrata por iniciativa propia; van aquí para que la decisión
sea consciente:

| Concepto | Coste | Cuándo hace falta |
|---|---|---|
| Google Play Developer | 25 $, pago único | Solo para publicar en Android |
| Apple Developer Program | 99 $ al año | Para probar en un iPhone real, TestFlight y App Store |
| Un Mac | variable | Para ver y perfilar iOS cómodamente; no para compilar |

Compilar en CI, en cambio, no depende de nada de esto.

---

## Una nota sobre la vía elegida

Se eligió **Flutter con capa iOS nativa en Swift** frente a envolver la web ya hecha. Es
la que da mejor vídeo —encoder por hardware sobre una superficie de entrada, en vez de
`MediaRecorder`— y la única que puede usar ARKit de verdad. También es la más larga, y
tiene un coste que conviene tener escrito: **la carta y la foto, que son las dos
funcionalidades aprobadas, hoy solo existen en `web/`**, así que esta vía implica
reescribirlas. La web seguirá publicada en Pages y no se toca.
