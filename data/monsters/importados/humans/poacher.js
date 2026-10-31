'use strict';

/**
 * Poacher: IMPORTADO de forserver-downgrade/data/monsters/humans/poacher.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Poacher',
    description: 'a poacher',
    experience: 70,
    health: 90,
    maxHealth: 90,
    race: 'blood',
    corpse: 12227,
    speed: 99,
    manaCost: 530,
    outfit: { lookType: 129, lookHead: 60, lookBody: 118, lookLegs: 118, lookFeet: 116, lookAddons: 1, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'poacher.lua' },
    changeTarget: { interval: 5000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: false,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 1,
        runHealth: 5,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -35 },
        {
            name: 'physical',
            interval: 2000,
            chance: 15,
            minDamage: 0,
            maxDamage: -35,
            range: 7,
            target: true,
            shootEffect: 'arrow'
        }
    ],
    defenses: { defense: 15, armor: 10 },
    elements: [],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'You will not live to tell anyone!', yell: false },
            { text: 'You are my game today!', yell: false },
            { text: 'Look what has stepped into my trap!', yell: false }
        ]
    },
    loot: [
        { id: 2417, chance: 4180 },  // torch
        { id: 2404, chance: 14930 },  // bow
        { id: 2410, chance: 30600 },  // leather helmet
        { id: 12138, chance: 49500, maxCount: 17 },  // arrow
        { id: 12079, chance: 26740 }   // leather legs
    ]
};
