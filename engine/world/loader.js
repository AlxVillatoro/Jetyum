'use strict';

/**
 * Carga y VALIDACIÓN del formato de mapa interno.
 *
 * El formato es JSON, y es deliberadamente sencillo y legible:
 *
 *   - Se puede revisar en un diff. Un formato binario obliga a tener la
 *     herramienta delante para saber qué cambió.
 *   - Sólo se declaran las EXCEPCIONES al suelo por defecto de cada planta. Un
 *     mapa de 2048×2048 no enumera ocho millones de celdas de hierba.
 *   - El importador/exportador de OTBM se conectará aquí: OTBM como frontera,
 *     este formato en tiempo de ejecución. Es la estrategia de ARQUITECTURA.md.
 *
 * UN RESPAWN ES UN AREA: un centro, un radio y la lista de monstruos que viven
 * dentro. Es la forma de Tibia (`<spawn centerx= centery= radius=>` con sus
 * `<monster name= x= y=>` dentro) y es la que escribe el escritor. El cargador
 * además acepta la forma ANTIGUA del archivo —un monstruo por entrada, con la
 * (x,y) de la entrada como centro del área—, porque `data/world/ciudad.map.json`
 * y `sample.map.json` están escritos así y tienen que seguir cargando. El detalle
 * de las dos formas, y de por qué la antigua no cambia de comportamiento, está
 * comentado en la sección de spawns.
 *
 * Sobre la validación: deliberadamente NO se valida con XSD. El esquema real de
 * estos archivos no es expresable de forma útil, y un XSD diría "documento
 * válido" sin decir "el juego funcionará". Los fallos que de verdad ocurren son
 * semánticos —un item que no existe, un spawn de un monstruo que no está
 * definido, una coordenada fuera del mapa— y se detectan aquí.
 *
 * La validación **acumula todos los errores** en vez de abortar en el primero.
 * Corregir un mapa de mil tiles de uno en uno, recompilando entre cada uno, es
 * exactamente el tipo de fricción que hace que nadie valide nada.
 */

const fs = require('fs');
const { GameMap } = require('./map');
const { Item } = require('./item');
const { Position } = require('./position');
const { TILE_FLAGS } = require('./tile');

const FORMAT = 'jetyum-map';
const SUPPORTED_VERSIONS = [1];

/** Mapa de nombre de bandera a bit, derivado de la tabla del motor. */
const FLAG_NAMES = {
    protectionZone: TILE_FLAGS.PROTECTION_ZONE,
    noPvp: TILE_FLAGS.NO_PVP,
    noLogout: TILE_FLAGS.NO_LOGOUT,
    pvpZone: TILE_FLAGS.PVP_ZONE,
    house: TILE_FLAGS.HOUSE
};

class ValidationReport {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    error(message, where) {
        this.errors.push({ message: message, where: where || null });
    }

    warning(message, where) {
        this.warnings.push({ message: message, where: where || null });
    }

    get ok() {
        return this.errors.length === 0;
    }

    format() {
        const lines = [];
        this.errors.forEach((e) => {
            lines.push('  ERROR   ' + (e.where ? e.where + ': ' : '') + e.message);
        });
        this.warnings.forEach((w) => {
            lines.push('  AVISO   ' + (w.where ? w.where + ': ' : '') + w.message);
        });
        return lines.join('\n');
    }
}

function where(x, y, z) {
    return '(' + x + ',' + y + ',' + z + ')';
}

/**
 * Convierte la entrada `items` de un tile en instancias de Item.
 *
 * Acepta un número suelto (el caso común) o un objeto con cantidad y atributos.
 */
function buildItem(entry, itemTypes, report, location) {
    const descriptor = (typeof entry === 'object' && entry !== null) ? entry : { id: entry };
    const typeId = Number(descriptor.id);

    if (Number.isNaN(typeId)) {
        report.error('item con id no numerico: ' + JSON.stringify(entry), location);
        return null;
    }

    const definition = itemTypes.get(typeId);
    if (!definition) {
        // Éste es el error semántico más común al escribir un mapa a mano.
        report.error('no existe ningun item con id ' + typeId +
            '. Revisa data/items/items.xml', location);
        return null;
    }

    return new Item(definition, {
        count: descriptor.count === undefined ? 1 : Number(descriptor.count),
        attributes: descriptor.attributes || {}
    });
}

/**
 * Carga un mapa desde un archivo JSON.
 *
 * @param {string} filepath
 * @param {Object} options
 * @param {Map<number, Object>} options.itemTypes definiciones de items.xml
 * @param {Map<string, Object>} [options.monsterTypes] para validar los spawns
 * @param {Map<string, Object>} [options.npcTypes] para validar los NPC colocados
 * @param {Object} [options.logger]
 * @returns {{map: GameMap|null, report: ValidationReport}}
 */
function loadMap(filepath, options) {
    const report = new ValidationReport();

    if (!fs.existsSync(filepath)) {
        report.error('no se encontro el archivo de mapa');
        return { map: null, report: report };
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (error) {
        report.error('el mapa no es JSON valido: ' + error.message);
        return { map: null, report: report };
    }

    return buildMap(data, options);
}

/**
 * Construye y valida un mapa ya deserializado.
 *
 * Está separado de `loadMap` para poder validar un objeto en memoria sin pasar
 * por disco: es lo que permite comprobar que la validación informa de TODOS los
 * errores a la vez, que es justo lo que no se puede ver leyendo un archivo.
 */
function buildMap(data, options) {
    const opts = options || {};
    const itemTypes = opts.itemTypes || new Map();
    const monsterTypes = opts.monsterTypes || new Map();
    const npcTypes = opts.npcTypes || new Map();
    const report = new ValidationReport();

    // --- Cabecera ---------------------------------------------------------
    if (data.format !== FORMAT) {
        report.error('formato inesperado: ' + JSON.stringify(data.format) +
            '. Se esperaba "' + FORMAT + '"');
    }
    if (SUPPORTED_VERSIONS.indexOf(data.version) === -1) {
        report.error('version de formato no soportada: ' + JSON.stringify(data.version) +
            '. Soportadas: ' + SUPPORTED_VERSIONS.join(', '));
    }
    if (!report.ok) {
        return { map: null, report: report };
    }

    const map = new GameMap({
        name: data.name,
        width: Number(data.width),
        height: Number(data.height),
        floors: Number(data.floors),
        logger: opts.logger
    });

    if (!(map.width > 0) || !(map.height > 0) || !(map.floors > 0)) {
        report.error('el mapa necesita width, height y floors mayores que cero');
        return { map: null, report: report };
    }

    // --- Suelo por defecto por planta -------------------------------------
    const groundByZ = data.defaultGround || {};
    Object.keys(groundByZ).forEach((zKey) => {
        const z = Number(zKey);
        const definition = itemTypes.get(Number(groundByZ[zKey]));

        if (!definition) {
            report.error('el suelo por defecto de la planta ' + z +
                ' apunta al item ' + groundByZ[zKey] + ', que no existe');
            return;
        }
        map.setDefaultGround(z, new Item(definition, { count: 1 }));
    });

    if (data.fallbackGround !== undefined) {
        const definition = itemTypes.get(Number(data.fallbackGround));
        if (!definition) {
            report.error('fallbackGround apunta al item ' + data.fallbackGround + ', que no existe');
        } else {
            map.setFallbackGround(new Item(definition, { count: 1 }));
        }
    } else if (map.defaultGround.size === 0) {
        report.warning('el mapa no declara ningun suelo por defecto: ' +
            'las celdas sin tile explicito no seran transitables');
    }

    // --- Tiles -------------------------------------------------------------
    const tiles = data.tiles || [];

    tiles.forEach((entry, index) => {
        const x = Number(entry.x);
        const y = Number(entry.y);
        const z = Number(entry.z);
        const location = where(x, y, z);

        if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
            report.error('tile #' + index + ' sin coordenadas validas');
            return;
        }
        if (!map.inBounds(x, y, z)) {
            report.error('tile fuera del mapa (el mapa es ' +
                map.width + 'x' + map.height + 'x' + map.floors + ')', location);
            return;
        }

        const tile = map.getOrCreateTile(x, y, z);

        if (entry.ground !== undefined) {
            const ground = buildItem(entry.ground, itemTypes, report, location);
            if (ground) {
                tile.setGround(ground);
            }
        }

        (entry.items || []).forEach((itemEntry) => {
            const item = buildItem(itemEntry, itemTypes, report, location);
            if (item) {
                tile.addItem(item);
            }
        });

        (entry.flags || []).forEach((flagName) => {
            const bit = FLAG_NAMES[flagName];
            if (bit === undefined) {
                report.error('bandera de tile desconocida: "' + flagName +
                    '". Validas: ' + Object.keys(FLAG_NAMES).join(', '), location);
                return;
            }
            tile.setFlag(bit, true);
        });

        if (entry.houseId !== undefined) {
            tile.houseId = Number(entry.houseId);
        }
    });

    // --- Waypoints --------------------------------------------------------
    // Se validan DESPUES de los tiles, y ese orden importa: comprobar si un
    // waypoint es transitable requiere que el mapa ya este construido. Validarlos
    // antes daria por bueno cualquier sitio, porque no habria nada que los
    // bloqueara todavia.
    const waypoints = data.waypoints || {};
    Object.keys(waypoints).forEach((name) => {
        const position = Position.from(waypoints[name]);
        if (!map.inBounds(position.x, position.y, position.z)) {
            report.error('el waypoint "' + name + '" cae fuera del mapa', position.toString());
            return;
        }

        // Un waypoint sobre un muro es casi siempre un error, y de los caros: los
        // waypoints se usan para templos y destinos de teletransporte, asi que un
        // jugador apareceria DENTRO de una pared sin poder salir. Aparecio de
        // verdad: el waypoint `temple` del mapa de ejemplo estaba justo encima de
        // un muro colocado para probar las esquinas, y el validador no lo veia.
        if (!map.isWalkable(position.x, position.y, position.z)) {
            report.error('el waypoint "' + name + '" cae en un tile no transitable',
                position.toString());
        }

        map.setWaypoint(name, position);
    });

    // --- Ciudades y casas ------------------------------------------------
    // Las ciudades (`towns` del OTBM) tienen un templo, que es donde se reaparece. Las casas
    // (`houses.xml` en TFS) tienen ciudad, alquiler y salida, y sus casillas llevan `houseId`.
    const idsDeCiudad = new Set();
    (data.towns || []).forEach((entry, index) => {
        const id = Number(entry && entry.id);
        const temple = Position.from(entry && entry.temple ? entry.temple : [0, 0, 0]);
        if (!Number.isInteger(id) || id <= 0 || idsDeCiudad.has(id)) {
            report.error('ciudad #' + index + ': id invalido o repetido (' + (entry && entry.id) + ')');
            return;
        }
        if (!map.inBounds(temple.x, temple.y, temple.z)) {
            report.error('el templo de la ciudad ' + id + ' cae fuera del mapa', temple.toString());
            return;
        }
        idsDeCiudad.add(id);
        map.towns.push({ id: id, name: String(entry.name || 'Ciudad ' + id),
            temple: { x: temple.x, y: temple.y, z: temple.z } });
    });

    const idsDeCasa = new Set();
    (data.houses || []).forEach((entry, index) => {
        const id = Number(entry && entry.id);
        if (!Number.isInteger(id) || id <= 0 || idsDeCasa.has(id)) {
            report.error('casa #' + index + ': id invalido o repetido (' + (entry && entry.id) + ')');
            return;
        }
        const townId = Number(entry.townId) || 0;
        if (townId && !idsDeCiudad.has(townId)) {
            report.error('la casa ' + id + ' es de la ciudad ' + townId + ', que no existe');
        }
        let exit = null;
        if (entry.exit) {
            const p = Position.from(entry.exit);
            if (!map.inBounds(p.x, p.y, p.z)) {
                report.error('la salida de la casa ' + id + ' cae fuera del mapa', p.toString());
            } else {
                exit = { x: p.x, y: p.y, z: p.z };
            }
        }
        idsDeCasa.add(id);
        map.houses.push({ id: id, name: String(entry.name || 'Casa ' + id), townId: townId,
            rent: Math.max(0, Number(entry.rent) || 0), exit: exit });
    });

    if (idsDeCasa.size > 0) {
        map.forEachTile((tile) => {
            if (tile.houseId && !idsDeCasa.has(tile.houseId)) {
                report.warning('casilla de la casa ' + tile.houseId + ', que no esta en la lista de casas',
                    where(tile.x, tile.y, tile.z));
            }
        });
    }

    // --- Spawns -----------------------------------------------------------
    //
    // UN RESPAWN ES UN AREA, y hay DOS FORMAS de escribirla. Las dos se leen, las dos dan
    // el mismo modelo —un área con sus monstruos dentro— y las dos están probadas:
    //
    //   - LA FIEL A TIBIA, que es la que escribe el escritor: el centro, el radio y la
    //     lista de monstruos dentro, cada uno con su casilla.
    //
    //         { "x": 20, "y": 20, "z": 7, "radius": 3, "interval": 60000,
    //           "monsters": [ { "name": "Rat", "x": 20, "y": 20 },
    //                         { "name": "Rat", "x": 22, "y": 21, "interval": 30000 } ] }
    //
    //   - LA ANTIGUA, que es la que hay en `ciudad.map.json` (10 respawns) y en
    //     `sample.map.json` (1), y que seguirá cargando mientras existan esos archivos: un
    //     monstruo por entrada, y su `x`/`y` es el CENTRO del área, no la casilla del
    //     monstruo.
    //
    //         { "x": 20, "y": 20, "z": 7, "monster": "Rat", "interval": 60000, "radius": 3 }
    //
    // LA DIFERENCIA QUE IMPORTA, y está en el modelo: un monstruo de la forma antigua NO
    // TIENE CASILLA PROPIA (`x` y `y` valen `null`), así que el área entera es su sitio y el
    // motor lo sortea dentro —que es EXACTAMENTE lo que hacía antes de que existiera la otra
    // forma—. Un monstruo de la forma nueva sí la tiene y aparece en ella, que es lo que hace
    // TFS. Con eso, un mapa viejo no cambia de comportamiento al cargarse; sólo lo cambia si
    // alguien le pone casilla a sus monstruos desde el editor, y eso es una decisión suya.
    //
    // Un monstruo sin `x`/`y` también es legal en la forma nueva, y no es un descuido: es
    // como se escribe «este monstruo vive en cualquier punto de su respawn», que es lo que
    // necesita la forma antigua para sobrevivir a un guardado sin cambiar de significado.
    (data.spawns || []).forEach((entry, index) => {
        const x = Number(entry.x);
        const y = Number(entry.y);
        const z = Number(entry.z);
        const location = where(x, y, z);

        if (!map.inBounds(x, y, z)) {
            report.error('spawn #' + index + ' fuera del mapa', location);
            return;
        }

        /*
         * EL RADIO ES EL AREA DEL RESPAWN, en casillas, y es cuadrado: el motor sortea el
         * desplazamiento de la X y el de la Y por separado (mira `_randomOffset` en
         * `spawner.js`), así que el área es el cuadrado de lado `2 * radio + 1` centrado en
         * (x,y). Se comprueba aquí porque un radio negativo o ilegible dibujaría y validaría
         * un área que no existe.
         */
        const radius = entry.radius === undefined ? 1 : Number(entry.radius);
        if (!Number.isFinite(radius) || radius < 0) {
            report.error('el respawn #' + index + ' tiene un radio que no es un numero de ' +
                'casillas igual o mayor que cero: ' + JSON.stringify(entry.radius), location);
            return;
        }

        const interval = entry.interval === undefined ? 60000 : Number(entry.interval);
        if (!Number.isFinite(interval) || interval <= 0) {
            report.error('el respawn #' + index + ' tiene un intervalo que no es un numero de ' +
                'milisegundos mayor que cero: ' + JSON.stringify(entry.interval), location);
            return;
        }

        // --- Forma antigua: un monstruo por entrada, sin casilla propia ---
        if (!Array.isArray(entry.monsters)) {
            if (!entry.monster) {
                report.error('spawn #' + index + ' sin monstruo', location);
                return;
            }
            if (monsterTypes.size > 0 && !monsterTypes.has(entry.monster)) {
                // Error semántico típico: el monstruo se llama distinto o no existe.
                report.error('el spawn apunta al monstruo "' + entry.monster +
                    '", que no esta definido en data/monsters/', location);
                return;
            }

            map.addSpawn({
                x: x,
                y: y,
                z: z,
                radius: radius,
                interval: interval,
                monsters: [{ name: entry.monster, x: null, y: null, interval: interval }]
            });
            return;
        }

        // --- Forma nueva: el área con sus monstruos dentro ---
        if (entry.monsters.length === 0) {
            report.error('el respawn #' + index + ' no tiene ningun monstruo: un respawn sin ' +
                'monstruos no hace nada, asi que o se le pone uno o se quita', location);
            return;
        }

        const monsters = [];

        entry.monsters.forEach((monster, position) => {
            const name = monster && monster.name ? String(monster.name) : '';

            if (!name) {
                report.error('el monstruo #' + position + ' del respawn #' + index +
                    ' no tiene nombre', location);
                return;
            }
            if (monsterTypes.size > 0 && !monsterTypes.has(name)) {
                report.error('el monstruo "' + name + '" del respawn #' + index +
                    ' no esta definido en data/monsters/', location);
                return;
            }

            // Sin casilla, el monstruo vive en todo el área. Con casilla, tiene que caer
            // DENTRO: es la regla que pidió el usuario —un monstruo no existe fuera de su
            // respawn— y aquí es donde se cumple, en el validador, y no sólo en el editor.
            const monsterX = monster.x === undefined || monster.x === null ? null : Number(monster.x);
            const monsterY = monster.y === undefined || monster.y === null ? null : Number(monster.y);

            if (monsterX !== null &&
                (!Number.isFinite(monsterX) || !Number.isFinite(monsterY))) {
                report.error('el monstruo "' + name + '" del respawn #' + index +
                    ' tiene una casilla ilegible: ' + JSON.stringify([monster.x, monster.y]), location);
                return;
            }
            if (monsterX !== null &&
                (Math.abs(monsterX - x) > radius || Math.abs(monsterY - y) > radius)) {
                report.error('el monstruo "' + name + '" del respawn #' + index + ' cae fuera de ' +
                    'su respawn: el area llega de (' + (x - radius) + ',' + (y - radius) +
                    ') a (' + (x + radius) + ',' + (y + radius) + ')', location);
                return;
            }

            const monsterInterval = monster.interval === undefined
                ? interval : Number(monster.interval);

            if (!Number.isFinite(monsterInterval) || monsterInterval <= 0) {
                report.error('el monstruo "' + name + '" del respawn #' + index + ' tiene un ' +
                    'intervalo que no es un numero de milisegundos mayor que cero: ' +
                    JSON.stringify(monster.interval), location);
                return;
            }

            monsters.push({
                name: name,
                x: monsterX,
                y: monsterY,
                interval: monsterInterval
            });
        });

        // Si algún monstruo se rechazó ya se ha dicho por qué: no se añade un respawn a
        // medias, que es la clase de mapa que luego nadie entiende.
        if (monsters.length !== entry.monsters.length) {
            return;
        }

        map.addSpawn({
            x: x,
            y: y,
            z: z,
            radius: radius,
            interval: interval,
            monsters: monsters
        });
    });

    // --- NPC ---------------------------------------------------------------
    //
    // Los NPC van en el MAPA y no en su propia lista porque su sitio es una posición del
    // mundo, igual que la de un spawn. Ponerlos en un archivo aparte obligaría a
    // mantener dos archivos de acuerdo sobre qué mapa es cuál, y a la hora de mover un
    // NPC por una casilla habría que acordarse de cuál de los dos toca.
    // Los OBJETOS COMPUESTOS colocados por el editor. Se validan por forma y se conservan; el
    // motor no los usa porque sus piezas ya están en las casillas (ver `map.composites`). Uno
    // mal formado se descarta con un aviso, no con un error: perderlo solo cuesta que el editor
    // ya no lo reconozca como objeto entero, y sus piezas siguen en el mapa.
    const uidsDeCompuestos = new Set();
    (data.composites || []).forEach((entry, index) => {
        const x = Number(entry && entry.x);
        const y = Number(entry && entry.y);
        const z = Number(entry && entry.z);
        const uid = Number(entry && entry.uid);
        const location = where(x, y, z);
        if (!entry || typeof entry.compuesto !== 'string' || !entry.compuesto) {
            report.warning('compuesto #' + index + ' sin plantilla: se descarta', location);
            return;
        }
        if (!Number.isInteger(uid) || uid <= 0 || uidsDeCompuestos.has(uid)) {
            report.warning('compuesto #' + index + ' con uid invalido o repetido: se descarta', location);
            return;
        }
        if (!map.inBounds(x, y, z)) {
            report.warning('compuesto #' + index + ' fuera del mapa: se descarta', location);
            return;
        }
        uidsDeCompuestos.add(uid);
        map.composites.push({
            uid: uid,
            compuesto: entry.compuesto,
            x: x, y: y, z: z,
            valores: entry.valores && typeof entry.valores === 'object'
                ? JSON.parse(JSON.stringify(entry.valores)) : {}
        });
    });

    (data.npcs || []).forEach((entry, index) => {
        const location = where(entry.x, entry.y, entry.z);

        if (!map.inBounds(Number(entry.x), Number(entry.y), Number(entry.z))) {
            report.error('npc #' + index + ' fuera del mapa', location);
            return;
        }
        if (!entry.name) {
            report.error('npc #' + index + ' sin nombre', location);
            return;
        }
        if (npcTypes.size > 0 && !npcTypes.has(entry.name)) {
            report.error('el mapa coloca al npc "' + entry.name +
                '", que no esta definido en data/npc/npcs.xml', location);
            return;
        }

        /**
         * Un NPC sobre una casilla que no se puede pisar es un NPC al que no se puede
         * llegar. Se avisa en vez de rechazarlo, porque hay NPC que están a propósito
         * dentro de una jaula o detrás de un mostrador, y eso es una decisión de quien
         * hace el mapa, no un error.
         */
        const tile = map.getTile(Number(entry.x), Number(entry.y), Number(entry.z));
        if (tile && !tile.isWalkable()) {
            report.warning('el npc "' + entry.name + '" esta sobre una casilla ' +
                'que no se puede pisar: no se podra llegar a el', location);
        }

        /**
         * EL RADIO DE PASEO DE ESTA COLOCACIÓN, si el mapa lo dice.
         *
         * `null` significa «el mapa no dice nada» y entonces manda `walkradius` de
         * `data/npc/npcs.xml`; un número manda sobre el XML. Se distinguen a propósito,
         * porque `0` es una decisión («aquí no se mueve») y no lo mismo que no decir
         * nada, y un `||` los confundiría.
         *
         * Existe por una diferencia real con Remere's: allí un NPC no pasea, se coloca y
         * se queda; aquí sí pasea, por decisión de este proyecto, y el mapa puede
         * afinarlo por colocación sin duplicar la definición del NPC.
         */
        let walkRadius = null;

        if (entry.radius !== undefined && entry.radius !== null) {
            walkRadius = Number(entry.radius);

            if (!Number.isFinite(walkRadius) || walkRadius < 0) {
                report.error('el npc "' + entry.name + '" tiene un radio de paseo que no es un ' +
                    'numero de casillas igual o mayor que cero: ' + JSON.stringify(entry.radius),
                    location);
                return;
            }
        }

        map.addNpc({
            x: Number(entry.x),
            y: Number(entry.y),
            z: Number(entry.z),
            name: entry.name,
            radius: walkRadius
        });
    });

    // --- Comprobaciones de coherencia -------------------------------------
    // Un mapa sin ninguna celda transitable es casi siempre un error de
    // configuracion del suelo, no un mapa de solo paredes.
    let walkableProbes = 0;
    for (let x = 0; x < map.width && walkableProbes === 0; x += 1) {
        for (let y = 0; y < map.height && walkableProbes === 0; y += 1) {
            if (map.isWalkable(x, y, 0)) {
                walkableProbes += 1;
            }
        }
    }
    if (walkableProbes === 0 && map.width > 0 && map.height > 0) {
        report.warning('en la planta 0 no hay ninguna celda transitable');
    }

    return { map: map, report: report };
}

module.exports = { loadMap, buildMap, ValidationReport, FORMAT, SUPPORTED_VERSIONS, FLAG_NAMES };
