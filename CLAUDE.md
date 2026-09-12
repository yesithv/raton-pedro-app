# Cómo se trabaja en este repositorio

## El ciclo, y va entero y sin preguntar

El dueño del repositorio lo pidió así, con estas palabras: *"no me preguntes si creas pull
request, no me preguntes si mezclas"*. **Es una autorización permanente**, no una de una
vez: cada ajuste que se pida aquí termina desplegado en GitHub Pages, sin pasos
intermedios que haya que aprobar.

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

La autorización de arriba cubre el ciclo de entrega —rama, PR, mezcla, despliegue—, y
nada más. Sigue haciendo falta preguntar para cambiar el alcance de lo que se pidió,
borrar trabajo de otra rama, reescribir el historial de `main`, o tocar la configuración
del repositorio en GitHub (Pages, entornos, permisos).

## El idioma

El código, los comentarios, los mensajes de commit, los PR y la interfaz van en
**castellano**. Los comentarios explican decisiones —por qué esto y no lo otro, qué se
rompía antes—, no describen la línea de al lado.
