/**
 * IMPORTAR MONSTRUOS de un servidor TFS / Canary (sus `data/monsters/**.lua`, el formato
 * «revscript»: `local monster = {}` ... `monster.attacks = {...}` ... `mType:register(monster)`).
 *
 *     node tools/importar-monstruos.mjs                         # de ../forserver-downgrade
 *     node tools/importar-monstruos.mjs --origen <data/monsters> [--items <items.xml>] [--salida <dir>]
 *
 * Escribe un módulo por monstruo en `data/monsters/importados/<carpeta de origen>/<archivo>.js`,
 * con el formato de los de `data/monsters` (que es el de TFS en JavaScript), y sustituye lo que
 * hubiera importado antes. Lo que se lleva y cómo:
 *
 *   - SOLO LOS QUE SE PUEDEN DIBUJAR BIEN: un monstruo cuyo aspecto (`lookType`) no está en
 *     `ASPECTOS_FIELES` se quedaría sin dibujo, o con el de otra criatura (los aspectos 301-346 del
 *     cliente son los del OpenTibia Sprite Pack, no los de Tibia; el 34 y el 35 son provisionales).
 *     Tampoco los que ya existen con ese nombre, ni los de las carpetas de `FUERA` (jefes, misiones,
 *     eventos, entrenadores...).
 *   - LOS ATAQUES que el motor sabe hacer (`engine/world/monstruos.js`): el cuerpo a cuerpo, los de
 *     un elemento (`name = "combat"` con su `type`), drenar vida o maná, la parálisis y la curación,
 *     con su área, rayo, proyectil y condición. Los hechizos con nombre propio de TFS («fire wave»)
 *     no: se cuentan en el informe.
 *   - EL BOTÍN Y EL CUERPO, por NOMBRE: el id del otro servidor se busca en su `items.xml` y su nombre
 *     en el nuestro. Lo que no tenemos se queda fuera (y el cuerpo, en la caja de `corpseFallbackId`).
 *   - Las resistencias, las inmunidades a condiciones, las frases, la luz, las banderas y las
 *     estrategias, tal cual. Las invocaciones no (el motor aún no las tiene).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Los aspectos del cliente que son la MISMA criatura que en Tibia: trol, necrófago, rata, cíclope,
 * minotauro, lobo, serpiente, araña, esqueleto, araña venenosa, esqueleto demoníaco, escorpión, rata
 * de cueva, goblin y los humanos (128-137 y 150-159).
 */
export const ASPECTOS_FIELES = new Set([15, 18, 21, 22, 25, 27, 28, 30, 33, 36, 37, 43, 56, 61,
    128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159]);

/** Las carpetas de origen que no se importan: no son monstruos para poner en un respawn. */
export const FUERA = new Set(['bosses', 'quests', 'event_creatures', 'trainers', 'traps', 'familiars', 'raids', 'demons']);
/** Y los que, por su nombre, tampoco (un entrenador, un personaje de evento). */
export const NOMBRES_FUERA = new Set(['Salamander Trainer', 'Percy Peacetinker']);

// ---------------------------------------------------------------------------
// Leer Lua: las tablas literales que usan las fichas
// ---------------------------------------------------------------------------

/** Las piezas de un trozo de Lua: cadenas, números, nombres y signos. Sin comentarios. */
export function trocear(src) {
    const t = [];
    let i = 0;
    const n = src.length;
    const largo = (desde) => {
        // [[...]] o [==[...]==]
        const m = /^\[(=*)\[/.exec(src.slice(desde, desde + 20));
        if (!m) {
            return null;
        }
        const cierre = ']' + m[1] + ']';
        const fin = src.indexOf(cierre, desde + m[0].length);
        if (fin < 0) {
            throw new Error('cadena larga sin cerrar');
        }
        return { texto: src.slice(desde + m[0].length, fin), fin: fin + cierre.length };
    };
    while (i < n) {
        const c = src[i];
        if (/\s/.test(c)) {
            i += 1;
        } else if (c === '-' && src[i + 1] === '-') {
            const l = largo(i + 2);
            if (l) {
                i = l.fin;
            } else {
                while (i < n && src[i] !== '\n') {
                    i += 1;
                }
            }
        } else if (c === '"' || c === "'") {
            let s = '';
            i += 1;
            while (i < n && src[i] !== c) {
                if (src[i] === '\\') {
                    const e = src[i + 1];
                    s += { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" }[e] !== undefined
                        ? { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" }[e] : e;
                    i += 2;
                } else {
                    s += src[i];
                    i += 1;
                }
            }
            i += 1;
            t.push({ k: 'cad', v: s });
        } else if (c === '[' && (src[i + 1] === '[' || src[i + 1] === '=')) {
            const l = largo(i);
            if (l) {
                t.push({ k: 'cad', v: l.texto });
                i = l.fin;
            } else {
                t.push({ k: 'sig', v: c });
                i += 1;
            }
        } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
            const m = /^(0[xX][0-9a-fA-F]+|[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/.exec(src.slice(i));
            t.push({ k: 'num', v: Number(m[0]) });
            i += m[0].length;
        } else if (/[A-Za-z_]/.test(c)) {
            const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
            t.push({ k: 'nom', v: m[0] });
            i += m[0].length;
        } else if (src.startsWith('..', i) || src.startsWith('==', i) || src.startsWith('~=', i) ||
            src.startsWith('<=', i) || src.startsWith('>=', i)) {
            t.push({ k: 'sig', v: src.slice(i, i + 2) });
            i += 2;
        } else {
            t.push({ k: 'sig', v: c });
            i += 1;
        }
    }
    return t;
}

/** Una constante de Lua sin valor conocido (`COMBAT_FIREDAMAGE`): se guarda su nombre. */
export const constante = (nombre) => ({ $c: nombre });
export const nombreDeConstante = (v) => (v && typeof v === 'object' && v.$c ? v.$c : null);

/**
 * Lee UNA EXPRESIÓN desde la pieza `p`: tabla, cadena, número, booleano, nil, constante (con
 * puntos) y las cuentas sencillas (`-8`, `2 * 100`). Devuelve { valor, p }. Una tabla con sólo
 * posiciones es un array; con sólo claves, un objeto; con las dos, un objeto con `$lista`.
 */
export function leerExpresion(t, p0) {
    let p = p0;
    const ver = (k, v) => t[p] && t[p].k === k && (v === undefined || t[p].v === v);
    const primario = () => {
        if (ver('sig', '-')) {
            p += 1;
            const v = primario();
            if (typeof v !== 'number') {
                throw new Error('menos delante de algo que no es un número');
            }
            return -v;
        }
        if (ver('sig', '(')) {
            p += 1;
            const v = expresion();
            if (!ver('sig', ')')) {
                throw new Error('falta )');
            }
            p += 1;
            return v;
        }
        if (ver('num')) {
            return t[p++].v;
        }
        if (ver('cad')) {
            let s = t[p++].v;
            while (ver('sig', '..') && t[p + 1] && t[p + 1].k === 'cad') {
                s += t[p + 1].v;
                p += 2;
            }
            return s;
        }
        if (ver('sig', '{')) {
            return tabla();
        }
        if (ver('nom')) {
            const v = t[p++].v;
            if (v === 'true') {
                return true;
            }
            if (v === 'false') {
                return false;
            }
            if (v === 'nil') {
                return null;
            }
            let nombre = v;
            while (ver('sig', '.') && t[p + 1] && t[p + 1].k === 'nom') {
                nombre += '.' + t[p + 1].v;
                p += 2;
            }
            if (ver('sig', '(')) {
                throw new Error('llamada a ' + nombre);
            }
            return constante(nombre);
        }
        throw new Error('no se esperaba ' + JSON.stringify(t[p]));
    };
    const termino = () => {
        let v = primario();
        while (ver('sig', '*') || ver('sig', '/')) {
            const op = t[p++].v;
            const w = primario();
            if (typeof v !== 'number' || typeof w !== 'number') {
                throw new Error('cuenta con algo que no es un número');
            }
            v = op === '*' ? v * w : v / w;
        }
        return v;
    };
    const expresion = () => {
        let v = termino();
        while (ver('sig', '+') || (ver('sig', '-') && typeof v === 'number')) {
            const op = t[p++].v;
            const w = termino();
            if (typeof v !== 'number' || typeof w !== 'number') {
                throw new Error('cuenta con algo que no es un número');
            }
            v = op === '+' ? v + w : v - w;
        }
        return v;
    };
    const tabla = () => {
        p += 1; // {
        const lista = [];
        const claves = {};
        let hayClaves = false;
        while (!ver('sig', '}')) {
            if (p >= t.length) {
                throw new Error('tabla sin cerrar');
            }
            if (ver('sig', '[')) {
                p += 1;
                const k = expresion();
                p += 2; // ] =
                claves[nombreDeConstante(k) || k] = expresion();
                hayClaves = true;
            } else if (ver('nom') && t[p + 1] && t[p + 1].k === 'sig' && t[p + 1].v === '=') {
                const k = t[p].v;
                p += 2;
                claves[k] = expresion();
                hayClaves = true;
            } else {
                lista.push(expresion());
            }
            if (ver('sig', ',') || ver('sig', ';')) {
                p += 1;
            }
        }
        p += 1; // }
        if (!hayClaves) {
            return lista;
        }
        if (lista.length) {
            claves.$lista = lista;
        }
        return claves;
    };
    const valor = expresion();
    return { valor, p };
}

/**
 * Las asignaciones `monster.<clave> = <valor>` de una ficha. Lo que no se sabe leer (una función,
 * una llamada) se apunta en `problemas` y se sigue con lo demás.
 */
export function leerFicha(src) {
    const ficha = {};
    const problemas = [];
    const re = /^[ \t]*monster\.([A-Za-z_][A-Za-z0-9_]*)\s*=/gm;
    let m;
    while ((m = re.exec(src))) {
        const resto = src.slice(m.index + m[0].length);
        try {
            const t = trocear(cortarSentencia(resto));
            ficha[m[1]] = leerExpresion(t, 0).valor;
        } catch (e) {
            problemas.push(m[1] + ': ' + e.message);
        }
    }
    const nombre = /Game\.createMonsterType\(\s*["']([^"']+)["']/.exec(src);
    if (nombre && !ficha.name) {
        ficha.name = nombre[1];
    }
    return { ficha, problemas };
}

/** El texto de una sentencia: hasta que se cierran las llaves y acaba la línea. */
function cortarSentencia(resto) {
    let nivel = 0;
    let enCadena = null;
    for (let i = 0; i < resto.length; i += 1) {
        const c = resto[i];
        if (enCadena) {
            if (c === '\\') {
                i += 1;
            } else if (c === enCadena) {
                enCadena = null;
            }
            continue;
        }
        if (c === '-' && resto[i + 1] === '-') {
            const fin = resto.indexOf('\n', i);
            if (resto[i + 2] === '[' && resto[i + 3] === '[') {
                const cierre = resto.indexOf(']]', i);
                i = cierre < 0 ? resto.length : cierre + 1;
                continue;
            }
            if (nivel === 0) {
                return resto.slice(0, i);
            }
            i = fin < 0 ? resto.length : fin;
            continue;
        }
        if (c === '"' || c === "'") {
            enCadena = c;
        } else if (c === '{' || c === '(') {
            nivel += 1;
        } else if (c === '}' || c === ')') {
            nivel -= 1;
        } else if (c === '\n' && nivel <= 0) {
            return resto.slice(0, i);
        }
    }
    return resto;
}

// ---------------------------------------------------------------------------
// De la ficha de TFS a la nuestra
// ---------------------------------------------------------------------------

const ELEMENTO = {
    COMBAT_PHYSICALDAMAGE: 'physical', COMBAT_FIREDAMAGE: 'fire', COMBAT_ENERGYDAMAGE: 'energy',
    COMBAT_EARTHDAMAGE: 'earth', COMBAT_ICEDAMAGE: 'ice', COMBAT_HOLYDAMAGE: 'holy', COMBAT_DEATHDAMAGE: 'death',
    COMBAT_LIFEDRAIN: 'lifedrain', COMBAT_MANADRAIN: 'manadrain', COMBAT_DROWNDAMAGE: 'drown', COMBAT_HEALING: 'healing'
};

const CONDICION = {
    CONDITION_POISON: 'veneno', CONDITION_FIRE: 'fuego', CONDITION_ENERGY: 'energia', CONDITION_BLEEDING: 'sangrado',
    CONDITION_PARALYZE: 'paralisis'
};

/** Los proyectiles que tienen dibujo aquí, por su nombre en TFS (CONST_ANI_<nombre>). */
const PROYECTILES = new Set(['spear', 'arrow', 'bolt', 'fire', 'energy', 'poison', 'poisonarrow', 'ice', 'snowball',
    'earth', 'smallstone', 'largerock', 'throwingstar', 'throwingknife', 'explosion', 'death', 'holy']);

/** Lo que el motor sabe hacer de un ataque. */
const ATAQUES = new Set(['melee', 'physical', 'fire', 'energy', 'earth', 'poison', 'ice', 'holy', 'death',
    'lifedrain', 'manadrain', 'drown', 'speed', 'healing']);

function condicion(c) {
    const tipo = CONDICION[nombreDeConstante(c && c.type)];
    if (!tipo) {
        return null;
    }
    if (tipo === 'paralisis') {
        return null;
    }
    const total = Math.abs(Number(c.totalDamage || c.minDamage || c.maxDamage) || 0);
    if (!total) {
        return null;
    }
    const ticks = Math.max(1, Math.min(10, total));
    return { type: tipo, ticks, interval: Number(c.interval) || 2000, value: Math.ceil(total / ticks) };
}

/** Un ataque (o defensa) de TFS en el formato del motor, o null si el motor no lo sabe hacer. */
export function convertirAtaque(a, informe) {
    if (!a || typeof a !== 'object') {
        return null;
    }
    let nombre = String(a.name || '').toLowerCase();
    if (nombre === 'combat') {
        nombre = ELEMENTO[nombreDeConstante(a.type)] || '';
    }
    if (nombre === 'drown') {
        nombre = 'physical';
    }
    if (!ATAQUES.has(nombre)) {
        if (informe) {
            informe.sinAtaque[a.name] = (informe.sinAtaque[a.name] || 0) + 1;
        }
        return null;
    }
    const r = { name: nombre };
    ['interval', 'chance', 'minDamage', 'maxDamage', 'range', 'radius', 'length', 'spread', 'speedChange', 'duration']
        .forEach((k) => {
            if (typeof a[k] === 'number') {
                r[k] = a[k];
            }
        });
    // El cuerpo a cuerpo a la antigua, con `skill` y `attack` en vez de daño: el máximo es el de TFS
    // (`Weapons::getMaxMeleeDamage`).
    if (nombre === 'melee' && r.maxDamage === undefined && typeof a.skill === 'number' && typeof a.attack === 'number') {
        r.minDamage = 0;
        r.maxDamage = -Math.ceil(a.skill * a.attack * 0.05 + a.attack * 0.5);
    }
    if (a.target === true) {
        r.target = true;
    }
    const anim = nombreDeConstante(a.shootEffect);
    if (anim && PROYECTILES.has(anim.replace(/^CONST_ANI_/, '').toLowerCase())) {
        r.shootEffect = anim.replace(/^CONST_ANI_/, '').toLowerCase();
    }
    const c = a.condition ? condicion(a.condition) : null;
    if (c) {
        r.condition = c;
    }
    if (nombre === 'speed' && !(typeof r.speedChange === 'number')) {
        return null;
    }
    return r;
}

const lista = (v) => (Array.isArray(v) ? v : (v && Array.isArray(v.$lista) ? v.$lista : []));

/**
 * La ficha nuestra a partir de la de TFS.
 * @param {Object} f la ficha leída (`leerFicha`)
 * @param {Object} ctx { idANombre(id) del otro servidor, nombreAId(nombre) nuestro, carpeta, archivo }
 */
export function convertirFicha(f, ctx, informe) {
    const inf = informe || { sinAtaque: {}, sinBotin: {} };
    const salida = {
        type: 'monster',
        name: f.name,
        description: f.description || ('a ' + String(f.name).toLowerCase()),
        experience: Number(f.experience) || 0,
        health: Number(f.health) || Number(f.maxHealth) || 1,
        maxHealth: Number(f.maxHealth) || Number(f.health) || 1,
        race: typeof f.race === 'string' ? f.race : 'blood',
        corpse: 0,
        speed: Number(f.speed) || 100,
        manaCost: Number(f.manaCost) || 0,
        outfit: {
            lookType: Number(f.outfit && f.outfit.lookType) || 0,
            lookHead: Number(f.outfit && f.outfit.lookHead) || 0,
            lookBody: Number(f.outfit && f.outfit.lookBody) || 0,
            lookLegs: Number(f.outfit && f.outfit.lookLegs) || 0,
            lookFeet: Number(f.outfit && f.outfit.lookFeet) || 0,
            lookAddons: Number(f.outfit && f.outfit.lookAddons) || 0,
            lookMount: 0
        },
        origen: { carpeta: ctx.carpeta, archivo: ctx.archivo }
    };
    // El cuerpo por su nombre; un humano sin el suyo deja el «dead human» del pack.
    const humano = salida.outfit.lookType >= 128 && salida.outfit.lookType <= 159;
    const cuerpo = (f.corpse ? ctx.nombreAId(ctx.idANombre(f.corpse)) : 0) || (humano ? ctx.nombreAId('dead human') : 0);
    if (cuerpo) {
        salida.corpse = cuerpo;
    }
    if (f.changeTarget && typeof f.changeTarget === 'object') {
        salida.changeTarget = { interval: Number(f.changeTarget.interval) || 4000, chance: Number(f.changeTarget.chance) || 0 };
    }
    if (f.strategiesTarget && typeof f.strategiesTarget === 'object') {
        salida.strategiesTarget = {};
        ['nearest', 'health', 'damage', 'random'].forEach((k) => {
            if (typeof f.strategiesTarget[k] === 'number') {
                salida.strategiesTarget[k] = f.strategiesTarget[k];
            }
        });
    }
    if (f.flags && typeof f.flags === 'object') {
        salida.flags = {};
        Object.keys(f.flags).filter((k) => k !== '$lista').forEach((k) => {
            const v = f.flags[k];
            if (typeof v === 'boolean' || typeof v === 'number') {
                salida.flags[k] = v;
            }
        });
    }
    if (f.light && Number(f.light.level)) {
        salida.light = { level: Number(f.light.level), color: Number(f.light.color) || 0 };
    }
    salida.attacks = lista(f.attacks).map((a) => convertirAtaque(a, inf)).filter(Boolean);
    if (!salida.attacks.some((a) => a.name === 'melee')) {
        // Sin cuerpo a cuerpo un monstruo que no lanza nada se queda mirando: uno flojo, por si acaso.
        salida.attacks.unshift({ name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -Math.max(5, Math.round(salida.experience / 10)) });
    }
    const def = f.defenses || {};
    salida.defenses = { defense: Number(def.defense) || 0, armor: Number(def.armor) || 0 };
    const defensas = lista(def).map((a) => convertirAtaque(a, inf)).filter((a) => a && (a.name === 'healing' || a.name === 'speed'));
    if (defensas.length) {
        salida.defenses.list = defensas;
    }
    salida.elements = lista(f.elements).map((e) => ({ type: ELEMENTO[nombreDeConstante(e && e.type)], percent: Number(e && e.percent) || 0 }))
        .filter((e) => e.type && e.percent !== 0);
    salida.immunities = lista(f.immunities).filter((i) => i && i.condition === true && i.type)
        .map((i) => ({ type: String(i.type) }));
    const voces = f.voices && typeof f.voices === 'object' ? f.voices : null;
    const lineas = voces ? lista(voces).filter((v) => v && v.text).map((v) => ({ text: String(v.text), yell: v.yell === true })) : [];
    if (lineas.length) {
        salida.voices = { interval: Number(voces.interval) || 5000, chance: Number(voces.chance) || 10, lines: lineas };
    }
    salida.loot = [];
    lista(f.loot).forEach((l) => {
        if (!l || typeof l !== 'object') {
            return;
        }
        const nombre = l.name ? String(l.name) : ctx.idANombre(l.id);
        const id = ctx.nombreAId(nombre);
        if (!id) {
            inf.sinBotin[nombre || ('id ' + l.id)] = (inf.sinBotin[nombre || ('id ' + l.id)] || 0) + 1;
            return;
        }
        const e = { id, chance: Math.max(1, Math.min(100000, Number(l.chance) || 0)) };
        if (Number(l.maxCount) > 1) {
            e.maxCount = Number(l.maxCount);
        }
        e._nombre = nombre;
        salida.loot.push(e);
    });
    // Todo monstruo suelta algo más que oro (es una regla del juego, ver test-vocaciones): si la ficha
    // sólo daba oro, o lo que daba no lo tenemos, un relleno según lo que es.
    const ORO = ctx.nombreAId('gold coin');
    if (!salida.loot.some((l) => l.id !== ORO)) {
        const relleno = salida.experience >= 1000 ? 'mana potion' : (humano ? 'bread' : 'meat');
        const id = ctx.nombreAId(relleno);
        if (id) {
            salida.loot.push({ id, chance: 20000, _nombre: relleno + ' (relleno: la ficha sólo daba oro)' });
        }
    }
    return salida;
}

// ---------------------------------------------------------------------------
// Escribir el módulo
// ---------------------------------------------------------------------------

function js(valor, sangria) {
    const s = sangria || '';
    const dentro = s + '    ';
    if (valor === null || valor === undefined) {
        return 'null';
    }
    if (typeof valor === 'string') {
        return "'" + valor.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
    }
    if (typeof valor !== 'object') {
        return String(valor);
    }
    if (Array.isArray(valor)) {
        if (!valor.length) {
            return '[]';
        }
        return '[\n' + valor.map((v) => dentro + js(v, dentro)).join(',\n') + '\n' + s + ']';
    }
    const claves = Object.keys(valor).filter((k) => valor[k] !== undefined && !k.startsWith('_'));
    const corto = claves.every((k) => typeof valor[k] !== 'object' || valor[k] === null);
    const par = (k) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : "'" + k + "'") + ': ' + js(valor[k], dentro);
    if (corto && claves.length <= 8) {
        const linea = '{ ' + claves.map(par).join(', ') + ' }';
        if (linea.length + s.length < 110) {
            return linea;
        }
    }
    return '{\n' + claves.map((k) => dentro + par(k)).join(',\n') + '\n' + s + '}';
}

export function moduloDe(m, origen) {
    // El botín, uno por línea y con el nombre del objeto al lado (como en las fichas hechas a mano).
    const botin = m.loot.map((l, i) => '        ' + js(l, '        ') + (i < m.loot.length - 1 ? ',' : ' ') + '  // ' + l._nombre).join('\n');
    const cuerpo = js({ ...m, loot: undefined }, '').replace(/\n}$/, ',\n    loot: ' + (m.loot.length ? '[\n' + botin + '\n    ]' : '[]') + '\n}');
    return "'use strict';\n\n/**\n * " + m.name + ': IMPORTADO de ' + origen + ' por tools/importar-monstruos.mjs.\n' +
        ' * Si se vuelve a importar, se sustituye: para cambiarlo a mano, sácalo de `importados/`.\n */\n\n' +
        'module.exports = ' + cuerpo + ';\n';
}

// ---------------------------------------------------------------------------

function recorrer(dir) {
    return fs.readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((e) => (e.isDirectory() ? recorrer(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** Los nombres (en minúsculas) de un items.xml, por id; y nuestros ids, por nombre. */
export function catalogos(itemsOrigen) {
    const idANombre = new Map();
    const re = /<item\s+([^>]*?)\/?>/g;
    const xml = fs.existsSync(itemsOrigen) ? fs.readFileSync(itemsOrigen, 'utf8') : '';
    let m;
    while ((m = re.exec(xml))) {
        const a = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
        if (!a.name) {
            continue;
        }
        const desde = Number(a.id || a.fromid);
        const hasta = Number(a.id || a.toid);
        for (let id = desde; id <= hasta && Number.isFinite(id); id += 1) {
            idANombre.set(id, a.name.toLowerCase());
        }
    }
    const Xml = require('../engine/data/xml.js');
    const nuestros = Xml.loadItems(path.join(RAIZ, 'data', 'items', 'items.xml'));
    const nombreAId = new Map();
    [...nuestros.values()].sort((a, b) => a.id - b.id).forEach((t) => {
        [t.name, t.plural].filter(Boolean).forEach((n) => {
            const k = String(n).toLowerCase();
            if (!nombreAId.has(k)) {
                nombreAId.set(k, t.id);
            }
        });
    });
    return {
        idANombre: (id) => idANombre.get(Number(id)) || null,
        nombreAId: (nombre) => (nombre ? nombreAId.get(String(nombre).toLowerCase()) || 0 : 0)
    };
}

/** Los nombres de los monstruos que ya hay (sin contar los importados). */
function nuestrosMonstruos(dir) {
    const nombres = new Set();
    recorrer(dir).filter((f) => f.endsWith('.js') && !f.split(path.sep).includes('importados')).forEach((f) => {
        const src = fs.readFileSync(f, 'utf8');
        const m = /name:\s*'([^']+)'/.exec(src);
        if (m) {
            nombres.add(m[1]);
        }
    });
    return nombres;
}

export function importar(opciones) {
    const o = opciones || {};
    const origen = o.origen || path.resolve(RAIZ, '..', 'forserver-downgrade', 'data', 'monsters');
    const items = o.items || path.join(origen, '..', 'items', 'items.xml');
    const salida = o.salida || path.join(RAIZ, 'data', 'monsters');
    const destino = path.join(salida, 'importados');
    const ctxBase = catalogos(items);
    const existentes = nuestrosMonstruos(path.join(RAIZ, 'data', 'monsters'));
    const informe = { leidos: 0, importados: [], fuera: 0, sinDibujo: 0, repetidos: [], fallos: [], sinAtaque: {}, sinBotin: {} };
    const modulos = [];
    const vistos = new Set();
    recorrer(origen).filter((f) => f.endsWith('.lua')).forEach((f) => {
        informe.leidos += 1;
        const rel = path.relative(origen, f).split(path.sep);
        if (FUERA.has(rel[0])) {
            informe.fuera += 1;
            return;
        }
        const { ficha, problemas } = leerFicha(fs.readFileSync(f, 'utf8'));
        if (!ficha.name) {
            informe.fallos.push(rel.join('/') + ': sin nombre');
            return;
        }
        if (NOMBRES_FUERA.has(ficha.name)) {
            informe.fuera += 1;
            return;
        }
        const aspecto = Number(ficha.outfit && ficha.outfit.lookType);
        if (!ASPECTOS_FIELES.has(aspecto)) {
            informe.sinDibujo += 1;
            return;
        }
        if (existentes.has(ficha.name) || vistos.has(ficha.name)) {
            informe.repetidos.push(ficha.name);
            return;
        }
        if (problemas.some((p) => /^(attacks|outfit|health|maxHealth)/.test(p))) {
            informe.fallos.push(rel.join('/') + ': ' + problemas.join('; '));
            return;
        }
        vistos.add(ficha.name);
        const archivo = rel[rel.length - 1];
        const m = convertirFicha(ficha, { ...ctxBase, carpeta: rel[0], archivo }, informe);
        modulos.push({ ruta: path.join(destino, rel[0], archivo.replace(/\.lua$/, '.js')), m, rel: rel.join('/') });
        informe.importados.push(ficha.name);
    });
    if (o.escribir !== false) {
        fs.rmSync(destino, { recursive: true, force: true });
        modulos.forEach(({ ruta, m, rel }) => {
            fs.mkdirSync(path.dirname(ruta), { recursive: true });
            fs.writeFileSync(ruta, moduloDe(m, 'forserver-downgrade/data/monsters/' + rel));
        });
    }
    return { informe, modulos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = (n) => {
        const i = process.argv.indexOf(n);
        return i >= 0 ? process.argv[i + 1] : undefined;
    };
    const origen = arg('--origen');
    const { informe } = importar({ origen: origen && path.resolve(origen), items: arg('--items') && path.resolve(arg('--items')),
        salida: arg('--salida') && path.resolve(arg('--salida')) });
    console.log('leídos ' + informe.leidos + ', importados ' + informe.importados.length + ', fuera ' + informe.fuera +
        ', sin dibujo fiel ' + informe.sinDibujo + ', ya existían ' + informe.repetidos.length + ', con fallos ' + informe.fallos.length);
    console.log('importados: ' + informe.importados.join(', '));
    if (informe.fallos.length) {
        console.log('fallos:\n  ' + informe.fallos.join('\n  '));
    }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => k + ' (' + v + ')').join(', ');
    console.log('ataques que el motor no hace: ' + top(informe.sinAtaque));
    console.log('botín que no tenemos: ' + top(informe.sinBotin));
}
