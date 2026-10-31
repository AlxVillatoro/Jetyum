'use strict';

/**
 * Amazon: IMPORTADO de forserver-downgrade/data/monsters/humans/amazon.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Amazon',
    description: 'an amazon',
    experience: 60,
    health: 110,
    maxHealth: 110,
    race: 'blood',
    corpse: 12227,
    speed: 86,
    manaCost: 390,
    outfit: { lookType: 137, lookHead: 113, lookBody: 120, lookLegs: 95, lookFeet: 115, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'amazon.lua' },
    changeTarget: { interval: 4000, chance: 10 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: true,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 4,
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
            chance: 15,
            minDamage: 0,
            maxDamage: -40,
            range: 5,
            target: true,
            shootEffect: 'throwingknife'
        }
    ],
    defenses: { defense: 10, armor: 10 },
    elements: [
        { type: 'physical', percent: -5 },
        { type: 'death', percent: -5 }
    ],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Your head shall be mine!', yell: false },
            { text: 'Your head will be mine!', yell: false },
            { text: 'Yeeee ha!', yell: false }
        ]
    },
    loot: [
        { id: 2401, chance: 80000 },  // dagger
        { id: 3031, chance: 40000, maxCount: 20 },  // gold coin
        { id: 11704, chance: 23000 },  // sabre
        { id: 2417, chance: 1000 },  // torch
        { id: 12211, chance: 130 }   // small ruby
    ]
};
