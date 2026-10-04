'use strict';

/**
 * HECHIZOS DE CURACIÓN (`type: 'spell'`, grupo 'curacion': 1 s de respiro entre uno y otro).
 *
 * El motor comprueba vocación, nivel, maná y el respiro, y gasta el maná (que sube el nivel
 * mágico). Aquí sólo está lo que hace cada uno: la fórmula de TFS (nivel / 5 + nivel mágico × …),
 * por el `formula.magHealingDamage` de la vocación.
 */

const MAGOS = ['Sorcerer', 'Druid', 'Master Sorcerer', 'Elder Druid'];
const PALADINES = ['Paladin', 'Royal Paladin'];

/** La curación de TFS: min = nivel/5 + ml×a + b, max = nivel/5 + ml×c + d. */
function curar(player, a, b, c, d) {
    const voc = player.getVocationInfo();
    const factor = (voc && voc.formula && voc.formula.magHealingDamage) || 1;
    const nivel = player.getLevel();
    const ml = player.getMagicLevel();
    const min = Math.floor((nivel / 5 + ml * a + b) * factor);
    const max = Math.floor((nivel / 5 + ml * c + d) * factor);
    Game.doTargetCombat(player, player, { type: 'healing', min: min, max: max });
    return true;
}

module.exports = [
    {
        type: 'spell', words: 'exura', name: 'Light Healing', group: 'curacion',
        level: 1, mana: 20,
        onCastSpell(player) {
            return curar(player, 1.4, 8, 1.795, 11);
        }
    },
    {
        type: 'spell', words: 'exura gran', name: 'Intense Healing', group: 'curacion',
        level: 8, mana: 70, vocations: MAGOS.concat(PALADINES),
        onCastSpell(player) {
            return curar(player, 3.184, 20, 5.59, 35);
        }
    },
    {
        type: 'spell', words: 'exura vita', name: 'Ultimate Healing', group: 'curacion',
        level: 30, mana: 160, vocations: MAGOS,
        onCastSpell(player) {
            return curar(player, 7.22, 44, 12.79, 79);
        }
    }
];
