/**
 * Cortar imágenes en sprites de 32x32, y la DISTRIBUCIÓN DE LA HOJA DE UNA COSA.
 *
 * Es cálculo puro sobre arrays RGBA —ni lienzo ni red—, así que se prueba en Node
 * (`tools/test-assets.mjs`). La pestaña Sprites pone el lienzo y el API.
 *
 * LA HOJA DE UNA COSA es la imagen con la que se importa o exporta una cosa entera de una vez
 * (`docs/SPRITES.md`, «Importar una cosa entera»):
 *
 *   - cada CELDA mide ancho*32 x alto*32: es el dibujo completo de un patrón en un fotograma;
 *   - cada COLUMNA es un fotograma;
 *   - cada FILA es una combinación de capa, patrón Z, patrón Y y patrón X, en ese orden (la X
 *     cambia la primera). En un aspecto: cuatro filas seguidas son norte, este, sur y oeste.
 */

import {
    SPRITE_SIZE,
    dimensionsOf,
    spriteIndex
} from '../../shared/js/assets.mjs';

const S = SPRITE_SIZE;

/** ¿Es transparente del todo? */
export function esVacio(rgba) {
    for (let i = 3; i < rgba.length; i += 4) {
        if (rgba[i] !== 0) {
            return false;
        }
    }
    return true;
}

/**
 * ¿Es el MAGENTA DE FONDO (#FF00FF)? Es el color que ObjectBuilder y las hojas de sprites de
 * Tibia usan como transparente. Se acepta un margen porque las imágenes que han pasado por un
 * formato con pérdida (JPEG, WebP) ya no traen el magenta exacto, sino uno parecido.
 */
export function esMagenta(r, g, b) {
    return r >= 0xe0 && b >= 0xe0 && g <= 0x30;
}

/**
 * ¿Es un píxel TEÑIDO de magenta? Es lo que queda en el contorno de un dibujo cuando la imagen
 * ha pasado por un formato con pérdida: el color del borde se mezcla con el del fondo.
 */
export function esRosado(r, g, b) {
    // Claro (R y B altos): el morado oscuro de un contorno o de una gema no cuenta.
    return r >= 150 && b >= 150 && r - g >= 60 && b - g >= 60;
}

/**
 * Vuelve transparente el fondo magenta de una imagen RGBA, en el sitio, y devuelve cuántos
 * píxeles ha cambiado.
 *
 * Después limpia el CONTORNO: los píxeles teñidos de magenta que tocan un píxel transparente
 * (hasta dos de profundidad). Solo el contorno, para no comerse lo morado del interior de un
 * dibujo (una gema, una capa). Con una imagen PNG limpia no hay nada que limpiar.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} [width] sin ancho no se limpia el contorno
 */
export function quitarFondoMagenta(data, width) {
    let cambiados = 0;
    const borrar = (i) => {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
        cambiados += 1;
    };
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] !== 0 && esMagenta(data[i], data[i + 1], data[i + 2])) {
            borrar(i);
        }
    }
    if (!width) {
        return cambiados;
    }
    const height = data.length / 4 / width;
    for (let pasada = 0; pasada < 2; pasada += 1) {
        const marcados = [];
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const i = (y * width + x) * 4;
                if (data[i + 3] === 0 || !esRosado(data[i], data[i + 1], data[i + 2])) {
                    continue;
                }
                const tocaFondo = (x > 0 && data[i - 1] === 0) ||
                    (x < width - 1 && data[i + 7] === 0) ||
                    (y > 0 && data[i - width * 4 + 3] === 0) ||
                    (y < height - 1 && data[i + width * 4 + 3] === 0);
                if (tocaFondo) {
                    marcados.push(i);
                }
            }
        }
        marcados.forEach(borrar);
    }
    return cambiados;
}

/** ¿Mide la imagen un número entero de casillas de 32? */
export function esMultiploDe32(width, height) {
    return width % S === 0 && height % S === 0;
}

/**
 * Parte una lista en tandas. La biblioteca se sube por tandas para que ninguna petición pase del
 * límite del servidor: una hoja de 1000 sprites son unos 5 MB en base64.
 */
export function enTandas(lista, tamano) {
    const tandas = [];
    for (let i = 0; i < lista.length; i += tamano) {
        tandas.push(lista.slice(i, i + tamano));
    }
    return tandas;
}

/** Copia un recuadro de 32x32 de una imagen RGBA. Lo que cae fuera queda transparente. */
export function recortar(data, width, height, x0, y0) {
    const salida = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y += 1) {
        const fy = y0 + y;
        if (fy < 0 || fy >= height) {
            continue;
        }
        for (let x = 0; x < S; x += 1) {
            const fx = x0 + x;
            if (fx < 0 || fx >= width) {
                continue;
            }
            const o = (fy * width + fx) * 4;
            const d = (y * S + x) * 4;
            salida[d] = data[o];
            salida[d + 1] = data[o + 1];
            salida[d + 2] = data[o + 2];
            salida[d + 3] = data[o + 3];
        }
    }
    return salida;
}

/**
 * Corta una imagen en sprites de 32x32, de izquierda a derecha y de arriba abajo. Es el orden
 * en el que se numeran al importarse: la casilla de arriba a la izquierda es el primer sprite.
 *
 * @returns {Array<{columna:number, fila:number, rgba:Uint8ClampedArray, vacio:boolean}>}
 */
export function trocearImagen(data, width, height) {
    const piezas = [];
    const columnas = Math.ceil(width / S);
    const filas = Math.ceil(height / S);
    for (let fila = 0; fila < filas; fila += 1) {
        for (let columna = 0; columna < columnas; columna += 1) {
            const rgba = recortar(data, width, height, columna * S, fila * S);
            piezas.push({ columna, fila, rgba, vacio: esVacio(rgba) });
        }
    }
    return piezas;
}

/** La forma de la hoja de una cosa (ver la cabecera). */
export function distribucionDeHoja(thing) {
    const d = dimensionsOf(thing);
    return {
        celdaAncho: d.width * S,
        celdaAlto: d.height * S,
        columnas: d.frames,
        filas: d.layers * d.patternZ * d.patternY * d.patternX,
        ancho: d.frames * d.width * S,
        alto: d.layers * d.patternZ * d.patternY * d.patternX * d.height * S,
        /** La fila de una combinación. */
        fila(capa, px, py, pz) {
            return ((capa * d.patternZ + pz) * d.patternY + py) * d.patternX + px;
        }
    };
}

/**
 * Las piezas de una hoja de cosa, cada una con el ÍNDICE que le toca en la lista de sprites.
 * La imagen puede ser más pequeña que la hoja: lo que falta queda transparente.
 *
 * @returns {Array<{indice:number, rgba:Uint8ClampedArray}>}
 */
export function piezasDeHoja(thing, data, width, height) {
    const d = dimensionsOf(thing);
    const hoja = distribucionDeHoja(thing);
    const piezas = [];
    for (let capa = 0; capa < d.layers; capa += 1) {
        for (let pz = 0; pz < d.patternZ; pz += 1) {
            for (let py = 0; py < d.patternY; py += 1) {
                for (let px = 0; px < d.patternX; px += 1) {
                    const fila = hoja.fila(capa, px, py, pz);
                    for (let f = 0; f < d.frames; f += 1) {
                        for (let h = 0; h < d.height; h += 1) {
                            for (let w = 0; w < d.width; w += 1) {
                                const x = f * hoja.celdaAncho + (d.width - 1 - w) * S;
                                const y = fila * hoja.celdaAlto + (d.height - 1 - h) * S;
                                piezas.push({
                                    indice: spriteIndex(thing, w, h, capa, px, py, pz, f),
                                    rgba: recortar(data, width, height, x, y)
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    return piezas;
}

/** Bytes a base64, en el navegador y en Node. */
export function base64DeBytes(bytes) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    }
    let texto = '';
    const trozo = 0x8000;
    for (let i = 0; i < bytes.length; i += trozo) {
        texto += String.fromCharCode.apply(null, bytes.subarray(i, i + trozo));
    }
    return btoa(texto);
}
