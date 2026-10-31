'use strict';

/**
 * Comandos del PERSONAL (data/XML/groups.js). Para quien no tiene el grupo, no existen.
 *
 *   /grupo                        lista los grupos
 *   /grupo <personaje>, <grupo>   le pone ese grupo (esté dentro o no; se guarda). Sólo un god.
 *   /montura                      lista las monturas (data/XML/mounts.js)
 *   /montura <id>                 te da esa montura
 *   /montura <id>, <personaje>    se la da a otro que esté dentro. Desde gamemaster.
 *
 * El primer god de un servidor nuevo no puede ponérselo nadie desde el juego: se pone con
 * `npm run grupo -- <personaje> god` (con el servidor parado).
 */
module.exports = [
    {
        type: 'talkaction',
        words: '/grupo',
        access: 'god',

        onSay(player, words, param) {
            const partes = String(param || '').split(',').map((p) => p.trim()).filter(Boolean);
            if (partes.length < 2) {
                player.sendTextMessage('Grupos: ' + Game.getGroups().map((g) => g.id + ' ' + g.name).join(', ') +
                    '. Uso: /grupo <personaje>, <grupo>');
                return true;
            }
            const r = Game.setPlayerGroup(partes[0], partes[1]);
            player.sendTextMessage(r.ok
                ? partes[0] + ' es ahora del grupo «' + r.group.name + '».'
                : 'No se pudo: ' + r.reason + '.');
            return true;
        }
    },

    {
        type: 'talkaction',
        words: '/montura',
        access: 'gamemaster',

        onSay(player, words, param) {
            const partes = String(param || '').split(',').map((p) => p.trim()).filter(Boolean);
            if (partes.length === 0) {
                player.sendTextMessage('Monturas: ' + Game.getMounts().map((m) => m.id + ' ' + m.name).join(', ') +
                    '. Uso: /montura <id>[, personaje]');
                return true;
            }
            const montura = Game.getMounts().find((m) => m.id === Number(partes[0]) ||
                m.name.toLowerCase() === partes[0].toLowerCase());
            if (!montura) {
                player.sendTextMessage('No existe la montura «' + partes[0] + '».');
                return true;
            }
            const destino = partes[1] ? Game.getPlayerByName(partes[1]) : player;
            if (!destino) {
                player.sendTextMessage('No hay nadie dentro llamado «' + partes[1] + '».');
                return true;
            }
            destino.addMount(montura.id);
            player.sendTextMessage(destino.getName() + ' tiene ahora la montura «' + montura.name + '».');
            return true;
        }
    }
];
