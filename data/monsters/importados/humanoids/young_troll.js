'use strict';

/**
 * Young Troll: IMPORTADO de forserver-downgrade/data/monsters/humanoids/young_troll.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Young Troll',
    description: 'a young troll',
    experience: 12,
    health: 30,
    maxHealth: 30,
    race: 'blood',
    corpse: 0,
    speed: 58,
    manaCost: 0,
    outfit: { lookType: 15, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humanoids', archivo: 'young_troll.lua' },
    changeTarget: { interval: 5000, chance: 20 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: true,
        rewardBoss: false,
        illusionable: false,
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
    defenses: { defense: 2, armor: 2 },
    elements: [
        { type: 'energy', percent: 20 },
        { type: 'earth', percent: -10 },
        { type: 'holy', percent: 10 },
        { type: 'death', percent: -10 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Hmmm, dogs', yell: false },
            { text: 'Gruntz!', yell: false }
        ]
    },
    loot: [
        { id: 12137, chance: 10000 },  // rope
        { id: 3031, chance: 58000, maxCount: 12 },  // gold coin
        { id: 2415, chance: 14000 }   // meat
    ]
};
