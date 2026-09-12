#!/usr/bin/env python3
"""Traduce shaders/composite.frag a Metal, para que iOS no tenga su propia copia.

EL PROBLEMA QUE RESUELVE
------------------------
`shaders/composite.frag` es la fuente única de verdad de la composición: el mismo archivo
lo usan el nativo de Android (GLSL ES 3.0 directo) y el prototipo web (dos sustituciones
documentadas en `web/js/compositor.js`). En iOS eso se rompe, porque OpenGL ES está
obsoleto desde iOS 12 y el camino real es Metal, que no come GLSL sino MSL.

La salida fácil sería escribir a mano un `composite.metal` y mantenerlo en paralelo. Es
exactamente lo que este repositorio lleva entero evitando: dos copias de la misma
matemática se separan en silencio, y el síntoma —que el ratón se ve distinto en un
iPhone— no apunta a la causa por ningún lado.

LA CADENA
---------
    composite.frag  --(este script)-->  GLSL apto para SPIR-V
                    --(glslangValidator)-->  SPIR-V
                    --(spirv-opt)------->  SPIR-V con todo inlineado
                    --(spirv-cross)----->  composite.metal

Las herramientas son las de Khronos, y corren igual en Linux, macOS y Windows:

    apt install glslang-tools spirv-tools spirv-cross   # Debian / Ubuntu
    brew install glslang spirv-tools spirv-cross        # macOS

EL PASO DE INLINEADO NO ES UNA OPTIMIZACIÓN: ES OBLIGATORIO
------------------------------------------------------------
Sin él, esto no compila en un Mac, y el error no se parece en nada a su causa. Metal tiene
espacios de direcciones explícitos: los uniforms llegan en `constant` y las variables
locales viven en `thread`. Cuando spirv-cross traduce una función auxiliar del GLSL
—`sampleOverlay()`, aquí— le pone los parámetros en `thread`, pero luego le pasa un
uniform, que está en `constant`. El compilador de Apple lo rechaza:

    cannot bind reference in address space 'constant' to object
    in default address space in 4th argument

Lo cazó la primera ejecución de `CI iOS`, con seis errores iguales. Inlineando antes de
traducir no queda ninguna función que pueda tener ese desajuste: todo acaba dentro del
`main0`, que es donde los uniforms ya están declarados con su espacio correcto. Y no
cambia nada del render: cualquier compilador de GPU inlinea esto de todos modos.

POR QUÉ EL .metal SE VERSIONA, AL REVÉS QUE EL DE ANDROID
---------------------------------------------------------
En Android el shader se copia a los assets en cada build, con una tarea de Gradle, así que
versionarlo crearía una segunda copia que se queda atrás. En iOS no hay un paso
equivalente: el proyecto de Xcode tiene que encontrar el `.metal` ya escrito, y pedirle a
quien compile que instale dos herramientas de Khronos antes es una barrera que no aporta
nada. Así que el archivo generado ENTRA en el repositorio, y lo que impide que se quede
atrás es el CI: regenera y compara. Si alguien toca el `.frag` y no regenera, falla.

LAS CUATRO TRANSFORMACIONES, Y POR QUÉ CADA UNA
------------------------------------------------
Ninguna cambia la matemática. Si alguna lo hiciera, el prototipo dejaría de valer como
referencia del nativo, que es el motivo entero de tener un solo shader.

1. La extensión `GL_OES_EGL_image_external_essl3` y el `samplerExternalOES` son de
   Android: allí la textura de cámara la entrega una SurfaceTexture, que es externa. En
   Metal la cámara llega como `CVPixelBuffer` convertido a `MTLTexture`, que es una
   textura normal. Es la misma sustitución que hace `toWebGL()` en web.

2. El bloque `#ifdef OVERLAY_EXTERNAL` se resuelve por la rama del `#else`, por lo mismo.

3. `#version 300 es` sube a `310 es`: glslang no genera SPIR-V por debajo de esa versión.
   Es un requisito del traductor, no del shader; el código es el mismo.

4. Los uniforms no opacos y las varyings reciben `layout(location = N)`. SPIR-V no admite
   asignación implícita de localizaciones. El número se asigna POR ORDEN DE APARICIÓN en
   el archivo, que es determinista: el mismo `.frag` da siempre el mismo `.metal`.

   Ojo al leer la salida: spirv-cross reparte los `[[buffer(N)]]` de Metal por su cuenta y
   NO coinciden con estas localizaciones. Los que valen para el código Swift son los que
   aparecen en el `.metal` generado.
"""

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "shaders" / "composite.frag"
SALIDA = RAIZ / "app" / "ios" / "Runner" / "Shaders" / "composite.metal"

CABECERA = """// GENERADO. No se edita a mano: se regenera.
//
//     python3 tools/shader_a_msl.py
//
// La fuente es shaders/composite.frag, que es la misma que usan el nativo de Android y el
// prototipo web. Si editas este archivo, el siguiente que regenere se lleva tu cambio por
// delante, y el CI falla antes por haberse separado del original.
//
// Por qué existe y qué transformaciones lleva: tools/shader_a_msl.py.
"""


def preparar(glsl: str) -> str:
    """El GLSL del repositorio, en la forma que SPIR-V acepta. Ver el docstring."""
    s = re.sub(r"^#extension\s+GL_OES_EGL_image_external_essl3.*$", "", glsl, flags=re.M)
    s = re.sub(r"#ifdef\s+OVERLAY_EXTERNAL[\s\S]*?#else\n([\s\S]*?)#endif", r"\1", s)
    s = s.replace("samplerExternalOES", "sampler2D")
    s = s.replace("#version 300 es", "#version 310 es")

    siguiente = [0]

    def uniforme(m):
        # Los samplers son opacos y NO llevan location: ponérselo es un error de compilación.
        if "sampler" in m.group(1):
            return m.group(0)
        etiqueta = f"layout(location = {siguiente[0]}) {m.group(0)}"
        siguiente[0] += 1
        return etiqueta

    s = re.sub(r"^uniform\s+(\w+)", uniforme, s, flags=re.M)

    entrada = [0]

    def varying(m):
        etiqueta = f"layout(location = {entrada[0]}) {m.group(0)}"
        entrada[0] += 1
        return etiqueta

    s = re.sub(r"^in\s+", varying, s, flags=re.M)
    s = re.sub(r"^out\s+", lambda m: f"layout(location = 0) {m.group(0)}", s, flags=re.M)
    return s


def falta(herramienta: str) -> bool:
    return shutil.which(herramienta) is None


def traducir(glsl: str) -> str:
    for herramienta in ("glslangValidator", "spirv-opt", "spirv-cross"):
        if falta(herramienta):
            sys.exit(
                f"Falta {herramienta}.\n"
                "  Debian/Ubuntu: apt install glslang-tools spirv-tools spirv-cross\n"
                "  macOS:         brew install glslang spirv-tools spirv-cross"
            )

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        frag = tmp / "composite.frag"
        spv = tmp / "composite.spv"
        metal = tmp / "composite.metal"
        frag.write_text(preparar(glsl))

        # -G: semántica de OpenGL. Con -V (Vulkan) los uniforms globales no se admiten y
        # habría que meterlos en un bloque, o sea, tocar el shader compartido.
        # stdout capturado: glslangValidator imprime el nombre del archivo temporal, que
        # en la salida del CI solo es ruido. Los errores siguen saliendo por stderr.
        subprocess.run(
            ["glslangValidator", "-G", "-S", "frag", "-o", str(spv), str(frag)],
            check=True, stdout=subprocess.DEVNULL,
        )
        # Sin esto el Metal generado NO compila. Ver el docstring: es lo que evita que una
        # función auxiliar reciba un uniform de `constant` por un parámetro de `thread`.
        plano = tmp / "composite.opt.spv"
        subprocess.run(
            ["spirv-opt", "--inline-entry-points-exhaustive", "--eliminate-dead-functions",
             "-o", str(plano), str(spv)],
            check=True, stdout=subprocess.DEVNULL,
        )
        # 2.1 es el mínimo que se puede exigir en iOS 15, que es el objetivo declarado.
        subprocess.run(
            ["spirv-cross", str(plano), "--msl", "--msl-version", "20100",
             "--output", str(metal)],
            check=True,
        )
        return CABECERA + "\n" + metal.read_text()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--comprobar",
        action="store_true",
        help="no escribe: falla si lo generado no coincide con lo que hay. Es lo que corre el CI.",
    )
    args = ap.parse_args()

    generado = traducir(ENTRADA.read_text())

    if args.comprobar:
        actual = SALIDA.read_text() if SALIDA.exists() else ""
        if actual != generado:
            print(
                f"{SALIDA.relative_to(RAIZ)} no coincide con {ENTRADA.relative_to(RAIZ)}.\n"
                "El shader de Metal se ha quedado atrás. Regenéralo:\n"
                "    python3 tools/shader_a_msl.py",
                file=sys.stderr,
            )
            return 1
        print(f"{SALIDA.relative_to(RAIZ)} está al día.")
        return 0

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(generado)
    print(f"{SALIDA.relative_to(RAIZ)} — {len(generado.splitlines())} líneas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
