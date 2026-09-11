# Ratón Pérez AR

App de composición de video con canal alfa sobre feed de cámara en vivo. Un efecto
pre-renderizado (el Ratón Pérez saliendo de un portal) se compone sobre la cámara del
teléfono, se graba, y queda un mp4 que el padre puede compartir.

Procesamiento 100% on-device. Flutter + capa nativa (GL/Metal).

## Estado

Fase de validación. El prototipo web reproduce los **dos modos** de la app de referencia:

- **Vídeo** — colocar el ratón, ajustar posición y tamaño, escoger entre tres animaciones,
  grabar con narración y guardar o compartir.
- **Foto** — cámara frontal con el ratón encima, para la foto con el niño dormido. Aquí el
  ratón es un PNG con alfa, no el vídeo empaquetado, y por eso no lleva grading; el porqué
  está en la sección 0.5 de la arquitectura.

Más la cadena de herramientas offline.

Falta lo que sólo existe en nativo: **detección de planos** (ARCore/ARKit) y **guardado
automático en la galería** — ninguna página web puede escribir en el carrete, no hay API,
así que el prototipo empuja a la hoja de compartir del sistema. Y el personaje real: los
tres efectos de vídeo son placeholders.

La app nativa está escrita en `app/` pero **sin compilar**: este entorno no tiene Flutter
SDK ni Android SDK.

La decisión de producto — ¿el resultado se ve creíble? — se toma con el prototipo y el
compositor offline, antes de escribir la primera línea de Kotlin.

## CI

| Workflow | Qué hace |
|---|---|
| `.github/workflows/ci.yml` | `flutter analyze` + tests; **construye el APK** (lo único que valida AGP, AndroidX y la API real de ARCore); recorre el asistente web sobre una cámara falsa y sube las capturas |
| `.github/workflows/pages.yml` | Publica el prototipo web con HTTPS, que es lo que exige `getUserMedia` |

El APK queda como artefacto descargable de cada ejecución, instalable en un teléfono sin
montar ningún toolchain.

**Pages necesita un paso manual, una sola vez:** *Settings → Pages → Source: "GitHub
Actions"*. No se puede automatizar — crear el sitio por API exige permiso de
administración del repositorio, que `GITHUB_TOKEN` no tiene. Hasta entonces ese workflow
falla con `Get Pages site failed … Not Found`.

## Prototipo web

`web/` — el asistente completo de la referencia (ESCANEAR → POSICIÓN → TAMAÑO →
EDITAR → GRABAR) con tres animaciones y grabación de video con micrófono, más el modo
FOTO (cámara frontal + ratón PNG encima), en el navegador del teléfono y sin instalar
nada. Ver [`web/README.md`](web/README.md) para abrirlo con GitHub Pages.

## App nativa

`app/` — Flutter + capa nativa Android. El Dart pasa `flutter analyze` y sus pruebas; el
Kotlin comprueba tipos contra el `android.jar` real (`./tools/verify_native.sh`). **El APK
no se ha construido nunca** ni se ha ejecutado en un dispositivo: Google Maven está
bloqueado en este entorno, y ahí viven el Android Gradle Plugin, AndroidX y ARCore. Implementa la opción B de
[`docs/decision-arquitectura.md`](docs/decision-arquitectura.md): video alfa
pre-renderizado anclado a un plano de ARCore, con degradación a colocación por toque
cuando el dispositivo no está certificado. Ver [`app/README.md`](app/README.md).

## Herramientas

```
tools/make_placeholder.py   material sintético para probar la cadena sin assets
tools/build_effect.py       PNG RGBA -> mp4 empaquetado + metadata (pipeline de assets)
tools/compose.py            clip + efecto -> mp4 compuesto (réplica del shader)
tools/crop_alpha.py         PNG RGBA -> PNG recortado al contenido (el ratón del modo FOTO)
shaders/composite.{vert,frag}  shader de composición (fuente de verdad,
                               compartido por el prototipo web y el nativo)
```

Ver [`tools/README.md`](tools/README.md).

## Documentación

- [`docs/arquitectura.md`](docs/arquitectura.md) — diseño técnico: empaquetado de assets,
  shader de composición, pipeline de grabación Android/iOS, contrato Flutter ↔ nativo,
  especificación para el animador 3D.
- [`docs/plan-de-trabajo.md`](docs/plan-de-trabajo.md) — orden de ejecución, cronograma de
  las 3 semanas de PoC, correcciones al plan de validación y revisión del shader.
- [`docs/receta-grading.md`](docs/receta-grading.md) — plantilla de los valores de grading.
  Se llena con los resultados del test de percepción.
- [`docs/prompt-rediseno-ui.md`](docs/prompt-rediseno-ui.md) — brief listo para pegar en
  una herramienta de diseño: inventario de pantallas, restricciones reales de uso (de
  noche, una mano, sin despertar al niño) y qué se puede cambiar sin tocar el pipeline.

## Por dónde empezar

Ver [`docs/plan-de-trabajo.md`](docs/plan-de-trabajo.md#respuesta-corta-por-dónde-iniciar).
Resumen: agendar las grabaciones de referencia, construir el compositor offline, testear
con padres el día 3.
