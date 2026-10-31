'use strict';

/**
 * `Game`: la API que los módulos de contenido usan sin tener que importar nada.
 *
 * Sobre la única global del proyecto. Todo lo demás evita globales a propósito
 * (el orden de `require` no debe importar), así que
 * conviene justificar por qué aquí sí:
 *
 *   - Es la superficie de scripting, y The Forgotten Server hace exactamente
 *     esto: un `Game` global con estas funciones. Copiarlo significa que quien
 *     sabe escribir un datapack reconoce la API.
 *   - La alternativa es que cada módulo de contenido haga
 *     `require('../../../../engine/...')`, una ruta relativa que se rompe en
 *     cuanto se mueve el archivo. Eso es peor: frágil y fea de leer.
 *   - Node permite la autorreferencia por nombre de paquete, pero obliga a
 *     declarar `exports` y a que el datapack conozca el nombre del paquete. Más
 *     ceremonia para el mismo resultado.
 *
 * Lo que la hace aceptable es que es UNA global, DELIBERADA, documentada, y que
 * el motor guarda y restaura el valor anterior al cerrarse, para no pisar a nadie.
 *
 * Nótese que aquí NO se exponen entidades del mundo: sólo funciones que devuelven
 * envoltorios (ver entities.js) o datos. Un script no puede alcanzar el estado
 * interno ni mutarlo sin pasar por la API.
 */

const { Position } = require('./entities');
const { EFECTO, PROYECTIL, CONST_ME, CONST_ANI, EFECTO_DE_ELEMENTO } = require('../../shared/js/efectos.mjs');

// Las ÁREAS (`Game.area.circulo(2)`...) están en engine/world/areas.js: las usan también los
// hechizos de los monstruos.
const { AREA } = require('../world/areas');
const Atributos = require('../world/atributos');

// Lo de TFS: las constantes (enums.js), las clases que no son criaturas ni objetos (tfs.js) y las
// funciones de 0.x con los constructores globales (compat.js).
const Enums = require('./enums');
const Tfs = require('./tfs');
const { crearCompat } = require('./compat');

function createGame(deps) {
    const world = deps.world;
    const registry = deps.registry;
    const log = deps.logger;
    const config = deps.config || {};
    const scheduler = deps.scheduler || null;

    /** La criatura de verdad detrás de un envoltorio (o de un id). */
    const real = (algo) => {
        if (!algo) {
            return null;
        }
        const id = typeof algo.getId === 'function' ? algo.getId() : (algo.id !== undefined ? algo.id : algo);
        return world.getCreature(id);
    };
    const envolver = (creature) => (creature ? registry.entities.creature(creature.id) : null);
    const azar = (min, max) => {
        const a = Math.trunc(Number(min) || 0);
        const b = Math.trunc(Number(max === undefined ? min : max) || 0);
        return Math.min(a, b) + Math.floor(Math.random() * (Math.abs(b - a) + 1));
    };
    const eventos = new Map();
    let siguienteEvento = 1;
    // Los storages globales y el récord de jugadores (`Game.getStorageValue`, `onRecord`).
    const almacenGlobal = crearAlmacenGlobal(world);

    /** Golpea (o cura) a una criatura con un tipo de daño. Es el corazón de los dos combates. */
    function golpear(atacante, objetivo, opciones) {
        const o = opciones || {};
        // El tipo, por nombre ('fire') o por COMBAT_* de TFS (COMBAT_FIREDAMAGE).
        const tipo = typeof o.type === 'number' ? (Enums.ELEMENTO_DE_COMBATE[o.type] || 'physical')
            : String(o.type || 'physical').toLowerCase();
        /*
         * LOS ATRIBUTOS de quien lanza (atributos.js): la inteligencia sube la curación y el daño
         * mágico (hechizos y runas); la fuerza, el de un hechizo físico (como «exori»).
         */
        const atributo = atacante && atacante.kind === 'player'
            ? Atributos.multiplicador(atacante, tipo === 'healing' ? 'healing' : (tipo === 'physical' ? 'physical' : 'magic'),
                world.atributosConf)
            : 1;
        const cantidad = Math.round(azar(o.min, o.max) * atributo);
        if (!objetivo || objetivo.isDead()) {
            return { hit: false, damage: 0 };
        }
        if (tipo === 'healing') {
            const curado = world.healCreature(objetivo, Math.abs(cantidad));
            world.sendMagicEffect(objetivo.position, o.effect || EFECTO.MAGIA_AZUL);
            return { hit: true, healed: curado };
        }
        if (!world.combat) {
            return { hit: false, damage: 0 };
        }
        // Las reglas del mundo valen también para los hechizos: en una zona de protección no se
        // hiere a nadie, ni a un jugador donde el PvP no está permitido (reglas.js). Curar, sí.
        const bloqueo = atacante && world.combatBlocked ? world.combatBlocked(atacante, objetivo) : null;
        if (bloqueo) {
            return { hit: false, damage: 0, reason: 'protected', block: bloqueo };
        }
        return world.combat.applyDamage(objetivo, Math.abs(cantidad), {
            attacker: atacante,
            element: tipo === 'physical' ? null : tipo,
            ignoreArmor: tipo !== 'physical',
            effect: o.effect === undefined ? (EFECTO_DE_ELEMENTO[tipo] || undefined) : o.effect
        });
    }

    const game = {
        // -------------------------------------------------------------------
        // Tiempo
        // -------------------------------------------------------------------

        /** Milisegundos del reloj del mundo (para medir duraciones). */
        now() {
            return world.now();
        },

        /** Lo que da cada punto de atributo, los puntos por nivel y el coste de reiniciar (atributos.js). */
        getAttributeConfig() {
            return JSON.parse(JSON.stringify(world.atributosConf || Atributos.normalizarConfig()));
        },

        /** La hora del día del mundo, «HH:MM» (un día dura `dayCycleMinutes` de config.js). */
        getWorldHour() {
            return world.worldHour();
        },

        /** La luz del mundo ahora: 0 (noche) a 255 (pleno día). */
        getWorldLight() {
            return world.worldLight();
        },

        /**
         * HACER ALGO MÁS TARDE, el `addEvent` de TFS: `Game.addEvent(fn, ms, ...args)`. Devuelve
         * un número para cancelarlo con `Game.stopEvent(id)`. Corre con el reloj del mundo.
         */
        addEvent(fn, ms, ...args) {
            if (typeof fn !== 'function' || !scheduler) {
                return 0;
            }
            const id = siguienteEvento++;
            const evento = scheduler.schedule(Math.max(0, Number(ms) || 0), () => {
                eventos.delete(id);
                try {
                    fn(...args);
                } catch (error) {
                    log.error('error en un addEvent: ' + (error && error.stack ? error.stack : error));
                }
            }, 'addEvent');
            eventos.set(id, evento);
            return id;
        },

        /** Cancela un `addEvent` que todavía no ha pasado. */
        stopEvent(id) {
            const evento = eventos.get(Number(id));
            eventos.delete(Number(id));
            return evento ? scheduler.cancel(evento) : false;
        },

        // -------------------------------------------------------------------
        // Quién hay
        // -------------------------------------------------------------------

        /** Los jugadores conectados (envoltorios). */
        getPlayers() {
            return Array.from(world.players.values()).map(envolver);
        },

        /**
         * Las criaturas alrededor de una casilla (en su planta): `getSpectators(pos, 7, 5)`.
         * Con `soloJugadores`, sólo jugadores.
         */
        getSpectators(position, rangoX, rangoY, soloJugadores) {
            if (!position) {
                return [];
            }
            const rx = rangoX === undefined ? 8 : Number(rangoX);
            const ry = rangoY === undefined ? 6 : Number(rangoY);
            const lista = [];
            world.creatures.forEach((c) => {
                if (c.position.z !== Number(position.z) || Math.abs(c.position.x - position.x) > rx ||
                    Math.abs(c.position.y - position.y) > ry) {
                    return;
                }
                if (soloJugadores && !(c.isPlayer && c.isPlayer())) {
                    return;
                }
                lista.push(envolver(c));
            });
            return lista;
        },

        /** Hace aparecer un NPC de `data/npc` en una casilla. Devuelve su envoltorio o null. */
        createNpc(name, x, y, z) {
            const tipos = deps.npcTypes ? deps.npcTypes() : null;
            const def = tipos ? tipos.get(String(name)) : null;
            if (!def) {
                log.warning('Game.createNpc: no hay un NPC llamado ' + name);
                return null;
            }
            const npc = world.createNpc(def, { name: def.name || name, x: Number(x), y: Number(y), z: Number(z) });
            return npc ? envolver(npc) : null;
        },

        // -------------------------------------------------------------------
        // Efectos
        // -------------------------------------------------------------------

        /** Un efecto sobre una casilla: `Game.sendMagicEffect(pos, EFECTO.FUEGO)`. */
        sendMagicEffect(position, efecto) {
            return world.sendMagicEffect(position, efecto);
        },

        /** Un proyectil que vuela: `Game.sendDistanceEffect(desde, hasta, PROYECTIL.FLECHA)`. */
        sendDistanceEffect(desde, hasta, proyectil) {
            return world.sendDistanceEffect(desde, hasta, proyectil);
        },

        /** Un número que sube sobre una casilla (como el daño): `Game.sendAnimatedText(pos, '+5', 'cura')`. */
        sendAnimatedText(position, texto, tipo) {
            const n = Number(texto);
            world.emit('onHealthChange', { position: position }, Number.isFinite(n) && n !== 0
                ? n : (tipo === 'cura' ? 1 : -1));
            return true;
        },

        // -------------------------------------------------------------------
        // Combate
        // -------------------------------------------------------------------

        /** Las áreas para `doAreaCombat`: `Game.area.circulo(2)`, `onda('norte', 4)`... */
        area: AREA,

        /**
         * GOLPEA (o cura) a UNA criatura: el `doTargetCombat` de TFS.
         *
         *     Game.doTargetCombat(player, target, { type: 'fire', min: 10, max: 30,
         *         proyectil: PROYECTIL.FUEGO })
         *
         * `type`: physical, fire, energy, earth, ice, holy, death o healing. La magia ignora la
         * armadura; el efecto sale solo (el del elemento) salvo que se pida otro con `effect`.
         */
        doTargetCombat(atacante, objetivo, opciones) {
            const a = real(atacante);
            const t = real(objetivo);
            if (!t) {
                return { hit: false, damage: 0 };
            }
            if (opciones && opciones.proyectil && a) {
                world.sendDistanceEffect(a.position, t.position, opciones.proyectil);
            }
            return golpear(a, t, opciones);
        },

        /**
         * GOLPEA (o cura) UN ÁREA: el `doAreaCombat` de TFS. `area` es una lista de `{x, y}`
         * desde `centro` (ver `Game.area`). Cada casilla saca su efecto; cada criatura que haya
         * (menos quien lanza y los NPC) se lleva el golpe. Devuelve los golpes.
         */
        doAreaCombat(atacante, centro, area, opciones) {
            const a = real(atacante);
            const o = opciones || {};
            if (!centro || !Array.isArray(area)) {
                return [];
            }
            const efecto = o.effect === undefined
                ? (EFECTO_DE_ELEMENTO[String(o.type || 'physical').toLowerCase()] || EFECTO.GOLPE) : o.effect;
            const golpes = [];
            area.forEach((d) => {
                const pos = { x: Number(centro.x) + d.x, y: Number(centro.y) + d.y, z: Number(centro.z) };
                if (efecto) {
                    world.sendMagicEffect(pos, efecto);
                }
                const tile = world.map ? world.map.getTile(pos.x, pos.y, pos.z) : null;
                (tile ? tile.creatures.slice() : []).forEach((c) => {
                    if (c === a || c.kind === 'npc') {
                        return;
                    }
                    golpes.push({ creature: envolver(c), result: golpear(a, c, { ...o, effect: 0 }) });
                });
            });
            return golpes;
        },

        /** Pone una condición a una criatura (veneno, prisa...). Ver `player.addCondition`. */
        addCondition(criatura, condicion) {
            const c = real(criatura);
            return !!(c && world.condiciones && world.condiciones.add(c, condicion));
        },

        // -------------------------------------------------------------------
        // Mundo
        // -------------------------------------------------------------------

        // -------------------------------------------------------------------
        // Mundo
        // -------------------------------------------------------------------

        /** Segundos de juego transcurridos. */
        getWorldTime() {
            return world.getWorldTime();
        },

        /** Busca un jugador conectado por nombre. Devuelve null si no está. */
        getPlayerByName(name) {
            const wanted = String(name).toLowerCase();
            for (const player of world.players.values()) {
                if (player.name.toLowerCase() === wanted) {
                    return registry.entities.player(player.id);
                }
            }
            return null;
        },

        /** Jugadores conectados. */
        getPlayerCount() {
            return world.players.size;
        },

        // -------------------------------------------------------------------
        // Mapa
        // -------------------------------------------------------------------

        /** ¿Se puede caminar por esa celda? Devuelve false si no hay mapa. */
        isWalkable(x, y, z) {
            if (!world.map) {
                return false;
            }
            return world.map.isWalkable(Number(x), Number(y), Number(z));
        },

        /** Posición de un waypoint, o null si el mapa no lo tiene. */
        /** Los nombres de los waypoints del mapa. */
        getWaypointNames() {
            return world.map && world.map.waypoints ? Array.from(world.map.waypoints.keys ? world.map.waypoints.keys() : Object.keys(world.map.waypoints)) : [];
        },

        getWaypoint(name) {
            const position = world.map ? world.map.getWaypoint(name) : null;
            return position ? new Position(position.x, position.y, position.z) : null;
        },

        /**
         * Lo que hay apilado en una celda, de abajo arriba.
         *
         * Devuelve nombres y no entidades a propósito: es una herramienta para
         * depurar un tile, no una forma de alcanzar las instancias del mundo.
         */
        /** Los identificadores de lo que hay en una casilla: el suelo primero y luego los objetos. */
        getTileItemIds(x, y, z) {
            const tile = world.map ? world.map.getTile(Number(x), Number(y), Number(z)) : null;
            const ground = world.map ? world.map.getGround(Number(x), Number(y), Number(z)) : null;
            const ids = [];
            if (ground) {
                ids.push(ground.typeId);
            }
            if (tile) {
                tile.downItems.concat(tile.topItems).forEach((item) => ids.push(item.typeId));
            }
            return ids;
        },

        getTileStack(x, y, z) {
            const tile = world.map ? world.map.getTile(Number(x), Number(y), Number(z)) : null;
            if (!tile) {
                return [];
            }
            return tile.getStack().map((thing) =>
                (typeof thing.getName === 'function' ? thing.getName() : null) ||
                thing.name || '?');
        },

        /** Informe del mapa cargado: tamaño, chunks, tiles explícitos, spawns. */
        getMapInfo() {
            return world.map ? world.map.stats() : null;
        },

        // -------------------------------------------------------------------
        // Items
        // -------------------------------------------------------------------

        /** Nombre del TIPO de item. `Game.getItemName(3031)` -> 'gold coin'. */
        getItemName(itemId) {
            const definition = world.itemTypes.get(Number(itemId));
            return definition ? definition.name : null;
        },

        /** Atributo declarado en items.xml, o undefined. */
        getItemAttribute(itemId, key) {
            const definition = world.itemTypes.get(Number(itemId));
            if (!definition || !definition.attributes) {
                return undefined;
            }
            return definition.attributes[key];
        },

        /** ¿Existe ese id de item? */
        itemTypeExists(itemId) {
            return world.itemTypes.has(Number(itemId));
        },

        /**
         * Crea una instancia de item en el mundo.
         * Devuelve un envoltorio `Item`, o null si el id no existe.
         */
        createItem(itemId, count, x, y, z) {
            if (!world.itemTypes.has(Number(itemId))) {
                log.warning('Game.createItem con un id desconocido: ' + itemId);
                return null;
            }
            // Con posición, se deja en el suelo; sin ella, el objeto existe pero no está en ningún sitio.
            const posicion = x !== undefined && y !== undefined && z !== undefined
                ? { x: Number(x), y: Number(y), z: Number(z) } : null;
            const item = world.createItem(Number(itemId), count || 1, posicion);
            return item ? registry.entities.item(item.instanceId) : null;
        },

        // -------------------------------------------------------------------
        // Monstruos
        // -------------------------------------------------------------------

        getMonsterType(name) {
            return world.monsterTypes.get(name) || null;
        },

        getMonsterTypeNames() {
            return Array.from(world.monsterTypes.keys());
        },

        /** Hace aparecer un monstruo en una casilla. Devuelve su envoltorio o null. */
        createMonster(name, x, y, z) {
            const monster = world.createMonster(String(name), { x: Number(x), y: Number(y), z: Number(z) }, null);
            return monster ? registry.entities.monster(monster.id) : null;
        },

        /** Cuántas criaturas hay en una casilla (una puerta no se cierra con alguien dentro). */
        getCreatureCount(x, y, z) {
            const tile = world.map ? world.map.getTile(Number(x), Number(y), Number(z)) : null;
            return tile && tile.creatures ? tile.creatures.length : 0;
        },

        /** Un mensaje a todos los jugadores conectados (los anuncios de las raids). */
        broadcastMessage(text) {
            return deps.globalClock ? deps.globalClock.anunciar(text) : 0;
        },

        /**
         * UNA LÍNEA DEL SERVIDOR EN UN CANAL del chat (el `sendChannelMessage(channelId, type, message)`
         * de TFS): a todos los que lo tienen abierto (engine/world/canales.js). `type`: 'sistema' o
         * 'rojo', o el número de TFS (10 y 14, los rojos). Devuelve a cuántos llegó.
         */
        sendChannelMessage(channelId, type, text) {
            return world.enviarAlCanal(channelId, text, (type === 10 || type === 14 || type === 'rojo') ? 'rojo' : 'sistema');
        },

        /** Lo mismo en el canal de un gremio (`sendGuildChannelMessage` de TFS). */
        sendGuildChannelMessage(guildId, type, text) {
            return world.mensajeAlCanalDeGremio(guildId, text, (type === 10 || type === 14 || type === 'rojo') ? 'rojo' : 'sistema');
        },

        /**
         * CAMBIA EL GRUPO DE ACCESO de un personaje (data/XML/groups.js), esté dentro o no: el de
         * dentro lo nota ya, y se guarda en la base. `grupo` es el nombre (`'gamemaster'`) o el id.
         *
         * @returns {{ok: boolean, reason?: string, group?: Object}}
         */
        setPlayerGroup(nombre, grupo) {
            const def = world.groupByName(grupo);
            if (!def) {
                return { ok: false, reason: 'no existe el grupo «' + grupo + '»' };
            }
            const dentro = world.playerByName(nombre);
            const guardado = world.guardarGrupo ? world.guardarGrupo(dentro ? dentro.name : nombre, def.id) : false;
            if (!dentro && !guardado) {
                return { ok: false, reason: 'no existe ningún personaje llamado «' + nombre + '»' };
            }
            if (dentro) {
                dentro.groupId = def.id;
            }
            return { ok: true, group: { ...def } };
        },

        /** Los grupos de acceso, de menos a más poder. */
        getGroups() {
            return Array.from(world.groups.values()).sort((a, b) => a.id - b.id).map((g) => ({ ...g }));
        },

        /** Las monturas de data/XML/mounts.js. */
        getMounts() {
            return Array.from(world.mountTypes.values()).map((m) => ({ ...m }));
        },

        /**
         * CREA UN CAMPO (fuego, energía, veneno o muro mágico: un objeto con `fieldType`) en una
         * casilla, como lo deja una runa. `creador` (un envoltorio) es quien lo lanza: el daño cuenta
         * como suyo. No se crea en una zona de protección ni donde no se pueda pisar (engine/world/campos.js).
         *
         * @returns {boolean} si se creó
         */
        createField(typeId, posicion, creador) {
            return !!world.createField(typeId, posicion, real(creador));
        },

        /** Quita los campos de fuego, energía y veneno de una casilla. Devuelve cuántos. */
        removeFields(posicion) {
            return world.removeFields(posicion);
        },

        /** Lanza una raid por su nombre (`data/scripts/raids/`). */
        startRaid(name) {
            return deps.globalClock ? deps.globalClock.startRaid(name) : { ok: false, problema: 'sin reloj' };
        },

        /** Las raids registradas y las que están en marcha. */
        getRaids() {
            return {
                registradas: Array.from(registry.raids.values()).map((r) => r.name),
                enMarcha: deps.globalClock ? deps.globalClock.raidsEnMarcha() : []
            };
        },

        // -------------------------------------------------------------------
        // Diagnóstico y administración
        // -------------------------------------------------------------------

        /** Escribe en el log del servidor, no en el chat de nadie. */
        log(...args) {
            log.info('[contenido] ' + args.map((a) =>
                typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
        },

        /**
         * Recarga el contenido de data/ sin reiniciar.
         *
         * Equivale al `/reload` de TFS, y hereda sus dos límites, que conviene
         * tener presentes: NO recarga el mapa ni la configuración estática
         * (puertos, nombre del mapa). Sólo las definiciones de los módulos.
         */
        reload() {
            if (!deps.reloadContent) {
                log.warning('Game.reload no esta disponible en este motor');
                return null;
            }
            return deps.reloadContent();
        },

        /** Informe de lo que hay cargado. */
        getStats() {
            return {
                items: world.itemTypes.size,
                monsterTypes: world.monsterTypes.size,
                actions: registry.actions.size,
                movements: registry.movements.size,
                talkActions: registry.talkActions.length,
                players: world.players.size,
                map: world.map ? world.map.name : null,
                worldType: config.worldType
            };
        },

        // -------------------------------------------------------------------
        // Lo que TFS da a `Game` (las clases están en tfs.js y entities.js)
        // -------------------------------------------------------------------

        /** `Game.getTile(pos)` o `Game.getTile(x, y, z)`: la casilla (`Tile`), o null fuera del mapa. */
        getTile(a, b, c) {
            return Tfs.crearTile(world, a, b, c);
        },

        /** `Game.getTowns()`: las ciudades del mapa (`Town`). */
        getTowns() {
            return ((world.map && world.map.towns) || []).map((t) => new Tfs.TownWrapper(world, t));
        },

        /** `Game.getTown(id | nombre)` (en TFS es `Town(...)`, que también existe). */
        getTown(idONombre) {
            return Tfs.buscarCiudad(world, idONombre);
        },

        /** `Game.getHouses()`: las casas del mapa (`House`). */
        getHouses() {
            const { HouseWrapper } = require('./entities');
            return world.casas ? Array.from(world.casas.keys()).map((id) => new HouseWrapper(world, id)) : [];
        },

        /** `Game.getHouse(id)`, o null. */
        getHouse(id) {
            const { HouseWrapper } = require('./entities');
            return world.houseById && world.houseById(id) ? new HouseWrapper(world, Number(id)) : null;
        },

        /** `Game.getVocations()`: todas las vocaciones (`Vocation`). */
        getVocations() {
            return world.vocations ? Array.from(world.vocations.values()).map((v) => new Tfs.VocationWrapper(world, v)) : [];
        },

        /**
         * `Game.getStorageValue(key)`: un STORAGE GLOBAL (del servidor, no de un jugador), o null si no
         * tiene. Con base de datos se guarda (tabla `meta`) y dura entre reinicios; sin ella, vive lo
         * que viva el proceso.
         */
        getStorageValue(clave) {
            return almacenGlobal.leer(clave);
        },

        /** `Game.setStorageValue(key, value)`: se escribe en la base al momento (cambian poco). */
        setStorageValue(clave, valor) {
            return almacenGlobal.escribir(clave, valor);
        },

        /** `Game.getWorldType()`: WORLD_TYPE_NO_PVP, WORLD_TYPE_PVP o WORLD_TYPE_PVP_ENFORCED. */
        getWorldType() {
            return Enums.tipoDeMundo(world.worldType || config.worldType);
        },

        /** `Game.getGameState()`: en marcha (GAME_STATE_NORMAL); Jetyum no tiene otros estados. */
        getGameState() {
            return Enums.GAME_STATE.GAME_STATE_NORMAL;
        },

        /** `Game.getMonsterCount()`. */
        getMonsterCount() {
            return world.monsters.size;
        },

        /** `Game.getNpcCount()`. */
        getNpcCount() {
            return world.npcs ? world.npcs.size : 0;
        },

        /** `Game.getPlayersRecord()`: el máximo de jugadores a la vez (el de `onRecord`). */
        getPlayersRecord() {
            return almacenGlobal.record();
        }
    };

    // Lo que necesitan los envoltorios y los eventos de TFS (ver `engancharEventosTfs`).
    engancharEventosTfs(world, registry);

    // Las funciones de 0.x y los constructores de TFS 1.x (compat.js), para `installGame`. No se
    // enumeran: `Game` sigue siendo lo que era.
    Object.defineProperty(game, '_compat', {
        value: crearCompat({ world: world, registry: registry, game: game, config: config }),
        enumerable: false
    });
    Object.defineProperty(game, '_world', { value: world, enumerable: false });
    Object.defineProperty(game, '_almacenGlobal', { value: almacenGlobal, enumerable: false });
    return game;
}

/**
 * EL ALMACÉN DE LOS STORAGES GLOBALES (`Game.getStorageValue`, `getGlobalStorageValue`) y el récord
 * de jugadores a la vez (`onRecord`).
 *
 * Con base de datos van a la tabla `meta` (clave → JSON), que ya existe para la versión del esquema:
 * no hace falta una tabla nueva para dos filas. La base se abre DESPUÉS de crear `Game`, así que se
 * busca al usarse (`world.baseDeCasas`, la que el motor da a las casas) y se lee la primera vez que
 * está. Sin base, todo vive en memoria.
 */
function crearAlmacenGlobal(world) {
    const valores = new Map();
    let leido = false;
    let maximo = 0;

    const base = () => {
        const db = world.baseDeCasas || world.baseDeGremios || null;
        return db && db.isOpen !== false && db.db ? db.db : null;
    };
    const leerFila = (db, clave) => {
        const fila = db.prepare('SELECT value FROM meta WHERE key = ?').get(clave);
        return fila ? JSON.parse(fila.value) : null;
    };
    const escribirFila = (db, clave, valor) => {
        db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .run(clave, JSON.stringify(valor));
    };
    /** La primera vez que hay base, se trae lo guardado (lo puesto antes, en memoria, manda). */
    const cargar = () => {
        const db = leido ? null : base();
        if (!db) {
            return;
        }
        leido = true;
        try {
            const guardados = leerFila(db, 'global_storage') || {};
            Object.keys(guardados).forEach((k) => {
                if (!valores.has(k)) {
                    valores.set(k, guardados[k]);
                }
            });
            maximo = Math.max(maximo, Number(leerFila(db, 'players_record')) || 0);
        } catch (error) {
            // Una base sin la tabla (o rota) no impide jugar: se sigue en memoria.
        }
    };
    const guardar = (clave, valor) => {
        const db = base();
        if (!db) {
            return false;
        }
        try {
            escribirFila(db, clave, valor);
            return true;
        } catch (error) {
            return false;
        }
    };

    return {
        leer(clave) {
            cargar();
            const v = valores.get(String(clave));
            return v === undefined ? null : v;
        },
        escribir(clave, valor) {
            cargar();
            if (valor === undefined || valor === null) {
                valores.delete(String(clave));
            } else {
                valores.set(String(clave), typeof valor === 'number' || typeof valor === 'string' ? valor : Number(valor));
            }
            guardar('global_storage', Object.fromEntries(valores));
            return true;
        },
        record() {
            cargar();
            return maximo;
        },
        /** Si `ahora` jugadores es un récord, lo apunta y devuelve el anterior; si no, null. */
        nuevoRecord(ahora) {
            cargar();
            if (ahora <= maximo) {
                return null;
            }
            const anterior = maximo;
            maximo = ahora;
            guardar('players_record', maximo);
            return anterior;
        }
    };
}

/**
 * LOS ENGANCHES QUE NECESITAN LOS EVENTOS DE TFS. El mundo no conoce el registro (ver engine.js): se
 * le dejan funciones que el combate y las ventanas de texto llaman en su momento, y aquí se decide
 * qué scripts se enteran. Si nadie escucha un evento, el enganche no cuesta más que mirarlo.
 *
 *   - `onPrepareDeath(creature, killer)`: antes de morir; con `false` no muere (combat.js).
 *   - `onHealthChange(creature, attacker, primaryDamage, primaryType, secondaryDamage,
 *      secondaryType, origin)`: antes de quitarle vida; puede devolver el daño cambiado (combat.js).
 *   - `onManaChange(...)`: lo mismo con el maná que se le drena (combat.js).
 *   - `onTextEdit(player, item, text)`: al guardar lo escrito en un objeto; con `false` no se guarda
 *      (`player.showTextDialog`, entities.js).
 */
function engancharEventosTfs(world, registry) {
    const envolver = (c) => (c && world.getCreature(c.id) ? registry.entities.creature(c.id) : null);

    // Los envoltorios de tfs.js usan la caché del registro: `tile.getTopCreature() === player`.
    world.fabricaDeEnvoltorios = registry.entities;

    world.antesDeMorir = (creature, killer) => {
        const lista = registry.events.get('preparedeath');
        if (!lista || lista.length === 0) {
            return true;
        }
        // Durante el aviso tiene 1 de vida: así un `creature.addHealth(...)` del script (lo que hacen las
        // arenas de TFS) funciona, porque a una criatura muerta no se la cura. Si muere igual, a 0.
        creature.health = Math.max(1, creature.health);
        const salvada = !!registry.dispatchEvent('preparedeath', [envolver(creature), envolver(killer)]).blocked;
        if (!salvada) {
            creature.health = 0;
        }
        return !salvada;
    };

    /** Lo que devuelve un `onHealthChange` / `onManaChange`: un número, `[daño, tipo, ...]` o `{primaryDamage}`. */
    const danoDevuelto = (resultado, antes) => {
        if (typeof resultado === 'number' && Number.isFinite(resultado)) {
            return resultado;
        }
        if (Array.isArray(resultado) && Number.isFinite(Number(resultado[0]))) {
            return Number(resultado[0]);
        }
        if (resultado && typeof resultado === 'object' && Number.isFinite(Number(resultado.primaryDamage))) {
            return Number(resultado.primaryDamage);
        }
        return antes;
    };
    const cambio = (evento, nombre) => (creature, atacante, dano, elemento, opciones) => {
        const lista = registry.events.get(evento);
        if (!lista || lista.length === 0) {
            return dano;
        }
        const o = opciones || {};
        const origen = o.bloqueable ? Enums.ORIGIN.ORIGIN_MELEE : Enums.ORIGIN.ORIGIN_NONE;
        const tipo = Enums.COMBATE_DE_ELEMENTO[elemento || 'physical'] || Enums.COMBAT.COMBAT_PHYSICALDAMAGE;
        let actual = dano;
        lista.forEach((entry) => {
            const r = registry._invoke(entry, nombre, [envolver(creature), envolver(atacante), actual, tipo,
                0, Enums.COMBAT.COMBAT_NONE, origen]);
            if (!r.error) {
                actual = Math.max(0, Math.trunc(danoDevuelto(r.result, actual)));
            }
        });
        return actual;
    };
    world.alCambiarVida = cambio('healthchange', 'onHealthChange');
    world.alCambiarMana = cambio('manachange', 'onManaChange');

    world.eventoDeTexto = (player, item, texto) =>
        !registry.dispatchEvent('textedit', [player, item, String(texto)]).blocked;
}

/**
 * Instala `Game` como global y devuelve una función para restaurar el estado
 * anterior. El motor la usa al arrancar y al cerrarse.
 */
function installGame(game) {
    // Con `Game` van las constantes de los efectos: `EFECTO`, `PROYECTIL` y los alias de TFS
    // (`CONST_ME_*`, `CONST_ANI_*`), para escribir `EFECTO.FUEGO` sin importar nada.
    //
    // Y LO DE TFS, para que un script portado encuentre lo que espera: las constantes (`MESSAGE_*`,
    // `CONST_SLOT_*`, `CONDITION_*`... de enums.js), los constructores (`Player(...)`, `Tile(pos)`,
    // `ItemType(2400)`, `Position(x, y, z)`...) y las funciones de 0.x (`doPlayerAddItem`... de
    // compat.js). Son muchas globales, pero con nombres que sólo usa TFS, y se restauran igual.
    const globales = {
        ...Enums.ENUMS,
        ...(game._compat || {}),
        Game: game, EFECTO: EFECTO, PROYECTIL: PROYECTIL, ...CONST_ME, ...CONST_ANI
    };
    const previos = {};
    Object.keys(globales).forEach((k) => {
        previos[k] = globalThis[k];
        globalThis[k] = globales[k];
    });
    // Los métodos de TFS en `Position` (`pos.sendMagicEffect`, `pos.getTile`) usan el mundo de este motor.
    const restaurarMundo = game._world ? Tfs.activarMundo(game._world) : () => {};

    return function restore() {
        restaurarMundo();
        Object.keys(globales).forEach((k) => {
            if (previos[k] === undefined) {
                delete globalThis[k];
            } else {
                globalThis[k] = previos[k];
            }
        });
    };
}

module.exports = { createGame, installGame, AREA };
