'use strict';

/**
 * POCIONES: se beben con clic derecho (o doble clic) desde la mochila, o desde el suelo.
 *
 * Como en Tibia: la de vida cura y la de maná devuelve maná, salen sus números en verde, se dice
 * «Aaaah...», se gasta una de la pila y hay un respiro de 1 s entre una y otra (el «exhaust»).
 *
 * Usa la API de los scripts: `player.addHealth`, `player.addMana`, `item.remove(1)` (que vale
 * igual para la poción de la mochila que para la del suelo) y `player.sendMagicEffect`.
 *
 * CON UNA HOTKEY «EN EL OBJETIVO» (o sobre otro jugador) la poción es PARA ÉL, como en Tibia: el
 * `target` del `onUse` es la criatura. A un monstruo no se le da.
 */

const POCIONES = {
    2413: { nombre: 'health potion', vida: [125, 175] },
    2414: { nombre: 'mana potion', mana: [75, 125] }
};

/** Cuándo puede volver a beber cada jugador (milisegundos del reloj del mundo). */
const proximaVez = new Map();

function azar([min, max]) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

module.exports = {
    type: 'action',
    ids: Object.keys(POCIONES).map(Number),

    onUse(player, item, desde, objetivo) {
        const pocion = POCIONES[item.getId()];
        const ahora = Game.now();
        // ¿Para quién? Para el objetivo si es una criatura (una hotkey «en el objetivo»).
        const esCriatura = objetivo && typeof objetivo.getHealth === 'function' && typeof objetivo.isPlayer === 'function';
        if (esCriatura && !objetivo.isPlayer()) {
            player.sendCancelMessage('Sólo puedes darle una poción a un jugador.');
            return true;
        }
        const quien = esCriatura ? objetivo : player;
        if (ahora < (proximaVez.get(player.getId()) || 0)) {
            player.sendCancelMessage('Estás agotado.');
            return true;
        }
        if (pocion.vida && quien.getHealth() >= quien.getMaxHealth()) {
            player.sendCancelMessage(quien === player || quien.getId() === player.getId()
                ? 'Ya tienes la vida llena.' : quien.getName() + ' ya tiene la vida llena.');
            return true;
        }
        proximaVez.set(player.getId(), ahora + 1000);

        if (pocion.vida) {
            quien.addHealth(azar(pocion.vida));
        }
        if (pocion.mana) {
            const antes = quien.getMana();
            quien.addMana(azar(pocion.mana));
            quien.sendTextMessage('Recuperas ' + (quien.getMana() - antes) + ' de maná.');
        }
        quien.sendMagicEffect(EFECTO.MAGIA_AZUL);
        quien.say('Aaaah...');
        item.remove(1);
        return true;
    }
};
