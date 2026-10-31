'use strict';

/**
 * Crazed Beggar: IMPORTADO de forserver-downgrade/data/monsters/humans/crazed_beggar.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Crazed Beggar',
    description: 'a crazed beggar',
    experience: 35,
    health: 100,
    maxHealth: 100,
    race: 'blood',
    corpse: 12227,
    speed: 77,
    manaCost: 300,
    outfit: { lookType: 153, lookHead: 40, lookBody: 19, lookLegs: 21, lookFeet: 97, lookAddons: 3, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'crazed_beggar.lua' },
    changeTarget: { interval: 4000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: true,
        rewardBoss: false,
        illusionable: false,
        canPushItems: false,
        canPushCreatures: false,
        staticAttackChance: 80,
        targetDistance: 1,
        runHealth: 10,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -25 }
    ],
    defenses: { defense: 15, armor: 4 },
    elements: [
        { type: 'physical', percent: 5 },
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
            { text: 'Hehehe!', yell: false },
            { text: 'Raahhh!', yell: false },
            { text: 'You are one of THEM! Die!', yell: false },
            { text: 'Wanna buy roses??', yell: false },
            { text: 'Make it stop!', yell: false },
            { text: 'They\'re coming! They\'re coming!', yell: false },
            { text: 'Gimme money!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 99000, maxCount: 9 },  // gold coin
        { id: 2415, chance: 9500 }   // meat
    ]
};
