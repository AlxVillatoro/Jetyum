'use strict';

/**
 * Goblin Leader: IMPORTADO de forserver-downgrade/data/monsters/humanoids/goblin_leader.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Goblin Leader',
    description: 'a goblin leader',
    experience: 75,
    health: 50,
    maxHealth: 50,
    race: 'blood',
    corpse: 12234,
    speed: 60,
    manaCost: 290,
    outfit: { lookType: 61, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humanoids', archivo: 'goblin_leader.lua' },
    changeTarget: { interval: 4000, chance: 10 },
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
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 1,
        runHealth: 10,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -50 },
        {
            name: 'physical',
            interval: 2000,
            chance: 15,
            minDamage: 0,
            maxDamage: -45,
            range: 7,
            target: true,
            shootEffect: 'smallstone'
        }
    ],
    defenses: { defense: 10, armor: 7 },
    elements: [],
    immunities: [],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Go go, Gobo attack!!', yell: false },
            { text: 'Me the greenest and the meanest!', yell: false },
            { text: 'Me have power to crush you!', yell: false },
            { text: 'Goblinkiller! Catch him !!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 40000, maxCount: 10 },  // gold coin
        { id: 12166, chance: 11500 },  // bone
        { id: 2401, chance: 10300 },  // dagger
        { id: 11725, chance: 15400 },  // short sword
        { id: 2410, chance: 16670 },  // leather helmet
        { id: 2406, chance: 5000 }   // leather armor
    ]
};
