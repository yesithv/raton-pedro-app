// Definicion del asistente. Sigue paso por paso el flujo de la app de referencia
// documentado en docs/plan-de-trabajo.md, hallazgo 5.
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
    hint: "Mueve tu teléfono para encontrar la superficie donde colocar al Ratón Pérez.\n" +
          "Arrastra el retículo hasta el punto donde quieres que aparezca.",
    overlay: false,
    reticle: true,
    gesture: "move",
    back: "inicio",
  },
  superficie: {
    title: "SUPERFICIE",
    hint: "La superficie ha sido detectada. Puedes ajustar la posición del Ratón Pérez " +
          "moviéndolo hacia arriba o hacia abajo.",
    overlay: true,
    reticle: false,
    gesture: "moveY",
    loop: true,
    back: "escanear",
  },
  tamano: {
    title: "TAMAÑO",
    hint: "Cambia el tamaño del Ratón Pérez. Puedes hacerlo más grande o más pequeño.",
    overlay: true,
    reticle: false,
    gesture: "scale",
    loop: true,
    back: "superficie",
  },
  editar: {
    title: "EDITAR",
    hint: "Escoge la animación que más te guste.",
    overlay: true,
    reticle: false,
    gesture: "none",
    loop: true,
    back: "tamano",
  },
  grabar: {
    title: "GRABAR",
    hint: "Toca el botón rojo. El video se detiene solo al terminar la animación.",
    overlay: true,
    reticle: false,
    gesture: "none",
    loop: true,
    back: "editar",
  },
};

export const ORDER = ["inicio", "escanear", "superficie", "tamano", "editar", "grabar"];
