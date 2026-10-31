'use strict';

/**
 * Dark Magician: IMPORTADO de forserver-downgrade/data/monsters/humans/dark_magician.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Dark Magician',
    description: 'a dark magician',
    experience: 185,
    health: 325,
    maxHealth: 325,
    race: 'blood',
    corpse: 12227,
    speed: 90,
    manaCost: 0,
    outfit: { lookType: 133, lookHead: 58, lookBody: 95, lookLegs: 51, lookFeet: 131, lookAddons: 2, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'dark_magician.lua' },
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -40 },
        {
            name: 'fire',
            interval: 2000,
            chance: 20,
            minDamage: -5,
            maxDamage: -40,
            range: 7,
            target: true,
            shootEffect: 'fire'
        },
        {
            name: 'energy',
            interval: 2000,
            chance: 15,
            minDamage: -20,
            maxDamage: -30,
            range: 7,
            target: true,
            shootEffect: 'energy'
        }
    ],
    defenses: {
        defense: 15,
        armor: 15,
        list: [
            { name: 'healing', interval: 2000, chance: 20, minDamage: 60, maxDamage: 80 }
        ]
    },
    elements: [
        { type: 'energy', percent: 20 },
        { type: 'earth', percent: 20 },
        { type: 'fire', percent: 10 },
        { type: 'ice', percent: 10 },
        { type: 'holy', percent: 20 },
        { type: 'death', percent: -5 }
    ],
    immunities: [
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Feel the power of my runes!', yell: false },
            { text: 'Killing you gets expensive.', yell: false },
            { text: 'My secrets are mine alone!', yell: false },
            { text: 'Stand still!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 75100, maxCount: 55 },  // gold coin
        { id: 21000, chance: 10000 },  // blank rune
        { id: 2413, chance: 12000 },  // health potion
        { id: 2414, chance: 11900 }   // mana potion
    ]
};
