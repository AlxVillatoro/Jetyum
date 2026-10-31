'use strict';

/**
 * DE OTBM A JETYUM Y DE VUELTA: la conversión de un mapa entero.
 *
 * `otbm.js` sabe leer y escribir el binario; `equivalencias.js` sabe qué id de Jetyum corresponde a
 * cada id de Tibia. Esto junta las dos cosas con los archivos que acompañan a un mapa de TFS
 * (`*-house.xml` y `*-spawn.xml`) y produce un `*.map.json` que el cargador del motor acepta. Lo
 * usan `tools/importar-otbm.mjs`, `tools/exportar-otbm.mjs` y el editor (`POST /api/maps/importar-otbm`).
 *
 * LO QUE SE CONVIERTE:
 *
 *   - las CASILLAS, con su suelo, sus objetos en el orden de la pila, sus banderas (zona de
 *     protección, sin PvP, sin logout, zona PvP) y su casa;
 *   - los ATRIBUTOS de objeto que Jetyum entiende: actionId, uniqueId, texto, descripción, destino
 *     de teleport, depósito, número de puerta de casa y cargas. La cantidad, si el objeto de
 *     Jetyum es apilable;
 *   - las CIUDADES (`towns` del OTBM) con su templo, las CASAS (de `house.xml`) con su salida, su
 *     alquiler y su ciudad, los WAYPOINTS, los RESPAWNS y los NPC (de `spawn.xml`).
 *
 * EL RECORTE (`area`). Un mapa de Tibia es enorme y casi nunca se quiere entero: se importa una
 * región. Por defecto la región se DESPLAZA al origen (la esquina del área pasa a ser la 0,0), así
 * el mapa resultante mide lo que mide la región; los destinos de teleport, templos, salidas y
 * respawns se desplazan con ella. El desplazamiento queda apuntado en `_otbm.origen` y es lo que
 * usa la exportación para devolver cada cosa a su sitio.
 *
 * LO QUE NO SE PUEDE, Y SE DICE: los monstruos y NPC que no existen en este datapack se quitan y se
 * listan, igual que los objetos sin equivalencia; el contenido de los contenedores no se importa
 * (el formato de mapa de Jetyum no lo tiene); un waypoint que cae en una casilla que no se puede
 * pisar se quita, porque el cargador lo rechazaría. Todo va al informe.
 */

const fs = require('fs');
const path = require('path');

const Otbm = require('./otbm');
const Equivalencias = require('./equivalencias');
const { leerXml, hijos, descendientes } = require('./xmlsimple');
const MapLoader = require('../../engine/world/loader');

const RAIZ = path.resolve(__dirname, '..', '..');
const PLANTAS = 16;
const TAMANO_MINIMO = 16;

/** Los atributos de un objeto de OTBM que se conservan (con el nombre de Jetyum). */
const ATRIBUTOS_QUE_SE_CONSERVAN = ['actionId', 'uniqueId', 'text', 'description', 'teleportDestination',
    'depotId', 'doorId', 'charges'];

/** Cuántos ids sin equivalencia, monstruos desconocidos… se enseñan en el informe. */
const CUANTOS_EN_EL_INFORME = 40;

const activo = (v) => v === true || v === 1 || v === '1' || v === 'true';

function ms(desde) {
    return Math.round(Number(process.hrtime.bigint() - desde) / 1e5) / 10;
}

/** Cuenta cosas por clave y las devuelve ordenadas de más a menos. */
class Contador {
    constructor() {
        this.mapa = new Map();
    }

    sumar(clave, n) {
        this.mapa.set(clave, (this.mapa.get(clave) || 0) + (n === undefined ? 1 : n));
    }

    ordenado() {
        return Array.from(this.mapa.entries()).sort((a, b) => b[1] - a[1] || (a[0] > b[0] ? 1 : -1));
    }

    get total() {
        let t = 0;
        this.mapa.forEach((n) => {
            t += n;
        });
        return t;
    }
}

/** Lee `--area x1,y1,x2,y2[,z1,z2]` (o un objeto). Las plantas, si faltan, son todas. */
function leerArea(valor) {
    if (!valor) {
        return null;
    }
    const n = Array.isArray(valor) ? valor.map(Number)
        : typeof valor === 'object' ? [valor.x1, valor.y1, valor.x2, valor.y2, valor.z1, valor.z2].map(Number)
            : String(valor).split(/[,\s]+/).filter(Boolean).map(Number);
    if (n.length < 4 || n.slice(0, 4).some((v) => !Number.isInteger(v) || v < 0)) {
        throw new Error('el area es x1,y1,x2,y2[,z1,z2] con enteros: ' + JSON.stringify(valor));
    }
    const z1 = Number.isInteger(n[4]) ? n[4] : 0;
    const z2 = Number.isInteger(n[5]) ? n[5] : PLANTAS - 1;
    return {
        x1: Math.min(n[0], n[2]), y1: Math.min(n[1], n[3]),
        x2: Math.max(n[0], n[2]), y2: Math.max(n[1], n[3]),
        z1: Math.max(0, Math.min(z1, z2)), z2: Math.min(PLANTAS - 1, Math.max(z1, z2))
    };
}

// ---------------------------------------------------------------------------
// Las fuentes
// ---------------------------------------------------------------------------

/**
 * Carga todo lo que hace falta para traducir ids: el `items.otb` y el `items.xml` de Tibia, el
 * catálogo de Jetyum (items.xml, things.json, pinceles.json), los materiales de RME si se dan y el
 * archivo de equivalencias. Devuelve también la TABLA FINAL (automática + manual).
 *
 * La tabla automática se toma del archivo si se hizo con el mismo `items.otb` (mismo sello) y no se
 * pide `recalcular`; si no, se calcula en el momento (y `recalculada` lo dice).
 *
 * @param {Object} o
 * @param {string} o.itemsOtb
 * @param {string} [o.itemsXml]
 * @param {string} [o.materiales] materials.xml de RME
 * @param {string} [o.equivalencias] el archivo (por defecto data/editor/equivalencias-otbm.json)
 * @param {string} [o.itemsJetyum] por defecto data/items/items.xml
 * @param {boolean} [o.recalcular]
 */
function cargarFuentes(o) {
    const Xml = require('../../engine/data/xml');
    const { leerMateriales } = require('./materialesrme');
    const tiempos = {};
    let t = process.hrtime.bigint();

    if (!o.itemsOtb || !fs.existsSync(o.itemsOtb)) {
        throw new Error('falta el items.otb (--items-otb): ' + o.itemsOtb);
    }
    const otb = Otbm.leerItemsOtb(fs.readFileSync(o.itemsOtb));
    const tfs = o.itemsXml && fs.existsSync(o.itemsXml) ? Xml.loadItems(o.itemsXml) : null;
    tiempos.tibia = ms(t);

    t = process.hrtime.bigint();
    const itemTypes = Xml.loadItems(o.itemsJetyum || path.join(RAIZ, 'data', 'items', 'items.xml'));
    const archivoThings = o.things || path.join(RAIZ, 'client', 'jetyum', 'assets', 'things.json');
    const things = fs.existsSync(archivoThings)
        ? new Map(JSON.parse(fs.readFileSync(archivoThings, 'utf8')).items.map((i) => [i.id, i])) : new Map();
    const archivoPinceles = o.pinceles || path.join(RAIZ, 'data', 'editor', 'pinceles.json');
    const pinceles = fs.existsSync(archivoPinceles) ? JSON.parse(fs.readFileSync(archivoPinceles, 'utf8')) : null;
    const archivoEquivalencias = o.equivalencias || path.join(RAIZ, 'data', 'editor', 'equivalencias-otbm.json');
    const config = Equivalencias.leerArchivo(archivoEquivalencias);
    tiempos.jetyum = ms(t);

    t = process.hrtime.bigint();
    const materiales = o.materiales ? leerMateriales(o.materiales) : null;
    const sello = Equivalencias.selloDeOtb(otb);
    let automatica;
    let recalculada = false;
    let resumen = null;
    let correspondencias = null;
    if (!o.recalcular && !materiales && Equivalencias.mismoOrigen(config.origen, sello) &&
        Object.keys(config.automatico || {}).length > 0) {
        automatica = Equivalencias.tablaDeArchivo(config.automatico);
    } else {
        const hecha = Equivalencias.construirEquivalencias({
            otb: otb.items, tfs: tfs, itemTypes: itemTypes, things: things, pinceles: pinceles,
            materiales: materiales, config: config
        });
        automatica = hecha.tabla;
        resumen = hecha.resumen;
        correspondencias = hecha.correspondencias;
        recalculada = true;
    }
    tiempos.equivalencias = ms(t);

    return {
        otb: otb, tfs: tfs, itemTypes: itemTypes, things: things, pinceles: pinceles, materiales: materiales,
        config: config, archivoEquivalencias: archivoEquivalencias, sello: sello,
        automatica: automatica, recalculada: recalculada, resumen: resumen, correspondencias: correspondencias,
        tabla: Equivalencias.tablaFinal(automatica, config.manual),
        tiempos: tiempos
    };
}

/**
 * Guarda la tabla automática de `fuentes` en el archivo de equivalencias, conservando `manual`,
 * `pinceles`, `palabras` y `respaldo`. Devuelve lo escrito.
 */
function guardarEquivalencias(fuentes, ruta) {
    const destino = ruta || fuentes.archivoEquivalencias;
    const datos = Object.assign({}, fuentes.config, {
        origen: fuentes.sello,
        automatico: Equivalencias.tablaAArchivo(fuentes.automatica)
    });
    const texto = Equivalencias.serializar(datos);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const temporal = destino + '.tmp';
    fs.writeFileSync(temporal, texto, 'utf8');
    fs.renameSync(temporal, destino);
    return { ruta: destino, entradas: fuentes.automatica.size, bytes: texto.length };
}

// ---------------------------------------------------------------------------
// house.xml y spawn.xml
// ---------------------------------------------------------------------------

function textoDe(fuente) {
    if (!fuente) {
        return null;
    }
    if (Buffer.isBuffer(fuente)) {
        return fuente.toString('utf8');
    }
    if (/^\s*</.test(fuente)) {
        return fuente;
    }
    return fs.readFileSync(fuente, 'utf8');
}

/** Las casas de un `house.xml` de TFS. */
function leerCasas(fuente) {
    const texto = textoDe(fuente);
    if (!texto) {
        return [];
    }
    return descendientes(leerXml(texto), 'house').map((h) => ({
        id: Number(h.atributos.houseid),
        nombre: h.atributos.name || '',
        ciudad: Number(h.atributos.townid) || 0,
        alquiler: Number(h.atributos.rent) || 0,
        entrada: { x: Number(h.atributos.entryx), y: Number(h.atributos.entryy), z: Number(h.atributos.entryz) },
        gremio: activo(h.atributos.guildhall)
    })).filter((c) => Number.isInteger(c.id) && c.id > 0);
}

/**
 * Los respawns de un `spawn.xml` de TFS. Las casillas de los monstruos son RELATIVAS al centro
 * (así las escribe RME); aquí salen absolutas. `spawntime` va en segundos.
 */
function leerSpawns(fuente) {
    const texto = textoDe(fuente);
    if (!texto) {
        return [];
    }
    return descendientes(leerXml(texto), 'spawn').map((s) => {
        const cx = Number(s.atributos.centerx);
        const cy = Number(s.atributos.centery);
        const cz = Number(s.atributos.centerz);
        const criatura = (n, tipo) => ({
            tipo: tipo,
            nombre: n.atributos.name || '',
            x: cx + (Number(n.atributos.x) || 0),
            y: cy + (Number(n.atributos.y) || 0),
            z: n.atributos.z !== undefined ? Number(n.atributos.z) : cz,
            intervalo: (Number(n.atributos.spawntime) || 60) * 1000
        });
        return {
            x: cx, y: cy, z: cz, radio: Number(s.atributos.radius) || 1,
            criaturas: hijos(s, 'monster').map((n) => criatura(n, 'monstruo'))
                .concat(hijos(s, 'npc').map((n) => criatura(n, 'npc')))
        };
    });
}

// ---------------------------------------------------------------------------
// Importar
// ---------------------------------------------------------------------------

/**
 * Convierte un `.otbm` en un mapa de Jetyum (en bruto, la forma de `*.map.json`).
 *
 * @param {Object} o
 * @param {Buffer|string} o.otbm           el archivo o su ruta
 * @param {Object} o.fuentes               lo de `cargarFuentes`
 * @param {string} [o.nombre]              el `name` del mapa
 * @param {Object|string} [o.area]         x1,y1,x2,y2[,z1,z2]
 * @param {boolean} [o.desplazar]          llevar el área al origen (por defecto, sí)
 * @param {string|Buffer} [o.casas]        house.xml (ruta, texto o buffer)
 * @param {string|Buffer} [o.spawns]       spawn.xml
 * @param {Map} [o.monsterTypes]           los monstruos del datapack (para validar)
 * @param {Map} [o.npcTypes]               los NPC del datapack
 * @returns {{raw: Object, informe: Object, map: Object|null, report: Object}}
 */
function importar(o) {
    const fuentes = o.fuentes;
    const area = leerArea(o.area);
    const desplazar = o.desplazar !== false;
    const avisos = [];
    const tiempos = {};
    const itemTypes = fuentes.itemTypes;
    const monsterTypes = o.monsterTypes || new Map();
    const npcTypes = o.npcTypes || new Map();

    // --- 1. Leer y traducir, casilla a casilla -----------------------------------
    // Cada casilla se traduce AL LEERLA (`alCasilla`) y la del OTBM se tira: en memoria solo queda
    // lo que va al mapa nuevo, que es bastante menos que el árbol leído. Las coordenadas quedan
    // absolutas hasta saber el rectángulo del mapa (sin `area`, sale de las casillas leídas).
    let t = process.hrtime.bigint();
    const buffer = Buffer.isBuffer(o.otbm) ? o.otbm : fs.readFileSync(o.otbm);
    const esSubtipoEnLinea = (id) => {
        const item = fuentes.otb.items.get(id);
        return Boolean(item && (Otbm.tieneBandera(item, 'apilable') || item.grupo === 'liquido' ||
            item.grupo === 'salpicadura'));
    };
    const tabla = fuentes.tabla;
    const porMetodo = new Contador();
    const sinEquivalencia = new Contador();
    const casasEnCasillas = new Set();
    const cuenta = { items: 0, mapeados: 0, omitidos: 0, sinEquivalencia: 0, contenidos: 0, cantidades: 0,
        suelosRepetidos: 0, casillasVacias: 0, destinosFuera: 0 };
    const respaldoSuelo = Number(fuentes.config.respaldo && fuentes.config.respaldo.suelo) || null;
    const tiles = [];
    const conDestino = [];
    const leidas = { x1: Infinity, y1: Infinity, x2: -1, y2: -1 };

    const traducirCasilla = (c) => {
        leidas.x1 = Math.min(leidas.x1, c.x);
        leidas.y1 = Math.min(leidas.y1, c.y);
        leidas.x2 = Math.max(leidas.x2, c.x);
        leidas.y2 = Math.max(leidas.y2, c.y);
        const entrada = { x: c.x, y: c.y, z: c.z };
        const items = [];
        c.items.forEach((item, posicion) => {
            cuenta.items += 1;
            if (item.contenido) {
                cuenta.contenidos += item.contenido.length;
            }
            let e = tabla.get(item.id);
            if (!e) {
                // Un suelo sin nada en la tabla (ni siquiera de respaldo): el de respaldo, para que la
                // casilla se pueda pisar como en el original.
                const delOtb = fuentes.otb.items.get(item.id);
                if (posicion === 0 && delOtb && delOtb.grupo === 'suelo' && respaldoSuelo) {
                    e = { destino: respaldoSuelo, metodo: 'respaldo' };
                } else {
                    cuenta.sinEquivalencia += 1;
                    sinEquivalencia.sumar(item.id);
                    return;
                }
            }
            if (!e.destino) {
                cuenta.omitidos += 1;
                porMetodo.sumar('omitido');
                return;
            }
            const definicion = itemTypes.get(e.destino);
            if (!definicion) {
                cuenta.sinEquivalencia += 1;
                sinEquivalencia.sumar(item.id);
                return;
            }
            cuenta.mapeados += 1;
            porMetodo.sumar(e.metodo);

            const nuevo = { id: e.destino };
            const a = definicion.attributes || {};
            if (item.count !== undefined && item.count !== 1) {
                if (activo(a.stackable)) {
                    nuevo.count = Math.max(1, item.count);
                } else {
                    cuenta.cantidades += 1;
                }
            }
            const atributos = {};
            ATRIBUTOS_QUE_SE_CONSERVAN.forEach((clave) => {
                if (item.atributos[clave] !== undefined) {
                    atributos[clave] = item.atributos[clave];
                }
            });
            if (atributos.teleportDestination) {
                conDestino.push(atributos);
            }
            if (Object.keys(atributos).length > 0) {
                nuevo.attributes = atributos;
            }
            items.push({ entrada: nuevo, suelo: activo(a.isGround) });
        });

        const suelo = items.find((i) => i.suelo);
        if (suelo) {
            entrada.ground = Object.keys(suelo.entrada).length === 1 ? suelo.entrada.id : suelo.entrada;
        }
        const resto = [];
        items.forEach((i) => {
            if (i === suelo) {
                return;
            }
            if (i.suelo) {
                cuenta.suelosRepetidos += 1;
                return;
            }
            resto.push(Object.keys(i.entrada).length === 1 ? i.entrada.id : i.entrada);
        });
        if (resto.length > 0) {
            entrada.items = resto;
        }
        const banderas = Otbm.nombresDeBanderas(c.flags);
        if (banderas.length > 0) {
            entrada.flags = banderas;
        }
        if (c.houseId) {
            entrada.houseId = c.houseId;
            casasEnCasillas.add(c.houseId);
        }
        if (entrada.ground === undefined && !entrada.items && !entrada.flags && !entrada.houseId) {
            cuenta.casillasVacias += 1;
            return;
        }
        tiles.push(entrada);
    };

    const leido = Otbm.leerOtbm(buffer, { area: area, subtipoEnLinea: esSubtipoEnLinea, alCasilla: traducirCasilla });
    tiempos.lectura = ms(t);
    leido.avisos.slice(0, 20).forEach((a) => avisos.push('otbm: ' + a));

    // --- 2. El rectángulo del mapa nuevo, y todo a su sitio ---------------------------
    t = process.hrtime.bigint();
    let caja = area;
    if (!caja) {
        caja = leidas.x2 < 0
            ? { x1: 0, y1: 0, x2: TAMANO_MINIMO - 1, y2: TAMANO_MINIMO - 1, z1: 0, z2: PLANTAS - 1 }
            : { x1: leidas.x1, y1: leidas.y1, x2: leidas.x2, y2: leidas.y2, z1: 0, z2: PLANTAS - 1 };
    }
    const origen = desplazar ? { x: caja.x1, y: caja.y1 } : { x: 0, y: 0 };
    const ancho = Math.max(TAMANO_MINIMO, caja.x2 - origen.x + 1);
    const alto = Math.max(TAMANO_MINIMO, caja.y2 - origen.y + 1);
    const dentro = (x, y, z) => x >= caja.x1 && x <= caja.x2 && y >= caja.y1 && y <= caja.y2 &&
        z >= caja.z1 && z <= caja.z2;
    const mover = (p) => ({ x: p.x - origen.x, y: p.y - origen.y, z: p.z });
    const comoLista = (p) => [p.x - origen.x, p.y - origen.y, p.z];
    tiles.forEach((tile) => {
        tile.x -= origen.x;
        tile.y -= origen.y;
    });
    conDestino.forEach((atributos) => {
        const d = atributos.teleportDestination;
        if (!dentro(d.x, d.y, d.z)) {
            cuenta.destinosFuera += 1;
        }
        atributos.teleportDestination = mover(d);
    });
    tiempos.conversion = ms(t);

    // --- 4. Ciudades, casas, waypoints, respawns, NPC -------------------------------
    t = process.hrtime.bigint();
    const towns = [];
    const ciudadesFuera = [];
    leido.ciudades.forEach((ciudad) => {
        if (dentro(ciudad.templo.x, ciudad.templo.y, ciudad.templo.z)) {
            towns.push({ id: ciudad.id, name: ciudad.nombre, temple: comoLista(ciudad.templo) });
        } else {
            ciudadesFuera.push(ciudad.nombre);
        }
    });
    const idsDeCiudad = new Set(towns.map((c) => c.id));

    const casasXml = leerCasas(o.casas);
    const houses = [];
    const casasSinCiudad = [];
    let salidasFuera = 0;
    const porIdCasa = new Map(casasXml.map((c) => [c.id, c]));
    Array.from(new Set(Array.from(casasEnCasillas).concat(
        casasXml.filter((c) => dentro(c.entrada.x, c.entrada.y, c.entrada.z)).map((c) => c.id))))
        .sort((a, b) => a - b)
        .forEach((id) => {
            const c = porIdCasa.get(id);
            if (!c) {
                houses.push({ id: id, name: 'Casa ' + id, townId: 0, rent: 0, exit: null });
                return;
            }
            const entradaDentro = dentro(c.entrada.x, c.entrada.y, c.entrada.z);
            if (!entradaDentro) {
                salidasFuera += 1;
            }
            if (c.ciudad && !idsDeCiudad.has(c.ciudad)) {
                casasSinCiudad.push(id);
            }
            houses.push({
                id: id,
                name: c.nombre || 'Casa ' + id,
                townId: idsDeCiudad.has(c.ciudad) ? c.ciudad : 0,
                rent: c.alquiler,
                exit: entradaDentro ? comoLista(c.entrada) : null
            });
        });
    const casasSinFicha = houses.filter((h) => !porIdCasa.has(h.id)).length;

    // Respawns: solo los monstruos que existen en el datapack (si se sabe cuáles son) y que caen
    // dentro del área. El radio crece para cubrir a todos: en TFS un monstruo puede estar fuera
    // del radio de su respawn, y aquí el cargador lo rechazaría.
    const porNombre = (tipos) => {
        const m = new Map();
        tipos.forEach((_, nombre) => m.set(String(nombre).toLowerCase(), nombre));
        return m;
    };
    const monstruosConocidos = porNombre(monsterTypes);
    const npcsConocidos = porNombre(npcTypes);
    const monstruosDesconocidos = new Contador();
    const npcsDesconocidos = new Contador();
    const spawns = [];
    const npcs = [];
    let monstruosImportados = 0;
    let respawnsLeidos = 0;
    leerSpawns(o.spawns).forEach((s) => {
        if (!dentro(s.x, s.y, s.z)) {
            return;
        }
        respawnsLeidos += 1;
        const monstruos = [];
        let radio = Math.max(0, s.radio);
        s.criaturas.forEach((cr) => {
            if (!dentro(cr.x, cr.y, cr.z) || cr.z !== s.z) {
                return;
            }
            if (cr.tipo === 'npc') {
                const nombre = npcsConocidos.size === 0 ? cr.nombre : npcsConocidos.get(cr.nombre.toLowerCase());
                if (!nombre) {
                    npcsDesconocidos.sumar(cr.nombre);
                    return;
                }
                npcs.push({ x: cr.x - origen.x, y: cr.y - origen.y, z: cr.z, name: nombre });
                return;
            }
            const nombre = monstruosConocidos.size === 0 ? cr.nombre : monstruosConocidos.get(cr.nombre.toLowerCase());
            if (!nombre) {
                monstruosDesconocidos.sumar(cr.nombre);
                return;
            }
            radio = Math.max(radio, Math.abs(cr.x - s.x), Math.abs(cr.y - s.y));
            monstruos.push({ name: nombre, x: cr.x - origen.x, y: cr.y - origen.y, interval: cr.intervalo });
        });
        if (monstruos.length === 0) {
            return;
        }
        monstruosImportados += monstruos.length;
        const intervalo = Math.min(...monstruos.map((m) => m.interval));
        spawns.push({
            x: s.x - origen.x, y: s.y - origen.y, z: s.z, radius: radio, interval: intervalo,
            monsters: monstruos.map((m) => (m.interval === intervalo
                ? { name: m.name, x: m.x, y: m.y } : m))
        });
    });

    const waypoints = {};
    leido.waypoints.forEach((w) => {
        if (dentro(w.x, w.y, w.z) && w.nombre) {
            waypoints[w.nombre] = comoLista(w);
        }
    });

    const raw = {
        format: MapLoader.FORMAT,
        version: 1,
        name: o.nombre || 'importado',
        width: ancho,
        height: alto,
        floors: PLANTAS,
        _comment: [
            'IMPORTADO DE OTBM por tools/importar-otbm.mjs (' + path.basename(typeof o.otbm === 'string' ? o.otbm : 'mapa.otbm') + ').',
            'Los ids se tradujeron con data/editor/equivalencias-otbm.json: lo que no tenia equivalencia se quito.'
        ],
        _otbm: {
            archivo: typeof o.otbm === 'string' ? path.basename(o.otbm) : null,
            version: leido.cabecera.version,
            items: leido.cabecera.itemsMayor + '.' + leido.cabecera.itemsMenor,
            descripcion: leido.descripciones.join(' | '),
            origen: origen,
            area: area
        },
        tiles: tiles,
        waypoints: waypoints,
        towns: towns,
        houses: houses,
        spawns: spawns,
        npcs: npcs
    };

    // --- 5. Validar con el cargador del motor -------------------------------------
    // Primero sin waypoints: un waypoint sobre una casilla que no se puede pisar es un error del
    // cargador, y para saber cuáles lo son hace falta el mapa construido.
    const tipos = { itemTypes: itemTypes, monsterTypes: monsterTypes, npcTypes: npcTypes };
    const sinWaypoints = MapLoader.buildMap(Object.assign({}, raw, { waypoints: {} }), tipos);
    const waypointsQuitados = [];
    if (sinWaypoints.map) {
        Object.keys(waypoints).forEach((nombre) => {
            const [x, y, z] = waypoints[nombre];
            if (!sinWaypoints.map.isWalkable(x, y, z)) {
                waypointsQuitados.push(nombre);
                delete waypoints[nombre];
            }
        });
        // Sin ninguna ciudad dentro, el motor no tiene dónde hacer aparecer a nadie: se pone el
        // waypoint `temple` en la casilla que se pueda pisar más cerca del centro de la superficie.
        if (towns.length === 0 && !waypoints.temple) {
            const templo = casillaPisableCercana(sinWaypoints.map, Math.floor(ancho / 2), Math.floor(alto / 2), 7, tiles);
            if (templo) {
                waypoints.temple = templo;
                avisos.push('ninguna ciudad tiene el templo dentro del area: se pone el waypoint "temple" en (' +
                    templo.join(',') + ')');
            } else {
                avisos.push('ninguna ciudad tiene el templo dentro del area y no hay ninguna casilla que se pueda ' +
                    'pisar para poner uno: el motor no tendra donde hacer aparecer a los jugadores');
            }
        }
    }
    const final = MapLoader.buildMap(raw, tipos);
    tiempos.validacion = ms(t);

    if (cuenta.contenidos > 0) {
        avisos.push(cuenta.contenidos + ' objetos dentro de contenedores no se importan (el mapa de Jetyum no guarda contenidos)');
    }
    if (cuenta.cantidades > 0) {
        avisos.push(cuenta.cantidades + ' cantidades o subtipos se pierden: el objeto de Jetyum no es apilable');
    }
    if (cuenta.destinosFuera > 0) {
        avisos.push(cuenta.destinosFuera + ' teleports llevan fuera del area importada');
    }
    if (salidasFuera > 0) {
        avisos.push(salidasFuera + ' casas tienen la salida fuera del area: se quedan sin salida');
    }
    if (casasSinCiudad.length > 0) {
        avisos.push(casasSinCiudad.length + ' casas son de una ciudad que queda fuera: se quedan sin ciudad');
    }
    if (casasSinFicha > 0) {
        avisos.push(casasSinFicha + ' casas salen en las casillas pero no en el house.xml' +
            (o.casas ? '' : ' (no se dio ninguno)') + ': se crean con nombre generico y sin alquiler');
    }
    if (waypointsQuitados.length > 0) {
        avisos.push('waypoints en una casilla que no se puede pisar (se quitan): ' + waypointsQuitados.join(', '));
    }
    if (!fuentes.materiales && fuentes.recalculada) {
        avisos.push('equivalencias calculadas sin materiales de RME: los muros y los bordes casan peor (usa --materiales)');
    }

    const nombreDe = (id) => {
        const tfs = fuentes.tfs && fuentes.tfs.get(id);
        const otbItem = fuentes.otb.items.get(id);
        return (tfs && tfs.name) || (otbItem && otbItem.nombre) || '';
    };
    const porcentaje = (n) => (cuenta.items > 0 ? Math.round((n / cuenta.items) * 1000) / 10 : 100);

    const informe = {
        archivo: typeof o.otbm === 'string' ? o.otbm : null,
        otbm: Object.assign({}, leido.cabecera, { descripcion: leido.descripciones }),
        area: area,
        origen: origen,
        ancho: ancho,
        alto: alto,
        casillas: { leidas: leido.estadisticas.casillas, escritas: tiles.length, vacias: cuenta.casillasVacias,
            zonas: leido.estadisticas.areas, zonasSaltadas: leido.estadisticas.areasSaltadas },
        items: {
            total: cuenta.items,
            mapeados: cuenta.mapeados,
            omitidos: cuenta.omitidos,
            sinEquivalencia: cuenta.sinEquivalencia,
            porcentajeMapeado: porcentaje(cuenta.mapeados),
            porcentajeResuelto: porcentaje(cuenta.mapeados + cuenta.omitidos),
            contenidosDescartados: cuenta.contenidos,
            suelosRepetidos: cuenta.suelosRepetidos,
            porMetodo: Object.fromEntries(porMetodo.ordenado())
        },
        sinEquivalencia: sinEquivalencia.ordenado().slice(0, CUANTOS_EN_EL_INFORME)
            .map(([id, veces]) => ({ id: id, nombre: nombreDe(id), veces: veces })),
        idsSinEquivalencia: sinEquivalencia.mapa.size,
        ciudades: { total: leido.ciudades.length, importadas: towns.length, fuera: ciudadesFuera },
        casas: { enXml: casasXml.length, importadas: houses.length, sinCiudad: casasSinCiudad.length,
            sinSalida: salidasFuera, sinFicha: casasSinFicha },
        waypoints: { total: leido.waypoints.length, importados: Object.keys(waypoints).length,
            quitados: waypointsQuitados },
        spawns: {
            respawns: respawnsLeidos, importados: spawns.length, monstruos: monstruosImportados,
            desconocidos: monstruosDesconocidos.ordenado().slice(0, CUANTOS_EN_EL_INFORME)
                .map(([nombre, veces]) => ({ nombre: nombre, veces: veces })),
            monstruosDesconocidos: monstruosDesconocidos.total
        },
        npcs: { importados: npcs.length, desconocidos: npcsDesconocidos.ordenado()
            .map(([nombre, veces]) => ({ nombre: nombre, veces: veces })) },
        equivalencias: { recalculadas: fuentes.recalculada, archivo: fuentes.archivoEquivalencias },
        tiempos: Object.assign({}, fuentes.tiempos || {}, tiempos),
        carga: {
            ok: final.report.ok,
            errores: final.report.errors.slice(0, 20).map((e) => (e.where ? e.where + ': ' : '') + e.message),
            avisos: final.report.warnings.length
        },
        avisos: avisos
    };

    return { raw: raw, informe: informe, map: final.map, report: final.report };
}

/**
 * La casilla que se puede pisar más cercana a (cx, cy) en la planta z, entre las casillas
 * escritas; si en esa planta no hay ninguna, en cualquiera. Devuelve `[x, y, z]` o null.
 */
function casillaPisableCercana(map, cx, cy, z, tiles) {
    let mejor = null;
    let distancia = Infinity;
    const mirar = (soloPlanta) => {
        tiles.forEach((t) => {
            if ((soloPlanta && t.z !== z) || !map.isWalkable(t.x, t.y, t.z)) {
                return;
            }
            const d = (t.x - cx) * (t.x - cx) + (t.y - cy) * (t.y - cy) + (soloPlanta ? 0 : Math.abs(t.z - z) * 1e6);
            if (d < distancia) {
                distancia = d;
                mejor = [t.x, t.y, t.z];
            }
        });
    };
    mirar(true);
    if (!mejor) {
        mirar(false);
    }
    return mejor;
}

/** El informe en texto, para la consola. */
function informeEnTexto(informe) {
    const l = [];
    const i = informe.items;
    l.push('OTBM v' + informe.otbm.version + ' (' + informe.otbm.ancho + 'x' + informe.otbm.alto + ', items ' +
        informe.otbm.itemsMayor + '.' + informe.otbm.itemsMenor + ')' +
        (informe.area ? ', area ' + [informe.area.x1, informe.area.y1, informe.area.x2, informe.area.y2,
            informe.area.z1, informe.area.z2].join(',') : ', mapa entero'));
    l.push('mapa nuevo: ' + informe.ancho + 'x' + informe.alto + ' (origen ' + informe.origen.x + ',' +
        informe.origen.y + ')');
    l.push('casillas: ' + informe.casillas.escritas + ' escritas de ' + informe.casillas.leidas + ' leidas' +
        (informe.casillas.vacias ? ' (' + informe.casillas.vacias + ' quedaron vacias)' : ''));
    l.push('objetos: ' + i.total + ' -> ' + i.mapeados + ' traducidos (' + i.porcentajeMapeado + '%), ' +
        i.omitidos + ' quitados a proposito, ' + i.sinEquivalencia + ' sin equivalencia (' +
        informe.idsSinEquivalencia + ' ids distintos)');
    l.push('  por metodo: ' + Object.keys(i.porMetodo).map((k) => k + ' ' + i.porMetodo[k]).join(', '));
    if (informe.sinEquivalencia.length > 0) {
        l.push('  sin equivalencia, de mas a menos:');
        informe.sinEquivalencia.slice(0, 20).forEach((s) => {
            l.push('    ' + String(s.id).padStart(6) + '  x' + String(s.veces).padEnd(6) + ' ' + s.nombre);
        });
    }
    l.push('ciudades: ' + informe.ciudades.importadas + ' de ' + informe.ciudades.total +
        (informe.ciudades.fuera.length ? ' (fuera: ' + informe.ciudades.fuera.join(', ') + ')' : ''));
    l.push('casas: ' + informe.casas.importadas + ' (house.xml: ' + informe.casas.enXml + ')');
    l.push('waypoints: ' + informe.waypoints.importados + ' de ' + informe.waypoints.total);
    l.push('respawns: ' + informe.spawns.importados + ' de ' + informe.spawns.respawns + ' en el area, ' +
        informe.spawns.monstruos + ' monstruos; ' + informe.spawns.monstruosDesconocidos +
        ' de monstruos que no existen en data/monsters');
    if (informe.spawns.desconocidos.length > 0) {
        l.push('  desconocidos: ' + informe.spawns.desconocidos.slice(0, 15)
            .map((d) => d.nombre + ' x' + d.veces).join(', '));
    }
    if (informe.npcs.importados || informe.npcs.desconocidos.length) {
        l.push('npc: ' + informe.npcs.importados + ' importados' + (informe.npcs.desconocidos.length
            ? ', desconocidos: ' + informe.npcs.desconocidos.map((d) => d.nombre).join(', ') : ''));
    }
    l.push('tiempos (ms): ' + Object.keys(informe.tiempos).map((k) => k + ' ' + informe.tiempos[k]).join(', '));
    l.push('carga en el motor: ' + (informe.carga.ok ? 'OK' : 'CON ERRORES') +
        (informe.carga.avisos ? ' (' + informe.carga.avisos + ' avisos)' : ''));
    informe.carga.errores.forEach((e) => l.push('  ERROR ' + e));
    informe.avisos.forEach((a) => l.push('aviso: ' + a));
    return l.join('\n');
}

// ---------------------------------------------------------------------------
// Exportar
// ---------------------------------------------------------------------------

/**
 * Convierte un mapa de Jetyum (en bruto) en los datos de un `.otbm` (para `Otbm.escribirOtbm`) y,
 * si los tiene, en un `house.xml` y un `spawn.xml`.
 *
 * Los ids se traducen con la tabla INVERSA (`Equivalencias.tablaInversa`): de los ids de Tibia que
 * van a parar a un mismo id de Jetyum se elige el más fiable. Lo que no tiene vuelta se quita y se
 * cuenta. Si el mapa se importó con desplazamiento (`_otbm.origen`), cada cosa vuelve a su sitio.
 *
 * @param {Object} raw el `*.map.json`
 * @param {{inversa: Map, origen?: {x,y}, nombreBase?: string, itemsMayor?, itemsMenor?}} o
 */
function exportar(raw, o) {
    const inversa = o.inversa;
    const origen = o.origen || (raw._otbm && raw._otbm.origen) || { x: 0, y: 0 };
    const base = o.nombreBase || raw.name || 'mapa';
    const sinVuelta = new Contador();
    const cuenta = { items: 0, exportados: 0, sinVuelta: 0 };
    const p = (x, y, z) => ({ x: Number(x) + origen.x, y: Number(y) + origen.y, z: Number(z) });
    const deLista = (v) => (Array.isArray(v) ? p(v[0], v[1], v[2]) : p(v.x, v.y, v.z));

    const traducir = (entrada) => {
        cuenta.items += 1;
        const e = typeof entrada === 'object' && entrada !== null ? entrada : { id: entrada };
        const vuelta = inversa.get(Number(e.id));
        if (!vuelta) {
            cuenta.sinVuelta += 1;
            sinVuelta.sumar(Number(e.id));
            return null;
        }
        cuenta.exportados += 1;
        const item = { id: vuelta.id, atributos: {} };
        if (e.count !== undefined && e.count !== 1) {
            item.count = Number(e.count);
        }
        const a = e.attributes || {};
        ATRIBUTOS_QUE_SE_CONSERVAN.forEach((clave) => {
            if (a[clave] !== undefined) {
                item.atributos[clave] = clave === 'teleportDestination' ? deLista(a[clave]) : a[clave];
            }
        });
        return item;
    };

    const casillas = [];
    (raw.tiles || []).forEach((t) => {
        const casilla = Object.assign(p(t.x, t.y, t.z), {
            houseId: Number(t.houseId) || 0,
            flags: Otbm.banderasDeNombres(t.flags),
            items: []
        });
        if (t.ground !== undefined) {
            const suelo = traducir(t.ground);
            if (suelo) {
                casilla.items.push(suelo);
            }
        }
        (t.items || []).forEach((entrada) => {
            const item = traducir(entrada);
            if (item) {
                casilla.items.push(item);
            }
        });
        if (casilla.items.length > 0 || casilla.flags || casilla.houseId) {
            casillas.push(casilla);
        }
    });

    let anchoTotal = 0;
    let altoTotal = 0;
    casillas.forEach((c) => {
        anchoTotal = Math.max(anchoTotal, c.x + 1);
        altoTotal = Math.max(altoTotal, c.y + 1);
    });
    const tieneCasas = (raw.houses || []).length > 0;
    const tieneSpawns = (raw.spawns || []).length > 0 || (raw.npcs || []).length > 0;

    const datos = {
        cabecera: {
            version: 2,
            ancho: Math.max(256, Math.ceil(anchoTotal / 256) * 256),
            alto: Math.max(256, Math.ceil(altoTotal / 256) * 256),
            itemsMayor: o.itemsMayor === undefined ? 3 : o.itemsMayor,
            itemsMenor: o.itemsMenor === undefined ? 20 : o.itemsMenor
        },
        descripciones: ['Exportado de Jetyum (' + (raw.name || base) + ')'],
        archivoSpawns: tieneSpawns ? base + '-spawn.xml' : null,
        archivoCasas: tieneCasas ? base + '-house.xml' : null,
        casillas: casillas,
        ciudades: (raw.towns || []).map((t) => ({ id: Number(t.id), nombre: String(t.name || ''), templo: deLista(t.temple) })),
        waypoints: Object.keys(raw.waypoints || {}).map((nombre) => Object.assign({ nombre: nombre },
            deLista(raw.waypoints[nombre])))
    };

    const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    let casasXml = null;
    if (tieneCasas) {
        const tamanos = new Contador();
        (raw.tiles || []).forEach((t) => {
            if (t.houseId) {
                tamanos.sumar(Number(t.houseId));
            }
        });
        casasXml = '<?xml version="1.0"?>\n<houses>\n' + raw.houses.map((h) => {
            const salida = h.exit ? deLista(h.exit) : { x: 0, y: 0, z: 0 };
            return '\t<house name="' + escapar(h.name || '') + '" houseid="' + h.id + '" entryx="' + salida.x +
                '" entryy="' + salida.y + '" entryz="' + salida.z + '" rent="' + (Number(h.rent) || 0) +
                '" townid="' + (Number(h.townId) || 0) + '" size="' + (tamanos.mapa.get(Number(h.id)) || 0) + '" />';
        }).join('\n') + '\n</houses>\n';
    }

    let spawnsXml = null;
    if (tieneSpawns) {
        const lineas = [];
        (raw.spawns || []).forEach((s) => {
            const centro = p(s.x, s.y, s.z);
            const intervalo = Number(s.interval) || 60000;
            const monstruos = Array.isArray(s.monsters) ? s.monsters : [{ name: s.monster }];
            lineas.push('\t<spawn centerx="' + centro.x + '" centery="' + centro.y + '" centerz="' + centro.z +
                '" radius="' + (s.radius === undefined ? 1 : s.radius) + '">');
            monstruos.forEach((m) => {
                const dx = m.x === undefined || m.x === null ? 0 : Number(m.x) - Number(s.x);
                const dy = m.y === undefined || m.y === null ? 0 : Number(m.y) - Number(s.y);
                lineas.push('\t\t<monster name="' + escapar(m.name) + '" x="' + dx + '" y="' + dy + '" z="' +
                    centro.z + '" spawntime="' + Math.round((Number(m.interval) || intervalo) / 1000) + '" />');
            });
            lineas.push('\t</spawn>');
        });
        (raw.npcs || []).forEach((n) => {
            const sitio = p(n.x, n.y, n.z);
            lineas.push('\t<spawn centerx="' + sitio.x + '" centery="' + sitio.y + '" centerz="' + sitio.z +
                '" radius="' + (n.radius === undefined || n.radius === null ? 1 : n.radius) + '">');
            lineas.push('\t\t<npc name="' + escapar(n.name) + '" x="0" y="0" z="' + sitio.z + '" spawntime="60" />');
            lineas.push('\t</spawn>');
        });
        spawnsXml = '<?xml version="1.0"?>\n<spawns>\n' + lineas.join('\n') + '\n</spawns>\n';
    }

    return {
        datos: datos,
        casasXml: casasXml,
        spawnsXml: spawnsXml,
        informe: {
            casillas: casillas.length,
            items: cuenta.items,
            exportados: cuenta.exportados,
            sinVuelta: cuenta.sinVuelta,
            idsSinVuelta: sinVuelta.ordenado().slice(0, CUANTOS_EN_EL_INFORME).map(([id, veces]) => ({ id: id, veces: veces }))
        }
    };
}

module.exports = {
    leerArea,
    cargarFuentes,
    guardarEquivalencias,
    leerCasas,
    leerSpawns,
    importar,
    exportar,
    informeEnTexto,
    ATRIBUTOS_QUE_SE_CONSERVAN
};
