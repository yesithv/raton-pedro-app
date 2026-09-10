# tools/

Cadena de herramientas para la fase de validación. Nada de esto va al dispositivo:
es el ground truth contra el que se valida el pipeline nativo.

```
make_placeholder.py   material sintético para probar la cadena hoy
build_effect.py       PNG RGBA -> mp4 empaquetado + metadata   (pipeline de assets)
compose.py            clip + efecto -> mp4 compuesto           (réplica del shader)
```

## Instalación

```bash
pip install -r tools/requirements.txt
```

`imageio-ffmpeg` trae un ffmpeg estático. Si ya tienes uno en el PATH, se usa ese.

## Prueba de humo (5 minutos, sin assets ni grabaciones)

```bash
python3 tools/make_placeholder.py --outdir /tmp/ph --size 720x1280
python3 tools/build_effect.py /tmp/ph/frames -o /tmp/ph/efecto.mp4 --track-size 480x848
python3 tools/compose.py /tmp/ph/cuarto_sintetico.mp4 /tmp/ph/efecto.mp4 -o /tmp/ph/graded.mp4
python3 tools/compose.py /tmp/ph/cuarto_sintetico.mp4 /tmp/ph/efecto.mp4 -o /tmp/ph/naive.mp4 --naive
```

El cuarto sintético **no sirve para validar nada**: su ruido es gaussiano limpio, y el de
un sensor barato a ISO 6400 es cromático, con patrón fijo y correlacionado espacialmente.
Sirve para verificar que los scripts corren y que el empaquetado no tiene costuras.

## El flujo real de los días 1-3

```bash
# 1. Construir el asset una vez, desde la secuencia del placeholder de Sketchfab
python3 tools/build_effect.py frames/ -o assets/raton_v0.mp4 --id raton_v0

# 2. Por cada clip real, generar las dos variantes del A/B
for clip in clips/*.mp4; do
  n=$(basename "$clip" .mp4)
  python3 tools/compose.py "$clip" assets/raton_v0.mp4 -o "out/${n}_naive.mp4" --naive
  python3 tools/compose.py "$clip" assets/raton_v0.mp4 -o "out/${n}_graded.mp4"
done
```

`compose.py` imprime al final los uniforms que resolvió. **Esos números van a
`docs/receta-grading.md`**, y son los mismos que el `SceneAnalyzer` nativo tiene que
producir en la semana 2. Ese es el único motivo por el que estas herramientas existen:
si compusieras a mano en After Effects, no tendrías con qué comparar el spike.

Para barrer el parámetro que más importa:

```bash
for r in 0.20,1.2 0.35,1.2 0.50,1.2; do
  python3 tools/compose.py clip.mp4 assets/raton_v0.mp4 \
    -o "out/exp_${r}.mp4" --exposure-range "$r"
done
```

## Por qué `compose.py` consume el mp4 empaquetado y no los PNG

Porque el resultado tiene que incluir los artefactos del codec: el submuestreo de croma
4:2:0, el banding, la pérdida del CRF 20. Componer desde los PNG produce algo más limpio
de lo que el teléfono puede generar, que es exactamente la mentira que no quieres en un
test de percepción.

## Diferencias conocidas contra el shader

Están acotadas a propósito, pero conviene saberlas al comparar contra el spike nativo:

- **Precisión.** El shader usa `highp` (float32); aquí se calcula en float32 también,
  pero numpy y el GPU redondean distinto. El grano no coincidirá pixel a pixel — su
  amplitud y distribución sí.
- **Filtrado bilineal.** `resize_f32` usa el bilineal de PIL; el GPU usa el suyo, con
  8 bits de precisión de subpixel. Diferencias del orden de 1/256.
- **Costura del empaquetado.** Aquí las dos mitades se separan antes de filtrar, así que
  la costura no puede sangrar. En el shader eso lo garantiza el clamp de `uvColor`
  (ver `shaders/composite.frag`); si alguien lo quita, el shader se separa de esta
  referencia justo en el borde derecho del overlay.

## El balance de blancos es un parámetro de arte, no técnico

`uExposureMatch` es un `vec3`, no un escalar: un escalar no puede igualar la dominante de
color de un cuarto. `compose.py --wb` controla cuánto se iguala:

```bash
for w in 0 0.35 0.5 0.75; do
  python3 tools/compose.py clip.mp4 assets/raton_v0.mp4 -o "out/wb_${w}.mp4" --wb "$w"
done
```

En 0 el personaje conserva su color y se ve pegado encima; en 1 adopta la dominante entera
y se vuelve una silueta del color de la pared. El valor útil está en medio y lo decide el
A/B con padres. `compose.py` reporta cuánta corrección de dominante aplicó.

## Cuatro cosas que salieron de construir esto, y afectan a la app

**1. El ruido no se puede medir sobre un mip de 128x128.** La arquitectura dice que
`SceneAnalyzer` corre sobre un mip reducido. Para la *luminancia* está bien y es barato.
Para el *ruido* no: un mip es un filtro paso-bajo, y promedia justo la señal que intentas
estimar. Hay que medir sigma sobre un recorte a resolución nativa (basta una ventana de
128x128 dentro de la zona donde cae el personaje). Además conviene MAD en vez de
desviación estándar: la desviación estándar cuenta los bordes reales de la escena como si
fueran ruido y sobreestima.

**2. El color del personaje es constante de build time, no de runtime.** Estimarla por
frame en el dispositivo parece natural y está mal: en los frames donde solo se ve el
portal —que es emisivo y muy brillante— el estimador cree que el personaje es brillante y
baja la exposición. `build_effect.py` lo calcula una vez y lo escribe como
`referenceColor` (y `referenceLuma`) en el JSON. En el dispositivo es una lectura de
metadata, gratis y estable.

**3. El ruido hay que medirlo a resolución nativa, la luz no.** Ya está arriba; la
misma medida entrega ahora el color medio del cuarto, no solo su luminancia, que es lo
que alimenta la corrección de dominante.

**4. Los uniforms necesitan suavizado temporal.** `SceneAnalyzer` corre cada 10 frames;
sin un EMA, la exposición salta en escalón tres veces por segundo y el personaje parpadea
de brillo. Eso delata más que no igualar nada. `compose.py` implementa el EMA con
`--smoothing` y corre el análisis con `--analyze-every 10` para replicar la cadencia real
del dispositivo, no para ir más rápido.
