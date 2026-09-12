// Português. Mismas claves que `es.js`, en el mismo orden.
//
// Es português EUROPEU, y conviene decirlo: entre "telemóvel" y "celular", o entre
// "estás a dormir" y "está dormindo", no hay forma neutra que suene bien en los dos
// lados. Fingir que la hay produce un texto que no es de nadie. Si algún día hace falta
// el de Brasil, se añade `pt-BR` como un idioma más -que es justo para lo que está
// montado esto- y no se estropea este.
//
// El nombre del personaje no se traduce, como en inglés: es un nombre propio y la firma
// del papel está trazada letra a letra.

export default {
  id: "pt",
  lang: "pt",
  nombre: "Português",

  app: { titulo: "Ratón Pérez AR — protótipo" },

  nav: {
    atras: "Voltar",
    atrasAria: "Voltar ao passo anterior",
    cerrar: "Fechar",
    cerrarAria: "Fechar e voltar ao início",
    volver: "Voltar",
    ajustes: "Definições",
  },

  arranque: {
    titulo: "O Ratón Pérez<br>no quarto dele",
    entradilla: "Aponta o telemóvel para a cama e grava a visita enquanto o pequeno " +
                "dorme. Amanhã mostras-lhe.",
    empezar: "Ligar a câmara",
    abriendo: "A abrir a câmara…",
    reintentar: "Tentar outra vez",
    privacidad: "Só usamos a câmara enquanto a app está aberta. Nada é enviado para " +
                "lado nenhum.",
    sinCamara: "A câmara precisa de HTTPS (ou localhost) e de permissão do navegador.",
  },

  inicio: {
    titulo: "Esta noite vem<br>o Ratón Pérez",
    entradilla: "Aponta para a cama. Tu escolhes o que ele leva.",
    video: "Gravar a visita",
    videoPie: "Vídeo de 5 s · cerca de 40 segundos",
    foto: "Foto com ele",
    fotoPie: "Câmara frontal · cerca de 10 segundos",
    carta: "Carta do Ratón Pérez",
    cartaPie: "Para deixar debaixo da almofada",
    silencio: "Ninguém ouve nada: a app não faz barulho.",
  },

  pasos: {
    inicio: { titulo: "", pista: "" },
    escanear: {
      titulo: "ANALISAR",
      pista: "Aponta para o chão ou para a cama e move o telemóvel devagar.\n" +
             "Quando o círculo ficar parado, toca nele para deixar ali o rato.",
    },
    superficie: {
      titulo: "POSIÇÃO",
      pista: "Já tenho a superfície. Arrasta para cima ou para baixo para aproximar ou " +
             "afastar o rato.",
    },
    tamano: {
      titulo: "TAMANHO",
      pista: "Faz um gesto de pinça para ajustar o tamanho. Quanto mais pequeno, mais " +
             "credível.",
    },
    editar: { titulo: "EDITAR", pista: "Escolhe o que o rato faz." },
    foto: {
      titulo: "FOTO",
      pista: "Arrasta o rato e faz pinça para mudar o tamanho.",
    },
    grabar: {
      titulo: "GRAVAR",
      pista: "Carrega no botão vermelho. Pára sozinho quando a animação acaba.\n" +
             "Podes falar enquanto gravas: a tua voz entra no vídeo.",
    },
  },

  asistente: {
    colocar: "Colocar aqui",
    siguiente: "Seguinte",
    anterior: "Anterior",
    seleccionar: "Selecionar",
    grabar: "Gravar",
    foto: "Foto",
    linterna: "Lanterna",
    camara: "Câmara",
  },

  efectos: {
    entra_y_es_descubierto: "Entra e é apanhado",
    es_descubierto_y_se_esconde: "É apanhado e esconde-se",
    saluda_y_se_va: "Acena e vai-se embora",
  },

  camara: {
    salir: "Voltar ao início",
    luz: "Luz",
    girar: "Virar o rato",
    mas: "Definições",
    ultima: "Ver a última foto",
    disparar: "Tirar foto",
    cambiar: "Mudar de câmara",
    modo: "Modo",
    modoVideo: "VÍDEO",
    modoFoto: "FOTO",
    sinFrontal: "Este dispositivo não me deixa usar a câmara frontal.",
    sinTrasera: "Não consegui voltar à câmara de trás.",
    sinLinterna: "Este dispositivo não deixa o navegador controlar a lanterna.",
  },

  ajustes: {
    titulo: "Definições",
    cerrar: "Fechar as definições",
    listo: "Pronto",
    tema: "Tema",
    temas: {
      auto: { nombre: "Automático",
              pie: "Segue o telemóvel: fica escuro quando o telemóvel fica escuro." },
      claro: { nombre: "Claro", pie: "Sempre claro, seja a hora que for." },
      oscuro: { nombre: "Escuro",
                pie: "Sempre escuro. De noite, ao lado de uma criança a dormir, é o que " +
                     "menos incomoda." },
    },
    idioma: "Idioma",
    idiomaPie: "A app está em português, carta incluída.",
  },

  opciones: {
    titulo: "A câmara",
    cerrar: "Fechar as opções",
    listo: "Pronto",
    rejilla: "Grelha",
    rejillaPie: "As linhas dos terços sobre o visor, como na câmara do telemóvel.",
    mic: "Gravar também a tua voz",
    micPie: "O que disseres enquanto gravas entra no vídeo.",
    micNegado: "O navegador recusou o microfone.",
    micSinPermiso: "Sem permissão do microfone: gravo só vídeo.",
    avanzado: "Ajuste fino da imagem",
    avanzadoPie: "Como o rato se funde com a luz do quarto. A app calcula-o sozinha a " +
                 "olhar para a cena; isto é para lhe levar a contrária. Se algo correr " +
                 "mal, <b>Repor</b> deixa tudo como estava.",
    key: "Luz sobre o rato",
    wb: "Apanha a cor do quarto",
    expMin: "Escurecer, no máximo",
    expMax: "Clarear, no máximo",
    softness: "Bordos suaves",
    grainMax: "Grão, no máximo",
    limitado: "Gama de cor limitada",
    limitadoPie: "Para câmaras que entregam o vídeo de 16 a 235 em vez de 0 a 255.",
    restablecer: "Repor",
    restablecido: "Ajuste fino como de fábrica",
    diagnostico: "Diagnóstico",
    diagnosticoOn: "Diagnóstico ativado",
    recorte: "A exposição está a tocar no limite da gama: o valor certo para esta luz " +
             "fica de fora. Move o piso e compara.",
  },

  resultado: {
    cerrarVideo: "Fechar o vídeo",
    cerrarFoto: "Fechar a foto",
    altFoto: "Foto composta",
    guardarCarrete: "Guardar no rolo da câmara",
    guardarFotos: "Guardar nas Fotos",
    descargarArchivo: "Transferir ficheiro",
    conMic: "com microfone",
    sinAudio: "sem áudio",
    codecDudoso: "atenção: este navegador não declarou o códec, confirma que abre fora",
    sinLienzo: "Não consegui capturar a tela.",
    sinMenu: "Não consegui abrir o menu: {error}",
    sinEfecto: "Não consegui carregar «{titulo}».",
    archivoVideo: "raton-perez",
    archivoFoto: "raton-perez.png",
    archivoCarta: "carta-do-raton-perez.png",
    pistaVideoMp4: "Escolhe <b>Guardar vídeo</b> e o clipe entra no rolo da câmara.",
    pistaVideoWebm: "Atenção: este clipe é <b>.webm</b>, e o rolo da câmara do telemóvel " +
                    "não o aceita. Pode partilhar-se ou transferir-se, mas para o " +
                    "guardar na galeria o navegador tem de gravar em mp4.",
    pistaVideoDescarga: "Este navegador não consegue escrever na galeria: o clipe é " +
                        "transferido como ficheiro.",
    pistaFoto: "Escolhe <b>Guardar imagem</b> e a foto entra no rolo da câmara.\n" +
               "No iPhone também serve manter premida a foto de cima → " +
               "<b>Adicionar às Fotos</b>.",
    pistaFotoDescarga: "Este navegador não consegue escrever na galeria: a foto é " +
                       "transferida como ficheiro.",
  },

  carta: {
    pasoDatos: "Os dados",
    pasoCarta: "A carta",
    cerrar: "Fechar a carta",
    titulo: "A carta do Rato",
    entradilla: "Preenche o que souberes e o Rato escreve a carta. A única coisa " +
                "imprescindível é o nome.",
    nombre: "Como se chama?",
    obligatorio: "obrigatório",
    opcional: "opcional",
    nombrePlaceholder: "O nome dele",
    nombreAviso: "Sem nome não há a quem escrever.",
    fecha: "Em que dia é que caiu?",
    fechaAyuda: "Do último ano até hoje.",
    fechaFutura: "Um dente não pode cair amanhã.",
    fechaVieja: "Essa data fica muito para trás.",
    queDiente: "Qual é que o Rato levou?",
    comoEstaba: "Como estava o dente?",
    premio: "O que é que deixou em troca?",
    premioPlaceholder: "Uma moeda",
    premioAyuda: "É contado dentro da carta.",
    nota: "O que quiseres dizer-lhe",
    notaPlaceholder: "Vi-te a fazer os trabalhos de casa sem ninguém te lembrar, e a " +
                     "aprender inglês com muita vontade. Estou muito orgulhoso de ti.",
    notaAyuda: "Vai dentro da carta, com a letra do Rato.",
    quedan: "Faltam {n}.",
    generar: "Escrever a carta",
    hecha: "Já está escrita",
    hechaPie: "Guarda-a no rolo da câmara ou manda-a para a impressora.",
    imprimir: "Imprimir",
    descargar: "Transferir",
    lienzo: "A carta do Ratón Pérez",
    pistaGuardar: "Escolhe <b>Guardar imagem</b> e a carta entra no rolo da câmara, " +
                  "pronta para imprimir.\nPara a imprimir daqui, usa <b>Imprimir</b>.",
    pistaDescargar: "Guarda-a com <b>Transferir</b> ou manda-a para a impressora com " +
                    "<b>Imprimir</b>.",

    membrete: "MUSEU DOS DENTES",
    encabezado: "Carta do Ratón Pérez",
    selloArriba: "MUSEU DOS DENTES",
    selloAbajo: "RATÓN PÉREZ",
    saludo: "Olá, {nombre}:",
    saludoVacio: "Olá…",
    posdata: "P. S. Continua a cuidar desses dentes!",
    despedida: "Com carinho,",
    fechaLarga: "{d} de {mes} de {a}",
    meses: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
            "setembro", "outubro", "novembro", "dezembro"],

    parrafoEntrada: "Ontem à noite entrei no teu quarto em bicos de pés. Estavas a " +
                    "dormir tão bem que não te quis acordar.",
    parrafoDiente: "Debaixo da almofada encontrei {objeto}. {frase} Levei-{pronombre} " +
                   "embrulhad{terminacion} num lenço para o meu museu, onde guardo os " +
                   "dentes mais valentes do mundo. {posesivo} já tem o seu lugar, com o " +
                   "teu nome por baixo.",
    parrafoPremio: "Em troca deixei-te {premio}.",
    parrafoCierre: "Volto quando cair o próximo.",

    dientes: [
      { id: "primero", etiqueta: "O primeiro", objeto: "o teu primeiro dente",
        pronombre: "o", posesivo: "O teu", terminacion: "o" },
      { id: "arriba", etiqueta: "Um de cima", objeto: "um dente de cima",
        pronombre: "o", posesivo: "O teu", terminacion: "o" },
      { id: "abajo", etiqueta: "Um de baixo", objeto: "um dente de baixo",
        pronombre: "o", posesivo: "O teu", terminacion: "o" },
      { id: "muela", etiqueta: "Um molar", objeto: "o teu molar",
        pronombre: "o", posesivo: "O teu", terminacion: "o" },
    ],

    estados: [
      { id: "super", etiqueta: "Superlimpo",
        frase: "Via-se logo que lavas os dentes todos os dias." },
      { id: "limpio", etiqueta: "Limpo", frase: "Nota-se que cuidas deles." },
      { id: "mejorable", etiqueta: "Pode melhorar",
        frase: "A escova gostava de te ver mais vezes." },
    ],
  },
};
