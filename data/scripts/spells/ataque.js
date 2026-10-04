'use strict';

/**
 * HECHIZOS DE ATAQUE (`type: 'spell'`, grupo 'ataque': 2 s de respiro).
 *
 * - `exori flam`, `exori vis`, `exori frigo`, `exori tera`: golpean a TU OBJETIVO (el que estás
 *   atacando, a 3 casillas o menos) con fuego, energía, hielo o tierra (`needTarget`).
 * - `exevo flam hur`: una onda de fuego hacia donde miras (`Game.area.onda`).
 * - `exori`: un tajo alrededor de ti (`Game.area.circulo(1)`), para caballeros.
 *
 * El daño es el de TFS (nivel / 5 + nivel mágico × …). La magia no la para la armadura, y el
 * efecto de cada golpe (una llama, un destello) sale solo: el del elemento.
 */

const MAGOS = ['Sorcerer', 'Druid', 'Master Sorcerer', 'Elder Druid'];
const HECHICEROS = ['Sorcerer', 'Master Sorcerer'];
const DRUIDAS = ['Druid', 'Elder Druid'];
const CABALLEROS = ['Knight', 'Elite Knight'];

/** min/max de TFS: nivel/5 + ml×a + b ... nivel/5 + ml×c + d. */
function danio(player, a, b, c, d) {
    const nivel = player.getLevel();
    const ml = player.getMagicLevel();
    return { min: Math.floor(nivel / 5 + ml * a + b), max: Math.floor(nivel / 5 + ml * c + d) };
}

function golpe(words, name, tipo, vocations, proyectil) {
    return {
        type: 'spell', words: words, name: name, group: 'ataque',
        level: 12, mana: 20, vocations: vocations, needTarget: true, range: 3,
        onCastSpell(player, target) {
            const d = danio(player, 1.4, 8, 2.2, 14);
            Game.doTargetCombat(player, target, { type: tipo, min: d.min, max: d.max, proyectil: proyectil });
            return true;
        }
    };
}

module.exports = [
    golpe('exori flam', 'Flame Strike', 'fire', MAGOS, PROYECTIL.FUEGO),
    golpe('exori vis', 'Energy Strike', 'energy', MAGOS, PROYECTIL.FLECHA_LIGERA),
    golpe('exori frigo', 'Ice Strike', 'ice', DRUIDAS, PROYECTIL.HIELO),
    golpe('exori tera', 'Terra Strike', 'earth', DRUIDAS, PROYECTIL.TIERRA),
    {
        type: 'spell', words: 'exevo flam hur', name: 'Fire Wave', group: 'ataque',
        level: 18, mana: 25, vocations: HECHICEROS,
        onCastSpell(player) {
            const d = danio(player, 1.2, 7, 2, 12);
            const area = Game.area.onda(player.getDirection(), 5);
            Game.doAreaCombat(player, player.getPosition(), area, { type: 'fire', min: d.min, max: d.max,
                effect: EFECTO.ONDA_FUEGO });
            return true;
        }
    },
    {
        type: 'spell', words: 'exori', name: 'Berserk', group: 'ataque',
        level: 8, mana: 30, vocations: CABALLEROS,
        onCastSpell(player) {
            const espada = Math.max(player.getSkillLevel('sword'), player.getSkillLevel('axe'), player.getSkillLevel('club'));
            const nivel = player.getLevel();
            const min = Math.floor(nivel / 5 + espada * 0.5 + 5);
            const max = Math.floor(nivel / 5 + espada * 1.5 + 10);
            const area = Game.area.circulo(1).filter((d) => d.x !== 0 || d.y !== 0);
            Game.doAreaCombat(player, player.getPosition(), area, { type: 'physical', min: min, max: max,
                effect: EFECTO.GOLPE });
            return true;
        }
    }
];
