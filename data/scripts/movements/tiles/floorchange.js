'use strict';

/**
 * CAMBIAR DE PLANTA AL PISAR: escaleras, rampas y agujeros. Es la regla `floorchange` de TFS
 * (`Game::internalMoveCreature`), escrita como movimiento para que se pueda cambiar sin tocar
 * el motor.
 *
 * El atributo `floorchange` de items.xml dice qué pasa al pisar el objeto:
 *
 *   down                     bajar a la planta de abajo, a la misma casilla; si ahí abajo hay una
 *                            rampa de subida, se aparece DELANTE de ella (al lado contrario de
 *                            hacia donde sube), que es lo que hace Tibia
 *   north/south/east/west    subir a la planta de arriba, una casilla en esa dirección
 *   northalt/southalt/...    lo mismo, dos casillas (escaleras anchas)
 *
 * Sólo los jugadores cambian de planta: los monstruos se quedan en la suya.
 */

const DIRECCIONES = {
    north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
    northalt: [0, -2], southalt: [0, 2], eastalt: [2, 0], westalt: [-2, 0]
};

/** Todos los objetos con `floorchange`, sacados de items.xml al cargar. */
function conFloorchange() {
    const ids = [];
    for (let id = 100; id <= 13000; id += 1) {
        if (Game.itemTypeExists(id) && Game.getItemAttribute(id, 'floorchange') !== undefined) {
            ids.push(id);
        }
    }
    return ids;
}

/** La dirección de la rampa que haya en una casilla, o null. */
function rampaEn(x, y, z) {
    for (const id of Game.getTileItemIds(x, y, z)) {
        const f = Game.getItemAttribute(id, 'floorchange');
        if (DIRECCIONES[f]) {
            return DIRECCIONES[f];
        }
    }
    return null;
}

module.exports = {
    type: 'movement',
    event: 'stepin',
    ids: conFloorchange(),

    onStepIn(creature, item, position) {
        if (!creature || !creature.isPlayer()) {
            return true;
        }
        const tipo = item.getAttribute('floorchange');
        let destino = null;

        if (tipo === 'down') {
            destino = { x: position.x, y: position.y, z: position.z + 1 };
            const rampa = rampaEn(destino.x, destino.y, destino.z);
            if (rampa) {
                destino.x -= Math.sign(rampa[0]);
                destino.y -= Math.sign(rampa[1]);
            }
        } else if (DIRECCIONES[tipo]) {
            destino = { x: position.x + DIRECCIONES[tipo][0], y: position.y + DIRECCIONES[tipo][1], z: position.z - 1 };
        }

        if (!destino || destino.z < 0 || destino.z > 15 || !Game.isWalkable(destino.x, destino.y, destino.z)) {
            creature.sendTextMessage('Por ahí no se puede pasar.');
            return true;
        }
        creature.teleportTo(destino);
        return true;
    }
};
