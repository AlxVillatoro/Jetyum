/**
 * EL ARTE HD: las hojas de `data/arte-hd/` (64 px por casilla), según `data/arte-hd/manifiesto.json`.
 *
 *     node tools/arte-hd.mjs plantillas   # rehace las hojas PROVISIONALES (el arte del pack ampliado x2)
 *     node tools/arte-hd.mjs importar     # mete las hojas en el juego (things.json e items.xml)
 *
 * (`npm run arte:plantillas` y `npm run arte:importar`.) Ver docs/ARTE-HD.md.
 *
 * LAS PLANTILLAS son el arte que ya hay (el OpenTibia Sprite Pack, 32 px) ampliado a 64 con Scale2x
 * —que redondea las diagonales en vez de hacer los píxeles el doble de gordos— y colocado EXACTAMENTE
 * donde va en cada hoja. Sirven para jugar ya con el formato HD y de guía para el arte de verdad:
 * se sustituye la hoja por la nueva (mismo nombre, misma rejilla) y se vuelve a importar.
 *
 * EL IMPORTADOR corta cada celda en trozos de 32x32 (el formato del almacén de sprites; los iguales se
 * reutilizan), crea o sustituye su cosa en things.json con la marca `hd` (el cliente la pinta a media
 * escala) y escribe lo nuevo en items.xml entre las marcas ARTE-HD.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dimensionsOf, spriteIndex } from '../shared/js/assets.mjs';
import { paletteColor } from '../client/jetyum/js/sprites.js';
import { hslToRgb, partOfMask } from '../client/jetyum/js/assets.js';

const require = createRequire(import.meta.url);
const { AssetStore } = require('../editor/lib/assetstore.js');
const PNG = require('../editor/lib/png.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = 32;

export const MARCA_INICIO = '<!-- ARTE-HD:inicio (generado por tools/arte-hd.mjs: no editar a mano) -->';
export const MARCA_FIN = '<!-- ARTE-HD:fin -->';

// ---------------------------------------------------------------------------
// Imágenes RGBA
// ---------------------------------------------------------------------------

export class Img {
    constructor(w, h, data) {
        this.w = w;
        this.h = h;
        this.data = data || Buffer.alloc(w * h * 4);
    }

    i(x, y) {
        return (y * this.w + x) * 4;
    }

    static leer(archivo) {
        const p = PNG.decode(fs.readFileSync(archivo));
        return new Img(p.width, p.height, Buffer.from(p.data));
    }

    guardar(archivo) {
        fs.mkdirSync(path.dirname(archivo), { recursive: true });
        fs.writeFileSync(archivo, PNG.encode(this.w, this.h, this.data));
    }

    /** Pega `src` en (dx, dy), mezclando por su transparencia. */
    pegar(src, dx, dy) {
        for (let y = 0; y < src.h; y++) {
            for (let x = 0; x < src.w; x++) {
                const tx = dx + x;
                const ty = dy + y;
                if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) {
                    continue;
                }
                const s = src.i(x, y);
                const a = src.data[s + 3] / 255;
                if (a <= 0) {
                    continue;
                }
                const d = this.i(tx, ty);
                for (let k = 0; k < 3; k++) {
                    this.data[d + k] = Math.round(src.data[s + k] * a + this.data[d + k] * (1 - a));
                }
                this.data[d + 3] = Math.max(this.data[d + 3], src.data[s + 3]);
            }
        }
        return this;
    }

    recortar(x0, y0, w, h) {
        const r = new Img(w, h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (x0 + x < 0 || y0 + y < 0 || x0 + x >= this.w || y0 + y >= this.h) {
                    continue;
                }
                this.data.copy(r.data, r.i(x, y), this.i(x0 + x, y0 + y), this.i(x0 + x, y0 + y) + 4);
            }
        }
        return r;
    }

    /** El rectángulo de lo que no es transparente, o null si no hay nada. */
    caja() {
        let x0 = this.w;
        let y0 = this.h;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < this.h; y++) {
            for (let x = 0; x < this.w; x++) {
                if (this.data[this.i(x, y) + 3] > 0) {
                    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
                }
            }
        }
        return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }

    /** Multiplica el color (luz < 1 oscurece, > 1 aclara). */
    luz(k) {
        for (let p = 0; p < this.data.length; p += 4) {
            for (let c = 0; c < 3; c++) {
                this.data[p + c] = Math.max(0, Math.min(255, Math.round(this.data[p + c] * k)));
            }
        }
        return this;
    }

    vacia() {
        return this.caja() === null;
    }
}

/**
 * SCALE2X (EPX): cada píxel se hace cuatro, y las esquinas toman el color del vecino cuando los dos
 * que las rodean coinciden. Así las diagonales salen suaves en vez de en escalera de bloques.
 */
export function scale2x(img) {
    const r = new Img(img.w * 2, img.h * 2);
    const px = (x, y) => {
        const cx = Math.max(0, Math.min(img.w - 1, x));
        const cy = Math.max(0, Math.min(img.h - 1, y));
        return img.data.readUInt32BE(img.i(cx, cy));
    };
    for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
            const p = px(x, y);
            const a = px(x, y - 1);
            const b = px(x + 1, y);
            const c = px(x - 1, y);
            const d = px(x, y + 1);
            const e0 = c === a && c !== d && a !== b ? a : p;
            const e1 = a === b && a !== c && b !== d ? b : p;
            const e2 = d === c && d !== b && c !== a ? c : p;
            const e3 = b === d && b !== a && d !== c ? d : p;
            r.data.writeUInt32BE(e0 >>> 0, r.i(2 * x, 2 * y));
            r.data.writeUInt32BE(e1 >>> 0, r.i(2 * x + 1, 2 * y));
            r.data.writeUInt32BE(e2 >>> 0, r.i(2 * x, 2 * y + 1));
            r.data.writeUInt32BE(e3 >>> 0, r.i(2 * x + 1, 2 * y + 1));
        }
    }
    return r;
}

/** Ampliar o reducir al vecino más cercano. */
export function escalar(img, f) {
    if (f === 2) {
        return scale2x(img);
    }
    if (f === 1) {
        return img;
    }
    const w = Math.max(1, Math.round(img.w * f));
    const h = Math.max(1, Math.round(img.h * f));
    const r = new Img(w, h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const sx = Math.min(img.w - 1, Math.floor(x / f));
            const sy = Math.min(img.h - 1, Math.floor(y / f));
            img.data.copy(r.data, r.i(x, y), img.i(sx, sy), img.i(sx, sy) + 4);
        }
    }
    return r;
}

// ---------------------------------------------------------------------------
// Componer una cosa de things.json (el mismo orden de piezas que el cliente)
// ---------------------------------------------------------------------------

export function componer(store, cosa, sel) {
    const d = dimensionsOf(cosa);
    const o = sel || {};
    const px = Math.min(o.px || 0, d.patternX - 1);
    const py = Math.min(o.py || 0, d.patternY - 1);
    const frame = Math.min(o.frame || 0, d.frames - 1);
    const capa = (layer) => {
        const img = new Img(d.width * S, d.height * S);
        for (let h = 0; h < d.height; h++) {
            for (let w = 0; w < d.width; w++) {
                const id = cosa.sprites[spriteIndex(cosa, w, h, layer, px, py, 0, frame)];
                if (id > 0) {
                    img.pegar(new Img(S, S, store.getSprite(id)), (d.width - 1 - w) * S, (d.height - 1 - h) * S);
                }
            }
        }
        return img;
    };
    if (d.layers >= 2 && o.colores) {
        // Como el cliente: la capa 1 es la máscara de colores (cabeza, cuerpo, piernas, pies).
        const base = capa(0);
        const mascara = capa(1);
        const partes = ['head', 'body', 'legs', 'feet'];
        const col = {};
        partes.forEach((p, k) => { col[p] = hslToRgb(paletteColor(o.colores[k])); });
        for (let p = 0; p < base.data.length; p += 4) {
            if (mascara.data[p + 3] === 0) {
                continue;
            }
            const parte = partOfMask(mascara.data[p], mascara.data[p + 1], mascara.data[p + 2]);
            if (parte && col[parte]) {
                for (let c = 0; c < 3; c++) {
                    base.data[p + c] = Math.round(base.data[p + c] * col[parte][c] / 255);
                }
            }
        }
        return base;
    }
    const img = capa(0);
    for (let l = 1; l < d.layers; l++) {
        img.pegar(capa(l), 0, 0);
    }
    return img;
}

// ---------------------------------------------------------------------------
// Los dibujos «a mano» de las plantillas (muros de bloque, farola, cartel, hoguera)
// ---------------------------------------------------------------------------

function rect(img, x, y, w, h, rgba) {
    for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
            if (i >= 0 && j >= 0 && i < img.w && j < img.h) {
                const p = img.i(i, j);
                img.data[p] = rgba[0]; img.data[p + 1] = rgba[1]; img.data[p + 2] = rgba[2]; img.data[p + 3] = rgba[3] === undefined ? 255 : rgba[3];
            }
        }
    }
}

/** Una textura del pack (un suelo) ampliada a 64, para la cara de un muro. */
function textura(store, cosas, id, luz) {
    const t = cosas.get(id);
    const img = t ? scale2x(componer(store, t, {})) : new Img(64, 64);
    if (!t) {
        rect(img, 0, 0, 64, 64, [128, 128, 128]);
    }
    return img.luz(luz);
}

function bloque(store, cosas, arriba, frente) {
    const img = new Img(64, 128);
    img.pegar(textura(store, cosas, arriba, 1.08), 0, 0);
    img.pegar(textura(store, cosas, frente, 0.72), 0, 64);
    // El canto: una línea clara arriba del frente y una sombra abajo.
    rect(img, 0, 64, 64, 2, [210, 205, 190]);
    rect(img, 0, 62, 64, 2, [60, 56, 50]);
    rect(img, 0, 124, 64, 4, [40, 36, 32]);
    return img;
}

export function procedural(nombre, store, cosas) {
    const piedra = () => bloque(store, cosas, 10170, 10169);
    const madera = () => bloque(store, cosas, 10172, 10173);
    switch (nombre) {
        case 'muro-piedra': return piedra();
        case 'muro-piedra-ventana': {
            const img = piedra();
            rect(img, 18, 76, 28, 26, [70, 60, 50]);
            rect(img, 21, 79, 22, 20, [30, 40, 70]);
            rect(img, 31, 79, 2, 20, [70, 60, 50]);
            return img;
        }
        case 'muro-piedra-puerta': {
            const img = piedra();
            rect(img, 14, 72, 36, 56, [60, 40, 25]);
            rect(img, 17, 75, 30, 53, [120, 80, 45]);
            rect(img, 31, 75, 2, 53, [80, 52, 30]);
            rect(img, 40, 100, 4, 4, [220, 190, 80]);
            return img;
        }
        case 'muro-piedra-abierta': {
            const img = piedra();
            rect(img, 14, 72, 36, 56, [60, 40, 25]);
            rect(img, 17, 75, 30, 53, [22, 16, 12]);
            return img;
        }
        case 'muro-madera': return madera();
        case 'muro-madera-ventana': {
            const img = madera();
            rect(img, 18, 76, 28, 26, [70, 45, 25]);
            rect(img, 21, 79, 22, 20, [30, 40, 70]);
            return img;
        }
        case 'valla': {
            const img = new Img(64, 128);
            [4, 28, 52].forEach((x) => rect(img, x, 84, 8, 44, [110, 72, 40]));
            rect(img, 0, 92, 64, 6, [140, 95, 55]);
            rect(img, 0, 110, 64, 6, [140, 95, 55]);
            return img;
        }
        case 'columna': {
            const img = new Img(64, 128);
            const tex = textura(store, cosas, 10170, 1);
            const fuste = tex.recortar(0, 0, 36, 64);
            img.pegar(fuste, 14, 40);
            img.pegar(tex.recortar(0, 0, 36, 24).luz(0.75), 14, 104);
            rect(img, 10, 34, 44, 8, [190, 185, 170]);
            rect(img, 10, 120, 44, 8, [90, 86, 80]);
            return img;
        }
        case 'farola': {
            const img = new Img(128, 128);
            rect(img, 94, 40, 4, 84, [40, 40, 46]);
            rect(img, 88, 120, 16, 6, [50, 50, 56]);
            rect(img, 86, 24, 20, 18, [40, 40, 46]);
            rect(img, 89, 27, 14, 12, [255, 210, 110]);
            return img;
        }
        case 'cartel': {
            const img = new Img(128, 128);
            rect(img, 94, 70, 6, 56, [100, 66, 36]);
            rect(img, 74, 64, 46, 24, [150, 105, 60]);
            rect(img, 78, 70, 38, 3, [90, 60, 32]);
            rect(img, 78, 78, 30, 3, [90, 60, 32]);
            return img;
        }
        case 'hoguera': {
            const img = new Img(128, 128);
            rect(img, 72, 112, 48, 8, [90, 60, 34]);
            rect(img, 80, 106, 32, 8, [110, 72, 40]);
            rect(img, 84, 84, 24, 24, [240, 120, 30]);
            rect(img, 89, 70, 14, 20, [255, 200, 70]);
            rect(img, 93, 62, 6, 10, [255, 240, 160]);
            return img;
        }
        default: {
            const img = new Img(64, 64);
            rect(img, 0, 0, 64, 64, [200, 0, 200, 160]);
            return img;
        }
    }
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

function leerManifiesto(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'manifiesto.json'), 'utf8'));
}

/** Lo que dice `plantilla`, ya compuesto a su tamaño del pack. */
function fuente(plant, store, cosas, categorias) {
    if (plant.procedural) {
        return { img: procedural(plant.procedural, store, cosas), hd: true };
    }
    const cat = plant.items ? 'items' : plant.effects !== undefined ? 'effects' : 'outfits';
    const id = Array.isArray(plant.items) ? plant.items[0] : (plant.items || plant.effects || plant.outfits);
    const cosa = categorias[cat].get(Number(id));
    if (!cosa) {
        return { img: procedural('?', store, cosas), hd: true };
    }
    const img = componer(store, cosa, { frame: plant.frame || 0, colores: plant.colores });
    (plant.encima || []).forEach((otro) => {
        const o = cosas.get(Number(otro));
        if (o) {
            img.pegar(componer(store, o, {}), img.w - dimensionsOf(o).width * S, img.h - dimensionsOf(o).height * S);
        }
    });
    return { img, hd: false };
}

/** Coloca un dibujo del pack en una celda HD: ampliado x2 y apoyado abajo a la derecha. */
function enCelda(src, cw, ch) {
    const celda = new Img(cw, ch);
    const grande = src.hd ? src.img : scale2x(src.img);
    celda.pegar(grande, cw - grande.w, ch - grande.h);
    return celda;
}

/**
 * Un dibujo del pack (de 32 px por casilla) al doble y EN SU SITIO: anclado abajo a la derecha de
 * la celda como en el juego y con su `offset` metido en el dibujo. Así lo HD se ve donde se veía lo
 * de 32 px. Lo que se salga de la celda (lo que el dibujo tuviera fuera de su casilla) se pierde.
 */
function enSuSitio(img, cosa, cw, ch) {
    const off = (cosa && cosa.flags && cosa.flags.offset) || { x: 0, y: 0 };
    const lienzo = new Img(cw / 2, ch / 2);
    lienzo.pegar(img, lienzo.w - img.w - (off.x || 0), lienzo.h - img.h - (off.y || 0));
    return scale2x(lienzo);
}


/** El lado de una celda de `personajes/*.png`: 2x2 casillas de 64 px. */
export const CELDA_PERSONAJE = 128;

export function plantillas(opciones) {
    const o = opciones || {};
    const dir = o.dir || path.join(RAIZ, 'data/arte-hd');
    const store = new AssetStore(o.assets || path.join(RAIZ, 'client/jetyum/assets'));
    const things = store.readThings();
    const categorias = {
        items: new Map(things.items.map((t) => [t.id, t])),
        outfits: new Map(things.outfits.map((t) => [t.id, t])),
        effects: new Map(things.effects.map((t) => [t.id, t]))
    };
    const cosas = categorias.items;
    const man = leerManifiesto(dir);
    const hechas = [];

    man.hojas.forEach((hoja) => {
        const [cw, ch] = hoja.celda;
        const img = new Img(hoja.tamano[0], hoja.tamano[1]);
        hoja.piezas.forEach((pieza) => {
            if (hoja.tipo === 'efecto') {
                const cosa = categorias.effects.get(Number(pieza.plantilla.effects));
                if (!cosa) {
                    return;
                }
                const n = dimensionsOf(cosa).frames;
                for (let k = 0; k < 5; k++) {
                    const f = Math.round(k * (n - 1) / 4);
                    img.pegar(enSuSitio(componer(store, cosa, { frame: f }), cosa, cw, ch), k * cw, pieza.fila * ch);
                }
                return;
            }
            pieza.celdas.forEach(([fila, col], k) => {
                const plant = pieza.plantilla[Math.min(k, pieza.plantilla.length - 1)];
                const src = fuente(plant, store, cosas, categorias);
                const celda = enCelda(src, cw, ch);
                img.pegar(celda, col * cw, fila * ch);
            });
        });
        img.guardar(path.join(dir, hoja.archivo));
        hechas.push(hoja.archivo);
    });

    // Los personajes: 4 direcciones (filas) x 3 fotogramas (quieto, paso, paso).
    man.personajes.forEach((p) => {
        // Sin plantilla: la hoja se hace aparte (p. ej. tools/generar-personaje-8d.mjs).
        const cosa = p.plantilla ? categorias.outfits.get(Number(p.plantilla.outfits)) : null;
        if (!cosa) {
            return;
        }
        const n = dimensionsOf(cosa).frames;
        const pasos = n >= 5 ? [0, 1, 3] : [0, 1, Math.min(2, n - 1)];
        const dibujos = [];
        for (let dir2 = 0; dir2 < 4; dir2++) {
            pasos.forEach((f) => dibujos.push(componer(store, cosa, { px: dir2, frame: f, colores: p.plantilla.colores })));
        }
        // Sin encoger ni centrar: el dibujo del pack, al doble (Scale2x) y en su sitio de siempre.
        // La celda es de 2x2 casillas (128x128); la casilla donde está la criatura es el cuarto de
        // abajo a la derecha y lo que sobresale crece hacia arriba y a la izquierda, como en Tibia.
        // El `offset` del aspecto (8,8 en los del pack) se queda dentro del dibujo: así un aspecto
        // HD y uno del pack se ven igual de grandes y con los pies en el mismo sitio.
        const off = (cosa.flags && cosa.flags.offset) || { x: 0, y: 0 };
        const hojaP = new Img(3 * CELDA_PERSONAJE, 4 * CELDA_PERSONAJE);
        dibujos.forEach((d, k) => {
            const lienzo = new Img(CELDA_PERSONAJE / 2, CELDA_PERSONAJE / 2);
            lienzo.pegar(d, lienzo.w - d.w - (off.x || 0), lienzo.h - d.h - (off.y || 0));
            hojaP.pegar(scale2x(lienzo), (k % 3) * CELDA_PERSONAJE, Math.floor(k / 3) * CELDA_PERSONAJE);
        });
        hojaP.guardar(path.join(dir, p.archivo));
        hechas.push(p.archivo);
    });
    return hechas;
}

// ---------------------------------------------------------------------------
// Importar
// ---------------------------------------------------------------------------

/** Los trozos de 32x32 de una celda, en el orden de piezas de Tibia (w=0 a la derecha, h=0 abajo). */
function trozos(celda) {
    const W = celda.w / S;
    const H = celda.h / S;
    const lista = [];
    for (let h = 0; h < H; h++) {
        for (let w = 0; w < W; w++) {
            lista.push({ w, h, img: celda.recortar((W - 1 - w) * S, (H - 1 - h) * S, S, S) });
        }
    }
    return { W, H, lista };
}

/**
 * Una cosa HD a partir de sus celdas: `variantes` (patrones X/Y por casilla), `fotogramas`, o las
 * 4 direcciones x N fotogramas de un personaje.
 */
function cosaHD(store, id, nombre, celdas, modo) {
    const primera = trozos(celdas[0][0]);
    const W = primera.W;
    const H = primera.H;
    const filas = celdas.length;          // patrones X (direcciones) o variantes
    const cols = celdas[0].length;        // fotogramas
    let patternX = 1;
    let patternY = 1;
    let frames = 1;
    if (modo === 'personaje') {
        patternX = filas;
        frames = cols;
    } else if (modo === 'fotogramas') {
        frames = cols;
    } else {
        const n = cols;
        patternX = n >= 2 ? 2 : 1;
        patternY = n >= 4 ? 2 : 1;
    }
    const cosa = {
        id, name: nombre, width: W, height: H, exactSize: W * S, layers: 1,
        patternX, patternY, patternZ: 1, frames, flags: {}, sprites: []
    };
    const total = W * H * patternX * patternY * frames;
    cosa.sprites = new Array(total).fill(0);
    const poner = (img, px, py, frame) => {
        const { lista } = trozos(img);
        const ids = store.addSprites(lista.map((t) => t.img.data)).ids;
        lista.forEach((t, k) => {
            cosa.sprites[spriteIndex(cosa, t.w, t.h, 0, px, py, 0, frame)] = ids[k];
        });
    };
    if (modo === 'personaje') {
        celdas.forEach((fila, d) => fila.forEach((img, f) => poner(img, d, 0, f)));
    } else if (modo === 'fotogramas') {
        celdas[0].forEach((img, f) => poner(img, 0, 0, f));
    } else {
        celdas[0].forEach((img, v) => poner(img, v % patternX, Math.floor(v / patternX), 0));
    }
    if (frames > 1) {
        const ms = modo === 'personaje' ? 200 : 300;
        cosa.animation = { mode: 'async', loop: 0, start: 0, durations: new Array(frames).fill(0).map(() => [ms, ms]) };
    }
    return cosa;
}

/** Une una cosa HD con la que ya existía: el dibujo es el nuevo, la lógica (banderas) la de siempre. */
function sustituir(vieja, nueva) {
    const flags = { ...((vieja && vieja.flags) || {}), ...nueva.flags, hd: true };
    delete flags.offset;
    return { ...nueva, name: vieja ? vieja.name : nueva.name, flags };
}

function lineaXml(id, nombre, articulo, xml) {
    const attrs = Object.keys(xml || {}).map((k) => '<attribute key="' + k + '" value="' + xml[k] + '" />').join('');
    return '\t<item id="' + id + '"' + (articulo ? ' article="' + articulo + '"' : '') + ' name="' + nombre + '">' + attrs + '</item>';
}

export function ponerBloque(texto, lineas) {
    const bloque = '\t' + MARCA_INICIO + '\n' + lineas.join('\n') + '\n\t' + MARCA_FIN;
    const i = texto.indexOf('\t' + MARCA_INICIO);
    const j = texto.indexOf(MARCA_FIN);
    if (i >= 0 && j > i) {
        return texto.slice(0, i) + bloque + texto.slice(j + MARCA_FIN.length);
    }
    const fin = texto.lastIndexOf('</items>');
    return texto.slice(0, fin) + bloque + '\n' + texto.slice(fin);
}

export function importar(opciones) {
    const o = opciones || {};
    const dir = o.dir || path.join(RAIZ, 'data/arte-hd');
    const archivoItems = o.items || path.join(RAIZ, 'data/items/items.xml');
    const store = new AssetStore(o.assets || path.join(RAIZ, 'client/jetyum/assets'));
    const things = store.readThings();
    const man = leerManifiesto(dir);
    const resumen = { items: 0, outfits: 0, effects: 0, saltadas: [] };
    const lineas = [];
    const poner = (categoria, cosa) => {
        things[categoria] = (things[categoria] || []).filter((t) => t.id !== cosa.id).concat([cosa]).sort((a, b) => a.id - b.id);
        resumen[categoria] += 1;
    };
    const vieja = (categoria, id) => (things[categoria] || []).find((t) => t.id === Number(id));

    man.hojas.forEach((hoja) => {
        const archivo = path.join(dir, hoja.archivo);
        if (!fs.existsSync(archivo)) {
            resumen.saltadas.push(hoja.archivo);
            return;
        }
        const img = Img.leer(archivo);
        const [cw, ch] = hoja.celda;
        const celda = (fila, col) => img.recortar(col * cw, fila * ch, cw, ch);
        hoja.piezas.forEach((pieza) => {
            if (hoja.tipo === 'efecto') {
                const frames = [0, 1, 2, 3, 4].map((k) => celda(pieza.fila, k));
                const nueva = cosaHD(store, pieza.sustituye, 'efecto', [frames], 'fotogramas');
                nueva.animation.durations = frames.map(() => [100, 100]);
                poner('effects', sustituir(vieja('effects', pieza.sustituye), nueva));
                return;
            }
            const imgs = pieza.celdas.map(([f, c]) => celda(f, c));
            if (imgs.every((i) => i.vacia())) {
                resumen.saltadas.push(hoja.archivo + ' ' + (pieza.id || pieza.sustituye));
                return;
            }
            const modo = pieza.como === 'fotogramas' ? 'fotogramas' : 'variantes';
            const id = pieza.id || pieza.sustituye;
            const nueva = cosaHD(store, id, pieza.nombre || 'objeto', [imgs], modo);
            if (pieza.sustituye) {
                poner('items', sustituir(vieja('items', id), nueva));
                return;
            }
            nueva.flags = { ...(pieza.flags || {}), hd: true };
            poner('items', nueva);
            lineas.push(lineaXml(id, pieza.nombre, pieza.articulo, pieza.xml));
        });
    });

    man.personajes.forEach((p) => {
        const archivo = path.join(dir, p.archivo);
        if (!fs.existsSync(archivo)) {
            resumen.saltadas.push(p.archivo);
            return;
        }
        const img = Img.leer(archivo);
        const c = img.w / 3;              // 128 (2x2 casillas); las hojas antiguas, 64
        // 4 filas (N, E, S, O) u 8 (N, NE, E, SE, S, SO, O, NO): una por dirección (patrón X).
        const filas = Math.round(img.h / c);
        const celdas = [...Array(filas).keys()].map((d) => [0, 1, 2].map((f) => img.recortar(f * c, d * c, c, c)));
        const nueva = cosaHD(store, p.aspecto, path.basename(p.archivo, '.png'), celdas, 'personaje');
        const antes = vieja('outfits', p.aspecto);
        const cosa = sustituir(antes, nueva);
        cosa.name = antes ? antes.name : nueva.name;
        poner('outfits', cosa);
    });

    store.flush();
    const r = store.writeThings(things);
    if (!r.ok) {
        throw new Error('things.json no es válido: ' + r.problems.slice(0, 5).join('; '));
    }
    if (lineas.length) {
        const texto = fs.readFileSync(archivoItems, 'utf8');
        fs.writeFileSync(archivoItems, ponerBloque(texto, lineas));
    }
    resumen.nuevos = lineas.length;
    return resumen;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const orden = process.argv[2];
    if (orden === 'plantillas') {
        const hechas = plantillas();
        console.log('hojas provisionales: ' + hechas.join(', '));
    } else if (orden === 'importar') {
        const r = importar();
        console.log('arte HD: ' + r.items + ' objetos, ' + r.outfits + ' aspectos, ' + r.effects + ' efectos (' +
            r.nuevos + ' nuevos en items.xml)' + (r.saltadas.length ? '; sin hoja: ' + r.saltadas.join(', ') : ''));
    } else {
        console.log('uso: node tools/arte-hd.mjs plantillas | importar');
        process.exit(1);
    }
}
