'use strict';

/**
 * Juvenile Cyclops: IMPORTADO de forserver-downgrade/data/monsters/dawnport/juvenile_cyclops.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Juvenile Cyclops',
    description: 'a juvenile cyclops',
    experience: 130,
    health: 260,
    maxHealth: 260,
    race: 'blood',
    corpse: 0,
    speed: 80,
    manaCost: 490,
    outfit: { lookType: 22, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'dawnport', archivo: 'juvenile_cyclops.lua' },
    changeTarget: { interval: 2000, chance: 5 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: false,
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
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -45 },
        {
            name: 'physical',
            interval: 2000,
            chance: 10,
            minDamage: 0,
            maxDamage: -20,
            range: 7,
            target: true,
            shootEffect: 'largerock'
        }
    ],
    defenses: { defense: 22, armor: 11 },
    elements: [
        { type: 'energy', percent: 10 },
        { type: 'fire', percent: 10 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    loot: [
        { id: 2407, chance: 10810 },  // chain armor
        { id: 11970, chance: 12160 },  // chain helmet
        { id: 3031, chance: 100000, maxCount: 25 },  // gold coin
        { id: 2403, chance: 18920 },  // mace
        { id: 2415, chance: 30070 },  // meat
        { id: 11916, chance: 1350 },  // plate shield
        { id: 12077, chance: 9460 },  // studded legs
        { id: 11677, chance: 21620 }   // sword
    ]
};
