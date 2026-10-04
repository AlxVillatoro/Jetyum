/**
 * PRUEBAS DEL ARTE HD (docs/ARTE-HD.md).
 *
 *     node tools/test-arte-hd.mjs        (o npm run test:arte)
 *
 *   1. Scale2x y el manifiesto (celdas dentro de su hoja, ids sin repetir, lo que sustituye existe)
 *   2. Las plantillas y el importador, sobre una COPIA de los assets (no toca los de verdad):
 *      tamaños de las hojas, la marca `hd`, items.xml y que importar dos veces no duplica nada
 *   3. El mapa de la aldea: carga, con sus monstruos y NPC, el templo protegido y la puerta que se abre
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Img, scale2x, plantillas, importar, MARCA_INICIO } from './arte-hd.mjs';
import { mapaAldea, HD } from './generar-aldea-hd.mjs';
import { FLAG_KEYS } from '../shared/js/assets.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Xml = require('../engine/data/xml.js');
const P = require('../engine/net/protocol.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

// ===========================================================================
section('1. Scale2x y el manifiesto');
// ===========================================================================
{
    // Una diagonal de 2x2: Scale2x la redondea (las esquinas toman el color del vecino).
    const img = new Img(2, 2);
    const rojo = [255, 0, 0, 255];
    [[0, 0], [1, 1]].forEach(([x, y]) => rojo.forEach((v, k) => { img.data[img.i(x, y) + k] = v; }));
    const g = scale2x(img);
    const opaco = (x, y) => g.data[g.i(x, y) + 3] > 0;
    check('Scale2x dobla el tamaño', g.w === 4 && g.h === 4);
    check('y rellena el hueco de la diagonal en vez de dejar escalones',
        opaco(0, 0) && opaco(3, 3) && opaco(2, 1) && opaco(1, 2) && !opaco(3, 0) && !opaco(0, 3), '');

    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/arte-hd/manifiesto.json'), 'utf8'));
    const things = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/jetyum/assets/things.json'), 'utf8'));
    let fuera = [];
    const ids = [];
    man.hojas.forEach((h) => h.piezas.forEach((p) => {
        (p.celdas || [[p.fila, 4]]).forEach(([f, c]) => {
            if ((c + 1) * h.celda[0] > h.tamano[0] || (f + 1) * h.celda[1] > h.tamano[1]) {
                fuera.push(h.archivo + ' ' + f + ',' + c);
            }
        });
        if (p.id) {
            ids.push(p.id);
        }
    }));
    check('todas las celdas caen dentro de su hoja', fuera.length === 0, fuera.join('; '));
    check('los ids nuevos no se repiten (y son del 20000 en adelante)',
        new Set(ids).size === ids.length && ids.every((n) => n >= 20000), ids.length + ' nuevos');
    const existe = (cat, id) => things[cat].some((t) => t.id === Number(id));
    const faltan = [];
    man.hojas.forEach((h) => h.piezas.filter((p) => p.sustituye).forEach((p) => {
        if (!existe(h.tipo === 'efecto' ? 'effects' : 'items', p.sustituye)) {
            faltan.push(p.sustituye);
        }
    }));
    man.personajes.forEach((p) => { if (!existe('outfits', p.aspecto)) { faltan.push('aspecto ' + p.aspecto); } });
    check('lo que se sustituye existe ya en el juego', faltan.length === 0, faltan.join(', '));
    check('la marca `hd` es una bandera conocida del formato', FLAG_KEYS.includes('hd'));
}

// ===========================================================================
section('2. Plantillas e importador (sobre una copia)');
// ===========================================================================
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arte-hd-'));
    const assets = path.join(tmp, 'assets');
    const dir = path.join(tmp, 'arte');
    fs.cpSync(path.join(ROOT, 'client/jetyum/assets'), assets, { recursive: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'data/arte-hd/manifiesto.json'), path.join(dir, 'manifiesto.json'));
    const items = path.join(tmp, 'items.xml');
    fs.copyFileSync(path.join(ROOT, 'data/items/items.xml'), items);

    const hechas = plantillas({ dir, assets });
    const tam = (f) => { const i = Img.leer(path.join(dir, f)); return i.w + 'x' + i.h; };
    check('las plantillas salen con el tamaño de su hoja',
        tam('suelos.png') === '512x256' && tam('muros.png') === '512x128' && tam('objetos.png') === '1024x256' &&
        tam('inventario.png') === '512x192' && tam('efectos.png') === '320x512' && tam('personajes/caballero.png') === '384x512',
        hechas.length + ' hojas');
    check('y no están vacías', !Img.leer(path.join(dir, 'suelos.png')).vacia() && !Img.leer(path.join(dir, 'personajes/rata.png')).vacia());

    const r = importar({ dir, assets, items });
    const indice = () => JSON.parse(fs.readFileSync(path.join(assets, 'sprites/index.json'), 'utf8')).count;
    const antes = indice();
    const t = JSON.parse(fs.readFileSync(path.join(assets, 'things.json'), 'utf8'));
    const cosa = (cat, id) => t[cat].find((x) => x.id === id);
    check('importa objetos, aspectos y efectos', r.items === 64 && r.outfits === 11 && r.effects === 8 && r.nuevos === 39,
        JSON.stringify(r));
    check('un suelo nuevo: 64 px (2x2 trozos), 4 variantes por casilla y la marca hd',
        cosa('items', HD.hierba).width === 2 && cosa('items', HD.hierba).patternX === 2 && cosa('items', HD.hierba).patternY === 2 &&
        cosa('items', HD.hierba).flags.hd === true);
    check('el agua: 4 fotogramas, animada y que no se pisa',
        cosa('items', HD.agua).frames === 4 && cosa('items', HD.agua).flags.notWalkable === true);
    check('un muro es un bloque de 64x128 (2x4 trozos); un árbol, 128x128 (4x4)',
        cosa('items', HD.muro).width === 2 && cosa('items', HD.muro).height === 4 && cosa('items', HD.arbol).width === 4);
    check('lo sustituido conserva su lógica: la moneda sigue apilable y la mochila contenedor',
        cosa('items', 3031).flags.stackable === true && cosa('items', 3031).flags.hd === true &&
        cosa('items', 2412).flags.container === true);
    check('un personaje: 4 direcciones x 3 fotogramas, sin máscara de colores',
        cosa('outfits', 131).patternX === 4 && cosa('outfits', 131).frames === 3 && cosa('outfits', 131).layers === 1 &&
        cosa('outfits', 131).flags.hd === true && !cosa('outfits', 131).flags.offset);
    const xml = fs.readFileSync(items, 'utf8');
    const definiciones = Xml.loadItems(items);
    const def = (id) => (definiciones.items || definiciones).get ? (definiciones.items || definiciones).get(id) : null;
    check('items.xml lleva el bloque ARTE-HD y se carga', xml.includes(MARCA_INICIO) && !!def(HD.muro), '');
    importar({ dir, assets, items });
    check('importar otra vez no añade sprites ni duplica el bloque',
        indice() === antes && fs.readFileSync(items, 'utf8').split(MARCA_INICIO).length === 2, antes + ' sprites');
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ===========================================================================
section('3. El mapa de la aldea');
// ===========================================================================
{
    const mapa = mapaAldea();
    check('el generador es determinista', JSON.stringify(mapaAldea()) === JSON.stringify(mapa));
    const { createEngine } = require('../engine/core/engine.js');
    const e = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { useDatabase: false, mapName: 'aldea', mapFile: null } });
    const w = e.world;
    const nombres = [...w.creatures.values()].map((c) => c.name);
    const cuenta = (n) => nombres.filter((x) => x === n).length;
    check('carga con sus monstruos y NPC', cuenta('Rat') === 3 && cuenta('Wolf') === 2 && cuenta('Goblin') === 2 &&
        cuenta('Skeleton') === 2 && ['Sanador', 'Tendero', 'Pescador'].every((n) => nombres.includes(n)), nombres.join(', '));
    const templo = w.map.getWaypoint('temple');
    const t = w.map.getTile(templo.x, templo.y, templo.z);
    check('se aparece en el templo, que es zona protegida', w.map.isWalkable(templo.x, templo.y, templo.z) &&
        !!(t.flags & 1), JSON.stringify(templo));
    check('el agua y los muros no se pisan', !w.map.isWalkable(40, 30, 7) && !w.map.isWalkable(8, 6, 7));

    const sesion = e.createSession(() => {});
    sesion.handle([P.CLIENT.LOGIN, 'cuenta', 'clave', 'Portera', 'Knight', 'male']);
    w.teleportCreature(sesion.player, { x: 12, y: 11, z: 7 });
    check('la puerta del templo está cerrada', !w.map.isWalkable(12, 12, 7));
    sesion.handle([P.CLIENT.USE_ITEM, 12, 12, 7]);
    check('y con clic derecho se abre (el script de puertas conoce la puerta HD)', w.map.isWalkable(12, 12, 7));
    sesion.close();
    e.shutdown();
}

console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — el arte HD se genera, se importa y el mapa de la aldea funciona.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
