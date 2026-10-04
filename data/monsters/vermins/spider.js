'use strict';

/**
 * Araña.
 *
 * El monstruo más flojo de la familia de los artrópodos, y el ejemplo más claro de
 * "muchos y molestos": pega poco, pero aparece en grupos y huye cuando se ve
 * perdida, así que perseguirla es tan peligroso como pelearle.
 *
 * DATOS: contrastados con la ficha de la criatura en TibiaXplorer
 * (https://www.tibiaxplorer.com/creatures/spider): 20 hp, 12 de experiencia, 2 de
 * armadura, 9 de daño máximo y huida a 5 hp. La velocidad es la de la ficha (76),
 * pero ojo con la escala: la de este motor no es la de Tibia.
 *
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 *
 * BOTÍN: lo que suelta en Tibia que ya hay en este datapack (las armas, la ropa, la comida y las
 * gemas del OpenTibia Sprite Pack, con su nombre en `tools/importar-otsp.mjs`) y el oro. Cada
 * línea de `loot` dice qué es y su probabilidad.
 */

module.exports = {
    type: 'monster',
    name: 'Spider',

    description: 'a spider',
    experience: 12,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 20,
    maxHealth: 20,
    race: 'blood',
    speed: 76,
    manaCost: 240,

    outfit: {
        lookType: 30,
        head: 30,
        body: 30,
        legs: 30,
        feet: 30,
        addons: 0
    },

    changeTarget: { interval: 4000, chance: 20 },

    strategiesTarget: {
        nearest: 100,
        health: 100,
        damage: 100,
        random: 0
    },

    /**
     * `runHealth: 5` es de la ficha y no un adorno: por debajo de 5 puntos de vida
     * la araña deja de pelear y escapa. Con 20 de vida eso pasa en el último
     * cuarto, así que el jugador la ve huir casi siempre.
     */
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
        runHealth: 5,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },

    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -9 }
    ],

    defenses: {
        defense: 2,
        armor: 2
    },

    /**
     * Recibe un 120% del daño de fuego: es débil a él, y una debilidad del 20% se
     * escribe -20.
     */
    elements: [
        { type: 'fire', percent: -20 }
    ],

    immunities: [],

    voices: {
        interval: 6000,
        chance: 10,
        lines: [
            { text: 'Hissss', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 50000, maxCount: 5 },  // gold coin (50%)
        { id: 12215, chance: 500 }                 // small amethyst (0.5%)
    ]
};
