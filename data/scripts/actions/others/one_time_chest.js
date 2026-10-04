'use strict';

/**
 * Cofre de un solo uso: recuerda que ya lo abriste, y comprueba si el premio cabría.
 *
 * Va sobre el 11111, un cofre del OpenTibia Sprite Pack que el mapa no usa: ponlo donde
 * quieras un cofre de premio. Antes iba sobre la mochila (2412), cuando era el único
 * contenedor del catálogo, y eso impedía abrir una mochila tirada en el suelo. Los cofres de
 * las casas (11113) son contenedores normales y no pasan por aquí.
 *
 * Se abre una vez por jugador (lo recuerda con un storage, que se guarda con el personaje) y
 * DA EL PREMIO con `player.addItem`, que comprueba que lleve mochila, que le quepa y que pueda
 * con el peso. Si no le cabe, el cofre no se marca como abierto: puede volver cuando haga sitio.
 *
 * La firma es la de The Forgotten Server, con sus seis argumentos:
 *
 *     onUse(player, item, fromPosition, target, toPosition, isHotkey)
 */

/** El premio que declara el cofre. Es un id del catálogo, no un número inventado. */
const PREMIO = 2400;   // magic sword

/**
 * La clave del almacén. Se escribe una vez y se usa en los dos sitios: con la cadena
 * repetida a mano, un cambio en una línea y no en la otra convertiría el cofre en un pozo
 * sin fondo que da premio cada vez.
 */
const CLAVE = 'cofre:mochila_abierto';

module.exports = {
    type: 'action',

    ids: [11111],   // cofre del pack que el mapa no usa

    onUse(player, item, fromPosition, target, toPosition, isHotkey) {
        if (player.getStorageValue(CLAVE) !== null) {
            player.sendTextMessage('El cofre esta vacio: ya lo abriste.');
            return true;
        }

        const r = player.addItem(PREMIO, 1);
        if (!r.ok) {
            const motivos = {
                noContainer: 'No llevas mochila donde guardarlo.',
                backpackFull: 'Tu mochila esta llena: haz sitio y vuelve.',
                tooHeavy: 'Pesa demasiado para ti: suelta algo y vuelve.'
            };
            player.sendCancelMessage('Dentro hay ' + Game.getItemName(PREMIO) + '. ' + (motivos[r.reason] || ''));
            return true;
        }

        player.setStorageValue(CLAVE, 1);
        player.sendTextMessage('Abres el cofre y encuentras ' + Game.getItemName(PREMIO) + '.');
        player.sendMagicEffect(EFECTO.MAGIA_AZUL);
        return true;
    }
};
