'use strict';

/**
 * Scolopendra — criatura del OpenTibia Sprite Pack (aspecto 13 del pack = lookType 313 aquí).
 *
 * Ciempiés: pica fuerte.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Scolopendra',

    description: 'a scolopendra',
    experience: 40,
    corpse: 12240,   // dead scolopendra (OpenTibia Sprite Pack): fresco -> podrido -> huesos
    health: 80,
    maxHealth: 80,
    race: 'venom',
    speed: 130,
    manaCost: 0,

    outfit: { lookType: 313, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -16 }
    ],

    defenses: { defense: 8, armor: 8 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Sssk!', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 10 },  // gold coin (60%)
        { id: 12166, chance: 10000 },               // bone (10%)
        { id: 12215, chance: 1500 }                 // small amethyst (1.5%)
    ]
};
