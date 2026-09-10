#!/usr/bin/env bash
# Prepara el material sintético, levanta un servidor sobre la raíz del repo y corre la
# prueba del asistente. Es lo que ejecuta CI y lo que se puede correr en local.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="${WORK_DIR:-/tmp/perezar-web-test}"
PORT="${PORT:-8099}"
mkdir -p "$WORK"

FFMPEG="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || command -v ffmpeg)"

if [ ! -s "$WORK/fakecam.y4m" ]; then
  echo "generando cámara falsa…"
  # Cuarto con luz de color, como el de la app de referencia: es la condición que más
  # castiga un uExposureMatch escalar, así que es la que conviene tener en CI.
  python3 "$ROOT/tools/make_placeholder.py" --outdir "$WORK/room" \
    --effect-frames 1 --room-frames 120 --size 1280x720 >/dev/null
  "$FFMPEG" -hide_banner -loglevel error -y -i "$WORK/room/cuarto_sintetico.mp4" \
    -vf "colorchannelmixer=rr=1.55:gg=0.55:bb=1.75,eq=brightness=0.10" \
    -pix_fmt yuv420p "$WORK/fakecam.y4m"
fi

python3 -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 30); do
  curl -sf -o /dev/null "http://localhost:$PORT/web/index.html" && break
  sleep 0.5
done

cd "$ROOT/web/test"
[ -d node_modules ] || npm install --no-fund --no-audit

# Si el entorno ya trae un Chromium de Playwright, se usa ese en vez de descargar otro.
if [ -z "${CHROMIUM_PATH:-}" ] && [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  CHROMIUM_PATH="$(find "$PLAYWRIGHT_BROWSERS_PATH" -maxdepth 3 -type f -name chrome \
                    -path '*chrome-linux*' 2>/dev/null | sort | tail -1)"
  export CHROMIUM_PATH
fi

FAKE_CAM="$WORK/fakecam.y4m" BASE_URL="http://localhost:$PORT" \
  SHOT_DIR="${SHOT_DIR:-$WORK}" node ./flow.test.mjs
