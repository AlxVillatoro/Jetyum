'use strict';

/**
 * Comandos de los GREMIOS, los de los servidores de TFS 8.60 que los llevan por talkactions:
 *
 *   !createguild <nombre>         funda un gremio (nivel `guildCreateLevel`, 8 si no se dice) y te
 *                                 hace su líder
 *   !joinguild <gremio>           entras en un gremio que te ha invitado (sin nombre: tus invitaciones)
 *   !leaveguild                   dejas tu gremio (el líder no puede: antes pasa el mando o lo disuelve)
 *   !guildinvite <nombre>         invitas a alguien, esté dentro o no (líder y vicelíder)
 *   !guildkick <nombre>           echas a alguien (líder: a cualquiera; vicelíder: a los miembros), o
 *                                 le retiras la invitación
 *   !guildpromote <nombre>        de miembro a vicelíder (líder)
 *   !guilddemote <nombre>         de vicelíder a miembro (líder)
 *   !guildleader <nombre>         le pasas el mando; tú quedas de vicelíder (líder)
 *   !disbandguild                 disuelves el gremio (líder)
 *   !guildmotd [texto]            el mensaje del día: sin texto lo enseña; con «-» lo quita (líder y
 *                                 vicelíder para cambiarlo)
 *   !guildnick [nombre,] apodo    el apodo: el tuyo, o el de otro (líder: de todos; vicelíder: de los
 *                                 miembros). Sin apodo, lo quita.
 *   !guild                        el gremio y quién está conectado, en una ventana
 *
 * Las reglas son del motor, `engine/world/gremios.js`; aquí sólo se llama y se dice el resultado.
 */

/** La fecha de fundación: `2026-10-31`. */
function fecha(ms) {
    const d = new Date(Number(ms) || 0);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Los motivos que comparten casi todos los comandos, en palabras. Devuelve si lo explicó. */
function explicarComun(player, r) {
    switch (r.reason) {
        case 'noDatabase':
            player.sendCancelMessage('Este servidor no tiene gremios (no tiene base de datos).');
            return true;
        case 'noGuild':
            player.sendCancelMessage('No estás en ningún gremio.');
            return true;
        case 'noRights':
            player.sendCancelMessage('No tienes rango para eso en el gremio.');
            return true;
        case 'notFound':
            player.sendCancelMessage('No existe ningún personaje llamado «' + r.name + '».');
            return true;
        case 'self':
            player.sendCancelMessage('No puedes hacerte eso a ti mismo.');
            return true;
        case 'notMember':
            player.sendCancelMessage(r.name + ' no es de tu gremio.');
            return true;
        default:
            player.sendCancelMessage('No se ha podido.');
            return true;
    }
}

/** Un comando que pide un nombre: sin él, dice cómo se usa. */
function conNombre(uso, hacer) {
    return function onSay(player, words, param) {
        const nombre = String(param || '').trim();
        if (!nombre) {
            player.sendCancelMessage('Uso: ' + uso);
            return true;
        }
        hacer(player, nombre);
        return true;
    };
}

module.exports = [
    {
        type: 'talkaction',
        words: '!createguild',

        onSay: conNombre('!createguild <nombre>', (player, nombre) => {
            const r = player.createGuild(nombre);
            if (r.ok) {
                player.sendTextMessage('Has fundado el gremio ' + r.guild.nombre + '. Eres su líder.');
            } else if (r.reason === 'level') {
                player.sendCancelMessage('Necesitas nivel ' + r.level + ' para fundar un gremio.');
            } else if (r.reason === 'alreadyInGuild') {
                player.sendCancelMessage('Ya estás en un gremio.');
            } else if (r.reason === 'badName') {
                player.sendCancelMessage('El nombre de un gremio tiene que tener de ' + r.min + ' a ' + r.max +
                    ' letras y espacios.');
            } else if (r.reason === 'nameTaken') {
                player.sendCancelMessage('Ya existe un gremio llamado ' + r.name + '.');
            } else {
                explicarComun(player, r);
            }
        })
    },

    {
        type: 'talkaction',
        words: '!joinguild',

        onSay(player, words, param) {
            const nombre = String(param || '').trim();
            if (!nombre) {
                const invitaciones = player.getGuildInvites();
                player.sendCancelMessage(invitaciones.length > 0
                    ? 'Te han invitado a: ' + invitaciones.map((g) => g.name).join(', ') + '. Uso: !joinguild <gremio>'
                    : 'No tienes invitaciones a ningún gremio.');
                return true;
            }
            const r = player.joinGuild(nombre);
            if (r.ok) {
                player.sendTextMessage('Has entrado en el gremio ' + r.guild + '.');
            } else if (r.reason === 'alreadyInGuild') {
                player.sendCancelMessage('Ya estás en un gremio.');
            } else if (r.reason === 'notFound') {
                player.sendCancelMessage('No existe ningún gremio llamado «' + r.name + '».');
            } else if (r.reason === 'notInvited') {
                player.sendCancelMessage('No te han invitado al gremio ' + r.name + '.');
            } else {
                explicarComun(player, r);
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: '!leaveguild',

        onSay(player) {
            const r = player.leaveGuild();
            if (r.ok) {
                player.sendTextMessage('Has dejado el gremio ' + r.guild + '.');
            } else if (r.reason === 'leader') {
                player.sendCancelMessage('El líder no puede dejar el gremio: pasa el mando con !guildleader o disuélvelo con !disbandguild.');
            } else {
                explicarComun(player, r);
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: '!guildinvite',

        onSay: conNombre('!guildinvite <nombre>', (player, nombre) => {
            const r = player.inviteToGuild(nombre);
            if (r.ok) {
                player.sendTextMessage(r.name + ' está invitado al gremio ' + r.guild + '.');
            } else if (r.reason === 'alreadyInGuild') {
                player.sendCancelMessage(r.name + ' ya está en un gremio.');
            } else if (r.reason === 'alreadyInvited') {
                player.sendCancelMessage(r.name + ' ya estaba invitado.');
            } else {
                explicarComun(player, r);
            }
        })
    },

    {
        type: 'talkaction',
        words: '!guildkick',

        onSay: conNombre('!guildkick <nombre>', (player, nombre) => {
            const r = player.kickFromGuild(nombre);
            if (r.ok && r.revoked) {
                player.sendTextMessage('Has retirado la invitación de ' + r.name + '.');
            } else if (r.ok) {
                player.sendTextMessage(r.name + ' ya no es del gremio.');
            } else if (r.reason === 'rank') {
                player.sendCancelMessage('No puedes echar a ' + r.name + ': su rango es igual o mayor que el tuyo.');
            } else {
                explicarComun(player, r);
            }
        })
    },

    {
        type: 'talkaction',
        words: '!guildpromote',

        onSay: conNombre('!guildpromote <nombre>', (player, nombre) => {
            const r = player.promoteInGuild(nombre);
            if (r.ok) {
                player.sendTextMessage(r.name + ' es ahora ' + r.rank + '.');
            } else if (r.reason === 'maxRank') {
                player.sendCancelMessage(r.name + ' ya tiene el rango más alto: para hacerle líder, usa !guildleader.');
            } else {
                explicarComun(player, r);
            }
        })
    },

    {
        type: 'talkaction',
        words: '!guilddemote',

        onSay: conNombre('!guilddemote <nombre>', (player, nombre) => {
            const r = player.demoteInGuild(nombre);
            if (r.ok) {
                player.sendTextMessage(r.name + ' es ahora ' + r.rank + '.');
            } else if (r.reason === 'minRank') {
                player.sendCancelMessage(r.name + ' ya tiene el rango más bajo.');
            } else if (r.reason === 'maxRank') {
                player.sendCancelMessage('No puedes degradar al líder.');
            } else {
                explicarComun(player, r);
            }
        })
    },

    {
        type: 'talkaction',
        words: '!guildleader',

        onSay: conNombre('!guildleader <nombre>', (player, nombre) => {
            const r = player.passGuildLeadership(nombre);
            if (r.ok) {
                player.sendTextMessage(r.name + ' es ahora el líder del gremio, y tú su vicelíder.');
            } else {
                explicarComun(player, r);
            }
        })
    },

    {
        type: 'talkaction',
        words: '!disbandguild',

        onSay(player) {
            const r = player.disbandGuild();
            if (r.ok) {
                player.sendTextMessage('Has disuelto el gremio ' + r.guild + '.');
            } else {
                explicarComun(player, r);
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: '!guildmotd',

        onSay(player, words, param) {
            const texto = String(param || '').trim();
            if (!texto) {
                const gremio = player.getGuild();
                if (!gremio) {
                    player.sendCancelMessage('No estás en ningún gremio.');
                } else if (gremio.getMotd()) {
                    player.sendTextMessage('Mensaje del día del gremio: ' + gremio.getMotd());
                } else {
                    player.sendTextMessage('El gremio no tiene mensaje del día.');
                }
                return true;
            }
            const r = player.changeGuildMotd(texto === '-' ? '' : texto);
            if (r.ok) {
                player.sendTextMessage(r.motd ? 'Has cambiado el mensaje del día del gremio.' : 'Has quitado el mensaje del día del gremio.');
            } else {
                explicarComun(player, r);
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: '!guildnick',

        onSay(player, words, param) {
            const texto = String(param || '').trim();
            // «nombre, apodo»; sin coma, el propio apodo. (Los nombres llevan espacios: sin la coma no
            // se sabría dónde acaba el nombre.)
            const coma = texto.indexOf(',');
            const nombre = coma >= 0 ? texto.slice(0, coma).trim() : '';
            const apodo = coma >= 0 ? texto.slice(coma + 1).trim() : texto;
            const r = player.changeGuildNick(nombre, apodo);
            if (r.ok && r.self) {
                player.sendTextMessage(r.nick ? 'Tu apodo en el gremio es ahora «' + r.nick + '».' : 'Has quitado tu apodo del gremio.');
            } else if (r.ok) {
                player.sendTextMessage(r.nick ? r.name + ' tiene ahora el apodo «' + r.nick + '».' : 'Has quitado el apodo de ' + r.name + '.');
            } else if (r.reason === 'badNick') {
                player.sendCancelMessage('Un apodo puede tener hasta ' + r.max + ' letras, cifras y espacios.');
            } else {
                explicarComun(player, r);
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: '!guild',

        onSay(player) {
            const r = player.getGuildInfo();
            if (!r.ok) {
                explicarComun(player, r);
                return true;
            }
            const g = r.guild;
            const lineas = ['Fundado el ' + fecha(g.fundado) + '.'];
            lineas.push(g.motd ? 'Mensaje del día: ' + g.motd : 'El gremio no tiene mensaje del día.');
            lineas.push('Miembros: ' + r.miembros.length + '. Conectados: ' + r.conectados.length + '.');
            lineas.push('');
            // «Nombre · Rango · apodo»: con « · » cada trozo se traduce por su cuenta (el rango).
            r.conectados.forEach((m) => {
                lineas.push(m.nombre + ' · ' + m.rango + (m.apodo ? ' · ' + m.apodo : ''));
            });
            player.showTextDialog({ titulo: 'Gremio ' + g.nombre, texto: lineas.join('\n') });
            return true;
        }
    }
];
