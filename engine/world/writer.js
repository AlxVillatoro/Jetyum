'use strict';

/**
 * El escritor de mapas: de mapa en memoria a archivo.
 *
 * Es la pieza que hace que las herramientas puedan existir. Sin ella, un editor
 * podría leer un mapa y pintarlo, pero no tendría forma de guardarlo, y el formato
 * sería de un solo sentido: se podría importar y no exportar. Un formato así obliga
 * a editar los mapas a mano para siempre.
 *
 * ESCRIBIR BIEN ES MÁS DIFÍCIL QUE LEER, y por una razón concreta: al leer, cualquier
 * cosa que falte se puede suplir con un valor por defecto. Al escribir, hay que
 * decidir qué se OMITE. Y de esa decisión depende que el formato siga cumpliendo lo
 * que promete.
 *
 * LA REGLA ES: SÓLO SE ESCRIBE LO QUE DIFIERE DEL VALOR POR DEFECTO.
 *
 *   - Un tile cuyo suelo es el de su planta y que no tiene nada más, no se escribe.
 *   - Un tile con banderas puestas, sí.
 *   - Una planta sin suelo propio no aparece en `defaultGround`.
 *
 * Es lo que hace que un mapa de 2048x2048 con un desierto en medio ocupe lo que
 * ocupa el desierto y no los 67 millones de celdas. Si el escritor volcara todos los
 * tiles, el archivo crecería hasta ser inmanejable en la primera edición, y el
 * almacenamiento disperso del motor se perdería justo al guardar.
 *
 * Y por eso la PRUEBA que acompaña a esto es de ida y vuelta: cargar un mapa,
 * escribirlo, volver a cargarlo y comprobar que son idénticos. Es la única forma de
 * saber que lo que se omite es exactamente lo que el lector sabe reconstruir.
 *
 * UNA ADVERTENCIA SOBRE LOS COMENTARIOS. El escritor produce una forma CANÓNICA: no
 * conserva comentarios ni claves que no conozca, porque un mapa guardado desde una
 * herramienta no tiene por qué arrastrar anotaciones de quien lo escribió a mano. El
 * problema es que el mapa de ejemplo SÍ tiene comentarios, y perderlos al abrirlo en
 * el editor sería perder documentación sin avisar.
 *
 * La solución no está aquí sino en quien llama: `options.extraKeys` permite pasar un
 * objeto con las claves que se quieran conservar, y la herramienta le pasa las que
 * empiezan por `_`. La POLÍTICA de qué se conserva es de la herramienta; el escritor
 * sólo obedece.
 */

const { TILE_FLAGS } = require('./tile');

/** El nombre de cada bandera, para escribir. El inverso de lo que lee el cargador. */
const FLAG_NAMES = [
    ['protectionZone', TILE_FLAGS.PROTECTION_ZONE],
    ['noPvp', TILE_FLAGS.NO_PVP],
    ['noLogout', TILE_FLAGS.NO_LOGOUT],
    ['pvpZone', TILE_FLAGS.PVP_ZONE],
    ['house', TILE_FLAGS.HOUSE]
];

/** La versión que se escribe. Tiene que ser una que el cargador acepte. */
const FORMAT_VERSION = 1;

/**
 * Los valores por defecto DEL FORMATO para un respawn: el radio y el intervalo.
 *
 * Están escritos también en el cargador (`loader.js`), y es una duplicación deliberada: el
 * escritor no debe depender del lector —`verifyRoundTrip` recibe su validador inyectado justo
 * por eso—, así que lo que los mantiene de acuerdo es la prueba de ida y vuelta, que carga
 * un respawn con el radio por defecto y comprueba que al releerlo sigue siendo el mismo. Si
 * estos números se separaran de los del cargador, esa prueba se pone en rojo.
 */
const DEFAULT_RADIUS = 1;
const DEFAULT_INTERVAL = 60000;

/** Cuántos items se escriben por línea, para que el archivo se pueda leer. */
const ITEMS_PER_LINE = 4;

/**
 * Convierte una instancia de item a la forma que se escribe.
 *
 * Se OMITEN los valores por defecto: una moneda suelta se escribe `{"id": 3031}` y no
 * `{"id": 3031, "count": 1}`. No es por ahorrar bytes, es por legibilidad: un mapa
 * escrito a mano tiene miles de items y ver `"count": 1` en todos ellos esconde los
 * pocos que de verdad tienen una cantidad.
 */
function serializeItem(item) {
    const entry = { id: item.typeId };

    if (item.count !== undefined && item.count !== 1) {
        entry.count = item.count;
    }

    if (item.attributes && Object.keys(item.attributes).length > 0) {
        entry.attributes = { ...item.attributes };
    }

    return entry;
}

/** Las banderas de un tile, por nombre. */
function serializeFlags(tile) {
    const names = [];

    FLAG_NAMES.forEach(([name, bit]) => {
        if (tile.flags & bit) {
            names.push(name);
        }
    });

    return names;
}

/**
 * ¿Es este tile idéntico al suelo por defecto de su planta?
 *
 * Si lo es, no se escribe. La comparación se hace por identificador de tipo y no por
 * identidad de objeto: dos instancias del mismo suelo son el mismo suelo.
 */
function isDefaultTile(tile, defaultGround) {
    if (tile.creatures.length > 0) {
        return false;
    }
    if (tile.downItems.length > 0 || tile.topItems.length > 0) {
        return false;
    }
    if (tile.flags !== 0 || tile.houseId !== 0) {
        return false;
    }
    if (!tile.ground) {
        return false;
    }
    if (!defaultGround) {
        // Sin suelo por defecto para esa planta, CUALQUIER suelo es una diferencia y
        // hay que escribirlo. Omitirlo lo perdería.
        return false;
    }

    return tile.ground.typeId === defaultGround.typeId;
}

/**
 * Convierte un mapa en el objeto que se guarda.
 *
 * @param {GameMap} map
 * @param {Object} [options]
 * @param {string} [options.name]
 * @param {boolean} [options.pretty] si se formatea el JSON
 * @returns {Object}
 */
function serializeMap(map, options) {
    const opts = options || {};

    // --- Suelos por defecto, sólo los que existen ---
    const defaultGround = {};
    map.defaultGround.forEach((item, z) => {
        defaultGround[z] = item.typeId;
    });

    // --- Tiles, en orden determinista ---
    // El orden importa aunque el formato no lo exija: un archivo que cambia de
    // orden entre dos guardados idénticos llena el control de versiones de ruido, y
    // entonces nadie mira los diffs de un mapa.
    const tiles = [];
    const collected = [];

    map.forEachTile((tile) => {
        collected.push(tile);
    });

    collected.sort((a, b) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x));

    collected.forEach((tile) => {
        const defaultGroundItem = map.defaultGround.get(tile.z) || map.fallbackGround;

        if (isDefaultTile(tile, defaultGroundItem)) {
            return;
        }

        const entry = { x: tile.x, y: tile.y, z: tile.z };

        // El suelo SOLO se escribe si difiere del de su planta. Es la diferencia
        // entre un mapa que ocupa lo que ocupa su contenido y uno que ocupa lo que
        // ocupa su tamaño.
        if (tile.ground &&
            (!defaultGroundItem || tile.ground.typeId !== defaultGroundItem.typeId)) {
            entry.ground = tile.ground.typeId;
        }

        const items = tile.downItems.concat(tile.topItems)
            .map(serializeItem);

        if (items.length > 0) {
            entry.items = items;
        }

        const flags = serializeFlags(tile);
        if (flags.length > 0) {
            entry.flags = flags;
        }

        // La casa a la que pertenece. Antes NO se escribía: el cargador lo leía y el
        // escritor lo perdía, así que guardar un mapa con casas las borraba.
        if (tile.houseId) {
            entry.houseId = tile.houseId;
        }

        tiles.push(entry);
    });

    // --- Waypoints ---
    const waypoints = {};
    map.waypoints.forEach((position, name) => {
        waypoints[name] = [position.x, position.y, position.z];
    });

    // --- Spawns (respawns) ---
    //
    // SE ESCRIBE LA FORMA DE TIBIA: el área con el centro y el radio, y dentro la lista de
    // monstruos, cada uno con su casilla. El cargador acepta además la forma antigua —un
    // monstruo por entrada—, pero esto es lo que se escribe, porque es la única que puede
    // representar un área con varios monstruos sin repetir el centro en cada uno.
    const spawns = (map.spawns || []).map((area) => {
        const entry = {
            x: area.x,
            y: area.y,
            z: area.z
        };

        // Los valores por defecto del cargador se omiten, igual que en los items. Tienen que
        // seguir siendo los del cargador: si allí cambiara el radio por defecto, aquí se
        // omitiría el campo equivocado y el mapa se leería con otro radio.
        if (area.radius !== undefined && area.radius !== DEFAULT_RADIUS) {
            entry.radius = area.radius;
        }
        if (area.interval !== undefined && area.interval !== DEFAULT_INTERVAL) {
            entry.interval = area.interval;
        }

        entry.monsters = (area.monsters || []).map((monster) => {
            const written = { name: monster.name };

            // LA CASILLA SE OMITE CUANDO EL MONSTRUO NO TIENE, y eso no es ahorrar bytes: un
            // monstruo sin casilla vive en cualquier punto de su respawn, que es lo que
            // significaba la forma antigua del formato. Escribirle el centro sería
            // inventarle una casilla y cambiarle el comportamiento al mapa al guardarlo.
            if (monster.x !== undefined && monster.x !== null) {
                written.x = monster.x;
                written.y = monster.y;
            }
            if (monster.interval !== undefined && monster.interval !== area.interval) {
                written.interval = monster.interval;
            }

            return written;
        });

        return entry;
    });

    // --- NPC ---
    const npcs = (map.npcPlacements || []).map((entry) => {
        const written = {
            x: entry.x,
            y: entry.y,
            z: entry.z,
            name: entry.name
        };

        // El radio de paseo sólo se escribe si el MAPA lo decidió. `null` es «manda
        // `npcs.xml`», y `0` es «aquí no se mueve»: se distinguen, y por eso no vale un `||`.
        if (entry.radius !== undefined && entry.radius !== null) {
            written.radius = entry.radius;
        }

        return written;
    });

    const data = {
        format: 'jetyum-map',
        version: FORMAT_VERSION,
        name: opts.name || map.name || 'mapa',
        width: map.width,
        height: map.height,
        floors: map.floors
    };

    // Lo que la herramienta pida conservar (normalmente los comentarios). Se
    // escribe DESPUÉS del nombre y antes del resto, para que quede arriba, que es
    // donde se lee.
    const extras = opts.extraKeys || null;

    if (Object.keys(defaultGround).length > 0) {
        data.defaultGround = defaultGround;
    }
    if (map.fallbackGround) {
        data.fallbackGround = map.fallbackGround.typeId;
    }

    data.tiles = tiles;

    if (Object.keys(waypoints).length > 0) {
        data.waypoints = waypoints;
    }
    if (spawns.length > 0) {
        data.spawns = spawns;
    }
    if (npcs.length > 0) {
        data.npcs = npcs;
    }
    if (map.towns && map.towns.length > 0) {
        data.towns = map.towns.map((t) => ({ id: t.id, name: t.name, temple: [t.temple.x, t.temple.y, t.temple.z] }));
    }
    if (map.houses && map.houses.length > 0) {
        data.houses = map.houses.map((h) => {
            const casa = { id: h.id, name: h.name, townId: h.townId, rent: h.rent };
            if (h.exit) {
                casa.exit = [h.exit.x, h.exit.y, h.exit.z];
            }
            return casa;
        });
    }
    if (map.composites && map.composites.length > 0) {
        data.composites = map.composites.map((entry) => ({
            uid: entry.uid,
            compuesto: entry.compuesto,
            x: entry.x, y: entry.y, z: entry.z,
            valores: entry.valores || {}
        }));
    }

    return data;
}

/**
 * Escribe el mapa como texto JSON.
 *
 * Se escribe a mano y no con `JSON.stringify` a secas porque un mapa es un archivo
 * que la gente va a mirar en un diff, y una lista de tiles con cada objeto en una
 * sola línea de dos mil caracteres es imposible de revisar. Los tiles van uno por
 * línea, que es lo que hace que un cambio se vea como un cambio.
 */
function writeMap(map, options) {
    const opts = options || {};
    const data = serializeMap(map, opts);

    if (opts.compact) {
        return JSON.stringify(data);
    }

    // Los extras se leen aquí TAMBIÉN, y no se reutilizan los de `serializeMap`: son
    // dos funciones distintas y dar por hecho que una ve las variables de la otra es
    // exactamente el fallo que tuvo esto la primera vez.
    const extras = opts.extraKeys || null;

    const lines = [];
    lines.push('{');
    lines.push('    "format": ' + JSON.stringify(data.format) + ',');
    lines.push('    "version": ' + data.version + ',');
    lines.push('    "name": ' + JSON.stringify(data.name) + ',');
    lines.push('    "width": ' + data.width + ',');
    lines.push('    "height": ' + data.height + ',');
    lines.push('    "floors": ' + data.floors + ',');

    if (extras) {
        Object.keys(extras).forEach((key) => {
            lines.push('    ' + JSON.stringify(key) + ': ' +
                JSON.stringify(extras[key], null, 4)
                    .split('\n')
                    .map((line, index) => (index === 0 ? line : '    ' + line))
                    .join('\n') + ',');
        });
    }

    if (data.defaultGround) {
        const entries = Object.keys(data.defaultGround)
            .sort((a, b) => Number(a) - Number(b))
            .map((z) => '        ' + JSON.stringify(z) + ': ' + data.defaultGround[z]);

        lines.push('    "defaultGround": {');
        lines.push(entries.join(',\n'));
        lines.push('    },');
    }

    if (data.fallbackGround !== undefined) {
        lines.push('    "fallbackGround": ' + data.fallbackGround + ',');
    }

    if (data.tiles.length === 0) {
        lines.push('    "tiles": [],');
    } else {
        lines.push('    "tiles": [');
        lines.push(data.tiles
            .map((tile) => '        ' + JSON.stringify(tile))
            .join(',\n'));
        lines.push('    ],');
    }

    if (data.waypoints) {
        const entries = Object.keys(data.waypoints)
            .map((name) => '        ' + JSON.stringify(name) + ': ' +
                JSON.stringify(data.waypoints[name]));

        lines.push('    "waypoints": {');
        lines.push(entries.join(',\n'));
        lines.push('    },');
    }

    if (data.spawns) {
        lines.push('    "spawns": [');
        lines.push(data.spawns
            .map((spawn) => '        ' + JSON.stringify(spawn))
            .join(',\n'));
        lines.push('    ],');
    }

    if (data.npcs) {
        lines.push('    "npcs": [');
        lines.push(data.npcs
            .map((npc) => '        ' + JSON.stringify(npc))
            .join(',\n'));
        lines.push('    ]');
    } else {
        // Se quita la coma de la última sección escrita.
        lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
    }

    ['towns', 'houses'].forEach((clave) => {
        if (data[clave]) {
            lines[lines.length - 1] += ',';
            lines.push('    "' + clave + '": [');
            lines.push(data[clave].map((entry) => '        ' + JSON.stringify(entry)).join(',\n'));
            lines.push('    ]');
        }
    });

    if (data.composites) {
        lines[lines.length - 1] += ',';
        lines.push('    "composites": [');
        lines.push(data.composites
            .map((entry) => '        ' + JSON.stringify(entry))
            .join(',\n'));
        lines.push('    ]');
    }

    lines.push('}');

    // La coma final sobra si la última sección fue `spawns` o `npcs`: se limpia aquí en
    // vez de ir arrastrando el estado de cuál fue la última.
    const text = lines.join('\n').replace(/,(\s*[}\]])/g, '$1');

    return text + '\n';
}

/**
 * Comprueba que un mapa escrito se puede volver a leer igual.
 *
 * Se expone porque es la única verificación que de verdad importa de un escritor, y
 * las herramientas la usan antes de guardar: más vale negarse a guardar que dejar un
 * archivo que el motor no va a poder cargar.
 *
 * @param {GameMap} map
 * @param {Function} buildMap el validador del cargador, que trabaja sobre el objeto
 *        ya deserializado. Se recibe inyectado y no se importa aquí para que este
 *        módulo no dependa del cargador: el escritor no tiene por qué saber leer.
 * @returns {{ok: boolean, problems: Array<string>}}
 */
function verifyRoundTrip(map, buildMap, options) {
    const problems = [];

    let text;
    try {
        text = writeMap(map, options);
    } catch (error) {
        return { ok: false, problems: ['no se pudo escribir: ' + error.message] };
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch (error) {
        return { ok: false, problems: ['el JSON escrito no es valido: ' + error.message] };
    }

    const reloaded = buildMap(data, options);
    if (!reloaded.report.ok) {
        return {
            ok: false,
            problems: reloaded.report.errors.map((error) =>
                (error.where ? error.where + ': ' : '') + error.message)
        };
    }

    const before = map.stats();
    const after = reloaded.map.stats();

    if (before.explicitTiles !== after.explicitTiles) {
        problems.push('el mapa tenia ' + before.explicitTiles +
            ' tiles explicitos y al releerlo tiene ' + after.explicitTiles);
    }
    if (before.waypoints !== after.waypoints) {
        problems.push('se perdieron waypoints: ' + before.waypoints + ' -> ' + after.waypoints);
    }
    if (before.spawnAreas !== after.spawnAreas) {
        problems.push('se perdieron respawns: ' + before.spawnAreas + ' -> ' + after.spawnAreas);
    }
    if (before.spawns !== after.spawns) {
        problems.push('se perdieron spawns: ' + before.spawns + ' -> ' + after.spawns);
    }
    // Los NPC TAMBIÉN SE COMPARAN, y no era así: el escritor los escribía y la comprobación de
    // ida y vuelta no miraba si volvían, así que un fallo que se los comiera pasaba en verde.
    // Se comparan por NOMBRE y no sólo por número: dos NPC cambiados de sitio son el mismo
    // recuento y un mapa distinto.
    ['towns', 'houses'].forEach((clave) => {
        if ((before[clave] || 0) !== (after[clave] || 0)) {
            problems.push('se perdieron ' + clave + ': ' + before[clave] + ' -> ' + after[clave]);
        }
    });
    if ((before.composites || 0) !== (after.composites || 0)) {
        problems.push('se perdieron objetos compuestos: ' + before.composites + ' -> ' + after.composites);
    }
    if (before.npcs !== after.npcs) {
        problems.push('se perdieron npcs: ' + before.npcs + ' -> ' + after.npcs);
    } else if (!sameNpcs(map, reloaded.map)) {
        problems.push('los npcs cambiaron de sitio o de nombre al releer el mapa');
    }

    return { ok: problems.length === 0, problems: problems };
}

/** ¿Están los mismos NPC, con el mismo nombre y en la misma casilla, en los dos mapas? */
function sameNpcs(before, after) {
    const firma = (map) => (map.npcPlacements || [])
        .map((entry) => entry.x + ',' + entry.y + ',' + entry.z + ',' + entry.name)
        .sort()
        .join('|');

    return firma(before) === firma(after);
}

module.exports = {
    serializeMap,
    writeMap,
    serializeItem,
    serializeFlags,
    isDefaultTile,
    verifyRoundTrip,
    FORMAT_VERSION,
    FLAG_NAMES,
    ITEMS_PER_LINE
};
