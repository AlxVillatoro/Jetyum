'use strict';

/**
 * PNG en Node, sin dependencias: leer (8 bits, sin entrelazar, cualquier tipo de color) y
 * escribir RGBA.
 *
 * Existe para que el servidor de herramientas pueda guardar las hojas de sprites sin pedirle
 * nada al navegador ni instalar `sharp`. El navegador decodifica con su lienzo; aquí se hace a
 * mano porque el formato es pequeño: trozos, zlib y un filtro por fila.
 */

const zlib = require('zlib');

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const TABLA_CRC = (() => {
    const tabla = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        tabla[n] = c >>> 0;
    }
    return tabla;
})();

function crc32(buffer) {
    let c = 0xffffffff;
    for (let i = 0; i < buffer.length; i += 1) {
        c = TABLA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function trozos(buffer) {
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(FIRMA)) {
        throw new Error('no es un PNG');
    }
    const partes = [];
    let offset = 8;
    while (offset + 8 <= buffer.length) {
        const largo = buffer.readUInt32BE(offset);
        const tipo = buffer.toString('ascii', offset + 4, offset + 8);
        partes.push({ tipo, datos: buffer.subarray(offset + 8, offset + 8 + largo) });
        offset += 12 + largo;
        if (tipo === 'IEND') {
            break;
        }
    }
    return partes;
}

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
}

function desfiltrar(datos, stride, alto, bpp) {
    const salida = Buffer.alloc(stride * alto);
    for (let y = 0; y < alto; y += 1) {
        const filtro = datos[y * (stride + 1)];
        const origen = y * (stride + 1) + 1;
        const destino = y * stride;
        for (let i = 0; i < stride; i += 1) {
            const izq = i >= bpp ? salida[destino + i - bpp] : 0;
            const arriba = y > 0 ? salida[destino - stride + i] : 0;
            const arribaIzq = (y > 0 && i >= bpp) ? salida[destino - stride + i - bpp] : 0;
            let v = datos[origen + i];
            if (filtro === 1) { v += izq; }
            else if (filtro === 2) { v += arriba; }
            else if (filtro === 3) { v += (izq + arriba) >> 1; }
            else if (filtro === 4) { v += paeth(izq, arriba, arribaIzq); }
            salida[destino + i] = v & 0xff;
        }
    }
    return salida;
}

/**
 * Lee un PNG y devuelve sus píxeles en RGBA.
 *
 * @param {Buffer} buffer
 * @returns {{width: number, height: number, data: Buffer}}
 */
function decode(buffer) {
    const partes = trozos(buffer);
    const ihdr = partes.find((p) => p.tipo === 'IHDR');
    if (!ihdr) {
        throw new Error('PNG sin cabecera');
    }
    const width = ihdr.datos.readUInt32BE(0);
    const height = ihdr.datos.readUInt32BE(4);
    const profundidad = ihdr.datos[8];
    const tipo = ihdr.datos[9];
    const entrelazado = ihdr.datos[12];

    if (profundidad !== 8) {
        throw new Error('solo se leen PNG de 8 bits por canal (este tiene ' + profundidad + ')');
    }
    if (entrelazado !== 0) {
        throw new Error('los PNG entrelazados no se leen: vuelve a guardarlo sin entrelazar');
    }
    const canales = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipo];
    if (!canales) {
        throw new Error('tipo de color PNG desconocido: ' + tipo);
    }

    const plte = partes.find((p) => p.tipo === 'PLTE');
    const trns = partes.find((p) => p.tipo === 'tRNS');
    const idat = Buffer.concat(partes.filter((p) => p.tipo === 'IDAT').map((p) => p.datos));
    const crudo = desfiltrar(zlib.inflateSync(idat), width * canales, height, canales);

    const data = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i += 1, j += canales) {
        const o = i * 4;
        if (tipo === 6) {
            data[o] = crudo[j]; data[o + 1] = crudo[j + 1]; data[o + 2] = crudo[j + 2]; data[o + 3] = crudo[j + 3];
        } else if (tipo === 2) {
            data[o] = crudo[j]; data[o + 1] = crudo[j + 1]; data[o + 2] = crudo[j + 2]; data[o + 3] = 255;
            if (trns && trns.datos.length >= 6 &&
                trns.datos.readUInt16BE(0) === crudo[j] && trns.datos.readUInt16BE(2) === crudo[j + 1] &&
                trns.datos.readUInt16BE(4) === crudo[j + 2]) {
                data[o + 3] = 0;
            }
        } else if (tipo === 3) {
            const k = crudo[j];
            data[o] = plte.datos[k * 3]; data[o + 1] = plte.datos[k * 3 + 1]; data[o + 2] = plte.datos[k * 3 + 2];
            data[o + 3] = trns && k < trns.datos.length ? trns.datos[k] : 255;
        } else if (tipo === 0) {
            data[o] = data[o + 1] = data[o + 2] = crudo[j]; data[o + 3] = 255;
        } else if (tipo === 4) {
            data[o] = data[o + 1] = data[o + 2] = crudo[j]; data[o + 3] = crudo[j + 1];
        }
    }

    return { width, height, data };
}

function trozo(tipo, datos) {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length, 0);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cuerpo), 0);
    return Buffer.concat([largo, cuerpo, crc]);
}

/**
 * Escribe un PNG RGBA de 8 bits.
 *
 * Cada fila lleva el filtro «Sub», que con sprites de colores planos comprime mucho mejor que
 * sin filtro y es trivial de calcular.
 */
function encode(width, height, data) {
    const stride = width * 4;
    const filas = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
        const o = y * (stride + 1);
        filas[o] = 1;
        for (let i = 0; i < stride; i += 1) {
            const actual = data[y * stride + i];
            const izq = i >= 4 ? data[y * stride + i - 4] : 0;
            filas[o + 1 + i] = (actual - izq) & 0xff;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    return Buffer.concat([
        FIRMA,
        trozo('IHDR', ihdr),
        trozo('IDAT', zlib.deflateSync(filas, { level: 9 })),
        trozo('IEND', Buffer.alloc(0))
    ]);
}

module.exports = { decode, encode, crc32 };
