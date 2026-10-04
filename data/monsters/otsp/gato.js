'use strict';

/**
 * Cat — criatura del OpenTibia Sprite Pack (aspecto 1 del pack = lookType 301 aquí).
 *
 * Gato callejero: rápido y flojo. Lo primero que se caza fuera de la ciudad.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Cat',

    description: 'a cat',
    experience: 5,
    corpse: 12228,   // dead cat (OpenTibia Sprite Pack): fresco -> podrido -> huesos
    health: 20,
    maxHealth: 20,
    race: 'blood',
    speed: 120,
    manaCost: 0,

    outfit: { lookType: 301, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        runHealth: 5,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },

    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -4 }
    ],

    defenses: { defense: 1, armor: 1 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Miau!', yell: false },
            { text: 'Fsss!', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 2 },  // gold coin (60%)
        { id: 12183, chance: 15000 }               // cheese (15%)
    ]
};
