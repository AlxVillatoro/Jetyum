'use strict';

/**
 * /ir — viajar a un lugar del mapa por su nombre (los «waypoints»): `/ir` los lista y
 * `/ir templo` lleva allí. Es el `/goto` de TFS, pensado para probar el mapa.
 */
module.exports = {
    type: 'talkaction',
    words: '/ir',

    onSay(player, words, param) {
        const nombre = String(param || '').trim();
        const lugares = Game.getWaypointNames ? Game.getWaypointNames() : [];
        if (!nombre) {
            player.sendTextMessage('Lugares: ' + (lugares.join(', ') || 'ninguno') + '. Uso: /ir <lugar>');
            return true;
        }
        const destino = Game.getWaypoint(nombre === 'templo' ? 'temple' : nombre);
        if (!destino) {
            player.sendTextMessage('No hay ningún lugar llamado «' + nombre + '». Lugares: ' + lugares.join(', '));
            return true;
        }
        if (!player.teleportTo(destino)) {
            player.sendTextMessage('No se puede ir a ' + nombre + ' ahora.');
            return true;
        }
        player.sendTextMessage('Estás en ' + nombre + ' ' + destino + '.');
        return true;
    }
};
