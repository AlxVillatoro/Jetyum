'use strict';

/**
 * Coleoptera — criatura del OpenTibia Sprite Pack (aspecto 8 del pack = lookType 308 aquí).
 *
 * Escarabajo gigante: lento y acorazado.
 *
 * Los datos son de diseño de este proyecto (el pack sólo trae fichas de ejemplo para el gato, el
 * goblin y los dos mecánicos). Se cambian aquí mismo: el motor los relee con /reload.
 */

module.exports = {
    type: 'monster',
    name: 'Coleoptera',

    description: 'a coleoptera',
    experience: 30,
    corpse: 12237,   // dead coleoptera (OpenTibia Sprite Pack): fresco -> podrido -> huesos
    health: 70,
    maxHealth: 70,
    race: 'venom',
    speed: 100,
    manaCost: 0,

    outfit: { lookType: 308, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },

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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -12 }
    ],

    defenses: { defense: 12, armor: 12 },

    elements: [],
    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Chk chk', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 7 },  // gold coin (60%)
        { id: 12213, chance: 1500 },               // small emerald (1.5%)
        { id: 12211, chance: 1000 }                // small ruby (1%)
    ]
};
