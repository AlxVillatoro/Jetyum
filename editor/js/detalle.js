/**
 * Los detalles de un objeto del mapa: lo que se enseña al pulsar con el derecho.
 *
 * REAPROVECHA LA TABLA DE LA PESTAÑA DE OBJETOS, y no es un detalle de ahorro: la lista de
 * propiedades que se pueden mirar de un objeto —qué banderas tiene, para qué sirve cada una— ya
 * está escrita una vez en `itemsview.js` (`COMMON_ATTRIBUTES`), que es la que rellena el
 * formulario de `items.xml`. Escribir aquí otra lista daría dos sitios que mantener de acuerdo,
 * y el día que se añada una bandera nueva al archivo se vería en una pestaña y no en la otra.
 *
 * AQUÍ SÓLO SE DECIDE QUÉ FILAS TIENE LA FICHA Y EN QUÉ ORDEN, que es lo que se puede comprobar
 * sin navegador. Quien la pinta es `main.js`, y son cuatro líneas.
 *
 * POR QUÉ LA FICHA ES NECESARIA TENIENDO EL MAPA DELANTE: en una casilla puede haber un suelo y
 * cinco objetos apilados, y en pantalla se ven superpuestos. La ficha dice cuál es cuál, en qué
 * orden se dibujan, en qué planta está y qué lo bloquea — y eso no se ve mirando.
 */

import { COMMON_ATTRIBUTES } from './itemsview.js';

/** Las centésimas de onza que tiene una onza, igual que en `engine/world/weight.js`. */
const CENTESIMAS_POR_ONZA = 100;

/**
 * El peso, como lo escribe el motor.
 *
 * ES LA MISMA CUENTA que `engine/world/weight.js`, y a propósito: el editor no puede importar
 * aquel archivo —es CommonJS del motor y el navegador carga módulos ES—, así que la alternativa
 * era escribir el número en crudo. Con dos formatos, el mismo objeto pesaría «4200» en el editor
 * y «42.00 oz» en el juego, y quien estuviera ajustando un peso no sabría cuál de los dos
 * números está escribiendo. Lo que impide que las dos cuentas se separen es una comprobación:
 * `tools/test-tools.js` compara esta función con la del motor para los mismos valores.
 *
 * @param {number} centesimas el `weight` de `items.xml`
 * @returns {string} por ejemplo `42.00 oz`
 */
export function formatoDePeso(centesimas) {
    const valor = Number(centesimas) || 0;
    return (valor / CENTESIMAS_POR_ONZA).toFixed(2) + ' oz';
}

/**
 * Las banderas y propiedades que declara `items.xml`, con la explicación de cada una.
 *
 * SÓLO LAS QUE ESTÁN PUESTAS, y las que el objeto tiene y no están en la tabla conocida también
 * salen: una propiedad que no se enseñara parecería no existir, y alguien la volvería a escribir.
 * Es la misma regla que sigue el formulario de `items.xml`.
 *
 * @param {Object} attributes los de la definición del objeto
 * @returns {Array<{clave: string, valor: string, texto: string}>}
 */
export function banderasDe(attributes) {
    const propios = attributes || {};

    const conocidas = COMMON_ATTRIBUTES
        .filter((atributo) => propios[atributo.key] !== undefined)
        .map((atributo) => ({
            clave: atributo.key,
            valor: String(propios[atributo.key]),
            texto: atributo.hint
        }));

    const extras = Object.keys(propios)
        .filter((clave) => !COMMON_ATTRIBUTES.some((atributo) => atributo.key === clave))
        .map((clave) => ({
            clave: clave,
            valor: String(propios[clave]),
            // Una propiedad que el editor no conoce no se puede explicar: se enseña su valor y se
            // dice que no se conoce, que es más útil que callarla.
            texto: 'propiedad que el editor no conoce'
        }));

    return conocidas.concat(extras);
}

/** La banda de la pila, dicha como se dice al colocar algo. */
export function nombreDeBanda(banda) {
    if (banda === 'suelo') {
        return 'el suelo de la casilla, siempre abajo';
    }
    if (banda === 'arriba') {
        return 'encima de las criaturas (alwaysOnTop)';
    }
    return 'debajo de las criaturas';
}

/** La planta, con el mismo nombre que usa el desplegable del editor. */
export function nombreDePlanta(z) {
    const planta = Number(z);
    return 'planta ' + planta + (planta <= 7 ? ' (superficie)' : ' (subsuelo)');
}

/**
 * La ficha de un objeto del mapa.
 *
 * @param {Object} opciones
 * @param {Object} [opciones.definicion] la definición de `items.xml`, si el id existe
 * @param {number} [opciones.id] el identificador, que se enseña aunque no haya definición
 * @param {number} [opciones.stackpos] su posición en la pila (0 es el suelo)
 * @param {number} [opciones.z] la planta
 * @param {number} [opciones.x]
 * @param {number} [opciones.y]
 * @param {string} [opciones.banda] `suelo`, `abajo` o `arriba`
 * @returns {Array<{etiqueta: string, valor: string}>}
 */
export function filasDeDetalle(opciones) {
    const opts = opciones || {};
    const definicion = opts.definicion || null;
    const attributes = definicion && definicion.attributes ? definicion.attributes : {};
    const esSuelo = opts.banda === 'suelo';

    const filas = [
        { etiqueta: 'Casilla', valor: opts.x + ',' + opts.y + ',' + opts.z },
        { etiqueta: 'Planta', valor: nombreDePlanta(opts.z) },
        {
            etiqueta: 'Pila',
            valor: esSuelo
                ? 'posicion 0 (el suelo)'
                : 'posicion ' + opts.stackpos + ' de la casilla'
        },
        {
            // El suelo no está «dentro» de la pila de objetos: es la base sobre la que se apilan.
            etiqueta: esSuelo ? 'Que es' : 'Banda',
            valor: nombreDeBanda(opts.banda)
        },
        { etiqueta: 'Id', valor: String(opts.id === undefined ? '' : opts.id) },
        {
            etiqueta: 'Nombre',
            valor: definicion && definicion.name
                ? definicion.name
                : 'sin definir en items.xml'
        },
        {
            etiqueta: 'Peso',
            // Un objeto sin `weight` no pesa cero: no lo declara, y el motor lo trata como
            // ingrávido. Decir «0.00 oz» haría creer que su peso está decidido y es cero.
            valor: attributes.weight === undefined
                ? 'no lo declara'
                : formatoDePeso(attributes.weight)
        }
    ];

    banderasDe(attributes).forEach((bandera) => {
        filas.push({
            etiqueta: bandera.clave + ' = ' + bandera.valor,
            valor: bandera.texto
        });
    });

    return filas;
}
