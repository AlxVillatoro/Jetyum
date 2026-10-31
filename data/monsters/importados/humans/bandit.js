'use strict';

/**
 * Bandit: IMPORTADO de forserver-downgrade/data/monsters/humans/bandit.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Bandit',
    description: 'a bandit',
    experience: 65,
    health: 245,
    maxHealth: 245,
    race: 'blood',
    corpse: 12227,
    speed: 90,
    manaCost: 450,
    outfit: { lookType: 129, lookHead: 58, lookBody: 40, lookLegs: 24, lookFeet: 95, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'bandit.lua' },
    changeTarget: { interval: 5000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: true,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 1,
        runHealth: 25,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -45 }
    ],
    defenses: { defense: 15, armor: 11 },
    elements: [
        { type: 'physical', percent: -10 },
        { type: 'death', percent: -5 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Hand me your purse!', yell: false },
            { text: 'Your money or your life!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 49000, maxCount: 30 },  // gold coin
        { id: 2402, chance: 29900 },  // axe
        { id: 2403, chance: 10100 },  // mace
        { id: 11970, chance: 5000 },  // chain helmet
        { id: 12062, chance: 2500 },  // brass armor
        { id: 11926, chance: 16800 },  // brass shield
        { id: 12079, chance: 15500 }   // leather legs
    ]
};
