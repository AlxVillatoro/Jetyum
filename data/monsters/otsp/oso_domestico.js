'use strict';

/**
 * Domestic Bear — criatura del OpenTibia Sprite Pack (aspecto 12 del pack = lookType 312 aquí).
 *
 * Oso con montura: duro, pero huye cuando le queda poco.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Domestic Bear',

    description: 'a domestic bear',
    experience: 60,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 140,
    maxHealth: 140,
    race: 'blood',
    speed: 95,
    manaCost: 0,

    outfit: { lookType: 312, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -24 }
    ],

    defenses: { defense: 8, armor: 8 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Grrrr', yell: false },
            { text: 'Groarr', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 15 },  // gold coin (60%)
        { id: 2415, chance: 40000 },                // meat (40%)
        { id: 12181, chance: 20000 },               // ham (20%)
        { id: 12166, chance: 15000 }                // bone (15%)
    ]
};
