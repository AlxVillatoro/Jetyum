'use strict';

/**
 * Minotaur Bruiser: IMPORTADO de forserver-downgrade/data/monsters/humanoids/minotaur_bruiser.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Minotaur Bruiser',
    description: 'a minotaur bruiser',
    experience: 50,
    health: 100,
    maxHealth: 100,
    race: 'blood',
    corpse: 0,
    speed: 84,
    manaCost: 330,
    outfit: { lookType: 25, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humanoids', archivo: 'minotaur_bruiser.lua' },
    changeTarget: { interval: 4000, chance: 0 },
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -45 }
    ],
    defenses: { defense: 15, armor: 11 },
    elements: [
        { type: 'fire', percent: 20 }
    ],
    immunities: [],
    loot: [
        { id: 3031, chance: 65700, maxCount: 15 },  // gold coin
        { id: 11916, chance: 20000 },  // plate shield
        { id: 2403, chance: 12900 },  // mace
        { id: 2407, chance: 10000 },  // chain armor
        { id: 11956, chance: 7800 },  // brass helmet
        { id: 11677, chance: 5000 },  // sword
        { id: 2415, chance: 5000 },  // meat
        { id: 2402, chance: 4000 },  // axe
        { id: 21030, chance: 310 }   // shovel
    ]
};
