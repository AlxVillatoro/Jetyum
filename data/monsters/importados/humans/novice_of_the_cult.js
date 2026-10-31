'use strict';

/**
 * Novice of the Cult: IMPORTADO de forserver-downgrade/data/monsters/humans/novice_of_the_cult.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Novice of the Cult',
    description: 'a novice of the cult',
    experience: 100,
    health: 285,
    maxHealth: 285,
    race: 'blood',
    corpse: 12227,
    speed: 100,
    manaCost: 0,
    outfit: { lookType: 133, lookHead: 114, lookBody: 114, lookLegs: 76, lookFeet: 114, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'novice_of_the_cult.lua' },
    changeTarget: { interval: 4000, chance: 10 },
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
        runHealth: 40,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        {
            name: 'melee',
            interval: 2000,
            chance: 100,
            minDamage: 0,
            maxDamage: -65,
            condition: { type: 'veneno', ticks: 1, interval: 4000, value: 1 }
        },
        {
            name: 'lifedrain',
            interval: 2000,
            chance: 15,
            minDamage: -20,
            maxDamage: -80,
            range: 7,
            radius: 1,
            target: true,
            shootEffect: 'poison'
        }
    ],
    defenses: {
        defense: 15,
        armor: 15,
        list: [
            { name: 'healing', interval: 2000, chance: 15, minDamage: 20, maxDamage: 40 }
        ]
    },
    elements: [
        { type: 'physical', percent: -10 },
        { type: 'energy', percent: -8 },
        { type: 'earth', percent: 10 },
        { type: 'fire', percent: -5 },
        { type: 'ice', percent: 10 },
        { type: 'holy', percent: 10 },
        { type: 'death', percent: -8 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Fear us!', yell: false },
            { text: 'You will not tell anyone what you have seen!', yell: false },
            { text: 'Your curiosity will be punished!', yell: false }
        ]
    },
    loot: [
        { id: 12219, chance: 210 },  // small diamond
        { id: 3031, chance: 43380, maxCount: 40 }   // gold coin
    ]
};
