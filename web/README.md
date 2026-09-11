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
| **CERTIFICADO** | El documento que deja el Ratón, para imprimir o dejar bajo la almohada | Rellenar |

## Ajustes: un botón, un sitio

Todo lo configurable vive en una hoja: el engranaje de arriba a la derecha del arranque, y
*Ajustes* bajo los controles una vez encendida la cámara. Los dos abren lo mismo.

Es una **hoja inferior** y no una pantalla entera a propósito: los deslizadores del ajuste
fino solo sirven si se ve la escena mientras se mueven.

| Sección | Qué hay | Se guarda |
|---|---|---|
| **Tema** | Automático, claro u oscuro | Sí |
| **Al grabar** | Micrófono | Sí |
| **Ajuste fino de la imagen** *(doblado)* | Los seis parámetros del grading, el rango limitado y **Restablecer** | No |
| **Diagnóstico** *(oculto)* | El HUD de uniforms, fps y escena | — |

Dos decisiones que no son obvias:

- **El ajuste fino no se guarda, y el tema y el micrófono sí.** Una preferencia vale para
  siempre; un afinado es de una escena concreta, y heredar de noche el arreglo que se hizo
  ayer en otro cuarto es peor que empezar de cero. Por eso **Restablecer** está dentro, al
  lado de lo que puede estropear: hasta ahora se podía dejar la imagen inservible sin más
  salida que recargar.
- **El diagnóstico no está a la vista.** Son números crudos (`uExposureMatch`, sigma de la
  escena) que un padre a las dos de la mañana no tiene por qué ver nunca. Se destapa con
  `?dev=1` o con **siete toques en el título** de la hoja.

## Dos temas, y la app no elige por su cuenta

Claro y oscuro, con **tres estados**: sigue al sistema (lo de fábrica), siempre claro, o
siempre oscuro. Se eligen en *Ajustes*, y la elección se guarda.

Las tres opciones se enseñan **a la vez**, no como un botón que rota al tocarlo: un icono
que cambia obliga a dar toques hasta acertar y nunca dice cuántas opciones hay.

No es indecisión. El diseño de la ronda 1 pedía oscuro fijo porque la app se usa de noche
junto a un niño dormido y la pantalla es casi la única luz del cuarto; el claro se lee
mejor a cualquier otra hora y es lo que la mayoría espera. Los dos motivos son buenos y se
contradicen, así que decide quien sabe qué hora es y dónde está.

Tres cosas que conviene saber si se tocan los estilos:

- **Nada de colores escritos a mano fuera del bloque `:root`.** Si un color difiere entre
  temas es un token; si no, no lo es. Cada valor escrito en una regla suelta es un fallo
  de tema esperando a que alguien lo vea.
- **Sobre el vídeo en vivo la interfaz se apoya en velos degradados, no en planchas
  opacas.** Una plancha blanca a pantalla completa de noche es una linterna, y además
  taparía la cama, que es lo único que hay que ver. Los velos se desvanecen hacia el
  centro.
- **Los tokens del tema oscuro están duplicados** —uno para «el sistema está en oscuro» y
  otro para «el usuario lo eligió»— porque sin preprocesador no hay forma de evitarlo. La
  prueba del asistente compara los dos bloques y falla si alguien toca uno y olvida el
  otro.

El **certificado no sigue el tema**: es papel y se imprime. Un documento oscuro se lee mal
en papel y se come un cartucho.

## La paleta es el personaje

Los colores de la interfaz están **medidos sobre el render del personaje**
(`assets/raton_perez.png`), no elegidos a ojo: se agruparon los píxeles por matiz y se
tomó el representativo de cada familia. El chándal rojo y negro da el fondo y el acento,
las rayas blancas dan el texto, el pelaje da el gris tenue, las zapatillas dan el magenta
de celebración y el cristal de las gafas da el azul de ambiente. Los valores y el porqué
de cada decisión están en la sección *La paleta sale del personaje* de
[`docs/plan-de-trabajo.md`](../docs/plan-de-trabajo.md).

Lo único que no sale de él es el ámbar del aviso de exposición: es lo único que no puede
confundirse con una acción, y en rojo se confundiría con los botones.

Las **tres rayas** del arranque (`.rayas`) son las del chándal. Dan marca sin depender de
un logotipo que todavía no existe ni de una fuente externa, que la CSP bloquea.

El punto que colocas es el **punto de contacto** con la superficie (`anchorPoint` del
asset), no el centro del cuadro: el ratón queda parado ahí y no flotando.

La grabación arranca la animación y se detiene sola al terminarla. El micrófono va
activado por defecto —la narración en vivo es funcionalidad, no ruido— y se apaga en
*Ajustes*, que recuerda la elección.

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

### El certificado se dibuja en un lienzo, no en HTML

*Certificado del Ratón* va en **dos pasos**: primero los datos —nombre, fecha, qué diente,
cómo estaba y qué dejó a cambio— y el documento al final, al pulsar *Crear el
certificado*.

Antes se enseñaba una vista previa que se redibujaba mientras se escribía. Compitiendo por
la pantalla, el formulario se veía a medias y el documento también; separados, cada uno
ocupa lo que necesita y el certificado llega como lo que es: el resultado. De paso se deja
de redibujar el papel entero —grano incluido— una vez por tecla.

El nombre es lo único obligatorio: sin él el botón no deja pasar, porque un certificado
sin nombre no es un certificado. *Editar* vuelve a los datos conservando lo escrito, para
corregir una errata sin repetirlo todo.

Los campos no son inventados: son los de la convención española del Ratoncito Pérez
—nombre, fecha, qué diente, **estado del diente** y recompensa—, que es más específica
que la del *tooth fairy* anglosajón, donde solo se registran nombre y fecha. El estado
del diente (*súper limpio · limpio · se puede mejorar*) es el guiño de higiene dental que
llevan los certificados que reparten las clínicas, y la recompensa es lo primero que el
niño va a preguntar.

Está dibujado en un **canvas 2D** (`js/certificate.js`) y no maquetado en HTML por la
misma razón que el modo FOTO compone en 2D: el certificado tiene que poder **guardarse y
compartirse como imagen**, igual que la foto y el vídeo. Maquetarlo en DOM obligaría a
mantener dos implementaciones del mismo diseño —una para ver y otra para exportar— y a la
segunda se le olvida siempre algún cambio. Aquí **la vista previa es el archivo**.

Dos consecuencias que conviene saber:

- Es el único sitio de la app con **fondo claro**, a propósito: se imprime. Un documento
  oscuro se lee mal en papel y se come un cartucho.
- El tamaño es **A4 vertical a 150 ppp** (1240x1754), y la hoja impresa lleva solo el
  certificado: la regla `@media print` apaga el formulario, los botones y la cámara. Sin
  limitar también el **alto**, el certificado desbordaba el A4 y salía una segunda página
  en blanco; está comprobado en la prueba.

### Lo que no hace, y no puede hacer

**Detección de planos.** La referencia usa ARCore/ARKit para detectar una superficie real.
En el navegador no hay equivalente: WebXR depende igualmente de ARCore, y en una sesión
inmersiva se pierde el acceso a la textura de cámara que el shader necesita. Aquí el
retículo se coloca a dedo. Es la razón principal por la que existe la fase nativa.

**Guardado automático en la galería.** Ninguna página web puede escribir en el carrete:
no existe API para eso, ni en iOS ni en Android. La única vía es la **hoja de compartir
del sistema** (`navigator.share` con un `File`), donde *Guardar imagen* / *Guardar vídeo*
sí mete el archivo en Fotos. Por eso ese botón es la acción principal del resultado y el
`<a download>` quedó de plan B: en iOS la descarga va a **Archivos**, no a Fotos, y quien
pulsa "Guardar" esperando el carrete no vuelve a encontrar la foto.

Segundo camino en iPhone: mantener pulsada la imagen del resultado → *Añadir a Fotos*.
Depende de que el menú de pulsación larga esté vivo, así que `#shot-img` deshace el
`-webkit-user-select: none` que el `body` pone para que arrastrar al ratón no seleccione
texto. Si alguien vuelve a apagarlo ahí, ese camino desaparece sin ruido.

Para el vídeo hay una condición extra: el carrete no acepta `.webm`. Si el navegador
grabó en webm en vez de mp4 —ver *Sobre el formato de grabación*— el clip se puede
compartir y descargar, pero no guardar en la galería, y la app lo dice en el resultado.

El HUD de arriba muestra en vivo lo que resuelve el `SceneAnalyzer`. **Esos números son
el entregable real de este prototipo**: van a `docs/receta-grading.md` y son los que el
nativo tiene que reproducir en la semana 2.

El deslizador *Toma el color del cuarto* (`whiteBalance`) es el segundo parámetro de arte: en 0 el ratón conserva
su color propio y se ve pegado sobre un cuarto de otro color (una tira LED magenta, una
lamparita ámbar); en 1 adopta la dominante entera y se vuelve una silueta del color de la
pared. Pruébalo en el cuarto real y anota el valor.

Si aparece el aviso naranja, la exposición está tocando el borde del rango: el valor
correcto para esa luz queda fuera. Mueve *Oscurecer, como mucho* en el ajuste fino y compara — esa es la
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
js/certificate.js   el certificado: se dibuja en canvas, se guarda y se imprime
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

