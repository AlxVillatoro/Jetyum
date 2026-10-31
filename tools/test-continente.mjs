/**
 * Prueba del mapa CONTINENTE (tools/generar-continente.mjs): que es el que sale del generador, que
 * el motor lo carga, que trae todo el contenido del juego y que todo se puede alcanzar andando desde
 * el templo de Jetyum (con escaleras, agujeros, cuerda y teleports). Y, con un jugador de verdad, la
 * marca de ciudadano, las escaleras, el teleport al museo y las piezas, efectos y probador del museo.
 *
 *     node tools/test-continente.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { generar, AID, Z_MUSEO, salaDe } from './generar-continente.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');
const PR = require('../engine/net/protocol.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);
const clave = (x, y, z) => x + ',' + y + ',' + z;

console.log('Prueba del mapa «continente» (' + ROOT + ')');
const ARCHIVO = path.join(ROOT, 'data', 'world', 'continente.map.json');
const things = JSON.parse(fs.readFileSync(path.join(ROOT, 'client', 'jetyum', 'assets', 'things.json'), 'utf8'));

// ---------------------------------------------------------------------------
section('1. El generador');
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'continente-'));
    try {
        const t0 = Date.now();
        generar({ salida: tmp });
        const nuevo = fs.readFileSync(path.join(tmp, 'data', 'world', 'continente.map.json'), 'utf8');
        check('genera el mapa en poco tiempo', Date.now() - t0 < 30000, (Date.now() - t0) + ' ms');
        // Sin contar los finales de línea: git puede sacar el archivo con CRLF.
        const sinCr = (s) => s.replace(/\r\n/g, '\n');
        check('el mapa del repositorio es el que sale del generador (es determinista)',
            sinCr(nuevo) === sinCr(fs.readFileSync(ARCHIVO, 'utf8')), 'si falla: node tools/generar-continente.mjs');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

const crudo = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
const engine = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { useDatabase: false, mapName: 'continente', mapFile: null } });
const world = engine.world;
const map = world.map;
const tipo = (id) => world.itemTypes.get(Number(id));
const attr = (id, k) => { const d = tipo(id); return d && d.attributes ? d.attributes[k] : undefined; };

// ---------------------------------------------------------------------------
section('2. El motor lo carga, con todo el contenido');
{
    const s = map.stats();
    check('el motor carga «continente» sin errores: 256x256', s.size === '256x256x16', JSON.stringify(s).slice(0, 200));
    check('4 ciudades, cada una con su templo pisable y protegido', map.towns.length === 4 &&
        map.towns.every((t) => map.isWalkable(t.temple.x, t.temple.y, t.temple.z) &&
            map.getTile(t.temple.x, t.temple.y, t.temple.z).isProtectionZone()),
        map.towns.map((t) => t.name).join(', '));
    check('el templo por defecto es el de Jetyum', map.getWaypoint('temple').x === map.towns[0].temple.x);
    const nombres = new Set();
    map.spawns.forEach((a) => a.monsters.forEach((m) => nombres.add(m.name)));
    const todos = [...world.monsterTypes.keys()];
    check('TODOS los monstruos tienen respawn (' + todos.length + ')', todos.every((n) => nombres.has(n)),
        'faltan: ' + todos.filter((n) => !nombres.has(n)).join(', '));
    check('y todos los respawns son de monstruos que existen', [...nombres].every((n) => world.monsterTypes.has(n)));
    const npcs = new Set(crudo.npcs.map((n) => n.name));
    const definidos = [...world.npcTypes.keys()];
    check('TODOS los NPC están colocados (' + definidos.length + ')', definidos.every((n) => npcs.has(n)),
        'faltan: ' + definidos.filter((n) => !npcs.has(n)).join(', '));
    check('cada ciudad tiene sanador, guía, banquero y tendero',
        ['Sanador', 'Guia', 'Banquero', 'Tendero'].every((n) => crudo.npcs.filter((c) => c.name === n).length === 4));
    check('cada NPC está sobre una casilla que se pisa', crudo.npcs.every((n) => map.isWalkable(n.x, n.y, n.z)),
        crudo.npcs.filter((n) => !map.isWalkable(n.x, n.y, n.z)).map((n) => n.name + '@' + clave(n.x, n.y, n.z)).join(' '));
    check('cada respawn tiene su centro pisable', crudo.spawns.every((a) => map.isWalkable(a.x, a.y, a.z)),
        crudo.spawns.filter((a) => !map.isWalkable(a.x, a.y, a.z)).map((a) => clave(a.x, a.y, a.z)).join(' '));
    check('y los monstruos aparecen al arrancar', world.monsters.size >= crudo.spawns.reduce((n, a) => n + a.monsters.length, 0) * 0.9,
        world.monsters.size + ' monstruos');
    check('15 casas alquilables, cada una de una ciudad y con su cama', map.houses.length === 15 &&
        crudo.houses.every((h) => crudo.tiles.some((t) => t.houseId === h.id && (t.items || []).some((i) => i.id === 21050))));
    check('las salidas de las casas se pisan', crudo.houses.every((h) => map.isWalkable(h.exit[0], h.exit[1], h.exit[2])));
}

// ---------------------------------------------------------------------------
section('3. Cada ciudad: depósito, buzón y marca de ciudadano');
{
    map.towns.forEach((t) => {
        const cofres = crudo.tiles.filter((c) => (c.items || []).some((i) => i.id === 11112 && i.attributes && i.attributes.townId === t.id));
        const marcas = crudo.tiles.filter((c) => (c.items || []).some((i) => i.attributes && i.attributes.actionId === AID.ciudadano + t.id));
        const buzones = crudo.tiles.filter((c) => c.z === 7 && (c.items || []).some((i) => i.id === 21040));
        const cerca = buzones.some((b) => Math.abs(b.x - t.temple.x) < 30 && Math.abs(b.y - t.temple.y) < 30);
        check(t.name + ': ' + cofres.length + ' cofres de depósito de la ciudad, buzón y 2 marcas de ciudadano',
            cofres.length >= 4 && cerca && marcas.length === 2);
    });
    const chest = crudo.tiles.find((c) => (c.items || []).some((i) => i.id === 11112 && i.attributes.townId === 3));
    const item = map.getTile(chest.x, chest.y, chest.z).getItems().find((i) => i.typeId === 11112);
    check('el motor dice que un cofre de Arenal es de Arenal', world.ciudadDeCofre(item, { townId: 1 }) === 3);
}

// ---------------------------------------------------------------------------
section('4. Todo el catálogo está en el mapa (el museo)');
{
    const puestos = new Set();
    crudo.tiles.forEach((t) => {
        if (t.ground) {
            puestos.add(t.ground);
        }
        (t.items || []).forEach((i) => puestos.add(i.id));
    });
    const catalogo = [...world.itemTypes.keys()];
    const faltan = catalogo.filter((id) => !puestos.has(id));
    check('TODOS los objetos de items.xml están puestos (' + catalogo.length + ')', faltan.length === 0, faltan.slice(0, 20).join(', '));
    const piezas = crudo.tiles.filter((t) => t.z === Z_MUSEO).flatMap((t) => (t.items || []).filter((i) => i.attributes && i.attributes.actionId === AID.pieza));
    check('cada pieza del museo lleva su número y no se puede coger', piezas.length > 3000 &&
        piezas.filter((p) => p.id !== 11277).every((p) => p.attributes.pickupable === 0 && p.attributes.description === 'Pieza ' + p.id + ' del museo.'));
    const marcas = (base) => new Set(crudo.tiles.flatMap((t) => (t.items || []).filter((i) => i.attributes && i.attributes.actionId > base && i.attributes.actionId < base + 1000).map((i) => i.attributes.actionId - base)));
    const ef = marcas(AID.efecto);
    const pr = marcas(AID.proyectil);
    const as = marcas(AID.aspecto);
    check('una marca por cada efecto (' + things.effects.length + '), proyectil (' + things.missiles.length + ') y aspecto (' + things.outfits.length + ')',
        things.effects.every((e) => ef.has(e.id)) && things.missiles.every((e) => pr.has(e.id)) && things.outfits.every((e) => as.has(e.id)));
    check('las salas reparten bien: una espada es un arma y una mochila un contenedor',
        salaDe(11677, tipo(11677)) === 'armas' && salaDe(2412, tipo(2412)) === 'contenedores' && salaDe(21020, tipo(21020)) === 'peligro');
}

// ---------------------------------------------------------------------------
section('5. Todo se alcanza andando desde el templo de Jetyum');
const alcanzable = new Set();
{
    const DIR = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0], northalt: [0, -2], southalt: [0, 2], eastalt: [2, 0], westalt: [-2, 0] };
    const pieza = (i) => i.attributes && Number(i.attributes.actionId) === AID.pieza;
    const objetos = (x, y, z) => { const t = map.getTile(x, y, z); return t ? t.getItems() : []; };
    // Una puerta cerrada se abre usándola: para andar, cuenta como paso.
    const esPuerta = (i) => /door|gate/.test(String((tipo(i.typeId) || {}).name || ''));
    const pasable = (x, y, z) => {
        if (map.isWalkable(x, y, z)) {
            return true;
        }
        const t = map.getTile(x, y, z);
        return !!(t && t.ground && !t.ground.blocksSolid && t.getItems().some(esPuerta) &&
            t.getItems().filter((i) => i !== t.ground && attr(i.typeId, 'blocksSolid')).every(esPuerta));
    };
    // A dónde te lleva pisar (x, y, z): el mismo sitio, o el de la escalera / el agujero / el teleport.
    const pisar = (x, y, z) => {
        for (const i of objetos(x, y, z)) {
            if (pieza(i)) {
                continue;
            }
            const fc = attr(i.typeId, 'floorchange');
            let d = null;
            if (fc === 'down') {
                d = [x, y, z + 1];
                const rampa = objetos(x, y, z + 1).map((o) => DIR[attr(o.typeId, 'floorchange')]).find(Boolean);
                if (rampa) {
                    d = [x - Math.sign(rampa[0]), y - Math.sign(rampa[1]), z + 1];
                }
            } else if (DIR[fc]) {
                d = [x + DIR[fc][0], y + DIR[fc][1], z - 1];
            } else if (i.attributes && i.attributes.teleportDestination) {
                const t = i.attributes.teleportDestination;
                d = [t.x, t.y, t.z];
            }
            if (d) {
                return map.isWalkable(d[0], d[1], d[2]) ? d : [x, y, z];
            }
        }
        return [x, y, z];
    };
    // Lo que se puede USAR desde (x, y, z) o al lado: escalera de mano, cuerda, pala sobre las piedras.
    const usar = (x, y, z) => {
        const destinos = [];
        const t = map.getTile(x, y, z);
        if (!t) {
            return destinos;
        }
        for (const i of t.getItems()) {
            if (pieza(i)) {
                continue;
            }
            if (i.typeId === 11009 || i.typeId === 11000) {
                destinos.push([x, y + 1, z - 1], [x + 1, y, z - 1], [x - 1, y, z - 1], [x, y - 1, z - 1]);
            } else if (i.typeId === 21032) {
                destinos.push([x, y, z + 1]);
            }
        }
        return destinos.filter((d) => map.isWalkable(d[0], d[1], d[2]));
    };
    const t0 = map.towns[0].temple;
    const cola = [[t0.x, t0.y, t0.z]];
    alcanzable.add(clave(t0.x, t0.y, t0.z));
    while (cola.length) {
        const [x, y, z] = cola.pop();
        const vecinos = [];
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                if ((dx || dy) && map.inBounds(x + dx, y + dy, z)) {
                    // Lo que se usa se usa desde al lado (el montón de piedras y la escalera de mano).
                    usar(x + dx, y + dy, z).forEach((d) => vecinos.push(d));
                    if (pasable(x + dx, y + dy, z)) {
                        vecinos.push(pisar(x + dx, y + dy, z));
                    }
                }
            }
        }
        usar(x, y, z).forEach((d) => vecinos.push(d));
        vecinos.forEach((v) => {
            const k = clave(v[0], v[1], v[2]);
            if (!alcanzable.has(k)) {
                alcanzable.add(k);
                cola.push(v);
            }
        });
    }
    const llega = (x, y, z) => alcanzable.has(clave(x, y, z));
    const alLado = (x, y, z) => [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, b]) => llega(x + a, y + b, z));
    check('se alcanzan ' + alcanzable.size + ' casillas, en ' + new Set([...alcanzable].map((k) => k.split(',')[2])).size + ' plantas',
        alcanzable.size > 40000);
    check('los templos de las 4 ciudades', map.towns.every((t) => llega(t.temple.x, t.temple.y, t.temple.z)));
    const sinLlegar = (lista) => lista.filter((p) => !llega(p.x, p.y, p.z));
    check('todos los NPC', sinLlegar(crudo.npcs).length === 0, sinLlegar(crudo.npcs).map((n) => n.name).join(', '));
    check('todos los respawns (' + crudo.spawns.length + ', en 5 plantas)', sinLlegar(crudo.spawns).length === 0,
        sinLlegar(crudo.spawns).map((s) => clave(s.x, s.y, s.z)).join(' '));
    const lugares = Object.entries(crudo.waypoints).filter(([, p]) => !llega(p[0], p[1], p[2]));
    check('todos los lugares de `/ir` (' + Object.keys(crudo.waypoints).length + ')', lugares.length === 0, lugares.map(([n]) => n).join(', '));
    check('las salidas y puertas de las 15 casas', crudo.houses.every((h) => llega(h.exit[0], h.exit[1], h.exit[2])));
    const cofres = crudo.tiles.filter((c) => (c.items || []).some((i) => i.id === 11112 && i.attributes && i.attributes.townId));
    check('los ' + cofres.length + ' cofres de depósito y los buzones (desde al lado)', cofres.every((c) => alLado(c.x, c.y, c.z)) &&
        crudo.tiles.filter((c) => (c.items || []).some((i) => i.id === 21040 && !i.attributes)).every((c) => alLado(c.x, c.y, c.z)));
    const tesoro = crudo.tiles.find((c) => (c.items || []).some((i) => i.id === 11111 && !i.attributes));
    check('el cofre del tesoro, al fondo del abismo (planta 10)', tesoro && tesoro.z === 10 && alLado(tesoro.x, tesoro.y, tesoro.z));
    const museo = crudo.tiles.filter((t) => t.z === Z_MUSEO && (t.items || []).some((i) => i.attributes && i.attributes.actionId >= AID.efecto));
    check('todas las marcas del museo (efectos, proyectiles y aspectos)', museo.every((t) => llega(t.x, t.y, t.z)),
        museo.filter((t) => !llega(t.x, t.y, t.z)).length + ' sin llegar');
    const carteles = crudo.tiles.filter((t) => t.z === Z_MUSEO && (t.items || []).some((i) => i.id === 11277));
    check('las ' + carteles.length + ' salas del museo', carteles.every((t) => alLado(t.x, t.y, t.z)));
}

// ---------------------------------------------------------------------------
section('6. Jugando');
{
    const sent = [];
    const session = engine.createSession((m) => sent.push(m));
    session.enterWorld('Viajera');
    const yo = world.getPlayer(session.playerId);
    const paso = (dx, dy) => { yo.nextStepAt = 0; return world.moveCreature(yo, { x: dx, y: dy }); };
    const ir = (x, y, z) => world.teleportPlayer(session.playerId, x, y, z);
    const textos = () => sent.map((m) => JSON.stringify(m));
    const conItem = (pred) => crudo.tiles.find((t) => (t.items || []).some(pred));

    // La marca de ciudadano de Escarcha.
    const marca = conItem((i) => i.attributes && i.attributes.actionId === AID.ciudadano + 2);
    ir(marca.x - 1, marca.y, marca.z);
    paso(1, 0);
    check('pisar la marca de Escarcha te hace vecino de Escarcha', yo.townId === 2 && world.ciudadDelJugador(yo) === 2,
        'townId ' + yo.townId);

    // Las escaleras de las alcantarillas de Jetyum: bajar y subir.
    const plaza = map.towns[0];
    const esc = crudo.tiles.find((t) => t.z === 7 && t.ground === 10997 && Math.abs(t.x - plaza.temple.x) < 15 && Math.abs(t.y - plaza.temple.y) < 25);
    ir(esc.x, esc.y - 1, 7);
    paso(0, 1);
    const abajo = { ...yo.position };
    check('la escalera de la plaza baja a las alcantarillas', abajo.z === 8 && abajo.x === esc.x && abajo.y === esc.y + 1,
        JSON.stringify(abajo));
    paso(0, -1);
    check('y la de abajo sube a la plaza', yo.position.z === 7 && yo.position.y === esc.y - 1, JSON.stringify(yo.position));

    // El teleport del museo.
    const tp = crudo.tiles.find((t) => t.z === 7 && (t.items || []).some((i) => i.id === 1387));
    ir(tp.x, tp.y + 1, 7);
    paso(0, -1);
    check('el teleport de Jetyum lleva al museo (planta ' + Z_MUSEO + ')', yo.position.z === Z_MUSEO, JSON.stringify(yo.position));

    // Una pieza: ni se coge ni se usa.
    const pocion = crudo.tiles.find((t) => t.z === Z_MUSEO && (t.items || []).some((i) => i.id === 2413));
    ir(pocion.x, pocion.y + 1, Z_MUSEO);
    const coger = world.pickUpItem(yo, pocion.x, pocion.y, Z_MUSEO);
    check('una pieza del museo no se puede coger', coger.ok === false && coger.reason === 'notPickupable', JSON.stringify(coger));
    const mover = world.moveItem(yo, { kind: 'ground', x: pocion.x, y: pocion.y, z: Z_MUSEO }, { kind: 'ground', x: pocion.x, y: pocion.y + 1, z: Z_MUSEO });
    check('ni se puede arrastrar', mover.ok === false, JSON.stringify(mover));
    sent.length = 0;
    session.handle([PR.CLIENT.USE_ITEM, pocion.x, pocion.y, Z_MUSEO]);
    const sigue = map.getTile(pocion.x, pocion.y, Z_MUSEO).getItems().some((i) => i.typeId === 2413);
    check('usarla no se la bebe: dice que es del museo', sigue && textos().some((t) => t.includes('pieza del museo')), textos().join(' ').slice(0, 160));

    // Una escalera del museo no baja a ninguna parte.
    const escPieza = crudo.tiles.find((t) => t.z === Z_MUSEO && (t.items || []).some((i) => i.id === 11005));
    ir(escPieza.x - 1, escPieza.y, Z_MUSEO);
    paso(1, 0);
    check('pisar una escalera del museo no te mueve de planta', yo.position.z === Z_MUSEO && yo.position.x === escPieza.x);

    // Los efectos.
    const efectos = [];
    const antes = world.sendMagicEffect.bind(world);
    world.sendMagicEffect = (pos, ef) => { efectos.push(ef); return antes(pos, ef); };
    const ef = crudo.tiles.find((t) => (t.items || []).some((i) => i.attributes && i.attributes.actionId === AID.efecto + 120));
    ir(ef.x - 1, ef.y, Z_MUSEO);
    paso(1, 0);
    world.sendMagicEffect = antes;
    check('pisar la marca del efecto 120 lo enseña', efectos.includes(120), efectos.join(','));

    // El probador.
    const mio = yo.outfit.lookType;
    const as = crudo.tiles.find((t) => (t.items || []).some((i) => i.attributes && i.attributes.actionId === AID.aspecto + 22));
    ir(as.x - 1, as.y, Z_MUSEO);
    paso(1, 0);
    check('en la marca del aspecto 22 llevas el aspecto 22 (un cíclope)', yo.outfit.lookType === 22, 'lookType ' + yo.outfit.lookType);
    paso(1, 0);
    check('al bajarte vuelves al tuyo', yo.outfit.lookType === mio, 'lookType ' + yo.outfit.lookType + ' / ' + mio);
    paso(-1, 0);
    paso(-1, 0);
    check('y si te subes y te bajas otra vez, igual', yo.outfit.lookType === mio);
    session.close();
}

console.log('\n' + (failures === 0 ? '\x1b[32mTodo bien.\x1b[0m' : '\x1b[31m' + failures + ' fallo(s).\x1b[0m'));
if (engine.shutdown) {
    engine.shutdown();
}
process.exit(failures === 0 ? 0 : 1);
