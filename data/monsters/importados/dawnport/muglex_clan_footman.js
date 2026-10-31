'use strict';

/**
 * Muglex Clan Footman: IMPORTADO de forserver-downgrade/data/monsters/dawnport/muglex_clan_footman.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Muglex Clan Footman',
    description: 'a muglex clan footman',
    experience: 25,
    health: 50,
    maxHealth: 50,
    race: 'blood',
    corpse: 12234,
    speed: 60,
    manaCost: 0,
    outfit: { lookType: 61, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'dawnport', archivo: 'muglex_clan_footman.lua' },
    changeTarget: { interval: 2000, chance: 0 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
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
        runHealth: 15,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -10 },
        {
            name: 'physical',
            interval: 2000,
            chance: 8,
            minDamage: 0,
            maxDamage: -22,
            range: 7,
            target: true,
            shootEffect: 'smallstone'
        }
    ],
    defenses: { defense: 4, armor: 2 },
    elements: [],
    immunities: [],
    loot: [
        { id: 12166, chance: 1410 },  // bone
        { id: 2401, chance: 17040 },  // dagger
        { id: 3031, chance: 100000, maxCount: 6 },  // gold coin
        { id: 2406, chance: 6060 },  // leather armor
        { id: 2410, chance: 2680 },  // leather helmet
        { id: 11725, chance: 9720 }   // short sword
    ]
};
