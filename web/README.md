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
| **FOTO** | La cámara del teléfono imitada: visor 4:3, cuadrícula y obturador | Arrastrar y pellizcar |
| **CARTA** | La que deja el Ratón, para imprimir o dejar bajo la almohada | Rellenar |

## Volver a la izquierda, cerrar a la derecha

Una sola convención, en todas las pantallas y siempre a la misma altura: **arriba a la
izquierda se vuelve, arriba a la derecha se cierra.** El cromo del asistente lo tenía al
revés —casa a la izquierda, flecha a la derecha—, que además dejaba la acción de salir en
el sitio de volver.

Los dos iconos van en **SVG**, definidos una vez con `<symbol>` y reutilizados con `<use>`.
No son caracteres de texto (`✕ ← ⌂`): un carácter lo dibuja la fuente del sistema, se ve
distinto en cada teléfono, no siempre existe y no hay forma de darle un grosor de trazo.
Era el problema 4 del brief de rediseño, y la prueba falla si alguien vuelve a meter uno.

La única pantalla sin ✕ es la **cámara**: de ahí no se cierra nada, se vuelve al inicio,
así que lleva la flecha. Y eso deja la derecha libre para la píldora de controles, que es
donde la tiene el teléfono.

## Ajustes: un botón, un sitio

**Dos hojas, y la línea que las separa es dónde estás cuando las abres.** Empezó siendo
una sola con todo dentro, y ahí el tema de la app convivía con el grano del compositor,
que no tienen nada que ver.

| | Se abre desde | Qué hay |
|---|---|---|
| **Ajustes** | El engranaje de arriba a la derecha, en el arranque y en INICIO | Tema · Idioma |
| **La cámara** | El `•••` de FOTO y *Cámara* en la barra del asistente | Cuadrícula · Micrófono · Ajuste fino *(doblado)* · Diagnóstico *(oculto)* |

El engranaje vive **fuera** del arranque. Estuvo dentro, y `#boot` se oculta entero al
encender la cámara: a partir de ahí el tema y el idioma seguían ahí pero ya no había forma
de llegar a ellos. Ahora es el mismo botón y el mismo sitio en las dos pantallas donde se
elige con qué luz quieres la app —el arranque y INICIO—, y **desaparece en los pasos de la
cámara**, donde arriba a la derecha está *cerrar* y la convención de las esquinas manda.

Y al revés: *Cámara* **ya no sale en INICIO**. Ahí todavía no hay escena que mirar, y una
cuadrícula o un deslizador de grano delante de tres tarjetas que dicen qué hace la app no
significan nada.

Las dos son **hojas inferiores** y no pantallas enteras, y la de la cámara se queda más
baja todavía —62 % de la pantalla frente al 86 %— porque los deslizadores del ajuste fino
solo sirven **viendo la escena mientras se mueven**. Es el motivo entero por el que están
ahí y no en los ajustes de la app: con la hoja alta no se ve nada y el control es inútil.

El **idioma cambia la app entera**, y en caliente: la interfaz, los avisos y **la carta que
se imprime**. Cómo funciona está abajo, en *Tres idiomas, y la carta también*.

Dos decisiones que no son obvias:

- **El ajuste fino no se guarda, y el tema, el idioma, la cuadrícula y el micrófono sí.** Una preferencia vale para
  siempre; un afinado es de una escena concreta, y heredar de noche el arreglo que se hizo
  ayer en otro cuarto es peor que empezar de cero. Por eso **Restablecer** está dentro, al
  lado de lo que puede estropear: hasta ahora se podía dejar la imagen inservible sin más
  salida que recargar.
- **El diagnóstico no está a la vista.** Son números crudos (`uExposureMatch`, sigma de la
  escena) que un padre a las dos de la mañana no tiene por qué ver nunca. Se destapa con
  `?dev=1` o con **siete toques en el título** de la hoja.

## Tres idiomas, y la carta también

Castellano, inglés y portugués. Se elige en *Ajustes*, y **la primera vez lo elige el
teléfono**: se mira `navigator.languages` por prefijo —el navegador dice `en-GB` o
`pt-BR`— y si no hay ninguno conocido manda el castellano, que es el idioma de origen.
Una elección a mano gana siempre a la detección: si alguien pide castellano teniendo el
teléfono en inglés, fue a propósito.

**La carta se traduce igual que la pantalla, y es la mitad del trabajo.** Una interfaz en
inglés que escupe un papel en castellano no está traducida, está a medias, y encima el
papel es justo lo que lee el niño. Por eso en `certificate.js` no queda ni una frase
escrita: los meses, el sello, la posdata y la tabla de dientes salen del catálogo, porque
la concordancia de género —«me **la** llevé envuelt**a**» de *una muela*— es gramática del
idioma y no del dibujo. Cada idioma trae su plantilla y usa los huecos que necesita: el
inglés, que no concuerda, deja `terminacion` sin gastar.

```
js/i18n.js          el motor: buscar una clave, rellenar huecos, repasar el DOM
js/idiomas/es.js    el ORIGINAL. Cuando falta una clave en otro idioma, se cae aquí
js/idiomas/en.js
js/idiomas/pt.js
```

**Añadir un idioma es un archivo y una línea** en `i18n.js`. No se toca ninguna pantalla:
el HTML marca *qué* hay que traducir, no qué dice.

| Marca en el HTML | Qué pone |
|---|---|
| `data-t` | el texto del elemento |
| `data-t-html` | igual, pero el texto lleva marcas (`<br>`, `<b>`) |
| `data-t-label` | `aria-label` **y** `title`, que en los botones de icono dicen lo mismo |
| `data-t-aria` · `data-t-title` | por separado, para los pocos que dicen cosas distintas |
| `data-t-placeholder` · `data-t-alt` | lo que se lee dentro de un campo vacío y el texto de una imagen |

Cuatro cosas que conviene saber:

- **Cambia sin recargar.** Este selector se toca estando ya dentro, a veces con un vídeo
  recién grabado en pantalla o con media carta escrita, y una recarga perdería todo eso
  para ahorrarse cuatro llamadas. Lo que cuesta es acordarse de repintar lo que no vive en
  el HTML, y de eso va `refrescarIdioma()` en `main.js`: las dos listas de botones, el paso
  actual, la animación, las fichas del formulario y **los resultados que haya a la vista**
  —su explicación, sus botones y el nombre del archivo—. La regla para no olvidarse de
  ninguno: si un texto se escribe con `textContent` fuera de esa función, o deja su clave
  en `dataset.t`, o hay que repintarlo ahí.
- **Lo elegido se guarda por `id`, no por etiqueta.** El diente y el estado del formulario
  son claves, así que cambiar de idioma con la carta a medias no pierde nada.
- **El `<html lang>` dice la verdad.** Antes se quedaba en `es` a propósito, porque los
  textos seguían en castellano y mentirle al lector de pantalla era peor que no ofrecer el
  idioma. Ahora los textos están. El atributo se pone además en el script **en línea** del
  `<head>`, junto al del tema y por el mismo motivo: gobierna el guionado del navegador y
  los módulos cargan después del primer pintado.
- **Lo que NO se traduce, y a propósito:** el nombre del personaje —es un nombre propio, y
  la firma del papel está trazada con curvas letra a letra, así que traducirlo dejaría la
  carta firmada con otro nombre distinto del que la encabeza— y el **HUD de diagnóstico**,
  que son los nombres reales de los uniforms del shader y los números que van a
  `docs/receta-grading.md`.

La prueba vigila tres cosas que se rompen solas: que **los tres catálogos traen exactamente
las mismas claves** (añadir un texto en `es.js` y olvidarlo en los otros dos no rompe nada
hasta que alguien cambia de idioma, y entonces ya no hay quien lo vea venir), que la carta
**se dibuja distinta** en cada idioma, y que el **peor caso cabe en el papel en los tres**
—`LIMITES.nota` se midió en castellano, y una traducción más larga se saldría en la
impresora de alguien—.

El portugués es **europeo**, y conviene decirlo: entre *telemóvel* y *celular* no hay forma
neutra que suene bien en los dos lados, y fingir que la hay da un texto que no es de nadie.
Si hace falta el de Brasil, se añade `pt-BR` como un idioma más —que es justo para lo que
está montado esto— y no se estropea este.

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

La **carta no sigue el tema**: es papel y se imprime. Un documento oscuro se lee mal
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

### FOTO imita la cámara del teléfono, con las medidas tomadas

*Tomar foto* no entra en el asistente: abre la **cámara frontal** con el ratón ya puesto
encima, y ahí se arrastra, se pellizca y se dispara. Al salir del paso se vuelve sola a la
cámara trasera.

La pantalla está copiada de la app de Cámara de iOS, y las medidas **están tomadas de una
captura real** (1170x2532 a x3, o sea 390 css px de ancho), no escogidas a ojo:

| | Medido | Por qué importa |
|---|---|---|
| **Visor** | 1170x1560 = **4:3 exacto** | Es la proporción de una foto, y ahora la captura se recorta a ella: lo que se ve es lo que se guarda |
| **Bandas** | 13,5% arriba y 24,9% abajo (**1 : 1,84**) | El encuadre del visor sin ellas no se lee como un visor |
| **El velo** | Negro al **~55%**, no negro opaco | Donde el visor marcaba 135 de brillo, la banda marcaba 62. Por eso en el teléfono se sigue viendo la habitación por encima y por debajo del recuadro; con negro opaco pierdes de vista la mitad de a lo que apuntas |
| **Cuadrícula** | En los **tercios** (medida en y=860 y 1383 de un visor de 342 a 1902; los tercios teóricos son 862 y 1382) | Ayuda a colocar al ratón. Se apaga en *Ajustes* |
| **Obturador** | 204 físicos = **68 css px**, disco blanco con aro | Es el gesto que todo el mundo reconoce |

Y lo que va con ello: **el cromo de la app desaparece**. Nada de barra de navegación ni
caja de instrucciones encima del visor — eso es justo lo que delata que no es una cámara.
El aviso del paso pasa a ser una pastilla que se desvanece a los cuatro segundos, y los
controles de la app se reparten como en el teléfono: la ✕ para salir, una píldora arriba a
la derecha con luz, girar al ratón y *Ajustes*, y abajo la miniatura de la última foto, el
botón de cambiar de cámara —los dos **a la altura del disparador**, como en el
teléfono, porque desde la fila de abajo no se llega sin mover la mano— y el carrusel
**VÍDEO · FOTO** debajo.

Dos diferencias deliberadas:

- **El modo activo va en el rojo del chándal**, donde el teléfono pone su amarillo. Se
  imita la forma del control, no la marca de otro.
- **No hay control de zoom.** El `0,5 / 1×` del teléfono es óptico, y Safari en iOS no
  expone el zoom de la cámara por `getUserMedia`. Uno digital no es lo mismo: recorta y
  pierde calidad, que es justo lo contrario de lo que hace el nativo. Antes de fingirlo,
  mejor no ponerlo.

**El contenedor de la cámara no captura toques** (`pointer-events: none`), y eso no es un
detalle: ocupa la pantalla entera por encima del lienzo. Con el valor por defecto, un toque
sobre el visor —que sí los deja pasar— se lo queda el **padre**, y el ratón se queda
clavado: ni se arrastra ni se pellizca. Los toques los recogen solo las bandas, que son lo
único que lleva controles.

Pasó de verdad, y se coló porque la prueba **tocaba la pantalla para colocar al ratón pero
nunca comprobaba que se hubiera movido**. Ahora comprueba las tres cosas: que
`elementFromPoint` en mitad del visor devuelve el lienzo, que arrastrar lo mueve y que
pellizcar lo escala. Un gesto que no se comprueba es un gesto que no está probado.

Esta pantalla va **oscura en los dos temas**, y no es un descuido: no hay ninguna cámara
con el marco blanco. Aquí el tema del sistema no pinta nada, porque lo que manda es el
vídeo que hay debajo.

El ratón de este paso es **`assets/raton_perez.png`**, un PNG con alfa, no un frame del
atlas `color | matte`. Es deliberado:

- Una foto no necesita animación, y el `<video>` del overlay es la pieza que más se rompe
  en un móvil: autoplay bloqueado, códecs que faltan, decodificadores ocupados. Cuando
  falla, la pantalla se queda con la cámara sola y parece que la app no hace nada. Un
  `<img>` siempre pinta.
- Por lo mismo el ratón va en el **DOM**, encima del lienzo, no dentro del shader. La
  captura lo compone aparte en un canvas 2D (`composeShot()` en `js/main.js`), repitiendo
  la misma geometría que usa la vista previa y añadiendo la sombra.
- El ratón se mide contra el **visor** y no contra la pantalla. Si se midiera contra la
  pantalla se podría arrastrar a las bandas —donde el velo lo tapa— y además la foto, que
  se recorta al visor, se lo comería.

Lo que se pierde con esa decisión es el grading: aquí el ratón **no** adopta la exposición
ni la dominante de color del cuarto, cosa que sí hace el modo vídeo. Para una foto con
flash o con luz de pasillo se nota poco; si llega a molestar, la salida es dibujar también
este paso con el shader dándole un matte a partir del alfa del PNG, no volver al `<video>`.

El PNG sale del render original con `python3 tools/crop_alpha.py`, que lo recorta al
rectángulo con píxeles opacos y le deja un margen para la sombra.

### Es una carta, no un diploma

*Carta del Ratón Pérez* va en **dos pasos**: primero los datos —nombre, fecha, qué diente,
cómo estaba y qué dejó a cambio— y la carta al final, al pulsar *Escribir la carta*.

Que sea una carta y no un diploma manda sobre todo lo demás:

- **El texto va alineado a la izquierda y en párrafos.** Un bloque centrado se lee como un
  título; uno alineado, como algo que alguien te ha escrito.
- **Los datos se cuentan dentro del texto**, no en casillas. Una tabla dentro de una carta
  es un formulario. Por eso la tabla de dientes lleva `pronombre`, `posesivo` y
  `terminacion`: sin ellos la carta dice «lo envolví» y «el tuyo» de *una muela*. Vive en
  `idiomas/`, una por idioma, porque eso es gramática y no dibujo.
- **La letra es redonda, no de diploma.** `ui-rounded` da en Apple la SF Rounded, y donde
  no exista se cae en Trebuchet o en la del sistema. Georgia se fue: era la letra de un
  certificado del colegio, y aquí quien escribe es un ratón con gafas y chándal.
- **La firma está trazada, no escrita.** No existe ninguna cursiva garantizada en los tres
  sitios donde esto se ve —Apple trae Snell Roundhand, Windows Segoe Script, Android
  ninguna— y la CSP prohíbe cargar una. Escrita con `font`, cada teléfono firmaría distinto
  y en la mitad caería en Arial. Trazada con curvas sale igual en todas partes, escala sin
  pixelarse y se imprime bien. El grosor se finge repartiendo los trazos: los descendentes
  gruesos y las uniones finas, que es de donde sale el contraste de la pluma.

#### Las palabras del padre

Son **un párrafo más de la carta**: misma letra, mismo tamaño, mismo color, sin comillas y
sin cursiva. En cuanto se marcan como cita dejan de ser del Ratón y pasan a ser un añadido,
que es justo lo contrario de lo que se busca.

Su límite —`LIMITE_NOTA`, hoy **300 caracteres**— sale de **medir el dibujo de verdad**, no
de una cuenta a ojo. El primer número que puse fue 340 «porque quedan seis líneas libres»,
y era falso: en el peor caso —una muela, que lleva la frase más larga, con la frase de
estado más larga y un premio de 24 caracteres— no cabía ni una línea. Midiendo:

| | Techo antes de salirse | Con 300 caracteres |
|---|---|---|
| Peor caso | 562 caracteres | la carta se escribe a 30 px |
| Caso corriente | 618 caracteres | 32 px |

Y si aun así sobra texto, la carta **se apreta un punto** en vez de escribir sobre la
firma, como se apretaría una escrita a mano: 34 → 32 → 30 → 28 px, y 28 px a 150 ppp son
13 puntos, que se leen impresos. La prueba del asistente dibuja una nota de exactamente
`LIMITE_NOTA` en el peor caso y falla si el texto alcanza la despedida, así que el número
no puede quedarse obsoleto en silencio.

#### Los límites los pone el papel

Todos los campos tienen tope, y **todos los topes viven en `js/certificate.js`**, no en el
HTML: quien sabe cuánto cabe es el dibujo. Dos números escritos a mano se separan en cuanto
alguien toca un tamaño, y el que se queda corto siempre es el del formulario.

| Campo | Tope | De dónde sale |
|---|---|---|
| Nombre | 28 caracteres, **obligatorio** | Cabe de sobra en el saludo, que además se encoge solo |
| Fecha | Del **último año hasta hoy** | Una carta se escribe la noche que se cayó el diente o al día siguiente. Hacia delante no hay nada que permitir: un diente no se cae mañana |
| Premio | 24 caracteres | Va dentro de una frase de la carta |
| Palabras del padre | 300 caracteres | Medido (arriba) |

Tres detalles que no son obvios:

- **`min` y `max` en un `<input type=date>` no impiden teclear una fecha fuera de rango**,
  solo la marcan. En un ordenador se escribe a mano y la carta saldría fechada en 2999, así
  que además se corrige al salir del campo.
- **`maxlength` no se aplica a un valor puesto desde el código**, ni en algunos navegadores
  a lo que se pega. Por eso `limpiar()` recorta otra vez en el dibujo, que es la última
  línea de defensa y no puede fiarse del formulario.
- **Los saltos de línea se cambian por un espacio, no se borran.** Borrándolos, un texto
  pegado desde otro sitio sale con las palabras pegadas —«holaqué tal»—. Lo encontró la
  prueba, no yo.

Y el botón apagado **dice por qué**: un botón mudo se lee como una app rota y el usuario se
queda mirando sin saber qué le falta. El aviso solo sale cuando ya se ha tocado el campo;
delante de un formulario recién abierto sería una regañina.

#### El lienzo, y por qué no es HTML

Está dibujada en un **canvas 2D** (`js/certificate.js`) y no maquetada en HTML por la misma
razón que el modo FOTO compone en 2D: tiene que poder **guardarse y compartirse como
imagen**, igual que la foto y el vídeo. Maquetarla en DOM obligaría a mantener dos
implementaciones del mismo diseño —una para ver y otra para exportar— y a la segunda se le
olvida siempre algún cambio. Aquí **la vista previa es el archivo**.

Los campos no son inventados: son los de la convención española del Ratoncito Pérez
—nombre, fecha, qué diente, **estado del diente** y recompensa—, que es más específica que
la del *tooth fairy* anglosajón, donde solo se registran nombre y fecha. El estado del
diente es el guiño de higiene dental, y ninguna de sus tres frases riñe al niño: la que
avisa lo hace de parte del cepillo.

El nombre es lo único obligatorio: sin él el botón no deja pasar. *Editar* vuelve a los
datos conservando lo escrito, para corregir una errata sin repetirlo todo.

Dos consecuencias que conviene saber:

- Es el único sitio de la app con **fondo claro**, a propósito: se imprime. Un documento
  oscuro se lee mal en papel y se come un cartucho.
- El tamaño es **A4 vertical a 150 ppp** (1240x1754), y la hoja impresa lleva solo la
  carta: la regla `@media print` apaga el formulario, los botones y la cámara. Sin limitar
  también el **alto**, desbordaba el A4 y salía una segunda página en blanco; está
  comprobado en la prueba.

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
js/flow.js          definición del asistente: pasos y gestos (los textos, no)
js/i18n.js          idiomas: buscar la clave, rellenar huecos, repasar el DOM
js/idiomas/*.js     un archivo por idioma; es.js es el original
js/compositor.js    WebGL2. Carga shaders/composite.{vert,frag} y los reescribe a WebGL
js/analyzer.js      SceneAnalyzer: color de un mip, ruido de un recorte nativo, EMA
js/recorder.js      canvas.captureStream + MediaRecorder, con micrófono
js/main.js          máquina de estados, gestos, grabación, foto
js/certificate.js   la carta: se dibuja en canvas, se guarda y se imprime
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

