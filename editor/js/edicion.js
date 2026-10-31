/**
 * LAS OPERACIONES DE EDICIÓN DE RME, como funciones puras sobre un EditorMap.
 *
 * Son las del menú Edit, Search y Map de Remere's Map Editor: copiar, cortar, pegar y borrar una
 * selección; rellenar; buscar y reemplazar objetos; aleatorizar suelos; estadísticas; y las
 * listas de casas, ciudades y waypoints. No tocan el lienzo ni el DOM: la interfaz está en
 * `herramientas.js` y las pruebas en `tools/test-mapa.mjs`.
 *
 * Todo lo que cambia el mapa lo hace con `editableTile`/`markDirty`, así que el historial
 * (`historial.js`) lo puede deshacer sin saber qué operación fue.
 */

import { elegirObjeto } from './pinceles.js';

/** Un rectángulo normalizado: `{x0, y0, x1, y1, z}` con x0 <= x1 e y0 <= y1. */
export function rectangulo(a, b, z) {
    return {
        x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y),
        x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y), z
    };
}

/**
 * ¿Está la casilla dentro? Vale para un RECTÁNGULO `{x0, y0, x1, y1, z}` y para una SELECCIÓN
 * (el conjunto de casillas de más abajo, que se reconoce por llevar `claves`). Así buscar,
 * reemplazar y quitar por id funcionan igual con la selección de un rectángulo que con la de
 * varios sumados y restados, o con la de varias plantas.
 */
export function dentroDe(rect, x, y, z) {
    if (rect && rect.claves) {
        return enSeleccion(rect, x, y, z);
    }
    return !!rect && z === rect.z && x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

// ---------------------------------------------------------------------------
// LA SELECCIÓN COMO CONJUNTO DE CASILLAS
// ---------------------------------------------------------------------------
//
// En RME la selección no es un rectángulo: es un CONJUNTO de casillas. Se empieza con un
// rectángulo, Mayús+arrastrar le SUMA otro, Ctrl+arrastrar le RESTA uno, y el resultado puede
// tener cualquier forma —una L, un marco, dos islas— y abarcar varias plantas a la vez (el «modo
// de selección»: la planta actual, las de debajo o las visibles). Todo lo que se hace con la
// selección —copiar, cortar, borrar, mover, borderizar, reemplazar...— trabaja sobre ese conjunto.
//
// Se guarda como `{claves: Set<'x,y,z'>}`: las mismas claves que usa `EditorMap.tiles`, así que
// preguntar si una casilla está dentro es un `has` y no un recorrido. Un objeto y no un `Set` a
// secas para que `dentroDe` la distinga de un rectángulo y para poder añadirle datos sin
// cambiar a quien la recibe.

/** La planta del suelo: por encima de ella (z < 7) se está al aire libre, por debajo bajo tierra. */
export const PLANTA_DEL_SUELO = 7;

/** Los modos de selección de RME (Selection mode): planta actual, inferiores y visibles. */
export const MODOS_DE_SELECCION = ['actual', 'inferiores', 'visibles'];

function claveDe(x, y, z) {
    return x + ',' + y + ',' + z;
}

function deClave(clave) {
    const [x, y, z] = clave.split(',').map(Number);
    return { x, y, z };
}

/**
 * Las plantas que coge un rectángulo trazado en la planta `z`, según el modo:
 *
 *   - `actual`: sólo esa.
 *   - `inferiores`: esa y las de debajo (z mayor). Al aire libre baja HASTA EL SUELO (la 7) y no
 *     más, que es lo que se quiere al copiar un edificio con sus pisos: las cuevas de debajo no
 *     son parte de él. Bajo tierra baja hasta la última planta del mapa.
 *   - `visibles`: las que el cliente de Tibia enseña desde ahí, que es la regla de RME: al aire
 *     libre, de la actual al suelo (igual que `inferiores`); bajo tierra, la actual y dos más
 *     hacia abajo, que es lo que se ve por los agujeros.
 *
 * @param {string} modo uno de `MODOS_DE_SELECCION`
 * @param {number} z la planta donde se traza
 * @param {number} [plantas] cuántas plantas tiene el mapa (16 en Tibia)
 * @returns {number[]} de la de arriba a la de abajo
 */
export function plantasDeSeleccion(modo, z, plantas) {
    const ultima = (Number(plantas) || 16) - 1;
    let hasta = z;
    if (modo === 'inferiores') {
        hasta = z <= PLANTA_DEL_SUELO ? PLANTA_DEL_SUELO : ultima;
    } else if (modo === 'visibles') {
        hasta = z <= PLANTA_DEL_SUELO ? PLANTA_DEL_SUELO : Math.min(ultima, z + 2);
    }
    const lista = [];
    for (let p = z; p <= Math.max(z, hasta); p += 1) {
        lista.push(p);
    }
    return lista;
}

export function seleccionVacia() {
    return { claves: new Set() };
}

export function clonarSeleccion(sel) {
    return sel ? { claves: new Set(sel.claves) } : null;
}

export function enSeleccion(sel, x, y, z) {
    return !!sel && sel.claves.has(claveDe(x, y, z));
}

export function tamanoDeSeleccion(sel) {
    return sel ? sel.claves.size : 0;
}

/**
 * Suma (o resta, con `quitar`) un rectángulo a la selección, en las plantas dadas. Cambia la
 * selección que recibe y la devuelve, para poder encadenar.
 *
 * @param {{claves:Set}} sel
 * @param {{x0,y0,x1,y1}} rect normalizado (ver `rectangulo`)
 * @param {number[]} plantas las de `plantasDeSeleccion`
 * @param {boolean} [quitar]
 */
export function marcarRectangulo(sel, rect, plantas, quitar) {
    plantas.forEach((z) => {
        for (let y = rect.y0; y <= rect.y1; y += 1) {
            for (let x = rect.x0; x <= rect.x1; x += 1) {
                if (quitar) {
                    sel.claves.delete(claveDe(x, y, z));
                } else {
                    sel.claves.add(claveDe(x, y, z));
                }
            }
        }
    });
    return sel;
}

/** Una selección nueva con un rectángulo en esas plantas. */
export function seleccionDeRectangulo(rect, plantas) {
    return marcarRectangulo(seleccionVacia(), rect, plantas || [rect.z]);
}

/** Las casillas de la selección, ordenadas por planta, fila y columna. */
export function casillasDeSeleccion(sel) {
    if (!sel) {
        return [];
    }
    return Array.from(sel.claves, deClave).sort((a, b) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x));
}

/**
 * El recuadro que la envuelve, con sus plantas: `{x0, y0, x1, y1, z0, z1, plantas, total}`, o
 * `null` si está vacía. `plantas` es la lista de plantas que tienen alguna casilla.
 */
export function limitesDeSeleccion(sel) {
    if (!sel || sel.claves.size === 0) {
        return null;
    }
    const l = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity, total: sel.claves.size };
    const plantas = new Set();
    sel.claves.forEach((clave) => {
        const c = deClave(clave);
        l.x0 = Math.min(l.x0, c.x); l.x1 = Math.max(l.x1, c.x);
        l.y0 = Math.min(l.y0, c.y); l.y1 = Math.max(l.y1, c.y);
        l.z0 = Math.min(l.z0, c.z); l.z1 = Math.max(l.z1, c.z);
        plantas.add(c.z);
    });
    l.plantas = Array.from(plantas).sort((a, b) => a - b);
    return l;
}

/**
 * COPIAR LA SELECCIÓN: como `copiarArea`, pero de un conjunto de casillas y de varias plantas.
 *
 * Cada celda lleva `dx`/`dy` desde la esquina de arriba a la izquierda del recuadro y `dz`
 * desde la planta `zBase` —la que se está viendo al copiar—, así que al pegar en otra planta el
 * edificio llega con sus pisos en el mismo orden. Además de las celdas con contenido lleva la
 * `mascara`: TODAS las casillas seleccionadas, también las vacías, que es la forma que se
 * enseña en el fantasma y la que queda seleccionada al pegar.
 *
 * @returns {{ancho, alto, celdas: Array, mascara: Array<{dx,dy,dz}>, plantas: number}}
 */
export function copiarSeleccion(mapa, sel, zBase) {
    const l = limitesDeSeleccion(sel);
    if (!l) {
        return { ancho: 0, alto: 0, celdas: [], mascara: [], plantas: 0 };
    }
    const celdas = [];
    const mascara = [];
    casillasDeSeleccion(sel).forEach((c) => {
        const d = { dx: c.x - l.x0, dy: c.y - l.y0, dz: c.z - zBase };
        mascara.push(d);
        const tile = mapa.tileAt(c.x, c.y, c.z);
        if (tile && !mapa.isVoid(tile)) {
            celdas.push({ ...d, ...copiaDeCasilla(tile) });
        }
    });
    return { ancho: l.x1 - l.x0 + 1, alto: l.y1 - l.y0 + 1, celdas, mascara, plantas: l.plantas.length };
}

/** Borra todo lo explícito de las casillas seleccionadas. @returns {number} cuántas tenían algo */
export function borrarCasillas(mapa, sel) {
    let n = 0;
    casillasDeSeleccion(sel).forEach((c) => {
        if (mapa.tileAt(c.x, c.y, c.z)) {
            mapa.erase(c.x, c.y, c.z);
            n += 1;
        }
    });
    return n;
}

/**
 * La selección que queda tras pegar en (x, y, z): la forma de lo copiado (su `mascara`), o el
 * rectángulo entero si el portapapeles es de los de `copiarArea`. Sin lo que cae fuera del mapa.
 */
export function seleccionDePegado(mapa, portapapeles, x, y, z) {
    const sel = seleccionVacia();
    const forma = portapapeles.mascara || [];
    if (forma.length === 0) {
        for (let dy = 0; dy < portapapeles.alto; dy += 1) {
            for (let dx = 0; dx < portapapeles.ancho; dx += 1) {
                forma.push({ dx, dy, dz: 0 });
            }
        }
    }
    forma.forEach((d) => {
        const cx = x + d.dx;
        const cy = y + d.dy;
        const cz = z + (d.dz || 0);
        if (mapa.inBounds(cx, cy, cz)) {
            sel.claves.add(claveDe(cx, cy, cz));
        }
    });
    return sel;
}

/**
 * MOVER LA SELECCIÓN (arrastrarla con el ratón en RME): lleva su contenido (dx, dy, dz) casillas
 * más allá, de una vez.
 *
 * QUÉ VIAJA, y por qué:
 *   - LA CASILLA ENTERA: suelo, pila de objetos (con sus atributos), banderas (PZ, noPvp...) y
 *     `houseId`. Es lo que hace RME —mueve el tile, no sólo lo de encima— y lo que espera quien
 *     arrastra una habitación: que llegue igual, con su suelo y sus casillas de casa.
 *   - Cada casilla movida SUSTITUYE a la de destino, igual que al pegar. Las casillas
 *     seleccionadas SIN NADA PROPIO no viajan, así que lo que hubiera debajo de ellas en el
 *     destino se queda (es lo mismo que pasa al copiar y pegar, y así una selección con huecos
 *     no hace agujeros al soltarla).
 *   - LOS COMPUESTOS que caen ENTEROS dentro de la selección se recolocan con ella: sus piezas
 *     ya han viajado con las casillas, y si su ancla se quedara atrás, quitarlo o reconfigurarlo
 *     iría a buscar las piezas al sitio viejo. Uno partido por el borde de la selección no se
 *     toca (sus piezas se separan, como al cortar media mesa en RME).
 *   - LOS NPC cuya casilla está seleccionada y LOS RESPAWNS cuyo centro está seleccionado se
 *     mueven también, con sus monstruos —RME mueve criaturas y spawns con la selección—. Pasan
 *     las mismas reglas que al arrastrarlos de uno en uno (`_problemaDeMoverArea`,
 *     `_problemaDeMoverNpc` de `EditorMap`): el que no cabe se queda donde estaba y se avisa.
 *   - Lo que NO viaja: los waypoints, los templos y las salidas de casa. Son puntos con nombre
 *     de las listas del mapa que se colocan a propósito con su paleta, y moverlos sin querer al
 *     arrastrar una calle sería peor que dejarlos.
 *
 * SI ALGUNA CASILLA CON CONTENIDO SE SALDRÍA DEL MAPA, NO SE MUEVE NADA: recortar dejaría media
 * habitación en un sitio y la otra media perdida, que es lo que nadie quiere al mover.
 *
 * Todo pasa por `editableTile`/`erase`/`markDirty` y las listas del mapa, así que el historial lo
 * recoge en UNA entrada si se confirma una vez al final.
 *
 * @returns {{ok:boolean, problema?:string, n?:number, seleccion?:Object, avisos?:string[],
 *            marcadores?:number, origen?:Array, destino?:Array}}
 */
export function moverSeleccion(mapa, sel, dx, dy, dz) {
    const mz = dz || 0;
    const casillas = casillasDeSeleccion(sel);
    if (casillas.length === 0) {
        return { ok: false, problema: 'no hay selección que mover' };
    }
    if (!dx && !dy && !mz) {
        return { ok: true, n: 0, seleccion: clonarSeleccion(sel), avisos: [], marcadores: 0, origen: [], destino: [] };
    }
    const llevar = [];
    casillas.forEach((c) => {
        const tile = mapa.tileAt(c.x, c.y, c.z);
        if (tile && !mapa.isVoid(tile)) {
            llevar.push({ x: c.x + dx, y: c.y + dy, z: c.z + mz, copia: copiaDeCasilla(tile) });
        }
    });
    const fuera = llevar.find((c) => !mapa.inBounds(c.x, c.y, c.z));
    if (fuera) {
        return { ok: false, problema: 'no se puede mover ahí: la casilla (' + fuera.x + ',' + fuera.y + ',' + fuera.z +
            ') quedaría fuera del mapa' };
    }

    // Lo que viaja con las casillas se decide ANTES de tocarlas: después ya no se sabría qué
    // estaba dentro.
    const compuestos = (mapa.compuestos || []).filter((c) => {
        const piezas = mapa.casillasDeCompuesto ? mapa.casillasDeCompuesto(c) : [];
        return piezas.length > 0 && piezas.every((k) => enSeleccion(sel, k.x, k.y, k.z));
    });
    const npcs = (mapa.npcs || []).filter((n) => enSeleccion(sel, n.x, n.y, n.z));
    const respawns = (mapa.spawns || []).filter((s) => enSeleccion(sel, s.x, s.y, s.z));

    casillas.forEach((c) => {
        if (mapa.tileAt(c.x, c.y, c.z)) {
            mapa.erase(c.x, c.y, c.z);
        }
    });
    llevar.forEach((c) => {
        const tile = mapa.editableTile(c.x, c.y, c.z);
        tile.ground = c.copia.ground;
        tile.items = c.copia.items;
        tile.flags = c.copia.flags;
        tile.houseId = c.copia.houseId || 0;
        mapa.markDirty(c.x, c.y, c.z);
    });

    const avisos = [];
    let marcadores = 0;
    compuestos.forEach((c) => {
        c.x += dx;
        c.y += dy;
        c.z += mz;
        mapa.compuestosSucios = true;
        marcadores += 1;
    });
    respawns.forEach((s) => {
        const mover = (v, d) => (v === null || v === undefined ? v : v + d);
        const candidata = {
            x: s.x + dx, y: s.y + dy, z: s.z + mz,
            monsters: s.monsters.map((m) => ({ ...m, x: mover(m.x, dx), y: mover(m.y, dy) }))
        };
        const problema = mapa._problemaDeMoverArea ? mapa._problemaDeMoverArea(s, candidata) : null;
        if (problema) {
            avisos.push('respawn de (' + s.x + ',' + s.y + ',' + s.z + '): ' + problema);
            return;
        }
        s.x = candidata.x;
        s.y = candidata.y;
        s.z = candidata.z;
        s.monsters.forEach((m, i) => {
            m.x = candidata.monsters[i].x;
            m.y = candidata.monsters[i].y;
        });
        mapa.spawnsSucios = true;
        marcadores += 1;
    });
    npcs.forEach((n) => {
        const problema = mapa._problemaDeMoverNpc ? mapa._problemaDeMoverNpc(n, n.x + dx, n.y + dy, n.z + mz) : null;
        if (problema) {
            avisos.push('NPC «' + n.name + '»: ' + problema);
            return;
        }
        n.x += dx;
        n.y += dy;
        n.z += mz;
        mapa.npcsSucios = true;
        marcadores += 1;
    });
    if (marcadores > 0) {
        // El marcador elegido se apuntaba por su casilla, que ya no es la misma.
        mapa.seleccion = null;
    }

    const nueva = seleccionVacia();
    casillas.forEach((c) => {
        if (mapa.inBounds(c.x + dx, c.y + dy, c.z + mz)) {
            nueva.claves.add(claveDe(c.x + dx, c.y + dy, c.z + mz));
        }
    });
    return {
        ok: true, n: llevar.length, seleccion: nueva, avisos, marcadores,
        origen: casillas, destino: casillasDeSeleccion(nueva)
    };
}

function copiaDeCasilla(tile) {
    return {
        ground: tile.ground,
        items: JSON.parse(JSON.stringify(tile.items)),
        flags: tile.flags.slice(),
        houseId: tile.houseId || 0
    };
}

/**
 * Copia el contenido explícito de un rectángulo. Las casillas sin nada propio no se copian:
 * pegarlas borraría lo que hubiera debajo.
 */
export function copiarArea(mapa, rect) {
    const celdas = [];
    for (let y = rect.y0; y <= rect.y1; y += 1) {
        for (let x = rect.x0; x <= rect.x1; x += 1) {
            const tile = mapa.tileAt(x, y, rect.z);
            if (tile && !mapa.isVoid(tile)) {
                celdas.push({ dx: x - rect.x0, dy: y - rect.y0, ...copiaDeCasilla(tile) });
            }
        }
    }
    return { ancho: rect.x1 - rect.x0 + 1, alto: rect.y1 - rect.y0 + 1, celdas };
}

/** Borra todo lo explícito de un rectángulo. */
export function borrarArea(mapa, rect) {
    let n = 0;
    for (let y = rect.y0; y <= rect.y1; y += 1) {
        for (let x = rect.x0; x <= rect.x1; x += 1) {
            if (mapa.tileAt(x, y, rect.z)) {
                mapa.erase(x, y, rect.z);
                n += 1;
            }
        }
    }
    return n;
}

/**
 * Pega lo copiado con su esquina de arriba a la izquierda en (x, y). Cada casilla pegada
 * SUSTITUYE a la de destino, que es lo que espera quien copia una habitación: que quede igual.
 *
 * @returns {number} casillas pegadas (las que caen fuera del mapa se saltan)
 */
export function pegar(mapa, portapapeles, x, y, z) {
    let n = 0;
    portapapeles.celdas.forEach((c) => {
        const cx = x + c.dx;
        const cy = y + c.dy;
        // `dz`: lo copiado de varias plantas (`copiarSeleccion`) llega con sus pisos en el
        // mismo orden, contados desde la planta donde se pega.
        const cz = z + (c.dz || 0);
        if (!mapa.inBounds(cx, cy, cz)) {
            return;
        }
        const tile = mapa.editableTile(cx, cy, cz);
        tile.ground = c.ground;
        tile.items = JSON.parse(JSON.stringify(c.items));
        tile.flags = c.flags.slice();
        tile.houseId = c.houseId || 0;
        mapa.markDirty(cx, cy, cz);
        n += 1;
    });
    return n;
}

/** El suelo que se ve en una casilla: el propio o el de la planta. */
export function sueloEfectivo(mapa, x, y, z) {
    const tile = mapa.tileAt(x, y, z);
    return tile && tile.ground !== null && tile.ground !== undefined ? tile.ground : mapa.defaultGroundFor(z);
}

/**
 * EL CUBO DE RELLENO (Ctrl+D + clic en RME): las casillas conectadas —por los cuatro lados— que
 * tienen el mismo suelo que la pinchada. Tiene un tope, como en RME, para que un clic en un mapa
 * de hierba no intente rellenar el mundo entero.
 *
 * @returns {{casillas: Array<{x,y}>, cortado: boolean}}
 */
export function areaDeRelleno(mapa, x, y, z, limite) {
    const tope = limite || 10000;
    const objetivo = sueloEfectivo(mapa, x, y, z);
    const vistas = new Set([x + ',' + y]);
    const cola = [{ x, y }];
    const casillas = [];
    let cortado = false;
    while (cola.length > 0) {
        const c = cola.shift();
        casillas.push(c);
        if (casillas.length >= tope) {
            cortado = true;
            break;
        }
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nx = c.x + dx;
            const ny = c.y + dy;
            const k = nx + ',' + ny;
            if (!vistas.has(k) && mapa.inBounds(nx, ny, z) && sueloEfectivo(mapa, nx, ny, z) === objetivo) {
                vistas.add(k);
                cola.push({ x: nx, y: ny });
            }
        });
    }
    return { casillas, cortado };
}

/**
 * BUSCAR (Find Item, Find Unique, Find Action de RME), en todas las plantas o en un rectángulo.
 *
 * @param {{id?:number, actionId?:number, uniqueId?:number, texto?:string}} criterio
 * @returns {Array<{x,y,z,id,motivo}>}
 */
export function buscar(mapa, criterio, rect) {
    const c = criterio || {};
    const resultados = [];
    mapa.tiles.forEach((tile) => {
        if (rect && !dentroDe(rect, tile.x, tile.y, tile.z)) {
            return;
        }
        if (c.id && Number(tile.ground) === Number(c.id)) {
            resultados.push({ x: tile.x, y: tile.y, z: tile.z, id: tile.ground, motivo: 'suelo' });
        }
        tile.items.forEach((item) => {
            const a = item.attributes || {};
            let motivo = null;
            if (c.id && item.id === Number(c.id)) { motivo = 'objeto'; }
            if (c.actionId && Number(a.actionId) === Number(c.actionId)) { motivo = 'actionId'; }
            if (c.uniqueId && Number(a.uniqueId) === Number(c.uniqueId)) { motivo = 'uniqueId'; }
            if (c.texto && typeof a.text === 'string' && a.text.toLowerCase().includes(String(c.texto).toLowerCase())) {
                motivo = 'texto';
            }
            if (c.conAtributos && Object.keys(a).length > 0) { motivo = 'atributos'; }
            if (motivo) {
                resultados.push({ x: tile.x, y: tile.y, z: tile.z, id: item.id, motivo });
            }
        });
    });
    resultados.sort((p, q) => (p.z - q.z) || (p.y - q.y) || (p.x - q.x));
    return resultados;
}

/**
 * REEMPLAZAR (Replace Items): cambia un id por otro en el suelo y en las pilas, conservando la
 * cantidad y los atributos. Con `rect`, solo dentro de la selección.
 *
 * @returns {number} cuántos objetos ha cambiado
 */
export function reemplazar(mapa, de, a, rect) {
    let n = 0;
    const origen = Number(de);
    const destino = Number(a);
    mapa.tiles.forEach((tile) => {
        if (rect && !dentroDe(rect, tile.x, tile.y, tile.z)) {
            return;
        }
        let tocada = false;
        if (Number(tile.ground) === origen) {
            tile.ground = destino;
            n += 1;
            tocada = true;
        }
        tile.items.forEach((item) => {
            if (item.id === origen) {
                item.id = destino;
                n += 1;
                tocada = true;
            }
        });
        if (tocada) {
            mapa.markDirty(tile.x, tile.y, tile.z);
        }
    });
    return n;
}

/** QUITAR POR ID (Remove Items by ID). */
export function quitarPorId(mapa, id, rect) {
    let n = 0;
    Array.from(mapa.tiles.values()).forEach((tile) => {
        if (rect && !dentroDe(rect, tile.x, tile.y, tile.z)) {
            return;
        }
        const antes = tile.items.length;
        tile.items = tile.items.filter((item) => item.id !== Number(id));
        if (tile.items.length !== antes) {
            n += antes - tile.items.length;
            if (mapa.isVoid(tile)) {
                mapa.erase(tile.x, tile.y, tile.z);
            } else {
                mapa.markDirty(tile.x, tile.y, tile.z);
            }
        }
    });
    return n;
}

/**
 * ALEATORIZAR (Randomize Selection): vuelve a tirar el suelo de cada casilla según las
 * probabilidades de su pincel de suelo, para que un prado no tenga siempre la misma variante.
 */
export function aleatorizar(mapa, idx, rect, aleatorio) {
    // Un rectángulo o una selección (conjunto de casillas, quizá de varias plantas).
    const casillas = rect.claves ? casillasDeSeleccion(rect) : [];
    if (!rect.claves) {
        for (let y = rect.y0; y <= rect.y1; y += 1) {
            for (let x = rect.x0; x <= rect.x1; x += 1) {
                casillas.push({ x, y, z: rect.z });
            }
        }
    }
    let n = 0;
    casillas.forEach(({ x, y, z }) => {
        const suelo = sueloEfectivo(mapa, x, y, z);
        const pincel = idx.sueloDeObjeto.get(Number(suelo));
        if (!pincel || pincel.items.length < 2) {
            return;
        }
        const nuevo = elegirObjeto(pincel, aleatorio);
        if (nuevo !== suelo) {
            mapa.editableTile(x, y, z).ground = nuevo;
            mapa.markDirty(x, y, z);
            n += 1;
        }
    });
    return n;
}

/** ESTADÍSTICAS (F8 en RME). */
export function estadisticas(mapa) {
    const porObjeto = new Map();
    let objetos = 0;
    let conAtributos = 0;
    const plantas = new Set();
    mapa.tiles.forEach((tile) => {
        plantas.add(tile.z);
        tile.items.forEach((item) => {
            objetos += item.count && item.count > 1 ? 1 : 1;
            porObjeto.set(item.id, (porObjeto.get(item.id) || 0) + 1);
            if (item.attributes && Object.keys(item.attributes).length > 0) {
                conAtributos += 1;
            }
        });
    });
    const masUsados = Array.from(porObjeto.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const casillasDeCasa = Array.from(mapa.tiles.values()).filter((t) => t.houseId).length;
    return {
        tamano: mapa.width + 'x' + mapa.height + 'x' + mapa.floors,
        casillas: mapa.tiles.size,
        plantasUsadas: Array.from(plantas).sort((a, b) => a - b),
        objetos,
        conAtributos,
        tiposDistintos: porObjeto.size,
        masUsados,
        respawns: mapa.spawns.length,
        monstruos: mapa.spawns.reduce((s, r) => s + r.monsters.length, 0),
        npcs: mapa.npcs.length,
        compuestos: (mapa.compuestos || []).length,
        ciudades: (mapa.towns || []).length,
        casas: (mapa.houses || []).length,
        casillasDeCasa,
        waypoints: Object.keys(mapa.waypoints || {}).length
    };
}

// ---------------------------------------------------------------------------
// Casas, ciudades y waypoints
// ---------------------------------------------------------------------------

function siguienteId(lista) {
    return lista.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0) + 1;
}

export function crearCiudad(mapa, nombre, templo) {
    const ciudad = { id: siguienteId(mapa.towns), name: String(nombre || 'Ciudad'), temple: templo || [0, 0, 7] };
    mapa.towns.push(ciudad);
    mapa.extrasSucios = true;
    return ciudad;
}

export function borrarCiudad(mapa, id) {
    const casas = mapa.houses.filter((h) => h.townId === Number(id));
    if (casas.length > 0) {
        return { ok: false, problema: 'la ciudad tiene ' + casas.length + ' casa(s): bórralas o múdalas antes' };
    }
    mapa.towns = mapa.towns.filter((t) => t.id !== Number(id));
    mapa.extrasSucios = true;
    return { ok: true };
}

export function ponerTemplo(mapa, id, x, y, z) {
    const ciudad = mapa.towns.find((t) => t.id === Number(id));
    if (!ciudad) {
        return { ok: false, problema: 'no hay ninguna ciudad ' + id };
    }
    ciudad.temple = [x, y, z];
    mapa.extrasSucios = true;
    return { ok: true, ciudad };
}

export function crearCasa(mapa, nombre, townId) {
    const casa = { id: siguienteId(mapa.houses), name: String(nombre || 'Casa'), townId: Number(townId) || 0, rent: 0 };
    mapa.houses.push(casa);
    mapa.extrasSucios = true;
    return casa;
}

export function cambiarCasa(mapa, id, cambios) {
    const casa = mapa.houses.find((h) => h.id === Number(id));
    if (!casa) {
        return { ok: false, problema: 'no hay ninguna casa ' + id };
    }
    if (cambios.name !== undefined) { casa.name = String(cambios.name); }
    if (cambios.townId !== undefined) { casa.townId = Number(cambios.townId) || 0; }
    if (cambios.rent !== undefined) { casa.rent = Math.max(0, Number(cambios.rent) || 0); }
    mapa.extrasSucios = true;
    return { ok: true, casa };
}

/** Borra la casa y QUITA SU MARCA de las casillas, que es lo que hace «Remove» en RME. */
export function borrarCasa(mapa, id) {
    let casillas = 0;
    mapa.tiles.forEach((tile) => {
        if (tile.houseId === Number(id)) {
            tile.houseId = 0;
            tile.flags = tile.flags.filter((f) => f !== 'house');
            casillas += 1;
            mapa.markDirty(tile.x, tile.y, tile.z);
        }
    });
    Array.from(mapa.tiles.values()).forEach((tile) => {
        if (mapa.isVoid(tile)) {
            mapa.erase(tile.x, tile.y, tile.z);
        }
    });
    mapa.houses = mapa.houses.filter((h) => h.id !== Number(id));
    mapa.extrasSucios = true;
    return casillas;
}

/**
 * EL PINCEL DE CASA: marca (o desmarca, con `quitar`) las casillas como de la casa, con la
 * bandera `house`. Una casilla de casa necesita suelo: sin él no se puede entrar.
 */
export function pintarCasa(mapa, casillas, z, houseId, quitar) {
    let n = 0;
    casillas.forEach((c) => {
        if (!mapa.inBounds(c.x, c.y, z)) {
            return;
        }
        if (quitar) {
            const tile = mapa.tileAt(c.x, c.y, z);
            if (tile && tile.houseId) {
                tile.houseId = 0;
                tile.flags = tile.flags.filter((f) => f !== 'house');
                if (mapa.isVoid(tile)) {
                    mapa.erase(c.x, c.y, z);
                } else {
                    mapa.markDirty(c.x, c.y, z);
                }
                n += 1;
            }
            return;
        }
        const tile = mapa.editableTile(c.x, c.y, z);
        tile.houseId = Number(houseId);
        if (!tile.flags.includes('house')) {
            tile.flags.push('house');
        }
        mapa.markDirty(c.x, c.y, z);
        n += 1;
    });
    return n;
}

/** LA SALIDA DE LA CASA (House Exit): tiene que estar fuera de la casa. */
export function ponerSalida(mapa, id, x, y, z) {
    const casa = mapa.houses.find((h) => h.id === Number(id));
    if (!casa) {
        return { ok: false, problema: 'elige antes una casa' };
    }
    const tile = mapa.tileAt(x, y, z);
    if (tile && tile.houseId) {
        return { ok: false, problema: 'la salida no puede estar dentro de una casa' };
    }
    casa.exit = [x, y, z];
    mapa.extrasSucios = true;
    return { ok: true, casa };
}

/** Las casillas de una casa, para pintarlas y para saber cuánto mide. */
export function casillasDeCasa(mapa, id) {
    return Array.from(mapa.tiles.values()).filter((t) => t.houseId === Number(id));
}

/** LIMPIAR CASAS INVÁLIDAS (Clear Invalid Houses): casillas de casas que ya no existen. */
export function limpiarCasasInvalidas(mapa) {
    const validas = new Set(mapa.houses.map((h) => h.id));
    let n = 0;
    Array.from(mapa.tiles.values()).forEach((tile) => {
        if (tile.houseId && !validas.has(tile.houseId)) {
            tile.houseId = 0;
            tile.flags = tile.flags.filter((f) => f !== 'house');
            n += 1;
            if (mapa.isVoid(tile)) {
                mapa.erase(tile.x, tile.y, tile.z);
            } else {
                mapa.markDirty(tile.x, tile.y, tile.z);
            }
        }
    });
    return n;
}

export function ponerWaypoint(mapa, nombre, x, y, z) {
    const n = String(nombre || '').trim();
    if (!n) {
        return { ok: false, problema: 'el waypoint necesita un nombre' };
    }
    mapa.waypoints[n] = [x, y, z];
    mapa.extrasSucios = true;
    return { ok: true };
}

export function quitarWaypoint(mapa, nombre) {
    if (!(nombre in mapa.waypoints)) {
        return { ok: false, problema: 'no hay ningún waypoint «' + nombre + '»' };
    }
    delete mapa.waypoints[nombre];
    mapa.extrasSucios = true;
    return { ok: true };
}
