// Definicion del asistente. El flujo sigue el de la app de referencia (hallazgo 5 de
// docs/plan-de-trabajo.md), pero los textos son propios: replicar el producto es
// legitimo, copiar su redaccion palabra por palabra no aporta nada y ademas se puede
// escribir mas claro.
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
    title: "",
    hint: "",
    overlay: false,
    reticle: false,
    gesture: "none",
  },
  escanear: {
    title: "ESCANEAR",
    hint: "Apunta al suelo o a la cama y mueve el teléfono despacio.\n" +
          "Cuando el círculo se quede quieto, tócalo para dejar ahí al ratón.",
    overlay: false,
    reticle: true,
    gesture: "move",
    back: "inicio",
  },
  superficie: {
    title: "POSICIÓN",
    hint: "Ya tengo la superficie. Arrastra hacia arriba o hacia abajo para acercar o " +
          "alejar al ratón.",
    overlay: true,
    reticle: false,
    gesture: "moveY",
    loop: true,
    back: "escanear",
  },
  tamano: {
    title: "TAMAÑO",
    hint: "Pellizca para ajustar el tamaño. Cuanto más pequeño, más creíble.",
    overlay: true,
    reticle: false,
    gesture: "scale",
    loop: true,
    back: "superficie",
  },
  editar: {
    title: "EDITAR",
    hint: "Elige qué hace el ratón.",
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
  foto: {
    title: "FOTO",
    hint: "Arrastra al ratón donde quieras y pellizca para cambiar su tamaño.\n" +
          "Pulsa el botón blanco para tomar la foto.",
    overlay: false,
    sticker: true,
    reticle: false,
    gesture: "moveAndScale",
    back: "inicio",
  },

  grabar: {
    title: "GRABAR",
    hint: "Pulsa el botón rojo. Se detiene solo al acabar la animación.\n" +
          "Puedes hablar mientras grabas: tu voz entra en el video.",
    overlay: true,
    reticle: false,
    gesture: "none",
    loop: true,
    back: "editar",
  },
};

export const ORDER = ["inicio", "escanear", "superficie", "tamano", "editar", "grabar"];
// FOTO no aparece: no esta en la cadena del asistente, se entra y se sale por INICIO.
