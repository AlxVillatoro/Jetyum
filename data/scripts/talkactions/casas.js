'use strict';

/**
 * Comandos de las CASAS, los de The Forgotten Server 8.60:
 *
 *   !buyhouse            compra la casa de la puerta que tienes DELANTE, con el saldo del banco
 *   !leavehouse          deja la casa en la que estás, si es tuya (lo de dentro va a tu depósito)
 *   aleta sio            la lista de INVITADOS de la casa en la que estás (el dueño y los subdueños)
 *   aleta som            la lista de SUBDUEÑOS (sólo el dueño)
 *   aleta grav           la lista de la PUERTA que tienes delante (sólo el dueño)
 *   alana sio "nombre    echa a alguien de la casa en la que estás; sin nombre, te echas a ti
 *
 * Las listas se editan en una ventana de texto: un nombre por línea, `*` vale cualquier cosa
 * (`*Pepe*`), `!` delante excluye y `#` empieza un comentario. Al guardar, quien se queda sin acceso
 * sale a la puerta.
 *
 * `!sellhouse` (vender la casa a otro jugador) NO ESTÁ: en TFS hace falta un comercio entre los dos
 * con un documento de la casa, y aquí la casa sólo se compra libre y se deja.
 *
 * Las reglas (el precio, el nivel, el alquiler, quién entra) son del motor, `engine/world/casas.js`;
 * aquí sólo se llama y se dice el resultado.
 */

/** «1000» -> «1000»; para que los números se lean igual en todos los mensajes. */
function oro(n) {
    return String(Math.trunc(Number(n) || 0));
}

/** Los motivos de no poder editar una lista, en palabras. */
function explicarLista(player, r) {
    if (r.reason === 'notInside') {
        player.sendCancelMessage('No estás dentro de una casa.');
    } else if (r.reason === 'noDoor') {
        player.sendCancelMessage('Tienes que estar mirando una puerta de tu casa.');
    } else {
        player.sendCancelMessage('No puedes editar esa lista.');
    }
}

module.exports = [
    {
        type: 'talkaction',
        words: '!buyhouse',

        onSay(player) {
            const r = player.buyHouse();
            if (r.ok) {
                player.sendTextMessage('Has comprado la casa «' + r.house.name + '» por ' + oro(r.price) +
                    ' de oro. Ten en el banco el dinero del alquiler.');
                return true;
            }
            switch (r.reason) {
                case 'noDoor':
                    player.sendCancelMessage('Tienes que estar mirando la puerta de la casa que quieres comprar.');
                    break;
                case 'level':
                    player.sendCancelMessage('Necesitas nivel ' + r.level + ' para comprar una casa.');
                    break;
                case 'alreadyOwner':
                    player.sendCancelMessage('Ya eres dueño de una casa.');
                    break;
                case 'hasOwner':
                    player.sendCancelMessage('Esa casa ya tiene dueño.');
                    break;
                case 'noMoney':
                    player.sendCancelMessage('No tienes dinero suficiente en el banco: la casa cuesta ' +
                        oro(r.price) + ' de oro.');
                    break;
                default:
                    player.sendCancelMessage('No puedes comprar esa casa.');
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: '!leavehouse',

        onSay(player) {
            const r = player.leaveHouse();
            if (r.ok) {
                player.sendTextMessage('Has dejado la casa «' + r.house.name + '». Lo que había dentro está en tu depósito.');
            } else if (r.reason === 'notOwner') {
                player.sendCancelMessage('No eres el dueño de esta casa.');
            } else {
                player.sendCancelMessage('No estás dentro de una casa.');
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: 'aleta sio',

        onSay(player) {
            const r = player.editHouseList('guests');
            if (!r.ok) {
                explicarLista(player, r);
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: 'aleta som',

        onSay(player) {
            const r = player.editHouseList('subowners');
            if (!r.ok) {
                explicarLista(player, r);
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: 'aleta grav',

        onSay(player) {
            const r = player.editHouseList('door');
            if (!r.ok) {
                explicarLista(player, r);
            }
            return true;
        }
    },

    {
        type: 'talkaction',
        words: 'alana sio',

        onSay(player, words, param) {
            const r = player.kickFromHouse(param);
            if (r.ok) {
                if (r.name !== player.getName()) {
                    player.sendTextMessage(r.name + ' ya está fuera de la casa.');
                }
                return true;
            }
            if (r.reason === 'notInside') {
                player.sendCancelMessage('No estás dentro de una casa.');
            } else if (r.reason === 'notFound') {
                player.sendCancelMessage('No hay nadie llamado «' + r.name + '» en esta casa.');
            } else {
                player.sendCancelMessage('No puedes echar a ' + r.name + ' de esta casa.');
            }
            return true;
        }
    }
];
