// Los ratones que puede elegir el usuario, y el selector que sale en las DOS pantallas
// donde se elige uno: las opciones de la cámara —el que se pone en la foto— y el
// formulario de la carta —el que se dibuja en el papel—.
//
// ESTÁ AQUÍ Y NO EN `main.js` porque era lo mismo dos veces. Un selector de miniaturas no
// es solo pintar cuatro botones: es pintarlos, marcar el que está puesto, esperar a que el
// PNG esté DECODIFICADO antes de darlo por puesto, guardar la elección, y volver a pintar
// los nombres cuando cambia el idioma. Escrito dos veces, a la segunda pantalla siempre se
// le olvida uno de los cinco.
//
// LO QUE EL MÓDULO NO SABE es qué se hace con el ratón elegido: la cámara cambia el `src`
// de un <img> del DOM y la carta se queda con la imagen decodificada para dibujarla en un
// lienzo. Eso lo pone cada pantalla en `alElegir`. Aquí solo vive lo que las dos comparten.

import { t, nombreDelCatalogo } from "./i18n.js";
import { leer, guardar } from "./preferencias.js";

/**
 * El ratón que sale si no hay catálogo, y por qué existe este respaldo.
 *
 * `assets/ratones.json` es lo que se edita cuando llegan fotos nuevas, o sea lo que alguien
 * va a tocar a mano alguna vez. Si ese día se queda una coma de más, la app NO se queda sin
 * ratón: se cae al clásico, que es el PNG que el HTML ya trae puesto. Perder la foto entera
 * por un catálogo de OPCIONES sería cambiar una función que funciona por otra que ya estaba.
 */
export const RATON_RESPALDO = {
  id: "clasico", title: "Ratón Pérez", archivo: "assets/raton_perez.png",
};

/** El nombre traducido de un ratón, por `id`, o el del catálogo si ese idioma no lo trae. */
export const nombreRaton = (entry) => nombreDelCatalogo(`ratones.${entry.id}`, entry);

export async function cargarRatones() {
  try {
    const lista = (await (await fetch("assets/ratones.json")).json()).ratones;
    if (lista?.length) return lista;
  } catch (e) {
    console.warn(`ratones: ${e.message}`);
  }
  return [RATON_RESPALDO];
}

/**
 * Un selector de ratones: las miniaturas de una pantalla y la elección que guarda.
 *
 * Cada pantalla crea el suyo con su contenedor y su clave de preferencias, y las dos
 * elecciones son INDEPENDIENTES: se puede llevar el morado en la foto y el clásico en la
 * carta. Compartirlas ahorraría un toque y a cambio cambiaría una pantalla desde la otra
 * sin decir nada, que es peor.
 */
export class SelectorDeRatones {
  /**
   * @param {object} opciones
   * @param {HTMLElement} opciones.contenedor  donde se pintan las miniaturas
   * @param {object[]} opciones.ratones        el catálogo
   * @param {string} opciones.clave            dónde se guarda la elección
   * @param {(entry: object, img: HTMLImageElement) => void} opciones.alElegir
   *        qué hace la pantalla con el ratón YA decodificado
   * @param {(entry: object) => void} [opciones.alFallar]  si esa foto no se puede cargar
   */
  constructor({ contenedor, ratones, clave, alElegir, alFallar }) {
    this.contenedor = contenedor;
    this.ratones = ratones;
    this.clave = clave;
    this.alElegir = alElegir;
    this.alFallar = alFallar;
    this.elegido = null;
    this.pintar();
  }

  /** Las miniaturas. Se repinta también al cambiar de idioma: llevan el nombre debajo. */
  pintar() {
    this.contenedor.replaceChildren(...this.ratones.map((entry) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.raton = entry.id;
      const img = document.createElement("img");
      img.src = entry.archivo;
      // El `alt` va VACÍO a propósito: el nombre está ahí al lado, en texto, y con los dos
      // un lector de pantalla lee cada opción dos veces.
      img.alt = "";
      img.draggable = false;
      const nombre = document.createElement("span");
      nombre.textContent = nombreRaton(entry);
      b.append(img, nombre);
      b.onclick = () => this.elegir(entry.id);
      return b;
    }));
    this.marcar();
  }

  /** Marcado hay UNO: el que se está viendo. Ninguno o varios se leen como que está roto. */
  marcar() {
    for (const b of this.contenedor.children) {
      b.setAttribute("aria-pressed", String(b.dataset.raton === this.elegido));
    }
  }

  /**
   * Pone un ratón, y solo lo da por puesto cuando su PNG está DECODIFICADO.
   *
   * Lo de esperar no es un adorno: un <img> al que se le acaba de asignar `src` está en
   * "no disponible" hasta que carga, y ahí `naturalWidth` vale 0 —que es como la foto y la
   * carta saben que no hay nada que dibujar—. Sin la espera, disparar o generar la carta
   * justo después de elegir salía SIN RATÓN.
   *
   * Y si esa foto no carga, se queda la anterior y se avisa: una opción rota no puede
   * dejar la pantalla sin personaje.
   */
  async elegir(id, persistir = true) {
    const entry = this.ratones.find((r) => r.id === id) ?? this.ratones[0];
    if (!entry) return false;

    const img = new Image();
    img.src = entry.archivo;
    try {
      await img.decode();
    } catch (e) {
      this.alFallar?.(entry);
      return false;
    }

    this.alElegir(entry, img);
    this.elegido = entry.id;
    this.marcar();
    if (persistir) guardar(this.clave, entry.id);
    return true;
  }

  /**
   * Lo que se eligió la última vez, y si ya no carga, el primero del catálogo.
   *
   * El respaldo importa: la elección se guarda por `id` y los archivos cambian cuando
   * llegan fotos nuevas. Sin él, la pantalla enseñaría un ratón y el selector tendría
   * marcado otro.
   *
   * No guarda nada: lo que se lee es lo que ya había, y escribirlo otra vez convertiría el
   * valor de fábrica en una elección del usuario.
   */
  async recuperar() {
    const id = leer(this.clave) ?? this.ratones[0].id;
    if (!(await this.elegir(id, false)) && id !== this.ratones[0].id) {
      await this.elegir(this.ratones[0].id, false);
    }
  }

  /** El aviso de que una foto no se pudo cargar, igual en las dos pantallas. */
  static avisoRoto(entry) {
    return t("opciones.ratonSinFoto", { nombre: nombreRaton(entry) });
  }
}
