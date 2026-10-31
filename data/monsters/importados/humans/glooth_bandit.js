'use strict';

/**
 * Glooth Bandit: IMPORTADO de forserver-downgrade/data/monsters/humans/glooth_bandit.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Glooth Bandit',
    description: 'a glooth bandit',
    experience: 2000,
    health: 2600,
    maxHealth: 2600,
    race: 'blood',
    corpse: 12227,
    speed: 150,
    manaCost: 0,
    outfit: { lookType: 129, lookHead: 115, lookBody: 80, lookLegs: 114, lookFeet: 114, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'glooth_bandit.lua' },
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
            minDamage: -60,
            maxDamage: -200,
            range: 8,
            target: true,
            shootEffect: 'arrow'
        }
    ],
    defenses: {
        defense: 32,
        armor: 46,
        list: [
            { name: 'healing', interval: 3000, chance: 35, minDamage: 200, maxDamage: 250 }
        ]
    },
    elements: [
        { type: 'physical', percent: 15 },
        { type: 'energy', percent: 20 },
        { type: 'earth', percent: 100 },
        { type: 'fire', percent: -5 },
        { type: 'ice', percent: 10 },
        { type: 'death', percent: 20 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    loot: [
        { id: 3031, chance: 100000, maxCount: 100 },  // gold coin
        { id: 2152, chance: 100000, maxCount: 3 },  // platinum coin
        { id: 12213, chance: 1492, maxCount: 2 }   // small emerald
    ]
};
