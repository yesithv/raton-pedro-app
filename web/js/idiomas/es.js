// Castellano. Es el idioma de origen de la app y, por eso, el ORIGINAL: cuando una clave
// falta en otro idioma, `i18n.js` cae aquí. Así una traducción a medias enseña una frase
// en castellano —molesto pero legible— en vez de un hueco o el nombre de la clave.
//
// La estructura la marca este archivo: los demás idiomas tienen que traer exactamente las
// mismas claves, y la prueba de `web/test/` compara los tres juegos y falla si se separan.
// Sin esa comprobación, añadir un texto aquí y olvidarlo en inglés no rompe nada hasta que
// alguien cambia de idioma, que es cuando ya no hay quien lo vea venir.

export default {
  id: "es",
  // Lo que se escribe en el <html lang>: lo leen el lector de pantalla, el corrector del
  // teclado y el guionado del navegador.
  lang: "es",
  // El nombre va SIEMPRE en su propio idioma, en los tres selectores. Quien busca el suyo
  // en una lista busca la palabra que conoce, no su traducción.
  nombre: "Español",

  app: { titulo: "Ratón Pérez AR — prototipo" },

  nav: {
    atras: "Atrás",
    atrasAria: "Volver al paso anterior",
    cerrar: "Cerrar",
    cerrarAria: "Cerrar y volver al inicio",
    volver: "Volver",
    ajustes: "Ajustes",
  },

  arranque: {
    titulo: "Ratón Pérez<br>en su cuarto",
    entradilla: "Apunta el móvil a la cama y graba su visita mientras el peque duerme. " +
                "Mañana se lo enseñas.",
    empezar: "Encender la cámara",
    abriendo: "Abriendo cámara…",
    reintentar: "Reintentar",
    privacidad: "Solo usamos la cámara mientras la app está abierta. " +
                "Nada se sube a ningún sitio.",
    sinCamara: "La cámara necesita HTTPS (o localhost) y permiso del navegador.",
  },

  inicio: {
    titulo: "Esta noche viene<br>el Ratón Pérez",
    entradilla: "Apunta a la cama. Tú eliges qué se lleva.",
    video: "Grabar su visita",
    videoPie: "Vídeo de 5 s · unos 40 segundos",
    foto: "Foto con él",
    fotoPie: "Cámara frontal · unos 10 segundos",
    carta: "Carta del Ratón Pérez",
    cartaPie: "Para dejar bajo la almohada",
    silencio: "Nadie oye nada: la app no hace ruido.",
  },

  // Los textos del asistente. Las claves son las de `STEPS` en `flow.js`, que se quedó solo
  // con el COMPORTAMIENTO de cada paso: qué gesto admite, si hay retículo, a dónde vuelve.
  pasos: {
    inicio: { titulo: "", pista: "" },
    escanear: {
      titulo: "ESCANEAR",
      pista: "Apunta al suelo o a la cama y mueve el teléfono despacio.\n" +
             "Cuando el círculo se quede quieto, tócalo para dejar ahí al ratón.",
    },
    superficie: {
      titulo: "POSICIÓN",
      pista: "Ya tengo la superficie. Arrastra hacia arriba o hacia abajo para acercar o " +
             "alejar al ratón.",
    },
    tamano: {
      titulo: "TAMAÑO",
      pista: "Pellizca para ajustar el tamaño. Cuanto más pequeño, más creíble.",
    },
    editar: { titulo: "EDITAR", pista: "Elige qué hace el ratón." },
    foto: {
      titulo: "FOTO",
      pista: "Arrastra al ratón y pellízcalo para cambiar su tamaño.",
    },
    grabar: {
      titulo: "GRABAR",
      pista: "Pulsa el botón rojo. Se detiene solo al acabar la animación.\n" +
             "Puedes hablar mientras grabas: tu voz entra en el vídeo.",
    },
  },

  asistente: {
    colocar: "Colocar aquí",
    siguiente: "Siguiente",
    anterior: "Anterior",
    seleccionar: "Seleccionar",
    grabar: "Grabar",
    foto: "Foto",
    linterna: "Linterna",
    camara: "Cámara",
  },

  // Los tres placeholders del catálogo. Se traducen POR ID y no dentro del asset: el
  // `.json` que acompaña al vídeo lo genera `tools/build_effect.py` y describe el material,
  // no la interfaz. Si algún día falta la clave, se enseña el título del asset.
  efectos: {
    entra_y_es_descubierto: "Entra y es descubierto",
    es_descubierto_y_se_esconde: "Es descubierto y se esconde",
    saluda_y_se_va: "Saluda y se va",
  },

  camara: {
    salir: "Volver al inicio",
    luz: "Luz",
    girar: "Girar al ratón",
    mas: "Ajustes",
    ultima: "Ver la última foto",
    disparar: "Tomar foto",
    cambiar: "Cambiar de cámara",
    modo: "Modo",
    modoVideo: "VÍDEO",
    modoFoto: "FOTO",
    sinFrontal: "Este dispositivo no me deja usar la cámara frontal.",
    sinTrasera: "No pude volver a la cámara de atrás.",
    sinLinterna: "Este dispositivo no deja controlar la linterna desde el navegador.",
  },

  ajustes: {
    titulo: "Ajustes",
    cerrar: "Cerrar los ajustes",
    listo: "Listo",
    tema: "Tema",
    temas: {
      auto: { nombre: "Automático",
              pie: "Sigue al teléfono: se pone oscuro cuando el teléfono se pone oscuro." },
      claro: { nombre: "Claro", pie: "Siempre claro, sea la hora que sea." },
      oscuro: { nombre: "Oscuro",
                pie: "Siempre oscuro. De noche, junto a un niño dormido, es el que menos " +
                     "molesta." },
    },
    idioma: "Idioma",
    // Cada idioma dice esto EN SÍ MISMO, y por eso no lleva variables: quien acaba de
    // elegirlo tiene que leer la confirmación ya traducida, que es la prueba de que el
    // cambio ha surtido efecto.
    idiomaPie: "La app está en español, carta incluida.",
  },

  opciones: {
    titulo: "La cámara",
    cerrar: "Cerrar las opciones",
    listo: "Listo",
    rejilla: "Cuadrícula",
    rejillaPie: "Las líneas de los tercios sobre el visor, como en la cámara del teléfono.",
    mic: "Grabar también tu voz",
    micPie: "Lo que digas mientras grabas entra en el vídeo.",
    micNegado: "El navegador negó el micrófono.",
    micSinPermiso: "Sin permiso de micrófono: grabo solo vídeo.",
    avanzado: "Ajuste fino de la imagen",
    avanzadoPie: "Cómo se funde el ratón con la luz del cuarto. La app lo calcula sola " +
                 "mirando la escena; esto es para llevarle la contraria. Si algo se " +
                 "tuerce, <b>Restablecer</b> lo deja como estaba.",
    key: "Luz sobre el ratón",
    wb: "Toma el color del cuarto",
    expMin: "Oscurecer, como mucho",
    expMax: "Aclarar, como mucho",
    softness: "Bordes suaves",
    grainMax: "Grano, como mucho",
    limitado: "Rango de color limitado",
    limitadoPie: "Para cámaras que entregan el vídeo de 16 a 235 en vez de 0 a 255.",
    restablecer: "Restablecer",
    restablecido: "Ajuste fino, como de fábrica",
    diagnostico: "Diagnóstico",
    diagnosticoOn: "Diagnóstico activado",
    recorte: "La exposición toca el borde del rango: el valor correcto para esta luz " +
             "queda fuera. Mueve el piso y compara.",
  },

  resultado: {
    cerrarVideo: "Cerrar el vídeo",
    cerrarFoto: "Cerrar la foto",
    altFoto: "Foto compuesta",
    guardarCarrete: "Guardar en el carrete",
    guardarFotos: "Guardar en Fotos",
    descargarArchivo: "Descargar archivo",
    conMic: "con micrófono",
    sinAudio: "sin audio",
    codecDudoso: "ojo: este navegador no declaró el códec, comprueba que abra fuera",
    sinLienzo: "No pude capturar el lienzo.",
    sinMenu: "No pude abrir el menú: {error}",
    sinEfecto: "No pude cargar «{titulo}».",
    // Los nombres de archivo se traducen igual que lo demás: quien descarga en inglés no
    // tiene por qué encontrarse un nombre en castellano en su carpeta de descargas. Sin
    // tildes ni espacios, que es lo que aguanta cualquier sistema de archivos.
    archivoVideo: "raton-perez",
    archivoFoto: "raton-perez.png",
    archivoCarta: "carta-del-raton-perez.png",
    pistaVideoMp4: "Elige <b>Guardar vídeo</b> y el clip entra en el carrete.",
    pistaVideoWebm: "Ojo: este clip es <b>.webm</b>, y el carrete del teléfono no lo " +
                    "acepta. Se puede compartir o descargar, pero para guardarlo en la " +
                    "galería hace falta que el navegador grabe en mp4.",
    pistaVideoDescarga: "Este navegador no puede escribir en la galería: el clip se " +
                        "descarga como archivo.",
    pistaFoto: "Elige <b>Guardar imagen</b> y la foto entra en el carrete.\n" +
               "En el iPhone también sirve mantener pulsada la foto de arriba → " +
               "<b>Añadir a Fotos</b>.",
    pistaFotoDescarga: "Este navegador no puede escribir en la galería: la foto se " +
                       "descarga como archivo.",
  },

  carta: {
    // --- La pantalla ---------------------------------------------------------
    pasoDatos: "Los datos",
    pasoCarta: "La carta",
    cerrar: "Cerrar la carta",
    titulo: "La carta del Ratón",
    entradilla: "Rellena lo que sepas y el Ratón escribe la carta. Lo único " +
                "imprescindible es el nombre.",
    nombre: "¿Cómo se llama?",
    obligatorio: "obligatorio",
    opcional: "opcional",
    nombrePlaceholder: "Su nombre",
    nombreAviso: "Sin nombre no hay a quién escribirle.",
    fecha: "¿Qué día se le cayó?",
    fechaAyuda: "Del último año hasta hoy.",
    fechaFutura: "El diente no se puede caer mañana.",
    fechaVieja: "Esa fecha queda muy atrás.",
    queDiente: "¿Cuál se llevó el Ratón?",
    comoEstaba: "¿Cómo estaba el diente?",
    premio: "¿Qué le dejó a cambio?",
    premioPlaceholder: "Una moneda",
    premioAyuda: "Se cuenta dentro de la carta.",
    nota: "Lo que quieras decirle",
    notaPlaceholder: "Te he visto haciendo las tareas sin que nadie te lo recuerde, y " +
                     "aprendiendo inglés con muchas ganas. Estoy muy orgulloso de ti.",
    notaAyuda: "Va dentro de la carta, con la letra del Ratón.",
    quedan: "Te quedan {n}.",
    generar: "Escribir la carta",
    hecha: "Ya está escrita",
    hechaPie: "Guárdala en el carrete o mándala a la impresora.",
    imprimir: "Imprimir",
    descargar: "Descargar",
    lienzo: "La carta del Ratón Pérez",
    pistaGuardar: "Elige <b>Guardar imagen</b> y la carta entra en el carrete, lista " +
                  "para mandarla a imprimir.\nPara imprimirla desde aquí, usa " +
                  "<b>Imprimir</b>.",
    pistaDescargar: "Guárdala con <b>Descargar</b> o mándala a la impresora con " +
                    "<b>Imprimir</b>.",

    // --- El papel ------------------------------------------------------------
    // El NOMBRE del personaje no se traduce en ningún idioma, y no es un descuido: es un
    // nombre propio, y además la firma del papel está TRAZADA con curvas letra a letra
    // (`firmaRatonPerez`). Traducirlo dejaría la carta firmada con otro nombre distinto
    // del que la encabeza.
    membrete: "MUSEO DE LOS DIENTES",
    encabezado: "Carta del Ratón Pérez",
    selloArriba: "MUSEO DE LOS DIENTES",
    selloAbajo: "RATÓN PÉREZ",
    saludo: "Hola, {nombre}:",
    saludoVacio: "Hola…",
    posdata: "P. D. ¡Sigue cuidando esos dientes!",
    despedida: "Con cariño,",
    // "11 de septiembre de 2026". Se compone con piezas y no con `Intl.DateTimeFormat`
    // porque el formato largo de Intl varía entre navegadores y la carta se imprime: una
    // fecha que cambia de forma según el teléfono delata la plantilla.
    fechaLarga: "{d} de {mes} de {a}",
    meses: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
            "septiembre", "octubre", "noviembre", "diciembre"],

    // Los párrafos, con huecos. `pronombre`, `posesivo` y `terminacion` salen de la tabla
    // de dientes de abajo: sin ellos la carta dice "lo envolví" y "el tuyo" de UNA MUELA.
    // Cada idioma usa los huecos que su gramática necesita y puede ignorar el resto.
    parrafoEntrada: "Anoche entré en tu cuarto de puntillas. Estabas durmiendo tan a " +
                    "gusto que no quise despertarte.",
    parrafoDiente: "Debajo de la almohada encontré {objeto}. {frase} Me {pronombre} " +
                   "llevé envuelt{terminacion} en un pañuelo a mi museo, donde guardo " +
                   "los dientes más valientes del mundo. {posesivo} ya tiene su sitio, " +
                   "con tu nombre debajo.",
    parrafoPremio: "A cambio te dejé {premio} en su lugar.",
    parrafoCierre: "Volveré cuando se caiga el siguiente.",

    // Los `id` son los mismos en los tres idiomas: son la CLAVE que se guarda en el
    // formulario, no un texto. Cambiar de idioma con la carta a medias no puede perder lo
    // que ya estaba elegido.
    dientes: [
      { id: "primero", etiqueta: "El primero", objeto: "tu primer diente",
        pronombre: "lo", posesivo: "El tuyo", terminacion: "o" },
      { id: "arriba", etiqueta: "Uno de arriba", objeto: "un diente de arriba",
        pronombre: "lo", posesivo: "El tuyo", terminacion: "o" },
      { id: "abajo", etiqueta: "Uno de abajo", objeto: "un diente de abajo",
        pronombre: "lo", posesivo: "El tuyo", terminacion: "o" },
      { id: "muela", etiqueta: "Una muela", objeto: "tu muela",
        pronombre: "la", posesivo: "La tuya", terminacion: "a" },
    ],

    // Ninguna frase riñe al niño: la que avisa lo hace de parte del cepillo y con gracia.
    estados: [
      { id: "super", etiqueta: "Súper limpio",
        frase: "Se notaba a la legua que te lavas los dientes todos los días." },
      { id: "limpio", etiqueta: "Limpio", frase: "Se nota que los cuidas." },
      { id: "mejorable", etiqueta: "Se puede mejorar",
        frase: "Al cepillo le gustaría verte un poco más a menudo." },
    ],
  },
};
