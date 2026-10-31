'use strict';

/**
 * AL ENTRAR, EL CORREO QUE ESPERABA: lo que le mandaron mientras no estaba (la tabla
 * `player_mail`) va a sus depósitos, y se le dice «Tienes correo nuevo.». Las reglas, en
 * `engine/world/correo.js` (`entregarCorreoPendiente`).
 */
module.exports = {
    type: 'event',
    event: 'login',
    onLogin(player) {
        player.collectMail();
        return true;
    }
};
