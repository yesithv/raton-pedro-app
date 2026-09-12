# Los ratones del selector

Cada entrada de `../ratones.json` es una opción de los DOS selectores que hay en la app:
el de las opciones de cámara del paso FOTO —el ratón que sale en la foto— y el del
formulario de la carta —el que va dibujado en el papel—. Es el mismo catálogo para los dos,
y cada pantalla recuerda su propia elección:

```json
{ "id": "clasico", "title": "Ratón Pérez", "archivo": "assets/raton_perez.png" }
```

- `id` es con lo que se guarda la elección en el teléfono, y la clave con la que se busca
  el nombre traducido en `js/idiomas/*.js` (`ratones.<id>`). **No se cambia** el de una
  opción que ya esté publicada: quien la tuviera elegida volvería al primero.
- `title` es el respaldo: se enseña tal cual si el `id` no está traducido.
- `archivo` es la ruta desde `web/`. PNG con transparencia y **el ratón apoyado en el
  borde de abajo**, que es por donde la app lo ancla al suelo de la escena. En la carta se
  dibuja a 250 px de alto respetando su proporción, así que una foto muy apaisada saldrá
  pequeña en el papel.

## Los tres de colores son provisionales

`azul.png`, `verde.png` y `morado.png` no son fotos distintas: son el `raton_perez.png`
con el chándal de otro color, generados por `tools/make_ratones.py` para que el selector
tenga algo que seleccionar mientras llegan las buenas.

Cuando lleguen: se dejan los PNG aquí, se cambian las tres entradas de `ratones.json`
(`id`, `title` y `archivo`), se añaden los nombres a los tres idiomas y se borra
`tools/make_ratones.py` junto con los tres archivos de colores. La primera entrada, el
clásico, se queda: es el personaje que sale en el arranque y el que la app pone cuando
nadie ha elegido nada.
