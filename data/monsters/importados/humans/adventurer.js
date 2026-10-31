'use strict';

/**
 * Adventurer: IMPORTADO de forserver-downgrade/data/monsters/humans/adventurer.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Adventurer',
    description: 'an adventurer',
    experience: 0,
    health: 65,
    maxHealth: 65,
    race: 'blood',
    corpse: 12227,
    speed: 53,
    manaCost: 0,
    outfit: { lookType: 129, lookHead: 93, lookBody: 15, lookLegs: 72, lookFeet: 80, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'adventurer.lua' },
    changeTarget: { interval: 4000, chance: 10 },
    strategiesTarget: { nearest: 100 },
    flags: {
        summonable: false,
        attackable: true,
        hostile: false,
        convinceable: false,
        pushable: false,
        rewardBoss: false,
        illusionable: false,
        canPushItems: false,
        canPushCreatures: false,
        staticAttackChance: 90,
        targetDistance: 4,
        runHealth: 65,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -5 }
    ],
    defenses: { defense: 5, armor: 8 },
    elements: [],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    loot: [
        { id: 2416, chance: 20000 }   // bread (relleno: la ficha sólo daba oro)
    ]
};
