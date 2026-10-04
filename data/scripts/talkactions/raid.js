'use strict';

/**
 * /raid — lista las raids o lanza una a mano: `/raid` o `/raid <nombre>`.
 *
 * Es el `/raid` de los god de TFS. Sirve para probar una raid sin esperar a que salga sola.
 */
module.exports = {
    type: 'talkaction',
    words: '/raid',

    onSay(player, words, param) {
        const nombre = String(param || '').trim();
        if (!nombre) {
            const r = Game.getRaids();
            player.sendTextMessage('Raids: ' + (r.registradas.join(', ') || 'ninguna') +
                (r.enMarcha.length ? '  ·  en marcha: ' + r.enMarcha.join(', ') : ''));
            return true;
        }
        const r = Game.startRaid(nombre);
        player.sendTextMessage(r.ok ? 'Empieza la raid «' + nombre + '» (' + r.etapas + ' etapas).' : r.problema);
        return true;
    }
};
