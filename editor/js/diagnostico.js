/**
 * EL DIAGNÓSTICO DEL MAPA: la lista de cosas que están mal o huelen mal, con un clic para ir a
 * cada una.
 *
 * Es el «Map Diagnostics» de NexaMap y lo que en Remere's se hace a mano con «Find Unique», «Find
 * Action» y mirando casilla por casilla: uniqueId repetidos, teleports que llevan al vacío,
 * casillas sin suelo, objetos que ya no existen en items.xml, casas sin casillas o con la salida
 * dentro, templos y waypoints encima de un muro, respawns de monstruos que no existen, escaleras
 * que bajan a ninguna parte...
 *
 * QUÉ NO ES: no es el validador del motor (`engine/world/loader.js`). El validador decide si un
 * mapa SE PUEDE CARGAR, y lo que rechaza ya lo rechaza el servidor al abrir y al guardar. Esto va
 * por detrás y busca lo que se carga sin quejarse y luego falla jugando: un teleport cuyo destino
 * es un muro carga perfectamente, y el primer jugador que lo pise se queda donde estaba sin saber
 * por qué. Algunas comprobaciones coinciden con el validador a propósito —un objeto desconocido,
 * un waypoint sobre un muro—, porque en el editor el mapa puede llegar a ese estado entre dos
 * guardados (o con un items.xml que cambió por debajo), y es mejor verlo aquí con su casilla que
 * en un 422 del servidor con una lista de texto.
 *
 * LAS REGLAS DE PASO SON LAS DEL MOTOR, no unas parecidas. Si el diagnóstico dijera «transitable»
 * donde el motor dice «muro», sus avisos serían ruido y nadie los miraría. Por eso se repite aquí
 * con cuidado lo que hacen `GameMap.isWalkable`, `Tile.isWalkable` e `Item.hasFlag`:
 *
 *   - Una casilla explícita sin `ground` HEREDA el suelo por defecto de su planta
 *     (`getOrCreateTile`), y un objeto con `isGround` de su lista PASA A SER el suelo
 *     (`getStackBand`). Sin suelo, la casilla es un agujero y no se pisa.
 *   - El suelo por defecto de una planta es el de `defaultGround` y, si no lo declara, el
 *     `fallbackGround`, PERO SÓLO DE LA PLANTA 7 HACIA ABAJO (`groundFor` y `SURFACE_MAX_Z`): por
 *     encima de la superficie lo que no se escribe es aire. Ojo, que el editor NO hace esa
 *     distinción en `defaultGroundFor` —para dibujar le da igual—, así que aquí no se usa.
 *   - Un objeto bloquea si su definición dice `blocksSolid`, y lo que lleve LA INSTANCIA en sus
 *     atributos manda sobre el tipo.
 *   - Un objeto que no existe en items.xml no está: el cargador lo descarta. Así que no bloquea,
 *     no es suelo, y se avisa de él aparte.
 *
 * Y LOS CAMBIOS DE PLANTA SON LOS DEL SCRIPT `data/scripts/movements/tiles/floorchange.js`, que
 * es quien de verdad mueve al jugador: `down` baja a la misma casilla de la planta de abajo (y si
 * ahí hay una rampa, aparece delante de ella), y `north`/`south`/`east`/`west` suben una casilla
 * en esa dirección (dos con `...alt`). En Tibia la Z crece hacia abajo: bajar es `z + 1`.
 *
 * RÁPIDO EN UN MAPA GRANDE Y DISPERSO. Un mapa de 2048x2048 tiene cuatro millones de celdas por
 * planta y casi todas son suelo por defecto que nadie escribió. Se recorren SÓLO las casillas
 * explícitas, una vez, y las consultas a otras casillas (el destino de un teleport, el centro de
 * un respawn) son búsquedas en el `Map` de casillas con una caché. Nada recorre el mapa entero.
 *
 * El resultado es una lista plana de `{ tipo, gravedad, mensaje, x, y, z }`. `construirPanel`
 * la pinta con filtros y llama a `irA(x, y, z)` al pinchar una fila: el panel no sabe nada del
 * lienzo, y así se prueba en Node sin navegador.
 */

import { registrar } from '../../shared/js/i18n.mjs';
import diccionarioIngles from '../../shared/i18n/en/editor-diagnostico.mjs';

/*
 * EL DICCIONARIO SE REGISTRA AQUÍ MISMO, y no sólo en `shared/i18n/herramientas.mjs`: así el
 * panel sale traducido aunque nadie se acuerde de añadirlo allí. Registrar dos veces las mismas
 * frases no hace daño (la última gana, y es la misma).
 */
registrar('en', diccionarioIngles);

/** La última planta de superficie, como `SURFACE_MAX_Z` en `engine/world/map.js`. */
const ULTIMA_PLANTA_DE_SUPERFICIE = 7;

/** Las direcciones de `floorchange`, copiadas de `floorchange.js`. */
const DIRECCIONES_DE_PLANTA = {
    north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
    northalt: [0, -2], southalt: [0, 2], eastalt: [2, 0], westalt: [-2, 0]
};

/** Los teleports por id cuando su definición no dice nada (el de `teleport.js`). */
const IDS_DE_TELEPORT = [1387];

/** Lo que se considera «demasiado lejos» entre una casa y su salida, en casillas. */
const DISTANCIA_MAXIMA_DE_SALIDA = 2;

/** Hasta qué radio se cuentan las casillas libres de un respawn (un radio absurdo no cuelga). */
const RADIO_MAXIMO_CONTADO = 30;

/**
 * LOS TIPOS DE PROBLEMA, en el orden en que se enseñan, con su nombre para el filtro.
 *
 * El orden es el de importancia práctica: lo que rompe una partida (un teleport, un uid
 * repetido) va antes que lo feo (dos muros en la misma casilla).
 */
export const TIPOS = {
    'objeto-desconocido': 'Objeto desconocido',
    'uid-repetido': 'uniqueId repetido',
    'teleport': 'Teleport roto',
    'cambio-de-planta': 'Escalera o agujero sin salida',
    'ciudad': 'Ciudad y templo',
    'waypoint': 'Waypoint',
    'casa': 'Casa',
    'respawn': 'Respawn',
    'npc': 'NPC',
    'sin-suelo': 'Casilla sin suelo',
    'bloqueo-apilado': 'Bloqueo sobre bloqueo'
};

/**
 * LAS FRASES, en un solo sitio y con huecos entre llaves.
 *
 * Están juntas por dos razones: el diccionario inglés tiene que tener EXACTAMENTE estas
 * plantillas (la prueba lo comprueba recorriendo este objeto), y una frase escrita dos veces de
 * dos formas acaba con una traducida y la otra no. Los valores que caen en un hueco no llevan
 * nunca « — », « · », « | » ni «; »: son los separadores por los que `i18n.mjs` parte un texto, y
 * un hueco que los contenga no casaría.
 */
export const MENSAJES = {
    sueloDePlanta: 'el suelo por defecto de la planta {z} es el objeto {id}, que no existe en items.xml',
    sueloDeReserva: 'el suelo de reserva (fallbackGround) es el objeto {id}, que no existe en items.xml',
    objetoDesconocido: 'el objeto {id} no existe en items.xml: el motor lo descarta al cargar',
    sueloDesconocido: 'el suelo {id} no existe en items.xml: el motor lo descarta al cargar',

    uidRepetido: 'uniqueId {uid} repetido en {objeto}: también está en {pos}',

    tpSinDestino: 'el teleport no tiene destino: quien lo pise no irá a ninguna parte',
    tpIlegible: 'el destino del teleport no se puede leer: {valor}',
    tpFuera: 'el teleport lleva a {pos}, que está fuera del mapa',
    tpVacio: 'el teleport lleva a {pos}, que es vacío: no hay suelo',
    tpBloqueado: 'el teleport lleva a {pos}, que no se puede pisar',
    tpPropio: 'el teleport lleva a su propia casilla',

    plantaFuera: '{objeto} ({sentido}) lleva a la planta {z}, que no existe',
    plantaVacio: '{objeto} ({sentido}) lleva a {pos}, que es vacío: no hay suelo',
    plantaBloqueado: '{objeto} ({sentido}) lleva a {pos}, que no se puede pisar',
    plantaDesconocido: '{objeto} tiene un floorchange desconocido: «{sentido}»',

    sinSuelo: 'casilla con objetos y sin suelo: en el juego es un agujero',
    bloqueoApilado: '{n} objetos que bloquean el paso en la misma casilla: {nombres}',

    casaInexistente: '{n} casillas de la casa {id}, que no está en la lista de casas',
    casaIdInvalido: 'la casa #{indice} tiene un id inválido o repetido ({id})',
    casaSinCasillas: 'la casa «{nombre}» no tiene ninguna casilla',
    casaCiudad: 'la casa «{nombre}» es de la ciudad {ciudad}, que no existe',
    casaSinSalida: 'la casa «{nombre}» no tiene salida',
    casaSalidaIlegible: 'la salida de la casa «{nombre}» no se puede leer: {valor}',
    casaSalidaFuera: 'la salida de la casa «{nombre}» cae fuera del mapa: {pos}',
    casaSalidaDentro: 'la salida de la casa «{nombre}» está dentro de una casa',
    casaSalidaBloqueada: 'la salida de la casa «{nombre}» no se puede pisar',
    casaSalidaLejos: 'la salida de la casa «{nombre}» está a {n} casillas de la casa',
    casaSalidaOtraPlanta: 'la salida de la casa «{nombre}» está en una planta sin casillas de la casa',

    ciudadIdInvalido: 'la ciudad #{indice} tiene un id inválido o repetido ({id})',
    ciudadSinTemplo: 'la ciudad «{nombre}» no tiene templo, o no se puede leer: {valor}',
    temploFuera: 'el templo de la ciudad «{nombre}» cae fuera del mapa: {pos}',
    temploBloqueado: 'el templo de la ciudad «{nombre}» cae en una casilla que no se puede pisar',

    waypointIlegible: 'el waypoint «{nombre}» no se puede leer: {valor}',
    waypointFuera: 'el waypoint «{nombre}» cae fuera del mapa: {pos}',
    waypointBloqueado: 'el waypoint «{nombre}» cae en una casilla que no se puede pisar: el motor no carga el mapa así',

    respawnFuera: 'el respawn de {monstruos} tiene el centro fuera del mapa',
    respawnDesconocidos: 'el respawn tiene monstruos que no existen en data/monsters/: {nombres}',
    respawnCentro: 'el centro del respawn de {monstruos} no se puede pisar',
    respawnSinSitio: 'el respawn de {monstruos} no tiene ninguna casilla que se pueda pisar',
    monstruoFuera: '{monstruo} está fuera de su respawn',
    monstruoBloqueado: '{monstruo} está en una casilla que no se puede pisar',
    monstruoProtegido: '{monstruo} está en una zona protegida, donde no entran los monstruos',

    npcFuera: 'el NPC «{nombre}» está fuera del mapa: {pos}',
    npcDesconocido: 'el NPC «{nombre}» no está definido en data/npc/npcs.xml',
    npcBloqueado: 'el NPC «{nombre}» está en una casilla que no se puede pisar: no se podrá llegar a él',
    npcRepetido: 'hay {n} NPC en la misma casilla: {nombres}'
};

/** Rellena una plantilla de `MENSAJES`. Un hueco sin valor se queda como está, y se ve. */
function componer(plantilla, valores) {
    return plantilla.replace(/\{(\w+)\}/g, (todo, nombre) =>
        (valores && valores[nombre] !== undefined ? String(valores[nombre]) : todo));
}

function textoDePosicion(p) {
    return '(' + p.x + ',' + p.y + ',' + p.z + ')';
}

/**
 * Una posición del archivo, se escriba como se escriba: `[x, y, z]` (templos, salidas,
 * waypoints), `{x, y, z}` (el destino de un teleport) o `"x,y,z"`. `null` si no se puede leer:
 * una posición a medias no se completa con ceros, que mandarían al jugador a la esquina.
 */
function posicionDe(valor) {
    let x;
    let y;
    let z;

    if (Array.isArray(valor)) {
        [x, y, z] = valor;
    } else if (valor && typeof valor === 'object') {
        ({ x, y, z } = valor);
    } else if (typeof valor === 'string') {
        const trozos = valor.replace(/[[\]{}()\s]/g, '').split(/[,:;]/);
        if (trozos.length === 3) {
            [x, y, z] = trozos;
        }
    }

    const p = { x: Number(x), y: Number(y), z: Number(z) };
    if (x === undefined || x === null || x === '' || y === undefined || y === null || y === '' ||
        z === undefined || z === null || z === '' ||
        !Number.isInteger(p.x) || !Number.isInteger(p.y) || !Number.isInteger(p.z)) {
        return null;
    }
    return p;
}

/** El id de una entrada del archivo, que puede ser un número suelto o `{id, ...}`. */
function idDe(entrada) {
    return Number(typeof entrada === 'object' && entrada !== null ? entrada.id : entrada);
}

function atributosDe(entrada) {
    return typeof entrada === 'object' && entrada !== null && entrada.attributes
        ? entrada.attributes : null;
}

/** Verdadero en el sentido de items.xml: `1`, `'1'`, `true`, `'true'`. */
function verdadero(valor) {
    return valor === true || valor === 1 || valor === '1' || valor === 'true';
}

/** La lista de nombres, sin repetir y en el orden en que aparecen. */
function nombresUnicos(nombres) {
    return Array.from(new Set(nombres)).join(', ');
}

/**
 * Las preguntas que todas las comprobaciones le hacen al mapa, con las reglas del motor.
 *
 * Se construye una vez por diagnóstico y guarda en caché el estado de cada casilla que se
 * pregunta, porque un mismo destino lo miran a la vez un teleport, un waypoint y un respawn.
 */
function crearConsulta(mapa) {
    const tipos = mapa.itemTypes || new Map();
    // Sin items.xml (una prueba, un mapa abierto a medias) no se puede saber qué existe: se da
    // todo por bueno en vez de llenar la lista de «objeto desconocido».
    const conTipos = tipos.size > 0;
    const cache = new Map();

    const definicion = (id) => tipos.get(Number(id)) || null;
    const existe = (id) => Number.isFinite(id) && (conTipos ? tipos.has(id) : id > 0);

    /** `Item.hasFlag`: lo de la instancia manda sobre el tipo. */
    function bandera(entrada, nombre) {
        const propios = atributosDe(entrada);
        if (propios && propios[nombre] !== undefined) {
            return verdadero(propios[nombre]);
        }
        const def = definicion(idDe(entrada));
        return !!(def && def.attributes && verdadero(def.attributes[nombre]));
    }

    /** El suelo por defecto de una planta, como `GameMap.groundFor`, o null si es aire. */
    const suelos = new Map();
    function sueloDePlanta(z) {
        if (suelos.has(z)) {
            return suelos.get(z);
        }
        let suelo = null;
        const declarado = mapa.defaultGround ? mapa.defaultGround[z] : undefined;
        if (declarado !== undefined && existe(Number(declarado))) {
            suelo = Number(declarado);
        } else if (z >= ULTIMA_PLANTA_DE_SUPERFICIE) {
            const reserva = Number(mapa.fallbackGround);
            // El editor pone 0 cuando el archivo no trae `fallbackGround`: 0 es «ninguno».
            if (reserva > 0 && existe(reserva)) {
                suelo = reserva;
            }
        }
        suelos.set(z, suelo);
        return suelo;
    }

    /**
     * Lo que el motor vería en una casilla explícita: su suelo, si se pisa y qué la bloquea.
     *
     * `bloqueantes` son los OBJETOS (no el suelo) que bloquean, que es lo que mira la regla de
     * bloqueo sobre bloqueo.
     */
    function estadoDeCasilla(tile) {
        const clave = tile.x + ',' + tile.y + ',' + tile.z;
        const guardado = cache.get(clave);
        if (guardado) {
            return guardado;
        }

        let suelo = sueloDePlanta(tile.z);
        if (tile.ground !== null && tile.ground !== undefined && existe(idDe(tile.ground))) {
            suelo = tile.ground;
        }

        const bloqueantes = [];
        (tile.items || []).forEach((item) => {
            if (!existe(idDe(item))) {
                return;
            }
            if (bandera(item, 'isGround')) {
                suelo = item;
            } else if (bandera(item, 'blocksSolid')) {
                bloqueantes.push(item);
            }
        });

        const conSuelo = suelo !== null && suelo !== undefined;
        const estado = {
            vacio: !conSuelo,
            transitable: conSuelo && !bandera(suelo, 'blocksSolid') && bloqueantes.length === 0,
            bloqueantes: bloqueantes
        };
        cache.set(clave, estado);
        return estado;
    }

    /**
     * `GameMap.isWalkable` con el motivo: `'fuera'`, `'vacio'`, `'bloqueado'` o null si se pisa.
     */
    function porQueNoSePisa(x, y, z) {
        if (!mapa.inBounds(x, y, z)) {
            return 'fuera';
        }
        const tile = mapa.tileAt(x, y, z);
        if (tile) {
            const estado = estadoDeCasilla(tile);
            return estado.transitable ? null : (estado.vacio ? 'vacio' : 'bloqueado');
        }
        const suelo = sueloDePlanta(z);
        if (suelo === null) {
            return 'vacio';
        }
        return bandera(suelo, 'blocksSolid') ? 'bloqueado' : null;
    }

    function nombreDeObjeto(entrada) {
        const id = idDe(entrada);
        const def = definicion(id);
        return def && def.name ? def.name + ' (' + id + ')' : String(id);
    }

    return { definicion, existe, bandera, sueloDePlanta, estadoDeCasilla, porQueNoSePisa,
        nombreDeObjeto, conTipos };
}

/**
 * ¿Es un teleport? Lo es si lleva destino (lo haya puesto quien sea) o si su tipo lo es: el id
 * del script de teleports, un `type="teleport"` de items.xml o, en su defecto, el nombre.
 */
function esTeleport(entrada, def, idsDeTeleport) {
    const propios = atributosDe(entrada);
    if (propios && propios.teleportDestination !== undefined) {
        return true;
    }
    if (idsDeTeleport.has(idDe(entrada))) {
        return true;
    }
    if (!def) {
        return false;
    }
    const atributos = def.attributes || {};
    return atributos.type === 'teleport' || verdadero(atributos.teleport) ||
        /\bteleport\b/i.test(String(def.name || ''));
}

/** El atributo de la instancia o, si no lo lleva, el de su tipo (`Item.getAttribute`). */
function atributo(entrada, def, nombre) {
    const propios = atributosDe(entrada);
    if (propios && propios[nombre] !== undefined) {
        return propios[nombre];
    }
    return def && def.attributes ? def.attributes[nombre] : undefined;
}

/** Los nombres de monstruo que existen, se pasen como se pasen. `null` si no se sabe. */
function nombresDeMonstruos(lista) {
    if (!lista) {
        return null;
    }
    const nombres = new Set();
    const anadir = (m) => {
        const nombre = typeof m === 'string' ? m : (m && m.name);
        if (nombre) {
            nombres.add(String(nombre));
        }
    };
    if (lista instanceof Map) {
        lista.forEach((valor, clave) => anadir(typeof clave === 'string' ? clave : valor));
    } else if (typeof lista.forEach === 'function') {
        lista.forEach(anadir);
    }
    // Una lista vacía es «no se pudieron leer», no «no existe ningún monstruo»: es lo mismo que
    // hace el cargador del motor, que se salta la comprobación con `monsterTypes.size === 0`.
    return nombres.size > 0 ? nombres : null;
}

/**
 * Diagnostica un mapa del editor.
 *
 * @param {import('./editormap.js').EditorMap} mapa
 * @param {Object} [opciones]
 * @param {Array<string|{name: string}>|Set<string>|Map<string, Object>} [opciones.monstruos] los
 *        monstruos que existen (`state.monsters` del editor). Sin ella no se comprueban los
 *        nombres de los respawns, porque el mapa no los conoce.
 * @param {number[]} [opciones.idsDeTeleport] ids que son teleports aunque su tipo no lo diga
 * @returns {Array<{tipo: string, gravedad: ('error'|'aviso'), mensaje: string,
 *          x: (number|undefined), y: (number|undefined), z: (number|undefined)}>}
 */
export function diagnosticar(mapa, opciones) {
    const ajustes = opciones || {};
    const consulta = crearConsulta(mapa);
    const idsDeTeleport = new Set((ajustes.idsDeTeleport || IDS_DE_TELEPORT).map(Number));
    const problemas = [];

    const anotar = (tipo, gravedad, plantilla, valores, donde) => {
        const problema = { tipo: tipo, gravedad: gravedad, mensaje: componer(plantilla, valores) };
        if (donde) {
            problema.x = donde.x;
            problema.y = donde.y;
            if (donde.z !== undefined && donde.z !== null) {
                problema.z = donde.z;
            }
        }
        problemas.push(problema);
    };
    const error = (tipo, plantilla, valores, donde) => anotar(tipo, 'error', plantilla, valores, donde);
    const aviso = (tipo, plantilla, valores, donde) => anotar(tipo, 'aviso', plantilla, valores, donde);

    // --- Los suelos por defecto ------------------------------------------------------------
    // Un suelo de planta que no existe deja la planta entera sin suelo, y en el motor ni carga.
    if (consulta.conTipos) {
        Object.keys(mapa.defaultGround || {}).forEach((z) => {
            const id = Number(mapa.defaultGround[z]);
            if (!consulta.existe(id)) {
                error('objeto-desconocido', MENSAJES.sueloDePlanta, { z: z, id: id });
            }
        });
        const reserva = Number(mapa.fallbackGround);
        if (reserva > 0 && !consulta.existe(reserva)) {
            error('objeto-desconocido', MENSAJES.sueloDeReserva, { id: reserva });
        }
    }

    // --- Una pasada por las casillas explícitas -----------------------------------------------
    // Todo lo que es de UNA casilla se mira aquí, y lo que hay que cruzar después (uid repetidos,
    // casillas de cada casa) se va apuntando.
    const porUid = new Map();
    const casillasDeCasa = new Map();

    mapa.tiles.forEach((tile) => {
        const donde = { x: tile.x, y: tile.y, z: tile.z };
        const entradas = [];
        if (tile.ground !== null && tile.ground !== undefined) {
            entradas.push({ entrada: tile.ground, suelo: true });
        }
        (tile.items || []).forEach((item) => entradas.push({ entrada: item, suelo: false }));

        entradas.forEach(({ entrada, suelo }) => {
            const id = idDe(entrada);
            if (!consulta.existe(id)) {
                error('objeto-desconocido', suelo ? MENSAJES.sueloDesconocido : MENSAJES.objetoDesconocido,
                    { id: id }, donde);
                return;
            }
            const def = consulta.definicion(id);
            const propios = atributosDe(entrada);

            // uniqueId: se apunta, y se cruza al final.
            if (propios && propios.uniqueId !== undefined && propios.uniqueId !== '' &&
                Number(propios.uniqueId) !== 0) {
                const uid = String(Number(propios.uniqueId) || propios.uniqueId);
                const lista = porUid.get(uid) || porUid.set(uid, []).get(uid);
                lista.push({ x: tile.x, y: tile.y, z: tile.z, entrada: entrada });
            }

            if (esTeleport(entrada, def, idsDeTeleport)) {
                comprobarTeleport(entrada, donde);
            }

            const sentido = def && def.attributes ? def.attributes.floorchange : undefined;
            if (sentido !== undefined) {
                comprobarCambioDePlanta(entrada, atributo(entrada, def, 'floorchange'), donde);
            }
        });

        const estado = consulta.estadoDeCasilla(tile);

        if (estado.vacio && (tile.items || []).length > 0) {
            aviso('sin-suelo', MENSAJES.sinSuelo, null, donde);
        }

        if (estado.bloqueantes.length >= 2) {
            aviso('bloqueo-apilado', MENSAJES.bloqueoApilado, {
                n: estado.bloqueantes.length,
                nombres: estado.bloqueantes.map(consulta.nombreDeObjeto).join(', ')
            }, donde);
        }

        if (tile.houseId) {
            const lista = casillasDeCasa.get(tile.houseId) || casillasDeCasa.set(tile.houseId, []).get(tile.houseId);
            lista.push(tile);
        }
    });

    function comprobarTeleport(entrada, donde) {
        const objeto = consulta.nombreDeObjeto(entrada);
        const propios = atributosDe(entrada);
        const crudo = propios ? propios.teleportDestination : undefined;

        if (crudo === undefined || crudo === null || crudo === '') {
            error('teleport', MENSAJES.tpSinDestino, { objeto: objeto }, donde);
            return;
        }
        const destino = posicionDe(crudo);
        if (!destino) {
            error('teleport', MENSAJES.tpIlegible, { objeto: objeto, valor: JSON.stringify(crudo) }, donde);
            return;
        }
        if (destino.x === donde.x && destino.y === donde.y && destino.z === donde.z) {
            aviso('teleport', MENSAJES.tpPropio, { objeto: objeto }, donde);
            return;
        }
        const motivo = consulta.porQueNoSePisa(destino.x, destino.y, destino.z);
        const valores = { objeto: objeto, pos: textoDePosicion(destino) };
        if (motivo === 'fuera') {
            error('teleport', MENSAJES.tpFuera, valores, donde);
        } else if (motivo === 'vacio') {
            error('teleport', MENSAJES.tpVacio, valores, donde);
        } else if (motivo === 'bloqueado') {
            error('teleport', MENSAJES.tpBloqueado, valores, donde);
        }
    }

    /** La dirección de la rampa de una casilla (cualquier objeto con un floorchange de subir). */
    function rampaEn(x, y, z) {
        const tile = mapa.tileAt(x, y, z);
        const entradas = tile
            ? [tile.ground].concat(tile.items || []).filter((e) => e !== null && e !== undefined)
            : [consulta.sueloDePlanta(z)].filter((e) => e !== null);
        for (const entrada of entradas) {
            const def = consulta.definicion(idDe(entrada));
            const sentido = atributo(entrada, def, 'floorchange');
            if (DIRECCIONES_DE_PLANTA[sentido]) {
                return DIRECCIONES_DE_PLANTA[sentido];
            }
        }
        return null;
    }

    function comprobarCambioDePlanta(entrada, sentido, donde) {
        const objeto = consulta.nombreDeObjeto(entrada);
        let destino = null;

        if (sentido === 'down') {
            destino = { x: donde.x, y: donde.y, z: donde.z + 1 };
            if (destino.z < mapa.floors) {
                const rampa = rampaEn(destino.x, destino.y, destino.z);
                if (rampa) {
                    destino.x -= Math.sign(rampa[0]);
                    destino.y -= Math.sign(rampa[1]);
                }
            }
        } else if (DIRECCIONES_DE_PLANTA[sentido]) {
            const [dx, dy] = DIRECCIONES_DE_PLANTA[sentido];
            destino = { x: donde.x + dx, y: donde.y + dy, z: donde.z - 1 };
        } else {
            aviso('cambio-de-planta', MENSAJES.plantaDesconocido, { objeto: objeto, sentido: String(sentido) }, donde);
            return;
        }

        const valores = { objeto: objeto, sentido: sentido, pos: textoDePosicion(destino), z: destino.z };
        if (destino.z < 0 || destino.z >= mapa.floors) {
            aviso('cambio-de-planta', MENSAJES.plantaFuera, valores, donde);
            return;
        }
        const motivo = consulta.porQueNoSePisa(destino.x, destino.y, destino.z);
        if (motivo === 'fuera' || motivo === 'vacio') {
            aviso('cambio-de-planta', MENSAJES.plantaVacio, valores, donde);
        } else if (motivo === 'bloqueado') {
            aviso('cambio-de-planta', MENSAJES.plantaBloqueado, valores, donde);
        }
    }

    // --- uniqueId repetidos ---------------------------------------------------------------
    // Se apuntan TODAS las apariciones, no sólo la segunda: cuál de las dos sobra lo decide quien
    // hace el mapa, y para decidirlo tiene que poder ir a las dos.
    porUid.forEach((lista, uid) => {
        if (lista.length < 2) {
            return;
        }
        lista.forEach((aparicion, i) => {
            const otra = lista[i === 0 ? 1 : 0];
            error('uid-repetido', MENSAJES.uidRepetido, {
                uid: uid,
                objeto: consulta.nombreDeObjeto(aparicion.entrada),
                pos: textoDePosicion(otra)
            }, aparicion);
        });
    });

    // --- Ciudades -------------------------------------------------------------------------
    const idsDeCiudad = new Set();
    (mapa.towns || []).forEach((ciudad, indice) => {
        const id = Number(ciudad && ciudad.id);
        const nombre = String((ciudad && ciudad.name) || ('Ciudad ' + id));
        if (!Number.isInteger(id) || id <= 0 || idsDeCiudad.has(id)) {
            error('ciudad', MENSAJES.ciudadIdInvalido, { indice: indice, id: ciudad && ciudad.id });
            return;
        }
        idsDeCiudad.add(id);

        const templo = posicionDe(ciudad.temple);
        if (!templo) {
            error('ciudad', MENSAJES.ciudadSinTemplo, { nombre: nombre, valor: JSON.stringify(ciudad.temple) });
            return;
        }
        const motivo = consulta.porQueNoSePisa(templo.x, templo.y, templo.z);
        if (motivo === 'fuera') {
            error('ciudad', MENSAJES.temploFuera, { nombre: nombre, pos: textoDePosicion(templo) });
        } else if (motivo) {
            error('ciudad', MENSAJES.temploBloqueado, { nombre: nombre }, templo);
        }
    });

    // --- Casas ----------------------------------------------------------------------------
    const casas = new Map();
    (mapa.houses || []).forEach((casa, indice) => {
        const id = Number(casa && casa.id);
        if (!Number.isInteger(id) || id <= 0 || casas.has(id)) {
            error('casa', MENSAJES.casaIdInvalido, { indice: indice, id: casa && casa.id });
            return;
        }
        casas.set(id, casa);
        const nombre = String(casa.name || ('Casa ' + id));
        const suyas = casillasDeCasa.get(id) || [];
        const primera = suyas.length > 0 ? { x: suyas[0].x, y: suyas[0].y, z: suyas[0].z } : null;
        const salidaCruda = casa.exit;
        const salida = posicionDe(salidaCruda);

        if (suyas.length === 0) {
            aviso('casa', MENSAJES.casaSinCasillas, { nombre: nombre }, salida);
        }

        const ciudad = Number(casa.townId) || 0;
        if (ciudad && !idsDeCiudad.has(ciudad)) {
            error('casa', MENSAJES.casaCiudad, { nombre: nombre, ciudad: ciudad }, primera || salida);
        }

        if (salidaCruda === undefined || salidaCruda === null) {
            aviso('casa', MENSAJES.casaSinSalida, { nombre: nombre }, primera);
            return;
        }
        if (!salida) {
            error('casa', MENSAJES.casaSalidaIlegible, { nombre: nombre, valor: JSON.stringify(salidaCruda) }, primera);
            return;
        }

        const motivo = consulta.porQueNoSePisa(salida.x, salida.y, salida.z);
        if (motivo === 'fuera') {
            error('casa', MENSAJES.casaSalidaFuera, { nombre: nombre, pos: textoDePosicion(salida) }, primera);
            return;
        }

        // `ponerSalida` (edicion.js) no deja poner la salida dentro de una casa: si está ahí es
        // que la casa se pintó después encima, y quien salga de la casa seguirá dentro.
        const enSalida = mapa.tileAt(salida.x, salida.y, salida.z);
        if (enSalida && enSalida.houseId) {
            error('casa', MENSAJES.casaSalidaDentro, { nombre: nombre }, salida);
        } else if (motivo) {
            error('casa', MENSAJES.casaSalidaBloqueada, { nombre: nombre }, salida);
        }

        // La salida es la casilla de delante de la puerta: lejos de la casa es casi siempre una
        // salida que se quedó en su sitio cuando la casa se movió o se repintó.
        if (suyas.length > 0) {
            let cerca = Infinity;
            suyas.forEach((t) => {
                if (t.z === salida.z) {
                    cerca = Math.min(cerca, Math.max(Math.abs(t.x - salida.x), Math.abs(t.y - salida.y)));
                }
            });
            if (cerca === Infinity) {
                aviso('casa', MENSAJES.casaSalidaOtraPlanta, { nombre: nombre }, salida);
            } else if (cerca > DISTANCIA_MAXIMA_DE_SALIDA) {
                aviso('casa', MENSAJES.casaSalidaLejos, { nombre: nombre, n: cerca }, salida);
            }
        }
    });

    // Las casillas de casas que no están en la lista: una fila por casa, no una por casilla —una
    // casa borrada deja decenas, y cincuenta filas iguales esconden el resto de la lista—.
    casillasDeCasa.forEach((suyas, id) => {
        if (!casas.has(Number(id))) {
            error('casa', MENSAJES.casaInexistente, { n: suyas.length, id: id },
                { x: suyas[0].x, y: suyas[0].y, z: suyas[0].z });
        }
    });

    // --- Waypoints ------------------------------------------------------------------------
    // Son ERRORES y no avisos porque el cargador del motor también lo trata así y no arranca:
    // un waypoint es el destino de un teleport o de `/ir`, y uno sobre un muro deja al jugador
    // dentro de la pared.
    Object.keys(mapa.waypoints || {}).forEach((nombre) => {
        const crudo = mapa.waypoints[nombre];
        const p = posicionDe(crudo);
        if (!p) {
            error('waypoint', MENSAJES.waypointIlegible, { nombre: nombre, valor: JSON.stringify(crudo) });
            return;
        }
        const motivo = consulta.porQueNoSePisa(p.x, p.y, p.z);
        if (motivo === 'fuera') {
            error('waypoint', MENSAJES.waypointFuera, { nombre: nombre, pos: textoDePosicion(p) });
        } else if (motivo) {
            error('waypoint', MENSAJES.waypointBloqueado, { nombre: nombre }, p);
        }
    });

    // --- Respawns -------------------------------------------------------------------------
    const monstruos = nombresDeMonstruos(ajustes.monstruos);
    (mapa.spawns || []).forEach((area) => {
        const centro = { x: area.x, y: area.y, z: area.z };
        const lista = nombresUnicos(area.monsters.map((m) => m.name));

        if (!mapa.inBounds(area.x, area.y, area.z)) {
            error('respawn', MENSAJES.respawnFuera, { monstruos: lista });
            return;
        }

        if (monstruos) {
            const desconocidos = area.monsters.map((m) => m.name).filter((n) => !monstruos.has(n));
            if (desconocidos.length > 0) {
                error('respawn', MENSAJES.respawnDesconocidos, { nombres: nombresUnicos(desconocidos) }, centro);
            }
        }

        if (consulta.porQueNoSePisa(area.x, area.y, area.z)) {
            aviso('respawn', MENSAJES.respawnCentro, { monstruos: lista }, centro);

            // Con el centro tapado, ¿queda algún sitio? Se cuenta sólo entonces: es lo único que
            // cuesta casillas, y con el centro libre ya hay al menos uno.
            const r = Math.min(Number(area.radius) || 0, RADIO_MAXIMO_CONTADO);
            let libre = false;
            for (let dy = -r; dy <= r && !libre; dy += 1) {
                for (let dx = -r; dx <= r && !libre; dx += 1) {
                    libre = !consulta.porQueNoSePisa(area.x + dx, area.y + dy, area.z);
                }
            }
            if (!libre) {
                error('respawn', MENSAJES.respawnSinSitio, { monstruos: lista }, centro);
            }
        }

        area.monsters.forEach((m) => {
            if (m.x === null || m.x === undefined || m.y === null || m.y === undefined) {
                return;
            }
            const donde = { x: m.x, y: m.y, z: area.z };
            if (Math.abs(m.x - area.x) > area.radius || Math.abs(m.y - area.y) > area.radius) {
                error('respawn', MENSAJES.monstruoFuera, { monstruo: m.name }, donde);
                return;
            }
            if (consulta.porQueNoSePisa(m.x, m.y, area.z)) {
                aviso('respawn', MENSAJES.monstruoBloqueado, { monstruo: m.name }, donde);
                return;
            }
            const tile = mapa.tileAt(m.x, m.y, area.z);
            if (tile && (tile.flags || []).indexOf('protectionZone') !== -1) {
                aviso('respawn', MENSAJES.monstruoProtegido, { monstruo: m.name }, donde);
            }
        });
    });

    // --- NPC ------------------------------------------------------------------------------
    const npcTypes = mapa.npcTypes || new Map();
    const npcsPorCasilla = new Map();
    (mapa.npcs || []).forEach((npc) => {
        const donde = { x: npc.x, y: npc.y, z: npc.z };
        if (!mapa.inBounds(npc.x, npc.y, npc.z)) {
            error('npc', MENSAJES.npcFuera, { nombre: npc.name, pos: textoDePosicion(donde) });
            return;
        }
        if (npcTypes.size > 0 && !npcTypes.has(npc.name)) {
            error('npc', MENSAJES.npcDesconocido, { nombre: npc.name }, donde);
        }
        // Aviso y no error, igual que el cargador: hay NPC detrás de un mostrador a propósito.
        if (consulta.porQueNoSePisa(npc.x, npc.y, npc.z)) {
            aviso('npc', MENSAJES.npcBloqueado, { nombre: npc.name }, donde);
        }
        const clave = npc.x + ',' + npc.y + ',' + npc.z;
        const juntos = npcsPorCasilla.get(clave) || npcsPorCasilla.set(clave, []).get(clave);
        juntos.push(npc);
    });
    npcsPorCasilla.forEach((juntos) => {
        if (juntos.length > 1) {
            aviso('npc', MENSAJES.npcRepetido, { n: juntos.length, nombres: nombresUnicos(juntos.map((n) => n.name)) },
                { x: juntos[0].x, y: juntos[0].y, z: juntos[0].z });
        }
    });

    return ordenar(problemas);
}

/** Errores primero, luego por tipo (en el orden de `TIPOS`) y luego por planta y casilla. */
function ordenar(problemas) {
    const orden = Object.keys(TIPOS);
    const posicion = (p) => (p.x === undefined ? -1 : 0);
    return problemas.sort((a, b) =>
        (a.gravedad === b.gravedad ? 0 : (a.gravedad === 'error' ? -1 : 1)) ||
        orden.indexOf(a.tipo) - orden.indexOf(b.tipo) ||
        posicion(a) - posicion(b) ||
        (a.z || 0) - (b.z || 0) || (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));
}

/**
 * Los recuentos de una lista de problemas: total, errores, avisos y cuántos de cada tipo.
 *
 * @returns {{total: number, errores: number, avisos: number, porTipo: Object<string, number>}}
 */
export function resumen(problemas) {
    const cuenta = { total: problemas.length, errores: 0, avisos: 0, porTipo: {} };
    problemas.forEach((p) => {
        if (p.gravedad === 'error') {
            cuenta.errores += 1;
        } else {
            cuenta.avisos += 1;
        }
        cuenta.porTipo[p.tipo] = (cuenta.porTipo[p.tipo] || 0) + 1;
    });
    return cuenta;
}

// ---------------------------------------------------------------------------------------------
// El panel
// ---------------------------------------------------------------------------------------------

/**
 * LOS TEXTOS DEL PANEL, aparte de los mensajes, para que la prueba compruebe que el diccionario
 * los tiene todos. Los que llevan número son plantillas con huecos (un `<option>` no puede llevar
 * el número en otro elemento).
 */
export const TEXTOS_DEL_PANEL = {
    titulo: 'Diagnóstico del mapa',
    resumen: '{n} problemas: {e} errores y {a} avisos',
    ninguno: 'No se ha encontrado ningún problema.',
    ningunoConFiltro: 'Ningún problema con este filtro.',
    todas: 'Todos ({n})',
    errores: 'Errores ({n})',
    avisos: 'Avisos ({n})',
    todosLosTipos: 'Todos los tipos ({n})',
    tipoConCuenta: '{tipo} ({n})',
    error: 'error',
    aviso: 'aviso',
    sinCasilla: 'mapa',
    reanalizar: 'Volver a analizar',
    recortado: 'Se enseñan {n} de {total}: filtra para ver el resto.',
    irA: 'Ir a la casilla',
    sinPosicion: 'Es un problema del mapa entero, no de una casilla.'
};

/**
 * Cuántas filas se pintan como mucho. Un mapa importado de un servidor viejo puede dar miles de
 * avisos, y pintar diez mil botones congela la página para nada: nadie los lee sin filtrar.
 */
const MAXIMO_DE_FILAS = 500;

const ESTILOS = `
.diag { display: flex; flex-direction: column; gap: 6px; min-height: 0; font-size: 12px; }
.diag-cabecera { display: flex; align-items: center; gap: 8px; }
.diag-titulo { font-weight: bold; color: #e8e8f0; }
.diag-resumen { color: #9090a0; flex: 1; }
.diag-filtros { display: flex; gap: 4px; flex-wrap: wrap; }
.diag-filtros select { flex: 1 1 100%; }
.diag-lista { display: flex; flex-direction: column; gap: 1px; overflow-y: auto; min-height: 0; flex: 1; }
.diag-fila { display: flex; gap: 6px; align-items: baseline; width: 100%; text-align: left; padding: 2px 6px;
    background: #14141c; border: 1px solid #1e1e2a; border-radius: 3px; color: #c8c8d8; font: inherit; cursor: pointer; }
.diag-fila:hover { background: #1e2a3c; }
.diag-fila.elegida { background: #2a3a56; border-color: #3a5a86; }
.diag-fila:disabled { cursor: default; opacity: 0.85; }
.diag-gravedad { flex: none; width: 4.5em; font-weight: bold; }
.diag-fila.error .diag-gravedad { color: #e08080; }
.diag-fila.aviso .diag-gravedad { color: #e0c070; }
.diag-pos { flex: none; color: #7a8aa0; }
.diag-mensaje { flex: 1; overflow-wrap: anywhere; }
.diag-vacio, .diag-recortado { color: #7a8a7a; padding: 4px; }
`;

function crear(doc, etiqueta, clase, texto) {
    const e = doc.createElement(etiqueta);
    if (clase) {
        e.className = clase;
    }
    if (texto !== undefined) {
        e.textContent = texto;
    }
    return e;
}

function vaciar(nodo) {
    while (nodo.firstChild) {
        nodo.removeChild(nodo.firstChild);
    }
}

/**
 * Pinta la lista de problemas en `contenedor`, con filtros por gravedad y por tipo.
 *
 * Los textos se escriben EN ESPAÑOL, como en todo el editor: `i18n-dom.mjs` vigila la página y
 * los traduce al vuelo con el diccionario de `shared/i18n/en/editor-diagnostico.mjs`. Traducirlos
 * aquí los dejaría en inglés al volver al español.
 *
 * @param {HTMLElement} contenedor se vacía y se llena
 * @param {Array<Object>} problemas lo que devuelve `diagnosticar`
 * @param {function(number, number, (number|undefined))} irA se llama al pinchar una fila que
 *        tiene casilla
 * @param {Object} [opciones]
 * @param {function(): Array<Object>} [opciones.reanalizar] si se da, sale un botón «Volver a
 *        analizar» que la llama y repinta con lo que devuelva
 * @returns {{actualizar: function(Array<Object>), problemas: function(): Array<Object>}}
 */
export function construirPanel(contenedor, problemas, irA, opciones) {
    const ajustes = opciones || {};
    const doc = contenedor.ownerDocument || globalThis.document;

    if (doc.head && doc.getElementById && !doc.getElementById('diagnostico-estilos')) {
        const estilo = crear(doc, 'style');
        estilo.id = 'diagnostico-estilos';
        estilo.textContent = ESTILOS;
        doc.head.appendChild(estilo);
    }

    let lista = problemas || [];
    let gravedad = 'todas';
    let tipo = '';
    let elegida = null;

    vaciar(contenedor);
    const raiz = crear(doc, 'div', 'diag');
    const cabecera = crear(doc, 'div', 'diag-cabecera');
    cabecera.appendChild(crear(doc, 'span', 'diag-titulo', TEXTOS_DEL_PANEL.titulo));
    const textoResumen = crear(doc, 'span', 'diag-resumen');
    cabecera.appendChild(textoResumen);
    if (typeof ajustes.reanalizar === 'function') {
        const boton = crear(doc, 'button', 'plain', TEXTOS_DEL_PANEL.reanalizar);
        boton.addEventListener('click', () => actualizar(ajustes.reanalizar() || []));
        cabecera.appendChild(boton);
    }

    const filtros = crear(doc, 'div', 'diag-filtros');
    const botones = {};
    ['todas', 'error', 'aviso'].forEach((g) => {
        const boton = crear(doc, 'button', 'plain');
        boton.addEventListener('click', () => {
            gravedad = g;
            pintar();
        });
        botones[g] = boton;
        filtros.appendChild(boton);
    });
    const selectorDeTipo = crear(doc, 'select');
    selectorDeTipo.addEventListener('change', () => {
        tipo = selectorDeTipo.value;
        pintar();
    });
    filtros.appendChild(selectorDeTipo);

    const cuerpo = crear(doc, 'div', 'diag-lista');
    raiz.appendChild(cabecera);
    raiz.appendChild(filtros);
    raiz.appendChild(cuerpo);
    contenedor.appendChild(raiz);

    function pintar() {
        const total = resumen(lista);
        textoResumen.textContent = componer(TEXTOS_DEL_PANEL.resumen,
            { n: total.total, e: total.errores, a: total.avisos });

        // Cada filtro cuenta con el OTRO puesto: los botones de gravedad dicen cuántos hay del
        // tipo elegido, y el desplegable de tipos cuántos hay de la gravedad elegida.
        const delTipo = lista.filter((p) => !tipo || p.tipo === tipo);
        const deGravedad = lista.filter((p) => gravedad === 'todas' || p.gravedad === gravedad);
        const cuentaDelTipo = resumen(delTipo);
        const cuentaDeGravedad = resumen(deGravedad);

        botones.todas.textContent = componer(TEXTOS_DEL_PANEL.todas, { n: cuentaDelTipo.total });
        botones.error.textContent = componer(TEXTOS_DEL_PANEL.errores, { n: cuentaDelTipo.errores });
        botones.aviso.textContent = componer(TEXTOS_DEL_PANEL.avisos, { n: cuentaDelTipo.avisos });
        Object.keys(botones).forEach((g) => {
            botones[g].className = 'plain' + (g === gravedad ? ' active' : '');
        });

        vaciar(selectorDeTipo);
        const opcion = (valor, texto) => {
            const o = crear(doc, 'option', null, texto);
            o.value = valor;
            o.selected = valor === tipo;
            selectorDeTipo.appendChild(o);
        };
        opcion('', componer(TEXTOS_DEL_PANEL.todosLosTipos, { n: cuentaDeGravedad.total }));
        Object.keys(TIPOS).forEach((t) => {
            const n = cuentaDeGravedad.porTipo[t] || 0;
            // Un tipo sin problemas no se ofrece, salvo que sea el elegido: desaparecer de debajo
            // del ratón al cambiar de gravedad sería peor que enseñar un cero.
            if (n > 0 || t === tipo) {
                opcion(t, componer(TEXTOS_DEL_PANEL.tipoConCuenta, { tipo: TIPOS[t], n: n }));
            }
        });
        selectorDeTipo.value = tipo;

        const visibles = deGravedad.filter((p) => !tipo || p.tipo === tipo);
        vaciar(cuerpo);
        if (visibles.length === 0) {
            cuerpo.appendChild(crear(doc, 'div', 'diag-vacio',
                lista.length === 0 ? TEXTOS_DEL_PANEL.ninguno : TEXTOS_DEL_PANEL.ningunoConFiltro));
            return;
        }

        visibles.slice(0, MAXIMO_DE_FILAS).forEach((p) => cuerpo.appendChild(fila(p)));
        if (visibles.length > MAXIMO_DE_FILAS) {
            cuerpo.appendChild(crear(doc, 'div', 'diag-recortado',
                componer(TEXTOS_DEL_PANEL.recortado, { n: MAXIMO_DE_FILAS, total: visibles.length })));
        }
    }

    function fila(p) {
        const conCasilla = p.x !== undefined && p.y !== undefined;
        const boton = crear(doc, 'button', 'diag-fila ' + p.gravedad + (p === elegida ? ' elegida' : ''));
        boton.title = conCasilla ? TEXTOS_DEL_PANEL.irA : TEXTOS_DEL_PANEL.sinPosicion;
        boton.appendChild(crear(doc, 'span', 'diag-gravedad', TEXTOS_DEL_PANEL[p.gravedad] || p.gravedad));
        boton.appendChild(crear(doc, 'span', 'diag-pos',
            conCasilla ? (p.z === undefined ? '(' + p.x + ',' + p.y + ')' : textoDePosicion(p))
                : TEXTOS_DEL_PANEL.sinCasilla));
        boton.appendChild(crear(doc, 'span', 'diag-mensaje', p.mensaje));
        if (!conCasilla) {
            boton.disabled = true;
            return boton;
        }
        boton.addEventListener('click', () => {
            elegida = p;
            Array.from(cuerpo.children || []).forEach((otra) => {
                otra.className = String(otra.className).replace(/ elegida\b/g, '');
            });
            boton.className += ' elegida';
            irA(p.x, p.y, p.z);
        });
        return boton;
    }

    function actualizar(nuevos) {
        lista = nuevos || [];
        elegida = null;
        // Un tipo que ya no tiene problemas se suelta, para no dejar la lista vacía sin motivo.
        if (tipo && !lista.some((p) => p.tipo === tipo)) {
            tipo = '';
        }
        pintar();
    }

    pintar();
    return { actualizar: actualizar, problemas: () => lista };
}
