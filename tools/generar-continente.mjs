/**
 * EL CONTINENTE: el mapa grande, con TODO el contenido del juego en un solo mundo.
 *
 *     node tools/generar-continente.mjs              # escribe data/world/continente.map.json
 *     node tools/generar-continente.mjs --salida d   # en otra carpeta (las pruebas lo usan)
 *
 * Se juega con `mapName: 'continente'` en config.js. Lo que tiene:
 *
 * ESTÁ HECHO COMO LOS MAPAS DE TIBIA (se estudió el `world.otbm` de TFS 8.60): nada es un
 * rectángulo porque sí. El relieve sale de RUIDO con semilla (costas, fronteras entre tierras,
 * manchas de tierra, charcas, bosques en grupos); las montañas tienen base que no se pisa y MESETA
 * en la planta de arriba con su escalera de piedra; las casas tienen TEJADO (o piso de arriba) que
 * el cliente esconde al entrar; las ciudades, MURALLA con puertas; y las cuevas son galerías
 * irregulares (un autómata celular) rodeadas de roca.
 *
 *   - UNA ISLA de 256x256 rodeada de mar, con cinco tierras: la pradera del centro, la nieve del
 *     norte, el desierto del suroeste, el pantano del sureste y las tierras calcinadas del oeste,
 *     más el bosque y la granja del este y un río que serpentea, con sus puentes.
 *   - SEIS MONTAÑAS con cima (campamento de cíclopes en la más alta) y su escalera.
 *   - CUATRO CIUDADES (Jetyum, Escarcha, Arenal y Ciénaga) amuralladas, cada una con su templo
 *     octogonal, su depósito (cofres con `townId`: el depósito es de esa ciudad), su buzón, su
 *     banco, su tienda, farolas y casas alquilables (en L, algunas de dos plantas) con cama. En
 *     cada templo, una marca de CIUDADANO (actionId 30020 + id de la ciudad, como el
 *     `citizen.lua` de TFS) hace al jugador vecino de esa ciudad.
 *   - TODOS LOS MONSTRUOS en respawns por su tierra (los importados de TFS, en `ZONAS`), y los 8
 *     NPC repartidos por las ciudades.
 *   - BAJO TIERRA, tres plantas de cuevas (alcantarillas, minas, tumba, cripta, catacumbas,
 *     laberinto, guarida y el abismo, con el cofre del tesoro al fondo), unidas por escaleras,
 *     agujeros con su punto de cuerda y montones de piedras que se abren con la pala.
 *   - UNA TORRE con dos pisos encima (plantas 6 y 5).
 *   - EL MUSEO (planta 12), al que se llega por el teleport de Jetyum: TODOS los objetos del
 *     catálogo, por salas, cada uno con su número al mirarlo; la sala de los efectos y la de los
 *     proyectiles (se ven al pisar cada marca) y el probador, donde se prueba cada aspecto. Las
 *     piezas no se pueden coger ni usar (`data/scripts/actions/museo.js`).
 *
 * TODO SE CONSTRUYE CON EL CÓDIGO DEL EDITOR, como el mapa «jetyum» (`generar-mundo-otsp.mjs`, del
 * que se toman las piezas): muros con el pincel de muro, puertas con el de huecos y los bordes de
 * cada suelo con el auto-borde. Es determinista: el azar sale de una semilla fija.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as P from '../editor/js/pinceles.js';
import {
    Obra, SUELOS, ADORNOS, MUEBLES, ESCALERAS, pincelesOtsp, mezclarPinceles,
    estanque, macizo, huerto, mercado, campamento, ruinas
} from './generar-mundo-otsp.mjs';

const require = createRequire(import.meta.url);
const Xml = require('../engine/data/xml.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = 10000;
const o = (n) => n + O;
const Z = 7;

export const ANCHO = 256;
export const ALTO = 256;
/** La planta del museo: lejos de las cuevas, sin nada encima ni debajo. */
export const Z_MUSEO = 12;

/** Los actionId que usa el mapa (los scripts los leen de aquí). */
export const AID = {
    ciudadano: 30020,       // + id de la ciudad (data/scripts/movements/tiles/ciudadano.js)
    pieza: 40000,           // una pieza del museo: se mira y no se toca (data/scripts/actions/museo.js)
    efecto: 41000,          // + id del efecto: al pisar, el efecto
    aspecto: 42000,         // + lookType: al pisar, ese aspecto; al salir, el tuyo
    proyectil: 43000        // + id del proyectil: al pisar, el proyectil
};

// ---------------------------------------------------------------------------
// El catálogo de lo que se usa (identificadores DEL PACK, salvo donde se dice)
// ---------------------------------------------------------------------------

/** Los suelos de cada tierra. */
const TIERRA = {
    nieve: [145],
    // Un solo suelo por tierra: las variantes del pack tienen otro tono y salen a cuadros.
    desierto: [126],
    playa: [128],
    barro: [138],
    ceniza: [140],
    cueva: [203, 204, 205, 206, 207],
    roca: [139, 140],
    tumba: [151],
    cripta: [155],
    abismo: [143, 162],
    puente: [172],
    camino: [203, 204, 205],
    caminoNieve: [155],
    caminoArena: [151],
    caminoCiudad: [152]
};

const NATURALEZA = {
    pinos: [1505, 1508, 1566, 1579],
    munecos: [1217, 1218],
    cristal: [1277],
    cactus: [2583, 2585],
    palmera: [2584],
    secos: [1500, 1501, 1502, 1513, 1514],
    helechos: [1476, 1477, 1487, 1488, 1489, 1490, 1491, 1492, 1493, 1494, 1495, 1496, 1497],
    setasGrandes: [1585, 1586],
    huesos: [2233, 2248],
    bosque: [1503, 1504, 1506, 1507, 1509, 1510, 1511, 1512, 1531, 1532, 1533, 1534, 1535, 1536, 1537,
        1562, 1563, 1564, 1565, 1569, 1577, 1578, 1580, 1581, 1582]
};

/**
 * LOS MUROS DE ROCA del pack (ids del juego). Las «rocas» 10919-10961 NO son peñascos sueltos: son
 * las piezas de un muro de montaña (vertical, horizontal, poste y esquina, como los muros de piedra),
 * y sueltas salen torcidas y cortadas. Se ponen con el pincel de muro, que elige cada pieza por sus
 * vecinos: el contorno de las montañas y de las cuevas. (Se comprobó montando con cada juego un
 * anillo, una L y una diagonal; el de roca negra no cierra las esquinas y no se usa.)
 *
 * Las tablas salen del MUESTRARIO DE MUROS corregido a mano (`data/world/muestrario-muros.map.json`):
 * en la gris y la parda las esquinas NE y SO llevan la pieza contraria a la de Tibia y los extremos
 * no son postes; la diagonal «/» (`barra`, ver `editor/js/pinceles.js`) lleva piezas propias. Las
 * 21101-21104 son piezas que el pack no trae, teñidas del material (`tools/generar-piezas-de-muro.mjs`).
 */
export const MUROS_DE_ROCA = {
    arena: {
        piezas: { vertical: 10919, horizontal: 10920, poste: 10921, esquina: 10934 },
        barra: { diagonal_se: 21104, fin_oeste: 21104, fin_este: 10934 }
    },
    gris: {
        piezas: { vertical: 10957, horizontal: 10956, poste: 10958, esquina: 10960, diagonal_se: 10961, diagonal_ne: 10956,
            diagonal_so: 10957, fin_oeste: 10956, fin_este: 10956, fin_sur: 10956, cruce: 10961 },
        barra: { diagonal_se: 21101, esquina: 10957, fin_este: 10957, fin_oeste: 21101, remate: 21102 }
    },
    parda: {
        piezas: { vertical: 10946, horizontal: 10947, poste: 10949, esquina: 10948, diagonal_ne: 10947, diagonal_so: 10946,
            fin_norte: 10946, fin_sur: 10946, fin_oeste: 10947, fin_este: 10947 },
        barra: { diagonal_se: 10953, fin_este: 10949 }
    },
    nieve: {
        piezas: { vertical: 10935, horizontal: 10936, poste: 10937, esquina: 21103 }
    }
};

/** Los bordes del pack: doce piezas seguidas (n, e, s, w, esquinas y diagonales) desde su base. */
const BORDES = { nieve: 399, arena: 315, barro: 375, roca: 327 };

const AGUA = SUELOS.agua;
const DEPOSITO = 11112;         // depot chest (id del juego)
const BUZON = 21040;
const CAMA = [21050, 21051];    // cabecera y pies (al sur)
const TELEPORT = 1387;
const MARCA = 10462;            // el cuadro de alfombra que marca una casilla especial
const CARTEL = 11277;           // el cristal que lleva el nombre de cada sala del museo
const MONTON = 21032;           // montón de piedras: la pala lo abre en un agujero
const COFRE_TESORO = 11111;     // el cofre de una vez (data/scripts/actions/others/one_time_chest.js)
const FAROLA = 20210;           // la farola (arte HD): el pack no trae
/** Arbustos redondos de una casilla y plantas pequeñas que se pisan (ids del pack). */
const ARBUSTOS_PEQUENOS = [1478, 1479, 1480, 1483, 1484, 1485];
const PLANTAS_PEQUENAS = Array.from({ length: 160 }, (_, i) => 1316 + i);

// ---------------------------------------------------------------------------
// Azar con semilla
// ---------------------------------------------------------------------------

function azar(semilla) {
    let s = semilla >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// ---------------------------------------------------------------------------
// Los pinceles: los de «jetyum» y los de las tierras nuevas (sólo en memoria)
// ---------------------------------------------------------------------------

function piezasDeBorde(base) {
    const claves = ['n', 'e', 's', 'w', 'cnw', 'cne', 'csw', 'cse', 'dnw', 'dne', 'dsw', 'dse'];
    return Object.fromEntries(claves.map((k, i) => [k, o(base + i)]));
}

/**
 * Los pinceles con los que se construye: los del editor más los de nieve, desierto, barro y
 * ceniza, con sus bordes. NO se escriben en `pinceles.json` (los de «otsp-*» los rehace
 * `generar-mundo-otsp.mjs`); quien quiera pintar con ellos en el editor los tiene en el mapa.
 */
export function pincelesContinente(items) {
    const crudo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'editor', 'pinceles.json'), 'utf8'));
    const mezclado = mezclarPinceles(crudo, pincelesOtsp());
    const suelo = (id, nombre, z, ids, borde) => ({
        id: 'cont-' + id, nombre, z,
        items: ids.filter((n, i) => ids.indexOf(n) === i).map((n, i) => ({ id: o(n), chance: i === 0 ? 60 : 15 })),
        ...(borde ? { borde } : {})
    });
    mezclado.muros = mezclado.muros.concat(Object.entries(MUROS_DE_ROCA).map(([k, def]) =>
        ({ id: 'cont-roca-' + k, nombre: 'Roca (' + k + ')', ...def })));
    mezclado.bordes = mezclado.bordes.concat(Object.entries(BORDES).map(([k, base]) => ({ id: 'cont-borde-' + k, piezas: piezasDeBorde(base) })));
    // La arena de la playa (la de «otsp-arena») echa su borde sobre el agua.
    mezclado.suelos = mezclado.suelos.map((s) => (s.id === 'otsp-arena' ? { ...s, borde: 'cont-borde-arena' } : s));
    mezclado.suelos = mezclado.suelos.concat([
        suelo('nieve', 'Nieve', 40, TIERRA.nieve, 'cont-borde-nieve'),
        suelo('desierto', 'Desierto', 33, TIERRA.desierto, 'cont-borde-arena'),
        suelo('barro', 'Barro', 30, TIERRA.barro, 'cont-borde-barro'),
        suelo('ceniza', 'Ceniza', 28, TIERRA.ceniza),
        // La cima de las montañas (planta 6): roca con su borde, que cae sobre el vacío de alrededor.
        suelo('cima', 'Cima', 45, [139], 'cont-borde-roca')
    ]);
    const { data, problemas } = P.normalizarPinceles(mezclado, items);
    if (problemas.length) {
        throw new Error('pinceles no válidos: ' + problemas.slice(0, 5).join('; '));
    }
    return data;
}

// ---------------------------------------------------------------------------
// El constructor: la Obra del mapa «jetyum», con lo que hace falta para algo más grande
// ---------------------------------------------------------------------------

class Continente extends Obra {
    constructor(items, pinceles, cosas) {
        super(items, pinceles, ANCHO, ALTO, 2026);
        this.items = items;
        /** El tamaño de cada objeto en casillas (things.json): para no pisar lo grande. */
        this.cosas = cosas;
        /**
         * LO QUE YA TIENE DUEÑO en la superficie: 0 libre; 1 despejado (calles, claros, alrededor de
         * los edificios: no se decora, pero una calle puede pasar); 2 construido (ni se decora ni lo
         * pisa una calle).
         */
        this.ocupado = new Uint8Array(ANCHO * ALTO);
        this.spawns = [];
        this.npcs = [];
        this.waypoints = {};
        this.towns = [];
        this.houses = [];
    }

    /** Un objeto por su id DEL JUEGO (no del pack). */
    poner(x, y, id, atributos) {
        const tile = this.m.editableTile(x, y, this.z);
        tile.items.push(atributos ? { id, attributes: atributos } : { id });
        this.m.markDirty(x, y, this.z);
    }

    /** Un suelo por su id DEL JUEGO. */
    sueloJuego(x, y, id) {
        this.m.paintGround(x, y, this.z, id);
    }

    reservar(x0, y0, x1, y1, nivel) {
        const n = nivel || 2;
        for (let y = Math.max(0, y0); y <= Math.min(ALTO - 1, y1); y += 1) {
            for (let x = Math.max(0, x0); x <= Math.min(ANCHO - 1, x1); x += 1) {
                this.ocupado[y * ANCHO + x] = Math.max(this.ocupado[y * ANCHO + x], n);
            }
        }
    }

    reservada(x, y) {
        return x < 0 || y < 0 || x >= ANCHO || y >= ALTO || this.ocupado[y * ANCHO + x] !== 0;
    }

    construida(x, y) {
        return x < 0 || y < 0 || x >= ANCHO || y >= ALTO || this.ocupado[y * ANCHO + x] === 2;
    }

    /** ¿Se puede poner algo aquí? Sin dueño, sin nada encima y sobre un suelo que se pisa. */
    libre(x, y) {
        if (this.reservada(x, y)) {
            return false;
        }
        const tile = this.m.tileAt(x, y, this.z);
        if (tile && tile.items.length) {
            return false;
        }
        const suelo = this.m.groundAt(x, y, this.z);
        const def = this.items.get(Number(suelo));
        return !(def && def.attributes && def.attributes.blocksSolid);
    }

    /** Un MURO DE ROCA (`MUROS_DE_ROCA`) en unas casillas: el pincel elige cada pieza por sus vecinas. */
    muroDeRoca(casillas, nombre) {
        P.pintarMuro(this.m, this.idx, this.muros.get('cont-roca-' + nombre), casillas, this.z);
    }

    /** Lo que es AGUA no se pisa: el mar, el río y los estanques. */
    esAgua(x, y) {
        const suelo = this.m.groundAt(x, y, this.z);
        return AGUA.map(o).includes(Number(suelo));
    }

    respawn(x, y, z, radio, intervalo, nombres) {
        this.spawns.push({ x, y, z, radius: radio, interval: intervalo, monsters: nombres.map((name) => ({ name })) });
    }

    npc(x, y, z, nombre, radio) {
        this.npcs.push(radio === undefined ? { x, y, z, name: nombre } : { x, y, z, name: nombre, radius: radio });
    }

    /** Un rectángulo de suelo del pack en la planta actual (ids sueltos o lista). */
    rect(x0, y0, x1, y1, lista) {
        this.sueloRect(x0, y0, x1, y1, lista);
    }

    /** Una calle: un trazo de `ancho` casillas entre dos puntos, en L (primero en x). */
    calle(a, b, lista, ancho) {
        const w = ancho || 3;
        const h = Math.floor(w / 2);
        const tramo = (x0, y0, x1, y1) => {
            for (let y = Math.min(y0, y1) - h; y <= Math.max(y0, y1) + (w - 1 - h); y += 1) {
                for (let x = Math.min(x0, x1) - h; x <= Math.max(x0, x1) + (w - 1 - h); x += 1) {
                    if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO) {
                        continue;
                    }
                    if (this.construida(x, y)) {
                        continue;   // no se lleva por delante un edificio, una plaza ni el mar
                    }
                    // Sobre el agua, un puente de tablones; si no, el suelo de la calle.
                    this.suelo(x, y, this.esAgua(x, y) ? this.elegir(TIERRA.puente) : this.elegir(lista));
                    this.ocupado[y * ANCHO + x] = 1;
                }
            }
        };
        tramo(a[0], a[1], b[0], a[1]);
        tramo(b[0], a[1], b[0], b[1]);
    }

    /** Una línea de calles por varios puntos. */
    camino(puntos, lista, ancho) {
        for (let i = 1; i < puntos.length; i += 1) {
            this.calle(puntos[i - 1], puntos[i], lista, ancho);
        }
    }

    /**
     * Un edificio: suelo, muro alrededor, una puerta en el lado que se diga y ventanas si el muro
     * las tiene. (x0, y0) es la esquina NO y (x1, y1) la SE, las dos de muro.
     */
    edificio(x0, y0, x1, y1, muro, suelo, lado, ventanas) {
        this.rect(x0, y0, x1, y1, suelo);
        this.muroRect(x0, y0, x1, y1, muro);
        const cx = Math.floor((x0 + x1) / 2);
        const cy = Math.floor((y0 + y1) / 2);
        const puerta = { n: { x: cx, y: y0 }, s: { x: cx, y: y1 }, e: { x: x1, y: cy }, w: { x: x0, y: cy } }[lado || 's'];
        this.puerta(puerta.x, puerta.y);
        if (ventanas !== false) {
            ['n', 's', 'e', 'w'].filter((l) => l !== (lado || 's')).forEach((l) => {
                const v = { n: { x: x0 + 2, y: y0 }, s: { x: x1 - 2, y: y1 }, e: { x: x1, y: y0 + 2 }, w: { x: x0, y: y1 - 2 } }[l];
                this.ventana(v.x, v.y);
            });
        }
        this.reservar(x0 - 1, y0 - 1, x1 + 1, y1 + 1, 1);
        this.reservar(x0, y0, x1, y1, 2);
        const fuera = { n: { x: puerta.x, y: y0 - 1 }, s: { x: puerta.x, y: y1 + 1 }, e: { x: x1 + 1, y: puerta.y }, w: { x: x0 - 1, y: puerta.y } }[lado || 's'];
        return { x0, y0, x1, y1, puerta, fuera };
    }

    /** Decora al azar un rectángulo con objetos del pack sobre casillas libres. */
    salpicar(x0, y0, x1, y1, densidad, familias, condicion) {
        for (let y = y0; y <= y1; y += 1) {
            for (let x = x0; x <= x1; x += 1) {
                if (this.rnd() < densidad && this.libre(x, y) && (!condicion || condicion(x, y))) {
                    const familia = Array.isArray(familias[0]) ? this.elegir(familias) : familias;
                    this.objeto(x, y, this.elegir(familia));
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// El relieve: ruido suave con semilla (lo que da costas, fronteras y manchas que no son rectas)
// ---------------------------------------------------------------------------

function picadillo(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruido de valor con varias octavas: (x, y, escala, octavas) -> 0..1, suave y con semilla. */
export function ruido(semilla) {
    const suave = (t) => t * t * (3 - 2 * t);
    const valor = (x, y) => {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = suave(x - ix);
        const fy = suave(y - iy);
        const a = picadillo(ix, iy, semilla);
        const b = picadillo(ix + 1, iy, semilla);
        const c = picadillo(ix, iy + 1, semilla);
        const d = picadillo(ix + 1, iy + 1, semilla);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    return (x, y, escala, octavas) => {
        let total = 0;
        let amp = 1;
        let suma = 0;
        let f = 1 / (escala || 32);
        for (let k = 0; k < (octavas || 4); k += 1) {
            total += valor(x * f + k * 17.3, y * f - k * 9.1) * amp;
            suma += amp;
            amp *= 0.5;
            f *= 2;
        }
        return total / suma;
    };
}

const COSTA = ruido(11);
const FRONTERA = ruido(23);
const FRONTERA2 = ruido(37);
const MANCHAS = ruido(51);
const ESPESURA = ruido(67);
const VAIVEN = ruido(83);

// ---------------------------------------------------------------------------
// La isla y sus tierras
// ---------------------------------------------------------------------------

/**
 * Las cajas de las ciudades (con su muralla y un margen): ahí siempre hay tierra firme, la diga
 * el ruido o no.
 */
const TIERRA_FIRME = [];

export function esMar(x, y) {
    if (x < 2 || y < 2 || x > ANCHO - 3 || y > ALTO - 3) {
        return true;
    }
    if (TIERRA_FIRME.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) {
        return false;
    }
    const dx = (x - ANCHO / 2) / (ANCHO / 2 - 4);
    const dy = (y - ALTO / 2) / (ALTO / 2 - 4);
    const borde = Math.max(Math.abs(dx), Math.abs(dy)) * 0.85 + Math.hypot(dx, dy) * 0.15;
    return borde + (COSTA(x, y, 22, 4) - 0.5) * 0.16 > 0.95;
}

const mares = new Map();
/** ¿Está a `r` casillas o menos del mar? (la playa) */
function cercaDelMar(x, y, r) {
    const k = x + ',' + y + ',' + r;
    if (!mares.has(k)) {
        let si = false;
        for (let dy = -r; dy <= r && !si; dy += 1) {
            for (let dx = -r; dx <= r && !si; dx += 1) {
                si = esMar(x + dx, y + dy);
            }
        }
        mares.set(k, si);
    }
    return mares.get(k);
}

function esPlaya(x, y) {
    return !esMar(x, y) && cercaDelMar(x, y, 2);
}

/** La tierra de una casilla de la superficie: las fronteras serpentean con el ruido. */
export function tierraDe(x, y) {
    const n = (FRONTERA(x, y, 18, 3) - 0.5) * 26;
    const m = (FRONTERA2(x, y, 18, 3) - 0.5) * 22;
    if (y + n < 70) {
        return 'nieve';
    }
    if (y + n > 182) {
        if (x + m < 120) {
            return 'desierto';
        }
        if (x + m > 136) {
            return 'pantano';
        }
        return 'pradera';
    }
    if (x + m < 58) {
        return 'ceniza';
    }
    if (x - m > 188) {
        return 'bosque';
    }
    return 'pradera';
}

/** Los suelos y las manchas de cada tierra: tierra en la pradera, charcas en el pantano... */
function terreno(obra) {
    for (let y = 0; y < ALTO; y += 1) {
        for (let x = 0; x < ANCHO; x += 1) {
            if (esMar(x, y)) {
                obra.suelo(x, y, obra.elegir(AGUA));
                obra.ocupado[y * ANCHO + x] = 2;
                continue;
            }
            if (esPlaya(x, y)) {
                obra.suelo(x, y, obra.elegir(TIERRA.playa));
                continue;
            }
            const t = tierraDe(x, y);
            const mancha = MANCHAS(x, y, 9, 3);
            if (t === 'nieve') {
                obra.suelo(x, y, mancha > 0.7 ? 175 : obra.elegir(TIERRA.nieve));
            } else if (t === 'desierto') {
                obra.suelo(x, y, mancha > 0.72 ? 151 : obra.elegir(TIERRA.desierto));
            } else if (t === 'pantano') {
                if (mancha > 0.74 && !TIERRA_FIRME.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) {
                    obra.suelo(x, y, obra.elegir(AGUA));
                } else {
                    obra.suelo(x, y, mancha > 0.62 ? 141 : obra.elegir(TIERRA.barro));
                }
            } else if (t === 'ceniza') {
                obra.suelo(x, y, mancha > 0.7 ? 162 : obra.elegir(TIERRA.ceniza));
            } else if (mancha > 0.7) {
                obra.suelo(x, y, obra.elegir(TIERRA.camino));
            } else if (obra.rnd() < 0.12) {
                obra.suelo(x, y, obra.elegir(SUELOS.hierba.slice(1)));
            }
        }
    }
}

/** El río: baja de la nieve por el bosque hasta el mar del este, serpenteando. */
const RIO = [[178, 60], [181, 80], [184, 100], [188, 124], [195, 142], [210, 156], [230, 164], [255, 170]];

function rio(obra) {
    for (let i = 1; i < RIO.length; i += 1) {
        const [ax, ay] = RIO[i - 1];
        const [bx, by] = RIO[i];
        const pasos = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let k = 0; k <= pasos; k += 1) {
            const x0 = Math.round(ax + (bx - ax) * k / pasos + (VAIVEN(k + i * 50, 0, 12, 2) - 0.5) * 6);
            const y0 = Math.round(ay + (by - ay) * k / pasos);
            const ancho = 1 + Math.round(VAIVEN(0, k + i * 50, 9, 2) * 1.6);
            for (let dy = -ancho; dy <= ancho; dy += 1) {
                for (let dx = -ancho; dx <= ancho; dx += 1) {
                    const x = x0 + dx;
                    const y = y0 + dy;
                    if (x >= 0 && x < ANCHO && y >= 0 && y < ALTO && dx * dx + dy * dy <= ancho * ancho + 1) {
                        obra.suelo(x, y, obra.elegir(AGUA));
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Caminos que serpentean
// ---------------------------------------------------------------------------

/**
 * UN SENDERO entre varios puntos: va de uno a otro dando un rodeo suave (el ruido lo aparta del
 * trazo recto) y con el ancho que se diga. Sobre el agua, puente; nunca pisa lo construido.
 */
function sendero(obra, puntos, lista, ancho, desvio) {
    const w = ancho || 3;
    const amplitud = desvio === undefined ? 3 : desvio;
    let semilla = 0;
    for (let i = 1; i < puntos.length; i += 1) {
        const [ax, ay] = puntos[i - 1];
        const [bx, by] = puntos[i];
        const pasos = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
        const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
        for (let k = 0; k <= pasos; k += 1) {
            semilla += 1;
            // el desvío es nulo en los extremos: el sendero llega justo a donde se le manda
            const borde = Math.min(k, pasos - k) / 6;
            const d = Math.round((VAIVEN(semilla * 0.7 + ax, ay, 14, 2) - 0.5) * 2 * amplitud * Math.min(1, borde));
            const cx = Math.round(ax + (bx - ax) * k / pasos) + (horizontal ? 0 : d);
            const cy = Math.round(ay + (by - ay) * k / pasos) + (horizontal ? d : 0);
            const r = Math.floor(w / 2);
            for (let dy = -r; dy <= w - 1 - r; dy += 1) {
                for (let dx = -r; dx <= w - 1 - r; dx += 1) {
                    const x = cx + dx;
                    const y = cy + dy;
                    if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO || obra.construida(x, y)) {
                        continue;
                    }
                    obra.suelo(x, y, obra.esAgua(x, y) ? obra.elegir(TIERRA.puente) : obra.elegir(lista));
                    obra.ocupado[y * ANCHO + x] = 1;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Formas: conjuntos de casillas, sus bordes y sus muros
// ---------------------------------------------------------------------------

const k2 = (x, y) => x + ',' + y;
const de2 = (k) => k.split(',').map(Number);

/** Las casillas de un rectángulo, como conjunto. */
function rectangulo(x0, y0, x1, y1) {
    const s = new Set();
    for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
            s.add(k2(x, y));
        }
    }
    return s;
}

/** El contorno de una forma: sus casillas con algún vecino (de los ocho) fuera. */
function contorno(forma) {
    const borde = [];
    forma.forEach((k) => {
        const [x, y] = de2(k);
        let fuera = false;
        for (let dy = -1; dy <= 1 && !fuera; dy += 1) {
            for (let dx = -1; dx <= 1 && !fuera; dx += 1) {
                fuera = !forma.has(k2(x + dx, y + dy));
            }
        }
        if (fuera) {
            borde.push({ x, y });
        }
    });
    return borde;
}

/** Lo de dentro de una forma (sin el contorno). */
function interior(forma) {
    const borde = new Set(contorno(forma).map((c) => k2(c.x, c.y)));
    return [...forma].filter((k) => !borde.has(k)).map(de2);
}

/**
 * UN EDIFICIO DE FORMA LIBRE (un rectángulo, una L, un octógono escalonado): suelo, muro por su
 * contorno con el pincel de muro, la puerta donde se diga y ventanas en los tramos rectos. Y su
 * TEJADO en la planta de arriba, que el cliente esconde cuando estás dentro (como OTClient).
 */
function construir(obra, forma, opciones) {
    const o = opciones;
    const z = o.z === undefined ? Z : o.z;
    const antes = obra.z;
    obra.z = z;
    forma.forEach((k) => {
        const [x, y] = de2(k);
        obra.vaciar(x, y);   // el solar, limpio: lo que hubiera (un arbusto, una farola) no queda dentro
        obra.suelo(x, y, obra.elegir(o.suelo));
    });
    const muro = contorno(forma);
    obra.muroLinea(muro, o.muro);
    if (o.puerta) {
        obra.puerta(o.puerta.x, o.puerta.y);
    }
    // Ventanas: en los tramos rectos del contorno, cada cinco casillas, lejos de la puerta.
    if (o.ventanas !== false) {
        const enMuro = new Set(muro.map((c) => k2(c.x, c.y)));
        let n = 0;
        muro.forEach(({ x, y }) => {
            const recto = (enMuro.has(k2(x - 1, y)) && enMuro.has(k2(x + 1, y)) && !enMuro.has(k2(x, y - 1)) && !enMuro.has(k2(x, y + 1))) ||
                (enMuro.has(k2(x, y - 1)) && enMuro.has(k2(x, y + 1)) && !enMuro.has(k2(x - 1, y)) && !enMuro.has(k2(x + 1, y)));
            const lejos = !o.puerta || Math.abs(o.puerta.x - x) + Math.abs(o.puerta.y - y) > 2;
            if (recto && lejos && (n++ % 5) === 2) {
                obra.ventana(x, y);
            }
        });
    }
    if (z === Z) {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        forma.forEach((k) => {
            const [x, y] = de2(k);
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        });
        obra.reservar(x0 - 1, y0 - 1, x1 + 1, y1 + 1, 1);
        forma.forEach((k) => {
            const [x, y] = de2(k);
            obra.ocupado[y * ANCHO + x] = 2;
        });
    }
    if (o.tejado) {
        obra.z = z - 1;
        forma.forEach((k) => {
            const [x, y] = de2(k);
            obra.sueloJuego(x, y, o.tejado);
        });
    }
    obra.z = antes;
    return { muro, dentro: interior(forma) };
}

/** Pone algo en la primera casilla libre de una lista (dentro de un edificio). */
function amueblar(obra, libres, idPack, condicion) {
    const i = libres.findIndex(([x, y]) => (!condicion || condicion(x, y)) && !(obra.m.tileAt(x, y, obra.z) || { items: [] }).items.length);
    if (i < 0) {
        return null;
    }
    const [x, y] = libres.splice(i, 1)[0];
    obra.objeto(x, y, idPack);
    return [x, y];
}

// ---------------------------------------------------------------------------
// Las montañas: base que no se pisa, meseta encima (planta 6) y una escalera de piedra
// ---------------------------------------------------------------------------

const MONTE = {
    roca: { base: 10991, cima: [139], muro: 'gris', plantas: [NATURALEZA.bosque, ADORNOS.arbustos] },
    nieve: { base: 10991, cima: [145], muro: 'nieve', plantas: [NATURALEZA.pinos] },
    arena: { base: 10994, cima: [151], muro: 'arena', plantas: [NATURALEZA.cactus] },
    negra: { base: 10992, cima: [140], muro: 'gris', plantas: [NATURALEZA.secos] }
};

/**
 * UNA MONTAÑA como las de Tibia: en la planta 7 su base es roca que no se pisa, con peñascos en el
 * contorno; en la 6, una meseta del mismo tamaño (el cliente la dibuja una casilla arriba a la
 * izquierda, así que la base asoma por el sur y el este como un acantilado), con su borde roto y
 * algo de vegetación. Se sube por una escalera de piedra en el lado sur. No pisa lo construido ni
 * las calles: si un camino la cruza, queda un desfiladero.
 */
function montana(obra, def) {
    const { cx, cy, r } = def;
    const t = MONTE[def.tipo || 'roca'];
    const forma = new Set();
    for (let y = cy - Math.ceil(r * 1.4); y <= cy + Math.ceil(r * 1.4); y += 1) {
        for (let x = cx - Math.ceil(r * 1.4); x <= cx + Math.ceil(r * 1.4); x += 1) {
            const d = Math.hypot(x - cx, y - cy) / r + (MANCHAS(x * 1.7, y * 1.7, 8, 3) - 0.5) * 0.7;
            if (d < 1 && x > 2 && y > 2 && x < ANCHO - 3 && y < ALTO - 3 && !obra.reservada(x, y) && !esMar(x, y)) {
                forma.add(k2(x, y));
            }
        }
    }
    // Sólo la parte unida al centro (el ruido puede dejar islotes).
    const unida = new Set();
    const cola = [k2(cx, cy)];
    while (cola.length) {
        const k = cola.pop();
        if (unida.has(k) || !forma.has(k)) {
            continue;
        }
        unida.add(k);
        const [x, y] = de2(k);
        cola.push(k2(x + 1, y), k2(x - 1, y), k2(x, y + 1), k2(x, y - 1));
    }
    const borde = new Set(contorno(unida).map((c) => k2(c.x, c.y)));
    // La subida: una casilla del borde sur con dos libres debajo, lo más cerca del centro.
    const subidas = [...unida].map(de2).filter(([x, y]) => !unida.has(k2(x, y + 1)) && unida.has(k2(x - 1, y)) &&
        unida.has(k2(x + 1, y)) && unida.has(k2(x, y - 1)) && !obra.reservada(x, y + 1) && !obra.reservada(x, y + 2) &&
        !esMar(x, y + 1) && !esMar(x, y + 2) && !obra.esAgua(x, y + 1) && !obra.esAgua(x, y + 2))
        .sort((a, b) => Math.abs(a[0] - cx) - Math.abs(b[0] - cx) || b[1] - a[1]);
    const subida = subidas[0];
    if (!subida) {
        throw new Error('la montaña ' + def.nombre + ' no tiene por dónde subir: muévela o hazla más grande');
    }
    // Planta 7: la base.
    unida.forEach((k) => {
        const [x, y] = de2(k);
        obra.sueloJuego(x, y, t.base);
        obra.vaciar(x, y);
        obra.ocupado[y * ANCHO + x] = 2;
    });
    // El acantilado: el contorno de la base, con el muro de roca (cada pieza según sus vecinas).
    obra.muroDeRoca([...borde].map((k) => {
        const [x, y] = de2(k);
        return { x, y };
    }), t.muro);
    // Planta 6: la meseta.
    obra.z = 6;
    unida.forEach((k) => {
        const [x, y] = de2(k);
        obra.suelo(x, y, obra.elegir(t.cima));
    });
    const cerca = (x, y) => subida && Math.abs(x - subida[0]) + Math.abs(y - subida[1]) <= 2;
    unida.forEach((k) => {
        const [x, y] = de2(k);
        if (cerca(x, y) || (def.claro && Math.hypot(x - cx, y - cy) <= def.claro)) {
            return;
        }
        if (borde.has(k) && obra.rnd() < 0.5) {
            obra.objeto(x, y, obra.elegir(ADORNOS.rocas));
        } else if (!borde.has(k) && obra.rnd() < 0.08) {
            obra.objeto(x, y, obra.elegir(obra.elegir(t.plantas)));
        }
    });
    if (subida) {
        const [x, y] = subida;
        obra.suelo(x, y + 1, ESCALERAS.bajar);           // arriba: bajar lleva a (x, y + 2, 7)
        obra.z = Z;
        obra.objeto(x, y + 1, ESCALERAS.subirNorte);     // abajo: subir lleva a (x, y, 6)
        obra.reservar(x - 1, y + 1, x + 1, y + 3, 1);
        obra.ocupado[(y + 1) * ANCHO + x] = 2;
    }
    obra.z = Z;
    return { forma: unida, subida: subida ? [subida[0], subida[1] + 2, Z] : null, cima: [cx, cy, 6] };
}

// ---------------------------------------------------------------------------
// Las ciudades
// ---------------------------------------------------------------------------

/** Un octógono escalonado (el templo): un rectángulo con las esquinas cortadas en escalera. */
function octogono(x0, y0, x1, y1, corte) {
    const s = new Set();
    for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
            const dx = Math.min(x - x0, x1 - x);
            const dy = Math.min(y - y0, y1 - y);
            if (dx + dy >= corte) {
                s.add(k2(x, y));
            }
        }
    }
    return s;
}

/**
 * UNA CASA en su parcela: un rectángulo y, a veces, un ala (una L). Puerta hacia el lado que se
 * diga, cama, mesa con sillas, cofre, estantería y una planta; y tejado. Una de cada tres tiene
 * piso de arriba (escalera dentro, el tejado una planta más arriba).
 */
function casaDeParcela(obra, c, p, n) {
    const rnd = obra.rnd;
    const w = 6 + Math.floor(rnd() * 3);
    const h = 5 + Math.floor(rnd() * 2);
    const [px, py, lado, haciaAla] = p;
    const x0 = c.cx + px;
    const y0 = c.cy + py;
    const forma = rectangulo(x0, y0, x0 + w, y0 + h);
    const conAla = haciaAla && rnd() < 0.7;
    if (conAla) {
        // El ala (la casa en L): al lado que dice la parcela, de 3 o 4 de fondo, pegada a la pared
        // contraria a la puerta. Las parcelas están pensadas para que quepa.
        const aw = 3 + Math.floor(rnd() * 2);
        const ah = 3 + Math.floor(rnd() * 2);
        const ya = lado === 's' ? y0 : y0 + h - ah;
        const ala = haciaAla === 'w' ? rectangulo(x0 - aw, ya, x0, ya + ah) : rectangulo(x0 + w, ya, x0 + w + aw, ya + ah);
        ala.forEach((k) => forma.add(k));
    }
    const puerta = {
        s: { x: x0 + Math.floor(w / 2), y: y0 + h }, n: { x: x0 + Math.floor(w / 2), y: y0 },
        e: { x: x0 + w, y: y0 + Math.floor(h / 2) }, w: { x: x0, y: y0 + Math.floor(h / 2) }
    }[lado];
    const fuera = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[lado];
    const dosPisos = rnd() < 0.34;
    const suelo = c.sueloCasa || SUELOS.madera;
    const r = construir(obra, forma, { muro: c.muroCasas[n % c.muroCasas.length], suelo, puerta, tejado: dosPisos ? null : c.tejado });
    // Lo de dentro, sin la casilla de detrás de la puerta (para poder entrar).
    const entrada = [puerta.x - fuera[0], puerta.y - fuera[1]];
    const libres = r.dentro.filter(([x, y]) => Math.abs(x - entrada[0]) + Math.abs(y - entrada[1]) > 1)
        .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const id = obra.houses.length + 1;
    // La cama: cabecera y pies (al sur), las dos libres.
    const cama = libres.find(([x, y]) => libres.some(([a, b]) => a === x && b === y + 1));
    if (cama) {
        obra.poner(cama[0], cama[1], CAMA[0]);
        obra.poner(cama[0], cama[1] + 1, CAMA[1]);
        [[cama[0], cama[1]], [cama[0], cama[1] + 1]].forEach(([x, y]) => {
            const i = libres.findIndex(([a, b]) => a === x && b === y);
            if (i >= 0) {
                libres.splice(i, 1);
            }
        });
    }
    let escalera = null;
    if (dosPisos) {
        // La escalera, contra la pared norte: sube a la casilla de encima (que también es de la casa).
        const i = libres.findIndex(([x, y]) => forma.has(k2(x, y - 1)) && r.dentro.some(([a, b]) => a === x && b === y - 1) &&
            libres.some(([a, b]) => a === x && b === y + 1));
        if (i >= 0) {
            escalera = libres.splice(i, 1)[0];
            obra.objeto(escalera[0], escalera[1], ESCALERAS.subirNorte);
        }
    }
    amueblar(obra, libres, MUEBLES.mesa);
    amueblar(obra, libres, MUEBLES.cofre);
    amueblar(obra, libres, MUEBLES.estanteria);
    amueblar(obra, libres, rnd() < 0.5 ? MUEBLES.librero : MUEBLES.barril);
    amueblar(obra, libres, MUEBLES.maceta);
    const casillas = [...r.dentro.map(([x, y]) => k2(x, y)), k2(puerta.x, puerta.y)];
    casillas.forEach((k) => {
        const [x, y] = de2(k);
        obra.casaDe(x, y, x, y, id);
    });
    if (dosPisos && escalera) {
        // El piso de arriba: misma forma, tarima y muro; la escalera baja donde sube la de abajo.
        const arriba = construir(obra, forma, { z: 6, muro: c.muroCasas[n % c.muroCasas.length], suelo, tejado: c.tejado });
        obra.z = 6;
        obra.suelo(escalera[0], escalera[1], ESCALERAS.bajar);
        const sitios = arriba.dentro.filter(([x, y]) => Math.abs(x - escalera[0]) + Math.abs(y - escalera[1]) > 1);
        obra.poner(sitios[0][0], sitios[0][1], CAMA[0]);
        obra.poner(sitios[0][0], sitios[0][1] + 1, CAMA[1]);
        amueblar(obra, sitios.slice(2), MUEBLES.cofre);
        arriba.dentro.forEach(([x, y]) => obra.casaDe(x, y, x, y, id));
        obra.z = Z;
    } else if (dosPisos) {
        // Sin sitio para la escalera: una sola planta, con su tejado.
        obra.z = 6;
        forma.forEach((k) => {
            const [x, y] = de2(k);
            obra.sueloJuego(x, y, c.tejado);
        });
        obra.z = Z;
    }
    const salida = [puerta.x + fuera[0], puerta.y + fuera[1], Z];
    obra.houses.push({ id, name: c.nombresCasas[n % c.nombresCasas.length], townId: c.id, rent: 400 + (id % 5) * 200, exit: salida });
    return { puerta, salida };
}

/**
 * Las parcelas de las casas, relativas al centro de la ciudad: [dx, dy, lado de la puerta, lado del
 * ala o null]. Una casa ocupa hasta 9x7 más un ala de 4: las parcelas no se pisan entre sí ni con
 * las calles, los edificios o la muralla. La capital usa las nueve; las demás, las cinco primeras.
 */
const PARCELAS = [
    [-27, 8, 'n', 'e'], [-25, 17, 'n', 'e'], [6, 17, 'n', 'w'], [18, 8, 'n', 'w'], [17, -22, 's', 'e'],
    [-34, -24, 's', 'e'], [-20, -25, 's', null], [-11, 19, 'n', null], [22, 18, 'n', 'e']
];

/**
 * UNA CIUDAD alrededor de su plaza (cx, cy), como las de Tibia: la plaza de adoquín con manchas de
 * tierra, el templo octogonal al norte, el depósito con el buzón al oeste, el banco al este, la
 * tienda al sur, las casas en sus parcelas, farolas por las calles, jardines y la MURALLA con sus
 * cuatro puertas (norte, sur, este y oeste).
 */
function ciudad(obra, c) {
    const { cx, cy } = c;
    const R = c.radio;   // { x, y }: la muralla
    // La plaza: una elipse que no es del todo una elipse.
    const plaza = new Set();
    for (let y = cy - 8; y <= cy + 8; y += 1) {
        for (let x = cx - 14; x <= cx + 14; x += 1) {
            const d = ((x - cx) / 12.5) ** 2 + ((y - cy) / 7) ** 2 + (MANCHAS(x * 2, y * 2, 6, 2) - 0.5) * 0.5;
            if (d <= 1) {
                plaza.add(k2(x, y));
            }
        }
    }
    plaza.forEach((k) => {
        const [x, y] = de2(k);
        obra.suelo(x, y, obra.elegir(c.plaza || SUELOS.adoquin));
        obra.ocupado[y * ANCHO + x] = 1;
    });
    // Las calles: de la plaza a las cuatro puertas de la muralla.
    const calle = c.calle || TIERRA.camino;
    const puertas = { n: [cx + 14, cy - R.y], s: [cx, cy + R.y], w: [cx - R.x, cy + 5], e: [cx + R.x, cy + 5] };

    // El templo: octógono escalonado, con su tejado.
    const t = { x0: cx - 8, y0: cy - 21, x1: cx + 8, y1: cy - 8 };
    const formaTemplo = octogono(t.x0, t.y0, t.x1, t.y1, 3);
    const temploR = construir(obra, formaTemplo, { muro: 'marmol', suelo: SUELOS.marmol, puerta: { x: cx, y: t.y1 }, tejado: c.tejadoTemplo || 10191 });
    obra.sueloRect(cx - 1, t.y0 + 1, cx + 1, t.y1 - 1, SUELOS.rojo);
    [t.y0 + 4, t.y0 + 7, t.y0 + 10].forEach((y) => {
        obra.objeto(cx - 4, y, MUEBLES.columna);
        obra.objeto(cx + 5, y, MUEBLES.columna);
    });
    obra.objeto(cx, t.y0 + 2, MUEBLES.fuente);
    obra.objeto(cx - 3, t.y0 + 2, MUEBLES.estatua1);
    obra.objeto(cx + 4, t.y0 + 2, MUEBLES.estatua2);
    obra.zonaProtegida(t.x0, t.y0, t.x1, t.y1);
    const temploPos = [cx, t.y0 + 8, Z];
    obra.poner(cx - 3, t.y0 + 9, MARCA, { actionId: AID.ciudadano + c.id, description: 'Pisa aquí para ser vecino de ' + c.nombre + '.' });
    obra.poner(cx + 3, t.y0 + 9, MARCA, { actionId: AID.ciudadano + c.id, description: 'Pisa aquí para ser vecino de ' + c.nombre + '.' });
    obra.npc(cx, t.y0 + 4, Z, 'Sanador', 1);
    obra.npc(cx + 3, cy - 6, Z, 'Guia');
    void temploR;

    // El depósito, con el buzón en la puerta.
    const dep = { x0: cx - 27, y0: cy - 5, x1: cx - 16, y1: cy + 3 };
    construir(obra, rectangulo(dep.x0, dep.y0, dep.x1, dep.y1), { muro: c.muro, suelo: SUELOS.losa, puerta: { x: dep.x1, y: cy - 1 }, tejado: c.tejado });
    for (let y = dep.y0 + 1; y <= dep.y1 - 1; y += 2) {
        obra.poner(dep.x0 + 1, y, DEPOSITO, { townId: c.id });
    }
    for (let x = dep.x0 + 3; x <= dep.x1 - 3; x += 2) {
        obra.poner(x, dep.y0 + 1, DEPOSITO, { townId: c.id });
    }
    obra.objeto(dep.x1 - 1, dep.y1 - 1, MUEBLES.maceta);
    obra.poner(dep.x1 + 1, cy - 3, BUZON);
    obra.zonaProtegida(dep.x0, dep.y0, dep.x1, dep.y1);
    sendero(obra, [[dep.x1 + 1, cy - 1], [cx - 11, cy - 1]], c.plaza || SUELOS.adoquin, 2, 0);

    // El banco.
    const banco = { x0: cx + 16, y0: cy - 5, x1: cx + 26, y1: cy + 3 };
    construir(obra, rectangulo(banco.x0, banco.y0, banco.x1, banco.y1), { muro: 'marmol', suelo: SUELOS.marmol, puerta: { x: banco.x0, y: cy - 1 }, tejado: c.tejado });
    obra.objeto(banco.x1 - 1, banco.y0 + 1, MUEBLES.cofre);
    obra.objeto(banco.x1 - 1, banco.y1 - 1, MUEBLES.cofre);
    obra.objeto(banco.x0 + 2, banco.y0 + 1, MUEBLES.estanteria);
    obra.npc(banco.x1 - 3, cy - 1, Z, 'Banquero');
    obra.zonaProtegida(banco.x0, banco.y0, banco.x1, banco.y1);
    sendero(obra, [[cx + 11, cy - 1], [banco.x0 - 1, cy - 1]], c.plaza || SUELOS.adoquin, 2, 0);

    // La tienda.
    const tienda = { x0: cx - 14, y0: cy + 9, x1: cx - 5, y1: cy + 15 };
    construir(obra, rectangulo(tienda.x0, tienda.y0, tienda.x1, tienda.y1), { muro: c.muroTienda || c.muro, suelo: SUELOS.madera_clara, puerta: { x: tienda.x0 + 5, y: tienda.y0 }, tejado: c.tejado });
    [MUEBLES.caja, MUEBLES.cajas, MUEBLES.barril].forEach((id, i) => obra.objeto(tienda.x0 + 1 + i, tienda.y1 - 1, id));
    obra.objeto(tienda.x1 - 1, tienda.y1 - 1, MUEBLES.saco);
    obra.objeto(tienda.x1 - 1, tienda.y0 + 2, MUEBLES.fardo);
    obra.npc(tienda.x0 + 4, tienda.y0 + 4, Z, 'Tendero');
    obra.zonaProtegida(tienda.x0, tienda.y0, tienda.x1, tienda.y1);
    sendero(obra, [[tienda.x0 + 5, tienda.y0 - 1], [tienda.x0 + 5, cy + 6]], c.plaza || SUELOS.adoquin, 1, 0);

    // La plaza: fuente o pozo, puestos de mercado y protección.
    obra.objeto(cx - 5, cy + 2, MUEBLES.fuente);
    mercado(obra, cx + 3, cy + 1);
    plaza.forEach((k) => {
        const [x, y] = de2(k);
        obra.bandera(x, y, 'protectionZone');
    });

    // Las calles a las puertas.
    sendero(obra, [[cx + 6, cy - 6], [cx + 14, cy - 10], puertas.n], calle, 3, 2);
    sendero(obra, [[cx, cy + 7], puertas.s], calle, 3, 2);
    sendero(obra, [[cx - 12, cy + 4], puertas.w], calle, 3, 2);
    sendero(obra, [[cx + 12, cy + 4], puertas.e], calle, 3, 2);

    // Las casas.
    const parcelas = PARCELAS.slice(0, c.casas);
    parcelas.forEach((p, n) => casaDeParcela(obra, c, p, n));

    // La muralla: un rectángulo de esquinas cortadas, con sus cuatro puertas de tres de ancho.
    const anillo = contorno(octogono(cx - R.x, cy - R.y, cx + R.x, cy + R.y, 6));
    const enPuerta = (x, y) => Object.values(puertas).some(([px, py]) => Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1);
    const muralla = anillo.filter(({ x, y }) => !enPuerta(x, y) && !obra.construida(x, y) && !obra.esAgua(x, y));
    muralla.forEach(({ x, y }) => obra.vaciar(x, y));
    obra.muroLinea(muralla, c.muralla || 'piedra-gris');
    muralla.forEach(({ x, y }) => {
        obra.ocupado[y * ANCHO + x] = 2;
    });
    claro(obra, puertas.s[0] + 1, puertas.s[1] + 3, 1);
    obra.npc(puertas.s[0] + 1, puertas.s[1] + 3, Z, 'Guardia', 2);

    // Farolas en las calles, jardines y algo de vida entre las casas.
    for (let y = cy - R.y + 2; y <= cy + R.y - 2; y += 1) {
        for (let x = cx - R.x + 2; x <= cx + R.x - 2; x += 1) {
            if (obra.reservada(x, y)) {
                continue;
            }
            const junto = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => obra.ocupado[(y + b) * ANCHO + x + a] === 1 &&
                !obra.construida(x + a, y + b));
            if (junto && (x * 7 + y * 13) % 31 === 0 && obra.libre(x, y)) {
                obra.poner(x, y, FAROLA);
            } else if (obra.rnd() < 0.1 && obra.libre(x, y)) {
                obra.objeto(x, y, obra.elegir(obra.rnd() < 0.5 ? ARBUSTOS_PEQUENOS : PLANTAS_PEQUENAS));
            }
        }
    }
    obra.towns.push({ id: c.id, name: c.nombre, temple: temploPos });
    return { temploPos, plaza: { x0: cx - 12, y0: cy - 7, x1: cx + 12, y1: cy + 7 }, deposito: { ...dep, fuera: { x: dep.x1 + 1, y: cy - 1 } },
        banco: { ...banco, fuera: { x: banco.x0 - 1, y: cy - 1 } }, tienda: { ...tienda, fuera: { x: tienda.x0 + 5, y: tienda.y0 - 1 } }, puertas };
}

const CIUDADES = [
    {
        id: 1, nombre: 'Jetyum', cx: 128, cy: 125, radio: { x: 38, y: 29 }, casas: 9,
        muro: 'crema', muroCasas: ['crema', 'madera-oscura', 'piedra-tallada', 'blanco', 'amarillo'], tejado: 10183,
        muralla: 'piedra-gris', calle: TIERRA.caminoCiudad,
        nombresCasas: ['Casa del Olmo', 'Casa del Roble', 'Casa de Piedra', 'Casa del Pozo', 'Casa Blanca', 'Casa del Sol',
            'Casa del Molino', 'Casa de la Fuente', 'Casa del Puente']
    },
    {
        id: 2, nombre: 'Escarcha', cx: 128, cy: 40, radio: { x: 31, y: 25 }, casas: 5,
        muro: 'piedra-gris', muroTienda: 'madera-oscura', muroCasas: ['madera-oscura', 'piedra-gris', 'madera'], tejado: 10187,
        plaza: SUELOS.losa, calle: TIERRA.caminoNieve, muralla: 'piedra-redonda',
        nombresCasas: ['Cabaña del Lobo', 'Cabaña del Hielo', 'Cabaña del Pino', 'Cabaña del Oso', 'Cabaña de la Ventisca']
    },
    {
        id: 3, nombre: 'Arenal', cx: 62, cy: 212, radio: { x: 31, y: 25 }, casas: 5,
        muro: 'arenisca', muroCasas: ['arenisca', 'beige'], tejado: 10178, plaza: SUELOS.losa, calle: TIERRA.caminoArena,
        muralla: 'arenisca', sueloCasa: SUELOS.losa,
        nombresCasas: ['Casa de la Duna', 'Casa del Oasis', 'Casa del Escorpión', 'Casa del Camello', 'Casa del Espejismo']
    },
    {
        id: 4, nombre: 'Ciénaga', cx: 196, cy: 210, radio: { x: 31, y: 25 }, casas: 5,
        muro: 'madera', muroTienda: 'tablones', muroCasas: ['madera', 'tablones', 'madera-oscura'], tejado: 10185,
        calle: TIERRA.camino, muralla: 'madera-oscura',
        nombresCasas: ['Casa del Junco', 'Casa de la Rana', 'Casa del Muelle', 'Casa de la Garza', 'Casa del Sauce']
    }
];
CIUDADES.forEach((c) => TIERRA_FIRME.push([c.cx - c.radio.x - 6, c.cy - c.radio.y - 6, c.cx + c.radio.x + 6, c.cy + c.radio.y + 6]));

/** Lo que sólo tiene la capital: herrería, el parque del anciano, el museo y la torre. */
function capital(obra, c) {
    const { cx, cy } = c;
    const herreria = { x0: cx + 5, y0: cy + 9, x1: cx + 13, y1: cy + 15 };
    construir(obra, rectangulo(herreria.x0, herreria.y0, herreria.x1, herreria.y1), { muro: 'roca', suelo: SUELOS.piedra, puerta: { x: herreria.x0 + 4, y: herreria.y0 }, tejado: 10191 });
    obra.objeto(herreria.x0 + 2, herreria.y0 + 3, MUEBLES.yunque);
    obra.objeto(herreria.x1 - 1, herreria.y0 + 2, MUEBLES.barril);
    obra.objeto(herreria.x0 + 1, herreria.y1 - 1, MUEBLES.lena);
    obra.npc(herreria.x0 + 4, herreria.y0 + 3, Z, 'Herrero', 1);
    sendero(obra, [[herreria.x0 + 4, herreria.y0 - 1], [herreria.x0 + 4, cy + 6]], SUELOS.adoquin, 1, 0);

    // El parque del anciano, fuera de la muralla, al oeste.
    const parque = { x0: cx - 58, y0: cy + 10, x1: cx - 44, y1: cy + 22 };
    obra.sueloRect(parque.x0, parque.y0, parque.x1, parque.y1, SUELOS.grava);
    estanque(obra, parque.x0 + 2, parque.y0 + 2, 5, 4);
    macizo(obra, parque.x0 + 8, parque.y0 + 7);
    obra.objeto(parque.x1 - 2, parque.y0 + 1, ADORNOS.arbolesEnFlor[0]);
    obra.objeto(parque.x1 - 1, parque.y1 - 1, ADORNOS.arbolesEnFlor[1]);
    obra.reservar(parque.x0, parque.y0, parque.x1, parque.y1, 2);
    obra.zonaProtegida(parque.x0, parque.y0, parque.x1, parque.y1);
    obra.npc(parque.x0 + 7, parque.y0 + 6, Z, 'Anciano', 2);

    // El museo y la torre, fuera de la muralla, al este.
    const museo = { x0: cx + 44, y0: cy - 14, x1: cx + 54, y1: cy - 6 };
    construir(obra, rectangulo(museo.x0, museo.y0, museo.x1, museo.y1), { muro: 'marmol', suelo: SUELOS.marmol, puerta: { x: museo.x0 + 5, y: museo.y1 }, tejado: 10191 });
    obra.objeto(museo.x0 + 2, museo.y0 + 2, MUEBLES.estatua1);
    obra.objeto(museo.x1 - 1, museo.y0 + 2, MUEBLES.estatua2);
    obra.zonaProtegida(museo.x0, museo.y0, museo.x1, museo.y1);
    sendero(obra, [[museo.x0 + 5, museo.y1 + 1], [museo.x0 + 5, cy + 4]], TIERRA.camino, 1, 0);

    const torre = { x0: cx + 44, y0: cy + 10, x1: cx + 52, y1: cy + 17 };
    const formaTorre = rectangulo(torre.x0, torre.y0, torre.x1, torre.y1);
    construir(obra, formaTorre, { muro: 'piedra-gris', suelo: SUELOS.madera, puerta: { x: torre.x0 + 4, y: torre.y0 } });
    sendero(obra, [[torre.x0 + 4, torre.y0 - 1], [torre.x0 + 4, cy + 6]], TIERRA.camino, 1, 0);
    const sx = torre.x1 - 2;
    const sy = torre.y0 + 5;
    obra.objeto(sx, sy, ESCALERAS.subirNorte);                                // sube a (sx, sy-1, 6)
    obra.objeto(torre.x0 + 1, torre.y0 + 1, MUEBLES.estanteria);
    construir(obra, formaTorre, { z: 6, muro: 'piedra-gris', suelo: SUELOS.madera });
    obra.z = 6;
    obra.suelo(sx, sy, ESCALERAS.bajar);                                      // baja a (sx, sy+1, 7)
    obra.objeto(torre.x0 + 2, torre.y0 + 3, ESCALERAS.subirNorte);            // sube a (x, y-1, 5)
    obra.objeto(torre.x0 + 1, torre.y1 - 1, MUEBLES.librero);
    obra.objeto(torre.x0 + 4, torre.y1 - 2, MUEBLES.cristal);
    construir(obra, formaTorre, { z: 5, muro: 'piedra-gris', suelo: SUELOS.losa, tejado: 10191 });
    obra.z = 5;
    obra.suelo(torre.x0 + 2, torre.y0 + 3, ESCALERAS.bajar);                  // baja a (x, y+1, 6)
    obra.objeto(torre.x1 - 2, torre.y0 + 2, MUEBLES.estatua3);
    obra.objeto(torre.x1 - 1, torre.y1 - 1, MUEBLES.cofre);
    obra.z = Z;

    Object.assign(obra.waypoints, {
        herreria: [herreria.x0 + 4, herreria.y0 + 4, Z],
        parque: [parque.x0 + 7, parque.y0 + 8, Z],
        museo: [museo.x0 + 5, museo.y1 + 1, Z],
        torre: [torre.x0 + 4, torre.y0 + 2, Z],
        'torre-arriba': [torre.x0 + 2, torre.y0 + 2, 5]
    });
    return { museo, torre };
}

// ---------------------------------------------------------------------------
// Fuera de las ciudades
// ---------------------------------------------------------------------------

/** Un claro: despeja de adornos y reserva, para que el respawn tenga dónde moverse. */
function claro(obra, x, y, r, lista) {
    for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
            if (dx * dx + dy * dy <= r * r && !obra.reservada(x + dx, y + dy)) {
                if (lista) {
                    obra.suelo(x + dx, y + dy, obra.elegir(lista));
                }
                obra.ocupado[(y + dy) * ANCHO + x + dx] = 1;
            }
        }
    }
}

/** Las montañas del continente. Las que llevan `claro` tienen un campamento en la cima. */
const MONTANAS = [
    { nombre: 'pico-ciclopes', cx: 40, cy: 32, r: 17, tipo: 'nieve', claro: 5 },
    { nombre: 'pico-norte', cx: 220, cy: 26, r: 8, tipo: 'nieve', claro: 3 },
    { nombre: 'cerro-oeste', cx: 76, cy: 92, r: 10, tipo: 'roca', claro: 3 },
    { nombre: 'cerro-sur', cx: 170, cy: 168, r: 9, tipo: 'roca', claro: 3 },
    { nombre: 'pico-negro', cx: 26, cy: 168, r: 10, tipo: 'negra', claro: 3 },
    { nombre: 'mesa-arena', cx: 114, cy: 207, r: 6, tipo: 'arena', claro: 2 }
];

/** La vegetación de cada tierra: árboles en grupos (donde la espesura lo pide), arbustos y plantas. */
function vegetacion(obra) {
    for (let y = 2; y < ALTO - 2; y += 1) {
        for (let x = 2; x < ANCHO - 2; x += 1) {
            if (!obra.libre(x, y) || esPlaya(x, y)) {
                continue;
            }
            const t = tierraDe(x, y);
            const e = ESPESURA(x, y, 16, 3);
            const r = obra.rnd();
            let familia = null;
            if (t === 'pradera') {
                if (e > 0.62 && r < 0.3) { familia = obra.elegir([ADORNOS.arboles, NATURALEZA.bosque, ARBUSTOS_PEQUENOS]); }
                else if (r < 0.025) { familia = ARBUSTOS_PEQUENOS; }
                else if (r < 0.07) { familia = PLANTAS_PEQUENAS; }
                else if (r < 0.08) { familia = ADORNOS.flores; }
                else if (r < 0.083) { familia = obra.elegir([ADORNOS.piedras, ADORNOS.troncos]); }
            } else if (t === 'bosque') {
                if (e > 0.45 && r < 0.32) { familia = obra.elegir([NATURALEZA.bosque, ADORNOS.arboles, ARBUSTOS_PEQUENOS]); }
                else if (r < 0.06) { familia = ARBUSTOS_PEQUENOS; }
                else if (r < 0.12) { familia = PLANTAS_PEQUENAS; }
                else if (r < 0.125) { familia = ADORNOS.setas; }
            } else if (t === 'nieve') {
                if (e > 0.55 && r < 0.3) { familia = NATURALEZA.pinos; }
                else if (r < 0.006) { familia = ADORNOS.rocas; }
                else if (r < 0.008) { familia = NATURALEZA.cristal; }
                else if (r < 0.012) { familia = NATURALEZA.munecos; }
            } else if (t === 'desierto') {
                if (r < 0.012) { familia = NATURALEZA.cactus; }
                else if (r < 0.02) { familia = ADORNOS.rocas; }
                else if (r < 0.023) { familia = NATURALEZA.huesos; }
                else if (r < 0.03 && e > 0.6) { familia = NATURALEZA.palmera; }
            } else if (t === 'pantano') {
                if (e > 0.5 && r < 0.12) { familia = NATURALEZA.secos; }
                else if (r < 0.1) { familia = NATURALEZA.helechos; }
                else if (r < 0.13) { familia = PLANTAS_PEQUENAS; }
                else if (r < 0.133) { familia = NATURALEZA.setasGrandes; }
            } else if (t === 'ceniza') {
                if (r < 0.025) { familia = NATURALEZA.secos; }
                else if (r < 0.045) { familia = ADORNOS.rocas; }
                else if (r < 0.05) { familia = NATURALEZA.huesos; }
            }
            if (familia) {
                obra.objeto(x, y, obra.elegir(familia));
            }
        }
    }
    // Palmeras en las playas templadas.
    obra.salpicar(4, 4, ANCHO - 5, ALTO - 5, 0.025, NATURALEZA.palmera, (x, y) => esPlaya(x, y) && tierraDe(x, y) !== 'nieve');
}

function lugaresDeFuera(obra) {
    // NIEVE: lobos y osos en los pinares; los cíclopes, en la cima del pico.
    claro(obra, 196, 32, 5);
    claro(obra, 214, 50, 4);
    claro(obra, 80, 56, 4);
    obra.respawn(196, 32, Z, 6, 45000, ['Wolf', 'Wolf', 'Wolf']);
    obra.respawn(214, 50, Z, 4, 45000, ['Wolf', 'Bear']);
    obra.respawn(80, 56, Z, 4, 60000, ['Bear', 'Bear']);

    // TIERRAS CALCINADAS: el cementerio (con la cripta), las ruinas de los ocultistas y la lava.
    const cem = { x0: 22, y0: 88, x1: 46, y1: 110 };
    obra.sueloRect(cem.x0, cem.y0, cem.x1, cem.y1, SUELOS.tierra);
    obra.muroRect(cem.x0, cem.y0, cem.x1, cem.y1, 'piedra-negra');
    obra.puerta(cem.x1, 100);
    obra.reservar(cem.x0 - 1, cem.y0 - 1, cem.x1 + 1, cem.y1 + 1, 1);
    obra.reservar(cem.x0, cem.y0, cem.x1, cem.y1, 2);
    const tumbas = [o(1155), o(1156), o(1159), o(1161), 11163, 11164];
    for (let y = cem.y0 + 3; y < cem.y1 - 2; y += 4) {
        for (let x = cem.x0 + 3; x < cem.x1 - 2; x += 4) {
            if (!(x > 30 && x < 38 && y > 94 && y < 104)) {
                obra.poner(x, y, obra.elegir(tumbas));
            }
        }
    }
    obra.respawn(28, 92, Z, 3, 45000, ['Skeleton', 'Skeleton']);
    obra.respawn(40, 106, Z, 3, 60000, ['Ghoul', 'Skeleton']);
    claro(obra, 40, 150, 6, TIERRA.ceniza);
    ruinas(obra, 37, 146);
    obra.respawn(40, 152, Z, 5, 60000, ['Occultist', 'Wraith', 'Occultist']);
    claro(obra, 36, 128, 2);
    for (let y = 118; y <= 140; y += 1) {
        for (let x = 14; x <= 56; x += 1) {
            if (tierraDe(x, y) === 'ceniza' && !obra.reservada(x, y) && MANCHAS(x * 2.3, y * 2.3, 6, 2) > 0.5) {
                obra.suelo(x, y, 162);
            }
        }
    }
    Object.assign(obra.waypoints, { cementerio: [cem.x1 + 2, 100, Z], ruinas: [40, 156, Z], lava: [36, 128, Z] });

    // DESIERTO: escorpiones, serpientes, el campamento de los minotauros y la chatarrería.
    claro(obra, 24, 196, 5);
    claro(obra, 108, 196, 6);
    claro(obra, 118, 240, 4);
    claro(obra, 44, 181, 4);
    obra.muroLinea([{ x: 104, y: 191 }, { x: 105, y: 191 }, { x: 106, y: 191 }, { x: 103, y: 191 }, { x: 103, y: 192 }, { x: 103, y: 193 },
        { x: 113, y: 191 }, { x: 114, y: 191 }, { x: 114, y: 192 }], 'arenisca');
    campamento(obra, 108, 197);
    obra.respawn(108, 194, Z, 5, 60000, ['Minotaur', 'Minotaur', 'Minotaur']);
    obra.respawn(24, 196, Z, 5, 45000, ['Scorpion', 'Scorpion', 'Snake']);
    obra.respawn(118, 240, Z, 4, 45000, ['Snake', 'Snake']);
    [MUEBLES.barril, MUEBLES.cajas, MUEBLES.cajon, MUEBLES.caja, MUEBLES.barril].forEach((id, i) => obra.objeto(38 + i * 2, 177, id));
    obra.respawn(44, 181, Z, 4, 60000, ['Mechanical Boar', 'Mechanical Boar']);
    Object.assign(obra.waypoints, { minotauros: [108, 202, Z], escorpiones: [24, 202, Z], chatarreria: [44, 184, Z] });

    // PANTANO: trolls, goblins, hombres lagarto y arañas venenosas.
    claro(obra, 150, 190, 5);
    claro(obra, 160, 240, 4);
    claro(obra, 238, 190, 5);
    claro(obra, 226, 240, 3);
    campamento(obra, 150, 187);
    campamento(obra, 238, 187);
    obra.respawn(150, 191, Z, 5, 45000, ['Troll', 'Troll', 'Troll']);
    obra.respawn(238, 191, Z, 5, 45000, ['Goblin', 'Goblin', 'Goblin']);
    obra.respawn(160, 240, Z, 4, 60000, ['Lizardman', 'Lizardman']);
    obra.respawn(226, 240, Z, 3, 45000, ['Poison Spider', 'Poison Spider']);
    Object.assign(obra.waypoints, { trolls: [150, 196, Z], goblins: [238, 196, Z], lagartos: [160, 235, Z] });

    // BOSQUE Y GRANJA del este.
    huerto(obra, 196, 82);
    huerto(obra, 204, 82);
    construir(obra, rectangulo(214, 78, 224, 86), { muro: 'tablones', suelo: SUELOS.madera, puerta: { x: 214, y: 82 }, ventanas: false, tejado: 10183 });
    [MUEBLES.fardo, MUEBLES.fardo, MUEBLES.saco, MUEBLES.barril].forEach((id, i) => obra.objeto(223, 79 + i * 2, id));
    obra.reservar(194, 80, 209, 86, 1);
    claro(obra, 202, 94, 5);
    obra.respawn(202, 94, Z, 5, 30000, ['Pig', 'Pig', 'Cat']);
    obra.respawn(219, 82, Z, 3, 30000, ['Rat', 'Rat']);
    claro(obra, 236, 72, 4);
    claro(obra, 236, 100, 4);
    obra.respawn(236, 72, Z, 4, 30000, ['Crow', 'Crow']);
    obra.respawn(236, 100, Z, 4, 60000, ['Domestic Bear']);
    [[206, 128], [226, 140], [214, 172], [240, 120]].forEach(([x, y]) => claro(obra, x, y, 4));
    obra.respawn(206, 128, Z, 4, 45000, ['Spider', 'Spider', 'Vespidae']);
    obra.respawn(226, 140, Z, 4, 45000, ['Coleoptera', 'Scolopendra']);
    obra.respawn(214, 172, Z, 4, 45000, ['Vespidae', 'Spider']);
    obra.respawn(240, 120, Z, 3, 60000, ['Bear']);
    Object.assign(obra.waypoints, { granja: [202, 100, Z], bosque: [206, 131, Z] });
}

/** Lo que hay en lo alto de las montañas: campamentos y respawns. */
function cimas(obra, montes) {
    const m = (nombre) => montes.find((x) => x.nombre === nombre);
    const [ccx, ccy] = m('pico-ciclopes').cima;
    obra.z = 6;
    campamento(obra, ccx, ccy);
    obra.z = Z;
    obra.respawn(ccx, ccy + 3, 6, 5, 60000, ['Cyclops', 'Cyclops']);
    obra.respawn(m('pico-norte').cima[0], m('pico-norte').cima[1], 6, 3, 60000, ['Wolf', 'Wolf']);
    obra.respawn(m('cerro-oeste').cima[0], m('cerro-oeste').cima[1], 6, 3, 60000, ['Vespidae', 'Vespidae']);
    obra.respawn(m('cerro-sur').cima[0], m('cerro-sur').cima[1], 6, 3, 60000, ['Coleoptera', 'Scolopendra']);
    obra.respawn(m('pico-negro').cima[0], m('pico-negro').cima[1], 6, 3, 60000, ['Wraith']);
    obra.respawn(m('mesa-arena').cima[0], m('mesa-arena').cima[1], 6, 2, 60000, ['Scorpion']);
    montes.forEach((x) => {
        obra.waypoints[x.nombre] = x.subida;
    });
    obra.waypoints.ciclopes = [ccx, ccy + 3, 6];
}

/**
 * LOS MONSTRUOS IMPORTADOS (`tools/importar-monstruos.mjs`, en `data/monsters/importados`): cada uno
 * en la primera ZONA que lo acepta, por su nombre o por lo duro que es, y dentro de la zona repartidos
 * entre sus sitios. Los sitios de la superficie que no eran de nadie se despejan (un claro con
 * hoguera); los de abajo son salas de las cuevas. Así, importar más monstruos los pone en el mapa
 * sin tocar este archivo.
 */
const ZONAS = [
    { acepta: (m) => /troll/i.test(m.name), sitios: [[150, 191, Z]] },
    { acepta: (m) => /goblin|muglex/i.test(m.name), sitios: [[238, 191, Z]] },
    { acepta: (m) => /minotaur/i.test(m.name), sitios: [[72, 196, 9], [70, 214, 9]] },
    { acepta: (m) => /cyclops/i.test(m.name), sitios: [[76, 96, 9]] },
    { acepta: (m) => /scorpion|snake/i.test(m.name), sitios: [[24, 196, Z], [118, 240, Z]] },
    { acepta: (m) => /wolf/i.test(m.name), sitios: [[214, 50, Z]] },
    { acepta: (m) => /skeleton|undead|ghoul|zombie/i.test(m.name) && m.experience >= 150, sitios: [[44, 156, 9]] },
    { acepta: (m) => /skeleton|undead|ghoul|zombie|prospector|mine worker/i.test(m.name), sitios: [[64, 72, 8], [70, 36, 8]] },
    { acepta: (m) => m.experience >= 1500, sitios: [[24, 190, 10], [48, 198, 10]] },
    { acepta: (m) => m.experience >= 500, sitios: [[98, 204, 9], [20, 164, 9]] },
    { acepta: (m) => /cult|dark|novice|mad scientist|firestarter/i.test(m.name), sitios: [[40, 152, Z], [46, 124, 8]] },
    { acepta: (m) => /elf|dryad|hunter|poacher|stalker/i.test(m.name), sitios: [[226, 140, Z], [214, 172, Z]] },
    { acepta: (m) => /nomad/i.test(m.name), sitios: [[22, 214, Z]], nuevos: true },
    { acepta: () => true, sitios: [[96, 74, Z], [152, 76, Z], [100, 174, Z], [150, 176, Z], [60, 150, Z]], nuevos: true }
];

/** Los monstruos de `data/monsters/importados`, en orden de nombre. */
function monstruosImportados() {
    const dir = path.join(RAIZ, 'data', 'monsters', 'importados');
    if (!fs.existsSync(dir)) {
        return [];
    }
    const archivos = (d) => fs.readdirSync(d, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? archivos(path.join(d, e.name)) : [path.join(d, e.name)]));
    return archivos(dir).filter((f) => f.endsWith('.js')).map((f) => require(f))
        .filter((m) => m && m.type === 'monster' && m.name).sort((a, b) => a.name.localeCompare(b.name));
}

function importados(obra, monstruos) {
    const porSitio = new Map();
    const usadas = new Map();
    monstruos.forEach((m) => {
        const zona = ZONAS.find((z) => z.acepta(m));
        const k = usadas.get(zona) || 0;
        usadas.set(zona, k + 1);
        const sitio = zona.sitios[k % zona.sitios.length];
        const clave = sitio.join(',');
        if (!porSitio.has(clave)) {
            porSitio.set(clave, { sitio, nuevo: !!zona.nuevos, nombres: [] });
        }
        porSitio.get(clave).nombres.push(m.name, m.name);
    });
    porSitio.forEach(({ sitio, nuevo, nombres }) => {
        const [x, y, z] = sitio;
        if (nuevo) {
            claro(obra, x, y, 4);
            campamento(obra, x + 3, y - 3);
        }
        obra.respawn(x, y, z, 4, 60000, nombres);
    });
}

/** El muelle de Ciénaga, con el pescador: de la puerta sur de la muralla al mar. */
function muelle(obra, cie) {
    const x = cie.puertas.s[0];
    let y = cie.puertas.s[1] + 1;
    while (y < ALTO - 1 && !esMar(x, y + 3)) {
        y += 1;
    }
    sendero(obra, [[x, cie.puertas.s[1] + 1], [x, y]], TIERRA.camino, 3, 0);
    for (let k = 0; k <= 8 && y + k < ALTO - 1; k += 1) {
        obra.sueloRect(x - 1, y + k, x + 1, y + k, TIERRA.puente);
        obra.reservar(x - 1, y + k, x + 1, y + k, 2);
    }
    obra.npc(x, y + 6, Z, 'Pescador', 1);
    obra.waypoints.muelle = [x, y + 4, Z];
}

// ---------------------------------------------------------------------------
// Bajo tierra
// ---------------------------------------------------------------------------

/**
 * UNA CUEVA en la planta `z`, como las de Tibia: salas anchas e irregulares (un autómata celular
 * dentro de su caja) unidas a los `puntos` (escaleras, agujeros, respawns) por túneles de dos o
 * tres de ancho, con muro de roca alrededor. Se queda sólo lo unido al primer punto: nada de
 * bolsas a las que no se llega. Devuelve el conjunto de casillas excavadas ("x,y").
 */
function cueva(obra, z, puntos, opciones) {
    const op = opciones || {};
    const caja = op.caja;
    const [cx0, cy0, cx1, cy1] = caja;
    const dentro = (x, y) => x > cx0 && y > cy0 && x < cx1 && y < cy1;
    // 1. El autómata: un tercio abierto y cinco pasadas de «roca si 5 o más vecinos son roca».
    let abierto = new Set();
    for (let y = cy0 + 1; y < cy1; y += 1) {
        for (let x = cx0 + 1; x < cx1; x += 1) {
            if (MANCHAS(x * 3.1 + z * 50, y * 3.1, 3, 2) * 0.5 + obra.rnd() * 0.5 > (op.densidad || 0.55)) {
                abierto.add(k2(x, y));
            }
        }
    }
    for (let paso = 0; paso < 5; paso += 1) {
        const sig = new Set();
        for (let y = cy0 + 1; y < cy1; y += 1) {
            for (let x = cx0 + 1; x < cx1; x += 1) {
                let roca = 0;
                for (let dy = -1; dy <= 1; dy += 1) {
                    for (let dx = -1; dx <= 1; dx += 1) {
                        if ((dx || dy) && !abierto.has(k2(x + dx, y + dy))) {
                            roca += 1;
                        }
                    }
                }
                if (roca < 5) {
                    sig.add(k2(x, y));
                }
            }
        }
        abierto = sig;
    }
    // 2. Salas en los puntos y túneles anchos entre ellos.
    const cavar = (x, y, r) => {
        for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
                if (dx * dx + dy * dy <= r * r + 1 && dentro(x + dx, y + dy)) {
                    abierto.add(k2(x + dx, y + dy));
                }
            }
        }
    };
    puntos.forEach(([x, y, r]) => cavar(x, y, r || 4));
    for (let i = 1; i < puntos.length; i += 1) {
        let [x, y] = puntos[i - 1];
        const [bx, by] = puntos[i];
        let pasos = 0;
        while ((x !== bx || y !== by) && pasos < 3000) {
            pasos += 1;
            if (obra.rnd() < 0.75) {
                if (Math.abs(bx - x) > Math.abs(by - y)) { x += Math.sign(bx - x); } else { y += Math.sign(by - y); }
            } else if (obra.rnd() < 0.5) {
                x += obra.rnd() < 0.5 ? 1 : -1;
            } else {
                y += obra.rnd() < 0.5 ? 1 : -1;
            }
            x = Math.max(cx0 + 2, Math.min(cx1 - 2, x));
            y = Math.max(cy0 + 2, Math.min(cy1 - 2, y));
            cavar(x, y, op.ancho || 1);
        }
    }
    // 3. Sólo lo unido al primer punto.
    const excavado = new Set();
    const cola = [k2(puntos[0][0], puntos[0][1])];
    while (cola.length) {
        const k = cola.pop();
        if (excavado.has(k) || !abierto.has(k)) {
            continue;
        }
        excavado.add(k);
        const [x, y] = de2(k);
        cola.push(k2(x + 1, y), k2(x - 1, y), k2(x, y + 1), k2(x, y - 1));
    }
    const zAntes = obra.z;
    obra.z = z;
    excavado.forEach((k) => {
        const [x, y] = de2(k);
        obra.suelo(x, y, obra.elegir(op.suelo || TIERRA.cueva));
    });
    const muro = [];
    const enMuro = new Set();
    excavado.forEach((k) => {
        const [x, y] = de2(k);
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                const v = k2(x + dx, y + dy);
                if (!excavado.has(v) && !enMuro.has(v)) {
                    enMuro.add(v);
                    muro.push({ x: x + dx, y: y + dy });
                }
            }
        }
    });
    if (op.muro) {
        // Una cueva hecha a mano (cripta, tumba, alcantarilla): muro de obra.
        muro.forEach(({ x, y }) => obra.suelo(x, y, obra.elegir(op.suelo || TIERRA.cueva)));
        obra.muroLinea(muro, op.muro);
    } else {
        // Una cueva natural: la rodea roca (suelo de montaña, que no se pisa) con su muro de roca.
        muro.forEach(({ x, y }) => obra.sueloJuego(x, y, op.roca || 10993));
        obra.muroDeRoca(muro, op.muroRoca || 'parda');
    }
    const lejos = (x, y) => puntos.every(([px, py]) => Math.abs(px - x) + Math.abs(py - y) > 3);
    excavado.forEach((k) => {
        const [x, y] = de2(k);
        const tile = obra.m.tileAt(x, y, z);
        if (obra.rnd() < (op.adornos === undefined ? 0.05 : op.adornos) && lejos(x, y) && tile && tile.items.length === 0) {
            obra.objeto(x, y, obra.elegir(op.familia || (obra.rnd() < 0.7 ? ADORNOS.piedras : ADORNOS.rocas)));
        }
    });
    obra.z = zAntes;
    return excavado;
}

/**
 * UNA ESCALERA entre (x, y, z) y la planta de abajo, a la manera de TFS: arriba, un suelo de
 * escalera que baja; abajo, en la misma casilla, una escalera que sube hacia el norte. Se llega
 * abajo una casilla al sur, y arriba una al norte: las dos tienen que poder pisarse.
 */
function escalera(obra, x, y, z) {
    const zAntes = obra.z;
    obra.z = z;
    obra.suelo(x, y, ESCALERAS.bajar);
    obra.z = z + 1;
    obra.objeto(x, y, ESCALERAS.subirNorte);
    obra.z = zAntes;
    if (z === Z) {
        obra.reservar(x - 1, y - 1, x + 1, y + 1, 1);
        obra.reservar(x, y, x, y, 2);
    }
}

/** UN AGUJERO con su punto de cuerda debajo: se cae al pisarlo y se sube con la cuerda. */
function agujeroConCuerda(obra, x, y, z) {
    const zAntes = obra.z;
    obra.z = z;
    obra.suelo(x, y, ESCALERAS.agujero);
    obra.z = z + 1;
    obra.suelo(x, y, 1000);
    obra.z = zAntes;
}

/** UN MONTÓN DE PIEDRAS: con la pala se abre un agujero que baja a la cueva. */
function monton(obra, x, y, z) {
    const zAntes = obra.z;
    obra.z = z;
    obra.poner(x, y, MONTON);
    obra.z = zAntes;
}

function subterraneo(obra, ciudades) {
    const [jet] = ciudades;

    // 1. LAS ALCANTARILLAS de Jetyum (planta 8): ratas. Se baja por una escalera en la plaza y se
    //    sale por otra fuera de la muralla, al oeste.
    const p1 = [jet.plaza.x1 - 2, jet.plaza.y1 - 2];
    const p2 = [82, 120];
    escalera(obra, p1[0], p1[1], Z);
    escalera(obra, p2[0], p2[1], Z);
    obra.sueloRect(p2[0] - 1, p2[1] - 2, p2[0] + 1, p2[1] - 1, SUELOS.tierra);
    cueva(obra, 8, [[p1[0], p1[1] + 1, 3], [130, 150, 4], [110, 146, 4], [p2[0], p2[1] + 1, 3], [104, 110, 4]],
        { caja: [76, 100, 166, 160], suelo: SUELOS.losa, muro: 'piedra-oscura', adornos: 0.03, densidad: 0.6,
            familia: [MUEBLES.barril, MUEBLES.cajas, MUEBLES.telarana] });
    obra.respawn(130, 150, 8, 4, 30000, ['Rat', 'Rat', 'Cave Rat']);
    obra.respawn(110, 146, 8, 4, 30000, ['Rat', 'Cave Rat']);
    obra.respawn(104, 110, 8, 3, 30000, ['Cave Rat', 'Rat']);

    // 2. LAS MINAS (planta 8), al oeste de Escarcha: gusanos, ratas de cueva y arañas. Entrada por
    //    escalera; un montón de piedras y un agujero con cuerda como atajos. Y el cubil de los
    //    cíclopes debajo (planta 9).
    const m1 = [76, 64];
    escalera(obra, m1[0], m1[1], Z);
    claro(obra, m1[0], m1[1] - 2, 2);
    obra.sueloRect(m1[0] - 1, m1[1] - 2, m1[0] + 1, m1[1] - 1, SUELOS.tierra);
    cueva(obra, 8, [[m1[0], m1[1] + 1, 3], [64, 72, 5], [68, 56, 3], [70, 36, 5], [96, 30, 5], [86, 58, 3], [118, 76, 4]],
        { caja: [54, 22, 124, 84] });
    monton(obra, 68, 56, Z);
    claro(obra, 68, 57, 1);
    agujeroConCuerda(obra, 86, 58, Z);
    claro(obra, 86, 60, 1);
    obra.respawn(64, 72, 8, 5, 45000, ['Rotworm', 'Rotworm', 'Cave Rat']);
    obra.respawn(70, 36, 8, 5, 45000, ['Rotworm', 'Spider', 'Spider']);
    obra.respawn(96, 30, 8, 4, 45000, ['Spider', 'Cave Rat']);
    escalera(obra, 118, 76, 8);
    cueva(obra, 9, [[118, 77, 3], [100, 90, 6], [76, 96, 5]], { caja: [62, 70, 126, 106], suelo: TIERRA.roca, roca: 10991, muroRoca: 'gris' });
    obra.respawn(100, 90, 9, 5, 60000, ['Cyclops', 'Cyclops']);
    obra.respawn(76, 96, 9, 4, 60000, ['Cyclops']);

    // 3. LA TUMBA del desierto (planta 8), al este de Arenal, y debajo EL LABERINTO de los
    //    minotauros (planta 9).
    construir(obra, rectangulo(104, 222, 114, 230), { muro: 'arenisca', suelo: SUELOS.losa, puerta: { x: 109, y: 222 }, ventanas: false, tejado: 10196 });
    obra.objeto(105, 223, MUEBLES.estatua4);
    obra.objeto(113, 223, MUEBLES.estatua4);
    escalera(obra, 109, 227, Z);
    cueva(obra, 8, [[109, 228, 3], [96, 236, 4], [84, 240, 5], [114, 242, 4], [88, 220, 3]],
        { caja: [74, 208, 124, 248], suelo: TIERRA.tumba, muro: 'arenisca', familia: NATURALEZA.huesos });
    obra.respawn(96, 236, 8, 4, 45000, ['Skeleton', 'Scorpion']);
    obra.respawn(84, 240, 8, 4, 45000, ['Ghoul', 'Skeleton', 'Snake']);
    obra.respawn(114, 242, 8, 3, 45000, ['Scorpion', 'Scorpion']);
    escalera(obra, 88, 220, 8);
    cueva(obra, 9, [[88, 221, 3], [70, 214, 4], [52, 220, 4], [44, 200, 5], [72, 196, 5], [98, 204, 4]],
        { caja: [34, 188, 112, 230], suelo: TIERRA.tumba, muro: 'arenisca', ancho: 1, densidad: 0.57 });
    obra.respawn(52, 220, 9, 4, 60000, ['Minotaur', 'Minotaur']);
    obra.respawn(44, 200, 9, 4, 60000, ['Minotaur', 'Minotaur']);
    obra.respawn(98, 204, 9, 4, 60000, ['Minotaur', 'Ghoul']);

    // 4. LA CUEVA DEL PANTANO (planta 8) y LA GUARIDA de los hombres lagarto (planta 9). Se entra por
    //    un agujero junto al campamento de los trolls (abajo hay punto de cuerda) o por la escalera
    //    junto al muelle.
    escalera(obra, 186, 244, Z);
    obra.sueloRect(185, 242, 187, 243, SUELOS.tierra);
    cueva(obra, 8, [[186, 245, 3], [168, 236, 4], [150, 222, 5], [150, 206, 3], [170, 210, 4]],
        { caja: [140, 196, 200, 250], suelo: TIERRA.cueva, familia: NATURALEZA.helechos.slice(0, 4) });
    agujeroConCuerda(obra, 150, 206, Z);
    claro(obra, 150, 207, 1);
    obra.respawn(168, 236, 8, 4, 45000, ['Poison Spider', 'Scolopendra']);
    obra.respawn(150, 222, 8, 4, 45000, ['Coleoptera', 'Scolopendra', 'Poison Spider']);
    escalera(obra, 170, 210, 8);
    cueva(obra, 9, [[170, 211, 3], [184, 222, 5], [160, 228, 5]], { caja: [146, 200, 198, 240], suelo: TIERRA.cueva });
    obra.respawn(184, 222, 9, 5, 60000, ['Lizardman', 'Lizardman', 'Lizardman']);
    obra.respawn(160, 228, 9, 4, 60000, ['Lizardman', 'Lizardman']);

    // 5. LA CRIPTA del cementerio (planta 8), LAS CATACUMBAS (planta 9) y EL ABISMO (planta 10),
    //    con el cofre del tesoro al fondo.
    escalera(obra, 34, 99, Z);
    cueva(obra, 8, [[34, 100, 3], [24, 116, 4], [46, 124, 4], [30, 140, 3]],
        { caja: [14, 84, 60, 150], suelo: TIERRA.cripta, muro: 'piedra-negra', familia: NATURALEZA.huesos });
    obra.respawn(24, 116, 8, 4, 45000, ['Skeleton', 'Ghoul', 'Skeleton']);
    obra.respawn(46, 124, 8, 4, 45000, ['Ghoul', 'Ghoul']);
    escalera(obra, 30, 140, 8);
    cueva(obra, 9, [[30, 141, 3], [44, 156, 5], [20, 164, 4], [36, 176, 3]],
        { caja: [10, 130, 62, 186], suelo: TIERRA.cripta, muro: 'piedra-negra', familia: NATURALEZA.huesos });
    obra.respawn(44, 156, 9, 5, 60000, ['Wraith', 'Ghoul', 'Skeleton']);
    obra.respawn(20, 164, 9, 4, 60000, ['Wraith', 'Wraith']);
    escalera(obra, 36, 176, 9);
    cueva(obra, 10, [[36, 177, 3], [24, 190, 5], [48, 198, 5], [30, 214, 6]],
        { caja: [12, 168, 64, 226], suelo: TIERRA.abismo, muro: 'piedra-negra', familia: ADORNOS.rocas, adornos: 0.06 });
    obra.respawn(24, 190, 10, 4, 90000, ['Occultist', 'Wraith']);
    obra.respawn(48, 198, 10, 4, 90000, ['Succubus', 'Occultist']);
    obra.respawn(30, 214, 10, 5, 120000, ['Succubus', 'Succubus', 'Wraith']);
    obra.z = 10;
    obra.vaciar(30, 219);
    obra.vaciar(28, 219);
    obra.vaciar(32, 219);
    obra.poner(30, 219, COFRE_TESORO);
    obra.objeto(28, 219, MUEBLES.estatua3);
    obra.objeto(32, 219, MUEBLES.estatua3);
    obra.z = Z;

    Object.assign(obra.waypoints, {
        alcantarillas: [p1[0], p1[1] + 1, 8],
        minas: [m1[0], m1[1] + 1, 8],
        'cubil-ciclopes': [118, 78, 9],
        tumba: [109, 228, 8],
        laberinto: [88, 222, 9],
        'cueva-pantano': [186, 246, 8],
        guarida: [170, 212, 9],
        cripta: [34, 101, 8],
        catacumbas: [30, 142, 9],
        abismo: [36, 178, 10]
    });
}


// ---------------------------------------------------------------------------
// El museo
// ---------------------------------------------------------------------------

/** La sala de cada objeto del catálogo. */
export function salaDe(id, def) {
    const a = (def && def.attributes) || {};
    const nombre = String((def && def.name) || '');
    if (a.fieldType || a.fieldDamage || id === 21025) {
        return 'peligro';
    }
    if (id >= 5000 && id < 6000) {
        return 'hoja';
    }
    if (a.isGround) {
        return 'suelos';
    }
    if (a.isContainer) {
        return 'contenedores';
    }
    if (a.weaponType || a.attack || a.ammoType || a.rune) {
        return 'armas';
    }
    if (a.slotType || a.armor || a.defense) {
        return 'equipo';
    }
    if (a.pickupable) {
        return 'objetos';
    }
    if (/wall|door|archway|window|roof|gate|fence|railing/.test(nombre)) {
        return 'muros';
    }
    if ((id >= 11315 && id <= 11676) || (id >= 10919 && id <= 10961) || (id >= 12583 && id <= 12585) ||
        (id >= 20201 && id <= 20204) || id === 20213 || id === 20214 || /tree|bush|plant|flower|stone|rock|grass/.test(nombre)) {
        return 'naturaleza';
    }
    if (a.blocksSolid) {
        return 'muebles';
    }
    return 'detalles';
}

export const SALAS = [
    ['suelos', 'Sala 1 · Suelos'],
    ['detalles', 'Sala 2 · Bordes y detalles del suelo'],
    ['muros', 'Sala 3 · Muros, puertas, ventanas y tejados'],
    ['naturaleza', 'Sala 4 · Naturaleza: árboles, plantas y rocas'],
    ['muebles', 'Sala 5 · Muebles y decoración'],
    ['armas', 'Sala 6 · Armas, munición y runas'],
    ['equipo', 'Sala 7 · Armaduras, cascos, escudos, botas y joyas'],
    ['contenedores', 'Sala 8 · Contenedores'],
    ['objetos', 'Sala 9 · Objetos: herramientas, comida, pociones, gemas y correo'],
    ['hoja', 'Sala 10 · La hoja de casillas (5000)'],
    ['peligro', 'Sala 11 · Campos y muros mágicos (en vitrina)']
];

/**
 * EL MUSEO en la planta Z_MUSEO: una sala por familia, en columnas, con cada pieza en su hueco
 * (el tamaño de su dibujo más un pasillo), y las salas de efectos, proyectiles y aspectos.
 */
function museo(obra, items, cosas, efectos, proyectiles, aspectos, regreso) {
    obra.z = Z_MUSEO;
    const SUELO = SUELOS.marmol;
    const ANCHO_SALA = 46;
    const porSala = new Map(SALAS.map(([k]) => [k, []]));
    Array.from(items.keys()).sort((a, b) => a - b).forEach((id) => {
        porSala.get(salaDe(id, items.get(id))).push(id);
    });

    const salas = [];
    let columna = 4;
    let y = 4;
    const ALTO_MAX = ALTO - 8;
    const nuevaSala = (titulo, alto) => {
        if (y + alto > ALTO_MAX) {
            columna += ANCHO_SALA + 2;
            y = 4;
        }
        const sala = { titulo, x0: columna, y0: y, x1: columna + ANCHO_SALA, y1: y + alto };
        y += alto;
        salas.push(sala);
        return sala;
    };

    /** Coloca las piezas en filas y devuelve el alto que ocupan. */
    const repartir = (ids, x0, y0, colocar, medir) => {
        let cx = x0;
        let cy = y0;
        let altoFila = 1;
        const puestos = [];
        ids.forEach((id) => {
            const [w, h] = medir(id);
            if (cx + w > x0 + ANCHO_SALA - 4) {
                cx = x0;
                cy += altoFila + 1;
                altoFila = 1;
            }
            puestos.push({ id, x: cx + w - 1, fila: cy, h });
            altoFila = Math.max(altoFila, h);
            cx += w + 1;
        });
        // Las anclas, abajo de su fila.
        const altoDe = new Map();
        puestos.forEach((p) => altoDe.set(p.fila, Math.max(altoDe.get(p.fila) || 1, p.h)));
        puestos.forEach((p) => colocar(p.id, p.x, p.fila + altoDe.get(p.fila) - 1));
        const ultima = puestos.length ? puestos[puestos.length - 1].fila : y0;
        return (ultima + (altoDe.get(ultima) || 1)) - y0;
    };
    const medida = (id) => {
        const c = cosas.get(id);
        return [Math.min(4, (c && c.width) || 1), Math.min(4, (c && c.height) || 1)];
    };

    // La entrada (con el teleport de vuelta) y las salas del catálogo. La vitrina va la última:
    // es una sala que no se cruza.
    const entrada = nuevaSala('Entrada', 8);
    const especial = (titulo, lista, aid, nombre) => {
        const sala = nuevaSala(titulo, Math.ceil(lista.length / 21) * 2 + 5);
        sala.colocar = () => lista.forEach((n, i) => {
            obra.poner(sala.x0 + 2 + (i % 21) * 2, sala.y0 + 3 + Math.floor(i / 21) * 2, MARCA,
                { actionId: aid + n, description: nombre + ' ' + n + '.' });
        });
    };
    SALAS.forEach(([clave, titulo]) => {
        if (clave === 'peligro') {
            especial('Sala 12 · Efectos (pisa cada marca)', efectos, AID.efecto, 'Efecto');
            especial('Sala 13 · Proyectiles (pisa cada marca)', proyectiles, AID.proyectil, 'Proyectil');
            especial('Sala 14 · El probador: cada aspecto (pisa una marca y mira)', aspectos, AID.aspecto, 'Aspecto');
        }
        const ids = porSala.get(clave);
        if (!ids.length) {
            return;
        }
        if (clave === 'suelos') {
            const filas = Math.ceil(ids.length / ((ANCHO_SALA - 4) / 2));
            const sala = nuevaSala(titulo, filas * 2 + 4);
            sala.colocar = () => ids.forEach((id, i) => {
                const por = (ANCHO_SALA - 4) / 2;
                obra.sueloJuego(sala.x0 + 2 + (i % por) * 2, sala.y0 + 3 + Math.floor(i / por) * 2, id);
            });
            return;
        }
        // Se mide primero en una sala de prueba para saber su alto.
        const alto = repartir(ids, 0, 0, () => {}, medida) + 5;
        const sala = nuevaSala(titulo, alto);
        sala.vitrina = clave === 'peligro';
        sala.colocar = () => repartir(ids, sala.x0 + 2, sala.y0 + 3, (id, x, yy) => {
            obra.poner(x, yy, id, { actionId: AID.pieza, pickupable: 0, description: 'Pieza ' + id + ' del museo.' });
        }, medida);
        sala.ids = ids;
    });

    // Las salas: suelo, muro y el cartel con su nombre.
    salas.forEach((s) => {
        obra.rect(s.x0, s.y0, s.x1, s.y1, SUELO);
        obra.muroRect(s.x0, s.y0, s.x1, s.y1, 'marmol');
        obra.zonaProtegida(s.x0, s.y0, s.x1, s.y1);
        obra.poner(s.x0 + 2, s.y0 + 1, CARTEL, { actionId: AID.pieza, pickupable: 0, description: s.titulo + '.' });
    });
    // De una sala a la de debajo, un hueco de tres en el muro que comparten; y las columnas, por un
    // pasillo que corre por encima de todas y entra en la primera sala de cada una.
    salas.forEach((s, i) => {
        const sig = salas[i + 1];
        if (sig && sig.x0 === s.x0) {
            const cx = Math.floor((s.x0 + s.x1) / 2);
            for (let x = cx - 1; x <= cx + 1; x += 1) {
                obra.vaciar(x, s.y1);
            }
        }
    });
    const primeras = salas.filter((s, i) => i === 0 || salas[i - 1].x0 !== s.x0);
    if (primeras.length > 1) {
        const yP = primeras[0].y0 - 2;
        const xA = primeras[0].x0 + 20;
        const xB = primeras[primeras.length - 1].x0 + 21;
        obra.rect(xA, yP, xB, yP + 1, SUELO);
        obra.zonaProtegida(xA, yP, xB, yP + 1);
        primeras.forEach((s) => {
            obra.vaciar(s.x0 + 20, s.y0);
            obra.vaciar(s.x0 + 21, s.y0);
        });
    }
    salas.forEach((s) => s.colocar && s.colocar());
    // La vitrina: lo peligroso, encerrado (se ve, no se pisa).
    salas.filter((s) => s.vitrina).forEach((s) => {
        const casillas = [];
        for (let x = s.x0 + 1; x <= s.x1 - 1; x += 1) {
            casillas.push({ x, y: s.y0 + 2 });
        }
        obra.muroLinea(casillas, 'hielo');
    });

    // La entrada: el teleport de vuelta a Jetyum.
    obra.poner(entrada.x0 + 23, entrada.y0 + 4, TELEPORT, { teleportDestination: { x: regreso[0], y: regreso[1], z: regreso[2] } });
    obra.objeto(entrada.x0 + 18, entrada.y0 + 3, MUEBLES.estatua1);
    obra.objeto(entrada.x0 + 28, entrada.y0 + 3, MUEBLES.estatua2);
    obra.z = Z;
    return { entrada, llegada: [entrada.x0 + 23, entrada.y0 + 6, Z_MUSEO], salas };
}

// ---------------------------------------------------------------------------
// El mapa
// ---------------------------------------------------------------------------

export function mapaContinente(items, pinceles, assets) {
    const cosas = new Map(assets.items.map((c) => [c.id, c]));
    const obra = new Continente(items, pinceles, cosas);

    // 1. El suelo: la isla, sus tierras con sus manchas y el río.
    terreno(obra);
    rio(obra);

    // 2. Las ciudades, con su muralla, y lo que sólo tiene la capital.
    const ciudades = CIUDADES.map((c) => ciudad(obra, c));
    const [jet, esc, are, cie] = ciudades;
    const extra = capital(obra, CIUDADES[0]);
    muelle(obra, cie);

    // 3. Los caminos de puerta a puerta, que serpentean (y cruzan el río por un puente).
    const camino = TIERRA.camino;
    sendero(obra, [[jet.puertas.n[0], jet.puertas.n[1] - 1], [142, 84], [128, 80], [esc.puertas.s[0], esc.puertas.s[1] + 1]], camino, 3);
    sendero(obra, [[jet.puertas.s[0], jet.puertas.s[1] + 1], [128, 190], [128, 217]], camino, 3);
    sendero(obra, [[128, 217], [are.puertas.e[0] + 1, are.puertas.e[1]]], TIERRA.caminoArena, 3);
    sendero(obra, [[128, 217], [cie.puertas.w[0] - 1, cie.puertas.w[1]]], camino, 3);
    sendero(obra, [[jet.puertas.w[0] - 1, jet.puertas.w[1]], [52, jet.puertas.w[1]], [52, 100], [47, 100]], camino, 3);
    sendero(obra, [[jet.puertas.e[0] + 1, jet.puertas.e[1]], [205, jet.puertas.e[1]], [205, 100], [211, 100], [211, 82], [213, 82]], camino, 3);
    sendero(obra, [[esc.puertas.e[0] + 1, esc.puertas.e[1]], [196, esc.puertas.e[1]], [196, 38]], TIERRA.caminoNieve, 2);
    sendero(obra, [[esc.puertas.w[0] - 1, esc.puertas.w[1]], [76, esc.puertas.w[1]], [76, 61]], TIERRA.caminoNieve, 2);
    sendero(obra, [[cie.puertas.e[0] + 1, cie.puertas.e[1]], [238, cie.puertas.e[1]], [238, 196]], camino, 2);
    sendero(obra, [[128, 191], [146, 191]], camino, 2);
    sendero(obra, [[128, 197], [112, 197]], TIERRA.caminoArena, 2);

    // 4. Lo de fuera (antes que el subsuelo: la escalera de la cripta está en el cementerio), el
    //    subsuelo y los campamentos de los monstruos importados.
    lugaresDeFuera(obra);
    subterraneo(obra, ciudades);
    importados(obra, monstruosImportados());

    // 5. Las montañas, donde no hay nada, con lo que hay en su cima.
    const montes = MONTANAS.map((m) => ({ ...m, ...montana(obra, m) }));
    cimas(obra, montes);

    // 6. La vegetación y los bordes de la superficie.
    vegetacion(obra);
    obra.borderizar();
    montes.forEach((x) => {
        const r = Math.ceil(x.r * 1.5);
        P.borderizarArea(obra.m, obra.idx, x.cx - r, x.cy - r, x.cx + r, x.cy + r, 6);
    });

    // 7. El museo, y el teleport de Jetyum que lleva a él.
    const t = assets;
    const llegada = [extra.museo.x0 + 5, extra.museo.y0 + 3, Z];
    const m = museo(obra, items, cosas, t.effects.map((e) => e.id), t.missiles.map((e) => e.id), t.outfits.map((e) => e.id),
        [extra.museo.x0 + 5, extra.museo.y0 + 5, Z]);
    obra.poner(llegada[0], llegada[1], TELEPORT, { teleportDestination: { x: m.llegada[0], y: m.llegada[1], z: m.llegada[2] } });

    Object.assign(obra.waypoints, {
        temple: jet.temploPos,
        jetyum: jet.temploPos,
        escarcha: esc.temploPos,
        arenal: are.temploPos,
        cienaga: cie.temploPos,
        deposito: [jet.deposito.fuera.x, jet.deposito.fuera.y, Z],
        banco: [jet.banco.fuera.x, jet.banco.fuera.y, Z],
        tienda: [jet.tienda.fuera.x, jet.tienda.fuera.y, Z],
        lobos: [196, 36, Z],
        'museo-dentro': m.llegada
    });
    // Un lugar de `/ir` siempre se pisa: si la decoración al azar le cayó encima (sólo cae en
    // casillas sin dueño), se quita.
    Object.values(obra.waypoints).filter((p) => p[2] === Z && !obra.reservada(p[0], p[1])).forEach(([x, y]) => obra.vaciar(x, y));

    return {
        format: 'jetyum-map',
        version: 1,
        name: 'continente',
        width: ANCHO,
        height: ALTO,
        floors: 16,
        _comment: [
            'El continente: el mapa grande con todo el contenido (ciudades, monstruos, NPC, cuevas y',
            'el museo de todos los objetos). Arte del OpenTibia Sprite Pack (CC BY 4.0, ver docs/CREDITOS.md).',
            'GENERADO por tools/generar-continente.mjs: se puede editar en el editor de mapas, pero si se',
            'vuelve a generar se pierden los cambios hechos a mano.'
        ],
        // SIN `fallbackGround` a propósito: el motor lo pone en todas las plantas de la 7 para abajo,
        // y las cuevas y el museo quedarían en medio de un prado. Lo que no está excavado es roca.
        defaultGround: { [Z]: o(SUELOS.hierba[0]) },
        tiles: obra.casillas(),
        waypoints: obra.waypoints,
        towns: obra.towns,
        houses: obra.houses,
        spawns: obra.spawns,
        npcs: obra.npcs
    };
}

// ---------------------------------------------------------------------------

export function generar(opciones) {
    const salida = (opciones && opciones.salida) || RAIZ;
    const items = Xml.loadItems(path.join(RAIZ, 'data', 'items', 'items.xml'));
    const assets = JSON.parse(fs.readFileSync(path.join(RAIZ, 'client', 'jetyum', 'assets', 'things.json'), 'utf8'));
    const pinceles = pincelesContinente(items);
    const mapa = mapaContinente(items, pinceles, assets);
    fs.mkdirSync(path.join(salida, 'data', 'world'), { recursive: true });
    fs.writeFileSync(path.join(salida, 'data', 'world', 'continente.map.json'), JSON.stringify(mapa) + '\n');
    return mapa;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const i = process.argv.indexOf('--salida');
    const mapa = generar({ salida: i >= 0 ? process.argv[i + 1] : null });
    console.log('mapa continente: ' + ANCHO + 'x' + ALTO + ', ' + mapa.tiles.length + ' casillas, ' +
        mapa.towns.length + ' ciudades, ' + mapa.houses.length + ' casas, ' + mapa.spawns.length + ' respawns, ' +
        mapa.npcs.length + ' NPC, ' + Object.keys(mapa.waypoints).length + ' lugares');
}
