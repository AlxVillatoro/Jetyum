'use strict';

const { findPath } = require('../world/pathfinding');
const { normalizeOutfit, canUseOutfit, outfitsFor, defaultOutfitFor } = require('../world/outfit');

/**
 * Sesiones: el puente entre una conexión y una criatura del mundo.
 *
 * Una sesión es lo que hace que un mensaje del cliente se convierta en algo que el
 * motor decide. El cliente PIDE; el motor decide. Ningún mensaje del cliente
 * cambia el mundo por sí mismo.
 *
 * SOBRE EL TRANSPORTE. Esta capa no sabe qué hay debajo: recibe mensajes ya
 * deserializados por un `send` que le inyectan. Eso permite probar todo el
 * protocolo, el movimiento y la vista **sin abrir un socket**, que es lo que hace
 * que las pruebas de esta parte sean deterministas en vez de depender de la red.
 * El servidor WebSocket real es sólo un adaptador encima.
 *
 * SOBRE EL MOVIMIENTO. El jugador que camina recibe su propio mensaje de
 * movimiento al instante, pero los DEMÁS lo reciben por el diff de su vista, en el
 * siguiente tick. Son dos caminos distintos a propósito: el jugador que camina ya
 * sabe que se movió (lo pidió él), y darle la vuelta al suyo por el diff añadiría
 * un tick de retraso a los propios movimientos, que es justo donde se nota.
 */

const P = require('./protocol');
const { TALKTYPE } = require('./protocol');
const { DIRECTION } = require('../world/creature');
const { formatWeight } = require('../world/weight');

/** Cuántos contenedores del suelo (cuerpos, cajas) puede tener abiertos a la vez un jugador. */
const MAX_CONTENEDORES = 6;

/** Hasta qué distancia se ven los números de daño y curación (lo que cabe en pantalla). */
const VISTA_TEXTOS = 9;

/** Cómo se llama el jugador si no manda nombre. */
const DEFAULT_PLAYER_NAME = 'Aventurero';

/** Distancia máxima para oír a alguien que habla. */
const SAY_RADIUS = 10;

class GameSession {
    constructor(options) {
        const opts = options || {};

        this.engine = opts.engine;
        this.world = opts.world;
        this.view = opts.view;
        this.combat = opts.combat;
        this.log = opts.logger || null;

        /**
         * El gestor al que pertenece. La sesión se registra ELLA MISMA al entrar
         * al mundo, y no quien la crea: al crearla todavía no tiene jugador, así
         * que registrarla entonces la dejaría fuera de la lista para siempre, sin
         * ningún error y sin que el jugador recibiera nada.
         */
        this.manager = opts.manager || null;

        /**
         * El repositorio de personajes, o null si el motor corre sin persistencia.
         * La sesión no sabe de bases de datos: sólo le pide a éste que meta y saque
         * personajes.
         */
        this.repository = opts.repository || null;

        /** Cómo se envía al cliente. Lo inyecta el adaptador. */
        this.send = opts.send || (() => {});

        this.player = null;
        this.playerId = null;
        this.closed = false;
        this.entered = false;

        this.stats = { received: 0, sent: 0, rejected: 0, steps: 0 };
    }

    // -----------------------------------------------------------------------
    // Ciclo de vida
    // -----------------------------------------------------------------------

    /**
     * El cliente entra al mundo.
     *
     * Con persistencia, autentica y CARGA el personaje; sin ella, crea uno efímero.
     * Los dos caminos acaban en el mismo sitio, así que el resto de la sesión no
     * necesita saber cuál se usó.
     *
     * @param {Object} credentials { account, password, character }
     * @returns {{handled: boolean, reason?: string, created?: boolean}}
     */
    login(credentials) {
        if (this.entered) {
            return { handled: false, reason: 'alreadyInWorld' };
        }

        const credentials_ = credentials || {};
        let player = null;
        let created = false;

        if (this.repository && this.repository.isOpen) {
            const result = this.repository.login(credentials_);

            if (result.error) {
                // Se le dice al cliente POR QUÉ, que es lo mínimo para que pueda
                // corregir la contraseña en vez de mirar una pantalla en negro.
                this._send(P.message(P.SERVER.LOGIN_ERROR, result.error));
                this.stats.rejected += 1;
                return { handled: false, reason: 'loginFailed', error: result.error };
            }

            player = result.player;
            created = result.created;
        } else {
            // Sin base de datos: personaje efímero. Es el atajo de desarrollo, y por
            // eso se avisa en el registro: un servidor de verdad no debe correr así.
            const name = credentials_.character || credentials_.account || DEFAULT_PLAYER_NAME;
            const vocacion = this.world.vocationForNewCharacter(credentials_.vocation, false);
            if (!vocacion.ok) {
                this._send(P.message(P.SERVER.LOGIN_ERROR, vocacion.reason));
                this.stats.rejected += 1;
                return { handled: false, reason: 'loginFailed', error: vocacion.reason };
            }
            player = this.world.createPlayer(name, this._findSpawnPosition(), {
                vocation: vocacion.vocation,
                sex: credentials_.sex
            });
            player.outfit = defaultOutfitFor(player, this.world.outfitTypes);
            if (this.log) {
                this.log.warning('entra ' + player.name + ' SIN persistencia: ' +
                    'el personaje se perdera al cerrar');
            }
        }

        // Las pilas de la mochila son de 100 como mucho (un personaje guardado antes del tope).
        this.world.normalizarPilas(player);

        // El equipo cuenta desde ya (y queda apuntado lo que lleva: entrar no es ponérselo).
        this.world.recomputeEquipment(player);

        // Si en su casilla ya hay alguien (otro jugador en el templo), aparece al lado.
        const libre = this.world.freeTileNear(player.position, player);
        if (libre && (libre.x !== player.position.x || libre.y !== player.position.y)) {
            this.world.teleportCreature(player, libre);
        }

        this.player = player;
        this.playerId = player.id;
        this.entered = true;

        this.view.addPlayer(player.id);

        // El saludo y los datos del jugador, y luego el mapa: el cliente necesita
        // saber su propia posición ANTES de recibir tiles, o no sabría dónde está
        // el centro de lo que le llega.
        this.view.loginMessages(player).forEach((message) => this._send(message));

        this._flushView();

        if (this.manager) {
            this.manager.register(this);
        }

        // `onLogin` de los scripts, ya dentro y con la sesión registrada (lo que diga, le llega).
        // Si un script devuelve `false`, como en TFS, no le deja entrar.
        const evento = this.engine && this.engine.creatureEvent ? this.engine.creatureEvent('login', player) : null;
        if (evento && evento.blocked) {
            this._send(P.message(P.SERVER.LOGIN_ERROR, 'el servidor no te deja entrar ahora'));
            this.close();
            return { handled: false, reason: 'loginBlocked' };
        }

        return { handled: true, created: created };
    }

    /** Responde a CHARACTER_LIST con los personajes de la cuenta, o con el motivo si no. */
    _characterList(account, password) {
        if (this.entered) {
            return { handled: false, reason: 'alreadyInWorld' };
        }
        if (!this.repository || !this.repository.isOpen) {
            const motivo = 'este servidor no guarda cuentas (useDatabase esta apagado)';
            this._send(P.message(P.SERVER.LOGIN_ERROR, motivo));
            return { handled: false, reason: 'noDatabase', error: motivo };
        }
        const result = this.repository.charactersOf({ account: account, password: password });
        if (result.error) {
            this._send(P.message(P.SERVER.LOGIN_ERROR, result.error));
            this.stats.rejected += 1;
            return { handled: false, reason: 'loginFailed', error: result.error };
        }
        this._send(P.message(P.SERVER.CHARACTER_LIST,
            result.characters.map((c) => [c.name, c.level, c.vocation, c.online])));
        return { handled: true, characters: result.characters };
    }

    /** El nombre del personaje en el mundo, para los registros y el chat. */
    enterWorld(name) {
        return this.login({ character: name });
    }

    _findSpawnPosition() {
        const map = this.world.map;
        if (!map) {
            return { x: 0, y: 0, z: 0 };
        }

        const temple = map.getWaypoint('temple');
        if (temple && map.isWalkable(temple.x, temple.y, temple.z)) {
            return temple;
        }

        // Primer tile transitable de la planta 0, en orden: es determinista, así
        // que dos arranques dan el mismo resultado y un fallo es reproducible.
        for (let y = 0; y < map.height; y += 1) {
            for (let x = 0; x < map.width; x += 1) {
                if (map.isWalkable(x, y, 0)) {
                    return { x: x, y: y, z: 0 };
                }
            }
        }

        return { x: 0, y: 0, z: 0 };
    }

    close() {
        if (this.closed) {
            return false;
        }
        this.closed = true;

        // `onLogout` de los scripts, todavía en el mundo (por si guardan algo en un storage).
        if (this.entered && this.player && this.engine && this.engine.creatureEvent) {
            this.engine.creatureEvent('logout', this.player);
        }
        // Sale de su grupo (los demás se enteran).
        if (this.entered && this.player && this.world.partyOf && this.world.partyOf(this.player)) {
            this.world.partyLeave(this.player);
        }

        // Se GUARDA antes de sacarlo del mundo, y en ese orden: al revés, si el
        // guardado fallara el personaje ya no estaría en el mundo y lo que hubiera
        // hecho se perdería sin que nadie lo notara.
        if (this.repository && this.player) {
            try {
                this.repository.logout(this.player);
            } catch (error) {
                if (this.log) {
                    this.log.error('no se pudo guardar a ' + this.player.name +
                        ' al desconectar: ' + (error && error.message));
                }
            }
        }

        if (this.playerId !== null) {
            // El depósito ya está guardado (en `player.deposito`): sus objetos dejan el mundo.
            if (this.player && this.world.forgetDepot) {
                this.world.forgetDepot(this.player);
            }
            this.view.removePlayer(this.playerId);
            this.world.removePlayer(this.playerId);
            if (this.manager) {
                this.manager.unregister(this);
            }
        }
        return true;
    }

    // -----------------------------------------------------------------------
    // Entrada
    // -----------------------------------------------------------------------

    /**
     * Procesa un mensaje del cliente.
     *
     * Todo se valida aquí. Un cliente modificado puede mandar cualquier cosa, y la
     * única defensa es que el motor no se crea nada de lo que le llega.
     *
     * @param {Array} message [opcode, ...datos]
     */
    handle(message) {
        if (this.closed || !Array.isArray(message) || message.length === 0) {
            return { handled: false, reason: 'malformed' };
        }

        const opcode = message[0];
        this.stats.received += 1;

        if (!this.entered && opcode !== P.CLIENT.ENTER_WORLD && opcode !== P.CLIENT.LOGIN &&
            opcode !== P.CLIENT.CREATE_ACCOUNT && opcode !== P.CLIENT.CHARACTER_LIST) {
            // Hablar antes de entrar no es un error del servidor: es un cliente
            // que se adelantó. Se ignora sin más.
            this.stats.rejected += 1;
            return { handled: false, reason: 'notInWorld' };
        }

        switch (opcode) {
            case P.CLIENT.LOGIN:
                // [cuenta, contrasena, personaje]
                return this.login({
                    account: message[1],
                    password: message[2],
                    character: message[3],
                    vocation: message[4],
                    sex: message[5]
                });

            case P.CLIENT.CREATE_ACCOUNT:
                // [cuenta, contrasena, personaje, vocacion, sexo]: crea y entra.
                return this.login({
                    account: message[1],
                    password: message[2],
                    character: message[3],
                    vocation: message[4],
                    sex: message[5],
                    crear: true
                });

            case P.CLIENT.CHARACTER_LIST:
                // [cuenta, contrasena]: la lista para elegir personaje. No entra al mundo.
                return this._characterList(message[1], message[2]);

            case P.CLIENT.ENTER_WORLD:
                // Atajo sin credenciales. Sirve para un cliente que sólo quiere
                // entrar con un nombre, y el motor decide si hay persistencia.
                return this.login({ character: message[1] });

            case P.CLIENT.WALK_NORTH:
            case P.CLIENT.WALK_EAST:
            case P.CLIENT.WALK_SOUTH:
            case P.CLIENT.WALK_WEST:
            case P.CLIENT.WALK_NORTH_EAST:
            case P.CLIENT.WALK_SOUTH_EAST:
            case P.CLIENT.WALK_SOUTH_WEST:
            case P.CLIENT.WALK_NORTH_WEST:
                return this._handleWalk(opcode);

            case P.CLIENT.TURN_NORTH:
            case P.CLIENT.TURN_EAST:
            case P.CLIENT.TURN_SOUTH:
            case P.CLIENT.TURN_WEST:
                this.player.setDirection(P.TURN_DIRECTIONS[opcode]);
                this.view.markDirty(this.playerId);
                return { handled: true, action: 'turn' };

            case P.CLIENT.SAY:
                return this._handleSay(message[1]);

            case P.CLIENT.LOOK:
                return this._handleLook(message[1], message[2], message[3]);

            case P.CLIENT.PICKUP:
                return this._handlePickup(message[1], message[2], message[3]);

            case P.CLIENT.USE_ITEM:
                return this._handleUse(message[1], message[2], message[3]);

            case P.CLIENT.REQUEST_OUTFIT:
                return this._handleRequestOutfit();

            case P.CLIENT.SET_OUTFIT:
                return this._handleSetOutfit(message.slice(1));

            case P.CLIENT.DROP:
                return this._handleDrop(message[1]);

            case P.CLIENT.MOVE_ITEM:
                return this._handleMoveItem(message);

            case P.CLIENT.ATTACK:
                return this._handleAttack(message[1]);

            case P.CLIENT.WALK_TO:
                return this._handleWalkTo(message[1], message[2], message[3], message[4] === 1);

            case P.CLIENT.CONTAINER_TAKE:
                return this._handleContainerTake(message[1], message[2]);

            case P.CLIENT.CLOSE_CONTAINER:
                this._cerrarContenedor(message[1], true);
                return { handled: true, action: 'closeContainer' };

            case P.CLIENT.CANCEL_ATTACK:
                this.player.target = null;
                return { handled: true, action: 'cancelAttack' };

            case P.CLIENT.USE_INVENTORY:
                return this._handleUseInventory(message[1]);

            case P.CLIENT.USE_HOTKEY_ITEM:
                return this._handleUseHotkeyItem(message[1], message[2]);

            case P.CLIENT.USE_CONTAINER:
                return this._handleUseContainer(message[1], message[2]);

            case P.CLIENT.LOOK_ITEM:
                return this._handleLookItem(message[1], message[2], message[3]);

            case P.CLIENT.QUEST_LOG:
                return this.sendQuestLog();

            case P.CLIENT.SHOP_BUY:
                return this._handleShop('buy', message[1], message[2]);

            case P.CLIENT.SHOP_SELL:
                return this._handleShop('sell', message[1], message[2]);

            case P.CLIENT.SHOP_CLOSE:
                this.tienda = null;
                return { handled: true, action: 'shopClose' };

            case P.CLIENT.PRIVATE_MESSAGE:
                return this._handlePrivate(message[1], message[2]);

            case P.CLIENT.LOGOUT:
                this.close();
                return { handled: true, action: 'logout' };

            default:
                this.stats.rejected += 1;
                return { handled: false, reason: 'unknownOpcode', opcode: opcode };
        }
    }

    /**
     * Un paso.
     *
     * Aquí está la inversión respecto al cliente heredado, que era autoritativo:
     * el cliente pide y el MOTOR decide. Si el paso no es válido no se responde
     * nada, porque caminar contra una pared es normal y no un error que merezca un
     * mensaje.
     */
    _handleWalk(opcode) {
        // Andar a mano cancela el camino automático (el de ir a usar algo).
        this.autoCamino = null;
        const offset = P.WALK_OFFSETS[opcode];
        if (!offset) {
            return { handled: false, reason: 'badOffset' };
        }

        const from = this.player.position.copy();
        const result = this.world.moveCreature(this.player, offset);

        if (result.moved) {
            this.stats.steps += 1;
            // El mensaje del propio movimiento se manda ya, sin esperar al diff:
            // es el único caso en que un tick de retraso se notaría. Y se apunta
            // en la vista para que el diff no lo repita.
            this._send(this.view.moveMessage(this.player, from, result.to));
            this.view.noteMoved(this.player);
            this.view.markDirty(this.playerId);
            return { handled: true, action: 'walk', to: result.to, duration: result.duration };
        }

        // Aun sin moverse, girar hacia donde se intentaba es lo que hace Tibia.
        this.view.markDirty(this.playerId);
        return { handled: true, action: 'walk', moved: false, reason: result.reason };
    }

    /**
     * Alguien dice algo.
     *
     * PRIMERO SE COMPRUEBA SI ES UN COMANDO, y esto faltaba: los talkactions estaban
     * registrados, se probaban, y **el cliente no los alcanzaba nunca** porque el
     * mensaje se difundía como charla y no se despachaba. Es el fallo clásico de las
     * piezas que funcionan por separado y no están conectadas: cada mitad pasa su
     * prueba y el camino completo no existe.
     *
     * Si un talkaction consume el mensaje, NO se difunde: un comando no es una frase, y
     * verlo aparecer en el chat como si lo hubieras dicho en voz alta sería raro.
     */
    _handleSay(text) {
        if (text === undefined || text === null) {
            return { handled: false, reason: 'emptySay' };
        }

        const message = String(text).slice(0, 255);

        const command = this.engine.registry.dispatchTalkAction(message, {
            playerId: this.playerId,
            type: TALKTYPE.SAY
        });

        if (command.handled) {
            return { handled: true, action: 'command', text: message };
        }

        // El habla se difunde por cercanía, no por vista, y de eso se encarga el motor
        // al avisar del hecho de hablar: la sesión no reparte nada por su cuenta. Es lo
        // que hace que un monstruo que dice algo use el mismo camino.
        this.world.creatureSay(this.playerId, message);

        // «comerciar» (o «trade») junto a un NPC con tienda abre la VENTANA de comercio.
        if (/^\s*(comerciar|trade|tienda)\s*$/i.test(message)) {
            const npc = this._npcConTiendaCerca();
            if (npc) {
                this._abrirTienda(npc);
            }
        }

        return { handled: true, action: 'say', text: message };
    }

    /** Un mensaje privado para este jugador. */
    sendText(text) {
        return this._send(P.message(P.SERVER.TEXT, 0, String(text)));
    }

    /**
     * Avisa al cliente de que su jugador ha muerto.
     *
     * Va aparte del mensaje de texto porque son dos cosas distintas: el texto explica qué
     * ha pasado y esto le dice al cliente que puede reaccionar sin tener que interpretar
     * una frase. Un cliente que quisiera poner una pantalla de muerte no debería tener que
     * buscar la palabra "muerto" en un mensaje.
     */
    sendDeath(killerName, droppedCount) {
        return this._send(P.message(P.SERVER.PLAYER_DEATH,
            killerName || '', Number(droppedCount) || 0));
    }

    /** Mirar un tile: describe lo que hay, para depurar y para el examen. */
    _handleLook(x, y, z) {
        const map = this.world.map;
        const tile = map ? map.getTile(Number(x), Number(y), Number(z)) : null;

        const parts = [];
        const ground = map ? map.getGround(Number(x), Number(y), Number(z)) : null;
        if (ground && ground.getName()) {
            parts.push(ground.getName());
        }
        if (tile) {
            tile.downItems.concat(tile.topItems).forEach((item) => {
                const name = item.getName();
                if (name) {
                    parts.push(item.count > 1 ? item.count + ' ' + name : name);
                }
            });
        }

        const creatures = this.world.getCreaturesAt(Number(x), Number(y), Number(z));
        creatures.forEach((creature) => parts.push(creature.name));

        const text = parts.length > 0
            ? 'Ves ' + parts.join(', ') + '.'
            : 'No ves nada especial.';

        this._send(P.message(P.SERVER.TEXT, 0, text));
        return { handled: true, action: 'look', text: text };
    }

    /**
     * Recoger lo que hay encima de una casilla.
     *
     * Se exige que la casilla esté AL LADO, y el motivo es de jugabilidad antes que de
     * seguridad: recoger de lejos convertiría el inventario en algo que se llena sin
     * moverse, y el mundo dejaría de importar. La comprobación de verdad la hace el mundo,
     * que es quien conoce las reglas; aquí sólo se traduce el mensaje.
     */
    /**
     * USAR una casilla (clic derecho, doble clic o E): el `onUse` de TFS.
     *
     * Se prueba de ARRIBA ABAJO —primero lo que va encima de las criaturas, luego lo de debajo y
     * por último el suelo— y se usa el primer objeto que tenga una acción registrada (por su
     * uniqueId, su actionId o su tipo: `data/scripts/actions/`). Si no hay nada que usar pero lo
     * de arriba se puede coger, se recoge: es lo que espera quien hace clic derecho en una moneda.
     *
     * HAY QUE ESTAR AL LADO. Si se está lejos y hay un camino, el jugador VA ANDANDO hasta la
     * casilla de al lado más cercana y lo usa al llegar (como en Tibia). Si no hay camino —un muro,
     * otra planta, demasiado lejos para buscar—, lo dice.
     */
    _handleUse(x, y, z) {
        x = Number(x);
        y = Number(y);
        z = Number(z);
        const tile = this.world.map ? this.world.map.getTile(x, y, z) : null;
        const ground = this.world.map ? this.world.map.getGround(x, y, z) : null;
        if (!tile && !ground) {
            return { handled: true, action: 'use', used: false, reason: 'noTile' };
        }
        const candidatos = (tile ? tile.topItems.slice().reverse().concat(tile.downItems.slice().reverse()) : [])
            .concat(ground ? [ground] : []);

        // EL COFRE DE DEPÓSITO se abre con LO TUYO, sea cual sea el cofre (hay que estar al lado).
        const cofre = candidatos.find((item) => this.world.isDepot(item));
        if (cofre) {
            if (!this.world.canReach(this.player, { x: x, y: y, z: z })) {
                const camino = this.player.position.z === z ? this._caminoHastaElLado(x, y, z) : null;
                if (!camino) {
                    this.sendText('Esta demasiado lejos.');
                    return { handled: true, action: 'use', used: false, reason: 'tooFar' };
                }
                this.autoCamino = { pasos: camino, alLlegar: () => this._handleUse(x, y, z) };
                return { handled: true, action: 'use', used: false, walking: true, steps: camino.length };
            }
            const deposito = this.world.depotOf(this.player, cofre);
            return deposito ? this._alternarContenedor(deposito) : { handled: true, action: 'use', used: false };
        }
        const usable = candidatos.find((item) => this.engine.registry.hasAction(item.typeId,
            { itemUid: item.instanceId || 0, actionId: item.attributes && item.attributes.actionId,
              uniqueId: item.attributes && item.attributes.uniqueId }));
        const arriba = tile ? tile.getItems()[tile.getItems().length - 1] : null;
        // Un contenedor en el suelo (un cuerpo, una caja, una mochila tirada) se ABRE, como en
        // Tibia: la mochila, si es lo de arriba (para cogerla se arrastra); el cuerpo, aunque
        // tenga algo encima. Si tiene una acción propia (un cofre de misión), manda la acción.
        const abrible = !usable && tile
            ? (arriba && arriba !== tile.ground && arriba.isContainer ? arriba
                : tile.topItems.slice().reverse().concat(tile.downItems.slice().reverse())
                    .find((item) => item.isContainer && !item.hasFlag('pickupable')))
            : null;

        // CLIC DERECHO NUNCA RECOGE: lo que no se usa ni se abre, no hace nada (para coger algo
        // se arrastra a tu mochila o a tu equipo).
        if (!usable && !abrible) {
            this.sendText('No puedes usar eso.');
            return { handled: true, action: 'use', used: false, reason: 'nothingToUse' };
        }

        const yo = this.player.position;
        if (yo.z !== z || Math.max(Math.abs(yo.x - x), Math.abs(yo.y - y)) > 1) {
            const camino = yo.z === z ? this._caminoHastaElLado(x, y, z) : null;
            if (!camino) {
                this.sendText('Esta demasiado lejos.');
                return { handled: true, action: 'use', used: false, reason: 'tooFar' };
            }
            this.autoCamino = { pasos: camino, alLlegar: () => this._handleUse(x, y, z) };
            return { handled: true, action: 'use', used: false, walking: true, steps: camino.length };
        }

        if (abrible) {
            return this._alternarContenedor(abrible);
        }
        const uid = this.world.adoptItem(usable);
        const r = this.engine.dispatchAction(usable.typeId, {
            playerId: this.playerId,
            itemUid: uid,
            fromX: x, fromY: y, fromZ: z,
            toX: x, toY: y, toZ: z
        });
        this.view.markDirty(this.playerId);
        if (r && r.handled) {
            return { handled: true, action: 'use', used: true, itemId: usable.typeId };
        }
        this.sendText('No puedes usar eso.');
        return { handled: true, action: 'use', used: false, reason: 'nothingToUse' };
    }

    /**
     * El camino más corto hasta una casilla AL LADO de (x, y): la propia casilla suele no pisarse
     * (una puerta cerrada, una palanca en la pared). Se evitan las casillas que bloquean la
     * búsqueda de caminos (escaleras, agujeros: no se baja de planta sin querer). Null si no hay.
     */
    _caminoHastaElLado(x, y, z) {
        const map = this.world.map;
        const yo = this.player.position;
        const evitar = (cx, cy, cz) => {
            const t = map.getTile(cx, cy, cz);
            const g = map.getGround(cx, cy, cz);
            return [g].concat(t ? t.getItems() : []).some((i) => i && i.hasFlag('blocksPathfind'));
        };
        let mejor = null;
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                const destino = { x: x + dx, y: y + dy, z };
                if (!map.isWalkable(destino.x, destino.y, z) || ((dx || dy) && evitar(destino.x, destino.y, z))) {
                    continue;
                }
                const r = findPath(map, yo, destino, { maxDistance: 20, isBlocked: evitar });
                if (r.found && (!mejor || r.path.length < mejor.length)) {
                    mejor = r.path;
                }
            }
        }
        return mejor;
    }

    /**
     * Un paso del camino automático, cuando el jugador puede darlo. Se llama en cada tick. Si un
     * paso no se puede dar (alguien se puso en medio), se para y lo dice; al llegar, hace lo que
     * tocaba (usar).
     */
    _pasoAutomatico() {
        const camino = this.autoCamino;
        if (!camino || !this.player) {
            return;
        }
        if (camino.pasos.length === 0) {
            this.autoCamino = null;
            camino.alLlegar();
            return;
        }
        const yo = this.player.position;
        const siguiente = camino.pasos[0];
        const from = yo.copy();
        const r = this.world.moveCreature(this.player, { x: siguiente.x - yo.x, y: siguiente.y - yo.y });
        if (r.moved) {
            camino.pasos.shift();
            this._send(this.view.moveMessage(this.player, from, r.to));
            this.view.noteMoved(this.player);
            this.view.markDirty(this.playerId);
            if (camino.pasos.length === 0) {
                this.autoCamino = null;
                camino.alLlegar();
            }
        } else if (r.reason !== 'exhausted') {
            // Algo se ha cruzado (un monstruo, otro jugador): se busca otro camino al mismo
            // destino rodeándolo, como en Tibia. Sólo si no lo hay, se para.
            const destino = camino.pasos[camino.pasos.length - 1];
            const otro = (camino.rodeos || 0) < 5 ? this._caminoEvitandoCriaturas(destino) : null;
            if (otro) {
                camino.pasos = otro;
                camino.rodeos = (camino.rodeos || 0) + 1;
            } else {
                this.autoCamino = null;
                this.sendText('Algo te corta el paso.');
            }
        }
    }

    /** Un camino hasta `destino` que rodea también a las criaturas (para cuando una se cruza). */
    _caminoEvitandoCriaturas(destino) {
        const map = this.world.map;
        const yo = this.player.position;
        if (!map || !destino) {
            return null;
        }
        const r = findPath(map, yo, { x: destino.x, y: destino.y, z: yo.z }, {
            maxDistance: 40,
            isBlocked: (cx, cy, cz) => {
                const t = map.getTile(cx, cy, cz);
                const g = map.getGround(cx, cy, cz);
                return this.world.hasCreatureAt(cx, cy, cz) ||
                    [g].concat(t ? t.getItems() : []).some((i) => i && i.hasFlag('blocksPathfind'));
            }
        });
        return r.found && r.path.length ? r.path : null;
    }

    /**
     * Ir andando hasta una casilla (clic izquierdo en el mapa), como en Tibia: se busca el camino
     * y el personaje lo recorre paso a paso al ritmo de su velocidad. Andar con el teclado lo
     * cancela. Si no se puede llegar, se dice.
     *
     * DESDE EL MINIMAPA (`acercarse`): el destino puede estar lejos o sin descubrir (ni siquiera
     * pisable). Entonces se va a la casilla alcanzable MÁS CERCANA a él y ahí se para.
     */
    _handleWalkTo(x, y, z, acercarse) {
        x = Number(x);
        y = Number(y);
        z = Number(z);
        const map = this.world.map;
        const yo = this.player.position;
        if (!map || yo.z !== z || !Number.isFinite(x) || !Number.isFinite(y)) {
            this.sendText('No hay camino.');
            return { handled: true, action: 'walkTo', walking: false, reason: 'otherFloor' };
        }
        if (yo.x === x && yo.y === y) {
            this.autoCamino = null;
            return { handled: true, action: 'walkTo', walking: false, reason: 'alreadyThere' };
        }
        const evitar = (cx, cy, cz) => {
            const t = map.getTile(cx, cy, cz);
            const g = map.getGround(cx, cy, cz);
            return [g].concat(t ? t.getItems() : []).some((i) => i && i.hasFlag('blocksPathfind'));
        };
        const r = acercarse
            ? findPath(map, yo, { x, y, z }, { maxDistance: 160, nodeLimit: 40000, isBlocked: evitar, closest: true })
            : map.isWalkable(x, y, z)
                ? findPath(map, yo, { x, y, z }, { maxDistance: 40, isBlocked: evitar })
                : { found: false };
        if (acercarse && r.partial && !r.path.length) {
            this.autoCamino = null;
            this.sendText('No puedes acercarte más.');
            return { handled: true, action: 'walkTo', walking: false, reason: 'noCloser' };
        }
        if ((!r.found && !r.partial) || !r.path.length) {
            this.autoCamino = null;
            this.sendText('No hay camino.');
            return { handled: true, action: 'walkTo', walking: false, reason: 'noPath' };
        }
        this.autoCamino = { pasos: r.path, alLlegar: () => {} };
        return { handled: true, action: 'walkTo', walking: true, steps: r.path.length, partial: !!r.partial };
    }

    /**
     * Abre un contenedor del suelo: se le manda al cliente lo que hay dentro. Puede haber VARIOS
     * abiertos a la vez (dos cuerpos), como en Tibia; el cliente pone cada uno debajo de lo que
     * ya tenía abierto.
     */
    _abrirContenedor(item) {
        this.world.adoptItem(item);
        if (!this.contenedoresAbiertos) {
            this.contenedoresAbiertos = new Map();
        }
        // Abrir otra vez uno que ya está abierto sólo lo vuelve a mandar.
        this.contenedoresAbiertos.set(item.instanceId, null);
        if (this.contenedoresAbiertos.size > MAX_CONTENEDORES) {
            this._cerrarContenedor(this.contenedoresAbiertos.keys().next().value, true);
        }
        this._vigilarContenedor();
        return { handled: true, action: 'openContainer', id: item.instanceId, items: this.world.contentsOfItem(item).length };
    }

    /**
     * CLIC DERECHO EN UN CONTENEDOR: si está cerrado se abre, y si ya está abierto se cierra.
     * Es la regla para todos (un cuerpo, una mochila tirada, el depósito).
     */
    _alternarContenedor(item) {
        if (item.instanceId && this.contenedoresAbiertos && this.contenedoresAbiertos.has(item.instanceId)) {
            this._cerrarContenedor(item.instanceId, true);
            return { handled: true, action: 'closeContainer', id: item.instanceId };
        }
        return this._abrirContenedor(item);
    }

    /** Cierra uno (por su id) o, sin id, todos. */
    _cerrarContenedor(id, avisar) {
        if (!this.contenedoresAbiertos) {
            return;
        }
        const ids = id === undefined || id === null ? [...this.contenedoresAbiertos.keys()] : [Number(id)];
        ids.forEach((cual) => {
            if (this.contenedoresAbiertos.delete(cual) && avisar) {
                this._send(P.message(P.SERVER.CONTAINER_CLOSE, cual));
            }
        });
    }

    /**
     * Cada tick, los contenedores abiertos: si uno cambió (alguien cogió algo, se pudrió a otra
     * etapa) se manda de nuevo; si ya no está, dejó de ser contenedor o el jugador se alejó, se cierra.
     */
    _vigilarContenedor() {
        if (!this.contenedoresAbiertos || this.contenedoresAbiertos.size === 0) {
            return;
        }
        [...this.contenedoresAbiertos.entries()].forEach(([id, firmaVieja]) => {
            const item = this.world.items.get(id);
            if (!item || !item.position || !item.isContainer || !this.world.canReach(this.player, item.position)) {
                this._cerrarContenedor(id, true);
                return;
            }
            const datos = this.world.containerPayload(item);
            const firma = JSON.stringify(datos);
            if (firma !== firmaVieja) {
                this.contenedoresAbiertos.set(id, firma);
                this._send(P.message(P.SERVER.CONTAINER_OPEN, datos));
            }
        });
    }

    /** Coger del contenedor abierto a la mochila. */
    _handleContainerTake(id, index) {
        const r = this.world.takeFromContainer(this.player, id, index);
        if (!r.ok) {
            const motivos = {
                tooFar: 'Esta demasiado lejos.',
                noContainer: 'No llevas mochila: no tienes donde meterlo.',
                tooHeavy: 'Pesa demasiado: no puedes con ello.',
                backpackFull: 'Tu mochila esta llena: tiene ' + r.slots + ' huecos.',
                noItem: 'Eso ya no esta ahi.'
            };
            this.sendText(motivos[r.reason] || 'No puedes cogerlo.');
            return { handled: true, action: 'containerTake', ok: false, reason: r.reason };
        }
        this.sendText('Coges ' + (r.item.count > 1 ? r.item.count + ' ' : '') + (r.item.getName() || 'algo') + '.');
        this.sendInventory();
        this._vigilarContenedor();
        return { handled: true, action: 'containerTake', ok: true };
    }

    /** La ventana del personaje: su aspecto, los que puede elegir y sus datos. */
    _handleRequestOutfit() {
        const player = this.player;
        // Los que puede llevar ESTE jugador según outfits.js: de persona, activos, de su sexo
        // y, si son premium, sólo con cuenta premium.
        const aspectos = outfitsFor(player, this.world.outfitTypes);
        const peso = this.world.weightOf(player);
        const capacidad = this.world.capacityOf(player);
        this._send(P.message(P.SERVER.OUTFIT_WINDOW, {
            outfit: { ...player.outfit },
            outfits: aspectos,
            stats: {
                ...this.view.statsOf(player),
                name: player.name,
                sex: player.sex,
                capacity: capacidad,
                free: capacidad - peso
            }
        }));
        return { handled: true, action: 'outfitWindow', outfits: aspectos.length };
    }

    /** Cambiar de aspecto, con las mismas comprobaciones que el comando /outfit. */
    _handleSetOutfit(valores) {
        const [lookType, head, body, legs, feet, addons] = (valores || []).map(Number);
        const pedido = normalizeOutfit({ lookType, head, body, legs, feet, addons });
        const permitido = canUseOutfit(pedido, this.world.outfitTypes, this.player.premium === true, this.player);
        if (!permitido.ok) {
            this.sendText('No puedes llevar ese aspecto: ' + permitido.reason + '.');
            return { handled: true, action: 'setOutfit', ok: false, reason: permitido.reason };
        }
        this.player.outfit = pedido;
        this.world.emit('onTileChanged', this.player.position, null);
        this.view.markDirty(this.playerId);
        this.sendText('Aspecto cambiado.');
        return { handled: true, action: 'setOutfit', ok: true };
    }

    _handlePickup(x, y, z) {
        const result = this.world.pickUpItem(this.player, x, y, z);

        if (!result.ok) {
            // Sólo se responde cuando hay algo que explicar. Recoger de una casilla vacía
            // es normal y no merece un mensaje.
            this._explainPickup(result);
            return { handled: true, action: 'pickup', picked: false, reason: result.reason };
        }

        // El inventario cambió, así que hay que decírselo al cliente: si no, el objeto
        // desaparece del suelo y no aparece en ninguna parte.
        this.sendText('Has recogido ' + this._itemLabel(result.item.typeId, result.item.count) +
            (result.stacked ? ' (se suma a lo que ya llevabas)' : '') + '.');
        this.sendInventory();

        /*
         * Y HAY QUE MARCAR LA VISTA COMO SUCIA.
         *
         * La vista sólo recalcula las casillas cuando el jugador se mueve o cuando se le dice
         * que algo cambió. Recoger cambia una casilla —la que se queda sin el objeto— y sin
         * esto el cliente seguía viendo el objeto en el suelo hasta que el jugador daba un
         * paso. El inventario sí se actualizaba, así que el objeto aparecía en los dos sitios
         * a la vez: en la barra de abajo y en el suelo.
         *
         * Es el mismo fallo de siempre en este proyecto: dos piezas correctas y el cable que
         * las une, que no está. Y no se veía en ninguna prueba porque todas miraban el
         * inventario o el tile del MOTOR, y el motor sí estaba bien.
         */
        this.view.markDirty(this.playerId);

        return { handled: true, action: 'pickup', picked: true, item: result.item };
    }

    /**
     * Por qué no se pudo recoger, en un mensaje que sirva.
     *
     * Va aparte porque ahora hay DOS caminos que recogen -el botón derecho y arrastrar a la
     * mochila, que es el mismo por debajo-, y dos copias de esta lista de motivos se separan: una
     * diria "no tienes mochila" y la otra se callaria, y el jugador no sabria por que una vez si y
     * otra no.
     */
    _explainPickup(result) {
        if (result.reason === 'tooFar') {
            this.sendText('Esta demasiado lejos.');
        } else if (result.reason === 'notPickupable') {
            this.sendText('Eso no se puede recoger.');
        } else if (result.reason === 'noContainer') {
            this.sendText('No llevas mochila, asi que no tienes donde meterlo. ' +
                'Ponte una mochila y podras llevar cosas.');
        } else if (result.reason === 'backpackFull') {
            this.sendText('Tu mochila esta llena: tiene ' + result.slots + ' huecos.');
        } else if (result.reason === 'tooHeavy') {
            // Se dice CUÁNTO falta, no sólo que no cabe: sin el número, el jugador sabe
            // que no puede pero no cuánto tiene que soltar, y acaba probando a ciegas.
            this.sendText('No puedes con eso: pesa ' + formatWeight(result.weight) +
                ' y te quedan ' + formatWeight(result.free) + ' libres.');
        }
    }

    /** Soltar un objeto del inventario. */
    _handleDrop(index) {
        const result = this.world.dropItem(this.player, index);

        if (!result.ok) {
            // Soltar tambien se explica ahora: antes se callaba, y una mochila con cosas dentro
            // no se puede soltar (lo de dentro se quedaria dentro de nada). Sin el mensaje, el
            // objeto se quedaba donde estaba y no pasaba nada visible.
            this._explainMoveFailure(result);
            return { handled: true, action: 'drop', dropped: false, reason: result.reason };
        }

        this.sendText('Has soltado ' + this._itemLabel(result.item.typeId, result.item.count) + '.');
        this.sendInventory();

        // Igual que al recoger: soltar pone un objeto en el suelo, y el cliente no lo vería
        // hasta moverse. Aquí el fallo es al revés —el objeto no aparece— y se nota menos,
        // que es justo lo que lo hace durar más.
        this.view.markDirty(this.playerId);

        return { handled: true, action: 'drop', dropped: true, item: result.item };
    }

    /**
     * Mover un objeto: es el mensaje del ARRASTRAR.
     *
     * EL CLIENTE PIDE Y EL MOTOR DECIDE, igual que al caminar. Aqui no se decide nada del juego:
     * se traduce el mensaje a "esto va alli" y se le pasa al mundo, que es quien comprueba una por
     * una todas las reglas. Si dice que no, se le dice AL JUGADOR por que, porque un arrastre que
     * no hace nada y no explica nada es lo peor que puede pasar en una interfaz.
     *
     * LOS DOS EXTREMOS SE COMPRUEBAN AQUI TAMBIEN, y no es desconfianza del motor: es que un
     * mensaje mal formado -un origen que no es ni suelo ni inventario- no es "mover de un sitio
     * raro", es un mensaje que no se entiende, y se rechaza como tal en vez de adivinar.
     */
    _handleMoveItem(message) {
        const F = P.MOVE_ITEM_FIELD;

        const fromKind = message[F.FROM_KIND];
        const toKind = message[F.TO_KIND];

        if (fromKind !== P.MOVE_FROM.GROUND && fromKind !== P.MOVE_FROM.INVENTORY &&
            fromKind !== P.MOVE_FROM.CONTAINER) {
            this.stats.rejected += 1;
            return { handled: false, reason: 'badSource' };
        }
        if (toKind !== P.MOVE_TO.GROUND && toKind !== P.MOVE_TO.SLOT &&
            toKind !== P.MOVE_TO.CONTAINER && toKind !== P.MOVE_TO.GROUND_CONTAINER) {
            this.stats.rejected += 1;
            return { handled: false, reason: 'badTarget' };
        }

        let from;
        if (fromKind === P.MOVE_FROM.GROUND) {
            from = { kind: 'ground', x: message[F.FROM_X], y: message[F.FROM_Y], z: message[F.FROM_Z] };
        } else if (fromKind === P.MOVE_FROM.CONTAINER) {
            // Del cuerpo abierto: lo que se ve en su ventana.
            from = { kind: 'container', id: message[F.FROM_ID], index: message[F.FROM_INDEX] };
        } else {
            from = { kind: 'inventory', index: message[F.FROM_INDEX] };
        }

        let to;
        if (toKind === P.MOVE_TO.GROUND) {
            to = { kind: 'ground', x: message[F.TO_X], y: message[F.TO_Y], z: message[F.TO_Z] };
        } else if (toKind === P.MOVE_TO.CONTAINER) {
            to = { kind: 'container' };
        } else if (toKind === P.MOVE_TO.GROUND_CONTAINER) {
            // A la ventana abierta de una mochila tirada o de un cuerpo.
            to = { kind: 'groundContainer', id: message[F.TO_ID] };
        } else {
            to = { kind: 'slot', slot: message[F.TO_SLOT] };
        }

        const result = this.world.moveItem(this.player, from, to);

        // Arrastrar algo LEJANO a la mochila o a una ranura: como en Tibia, el personaje va
        // andando hasta el lado y lo coge al llegar.
        if (!result.ok && result.reason === 'tooFar' && from.kind === 'ground' && to.kind !== 'ground' &&
            this.player.position.z === Number(from.z)) {
            const camino = this._caminoHastaElLado(Number(from.x), Number(from.y), Number(from.z));
            if (camino) {
                this.autoCamino = { pasos: camino, alLlegar: () => this._handleMoveItem(message) };
                return { handled: true, action: 'move', moved: false, walking: true, steps: camino.length };
            }
        }

        if (!result.ok) {
            this._explainMoveFailure(result);
            return { handled: true, action: 'move', moved: false, reason: result.reason };
        }

        /*
         * Al moverse algo cambian DOS cosas y las dos hay que decirselas al cliente: el inventario
         * entero -que es donde se ve el resultado- y la casilla, si el objeto venia del suelo o ha
         * ido a el. Sin lo segundo, el objeto se moveria en el inventario y seguiria dibujado en su
         * casilla vieja hasta que el jugador diera un paso.
         */
        this.sendInventory();
        this.view.markDirty(this.playerId);

        // Y NO SE DICE NADA AL ACERTAR: mover es una accion normal, como caminar, y el resultado
        // se ve en el panel. Un mensaje por cada arrastre llenaria el chat de ruido.
        return {
            handled: true, action: 'move', moved: true, item: result.item,
            slot: result.slot, stacked: result.stacked
        };
    }

    /**
     * Por qué no se pudo mover, en un mensaje que sirva.
     *
     * CADA MOTIVO TIENE SU FRASE, y no una generica, porque son problemas distintos: no es lo
     * mismo que el objeto este lejos, que no haya mochila, que la ranura no sea la suya o que la
     * mochila tenga cosas dentro. "No se puede" a secas obliga a adivinar cual de los cuatro es.
     */
    _explainMoveFailure(result) {
        switch (result.reason) {
            case 'tooFar':
                this.sendText('Esta demasiado lejos.');
                break;
            case 'notPickupable':
                this.sendText('Eso no se puede coger del suelo.');
                break;
            case 'noContainer':
                this.sendText('No llevas mochila, asi que no tienes donde meterlo. ' +
                    'Ponte una mochila y podras llevar cosas.');
                break;
            case 'notEquippable':
                this.sendText('Eso no se puede llevar puesto.');
                break;
            case 'wrongSlot':
                // Se dice CUAL era la ranura buena: sin eso, el jugador sabe que se ha
                // equivocado pero no donde iba.
                this.sendText('Ahi no va eso: se pone en la ranura "' + result.slot + '".');
                break;
            case 'containerNotEmpty':
                this.sendText('No puedes mover la mochila: tiene cosas dentro. ' +
                    'Vacia la mochila primero.');
                break;
            case 'tooHeavy':
                this.sendText('No puedes con eso: pesa ' + formatWeight(result.weight) +
                    ' y te quedan ' + formatWeight(result.free) + ' libres.');
                break;
            case 'backpackFull':
                this.sendText('Tu mochila esta llena: tiene ' + result.slots + ' huecos.');
                break;
            case 'fullContainer':
                this.sendText('Esa mochila tiene cosas dentro: vaciala antes de meterla en la tuya, ' +
                    'o ponte la mochila si no llevas otra.');
                break;
            case 'containerFull':
                this.sendText('No cabe: ese contenedor esta lleno.');
                break;
            case 'containerInContainer':
                this.sendText('Un contenedor no se puede meter dentro de otro.');
                break;
            case 'emptyTile':
                this.sendText('Ahi no hay nada que mover.');
                break;
            case 'alreadyThere':
                this.sendText('Eso ya esta ahi.');
                break;
            case 'noTile':
                this.sendText('Ahi no se puede poner nada.');
                break;
            case 'notEnoughRoom':
                this.sendText('No hay sitio ahi.');
                break;
            default:
                // Un motivo que este codigo no conoce: se dice igual, en vez de callarse. Un
                // arrastre que no hace nada y no dice nada es lo peor que puede pasar.
                this.sendText('No se ha podido mover.');
        }
    }

    /** El nombre de un objeto con su cantidad, para los mensajes. */
    _itemLabel(typeId, count) {
        const definition = this.world.itemTypes.get(Number(typeId));
        const name = definition ? definition.name : 'objeto ' + typeId;

        if (count !== undefined && count !== 1) {
            return count + ' ' + name;
        }
        return name;
    }

    /**
     * Manda el inventario al cliente.
     *
     * Se manda ENTERO cada vez que cambia, en vez de mandar sólo lo que cambió. Un
     * inventario son decenas de entradas, y calcular diferencias para ahorrar eso es
     * mucho más código y una fuente de desincronizaciones entre lo que el jugador cree
     * que lleva y lo que lleva de verdad.
     */
    sendInventory() {
        const payload = this.world.inventoryPayload(this.player);

        return this._send(P.message(P.SERVER.INVENTORY,
            payload.count, payload.weight, payload.capacity, ...payload.flat));
    }

    _handleAttack(creatureId) {        const target = this.world.getCreature(Number(creatureId));

        if (!target || target.id === this.playerId) {
            return { handled: false, reason: 'badTarget' };
        }
        if (target.kind === 'npc') {
            this.sendText('No puedes atacar a ' + target.name + '.');
            return { handled: true, action: 'attack', result: { hit: false, reason: 'npc' } };
        }

        const result = this.combat.attack(this.player, target);
        this.player.target = target;

        if (result.hit) {
            this.view.markDirty(this.playerId);
        }

        return { handled: true, action: 'attack', result: result };
    }

    /** Empuja los cambios de vista al cliente. */
    update() {
        if (this.closed || !this.entered) {
            return 0;
        }
        this._pasoAutomatico();
        this._ataqueAutomatico();
        this._vigilarTienda();
        this._vigilarContenedor();
        return this._flushView();
    }

    /**
     * Seguir pegando al objetivo, como en Tibia: el primer golpe es el clic y los siguientes
     * salen solos cada `attackSpeed` de la vocación, mientras esté a su alcance. Si muere, se va
     * de la vista o cambia de planta, se deja.
     */
    _ataqueAutomatico() {
        const player = this.player;
        const target = player && player.target;
        if (!target) {
            return;
        }
        const sigue = this.world.getCreature(target.id) === target && !target.isDead() &&
            target.position.z === player.position.z &&
            player.position.distanceTo(target.position) <= 10;
        if (!sigue) {
            player.target = null;
            return;
        }
        const check = this.combat.canAttack(player, target);
        if (check.allowed) {
            this.combat.attack(player, target);
            if (target.isDead()) {
                player.target = null;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Usar lo que llevas, misiones, comercio, mensajes privados y grupo
    // -----------------------------------------------------------------------

    /**
     * USAR UN OBJETO DEL INVENTARIO (comer, beber una poción): su `onUse` de los scripts con el
     * objeto en la mochila (un `InventoryItemWrapper`, que sabe gastarse con `item.remove(1)`).
     */
    _handleUseInventory(index) {
        const entry = this.world.inventoryEntry(this.player, index);
        if (!entry) {
            return { handled: false, reason: 'badItem' };
        }
        const objeto = this.engine.registry.entities.inventoryItem(this.playerId, entry);
        const pos = this.player.position;
        const attrs = entry.attributes || {};
        const r = this.engine.registry.dispatchAction(entry.typeId, {
            playerId: this.playerId,
            itemWrapper: objeto,
            actionId: attrs.actionId,
            uniqueId: attrs.uniqueId,
            fromX: pos.x, fromY: pos.y, fromZ: pos.z,
            toX: pos.x, toY: pos.y, toZ: pos.z
        });
        if (!r.handled) {
            this.sendText('No puedes usar eso.');
        }
        this.sendInventory();
        this.view.markDirty(this.playerId);
        return { handled: true, action: 'useInventory', used: r.handled === true, itemId: entry.typeId };
    }

    /**
     * UNA HOTKEY CON UN OBJETO: el primero de ese tipo que lleves (en la mochila, si no puesto),
     * usado sobre una criatura: tú (una poción) o tu objetivo. Su `onUse` recibe la criatura como
     * `target` (con su posición) y `isHotkey` a true. El objetivo tiene que estar a la vista, en tu
     * planta y a 7 casillas como mucho.
     */
    _handleUseHotkeyItem(typeId, creatureId) {
        const id = Number(typeId);
        const inventario = this.player.inventory || [];
        const entry = inventario.find((e) => e.typeId === id && e.slot === 'inside') ||
            inventario.find((e) => e.typeId === id);
        const definicion = this.world.itemTypes.get(id);
        if (!entry) {
            this.sendText('No llevas ' + (definicion ? (definicion.plural || definicion.name) : 'eso') + '.');
            return { handled: true, action: 'useHotkeyItem', used: false, reason: 'noItem' };
        }
        const objetivo = this.world.getCreature(Number(creatureId) || this.playerId);
        const yo = this.player.position;
        if (!objetivo || !objetivo.position || objetivo.position.z !== yo.z ||
            Math.max(Math.abs(objetivo.position.x - yo.x), Math.abs(objetivo.position.y - yo.y)) > 7) {
            this.sendText('Tu objetivo no está a la vista.');
            return { handled: true, action: 'useHotkeyItem', used: false, reason: 'noTarget' };
        }
        const t = objetivo.position;
        const attrs = entry.attributes || {};
        const r = this.engine.registry.dispatchAction(entry.typeId, {
            playerId: this.playerId,
            itemWrapper: this.engine.registry.entities.inventoryItem(this.playerId, entry),
            actionId: attrs.actionId,
            uniqueId: attrs.uniqueId,
            fromX: yo.x, fromY: yo.y, fromZ: yo.z,
            targetCreatureId: objetivo.id,
            toX: t.x, toY: t.y, toZ: t.z,
            isHotkey: true
        });
        if (!r.handled) {
            this.sendText('No puedes usar eso.');
        }
        this.sendInventory();
        this.view.markDirty(this.playerId);
        return { handled: true, action: 'useHotkeyItem', used: r.handled === true, itemId: id, target: objetivo.id };
    }

    /**
     * USAR UN OBJETO DE DENTRO DE UN CONTENEDOR abierto (clic derecho en su ventana): su `onUse`
     * con el objeto de verdad (que sabe gastarse con `item.remove(1)`). Hay que estar al lado.
     */
    _handleUseContainer(id, index) {
        const contenedor = this.world.items.get(Number(id));
        if (!contenedor || !contenedor.position || !contenedor.isContainer) {
            return { handled: false, reason: 'noContainer' };
        }
        if (!this.world.canReach(this.player, contenedor.position)) {
            this.sendText('Esta demasiado lejos.');
            return { handled: true, action: 'useContainer', used: false, reason: 'tooFar' };
        }
        const item = this.world.contentsOfItem(contenedor)[Number(index)];
        if (!item) {
            return { handled: false, reason: 'noItem' };
        }
        const uid = this.world.adoptItem(item);
        const pos = this.player.position;
        const r = this.engine.dispatchAction(item.typeId, {
            playerId: this.playerId,
            itemUid: uid,
            fromX: pos.x, fromY: pos.y, fromZ: pos.z,
            toX: pos.x, toY: pos.y, toZ: pos.z
        });
        if (!r || !r.handled) {
            this.sendText('No puedes usar eso.');
        }
        this.sendInventory();
        return { handled: true, action: 'useContainer', used: !!(r && r.handled), itemId: item.typeId };
    }

    /**
     * MIRAR UN OBJETO de un panel (los dos botones a la vez): lo que es, cuántos, lo que pesa y
     * sus números (ataque, defensa, armadura, huecos...).
     */
    _handleLookItem(tipo, a, b) {
        let typeId = null;
        let count = 1;
        let attrs = null;
        if (tipo === 'inventory') {
            const entry = this.world.inventoryEntry(this.player, a);
            if (entry) {
                typeId = entry.typeId;
                count = entry.count;
                attrs = entry.attributes;
            }
        } else if (tipo === 'container') {
            const contenedor = this.world.items.get(Number(a));
            const item = contenedor ? this.world.contentsOfItem(contenedor)[Number(b)] : null;
            if (item) {
                typeId = item.typeId;
                count = item.count;
                attrs = item.attributes;
            }
        }
        if (typeId === null) {
            return { handled: false, reason: 'noItem' };
        }
        const texto = this._describirObjeto(typeId, count, attrs);
        this.sendText(texto);
        return { handled: true, action: 'lookItem', text: texto };
    }

    /** «Ves 25 arrows (Ataque 25). Pesan 17.50 oz.» */
    _describirObjeto(typeId, count, attrs) {
        const def = this.world.itemTypes.get(Number(typeId));
        if (!def) {
            return 'No sabes qué es eso.';
        }
        const a = { ...(def.attributes || {}), ...(attrs || {}) };
        const numeros = [];
        if (a.attack) { numeros.push('Ataque ' + a.attack); }
        if (a.defense) { numeros.push('Defensa ' + a.defense); }
        if (a.armor) { numeros.push('Armadura ' + a.armor); }
        if (a.range) { numeros.push('Alcance ' + a.range); }
        if (a.isContainer) { numeros.push(this.world.capacityOfType(typeId) + ' huecos'); }
        if (a.lightLevel) { numeros.push('Luz ' + a.lightLevel); }
        const nombre = (count > 1 ? count + ' ' : (def.article ? def.article + ' ' : '')) + def.name;
        const peso = this.world.weightOfItem(typeId, count);
        return 'Ves ' + nombre + (numeros.length ? ' (' + numeros.join(', ') + ')' : '') + '.' +
            (peso > 0 ? (count > 1 ? ' Pesan ' : ' Pesa ') + formatWeight(peso) + '.' : '') +
            (a.description ? ' ' + a.description : '');
    }

    /** El diario de misiones, calculado con los storages del jugador. */
    sendQuestLog() {
        const log = this.engine.registry.questLog(this.player);
        this._send(P.message(P.SERVER.QUEST_LOG, log.map((q) =>
            [q.name, q.completed, q.missions.map((m) => [m.name, m.description, m.completed])])));
        return { handled: true, action: 'questLog', quests: log.length };
    }

    /** Un NPC con tienda a 4 casillas o menos, o null. */
    _npcConTiendaCerca() {
        const yo = this.player.position;
        let mejor = null;
        this.world.npcs.forEach((npc) => {
            const tienda = npc.dialogue && npc.dialogue.shop;
            if (!tienda || npc.position.z !== yo.z || yo.distanceTo(npc.position) > 4) {
                return;
            }
            if (!mejor || yo.distanceTo(npc.position) < yo.distanceTo(mejor.position)) {
                mejor = npc;
            }
        });
        return mejor;
    }

    /** Abre (o actualiza) la ventana de comercio con un NPC: lo que vende, lo que compra y tu dinero. */
    _abrirTienda(npc) {
        this.tienda = { npcId: npc.id };
        const ofertas = this.world.npcShopList(npc).map((o) => [
            o.typeId, o.name, o.buy || 0, o.sell || 0, this.world.countOf(this.player, o.typeId)
        ]);
        this._send(P.message(P.SERVER.SHOP_OPEN, npc.id, npc.name, this.world.countMoney(this.player), ofertas));
        return { handled: true, action: 'shopOpen', npc: npc.name };
    }

    /** Comprar o vender desde la ventana de comercio. */
    _handleShop(modo, typeId, cantidad) {
        const npc = this.tienda ? this.world.getCreature(this.tienda.npcId) : null;
        if (!npc || npc.position.z !== this.player.position.z || this.player.position.distanceTo(npc.position) > 4) {
            this.tienda = null;
            this._send(P.message(P.SERVER.SHOP_CLOSE));
            return { handled: true, action: 'shop', ok: false, reason: 'tooFar' };
        }
        const n = Math.max(1, Math.min(100, Math.trunc(Number(cantidad) || 1)));
        const r = modo === 'buy'
            ? this.world.buyFromNpc(this.player, npc, Number(typeId), n)
            : this.world.sellToNpc(this.player, npc, Number(typeId), n);
        const nombre = this.world.itemTypes.get(Number(typeId)) ? this.world.itemTypes.get(Number(typeId)).name : 'eso';
        if (r.ok) {
            this.sendText(modo === 'buy'
                ? 'Compras ' + n + ' x ' + nombre + ' por ' + r.total + ' monedas.'
                : 'Vendes ' + n + ' x ' + nombre + ' por ' + r.total + ' monedas.');
        } else {
            const motivos = {
                notSold: 'Eso no lo vende.', notBought: 'Eso no lo compra.',
                notEnoughMoney: 'No te llega el dinero' + (r.price ? ': cuesta ' + r.price + '.' : '.'),
                tooHeavy: 'No puedes con tanto peso.', backpackFull: 'Tu mochila esta llena.',
                noContainer: 'No llevas mochila.', notOwned: 'No tienes tantos.'
            };
            this.sendText(motivos[r.reason] || 'No se puede.');
        }
        this.sendInventory();
        this._abrirTienda(npc);
        return { handled: true, action: 'shop', ok: r.ok === true, reason: r.reason };
    }

    /** Si te alejas del NPC, la ventana de comercio se cierra. */
    _vigilarTienda() {
        if (!this.tienda) {
            return;
        }
        const npc = this.world.getCreature(this.tienda.npcId);
        if (!npc || npc.position.z !== this.player.position.z || this.player.position.distanceTo(npc.position) > 4) {
            this.tienda = null;
            this._send(P.message(P.SERVER.SHOP_CLOSE));
        }
    }

    /** Un mensaje privado (a un jugador por su nombre) o al grupo (`#grupo`). */
    _handlePrivate(destino, texto) {
        const canal = destino === '#grupo' ? 'grupo' : 'privado';
        const r = this.world.sendPrivateMessage(this.player, destino, texto, canal);
        if (!r.ok) {
            const motivos = {
                notOnline: 'Nadie llamado "' + destino + '" esta conectado.',
                notInParty: 'No estas en ningun grupo.',
                empty: 'El mensaje esta vacio.'
            };
            this.sendText(motivos[r.reason] || 'No se pudo mandar.');
        }
        return { handled: true, action: 'privateMessage', ok: r.ok === true };
    }

    /** Un mensaje privado o de grupo que le llega a este jugador. */
    sendPrivateMessage(de, texto, canal) {
        return this._send(P.message(P.SERVER.PRIVATE_MESSAGE, String(de), String(texto), canal || 'privado'));
    }

    /** Un diálogo con texto (el `popupFYI` de Tibia). */
    sendPopup(titulo, texto) {
        return this._send(P.message(P.SERVER.POPUP, String(titulo || ''), String(texto || '')));
    }

    /** Su grupo: líder y miembros (o vacío). */
    sendParty() {
        const grupo = this.world.partyOf(this.player);
        this.view.markDirty(this.playerId);
        return this._send(P.message(P.SERVER.PARTY, grupo ? grupo.leader.name : '',
            grupo ? grupo.members.map((m) => m.name) : []));
    }

    /** Las estadísticas del jugador (todas: vida, maná, skills…), ya. */
    sendStats() {
        return this._send(this.view.statsMessage(this.player));
    }

    _flushView() {
        const messages = this.view.update(this.player);
        messages.forEach((message) => this._send(message));
        return messages.length;
    }

    _send(message) {
        if (this.closed) {
            return false;
        }
        this.stats.sent += 1;
        this.send(message);
        return true;
    }
}

/**
 * Gestor de sesiones.
 *
 * Mantiene las sesiones vivas, las actualiza en cada tick y difunde lo que afecta
 * a varios jugadores.
 */
class SessionManager {
    constructor(options) {
        const opts = options || {};

        this.engine = opts.engine;
        this.world = opts.world;
        this.view = opts.view;
        this.log = opts.logger || null;

        /** El repositorio de personajes, compartido por todas las sesiones. */
        this.repository = opts.repository || null;

        /** id de jugador -> sesión. */
        this.sessions = new Map();
    }

    /** Crea una sesión con un transporte ya resuelto. */
    createSession(send) {
        const session = new GameSession({
            engine: this.engine,
            world: this.world,
            view: this.view,
            combat: this.engine.combat,
            repository: this.repository,
            logger: this.log,
            manager: this,
            send: send
        });
        return session;
    }

    /** Registra la sesión cuando el jugador ya está en el mundo. */
    register(session) {
        if (session && session.playerId !== null) {
            this.sessions.set(session.playerId, session);
        }
        return session;
    }

    unregister(session) {
        if (session && session.playerId !== null) {
            this.sessions.delete(session.playerId);
        }
    }

    get(playerId) {
        return this.sessions.get(Number(playerId)) || null;
    }

    get size() {
        return this.sessions.size;
    }

    /** Difunde un mensaje a quien pueda ver una posición. */
    broadcastAround(position, message, exceptId) {
        const map = this.world.map;
        let sent = 0;

        this.sessions.forEach((session) => {
            if (!session.entered || session.playerId === exceptId) {
                return;
            }

            const viewer = session.player.position;

            if (map && !map.canSee(viewer.z, position.z)) {
                return;
            }

            const halfWidth = Math.floor(this.view.viewWidth / 2);
            const halfHeight = Math.floor(this.view.viewHeight / 2);
            if (Math.abs(viewer.x - position.x) > halfWidth ||
                Math.abs(viewer.y - position.y) > halfHeight) {
                return;
            }

            session.send(message);
            sent += 1;
        });

        return sent;
    }

    /** Difunde lo que alguien dice, incluido a quien lo dice. */
    /** Un número flotante (daño o curación) para todos los que ven esa casilla. */
    broadcastAnimatedText(position, tipo, texto) {
        const message = P.message(P.SERVER.ANIMATED_TEXT,
            position.x, position.y, position.z, tipo, String(texto));
        const map = this.world.map;
        this.sessions.forEach((session) => {
            if (!session.entered || !session.player) {
                return;
            }
            const viewer = session.player.position;
            if (map && !map.canSee(viewer.z, position.z)) {
                return;
            }
            if (Math.abs(viewer.x - position.x) > VISTA_TEXTOS || Math.abs(viewer.y - position.y) > VISTA_TEXTOS) {
                return;
            }
            session.send(message);
        });
        return true;
    }

    /** Manda un mensaje a quien vea ALGUNA de esas casillas (su planta y a la vista). */
    _difundirCerca(posiciones, message) {
        const map = this.world.map;
        let enviados = 0;
        this.sessions.forEach((session) => {
            if (!session.entered || !session.player) {
                return;
            }
            const viewer = session.player.position;
            const ve = posiciones.some((position) =>
                (!map || map.canSee(viewer.z, position.z)) &&
                Math.abs(viewer.x - position.x) <= VISTA_TEXTOS && Math.abs(viewer.y - position.y) <= VISTA_TEXTOS);
            if (ve) {
                session.send(message);
                enviados += 1;
            }
        });
        return enviados;
    }

    /** Un efecto sobre una casilla, para quien la vea. */
    broadcastMagicEffect(position, efecto) {
        return this._difundirCerca([position],
            P.message(P.SERVER.MAGIC_EFFECT, position.x, position.y, position.z, Number(efecto)));
    }

    /** Un proyectil de una casilla a otra, para quien vea cualquiera de las dos. */
    broadcastDistanceEffect(desde, hasta, proyectil) {
        return this._difundirCerca([desde, hasta], P.message(P.SERVER.DISTANCE_EFFECT,
            desde.x, desde.y, desde.z, hasta.x, hasta.y, hasta.z, Number(proyectil)));
    }

    broadcastSay(creature, text) {
        const message = P.message(P.SERVER.CREATURE_SAY,
            creature.id, creature.name, text);
        const map = this.world.map;

        this.sessions.forEach((session) => {
            if (!session.entered) {
                return;
            }

            const viewer = session.player.position;

            if (map && !map.canSee(viewer.z, creature.position.z)) {
                return;
            }
            if (Math.abs(viewer.x - creature.position.x) > SAY_RADIUS ||
                Math.abs(viewer.y - creature.position.y) > SAY_RADIUS) {
                return;
            }

            session.send(message);
        });

        return true;
    }

    /** Un tick: cada sesión empuja sus cambios. */
    /**
     * Marca todas las vistas como sucias.
     *
     * Es a proposito la version burda: no se calcula QUE vista cubre la casilla que cambio,
     * se marcan todas. Cuesta un recuento de casillas de mas por cada jugador conectado y
     * ahorra el indice espacial que haria falta para acertar, ademas de la clase entera de
     * fallos que aparece cuando ese indice se desincroniza del mundo. Con pocos jugadores es
     * gratis, y el dia que no lo sea ya se sabra por que.
     */
    markAllDirty() {
        this.view.markAllDirty();
    }

    updateAll() {
        let messages = 0;
        this.sessions.forEach((session) => {
            messages += session.update();
        });
        return messages;
    }

    closeAll() {
        this.sessions.forEach((session) => {
            session.close();
        });
        this.sessions.clear();
    }

    stats() {
        return {
            sessions: this.sessions.size,
            entered: Array.from(this.sessions.values()).filter((s) => s.entered).length,
            steps: Array.from(this.sessions.values())
                .reduce((total, s) => total + s.steps, 0)
        };
    }
}

module.exports = { GameSession, SessionManager, DEFAULT_PLAYER_NAME, SAY_RADIUS };
