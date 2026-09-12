#!/usr/bin/env python3
"""Genera los ratones PROVISIONALES del selector de la foto, a partir del bueno.

    python3 tools/make_ratones.py

Escribe `web/assets/ratones/*.png` recoloreando el chandal del `raton_perez.png` que ya
esta en el repositorio. NO son fotos distintas: son el MISMO personaje con la ropa de otro
color, y estan aqui solo para que el selector tenga algo que seleccionar mientras llegan
las fotos de verdad.

POR QUE UN SCRIPT Y NO TRES PNG A MANO: cuando lleguen las buenas, esto se borra de una
vez -el script y la carpeta- y no queda nadie preguntandose de donde salieron tres
imagenes que nadie sabe rehacer. Mientras tanto, si el `raton_perez.png` cambia, los tres
provisionales se regeneran con un comando en vez de envejecer cada uno por su lado.

POR QUE SE MUEVE EL TONO Y NO SE PINTA ENCIMA: el personaje es un render 3D con sombras y
brillos en la ropa. Rellenar de color plano se los cargaria y las miniaturas se verian
como pegatinas. Moviendo solo el TONO de los pixeles rojos -y dejando en su sitio el
brillo y la saturacion- la tela sigue teniendo sus pliegues.
"""

import argparse
import os

import numpy as np
from PIL import Image

# QUE SE RECOLOREA Y QUE NO, y esto esta MEDIDO sobre el PNG, no escogido a ojo: la tela
# del chandal marca saturacion 0.89-0.90, y las orejas, el hocico, la cola y las
# zapatillas se quedan entre 0.26 y 0.50. Cortando por la mitad de ese hueco cambia la
# ropa y el raton sigue siendo el mismo bicho; con el corte en 0.25 -lo primero que se
# probo- salia un raton de piel azul.
#
# El rojo vive a los dos lados del 0 en la rueda de tonos, asi que la banda se escribe
# como distancia al 0 y no como un intervalo.
BANDA_ROJA = 25.0                    # grados a cada lado del 0
BANDA_SUAVE = 12.0                   # los ultimos grados se desvanecen en vez de cortar
SATURACION = (0.55, 0.72)            # de piel a tela: por debajo no se toca, por encima si

# Los tres provisionales. El tono es el destino en grados; el nombre, el id del catalogo.
VARIANTES = [
    ("azul", 215.0),
    ("verde", 145.0),
    ("morado", 285.0),
]


def rgb_a_hsv(rgb):
    """RGB [0,1] -> (tono en grados, saturacion, valor). Vectorizado: son 360k pixeles."""
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    d = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    h = np.zeros_like(mx)
    nz = d > 1e-6
    i = (mx == r) & nz
    h[i] = ((g[i] - b[i]) / d[i]) % 6.0
    i = (mx == g) & nz
    h[i] = ((b[i] - r[i]) / d[i]) + 2.0
    i = (mx == b) & nz
    h[i] = ((r[i] - g[i]) / d[i]) + 4.0

    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0.0)
    return h * 60.0, s, mx


def hsv_a_rgb(h, s, v):
    h = np.mod(h, 360.0) / 60.0
    i = np.floor(h).astype(np.int32)
    f = h - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))
    i = i % 6
    out = np.stack([
        np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [v, q, p, p, t, v]),
        np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [t, v, v, q, p, p]),
        np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [p, p, t, v, v, q]),
    ], axis=-1)
    return out


def suave(borde0, borde1, x):
    """Transicion en S entre dos umbrales. Un corte a secas deja un escalon visible."""
    t = np.clip((x - borde0) / max(borde1 - borde0, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def recolorear(origen, tono):
    """El mismo ratón con el chándal en otro tono."""
    a = np.asarray(origen).astype(np.float32) / 255.0
    rgb, alfa = a[..., :3], a[..., 3]
    h, s, v = rgb_a_hsv(rgb)

    # Cuanto de este pixel es tela del chandal: 1 en el rojo saturado del centro de la
    # prenda, 0 en el pelo, y algo intermedio en los pocos pixeles del borde.
    desvio = np.where(h > 180.0, h - 360.0, h)
    mezcla = (1.0 - suave(BANDA_ROJA - BANDA_SUAVE, BANDA_ROJA, np.abs(desvio))) \
        * suave(SATURACION[0], SATURACION[1], s)

    # El tono se FIJA, no se rota: rotar dejaria el borde de la banda estirado hacia un
    # lado y la prenda saldria con dos colores. Se conserva la mitad de la desviacion de
    # cada pixel respecto al rojo puro para que las costuras no se aplanen.
    tenido = hsv_a_rgb(tono + desvio * 0.5, s, v)

    # La mezcla se hace en RGB y no en el tono: interpolar tonos que cruzan el 0 pasa por
    # el verde, y el borde de la manga saldria con un halo.
    fuera = rgb + (tenido - rgb) * mezcla[..., None]
    salida = np.concatenate([fuera, alfa[..., None]], axis=-1)
    return Image.fromarray(np.clip(salida * 255.0, 0, 255).astype(np.uint8), "RGBA")


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--origen", default=os.path.join(raiz, "web/assets/raton_perez.png"))
    ap.add_argument("--outdir", default=os.path.join(raiz, "web/assets/ratones"))
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    origen = Image.open(args.origen).convert("RGBA")

    for nombre, tono in VARIANTES:
        destino = os.path.join(args.outdir, f"{nombre}.png")
        # `optimize` porque estas tres imagenes viajan por la red de un movil cada noche:
        # el PNG de origen pesa 400 KB y no hace falta multiplicarlo por cuatro.
        recolorear(origen, tono).save(destino, "PNG", optimize=True)
        print(f"{destino}  ({os.path.getsize(destino) // 1024} KB)")


if __name__ == "__main__":
    main()
