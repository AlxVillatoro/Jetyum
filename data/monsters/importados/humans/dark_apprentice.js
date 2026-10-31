'use strict';

/**
 * Dark Apprentice: IMPORTADO de forserver-downgrade/data/monsters/humans/dark_apprentice.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Dark Apprentice',
    description: 'a dark apprentice',
    experience: 100,
    health: 225,
    maxHealth: 225,
    race: 'blood',
    corpse: 12227,
    speed: 86,
    manaCost: 0,
    outfit: { lookType: 133, lookHead: 78, lookBody: 57, lookLegs: 95, lookFeet: 115, lookAddons: 1, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'dark_apprentice.lua' },
    changeTarget: { interval: 4000, chance: 10 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: false,
        rewardBoss: false,
        illusionable: false,
        canPushItems: true,
        canPushCreatures: true,
        staticAttackChance: 90,
        targetDistance: 4,
        runHealth: 0,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -60 },
        {
            name: 'fire',
            interval: 2000,
            chance: 10,
            minDamage: -2,
            maxDamage: -26,
            range: 7,
            target: true,
            shootEffect: 'fire'
        },
        {
            name: 'energy',
            interval: 2000,
            chance: 10,
            minDamage: -10,
            maxDamage: -20,
            range: 7,
            target: true,
            shootEffect: 'energy'
        },
        {
            name: 'physical',
            interval: 2000,
            chance: 10,
            minDamage: 0,
            maxDamage: -24,
            range: 7,
            target: true,
            shootEffect: 'smallstone'
        }
    ],
    defenses: {
        defense: 15,
        armor: 16,
        list: [
            { name: 'healing', interval: 2000, chance: 15, minDamage: 30, maxDamage: 40 }
        ]
    },
    elements: [
        { type: 'death', percent: -5 }
    ],
    immunities: [
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Outch!', yell: false },
            { text: 'I must dispose of my masters enemies!', yell: false },
            { text: 'Oops, I did it again.', yell: false },
            { text: 'From the spirits that I called Sir, deliver me!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 7500, maxCount: 45 },  // gold coin
        { id: 21000, chance: 8125, maxCount: 3 },  // blank rune
        { id: 2413, chance: 2900 },  // health potion
        { id: 2414, chance: 2980 }   // mana potion
    ]
};
