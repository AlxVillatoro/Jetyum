'use strict';

/**
 * Minotauro.
 *
 * El primer monstruo de esta carpeta con armadura de verdad (11 puntos) y el
 * primero que pega lo suficiente como para que un novato tenga que llevar vendas.
 * En Tibia vive en ciudades subterráneas propias, no en una cueva suelta, y esa
 * diferencia se nota al diseñar una zona: aquí llegan en manada.
 *
 * DATOS: contrastados con la ficha de la criatura en TibiaXplorer
 * (https://www.tibiaxplorer.com/creatures/minotaur): 100 hp, 50 de experiencia, 11
 * de armadura, 45 de daño máximo, fuerte contra fuego y sagrado y débil a hielo y
 * muerte. No huye.
 *
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 *
 * BOTÍN: lo que suelta en Tibia que ya hay en este datapack (las armas, la ropa, la comida y las
 * gemas del OpenTibia Sprite Pack, con su nombre en `tools/importar-otsp.mjs`) y el oro. Cada
 * línea de `loot` dice qué es y su probabilidad.
 */

module.exports = {
    type: 'monster',
    name: 'Minotaur',

    description: 'a minotaur',
    experience: 50,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 100,
    maxHealth: 100,
    race: 'blood',
    speed: 84,
    manaCost: 330,

    outfit: {
        lookType: 25,
        head: 95,
        body: 115,
        legs: 95,
        feet: 115,
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
        runHealth: 0,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },

    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -45 }
    ],

    defenses: {
        defense: 11,
        armor: 11
    },

    /**
     * Fuerte contra fuego (80%: +20) y sagrado (90%: +10); débil a hielo y muerte
     * (110%: -10).
     */
    elements: [
        { type: 'fire', percent: 20 },
        { type: 'holy', percent: 10 },
        { type: 'ice', percent: -10 },
        { type: 'death', percent: -10 }
    ],

    immunities: [],

    voices: {
        interval: 6000,
        chance: 15,
        lines: [
            { text: 'Kaplar!', yell: false },
            { text: 'Hurr', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 65000, maxCount: 25 },  // gold coin (65%)
        { id: 2415, chance: 20000 },                // meat (20%)
        { id: 2402, chance: 12000 },                // axe (12%)
        { id: 2403, chance: 10000 },                // mace (10%)
        { id: 12079, chance: 8000 },                // leather legs (8%)
        { id: 11956, chance: 6000 },                // brass helmet (6%)
        { id: 2407, chance: 4000 },                 // chain armor (4%)
        { id: 11926, chance: 3000 }                 // brass shield (3%)
    ]
};
