'use strict';

/**
 * Occultist — criatura del OpenTibia Sprite Pack (aspecto 10 del pack = lookType 310 aquí).
 *
 * Ocultista: humano que adora la oscuridad.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Occultist',

    description: 'an occultist',
    experience: 90,
    corpse: 12246,   // dead human (OpenTibia Sprite Pack): fresco -> podrido -> huesos
    health: 150,
    maxHealth: 150,
    race: 'blood',
    speed: 110,
    manaCost: 0,

    outfit: { lookType: 310, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -34 }
    ],

    defenses: { defense: 8, armor: 8 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Por la sombra!', yell: false },
            { text: 'Ritual!', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 22 },  // gold coin (60%)
        { id: 12010, chance: 10000 },               // doublet (10%)
        { id: 2405, chance: 8000 },                 // staff (8%)
        { id: 2414, chance: 8000 },                 // mana potion (8%)
        { id: 2413, chance: 5000 },                 // health potion (5%)
        { id: 12215, chance: 3000 }                 // small amethyst (3%)
    ]
};
