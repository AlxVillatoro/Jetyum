'use strict';

/**
 * LA MARCA DE CIUDADANO: pisarla te hace vecino de una ciudad. Es el `citizen.lua` de TFS, con su
 * misma cuenta: la ciudad es el actionId de la marca menos 30020 (la marca 30021 es la ciudad 1).
 *
 * Ser vecino de una ciudad decide en qué templo reapareces al morir y cuál es «tu» depósito cuando
 * no hay un cofre de por medio. El mapa «continente» pone dos marcas en cada templo
 * (`tools/generar-continente.mjs`); en cualquier otro mapa basta con poner a un objeto que se pise
 * el actionId 30020 + el id de la ciudad.
 */

const BASE = 30020;
const CIUDADES = 99;

module.exports = {
    type: 'movement',
    event: 'stepin',
    aids: Array.from({ length: CIUDADES }, (_, i) => BASE + 1 + i),

    onStepIn(creature, item) {
        if (!creature || !creature.isPlayer()) {
            return true;
        }
        const ciudad = Game.getTown(item.getActionId() - BASE);
        if (!ciudad) {
            return true;
        }
        const actual = creature.getTown();
        if (actual && actual.getId() === ciudad.getId()) {
            creature.sendTextMessage('Ya eres vecino de ' + ciudad.getName() + '.');
            return true;
        }
        creature.setTown(ciudad);
        creature.sendTextMessage('Ahora eres vecino de ' + ciudad.getName() + '.');
        Game.sendMagicEffect(creature.getPosition(), EFECTO.MAGIA_AZUL);
        return true;
    }
};
