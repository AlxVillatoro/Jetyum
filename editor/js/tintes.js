/**
 * Los tintes del editor: de qué color se ve cada cosa y POR QUÉ.
 *
 * ESTE ARCHIVO ES EL QUE DECIDE EL COLOR, y está aparte del lienzo por la misma razón que
 * `marcadores.js`: el lienzo no se puede probar sin navegador, y «de qué color se ve el objeto
 * que tengo elegido» es una decisión que, si se rompe, no da ningún error —se ve de otro color
 * y ya está— y que se puede comprobar sin abrir nada.
 *
 * TRES COLORES, TRES PREGUNTAS DISTINTAS, y confundirlos es lo que hace que un editor no se
 * entienda:
 *
 *   - EL FANTASMA, que es lo que se lleva EN LA MANO y todavía no se ha puesto. No lleva color
 *     propio: es el dibujo de verdad del objeto, transparente. Un tinte de color encima
 *     escondería cómo va a quedar lo que se va a pintar, que es justo lo que el fantasma viene
 *     a enseñar. Su transparencia es la única señal, y basta.
 *   - EL OBJETO ELEGIDO del mapa, en VERDE TRANSPARENTE. Éste sí lleva color, porque de lo que
 *     informa no es de su dibujo sino de QUE ES EL ELEGIDO, y el verde no se parece a nada del
 *     mapa (ni a la hierba: es un verde de pantalla, saturado y translúcido).
 *   - EL RESPAWN, en MORADO TRANSPARENTE, que es el color que ya usa su fuego y el que usa
 *     Remere's Map Editor: quien haya usado ese editor lo reconoce sin que nadie se lo explique.
 *   - LA ZONA PROTEGIDA, en AZUL CELESTE TRANSPARENTE. Es la bandera `protectionZone` de las
 *     casillas (`marcadores.js` lo cuenta entero), y el azul es el color que ya usa el editor para
 *     las banderas: quien vea azul celeste sobre una casilla sabe que ahí pasa algo de eso.
 *
 * LA PRECEDENCIA, QUE AHORA ES UNA PREGUNTA DE TRES, y el orden es: **VERDE > AZUL > MORADO**.
 *
 *   - EL VERDE MANDA SOBRE TODO, y ya estaba decidido: elegir es lo que se está haciendo en ese
 *     momento, y si el morado o el azul ganaran, elegir un objeto dentro de un respawn o de una
 *     zona no se notaría.
 *   - EL AZUL MANDA SOBRE EL MORADO. Una casilla protegida dentro de un respawn es una
 *     CONTRADICCIÓN del mapa —una zona de paz dentro de una zona de monstruos—, y de las dos cosas
 *     la que hay que ver es la rara, que es la que se va a revisar. Además el morado del respawn es
 *     un tinte de REGIÓN —«esto pertenece al área que cubre esta casilla»— y el azul es una
 *     propiedad DE LA CASILLA misma: cuando los dos son verdad, la propiedad propia es la que
 *     describe lo que pasa ahí.
 *
 * Y LOS DOS VELOS SE DIBUJAN IGUAL, uno encima del otro: el tinte es del objeto, el velo es del
 * área, y una casilla que esté en las dos se ve morada y azul a la vez, que es exactamente lo que
 * pasa en el mapa.
 */

import { COLOR_RESPAWN, COLOR_ZONA } from './marcadores.js';

/**
 * El color con el que se pinta lo que NO tiene suelo.
 *
 * Es el MISMO con el que el cliente del juego limpia su lienzo (`renderer.js`), y eso no es un
 * detalle: el suelo de la hoja tiene píxeles transparentes, así que en el juego se ve este
 * fondo por los agujeros del dibujo. Si el editor usara otro, un suelo con transparencia se
 * vería distinto en el editor y en el juego, que es exactamente lo que este editor evita
 * reutilizando la cámara y el orden de dibujo del cliente.
 */
export const COLOR_SIN_SUELO = '#101014';

/**
 * Lo transparente que se ve el fantasma.
 *
 * Ni 1 —que se confundiría con lo ya pintado y no se sabría qué está puesto y qué no— ni 0,2
 * —que con dibujos pequeños no se ve—. Con 0,55 se distingue el objeto y se ve el mapa detrás.
 */
export const ALFA_FANTASMA = 0.55;

/** El verde del objeto elegido del mapa. Saturado y translúcido, para que se lea el dibujo. */
export const COLOR_ELEGIDO = 'rgba(80, 240, 130, 0.45)';

/**
 * El morado con el que se tiñe lo que cae DENTRO de un respawn.
 *
 * Se deriva del morado del respawn en vez de escribirse a mano: si el del fuego cambia, el
 * tinte cambia con él, y «lo de dentro es del respawn» sigue siendo evidente. Dos morados
 * distintos para la misma idea sólo conseguirían que no se vieran como la misma.
 */
export const COLOR_EN_RESPAWN = conAlfa(COLOR_RESPAWN, 0.45);

/**
 * El azul celeste con el que se tiñe lo que cae DENTRO de una zona protegida.
 *
 * Derivado del azul de la zona por el mismo motivo que el morado se deriva del fuego del respawn:
 * si el color de la zona cambia, el tinte cambia con él, y «esto es de la zona» sigue siendo
 * evidente.
 */
export const COLOR_EN_ZONA = conAlfa(COLOR_ZONA, 0.45);

/**
 * El fondo del cuadro del pincel, para que se vea el bloque aunque el objeto sea transparente.
 */
export const COLOR_PINCEL = 'rgba(120, 200, 255, 0.2)';
export const COLOR_PINCEL_BORDE = 'rgba(160, 220, 255, 0.85)';

/**
 * EL FANTASMA DE BORRAR: el mismo cuadro, en ROJO, y sin el dibujo del objeto dentro.
 *
 * ESTE COLOR RESUELVE UNA OBJECION, y por eso está explicado y no es sólo un número. El pincel
 * se dejó fuera del borrado a propósito (ver `editormap.js`): al borrar no había nada en la
 * mano, así que no había fantasma que enseñara el bloque que se iba a llevar por delante, y
 * borrar 16 casillas de un clic sin verlo es un accidente que se comete una vez. El usuario pidió
 * que borrar tambien fuera con el pincel, y la forma de concederlo sin quedarse con el problema
 * es justo ésta: darle al borrado SU PROPIO fantasma. Con el bloque rojo delante, el motivo por
 * el que se dejó fuera desaparece.
 *
 * ROJO Y NO AZUL, que es lo que distingue las dos herramientas de un vistazo: el fantasma de
 * pintar lleva el dibujo de verdad del objeto —para enseñar cómo va a quedar— y éste no lleva
 * dibujo ninguno, porque no hay nada que enseñar: lo que se va a hacer es DEJAR DE VER lo que
 * hay. Un rojo apagado y translúcido, no un rojo de alarma: tapa el mapa que hay debajo y hay
 * que poder seguir leyéndolo para apuntar.
 */
export const COLOR_GOMA = 'rgba(255, 96, 96, 0.2)';
export const COLOR_GOMA_BORDE = 'rgba(255, 138, 138, 0.9)';

/**
 * Un color con transparencia, en la forma `rgba(...)`.
 *
 * Se acepta `#rgb` y `#rrggbb` porque es como están escritos los colores de `marcadores.js`.
 * Un color que no se entiende devuelve `null` en vez de un `rgba` inventado: quien lo use
 * puede entonces no teñir nada, que se ve raro, en lugar de teñirlo todo de negro, que se ve
 * roto.
 *
 * @param {string} color en hexadecimal
 * @param {number} alfa entre 0 y 1
 * @returns {string|null}
 */
export function conAlfa(color, alfa) {
    const texto = String(color || '').trim();
    const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(texto);
    const largo = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(texto);

    let rojo;
    let verde;
    let azul;

    if (largo) {
        rojo = parseInt(largo[1], 16);
        verde = parseInt(largo[2], 16);
        azul = parseInt(largo[3], 16);
    } else if (corto) {
        rojo = parseInt(corto[1] + corto[1], 16);
        verde = parseInt(corto[2] + corto[2], 16);
        azul = parseInt(corto[3] + corto[3], 16);
    } else {
        return null;
    }

    const valor = Number(alfa);
    const transparencia = Number.isFinite(valor) ? Math.min(1, Math.max(0, valor)) : 1;

    return 'rgba(' + rojo + ', ' + verde + ', ' + azul + ', ' + transparencia + ')';
}

/**
 * ¿Hay algo en la mano, o sea algo que dibujar como fantasma?
 *
 * CON NADA ELEGIDO NO HAY FANTASMA, y es la mitad de la respuesta a «¿cómo sé que no llevo
 * nada?»: la otra mitad es el rótulo del panel. Un fantasma que se dibujara también sin nada
 * elegido diría justo lo contrario de lo que pasa.
 *
 * @param {{typeId: (number|null|undefined)}|null} enLaMano
 */
export function hayFantasma(enLaMano) {
    return !!enLaMano && Number.isFinite(Number(enLaMano.typeId));
}

/**
 * El tinte de un elemento del mapa, o `null` si no lleva ninguno.
 *
 * EL ORDEN DE LAS PREGUNTAS ES LA PRECEDENCIA, y está razonada en la cabecera del archivo: verde
 * (elegido) manda sobre azul (zona protegida) y azul manda sobre morado (respawn).
 *
 * @param {Object} opciones
 * @param {boolean} [opciones.elegido] es el objeto elegido del mapa
 * @param {boolean} [opciones.enRespawn] la casilla cae dentro de un respawn
 * @param {boolean} [opciones.enZona] la casilla lleva la bandera de zona protegida
 * @param {boolean} [opciones.esSuelo] es el suelo de la casilla, no un objeto puesto encima
 * @returns {string|null} un color `rgba(...)`
 */
export function tinteDeElemento(opciones) {
    const opts = opciones || {};

    // El verde manda: si lo elegido se tiñera de morado o de azul por estar dentro de un área o de
    // una zona, elegir algo dentro de ellas no se vería, y elegir es lo que se está haciendo.
    if (opts.elegido) {
        return COLOR_ELEGIDO;
    }

    // El azul va antes que el morado: la protección es una propiedad de la CASILLA y el respawn es
    // una región que la cubre, así que con los dos a la vez manda la propiedad de la propia casilla.
    if (opts.enZona && !opts.esSuelo) {
        return COLOR_EN_ZONA;
    }

    /*
     * EL SUELO NO SE TIÑE POR ESTAR DENTRO DE UN RESPAWN —ni de una zona—, y es una decisión con su
     * motivo: las dos cosas ya llevan su velo encima, así que el suelo se ve de su color igual.
     * Teñir además el dibujo del suelo convertiría un respawn grande en una mancha en la que no se
     * distingue el terreno, y el terreno es la mitad de lo que se mira al colocar un respawn. Lo
     * que se tiñe es lo que hay PUESTO ENCIMA, que es lo que pertenece al área.
     */
    if (opts.enRespawn && !opts.esSuelo) {
        return COLOR_EN_RESPAWN;
    }

    return null;
}
