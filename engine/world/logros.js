'use strict';

/**
 * DE DÓNDE SALEN LOS PUNTOS DE ATRIBUTO (atributos.js): no sólo del nivel, también de jugar de
 * maneras distintas. Cada fuente lleva su cuenta en `jugador.logros`, y los puntos se CALCULAN de
 * esas cuentas (no se suman aparte): así no se pueden contar dos veces, y cambiar los números de
 * config.js recoloca a todos.
 *
 *   nivel     un punto al llegar a cada nivel de `levelMilestones` (10, 25, 50, 75, 90 y 100)
 *   caminar   uno cada `stepsPerPoint` pasos andados fuera de zonas de protección, con tope diario
 *   explorar  uno por cada lugar con nombre del mapa que descubres (al pasar cerca) y uno cada
 *             `areasPerPoint` zonas nuevas pisadas (cuadrados de `areaSize` casillas)
 *   magia     uno cada `runesPerPoint` runas creadas, y uno cada `manaPerPoint` de maná gastado en
 *             magia (esa cifra es para quien gana 30 de maná por nivel, como un mago; un caballero,
 *             que gana 5, necesita seis veces menos: así también él gana puntos con sus hechizos)
 *   tiempo    uno cada `minutesPerPoint` minutos de juego ACTIVO (haber hecho algo en los últimos
 *             `idleMinutes`), con tope diario
 *   caza      uno por cada especie que derrotas por primera vez, y otro al llegar a `masteryKills`
 *             de esa especie
 *
 * El «día» de los topes es el del reloj del servidor. Son funciones puras sobre el jugador: el
 * mundo las llama al andar, gastar maná, crear una runa, matar y en cada tick, y lo que devuelven
 * son los avisos (texto en español; el cliente los traduce) de los puntos que se acaban de ganar.
 */

/** Lo que vale cada fuente si config.js no dice otra cosa (`attributes.sources`). */
const DEFECTO = {
    walking: { stepsPerPoint: 5000, maxPointsPerDay: 2 },
    exploring: { pointsPerPlace: 1, placeRadius: 4, areaSize: 16, areasPerPoint: 50 },
    magic: { runesPerPoint: 100, manaPerPoint: 10000, referenceManaGain: 30 },
    activeTime: { minutesPerPoint: 60, maxPointsPerDay: 3, idleMinutes: 5 },
    hunting: { firstKill: 1, masteryKills: 100, mastery: 1 }
};

const NIVELES = [10, 25, 50, 75, 90, 100];

const MINUTO = 60 * 1000;

function normalizarFuentes(config) {
    const c = config || {};
    const fuentes = {};
    Object.keys(DEFECTO).forEach((f) => {
        fuentes[f] = {};
        Object.keys(DEFECTO[f]).forEach((k) => {
            const v = Number(c[f] && c[f][k]);
            fuentes[f][k] = Number.isFinite(v) && v >= 0 ? v : DEFECTO[f][k];
        });
    });
    return fuentes;
}

function normalizarNiveles(lista) {
    if (!Array.isArray(lista)) {
        return NIVELES.slice();
    }
    return [...new Set(lista.map((n) => Math.floor(Number(n))).filter((n) => n > 1))].sort((a, b) => a - b);
}

function vacio() {
    return { pasos: 0, pasosHoy: { dia: '', n: 0 }, lugares: [], zonas: [], runas: 0, mana: 0,
        activoMs: 0, activoHoy: { dia: '', ms: 0 }, especies: {} };
}

function de(jugador) {
    if (!jugador.logros) {
        jugador.logros = vacio();
    }
    return jugador.logros;
}

/** El día del servidor, «2026-10-31». */
function diaDe(ahora) {
    const d = new Date(ahora);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const cuantos = (n, cada) => (cada > 0 ? Math.floor(n / cada) : 0);

/** Los puntos de cada fuente. */
function puntos(jugador, conf) {
    const l = jugador.logros || vacio();
    const f = conf.sources;
    const especies = Object.values(l.especies || {});
    return {
        level: conf.levelMilestones.filter((n) => (jugador.level || 1) >= n).length,
        walking: cuantos(l.pasos, f.walking.stepsPerPoint),
        exploring: l.lugares.length * f.exploring.pointsPerPlace + cuantos(l.zonas.length, f.exploring.areasPerPoint),
        magic: cuantos(l.runas, f.magic.runesPerPoint) + cuantos(l.mana, f.magic.manaPerPoint),
        activeTime: cuantos(l.activoMs, f.activeTime.minutesPerPoint * MINUTO),
        hunting: especies.filter((n) => n > 0).length * f.hunting.firstKill +
            (f.hunting.masteryKills > 0 ? especies.filter((n) => n >= f.hunting.masteryKills).length * f.hunting.mastery : 0)
    };
}

function total(jugador, conf) {
    return Object.values(puntos(jugador, conf)).reduce((t, n) => t + n, 0);
}

const AVISO = 'Has ganado un punto de atributo por ';

/**
 * UN PASO andado (no un teletransporte). `enProteccion`: si la casilla es zona de protección, el
 * paso no cuenta para caminar (pero sí para explorar). `lugares`: `[[nombre, {x,y,z}], ...]`.
 * @returns {string[]} los avisos
 */
function paso(jugador, conf, posicion, ahora, enProteccion, lugares) {
    const l = de(jugador);
    const f = conf.sources;
    const avisos = [];

    if (!enProteccion && f.walking.stepsPerPoint > 0) {
        const hoy = diaDe(ahora);
        if (l.pasosHoy.dia !== hoy) {
            l.pasosHoy = { dia: hoy, n: 0 };
        }
        const tope = f.walking.maxPointsPerDay * f.walking.stepsPerPoint;
        if (tope <= 0 || l.pasosHoy.n < tope) {
            l.pasosHoy.n += 1;
            l.pasos += 1;
            if (l.pasos % f.walking.stepsPerPoint === 0) {
                avisos.push(AVISO + 'caminar ' + f.walking.stepsPerPoint + ' pasos.');
            }
            if (tope > 0 && l.pasosHoy.n === tope) {
                avisos.push('Hoy ya no ganas más puntos caminando: vuelve mañana.');
            }
        }
    }

    // Explorar: la zona de la casilla y los lugares con nombre que haya cerca.
    const lado = Math.max(1, f.exploring.areaSize);
    const zona = Math.floor(posicion.x / lado) + ',' + Math.floor(posicion.y / lado) + ',' + posicion.z;
    if (f.exploring.areasPerPoint > 0 && !l.zonas.includes(zona)) {
        l.zonas.push(zona);
        if (l.zonas.length % f.exploring.areasPerPoint === 0) {
            avisos.push(AVISO + 'explorar ' + f.exploring.areasPerPoint + ' zonas nuevas.');
        }
    }
    if (f.exploring.pointsPerPlace > 0) {
        (lugares || []).forEach(([nombre, p]) => {
            if (p.z === posicion.z && Math.max(Math.abs(p.x - posicion.x), Math.abs(p.y - posicion.y)) <= f.exploring.placeRadius &&
                !l.lugares.includes(nombre)) {
                l.lugares.push(nombre);
                avisos.push(AVISO + 'descubrir ' + nombreDeLugar(nombre) + '.');
            }
        });
    }
    return avisos;
}

/** «cueva-pantano» -> «Cueva pantano». */
function nombreDeLugar(nombre) {
    const s = String(nombre).replace(/[-_]+/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Maná gastado en magia, escalado por lo que gana de maná su vocación por nivel. */
function mana(jugador, conf, cantidad, gainMana) {
    const f = conf.sources.magic;
    if (!(cantidad > 0) || f.manaPerPoint <= 0) {
        return [];
    }
    const l = de(jugador);
    const antes = cuantos(l.mana, f.manaPerPoint);
    l.mana += cantidad * (f.referenceManaGain / Math.max(1, Number(gainMana) || f.referenceManaGain));
    return cuantos(l.mana, f.manaPerPoint) > antes ? [AVISO + 'usar tu magia.'] : [];
}

/** Una runa creada (un conjuro). */
function runa(jugador, conf) {
    const f = conf.sources.magic;
    const l = de(jugador);
    l.runas += 1;
    return f.runesPerPoint > 0 && l.runas % f.runesPerPoint === 0 ? [AVISO + 'crear ' + f.runesPerPoint + ' runas.'] : [];
}

/**
 * EL TIEMPO ACTIVO: cada tick suma lo que pasó desde el anterior si el jugador hizo algo hace
 * menos de `idleMinutes`. `jugador.ultimaActividad` lo pone la sesión.
 */
function tiempo(jugador, conf, ahora) {
    const f = conf.sources.activeTime;
    const anterior = jugador.ultimoTick === undefined ? ahora : jugador.ultimoTick;
    jugador.ultimoTick = ahora;
    const dt = Math.max(0, Math.min(ahora - anterior, MINUTO));
    if (dt === 0 || f.minutesPerPoint <= 0 || !(ahora - (jugador.ultimaActividad || 0) <= f.idleMinutes * MINUTO)) {
        return [];
    }
    const l = de(jugador);
    const hoy = diaDe(ahora);
    if (l.activoHoy.dia !== hoy) {
        l.activoHoy = { dia: hoy, ms: 0 };
    }
    const porPunto = f.minutesPerPoint * MINUTO;
    const tope = f.maxPointsPerDay * porPunto;
    if (tope > 0 && l.activoHoy.ms >= tope) {
        return [];
    }
    const suma = tope > 0 ? Math.min(dt, tope - l.activoHoy.ms) : dt;
    const antes = cuantos(l.activoMs, porPunto);
    l.activoHoy.ms += suma;
    l.activoMs += suma;
    const avisos = [];
    if (cuantos(l.activoMs, porPunto) > antes) {
        avisos.push(AVISO + 'jugar ' + f.minutesPerPoint + ' minutos.');
    }
    if (tope > 0 && l.activoHoy.ms >= tope) {
        avisos.push('Hoy ya no ganas más puntos por tiempo de juego: vuelve mañana.');
    }
    return avisos;
}

/** Un monstruo derrotado (`nombre`, el de su especie). */
function caza(jugador, conf, nombre) {
    const f = conf.sources.hunting;
    const l = de(jugador);
    const n = (l.especies[nombre] || 0) + 1;
    l.especies[nombre] = n;
    const avisos = [];
    if (n === 1 && f.firstKill > 0) {
        avisos.push(AVISO + 'derrotar por primera vez a: ' + nombre + '.');
    }
    if (f.masteryKills > 0 && n === f.masteryKills && f.mastery > 0) {
        avisos.push(AVISO + 'derrotar ' + f.masteryKills + ' veces a: ' + nombre + '.');
    }
    return avisos;
}

/** Los avisos de subir (o pasar) niveles de `levelMilestones`. */
function niveles(conf, desde, hasta) {
    return conf.levelMilestones.filter((n) => n > desde && n <= hasta).map((n) => AVISO + 'llegar al nivel ' + n + '.');
}

/** Cómo va cada fuente, para la ventana Atributos. `lugaresTotales`: cuántos tiene el mapa. */
function paraElCliente(jugador, conf, ahora, lugaresTotales) {
    const l = jugador.logros || vacio();
    const f = conf.sources;
    const p = puntos(jugador, conf);
    const hoy = diaDe(ahora);
    const porPunto = f.activeTime.minutesPerPoint * MINUTO;
    const resto = (n, cada) => (cada > 0 ? n % cada : 0);
    const especies = Object.values(l.especies || {});
    return {
        level: { points: p.level, next: conf.levelMilestones.find((n) => (jugador.level || 1) < n) || null },
        walking: {
            points: p.walking,
            // De 50 en 50: las estadísticas se mandan cuando cambian, y no hace falta en cada paso.
            steps: Math.floor(resto(l.pasos, f.walking.stepsPerPoint) / 50) * 50,
            goal: f.walking.stepsPerPoint,
            todayFull: f.walking.maxPointsPerDay > 0 && l.pasosHoy.dia === hoy &&
                l.pasosHoy.n >= f.walking.maxPointsPerDay * f.walking.stepsPerPoint
        },
        exploring: {
            points: p.exploring,
            places: l.lugares.length,
            placesTotal: lugaresTotales || 0,
            areas: resto(l.zonas.length, f.exploring.areasPerPoint),
            areasGoal: f.exploring.areasPerPoint
        },
        magic: {
            points: p.magic,
            runes: resto(l.runas, f.magic.runesPerPoint),
            runesGoal: f.magic.runesPerPoint,
            manaPercent: f.magic.manaPerPoint > 0 ? Math.floor(100 * resto(l.mana, f.magic.manaPerPoint) / f.magic.manaPerPoint) : 0
        },
        activeTime: {
            points: p.activeTime,
            minutes: Math.floor(resto(l.activoMs, porPunto) / MINUTO),
            goal: f.activeTime.minutesPerPoint,
            todayFull: f.activeTime.maxPointsPerDay > 0 && l.activoHoy.dia === hoy &&
                l.activoHoy.ms >= f.activeTime.maxPointsPerDay * porPunto
        },
        hunting: {
            points: p.hunting,
            species: especies.filter((n) => n > 0).length,
            mastered: f.hunting.masteryKills > 0 ? especies.filter((n) => n >= f.hunting.masteryKills).length : 0,
            masteryKills: f.hunting.masteryKills
        }
    };
}

function paraGuardar(jugador) {
    return jugador.logros ? JSON.parse(JSON.stringify(jugador.logros)) : vacio();
}

/** Lee lo guardado sin fiarse: lo que no sea del tipo que toca, vacío. */
function cargar(jugador, guardado) {
    const g = guardado && typeof guardado === 'object' ? guardado : {};
    const n = (v) => Math.max(0, Number(v) || 0);
    const lista = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    const especies = {};
    if (g.especies && typeof g.especies === 'object') {
        Object.keys(g.especies).forEach((k) => { especies[k] = Math.floor(n(g.especies[k])); });
    }
    jugador.logros = {
        pasos: Math.floor(n(g.pasos)),
        pasosHoy: { dia: String((g.pasosHoy && g.pasosHoy.dia) || ''), n: Math.floor(n(g.pasosHoy && g.pasosHoy.n)) },
        lugares: lista(g.lugares),
        zonas: lista(g.zonas),
        runas: Math.floor(n(g.runas)),
        mana: n(g.mana),
        activoMs: n(g.activoMs),
        activoHoy: { dia: String((g.activoHoy && g.activoHoy.dia) || ''), ms: n(g.activoHoy && g.activoHoy.ms) },
        especies
    };
    return jugador;
}

module.exports = {
    DEFECTO,
    NIVELES,
    normalizarFuentes,
    normalizarNiveles,
    puntos,
    total,
    paso,
    mana,
    runa,
    tiempo,
    caza,
    niveles,
    nombreDeLugar,
    paraElCliente,
    paraGuardar,
    cargar
};
