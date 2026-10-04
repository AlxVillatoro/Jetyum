'use strict';

/**
 * GRUPOS (party), como en Tibia: se reparten la experiencia de lo que matan juntos (a partes
 * iguales entre los que estén cerca, con un 20 % más por ir en grupo), llevan un escudo junto al
 * nombre y tienen su canal de chat («/p texto», o la pestaña «Grupo» de la consola).
 *
 *     /party invitar Nombre     invita (si no tienes grupo, lo creas)
 *     /party unirse Nombre      entras en el grupo de quien te invitó
 *     /party salir              sales (si eras el líder, manda el siguiente)
 *     /party                    cómo está tu grupo
 */

const MOTIVOS = {
    notOnline: 'Ese jugador no está conectado.',
    notLeader: 'Sólo el líder del grupo puede invitar.',
    alreadyInParty: 'Ya está en un grupo.',
    notInvited: 'No te ha invitado nadie con ese nombre.',
    notInParty: 'No estás en ningún grupo.',
    badTarget: 'No puedes invitarte a ti mismo.'
};

module.exports = {
    type: 'talkaction',
    words: '/party',

    onSay(player, words, param) {
        const [orden, ...resto] = String(param || '').trim().split(/\s+/);
        const nombre = resto.join(' ');
        let r;
        switch ((orden || '').toLowerCase()) {
            case 'invitar':
            case 'invite':
                r = player.partyInvite(nombre);
                if (r.ok) {
                    player.sendTextMessage('Has invitado a ' + nombre + '.');
                    const otro = Game.getPlayerByName(nombre);
                    if (otro) {
                        otro.sendTextMessage(player.getName() + ' te invita a su grupo: escribe /party unirse ' +
                            player.getName());
                    }
                }
                break;
            case 'unirse':
            case 'join':
                r = player.partyJoin(nombre);
                break;
            case 'salir':
            case 'leave':
                r = player.partyLeave();
                break;
            default: {
                const grupo = player.getParty();
                player.sendTextMessage(grupo
                    ? 'Tu grupo: ' + grupo.members.join(', ') + ' (manda ' + grupo.leader + ').'
                    : 'No estás en ningún grupo. Usa: /party invitar Nombre, /party unirse Nombre, /party salir.');
                return true;
            }
        }
        if (r && !r.ok) {
            player.sendCancelMessage(MOTIVOS[r.reason] || 'No se pudo.');
        }
        return true;
    }
};
