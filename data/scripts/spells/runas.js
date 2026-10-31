'use strict';

/**
 * LAS RUNAS y los HECHIZOS QUE LAS CONJURAN, como en Tibia 8.60.
 *
 * UNA RUNA (`type: 'rune'`) se usa SOBRE algo —una criatura o una casilla— con «usar con»: clic
 * derecho en la runa y luego en el objetivo, o desde una hotkey (sobre tu objetivo, o sobre ti si es
 * de curar). El motor comprueba nivel, NIVEL MÁGICO, enfriamiento, alcance (7) y que se vea el sitio,
 * y gasta una carga (engine/scripting/registry.js, `useRune`). Las ofensivas no se usan desde una zona
 * de protección ni alcanzan a nadie que esté en una.
 *
 * UN CONJURO (`type: 'spell'` con `conjurar`) convierte una RUNA EN BLANCO que lleves en esa runa, con
 * sus cargas; gasta maná y almas.
 *
 * Los objetos (runas en blanco, runas y campos) son los 21000-21025 de items.xml
 * (tools/generar-runas.mjs). Las fórmulas son las de TFS: nivel / 5 + nivel mágico × a + b.
 */

const RUNA = {
    BLANCA: 21000,
    SUDDEN_DEATH: 21001,
    ULTIMATE_HEALING: 21002,
    INTENSE_HEALING: 21003,
    HEAVY_MAGIC_MISSILE: 21004,
    LIGHT_MAGIC_MISSILE: 21005,
    GREAT_FIREBALL: 21006,
    EXPLOSION: 21007,
    FIRE_FIELD: 21008,
    FIRE_BOMB: 21009,
    ENERGY_FIELD: 21010,
    POISON_FIELD: 21011,
    MAGIC_WALL: 21012,
    DESTROY_FIELD: 21013,
    PARALYZE: 21014
};

const CAMPO = { FUEGO: 21020, ENERGIA: 21023, VENENO: 21024, MURO: 21025 };

const HECHICEROS = ['Sorcerer', 'Master Sorcerer'];
const DRUIDAS = ['Druid', 'Elder Druid'];
const MAGOS = HECHICEROS.concat(DRUIDAS);
const PALADINES = ['Paladin', 'Royal Paladin'];

/** min/max de TFS: nivel/5 + ml×a + b ... nivel/5 + ml×c + d. */
function formula(player, a, b, c, d) {
    const nivel = player.getLevel();
    const ml = player.getMagicLevel();
    return { min: Math.floor(nivel / 5 + ml * a + b), max: Math.floor(nivel / 5 + ml * c + d) };
}

/** Una runa que golpea a UNA criatura, con su proyectil. */
function proyectil(id, name, level, magicLevel, tipo, p, a, b, c, d) {
    return {
        type: 'rune', id, name, level, magicLevel, needTarget: true, aggressive: true,
        onCastSpell(player, variant) {
            const f = formula(player, a, b, c, d);
            Game.doTargetCombat(player, variant.creature, { type: tipo, min: f.min, max: f.max, proyectil: p });
            return true;
        }
    };
}

/** Una runa que cura a una criatura (a ti, si la usas sobre ti). */
function curacion(id, name, level, magicLevel, a, b, c, d) {
    return {
        type: 'rune', id, name, level, magicLevel, needTarget: true, aggressive: false,
        onCastSpell(player, variant) {
            const f = formula(player, a, b, c, d);
            Game.doTargetCombat(player, variant.creature, { type: 'healing', min: f.min, max: f.max });
            return true;
        }
    };
}

/** Una runa de ÁREA: golpea todo lo que haya alrededor de la casilla elegida. */
function area(id, name, level, magicLevel, tipo, forma, p, a, b, c, d) {
    return {
        type: 'rune', id, name, level, magicLevel, aggressive: true,
        onCastSpell(player, variant) {
            const f = formula(player, a, b, c, d);
            if (p) {
                Game.sendDistanceEffect(player.getPosition(), variant.position, p);
            }
            Game.doAreaCombat(player, variant.position, forma(), { type: tipo, min: f.min, max: f.max });
            return true;
        }
    };
}

/** Una runa que deja CAMPOS en las casillas de una forma (1 casilla, o el cuadrado de una bomba). */
function campo(id, name, level, magicLevel, campoId, forma) {
    return {
        type: 'rune', id, name, level, magicLevel, aggressive: true,
        onCastSpell(player, variant) {
            let creados = 0;
            (forma ? forma() : [{ x: 0, y: 0 }]).forEach((d) => {
                const pos = { x: variant.position.x + d.x, y: variant.position.y + d.y, z: variant.position.z };
                if (Game.createField(campoId, pos, player)) {
                    creados += 1;
                }
            });
            if (creados === 0) {
                player.sendCancelMessage('Ahí no cabe.');
                return false;
            }
            return true;
        }
    };
}

/** El conjuro de una runa: la runa en blanco que lleves se convierte en ella. */
function conjuro(words, name, level, mana, soul, vocations, runa, cargas) {
    return {
        type: 'spell', words, name, group: 'apoyo', level, mana, soul, vocations,
        conjurar: { de: RUNA.BLANCA, a: runa, cargas }
    };
}

module.exports = [
    // --- Las runas ---
    proyectil(RUNA.SUDDEN_DEATH, 'Sudden Death', 45, 15, 'death', PROYECTIL.FUEGO, 4.3, 32, 7.4, 48),
    proyectil(RUNA.HEAVY_MAGIC_MISSILE, 'Heavy Magic Missile', 25, 3, 'energy', PROYECTIL.FLECHA_LIGERA, 0.81, 4, 1.59, 10),
    proyectil(RUNA.LIGHT_MAGIC_MISSILE, 'Light Magic Missile', 15, 0, 'energy', PROYECTIL.FLECHA_LIGERA, 0.4, 2, 0.81, 4),
    curacion(RUNA.ULTIMATE_HEALING, 'Ultimate Healing', 24, 4, 7.3, 42, 12.4, 90),
    curacion(RUNA.INTENSE_HEALING, 'Intense Healing', 15, 1, 3.2, 20, 5.4, 40),
    area(RUNA.GREAT_FIREBALL, 'Great Fireball', 30, 4, 'fire', () => Game.area.circulo(3), PROYECTIL.BOLA_FUEGO, 1.2, 7, 2.85, 16),
    area(RUNA.EXPLOSION, 'Explosion', 31, 6, 'physical', () => Game.area.desdeMatriz(['010', '131', '010']),
        PROYECTIL.BOLA_FUEGO, 1.6, 9, 3.2, 19),
    campo(RUNA.FIRE_FIELD, 'Fire Field', 15, 1, CAMPO.FUEGO),
    campo(RUNA.FIRE_BOMB, 'Fire Bomb', 27, 5, CAMPO.FUEGO, () => Game.area.cuadrado(1)),
    campo(RUNA.ENERGY_FIELD, 'Energy Field', 18, 3, CAMPO.ENERGIA),
    campo(RUNA.POISON_FIELD, 'Poison Field', 14, 0, CAMPO.VENENO),
    {
        // El muro mágico: no se pasa ni se dispara a través, y sólo en una casilla libre.
        type: 'rune', id: RUNA.MAGIC_WALL, name: 'Magic Wall', level: 32, magicLevel: 9, aggressive: false,
        onCastSpell(player, variant) {
            if (variant.creature) {
                player.sendCancelMessage('Hay alguien ahí.');
                return false;
            }
            if (!Game.createField(CAMPO.MURO, variant.position, player)) {
                player.sendCancelMessage('Ahí no cabe.');
                return false;
            }
            return true;
        }
    },
    {
        // Quita los campos de fuego, energía y veneno de una casilla.
        type: 'rune', id: RUNA.DESTROY_FIELD, name: 'Destroy Field', level: 17, magicLevel: 3, aggressive: false,
        onCastSpell(player, variant) {
            if (Game.removeFields(variant.position) === 0) {
                player.sendCancelMessage('Ahí no hay ningún campo.');
                return false;
            }
            Game.sendMagicEffect(variant.position, EFECTO.POFF);
            return true;
        }
    },
    {
        // Paraliza a la criatura: anda muchísimo más despacio durante 20 s.
        type: 'rune', id: RUNA.PARALYZE, name: 'Paralyze', level: 54, magicLevel: 18, needTarget: true, aggressive: true,
        onCastSpell(player, variant) {
            const c = variant.creature;
            c.addCondition({ type: 'paralisis', duration: 20000, value: Math.floor(c.getSpeed() * 0.6) });
            Game.sendMagicEffect(variant.position, EFECTO.POFF);
            return true;
        }
    },

    // --- Los conjuros: palabras, nivel, maná, almas, quién puede, la runa y sus cargas ---
    conjuro('adori vita vis', 'Sudden Death', 45, 985, 5, HECHICEROS, RUNA.SUDDEN_DEATH, 3),
    conjuro('adura vita', 'Ultimate Healing Rune', 24, 400, 3, DRUIDAS, RUNA.ULTIMATE_HEALING, 1),
    conjuro('adura gran', 'Intense Healing Rune', 15, 120, 2, DRUIDAS, RUNA.INTENSE_HEALING, 1),
    conjuro('adori gran', 'Heavy Magic Missile', 25, 350, 2, MAGOS, RUNA.HEAVY_MAGIC_MISSILE, 10),
    conjuro('adori', 'Light Magic Missile', 15, 120, 1, MAGOS, RUNA.LIGHT_MAGIC_MISSILE, 10),
    conjuro('adori gran flam', 'Great Fireball', 30, 530, 3, MAGOS, RUNA.GREAT_FIREBALL, 4),
    conjuro('adevo mas hur', 'Explosion', 31, 570, 4, MAGOS, RUNA.EXPLOSION, 6),
    conjuro('adevo grav flam', 'Fire Field', 15, 240, 1, MAGOS, RUNA.FIRE_FIELD, 3),
    conjuro('adevo mas flam', 'Fire Bomb', 27, 600, 4, MAGOS, RUNA.FIRE_BOMB, 2),
    conjuro('adevo grav vis', 'Energy Field', 18, 320, 2, MAGOS, RUNA.ENERGY_FIELD, 3),
    conjuro('adevo grav pox', 'Poison Field', 14, 200, 1, MAGOS, RUNA.POISON_FIELD, 3),
    conjuro('adevo grav tera', 'Magic Wall', 32, 750, 5, HECHICEROS, RUNA.MAGIC_WALL, 3),
    conjuro('adito grav', 'Destroy Field', 17, 120, 2, MAGOS.concat(PALADINES), RUNA.DESTROY_FIELD, 3),
    conjuro('adana ani', 'Paralyze', 54, 1400, 3, DRUIDAS, RUNA.PARALYZE, 1)
];
