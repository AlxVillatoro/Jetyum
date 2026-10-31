/**
 * PRUEBA DE LOS ATRIBUTOS (engine/world/atributos.js) Y DE DÓNDE SALEN SUS PUNTOS (logros.js).
 *
 *   1. las cuentas: niveles que dan punto, repartir, el tope de 100, reiniciar, la configuración
 *   2. las fuentes: caminar (y su tope diario), explorar, magia, tiempo activo y caza
 *   3. lo que dan: vida, maná, capacidad, daño cuerpo a cuerpo, a distancia y mágico, curación
 *   4. desde el cliente: ATTRIBUTE_ADD, ATTRIBUTES_RESET (con su coste) y `stats.attributes`
 *   5. en el juego de verdad: andar, crear runas, matar, subir de nivel, guardar y /atributos
 *
 * Uso:  node tools/test-atributos.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');
const P = require('../engine/net/protocol.js');
const A = require('../engine/world/atributos.js');
const L = require('../engine/world/logros.js');
const Vocacion = require('../engine/world/vocacion.js');
const { attackProfile } = require('../engine/world/combat.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

/** Le da `n` puntos (como si hubiera caminado) a un jugador, para probar el reparto. */
function darPuntos(pj, conf, n) {
    if (!pj.logros) {
        L.cargar(pj, {});
    }
    pj.logros.pasos += n * conf.sources.walking.stepsPerPoint;
}

const HOY = new Date(2026, 9, 31, 12, 0, 0).getTime();
const MANANA = new Date(2026, 10, 1, 12, 0, 0).getTime();

// ===========================================================================
section('1. Las cuentas');
// ===========================================================================
{
    const conf = A.normalizarConfig();
    const nivel = (n) => A.ganados({ level: n }, conf);
    check('por nivel, un punto al 10, 25, 50, 75, 90 y 100', nivel(9) === 0 && nivel(10) === 1 && nivel(60) === 3 &&
        nivel(100) === 6 && nivel(300) === 6, [9, 10, 60, 100, 300].map(nivel).join(', '));
    const pj = { level: 1 };
    darPuntos(pj, conf, 10);
    check('los de las actividades son libres y se suman', A.libres(pj, conf) === 10);
    check('repartir resta de los libres', A.asignar(pj, 'vitality', 4, conf).ok && A.libres(pj, conf) === 6 &&
        pj.atributos.vitality === 4);
    const pasarse = A.asignar(pj, 'strength', 50, conf);
    check('pedir más de los que hay pone sólo los que quedan', pasarse.ok && pasarse.puestos === 6 && A.libres(pj, conf) === 0);
    check('sin puntos, no se puede', A.asignar(pj, 'energy', 1, conf).razon === 'sinPuntos');
    check('un atributo que no existe, tampoco', A.asignar({ level: 50 }, 'suerte', 1, conf).razon === 'noExiste');
    check('reiniciar devuelve todos', A.reiniciar(pj) === 10 && A.libres(pj, conf) === 10 && A.gastados(pj) === 0);

    const rico = { level: 1 };
    darPuntos(rico, conf, 250);
    const r1 = A.asignar(rico, 'intelligence', 150, conf);
    check('el tope: no más de 100 en un atributo', r1.ok && r1.puestos === 100 && rico.atributos.intelligence === 100 &&
        A.libres(rico, conf) === 150);
    const r2 = A.asignar(rico, 'intelligence', 1, conf);
    check('y lleno, se dice', !r2.ok && r2.razon === 'tope' && r2.tope === 100);
    check('sin tope (0), sí', A.asignar(rico, 'intelligence', 5, A.normalizarConfig({ maxPerAttribute: 0 })).puestos === 5);

    const otra = A.normalizarConfig({ levelMilestones: [5, 'x', 5, 20], vitality: { health: 10 }, energy: { mana: -4 },
        sources: { walking: { stepsPerPoint: 100 } } });
    check('config.js manda (y lo que no vale se queda como estaba)', otra.levelMilestones.join() === '5,20' &&
        otra.vitality.health === 10 && otra.energy.mana === 5 && otra.sources.walking.stepsPerPoint === 100 &&
        otra.sources.walking.maxPointsPerDay === 2 && otra.resetCost === 500);
    check('desactivados, no se ganan puntos ni cuentan', A.ganados({ level: 50 }, A.normalizarConfig({ enabled: false })) === 0 &&
        A.multiplicador({ atributos: { strength: 10 } }, 'melee', A.normalizarConfig({ enabled: false })) === 1);
}

// ===========================================================================
section('2. De dónde salen los puntos');
// ===========================================================================
{
    const conf = A.normalizarConfig({ sources: {
        walking: { stepsPerPoint: 10, maxPointsPerDay: 2 },
        exploring: { areaSize: 4, areasPerPoint: 3, placeRadius: 2 },
        magic: { runesPerPoint: 5, manaPerPoint: 300 },
        activeTime: { minutesPerPoint: 10, maxPointsPerDay: 2, idleMinutes: 5 },
        hunting: { masteryKills: 3 }
    } });
    const pj = { level: 1 };
    const pasos = (n, enPz, ahora) => {
        let avisos = [];
        for (let i = 0; i < n; i += 1) {
            avisos = avisos.concat(L.paso(pj, conf, { x: 1000, y: 1000, z: 7 }, ahora || HOY, enPz, []));
        }
        return avisos;
    };

    let avisos = pasos(10);
    check('caminar: un punto cada stepsPerPoint pasos, y se avisa', L.puntos(pj, conf).walking === 1 &&
        avisos.includes('Has ganado un punto de atributo por caminar 10 pasos.'), avisos.join(' | '));
    pasos(50, true);
    check('en una zona de protección los pasos no cuentan', pj.logros.pasos === 10);
    avisos = pasos(30);
    check('tope diario: como mucho maxPointsPerDay al día', L.puntos(pj, conf).walking === 2 &&
        avisos.includes('Hoy ya no ganas más puntos caminando: vuelve mañana.'), pj.logros.pasos + ' pasos');
    pasos(10, false, MANANA);
    check('y al día siguiente, otra vez', L.puntos(pj, conf).walking === 3);

    const lugares = [['cueva-pantano', { x: 50, y: 50, z: 8 }], ['templo', { x: 10, y: 10, z: 7 }]];
    avisos = L.paso(pj, conf, { x: 52, y: 51, z: 8 }, HOY, false, lugares);
    check('explorar: llegar cerca de un lugar con nombre da su punto, una vez', pj.logros.lugares.join() === 'cueva-pantano' &&
        avisos.includes('Has ganado un punto de atributo por descubrir Cueva pantano.') &&
        L.paso(pj, conf, { x: 51, y: 51, z: 8 }, HOY, false, lugares).every((t) => !t.includes('descubrir')), avisos.join(' | '));
    check('en otra planta no se descubre', L.paso(pj, conf, { x: 10, y: 10, z: 6 }, HOY, false, lugares).every((t) => !t.includes('Templo')));
    const zonas = pj.logros.zonas.length;
    [[100, 100], [101, 101], [110, 100], [120, 100], [130, 100]].forEach(([x, y]) =>
        L.paso(pj, conf, { x, y, z: 7 }, MANANA, true, []));
    check('y cada areasPerPoint zonas nuevas (las de antes no cuentan dos veces)', pj.logros.zonas.length === zonas + 4,
        pj.logros.zonas.length + ' zonas');

    const magia = { level: 1 };
    for (let i = 0; i < 5; i += 1) { L.runa(magia, conf); }
    check('magia: crear runas', L.puntos(magia, conf).magic === 1);
    avisos = L.mana(magia, conf, 100, 30).concat(L.mana(magia, conf, 199, 30));
    check('y gastar maná (un mago, 30 por nivel: 300 de maná)', L.puntos(magia, conf).magic === 1 && avisos.length === 0);
    const caballero = { level: 1 };
    avisos = L.mana(caballero, conf, 50, 5);
    check('un caballero (5 por nivel) necesita seis veces menos maná', L.puntos(caballero, conf).magic === 1 &&
        avisos.includes('Has ganado un punto de atributo por usar tu magia.'));

    const activo = { level: 1, ultimaActividad: HOY };
    let t = HOY;
    avisos = [];
    for (let i = 0; i < 12 * 60; i += 1) {   // 12 minutos, un tick por segundo
        t += 1000;
        if (i % 60 === 0) { activo.ultimaActividad = t; }
        avisos = avisos.concat(L.tiempo(activo, conf, t));
    }
    check('tiempo activo: un punto cada minutesPerPoint minutos', L.puntos(activo, conf).activeTime === 1 &&
        avisos.includes('Has ganado un punto de atributo por jugar 10 minutos.'), Math.round(activo.logros.activoMs / 1000) + ' s');
    const antes = activo.logros.activoMs;
    for (let i = 0; i < 10 * 60; i += 1) { t += 1000; L.tiempo(activo, conf, t); }
    check('quieto más de idleMinutes no cuenta', activo.logros.activoMs - antes <= 5 * 60 * 1000,
        Math.round((activo.logros.activoMs - antes) / 1000) + ' s contados');
    for (let i = 0; i < 60 * 60; i += 1) { t += 1000; activo.ultimaActividad = t; L.tiempo(activo, conf, t); }
    check('y como mucho maxPointsPerDay al día', L.puntos(activo, conf).activeTime === 2);

    const cazador = { level: 1 };
    avisos = L.caza(cazador, conf, 'Rat').concat(L.caza(cazador, conf, 'Rat'), L.caza(cazador, conf, 'Wolf'));
    check('caza: un punto por cada especie nueva', L.puntos(cazador, conf).hunting === 2 &&
        avisos.includes('Has ganado un punto de atributo por derrotar por primera vez a: Rat.'));
    avisos = L.caza(cazador, conf, 'Rat');
    check('y otro al llegar a masteryKills de una especie', L.puntos(cazador, conf).hunting === 3 &&
        avisos.includes('Has ganado un punto de atributo por derrotar 3 veces a: Rat.'));

    const guardado = JSON.parse(JSON.stringify(L.paraGuardar(pj)));
    const leido = {};
    L.cargar(leido, guardado);
    check('las cuentas se guardan y se cargan', JSON.stringify(leido.logros) === JSON.stringify(pj.logros));
    L.cargar(leido, { pasos: -5, lugares: 'x', especies: { Rat: 'mucho' }, activoHoy: null });
    check('y lo guardado mal no se cree', leido.logros.pasos === 0 && leido.logros.lugares.length === 0 &&
        leido.logros.especies.Rat === 0 && leido.logros.activoHoy.ms === 0);
}

// ===========================================================================
// El motor
// ===========================================================================
const e = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { mapName: 'jetyum', mapFile: null, useDatabase: false } });
const world = e.world;
const conf0 = world.atributosConf;

function conectar(nombre, vocacion, nivel, puntos) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    sesion.handle([P.CLIENT.LOGIN, 'cuenta', 'clave', nombre, vocacion, 'male']);
    const pj = sesion.player;
    pj.level = nivel;
    darPuntos(pj, world.atributosConf, puntos || 0);
    world.applyLevel(pj, { curar: true });
    return { sesion, buzon, pj };
}
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]);

/** Una casilla transitable y libre fuera de toda zona de protección, con la de su este también. */
function fueraDeProteccion() {
    const t = world.map.getWaypoint('temple');
    for (let r = 4; r < 60; r += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
            const c = { x: t.x + dx, y: t.y + r, z: t.z };
            const libre = (x, y) => world.map.isWalkable(x, y, c.z) &&
                !(world.map.getTile(x, y, c.z) || { isProtectionZone: () => false }).isProtectionZone() &&
                !(world.map.getTile(x, y, c.z) || { creatures: [] }).creatures.length;
            if (libre(c.x, c.y) && libre(c.x + 1, c.y)) {
                return c;
            }
        }
    }
    throw new Error('no hay sitio fuera de la zona de protección');
}

// ===========================================================================
section('3. Lo que da cada atributo');
// ===========================================================================
{
    const { pj } = conectar('Fuerte', 'Knight', 21, 30);
    const vida = pj.maxHealth;
    const mana = pj.maxMana;
    const cap = world.capacityOf(pj);
    world.asignarAtributo(pj, 'vitality', 4);
    world.asignarAtributo(pj, 'energy', 2);
    world.asignarAtributo(pj, 'strength', 10);
    check('vitalidad: +5 de vida máxima por punto', pj.maxHealth === vida + 20, vida + ' -> ' + pj.maxHealth);
    check('energía: +5 de maná máximo por punto', pj.maxMana === mana + 10, mana + ' -> ' + pj.maxMana);
    check('fuerza: +5 oz de capacidad por punto', world.capacityOf(pj) === cap + 50 * 100, cap + ' -> ' + world.capacityOf(pj));

    // El daño: el mismo jugador con y sin los puntos, con una espada de ataque fijo.
    pj.weaponType = 'sword';
    pj.weaponAttack = 30;
    const con = attackProfile(pj, world).maxDamage;
    const guardados = { ...pj.atributos };
    pj.atributos = { strength: 0, dexterity: 0, intelligence: 0, vitality: 0, energy: 0 };
    const sin = attackProfile(pj, world).maxDamage;
    check('fuerza: +1% de daño cuerpo a cuerpo por punto', Math.abs(con - Math.round(sin * 1.1)) <= 1, sin + ' -> ' + con);
    pj.weaponType = 'distance';
    pj.atributos.dexterity = 20;
    const conDestreza = attackProfile(pj, world).maxDamage;
    pj.atributos.dexterity = 0;
    const sinDestreza = attackProfile(pj, world).maxDamage;
    check('destreza: +1% de daño a distancia por punto', Math.abs(conDestreza - Math.round(sinDestreza * 1.2)) <= 1,
        sinDestreza + ' -> ' + conDestreza);
    pj.atributos = guardados;
    pj.weaponType = null;

    // La magia de los scripts (hechizos y runas) y la curación: con min = max no hay azar.
    pj.atributos.intelligence = 25;
    pj.health = 10;
    Game.doTargetCombat(e.registry.entities.creature(pj.id), e.registry.entities.creature(pj.id),
        { type: 'healing', min: 100, max: 100 });
    check('inteligencia: +1% de curación por punto', pj.health === 10 + 125, String(pj.health));
    // Fuera de la zona de protección del templo, que es donde aparece (ahí no se hiere a nadie).
    const fuera = fueraDeProteccion();
    world.teleportCreature(pj, fuera);
    const rata = world.createMonster('Rat', { x: fuera.x + 1, y: fuera.y, z: fuera.z });
    rata.maxHealth = rata.health = 100000;
    const golpe = () => {
        const antes = rata.health;
        Game.doTargetCombat(e.registry.entities.creature(pj.id), e.registry.entities.creature(rata.id),
            { type: 'energy', min: 400, max: 400 });
        return antes - rata.health;
    };
    const conIntel = golpe();
    pj.atributos.intelligence = 0;
    const sinIntel = golpe();
    check('inteligencia: +1% de daño mágico por punto', sinIntel > 0 && Math.abs(conIntel - Math.round(sinIntel * 1.25)) <= 1,
        sinIntel + ' -> ' + conIntel);
    world.removeMonster(rata.id);
}

// ===========================================================================
section('4. Desde el cliente');
// ===========================================================================
{
    const { sesion, buzon, pj } = conectar('Mago', 'Sorcerer', 6, 5);
    const r = sesion.handle([P.CLIENT.ATTRIBUTE_ADD, 'intelligence', 2]);
    check('ATTRIBUTE_ADD pone los puntos', r.ok && r.added === 2 && r.free === 3 && pj.atributos.intelligence === 2);
    const st = e.view.statsOf(pj).attributes;
    check('y las estadísticas los llevan, con el tope y cómo va cada fuente (para la ventana Atributos)',
        st && st.values.intelligence === 2 && st.free === 3 && st.max === 100 && st.perPoint.vitality.health === 5 &&
        st.sources.walking.points === 5 && st.sources.level.next === 10 && st.sources.exploring.placesTotal > 0,
        JSON.stringify(st.sources.exploring));
    const mal = sesion.handle([P.CLIENT.ATTRIBUTE_ADD, 'suerte', 1]);
    check('un atributo que no existe se rechaza con su mensaje', !mal.ok && textos(buzon).includes('Ese atributo no existe.'));

    const sinOro = sesion.handle([P.CLIENT.ATTRIBUTES_RESET]);
    check('reiniciar cuesta resetCost (500 de serie): sin oro no se puede', !sinOro.ok && sinOro.reason === 'dinero' &&
        pj.atributos.intelligence === 2 && textos(buzon).includes('Reiniciar los atributos cuesta 500 de oro.'));
    world.darDinero(pj, 800);
    const pagado = sesion.handle([P.CLIENT.ATTRIBUTES_RESET]);
    check('con oro, se cobra y se recuperan los puntos', pagado.ok && pagado.returned === 2 && world.countMoney(pj) === 300 &&
        A.libres(pj, world.atributosConf) === 5, world.countMoney(pj) + ' de oro');
    sesion.close();
}

// ===========================================================================
section('5. En el juego de verdad');
// ===========================================================================
{
    world.atributosConf = A.normalizarConfig({ sources: {
        walking: { stepsPerPoint: 2 }, exploring: { areasPerPoint: 0, pointsPerPlace: 0 }, magic: { runesPerPoint: 2 }
    } });
    const { sesion, buzon, pj } = conectar('Andarin', 'Sorcerer', 9);
    const fuera = fueraDeProteccion();
    world.teleportCreature(pj, fuera);
    for (let i = 0; i < 4; i += 1) {
        pj.nextStepAt = 0;
        world.moveCreature(pj, i % 2 === 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
    }
    check('andar fuera de la zona de protección da puntos', pj.logros.pasos === 4 && A.libres(pj, world.atributosConf) === 2 &&
        textos(buzon).includes('Has ganado un punto de atributo por caminar 2 pasos.'), pj.logros.pasos + ' pasos');
    world.teleportCreature(pj, { x: fuera.x, y: fuera.y + 0, z: fuera.z });
    check('teletransportarse no cuenta como andar', pj.logros.pasos === 4);

    world.giveItem(pj, 21000, 2);
    sesion.handle([P.CLIENT.SAY, 'adori vita vis']);
    pj.mana = pj.maxMana = 5000;
    pj.level = 60; pj.magicLevel = 20; pj.soul = 100;
    sesion.handle([P.CLIENT.SAY, 'adori vita vis']);
    world.now = ((antes) => () => antes() + 10000)(world.now);
    sesion.handle([P.CLIENT.SAY, 'adori vita vis']);
    check('crear runas cuenta', pj.logros.runas >= 1, pj.logros.runas + ' runas');

    buzon.length = 0;
    const lobo = world.createMonster('Wolf', { x: fuera.x + 1, y: fuera.y, z: fuera.z });
    e.combat.applyDamage(lobo, 100000, { attacker: pj, ignoreArmor: true });
    check('derrotar una especie nueva da su punto', pj.logros.especies.Wolf === 1 &&
        textos(buzon).includes('Has ganado un punto de atributo por derrotar por primera vez a: Wolf.'), textos(buzon).join(' | '));

    world.atributosConf = conf0;
    pj.level = 9;
    pj.experience = 0;
    buzon.length = 0;
    e.combat.addExperience(pj, 9300);
    check('llegar al nivel 10 da un punto y se avisa', pj.level >= 10 &&
        textos(buzon).includes('Has ganado un punto de atributo por llegar al nivel 10.'), 'nivel ' + pj.level);

    const guardado = JSON.parse(JSON.stringify(Vocacion.progresoParaGuardar(pj)));
    const otro = {};
    Vocacion.cargarProgreso(otro, guardado);
    check('atributos y logros se guardan con el progreso', otro.logros.especies.Wolf === 1 && otro.logros.pasos === 4 &&
        otro.atributos.strength === 0);

    darPuntos(pj, world.atributosConf, 10);
    world.asignarAtributo(pj, 'dexterity', 5);
    pj.level = 2;
    world.applyLevel(pj);
    check('bajar de nivel no quita lo repartido', pj.atributos.dexterity === 5);

    buzon.length = 0;
    sesion.handle([P.CLIENT.SAY, '/atributos vitalidad 3']);
    check('«/atributos vitalidad 3» pone 3 puntos (nombres en español o en inglés)', pj.atributos.vitality === 3,
        textos(buzon).join(' | '));
    sesion.handle([P.CLIENT.SAY, '/attributes energy']);
    check('«/attributes energy», uno', pj.atributos.energy === 1);
    buzon.length = 0;
    sesion.handle([P.CLIENT.SAY, '/atributos']);
    check('«/atributos» a secas lo cuenta todo, también de dónde salieron los puntos',
        textos(buzon).some((t) => t.startsWith('Vitalidad 3: +15 de vida máxima')) &&
        textos(buzon).some((t) => t.startsWith('Puntos ganados: 0 por nivel, ')) &&
        textos(buzon).some((t) => t.startsWith('Puntos por repartir: ')), textos(buzon).length + ' líneas');
    world.darDinero(pj, 500);
    sesion.handle([P.CLIENT.SAY, '/atributos reiniciar']);
    check('«/atributos reiniciar» los recupera (pagando)', A.gastados(pj) === 0 && world.countMoney(pj) === 0);
    sesion.close();
}

e.shutdown();
console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — los puntos se ganan jugando, se reparten y se notan.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
