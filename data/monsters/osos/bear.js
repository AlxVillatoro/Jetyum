'use strict';

/**
 * Oso.
 *
 * No es un monstruo de mazmorra sino de superficie: bosques y montañas. Aguanta
 * mucho para lo que pega (80 de vida contra 25 de daño) y huye cuando le queda
 * poco, así que el combate se alarga y se convierte en una persecución. En Tibia
 * es el primer bicho que enseña a un novato que perseguir no siempre sale bien.
 *
 * DATOS: contrastados con la ficha de la criatura en TibiaXplorer
 * (https://www.tibiaxplorer.com/creatures/bear): 80 hp, 23 de experiencia, 6 de
 * armadura, 25 de daño máximo, huida a 15 hp, fuerte contra lo sagrado y débil a
 * hielo y muerte. La velocidad es la de la ficha, con el aviso de siempre: la
 * escala de este motor no es la de Tibia.
 *
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 *
 * BOTÍN: lo que suelta en Tibia que ya hay en este datapack (las armas, la ropa, la comida y las
 * gemas del OpenTibia Sprite Pack, con su nombre en `tools/importar-otsp.mjs`) y el oro. Cada
 * línea de `loot` dice qué es y su probabilidad.
 */

module.exports = {
    type: 'monster',
    name: 'Bear',

    description: 'a bear',
    experience: 23,
    corpse: 0,   // el pack no trae su cuerpo: deja la caja de corpseFallbackId (config.js)
    health: 80,
    maxHealth: 80,
    race: 'blood',
    speed: 78,
    manaCost: 300,

    outfit: {
        lookType: 16,
        head: 80,
        body: 60,
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

    /**
     * `pushable: false`: un oso no se empuja, y eso cambia por completo cómo se le
     * puede bloquear el paso a un jugador que huye.
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
        runHealth: 15,
        healthHidden: false,
        isBlockable: false,
        canWalkOnEnergy: false,
        canWalkOnFire: false,
        canWalkOnPoison: false
    },

    attacks: [
        { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -25 }
    ],

    defenses: {
        defense: 6,
        armor: 6
    },

    /**
     * Fuerte contra lo sagrado (recibe un 90%: +10) y débil a hielo (110%: -10) y
     * muerte (105%: -5).
     */
    elements: [
        { type: 'holy', percent: 10 },
        { type: 'ice', percent: -10 },
        { type: 'death', percent: -5 }
    ],

    immunities: [],

    voices: {
        interval: 6000,
        chance: 15,
        lines: [
            { text: 'Grrrr', yell: false },
            { text: 'Groarrr', yell: false }
        ]
    },

    loot: [
        { id: 3031, chance: 55000, maxCount: 12 },  // gold coin (55%)
        { id: 2415, chance: 40000 },                // meat (40%)
        { id: 12181, chance: 20000, maxCount: 2 }   // ham (20%)
    ]
};
