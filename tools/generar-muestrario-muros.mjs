/**
 * EL MUESTRARIO DE MUROS: un mapa para revisar (y corregir a mano) cómo se montan los muros del
 * OpenTibia Sprite Pack.
 *
 *     node tools/generar-muestrario-muros.mjs    # escribe data/world/muestrario-muros.map.json
 *
 * Se abre en el editor de mapas (`npm run editor`). Cada material de muro tiene su parcela, con un
 * cristal delante que dice cuál es (se ve al pincharlo: «Lo que hay puesto»):
 *
 *   - un ANILLO con puerta (al sur) y ventana (al este), una L, un CRUCE y dos DIAGONALES
 *     escalonadas (bajando a la derecha y bajando a la izquierda), montados con el pincel de muro
 *     tal y como los monta hoy el generador;
 *   - debajo, sus PIEZAS SUELTAS en fila (todas las del material, en orden), para tener a mano la
 *     buena al corregir.
 *
 * Y dos zonas más, al este: las PIEZAS DE MURO DIAGONAL del pack (12311-12582) y las de ROCA
 * (10919-10978), sueltas y en orden.
 *
 * LA IDEA: corregir a mano en el editor lo que esté mal (cambiar una pieza por la buena, o montar
 * al lado cómo debería ir una diagonal) y guardar. Luego se comparan las casillas corregidas con
 * las que salieron de aquí y de ahí se sacan las piezas buenas de cada material. Volver a generar
 * SOBRESCRIBE el muestrario: si ya lo has corregido, no lo regeneres.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as P from '../editor/js/pinceles.js';
import { EditorMap } from '../editor/js/editormap.js';
import { MUROS, pincelesOtsp } from './generar-mundo-otsp.mjs';
import { MUROS_DE_ROCA } from './generar-continente.mjs';

const require = createRequire(import.meta.url);
const Xml = require('../engine/data/xml.js');
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Z = 7;
const CARTEL = 11277;
const CELDA = { ancho: 22, alto: 22 };
const COLUMNAS = 6;

/** Los materiales: los del pack (con su rango de piezas hasta el siguiente) y los de roca. */
function materiales() {
    const pack = MUROS.map((m, i) => {
        const siguiente = MUROS.slice().sort((a, b) => a.v - b.v).find((n) => n.v > m.v);
        const hasta = Math.min(siguiente ? siguiente.v - 1 : m.v + 11, m.v + 19);
        return { id: 'otsp-' + m.id, nombre: m.nombre + ' (' + (10000 + m.v) + ')', piezas: rango(10000 + m.v, 10000 + hasta),
            puertas: m.puertas ? rango(10000 + m.puertas, 10000 + m.puertas + 5) : [], orden: i };
    });
    const roca = Object.entries(MUROS_DE_ROCA).map(([k, def]) => ({
        id: 'cont-roca-' + k, nombre: 'Roca ' + k + ' (' + def.piezas.vertical + ')',
        piezas: [...new Set(Object.values(def.piezas).concat(Object.values(def.barra || {})))], puertas: []
    }));
    return pack.concat(roca);
}

function rango(a, b) {
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export function muestrario(items) {
    const lista = materiales();
    const filas = Math.ceil(lista.length / COLUMNAS);
    const anchoMuestras = COLUMNAS * CELDA.ancho;
    const ancho = anchoMuestras + 2 + 34 * 2 + 4;
    const alto = Math.max(filas * CELDA.alto + 4, 150);

    // Los pinceles: los de «otsp-*» (los del generador) y los de roca del continente.
    const crudo = { format: 'jetyum-pinceles', version: 1, suelos: [], bordes: [], muros: pincelesOtsp().muros, alfombras: [], mesas: [] };
    crudo.muros = crudo.muros.concat(Object.entries(MUROS_DE_ROCA).map(([k, def]) => ({ id: 'cont-roca-' + k, nombre: 'Roca ' + k, ...def })));
    const { data, problemas } = P.normalizarPinceles(crudo, items);
    if (problemas.length) {
        throw new Error('pinceles no válidos: ' + problemas.slice(0, 5).join('; '));
    }
    const idx = P.indexar(data);
    const muros = new Map(data.muros.map((m) => [m.id, m]));
    const m = new EditorMap({ format: 'jetyum-map', version: 1, name: 'muestrario-muros', width: ancho, height: alto, floors: 16,
        defaultGround: { [Z]: 10101 }, tiles: [] }, items);
    const poner = (x, y, id, atributos) => {
        const t = m.editableTile(x, y, Z);
        t.items.push(atributos ? { id, attributes: atributos } : { id });
        m.markDirty(x, y, Z);
    };
    const waypoints = {};

    lista.forEach((mat, n) => {
        const x0 = 2 + (n % COLUMNAS) * CELDA.ancho;
        const y0 = 2 + Math.floor(n / COLUMNAS) * CELDA.alto;
        const muro = muros.get(mat.id);
        poner(x0, y0, CARTEL, { description: 'Muro: ' + mat.nombre + '.' });
        waypoints[mat.id] = [x0, y0 + 1, Z];
        const pintar = (casillas) => P.pintarMuro(m, idx, muro, casillas, Z);

        // El anillo, con puerta al sur y ventana al este (si el material las tiene).
        const anillo = [];
        for (let x = x0 + 1; x <= x0 + 8; x += 1) { anillo.push({ x, y: y0 + 2 }, { x, y: y0 + 7 }); }
        for (let y = y0 + 3; y <= y0 + 6; y += 1) { anillo.push({ x: x0 + 1, y }, { x: x0 + 8, y }); }
        pintar(anillo);
        if (muro.puertas) { P.ponerHueco(m, idx, x0 + 4, y0 + 7, Z, 'puerta'); }
        if (muro.ventanas) { P.ponerHueco(m, idx, x0 + 8, y0 + 4, Z, 'ventana'); }
        // La L.
        const ele = [];
        for (let y = y0 + 2; y <= y0 + 7; y += 1) { ele.push({ x: x0 + 11, y }); }
        for (let x = x0 + 12; x <= x0 + 17; x += 1) { ele.push({ x, y: y0 + 7 }); }
        pintar(ele);
        // El cruce.
        const cruce = [];
        for (let k = -2; k <= 2; k += 1) { cruce.push({ x: x0 + 4 + k, y: y0 + 11 }, { x: x0 + 4, y: y0 + 11 + k }); }
        pintar(cruce);
        // Las diagonales escalonadas: bajando a la derecha y bajando a la izquierda.
        const baja = [];
        const sube = [];
        for (let k = 0; k < 4; k += 1) {
            baja.push({ x: x0 + 9 + k, y: y0 + 9 + k }, { x: x0 + 10 + k, y: y0 + 9 + k });
            sube.push({ x: x0 + 20 - k, y: y0 + 9 + k }, { x: x0 + 19 - k, y: y0 + 9 + k });
        }
        pintar(baja);
        pintar(sube);
        // Las piezas sueltas, en orden, y las puertas.
        mat.piezas.concat(mat.puertas).forEach((id, i) => {
            if (items.has(id)) {
                poner(x0 + 1 + (i % 10) * 2, y0 + 15 + Math.floor(i / 10) * 2, id);
            }
        });
    });

    // Las piezas de muro diagonal y las de roca, sueltas.
    const xd = anchoMuestras + 3;
    poner(xd, 1, CARTEL, { description: 'Piezas de muro diagonal (12311-12582), en orden: 16 por fila.' });
    rango(12311, 12582).filter((id) => items.has(id)).forEach((id, i) => poner(xd + (i % 16) * 2, 3 + Math.floor(i / 16) * 2, id));
    const xr = xd + 34;
    poner(xr, 1, CARTEL, { description: 'Piezas de roca (10919-10978), en orden: 12 por fila.' });
    rango(10919, 10978).filter((id) => items.has(id)).forEach((id, i) => poner(xr + (i % 12) * 2, 3 + Math.floor(i / 12) * 2, id));
    waypoints.diagonales = [xd, 2, Z];
    waypoints.rocas = [xr, 2, Z];
    waypoints.temple = [1, 1, Z];

    return {
        format: 'jetyum-map', version: 1, name: 'muestrario-muros', width: ancho, height: alto, floors: 16,
        _comment: [
            'MUESTRARIO DE MUROS (tools/generar-muestrario-muros.mjs): cada material montado con el pincel de muro',
            '(anillo con puerta y ventana, L, cruce y dos diagonales) y sus piezas sueltas debajo. Para corregir a',
            'mano en el editor: cambia lo que esté mal y guarda. Regenerar lo SOBRESCRIBE.'
        ],
        defaultGround: { [Z]: 10101 },
        tiles: m.edits(),
        waypoints,
        towns: [{ id: 1, name: 'Muestrario', temple: [1, 1, Z] }]
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const items = Xml.loadItems(path.join(RAIZ, 'data', 'items', 'items.xml'));
    const mapa = muestrario(items);
    const archivo = path.join(RAIZ, 'data', 'world', 'muestrario-muros.map.json');
    fs.writeFileSync(archivo, JSON.stringify(mapa) + '\n');
    console.log('muestrario: ' + mapa.width + 'x' + mapa.height + ', ' + mapa.tiles.length + ' casillas, ' +
        Object.keys(mapa.waypoints).length + ' lugares -> ' + path.relative(RAIZ, archivo));
}
