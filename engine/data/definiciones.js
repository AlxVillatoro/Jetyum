'use strict';

/**
 * Las definiciones del jugador: vocaciones y aspectos.
 *
 * En TFS son `data/XML/vocations.xml` y `data/XML/outfits.xml`; aquí son `vocations.js` y
 * `outfits.js` en la misma carpeta. Un módulo de JavaScript se lee igual de fácil, admite
 * comentarios al lado de cada número y permite pequeñas funciones (un `formula({...})` común a
 * todas las vocaciones) sin inventar un dialecto de XML.
 *
 * Este módulo los carga y los deja con UNA forma, la que usa el motor. Si la ruta termina en
 * `.xml`, lee el formato antiguo y lo traduce: así un datapack de antes sigue arrancando.
 */

const fs = require('fs');
const path = require('path');
const Xml = require('./xml');

/** Las skills en el orden de TFS (SKILL_FIST = 0 … SKILL_FISHING = 6). */
const SKILLS = ['fist', 'club', 'sword', 'axe', 'distance', 'shielding', 'fishing'];

/** Lo que vale cada propiedad si la vocación no la dice y tampoco la dice «None». */
const VOCACION_BASE = {
    id: 0,
    clientId: 0,
    name: 'None',
    description: 'none',
    needPremium: false,
    fromVoc: 0,
    gainCap: 5,
    gainHp: 5,
    gainMana: 5,
    gainHpTicks: 6,
    gainHpAmount: 1,
    gainManaTicks: 6,
    gainManaAmount: 1,
    manaMultiplier: 4.0,
    attackSpeed: 2000,
    baseSpeed: 220,
    soulMax: 100,
    gainSoulTicks: 120,
    formula: {
        meleeDamage: 1, distDamage: 1, wandDamage: 1, magDamage: 1, magHealingDamage: 1,
        defense: 1, magDefense: 1, armor: 1
    },
    skills: { fist: 1.5, club: 2.0, sword: 2.0, axe: 2.0, distance: 2.0, shielding: 1.5, fishing: 1.1 }
};

/** Lee un módulo de datos sin quedarse con la copia de la caché (para poder recargar). */
function leerModulo(ruta) {
    const absoluta = path.resolve(ruta);
    delete require.cache[require.resolve(absoluta)];
    const valor = require(absoluta);
    if (!Array.isArray(valor)) {
        throw new Error(path.basename(ruta) + ' debe exportar una lista (module.exports = [ ... ])');
    }
    return valor;
}

function numero(valor, porDefecto) {
    const n = Number(valor);
    return valor === undefined || valor === null || !Number.isFinite(n) ? porDefecto : n;
}

/**
 * Completa una vocación con la base: lo que no dice, lo toma de `base`.
 * Los números se comprueban para que un error de tecleo no acabe en NaN dentro del combate.
 */
function normalizarVocacion(entrada, base) {
    const v = { ...base, ...entrada };
    const out = {
        id: numero(v.id, 0),
        clientId: numero(v.clientId, numero(v.id, 0)),
        name: String(v.name),
        description: String(v.description || ('a ' + String(v.name).toLowerCase())),
        needPremium: v.needPremium === true,
        fromVoc: numero(v.fromVoc, numero(v.id, 0)),
        formula: { ...base.formula, ...(entrada.formula || {}) },
        skills: { ...base.skills, ...(entrada.skills || {}) }
    };
    ['gainCap', 'gainHp', 'gainMana', 'gainHpTicks', 'gainHpAmount', 'gainManaTicks',
        'gainManaAmount', 'manaMultiplier', 'attackSpeed', 'baseSpeed', 'soulMax', 'gainSoulTicks']
        .forEach((clave) => { out[clave] = numero(v[clave], base[clave]); });
    Object.keys(out.formula).forEach((k) => { out.formula[k] = numero(out.formula[k], 1); });
    SKILLS.forEach((k) => { out.skills[k] = Math.max(1.0001, numero(out.skills[k], 1.5)); });
    out.manaMultiplier = Math.max(1.0001, out.manaMultiplier);
    out.attackSpeed = Math.max(100, out.attackSpeed);
    return out;
}

/** Traduce lo que devuelve `Xml.loadVocations` (formato antiguo) a la forma de `vocations.js`. */
function vocacionDesdeXml(v) {
    const skills = {};
    SKILLS.forEach((nombre, i) => {
        if (v.skills && v.skills[i] !== undefined) {
            skills[nombre] = v.skills[i];
        }
    });
    return {
        id: v.id,
        name: v.name,
        fromVoc: v.fromVocation,
        gainCap: v.gainCap,
        gainHp: v.gainHp,
        gainMana: v.gainMana,
        gainHpTicks: v.gainHpTicks || undefined,
        gainManaTicks: v.gainManaTicks || undefined,
        attackSpeed: v.attackSpeed || undefined,
        baseSpeed: v.baseSpeed || undefined,
        soulMax: v.soul || undefined,
        skills
    };
}

/**
 * Carga las vocaciones.
 * @returns {Map<number, Object>} id → vocación completa
 */
function loadVocations(ruta) {
    const lista = /\.xml$/i.test(ruta)
        ? Array.from(Xml.loadVocations(ruta).values()).map(vocacionDesdeXml)
        : leerModulo(ruta);

    const ninguna = lista.find((v) => Number(v.id) === 0);
    const base = ninguna ? normalizarVocacion(ninguna, VOCACION_BASE) : VOCACION_BASE;
    const vocaciones = new Map();

    lista.forEach((entrada, i) => {
        if (!entrada || entrada.name === undefined || entrada.id === undefined) {
            throw new Error('la vocación ' + i + ' necesita id y name');
        }
        const v = normalizarVocacion(entrada, base);
        if (vocaciones.has(v.id)) {
            throw new Error('hay dos vocaciones con el id ' + v.id);
        }
        vocaciones.set(v.id, v);
    });
    if (!vocaciones.has(0)) {
        vocaciones.set(0, { ...VOCACION_BASE });
    }
    return vocaciones;
}

/**
 * Carga los aspectos.
 * @returns {Map<number, Object>} lookType → {id, name, sex, player, premium, unlocked, enabled, addons: Map}
 */
function loadOutfits(ruta) {
    if (/\.xml$/i.test(ruta)) {
        const aspectos = Xml.loadOutfits(ruta);
        aspectos.forEach((o) => {
            o.sex = 'any';
            o.player = o.id >= 100;
            o.enabled = true;
        });
        return aspectos;
    }

    const aspectos = new Map();
    leerModulo(ruta).forEach((entrada, i) => {
        const id = Number(entrada && entrada.id);
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('el aspecto ' + i + ' necesita un id (lookType) entero');
        }
        const sex = ['male', 'female'].includes(entrada.sex) ? entrada.sex : 'any';
        const addons = new Map();
        (entrada.addons || []).slice(0, 2).forEach((nombre, j) => {
            addons.set(j + 1, { id: j + 1, name: String(nombre) });
        });
        aspectos.set(id, {
            id,
            name: String(entrada.name || ('Aspecto ' + id)),
            sex,
            player: entrada.player !== false,
            premium: entrada.premium === true,
            unlocked: entrada.unlocked !== false,
            enabled: entrada.enabled !== false,
            addons
        });
    });
    return aspectos;
}

/** ¿Existe el archivo? Si no, prueba la otra extensión (.js ↔ .xml). */
function resolverRuta(ruta) {
    if (fs.existsSync(ruta)) {
        return ruta;
    }
    const otra = /\.xml$/i.test(ruta) ? ruta.replace(/\.xml$/i, '.js') : ruta.replace(/\.js$/i, '.xml');
    return fs.existsSync(otra) ? otra : null;
}

module.exports = { SKILLS, VOCACION_BASE, loadVocations, loadOutfits, resolverRuta, normalizarVocacion };
