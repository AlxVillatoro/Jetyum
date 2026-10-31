'use strict';

/**
 * Elf Overseer: IMPORTADO de forserver-downgrade/data/monsters/humanoids/elf_overseer.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Elf Overseer',
    description: 'an elf overseer',
    experience: 200,
    health: 220,
    maxHealth: 220,
    race: 'blood',
    corpse: 12227,
    speed: 110,
    manaCost: 0,
    outfit: { lookType: 159, lookHead: 57, lookBody: 95, lookLegs: 114, lookFeet: 116, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humanoids', archivo: 'elf_overseer.lua' },
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
        canPushCreatures: false,
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -94 },
        {
            name: 'physical',
            interval: 2000,
            chance: 10,
            minDamage: 0,
            maxDamage: -120,
            range: 7,
            target: true,
            shootEffect: 'arrow'
        },
        {
            name: 'energy',
            interval: 2000,
            chance: 10,
            minDamage: -80,
            maxDamage: -100,
            range: 7,
            target: true,
            shootEffect: 'energy'
        },
        {
            name: 'death',
            interval: 2000,
            chance: 10,
            minDamage: -120,
            maxDamage: -135,
            range: 7,
            target: true
        }
    ],
    defenses: {
        defense: 15,
        armor: 15,
        list: [
            { name: 'healing', interval: 2000, chance: 15, minDamage: 40, maxDamage: 60 }
        ]
    },
    elements: [
        { type: 'energy', percent: 20 },
        { type: 'fire', percent: 50 },
        { type: 'holy', percent: -10 },
        { type: 'death', percent: 20 }
    ],
    immunities: [
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'I\'ll bring balance upon you!', yell: false },
            { text: 'Vihil Ealuel!', yell: false },
            { text: 'For the Daughter of the Stars!', yell: false },
            { text: 'Tha\'shi Cenath!', yell: false },
            { text: 'Feel my wrath!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 37000, maxCount: 47 },  // gold coin
        { id: 21000, chance: 18000 },  // blank rune
        { id: 12138, chance: 6000, maxCount: 3 },  // arrow
        { id: 2416, chance: 14000 },  // bread
        { id: 2413, chance: 4000 }   // health potion
    ]
};
