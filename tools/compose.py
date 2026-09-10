#!/usr/bin/env python3
"""Compositor offline: replica shaders/composite.frag sobre un clip de referencia.

Este es el ground truth de la prueba de percepcion (dias 1-3) y del spike nativo
(semana 2). NO es un compositor "bonito": es deliberadamente el mismo modelo
matematico que el shader, con los mismos cuatro parametros, para que los numeros
que ajustes aqui sean literalmente los uniforms del dispositivo.

Consume el mp4 empaquetado que produce build_effect.py, asi que el resultado ya
incluye los artefactos del codec (submuestreo 4:2:0 del croma, banding). Componer
directo desde los PNG te daria un resultado mas limpio que el que el telefono puede
producir, que es justo la mentira que no quieres en un test de percepcion.

Uso:
    # variante con grading, parametros automaticos
    python3 tools/compose.py cuarto_01.mp4 assets/portal.mp4 -o out/cuarto_01_graded.mp4

    # variante ingenua, para el A/B
    python3 tools/compose.py cuarto_01.mp4 assets/portal.mp4 -o out/cuarto_01_naive.mp4 --naive
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ffio

LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


# --------------------------------------------------------------------------
# Utilidades de muestreo
# --------------------------------------------------------------------------

def shift(img, dx, dy):
    """Muestrea img desplazada (dx, dy) pixeles, bilineal, con clamp en el borde.

    Equivale a texture(tex, uv + vec2(dx, dy) * texel) en el shader.
    """
    pad = 2
    img = np.asarray(img, dtype=np.float32)
    p = np.pad(img, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
    h, w = img.shape[:2]
    # float32 explicito: si los pesos son floats de Python el resultado se promociona a
    # float64 y resize_f32() lo entrega a PIL como si fuera float32.
    fx = np.float32(dx - np.floor(dx))
    fy = np.float32(dy - np.floor(dy))
    x0, y0 = pad + int(np.floor(dx)), pad + int(np.floor(dy))

    a = p[y0:y0 + h,     x0:x0 + w]
    b = p[y0:y0 + h,     x0 + 1:x0 + 1 + w]
    c = p[y0 + 1:y0 + 1 + h, x0:x0 + w]
    d = p[y0 + 1:y0 + 1 + h, x0 + 1:x0 + 1 + w]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def resize_f32(arr, size):
    """Resize bilineal de un array float32 (H,W) o (H,W,C), como el filtrado del GPU.

    El cast a float32 NO es cosmetico. PIL mode="F" es float de 32 bits y
    Image.fromarray() no valida el dtype: con un array float64 reinterpreta los bytes
    en silencio y devuelve valores basura (tipicamente ~0), sin lanzar ninguna
    excepcion. Es el modo de fallo mas caro de este script.
    """
    arr = np.ascontiguousarray(arr, dtype=np.float32)
    if arr.ndim == 2:
        return np.asarray(Image.fromarray(arr, mode="F").resize(size, Image.BILINEAR),
                          dtype=np.float32)
    chans = [np.asarray(Image.fromarray(arr[..., c], mode="F").resize(size, Image.BILINEAR),
                        dtype=np.float32) for c in range(arr.shape[2])]
    return np.stack(chans, axis=2)


def hash13(px, py, pz):
    """Puerto exacto de hash13() del shader. float32 a proposito: el shader usa floats."""
    px, py, pz = (np.float32(0.1031) * v for v in (px, py, pz))
    px, py, pz = (v - np.floor(v) for v in (px, py, pz))
    dot = px * (py + np.float32(33.33)) + py * (pz + np.float32(33.33)) + pz * (px + np.float32(33.33))
    px, py, pz = px + dot, py + dot, pz + dot
    v = (px + py) * pz
    return v - np.floor(v)


# --------------------------------------------------------------------------
# SceneAnalyzer
# --------------------------------------------------------------------------

def estimate_scene(cam, rect, weights):
    """Estima (color medio, sigma del ruido) del feed bajo el personaje.

    El color medio es un vec3, no una luminancia: hace falta para igualar la dominante
    del cuarto (lamparita ambar, tira LED, luz de pasillo). Ver composite.frag.

    La luminancia se puede medir barata sobre un mip reducido, como dice la
    arquitectura. El RUIDO NO: un mip es un filtro paso-bajo y promedia justo la
    senal que intentas medir. Por eso el sigma se mide sobre el recorte a
    resolucion nativa. Ver tools/README.md.
    """
    x0, y0, x1, y1 = rect
    crop = cam[y0:y1, x0:x1]
    if crop.size == 0:
        return 0.15, 0.02

    luma = crop @ LUMA
    w = weights
    if w.sum() > 0:
        scene_rgb = (crop * w[..., None]).sum(axis=(0, 1)) / w.sum()
    else:
        scene_rgb = crop.mean(axis=(0, 1))

    # Paso-alto 3x3 y MAD en vez de desviacion estandar: la MAD es robusta contra
    # los bordes reales de la escena, que si no se cuentan como ruido.
    lo = 0.25 * (shift(luma[..., None], -1, 0) + shift(luma[..., None], 1, 0)
                 + shift(luma[..., None], 0, -1) + shift(luma[..., None], 0, 1))[..., 0]
    hp = luma - lo
    sigma = float(np.median(np.abs(hp - np.median(hp))) * 1.4826)
    return scene_rgb.astype(np.float32), sigma


# --------------------------------------------------------------------------
# Composicion
# --------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("camera", help="Clip de referencia (el cuarto real, de noche)")
    p.add_argument("effect", help="mp4 empaquetado de build_effect.py")
    p.add_argument("-o", "--output", required=True)
    p.add_argument("--meta", help="JSON del efecto. Default: <effect>.json")
    p.add_argument("--pos", default="0.5,0.75",
                   help="Punto de contacto en pantalla, normalizado. Default 0.5,0.75")
    p.add_argument("--scale", type=float,
                   help="Alto del overlay como fraccion de pantalla. Default: el del JSON")
    p.add_argument("--start-frame", type=int, default=0,
                   help="Frame del clip donde arranca el efecto")
    p.add_argument("--audio", help="Pista a multiplexar en la salida")

    g = p.add_argument_group("uniforms del shader")
    g.add_argument("--exposure", type=float, help="uExposureMatch. Default: automatico")
    g.add_argument("--grain", type=float, help="uGrainAmount. Default: automatico")
    g.add_argument("--softness", type=float, default=0.8, help="uSoftness. Default 0.8")
    g.add_argument("--key", type=float, default=1.15,
                   help="Cuanto mas brillante que el ambiente lee el personaje. Default 1.15")
    g.add_argument("--wb", type=float, default=0.5,
                   help="Fuerza de igualacion de la dominante de color, 0..1. "
                        "0 = solo ganancia global (comportamiento escalar anterior); "
                        "1 = el personaje adopta del todo la dominante del cuarto y "
                        "pierde su color propio. Default 0.5")
    g.add_argument("--cast-range", default="0.6,1.7",
                   help="Limites por canal de la correccion de dominante")
    g.add_argument("--exposure-range", default="0.35,1.2")
    g.add_argument("--grain-range", default="0.02,0.09")
    g.add_argument("--analyze-every", type=int, default=10,
                   help="Cada cuantos frames corre SceneAnalyzer. Igual que en el "
                        "dispositivo (seccion 2). Default 10")
    g.add_argument("--smoothing", type=float, default=0.15,
                   help="Coeficiente EMA de los uniforms entre analisis. 1.0 desactiva "
                        "el suavizado. Default 0.15")
    g.add_argument("--limited-range", action="store_true",
                   help="uLimitedRange: el asset quedo en 16-235")
    g.add_argument("--naive", action="store_true",
                   help="Alpha over puro: sin exposicion, sin grano, sin blur. La variante"
                        " de control del A/B")
    args = p.parse_args()

    meta_path = args.meta or os.path.splitext(args.effect)[0] + ".json"
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    anchor = meta.get("anchorPoint", [0.5, 0.86])
    scale_factor = args.scale if args.scale is not None else meta.get("defaultScaleFactor", 0.35)
    limited = args.limited_range or meta.get("limitedRange", False)

    if args.naive:
        args.softness = 0.0

    cam_info, fx_info = ffio.probe(args.camera), ffio.probe(args.effect)
    W, H, fps = cam_info["width"], cam_info["height"], cam_info["fps"]
    PW, PH = fx_info["width"], fx_info["height"]
    TW = PW // 2

    # Rectangulo destino, en pixeles de pantalla
    dst_h = int(round(scale_factor * H))
    dst_w = int(round(dst_h * TW / PH))
    px, py = (float(v) for v in args.pos.split(","))
    ox = int(round(px * W - anchor[0] * dst_w))
    oy = int(round(py * H - anchor[1] * dst_h))

    vx0, vy0 = max(ox, 0), max(oy, 0)
    vx1, vy1 = min(ox + dst_w, W), min(oy + dst_h, H)
    if vx0 >= vx1 or vy0 >= vy1:
        sys.exit("error: el overlay queda completamente fuera de pantalla")

    exp_lo, exp_hi = (float(v) for v in args.exposure_range.split(","))
    grain_lo, grain_hi = (float(v) for v in args.grain_range.split(","))

    print(f"camara {W}x{H}@{fps}  efecto {PW}x{PH} (track {TW}x{PH})")
    print(f"overlay {dst_w}x{dst_h} en ({ox},{oy}), anchor {anchor}")

    fx_frames = list(ffio.read_frames(args.effect, PW, PH))
    print(f"{len(fx_frames)} frames de efecto cargados")

    # Coordenadas de pantalla del rectangulo visible, para el grano
    ys, xs = np.mgrid[vy0:vy1, vx0:vx1]
    uv_x = ((xs + 0.5) / W * 1024.0).astype(np.float32)
    uv_y = ((ys + 0.5) / H * 1024.0).astype(np.float32)

    ref_color = meta.get("referenceColor")
    if ref_color is None:
        lum = meta.get("referenceLuma", 0.5)
        ref_color = [lum, lum, lum]
        print("aviso: el JSON no trae referenceColor (asset construido con una version "
              "vieja de build_effect.py). Sin el no se puede igualar la dominante de "
              "color del cuarto; se usa referenceLuma como gris neutro.", file=sys.stderr)
    ref_color = np.asarray(ref_color, dtype=np.float32)
    ref_luma = float(ref_color @ LUMA)
    cast_lo, cast_hi = (float(v) for v in args.cast_range.split(","))

    resolved, raw_exposure = [], []
    exposure = grain = None
    with ffio.VideoWriter(args.output, W, H, fps=fps, crf=18, audio_from=args.audio) as out:
        for i, cam_u8 in enumerate(ffio.read_frames(args.camera, W, H)):
            fx_index = i - args.start_frame
            if not 0 <= fx_index < len(fx_frames):
                out.write(cam_u8)
                continue

            cam = cam_u8.astype(np.float32) / 255.0
            fx = fx_frames[fx_index].astype(np.float32) / 255.0

            color = fx[:, :TW]
            alpha = fx[:, TW:, 0]
            if limited:
                alpha = np.clip((alpha - 0.0627) * 1.1644, 0.0, 1.0)

            # Blur de 5 taps en espacio de TEXTURA, igual que el shader. Aqui las dos
            # mitades ya estan separadas, asi que la costura no puede sangrar; en el
            # shader eso lo garantiza el clamp de uvColor.
            if args.softness > 0:
                s = args.softness
                color = (color * 0.5
                         + shift(color, s, 0) * 0.125 + shift(color, -s, 0) * 0.125
                         + shift(color, 0, s) * 0.125 + shift(color, 0, -s) * 0.125)

            rgb_p = resize_f32(color, (dst_w, dst_h))[vy0 - oy:vy1 - oy, vx0 - ox:vx1 - ox]
            a = resize_f32(alpha, (dst_w, dst_h))[vy0 - oy:vy1 - oy, vx0 - ox:vx1 - ox]
            a3 = a[..., None]

            if args.naive:
                exposure, grain = np.ones(3, dtype=np.float32), 0.0
            else:
                # SceneAnalyzer con la misma cadencia que el dispositivo, no cada frame.
                if exposure is None or fx_index % args.analyze_every == 0:
                    scene_rgb, sigma = estimate_scene(cam, (vx0, vy0, vx1, vy1), a)
                    scene_luma = float(scene_rgb @ LUMA)

                    # Ganancia global: cuanto mas brillante o mas oscuro va el personaje.
                    raw = scene_luma * args.key / max(ref_luma, 1e-3)
                    raw_exposure.append(raw)
                    gain = np.clip(raw, exp_lo, exp_hi)

                    # Dominante de color, normalizada para ser neutra en luma: solo
                    # aporta el TINTE, nunca brillo. Asi el clamp de exposicion sigue
                    # controlando el brillo por si solo.
                    cast = ((scene_rgb / max(scene_luma, 1e-3))
                            / np.maximum(ref_color / max(ref_luma, 1e-3), 1e-3))
                    cast = np.clip(cast, cast_lo, cast_hi)
                    tgt_e = gain * (1.0 - args.wb + args.wb * cast)
                    tgt_g = float(np.clip(sigma, grain_lo, grain_hi))

                    # EMA. Sin esto los uniforms saltan en escalon cada 10 frames y el
                    # personaje parpadea de brillo: mas delator que no igualar nada.
                    k = args.smoothing
                    exposure = tgt_e if exposure is None else exposure + k * (tgt_e - exposure)
                    grain = tgt_g if grain is None else grain + k * (tgt_g - grain)
                resolved.append((np.asarray(exposure, dtype=np.float32), grain))

            rgb_p = rgb_p * exposure

            if grain > 0:
                n = hash13(uv_x, uv_y, np.float32(np.floor(i / fps * 30.0))) - np.float32(0.5)
                rgb_p = rgb_p + n[..., None] * grain * a3

            cam[vy0:vy1, vx0:vx1] = rgb_p + cam[vy0:vy1, vx0:vx1] * (1.0 - a3)
            out.write((np.clip(cam, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8))

            if (i + 1) % 30 == 0:
                print(f"  frame {i + 1}", end="\r", flush=True)
    print()

    if resolved:
        e = np.stack([r[0] for r in resolved])
        g = np.array([r[1] for r in resolved])
        raw = np.array(raw_exposure)
        m = e.mean(axis=0)
        print("\nUniforms resueltos (esto es lo que va a docs/receta-grading.md):")
        print(f"  uExposureMatch  [{m[0]:.3f}, {m[1]:.3f}, {m[2]:.3f}]  "
              f"(luma {float(m @ LUMA):.3f}, wb {args.wb:.2f})")
        print(f"  uGrainAmount    {g.mean():.4f}  (min {g.min():.4f}  max {g.max():.4f})")
        print(f"  uSoftness       {args.softness:.2f}")
        spread = float(m.max() / max(m.min(), 1e-3))
        if spread > 1.08:
            print(f"  -> dominante de color corregida {spread:.2f}x entre canales. Con "
                  f"--wb 0 (escalar) esta correccion no existe.")

        clamped = int(((raw < exp_lo) | (raw > exp_hi)).sum())
        if clamped:
            side = "piso" if raw.mean() < exp_lo else "techo"
            print(f"\n  AVISO: la exposicion toco el {side} del rango en {clamped}/"
                  f"{len(raw)} analisis (crudo {raw.mean():.3f} vs rango "
                  f"[{exp_lo}, {exp_hi}]).")
            print("  Esto NO es un bug del script: es la tension central del producto.")
            print("  La exposicion fisicamente correcta para este cuarto deja al")
            print("  personaje casi invisible; el clamp lo hace legible a costa de")
            print("  realismo. DONDE PONER ESE PISO es exactamente lo que tiene que")
            print("  decidir la prueba de percepcion, no el codigo. Prueba varios")
            print("  valores de --exposure-range y llevalos al test con los padres.")
    print(f"-> {args.output}")


if __name__ == "__main__":
    main()
