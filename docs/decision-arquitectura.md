# Decisión de arquitectura: opción B

**Estado:** decidida por defecto para empezar a codificar. Reversible.
**Fecha:** al arrancar la fase nativa.

## Contexto

El hallazgo 5 de `plan-de-trabajo.md` dejó tres opciones abiertas:

| | Qué es | Calidad de render | Anclaje al mundo | Requiere ARCore |
|---|---|---|---|---|
| A | Video alfa pre-renderizado + toque | Alta | Ninguno | No |
| B | Video alfa pre-renderizado anclado a un plano AR | Alta | Sí | Sí, con degradación a A |
| C | 3D en tiempo real + ARCore | Baja | Sí, completo | Sí, obligatorio |

El dato que debería cerrarla —cobertura de ARCore en el mercado objetivo— sigue sin estar.

## Decisión

**B**, con degradación automática a A.

Se decide sin ese dato porque **B es la única opción que no lo necesita para empezar**:
funciona con y sin ARCore, y el trabajo hecho vale igual en los dos casos. A y C sí
obligan a acertar de antemano.

## Consecuencias

**Lo que no cambia.** El shader, el pipeline de assets, la composición premultiplicada,
el grading y el balance de color siguen exactamente igual. El shader nunca supo de dónde
salía el transform: hoy lo alimenta un dedo, ahora lo alimenta la proyección de un ancla.
`uOverlayOrigin`, `uOverlayScale` y `uGyroOffset` ya existían.

**Lo que se añade.** Una capa de *driver* con dos implementaciones detrás de la misma
interfaz:

- `ArCoreDriver` — sesión ARCore. Entrega textura de cámara, pose, planos detectados,
  anclas y estimación de iluminación.
- `Camera2Driver` — respaldo. Entrega textura de cámara y nada más; la colocación es por
  toque, como en el prototipo web.

La app elige en arranque según `ArCoreApk.checkAvailability()`. El resto del código no
distingue: pide "dónde va el overlay en pantalla" y recibe un rectángulo.

**Lo que se pierde frente a C.** El personaje es un *billboard*: se ve desde el ángulo con
el que se renderizó. Si el padre se agacha o rodea la cama, no cuadra. Para cinco segundos
con el teléfono apoyado es aceptable; si el producto evoluciona hacia moverse alrededor del
personaje, hay que reevaluar.

**Sobre `SceneAnalyzer`.** Con ARCore, `LightEstimate` entrega intensidad ambiental y
corrección de color, que es justo lo que calcula `SceneAnalyzer` a mano. El driver de
ARCore lo usa cuando está disponible; el de Camera2 cae al analizador propio. Los dos
producen los mismos uniforms, así que el compositor no se entera.

## Cómo revertir

- **Hacia A:** borrar `ArCoreDriver` y la dependencia de ARCore. El resto no se toca.
- **Hacia C:** es una reescritura del render, no un ajuste. Se conservarían el flujo, la
  grabación y la UI; se perdería el pipeline de assets pre-renderizados.
