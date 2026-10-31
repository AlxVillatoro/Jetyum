'use strict';

/**
 * GEOMETRÍA DEL COMBATE: las ÁREAS de los hechizos y la LÍNEA DE VISIÓN.
 *
 * La usan los scripts (`Game.area`, `Game.doAreaCombat`) y los hechizos de los monstruos
 * (engine/world/monstruos.js): un círculo, una onda o un rayo son lo mismo los lance quien los lance.
 */

/**
 * ÁREAS para `Game.doAreaCombat`: listas de desplazamientos `{x, y}` desde el centro. Se pueden
 * escribir como en TFS, con una matriz de cadenas donde '3' es el centro y '1' lo que se alcanza:
 *
 *     Game.area.desdeMatriz(['111', '131', '111'])     // el cuadrado de 3x3
 */
const DIRECCIONES = {
    norte: [0, -1], north: [0, -1], 0: [0, -1], este: [1, 0], east: [1, 0], 1: [1, 0],
    sur: [0, 1], south: [0, 1], 2: [0, 1], oeste: [-1, 0], west: [-1, 0], 3: [-1, 0]
};
const AREA = {
    /** Un círculo de radio r (r=1: las 8 casillas de alrededor y el centro). */
    circulo(r) {
        const lista = [];
        for (let y = -r; y <= r; y += 1) {
            for (let x = -r; x <= r; x += 1) {
                if (x * x + y * y <= r * r + r) {
                    lista.push({ x, y });
                }
            }
        }
        return lista;
    },
    /** Un cuadrado de lado 2r+1. */
    cuadrado(r) {
        const lista = [];
        for (let y = -r; y <= r; y += 1) {
            for (let x = -r; x <= r; x += 1) {
                lista.push({ x, y });
            }
        }
        return lista;
    },
    /** Un rayo recto de `largo` casillas hacia una dirección (sin el centro). */
    rayo(direccion, largo) {
        const d = DIRECCIONES[String(direccion).toLowerCase()] || [0, 1];
        const lista = [];
        for (let i = 1; i <= (largo || 5); i += 1) {
            lista.push({ x: d[0] * i, y: d[1] * i });
        }
        return lista;
    },
    /** Una onda que se abre hacia una dirección (como `exevo flam hur`): 1, 3, 3, 5 casillas... */
    onda(direccion, largo) {
        const d = DIRECCIONES[String(direccion).toLowerCase()] || [0, 1];
        const lista = [];
        for (let i = 1; i <= (largo || 4); i += 1) {
            const ancho = Math.floor((i + 1) / 2);
            for (let j = -ancho + 1; j <= ancho - 1; j += 1) {
                lista.push(d[0] !== 0 ? { x: d[0] * i, y: j } : { x: j, y: d[1] * i });
            }
        }
        return lista;
    },
    /** De una matriz de cadenas al estilo de TFS ('3' el centro, '1' alcanzado). */
    desdeMatriz(filas) {
        let cx = 0;
        let cy = 0;
        filas.forEach((fila, y) => {
            const x = String(fila).indexOf('3');
            if (x !== -1) {
                cx = x;
                cy = y;
            }
        });
        const lista = [];
        filas.forEach((fila, y) => String(fila).split('').forEach((c, x) => {
            if (c === '1' || c === '3') {
                lista.push({ x: x - cx, y: y - cy });
            }
        }));
        return lista;
    }
};

/**
 * ¿Ve `desde` a `hasta`? Una línea recta (Bresenham) de casilla en casilla, sin contar los extremos,
 * que se corta en cualquier casilla con algo que pare los proyectiles (un muro, un árbol, una mesa
 * alta). Es lo que impide lanzar una bola de fuego a través de una pared. Distinta planta, no se ve.
 */
function lineaDeVision(map, desde, hasta) {
    if (!map || !desde || !hasta || desde.z !== hasta.z) {
        return false;
    }
    let x = desde.x;
    let y = desde.y;
    const dx = Math.abs(hasta.x - x);
    const dy = -Math.abs(hasta.y - y);
    const sx = x < hasta.x ? 1 : -1;
    const sy = y < hasta.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
        if (x === hasta.x && y === hasta.y) {
            return true;
        }
        if (!(x === desde.x && y === desde.y)) {
            const tile = map.getTile(x, y, desde.z);
            if (tile && tile.hasProjectileBlocker()) {
                return false;
            }
        }
        const e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y += sy;
        }
    }
}

/** La dirección (0 norte, 1 este, 2 sur, 3 oeste) de `desde` hacia `hasta`, la del eje más largo. */
function direccionHacia(desde, hasta) {
    const dx = hasta.x - desde.x;
    const dy = hasta.y - desde.y;
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 1 : 3;
    }
    return dy > 0 ? 2 : 0;
}

module.exports = { AREA, DIRECCIONES, lineaDeVision, direccionHacia };
