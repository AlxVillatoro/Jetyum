/**
 * LA ALDEA: un mapa básico hecho SÓLO con el arte HD (docs/ARTE-HD.md).
 *
 *     node tools/generar-aldea-hd.mjs          (o npm run mundo:aldea)
 *     node engine/serve.js --map aldea         (o mapName: 'aldea' en config.js)
 *
 * Un claro de 48x40 rodeado de bosque: el templo de piedra (donde se aparece, zona protegida, con
 * el Sanador), la plaza de adoquín con el pozo, la tienda de madera (el Tendero), el lago con el
 * Pescador, un campamento goblin con su hoguera, el bosque de los lobos, el camposanto de los
 * esqueletos y las ratas al sur. Farolas en los caminos (dan luz de noche).
 *
 * Determinista: la misma semilla da el mismo mapa.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Los ids del arte HD (data/arte-hd/manifiesto.json). */
export const HD = {
    hierba: 20001, tierra: 20002, adoquin: 20003, arena: 20004, madera: 20005, losa: 20006,
    alfombra: 20007, agua: 20008, hierbaAlta: 20009, flores: 20010, camino: 20011, barro: 20012,
    muro: 20101, muroVentana: 20102, puerta: 20103, puertaAbierta: 20104, muroMadera: 20105,
    maderaVentana: 20106, valla: 20107, columna: 20108,
    arbol: 20201, pino: 20202, arbusto: 20203, roca: 20204, barril: 20205, caja: 20206, mesa: 20207,
    silla: 20208, cofre: 20209, farola: 20210, cartel: 20211, pozo: 20212, tocon: 20213,
    macizo: 20214, escalera: 20215, hoguera: 20216
};

const ANCHO = 48;
const ALTO = 40;
const Z = 7;

function azar(semilla) {
    let s = semilla >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export function mapaAldea(semilla) {
    const r = azar(semilla === undefined ? 7 : semilla);
    const casillas = new Map();
    const casilla = (x, y) => {
        const k = x + ',' + y;
        if (!casillas.has(k)) {
            casillas.set(k, { x, y, z: Z, ground: HD.hierba, items: [] });
        }
        return casillas.get(k);
    };
    const suelo = (x, y, id) => { casilla(x, y).ground = id; };
    const rectSuelo = (x0, y0, x1, y1, id) => {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                suelo(x, y, id);
            }
        }
    };
    const poner = (x, y, id) => { casilla(x, y).items.push(id); };
    const libre = (x, y) => {
        const c = casillas.get(x + ',' + y);
        return !c || (c.items.length === 0 && [HD.hierba, HD.hierbaAlta, HD.flores].includes(c.ground));
    };
    const zona = (x0, y0, x1, y1) => {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                casilla(x, y).flags = ['protectionZone'];
            }
        }
    };
    /** Un edificio de muros de bloque, con su suelo dentro y una puerta al sur. */
    const edificio = (x0, y0, x1, y1, muro, ventana, sueloDentro, puertaX) => {
        rectSuelo(x0 + 1, y0 + 1, x1 - 1, y1 - 1, sueloDentro);
        for (let x = x0; x <= x1; x++) {
            for (const y of [y0, y1]) {
                if (y === y1 && x === puertaX) {
                    suelo(x, y, sueloDentro);
                    poner(x, y, HD.puerta);
                } else {
                    suelo(x, y, sueloDentro);
                    poner(x, y, (x - x0) % 3 === 2 && x !== x1 ? ventana : muro);
                }
            }
        }
        for (let y = y0 + 1; y < y1; y++) {
            for (const x of [x0, x1]) {
                suelo(x, y, sueloDentro);
                poner(x, y, muro);
            }
        }
    };

    // 1. El terreno: hierba con manchas de hierba alta y flores.
    for (let y = 0; y < ALTO; y++) {
        for (let x = 0; x < ANCHO; x++) {
            const v = r();
            if (v < 0.07) {
                suelo(x, y, HD.hierbaAlta);
            } else if (v < 0.1) {
                suelo(x, y, HD.flores);
            }
        }
    }

    // 2. Los caminos: uno de este a oeste y otro de norte a sur, que se cruzan en la plaza.
    rectSuelo(1, 20, ANCHO - 2, 21, HD.camino);
    rectSuelo(24, 12, 25, ALTO - 2, HD.camino);
    rectSuelo(17, 15, 32, 26, HD.adoquin);          // la plaza
    poner(28, 17, HD.pozo);
    poner(19, 24, HD.macizo);
    poner(30, 24, HD.macizo);
    poner(19, 16, HD.cartel);

    // 3. El templo (zona protegida): losa, alfombra hasta el altar, columnas y el Sanador.
    edificio(8, 3, 17, 12, HD.muro, HD.muroVentana, HD.losa, 12);
    rectSuelo(12, 4, 13, 11, HD.alfombra);
    [[10, 5], [15, 5], [10, 9], [15, 9]].forEach(([x, y]) => poner(x, y, HD.columna));
    zona(9, 4, 16, 11);
    rectSuelo(12, 13, 13, 14, HD.adoquin);         // la escalinata a la plaza

    // 4. La tienda de madera: mesa, sillas, barriles y el cofre.
    edificio(31, 4, 38, 10, HD.muroMadera, HD.maderaVentana, HD.madera, 34);
    poner(33, 6, HD.mesa);
    poner(32, 6, HD.silla);
    poner(37, 5, HD.cofre);
    poner(32, 9, HD.barril);
    poner(37, 9, HD.caja);
    poner(39, 9, HD.barril);
    poner(40, 9, HD.caja);
    rectSuelo(34, 11, 35, 14, HD.camino);

    // 5. El lago, con su orilla de arena.
    rectSuelo(35, 25, 45, 35, HD.arena);
    rectSuelo(37, 27, 44, 34, HD.agua);
    rectSuelo(36, 26, 36, 26, HD.arena);

    // 6. El campamento goblin (oeste): barro, la hoguera y tocones.
    rectSuelo(3, 13, 9, 18, HD.barro);
    poner(6, 15, HD.hoguera);
    poner(4, 14, HD.tocon);
    poner(8, 17, HD.tocon);

    // 7. El camposanto (noreste): vallado, con las rocas por lápidas.
    for (let x = 40; x <= 46; x++) {
        poner(x, 2, HD.valla);
        poner(x, 12, HD.valla);
    }
    for (let y = 3; y <= 11; y++) {
        poner(40, y, HD.valla);
    }
    rectSuelo(41, 3, 46, 11, HD.tierra);
    [[42, 5], [44, 5], [42, 8], [44, 8], [46, 6]].forEach(([x, y]) => poner(x, y, HD.roca));
    rectSuelo(40, 7, 40, 7, HD.tierra);
    casilla(40, 7).items = [];                       // la entrada

    // 8. Farolas en los caminos (de noche dan luz) y el cartel de la entrada.
    [[6, 19], [14, 19], [34, 19], [42, 19], [23, 30], [26, 36], [23, 13]].forEach(([x, y]) => poner(x, y, HD.farola));
    poner(2, 19, HD.cartel);

    // 9. El bosque: un anillo de árboles en el borde (no se sale del mapa) y el bosque del suroeste.
    for (let x = 0; x < ANCHO; x++) {
        for (const y of [0, ALTO - 1]) {
            poner(x, y, x % 2 ? HD.pino : HD.arbol);
        }
    }
    for (let y = 1; y < ALTO - 1; y++) {
        for (const x of [0, ANCHO - 1]) {
            if (!(y === 20 || y === 21)) {
                poner(x, y, y % 2 ? HD.pino : HD.arbol);
            } else {
                poner(x, y, HD.arbusto);
            }
        }
    }
    for (let y = 26; y < ALTO - 2; y++) {
        for (let x = 2; x < 20; x++) {
            if (libre(x, y) && r() < 0.16) {
                poner(x, y, r() < 0.5 ? HD.arbol : HD.pino);
            } else if (libre(x, y) && r() < 0.04) {
                poner(x, y, HD.arbusto);
            }
        }
    }
    // Un claro en medio del bosque (el waypoint «bosque»).
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            casilla(12 + dx, 30 + dy).items = [];
        }
    }
    poner(13, 31, HD.tocon);
    // Algún arbusto y roca sueltos por el claro.
    for (let k = 0; k < 18; k++) {
        const x = 2 + Math.floor(r() * (ANCHO - 4));
        const y = 2 + Math.floor(r() * (ALTO - 4));
        if (libre(x, y) && !(x >= 16 && x <= 33 && y >= 13 && y <= 27)) {
            poner(x, y, r() < 0.6 ? HD.arbusto : HD.roca);
        }
    }

    const tiles = [...casillas.values()].map((c) => {
        const t = { x: c.x, y: c.y, z: c.z, ground: c.ground };
        if (c.items.length) {
            t.items = c.items;
        }
        if (c.flags) {
            t.flags = c.flags;
        }
        return t;
    }).sort((a, b) => a.y - b.y || a.x - b.x);

    return {
        format: 'jetyum-map',
        version: 1,
        name: 'Aldea (arte HD)',
        description: 'Mapa básico hecho con el arte HD (tools/generar-aldea-hd.mjs, docs/ARTE-HD.md).',
        width: ANCHO,
        height: ALTO,
        floors: 16,
        defaultGround: { 7: HD.hierba },
        fallbackGround: HD.hierba,
        tiles,
        waypoints: {
            temple: [12, 8, Z],
            plaza: [24, 22, Z],
            tienda: [34, 8, Z],
            lago: [36, 30, Z],
            campamento: [6, 17, Z],
            bosque: [12, 30, Z],
            camposanto: [43, 9, Z]
        },
        towns: [{ id: 1, name: 'Aldea', temple: [12, 8, Z] }],
        houses: [],
        spawns: [
            { x: 22, y: 33, z: Z, radius: 3, interval: 40000, monsters: [{ name: 'Rat' }, { name: 'Rat' }, { name: 'Rat' }] },
            { x: 10, y: 33, z: Z, radius: 4, interval: 60000, monsters: [{ name: 'Wolf' }, { name: 'Wolf' }] },
            { x: 6, y: 16, z: Z, radius: 2, interval: 60000, monsters: [{ name: 'Goblin' }, { name: 'Goblin' }] },
            { x: 43, y: 7, z: Z, radius: 2, interval: 90000, monsters: [{ name: 'Skeleton' }, { name: 'Skeleton' }] }
        ],
        npcs: [
            { x: 12, y: 5, z: Z, name: 'Sanador', radius: 1 },
            { x: 35, y: 7, z: Z, name: 'Tendero', radius: 1 },
            { x: 36, y: 31, z: Z, name: 'Pescador', radius: 1 }
        ]
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const salida = path.join(RAIZ, 'data/world/aldea.map.json');
    const mapa = mapaAldea();
    fs.writeFileSync(salida, JSON.stringify(mapa));
    console.log('aldea: ' + mapa.tiles.length + ' casillas, ' + mapa.spawns.length + ' grupos de monstruos, ' +
        mapa.npcs.length + ' NPC -> ' + path.relative(RAIZ, salida));
}
