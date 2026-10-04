'use strict';

/**
 * Succubus — criatura del OpenTibia Sprite Pack (aspecto 2 del pack = lookType 302 aquí).
 *
 * Súcubo: jefe de las raids nocturnas.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Succubus',

    description: 'a succubus',
    experience: 150,
    corpse: 12231,   // dead succubus (OpenTibia Sprite Pack): fresco -> podrido -> huesos
    health: 240,
    maxHealth: 240,
    race: 'blood',
    speed: 140,
    manaCost: 0,

    outfit: { lookType: 302, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        runHealth: 0,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },

    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -45 }
    ],

    defenses: { defense: 12, armor: 12 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Ven conmigo...', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 37 },  // gold coin (60%)
        { id: 2414, chance: 8000 },                 // mana potion (8%)
        { id: 12211, chance: 5000 },                // small ruby (5%)
        { id: 12219, chance: 2000 },                // small diamond (2%)
        { id: 2408, chance: 2000 },                 // plate armor (2%)
        { id: 11736, chance: 1500 }                 // fire sword (1.5%)
    ]
};
