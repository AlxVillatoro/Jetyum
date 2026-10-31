'use strict';

/**
 * Assassin: IMPORTADO de forserver-downgrade/data/monsters/humans/assassin.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Assassin',
    description: 'an assassin',
    experience: 105,
    health: 175,
    maxHealth: 175,
    race: 'blood',
    corpse: 12227,
    speed: 112,
    manaCost: 450,
    outfit: { lookType: 152, lookHead: 95, lookBody: 95, lookLegs: 95, lookFeet: 95, lookAddons: 3, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'assassin.lua' },
    changeTarget: { interval: 4000, chance: 0 },
    strategiesTarget: { nearest: 70, health: 20, damage: 10 },
    flags: {
        summonable: false,
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
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -120 },
        {
            name: 'physical',
            interval: 2000,
            chance: 15,
            minDamage: 0,
            maxDamage: -40,
            range: 7,
            target: true,
            shootEffect: 'throwingstar'
        }
    ],
    defenses: { defense: 15, armor: 17 },
    elements: [
        { type: 'physical', percent: -10 },
        { type: 'death', percent: -5 }
    ],
    immunities: [
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'You are on my deathlist!', yell: false },
            { text: 'Die!', yell: false },
            { text: 'Feel the hand of death!', yell: false }
        ]
    },
    loot: [
        { id: 2417, chance: 29980, maxCount: 2 },  // torch
        { id: 12219, chance: 220 },  // small diamond
        { id: 3031, chance: 83210, maxCount: 50 },  // gold coin
        { id: 3031, chance: 7250, maxCount: 14 },  // gold coin
        { id: 11933, chance: 970 },  // steel shield
        { id: 11916, chance: 1900 }   // plate shield
    ]
};
