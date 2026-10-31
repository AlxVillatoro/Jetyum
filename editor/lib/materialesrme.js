'use strict';

/**
 * LOS MATERIALES DE RME (`materials.xml` y lo que incluye), leídos a una forma plana.
 *
 * Remere's Map Editor, y sus derivados como NexaMap, definen sus pinceles en XML:
 *
 *   - `borders.xml`: los BORDES, doce piezas por borde (n, e, s, w, cnw… dse), con su id;
 *   - `grounds.xml`: los SUELOS, con sus objetos y su probabilidad, su `z-order` y los bordes que
 *     ponen (por id o escritos dentro);
 *   - `walls.xml`: los MUROS, con una lista de objetos por tipo de pieza (horizontal, vertical,
 *     corner, pole, y en algunos los extremos, las T y el cruce) y sus puertas y ventanas;
 *   - `doodads.xml`: los DOODADS (objetos sueltos con variantes y objetos de varias casillas), las
 *     ALFOMBRAS (`carpet`) y las MESAS (`table`); también trae muros;
 *   - `tilesets.xml`: las paletas, que aquí no hacen falta.
 *
 * Los números son ids de SERVIDOR (los del `items.otb` con el que se hicieron). Este módulo no los
 * traduce: devuelve lo que dice el XML. La traducción a ids de Jetyum es de `equivalencias.js`, y
 * la conversión a pinceles de Jetyum, de `tools/importar-materiales-rme.mjs`.
 *
 * Un mismo pincel puede aparecer dos veces (RME declara los suelos vacíos al principio de
 * `grounds.xml` para poder nombrarlos antes de definirlos): se juntan por nombre.
 */

const fs = require('fs');
const path = require('path');
const { leerXml, hijos } = require('./xmlsimple');

const PIEZAS_DE_BORDE = ['n', 'e', 's', 'w', 'cnw', 'cne', 'csw', 'cse', 'dnw', 'dne', 'dsw', 'dse'];

function numero(valor, defecto) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : defecto;
}

/** `{id, chance}` de los `<item>` hijos de un nodo. */
function itemsDe(nodo) {
    return hijos(nodo, 'item')
        .map((i) => ({ id: numero(i.atributos.id, 0), chance: numero(i.atributos.chance, 1) }))
        .filter((i) => i.id > 0);
}

function leerBorde(nodo, id) {
    const borde = { id: String(id), grupo: numero(nodo.atributos.group, 0), piezas: {} };
    hijos(nodo, 'borderitem').forEach((b) => {
        const lado = String(b.atributos.edge || '').toLowerCase();
        const item = numero(b.atributos.item, 0);
        if (PIEZAS_DE_BORDE.includes(lado) && item > 0) {
            borde.piezas[lado] = item;
        }
    });
    return borde;
}

/** Una variante de doodad de varias casillas: `<composite chance> <tile x y z> <item id/>…`. */
function leerCompuesto(nodo) {
    return {
        chance: numero(nodo.atributos.chance, 1),
        celdas: hijos(nodo, 'tile').map((t) => ({
            x: numero(t.atributos.x, 0),
            y: numero(t.atributos.y, 0),
            z: numero(t.atributos.z, 0),
            items: itemsDe(t).map((i) => i.id)
        })).filter((c) => c.items.length > 0)
    };
}

/**
 * Las variantes de un doodad: cada `<item>` suelto es una variante de una casilla, y cada
 * `<composite>` una de varias. Los `<alternate>` son grupos de variantes: se aplanan.
 */
function variantesDe(nodo) {
    const variantes = [];
    itemsDe(nodo).forEach((i) => variantes.push({ chance: i.chance, celdas: [{ x: 0, y: 0, z: 0, items: [i.id] }] }));
    hijos(nodo, 'composite').forEach((c) => {
        const compuesto = leerCompuesto(c);
        if (compuesto.celdas.length > 0) {
            variantes.push(compuesto);
        }
    });
    hijos(nodo, 'alternate').forEach((a) => variantesDe(a).forEach((v) => variantes.push(v)));
    return variantes;
}

/**
 * Lee `materials.xml` siguiendo sus `<include file>` (relativos al archivo que los incluye).
 *
 * @returns {{suelos: Map, bordes: Map, muros: Map, alfombras: Map, mesas: Map, doodads: Map,
 *            paletas: Map, archivos: string[], avisos: string[]}}
 */
function leerMateriales(archivo) {
    const materiales = {
        suelos: new Map(),
        bordes: new Map(),
        muros: new Map(),
        alfombras: new Map(),
        mesas: new Map(),
        doodads: new Map(),
        /** nombre de pincel -> nombre de su paleta (tilesets.xml). */
        paletas: new Map(),
        archivos: [],
        avisos: []
    };
    const vistos = new Set();
    let anonimos = 0;

    const leerArchivo = (ruta) => {
        const absoluta = path.resolve(ruta);
        if (vistos.has(absoluta)) {
            return;
        }
        vistos.add(absoluta);
        if (!fs.existsSync(absoluta)) {
            materiales.avisos.push('no existe ' + absoluta);
            return;
        }
        materiales.archivos.push(absoluta);
        const raiz = leerXml(fs.readFileSync(absoluta, 'utf8'));

        (raiz.hijos || []).forEach((nodo) => {
            if (nodo.nombre === 'include') {
                leerArchivo(path.join(path.dirname(absoluta), nodo.atributos.file || ''));
                return;
            }
            if (nodo.nombre === 'tileset') {
                // La paleta en que sale cada pincel: es la categoría que tendrá en Jetyum.
                const paleta = String(nodo.atributos.name || '').trim();
                (nodo.hijos || []).forEach((grupo) => hijos(grupo, 'brush').forEach((b) => {
                    const nombre = String(b.atributos.name || '').trim();
                    if (nombre && paleta && !materiales.paletas.has(nombre)) {
                        materiales.paletas.set(nombre, paleta);
                    }
                }));
                return;
            }
            if (nodo.nombre === 'border' && nodo.atributos.id !== undefined) {
                const borde = leerBorde(nodo, nodo.atributos.id);
                materiales.bordes.set(borde.id, borde);
                return;
            }
            if (nodo.nombre !== 'brush') {
                return;
            }

            const nombre = String(nodo.atributos.name || '').trim();
            const tipo = String(nodo.atributos.type || '').toLowerCase();
            if (!nombre) {
                return;
            }
            const lookid = numero(nodo.atributos.server_lookid !== undefined
                ? nodo.atributos.server_lookid : nodo.atributos.lookid, 0);

            if (tipo === 'ground') {
                const suelo = materiales.suelos.get(nombre) ||
                    { nombre: nombre, lookid: 0, z: 0, items: [], bordes: [], opcional: null };
                suelo.lookid = lookid || suelo.lookid;
                suelo.z = numero(nodo.atributos['z-order'], suelo.z);
                suelo.items = suelo.items.concat(itemsDe(nodo));
                hijos(nodo, 'border').forEach((b) => {
                    let id = b.atributos.id;
                    if (id === undefined && hijos(b, 'borderitem').length > 0) {
                        anonimos += 1;
                        id = 'en-' + nombre + '-' + anonimos;
                        materiales.bordes.set(id, leerBorde(b, id));
                    }
                    if (id !== undefined) {
                        suelo.bordes.push({
                            id: String(id),
                            align: String(b.atributos.align || 'outer'),
                            to: b.atributos.to === undefined ? null : String(b.atributos.to)
                        });
                    }
                });
                const opcional = hijos(nodo, 'optional')[0];
                if (opcional) {
                    suelo.opcional = String(opcional.atributos.id);
                }
                materiales.suelos.set(nombre, suelo);
                return;
            }

            if (tipo === 'wall') {
                const muro = { nombre: nombre, lookid: lookid, tipos: {}, variantes: variantesDe(nodo) };
                hijos(nodo, 'wall').forEach((w) => {
                    const t = String(w.atributos.type || '').toLowerCase();
                    const pieza = muro.tipos[t] || { items: [], puertas: [] };
                    pieza.items = pieza.items.concat(itemsDe(w));
                    hijos(w, 'door').forEach((d) => {
                        const id = numero(d.atributos.id, 0);
                        if (id > 0) {
                            pieza.puertas.push({
                                id: id,
                                tipo: String(d.atributos.type || 'normal').toLowerCase().replace(/\s+/g, '_'),
                                abierta: d.atributos.open === 'true'
                            });
                        }
                    });
                    muro.tipos[t] = pieza;
                });
                materiales.muros.set(nombre, muro);
                return;
            }

            if (tipo === 'carpet' || tipo === 'table') {
                const etiqueta = tipo;
                const pincel = { nombre: nombre, lookid: lookid, piezas: {} };
                hijos(nodo, etiqueta).forEach((c) => {
                    const lado = String(c.atributos.align || '').toLowerCase();
                    const ids = c.atributos.id !== undefined
                        ? [{ id: numero(c.atributos.id, 0), chance: 1 }] : itemsDe(c);
                    pincel.piezas[lado] = (pincel.piezas[lado] || []).concat(ids.filter((i) => i.id > 0));
                });
                (tipo === 'carpet' ? materiales.alfombras : materiales.mesas).set(nombre, pincel);
                return;
            }

            if (tipo === 'doodad') {
                materiales.doodads.set(nombre, {
                    nombre: nombre,
                    lookid: lookid,
                    variantes: variantesDe(nodo),
                    sobreBloqueo: nodo.atributos.on_blocking === 'true'
                });
            }
        });
    };

    leerArchivo(archivo);
    return materiales;
}

module.exports = { leerMateriales, PIEZAS_DE_BORDE };
