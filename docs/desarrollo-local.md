# Desarrollo local — emulador Android

Notas prácticas para levantar el AVD y correr la app en esta máquina. Compañero de
[`../app/README.md`](../app/README.md), que cubre la puesta en marcha de Flutter; esto es
específicamente sobre el emulador.

## AVD usado

`Medium_Phone_API_36.1` (Android 36.1, `google_apis_playstore`, x86_64).

## Levantar el emulador por consola

```powershell
& "$env:LOCALAPPDATA\Android\sdk\emulator\emulator.exe" -avd Medium_Phone_API_36.1 -no-snapshot-load
```

`-no-snapshot-load` fuerza un arranque completo (sin retomar snapshot). Es más lento
(~40s) pero evita estados corruptos heredados de una sesión anterior que crasheó.

Corre en una terminal aparte — queda en primer plano. Verificar que arrancó:

```powershell
$adb = "$env:LOCALAPPDATA\Android\sdk\platform-tools\adb.exe"
& $adb devices                      # debe listar "emulator-5554   device" (no "offline")
& $adb shell getprop sys.boot_completed   # debe devolver "1"
```

Una vez arriba, `flutter run -d emulator-5554` o `flutter build apk --debug` +
`adb install -r ...` funcionan normal.

## Problemas conocidos

**No lances el emulador dos veces.** Si ya hay una instancia de `Medium_Phone_API_36.1`
corriendo y vuelves a ejecutar el comando de arriba, sale
`FATAL | Running multiple emulators with the same AVD is an experimental feature.` y deja
el AVD original en un estado inconsistente — `flutter run` deja de encontrar
`emulator-5554` y la app puede crashear al abrir la cámara
(`CameraAccessException: CAMERA_DISABLED ... cannot open camera from background`).
Revisa `adb devices` antes de lanzar; si ya aparece `emulator-5554 device`, no vuelvas a
correr el comando del emulador.

**El diálogo "Detected ADB" al abrir el emulador es inofensivo.** Sale porque se lanzó
por consola y no por Android Studio, así que no tiene la ruta de ADB configurada en
"Extended Controls". No afecta a `adb` ni a `flutter run` desde la terminal — solo
dale OK.

**El AVD se cae solo después de bootear.** Este `Medium_Phone_API_36.1` en esta máquina
es inestable: tras arrancar, a veces se cierra solo unos segundos/minutos después con
errores de gfxstream/GL en el log (`glAttachShader:509 error 0x502`,
`adb protocol fault`, `UpdateLayeredWindowIndirect failed`). No es un bug de la app.
Solución: revisar `adb devices` antes de asumir que sigue vivo, y relanzarlo con el
comando de arriba si hace falta.

**Gradle + SSL corporativo (Netskope).** Sin esto, `flutter build apk` falla al
descargar dependencias:

```powershell
$env:GRADLE_OPTS = "-Djavax.net.ssl.trustStore=$env:USERPROFILE\.gradle\cacerts-with-netskope -Djavax.net.ssl.trustStorePassword=changeit"
```

Ponerlo antes de cualquier `flutter build` / `flutter run` en la sesión de terminal.

**Cámara frontal del emulador (selfie).** Por defecto el AVD manda un patrón sintético
de prueba (bloques verdes/negros que cambian) en vez de una imagen real — es el
comportamiento normal de `hw.camera.front=emulated`, no un bug. Para ver una imagen real
de tu propia webcam:

1. `& "$env:LOCALAPPDATA\Android\sdk\emulator\emulator.exe" -webcam-list` — confirma que
   detecta una webcam (ej. `webcam0`).
2. Editar `hw.camera.front=webcam0` en
   `C:\Users\<usuario>\.android\avd\<AVD>.avd\config.ini` (el `.ini` corto en
   `avd\<nombre>.ini` solo apunta a esta carpeta real vía `path=`).
3. Reiniciar el emulador con arranque completo (`-no-snapshot-load`) para que tome el
   config nuevo.

En este AVD/HAL, `SurfaceTexture.getTransformMatrix()` para la webcam pass-through YA
viene rotada 90° por su cuenta (no es identidad como en la mayoría de teléfonos reales) —
`Camera2Driver.kt` usa esa matriz cruda tal cual, sin corregirla a mano. Lo único que se
ajusta manualmente es el recorte "cover" (`coverFit`), que necesita las dimensiones del
sensor invertidas (alto/ancho) para esa cámara porque el buffer que llega tras la
rotación ya es portrait, no landscape. Si se vuelve a ver la selfie descentrada o
rotada, revisar primero con un log del `xform` crudo antes de asumir que hace falta
corregirlo — fue la causa de varias vueltas en falso. Los botones de "rotar" de la barra
lateral del emulador son solo para simular girar el teléfono; no reflejan uso normal y
no hace falta que la app se vea bien en esos estados.

## Screenshots rápidos para depurar

```powershell
$adb = "$env:LOCALAPPDATA\Android\sdk\platform-tools\adb.exe"
& $adb shell screencap -p /sdcard/x.png
& $adb pull /sdcard/x.png .\temp\x.png
```
