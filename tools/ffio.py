"""Lectura y escritura de video cruda por tuberia de ffmpeg.

Sin dependencias de ffprobe: las dimensiones se sacan parseando el stderr del
propio ffmpeg, porque el binario que trae imageio-ffmpeg no incluye ffprobe.
"""

import os
import re
import shutil
import subprocess
import numpy as np


def ffmpeg_exe():
    """Devuelve la ruta al binario de ffmpeg: PATH primero, imageio-ffmpeg despues."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass
    raise RuntimeError(
        "No encuentro ffmpeg. Instalalo en el PATH o corre:\n"
        "    pip install imageio-ffmpeg"
    )


_STREAM_RE = re.compile(r"Stream #\d+:\d+.*?: Video:.*?(\d{2,5})x(\d{2,5})")
_FPS_RE = re.compile(r"(\d+(?:\.\d+)?) fps")


def probe(path):
    """Devuelve {'width', 'height', 'fps'} del primer stream de video."""
    out = subprocess.run(
        [ffmpeg_exe(), "-hide_banner", "-i", path],
        capture_output=True, text=True, errors="replace",
    ).stderr

    for line in out.splitlines():
        if "Video:" not in line:
            continue
        dims = _STREAM_RE.search(line)
        if not dims:
            continue
        fps = _FPS_RE.search(line)
        return {
            "width": int(dims.group(1)),
            "height": int(dims.group(2)),
            "fps": float(fps.group(1)) if fps else 30.0,
        }

    raise RuntimeError(f"No pude leer un stream de video de {path}:\n{out[-800:]}")


def read_frames(path, width, height):
    """Genera frames RGB uint8 de forma (height, width, 3)."""
    frame_bytes = width * height * 3
    proc = subprocess.Popen(
        [ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
         "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    try:
        while True:
            buf = proc.stdout.read(frame_bytes)
            if len(buf) < frame_bytes:
                break
            yield np.frombuffer(buf, np.uint8).reshape(height, width, 3)
    finally:
        proc.stdout.close()
        err = proc.stderr.read().decode("utf-8", "replace")
        proc.stderr.close()
        if proc.wait() not in (0, 255) and err.strip():
            raise RuntimeError(f"ffmpeg fallo leyendo {path}:\n{err[-800:]}")


class VideoWriter:
    """Escribe frames RGB uint8 a un mp4 H.264.

    Rango completo (yuvj420p) a proposito: es lo que espera el shader con
    uLimitedRange=false. Ver seccion 3 de docs/arquitectura.md.
    """

    def __init__(self, path, width, height, fps=30.0, crf=18, gop=15,
                 audio_from=None, pix_fmt="yuvj420p"):
        if width % 2 or height % 2:
            raise ValueError(f"Dimensiones impares no codifican en 4:2:0: {width}x{height}")

        os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)

        cmd = [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
               "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{width}x{height}", "-r", f"{fps}", "-i", "-"]

        if audio_from:
            cmd += ["-i", audio_from, "-map", "0:v:0", "-map", "1:a:0",
                    "-c:a", "aac", "-b:a", "128k", "-shortest"]

        cmd += ["-c:v", "libx264", "-profile:v", "high", "-pix_fmt", pix_fmt,
                "-crf", str(crf), "-g", str(gop),
                "-color_range", "pc", "-movflags", "+faststart", path]

        self.path = path
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    def write(self, frame):
        self.proc.stdin.write(np.ascontiguousarray(frame, dtype=np.uint8).tobytes())

    def close(self):
        self.proc.stdin.close()
        err = self.proc.stderr.read().decode("utf-8", "replace")
        self.proc.stderr.close()
        if self.proc.wait() != 0:
            raise RuntimeError(f"ffmpeg fallo escribiendo {self.path}:\n{err[-800:]}")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
