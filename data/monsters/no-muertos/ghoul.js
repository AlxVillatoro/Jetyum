'use strict';

/**
 * Carroñero (ghoul).
 *
 * El no-muerto que sí da miedo de verdad a nivel bajo: 100 de vida, 70 de daño
 * físico y 27 de drenaje de vida, además de curarse solo. Es el techo de esta
 * carpeta y está a propósito: todo lo demás se puede pelear a nivel 1, esto no.
 *
 * DATOS: contrastados con la ficha de la criatura en TibiaXplorer
 * (https://www.tibiaxplorer.com/creatures/ghoul): 100 hp, 85 de experiencia, 8 de
 * armadura, 70 de daño físico más 27 de drenaje y curación de 9 a 15, débil a lo
 * sagrado, fuerte contra hielo, tierra y energía, e inmune a muerte y ahogamiento.
 *
 * APROXIMACIÓN: la ficha dice literalmente que huye a 0 puntos de vida, es decir,
 * que no huye. Se traduce a `runHealth: 0`.
 *
 * RACE: 'undead'. A diferencia de otros no-muertos, un carroñero SÍ deja sangre al
 * ser herido; aun así se marca como no-muerto, que es su clase real en Tibia y lo
 * que decidirá qué hechizos le afectan.
 *
 * ATAQUES: el drenaje (27) y la curación (9-15) van declarados y hoy no se aplican,
 * porque el motor solo usa `attacks[0]`. Son justo las dos habilidades que hacen
 * temible a esta criatura, así que se dejan escritas.
 *
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 *
 * BOTÍN: lo que suelta en Tibia que ya hay en este datapack (las armas, la ropa, la comida y las
 * gemas del OpenTibia Sprite Pack, con su nombre en `tools/importar-otsp.mjs`) y el oro. Cada
 * línea de `loot` dice qué es y su probabilidad.
 */

module.exports = {
    type: 'monster',
    name: 'Ghoul',

    description: 'a ghoul',
    experience: 85,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 100,
    maxHealth: 100,
    race: 'undead',
    speed: 72,
    manaCost: 480,

    outfit: {
        lookType: 18,
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
     * `runHealth: 0`: no huye nunca. `canWalkOnPoison: true`: no se envenena.
     */
    flags: {
        summonable: true,
        attackable: true,
        hostile: true,
        convinceable: true,
        pushable: false,
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
        canWalkOnPoison: true
    },

    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -70 },
        { name: 'lifedrain', interval: 4000, chance: 25, minDamage: 0, maxDamage: -27 },
        /**
         * La curación va con el máximo en POSITIVO a propósito. En un datapack de
         * TFS la convención del signo negativo es para "quita vida", así que drenar
         * vida se escribe negativo y curarse se escribe positivo; poner -15 aquí
         * diría justo lo contrario de lo que hace un carroñero.
         */
        { name: 'healing', interval: 4000, chance: 15, minDamage: 0, maxDamage: 15 }
    ],

    defenses: {
        defense: 8,
        armor: 8
    },

    /**
     * Fuerte contra hielo (90%: +10), tierra (80%: +20) y energía (70%: +30); débil
     * a lo sagrado (125%: -25).
     */
    elements: [
        { type: 'ice', percent: 10 },
        { type: 'earth', percent: 20 },
        { type: 'poison', percent: 20 },
        { type: 'energy', percent: 30 },
        { type: 'holy', percent: -25 }
    ],

    immunities: [
        { type: 'death', percent: 100 },
        { type: 'drown', percent: 100 }
    ],

    voices: {
        interval: 6000,
        chance: 15,
        lines: [
            { text: 'Hoooohhh', yell: false },
            { text: 'Aaaahhh', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 70000, maxCount: 30 },  // gold coin (70%)
        { id: 12166, chance: 25000 },               // bone (25%)
        { id: 12079, chance: 8000 },                // leather legs (8%)
        { id: 11956, chance: 4000 },                // brass helmet (4%)
        { id: 2407, chance: 3000 },                 // chain armor (3%)
        { id: 12211, chance: 1500 }                 // small ruby (1.5%)
    ]
};
