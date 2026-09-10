#!/usr/bin/env python3
"""Pipeline de build de assets: secuencia PNG RGBA -> mp4 empaquetado + metadata.

Es el contrato con el animador. Lo que entra es lo que pide la seccion 6 de
docs/arquitectura.md (PNG RGBA con alfa RECTA, 1080x1920, 30fps); lo que sale es
lo que consume el shader.

    premultiplicar -> escalar -> empaquetar lado a lado -> H.264 yuvj420p -> mux audio

Uso:
    python3 tools/build_effect.py frames/ -o assets/portal_diente_v1.mp4 \
        --id portal_diente_v1 --audio audio/portal.wav
"""

import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ffio

BORDER = 2  # px forzados a cero en cada borde de cada mitad, contra sangrado de costura
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
SOLID = 0.7  # umbral de alfa para considerar un pixel "el personaje" y no su borde


def load_rgba(path):
    """Carga un PNG RGBA como float32 en [0,1], forma (H, W, 4)."""
    img = Image.open(path)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    return np.asarray(img, dtype=np.float32) / 255.0


def premultiply_and_scale(rgba, size):
    """Premultiplica sobre negro y escala. En ese orden: escalar alfa recta genera orla.

    La premultiplicacion se hace en el espacio codificado (no lineal), que es donde
    el shader compone. Es lo que significa "premultiplicado" en un asset de 8 bits.
    """
    rgb, a = rgba[..., :3], rgba[..., 3:4]
    premult = rgb * a

    packed = np.concatenate([premult, a], axis=2)
    scaled = np.asarray(
        Image.fromarray((packed * 255.0 + 0.5).astype(np.uint8), mode="RGBA")
        .resize(size, Image.LANCZOS),
        dtype=np.float32,
    ) / 255.0

    # Lanczos sobrepasa: sin esto quedan valores fuera de [0,1] y, peor, pixeles con
    # rgb > a, que no son premultiplicado valido y brillan en los bordes.
    out_rgb = np.clip(scaled[..., :3], 0.0, 1.0)
    out_a = np.clip(scaled[..., 3], 0.0, 1.0)
    return np.minimum(out_rgb, out_a[..., None]), out_a


def zero_border(rgb, a, width_px=BORDER):
    """Fuerza los bordes a cero. Devuelve cuanto contenido se recorto."""
    if width_px <= 0:
        return 0.0
    edges = np.zeros(a.shape, dtype=bool)
    edges[:width_px, :] = edges[-width_px:, :] = True
    edges[:, :width_px] = edges[:, -width_px:] = True
    clipped = float(a[edges].max())
    rgb[edges] = 0.0
    a[edges] = 0.0
    return clipped


def find_anchor(alpha_max):
    """Punto de contacto: centroide horizontal de la banda inferior con alfa solida."""
    solid = alpha_max > 0.5
    rows = np.flatnonzero(solid.any(axis=1))
    if rows.size == 0:
        return [0.5, 0.86]

    h, w = alpha_max.shape
    bottom = int(rows[-1])
    band = solid[max(bottom - max(1, h // 40), 0): bottom + 1]
    cols = np.flatnonzero(band.any(axis=0))
    cx = float(cols.mean()) if cols.size else w / 2.0
    return [round(cx / w, 4), round((bottom + 1) / h, 4)]


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("frames", help="Directorio o glob de la secuencia PNG RGBA")
    p.add_argument("-o", "--output", required=True, help="mp4 empaquetado de salida")
    p.add_argument("--id", help="id del efecto (por defecto, el nombre del archivo)")
    p.add_argument("--audio", help="WAV/AAC a multiplexar")
    p.add_argument("--track-size", default="720x1280",
                   help="Resolucion por track. Default 720x1280 (ver seccion 0.1)")
    p.add_argument("--fps", type=float, default=30.0)
    p.add_argument("--crf", type=int, default=20)
    p.add_argument("--gop", type=int, default=15)
    p.add_argument("--scale-factor", type=float, default=0.35,
                   help="defaultScaleFactor: alto del overlay como fraccion de pantalla")
    p.add_argument("--anchor", default="auto",
                   help="'auto' o 'x,y' normalizado. Punto de contacto con la superficie")
    p.add_argument("--webm", action="store_true",
                   help="Emitir tambien un VP9 .webm hermano. Solo lo necesita el "
                        "prototipo web en navegadores sin H.264; en telefonos, nunca")
    p.add_argument("--border", type=int, default=BORDER,
                   help="px forzados a cero en cada borde de cada mitad. 0 para desactivar")
    args = p.parse_args()

    pattern = args.frames
    if os.path.isdir(pattern):
        pattern = os.path.join(pattern, "*.png")
    paths = sorted(glob.glob(pattern))
    if not paths:
        sys.exit(f"error: la secuencia esta vacia: {pattern}")

    tw, th = (int(v) for v in args.track_size.lower().split("x"))
    if (tw * 2) % 16 or th % 16:
        print(f"aviso: {tw*2}x{th} no es multiplo de 16. Hay encoders de gama baja "
              f"que fallan en silencio con esas dimensiones.", file=sys.stderr)

    packed_w = tw * 2
    src = Image.open(paths[0])
    print(f"{len(paths)} frames de {src.width}x{src.height} -> "
          f"empaquetado {packed_w}x{th} @ {args.fps}fps")

    alpha_max = np.zeros((th, tw), dtype=np.float32)
    frame = np.zeros((th, packed_w, 3), dtype=np.uint8)
    worst_clip = 0.0
    lum_sum, lum_n = 0.0, 0
    rgb_sum = np.zeros(3, dtype=np.float64)

    writers = [ffio.VideoWriter(args.output, packed_w, th, fps=args.fps, crf=args.crf,
                                gop=args.gop, audio_from=args.audio, codec="h264")]
    if args.webm:
        webm_path = os.path.splitext(args.output)[0] + ".webm"
        writers.append(ffio.VideoWriter(webm_path, packed_w, th, fps=args.fps,
                                        crf=max(args.crf + 10, 30), gop=args.gop,
                                        audio_from=args.audio, codec="vp9"))

    try:
        for i, path in enumerate(paths):
            rgb, a = premultiply_and_scale(load_rgba(path), (tw, th))
            worst_clip = max(worst_clip, zero_border(rgb, a, args.border))
            np.maximum(alpha_max, a, out=alpha_max)

            # referenceLuma: la luma del personaje sin premultiplicar, medida UNA vez
            # aqui y no en el dispositivo. Ver nota en tools/README.md: medirla en
            # runtime hace que los frames donde solo se ve el portal (emisivo, muy
            # brillante) disparen el estimador de exposicion.
            solid = a > SOLID
            if solid.any():
                straight = rgb[solid] / a[solid][:, None]
                lum_sum += float((straight @ LUMA).sum())
                rgb_sum += straight.sum(axis=0)
                lum_n += int(solid.sum())

            frame[:, :tw] = (rgb * 255.0 + 0.5).astype(np.uint8)
            frame[:, tw:] = (a * 255.0 + 0.5).astype(np.uint8)[..., None]
            for w in writers:
                w.write(frame)

            if (i + 1) % 30 == 0 or i + 1 == len(paths):
                print(f"  {i + 1}/{len(paths)}", end="\r", flush=True)
    finally:
        for w in writers:
            w.close()
    print()

    if worst_clip > 0.02:
        print(f"AVISO: habia contenido con alfa hasta {worst_clip:.2f} en los "
              f"{args.border}px de borde y quedo recortado. El animador debe respetar "
              f"el margen de seguridad del 5% (seccion 6 de la arquitectura).",
              file=sys.stderr)

    anchor = (find_anchor(alpha_max) if args.anchor == "auto"
              else [float(v) for v in args.anchor.split(",")])

    meta = {
        "id": args.id or os.path.splitext(os.path.basename(args.output))[0],
        "durationMs": round(len(paths) / args.fps * 1000),
        "fps": args.fps,
        "frameCount": len(paths),
        "packedSize": [packed_w, th],
        "trackSize": [tw, th],
        "anchorPoint": anchor,
        "defaultScaleFactor": args.scale_factor,
        "referenceLuma": round(lum_sum / lum_n, 4) if lum_n else 0.5,
        # Color medio del personaje sin premultiplicar. Es lo que permite igualar la
        # dominante de color del cuarto, que un escalar no puede. Ver composite.frag.
        "referenceColor": ([round(v, 4) for v in (rgb_sum / lum_n)] if lum_n
                           else [0.5, 0.5, 0.5]),
        "hasAudio": bool(args.audio),
        "limitedRange": False,
        "glowFrames": [],
    }
    meta_path = os.path.splitext(args.output)[0] + ".json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")

    size_mb = os.path.getsize(args.output) / 1e6
    print(f"-> {args.output} ({size_mb:.2f} MB)")
    if args.webm:
        print(f"-> {webm_path} ({os.path.getsize(webm_path) / 1e6:.2f} MB)")
    print(f"-> {meta_path} (anchorPoint {anchor}, "
          f"referenceLuma {meta['referenceLuma']})")
    if size_mb > 4.0:
        print(f"aviso: {size_mb:.1f} MB supera el presupuesto de 2-4 MB por efecto. "
              f"Sube --crf.", file=sys.stderr)


if __name__ == "__main__":
    main()
