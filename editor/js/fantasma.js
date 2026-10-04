/**
 * EL FANTASMA DEL RATÓN: qué bloque se va a tocar antes de tocarlo, y de qué color.
 *
 * QUÉ HACE ESTE ARCHIVO Y POR QUÉ ESTÁ SEPARADO DEL LIENZO. `mapcanvas.js` importa la cámara y el
 * orden de dibujo del CLIENTE con rutas del montaje (`/jetyum/js/...`), que en Node no
 * existen, así que no se puede probar sin navegador. Y decidir qué fantasma se enseña —si el del
 * objeto que se lleva en la mano o el del bloque que se va a borrar, cuántas casillas son y de qué
 * color— es una decisión que, si se rompe, no da ningún error: se ve otra cosa y ya está. Por eso
 * se decide aquí, sin DOM, y el lienzo sólo pone las coordenadas de pantalla. Es el mismo reparto
 * que `marcadores.js`, `viewport.js`, `pincel.js` y `tintes.js`.
 *
 * DOS FANTASMAS, Y EL SEGUNDO ANULA UNA DECISIÓN ANTERIOR. El primero es el de siempre: llevar un
 * objeto o un suelo en la mano y ver, transparente, dónde va a caer. El segundo es el de BORRAR, y
 * existe porque el pincel se había dejado fuera del borrado a propósito —el razonamiento entero
 * está en `editormap.js`, en la sección del pincel, y aquí sólo se usa—: sin nada en la mano no
 * había nada que enseñar, y borrar un bloque de 16 casillas sin verlo es un accidente que se
 * comete una vez. El usuario pidió que borrar fuera con el pincel y pidió que se resolviera el
 * motivo; la forma de resolverlo es ésta, DARLE AL BORRADO SU PROPIO FANTASMA: el bloque rojo,
 * sin el dibujo del objeto dentro, siguiendo al ratón. Lo que se va a llevar por delante se ve
 * antes de hacerlo.
 *
 * POR QUÉ EL DE BORRAR NO LLEVA DIBUJO. El de pintar lleva el sprite de verdad del objeto porque
 * informa de CÓMO va a quedar lo que se ponga. Al borrar no hay nada que enseñar: lo que va a
 * pasar es que lo que hay deje de verse, y para eso el bloque rojo es toda la información que
 * existe. Un sprite dentro del fantasma de borrar diría justo lo contrario de lo que va a pasar.
 *
 * LAS DOS SILUETAS NO SE PUEDEN CONFUNDIR, y es a propósito: azul con dibujo (pintar) frente a
 * rojo sin dibujo (borrar). Si las dos fueran del mismo color, el fantasma diría cuántas casillas
 * se tocan pero no QUÉ se les va a hacer, que es la mitad de la pregunta.
 */

import { casillasDelPincel, limitarTamano } from './pincel.js';
import {
    ALFA_FANTASMA,
    COLOR_GOMA,
    COLOR_GOMA_BORDE,
    COLOR_PINCEL,
    COLOR_PINCEL_BORDE,
    hayFantasma
} from './tintes.js';

/**
 * Las herramientas que PINTAN, o sea las únicas en las que el fantasma es el de la mano.
 *
 * Está como lista y no como comparación suelta porque la pregunta es «¿esta herramienta escribe
 * casillas con lo que llevo en la mano?», y las que no lo son —la goma, las banderas, los
 * marcadores y la de elegir— tienen su propio fantasma o ninguno. Enseñar el objeto de la mano
 * mientras la herramienta puesta es la goma sería mentir sobre lo que va a pasar al pulsar.
 */
export const HERRAMIENTAS_QUE_PINTAN = ['paint', 'ground'];

/**
 * Qué fantasma enseña el ratón ahora mismo, o `null` si no hay ninguno que enseñar.
 *
 * @param {string} herramienta la herramienta puesta: `paint`, `ground`, `erase`, `flag`, `npc`...
 * @param {{typeId: number, esSuelo: boolean, nombre: string, tamano: number}|null} enLaMano
 * @param {boolean} borrando se está BORRANDO ahora mismo (el botón derecho, o arrastrando con él)
 * @param {number} pincel el lado del cuadro del editor, en casillas
 * @returns {{clase: string, tamano: number, color: string, borde: string, alfa: number,
 *          typeId?: number}|null}
 */
export function fantasmaDeHerramienta(herramienta, enLaMano, borrando, pincel) {
    /*
     * EL BORRADO MANDA SOBRE TODO LO DEMÁS, y las dos condiciones que lo disparan son las dos
     * formas de borrar que tiene el editor:
     *
     *   - LA GOMA PUESTA (`erase`), que es lo que el usuario pidió ver: con la goma elegida, el
     *     ratón enseña el bloque que se va a llevar por delante.
     *   - EL BOTÓN DERECHO PULSADO (`borrando`), que borra con la herramienta que sea. También
     *     aquí hay que enseñarlo: es el mismo borrado de bloque, y el fantasma del objeto de la
     *     mano —que es lo que se estaba viendo— no dice nada de lo que va a pasar al soltar.
     *
     * Va antes que el de pintar porque las dos cosas pueden ser verdad a la vez —la paleta tiene
     * un objeto elegido y el botón derecho está pulsado—, y la que va a pasar de verdad es el
     * borrado: el botón derecho nunca pinta.
     */
    if (borrando === true || herramienta === 'erase') {
        return {
            clase: 'borrar',
            tamano: limitarTamano(pincel),
            color: COLOR_GOMA,
            borde: COLOR_GOMA_BORDE,
            alfa: ALFA_FANTASMA
        };
    }

    if (HERRAMIENTAS_QUE_PINTAN.indexOf(herramienta) === -1 || !hayFantasma(enLaMano)) {
        return null;
    }

    return {
        clase: 'pintar',
        // El tamaño sale de la MANO y no del editor, que es lo que hace que el fantasma y el
        // rótulo del panel no puedan discrepar: los dos leen el mismo número. `main.js` los
        // escribe en el mismo sitio (`ponerEnLaMano` y `cambiarPincel`).
        tamano: limitarTamano(enLaMano.tamano),
        color: COLOR_PINCEL,
        borde: COLOR_PINCEL_BORDE,
        alfa: ALFA_FANTASMA,
        typeId: Number(enLaMano.typeId)
    };
}

/**
 * Las casillas que enseña el fantasma: el cuadro del pincel colgando de la casilla del ratón.
 *
 * SE RECORTA CON `dentro`, que es la misma regla que usa el mapa para pintar y para borrar
 * (`inBounds`). Sin recorte, un 4x4 pegado a la esquina enseñaría casillas que no existen y el
 * fantasma prometería más de lo que el clic va a hacer.
 *
 * @param {Object|null} fantasma el descriptor de `fantasmaDeHerramienta`
 * @param {{x: number, y: number}|null} hover la casilla bajo el ratón
 * @param {Function} [dentro] `(x, y) => boolean`
 */
export function casillasDelFantasma(fantasma, hover, dentro) {
    if (!fantasma || !hover) {
        return [];
    }

    return casillasDelPincel(hover.x, hover.y, fantasma.tamano, dentro);
}

/**
 * Dibuja el fantasma en el lienzo.
 *
 * EL CONTEXTO Y LAS COORDENADAS LLEGAN DE FUERA, como en `marcadores.js`: aquí no se sabe dónde
 * está la cámara. `vista.pantallaDe(casilla)` devuelve la esquina superior izquierda de una casilla
 * en píxeles, y eso es lo único que hace falta para pintar.
 *
 * @param {Object} ctx contexto de lienzo (2D)
 * @param {Object} fantasma descriptor de `fantasmaDeHerramienta`
 * @param {Object} vista
 * @param {Array<{x: number, y: number}>} vista.casillas las casillas del bloque, ya recortadas
 * @param {Function} vista.pantallaDe `(casilla) => {x, y}` en píxeles de la esquina de la casilla
 * @param {number} vista.paso el lado de una casilla en pantalla
 * @param {number} vista.escala `paso` partido por el lado del sprite original
 * @param {Object} [vista.sprite] el dibujo de lo que se lleva en la mano; sólo lo usa el de pintar
 */
export function dibujarFantasma(ctx, fantasma, vista) {
    const casillas = (vista && vista.casillas) || [];

    if (!fantasma || casillas.length === 0) {
        return;
    }

    const paso = vista.paso;

    // El bloque: el velo que dice cuántas casillas se tocan. Va en TODAS las casillas y no sólo en
    // el borde porque el suelo y muchos objetos de la hoja son dibujos CON TRANSPARENCIA: un
    // fantasma que sólo fuera el sprite se vería a trozos y no diría dónde acaba el bloque.
    let minX = casillas[0].x;
    let minY = casillas[0].y;
    let maxX = casillas[0].x;
    let maxY = casillas[0].y;

    casillas.forEach((casilla) => {
        minX = Math.min(minX, casilla.x);
        minY = Math.min(minY, casilla.y);
        maxX = Math.max(maxX, casilla.x);
        maxY = Math.max(maxY, casilla.y);
    });

    ctx.save();
    ctx.fillStyle = fantasma.color;
    ctx.strokeStyle = fantasma.borde;
    ctx.lineWidth = 1;

    casillas.forEach((casilla) => {
        const pantalla = vista.pantallaDe(casilla);

        ctx.fillRect(Math.round(pantalla.x), Math.round(pantalla.y), paso, paso);
    });

    const esquina = vista.pantallaDe({ x: minX, y: minY });

    ctx.strokeRect(
        Math.round(esquina.x) + 0.5,
        Math.round(esquina.y) + 0.5,
        (maxX - minX + 1) * paso,
        (maxY - minY + 1) * paso);

    ctx.restore();

    // El dibujo de verdad: sólo el de pintar lo tiene, y es lo que enseña CÓMO va a quedar. El de
    // borrar se queda en el bloque rojo a propósito (ver la cabecera del archivo).
    const sprite = vista.sprite;

    if (fantasma.clase !== 'pintar' || !sprite || !sprite.canvas) {
        return;
    }

    ctx.save();
    ctx.globalAlpha = fantasma.alfa;

    const escala = vista.escala;
    const ancla = Number(sprite.anchorY) || 0;

    casillas.forEach((casilla) => {
        const pantalla = vista.pantallaDe(casilla);

        ctx.drawImage(sprite.canvas,
            Math.round(pantalla.x - (Number(sprite.anchorX) || 0) * escala),
            Math.round(pantalla.y - ancla * escala + paso),
            sprite.canvas.width * escala,
            sprite.canvas.height * escala);
    });

    ctx.restore();
}
