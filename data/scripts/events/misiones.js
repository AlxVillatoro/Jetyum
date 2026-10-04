'use strict';

/**
 * LO QUE MUEVE LA MISIÓN «La plaga de ratas» (`data/scripts/quests/plaga_de_ratas.js`):
 *
 * - al ENTRAR (`onLogin`), si no la tenía, se le da y se le dice;
 * - al MATAR (`onKill`) una rata, cuenta una; a las 10, recibe la recompensa
 *   (`player.addItem`, `player.addMoney`) con su efecto.
 *
 * Varios scripts pueden escuchar el mismo evento (`kill.js` también): se ejecutan todos.
 */

const RATAS = ['rat', 'cave rat'];

module.exports = [
    {
        type: 'event',
        event: 'login',
        onLogin(player) {
            if (player.getStorageValue('ratas.inicio') === null) {
                player.setStorageValue('ratas.inicio', 1);
                player.setStorageValue('ratas.muertas', 0);
                player.sendTextMessage('Nueva misión: «La plaga de ratas». Mírala en tu diario (botón Misiones).');
            }
            return true;
        }
    },
    {
        type: 'event',
        event: 'kill',
        onKill(player, monster) {
            if (!player || !monster || !player.isPlayer() || !RATAS.includes(String(monster.getName()).toLowerCase())) {
                return true;
            }
            const llevas = player.getStorageValue('ratas.muertas');
            if (llevas === null || llevas >= 10) {
                return true;
            }
            player.setStorageValue('ratas.muertas', llevas + 1);
            if (llevas + 1 < 10) {
                player.sendTextMessage('Ratas: ' + (llevas + 1) + ' de 10.');
                return true;
            }
            player.setStorageValue('ratas.premio', 1);
            player.addMoney(100);
            const pociones = player.addItem(2413, 2);
            player.sendMagicEffect(EFECTO.MAGIA_AZUL);
            player.sendTextMessage('¡Misión cumplida! Recibes 100 monedas de oro' +
                (pociones.ok ? ' y 2 pociones de vida.' : ' (las pociones no te caben: haz sitio en la mochila).'));
            return true;
        }
    }
];
