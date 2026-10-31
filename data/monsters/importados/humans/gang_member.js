'use strict';

/**
 * Gang Member: IMPORTADO de forserver-downgrade/data/monsters/humans/gang_member.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Gang Member',
    description: 'a gang member',
    experience: 70,
    health: 295,
    maxHealth: 295,
    race: 'blood',
    corpse: 12227,
    speed: 95,
    manaCost: 450,
    outfit: { lookType: 151, lookHead: 114, lookBody: 19, lookLegs: 23, lookFeet: 40, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'gang_member.lua' },
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
        canPushItems: true,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 1,
        runHealth: 35,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -70 }
    ],
    defenses: { defense: 15, armor: 8 },
    elements: [
        { type: 'death', percent: -5 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'This is our territory!', yell: false },
            { text: 'Help me guys!', yell: false },
            { text: 'I don\'t like the way you look!', yell: false },
            { text: 'You\'re wearing the wrong colours!', yell: false },
            { text: 'Don\'t mess with us!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 50110, maxCount: 30 },  // gold coin
        { id: 12077, chance: 5220 },  // studded legs
        { id: 12079, chance: 15330 }   // leather legs
    ]
};
