// Lo poco que sobrevive a cerrar la app: el tema, el idioma, el micrófono, la rejilla y
// los dos ratones elegidos, el de la foto y el de la carta.
//
// Existe por una razón concreta: `localStorage` PUEDE LANZAR. En una ventana privada, con
// las cookies de sitio bloqueadas o dentro de un iframe sin permiso, leerlo o escribirlo
// tira una excepción en vez de devolver `null`. Sin envolverlo, cada sitio que guarda una
// preferencia necesita su propio `try/catch`, y basta con que a uno se le olvide para que
// la app entera no arranque en modo privado. Llegaron a ser SEIS repartidos entre dos
// módulos, todos con el mismo comentario a medias.
//
// La regla de este archivo: **no guardar nunca nada que no sea una preferencia**. Aquí no
// entran ni los ajustes finos del compositor —son de una escena concreta y heredarlos de
// otra noche es peor que perderlos— ni nada del usuario. Ni nombres, ni fechas, ni cartas.
//
// EXCEPCIÓN CONOCIDA, y es deliberada: el script en línea del `<head>` de `index.html` lee
// `tema` e `idioma` por su cuenta, sin pasar por aquí. No puede: se ejecuta ANTES que los
// módulos y antes de la hoja de estilos, que es justo lo que evita el destello de tema
// equivocado a las dos de la mañana. Si se cambia el nombre de una de esas dos claves, hay
// que cambiarlo también allí.

/** Los nombres, en un solo sitio. Escritos a mano en cada sitio se separan. */
export const CLAVES = {
  tema: "tema",
  idioma: "idioma",
  mic: "mic",
  rejilla: "rejilla",
  // Cuál de los ratones del catálogo sale en la foto, y cuál va dibujado en la carta. Son
  // DOS elecciones y no una: se puede llevar el morado en la foto y el clásico en la
  // carta. Se guarda el `id` y no la ruta del archivo, porque las rutas cambian cuando
  // llegan los PNG buenos y la elección tiene que sobrevivir a eso.
  raton: "raton",
  ratonCarta: "ratonCarta",
};

/** El valor guardado, o `null` si no hay o no se puede leer. */
export function leer(clave) {
  try {
    return localStorage.getItem(clave);
  } catch (e) {
    return null;   // sin almacenamiento, manda el valor de fábrica
  }
}

/** Guarda, y si no se puede, se calla: la preferencia vale para esta sesión. */
export function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch (e) { /* en privado no se puede guardar; no es motivo para romper nada */ }
}

export function olvidar(clave) {
  try {
    localStorage.removeItem(clave);
  } catch (e) { /* lo mismo: si no se pudo guardar, tampoco hay nada que borrar */ }
}

/**
 * Un interruptor de sí/no, con su valor de fábrica.
 *
 * Se guarda como "si"/"no" y no como "true"/"false" porque es lo que ya había escrito en
 * los teléfonos de quien viene usando la app, y cambiar el formato ahora le apagaría el
 * micrófono a quien lo tenía puesto.
 */
export function leerBooleano(clave, porDefecto) {
  const v = leer(clave);
  return v === null ? porDefecto : v === "si";
}

export function guardarBooleano(clave, valor) {
  guardar(clave, valor ? "si" : "no");
}
