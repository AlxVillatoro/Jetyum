/**
 * UN PERSONAJE DE 8 DIRECCIONES PARA LA VISTA ISOMÉTRICA: `data/arte-hd/personajes/explorador.png`.
 *
 *     node tools/generar-personaje-8d.mjs      (o npm run arte:personaje8)
 *     npm run arte:importar                    (lo mete en el juego como el aspecto 350)
 *
 * No se dibuja a mano: el personaje es un MODELO DE VÓXELES (cabeza, pelo, tronco, brazos, piernas,
 * zurrón) que se gira a cada dirección y se proyecta con la misma cámara que la vista isométrica
 * (rombo 2:1, cámara a 30°), con una luz fija desde arriba a la izquierda. Así las 8 vistas son
 * coherentes entre sí y con el suelo: lo que en Habbo hace el dibujante, aquí lo hace la
 * geometría. Después se le pone un contorno oscuro de un píxel, que es lo que lo hace pixel art.
 *
 * La hoja sigue el formato de `personajes/*.png` (docs/ARTE-HD.md): 3 columnas (quieto, paso,
 * paso) por una fila por dirección, en celdas de 128x128 (2x2 casillas) con el personaje en la
 * casilla de abajo a la derecha. Con 8 filas, las direcciones van en el sentido del reloj desde
 * el norte: N, NE, E, SE, S, SO, O, NO (`direction8` en el cliente).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from './arte-hd.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SALIDA = path.join(RAIZ, 'data/arte-hd/personajes/explorador.png');

/** El lado de una celda (2x2 casillas de 64 px). */
const CELDA = 128;
/** Píxeles por vóxel. */
const ESCALA = 1.55;

/** La paleta: [r, g, b]. */
const COLOR = {
    piel: [232, 190, 150],
    pelo: [92, 56, 30],
    camisa: [58, 112, 170],
    cinturon: [60, 40, 24],
    pantalon: [70, 62, 56],
    bota: [48, 34, 22],
    zurron: [140, 96, 52],
    ojo: [30, 30, 40],
    boca: [160, 90, 80],
    contorno: [24, 22, 30]
};

/**
 * EL MODELO, en vóxeles: x hacia delante, y hacia la izquierda del personaje, z hacia arriba.
 * `paso` es -1, 0 o 1: la pierna izquierda atrás, quieto o delante (los brazos, al revés).
 *
 * @returns {Function} (x, y, z) -> color o null
 */
function modelo(paso) {
    const dentro = (v, a, b) => v >= a && v <= b;
    const cil = (x, y, cx, cy, r) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
    const esf = (x, y, z, cx, cy, cz, r) => (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= r * r;

    const cabezaZ = 27;
    const cabezaR = 7.6;

    return (x, y, z) => {
        // La cabeza: una esfera, con el pelo encima y por detrás (así la espalda se distingue).
        if (esf(x, y, z, 0, 0, cabezaZ, cabezaR)) {
            const frente = x > cabezaR * 0.55;
            // Ojos, boca y nariz: en la cara, mirando hacia +x.
            if (frente && z >= cabezaZ - 0.5 && z <= cabezaZ + 1.5 && (dentro(y, 2, 3.4) || dentro(y, -3.4, -2))) {
                return COLOR.ojo;
            }
            if (x > cabezaR * 0.8 && dentro(z, cabezaZ - 4.5, cabezaZ - 3.5) && dentro(y, -2, 2)) {
                return COLOR.boca;
            }
            const flequillo = z > cabezaZ + 3.2 || (x < -1.5 && z > cabezaZ - 5) || (x > 2 && z > cabezaZ + 2.2 && Math.abs(y) > 2.5);
            return flequillo ? COLOR.pelo : COLOR.piel;
        }
        // El cuello.
        if (z >= 19 && z < cabezaZ - cabezaR + 1.5 && cil(x, y, 0, 0, 2.4)) {
            return COLOR.piel;
        }
        // El tronco: una caja redondeada; cinturón abajo.
        if (dentro(z, 10, 19.5) && cil(x * 1.5, y, 0, 0, 6.2)) {
            if (z < 11.5) {
                return COLOR.cinturon;
            }
            return COLOR.camisa;
        }
        // El zurrón, a la espalda.
        if (dentro(z, 12, 17.5) && dentro(x, -6.6, -4) && dentro(y, -3.5, 3.5)) {
            return COLOR.zurron;
        }
        // Los brazos: cilindros a los lados que se balancean al revés que las piernas.
        for (const lado of [-1, 1]) {
            const balanceo = -lado * paso * 2.2;
            if (dentro(z, 10.5, 19) && cil(x, y, balanceo * ((19 - z) / 8.5), lado * 7.2, 1.9)) {
                return z < 12.5 ? COLOR.piel : COLOR.camisa;
            }
        }
        // Las piernas y las botas.
        for (const lado of [-1, 1]) {
            const avance = lado * paso * 2.4 * (1 - z / 10);
            if (dentro(z, 0, 10) && cil(x, y, avance, lado * 3, 2.4)) {
                return z < 2.5 ? COLOR.bota : COLOR.pantalon;
            }
            // La punta de la bota, hacia delante.
            if (dentro(z, 0, 1.8) && cil(x, y, avance + 1.8, lado * 3, 2.2)) {
                return COLOR.bota;
            }
        }
        return null;
    };
}

/**
 * Dibuja el modelo girado `phi` radianes (0 = mirando a +x del mundo, que en el isométrico es
 * abajo a la derecha) en una celda, con los pies en (cx, cy).
 */
function proyectar(celda, modeloFn, phi, cx, cy) {
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    // La cámara del isométrico: rombo 2:1 (45° de giro, 30° de inclinación).
    const U = Math.SQRT1_2;
    const V = Math.SQRT1_2 * 0.5;
    const Z = Math.sqrt(3) / 2;
    // La luz: desde arriba a la izquierda de la PANTALLA, fija (no gira con el personaje).
    const luz = normalizar([-0.6, 0.6, 1.1]);

    const zbuf = new Float32Array(celda.w * celda.h).fill(Infinity);
    const R = 12;
    for (let z = 0; z <= 36; z++) {
        for (let y = -R; y <= R; y++) {
            for (let x = -R; x <= R; x++) {
                const color = modeloFn(x, y, z);
                if (!color) {
                    continue;
                }
                // La normal: hacia donde no hay vóxeles vecinos.
                let nx = 0;
                let ny = 0;
                let nz = 0;
                for (let d = 1; d <= 2; d++) {
                    nx += (modeloFn(x - d, y, z) ? 1 : 0) - (modeloFn(x + d, y, z) ? 1 : 0);
                    ny += (modeloFn(x, y - d, z) ? 1 : 0) - (modeloFn(x, y + d, z) ? 1 : 0);
                    nz += (modeloFn(x, y, z - d) ? 1 : 0) - (modeloFn(x, y, z + d) ? 1 : 0);
                }
                if (nx === 0 && ny === 0 && nz === 0) {
                    continue; // interior: no se ve
                }
                // Al mundo: giro del personaje.
                const wx = x * cosP - y * sinP;
                const wy = x * sinP + y * cosP;
                const wnx = nx * cosP - ny * sinP;
                const wny = nx * sinP + ny * cosP;
                const n = normalizar([wnx, wny, nz]);
                const difusa = Math.max(0, n[0] * luz[0] + n[1] * luz[1] + n[2] * luz[2]);
                const brillo = 0.5 + 0.55 * difusa;
                const sx = cx + (wx - wy) * U * ESCALA;
                const sy = cy + (wx + wy) * V * ESCALA - z * Z * ESCALA;
                // Más cerca de quien mira: más abajo en pantalla (x + y mayor) y más alto (z mayor).
                const prof = -(wx + wy) * 0.612 - z * 0.5;
                const px0 = Math.round(sx - 1);
                const py0 = Math.round(sy - 1);
                for (let py = py0; py < py0 + 2; py++) {
                    for (let px = px0; px < px0 + 2; px++) {
                        if (px < 0 || py < 0 || px >= celda.w || py >= celda.h) {
                            continue;
                        }
                        const k = py * celda.w + px;
                        if (prof >= zbuf[k]) {
                            continue;
                        }
                        zbuf[k] = prof;
                        const o = k * 4;
                        celda.data[o] = Math.min(255, Math.round(color[0] * brillo));
                        celda.data[o + 1] = Math.min(255, Math.round(color[1] * brillo));
                        celda.data[o + 2] = Math.min(255, Math.round(color[2] * brillo));
                        celda.data[o + 3] = 255;
                    }
                }
            }
        }
    }
    contorno(celda);
}

function normalizar(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}

/** Un píxel oscuro alrededor de la silueta. */
function contorno(img) {
    const copia = Buffer.from(img.data);
    const alfa = (x, y) => (x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : copia[(y * img.w + x) * 4 + 3]);
    for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
            if (alfa(x, y) > 0) {
                continue;
            }
            if (alfa(x - 1, y) || alfa(x + 1, y) || alfa(x, y - 1) || alfa(x, y + 1)) {
                const o = (y * img.w + x) * 4;
                img.data[o] = COLOR.contorno[0];
                img.data[o + 1] = COLOR.contorno[1];
                img.data[o + 2] = COLOR.contorno[2];
                img.data[o + 3] = 255;
            }
        }
    }
}

/** Las 8 direcciones en el sentido del reloj desde el norte, como `direction8` del cliente. */
export const DIRECCIONES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export function generar(salida) {
    const hoja = new Img(3 * CELDA, DIRECCIONES.length * CELDA);
    const pasos = [0, 1, -1];
    DIRECCIONES.forEach((nombre, d) => {
        // El norte del mundo es -y; el este, +x. Mirar al este es phi = 0.
        const phi = (-90 + 45 * d) * Math.PI / 180;
        pasos.forEach((paso, f) => {
            const celda = new Img(CELDA, CELDA);
            // Los pies en el centro de la casilla de abajo a la derecha, 16 px sobre el borde.
            proyectar(celda, modelo(paso), phi, 96, 112);
            hoja.pegar(celda, f * CELDA, d * CELDA);
        });
    });
    hoja.guardar(salida || SALIDA);
    return salida || SALIDA;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const archivo = generar();
    console.log('personaje de 8 direcciones -> ' + path.relative(RAIZ, archivo));
}
