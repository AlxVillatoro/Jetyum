'use strict';

/**
 * /equipar <n> y /quitar <ranura>.
 *
 * POR QUE HACEN FALTA. El motor sabe equipar desde hace rondas y el cliente dibuja un panel con las
 * seis ranuras donde va lo que llevas puesto. Pero NO HABIA FORMA DE PONERSE NADA: no existia ningun
 * comando ni se usaba el mensaje de usar objeto, asi que el panel se quedaba vacio para siempre y
 * parecia roto.
 *
 * Un comando de chat es la version honesta y minima de eso mientras no haya un panel donde pulsar la
 * ranura: usa el mismo camino que /pos o /item y no necesita ni un mensaje nuevo del protocolo.
 */

module.exports = [

    {
        type: 'talkaction',
        words: '/equipar',

        onSay(player, words, param, type) {
            const indice = Number(String(param || '').trim());

            if (String(param || '').trim() === '' || Number.isNaN(indice)) {
                player.sendTextMessage('Uso: /equipar <numero de la lista>. Mira /i para verlos.');
                return true;
            }

            const inventario = player.getInventory();
            const entrada = inventario.find((e) => e.index === indice);

            if (!entrada) {
                player.sendTextMessage('No llevas nada en el sitio ' + indice + '. Mira /i.');
                return true;
            }

            const resultado = player.equipItem(indice);

            if (!resultado.ok) {
                // Cada motivo con su mensaje: "no puedes" a secas obliga a adivinar si el objeto no
                // es equipable, si ya lo llevas puesto o si te has equivocado de numero.
                if (resultado.reason === 'notEquippable') {
                    player.sendTextMessage(entrada.name + ' no se puede llevar puesto.');
                } else if (resultado.reason === 'alreadyEquipped') {
                    player.sendTextMessage('Ya te lo has puesto.');
                } else {
                    player.sendTextMessage('No se ha podido equipar (' + resultado.reason + ').');
                }
                return true;
            }

            player.sendTextMessage('Te pones ' + entrada.name + ' en la ranura "' +
                resultado.slot + '".' +
                (resultado.replaced ? ' Guardas lo que llevabas.' : ''));

            return true;
        }
    },

    {
        type: 'talkaction',
        words: '/quitar',

        onSay(player, words, param, type) {
            const ranura = String(param || '').trim().toLowerCase();

            if (ranura === '') {
                const puesto = player.getEquipment();
                const lista = Object.keys(puesto);

                player.sendTextMessage(lista.length
                    ? 'Llevas puesto: ' + lista.map((s) => s + ' (' + puesto[s].nombre + ')').join(', ') +
                      '. Uso: /quitar <ranura>.'
                    : 'No llevas nada puesto.');
                return true;
            }

            const resultado = player.unequipItem(ranura);

            if (!resultado.ok) {
                player.sendTextMessage(resultado.reason === 'emptySlot'
                    ? 'No llevas nada en la ranura "' + ranura + '".'
                    : 'No se ha podido quitar (' + resultado.reason + ').');
                return true;
            }

            player.sendTextMessage('Te quitas lo que llevabas en "' + ranura + '" y vuelve al inventario.');
            return true;
        }
    }

];