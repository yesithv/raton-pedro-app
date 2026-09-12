// Definicion del asistente. El flujo sigue el de la app de referencia (hallazgo 5 de
// docs/plan-de-trabajo.md), pero los textos son propios: replicar el producto es
// legitimo, copiar su redaccion palabra por palabra no aporta nada y ademas se puede
// escribir mas claro.
//
// AQUI YA NO HAY TEXTOS, solo comportamiento: que gesto admite el paso, si se ve el
// reticulo, si el personaje va en bucle y a donde se vuelve. El titulo y la pista de cada
// paso viven en `idiomas/` bajo `pasos.<nombre>`, y main.js los busca por el nombre del
// paso. Mezclados aqui, cada idioma nuevo obligaba a tocar este archivo -que es logica- y
// a mantener tres copias de la maquina de estados.
//
// Todos los pasos que muestran al personaje lo reproducen en BUCLE. Es lo que hace la
// referencia -el raton esta animado mientras lo colocas- y ademas elimina una
// dependencia fragil: mostrar un "frame de pose" exige poder BUSCAR en el video, y hay
// servidores que no responden a peticiones HTTP Range (entre ellos el
// "python3 -m http.server" que se usa para probar en local). Sin Range, seekable queda
// en [0,0], la busqueda se recorta a 0 y el personaje simplemente no aparece.
//
// La diferencia irreducible esta en ESCANEAR: la referencia detecta un plano real con
// ARCore/ARKit; en el navegador eso no existe -WebXR depende igualmente de ARCore, y en
// una sesion inmersiva se pierde el acceso a la textura de camara que necesita el shader-
// asi que aqui el reticulo se coloca a dedo. El resto del flujo es equivalente.

export const STEPS = {
  inicio: {
    overlay: false,
    reticle: false,
    gesture: "none",
  },
  escanear: {
    overlay: false,
    reticle: true,
    gesture: "move",
    back: "inicio",
  },
  superficie: {
    overlay: true,
    reticle: false,
    gesture: "moveY",
    loop: true,
    back: "escanear",
  },
  tamano: {
    overlay: true,
    reticle: false,
    gesture: "scale",
    loop: true,
    back: "superficie",
  },
  editar: {
    overlay: true,
    reticle: false,
    gesture: "none",
    loop: true,
    back: "tamano",
  },

  // FOTO no es un paso mas del asistente: es la otra mitad del producto (hallazgo 8 de
  // docs/plan-de-trabajo.md, "el modo foto es un selfie con el nino dormido"). Se entra
  // desde INICIO y se sale a INICIO, sin escaneo, sin superficie y sin catalogo.
  //
  // Y sobre todo SIN VIDEO: aqui el raton es un PNG con alfa dibujado encima de la
  // camara, no un frame del atlas color|matte. Una foto no necesita animacion, y el
  // <video> del overlay es justo la pieza que mas se rompe en un movil (autoplay,
  // codecs, decodificadores ocupados). Para una imagen fija, un <img> siempre pinta.
  //
  // Su pista es corta a proposito: en FOTO no es una caja de instrucciones, es una
  // pastilla que se va sola a los cuatro segundos, como los avisos de la camara del
  // telefono.
  foto: {
    overlay: false,
    sticker: true,
    reticle: false,
    gesture: "moveAndScale",
    back: "inicio",
  },

  grabar: {
    overlay: true,
    reticle: false,
    gesture: "none",
    loop: true,
    back: "editar",
  },
};

// FOTO no aparece en la cadena del asistente: se entra y se sale por INICIO. El orden de
// los pasos no hace falta escribirlo en ningun sitio -cada paso sabe a donde vuelve con
// su `back`, y hacia delante lo decide el boton que se pulsa-. Hubo aqui un `ORDER` con
// la lista entera, y no lo importaba nadie: una segunda declaracion del mismo flujo que
// solo podia quedarse desfasada.
