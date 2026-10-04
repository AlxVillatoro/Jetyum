'use strict';

/**
 * EL ANILLO (2376) AL PONÉRSELO: mientras lo llevas, REGENERAS un punto de vida cada 3 segundos
 * (una condición `regeneracion` larga, que `life_ring.js` quita al quitártelo).
 *
 * `onEquip(player, item, slot, isCheck)`: el motor lo lanza al ponerse el objeto en una ranura.
 */
module.exports = {
    type: 'movement',
    event: 'equip',
    ids: [2376],   // el anillo

    onEquip(player, item, slot, isCheck) {
        if (isCheck) {
            // Sólo se está consultando: no hay que anunciar nada todavía.
            return true;
        }
        player.addCondition({ type: 'regeneracion', ticks: 100000, interval: 3000, value: 1 });
        player.sendMagicEffect(EFECTO.MAGIA_AZUL);
        player.sendTextMessage('Regeneras vida mientras lo lleves.');
        player.sendTextMessage('Te pones ' + item.getName() + ' en el slot ' + slot + '.');
        return true;
    }
};
