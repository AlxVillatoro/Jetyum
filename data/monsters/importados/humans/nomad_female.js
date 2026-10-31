'use strict';

/**
 * Nomad Female: IMPORTADO de forserver-downgrade/data/monsters/humans/nomad_female.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Nomad Female',
    description: 'a nomad',
    experience: 60,
    health: 160,
    maxHealth: 160,
    race: 'blood',
    corpse: 12227,
    speed: 95,
    manaCost: 0,
    outfit: { lookType: 150, lookHead: 96, lookBody: 39, lookLegs: 40, lookFeet: 3, lookAddons: 3, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'nomad_female.lua' },
    changeTarget: { interval: 4000, chance: 10 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: true,
        rewardBoss: false,
        illusionable: false,
        canPushItems: true,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 1,
        runHealth: 15,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -80 },
        { name: 'physical', interval: 2000, chance: 10, radius: 1 }
    ],
    defenses: { defense: 15, armor: 15 },
    elements: [
        { type: 'physical', percent: -10 },
        { type: 'fire', percent: 20 },
        { type: 'ice', percent: -10 },
        { type: 'holy', percent: 20 },
        { type: 'death', percent: -10 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'I will leave your remains to the vultures!', yell: false },
            { text: 'We are the true sons of the desert!', yell: false },
            { text: 'We are swift as the wind of the desert!', yell: false },
            { text: 'Your riches will be mine!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 56000, maxCount: 40 },  // gold coin
        { id: 2402, chance: 2730 },  // axe
        { id: 12062, chance: 2350 },  // brass armor
        { id: 2403, chance: 2150 },  // mace
        { id: 11933, chance: 900 }   // steel shield
    ]
};
