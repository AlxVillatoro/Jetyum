'use strict';

/**
 * Troll.
 *
 * El hermano pobre del goblin: mismo sitio en el mundo (tribus en cuevas y
 * colinas), misma vida y menos pegada. Es el monstruo con el que casi todo el
 * mundo aprendió a pelear en Tibia, y por eso está aquí.
 *
 * DATOS: contrastados con la ficha de la criatura en TibiaXplorer
 * (https://www.tibiaxplorer.com/creatures/troll): 50 hp, 20 de experiencia, 6 de
 * armadura, 15 de daño máximo, huida a 15 hp, fuerte contra energía y sagrado y
 * débil a tierra y muerte.
 *
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 *
 * BOTÍN: lo que suelta en Tibia que ya hay en este datapack (las armas, la ropa, la comida y las
 * gemas del OpenTibia Sprite Pack, con su nombre en `tools/importar-otsp.mjs`) y el oro. Cada
 * línea de `loot` dice qué es y su probabilidad.
 */

module.exports = {
    type: 'monster',
    name: 'Troll',

    description: 'a troll',
    experience: 20,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 50,
    maxHealth: 50,
    race: 'blood',
    speed: 70,
    manaCost: 290,

    outfit: {
        lookType: 15,
        head: 60,
        body: 80,
        legs: 60,
        feet: 60,
        addons: 0
    },

    changeTarget: { interval: 4000, chance: 20 },

    strategiesTarget: {
        nearest: 100,
        health: 100,
        damage: 100,
        random: 0
    },

    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -15 }
    ],

    defenses: {
        defense: 6,
        armor: 6
    },

    /**
     * Fuerte contra energía (80%: +20) y sagrado (90%: +10); débil a tierra y muerte
     * (110%: -10). Es exactamente el mismo perfil que el goblin, y no es casualidad:
     * en Tibia comparten familia de resistencias.
     */
    elements: [
        { type: 'energy', percent: 20 },
        { type: 'holy', percent: 10 },
        { type: 'earth', percent: -10 },
        { type: 'death', percent: -10 }
    ],

    immunities: [],

    voices: {
        interval: 5000,
        chance: 15,
        lines: [
            { text: 'Grrr', yell: false },
            { text: 'Groar', yell: false },
            { text: 'Gruntz!', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 60000, maxCount: 12 },  // gold coin (60%)
        { id: 11849, chance: 18000 },               // hand axe (18%)
        { id: 2410, chance: 12000 },                // leather helmet (12%)
        { id: 2411, chance: 10000 },                // leather boots (10%)
        { id: 2409, chance: 10000 },                // wooden shield (10%)
        { id: 12137, chance: 8000 },                // rope (8%)
        { id: 2415, chance: 15000 },                // meat (15%)
        { id: 11923, chance: 3000 }                 // studded shield (3%)
    ]
};
