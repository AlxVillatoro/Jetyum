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

export function dentroDe(rect, x, y, z) {
    return !!rect && z === rect.z && x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
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
        if (!mapa.inBounds(cx, cy, z)) {
            return;
        }
        const tile = mapa.editableTile(cx, cy, z);
        tile.ground = c.ground;
        tile.items = JSON.parse(JSON.stringify(c.items));
        tile.flags = c.flags.slice();
        tile.houseId = c.houseId || 0;
        mapa.markDirty(cx, cy, z);
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
    let n = 0;
    for (let y = rect.y0; y <= rect.y1; y += 1) {
        for (let x = rect.x0; x <= rect.x1; x += 1) {
            const suelo = sueloEfectivo(mapa, x, y, rect.z);
            const pincel = idx.sueloDeObjeto.get(Number(suelo));
            if (!pincel || pincel.items.length < 2) {
                continue;
            }
            const nuevo = elegirObjeto(pincel, aleatorio);
            if (nuevo !== suelo) {
                mapa.editableTile(x, y, rect.z).ground = nuevo;
                mapa.markDirty(x, y, rect.z);
                n += 1;
            }
        }
    }
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
