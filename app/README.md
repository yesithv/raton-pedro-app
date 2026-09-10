# app/ — Flutter + capa nativa Android

**Estado: SIN COMPILAR.** Escrito pero nunca construido ni ejecutado. Este entorno no
tiene Flutter SDK ni Android SDK. Da por hecho que habrá errores de compilación,
imports que faltan y detalles de API que ajustar; lo que está pensado es la arquitectura
y los puntos donde el pipeline se rompe, no la sintaxis.

Implementa la **opción B** de [`../docs/decision-arquitectura.md`](../docs/decision-arquitectura.md):
video alfa pre-renderizado anclado a un plano de ARCore, con degradación automática a
colocación por toque cuando el dispositivo no está certificado.

## Puesta en marcha

Este directorio **no es un proyecto Flutter completo**: falta lo que genera
`flutter create` (gradle wrapper, recursos, `ic_launcher`, iOS). Para montarlo:

```bash
cd app
flutter create --org com.ironcoding --platforms=android --project-name perezar .
```

`flutter create` respeta los archivos que ya existen. Después:

1. Fusionar `android/app/build.gradle.snippet` en el `build.gradle` generado.
2. Añadir `apply from: "copy_shaders.gradle"` a ese mismo `build.gradle`.
3. `flutter pub get && flutter run`

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

**`onPause` durante una grabación cierra el muxer.** Un mp4 sin átomo `moov` es un archivo
corrupto, y aquí el momento es irrepetible: el niño solo pierde ese diente una vez.

## Lo que falta

- **iOS.** AVFoundation + Metal + ARKit. El shader se traduce casi directo.
- **Guardado en la galería** y hoja de compartir. Los permisos de fotos difieren bastante
  entre Android 10, 11 y 13+, y suele comerse más QA del que parece.
- **Pantalla de resultado** con previsualización del clip; hoy solo sale un SnackBar.
- **Modo foto** (selfie con el niño dormido). Módulo aparte, mucho más simple.
- **El personaje real.** Los tres efectos son placeholders sintéticos.
- **Medir.** Frames caídos, tiempo de export, temperatura a los 60 s y tamaño del archivo
  en tres dispositivos de gama baja. Nada de esto está verificado.
