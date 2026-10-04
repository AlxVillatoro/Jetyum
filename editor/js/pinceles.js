/**
 * LOS PINCELES DE RME: suelos con AUTO-BORDE y muros con AUTO-ALINEACIÓN.
 *
 * Es lógica pura sobre un EditorMap (casillas `{ground, items, flags}`), sin lienzo, y se prueba
 * en Node (`tools/test-mapa.mjs`). Las definiciones viven en `data/editor/pinceles.json`, que es
 * lo que en RME son `grounds.xml`, `borders.xml` y `walls.xml`. El formato y el comportamiento
 * se documentan en `docs/MAPAS.md`.
 *
 * SUELOS CON BORDE. Cada pincel de suelo tiene una `z`. Cuando dos suelos se tocan, el de MAYOR z
 * pone su borde sobre la casilla del de menor z: la hierba (z 30) que linda con tierra (z 20)
 * deja en la casilla de tierra una pieza de borde de hierba. Qué pieza toca sale de los ocho
 * vecinos:
 *
 *   - lados:              n, e, s, w        (el vecino de ese lado es del suelo de arriba)
 *   - esquina interior:   dnw, dne, dsw, dse (los dos lados de esa esquina lo son: se juntan)
 *   - esquina exterior:   cnw, cne, csw, cse (solo la diagonal lo es)
 *
 * Las piezas de borde son objetos normales que van ABAJO de la pila (justo encima del suelo),
 * y se rehacen enteras cada vez: borrar el borde viejo y poner el nuevo es lo que permite pintar
 * y repintar sin dejar bordes huérfanos.
 *
 * MUROS. Una casilla de muro elige su pieza mirando qué vecinos (n, e, s, o) son del mismo muro.
 * Son las tablas de RME (`brush_tables.cpp`): 16 tipos completos (poste, extremos, horizontal,
 * vertical, las cuatro diagonales, las cuatro T y el cruce) y, si el muro no tiene la pieza de ese
 * tipo, la tabla «media» de Tibia, que solo usa poste, horizontal, vertical y esquina. La
 * ESQUINA de Tibia es la que une hacia el NORTE y hacia el OESTE: la de abajo a la derecha de
 * una habitación. Las puertas y ventanas cuentan como muro y siguen su alineación.
 *
 * ALFOMBRAS Y MESAS. Una alfombra elige su pieza por sus ocho vecinos (centro, lados y esquinas);
 * una mesa, por sus cuatro (sola, horizontal, vertical y extremos), como en RME.
 */

export const FORMATO_PINCELES = 'jetyum-pinceles';

export const PIEZAS_DE_BORDE = ['n', 'e', 's', 'w', 'cnw', 'cne', 'csw', 'cse', 'dnw', 'dne', 'dsw', 'dse'];

/** Los 16 tipos completos de muro de RME, por la máscara N=1, W=2, E=4, S=8. */
export const TIPO_COMPLETO = [
    'poste', 'fin_sur', 'fin_este', 'esquina', 'fin_oeste', 'diagonal_ne', 'horizontal', 't_sur',
    'fin_norte', 'vertical', 'diagonal_so', 't_este', 'diagonal_se', 't_oeste', 't_norte', 'cruce'
];

/** La tabla media de Tibia: lo que se usa si el muro no tiene la pieza del tipo completo. */
export const TIPO_MEDIO = [
    'poste', 'vertical', 'horizontal', 'esquina', 'poste', 'vertical', 'horizontal', 'esquina',
    'poste', 'vertical', 'horizontal', 'esquina', 'poste', 'vertical', 'horizontal', 'esquina'
];

export const PIEZAS_DE_MURO = ['poste', 'horizontal', 'vertical', 'esquina', 'fin_norte', 'fin_sur',
    'fin_este', 'fin_oeste', 'diagonal_ne', 'diagonal_so', 'diagonal_se', 't_norte', 't_sur', 't_este',
    't_oeste', 'cruce'];

export const PIEZAS_DE_ALFOMBRA = ['centro'].concat(['n', 'e', 's', 'w', 'cnw', 'cne', 'csw', 'cse', 'dnw', 'dne', 'dsw', 'dse']);

export const PIEZAS_DE_MESA = ['sola', 'horizontal', 'vertical', 'fin_norte', 'fin_sur', 'fin_este', 'fin_oeste'];

/** Los ocho vecinos, con su desplazamiento. */
export const VECINOS = {
    nw: [-1, -1], n: [0, -1], ne: [1, -1],
    w: [-1, 0], e: [1, 0],
    sw: [-1, 1], s: [0, 1], se: [1, 1]
};

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export function vacio() {
    return { format: FORMATO_PINCELES, version: 1, suelos: [], bordes: [], muros: [], alfombras: [], mesas: [] };
}

/**
 * Valida el archivo de pinceles, acumulando los problemas.
 *
 * @param {Object} raw
 * @param {Map<number,Object>} [itemTypes] para comprobar que los objetos existen
 */
export function normalizarPinceles(raw, itemTypes) {
    const problemas = [];
    const data = vacio();
    if (!raw || raw.format !== FORMATO_PINCELES) {
        problemas.push('no es un archivo ' + FORMATO_PINCELES);
    }
    if (raw && raw._comment) {
        data._comment = raw._comment;
    }
    const existe = (id, donde) => {
        if (itemTypes && !itemTypes.has(Number(id))) {
            problemas.push(donde + ': el objeto ' + id + ' no existe en items.xml');
        }
    };
    const bordes = new Set();
    ((raw && raw.bordes) || []).forEach((b) => {
        const borde = { id: String(b.id), piezas: {} };
        PIEZAS_DE_BORDE.forEach((p) => {
            if (b.piezas && b.piezas[p] !== undefined) {
                borde.piezas[p] = Number(b.piezas[p]);
                existe(borde.piezas[p], 'borde ' + borde.id + '.' + p);
            }
        });
        if (Object.keys(borde.piezas).length === 0) {
            problemas.push('el borde ' + borde.id + ' no tiene piezas');
        }
        bordes.add(borde.id);
        data.bordes.push(borde);
    });
    const ids = new Set();
    ((raw && raw.suelos) || []).forEach((s) => {
        const suelo = {
            id: String(s.id), nombre: String(s.nombre || s.id), z: Number(s.z) || 0,
            items: (s.items || []).map((i) => ({ id: Number(i.id), chance: Math.max(1, Number(i.chance) || 1) }))
        };
        if (ids.has(suelo.id)) {
            problemas.push('suelo ' + suelo.id + ' repetido');
        }
        ids.add(suelo.id);
        if (suelo.items.length === 0) {
            problemas.push('el suelo ' + suelo.id + ' no tiene objetos');
        }
        suelo.items.forEach((i) => existe(i.id, 'suelo ' + suelo.id));
        if (s.borde) {
            suelo.borde = String(s.borde);
            if (!bordes.has(suelo.borde)) {
                problemas.push('el suelo ' + suelo.id + ' usa el borde ' + suelo.borde + ', que no existe');
            }
        }
        data.suelos.push(suelo);
    });
    ((raw && raw.muros) || []).forEach((m) => {
        const muro = { id: String(m.id), nombre: String(m.nombre || m.id), piezas: {} };
        PIEZAS_DE_MURO.forEach((p) => {
            if (m.piezas && m.piezas[p] !== undefined) {
                muro.piezas[p] = Number(m.piezas[p]);
                existe(muro.piezas[p], 'muro ' + muro.id + '.' + p);
            }
        });
        if (!muro.piezas.horizontal && !muro.piezas.poste) {
            problemas.push('el muro ' + muro.id + ' necesita al menos la pieza horizontal o el poste');
        }
        // Puertas y ventanas por alineación: {puerta: {horizontal, vertical}, ventana: {...}}.
        ['puerta', 'ventana'].forEach((tipo) => {
            const p = m[tipo + 's'];
            if (p) {
                muro[tipo + 's'] = {};
                ['horizontal', 'vertical'].forEach((al) => {
                    if (p[al] !== undefined) {
                        muro[tipo + 's'][al] = Number(p[al]);
                        existe(p[al], 'muro ' + muro.id + '.' + tipo + '.' + al);
                    }
                });
            }
        });
        data.muros.push(muro);
    });
    [['alfombras', PIEZAS_DE_ALFOMBRA, 'centro'], ['mesas', PIEZAS_DE_MESA, 'sola']].forEach(([lista, piezas, basica]) => {
        data[lista] = [];
        ((raw && raw[lista]) || []).forEach((a) => {
            const pincel = { id: String(a.id), nombre: String(a.nombre || a.id), piezas: {} };
            piezas.forEach((p) => {
                if (a.piezas && a.piezas[p] !== undefined) {
                    pincel.piezas[p] = Number(a.piezas[p]);
                    existe(pincel.piezas[p], lista + ' ' + pincel.id + '.' + p);
                }
            });
            if (!pincel.piezas[basica]) {
                problemas.push(pincel.id + ': necesita la pieza «' + basica + '»');
            }
            data[lista].push(pincel);
        });
    });
    return { data, problemas };
}

/** Índices rápidos: de id de objeto a pincel de suelo, a borde y a muro. */
export function indexar(pinceles) {
    const sueloDeObjeto = new Map();
    pinceles.suelos.forEach((s) => s.items.forEach((i) => sueloDeObjeto.set(i.id, s)));
    const bordePorId = new Map(pinceles.bordes.map((b) => [b.id, b]));
    const piezasDeBorde = new Set();
    pinceles.bordes.forEach((b) => Object.values(b.piezas).forEach((id) => piezasDeBorde.add(id)));
    const muroDeObjeto = new Map();
    pinceles.muros.forEach((m) => {
        Object.values(m.piezas).forEach((id) => muroDeObjeto.set(id, m));
        ['puertas', 'ventanas'].forEach((t) => Object.values(m[t] || {}).forEach((id) => muroDeObjeto.set(id, m)));
    });
    const alfombraDeObjeto = new Map();
    (pinceles.alfombras || []).forEach((a) => Object.values(a.piezas).forEach((id) => alfombraDeObjeto.set(id, a)));
    const mesaDeObjeto = new Map();
    (pinceles.mesas || []).forEach((a) => Object.values(a.piezas).forEach((id) => mesaDeObjeto.set(id, a)));
    return { pinceles, sueloDeObjeto, bordePorId, piezasDeBorde, muroDeObjeto, alfombraDeObjeto, mesaDeObjeto };
}

// ---------------------------------------------------------------------------
// Bordes
// ---------------------------------------------------------------------------

/**
 * Las piezas de borde que tocan según qué vecinos son del suelo de arriba.
 *
 * @param {Object<string, boolean>} v las claves de VECINOS
 * @returns {string[]} piezas, en orden estable
 */
export function piezasParaVecinos(v) {
    // Es la tabla de 256 entradas de RME reducida a su regla: dos lados contiguos y SOLO esos
    // dos son la pieza diagonal; si no, una recta por cada lado; y las esquinas exteriores van
    // donde la diagonal es del suelo de arriba y sus dos lados no.
    const lados = ['n', 'e', 's', 'w'].filter((l) => v[l]);
    const piezas = [];
    const par = lados.length === 2 ? { 'n,w': 'dnw', 'e,n': 'dne', 's,w': 'dsw', 'e,s': 'dse' }[lados.slice().sort().join()] : null;
    if (par) {
        piezas.push(par);
    } else {
        lados.forEach((l) => piezas.push(l));
    }
    [['nw', 'n', 'w', 'cnw'], ['ne', 'n', 'e', 'cne'], ['sw', 's', 'w', 'csw'], ['se', 's', 'e', 'cse']]
        .forEach(([diag, a, b, c]) => {
            if (v[diag] && !v[a] && !v[b]) {
                piezas.push(c);
            }
        });
    return piezas;
}

/** El pincel de suelo de una casilla (por su suelo propio o el de la planta), o null. */
function pincelDeCasilla(mapa, idx, x, y, z) {
    if (!mapa.inBounds(x, y, z)) {
        return null;
    }
    const tile = mapa.tileAt(x, y, z);
    const suelo = tile && tile.ground !== null && tile.ground !== undefined ? tile.ground : mapa.defaultGroundFor(z);
    return idx.sueloDeObjeto.get(Number(suelo)) || null;
}

/**
 * Rehace los bordes de una casilla.
 *
 * @returns {boolean} si la casilla ha cambiado
 */
export function borderizarCasilla(mapa, idx, x, y, z) {
    if (!mapa.inBounds(x, y, z)) {
        return false;
    }
    const propio = pincelDeCasilla(mapa, idx, x, y, z);
    const zPropia = propio ? propio.z : -Infinity;

    // Qué suelos de arriba hay alrededor, y en qué vecinos.
    const porPincel = new Map();
    Object.keys(VECINOS).forEach((clave) => {
        const [dx, dy] = VECINOS[clave];
        const otro = pincelDeCasilla(mapa, idx, x + dx, y + dy, z);
        if (otro && otro.z > zPropia && otro.borde && idx.bordePorId.has(otro.borde)) {
            if (!porPincel.has(otro)) {
                porPincel.set(otro, {});
            }
            porPincel.get(otro)[clave] = true;
        }
    });

    const nuevos = [];
    Array.from(porPincel.keys()).sort((a, b) => a.z - b.z).forEach((pincel) => {
        const borde = idx.bordePorId.get(pincel.borde);
        piezasParaVecinos(porPincel.get(pincel)).forEach((pieza) => {
            if (borde.piezas[pieza]) {
                nuevos.push({ id: borde.piezas[pieza] });
            } else if (pieza[0] === 'd') {
                // Sin pieza diagonal, sus dos rectas: dnw = n + w (como RME).
                [pieza[1], pieza[2]].forEach((l) => {
                    if (borde.piezas[l]) {
                        nuevos.push({ id: borde.piezas[l] });
                    }
                });
            }
        });
    });

    const tile = mapa.tileAt(x, y, z);
    const viejos = tile ? tile.items.filter((i) => idx.piezasDeBorde.has(i.id)).map((i) => i.id) : [];
    if (viejos.join() === nuevos.map((i) => i.id).join()) {
        return false;
    }
    const destino = mapa.editableTile(x, y, z);
    const resto = destino.items.filter((i) => !idx.piezasDeBorde.has(i.id));
    destino.items = nuevos.concat(resto);
    if (mapa.isVoid(destino)) {
        mapa.erase(x, y, z);
    } else {
        mapa.markDirty(x, y, z);
    }
    return true;
}

/** Elige un objeto de un pincel de suelo según sus probabilidades. */
export function elegirObjeto(pincel, aleatorio) {
    const total = pincel.items.reduce((s, i) => s + i.chance, 0);
    let r = (aleatorio || Math.random)() * total;
    for (const item of pincel.items) {
        r -= item.chance;
        if (r < 0) {
            return item.id;
        }
    }
    return pincel.items[pincel.items.length - 1].id;
}

/** Las casillas de un área y su anillo de vecinos, sin repetir. */
function conVecinos(casillas) {
    const vistas = new Map();
    casillas.forEach((c) => {
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                const k = (c.x + dx) + ',' + (c.y + dy);
                if (!vistas.has(k)) {
                    vistas.set(k, { x: c.x + dx, y: c.y + dy });
                }
            }
        }
    });
    return Array.from(vistas.values());
}

/**
 * Pinta un suelo con su pincel y rehace los bordes de lo pintado y de su alrededor.
 *
 * @param {Array<{x,y}>} casillas
 * @returns {number} casillas pintadas
 */
export function pintarSuelo(mapa, idx, pincel, casillas, z, aleatorio) {
    let n = 0;
    casillas.forEach((c) => {
        if (!mapa.inBounds(c.x, c.y, z)) {
            return;
        }
        const id = elegirObjeto(pincel, aleatorio);
        const tile = mapa.editableTile(c.x, c.y, z);
        // El suelo de la planta no se escribe: es el mismo y ocuparía sitio.
        tile.ground = id === mapa.defaultGroundFor(z) ? null : id;
        if (mapa.isVoid(tile)) {
            mapa.erase(c.x, c.y, z);
        } else {
            mapa.markDirty(c.x, c.y, z);
        }
        n += 1;
    });
    conVecinos(casillas).forEach((c) => borderizarCasilla(mapa, idx, c.x, c.y, z));
    return n;
}

// ---------------------------------------------------------------------------
// Muros
// ---------------------------------------------------------------------------

/** La máscara de RME: N=1, W=2, E=4, S=8. */
export function mascaraDeMuro(n, w, e, s) {
    return (n ? 1 : 0) | (w ? 2 : 0) | (e ? 4 : 0) | (s ? 8 : 0);
}

/**
 * La pieza que toca: primero el tipo completo; si el muro no lo tiene, el medio; y si tampoco,
 * el poste o la horizontal.
 *
 * @returns {{tipo: string, id: number|null, alineacion: string}}
 */
export function piezaDeMuro(muro, mascara) {
    const completo = TIPO_COMPLETO[mascara];
    const medio = TIPO_MEDIO[mascara];
    const tipo = muro.piezas[completo] ? completo : (muro.piezas[medio] ? medio : (muro.piezas.poste ? 'poste' : 'horizontal'));
    // La alineación de una puerta: vertical si el muro corre de norte a sur.
    const alineacion = medio === 'vertical' ? 'vertical' : 'horizontal';
    return { tipo, id: muro.piezas[tipo] || null, alineacion };
}

function muroEn(mapa, idx, muro, x, y, z) {
    if (!mapa.inBounds(x, y, z)) {
        return false;
    }
    const tile = mapa.tileAt(x, y, z);
    return !!tile && tile.items.some((i) => idx.muroDeObjeto.get(i.id) === muro);
}

function esPuertaOVentana(muro, id) {
    const de = (t) => Object.values(muro[t] || {}).includes(id) ? t : null;
    return de('puertas') || de('ventanas');
}

/** Recoloca las piezas de muro (y sus puertas y ventanas) de una casilla según sus vecinos. */
export function alinearMuro(mapa, idx, x, y, z) {
    const tile = mapa.tileAt(x, y, z);
    if (!tile) {
        return false;
    }
    let cambio = false;
    tile.items.forEach((item, i) => {
        const muro = idx.muroDeObjeto.get(item.id);
        if (!muro) {
            return;
        }
        const mascara = mascaraDeMuro(muroEn(mapa, idx, muro, x, y - 1, z), muroEn(mapa, idx, muro, x - 1, y, z),
            muroEn(mapa, idx, muro, x + 1, y, z), muroEn(mapa, idx, muro, x, y + 1, z));
        const pieza = piezaDeMuro(muro, mascara);
        const hueco = esPuertaOVentana(muro, item.id);
        const id = hueco ? (muro[hueco][pieza.alineacion] || muro[hueco].horizontal || item.id) : pieza.id;
        if (id && id !== item.id) {
            tile.items[i] = { ...item, id };
            cambio = true;
        }
    });
    if (cambio) {
        mapa.markDirty(x, y, z);
    }
    return cambio;
}

/** Pinta un muro en unas casillas y realinea esas y sus vecinas. */
export function pintarMuro(mapa, idx, muro, casillas, z) {
    let n = 0;
    casillas.forEach((c) => {
        if (!mapa.inBounds(c.x, c.y, z)) {
            return;
        }
        const tile = mapa.editableTile(c.x, c.y, z);
        tile.items = tile.items.filter((i) => idx.muroDeObjeto.get(i.id) !== muro);
        tile.items.push({ id: piezaDeMuro(muro, 0).id });
        mapa.markDirty(c.x, c.y, z);
        n += 1;
    });
    conVecinos(casillas).forEach((c) => alinearMuro(mapa, idx, c.x, c.y, z));
    return n;
}

/**
 * Pone una PUERTA o una VENTANA en el muro de una casilla, con la alineación de ese muro (el
 * door brush de RME: se aplica encima de un muro que ya existe).
 *
 * @param {'puerta'|'ventana'} tipo
 */
export function ponerHueco(mapa, idx, x, y, z, tipo) {
    const tile = mapa.tileAt(x, y, z);
    const i = tile ? tile.items.findIndex((it) => idx.muroDeObjeto.has(it.id)) : -1;
    if (i < 0) {
        return { ok: false, problema: 'en (' + x + ',' + y + ',' + z + ') no hay muro: una ' + tipo + ' va en un muro' };
    }
    const muro = idx.muroDeObjeto.get(tile.items[i].id);
    const huecos = muro[tipo + 's'];
    if (!huecos) {
        return { ok: false, problema: 'el muro «' + muro.nombre + '» no tiene ' + tipo + 's' };
    }
    const mascara = mascaraDeMuro(muroEn(mapa, idx, muro, x, y - 1, z), muroEn(mapa, idx, muro, x - 1, y, z),
        muroEn(mapa, idx, muro, x + 1, y, z), muroEn(mapa, idx, muro, x, y + 1, z));
    const al = piezaDeMuro(muro, mascara).alineacion;
    const id = huecos[al] || huecos.horizontal || huecos.vertical;
    tile.items[i] = { ...tile.items[i], id };
    mapa.markDirty(x, y, z);
    return { ok: true, id, alineacion: al };
}

// ---------------------------------------------------------------------------
// Alfombras y mesas
// ---------------------------------------------------------------------------

/** La pieza de alfombra por sus ocho vecinos: centro si está rodeada, si no su borde. */
export function piezaDeAlfombra(v) {
    // El borde va hacia donde NO hay alfombra: se invierten los vecinos.
    const fuera = {};
    Object.keys(VECINOS).forEach((k) => { fuera[k] = !v[k]; });
    const lados = ['n', 'e', 's', 'w'].filter((l) => fuera[l]);
    if (lados.length === 0) {
        const esquina = [['nw', 'cnw'], ['ne', 'cne'], ['sw', 'csw'], ['se', 'cse']].find(([d]) => fuera[d]);
        return esquina ? esquina[1] : 'centro';
    }
    if (lados.length >= 2) {
        const par = { 'n,w': 'dnw', 'e,n': 'dne', 's,w': 'dsw', 'e,s': 'dse' }[lados.slice(0, 2).sort().join()];
        if (par) {
            return par;
        }
    }
    return lados[0];
}

/** La pieza de mesa por sus cuatro vecinos (prioriza el eje horizontal, como RME). */
export function piezaDeMesa(n, e, s, w) {
    if (e && w) { return 'horizontal'; }
    if (w) { return 'fin_este'; }
    if (e) { return 'fin_oeste'; }
    if (n && s) { return 'vertical'; }
    if (n) { return 'fin_sur'; }
    if (s) { return 'fin_norte'; }
    return 'sola';
}

function pincelEn(mapa, mapaDeObjeto, pincel, x, y, z) {
    if (!mapa.inBounds(x, y, z)) {
        return false;
    }
    const tile = mapa.tileAt(x, y, z);
    return !!tile && tile.items.some((i) => mapaDeObjeto.get(i.id) === pincel);
}

/** Realinea las alfombras y mesas de una casilla. */
export function alinearAlfombrasYMesas(mapa, idx, x, y, z) {
    const tile = mapa.tileAt(x, y, z);
    if (!tile) {
        return false;
    }
    let cambio = false;
    tile.items.forEach((item, i) => {
        let id = null;
        const alfombra = idx.alfombraDeObjeto.get(item.id);
        if (alfombra) {
            const v = {};
            Object.keys(VECINOS).forEach((k) => {
                v[k] = pincelEn(mapa, idx.alfombraDeObjeto, alfombra, x + VECINOS[k][0], y + VECINOS[k][1], z);
            });
            id = alfombra.piezas[piezaDeAlfombra(v)] || alfombra.piezas.centro;
        }
        const mesa = idx.mesaDeObjeto.get(item.id);
        if (mesa) {
            const en = (dx, dy) => pincelEn(mapa, idx.mesaDeObjeto, mesa, x + dx, y + dy, z);
            id = mesa.piezas[piezaDeMesa(en(0, -1), en(1, 0), en(0, 1), en(-1, 0))] || mesa.piezas.sola;
        }
        if (id && id !== item.id) {
            tile.items[i] = { ...item, id };
            cambio = true;
        }
    });
    if (cambio) {
        mapa.markDirty(x, y, z);
    }
    return cambio;
}

/** Pinta una alfombra o una mesa y realinea alrededor. */
export function pintarAlineable(mapa, idx, pincel, casillas, z) {
    const mapaDeObjeto = pincel.piezas.centro ? idx.alfombraDeObjeto : idx.mesaDeObjeto;
    const basica = pincel.piezas.centro || pincel.piezas.sola;
    let n = 0;
    casillas.forEach((c) => {
        if (!mapa.inBounds(c.x, c.y, z)) {
            return;
        }
        const tile = mapa.editableTile(c.x, c.y, z);
        tile.items = tile.items.filter((i) => mapaDeObjeto.get(i.id) !== pincel);
        // La alfombra va abajo de la pila (sobre el suelo y sus bordes); la mesa, encima.
        if (pincel.piezas.centro) {
            const bordes = tile.items.filter((i) => idx.piezasDeBorde.has(i.id));
            const resto = tile.items.filter((i) => !idx.piezasDeBorde.has(i.id));
            tile.items = bordes.concat([{ id: basica }], resto);
        } else {
            tile.items.push({ id: basica });
        }
        mapa.markDirty(c.x, c.y, z);
        n += 1;
    });
    conVecinos(casillas).forEach((c) => alinearAlfombrasYMesas(mapa, idx, c.x, c.y, z));
    return n;
}

/**
 * Después de BORRAR: los vecinos de lo borrado se rehacen (bordes, muros, alfombras y mesas),
 * que es lo que hace la goma de RME.
 */
export function rehacerAlrededor(mapa, idx, casillas, z) {
    conVecinos(casillas).forEach((c) => {
        borderizarCasilla(mapa, idx, c.x, c.y, z);
        alinearMuro(mapa, idx, c.x, c.y, z);
        alinearAlfombrasYMesas(mapa, idx, c.x, c.y, z);
    });
}

/**
 * «Borderize selection» de RME: rehace bordes y realinea muros en un rectángulo (y su anillo).
 *
 * @returns {number} casillas cambiadas
 */
export function borderizarArea(mapa, idx, x0, y0, x1, y1, z) {
    const casillas = [];
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y += 1) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) {
            casillas.push({ x, y });
        }
    }
    let n = 0;
    conVecinos(casillas).forEach((c) => {
        if (borderizarCasilla(mapa, idx, c.x, c.y, z)) { n += 1; }
        if (alinearMuro(mapa, idx, c.x, c.y, z)) { n += 1; }
        if (alinearAlfombrasYMesas(mapa, idx, c.x, c.y, z)) { n += 1; }
    });
    return n;
}
