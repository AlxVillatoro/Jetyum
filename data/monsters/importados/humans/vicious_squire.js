'use strict';

/**
 * Vicious Squire: IMPORTADO de forserver-downgrade/data/monsters/humans/vicious_squire.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Vicious Squire',
    description: 'a vicious squire',
    experience: 900,
    health: 1000,
    maxHealth: 1000,
    race: 'blood',
    corpse: 12227,
    speed: 130,
    manaCost: 0,
    outfit: { lookType: 131, lookHead: 97, lookBody: 24, lookLegs: 73, lookFeet: 116, lookAddons: 1, lookMount: 0 },
    origen: { carpeta: 'humans', archivo: 'vicious_squire.lua' },
    changeTarget: { interval: 4000, chance: 20 },
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
        canWalkOnEnergy: true,
        canWalkOnFire: false,
        canWalkOnPoison: true
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 10, maxDamage: -175 },
        {
            name: 'physical',
            interval: 2000,
            chance: 40,
            minDamage: 10,
            maxDamage: -100,
            range: 7,
            target: true,
            shootEffect: 'bolt'
        }
    ],
    defenses: {
        defense: 50,
        armor: 30,
        list: [
            { name: 'healing', interval: 4000, chance: 25, minDamage: 20, maxDamage: 80 }
        ]
    },
    elements: [
        { type: 'physical', percent: 10 },
        { type: 'energy', percent: 40 },
        { type: 'earth', percent: 50 },
        { type: 'fire', percent: 30 },
        { type: 'ice', percent: 10 },
        { type: 'holy', percent: 50 },
        { type: 'death', percent: -20 }
    ],
    immunities: [
        { type: 'paralyze' },
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'Your stuff will be mine soon!', yell: false },
            { text: 'I\'ll cut you a bloody grin!', yell: false },
            { text: 'For hurting me, my sire will kill you!', yell: false },
            { text: 'You shouldn\'t have come here!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 75410, maxCount: 30 },  // gold coin
        { id: 2415, chance: 5000 },  // meat
        { id: 12137, chance: 1000 },  // rope
        { id: 12219, chance: 830 }   // small diamond
    ]
};
