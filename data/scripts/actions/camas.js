'use strict';

/**
 * LAS CAMAS: usar una cama de una casa en la que estás invitado te acuesta y te saca del juego, como
 * en Tibia. Al volver recuperas lo que se recupera durmiendo (un punto de vida y uno de maná cada 30
 * segundos, y un alma cada 15 minutos, hasta el máximo), y mientras duermes la cama se ve ocupada.
 *
 * Qué es una cama: un objeto con el atributo `bed` en `items.xml`, o uno de los de `bedItems` en
 * config.js (la cabecera, los pies al sur y sus dibujos ocupadas). Se busca al cargar, como hacen las
 * puertas, así que una cama nueva funciona con sólo darla de alta con `bed`; las de serie (21050 a
 * 21053) están aunque `items.xml` todavía no las tenga.
 *
 * Las reglas (de quién es la casa, si está libre, el combate) son del motor: `engine/world/casas.js`.
 */

const DE_SERIE = [21050, 21051, 21052, 21053];

/** Las camas de items.xml (atributo `bed`) más las de serie. */
function camas() {
    const ids = new Set(DE_SERIE);
    for (let id = 100; id <= 30000; id += 1) {
        if (Game.itemTypeExists(id)) {
            const bed = Game.getItemAttribute(id, 'bed');
            if (bed !== undefined && bed !== 0 && bed !== '0' && bed !== false) {
                ids.add(id);
            }
        }
    }
    return Array.from(ids);
}

module.exports = {
    type: 'action',
    ids: camas(),

    onUse(player, item) {
        const r = player.sleepInBed(item);
        if (r.ok) {
            return true;
        }
        switch (r.reason) {
            case 'occupied':
                player.sendCancelMessage(r.name + ' está durmiendo ahí.');
                break;
            case 'notHouse':
            case 'notInvited':
                player.sendCancelMessage('Sólo puedes dormir en una casa en la que estés invitado.');
                break;
            case 'inFight':
                player.sendCancelMessage('No puedes dormir mientras estás en combate.');
                break;
            default:
                player.sendCancelMessage('No puedes usar esa cama.');
        }
        return true;
    }
};
