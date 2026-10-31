'use strict';

/**
 * LOS ATRIBUTOS: puntos que el jugador gana al subir de nivel y reparte como quiere.
 *
 *   fuerza        (strength)      + daño cuerpo a cuerpo y físico, + capacidad
 *   destreza      (dexterity)     + daño a distancia
 *   inteligencia  (intelligence)  + daño mágico (hechizos, runas, varitas) y + curación
 *   vitalidad     (vitality)      + vida máxima
 *   energía       (energy)        + maná máximo
 *
 * LOS PUNTOS SE GANAN JUGANDO (logros.js): al llegar a ciertos niveles, caminando, explorando, con la
 * magia, por el tiempo de juego activo y cazando especies distintas. Son LIBRES: vengan de donde
 * vengan, se ponen donde el jugador quiera, hasta `maxPerAttribute` en cada atributo. Bajar de
 * nivel al morir NO quita lo repartido: hasta recuperarlo, simplemente no hay puntos nuevos.
 * `resetCost` es lo que cuesta (en oro) recuperarlos todos para repartirlos de nuevo; 0 es gratis.
 *
 * Todo sale de `attributes` en config.js (ver `DEFECTO`). Como `vocacion.js`, son funciones puras
 * sobre un jugador: el mundo las llama (al aplicar el nivel, en el combate, en la capacidad).
 * Los nombres de los atributos van en inglés en el protocolo y en lo guardado, como los de las
 * skills; el cliente pone el suyo en cada idioma.
 */

const Logros = require('./logros');

const ATRIBUTOS = ['strength', 'dexterity', 'intelligence', 'vitality', 'energy'];

/** Lo que da cada punto si config.js no dice otra cosa. */
const DEFECTO = {
    enabled: true,
    maxPerAttribute: 100,
    resetCost: 500,
    levelMilestones: Logros.NIVELES,
    sources: Logros.DEFECTO,
    strength: { meleeDamage: 1, capacity: 5 },       // % de daño cuerpo a cuerpo y físico, onzas
    dexterity: { distanceDamage: 1 },                // % de daño a distancia
    intelligence: { magicDamage: 1, healing: 1 },     // % de daño mágico y de curación
    vitality: { health: 5 },                          // vida máxima
    energy: { mana: 5 }                               // maná máximo
};

/** Mezcla la configuración de config.js con la de por defecto (sin fiarse de los tipos). */
function normalizarConfig(config) {
    const c = config || {};
    const numero = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
    const conf = {
        enabled: c.enabled !== false,
        // 0: sin tope.
        maxPerAttribute: Math.floor(numero(c.maxPerAttribute, DEFECTO.maxPerAttribute)),
        resetCost: Math.floor(numero(c.resetCost, DEFECTO.resetCost)),
        levelMilestones: Logros.normalizarNiveles(c.levelMilestones),
        sources: Logros.normalizarFuentes(c.sources)
    };
    ATRIBUTOS.forEach((a) => {
        conf[a] = {};
        Object.keys(DEFECTO[a]).forEach((k) => {
            conf[a][k] = numero(c[a] && c[a][k], DEFECTO[a][k]);
        });
    });
    return conf;
}

function vacios() {
    return Object.fromEntries(ATRIBUTOS.map((a) => [a, 0]));
}

/** Los atributos del jugador (siempre los cinco, enteros y no negativos). */
function de(jugador) {
    if (!jugador.atributos) {
        jugador.atributos = vacios();
    }
    return jugador.atributos;
}

function valor(jugador, atributo) {
    return (jugador && jugador.atributos && jugador.atributos[atributo]) || 0;
}

function gastados(jugador) {
    return ATRIBUTOS.reduce((total, a) => total + valor(jugador, a), 0);
}

/** Los puntos ganados, de todas las fuentes (logros.js). */
function ganados(jugador, conf) {
    return conf.enabled ? Logros.total(jugador, conf) : 0;
}

/** Los que le quedan por repartir (nunca menos de cero: ver lo de bajar de nivel arriba). */
function libres(jugador, conf) {
    return Math.max(0, ganados(jugador, conf) - gastados(jugador));
}

/**
 * Pone `cantidad` puntos en un atributo, si los tiene.
 * @returns {{ok: boolean, razon?: string, puestos?: number}}
 */
function asignar(jugador, atributo, cantidad, conf) {
    if (!conf.enabled) {
        return { ok: false, razon: 'desactivados' };
    }
    if (!ATRIBUTOS.includes(atributo)) {
        return { ok: false, razon: 'noExiste' };
    }
    const n = Math.floor(Number(cantidad) || 1);
    if (n < 1) {
        return { ok: false, razon: 'cantidad' };
    }
    const quedan = libres(jugador, conf);
    if (quedan <= 0) {
        return { ok: false, razon: 'sinPuntos' };
    }
    const cabe = conf.maxPerAttribute > 0 ? conf.maxPerAttribute - valor(jugador, atributo) : Infinity;
    if (cabe <= 0) {
        return { ok: false, razon: 'tope', tope: conf.maxPerAttribute };
    }
    const puestos = Math.min(n, quedan, cabe);
    de(jugador)[atributo] += puestos;
    return { ok: true, puestos };
}

/** Devuelve todos los puntos para repartirlos de nuevo (quien llama cobra `resetCost`). */
function reiniciar(jugador) {
    const habia = gastados(jugador);
    jugador.atributos = vacios();
    return habia;
}

/** Lo que suma a la vida, al maná y a la capacidad (en onzas). */
function extras(jugador, conf) {
    return {
        vida: Math.floor(valor(jugador, 'vitality') * conf.vitality.health),
        mana: Math.floor(valor(jugador, 'energy') * conf.energy.mana),
        capacidad: Math.floor(valor(jugador, 'strength') * conf.strength.capacity)
    };
}

/**
 * El multiplicador de daño (o de curación) de un jugador para un tipo de golpe:
 * 'melee', 'distance', 'magic', 'physical' (un hechizo físico, como «exori») o 'healing'.
 */
function multiplicador(jugador, tipo, conf) {
    if (!jugador || !conf || !conf.enabled) {
        return 1;
    }
    const porcentaje = {
        melee: valor(jugador, 'strength') * conf.strength.meleeDamage,
        physical: valor(jugador, 'strength') * conf.strength.meleeDamage,
        distance: valor(jugador, 'dexterity') * conf.dexterity.distanceDamage,
        magic: valor(jugador, 'intelligence') * conf.intelligence.magicDamage,
        healing: valor(jugador, 'intelligence') * conf.intelligence.healing
    }[tipo] || 0;
    return 1 + porcentaje / 100;
}

/**
 * Lo que se manda al cliente (dentro de PLAYER_STATS) para la ventana de atributos: los valores,
 * los puntos por repartir, el tope y cómo va cada fuente de puntos (`ahora` y `lugaresTotales`
 * para eso: ver `Logros.paraElCliente`).
 */
function paraElCliente(jugador, conf, ahora, lugaresTotales) {
    return {
        enabled: conf.enabled,
        values: { ...vacios(), ...(jugador.atributos || {}) },
        free: libres(jugador, conf),
        max: conf.maxPerAttribute,
        resetCost: conf.resetCost,
        sources: Logros.paraElCliente(jugador, conf, ahora === undefined ? Date.now() : ahora, lugaresTotales),
        // Lo que da cada punto, para explicarlo en la ventana sin repetir los números allí.
        perPoint: Object.fromEntries(ATRIBUTOS.map((a) => [a, { ...conf[a] }]))
    };
}

/** Lo que se guarda (dentro de `progress`) y cómo se lee, sin fiarse de lo guardado. */
function paraGuardar(jugador) {
    return { ...vacios(), ...(jugador.atributos || {}) };
}

function cargar(jugador, guardado) {
    const a = vacios();
    ATRIBUTOS.forEach((k) => {
        a[k] = Math.max(0, Math.floor(Number(guardado && guardado[k]) || 0));
    });
    jugador.atributos = a;
    return jugador;
}

module.exports = {
    ATRIBUTOS,
    DEFECTO,
    normalizarConfig,
    gastados,
    ganados,
    libres,
    asignar,
    reiniciar,
    extras,
    multiplicador,
    paraElCliente,
    paraGuardar,
    cargar
};
