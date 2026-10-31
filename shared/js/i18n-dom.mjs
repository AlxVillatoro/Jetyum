/**
 * La página, en el idioma puesto.
 *
 * NO HAY QUE MARCAR NADA EN EL HTML NI CAMBIAR EL CÓDIGO QUE ESCRIBE TEXTO. Esto recorre la página
 * al arrancar y VIGILA lo que cambia después (un `MutationObserver`): cada texto y cada `title`,
 * `placeholder`, `aria-label` o `alt` que aparece se traduce con el diccionario. El cliente y el
 * editor escriben su interfaz en español en miles de sitios —`textContent = 'Conectando…'`,
 * estados que se componen al vuelo—, y traducir en el sitio donde se pinta es lo que permite no
 * tocar ninguno de ellos.
 *
 * SE GUARDA EL ORIGINAL de cada texto traducido, y es lo que deja volver al español —o cambiar de
 * idioma— sin recargar: se vuelve a traducir desde el original. Si el código cambia un texto que
 * ya estaba traducido, lo nuevo es el original nuevo.
 *
 * LO QUE NO SE TRADUCE: lo que va dentro de `translate="no"` (el atributo estándar de HTML: el chat
 * de los jugadores, nombres que no son frases), los campos de texto y los scripts. Lo que se pinta
 * en un `<canvas>` no es DOM, y quien lo pinta llama a `traducir` (ver `i18n.mjs`).
 */

import { alCambiarIdioma, traducir } from './i18n.mjs';

const ATRIBUTOS = ['title', 'placeholder', 'aria-label', 'alt'];

const SIN_TRADUCIR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

/** Nodo de texto -> {original, mostrado}. */
const textos = new WeakMap();

/** Elemento -> {atributo: {original, mostrado}}. */
const atributos = new WeakMap();

function excluido(elemento) {
    for (let e = elemento; e && e.nodeType === 1; e = e.parentElement) {
        if (SIN_TRADUCIR.has(e.tagName) || e.getAttribute('translate') === 'no' ||
            e.isContentEditable) {
            return true;
        }
    }
    return false;
}

function traducirTexto(nodo) {
    const ahora = nodo.nodeValue;
    const guardado = textos.get(nodo);
    const original = guardado && ahora === guardado.mostrado ? guardado.original : ahora;
    if (!guardado && !/[A-Za-zÁÉÍÓÚÑáéíóúñ¿¡]/.test(original)) {
        return;
    }
    if (excluido(nodo.parentElement)) {
        return;
    }
    const traducido = traducir(original);
    if (traducido !== ahora) {
        nodo.nodeValue = traducido;
    }
    textos.set(nodo, { original: original, mostrado: traducido });
}

function traducirAtributo(elemento, nombre) {
    const ahora = elemento.getAttribute(nombre);
    if (ahora === null) {
        return;
    }
    let porAtributo = atributos.get(elemento);
    const guardado = porAtributo && porAtributo[nombre];
    const original = guardado && ahora === guardado.mostrado ? guardado.original : ahora;
    if (excluido(elemento)) {
        return;
    }
    const traducido = traducir(original);
    if (traducido !== ahora) {
        elemento.setAttribute(nombre, traducido);
    }
    if (!porAtributo) {
        porAtributo = {};
        atributos.set(elemento, porAtributo);
    }
    porAtributo[nombre] = { original: original, mostrado: traducido };
}

function traducirElemento(elemento) {
    ATRIBUTOS.forEach((nombre) => {
        if (elemento.hasAttribute(nombre)) {
            traducirAtributo(elemento, nombre);
        }
    });
}

/** Traduce un trozo de la página: el nodo y todo lo que lleva dentro. */
export function traducirArbol(raiz) {
    if (!raiz) {
        return;
    }
    if (raiz.nodeType === 3) {
        traducirTexto(raiz);
        return;
    }
    if (raiz.nodeType !== 1 && raiz.nodeType !== 9 && raiz.nodeType !== 11) {
        return;
    }
    if (raiz.nodeType === 1) {
        if (SIN_TRADUCIR.has(raiz.tagName) || raiz.getAttribute('translate') === 'no') {
            return;
        }
        traducirElemento(raiz);
    }
    const recorrido = document.createTreeWalker(raiz, 1 | 4, {
        acceptNode: (nodo) => {
            if (nodo.nodeType === 1 && (SIN_TRADUCIR.has(nodo.tagName) ||
                nodo.getAttribute('translate') === 'no')) {
                return 2; // FILTER_REJECT: ni él ni lo que lleva dentro
            }
            return 1;
        }
    });
    for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
        if (nodo.nodeType === 3) {
            traducirTexto(nodo);
        } else {
            traducirElemento(nodo);
        }
    }
}

/**
 * Los diálogos del navegador (`alert`, `confirm`, `prompt`) no son DOM: se envuelven para que
 * traduzcan su mensaje. El valor por defecto de `prompt` NO se traduce: es un nombre que se va a
 * guardar en los datos («Casa 3»), no una frase de la interfaz.
 */
function traducirDialogos() {
    ['alert', 'confirm', 'prompt'].forEach((nombre) => {
        const original = window[nombre];
        if (typeof original !== 'function' || original.traducido) {
            return;
        }
        const envuelto = function (mensaje, ...resto) {
            return original.call(window, mensaje === undefined ? mensaje : traducir(String(mensaje)), ...resto);
        };
        envuelto.traducido = true;
        window[nombre] = envuelto;
    });
}

let observador = null;

/**
 * Traduce la página entera y la mantiene traducida: lo que se añada o cambie después, y todo otra
 * vez cuando se cambie de idioma. Se llama una vez al arrancar.
 */
export function traducirPagina() {
    if (typeof document === 'undefined' || observador) {
        return;
    }
    const raiz = document.documentElement;
    traducirArbol(raiz);
    traducirDialogos();

    observador = new MutationObserver((cambios) => {
        cambios.forEach((cambio) => {
            if (cambio.type === 'childList') {
                cambio.addedNodes.forEach((nodo) => traducirArbol(nodo));
            } else if (cambio.type === 'characterData') {
                traducirTexto(cambio.target);
            } else if (cambio.type === 'attributes') {
                traducirAtributo(cambio.target, cambio.attributeName);
            }
        });
    });
    observador.observe(raiz, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATRIBUTOS
    });

    alCambiarIdioma(() => traducirArbol(raiz));
}

/**
 * Llena un `<select>` con los idiomas y lo deja cambiando el idioma. Las opciones llevan
 * `translate="no"`: cada idioma se nombra en su propia lengua, se esté en el que se esté.
 */
export function montarSelectorDeIdioma(select, idiomas, actual, cambiar) {
    select.innerHTML = '';
    select.setAttribute('translate', 'no');
    idiomas.forEach((entrada) => {
        const opcion = document.createElement('option');
        opcion.value = entrada.id;
        opcion.textContent = entrada.nombre;
        select.appendChild(opcion);
    });
    select.value = actual;
    select.addEventListener('change', () => cambiar(select.value));
    alCambiarIdioma((id) => {
        select.value = id;
    });
}
