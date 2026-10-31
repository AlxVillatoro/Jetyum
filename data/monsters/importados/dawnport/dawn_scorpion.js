'use strict';

/**
 * Dawn Scorpion: IMPORTADO de forserver-downgrade/data/monsters/dawnport/dawn_scorpion.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Dawn Scorpion',
    description: 'a dawn scorpion',
    experience: 45,
    health: 65,
    maxHealth: 65,
    race: 'venom',
    corpse: 0,
    speed: 72,
    manaCost: 310,
    outfit: { lookType: 43, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'dawnport', archivo: 'dawn_scorpion.lua' },
    changeTarget: { interval: 2000, chance: 10 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: true,
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
        runHealth: 5,
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
            maxDamage: -30,
            condition: { type: 'veneno', ticks: 10, interval: 4000, value: 4 }
        },
        {
            name: 'earth',
            interval: 2000,
            chance: 10,
            minDamage: -10,
            maxDamage: -20,
            range: 1,
            target: true,
            shootEffect: 'poison'
        }
    ],
    defenses: { defense: 5, armor: 11 },
    elements: [
        { type: 'energy', percent: 5 },
        { type: 'earth', percent: 100 },
        { type: 'fire', percent: 5 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    loot: [
        { id: 3031, chance: 100000, maxCount: 4 },  // gold coin
        { id: 2415, chance: 20000 }   // meat (relleno: la ficha sólo daba oro)
    ]
};
