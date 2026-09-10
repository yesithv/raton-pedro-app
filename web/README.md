# Prototipo web

Cámara en vivo + composición del ratón + captura de foto, en el navegador del teléfono.
Sin instalar nada.

**Qué es:** la forma más barata de tener la composición en las manos y en un cuarto real.
El shader es literalmente el mismo archivo que va al nativo (`shaders/composite.frag`), y
el asset es el mismo mp4 empaquetado que produce `tools/build_effect.py`.

**Qué no es:** la app. No graba video con encoder de hardware (eso es MediaCodec /
AVAssetWriter), y el rendimiento en gama baja dentro de un navegador es peor que el del
nativo. Sirve para decidir dirección de arte y para validar la matemática de composición,
no para medir fps de producción.

## Cómo abrirlo en el teléfono

`getUserMedia` exige **HTTPS**. La vía sin instalar nada es GitHub Pages:

1. En el repo → **Settings → Pages**
2. *Source*: `Deploy from a branch`
3. Branch: `claude/ratón-pérez-ar-architecture-mqz01l`, carpeta `/ (root)` → **Save**
4. Espera 1-2 minutos y abre en el teléfono:
   `https://yesithv.github.io/raton-pedro-app/web/`

La carpeta tiene que ser la raíz del repo, no `/web`: la página carga el shader desde
`../shaders/`, que es lo que evita tener dos copias del shader.

En local funciona sin HTTPS porque `localhost` está exento:

```bash
python3 -m http.server 8000     # desde la raíz del repo
# http://localhost:8000/web/
```

## Uso

| Acción | Gesto |
|---|---|
| Colocar al ratón | Tocar la pantalla (el punto que tocas es el punto de contacto con la superficie, no el centro) |
| Mover | Arrastrar |
| Escalar | Pellizcar |
| Reproducir la animación | Botón *Reproducir* |
| Capturar | Botón *Foto* → Guardar o Compartir |
| Ver y ajustar los uniforms | Botón *Ajustes* |

El HUD de arriba muestra en vivo lo que resuelve el `SceneAnalyzer`. **Esos números son
el entregable real de este prototipo**: van a `docs/receta-grading.md` y son los que el
nativo tiene que reproducir en la semana 2.

Si aparece el aviso naranja, la exposición está tocando el borde del rango: el valor
correcto para esa luz queda fuera. Mueve el piso en *Ajustes* y compara — esa es la
decisión de realismo contra legibilidad, y se toma mirando, no calculando.

## Estructura

```
index.html          UI
app.css
js/compositor.js    WebGL2. Carga shaders/composite.{vert,frag} y los reescribe a WebGL
js/analyzer.js      SceneAnalyzer: luma de un mip, ruido de un recorte nativo, EMA
js/main.js          orquestación, gestos, foto
assets/             asset empaquetado + metadata (generados por tools/build_effect.py)
```

## Diferencias contra el shader del dispositivo

Son dos, y están acotadas en `toWebGL()` de `compositor.js`:

1. `samplerExternalOES` → `sampler2D`. En Android la textura de cámara es una textura OES
   externa de `SurfaceTexture`; en el navegador es una textura 2D subida desde un
   `<video>`. El muestreo es idéntico.
2. Sobra la directiva `#extension` que habilitaba lo anterior.

Cualquier otra divergencia sería un bug: si la matemática deja de ser la misma, el
prototipo deja de valer como referencia del nativo.

## Sobre el `.webm`

`build_effect.py --webm` emite un VP9 hermano del mp4. **Ningún teléfono lo necesita**:
Safari en iOS y Chrome en Android decodifican H.264 por hardware. Existe porque hay builds
de Chromium y de Firefox compilados sin códecs propietarios, y ahí el `<video>` falla con
"no supported sources", que en pantalla se ve idéntico a "el shader no dibuja nada".

## Regenerar el asset

```bash
python3 tools/make_placeholder.py --outdir /tmp/ph --size 1080x1920
python3 tools/build_effect.py /tmp/ph/frames -o web/assets/portal_placeholder.mp4 \
    --id portal_placeholder --track-size 720x1280 --webm
```
