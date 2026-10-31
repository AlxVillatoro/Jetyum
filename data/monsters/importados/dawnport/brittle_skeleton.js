'use strict';

/**
 * Brittle Skeleton: IMPORTADO de forserver-downgrade/data/monsters/dawnport/brittle_skeleton.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Brittle Skeleton',
    description: 'a brittle skeleton',
    experience: 35,
    health: 50,
    maxHealth: 50,
    race: 'undead',
    corpse: 0,
    speed: 73,
    manaCost: 300,
    outfit: { lookType: 33, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'dawnport', archivo: 'brittle_skeleton.lua' },
    changeTarget: { interval: 2000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
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
        canWalkOnEnergy: true,
        canWalkOnFire: true,
        canWalkOnPoison: true
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -18 },
        {
            name: 'lifedrain',
            interval: 2000,
            chance: 8,
            minDamage: -7,
            maxDamage: -13,
            range: 7,
            target: true
        }
    ],
    defenses: { defense: 9, armor: 2 },
    elements: [],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    loot: [
        { id: 12166, chance: 49870 },  // bone
        { id: 11926, chance: 2920 },  // brass shield
        { id: 3031, chance: 100000, maxCount: 5 },  // gold coin
        { id: 2403, chance: 4770 },  // mace
        { id: 11677, chance: 6100 },  // sword
        { id: 2417, chance: 10610 },  // torch
        { id: 11949, chance: 3980 }   // viking helmet
    ]
};
