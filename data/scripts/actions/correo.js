'use strict';

/**
 * EL CORREO: escribir y leer cartas y etiquetas, y mandarlas usándolas sobre un buzón.
 *
 *   - La CARTA (21041) y la ETIQUETA (21045) se usan y se escriben (una ventana de texto): en la
 *     primera línea el nombre de quien la recibe y, si se quiere, en la segunda la ciudad. Lo
 *     escrito se ve al mirarlas («Lees: ...»).
 *   - La carta usada SOBRE un buzón (21040) se manda, igual que si se echa en él arrastrándola.
 *     El paquete se manda arrastrándolo al buzón (usarlo lo abre, como cualquier contenedor).
 *   - La CARTA SELLADA (21042), la que llega, se usa y se lee.
 *
 * Las reglas de mandar (a quién, a qué ciudad, qué no se puede) están en el motor:
 * `engine/world/correo.js`. Los objetos los da de alta `tools/generar-correo.mjs`.
 */

const BUZON = 21040;
const CARTA = 21041;
const CARTA_SELLADA = 21042;
const ETIQUETA = 21045;

/** Lo que se ve al mirar algo escrito, en una línea. */
function loQueSeLee(texto) {
    const plano = String(texto || '').trim().replace(/\s*\r?\n\s*/g, ' / ');
    return plano ? 'Lees: «' + plano + '»' : 'No hay nada escrito.';
}

module.exports = [
    {
        type: 'action',
        ids: [CARTA, ETIQUETA],

        onUse(player, item, fromPosition, target, toPosition) {
            // Sobre un buzón: se manda (la etiqueta sola no: va dentro de un paquete).
            if (target) {
                if (target.getId() !== BUZON) {
                    return false;
                }
                if (item.getId() !== CARTA) {
                    player.sendCancelMessage('Eso no se puede enviar por correo: mete la etiqueta en un paquete.');
                    return true;
                }
                player.sendMail(item);
                return true;
            }
            // Si no, se escribe. Lo guardado se queda en el objeto, si sigue siendo suyo.
            player.showTextDialog({
                titulo: item.getName(),
                texto: item.getAttribute('text') || '',
                editable: true,
                maximo: Number(item.getAttribute('maxTextLen')) || 500,
                // El objeto que se escribe: con él, los `onTextEdit` de los scripts se enteran.
                item: item
            }, (texto) => {
                if (item.setAttribute('text', texto)) {
                    item.setAttribute('description', loQueSeLee(texto));
                }
            });
            return true;
        }
    },

    {
        type: 'action',
        ids: [CARTA_SELLADA],

        onUse(player, item) {
            const remitente = item.getAttribute('sender');
            player.showTextDialog({
                titulo: remitente ? 'Carta de ' + remitente : item.getName(),
                texto: item.getAttribute('text') || ''
            });
            return true;
        }
    }
];
