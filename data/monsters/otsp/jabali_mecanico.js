'use strict';

/**
 * Mechanical Boar — criatura del OpenTibia Sprite Pack (aspecto 11 del pack = lookType 311 aquí).
 *
 * Jabalí mecánico: inmune al miedo, golpea fuerte.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Mechanical Boar',

    description: 'a mechanical boar',
    experience: 70,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 160,
    maxHealth: 160,
    race: 'undead',
    speed: 110,
    manaCost: 0,

    outfit: { lookType: 311, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -26 }
    ],

    defenses: { defense: 14, armor: 14 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Clank!', yell: false },
            { text: 'Bzzt', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 17 },  // gold coin (60%)
        { id: 12181, chance: 20000 },               // ham (20%)
        { id: 12137, chance: 6000 },                // rope (6%)
        { id: 11855, chance: 2000 },                // battle axe (2%)
        { id: 11933, chance: 1500 }                 // steel shield (1.5%)
    ]
};
