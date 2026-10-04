'use strict';

/**
 * Al ENTRAR y al SALIR (`onLogin` / `onLogout`): un saludo con su efecto, y el aviso de lo
 * que hay de nuevo. Si un `onLogin` devolviera `false`, el jugador no podría entrar (como en TFS).
 */
module.exports = [
    {
        type: 'event',
        event: 'login',
        onLogin(player) {
            player.sendMagicEffect(EFECTO.MAGIA_AZUL);
            player.sendTextMessage('Bienvenido a Jetyum, ' + player.getName() + '. Son las ' +
                Game.getWorldHour() + ' en el mundo.');
            return true;
        }
    },
    {
        type: 'event',
        event: 'logout',
        onLogout(player) {
            player.setStorageValue('ultima.salida', Math.floor(Game.now() / 1000));
            return true;
        }
    }
];
