'use strict';

/**
 * Gladiator: IMPORTADO de forserver-downgrade/data/monsters/humans/gladiator.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Gladiator',
    description: 'a gladiator',
    experience: 90,
    health: 185,
    maxHealth: 185,
    race: 'blood',
    corpse: 12227,
    speed: 98,
    manaCost: 470,
    outfit: { lookType: 131, lookHead: 78, lookBody: 3, lookLegs: 79, lookFeet: 114, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'gladiator.lua' },
    changeTarget: { interval: 4000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: true,
        rewardBoss: false,
        illusionable: false,
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -90 }
    ],
    defenses: {
        defense: 25,
        armor: 14,
        list: [
            { name: 'speed', interval: 2000, chance: 15, speedChange: 215, duration: 5000 }
        ]
    },
    elements: [
        { type: 'physical', percent: 5 },
        { type: 'holy', percent: 10 },
        { type: 'death', percent: -5 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'You are no match for me!', yell: false },
            { text: 'Feel my prowess.', yell: false },
            { text: 'Fight!', yell: false },
            { text: 'Take this!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 49500, maxCount: 30 },  // gold coin
        { id: 11677, chance: 12620 },  // sword
        { id: 2403, chance: 11160 },  // mace
        { id: 11970, chance: 5200 },  // chain helmet
        { id: 12062, chance: 2750 },  // brass armor
        { id: 11933, chance: 840 },  // steel shield
        { id: 11916, chance: 9950 },  // plate shield
        { id: 2415, chance: 19000 }   // meat
    ]
};
