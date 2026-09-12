// English. Traducción del original de `es.js`, con las mismas claves y en el mismo orden:
// puestos uno al lado del otro se leen como dos columnas, y así una clave que falta canta
// a la vista antes de que la cace la prueba.
//
// El personaje se llama Ratón Pérez también aquí. Es un nombre propio -y la firma del
// papel está trazada con curvas, letra a letra-, así que traducirlo dejaría la carta
// firmada con un nombre distinto del que la encabeza. Se explica lo que es donde hace
// falta ("the tooth mouse"), pero el nombre no se toca.

export default {
  id: "en",
  lang: "en",
  nombre: "English",

  app: { titulo: "Ratón Pérez AR — prototype" },

  nav: {
    atras: "Back",
    atrasAria: "Back to the previous step",
    cerrar: "Close",
    cerrarAria: "Close and go back to the start",
    volver: "Back",
    ajustes: "Settings",
  },

  arranque: {
    titulo: "A visit from<br>Ratón Pérez",
    entradilla: "Point your phone at the bed and record the visit while your little one " +
                "sleeps. Show it to them tomorrow.",
    empezar: "Turn on the camera",
    abriendo: "Opening the camera…",
    reintentar: "Try again",
    privacidad: "We only use the camera while the app is open. Nothing is uploaded " +
                "anywhere.",
    sinCamara: "The camera needs HTTPS (or localhost) and permission from the browser.",
  },

  inicio: {
    titulo: "Tonight the tooth mouse<br>is coming",
    entradilla: "Point at the bed. You decide what they take.",
    video: "Record the visit",
    videoPie: "In version two",
    proximamente: "Coming soon",
    videoAviso: "Video is coming in version two.\nFor now, the photo and the letter.",
    foto: "Photo together",
    fotoPie: "Front camera · about 10 seconds",
    carta: "Letter from Ratón Pérez",
    cartaPie: "To leave under the pillow",
    silencio: "Nobody will hear a thing: the app makes no sound.",
  },

  pasos: {
    inicio: { titulo: "", pista: "" },
    escanear: {
      titulo: "SCAN",
      pista: "Point at the floor or the bed and move the phone slowly.\n" +
             "When the circle holds still, tap it to leave the mouse there.",
    },
    superficie: {
      titulo: "POSITION",
      pista: "Got the surface. Drag up or down to move the mouse closer or further away.",
    },
    tamano: {
      titulo: "SIZE",
      pista: "Pinch to adjust the size. The smaller it is, the more believable it looks.",
    },
    editar: { titulo: "EDIT", pista: "Choose what the mouse does." },
    foto: {
      titulo: "PHOTO",
      pista: "Drag the mouse around and pinch it to change its size.",
    },
    grabar: {
      titulo: "RECORD",
      pista: "Press the red button. It stops on its own when the animation ends.\n" +
             "You can talk while recording: your voice goes into the video.",
    },
  },

  asistente: {
    colocar: "Place it here",
    siguiente: "Next",
    anterior: "Previous",
    seleccionar: "Select",
    grabar: "Record",
    foto: "Photo",
    linterna: "Flashlight",
    camara: "Camera",
  },

  ratones: {
    clasico: "Classic",
    azul: "Blue",
    verde: "Green",
    morado: "Purple",
  },

  efectos: {
    entra_y_es_descubierto: "Walks in and gets caught",
    es_descubierto_y_se_esconde: "Gets caught and hides",
    saluda_y_se_va: "Waves and leaves",
  },

  camara: {
    salir: "Back to the start",
    luz: "Light",
    girar: "Flip the mouse",
    mas: "Settings",
    ultima: "View the last photo",
    disparar: "Take a photo",
    cambiar: "Switch camera",
    modo: "Mode",
    modoVideo: "VIDEO",
    modoFoto: "PHOTO",
    sinFrontal: "This device won't let me use the front camera.",
    sinTrasera: "I couldn't switch back to the rear camera.",
    sinLinterna: "This device won't let the browser control the flashlight.",
  },

  ajustes: {
    titulo: "Settings",
    cerrar: "Close settings",
    listo: "Done",
    tema: "Theme",
    temas: {
      auto: { nombre: "Automatic",
              pie: "Follows the phone: it turns dark when the phone turns dark." },
      claro: { nombre: "Light", pie: "Always light, whatever time it is." },
      oscuro: { nombre: "Dark",
                pie: "Always dark. At night, next to a sleeping child, this is the one " +
                     "that bothers least." },
    },
    idioma: "Language",
    idiomaPie: "The app is in English, letter included.",
  },

  opciones: {
    titulo: "The camera",
    cerrar: "Close the options",
    listo: "Done",
    raton: "Mouse in the photo",
    ratonPie: "The one that shows up when you take the photo. The letter always has the " +
              "classic one.",
    ratonSinFoto: "Couldn't load “{nombre}”. Keeping the previous one.",
    rejilla: "Grid",
    rejillaPie: "The thirds lines over the viewfinder, like the phone's own camera.",
    mic: "Record your voice too",
    micPie: "Whatever you say while recording goes into the video.",
    micNegado: "The browser refused the microphone.",
    micSinPermiso: "No microphone permission: recording video only.",
    avanzado: "Fine-tuning the image",
    avanzadoPie: "How the mouse blends into the light of the room. The app works it out " +
                 "on its own by looking at the scene; this is for overruling it. If " +
                 "something goes wrong, <b>Reset</b> puts it back.",
    key: "Light on the mouse",
    wb: "Pick up the room's colour",
    expMin: "Darken, at most",
    expMax: "Brighten, at most",
    softness: "Soft edges",
    grainMax: "Grain, at most",
    limitado: "Limited colour range",
    limitadoPie: "For cameras that deliver video from 16 to 235 instead of 0 to 255.",
    restablecer: "Reset",
    restablecido: "Fine-tuning back to factory settings",
    diagnostico: "Diagnostics",
    diagnosticoOn: "Diagnostics on",
    recorte: "The exposure is hitting the edge of the range: the right value for this " +
             "light falls outside it. Move the floor and compare.",
  },

  resultado: {
    cerrarVideo: "Close the video",
    cerrarFoto: "Close the photo",
    altFoto: "Composed photo",
    guardarCarrete: "Save to camera roll",
    guardarFotos: "Save to Photos",
    descargarArchivo: "Download file",
    conMic: "with microphone",
    sinAudio: "no audio",
    codecDudoso: "careful: this browser didn't declare the codec, check that it opens " +
                 "elsewhere",
    sinLienzo: "I couldn't capture the canvas.",
    sinMenu: "I couldn't open the menu: {error}",
    sinEfecto: "I couldn't load “{titulo}”.",
    archivoVideo: "tooth-mouse",
    archivoFoto: "tooth-mouse.png",
    archivoCarta: "letter-from-raton-perez.png",
    pistaVideoMp4: "Choose <b>Save video</b> and the clip goes into the camera roll.",
    pistaVideoWebm: "Careful: this clip is a <b>.webm</b>, and the phone's camera roll " +
                    "won't take it. You can share it or download it, but saving it to " +
                    "the gallery needs the browser to record in mp4.",
    pistaVideoDescarga: "This browser can't write to the gallery: the clip downloads as " +
                        "a file.",
    pistaFoto: "Choose <b>Save image</b> and the photo goes into the camera roll.\n" +
               "On an iPhone you can also press and hold the photo above → " +
               "<b>Add to Photos</b>.",
    pistaFotoDescarga: "This browser can't write to the gallery: the photo downloads as " +
                       "a file.",
  },

  carta: {
    pasoDatos: "The details",
    pasoCarta: "The letter",
    titulo: "The mouse's letter",
    entradilla: "Fill in what you know and the mouse writes the letter. The name is the " +
                "only thing it can't do without.",
    nombre: "What's their name?",
    obligatorio: "required",
    opcional: "optional",
    nombrePlaceholder: "Their name",
    nombreAviso: "Without a name there's nobody to write to.",
    fecha: "What day did it fall out?",
    fechaAyuda: "From the last year up to today.",
    fechaFutura: "A tooth can't fall out tomorrow.",
    fechaVieja: "That date is a long way back.",
    queDiente: "Which one did the mouse take?",
    comoEstaba: "What shape was the tooth in?",
    premio: "What did it leave in return?",
    premioPlaceholder: "A coin",
    premioAyuda: "It gets told inside the letter.",
    nota: "Anything you'd like to say",
    notaPlaceholder: "I've seen you doing your homework without anyone reminding you, " +
                     "and learning English with real enthusiasm. I'm very proud of you.",
    notaAyuda: "It goes inside the letter, in the mouse's own hand.",
    quedan: "{n} left.",
    generar: "Write the letter",
    hecha: "It's written",
    hechaPie: "Save it to the camera roll or send it to the printer.",
    imprimir: "Print",
    descargar: "Download",
    lienzo: "The letter from Ratón Pérez",
    pistaGuardar: "Choose <b>Save image</b> and the letter goes into the camera roll, " +
                  "ready to be printed.\nTo print it from here, use <b>Print</b>.",
    pistaDescargar: "Keep it with <b>Download</b> or send it to the printer with " +
                    "<b>Print</b>.",

    membrete: "MUSEUM OF TEETH",
    encabezado: "A letter from Ratón Pérez",
    selloArriba: "MUSEUM OF TEETH",
    selloAbajo: "RATÓN PÉREZ",
    saludo: "Dear {nombre},",
    saludoVacio: "Dear…",
    posdata: "P. S. Keep looking after those teeth!",
    despedida: "With love,",
    // "11 September 2026": el orden día-mes-año se lee igual a los dos lados del
    // Atlántico, y "September 11" no.
    fechaLarga: "{d} {mes} {a}",
    meses: ["January", "February", "March", "April", "May", "June", "July", "August",
            "September", "October", "November", "December"],

    parrafoEntrada: "Last night I tiptoed into your room. You were sleeping so soundly " +
                    "that I didn't want to wake you.",
    // El inglés no concuerda en género, así que aquí `terminacion` no se usa y el hueco
    // no aparece en la plantilla. Los campos están para que cada idioma coja los que su
    // gramática necesita, no para gastarlos todos.
    parrafoDiente: "Under the pillow I found {objeto}. {frase} I wrapped {pronombre} in " +
                   "a handkerchief and carried {pronombre} off to my museum, where I " +
                   "keep the bravest teeth in the world. {posesivo} already has a place " +
                   "there, with your name underneath.",
    parrafoPremio: "I left {premio} in its place.",
    parrafoCierre: "I'll be back when the next one comes out.",

    dientes: [
      { id: "primero", etiqueta: "The first one", objeto: "your very first tooth",
        pronombre: "it", posesivo: "Yours", terminacion: "" },
      { id: "arriba", etiqueta: "One from the top", objeto: "a tooth from the top",
        pronombre: "it", posesivo: "Yours", terminacion: "" },
      { id: "abajo", etiqueta: "One from the bottom", objeto: "a tooth from the bottom",
        pronombre: "it", posesivo: "Yours", terminacion: "" },
      { id: "muela", etiqueta: "A molar", objeto: "one of your molars",
        pronombre: "it", posesivo: "Yours", terminacion: "" },
    ],

    estados: [
      { id: "super", etiqueta: "Sparkling clean",
        frase: "Anyone could tell you brush your teeth every single day." },
      { id: "limpio", etiqueta: "Clean", frase: "It's easy to see you look after them." },
      { id: "mejorable", etiqueta: "Room to improve",
        frase: "Your toothbrush would like to see you a little more often." },
    ],
  },
};
