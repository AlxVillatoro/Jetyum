'use strict';

/**
 * Firestarter: IMPORTADO de forserver-downgrade/data/monsters/humanoids/firestarter.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Firestarter',
    description: 'a firestarter',
    experience: 80,
    health: 180,
    maxHealth: 180,
    race: 'blood',
    corpse: 12227,
    speed: 100,
    manaCost: 0,
    outfit: { lookType: 159, lookHead: 94, lookBody: 77, lookLegs: 78, lookFeet: 79, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humanoids', archivo: 'firestarter.lua' },
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
        runHealth: 0,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: true,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -15 },
        { name: 'fire', interval: 2000, chance: 15, minDamage: 0, maxDamage: -21, radius: 1, target: true }
    ],
    defenses: { defense: 15, armor: 15 },
    elements: [
        { type: 'physical', percent: 20 },
        { type: 'earth', percent: 5 },
        { type: 'fire', percent: 100 },
        { type: 'ice', percent: -10 },
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
            { text: 'FIRE!', yell: true },
            { text: 'BURN!', yell: true },
            { text: 'DEATH to the FALSE GOD!!', yell: false },
            { text: 'You shall burn in the thornfires!!', yell: false },
            { text: 'DOWN with the followers of the bog!!', yell: false },
            { text: 'Hey, what\'s that burnt stench... isn\'t that... YOU?', yell: false },
            { text: 'Set everything on fire!!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 79000, maxCount: 35 },  // gold coin
        { id: 11771, chance: 6000 },  // longsword
        { id: 2404, chance: 4000 }   // bow
    ]
};
