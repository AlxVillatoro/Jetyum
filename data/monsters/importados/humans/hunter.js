'use strict';

/**
 * Hunter: IMPORTADO de forserver-downgrade/data/monsters/humans/hunter.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Hunter',
    description: 'a hunter',
    experience: 150,
    health: 150,
    maxHealth: 150,
    race: 'blood',
    corpse: 12227,
    speed: 105,
    manaCost: 530,
    outfit: { lookType: 129, lookHead: 95, lookBody: 116, lookLegs: 120, lookFeet: 115, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'hunter.lua' },
    changeTarget: { interval: 4000, chance: 10 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: false,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 4,
        runHealth: 10,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -20 },
        {
            name: 'physical',
            interval: 2000,
            chance: 50,
            minDamage: 0,
            maxDamage: -100,
            range: 7,
            target: true,
            shootEffect: 'arrow'
        }
    ],
    defenses: { defense: 15, armor: 8 },
    elements: [
        { type: 'physical', percent: -5 },
        { type: 'holy', percent: 20 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Guess who we are hunting!', yell: false },
            { text: 'Guess who we\'re hunting, hahaha!', yell: false },
            { text: 'Bullseye!', yell: false },
            { text: 'You\'ll make a nice trophy!', yell: false }
        ]
    },
    loot: [
        { id: 2417, chance: 3300 },  // torch
        { id: 12211, chance: 150 },  // small ruby
        { id: 2404, chance: 5770 },  // bow
        { id: 11956, chance: 5050 },  // brass helmet
        { id: 12062, chance: 5070 },  // brass armor
        { id: 12138, chance: 82000, maxCount: 22 }   // arrow
    ]
};
