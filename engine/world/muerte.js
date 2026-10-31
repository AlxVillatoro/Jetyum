'use strict';

/**
 * LO QUE CUESTA MORIR: las bendiciones y las cuentas del castigo, con los números de The Forgotten
 * Server 8.60.
 *
 * Son funciones puras sobre un jugador (y su vocación): no tocan el mundo, no mandan mensajes y no
 * saben nada de la base de datos. Las usan el combate (`engine/world/combat.js`, al morir), el
 * envoltorio de los scripts (`player.hasBlessing`, `engine/scripting/entities.js`) y, a través de
 * él, el NPC que las vende y los comandos `/bendiciones` y `/muertes`. Así la regla vive en UN
 * sitio y las pruebas la pueden comprobar sin montar un mundo.
 *
 * LAS CINCO BENDICIONES de Tibia 8.60, con su número de TFS (`Player::addBlessing(1..5)`). Se
 * guardan como storages del personaje -`bendicion:1` ... `bendicion:5` a 1-, que la base ya
 * guarda y carga con él: no hace falta ni una columna nueva, y un script cualquiera las puede
 * mirar con `getStorageValue`.
 *
 * QUÉ HACEN, como en TFS (src/player.cpp, `Player::getLostPercent` y `Player::death`, y
 * data/scripts/creaturescripts/others/droploot.lua):
 *
 *   - Cada una quita un 8 % de lo que se pierde de experiencia, de skills y de nivel mágico
 *     (cinco: un 40 % menos). Ser de una vocación PROMOCIONADA quita además un 30 %.
 *   - Cada una baja la probabilidad de perder objetos: un objeto equipado se pierde con un
 *     10 % - 2 % por bendición, y el contenedor (la mochila, con todo lo de dentro) con un
 *     100 % - 20 % por bendición. Con las cinco no se pierde nada.
 *   - Se gastan TODAS al morir.
 *
 * EL PRECIO sube con el nivel, como `getBlessingsCost` de TFS (data/global.lua):
 * 2000 de oro hasta el nivel 30, `(nivel - 20) × 200` entre medias y 20 000 desde el 120.
 */

const Vocacion = require('./vocacion');
const { experienceForLevel } = require('./experience');

/** Las cinco, en el orden y con el número de TFS. `nombre` es el que dice el juego. */
const BENDICIONES = [
    { id: 1, nombre: 'Escudo Espiritual', name: 'The Spiritual Shielding' },
    { id: 2, nombre: 'Abrazo de Tibia', name: 'The Embrace of Tibia' },
    { id: 3, nombre: 'Fuego de los Soles', name: 'The Fire of the Suns' },
    { id: 4, nombre: 'Chispa del Fenix', name: 'The Spark of the Phoenix' },
    { id: 5, nombre: 'Sabiduria de la Soledad', name: 'The Wisdom of Solitude' }
];

const TOTAL_BENDICIONES = BENDICIONES.length;

/** El storage de cada una: `bendicion:<n>`. */
function claveBendicion(n) {
    return 'bendicion:' + Number(n);
}

/** ¿Es un número de bendición que existe (1 a 5)? */
function esBendicion(n) {
    const id = Number(n);
    return Number.isInteger(id) && id >= 1 && id <= TOTAL_BENDICIONES;
}

function bendicionPorId(n) {
    return BENDICIONES.find((b) => b.id === Number(n)) || null;
}

function tieneBendicion(jugador, n) {
    if (!jugador || !esBendicion(n) || !(jugador.storages instanceof Map)) {
        return false;
    }
    return Number(jugador.storages.get(claveBendicion(n)) || 0) > 0;
}

/** Le da una bendición. Devuelve si la tenía que dar (false si no existe o ya la tenía). */
function darBendicion(jugador, n) {
    if (!jugador || !esBendicion(n) || tieneBendicion(jugador, n)) {
        return false;
    }
    if (!(jugador.storages instanceof Map)) {
        jugador.storages = new Map();
    }
    jugador.storages.set(claveBendicion(n), 1);
    return true;
}

/** Le quita una. Devuelve si la tenía. */
function quitarBendicion(jugador, n) {
    if (!tieneBendicion(jugador, n)) {
        return false;
    }
    jugador.storages.set(claveBendicion(n), 0);
    return true;
}

/** Cuántas tiene (0 a 5). */
function contarBendiciones(jugador) {
    return BENDICIONES.filter((b) => tieneBendicion(jugador, b.id)).length;
}

/**
 * Se las quita todas: lo que pasa al morir. Se dejan a 0 y no se borran, que es lo mismo para
 * `tieneBendicion` y hace que el guardado escriba el cambio aunque el storage ya estuviera en la
 * base (borrar del mapa no borra la fila).
 *
 * @returns {number} cuántas tenía
 */
function quitarTodas(jugador) {
    let tenia = 0;
    BENDICIONES.forEach((b) => {
        if (quitarBendicion(jugador, b.id)) {
            tenia += 1;
        }
    });
    return tenia;
}

/** Lo que cuesta CADA bendición a este nivel (TFS `getBlessingsCost`). */
function costeBendicion(nivel) {
    const n = Math.max(1, Math.trunc(Number(nivel) || 1));
    if (n <= 30) {
        return 2000;
    }
    if (n >= 120) {
        return 20000;
    }
    return (n - 20) * 200;
}

/** ¿Su vocación es una promoción (Elite Knight de Knight...)? `fromVoc` de vocations.js. */
function esPromocionada(vocacion) {
    return Boolean(vocacion) && Number(vocacion.id) > 0 && vocacion.fromVoc !== undefined &&
        Number(vocacion.fromVoc) !== Number(vocacion.id);
}

/**
 * EL PORCENTAJE QUE SE PIERDE AL MORIR, ya con las rebajas (en %, no en fracción).
 *
 * `deathLosePercent` de config.js:
 *   - un número (10 de serie): ese porcentaje fijo.
 *   - -1: la fórmula de TFS por nivel. Hasta el nivel 24 un 10 %; desde el 25,
 *         `(L + 50) × 50 × (L² − 5L + 8) / experiencia` con L = nivel + lo que lleva hacia el
 *         siguiente, que es lo que hace que perder a nivel alto cueste cada vez menos en
 *         porcentaje y cada vez más en puntos.
 *
 * Y LAS REBAJAS, en los dos casos como `Player::getLostPercent` con la fórmula: un 30 % menos si
 * está promocionado y un 8 % menos por bendición. (TFS, con el porcentaje FIJO, resta puntos en vez
 * de porcentaje -3 por promoción, 1 por bendición-; aquí se usa la misma rebaja relativa en los dos
 * modos, para que una bendición valga lo mismo se configure como se configure.)
 */
function porcentajeDePerdida(jugador, vocacion, opciones) {
    const o = opciones || {};
    const configurado = o.deathLosePercent === undefined ? 10 : Number(o.deathLosePercent);
    let base;

    if (configurado === -1) {
        const nivel = Math.max(1, Number(jugador.level) || 1);
        const experiencia = Number(jugador.experience) || 0;
        if (nivel >= 25 && experiencia > 0) {
            const desde = experienceForLevel(nivel);
            const hasta = experienceForLevel(nivel + 1);
            const avance = hasta > desde ? Math.max(0, Math.min(1, (experiencia - desde) / (hasta - desde))) : 0;
            const l = nivel + avance;
            base = (l + 50) * 50 * (l * l - 5 * l + 8) / experiencia;
        } else {
            base = 10;
        }
    } else {
        base = Math.max(0, configurado);
    }

    const bendiciones = o.bendiciones === undefined ? contarBendiciones(jugador) : Number(o.bendiciones);
    const rebaja = (esPromocionada(vocacion) ? 30 : 0) + 8 * bendiciones;
    return Math.max(0, base * (1 - rebaja / 100));
}

/**
 * Quita `cantidad` tries a una skill, bajándola de nivel si hace falta: `Player::removeSkillTries`
 * de TFS. Al bajar un nivel, la barra del nivel de abajo se queda LLENA (los tries de ese nivel) y
 * se sigue restando de ahí. No baja del nivel inicial (10).
 *
 * @returns {{desde: number, hasta: number}}
 */
function quitarTries(estado, vocacion, skill, cantidad) {
    let quedan = Math.max(0, Math.floor(Number(cantidad) || 0));
    const desde = estado.level;
    while (quedan > estado.tries) {
        quedan -= estado.tries;
        if (estado.level <= Vocacion.SKILL_INICIAL) {
            estado.tries = 0;
            quedan = 0;
            break;
        }
        estado.level -= 1;
        estado.tries = Vocacion.triesParaSkill(vocacion, skill, estado.level);
    }
    estado.tries = Math.max(0, estado.tries - quedan);
    return { desde, hasta: estado.level };
}

/** Lo mismo con el maná gastado y el nivel mágico (`Player::removeManaSpent`). No baja de 0. */
function quitarManaGastado(jugador, vocacion, cantidad) {
    let quedan = Math.max(0, Math.floor(Number(cantidad) || 0));
    const desde = jugador.magicLevel || 0;
    jugador.magicLevel = desde;
    jugador.manaSpent = jugador.manaSpent || 0;
    while (quedan > jugador.manaSpent) {
        quedan -= jugador.manaSpent;
        if (jugador.magicLevel <= 0) {
            jugador.manaSpent = 0;
            quedan = 0;
            break;
        }
        jugador.magicLevel -= 1;
        jugador.manaSpent = Vocacion.manaParaNivelMagico(vocacion, jugador.magicLevel);
    }
    jugador.manaSpent = Math.max(0, jugador.manaSpent - quedan);
    return { desde, hasta: jugador.magicLevel };
}

/**
 * LO QUE SE PIERDE DE SKILLS Y DE NIVEL MÁGICO: el mismo porcentaje que de experiencia, pero de
 * TODO lo entrenado -los tries de todos los niveles ya subidos más los de la barra-, como en
 * `Player::death` de TFS. Por eso morir puede bajar un nivel de espada aunque la barra estuviera
 * casi llena.
 *
 * @param {number} porcentaje el de `porcentajeDePerdida`
 * @returns {{skills: Object<string, {desde, hasta, tries}>, magia: {desde, hasta, mana}}}
 */
function aplicarPerdidaDeSkills(jugador, vocacion, porcentaje) {
    const resultado = { skills: {}, magia: null };
    const fraccion = Math.max(0, Number(porcentaje) || 0) / 100;
    if (fraccion <= 0) {
        return resultado;
    }

    // El nivel mágico: el maná de todos los niveles subidos (0 -> 1 ... L-1 -> L) más el gastado.
    let manaTotal = jugador.manaSpent || 0;
    for (let n = 0; n < (jugador.magicLevel || 0); n += 1) {
        manaTotal += Vocacion.manaParaNivelMagico(vocacion, n);
    }
    const mana = Math.floor(manaTotal * fraccion);
    if (mana > 0) {
        resultado.magia = { ...quitarManaGastado(jugador, vocacion, mana), mana };
    }

    Object.keys(jugador.skills || {}).forEach((skill) => {
        const estado = jugador.skills[skill];
        if (!estado || !Vocacion.SKILL_BASE[skill]) {
            return;
        }
        let total = estado.tries || 0;
        for (let n = Vocacion.SKILL_INICIAL; n < estado.level; n += 1) {
            total += Vocacion.triesParaSkill(vocacion, skill, n);
        }
        const tries = Math.floor(total * fraccion);
        if (tries > 0) {
            resultado.skills[skill] = { ...quitarTries(estado, vocacion, skill, tries), tries };
        }
    });
    return resultado;
}

/**
 * LA PROBABILIDAD DE PERDER CADA COSA, en % (data/scripts/creaturescripts/others/droploot.lua de
 * TFS): un objeto equipado, 10 − 2 × bendiciones; el contenedor, 100 − 20 × bendiciones. Con la
 * calavera roja, todo al 100 % aunque tenga las cinco.
 */
function probabilidadesDePerdida(bendiciones, calaveraRoja) {
    if (calaveraRoja) {
        return { objeto: 100, contenedor: 100 };
    }
    const n = Math.max(0, Math.min(TOTAL_BENDICIONES, Number(bendiciones) || 0));
    return { objeto: Math.max(0, 10 - 2 * n), contenedor: Math.max(0, 100 - 20 * n) };
}

module.exports = {
    BENDICIONES,
    TOTAL_BENDICIONES,
    claveBendicion,
    esBendicion,
    bendicionPorId,
    tieneBendicion,
    darBendicion,
    quitarBendicion,
    contarBendiciones,
    quitarTodas,
    costeBendicion,
    esPromocionada,
    porcentajeDePerdida,
    quitarTries,
    quitarManaGastado,
    aplicarPerdidaDeSkills,
    probabilidadesDePerdida
};
