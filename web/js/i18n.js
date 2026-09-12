// Los idiomas de la app, y la maquinaria para cambiarlos en caliente.
//
// TRES DECISIONES QUE EXPLICAN EL RESTO:
//
// 1. Los tres catálogos se importan ESTÁTICAMENTE, no se piden al vuelo. Un `import()`
//    dinámico ahorraría unos kilobytes, pero a cambio la página pintaría los textos del
//    idioma anterior -o ninguno- hasta que llegara el archivo. El mismo destello blanco
//    que el tema se cuida de evitar en el <head>, pero con las palabras. Tres catálogos de
//    este tamaño pesan menos que el icono de una animación.
//
// 2. Los textos NO viven en el HTML ni en los módulos: viven en `idiomas/`. El HTML marca
//    QUÉ hay que traducir (`data-t`), no qué dice. Así añadir un idioma es añadir un
//    archivo y una línea aquí, sin tocar ni una pantalla.
//
// 3. La traducción se aplica SOBRE EL DOCUMENTO YA MONTADO y se puede repetir. Cambiar de
//    idioma no recarga la página ni reconstruye la interfaz: se vuelve a recorrer el DOM.
//    Por eso los textos que se ponen desde el código también dejan su clave en el
//    elemento (`n.dataset.t = "..."`) en vez de escribir la frase a pelo: al repasar el
//    documento, se traducen solos.

import es from "./idiomas/es.js";
import en from "./idiomas/en.js";
import pt from "./idiomas/pt.js";

/** El orden manda en el selector. El castellano primero: es el idioma de origen. */
export const CATALOGOS = [es, en, pt];

export const IDIOMAS = CATALOGOS.map((c) => ({ id: c.id, nombre: c.nombre }));

const POR_ID = Object.fromEntries(CATALOGOS.map((c) => [c.id, c]));
const ORIGINAL = es;
const CLAVE_GUARDADO = "idioma";

let actual = ORIGINAL;

/**
 * Los atributos que se pueden traducir, y con qué marca.
 *
 * `data-t-label` pone `aria-label` Y `title` con el mismo texto porque es lo que hacen
 * casi todos los botones de icono de la app: uno para quien no ve el icono y otro para
 * quien se queda encima con el ratón. Los dos que dicen cosas distintas -volver al paso
 * anterior contra "Atrás"- usan `data-t-aria` y `data-t-title` por separado.
 */
const ATRIBUTOS = [
  ["data-t-label", ["aria-label", "title"]],
  ["data-t-aria", ["aria-label"]],
  ["data-t-title", ["title"]],
  ["data-t-placeholder", ["placeholder"]],
  ["data-t-alt", ["alt"]],
];

/** Busca una clave con puntos ("carta.saludo") en un catálogo. */
function buscar(catalogo, clave) {
  return clave.split(".").reduce((n, parte) => (n == null ? undefined : n[parte]), catalogo);
}

/**
 * El texto de una clave, con los huecos rellenos.
 *
 * Si la clave falta en el idioma elegido se cae al castellano, que es el original: una
 * frase en otro idioma es molesta, pero se lee. Lo que no puede salir a pantalla es
 * "carta.saludo", que no significa nada para nadie. El aviso va por consola para que
 * quien desarrolla lo vea; la prueba, además, compara los tres catálogos y falla antes de
 * que esto llegue a pasar en producción.
 */
export function t(clave, vars) {
  let valor = buscar(actual, clave);
  if (valor === undefined) {
    valor = buscar(ORIGINAL, clave);
    console.warn(`i18n: falta "${clave}" en ${actual.id}`);
  }
  if (valor === undefined) {
    console.warn(`i18n: la clave "${clave}" no existe`);
    return clave;
  }
  if (typeof valor !== "string" || !vars) return valor;
  return valor.replace(/\{(\w+)\}/g, (hueco, nombre) =>
    (vars[nombre] === undefined ? hueco : String(vars[nombre])));
}

export const idioma = () => actual.id;

/** Lo que el usuario eligió alguna vez, si sigue existiendo. */
function guardado() {
  try {
    const id = localStorage.getItem(CLAVE_GUARDADO);
    return POR_ID[id] ? id : null;
  } catch (e) { return null; }
}

/**
 * El idioma del teléfono, si lo hablamos.
 *
 * Se mira `navigator.languages` entero y por PREFIJO: el navegador dice "en-GB" o
 * "pt-BR", y quedarse solo con las coincidencias exactas dejaría a casi todo el mundo en
 * castellano. Si no hay ninguno, manda el original, que es el idioma de origen de la app
 * y el único en el que está garantizado que no falta nada.
 */
function delTelefono() {
  const preferidos = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || ""];
  for (const etiqueta of preferidos) {
    const base = String(etiqueta).toLowerCase().split("-")[0];
    if (POR_ID[base]) return base;
  }
  return ORIGINAL.id;
}

/** Lo que toca al abrir: lo elegido antes y, si no hay nada, lo que diga el teléfono. */
export const idiomaInicial = () => guardado() ?? delTelefono();

/**
 * Fija el idioma y deja el documento entero en él.
 *
 * El `<html lang>` se pone DE VERDAD, y eso es el cambio de fondo respecto a cuando el
 * selector no traducía: entonces mentir habría sido peor que no ofrecer el idioma, porque
 * el lector de pantalla habría leído castellano con fonética inglesa. Ahora los textos
 * están, así que el atributo dice la verdad.
 */
export function fijarIdioma(id, raiz = document) {
  actual = POR_ID[id] ?? ORIGINAL;
  try { localStorage.setItem(CLAVE_GUARDADO, actual.id); }
  catch (e) { /* en privado no se puede guardar; vale para esta sesión */ }
  document.documentElement.lang = actual.lang;
  traducir(raiz);
  return actual.id;
}

/**
 * Recorre el documento y pone cada texto marcado en el idioma actual.
 *
 * Se puede llamar todas las veces que haga falta y no acumula estado: cada elemento se
 * escribe entero desde su clave. Eso es lo que permite cambiar de idioma sin recargar.
 */
export function traducir(raiz = document) {
  for (const n of raiz.querySelectorAll("[data-t]")) n.textContent = t(n.dataset.t);
  // `innerHTML` solo donde el texto lleva marcas -un <br> en un titular, un <b> dentro de
  // una frase-. El contenido sale de `idiomas/`, que es código del repositorio y no
  // entrada del usuario: aquí no hay nada que escapar.
  for (const n of raiz.querySelectorAll("[data-t-html]")) n.innerHTML = t(n.dataset.tHtml);
  for (const [marca, atributos] of ATRIBUTOS) {
    for (const n of raiz.querySelectorAll(`[${marca}]`)) {
      const texto = t(n.getAttribute(marca));
      for (const atributo of atributos) n.setAttribute(atributo, texto);
    }
  }
}
