'use strict';

/**
 * Goblin — criatura del OpenTibia Sprite Pack (aspecto 7 del pack = lookType 307 aquí).
 *
 * Goblin del pack (server_files/monster/goblin.xml): 50 de vida, 25 de experiencia.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Goblin',

    description: 'a goblin',
    experience: 25,
    corpse: 12234,   // dead goblin (OpenTibia Sprite Pack): fresco -> podrido -> huesos
    health: 50,
    maxHealth: 50,
    race: 'blood',
    speed: 150,
    manaCost: 0,

    outfit: { lookType: 307, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        runHealth: 15,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },

    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -10 }
    ],

    defenses: { defense: 10, armor: 10 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Me mata a ti!', yell: false },
            { text: 'Grrr goblin!', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 6 },   // gold coin (60%)
        { id: 12174, chance: 15000, maxCount: 2 },  // banana (15%)
        { id: 12166, chance: 15000 },               // bone (15%)
        { id: 2401, chance: 12000 },                // dagger (12%)
        { id: 2410, chance: 8000 },                 // leather helmet (8%)
        { id: 11849, chance: 6000 },                // hand axe (6%)
        { id: 2406, chance: 5000 }                  // leather armor (5%)
    ]
};
