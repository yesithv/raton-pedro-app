# Cómo se trabaja en este repositorio

## Primero se pregunta QUÉ, y solo eso

**Antes de tocar nada, se propone y se espera el visto bueno.** El dueño del repositorio
lo pidió así: *"antes de que ajustes las cosas, quiero que me preguntes para que yo te
pueda confirmar si las haces o no, o en qué orden, o cuáles sí y cuáles no"*.

Así que cualquier trabajo aquí empieza igual: se analiza, se propone una **lista concreta
de cambios** —qué se toca, qué se gana, qué riesgo tiene— y se espera respuesta. Él decide
cuáles entran, cuáles no y en qué orden. Proponer tres cosas y hacer las tres porque
"iban juntas" es exactamente lo que esta regla prohíbe.

La pregunta es sobre **el qué, no sobre el cómo ni sobre el trámite**. Una vez dicho que
sí, no se vuelve a preguntar: el ciclo de entrega de aquí abajo va entero y solo. Y no
hace falta preguntar para *mirar*: analizar el repositorio, leer código, correr las
pruebas o contestar una duda no cambia nada y no necesita permiso.

Si a mitad de camino aparece algo que no estaba en la lista aprobada —un fallo de paso,
una mejora evidente, un archivo que pedía a gritos otra cosa—, **no se hace**: se termina
lo aprobado y se apunta lo otro como la siguiente propuesta.

## El ciclo, una vez dicho que sí, y va entero y sin preguntar

Aprobado el qué, el resto no se consulta. El dueño del repositorio lo pidió con estas
palabras: *"no me preguntes si creas pull request, no me preguntes si mezclas"*. **Es una
autorización permanente**, no una de una vez: un cambio ya aprobado termina desplegado en
GitHub Pages sin pasos intermedios que haya que aprobar.

Para cualquier cambio de código en este proyecto:

1. **Rama y commit.** Nunca directo a `main`. Mensaje en castellano, explicando *por qué*
   se cambia y no solo *qué* se cambia, como el resto del historial.
2. **Probarlo antes de subirlo.** `./web/test/run.sh` es la prueba que protege lo que está
   verificado de verdad. Si el cambio toca `web/`, `shaders/` o `tools/`, se corre en
   local y tiene que decir `TODO OK`. Un push que pone el CI en rojo cuesta un ciclo.
3. **Abrir el pull request.** Sin preguntar.
4. **Suscribirse a la actividad del PR** (`subscribe_pr_activity`) para enterarse de lo
   que diga el CI.
5. **Esperar a que el CI web esté verde y mezclar.** Sin preguntar. Si el CI falla, se
   arregla la causa —nunca se salta, desactiva ni aparca una prueba— y se vuelve a
   empezar por el 2 hasta que pase.
6. **Seguir el despliegue de Pages** (workflow `Pages`, que se dispara al empujar a
   `main`). Si falla, se arregla igual que el CI y se repite.
7. **Avisar solo al final**, cuando el despliegue esté realmente terminado: *ya está
   desplegado, pruébalo en Pages*, con el enlace. No hay informes intermedios pidiendo
   permiso.

La prueba se corre con `./web/test/run.sh` y necesita `numpy`, `pillow` e
`imageio_ffmpeg` (`pip install -r tools/requirements.txt`), un Chromium de Playwright y
un servidor sobre la raíz del repo —de eso último se encarga el propio script—.

## Los dos workflows que importan

| Workflow | Cuándo corre | Qué pasa si falla |
|---|---|---|
| `CI web` | En cada PR y en `push` a `main`, si cambia `web/`, `shaders/`, `tools/` o el propio workflow | No se mezcla. Se arregla la causa. |
| `Pages` | En `push` a `main`, si cambia `web/`, `shaders/` o el propio workflow | El cambio está en `main` pero no en la web. Se arregla y se vuelve a empujar. |

El sitio publicado es <https://yesithv.github.io/raton-pedro-app/>, que redirige a
`web/`. Pages sirve una copia cacheada: tras un despliegue conviene recargar sin caché
para verlo.

## Qué NO se hace sin preguntar

La autorización de arriba cubre **el ciclo de entrega de un cambio ya aprobado** —rama,
PR, mezcla, despliegue—, y nada más. Hay que preguntar, además de por el qué:

- **El alcance.** Cualquier cosa que no esté en la lista que se aprobó, por pequeña que
  sea y aunque se cruce por delante mientras se trabaja.
- **Borrar trabajo de otra rama** o reescribir el historial de `main`.
- **La configuración del repositorio en GitHub**: Pages, entornos, permisos, secretos.
- **Añadir una dependencia, un servicio de terceros o un workflow nuevo.** Cambian lo que
  hay que mantener y lo que puede fallar, y eso no es un detalle de implementación.
- **Cualquier cosa que cueste dinero o abra una cuenta** —una cuenta de desarrollador, un
  runner de pago, un dominio—. Nunca se contrata nada por iniciativa propia.

## El idioma

El código, los comentarios, los mensajes de commit, los PR y la interfaz van en
**castellano**. Los comentarios explican decisiones —por qué esto y no lo otro, qué se
rompía antes—, no describen la línea de al lado.
