'use strict';

/**
 * EL ANILLO (2376) AL QUITÁRSELO: se acaba la regeneración que dio al ponérselo
 * (`sword_ring.js`).
 *
 * `onDeEquip(player, item, slot, isCheck)`: el motor lo lanza al quitarse el objeto de su ranura
 * (a la mochila, al suelo o cambiándolo por otro).
 */
module.exports = {
    type: 'movement',
    event: 'deequip',
    ids: [2376],   // el anillo

    onDeEquip(player, item, slot, isCheck) {
        if (isCheck) {
            // Modo consulta: se pregunta si se puede quitar, no se está quitando.
            return true;
        }
        player.removeCondition('regeneracion');
        player.sendTextMessage('Te quitas ' + item.getName() + ': ya no regeneras más rápido.');
        return true;
    }
};
