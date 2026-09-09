# Ratón Pérez AR

App de composición de video con canal alfa sobre feed de cámara en vivo. Un efecto
pre-renderizado (el Ratón Pérez saliendo de un portal) se compone sobre la cámara del
teléfono, se graba, y queda un mp4 que el padre puede compartir.

Procesamiento 100% on-device. Flutter + capa nativa (GL/Metal).

## Estado

Fase de validación. Todavía no hay código de app: la decisión de producto (¿el resultado
se ve creíble de noche?) se toma antes de escribir la primera línea de Kotlin.

## Documentación

- [`docs/arquitectura.md`](docs/arquitectura.md) — diseño técnico: empaquetado de assets,
  shader de composición, pipeline de grabación Android/iOS, contrato Flutter ↔ nativo,
  especificación para el animador 3D.
- [`docs/plan-de-trabajo.md`](docs/plan-de-trabajo.md) — orden de ejecución, cronograma de
  las 3 semanas de PoC y correcciones al plan de validación.

## Por dónde empezar

Ver [`docs/plan-de-trabajo.md`](docs/plan-de-trabajo.md#respuesta-corta-por-dónde-iniciar).
Resumen: agendar las grabaciones de referencia, construir el compositor offline, testear
con padres el día 3.
