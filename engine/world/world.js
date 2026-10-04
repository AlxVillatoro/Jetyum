'use strict';

/**
 * World: el estado vivo y el bucle de simulación.
 *
 * Aquí es donde el motor pasa a ser **autoritativo**: el mundo decide si un paso
 * es válido, cuánto tarda, qué criatura ocupa qué tile y qué ocurre cuando algo
 * cambia. Los módulos de contenido no tocan nada de esto directamente; piden
 * cosas por la API y el mundo las valida.
 *
 * Sobre los tiles y las criaturas. Un tile guarda sus criaturas porque el apilado
 * las necesita: el cliente dibuja suelo, items de abajo, criaturas e items de
 * arriba, y ese orden no se puede reconstruir sin saber quién está en el tile. Por
 * eso crear una criatura **materializa** su tile, aunque el mapa fuera disperso.
 *
 * Eso tiene una consecuencia que conviene tener presente: un jugador que recorre
 * medio mapa va dejando tiles materializados detrás. Están vacíos y son idénticos
 * al suelo por defecto, así que `compact()` los devuelve al estado disperso. Sin
 * esa limpieza, el consumo crece con el tiempo de juego en vez de con el contenido
 * del mundo, que es justo lo que el almacenamiento disperso venía a evitar.
 */

const { Position, DIRECTIONS, directionFrom } = require('./position');
const { UNITS_PER_OUNCE } = require('./weight');
const { Item } = require('./item');
const { Player, Monster, DIRECTION, resetIdCounter } = require('./creature');
const { createNpc } = require('./npc');
const { normalizeOutfit } = require('./outfit');
const Vocacion = require('./vocacion');
const { VOCACION_BASE } = require('../data/definiciones');

/*
 * LA RANURA DE "DENTRO DEL CONTENEDOR" SALE DEL ARCHIVO COMPARTIDO.
 *
 * El nombre tiene que ser el MISMO a los dos lados -el motor decide en que ranura va cada cosa al
 * mandar el inventario, y el cliente mira esa ranura para saber que esta puesto y que esta dentro
 * de la mochila-, asi que se importa en vez de escribirse aqui y alla. Ver `SLOT_INSIDE` en
 * `shared/js/protocol.mjs`, que es donde esta contado por que se llama asi.
 */
const { SLOT_INSIDE } = require('../../shared/js/protocol.mjs');
const { esEfecto, esProyectil } = require('../../shared/js/efectos.mjs');

/** Desplazamiento por número de dirección de Tibia. */
const DIRECTION_DELTA = {
    [DIRECTION.NORTH]: { x: 0, y: -1, diagonal: false },
    [DIRECTION.EAST]: { x: 1, y: 0, diagonal: false },
    [DIRECTION.SOUTH]: { x: 0, y: 1, diagonal: false },
    [DIRECTION.WEST]: { x: -1, y: 0, diagonal: false }
};

/** Cada cuántos ticks se limpian los tiles que quedaron vacíos. */
const COMPACT_EVERY_TICKS = 600;

/** Hasta cuántas casillas se puede lanzar un objeto (arrastrarlo de un sitio del mapa a otro). */
const THROW_RANGE = 7;

/** Lo máximo que cabe en una pila (monedas, flechas…), como en Tibia. */
const MAX_PILA = 100;   // a 20 Hz, cada 30 segundos

/**
 * Los huecos de un contenedor que no dice cuántos tiene (`containerSize` en items.xml): los de
 * una mochila. Para cambiar los de un contenedor concreto, se cambia su `containerSize`.
 */
const CONTAINER_SIZE_DEFAULT = 20;

class World {
    constructor(options) {
        const opts = options || {};

        this.log = opts.logger || null;
        this.scheduler = opts.scheduler || null;
        this.now = opts.now || (() => Date.now());

        /** Contenido estático, lo rellena el motor. */
        this.itemTypes = new Map();
        this.monsterTypes = new Map();

        /**
         * Los aspectos que existen, cargados de `data/XML/outfits.xml`.
         *
         * El motor sólo necesita la LISTA: qué apariencias hay y cuáles tienen
         * añadidos. Los sprites y la paleta son del cliente.
         */
        this.outfitTypes = new Map();

        /** Los diálogos de NPC, por nombre. Los rellena el registro. */
        this.npcTypes = new Map();

        /** Los NPC vivos, por nombre, para poder encontrarlos sin recorrer el mundo. */
        this.npcs = new Map();

        /**
         * Qué objeto hace de dinero.
         *
         * Es configurable y no una constante porque el día que un datapack use otra moneda
         * —o varias— no debería haber que tocar el motor. El valor por defecto es el de
         * Tibia: 3031, la moneda de oro.
         */
        this.moneyItemId = 3031;

        /**
         * LAS MONEDAS Y LO QUE VALEN, como en Tibia: 100 de oro son un platino y 100 de platino
         * un cristal. El dinero que llevas es la suma de todas; al pagar se usan las que haga falta
         * y se devuelve el cambio. Se cambian unas por otras con clic derecho
         * (`data/scripts/actions/monedas.js`). De menor a mayor.
         */
        this.coinTypes = [
            { id: 3031, value: 1 },       // gold coin
            { id: 2152, value: 100 },     // platinum coin
            { id: 2160, value: 10000 }    // crystal coin
        ];

        /**
         * Lo que puede cargar cualquier criatura antes de contar su vocación.
         *
         * Son 4 onzas en las unidades de Tibia (centésimas de onza). El número es el suyo:
         * con él, un personaje de nivel 1 carga 4,05 oz si es mago y 4,25 si es caballero, y
         * las diferencias entre vocaciones sólo se notan al subir de nivel, que es cuando
         * tienen que notarse.
         */
        this.baseCapacityOz = 400;

        /** Las vocaciones, para saber cuánta capacidad gana cada nivel. Las pone el motor. */
        this.vocations = null;

        /** Lo que gana por nivel una criatura sin vocacion conocida. */
        this.defaultGainCap = 5;

        /**
         * El cuerpo de los monstruos que no dicen `corpse` (o dicen uno que no existe): una caja,
         * para que el botín tenga dónde ir. Y lo que dura antes de desaparecer.
         */
        this.corpseFallbackId = opts.corpseFallbackId || 0;
        this.corpseFallbackDurationMs = opts.corpseFallbackDurationMs || 120000;

        /**
         * EL CONTENEDOR CON EL QUE EMPIEZA UN PERSONAJE NUEVO, o null.
         *
         * Es lo que rompe el circulo del huevo y la gallina: sin contenedor no se puede coger
         * nada, y una mochila del suelo es "nada" hasta que tienes donde meterla. En Tibia un
         * personaje nuevo empieza con una puesta, y aqui igual.
         *
         * Lo pone el motor desde `config.js` (`newPlayerContainerId`). Si vale null no se da
         * nada, que es lo que quieren las pruebas que construyen un mundo a mano para medir
         * otra cosa: el mundo sabe hacerlo, pero solo lo hace si se le dice con que.
         */
        this.newPlayerContainerId = opts.newPlayerContainerId === undefined
            ? null : Number(opts.newPlayerContainerId);

        this.map = null;

        /** Estado vivo. */
        this.players = new Map();
        this.monsters = new Map();
        this.creatures = new Map();
        this.items = new Map();          // instanceId -> Item suelto en el suelo

        /**
         * Enganches con el resto del motor.
         *
         * Cada evento admite VARIOS suscriptores, no uno. Con una sola ranura, el
         * segundo sistema que quisiera enterarse de una muerte pisaría al primero
         * sin que nada avisara, y el fallo aparecería en el sistema que dejó de
         * funcionar, no en el que se suscribió. El gestor de spawns y, mañana, un
         * sistema de misiones o de logros quieren lo mismo.
         *
         * El mundo no conoce el registro de contenido: sólo avisa de lo que pasa y
         * quien esté suscrito decide. Sin esta separación, el mundo tendría que
         * saber qué es un `onStepIn`.
         */
        this.hooks = {
            onStepIn: [],            // (creature, tile, fromPosition)
            onStepOut: [],           // (creature, tile, toPosition)
            onCreatureAppear: [],    // (creature)
            onCreatureDisappear: [], // (creature)
            onMonsterDeath: [],      // (monster, killer)
            onPlayerDeath: [],       // (player, killer, dropped)
            onTextMessage: [],       // (player, text) privado, para uno
            onCreatureSay: []        // (creature, text) en voz alta, para quien oiga
        };

        /** Registro para las pruebas y para depurar sin instrumentar. */
        this.messages = [];
        this.teleports = [];
        this.says = [];

        this.startTime = this.now();

        /** Bucle. */
        this.tickIntervalMs = opts.tickIntervalMs || 50;
        this.timer = null;
        this.tickCount = 0;
        this.compactCounter = 0;
    }

    // =======================================================================
    // Suscripción a eventos
    // =======================================================================

    /**
     * Suscribe un handler a un evento del mundo.
     *
     * @param {string} event uno de los nombres de `this.hooks`
     * @param {Function} handler
     * @returns {Function} función para desuscribirse
     */
    on(event, handler) {
        if (!this.hooks[event]) {
            this.hooks[event] = [];
        }
        this.hooks[event].push(handler);

        return () => {
            this.hooks[event] = this.hooks[event].filter((fn) => fn !== handler);
        };
    }

    /**
     * Avisa a los suscriptores de un evento.
     *
     * Es la contrapartida de `on`, y lo usan los sistemas del propio motor (el
     * combate avisa de una muerte, la IA de nada). Un suscriptor que falla no
     * impide a los demás, igual que en el planificador: si un sistema revienta,
     * los otros siguen funcionando. Es lo que se quiere en un servidor vivo.
     */
    emit(event, ...args) {
        const listeners = this.hooks[event];
        if (!listeners || listeners.length === 0) {
            return 0;
        }

        listeners.forEach((handler) => {
            try {
                handler(...args);
            } catch (error) {
                if (this.log) {
                    this.log.error('un suscriptor de ' + event + ' fallo:\n' +
                        (error && error.stack ? error.stack : error));
                }
            }
        });

        return listeners.length;
    }

    // =======================================================================
    // Jugadores
    // =======================================================================

    createPlayer(name, position, opciones) {
        const opts = opciones || {};
        const player = new Player({
            name: name,
            position: position,
            speed: 220,
            maxHealth: 150,
            level: 1,
            vocation: opts.vocation || 'None',
            sex: opts.sex,
            premium: opts.premium === true
        });

        // La vida, el maná, la velocidad y las almas salen de la vocación (vocations.js).
        Vocacion.aplicarNivel(player, this.vocationOf(player), { curar: true });

        this.players.set(player.id, player);
        this._registerCreature(player);

        /*
         * Y SE LE PONE EL CONTENEDOR DE INICIO.
         *
         * Va aqui, en el unico sitio que crea jugadores, y no en la sesion ni en el repositorio:
         * un personaje nuevo tiene que empezar con mochila por el mismo camino entre por donde
         * entre -con base de datos o sin ella-, y dos sitios que lo hicieran por separado son dos
         * sitios donde olvidarse.
         */
        this.equipStartingContainer(player);

        return player;
    }

    /**
     * Le pone al jugador el contenedor de inicio, si hay uno configurado.
     *
     * SI YA TIENE UNO NO HACE NADA: un personaje que vuelve de la base con su mochila no puede
     * acabar con dos. Y SI NO ESTA DEFINIDO EL OBJETO tampoco: un id que no existe en `items.xml`
     * es un datapack mal escrito, y es mejor no dar nada y que se note que dar un objeto fantasma.
     *
     * @returns {boolean} si se le puso
     */
    equipStartingContainer(creature) {
        if (!creature || !this.newPlayerContainerId) {
            return false;
        }
        if (this.containerOf(creature)) {
            return false;
        }

        const definition = this.itemTypes.get(Number(this.newPlayerContainerId));
        if (!definition) {
            if (this.log) {
                this.log.warning('el contenedor de inicio (' + this.newPlayerContainerId +
                    ') no existe en items.xml: el personaje empezara sin mochila');
            }
            return false;
        }

        if (!(creature.inventory instanceof Array)) {
            creature.inventory = [];
        }

        /*
         * ENTRA CON LA RANURA DEL CONTENEDOR, que es la que declara el objeto en `items.xml`
         * (`slotType`). Si el objeto no declarara ranura no podria estar puesto, y entonces no
         * habria contenedor: se le pone la que le toque o, en su defecto, ninguna, y el objeto
         * quedaria dentro de si mismo, que es un absurdo que se ve enseguida en el panel.
         */
        const slot = this.slotOf(definition.id) || 'backpack';

        creature.inventory.push({
            slot: slot,
            position: creature.inventory.length,
            typeId: definition.id,
            count: 1,
            attributes: null
        });

        this.recomputeEquipment(creature);

        return true;
    }

    getPlayer(id) {
        return this.players.get(Number(id)) || null;
    }

    removePlayer(id) {
        const player = this.players.get(Number(id));
        if (!player) {
            return false;
        }
        this.players.delete(player.id);
        this._unregisterCreature(player);
        return true;
    }

    // =======================================================================
    // Monstruos
    // =======================================================================

    /**
     * Crea un monstruo a partir de su TIPO.
     *
     * La definición no se copia: el monstruo la referencia. Copiarla parecería más
     * seguro, pero significaría que recargar el contenido en caliente no afecta a
     * los monstruos ya vivos, y que doscientos monstruos del mismo tipo ocupan
     * doscientas veces lo mismo.
     */
    createMonster(typeName, position, spawn) {
        const definition = this.monsterTypes.get(typeName);
        if (!definition) {
            if (this.log) {
                this.log.warning('no existe el tipo de monstruo "' + typeName + '"');
            }
            return null;
        }

        const monster = new Monster({
            name: typeName,
            position: position,
            speed: definition.speed === undefined ? 220 : definition.speed,
            maxHealth: definition.maxHealth || definition.health || 100,
            monsterType: definition,
            spawn: spawn || null
        });

        // El aspecto lo declara la definición del monstruo. Si no lo declara se queda
        // el genérico, y eso es visible a propósito: un monstruo sin aspecto propio se
        // ve como un jugador, y es la señal de que falta declararlo.
        if (definition.outfit) {
            monster.outfit = normalizeOutfit(definition.outfit);
        }

        this.monsters.set(monster.id, monster);
        this._registerCreature(monster);

        this.emit('onCreatureAppear', monster);
        return monster;
    }

    getMonster(id) {
        return this.monsters.get(Number(id)) || null;
    }

    /**
     * Quita un monstruo del mundo SIN considerarlo una muerte.
     *
     * Es para limpieza: recargar el contenido, vaciar una zona, apagar el
     * servidor. No dispara el enganche de muerte a propósito, porque si lo
     * hiciera, recargar el datapack haría reaparecer a todos los monstruos como si
     * los hubieran matado.
     */
    removeMonster(id) {
        const monster = this.monsters.get(Number(id));
        if (!monster) {
            return false;
        }

        this.monsters.delete(monster.id);
        this._unregisterCreature(monster);

        this.emit('onCreatureDisappear', monster);
        return true;
    }

    /**
     * Mata a un monstruo: lo quita del mundo y AVISA de la muerte.
     *
     * El aviso es lo que hace que el gestor de spawns programe la reaparición.
     * Está separado de `removeMonster` para que "morir" y "desaparecer" no sean
     * indistinguibles: son cosas distintas y el motor necesita poder hacer una sin
     * la otra.
     */
    killMonster(id, killer) {
        const monster = this.monsters.get(Number(id));
        if (!monster) {
            return false;
        }

        this.removeMonster(monster.id);

        this.emit('onMonsterDeath', monster, killer || null);
        return true;
    }

    // =======================================================================
    // Criaturas: registro común
    // =======================================================================

    _registerCreature(creature) {
        this.creatures.set(creature.id, creature);

        const tile = this.map ? this.map.getOrCreateTile(
            creature.position.x, creature.position.y, creature.position.z) : null;

        if (tile) {
            tile.addCreature(creature);
            creature.tile = tile;
        }
    }

    _unregisterCreature(creature) {
        this.creatures.delete(creature.id);

        if (creature.tile) {
            creature.tile.removeCreature(creature);
            creature.tile = null;
        }
    }

    getCreature(id) {
        return this.creatures.get(Number(id)) || null;
    }

    /**
     * ¿Hay alguna criatura en esa celda?
     *
     * Se consulta al tile y no a un índice aparte para que no puedan
     * desincronizarse: el tile ES el índice.
     */
    hasCreatureAt(x, y, z) {
        const tile = this.map ? this.map.getTile(x, y, z) : null;
        return !!(tile && tile.creatures.length > 0);
    }

    getCreaturesAt(x, y, z) {
        const tile = this.map ? this.map.getTile(x, y, z) : null;
        return tile ? tile.creatures.slice() : [];
    }

    /**
     * La casilla libre más cercana a `position` (ella misma si lo está): transitable y sin
     * nadie más que `except`. Es lo que hace Tibia al entrar en el templo cuando ya hay alguien
     * de pie: apareces al lado, no encima. Busca en anillos de hasta `radio` casillas en la
     * misma planta; si no hay ninguna, devuelve null.
     */
    freeTileNear(position, except, radio) {
        if (!this.map) {
            return null;
        }
        const libre = (x, y, z) => this.map.isWalkable(x, y, z) &&
            this.getCreaturesAt(x, y, z).every((c) => c === except);
        const { x, y, z } = position;
        const maximo = radio || 5;
        for (let r = 0; r <= maximo; r += 1) {
            for (let dy = -r; dy <= r; dy += 1) {
                for (let dx = -r; dx <= r; dx += 1) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) === r && libre(x + dx, y + dy, z)) {
                        return { x: x + dx, y: y + dy, z: z };
                    }
                }
            }
        }
        return null;
    }

    // =======================================================================
    // Movimiento
    // =======================================================================

    /**
     * Normaliza lo que llega como "hacia dónde" a un desplazamiento.
     *
     * Se aceptan las dos formas porque las dos son naturales en sitios distintos:
     * el cliente envía un DESPLAZAMIENTO (noroeste es {-1,-1}), mientras que para
     * girar o mirar se usa una DIRECCIÓN cardinal. Aceptar sólo una obligaría a
     * convertir en cada llamante.
     *
     * Se normaliza con `sign` para que un desplazamiento de (3,0) sea el mismo que
     * (1,0): un paso es un paso, y validar la distancia es cosa de `map.canWalk`.
     *
     * @param {number|Object} input dirección 0..3, o `{x, y}`
     * @returns {{x: number, y: number, diagonal: boolean}|null}
     */
    _normalizeOffset(input) {
        let x = 0;
        let y = 0;

        if (typeof input === 'number') {
            const delta = DIRECTION_DELTA[input];
            if (!delta) {
                return null;
            }
            x = delta.x;
            y = delta.y;
        } else if (input && typeof input === 'object') {
            x = Math.sign(Number(input.x) || 0);
            y = Math.sign(Number(input.y) || 0);
        } else {
            return null;
        }

        if (x === 0 && y === 0) {
            return null;
        }

        return { x: x, y: y, diagonal: x !== 0 && y !== 0 };
    }

    /** ¿Puede esta criatura dar este paso? No lo da, sólo lo comprueba. */
    canWalk(creature, offsetInput) {
        const offset = this._normalizeOffset(offsetInput);
        if (!offset) {
            return { allowed: false, reason: 'badDirection' };
        }

        const from = creature.position;
        const to = {
            x: from.x + offset.x,
            y: from.y + offset.y,
            z: from.z
        };

        return this.map.canWalk(from, to);
    }

    /**
     * Mueve una criatura un paso.
     *
     * Devuelve un resultado explícito en vez de un booleano porque quien llama
     * necesita distinguir "no se puede" de "todavía no le toca": lo primero es un
     * rechazo, lo segundo es el ritmo normal del juego, y confundirlos hace que el
     * cliente muestre mensajes de error al caminar.
     *
     * @param {Creature} creature
     * @param {number|Object} offsetInput dirección 0..3 o desplazamiento `{x,y}`,
     *        cada componente en {-1, 0, 1}
     */
    moveCreature(creature, offsetInput) {
        const now = this.now();

        if (creature.removed) {
            return { moved: false, reason: 'removed' };
        }
        if (now < creature.nextStepAt) {
            return { moved: false, reason: 'exhausted', waitMs: creature.nextStepAt - now };
        }

        const offset = this._normalizeOffset(offsetInput);
        if (!offset) {
            return { moved: false, reason: 'badDirection' };
        }

        const from = creature.position.copy();
        const to = new Position(from.x + offset.x, from.y + offset.y, from.z);

        const check = this.map.canWalk(from, to);
        if (!check.allowed) {
            // Aun sin moverse, la criatura mira hacia donde intentaba ir: es lo
            // que hace Tibia y lo que espera cualquiera al chocar con una pared.
            creature.faceTowards(to);
            return { moved: false, reason: check.reason };
        }

        this._relocate(creature, to, offset);

        // El coste del paso lo pone el SUELO de destino, no el de origen: caminar
        // hacia un charco es más lento, y salir de él no.
        const ground = this.map.getGround(to.x, to.y, to.z);
        const groundSpeed = ground ? ground.getAttribute('groundSpeed') : undefined;

        creature.nextStepAt = now + creature.getStepDuration({
            groundSpeed: groundSpeed === undefined ? undefined : Number(groundSpeed),
            diagonal: offset.diagonal
        });

        /**
         * Cuanto duro este paso. El protocolo lo envia al cliente para que
         * interpole el desplazamiento durante exactamente ese tiempo: si el
         * cliente eligiera la duracion por su cuenta, el muneco iria a un ritmo
         * distinto del que el motor considera real y el desfase se veria en cada
         * paso.
         */
        creature.lastStepDuration = creature.nextStepAt - now;

        return {
            moved: true,
            from: from,
            to: to,
            diagonal: offset.diagonal,
            duration: creature.lastStepDuration,
            nextStepAt: creature.nextStepAt
        };
    }

    /**
     * Cambia de tile sin comprobar nada. Lo usan el movimiento y el teletransporte.
     *
     * @param {Object} [offset] desplazamiento, para poder orientar a la criatura
     */
    _relocate(creature, to, offset) {
        const fromTile = creature.tile;
        const fromPosition = creature.position.copy();

        if (fromTile) {
            fromTile.removeCreature(creature);
        }

        const toTile = this.map.getOrCreateTile(to.x, to.y, to.z);
        if (toTile) {
            toTile.addCreature(creature);
        }
        creature.tile = toTile;
        creature._applyPosition(to);

        // La orientación se toma del desplazamiento, no de comparar con el
        // destino: una vez aplicada la posición, la criatura y el destino son el
        // mismo punto y la comparación no encontraría desplazamiento alguno.
        if (offset) {
            creature.faceOffset(offset);
        }

        if (fromTile) {
            this.emit('onStepOut', creature, fromTile, to);
        }
        if (toTile) {
            this.emit('onStepIn', creature, toTile, fromPosition);
        }

        return to;
    }

    /**
     * Teletransporta sin comprobar el camino.
     *
     * En Tibia subir escaleras es esto: un teletransporte disfrazado, no un paso.
     * Por eso no pasa por `moveCreature` ni paga coste de movimiento.
     */
    teleportCreature(creature, position) {
        const target = Position.from(position);

        if (!this.map.inBounds(target.x, target.y, target.z)) {
            return { moved: false, reason: 'outOfBounds' };
        }

        const from = creature.position.copy();
        this._relocate(creature, target);

        // Un teletransporte no deja exhausto, pero sí reinicia el reloj del paso
        // a "ahora", para que no se pueda encadenar un paso inmediatamente
        // después aprovechando un contador viejo.
        creature.nextStepAt = this.now();

        /**
         * Y la duración del paso se pone a cero, porque un teletransporte NO se
         * anda. Sin esto, el cliente recibiría el salto con la duración del último
         * paso que dio la criatura y vería al muñeco deslizarse por media pantalla
         * durante medio segundo en vez de aparecer.
         */
        creature.lastStepDuration = 0;

        return { moved: true, from: from, to: target };
    }

    // =======================================================================
    // Items
    // =======================================================================

    /**
     * Crea una instancia de item y, si se le da posición, la pone en el suelo.
     */
    createItem(typeId, count, position) {
        const definition = this.itemTypes.get(Number(typeId));
        if (!definition) {
            if (this.log) {
                this.log.warning('createItem con un tipo desconocido: ' + typeId);
            }
            return null;
        }

        const item = new Item(definition, { count: count || 1 });
        item.instanceId = this._allocateItemId();
        this.items.set(item.instanceId, item);

        if (position) {
            this.addItemToTile(item, position);
        }
        return item;
    }

    /**
     * Da identidad a un objeto que vino CON EL MAPA.
     *
     * Los objetos del mapa se cargan sin instancia (son miles y casi ninguno la necesita), pero
     * los que llevan atributos —actionId, uniqueId, destino de teleport...— sí: un script los
     * recibe por su uid y les pregunta sus atributos. Se hace la primera vez que hace falta.
     */
    adoptItem(item) {
        if (item && !item.instanceId) {
            item.instanceId = this._allocateItemId();
            this.items.set(item.instanceId, item);
        }
        return item ? item.instanceId : 0;
    }

    _allocateItemId() {
        // Se reutiliza el contador de criaturas para que los identificadores de
        // instancia sean únicos en todo el mundo. Dos contadores distintos
        // acabarían chocando en el protocolo, que no distingue de qué tabla sale
        // cada id.
        const { allocateId } = require('./creature');
        return allocateId();
    }

    addItemToTile(item, position) {
        const target = Position.from(position);
        const tile = this.map.getOrCreateTile(target.x, target.y, target.z);
        if (!tile) {
            return false;
        }
        tile.addItem(item);
        this.emit('onItemAdded', item, tile);

        /*
         * Se avisa de que la casilla cambió.
         *
         * Sin esto, un objeto creado por contenido —el botín de un monstruo, lo que crea
         * `/item`— existe en el motor y NO en la pantalla del jugador hasta que se mueve. El
         * motor está bien y el cliente miente, que es la peor combinación porque ninguna
         * prueba del motor lo ve: es el mismo fallo que el de recoger y soltar, por el otro
         * lado.
         */
        this.emit('onTileChanged', target, tile);

        return true;
    }

    removeItem(instanceId) {
        const item = this.items.get(Number(instanceId));
        if (!item) {
            return false;
        }

        // Quitarlo del tile es imprescindible: si sólo se borrara de la tabla,
        // seguiría dibujándose y bloqueando el paso, y el fallo aparecería mucho
        // después de su causa.
        if (item.position) {
            const tile = this.map.getTile(item.position.x, item.position.y, item.position.z);
            if (tile) {
                tile.removeItem(item);
                this.emit('onItemRemoved', item, tile);
            }
        }
        this.items.delete(item.instanceId);

        // Y se avisa, por lo mismo que al ponerlo: quitarlo del motor no lo quita de la
        // pantalla. Va DESPUÉS de sacarlo de la tabla, para que quien escuche y mire el mundo
        // lo encuentre ya coherente y no a medias.
        this.emit('onTileChanged', item.position, null);

        return true;
    }

    /**
     * TRANSFORMA un objeto en otro tipo sin cambiarle la instancia: lo que hacen las puertas al
     * abrirse (la cerrada se vuelve la abierta) y lo que en TFS es `item:transform(id)`.
     *
     * Se saca y se vuelve a meter en su casilla porque el tipo nuevo puede ir en otra banda del
     * apilado (una puerta abierta va ENCIMA de las criaturas y la cerrada no), y se avisa del
     * cambio como cuando se pone o se quita algo.
     *
     * @returns {boolean} false si el objeto o el tipo no existen
     */
    transformItem(instanceId, newTypeId) {
        const item = this.items.get(Number(instanceId));
        const definition = this.itemTypes.get(Number(newTypeId));
        if (!item || !definition) {
            return false;
        }
        const tile = item.position ? this.map.getTile(item.position.x, item.position.y, item.position.z) : null;
        if (tile) {
            tile.removeItem(item);
        }
        item.definition = definition;
        item.typeId = definition.id;
        if (tile) {
            tile.addItem(item);
            this.emit('onTileChanged', item.position, item);
        }
        return true;
    }

    // =======================================================================
    // Efectos: lo que se ve pasar (una llama, una flecha que vuela)
    // =======================================================================

    /** Un efecto sobre una casilla (`Game.sendMagicEffect`). El número, de `shared/js/efectos.mjs`. */
    sendMagicEffect(position, efecto) {
        if (!position || !esEfecto(efecto)) {
            return false;
        }
        this.emit('onMagicEffect', Position.from(position), Number(efecto));
        return true;
    }

    /** Un proyectil que vuela de una casilla a otra (`Game.sendDistanceEffect`). */
    sendDistanceEffect(desde, hasta, proyectil) {
        if (!desde || !hasta || !esProyectil(proyectil)) {
            return false;
        }
        this.emit('onDistanceEffect', Position.from(desde), Position.from(hasta), Number(proyectil));
        return true;
    }

    // =======================================================================
    // Contenedores en el suelo: cuerpos, cajas, cofres
    // =======================================================================

    /**
     * Lo que hay DENTRO de un objeto del suelo que es contenedor (un cuerpo, una caja).
     *
     * Son objetos de verdad (`Item`, con su instancia), guardados en `item.contents` y sin
     * posición: no están en ninguna casilla, están dentro del contenedor.
     */
    contentsOfItem(container) {
        if (!container) {
            return [];
        }
        if (!Array.isArray(container.contents)) {
            container.contents = [];
        }
        return container.contents;
    }

    /** Cuántos huecos tiene: `containerSize` de items.xml (20 si no lo dice, como una mochila). */
    capacityOfContainer(container) {
        const size = Number(container && container.getAttribute('containerSize'));
        return size > 0 ? size : this.capacityOfType(container && container.typeId);
    }

    /**
     * Mete objetos en un contenedor del suelo (el botín en el cuerpo).
     * Las pilas se juntan; si no queda hueco, devuelve null y no mete nada.
     */
    addToGroundContainer(container, typeId, count) {
        const definition = this.itemTypes.get(Number(typeId));
        if (!container || !definition) {
            return null;
        }
        const contents = this.contentsOfItem(container);
        const amount = Math.max(1, Number(count) || 1);
        const stackable = definition.attributes && definition.attributes.stackable;
        if (!stackable) {
            if (contents.length >= this.capacityOfContainer(container)) {
                return null;
            }
            const item = this.createItem(definition.id, amount, null);
            item.parent = container;
            contents.push(item);
            return item;
        }

        // Pilas de 100 como mucho: se rellenan las que hay y lo que sobra va en pilas nuevas, cada
        // una en su hueco. Si no caben todas, no se mete nada.
        const iguales = contents.filter((item) => item.typeId === definition.id && item.count < MAX_PILA);
        const hueco = iguales.reduce((total, item) => total + MAX_PILA - item.count, 0);
        const nuevas = Math.ceil(Math.max(0, amount - hueco) / MAX_PILA);
        if (nuevas > 0 && contents.length + nuevas > this.capacityOfContainer(container)) {
            return null;
        }
        let quedan = amount;
        let ultimo = null;
        for (const item of iguales) {
            if (quedan <= 0) {
                break;
            }
            const cabe = Math.min(MAX_PILA - item.count, quedan);
            item.count += cabe;
            quedan -= cabe;
            ultimo = item;
        }
        while (quedan > 0) {
            const cuantos = Math.min(MAX_PILA, quedan);
            ultimo = this.createItem(definition.id, cuantos, null);
            ultimo.parent = container;
            contents.push(ultimo);
            quedan -= cuantos;
        }
        return ultimo;
    }

    /**
     * EL CUERPO DE UN MONSTRUO: el objeto `corpse` de su definición, en la casilla donde murió.
     *
     * Si no tiene, o el que dice no existe en items.xml, se usa la caja de `corpseFallbackId`
     * (config.js): así todos dejan algo donde meter el botín. El cuerpo empieza a pudrirse en
     * cuanto aparece (`decayTo` y `duration` de items.xml).
     *
     * @returns {Item|null}
     */
    createCorpse(monster) {
        const definition = monster && monster.monsterType;
        const wanted = definition && definition.corpse ? Number(definition.corpse) : 0;
        let typeId = wanted && this.itemTypes.has(wanted) ? wanted : 0;

        if (!typeId) {
            if (wanted && this.log) {
                this.log.warning('el cuerpo ' + wanted + ' de ' + monster.name + ' no existe en items.xml: se usa la caja');
            }
            typeId = this.itemTypes.has(Number(this.corpseFallbackId)) ? Number(this.corpseFallbackId) : 0;
        }
        if (!typeId) {
            return null;
        }

        const corpse = this.createItem(typeId, 1, monster.position);
        if (!corpse) {
            return null;
        }
        corpse.attributes.corpseOf = monster.name;
        // Un cuerpo no se coge (ni la caja que hace de cuerpo): se abre.
        corpse.attributes.pickupable = 0;
        this.startDecay(corpse, typeId === wanted ? null : this.corpseFallbackDurationMs);
        return corpse;
    }

    /**
     * Programa la siguiente etapa de un objeto que se pudre, como en TFS: al pasar `duration`
     * segundos se convierte en `decayTo` (el cuerpo fresco, el podrido, los huesos) o, si no
     * tiene, desaparece. `duracionMs` fuerza la duración (la caja de los que no tienen cuerpo).
     */
    startDecay(item, duracionMs) {
        if (!item || !this.scheduler) {
            return false;
        }
        const seconds = Number(item.getAttribute('duration'));
        const ms = duracionMs || (seconds > 0 ? seconds * 1000 : 0);
        if (!ms) {
            return false;
        }
        const instanceId = item.instanceId;
        const typeId = item.typeId;
        this.scheduler.schedule(ms, () => this._decay(instanceId, typeId), 'decay ' + instanceId);
        return true;
    }

    _decay(instanceId, typeId) {
        const item = this.items.get(Number(instanceId));
        // Ya no está, o alguien lo cambió (una puerta que se abrió): esta etapa ya no vale.
        if (!item || item.typeId !== typeId || !item.position) {
            return;
        }
        const next = Number(item.getAttribute('decayTo')) || 0;
        if (next && this.itemTypes.has(next)) {
            this.transformItem(instanceId, next);
            // Unos huesos no son contenedor: lo que quedaba dentro se pierde, como en Tibia.
            if (!item.isContainer) {
                this._forgetContents(item);
            }
            this.startDecay(item);
            return;
        }
        this._forgetContents(item);
        this.removeItem(instanceId);
    }

    /**
     * PONER EN EL SUELO JUNTANDO PILAS: si lo que se pone es apilable y arriba de la casilla hay
     * una pila del mismo objeto, se juntan (hasta MAX_PILA, como las monedas en Tibia); lo que no
     * quepa se queda como otra pila encima.
     *
     * @returns {{ok: boolean, item?: Item}} `item` es la pila donde ha quedado
     */
    _ponerJuntando(item, position) {
        const tile = this.map.getTile(Number(position.x), Number(position.y), Number(position.z));
        const pila = tile && item.stackable ? tile.downItems[tile.downItems.length - 1] : null;
        if (pila && pila !== item && pila.typeId === item.typeId && pila.count < MAX_PILA) {
            const cabe = Math.min(MAX_PILA - pila.count, item.count);
            pila.count += cabe;
            item.count -= cabe;
            if (item.count <= 0) {
                this.items.delete(item.instanceId);
                this.emit('onItemAdded', pila, tile);
                this.emit('onTileChanged', pila.position, pila);
                return { ok: true, item: pila };
            }
        }
        return this.addItemToTile(item, position) ? { ok: true, item: item } : { ok: false };
    }

    /** Saca un objeto de su contenedor del suelo (sin borrarlo del mundo). */
    _sacarDeContenedor(item) {
        const contents = this.contentsOfItem(item.parent);
        const i = contents.indexOf(item);
        if (i !== -1) {
            contents.splice(i, 1);
        }
        item.parent = null;
    }

    _forgetContents(container) {
        (container.contents || []).forEach((inner) => this.items.delete(inner.instanceId));
        container.contents = [];
    }

    /** ¿Lo tiene al alcance de la mano (al lado y en su planta)? */
    canReach(creature, position) {
        return !!(creature && position && creature.position.z === position.z &&
            Math.max(Math.abs(creature.position.x - position.x), Math.abs(creature.position.y - position.y)) <= 1);
    }

    /**
     * Lo que se manda al cliente para dibujar la ventana de un contenedor del suelo.
     */
    containerPayload(container) {
        return {
            id: container.instanceId,
            typeId: container.typeId,
            name: container.getName() || 'contenedor',
            capacity: this.capacityOfContainer(container),
            items: this.contentsOfItem(container).map((item, index) => ({
                index: index,
                typeId: item.typeId,
                count: item.count,
                name: item.getName() || ('objeto ' + item.typeId)
            }))
        };
    }

    /**
     * Saca un objeto de un contenedor del suelo y lo mete en la mochila del jugador: lo que pasa
     * al coger el botín de un cuerpo. Mismas reglas que recoger del suelo: hay que estar al
     * lado, llevar mochila y poder con el peso.
     *
     * @returns {{ok: boolean, reason?: string, item?: Item}}
     */
    takeFromContainer(creature, containerId, index) {
        const container = this.items.get(Number(containerId));
        if (!container || !container.position || !container.isContainer) {
            return { ok: false, reason: 'noContainer' };
        }
        if (!this.canReach(creature, container.position)) {
            return { ok: false, reason: 'tooFar' };
        }
        const contents = this.contentsOfItem(container);
        const item = contents[Number(index)];
        if (!item) {
            return { ok: false, reason: 'noItem' };
        }
        if (!this.hasContainer(creature)) {
            return { ok: false, reason: 'noContainer' };
        }
        if (!this.fitsInBackpack(creature, item.typeId, 0, item.count)) {
            return { ok: false, reason: 'backpackFull', slots: this.backpackCapacity(creature) };
        }
        if (!this.canCarry(creature, this.weightOfItem(item.typeId, item.count))) {
            return { ok: false, reason: 'tooHeavy' };
        }
        this._addToContainer(creature, item.typeId, item.count, item.attributes);
        contents.splice(Number(index), 1);
        this.items.delete(item.instanceId);
        item.parent = null;
        return { ok: true, item: item };
    }

    // =======================================================================
    // Equipar
    // =======================================================================

    /**
     * Lo que lleva puesto en una ranura, o null.
     *
     * LAS COSAS EQUIPADAS VIVEN EN EL MISMO INVENTARIO que las demas, distinguidas por su
     * `slot`. No hay una lista de equipo aparte, y no la hay por tres razones que salen
     * gratis: el peso ya las cuenta sin tocar nada, la persistencia ya las guarda porque la
     * tabla `player_items` tiene una columna `slot` desde el principio, y no existe el
     * problema de tener el mismo objeto en dos listas a la vez. Una lista aparte habria que
     * sincronizarla, y esa sincronizacion es exactamente donde aparecen los duplicados.
     */
    equippedIn(creature, slot) {
        if (!(creature.inventory instanceof Array)) {
            return null;
        }
        return creature.inventory.find((entry) => entry.slot === String(slot)) || null;
    }

    /** Todo lo que lleva puesto. */
    equipmentOf(creature) {
        if (!(creature.inventory instanceof Array)) {
            return [];
        }
        return creature.inventory.filter((entry) => entry.slot !== SLOT_INSIDE);
    }

    /**
     * LO QUE LLEVA DENTRO DE LA MOCHILA.
     *
     * Es la otra mitad del inventario: todo lo que no esta puesto esta dentro del contenedor, y
     * el `slot` de esas entradas lo dice. No se pregunta por "lo que no es el contenedor" sino
     * por la ranura `inside`, porque es el motor quien decide donde va cada cosa y el cliente
     * solo obedece.
     */
    contentsOf(creature) {
        if (!(creature.inventory instanceof Array)) {
            return [];
        }
        return creature.inventory.filter((entry) => entry.slot === SLOT_INSIDE);
    }

    /** ¿El tipo de este objeto es un contenedor, segun `items.xml`? */
    isContainerType(typeId) {
        const definition = this.itemTypes.get(Number(typeId));
        return Boolean(definition && definition.attributes && definition.attributes.isContainer);
    }

    /** ¿Esta entrada es un contenedor? Se pregunta por el OBJETO y no por la ranura. */
    isContainerEntry(entry) {
        return Boolean(entry) && this.isContainerType(entry.typeId);
    }

    /**
     * EL CONTENEDOR EQUIPADO, o null.
     *
     * Es la mochila: lo que hay que tener puesto para poder llevar cosas. Se busca entre lo que
     * esta EQUIPADO -ranura distinta de `inside`- y no entre todo el inventario, y esa diferencia
     * es la regla entera: una mochila DENTRO de otra no te deja coger nada, porque entonces
     * estaria dentro de si misma.
     *
     * Se exige ademas que el objeto declare `isContainer`: la ranura dice DONDE va y la bandera
     * dice QUE es, y un objeto en la ranura de la mochila que no fuera un contenedor no podria
     * guardar nada.
     */
    containerOf(creature) {
        if (!(creature.inventory instanceof Array)) {
            return null;
        }
        return creature.inventory.find((entry) =>
            entry.slot !== SLOT_INSIDE && this.isContainerEntry(entry)) || null;
    }

    /** ¿Tiene donde llevar cosas? Es la pregunta que decide si se puede coger, comprar o recibir. */
    hasContainer(creature) {
        return this.containerOf(creature) !== null;
    }

    /**
     * LOS HUECOS DE UN CONTENEDOR: su `containerSize` de items.xml, o `CONTAINER_SIZE_DEFAULT`
     * (20, el de una mochila) si no lo dice. Cambiando el número en items.xml cambia el límite.
     */
    capacityOfType(typeId) {
        const definition = this.itemTypes.get(Number(typeId));
        const size = Number(definition && definition.attributes && definition.attributes.containerSize);
        return size > 0 ? size : CONTAINER_SIZE_DEFAULT;
    }

    /** Los huecos de la mochila que lleva puesta (0 sin mochila). */
    backpackCapacity(creature) {
        const mochila = this.containerOf(creature);
        return mochila ? this.capacityOfType(mochila.typeId) : 0;
    }

    /**
     * ¿CABE EN LA MOCHILA? Cada cosa ocupa un hueco, menos lo de una pila que se junta con otra
     * igual que ya está dentro (las monedas) mientras esa no llegue a MAX_PILA: lo que sobra hace
     * pilas nuevas de hasta 100, y cada una ocupa su hueco. `libres` son los huecos que se van a
     * quedar libres en el mismo movimiento (lo que sale de la mochila para ponerse); `count`, cuántos
     * se meten (1 si no se dice).
     */
    fitsInBackpack(creature, typeId, libres, count) {
        const dentro = this.contentsOf(creature);
        const nuevas = this.pilasNuevas(creature, typeId, count);
        if (nuevas === 0) {
            return true;
        }
        return dentro.length - (Number(libres) || 0) + nuevas <= this.backpackCapacity(creature);
    }

    /** ¿Este tipo de objeto se apila (`stackable` en items.xml)? */
    esApilable(typeId) {
        const definition = this.itemTypes.get(Number(typeId));
        return !!(definition && definition.attributes && definition.attributes.stackable);
    }

    /**
     * Cuántas PILAS NUEVAS (huecos) hacen falta para meter `count` de un tipo en la mochila: lo que
     * no quepa en las pilas que ya hay (hasta MAX_PILA cada una) va en pilas nuevas de 100.
     * `excluir` es una entrada que no cuenta (la que se está moviendo).
     */
    pilasNuevas(creature, typeId, count, excluir) {
        const cuantos = Math.max(1, Math.trunc(Number(count) || 1));
        if (!this.esApilable(typeId)) {
            return 1;
        }
        const hueco = this.contentsOf(creature)
            .filter((entry) => entry !== excluir && entry.typeId === Number(typeId))
            .reduce((total, entry) => total + Math.max(0, MAX_PILA - entry.count), 0);
        return Math.ceil(Math.max(0, cuantos - hueco) / MAX_PILA);
    }

    /**
     * ¿Se puede sacar esta entrada de su sitio?
     *
     * EL CONTAINER NO SE PUEDE MOVER CON COSAS DENTRO, y no es un capricho: en este motor el
     * contenido es una lista plana con la ranura `inside`, no viaja dentro del objeto. Soltar la
     * mochila con cosas dejaria esas cosas "dentro" de nada: no se podrian sacar ni coger, porque
     * no habria contenedor. Se prefiere decir que no a dejar un inventario roto.
     *
     * @returns {string|null} el motivo por el que no se puede, o null si si
     */
    _reasonCannotRemoveContainer(creature, entry) {
        if (!this.isContainerEntry(entry)) {
            return null;
        }
        if (this.containerOf(creature) !== entry) {
            return null;
        }
        return this.contentsOf(creature).length > 0 ? 'containerNotEmpty' : null;
    }

    /**
     * La ranura donde iria un objeto, segun lo que declare `items.xml`.
     *
     * @returns {string|null} null si no es equipable, que no es un error: la mayoria de las
     * cosas no lo son.
     */
    slotOf(typeId) {
        const definition = this.itemTypes.get(Number(typeId));
        const attributes = (definition && definition.attributes) || {};
        const weaponType = attributes.weaponType ? String(attributes.weaponType) : null;

        // Como en Tibia: el escudo va en la mano izquierda y el arma en la derecha, aunque
        // items.xml no diga `slotType` (las armas del OpenTibia Sprite Pack no lo traen).
        if (weaponType === 'shield') {
            return 'shield';
        }
        if (attributes.slotType) {
            return String(attributes.slotType);
        }
        if (weaponType === 'ammunition') {
            return 'ammo';
        }
        return weaponType ? 'hand' : null;
    }

    /** El arma que lleva en la mano (su ficha de items.xml), o null si pega con el puño. */
    weaponOf(creature) {
        const entry = this.equippedIn(creature, 'hand');
        const definition = entry ? this.itemTypes.get(entry.typeId) : null;
        return definition || null;
    }

    /**
     * Recalcula lo que aporta lo que lleva puesto.
     *
     * ES EL UNICO SITIO QUE ESCRIBE `weaponAttack` Y `armorLevel`, y por eso no se tocan
     * desde fuera. Son un VALOR DERIVADO del equipo: si un script pudiera subir el ataque por
     * su cuenta, el arma y el ataque dirian cosas distintas y no habria forma de saber cual
     * manda. Es la misma decision que con el dinero y con la capacidad.
     *
     * El arma suma ataque y lo demas suma defensa. Un objeto que declarara las dos cosas
     * contaria en las dos, que es lo que se espera de un escudo que ademas golpea.
     */
    recomputeEquipment(creature) {
        let weaponAttack = 0;
        let armorLevel = 0;

        this.equipmentOf(creature).forEach((entry) => {
            const definition = this.itemTypes.get(entry.typeId);
            const attributes = (definition && definition.attributes) || {};

            if (attributes.attack) {
                weaponAttack += Number(attributes.attack);
            }
            if (attributes.defense) {
                armorLevel += Number(attributes.defense);
            }
        });

        creature.weaponAttack = weaponAttack;
        creature.armorLevel = armorLevel;

        // ¿QUÉ SE HA PUESTO Y QUÉ SE HA QUITADO? Para los `onEquip` / `onDeEquip` de los scripts.
        // La primera vez (al entrar) sólo se apunta lo que lleva: entrar no es ponerse nada.
        if (creature.isPlayer && creature.isPlayer()) {
            const ahora = {};
            this.equipmentOf(creature).forEach((entry) => { ahora[entry.slot] = entry.typeId; });
            const antes = creature._equipoVisto;
            creature._equipoVisto = ahora;
            if (antes) {
                new Set(Object.keys(antes).concat(Object.keys(ahora))).forEach((slot) => {
                    if (antes[slot] === ahora[slot]) {
                        return;
                    }
                    if (antes[slot]) {
                        this.emit('onDeEquip', creature, antes[slot], slot);
                    }
                    if (ahora[slot]) {
                        this.emit('onEquip', creature, ahora[slot], slot);
                    }
                });
            }
        }

        // El tipo de arma decide qué skill pega y se entrena (sword, axe, club, distance…), y la
        // vocación cuánto vale la armadura (`formula.armor` de vocations.js).
        const weapon = this.weaponOf(creature);
        creature.weaponType = weapon && weapon.attributes.weaponType ? String(weapon.attributes.weaponType) : null;
        creature.weaponRange = weapon && weapon.attributes.range ? Number(weapon.attributes.range) : 0;
        if (creature.isPlayer && creature.isPlayer()) {
            const formula = this.vocationOf(creature).formula || {};
            creature.armorFactor = formula.armor || 1;
        }

        return { weaponAttack: weaponAttack, armorLevel: armorLevel };
    }

    /**
     * Se pone un objeto del inventario.
     *
     * Si la ranura estaba ocupada, lo que habia vuelve al inventario. NO se rechaza: cambiar
     * de espada es una sola accion, no dos, y obligar a quitarse la vieja antes haria que
     * medio cambio dejara al jugador sin arma.
     *
     * @returns {{ok: boolean, reason?: string, slot?: string, replaced?: Object}}
     */
    equipItem(creature, index) {
        const inventory = creature.inventory;
        const position = Number(index);

        if (!(inventory instanceof Array) || position < 0 || position >= inventory.length) {
            return { ok: false, reason: 'badSlot' };
        }

        const entry = inventory[position];

        if (entry.slot !== SLOT_INSIDE) {
            return { ok: false, reason: 'alreadyEquipped' };
        }

        const slot = this.slotOf(entry.typeId);

        if (!slot) {
            return { ok: false, reason: 'notEquippable' };
        }

        /*
         * SI LO QUE SE PONE ES UN CONTENEDOR, lo que hubiera en esa ranura no puede volver "a la
         * mochila": la mochila ES esa ranura. Cambiar una mochila por otra con cosas dentro se
         * rechaza por el mismo motivo que soltarla, que esta contado en
         * `_reasonCannotRemoveContainer`.
         */
        const previous = this.equippedIn(creature, slot);
        if (previous) {
            const blocked = this._reasonCannotRemoveContainer(creature, previous);
            if (blocked) {
                return { ok: false, reason: blocked };
            }
            // Y lo que se quita tiene que ir A ALGUN SITIO: sin contenedor se quedaria dentro de
            // nada. Se puede llegar aqui sin mochila -ponerse algo del suelo no la necesita-, asi
            // que el caso existe y se dice.
            if (!this.hasContainer(creature)) {
                return { ok: false, reason: 'noContainer' };
            }
            previous.slot = SLOT_INSIDE;
        }

        entry.slot = slot;

        const stats = this.recomputeEquipment(creature);

        return { ok: true, slot: slot, replaced: previous, stats: stats };
    }

    /**
     * Se quita lo que lleva puesto en una ranura.
     *
     * @returns {{ok: boolean, reason?: string, item?: Object}}
     */
    unequipItem(creature, slot) {
        const entry = this.equippedIn(creature, slot);

        if (!entry) {
            return { ok: false, reason: 'emptySlot' };
        }

        // Quitarse la mochila con cosas dentro dejaria esas cosas dentro de nada.
        const blocked = this._reasonCannotRemoveContainer(creature, entry);
        if (blocked) {
            return { ok: false, reason: blocked };
        }
        if (entry !== this.containerOf(creature) &&
            !this.fitsInBackpack(creature, entry.typeId, 0, entry.count)) {
            return { ok: false, reason: 'backpackFull', slots: this.backpackCapacity(creature) };
        }

        // Una pila (las flechas) se junta con las que haya dentro, hasta 100 por pila.
        if (entry !== this.containerOf(creature) && this.esApilable(entry.typeId)) {
            creature.inventory.splice(creature.inventory.indexOf(entry), 1);
            const ultima = this._addToContainer(creature, entry.typeId, entry.count, entry.attributes);
            this._reindexInventory(creature.inventory);
            const stats = this.recomputeEquipment(creature);
            return { ok: true, item: ultima, stats: stats };
        }

        entry.slot = SLOT_INSIDE;
        const stats = this.recomputeEquipment(creature);

        return { ok: true, item: entry, stats: stats };
    }

    getItem(instanceId) {
        return this.items.get(Number(instanceId)) || null;
    }

    // =======================================================================
    // El inventario
    // =======================================================================

    /**
     * Recoge el objeto que hay encima de una casilla.
     *
     * SÓLO SE PUEDE COGER EL DE MÁS ARRIBA, y si no se puede coger, no se coge nada. Es
     * la regla de Tibia y tiene una consecuencia que sorprende hasta que se entiende: una
     * moneda debajo de una mesa NO se puede recoger, porque la mesa está por encima. Hay
     * que quitar la mesa primero. Permitir coger de en medio sería más cómodo y rompería
     * la única razón por la que el apilado importa para algo que no sea dibujar.
     *
     * @returns {{ok: boolean, reason?: string, item?: Object, stacked?: boolean}}
     */
    pickUpItem(creature, x, y, z) {
        if (!this.map) {
            return { ok: false, reason: 'noMap' };
        }

        /*
         * LA DISTANCIA SE COMPRUEBA ANTES QUE EL TILE, y el orden importa para el
         * mensaje: si se mira primero el tile, recoger de la otra punta del mapa dice
         * "aquí no hay nada", que es cierto y no explica nada. Sin esta comprobación,
         * además, se podría recoger del otro lado del mapa mandando coordenadas, que es
         * la clase de agujero que un cliente modificado encuentra el primer día.
         */
        const distance = Math.max(
            Math.abs(creature.position.x - Number(x)),
            Math.abs(creature.position.y - Number(y)));

        if (creature.position.z !== Number(z) || distance > 1) {
            return { ok: false, reason: 'tooFar' };
        }

        const tile = this.map.getTile(Number(x), Number(y), Number(z));
        if (!tile) {
            return { ok: false, reason: 'emptyTile' };
        }

        // Lo de arriba que se puede coger: la misma regla que al arrastrar (`_topItemAt`).
        const top = this._topItemAt(x, y, z).item;

        /*
         * Si lo de más arriba es el SUELO, la casilla está vacía a efectos de recoger.
         *
         * El suelo es un objeto más de la pila, así que sin esta comprobación el motivo
         * sería "no se puede coger", que es verdad y es inútil: lo que quiere saber quien
         * lo intenta es que ahí no hay nada. Decir el motivo de verdad es la diferencia
         * entre un mensaje que orienta y uno que confunde.
         */
        if (!top || top === tile.ground) {
            return { ok: false, reason: 'emptyTile' };
        }
        if (!top.hasFlag('pickupable')) {
            return { ok: false, reason: 'notPickupable' };
        }

        /*
         * ¿TIENE DONDE METERLO?
         *
         * UN JUGADOR SIN CONTENEDOR NO PUEDE COGER NADA, y es la regla que da sentido a todo lo
         * demas: las cosas solo caben en un contenedor, asi que sin mochila no hay sitio. Es lo
         * mismo que hace Tibia.
         *
         * VA DESPUES DE "ESO NO SE PUEDE RECOGER" Y ANTES DEL PESO, y el orden es el mensaje: a
         * quien pulsa un muro hay que decirle que un muro no se coge -que es lo que pregunta-, no
         * que no tiene mochila. Y el peso va despues porque a quien no tiene donde meterlo no le
         * sirve saber cuanto pesa.
         */
        if (!this.hasContainer(creature)) {
            return { ok: false, reason: 'noContainer' };
        }
        if (!this.fitsInBackpack(creature, top.typeId, 0, top.count)) {
            return { ok: false, reason: 'backpackFull', slots: this.backpackCapacity(creature) };
        }

        /*
         * ¿CABE?
         *
         * Se comprueba ANTES de tocar el inventario, igual que en el comercio: si se metiera
         * y luego se deshiciera, un fallo a mitad dejaría el objeto en los dos sitios o en
         * ninguno. Preguntar antes es más simple y no puede quedar a medias.
         *
         * El peso se devuelve en el motivo para que el mensaje pueda decir CUÁNTO sobra, que
         * es lo que el jugador necesita para decidir qué soltar.
         */
        const weight = this.weightOfItem(top.typeId, top.count);

        if (!this.canCarry(creature, weight)) {
            return {
                ok: false,
                reason: 'tooHeavy',
                weight: weight,
                free: this.capacityOf(creature) - this.weightOf(creature)
            };
        }

        if (!(creature.inventory instanceof Array)) {
            creature.inventory = [];
        }

        /*
         * Si el objeto se apila y ya hay uno igual, se suma a su cantidad.
         *
         * Es lo que espera cualquiera: cien monedas recogidas de una en una tienen que
         * acabar siendo UNA entrada de cien, no cien entradas de una. También es lo que
         * hace que el inventario no crezca sin límite al matar monstruos.
         *
         * Cada pila llega a MAX_PILA (100) como mucho; lo que sobra hace pilas nuevas.
         */
        const antes = creature.inventory.length;
        this._addToContainer(creature, top.typeId, Math.max(1, top.count), top.attributes);
        const stacked = creature.inventory.length === antes;

        // Se quita del tile Y de la tabla de objetos sueltos, si estaba en ella. Las dos
        // cosas son necesarias: el tile es lo que se dibuja y lo que bloquea el paso, y la
        // tabla es lo que permite encontrar el objeto por su identificador. Quitar sólo una
        // deja el objeto en el sitio equivocado.
        tile.removeItem(top);
        this.emit('onItemRemoved', top, tile);

        if (top.instanceId && this.items.has(top.instanceId)) {
            this.items.delete(top.instanceId);
        }

        return { ok: true, item: top, stacked: stacked };
    }

    /**
     * Suelta un objeto del inventario en la casilla donde está la criatura.
     *
     * @param {Creature} creature
     * @param {number} index posición en el inventario
     * @returns {{ok: boolean, reason?: string, item?: Object}}
     */
    dropItem(creature, index) {
        return this.dropItemAt(creature, index, creature.position);
    }

    /**
     * Suelta un objeto del inventario en UNA casilla concreta.
     *
     * `dropItem` es esto mismo en la casilla que pisa la criatura, y los dos se separan para que
     * soltar y ARRASTRAR AL SUELO sean el mismo camino. Dos copias de la misma operacion acaban
     * discrepando en la comprobacion que a una de las dos se le olvide, y el fallo aparece como un
     * objeto que se puede soltar de una manera y de otra no.
     *
     * @param {Creature} creature
     * @param {number} index posición en el inventario
     * @param {Object} position la casilla donde va
     */
    dropItemAt(creature, index, position) {
        const inventory = creature.inventory;
        const slot = Number(index);

        if (!(inventory instanceof Array) || slot < 0 || slot >= inventory.length) {
            return { ok: false, reason: 'badSlot' };
        }

        const entry = inventory[slot];
        const definition = this.itemTypes.get(entry.typeId);

        if (!definition) {
            return { ok: false, reason: 'unknownItem' };
        }

        // LA MOCHILA CON COSAS DENTRO SE SUELTA CON ELLAS: lo que llevabas dentro se va con la
        // mochila al suelo (y vuelve contigo si te la vuelves a poner).
        const conTodo = this.containerOf(creature) === entry ? this.contentsOf(creature) : [];

        const item = new Item(definition, {
            count: entry.count,
            attributes: entry.attributes || null
        });
        item.instanceId = this._allocateItemId();
        this.items.set(item.instanceId, item);
        if (conTodo.length > 0) {
            item.contents = conTodo.map((dentro) => {
                const def = this.itemTypes.get(dentro.typeId);
                const objeto = new Item(def, { count: dentro.count, attributes: dentro.attributes || null });
                objeto.instanceId = this._allocateItemId();
                objeto.parent = item;
                this.items.set(objeto.instanceId, objeto);
                return objeto;
            });
        }

        // Se pone JUNTANDO: si ahí hay una pila del mismo objeto apilable, se suma a ella.
        const puesto = this._ponerJuntando(item, position);
        if (!puesto.ok) {
            // Si no se pudo poner en el suelo, se deshace todo: dejar el objeto en la
            // tabla sin tile sería un objeto invisible que nadie puede recoger.
            this.items.delete(item.instanceId);
            return { ok: false, reason: 'noTile' };
        }

        inventory.splice(slot, 1);
        conTodo.forEach((dentro) => inventory.splice(inventory.indexOf(dentro), 1));
        this._reindexInventory(inventory);

        /*
         * Y SE RECALCULA EL EQUIPO, que esto faltaba: soltar la espada que llevas puesta dejaba
         * el ataque como estaba, asi que pegabas igual con las manos vacias. Es la misma cuenta
         * que hace `equipItem` al ponerla, y tiene que hacerse tambien al quitarla.
         */
        this.recomputeEquipment(creature);

        return { ok: true, item: puesto.item };
    }

    // =======================================================================
    // Mover: el motor del arrastrar
    // =======================================================================

    /**
     * MUEVE UN OBJETO DE UN SITIO A OTRO.
     *
     * ORIGEN Y DESTINO. El origen es una casilla del suelo o una entrada del inventario; el
     * destino, una casilla, una ranura de equipo o dentro de la mochila. Con esas dos piezas salen
     * las cuatro direcciones que pide el juego -suelo -> mochila, mochila -> ranura, ranura ->
     * ranura y ranura -> mochila- sin un mensaje distinto por cada una.
     *
     * AQUI SE VALIDA TODO Y NO SE FIA NADA DEL CLIENTE: que el objeto sea movible, que este donde
     * dice, que se pueda alcanzar, que la ranura sea la que le toca por su `slotType` y que haya
     * mochila si va a la mochila. Y DEVUELVE UN MOTIVO cuando no se puede, porque el cliente tiene
     * que poder decir algo util en vez de no hacer nada.
     *
     * NO DUPLICA LAS REGLAS DE NADIE: cada destino acaba llamando a la operacion que ya existia
     * para ese camino -recoger, soltar, equipar-, asi que la regla vive en un sitio. Lo que hace
     * esta funcion es traducir "esto va alli" a la operacion que ya sabe hacerlo.
     *
     * @param {Creature} creature
     * @param {Object} from { kind: 'ground'|'inventory', x,y,z | index }
     * @param {Object} to   { kind: 'ground'|'slot'|'container', x,y,z | slot }
     * @returns {{ok: boolean, reason?: string, item?: Object, slot?: string, stacked?: boolean}}
     */
    moveItem(creature, from, to) {
        if (!this.map) {
            return { ok: false, reason: 'noMap' };
        }

        const source = from || {};
        let target = to || {};

        // --- 1. EL ORIGEN ------------------------------------------------------------------
        let entry = null;        // la entrada del inventario, si el origen es el inventario
        let ground = null;       // el objeto del suelo, si el origen es una casilla
        let groundTile = null;

        if (source.kind === 'inventory') {
            const index = Number(source.index);

            if (!(creature.inventory instanceof Array) || !Number.isInteger(index) ||
                index < 0 || index >= creature.inventory.length) {
                return { ok: false, reason: 'badSource' };
            }
            entry = creature.inventory[index];
        } else if (source.kind === 'ground') {
            // La distancia se comprueba ANTES que el tile y por el mismo motivo que al recoger:
            // sin esto se podria mover lo que hay al otro lado del mapa mandando coordenadas.
            // De suelo a suelo se puede LANZAR, como en Tibia (hasta THROW_RANGE casillas); para
            // cogerlo (a la mochila o a una ranura) hay que estar al lado: la sesion lleva al
            // jugador andando si esta lejos.
            const alcance = target.kind === 'ground'
                ? this._withinThrow(creature, source.x, source.y, source.z)
                : this._withinReach(creature, source.x, source.y, source.z);
            if (!alcance) {
                return { ok: false, reason: 'tooFar' };
            }

            const found = this._topItemAt(source.x, source.y, source.z);
            if (found.reason) {
                return { ok: false, reason: found.reason };
            }
            // Y no se mueve lo que esta en el suelo y no se puede coger: un muro no se arrastra.
            if (!found.item.hasFlag('pickupable')) {
                return { ok: false, reason: 'notPickupable' };
            }

            ground = found.item;
            groundTile = found.tile;
        } else if (source.kind === 'container') {
            // De DENTRO de un contenedor del suelo (el botín de un cuerpo): hay que estar al lado
            // del contenedor, como para abrirlo.
            const container = this.items.get(Number(source.id));
            if (!container || !container.position || !container.isContainer) {
                return { ok: false, reason: 'badSource' };
            }
            if (!this.canReach(creature, container.position)) {
                return { ok: false, reason: 'tooFar' };
            }
            ground = this.contentsOfItem(container)[Number(source.index)] || null;
            if (!ground) {
                return { ok: false, reason: 'emptyTile' };
            }
        } else {
            return { ok: false, reason: 'badSource' };
        }

        const typeId = entry ? entry.typeId : ground.typeId;

        /*
         * EL MISMO OBJETO EN EL MISMO SITIO no es un movimiento.
         *
         * Pedirlo no puede hacer nada, y hacerlo de verdad -quitarlo y volverlo a poner- tendria
         * un efecto que nadie ha pedido: el objeto se iria al FINAL de la pila de su casilla.
         */
        if (entry && target.kind === 'slot' && entry.slot === String(target.slot)) {
            return { ok: false, reason: 'alreadyThere' };
        }
        if (entry && target.kind === 'container' && entry.slot === SLOT_INSIDE) {
            return { ok: false, reason: 'alreadyThere' };
        }
        if (ground && target.kind === 'ground' && ground.position &&
            Number(target.x) === ground.position.x &&
            Number(target.y) === ground.position.y &&
            Number(target.z) === ground.position.z) {
            return { ok: false, reason: 'alreadyThere' };
        }

        // --- 2. EL DESTINO -----------------------------------------------------------------

        // SOLTARLO ENCIMA DE UN CONTENEDOR DEL SUELO (una mochila tirada, un cuerpo) lo mete
        // DENTRO, como en Tibia, si está al alcance de la mano. Si no, cae en la casilla.
        if (target.kind === 'ground') {
            const encima = this._contenedorArribaEn(target.x, target.y, target.z);
            if (encima && encima !== ground && !(ground && ground.parent === encima) &&
                !this.isContainerType(typeId) && this.canReach(creature, encima.position)) {
                target = { kind: 'groundContainer', id: this.adoptItem(encima) };
            }
        }

        if (target.kind === 'groundContainer') {
            const container = this.items.get(Number(target.id));
            if (!container || !container.position || !container.isContainer) {
                return { ok: false, reason: 'badTarget' };
            }
            if (!this.canReach(creature, container.position)) {
                return { ok: false, reason: 'tooFar' };
            }
            return this._moveToGroundContainer(creature, entry, ground, groundTile, container);
        }

        if (target.kind === 'slot') {
            const slot = String(target.slot === undefined ? '' : target.slot);
            const wanted = this.slotOf(typeId);

            // SOLTARLO EN LA RANURA DE LA MOCHILA PUESTA lo mete dentro de ella, como en Tibia
            // (otra mochila sí se cambia por la que llevas).
            const mochila = slot === 'backpack' ? this.equippedIn(creature, 'backpack') : null;
            if (mochila && mochila !== entry && this.isContainerType(mochila.typeId) && !this.isContainerType(typeId)) {
                return this._moveToContainer(creature, entry, ground);
            }

            // La ranura de la MUNICION admite cualquier cosa que se pueda llevar, como en Tibia
            // (ahi se guardan las monedas, las flechas o lo que sea), menos un contenedor.
            const alMunicion = slot === 'ammo' && !this.isContainerType(typeId);
            if (!wanted && !alMunicion) {
                return { ok: false, reason: 'notEquippable' };
            }
            // LA RANURA LA DECIDE EL OBJETO Y NO EL CLIENTE: un anillo no se pone en la cabeza,
            // aunque el cliente lo pida. El motivo lleva cual era la buena, para poder decirlo.
            if (wanted !== slot && !alMunicion) {
                return { ok: false, reason: 'wrongSlot', slot: wanted };
            }

            return this._moveToSlot(creature, entry, ground, groundTile, slot);
        }

        if (target.kind === 'container') {
            // AQUI SI HACE FALTA MOCHILA, porque es justo donde se guardan las cosas.
            if (!this.hasContainer(creature)) {
                return { ok: false, reason: 'noContainer' };
            }
            return this._moveToContainer(creature, entry, ground);
        }

        if (target.kind === 'ground') {
            if (!this._withinThrow(creature, target.x, target.y, target.z)) {
                return { ok: false, reason: 'tooFar' };
            }
            if (!this._canHoldItems(target.x, target.y, target.z)) {
                return { ok: false, reason: 'notEnoughRoom' };
            }
            return this._moveToGround(creature, entry, ground, target);
        }

        return { ok: false, reason: 'badTarget' };
    }

    /**
     * ¿Esta al alcance de la criatura? Una casilla o menos, y en su misma planta.
     *
     * Es la comprobacion que comparten recoger y mover, y vive aqui para que sea UNA: el dia que
     * el alcance cambie -con un arma de distancia, por ejemplo- cambia en los dos sitios a la vez.
     */
    /** Hasta dónde se puede lanzar un objeto: las casillas a la vista en su planta, como Tibia. */
    _withinThrow(creature, x, y, z) {
        if (creature.position.z !== Number(z)) {
            return false;
        }
        return Math.max(
            Math.abs(creature.position.x - Number(x)),
            Math.abs(creature.position.y - Number(y))) <= THROW_RANGE;
    }

    /** ¿Se puede dejar algo en esa casilla? Hace falta suelo y que nada la bloquee (un muro). */
    _canHoldItems(x, y, z) {
        // El suelo puede estar en la casilla o en el terreno de fondo del mapa (`getGround`).
        const tile = this.map.getTile(Number(x), Number(y), Number(z));
        const ground = (tile && tile.ground) || this.map.getGround(Number(x), Number(y), Number(z));
        if (!ground || ground.blocksSolid) {
            return false;
        }
        return !(tile ? tile.getItems() : []).some((item) => item !== ground && item.blocksSolid);
    }

    _withinReach(creature, x, y, z) {
        if (creature.position.z !== Number(z)) {
            return false;
        }
        return Math.max(
            Math.abs(creature.position.x - Number(x)),
            Math.abs(creature.position.y - Number(y))) <= 1;
    }

    /**
     * El objeto de MAS ARRIBA de una casilla.
     *
     * Solo el de mas arriba, que es la regla de Tibia: lo que hay debajo de la mesa no se puede
     * coger sin quitar la mesa. El motivo que devuelve cuando no hay nada -`emptyTile`- es el
     * mismo que el de recoger, porque es la misma pregunta.
     */
    _topItemAt(x, y, z) {
        const tile = this.map ? this.map.getTile(Number(x), Number(y), Number(z)) : null;

        if (!tile) {
            return { reason: 'emptyTile' };
        }

        // Lo que se mueve es lo de ARRIBA que se pueda coger, como en Tibia: lo que va siempre
        // encima y no se coge (un borde, una enredadera) no tapa a la espada que hay debajo. Si
        // no, lo de más arriba de la capa de abajo (una mesa no deja coger lo que tiene debajo).
        const encima = tile.topItems.slice().reverse().find((item) => item.hasFlag('pickupable'));
        const top = encima || tile.downItems[tile.downItems.length - 1] ||
            tile.topItems[tile.topItems.length - 1];

        // El suelo es un objeto mas de la pila, asi que una casilla con solo suelo esta VACIA a
        // efectos de mover: decir "no se puede coger" seria cierto y no explicaria nada.
        if (!top || top === tile.ground) {
            return { reason: 'emptyTile' };
        }

        return { item: top, tile: tile };
    }

    /** Saca un objeto del suelo: del tile, de la tabla de objetos sueltos y avisa. */
    _takeFromGround(item, tile) {
        // Un objeto de dentro de un cuerpo no esta en ninguna casilla: se saca del cuerpo.
        if (item.parent) {
            this._sacarDeContenedor(item);
            this.items.delete(item.instanceId);
            return item;
        }
        tile.removeItem(item);
        this.emit('onItemRemoved', item, tile);

        if (item.instanceId && this.items.has(item.instanceId)) {
            this.items.delete(item.instanceId);
        }

        this.emit('onTileChanged', item.position, null);

        return item;
    }

    /**
     * Mete objetos dentro de la mochila. LAS PILAS SON DE 100 COMO MUCHO: lo apilable rellena
     * primero las pilas iguales que ya hay y lo que sobra va en pilas nuevas de hasta 100, cada una
     * en su hueco. `excluir` es una entrada que no se rellena (la que se está moviendo).
     *
     * @returns {Object} la última entrada que recibió algo
     */
    _addToContainer(creature, typeId, count, attributes, excluir) {
        const id = Number(typeId);
        let quedan = Math.max(1, Math.trunc(Number(count) || 1));
        let ultima = null;

        if (!(creature.inventory instanceof Array)) {
            creature.inventory = [];
        }

        const nueva = (cuantos) => {
            const entry = {
                slot: SLOT_INSIDE,
                position: creature.inventory.length,
                typeId: id,
                count: cuantos,
                attributes: attributes && Object.keys(attributes).length > 0
                    ? { ...attributes }
                    : null
            };
            creature.inventory.push(entry);
            return entry;
        };

        if (!this.esApilable(id)) {
            return nueva(quedan);
        }

        for (const entry of creature.inventory) {
            if (quedan <= 0) {
                break;
            }
            if (entry !== excluir && entry.slot === SLOT_INSIDE && entry.typeId === id && entry.count < MAX_PILA) {
                const cabe = Math.min(MAX_PILA - entry.count, quedan);
                entry.count += cabe;
                quedan -= cabe;
                ultima = entry;
            }
        }
        while (quedan > 0) {
            const cuantos = Math.min(MAX_PILA, quedan);
            ultima = nueva(cuantos);
            quedan -= cuantos;
        }

        return ultima;
    }

    /**
     * Parte en pilas de 100 lo apilable que lleva dentro de la mochila (un personaje guardado
     * antes de que hubiera tope, o algo que un script metiera a mano). Lo que está puesto no se toca.
     */
    normalizarPilas(creature) {
        if (!(creature && creature.inventory instanceof Array)) {
            return;
        }
        const grandes = creature.inventory.filter((entry) =>
            entry.slot === SLOT_INSIDE && entry.count > MAX_PILA && this.esApilable(entry.typeId));
        if (grandes.length === 0) {
            return;
        }
        grandes.forEach((entry) => {
            let sobra = entry.count - MAX_PILA;
            entry.count = MAX_PILA;
            while (sobra > 0) {
                const cuantos = Math.min(MAX_PILA, sobra);
                creature.inventory.push({
                    slot: SLOT_INSIDE, position: creature.inventory.length, typeId: entry.typeId,
                    count: cuantos, attributes: entry.attributes ? { ...entry.attributes } : null
                });
                sobra -= cuantos;
            }
        });
        this._reindexInventory(creature.inventory);
    }

    /** Destino: una ranura de equipo. Lo que hubiera vuelve a la mochila. */
    _moveToSlot(creature, entry, ground, groundTile, slot) {
        const previous = this.equippedIn(creature, slot);

        // LA MISMA PILA YA PUESTA (monedas en la munición): se juntan en vez de cambiarse.
        const tipo = entry ? entry.typeId : ground.typeId;
        const definicion = this.itemTypes.get(tipo);
        const apilable = definicion && definicion.attributes && definicion.attributes.stackable;
        if (apilable && previous && previous !== entry && previous.typeId === tipo && previous.count < MAX_PILA) {
            const cuantos = entry ? entry.count : ground.count;
            const cabe = Math.min(MAX_PILA - previous.count, cuantos);
            if (ground) {
                const weight = this.weightOfItem(tipo, cabe);
                if (!this.canCarry(creature, weight)) {
                    return {
                        ok: false, reason: 'tooHeavy', weight: weight,
                        free: this.capacityOf(creature) - this.weightOf(creature)
                    };
                }
                if (cabe >= ground.count) {
                    this._takeFromGround(ground, groundTile);
                } else {
                    ground.count -= cabe;
                    if (ground.position) {
                        this.emit('onTileChanged', ground.position, ground);
                    }
                }
            } else if (cabe >= entry.count) {
                creature.inventory.splice(creature.inventory.indexOf(entry), 1);
                this._reindexInventory(creature.inventory);
            } else {
                entry.count -= cabe;
            }
            previous.count += cabe;
            const stats = this.recomputeEquipment(creature);
            return { ok: true, slot: slot, replaced: null, item: previous, stacked: true, stats: stats };
        }

        const replacing = previous && previous !== entry ? previous : null;

        if (replacing) {
            // Lo que estaba puesto vuelve a la mochila, y para eso hace falta mochila. Se mira
            // ANTES de tocar nada: si no, el cambio se quedaria a medias.
            const blocked = this._reasonCannotRemoveContainer(creature, replacing);
            if (blocked) {
                return { ok: false, reason: blocked };
            }
            if (!this.hasContainer(creature)) {
                return { ok: false, reason: 'noContainer' };
            }
            // Y tiene que caber: si lo que se pone salía de la mochila, deja su hueco libre.
            const libres = entry && entry.slot === SLOT_INSIDE ? 1 : 0;
            if (this.contentsOf(creature).length - libres >= this.backpackCapacity(creature)) {
                return { ok: false, reason: 'backpackFull', slots: this.backpackCapacity(creature) };
            }
        }

        // PONERSE UNA MOCHILA DEL SUELO CON COSAS DENTRO: sólo si no llevas otra, y lo de dentro
        // pasa a ser lo que llevas en la mochila.
        const conTodo = ground && ground.isContainer ? this.contentsOfItem(ground).slice() : [];
        if (conTodo.length > 0 && replacing) {
            return { ok: false, reason: 'fullContainer' };
        }

        if (ground) {
            // Lo que se recoge del suelo pesa de nuevas, asi que se comprueba antes de moverlo.
            const weight = this.weightOfItem(ground.typeId, ground.count) +
                conTodo.reduce((total, dentro) => total + this.weightOfItem(dentro.typeId, dentro.count), 0);

            if (!this.canCarry(creature, weight)) {
                return {
                    ok: false, reason: 'tooHeavy', weight: weight,
                    free: this.capacityOf(creature) - this.weightOf(creature)
                };
            }

            if (!(creature.inventory instanceof Array)) {
                creature.inventory = [];
            }

            this._takeFromGround(ground, groundTile);

            creature.inventory.push({
                slot: slot,
                position: creature.inventory.length,
                typeId: ground.typeId,
                count: Math.max(1, ground.count),
                attributes: ground.attributes && Object.keys(ground.attributes).length > 0
                    ? { ...ground.attributes }
                    : null
            });
            conTodo.forEach((dentro) => {
                creature.inventory.push({
                    slot: SLOT_INSIDE,
                    position: creature.inventory.length,
                    typeId: dentro.typeId,
                    count: Math.max(1, dentro.count),
                    attributes: dentro.attributes && Object.keys(dentro.attributes).length > 0 ? { ...dentro.attributes } : null
                });
                this.items.delete(dentro.instanceId);
            });
            ground.contents = [];
        } else {
            entry.slot = slot;
        }

        if (replacing) {
            replacing.slot = SLOT_INSIDE;
        }

        const stats = this.recomputeEquipment(creature);

        return {
            ok: true, slot: slot, replaced: replacing, item: ground || entry, stats: stats
        };
    }

    /**
     * Destino: dentro de la mochila.
     *
     * DEL SUELO A LA MOCHILA ES RECOGER, y se llama a `pickUpItem` en vez de repetir sus
     * comprobaciones -distancia, objeto de mas arriba, si se puede coger, si hay mochila, si
     * cabe-. Dos copias de esa lista acaban discrepando en la que a una se le olvide, y el
     * sintoma seria un objeto que se puede recoger de una manera y arrastrando no.
     */
    _moveToContainer(creature, entry, ground) {
        // Una mochila con cosas no va dentro de la tuya (lo de dentro de lo de dentro no se guarda).
        if (ground && ground.isContainer && this.contentsOfItem(ground).length > 0) {
            return { ok: false, reason: 'fullContainer' };
        }
        if (ground && ground.parent) {
            const contents = this.contentsOfItem(ground.parent);
            return this.takeFromContainer(creature, ground.parent.instanceId, contents.indexOf(ground));
        }
        if (ground) {
            return this.pickUpItem(creature, ground.position.x, ground.position.y,
                ground.position.z);
        }

        // La mochila no se mete dentro de si misma.
        if (entry === this.containerOf(creature)) {
            return { ok: false, reason: 'alreadyThere' };
        }

        // Y lo que esta dentro, ya esta dentro.
        if (entry.slot === SLOT_INSIDE) {
            return { ok: false, reason: 'alreadyThere' };
        }
        if (!this.fitsInBackpack(creature, entry.typeId, 0, entry.count)) {
            return { ok: false, reason: 'backpackFull', slots: this.backpackCapacity(creature) };
        }

        // Si dentro ya hay pilas del mismo objeto apilable (monedas), se junta con ellas hasta 100
        // por pila; lo que sobra queda en pilas nuevas.
        if (this.esApilable(entry.typeId) && this.contentsOf(creature).some((e) => e.typeId === entry.typeId)) {
            creature.inventory.splice(creature.inventory.indexOf(entry), 1);
            const antes = creature.inventory.length;
            const ultima = this._addToContainer(creature, entry.typeId, entry.count, entry.attributes);
            this._reindexInventory(creature.inventory);
            const stats = this.recomputeEquipment(creature);
            return { ok: true, item: ultima, stacked: creature.inventory.length === antes, stats: stats };
        }

        entry.slot = SLOT_INSIDE;
        const stats = this.recomputeEquipment(creature);

        return { ok: true, item: entry, stats: stats };
    }

    /** El contenedor que está arriba del todo en una casilla (una mochila tirada, un cuerpo), o null. */
    _contenedorArribaEn(x, y, z) {
        const tile = this.map.getTile(Number(x), Number(y), Number(z));
        if (!tile) {
            return null;
        }
        const items = tile.getItems().filter((item) => item !== tile.ground);
        const arriba = items[items.length - 1];
        return arriba && arriba.isContainer ? arriba : null;
    }

    /**
     * Destino: DENTRO de un contenedor del suelo (una mochila tirada, un cuerpo). Desde la
     * mochila, una ranura, el suelo u otro contenedor. Primero se mete (si no cabe, no se toca
     * nada) y luego se quita de donde estaba.
     */
    _moveToGroundContainer(creature, entry, ground, groundTile, container) {
        const typeId = entry ? entry.typeId : ground.typeId;
        const count = Math.max(1, Number(entry ? entry.count : ground.count) || 1);
        if (ground === container || (ground && ground.parent === container)) {
            return { ok: false, reason: 'alreadyThere' };
        }
        // Un contenedor no va dentro de otro: lo de dentro de lo de dentro no se ve ni se guarda.
        if (this.isContainerType(typeId)) {
            return { ok: false, reason: 'containerInContainer' };
        }

        const antes = this.contentsOfItem(container).length;
        const puesto = this.addToGroundContainer(container, typeId, count);
        if (!puesto) {
            return { ok: false, reason: 'containerFull' };
        }
        const atributos = entry ? entry.attributes : ground.attributes;
        if (this.contentsOfItem(container).length > antes && atributos && Object.keys(atributos).length > 0) {
            puesto.attributes = { ...atributos };
        }

        let stats;
        if (entry) {
            creature.inventory.splice(creature.inventory.indexOf(entry), 1);
            this._reindexInventory(creature.inventory);
            stats = this.recomputeEquipment(creature);
        } else {
            this._takeFromGround(ground, groundTile);
        }
        return { ok: true, item: puesto, container: container.instanceId, stats: stats };
    }

    /**
     * Destino: el suelo.
     *
     * Soltar y arrastrar al suelo son la misma operacion -`dropItemAt`-, y mover un objeto de una
     * casilla a otra conserva SU INSTANCIA: es el mismo objeto que se ha movido, y darle un
     * identificador nuevo seria decir que ha aparecido otro.
     */
    _moveToGround(creature, entry, ground, target) {
        const position = { x: Number(target.x), y: Number(target.y), z: Number(target.z) };

        // Se comprueba el destino ANTES de quitar nada del sitio viejo: si la casilla no existe,
        // el objeto se quedaria en el aire.
        if (!this.map.inBounds(position.x, position.y, position.z)) {
            return { ok: false, reason: 'noTile' };
        }

        if (entry) {
            // El indice se busca en la lista y no se copia de `entry.position`, aunque hoy digan
            // lo mismo: `position` es un campo que alguien podria dejar sin actualizar, y soltar
            // la entrada equivocada seria soltar otro objeto del que el jugador ha arrastrado.
            return this.dropItemAt(creature, creature.inventory.indexOf(entry), position);
        }

        /*
         * Y MOVER UN OBJETO DEL SUELO A OTRA CASILLA ES ESO: moverlo, no destruirlo y crear otro.
         *
         * Se quita del tile viejo DIRECTAMENTE, sin pasar por `removeItem`, y esa diferencia es la
         * que evita un duplicado: `removeItem` busca el objeto en la tabla de objetos sueltos por
         * su instancia, y los objetos que vienen DEL MAPA no estan en esa tabla -no los creo el
         * motor en tiempo de ejecucion-, asi que no haria nada: el objeto seguiria en su casilla
         * vieja y ademas apareceria en la nueva. Se quita del tile, que es donde esta.
         */
        if (ground.parent) {
            // Del botin de un cuerpo al suelo: sale del cuerpo y queda suelto en el mapa.
            this._sacarDeContenedor(ground);
        } else if (ground.position) {
            const viejo = this.map.getTile(
                ground.position.x, ground.position.y, ground.position.z);
            if (viejo) {
                viejo.removeItem(ground);
                this.emit('onItemRemoved', ground, viejo);
                this.emit('onTileChanged', ground.position, null);
            }
        }

        const puesto = this._ponerJuntando(ground, position);
        if (!puesto.ok) {
            return { ok: false, reason: 'noTile' };
        }

        return { ok: true, item: puesto.item };
    }

    /**
     * Renumera las posiciones del inventario.
     *
     * Se hace al quitar algo para que las posiciones sigan siendo correlativas. Si no,
     * al soltar el objeto 2 de 5 quedaría un hueco, y el `/soltar 3` del jugador
     * apuntaría a un sitio distinto del que ve.
     */
    _reindexInventory(inventory) {
        inventory.forEach((entry, index) => {
            entry.position = index;
        });
        return inventory;
    }

    /**
     * Crea un NPC y lo coloca en el mundo.
     *
     * `placement` es la colocación del MAPA: su posición, su nombre y —si el mapa lo
     * decidió— el radio de paseo de esa colocación, que manda sobre `walkradius` de
     * `npcs.xml`. Se pasa entero y no convertido a `Position` porque el radio no cabe en una
     * posición, y perderlo aquí haría que el radio del mapa no sirviera para nada.
     */
    createNpc(definition, placement) {
        const npc = createNpc(definition, Position.from(placement), {
            walkRadius: placement.radius
        });

        npc.outfit = normalizeOutfit(definition.outfit);

        // El diálogo se le engancha AQUÍ y no en el constructor: el módulo de contenido
        // puede recargarse, y entonces hay que volver a engancharlo. Si viviera dentro
        // del NPC, recargar el contenido dejaría a los NPC con el diálogo viejo.
        this.attachDialogue(npc, definition.name);

        this.creatures.set(npc.id, npc);
        this.npcs.set(npc.name, npc);
        this._registerCreature(npc);

        // Lo que diga el NPC sale al mundo en el momento, por el mismo camino que el habla
        // de un jugador. Así el cliente no necesita saber que existe algo llamado NPC: ve
        // una criatura que habla, que es exactamente lo que es.
        npc.onSayLine = (text) => this.creatureSay(npc.id, text);

        /**
         * El comercio, del lado del NPC.
         *
         * Se engancha aquí y no en la clase `Npc` para que la clase siga sin conocer el
         * mundo: un NPC sabe a quién tiene delante y qué dice, y no cómo se mueven los
         * objetos entre inventarios. El día que el comercio cambie —precios por reputación,
         * impuestos, trueques— se cambia en un sitio y la clase no se entera.
         *
         * El jugador que llega puede ser un envoltorio de contenido, así que se traduce a
         * la criatura de verdad antes de operar.
         */
        npc.shopList = () => this.npcShopList(npc);

        /**
         * Con qué se envuelve a quien le habla.
         *
         * Lo pone el registro al arrancar, porque el envoltorio vive en la capa de
         * contenido y el mundo no la conoce. Si nadie lo pone, el diálogo recibe la
         * criatura tal cual y sigue funcionando; lo que se pierde es la protección, no la
         * funcionalidad.
         */
        if (this.wrapForContent) {
            npc.wrapSpeaker = this.wrapForContent;
        }

        npc.buyFor = (playerWrapper, words) => {
            const player = this._unwrapPlayer(playerWrapper);
            if (!player) {
                return { ok: false, reason: 'noPlayer' };
            }

            const offer = this.npcOfferFromWords(npc, words, 'buy');
            if (!offer) {
                return { ok: false, reason: 'notSold' };
            }

            const result = this.buyFromNpc(player, npc, offer.typeId, 1);
            result.offer = result.offer || offer;
            return result;
        };

        npc.sellFor = (playerWrapper, words) => {
            const player = this._unwrapPlayer(playerWrapper);
            if (!player) {
                return { ok: false, reason: 'noPlayer' };
            }

            const offer = this.npcOfferFromWords(npc, words, 'sell');
            if (!offer) {
                return { ok: false, reason: 'notBought' };
            }

            const result = this.sellToNpc(player, npc, offer.typeId, 1);
            result.offer = result.offer || offer;
            return result;
        };

        return npc;
    }

    /**
     * Del envoltorio de contenido a la criatura de verdad.
     *
     * El contenido recibe envoltorios —para que no pueda tocar el mundo a mano— y el
     * comercio necesita la criatura. La traducción se hace en un solo sitio en vez de que
     * cada método acepte las dos formas, que es como se acaba con la mitad de los métodos
     * aceptando una y la otra mitad la otra.
     */
    _unwrapPlayer(candidate) {
        if (!candidate) {
            return null;
        }

        /*
         * SE RESUELVE POR `id`, y no preguntando si es un jugador.
         *
         * La primera versión preguntaba `candidate.isPlayer()` y el ENVOLTORIO también
         * responde que sí —delega en la criatura, que es justo lo que debe hacer—, así que
         * devolvía el envoltorio y el comercio contaba el inventario del envoltorio, que no
         * existe: siempre cero monedas.
         *
         * El identificador lo tienen los dos y el mundo sabe traducirlo, así que es la
         * pregunta que no se puede contestar mal. Es el mismo error que el `undefined !==
         * null` del generador de apariciones: comprobar una propiedad que las dos cosas
         * comparten no distingue nada.
         */
        if (candidate.id !== undefined) {
            const resolved = this.getPlayer(candidate.id);
            if (resolved) {
                return resolved;
            }
        }

        // Si no está en el mundo, se acepta sólo si tiene posición, que es lo que
        // distingue a una criatura de verdad de un envoltorio.
        return (candidate.isPlayer && candidate.isPlayer() && candidate.position)
            ? candidate
            : null;
    }

    /**
     * Engancha a un NPC el diálogo registrado con su nombre.
     *
     * Es lo que hace que recargar el contenido cambie lo que dicen los NPC que ya están
     * en el mundo, sin tener que reiniciar ni volver a colocarlos.
     */
    attachDialogue(npc, name) {
        const dialogue = this.npcTypes.get(String(name));

        // Se limpia siempre antes: si el diálogo nuevo tiene menos palabras clave que el
        // viejo, sin esto sobrevivirían las que ya no existen.
        npc.keywords = [];
        npc.defaultHandler = null;

        if (!dialogue) {
            return false;
        }

        (dialogue.keywords || []).forEach((entry) => {
            npc.addKeyword(entry.words, entry.say, {
                greeting: entry.greeting,
                farewell: entry.farewell
            });
        });

        if (typeof dialogue.default === 'function') {
            npc.setDefault(dialogue.default);
        }

        npc.dialogue = dialogue;
        npc.onThink = typeof dialogue.onThink === 'function' ? dialogue.onThink : null;

        return true;
    }

    /** Vuelve a enganchar el diálogo a todos los NPC vivos. Tras recargar el contenido. */
    refreshDialogues() {        let count = 0;
        this.npcs.forEach((npc) => {
            if (this.attachDialogue(npc, npc.name)) {
                count += 1;
            }
        });
        return count;
    }

    getNpc(name) {
        return this.npcs.get(String(name)) || null;
    }

    /**
     * Reparte lo que alguien ha dicho entre los NPC que puedan oírlo.
     *
     * Recorre TODOS los NPC y deja que cada uno decida si le oye, en vez de calcular
     * distancias aquí. La razón es que "oír" es una regla del NPC —tiene radio, y podría
     * depender de si está dormido o enfadado— y repartirla entre dos sitios acaba con la
     * regla escrita dos veces y distinta.
     */
    npcsHear(speaker, text, now) {
        const replies = [];

        this.npcs.forEach((npc) => {
            const result = npc.hear(speaker, text, now);
            if (result.replied) {
                replies.push({ npc: npc, result: result });
            }
        });

        return replies;
    }

    // =======================================================================
    // El dinero y el comercio
    // =======================================================================

    /**
     * Cuánto dinero lleva encima.
     *
     * Se cuenta sumando las pilas en vez de guardar un saldo aparte. Un saldo sería más
     * rápido y crearía una segunda fuente de verdad: el día que un objeto de dinero se
     * cayera al suelo o se recogiera por otro camino, el saldo y lo que lleva encima
     * dirían cosas distintas y no habría forma de saber cuál es la buena.
     */
    countMoney(creature) {
        const valores = new Map(this._monedas().map((m) => [m.id, m.value]));

        return (creature.inventory instanceof Array ? creature.inventory : [])
            .filter((entry) => valores.has(entry.typeId))
            .reduce((total, entry) => total + entry.count * valores.get(entry.typeId), 0);
    }

    /** Las monedas de menor a mayor (sólo las que existen en items.xml; el oro siempre). */
    _monedas() {
        const lista = (this.coinTypes || []).filter((m) => this.itemTypes.has(m.id));
        if (!lista.some((m) => m.id === this.moneyItemId)) {
            lista.unshift({ id: this.moneyItemId, value: 1 });
        }
        return lista.sort((a, b) => a.value - b.value);
    }

    /** Una cantidad de dinero en las monedas más grandes: `[[id, cuántas], ...]`. */
    monedasPara(amount) {
        let quedan = Math.max(0, Math.trunc(Number(amount) || 0));
        const lista = [];
        this._monedas().slice().reverse().forEach((m) => {
            const n = Math.floor(quedan / m.value);
            if (n > 0) {
                lista.push([m.id, n]);
                quedan -= n * m.value;
            }
        });
        return lista;
    }

    /** ¿Cabe en la mochila esta cantidad de dinero (en las monedas más grandes)? */
    cabeDinero(creature, amount) {
        const nuevas = this.monedasPara(amount)
            .reduce((total, [id, n]) => total + this.pilasNuevas(creature, id, n), 0);
        return nuevas === 0 || this.contentsOf(creature).length + nuevas <= this.backpackCapacity(creature);
    }

    /** Da dinero en las monedas más grandes (sin mirar huecos: para eso `cabeDinero`). */
    darDinero(creature, amount) {
        this.monedasPara(amount).forEach(([id, n]) => this.giveItem(creature, id, n));
    }

    /**
     * COBRA dinero, como en Tibia: primero las monedas pequeñas y, si con una grande sobra, se
     * devuelve el cambio. Si no llega, no toca nada.
     *
     * @returns {boolean}
     */
    pagarDinero(creature, amount) {
        const total = Math.max(0, Math.trunc(Number(amount) || 0));
        if (this.countMoney(creature) < total) {
            return false;
        }
        let quedan = total;
        for (const m of this._monedas()) {
            if (quedan <= 0) {
                break;
            }
            const tengo = this.countOf(creature, m.id);
            const usar = Math.min(tengo, Math.ceil(quedan / m.value));
            if (usar > 0) {
                this.takeItem(creature, m.id, usar);
                quedan -= usar * m.value;
            }
        }
        if (quedan < 0) {
            this.darDinero(creature, -quedan);
        }
        return true;
    }

    /** Una copia del inventario, para deshacer una operación que no cabe. */
    _copiaInventario(creature) {
        return (creature.inventory || []).map((e) => ({ ...e, attributes: e.attributes ? { ...e.attributes } : null }));
    }

    /** Vuelve el inventario a la copia (las mismas entradas, con sus valores de antes). */
    _restaurarInventario(creature, copia) {
        creature.inventory = copia;
        this._reindexInventory(creature.inventory);
        this.recomputeEquipment(creature);
    }

    /** ¿Puede pagar esto? NO toca nada: sólo mira. */
    canPayMoney(creature, amount) {
        return this.countMoney(creature) >= Number(amount);
    }

    /**
     * Mete objetos en el inventario, apilando si ya hay.
     *
     * SIN CONTENEDOR NO SE RECIBE NADA, y devuelve 0, que es "no se dio nada". Es la misma regla
     * que al recoger del suelo y al comprar, y tiene que estar aqui tambien porque este es el
     * camino por el que el contenido y el comercio dan objetos: si solo estuviera en la tienda,
     * cualquier otro sitio que reparta cosas -una mision, un cofre, el pago de una venta- las
     * meteria en un inventario que no tiene donde guardarlas.
     *
     * @returns {number} cuántas pilas nuevas hizo falta crear; 0 es que no se dio nada
     */
    giveItem(creature, typeId, count) {
        const id = Number(typeId);
        const amount = Math.max(1, Number(count) || 1);

        if (!this.hasContainer(creature)) {
            return 0;
        }

        if (!(creature.inventory instanceof Array)) {
            creature.inventory = [];
        }

        const antes = creature.inventory.length;
        this._addToContainer(creature, id, amount, null);

        return creature.inventory.length - antes;
    }

    /**
     * Saca objetos del inventario.
     *
     * @returns {number} cuántos quitó de verdad
     *
     * SE QUITA DE LA ÚLTIMA PILA HACIA LA PRIMERA, y da igual cuál sea, porque el dinero
     * es fungible: da lo mismo de qué pila salen las monedas. Lo que sí importa es que
     * devuelva CUÁNTOS quitó, porque quien llama tiene que poder comprobar que sacó todo
     * lo que quería antes de dar nada a cambio.
     */
    takeItem(creature, typeId, count) {
        const id = Number(typeId);
        let remaining = Math.max(0, Number(count) || 0);
        let taken = 0;

        if (!(creature.inventory instanceof Array)) {
            return 0;
        }

        for (let index = creature.inventory.length - 1; index >= 0 && remaining > 0;
            index -= 1) {

            const entry = creature.inventory[index];
            if (entry.typeId !== id) {
                continue;
            }

            const used = Math.min(entry.count, remaining);
            entry.count -= used;
            remaining -= used;
            taken += used;

            if (entry.count <= 0) {
                creature.inventory.splice(index, 1);
            }
        }

        this._reindexInventory(creature.inventory);

        return taken;
    }

    /**
     * Busca en la tienda de un NPC lo que ofrece para un objeto.
     *
     * @param {Npc} npc
     * @param {number} typeId
     * @param {'buy'|'sell'} mode desde el punto de vista del JUGADOR
     */
    npcOffer(npc, typeId, mode) {
        const shop = npc && npc.dialogue && npc.dialogue.shop;

        if (!shop || !(shop.items instanceof Array)) {
            return null;
        }

        const id = Number(typeId);
        const offer = shop.items.find((entry) => Number(entry.id) === id);

        if (!offer) {
            return null;
        }

        const price = mode === 'buy' ? offer.buy : offer.sell;

        // Un precio ausente significa que el NPC NO hace esa operación. Un 0 sería
        // "gratis" o "no lo quiero", que son cosas distintas de "no lo vendo", y
        // confundirlas regalaría objetos.
        if (price === undefined || price === null || Number(price) <= 0) {
            return null;
        }

        return {
            typeId: id,
            price: Number(price),
            name: offer.name || (this.itemTypes.get(id)
                ? this.itemTypes.get(id).name
                : 'objeto ' + id)
        };
    }

    /** Lo que un NPC tiene a la venta, para poder listarlo. */
    npcShopList(npc) {
        const shop = npc && npc.dialogue && npc.dialogue.shop;
        if (!shop || !(shop.items instanceof Array)) {
            return [];
        }

        return shop.items.map((entry) => ({
            typeId: Number(entry.id),
            buy: entry.buy === undefined ? null : Number(entry.buy),
            sell: entry.sell === undefined ? null : Number(entry.sell),
            name: entry.name || (this.itemTypes.get(Number(entry.id))
                ? this.itemTypes.get(Number(entry.id)).name
                : 'objeto ' + entry.id)
        }));
    }

    /**
     * Encuentra en la tienda lo que el jugador ha nombrado.
     *
     * Un jugador escribe "comprar espada" y no "comprar 2400", así que hay que reconocer
     * el nombre. Se busca la frase COMPLETA primero —"magic sword" antes que "sword"— y si
     * no, palabra por palabra, porque si no, quien escriba "comprar sword" se llevaría el
     * primer objeto que contenga esa palabra y no el que quería.
     *
     * @returns {Object|null} la oferta, ya con su precio
     */
    npcOfferFromWords(npc, words, mode) {
        const list = Array.isArray(words) ? words : [];
        if (list.length === 0) {
            return null;
        }

        const sentence = ' ' + list.join(' ') + ' ';
        const shop = this.npcShopList(npc);

        /**
         * Cada entrada se puede llamar de DOS maneras, y hay que aceptar las dos.
         *
         * El nombre canónico es el de `items.xml` —"magic sword", que es el de Tibia— y el
         * del mercader es el que le ponga la tienda. Un jugador que escribe "espada"
         * espera que le entiendan, y uno que escribe "magic sword" también. Quedarse con
         * uno de los dos obliga a adivinar cuál, que es lo peor de las dos opciones.
         */
        const candidates = shop.map((entry) => {
            const canonical = this.itemTypes.get(entry.typeId);
            return {
                typeId: entry.typeId,
                buy: entry.buy,
                sell: entry.sell,
                names: canonical && canonical.name !== entry.name
                    ? [entry.name, canonical.name]
                    : [entry.name]
            };
        });

        const sellable = candidates.filter((entry) =>
            mode === 'buy' ? entry.buy > 0 : entry.sell > 0);

        const flatten = (entry) => entry.names.join(' ').toLowerCase();

        // Primero el nombre entero dentro de la frase.
        const whole = sellable
            .filter((entry) => entry.names.some((name) =>
                sentence.indexOf(' ' + name.toLowerCase() + ' ') !== -1))
            .sort((a, b) => flatten(b).length - flatten(a).length)[0];

        if (whole) {
            return this.npcOffer(npc, whole.typeId, mode);
        }

        // Y si no, la palabra más LARGA que aparezca, que es la que más probablemente
        // sea el nombre del objeto y no un artículo.
        const single = sellable
            .filter((entry) => list.some((word) => entry.names.some((name) =>
                name.toLowerCase().split(' ').indexOf(word) !== -1)))
            .sort((a, b) => flatten(b).length - flatten(a).length)[0];

        return single ? this.npcOffer(npc, single.typeId, mode) : null;
    }

    /**
     * Comprar a un NPC.
     *
     * LO PRIMERO ES COMPROBAR TODO, Y SÓLO DESPUÉS SE TOCA ALGO.
     *
     * Una compra a medias —el dinero cobrado y el objeto no entregado, o al revés— es el
     * peor fallo posible en un comercio, porque el jugador pierde algo y no hay forma de
     * deshacerlo. Por eso aquí no se paga hasta que está comprobado que se puede pagar Y
     * que el objeto existe: las dos condiciones se miran antes de la primera escritura.
     */
    buyFromNpc(player, npc, typeId, count) {
        const amount = Math.max(1, Number(count) || 1);
        const offer = this.npcOffer(npc, typeId, 'buy');

        if (!offer) {
            return { ok: false, reason: 'notSold' };
        }
        if (!this.itemTypes.has(offer.typeId)) {
            // La tienda ofrece algo que no está definido. Es un fallo del contenido y se
            // dice, en vez de entregar un objeto que no existe y romper el inventario.
            return { ok: false, reason: 'unknownItem' };
        }

        const total = offer.price * amount;

        /*
         * SIN MOCHILA NO SE COMPRA, y va ANTES del dinero a proposito: a quien no tiene donde
         * meter lo que compra no le sirve saber cuanto le falta para pagarlo. El objeto no cabe
         * en ninguna parte, y eso es lo primero.
         */
        if (!this.hasContainer(player)) {
            return { ok: false, reason: 'noContainer' };
        }

        if (!this.canPayMoney(player, total)) {
            return {
                ok: false, reason: 'notEnoughMoney',
                price: total, money: this.countMoney(player)
            };
        }


        // El peso se mira DESPUÉS del dinero, y el orden de los mensajes importa: a quien no
        // le llega el dinero no le sirve saber que además no le cabe, y al revés sí, porque
        // ya tiene el dinero y lo que le falta es sitio.
        const weight = this.weightOfItem(offer.typeId, amount);

        if (!this.canCarry(player, weight)) {
            return {
                ok: false, reason: 'tooHeavy',
                weight: weight,
                free: this.capacityOf(player) - this.weightOf(player),
                price: total
            };
        }

        /*
         * Se paga (con cambio si hace falta) y LUEGO se mira si cabe: pagar vacía pilas de monedas
         * y esos huecos cuentan, pero el cambio puede ocupar otros. Si no cabe, se deshace todo.
         */
        const copia = this._copiaInventario(player);
        if (!this.pagarDinero(player, total)) {
            return { ok: false, reason: 'paymentFailed' };
        }
        if (!this.fitsInBackpack(player, offer.typeId, 0, amount) ||
            this.contentsOf(player).length > this.backpackCapacity(player)) {
            this._restaurarInventario(player, copia);
            return { ok: false, reason: 'backpackFull', slots: this.backpackCapacity(player), price: total };
        }

        this.giveItem(player, offer.typeId, amount);

        return { ok: true, offer: offer, count: amount, total: total };
    }

    /**
     * Vender a un NPC.
     *
     * Igual que la compra: primero se comprueba que el jugador TIENE lo que dice vender y
     * que el NPC lo compra, y sólo entonces se quita y se paga.
     */
    sellToNpc(player, npc, typeId, count) {
        const amount = Math.max(1, Number(count) || 1);
        const offer = this.npcOffer(npc, typeId, 'sell');

        if (!offer) {
            return { ok: false, reason: 'notBought' };
        }

        const owned = this.countOf(player, offer.typeId);

        if (owned < amount) {
            return { ok: false, reason: 'notOwned', owned: owned };
        }

        /*
         * Y VENDER TAMPOCO, por el mismo motivo que comprar: el pago son monedas, y sin mochila no
         * hay donde meterlas. Va despues de "no tienes eso que vendes" porque es el motivo que
         * explica de verdad lo que pasa cuando alguien vende algo que no lleva.
         */
        if (!this.hasContainer(player)) {
            return { ok: false, reason: 'noContainer' };
        }

        const copia = this._copiaInventario(player);
        const taken = this.takeItem(player, offer.typeId, amount);
        if (taken !== amount) {
            this._restaurarInventario(player, copia);
            return { ok: false, reason: 'takeFailed' };
        }

        const total = offer.price * amount;

        // El pago va en las monedas más grandes y en pilas de 100: si no cabe, se deshace.
        if (!this.cabeDinero(player, total)) {
            this._restaurarInventario(player, copia);
            return { ok: false, reason: 'backpackFull', slots: this.backpackCapacity(player) };
        }
        this.darDinero(player, total);

        return { ok: true, offer: offer, count: amount, total: total };
    }

    /** Cuántos objetos de un tipo lleva encima. */
    countOf(creature, typeId) {
        const id = Number(typeId);
        return (creature.inventory instanceof Array ? creature.inventory : [])
            .filter((entry) => entry.typeId === id)
            .reduce((total, entry) => total + entry.count, 0);
    }

    // =======================================================================
    // Peso y capacidad
    // =======================================================================

    /**
     * Cuánto pesa todo lo que lleva encima.
     *
     * Las unidades son las de Tibia: centésimas de onza. Una moneda son 10, o sea 0,10 oz,
     * y una espada 4200, o sea 42 oz. Se guardan así y no en onzas porque es lo que dicen
     * los archivos de Tibia, y convertir en la frontera obliga a recordar en qué unidad
     * está cada número.
     *
     * Un objeto SIN peso declarado pesa 0, y por eso `items.xml` puede ir declarando pesos
     * poco a poco sin que lo que falte se vuelva impagable.
     */
    weightOf(creature) {
        const inventory = creature.inventory instanceof Array ? creature.inventory : [];

        return inventory.reduce((total, entry) => {
            const definition = this.itemTypes.get(entry.typeId);
            const unit = definition && definition.attributes && definition.attributes.weight
                ? Number(definition.attributes.weight)
                : 0;

            return total + unit * Math.max(1, entry.count);
        }, 0);
    }

    /**
     * Cuánto puede cargar.
     *
     * Es DERIVADA del nivel y la vocación, no un campo que se guarde. Guardarla sería una
     * segunda fuente de verdad: el día que alguien subiera de nivel sin actualizarla, el
     * personaje cargaría lo que dijera el número viejo, y no habría forma de saber cuál de
     * los dos es el bueno. Es la misma decisión que con el dinero.
     *
     * La fórmula es la de Tibia: una base fija más lo que aporta cada nivel según la
     * vocación. Un caballero (gaincap 25) acaba cargando cinco veces más que un mago
     * (gaincap 5), que es exactamente lo que hace que elegir vocación importe.
     */
    capacityOf(creature) {
        // La fórmula está en ONZAS —400 más lo que aporte cada nivel— y el peso se guarda en
        // centésimas de onza. La conversión se hace AQUÍ, una vez, y no dejando el resultado
        // en onzas: comparar onzas con centésimas daría un límite cien veces más pequeño del
        // que toca, y el fallo se vería como "no puedes con una espada" en un personaje que
        // debería cargar diez.
        const ounces = this.baseCapacityOz +
            Math.max(1, creature.level || 1) * this.gainCapOf(creature);

        return ounces * UNITS_PER_OUNCE;
    }

    /**
     * Lo que aporta cada nivel esta criatura, según su vocación.
     *
     * Se busca POR NOMBRE, y no por identificador como está cargado `vocations.xml`. La
     * primera versión hacía `map.get(creature.vocation)` sobre un mapa indexado por id, así
     * que siempre devolvía indefinido y las cinco vocaciones acababan con la misma capacidad:
     * un mago cargaba lo mismo que un caballero y el fallo no daba ningún error.
     */
    gainCapOf(creature) {
        const vocation = this.vocationOf(creature);
        // Sin vocación conocida se usa la más restrictiva y no la más generosa: si un datapack
        // se equivoca en el nombre de una vocación, es mejor que los personajes carguen poco
        // —y que se note— a que carguen sin límite y nadie se entere.
        return vocation.gainCap === undefined || Number(vocation.gainCap) <= 0
            ? this.defaultGainCap
            : Number(vocation.gainCap);
    }

    /**
     * La vocación de un jugador, completa (`data/XML/vocations.js`).
     *
     * Se busca POR NOMBRE, que es lo que se guarda en la base, y no por identificador. Si el
     * nombre no existe se devuelve «None» (la 0), y si tampoco hay vocaciones cargadas, la base
     * de `engine/data/definiciones.js`: el jugador siempre tiene reglas.
     */
    vocationOf(creature) {
        const nombre = creature && creature.vocation;
        if (this.vocations && this.vocations.size > 0) {
            // Son nueve vocaciones: recorrerlas es más barato que mantener un segundo índice que
            // se pueda quedar desincronizado con el primero.
            for (const vocation of this.vocations.values()) {
                if (vocation.name === nombre) {
                    return vocation;
                }
            }
            if (this.vocations.has(0)) {
                return this.vocations.get(0);
            }
        }
        return { ...VOCACION_BASE, gainCap: this.defaultGainCap };
    }

    /** Busca una vocación por nombre o id (para elegirla al crear personaje o promocionar). */
    findVocation(nombreOId) {
        if (!this.vocations) {
            return null;
        }
        const id = Number(nombreOId);
        if (Number.isInteger(id) && this.vocations.has(id) && String(nombreOId).trim() !== '') {
            return this.vocations.get(id);
        }
        const buscado = String(nombreOId || '').trim().toLowerCase();
        for (const vocation of this.vocations.values()) {
            if (vocation.name.toLowerCase() === buscado) {
                return vocation;
            }
        }
        return null;
    }

    /**
     * La vocación con la que se puede CREAR un personaje: tiene que existir, no ser una
     * promoción (`fromVoc` distinto de su id) y, si es `needPremium`, la cuenta tiene que serlo.
     * Sin pedir ninguna, «None».
     *
     * @returns {{ok: boolean, vocation?: string, reason?: string}}
     */
    vocationForNewCharacter(pedida, premium) {
        if (pedida === undefined || pedida === null || String(pedida).trim() === '') {
            return { ok: true, vocation: this.vocationOf({ vocation: 'None' }).name };
        }
        const vocation = this.findVocation(pedida);
        if (!vocation) {
            return { ok: false, reason: 'no existe la vocacion ' + pedida };
        }
        if (vocation.fromVoc !== vocation.id) {
            return { ok: false, reason: vocation.name + ' es una promocion: no se elige al crear' };
        }
        if (vocation.needPremium && !premium) {
            return { ok: false, reason: vocation.name + ' necesita cuenta premium' };
        }
        return { ok: true, vocation: vocation.name };
    }

    /**
     * Cambia la vocación de un jugador (una promoción, un comando de administrador) y le pone
     * al día la vida, el maná y la velocidad.
     */
    setVocation(player, nombreOId) {
        const vocation = this.findVocation(nombreOId);
        if (!vocation) {
            return { ok: false, reason: 'no existe la vocacion ' + nombreOId };
        }
        player.vocation = vocation.name;
        Vocacion.aplicarNivel(player, vocation);
        return { ok: true, vocation: vocation.name };
    }

    /**
     * Entrena una skill: suma tries y, si sube, avisa como TFS (`onAdvance`) y se lo dice al
     * jugador. La dificultad la pone el multiplicador de la vocación.
     */
    addSkillTries(player, skill, tries) {
        const r = Vocacion.sumarTries(player, this.vocationOf(player), skill, tries);
        if (r.subidas > 0) {
            this.emit('onAdvance', player, skill, r.desde, r.hasta);
            this.sendTextMessage(player.id, 'Has subido a ' + Vocacion.NOMBRE_SKILL[skill] +
                ' ' + r.hasta + '.');
        }
        return r;
    }

    /** Gasta maná para el nivel mágico (los hechizos lo llaman). */
    addManaSpent(player, mana) {
        const r = Vocacion.sumarManaGastado(player, this.vocationOf(player), mana);
        if (r.subidas > 0) {
            this.emit('onAdvance', player, 'magic', r.desde, r.hasta);
            this.sendTextMessage(player.id, 'Has subido a nivel mágico ' + r.hasta + '.');
        }
        return r;
    }

    /** Sube (o baja) de nivel: aplica lo que gana por nivel su vocación. */
    applyLevel(player, opciones) {
        return Vocacion.aplicarNivel(player, this.vocationOf(player), opciones);
    }

    /** ¿Cabe esto en lo que le queda libre? */
    canCarry(creature, extraWeight) {
        return this.weightOf(creature) + Number(extraWeight) <= this.capacityOf(creature);
    }

    /**
     * Cuánto pesaría meter `count` objetos de este tipo.
     *
     * Se calcula ANTES de meterlos, que es lo que permite comprobarlo todo antes de tocar
     * nada. Preguntar cuánto pesa algo después de haberlo metido no sirve para decidir si
     * se mete.
     */
    weightOfItem(typeId, count) {
        const definition = this.itemTypes.get(Number(typeId));
        const unit = definition && definition.attributes && definition.attributes.weight
            ? Number(definition.attributes.weight)
            : 0;

        return unit * Math.max(1, Number(count) || 1);
    }

    /**
     * Todo lo que lleva encima una criatura, para el comando de listar. */
    inventoryOf(creature) {        return (creature.inventory instanceof Array ? creature.inventory : [])
            .map((entry, index) => {
                const definition = this.itemTypes.get(entry.typeId);
                return {
                    index: index,
                    typeId: entry.typeId,
                    count: entry.count,
                    name: definition ? definition.name : 'objeto ' + entry.typeId,
                    // La ranura hace falta fuera: es lo que distingue lo que llevas puesto de lo
                    // que solo llevas, y sin ella el cliente no puede enseñarlo en su sitio.
                    slot: entry.slot,
                    equipped: entry.slot !== SLOT_INSIDE
                };
            });
    }

    // =======================================================================
    // Efectos observables
    // =======================================================================

    /**
     * Un mensaje privado para un jugador.
     *
     * SE AVISA ADEMÁS DE APUNTARLO, y eso faltaba: durante mucho tiempo esto sólo
     * guardaba el texto en una lista interna para que las pruebas pudieran mirarla, y
     * **no llegaba nunca al cliente**. Todo lo que el contenido le decía a un jugador
     * —el resultado de un comando, el aviso de una misión— era invisible en el juego,
     * y las pruebas pasaban porque comprobaban la lista.
     *
     * Es el fallo más engañoso de todos los que han aparecido: la pieza funcionaba, la
     * prueba la verificaba, y el camino hasta el jugador no existía.
     */
    sendTextMessage(playerId, text) {
        const player = this.getPlayer(playerId);

        this.messages.push({
            playerId: Number(playerId),
            playerName: player ? player.name : null,
            text: text
        });

        this.emit('onTextMessage', player, String(text));
    }

    /**
     * El inventario, listo para mandarlo.
     *
     * Existe para que la sesión y el mensaje de bienvenida no armen el mismo mensaje por
     * separado: son dos sitios que tienen que producir EXACTAMENTE lo mismo, y dos copias
     * de una estructura son dos sitios donde equivocarse. Ya pasó con el reparto de abajo y
     * arriba de los tiles, que hubo que añadir en los dos.
     *
     * `flat` es la lista de entradas aplanada, cinco numeros por entrada: indice, tipo,
     * cantidad, nombre y ranura. La ranura va la ultima para que los cuatro campos de antes
     * conserven su desplazamiento.
     *
     * @returns {{count: number, weight: number, capacity: number, flat: Array}}
     */
    inventoryPayload(creature) {
        /*
         * LA RANURA VIAJA, y es lo unico que le faltaba al inventario para que el cliente
         * pudiera enseñar el equipo.
         *
         * El dato ya estaba calculado aqui arriba; lo que no salia era del motor, asi que el
         * cliente recibia una lista plana de cosas y no tenia forma de saber cual esta puesta
         * ni donde ponerla. No se manda ademas una marca de "equipado" porque seria el mismo
         * dato dos veces -equipado ES "ranura distinta de la mochila"- y dos campos que
         * dicen lo mismo acaban contradiciendose.
         *
         * El orden de los campos anteriores no cambia: la ranura va al final.
         */
        const entries = this.inventoryOf(creature)
            .map((entry) => [entry.index, entry.typeId, entry.count, entry.name, entry.slot]);

        return {
            count: entries.length,
            weight: this.weightOf(creature),
            capacity: this.capacityOf(creature),
            flat: entries.reduce((all, entry) => all.concat(entry), [])
        };
    }

    /**
     * Una criatura dice algo en voz alta.
     *
     * Se guarda aparte de los mensajes privados porque son cosas distintas: un
     * mensaje privado va a un jugador, y esto lo oye quien esté alrededor. Por eso lo
     * que se avisa es el HECHO de hablar, y quien lo escucha decide a quién le llega.
     *
     * Igual que con los mensajes privados, avisar es lo que hace que un monstruo pueda
     * hablar: el contenido llama aquí y el motor difunde, sin que el contenido sepa
     * nada del protocolo ni de qué jugadores hay cerca.
     */
    creatureSay(creatureId, text) {
        const creature = this.getCreature(creatureId);

        this.says.push({
            creatureId: Number(creatureId),
            creatureName: creature ? creature.name : null,
            text: text
        });

        if (creature) {
            this.emit('onCreatureSay', creature, String(text));
        }
    }

    teleportPlayer(playerId, x, y, z) {
        const player = this.getPlayer(playerId);
        if (!player) {
            return false;
        }
        const from = player.position.copy();
        const result = this.teleportCreature(player, { x: x, y: y, z: z });
        if (result.moved) {
            this.teleports.push({ playerId: player.id, from: from, to: result.to });
        }
        return result.moved;
    }

    getWorldTime() {
        return Math.floor((this.now() - this.startTime) / 1000);
    }

    // =======================================================================
    // Bucle de simulación
    // =======================================================================

    /**
     * Arranca el bucle. El intervalo es el presupuesto de simulación, no el de
     * red: el protocolo agrupa y envía por su cuenta.
     */
    start() {
        if (this.timer) {
            return false;
        }
        this.timer = setInterval(() => this.tick(), this.tickIntervalMs);

        // No bloquear el cierre del proceso por este temporizador.
        if (this.timer.unref) {
            this.timer.unref();
        }
        return true;
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        return true;
    }

    tick() {
        this.tickCount += 1;

        if (this.scheduler) {
            this.scheduler.tick(this.tickIntervalMs);
        }

        // La regeneración de vida, maná y almas, al ritmo de cada vocación.
        if (this.players.size > 0) {
            const ahora = this.now();
            this.players.forEach((player) => {
                Vocacion.regenerar(player, this.vocationOf(player), ahora);
                if (player.speedBonusUntil && ahora >= player.speedBonusUntil) {
                    player.speedBonus = 0;
                    player.speedBonusUntil = 0;
                    player.speed = (player.baseSpeed || player.speed) + (player.condSpeed || 0);
                }
                // La calavera caduca sola (avisa a quien la vea).
                if (player.skull && player.skullUntil && ahora >= player.skullUntil) {
                    this.skullOf(player);
                }
            });
        }

        // Las condiciones (veneno, regeneración, prisa...) corren con el mundo.
        if (this.condiciones) {
            this.condiciones.tick(this.now());
        }

        this.compactCounter += 1;
        if (this.compactCounter >= COMPACT_EVERY_TICKS && this.map) {
            this.compactCounter = 0;
            this.map.compact();
        }

        // El aviso de tick va AL FINAL: quien lo escuche (la capa de red) debe ver
        // el mundo ya simulado, no a medio simular. Enviar la vista antes de que
        // las criaturas se hayan movido mandaria el estado del tick anterior con
        // un tick de retraso.
        this.emit('onTick', this.tickCount);

        return this.tickCount;
    }

    // =======================================================================
    // Información
    // =======================================================================

    stats() {
        return {
            players: this.players.size,
            monsters: this.monsters.size,
            creatures: this.creatures.size,
            items: this.items.size,
            worldTime: this.getWorldTime(),
            ticks: this.tickCount,
            scheduled: this.scheduler ? this.scheduler.size : 0
        };
    }
}

// Curar, dar y quitar, luz, grupos, calaveras, mensajes privados y depósito (`extras.js`).
Object.assign(World.prototype, require('./extras').extras);

module.exports = { World, DIRECTION_DELTA, COMPACT_EVERY_TICKS, resetIdCounter };
