'use strict';

/**
 * El servidor de herramientas: sirve el editor y su API.
 *
 * POR QUÉ UN SERVIDOR PROPIO Y NO AÑADIRLO AL DEL JUEGO. Porque son cosas distintas
 * con ciclos de vida distintos. El servidor de juego atiende a jugadores y no debe
 * exponer un API que escribe archivos del datapack; el de herramientas escribe
 * archivos y no debe atender a nadie que esté jugando. Mezclarlos significaría que
 * un fallo en el editor tumba las partidas, y que para editar un mapa hay que
 * levantar el servidor con sus monstruos y sus temporizadores.
 *
 * SIRVE LOS MÓDULOS DEL CLIENTE, y eso es deliberado: el editor dibuja el mapa con
 * LA MISMA cámara y EL MISMO orden de dibujo que el juego. Si el editor tuviera su
 * propio renderer, acabarían discrepando, y un mapa que se ve bien en el editor y
 * mal en el juego es un fallo que cuesta horas entender.
 *
 * El API escribe en `data/`, QUE ES EL DATAPACK. Por eso escucha sólo en localhost
 * por defecto: no lleva autenticación y no debe ser alcanzable desde fuera.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const Xml = require('../engine/data/xml');
const ItemsFile = require('./lib/itemsfile');
const ContentLoader = require('../engine/scripting/loader');
const MapLoader = require('../engine/world/loader');
const MapWriter = require('../engine/world/writer');
const { Item } = require('../engine/world/item');
const { FLAG_NAMES } = require('../engine/world/writer');
const { AssetStore } = require('./lib/assetstore');
const Assets = require('../shared/js/assets.mjs');
const Compuestos = require('../shared/js/compuestos.mjs');

const ROOT = path.resolve(__dirname, '..');

/**
 * Lo que se sirve por HTTP: prefijo de URL -> carpeta del disco. El editor usa los módulos
 * del cliente (`/jetyum/`) y sus dibujos (`/jetyum/assets/`).
 *
 * El orden importa: `/` va el último porque se lo come todo, así que todo lo que tenga
 * un prefijo propio tiene que estar antes.
 */
const MOUNTS = [
    /*
     * LOS ASSETS VAN ANTES QUE EL CLIENTE, y su carpeta se lee de `PATHS` en cada petición: las
     * pruebas trabajan sobre una COPIA de los assets, y el editor tiene que servir la copia que
     * está editando, no la del repositorio.
     */
    { prefix: '/jetyum/assets/', get dir() { return PATHS.assetsDir; } },
    { prefix: '/jetyum/', dir: path.join(ROOT, 'client', 'jetyum') },
    { prefix: '/shared/', dir: path.join(ROOT, 'shared') },
    { prefix: '/', dir: path.join(ROOT, 'editor') }
];

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

const MAX_BODY_BYTES = 4 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Rutas del datapack
// ---------------------------------------------------------------------------

/**
 * Dónde está el datapack que se edita.
 *
 * Es configurable para que las pruebas trabajen sobre COPIAS. Una prueba que
 * escribiera en `data/` de verdad estaría modificando el datapack del proyecto cada
 * vez que se ejecuta, y entonces un fallo de la prueba se convierte en un mapa roto y
 * el fallo real queda escondido detrás del daño que hizo la propia prueba.
 */
const PATHS = {
    mapsDir: path.join(ROOT, 'data', 'world'),
    itemsFile: path.join(ROOT, 'data', 'items', 'items.xml'),
    monstersDir: path.join(ROOT, 'data', 'monsters'),
    npcsFile: path.join(ROOT, 'data', 'npc', 'npcs.xml'),
    /** Los sprites de 32x32 y things.json (docs/SPRITES.md). */
    assetsDir: path.join(ROOT, 'client', 'jetyum', 'assets'),
    /** Las plantillas de objetos compuestos (docs/MAPAS.md). */
    compuestosFile: path.join(ROOT, 'data', 'editor', 'compuestos.json'),
    /** Los pinceles de terreno, muros, alfombras y mesas (docs/MAPAS.md). */
    pincelesFile: path.join(ROOT, 'data', 'editor', 'pinceles.json')
};

function configurePaths(options) {
    const opts = options || {};
    if (opts.mapsDir) {
        PATHS.mapsDir = path.resolve(opts.mapsDir);
    }
    if (opts.itemsFile) {
        PATHS.itemsFile = path.resolve(opts.itemsFile);
    }
    if (opts.monstersDir) {
        PATHS.monstersDir = path.resolve(opts.monstersDir);
    }
    if (opts.npcsFile) {
        PATHS.npcsFile = path.resolve(opts.npcsFile);
    }
    if (opts.assetsDir) {
        PATHS.assetsDir = path.resolve(opts.assetsDir);
        assetStore = null;
    }
    if (opts.compuestosFile) {
        PATHS.compuestosFile = path.resolve(opts.compuestosFile);
    }
    if (opts.pincelesFile) {
        PATHS.pincelesFile = path.resolve(opts.pincelesFile);
    }
    return PATHS;
}

/**
 * EL ALMACÉN DE ASSETS ES UNO POR PROCESO: guarda las hojas decodificadas en memoria, y
 * decodificar una hoja de 1024x1024 en cada petición haría que importar fuera lento. Se rehace
 * al cambiar la carpeta.
 */
let assetStore = null;

function assets() {
    // Si alguien cambió los archivos por fuera (un `git pull`, una copia restaurada), se vuelven
    // a leer: trabajar con la copia de memoria escribiría encima de lo nuevo.
    if (!assetStore || assetStore.cambiadoFuera()) {
        assetStore = new AssetStore(PATHS.assetsDir);
    }
    return assetStore;
}

function leerCompuestos() {
    if (!fs.existsSync(PATHS.compuestosFile)) {
        return Compuestos.vacio();
    }
    return JSON.parse(fs.readFileSync(PATHS.compuestosFile, 'utf8'));
}

/** Los objetos de items.xml como lista, que es lo que espera la comprobación de coherencia. */
function itemsComoLista() {
    return Array.from(loadItemTypes().values()).map((item) => ({
        id: item.id, name: item.name, attributes: item.attributes || {}
    }));
}

/**
 * Valida la lista de compuestos colocados que manda el editor. Lo que se comprueba es la forma
 * y que la plantilla exista: sus piezas ya viajan como casillas normales en `edits`.
 */
function applyComposites(map, lista, plantillas) {
    const problems = [];
    const salida = [];
    const uids = new Set();
    const conocidas = new Set(plantillas.map((t) => t.id));
    (Array.isArray(lista) ? lista : []).forEach((entry, index) => {
        const uid = Number(entry && entry.uid);
        const x = Number(entry && entry.x);
        const y = Number(entry && entry.y);
        const z = Number(entry && entry.z);
        if (!Number.isInteger(uid) || uid <= 0 || uids.has(uid)) {
            problems.push('compuesto #' + index + ': uid invalido o repetido');
            return;
        }
        if (!entry.compuesto || !conocidas.has(entry.compuesto)) {
            problems.push('compuesto #' + index + ': la plantilla "' + entry.compuesto + '" no existe');
            return;
        }
        if (!map.inBounds(x, y, z)) {
            problems.push('compuesto #' + index + ': fuera del mapa');
            return;
        }
        uids.add(uid);
        salida.push({ uid, compuesto: entry.compuesto, x, y, z,
            valores: entry.valores && typeof entry.valores === 'object' ? entry.valores : {} });
    });
    return { problems, composites: salida };
}

function mapsDirectory() {
    return PATHS.mapsDir;
}

function itemsPath() {
    return PATHS.itemsFile;
}

/** Nombres de mapa válidos. Se rechaza cualquier cosa con barras o puntos. */
function safeMapName(name) {
    const clean = String(name || '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
        return null;
    }
    return clean;
}

function mapFilePath(name) {
    return path.join(mapsDirectory(), name + '.map.json');
}

// ---------------------------------------------------------------------------
// Respawns y NPC: quién puede vivir en el mapa
// ---------------------------------------------------------------------------

/**
 * Los monstruos que existen, leídos de `data/monsters/` COMO LOS LEE EL MOTOR.
 *
 * Se reutiliza `listModules` y `normalizeExports` del cargador de contenido en vez de leer los
 * archivos con una expresión regular: un monstruo es código —puede exportar un array, o
 * generarse en un bucle— y una lista sacada del texto se desincronizaría en cuanto alguien
 * escribiera `name:` de otra forma. Cargar los módulos es lo que hace el motor, así que la
 * lista del editor y la del motor no pueden discrepar.
 *
 * Se descarta la caché de `require` antes de cada uno para que un monstruo recién editado
 * aparezca sin reiniciar el servidor de herramientas, igual que hace la recarga en caliente del
 * motor.
 *
 * Un módulo que revienta NO tumba la lista: se apunta el fallo y se sigue. La lista es una
 * comodidad del editor y no debe caerse porque uno de quince monstruos esté a medio escribir.
 */
function listMonsters() {
    const monsters = [];
    const problems = [];

    ContentLoader.listModules(PATHS.monstersDir).forEach((file) => {
        const relative = path.relative(ROOT, file).split(path.sep).join('/');

        try {
            delete require.cache[require.resolve(file)];
            const exported = require(file);

            ContentLoader.normalizeExports(exported).forEach((definition) => {
                if (!definition || definition.type !== 'monster' || !definition.name) {
                    return;
                }

                monsters.push({
                    name: String(definition.name),
                    description: definition.description ? String(definition.description) : '',
                    health: Number(definition.maxHealth || definition.health || 0),
                    experience: Number(definition.experience || 0),
                    speed: Number(definition.speed || 0),
                    file: relative
                });
            });
        } catch (error) {
            problems.push('no se pudo cargar ' + relative + ': ' + error.message);
        }
    });

    monsters.sort((a, b) => a.name.localeCompare(b.name));

    return { monsters: monsters, problems: problems };
}

/** Los monstruos por nombre, que es lo que valida un respawn. */
function loadMonsterTypes() {
    const types = new Map();

    listMonsters().monsters.forEach((monster) => {
        types.set(monster.name, monster);
    });

    return types;
}

/**
 * Los NPC definidos en `data/npc/npcs.xml`.
 *
 * Se carga con el MISMO lector que el motor (`Xml.loadNpcs`), así que si un NPC está definido
 * para el motor, está en la lista del editor: no hay dos listas que mantener de acuerdo.
 */
function listNpcs() {
    if (!fs.existsSync(PATHS.npcsFile)) {
        return { npcs: [], problems: ['no se encontro ' + PATHS.npcsFile] };
    }

    const definitions = Xml.loadNpcs(PATHS.npcsFile);
    const npcs = [];

    definitions.forEach((definition) => {
        npcs.push({
            name: definition.name,
            module: definition.module,
            speed: definition.speed,
            maxHealth: definition.maxHealth,
            walkInterval: definition.walkInterval,
            /** Cuántas casillas pasea según el XML; el mapa puede afinarlo por colocación. */
            walkRadius: definition.walkRadius,
            outfit: definition.outfit
        });
    });

    npcs.sort((a, b) => a.name.localeCompare(b.name));

    return { npcs: npcs, problems: [] };
}

function loadNpcTypes() {
    const types = new Map();

    listNpcs().npcs.forEach((npc) => {
        types.set(npc.name, npc);
    });

    return types;
}

/**
 * Comprueba y normaliza la lista de respawns que manda el editor.
 *
 * LA LISTA ES EL ESTADO FINAL: se reemplaza entera, igual que las ediciones de casilla, así que
 * aplicar lo mismo dos veces da lo mismo. Lo que se valida aquí es lo mismo que valida el
 * cargador al leer —el monstruo tiene que existir y **cada monstruo tiene que caer dentro del
 * área de su respawn**—, y se valida ANTES de escribir nada: más vale un 422 con el motivo que
 * un mapa que el motor no puede arrancar.
 *
 * El escritor volvería a comprobarlo en la ida y vuelta, pero entonces el mensaje hablaría de
 * «no se puede releer el mapa» en vez de decir qué monstruo está fuera de qué respawn.
 *
 * @returns {{problems: Array<string>, spawns: (Array|null)}}
 */
function applySpawns(map, spawns, monsterTypes) {
    const problems = [];
    const clean = [];

    if (!Array.isArray(spawns)) {
        return { problems: ['los respawns tienen que ser una lista'], spawns: null };
    }

    spawns.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            problems.push('el respawn #' + index + ' no es un objeto');
            return;
        }

        const x = Number(entry.x);
        const y = Number(entry.y);
        const z = Number(entry.z);

        if (!map.inBounds(x, y, z)) {
            problems.push('el respawn #' + index + ' cae fuera del mapa en (' +
                x + ',' + y + ',' + z + ')');
            return;
        }

        const radius = entry.radius === undefined ? 1 : Number(entry.radius);
        if (!Number.isFinite(radius) || radius < 0) {
            problems.push('el respawn #' + index + ' tiene un radio que no es un numero de ' +
                'casillas igual o mayor que cero: ' + JSON.stringify(entry.radius));
            return;
        }

        const interval = entry.interval === undefined ? 60000 : Number(entry.interval);
        if (!Number.isFinite(interval) || interval <= 0) {
            problems.push('el respawn #' + index + ' tiene un intervalo que no es un numero ' +
                'de milisegundos mayor que cero: ' + JSON.stringify(entry.interval));
            return;
        }

        if (!Array.isArray(entry.monsters) || entry.monsters.length === 0) {
            problems.push('el respawn #' + index + ' de (' + x + ',' + y + ',' + z +
                ') no tiene ningun monstruo: un respawn sin monstruos no se puede guardar');
            return;
        }

        const monsters = [];

        entry.monsters.forEach((monster, position) => {
            const name = monster && monster.name ? String(monster.name) : '';

            if (name === '') {
                problems.push('el monstruo #' + position + ' del respawn #' + index +
                    ' no tiene nombre');
                return;
            }
            if (monsterTypes.size > 0 && !monsterTypes.has(name)) {
                problems.push('el monstruo "' + name + '" del respawn #' + index +
                    ' no esta definido en data/monsters/');
                return;
            }

            const monsterX = monster.x === undefined || monster.x === null
                ? null : Number(monster.x);
            const monsterY = monster.y === undefined || monster.y === null
                ? null : Number(monster.y);

            if (monsterX !== null &&
                (!Number.isFinite(monsterX) || !Number.isFinite(monsterY))) {
                problems.push('el monstruo "' + name + '" del respawn #' + index +
                    ' tiene una casilla ilegible');
                return;
            }
            if (monsterX !== null &&
                (Math.abs(monsterX - x) > radius || Math.abs(monsterY - y) > radius)) {
                problems.push('el monstruo "' + name + '" del respawn #' + index + ' cae fuera ' +
                    'de su respawn: el area llega de (' + (x - radius) + ',' + (y - radius) +
                    ') a (' + (x + radius) + ',' + (y + radius) + ')');
                return;
            }

            const monsterInterval = monster.interval === undefined
                ? interval : Number(monster.interval);

            if (!Number.isFinite(monsterInterval) || monsterInterval <= 0) {
                problems.push('el monstruo "' + name + '" del respawn #' + index + ' tiene un ' +
                    'intervalo que no es un numero de milisegundos mayor que cero');
                return;
            }

            monsters.push({
                name: name,
                x: monsterX,
                y: monsterY,
                interval: monsterInterval
            });
        });

        if (monsters.length !== entry.monsters.length) {
            return;
        }

        clean.push({
            x: x,
            y: y,
            z: z,
            radius: Math.trunc(radius),
            interval: Math.trunc(interval),
            monsters: monsters
        });
    });

    return { problems: problems, spawns: problems.length === 0 ? clean : null };
}

/**
 * Comprueba y normaliza la lista de NPC colocados.
 *
 * `radius` es el radio de paseo de ESA colocación: `null` significa «manda lo que diga
 * `data/npc/npcs.xml`», y un número manda sobre el XML. Se distinguen a propósito, porque `0`
 * es una decisión —«aquí no se mueve»— y no lo mismo que no decir nada.
 */
function applyNpcs(map, npcs, npcTypes) {
    const problems = [];
    const clean = [];

    if (!Array.isArray(npcs)) {
        return { problems: ['los npc tienen que ser una lista'], npcs: null };
    }

    npcs.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            problems.push('el npc #' + index + ' no es un objeto');
            return;
        }

        const x = Number(entry.x);
        const y = Number(entry.y);
        const z = Number(entry.z);

        if (!map.inBounds(x, y, z)) {
            problems.push('el npc #' + index + ' cae fuera del mapa en (' + x + ',' + y + ',' + z + ')');
            return;
        }

        const name = entry.name ? String(entry.name).trim() : '';

        if (name === '') {
            problems.push('el npc #' + index + ' no tiene nombre');
            return;
        }
        if (npcTypes.size > 0 && !npcTypes.has(name)) {
            problems.push('el mapa coloca al npc "' + name + '", que no esta definido en ' +
                'data/npc/npcs.xml');
            return;
        }

        let radius = null;

        if (entry.radius !== undefined && entry.radius !== null) {
            radius = Number(entry.radius);

            if (!Number.isFinite(radius) || radius < 0) {
                problems.push('el npc "' + name + '" tiene un radio de paseo que no es un ' +
                    'numero de casillas igual o mayor que cero: ' + JSON.stringify(entry.radius));
                return;
            }
            radius = Math.trunc(radius);
        }

        clean.push({ x: x, y: y, z: z, name: name, radius: radius });
    });

    return { problems: problems, npcs: problems.length === 0 ? clean : null };
}

// ---------------------------------------------------------------------------
// Aplicar ediciones a un mapa
// ---------------------------------------------------------------------------

/**
 * Convierte las banderas por nombre a su número, y avisa de las que no existen.
 *
 * Se avisa en vez de ignorarlas: una bandera mal escrita en el editor que se guarda
 * sin más deja un mapa que parece correcto y no tiene la propiedad que se quería.
 */
function flagsFromNames(names) {
    const unknown = [];
    let bits = 0;

    (names || []).forEach((name) => {
        const entry = FLAG_NAMES.find(([flagName]) => flagName === name);
        if (!entry) {
            unknown.push(name);
            return;
        }
        bits |= entry[1];
    });

    return { bits: bits, unknown: unknown };
}

/**
 * Aplica una lista de ediciones a un mapa cargado.
 *
 * LA FORMA DE UNA EDICIÓN ES "CÓMO DEBE QUEDAR EL TILE", no "qué hay que cambiar".
 * Es lo que hace que aplicar la misma edición dos veces dé lo mismo, y que el editor
 * no tenga que llevar la cuenta de lo que ya mandó.
 *
 * Una edición sin suelo, sin items y sin banderas significa BORRAR: el tile vuelve a
 * ser suelo por defecto. Es lo que hace la goma de borrar.
 */
function applyEdits(map, edits, itemTypes) {
    const problems = [];
    let changed = 0;

    edits.forEach((edit) => {
        const x = Number(edit.x);
        const y = Number(edit.y);
        const z = Number(edit.z);

        if (!map.inBounds(x, y, z)) {
            problems.push('edicion fuera del mapa en (' + x + ',' + y + ',' + z + ')');
            return;
        }

        const items = edit.items || [];
        const flags = edit.flags || [];
        const hasGround = edit.ground !== undefined && edit.ground !== null;
        const isEmpty = !hasGround && items.length === 0 && flags.length === 0 && !edit.houseId;

        if (isEmpty) {
            if (map.removeTile(x, y, z)) {
                changed += 1;
            }
            return;
        }

        const tile = map.getOrCreateTile(x, y, z);
        if (!tile) {
            problems.push('no se pudo crear el tile en (' + x + ',' + y + ',' + z + ')');
            return;
        }

        if (hasGround) {
            const definition = itemTypes.get(Number(edit.ground));
            if (!definition) {
                problems.push('el suelo ' + edit.ground + ' no existe en items.xml');
                return;
            }
            tile.setGround(new Item(definition, { count: 1 }));
        }

        // Los items se reemplazan ENTEROS, no se añaden. Si se añadieran, pintar dos
        // veces el mismo muro lo pondría dos veces, y el mapa acumularía basura con
        // cada retoque.
        tile.downItems.length = 0;
        tile.topItems.length = 0;

        items.forEach((entry) => {
            const typeId = Number(entry.id !== undefined ? entry.id : entry);
            const definition = itemTypes.get(typeId);

            if (!definition) {
                problems.push('el item ' + typeId + ' no existe en items.xml');
                return;
            }

            tile.addItem(new Item(definition, {
                count: entry.count === undefined ? 1 : Number(entry.count),
                attributes: entry.attributes || null
            }));
        });

        // La casa de la casilla (0 = ninguna).
        tile.houseId = Number(edit.houseId) || 0;

        const parsedFlags = flagsFromNames(flags);
        parsedFlags.unknown.forEach((name) => {
            problems.push('la bandera "' + name + '" no existe');
        });
        tile.flags = parsedFlags.bits;

        changed += 1;
    });

    return { changed: changed, problems: problems };
}

/** Las claves de documentación de un archivo de mapa, que hay que conservar. */
function documentationKeys(data) {
    const extras = {};
    Object.keys(data).forEach((key) => {
        if (key.startsWith('_')) {
            extras[key] = data[key];
        }
    });
    return extras;
}

// ---------------------------------------------------------------------------
// Cargar y guardar
// ---------------------------------------------------------------------------

function loadItemTypes() {
    const file = itemsPath();
    if (!fs.existsSync(file)) {
        throw new Error('no se encontro ' + file);
    }
    return Xml.loadItems(file);
}

function readMap(name) {
    const file = mapFilePath(name);
    if (!fs.existsSync(file)) {
        return null;
    }

    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const itemTypes = loadItemTypes();

    /*
     * LOS MONSTRUOS Y LOS NPC SE CARGAN PARA VALIDAR, y es lo que hace que el editor no pueda
     * guardar un mapa que el motor no arrancaría: el cargador comprueba que el monstruo de cada
     * respawn esté definido en `data/monsters/` y que cada NPC colocado esté en `npcs.xml`, y
     * hasta ahora aquí se le pasaban mapas vacíos, así que esa comprobación no se hacía.
     *
     * Si `data/monsters/` faltara, la lista llega vacía y el cargador se salta la comprobación:
     * es preferible abrir el mapa sin validar los monstruos que no poder abrirlo.
     */
    const monsterTypes = loadMonsterTypes();
    const npcTypes = loadNpcTypes();

    const result = MapLoader.buildMap(raw, {
        itemTypes: itemTypes,
        monsterTypes: monsterTypes,
        npcTypes: npcTypes
    });

    if (!result.report.ok) {
        return {
            error: 'el mapa tiene errores y no se puede abrir',
            problems: result.report.errors.map((entry) =>
                (entry.where ? entry.where + ': ' : '') + entry.message)
        };
    }

    return {
        name: name,
        raw: raw,
        map: result.map,
        itemTypes: itemTypes,
        monsterTypes: monsterTypes,
        npcTypes: npcTypes,
        extras: documentationKeys(raw)
    };
}

/**
 * Guarda un mapa, comprobando ANTES que se puede volver a leer.
 *
 * Es la comprobación que justifica que este servidor exista: si el escritor tiene un
 * fallo, el archivo que produce no lo va a detectar nadie hasta que el motor intente
 * arrancar, y para entonces el mapa bueno ya se ha sobrescrito. Comprobando la ida y
 * vuelta antes de escribir, un fallo se convierte en un mensaje de error y el archivo
 * se queda como estaba.
 */
function writeMap(name, loaded, options) {
    const opts = options || {};

    const result = MapWriter.verifyRoundTrip(loaded.map, MapLoader.buildMap, {
        itemTypes: loaded.itemTypes,
        monsterTypes: loaded.monsterTypes,
        npcTypes: loaded.npcTypes,
        extraKeys: loaded.extras,
        name: name
    });

    if (!result.ok) {
        return { ok: false, problems: result.problems };
    }

    const text = MapWriter.writeMap(loaded.map, {
        itemTypes: loaded.itemTypes,
        extraKeys: loaded.extras,
        name: name
    });

    // Se escribe en un temporal y se renombra. Un guardado que se corta a la mitad
    // deja el archivo original intacto en vez de uno truncado, y en un mapa truncado
    // se pierde el trabajo de semanas.
    const target = mapFilePath(name);
    const temporary = target + '.tmp';

    if (opts.dryRun) {
        return { ok: true, dryRun: true, bytes: text.length, text: text };
    }

    fs.writeFileSync(temporary, text, 'utf8');
    fs.renameSync(temporary, target);

    return { ok: true, bytes: text.length, text: text };
}

// ---------------------------------------------------------------------------
// El servidor
// ---------------------------------------------------------------------------

function sendJson(response, status, payload) {
    const body = JSON.stringify(payload, null, 2);
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    response.end(body);
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];

        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                // No se corta la conexión: así el navegador recibe la respuesta con el error y
                // no un «Failed to fetch» que no explica nada. Lo que sobra se lee y se tira.
                chunks.length = 0;
                return;
            }
            chunks.push(chunk);
        });

        request.on('end', () => {
            if (size > MAX_BODY_BYTES) {
                reject(new Error('la petición pasa de ' + (MAX_BODY_BYTES / 1024 / 1024) + ' MB'));
                return;
            }
            const text = Buffer.concat(chunks).toString('utf8');
            if (!text) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(text));
            } catch (error) {
                reject(new Error('el cuerpo no es JSON valido: ' + error.message));
            }
        });

        request.on('error', reject);
    });
}

/** Sirve un archivo estático, sin salirse de su montaje. */
function serveStatic(request, response, pathname) {
    for (const mount of MOUNTS) {
        if (!pathname.startsWith(mount.prefix)) {
            continue;
        }

        let rest = pathname.slice(mount.prefix.length);
        if (rest === '' || rest.endsWith('/')) {
            rest += 'index.html';
        }

        const target = path.normalize(path.join(mount.dir, rest));

        // Sin esta comprobación, `/../server/config.json` se serviría. Es el fallo
        // clásico de cualquier servidor de archivos.
        if (!target.startsWith(mount.dir)) {
            response.writeHead(403);
            response.end('fuera del montaje');
            return true;
        }

        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
            return false;
        }

        const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
        response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        response.end(fs.readFileSync(target));
        return true;
    }

    return false;
}

async function handleApi(request, response, pathname, query) {
    const method = request.method.toUpperCase();

    // `query` es un URLSearchParams, que tiene la misma forma de lectura que el
    // objeto que devolvía `url.parse`. Se normaliza aquí para no cambiarlo todo.
    const queryOf = (key) => (query && typeof query.get === 'function'
        ? query.get(key) : (query ? query[key] : null));

    // --- Lista de mapas ---
    if (pathname === '/api/maps' && method === 'GET') {
        const directory = mapsDirectory();
        const maps = [];

        if (fs.existsSync(directory)) {
            fs.readdirSync(directory)
                .filter((file) => file.endsWith('.map.json'))
                .forEach((file) => {
                    const name = file.replace('.map.json', '');
                    try {
                        const raw = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
                        maps.push({
                            name: name,
                            width: raw.width,
                            height: raw.height,
                            floors: raw.floors,
                            tiles: (raw.tiles || []).length,
                            bytes: fs.statSync(path.join(directory, file)).size
                        });
                    } catch (error) {
                        maps.push({ name: name, error: 'JSON invalido' });
                    }
                });
        }

        sendJson(response, 200, { maps: maps });
        return;
    }

    // --- Leer un mapa ---
    if (pathname === '/api/map' && method === 'GET') {
        const name = safeMapName(queryOf('name'));
        if (!name) {
            sendJson(response, 400, { error: 'nombre de mapa invalido' });
            return;
        }

        const loaded = readMap(name);
        if (!loaded) {
            sendJson(response, 404, { error: 'no existe el mapa ' + name });
            return;
        }
        if (loaded.error) {
            sendJson(response, 422, loaded);
            return;
        }

        sendJson(response, 200, {
            name: name,
            raw: loaded.raw,
            stats: loaded.map.stats()
        });
        return;
    }

    // --- Guardar ediciones de un mapa ---
    if (pathname === '/api/map' && method === 'POST') {
        const body = await readBody(request);
        const name = safeMapName(body.name);
        if (!name) {
            sendJson(response, 400, { error: 'nombre de mapa invalido' });
            return;
        }

        const loaded = readMap(name);
        if (!loaded || loaded.error) {
            sendJson(response, 404, { error: 'no se pudo abrir el mapa ' + name });
            return;
        }

        const applied = applyEdits(loaded.map, body.edits || [], loaded.itemTypes);
        if (applied.problems.length > 0) {
            sendJson(response, 422, {
                error: 'algunas ediciones no se pudieron aplicar',
                problems: applied.problems
            });
            return;
        }

        /*
         * LOS RESPAWNS Y LOS NPC SE APLICAN DESPUÉS DE LAS CASILLAS Y ANTES DE ESCRIBIR.
         *
         * Van en su propio camino porque no son estados de casilla: un respawn es un área con
         * monstruos dentro y un NPC es una colocación, y meterlos en `edits` habría hecho que
         * guardar uno borrara el suelo de su casilla.
         *
         * SÓLO SE TOCAN SI VIENEN. Es lo que permite que un guardado que únicamente pinta un
         * muro —o una herramienta antigua que no manda estas listas— no borre los respawns del
         * mapa por omisión, que es la clase de fallo que no se descubre hasta que faltan los
         * monstruos.
         */
        let respawns = null;
        let npcs = null;

        if (body.spawns !== undefined) {
            const resultado = applySpawns(loaded.map, body.spawns, loaded.monsterTypes);

            if (resultado.problems.length > 0) {
                sendJson(response, 422, {
                    error: 'algunos respawns no se pudieron aplicar',
                    problems: resultado.problems
                });
                return;
            }
            respawns = resultado.spawns;
        }

        if (body.npcs !== undefined) {
            const resultado = applyNpcs(loaded.map, body.npcs, loaded.npcTypes);

            if (resultado.problems.length > 0) {
                sendJson(response, 422, {
                    error: 'algunos npc no se pudieron aplicar',
                    problems: resultado.problems
                });
                return;
            }
            npcs = resultado.npcs;
        }

        if (body.composites !== undefined) {
            const plantillas = Compuestos.normalizarCompuestos(leerCompuestos()).data.compuestos;
            const resultado = applyComposites(loaded.map, body.composites, plantillas);
            if (resultado.problems.length > 0) {
                sendJson(response, 422, {
                    error: 'algunos objetos compuestos no se pudieron aplicar',
                    problems: resultado.problems
                });
                return;
            }
            loaded.map.composites = resultado.composites;
        }

        /*
         * WAYPOINTS, CIUDADES Y CASAS: listas enteras, igual que los respawns, y solo si vienen.
         * La validación de verdad (dentro del mapa, ids únicos, ciudad existente) la hace el
         * cargador en la comprobación de ida y vuelta, antes de escribir nada.
         */
        if (body.waypoints !== undefined) {
            loaded.map.waypoints.clear();
            Object.keys(body.waypoints || {}).forEach((nombre) => {
                loaded.map.setWaypoint(String(nombre), body.waypoints[nombre]);
            });
        }
        if (body.towns !== undefined) {
            loaded.map.towns = (body.towns || []).map((t) => ({
                id: Number(t.id), name: String(t.name || ''),
                temple: Array.isArray(t.temple) ? { x: t.temple[0], y: t.temple[1], z: t.temple[2] } : t.temple
            }));
        }
        if (body.houses !== undefined) {
            loaded.map.houses = (body.houses || []).map((h) => ({
                id: Number(h.id), name: String(h.name || ''), townId: Number(h.townId) || 0,
                rent: Number(h.rent) || 0,
                exit: !h.exit ? null : (Array.isArray(h.exit) ? { x: h.exit[0], y: h.exit[1], z: h.exit[2] } : h.exit)
            }));
        }

        if (respawns !== null) {
            loaded.map.spawns = respawns;
        }
        if (npcs !== null) {
            loaded.map.npcPlacements = npcs;
        }

        const written = writeMap(name, loaded, { dryRun: body.dryRun === true });
        if (!written.ok) {
            sendJson(response, 422, {
                error: 'el mapa no se pudo guardar: no se puede volver a leer',
                problems: written.problems
            });
            return;
        }

        const stats = loaded.map.stats();

        sendJson(response, 200, {
            ok: true,
            changed: applied.changed,
            bytes: written.bytes,
            dryRun: written.dryRun === true,
            // Los totales del mapa DESPUÉS de aplicar, que es lo que deja comprobar de un
            // vistazo que un guardado no se ha llevado nada por delante.
            spawns: stats.spawns,
            spawnAreas: stats.spawnAreas,
            npcs: stats.npcs,
            stats: stats
        });
        return;
    }

    // --- Monstruos y NPC que se pueden colocar ---
    //
    // Estas dos listas son las que llenan los desplegables del editor. Salen de `data/monsters/`
    // y de `data/npc/npcs.xml` con los MISMOS lectores que usa el motor, para que no haya dos
    // listas que mantener de acuerdo: un monstruo nuevo aparece solo en el editor y un NPC
    // definido es un NPC colocable.
    if (pathname === '/api/monsters' && method === 'GET') {
        const listed = listMonsters();
        sendJson(response, 200, { monsters: listed.monsters, problems: listed.problems });
        return;
    }

    if (pathname === '/api/npcs' && method === 'GET') {
        const listed = listNpcs();
        sendJson(response, 200, { npcs: listed.npcs, problems: listed.problems });
        return;
    }

    // --- Items ---
    if (pathname === '/api/items' && method === 'GET') {
        const xml = fs.readFileSync(itemsPath(), 'utf8');
        sendJson(response, 200, {
            items: ItemsFile.readItems(xml),
            attributeKeys: ItemsFile.KNOWN_ATTRIBUTE_KEYS,
            bytes: xml.length
        });
        return;
    }

    if (pathname === '/api/items' && method === 'POST') {
        const body = await readBody(request);
        const item = body.item;

        if (!item || (item.id === undefined && item.fromid === undefined)) {
            sendJson(response, 400, { error: 'el item necesita un id o un fromid' });
            return;
        }

        const xml = fs.readFileSync(itemsPath(), 'utf8');
        const result = ItemsFile.saveItem(xml, item);

        // Se escribe en un temporal y SE ANALIZA EL TEMPORAL antes de sustituir el
        // archivo bueno. Un `items.xml` roto deja el servidor sin arrancar, y es lo
        // único que este editor puede romper de forma irreversible: los mapas se
        // pueden regenerar, el catálogo de items no.
        const temporary = itemsPath() + '.tmp';
        fs.writeFileSync(temporary, result.xml, 'utf8');

        try {
            Xml.loadItems(temporary);
        } catch (error) {
            fs.unlinkSync(temporary);
            sendJson(response, 422, {
                error: 'el items.xml resultante no se puede leer, no se ha guardado',
                problems: [error.message]
            });
            return;
        }

        fs.renameSync(temporary, itemsPath());
        sendJson(response, 200, { ok: true, action: result.action, bytes: result.xml.length });
        return;
    }

    // --- Borrar un item ---
    if (pathname === '/api/items' && method === 'DELETE') {
        const id = Number(queryOf('id'));
        if (!id) {
            sendJson(response, 400, { error: 'falta el id del item' });
            return;
        }

        /*
         * SE COMPRUEBA QUE NINGÚN MAPA USE EL ITEM, y es la razón por la que el
         * borrado vive aquí y no en el navegador: sólo el servidor conoce los mapas.
         *
         * Un item borrado que aparece en un mapa deja ese mapa inválido, y el fallo
         * salta al arrancar el MOTOR, mucho después y en otro sitio. Negarse a borrar
         * y decir en qué mapa está es infinitamente más útil que dejar romperlo.
         */
        const users = [];
        const directory = mapsDirectory();

        if (fs.existsSync(directory)) {
            fs.readdirSync(directory)
                .filter((file) => file.endsWith('.map.json'))
                .forEach((file) => {
                    try {
                        const raw = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
                        const name = file.replace('.map.json', '');

                        if (Number(raw.defaultGround && raw.defaultGround['7']) === id) {
                            users.push(name);
                            return;
                        }
                        Object.keys(raw.defaultGround || {}).forEach((z) => {
                            if (Number(raw.defaultGround[z]) === id && users.indexOf(name) === -1) {
                                users.push(name);
                            }
                        });

                        (raw.tiles || []).forEach((tile) => {
                            if (Number(tile.ground) === id && users.indexOf(name) === -1) {
                                users.push(name);
                                return;
                            }
                            (tile.items || []).forEach((item) => {
                                if (Number(item.id) === id && users.indexOf(name) === -1) {
                                    users.push(name);
                                }
                            });
                        });
                    } catch (error) {
                        // Un mapa ilegible no debe impedir borrar un item; ya tiene su
                        // propio problema y se verá al abrirlo.
                    }
                });
        }

        if (users.length > 0) {
            sendJson(response, 409, {
                error: 'no se puede borrar: el item ' + id + ' lo usa ' +
                    (users.length === 1 ? 'el mapa ' : 'los mapas ') + users.join(', '),
                problems: users.map((name) => 'usado en ' + name)
            });
            return;
        }

        const xml = fs.readFileSync(itemsPath(), 'utf8');
        const result = ItemsFile.deleteItem(xml, id);

        if (result.action === 'notFound') {
            sendJson(response, 404, { error: 'no existe el item ' + id });
            return;
        }

        const temporary = itemsPath() + '.tmp';
        fs.writeFileSync(temporary, result.xml, 'utf8');

        try {
            Xml.loadItems(temporary);
        } catch (error) {
            fs.unlinkSync(temporary);
            sendJson(response, 422, {
                error: 'el items.xml resultante no se puede leer, no se ha borrado',
                problems: [error.message]
            });
            return;
        }

        fs.renameSync(temporary, itemsPath());
        sendJson(response, 200, { ok: true, action: 'deleted' });
        return;
    }

    // =======================================================================
    // Assets: sprites de 32x32 y things.json (la pestaña Sprites)
    // =======================================================================
    if (pathname === '/api/assets' && method === 'GET') {
        const store = assets();
        const raw = store.readThings();
        const { data, problems } = Assets.normalizeThings(raw, store.count);
        sendJson(response, 200, { things: data, index: store.index(), problems });
        return;
    }

    if (pathname === '/api/assets/things' && method === 'POST') {
        const body = await readBody(request);
        const result = assets().writeThings(body.things, { dryRun: body.dryRun === true });
        if (!result.ok) {
            sendJson(response, 422, {
                error: 'things.json no se guardó: tiene problemas',
                problems: result.problems.slice(0, 50)
            });
            return;
        }
        sendJson(response, 200, {
            ok: true,
            counts: Object.fromEntries(Assets.CATEGORY_NAMES.map((c) => [c, result.data[c].length]))
        });
        return;
    }

    if (pathname === '/api/assets/check' && method === 'GET') {
        const store = assets();
        const { data } = Assets.normalizeThings(store.readThings(), store.count);
        sendJson(response, 200, Assets.checkCoherence(data, itemsComoLista()));
        return;
    }

    if (pathname === '/api/sprites' && method === 'POST') {
        const body = await readBody(request);
        if (!Array.isArray(body.sprites) || body.sprites.length === 0) {
            sendJson(response, 400, { error: 'faltan los sprites (RGBA de 32x32 en base64)' });
            return;
        }
        const store = assets();
        const result = store.addSprites(body.sprites, { dedupe: body.dedupe !== false });
        store.flush();
        sendJson(response, 200, { ok: true, ids: result.ids, added: result.added,
            reused: result.reused, index: store.index() });
        return;
    }

    if (pathname === '/api/sprites/replace' && method === 'POST') {
        const body = await readBody(request);
        const store = assets();
        store.setSprite(body.id, body.sprite);
        store.flush();
        sendJson(response, 200, { ok: true, index: store.index(), usage: store.usage(body.id) });
        return;
    }

    if (pathname === '/api/sprites/clear' && method === 'POST') {
        const body = await readBody(request);
        const store = assets();
        store.clearSprite(body.id);
        store.flush();
        sendJson(response, 200, { ok: true, index: store.index(), usage: store.usage(body.id) });
        return;
    }

    if (pathname === '/api/sprites/usage' && method === 'GET') {
        sendJson(response, 200, { usage: assets().usage(Number(query.get('id'))) });
        return;
    }

    // =======================================================================
    // Objetos compuestos (la pestaña Compuestos y la paleta del mapa)
    // =======================================================================
    if (pathname === '/api/compuestos' && method === 'GET') {
        const { data, problemas } = Compuestos.normalizarCompuestos(leerCompuestos(), loadItemTypes());
        sendJson(response, 200, { data, problems: problemas, atributos: Compuestos.ATRIBUTOS_CONOCIDOS });
        return;
    }

    if (pathname === '/api/compuestos' && method === 'POST') {
        const body = await readBody(request);
        const { data, problemas } = Compuestos.normalizarCompuestos(body.data, loadItemTypes());
        if (problemas.length > 0) {
            sendJson(response, 422, { error: 'los compuestos no se guardaron', problems: problemas });
            return;
        }
        if (body.dryRun !== true) {
            fs.mkdirSync(path.dirname(PATHS.compuestosFile), { recursive: true });
            const temporal = PATHS.compuestosFile + '.tmp';
            fs.writeFileSync(temporal, Compuestos.serializar(data), 'utf8');
            fs.renameSync(temporal, PATHS.compuestosFile);
        }
        sendJson(response, 200, { ok: true, count: data.compuestos.length });
        return;
    }

    // --- Pinceles de terreno, muros, alfombras y mesas ---
    if (pathname === '/api/pinceles' && method === 'GET') {
        const Pinceles = await import('./js/pinceles.js');
        const raw = fs.existsSync(PATHS.pincelesFile)
            ? JSON.parse(fs.readFileSync(PATHS.pincelesFile, 'utf8')) : Pinceles.vacio();
        const { data, problemas } = Pinceles.normalizarPinceles(raw, loadItemTypes());
        sendJson(response, 200, { data, problems: problemas });
        return;
    }

    // --- Estado ---
    if (pathname === '/api/status' && method === 'GET') {
        const itemTypes = loadItemTypes();
        sendJson(response, 200, {
            root: ROOT,
            items: itemTypes.size,
            monsters: listMonsters().monsters.length,
            npcs: listNpcs().npcs.length,
            maps: fs.existsSync(mapsDirectory())
                ? fs.readdirSync(mapsDirectory()).filter((f) => f.endsWith('.map.json')).length
                : 0
        });
        return;
    }

    sendJson(response, 404, { error: 'no existe ' + pathname });
}

/**
 * Arranca el servidor de herramientas.
 *
 * @param {Object} options { port, host, logger }
 */
function createToolsServer(options) {
    const opts = options || {};
    const log = opts.logger || console;

    configurePaths(opts);

    const server = http.createServer((request, response) => {
        // Se usa la URL de WHATWG y no `url.parse`, que está obsoleto y emite un
        // aviso en cada petición. `URL` necesita una base porque en una petición la
        // ruta viene sin host.
        const parsed = new URL(request.url, 'http://localhost');
        const pathname = decodeURIComponent(parsed.pathname);

        if (pathname.startsWith('/api/')) {
            handleApi(request, response, pathname, parsed.searchParams).catch((error) => {
                sendJson(response, 500, { error: error.message });
            });
            return;
        }

        if (!serveStatic(request, response, pathname)) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('no encontrado: ' + pathname);
        }
    });

    /**
     * Escucha sólo en localhost por defecto.
     *
     * NO LLEVA AUTENTICACIÓN y escribe en el datapack. Escuchando en todas las
     * interfaces, cualquiera en la misma red podría reescribir los mapas del
     * servidor, y eso no es una configuración que deba salir por defecto.
     */
    const host = opts.host || '127.0.0.1';

    const ready = new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(opts.port === undefined ? 8090 : opts.port, host, () => {
            resolve(server.address().port);
        });
    });

    return {
        server: server,
        ready: ready,
        port() {
            const address = server.address();
            return address ? address.port : null;
        },
        close() {
            return new Promise((resolve) => server.close(() => resolve(true)));
        }
    };
}

module.exports = {
    createToolsServer,
    configurePaths,
    applyEdits,
    applySpawns,
    applyNpcs,
    flagsFromNames,
    listMonsters,
    listNpcs,
    loadMonsterTypes,
    loadNpcTypes,
    readMap,
    writeMap,
    loadItemTypes,
    safeMapName,
    documentationKeys,
    applyComposites,
    MOUNTS
};

if (require.main === module) {
    const args = process.argv.slice(2);
    let port = 8090;

    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '--port') {
            port = Number(args[index + 1]);
        }
    }

    const tools = createToolsServer({ port: port });

    tools.ready.then((realPort) => {
        console.log('');
        console.log('  Editor de Jetyum en http://localhost:' + realPort + '/');
        console.log('  Escribe en data/, asi que solo escucha en localhost.');
        console.log('');
    }).catch((error) => {
        console.error('no se pudo arrancar el editor: ' + error.message);
        process.exit(1);
    });
}
