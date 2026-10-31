/**
 * LAS PIEZAS DE MURO QUE FALTAN, teñidas del material que las necesita.
 *
 *     node tools/generar-piezas-de-muro.mjs     (después regenera objetos.json, como el correo)
 *
 * Algunos muros del OpenTibia Sprite Pack no traen todas sus piezas: a la roca gris, a la nevada y a
 * la de arena les faltan trozos de diagonal, y a la piedra negra (un muro de ciudad), el poste. En el
 * muestrario de muros (`tools/generar-muestrario-muros.mjs`) se pusieron, a mano, las piezas con la
 * forma buena pero de OTRO material (otro color). Esta herramienta hace la pieza que falta: LA FORMA
 * de la prestada con LA TEXTURA Y EL COLOR del material donde va.
 *
 * CÓMO SE TIÑE, píxel a píxel (`tenir`):
 *   1. la textura: el color del MISMO píxel en las piezas propias del material (la que más se solapa
 *      con la prestada primero, y todas sus variantes); así salen sus piedras, sus vetas y su borde;
 *   2. donde ninguna pieza propia tiene dibujo, el color de la paleta del material con la MISMA
 *      luminosidad relativa que tenía el píxel prestado;
 *   3. y la luz de la forma prestada (lo que estaba en sombra, en sombra), mezclada a medias con la
 *      textura, para que la pieza no quede plana.
 *
 * Los objetos van entre las marcas MUROS de items.xml (se reescribe el bloque), con los atributos de
 * la pieza prestada; las cosas se sustituyen por id y los sprites se deduplican, como en
 * `generar-correo.mjs`. Es determinista y se puede ejecutar las veces que haga falta.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as A from '../shared/js/assets.mjs';
import { Img, componer } from './arte-hd.mjs';
import { generar as generarBanderas } from './generar-banderas.mjs';

const require = createRequire(import.meta.url);
const { AssetStore, isEmptySprite } = require('../editor/lib/assetstore.js');
const Xml = require('../engine/data/xml.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = A.SPRITE_SIZE;

export const MARCA_INICIO = '<!-- MUROS:inicio · Piezas de muro teñidas (generado por tools/generar-piezas-de-muro.mjs: no editar a mano) -->';
export const MARCA_FIN = '<!-- MUROS:fin -->';

/** Las piezas propias de cada material (ids del juego): de ellas sale la textura y el color. */
export const MATERIALES = {
    'piedra-negra': [10576, 10577, 10578, 10584, 10586],
    'roca-gris': [10956, 10957, 10958, 10959, 10960, 10961],
    'roca-nieve': [10935, 10936, 10937, 10938, 10939, 10940, 10941, 10942, 10943, 10944, 10945],
    'roca-arena': [10919, 10920, 10921, 10922, 10923, 10929, 10930, 10931, 10932, 10933, 10934]
};

/**
 * LAS PIEZAS QUE SE HACEN: [id nuevo, pieza prestada (la forma), material (la textura)]. Las
 * prestadas son las que se pusieron en el muestrario corregido.
 */
export const PIEZAS = [
    [21100, 10592, 'piedra-negra'],   // el poste de la piedra negra (la forma, de un muro de madera)
    [21101, 10934, 'roca-gris'],      // la diagonal llena de la roca gris (la forma, de la arena)
    [21102, 10937, 'roca-gris'],      // el remate de diagonal de la roca gris (la forma, de la nieve)
    [21103, 10934, 'roca-nieve'],     // la diagonal llena de la roca nevada (la forma, de la arena)
    [21104, 10937, 'roca-arena']      // el remate de diagonal de la roca de arena (la forma, de la nieve)
];

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Las variantes de una cosa (patrones), compuestas, del mismo tamaño que `ancho` x `alto`. */
function variantes(store, cosa, ancho, alto) {
    const d = A.dimensionsOf(cosa);
    const lista = [];
    for (let py = 0; py < d.patternY; py += 1) {
        for (let px = 0; px < d.patternX; px += 1) {
            const img = componer(store, cosa, { px, py });
            // Alineadas abajo a la derecha, como se dibujan en su casilla.
            const lienzo = new Img(ancho, alto);
            lienzo.pegar(img, ancho - img.w, alto - img.h);
            lista.push(lienzo);
        }
    }
    return lista;
}

/**
 * TIÑE `forma` con la textura de `muestras` (todas del mismo tamaño que ella). Devuelve una imagen
 * nueva: los píxeles transparentes de la forma siguen transparentes.
 */
export function tenir(forma, muestras) {
    const n = forma.w * forma.h;
    const opaco = (img, p) => img.data[p * 4 + 3] > 0;
    // Las muestras, de la que más se solapa con la forma a la que menos.
    const solape = muestras.map((m) => {
        let comun = 0;
        for (let p = 0; p < n; p += 1) {
            if (opaco(forma, p) && opaco(m, p)) { comun += 1; }
        }
        return { m, comun };
    }).sort((a, b) => b.comun - a.comun).map((x) => x.m);
    // La paleta del material, por luminosidad, y la de la forma.
    const paleta = [];
    muestras.forEach((m) => {
        for (let p = 0; p < n; p += 1) {
            if (opaco(m, p)) { paleta.push([m.data[p * 4], m.data[p * 4 + 1], m.data[p * 4 + 2]]); }
        }
    });
    paleta.sort((a, b) => (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) - (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]));
    const luces = [];
    for (let p = 0; p < n; p += 1) {
        if (opaco(forma, p)) { luces.push(lum(forma.data, p * 4)); }
    }
    luces.sort((a, b) => a - b);
    const rango = (l) => {
        let lo = 0;
        let hi = luces.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (luces[mid] < l) { lo = mid + 1; } else { hi = mid; }
        }
        return luces.length > 1 ? lo / (luces.length - 1) : 0.5;
    };
    const salida = new Img(forma.w, forma.h);
    for (let p = 0; p < n; p += 1) {
        if (!opaco(forma, p)) {
            continue;
        }
        const q = paleta[Math.round(rango(lum(forma.data, p * 4)) * (paleta.length - 1))] || [128, 128, 128];
        const m = solape.find((x) => opaco(x, p));
        let c = m ? [m.data[p * 4], m.data[p * 4 + 1], m.data[p * 4 + 2]] : q;
        if (m) {
            // La luz de la forma, a medias con la textura.
            const lc = Math.max(1, 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
            const lq = 0.299 * q[0] + 0.587 * q[1] + 0.114 * q[2];
            const k = 0.5 + 0.5 * (lq / lc);
            c = c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
        }
        salida.data[p * 4] = c[0];
        salida.data[p * 4 + 1] = c[1];
        salida.data[p * 4 + 2] = c[2];
        salida.data[p * 4 + 3] = 255;
    }
    return salida;
}

/** Corta una imagen de ancho x alto casillas en sus sprites, en el orden de las cosas (de abajo a la derecha). */
function trocear(img, cosa) {
    const sprites = [];
    for (let h = 0; h < cosa.height; h += 1) {
        for (let w = 0; w < cosa.width; w += 1) {
            const trozo = img.recortar(img.w - (w + 1) * S, img.h - (h + 1) * S, S, S);
            sprites.push(Buffer.from(trozo.data));
        }
    }
    return sprites;
}

function lineaXml(id, articulo, nombre, atributos) {
    const attrs = Object.keys(atributos).map((k) => '<attribute key="' + k + '" value="' + atributos[k] + '" />').join('');
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

/** Las imágenes de cada pieza nueva (para verlas sin escribir nada). */
export function imagenes(store, things) {
    const porId = new Map(things.items.map((t) => [t.id, t]));
    return PIEZAS.map(([id, base, material]) => {
        const cosa = porId.get(base);
        const ancho = cosa.width * S;
        const alto = cosa.height * S;
        const forma = variantes(store, cosa, ancho, alto)[0];
        const muestras = MATERIALES[material].flatMap((m) => variantes(store, porId.get(m), ancho, alto));
        return { id, base, material, cosa, forma, imagen: tenir(forma, muestras) };
    });
}

export function generar(opciones) {
    const o = opciones || {};
    const assetsDir = o.assetsDir || path.join(RAIZ, 'client', 'jetyum', 'assets');
    const itemsFile = o.itemsFile || path.join(RAIZ, 'data', 'items', 'items.xml');
    const store = new AssetStore(assetsDir);
    const things = store.readThings();
    const tipos = Xml.loadItems(itemsFile);
    const previas = new Map(things.items.map((t) => [t.id, t]));
    const usados = new Set();
    const numerar = (id, sprites) => {
        const previa = previas.get(id);
        return sprites.map((sprite, k) => {
            if (isEmptySprite(sprite)) {
                return 0;
            }
            const existente = store._hashes().get(crypto.createHash('sha1').update(sprite).digest('hex'));
            if (existente) {
                usados.add(existente);
                return existente;
            }
            const anterior = previa && previa.sprites[k];
            if (anterior && !usados.has(anterior) &&
                store.usage(anterior, things).every((u) => u.category === 'items' && u.id === id)) {
                store.setSprite(anterior, sprite);
                usados.add(anterior);
                return anterior;
            }
            const nuevo = store.addSprites([sprite]).ids[0];
            usados.add(nuevo);
            return nuevo;
        });
    };
    const cosas = [];
    const lineas = [];
    imagenes(store, things).forEach(({ id, base, cosa, imagen }) => {
        const tipo = tipos.get(base) || { name: 'wall', article: 'a', attributes: {} };
        cosas.push({
            id, name: tipo.name, width: cosa.width, height: cosa.height, exactSize: cosa.exactSize || S, layers: 1,
            patternX: 1, patternY: 1, patternZ: 1, frames: 1, flags: { ...cosa.flags }, sprites: numerar(id, trocear(imagen, cosa))
        });
        lineas.push(lineaXml(id, tipo.article, tipo.name, tipo.attributes || {}));
    });
    const nuevos = new Set(cosas.map((c) => c.id));
    things.items = things.items.filter((t) => !nuevos.has(t.id)).concat(cosas).sort((a, b) => a.id - b.id);
    store.flush();
    const r = store.writeThings(things);
    if (!r.ok) {
        throw new Error('things.json no es válido: ' + r.problems.slice(0, 5).join('; '));
    }
    fs.writeFileSync(itemsFile, ponerBloque(fs.readFileSync(itemsFile, 'utf8'), lineas));
    const banderas = o.banderas === false ? null : generarBanderas(o.banderasOpciones);
    return { objetos: cosas.length, sprites: store.count, banderas };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const r = generar();
    console.log('piezas de muro: ' + r.objetos + ' objetos; la biblioteca tiene ' + r.sprites + ' sprites' +
        (r.banderas ? '; objetos.json: ' + r.banderas.conBanderas + ' objetos con banderas' : ''));
}
