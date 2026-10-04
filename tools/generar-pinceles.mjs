/**
 * GENERA EL ARTE Y LAS DEFINICIONES DE LOS PINCELES DE PRUEBA: bordes de suelo y muros.
 *
 *     node tools/generar-pinceles.mjs
 *
 * Los pinceles de terreno con bordes y los de muro (los `grounds.xml`, `borders.xml` y
 * `walls.xml` de RME) necesitan sprites que no estaban: las doce piezas de borde de
 * cada suelo y las piezas de un muro. Esta herramienta las DIBUJA a partir de los suelos que sí
 * hay —recorta la hierba con una máscara de borde irregular— y deja todo dado de alta:
 *
 *   - los sprites, en la biblioteca (deduplicados: ejecutarla dos veces no duplica nada);
 *   - los objetos, en `data/items/items.xml` (4500+ bordes, 4600+ muros);
 *   - las cosas, en `things.json`;
 *   - los pinceles, en `data/editor/pinceles.json`.
 *
 * Es arte de demostración: sirve para que los pinceles funcionen y se vean. Cuando haya arte
 * propio, se reemplazan los sprites en la pestaña Sprites y los pinceles siguen igual.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as A from '../shared/js/assets.mjs';
import { PIEZAS_DE_BORDE, PIEZAS_DE_ALFOMBRA, PIEZAS_DE_MESA, FORMATO_PINCELES } from '../editor/js/pinceles.js';

const require = createRequire(import.meta.url);
const { AssetStore } = require('../editor/lib/assetstore.js');
const ItemsFile = require('../editor/lib/itemsfile.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = A.SPRITE_SIZE;

function argumento(nombre) {
    const i = process.argv.indexOf(nombre);
    return i >= 0 ? process.argv[i + 1] : null;
}

/** Un ruido determinista, para que el borde sea irregular pero igual en cada ejecución. */
function ruido(n, semilla) {
    const x = Math.sin(n * 12.9898 + semilla * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

/** La profundidad del borde en la posición t (0..31) de un lado: entre 6 y 11 píxeles. */
function profundidad(t, semilla) {
    return 8 + 2.2 * Math.sin(t * 0.55 + semilla) + 1.4 * (ruido(t, semilla) - 0.5);
}

/**
 * ¿El píxel (x, y) pertenece a la pieza de borde? `n` es la banda de arriba, `cnw` la esquina
 * exterior de arriba a la izquierda y `dnw` la interior (arriba + izquierda).
 */
export function dentroDeLaPieza(pieza, x, y, semilla) {
    const banda = (lado) => {
        if (lado === 'n') { return y < profundidad(x, semilla); }
        if (lado === 's') { return S - 1 - y < profundidad(x, semilla + 1); }
        if (lado === 'w') { return x < profundidad(y, semilla + 2); }
        if (lado === 'e') { return S - 1 - x < profundidad(y, semilla + 3); }
        return false;
    };
    const esquina = (cx, cy) => {
        const d = Math.hypot(x - cx, y - cy);
        return d < 9 + 2 * ruido(x * 31 + y, semilla);
    };
    switch (pieza) {
        case 'n': case 's': case 'e': case 'w':
            return banda(pieza);
        case 'cnw': return esquina(0, 0);
        case 'cne': return esquina(S - 1, 0);
        case 'csw': return esquina(0, S - 1);
        case 'cse': return esquina(S - 1, S - 1);
        case 'dnw': return banda('n') || banda('w');
        case 'dne': return banda('n') || banda('e');
        case 'dsw': return banda('s') || banda('w');
        case 'dse': return banda('s') || banda('e');
        default: return false;
    }
}

/** Recorta un suelo con la máscara de una pieza, con una línea más oscura en el filo. */
function piezaDeBorde(suelo, pieza, semilla) {
    const salida = Buffer.alloc(A.SPRITE_BYTES);
    for (let y = 0; y < S; y += 1) {
        for (let x = 0; x < S; x += 1) {
            if (!dentroDeLaPieza(pieza, x, y, semilla)) {
                continue;
            }
            const filo = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
                const nx = x + dx;
                const ny = y + dy;
                return nx >= 0 && ny >= 0 && nx < S && ny < S && !dentroDeLaPieza(pieza, nx, ny, semilla);
            });
            const o = (y * S + x) * 4;
            const f = filo ? 0.7 : 1;
            salida[o] = suelo[o] * f;
            salida[o + 1] = suelo[o + 1] * f;
            salida[o + 2] = suelo[o + 2] * f;
            salida[o + 3] = 255;
        }
    }
    return salida;
}

function lienzoVacio() {
    const salida = Buffer.alloc(A.SPRITE_BYTES);
    const pon = (x, y, r, g, b, a) => {
        if (x < 0 || y < 0 || x >= S || y >= S) {
            return;
        }
        const o = (y * S + x) * 4;
        salida[o] = Math.max(0, Math.min(255, r)); salida[o + 1] = Math.max(0, Math.min(255, g));
        salida[o + 2] = Math.max(0, Math.min(255, b)); salida[o + 3] = a === undefined ? 255 : a;
    };
    return { salida, pon };
}

/**
 * Un muro de ladrillo. Las bandas son las de Tibia: la horizontal corre de oeste a este y la
 * vertical de norte a sur; la ESQUINA une hacia el norte y hacia el oeste (es la de abajo a la
 * derecha de una habitación); el poste no une nada. `hueco` dibuja una puerta o una ventana.
 */
function piezaDeMuro(tipo, hueco) {
    const { salida, pon } = lienzoVacio();
    const ladrillo = (x, y) => {
        const fila = Math.floor(y / 6);
        const junta = y % 6 === 0 || (x + (fila % 2) * 6) % 12 === 0;
        const tono = 110 + Math.floor(ruido(x * 7 + y * 13, 3) * 30);
        return junta ? [70, 66, 62] : [tono, tono - 6, tono - 14];
    };
    /*
     * LA UNIÓN VA ABAJO A LA DERECHA. La tabla de Tibia solo une hacia el norte y el oeste: la
     * pieza de una casilla llega hasta sus vecinos de arriba y de la izquierda, y son los de abajo
     * y la derecha los que llegan hasta ella. Así que cada pieza tiene su «nudo» en la esquina de
     * abajo a la derecha (J = 18..32) y se alarga hacia el borde por el que une.
     */
    const J = 18;
    const rect = (x0, y0, x1, y1) => {
        for (let y = y0; y < y1; y += 1) {
            for (let x = x0; x < x1; x += 1) {
                const [r, g, b] = ladrillo(x, y);
                const arriba = y < J + 4 && y >= J;
                pon(x, y, arriba ? r + 40 : r, arriba ? g + 40 : g, arriba ? b + 40 : b);
            }
        }
    };
    if (tipo === 'horizontal') { rect(0, J, S, S); }
    if (tipo === 'vertical') { rect(J, 0, S, S); }
    if (tipo === 'esquina') { rect(0, J, S, S); rect(J, 0, S, S); }
    if (tipo === 'poste') { rect(J, J, S, S); }
    if (hueco) {
        const horizontal = tipo !== 'vertical';
        const [x0, y0, x1, y1] = horizontal ? [9, J + 2, 23, S] : [J + 2, 9, S, 23];
        for (let y = y0; y < y1; y += 1) {
            for (let x = x0; x < x1; x += 1) {
                if (hueco === 'puerta') {
                    const veta = (horizontal ? x : y) % 4 === 0;
                    pon(x, y, veta ? 90 : 128, veta ? 58 : 84, veta ? 30 : 44);
                } else {
                    const marco = x === x0 || y === y0 || x === x1 - 1 || y === y1 - 1 ||
                        x === Math.floor((x0 + x1) / 2) || y === Math.floor((y0 + y1) / 2);
                    pon(x, y, marco ? 92 : 120, marco ? 70 : 180, marco ? 40 : 230);
                }
            }
        }
    }
    return salida;
}

/** Una pieza de alfombra roja con ribete dorado en los lados que dan fuera de la alfombra. */
function piezaDeAlfombra(pieza) {
    const { salida, pon } = lienzoVacio();
    const fuera = {
        n: ['n', 'dnw', 'dne'].includes(pieza), s: ['s', 'dsw', 'dse'].includes(pieza),
        w: ['w', 'dnw', 'dsw'].includes(pieza), e: ['e', 'dne', 'dse'].includes(pieza)
    };
    const muesca = { cnw: [0, 0], cne: [S - 1, 0], csw: [0, S - 1], cse: [S - 1, S - 1] }[pieza];
    for (let y = 0; y < S; y += 1) {
        for (let x = 0; x < S; x += 1) {
            const margen = (fuera.n && y < 3) || (fuera.s && y > S - 4) || (fuera.w && x < 3) || (fuera.e && x > S - 4);
            if (margen) {
                continue;
            }
            const ribete = (fuera.n && y < 5) || (fuera.s && y > S - 6) || (fuera.w && x < 5) || (fuera.e && x > S - 6) ||
                (muesca && Math.abs(x - muesca[0]) < 5 && Math.abs(y - muesca[1]) < 5);
            const dibujo = (x + y) % 8 === 0 || (x - y + 64) % 8 === 0;
            if (ribete) {
                pon(x, y, 214, 170, 60);
            } else {
                pon(x, y, dibujo ? 150 : 170, dibujo ? 30 : 40, dibujo ? 40 : 50);
            }
        }
    }
    return salida;
}

/** Una pieza de mesa de madera: el tablero llega al borde por donde sigue la mesa. */
function piezaDeMesa(pieza) {
    const { salida, pon } = lienzoVacio();
    const sigue = {
        horizontal: { w: 1, e: 1 }, vertical: { n: 1, s: 1 }, fin_este: { w: 1 }, fin_oeste: { e: 1 },
        fin_sur: { n: 1 }, fin_norte: { s: 1 }, sola: {}
    }[pieza];
    const x0 = sigue.w ? 0 : 3;
    const x1 = sigue.e ? S : S - 3;
    const y0 = sigue.n ? 0 : 6;
    const y1 = sigue.s ? S : 24;
    for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
            const veta = Math.floor(ruido(y * 3 + Math.floor(x / 6), 9) * 20);
            const canto = !sigue.s && y > y1 - 4;
            pon(x, y, (canto ? 100 : 150) + veta, (canto ? 64 : 98) + veta, (canto ? 30 : 52) + veta);
        }
    }
    if (!sigue.s) {
        [[x0 + 2, y1], [x1 - 4, y1]].forEach(([px, py]) => {
            for (let y = py; y < Math.min(S, py + 6); y += 1) {
                for (let x = px; x < px + 2; x += 1) {
                    pon(x, y, 90, 56, 26);
                }
            }
        });
    }
    return salida;
}

function spriteDeCosa(store, things, id) {
    const cosa = things.items.find((t) => t.id === id);
    if (!cosa || !cosa.sprites[0]) {
        throw new Error('el suelo ' + id + ' no tiene sprite en things.json');
    }
    return store.getSprite(cosa.sprites[0]);
}

export function generar(opciones) {
    const opts = opciones || {};
    const assetsDir = opts.assetsDir || path.join(RAIZ, 'client', 'jetyum', 'assets');
    const itemsFile = opts.itemsFile || path.join(RAIZ, 'data', 'items', 'items.xml');
    const pincelesFile = opts.pincelesFile || path.join(RAIZ, 'data', 'editor', 'pinceles.json');

    const store = new AssetStore(assetsDir);
    const things = store.readThings();
    let xml = fs.readFileSync(itemsFile, 'utf8');
    const nuevos = [];

    const alta = (id, nombre, atributos, sprite, flags) => {
        xml = ItemsFile.saveItem(xml, { id, name: nombre, attributes: atributos }).xml;
        // Al regenerar se REESCRIBE el sprite que ya tenía (si solo lo usa este objeto), en vez de
        // añadir otro: así la biblioteca no se llena de versiones viejas.
        const previa = things.items.find((t) => t.id === id);
        const anterior = previa && previa.sprites[0];
        let spriteId;
        if (anterior && store.usage(anterior, things).length === 1) {
            store.setSprite(anterior, sprite);
            spriteId = anterior;
        } else {
            spriteId = store.addSprites([sprite]).ids[0];
        }
        const cosa = { id, name: nombre, width: 1, height: 1, exactSize: S, layers: 1,
            patternX: 1, patternY: 1, patternZ: 1, frames: 1,
            flags: { ...A.flagsFromServer(atributos), ...flags }, sprites: [spriteId] };
        const i = things.items.findIndex((t) => t.id === id);
        if (i >= 0) {
            things.items[i] = cosa;
        } else {
            things.items.push(cosa);
        }
        nuevos.push(id);
    };

    // --- Bordes: hierba y tierra, doce piezas cada uno ---
    const bordes = [];
    [['borde-hierba', 'grass border', 102, 4500, 1], ['borde-tierra', 'dirt border', 103, 4520, 5]]
        .forEach(([clave, nombre, suelo, base, semilla]) => {
            const pixeles = spriteDeCosa(store, things, suelo);
            const piezas = {};
            PIEZAS_DE_BORDE.forEach((pieza, i) => {
                const id = base + i;
                alta(id, nombre + ' ' + pieza, {}, piezaDeBorde(pixeles, pieza, semilla), { groundBorder: true });
                piezas[pieza] = id;
            });
            bordes.push({ id: clave, piezas });
        });

    // --- Muro de piedra, con puertas y ventanas ---
    const muro = {};
    [['poste', 4600], ['horizontal', 4601], ['vertical', 4602], ['esquina', 4603]].forEach(([tipo, id]) => {
        alta(id, 'stone wall ' + tipo, { blocksSolid: 1, blocksProjectile: 1, blocksPathfind: 1 },
            piezaDeMuro(tipo), {});
        muro[tipo] = id;
    });
    const puertas = {};
    const ventanas = {};
    [['horizontal', 4604], ['vertical', 4605]].forEach(([al, id]) => {
        // La puerta está ABIERTA: se pasa por ella. La ventana bloquea el paso pero deja ver.
        alta(id, 'stone wall door ' + al, {}, piezaDeMuro(al, 'puerta'), {});
        puertas[al] = id;
    });
    [['horizontal', 4606], ['vertical', 4607]].forEach(([al, id]) => {
        alta(id, 'stone wall window ' + al, { blocksSolid: 1, blocksPathfind: 1 }, piezaDeMuro(al, 'ventana'), {});
        ventanas[al] = id;
    });

    // --- Alfombra roja y mesa de madera ---
    const alfombra = {};
    PIEZAS_DE_ALFOMBRA.forEach((pieza, i) => {
        alta(4640 + i, 'red carpet ' + pieza, {}, piezaDeAlfombra(pieza), {});
        alfombra[pieza] = 4640 + i;
    });
    const mesa = {};
    PIEZAS_DE_MESA.forEach((pieza, i) => {
        alta(4660 + i, 'wooden table ' + pieza, { blocksSolid: 1, blocksPathfind: 1 }, piezaDeMesa(pieza), {});
        mesa[pieza] = 4660 + i;
    });

    things.items.sort((a, b) => a.id - b.id);
    store.flush();
    const escrito = store.writeThings(things);
    if (!escrito.ok) {
        throw new Error('things.json no valida: ' + escrito.problems.slice(0, 3).join('; '));
    }
    fs.writeFileSync(itemsFile, xml, 'utf8');

    const pinceles = {
        format: FORMATO_PINCELES,
        version: 1,
        _comment: [
            'PINCELES DEL EDITOR DE MAPAS (los grounds.xml, borders.xml y walls.xml de RME). Formato en docs/MAPAS.md.',
            'z: el suelo de z mayor pone su borde sobre los vecinos de z menor. Generado por tools/generar-pinceles.mjs; se puede editar a mano.'
        ],
        suelos: [
            { id: 'hierba', nombre: 'Hierba', z: 30, items: [{ id: 102, chance: 1 }], borde: 'borde-hierba' },
            { id: 'tierra', nombre: 'Tierra', z: 20, items: [{ id: 103, chance: 1 }], borde: 'borde-tierra' },
            { id: 'piedra', nombre: 'Suelo de piedra', z: 10, items: [{ id: 104, chance: 1 }] },
            { id: 'agua', nombre: 'Agua', z: 1, items: [{ id: 105, chance: 1 }] }
        ],
        bordes: bordes,
        muros: [
            { id: 'muro-piedra', nombre: 'Muro de piedra', piezas: muro, puertas: puertas, ventanas: ventanas }
        ],
        alfombras: [
            { id: 'alfombra-roja', nombre: 'Alfombra roja', piezas: alfombra }
        ],
        mesas: [
            { id: 'mesa-madera', nombre: 'Mesa de madera', piezas: mesa }
        ]
    };
    fs.mkdirSync(path.dirname(pincelesFile), { recursive: true });
    fs.writeFileSync(pincelesFile, JSON.stringify(pinceles, null, 2) + '\n', 'utf8');

    return { objetos: nuevos.length, sprites: store.count };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const r = generar({ assetsDir: argumento('--assets') || undefined });
    console.log('pinceles generados: ' + r.objetos + ' objetos (bordes, muros, puertas, alfombra y mesa); la biblioteca tiene ' +
        r.sprites + ' sprites');
}
