# Publicar la app de Android

Lo que hace falta para pasar de «compila un APK de depuración» a «hay un archivo que se
puede subir a Google Play». Se hace **una vez**; después, publicar una versión nueva es
lanzar un workflow.

---

## 1. La clave de firma, y por qué es lo más delicado de todo esto

Google Play identifica una app **por su firma**, no por su nombre ni por su identificador.
De ahí salen las dos reglas que ordenan todo lo demás:

- **Quien tenga la clave puede publicar actualizaciones de esta app.** Por eso no entra en
  el repositorio: ni el `.jks`, ni las contraseñas, ni en un commit «temporal». Están en
  `.gitignore` (`key.properties`, `**/*.jks`, `**/*.keystore`) para que no pase por
  descuido.
- **Si se pierde la clave, no hay forma de actualizar la app.** Nunca. Hay que publicar
  otra distinta, con otro identificador, y quien tuviera instalada la primera se queda en
  la versión vieja para siempre. Guardarla solo en los secretos de GitHub **no es una
  copia de seguridad**: hace falta el archivo aparte, en un gestor de contraseñas o donde
  se guarden las cosas que no se pueden perder.

Se crea con el `keytool` que viene con Java:

```bash
keytool -genkey -v -keystore ~/claves/perezar.jks \
        -keyalg RSA -keysize 2048 -validity 10000 -alias perezar
```

`-validity 10000` son unos 27 años. No es capricho: Google Play exige que la clave siga
siendo válida más allá de 2033, y una clave caducada no se puede renovar para una app ya
publicada.

Después, `cp app/android/key.properties.ejemplo app/android/key.properties` y rellenarlo.
Con eso, `flutter build appbundle --release` ya sale firmado en local.

> **Lo que pasa si no hay clave:** no se rompe nada. `build.gradle.kts` cae a la clave de
> depuración, que es lo que permite que el CI siga compilando en cada PR sin acceso a la
> clave de verdad. Pero ese archivo **no vale para publicar**, y por eso el workflow de
> release comprueba el certificado antes de darlo por bueno.

---

## 2. Los cuatro secretos, para construir en CI

En **Settings → Secrets and variables → Actions**, del repositorio:

| Secreto | Qué es |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | El `.jks` entero en base64: `base64 -w0 ~/claves/perezar.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | La contraseña del almacén |
| `ANDROID_KEY_ALIAS` | El alias de dentro (`perezar`, si se siguió el comando de arriba) |
| `ANDROID_KEY_PASSWORD` | La contraseña de esa clave |

`.github/workflows/release-android.yml` los comprueba **en el primer paso** y se detiene
diciendo cuál falta. Un fallo de Gradle veinte minutos después por una variable vacía se
lee como cualquier otra cosa menos como lo que es.

---

## 3. Construir el paquete

Desde la pestaña **Actions → Release Android → Run workflow**, o empujando una etiqueta:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Deja dos archivos como artefacto:

- **`app-release.aab`** — el bundle, que es lo que pide Google Play.
- **`app-release.apk`** — para instalar a mano en un teléfono. Es la única forma de
  probarlo de verdad antes de publicar, y conviene hacerlo: el emulador del CI demuestra
  que arranca, no que la composición se vea bien en una habitación a oscuras.

---

## 4. La versión

Sale de una sola línea, `version:` en `app/pubspec.yaml`:

```yaml
version: 0.1.0+1
#        ^^^^^ versionName: lo que lee el usuario
#              ^ versionCode: lo que mira Google Play
```

**El `versionCode` tiene que subir en cada subida.** Play no deja reutilizar ninguno, ni
siquiera el de una versión retirada. El `versionName` es libre.

---

## 5. Lo que falta, y no es código

Esto el repositorio no lo puede preparar:

1. **La cuenta de Google Play Developer.** 25 dólares, pago único.
2. **La política de privacidad**, con una URL pública. Es **obligatoria** porque la app
   pide cámara y micrófono. A favor: todo el procesamiento es en el dispositivo y no se
   sube nada a ningún sitio, que es lo que la app ya dice en su pantalla de arranque.
3. **El cuestionario de seguridad de datos** de la ficha, que tiene que decir lo mismo.
4. **Las capturas y la descripción.**
5. **Probarlo en un teléfono de verdad.** Ninguna prueba de este repositorio sustituye a
   apuntar a una cama a oscuras y mirar si el ratón parece estar ahí.

---

## Lo que ya está resuelto

Para no volver a decidirlo:

- **El identificador** es `com.ironcoding.perezar` y no se puede cambiar después de
  publicar: es la identidad de la app en la tienda.
- **El nombre visible** es «Ratón Pérez», en `AndroidManifest.xml`.
- **El icono** es el busto del personaje sobre el papel cálido de la app, en adaptativo
  (dos capas, que es lo que usan los lanzadores desde Android 8) y en cuadrado heredado
  para API 24 y 25. Es el busto y no el cuerpo entero porque a 48 px el personaje completo
  es una mancha; lo que se reconoce son las orejas, las gafas y el rojo del chándal.
- **`minSdk` es 24** porque es lo que exige ARCore. La app funciona sin ARCore —cae a
  colocación por toque— pero la dependencia fija el suelo igual.
- **ARCore va como `optional`** y `camera.ar` como `required="false"`, a propósito: con
  `required` Play ocultaría la app en todos los dispositivos no certificados, que son
  parte del parque objetivo.
