#!/usr/bin/env bash
#
# Comprobación de tipos de la capa nativa Android SIN el SDK de Android.
#
# Por qué existe: construir un APK necesita el Android Gradle Plugin, AndroidX y ARCore,
# y los tres viven en Google Maven (dl.google.com / maven.google.com). En entornos con la
# salida de red restringida eso no está disponible, y el código Kotlin se quedaría sin
# comprobar del todo. Este script consigue lo que sí se puede:
#
#   - android.jar               -> org.robolectric:android-all, en Maven Central
#   - Flutter embedding         -> storage.googleapis.com/download.flutter.io
#   - ARCore                    -> NO alcanzable; se usa tools/kotlin-check/arcore_stub.kt
#
# QUÉ VALIDA: que los nueve archivos Kotlin son consistentes entre sí y contra las APIs
# REALES de Android y de Flutter. Tipos, nulabilidad, firmas, flujo.
#
# QUÉ NO VALIDA: que la API real de ARCore coincida con el stub, ni nada de Gradle,
# recursos, manifest merger, ProGuard o empaquetado. Eso solo lo dice `flutter build apk`
# en una máquina con el SDK de Android.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${PEREZAR_CACHE:-/tmp/perezar-verify}"
SRC="$ROOT/app/android/app/src/main/kotlin"
mkdir -p "$CACHE/libs"

need() { command -v "$1" >/dev/null 2>&1 || { echo "falta $1"; exit 1; }; }
need curl
need unzip

fetch() {  # fetch <url> <destino>
  [ -s "$2" ] && return 0
  echo "descargando $(basename "$2")…"
  curl -sSL --max-time 900 --retry 3 -o "$2" "$1"
}

# --- kotlinc ---
KOTLIN_VERSION="${KOTLIN_VERSION:-2.4.20}"
if [ ! -x "$CACHE/kotlinc/bin/kotlinc" ]; then
  fetch "https://github.com/JetBrains/kotlin/releases/download/v$KOTLIN_VERSION/kotlin-compiler-$KOTLIN_VERSION.zip" \
        "$CACHE/kotlinc.zip"
  unzip -q -o "$CACHE/kotlinc.zip" -d "$CACHE"
  chmod +x "$CACHE"/kotlinc/bin/*
fi

# --- android.jar sustituto ---
ANDROID_ALL="${ANDROID_ALL:-16-robolectric-13921718}"
fetch "https://repo1.maven.org/maven2/org/robolectric/android-all/$ANDROID_ALL/android-all-$ANDROID_ALL.jar" \
      "$CACHE/libs/android-all.jar"

# --- Flutter embedding, con el hash del engine del SDK instalado ---
FLUTTER_BIN="$(command -v flutter || true)"
if [ -n "$FLUTTER_BIN" ]; then
  ENGINE="$(cat "$(dirname "$(readlink -f "$FLUTTER_BIN")")/internal/engine.version")"
else
  ENGINE="${FLUTTER_ENGINE:?define FLUTTER_ENGINE o pon flutter en el PATH}"
fi
fetch "https://storage.googleapis.com/download.flutter.io/io/flutter/flutter_embedding_release/1.0.0-$ENGINE/flutter_embedding_release-1.0.0-$ENGINE.jar" \
      "$CACHE/libs/flutter_embedding.jar"

# --- ARCore: el de verdad si se alcanza, el stub si no ---
ARCORE_VERSION="${ARCORE_VERSION:-1.42.0}"
ARCORE_SOURCES=()
if curl -sSIL -o /dev/null -f --max-time 20 \
     "https://maven.google.com/com/google/ar/core/$ARCORE_VERSION/core-$ARCORE_VERSION.aar" 2>/dev/null; then
  fetch "https://maven.google.com/com/google/ar/core/$ARCORE_VERSION/core-$ARCORE_VERSION.aar" \
        "$CACHE/libs/arcore.aar"
  ( cd "$CACHE/libs" && unzip -q -o arcore.aar classes.jar && mv classes.jar arcore.jar )
  ARCORE_CP=":$CACHE/libs/arcore.jar"
  echo "ARCore: artefacto REAL $ARCORE_VERSION"
else
  ARCORE_CP=""
  ARCORE_SOURCES=("$ROOT/tools/kotlin-check/arcore_stub.kt")
  echo "ARCore: inalcanzable, se usa el STUB (no valida la API real)"
fi

CP="$CACHE/libs/android-all.jar:$CACHE/libs/flutter_embedding.jar$ARCORE_CP"

# MainActivity.kt se excluye: hereda de FlutterActivity, cuyo supertipo LifecycleOwner
# vive en AndroidX, que solo se publica en Google Maven. Son 8 líneas de boilerplate.
mapfile -t SOURCES < <(find "$SRC" -name '*.kt' ! -name 'MainActivity.kt')
echo
echo "compilando ${#SOURCES[@]} archivos Kotlin (MainActivity.kt excluido)…"
"$CACHE/kotlinc/bin/kotlinc" -cp "$CP" -jvm-target 17 -d "$CACHE/out" \
  "${ARCORE_SOURCES[@]}" "${SOURCES[@]}"

echo
echo "OK · $(find "$CACHE/out" -name '*.class' | wc -l) clases generadas, sin errores ni avisos"
