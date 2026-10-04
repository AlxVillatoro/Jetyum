/**
 * EL MUNDO DEL OPENTIBIA SPRITE PACK: pinceles, compuestos y el mapa «jetyum».
 *
 *     node tools/generar-mundo-otsp.mjs          # escribe los tres
 *     node tools/generar-mundo-otsp.mjs --salida d   # en otra carpeta (las pruebas lo usan)
 *
 * Necesita que el pack ya esté importado (`tools/importar-otsp.mjs`): usa sus objetos, con los
 * identificadores desplazados (+10000).
 *
 * TODO SE CONSTRUYE CON EL CÓDIGO DEL EDITOR (`editor/js/pinceles.js` y `EditorMap`): los muros
 * se pintan con el pincel de muro —que elige la pieza de cada casilla por sus vecinos, como RME—,
 * las puertas y ventanas se ponen con el «door brush» y los bordes de la hierba con el auto-borde.
 * Así el mapa sale igual que si se pintara a mano en el editor, y los pinceles y compuestos que
 * se escriben son los mismos que se usan para construirlo.
 *
 * Escribe:
 *   - `data/editor/pinceles.json`: añade (o sustituye) los pinceles «otsp-*»;
 *   - `data/editor/compuestos.json`: añade (o sustituye) los compuestos de las categorías «OTSP ·»;
 *   - `data/world/jetyum.map.json`: el mapa.
 *
 * Es determinista: el azar (variantes de hierba, flores) sale de una semilla fija.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as P from '../editor/js/pinceles.js';
import { EditorMap } from '../editor/js/editormap.js';
import { desdeCasillas, normalizarCompuestos, serializar } from '../shared/js/compuestos.mjs';

const require = createRequire(import.meta.url);
const Xml = require('../engine/data/xml.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = 10000;
const o = (n) => n + O;
const Z = 7;

// ---------------------------------------------------------------------------
// El catálogo: qué es cada cosa del pack (identificadores DEL PACK)
// ---------------------------------------------------------------------------

/**
 * LOS MUROS. Cada material del pack trae, seguidos, el tramo vertical, el horizontal, el poste
 * y la esquina (el `.dat` marca los dos primeros con los ganchos `horizontal` y `vertical`). Las
 * puertas van en grupos de tres (dos cerradas y una abierta), vertical y luego horizontal: aquí
 * se guarda el primero del grupo vertical y el pincel usa la SEGUNDA cerrada de cada uno.
 */
export const MUROS = [
    { id: 'piedra-gris', nombre: 'Piedra gris', v: 534, puertas: 2385, ventanas: [539, 541] },
    { id: 'piedra-redonda', nombre: 'Piedra redondeada', v: 542, puertas: 2391, ventanas: [550, 551] },
    { id: 'arenisca', nombre: 'Arenisca', v: 552, puertas: 2397 },
    { id: 'piedra-plata', nombre: 'Piedra plateada', v: 558, puertas: 2403 },
    { id: 'piedra-oscura', nombre: 'Piedra oscura', v: 569, puertas: 2409 },
    { id: 'piedra-negra', nombre: 'Piedra negra', v: 576, puertas: 2415 },
    { id: 'beige', nombre: 'Estuco beige', v: 603, puertas: 2433 },
    { id: 'crema', nombre: 'Estuco crema', v: 617, puertas: 2439, ventanas: [621, 622] },
    { id: 'madera', nombre: 'Madera', v: 680, puertas: 2469 },
    { id: 'marmol', nombre: 'Mármol blanco', v: 733, puertas: 2499 },
    { id: 'amarillo', nombre: 'Estuco amarillo', v: 778, puertas: 2517, ventanas: [782, 784] },
    { id: 'rosa', nombre: 'Estuco rosa', v: 794, puertas: 2529 },
    { id: 'blanco', nombre: 'Estuco blanco', v: 806, puertas: 2535, ventanas: [810, 811] },
    { id: 'naranja', nombre: 'Estuco naranja', v: 812, puertas: 2541 },
    { id: 'madera-oscura', nombre: 'Madera oscura', v: 816, puertas: 2547, ventanas: [820, 821] },
    { id: 'piedra-tallada', nombre: 'Piedra tallada', v: 830, puertas: 2553, ventanas: [836, 837] },
    { id: 'tablones', nombre: 'Tablones', v: 852, puertas: 2559 },
    { id: 'oro', nombre: 'Oro', v: 882, puertas: 2565 },
    { id: 'roca', nombre: 'Roca', v: 891, puertas: 2571 },
    { id: 'hielo', nombre: 'Hielo', v: 897, puertas: 2577 }
];

/** Los suelos del pack que se usan (sin borde propio: el de la hierba se pone encima). */
export const SUELOS = {
    hierba: [101, 102, 103, 104, 105],
    tierra: [203, 204, 205, 206, 207],
    arena: [128],
    grava: [146],
    adoquin: [152],
    losa: [155],
    piedra: [170],
    ladrillo: [169],
    madera: [172],
    madera_clara: [173],
    marmol: [200, 201, 202],
    rojo: [176],
    agua: [2260, 2261]
};

/** Los adornos, por familia. */
export const ADORNOS = {
    arboles: [1503, 1504, 1506, 1507, 1509, 1529, 1531, 1532, 1534, 1537, 1563, 1564],
    arbolesEnFlor: [1517, 1530],
    frutales: [1540, 1541, 1542, 1543, 1546, 1549],
    arbustos: [1498, 1538, 1539],
    matas: [1478, 1479, 1480, 1482],
    flores: [1339, 1340, 1342, 1343, 1386, 1387, 1400, 1423, 1424],
    hierbas: [1412, 1413, 1414, 1415, 1416, 1417],
    piedras: [1598, 1599, 1600, 1604, 1613],
    rocas: [1622, 1624, 1625, 1626, 1638, 1639],
    troncos: [1588, 1589, 1591],
    setas: [1404, 1405, 1406],
    nenufares: [1392, 1393]
};

/** Lo que cambia de planta (ids del pack). Ver `floorchange` en items.xml. */
export const ESCALERAS = {
    bajar: 997,         // escalera de bajada (suelo, floorchange down)
    agujero: 996,       // agujero (suelo, floorchange down)
    subirNorte: 1005,   // escalera de subida (floorchange north)
    mano: 1009          // escalera de mano: se USA para subir
};

export const MUEBLES = {
    sillaS: 1090, sillaE: 1092, sillaN: 1094, sillaO: 1096,
    mesa: 1197,
    cofre: 1113, barril: 1110, caja: 1115, cajas: 1116, cajon: 1117, saco: 1185, fardo: 1118,
    estanteria: 1209, librero: 1210, maceta: 1088, banera: 1211, yunque: 1207,
    estatua1: 1155, estatua2: 1156, estatua3: 1159, estatua4: 1161, fuente: 1151,
    columna: 1130, cristal: 1277, guerrero: 1275, lena: 1140, pila: 1141, telarana: 1271
};

// ---------------------------------------------------------------------------
// Azar con semilla
// ---------------------------------------------------------------------------

function azar(semilla) {
    let s = semilla >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// ---------------------------------------------------------------------------
// Pinceles
// ---------------------------------------------------------------------------

export function pincelesOtsp() {
    const muros = MUROS.map((m) => {
        const muro = {
            id: 'otsp-' + m.id,
            nombre: m.nombre + ' (OTSP)',
            piezas: { vertical: o(m.v), horizontal: o(m.v + 1), poste: o(m.v + 2), esquina: o(m.v + 3) },
            puertas: { vertical: o(m.puertas + 1), horizontal: o(m.puertas + 4) }
        };
        if (m.ventanas) {
            muro.ventanas = { vertical: o(m.ventanas[0]), horizontal: o(m.ventanas[1]) };
        }
        return muro;
    });
    const borde = ['n', 'e', 's', 'w', 'cnw', 'cne', 'csw', 'cse', 'dnw', 'dne', 'dsw', 'dse'];
    const piezas = (base) => Object.fromEntries(borde.map((k, i) => [k, o(base + i)]));
    const suelo = (id, nombre, z, ids, conBorde) => ({
        id: 'otsp-' + id, nombre: nombre + ' (OTSP)', z,
        items: ids.map((n, i) => ({ id: o(n), chance: i === 0 ? 50 : 10 })),
        ...(conBorde ? { borde: conBorde } : {})
    });
    return {
        bordes: [{ id: 'otsp-borde-hierba', piezas: piezas(215) }],
        suelos: [
            suelo('hierba', 'Hierba', 35, SUELOS.hierba, 'otsp-borde-hierba'),
            suelo('tierra', 'Tierra', 12, SUELOS.tierra),
            suelo('arena', 'Arena', 11, SUELOS.arena),
            suelo('grava', 'Grava', 13, SUELOS.grava),
            suelo('adoquin', 'Adoquín', 14, SUELOS.adoquin),
            suelo('losa', 'Losa gris', 15, SUELOS.losa),
            suelo('madera', 'Tarima', 16, SUELOS.madera),
            suelo('marmol', 'Mármol', 17, SUELOS.marmol),
            suelo('agua', 'Agua', 5, SUELOS.agua)
        ],
        muros,
        alfombras: [],
        mesas: []
    };
}

/** Mete los pinceles «otsp-*» en un pinceles.json, sustituyendo los que ya hubiera. */
export function mezclarPinceles(crudo, nuevos) {
    const fuera = (lista) => (lista || []).filter((p) => !String(p.id).startsWith('otsp-'));
    const salida = { ...crudo };
    ['suelos', 'bordes', 'muros', 'alfombras', 'mesas'].forEach((k) => {
        salida[k] = fuera(crudo[k]).concat(nuevos[k] || []);
    });
    return salida;
}

// ---------------------------------------------------------------------------
// El constructor: un EditorMap con ayudas para levantar cosas
// ---------------------------------------------------------------------------

export class Obra {
    constructor(items, pinceles, ancho, alto, semilla) {
        this.m = new EditorMap({
            format: 'jetyum-map', version: 1, name: 'obra', width: ancho, height: alto, floors: 16,
            defaultGround: { [Z]: o(SUELOS.hierba[0]) }, tiles: []
        }, items);
        this.idx = P.indexar(pinceles);
        this.pinceles = pinceles;
        this.rnd = azar(semilla || 7);
        this.muros = new Map(pinceles.muros.map((m) => [m.id, m]));
        /** La planta en la que se construye: se cambia para levantar sótanos y pisos altos. */
        this.z = Z;
    }

    elegir(lista) {
        return lista[Math.floor(this.rnd() * lista.length)];
    }

    suelo(x, y, idPack) {
        this.m.paintGround(x, y, this.z, o(idPack));
    }

    /** Rellena un rectángulo (incluidos los bordes) con un suelo; si hay variantes, al azar. */
    sueloRect(x0, y0, x1, y1, lista) {
        for (let y = y0; y <= y1; y += 1) {
            for (let x = x0; x <= x1; x += 1) {
                this.suelo(x, y, Array.isArray(lista) ? this.elegir(lista) : lista);
            }
        }
    }

    objeto(x, y, idPack, atributos) {
        const tile = this.m.editableTile(x, y, this.z);
        tile.items.push(atributos ? { id: o(idPack), attributes: atributos } : { id: o(idPack) });
        this.m.markDirty(x, y, this.z);
    }

    vaciar(x, y) {
        const tile = this.m.editableTile(x, y, this.z);
        tile.items = [];
        this.m.markDirty(x, y, this.z);
    }

    bandera(x, y, nombre) {
        const tile = this.m.editableTile(x, y, this.z);
        if (!tile.flags.includes(nombre)) {
            tile.flags.push(nombre);
        }
        this.m.markDirty(x, y, this.z);
    }

    zonaProtegida(x0, y0, x1, y1) {
        for (let y = y0; y <= y1; y += 1) {
            for (let x = x0; x <= x1; x += 1) {
                this.bandera(x, y, 'protectionZone');
            }
        }
    }

    /** El perímetro de un rectángulo con el pincel de muro (las esquinas y uniones salen solas). */
    muroRect(x0, y0, x1, y1, muroId) {
        const casillas = [];
        for (let x = x0; x <= x1; x += 1) {
            casillas.push({ x, y: y0 }, { x, y: y1 });
        }
        for (let y = y0 + 1; y < y1; y += 1) {
            casillas.push({ x: x0, y }, { x: x1, y });
        }
        P.pintarMuro(this.m, this.idx, this.muros.get('otsp-' + muroId), casillas, this.z);
    }

    muroLinea(casillas, muroId) {
        P.pintarMuro(this.m, this.idx, this.muros.get('otsp-' + muroId), casillas, this.z);
    }

    puerta(x, y) {
        return P.ponerHueco(this.m, this.idx, x, y, this.z, 'puerta');
    }

    ventana(x, y) {
        return P.ponerHueco(this.m, this.idx, x, y, this.z, 'ventana');
    }

    casaDe(x0, y0, x1, y1, houseId) {
        for (let y = y0; y <= y1; y += 1) {
            for (let x = x0; x <= x1; x += 1) {
                const tile = this.m.editableTile(x, y, this.z);
                tile.houseId = houseId;
                this.m.markDirty(x, y, this.z);
            }
        }
    }

    /** Pone los bordes de la hierba en todo lo construido. */
    borderizar() {
        P.borderizarArea(this.m, this.idx, 0, 0, this.m.width - 1, this.m.height - 1, Z);
    }

    casillas() {
        return this.m.edits().filter((e) => e.ground !== undefined || e.items || e.flags || e.houseId);
    }
}

// ---------------------------------------------------------------------------
// Las piezas: cada una se usa en el mapa y se guarda como compuesto
// ---------------------------------------------------------------------------

/** Una habitación de muro con puerta al sur y ventana al este. (x0,y0) es la esquina NO. */
export function habitacion(obra, x0, y0, ancho, alto, muro, suelo) {
    const x1 = x0 + ancho;
    const y1 = y0 + alto;
    obra.sueloRect(x0, y0, x1, y1, suelo || SUELOS.madera);
    obra.muroRect(x0, y0, x1, y1, muro);
    const puerta = { x: x0 + Math.floor(ancho / 2), y: y1 };
    obra.puerta(puerta.x, puerta.y);
    const def = MUROS.find((m) => m.id === muro);
    if (def && def.ventanas) {
        obra.ventana(x1, y0 + Math.floor(alto / 2));
        obra.ventana(x0 + 1, y0);
    }
    return { x1, y1, puerta };
}

/** Una casa amueblada: dormitorio y cocina en una sola sala. */
export function casa(obra, x0, y0, muro, suelo) {
    const { x1, y1, puerta } = habitacion(obra, x0, y0, 7, 6, muro, suelo);
    obra.objeto(x0 + 1, y0 + 1, MUEBLES.estanteria);
    obra.objeto(x0 + 3, y0 + 1, MUEBLES.librero);
    obra.objeto(x1 - 1, y0 + 1, MUEBLES.cofre);
    obra.objeto(x0 + 3, y0 + 3, MUEBLES.mesa);
    obra.objeto(x0 + 2, y0 + 3, MUEBLES.sillaE);
    obra.objeto(x0 + 4, y0 + 3, MUEBLES.sillaO);
    obra.objeto(x1 - 1, y1 - 1, MUEBLES.barril);
    obra.objeto(x0 + 1, y1 - 1, MUEBLES.maceta);
    return { x1, y1, puerta, interior: [x0 + 1, y0 + 1, x1 - 1, y1 - 1] };
}

/** La tienda: mostrador de cajas y sacos. */
export function tienda(obra, x0, y0, muro) {
    const { x1, y1, puerta } = habitacion(obra, x0, y0, 7, 5, muro, SUELOS.madera_clara);
    [MUEBLES.caja, MUEBLES.cajas, MUEBLES.cajon].forEach((id, i) => obra.objeto(x0 + 1 + i, y0 + 1, id));
    obra.objeto(x1 - 1, y0 + 1, MUEBLES.barril);
    obra.objeto(x1 - 2, y0 + 1, MUEBLES.saco);
    obra.objeto(x1 - 1, y1 - 1, MUEBLES.fardo);
    return { x1, y1, puerta, mostrador: { x: x0 + 3, y: y0 + 2 } };
}

/** El templo: nave de mármol con pasillo rojo, columnas, estatuas y altar. */
export function templo(obra, x0, y0) {
    const ancho = 14;
    const alto = 11;
    const x1 = x0 + ancho;
    const y1 = y0 + alto;
    obra.sueloRect(x0, y0, x1, y1, SUELOS.marmol);
    const cx = x0 + Math.floor(ancho / 2);
    obra.sueloRect(cx - 1, y0 + 1, cx + 1, y1, SUELOS.rojo);
    obra.muroRect(x0, y0, x1, y1, 'marmol');
    obra.puerta(cx, y1);
    for (let y = y0 + 3; y < y1 - 1; y += 3) {
        obra.objeto(x0 + 3, y, MUEBLES.columna);
        obra.objeto(x1 - 2, y, MUEBLES.columna);
    }
    obra.objeto(cx - 3, y0 + 2, MUEBLES.estatua1);
    obra.objeto(cx + 4, y0 + 2, MUEBLES.estatua2);
    obra.objeto(cx + 1, y0 + 2, MUEBLES.fuente);
    obra.objeto(cx - 2, y1 - 1, MUEBLES.maceta);
    obra.objeto(cx + 2, y1 - 1, MUEBLES.maceta);
    return { x1, y1, centro: { x: cx, y: y0 + 5 }, puerta: { x: cx, y: y1 } };
}

/** La fuente del parque, con flores alrededor. Centro en (x, y). */
export function fuente(obra, x, y) {
    obra.sueloRect(x - 2, y - 2, x + 1, y + 1, SUELOS.adoquin);
    obra.objeto(x, y, MUEBLES.fuente);
    [[-2, -2], [1, -2], [-2, 1], [1, 1]].forEach(([dx, dy]) => obra.objeto(x + dx, y + dy, obra.elegir(ADORNOS.flores)));
}

/** Un estanque con nenúfares y juncos. (x0, y0) es la esquina NO. */
export function estanque(obra, x0, y0, ancho, alto) {
    obra.sueloRect(x0, y0, x0 + ancho - 1, y0 + alto - 1, SUELOS.agua);
    obra.objeto(x0 + 1, y0 + 1, ADORNOS.nenufares[0]);
    if (ancho > 3) {
        obra.objeto(x0 + ancho - 2, y0 + alto - 2, ADORNOS.nenufares[1]);
    }
}

export function arboleda(obra, x, y, rnd) {
    [[0, 0], [2, 1], [-1, 2], [1, 3], [3, 3]].forEach(([dx, dy]) => obra.objeto(x + dx, y + dy, obra.elegir(ADORNOS.arboles)));
    if (rnd) {
        obra.objeto(x + 1, y + 1, obra.elegir(ADORNOS.setas));
    }
}

export function macizo(obra, x, y) {
    for (let dy = 0; dy < 3; dy += 1) {
        for (let dx = 0; dx < 3; dx += 1) {
            obra.objeto(x + dx, y + dy, obra.elegir(ADORNOS.flores));
        }
    }
}

export function huerto(obra, x, y) {
    for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 3; dx += 1) {
            obra.objeto(x + dx * 2, y + dy * 2, obra.elegir(ADORNOS.frutales));
        }
    }
}

export function mercado(obra, x, y) {
    obra.sueloRect(x, y, x + 4, y + 2, SUELOS.adoquin);
    [MUEBLES.caja, MUEBLES.barril, MUEBLES.saco, MUEBLES.cajas, MUEBLES.fardo].forEach((id, i) => obra.objeto(x + i, y, id));
    obra.objeto(x + 1, y + 2, MUEBLES.barril);
    obra.objeto(x + 3, y + 2, MUEBLES.cajon);
}

export function campamento(obra, x, y) {
    obra.sueloRect(x - 2, y - 2, x + 2, y + 2, SUELOS.tierra);
    obra.objeto(x, y, MUEBLES.lena);
    obra.objeto(x - 2, y - 1, ADORNOS.troncos[2]);
    obra.objeto(x + 2, y + 1, ADORNOS.troncos[0]);
    obra.objeto(x + 1, y - 2, obra.elegir(ADORNOS.rocas));
    obra.objeto(x - 1, y + 2, obra.elegir(ADORNOS.rocas));
}

export function ruinas(obra, x0, y0) {
    obra.sueloRect(x0, y0, x0 + 6, y0 + 5, SUELOS.piedra);
    obra.muroLinea([{ x: x0, y: y0 }, { x: x0 + 1, y: y0 }, { x: x0 + 2, y: y0 }, { x: x0, y: y0 + 1 },
        { x: x0, y: y0 + 2 }, { x: x0 + 5, y: y0 }, { x: x0 + 6, y: y0 }, { x: x0 + 6, y: y0 + 1 }], 'piedra-negra');
    obra.objeto(x0 + 3, y0 + 3, MUEBLES.cristal);
    obra.objeto(x0 + 1, y0 + 4, MUEBLES.telarana);
    obra.objeto(x0 + 5, y0 + 4, obra.elegir(ADORNOS.rocas));
}

// ---------------------------------------------------------------------------
// Los compuestos
// ---------------------------------------------------------------------------

/** Construye una pieza en una obra vacía y la captura como compuesto. */
function capturar(items, pinceles, nombre, categoria, descripcion, construir) {
    const obra = new Obra(items, pinceles, 40, 40, 11);
    construir(obra);
    const casillas = obra.casillas().filter((c) => c.items || c.ground !== o(SUELOS.hierba[0]))
        .map((c) => ({ x: c.x, y: c.y, z: c.z, ground: c.ground === undefined ? null : c.ground, items: c.items || [] }));
    const plantilla = desdeCasillas(casillas, { nombre, categoria });
    plantilla.id = 'otsp-' + plantilla.id;
    plantilla.descripcion = descripcion;
    return plantilla;
}

export function compuestosOtsp(items, pinceles) {
    const lista = [];
    const c = (...args) => lista.push(capturar(items, pinceles, ...args));

    MUROS.forEach((m) => {
        c('Muro ' + m.nombre + ': tramo horizontal', 'OTSP · Muros', 'Seis casillas de muro de este a oeste.',
            (obra) => obra.muroLinea([0, 1, 2, 3, 4, 5].map((i) => ({ x: 10 + i, y: 10 })), m.id));
        c('Muro ' + m.nombre + ': tramo vertical', 'OTSP · Muros', 'Seis casillas de muro de norte a sur.',
            (obra) => obra.muroLinea([0, 1, 2, 3, 4, 5].map((i) => ({ x: 10, y: 10 + i })), m.id));
        c('Muro ' + m.nombre + ': esquina', 'OTSP · Muros', 'Esquina en L de cuatro por cuatro.',
            (obra) => obra.muroLinea([{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 },
                { x: 10, y: 11 }, { x: 10, y: 12 }, { x: 10, y: 13 }], m.id));
        c('Habitación de ' + m.nombre, 'OTSP · Habitaciones', 'Sala de 5x4 con tarima, puerta al sur' +
            (m.ventanas ? ' y ventanas.' : '.'), (obra) => habitacion(obra, 10, 10, 6, 5, m.id));
    });

    c('Casa de estuco crema', 'OTSP · Edificios', 'Casa amueblada: estantería, librero, cofre, mesa con sillas, barril.',
        (obra) => casa(obra, 10, 10, 'crema'));
    c('Casa de madera oscura', 'OTSP · Edificios', 'Casa amueblada de madera.', (obra) => casa(obra, 10, 10, 'madera-oscura'));
    c('Casa de piedra tallada', 'OTSP · Edificios', 'Casa amueblada de piedra.', (obra) => casa(obra, 10, 10, 'piedra-tallada', SUELOS.losa));
    c('Tienda', 'OTSP · Edificios', 'Tienda de estuco amarillo con mostrador de cajas.', (obra) => tienda(obra, 10, 10, 'amarillo'));
    c('Templo', 'OTSP · Edificios', 'Templo de mármol: pasillo rojo, columnas, estatuas y fuente.', (obra) => templo(obra, 5, 5));
    c('Ruinas', 'OTSP · Edificios', 'Muros rotos de piedra negra con un cristal.', (obra) => ruinas(obra, 10, 10));

    c('Fuente', 'OTSP · Parque', 'Fuente sobre adoquín con flores en las esquinas.', (obra) => fuente(obra, 12, 12));
    c('Estanque', 'OTSP · Parque', 'Estanque de 5x4 con nenúfares.', (obra) => estanque(obra, 10, 10, 5, 4));
    c('Macizo de flores', 'OTSP · Parque', 'Tres por tres de flores variadas.', (obra) => macizo(obra, 10, 10));
    c('Arboleda', 'OTSP · Naturaleza', 'Cinco árboles grandes y una seta.', (obra) => arboleda(obra, 10, 10, true));
    c('Huerto de frutales', 'OTSP · Naturaleza', 'Seis frutales en dos filas.', (obra) => huerto(obra, 10, 10));
    c('Árboles en flor', 'OTSP · Naturaleza', 'Un cerezo y un almendro.', (obra) => {
        obra.objeto(10, 10, ADORNOS.arbolesEnFlor[0]);
        obra.objeto(12, 11, ADORNOS.arbolesEnFlor[1]);
    });
    c('Rocas', 'OTSP · Naturaleza', 'Un grupo de rocas y piedras.', (obra) => {
        ADORNOS.rocas.slice(0, 3).forEach((id, i) => obra.objeto(10 + i, 10 + (i % 2), id));
        obra.objeto(11, 12, ADORNOS.piedras[0]);
    });
    c('Puesto de mercado', 'OTSP · Ciudad', 'Cajas, barriles y sacos sobre adoquín.', (obra) => mercado(obra, 10, 10));
    c('Campamento', 'OTSP · Ciudad', 'Hoguera con troncos y rocas.', (obra) => campamento(obra, 12, 12));
    c('Comedor', 'OTSP · Muebles', 'Mesa con dos sillas.', (obra) => {
        obra.objeto(11, 10, MUEBLES.mesa);
        obra.objeto(10, 10, MUEBLES.sillaE);
        obra.objeto(12, 10, MUEBLES.sillaO);
    });
    c('Almacén', 'OTSP · Muebles', 'Cajas, barril y sacos.', (obra) => {
        [MUEBLES.caja, MUEBLES.cajas, MUEBLES.barril, MUEBLES.saco].forEach((id, i) => obra.objeto(10 + (i % 2), 10 + Math.floor(i / 2), id));
    });

    return lista;
}

export function mezclarCompuestos(crudo, nuevos) {
    const ids = new Set(nuevos.map((t) => t.id));
    return { ...crudo, compuestos: (crudo.compuestos || []).filter((t) => !ids.has(t.id) && !String(t.id).startsWith('otsp-')).concat(nuevos) };
}

// ---------------------------------------------------------------------------
// El mapa
// ---------------------------------------------------------------------------

export const ANCHO = 112;
export const ALTO = 96;

export function mapaJetyum(items, pinceles) {
    const obra = new Obra(items, pinceles, ANCHO, ALTO, 1987);
    const rnd = obra.rnd;

    // 1. La hierba con sus variantes, y algo de vida: hierbas y flores sueltas.
    for (let y = 0; y < ALTO; y += 1) {
        for (let x = 0; x < ANCHO; x += 1) {
            const r = rnd();
            if (r < 0.25) {
                obra.suelo(x, y, obra.elegir(SUELOS.hierba.slice(1)));
            }
        }
    }

    // 2. Los caminos de tierra: de la plaza a las cuatro salidas.
    const plaza = { x0: 46, y0: 38, x1: 65, y1: 51 };
    obra.sueloRect(54, 0, 57, plaza.y0, SUELOS.tierra);           // norte
    obra.sueloRect(54, plaza.y1, 57, ALTO - 1, SUELOS.tierra);    // sur
    obra.sueloRect(0, 43, plaza.x0, 46, SUELOS.tierra);           // oeste
    obra.sueloRect(plaza.x1, 43, ANCHO - 1, 46, SUELOS.tierra);   // este
    obra.sueloRect(28, 46, 31, 70, SUELOS.tierra);                // al barrio oeste
    obra.sueloRect(65, 60, 90, 62, SUELOS.tierra);                // al parque

    // 3. La plaza de adoquín, con el mercado.
    obra.sueloRect(plaza.x0, plaza.y0, plaza.x1, plaza.y1, SUELOS.adoquin);
    mercado(obra, 59, 46);

    // 4. El templo, al norte de la plaza. Es el punto de reaparición y zona protegida.
    const t = templo(obra, 48, 24);
    obra.sueloRect(t.puerta.x - 1, t.y1 + 1, t.puerta.x + 1, plaza.y0, SUELOS.adoquin);
    obra.zonaProtegida(48, 24, t.x1, t.y1);
    obra.zonaProtegida(plaza.x0, plaza.y0, plaza.x1, plaza.y1);

    // 5. Las casas del barrio oeste (alquilables: casillas de casa y salida).
    const casas = [];
    [['crema', 18, 30], ['madera-oscura', 32, 30], ['piedra-tallada', 18, 52], ['crema', 33, 52]].forEach(([muro, x, y], i) => {
        const c = casa(obra, x, y, muro, muro === 'piedra-tallada' ? SUELOS.losa : SUELOS.madera);
        const id = i + 1;
        obra.casaDe(c.interior[0], c.interior[1], c.interior[2], c.interior[3], id);
        // la puerta también es de la casa, y la salida es la casilla de fuera
        obra.casaDe(c.puerta.x, c.puerta.y, c.puerta.x, c.puerta.y, id);
        obra.sueloRect(c.puerta.x, c.puerta.y + 1, c.puerta.x, c.puerta.y + 2, SUELOS.tierra);
        casas.push({ id, name: ['Casa del Olmo', 'Casa del Roble', 'Casa de Piedra', 'Casa del Pozo'][i], townId: 1,
            rent: 500 + i * 250, exit: [c.puerta.x, c.puerta.y + 1, Z] });
    });
    obra.sueloRect(18, 39, 43, 41, SUELOS.tierra); // calle entre casas
    obra.sueloRect(18, 61, 43, 63, SUELOS.tierra);

    // 6. La tienda y la herrería, al este de la plaza.
    const tiendaE = tienda(obra, 70, 32, 'amarillo');
    obra.sueloRect(tiendaE.puerta.x, tiendaE.puerta.y + 1, tiendaE.puerta.x, 43, SUELOS.tierra);
    const herreria = habitacion(obra, 82, 32, 6, 5, 'roca', SUELOS.piedra);
    obra.objeto(84, 34, MUEBLES.yunque);
    obra.objeto(86, 34, MUEBLES.barril);
    obra.objeto(83, 36, MUEBLES.lena);
    obra.sueloRect(herreria.puerta.x, herreria.puerta.y + 1, herreria.puerta.x, 43, SUELOS.tierra);

    // 7. El banco: una casa de mármol en la plaza sur.
    const banco = habitacion(obra, 46, 54, 6, 4, 'marmol', SUELOS.marmol);
    obra.objeto(49, 56, MUEBLES.cofre);
    obra.objeto(47, 55, MUEBLES.estanteria);

    // 8. El parque, al sureste: grava, fuente, estanque, flores, árboles y bancos.
    const parque = { x0: 72, y0: 56, x1: 104, y1: 84 };
    obra.sueloRect(parque.x0 + 2, 60, parque.x1 - 2, 62, SUELOS.grava);
    obra.sueloRect(86, parque.y0 + 2, 88, parque.y1 - 2, SUELOS.grava);
    fuente(obra, 88, 62);
    estanque(obra, 93, 70, 7, 5);
    macizo(obra, 76, 65);
    macizo(obra, 79, 74);
    macizo(obra, 97, 57);
    [[74, 57], [80, 57], [92, 57], [76, 69], [82, 66], [84, 78], [99, 79], [92, 79], [101, 63], [77, 80]].forEach(([x, y]) =>
        obra.objeto(x, y, obra.elegir(ADORNOS.arboles)));
    obra.objeto(90, 66, ADORNOS.arbolesEnFlor[0]);
    obra.objeto(84, 70, ADORNOS.arbolesEnFlor[1]);
    [[83, 64], [91, 64], [85, 74], [91, 75]].forEach(([x, y], i) => obra.objeto(x, y, i % 2 ? MUEBLES.sillaS : MUEBLES.sillaN));
    [[96, 68], [100, 69], [92, 76]].forEach(([x, y]) => obra.objeto(x, y, obra.elegir(ADORNOS.matas)));
    obra.zonaProtegida(parque.x0, parque.y0, parque.x1, parque.y1);

    // 9. Fuera de la ciudad.
    //    Granja al noreste: huerto y cerdos.
    huerto(obra, 80, 12);
    huerto(obra, 88, 12);
    //    Bosque al noroeste, con ruinas de ocultistas dentro.
    for (let k = 0; k < 9; k += 1) {
        arboleda(obra, 4 + (k % 3) * 9, 4 + Math.floor(k / 3) * 7, rnd() < 0.5);
    }
    ruinas(obra, 30, 6);
    //    Campamento goblin al suroeste.
    campamento(obra, 12, 82);
    obra.sueloRect(10, 78, 16, 90, SUELOS.tierra);
    //    El lago del sur, con el pescador.
    estanque(obra, 40, 80, 12, 8);
    obra.sueloRect(38, 79, 53, 79, SUELOS.arena);
    obra.sueloRect(38, 88, 53, 88, SUELOS.arena);
    //    Rocas y troncos sueltos para que el campo no esté vacío.
    for (let k = 0; k < 70; k += 1) {
        const x = Math.floor(rnd() * ANCHO);
        const y = Math.floor(rnd() * ALTO);
        const tile = obra.m.tileAt(x, y, Z);
        const enCiudad = x > 14 && x < 106 && y > 20 && y < 88;
        if (enCiudad || (tile && (tile.items.length || (tile.ground && tile.ground !== o(SUELOS.hierba[0]) && !SUELOS.hierba.map(o).includes(tile.ground))))) {
            continue;
        }
        const familia = rnd() < 0.4 ? ADORNOS.flores : rnd() < 0.5 ? ADORNOS.hierbas : rnd() < 0.5 ? ADORNOS.piedras : ADORNOS.troncos;
        obra.objeto(x, y, obra.elegir(familia));
    }

    // 10. PLANTAS: una torre con piso alto (planta 6), una bodega y una cueva (planta 8).
    //     Las escaleras siguen la regla `floorchange` de TFS (data/scripts/movements/tiles/
    //     floorchange.js): bajar por (x, y, 7) lleva a (x, y, 8) y, si ahí hay una escalera de
    //     subida hacia el norte, se aparece una casilla al sur; subir por ella lleva a (x, y-1, 7).
    const torre = { x0: 64, y0: 22, x1: 72, y1: 29 };
    obra.sueloRect(torre.x0, torre.y0, torre.x1, torre.y1, SUELOS.madera);
    obra.muroRect(torre.x0, torre.y0, torre.x1, torre.y1, 'piedra-gris');
    obra.puerta(68, torre.y1);
    obra.ventana(torre.x1, 25);
    obra.sueloRect(68, torre.y1 + 1, 68, 43, SUELOS.tierra);
    obra.objeto(70, 25, ESCALERAS.subirNorte);           // sube a (70, 24, 6)
    obra.objeto(65, 23, MUEBLES.estanteria);
    obra.objeto(66, 27, MUEBLES.mesa);
    obra.objeto(65, 27, MUEBLES.sillaE);
    obra.z = 6;
    obra.sueloRect(torre.x0, torre.y0, torre.x1, torre.y1, SUELOS.madera);
    obra.muroRect(torre.x0, torre.y0, torre.x1, torre.y1, 'piedra-gris');
    obra.ventana(torre.x1, 25);
    obra.ventana(67, torre.y1);
    obra.suelo(70, 25, ESCALERAS.bajar);                  // baja a (70, 26, 7)
    obra.objeto(65, 23, MUEBLES.librero);
    obra.objeto(66, 23, MUEBLES.estanteria);
    obra.objeto(68, 26, MUEBLES.cristal);
    obra.objeto(65, 28, MUEBLES.cofre);
    obra.objeto(71, 28, MUEBLES.estatua3);
    obra.z = Z;

    //     La bodega, bajo la Casa de Piedra (interior 19-24, 53-57).
    obra.suelo(24, 56, ESCALERAS.bajar);                  // baja a (24, 57, 8)
    obra.z = 8;
    obra.sueloRect(17, 51, 26, 60, SUELOS.losa);
    obra.muroRect(17, 51, 26, 60, 'piedra-oscura');
    obra.objeto(24, 56, ESCALERAS.subirNorte);           // sube a (24, 55, 7)
    [[18, 52, MUEBLES.barril], [19, 52, MUEBLES.barril], [20, 52, MUEBLES.cajas], [18, 59, MUEBLES.caja],
        [21, 59, MUEBLES.saco], [25, 52, MUEBLES.telarana], [22, 55, MUEBLES.lena]].forEach(([x, y, id]) => obra.objeto(x, y, id));
    obra.z = Z;

    //     La cueva, bajo el bosque: se entra por un agujero y se sale por una escalera de mano.
    const cueva = { x0: 8, y0: 10, x1: 40, y1: 34 };
    obra.sueloRect(25, 23, 27, 25, SUELOS.tierra);
    obra.suelo(26, 24, ESCALERAS.agujero);                 // cae a (26, 24, 8)
    obra.z = 8;
    obra.sueloRect(cueva.x0, cueva.y0, cueva.x1, cueva.y1, SUELOS.tierra);
    obra.muroRect(cueva.x0, cueva.y0, cueva.x1, cueva.y1, 'roca');
    // Pilares de roca dentro, para que no sea una sala vacía.
    [[14, 15], [15, 15], [20, 28], [21, 28], [31, 14], [31, 15], [34, 26], [12, 30]].forEach(([x, y]) =>
        obra.muroLinea([{ x, y }], 'roca'));
    for (let k = 0; k < 40; k += 1) {
        const x = cueva.x0 + 1 + Math.floor(rnd() * (cueva.x1 - cueva.x0 - 1));
        const y = cueva.y0 + 1 + Math.floor(rnd() * (cueva.y1 - cueva.y0 - 1));
        const tile = obra.m.tileAt(x, y, 8);
        if (tile && tile.items.length === 0 && Math.abs(x - 26) + Math.abs(y - 24) > 2 && Math.abs(x - 36) + Math.abs(y - 31) > 2) {
            obra.objeto(x, y, obra.elegir(k % 3 ? ADORNOS.piedras : ADORNOS.rocas));
        }
    }
    obra.objeto(36, 31, ESCALERAS.mano);                  // sube a (36, 32, 7)
    obra.objeto(18, 20, MUEBLES.cristal);
    obra.objeto(33, 20, MUEBLES.telarana);
    obra.z = Z;
    obra.sueloRect(35, 31, 37, 33, SUELOS.tierra);

    // 11. Los bordes de la hierba sobre todo lo que no es hierba.
    obra.borderizar();

    const temploPos = [t.centro.x, t.centro.y + 2, Z];
    return {
        format: 'jetyum-map',
        version: 1,
        name: 'jetyum',
        width: ANCHO,
        height: ALTO,
        floors: 16,
        _comment: [
            'Jetyum, con el arte del OpenTibia Sprite Pack (CC BY 4.0, ver docs/CREDITOS.md).',
            'GENERADO por tools/generar-mundo-otsp.mjs: se puede editar en el editor de mapas, pero',
            'si se vuelve a generar se pierden los cambios hechos a mano.'
        ],
        defaultGround: { [Z]: o(SUELOS.hierba[0]) },
        fallbackGround: o(SUELOS.hierba[0]),
        tiles: obra.casillas(),
        waypoints: {
            temple: temploPos,
            plaza: [55, 45, Z],
            barrio: [26, 41, Z],
            tienda: [tiendaE.mostrador.x, tiendaE.mostrador.y + 1, Z],
            herreria: [85, 35, Z],
            parque: [88, 64, Z],
            lago: [46, 79, Z],
            bosque: [20, 14, Z],
            granja: [86, 18, Z],
            campamento: [12, 86, Z],
            ruinas: [33, 10, Z],
            torre: [68, 27, Z],
            'torre-arriba': [69, 24, 6],
            bodega: [23, 58, 8],
            cueva: [26, 26, Z],
            'cueva-dentro': [26, 26, 8]
        },
        towns: [{ id: 1, name: 'Jetyum', temple: temploPos }],
        houses: casas,
        spawns: [
            { x: 86, y: 18, z: Z, radius: 5, interval: 30000, monsters: [{ name: 'Pig' }, { name: 'Pig' }, { name: 'Cat' }] },
            { x: 100, y: 10, z: Z, radius: 4, interval: 30000, monsters: [{ name: 'Crow' }, { name: 'Crow' }] },
            { x: 14, y: 85, z: Z, radius: 5, interval: 45000, monsters: [{ name: 'Goblin' }, { name: 'Goblin' }, { name: 'Goblin' }] },
            { x: 14, y: 12, z: Z, radius: 5, interval: 45000, monsters: [{ name: 'Coleoptera' }, { name: 'Scolopendra' }] },
            { x: 23, y: 22, z: Z, radius: 4, interval: 45000, monsters: [{ name: 'Vespidae' }, { name: 'Vespidae' }] },
            { x: 33, y: 9, z: Z, radius: 3, interval: 60000, monsters: [{ name: 'Occultist' }, { name: 'Wraith' }] },
            { x: 104, y: 30, z: Z, radius: 4, interval: 60000, monsters: [{ name: 'Domestic Bear' }] },
            { x: 104, y: 90, z: Z, radius: 4, interval: 60000, monsters: [{ name: 'Mechanical Boar' }] },
            { x: 62, y: 90, z: Z, radius: 4, interval: 60000, monsters: [{ name: 'Lizardman' }, { name: 'Lizardman' }] },
            { x: 16, y: 16, z: 8, radius: 4, interval: 45000, monsters: [{ name: 'Scolopendra' }, { name: 'Coleoptera' }] },
            { x: 32, y: 28, z: 8, radius: 4, interval: 60000, monsters: [{ name: 'Lizardman' }, { name: 'Scolopendra' }] }
        ],
        npcs: [
            { x: t.puerta.x + 2, y: t.puerta.y + 1, z: Z, name: 'Guia' },
            { x: t.centro.x, y: t.centro.y - 2, z: Z, name: 'Sanador', radius: 1 },
            { x: tiendaE.mostrador.x, y: tiendaE.mostrador.y, z: Z, name: 'Tendero' },
            { x: 85, y: 36, z: Z, name: 'Herrero', radius: 1 },
            { x: 49, y: 57, z: Z, name: 'Banquero' },
            { x: 56, y: 70, z: Z, name: 'Guardia', radius: 2 },
            { x: 88, y: 66, z: Z, name: 'Anciano', radius: 2 },
            { x: 45, y: 78, z: Z, name: 'Pescador', radius: 2 }
        ]
    };
}

// ---------------------------------------------------------------------------

export function generar(opciones) {
    const salida = (opciones && opciones.salida) || RAIZ;
    const datos = (f) => path.join(salida, 'data', ...f);
    const items = Xml.loadItems(path.join(RAIZ, 'data', 'items', 'items.xml'));

    const crudo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'editor', 'pinceles.json'), 'utf8'));
    const mezclado = mezclarPinceles(crudo, pincelesOtsp());
    const { data: pinceles, problemas } = P.normalizarPinceles(mezclado, items);
    if (problemas.length) {
        throw new Error('pinceles no válidos: ' + problemas.slice(0, 5).join('; '));
    }

    const compuestos = compuestosOtsp(items, pinceles);
    const crudoC = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'editor', 'compuestos.json'), 'utf8'));
    const mezcladoC = mezclarCompuestos(crudoC, compuestos);
    const { problemas: pc } = normalizarCompuestos(mezcladoC, items);
    if (pc.length) {
        throw new Error('compuestos no válidos: ' + pc.slice(0, 5).join('; '));
    }

    const mapa = mapaJetyum(items, pinceles);

    fs.mkdirSync(datos(['editor']), { recursive: true });
    fs.mkdirSync(datos(['world']), { recursive: true });
    fs.writeFileSync(datos(['editor', 'pinceles.json']), JSON.stringify(mezclado, null, 2) + '\n');
    fs.writeFileSync(datos(['editor', 'compuestos.json']), serializar(mezcladoC));
    fs.writeFileSync(datos(['world', 'jetyum.map.json']), JSON.stringify(mapa) + '\n');
    return { pinceles: pincelesOtsp(), compuestos: compuestos.length, casillas: mapa.tiles.length, mapa };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const i = process.argv.indexOf('--salida');
    const r = generar({ salida: i >= 0 ? process.argv[i + 1] : null });
    console.log('pinceles: ' + r.pinceles.suelos.length + ' suelos, ' + r.pinceles.muros.length + ' muros');
    console.log('compuestos: ' + r.compuestos);
    console.log('mapa jetyum: ' + ANCHO + 'x' + ALTO + ', ' + r.casillas + ' casillas, ' +
        r.mapa.spawns.length + ' respawns, ' + r.mapa.npcs.length + ' NPC, ' + r.mapa.houses.length + ' casas');
}
