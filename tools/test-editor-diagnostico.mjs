/**
 * PRUEBA DEL DIAGNÓSTICO DEL MAPA del editor (`editor/js/diagnostico.js`): cada comprobación con
 * un mapa pequeño hecho para dispararla, las reglas de paso contrastadas con las del motor, el
 * panel con un DOM de mentira, el diccionario inglés, la velocidad en un mapa de 2048x2048, y los
 * mapas de verdad de `data/world/`.
 *
 *     node tools/test-editor-diagnostico.mjs
 *
 * En los mapas de verdad no se exige cero problemas —un mapa vivo puede tener avisos legítimos,
 * como un respawn con el centro en un árbol—: se exige que no reviente, que no haya ERRORES de los
 * que el motor no dejaría cargar, y que los recuentos tengan sentido. El resumen se imprime.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { EditorMap } from '../editor/js/editormap.js';
import * as D from '../editor/js/diagnostico.js';
import * as I from '../shared/js/i18n.mjs';
import diccionario from '../shared/i18n/en/editor-diagnostico.mjs';

const require = createRequire(import.meta.url);
const Xml = require('../engine/data/xml.js');
const MapLoader = require('../engine/world/loader.js');
const Tools = require('../editor/server.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;
let total = 0;

function check(label, condition, detail) {
    total += 1;
    if (!condition) {
        fallos += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}

function section(t) {
    console.log('\n' + t);
}

// Los objetos de items.xml que usan los mapas de prueba.
const HIERBA = 102;          // suelo
const PIEDRA = 104;          // suelo
const HIERBA_MURO = 10100;   // suelo que bloquea
const MURO = 111;            // stone wall, bloquea
const ARBOL = 11500;         // tree, bloquea
const MONEDA = 3031;         // no bloquea
const TELEPORT = 1387;
const AGUJERO = 10995;       // floorchange down (objeto)
const ESCALERA_ABAJO = 10997; // floorchange down (suelo)
const RAMPA_NORTE = 11001;   // floorchange north
const ESCALERA_ESTE_ALT = 11007; // floorchange eastalt

const items = Xml.loadItems(path.join(ROOT, 'data', 'items', 'items.xml'));
const npcTypes = Xml.loadNpcs(path.join(ROOT, 'data', 'npc', 'npcs.xml'));
const monstruos = Tools.listMonsters().monsters;

/** Un mapa de 32x32x16 con hierba por defecto en la 7 y lo que se le pida encima. */
function mapa(extra) {
    return new EditorMap(Object.assign({
        format: 'jetyum-map', version: 1, name: 'prueba', width: 32, height: 32, floors: 16,
        defaultGround: { 7: HIERBA }, tiles: []
    }, extra || {}), items, npcTypes);
}

const de = (problemas, tipo) => problemas.filter((p) => p.tipo === tipo);
const en = (problemas, x, y, z) => problemas.filter((p) => p.x === x && p.y === y && p.z === z);
const lista = (problemas) => problemas.map((p) => p.gravedad + ' ' + p.tipo + ' ' + p.mensaje).join(' | ');

// ---------------------------------------------------------------------------------------------
section('1. Un mapa limpio no da nada');
{
    const limpio = mapa({
        tiles: [
            { x: 5, y: 5, z: 7, items: [MURO] },
            { x: 6, y: 5, z: 7, items: [{ id: TELEPORT, attributes: { teleportDestination: { x: 10, y: 10, z: 7 } } }] },
            { x: 7, y: 5, z: 7, items: [{ id: MONEDA, attributes: { uniqueId: 5000 } }] },
            { x: 8, y: 5, z: 7, items: [{ id: MONEDA, attributes: { uniqueId: 5001 } }] }
        ],
        waypoints: { temple: [10, 10, 7] },
        towns: [{ id: 1, name: 'Villa', temple: [10, 10, 7] }],
        houses: [{ id: 1, name: 'Casita', townId: 1, rent: 10, exit: [12, 14, 7] }],
        spawns: [{ x: 20, y: 20, z: 7, radius: 2, monsters: [{ name: monstruos[0].name, x: 21, y: 20 }] }],
        npcs: [{ x: 15, y: 15, z: 7, name: 'Guia' }]
    });
    [[12, 12], [13, 12], [12, 13], [13, 13]].forEach(([x, y]) =>
        limpio.tiles.set(x + ',' + y + ',7', { x, y, z: 7, ground: PIEDRA, items: [], flags: ['house'], houseId: 1 }));
    const p = D.diagnosticar(limpio, { monstruos: monstruos });
    check('ningún problema', p.length === 0, lista(p));
    check('un mapa vacío tampoco', D.diagnosticar(mapa()).length === 0);
}

// ---------------------------------------------------------------------------------------------
section('2. Cada comprobación, con su mapa');
{
    // uniqueId repetido: las dos apariciones, cada una apuntando a la otra.
    const m = mapa({ tiles: [
        { x: 1, y: 1, z: 7, items: [{ id: MONEDA, attributes: { uniqueId: 1000 } }] },
        { x: 2, y: 1, z: 7, items: [{ id: MONEDA, attributes: { uniqueId: 1000 } }] },
        { x: 3, y: 1, z: 7, items: [{ id: MONEDA, attributes: { uniqueId: 1001 } }] }
    ] });
    const p = de(D.diagnosticar(m), 'uid-repetido');
    check('uniqueId repetido: un error por aparición', p.length === 2 && p.every((x) => x.gravedad === 'error'), lista(p));
    check('y cada uno dice dónde está el otro', p[0].mensaje.includes('(2,1,7)') && p[1].mensaje.includes('(1,1,7)'),
        p.map((x) => x.mensaje).join(' / '));
}
{
    const tp = (destino) => ({ id: TELEPORT, attributes: destino === undefined ? undefined : { teleportDestination: destino } });
    const m = mapa({ tiles: [
        { x: 1, y: 1, z: 7, items: [tp()] },                                  // sin destino
        { x: 2, y: 1, z: 7, items: [tp({ x: 99, y: 1, z: 7 })] },              // fuera del mapa
        { x: 3, y: 1, z: 7, items: [tp({ x: 3, y: 3, z: 6 })] },               // aire: la 6 no tiene suelo
        { x: 4, y: 1, z: 7, items: [tp([5, 5, 7])] },                          // un muro (en forma de lista)
        { x: 5, y: 5, z: 7, items: [MURO] },
        { x: 6, y: 1, z: 7, items: [tp('nada')] },                             // ilegible
        { x: 7, y: 1, z: 7, items: [tp({ x: 7, y: 1, z: 7 })] },               // a sí mismo
        { x: 8, y: 1, z: 7, items: [tp({ x: 9, y: 9, z: 7 })] },               // bien
        { x: 9, y: 1, z: 7, items: [{ id: MONEDA, attributes: { teleportDestination: { x: 2, y: 2, z: 9 } } }] } // bien: la 9 sin suelo... ver abajo
    ] });
    const p = D.diagnosticar(m);
    const t = de(p, 'teleport');
    check('teleport sin destino', en(t, 1, 1, 7).length === 1 && en(t, 1, 1, 7)[0].gravedad === 'error');
    check('teleport fuera del mapa', /fuera del mapa/.test((en(t, 2, 1, 7)[0] || {}).mensaje));
    check('teleport al aire (encima de la 7 no hay suelo de reserva)', /vacío/.test((en(t, 3, 1, 7)[0] || {}).mensaje));
    check('teleport a un muro, con el destino escrito como lista', /no se puede pisar/.test((en(t, 4, 1, 7)[0] || {}).mensaje));
    check('teleport con el destino ilegible', /no se puede leer/.test((en(t, 6, 1, 7)[0] || {}).mensaje));
    check('teleport a su propia casilla: aviso', (en(t, 7, 1, 7)[0] || {}).gravedad === 'aviso');
    check('un teleport bien no sale', en(t, 8, 1, 7).length === 0);
    check('cualquier objeto con teleportDestination cuenta como teleport', en(t, 9, 1, 7).length === 1 &&
        /vacío/.test(en(t, 9, 1, 7)[0].mensaje), lista(en(t, 9, 1, 7)));
}
{
    // Con fallbackGround, la 8 y más abajo tienen suelo; la 6 y más arriba siguen siendo aire.
    const m = mapa({ fallbackGround: PIEDRA, tiles: [
        { x: 1, y: 1, z: 7, items: [{ id: TELEPORT, attributes: { teleportDestination: { x: 1, y: 1, z: 9 } } }] },
        { x: 2, y: 1, z: 7, items: [{ id: TELEPORT, attributes: { teleportDestination: { x: 1, y: 1, z: 5 } } }] }
    ] });
    const t = de(D.diagnosticar(m), 'teleport');
    check('el suelo de reserva vale de la 7 hacia abajo, como en el motor', en(t, 1, 1, 7).length === 0, lista(t));
    check('y no por encima de la 7', en(t, 2, 1, 7).length === 1, lista(t));
}
{
    const m = mapa({ tiles: [
        { x: 1, y: 1, z: 6, items: [MONEDA] },                    // objetos en el aire
        { x: 2, y: 1, z: 6, ground: PIEDRA, items: [MONEDA] },    // con suelo propio
        { x: 3, y: 1, z: 7, items: [MONEDA] },                    // hereda la hierba de la 7
        { x: 4, y: 1, z: 6, items: [{ id: PIEDRA }, MONEDA] },    // un objeto isGround hace de suelo
        { x: 5, y: 1, z: 6, flags: ['protectionZone'] }           // sin objetos: no se avisa
    ] });
    const s = de(D.diagnosticar(m), 'sin-suelo');
    check('casilla con objetos y sin suelo: aviso', s.length === 1 && s[0].x === 1 && s[0].gravedad === 'aviso', lista(s));
}
{
    const m = mapa({ defaultGround: { 7: HIERBA, 8: 99999 }, fallbackGround: 99998, tiles: [
        { x: 1, y: 1, z: 7, items: [77777] },
        { x: 2, y: 1, z: 7, ground: 88888 }
    ] });
    const p = de(D.diagnosticar(m), 'objeto-desconocido');
    check('objeto desconocido: error en su casilla', en(p, 1, 1, 7).length === 1 && en(p, 1, 1, 7)[0].gravedad === 'error');
    check('suelo desconocido', /suelo 88888/.test((en(p, 2, 1, 7)[0] || {}).mensaje));
    check('suelo de planta y de reserva desconocidos, sin casilla', p.filter((x) => x.x === undefined).length === 2, lista(p));
    const sinTipos = new EditorMap({ format: 'jetyum-map', version: 1, name: 'x', width: 8, height: 8, floors: 16,
        defaultGround: { 7: 1 }, tiles: [{ x: 1, y: 1, z: 7, items: [77777] }] }, new Map());
    check('sin items.xml no se acusa a nadie de no existir', de(D.diagnosticar(sinTipos), 'objeto-desconocido').length === 0);
}
{
    const m = mapa({ tiles: [
        { x: 1, y: 1, z: 7, items: [MURO, MURO] },
        { x: 2, y: 1, z: 7, items: [MURO, ARBOL] },
        { x: 3, y: 1, z: 7, items: [MURO, MONEDA] },
        { x: 4, y: 1, z: 7, ground: HIERBA_MURO, items: [MURO] }, // el suelo no cuenta
        { x: 5, y: 1, z: 7, items: [MURO, { id: ARBOL, attributes: { blocksSolid: 0 } }] } // la instancia manda
    ] });
    const b = de(D.diagnosticar(m), 'bloqueo-apilado');
    check('muro sobre muro y muro sobre árbol: aviso', b.length === 2 && b.every((x) => x.gravedad === 'aviso'), lista(b));
    check('con los nombres', /stone wall \(111\), tree \(11500\)/.test((en(b, 2, 1, 7)[0] || {}).mensaje));
}
{
    const casa = (x, y, id) => ({ x, y, z: 7, ground: PIEDRA, flags: ['house'], houseId: id });
    const m = mapa({
        towns: [{ id: 1, name: 'Villa', temple: [20, 20, 7] }],
        houses: [
            { id: 1, name: 'Sin casillas', townId: 1, exit: [1, 1, 7] },
            { id: 2, name: 'Sin salida', townId: 1 },
            { id: 3, name: 'Salida dentro', townId: 1, exit: [5, 2, 7] },
            { id: 4, name: 'Salida al muro', townId: 1, exit: [8, 3, 7] },
            { id: 5, name: 'Salida lejos', townId: 1, exit: [20, 2, 7] },
            { id: 6, name: 'Salida fuera', townId: 1, exit: [50, 50, 7] },
            { id: 7, name: 'Ciudad que no hay', townId: 9, exit: [11, 3, 7] },
            { id: 7, name: 'Repetida' }
        ],
        tiles: [
            casa(4, 2, 2),
            casa(5, 2, 3), casa(5, 1, 3),
            casa(8, 2, 4), { x: 8, y: 3, z: 7, items: [MURO] },
            casa(14, 2, 5),
            casa(11, 6, 6),
            casa(11, 2, 7),
            casa(25, 25, 42), casa(26, 25, 42)
        ]
    });
    const c = de(D.diagnosticar(m), 'casa');
    const conTexto = (re) => c.filter((x) => re.test(x.mensaje));
    check('casa sin casillas: aviso', conTexto(/«Sin casillas» no tiene ninguna casilla/).length === 1 &&
        conTexto(/«Sin casillas» no tiene ninguna/)[0].gravedad === 'aviso');
    check('casa sin salida: aviso, en su casilla', (conTexto(/«Sin salida» no tiene salida/)[0] || {}).x === 4);
    check('salida dentro de una casa: error', (conTexto(/«Salida dentro» está dentro/)[0] || {}).gravedad === 'error');
    check('salida en un muro: error', (conTexto(/«Salida al muro» no se puede pisar/)[0] || {}).gravedad === 'error');
    check('salida lejos de la casa: aviso con la distancia', /a 6 casillas/.test((conTexto(/«Salida lejos»/)[0] || {}).mensaje));
    check('salida fuera del mapa: error', (conTexto(/«Salida fuera» cae fuera/)[0] || {}).gravedad === 'error');
    check('casa de una ciudad que no existe: error', conTexto(/de la ciudad 9, que no existe/).length === 1);
    check('casa con id repetido: error', conTexto(/#7 tiene un id inválido o repetido/).length === 1);
    const huerfanas = conTexto(/casa 42, que no está/);
    check('casillas de una casa que no existe: UNA fila con la cuenta', huerfanas.length === 1 &&
        /^2 casillas/.test(huerfanas[0].mensaje) && huerfanas[0].gravedad === 'error', lista(huerfanas));
}
{
    const m = mapa({
        towns: [
            { id: 1, name: 'Bien', temple: [3, 3, 7] },
            { id: 2, name: 'Templo al muro', temple: [5, 5, 7] },
            { id: 3, name: 'Templo fuera', temple: [40, 3, 7] },
            { id: 4, name: 'Sin templo' },
            { id: 1, name: 'Repetida', temple: [3, 3, 7] }
        ],
        waypoints: { bien: [3, 3, 7], muro: [5, 5, 7], fuera: [3, 3, 16], aire: { x: 3, y: 3, z: 4 }, roto: 'x' },
        tiles: [{ x: 5, y: 5, z: 7, items: [MURO] }]
    });
    const p = D.diagnosticar(m);
    const ci = de(p, 'ciudad');
    check('templo en un muro: error en el templo', ci.some((x) => /«Templo al muro»/.test(x.mensaje) && x.x === 5 && x.gravedad === 'error'));
    check('templo fuera del mapa: error', ci.some((x) => /«Templo fuera» cae fuera/.test(x.mensaje)));
    check('ciudad sin templo y ciudad repetida', ci.some((x) => /«Sin templo» no tiene templo/.test(x.mensaje)) &&
        ci.some((x) => /#4 tiene un id/.test(x.mensaje)), lista(ci));
    check('y la ciudad buena no sale', !ci.some((x) => /«Bien»/.test(x.mensaje)));
    const w = de(p, 'waypoint');
    check('waypoints: muro, fuera, aire e ilegible (errores, como en el motor)', w.length === 4 &&
        w.every((x) => x.gravedad === 'error'), lista(w));
}
{
    const nombre = monstruos[0].name;
    const m = mapa({
        tiles: [
            { x: 5, y: 5, z: 7, items: [MURO] },
            { x: 10, y: 10, z: 7, items: [ARBOL] },
            { x: 21, y: 21, z: 7, flags: ['protectionZone'] }
        ],
        spawns: [
            { x: 3, y: 3, z: 7, radius: 1, monsters: [{ name: 'Dragón Inventado' }, { name: nombre }] },
            { x: 5, y: 5, z: 7, radius: 1, monsters: [{ name: nombre }] },
            { x: 10, y: 10, z: 7, radius: 0, monsters: [{ name: nombre }] },
            { x: 20, y: 20, z: 7, radius: 2, monsters: [{ name: nombre, x: 21, y: 21 }] },
            { x: 25, y: 25, z: 7, radius: 1, monster: nombre }
        ]
    });
    // El monstruo fuera de su área y el que está sobre un muro se ponen a mano: el editor no deja.
    m.spawns.push({ x: 15, y: 15, z: 7, radius: 1, interval: 60000, monsters: [{ name: nombre, x: 18, y: 15 }] });
    m.spawns.push({ x: 4, y: 5, z: 7, radius: 1, interval: 60000, monsters: [{ name: nombre, x: 5, y: 5 }] });
    m.spawns.push({ x: 3, y: 3, z: 20, radius: 1, interval: 60000, monsters: [{ name: nombre }] });
    const r = de(D.diagnosticar(m, { monstruos: monstruos }), 'respawn');
    const conTexto = (re) => r.filter((x) => re.test(x.mensaje));
    check('monstruo que no existe: error con su nombre', conTexto(/no existen en data\/monsters\/: Dragón Inventado$/).length === 1);
    check('sin lista de monstruos no se comprueban los nombres',
        !de(D.diagnosticar(m), 'respawn').some((x) => /no existen/.test(x.mensaje)));
    check('centro en un muro: aviso', en(r, 5, 5, 7).some((x) => /centro/.test(x.mensaje) && x.gravedad === 'aviso'));
    check('respawn sin ninguna casilla libre: error', en(r, 10, 10, 7).some((x) => /ninguna casilla/.test(x.mensaje) && x.gravedad === 'error'));
    check('pero con una libre alrededor no', !en(r, 5, 5, 7).some((x) => /ninguna casilla/.test(x.mensaje)));
    check('monstruo en zona protegida: aviso', en(r, 21, 21, 7).some((x) => /zona protegida/.test(x.mensaje)));
    check('monstruo fuera de su respawn: error', en(r, 18, 15, 7).some((x) => /fuera de su respawn/.test(x.mensaje) && x.gravedad === 'error'));
    check('monstruo sobre un muro: aviso', en(r, 5, 5, 7).some((x) => /está en una casilla que no se puede pisar/.test(x.mensaje)));
    check('respawn fuera del mapa: error sin casilla', conTexto(/centro fuera del mapa/).length === 1 &&
        conTexto(/centro fuera del mapa/)[0].x === undefined);
    check('la forma antigua del formato se lee igual', en(r, 25, 25, 7).length === 0);
}
{
    const m = mapa({
        tiles: [{ x: 5, y: 5, z: 7, items: [MURO] }],
        npcs: [
            { x: 3, y: 3, z: 7, name: 'Guia' },
            { x: 5, y: 5, z: 7, name: 'Herrero' },
            { x: 6, y: 6, z: 7, name: 'Fantasma' },
            { x: 8, y: 8, z: 7, name: 'Tendero' },
            { x: 8, y: 8, z: 7, name: 'Banquero' },
            { x: 40, y: 8, z: 7, name: 'Guardia' }
        ]
    });
    const n = de(D.diagnosticar(m), 'npc');
    check('NPC sobre un muro: aviso', en(n, 5, 5, 7).length === 1 && en(n, 5, 5, 7)[0].gravedad === 'aviso');
    check('NPC que no está en npcs.xml: error', en(n, 6, 6, 7).some((x) => x.gravedad === 'error'));
    check('dos NPC en la misma casilla: aviso', en(n, 8, 8, 7).some((x) => /hay 2 NPC/.test(x.mensaje)));
    check('NPC fuera del mapa: error', n.some((x) => /«Guardia» está fuera del mapa/.test(x.mensaje)));
    check('y el que está bien no sale', en(n, 3, 3, 7).length === 0, lista(n));
}
{
    const m = mapa({ defaultGround: { 7: HIERBA }, tiles: [
        // Sube al norte: (10,9,6). Hay suelo ahí -> bien.
        { x: 10, y: 10, z: 7, items: [RAMPA_NORTE] },
        { x: 10, y: 9, z: 6, ground: PIEDRA },
        // Sube al norte a una casilla de aire.
        { x: 12, y: 10, z: 7, items: [RAMPA_NORTE] },
        // eastalt: dos al este. (16,10,6) es un muro.
        { x: 14, y: 10, z: 7, items: [ESCALERA_ESTE_ALT] },
        { x: 16, y: 10, z: 6, ground: PIEDRA, items: [MURO] },
        // Baja desde la 6 a la 7: hierba por defecto -> bien.
        { x: 20, y: 20, z: 6, ground: ESCALERA_ABAJO },
        // Baja desde la 7 a la 8: la 8 no tiene suelo -> vacío.
        { x: 22, y: 20, z: 7, items: [AGUJERO] },
        // Baja a una rampa: se aparece DELANTE de ella. La rampa de (24,20,8) sube al norte, así
        // que se aparece en (24,21,8): ahí hay suelo, y en (24,20,8) no haría falta.
        { x: 24, y: 20, z: 7, items: [AGUJERO] },
        { x: 24, y: 20, z: 8, ground: PIEDRA, items: [RAMPA_NORTE] },
        { x: 24, y: 21, z: 8, ground: PIEDRA },
        // Igual, pero delante de la rampa no hay nada.
        { x: 26, y: 20, z: 7, items: [AGUJERO] },
        { x: 26, y: 20, z: 8, ground: PIEDRA, items: [RAMPA_NORTE] },
        // La última planta no tiene planta de abajo.
        { x: 28, y: 20, z: 15, ground: PIEDRA, items: [AGUJERO] }
    ] });
    const c = de(D.diagnosticar(m), 'cambio-de-planta');
    check('rampa con suelo arriba: bien', en(c, 10, 10, 7).length === 0);
    check('rampa que sube al aire: aviso', en(c, 12, 10, 7).length === 1 && en(c, 12, 10, 7)[0].gravedad === 'aviso' &&
        /\(12,9,6\)/.test(en(c, 12, 10, 7)[0].mensaje));
    check('escalera ancha (eastalt) a un muro', /\(16,10,6\), que no se puede pisar/.test((en(c, 14, 10, 7)[0] || {}).mensaje));
    check('escalera de bajar (suelo) a la hierba: bien', en(c, 20, 20, 6).length === 0);
    check('agujero al vacío', /\(22,20,8\), que es vacío/.test((en(c, 22, 20, 7)[0] || {}).mensaje));
    check('bajar a una rampa: se aparece delante, como en floorchange.js', en(c, 24, 20, 7).length === 0, lista(en(c, 24, 20, 7)));
    check('y si delante no hay suelo, se avisa con esa casilla', /\(26,21,8\)/.test((en(c, 26, 20, 7)[0] || {}).mensaje));
    check('bajar desde la última planta', /planta 16, que no existe/.test((en(c, 28, 20, 15)[0] || {}).mensaje));
    check('de las ocho escaleras, rampas y agujeros, avisan las cinco rotas y ninguna más', c.length === 5, lista(c));
}

// ---------------------------------------------------------------------------------------------
section('3. Las reglas de paso son las del motor');
{
    /*
     * Para cada mapa de verdad, cada casilla explícita y sus vecinas (y todas las de los mapas de
     * prueba de arriba que se pueden cargar) se pregunta al motor y al diagnóstico: un teleport a
     * cada una. Si el diagnóstico no avisa, el motor tiene que decir «transitable», y al revés.
     */
    for (const nombre of ['jetyum', 'aldea', 'sample']) {
        const crudo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'world', nombre + '.map.json'), 'utf8'));
        const motor = MapLoader.buildMap(crudo, { itemTypes: items }).map;
        const editor = new EditorMap(crudo, items, npcTypes);
        const destinos = [];
        const vistos = new Set();
        crudo.tiles.forEach((t) => {
            for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
                const p = { x: t.x + dx, y: t.y + dy, z: t.z + dz };
                const k = p.x + ',' + p.y + ',' + p.z;
                if (!vistos.has(k)) {
                    vistos.add(k);
                    destinos.push(p);
                }
            }
        });
        // Un teleport por destino, cada uno en su casilla FUERA del mapa (y < 0): así no tapan
        // ningún destino, y el problema de cada uno dice a qué destino apuntaba.
        destinos.forEach((p, i) => {
            editor.tiles.set('-1,' + (-1 - i) + ',7', { x: -1, y: -1 - i, z: 7, ground: null, flags: [], houseId: 0,
                items: [{ id: TELEPORT, attributes: { teleportDestination: p } }] });
        });
        const rotos = new Set(D.diagnosticar(editor).filter((x) => x.tipo === 'teleport' && x.x === -1).map((x) => -1 - x.y));
        let discrepancias = 0;
        let ejemplo = '';
        destinos.forEach((p, i) => {
            if (!rotos.has(i) !== motor.isWalkable(p.x, p.y, p.z)) {
                discrepancias += 1;
                ejemplo = ejemplo || JSON.stringify(p) + (rotos.has(i) ? ' (el diagnóstico dice que no)' : ' (el motor dice que no)');
            }
        });
        check(nombre + ': ' + destinos.length + ' casillas, el diagnóstico y el motor dicen lo mismo', discrepancias === 0,
            discrepancias ? discrepancias + ' distintas, p. ej. ' + ejemplo : '');
    }
}

// ---------------------------------------------------------------------------------------------
section('4. El panel (con un DOM de mentira)');
{
    class Nodo {
        constructor(tag) {
            this.tagName = String(tag).toUpperCase();
            this.children = [];
            this.className = '';
            this.textContent = '';
            this.oyentes = {};
            this.parentNode = null;
            this.value = '';
            this.ownerDocument = doc;
        }
        get firstChild() { return this.children[0] || null; }
        appendChild(n) { n.parentNode = this; this.children.push(n); if (this.tagName === 'SELECT' && this.children.length === 1) { this.value = n.value; } return n; }
        removeChild(n) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null; return n; }
        addEventListener(tipo, f) { (this.oyentes[tipo] = this.oyentes[tipo] || []).push(f); }
        disparar(tipo) { (this.oyentes[tipo] || []).forEach((f) => f({ target: this })); }
        todos(pred, acc = []) { if (pred(this)) acc.push(this); this.children.forEach((c) => c.todos(pred, acc)); return acc; }
        texto() { return this.textContent + this.children.map((c) => c.texto()).join(''); }
    }
    const porId = new Map();
    const doc = {
        createElement: (tag) => new Nodo(tag),
        getElementById: (id) => porId.get(id) || null,
        head: null
    };
    doc.head = new Nodo('head');
    const appendHead = doc.head.appendChild.bind(doc.head);
    doc.head.appendChild = (n) => { if (n.id) porId.set(n.id, n); return appendHead(n); };

    const m = mapa({ tiles: [
        { x: 1, y: 1, z: 7, items: [{ id: TELEPORT }] },
        { x: 2, y: 1, z: 7, items: [MURO, MURO] },
        { x: 3, y: 1, z: 6, items: [MONEDA] }
    ], waypoints: { roto: 'x' } });
    const problemas = D.diagnosticar(m);
    const contenedor = new Nodo('div');
    contenedor.appendChild(new Nodo('p')); // lo que hubiera antes se va
    const visitas = [];
    let reanalisis = 0;
    const panel = D.construirPanel(contenedor, problemas, (x, y, z) => visitas.push([x, y, z]),
        { reanalizar: () => { reanalisis += 1; return []; } });

    const filas = () => contenedor.todos((n) => /\bdiag-fila\b/.test(n.className));
    const boton = (re) => contenedor.todos((n) => n.tagName === 'BUTTON' && re.test(n.textContent))[0];
    check('vacía el contenedor y pinta una fila por problema', contenedor.children.length === 1 && filas().length === problemas.length,
        filas().length + ' de ' + problemas.length);
    check('pone sus estilos una vez', porId.has('diagnostico-estilos'));
    check('el resumen cuenta', /^4 problemas: 2 errores y 2 avisos$/.test(contenedor.todos((n) => n.className === 'diag-resumen')[0].textContent),
        contenedor.todos((n) => n.className === 'diag-resumen')[0].textContent);
    check('los botones de gravedad llevan su cuenta', !!boton(/^Todos \(4\)$/) && !!boton(/^Errores \(2\)$/) && !!boton(/^Avisos \(2\)$/));
    const select = contenedor.todos((n) => n.tagName === 'SELECT')[0];
    check('el desplegable de tipos sólo ofrece los que hay, con su cuenta',
        select.children.map((o) => o.textContent).join(', ') ===
        'Todos los tipos (4), Teleport roto (1), Waypoint (1), Casilla sin suelo (1), Bloqueo sobre bloqueo (1)',
        select.children.map((o) => o.textContent).join(', '));

    const tp = filas().find((f) => /teleport/.test(f.texto()));
    tp.disparar('click');
    check('pinchar una fila llama a irA con su casilla', JSON.stringify(visitas) === '[[1,1,7]]', JSON.stringify(visitas));
    check('y la marca', /elegida/.test(filas().find((f) => /teleport/.test(f.texto())).className));
    const sinCasilla = filas().find((f) => /waypoint/.test(f.texto()));
    check('la fila sin casilla no se puede pinchar', sinCasilla.disabled === true && /mapa/.test(sinCasilla.texto()));

    boton(/^Avisos/).disparar('click');
    check('filtrar por gravedad', filas().length === 2 && filas().every((f) => /\baviso\b/.test(f.className)));
    check('y el desplegable cuenta con ese filtro', /^Todos los tipos \(2\)$/.test(select.children[0].textContent));
    select.value = 'bloqueo-apilado';
    select.disparar('change');
    check('filtrar por tipo', filas().length === 1 && /bloquean/.test(filas()[0].texto()));
    check('y los botones cuentan con ese filtro', !!boton(/^Errores \(0\)$/) && !!boton(/^Avisos \(1\)$/));
    select.value = 'teleport';
    select.disparar('change');
    check('un filtro sin nada lo dice', contenedor.todos((n) => n.className === 'diag-vacio')[0].textContent === 'Ningún problema con este filtro.');

    boton(/^Volver a analizar$/).disparar('click');
    check('volver a analizar llama a quien sabe y repinta', reanalisis === 1 &&
        contenedor.todos((n) => n.className === 'diag-vacio')[0].textContent === 'No se ha encontrado ningún problema.');

    const muchos = Array.from({ length: 1200 }, (_, i) => ({ tipo: 'sin-suelo', gravedad: 'aviso', mensaje: 'm', x: i, y: 0, z: 7 }));
    panel.actualizar(muchos);
    check('con muchos problemas se pintan 500 y se dice cuántos hay',
        filas().length === 500 && /^Se enseñan 500 de 1200/.test(contenedor.todos((n) => n.className === 'diag-recortado')[0].textContent));
    D.construirPanel(contenedor, [], () => {});
    check('pintar otra vez no duplica los estilos', doc.head.children.length === 1);
}

// ---------------------------------------------------------------------------------------------
section('5. El diccionario inglés');
{
    const plantillas = Object.values(D.MENSAJES)
        .concat(Object.values(D.TIPOS))
        .concat(Object.values(D.TIPOS).map((t) => t + ' ({n})'))
        .concat(Object.entries(D.TEXTOS_DEL_PANEL).filter(([k]) => k !== 'tipoConCuenta').map(([, v]) => v));
    const faltan = plantillas.filter((p) => !Object.prototype.hasOwnProperty.call(diccionario, p));
    check('todas las frases del módulo tienen entrada (' + plantillas.length + ')', faltan.length === 0, faltan.slice(0, 5).join(' | '));
    const sobran = Object.keys(diccionario).filter((k) => plantillas.indexOf(k) === -1);
    check('y no sobra ninguna', sobran.length === 0, sobran.slice(0, 5).join(' | '));
    check('sin huecos descolocados', I.problemasDeDiccionario(diccionario).length === 0,
        I.problemasDeDiccionario(diccionario).slice(0, 3).join(' | '));

    // Los mensajes compuestos de verdad, en inglés: si un hueco no casara, saldría en español.
    const m = mapa({ tiles: [
        { x: 1, y: 1, z: 7, items: [{ id: TELEPORT, attributes: { teleportDestination: { x: 5, y: 5, z: 7 } } }] },
        { x: 5, y: 5, z: 7, items: [MURO, ARBOL] },
        { x: 6, y: 5, z: 7, items: [{ id: MONEDA, attributes: { uniqueId: 3000 } }] },
        { x: 7, y: 5, z: 7, items: [{ id: MONEDA, attributes: { uniqueId: 3000 } }] },
        { x: 12, y: 10, z: 7, items: [RAMPA_NORTE] },
        { x: 9, y: 9, z: 7, houseId: 77, ground: PIEDRA }
    ], houses: [{ id: 1, name: 'La Casa', townId: 3 }],
    npcs: [{ x: 5, y: 5, z: 7, name: 'Guia' }],
    spawns: [{ x: 5, y: 5, z: 7, radius: 0, monsters: [{ name: 'Nadie' }] }],
    waypoints: { 'la plaza': [5, 5, 7] } });
    const p = D.diagnosticar(m, { monstruos: monstruos });
    I.setIdioma('en', { guardar: false });
    const sinTraducir = p.filter((x) => I.traducir(x.mensaje) === x.mensaje);
    const muestra = p.slice(0, 3).map((x) => I.traducir(x.mensaje)).join(' | ');
    check(p.length + ' mensajes compuestos, todos traducidos', p.length > 8 && sinTraducir.length === 0,
        sinTraducir.length ? sinTraducir.map((x) => x.mensaje).slice(0, 3).join(' | ') : muestra);
    check('y los del panel con números', I.traducir('Teleport roto (3)') === 'Broken teleport (3)' &&
        I.traducir('12 problemas: 3 errores y 9 avisos') === '12 problems: 3 errors and 9 warnings');
    I.setIdioma('es', { guardar: false });
}

// ---------------------------------------------------------------------------------------------
section('6. Rápido en un mapa grande y disperso');
{
    // 2048x2048 con 300.000 casillas explícitas: hierba, muros, monedas con uid, teleports.
    const tiles = [];
    // Un xorshift de 32 bits, sólo con desplazamientos: con un generador de multiplicar, el
    // producto pasa de 2^53, pierde los bits bajos y el generador se queda en un ciclo corto (la
    // primera versión de esta prueba no terminaba nunca buscando casillas sin repetir).
    let semilla = 0x9e3779b9;
    const azar = (n) => {
        semilla ^= semilla << 13;
        semilla ^= semilla >>> 17;
        semilla ^= semilla << 5;
        return (semilla >>> 0) % n;
    };
    const usadas = new Set();
    while (tiles.length < 300000) {
        const x = azar(2048);
        const y = azar(2048);
        const z = 6 + azar(3);
        const k = x + ',' + y + ',' + z;
        if (usadas.has(k)) {
            continue;
        }
        usadas.add(k);
        const r = azar(100);
        const t = { x, y, z, ground: PIEDRA, items: [] };
        if (r < 30) {
            t.items.push(MURO);
        } else if (r < 31) {
            t.items.push({ id: TELEPORT, attributes: { teleportDestination: { x: azar(2048), y: azar(2048), z: 7 } } });
        } else if (r < 33) {
            t.items.push({ id: MONEDA, attributes: { uniqueId: 1000 + azar(50000) } });
        } else if (r < 34) {
            t.items.push(RAMPA_NORTE);
        }
        tiles.push(t);
    }
    const grande = new EditorMap({ format: 'jetyum-map', version: 1, name: 'grande', width: 2048, height: 2048,
        floors: 16, defaultGround: { 7: HIERBA }, tiles: tiles }, items, npcTypes);
    const t0 = performance.now();
    const p = D.diagnosticar(grande);
    const ms = performance.now() - t0;
    const r = D.resumen(p);
    check('300.000 casillas en menos de 3 s', ms < 3000, ms.toFixed(0) + ' ms, ' + r.total + ' problemas ' + JSON.stringify(r.porTipo));
}

// ---------------------------------------------------------------------------------------------
section('7. Los mapas de verdad');
for (const nombre of ['jetyum', 'aldea', 'sample']) {
    const crudo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'world', nombre + '.map.json'), 'utf8'));
    const editor = new EditorMap(crudo, items, npcTypes);
    let p = null;
    let fallo = null;
    const t0 = performance.now();
    try {
        p = D.diagnosticar(editor, { monstruos: monstruos });
    } catch (error) {
        fallo = error;
    }
    const ms = performance.now() - t0;
    check(nombre + ': no revienta (' + editor.tiles.size + ' casillas, ' + ms.toFixed(1) + ' ms)', fallo === null,
        fallo ? fallo.stack : '');
    if (!p) {
        continue;
    }
    const r = D.resumen(p);
    console.log('        ' + r.total + ' problemas: ' + r.errores + ' errores y ' + r.avisos + ' avisos ' +
        JSON.stringify(r.porTipo));
    p.slice(0, 8).forEach((x) => console.log('        \x1b[90m' + x.gravedad + '  ' +
        (x.x === undefined ? 'mapa' : '(' + x.x + ',' + x.y + ',' + x.z + ')') + '  ' + x.mensaje + '\x1b[0m'));
    check(nombre + ': todos los problemas tienen tipo, gravedad y mensaje', p.every((x) =>
        D.TIPOS[x.tipo] && (x.gravedad === 'error' || x.gravedad === 'aviso') && x.mensaje && !/\{\w+\}/.test(x.mensaje)));
    // Lo que el motor no deja cargar no puede estar en un mapa que el motor carga.
    const motor = MapLoader.buildMap(crudo, { itemTypes: items, npcTypes: npcTypes,
        monsterTypes: Tools.loadMonsterTypes() });
    const deCarga = p.filter((x) => x.tipo === 'objeto-desconocido' || x.tipo === 'waypoint');
    check(nombre + ': el motor lo carga, y no hay objetos desconocidos ni waypoints rotos', motor.report.ok && deCarga.length === 0,
        motor.report.ok ? lista(deCarga) : motor.report.format());
    check(nombre + ': un número de problemas razonable (< 1 por cada 20 casillas)', r.total < editor.tiles.size / 20 + 5);
}

console.log('\n' + (fallos === 0 ? '\x1b[32m' + total + ' comprobaciones, todas bien\x1b[0m'
    : '\x1b[31m' + fallos + ' de ' + total + ' comprobaciones fallaron\x1b[0m'));
process.exit(fallos === 0 ? 0 : 1);
