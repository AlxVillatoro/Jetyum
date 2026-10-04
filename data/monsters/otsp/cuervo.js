'use strict';

/**
 * Crow — criatura del OpenTibia Sprite Pack (aspecto 9 del pack = lookType 309 aquí).
 *
 * Cuervo: vuela bajo y pica. Ronda los campos.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Crow',

    description: 'a crow',
    experience: 10,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 25,
    maxHealth: 25,
    race: 'blood',
    speed: 160,
    manaCost: 0,

    outfit: { lookType: 309, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -6 }
    ],

    defenses: { defense: 1, armor: 1 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Craaa!', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 2 },  // gold coin (60%)
        { id: 12177, chance: 10000 },              // red apple (10%)
        { id: 12207, chance: 500 }                 // small sapphire (0.5%)
    ]
};
