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
const MapFiles = require('./lib/mapfiles');
const ConvertirOtbm = require('./lib/convertirotbm');
const Assets = require('../shared/js/assets.mjs');
const Compuestos = require('../shared/js/compuestos.mjs');
const Config = require('../engine/core/config');

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
    pincelesFile: path.join(ROOT, 'data', 'editor', 'pinceles.json'),
    /** De ids de Tibia a ids de Jetyum, para importar OTBM (docs/MAPAS.md §5). */
    equivalenciasFile: path.join(ROOT, 'data', 'editor', 'equivalencias-otbm.json'),
    /** Donde quedan los archivos que se suben para importar (fuera del repositorio). */
    subidasDir: path.join(require('os').tmpdir(), 'jetyum-subidas')
};

/**
 * El idioma con el que se abre el editor para quien no ha elegido otro: `defaultLanguage` de
 * `config.js`, el mismo que usa el juego. Se lee en cada petición, así que cambiarlo no pide
 * reiniciar; y si el archivo no se puede leer, el de por defecto.
 */
function idiomaPorDefecto() {
    try {
        const archivo = path.join(ROOT, 'config.js');
        delete require.cache[require.resolve(archivo)];
        return require(archivo).defaultLanguage || Config.DEFAULTS.defaultLanguage;
    } catch (error) {
        return Config.DEFAULTS.defaultLanguage;
    }
}

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
    if (opts.equivalenciasFile) {
        PATHS.equivalenciasFile = path.resolve(opts.equivalenciasFile);
    }
    if (opts.subidasDir) {
        PATHS.subidasDir = path.resolve(opts.subidasDir);
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

/**
 * LOS PAQUETES de pinceles o de compuestos: los `<base>-*.json` junto al archivo base
 * (`pinceles-rme.json` junto a `pinceles.json`). Los escribe `tools/importar-materiales-rme.mjs`.
 *
 * Se cargan JUNTO a los del archivo base y son de SOLO LECTURA para el editor: la pestaña
 * Compuestos edita y guarda solo `compuestos.json`, así que un paquete no se mezcla con lo propio
 * al guardar. Un paquete que no es JSON válido se apunta y se salta.
 *
 * @returns {Array<{archivo: string, datos: Object|null, error?: string}>}
 */
function leerPaquetes(archivoBase) {
    const carpeta = path.dirname(archivoBase);
    const prefijo = path.basename(archivoBase, '.json') + '-';
    if (!fs.existsSync(carpeta)) {
        return [];
    }
    return fs.readdirSync(carpeta)
        .filter((archivo) => archivo.startsWith(prefijo) && archivo.endsWith('.json'))
        .sort()
        .map((archivo) => {
            try {
                return { archivo: archivo, datos: JSON.parse(fs.readFileSync(path.join(carpeta, archivo), 'utf8')) };
            } catch (error) {
                return { archivo: archivo, datos: null, error: archivo + ': ' + error.message };
            }
        });
}

/** Las plantillas de todos los paquetes de compuestos, normalizadas, con sus problemas. */
function compuestosDePaquetes(itemTypes) {
    const salida = { compuestos: [], paquetes: [], problemas: [] };
    leerPaquetes(PATHS.compuestosFile).forEach((paquete) => {
        if (!paquete.datos) {
            salida.problemas.push(paquete.error);
            return;
        }
        const { data, problemas } = Compuestos.normalizarCompuestos(paquete.datos, itemTypes);
        salida.paquetes.push({ archivo: paquete.archivo, compuestos: data.compuestos.length });
        problemas.forEach((p) => salida.problemas.push(paquete.archivo + ': ' + p));
        data.compuestos.forEach((t) => salida.compuestos.push(Object.assign({ paquete: paquete.archivo }, t)));
    });
    return salida;
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
 *
 * ANTES DE SOBRESCRIBIR SE HACE UNA COPIA del archivo que había, en
 * `backups/<nombre>/` (ver `lib/mapfiles.js`). Sólo si el texto nuevo es distinto del que hay:
 * pulsar «Guardar» diez veces sin tocar nada no debe empujar fuera las diez copias buenas.
 *
 * Con `options.nuevo` el archivo se CREA y no se sobrescribe: si ya existe, no se escribe nada
 * y la respuesta lo dice con `existe: true`. Es lo que usan «nuevo mapa» y «guardar como».
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

    if (opts.dryRun) {
        return { ok: true, dryRun: true, bytes: text.length, text: text };
    }

    if (opts.nuevo) {
        fs.mkdirSync(mapsDirectory(), { recursive: true });
        if (MapFiles.mapaExistente(mapsDirectory(), name) || !MapFiles.crearExclusivo(target, text)) {
            return { ok: false, existe: true, problems: ['ya existe un mapa llamado ' + name] };
        }
        return { ok: true, bytes: text.length, text: text, copia: null };
    }

    const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    const copia = actual !== null && actual !== text
        ? MapFiles.respaldar(mapsDirectory(), name) : null;

    MapFiles.escribirAtomico(target, text);

    return { ok: true, bytes: text.length, text: text, copia: copia };
}

/** Lo que el motor necesita para validar un mapa en bruto que no viene de un archivo. */
function tiposParaValidar() {
    return {
        itemTypes: loadItemTypes(),
        monsterTypes: loadMonsterTypes(),
        npcTypes: loadNpcTypes()
    };
}

/** Los errores de un informe del cargador como lista de textos. */
function erroresDelInforme(report) {
    return report.errors.map((entry) => (entry.where ? entry.where + ': ' : '') + entry.message);
}

/**
 * El `mapName` de `config.js`, el mapa con el que arranca el motor, o null. Se lee en cada
 * petición, igual que el idioma; sirve para avisar al renombrar ese mapa.
 */
function mapaDelMotor() {
    try {
        const archivo = path.join(ROOT, 'config.js');
        delete require.cache[require.resolve(archivo)];
        return require(archivo).mapName || Config.DEFAULTS.mapName || null;
    } catch (error) {
        return null;
    }
}

/**
 * Aplica a un mapa cargado lo que manda un guardado: las casillas, y las listas que vengan.
 *
 * Es el cuerpo de `POST /api/map`, sacado a una función para que «guardar como» con cambios sin
 * guardar (`POST /api/maps/<nombre>/copia` con `edits`) pase EXACTAMENTE por el mismo camino y
 * valide lo mismo: dos caminos de guardado que validan distinto acaban dejando pasar por uno lo
 * que el otro rechaza.
 *
 * @returns {{ok: true, changed: number}|{ok: false, error: string, problems: Array<string>}}
 */
function aplicarGuardado(loaded, body) {
    const applied = applyEdits(loaded.map, body.edits || [], loaded.itemTypes);
    if (applied.problems.length > 0) {
        return { ok: false, error: 'algunas ediciones no se pudieron aplicar', problems: applied.problems };
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
            return { ok: false, error: 'algunos respawns no se pudieron aplicar', problems: resultado.problems };
        }
        respawns = resultado.spawns;
    }

    if (body.npcs !== undefined) {
        const resultado = applyNpcs(loaded.map, body.npcs, loaded.npcTypes);
        if (resultado.problems.length > 0) {
            return { ok: false, error: 'algunos npc no se pudieron aplicar', problems: resultado.problems };
        }
        npcs = resultado.npcs;
    }

    if (body.composites !== undefined) {
        // Las plantillas de los paquetes (`compuestos-*.json`) también valen: se colocan igual.
        const plantillas = Compuestos.normalizarCompuestos(leerCompuestos()).data.compuestos
            .concat(compuestosDePaquetes().compuestos);
        const resultado = applyComposites(loaded.map, body.composites, plantillas);
        if (resultado.problems.length > 0) {
            return {
                ok: false,
                error: 'algunos objetos compuestos no se pudieron aplicar',
                problems: resultado.problems
            };
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

    return { ok: true, changed: applied.changed };
}

// ---------------------------------------------------------------------------
// Archivos de mapa: nuevo, guardar como, propiedades y copias de seguridad
// ---------------------------------------------------------------------------
//
// Cada operación devuelve `{status, payload}` en vez de escribir la respuesta: así se leen de
// arriba abajo como la regla que son, y el enrutado de `handleApi` se queda en una línea.

const LARGO_MAXIMO_DESCRIPCION = 2000;

/** Un error con su lista de problemas, que es la forma de todos los errores del API. */
function fallo(status, error, problems) {
    return { status: status, payload: { error: error, problems: problems || [error] } };
}

/** La descripción de un mapa: la clave de documentación `_descripcion`, si la tiene. */
function problemaDeDescripcion(valor) {
    if (typeof valor !== 'string') {
        return 'la descripcion tiene que ser un texto';
    }
    if (valor.length > LARGO_MAXIMO_DESCRIPCION) {
        return 'la descripcion pasa de ' + LARGO_MAXIMO_DESCRIPCION + ' letras';
    }
    return null;
}

/**
 * Las propiedades de un mapa cargado, como las enseña el diálogo de propiedades.
 *
 * LA DESCRIPCIÓN VA EN `_descripcion`, una clave de documentación: el formato no tiene campo de
 * descripción, el motor no la necesita, y las claves que empiezan por `_` ya se conservan en
 * cada guardado (ver `documentationKeys`). Así no hace falta tocar el formato para tenerla.
 */
function propiedadesDe(nombre, loaded) {
    const suelos = {};
    loaded.map.defaultGround.forEach((item, z) => {
        suelos[z] = item.typeId;
    });

    return {
        nombre: nombre,
        descripcion: typeof loaded.extras._descripcion === 'string' ? loaded.extras._descripcion : '',
        ancho: loaded.map.width,
        alto: loaded.map.height,
        plantas: loaded.map.floors,
        suelos: suelos,
        sueloDeRespaldo: loaded.map.fallbackGround ? loaded.map.fallbackGround.typeId : null,
        limites: {
            tamanoMinimo: MapFiles.TAMANO_MINIMO,
            tamanoMaximo: MapFiles.TAMANO_MAXIMO,
            plantasMaximo: MapFiles.PLANTAS_MAXIMO
        }
    };
}

/**
 * NUEVO MAPA: crea `data/world/<nombre>.map.json` con lo mínimo para que el motor lo arranque.
 *
 * Se valida en este orden, y cada paso con su estado: el nombre y el tamaño (400, la petición
 * está mal), que no exista ya (409), el suelo (422, no existe o no es suelo) y, por último, lo que
 * se valida en todo guardado: que el CARGADOR DEL MOTOR lo acepte y que la ida y vuelta cuadre.
 * El mapa nuevo no se escribe a mano: pasa por el mismo escritor que un mapa editado.
 */
function crearMapa(body) {
    const validado = MapFiles.validarNombreNuevo(body.nombre);
    if (validado.error) {
        return fallo(400, validado.error);
    }
    const nombre = validado.nombre;

    const plantas = body.plantas === undefined || body.plantas === null || body.plantas === ''
        ? MapFiles.PLANTAS_POR_DEFECTO : body.plantas;
    const mal = [
        MapFiles.problemaDeTamano(body.ancho, 'ancho'),
        MapFiles.problemaDeTamano(body.alto, 'alto'),
        // Al menos hasta la superficie: el templo va en la planta 7.
        MapFiles.problemaDePlantas(plantas, MapFiles.PLANTA_SUPERFICIE + 1)
    ].filter(Boolean);
    if (body.descripcion !== undefined && body.descripcion !== null) {
        const problema = problemaDeDescripcion(body.descripcion);
        if (problema) {
            mal.push(problema);
        }
    }
    if (mal.length > 0) {
        return fallo(400, 'el mapa nuevo no es valido', mal);
    }

    const existente = MapFiles.mapaExistente(mapsDirectory(), nombre);
    if (existente) {
        return fallo(409, 'ya existe un mapa llamado ' + existente);
    }

    const tipos = tiposParaValidar();
    const suelos = [MapFiles.problemaDeSuelo(tipos.itemTypes, body.sueloPorDefecto, 'el suelo por defecto', true)];
    const conRespaldo = body.sueloDeRespaldo !== undefined && body.sueloDeRespaldo !== null &&
        body.sueloDeRespaldo !== '';
    if (conRespaldo) {
        suelos.push(MapFiles.problemaDeSuelo(tipos.itemTypes, body.sueloDeRespaldo, 'el suelo de respaldo', false));
    }
    if (suelos.some(Boolean)) {
        return fallo(422, 'el suelo del mapa no es valido', suelos.filter(Boolean));
    }

    const raw = MapFiles.mapaMinimo({
        nombre: nombre,
        ancho: Number(body.ancho),
        alto: Number(body.alto),
        plantas: Number(plantas),
        suelo: Number(body.sueloPorDefecto),
        respaldo: conRespaldo ? Number(body.sueloDeRespaldo) : null,
        descripcion: body.descripcion ? String(body.descripcion) : '',
        ciudad: body.ciudad
    });

    const construido = MapLoader.buildMap(raw, tipos);
    if (!construido.report.ok) {
        return fallo(422, 'el mapa nuevo no se puede cargar', erroresDelInforme(construido.report));
    }

    const loaded = Object.assign({ name: nombre, raw: raw, map: construido.map,
        extras: documentationKeys(raw) }, tipos);
    const written = writeMap(nombre, loaded, { nuevo: true, dryRun: body.dryRun === true });
    if (!written.ok) {
        return written.existe
            ? fallo(409, 'ya existe un mapa llamado ' + nombre)
            : fallo(422, 'el mapa no se pudo guardar: no se puede volver a leer', written.problems);
    }

    return {
        status: 201,
        payload: {
            ok: true,
            nombre: nombre,
            dryRun: written.dryRun === true,
            bytes: written.bytes,
            propiedades: propiedadesDe(nombre, loaded),
            stats: construido.map.stats()
        }
    };
}

/** ¿Trae el cuerpo de un «guardar como» cambios sin guardar? */
function traeCambios(body) {
    return ['edits', 'spawns', 'npcs', 'composites', 'waypoints', 'towns', 'houses']
        .some((clave) => body[clave] !== undefined);
}

/**
 * GUARDAR COMO: escribe el mapa `origen` con otro nombre, SIN TOCAR EL ORIGINAL.
 *
 * Si el cuerpo trae cambios sin guardar (los mismos campos que `POST /api/map`), se aplican a la
 * copia y sólo a la copia, por el mismo camino y con la misma validación que un guardado. Sin
 * cambios, es una copia del archivo guardado. En los dos casos el archivo nuevo sale del escritor
 * —con su `name` nuevo y la ida y vuelta comprobada— y NUNCA pisa un mapa que ya exista.
 */
function copiarMapa(origen, body) {
    const nombreOrigen = safeMapName(origen);
    if (!nombreOrigen) {
        return fallo(400, 'nombre de mapa invalido');
    }
    const validado = MapFiles.validarNombreNuevo(body.nuevoNombre);
    if (validado.error) {
        return fallo(400, validado.error);
    }
    const nuevo = validado.nombre;

    const existente = MapFiles.mapaExistente(mapsDirectory(), nuevo);
    if (existente) {
        return fallo(409, 'ya existe un mapa llamado ' + existente);
    }

    const loaded = readMap(nombreOrigen);
    if (!loaded) {
        return fallo(404, 'no existe el mapa ' + nombreOrigen);
    }
    if (loaded.error) {
        return { status: 422, payload: loaded };
    }

    let changed = 0;
    if (traeCambios(body)) {
        const aplicado = aplicarGuardado(loaded, body);
        if (!aplicado.ok) {
            return fallo(422, aplicado.error, aplicado.problems);
        }
        changed = aplicado.changed;
    }

    const written = writeMap(nuevo, loaded, { nuevo: true, dryRun: body.dryRun === true });
    if (!written.ok) {
        return written.existe
            ? fallo(409, 'ya existe un mapa llamado ' + nuevo)
            : fallo(422, 'el mapa no se pudo guardar: no se puede volver a leer', written.problems);
    }

    return {
        status: 201,
        payload: {
            ok: true,
            nombre: nuevo,
            origen: nombreOrigen,
            changed: changed,
            dryRun: written.dryRun === true,
            bytes: written.bytes,
            stats: loaded.map.stats()
        }
    };
}

// ---------------------------------------------------------------------------
// Importar OTBM (docs/MAPAS.md §5)
// ---------------------------------------------------------------------------

/** Lo más grande que se deja subir: un mapa de Tibia entero pasa de sobra de los 4 MB del JSON. */
const MAX_SUBIDA_BYTES = 128 * 1024 * 1024;

/** Las extensiones que se aceptan, al subir y al leer una ruta: lo que importa un mapa y nada más. */
const EXTENSIONES_DE_IMPORTACION = ['.otbm', '.otb', '.xml'];

/**
 * SUBIR UN ARCHIVO para importarlo: el cuerpo de la petición son los bytes tal cual (no JSON, que
 * no cabe en los 4 MB de `readBody` ni conviene pasar a base64). Se escribe en una carpeta
 * temporal, fuera del repositorio, y se devuelve su ruta para pasársela a la importación.
 */
function subirArchivo(request, nombreOriginal) {
    return new Promise((resolve) => {
        const base = path.basename(String(nombreOriginal || 'archivo')).replace(/[^a-zA-Z0-9._-]/g, '_');
        const extension = path.extname(base).toLowerCase();
        if (!EXTENSIONES_DE_IMPORTACION.includes(extension)) {
            request.resume();
            resolve(fallo(400, 'solo se suben archivos ' + EXTENSIONES_DE_IMPORTACION.join(', ') + ': ' + base));
            return;
        }
        fs.mkdirSync(PATHS.subidasDir, { recursive: true });
        const destino = path.join(PATHS.subidasDir, Date.now().toString(36) + '-' +
            Math.random().toString(36).slice(2, 8) + '-' + base);
        const salida = fs.createWriteStream(destino);
        let bytes = 0;
        let demasiado = false;
        request.on('data', (trozo) => {
            bytes += trozo.length;
            if (bytes > MAX_SUBIDA_BYTES) {
                demasiado = true;
                return;
            }
            salida.write(trozo);
        });
        request.on('end', () => {
            salida.end(() => {
                if (demasiado) {
                    fs.rmSync(destino, { force: true });
                    resolve(fallo(413, 'el archivo pasa de ' + (MAX_SUBIDA_BYTES / 1024 / 1024) + ' MB'));
                    return;
                }
                resolve({ status: 201, payload: { ok: true, ruta: destino, bytes: bytes } });
            });
        });
        request.on('error', (error) => resolve(fallo(400, 'la subida se corto: ' + error.message)));
    });
}

/** Una ruta de archivo de la petición: tiene que existir, ser un archivo y tener su extensión. */
function rutaDeImportacion(valor, etiqueta, extensiones, obligatorio) {
    const texto = String(valor === undefined || valor === null ? '' : valor).trim();
    if (!texto) {
        return obligatorio ? { error: 'falta ' + etiqueta } : { ruta: null };
    }
    const ruta = path.resolve(ROOT, texto);
    if (!extensiones.includes(path.extname(ruta).toLowerCase())) {
        return { error: etiqueta + ' tiene que ser un archivo ' + extensiones.join(' o ') + ': ' + texto };
    }
    if (!fs.existsSync(ruta) || !fs.statSync(ruta).isFile()) {
        return { error: 'no existe ' + etiqueta + ': ' + texto };
    }
    return { ruta: ruta };
}

/**
 * Las fuentes de la importación (items.otb y items.xml de Tibia, el catálogo de Jetyum y la tabla)
 * tardan un par de segundos en leerse: se guardan las últimas, y se reutilizan mientras ninguno de
 * los archivos cambie. Así «Analizar» e «Importar» seguidos no leen todo dos veces.
 */
let fuentesDeImportacion = null;

function fuentesParaImportar(rutas) {
    const firma = [rutas.itemsOtb, rutas.itemsXml, rutas.materiales, PATHS.equivalenciasFile, PATHS.itemsFile,
        PATHS.pincelesFile]
        .map((ruta) => (ruta && fs.existsSync(ruta) ? ruta + '@' + fs.statSync(ruta).mtimeMs : '-')).join('|');
    if (!fuentesDeImportacion || fuentesDeImportacion.firma !== firma) {
        fuentesDeImportacion = {
            firma: firma,
            fuentes: ConvertirOtbm.cargarFuentes({
                itemsOtb: rutas.itemsOtb, itemsXml: rutas.itemsXml, materiales: rutas.materiales,
                equivalencias: PATHS.equivalenciasFile, itemsJetyum: PATHS.itemsFile, pinceles: PATHS.pincelesFile,
                things: path.join(PATHS.assetsDir, 'things.json')
            })
        };
    }
    return fuentesDeImportacion.fuentes;
}

/**
 * IMPORTAR UN OTBM: lee el `.otbm` (con su items.otb y su items.xml, y opcionalmente su house.xml,
 * su spawn.xml y los materiales de RME), lo convierte con `lib/convertirotbm.js` y CREA un mapa
 * nuevo en `data/world/` por el mismo camino que «Nuevo mapa»: validado por el cargador del motor,
 * con la ida y vuelta comprobada, y sin pisar ningún mapa que exista.
 *
 * Los archivos se dan por RUTA en el servidor (las que devuelve `POST /api/subidas`, o cualquiera
 * del disco: la herramienta es local). Con `dryRun` no escribe nada y solo devuelve el informe:
 * es el «Analizar» del diálogo, para elegir el área antes de importar.
 */
function importarOtbmAlEditor(body) {
    const tieneNombre = body.nombre !== undefined && body.nombre !== null && String(body.nombre).trim() !== '';
    const validado = tieneNombre || body.dryRun !== true ? MapFiles.validarNombreNuevo(body.nombre) : { nombre: 'analisis' };
    if (validado.error) {
        return fallo(400, validado.error);
    }
    const nombre = validado.nombre;

    const rutas = {};
    const problemas = [];
    [['otbm', 'el mapa .otbm', ['.otbm'], true], ['itemsOtb', 'el items.otb', ['.otb'], true],
        ['itemsXml', 'el items.xml', ['.xml'], false], ['casas', 'el house.xml', ['.xml'], false],
        ['spawns', 'el spawn.xml', ['.xml'], false], ['materiales', 'el materials.xml', ['.xml'], false]]
        .forEach(([clave, etiqueta, extensiones, obligatorio]) => {
            const r = rutaDeImportacion(body[clave], etiqueta, extensiones, obligatorio);
            if (r.error) {
                problemas.push(r.error);
            } else {
                rutas[clave] = r.ruta;
            }
        });
    let area = null;
    try {
        area = ConvertirOtbm.leerArea(body.area);
    } catch (error) {
        problemas.push(error.message);
    }
    if (problemas.length > 0) {
        return fallo(400, 'la importacion no es valida', problemas);
    }
    if (body.dryRun !== true) {
        const existente = MapFiles.mapaExistente(mapsDirectory(), nombre);
        if (existente) {
            return fallo(409, 'ya existe un mapa llamado ' + existente);
        }
    }

    let fuentes;
    try {
        fuentes = fuentesParaImportar(rutas);
    } catch (error) {
        return fallo(422, 'no se pudieron leer los archivos de items: ' + error.message);
    }
    const tipos = tiposParaValidar();
    let resultado;
    try {
        resultado = ConvertirOtbm.importar({
            otbm: rutas.otbm, fuentes: fuentes, nombre: nombre, area: area, desplazar: body.desplazar !== false,
            casas: rutas.casas, spawns: rutas.spawns, monsterTypes: tipos.monsterTypes, npcTypes: tipos.npcTypes
        });
    } catch (error) {
        return fallo(422, 'el .otbm no se pudo leer: ' + error.message);
    }
    const informe = resultado.informe;
    if (!resultado.map || !informe.carga.ok) {
        return { status: 422, payload: { error: 'el mapa importado no carga en el motor', problems: informe.carga.errores,
            informe: informe } };
    }
    if (body.dryRun === true) {
        return { status: 200, payload: { ok: true, dryRun: true, nombre: nombre, informe: informe } };
    }

    const loaded = Object.assign({ name: nombre, raw: resultado.raw, map: resultado.map,
        extras: documentationKeys(resultado.raw) }, tipos);
    const written = writeMap(nombre, loaded, { nuevo: true });
    if (!written.ok) {
        return written.existe
            ? fallo(409, 'ya existe un mapa llamado ' + nombre)
            : fallo(422, 'el mapa no se pudo guardar: no se puede volver a leer', written.problems);
    }
    return { status: 201, payload: { ok: true, nombre: nombre, bytes: written.bytes, informe: informe,
        stats: resultado.map.stats() } };
}

/**
 * CAMBIAR LAS PROPIEDADES de un mapa: nombre, descripción, tamaño, plantas y suelos.
 *
 * Todo es opcional; lo que no viene, se queda como está. `suelos` es PARCIAL: `{"8": 104}` pone
 * el suelo de la planta 8 y deja las demás, y `{"8": null}` se lo quita.
 *
 * ENCOGER NUNCA BORRA. Si con el tamaño nuevo quedaría fuera alguna casilla escrita, respawn,
 * monstruo, NPC, waypoint, templo, salida de casa, objeto compuesto o suelo de planta, se responde
 * 422 con la lista de lo que se perdería y no se toca nada: quien edita decide qué hacer con ello
 * antes de encoger.
 *
 * CAMBIAR UN SUELO POR DEFECTO SÓLO CAMBIA EL TERRENO SIN PINTAR. Las casillas escritas que
 * usaban el suelo de su planta se quedan con el que tenían: cambiar el fondo de un mapa no debe
 * convertir en piedra la hierba de debajo de cada muro.
 *
 * Y CAMBIAR EL NOMBRE es renombrar el archivo: se crea el nuevo (sin pisar otro), se hace copia
 * del viejo, sus copias se mudan a la carpeta del nombre nuevo y el viejo se borra.
 */
function actualizarPropiedades(nombreActual, body) {
    const nombre = safeMapName(nombreActual);
    if (!nombre) {
        return fallo(400, 'nombre de mapa invalido');
    }

    const loaded = readMap(nombre);
    if (!loaded) {
        return fallo(404, 'no existe el mapa ' + nombre);
    }
    if (loaded.error) {
        return { status: 422, payload: loaded };
    }

    const antes = propiedadesDe(nombre, loaded);
    const cambios = [];
    const mal = [];

    // --- El nombre ---
    let nuevoNombre = nombre;
    if (body.nombre !== undefined && body.nombre !== null && String(body.nombre).trim() !== nombre) {
        const validado = MapFiles.validarNombreNuevo(body.nombre);
        if (validado.error) {
            return fallo(400, validado.error);
        }
        const existente = MapFiles.mapaExistente(mapsDirectory(), validado.nombre);
        if (existente) {
            return fallo(409, 'ya existe un mapa llamado ' + existente);
        }
        nuevoNombre = validado.nombre;
        cambios.push('nombre');
    }

    // --- El tamaño ---
    const medida = (clave, etiqueta, problema) => {
        if (body[clave] === undefined || body[clave] === null || Number(body[clave]) === antes[clave]) {
            return antes[clave];
        }
        const texto = problema(body[clave], etiqueta);
        if (texto) {
            mal.push(texto);
            return antes[clave];
        }
        cambios.push(clave);
        return Number(body[clave]);
    };
    const ancho = medida('ancho', 'ancho', MapFiles.problemaDeTamano);
    const alto = medida('alto', 'alto', MapFiles.problemaDeTamano);
    const plantas = medida('plantas', 'plantas', (valor) => MapFiles.problemaDePlantas(valor, 1));

    // --- La descripción ---
    const extras = Object.assign({}, loaded.extras);
    if (body.descripcion !== undefined && body.descripcion !== null && body.descripcion !== antes.descripcion) {
        const problema = problemaDeDescripcion(body.descripcion);
        if (problema) {
            mal.push(problema);
        } else {
            if (body.descripcion === '') {
                delete extras._descripcion;
            } else {
                extras._descripcion = body.descripcion;
            }
            cambios.push('descripcion');
        }
    }

    // --- Los suelos (se comprueban contra items.xml más abajo) ---
    const suelos = Object.assign({}, antes.suelos);
    const pedidos = [];
    if (body.suelos !== undefined && body.suelos !== null) {
        if (typeof body.suelos !== 'object' || Array.isArray(body.suelos)) {
            mal.push('los suelos tienen que ser un objeto con un objeto de items.xml por planta');
        } else {
            Object.keys(body.suelos).forEach((clave) => {
                const z = Number(clave);
                const valor = body.suelos[clave];
                if (!Number.isInteger(z) || z < 0 || z >= MapFiles.PLANTAS_MAXIMO) {
                    mal.push('la planta ' + JSON.stringify(clave) + ' no existe');
                    return;
                }
                const quitar = valor === null || valor === '' || valor === 0;
                if (quitar ? suelos[z] === undefined : Number(valor) === suelos[z]) {
                    return;
                }
                if (quitar) {
                    delete suelos[z];
                } else {
                    suelos[z] = Number(valor);
                    pedidos.push(['el suelo de la planta ' + z, valor]);
                }
                if (cambios.indexOf('suelos') === -1) {
                    cambios.push('suelos');
                }
            });
        }
    }

    let respaldo = antes.sueloDeRespaldo;
    if (body.sueloDeRespaldo !== undefined) {
        const quitar = body.sueloDeRespaldo === null || body.sueloDeRespaldo === '' || body.sueloDeRespaldo === 0;
        const nuevo = quitar ? null : Number(body.sueloDeRespaldo);
        if (nuevo !== respaldo) {
            respaldo = nuevo;
            if (!quitar) {
                pedidos.push(['el suelo de respaldo', body.sueloDeRespaldo]);
            }
            cambios.push('sueloDeRespaldo');
        }
    }

    if (mal.length > 0) {
        return fallo(400, 'las propiedades del mapa no son validas', mal);
    }

    const problemasDeSuelo = pedidos
        .map(([etiqueta, valor]) => MapFiles.problemaDeSuelo(loaded.itemTypes, valor, etiqueta, false))
        .filter(Boolean);
    if (problemasDeSuelo.length > 0) {
        return fallo(422, 'el suelo del mapa no es valido', problemasDeSuelo);
    }

    if (cambios.length === 0) {
        return { status: 200, payload: { ok: true, nombre: nombre, cambios: [], copia: null,
            propiedades: antes, stats: loaded.map.stats() } };
    }

    // --- El mapa con las propiedades nuevas, en la forma del archivo ---
    const data = MapWriter.serializeMap(loaded.map, { name: nuevoNombre });

    if (cambios.indexOf('suelos') !== -1 || cambios.indexOf('sueloDeRespaldo') !== -1) {
        // Las casillas escritas sin `ground` usaban el suelo de su planta: se les escribe el que
        // tenían, para que el cambio sólo alcance al terreno sin pintar.
        data.tiles.forEach((tile) => {
            if (tile.ground === undefined) {
                const suelo = loaded.map.groundFor(tile.z);
                if (suelo) {
                    tile.ground = suelo.typeId;
                }
            }
        });
    }

    data.width = ancho;
    data.height = alto;
    data.floors = plantas;
    data.defaultGround = suelos;
    if (respaldo === null) {
        delete data.fallbackGround;
    } else {
        data.fallbackGround = respaldo;
    }

    const fuera = MapFiles.fueraDeLimites(data, ancho, alto, plantas);
    if (fuera.total > 0) {
        return {
            status: 422,
            payload: {
                error: 'el mapa no se puede encoger: quedarian ' + fuera.total + ' cosas fuera',
                problems: fuera.problemas,
                fuera: fuera.porClase
            }
        };
    }

    const construido = MapLoader.buildMap(data, {
        itemTypes: loaded.itemTypes,
        monsterTypes: loaded.monsterTypes,
        npcTypes: loaded.npcTypes
    });
    if (!construido.report.ok) {
        return fallo(422, 'con estas propiedades el mapa no se puede cargar',
            erroresDelInforme(construido.report));
    }

    const nuevoLoaded = Object.assign({}, loaded, { name: nuevoNombre, map: construido.map, extras: extras });
    const renombrar = nuevoNombre !== nombre;
    const dryRun = body.dryRun === true;
    const written = writeMap(nuevoNombre, nuevoLoaded, { nuevo: renombrar, dryRun: dryRun });
    if (!written.ok) {
        return written.existe
            ? fallo(409, 'ya existe un mapa llamado ' + nuevoNombre)
            : fallo(422, 'el mapa no se pudo guardar: no se puede volver a leer', written.problems);
    }

    let copia = written.copia || null;
    let aviso = null;
    if (renombrar && !dryRun) {
        // El viejo se guarda en sus copias, que se mudan con él, y después se borra.
        copia = MapFiles.respaldar(mapsDirectory(), nombre);
        MapFiles.moverCopias(mapsDirectory(), nombre, nuevoNombre);
        if (copia) {
            copia = nuevoNombre + copia.slice(nombre.length);
        }
        fs.unlinkSync(mapFilePath(nombre));
        if (mapaDelMotor() === nombre) {
            aviso = 'config.js arranca el motor con el mapa ' + nombre + ': cambia mapName a ' +
                nuevoNombre + ' o el servidor no lo encontrara';
        }
    }

    return {
        status: 200,
        payload: {
            ok: true,
            nombre: nuevoNombre,
            cambios: cambios,
            dryRun: dryRun,
            copia: copia,
            aviso: aviso,
            propiedades: propiedadesDe(nuevoNombre, nuevoLoaded),
            stats: construido.map.stats()
        }
    };
}

/** Las copias de seguridad de un mapa, de la más nueva a la más vieja. */
function copiasDe(nombreMapa) {
    const nombre = safeMapName(nombreMapa);
    if (!nombre) {
        return fallo(400, 'nombre de mapa invalido');
    }
    return {
        status: 200,
        payload: {
            nombre: nombre,
            maximo: MapFiles.COPIAS_POR_MAPA,
            copias: MapFiles.listarCopias(mapsDirectory(), nombre)
        }
    };
}

/**
 * RESTAURAR una copia: el mapa vuelve a ser EXACTAMENTE ese archivo, byte a byte.
 *
 * Antes se comprueba que la copia se puede cargar CON LOS DATOS DE AHORA —un objeto que se borró
 * de items.xml después de hacerla dejaría un mapa que el motor no arranca— y se hace copia del
 * estado actual, así que restaurar también se puede deshacer restaurando la copia de antes.
 */
function restaurarCopia(nombreMapa, archivo, body) {
    const nombre = safeMapName(nombreMapa);
    if (!nombre) {
        return fallo(400, 'nombre de mapa invalido');
    }
    const ruta = MapFiles.rutaDeCopia(mapsDirectory(), nombre, archivo);
    if (!ruta) {
        return fallo(400, archivo + ' no es una copia del mapa ' + nombre);
    }
    if (!fs.existsSync(ruta)) {
        return fallo(404, 'no existe la copia ' + archivo);
    }

    const texto = fs.readFileSync(ruta, 'utf8');
    let raw;
    try {
        raw = JSON.parse(texto);
    } catch (error) {
        return fallo(422, 'la copia ' + archivo + ' no es JSON valido', [error.message]);
    }

    const construido = MapLoader.buildMap(raw, tiposParaValidar());
    if (!construido.report.ok) {
        return fallo(422, 'la copia ' + archivo + ' no se puede cargar con los datos de ahora',
            erroresDelInforme(construido.report));
    }

    if (body.dryRun === true) {
        return { status: 200, payload: { ok: true, dryRun: true, nombre: nombre, restaurada: archivo,
            copia: null, stats: construido.map.stats() } };
    }

    // El texto ya está en memoria: si al podar se borra justo la copia que se restaura (era la
    // más vieja y la lista estaba llena), no se pierde nada, porque pasa a ser el mapa.
    const destino = mapFilePath(nombre);
    const actual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : null;
    const copia = actual !== null && actual !== texto ? MapFiles.respaldar(mapsDirectory(), nombre) : null;
    fs.mkdirSync(mapsDirectory(), { recursive: true });
    MapFiles.escribirAtomico(destino, texto);

    return {
        status: 200,
        payload: { ok: true, nombre: nombre, restaurada: archivo, copia: copia, stats: construido.map.stats() }
    };
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

/** Escribe la respuesta de una operación que devolvió `{status, payload}`. */
function responder(response, resultado) {
    sendJson(response, resultado.status, resultado.payload);
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

    // --- Archivos de mapa: nuevo, guardar como, propiedades y copias de seguridad ---
    //
    // Las rutas llevan el nombre del mapa en el camino (`/api/maps/<nombre>/...`) porque actúan
    // sobre EL ARCHIVO; `/api/map` actúa sobre su contenido y lo lleva en la consulta o el cuerpo.
    if (pathname === '/api/maps' && method === 'POST') {
        responder(response, crearMapa(await readBody(request)));
        return;
    }

    // --- Importar un OTBM: subir sus archivos y crear el mapa (docs/MAPAS.md §5) ---
    if (pathname === '/api/subidas' && method === 'POST') {
        responder(response, await subirArchivo(request, queryOf('nombre')));
        return;
    }
    if (pathname === '/api/maps/importar-otbm' && method === 'POST') {
        responder(response, importarOtbmAlEditor(await readBody(request)));
        return;
    }

    const sobreArchivo = /^\/api\/maps\/([^/]+)\/(copia|propiedades|copias)(?:\/([^/]+)\/(restaurar))?$/
        .exec(pathname);
    if (sobreArchivo) {
        const [, nombreMapa, que, archivoCopia, accion] = sobreArchivo;

        if (que === 'copia' && !accion && method === 'POST') {
            responder(response, copiarMapa(nombreMapa, await readBody(request)));
            return;
        }
        if (que === 'propiedades' && !accion && method === 'GET') {
            const nombre = safeMapName(nombreMapa);
            const loaded = nombre ? readMap(nombre) : null;
            if (!nombre) {
                responder(response, fallo(400, 'nombre de mapa invalido'));
            } else if (!loaded) {
                responder(response, fallo(404, 'no existe el mapa ' + nombre));
            } else if (loaded.error) {
                sendJson(response, 422, loaded);
            } else {
                sendJson(response, 200, { propiedades: propiedadesDe(nombre, loaded), stats: loaded.map.stats() });
            }
            return;
        }
        if (que === 'propiedades' && !accion && method === 'PUT') {
            responder(response, actualizarPropiedades(nombreMapa, await readBody(request)));
            return;
        }
        if (que === 'copias' && !accion && method === 'GET') {
            responder(response, copiasDe(nombreMapa));
            return;
        }
        if (que === 'copias' && accion === 'restaurar' && method === 'POST') {
            responder(response, restaurarCopia(nombreMapa, archivoCopia, await readBody(request)));
            return;
        }
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

        const aplicado = aplicarGuardado(loaded, body);
        if (!aplicado.ok) {
            sendJson(response, 422, { error: aplicado.error, problems: aplicado.problems });
            return;
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
            changed: aplicado.changed,
            // La copia de seguridad que se hizo del archivo de antes (null si no cambió nada).
            copia: written.copia || null,
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
        const itemTypes = loadItemTypes();
        const { data, problemas } = Compuestos.normalizarCompuestos(leerCompuestos(), itemTypes);
        // `data` es SOLO `compuestos.json`, lo que la pestaña Compuestos edita y guarda; las
        // plantillas de los paquetes van aparte, para la paleta del mapa.
        const paquetes = compuestosDePaquetes(itemTypes);
        sendJson(response, 200, { data, problems: problemas, atributos: Compuestos.ATRIBUTOS_CONOCIDOS,
            paquetes: { plantillas: paquetes.compuestos, archivos: paquetes.paquetes, problems: paquetes.problemas } });
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
        const itemTypes = loadItemTypes();
        const { data, problemas } = Pinceles.normalizarPinceles(raw, itemTypes);
        // Los paquetes (`pinceles-*.json`, p. ej. los importados de RME) se suman a las listas. Sus
        // problemas van aparte: un paquete con un objeto que ya no existe no es un fallo de los
        // pinceles propios.
        const paquetes = [];
        const problemasDePaquetes = [];
        const ids = new Set(['suelos', 'bordes', 'muros', 'alfombras', 'mesas']
            .flatMap((lista) => data[lista].map((p) => lista + ':' + p.id)));
        leerPaquetes(PATHS.pincelesFile).forEach((paquete) => {
            if (!paquete.datos) {
                problemasDePaquetes.push(paquete.error);
                return;
            }
            const leido = Pinceles.normalizarPinceles(paquete.datos, itemTypes);
            leido.problemas.forEach((p) => problemasDePaquetes.push(paquete.archivo + ': ' + p));
            ['suelos', 'bordes', 'muros', 'alfombras', 'mesas'].forEach((lista) => {
                leido.data[lista].forEach((p) => {
                    if (ids.has(lista + ':' + p.id)) {
                        problemasDePaquetes.push(paquete.archivo + ': ' + p.id + ' repetido, se usa el primero');
                        return;
                    }
                    ids.add(lista + ':' + p.id);
                    data[lista].push(p);
                });
            });
            paquetes.push(paquete.archivo);
        });
        sendJson(response, 200, { data, problems: problemas, paquetes: paquetes, problemasDePaquetes: problemasDePaquetes });
        return;
    }

    // --- Estado ---
    if (pathname === '/api/status' && method === 'GET') {
        const itemTypes = loadItemTypes();
        sendJson(response, 200, {
            root: ROOT,
            idioma: idiomaPorDefecto(),
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
    aplicarGuardado,
    propiedadesDe,
    importarOtbmAlEditor,
    leerPaquetes,
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
