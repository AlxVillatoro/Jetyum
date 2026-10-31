'use strict';

/**
 * Stalker: IMPORTADO de forserver-downgrade/data/monsters/humans/stalker.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Stalker',
    description: 'a stalker',
    experience: 90,
    health: 120,
    maxHealth: 120,
    race: 'blood',
    corpse: 12227,
    speed: 130,
    manaCost: 0,
    outfit: { lookType: 128, lookHead: 97, lookBody: 116, lookLegs: 95, lookFeet: 95, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'stalker.lua' },
    changeTarget: { interval: 4000, chance: 10 },
    strategiesTarget: { nearest: 60, random: 40 },
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
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -70 },
        { name: 'lifedrain', interval: 1000, chance: 15, minDamage: -20, maxDamage: -30, range: 1 }
    ],
    defenses: { defense: 15, armor: 14 },
    elements: [
        { type: 'physical', percent: -10 },
        { type: 'lifedrain', percent: 100 },
        { type: 'holy', percent: -10 },
        { type: 'death', percent: 10 }
    ],
    immunities: [
        { type: 'invisible' }
    ],
    loot: [
        { id: 3031, chance: 13000, maxCount: 8 },  // gold coin
        { id: 21000, chance: 8670 },  // blank rune
        { id: 12085, chance: 3500 },  // brass legs
        { id: 11926, chance: 5510 }   // brass shield
    ]
};
