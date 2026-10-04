'use strict';

/**
 * HECHIZOS DE APOYO (`type: 'spell'`, grupo 'apoyo'): condiciones sobre ti mismo.
 *
 * - `utani hur`: corres más 33 s (condición `prisa`).
 * - `utevo lux`: das luz alrededor 5 min (condición `luz`): de noche se nota.
 * - `exana pox`: te quita el veneno.
 */

module.exports = [
    {
        type: 'spell', words: 'utani hur', name: 'Haste', group: 'apoyo',
        level: 14, mana: 60,
        onCastSpell(player) {
            const extra = Math.floor(player.getSpeed() * 0.3) + 24;
            player.addCondition({ type: 'prisa', duration: 33000, value: extra });
            player.sendMagicEffect(EFECTO.MAGIA_AZUL);
            return 'Corres más (velocidad ' + player.getSpeed() + ').';
        }
    },
    {
        type: 'spell', words: 'utevo lux', name: 'Light', group: 'apoyo',
        level: 8, mana: 20,
        onCastSpell(player) {
            player.addCondition({ type: 'luz', duration: 5 * 60 * 1000, value: 6 });
            player.sendMagicEffect(EFECTO.MAGIA_AZUL);
            return true;
        }
    },
    {
        type: 'spell', words: 'exana pox', name: 'Cure Poison', group: 'apoyo',
        level: 10, mana: 30,
        onCastSpell(player) {
            if (!player.hasCondition('veneno')) {
                player.sendCancelMessage('No estás envenenado.');
                return false;
            }
            player.removeCondition('veneno');
            player.sendMagicEffect(EFECTO.MAGIA_AZUL);
            return 'Ya no estás envenenado.';
        }
    }
];
