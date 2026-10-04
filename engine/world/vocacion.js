'use strict';

/**
 * LO QUE HACE UNA VOCACIÓN: las reglas de `data/XML/vocations.js` puestas a trabajar.
 *
 * Todo lo de aquí son funciones puras sobre un jugador y su vocación, con las fórmulas de The
 * Forgotten Server:
 *
 *   vida máxima      150 + gainHp   × (nivel − 1)
 *   maná máximo       55 + gainMana × (nivel − 1)   (nivel 8 de Rookgaard: 185 de vida y 90 de maná)
 *   velocidad        baseSpeed + 2 × (nivel − 1)
 *   tries de skill   base × multiplicador^(nivel − 11)      (base: puño, maza, espada y hacha 50,
 *                                                            distancia 30, escudo 100, pesca 20)
 *   maná por nv. mág 1600 × manaMultiplier^(nivel mágico − 1)
 *   regeneración     gainHpAmount de vida cada gainHpTicks segundos (y lo mismo con el maná);
 *                    un alma cada gainSoulTicks segundos hasta soulMax
 *
 * El mundo las llama (subir de nivel, el tick, el combate) y no al revés: así se pueden probar
 * sin montar un mundo.
 */

const { SKILLS } = require('../data/definiciones');

/** Lo que cuesta subir cada skill a nivel 11 (TFS: `skillBase`). */
const SKILL_BASE = { fist: 50, club: 50, sword: 50, axe: 50, distance: 30, shielding: 100, fishing: 20 };

/** Nombres para los mensajes («Has subido a espada nivel 11»). */
const NOMBRE_SKILL = {
    fist: 'puño', club: 'maza', sword: 'espada', axe: 'hacha', distance: 'distancia',
    shielding: 'escudo', fishing: 'pesca', magic: 'nivel mágico', level: 'nivel'
};

/** Nivel con el que empieza cada skill y el nivel mágico. */
const SKILL_INICIAL = 10;
const MAGIA_INICIAL = 0;

/** La stamina de Tibia: 42 horas, en minutos. */
const STAMINA_MAX = 42 * 60;

function skillsIniciales() {
    const skills = {};
    SKILLS.forEach((s) => { skills[s] = { level: SKILL_INICIAL, tries: 0 }; });
    return skills;
}

/** Tries que hacen falta para pasar de `nivel` a `nivel + 1`. */
function triesParaSkill(vocacion, skill, nivel) {
    const base = SKILL_BASE[skill] || 50;
    const mult = (vocacion && vocacion.skills && vocacion.skills[skill]) || 1.5;
    return Math.floor(base * Math.pow(mult, nivel - SKILL_INICIAL));
}

/** Maná que hay que gastar para pasar del nivel mágico `nivel` al siguiente. */
function manaParaNivelMagico(vocacion, nivel) {
    const mult = (vocacion && vocacion.manaMultiplier) || 4;
    return Math.floor(1600 * Math.pow(mult, nivel));
}

/** Porcentaje (0-99) hacia el siguiente nivel de una skill. */
function porcentajeSkill(vocacion, skill, estado) {
    const falta = triesParaSkill(vocacion, skill, estado.level);
    return falta > 0 ? Math.min(99, Math.floor(100 * estado.tries / falta)) : 0;
}

function porcentajeMagia(vocacion, jugador) {
    const falta = manaParaNivelMagico(vocacion, jugador.magicLevel || 0);
    return falta > 0 ? Math.min(99, Math.floor(100 * (jugador.manaSpent || 0) / falta)) : 0;
}

function maxHealthPara(vocacion, nivel) {
    return 150 + vocacion.gainHp * (Math.max(1, nivel) - 1);
}

function maxManaPara(vocacion, nivel) {
    return 55 + vocacion.gainMana * (Math.max(1, nivel) - 1);
}

function velocidadPara(vocacion, nivel) {
    return vocacion.baseSpeed + 2 * (Math.max(1, nivel) - 1);
}

/**
 * Pone al día lo que depende del nivel y la vocación: vida y maná máximos, velocidad, almas.
 *
 * @param {Object} [opciones] `curar: true` llena vida y maná (al subir de nivel, como Tibia)
 */
function aplicarNivel(jugador, vocacion, opciones) {
    const curar = opciones && opciones.curar;
    jugador.maxHealth = maxHealthPara(vocacion, jugador.level);
    jugador.maxMana = maxManaPara(vocacion, jugador.level);
    jugador.baseSpeed = velocidadPara(vocacion, jugador.level);
    jugador.speed = jugador.baseSpeed + (jugador.speedBonus || 0) + (jugador.condSpeed || 0);
    jugador.soulMax = vocacion.soulMax;

    if (curar) {
        jugador.health = jugador.maxHealth;
        jugador.mana = jugador.maxMana;
    }
    jugador.health = Math.max(0, Math.min(jugador.maxHealth, jugador.health === undefined ? jugador.maxHealth : jugador.health));
    jugador.mana = Math.max(0, Math.min(jugador.maxMana, jugador.mana === undefined ? jugador.maxMana : jugador.mana));
    jugador.soul = Math.max(0, Math.min(vocacion.soulMax, jugador.soul === undefined ? vocacion.soulMax : jugador.soul));
    return jugador;
}

/**
 * La regeneración de un tick. Devuelve si cambió algo (para mandar las estadísticas).
 * Los «relojes» se guardan en el jugador: `ahora` es el reloj del mundo en milisegundos.
 */
function regenerar(jugador, vocacion, ahora) {
    if (!jugador || jugador.health <= 0) {
        return false;
    }
    const r = jugador.regen || (jugador.regen = {
        hp: ahora + vocacion.gainHpTicks * 1000,
        mana: ahora + vocacion.gainManaTicks * 1000,
        soul: ahora + vocacion.gainSoulTicks * 1000
    });
    let cambio = false;

    if (ahora >= r.hp) {
        r.hp = ahora + vocacion.gainHpTicks * 1000;
        if (jugador.health < jugador.maxHealth) {
            jugador.health = Math.min(jugador.maxHealth, jugador.health + vocacion.gainHpAmount);
            cambio = true;
        }
    }
    if (ahora >= r.mana) {
        r.mana = ahora + vocacion.gainManaTicks * 1000;
        if (jugador.mana < jugador.maxMana) {
            jugador.mana = Math.min(jugador.maxMana, jugador.mana + vocacion.gainManaAmount);
            cambio = true;
        }
    }
    if (ahora >= r.soul) {
        r.soul = ahora + vocacion.gainSoulTicks * 1000;
        if (jugador.soul < vocacion.soulMax) {
            jugador.soul += 1;
            cambio = true;
        }
    }
    return cambio;
}

/**
 * Suma tries a una skill y la sube las veces que toque.
 * @returns {{subidas: number, desde: number, hasta: number}}
 */
function sumarTries(jugador, vocacion, skill, cantidad) {
    if (!SKILL_BASE[skill]) {
        throw new Error('no existe la skill ' + skill + ' (' + SKILLS.join(', ') + ')');
    }
    if (!jugador.skills) {
        jugador.skills = skillsIniciales();
    }
    const estado = jugador.skills[skill] || (jugador.skills[skill] = { level: SKILL_INICIAL, tries: 0 });
    const desde = estado.level;
    estado.tries += Math.max(0, Math.floor(cantidad));
    let falta = triesParaSkill(vocacion, skill, estado.level);
    while (estado.tries >= falta && estado.level < 200) {
        estado.tries -= falta;
        estado.level += 1;
        falta = triesParaSkill(vocacion, skill, estado.level);
    }
    return { subidas: estado.level - desde, desde, hasta: estado.level };
}

/** Suma maná gastado y sube el nivel mágico las veces que toque. */
function sumarManaGastado(jugador, vocacion, cantidad) {
    const desde = jugador.magicLevel || 0;
    jugador.magicLevel = desde;
    jugador.manaSpent = (jugador.manaSpent || 0) + Math.max(0, Math.floor(cantidad));
    let falta = manaParaNivelMagico(vocacion, jugador.magicLevel);
    while (jugador.manaSpent >= falta && jugador.magicLevel < 200) {
        jugador.manaSpent -= falta;
        jugador.magicLevel += 1;
        falta = manaParaNivelMagico(vocacion, jugador.magicLevel);
    }
    return { subidas: jugador.magicLevel - desde, desde, hasta: jugador.magicLevel };
}

/**
 * Qué skill usa el arma: la `weaponType` de items.xml (sword, axe, club, distance, wand…).
 * Sin arma, puño.
 */
function skillDeArma(weaponType) {
    switch (String(weaponType || '').toLowerCase()) {
        case 'sword': return 'sword';
        case 'axe': return 'axe';
        case 'club': return 'club';
        case 'distance': case 'ammunition': return 'distance';
        default: return 'fist';
    }
}

/** Lo que se guarda en la base (columna `progress`, en JSON). */
function progresoParaGuardar(jugador) {
    return {
        mana: jugador.mana || 0,
        soul: jugador.soul || 0,
        stamina: jugador.stamina === undefined ? STAMINA_MAX : jugador.stamina,
        magicLevel: jugador.magicLevel || 0,
        manaSpent: jugador.manaSpent || 0,
        skills: jugador.skills || skillsIniciales(),
        // El depósito (lo que guardas en el cofre de depósito) y la calavera, que duran aunque salgas.
        deposito: Array.isArray(jugador.deposito) ? jugador.deposito : [],
        skull: jugador.skull || '',
        skullUntil: jugador.skullUntil || 0,
        unjustifiedKills: Array.isArray(jugador.unjustifiedKills) ? jugador.unjustifiedKills : []
    };
}

function cargarProgreso(jugador, guardado) {
    const g = guardado || {};
    const skills = skillsIniciales();
    SKILLS.forEach((s) => {
        if (g.skills && g.skills[s]) {
            skills[s] = {
                level: Math.max(SKILL_INICIAL, Number(g.skills[s].level) || SKILL_INICIAL),
                tries: Math.max(0, Number(g.skills[s].tries) || 0)
            };
        }
    });
    jugador.skills = skills;
    jugador.magicLevel = Math.max(MAGIA_INICIAL, Number(g.magicLevel) || 0);
    jugador.manaSpent = Math.max(0, Number(g.manaSpent) || 0);
    jugador.stamina = g.stamina === undefined ? STAMINA_MAX : Math.max(0, Math.min(STAMINA_MAX, Number(g.stamina)));
    if (g.mana !== undefined) {
        jugador.mana = Number(g.mana);
    }
    if (g.soul !== undefined) {
        jugador.soul = Number(g.soul);
    }
    jugador.deposito = Array.isArray(g.deposito) ? g.deposito : [];
    jugador.skull = g.skull || '';
    jugador.skullUntil = Number(g.skullUntil) || 0;
    jugador.unjustifiedKills = Array.isArray(g.unjustifiedKills) ? g.unjustifiedKills : [];
    return jugador;
}

module.exports = {
    SKILL_BASE,
    NOMBRE_SKILL,
    SKILL_INICIAL,
    STAMINA_MAX,
    skillsIniciales,
    triesParaSkill,
    manaParaNivelMagico,
    porcentajeSkill,
    porcentajeMagia,
    maxHealthPara,
    maxManaPara,
    velocidadPara,
    aplicarNivel,
    regenerar,
    sumarTries,
    sumarManaGastado,
    skillDeArma,
    progresoParaGuardar,
    cargarProgreso
};
