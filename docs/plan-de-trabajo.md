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

## Hallazgos de la app de referencia

Material: capturas de un video tutorial de una app de Ratón Pérez ya publicada
(`@ratonperez1939`, ~5 años). Es material observado, no un spec: donde la lectura es
incierta, se marca.

### 1. El micrófono vuelve al MVP. La recomendación anterior estaba mal

La sección 4 de la arquitectura decía no grabar micrófono, con este argumento: *"el
micrófono en un cuarto oscuro solo captura ruido de fondo y la respiración del niño"*.
La premisa es falsa. La app de referencia hace de la narración del padre una función
destacada:

> "Al permitir grabar audio puedes agregar tu voz con comentarios de sorpresa para
> hacerlo aun mas realista y sorprender a tus hijos."

El padre **habla en vivo** durante la grabación. Eso no es ruido: probablemente sea la
mitad de por qué el video se comparte después. Vuelven al MVP el permiso de micrófono, el
encoder AAC, el mixer y —lo caro— la sincronización audio/vídeo, con el problema de
`SENSOR_INFO_TIMESTAMP_SOURCE` en Android que ya está documentado en la sección 4.

### 2. El cuarto no está oscuro: tiene luz de color

Toda la demo transcurre en un cuarto con luz magenta intensa (aparenta ser tira LED RGB,
hoy habitual en cuartos infantiles). Buena noticia para el ruido: hay luz de sobra. Mala
para el shader: `uExposureMatch` era un escalar, y un escalar no puede igualar una
dominante de color.

Ya está corregido: `uExposureMatch` es un `vec3`. Ver la nota de balance de blancos en
`shaders/composite.frag` y el nuevo parámetro `--wb` de `compose.py`.

No es un caso exótico. La propia arquitectura describe *"balance de blancos cálido de una
lamparita"*, que es el mismo problema en ámbar.

### 3. La salida primaria es video, no foto

"El video se grabará en tu galería". Sin hoja de compartir ni paso de edición: grabar y
guardar. Eso confirma que `MediaCodec` / `AVAssetWriter` están en el MVP, y que el módulo
de post-grabación (guardado en galería y permisos de fotos) es partida propia, como ya
estaba anotado en la corrección #8.

### 4. El personaje es estilizado, y ocupa mucho menos pantalla del previsto

Caricatura con ropa amarilla, no foto-realista — nítido en el avatar del canal, menos en
el metraje. Si esa es la dirección, buena parte del riesgo de la sección 1 se reduce.

Y en el metraje el ratón ocupa **~10% del alto de pantalla**, no el 35% que hay hoy como
`defaultScaleFactor`. Un personaje pequeño perdona mucho más: menos píxeles donde detectar
que el grano, la nitidez o la dominante no cuadran. Conviene revisar ese valor por
defecto.

### 5. UI observada

Casa (arriba izq), volver (arriba der), linterna (abajo izq), botón de grabar (abajo
centro; cuadrado rojo mientras graba). Toast "Video Saved to Gallery" al terminar. La
linterna coincide con el `setTorch` que ya está en el contrato de canales.

---

## Prototipo web

`web/` es una app funcional: cámara en vivo, composición del ratón y captura de foto, en
el navegador del teléfono y sin instalar nada. Usa el mismo `shaders/composite.frag` y el
mismo asset empaquetado que el nativo.

Instrucciones para abrirlo (GitHub Pages) en [`web/README.md`](../web/README.md).

No sustituye al nativo: no graba video con encoder de hardware y el rendimiento en gama
baja dentro de un navegador no es representativo. Sirve para decidir dirección de arte y
validar la composición sobre cámaras reales, que es justo el riesgo número uno.

---

## Herramientas ya disponibles

El día 1 no arranca en blanco. En `tools/` está la cadena de la fase de validación,
probada end to end:

| Script | Qué hace |
|---|---|
| `tools/make_placeholder.py` | Material sintético para probar la cadena hoy, sin assets ni grabaciones |
| `tools/build_effect.py` | PNG RGBA → mp4 empaquetado + metadata. Es el pipeline de assets y el contrato con el animador |
| `tools/compose.py` | Clip de referencia + efecto → mp4 compuesto. Réplica exacta del shader |

`shaders/composite.frag` es el shader corregido, y la fuente de verdad que `compose.py`
replica. Instrucciones de uso en `tools/README.md`; los valores que salgan van a
`docs/receta-grading.md`.

Prueba de humo, 5 minutos:

```bash
pip install -r tools/requirements.txt
python3 tools/make_placeholder.py --outdir /tmp/ph --size 720x1280
python3 tools/build_effect.py /tmp/ph/frames -o /tmp/ph/efecto.mp4 --track-size 480x848
python3 tools/compose.py /tmp/ph/cuarto_sintetico.mp4 /tmp/ph/efecto.mp4 -o /tmp/ph/graded.mp4
python3 tools/compose.py /tmp/ph/cuarto_sintetico.mp4 /tmp/ph/efecto.mp4 -o /tmp/ph/naive.mp4 --naive
```

---

## Revisión del shader

La matemática está bien. `rgbP * uExposureMatch` sobre premultiplicado es correcto,
`rgbP + cam * (1 - a)` es el "over" premultiplicado correcto, y el grano en espacio de
pantalla (`vCamUV * 1024.0`) es la decisión acertada — el grano de una cámara vive en el
sensor, no pegado al personaje, así que no debe moverse con él.

Tres correcciones, ya aplicadas en `shaders/composite.frag`.

### 1. `precision mediump float` rompe el grano en el dispositivo real

Es el más caro de los tres, porque **no se reproduce en un emulador de escritorio**,
donde `mediump` es float32. Solo aparece en gama baja, donde `mediump` es realmente half
float, y por tanto solo lo vas a ver tarde.

`hash13()` hace `fract()` sobre valores de hasta ~1024 (`vCamUV * 1024.0`), y luego suma
otro término del orden de 100. Con una mantisa de 10 bits, `fract()` de un valor ~100 deja
unos 3 bits útiles de fracción: el hash colapsa a un puñado de valores y el "grano" sale
como bandas o bloques fijos en vez de ruido. Es el modo de fallo clásico de los hash de
`fract()` en móvil.

Arreglo: `precision highp float`. En GLSL ES 3.0 `highp` es obligatorio en el fragment
shader, así que no hay razón para no usarlo. Si el grano llegara a costar rendimiento, la
salida no es bajar la precisión: es un lookup a una textura de ruido de 256x256 desplazada
por frame.

### 2. El blur de 5 taps cruza la costura del empaquetado

En `uvColor.x` cerca de 0.5 (borde derecho de la mitad de color), el tap
`uvColor + vec2(texel.x, 0.0)` lee dentro del **matte**, que es luma casi blanca donde el
personaje es opaco. Resultado: una franja brillante en el borde derecho del overlay. El
filtrado bilineal hace lo mismo en la costura, incluso sin blur.

Arreglo, dos capas:

1. **Clamp de UV en el shader**, que es lo que resuelve el problema.
2. **Borde de 2px forzado a cero en cada mitad, al construir el asset**, ya implementado
   en `build_effect.py`. Así, aunque el clamp fallara, el sangrado es negro y
   transparente, es decir invisible.

Un guard band *entre* las dos mitades también funcionaría, pero es peor: rompe el reparto
limpio 0.0-0.5 / 0.5-1.0 y obliga a pasar los límites como uniforms. El borde a cero
protege igual sin tocar el layout de UVs.

`build_effect.py` además avisa si encuentra contenido en esa zona, que es la señal de que
el animador se comió el margen de seguridad del 5%.

### 3. `resize` con float64 — no es del shader, pero cuesta un día

No afecta al dispositivo, pero sí a la herramienta de validación, y lo dejo anotado porque
es el tipo de bug que hace desconfiar de los resultados sin saber por qué: `PIL` con
`mode="F"` espera float32 y **no valida el dtype**. Con un array float64 reinterpreta los
bytes en silencio y devuelve ~0, sin excepción. Se manifestaba como "el grading deja al
personaje demasiado oscuro", que parece una decisión de arte y no un bug. Se detectó
midiendo píxeles: la matemática predecía luma 0.107 y el resultado daba 0.010.

Moraleja para la semana 2: cuando compares el spike nativo contra el render offline,
**mide números, no mires imágenes**. Un factor de 10 en una escena oscura se ve como una
decisión estética plausible.

### 4. El shader necesitaba DOS juegos de UVs, no uno

Salió de portarlo a WebGL, pero afecta igual al nativo. El shader usaba `vCamUV` tanto
para muestrear la cámara como para posicionar el overlay, y esos dos espacios no
coinciden: el sensor entrega 4:3 o 16:9 y la pantalla del teléfono es ~9:19.5, así que el
feed va recortado en "cover" respecto a la superficie de presentación.

`uOverlayOrigin` viene de dónde el usuario tocó la **pantalla**. Mezclarlo con la
coordenada de textura del **sensor** coloca al personaje desplazado respecto al dedo, y el
error crece con la diferencia de aspecto. En un teléfono típico es de varios puntos
porcentuales de la pantalla: suficiente para que el ratón no quede donde lo pusiste.

Ahora `composite.vert` emite `vCamUV` (textura) y `vScreenUV` (pantalla). El overlay se
posiciona con `vScreenUV`; el grano se queda en `vCamUV`, porque el ruido del sensor vive
en el sensor.

Este bug **no aparece en el compositor offline**, donde el clip y la salida tienen la
misma resolución y los dos espacios coinciden. Solo en el dispositivo. Es un buen
recordatorio de que la referencia offline valida la matemática de composición, no la
geometría de presentación.

---

## Correcciones al `SceneAnalyzer`

Salieron de implementar el analizador en `compose.py`. Las tres afectan al nativo.

### El ruido no se puede medir sobre un mip de 128x128

La arquitectura dice que `SceneAnalyzer` corre sobre un mip reducido del frame. Para la
**luminancia** está bien y es barato. Para el **ruido** no: un mip es un filtro paso-bajo,
y promedia exactamente la señal que intentas estimar. El sigma se mide sobre un recorte a
resolución nativa — basta una ventana de 128x128 dentro de la zona donde cae el personaje.

Además, usa **MAD** (desviación absoluta mediana × 1.4826) y no desviación estándar: la
desviación estándar cuenta los bordes reales de la escena como si fueran ruido y
sobreestima el sigma, sobre todo en cuartos con muebles.

### La luma del personaje es constante de build time, no de runtime

Estimarla por frame en el dispositivo parece lo natural y está mal. En los frames donde
solo se ve el portal —que es emisivo y muy brillante— el estimador concluye que el
personaje es brillante y baja la exposición; cuando el ratón aparece, la sube. El
personaje pulsa de brillo justo durante la emergencia, que es el momento que más se mira.

`build_effect.py` la calcula una vez sobre los píxeles sólidos del asset y la escribe como
`referenceLuma` en el JSON. En el dispositivo es una lectura de metadata: gratis, estable,
y elimina una fuente de error entera.

**Esto agrega un campo al contrato del JSON de la sección 6 de la arquitectura.**

### Los uniforms necesitan suavizado temporal

`SceneAnalyzer` corre cada 10 frames. Sin un EMA entre análisis, la exposición salta en
escalón tres veces por segundo y el personaje parpadea de brillo — que delata más que no
igualar nada. `compose.py` usa un EMA con coeficiente 0.15 por análisis; el nativo debe
hacer lo mismo.

---

## El hallazgo que va a dominar el día 3

Corriendo el compositor sobre una escena oscura, la exposición se pega al piso del rango
(0.35) porque el valor físicamente correcto es más bajo todavía. Traducido: **en un cuarto
realmente oscuro, la exposición correcta deja al personaje casi invisible.**

Ese piso no es un parámetro técnico. Es la tensión central del producto: realismo contra
legibilidad, y cada punto que subes el piso compra visibilidad y paga con credibilidad. No
lo decide el shader ni el `SceneAnalyzer`. Lo decide el A/B con padres.

`compose.py` avisa cuando la exposición está clampeando y con qué valor crudo, justamente
para que esto no pase inadvertido. Cuando salte en un clip real, lleva dos o tres valores
del piso al test del día 3 en vez de elegir uno tú.
