'use strict';

/**
 * Comandos de MODERACIÓN del personal (data/XML/groups.js: `gamemaster` o más). Para quien no tiene
 * el grupo, no existen: se dicen en voz alta como cualquier frase, igual que `/grupo`.
 *
 *   /ban <personaje>[, días[, motivo]]     suspende su CUENTA. 0 o sin días, los de `banDays` (7);
 *                                          negativo, para siempre. Si está dentro, sale.
 *   /unban <personaje>                     levanta la suspensión de su cuenta
 *   /ipban <personaje>[, días[, motivo]]   suspende su IP (la de su conexión, o la última desde la que entró)
 *   /namelock <personaje>[, motivo]        no puede volver a entrar hasta que se le cambie el nombre
 *   /kick <personaje>                      le saca del juego
 *   /mute <personaje>[, minutos]           no puede hablar en voz alta ni en los canales (5 minutos
 *                                          si no se dice)
 *   /unmute <personaje>                    le devuelve la palabra
 *   /baninfo <personaje>                   lo que pesa sobre él y su cuenta, en una ventana
 *
 * A alguien del personal sólo le castiga quien tenga un grupo MAYOR. Las reglas y lo que se guarda
 * son del motor, `engine/world/castigos.js`; aquí sólo se llama y se dice el resultado.
 */

/** `nombre, a, b, c` → ['nombre', 'a', 'b, c']: el motivo puede llevar comas. */
function partir(param, cuantas) {
    const partes = String(param || '').split(',');
    const fijas = partes.slice(0, cuantas - 1).map((p) => p.trim());
    const resto = partes.slice(cuantas - 1).join(',').trim();
    return fijas.concat(partes.length >= cuantas ? [resto] : []);
}

/** La fecha en que acaba una suspensión: `2026-10-31 18:05`. */
function fecha(ms) {
    const d = new Date(Number(ms) || 0);
    const dos = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + ' ' +
        dos(d.getHours()) + ':' + dos(d.getMinutes());
}

/** Los motivos que comparten los comandos, en palabras. */
function explicar(player, r) {
    switch (r.reason) {
        case 'noDatabase':
            player.sendCancelMessage('Este servidor no guarda castigos (no tiene base de datos).');
            break;
        case 'notFound':
            player.sendCancelMessage('No existe ningún personaje llamado «' + r.name + '».');
            break;
        case 'notOnline':
            player.sendCancelMessage(r.name + ' no está conectado.');
            break;
        case 'self':
            player.sendCancelMessage('No puedes castigarte a ti mismo.');
            break;
        case 'protected':
            player.sendCancelMessage('No puedes castigar a ' + r.name + ': es del personal y de un grupo igual o mayor que el tuyo.');
            break;
        case 'badDays':
            player.sendCancelMessage('Los días tienen que ser un número.');
            break;
        case 'badMinutes':
            player.sendCancelMessage('Los minutos tienen que ser un número mayor que cero.');
            break;
        case 'noIp':
            player.sendCancelMessage('No se sabe desde qué IP juega ' + r.name + '.');
            break;
        case 'notBanned':
            player.sendCancelMessage('La cuenta de ' + r.name + ' no está suspendida.');
            break;
        case 'notMuted':
            player.sendCancelMessage(r.name + ' no está silenciado.');
            break;
        default:
            player.sendCancelMessage('No se ha podido.');
    }
}

/** Un comando de GM que pide un nombre: sin él, dice cómo se usa. */
function comando(words, uso, hacer) {
    return {
        type: 'talkaction',
        words: words,
        access: 'gamemaster',

        onSay(player, dichas, param) {
            if (!String(param || '').trim()) {
                player.sendCancelMessage('Uso: ' + uso);
                return true;
            }
            hacer(player, param);
            return true;
        }
    };
}

/** Lo que se le dice al GM de una suspensión hecha. */
function suspendida(player, que, r) {
    player.sendTextMessage(r.permanent
        ? que + ' de ' + r.name + ' queda suspendida para siempre.'
        : que + ' de ' + r.name + ' queda suspendida hasta el ' + fecha(r.expiresAt) + '.');
}

module.exports = [
    comando('/ban', '/ban <personaje>[, días[, motivo]]', (player, param) => {
        const [nombre, dias, motivo] = partir(param, 3);
        const r = player.banPlayer(nombre, dias, motivo);
        if (r.ok) {
            suspendida(player, 'La cuenta', r);
        } else {
            explicar(player, r);
        }
    }),

    comando('/unban', '/unban <personaje>', (player, param) => {
        const r = player.unbanPlayer(String(param).trim());
        if (r.ok) {
            player.sendTextMessage('La cuenta de ' + r.name + ' ya no está suspendida.');
        } else {
            explicar(player, r);
        }
    }),

    comando('/ipban', '/ipban <personaje>[, días[, motivo]]', (player, param) => {
        const [nombre, dias, motivo] = partir(param, 3);
        const r = player.ipBanPlayer(nombre, dias, motivo);
        if (r.ok) {
            suspendida(player, 'La IP', r);
        } else {
            explicar(player, r);
        }
    }),

    comando('/namelock', '/namelock <personaje>[, motivo]', (player, param) => {
        const [nombre, motivo] = partir(param, 2);
        const r = player.namelockPlayer(nombre, motivo);
        if (r.ok) {
            player.sendTextMessage(r.name + ' tiene el nombre bloqueado: no entrará hasta que se lo cambien.');
        } else {
            explicar(player, r);
        }
    }),

    comando('/kick', '/kick <personaje>', (player, param) => {
        const r = player.kickPlayer(String(param).trim());
        if (r.ok) {
            player.sendTextMessage(r.name + ' está fuera del juego.');
        } else {
            explicar(player, r);
        }
    }),

    comando('/mute', '/mute <personaje>[, minutos]', (player, param) => {
        const [nombre, minutos] = partir(param, 2);
        const r = player.mutePlayer(nombre, minutos);
        if (r.ok) {
            player.sendTextMessage(r.name + ' está silenciado durante ' + r.minutes + ' minutos.');
        } else {
            explicar(player, r);
        }
    }),

    comando('/unmute', '/unmute <personaje>', (player, param) => {
        const r = player.unmutePlayer(String(param).trim());
        if (r.ok) {
            player.sendTextMessage(r.name + ' ya puede hablar.');
        } else {
            explicar(player, r);
        }
    }),

    comando('/baninfo', '/baninfo <personaje>', (player, param) => {
        const r = player.getBanInfo(String(param).trim());
        if (r.ok) {
            player.showTextDialog({ titulo: 'Castigos de ' + r.name, texto: r.text });
        } else {
            explicar(player, r);
        }
    })
];
