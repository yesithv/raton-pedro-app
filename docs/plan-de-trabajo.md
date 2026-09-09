# Plan de trabajo — Ratón Pérez AR

Compañero de `arquitectura.md`. Ese documento dice **qué** construir; este dice **en qué
orden** y **por dónde empezar**, más las correcciones al propio plan de PoC.

---

## Respuesta corta: por dónde iniciar

Por la **prueba de percepción** (sección 1 de la arquitectura), pero con tres cambios al
plan tal como está escrito:

1. **Hoy mismo: agenda la grabación del material de referencia.** Es lo único con lead
   time físico real. Necesitas cuartos infantiles de verdad, de noche, con niños de verdad
   en la cama, en 3 teléfonos distintos. Eso depende de agendas ajenas, no de ti. Todo lo
   demás lo puedes hacer solo y en cualquier momento; esto no.

2. **No compongas a mano en After Effects.** Construye un **compositor offline** (ffmpeg
   o Python/numpy) que implemente *exactamente* la fórmula del shader:
   premultiplicado over + `uExposureMatch` + `uGrainAmount` + `uSoftness`. Componer a mano
   te da un video bonito y **cero valor transferible**: un artista igualando a ojo en AE
   usa herramientas que el shader no tiene. Si el compositor offline es el mismo modelo
   matemático, los números que ajustes el día 3 son literalmente los uniforms del día 10, y
   el spike de Android tiene un ground truth exacto contra el cual compararse pixel a pixel.

3. **Mete la variante estilizada en la primera ronda de test, no como plan B.** Ver
   corrección #1 abajo.

**Concretamente, el orden de arranque es:** agendar grabaciones → compositor offline →
grabar → generar variantes → testear con padres → decidir.

---

## Cronograma

### Semana 1 — Validación de producto (cero código de app)

| Día | Trabajo | Salida |
|---|---|---|
| 1 | Agendar 4-6 sesiones de grabación. Conseguir ratón placeholder (Sketchfab/Mixamo) y renderizar 5s de PNG RGBA. | Calendario + secuencia PNG |
| 1-2 | Compositor offline con la fórmula del shader y los 4 parámetros expuestos. | Script + CLI |
| 2-3 | Grabar los clips. Generar **3 variantes de cada uno**: ingenua / grading foto-realista / personaje estilizado. | 18 videos |
| 3 | Test con 8-10 padres. | **Gate de producto** |
| 4-5 | Cristalizar la receta: tabla de valores por condición de luz. Escribir el script de build de assets (premult → escalar → empaquetar → H.264). | `docs/receta-grading.md` + `tools/build_effect.sh` |

El script de build de la semana 1 es **el contrato con el animador**. Hasta que exista, no
puedes briefear a nadie con seguridad.

### Semana 2 — Spike Android

Nativo desnudo, sin Flutter. CameraX (o Camera2, ver corrección #3) → GL → MediaCodec →
MediaMuxer. Mínimo 3 dispositivos de gama baja.

Criterios de salida, medidos, no impresionistas:
- 1080p30 sin frames caídos durante 5s de grabación
- Export completo en < 2s tras soltar el botón
- Sin throttling térmico a los 60s de preview continuo
- Archivo < 8 MB
- **Diferencia contra el render offline por debajo del umbral visible** (compara el mismo
  clip de referencia procesado por ambos caminos)

### Semana 3 — iOS + Flutter

- Días 11-12: mismo pipeline con AVFoundation + Metal.
- Días 13-14: integración a Flutter y medición de framerate con la `Texture`.
- Día 14: **go / no-go técnico documentado**.

### Semanas 4-8 — MVP

Recién aquí: UI, catálogo, galería, guardado, compartir. Con el asset final del animador,
que debiste encargar en la semana 2 para que llegue a tiempo.

---

## Correcciones al plan de PoC

### 1. El estilizado va en la primera ronda, no como fallback

El plan actual lo pone como replanteo si falla el foto-realista. Eso convierte una decisión
de dirección de arte en un castigo por fracasar. Agregar una tercera variante al test cuesta
horas y puede ganar:

- Un personaje estilizado tolera muchísimo mejor la disparidad con el feed. El cerebro no
  le exige coherencia fotométrica a algo que ya declaró "dibujo".
- Baja los requisitos del shader (el grading sigue ayudando, pero deja de ser existencial).
- Baja el costo y el riesgo del asset 3D, que es tu partida externa más cara.
- Es más barato de iterar cuando quieras 15 efectos en el catálogo.

Si gana el estilizado, la mitad del riesgo del proyecto desaparece en el día 3. Vale las
horas de averiguarlo.

### 2. La pregunta del test está mal formulada

"¿Le creerías?" mide credibilidad. El padre **sabe** que es falso — él apretó el botón. Ese
no es el criterio de compra.

El criterio real es **intención de compartir**. Un padre que dice "obvio que no es real,
pero está increíble, se lo mando a mi mamá" es un éxito rotundo del producto, y con la
pregunta actual cuenta como fallo.

Preguntas mejores, en este orden:
1. "¿Qué opinas de este video?" (abierta, sin contaminar)
2. "¿Se lo mandarías a alguien? ¿A quién?"
3. "¿Se lo mostrarías a tu hijo/a? ¿Se lo creería?" ← aquí sí la credibilidad, pero medida
   sobre el espectador correcto: el niño
4. "¿Pagarías por esto? ¿Cuánto?"

Y el gate: continúa si **la mayoría lo compartiría**, no si la mayoría se lo cree.

### 3. Evalúa CameraX antes de comprometerte a Camera2

El documento asume Camera2. Para gama baja con Android 9-11 —que es donde vive tu riesgo—
CameraX absorbe una cantidad enorme de quirks por dispositivo que si no vas a pagar tú, uno
por uno, en QA. Entrega la superficie de preview igual y tu pipeline GL no cambia.

Dedica medio día del spike a probar CameraX primero. Si te bloquea el control fino que
necesitas (timestamps, torch, bloqueo de exposición), caes a Camera2 habiendo perdido cuatro
horas. Si funciona, te ahorras semanas de QA.

### 4. Verifica el "Android 9+" contra tus números reales

Android 9 es de 2018. Cada versión que bajas te cuesta dispositivos con encoders raros y
comportamientos de Camera2 divergentes. Antes de fijarlo, mira la distribución real de tu
mercado objetivo. Si Android 10 te cubre el 95%, súbelo: cada punto porcentual de cobertura
por debajo de eso es carísimo en horas de depuración.

### 5. Corta las compras in-app del MVP

`EffectCatalog` menciona precios y estado de compras. Eso es una semana de trabajo (dos SDKs,
restauración, recibos, sandbox de pruebas) que además complica la revisión en tienda.

En el MVP, un efecto, gratis. Lo que necesitas medir primero es si la gente **termina** el
video y lo **comparte** — no si paga. Si nadie comparte, el precio da igual.

### 6. Encarga el asset 3D en la semana 2, no cuando esté todo listo

Es tu única dependencia externa con lead time largo (semanas). El spike técnico corre
perfectamente con el placeholder. Manda el brief en cuanto tengas el script de build y la
receta de grading — es decir, al terminar la semana 1.

### 7. Revisa las políticas de tienda para apps infantiles antes de construir

30 minutos de investigación en la semana 1, no en la semana 8:
- Google Play Families Policy y la declaración de público objetivo
- Apple Kids Category
- Qué implica que la cámara apunte a un menor y qué puedes guardar

Esto puede prohibirte SDKs de analítica y publicidad de terceros, y condiciona decisiones de
arquitectura que son caras de revertir. Es barato saberlo ahora.

### 8. Falta el módulo de "qué pasa después de grabar"

La arquitectura termina en `ArRecordingDone`. En la práctica el trabajo restante es:
guardar en la galería del sistema, permisos de fotos (que difieren mucho entre Android 10,
11, 13+ e iOS), hoja de compartir, y qué se ve si el usuario mata la app a mitad. Es más
trabajo del que parece y suele comerse una semana entera de QA. Ponlo en el plan del MVP
como partida propia.

---

## Revisión del shader

La matemática está bien. `rgbP * uExposureMatch` sobre premultiplicado es correcto,
`rgbP + cam * (1 - a)` es el "over" premultiplicado correcto, y el grano en espacio de
pantalla (`vCamUV * 1024.0`) es la decisión acertada — el grano de una cámara vive en el
sensor, no pegado al personaje, así que no debe moverse con él.

**Un bug real que hay que arreglar antes de escribirlo en producción:** el blur de 5
muestras sobre `uvColor` puede cruzar la costura del empaquetado. En `uvColor.x` cerca de
0.5 (borde derecho de la mitad de color), el tap `uvColor + vec2(texel.x, 0.0)` lee dentro
del **matte**, que es luma casi blanca donde el personaje es opaco. Resultado: una franja
brillante en el borde derecho del overlay. Lo mismo aplica al filtrado bilineal en la
costura, incluso sin el blur.

Arreglos, en orden de preferencia:
1. Clampear: `uvColor.x = clamp(uvColor.x, texel.x, 0.5 - texel.x)` y el equivalente para
   `uvMatte`.
2. Dejar una banda de guarda de 8px de negro entre las dos mitades en el empaquetado.
3. Apoyarse solo en el margen de seguridad del 5% del animador — funciona, pero depende de
   que nadie lo incumpla nunca, y alguien lo va a incumplir.

Haz el (1) y el (2). Cuestan nada.
