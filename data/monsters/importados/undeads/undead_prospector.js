'use strict';

/**
 * Undead Prospector: IMPORTADO de forserver-downgrade/data/monsters/undeads/undead_prospector.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Undead Prospector',
    description: 'an undead prospector',
    experience: 85,
    health: 100,
    maxHealth: 100,
    race: 'blood',
    corpse: 0,
    speed: 72,
    manaCost: 440,
    outfit: { lookType: 18, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'undeads', archivo: 'undead_prospector.lua' },
    changeTarget: { interval: 4000, chance: 0 },
    strategiesTarget: { nearest: 80, health: 10, damage: 10 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: false,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -50 }
    ],
    defenses: {
        defense: 0,
        armor: 8,
        list: [
            { name: 'healing', interval: 2000, chance: 15, minDamage: 5, maxDamage: 15 }
        ]
    },
    elements: [
        { type: 'energy', percent: 30 },
        { type: 'earth', percent: 20 },
        { type: 'lifedrain', percent: 100 },
        { type: 'drown', percent: 100 },
        { type: 'ice', percent: 10 },
        { type: 'holy', percent: -25 },
        { type: 'death', percent: 100 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Our mine... leave us alone.', yell: false },
            { text: 'Turn back...', yell: false },
            { text: 'These mine is ours... you shall not pass.', yell: false }
        ]
    },
    loot: [
        { id: 2417, chance: 46150 },  // torch
        { id: 3031, chance: 53850, maxCount: 30 },  // gold coin
        { id: 11956, chance: 23000 },  // brass helmet
        { id: 11949, chance: 1000 }   // viking helmet
    ]
};
