'use strict';

/**
 * Warlock: IMPORTADO de forserver-downgrade/data/monsters/humans/warlock.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Warlock',
    description: 'a warlock',
    experience: 4000,
    health: 3500,
    maxHealth: 3500,
    race: 'blood',
    corpse: 12227,
    speed: 115,
    manaCost: 0,
    outfit: { lookType: 130, lookHead: 0, lookBody: 52, lookLegs: 128, lookFeet: 95, lookAddons: 1, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'warlock.lua' },
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
        runHealth: 900,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: true,
        canWalkOnFire: true,
        canWalkOnPoison: true
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -130 },
        {
            name: 'energy',
            interval: 2000,
            chance: 25,
            minDamage: -90,
            maxDamage: -180,
            range: 7,
            shootEffect: 'energy'
        },
        { name: 'manadrain', interval: 2000, chance: 10, minDamage: 0, maxDamage: -120, range: 7 },
        {
            name: 'fire',
            interval: 2000,
            chance: 20,
            minDamage: -50,
            maxDamage: -180,
            range: 7,
            radius: 3,
            target: true
        },
        {
            name: 'energy',
            interval: 2000,
            chance: 10,
            minDamage: -150,
            maxDamage: -230,
            length: 8,
            spread: 0
        },
        { name: 'speed', interval: 2000, chance: 15, range: 7, speedChange: -600, duration: 20000 }
    ],
    defenses: {
        defense: 20,
        armor: 33,
        list: [
            { name: 'healing', interval: 2000, chance: 20, minDamage: 100, maxDamage: 225 }
        ]
    },
    elements: [
        { type: 'physical', percent: -5 },
        { type: 'energy', percent: 100 },
        { type: 'earth', percent: 95 },
        { type: 'fire', percent: 100 },
        { type: 'ice', percent: 100 },
        { type: 'holy', percent: -8 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Even a rat is a better mage than you!', yell: false },
            { text: 'Learn the secret of our magic! YOUR death!', yell: false },
            { text: 'We don\'t like intruders!', yell: false }
        ]
    },
    loot: [
        { id: 12207, chance: 1190 },  // small sapphire
        { id: 3031, chance: 29340, maxCount: 80 },  // gold coin
        { id: 2416, chance: 9000 }   // bread
    ]
};
