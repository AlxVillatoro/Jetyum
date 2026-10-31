/**
 * GENERA LAS RUNAS, LOS CAMPOS Y LAS HERRAMIENTAS DE CAVAR: su arte, sus cosas y sus objetos.
 *
 *     node tools/generar-runas.mjs        (o npm run runas:generar)
 *
 * El catálogo del OpenTibia Sprite Pack no trae runas, ni campos de fuego, ni pala ni pico, y
 * los ids clásicos de Tibia (2268, 1492...) aquí no existen. Esta herramienta los da de alta con
 * ids propios, a partir del 21000:
 *
 *   21000-21014  runas: la virgen (para conjurar) y las catorce con cargas;
 *   21020-21025  campos: fuego (grande, mediano y pequeño, que se van apagando), energía,
 *                veneno y muro mágico;
 *   21030-21033  pala, pico, el montón de piedras (agujero tapado) y el agujero abierto.
 *
 * QUÉ DIBUJA Y QUÉ REUTILIZA:
 *
 *   - Las runas, la pala, el pico y el montón de piedras son pixel art NUEVO de 32x32, dibujado
 *     aquí con código (determinista: dos ejecuciones dan los mismos píxeles).
 *   - Los campos se montan con los sprites de los EFECTOS que ya hay en things.json: el fuego
 *     grande es el efecto 111 tal cual (mismos números de sprite), el mediano y el pequeño son ese
 *     fuego reducido; la energía es el efecto 102; el veneno, la nube del 103 teñida de verde; y
 *     el muro mágico, un cristal translúcido con el brillo del efecto 108 encima.
 *   - El agujero abierto (21033) usa el dibujo del agujero 10995.
 *
 * SE PUEDE EJECUTAR LAS VECES QUE HAGA FALTA: los objetos van entre las marcas RUNAS de
 * items.xml (se reescribe el bloque), las cosas se sustituyen por id, y los sprites se
 * deduplican (un dibujo que no cambia conserva su número; uno que cambia reescribe el sprite que
 * tenía si solo lo usaba esta cosa). Después hay que regenerar objetos.json
 * (`npm run banderas:generar`; `npm run runas:generar` ya lo hace).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as A from '../shared/js/assets.mjs';

const require = createRequire(import.meta.url);
const { AssetStore, isEmptySprite } = require('../editor/lib/assetstore.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = A.SPRITE_SIZE;

export const MARCA_INICIO = '<!-- RUNAS:inicio · Runas, campos y herramientas (generado por tools/generar-runas.mjs: no editar a mano) -->';
export const MARCA_FIN = '<!-- RUNAS:fin -->';

// ---------------------------------------------------------------------------
// Lienzos
// ---------------------------------------------------------------------------

/** Un lienzo RGBA de `ancho` x `alto`, con lo justo para pintar píxel a píxel. */
function lienzo(ancho, alto) {
    const w = ancho || S;
    const h = alto || w;
    const datos = Buffer.alloc(w * h * 4);
    const dentro = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
    return {
        w, h, datos,
        pon(x, y, color, alfa) {
            if (!dentro(x, y)) {
                return;
            }
            const o = (y * w + x) * 4;
            datos[o] = Math.max(0, Math.min(255, Math.round(color[0])));
            datos[o + 1] = Math.max(0, Math.min(255, Math.round(color[1])));
            datos[o + 2] = Math.max(0, Math.min(255, Math.round(color[2])));
            datos[o + 3] = alfa === undefined ? 255 : Math.max(0, Math.min(255, Math.round(alfa)));
        },
        alfa(x, y) {
            return dentro(x, y) ? datos[(y * w + x) * 4 + 3] : 0;
        },
        color(x, y) {
            const o = (y * w + x) * 4;
            return [datos[o], datos[o + 1], datos[o + 2], datos[o + 3]];
        },
        /** Pinta encima (mezcla «normal») un píxel con su alfa. */
        mezcla(x, y, r, g, b, a) {
            if (!dentro(x, y) || a <= 0) {
                return;
            }
            const o = (y * w + x) * 4;
            const fa = a / 255;
            const da = datos[o + 3] / 255;
            const sa = fa + da * (1 - fa);
            if (sa <= 0) {
                return;
            }
            datos[o] = Math.round((r * fa + datos[o] * da * (1 - fa)) / sa);
            datos[o + 1] = Math.round((g * fa + datos[o + 1] * da * (1 - fa)) / sa);
            datos[o + 2] = Math.round((b * fa + datos[o + 2] * da * (1 - fa)) / sa);
            datos[o + 3] = Math.round(sa * 255);
        }
    };
}

/** Un ruido determinista entre 0 y 1. */
function ruido(n, semilla) {
    const x = Math.sin(n * 12.9898 + semilla * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

const oscuro = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const VECINOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * El contorno de 1 px del estilo del pack: cada píxel vacío que toca uno pintado (en cruz) se
 * pinta de `color`, o del vecino oscurecido si no se da color.
 */
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
// Las runas: una tablilla de piedra con un signo
// ---------------------------------------------------------------------------

const TABLILLA = { x0: 8, y0: 11, x1: 23, y1: 27 };

function tablilla() {
    const l = lienzo();
    const { x0, y0, x1, y1 } = TABLILLA;
    const esquina = (x, y) => {
        const dx = Math.min(x - x0, x1 - x);
        const dy = Math.min(y - y0, y1 - y);
        return dx + dy < 2;
    };
    for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
            if (esquina(x, y)) {
                continue;
            }
            const grano = (ruido(x * 31 + y * 7, 4) - 0.5) * 12;
            let base = [178, 170, 152];
            if (x === x0 || y === y0 || (x === x0 + 1 && y === y0 + 1)) {
                base = [208, 201, 184];
            } else if (x === x1 || y === y1 || (x === x1 - 1 && y === y1 - 1)) {
                base = [132, 124, 108];
            } else if (x >= x1 - 1 || y >= y1 - 1) {
                base = [158, 150, 133];
            }
            l.pon(x, y, [base[0] + grano, base[1] + grano, base[2] + grano]);
        }
    }
    return contorno(l, [58, 52, 46]);
}

/**
 * Un signo en «arte de letras»: cada carácter es un color de la paleta y el punto es vacío. El
 * signo se centra en la tablilla y recibe su propio contorno oscuro.
 */
function signoDeTexto(filas, paleta) {
    const l = lienzo(12, 12);
    const alto = filas.length;
    const ancho = Math.max(...filas.map((f) => f.length));
    const ox = Math.floor((12 - ancho) / 2);
    const oy = Math.floor((12 - alto) / 2);
    filas.forEach((fila, y) => {
        [...fila].forEach((ch, x) => {
            if (paleta[ch]) {
                l.pon(ox + x, oy + y, paleta[ch]);
            }
        });
    });
    return l;
}

/** Un signo dibujado con una función: `f(x, y)` devuelve un color o null (centro en 5.5, 5.5). */
function signoDeFuncion(f) {
    const l = lienzo(12, 12);
    for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 12; x += 1) {
            const c = f(x - 5.5, y - 5.5, x, y);
            if (c) {
                l.pon(x, y, c);
            }
        }
    }
    return l;
}

/** Una esfera con brillo arriba a la izquierda y sombra abajo a la derecha. */
function esfera(radio, claro, medio, sombra) {
    return signoDeFuncion((dx, dy) => {
        const d = Math.hypot(dx, dy);
        if (d > radio) {
            return null;
        }
        if (Math.hypot(dx + radio * 0.38, dy + radio * 0.38) < radio * 0.36) {
            return claro;
        }
        if (dx + dy > radio * 0.75) {
            return sombra;
        }
        return medio;
    });
}

/** Un estallido de puntas: `puntas` picos alrededor de un núcleo amarillo. */
function estallido(puntas, radio, pico, colores, giro) {
    return signoDeFuncion((dx, dy) => {
        const d = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) + (giro || 0);
        const borde = radio + pico * Math.pow(Math.abs(Math.cos(ang * puntas / 2)), 3);
        if (d > borde) {
            return null;
        }
        const t = d / borde;
        return t < 0.35 ? colores[0] : (t < 0.7 ? colores[1] : colores[2]);
    });
}

const SIGNOS = {
    // La calavera negra de la muerte súbita, con los ojos morados.
    sd: () => signoDeTexto([
        '..aaaaaa..',
        '.aaaaaaaa.',
        'aaaaaaaaaa',
        'aaccaaccaa',
        'aaccaaccaa',
        'aaaaddaaaa',
        '.aaaaaaaa.',
        '..adaadda.',
        '..aaaaaa..'
    ], { a: [44, 34, 54], c: [196, 84, 240], d: [12, 8, 16] }),
    // La cruz roja grande de la curación total.
    uh: () => signoDeTexto([
        '...aaaa...',
        '...acca...',
        '...acaa...',
        'aaaaaaaaaa',
        'acccaaaaaa',
        'acaaaaaaaa',
        'aaaaaaaaaa',
        '...aaaa...',
        '...aaaa...',
        '...aaaa...'
    ], { a: [222, 30, 36], c: [255, 150, 150] }),
    // La cruz naranja, de brazos más finos, de la curación intensa.
    ih: () => signoDeTexto([
        '...aaa...',
        '...aca...',
        '...aca...',
        'aaaaaaaaa',
        'acccaaaaa',
        'aaaaaaaaa',
        '...aaa...',
        '...aaa...',
        '...aaa...'
    ], { a: [240, 132, 28], c: [255, 214, 150] }),
    // Los proyectiles mágicos: una esfera azul grande y una verde pequeña.
    hmm: () => esfera(4.6, [190, 225, 255], [60, 112, 232], [32, 54, 150]),
    lmm: () => esfera(3.4, [200, 255, 190], [72, 190, 64], [34, 112, 30]),
    // La gran bola de fuego: una bola naranja con el borde que llamea.
    gfb: () => signoDeFuncion((dx, dy) => {
        const d = Math.hypot(dx, dy + 0.5);
        const ang = Math.atan2(dy, dx);
        const borde = 3.6 + (dy < 0 ? 1.3 * Math.abs(Math.sin(ang * 3)) : 0.4);
        if (d > borde) {
            return null;
        }
        return d < 1.6 ? [255, 244, 160] : (d < 3 ? [250, 160, 40] : [214, 82, 20]);
    }),
    // La explosión: una estrella de ocho puntas, roja por fuera.
    explosion: () => estallido(8, 2.3, 3.1, [[255, 236, 140], [246, 136, 34], [204, 34, 24]], Math.PI / 8),
    // Los campos: una llama, un rayo y una gota.
    fuego: () => signoDeTexto([
        '....a.....',
        '....aa....',
        '...aaa..a.',
        '...aaaa.a.',
        '..aaacaaa.',
        '.aaaccaaa.',
        '.aacccyaa.',
        '.aacyyyca.',
        '.aacyyyca.',
        '..aaccaa..'
    ], { a: [226, 78, 20], c: [250, 170, 40], y: [255, 240, 150] }),
    bomba: () => signoDeTexto([
        '....a.....',
        '...aca....',
        '...aya....',
        '....a.....',
        '.a......a.',
        'aca....aca',
        'aya....aya',
        '.a..a...a.',
        '...aca....',
        '...aya....',
        '....a.....'
    ], { a: [226, 78, 20], c: [250, 170, 40], y: [255, 240, 150] }),
    energia: () => signoDeTexto([
        '......aaa.',
        '.....aca..',
        '....aca...',
        '...aca....',
        '..accaaaa.',
        '.aaaacca..',
        '....aca...',
        '...aca....',
        '..aa......',
        '..a.......'
    ], { a: [120, 170, 255], c: [235, 245, 255] }),
    veneno: () => signoDeTexto([
        '....aa....',
        '....aa....',
        '...aaaa...',
        '...aaaa...',
        '..aaaaaa..',
        '.acaaaaaa.',
        '.acaaaaaa.',
        '.aacaaaaa.',
        '..aaaaaa..',
        '...aaaa...'
    ], { a: [70, 178, 40], c: [184, 246, 140] }),
    // El muro mágico: ladrillos azules.
    muro: () => signoDeTexto([
        'cccdccccdc',
        'aaadaaaada',
        'aaadaaaada',
        'dddddddddd',
        'cdccccdccc',
        'adaaaadaaa',
        'adaaaadaaa',
        'dddddddddd',
        'cccdccccdc',
        'aaadaaaada'
    ], { a: [104, 152, 236], c: [176, 210, 255], d: [36, 56, 136] }),
    // Destruir campo: un círculo tachado (sin contorno: el aro ya es oscuro).
    destruir: () => signoDeFuncion((dx, dy) => {
        const d = Math.hypot(dx, dy);
        if (d >= 4 && d <= 5.3) {
            return [72, 66, 62];
        }
        if (d < 4.2 && Math.abs(dx + dy) < 1.1) {
            return [214, 40, 34];
        }
        return null;
    }),
    // La parálisis: una espiral azul celeste.
    paralizar: () => {
        const l = lienzo(12, 12);
        for (let t = 0; t <= Math.PI * 4.2; t += 0.02) {
            const r = 0.4 + t * 0.36;
            l.pon(Math.round(5.5 + r * Math.cos(t)), Math.round(5.5 + r * Math.sin(t)), t < 3 ? [210, 250, 255] : [80, 214, 238]);
        }
        return l;
    }
};

/** Una runa: la tablilla con su signo (sin signo, la runa virgen). */
function runa(signo) {
    const l = tablilla();
    if (!signo) {
        return l.datos;
    }
    const g = signo === 'destruir' ? SIGNOS[signo]() : contorno(SIGNOS[signo]());
    const ox = 10;
    const oy = 13;
    for (let y = 0; y < g.h; y += 1) {
        for (let x = 0; x < g.w; x += 1) {
            if (g.alfa(x, y) > 0) {
                const [r, gg, b] = g.color(x, y);
                l.pon(ox + x, oy + y, [r, gg, b]);
            }
        }
    }
    return l.datos;
}

// ---------------------------------------------------------------------------
// Las herramientas: pintadas a lo largo de un eje en diagonal
// ---------------------------------------------------------------------------

const MADERA = { claro: [176, 124, 66], medio: [136, 90, 44], oscuro: [92, 58, 28] };
const METAL = { claro: [214, 220, 228], medio: [160, 166, 178], oscuro: [100, 104, 116] };

/**
 * Pinta una herramienta en diagonal (de abajo a la izquierda a arriba a la derecha). `forma(u, v)`
 * dice el material del punto a `u` píxeles del origen a lo largo del mango y a `v` de lado.
 */
function herramienta(origen, forma) {
    const l = lienzo();
    const k = Math.SQRT1_2;
    for (let y = 0; y < S; y += 1) {
        for (let x = 0; x < S; x += 1) {
            const px = x + 0.5 - origen[0];
            const py = y + 0.5 - origen[1];
            const u = (px - py) * k;
            const v = (px + py) * k;
            const m = forma(u, v);
            if (m) {
                const tono = v < -0.4 ? m.claro : (v > 0.6 ? m.oscuro : m.medio);
                l.pon(x, y, tono);
            }
        }
    }
    return contorno(l, [40, 32, 28]).datos;
}

function pala() {
    return herramienta([7, 27], (u, v) => {
        const av = Math.abs(v);
        if (u >= 0 && u <= 9) {
            const ancho = u < 3 ? 1.2 + u * 0.75 : 3.4;
            return av <= ancho ? METAL : null;
        }
        if (u > 9 && u <= 11) {
            return av <= 1 ? METAL : null;
        }
        if (u > 11 && u <= 23) {
            return av <= 0.9 ? MADERA : null;
        }
        if (u > 23 && u <= 25.5) {
            return av <= 3 ? MADERA : null;
        }
        return null;
    });
}

function pico() {
    return herramienta([8, 27], (u, v) => {
        const av = Math.abs(v);
        const centro = 17.5 - 0.06 * v * v;
        if (av <= 9.5 && Math.abs(u - centro) <= Math.max(0.5, 1.9 - av * 0.14)) {
            return METAL;
        }
        if (u >= 0 && u <= 20 && av <= 0.9) {
            return MADERA;
        }
        return null;
    });
}

/** Un montón de piedras grises, apoyado abajo en el centro de la casilla. */
function monton() {
    const l = lienzo();
    const piedras = [
        [16, 18, 3.4], [11, 21, 3.6], [21, 21, 3.4], [7, 25, 3.2], [15, 24, 4.2],
        [24, 25, 3.4], [11, 27, 3.0], [19, 27, 3.2]
    ];
    piedras.forEach(([cx, cy, r], i) => {
        const base = 120 + Math.round(ruido(i, 7) * 40);
        for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y += 1) {
            for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x += 1) {
                const dx = x + 0.5 - cx;
                const dy = (y + 0.5 - cy) * 1.15;
                const d = Math.hypot(dx, dy);
                if (d > r) {
                    continue;
                }
                let tono = base;
                if (d > r - 1) {
                    tono = 54;
                } else if (dx + dy < -r * 0.5) {
                    tono = base + 42;
                } else if (dx + dy > r * 0.45) {
                    tono = base - 34;
                }
                tono += (ruido(x * 17 + y * 5, i) - 0.5) * 8;
                l.pon(x, y, [tono, tono - 2, tono - 8]);
            }
        }
    });
    return contorno(l, [40, 38, 36]).datos;
}

// ---------------------------------------------------------------------------
// Los campos: imágenes compuestas a partir de los efectos
// ---------------------------------------------------------------------------

/** El fotograma `f` de una cosa, compuesto en un lienzo de (32*ancho) x (32*alto). */
function componer(store, cosa, f) {
    const l = lienzo(S * cosa.width, S * cosa.height);
    for (let h = 0; h < cosa.height; h += 1) {
        for (let w = 0; w < cosa.width; w += 1) {
            const id = cosa.sprites[A.spriteIndex(cosa, w, h, 0, 0, 0, 0, f)];
            if (!id) {
                continue;
            }
            const px = store.getSprite(id);
            const ox = l.w - S * (w + 1);
            const oy = l.h - S * (h + 1);
            for (let y = 0; y < S; y += 1) {
                px.copy(l.datos, ((oy + y) * l.w + ox) * 4, y * S * 4, (y + 1) * S * 4);
            }
        }
    }
    return l;
}

/** Corta un lienzo en sprites en el orden de una cosa de un fotograma (w primero, ancla abajo a la derecha). */
function trocear(l) {
    const W = l.w / S;
    const H = l.h / S;
    const trozos = [];
    for (let h = 0; h < H; h += 1) {
        for (let w = 0; w < W; w += 1) {
            const sprite = Buffer.alloc(A.SPRITE_BYTES);
            const ox = l.w - S * (w + 1);
            const oy = l.h - S * (h + 1);
            for (let y = 0; y < S; y += 1) {
                l.datos.copy(sprite, y * S * 4, ((oy + y) * l.w + ox) * 4, ((oy + y) * l.w + ox + S) * 4);
            }
            trozos.push(sprite);
        }
    }
    return trozos;
}

/**
 * Reduce un lienzo a `escala` (vecino más próximo, para no emborronar el pixel art) dejándolo
 * apoyado en la misma base y centrado en la misma columna que el original.
 */
function reducir(l, escala, baseY, centroX) {
    const salida = lienzo(l.w, l.h);
    for (let y = 0; y < l.h; y += 1) {
        for (let x = 0; x < l.w; x += 1) {
            const sx = Math.floor(centroX + (x + 0.5 - centroX) / escala);
            const sy = Math.floor(baseY - (baseY - (y + 0.5)) / escala);
            if (sx < 0 || sy < 0 || sx >= l.w || sy >= l.h) {
                continue;
            }
            const [r, g, b, a] = l.color(sx, sy);
            if (a > 0) {
                salida.pon(x, y, [r, g, b], a);
            }
        }
    }
    return salida;
}

/**
 * Tiñe un lienzo: le pone a cada píxel el tono `hue` (0-360), con la luz multiplicada por
 * `luzF` y la saturación por `satF` (la nube rosa del efecto es muy clara para ser veneno).
 */
function tenir(l, hue, luzF, satF) {
    const salida = lienzo(l.w, l.h);
    for (let y = 0; y < l.h; y += 1) {
        for (let x = 0; x < l.w; x += 1) {
            const [r, g, b, a] = l.color(x, y);
            if (!a) {
                continue;
            }
            const max = Math.max(r, g, b) / 255;
            const min = Math.min(r, g, b) / 255;
            const luz0 = (max + min) / 2;
            const sat0 = max === min ? 0 : (max - min) / (1 - Math.abs(2 * luz0 - 1));
            const luz = Math.min(1, luz0 * (luzF || 1));
            const sat = Math.min(1, sat0 * (satF || 1));
            const c = (1 - Math.abs(2 * luz - 1)) * sat;
            const hp = hue / 60;
            const xx = c * (1 - Math.abs((hp % 2) - 1));
            const [r1, g1, b1] = hp < 1 ? [c, xx, 0] : hp < 2 ? [xx, c, 0] : hp < 3 ? [0, c, xx]
                : hp < 4 ? [0, xx, c] : hp < 5 ? [xx, 0, c] : [c, 0, xx];
            const m = luz - c / 2;
            salida.pon(x, y, [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255], a);
        }
    }
    return salida;
}

function espejo(l) {
    const salida = lienzo(l.w, l.h);
    for (let y = 0; y < l.h; y += 1) {
        for (let x = 0; x < l.w; x += 1) {
            const [r, g, b, a] = l.color(l.w - 1 - x, y);
            if (a) {
                salida.pon(x, y, [r, g, b], a);
            }
        }
    }
    return salida;
}

/**
 * El muro mágico: un bloque de cristal azulado translúcido con unas vetas de luz que se mueven,
 * y el brillo del efecto 108 (`brillo`, un lienzo de 32x32, en sus fotogramas pequeños) en el centro.
 */
function muroMagico(fotograma, brillo) {
    const l = lienzo();
    const x0 = 5;
    const x1 = 26;
    const y0 = 3;
    const y1 = 29;
    for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
            const esquina = (x === x0 || x === x1) && (y === y0 || y === y1);
            if (esquina) {
                continue;
            }
            const filo = x === x0 || x === x1 || y === y0 || y === y1;
            const cara = y <= y0 + 4;
            const veta = ((x + y + fotograma * 3) % 11) < 2;
            if (filo) {
                l.pon(x, y, [214, 236, 255], 230);
            } else if (cara) {
                l.pon(x, y, [190, 222, 255], 190);
            } else if (veta) {
                l.pon(x, y, [200, 230, 255], 170);
            } else {
                l.pon(x, y, [96, 150, 232], 120);
            }
        }
    }
    for (let x = x0 + 1; x < x1; x += 1) {
        l.pon(x, y0 + 5, [150, 196, 250], 210);
    }
    if (brillo) {
        for (let y = 0; y < S; y += 1) {
            for (let x = 0; x < S; x += 1) {
                const [r, g, b, a] = brillo.color(x, y);
                l.mezcla(x, y, r, g, b, a * 0.7);
            }
        }
    }
    return l;
}

// ---------------------------------------------------------------------------
// Los objetos
// ---------------------------------------------------------------------------

const RUNA = { pickupable: 1, useable: 1, rune: 1, weight: 120 };

/** Las runas: [id, artículo, nombre, cargas, signo]. */
export const RUNAS = [
    [21000, 'a', 'blank rune', 0, null],
    [21001, 'a', 'sudden death rune', 3, 'sd'],
    [21002, 'an', 'ultimate healing rune', 1, 'uh'],
    [21003, 'an', 'intense healing rune', 1, 'ih'],
    [21004, 'a', 'heavy magic missile rune', 10, 'hmm'],
    [21005, 'a', 'light magic missile rune', 10, 'lmm'],
    [21006, 'a', 'great fireball rune', 4, 'gfb'],
    [21007, 'an', 'explosion rune', 6, 'explosion'],
    [21008, 'a', 'fire field rune', 3, 'fuego'],
    [21009, 'a', 'fire bomb rune', 2, 'bomba'],
    [21010, 'an', 'energy field rune', 3, 'energia'],
    [21011, 'a', 'poison field rune', 3, 'veneno'],
    [21012, 'a', 'magic wall rune', 3, 'muro'],
    [21013, 'a', 'destroy field rune', 3, 'destruir'],
    [21014, 'a', 'paralyze rune', 1, 'paralizar']
];

export const CAMPOS = {
    FUEGO_GRANDE: 21020, FUEGO_MEDIANO: 21021, FUEGO_PEQUENO: 21022,
    ENERGIA: 21023, VENENO: 21024, MURO_MAGICO: 21025
};
export const HERRAMIENTAS = { PALA: 21030, PICO: 21031, MONTON: 21032, AGUJERO: 21033 };

/** El agujero del pack cuyo dibujo y banderas copia el agujero abierto. */
const AGUJERO_DEL_PACK = 10995;

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

/** Los atributos de servidor de un objeto que pasan a banderas de cliente (`useable` = «usar con»). */
function banderasDe(atributos, extra) {
    const flags = A.flagsFromServer(atributos);
    return { ...flags, ...(extra || {}) };
}

export function generar(opciones) {
    const o = opciones || {};
    const assetsDir = o.assetsDir || path.join(RAIZ, 'client', 'jetyum', 'assets');
    const itemsFile = o.itemsFile || path.join(RAIZ, 'data', 'items', 'items.xml');

    const store = new AssetStore(assetsDir);
    const things = store.readThings();
    const previas = new Map(things.items.map((t) => [t.id, t]));
    const efecto = (id) => {
        const cosa = (things.effects || []).find((t) => t.id === id);
        if (!cosa) {
            throw new Error('falta el efecto ' + id + ' en things.json');
        }
        return cosa;
    };
    const lineas = [];
    const cosas = [];
    const usados = new Set();

    /**
     * Da números a los sprites de una cosa. Un dibujo que ya existe (idéntico) reutiliza su
     * número; uno nuevo reescribe el sprite que tenía esa misma pieza si solo lo usaba esta cosa
     * (al cambiar el arte no se acumulan versiones viejas), y si no, se añade al final.
     */
    const numerar = (id, sprites) => {
        const previa = previas.get(id);
        return sprites.map((sprite, k) => {
            if (isEmptySprite(sprite)) {
                return 0;
            }
            // El índice de huellas del almacén: el mismo que usa addSprites para deduplicar.
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

    const alta = (cosa, articulo, atributos) => {
        cosas.push(cosa);
        lineas.push(lineaXml(cosa.id, articulo, cosa.name, atributos));
    };

    const simple = (id, nombre, sprite, flags) => ({
        id, name: nombre, width: 1, height: 1, exactSize: S, layers: 1,
        patternX: 1, patternY: 1, patternZ: 1, frames: 1, flags, sprites: numerar(id, [sprite])
    });

    /** Una cosa animada de `fotogramas` lienzos del mismo tamaño, en bucle. */
    const animada = (id, nombre, fotogramas, ms, flags, hd) => {
        const W = fotogramas[0].w / S;
        const H = fotogramas[0].h / S;
        const sprites = numerar(id, fotogramas.flatMap(trocear));
        return {
            id, name: nombre, width: W, height: H, exactSize: Math.min(256, S * Math.max(W, H)), layers: 1,
            patternX: 1, patternY: 1, patternZ: 1, frames: fotogramas.length,
            animation: { mode: 'async', loop: 0, start: 0, durations: fotogramas.map(() => [ms, ms]) },
            flags: { ...flags, animateAlways: true, notMoveable: true, ...(hd ? { hd: true } : {}) },
            sprites
        };
    };

    // --- Runas ---
    RUNAS.forEach(([id, articulo, nombre, cargas, signo]) => {
        const atributos = { ...RUNA };
        if (cargas > 0) {
            atributos.charges = cargas;
            atributos.showcharges = 1;
        }
        const flags = banderasDe(atributos);
        delete flags.forceUse;
        flags.multiUse = true;
        alta(simple(id, nombre, runa(signo), flags), articulo, atributos);
    });

    // --- Campos de fuego: el efecto 111 (una llama) grande, y reducido para el mediano y el pequeño ---
    const llama = efecto(111);
    const fotogramasLlama = [0, 1, 2, 1];
    const lienzosLlama = fotogramasLlama.map((f) => componer(store, llama, f));
    const fuego = (id, escala, siguiente, luz) => {
        const atributos = { fieldType: 'fire', fieldDamage: 20, decayTo: siguiente, duration: 60 };
        const flags = banderasDe(atributos, { light: { level: luz, color: 208 } });
        let cosa;
        if (escala === 1) {
            // El grande es el efecto tal cual: los mismos números de sprite.
            const sprites = fotogramasLlama.flatMap((f) => llama.sprites.slice(f * 4, f * 4 + 4));
            cosa = {
                id, name: 'fire field', width: 2, height: 2, exactSize: 64, layers: 1,
                patternX: 1, patternY: 1, patternZ: 1, frames: fotogramasLlama.length,
                animation: { mode: 'async', loop: 0, start: 0, durations: fotogramasLlama.map(() => [150, 150]) },
                flags: { ...flags, animateAlways: true, notMoveable: true, hd: true }, sprites
            };
        } else {
            cosa = animada(id, 'fire field', lienzosLlama.map((l) => reducir(l, escala, 50, 32)), 150, flags, true);
        }
        alta(cosa, 'a', atributos);
    };
    fuego(CAMPOS.FUEGO_GRANDE, 1, CAMPOS.FUEGO_MEDIANO, 6);
    fuego(CAMPOS.FUEGO_MEDIANO, 0.8, CAMPOS.FUEGO_PEQUENO, 4);
    fuego(CAMPOS.FUEGO_PEQUENO, 0.6, 0, 3);

    // --- Campo de energía: el efecto 102 (estallido azul) en sus fotogramas grandes ---
    {
        const chispas = efecto(102);
        const fotogramas = [1, 2, 3, 2];
        const atributos = { fieldType: 'energy', fieldDamage: 30, decayTo: 0, duration: 120 };
        alta({
            id: CAMPOS.ENERGIA, name: 'energy field', width: 2, height: 2, exactSize: 64, layers: 1,
            patternX: 1, patternY: 1, patternZ: 1, frames: fotogramas.length,
            animation: { mode: 'async', loop: 0, start: 0, durations: fotogramas.map(() => [120, 120]) },
            flags: { ...banderasDe(atributos, { light: { level: 3, color: 173 } }), animateAlways: true, notMoveable: true, hd: true },
            sprites: fotogramas.flatMap((f) => chispas.sprites.slice(f * 4, f * 4 + 4))
        }, 'an', atributos);
    }

    // --- Campo de veneno: la nube del efecto 103 teñida de verde, que burbujea ---
    {
        const nube = efecto(103);
        const a = tenir(componer(store, nube, 0), 100, 0.72, 1.6);
        const b = tenir(componer(store, nube, 1), 100, 0.72, 1.6);
        const atributos = { fieldType: 'poison', fieldDamage: 5, decayTo: 0, duration: 120 };
        alta(animada(CAMPOS.VENENO, 'poison field', [a, b, espejo(b), espejo(a)], 300, banderasDe(atributos), true),
            'a', atributos);
    }

    // --- Muro mágico: cristal translúcido con el brillo del efecto 108 ---
    {
        const brillo = efecto(108);
        const fotogramas = [0, 1, 8, 7].map((f, i) => muroMagico(i, componer(store, brillo, f)));
        const atributos = { fieldType: 'magicwall', blocksSolid: 1, blocksProjectile: 1, blocksPathfind: 1, decayTo: 0, duration: 20 };
        alta(animada(CAMPOS.MURO_MAGICO, 'magic wall', fotogramas, 200, banderasDe(atributos, { light: { level: 2, color: 173 } }), false),
            'a', atributos);
    }

    // --- Herramientas ---
    [[HERRAMIENTAS.PALA, 'shovel', pala(), 3500], [HERRAMIENTAS.PICO, 'pick', pico(), 4500]].forEach(([id, nombre, sprite, peso]) => {
        // `useWith`: se usan SOBRE algo (el montón de piedras, el suelo), con la cruz del cliente.
        // Va el último, como en el items.xml que ya está escrito, para que regenerar no lo cambie.
        const atributos = { pickupable: 1, useable: 1, weight: peso, useWith: 1 };
        const flags = banderasDe(atributos);
        delete flags.forceUse;
        flags.multiUse = true;
        alta(simple(id, nombre, sprite, flags), 'a', atributos);
    });
    {
        const atributos = { onBottom: 1, useable: 1 };
        alta(simple(HERRAMIENTAS.MONTON, 'pile of stones', monton(), banderasDe(atributos, { notMoveable: true })), 'a', atributos);
    }
    {
        const agujero = things.items.find((t) => t.id === AGUJERO_DEL_PACK);
        if (!agujero) {
            throw new Error('falta el agujero ' + AGUJERO_DEL_PACK + ' en things.json');
        }
        const atributos = { onBottom: 1, blocksPathfind: 1, floorchange: 'down', decayTo: HERRAMIENTAS.MONTON, duration: 60 };
        alta({ ...JSON.parse(JSON.stringify(agujero)), id: HERRAMIENTAS.AGUJERO, name: 'hole' }, 'a', atributos);
    }

    // --- Escribir ---
    const nuevos = new Set(cosas.map((c) => c.id));
    things.items = things.items.filter((t) => !nuevos.has(t.id)).concat(cosas).sort((a, b) => a.id - b.id);
    store.flush();
    const r = store.writeThings(things);
    if (!r.ok) {
        throw new Error('things.json no es válido: ' + r.problems.slice(0, 5).join('; '));
    }
    fs.writeFileSync(itemsFile, ponerBloque(fs.readFileSync(itemsFile, 'utf8'), lineas));
    return { objetos: cosas.length, sprites: store.count };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const r = generar();
    console.log('runas, campos y herramientas: ' + r.objetos + ' objetos; la biblioteca tiene ' + r.sprites +
        ' sprites (objetos.json se regenera con npm run banderas:generar; npm run runas:generar ya lo hace)');
}
