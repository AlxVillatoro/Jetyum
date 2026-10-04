'use strict';

/**
 * CAMBIAR MONEDAS con clic derecho, como en Tibia:
 *
 *   - 100 monedas de oro (una pila llena)  → 1 de platino
 *   - 100 de platino (una pila llena)      → 1 de cristal
 *   - 1 de platino (si la pila no llega)   → 100 de oro
 *   - 1 de cristal                         → 100 de platino
 *
 * Vale en la mochila, en el suelo y dentro de un cuerpo o una mochila tirada. Desde la mochila el
 * cambio se junta con tus pilas; si no cabe, no se cambia nada. En el suelo o en un contenedor, una
 * pila entera se convierte allí mismo, y lo que sale de una moneda suelta va a tu mochila.
 *
 * El dinero que llevas es la suma de todas (oro 1, platino 100, cristal 10 000): da igual en qué
 * monedas lo lleves para comprar, y el cambio de un pago lo devuelve el motor.
 */

const ORO = 3031;
const PLATINO = 2152;
const CRISTAL = 2160;

/** Lo que hace cada moneda al usarla, según cuántas hay en la pila. */
function cambioDe(id, cuantas) {
    if (id === ORO) {
        return cuantas >= 100 ? { gasta: 100, da: PLATINO, recibe: 1 } : null;
    }
    if (id === PLATINO) {
        return cuantas >= 100 ? { gasta: 100, da: CRISTAL, recibe: 1 } : { gasta: 1, da: ORO, recibe: 100 };
    }
    if (id === CRISTAL) {
        return { gasta: 1, da: PLATINO, recibe: 100 };
    }
    return null;
}

const NOMBRES = { [ORO]: 'de oro', [PLATINO]: 'de platino', [CRISTAL]: 'de cristal' };

module.exports = {
    type: 'action',
    ids: [ORO, PLATINO, CRISTAL],

    onUse(player, item) {
        const id = item.getId();
        const cambio = cambioDe(id, item.getCount());
        if (!cambio) {
            player.sendCancelMessage('Necesitas 100 monedas de oro juntas para cambiarlas por una de platino.');
            return true;
        }

        if (item.isInInventory()) {
            // Primero se gasta (deja hueco) y luego se da; si no cabe, se devuelve lo gastado.
            item.remove(cambio.gasta);
            const r = player.addItem(cambio.da, cambio.recibe);
            if (!r.ok) {
                player.addItem(id, cambio.gasta);
                player.sendCancelMessage(r.reason === 'tooHeavy' ? 'No puedes con el peso del cambio.' : 'No te cabe el cambio en la mochila.');
                return true;
            }
        } else if (item.getCount() === cambio.gasta) {
            // La pila entera, allí mismo.
            item.transform(cambio.da);
            item.setCount(cambio.recibe);
        } else {
            const r = player.addItem(cambio.da, cambio.recibe);
            if (!r.ok) {
                player.sendCancelMessage(r.reason === 'tooHeavy' ? 'No puedes con el peso del cambio.' : 'No te cabe el cambio en la mochila.');
                return true;
            }
            item.remove(cambio.gasta);
        }

        player.sendTextMessage('Cambias ' + cambio.gasta + ' ' + (cambio.gasta === 1 ? 'moneda ' : 'monedas ') + NOMBRES[id] +
            ' por ' + cambio.recibe + ' ' + (cambio.recibe === 1 ? 'moneda ' : 'monedas ') + NOMBRES[cambio.da] + '.');
        return true;
    }
};
