'use strict';

/**
 * LAS HERRAMIENTAS, que se usan SOBRE algo («usar con»: clic derecho en la herramienta y luego en
 * la casilla de al lado, como en Tibia). El script recibe el objetivo y la casilla:
 * `onUse(player, item, fromPosition, target, toPosition)`.
 *
 * - La CUERDA (12137) en un punto de cuerda (11000): te sube a la planta de arriba, a la casilla
 *   del sur del agujero (como en Tibia).
 * - La PALA (21030) en un montón de piedras (21032): lo aparta y deja un agujero (21033) por el que
 *   se baja; al minuto se vuelve a cerrar solo (`decayTo`/`duration` de items.xml).
 */

const CUERDA = 12137;
const PUNTO_DE_CUERDA = 11000;
const PALA = 21030;
const MONTON_DE_PIEDRAS = 21032;
const AGUJERO = 21033;

module.exports = [
    {
        type: 'action',
        ids: [CUERDA],

        onUse(player, item, fromPosition, target, toPosition) {
            if (!target || target.getId() !== PUNTO_DE_CUERDA) {
                return false;
            }
            // Arriba, la casilla del sur del agujero; si no se puede pisar, alguna de alrededor.
            const arriba = { x: toPosition.x, y: toPosition.y + 1, z: toPosition.z - 1 };
            const candidatas = [arriba,
                { x: toPosition.x + 1, y: toPosition.y, z: toPosition.z - 1 },
                { x: toPosition.x - 1, y: toPosition.y, z: toPosition.z - 1 },
                { x: toPosition.x, y: toPosition.y - 1, z: toPosition.z - 1 }];
            for (const destino of candidatas) {
                if (Game.isWalkable(destino.x, destino.y, destino.z) && player.teleportTo(destino)) {
                    Game.sendMagicEffect(destino, EFECTO.POFF);
                    return true;
                }
            }
            player.sendCancelMessage('No hay sitio arriba.');
            return true;
        }
    },

    {
        type: 'action',
        ids: [PALA],

        onUse(player, item, fromPosition, target, toPosition) {
            if (!target || target.getId() !== MONTON_DE_PIEDRAS) {
                return false;
            }
            target.transform(AGUJERO);
            target.decay();
            Game.sendMagicEffect(toPosition, EFECTO.POLVO);
            return true;
        }
    }
];
