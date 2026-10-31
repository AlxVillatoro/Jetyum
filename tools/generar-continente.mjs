/**
 * EL CONTINENTE: el mapa grande, con TODO el contenido del juego en un solo mundo.
 *
 *     node tools/generar-continente.mjs              # escribe data/world/continente.map.json
 *     node tools/generar-continente.mjs --salida d   # en otra carpeta (las pruebas lo usan)
 *
 * Se juega con `mapName: 'continente'` en config.js. Lo que tiene:
 *
 *   - UNA ISLA de 256x256 rodeada de mar, con cinco tierras: la pradera del centro, la nieve del
 *     norte, el desierto del suroeste, el pantano del sureste y las tierras calcinadas del oeste,
 *     más el bosque y la granja del este y un río con su puente.
 *   - CUATRO CIUDADES (Jetyum, Escarcha, Arenal y Ciénaga), cada una con su templo, su depósito
 *     (cofres con `townId`: el depósito es de esa ciudad), su buzón, su banco, su tienda y casas
 *     alquilables con cama. En cada templo, una marca de CIUDADANO (actionId 30020 + id de la
 *     ciudad, como el `citizen.lua` de TFS) hace al jugador vecino de esa ciudad.
 *   - LOS 27 MONSTRUOS en respawns por su tierra, y los 8 NPC repartidos por las ciudades.
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
    casa, templo, fuente, estanque, macizo, huerto, mercado, campamento, ruinas
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
    caminoArena: [151]
};

const NATURALEZA = {
    pinos: [1505, 1508, 1566, 1579],
    rocasNieve: [935, 936, 937, 938, 939, 940, 941, 942, 943, 944, 945],
    hielo: [1303, 1304, 1305, 1306, 1307, 1308, 1310, 1311],
    munecos: [1217, 1218],
    cactus: [2583, 2585],
    palmera: [2584],
    rocasArena: [919, 920, 921, 922, 923, 924, 925, 926, 927, 928],
    rocasGrises: [956, 957, 958, 959, 960, 961],
    rocasPardas: [946, 947, 948, 949],
    rocasNegras: [973, 974, 975, 976],
    lava: [2299, 2300, 2301, 2302, 2303, 2304, 2305, 2306, 2307, 2308, 2309, 2310],
    secos: [1500, 1501, 1502, 1513, 1514],
    helechos: [1476, 1477, 1487, 1488, 1489, 1490, 1491, 1492, 1493, 1494, 1495, 1496, 1497],
    setasGrandes: [1585, 1586],
    huesos: [2233, 2248],
    bosque: [1503, 1504, 1506, 1507, 1509, 1510, 1511, 1512, 1531, 1532, 1533, 1534, 1535, 1536, 1537,
        1562, 1563, 1564, 1565, 1569, 1577, 1578, 1580, 1581, 1582]
};

/** Los bordes del pack: doce piezas seguidas (n, e, s, w, esquinas y diagonales) desde su base. */
const BORDES = { nieve: 399, arena: 315, barro: 375 };

const AGUA = SUELOS.agua;
const DEPOSITO = 11112;         // depot chest (id del juego)
const BUZON = 21040;
const CAMA = [21050, 21051];    // cabecera y pies (al sur)
const TELEPORT = 1387;
const MARCA = 10462;            // el cuadro de alfombra que marca una casilla especial
const CARTEL = 11277;           // el cristal que lleva el nombre de cada sala del museo
const MONTON = 21032;           // montón de piedras: la pala lo abre en un agujero
const COFRE_TESORO = 11111;     // el cofre de una vez (data/scripts/actions/others/one_time_chest.js)

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
    mezclado.bordes = mezclado.bordes.concat(Object.entries(BORDES).map(([k, base]) => ({ id: 'cont-borde-' + k, piezas: piezasDeBorde(base) })));
    // La arena de la playa (la de «otsp-arena») echa su borde sobre el agua.
    mezclado.suelos = mezclado.suelos.map((s) => (s.id === 'otsp-arena' ? { ...s, borde: 'cont-borde-arena' } : s));
    mezclado.suelos = mezclado.suelos.concat([
        suelo('nieve', 'Nieve', 40, TIERRA.nieve, 'cont-borde-nieve'),
        suelo('desierto', 'Desierto', 33, TIERRA.desierto, 'cont-borde-arena'),
        suelo('barro', 'Barro', 30, TIERRA.barro, 'cont-borde-barro'),
        suelo('ceniza', 'Ceniza', 28, TIERRA.ceniza)
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
// La forma de la isla y sus tierras
// ---------------------------------------------------------------------------

const onda = (v, a, f, fase) => Math.round(a * Math.sin(v * f + (fase || 0)));
const margenO = (y) => 6 + onda(y, 2, 0.11) + onda(y, 1.5, 0.031, 1);
const margenE = (y) => 6 + onda(y, 2, 0.09, 2) + onda(y, 1.5, 0.027);
const margenN = (x) => 6 + onda(x, 2, 0.12, 1) + onda(x, 1.5, 0.033, 3);
const margenS = (x) => 6 + onda(x, 2, 0.1, 4) + onda(x, 1.5, 0.029, 2);

export function esMar(x, y) {
    return x < margenO(y) || x > ANCHO - 1 - margenE(y) || y < margenN(x) || y > ALTO - 1 - margenS(x);
}

function esPlaya(x, y) {
    return !esMar(x, y) && (x < margenO(y) + 2 || x > ANCHO - 3 - margenE(y) || y < margenN(x) + 2 || y > ALTO - 3 - margenS(x));
}

/** La tierra de una casilla de la superficie. */
export function tierraDe(x, y) {
    if (y < 66 + onda(x, 3, 0.07) + onda(x, 2, 0.023, 1)) {
        return 'nieve';
    }
    if (y > 182 + onda(x, 3, 0.09)) {
        if (x < 122 + onda(y, 3, 0.1)) {
            return 'desierto';
        }
        if (x > 134 + onda(y, 3, 0.12, 1)) {
            return 'pantano';
        }
        return 'pradera';
    }
    if (x < 62 + onda(y, 3, 0.08)) {
        return 'ceniza';
    }
    if (x > 184 + onda(y, 3, 0.06, 2)) {
        return 'bosque';
    }
    return 'pradera';
}

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
            if (t === 'nieve') {
                obra.suelo(x, y, obra.elegir(TIERRA.nieve));
            } else if (t === 'desierto') {
                obra.suelo(x, y, obra.elegir(TIERRA.desierto));
            } else if (t === 'pantano') {
                obra.suelo(x, y, obra.elegir(TIERRA.barro));
            } else if (t === 'ceniza') {
                obra.suelo(x, y, obra.elegir(TIERRA.ceniza));
            } else if (obra.rnd() < 0.15) {
                obra.suelo(x, y, obra.elegir(SUELOS.hierba.slice(1)));
            }
        }
    }
}

/** El río: baja de la nieve por el bosque hasta el mar del este. */
const RIO = [[176, 62], [179, 80], [183, 100], [186, 124], [194, 142], [210, 156], [230, 164], [255, 168]];

function rio(obra) {
    for (let i = 1; i < RIO.length; i += 1) {
        const [ax, ay] = RIO[i - 1];
        const [bx, by] = RIO[i];
        const pasos = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let k = 0; k <= pasos; k += 1) {
            const x = Math.round(ax + (bx - ax) * k / pasos);
            const y = Math.round(ay + (by - ay) * k / pasos);
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    if (x + dx >= 0 && x + dx < ANCHO && y + dy >= 0 && y + dy < ALTO) {
                        obra.suelo(x + dx, y + dy, obra.elegir(AGUA));
                    }
                }
            }
        }
    }
    // Nenúfares y juncos en las orillas.
    for (let k = 0; k < 40; k += 1) {
        const [ax, ay] = RIO[1 + Math.floor(obra.rnd() * (RIO.length - 2))];
        const x = ax + Math.floor(obra.rnd() * 7) - 3;
        const y = ay + Math.floor(obra.rnd() * 7) - 3;
        if (obra.esAgua(x, y) && !obra.m.tileAt(x, y, Z).items.length && obra.rnd() < 0.5) {
            obra.objeto(x, y, obra.elegir(ADORNOS.nenufares));
        }
    }
}

// ---------------------------------------------------------------------------
// Las ciudades
// ---------------------------------------------------------------------------

/**
 * Una ciudad alrededor de su plaza (cx, cy): el templo al norte, el depósito y el correo al
 * oeste, el banco al este, la tienda y las casas al sur. Devuelve dónde quedan las cosas.
 */
function ciudad(obra, c) {
    const { cx, cy } = c;
    const plaza = { x0: cx - 12, y0: cy - 6, x1: cx + 12, y1: cy + 6 };
    obra.rect(plaza.x0, plaza.y0, plaza.x1, plaza.y1, c.plaza || SUELOS.adoquin);
    obra.reservar(plaza.x0, plaza.y0, plaza.x1, plaza.y1, 2);

    // El templo: la reaparición, el sanador y la marca de ciudadano.
    const t = templo(obra, cx - 7, cy - 18);
    obra.reservar(cx - 8, cy - 19, cx + 8, cy - 6, 1);
    obra.reservar(cx - 7, cy - 18, cx + 7, cy - 7, 2);
    obra.zonaProtegida(cx - 7, cy - 18, t.x1, t.y1);
    const temploPos = [t.centro.x, t.centro.y + 2, Z];
    obra.poner(t.centro.x - 3, t.centro.y + 3, MARCA, { actionId: AID.ciudadano + c.id, description: 'Pisa aquí para ser vecino de ' + c.nombre + '.' });
    obra.poner(t.centro.x + 3, t.centro.y + 3, MARCA, { actionId: AID.ciudadano + c.id, description: 'Pisa aquí para ser vecino de ' + c.nombre + '.' });
    obra.npc(t.centro.x, t.centro.y - 2, Z, 'Sanador', 1);
    obra.npc(cx + 2, cy - 5, Z, 'Guia');

    // El depósito, con el buzón en la puerta.
    const dep = obra.edificio(cx - 25, cy - 5, cx - 15, cy + 3, c.muro, SUELOS.losa, 'e');
    obra.rect(cx - 14, cy - 1, plaza.x0, cy - 1, SUELOS.adoquin);
    for (let y = dep.y0 + 1; y <= dep.y1 - 1; y += 2) {
        obra.poner(dep.x0 + 1, y, DEPOSITO, { townId: c.id });
    }
    for (let x = dep.x0 + 3; x <= dep.x1 - 3; x += 2) {
        obra.poner(x, dep.y0 + 1, DEPOSITO, { townId: c.id });
    }
    obra.objeto(dep.x1 - 1, dep.y1 - 1, MUEBLES.maceta);
    obra.poner(cx - 14, cy - 3, BUZON);
    obra.zonaProtegida(dep.x0, dep.y0, dep.x1, dep.y1);

    // El banco.
    const banco = obra.edificio(cx + 15, cy - 5, cx + 24, cy + 3, 'marmol', SUELOS.marmol, 'w');
    obra.rect(plaza.x1, cy - 1, cx + 14, cy - 1, SUELOS.adoquin);
    obra.objeto(banco.x1 - 1, banco.y0 + 1, MUEBLES.cofre);
    obra.objeto(banco.x1 - 1, banco.y1 - 1, MUEBLES.cofre);
    obra.objeto(banco.x0 + 1, banco.y0 + 1, MUEBLES.estanteria);
    obra.npc(banco.x1 - 3, cy - 1, Z, 'Banquero');
    obra.zonaProtegida(banco.x0, banco.y0, banco.x1, banco.y1);

    // La tienda.
    const tiendaE = obra.edificio(cx - 13, cy + 9, cx - 4, cy + 15, c.muroTienda || c.muro, SUELOS.madera_clara, 'n');
    obra.rect(tiendaE.puerta.x, plaza.y1 + 1, tiendaE.puerta.x, plaza.y1 + 2, SUELOS.adoquin);
    [MUEBLES.caja, MUEBLES.cajas, MUEBLES.barril].forEach((id, i) => obra.objeto(tiendaE.x0 + 1 + i, tiendaE.y1 - 1, id));
    obra.objeto(tiendaE.x1 - 1, tiendaE.y1 - 1, MUEBLES.saco);
    obra.objeto(tiendaE.x1 - 1, tiendaE.y0 + 2, MUEBLES.fardo);
    obra.npc(tiendaE.x0 + 4, tiendaE.y0 + 4, Z, 'Tendero');
    obra.zonaProtegida(tiendaE.x0, tiendaE.y0, tiendaE.x1, tiendaE.y1);

    // La plaza: fuente y mercado.
    fuente(obra, cx - 5, cy + 2);
    mercado(obra, cx + 3, cy + 2);
    obra.zonaProtegida(plaza.x0, plaza.y0, plaza.x1, plaza.y1);

    // Las casas: alquilables, con su cama.
    (c.casas || []).forEach(([x, y, muro, nombre]) => {
        const k = casa(obra, x, y, muro, muro === 'piedra-tallada' || muro === 'roca' ? SUELOS.losa : SUELOS.madera);
        const id = obra.houses.length + 1;
        obra.casaDe(k.interior[0], k.interior[1], k.interior[2], k.interior[3], id);
        obra.casaDe(k.puerta.x, k.puerta.y, k.puerta.x, k.puerta.y, id);
        obra.poner(k.x1 - 1, y + 3, CAMA[0]);
        obra.poner(k.x1 - 1, y + 4, CAMA[1]);
        obra.reservar(x - 1, y - 1, k.x1 + 1, k.y1 + 1, 1);
        obra.reservar(x, y, k.x1, k.y1, 2);
        obra.houses.push({ id, name: nombre, townId: c.id, rent: 400 + (id % 4) * 200, exit: [k.puerta.x, k.puerta.y + 1, Z] });
        obra.calle([k.puerta.x, k.puerta.y + 1], [k.puerta.x, k.puerta.y + 2], c.calle || TIERRA.camino, 1);
    });

    obra.towns.push({ id: c.id, name: c.nombre, temple: temploPos });
    return { temploPos, plaza, deposito: dep, banco, tienda: tiendaE, templo: t };
}

const CIUDADES = [
    {
        id: 1, nombre: 'Jetyum', cx: 128, cy: 124, muro: 'crema', calle: TIERRA.camino,
        casas: [[92, 136, 'crema', 'Casa del Olmo'], [101, 136, 'madera-oscura', 'Casa del Roble'],
            [143, 136, 'piedra-tallada', 'Casa de Piedra'], [152, 136, 'crema', 'Casa del Pozo'],
            [98, 104, 'blanco', 'Casa Blanca'], [151, 104, 'amarillo', 'Casa del Sol']]
    },
    {
        id: 2, nombre: 'Escarcha', cx: 128, cy: 34, muro: 'piedra-gris', muroTienda: 'madera-oscura',
        plaza: SUELOS.losa, calle: TIERRA.caminoNieve,
        casas: [[98, 44, 'madera-oscura', 'Cabaña del Lobo'], [151, 44, 'piedra-gris', 'Cabaña del Hielo'],
            [140, 44, 'madera', 'Cabaña del Pino']]
    },
    {
        id: 3, nombre: 'Arenal', cx: 62, cy: 212, muro: 'arenisca', plaza: SUELOS.losa, calle: TIERRA.caminoArena,
        casas: [[32, 222, 'arenisca', 'Casa de la Duna'], [73, 222, 'beige', 'Casa del Oasis'],
            [82, 222, 'arenisca', 'Casa del Escorpión']]
    },
    {
        id: 4, nombre: 'Ciénaga', cx: 196, cy: 210, muro: 'madera', muroTienda: 'tablones', calle: TIERRA.camino,
        casas: [[166, 220, 'madera', 'Casa del Junco'], [207, 220, 'tablones', 'Casa de la Rana'],
            [216, 220, 'madera-oscura', 'Casa del Muelle']]
    }
];

/** Lo que solo tiene la capital: herrería, guardia, anciano, el museo y la torre. */
function capital(obra, c) {
    const { cx, cy } = c;
    // La herrería, al este de las casas del sur.
    const herreria = obra.edificio(cx + 5, cy + 9, cx + 13, cy + 15, 'roca', SUELOS.piedra, 'n');
    obra.rect(herreria.puerta.x, cy + 7, herreria.puerta.x, cy + 8, SUELOS.adoquin);
    obra.objeto(herreria.x0 + 2, herreria.y0 + 3, MUEBLES.yunque);
    obra.objeto(herreria.x1 - 1, herreria.y0 + 2, MUEBLES.barril);
    obra.objeto(herreria.x0 + 1, herreria.y1 - 1, MUEBLES.lena);
    obra.npc(herreria.x0 + 4, herreria.y0 + 3, Z, 'Herrero', 1);

    // El parque del anciano, al oeste: estanque, flores y árboles.
    const parque = { x0: cx - 52, y0: cy - 12, x1: cx - 38, y1: cy };
    obra.rect(parque.x0, parque.y0, parque.x1, parque.y1, SUELOS.grava);
    estanque(obra, parque.x0 + 2, parque.y0 + 2, 5, 4);
    macizo(obra, parque.x0 + 8, parque.y0 + 8);
    obra.objeto(parque.x1 - 2, parque.y0 + 1, ADORNOS.arbolesEnFlor[0]);
    obra.objeto(parque.x1 - 1, parque.y1 - 1, ADORNOS.arbolesEnFlor[1]);
    obra.reservar(parque.x0, parque.y0, parque.x1, parque.y1, 2);
    obra.zonaProtegida(parque.x0, parque.y0, parque.x1, parque.y1);
    obra.npc(parque.x0 + 7, parque.y0 + 6, Z, 'Anciano', 2);

    // El museo: una sala de mármol con el teleport que baja a la planta del museo.
    const museo = obra.edificio(cx + 32, cy - 12, cx + 42, cy - 4, 'marmol', SUELOS.marmol, 's');
    obra.calle([museo.fuera.x, museo.fuera.y], [museo.fuera.x, cy + 5], TIERRA.camino, 1);
    obra.objeto(museo.x0 + 2, museo.y0 + 2, MUEBLES.estatua1);
    obra.objeto(museo.x1 - 1, museo.y0 + 2, MUEBLES.estatua2);
    obra.objeto(museo.x0 + 1, museo.y1 - 1, MUEBLES.maceta);
    obra.zonaProtegida(museo.x0, museo.y0, museo.x1, museo.y1);

    // La torre: dos pisos (6 y 5), con escaleras.
    const torre = { x0: cx + 32, y0: cy + 9, x1: cx + 40, y1: cy + 16 };
    obra.rect(torre.x0, torre.y0, torre.x1, torre.y1, SUELOS.madera);
    obra.muroRect(torre.x0, torre.y0, torre.x1, torre.y1, 'piedra-gris');
    obra.puerta(cx + 36, torre.y0);
    obra.ventana(torre.x1, cy + 12);
    obra.reservar(torre.x0 - 1, torre.y0 - 1, torre.x1 + 1, torre.y1 + 1, 1);
    obra.reservar(torre.x0, torre.y0, torre.x1, torre.y1, 2);
    obra.calle([cx + 36, torre.y0 - 1], [cx + 36, cy + 7], TIERRA.camino, 1);
    obra.objeto(cx + 38, cy + 14, ESCALERAS.subirNorte);            // sube a (cx+38, cy+13, 6)
    obra.objeto(torre.x0 + 1, torre.y0 + 1, MUEBLES.estanteria);
    obra.objeto(torre.x0 + 2, torre.y1 - 2, MUEBLES.mesa);
    obra.z = 6;
    obra.rect(torre.x0, torre.y0, torre.x1, torre.y1, SUELOS.madera);
    obra.muroRect(torre.x0, torre.y0, torre.x1, torre.y1, 'piedra-gris');
    obra.ventana(torre.x1, cy + 12);
    obra.ventana(cx + 35, torre.y0);
    obra.suelo(cx + 38, cy + 14, ESCALERAS.bajar);                  // baja a (cx+38, cy+15, 7)
    obra.objeto(torre.x0 + 2, cy + 11, ESCALERAS.subirNorte);       // sube a (x, cy+10, 5)
    obra.objeto(torre.x0 + 1, torre.y1 - 1, MUEBLES.librero);
    obra.objeto(torre.x0 + 4, torre.y1 - 2, MUEBLES.cristal);
    obra.z = 5;
    obra.rect(torre.x0, torre.y0, torre.x1, torre.y1, SUELOS.losa);
    obra.muroRect(torre.x0, torre.y0, torre.x1, torre.y1, 'piedra-gris');
    obra.ventana(torre.x1, cy + 12);
    obra.ventana(torre.x0, cy + 12);
    obra.ventana(cx + 36, torre.y1);
    obra.suelo(torre.x0 + 2, cy + 11, ESCALERAS.bajar);             // baja a (x, cy+12, 6)
    obra.objeto(torre.x1 - 2, torre.y0 + 2, MUEBLES.estatua3);
    obra.objeto(torre.x1 - 1, torre.y1 - 1, MUEBLES.cofre);
    obra.z = Z;

    obra.npc(cx, cy + 22, Z, 'Guardia', 2);
    Object.assign(obra.waypoints, {
        herreria: [herreria.x0 + 4, herreria.y0 + 4, Z],
        parque: [cx - 45, cy - 5, Z],
        museo: [museo.fuera.x, museo.fuera.y, Z],
        torre: [cx + 36, cy + 12, Z],
        'torre-arriba': [torre.x0 + 2, cy + 10, 5]
    });
    return { museo, torre };
}

// ---------------------------------------------------------------------------
// Fuera de las ciudades
// ---------------------------------------------------------------------------

/** Un grupo de rocas grandes (2x2) que no se puede atravesar: cada casilla lleva la suya. */
function macizoDeRocas(obra, x0, y0, x1, y1, familia, densidad) {
    for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
            const dentro = ((x - (x0 + x1) / 2) / ((x1 - x0) / 2 + 0.5)) ** 2 + ((y - (y0 + y1) / 2) / ((y1 - y0) / 2 + 0.5)) ** 2 <= 1;
            if (dentro && obra.rnd() < (densidad || 0.85) && obra.libre(x, y)) {
                obra.objeto(x, y, obra.elegir(familia));
            }
        }
    }
}

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

function nieve(obra) {
    // Montañas del noroeste con el campamento de los cíclopes en un claro.
    claro(obra, 34, 34, 6, TIERRA.nieve);
    obra.camino([[34, 38], [66, 38]], TIERRA.caminoNieve, 2);
    campamento(obra, 34, 34);
    macizoDeRocas(obra, 12, 12, 60, 58, NATURALEZA.rocasNieve, 0.55);
    obra.respawn(34, 37, Z, 5, 60000, ['Cyclops', 'Cyclops']);
    // Bosque de pinos del noreste: lobos y osos.
    claro(obra, 196, 30, 5);
    claro(obra, 226, 46, 4);
    claro(obra, 80, 50, 4);
    obra.salpicar(160, 12, 248, 64, 0.22, NATURALEZA.pinos);
    obra.salpicar(66, 40, 96, 64, 0.18, NATURALEZA.pinos);
    obra.respawn(196, 30, Z, 6, 45000, ['Wolf', 'Wolf', 'Wolf']);
    obra.respawn(226, 46, Z, 4, 45000, ['Wolf', 'Bear']);
    obra.respawn(80, 50, Z, 4, 60000, ['Bear', 'Bear']);
    // Muñecos de nieve y hielo por todas partes.
    obra.salpicar(8, 8, 248, 66, 0.012, [NATURALEZA.munecos, NATURALEZA.hielo], (x, y) => tierraDe(x, y) === 'nieve');
    obra.salpicar(8, 8, 248, 66, 0.01, NATURALEZA.rocasNieve, (x, y) => tierraDe(x, y) === 'nieve');
}

function ceniza(obra) {
    // El cementerio: un muro de piedra negra con tumbas (estatuas y obeliscos) y su cripta.
    const cem = { x0: 22, y0: 88, x1: 46, y1: 110 };
    obra.rect(cem.x0, cem.y0, cem.x1, cem.y1, SUELOS.tierra);
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
    // Las ruinas de los ocultistas y el campo de lava.
    claro(obra, 40, 150, 6, TIERRA.ceniza);
    ruinas(obra, 37, 146);
    obra.respawn(40, 152, Z, 5, 60000, ['Occultist', 'Wraith', 'Occultist']);
    claro(obra, 36, 128, 2);
    obra.salpicar(14, 118, 58, 140, 0.18, NATURALEZA.lava);
    obra.salpicar(10, 70, 64, 180, 0.03, [NATURALEZA.rocasNegras, NATURALEZA.secos, NATURALEZA.huesos], (x, y) => tierraDe(x, y) === 'ceniza');
    Object.assign(obra.waypoints, { cementerio: [cem.x1 + 2, 100, Z], ruinas: [40, 156, Z], lava: [36, 128, Z] });
}

function desierto(obra) {
    claro(obra, 30, 196, 5);
    claro(obra, 104, 196, 6);
    claro(obra, 94, 234, 4);
    claro(obra, 20, 238, 4);
    // El campamento de los minotauros: ruinas de arenisca.
    obra.muroLinea([{ x: 100, y: 191 }, { x: 101, y: 191 }, { x: 102, y: 191 }, { x: 99, y: 191 }, { x: 99, y: 192 }, { x: 99, y: 193 },
        { x: 109, y: 191 }, { x: 110, y: 191 }, { x: 110, y: 192 }], 'arenisca');
    campamento(obra, 104, 197);
    obra.respawn(104, 196, Z, 5, 60000, ['Minotaur', 'Minotaur', 'Minotaur']);
    obra.respawn(30, 196, Z, 5, 45000, ['Scorpion', 'Scorpion', 'Snake']);
    obra.respawn(94, 234, Z, 4, 45000, ['Snake', 'Snake']);
    // La chatarrería del jabalí mecánico.
    [MUEBLES.barril, MUEBLES.cajas, MUEBLES.cajon, MUEBLES.caja, MUEBLES.barril].forEach((id, i) => obra.objeto(16 + i * 2, 234, id));
    obra.respawn(20, 238, Z, 4, 60000, ['Mechanical Boar', 'Mechanical Boar']);
    obra.salpicar(8, 182, 124, 250, 0.03, [NATURALEZA.cactus, NATURALEZA.palmera, NATURALEZA.rocasArena], (x, y) => tierraDe(x, y) === 'desierto');
    Object.assign(obra.waypoints, { minotauros: [104, 202, Z], escorpiones: [30, 202, Z], chatarreria: [20, 242, Z] });
}

function pantano(obra) {
    claro(obra, 152, 196, 5);
    claro(obra, 160, 238, 4);
    claro(obra, 236, 188, 5);
    claro(obra, 232, 238, 3);
    campamento(obra, 152, 196);
    campamento(obra, 236, 188);
    obra.respawn(152, 199, Z, 5, 45000, ['Troll', 'Troll', 'Troll']);
    obra.respawn(236, 191, Z, 5, 45000, ['Goblin', 'Goblin', 'Goblin']);
    obra.respawn(160, 238, Z, 4, 60000, ['Lizardman', 'Lizardman']);
    obra.respawn(232, 238, Z, 3, 45000, ['Poison Spider', 'Poison Spider']);
    // Charcas con nenúfares.
    [[176, 236, 6, 4], [222, 198, 5, 3], [146, 220, 4, 4]].forEach(([x, y, w, h]) => {
        estanque(obra, x, y, w, h);
        obra.reservar(x, y, x + w - 1, y + h - 1, 2);
    });
    obra.salpicar(134, 182, 250, 250, 0.08, [NATURALEZA.secos, NATURALEZA.helechos, NATURALEZA.helechos, NATURALEZA.secos], (x, y) => tierraDe(x, y) === 'pantano');
    obra.salpicar(134, 182, 250, 250, 0.006, NATURALEZA.setasGrandes, (x, y) => tierraDe(x, y) === 'pantano');
    Object.assign(obra.waypoints, { trolls: [152, 202, Z], goblins: [236, 194, Z], lagartos: [160, 233, Z] });
}

function bosque(obra) {
    // La granja: huertos, un granero y los animales.
    huerto(obra, 196, 82);
    huerto(obra, 204, 82);
    const granero = obra.edificio(214, 78, 224, 86, 'tablones', SUELOS.madera, 'w', false);
    [MUEBLES.fardo, MUEBLES.fardo, MUEBLES.saco, MUEBLES.barril].forEach((id, i) => obra.objeto(granero.x1 - 1, granero.y0 + 1 + i * 2, id));
    obra.reservar(194, 80, 209, 86, 1);
    claro(obra, 202, 94, 5);
    obra.respawn(202, 94, Z, 5, 30000, ['Pig', 'Pig', 'Cat']);
    obra.respawn(219, 82, Z, 3, 30000, ['Rat', 'Rat']);
    obra.respawn(232, 72, Z, 4, 30000, ['Crow', 'Crow']);
    obra.respawn(236, 98, Z, 4, 60000, ['Domestic Bear']);
    // El bosque del sur: arañas, avispas, escarabajos y escolopendras.
    [[206, 128], [226, 140], [214, 172], [240, 120]].forEach(([x, y]) => claro(obra, x, y, 4));
    obra.salpicar(188, 104, 250, 182, 0.2, [NATURALEZA.bosque, ADORNOS.arbustos], (x, y) => tierraDe(x, y) === 'bosque');
    obra.salpicar(188, 66, 250, 104, 0.06, NATURALEZA.bosque, (x, y) => tierraDe(x, y) === 'bosque');
    obra.respawn(206, 128, Z, 4, 45000, ['Spider', 'Spider', 'Vespidae']);
    obra.respawn(226, 140, Z, 4, 45000, ['Coleoptera', 'Scolopendra']);
    obra.respawn(214, 172, Z, 4, 45000, ['Vespidae', 'Spider']);
    obra.respawn(240, 120, Z, 3, 60000, ['Bear']);
    Object.assign(obra.waypoints, { granja: [202, 100, Z], bosque: [206, 134, Z] });
}

function pradera(obra) {
    // Flores, hierbas, árboles y rocas sueltas por el campo.
    const esPradera = (x, y) => tierraDe(x, y) === 'pradera' && !esPlaya(x, y);
    obra.salpicar(8, 60, 250, 190, 0.025, [ADORNOS.flores, ADORNOS.hierbas, ADORNOS.matas], esPradera);
    obra.salpicar(8, 60, 250, 190, 0.012, [ADORNOS.arboles, ADORNOS.frutales], esPradera);
    obra.salpicar(8, 60, 250, 190, 0.004, [ADORNOS.piedras, ADORNOS.troncos, ADORNOS.setas], esPradera);
    // Las palmeras de las playas.
    obra.salpicar(8, 8, 248, 248, 0.02, NATURALEZA.palmera, (x, y) => esPlaya(x, y) && tierraDe(x, y) !== 'nieve');
}

/** El muelle de Ciénaga, con el pescador. */
function muelle(obra) {
    const x = 196;
    let y = 228;
    while (y < ALTO - 1 && !esMar(x, y + 3)) {
        y += 1;
    }
    for (let k = 0; k <= 8 && y + k < ALTO - 1; k += 1) {
        obra.rect(x - 1, y + k, x + 1, y + k, TIERRA.puente);
        obra.reservar(x - 1, y + k, x + 1, y + k, 2);
    }
    obra.calle([x, 216], [x, y], TIERRA.camino, 3);
    obra.npc(x, y + 6, Z, 'Pescador', 1);
    obra.waypoints.muelle = [x, y + 4, Z];
}

// ---------------------------------------------------------------------------
// Bajo tierra
// ---------------------------------------------------------------------------

/**
 * UNA CUEVA en la planta `z`: salas alrededor de los `puntos` unidas por túneles que serpentean,
 * con muro de roca alrededor. Devuelve el conjunto de casillas excavadas ("x,y").
 */
function cueva(obra, z, puntos, opciones) {
    const op = opciones || {};
    const caja = op.caja || [2, 2, ANCHO - 3, ALTO - 3];
    const excavado = new Set();
    const dentro = (x, y) => x > caja[0] && y > caja[1] && x < caja[2] && y < caja[3];
    const cavar = (x, y, r) => {
        for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
                if (dx * dx + dy * dy <= r * r + 1 && dentro(x + dx, y + dy)) {
                    excavado.add((x + dx) + ',' + (y + dy));
                }
            }
        }
    };
    puntos.forEach(([x, y, r]) => cavar(x, y, r || 4));
    for (let i = 1; i < puntos.length; i += 1) {
        let [x, y] = puntos[i - 1];
        const [bx, by] = puntos[i];
        let pasos = 0;
        while ((x !== bx || y !== by) && pasos < 2000) {
            pasos += 1;
            if (obra.rnd() < 0.7) {
                if (Math.abs(bx - x) > Math.abs(by - y)) { x += Math.sign(bx - x); } else { y += Math.sign(by - y); }
            } else if (obra.rnd() < 0.5) {
                x += obra.rnd() < 0.5 ? 1 : -1;
            } else {
                y += obra.rnd() < 0.5 ? 1 : -1;
            }
            x = Math.max(caja[0] + 2, Math.min(caja[2] - 2, x));
            y = Math.max(caja[1] + 2, Math.min(caja[3] - 2, y));
            cavar(x, y, op.ancho || 1);
        }
    }
    const zAntes = obra.z;
    obra.z = z;
    excavado.forEach((k) => {
        const [x, y] = k.split(',').map(Number);
        obra.suelo(x, y, obra.elegir(op.suelo || TIERRA.cueva));
    });
    const muro = [];
    const enMuro = new Set();
    excavado.forEach((k) => {
        const [x, y] = k.split(',').map(Number);
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                const v = (x + dx) + ',' + (y + dy);
                if (!excavado.has(v) && !enMuro.has(v)) {
                    enMuro.add(v);
                    muro.push({ x: x + dx, y: y + dy });
                }
            }
        }
    });
    muro.forEach(({ x, y }) => obra.suelo(x, y, obra.elegir(op.suelo || TIERRA.cueva)));
    obra.muroLinea(muro, op.muro || 'roca');
    // Piedras y rocas sueltas, lejos de los puntos (escaleras y respawns).
    const lejos = (x, y) => puntos.every(([px, py]) => Math.abs(px - x) + Math.abs(py - y) > 3);
    excavado.forEach((k) => {
        const [x, y] = k.split(',').map(Number);
        const tile = obra.m.tileAt(x, y, z);
        if (obra.rnd() < (op.adornos === undefined ? 0.05 : op.adornos) && lejos(x, y) && tile && tile.items.length === 0) {
            obra.objeto(x, y, obra.elegir(op.familia || (obra.rnd() < 0.7 ? ADORNOS.piedras : ADORNOS.rocas)));
        }
    });
    obra.z = zAntes;
    obra.excavado = obra.excavado || {};
    excavado.forEach((k) => { obra.excavado[k + ',' + z] = true; });
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
    const [jet, esc, are, cie] = ciudades;

    // 1. LAS ALCANTARILLAS de Jetyum (planta 8): ratas. Se baja por una escalera en la esquina de
    //    la plaza y se sale por otra junto al parque.
    const p1 = [jet.plaza.x1 - 1, jet.plaza.y1 - 1];
    const p2 = [92, 126];
    escalera(obra, p1[0], p1[1], Z);
    escalera(obra, p2[0], p2[1], Z);
    obra.rect(p2[0] - 1, p2[1] - 2, p2[0] + 1, p2[1] - 1, SUELOS.tierra);
    cueva(obra, 8, [[p1[0], p1[1] + 1, 3], [130, 150, 4], [112, 146, 4], [p2[0], p2[1] + 1, 3], [104, 112, 4]],
        { caja: [84, 100, 166, 160], suelo: SUELOS.losa, muro: 'piedra-oscura', adornos: 0.03, familia: [MUEBLES.barril, MUEBLES.cajas, MUEBLES.telarana] });
    obra.respawn(130, 150, 8, 4, 30000, ['Rat', 'Rat', 'Cave Rat']);
    obra.respawn(112, 146, 8, 4, 30000, ['Rat', 'Cave Rat']);
    obra.respawn(104, 112, 8, 3, 30000, ['Cave Rat', 'Rat']);

    // 2. LAS MINAS de Escarcha (planta 8): gusanos, ratas de cueva y arañas. Entrada por escalera
    //    en las montañas; un montón de piedras y un agujero con cuerda como atajos.
    const m1 = [96, 62];
    escalera(obra, m1[0], m1[1], Z);
    claro(obra, m1[0], m1[1] - 2, 2);
    obra.rect(m1[0] - 1, m1[1] - 2, m1[0] + 1, m1[1] - 1, SUELOS.tierra);
    cueva(obra, 8, [[m1[0], m1[1] + 1, 3], [80, 70, 5], [74, 56, 3], [70, 36, 5], [96, 30, 5], [110, 58, 3], [118, 76, 4]],
        { caja: [60, 22, 124, 84] });
    monton(obra, 74, 56, Z);
    claro(obra, 74, 57, 1);
    agujeroConCuerda(obra, 110, 58, Z);
    claro(obra, 110, 60, 1);
    obra.respawn(80, 70, 8, 5, 45000, ['Rotworm', 'Rotworm', 'Cave Rat']);
    obra.respawn(70, 36, 8, 5, 45000, ['Rotworm', 'Spider', 'Spider']);
    obra.respawn(96, 30, 8, 4, 45000, ['Spider', 'Cave Rat']);
    // Más abajo, el cubil de los cíclopes (planta 9).
    escalera(obra, 118, 76, 8);
    cueva(obra, 9, [[118, 77, 3], [100, 90, 6], [76, 96, 5]], { caja: [64, 70, 126, 104], suelo: TIERRA.roca });
    obra.respawn(100, 90, 9, 5, 60000, ['Cyclops', 'Cyclops']);
    obra.respawn(76, 96, 9, 4, 60000, ['Cyclops']);

    // 3. LA TUMBA del desierto (planta 8): esqueletos, necrófagos, escorpiones y serpientes; y debajo,
    //    EL LABERINTO de los minotauros (planta 9).
    const tumba = obra.edificio(40, 232, 50, 240, 'arenisca', SUELOS.losa, 'n', false);
    obra.objeto(tumba.x0 + 1, tumba.y0 + 1, MUEBLES.estatua4);
    obra.objeto(tumba.x1 - 1, tumba.y0 + 1, MUEBLES.estatua4);
    obra.calle([tumba.fuera.x, tumba.fuera.y], [tumba.fuera.x, are.plaza.y1 + 10], TIERRA.caminoArena, 1);
    escalera(obra, 45, 237, Z);
    cueva(obra, 8, [[45, 238, 3], [60, 236, 4], [84, 238, 5], [104, 230, 4], [88, 220, 3]],
        { caja: [30, 212, 116, 248], suelo: TIERRA.tumba, muro: 'arenisca', familia: NATURALEZA.huesos });
    obra.respawn(60, 236, 8, 4, 45000, ['Skeleton', 'Scorpion']);
    obra.respawn(84, 238, 8, 4, 45000, ['Ghoul', 'Skeleton', 'Snake']);
    obra.respawn(104, 230, 8, 3, 45000, ['Scorpion', 'Scorpion']);
    escalera(obra, 88, 220, 8);
    cueva(obra, 9, [[88, 221, 3], [70, 214, 4], [52, 220, 4], [44, 200, 5], [72, 196, 5], [98, 204, 4]],
        { caja: [34, 188, 112, 230], suelo: TIERRA.tumba, muro: 'arenisca', ancho: 1 });
    obra.respawn(52, 220, 9, 4, 60000, ['Minotaur', 'Minotaur']);
    obra.respawn(44, 200, 9, 4, 60000, ['Minotaur', 'Minotaur']);
    obra.respawn(98, 204, 9, 4, 60000, ['Minotaur', 'Ghoul']);

    // 4. LA CUEVA DEL PANTANO (planta 8) y LA GUARIDA de los hombres lagarto (planta 9). Se entra por
    //    un agujero junto a la charca: abajo hay punto de cuerda, y una escalera para volver.
    escalera(obra, 186, 244, Z);
    obra.rect(185, 242, 187, 243, SUELOS.tierra);
    cueva(obra, 8, [[172, 230, 3], [158, 236, 4], [150, 214, 5], [170, 210, 4], [186, 245, 3]],
        { caja: [140, 200, 196, 250], suelo: TIERRA.cueva, familia: NATURALEZA.helechos.slice(0, 4) });
    agujeroConCuerda(obra, 172, 230, Z);
    claro(obra, 172, 231, 1);
    obra.respawn(158, 236, 8, 4, 45000, ['Poison Spider', 'Scolopendra']);
    obra.respawn(150, 214, 8, 4, 45000, ['Coleoptera', 'Scolopendra', 'Poison Spider']);
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
        { caja: [12, 168, 64, 226], suelo: TIERRA.abismo, muro: 'piedra-negra', familia: NATURALEZA.lava, adornos: 0.08 });
    obra.respawn(24, 190, 10, 4, 90000, ['Occultist', 'Wraith']);
    obra.respawn(48, 198, 10, 4, 90000, ['Succubus', 'Occultist']);
    obra.respawn(30, 214, 10, 5, 120000, ['Succubus', 'Succubus', 'Wraith']);
    obra.z = 10;
    obra.poner(30, 219, COFRE_TESORO);
    obra.objeto(28, 219, MUEBLES.estatua3);
    obra.objeto(32, 219, MUEBLES.estatua3);
    obra.z = Z;

    Object.assign(obra.waypoints, {
        alcantarillas: [p1[0], p1[1] + 1, 8],
        minas: [m1[0], m1[1] + 1, 8],
        'cubil-ciclopes': [118, 78, 9],
        tumba: [45, 238, 8],
        laberinto: [88, 222, 9],
        'cueva-pantano': [186, 246, 8],
        guarida: [170, 212, 9],
        cripta: [34, 101, 8],
        catacumbas: [30, 142, 9],
        abismo: [36, 178, 10]
    });
    return { esc, cie };
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

    terreno(obra);
    rio(obra);

    const ciudades = CIUDADES.map((c) => ciudad(obra, c));
    const [jet, esc, are, cie] = ciudades;
    const extra = capital(obra, CIUDADES[0]);
    muelle(obra);

    // Los caminos entre ciudades. Salen de la plaza por la fila de abajo, que es la que no tapan
    // ni el depósito ni el banco, y no pisan nada construido (`calle`).
    const camino = TIERRA.camino;
    const yJ = jet.plaza.y1;
    obra.camino([[jet.plaza.x1 + 1, yJ], [176, yJ], [176, 88], [128, 88], [128, esc.plaza.y1 + 1]], camino, 3);
    obra.camino([[128, yJ + 1], [128, 218]], camino, 3);
    obra.camino([[128, 218], [are.plaza.x1 + 1, 218]], camino, 3);
    obra.camino([[128, 216], [cie.plaza.x0 - 1, 216]], camino, 3);
    obra.camino([[jet.plaza.x0 - 1, yJ], [50, yJ], [50, 100], [48, 100]], camino, 3);
    obra.camino([[176, 123], [205, 123], [205, 100], [211, 100], [211, 82], [213, 82]], camino, 3);
    // Los caminos de las afueras a lo de fuera.
    obra.camino([[176, 88], [196, 88], [196, 36]], TIERRA.caminoNieve, 2);
    obra.camino([[128, 88], [96, 88], [96, 64]], camino, 2);
    obra.camino([[128, 194], [104, 194], [104, 202]], camino, 2);
    obra.camino([[128, 194], [152, 194], [152, 201]], camino, 2);
    obra.camino([[128, 218], [128, 230], [166, 230]], camino, 2);
    obra.camino([[cie.plaza.x1 + 1, 216], [236, 216], [236, 194]], camino, 2);

    // Las tierras calcinadas antes que el subsuelo: la escalera de la cripta está dentro del
    // cementerio, y su suelo la taparía.
    ceniza(obra);
    subterraneo(obra, ciudades);

    // La naturaleza de cada tierra, después de lo construido.
    nieve(obra);
    desierto(obra);
    pantano(obra);
    bosque(obra);
    pradera(obra);

    // Los bordes de la superficie.
    obra.borderizar();

    // El museo, y el teleport de Jetyum que lleva a él.
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
        ciclopes: [34, 40, Z],
        lobos: [196, 36, Z],
        'museo-dentro': m.llegada
    });

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
