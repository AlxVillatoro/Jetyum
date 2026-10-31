/**
 * GENERA EL CORREO Y LAS CAMAS: su arte, sus cosas y sus objetos.
 *
 *     node tools/generar-correo.mjs        (después, npm run banderas:generar; esta ya lo hace)
 *
 * El catálogo del OpenTibia Sprite Pack no trae buzón, ni cartas, ni paquetes, ni etiquetas, ni
 * camas, y los ids clásicos de Tibia (2593, 2595...) aquí no existen. Esta herramienta los da de
 * alta con ids propios, en el 21040-21059 (los de antes, del 21000 al 21033, son de
 * `tools/generar-runas.mjs`):
 *
 *   21040        el buzón: no se coge y ocupa la casilla; lo que se echa en él se manda
 *                (`mailbox`, ver engine/world/correo.js);
 *   21041-21042  la carta en blanco (se escribe: `writable`, `maxTextLen`) y la sellada (se lee);
 *   21043-21044  el paquete (un contenedor) y el sellado;
 *   21045        la etiqueta, que se escribe y se mete en un paquete para decir a quién va;
 *   21050-21053  la CAMA de dos casillas: la cabecera (21050) arriba y los pies (21051) en la
 *                casilla del SUR, libres, y las dos con alguien durmiendo (21052, 21053). Llevan
 *                `bed` y `bedPart`, `partnerDirection` (dónde está la otra mitad) y el id de su
 *                versión ocupada (`occupiedId`) o libre (`freeId`). Qué pasa al usarla es cosa de
 *                las casas: aquí sólo se dibujan y se describen.
 *
 * Lo que se manda lleva `stampedId`, el id de su versión sellada: es lo que mira el motor para
 * saber si algo se puede echar al buzón y en qué se convierte. Y la etiqueta, `mailLabel`.
 *
 * TODO ES PIXEL ART NUEVO de 32x32, dibujado aquí con código y determinista: dos ejecuciones dan
 * los mismos píxeles. SE PUEDE EJECUTAR LAS VECES QUE HAGA FALTA: los objetos van entre las
 * marcas CORREO de items.xml (se reescribe el bloque), las cosas se sustituyen por id y los sprites
 * se deduplican como en `generar-runas.mjs`. Al final se regenera objetos.json (lo mismo que
 * `npm run banderas:generar`).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as A from '../shared/js/assets.mjs';
import { generar as generarBanderas } from './generar-banderas.mjs';

const require = createRequire(import.meta.url);
const { AssetStore, isEmptySprite } = require('../editor/lib/assetstore.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = A.SPRITE_SIZE;

export const MARCA_INICIO = '<!-- CORREO:inicio · Correo y camas (generado por tools/generar-correo.mjs: no editar a mano) -->';
export const MARCA_FIN = '<!-- CORREO:fin -->';

export const CORREO = {
    BUZON: 21040, CARTA: 21041, CARTA_SELLADA: 21042, PAQUETE: 21043, PAQUETE_SELLADO: 21044, ETIQUETA: 21045
};
export const CAMA = { CABECERA: 21050, PIES: 21051, CABECERA_OCUPADA: 21052, PIES_OCUPADA: 21053 };

/** Lo que cabe escrito en una carta y en una etiqueta. */
const LARGO_CARTA = 500;
const LARGO_ETIQUETA = 100;

// ---------------------------------------------------------------------------
// Lienzos (los mismos que en generar-runas.mjs)
// ---------------------------------------------------------------------------

/** Un lienzo RGBA de 32x32 con lo justo para pintar píxel a píxel. */
function lienzo() {
    const datos = Buffer.alloc(S * S * 4);
    const dentro = (x, y) => x >= 0 && y >= 0 && x < S && y < S;
    return {
        w: S, h: S, datos,
        pon(x, y, color, alfa) {
            if (!dentro(x, y)) {
                return;
            }
            const o = (y * S + x) * 4;
            datos[o] = Math.max(0, Math.min(255, Math.round(color[0])));
            datos[o + 1] = Math.max(0, Math.min(255, Math.round(color[1])));
            datos[o + 2] = Math.max(0, Math.min(255, Math.round(color[2])));
            datos[o + 3] = alfa === undefined ? 255 : Math.max(0, Math.min(255, Math.round(alfa)));
        },
        alfa(x, y) {
            return dentro(x, y) ? datos[(y * S + x) * 4 + 3] : 0;
        },
        color(x, y) {
            const o = (y * S + x) * 4;
            return [datos[o], datos[o + 1], datos[o + 2], datos[o + 3]];
        },
        /** Un rectángulo lleno, de (x0, y0) a (x1, y1) incluidos; `f(x, y)` da el color de cada punto. */
        caja(x0, y0, x1, y1, f) {
            for (let y = y0; y <= y1; y += 1) {
                for (let x = x0; x <= x1; x += 1) {
                    const c = typeof f === 'function' ? f(x, y) : f;
                    if (c) {
                        this.pon(x, y, c);
                    }
                }
            }
        },
        /** Una línea de un píxel (Bresenham). */
        linea(x0, y0, x1, y1, color) {
            const dx = Math.abs(x1 - x0);
            const dy = -Math.abs(y1 - y0);
            const sx = x0 < x1 ? 1 : -1;
            const sy = y0 < y1 ? 1 : -1;
            let err = dx + dy;
            for (let x = x0, y = y0, paso = 0; paso < 200; paso += 1) {
                this.pon(x, y, color);
                if (x === x1 && y === y1) {
                    break;
                }
                const e2 = 2 * err;
                if (e2 >= dy) { err += dy; x += sx; }
                if (e2 <= dx) { err += dx; y += sy; }
            }
        },
        /** Un círculo lleno; `f(dx, dy, d)` da el color de cada punto (para sombrearlo). */
        disco(cx, cy, r, f) {
            for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y += 1) {
                for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x += 1) {
                    const dx = x + 0.5 - cx;
                    const dy = y + 0.5 - cy;
                    const d = Math.hypot(dx, dy);
                    if (d <= r) {
                        const c = typeof f === 'function' ? f(dx, dy, d) : f;
                        if (c) {
                            this.pon(x, y, c);
                        }
                    }
                }
            }
        }
    };
}

/** Un ruido determinista entre 0 y 1. */
function ruido(n, semilla) {
    const x = Math.sin(n * 12.9898 + semilla * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

const oscuro = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const grano = (c, x, y, semilla, cuanto) => {
    const g = (ruido(x * 31 + y * 7, semilla) - 0.5) * (cuanto || 10);
    return [c[0] + g, c[1] + g, c[2] + g];
};
const VECINOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** El contorno de 1 px del estilo del pack: cada vacío que toca uno pintado (en cruz) se pinta. */
function contorno(l, color) {
    const pintar = [];
    for (let y = 0; y < l.h; y += 1) {
        for (let x = 0; x < l.w; x += 1) {
            if (l.alfa(x, y) > 0) {
                continue;
            }
            const vecino = VECINOS.find(([dx, dy]) => l.alfa(x + dx, y + dy) > 0);
            if (vecino) {
                pintar.push([x, y, color || oscuro(l.color(x + vecino[0], y + vecino[1]), 0.35)]);
            }
        }
    }
    pintar.forEach(([x, y, c]) => l.pon(x, y, c));
    return l;
}

// ---------------------------------------------------------------------------
// El buzón: una caja roja con remate redondo, la boca y el escudo dorado, sobre un poste
// ---------------------------------------------------------------------------

const ROJO = { claro: [214, 70, 58], medio: [172, 40, 34], oscuro: [112, 22, 22] };
const ORO = { claro: [255, 226, 120], medio: [222, 170, 52], oscuro: [150, 104, 26] };
const MADERA = { claro: [168, 116, 62], medio: [128, 84, 42], oscuro: [84, 52, 24] };

function buzon() {
    const l = lienzo();
    // El poste, y la base que lo sujeta al suelo.
    l.caja(14, 21, 17, 29, (x) => (x === 14 ? MADERA.claro : (x === 17 ? MADERA.oscuro : MADERA.medio)));
    l.caja(11, 29, 20, 30, (x) => (x < 13 ? MADERA.claro : (x > 18 ? MADERA.oscuro : MADERA.medio)));
    // La caja: de la 8 a la 23, con la cara de delante y el lado de la derecha más oscuro.
    l.caja(8, 9, 23, 21, (x, y) => {
        const base = x <= 9 ? ROJO.claro : (x >= 21 ? ROJO.oscuro : ROJO.medio);
        return grano(base, x, y, 3, 8);
    });
    // El remate redondo de arriba.
    l.disco(15.9, 9.6, 7.6, (dx, dy) => (dy > 0.5 ? null
        : (dx < -4 ? ROJO.claro : (dx > 4.2 ? ROJO.oscuro : (dy < -5 ? ROJO.claro : ROJO.medio)))));
    // La moldura dorada entre el remate y la caja, y la de abajo.
    l.caja(8, 10, 23, 10, (x) => (x < 11 ? ORO.claro : (x > 20 ? ORO.oscuro : ORO.medio)));
    l.caja(8, 21, 23, 21, (x) => (x < 11 ? ORO.medio : ORO.oscuro));
    // La boca: una ranura negra con el labio de arriba claro.
    l.caja(11, 13, 20, 14, [26, 12, 12]);
    l.caja(11, 12, 20, 12, ORO.claro);
    // El escudo dorado: un sobre pequeño.
    l.caja(13, 16, 18, 19, ORO.medio);
    l.linea(13, 16, 15, 18, ORO.oscuro);
    l.linea(18, 16, 16, 18, ORO.oscuro);
    l.pon(13, 16, ORO.claro);
    return contorno(l, [40, 16, 14]).datos;
}

// ---------------------------------------------------------------------------
// La carta, el paquete y la etiqueta
// ---------------------------------------------------------------------------

const PAPEL = { claro: [246, 240, 222], medio: [228, 218, 190], oscuro: [176, 162, 128] };
const CARTON = { claro: [204, 158, 98], medio: [170, 122, 70], oscuro: [118, 80, 42] };
const CUERDA = [236, 214, 160];
const SELLO = { claro: [236, 96, 84], medio: [190, 40, 36], oscuro: [118, 18, 20] };

/** El sobre: el papel, la solapa en V y la sombra de abajo. Con `sellado`, lacre y sello. */
function carta(sellado) {
    const l = lienzo();
    const x0 = 7;
    const x1 = 24;
    const y0 = 12;
    const y1 = 24;
    l.caja(x0, y0, x1, y1, (x, y) => {
        if (y === y1 || x === x1) {
            return PAPEL.oscuro;
        }
        return grano(y === y0 || x === x0 ? PAPEL.claro : PAPEL.medio, x, y, 5, 6);
    });
    // La solapa: dos líneas de las esquinas de arriba al centro.
    const cx = Math.floor((x0 + x1) / 2);
    l.linea(x0 + 1, y0 + 1, cx, y0 + 7, PAPEL.oscuro);
    l.linea(x1 - 1, y0 + 1, cx + 1, y0 + 7, PAPEL.oscuro);
    // Y las de abajo, más suaves.
    l.linea(x0 + 1, y1 - 1, cx - 2, y0 + 8, oscuro(PAPEL.medio, 0.9));
    l.linea(x1 - 1, y1 - 1, cx + 3, y0 + 8, oscuro(PAPEL.medio, 0.9));
    if (sellado) {
        // El lacre rojo donde se juntan las solapas.
        l.disco(cx + 0.5, y0 + 7.5, 2.4, (dx, dy) => (dx + dy < -1.4 ? SELLO.claro : (dx + dy > 1.4 ? SELLO.oscuro : SELLO.medio)));
        // Y el sello azul en la esquina, con los bordes picados.
        l.caja(x1 - 5, y0 + 1, x1 - 2, y0 + 4, (x, y) => ((x + y) % 2 === 0 && (x === x1 - 5 || x === x1 - 2 || y === y0 + 1 || y === y0 + 4)
            ? [230, 236, 250] : [70, 110, 200]));
        l.pon(x1 - 4, y0 + 2, [180, 210, 255]);
    }
    return contorno(l, [70, 60, 44]).datos;
}

/** El paquete: una caja de cartón con la tapa en perspectiva y la cuerda cruzada. */
function paquete(sellado) {
    const l = lienzo();
    const x0 = 7;
    const x1 = 23;
    const y0 = 15;
    const y1 = 27;
    const fondo = 4;   // lo que sube la tapa hacia atrás
    // La cara de delante.
    l.caja(x0, y0, x1, y1, (x, y) => grano(x === x0 ? CARTON.claro : CARTON.medio, x, y, 9, 10));
    // El lado de la derecha, en sombra.
    for (let k = 1; k <= fondo; k += 1) {
        l.caja(x1 + k, y0 - k, x1 + k, y1 - k, (x, y) => grano(CARTON.oscuro, x, y, 11, 8));
    }
    // La tapa, en claro.
    for (let k = 1; k <= fondo; k += 1) {
        l.caja(x0 + k, y0 - k, x1 + k - 1, y0 - k, (x, y) => grano(CARTON.claro, x, y, 13, 8));
    }
    // La cuerda: una vertical por delante y por la tapa, y una horizontal por delante y por el lado.
    const cx = Math.floor((x0 + x1) / 2);
    l.caja(cx, y0, cx, y1, CUERDA);
    for (let k = 1; k <= fondo; k += 1) {
        l.pon(cx + k, y0 - k, CUERDA);
    }
    const cy = Math.floor((y0 + y1) / 2) + 1;
    l.caja(x0, cy, x1, cy, CUERDA);
    for (let k = 1; k <= fondo; k += 1) {
        l.pon(x1 + k, cy - k, oscuro(CUERDA, 0.8));
    }
    // El lazo, encima de la tapa.
    l.pon(cx + 2, y0 - 3, CUERDA);
    l.pon(cx + 1, y0 - 4, CUERDA);
    l.pon(cx + 3, y0 - 4, CUERDA);
    if (sellado) {
        // Una etiqueta pegada abajo a la izquierda, y el sello rojo encima.
        l.caja(x0 + 2, cy + 2, x0 + 6, y1 - 2, PAPEL.medio);
        l.caja(x0 + 3, cy + 3, x0 + 5, cy + 3, PAPEL.oscuro);
        l.disco(x1 - 3.5, cy + 3.5, 2.2, (dx, dy) => (dx + dy < -1.2 ? SELLO.claro : (dx + dy > 1.2 ? SELLO.oscuro : SELLO.medio)));
    }
    return contorno(l, [56, 36, 18]).datos;
}

/** La etiqueta: una tarjeta con la punta cortada, su agujero y un trozo de cordel. */
function etiqueta() {
    const l = lienzo();
    const x0 = 10;
    const x1 = 23;
    const y0 = 14;
    const y1 = 21;
    l.caja(x0, y0, x1, y1, (x, y) => {
        // La punta de la izquierda, cortada en diagonal.
        const dy = Math.min(y - y0, y1 - y);
        if (x - x0 < 3 - dy) {
            return null;
        }
        return grano(y === y1 || x === x1 ? PAPEL.oscuro : PAPEL.claro, x, y, 17, 6);
    });
    // El agujero y el cordel que sale de él.
    l.pon(x0 + 3, Math.floor((y0 + y1) / 2), [90, 70, 50]);
    l.linea(x0 + 3, Math.floor((y0 + y1) / 2), x0 - 2, y0 - 3, [150, 110, 70]);
    l.linea(x0 - 2, y0 - 3, x0 - 4, y0 - 1, [150, 110, 70]);
    // Dos rayas escritas.
    l.caja(x0 + 6, y0 + 2, x1 - 2, y0 + 2, [120, 120, 150]);
    l.caja(x0 + 6, y0 + 5, x1 - 4, y0 + 5, [120, 120, 150]);
    return contorno(l, [70, 60, 44]).datos;
}

// ---------------------------------------------------------------------------
// La cama: dos casillas, la cabecera arriba y los pies abajo
// ---------------------------------------------------------------------------

const SABANA = { claro: [238, 238, 242], medio: [214, 214, 222], oscuro: [168, 168, 182] };
const MANTA = { claro: [92, 138, 210], medio: [58, 100, 176], oscuro: [34, 62, 124] };
const PIEL = [232, 184, 140];
const PELO = [110, 70, 36];

/** Las barandillas de los lados, de madera, que van de arriba abajo en las dos mitades. */
function barandillas(l, y0, y1) {
    l.caja(4, y0, 5, y1, (x) => (x === 4 ? MADERA.claro : MADERA.medio));
    l.caja(26, y0, 27, y1, (x) => (x === 26 ? MADERA.medio : MADERA.oscuro));
}

/** La manta: del borde `y0` hasta `y1`, con un pliegue arriba; `bulto`, el de quien duerme. */
function manta(l, y0, y1, bulto) {
    l.caja(6, y0, 25, y1, (x, y) => {
        let c = x <= 7 ? MANTA.claro : (x >= 24 ? MANTA.oscuro : MANTA.medio);
        if (bulto) {
            // El bulto se ve por la luz: más claro cuanto más sube, sin raya alrededor.
            const d = bulto(x, y);
            if (d > 0) {
                const t = Math.min(1, d * 1.6);
                c = [0, 1, 2].map((k) => c[k] + (MANTA.claro[k] - c[k]) * t);
            }
        }
        return grano(c, x, y, 21, 6);
    });
}

/** La cabecera (la casilla de arriba): el cabecero, la almohada y el principio de la manta. */
function cabecera(ocupada) {
    const l = lienzo();
    // El cabecero: una tabla ancha con remates.
    l.caja(3, 2, 28, 9, (x, y) => grano(y <= 3 ? MADERA.claro : (x >= 26 ? MADERA.oscuro : MADERA.medio), x, y, 23, 8));
    l.caja(3, 1, 5, 1, MADERA.claro);
    l.caja(26, 1, 28, 1, MADERA.medio);
    l.caja(6, 5, 25, 5, MADERA.oscuro);
    barandillas(l, 10, 31);
    // La sábana y la almohada.
    l.caja(6, 10, 25, 31, (x, y) => grano(x >= 24 ? SABANA.oscuro : SABANA.medio, x, y, 25, 4));
    l.caja(8, 11, 23, 17, (x, y) => (y === 17 || x === 23 ? SABANA.oscuro : SABANA.claro));
    // La manta empieza con el embozo doblado.
    l.caja(6, 21, 25, 22, SABANA.claro);
    manta(l, 23, 31, ocupada ? (x, y) => 1 - Math.hypot((x - 15.5) / 8, (y - 33) / 9) : null);
    if (ocupada) {
        // La cabeza en la almohada: el pelo arriba, la cara abajo, los ojos cerrados.
        l.disco(15.5, 15, 4.2, (dx, dy) => (dy < -0.8 ? PELO : PIEL));
        l.caja(13, 16, 14, 16, oscuro(PIEL, 0.7));
        l.caja(17, 16, 18, 16, oscuro(PIEL, 0.7));
        // Y los hombros, que asoman por el embozo.
        l.caja(10, 19, 21, 20, (x) => (x < 12 || x > 19 ? SABANA.claro : [214, 196, 160]));
    }
    return contorno(l, [44, 28, 14]).datos;
}

/** Los pies (la casilla de abajo): la manta que sigue y el piecero. */
function pies(ocupada) {
    const l = lienzo();
    barandillas(l, 0, 24);
    // Lo que sigue la manta de la cabecera, con el bulto del cuerpo y de los pies.
    manta(l, 0, 22, ocupada ? (x, y) => Math.max(1 - Math.hypot((x - 15.5) / 7.5, (y + 1) / 14),
        1 - Math.hypot((x - 12.5) / 3.2, (y - 17) / 4), 1 - Math.hypot((x - 18.5) / 3.2, (y - 17) / 4)) : null);
    // El borde de la manta que cae por delante.
    l.caja(6, 23, 25, 23, MANTA.oscuro);
    // El piecero: más bajo que el cabecero.
    l.caja(3, 24, 28, 29, (x, y) => grano(y === 24 ? MADERA.claro : (x >= 26 ? MADERA.oscuro : MADERA.medio), x, y, 27, 8));
    l.caja(6, 26, 25, 26, MADERA.oscuro);
    return contorno(l, [44, 28, 14]).datos;
}

// ---------------------------------------------------------------------------
// Los objetos
// ---------------------------------------------------------------------------

/** Una línea de items.xml en el formato del resto de bloques generados. */
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

/**
 * LOS OBJETOS: [id, artículo, nombre, atributos de items.xml, dibujo, banderas de cliente que no
 * salen de los atributos]. El orden de los atributos es el del items.xml escrito: regenerar no lo
 * cambia.
 */
export function objetos() {
    const escribible = (largo) => ({ writable: { maxLength: largo } });
    const fija = { notMoveable: true };
    const cama = (parte, pareja, otra, ocupada) => ({
        blocksSolid: 1, useable: 1, bed: 1, bedPart: parte, partnerDirection: pareja,
        ...(ocupada ? { occupied: 1, freeId: otra } : { occupiedId: otra })
    });
    return [
        [CORREO.BUZON, 'a', 'mailbox', { blocksSolid: 1, mailbox: 1 }, buzon(), fija],
        [CORREO.CARTA, 'a', 'letter', { pickupable: 1, useable: 1, weight: 50, writable: 1, maxTextLen: LARGO_CARTA,
            stampedId: CORREO.CARTA_SELLADA }, carta(false), escribible(LARGO_CARTA)],
        [CORREO.CARTA_SELLADA, 'a', 'stamped letter', { pickupable: 1, useable: 1, weight: 50, readable: 1 }, carta(true), null],
        [CORREO.PAQUETE, 'a', 'parcel', { pickupable: 1, isContainer: 1, containerSize: 10, weight: 1800,
            stampedId: CORREO.PAQUETE_SELLADO }, paquete(false), null],
        [CORREO.PAQUETE_SELLADO, 'a', 'stamped parcel', { pickupable: 1, isContainer: 1, containerSize: 10, weight: 1800 },
            paquete(true), null],
        [CORREO.ETIQUETA, 'a', 'label', { pickupable: 1, useable: 1, weight: 10, writable: 1, maxTextLen: LARGO_ETIQUETA,
            mailLabel: 1 }, etiqueta(), escribible(LARGO_ETIQUETA)],
        // La cama: la cabecera tiene su pareja al sur, y los pies al norte.
        [CAMA.CABECERA, 'a', 'bed', cama('head', 'south', CAMA.CABECERA_OCUPADA, false), cabecera(false), fija],
        [CAMA.PIES, 'a', 'bed', cama('foot', 'north', CAMA.PIES_OCUPADA, false), pies(false), fija],
        [CAMA.CABECERA_OCUPADA, 'a', 'bed', cama('head', 'south', CAMA.CABECERA, true), cabecera(true), fija],
        [CAMA.PIES_OCUPADA, 'a', 'bed', cama('foot', 'north', CAMA.PIES, true), pies(true), fija]
    ];
}

export function generar(opciones) {
    const o = opciones || {};
    const assetsDir = o.assetsDir || path.join(RAIZ, 'client', 'jetyum', 'assets');
    const itemsFile = o.itemsFile || path.join(RAIZ, 'data', 'items', 'items.xml');

    const store = new AssetStore(assetsDir);
    const things = store.readThings();
    const previas = new Map(things.items.map((t) => [t.id, t]));
    const usados = new Set();

    /**
     * Da números a los sprites de una cosa, como en generar-runas.mjs: un dibujo que ya existe
     * reutiliza su número; uno nuevo reescribe el que tenía esa misma cosa si sólo lo usaba ella, y
     * si no, se añade al final.
     */
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

    const lineas = [];
    const cosas = [];
    objetos().forEach(([id, articulo, nombre, atributos, sprite, extra]) => {
        const flags = { ...A.flagsFromServer(atributos), ...(extra || {}) };
        cosas.push({
            id, name: nombre, width: 1, height: 1, exactSize: S, layers: 1,
            patternX: 1, patternY: 1, patternZ: 1, frames: 1, flags, sprites: numerar(id, [sprite])
        });
        lineas.push(lineaXml(id, articulo, nombre, atributos));
    });

    // --- Escribir ---
    const nuevos = new Set(cosas.map((c) => c.id));
    things.items = things.items.filter((t) => !nuevos.has(t.id)).concat(cosas).sort((a, b) => a.id - b.id);
    store.flush();
    const r = store.writeThings(things);
    if (!r.ok) {
        throw new Error('things.json no es válido: ' + r.problems.slice(0, 5).join('; '));
    }
    fs.writeFileSync(itemsFile, ponerBloque(fs.readFileSync(itemsFile, 'utf8'), lineas));
    // Y la tabla de banderas del cliente, que copia items.xml (`npm run banderas:generar`).
    const banderas = o.banderas === false ? null : generarBanderas(o.banderasOpciones);
    return { objetos: cosas.length, sprites: store.count, banderas };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const r = generar();
    console.log('correo y camas: ' + r.objetos + ' objetos; la biblioteca tiene ' + r.sprites + ' sprites; ' +
        'objetos.json: ' + r.banderas.conBanderas + ' objetos con banderas');
}
