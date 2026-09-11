// La carta del Ratón Pérez.
//
// Se dibuja en un canvas 2D y no en HTML, por una razón: tiene que poder GUARDARSE y
// COMPARTIRSE como imagen, igual que la foto y el vídeo. Maquetarla en DOM obligaría a
// mantener dos implementaciones del mismo diseño -una para ver y otra para exportar- y a
// la segunda copia se le olvida siempre algún cambio. Aquí la vista previa ES el archivo:
// el mismo dibujo, escalado.
//
// El formato es A4 vertical a 150 ppp (1240x1754). Se imprime, que es medio producto:
// "para imprimir o dejar bajo la almohada".
//
// ES UNA CARTA, NO UN DIPLOMA, y eso manda sobre el resto de decisiones:
//
//   - El texto va ALINEADO A LA IZQUIERDA y en párrafos. Un bloque centrado se lee como
//     un título; uno alineado, como algo que alguien te ha escrito.
//   - Las palabras del padre son UN PÁRRAFO MÁS: misma letra, mismo tamaño, mismo color,
//     sin comillas ni cursiva. En cuanto se marcan como "cita" dejan de ser del Ratón y
//     pasan a ser un añadido, que es justo lo contrario de lo que se busca.
//   - Los datos -qué diente, cómo estaba, qué dejó- NO van en casillas: van contados
//     dentro de la carta. Una tabla dentro de una carta es un formulario.
//
// Los campos salen de la convención española real del Ratoncito Pérez -nombre, fecha,
// qué diente, ESTADO del diente y la recompensa-, que es más específica que la del tooth
// fairy anglosajón, donde solo se registran nombre y fecha.

export const SIZE = { w: 1240, h: 1754 };

// Márgenes del texto. La columna es lo que de verdad decide cuánto cabe.
const MARGEN = 156;
const COLUMNA = SIZE.w - MARGEN * 2;

// Paleta del personaje llevada al papel. El rojo del chándal es el color del LACRE, y una
// carta sellada en rojo se lee como documento sin que haya que explicarlo. El magenta de
// las zapatillas queda para los detalles pequeños, que es donde está en el personaje.
const PAPEL = "#FAF5EE";
const TINTA = "#221B1C";
const ORO = "#B22420";        // marcos, sello y la posdata
const ORO_CLARO = "#D98C86";  // el mismo rojo rebajado, para los filetes finos
const MAGENTA = "#C63A6C";    // las zapatillas: el diente y los rombos
const SUAVE = "#8A7F72";      // el gris del pelaje

/**
 * La letra de la carta.
 *
 * Georgia se ha ido: es la letra de un diploma del colegio, y aquí el que escribe es un
 * ratón con gafas y chándal. `ui-rounded` da en Apple la SF Rounded, que es redonda y
 * joven sin ser infantil; donde no exista, la cadena cae en Trebuchet o en la letra del
 * sistema -Roboto en Android, Segoe en Windows-, que son humanistas y siguen sirviendo.
 * Ninguna se descarga: la CSP lo prohíbe y una fuente que no carga cambia el documento
 * en silencio.
 */
const REDONDA = 'ui-rounded, "SF Pro Rounded", "Varela Round", "Trebuchet MS", ' +
                '"Segoe UI", Roboto, system-ui, sans-serif';
/** Solo para los rótulos en versalitas del sello y la cabecera. */
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
               "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-09-11" -> "11 de septiembre de 2026". Sin Date: evita el desfase de zona. */
export function fechaLarga(iso) {
  const [a, m, d] = (iso || "").split("-").map(Number);
  if (!a || !m || !d) return "";
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

// `pronombre` y `posesivo` no son un lujo: "una muela" es femenino y sin ellos la carta
// dice "lo envolví" y "el tuyo" de una muela.
export const DIENTES = [
  { id: "primero", etiqueta: "El primero", objeto: "tu primer diente",
    pronombre: "lo", posesivo: "El tuyo", terminacion: "o" },
  { id: "arriba", etiqueta: "Uno de arriba", objeto: "un diente de arriba",
    pronombre: "lo", posesivo: "El tuyo", terminacion: "o" },
  { id: "abajo", etiqueta: "Uno de abajo", objeto: "un diente de abajo",
    pronombre: "lo", posesivo: "El tuyo", terminacion: "o" },
  { id: "muela", etiqueta: "Una muela", objeto: "tu muela",
    pronombre: "la", posesivo: "La tuya", terminacion: "a" },
];

// Ninguna frase riñe al niño: la que avisa lo hace de parte del cepillo y con gracia.
export const ESTADOS = [
  { id: "super", etiqueta: "Súper limpio",
    frase: "Se notaba a la legua que te lavas los dientes todos los días." },
  { id: "limpio", etiqueta: "Limpio", frase: "Se nota que los cuidas." },
  { id: "mejorable", etiqueta: "Se puede mejorar",
    frase: "Al cepillo le gustaría verte un poco más a menudo." },
];

/**
 * Cuántos caracteres caben en las palabras del padre.
 *
 * MEDIDO contra el dibujo de verdad, no calculado a ojo. El primer número que puse fue
 * 340 "porque quedan seis líneas libres", y estaba mal: en el peor caso -una muela, que
 * lleva la frase más larga, con la frase de estado más larga y un premio de 24
 * caracteres- no quedaba sitio ni para una línea.
 *
 * Midiendo, el techo antes de que la carta se salga es de 562 caracteres en ese peor
 * caso y 618 en uno corriente. 300 deja un margen de la mitad, y a cambio:
 *
 *   - en un caso corriente la carta se escribe a 32 px, casi sin apretar;
 *   - en el peor caso baja a 30 px, que sigue siendo cómodo de leer impreso.
 *
 * El ejemplo que hay que poder escribir -"felicidades, te portaste muy bien en el
 * colegio, te he visto haciendo las tareas..."- son unos 160 caracteres: cabe con el
 * doble de sitio.
 *
 * La comprobación de `web/test/` dibuja una nota de exactamente este largo en el peor
 * caso y falla si el texto alcanza la despedida, así que el número no puede quedarse
 * obsoleto en silencio.
 */
export const LIMITE_NOTA = 300;

/**
 * Tamaños a los que se puede escribir la carta, del holgado al apretado.
 *
 * Una carta escrita a mano se aprieta cuando queda poco papel, y esta hace lo mismo: si
 * el padre escribe mucho, la letra baja un punto en vez de pasar por encima de la firma.
 * El suelo son 28 px, que a 150 ppp son 13 puntos: se sigue leyendo impreso.
 */
const PASOS = [[34, 52, 26], [32, 49, 22], [30, 46, 18], [28, 43, 15]];

/** La caja del cuerpo: desde debajo del saludo hasta la base más baja de la posdata.
 *  Por debajo de TOPE está el personaje, pegado al margen, y el texto no puede alcanzarlo. */
const INICIO = 468;
const TOPE = 1330;

/** Lo que la carta cuenta siempre, antes de las palabras del padre. */
function parrafosDeLaCarta(datos) {
  const d = DIENTES.find((x) => x.id === datos.diente) ?? DIENTES[0];
  const e = ESTADOS.find((x) => x.id === datos.estado) ?? ESTADOS[0];
  const premio = (datos.premio || "").trim();
  const nota = (datos.nota || "").trim();

  const ps = [
    "Anoche entré en tu cuarto de puntillas. Estabas durmiendo tan a gusto que no quise " +
    "despertarte.",
    `Debajo de la almohada encontré ${d.objeto}. ${e.frase} Me ${d.pronombre} llevé ` +
    `envuelt${d.terminacion} en un pañuelo a mi museo, donde guardo los dientes más ` +
    `valientes del mundo. ${d.posesivo} ya tiene su sitio, con tu nombre debajo.`,
  ];
  if (premio) ps.push(`A cambio te dejé ${premio} en su lugar.`);
  // Las palabras del padre entran aquí, en medio de la carta y sin marca ninguna: es el
  // Ratón quien las dice.
  if (nota) ps.push(nota);
  ps.push("Volveré cuando se caiga el siguiente.");
  return ps;
}

// ---------------------------------------------------------------------------
// Utilidades de dibujo
// ---------------------------------------------------------------------------

/** Texto con espaciado entre letras. ctx.letterSpacing no está en todos los Safari. */
function espaciado(ctx, texto, x, y, sep) {
  const chars = [...texto];
  const ancho = chars.reduce((t, c) => t + ctx.measureText(c).width + sep, -sep);
  let cx = x - ancho / 2;
  for (const c of chars) {
    ctx.fillText(c, cx + ctx.measureText(c).width / 2, y);
    cx += ctx.measureText(c).width + sep;
  }
  return ancho;
}

/** Parte el texto en las líneas que caben en maxW. No dibuja: solo mide. */
function envolver(ctx, texto, maxW) {
  const lineas = [];
  let linea = "";
  for (const palabra of texto.split(/\s+/)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > maxW && linea) {
      lineas.push(linea);
      linea = palabra;
    } else {
      linea = prueba;
    }
  }
  if (linea) lineas.push(linea);
  return lineas;
}

/** Dibuja las líneas ya partidas desde la base de la primera. Devuelve el alto ocupado. */
function pintarLineas(ctx, lineas, x, y, alto) {
  lineas.forEach((l, i) => ctx.fillText(l, x, y + i * alto));
  return lineas.length * alto;
}

/** Encoge la fuente hasta que el texto quepa. Un nombre largo no puede desbordar. */
function ajustar(ctx, texto, maxW, tamMax, tamMin, fuente) {
  let t = tamMax;
  do {
    ctx.font = fuente(t);
    if (ctx.measureText(texto).width <= maxW) break;
    t -= 2;
  } while (t > tamMin);
  return t;
}

function marcoRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Rombo de los adornos: repetido en las esquinas y en los filetes. */
function rombo(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

/** Filete con un rombo en medio: separa secciones sin meter una caja. */
function filete(ctx, cx, y, ancho) {
  ctx.strokeStyle = ORO_CLARO;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - ancho / 2, y);
  ctx.lineTo(cx - 16, y);
  ctx.moveTo(cx + 16, y);
  ctx.lineTo(cx + ancho / 2, y);
  ctx.stroke();
  rombo(ctx, cx, y, 5, MAGENTA);
}

/** Un diente de leche, dibujado a mano: dos lóbulos arriba y dos raíces abajo. */
function diente(ctx, cx, cy, escala, relleno, borde) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(escala, escala);
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.bezierCurveTo(20, -22, 26, -6, 24, 6);
  ctx.bezierCurveTo(22, 18, 18, 30, 11, 30);
  ctx.bezierCurveTo(5, 30, 6, 14, 0, 14);
  ctx.bezierCurveTo(-6, 14, -5, 30, -11, 30);
  ctx.bezierCurveTo(-18, 30, -22, 18, -24, 6);
  ctx.bezierCurveTo(-26, -6, -20, -22, 0, -18);
  ctx.closePath();
  ctx.fillStyle = relleno;
  ctx.fill();
  if (borde) {
    ctx.strokeStyle = borde;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Texto curvado sobre una circunferencia, centrado en `centro`.
 *
 * El arco se deriva del ANCHO MEDIDO del texto, no de ángulos escogidos a ojo: con
 * ángulos fijos, "MUSEO DE LOS DIENTES" y "RATÓN PÉREZ" -que no miden lo mismo- se
 * apelotonan o se separan, y el sello se lee como una mancha.
 */
function textoEnArco(ctx, texto, cx, cy, radio, centro, haciaDentro, sep = 2) {
  const chars = [...texto];
  const anchos = chars.map((c) => ctx.measureText(c).width + sep);
  const total = anchos.reduce((a, b) => a + b, 0);
  const signo = haciaDentro ? -1 : 1;
  let ang = centro - (signo * total) / (2 * radio);
  for (let i = 0; i < chars.length; i++) {
    const paso = anchos[i] / radio;
    const a = ang + (signo * paso) / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radio, cy + Math.sin(a) * radio);
    ctx.rotate(a + (haciaDentro ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    ang += signo * paso;
  }
}

/** Sello circular: el remate que convierte una hoja bonita en un documento. */
function sello(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.08);            // ligeramente torcido, como un sello de tampón
  ctx.translate(-cx, -cy);
  ctx.globalAlpha = 0.9;

  ctx.strokeStyle = ORO;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 10, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = ORO;
  ctx.font = `600 12px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Arriba mirando hacia afuera; abajo mirando hacia dentro, como en un sello real.
  textoEnArco(ctx, "MUSEO DE LOS DIENTES", cx, cy, r - 20, -Math.PI / 2, false, 1.8);
  textoEnArco(ctx, "RATÓN PÉREZ", cx, cy, r - 20, Math.PI / 2, true, 2.5);

  diente(ctx, cx, cy, 1.05, "transparent", MAGENTA);
  ctx.restore();
  ctx.textBaseline = "alphabetic";
}


// ---------------------------------------------------------------------------
// La firma, trazada a mano
// ---------------------------------------------------------------------------

/**
 * "Raton Perez" en cursiva inglesa, dibujada con curvas y no escrita con una fuente.
 *
 * No hay alternativa: no existe NINGUNA cursiva garantizada en los tres sitios donde
 * esto se ve. Apple trae Snell Roundhand, Windows trae Segoe Script, Android no trae
 * ninguna, y la CSP prohibe cargar una. Escribir la firma con `font` significa que cada
 * telefono firma distinto y que en la mitad se cae a la Arial de respaldo, que es
 * exactamente lo contrario de una firma.
 *
 * Trazada, sale igual en todas partes, escala sin pixelarse y se imprime bien.
 *
 * El grosor se finge repartiendo los trazos: los DESCENDENTES van gruesos y los de
 * union finos, que es de donde sale el contraste de la caligrafia de pluma. La
 * inclinacion es una cizalla sobre todo el conjunto, no punto a punto.
 *
 * Sistema de coordenadas: linea base en y=0, altura de x en -40, mayusculas en -110,
 * y crece hacia abajo como en el canvas.
 */

const GRUESO = 11.5;    // descendentes: donde la pluma apoya
const MEDIO = 6;       // cuerpo de las minusculas
const FINO = 3.0;      // uniones y adornos: donde la pluma levanta

/** [x0,y0, c1x,c1y,c2x,c2y,x1,y1, ...] — el primer par es un moveTo y luego curvas. */
function trazo(ctx, ancho, pts) {
  ctx.lineWidth = ancho;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i + 5 < pts.length; i += 6) {
    ctx.bezierCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]);
  }
  ctx.stroke();
}

/** Una R mayuscula de caligrafia: bucle de entrada arriba, panza, y pierna con vuelo. */
function letraR(ctx, x) {
  // El asta, que es el trazo grueso, con el bucle de entrada arriba a la izquierda.
  trazo(ctx, FINO, [x + 10, -46, x - 6, -74, x + 6, -112, x + 34, -108]);
  trazo(ctx, GRUESO, [x + 34, -108, x + 40, -70, x + 30, -34, x + 26, 0]);
  // La panza.
  trazo(ctx, MEDIO, [x + 34, -106, x + 78, -114, x + 92, -88, x + 74, -70,
                     x + 62, -58, x + 42, -58, x + 30, -58]);
  // La pierna: sale de la panza y vuela hacia la derecha con un remate hacia arriba.
  trazo(ctx, MEDIO, [x + 48, -60, x + 66, -44, x + 72, -22, x + 92, -6,
                     x + 104, 2, x + 114, -8, x + 120, -22]);
}

/** Una P mayuscula antigua: la panza lleva un bucle dentro y el asta baja y da la vuelta. */
function letraP(ctx, x) {
  // Asta: baja por debajo de la linea base y cierra con el bucle de vuelta.
  trazo(ctx, FINO, [x + 4, -48, x - 8, -80, x + 8, -114, x + 34, -106]);
  trazo(ctx, GRUESO, [x + 34, -106, x + 38, -66, x + 30, -26, x + 22, 26]);
  trazo(ctx, FINO, [x + 22, 26, x + 16, 54, x - 8, 56, x - 10, 36,
                    x - 12, 20, x + 10, 14, x + 30, 10]);
  // Panza.
  trazo(ctx, MEDIO, [x + 34, -104, x + 84, -112, x + 100, -86, x + 82, -68,
                     x + 68, -54, x + 44, -54, x + 28, -54]);
  // El bucle de dentro de la panza: la vuelta que distingue a la P antigua.
  trazo(ctx, FINO, [x + 52, -96, x + 76, -96, x + 78, -74, x + 58, -72,
                    x + 46, -71, x + 46, -84, x + 56, -88]);
}

/** Minusculas cursivas. Cada una entra por la izquierda y sale por la derecha. */
const MINUSCULAS = {
  a: (ctx, x) => {
    trazo(ctx, MEDIO, [x + 40, -34, x + 34, -46, x + 6, -46, x + 2, -26,
                       x - 2, -8, x + 20, -2, x + 38, -12]);
    trazo(ctx, GRUESO, [x + 40, -42, x + 40, -28, x + 36, -14, x + 40, -2]);
    trazo(ctx, FINO, [x + 40, -2, x + 46, 2, x + 52, -4, x + 58, -14]);
  },
  t: (ctx, x) => {
    trazo(ctx, GRUESO, [x + 22, -68, x + 20, -44, x + 12, -20, x + 18, -4]);
    trazo(ctx, FINO, [x + 18, -4, x + 26, 4, x + 36, -6, x + 44, -16]);
    trazo(ctx, FINO, [x - 4, -42, x + 10, -46, x + 22, -46, x + 32, -48]);
  },
  o: (ctx, x) => {
    trazo(ctx, MEDIO, [x + 38, -34, x + 32, -46, x + 4, -46, x + 2, -26,
                       x, -8, x + 26, -2, x + 38, -16]);
    trazo(ctx, FINO, [x + 38, -16, x + 44, -24, x + 44, -34, x + 38, -34]);
    trazo(ctx, FINO, [x + 40, -30, x + 50, -26, x + 56, -16]);
  },
  n: (ctx, x) => {
    trazo(ctx, MEDIO, [x, -8, x + 2, -30, x + 8, -44, x + 16, -44]);
    trazo(ctx, MEDIO, [x + 16, -44, x + 28, -44, x + 30, -28, x + 32, -4]);
    trazo(ctx, FINO, [x + 32, -4, x + 40, 2, x + 50, -6, x + 58, -16]);
  },
  e: (ctx, x) => {
    trazo(ctx, MEDIO, [x, -18, x + 20, -22, x + 34, -28, x + 28, -40,
                       x + 22, -50, x + 2, -44, x + 2, -22,
                       x + 2, -6, x + 24, -2, x + 40, -14]);
  },
  r: (ctx, x) => {
    trazo(ctx, MEDIO, [x, -10, x + 6, -30, x + 10, -44, x + 22, -42]);
    trazo(ctx, FINO, [x + 22, -42, x + 32, -40, x + 24, -30, x + 20, -26]);
    trazo(ctx, MEDIO, [x + 20, -26, x + 22, -14, x + 22, -8, x + 26, -4]);
    trazo(ctx, FINO, [x + 26, -4, x + 34, 2, x + 42, -6, x + 48, -14]);
  },
  z: (ctx, x) => {
    trazo(ctx, MEDIO, [x, -36, x + 10, -48, x + 30, -46, x + 34, -38,
                       x + 38, -30, x + 16, -14, x + 10, -6]);
    trazo(ctx, GRUESO, [x + 10, -6, x + 22, -2, x + 30, 14, x + 22, 34]);
    trazo(ctx, FINO, [x + 22, 34, x + 14, 48, x - 6, 44, x - 2, 28]);
  },
};

/** La tilde de "Ratón": dos ondas. Plana se lee como un macron. */
function tilde(ctx, x, y, ancho) {
  trazo(ctx, FINO, [x, y + 3,
                    x + ancho * 0.25, y - 9, x + ancho * 0.45, y - 1, x + ancho * 0.58, y - 5,
                    x + ancho * 0.74, y - 10, x + ancho * 0.9, y - 3, x + ancho, y - 10]);
}

/** El acento de "Pérez": un solo trazo inclinado, que es lo que es. */
function agudo(ctx, x, y, largo) {
  trazo(ctx, FINO, [x, y, x + largo * 0.4, y - largo * 0.4,
                    x + largo * 0.6, y - largo * 0.6, x + largo, y - largo]);
}

/**
 * Dibuja la firma con la linea base en (x, y).
 *
 * @returns {{ancho:number, alto:number}} lo que ha ocupado, ya escalado
 */
export function firmaRatonPerez(ctx, x, y, escala, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(escala, escala);
  ctx.transform(1, 0, -0.22, 1, 0, 0);   // la inclinacion, de una vez y no punto a punto
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  letraR(ctx, 0);
  MINUSCULAS.a(ctx, 126);
  MINUSCULAS.t(ctx, 182);
  MINUSCULAS.o(ctx, 222);
  MINUSCULAS.n(ctx, 274);
  tilde(ctx, 224, -62, 34);

  letraP(ctx, 352);
  MINUSCULAS.e(ctx, 452);
  MINUSCULAS.r(ctx, 490);
  MINUSCULAS.e(ctx, 538);
  MINUSCULAS.z(ctx, 578);
  agudo(ctx, 466, -56, 20);

  // La rubrica: el vuelo que pasa por debajo de todo y vuelve. Es lo que hace que una
  // firma parezca escrita de un tiron y no dibujada letra a letra.
  trazo(ctx, FINO, [-6, 10, 110, 36, 400, 38, 600, 14,
                    656, 7, 628, -14, 576, -6]);

  ctx.restore();
  return { ancho: 660 * escala, alto: 170 * escala };
}

// ---------------------------------------------------------------------------
// La carta
// ---------------------------------------------------------------------------

/**
 * Dibuja la carta a tamaño completo en `canvas`.
 *
 * @param {HTMLCanvasElement} canvas  se redimensiona a SIZE
 * @param {object} datos  { nombre, fecha (ISO), diente, estado, premio, nota }
 * @param {HTMLImageElement} [raton]  el PNG del personaje, si ya cargó
 */
export function drawCertificate(canvas, datos, raton) {
  canvas.width = SIZE.w;
  canvas.height = SIZE.h;
  const ctx = canvas.getContext("2d");
  const { w, h } = SIZE;
  const cx = w / 2;

  // --- Papel ---------------------------------------------------------------
  ctx.fillStyle = PAPEL;
  ctx.fillRect(0, 0, w, h);

  // Grano del papel. Determinista a propósito: la misma carta dos veces tiene que salir
  // idéntica, y un Math.random() la haría cambiar en cada dibujado.
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = "#8A7A5F";
  let semilla = 7;
  for (let i = 0; i < 5200; i++) {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    const x = (semilla / 2147483648) * w;
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    const y = (semilla / 2147483648) * h;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();

  // Calidez en las esquinas, como papel viejo
  const halo = ctx.createRadialGradient(cx, h * 0.42, h * 0.2, cx, h * 0.5, h * 0.75);
  halo.addColorStop(0, "rgba(255,255,255,0)");
  halo.addColorStop(1, "rgba(160,130,70,0.16)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  // --- Marcos --------------------------------------------------------------
  ctx.strokeStyle = ORO;
  ctx.lineWidth = 6;
  marcoRedondeado(ctx, 56, 56, w - 112, h - 112, 26);
  ctx.stroke();

  ctx.strokeStyle = ORO_CLARO;
  ctx.lineWidth = 2;
  marcoRedondeado(ctx, 76, 76, w - 152, h - 152, 18);
  ctx.stroke();

  for (const [x, y] of [[76, 76], [w - 76, 76], [76, h - 76], [w - 76, h - 76]]) {
    rombo(ctx, x, y, 9, ORO);
  }

  ctx.textBaseline = "alphabetic";

  // --- Membrete ------------------------------------------------------------
  ctx.textAlign = "center";
  ctx.fillStyle = SUAVE;
  ctx.font = `600 22px ${SANS}`;
  espaciado(ctx, "MUSEO DE LOS DIENTES", cx, 150, 7);

  ctx.fillStyle = TINTA;
  ctx.font = `700 62px ${REDONDA}`;
  ctx.fillText("Carta del Ratón Pérez", cx, 228);

  filete(ctx, cx, 266, 420);

  // La fecha a la derecha, como en cualquier carta. Por eso no vuelve a aparecer en el
  // cuerpo: decirla dos veces delata una plantilla.
  ctx.textAlign = "right";
  ctx.fillStyle = SUAVE;
  ctx.font = `400 26px ${REDONDA}`;
  ctx.fillText(fechaLarga(datos.fecha), w - MARGEN, 322);

  // --- Saludo --------------------------------------------------------------
  // "Hola, X:" y no "Querida X": la carta no marca género en ningún sitio, y aquí es
  // donde más cantaría. La misma razón por la que dice "estabas durmiendo".
  ctx.textAlign = "left";
  const nombre = (datos.nombre || "").trim();
  if (nombre) {
    const tam = ajustar(ctx, `Hola, ${nombre}:`, COLUMNA, 54, 32,
                        (t) => `700 ${t}px ${REDONDA}`);
    ctx.fillStyle = TINTA;
    ctx.font = `700 ${tam}px ${REDONDA}`;
    ctx.fillText(`Hola, ${nombre}:`, MARGEN, 402);
  } else {
    ctx.fillStyle = "rgba(138, 122, 95, 0.55)";
    ctx.font = `700 54px ${REDONDA}`;
    ctx.fillText("Hola…", MARGEN, 402);
  }

  // --- El cuerpo de la carta ----------------------------------------------
  // Se mide TODO antes de dibujar nada: si las palabras del padre se pasan de largo, la
  // carta se aprieta un punto en vez de escribir por encima de la firma. Un documento que
  // se estropea al escribir de más es un documento que no se puede usar.
  let tam = 34, alto = 52, hueco = 26;
  let bloques;
  for (const [t, a, g] of PASOS) {
    tam = t; alto = a; hueco = g;
    ctx.font = `400 ${tam}px ${REDONDA}`;
    bloques = parrafosDeLaCarta(datos).map((p) => envolver(ctx, p, COLUMNA));
    const total = bloques.reduce((s2, l) => s2 + l.length * alto + hueco, -hueco);
    if (INICIO + total + 14 <= TOPE) break;
  }

  ctx.fillStyle = TINTA;
  ctx.font = `400 ${tam}px ${REDONDA}`;
  // El hueco va ENTRE párrafos y no detrás del último: sumándolo siempre, el sitio que
  // el bucle de arriba creía tener y el que de verdad se gasta se separaban en un hueco
  // entero, y la carta se pasaba de largo creyendo que cabía.
  let y = INICIO;
  bloques.forEach((lineas, i) => {
    y += pintarLineas(ctx, lineas, MARGEN, y, alto) + (i < bloques.length - 1 ? hueco : 0);
  });

  // La posdata es de la carta, no un pie de página: por eso va aquí y en el mismo sitio
  // donde acaba el texto, no clavada abajo del todo.
  ctx.fillStyle = ORO;
  ctx.font = `600 30px ${REDONDA}`;
  // Si ni al tamaño más apretado cabe, la posdata se queda en TOPE y se monta sobre la
  // última línea. Es feo, pero es el último recurso: el formulario limita la nota a
  // LIMITE_NOTA justo para que esto no llegue a pasar, y la prueba lo vigila.
  const yDeseado = y + 14;
  const yPosdata = Math.min(yDeseado, TOPE);
  ctx.fillText("P. D. ¡Sigue cuidando esos dientes!", MARGEN, yPosdata);

  // --- Despedida, firma, sello y personaje ---------------------------------
  // Cada pieza con su sitio: el personaje pegado al margen izquierdo, el sello entre
  // medias y la firma a la derecha. Colocar a ojo es como el sello acababa encima del
  // ratón.
  const yCierre = Math.max(yPosdata + 88, 1306);
  ctx.fillStyle = TINTA;
  ctx.font = `400 32px ${REDONDA}`;
  ctx.fillText("Con cariño,", 640, yCierre);

  firmaRatonPerez(ctx, 632, yCierre + 126, 0.62, TINTA);

  sello(ctx, 408, yCierre + 104, 86);

  if (raton?.naturalWidth) {
    const altoR = 250;
    const anchoR = altoR * (raton.naturalWidth / raton.naturalHeight);
    ctx.save();
    ctx.globalAlpha = 0.97;
    ctx.drawImage(raton, 122, h - 96 - altoR, anchoR, altoR);
    ctx.restore();
  }

  // Para la comprobación: qué tamaño hizo falta y si el cuerpo cupo. Sale del dibujo
  // real, así que no puede discrepar de él.
  canvas.__caja = { tam, alto, fin: yDeseado, cabe: yDeseado <= TOPE };
  return canvas;
}
