'use strict';

/**
 * OTBM Y OTB: los archivos binarios de Tibia, leídos y escritos sin dependencias.
 *
 * Jetyum NO usa OTBM en tiempo de ejecución (ver ARQUITECTURA.md): su mapa es JSON. OTBM es la
 * FRONTERA, el formato en el que llegan los mapas hechos con Remere's Map Editor y sus derivados.
 * Este módulo es esa frontera: lee un `.otbm` (y el `items.otb` que da sentido a sus números) y
 * escribe uno. La conversión a JSON —con la traducción de ids— vive en `tools/importar-otbm.mjs`.
 *
 * EL FORMATO ES UN ÁRBOL DE NODOS, y es el mismo en los dos archivos:
 *
 *     identificador (4 bytes: "\0\0\0\0" u "OTBM")
 *     0xFE tipo  propiedades...  [hijos...]  0xFF
 *
 * Un nodo empieza con 0xFE seguido de su tipo, sus propiedades van detrás y termina con 0xFF; los
 * hijos van entre las propiedades y el 0xFF. Como las propiedades son binarias pueden contener
 * esos mismos bytes, así que dentro de ellas 0xFD ESCAPA al byte siguiente: `FD FE` es un 0xFE de
 * datos y no el principio de un nodo.
 *
 * SE RECORRE, NO SE CARGA ENTERO. Un mapa de 4 MB tiene cientos de miles de casillas, y montar un
 * objeto por nodo antes de mirar nada costaría memoria para cosas que el importador va a tirar (lo
 * que queda fuera del `--area`). `recorrerNodos` es un recorrido de un solo paso, sin recursión, que
 * avisa al abrir y al cerrar cada nodo y deja SALTARSE un subárbol entero sin copiar un byte: así es
 * como una zona de 256x256 que no interesa cuesta solo leerla de pasada. Las propiedades sin escapes
 * se entregan como una vista del buffer (`subarray`), sin copiar.
 *
 * Las versiones de OTBM que se leen son las cuatro (0..3 en la cabecera, que RME llama 1..4). La
 * única diferencia que afecta al formato de las casillas es la de la versión 0: allí la cantidad de
 * los objetos apilables y de los líquidos va pegada al id en vez de ir como atributo, y para saber
 * qué objetos la llevan hace falta el `items.otb` (`opciones.subtipoEnLinea`).
 */

const NODO_INICIO = 0xFE;
const NODO_FIN = 0xFF;
const ESCAPE = 0xFD;

/** Los tipos de nodo de OTBM (los `OTBM_NodeTypes_t` de TFS y RME). */
const NODO = {
    RAIZ: 0,
    RAIZ_V1: 1,
    DATOS_DEL_MAPA: 2,
    DEF_DE_ITEM: 3,
    AREA: 4,
    CASILLA: 5,
    ITEM: 6,
    CASILLA_CUADRADA: 7,
    CASILLA_REF: 8,
    SPAWNS: 9,
    AREA_DE_SPAWN: 10,
    MONSTRUO: 11,
    CIUDADES: 12,
    CIUDAD: 13,
    CASILLA_DE_CASA: 14,
    WAYPOINTS: 15,
    WAYPOINT: 16
};

/** Los atributos de OTBM (los `OTBM_AttrTypes_t`). Los del 23 en adelante son de TFS 1.x. */
const ATRIBUTO = {
    DESCRIPCION: 1,
    ARCHIVO_EXT: 2,
    BANDERAS_DE_CASILLA: 3,
    ACTION_ID: 4,
    UNIQUE_ID: 5,
    TEXTO: 6,
    DESC: 7,
    DESTINO: 8,
    ITEM: 9,
    DEPOT_ID: 10,
    ARCHIVO_SPAWNS: 11,
    CARGAS_DE_RUNA: 12,
    ARCHIVO_CASAS: 13,
    PUERTA_DE_CASA: 14,
    CANTIDAD: 15,
    DURACION: 16,
    ESTADO_DE_DECAY: 17,
    FECHA_ESCRITO: 18,
    ESCRITO_POR: 19,
    GUID_DURMIENTE: 20,
    INICIO_SUENO: 21,
    CARGAS: 22,
    ARCHIVO_SPAWNS_NPC: 23,
    MAPA_DE_ATRIBUTOS: 128
};

/**
 * Los atributos de objeto de TFS 1.x que llevan un tamaño fijo: se leen para poder seguir y se
 * descartan (son del juego guardado —nombres y estadísticas cambiadas—, no del mapa).
 */
const ATRIBUTOS_TFS = {
    23: 4, // ATTR_CONTAINER_ITEMS
    33: 4, 34: 4, 35: 4, 36: 4, 37: 4, // peso, ataque, defensa, defensa extra, armadura
    38: 1, 39: 1, // probabilidad de golpe, alcance
    41: 4, 42: 2, 43: 1, 44: 4 // decayTo, wrapId, storeItem, velocidad de ataque
};
/** Y los de TFS 1.x que son una cadena: nombre, artículo y plural. */
const ATRIBUTOS_TFS_CADENA = new Set([30, 31, 32]);

/** Las banderas de casilla de OTBM y su nombre en el formato de Jetyum (`FLAG_NAMES` del cargador). */
const BANDERAS_DE_CASILLA = {
    protectionZone: 1 << 0,
    noPvp: 1 << 2,
    noLogout: 1 << 3,
    pvpZone: 1 << 4
};

/** El tamaño de una zona de casillas: 256x256 en la misma planta. */
const LADO_DE_AREA = 256;

// ---------------------------------------------------------------------------
// El árbol de nodos
// ---------------------------------------------------------------------------

/** Quita los escapes de un trozo de propiedades. Sólo se llama si de verdad hay alguno. */
function desescapar(buffer, inicio, fin) {
    const salida = Buffer.allocUnsafe(fin - inicio);
    let n = 0;
    for (let p = inicio; p < fin; p += 1) {
        if (buffer[p] === ESCAPE) {
            p += 1;
        }
        salida[n] = buffer[p];
        n += 1;
    }
    return salida.subarray(0, n);
}

/**
 * Recorre el árbol de nodos de un buffer OTB/OTBM, de un solo paso y sin recursión.
 *
 * `visitante.abrir(tipo, propiedades, nivel)` se llama al empezar cada nodo, con las propiedades
 * ya sin escapes. Si devuelve `false`, el nodo y todos sus hijos se SALTAN: no se llama a nada más
 * para ellos, ni siquiera a `cerrar`. `visitante.cerrar(tipo, nivel)` se llama al terminar un nodo
 * que no se saltó.
 *
 * @param {Buffer} buffer el archivo entero
 * @param {{abrir: Function, cerrar?: Function}} visitante
 * @param {number} [inicio] dónde está el primer 0xFE (4, detrás del identificador)
 * @returns {{nodos: number, saltados: number}}
 */
function recorrerNodos(buffer, visitante, inicio) {
    const largo = buffer.length;
    let p = inicio === undefined ? 4 : inicio;
    if (buffer[p] !== NODO_INICIO) {
        throw new Error('no es un archivo OTB: falta el nodo raiz en el byte ' + p);
    }

    const tipos = [];
    let nivelSaltado = -1;
    let nodos = 0;
    let saltados = 0;

    while (p < largo) {
        const byte = buffer[p];

        if (byte === NODO_INICIO) {
            const tipo = buffer[p + 1];
            p += 2;
            const desde = p;
            let conEscapes = false;
            while (p < largo) {
                const c = buffer[p];
                if (c === ESCAPE) {
                    conEscapes = true;
                    p += 2;
                    continue;
                }
                if (c === NODO_INICIO || c === NODO_FIN) {
                    break;
                }
                p += 1;
            }
            tipos.push(tipo);
            nodos += 1;
            if (nivelSaltado !== -1) {
                saltados += 1;
                continue;
            }
            const propiedades = conEscapes ? desescapar(buffer, desde, p) : buffer.subarray(desde, p);
            if (visitante.abrir(tipo, propiedades, tipos.length - 1) === false) {
                nivelSaltado = tipos.length - 1;
                saltados += 1;
            }
            continue;
        }

        if (byte === NODO_FIN) {
            p += 1;
            const tipo = tipos.pop();
            if (tipo === undefined) {
                throw new Error('fin de nodo sin nodo abierto en el byte ' + (p - 1));
            }
            if (nivelSaltado !== -1) {
                if (tipos.length === nivelSaltado) {
                    nivelSaltado = -1;
                }
                continue;
            }
            if (visitante.cerrar) {
                visitante.cerrar(tipo, tipos.length);
            }
            if (tipos.length === 0) {
                break;
            }
            continue;
        }

        throw new Error('byte inesperado 0x' + byte.toString(16) + ' fuera de las propiedades, en el byte ' + p);
    }

    if (tipos.length > 0) {
        throw new Error('el archivo termina con ' + tipos.length + ' nodos sin cerrar (¿truncado?)');
    }
    return { nodos: nodos, saltados: saltados };
}

/** Un cursor sobre las propiedades de un nodo. Lanza si se lee más allá del final. */
class LectorDePropiedades {
    constructor(buffer) {
        this.b = buffer;
        this.p = 0;
    }

    quedan() {
        return this.b.length - this.p;
    }

    _necesita(n) {
        if (this.p + n > this.b.length) {
            throw new RangeError('propiedades cortas: se piden ' + n + ' bytes y quedan ' + this.quedan());
        }
    }

    u8() {
        this._necesita(1);
        return this.b[this.p++];
    }

    u16() {
        this._necesita(2);
        const v = this.b.readUInt16LE(this.p);
        this.p += 2;
        return v;
    }

    u32() {
        this._necesita(4);
        const v = this.b.readUInt32LE(this.p);
        this.p += 4;
        return v;
    }

    i32() {
        this._necesita(4);
        const v = this.b.readInt32LE(this.p);
        this.p += 4;
        return v;
    }

    bytes(n) {
        this._necesita(n);
        const v = this.b.subarray(this.p, this.p + n);
        this.p += n;
        return v;
    }

    saltar(n) {
        this._necesita(n);
        this.p += n;
    }

    /** Una cadena con su largo de 16 bits delante. */
    cadena() {
        return textoDeBytes(this.bytes(this.u16()));
    }

    /** Una cadena con su largo de 32 bits delante (la del mapa de atributos de RME). */
    cadenaLarga() {
        return textoDeBytes(this.bytes(this.u32()));
    }

    posicion() {
        return { x: this.u16(), y: this.u16(), z: this.u8() };
    }
}

/**
 * Los textos de un mapa de Tibia son Latin-1 (los de RME antiguos) o UTF-8 (los de ahora). Se
 * prueba UTF-8 y, si no es válido, se lee como Latin-1: «Ñandú» sale bien de los dos.
 */
function textoDeBytes(bytes) {
    const utf8 = bytes.toString('utf8');
    return utf8.includes('�') ? bytes.toString('latin1') : utf8;
}

// ---------------------------------------------------------------------------
// items.otb
// ---------------------------------------------------------------------------

/** Los grupos de items.otb (`itemgroup_t`). */
const GRUPO_OTB = ['ninguno', 'suelo', 'contenedor', 'arma', 'municion', 'armadura', 'cargas',
    'teleport', 'campo', 'escribible', 'llave', 'salpicadura', 'liquido', 'puerta', 'obsoleto'];

/** Las banderas de items.otb (`itemflags_t`) con su nombre aquí. */
const BANDERA_OTB = {
    bloqueaPaso: 1 << 0,
    bloqueaProyectil: 1 << 1,
    bloqueaCamino: 1 << 2,
    tieneAltura: 1 << 3,
    usable: 1 << 4,
    recogible: 1 << 5,
    movible: 1 << 6,
    apilable: 1 << 7,
    bajaPlanta: 1 << 8,
    alwaysOnTop: 1 << 13,
    legible: 1 << 14,
    rotable: 1 << 15,
    colgable: 1 << 16,
    vertical: 1 << 17,
    horizontal: 1 << 18,
    noDecae: 1 << 19,
    animado: 1 << 24,
    sueloCompleto: 1 << 25
};

/**
 * Lee un `items.otb`: de cada id de SERVIDOR, su id de cliente, su grupo y sus banderas.
 *
 * Es lo que hace falta para entender los números de un `.otbm`: el mapa guarda ids de servidor, y
 * el `items.otb` dice qué clase de cosa es cada uno (suelo, contenedor, puerta, apilable…).
 *
 * @returns {{version: {mayor, menor, build, descripcion}, items: Map<number, Object>}}
 */
function leerItemsOtb(buffer) {
    const items = new Map();
    const version = { mayor: 0, menor: 0, build: 0, descripcion: '' };

    recorrerNodos(buffer, {
        abrir(tipo, props, nivel) {
            const r = new LectorDePropiedades(props);
            if (nivel === 0) {
                r.u32(); // banderas, sin uso
                if (r.quedan() > 0 && r.u8() === 0x01) {
                    const largo = r.u16();
                    const datos = new LectorDePropiedades(r.bytes(largo));
                    version.mayor = datos.u32();
                    version.menor = datos.u32();
                    version.build = datos.u32();
                    if (datos.quedan() > 0) {
                        version.descripcion = datos.bytes(datos.quedan()).toString('latin1').replace(/\0.*$/s, '');
                    }
                }
                return true;
            }

            const item = {
                id: 0, clientId: 0, grupo: GRUPO_OTB[tipo] || 'ninguno', banderas: r.u32(),
                velocidad: 0, topOrder: null, minimapa: null, luz: null
            };
            while (r.quedan() > 0) {
                const atributo = r.u8();
                const largo = r.u16();
                const datos = new LectorDePropiedades(r.bytes(largo));
                if (atributo === 0x10) {
                    item.id = datos.u16();
                } else if (atributo === 0x11) {
                    item.clientId = datos.u16();
                } else if (atributo === 0x12) {
                    item.nombre = datos.bytes(largo).toString('latin1');
                } else if (atributo === 0x14) {
                    item.velocidad = datos.u16();
                } else if (atributo === 0x21 && largo >= 2) {
                    item.minimapa = datos.u16();
                } else if (atributo === 0x2A && largo >= 4) {
                    item.luz = { nivel: datos.u16(), color: datos.u16() };
                } else if (atributo === 0x2B) {
                    item.topOrder = datos.u8();
                }
            }
            if (item.id > 0) {
                items.set(item.id, item);
            }
            return false; // un item del otb no tiene hijos que interesen
        }
    });

    return { version: version, items: items };
}

/** ¿Tiene un item del otb esa bandera? */
function tieneBandera(item, nombre) {
    return Boolean(item && (item.banderas & BANDERA_OTB[nombre]));
}

// ---------------------------------------------------------------------------
// Leer un .otbm
// ---------------------------------------------------------------------------

/**
 * Lee los atributos de un objeto hasta que se acaban, a `item` (con los nombres de atributo de
 * Jetyum: `actionId`, `uniqueId`, `text`, `description`, `teleportDestination`, `depotId`,
 * `doorId`, `charges`…). Si aparece uno desconocido, cuyo tamaño no se sabe, no se puede seguir:
 * se para, se apunta y el objeto se queda con lo leído hasta ahí.
 */
function leerAtributosDeItem(r, item, avisos) {
    const a = item.atributos;
    while (r.quedan() > 0) {
        const atributo = r.u8();
        switch (atributo) {
            case ATRIBUTO.ACTION_ID: a.actionId = r.u16(); break;
            case ATRIBUTO.UNIQUE_ID: a.uniqueId = r.u16(); break;
            case ATRIBUTO.TEXTO: a.text = r.cadena(); break;
            case ATRIBUTO.DESC: a.description = r.cadena(); break;
            case ATRIBUTO.DESTINO: a.teleportDestination = r.posicion(); break;
            case ATRIBUTO.DEPOT_ID: a.depotId = r.u16(); break;
            case ATRIBUTO.CARGAS_DE_RUNA: a.charges = r.u8(); break;
            case ATRIBUTO.PUERTA_DE_CASA: a.doorId = r.u8(); break;
            case ATRIBUTO.CANTIDAD: item.count = r.u8(); break;
            case ATRIBUTO.DURACION: a.duration = r.u32(); break;
            case ATRIBUTO.ESTADO_DE_DECAY: a.decayState = r.u8(); break;
            case ATRIBUTO.FECHA_ESCRITO: a.writtenDate = r.u32(); break;
            case ATRIBUTO.ESCRITO_POR: a.writer = r.cadena(); break;
            case ATRIBUTO.GUID_DURMIENTE: a.sleeperGuid = r.u32(); break;
            case ATRIBUTO.INICIO_SUENO: a.sleepStart = r.u32(); break;
            case ATRIBUTO.CARGAS: a.charges = r.u16(); break;
            case ATRIBUTO.MAPA_DE_ATRIBUTOS: {
                // RME 3+: una lista clave -> valor con su tipo (1 cadena, 2 entero, 3 real, 4 booleano).
                const cuantos = r.u16();
                for (let i = 0; i < cuantos; i += 1) {
                    const clave = r.cadena();
                    const tipo = r.u8();
                    let valor;
                    if (tipo === 1) {
                        valor = r.cadenaLarga();
                    } else if (tipo === 2) {
                        valor = r.i32();
                    } else if (tipo === 3) {
                        valor = r.bytes(8).readDoubleLE(0);
                    } else if (tipo === 4) {
                        valor = r.u8() !== 0;
                    } else {
                        avisos.push('mapa de atributos con un tipo desconocido (' + tipo + ') en el objeto ' + item.id);
                        return;
                    }
                    a[clave] = valor;
                }
                break;
            }
            default:
                if (ATRIBUTOS_TFS[atributo]) {
                    r.saltar(ATRIBUTOS_TFS[atributo]);
                } else if (ATRIBUTOS_TFS_CADENA.has(atributo)) {
                    r.cadena();
                } else {
                    avisos.push('atributo ' + atributo + ' desconocido en el objeto ' + item.id +
                        ': se ignora el resto de sus atributos');
                    return;
                }
        }
    }
}

/**
 * ¿Cae (x, y, z) dentro del área? `area` es `{x1, y1, x2, y2, z1, z2}`, todo inclusivo, o null.
 */
function dentroDelArea(area, x, y, z) {
    return !area || (x >= area.x1 && x <= area.x2 && y >= area.y1 && y <= area.y2 && z >= area.z1 && z <= area.z2);
}

/**
 * Lee un `.otbm`.
 *
 * El resultado tiene la cabecera, los textos del mapa (descripciones y los nombres de sus archivos
 * de spawns y casas), las ciudades y los waypoints, y las CASILLAS:
 *
 *     {x, y, z, houseId, flags, items: [{id, count?, atributos: {...}, contenido?: [...]}]}
 *
 * en el orden de la pila (el primero abajo: el suelo; el último arriba). `flags` es la máscara de
 * OTBM; `nombresDeBanderas` la traduce.
 *
 * Con `opciones.alCasilla` cada casilla se entrega al leerla y NO se guarda: así un mapa entero se
 * puede recorrer sin tenerlo en memoria. Con `opciones.area` solo se leen las casillas de dentro, y
 * las zonas de 256x256 que caen enteras fuera se saltan sin mirarlas.
 *
 * @param {Buffer} buffer
 * @param {{area?: Object, alCasilla?: Function, subtipoEnLinea?: (id:number)=>boolean}} [opciones]
 */
function leerOtbm(buffer, opciones) {
    const opts = opciones || {};
    const area = opts.area || null;
    const avisos = [];
    const resultado = {
        cabecera: null,
        descripciones: [],
        archivoSpawns: null,
        archivoCasas: null,
        archivoSpawnsNpc: null,
        ciudades: [],
        waypoints: [],
        casillas: opts.alCasilla ? null : [],
        estadisticas: { areas: 0, areasSaltadas: 0, casillas: 0, casillasDeCasa: 0, items: 0, contenidos: 0 },
        avisos: avisos
    };

    const identificador = buffer.subarray(0, 4).toString('latin1');
    if (identificador !== '\0\0\0\0' && identificador !== 'OTBM') {
        throw new Error('no es un archivo OTBM: el identificador es ' + JSON.stringify(identificador));
    }

    // Lo que está abierto: la zona, la casilla y la pila de contenedores (la casilla y los objetos
    // que tienen objetos dentro).
    let zona = null;
    let casilla = null;
    const contenedores = [];
    const estadisticas = resultado.estadisticas;

    const entregar = (c) => {
        estadisticas.casillas += 1;
        if (opts.alCasilla) {
            opts.alCasilla(c);
        } else {
            resultado.casillas.push(c);
        }
    };

    recorrerNodos(buffer, {
        abrir(tipo, props, nivel) {
            const r = new LectorDePropiedades(props);

            if (nivel === 0) {
                resultado.cabecera = {
                    version: r.u32(), ancho: r.u16(), alto: r.u16(), itemsMayor: r.u32(), itemsMenor: r.u32()
                };
                if (resultado.cabecera.version > 3) {
                    avisos.push('version de OTBM ' + resultado.cabecera.version + ': se lee como la 3');
                }
                return true;
            }

            switch (tipo) {
                case NODO.DATOS_DEL_MAPA:
                    while (r.quedan() > 0) {
                        const atributo = r.u8();
                        if (atributo === ATRIBUTO.DESCRIPCION) {
                            resultado.descripciones.push(r.cadena());
                        } else if (atributo === ATRIBUTO.ARCHIVO_SPAWNS) {
                            resultado.archivoSpawns = r.cadena();
                        } else if (atributo === ATRIBUTO.ARCHIVO_CASAS) {
                            resultado.archivoCasas = r.cadena();
                        } else if (atributo === ATRIBUTO.ARCHIVO_SPAWNS_NPC) {
                            resultado.archivoSpawnsNpc = r.cadena();
                        } else {
                            avisos.push('atributo ' + atributo + ' desconocido en los datos del mapa');
                            break;
                        }
                    }
                    return true;

                case NODO.AREA: {
                    zona = r.posicion();
                    estadisticas.areas += 1;
                    if (area && (zona.z < area.z1 || zona.z > area.z2 ||
                        zona.x + LADO_DE_AREA - 1 < area.x1 || zona.x > area.x2 ||
                        zona.y + LADO_DE_AREA - 1 < area.y1 || zona.y > area.y2)) {
                        estadisticas.areasSaltadas += 1;
                        return false;
                    }
                    return true;
                }

                case NODO.CASILLA:
                case NODO.CASILLA_DE_CASA: {
                    if (!zona) {
                        avisos.push('casilla fuera de una zona: se ignora');
                        return false;
                    }
                    const x = zona.x + r.u8();
                    const y = zona.y + r.u8();
                    if (!dentroDelArea(area, x, y, zona.z)) {
                        return false;
                    }
                    casilla = { x: x, y: y, z: zona.z, houseId: 0, flags: 0, items: [] };
                    if (tipo === NODO.CASILLA_DE_CASA) {
                        casilla.houseId = r.u32();
                        estadisticas.casillasDeCasa += 1;
                    }
                    while (r.quedan() > 0) {
                        const atributo = r.u8();
                        if (atributo === ATRIBUTO.BANDERAS_DE_CASILLA) {
                            casilla.flags = r.u32();
                        } else if (atributo === ATRIBUTO.ITEM) {
                            casilla.items.push({ id: r.u16(), atributos: {} });
                            estadisticas.items += 1;
                        } else {
                            avisos.push('atributo ' + atributo + ' desconocido en la casilla (' + x + ',' + y + ',' +
                                zona.z + ')');
                            break;
                        }
                    }
                    contenedores.length = 0;
                    contenedores.push(casilla.items);
                    return true;
                }

                case NODO.ITEM: {
                    if (!casilla) {
                        avisos.push('objeto fuera de una casilla: se ignora');
                        return false;
                    }
                    const item = { id: r.u16(), atributos: {} };
                    if (resultado.cabecera.version === 0 && opts.subtipoEnLinea && opts.subtipoEnLinea(item.id) &&
                        r.quedan() > 0) {
                        item.count = r.u8();
                    }
                    leerAtributosDeItem(r, item, avisos);
                    const destino = contenedores[contenedores.length - 1];
                    destino.push(item);
                    if (contenedores.length > 1) {
                        estadisticas.contenidos += 1;
                    } else {
                        estadisticas.items += 1;
                    }
                    item.contenido = [];
                    contenedores.push(item.contenido);
                    return true;
                }

                case NODO.CIUDADES:
                case NODO.WAYPOINTS:
                    return true;

                case NODO.CIUDAD: {
                    const id = r.u32();
                    const nombre = r.cadena();
                    resultado.ciudades.push({ id: id, nombre: nombre, templo: r.posicion() });
                    return true;
                }

                case NODO.WAYPOINT: {
                    const nombre = r.cadena();
                    const posicion = r.posicion();
                    resultado.waypoints.push({ nombre: nombre, x: posicion.x, y: posicion.y, z: posicion.z });
                    return true;
                }

                default:
                    avisos.push('nodo de tipo ' + tipo + ' desconocido en el nivel ' + nivel + ': se salta');
                    return false;
            }
        },

        cerrar(tipo) {
            if (tipo === NODO.ITEM) {
                const contenido = contenedores.pop();
                // El objeto acaba de cerrarse: si no tenía nada dentro, se le quita la lista vacía.
                const padre = contenedores[contenedores.length - 1];
                const item = padre[padre.length - 1];
                if (contenido.length === 0) {
                    delete item.contenido;
                }
            } else if (tipo === NODO.CASILLA || tipo === NODO.CASILLA_DE_CASA) {
                entregar(casilla);
                casilla = null;
                contenedores.length = 0;
            } else if (tipo === NODO.AREA) {
                zona = null;
            }
        }
    });

    if (!resultado.cabecera) {
        throw new Error('el OTBM no tiene cabecera');
    }
    return resultado;
}

/** Los nombres de las banderas de una casilla (`protectionZone`, `noPvp`…). */
function nombresDeBanderas(flags) {
    return Object.keys(BANDERAS_DE_CASILLA).filter((nombre) => (flags & BANDERAS_DE_CASILLA[nombre]) !== 0);
}

/** La máscara de OTBM de unos nombres de bandera. Los que no existen en OTBM (`house`) se ignoran. */
function banderasDeNombres(nombres) {
    return (nombres || []).reduce((m, nombre) => m | (BANDERAS_DE_CASILLA[nombre] || 0), 0);
}

// ---------------------------------------------------------------------------
// Escribir un .otbm
// ---------------------------------------------------------------------------

/**
 * Escribe un árbol de nodos, escapando lo que haga falta. Se escribe a trozos de 64 KB que se
 * juntan al final: un mapa grande no se construye a base de concatenar buffers pequeños.
 */
class EscritorDeNodos {
    constructor() {
        this.trozos = [];
        this.actual = Buffer.allocUnsafe(1 << 16);
        this.p = 0;
        this._crudo(Buffer.from([0, 0, 0, 0]));
    }

    _byteCrudo(b) {
        if (this.p === this.actual.length) {
            this.trozos.push(this.actual);
            this.actual = Buffer.allocUnsafe(1 << 16);
            this.p = 0;
        }
        this.actual[this.p++] = b;
    }

    _crudo(bytes) {
        for (let i = 0; i < bytes.length; i += 1) {
            this._byteCrudo(bytes[i]);
        }
    }

    /** Un byte de propiedades: si coincide con un byte de control, va escapado. */
    _byte(b) {
        if (b === NODO_INICIO || b === NODO_FIN || b === ESCAPE) {
            this._byteCrudo(ESCAPE);
        }
        this._byteCrudo(b);
    }

    inicio(tipo) {
        this._byteCrudo(NODO_INICIO);
        this._byteCrudo(tipo);
        return this;
    }

    fin() {
        this._byteCrudo(NODO_FIN);
        return this;
    }

    u8(v) {
        this._byte(v & 0xFF);
        return this;
    }

    u16(v) {
        this._byte(v & 0xFF);
        this._byte((v >>> 8) & 0xFF);
        return this;
    }

    u32(v) {
        this.u16(v & 0xFFFF);
        this.u16((v >>> 16) & 0xFFFF);
        return this;
    }

    /** Latin-1 si cabe (es lo que leen RME y TFS de siempre), UTF-8 si no. */
    cadena(texto) {
        const s = String(texto);
        // eslint-disable-next-line no-control-regex
        const bytes = Buffer.from(s, /^[\u0000-ÿ]*$/.test(s) ? 'latin1' : 'utf8');
        this.u16(bytes.length);
        for (let i = 0; i < bytes.length; i += 1) {
            this._byte(bytes[i]);
        }
        return this;
    }

    posicion(p) {
        return this.u16(p.x).u16(p.y).u8(p.z);
    }

    resultado() {
        return Buffer.concat(this.trozos.concat([this.actual.subarray(0, this.p)]));
    }
}

/** Escribe un objeto con sus atributos y su contenido. */
function escribirItem(w, item) {
    w.inicio(NODO.ITEM).u16(item.id);
    const a = item.atributos || {};
    if (item.count !== undefined && item.count !== 1) {
        w.u8(ATRIBUTO.CANTIDAD).u8(Math.max(0, Math.min(255, item.count)));
    }
    if (a.actionId !== undefined) { w.u8(ATRIBUTO.ACTION_ID).u16(Number(a.actionId)); }
    if (a.uniqueId !== undefined) { w.u8(ATRIBUTO.UNIQUE_ID).u16(Number(a.uniqueId)); }
    if (a.text !== undefined) { w.u8(ATRIBUTO.TEXTO).cadena(a.text); }
    if (a.description !== undefined) { w.u8(ATRIBUTO.DESC).cadena(a.description); }
    if (a.teleportDestination) { w.u8(ATRIBUTO.DESTINO).posicion(a.teleportDestination); }
    if (a.depotId !== undefined) { w.u8(ATRIBUTO.DEPOT_ID).u16(Number(a.depotId)); }
    if (a.doorId !== undefined) { w.u8(ATRIBUTO.PUERTA_DE_CASA).u8(Number(a.doorId)); }
    if (a.charges !== undefined) { w.u8(ATRIBUTO.CARGAS).u16(Number(a.charges)); }
    if (a.duration !== undefined) { w.u8(ATRIBUTO.DURACION).u32(Number(a.duration)); }
    if (a.writtenDate !== undefined) { w.u8(ATRIBUTO.FECHA_ESCRITO).u32(Number(a.writtenDate)); }
    if (a.writer !== undefined) { w.u8(ATRIBUTO.ESCRITO_POR).cadena(a.writer); }
    (item.contenido || []).forEach((dentro) => escribirItem(w, dentro));
    w.fin();
}

/**
 * Escribe un `.otbm` (versión 2 por defecto, la de los mapas 8.x de RME).
 *
 * `datos` tiene la forma que devuelve `leerOtbm` (con `casillas` en una lista): la ida y vuelta
 * `leerOtbm(escribirOtbm(x))` devuelve lo mismo. Las casillas se agrupan en sus zonas de 256x256
 * y todos los objetos van como nodos hijos, también el suelo.
 */
function escribirOtbm(datos) {
    const c = datos.cabecera || {};
    const w = new EscritorDeNodos();

    w.inicio(NODO.RAIZ)
        .u32(c.version === undefined ? 2 : c.version)
        .u16(c.ancho || 0).u16(c.alto || 0)
        .u32(c.itemsMayor === undefined ? 3 : c.itemsMayor)
        .u32(c.itemsMenor === undefined ? 20 : c.itemsMenor);

    w.inicio(NODO.DATOS_DEL_MAPA);
    (datos.descripciones || []).forEach((d) => w.u8(ATRIBUTO.DESCRIPCION).cadena(d));
    if (datos.archivoSpawns) {
        w.u8(ATRIBUTO.ARCHIVO_SPAWNS).cadena(datos.archivoSpawns);
    }
    if (datos.archivoCasas) {
        w.u8(ATRIBUTO.ARCHIVO_CASAS).cadena(datos.archivoCasas);
    }

    // Las casillas, por zonas. Dentro de cada zona, en el orden en que llegan.
    const zonas = new Map();
    (datos.casillas || []).forEach((casilla) => {
        const zx = casilla.x - (casilla.x % LADO_DE_AREA);
        const zy = casilla.y - (casilla.y % LADO_DE_AREA);
        const clave = casilla.z * 1e10 + zy * 1e5 + zx;
        if (!zonas.has(clave)) {
            zonas.set(clave, { x: zx, y: zy, z: casilla.z, casillas: [] });
        }
        zonas.get(clave).casillas.push(casilla);
    });
    Array.from(zonas.keys()).sort((a, b) => a - b).forEach((clave) => {
        const zona = zonas.get(clave);
        w.inicio(NODO.AREA).posicion(zona);
        zona.casillas.forEach((casilla) => {
            if (casilla.houseId) {
                w.inicio(NODO.CASILLA_DE_CASA).u8(casilla.x - zona.x).u8(casilla.y - zona.y).u32(casilla.houseId);
            } else {
                w.inicio(NODO.CASILLA).u8(casilla.x - zona.x).u8(casilla.y - zona.y);
            }
            if (casilla.flags) {
                w.u8(ATRIBUTO.BANDERAS_DE_CASILLA).u32(casilla.flags);
            }
            (casilla.items || []).forEach((item) => escribirItem(w, item));
            w.fin();
        });
        w.fin();
    });

    w.inicio(NODO.CIUDADES);
    (datos.ciudades || []).forEach((ciudad) => {
        w.inicio(NODO.CIUDAD).u32(ciudad.id).cadena(ciudad.nombre).posicion(ciudad.templo).fin();
    });
    w.fin();

    if ((c.version === undefined ? 2 : c.version) >= 2) {
        w.inicio(NODO.WAYPOINTS);
        (datos.waypoints || []).forEach((wp) => {
            w.inicio(NODO.WAYPOINT).cadena(wp.nombre).posicion(wp).fin();
        });
        w.fin();
    }

    w.fin(); // datos del mapa
    w.fin(); // raíz
    return w.resultado();
}

module.exports = {
    NODO,
    ATRIBUTO,
    BANDERAS_DE_CASILLA,
    BANDERA_OTB,
    GRUPO_OTB,
    LADO_DE_AREA,
    recorrerNodos,
    LectorDePropiedades,
    EscritorDeNodos,
    leerItemsOtb,
    tieneBandera,
    leerOtbm,
    escribirOtbm,
    nombresDeBanderas,
    banderasDeNombres,
    dentroDelArea
};
