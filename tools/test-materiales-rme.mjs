/**
 * PRUEBAS DEL IMPORTADOR DE MATERIALES DE RME: materials.xml (suelos, bordes, muros, alfombras,
 * mesas y doodads) a pinceles y objetos compuestos de Jetyum, y su carga en el editor como PAQUETE.
 *
 *     node tools/test-materiales-rme.mjs
 *
 *   1. el lector de XML tolerante, con lo raro que escriben los editores de mapas
 *   2. el lector de materiales sobre la muestra de NexaMap: cuántos de cada cosa
 *   3. la conversión: cuántos pinceles salen, un suelo con sus ids traducidos, un muro pieza a pieza,
 *      lo que no tiene equivalencia se salta, y todo pasa la validación de pinceles y de compuestos
 *   4. se escribe en archivos NUEVOS y `--fusionar` no pierde lo propio y se puede repetir
 *   5. el editor carga los paquetes (`pinceles-*.json`, `compuestos-*.json`) junto a los suyos, sin
 *      mezclarlos al guardar, y un mapa con un compuesto de un paquete se guarda
 *
 * Necesita la muestra de NexaMap (`../NexaMap-Editor/data/editor/materials.xml`) y la tabla de
 * equivalencias (`data/editor/equivalencias-otbm.json`, o el items.otb de `../forserver-downgrade`
 * para calcularla). Todo se escribe en la carpeta temporal del sistema.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { normalizarPinceles } from '../editor/js/pinceles.js';
import * as Compuestos from '../shared/js/compuestos.mjs';
import { convertirMateriales, importarMateriales } from './importar-materiales-rme.mjs';

const require = createRequire(import.meta.url);
const { leerXml, hijos } = require('../editor/lib/xmlsimple.js');
const { leerMateriales } = require('../editor/lib/materialesrme.js');
const Equivalencias = require('../editor/lib/equivalencias.js');
const Convertir = require('../editor/lib/convertirotbm.js');
const Xml = require('../engine/data/xml.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VECINOS = path.resolve(ROOT, '..');
const MATERIALES = path.join(VECINOS, 'NexaMap-Editor', 'data', 'editor', 'materials.xml');
const ITEMS_OTB = path.join(VECINOS, 'forserver-downgrade', 'data', 'items', 'items.otb');
const ITEMS_XML = path.join(VECINOS, 'forserver-downgrade', 'data', 'items', 'items.xml');

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-rme-'));

// ---------------------------------------------------------------------------
section('1. El lector de XML tolerante');
{
    const raiz = leerXml('<?xml version="1.0"?>\n<materials>\n<!-- un <comentario> -->\n' +
        '\t<border id="58"> -- mountain edge border (old) --\n' +
        '\t\t<borderitem edge="n" item="1100"/>\n\t\t<BorderItem Edge="cnw"   item=\'1104\' />\n\t</border>\n' +
        '\t<brush name="A &amp; B > C" type="doodad"><item id="1" chance="10"/></brush>\n</materials>');
    const borde = hijos(raiz, 'border')[0];
    check('las etiquetas y los atributos, en minúsculas, con comillas simples o dobles',
        raiz.nombre === 'materials' && hijos(borde, 'borderitem').length === 2 &&
        hijos(borde, 'borderitem')[1].atributos.edge === 'cnw' && hijos(borde, 'borderitem')[1].atributos.item === '1104');
    check('el texto suelto (los «-- comentarios --» de RME) y los comentarios de verdad no estorban',
        raiz.hijos.length === 2);
    check('las entidades y un «>» dentro de un atributo', hijos(raiz, 'brush')[0].atributos.name === 'A & B > C');
}

// ---------------------------------------------------------------------------
section('2. Los materiales de la muestra de NexaMap');
let materiales = null;
if (!fs.existsSync(MATERIALES)) {
    console.log('  SALTADA: no está ' + MATERIALES);
} else {
    const t = Date.now();
    materiales = leerMateriales(MATERIALES);
    check('sigue los <include> (bordes, suelos, muros, doodads y paletas)', materiales.archivos.length === 6 &&
        materiales.avisos.length === 0, materiales.archivos.map((a) => path.basename(a)).join(', ') + ' en ' +
        (Date.now() - t) + ' ms');
    check('cientos de suelos, bordes, muros y alfombras, y más de mil doodads', materiales.suelos.size > 200 &&
        materiales.bordes.size > 150 && materiales.muros.size > 90 && materiales.alfombras.size > 100 &&
        materiales.doodads.size > 1000, ['suelos', 'bordes', 'muros', 'alfombras', 'mesas', 'doodads']
        .map((k) => materiales[k].size + ' ' + k).join(', '));
    const hierba = materiales.suelos.get('grass');
    check('la hierba: sus objetos con su probabilidad, su z-order y sus bordes', hierba && hierba.items[0].id === 4515 &&
        hierba.items[0].chance === 2500 && hierba.z === 3200 &&
        hierba.bordes.some((b) => b.align === 'outer' && b.id === '2'));
    const muro = materiales.muros.get('stone wall');
    check('el muro de piedra: sus tipos de pieza y sus puertas', muro && muro.tipos.horizontal.items[0].id === 1295 &&
        muro.tipos.vertical.puertas.some((p) => p.tipo === 'normal' && p.id === 6248) &&
        muro.tipos.horizontal.puertas.some((p) => p.tipo === 'window'));
    const rocas = materiales.doodads.get('snowy rocks');
    check('un doodad de varias casillas', rocas && rocas.variantes.some((v) => v.celdas.length === 4));
    check('la paleta de cada pincel (tilesets.xml)', materiales.paletas.size > 1000 &&
        materiales.paletas.get('stone wall') === 'Walls');
}

// ---------------------------------------------------------------------------
section('3. La conversión');
let tabla = null;
let itemTypes = null;
if (materiales) {
    itemTypes = Xml.loadItems(path.join(ROOT, 'data', 'items', 'items.xml'));
    const guardada = Equivalencias.leerArchivo(path.join(ROOT, 'data', 'editor', 'equivalencias-otbm.json'));
    if (Object.keys(guardada.automatico).length > 0) {
        tabla = Equivalencias.tablaFinal(Equivalencias.tablaDeArchivo(guardada.automatico), guardada.manual);
    } else if (fs.existsSync(ITEMS_OTB)) {
        tabla = Convertir.cargarFuentes({ itemsOtb: ITEMS_OTB, itemsXml: ITEMS_XML, materiales: MATERIALES }).tabla;
    }
}
if (tabla) {
    const t = Date.now();
    const r = convertirMateriales(materiales, tabla, itemTypes);
    const c = r.informe.convertidos;
    check('un número de pinceles razonable', c.suelos > 150 && c.muros > 80 && c.bordes > 5 && c.compuestos > 50,
        c.suelos + ' suelos, ' + c.bordes + ' bordes, ' + c.muros + ' muros, ' + c.alfombras + ' alfombras, ' +
        c.mesas + ' mesas, ' + c.compuestos + ' compuestos en ' + (Date.now() - t) + ' ms');
    const hierba = r.pinceles.suelos.find((s) => s.id === 'rme-grass');
    check('el suelo «grass» con sus ids TRADUCIDOS, que existen en items.xml de Jetyum', hierba &&
        hierba.items.some((i) => i.id === 10101) && hierba.items.every((i) => itemTypes.has(i.id) &&
            itemTypes.get(i.id).attributes.isGround), hierba && hierba.items.map((i) => i.id + '×' + i.chance).join(' '));
    check('con su z (z-order / 100) y su borde exterior, también convertido', hierba && hierba.z === 32 &&
        r.pinceles.bordes.some((b) => b.id === hierba.borde));
    const muro = r.pinceles.muros.find((m) => m.id === 'rme-stone-wall');
    check('el muro de piedra, pieza a pieza y con su puerta y su ventana', muro && muro.piezas.horizontal === 10535 &&
        muro.piezas.vertical === 10534 && muro.piezas.esquina === 10537 && muro.piezas.poste === 10536 &&
        muro.puertas.horizontal === 12389 && muro.ventanas && muro.ventanas.vertical);
    const saltados = r.informe.saltados;
    check('lo que tiene algún objeto sin equivalencia se salta y se lista', saltados.doodads.length > 0 &&
        r.informe.sinEquivalencia.length > 0, Object.keys(saltados).map((k) => saltados[k].length + ' ' + k).join(', '));
    check('los pinceles pasan la validación del editor (normalizarPinceles)',
        normalizarPinceles(r.pinceles, itemTypes).problemas.length === 0);
    check('y los compuestos, la suya (normalizarCompuestos)',
        Compuestos.normalizarCompuestos(r.compuestos, itemTypes).problemas.length === 0 && r.informe.problemas.length === 0,
        r.informe.problemas.slice(0, 2).join('; '));
    const varias = r.compuestos.compuestos.find((x) => x.celdas.length > 1);
    check('un doodad de varias casillas es un compuesto con el ancla abajo a la derecha', varias &&
        varias.celdas.every((x) => x.dx <= 0 && x.dy <= 0) && varias.categoria.startsWith('RME: '),
        varias && varias.nombre + ' (' + varias.categoria + ')');
    check('los doodads que quedan iguales tras traducir no se repiten', r.informe.compuestosRepetidos > 0 &&
        new Set(r.compuestos.compuestos.map((x) => JSON.stringify(x.celdas))).size === r.compuestos.compuestos.length);
} else if (materiales) {
    console.log('  SALTADA: no hay tabla de equivalencias guardada ni items.otb para calcularla');
}

// ---------------------------------------------------------------------------
section('4. Archivos nuevos, y --fusionar');
if (tabla) {
    const carpeta = path.join(tmp, 'editor');
    fs.mkdirSync(carpeta);
    fs.copyFileSync(path.join(ROOT, 'data', 'editor', 'pinceles.json'), path.join(carpeta, 'pinceles.json'));
    fs.copyFileSync(path.join(ROOT, 'data', 'editor', 'compuestos.json'), path.join(carpeta, 'compuestos.json'));
    const textoAntes = fs.readFileSync(path.join(carpeta, 'pinceles.json'), 'utf8');
    const compuestosAntes = fs.readFileSync(path.join(carpeta, 'compuestos.json'), 'utf8');
    const antes = JSON.parse(textoAntes);

    const r = importarMateriales({ materiales: MATERIALES, pinceles: path.join(carpeta, 'pinceles-rme.json'),
        compuestos: path.join(carpeta, 'compuestos-rme.json') });
    check('por defecto escribe archivos NUEVOS y no toca los originales', fs.existsSync(path.join(carpeta, 'pinceles-rme.json')) &&
        fs.existsSync(path.join(carpeta, 'compuestos-rme.json')) &&
        fs.readFileSync(path.join(carpeta, 'pinceles.json'), 'utf8') === textoAntes &&
        fs.readFileSync(path.join(carpeta, 'compuestos.json'), 'utf8') === compuestosAntes,
        r.informe.convertidos.suelos + ' suelos en pinceles-rme.json');

    const fusion = { materiales: MATERIALES, fusionar: true, pinceles: path.join(carpeta, 'pinceles.json'),
        compuestos: path.join(carpeta, 'compuestos.json') };
    importarMateriales(fusion);
    const una = JSON.parse(fs.readFileSync(path.join(carpeta, 'pinceles.json'), 'utf8'));
    importarMateriales(fusion);
    const dos = JSON.parse(fs.readFileSync(path.join(carpeta, 'pinceles.json'), 'utf8'));
    check('--fusionar conserva lo propio y añade lo de RME', antes.suelos.every((s) => una.suelos.some((x) => x.id === s.id)) &&
        una.suelos.length === antes.suelos.length + r.informe.convertidos.suelos);
    check('y repetirlo no duplica nada (sustituye lo rme- de antes)', dos.suelos.length === una.suelos.length &&
        dos.muros.length === una.muros.length);
    const compuestosFusion = JSON.parse(fs.readFileSync(path.join(carpeta, 'compuestos.json'), 'utf8'));
    check('los compuestos fusionados siguen siendo válidos', Compuestos.normalizarCompuestos(compuestosFusion, itemTypes)
        .problemas.length === 0 && compuestosFusion.compuestos.some((x) => x.id === 'teleport'));
} else {
    console.log('  SALTADA: sin tabla');
}

// ---------------------------------------------------------------------------
section('5. El editor carga los paquetes');
if (tabla) {
    const Tools = require('../editor/server.js');
    const carpeta = path.join(tmp, 'paquetes');
    fs.mkdirSync(path.join(carpeta, 'world'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'data', 'editor', 'pinceles.json'), path.join(carpeta, 'pinceles.json'));
    fs.copyFileSync(path.join(ROOT, 'data', 'editor', 'compuestos.json'), path.join(carpeta, 'compuestos.json'));
    fs.copyFileSync(path.join(ROOT, 'data', 'world', 'sample.map.json'), path.join(carpeta, 'world', 'prueba.map.json'));
    importarMateriales({ materiales: MATERIALES, pinceles: path.join(carpeta, 'pinceles-rme.json'),
        compuestos: path.join(carpeta, 'compuestos-rme.json') });
    const compuestosAntes = fs.readFileSync(path.join(carpeta, 'compuestos.json'), 'utf8');

    const srv = Tools.createToolsServer({ port: 0, logger: { info() {}, warning() {}, error() {} },
        mapsDir: path.join(carpeta, 'world'), pincelesFile: path.join(carpeta, 'pinceles.json'),
        compuestosFile: path.join(carpeta, 'compuestos.json') });
    const port = await srv.ready;
    const api = async (method, ruta, cuerpo) => {
        const r = await fetch('http://127.0.0.1:' + port + ruta, { method,
            headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
        return { status: r.status, body: await r.json() };
    };
    try {
        const p = await api('GET', '/api/pinceles');
        check('GET /api/pinceles suma el paquete pinceles-rme.json a los propios', p.status === 200 &&
            p.body.paquetes.includes('pinceles-rme.json') && p.body.data.muros.some((m) => m.id === 'rme-stone-wall') &&
            p.body.data.muros.some((m) => m.id === 'muro-piedra') && p.body.problems.length === 0,
            p.body.data.suelos.length + ' suelos, ' + p.body.data.muros.length + ' muros');
        const c = await api('GET', '/api/compuestos');
        const delPaquete = c.body.paquetes.plantillas[0];
        check('GET /api/compuestos trae las plantillas del paquete APARTE de las de compuestos.json',
            c.status === 200 && c.body.paquetes.plantillas.length > 50 &&
            !c.body.data.compuestos.some((x) => x.id.startsWith('rme-')) && delPaquete.paquete === 'compuestos-rme.json');
        const guardado = await api('POST', '/api/compuestos', { data: c.body.data });
        check('guardar los compuestos no mete el paquete en compuestos.json', guardado.status === 200 &&
            !fs.readFileSync(path.join(carpeta, 'compuestos.json'), 'utf8').includes('"rme-') &&
            JSON.parse(fs.readFileSync(path.join(carpeta, 'compuestos.json'), 'utf8')).compuestos.length ===
            JSON.parse(compuestosAntes).compuestos.length);
        const mapa = await api('POST', '/api/map', { name: 'prueba', edits: [],
            composites: [{ uid: 1, compuesto: delPaquete.id, x: 5, y: 5, z: 7, valores: {} }] });
        check('un mapa con un compuesto de un paquete se guarda', mapa.status === 200, JSON.stringify(mapa.body).slice(0, 160));
    } finally {
        await srv.close();
    }
} else {
    console.log('  SALTADA: sin tabla');
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + (fallos === 0
    ? '\x1b[32mTodo OK\x1b[0m — ' + total + ' comprobaciones: los materiales de RME se convierten y el editor los carga.'
    : '\x1b[31m' + fallos + ' de ' + total + ' comprobaciones fallaron\x1b[0m'));
process.exitCode = fallos === 0 ? 0 : 1;
