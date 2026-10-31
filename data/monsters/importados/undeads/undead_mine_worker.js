'use strict';

/**
 * Undead Mine Worker: IMPORTADO de forserver-downgrade/data/monsters/undeads/undead_mine_worker.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Undead Mine Worker',
    description: 'an undead mine worker',
    experience: 45,
    health: 65,
    maxHealth: 65,
    race: 'undead',
    corpse: 0,
    speed: 77,
    manaCost: 435,
    outfit: { lookType: 33, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'undeads', archivo: 'undead_mine_worker.lua' },
    changeTarget: { interval: 4000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: true,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
        canPushCreatures: false,
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -30 },
        { name: 'lifedrain', interval: 2000, chance: 15, minDamage: -7, maxDamage: -13, range: 1 }
    ],
    defenses: { defense: 15, armor: 5 },
    elements: [
        { type: 'holy', percent: -25 },
        { type: 'death', percent: 100 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Ahrrr... uhmmm... hmm...', yell: false },
            { text: 'Grrr...', yell: false },
            { text: 'Urrrgh... gnarrr...', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 73000, maxCount: 10 },  // gold coin
        { id: 12166, chance: 42000 },  // bone
        { id: 11677, chance: 3850 },  // sword
        { id: 2403, chance: 26900 }   // mace
    ]
};
