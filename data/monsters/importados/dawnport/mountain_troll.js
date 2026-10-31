'use strict';

/**
 * Mountain Troll: IMPORTADO de forserver-downgrade/data/monsters/dawnport/mountain_troll.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Mountain Troll',
    description: 'a mountain troll',
    experience: 12,
    health: 30,
    maxHealth: 30,
    race: 'blood',
    corpse: 0,
    speed: 55,
    manaCost: 0,
    outfit: { lookType: 15, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'dawnport', archivo: 'mountain_troll.lua' },
    changeTarget: { interval: 2000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: true,
        rewardBoss: false,
        illusionable: false,
        canPushItems: false,
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -9 }
    ],
    defenses: { defense: 2, armor: 0 },
    elements: [
        { type: 'physical', percent: -15 },
        { type: 'earth', percent: -10 },
        { type: 'fire', percent: 15 },
        { type: 'ice', percent: 15 },
        { type: 'death', percent: -10 }
    ],
    immunities: [],
    loot: [
        { id: 3031, chance: 100000, maxCount: 8 },  // gold coin
        { id: 11849, chance: 3590 },  // hand axe
        { id: 2406, chance: 4060 },  // leather armor
        { id: 2415, chance: 27980 },  // meat
        { id: 12137, chance: 7870 }   // rope
    ]
};
