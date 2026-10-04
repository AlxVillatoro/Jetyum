'use strict';

/**
 * Cíclope.
 *
 * El monstruo más grande de esta carpeta: 260 de vida, 17 de armadura y 105 de daño
 * de un solo golpe. En Tibia es el primer "jefe de zona" que se encuentra un jugador
 * que sale de las cuevas de novato, y aquí cumple el mismo papel: es el techo contra
 * el que se mide el equipo.
 *
 * DATOS: contrastados con la ficha de la criatura en TibiaXplorer
 * (https://www.tibiaxplorer.com/creatures/cyclops): 260 hp, 150 de experiencia, 17
 * de armadura, 105 de daño máximo, fuerte contra energía y sagrado y débil a tierra
 * y muerte. No huye.
 *
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 *
 * BOTÍN: lo que suelta en Tibia que ya hay en este datapack (las armas, la ropa, la comida y las
 * gemas del OpenTibia Sprite Pack, con su nombre en `tools/importar-otsp.mjs`) y el oro. Cada
 * línea de `loot` dice qué es y su probabilidad.
 */

module.exports = {
    type: 'monster',
    name: 'Cyclops',

    description: 'a cyclops',
    experience: 150,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 260,
    maxHealth: 260,
    race: 'blood',
    speed: 95,
    manaCost: 900,

    outfit: {
        lookType: 22,
        head: 100,
        body: 100,
        legs: 100,
        feet: 100,
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
     * `canPushItems: true` y `canPushCreatures: true`: la ficha dice que un cíclope
     * aparta de su camino lo que le estorbe y mata a las criaturas débiles que se le
     * crucen. Es la razón de que en Tibia no se le pueda bloquear con objetos, y sin
     * estas dos banderas el motor lo trataría como a cualquier bicho de cueva.
     */
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: false,
        rewardBoss: false,
        illusionable: true,
        canPushItems: true,
        canPushCreatures: true,
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
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -105 }
    ],

    defenses: {
        defense: 17,
        armor: 17
    },

    /**
     * Fuerte contra energía (75%: +25) y sagrado (80%: +20); débil a tierra y muerte
     * (110%: -10).
     */
    elements: [
        { type: 'energy', percent: 25 },
        { type: 'holy', percent: 20 },
        { type: 'earth', percent: -10 },
        { type: 'death', percent: -10 }
    ],

    immunities: [],

    voices: {
        interval: 7000,
        chance: 15,
        lines: [
            { text: 'Human, uh whil dyh!', yell: true },
            { text: 'Toks utat.', yell: false },
            { text: 'Let da mashing begin!', yell: true }
        ]
    },

    loot: [
        { id: 3031, chance: 80000, maxCount: 47 },  // gold coin (80%)
        { id: 2415, chance: 30000 },                // meat (30%)
        { id: 11725, chance: 10000 },               // short sword (10%)
        { id: 11916, chance: 4000 },                // plate shield (4%)
        { id: 11805, chance: 2500 },                // battle hammer (2.5%)
        { id: 12085, chance: 2000 },                // brass legs (2%)
        { id: 12219, chance: 800 }                  // small diamond (0.8%)
    ]
};
