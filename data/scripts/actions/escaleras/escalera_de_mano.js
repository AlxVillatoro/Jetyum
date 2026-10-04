'use strict';

/**
 * ESCALERAS DE MANO: se usan (doble clic, clic derecho o E) para subir a la planta de arriba.
 * En TFS es la lista `ladders` de `actions/scripts/other/teleport.lua`: se sube una planta y se
 * aparece una casilla al sur.
 */

const ESCALERAS = [11009];

module.exports = {
    type: 'action',
    ids: ESCALERAS,

    onUse(player, item) {
        const p = item.getPosition() || player.getPosition();
        const candidatos = [[0, 1], [0, 0], [1, 0], [-1, 0], [0, -1]];
        for (const [dx, dy] of candidatos) {
            if (Game.isWalkable(p.x + dx, p.y + dy, p.z - 1)) {
                player.teleportTo({ x: p.x + dx, y: p.y + dy, z: p.z - 1 });
                return true;
            }
        }
        player.sendTextMessage('Arriba no hay sitio.');
        return true;
    }
};
