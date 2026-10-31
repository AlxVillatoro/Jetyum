'use strict';

/**
 * Minotaur Cult Follower: IMPORTADO de forserver-downgrade/data/monsters/humanoids/minotaur_cult_follower.lua por tools/importar-monstruos.mjs.
 * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.
 */

module.exports = {
    type: 'monster',
    name: 'Minotaur Cult Follower',
    description: 'a minotaur cult follower',
    experience: 950,
    health: 1600,
    maxHealth: 1600,
    race: 'blood',
    corpse: 0,
    speed: 115,
    manaCost: 0,
    outfit: { lookType: 25, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0, lookAddons: 0, lookMount: 0 },
    origen: { carpeta: 'humanoids', archivo: 'minotaur_cult_follower.lua' },
    changeTarget: { interval: 4000, chance: 0 },
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
        staticAttackChance: 95,
        targetDistance: 1,
        runHealth: 0,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },
    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -240 },
        { name: 'physical', interval: 2000, chance: 20, minDamage: -110, maxDamage: -210, radius: 3 }
    ],
    defenses: {
        defense: 25,
        armor: 32,
        list: [
            { name: 'healing', interval: 1000, chance: 20, minDamage: 100, maxDamage: 200 }
        ]
    },
    elements: [
        { type: 'fire', percent: 20 },
        { type: 'ice', percent: -10 },
        { type: 'holy', percent: 10 },
        { type: 'death', percent: -10 }
    ],
    immunities: [
        { type: 'invisible' }
    ],
    voices: {
        interval: 5000,
        chance: 10,
        lines: [
            { text: 'We will rule!', yell: false }
        ]
    },
    loot: [
        { id: 3031, chance: 100000, maxCount: 150 },  // gold coin
        { id: 11916, chance: 20020 },  // plate shield
        { id: 12211, chance: 3690, maxCount: 2 },  // small ruby
        { id: 2152, chance: 65250, maxCount: 3 },  // platinum coin
        { id: 11916, chance: 20710 },  // plate shield
        { id: 12213, chance: 3410, maxCount: 2 },  // small emerald
        { id: 12215, chance: 2950, maxCount: 2 },  // small amethyst
        { id: 12181, chance: 59410 },  // ham
        { id: 2415, chance: 8020 }   // meat
    ]
};
