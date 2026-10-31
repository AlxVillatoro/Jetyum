'use strict';

/**
 * Smuggler: IMPORTADO de forserver-downgrade/data/monsters/humans/smuggler.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Smuggler',
    description: 'a smuggler',
    experience: 48,
    health: 130,
    maxHealth: 130,
    race: 'blood',
    corpse: 12227,
    speed: 88,
    manaCost: 390,
    outfit: { lookType: 134, lookHead: 95, lookBody: 0, lookLegs: 113, lookFeet: 115, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'smuggler.lua' },
    changeTarget: { interval: 4000, chance: 10 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: false,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -60 }
    ],
    defenses: { defense: 15, armor: 8 },
    elements: [
        { type: 'physical', percent: -5 },
        { type: 'death', percent: -5 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'You saw something you shouldn\'t!', yell: false },
            { text: 'I will silence you forever!', yell: false }
        ]
    },
    loot: [
        { id: 2417, chance: 30200, maxCount: 2 },  // torch
        { id: 3031, chance: 80000, maxCount: 10 },  // gold coin
        { id: 11677, chance: 5000 },  // sword
        { id: 11725, chance: 10000 },  // short sword
        { id: 2410, chance: 10050 },  // leather helmet
        { id: 12079, chance: 14840 },  // leather legs
        { id: 12181, chance: 10200 }   // ham
    ]
};
