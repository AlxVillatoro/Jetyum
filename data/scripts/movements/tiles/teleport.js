'use strict';

/**
 * Portal: lleva a quien lo pisa a su DESTINO.
 *
 * El destino es un atributo del objeto en el mapa, `teleportDestination: {x, y, z}`, que es como
 * lo guarda Tibia (el «dest» de un teleport en RME). Se pone desde el editor de mapas, en las
 * propiedades del objeto o con el compuesto «Teleport». Un portal sin destino solo avisa.
 *
 * El tipo de evento lo declara `event`, y de él sale el nombre del handler:
 * `stepin` busca `onStepIn`. En TFS es igual, y así un mismo archivo puede
 * declarar varios tipos sin nombres inventados.
 *
 * Ojo con la firma, que CAMBIA según el tipo de evento (está verificado en el
 * código de TFS, no es una suposición):
 *
 *     stepin / stepout    (creature, item, position, fromPosition)
 *     equip / deequip     (player, item, slot, isCheck)
 *     additem / removeitem(moveitem, tileitem, position)
 *
 * Pasar los argumentos de un tipo a otro produce un handler que recibe basura
 * sin dar ningún error, así que conviene tenerlo presente.
 */

module.exports = {
    type: 'movement',
    event: 'stepin',
    ids: [1387],

    onStepIn(creature, item, position, fromPosition) {
        if (!creature) {
            return false;
        }

        const destino = item ? item.getAttribute('teleportDestination') : undefined;

        // Los monstruos también pisan portales, y su envoltorio no habla ni se teletransporta.
        if (!creature.isPlayer()) {
            return true;
        }

        if (destino && creature.teleportTo && Number.isFinite(Number(destino.x))) {
            if (creature.teleportTo({ x: Number(destino.x), y: Number(destino.y), z: Number(destino.z) })) {
                creature.sendTextMessage('Un portal te absorbe.');
                return true;
            }
        }

        creature.sendTextMessage('Un portal te absorbe.');
        return true;
    }
};
