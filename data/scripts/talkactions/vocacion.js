'use strict';

/**
 * /vocacion — tu vocación y las reglas que te aplica `data/XML/vocations.js`.
 *
 *   /vocacion           dice tu vocación y sus números (vida por nivel, regeneración, daño...)
 *   /vocacion Knight    te cambia a esa vocación (servidor de desarrollo: sirve para los
 *                       personajes creados antes de que hubiera vocaciones, que se quedaron «None»)
 *
 * Como `/item` o `/raid`, es un comando de pruebas: en un servidor de verdad sería de un god.
 */
module.exports = {
    type: 'talkaction',
    words: '/vocacion',

    onSay(player, words, param) {
        const pedida = String(param || '').trim();
        if (pedida) {
            const r = player.setVocation(pedida);
            if (!r.ok) {
                player.sendTextMessage('No existe la vocación «' + pedida + '».');
                return true;
            }
        }
        const v = player.getVocationInfo();
        player.sendTextMessage('Vocación: ' + v.name + ' (nivel ' + player.getLevel() + '). ' +
            'Por nivel: +' + v.gainHp + ' vida, +' + v.gainMana + ' maná, +' + v.gainCap + ' oz. ' +
            'Regenera ' + v.gainHpAmount + ' de vida cada ' + v.gainHpTicks + ' s y ' +
            v.gainManaAmount + ' de maná cada ' + v.gainManaTicks + ' s. ' +
            'Daño cuerpo a cuerpo x' + v.formula.meleeDamage + ', a distancia x' + v.formula.distDamage +
            ', golpe cada ' + v.attackSpeed + ' ms.');
        return true;
    }
};
