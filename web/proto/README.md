# Prototipo de interfaz — ronda 1

Flujo **navegable y falso**. Recorre las pantallas de
[`docs/diseno-ronda-1.pdf`](../../docs/diseno-ronda-1.pdf) para poder tocarlas en el
teléfono y decidir. No compone, no graba y no guarda: la app de verdad es
[`web/`](../README.md) y no comparte una sola línea con este archivo.

```
https://yesithv.github.io/raton-pedro-app/web/proto/
```

En local, desde la raíz del repo: `python3 -m http.server 8000` →
`http://localhost:8000/web/proto/`.

## Para qué existe

El diseño dejó **dos decisiones abiertas** a propósito, y las dos se toman mejor con el
móvil en la mano, de noche, que mirando un PDF:

| Decisión | Opción A | Opción B |
|---|---|---|
| **Inicio** — *decidido: `1b`* | `1a` **mínima** — un obturador y un conmutador VÍDEO/FOTO. Cero lectura a partir de la segunda noche. | ✅ `1b` **guiada** — dos tarjetas que dicen qué sale y cuánto tarda. Cuesta una lectura la primera vez. |
| **Paso 1** — *abierto* | `1c` **hoja inferior** — panel con el título, las tres animaciones y el botón. Ocupa el tercio de abajo. | `1d` **sin paneles** — una línea que se desvanece a los 3 s y se toca al ratón para cambiar lo que hace. Nada tapa la cama, pero hay que descubrir el gesto. |

El prototipo arranca ya en `1b`. El conmutador sigue ahí para volver a comparar: una
decisión tomada de noche conviene poder revisarla.

La barra negra de arriba conmuta entre las cuatro. **No es parte del diseño**: se quita
con *ocultar* (o abriendo con `?limpio`), y vuelve con siete toques sobre el título del
arranque — el mismo gesto que el diseño reservó para el panel de desarrollo.

## Qué es de verdad y qué es atrezo

De verdad, porque es la interacción que se está juzgando y no depende del pipeline:

- Arrastrar al ratón y pellizcarlo para cambiar su tamaño.
- Tocarle para rotar entre las tres animaciones (variante `1d`).
- La navegación entera, con sus vueltas atrás.
- **El fondo de cámara**: al pulsar *Encender la cámara* se pide la cámara real y se usa
  como fondo. Sin ella el prototipo sigue funcionando con un cuarto pintado en CSS, pero
  la pregunta que el diseño dice resolver —«¿la interfaz tapa la cama?»— solo se contesta
  sobre la escena real.

Atrezo:

- La grabación cuenta cinco segundos y salta al resultado. No hay vídeo.
- *Guardar en Fotos* lleva a la pantalla de recompensa sin guardar nada.
- La linterna, el cambio de cámara y *Compartir* solo se encienden o avisan.
- El certificado no existe: es de la ronda 2.

## Qué falta antes de implementarlo de verdad

Pantallas que el diseño todavía no ha dibujado y la app sí necesita, porque en un teléfono
real pasan todas: permiso de cámara denegado, navegador sin grabación de vídeo, clip en un
formato que el carrete no acepta, y el aviso de luz fuera de rango. Están enumeradas en
[`docs/prompt-rediseno-ui.md`](../../docs/prompt-rediseno-ui.md); son la ronda 2.
