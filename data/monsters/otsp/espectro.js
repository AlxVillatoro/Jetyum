'use strict';

/**
 * Wraith — criatura del OpenTibia Sprite Pack (aspecto 5 del pack = lookType 305 aquí).
 *
 * Espectro: aparece en el cementerio por la noche.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Wraith',

    description: 'a wraith',
    experience: 80,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 120,
    maxHealth: 120,
    race: 'undead',
    speed: 120,
    manaCost: 0,

    outfit: { lookType: 305, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -30 }
    ],

    defenses: { defense: 6, armor: 6 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Uuuuh...', yell: false },
            { text: 'Te arrastraré...', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 20 },  // gold coin (60%)
        { id: 2414, chance: 5000 },                 // mana potion (5%)
        { id: 12207, chance: 3000 },                // small sapphire (3%)
        { id: 12219, chance: 1000 },                // small diamond (1%)
        { id: 2408, chance: 800 }                   // plate armor (0.8%)
    ]
};
