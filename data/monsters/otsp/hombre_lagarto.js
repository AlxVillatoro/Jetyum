'use strict';

/**
 * Lizardman — criatura del OpenTibia Sprite Pack (aspecto 46 del pack = lookType 346 aquí).
 *
 * Hombre lagarto: el más duro de los alrededores.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Lizardman',

    description: 'a lizardman',
    experience: 110,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 200,
    maxHealth: 200,
    race: 'blood',
    speed: 120,
    manaCost: 0,

    outfit: { lookType: 346, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

    changeTarget: { interval: 4000, chance: 10 },

    strategiesTarget: { nearest: 100, health: 0, damage: 0, random: 0 },

    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: false,
        illusionable: true,
        canPushItems: false,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 1,
        runHealth: 20,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },

    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -38 }
    ],

    defenses: { defense: 16, armor: 16 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Hissss!', yell: false },
            { text: 'Sangre fría!', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 27 },  // gold coin (60%)
        { id: 12077, chance: 6000 },                // studded legs (6%)
        { id: 11704, chance: 6000 },                // sabre (6%)
        { id: 2413, chance: 5000 },                 // health potion (5%)
        { id: 11771, chance: 3000 },                // longsword (3%)
        { id: 12213, chance: 3000 },                // small emerald (3%)
        { id: 12062, chance: 2000 }                 // brass armor (2%)
    ]
};
