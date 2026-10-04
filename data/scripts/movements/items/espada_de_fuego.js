'use strict';

/**
 * PONERSE Y QUITARSE algo (`onEquip` / `onDeEquip`): la espada de fuego arde al empuñarla, y da
 * un poco de luz mientras la llevas (una condición `luz` que se quita al soltarla).
 */
const ESPADA_DE_FUEGO = 11736;

module.exports = [
    {
        type: 'movement',
        event: 'equip',
        ids: [ESPADA_DE_FUEGO],
        onEquip(player) {
            player.sendMagicEffect(EFECTO.FUEGO);
            player.addCondition({ type: 'luz', duration: 24 * 60 * 60 * 1000, value: 3 });
            return true;
        }
    },
    {
        type: 'movement',
        event: 'deequip',
        ids: [ESPADA_DE_FUEGO],
        onDeEquip(player) {
            player.removeCondition('luz');
            return true;
        }
    }
];
