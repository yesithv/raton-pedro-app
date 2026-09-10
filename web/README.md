# Prototipo web

Cámara en vivo, composición del ratón, **grabación de video con micrófono** y captura de
foto, en el navegador del teléfono. Sin instalar nada.

**Qué es:** la forma más barata de tener la composición en las manos y en un cuarto real.
El shader es literalmente el mismo archivo que va al nativo (`shaders/composite.frag`), y
el asset es el mismo mp4 empaquetado que produce `tools/build_effect.py`.

**Qué no es:** la app. Graba con `MediaRecorder`, no con encoder de hardware sobre una
input Surface (eso es MediaCodec / AVAssetWriter), y el rendimiento en gama baja dentro de
un navegador es peor que el del nativo. Tampoco hace detección de planos: WebXR depende
igualmente de ARCore, así que la colocación es por toque. Sirve para decidir dirección de
arte y validar la composición, no para medir fps de producción.

## Cómo abrirlo en el teléfono

`getUserMedia` exige **HTTPS**. La vía sin instalar nada es GitHub Pages:

1. En el repo → **Settings → Pages** → *Source*: **GitHub Actions** (una sola vez; no se
   puede automatizar, ver la cabecera de `.github/workflows/pages.yml`)
2. Fusiona a `main`. `.github/workflows/pages.yml` se dispara con cualquier cambio en
   `web/**` o `shaders/**` y publica el sitio.
3. Espera 1-2 minutos y abre en el teléfono:
   `https://yesithv.github.io/raton-pedro-app/web/`

El workflow copia `web/` y `shaders/` conservando su posición relativa: la página carga el
shader desde `../shaders/`, que es lo que evita tener dos copias del mismo archivo.

En local funciona sin HTTPS porque `localhost` está exento:

```bash
python3 -m http.server 8000     # desde la raíz del repo
# http://localhost:8000/web/
```

Aviso sobre ese servidor: `python3 -m http.server` **no responde a peticiones HTTP
Range**, así que el `<video>` no puede buscar (`seekable` queda en `[0,0]`). La app no
depende de buscar —los pasos con personaje reproducen en bucle— pero si añades algo que
sí lo necesite, fallará solo en local y funcionará en Pages, que sí soporta Range.

## El flujo

Reproduce paso por paso el asistente de la app de referencia:

| Paso | Qué hace | Gesto |
|---|---|---|
| **Inicio** | Crear video / Tomar foto | — |
| **ESCANEAR** | Colocar el retículo donde aparecerá el ratón | Arrastrar |
| **POSICIÓN** | Acercar o alejar al ratón | Arrastrar en vertical |
| **TAMAÑO** | Hacerlo más grande o más pequeño | Pellizcar |
| **EDITAR** | Escoger entre las tres animaciones | ‹ › |
| **GRABAR** | Linterna, grabar, foto | Botón rojo |
| **FOTO** | Cámara frontal + ratón encima, para la foto con el niño | Arrastrar y pellizcar |

El punto que colocas es el **punto de contacto** con la superficie (`anchorPoint` del
asset), no el centro del cuadro: el ratón queda parado ahí y no flotando.

La grabación arranca la animación y se detiene sola al terminarla. El micrófono va
activado por defecto —la narración en vivo es funcionalidad, no ruido— y se puede apagar
en *Ajustes*, donde también están los uniforms del grading en vivo.

### El modo FOTO no pasa por el shader

*Tomar foto* no entra en el asistente: abre la **cámara frontal** con el ratón ya puesto
encima, y ahí se arrastra, se pellizca y se dispara. El botón `⟳` cambia entre frontal y
trasera; el `⇄` gira al ratón para que mire al otro lado. Al salir del paso se vuelve sola
a la cámara trasera.

El ratón de este paso es **`assets/raton_perez.png`**, un PNG con alfa, no un frame del
atlas `color | matte`. Es deliberado:

- Una foto no necesita animación, y el `<video>` del overlay es la pieza que más se rompe
  en un móvil: autoplay bloqueado, códecs que faltan, decodificadores ocupados. Cuando
  falla, la pantalla se queda con la cámara sola y parece que la app no hace nada. Un
  `<img>` siempre pinta.
- Por lo mismo el ratón va en el **DOM**, encima del lienzo, no dentro del shader. La
  captura lo compone aparte en un canvas 2D (`composeShot()` en `js/main.js`), repitiendo
  la misma geometría que usa la vista previa y añadiendo la sombra.

Lo que se pierde con esa decisión es el grading: aquí el ratón **no** adopta la exposición
ni la dominante de color del cuarto, cosa que sí hace el modo vídeo. Para una foto con
flash o con luz de pasillo se nota poco; si llega a molestar, la salida es dibujar también
este paso con el shader dándole un matte a partir del alfa del PNG, no volver al `<video>`.

El PNG sale del render original con `python3 tools/crop_alpha.py`, que lo recorta al
rectángulo con píxeles opacos y le deja un margen para la sombra.

### Lo que no hace, y no puede hacer

**Detección de planos.** La referencia usa ARCore/ARKit para detectar una superficie real.
En el navegador no hay equivalente: WebXR depende igualmente de ARCore, y en una sesión
inmersiva se pierde el acceso a la textura de cámara que el shader necesita. Aquí el
retículo se coloca a dedo. Es la razón principal por la que existe la fase nativa.

**Guardado automático en la galería.** El navegador no escribe en el carrete; hay que
usar Compartir o Guardar.

El HUD de arriba muestra en vivo lo que resuelve el `SceneAnalyzer`. **Esos números son
el entregable real de este prototipo**: van a `docs/receta-grading.md` y son los que el
nativo tiene que reproducir en la semana 2.

El deslizador *Balance color* es el segundo parámetro de arte: en 0 el ratón conserva
su color propio y se ve pegado sobre un cuarto de otro color (una tira LED magenta, una
lamparita ámbar); en 1 adopta la dominante entera y se vuelve una silueta del color de la
pared. Pruébalo en el cuarto real y anota el valor.

Si aparece el aviso naranja, la exposición está tocando el borde del rango: el valor
correcto para esa luz queda fuera. Mueve el piso en *Ajustes* y compara — esa es la
decisión de realismo contra legibilidad, y se toma mirando, no calculando.

## Estructura

```
index.html          UI
app.css
js/flow.js          definición del asistente: pasos, textos, gestos
js/compositor.js    WebGL2. Carga shaders/composite.{vert,frag} y los reescribe a WebGL
js/analyzer.js      SceneAnalyzer: color de un mip, ruido de un recorte nativo, EMA
js/recorder.js      canvas.captureStream + MediaRecorder, con micrófono
js/main.js          máquina de estados, gestos, grabación, foto
assets/             catálogo, assets empaquetados y metadata (tools/build_effect.py)
assets/raton_perez.png  el ratón del modo FOTO: PNG con alfa, sin vídeo ni shader
```

## Regenerar el catálogo

Las tres animaciones son placeholders sintéticos con distinto movimiento. Para
regenerarlas:

```bash
for v in entra_y_es_descubierto es_descubierto_y_se_esconde saluda_y_se_va; do
  python3 tools/make_placeholder.py --outdir /tmp/cat/$v --variant $v --size 1080x1920
  python3 tools/build_effect.py /tmp/cat/$v/frames -o web/assets/$v.mp4 \
      --id $v --track-size 720x1280 --webm
done
```

`web/assets/catalog.json` lista los tres con su título. Cuando llegue el personaje real
del animador, se sustituyen las secuencias PNG y el resto del pipeline no cambia.

## Diferencias contra el shader del dispositivo

Son dos, y están acotadas en `toWebGL()` de `compositor.js`:

1. `samplerExternalOES` → `sampler2D`. En Android la textura de cámara es una textura OES
   externa de `SurfaceTexture`; en el navegador es una textura 2D subida desde un
   `<video>`. El muestreo es idéntico.
2. Sobra la directiva `#extension` que habilitaba lo anterior.

Cualquier otra divergencia sería un bug: si la matemática deja de ser la misma, el
prototipo deja de valer como referencia del nativo.

## Sobre el formato de grabación

El orden de preferencia de `recorder.js` pone los códecs **explícitos** primero y
`video/mp4` a secas al final. No es cosmético: Chromium acepta `MediaRecorder` con
`video/mp4` y produce **VP9 dentro de un contenedor mp4**. Ese archivo se llama `.mp4`,
no lo abre Fotos de iOS, ni QuickTime, ni WhatsApp, y el usuario acaba con un video que no
puede compartir — que es justo el punto del producto. Verificado con ffmpeg sobre la
salida real: `Stream #0:0 Video: vp9 (Profile 0) (vp09)`.

Con el orden actual, Chrome real y Safari caen en mp4/H.264 y un Chromium sin códecs
propietarios cae en webm/VP9, que al menos es honesto sobre lo que contiene. Si aun así se
acaba en el `video/mp4` ambiguo, la línea de metadatos del clip lo advierte.

Limitación conocida: `MediaRecorder` no escribe la duración en el contenedor (`ffmpeg`
reporta `Duration: N/A`), así que la barra de progreso del reproductor no funciona. Por eso
la previsualización arranca reproduciendo sola: si no, se ve un rectángulo negro y parece
que la grabación falló.

## Sobre el `.webm` del asset

`build_effect.py --webm` emite un VP9 hermano del mp4. **Ningún teléfono lo necesita**:
Safari en iOS y Chrome en Android decodifican H.264 por hardware. Existe porque hay builds
de Chromium y de Firefox compilados sin códecs propietarios, y ahí el `<video>` falla con
"no supported sources", que en pantalla se ve idéntico a "el shader no dibuja nada".

