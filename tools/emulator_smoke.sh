#!/usr/bin/env bash
#
# Humo en emulador: instalar, arrancar y comprobar que no revienta.
#
# Vive en un archivo y no dentro del workflow porque android-emulator-runner ejecuta
# CADA LÍNEA del bloque `script:` como un `sh -c` independiente. Un if/fi multilínea se
# parte por la mitad y falla con "Syntax error: end of file unexpected", que además se
# lee como si hubiera fallado la app.
#
# QUÉ PRUEBA: que la app arranca, que no revienta creando el contexto GL y que sigue viva.
# QUÉ NO PRUEBA, que es casi todo: un emulador no tiene ARCore, así que se ejercita el
# camino de Camera2Driver y no el de anclaje; su cámara falsa no tiene ruido de sensor,
# así que el SceneAnalyzer mide algo que no existe; y su MediaCodec no es el de un
# teléfono barato. El rendimiento aquí no dice nada sobre gama baja.
set -uo pipefail

PKG=com.ironcoding.perezar
APK="${1:-app-debug.apk}"
SETTLE_SECONDS="${SETTLE_SECONDS:-25}"

fail() { echo "::error::$1"; shift; [ $# -gt 0 ] && printf '%s\n' "$@"; exit 1; }

adb install -r "$APK" || fail "no se pudo instalar el APK"

# Se conceden por adb a propósito: el objetivo aquí es ejercitar el pipeline, no el
# diálogo de permisos. Que la app los PIDA cuando no están concedidos es otra cosa, y
# eso se comprueba en un dispositivo real.
adb shell pm grant "$PKG" android.permission.CAMERA || true
adb shell pm grant "$PKG" android.permission.RECORD_AUDIO || true

adb logcat -c
adb shell am start -n "$PKG/.MainActivity" || fail "am start falló"
sleep "$SETTLE_SECONDS"

adb logcat -d > logcat.txt
adb exec-out screencap -p > arranque.png || true

if grep -q "FATAL EXCEPTION" logcat.txt; then
  fail "la app crasheó al arrancar" "$(grep -A 30 'FATAL EXCEPTION' logcat.txt)"
fi
if ! adb shell pidof "$PKG" > /dev/null 2>&1; then
  fail "el proceso no sigue vivo tras ${SETTLE_SECONDS}s" "$(tail -60 logcat.txt)"
fi

# Un ANR no mata el proceso, así que sin esto pasaría por bueno un arranque congelado.
if grep -qE "ANR in $PKG" logcat.txt; then
  fail "la app se colgó (ANR)" "$(grep -A 20 "ANR in $PKG" logcat.txt)"
fi

echo "arrancó, sigue vivo y sin excepciones fatales"
grep -E "perezar|PerezAr|GLES|EGL" logcat.txt | tail -20 || true
