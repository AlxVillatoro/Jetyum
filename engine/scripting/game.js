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

/**
 * ÁREAS para `Game.doAreaCombat`: listas de desplazamientos `{x, y}` desde el centro. Se pueden
 * escribir como en TFS, con una matriz de cadenas donde '3' es el centro y '1' lo que se alcanza:
 *
 *     Game.area.desdeMatriz(['111', '131', '111'])     // el cuadrado de 3x3
 */
const DIRECCIONES = {
    norte: [0, -1], north: [0, -1], 0: [0, -1], este: [1, 0], east: [1, 0], 1: [1, 0],
    sur: [0, 1], south: [0, 1], 2: [0, 1], oeste: [-1, 0], west: [-1, 0], 3: [-1, 0]
};
const AREA = {
    /** Un círculo de radio r (r=1: las 8 casillas de alrededor y el centro). */
    circulo(r) {
        const lista = [];
        for (let y = -r; y <= r; y += 1) {
            for (let x = -r; x <= r; x += 1) {
                if (x * x + y * y <= r * r + r) {
                    lista.push({ x, y });
                }
            }
        }
        return lista;
    },
    /** Un cuadrado de lado 2r+1. */
    cuadrado(r) {
        const lista = [];
        for (let y = -r; y <= r; y += 1) {
            for (let x = -r; x <= r; x += 1) {
                lista.push({ x, y });
            }
        }
        return lista;
    },
    /** Un rayo recto de `largo` casillas hacia una dirección (sin el centro). */
    rayo(direccion, largo) {
        const d = DIRECCIONES[String(direccion).toLowerCase()] || [0, 1];
        const lista = [];
        for (let i = 1; i <= (largo || 5); i += 1) {
            lista.push({ x: d[0] * i, y: d[1] * i });
        }
        return lista;
    },
    /** Una onda que se abre hacia una dirección (como `exevo flam hur`): 1, 3, 3, 5 casillas... */
    onda(direccion, largo) {
        const d = DIRECCIONES[String(direccion).toLowerCase()] || [0, 1];
        const lista = [];
        for (let i = 1; i <= (largo || 4); i += 1) {
            const ancho = Math.floor((i + 1) / 2);
            for (let j = -ancho + 1; j <= ancho - 1; j += 1) {
                lista.push(d[0] !== 0 ? { x: d[0] * i, y: j } : { x: j, y: d[1] * i });
            }
        }
        return lista;
    },
    /** De una matriz de cadenas al estilo de TFS ('3' el centro, '1' alcanzado). */
    desdeMatriz(filas) {
        let cx = 0;
        let cy = 0;
        filas.forEach((fila, y) => {
            const x = String(fila).indexOf('3');
            if (x !== -1) {
                cx = x;
                cy = y;
            }
        });
        const lista = [];
        filas.forEach((fila, y) => String(fila).split('').forEach((c, x) => {
            if (c === '1' || c === '3') {
                lista.push({ x: x - cx, y: y - cy });
            }
        }));
        return lista;
    }
};

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

    /** Golpea (o cura) a una criatura con un tipo de daño. Es el corazón de los dos combates. */
    function golpear(atacante, objetivo, opciones) {
        const o = opciones || {};
        const tipo = String(o.type || 'physical').toLowerCase();
        const cantidad = azar(o.min, o.max);
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
        return world.combat.applyDamage(objetivo, Math.abs(cantidad), {
            attacker: atacante,
            element: tipo === 'physical' ? null : tipo,
            ignoreArmor: tipo !== 'physical',
            effect: o.effect === undefined ? (EFECTO_DE_ELEMENTO[tipo] || undefined) : o.effect
        });
    }

    return {
        // -------------------------------------------------------------------
        // Tiempo
        // -------------------------------------------------------------------

        /** Milisegundos del reloj del mundo (para medir duraciones). */
        now() {
            return world.now();
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
        }
    };
}

/**
 * Instala `Game` como global y devuelve una función para restaurar el estado
 * anterior. El motor la usa al arrancar y al cerrarse.
 */
function installGame(game) {
    // Con `Game` van las constantes de los efectos: `EFECTO`, `PROYECTIL` y los alias de TFS
    // (`CONST_ME_*`, `CONST_ANI_*`), para escribir `EFECTO.FUEGO` sin importar nada.
    const globales = { Game: game, EFECTO: EFECTO, PROYECTIL: PROYECTIL, ...CONST_ME, ...CONST_ANI };
    const previos = {};
    Object.keys(globales).forEach((k) => {
        previos[k] = globalThis[k];
        globalThis[k] = globales[k];
    });

    return function restore() {
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
