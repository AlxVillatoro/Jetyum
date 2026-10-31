'use strict';

/**
 * Dryad: IMPORTADO de forserver-downgrade/data/monsters/fey/dryad.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Dryad',
    description: 'a dryad',
    experience: 190,
    health: 310,
    maxHealth: 310,
    race: 'blood',
    corpse: 12227,
    speed: 115,
    manaCost: 0,
    outfit: { lookType: 137, lookHead: 99, lookBody: 41, lookLegs: 5, lookFeet: 102, lookAddons: 3, lookMount: 0 },
    origen: { carpeta: 'fey', archivo: 'dryad.lua' },
    changeTarget: { interval: 4000, chance: 10 },
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
        targetDistance: 4,
        runHealth: 10,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: true
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -150 },
        {
            name: 'physical',
            interval: 2000,
            chance: 15,
            minDamage: 0,
            maxDamage: -40,
            range: 7,
            target: true,
            shootEffect: 'throwingknife'
        }
    ],
    defenses: { defense: 10, armor: 15 },
    elements: [
        { type: 'energy', percent: 30 },
        { type: 'earth', percent: 100 },
        { type: 'fire', percent: -20 },
        { type: 'ice', percent: 20 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Feel the wrath of mother Tibia!', yell: false },
            { text: 'Defiler of nature!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 40000, maxCount: 20 },  // gold coin
        { id: 2416, chance: 20000 }   // bread (relleno: la ficha sólo daba oro)
    ]
};
