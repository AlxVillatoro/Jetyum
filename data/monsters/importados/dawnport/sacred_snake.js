'use strict';

/**
 * Sacred Snake: IMPORTADO de forserver-downgrade/data/monsters/dawnport/sacred_snake.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Sacred Snake',
    description: 'a sacred snake',
    experience: 0,
    health: 10,
    maxHealth: 10,
    race: 'blood',
    corpse: 0,
    speed: 60,
    manaCost: 0,
    outfit: { lookType: 28, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'dawnport', archivo: 'sacred_snake.lua' },
    changeTarget: { interval: 4000, chance: 0 },
    strategiesTarget: { nearest: 70, health: 10, damage: 10, random: 10 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: false,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
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
        {
            name: 'melee',
            interval: 2000,
            chance: 100,
            minDamage: 0,
            maxDamage: -8,
            condition: { type: 'veneno', ticks: 1, interval: 4000, value: 1 }
        }
    ],
    defenses: { defense: 5, armor: 0 },
    elements: [
        { type: 'energy', percent: 20 },
        { type: 'earth', percent: 40 },
        { type: 'fire', percent: -10 },
        { type: 'ice', percent: -10 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    loot: [
        { id: 2415, chance: 20000 }   // meat (relleno: la ficha sólo daba oro)
    ]
};
