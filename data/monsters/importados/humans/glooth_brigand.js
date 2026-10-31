'use strict';

/**
 * Glooth Brigand: IMPORTADO de forserver-downgrade/data/monsters/humans/glooth_brigand.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Glooth Brigand',
    description: 'a glooth brigand',
    experience: 1900,
    health: 2400,
    maxHealth: 2400,
    race: 'blood',
    corpse: 12227,
    speed: 160,
    manaCost: 0,
    outfit: {
        lookType: 137,
        lookHead: 114,
        lookBody: 114,
        lookLegs: 110,
        lookFeet: 114,
        lookAddons: 0,
        lookMount: 0
    },
    origen: { carpeta: 'humans', archivo: 'glooth_brigand.lua' },
    changeTarget: { interval: 5000, chance: 5 },
    strategiesTarget: { nearest: 70, health: 10, damage: 10, random: 10 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: true,
        convinceable: false,
        pushable: false,
        rewardBoss: false,
        illusionable: false,
        canPushItems: true,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 1,
        runHealth: 0,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: true
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -306 },
        {
            name: 'physical',
            interval: 2000,
            chance: 50,
            minDamage: -40,
            maxDamage: -200,
            range: 8,
            target: true,
            shootEffect: 'arrow'
        }
    ],
    defenses: {
        defense: 26,
        armor: 51,
        list: [
            { name: 'healing', interval: 3000, chance: 35, minDamage: 200, maxDamage: 245 }
        ]
    },
    elements: [
        { type: 'physical', percent: 10 },
        { type: 'energy', percent: 25 },
        { type: 'earth', percent: 100 },
        { type: 'ice', percent: 10 },
        { type: 'holy', percent: -5 },
        { type: 'death', percent: 15 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    loot: [
        { id: 3031, chance: 100000, maxCount: 100 },  // gold coin
        { id: 2152, chance: 100000, maxCount: 3 }   // platinum coin
    ]
};
