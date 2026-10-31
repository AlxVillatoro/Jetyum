'use strict';

/**
 * Comando `/atributos` (o `/attributes`): los atributos del jugador (engine/world/atributos.js),
 * lo mismo que la ventana «Atributos» del cliente, pero escrito.
 *
 *     /atributos                  lo que tienes, lo que da cada punto, de dónde salieron tus puntos
 *                                 (logros.js) y los que quedan por repartir
 *     /atributos fuerza 3         pone 3 puntos en fuerza (sin número, uno)
 *     /atributos reiniciar        los recupera todos para repartirlos de nuevo (cuesta `resetCost`)
 *
 * Los nombres valen en español y en inglés (strength, dexterity, intelligence, vitality, energy).
 */

const NOMBRES = {
    fuerza: 'strength', strength: 'strength', str: 'strength',
    destreza: 'dexterity', dexterity: 'dexterity', dex: 'dexterity',
    inteligencia: 'intelligence', intelligence: 'intelligence', int: 'intelligence',
    vitalidad: 'vitality', vitality: 'vitality', vit: 'vitality',
    energia: 'energy', 'energía': 'energy', energy: 'energy', ene: 'energy'
};

const EN_ESPANOL = { strength: 'fuerza', dexterity: 'destreza', intelligence: 'inteligencia', vitality: 'vitalidad', energy: 'energía' };

function resumen(player) {
    const a = player.getAttributes();
    const p = (Game.getAttributeConfig && Game.getAttributeConfig()) || null;
    const por = (atributo, clave) => (p ? p[atributo][clave] : 0);
    const n = (k) => a[k] || 0;
    player.sendTextMessage('Fuerza ' + n('strength') + ': +' + n('strength') * por('strength', 'meleeDamage') +
        '% de daño cuerpo a cuerpo y +' + n('strength') * por('strength', 'capacity') + ' oz de capacidad.');
    player.sendTextMessage('Destreza ' + n('dexterity') + ': +' + n('dexterity') * por('dexterity', 'distanceDamage') +
        '% de daño a distancia.');
    player.sendTextMessage('Inteligencia ' + n('intelligence') + ': +' + n('intelligence') * por('intelligence', 'magicDamage') +
        '% de daño mágico y +' + n('intelligence') * por('intelligence', 'healing') + '% de curación.');
    player.sendTextMessage('Vitalidad ' + n('vitality') + ': +' + n('vitality') * por('vitality', 'health') + ' de vida máxima.');
    player.sendTextMessage('Energía ' + n('energy') + ': +' + n('energy') * por('energy', 'mana') + ' de maná máximo.');
    const f = player.getAttributeSources();
    player.sendTextMessage('Puntos ganados: ' + f.level + ' por nivel, ' + f.walking + ' caminando, ' + f.exploring +
        ' explorando, ' + f.magic + ' con magia, ' + f.activeTime + ' por tiempo de juego y ' + f.hunting + ' cazando.');
    player.sendTextMessage('Puntos por repartir: ' + player.getAttributePoints() +
        '. Escribe /atributos fuerza 1 (o destreza, inteligencia, vitalidad, energía) o usa la ventana Atributos.');
}

function onSay(player, words, param) {
    const partes = String(param || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (partes.length === 0) {
        resumen(player);
        return true;
    }
    if (partes[0] === 'reiniciar' || partes[0] === 'reset') {
        const r = player.resetAttributes();
        if (!r.ok) {
            player.sendCancelMessage(r.razon === 'dinero' ? 'Reiniciar los atributos cuesta ' + r.coste + ' de oro.'
                : r.razon === 'desactivados' ? 'Los atributos están desactivados en este mundo.'
                    : 'No tienes puntos de atributo repartidos.');
            return true;
        }
        player.sendTextMessage(r.coste > 0
            ? 'Has recuperado ' + r.devueltos + ' punto(s) de atributo por ' + r.coste + ' de oro.'
            : 'Has recuperado ' + r.devueltos + ' punto(s) de atributo.');
        return true;
    }
    const atributo = NOMBRES[partes[0]];
    if (!atributo) {
        player.sendCancelMessage('Ese atributo no existe.');
        return true;
    }
    const r = player.addAttributePoints(atributo, partes[1] === undefined ? 1 : Number(partes[1]));
    if (!r.ok) {
        player.sendCancelMessage(r.razon === 'sinPuntos' ? 'No tienes puntos de atributo por repartir.'
            : r.razon === 'tope' ? 'Ese atributo ya está en el tope (' + r.tope + ').'
                : r.razon === 'desactivados' ? 'Los atributos están desactivados en este mundo.'
                    : 'Esa cantidad no vale.');
        return true;
    }
    player.sendTextMessage('Has puesto ' + r.puestos + ' punto(s) en ' + EN_ESPANOL[atributo] + '. Te quedan ' + r.libres + '.');
    return true;
}

module.exports = [
    { type: 'talkaction', words: '/atributos', onSay },
    { type: 'talkaction', words: '/attributes', onSay }
];
