'use strict';

/**
 * Starving Wolf: IMPORTADO de forserver-downgrade/data/monsters/mammals/starving_wolf.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Starving Wolf',
    description: 'a starving wolf',
    experience: 65,
    health: 85,
    maxHealth: 85,
    race: 'blood',
    corpse: 20302,
    speed: 94,
    manaCost: 0,
    outfit: { lookType: 27, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'mammals', archivo: 'starving_wolf.lua' },
    changeTarget: { interval: 4000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: true,
        rewardBoss: false,
        illusionable: true,
        canPushItems: false,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 1,
        runHealth: 8,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: true,
        canWalkOnFire: true,
        canWalkOnPoison: true
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -25 }
    ],
    defenses: { defense: 10, armor: 2 },
    elements: [
        { type: 'ice', percent: -10 },
        { type: 'holy', percent: 30 },
        { type: 'death', percent: -5 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Gaarrrrrr', yell: false },
            { text: 'Gnoorrr', yell: false },
            { text: 'Yoooohhuuuu!', yell: false }
        ]
    },
    loot: [
        { id: 2415, chance: 5300, maxCount: 2 }   // meat
    ]
};
