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

| Condición | Clip | uExposureMatch | uGrainAmount | uSoftness | ¿Lo compartiría? |
|---|---|---|---|---|---|
| Oscuridad total | | | | | |
| Lamparita tenue | | | | | |
| Lamparita cálida cerca | | | | | |
| Luz de pasillo por la puerta | | | | | |
| Ventana con luz de calle | | | | | |
| Gama baja, ISO alto | | | | | |

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
| `uExposureMatch` | | | |
| `uGrainAmount` | | | |

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
