'use strict';

/**
 * Wild Warrior: IMPORTADO de forserver-downgrade/data/monsters/humans/wild_warrior.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Wild Warrior',
    description: 'a wild warrior',
    experience: 60,
    health: 135,
    maxHealth: 135,
    race: 'blood',
    corpse: 12227,
    speed: 95,
    manaCost: 420,
    outfit: { lookType: 131, lookHead: 38, lookBody: 38, lookLegs: 38, lookFeet: 38, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'wild_warrior.lua' },
    changeTarget: { interval: 4000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: true,
        rewardBoss: false,
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -70 }
    ],
    defenses: {
        defense: 20,
        armor: 8,
        list: [
            { name: 'speed', interval: 2000, chance: 15, speedChange: 200, duration: 5000 }
        ]
    },
    elements: [
        { type: 'physical', percent: -5 },
        { type: 'holy', percent: 10 },
        { type: 'death', percent: -5 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Gimme your money!', yell: false },
            { text: 'An enemy!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 49070, maxCount: 30 },  // gold coin
        { id: 2402, chance: 30710 },  // axe
        { id: 2403, chance: 9800 },  // mace
        { id: 11970, chance: 5250 },  // chain helmet
        { id: 12062, chance: 2540 },  // brass armor
        { id: 11933, chance: 910 },  // steel shield
        { id: 11926, chance: 17000 }   // brass shield
    ]
};
