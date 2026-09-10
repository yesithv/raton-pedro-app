#!/usr/bin/env python3
"""Recorta un PNG RGBA al rectangulo que realmente tiene pixeles opacos.

Sin Pillow a proposito: es el unico paso de la cadena de assets que hace falta para el
prototipo web, y pedir una dependencia para recortar margenes vacios no se sostiene.

    python3 tools/crop_alpha.py entrada.png salida.png [--pad 0.02] [--threshold 8]

El margen (--pad, fraccion del lado mayor del recorte) deja aire para la sombra que la
pagina dibuja por CSS; sin el, drop-shadow se corta contra el borde de la imagen.
"""

import argparse
import struct
import sys
import zlib


def read_rgba(path):
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path} no es un PNG")
    pos, idat, hdr = 8, bytearray(), None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        kind = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            hdr = struct.unpack(">IIBBBBB", chunk)
        elif kind == b"IDAT":
            idat += chunk
        pos += 12 + length

    w, h, depth, color, _, _, interlace = hdr
    if (depth, color, interlace) != (8, 6, 0):
        raise SystemExit(
            f"solo se admite RGBA de 8 bits sin entrelazar; este es "
            f"depth={depth} color={color} interlace={interlace}")

    raw = zlib.decompress(bytes(idat))
    bpp, stride = 4, w * 4
    out, prev, i = bytearray(), bytearray(stride), 0
    for _ in range(h):
        f = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        # Deshacer el filtro por scanline (PNG 9.2). Es lo unico "denso" del archivo.
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out += line
        prev = line
    return w, h, bytes(out)


def write_rgba(path, w, h, px):
    # Filtro "Up" en todas las lineas: en un recorte con mucho fondo transparente y
    # degradados verticales suaves comprime ~25% mejor que no filtrar, y cuesta dos
    # lineas de codigo. Elegir el mejor filtro por linea daria poco mas.
    raw = bytearray()
    prev = bytes(w * 4)
    for y in range(h):
        line = px[y * w * 4:(y + 1) * w * 4]
        raw.append(2)
        raw += bytes((line[x] - prev[x]) & 255 for x in range(w * 4))
        prev = line

    def chunk(kind, payload):
        return (struct.pack(">I", len(payload)) + kind + payload
                + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF))

    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n")
        fh.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        fh.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        fh.write(chunk(b"IEND", b""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--threshold", type=int, default=8,
                    help="alfa por debajo del cual el pixel cuenta como vacio")
    ap.add_argument("--pad", type=float, default=0.02,
                    help="margen transparente anadido, fraccion del lado mayor")
    args = ap.parse_args()

    w, h, px = read_rgba(args.src)
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        row = px[y * w * 4:(y + 1) * w * 4]
        for x in range(w):
            if row[x * 4 + 3] > args.threshold:
                x0, x1 = min(x0, x), max(x1, x)
                y0, y1 = min(y0, y), max(y1, y)
    if x1 < 0:
        raise SystemExit("la imagen esta completamente transparente")

    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    pad = int(max(cw, ch) * args.pad)
    ow, oh = cw + 2 * pad, ch + 2 * pad
    out = bytearray(ow * oh * 4)
    for y in range(ch):
        src = ((y0 + y) * w + x0) * 4
        dst = ((pad + y) * ow + pad) * 4
        out[dst:dst + cw * 4] = px[src:src + cw * 4]

    write_rgba(args.dst, ow, oh, bytes(out))
    print(f"{args.src} {w}x{h} -> {args.dst} {ow}x{oh} "
          f"(recorte {x0},{y0}-{x1},{y1}, margen {pad}px)")


if __name__ == "__main__":
    sys.exit(main())
