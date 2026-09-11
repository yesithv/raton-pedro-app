# app/ — Flutter + capa nativa Android

## Estado de verificación

| | Estado |
|---|---|
| `flutter analyze` sobre todo el Dart | ✅ sin incidencias |
| `flutter test` (10 pruebas de flujo, catálogo y eventos) | ✅ pasan |
| Kotlin: 9 archivos contra el `android.jar` **real** y el jar **real** del embedding de Flutter | ✅ sin errores ni avisos |
| Superficie de API de ARCore | ✅ **contra el artefacto real, en CI** |
| `flutter build apk --debug` | ✅ **en CI**, APK descargable como artefacto |
| Arranque en emulador: instala, lanza, sin crash ni ANR | ✅ **en CI** |
| Contexto EGL ES 3.0 creado y activo | ✅ visto en el logcat del emulador |
| Que el shader componga algo | ❌ nadie lo ha visto todavía |
| Anclaje ARCore, cámara real, MediaCodec de gama baja | ❌ un emulador no los tiene |

`.github/workflows/ci-android.yml` construye el APK. Ahí sí se alcanza Google Maven, así
que valida el Android Gradle Plugin, AndroidX y la API real de ARCore — todo lo que un
entorno con la salida de red restringida deja sin comprobar.

Corre **cuando cambia `app/` o `shaders/`**, no en cada commit del repo. No se ha quitado
nada: el emulador sigue siendo lo único que demuestra que la app ARRANCA, y como el
nativo no se ha ejecutado nunca en un teléfono de verdad, sin él no quedaría ninguna
prueba de que la capa nativa funciona. Lo que se ha quitado es compilar un APK porque
alguien tocó una hoja de estilos. Para lanzarlo a mano: *Actions → CI Android → Run
workflow*.

**Nunca se ha ejecutado en un dispositivo real.** Arranca en un emulador sin reventar, y
el logcat muestra un contexto EGL ES 3.0 creado y activo — como `Compositor.init()` corre
en un `HandlerThread` sin try/catch, un shader que no compilara habría matado el proceso,
así que sobrevivir es evidencia razonable de que compiló. Lo que sigue sin saberse es si
la composición **pinta al personaje**, si los timestamps de cámara y audio cuadran, y si
el mp4 sale bien. Eso solo lo dice un teléfono.

### Por qué falta lo que falta

Google Maven (`dl.google.com` / `maven.google.com`) está bloqueado en el entorno donde se
escribió esto, y ahí viven **el Android Gradle Plugin, AndroidX y ARCore**. Sin AGP no hay
APK; sin AndroidX no se comprueba `MainActivity` (hereda de `FlutterActivity`, cuyo
supertipo `LifecycleOwner` es de AndroidX); sin el aar de ARCore, `ArCoreDriver` se
compila contra `tools/kotlin-check/arcore_stub.kt`.

Ese stub **prueba que `PerezArPlugin` y `ArCoreDriver` son consistentes entre sí y con el
resto del módulo. No prueba que la API real de ARCore tenga esas firmas** — eso lo dice
únicamente el build de CI, que hasta ahora ha aceptado el código sin cambios.

Para reproducir la comprobación que sí se puede hacer:

```bash
./tools/verify_native.sh
```

Si lo corres en una máquina con salida a Google Maven, el script detecta el aar real de
ARCore y lo usa en lugar del stub.

Implementa la **opción B** de [`../docs/decision-arquitectura.md`](../docs/decision-arquitectura.md):
video alfa pre-renderizado anclado a un plano de ARCore, con degradación automática a
colocación por toque cuando el dispositivo no está certificado.

## Puesta en marcha

El andamiaje de `flutter create` ya está aplicado, con el Gradle ajustado
(`minSdk` 24 por ARCore, dependencia de ARCore, y el task que copia el shader desde
`shaders/` en cada build). Basta con:

```bash
cd app
flutter pub get
flutter run          # requiere un Android físico; el emulador no sirve para cámara ni GL
```

Falta iOS: `flutter create --platforms=ios .` cuando llegue el turno.

## Estructura

```
lib/
  main.dart
  src/ar/ar_controller.dart     contrato de canales (sección 5 de la arquitectura)
  src/ar/ar_events.dart         eventos nativo -> Dart
  src/catalog/effect.dart       metadata de tools/build_effect.py
  src/flow/wizard.dart          el asistente, puerto de web/js/flow.js
  src/ui/                       pantallas y widgets

android/app/src/main/kotlin/com/ironcoding/perezar/
  PerezArPlugin.kt              orquestador: hilo GL, canales, ciclo de vida
  gl/EglCore.kt                 contexto EGL y las dos EGLSurface
  gl/Compositor.kt              shader, FBO, uniforms
  media/OverlayDecoder.kt       MediaCodec gobernado por el reloj de cámara
  media/Recorder.kt             encoder de video + AAC + muxer
  ar/ArDriver.kt                interfaz
  ar/ArCoreDriver.kt            planos, anclas, estimación de luz
  ar/Camera2Driver.kt           respaldo sin ARCore
  analysis/SceneAnalyzer.kt     color y ruido, cuando el driver no estima luz
```

## Decisiones que lleva el código, y por qué

**El reloj maestro es la cámara.** El decoder del overlay y los PTS del encoder se
derivan del timestamp del frame de cámara, nunca de `System.nanoTime()`. Si el overlay
corriera con su propio reloj, en gama baja se desfasaría y el efecto perdería el timing.
Y con wall clock en `eglPresentationTimeANDROID`, el mp4 sale con duración correcta pero
cadencia irregular.

**Un pase de shader, dos destinos de presentación.** Se compone una vez en el FBO y se
presenta con dos *blits* baratos: la textura de Flutter y la input Surface del encoder.
Renderizar dos veces duplicaría el coste del shader justo donde no sobra.

**El overlay también es una textura externa.** En Android llega de MediaCodec por una
`SurfaceTexture`, igual que la cámara. Por eso `shaders/composite.frag` tiene un bloque
`#ifdef OVERLAY_EXTERNAL`: el web lo compila sin la macro y el nativo con ella. Es la
única divergencia real entre plataformas, y está acotada a esas líneas.

**`textureSize()` fuera.** No está garantizado sobre un sampler externo, y el tamaño del
atlas se conoce en la CPU desde el JSON del asset. Va como uniform.

**La escala significa algo.** Con ancla, el tamaño en pantalla sale de proyectar la altura
física del personaje (25 cm). Se encoge al alejar el teléfono, como un objeto real. Sin
ancla vuelve a ser un número que el usuario ajusta a ojo.

**El transform se escribe en Dart y se lee en nativo; el reloj de reproducción al revés.**
Nunca los dos lados escribiendo lo mismo, o aparecen carreras en el ciclo de vida.

**`onPause` durante una grabación cierra el muxer Y guarda.** Un mp4 sin átomo `moov` es
un archivo corrupto, y aquí el momento es irrepetible: el niño solo pierde ese diente una
vez. El guardado en galería va en nativo por lo mismo — no puede depender de que Dart siga
vivo para completarse.

**Los permisos se piden en tiempo de ejecución, antes de `initialize()`.** Declararlos en
el manifest no basta desde Android 6: sin pedirlos, la cámara falla en silencio y la
pantalla se queda en negro sin ningún error visible. Se usa `Activity.requestPermissions`
del framework en vez de `ActivityCompat`, para no arrastrar AndroidX solo para esto. La
cámara es obligatoria; el micrófono no, porque sin él el video sale mudo pero sigue
siendo un video.

**El giroscopio solo actúa sin ARCore.** Con ancla el mundo ya manda; aplicar ambos
duplicaría la corrección y el personaje se movería al doble de rápido que el encuadre.

**Las métricas del spike son visibles en la UI**, no solo en el log: frames caídos, tiempo
de export y aviso térmico. Al probar en tres dispositivos de gama baja hay que poder
anotarlas sin conectar un depurador.

## Lo que falta

- **iOS.** AVFoundation + Metal + ARKit. El shader se traduce casi directo. Es lo más
  grande que queda.
- **El personaje real.** Los tres efectos son placeholders sintéticos.
- **Encuadre de selfie** para el modo foto: hoy la captura compone el frame actual, con
  el ratón pequeño en el suelo. La app de referencia lo usa con el ratón grande junto al
  niño dormido, que es otra escala y otro encuadre.
- **Medir.** Frames caídos, tiempo de export, temperatura a los 60 s y tamaño del archivo
  en tres dispositivos de gama baja. Nada de esto está verificado.
- **Compilar de verdad.** `flutter build apk` en una máquina con el SDK de Android, que
  es lo único que valida Gradle, el manifest merger, el empaquetado y la API real de
  ARCore.
