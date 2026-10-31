'use strict';

/**
 * Mad Scientist: IMPORTADO de forserver-downgrade/data/monsters/humans/mad_scientist.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Mad Scientist',
    description: 'a mad scientist',
    experience: 205,
    health: 325,
    maxHealth: 325,
    race: 'blood',
    corpse: 12227,
    speed: 90,
    manaCost: 0,
    outfit: { lookType: 133, lookHead: 39, lookBody: 0, lookLegs: 19, lookFeet: 20, lookAddons: 1, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'mad_scientist.lua' },
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
        targetDistance: 1,
        runHealth: 0,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -35 },
        {
            name: 'physical',
            interval: 2000,
            chance: 15,
            minDamage: -20,
            maxDamage: -56,
            range: 7,
            radius: 3,
            target: true
        },
        {
            name: 'earth',
            interval: 2000,
            chance: 15,
            minDamage: -20,
            maxDamage: -36,
            target: true,
            shootEffect: 'poison'
        },
        {
            name: 'speed',
            interval: 2000,
            chance: 10,
            range: 7,
            speedChange: -300,
            duration: 2000,
            target: true,
            shootEffect: 'poison'
        }
    ],
    defenses: {
        defense: 15,
        armor: 15,
        list: [
            { name: 'healing', interval: 2000, chance: 15, minDamage: 10, maxDamage: 30 }
        ]
    },
    elements: [
        { type: 'energy', percent: 20 },
        { type: 'earth', percent: 20 },
        { type: 'fire', percent: 10 },
        { type: 'drown', percent: 100 },
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
            { text: 'Die in the name of Science!', yell: false },
            { text: 'You will regret interrupting my studies!', yell: false },
            { text: 'Let me test this!', yell: false },
            { text: 'I will study your corpse!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 30000, maxCount: 65 },  // gold coin
        { id: 3031, chance: 30000, maxCount: 50 },  // gold coin
        { id: 2413, chance: 19000 },  // health potion
        { id: 2414, chance: 19000 }   // mana potion
    ]
};
