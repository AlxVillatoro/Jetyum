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
 *
 * Y el hechizo de la cuerda, `exani tera` (Magic Rope): hace lo mismo que la cuerda, pero hay que
 * estar DE PIE en el punto de cuerda y decir las palabras. Va aquí y no en spells/ para subir
 * exactamente igual que la cuerda (los módulos de data/scripts no se pueden compartir: cada .js se
 * carga como script).
 */

const CUERDA = 12137;
const PUNTO_DE_CUERDA = 11000;
const PALA = 21030;
const MONTON_DE_PIEDRAS = 21032;
const AGUJERO = 21033;

/**
 * Sube por el agujero del punto de cuerda que hay en `punto`: arriba, a la casilla del sur del
 * agujero; si no se puede pisar, a alguna de alrededor. @returns {boolean} si subió
 */
function subirPorCuerda(player, punto) {
    const z = punto.z - 1;
    const candidatas = [{ x: punto.x, y: punto.y + 1, z }, { x: punto.x + 1, y: punto.y, z },
        { x: punto.x - 1, y: punto.y, z }, { x: punto.x, y: punto.y - 1, z }];
    for (const destino of candidatas) {
        if (Game.isWalkable(destino.x, destino.y, destino.z) && player.teleportTo(destino)) {
            Game.sendMagicEffect(destino, EFECTO.POFF);
            return true;
        }
    }
    player.sendCancelMessage('No hay sitio arriba.');
    return false;
}

module.exports = [
    {
        type: 'action',
        ids: [CUERDA],

        onUse(player, item, fromPosition, target, toPosition) {
            if (!target || target.getId() !== PUNTO_DE_CUERDA) {
                return false;
            }
            subirPorCuerda(player, toPosition);
            return true;
        }
    },

    {
        type: 'spell', words: 'exani tera', name: 'Magic Rope', group: 'apoyo',
        level: 9, mana: 20,
        onCastSpell(player) {
            const aqui = player.getPosition();
            if (!Game.getTileItemIds(aqui.x, aqui.y, aqui.z).includes(PUNTO_DE_CUERDA)) {
                player.sendCancelMessage('Tienes que estar en un punto de cuerda.');
                return false;
            }
            // Sin sitio arriba no se gasta el maná.
            return subirPorCuerda(player, aqui);
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
