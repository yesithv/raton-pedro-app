# Ratón Pérez AR

App de composición de video con canal alfa sobre feed de cámara en vivo. Un efecto
pre-renderizado (el Ratón Pérez saliendo de un portal) se compone sobre la cámara del
teléfono, se graba, y queda un mp4 que el padre puede compartir.

Procesamiento 100% on-device. Flutter + capa nativa (GL/Metal).

## Estado

Fase de validación. El prototipo web reproduce el flujo completo de la app de referencia
—colocar el ratón, ajustar posición y tamaño, escoger entre tres animaciones, grabar con
narración y guardar o compartir— además de la cadena de herramientas offline.

Falta lo que sólo existe en nativo: **detección de planos** (ARCore/ARKit) y **guardado
automático en la galería**. Y el personaje real: los tres efectos son placeholders.

La app nativa está escrita en `app/` pero **sin compilar**: este entorno no tiene Flutter
SDK ni Android SDK.

La decisión de producto — ¿el resultado se ve creíble? — se toma con el prototipo y el
compositor offline, antes de escribir la primera línea de Kotlin.

## Prototipo web

`web/` — el asistente completo de la referencia (ESCANEAR → SUPERFICIE → TAMAÑO →
EDITAR → GRABAR), con tres animaciones, grabación de video con micrófono y captura de
foto, en el navegador del teléfono y sin instalar nada.
Ver [`web/README.md`](web/README.md) para abrirlo con GitHub Pages.

## App nativa

`app/` — Flutter + capa nativa Android. **Sin compilar todavía**: escrita pero nunca
construida ni ejecutada. Implementa la opción B de
[`docs/decision-arquitectura.md`](docs/decision-arquitectura.md): video alfa
pre-renderizado anclado a un plano de ARCore, con degradación a colocación por toque
cuando el dispositivo no está certificado. Ver [`app/README.md`](app/README.md).

## Herramientas

```
tools/make_placeholder.py   material sintético para probar la cadena sin assets
tools/build_effect.py       PNG RGBA -> mp4 empaquetado + metadata (pipeline de assets)
tools/compose.py            clip + efecto -> mp4 compuesto (réplica del shader)
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

## Por dónde empezar

Ver [`docs/plan-de-trabajo.md`](docs/plan-de-trabajo.md#respuesta-corta-por-dónde-iniciar).
Resumen: agendar las grabaciones de referencia, construir el compositor offline, testear
con padres el día 3.
