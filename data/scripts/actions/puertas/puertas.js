'use strict';

/**
 * PUERTAS: abrir y cerrar al usarlas (doble clic, o la tecla E delante de la puerta).
 *
 * En TFS es `data/actions/scripts/other/doors.lua`, con una tabla de puertas (cerrada -> abierta)
 * escrita a mano en `global.lua`. Aquí la tabla SE CALCULA al cargar, a partir de las fichas de
 * `items.xml`: las puertas del OpenTibia Sprite Pack vienen en grupos de tres seguidos
 * —dos cerradas y una abierta (la abierta se pisa y va encima de las criaturas)—, una vez para
 * la puerta vertical y otra para la horizontal. Así una puerta nueva funciona con sólo darla de
 * alta, sin tocar este archivo.
 *
 * Para otras puertas, basta con añadir parejas a `EXTRA` ({cerrada: abierta}).
 */

const EXTRA = {
    20103: 20104    // la puerta del muro de piedra del arte HD (docs/ARTE-HD.md)
};

/** ¿Es una puerta abierta? Se pisa (no bloquea) y va encima de las criaturas. */
function abierta(id) {
    return Game.getItemAttribute(id, 'alwaysOnTop') !== undefined &&
        Game.getItemAttribute(id, 'blocksSolid') === undefined;
}

/** Las parejas cerrada -> abierta y abierta -> cerrada, sacadas de items.xml. */
function calcularPuertas() {
    const abrir = new Map();
    const cerrar = new Map();
    let cerradas = [];
    for (let id = 100; id <= 13000; id += 1) {
        if (!Game.itemTypeExists(id) || Game.getItemName(id) !== 'door') {
            if (cerradas.length > 0 && Game.itemTypeExists(id)) {
                cerradas = [];
            }
            continue;
        }
        if (abierta(id)) {
            // Sólo los grupos limpios: dos cerradas y su abierta, seguidas.
            if (cerradas.length >= 1 && cerradas.length <= 2 && cerradas[cerradas.length - 1] === id - 1) {
                cerradas.forEach((c) => abrir.set(c, id));
                cerrar.set(id, cerradas[cerradas.length - 1]);
            }
            cerradas = [];
        } else {
            cerradas.push(id);
            if (cerradas.length > 2) {
                cerradas.shift();
            }
        }
    }
    Object.keys(EXTRA).forEach((c) => {
        abrir.set(Number(c), EXTRA[c]);
        cerrar.set(EXTRA[c], Number(c));
    });
    return { abrir, cerrar };
}

const PUERTAS = calcularPuertas();

module.exports = {
    type: 'action',
    ids: Array.from(PUERTAS.abrir.keys()).concat(Array.from(PUERTAS.cerrar.keys())),

    onUse(player, item) {
        const id = item.getId();

        if (PUERTAS.abrir.has(id)) {
            item.transform(PUERTAS.abrir.get(id));
            return true;
        }

        if (PUERTAS.cerrar.has(id)) {
            const p = item.getPosition();
            if (p && Game.getCreatureCount(p.x, p.y, p.z) > 0) {
                player.sendTextMessage('No puedes cerrar la puerta: hay alguien en el umbral.');
                return true;
            }
            item.transform(PUERTAS.cerrar.get(id));
            return true;
        }
        return false;
    }
};
