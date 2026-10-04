'use strict';

/**
 * Gestor de vista: qué ve cada jugador y qué hay que avisarle.
 *
 * Aquí vive la regla que hace que el cliente sea un terminal: **el cliente no
 * calcula qué se ve**. No sabe de plantas, ni de alcance, ni de qué tiles existen.
 * El motor calcula el área visible de cada jugador y le manda únicamente eso. Un
 * cliente modificado no puede ver más de lo que recibe, porque lo que no llega no
 * existe para él.
 *
 * CUATRO DECISIONES QUE IMPORTAN
 *
 * 1. VISIBILIDAD DE JUEGO Y DE DIBUJO SON COSAS DISTINTAS, y al principio las
 *    confundí. La regla de Tibia («la superficie ve toda la superficie y nada del
 *    subsuelo; el subsuelo ve dos plantas arriba y dos abajo») decide quién puede
 *    VER A QUIÉN para atacar o hablar. Pero mandar ocho plantas de superficie
 *    porque la regla las permite sería ocho veces el tráfico para dibujar una
 *    sola. Así que hay dos rangos: `canSee` para las criaturas, y un rango de
 *    DIBUJO mucho más corto para los tiles. Los tiles usan la intersección, para
 *    que un jugador en la calle no reciba el plano de la mazmorra: eso sería una
 *    fuga de información, no una optimización.
 *
 * 2. Las criaturas NO van dentro del tile. Un tile se serializa con su suelo y sus
 *    items, y las criaturas se siguen aparte. Si fueran dentro, cada paso de
 *    cualquier criatura obligaría a reenviar el tile entero a todos los que lo
 *    ven. Es también lo que hace Tibia: el mapa se describe una vez y los
 *    movimientos van sueltos.
 *
 * 3. El cliente dibuja los items EN EL ORDEN EN QUE LLEGAN. La serialización usa
 *    el orden de dibujo (suelo, items de abajo, items de arriba), no el de
 *    almacenamiento, así que el cliente no necesita conocer las bandas de apilado
 *    ni `FLAG_ALWAYSONTOP`: eso es una regla del mundo y se queda en el mundo.
 *
 * 4. Los tiles se recalculan SÓLO cuando el jugador se mueve. Un tile no cambia
 *    porque una criatura pase por encima (no están dentro), así que recalcular la
 *    vista veinte veces por segundo para descubrir que nada cambió es trabajo
 *    tirado. Las criaturas sí se revisan en cada actualización, porque se mueven.
 *
 * PENDIENTE, y conviene saberlo: al moverse se recalcula el rectángulo entero
 * aunque sólo entre y salga una franja de una casilla. Con pocos jugadores no se
 * nota; a partir de decenas habrá que pasar al diff por franjas. La estructura
 * está preparada (el diff es contra lo enviado, no contra el mundo), pero la
 * optimización no está hecha.
 */

const P = require('./protocol');
const Vocacion = require('../world/vocacion');
const { SKILLS } = require('../data/definiciones');
const { experienceForLevel } = require('../world/experience');

/** Tamaño del área visible, en tiles, alrededor del jugador. */
const DEFAULT_VIEW_WIDTH = 18;
const DEFAULT_VIEW_HEIGHT = 14;

/**
 * Plantas que se envían por debajo y por encima de la actual.
 *
 * Dos abajo es lo que hace falta para que se vea el fondo de un desnivel, y una
 * arriba para que el borde de un tejado no desaparezca al pasar por debajo. El
 * número exacto hay que ajustarlo cuando exista el renderer: enviar plantas que
 * nadie dibuja es puro desperdicio.
 */
const DEFAULT_FLOORS_BELOW = 2;
const DEFAULT_FLOORS_ABOVE = 1;

function key(x, y, z) {
    return x + ',' + y + ',' + z;
}

function parseKey(k) {
    const parts = k.split(',');
    return { x: Number(parts[0]), y: Number(parts[1]), z: Number(parts[2]) };
}

class ViewManager {
    constructor(options) {
        const opts = options || {};

        this.world = opts.world;
        this.log = opts.logger || null;
        this.viewWidth = opts.viewWidth || DEFAULT_VIEW_WIDTH;
        this.viewHeight = opts.viewHeight || DEFAULT_VIEW_HEIGHT;
        // Lo que el cliente ENSEÑA (config.js `visibleTilesX/Y`); lo enviado tiene margen.
        this.visibleWidth = opts.visibleWidth || 0;
        this.visibleHeight = opts.visibleHeight || 0;
        this.floorsBelow = opts.floorsBelow === undefined ? DEFAULT_FLOORS_BELOW : opts.floorsBelow;
        this.floorsAbove = opts.floorsAbove === undefined ? DEFAULT_FLOORS_ABOVE : opts.floorsAbove;

        /**
         * Estado por jugador: lo último que se le ENVIÓ.
         *
         * Se guarda lo enviado y no lo que hay, porque el diff es contra lo que el
         * cliente cree tener. Comparar contra el mundo mandaría cambios que el
         * cliente ya tiene.
         */
        this.states = new Map();

        this.stats = { updates: 0, tileComputes: 0, tileAdds: 0, tileUpdates: 0,
            tileRemoves: 0, creatureAdds: 0, creatureMoves: 0, creatureRemoves: 0,
            creatureUpdates: 0, skipped: 0 };
    }

    addPlayer(playerId) {
        this.states.set(playerId, {
            tiles: new Map(),
            creatures: new Map(),
            z: null,
            lastX: null,
            lastY: null,
            dirty: true
        });
    }

    removePlayer(playerId) {
        this.states.delete(playerId);
    }

    /** Marca que algo del mundo cambió y hay que recalcular los tiles. */
    markDirty(playerId) {
        const state = this.states.get(playerId);
        if (state) {
            state.dirty = true;
        }
    }

    markAllDirty() {
        this.states.forEach((state) => { state.dirty = true; });
    }

    /** Las plantas que se ENVÍAN desde una posición, ya cruzadas con `canSee`. */
    visibleFloors(z) {
        const map = this.world.map;
        const floors = [];

        if (!map) {
            return floors;
        }

        const from = Math.max(0, z - this.floorsBelow);
        const to = Math.min(map.floors - 1, z + this.floorsAbove);

        for (let floor = from; floor <= to; floor += 1) {
            // La intersección con la visibilidad de JUEGO no es una optimización:
            // sin ella, un jugador en la calle recibiría el plano de la mazmorra.
            if (map.canSee(z, floor)) {
                floors.push(floor);
            }
        }

        return floors;
    }

    /**
     * Calcula los tiles visibles desde una posición.
     *
     * NO se excluye el tile que pisa el jugador. Excluirlo parecía una
     * optimización razonable («el cliente ya sabe dónde está») y era un error:
     * cuando el jugador se movía, el tile al que llegaba dejaba de estar excluido
     * y el de partida pasaba a estarlo, así que el cliente recibía un borrado del
     * suelo que estaba pisando. Además hace falta para dibujar el suelo bajo el
     * muñeco, que es justo lo que Tibia sí envía.
     *
     * @returns {Map<string, {serialized: string, data: Array}>}
     */
    computeView(center) {
        const map = this.world.map;
        const view = new Map();

        if (!map) {
            return view;
        }

        const halfWidth = Math.floor(this.viewWidth / 2);
        const halfHeight = Math.floor(this.viewHeight / 2);

        this.visibleFloors(center.z).forEach((z) => {
            for (let dy = -halfHeight; dy <= halfHeight; dy += 1) {
                for (let dx = -halfWidth; dx <= halfWidth; dx += 1) {
                    const x = center.x + dx;
                    const y = center.y + dy;

                    if (!map.inBounds(x, y, z)) {
                        continue;
                    }

                    const tile = map.getTile(x, y, z);
                    const ground = map.getGround(x, y, z);

                    // Sin suelo y sin tile es un agujero: no se envía.
                    if (!tile && !ground) {
                        continue;
                    }

                    this.stats.tileComputes += 1;

                    const data = P.describeTile(tile, ground);
                    const k = key(x, y, z);
                    view.set(k, {
                        serialized: k + '|' + data.join(','),
                        data: [x, y, z].concat(data)
                    });
                }
            }
        });

        return view;
    }

    /**
     * Las criaturas visibles desde una posición, con la regla de JUEGO.
     *
     * Se recorre la tabla de criaturas y se filtra. A la escala de este proyecto
     * es lo más simple y lo bastante rápido; con miles de criaturas haría falta un
     * índice espacial, y ese es el siguiente paso si el perfilado lo pide.
     */
    computeCreatures(center) {
        const map = this.world.map;
        const found = new Map();

        if (!map) {
            return found;
        }

        const halfWidth = Math.floor(this.viewWidth / 2);
        const halfHeight = Math.floor(this.viewHeight / 2);

        this.world.creatures.forEach((creature) => {
            const position = creature.position;

            if (!map.canSee(center.z, position.z)) {
                return;
            }
            if (Math.abs(position.x - center.x) > halfWidth ||
                Math.abs(position.y - center.y) > halfHeight) {
                return;
            }

            found.set(creature.id, creature);
        });

        return found;
    }

    /**
     * Compara lo que el jugador debería ver con lo que ya tiene y devuelve los
     * mensajes que hacen falta para ponerlo al día.
     *
     * @param {Creature} player
     * @returns {Array<Array>} mensajes listos para enviar
     */
    update(player) {
        const state = this.states.get(player.id);
        if (!state) {
            return [];
        }

        this.stats.updates += 1;

        const messages = [];
        const center = player.position;

        const moved = state.lastX !== center.x || state.lastY !== center.y;

        // --- Tiles ---
        // Sólo se recalculan si el jugador se movió o si algo del mundo cambió.
        // Un tile no cambia porque una criatura pase por encima, así que
        // recalcular veinte veces por segundo para descubrir que nada cambió es
        // trabajo tirado.
        const floorChanged = state.z !== null && state.z !== center.z;

        if (floorChanged) {
            // Sin esto habría que mandar un borrado por cada tile de la planta
            // anterior: cientos de mensajes para decir lo mismo.
            messages.push(P.message(P.SERVER.FLOOR_CHANGE, center.z));
            state.tiles.clear();
            state.creatures.clear();
        }

        if (moved || state.dirty || floorChanged || state.z === null) {
            const view = this.computeView(center);

            view.forEach((entry, k) => {
                const previous = state.tiles.get(k);

                if (previous === undefined) {
                    messages.push(P.message(P.SERVER.TILE_ADD, ...entry.data));
                    this.stats.tileAdds += 1;
                } else if (previous.serialized !== entry.serialized) {
                    messages.push(P.message(P.SERVER.TILE_UPDATE, ...entry.data));
                    this.stats.tileUpdates += 1;
                } else {
                    return;
                }

                state.tiles.set(k, entry);
            });

            state.tiles.forEach((entry, k) => {
                if (!view.has(k)) {
                    const position = parseKey(k);
                    messages.push(P.message(P.SERVER.TILE_REMOVE,
                        position.x, position.y, position.z));
                    state.tiles.delete(k);
                    this.stats.tileRemoves += 1;
                }
            });

            state.dirty = false;
        } else {
            this.stats.skipped += 1;
        }

        state.z = center.z;
        state.lastX = center.x;
        state.lastY = center.y;

        // --- Criaturas ---
        // Estas sí se revisan siempre: se mueven por su cuenta.
        const creatures = this.computeCreatures(center);

        creatures.forEach((creature, id) => {
            const serialized = P.describeCreature(creature).join(',');
            const previous = state.creatures.get(id);

            const aspecto = JSON.stringify(creature.outfit || null);
            if (previous === undefined || (previous.aspecto !== undefined && previous.aspecto !== aspecto &&
                    previous.x === creature.position.x && previous.y === creature.position.y &&
                    previous.z === creature.position.z)) {
                // Nueva, o le ha cambiado el ASPECTO: se manda entera otra vez, que es lo que lleva el
                // aspecto (la actualización corta sólo lleva la dirección y la vida).
                messages.push(P.message(P.SERVER.CREATURE_ADD,
                    ...P.describeCreature(creature)));
                this.stats.creatureAdds += 1;
            } else if (previous.x !== creature.position.x ||
                       previous.y !== creature.position.y ||
                       previous.z !== creature.position.z) {
                // La duración del paso va en el mensaje: es lo que permite al
                // cliente interpolar durante exactamente el tiempo que el motor
                // calculó, y no a un ritmo inventado por el cliente.
                messages.push(P.message(P.SERVER.CREATURE_MOVE,
                    id,
                    previous.x, previous.y, previous.z,
                    creature.position.x, creature.position.y, creature.position.z,
                    creature.direction,
                    creature.lastStepDuration || 0));
                this.stats.creatureMoves += 1;
                // El movimiento no lleva la vida: si cambió a la vez (al morir se reaparece en el
                // templo con la vida llena), se manda también. Si no, la barra se quedaba roja.
                if (previous.health !== P.healthPercent(creature)) {
                    messages.push(P.message(P.SERVER.CREATURE_UPDATE,
                        id, creature.direction, P.healthPercent(creature)));
                    this.stats.creatureUpdates += 1;
                }
            } else if (previous.serialized !== serialized) {
                messages.push(P.message(P.SERVER.CREATURE_UPDATE,
                    id, creature.direction, P.healthPercent(creature)));
                this.stats.creatureUpdates += 1;
            } else {
                return;
            }

            state.creatures.set(id, {
                serialized: serialized,
                x: creature.position.x,
                y: creature.position.y,
                z: creature.position.z,
                direction: creature.direction,
                health: P.healthPercent(creature),
                aspecto: aspecto
            });
        });

        state.creatures.forEach((entry, id) => {
            if (!creatures.has(id)) {
                messages.push(P.message(P.SERVER.CREATURE_REMOVE, id));
                state.creatures.delete(id);
                this.stats.creatureRemoves += 1;
            }
        });

        // --- Las marcas sobre el nombre: calavera (PvP) y si es de tu grupo ---
        // Se mandan sólo cuando cambian (o cuando la criatura vuelve a la vista).
        if (!state.marcas) {
            state.marcas = new Map();
        }
        creatures.forEach((creature, id) => {
            if (!(creature.isPlayer && creature.isPlayer())) {
                return;
            }
            const calavera = this.world.skullOf ? this.world.skullOf(creature) : '';
            const grupo = creature.partyLeaderId && this.world.sameParty && this.world.sameParty(player, creature)
                ? (creature.partyLeaderId === creature.id ? 'lider' : 'miembro') : '';
            const clave = calavera + '|' + grupo;
            if ((state.marcas.get(id) || '|') !== clave) {
                messages.push(P.message(P.SERVER.CREATURE_MARKS, id, calavera, grupo));
                state.marcas.set(id, clave);
            }
        });
        state.marcas.forEach((clave, id) => {
            if (!creatures.has(id)) {
                state.marcas.delete(id);
            }
        });

        // --- La luz: la del mundo (día y noche) y la que lleva el jugador ---
        if (this.world.worldLight) {
            const luzMundo = this.world.worldLight();
            if (state.luzMundo === undefined || Math.abs(state.luzMundo - luzMundo) >= 4) {
                state.luzMundo = luzMundo;
                messages.push(P.message(P.SERVER.WORLD_LIGHT, luzMundo, 215));
            }
            const luz = this.world.lightOf(player);
            if (state.luz !== luz) {
                state.luz = luz;
                messages.push(P.message(P.SERVER.PLAYER_LIGHT, luz, 215));
            }
        }

        // --- Las estadísticas del jugador ---
        // Vida, maná, almas, capacidad, skills… cambian por muchos caminos (un golpe, la
        // regeneración, subir de nivel, coger algo), así que en vez de avisar desde cada uno se
        // compara aquí con lo último que se mandó y sólo se manda si cambió.
        const stats = this.statsOf(player);
        const statsKey = JSON.stringify(stats);
        if (state.statsKey === undefined) {
            state.statsKey = statsKey;
        } else if (state.statsKey !== statsKey) {
            state.statsKey = statsKey;
            messages.push(this.statsMessage(player, stats));
        }

        return messages;
    }

    /**
     * Todo lo que el cliente enseña del jugador: la barra de vida y maná, la ventana de skills
     * (nivel, experiencia, nivel mágico, puño, maza, espada, hacha, distancia, escudo, pesca),
     * las almas, la capacidad y la stamina. Las reglas son las de su vocación (vocations.js).
     */
    statsOf(player) {
        const vocation = this.world.vocationOf ? this.world.vocationOf(player) : null;
        const actual = experienceForLevel(player.level);
        const siguiente = experienceForLevel(player.level + 1);
        const exp = player.experience || 0;
        const skills = {};
        SKILLS.forEach((nombre) => {
            const estado = (player.skills && player.skills[nombre]) || { level: 10, tries: 0 };
            skills[nombre] = {
                level: estado.level,
                percent: vocation ? Vocacion.porcentajeSkill(vocation, nombre, estado) : 0
            };
        });
        const capacidad = this.world.capacityOf ? this.world.capacityOf(player) : 0;
        return {
            health: player.health,
            maxHealth: player.maxHealth,
            mana: player.mana || 0,
            maxMana: player.maxMana || 0,
            level: player.level,
            experience: exp,
            levelPercent: siguiente > actual
                ? Math.max(0, Math.min(99, Math.floor(100 * (exp - actual) / (siguiente - actual))))
                : 0,
            nextLevelExperience: siguiente,
            vocation: player.vocation || 'None',
            vocationDescription: vocation ? vocation.description : 'none',
            sex: player.sex || 'male',
            speed: player.speed,
            soul: player.soul || 0,
            soulMax: vocation ? vocation.soulMax : 100,
            capacity: capacidad,
            free: capacidad - (this.world.weightOf ? this.world.weightOf(player) : 0),
            stamina: player.stamina === undefined ? Vocacion.STAMINA_MAX : player.stamina,
            magicLevel: player.magicLevel || 0,
            magicPercent: vocation ? Vocacion.porcentajeMagia(vocation, player) : 0,
            skills
        };
    }

    /**
     * PLAYER_STATS: los cuatro números de siempre (vida, vida máxima, nivel, experiencia) y,
     * detrás, el objeto entero de `statsOf`. Un cliente viejo lee los cuatro y no ve lo demás.
     */
    statsMessage(player, stats) {
        const s = stats || this.statsOf(player);
        return P.message(P.SERVER.PLAYER_STATS, s.health, s.maxHealth, s.level, s.experience, s);
    }

    /** Mensaje de bienvenida: los datos del jugador y su posición. */
    loginMessages(player) {
        const messages = [
            P.message(P.SERVER.HELLO, P.PROTOCOL_VERSION,
                this.world.map ? this.world.map.width : 0,
                this.world.map ? this.world.map.height : 0,
                this.world.map ? this.world.map.floors : 0,
                this.viewWidth, this.viewHeight, this.visibleWidth, this.visibleHeight),
            P.message(P.SERVER.LOGIN_OK,
                player.id, player.name,
                player.position.x, player.position.y, player.position.z,
                player.health, player.maxHealth,
                player.level, player.experience || 0,
                player.vocation || 'None')
        ];

        // El inventario va con la bienvenida: un jugador que vuelve tiene que ver lo que
        // llevaba ANTES de que pase nada, y si se mandara sólo al cambiar no lo vería
        // hasta tocar algo. Lleva también el peso, porque lo que llevas y lo que puedes
        // llevar son la misma pregunta.
        const payload = this.world.inventoryPayload(player);

        messages.push(P.message(P.SERVER.INVENTORY,
            payload.count, payload.weight, payload.capacity, ...payload.flat));

        // Y las estadísticas completas, para que la barra lateral salga llena desde el principio.
        const stats = this.statsOf(player);
        const state = this.states.get(player.id);
        if (state) {
            state.statsKey = JSON.stringify(stats);
        }
        messages.push(this.statsMessage(player, stats));

        return messages;
    }

    /** El movimiento de una criatura, para enviarlo con su duración. */
    moveMessage(creature, from, to) {
        return P.message(P.SERVER.CREATURE_MOVE,
            creature.id,
            from.x, from.y, from.z,
            to.x, to.y, to.z,
            creature.direction,
            creature.lastStepDuration || 0);
    }

    /**
     * Anota que un movimiento YA se envió por otro camino.
     *
     * Es lo que evita que el jugador reciba su propio paso dos veces: la sesión se
     * lo manda al instante (para no añadirle un tick de retraso justo donde más se
     * nota) y a continuación lo apunta aquí, de modo que el diff del siguiente
     * tick ve la posición ya actualizada y no lo repite.
     *
     * El cliente SÍ recibe su propia criatura: necesita saber que existe para
     * dibujarse y para las barras de estado.
     */
    noteMoved(creature) {
        const state = this.states.get(creature.id);
        if (!state) {
            return false;
        }

        const entry = state.creatures.get(creature.id);
        if (!entry) {
            return false;
        }

        entry.x = creature.position.x;
        entry.y = creature.position.y;
        entry.z = creature.position.z;
        entry.direction = creature.direction;
        entry.serialized = P.describeCreature(creature).join(',');
        return true;
    }

    snapshot(playerId) {
        const state = this.states.get(playerId);
        if (!state) {
            return null;
        }
        return {
            tiles: state.tiles.size,
            creatures: state.creatures.size,
            z: state.z,
            at: state.lastX + ',' + state.lastY
        };
    }
}

module.exports = {
    ViewManager,
    DEFAULT_VIEW_WIDTH,
    DEFAULT_VIEW_HEIGHT,
    DEFAULT_FLOORS_BELOW,
    DEFAULT_FLOORS_ABOVE,
    key,
    parseKey
};
