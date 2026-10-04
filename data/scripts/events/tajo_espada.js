'use strict';

/**
 * EL TAJO DE ESPADA: cada vez que un caballero ataca con una espada, sale el golpe de espada de
 * BrowserQuest (importado como efecto: `EFECTO.ESPADA_*`, en things.json) hacia
 * donde mira. El motor ya lo ha girado hacia su objetivo antes de avisar.
 *
 * Evento de criatura `attack`: `onAttack(atacante, objetivo)`, en cada ataque (golpee o falle).
 */

const POR_DIRECCION = [EFECTO.ESPADA_NORTE, EFECTO.ESPADA_ESTE, EFECTO.ESPADA_SUR, EFECTO.ESPADA_OESTE];

module.exports = {
    type: 'event',
    event: 'attack',

    onAttack(atacante) {
        if (!atacante || !atacante.isPlayer() || !/knight/i.test(atacante.getVocation() || '')) {
            return true;
        }
        if (atacante.getWeaponType() !== 'sword') {
            return true;
        }
        const efecto = POR_DIRECCION[atacante.getDirection()];
        if (efecto) {
            Game.sendMagicEffect(atacante.getPosition(), efecto);
        }
        return true;
    }
};
