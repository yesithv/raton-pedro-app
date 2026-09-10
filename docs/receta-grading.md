# Receta de grading

Plantilla de los días 4-5. **Todavía vacía**: se llena con los valores que sobrevivan al
test con padres del día 3, medidos sobre los clips reales.

Estos números son la especificación del `SceneAnalyzer` nativo. En la semana 2, el spike
de Android tiene que producir estos mismos valores frente a los mismos clips; si no, el
spike está mal, no la receta.

## Cómo se llena

`tools/compose.py` imprime al final de cada corrida los uniforms que resolvió. Se
transcriben aquí, con la condición de luz del clip y el veredicto del test.

## Valores por condición de luz

| Condición | Clip | ganancia | dominante (wb) | uGrainAmount | uSoftness | ¿Lo compartiría? |
|---|---|---|---|---|---|---|
| Tira LED de color (magenta/azul) | | | | | | |
| Lamparita cálida cerca | | | | | | |
| Lamparita tenue | | | | | | |
| Luz de pasillo por la puerta | | | | | | |
| Ventana con luz de calle | | | | | | |
| Oscuridad total | | | | | | |
| Gama baja, ISO alto | | | | | | |

La tira LED de color va primero porque es la condición de la app de referencia, y porque
es la que más castiga un `uExposureMatch` escalar.

## Rangos de clamp

El rango de `uExposureMatch` es **la decisión de producto más importante de esta fase**,
no un detalle de implementación.

En un cuarto realmente oscuro, la exposición físicamente correcta deja al personaje casi
invisible. Subir el piso lo hace legible a costa de realismo. Ese piso es una decisión de
dirección de arte que se toma mirando el A/B con padres, no ajustando código.

`compose.py` avisa explícitamente cuando la exposición toca el piso o el techo, y con qué
valor crudo. Cuando eso pasa en un clip real, hay que llevar dos o tres valores del piso
al test y dejar que el resultado decida.

| Parámetro | Piso | Techo | Justificación |
|---|---|---|---|
| ganancia global | | | |
| `uGrainAmount` | | | |
| dominante por canal | | | |

**Fuerza de balance de blancos (`--wb`, 0..1).** Es la segunda decisión de arte, y tiene
el mismo carácter que el piso de exposición: en 0 el personaje conserva su color propio y
se ve pegado sobre un cuarto de otro color; en 1 adopta la dominante del cuarto por
completo y se convierte en una silueta del color de la pared, que se ve tan falso como no
igualar nada. El valor útil está en medio y lo decide el A/B, no el código.

| Fuerza probada | Veredicto |
|---|---|
| 0.00 | |
| 0.35 | |
| 0.50 | |
| 0.75 | |

## Sombra de contacto

Valores que van a la spec del animador (sección 6 de la arquitectura), una vez validados:

| Parámetro | Valor | Notas |
|---|---|---|
| Densidad máxima (alfa) | | |
| Radio de difuminado | | |
| Desplazamiento respecto al punto de contacto | | |

## Veredicto del día 3

- [ ] Variante ingenua
- [ ] Variante con grading foto-realista
- [ ] Variante estilizada

**Decisión:**

**Criterio:** continúa si la mayoría **lo compartiría**, no si la mayoría se lo cree.
Ver corrección #2 en `plan-de-trabajo.md`.
