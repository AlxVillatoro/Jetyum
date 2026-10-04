/**
 * PRUEBA DE LAS HERRAMIENTAS DE MAPA AL ESTILO RME: pinceles de suelo con auto-borde, muros
 * con las tablas de RME, puertas, alfombras y mesas, portapapeles, cubo, buscar y reemplazar,
 * casas, ciudades, waypoints, deshacer/rehacer, forma del pincel, y casas y ciudades en el
 * formato del motor.
 *
 *     node tools/test-mapa.mjs
 *
 * Todo lo que escribe va a carpetas temporales.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as P from '../editor/js/pinceles.js';
import * as E from '../editor/js/edicion.js';
import { Historial } from '../editor/js/historial.js';
import { EditorMap } from '../editor/js/editormap.js';
import { ponerForma, casillasDelPincel, cuantasCasillas } from '../editor/js/pincel.js';
import { generar } from './generar-pinceles.mjs';

const require = createRequire(import.meta.url);
const Xml = require('../engine/data/xml.js');
const MapLoader = require('../engine/world/loader.js');
const MapWriter = require('../engine/world/writer.js');
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
        (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}

function section(t) {
    console.log('\n' + t);
}

/** Un mapa vacío de 32x32 con hierba por defecto en la 7. */
function mapaVacio(items) {
    return new EditorMap({
        format: 'jetyum-map', version: 1, name: 'prueba', width: 32, height: 32, floors: 16,
        defaultGround: { 7: 102 }, tiles: []
    }, items);
}

const ids = (tile, filtro) => (tile ? tile.items.map((i) => i.id).filter(filtro || (() => true)) : []);

async function main() {
    console.log('Prueba de las herramientas de mapa (RME) (' + ROOT + ')');
    const items = Xml.loadItems(path.join(ROOT, 'data', 'items', 'items.xml'));
    const crudo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'editor', 'pinceles.json'), 'utf8'));
    const { data: pinceles, problemas } = P.normalizarPinceles(crudo, items);
    const idx = P.indexar(pinceles);
    const hierba = pinceles.suelos.find((s) => s.id === 'hierba');
    const tierra = pinceles.suelos.find((s) => s.id === 'tierra');
    const agua = pinceles.suelos.find((s) => s.id === 'agua');
    const muro = pinceles.muros[0];
    const bH = pinceles.bordes.find((b) => b.id === 'borde-hierba').piezas;

    section('1. data/editor/pinceles.json');
    check('es válido contra items.xml', problemas.length === 0, problemas.slice(0, 3).join('; '));
    check('trae suelos, bordes, muros con puertas, alfombras y mesas',
        pinceles.suelos.length >= 4 && pinceles.bordes.length >= 2 && muro.puertas && muro.ventanas &&
        pinceles.alfombras.length === 1 && pinceles.mesas.length === 1);

    section('2. La regla de los bordes (la tabla de 256 de RME)');
    check('un lado: su recta', P.piezasParaVecinos({ n: true }).join() === 'n');
    check('dos lados contiguos y solo esos: la diagonal', P.piezasParaVecinos({ n: true, w: true, nw: true }).join() === 'dnw');
    check('tres lados: tres rectas, sin diagonal', P.piezasParaVecinos({ n: true, w: true, s: true }).sort().join() === 'n,s,w');
    check('lados opuestos: dos rectas', P.piezasParaVecinos({ e: true, w: true }).sort().join() === 'e,w');
    check('diagonal sola: esquina exterior', P.piezasParaVecinos({ se: true }).join() === 'cse');
    check('una diagonal junto a su lado no da esquina', P.piezasParaVecinos({ ne: true, n: true }).join() === 'n');
    check('esquinas de lados contrarios conviven', P.piezasParaVecinos({ n: true, sw: true, se: true }).sort().join() === 'cse,csw,n');

    section('3. Pintar suelo con auto-borde');
    {
        const m = mapaVacio(items);
        P.pintarSuelo(m, idx, tierra, [{ x: 10, y: 10 }], 7);
        const centro = m.tileAt(10, 10, 7);
        check('la casilla de tierra lleva bordes de hierba por los cuatro lados... como esquinas exteriores no, como rectas',
            centro.ground === 103 && ['n', 'e', 's', 'w'].every((l) => centro.items.some((i) => i.id === bH[l])),
            JSON.stringify(ids(centro)));
        check('las casillas de hierba de alrededor no llevan borde (la hierba es la de arriba)', !m.tileAt(9, 10, 7));
        P.pintarSuelo(m, idx, tierra, [{ x: 11, y: 10 }], 7);
        const izq = m.tileAt(10, 10, 7);
        check('al pintar la vecina, el borde de ese lado desaparece', !izq.items.some((i) => i.id === bH.e) &&
            izq.items.some((i) => i.id === bH.w));
        P.pintarSuelo(m, idx, hierba, [{ x: 10, y: 10 }, { x: 11, y: 10 }], 7);
        check('al volver a hierba (el suelo de la planta), las casillas desaparecen enteras',
            !m.tileAt(10, 10, 7) && !m.tileAt(11, 10, 7), m.tiles.size + ' casillas');
        P.pintarSuelo(m, idx, agua, [{ x: 20, y: 20 }], 7);
        const charco = m.tileAt(20, 20, 7);
        check('el agua (z 1) recibe el borde de la hierba (z 30)', charco.items.some((i) => idx.piezasDeBorde.has(i.id)));
        m.paintItem(20, 20, 7, 2417);
        P.borderizarCasilla(m, idx, 20, 20, 7);
        const pila = m.tileAt(20, 20, 7).items;
        check('los bordes van abajo de la pila y no se comen lo que hay encima',
            idx.piezasDeBorde.has(pila[0].id) && pila[pila.length - 1].id === 2417, JSON.stringify(pila.map((i) => i.id)));
    }

    section('4. Muros: las tablas de RME');
    {
        const completa = ['poste', 'fin_sur', 'fin_este', 'esquina', 'fin_oeste', 'diagonal_ne', 'horizontal', 't_sur',
            'fin_norte', 'vertical', 'diagonal_so', 't_este', 'diagonal_se', 't_oeste', 't_norte', 'cruce'];
        check('los 16 tipos completos en el orden de la máscara N=1, W=2, E=4, S=8', P.TIPO_COMPLETO.join() === completa.join());
        const media = { 0: 'poste', 1: 'vertical', 2: 'horizontal', 3: 'esquina', 4: 'poste', 8: 'poste', 12: 'poste', 15: 'esquina' };
        check('la tabla media de Tibia', Object.keys(media).every((k) => P.TIPO_MEDIO[k] === media[k]));
        const m = mapaVacio(items);
        // Una habitación de 4x4: el muro de arriba, de izquierda a derecha, y luego los lados.
        const casillas = [];
        for (let x = 5; x <= 8; x += 1) { casillas.push({ x, y: 5 }, { x, y: 8 }); }
        for (let y = 6; y <= 7; y += 1) { casillas.push({ x: 5, y }, { x: 8, y }); }
        P.pintarMuro(m, idx, muro, casillas, 7);
        const pieza = (x, y) => m.tileAt(x, y, 7).items.find((i) => idx.muroDeObjeto.has(i.id)).id;
        check('arriba a la izquierda (une este y sur): poste', pieza(5, 5) === muro.piezas.poste);
        check('el lado de arriba: horizontal', pieza(6, 5) === muro.piezas.horizontal && pieza(7, 5) === muro.piezas.horizontal);
        check('arriba a la derecha (oeste y sur): horizontal', pieza(8, 5) === muro.piezas.horizontal);
        check('los lados: vertical', pieza(5, 6) === muro.piezas.vertical && pieza(8, 7) === muro.piezas.vertical);
        check('abajo a la izquierda (norte y este): vertical', pieza(5, 8) === muro.piezas.vertical);
        check('abajo a la derecha (norte y oeste): ESQUINA', pieza(8, 8) === muro.piezas.esquina);
        const r = P.ponerHueco(m, idx, 6, 8, 7, 'puerta');
        check('una puerta en el muro de abajo es horizontal', r.ok && pieza(6, 8) === muro.puertas.horizontal);
        const v = P.ponerHueco(m, idx, 8, 6, 7, 'ventana');
        check('una ventana en el lado es vertical', v.ok && pieza(8, 6) === muro.ventanas.vertical);
        check('una puerta sin muro se rechaza', !P.ponerHueco(m, idx, 20, 20, 7, 'puerta').ok);
        P.pintarMuro(m, idx, muro, [{ x: 9, y: 6 }], 7);
        check('la ventana sigue siéndolo al cambiar los vecinos', idx.muroDeObjeto.has(pieza(8, 6)) &&
            Object.values(muro.ventanas).includes(pieza(8, 6)));
        m.erase(7, 5, 7);
        P.rehacerAlrededor(m, idx, [{ x: 7, y: 5 }], 7);
        check('al borrar un tramo, el vecino se realinea', pieza(6, 5) === muro.piezas.horizontal && pieza(8, 5) === muro.piezas.poste,
            pieza(8, 5) + '');
    }

    section('5. Alfombras y mesas');
    {
        const m = mapaVacio(items);
        const alfombra = pinceles.alfombras[0];
        const cas = [];
        for (let y = 2; y <= 4; y += 1) { for (let x = 2; x <= 4; x += 1) { cas.push({ x, y }); } }
        P.pintarAlineable(m, idx, alfombra, cas, 7);
        const en = (x, y) => m.tileAt(x, y, 7).items.find((i) => idx.alfombraDeObjeto.has(i.id)).id;
        check('3x3: el centro es centro', en(3, 3) === alfombra.piezas.centro);
        check('los lados y las esquinas tienen su pieza', en(3, 2) === alfombra.piezas.n && en(2, 2) === alfombra.piezas.dnw &&
            en(4, 4) === alfombra.piezas.dse && en(4, 3) === alfombra.piezas.e);
        const mesa = pinceles.mesas[0];
        P.pintarAlineable(m, idx, mesa, [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }], 7);
        const me = (x, y) => m.tileAt(x, y, 7).items.find((i) => idx.mesaDeObjeto.has(i.id)).id;
        check('una mesa de tres: extremo, horizontal, extremo',
            me(10, 10) === mesa.piezas.fin_oeste && me(11, 10) === mesa.piezas.horizontal && me(12, 10) === mesa.piezas.fin_este);
        check('mesa sola', P.piezaDeMesa(false, false, false, false) === 'sola' && P.piezaDeMesa(true, false, true, false) === 'vertical');
    }

    section('6. Portapapeles, cubo, buscar, reemplazar y aleatorizar');
    {
        const m = mapaVacio(items);
        m.paintItem(3, 3, 7, 113);
        m.editableTile(4, 3, 7).ground = 104;
        m.markDirty(4, 3, 7);
        const copia = E.copiarArea(m, E.rectangulo({ x: 3, y: 3 }, { x: 5, y: 4 }, 7));
        check('copiar solo lleva lo explícito', copia.celdas.length === 2 && copia.ancho === 3 && copia.alto === 2);
        E.pegar(m, copia, 20, 20, 7);
        check('pegar reproduce las casillas en su sitio relativo', ids(m.tileAt(20, 20, 7)).join() === '113' && m.tileAt(21, 20, 7).ground === 104);
        check('pegar fuera del mapa se recorta', E.pegar(m, copia, 31, 31, 7) === 1);
        const borradas = E.borrarArea(m, E.rectangulo({ x: 20, y: 20 }, { x: 21, y: 20 }, 7));
        check('borrar la selección', borradas === 2 && !m.tileAt(20, 20, 7));
        const area = E.areaDeRelleno(m, 0, 0, 7);
        check('el cubo se extiende por el mismo suelo (con lo que tenga encima) y no cruza el distinto',
            area.casillas.length === 32 * 32 - 1, String(area.casillas.length));
        check('y tiene tope', E.areaDeRelleno(m, 0, 0, 7, 50).cortado === true);
        m.paintItem(8, 8, 7, 1948);
        m.tileAt(8, 8, 7).items[0].attributes = { actionId: 2001, text: 'Abre el sotano' };
        check('buscar por id, actionId y texto', E.buscar(m, { id: 1948 }).length === 1 &&
            E.buscar(m, { actionId: 2001 })[0].motivo === 'actionId' && E.buscar(m, { texto: 'sótano' }).length === 0 &&
            E.buscar(m, { texto: 'sotano' }).length === 1);
        check('reemplazar conserva los atributos', E.reemplazar(m, 1948, 2417) === 1 &&
            m.tileAt(8, 8, 7).items[0].id === 2417 && m.tileAt(8, 8, 7).items[0].attributes.actionId === 2001);
        check('reemplazar respeta la selección', E.reemplazar(m, 2417, 1948, E.rectangulo({ x: 0, y: 0 }, { x: 1, y: 1 }, 7)) === 0);
        check('quitar por id', E.quitarPorId(m, 2417) === 1 && !m.tileAt(8, 8, 7));
        const variado = P.indexar({ ...pinceles, suelos: [{ id: 'v', nombre: 'v', z: 1, items: [{ id: 102, chance: 1 }, { id: 104, chance: 1 }] }] });
        let toca = 0;
        const n = E.aleatorizar(m, variado, E.rectangulo({ x: 0, y: 10 }, { x: 9, y: 10 }, 7), () => { toca += 1; return toca % 2 ? 0.9 : 0.1; });
        check('aleatorizar vuelve a tirar las variantes', n > 0, n + ' cambios');
        const est = E.estadisticas(m);
        check('estadísticas', est.tamano === '32x32x16' && est.casillas === m.tiles.size);
    }

    section('7. Casas, ciudades y waypoints');
    {
        const m = mapaVacio(items);
        const ciudad = E.crearCiudad(m, 'Thais', [5, 5, 7]);
        const casa = E.crearCasa(m, 'Casa del herrero', ciudad.id);
        check('crear ciudad y casa', ciudad.id === 1 && casa.id === 1 && casa.townId === 1 && m.extrasSucios);
        const marcadas = E.pintarCasa(m, m.casillasDelCuadro(10, 10, 7, 3), 7, casa.id);
        check('el pincel de casa marca houseId y la bandera house', marcadas === 9 &&
            m.tileAt(11, 11, 7).houseId === 1 && m.tileAt(11, 11, 7).flags.includes('house'));
        check('la salida no puede estar dentro', !E.ponerSalida(m, casa.id, 11, 11, 7).ok && E.ponerSalida(m, casa.id, 11, 14, 7).ok);
        check('no se borra una ciudad con casas', !E.borrarCiudad(m, ciudad.id).ok);
        const pend = m.pendiente();
        check('el guardado manda casas, ciudades, waypoints y houseId',
            pend.towns.length === 1 && pend.houses[0].exit.join() === '11,14,7' &&
            pend.edits.some((e) => e.houseId === 1));
        E.ponerWaypoint(m, 'temple', 5, 5, 7);
        check('waypoints', m.waypoints.temple.join() === '5,5,7' && E.quitarWaypoint(m, 'temple').ok);
        m.houses.push({ id: 9, name: 'fantasma' });
        m.editableTile(1, 1, 7).houseId = 7;
        check('limpiar casas inválidas', E.limpiarCasasInvalidas(m) === 1 && !m.tileAt(1, 1, 7));
        const liberadas = E.borrarCasa(m, casa.id);
        check('borrar la casa libera sus casillas', liberadas === 9 && !m.tileAt(11, 11, 7));
    }

    section('8. Deshacer y rehacer');
    {
        const m = mapaVacio(items);
        const h = new Historial(m);
        P.pintarSuelo(m, idx, tierra, [{ x: 5, y: 5 }], 7);
        check('una acción se apunta', h.confirmar('tierra') && h.pasado.length === 1);
        check('una acción sin cambios no', !h.confirmar('nada'));
        E.crearCasa(m, 'Casa', 0);
        h.confirmar('casa');
        check('deshacer las listas', h.deshacer() === 'casa' && m.houses.length === 0);
        check('deshacer las casillas (y los bordes que puso)', h.deshacer() === 'tierra' && m.tiles.size === 0);
        check('rehacer', h.rehacer() === 'tierra' && m.tileAt(5, 5, 7).ground === 103 && m.tileAt(5, 5, 7).items.length === 4);
        check('lo deshecho queda como cambio sin guardar', m.dirty.has('5,5,7'));
        P.pintarSuelo(m, idx, tierra, [{ x: 9, y: 9 }], 7);
        h.confirmar('otra');
        check('una acción nueva borra el futuro', !h.puedeRehacer && h.pasado.length === 2);
        const grande = new EditorMap(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'ciudad-antigua.map.json'), 'utf8')), items);
        const hg = new Historial(grande);
        const t0 = performance.now();
        grande.paintItem(10, 10, 7, 113);
        hg.confirmar('x');
        const ms = performance.now() - t0;
        check('confirmar en el mapa de la ciudad (' + grande.tiles.size + ' casillas) es rápido', ms < 250, ms.toFixed(1) + ' ms');
    }

    section('9. Forma y tamaño del pincel');
    {
        ponerForma('circulo');
        const c = casillasDelPincel(0, 0, 5);
        check('un círculo de 5 no lleva las esquinas', c.length === cuantasCasillas(5) && c.length < 25 &&
            !c.some((k) => k.x === 0 && k.y === 0), c.length + ' casillas');
        ponerForma('cuadrado');
        check('el cuadrado sí, y el pincel llega a 19x19', casillasDelPincel(0, 0, 5).length === 25 && cuantasCasillas(19) === 361);
    }

    section('10. Casas y ciudades en el formato del motor');
    {
        const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'world', 'sample.map.json'), 'utf8'));
        raw.towns = [{ id: 1, name: 'Ciudad', temple: [40, 40, 7] }];
        raw.houses = [{ id: 3, name: 'Casa', townId: 1, rent: 500, exit: [44, 44, 7] }];
        raw.tiles.push({ x: 45, y: 45, z: 7, flags: ['house'], houseId: 3 });
        const cargado = MapLoader.buildMap(raw, { itemTypes: items });
        check('el motor carga ciudades, casas y houseId', cargado.report.ok && cargado.map.towns.length === 1 &&
            cargado.map.houses[0].rent === 500 && cargado.map.getTile(45, 45, 7).houseId === 3,
            cargado.report.format());
        const texto = MapWriter.writeMap(cargado.map, { itemTypes: items });
        const otra = JSON.parse(texto);
        check('el escritor los conserva (antes perdía houseId)', otra.towns[0].temple.join() === '40,40,7' &&
            otra.houses[0].exit.join() === '44,44,7' && otra.tiles.some((t) => t.houseId === 3));
        check('la ida y vuelta los cuenta', MapWriter.verifyRoundTrip(cargado.map, MapLoader.buildMap, { itemTypes: items }).ok);
        const malo = JSON.parse(JSON.stringify(raw));
        malo.houses[0].townId = 99;
        malo.towns.push({ id: 1, name: 'repetida', temple: [1, 1, 7] });
        const r = MapLoader.buildMap(malo, { itemTypes: items });
        check('ciudad repetida y casa de una ciudad que no existe: errores', r.report.errors.length === 2, r.report.format());
    }

    section('11. El servidor: pinceles y guardar casas, ciudades y waypoints');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-mapa-'));
    {
        fs.mkdirSync(path.join(tmp, 'world'));
        fs.copyFileSync(path.join(ROOT, 'data', 'world', 'sample.map.json'), path.join(tmp, 'world', 'prueba.map.json'));
        const srv = Tools.createToolsServer({
            port: 0, logger: { info() {}, warning() {}, error() {} }, mapsDir: path.join(tmp, 'world'),
            pincelesFile: path.join(ROOT, 'data', 'editor', 'pinceles.json')
        });
        const port = await srv.ready;
        const api = async (method, ruta, cuerpo) => {
            const r = await fetch('http://127.0.0.1:' + port + ruta, { method,
                headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
            return { status: r.status, body: await r.json() };
        };
        try {
            const p = await api('GET', '/api/pinceles');
            check('GET /api/pinceles', p.status === 200 && p.body.data.muros.some((m) => m.id === 'muro-piedra') &&
                p.body.data.muros.some((m) => m.id.startsWith('otsp-')) && p.body.problems.length === 0,
                p.body.data.muros.length + ' muros (el de demostración y los del OpenTibia Sprite Pack)');
            const raw = (await api('GET', '/api/map?name=prueba')).body.raw;
            const m = new EditorMap(raw, items);
            const ciudad = E.crearCiudad(m, 'Ciudad', [40, 40, 7]);
            const casa = E.crearCasa(m, 'Casa', ciudad.id);
            E.pintarCasa(m, [{ x: 50, y: 50 }], 7, casa.id);
            E.ponerSalida(m, casa.id, 50, 52, 7);
            E.ponerWaypoint(m, 'puerto', 20, 21, 7);
            const pend = m.pendiente();
            const g = await api('POST', '/api/map', { name: 'prueba', edits: pend.edits, waypoints: pend.waypoints,
                towns: pend.towns, houses: pend.houses });
            check('POST /api/map guarda', g.status === 200, JSON.stringify(g.body).slice(0, 200));
            const escrito = JSON.parse(fs.readFileSync(path.join(tmp, 'world', 'prueba.map.json'), 'utf8'));
            check('el archivo lleva ciudades, casas, la casilla de casa y el waypoint nuevo',
                escrito.towns.length === 1 && escrito.houses[0].exit.join() === '50,52,7' &&
                escrito.tiles.some((t) => t.houseId === casa.id) && escrito.waypoints.puerto.join() === '20,21,7');
            const malo = await api('POST', '/api/map', { name: 'prueba', edits: [], towns: [{ id: 1, name: 'x', temple: [999, 1, 7] }] });
            check('un templo fuera del mapa no se guarda', malo.status === 422);
        } finally {
            await srv.close();
        }
    }

    section('12. El generador de pinceles (sobre copias)');
    {
        fs.mkdirSync(path.join(tmp, 'items'));
        fs.copyFileSync(path.join(ROOT, 'data', 'items', 'items.xml'), path.join(tmp, 'items', 'items.xml'));
        fs.cpSync(path.join(ROOT, 'client', 'jetyum', 'assets'), path.join(tmp, 'assets'), { recursive: true });
        const opciones = { assetsDir: path.join(tmp, 'assets'), itemsFile: path.join(tmp, 'items', 'items.xml'),
            pincelesFile: path.join(tmp, 'pinceles.json') };
        const a = generar(opciones);
        const b = generar(opciones);
        check('genera los objetos y es idempotente (no añade sprites al repetir)', a.objetos === 52 && a.sprites === b.sprites,
            a.sprites + ' / ' + b.sprites);
        const itemsCopia = Xml.loadItems(opciones.itemsFile);
        check('y lo que escribe es coherente', P.normalizarPinceles(JSON.parse(fs.readFileSync(opciones.pincelesFile, 'utf8')),
            itemsCopia).problemas.length === 0);
    }
    fs.rmSync(tmp, { recursive: true, force: true });

    console.log('\n' + (fallos === 0
        ? '\x1b[32mTodo OK\x1b[0m — ' + total + ' comprobaciones: pinceles, edición, casas e historial como en RME.'
        : '\x1b[31m' + fallos + ' de ' + total + ' comprobaciones fallaron\x1b[0m'));
    process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
