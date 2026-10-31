'use strict';

/**
 * Infernalist: IMPORTADO de forserver-downgrade/data/monsters/humans/infernalist.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Infernalist',
    description: 'an infernalist',
    experience: 4000,
    health: 3650,
    maxHealth: 3650,
    race: 'blood',
    corpse: 12227,
    speed: 115,
    manaCost: 0,
    outfit: { lookType: 130, lookHead: 78, lookBody: 76, lookLegs: 94, lookFeet: 39, lookAddons: 2, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'infernalist.lua' },
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
        staticAttackChance: 95,
        targetDistance: 4,
        runHealth: 900,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: true,
        canWalkOnFire: true,
        canWalkOnPoison: true
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -100 },
        {
            name: 'fire',
            interval: 2000,
            chance: 40,
            minDamage: -65,
            maxDamage: -180,
            range: 7,
            target: true,
            shootEffect: 'fire'
        },
        {
            name: 'fire',
            interval: 2000,
            chance: 20,
            minDamage: -90,
            maxDamage: -180,
            range: 7,
            radius: 3,
            target: true,
            shootEffect: 'fire'
        },
        {
            name: 'manadrain',
            interval: 2000,
            chance: 20,
            minDamage: -53,
            maxDamage: -120,
            range: 7,
            radius: 3,
            target: true
        },
        { name: 'fire', interval: 2000, chance: 10, minDamage: -150, maxDamage: -250, length: 8, spread: 0 },
        { name: 'physical', interval: 2000, chance: 5, minDamage: -100, maxDamage: -150, radius: 2 }
    ],
    defenses: {
        defense: 15,
        armor: 33,
        list: [
            { name: 'healing', interval: 2000, chance: 15, minDamage: 60, maxDamage: 230 }
        ]
    },
    elements: [
        { type: 'physical', percent: -5 },
        { type: 'energy', percent: 100 },
        { type: 'earth', percent: 95 },
        { type: 'fire', percent: 100 },
        { type: 'ice', percent: -5 },
        { type: 'holy', percent: 20 },
        { type: 'death', percent: 10 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Nothing will remain but your scorched bones!', yell: false },
            { text: 'Some like it hot!', yell: false },
            { text: 'It\'s cooking time!', yell: false },
            { text: 'Feel the heat of battle!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 56500, maxCount: 100 },  // gold coin
        { id: 3031, chance: 40000, maxCount: 47 },  // gold coin
        { id: 2414, chance: 20000 }   // mana potion (relleno: la ficha sólo daba oro)
    ]
};
