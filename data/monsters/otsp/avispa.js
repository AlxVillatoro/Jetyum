'use strict';

/**
 * Vespidae — criatura del OpenTibia Sprite Pack (aspecto 14 del pack = lookType 314 aquí).
 *
 * Avispa gigante: rápida, poca vida.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Vespidae',

    description: 'a vespidae',
    experience: 45,
    corpse: 12243,   // dead vespidae (OpenTibia Sprite Pack): fresco -> podrido -> huesos
    health: 60,
    maxHealth: 60,
    race: 'venom',
    speed: 190,
    manaCost: 0,

    outfit: { lookType: 314, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        runHealth: 10,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },

    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -18 }
    ],

    defenses: { defense: 4, armor: 4 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Bzzzz!', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 11 },  // gold coin (60%)
        { id: 12177, chance: 15000, maxCount: 2 },  // red apple (15%)
        { id: 12213, chance: 1000 }                 // small emerald (1%)
    ]
};
