// Certificado del Ratón Pérez.
//
// Se dibuja en un canvas 2D y no en HTML, por una razón: el certificado tiene que poder
// GUARDARSE y COMPARTIRSE como imagen, igual que la foto y el video. Maquetarlo en DOM
// obligaría a mantener dos implementaciones del mismo diseño -una para ver y otra para
// exportar- y a la segunda copia se le olvida siempre algún cambio. Aquí la vista previa
// ES el archivo: el mismo dibujo, escalado.
//
// El formato es A4 vertical a 150 ppp (1240x1754). Se imprime, que es medio producto:
// "para imprimir o dejar bajo la almohada".
//
// Los campos salen de la convención española real del Ratoncito Pérez -nombre, fecha,
// qué diente, ESTADO del diente y la recompensa- que es más específica que la del tooth
// fairy anglosajón, donde solo se registran nombre y fecha. El estado del diente es el
// guiño de higiene dental, y la recompensa es lo que el niño va a preguntar.

export const SIZE = { w: 1240, h: 1754 };

// Paleta del personaje llevada al papel. El oro se va: el rojo del chándal funciona mejor
// aquí porque es el color del LACRE, y un certificado sellado en rojo se lee como
// documento sin que haya que explicarlo. El magenta de las zapatillas queda para los
// detalles pequeños, que es donde está en el personaje.
const PAPEL = "#FAF5EE";
const TINTA = "#221B1C";
const ORO = "#B22420";        // el rojo del chándal: marcos, sello y firma
const ORO_CLARO = "#D98C86";  // el mismo rojo rebajado, para los filetes finos
const MAGENTA = "#C63A6C";    // las zapatillas: el diente y los rombos
const SUAVE = "#8A7F72";      // el gris del pelaje

const SERIF = 'Georgia, "Times New Roman", "Iowan Old Style", serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
               "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-09-11" -> "11 de septiembre de 2026". Sin Date: evita el desfase de zona. */
export function fechaLarga(iso) {
  const [a, m, d] = (iso || "").split("-").map(Number);
  if (!a || !m || !d) return "";
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export const DIENTES = [
  { id: "primero", etiqueta: "El primero", frase: "perdió su primer diente" },
  { id: "arriba", etiqueta: "Uno de arriba", frase: "perdió un diente de arriba" },
  { id: "abajo", etiqueta: "Uno de abajo", frase: "perdió un diente de abajo" },
  { id: "muela", etiqueta: "Una muela", frase: "perdió una muela" },
];

export const ESTADOS = [
  { id: "super", etiqueta: "Súper limpio" },
  { id: "limpio", etiqueta: "Limpio" },
  { id: "mejorable", etiqueta: "Se puede mejorar" },
];

/**
 * El mensaje va en PRIMERA PERSONA y sin marcas de género: "dormido/a" en un documento
 * que el niño va a guardar años se lee como un formulario, y la mitad de las veces está
 * mal. "Estabas durmiendo" vale para todos y no cuesta nada.
 */
const MENSAJE =
  "Entré en tu cuarto sin hacer ruido. Estabas durmiendo, así que no te desperté. " +
  "Encontré tu diente debajo de la almohada, lo envolví con cuidado y me lo llevé a mi " +
  "museo, donde guardo los dientes de todos los niños valientes. El tuyo ya tiene su " +
  "sitio, con tu nombre debajo. Volveré cuando se caiga el siguiente.";

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

/** Parte el texto en líneas que caben en maxW. Devuelve el alto ocupado. */
function parrafo(ctx, texto, x, y, maxW, alto) {
  const lineas = [];
  let linea = "";
  for (const palabra of texto.split(" ")) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > maxW && linea) {
      lineas.push(linea);
      linea = palabra;
    } else {
      linea = prueba;
    }
  }
  if (linea) lineas.push(linea);
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
  ctx.font = `600 16px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Arriba mirando hacia afuera; abajo mirando hacia dentro, como en un sello real.
  textoEnArco(ctx, "MUSEO DE LOS DIENTES", cx, cy, r - 24, -Math.PI / 2, false, 2.5);
  textoEnArco(ctx, "RATÓN PÉREZ", cx, cy, r - 24, Math.PI / 2, true, 3);

  diente(ctx, cx, cy, 1.05, "transparent", MAGENTA);
  ctx.restore();
  ctx.textBaseline = "alphabetic";
}

// ---------------------------------------------------------------------------
// El certificado
// ---------------------------------------------------------------------------

/**
 * Dibuja el certificado a tamaño completo en `canvas`.
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

  // Grano del papel. Determinista a propósito: el mismo certificado dos veces tiene que
  // salir idéntico, y un Math.random() lo haría cambiar en cada pulsación de tecla.
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

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // --- Cabecera ------------------------------------------------------------
  ctx.fillStyle = SUAVE;
  ctx.font = `600 24px ${SANS}`;
  espaciado(ctx, "MUSEO DE LOS DIENTES", cx, 168, 7);

  ctx.fillStyle = TINTA;
  ctx.font = `italic 700 88px ${SERIF}`;
  ctx.fillText("Certificado oficial", cx, 268);

  filete(ctx, cx, 306, 360);

  // --- Nombre --------------------------------------------------------------
  ctx.fillStyle = SUAVE;
  ctx.font = `400 34px ${SERIF}`;
  ctx.fillText("Se certifica que", cx, 382);

  // Sin nombre se escribe el hueco, no una fila de puntos: en Georgia, una hilera de
  // puntos suspensivos a 116px se ve como bolas negras y parece un error de dibujo.
  const nombre = (datos.nombre || "").trim();
  let anchoNombre = 560;
  if (nombre) {
    const tam = ajustar(ctx, nombre, w - 300, 116, 44, (t) => `italic 700 ${t}px ${SERIF}`);
    ctx.fillStyle = TINTA;
    ctx.font = `italic 700 ${tam}px ${SERIF}`;
    ctx.fillText(nombre, cx, 492);
    anchoNombre = Math.min(ctx.measureText(nombre).width + 60, w - 260);
  } else {
    ctx.fillStyle = "rgba(138, 122, 95, 0.55)";
    ctx.font = `italic 400 54px ${SERIF}`;
    ctx.fillText("Su nombre", cx, 486);
  }
  ctx.strokeStyle = ORO_CLARO;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - anchoNombre / 2, 520);
  ctx.lineTo(cx + anchoNombre / 2, 520);
  ctx.stroke();

  const dienteSel = DIENTES.find((d) => d.id === datos.diente) ?? DIENTES[0];
  ctx.fillStyle = SUAVE;
  ctx.font = `400 34px ${SERIF}`;
  ctx.fillText(`${dienteSel.frase} el ${fechaLarga(datos.fecha)}`, cx, 578);

  // --- Datos: estado y recompensa -----------------------------------------
  const estado = ESTADOS.find((e) => e.id === datos.estado) ?? ESTADOS[0];
  const premio = (datos.premio || "").trim();
  const celdas = premio
    ? [["ESTADO DEL DIENTE", estado.etiqueta], ["A CAMBIO LE DEJÉ", premio]]
    : [["ESTADO DEL DIENTE", estado.etiqueta]];

  const anchoCelda = 380;
  const total = celdas.length * anchoCelda + (celdas.length - 1) * 40;
  let bx = cx - total / 2;
  for (const [rotulo, valor] of celdas) {
    const c = bx + anchoCelda / 2;
    ctx.fillStyle = SUAVE;
    ctx.font = `600 19px ${SANS}`;
    espaciado(ctx, rotulo, c, 654, 4);

    ctx.fillStyle = TINTA;
    const tv = ajustar(ctx, valor, anchoCelda - 30, 38, 22, (t) => `italic 600 ${t}px ${SERIF}`);
    ctx.font = `italic 600 ${tv}px ${SERIF}`;
    ctx.fillText(valor, c, 706);

    ctx.strokeStyle = ORO_CLARO;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c - anchoCelda / 2 + 30, 728);
    ctx.lineTo(c + anchoCelda / 2 - 30, 728);
    ctx.stroke();
    bx += anchoCelda + 40;
  }

  filete(ctx, cx, 790, 520);

  // --- El mensaje, que es lo que de verdad se lee --------------------------
  ctx.fillStyle = TINTA;
  ctx.font = `400 36px ${SERIF}`;
  const finMensaje = 870 + parrafo(ctx, MENSAJE, cx, 870, w - 360, 56);

  let y = finMensaje + 30;
  const nota = (datos.nota || "").trim();
  if (nota) {
    ctx.fillStyle = ORO;
    ctx.font = `italic 400 34px ${SERIF}`;
    y += parrafo(ctx, `«${nota}»`, cx, y, w - 400, 50) + 20;
  }

  // --- Firma, sello y personaje -------------------------------------------
  // Las tres piezas se reparten el tercio inferior con sitio propio: el sello a la
  // izquierda del centro, la firma a la derecha y el personaje pegado al margen. Antes
  // el sello caía encima del ratón, que es el fallo clásico de colocar a ojo.
  const yFirma = Math.max(y + 60, 1352);

  ctx.fillStyle = TINTA;
  ctx.font = `italic 700 60px ${SERIF}`;
  ctx.fillText("Ratón Pérez", cx + 250, yFirma);

  ctx.strokeStyle = ORO_CLARO;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 70, yFirma + 24);
  ctx.lineTo(cx + 430, yFirma + 24);
  ctx.stroke();

  ctx.fillStyle = SUAVE;
  ctx.font = `600 18px ${SANS}`;
  espaciado(ctx, "FIRMADO Y SELLADO", cx + 250, yFirma + 58, 4);

  sello(ctx, cx - 130, yFirma - 26, 94);

  if (raton?.naturalWidth) {
    // Abajo del todo y pegado al margen: por encima chocaba con la dedicatoria.
    // El personaje es de cuerpo entero y estrecho (relación ~0,48 frente al 0,86 del
    // anterior), así que a la misma altura ocupa la mitad de ancho y admite más.
    const altoR = 330;
    const anchoR = altoR * (raton.naturalWidth / raton.naturalHeight);
    ctx.save();
    ctx.globalAlpha = 0.97;
    ctx.drawImage(raton, 118, h - 205 - altoR, anchoR, altoR);
    ctx.restore();
  }

  // --- Pie -----------------------------------------------------------------
  diente(ctx, cx, h - 222, 1.15, "#FFFFFF", MAGENTA);
  ctx.fillStyle = ORO;
  ctx.font = `italic 700 40px ${SERIF}`;
  ctx.fillText("¡Sigue cuidando tus dientes!", cx, h - 148);

  return canvas;
}
