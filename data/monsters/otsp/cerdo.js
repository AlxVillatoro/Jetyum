'use strict';

/**
 * Pig — criatura del OpenTibia Sprite Pack (aspecto 6 del pack = lookType 306 aquí).
 *
 * Cerdo de granja: no ataca casi, pero aguanta.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Pig',

    description: 'a pig',
    experience: 8,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 30,
    maxHealth: 30,
    race: 'blood',
    speed: 90,
    manaCost: 0,

    outfit: { lookType: 306, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -5 }
    ],

    defenses: { defense: 2, armor: 2 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Oink!', yell: false },
            { text: 'Oink oink!', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 2 },  // gold coin (60%)
        { id: 2415, chance: 50000 },               // meat (50%)
        { id: 12181, chance: 30000 }               // ham (30%)
    ]
};
