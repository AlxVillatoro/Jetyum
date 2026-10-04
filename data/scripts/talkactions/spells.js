'use strict';

/**
 * `/spells`: los hechizos de TU vocación, en un diálogo (el `popupFYI` de Tibia), ordenados por
 * nivel. Los que todavía no puedes lanzar por nivel salen marcados.
 *
 *     /spells
 */

const GRUPOS = { ataque: 'Ataque', curacion: 'Curación', apoyo: 'Apoyo' };

module.exports = {
    type: 'talkaction',
    words: '/spells',

    onSay(player) {
        const hechizos = player.getSpells();
        const v = player.getVocation();
        const vocacion = v && v !== 'None' ? v : 'sin vocación';

        if (hechizos.length === 0) {
            player.popupFYI('Tu vocación (' + vocacion + ') no tiene hechizos.');
            return true;
        }

        const nivel = player.getLevel();
        const lineas = hechizos.map((h) =>
            (h.level > nivel ? '✗ ' : '') + h.words + ' — ' + h.name +
            ' (' + (GRUPOS[h.group] || h.group) + '): nivel ' + h.level + ', maná ' + h.mana +
            (h.soul ? ', almas ' + h.soul : ''));

        player.sendPopup((vocacion === 'sin vocación' ? 'Hechizos (sin vocación)' : 'Hechizos de ' + vocacion),
            'Tienes nivel ' + nivel + '. Los marcados con ✗ necesitan más nivel.\n\n' + lineas.join('\n'));
        return true;
    }
};
