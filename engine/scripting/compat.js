'use strict';

/**
 * LA CAPA DE COMPATIBILIDAD CON LOS SCRIPTS VIEJOS: las funciones sueltas de TFS 0.x / 8.60 (las de
 * `compat.lua`: `doPlayerSendTextMessage`, `getPlayerStorageValue`, `doCreateItem`...) y los
 * constructores globales de TFS 1.x (`Player(...)`, `Tile(...)`, `ItemType(...)`...), como globales
 * de los scripts, igual que `Game`.
 *
 * Cada función es una llamada fina a la API de objetos (entities.js, tfs.js, game.js): aquí no hay
 * reglas propias. Lo que cambia es la FORMA, la de entonces:
 *
 *   - Una criatura es su `cid` (un número) y un objeto su `uid`. Se aceptan también los envoltorios,
 *     así que mezclar las dos APIs funciona: `doPlayerAddItem(player, 2160, 1)`.
 *   - Lo que no existe devuelve `false` (el LUA_ERROR de entonces); lo que se hace, `true`.
 *   - Un storage sin valor es `-1`, no null (`getPlayerStorageValue` y `getGlobalStorageValue`).
 *   - Las «cosas» (`getThing`, `getPlayerSlotItem`, `getTileItemById`...) son tablas
 *     `{ uid, itemid, type, actionid }`, como `pushThing` de TFS.
 *
 * La lista entera, con su equivalente, está en docs/SCRIPTS.md («Compatibilidad con TFS»).
 */

const { Position } = require('../world/position');
const Enums = require('./enums');
const Tfs = require('./tfs');

/** Las claves de config.lua de TFS (`configKeys.RATE_EXPERIENCE`...) y su nombre en config.js de Jetyum. */
const CONFIG_KEYS = {
    SERVER_NAME: 'serverName',
    IP: 'ip',
    LOGIN_PORT: 'loginProtocolPort',
    GAME_PORT: 'gameProtocolPort',
    MAX_PLAYERS: 'maxPlayers',
    WORLD_TYPE: 'worldType',
    PROTECTION_LEVEL: 'protectionLevel',
    PZ_LOCKED: 'pzLocked',
    RED_SKULL_KILLS: 'redSkullKills',
    WHITE_SKULL_TIME: 'whiteSkullTime',
    RED_SKULL_TIME: 'redSkullTime',
    EXP_SHARE_RANGE: 'expShareRange',
    RATE_EXPERIENCE: 'rateExperience',
    RATE_SKILL: 'rateSkill',
    RATE_MAGIC: 'rateMagic',
    RATE_LOOT: 'rateLoot',
    RATE_SPAWN: 'rateSpawn',
    HOUSE_PRICE: 'housePriceEachSQM',
    HOUSE_LEVEL: 'houseLevel',
    HOUSE_RENT_PERIOD: 'houseRentPeriod',
    DEATH_LOSE_PERCENT: 'deathLosePercent',
    NEWPLAYER_LEVEL: 'newPlayerLevel',
    NEWPLAYER_TOWN_ID: 'newPlayerTownId',
    MAP_NAME: 'mapName',
    DEFAULT_LANGUAGE: 'defaultLanguage',
    AUTOSAVE_INTERVAL: 'autosaveIntervalMs',
    DAY_CYCLE_MINUTES: 'dayCycleMinutes'
};

/**
 * @param {Object} deps
 * @param {Object} deps.world
 * @param {Object} deps.registry
 * @param {Object} deps.game el `Game` de este motor
 * @param {Object} [deps.config]
 * @returns {Object} nombre -> función o constante, para instalar como globales
 */
function crearCompat(deps) {
    const world = deps.world;
    const registry = deps.registry;
    const game = deps.game;
    const config = deps.config || {};
    const entities = registry.entities;

    // -----------------------------------------------------------------------
    // De cid / uid / nombre a envoltorio
    // -----------------------------------------------------------------------

    /** La criatura (envoltorio) de un cid, un envoltorio o un nombre de jugador; null si no está. */
    const criatura = (cid) => {
        const c = Tfs.criaturaReal(world, cid);
        return c ? entities.creature(c.id) : null;
    };
    /** El jugador (envoltorio), o null si no es un jugador conectado. */
    const jugador = (cid) => {
        const c = criatura(cid);
        return c && c.isPlayer() ? c : null;
    };
    /** El objeto (envoltorio) de un uid o de un envoltorio; null si no existe. */
    const objeto = (uid) => {
        if (uid && typeof uid.getId === 'function' && typeof uid.getUniqueId === 'function') {
            return uid;
        }
        const item = world.getItem(Number(uid));
        return item ? entities.item(item.instanceId) : null;
    };
    const posicion = (p) => (p ? new Position(p.x, p.y, p.z) : null);
    const idDe = (w) => (w ? w.getId() : false);

    /** Una «cosa» como la daba TFS (`pushThing`): `{ uid, itemid, type, actionid }`. */
    const cosa = (algo) => {
        if (!algo) {
            return { uid: 0, itemid: 0, type: 0, actionid: 0 };
        }
        if (typeof algo.isPlayer === 'function') {
            return { uid: algo.getId(), itemid: 1, type: algo.isPlayer() ? 1 : (algo.isNpc() ? 3 : 2), actionid: 0 };
        }
        return { uid: algo.getUniqueId(), itemid: algo.getId(), type: algo.getSubType(), actionid: algo.getActionId() };
    };

    /** Envuelve una función de jugador: sin jugador, `false`. */
    const conJugador = (hacer) => (cid, ...args) => {
        const p = jugador(cid);
        return p ? hacer(p, ...args) : false;
    };
    const conCriatura = (hacer) => (cid, ...args) => {
        const c = criatura(cid);
        return c ? hacer(c, ...args) : false;
    };

    const storageDe = (v) => (v === null || v === undefined ? -1 : v);

    // -----------------------------------------------------------------------
    // Los constructores de TFS 1.x
    // -----------------------------------------------------------------------

    /** `Player(cid | nombre)`: el jugador conectado, o null. */
    function Player(cid) {
        return jugador(cid);
    }
    /** `Creature(cid | nombre)`. */
    function Creature(cid) {
        return criatura(cid);
    }
    /** `Monster(cid)`. */
    function Monster(cid) {
        const c = criatura(cid);
        return c && c.isMonster() ? c : null;
    }
    /** `Npc(cid | nombre)`: también por el nombre de un NPC del mundo. */
    function Npc(cid) {
        if (typeof cid === 'string' && !/^\d+$/.test(cid) && world.getNpc) {
            const npc = world.getNpc(cid);
            return npc ? entities.creature(npc.id) : null;
        }
        const c = criatura(cid);
        return c && c.isNpc() ? c : null;
    }
    /** `Item(uid)`. */
    function Item(uid) {
        return objeto(uid);
    }
    /** `Container(uid)`: el objeto si es un contenedor, o null. */
    function Container(uid) {
        const o = objeto(uid);
        return o && o.isContainer() ? o : null;
    }
    /** `Tile(pos)` o `Tile(x, y, z)`. */
    function Tile(a, b, c) {
        return Tfs.crearTile(world, a, b, c);
    }
    /** `ItemType(id | nombre)`. */
    function ItemType(idONombre) {
        return new Tfs.ItemTypeWrapper(world, idONombre);
    }
    /** `Town(id | nombre)`. */
    function Town(idONombre) {
        return Tfs.buscarCiudad(world, idONombre);
    }
    /** `Group(id)`. */
    function Group(idONombre) {
        return Tfs.buscarGrupo(world, idONombre);
    }
    /** `Vocation(id | nombre)`. */
    function Vocation(idONombre) {
        return Tfs.buscarVocacion(world, idONombre);
    }
    /** `House(id)`. */
    function House(id) {
        return world.houseById && world.houseById(id) ? new (require('./entities').HouseWrapper)(world, Number(id)) : null;
    }
    /** `Condition(CONDITION_*[, CONDITIONID_*])`. */
    function Condition(tipo, id) {
        return new Tfs.ConditionWrapper(tipo, id);
    }

    // -----------------------------------------------------------------------
    // config.lua
    // -----------------------------------------------------------------------

    const valorDeConfig = (clave) => {
        const nombre = CONFIG_KEYS[clave] || clave;
        return config[nombre];
    };
    /** `configManager.getNumber(configKeys.X)` y compañía, sobre config.js. */
    const configManager = {
        getNumber: (clave) => Number(valorDeConfig(clave)) || 0,
        getString: (clave) => {
            const v = valorDeConfig(clave);
            return v === undefined || v === null ? '' : String(v);
        },
        getBoolean: (clave) => {
            const v = valorDeConfig(clave);
            return v === true || v === 1 || v === 'yes' || v === 'true';
        }
    };
    /** `configKeys.RATE_EXPERIENCE`... : el nombre de la clave en config.js. */
    const configKeys = Object.fromEntries(Object.keys(CONFIG_KEYS).map((k) => [k, CONFIG_KEYS[k]]));

    // -----------------------------------------------------------------------
    // Las funciones de 0.x
    // -----------------------------------------------------------------------

    const f = {
        // --- Mensajes y efectos ------------------------------------------------
        doPlayerSendTextMessage: conJugador((p, tipo, texto) => !!p.sendTextMessage(tipo, texto)),
        doPlayerSendCancel: conJugador((p, texto) => !!p.sendCancelMessage(texto)),
        doCreatureSay: conCriatura((c, texto) => !!c.say(texto)),
        doSendMagicEffect: (pos, efecto) => world.sendMagicEffect(pos, efecto),
        doSendDistanceShoot: (desde, hasta, proyectil) => world.sendDistanceEffect(desde, hasta, proyectil),
        /** Un número que sube sobre la casilla (el texto animado del 8.60). El color no cambia nada. */
        doSendAnimatedText: (pos, texto) => game.sendAnimatedText(pos, texto),
        broadcastMessage: (texto) => game.broadcastMessage(texto) >= 0,
        doBroadcastMessage: (texto) => game.broadcastMessage(texto) >= 0,
        /** `sendChannelMessage(channelId, type, text)`: la de `Game` (canales.js, del agente de los canales). */
        sendChannelMessage: (canal, tipo, texto) => (game.sendChannelMessage ? game.sendChannelMessage(canal, tipo, texto) : false),
        sendGuildChannelMessage: (gremio, tipo, texto) =>
            (game.sendGuildChannelMessage ? game.sendGuildChannelMessage(gremio, tipo, texto) : false),

        // --- Mover y teletransportar ------------------------------------------
        /** `doTeleportThing(cid | uid, pos)`: una criatura se teletransporta; un objeto se mueve. */
        doTeleportThing: (uid, pos) => {
            const c = criatura(uid);
            if (c) {
                return c.teleportTo(pos) !== false;
            }
            const o = objeto(uid);
            return !!(o && o.moveTo && o.moveTo(pos));
        },

        // --- Objetos del mundo --------------------------------------------------
        /** `doCreateItem(itemid, count, pos)`: devuelve el uid del objeto, o false. */
        doCreateItem: (itemId, count, pos) => {
            const item = pos ? game.createItem(itemId, count || 1, pos.x, pos.y, pos.z) : null;
            return item ? item.getUniqueId() : false;
        },
        /** `doCreateItemEx(itemid, count)`: un objeto suelto (sin sitio), para `doPlayerAddItemEx` o `addItemEx`. */
        doCreateItemEx: (itemId, count) => {
            const item = game.createItem(itemId, count || 1);
            return item ? item.getUniqueId() : false;
        },
        doRemoveItem: (uid, count) => {
            const o = objeto(uid);
            return !!(o && o.remove(count === -1 ? undefined : count));
        },
        doTransformItem: (uid, nuevo, count) => {
            const o = objeto(uid);
            if (!o || !o.transform(nuevo)) {
                return false;
            }
            if (count !== undefined && count !== -1 && o.setCount) {
                o.setCount(count);
            }
            return true;
        },
        doItemSetAttribute: (uid, clave, valor) => {
            const o = objeto(uid);
            return !!(o && o.setAttribute(clave, valor));
        },
        doItemSetActionId: (uid, aid) => {
            const o = objeto(uid);
            return !!(o && o.setActionId(aid));
        },
        getItemAttribute: (uid, clave) => {
            const o = objeto(uid);
            const v = o ? o.getAttribute(clave) : undefined;
            return v === undefined ? false : v;
        },
        getThing: (uid) => cosa(criatura(uid) || objeto(uid)),
        getItemName: (itemId) => game.getItemName(itemId) || '',
        getItemNameById: (itemId) => game.getItemName(itemId) || '',
        getItemWeight: (itemId, count) => new Tfs.ItemTypeWrapper(world, itemId).getWeight(count === undefined ? 1 : count),
        getItemIdByName: (nombre) => new Tfs.ItemTypeWrapper(world, nombre).getId() || false,
        getTileItemById: (pos, itemId) => cosa(pos ? (Tfs.crearTile(world, pos) || { getItemById: () => null }).getItemById(itemId) : null),
        getTopCreature: (pos) => cosa(pos ? (Tfs.crearTile(world, pos) || { getTopCreature: () => null }).getTopCreature() : null),
        getTileHouseInfo: (pos) => {
            const casa = world.houseAt ? world.houseAt(pos.x, pos.y, pos.z) : null;
            return casa ? casa.id : false;
        },

        // --- Inventario y dinero -------------------------------------------------
        /**
         * `doPlayerAddItem(cid, itemid, count[, canDropOnMap])`: a la mochila y, si no cabe (y no se
         * pide lo contrario), a sus pies, como en TFS. Devuelve true si lo recibió de un modo u otro.
         */
        doPlayerAddItem: conJugador((p, itemId, count, alSuelo) => {
            const r = p.addItem(itemId, count || 1);
            if (r && r.ok) {
                return true;
            }
            if (alSuelo === false || !r || r.reason === 'unknownItem') {
                return false;
            }
            const pos = p.getPosition();
            return !!game.createItem(itemId, count || 1, pos.x, pos.y, pos.z);
        }),
        doPlayerRemoveItem: conJugador((p, itemId, count) => p.removeItem(itemId, count || 1)),
        getPlayerItemCount: conJugador((p, itemId) => p.getItemCount(itemId)),
        doPlayerAddMoney: conJugador((p, n) => p.addMoney(n)),
        doPlayerRemoveMoney: conJugador((p, n) => p.removeMoney(n)),
        getPlayerMoney: conJugador((p) => p.getMoney()),
        getPlayerSlotItem: conJugador((p, slot) => cosa(p.getSlotItem(slot))),
        getPlayerItemById: conJugador((p, profundo, itemId) => cosa(p.getItemById(itemId, profundo))),
        getPlayerFreeCap: conJugador((p) => p.getFreeCapacity()),
        getPlayerWeapon: conJugador((p) => cosa(p.getSlotItem(Enums.CONST_SLOT.CONST_SLOT_RIGHT))),

        // --- Storages ------------------------------------------------------------
        getPlayerStorageValue: (cid, clave) => {
            const p = jugador(cid);
            return p ? storageDe(p.getStorageValue(clave)) : -1;
        },
        setPlayerStorageValue: conJugador((p, clave, valor) => p.setStorageValue(clave, valor)),
        getGlobalStorageValue: (clave) => storageDe(game.getStorageValue(clave)),
        setGlobalStorageValue: (clave, valor) => game.setStorageValue(clave, valor),

        // --- Datos del jugador -----------------------------------------------------
        getPlayerLevel: conJugador((p) => p.getLevel()),
        getPlayerExperience: conJugador((p) => p.getExperience()),
        getPlayerMagLevel: conJugador((p) => p.getMagicLevel()),
        getPlayerSkillLevel: conJugador((p, skill) => p.getSkillLevel(skill)),
        /** `getPlayerVocation(cid)`: el NÚMERO de la vocación, como en TFS. */
        getPlayerVocation: conJugador((p) => {
            const v = p.getVocationInfo();
            return v ? v.getId() : 0;
        }),
        doPlayerSetVocation: conJugador((p, voc) => !!(p.setVocation(voc) || {}).ok),
        getPlayerName: conJugador((p) => p.getName()),
        getPlayerGUID: conJugador((p) => p.getGuid()),
        getPlayerAccountId: conJugador((p) => p.getAccountId()),
        getPlayerIp: conJugador((p) => p.getIp()),
        getPlayerSex: conJugador((p) => (p.getSex() === 'female' ? Enums.PLAYERSEX.PLAYERSEX_FEMALE : Enums.PLAYERSEX.PLAYERSEX_MALE)),
        doPlayerSetSex: conJugador((p, sexo) => p.setSex(sexo)),
        getPlayerPremiumDays: conJugador((p) => p.getPremiumDays()),
        isPremium: conJugador((p) => p.isPremium()),
        getPlayerSoul: conJugador((p) => p.getSoul()),
        doPlayerAddSoul: conJugador((p, n) => p.addSoul(n) >= 0),
        getPlayerMana: conJugador((p) => p.getMana()),
        getPlayerMaxMana: conJugador((p) => p.getMaxMana()),
        getPlayerTown: conJugador((p) => {
            const t = p.getTown();
            return t ? t.getId() : 0;
        }),
        doPlayerSetTown: conJugador((p, townId) => p.setTown(townId)),
        getPlayerGroupId: conJugador((p) => p.getGroup().getId()),
        doPlayerSetGroupId: conJugador((p, id) => p.setGroup(id)),
        /** `getPlayerAccess(cid)`: el nivel de acceso de 0.x (0 jugador ... 5 god): el grupo menos uno. */
        getPlayerAccess: conJugador((p) => Math.max(0, p.getGroup().getId() - 1)),
        getPlayerFlagValue: conJugador((p, bandera) => p.getGroup().hasFlag(bandera)),
        getPlayerBlessing: conJugador((p, n) => p.hasBlessing(n)),
        doPlayerAddBlessing: conJugador((p, n) => p.addBlessing(n)),
        doPlayerAddExp: conJugador((p, exp) => !!p.addExperience(exp)),
        doPlayerAddExperience: conJugador((p, exp) => !!p.addExperience(exp)),
        doPlayerAddSkillTry: conJugador((p, skill, n) => !!p.addSkillTries(Tfs.nombreDeSkill(skill), n)),
        doPlayerAddManaSpent: conJugador((p, n) => !!p.addManaSpent(n)),
        getPlayerPosition: conJugador((p) => p.getPosition()),
        getPlayerLookDir: conJugador((p) => p.getDirection()),
        getPlayerParty: conJugador((p) => {
            const g = p.getParty();
            return g && g.getLeader() ? g.getLeader().getId() : false;
        }),
        getPlayerByName: (nombre) => {
            const p = game.getPlayerByName(nombre);
            return p ? p.getId() : false;
        },
        getPlayerByNameWildcard: (nombre) => {
            const buscado = String(nombre || '').replace(/~$/, '').toLowerCase();
            const p = game.getPlayers().find((x) => x.getName().toLowerCase().startsWith(buscado));
            return p ? p.getId() : false;
        },
        /** `getPlayersOnline()`: los cid de los conectados. */
        getPlayersOnline: () => game.getPlayers().map((p) => p.getId()),
        getOnlinePlayers: () => game.getPlayers().map((p) => p.getName()),

        // --- Criaturas -----------------------------------------------------------
        isPlayer: (cid) => !!jugador(cid),
        isMonster: (cid) => !!Monster(cid),
        isNpc: (cid) => {
            const c = criatura(cid);
            return !!(c && c.isNpc());
        },
        isCreature: (cid) => !!criatura(cid),
        isItem: (uid) => !!objeto(uid),
        isContainer: (uid) => !!Container(uid),
        getCreatureName: conCriatura((c) => c.getName()),
        getCreaturePosition: conCriatura((c) => c.getPosition()),
        getCreatureHealth: conCriatura((c) => c.getHealth()),
        getCreatureMaxHealth: conCriatura((c) => c.getMaxHealth()),
        getCreatureMana: conCriatura((c) => (c.getMana ? c.getMana() : 0)),
        getCreatureMaxMana: conCriatura((c) => (c.getMaxMana ? c.getMaxMana() : 0)),
        getCreatureSpeed: conCriatura((c) => c.getSpeed()),
        getCreatureBaseSpeed: conCriatura((c) => c.getBaseSpeed()),
        getCreatureLookDirection: conCriatura((c) => c.getDirection()),
        doSetCreatureDirection: conCriatura((c, dir) => c.setDirection(dir)),
        getCreatureOutfit: conCriatura((c) => c.getOutfit()),
        /** `doSetCreatureOutfit(cid, outfit[, time])`: el tiempo no se mira (el aspecto se queda). */
        doSetCreatureOutfit: conCriatura((c, outfit) => !!(c.setOutfit(outfit, false) || {}).ok),
        /** `getCreatureSkullType(cid)`: SKULL_NONE, SKULL_WHITE o SKULL_RED. */
        getCreatureSkullType: conCriatura((c) => Enums.CALAVERA_DE_TEXTO[c.getSkull()] || 0),
        getCreatureTarget: conCriatura((c) => {
            const t = c.getTarget();
            return t ? t.getId() : 0;
        }),
        /** `getCreatureMaster(cid)`: sin invocaciones en Jetyum, cada una es su propio amo. */
        getCreatureMaster: conCriatura((c) => c.getId()),
        getCreatureSummons: conCriatura(() => []),
        doCreatureAddHealth: conCriatura((c, n) => {
            c.addHealth(n);
            return true;
        }),
        doCreatureAddMana: conCriatura((c, n) => (c.addMana ? c.addMana(n) >= 0 : false)),
        doChangeSpeed: conCriatura((c, delta) => c.changeSpeed(delta)),
        doCreatureSetNoMove: conCriatura((c, quieto) => c.setNoMove(quieto)),
        getCreatureCondition: conCriatura((c, tipo) => c.hasCondition(tipo)),
        /** `doAddCondition(cid, condition)`: una `Condition` de TFS o una condición de Jetyum. */
        doAddCondition: conCriatura((c, condicion) => c.addCondition(condicion)),
        doRemoveCondition: conCriatura((c, tipo) => c.removeCondition(tipo)),
        getThingPos: (uid) => {
            const c = criatura(uid);
            if (c) {
                return c.getPosition();
            }
            const o = objeto(uid);
            return o ? o.getPosition() : false;
        },
        getThingPosition: (uid) => f.getThingPos(uid),
        /** `doSummonCreature(name, pos)`: aparece un monstruo; devuelve su cid o false. */
        doSummonCreature: (nombre, pos) => idDe(game.createMonster(nombre, pos.x, pos.y, pos.z)),
        doCreateMonster: (nombre, pos) => idDe(game.createMonster(nombre, pos.x, pos.y, pos.z)),
        /** `doCreateNpc(name, pos)`: un NPC de data/npc; su cid o false. */
        doCreateNpc: (nombre, pos) => idDe(game.createNpc(nombre, pos.x, pos.y, pos.z)),
        doRemoveCreature: conCriatura((c) => c.remove()),
        /** `getWorldCreatures(type)`: cuántos hay (0 jugadores, 1 monstruos, 2 NPC, 3 todos). */
        getWorldCreatures: (tipo) => {
            const t = Number(tipo) || 0;
            if (t === 0) { return world.players.size; }
            if (t === 1) { return world.monsters.size; }
            if (t === 2) { return world.npcs ? world.npcs.size : 0; }
            return world.creatures.size;
        },

        // --- Condiciones a la manera de 0.x -----------------------------------------
        createConditionObject: (tipo, ticks) => {
            const c = new Tfs.ConditionWrapper(tipo);
            if (ticks !== undefined) {
                c.setTicks(ticks);
            }
            return c;
        },
        setConditionParam: (condicion, clave, valor) => !!(condicion && condicion.setParameter(clave, valor)),
        addDamageCondition: (condicion, rondas, tiempo, valor) => !!(condicion && condicion.addDamage(rondas, tiempo, valor)),
        setConditionFormula: (condicion, mina, minb, maxa, maxb) => !!(condicion && condicion.setFormula(mina, minb, maxa, maxb)),

        // --- Ciudades, casas, mundo y config -------------------------------------------
        getTownTemplePosition: (townId) => {
            const t = Town(townId);
            return t ? t.getTemplePosition() : false;
        },
        getTownName: (townId) => {
            const t = Town(townId);
            return t ? t.getName() : false;
        },
        getTownId: (nombre) => {
            const t = Town(nombre);
            return t ? t.getId() : false;
        },
        /** `getHouseOwner(houseId)`: el guid del dueño (0 sin dueño), o false si la casa no existe. */
        getHouseOwner: (houseId) => {
            const h = House(houseId);
            return h ? h.getOwnerGuid() : false;
        },
        getHouseName: (houseId) => {
            const h = House(houseId);
            return h ? h.getName() : false;
        },
        getHouseRent: (houseId) => {
            const h = House(houseId);
            return h ? h.getRent() : false;
        },
        getHouseTown: (houseId) => {
            const h = House(houseId);
            return h ? h.getTownId() : false;
        },
        setHouseOwner: (houseId, guid) => {
            const h = House(houseId);
            return !!(h && h.setOwnerGuid(guid));
        },
        getHouseByPlayerGUID: (guid) => {
            const p = game.getPlayers().find((x) => x.getGuid() === Number(guid));
            const h = p ? p.getHouse() : null;
            return h ? h.getId() : false;
        },
        /** `getWorldTime()`: los minutos del día del juego (0 a 1439), como en TFS. */
        getWorldTime: () => {
            const [h, m] = String(world.worldHour ? world.worldHour() : '00:00').split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
        },
        getWorldLight: () => (world.worldLight ? world.worldLight() : 255),
        getWorldType: () => Enums.tipoDeMundo(world.worldType || config.worldType),
        getWorldUpTime: () => game.getWorldTime(),
        getConfigValue: (clave) => {
            const v = valorDeConfig(clave);
            return v === undefined ? false : v;
        },
        getConfigInfo: (clave) => f.getConfigValue(clave),
        getDistanceBetween: (a, b) => Position.getDistanceBetween(a, b),
        isSightClear: (desde, hasta) => !!(desde && posicion(desde).isSightClear(hasta)),
        isInRange: (pos, desde, hasta) => !!(pos && posicion(pos).isInRange(desde, hasta)),
        /** `isInArray(array, value)`: con los textos sin mayúsculas, como en TFS. */
        isInArray: (lista, valor) => {
            if (!Array.isArray(lista)) {
                return false;
            }
            const v = typeof valor === 'string' ? valor.toLowerCase() : valor;
            return lista.some((x) => (typeof x === 'string' ? x.toLowerCase() : x) === v);
        },

        // --- addEvent ------------------------------------------------------------------
        addEvent: (fn, ms, ...args) => game.addEvent(fn, ms, ...args),
        stopEvent: (id) => game.stopEvent(id)
    };

    return {
        ...f,
        Player, Creature, Monster, Npc, Item, Container, Tile, ItemType, Town, Group, Vocation, House, Condition,
        Position: Tfs.PosicionDeScript,
        configManager,
        configKeys
    };
}

module.exports = { crearCompat, CONFIG_KEYS };
