#!/usr/bin/env python3
"""Genera material sintetico para probar la cadena de herramientas END-TO-END hoy,
sin esperar al asset de Sketchfab ni a las grabaciones reales.

    efecto : secuencia PNG RGBA (alfa recta) de un raton saliendo de un portal
    cuarto : mp4 de un "cuarto oscuro" con ruido sintetico y deriva de pulso

ESTO NO ES MATERIAL DE VALIDACION. El cuarto sintetico tiene ruido gaussiano limpio
y bien portado; el ruido real de un sensor barato a ISO 6400 es cromatico, con patron
fijo y correlacionado espacialmente. Si calibras el grading contra esto vas a calibrar
contra una mentira. Sirve para verificar que los scripts corren y que el empaquetado y
la costura estan bien; la receta se saca de los clips reales.

Uso:
    python3 tools/make_placeholder.py --outdir /tmp/ph
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ffio

LIGHT = np.array([-0.45, -0.65, 0.61], dtype=np.float32)  # clave fria, arriba-izquierda
LIGHT /= np.linalg.norm(LIGHT)


def ellipse(xx, yy, cx, cy, rx, ry):
    """Devuelve (mascara suave, normal esferica) de una elipse en coords normalizadas."""
    nx = (xx - cx) / rx
    ny = (yy - cy) / ry
    r2 = nx * nx + ny * ny
    nz = np.sqrt(np.clip(1.0 - r2, 0.0, 1.0))
    # Borde de ~1.5px: sin esto el matte queda con aliasing y el shader no lo arregla.
    mask = np.clip((1.0 - r2) * 40.0, 0.0, 1.0)
    return mask.astype(np.float32), np.stack([nx, ny, nz], axis=2).astype(np.float32)


def shade(normal, base):
    lit = np.clip((normal * LIGHT).sum(axis=2), 0.0, 1.0)
    # Sin blancos puros: techo en 0.88, como pide la spec del animador.
    return (base[None, None, :] * (0.30 + 0.58 * lit)[..., None]).astype(np.float32)


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / max(edge1 - edge0, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def effect_frame(t, w, h):
    """t en [0,1]. Devuelve RGBA float32 con alfa RECTA."""
    yy, xx = np.mgrid[0:h, 0:w]
    xx = (xx / w).astype(np.float32)
    yy = (yy / h).astype(np.float32)

    rgb = np.zeros((h, w, 3), np.float32)
    a = np.zeros((h, w), np.float32)

    # --- Portal: color alto, alfa baja. Con premultiplicado se comporta como aditivo.
    glow = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.40, 0.60, t))
    if glow > 0.001:
        d = np.sqrt(((xx - 0.5) / 0.20) ** 2 + ((yy - 0.72) / 0.20) ** 2)
        halo = np.exp(-d * d * 2.2).astype(np.float32)
        ring = np.exp(-((d - 0.85) ** 2) * 60.0).astype(np.float32)
        pa = np.clip((halo * 0.28 + ring * 0.45) * glow, 0.0, 0.75)
        rgb += np.array([0.55, 0.72, 0.88], np.float32)[None, None, :] * pa[..., None]
        a = np.maximum(a, pa)

    # --- Raton: emerge entre t=0.10 y t=0.32, y se asienta.
    body_a = smoothstep(0.10, 0.32, t)
    if body_a > 0.001:
        rise = (1.0 - smoothstep(0.10, 0.38, t)) * 0.055
        base = np.array([0.60, 0.56, 0.53], np.float32)

        # Sombra de contacto: negro con alfa variable, muy difuminada. Va PRIMERO,
        # debajo del personaje.
        sd = np.sqrt(((xx - 0.5) / 0.13) ** 2 + ((yy - 0.868 + rise) / 0.028) ** 2)
        sh = np.clip(np.exp(-sd * sd * 1.6) * 0.5 * body_a, 0.0, 0.5).astype(np.float32)
        a = np.maximum(a, sh)

        parts = [
            (0.50, 0.770 + rise, 0.100, 0.105),   # cuerpo
            (0.50, 0.632 + rise, 0.074, 0.074),   # cabeza
            (0.437, 0.567 + rise, 0.036, 0.036),  # oreja izq
            (0.563, 0.567 + rise, 0.036, 0.036),  # oreja der
        ]
        for cx, cy, rx, ry in parts:
            m, n = ellipse(xx, yy, cx, cy, rx, ry)
            m = m * body_a
            lit = shade(n, base)
            rgb = rgb * (1.0 - m[..., None]) + lit * m[..., None]
            a = np.maximum(a, m)

    # Margen de seguridad del 5%: el personaje nunca toca el borde del frame.
    # Es lo que exige la spec del animador, y build_effect.py avisa si no se cumple.
    margin = (smoothstep(0.0, 0.05, xx) * smoothstep(0.0, 0.05, 1.0 - xx)
              * smoothstep(0.0, 0.05, yy) * smoothstep(0.0, 0.05, 1.0 - yy))
    a *= margin.astype(np.float32)

    return np.clip(np.concatenate([rgb, a[..., None]], axis=2), 0.0, 1.0)


def room_frame(i, n, w, h, rng):
    """Cuarto oscuro sintetico con lamparita calida, deriva de pulso y ruido."""
    yy, xx = np.mgrid[0:h, 0:w]
    xx = (xx / w).astype(np.float32)
    yy = (yy / h).astype(np.float32)

    img = np.full((h, w, 3), 0.030, np.float32)
    img *= np.array([0.85, 0.92, 1.15], np.float32)[None, None, :]  # pared azulada

    d = np.sqrt(((xx - 0.86) / 0.55) ** 2 + ((yy - 0.18) / 0.55) ** 2)
    lamp = np.exp(-d * d * 2.6).astype(np.float32)
    img += np.array([0.30, 0.20, 0.09], np.float32)[None, None, :] * lamp[..., None]

    bed = smoothstep(0.60, 0.66, yy)[..., None]
    img = img * (1.0 - bed * 0.35) + bed * 0.055 * np.array([1.0, 0.97, 0.92], np.float32)

    # Deriva de pulso: el telefono apoyado igual respira. Sin esto el clip se ve
    # sospechosamente estable comparado con uno real.
    ph = i / n * 2 * np.pi
    img = np.roll(img, (int(round(2.5 * np.sin(ph * 3.1))),
                        int(round(2.0 * np.sin(ph * 2.3)))), axis=(0, 1))

    img += rng.normal(0.0, 0.032, img.shape).astype(np.float32)
    return np.clip(img, 0.0, 1.0)


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--outdir", default="/tmp/perezar-placeholder")
    p.add_argument("--effect-frames", type=int, default=150)
    p.add_argument("--room-frames", type=int, default=240)
    p.add_argument("--size", default="1080x1920")
    p.add_argument("--fps", type=float, default=30.0)
    args = p.parse_args()

    w, h = (int(v) for v in args.size.lower().split("x"))
    frames_dir = os.path.join(args.outdir, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    print(f"efecto: {args.effect_frames} frames PNG RGBA {w}x{h} -> {frames_dir}")
    for i in range(args.effect_frames):
        rgba = effect_frame(i / max(args.effect_frames - 1, 1), w, h)
        Image.fromarray((rgba * 255.0 + 0.5).astype(np.uint8), mode="RGBA").save(
            os.path.join(frames_dir, f"frame_{i:04d}.png"))
        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{args.effect_frames}", end="\r", flush=True)
    print()

    room = os.path.join(args.outdir, "cuarto_sintetico.mp4")
    print(f"cuarto: {args.room_frames} frames -> {room}")
    rng = np.random.default_rng(7)
    with ffio.VideoWriter(room, w, h, fps=args.fps, crf=20) as out:
        for i in range(args.room_frames):
            out.write((room_frame(i, args.room_frames, w, h, rng) * 255.0 + 0.5).astype(np.uint8))
            if (i + 1) % 40 == 0:
                print(f"  {i + 1}/{args.room_frames}", end="\r", flush=True)
    print()
    print(f"\nlisto. Siguiente:\n"
          f"  python3 tools/build_effect.py {frames_dir} -o {args.outdir}/efecto.mp4\n"
          f"  python3 tools/compose.py {room} {args.outdir}/efecto.mp4 "
          f"-o {args.outdir}/compuesto.mp4")


if __name__ == "__main__":
    main()
