'use strict';

/**
 * Angry Adventurer: IMPORTADO de forserver-downgrade/data/monsters/humans/angry_adventurer.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Angry Adventurer',
    description: 'an angry adventurer',
    experience: 50,
    health: 65,
    maxHealth: 65,
    race: 'blood',
    corpse: 12227,
    speed: 97,
    manaCost: 0,
    outfit: { lookType: 129, lookHead: 92, lookBody: 15, lookLegs: 92, lookFeet: 82, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'angry_adventurer.lua' },
    changeTarget: { interval: 4000, chance: 10 },
    strategiesTarget: { nearest: 100 },
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
        canWalkOnEnergy: true,
        canWalkOnFire: true,
        canWalkOnPoison: true
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -25 }
    ],
    defenses: { defense: 15, armor: 15 },
    elements: [],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    loot: [
        { id: 2416, chance: 20000 }   // bread (relleno: la ficha sólo daba oro)
    ]
};
