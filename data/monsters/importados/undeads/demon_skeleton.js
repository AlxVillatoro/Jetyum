'use strict';

/**
 * Demon Skeleton: IMPORTADO de forserver-downgrade/data/monsters/undeads/demon_skeleton.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Demon Skeleton',
    description: 'a demon skeleton',
    experience: 240,
    health: 400,
    maxHealth: 400,
    race: 'undead',
    corpse: 0,
    speed: 90,
    manaCost: 620,
    outfit: { lookType: 37, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'undeads', archivo: 'demon_skeleton.lua' },
    changeTarget: { interval: 4000, chance: 10 },
    strategiesTarget: { nearest: 70, damage: 30 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: false,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
        canPushCreatures: true,
        staticAttackChance: 90,
        targetDistance: 1,
        runHealth: 0,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: true,
        canWalkOnPoison: true
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -185 },
        {
            name: 'death',
            interval: 2000,
            chance: 10,
            minDamage: -30,
            maxDamage: -50,
            range: 1,
            radius: 1,
            target: true
        }
    ],
    defenses: { defense: 30, armor: 25 },
    elements: [
        { type: 'earth', percent: 100 },
        { type: 'fire', percent: 100 },
        { type: 'lifedrain', percent: 100 },
        { type: 'drown', percent: 100 },
        { type: 'holy', percent: -25 },
        { type: 'death', percent: 100 }
    ],
    immunities: [
        { type: 'paralyze' }
    ],
    loot: [
        { id: 2417, chance: 5270 },  // torch
        { id: 12211, chance: 1400 },  // small ruby
        { id: 3031, chance: 97000, maxCount: 75 },  // gold coin
        { id: 11892, chance: 10000, maxCount: 3 },  // throwing star
        { id: 11805, chance: 4000 },  // battle hammer
        { id: 2413, chance: 10120, maxCount: 2 },  // health potion
        { id: 2413, chance: 10000, maxCount: 2 },  // health potion
        { id: 2414, chance: 5300 }   // mana potion
    ]
};
