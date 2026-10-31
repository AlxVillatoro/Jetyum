'use strict';

/**
 * EL MUSEO del mapa «continente» (`tools/generar-continente.mjs`): todos los objetos del catálogo,
 * y una marca por cada efecto, cada proyectil y cada aspecto.
 *
 *   - Una PIEZA (actionId 40000) se mira y no se toca: no se puede coger (el mapa le pone
 *     `pickupable: 0`) y aquí se le quita el uso. Como un script por actionId gana al de su tipo,
 *     usar la poción del museo no se la bebe y pisar su escalera no baja a ningún sitio.
 *   - Una marca de EFECTO (41000 + id) enseña ese efecto al pisarla.
 *   - Una marca de PROYECTIL (43000 + id) dispara ese proyectil hacia ella.
 *   - Una marca del PROBADOR (42000 + lookType) te pone ese aspecto mientras estás encima; al bajarte
 *     vuelves al tuyo. Lo tuyo se guarda en el personaje, así que si sales del juego encima de una
 *     marca, al volver lo recuperas.
 */

const PIEZA = 40000;
const EFECTO_BASE = 41000;
const ASPECTO_BASE = 42000;
const PROYECTIL_BASE = 43000;
const RANGO = 1000;

// El aspecto de antes de probarse otro (el almacenamiento guarda números: los colores, juntos).
const GUARDADO = 'museo:aspecto';
const COLORES = 'museo:colores';
const ADDONS = 'museo:addons';

const rango = (base) => Array.from({ length: RANGO - 1 }, (_, i) => base + 1 + i);

function guardarAspecto(player) {
    if (Number(player.getStorageValue(GUARDADO)) > 0) {
        return;   // ya lleva uno probado: lo suyo es lo que se guardó al subirse a la primera marca
    }
    const o = player.getOutfit();
    player.setStorageValue(GUARDADO, o.lookType);
    player.setStorageValue(COLORES, (o.lookHead || 0) * 1e9 + (o.lookBody || 0) * 1e6 + (o.lookLegs || 0) * 1e3 + (o.lookFeet || 0));
    player.setStorageValue(ADDONS, o.lookAddons || 0);
}

function devolverAspecto(player) {
    const lookType = Number(player.getStorageValue(GUARDADO));
    if (!(lookType > 0)) {
        return false;
    }
    const c = Number(player.getStorageValue(COLORES)) || 0;
    player.setOutfit({
        lookType,
        lookHead: Math.floor(c / 1e9) % 1000,
        lookBody: Math.floor(c / 1e6) % 1000,
        lookLegs: Math.floor(c / 1e3) % 1000,
        lookFeet: c % 1000,
        lookAddons: Number(player.getStorageValue(ADDONS)) || 0
    }, false);
    player.setStorageValue(GUARDADO, 0);
    return true;
}

module.exports = [
    {
        type: 'action',
        aids: [PIEZA],

        onUse(player) {
            player.sendTextMessage('Es una pieza del museo: se mira, pero no se toca.');
            return true;
        }
    },

    {
        // Pisar una pieza (una escalera, un agujero, un teleport) no hace nada.
        type: 'movement',
        event: 'stepin',
        aids: [PIEZA],

        onStepIn() {
            return true;
        }
    },

    {
        type: 'movement',
        event: 'stepin',
        aids: rango(EFECTO_BASE),

        onStepIn(creature, item, position) {
            Game.sendMagicEffect(position, item.getActionId() - EFECTO_BASE);
            return true;
        }
    },

    {
        type: 'movement',
        event: 'stepin',
        aids: rango(PROYECTIL_BASE),

        onStepIn(creature, item, position) {
            const desde = { x: position.x - 4, y: position.y - 3, z: position.z };
            Game.sendDistanceEffect(desde, position, item.getActionId() - PROYECTIL_BASE);
            return true;
        }
    },

    {
        type: 'movement',
        event: 'stepin',
        aids: rango(ASPECTO_BASE),

        onStepIn(creature, item) {
            if (!creature || !creature.isPlayer()) {
                return true;
            }
            const lookType = item.getActionId() - ASPECTO_BASE;
            guardarAspecto(creature);
            const o = creature.getOutfit();
            creature.setOutfit({ ...o, lookType }, false);
            creature.sendTextMessage('Te pruebas el aspecto ' + lookType + '. Bájate de la marca para volver al tuyo.');
            return true;
        }
    },

    {
        type: 'movement',
        event: 'stepout',
        aids: rango(ASPECTO_BASE),

        onStepOut(creature) {
            if (creature && creature.isPlayer()) {
                devolverAspecto(creature);
            }
            return true;
        }
    },

    {
        // Quien salió del juego con un aspecto del probador vuelve con el suyo.
        type: 'event',
        event: 'login',

        onLogin(player) {
            devolverAspecto(player);
            return true;
        }
    }
];
