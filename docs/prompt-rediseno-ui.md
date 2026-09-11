# Prompt para rediseñar la interfaz

Brief listo para pegar en una herramienta de diseño (Claude, v0, Figma Make, Lovable,
ChatGPT…). Está escrito para que la herramienta **no tenga que ver el repositorio**: lleva
dentro el inventario de pantallas, los textos reales, los tokens de color y las
restricciones que no se pueden negociar.

Dos cosas que conviene adjuntar al pegarlo, si la herramienta acepta imágenes:

1. Una captura del paso ESCANEAR y otra del paso FOTO desde el teléfono.
2. El PNG del personaje (`web/assets/raton_perez.png`), para que el sistema visual salga
   del personaje y no al revés.

Lo que devuelva **no entra directo al repo**: el pipeline (lienzo WebGL a pantalla
completa, overlays en DOM, composición 2D al disparar) manda sobre cualquier maqueta. El
apartado "Lo que NO se puede cambiar" del prompt existe justo para eso.

---

```
Eres un diseñador de producto especializado en apps móviles usadas en condiciones
difíciles. Quiero que rediseñes la interfaz de una app web que ya funciona. No partas de
cero conceptualmente: el flujo está validado contra una app de referencia del mismo
género. Lo que falla es la forma, no el fondo.

## El producto

"Ratón Pérez AR". El padre o la madre apunta el teléfono al cuarto de su hijo y aparece el
Ratón Pérez —un personaje 3D de dibujos, ratón gris con sudadera amarilla— compuesto sobre
la imagen real de la cámara. Graba un vídeo de 5 segundos o hace una foto, y al día
siguiente se lo enseña al niño: "mira quién vino anoche".

Es una web app (HTML, CSS y JavaScript sin frameworks) que se abre en el navegador del
teléfono. La cámara ocupa la pantalla entera; toda la interfaz son capas encima.

## Quién la usa, y en qué situación exacta

Esto es lo que más debe condicionar el diseño:

- **Es de noche y el cuarto está a oscuras.** La pantalla del teléfono es casi la única
  fuente de luz. Un fondo claro a pantalla completa deslumbra al adulto y puede despertar
  al niño.
- **El niño está dormido a un metro.** No puede haber nada que dependa del sonido, y la
  app no debe obligar a movimientos bruscos ni a acercarse.
- **Se usa con una sola mano**, sosteniendo el teléfono en alto y apuntando a la cama. Todo
  lo que haya que tocar tiene que caer bajo el pulgar.
- **El momento dura segundos y el adulto está nervioso.** Si a la tercera pantalla no ha
  pasado nada mágico, se abandona.
- **El usuario no es técnico.** Nunca debe leer palabras como exposición, shader, códec o
  lienzo fuera de un panel avanzado.
- Idioma: **español**. Tuteo, tono cálido y de cómplice, nunca infantilizado: el usuario es
  el adulto que monta la sorpresa, no el niño.

## Lo que existe hoy, pantalla por pantalla

Todo va sobre el vídeo de la cámara a pantalla completa, en tema oscuro.

1. **Arranque** — Título "Ratón Pérez AR", un párrafo de explicación, botón ámbar "Abrir
   cámara", y una línea gris pequeña: "Necesita HTTPS y permiso de cámara". Es lo único
   que se ve antes de conceder el permiso de cámara.

2. **Inicio** — Ya se ve la cámara en vivo. Abajo, dos botones: "Crear video" (ámbar,
   principal) y "Tomar foto" (secundario). Nada más. No se explica en qué se diferencian
   ni qué va a pasar después.

3. **Asistente de vídeo**, cinco pasos encadenados. En todos: arriba un botón redondo de
   casa a la izquierda, el nombre del paso centrado en mayúsculas espaciadas, y un botón
   redondo de volver a la derecha. Debajo del título, una caja negra translúcida con la
   instrucción del paso (ocupa bastante y tapa la escena). Abajo, los controles del paso.
   - **ESCANEAR** — "Apunta al suelo o a la cama y mueve el teléfono despacio. Cuando el
     círculo se quede quieto, tócalo para dejar ahí al ratón." Un retículo elíptico ámbar
     con una flecha sigue al dedo. Botón "Colocar aquí".
   - **POSICIÓN** — el ratón ya aparece animado en bucle sobre la escena. Se arrastra
     arriba/abajo para acercarlo o alejarlo. Botón "Siguiente".
   - **TAMAÑO** — se pellizca para escalarlo. Botón "Siguiente".
   - **EDITAR** — selector con flechas ‹ › y el nombre de la animación en medio (tres
     opciones: "entra y es descubierto", "es descubierto y se esconde", "saluda y se va").
     Botón "Seleccionar".
   - **GRABAR** — tres controles en fila: linterna (icono de rayo), obturador grande rojo,
     y un botón de foto. Al grabar aparece una píldora con un punto rojo parpadeante y el
     tiempo transcurrido. Se detiene solo al acabar la animación.

4. **FOTO** — el otro modo, al que se entra desde "Tomar foto". Abre la cámara frontal con
   el ratón ya puesto encima, en grande, como para un selfie junto al niño dormido. Se
   arrastra con el dedo, se pellizca para cambiar el tamaño. Abajo tres botones sin texto:
   cambiar de cámara (⟳), obturador blanco, y girar al ratón en horizontal (⇄).

5. **Resultado (vídeo)** — el clip a pantalla completa con controles nativos, una línea de
   metadatos ("5.0s · 1.2 MB · video/mp4 · con micrófono"), y tres acciones: "Cerrar",
   "Guardar en el carrete" (ámbar) y "Descargar archivo". Debajo, una línea explicando qué
   opción del menú del sistema lleva la foto al carrete.

6. **Resultado (foto)** — igual, con la imagen en vez del vídeo: "Cerrar", "Guardar en
   Fotos" y "Descargar archivo", más la línea de ayuda.

7. **Ajustes** — un botón diminuto y translúcido, "Ajustes", bajo los controles. Abre un
   panel con datos de depuración en monoespaciada y seis deslizadores técnicos. Es una
   herramienta de desarrollo que hoy está a un toque de distancia del usuario final.

8. **Avisos** — un toast negro redondeado a media altura, y una caja de error roja abajo
   que aparece unos segundos.

## Estados que el diseño tiene que cubrir

No son casos raros: en un teléfono real pasan todos.

- Permiso de cámara denegado, o abierto sin HTTPS → hoy el botón pasa a "Reintentar" y sale
  una caja roja con un texto largo.
- El navegador no soporta grabar vídeo → el obturador sale deshabilitado, sin explicar por
  qué.
- La cámara frontal no se puede abrir → toast y se queda en la trasera.
- El clip se grabó en un formato que el carrete del teléfono no acepta → hay que avisarlo
  sin que parezca un fallo del usuario.
- La luz del cuarto está fuera del rango que la app puede igualar → hoy sale un aviso
  naranja con lenguaje técnico.
- Grabando (el estado más crítico: tiene que leerse de un vistazo y a oscuras).

## Sistema visual actual, para que lo reemplaces

Tema oscuro fijo. Tokens en uso:

  fondo        #0b0d10
  texto        #e8eaed
  texto tenue  #9aa3ad
  acento       #e8b930  (ámbar; los botones principales van ámbar con texto #2a1f04)
  aviso        #e8b563
  grabación    #d8443c
  panel        rgba(14, 17, 21, 0.9)

Tipografía: la del sistema. Botones de 10px de radio; botones redondos de icono de 44px;
obturador de 68px. Los iconos son caracteres de texto (⌂ ← ⚡ ◎ ‹ › ⟳ ⇄), no un set real:
se ven distintos en cada teléfono y varios no se entienden.

## Problemas concretos que quiero resueltos

1. **"Crear video" y "Tomar foto" no venden nada.** Es la primera decisión y se toma a
   ciegas, sin saber qué hace cada camino ni cuál lleva menos tiempo.
2. **Las cajas de instrucciones tapan justo lo que hay que mirar**: la cama, el suelo, el
   niño. Y se leen enteras cada vez, aunque sea la quinta noche que se usa.
3. **Cinco pasos para un vídeo de cinco segundos.** POSICIÓN y TAMAÑO son el mismo gesto
   sobre el mismo objeto; sospecho que sobra un paso, quizá dos.
4. **Los tres botones sin etiqueta del modo FOTO** (⟳, obturador, ⇄) no se entienden sin
   probarlos.
5. **Guardar es confuso** y es el final del recorrido, donde más duele. Hay dos acciones
   parecidas ("Guardar en Fotos" abre el menú del sistema; "Descargar archivo" deja el
   archivo en Archivos, no en Fotos) y hay que hacer entender la diferencia sin jerga.
6. **El panel de Ajustes es de desarrollo** y está a un toque del usuario. Necesito que
   siga accesible para mí y deje de existir para el padre.
7. **No hay identidad.** Un ámbar y tipografía del sistema. La app va de magia nocturna y
   se ve como una utilidad.
8. **No hay recompensa al terminar.** Se graba y aparece un reproductor. Falta el momento
   de "lo conseguiste".

## Lo que NO se puede cambiar (restricciones técnicas reales)

- **La cámara es un lienzo a pantalla completa, fijo, debajo de todo.** Toda la interfaz
  son capas encima. No puede haber una pantalla que no muestre la cámara, salvo el
  arranque y las dos de resultado.
- **Sin frameworks, sin librerías, sin fuentes ni iconos externos** (la página tiene una
  política de contenido estricta). Todo tiene que poder escribirse en HTML y CSS a mano.
  Si propones iconos, entrégalos como SVG en línea.
- **Zonas seguras de iOS**: hay que respetar `env(safe-area-inset-*)` arriba y abajo, y
  contar con que Safari pinta su propia barra encima de la parte inferior.
- **Toque mínimo de 44x44 px**, y todo lo que se use con el teléfono en alto en el tercio
  inferior de la pantalla.
- **De 360 px de ancho hasta tablet**, en vertical. La horizontal no importa.
- **Tema oscuro siempre.** No hay modo claro y no debe haberlo: se usa a oscuras.
- Textos en español. Si propones copy nuevo, entrégalo listo para pegar.
- El personaje es un PNG con fondo transparente que se dibuja encima de la cámara; se
  arrastra y se escala con los dedos. Eso se queda.

## Qué quiero de vuelta

1. **Un diagnóstico corto** (máximo 10 líneas) de qué está mal hoy y cuál es la idea
   rectora del rediseño. Sin adjetivos de catálogo.
2. **Las pantallas rediseñadas**, en este orden de importancia: Inicio, el asistente de
   vídeo (con tu propuesta de cuántos pasos deberían ser y por qué), FOTO, y Resultado con
   el guardado. Maquetas o HTML/CSS, lo que mejor sepas hacer, pero **a tamaño de móvil y
   sobre una foto de cuarto a oscuras**, no sobre fondo blanco: una interfaz que solo se ve
   bien sobre gris neutro no sirve aquí.
3. **El sistema**: paleta con sus valores, escala tipográfica, espaciado, radios, el set de
   iconos en SVG y los estados de los botones. Que se pueda implementar leyendo, sin
   adivinar números.
4. **Los estados de la lista de arriba**, dibujados. Sobre todo "grabando", los dos errores
   de permiso y el resultado.
5. **Copy nuevo** para cada pantalla, en español.
6. **Qué dejarías igual y por qué.** Un rediseño que cambia todo es sospechoso.

Cuando algo te falte para decidir, haz las preguntas al final; no rellenes el hueco con
una suposición callada. Y si crees que alguno de los ocho problemas que listé no es un
problema real, dilo y defiéndelo, en vez de resolverlo por resolverlo.
```
