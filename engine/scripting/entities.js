'use strict';

/**
 * Envoltorios que se pasan a los módulos de contenido.
 *
 * Son **envoltorios alrededor de un identificador**, no los objetos del mundo. La
 * diferencia no es cosmética: si un módulo recibiera el objeto real, podría
 * mutarlo sin pasar por ninguna regla —ponerse 999999 de vida, teletransportarse
 * fuera del mapa, vaciar el inventario de otro—. Con un envoltorio, todo pasa por
 * esta API y aquí se puede validar.
 *
 * La jerarquía copia la del motor: un jugador y un monstruo son las dos cosas una
 * **criatura**, y por eso comparten base. Importa en la práctica: un handler de
 * `onStepIn(creature, ...)` recibe indistintamente a cualquiera de los dos, y si
 * fueran tipos sin relación habría que duplicar cada handler o comprobar el tipo
 * a mano en todos.
 *
 * Las instancias se cachean por identificador, así que dos peticiones de la misma
 * criatura devuelven el mismo objeto y `a === b` funciona como se espera.
 */

const { Position } = require('../world/position');
const { normalizeOutfit, canUseOutfit } = require('../world/outfit');
const { formatWeight } = require('../world/weight');
// Las bendiciones y el historial de muertes (el bloque «Bendiciones» del jugador).
const Muerte = require('../world/muerte');
// Las constantes de TFS (CONST_SLOT_*, SKILL_*, CONDITION_*...) y sus traducciones a Jetyum.
const Enums = require('./enums');
const { STAMINA_MAX } = require('../world/vocacion');

/**
 * Las clases de TFS que no son criaturas ni objetos (Tile, ItemType, Group, Vocation, Party,
 * Condition...): engine/scripting/tfs.js. Se piden al usarse porque tfs.js también necesita este
 * archivo, y así da igual cuál se cargue antes.
 */
const T = () => require('./tfs');

/** Lo que se le dice al jugador por cada RETURNVALUE_* (`player.sendCancelMessage(RETURNVALUE_...)`). */
const TEXTO_DE_RETURNVALUE = {
    1: 'No es posible.',
    2: 'No hay sitio.',
    3: 'No puedes entrar en una zona de protección después de atacar a otro jugador.',
    4: 'No estás invitado.',
    5: 'No puedes lanzarlo ahí.',
    6: 'No hay camino.',
    7: 'El destino está fuera de alcance.',
    8: 'Hay una criatura en medio.',
    9: 'No puedes mover eso.',
    17: 'Está demasiado lejos.',
    18: 'Primero baja.',
    19: 'Primero sube.',
    20: 'No cabe en el contenedor.',
    21: 'Pesa demasiado.',
    22: 'No puedes coger eso.',
    23: 'Es imposible.',
    24: 'Tu depósito está lleno.',
    25: 'Esa criatura no existe.',
    26: 'No puedes usar eso.'
};

/** El nombre de condición de Jetyum, venga como CONDITION_* (número) o como nombre. */
function nombreDeCondicion(tipo) {
    return typeof tipo === 'number' ? Enums.CONDICION_DE_TIPO[tipo] || null : tipo;
}

/** Clase base: lo que comparten jugadores y monstruos. */
class CreatureWrapper {
    constructor(world, id) {
        this.world = world;
        this.id = id;
    }

    /** La criatura real, o null si ya no existe. Uso interno del envoltorio. */
    _creature() {
        return this.world.getCreature(this.id);
    }

    getId() {
        return this.id;
    }

    getName() {
        const creature = this._creature();
        return creature ? creature.name : null;
    }

    /** Devuelve una COPIA: mutarla no mueve a nadie hasta llamar a teleportTo. */
    getPosition() {
        const creature = this._creature();
        return creature
            ? new Position(creature.position.x, creature.position.y, creature.position.z)
            : null;
    }

    getHealth() {
        const creature = this._creature();
        return creature ? creature.health : 0;
    }

    getMaxHealth() {
        const creature = this._creature();
        return creature ? creature.maxHealth : 0;
    }

    getSpeed() {
        const creature = this._creature();
        return creature ? creature.speed : 0;
    }

    getDirection() {
        const creature = this._creature();
        return creature ? creature.direction : 0;
    }

    isPlayer() {
        return false;
    }

    isMonster() {
        return false;
    }

    isDead() {
        const creature = this._creature();
        return !creature || creature.isDead();
    }

    /** Decir algo en voz alta, para que lo oiga quien esté cerca. */
    say(text) {
        this.world.creatureSay(this.id, String(text));
        return this;
    }

    isNpc() {
        const creature = this._creature();
        return !!(creature && creature.kind === 'npc');
    }

    /** Cura (o hiere, en negativo, sin matar) a cualquier criatura. Devuelve la vida que tiene. */
    addHealth(cantidad) {
        const creature = this._creature();
        if (!creature) {
            return 0;
        }
        this.world.healCreature(creature, cantidad);
        return creature.health;
    }

    /** A quién ataca (un envoltorio), o null. */
    getTarget() {
        const creature = this._creature();
        const target = creature && creature.target;
        return target && this.world.getCreature(target.id) ? this.world.wrapForContent(target) : null;
    }

    /** Fija (o quita, con null) a quién ataca. */
    setTarget(otra) {
        const creature = this._creature();
        if (!creature) {
            return false;
        }
        const target = otra ? this.world.getCreature(typeof otra.getId === 'function' ? otra.getId() : otra) : null;
        creature.target = target && target !== creature ? target : null;
        return true;
    }

    /** Lo mueve a otra casilla de golpe (sin andar). */
    teleportTo(position) {
        const creature = this._creature();
        if (!creature || !position) {
            return false;
        }
        return this.world.teleportCreature(creature, { x: position.x, y: position.y, z: position.z }).moved;
    }

    /** Da un paso: 'norte', 'sur', 'este', 'oeste' (o 'north'... o 0-3 como TFS). */
    move(direccion) {
        const creature = this._creature();
        const pasos = {
            norte: [0, -1], north: [0, -1], 0: [0, -1], este: [1, 0], east: [1, 0], 1: [1, 0],
            sur: [0, 1], south: [0, 1], 2: [0, 1], oeste: [-1, 0], west: [-1, 0], 3: [-1, 0]
        };
        const paso = pasos[String(direccion).toLowerCase()];
        if (!creature || !paso) {
            return false;
        }
        return this.world.moveCreature(creature, { x: paso[0], y: paso[1] }).moved === true;
    }

    /** Un efecto sobre su casilla (`EFECTO.FUEGO`, `CONST_ME_MAGIC_BLUE`...). */
    sendMagicEffect(efecto) {
        const creature = this._creature();
        return creature ? this.world.sendMagicEffect(creature.position, efecto) : false;
    }

    /**
     * CONDICIONES: veneno, fuego, energía, sangrado (daño cada cierto tiempo), regeneración
     * (cura), prisa y parálisis (velocidad), luz. Ver `engine/world/condiciones.js`.
     *
     *     player.addCondition({ type: 'veneno', ticks: 10, interval: 2000, value: 5 })
     *     player.addCondition({ type: 'prisa', duration: 10000, value: 60 })
     */
    addCondition(condicion) {
        const creature = this._creature();
        // Una `Condition(CONDITION_POISON)` de TFS (tfs.js) se traduce a la de Jetyum.
        const tfs = condicion instanceof T().ConditionWrapper ? condicion._paraJetyum(creature) : null;
        if (condicion instanceof T().ConditionWrapper && !tfs) {
            return false;
        }
        const c = { ...(tfs || condicion || {}) };
        if (typeof c.type === 'number') {
            c.type = nombreDeCondicion(c.type);
        }
        if (c.attacker && typeof c.attacker.getId === 'function') {
            c.attacker = this.world.getCreature(c.attacker.getId());
        }
        return !!(creature && this.world.condiciones && this.world.condiciones.add(creature, c));
    }

    /** Quita una condición: por su nombre o por CONDITION_* (`creature:removeCondition(type)` de TFS). */
    removeCondition(tipo) {
        const creature = this._creature();
        const nombre = nombreDeCondicion(tipo);
        return !!(creature && nombre && this.world.condiciones && this.world.condiciones.remove(creature, nombre));
    }

    /** ¿La tiene? Por nombre o por CONDITION_*; CONDITION_INFIGHT es estar en combate (`creature:hasCondition` de TFS). */
    hasCondition(tipo) {
        const creature = this._creature();
        if (tipo === Enums.CONDITION.CONDITION_INFIGHT) {
            return !!(creature && this.world.isInFight && this.world.isInFight(creature));
        }
        const nombre = nombreDeCondicion(tipo);
        return !!(creature && nombre && this.world.condiciones && this.world.condiciones.has(creature, nombre));
    }

    /**
     * Lo que le queda de una condición: `{ type, value, ticks, ms }` o null (`creature:getCondition`
     * de TFS, que devuelve el objeto Condition; aquí, sus datos). Por nombre o por CONDITION_*.
     */
    getCondition(tipo) {
        const creature = this._creature();
        const nombre = nombreDeCondicion(tipo);
        return creature && nombre && this.world.condiciones ? this.world.condiciones.get(creature, nombre) : null;
    }

    // -----------------------------------------------------------------------
    // Lo que TFS da a cualquier criatura
    // -----------------------------------------------------------------------

    /** `creature:isCreature()`. */
    isCreature() {
        return true;
    }

    /** `creature:isItem()`. */
    isItem() {
        return false;
    }

    /** `creature:isRemoved()`: ya no está en el mundo (murió, salió). */
    isRemoved() {
        const creature = this._creature();
        return !creature || creature.removed === true;
    }

    /** `creature:setDirection(dir)`: DIRECTION_NORTH (0) a DIRECTION_WEST (3). */
    setDirection(direccion) {
        const creature = this._creature();
        const d = Number(direccion);
        if (!creature || !(d >= 0 && d <= 3)) {
            return false;
        }
        creature.direction = d;
        this.world.emit('onTileChanged', creature.position, null);
        return true;
    }

    /** `creature:getBaseSpeed()`: sin prisa, parálisis ni montura. */
    getBaseSpeed() {
        const creature = this._creature();
        return creature ? (creature.baseSpeed === undefined ? creature.speed : creature.baseSpeed) : 0;
    }

    /**
     * `creature:changeSpeed(delta)`: suma (o resta) velocidad de forma permanente, como en TFS. Para
     * un rato, mejor una condición de prisa o parálisis.
     */
    changeSpeed(delta) {
        const creature = this._creature();
        if (!creature) {
            return false;
        }
        creature.baseSpeed = Math.max(40, this.getBaseSpeed() + Math.trunc(Number(delta) || 0));
        if (this.world.recomputeSpeed) {
            this.world.recomputeSpeed(creature);
        } else {
            creature.speed = creature.baseSpeed;
        }
        return true;
    }

    /** `creature:setMaxHealth(n)`. */
    setMaxHealth(n) {
        const creature = this._creature();
        if (!creature) {
            return false;
        }
        creature.maxHealth = Math.max(1, Math.trunc(Number(n) || 1));
        creature.health = Math.min(creature.health, creature.maxHealth);
        return true;
    }

    /** `creature:getSkull()` de un monstruo: '' (ver la del jugador). */
    getSkull() {
        return '';
    }

    /** `creature:getMaster()`: Jetyum no tiene invocaciones, así que nadie tiene amo (null). */
    getMaster() {
        return null;
    }

    /** `creature:getSummons()`: sin invocaciones en Jetyum, siempre vacío. */
    getSummons() {
        return [];
    }

    /** `creature:setNoMove(bool)`: con true no da pasos (ni él ni la IA); sí se le puede teletransportar. */
    setNoMove(quieto) {
        const creature = this._creature();
        if (!creature) {
            return false;
        }
        creature.noMove = quieto !== false;
        return true;
    }

    /** `creature:getTile()`: la casilla donde está (`Tile`). */
    getTile() {
        const pos = this.getPosition();
        return pos ? T().crearTile(this.world, pos) : null;
    }

    /** `creature:getZone()`: ZONE_PROTECTION, ZONE_NOPVP, ZONE_PVP, ZONE_NOLOGOUT o ZONE_NORMAL. */
    getZone() {
        const tile = this.getTile();
        return tile ? tile.getZone() : Enums.ZONE.ZONE_NORMAL;
    }

    /** `creature:getOutfit()`, con los nombres de TFS (`lookType`, `lookHead`...). */
    getOutfit() {
        const creature = this._creature();
        if (!creature) {
            return null;
        }
        const outfit = creature.outfit || {};
        return {
            lookType: outfit.lookType,
            lookHead: outfit.head,
            lookBody: outfit.body,
            lookLegs: outfit.legs,
            lookFeet: outfit.feet,
            lookAddons: outfit.addons
        };
    }

    /** `creature:setOutfit(outfit)` de un monstruo o NPC: sin comprobar nada (el jugador sí comprueba). */
    setOutfit(outfit) {
        const creature = this._creature();
        if (!creature || !outfit) {
            return { ok: false, reason: 'no existe la criatura' };
        }
        const o = outfit;
        creature.outfit = {
            ...(creature.outfit || {}),
            ...normalizeOutfit({
                lookType: o.lookType,
                head: o.lookHead !== undefined ? o.lookHead : o.head,
                body: o.lookBody !== undefined ? o.lookBody : o.body,
                legs: o.lookLegs !== undefined ? o.lookLegs : o.legs,
                feet: o.lookFeet !== undefined ? o.lookFeet : o.feet,
                addons: o.lookAddons !== undefined ? o.lookAddons : o.addons
            })
        };
        this.world.emit('onTileChanged', creature.position, null);
        return { ok: true, reason: null };
    }

    /**
     * `creature:registerEvent(name)`. En Jetyum los eventos de criatura son de todos (se registran
     * con el módulo, `type: 'event'`), así que no hace falta: existe para que un `onLogin` portado de
     * TFS, que siempre lo llama, no falle. Devuelve true.
     */
    registerEvent() {
        return true;
    }

    /** `creature:unregisterEvent(name)`: ver `registerEvent`. */
    unregisterEvent() {
        return true;
    }

    /** `creature:remove()`: quita del mundo a un monstruo (a un jugador no: para eso está `remove` del jugador). */
    remove() {
        const creature = this._creature();
        if (!creature || creature.kind !== 'monster') {
            return false;
        }
        return this.world.removeMonster(creature.id) !== false;
    }

    /** La luz que lleva, en casillas. */
    getLight() {
        const creature = this._creature();
        return creature ? this.world.lightOf(creature) : 0;
    }

    toString() {
        return this.constructor.name + '(' + this.id + ', ' + this.getName() + ')';
    }
}

class PlayerWrapper extends CreatureWrapper {
    isPlayer() {
        return true;
    }

    getLevel() {
        const player = this.world.getPlayer(this.id);
        return player ? player.level : 0;
    }

    getVocation() {
        const player = this.world.getPlayer(this.id);
        return player ? player.vocation : null;
    }

    /**
     * Su vocación como la clase `Vocation` de TFS (`player:getVocation()` de TFS: aquí `getVocation()`
     * devuelve el NOMBRE, que es lo que usan los scripts de Jetyum). Lleva además una copia de su ficha
     * de vocations.js (`v.gainHp`, `v.skills.sword`...), de sólo lectura.
     */
    getVocationInfo() {
        const player = this.world.getPlayer(this.id);
        return player ? new (T().VocationWrapper)(this.world, this.world.vocationOf(player)) : null;
    }

    /** Cambia de vocación (una promoción): `player.setVocation('Elite Knight')`. */
    setVocation(nombreOId) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.setVocation(player, nombreOId) : { ok: false, reason: 'no existe el jugador' };
    }

    /** 'male' o 'female'. */
    getSex() {
        const player = this.world.getPlayer(this.id);
        return player ? player.sex : null;
    }

    getMana() {
        const player = this.world.getPlayer(this.id);
        return player ? player.mana : 0;
    }

    getMaxMana() {
        const player = this.world.getPlayer(this.id);
        return player ? player.maxMana : 0;
    }

    /** Suma (o resta, con un número negativo) maná, sin pasar del máximo. */
    addMana(cantidad) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return 0;
        }
        player.mana = Math.max(0, Math.min(player.maxMana, player.mana + Math.trunc(Number(cantidad) || 0)));
        return player.mana;
    }


    getSoul() {
        const player = this.world.getPlayer(this.id);
        return player ? player.soul : 0;
    }

    /** `player:addSoul(n)`: suma (o resta) almas, sin pasar de su máximo ni bajar de 0. */
    addSoul(cantidad) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return 0;
        }
        const maximo = Number(player.soulMax) || 100;
        player.soul = Math.max(0, Math.min(maximo, (Number(player.soul) || 0) + Math.trunc(Number(cantidad) || 0)));
        return player.soul;
    }

    /** `player:getMaxSoul()`. */
    getMaxSoul() {
        const player = this.world.getPlayer(this.id);
        return player ? Number(player.soulMax) || 100 : 0;
    }

    // -----------------------------------------------------------------------
    // Identidad y cuenta (lo que TFS da a `Player`)
    // -----------------------------------------------------------------------

    /** `player:getGuid()`: su id de personaje en la base (0 si el servidor corre sin base). */
    getGuid() {
        const player = this.world.getPlayer(this.id);
        return player ? Number(player.characterId) || 0 : 0;
    }

    /** `player:getAccountId()` (0 sin base). */
    getAccountId() {
        const player = this.world.getPlayer(this.id);
        return player ? Number(player.accountId) || 0 : 0;
    }

    /**
     * `player:getAccountType()`: en Jetyum, el id de su grupo (groups.js), que coincide con los
     * ACCOUNT_TYPE_* de TFS (1 normal ... 4 gamemaster ... 6 god).
     */
    getAccountType() {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.groupOf(player).id : 0;
    }

    /**
     * `player:getIp()`: la IP de su conexión como número, como en TFS (a.b.c.d es
     * a + b·256 + c·256² + d·256³). La sabe su sesión (`world.ipDe`, la pone engine.js); un jugador
     * sin sesión (uno de prueba) o una IP que no es IPv4 dan 0.
     */
    getIp() {
        const player = this.world.getPlayer(this.id);
        const texto = player && this.world.ipDe ? String(this.world.ipDe(player) || '') : '';
        const partes = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(texto);
        if (!partes) {
            return 0;
        }
        return Number(partes[1]) + Number(partes[2]) * 256 + Number(partes[3]) * 65536 + Number(partes[4]) * 16777216;
    }

    /**
     * `player:getStamina()`: en minutos (42 h = 2520 llenos). Jetyum la guarda pero todavía no la
     * gasta: está llena salvo que un script la cambie con `setStamina`.
     */
    getStamina() {
        const player = this.world.getPlayer(this.id);
        return player ? (player.stamina === undefined ? STAMINA_MAX : Number(player.stamina)) : 0;
    }

    /** `player:setStamina(minutos)`. */
    setStamina(minutos) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return false;
        }
        player.stamina = Math.max(0, Math.min(STAMINA_MAX, Math.trunc(Number(minutos) || 0)));
        return true;
    }

    /** `player:setSex(sex)`: PLAYERSEX_FEMALE (0) / PLAYERSEX_MALE (1), o 'female' / 'male'. */
    setSex(sexo) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return false;
        }
        player.sex = sexo === 0 || sexo === 'female' ? 'female' : 'male';
        return true;
    }

    /** `player:isPremium()`: si su cuenta lo es. */
    isPremium() {
        const player = this.world.getPlayer(this.id);
        return !!(player && player.premium === true);
    }

    /**
     * `player:getPremiumDays()`. El jugador sólo sabe si su cuenta es premium (no hasta cuándo):
     * 65535 si lo es (el «premium sin fin» de TFS) y 0 si no.
     */
    getPremiumDays() {
        return this.isPremium() ? 65535 : 0;
    }

    /**
     * `player:getLastLoginSaved()`: la hora (segundos) de su visita ANTERIOR. Jetyum no la carga con
     * el personaje, así que es 0, que es lo que TFS da en la primera visita.
     */
    getLastLoginSaved() {
        const player = this.world.getPlayer(this.id);
        return player ? Math.floor(Number(player.lastLoginSaved) || 0) : 0;
    }

    /** `player:getTown()`: su ciudad (`Town`), o null si el mapa no tiene ciudades. */
    getTown() {
        const player = this.world.getPlayer(this.id);
        const ciudad = player && this.world.townOf ? this.world.townOf(player) : null;
        return ciudad ? new (T().TownWrapper)(this.world, ciudad) : null;
    }

    /** `player:setTown(town)`: por `Town`, id o nombre. Su templo pasa a ser el de esa ciudad. */
    setTown(ciudad) {
        const player = this.world.getPlayer(this.id);
        const t = ciudad && typeof ciudad.getId === 'function' ? ciudad : T().buscarCiudad(this.world, ciudad);
        if (!player || !t) {
            return false;
        }
        player.townId = t.getId();
        return true;
    }

    /** `player:getSkullTime()`: los segundos que le quedan de calavera (0 si no lleva). */
    getSkullTime() {
        const player = this.world.getPlayer(this.id);
        if (!player || !this.getSkull() || !player.skullUntil) {
            return 0;
        }
        return Math.max(0, Math.ceil((player.skullUntil - this.world.now()) / 1000));
    }

    /**
     * `player:save()`: lo guarda ya en la base (lo mismo que el guardado periódico). False sin base.
     */
    save() {
        const player = this.world.getPlayer(this.id);
        const base = this.world.correoEnLaBase;
        if (!player || !base || typeof base.guardar !== 'function') {
            return false;
        }
        try {
            base.guardar(player);
            return true;
        } catch (error) {
            return false;
        }
    }

    /** `player:remove()`: lo saca del juego, como si saliera (se guarda). */
    remove() {
        const player = this.world.getPlayer(this.id);
        return !!(player && this.world.sacarDelJuego && this.world.sacarDelJuego(player));
    }

    // -----------------------------------------------------------------------
    // Inventario a la manera de TFS
    // -----------------------------------------------------------------------

    /**
     * `player:getSlotItem(CONST_SLOT_*)`: lo que lleva puesto en esa ranura (un objeto del
     * inventario), o null. También vale el nombre de la ranura de Jetyum ('hand', 'head'...).
     */
    getSlotItem(slot) {
        const player = this.world.getPlayer(this.id);
        const ranura = typeof slot === 'number' ? Enums.RANURA_DE_SLOT[slot] : String(slot || '');
        const entry = player && ranura ? this.world.equippedIn(player, ranura) : null;
        return entry ? new InventoryItemWrapper(this.world, this.id, entry) : null;
    }

    /**
     * `player:getItemById(id[, deepSearch[, subType]])`: el primero de ese tipo que lleve (puesto, en
     * la mochila o, con `deepSearch`, dentro de una bolsa), o null.
     */
    getItemById(typeId, profundo) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return null;
        }
        const id = Number(typeId);
        let entry = null;
        if (profundo !== false && this.world.buscarEntradaDeTipo) {
            entry = this.world.buscarEntradaDeTipo(player, id);
        } else {
            entry = (player.inventory || []).find((e) => e.typeId === id) || null;
        }
        return entry ? new InventoryItemWrapper(this.world, this.id, entry) : null;
    }

    /**
     * `player:getDepotChest(townId[, autoCreate])`: el depósito de esa ciudad (extras.js), como un
     * contenedor del mundo. Sin ciudad, el de la suya.
     */
    getDepotChest(townId) {
        const player = this.world.getPlayer(this.id);
        if (!player || !this.world.depotOf) {
            return null;
        }
        const ciudad = townId === undefined || townId === null ? undefined : Number(townId);
        const deposito = this.world.depotOf(player, null, ciudad);
        return deposito ? T().envolverObjeto(this.world, deposito, false) : null;
    }

    /**
     * `player:getInbox()`. El 8.60 no tiene buzón de entrada: el correo llega al depósito
     * (correo.js), así que es el depósito de su ciudad.
     */
    getInbox() {
        return this.getDepotChest();
    }

    getMagicLevel() {
        const player = this.world.getPlayer(this.id);
        return player ? player.magicLevel : 0;
    }

    /**
     * Nivel de una skill: 'fist', 'club', 'sword', 'axe', 'distance', 'shielding' o 'fishing', o su
     * SKILL_* de TFS (`player:getSkillLevel(SKILL_SWORD)`). SKILL_MAGLEVEL y SKILL_LEVEL también valen.
     */
    getSkillLevel(skill) {
        if (skill === Enums.SKILL.SKILL_MAGLEVEL) {
            return this.getMagicLevel();
        }
        if (skill === Enums.SKILL.SKILL_LEVEL) {
            return this.getLevel();
        }
        const player = this.world.getPlayer(this.id);
        const nombre = T().nombreDeSkill(skill);
        const estado = player && player.skills && nombre ? player.skills[nombre] : null;
        return estado ? estado.level : 0;
    }

    /**
     * `player:getEffectiveSkillLevel(skill)` de TFS: la skill con lo que sumen los objetos. En Jetyum
     * los objetos no suben skills, así que es la misma que `getSkillLevel`.
     */
    getEffectiveSkillLevel(skill) {
        return this.getSkillLevel(skill);
    }

    /** `player:getSkillTries(skill)`: lo entrenado hacia el siguiente nivel. */
    getSkillTries(skill) {
        const player = this.world.getPlayer(this.id);
        const nombre = T().nombreDeSkill(skill);
        const estado = player && player.skills && nombre ? player.skills[nombre] : null;
        return estado ? Number(estado.tries) || 0 : 0;
    }

    /** `player:getBaseMagicLevel()`: sin lo que sumen los objetos (que en Jetyum no suman). */
    getBaseMagicLevel() {
        return this.getMagicLevel();
    }

    /** `player:getManaSpent()`: el maná gastado hacia el siguiente nivel mágico. */
    getManaSpent() {
        const player = this.world.getPlayer(this.id);
        return player ? Number(player.manaSpent) || 0 : 0;
    }

    /** Entrena una skill (sube si llega, con su aviso `onAdvance`). */
    addSkillTries(skill, tries) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.addSkillTries(player, skill, tries) : null;
    }

    /** Más velocidad durante `ms` milisegundos (el «haste» de los hechizos). */
    addSpeedBonus(bonus, ms) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return 0;
        }
        player.speedBonus = Math.trunc(Number(bonus) || 0);
        player.speedBonusUntil = this.world.now() + Math.max(0, Number(ms) || 0);
        player.speed = (player.baseSpeed || player.speed) + player.speedBonus;
        return player.speed;
    }

    /** Cuenta maná gastado para el nivel mágico. */
    addManaSpent(mana) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.addManaSpent(player, mana) : null;
    }

    /**
     * Mensaje privado, sólo para este jugador. También con la firma de TFS,
     * `player:sendTextMessage(MESSAGE_INFO_DESCR, texto)`: el cliente tiene una sola consola, así que
     * el tipo se acepta y no cambia nada.
     */
    sendTextMessage(tipoOTexto, texto) {
        const text = texto !== undefined && typeof tipoOTexto === 'number' ? texto : tipoOTexto;
        this.world.sendTextMessage(this.id, String(text));
        return this;
    }

    /** Mueve al jugador a otra posición, sin comprobar el camino. */
    teleportTo(position) {
        if (!position) {
            return false;
        }
        return this.world.teleportPlayer(this.id, position.x, position.y, position.z);
    }

    /**
     * Un mensaje en rojo de «no se puede» (el `sendCancelMessage` de TFS). Como en TFS, vale también
     * un RETURNVALUE_* en vez del texto.
     */
    sendCancelMessage(text) {
        const texto = typeof text === 'number' ? (TEXTO_DE_RETURNVALUE[text] || 'No es posible.') : String(text);
        this.world.sendTextMessage(this.id, texto);
        return this;
    }

    // -----------------------------------------------------------------------
    // Experiencia y dinero
    // -----------------------------------------------------------------------

    getExperience() {
        const player = this.world.getPlayer(this.id);
        return player ? player.experience || 0 : 0;
    }

    /** Suma experiencia (sube de nivel si llega), o la quita en negativo (sin bajar de nivel). */
    addExperience(cantidad) {
        const player = this.world.getPlayer(this.id);
        if (!player || !this.world.combat) {
            return null;
        }
        return this.world.combat.addExperience(player, cantidad);
    }

    /** Le da dinero (monedas de oro en la mochila). Devuelve si pudo. */
    addMoney(cantidad) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.addMoneyTo(player, cantidad) : false;
    }

    /** Le cobra dinero, sólo si lo tiene todo. Devuelve si pudo. */
    removeMoney(cantidad) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.removeMoneyFrom(player, cantidad) : false;
    }

    // -----------------------------------------------------------------------
    // El banco y las casas (engine/world/casas.js)
    // -----------------------------------------------------------------------
    //
    // El saldo del banco es el `balance` de TFS: monedas de oro que no se llevan encima. Las cuatro
    // operaciones devuelven `{ok, reason, ...}` con el motivo en una palabra, y el mensaje lo pone el
    // script (el banquero, los comandos de las casas).

    /** Su saldo en el banco, en monedas de oro. */
    getBankBalance() {
        return this.world.bankBalanceOf(this.world.getPlayer(this.id));
    }

    /** Le pone el saldo, sin mover monedas (`player:setBankBalance` de TFS). */
    setBankBalance(cantidad) {
        return this.world.setBankBalance(this.world.getPlayer(this.id), cantidad);
    }

    /** Deposita monedas que lleva encima. reason: badAmount, notEnough, cannotPay. */
    depositMoney(cantidad) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.depositMoney(player, cantidad) : { ok: false, reason: 'noPlayer' };
    }

    /** Retira del banco a la mochila. reason: badAmount, notEnough, cannotCarry. */
    withdrawMoney(cantidad) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.withdrawMoney(player, cantidad) : { ok: false, reason: 'noPlayer' };
    }

    /** Transfiere a otro personaje, conectado o no. reason: badAmount, notEnough, notFound, self, noDatabase. */
    transferMoney(nombre, cantidad) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.transferMoney(player, nombre, cantidad) : { ok: false, reason: 'noPlayer' };
    }

    /** La casa de la que es DUEÑO (`player:getHouse()` de TFS), o null. */
    getHouse() {
        const casa = this.world.houseOf(this.world.getPlayer(this.id));
        return casa ? new HouseWrapper(this.world, casa.id) : null;
    }

    /** La casa en la que está ahora (`player:getTile():getHouse()` de TFS), o null. */
    getTileHouse() {
        const casa = this.world.houseOfTile(this.world.getPlayer(this.id));
        return casa ? new HouseWrapper(this.world, casa.id) : null;
    }

    /** `!buyhouse`: la casa de la puerta que tiene delante. reason: noDoor, level, alreadyOwner, hasOwner, noMoney. */
    buyHouse() {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.buyHouse(player) : { ok: false, reason: 'noPlayer' };
    }

    /** `!leavehouse`: deja la casa en la que está (lo de dentro, a su depósito). reason: notInside, notOwner. */
    leaveHouse() {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.leaveHouse(player) : { ok: false, reason: 'noPlayer' };
    }

    /**
     * Le abre para editar una lista de acceso: 'guests' (`aleta sio`), 'subowners' (`aleta som`) o
     * 'door' (`aleta grav`, la puerta que tiene delante). reason: notInside, noDoor, cannotEdit.
     */
    editHouseList(tipo) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.editHouseList(player, tipo) : { ok: false, reason: 'noPlayer' };
    }

    /** Echa a alguien (o a sí mismo, sin nombre) de la casa en la que está. reason: notInside, notFound, cannot. */
    kickFromHouse(nombre) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.kickFromHouse(player, nombre) : { ok: false, reason: 'noPlayer' };
    }

    /** Duerme en esta cama (la sacan del juego). reason: notBed, notHouse, notInvited, inFight, occupied, broken. */
    sleepInBed(item) {
        const player = this.world.getPlayer(this.id);
        const objeto = item && item.getUniqueId ? this.world.items.get(item.getUniqueId()) : null;
        return player ? this.world.sleepInBed(player, objeto) : { ok: false, reason: 'noPlayer' };
    }

    // -----------------------------------------------------------------------
    // Dar y quitar objetos
    // -----------------------------------------------------------------------

    /**
     * LE DA UN OBJETO, a su mochila, con todas las reglas: que exista, que lleve mochila, que le
     * quepa (huecos) y que pueda con el peso.
     *
     * @returns {{ok: boolean, reason?: string}} reason: unknownItem, noContainer, backpackFull, tooHeavy
     */
    addItem(typeId, count, attributes) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.addItemTo(player, typeId, count, attributes) : { ok: false, reason: 'noPlayer' };
    }

    /** Le quita objetos de un tipo, SÓLO si tiene todos los que se piden. Devuelve si pudo. */
    removeItem(typeId, count) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.removeItemFrom(player, typeId, count) : false;
    }

    // -----------------------------------------------------------------------
    // Aspectos, grupo y calavera
    // -----------------------------------------------------------------------

    /** Le desbloquea un aspecto (aunque en outfits.js esté `unlocked: false`). Se guarda con él. */
    addOutfit(lookType) {
        return this.setStorageValue('outfit:' + Number(lookType), 1);
    }

    hasOutfit(lookType) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return false;
        }
        return canUseOutfit({ lookType: Number(lookType), addons: 0 }, this.world.outfitTypes, player.premium === true, player).ok;
    }

    // -----------------------------------------------------------------------
    // Rango de acceso, combate y monturas
    // -----------------------------------------------------------------------

    /**
     * Su grupo de acceso (data/XML/groups.js), como la clase `Group` de TFS (`getId()`, `getName()`,
     * `hasFlag(...)`). Lleva también `id`, `name` y `access` como propiedades, como antes.
     */
    getGroup() {
        const player = this.world.getPlayer(this.id);
        return player ? new (T().GroupWrapper)(this.world, this.world.groupOf(player)) : null;
    }

    /** `player:setGroup(group)`: por `Group`, id o nombre. Sólo para la sesión; para guardarlo, `Game.setPlayerGroup`. */
    setGroup(grupo) {
        const player = this.world.getPlayer(this.id);
        const def = grupo && typeof grupo.getId === 'function' ? this.world.groupByName(grupo.getId())
            : this.world.groupByName(grupo);
        if (!player || !def) {
            return false;
        }
        player.groupId = def.id;
        return true;
    }

    /** ¿Tiene ese grupo de acceso o uno mayor? `player.hasGroup('gamemaster')`. */
    hasGroup(nombre) {
        const player = this.world.getPlayer(this.id);
        return !!(player && this.world.hasGroup(player, nombre));
    }

    /** ¿Está en combate? (No puede salir del juego.) */
    isInFight() {
        const player = this.world.getPlayer(this.id);
        return !!(player && this.world.isInFight(player));
    }

    /** ¿Tiene el PZ lock? (Atacó a otro jugador: no puede entrar en una zona de protección.) */
    isPzLocked() {
        const player = this.world.getPlayer(this.id);
        return !!(player && this.world.isPzLocked(player));
    }

    /** ¿Está comerciando con otro jugador (ofreció algo, o alguien le ofreció algo)? */
    isTrading() {
        const player = this.world.getPlayer(this.id);
        return !!(player && this.world.estaComerciando(player));
    }

    /** Con quién comercia (el jugador), o null. */
    getTradePartner() {
        const player = this.world.getPlayer(this.id);
        const otro = player ? this.world.companeroDeIntercambio(player) : null;
        return otro ? new PlayerWrapper(this.world, otro.id) : null;
    }

    /** Le da una montura de data/XML/mounts.js (aunque esté `unlocked: false`). Se guarda con él. */
    addMount(mountId) {
        const player = this.world.getPlayer(this.id);
        return !!(player && this.world.giveMount(player, mountId));
    }

    /** Se la quita (y desmonta si iba en ella). */
    removeMount(mountId) {
        const player = this.world.getPlayer(this.id);
        return !!(player && this.world.takeMount(player, mountId));
    }

    /** ¿Puede llevar esa montura? */
    hasMount(mountId) {
        const player = this.world.getPlayer(this.id);
        return !!(player && this.world.canUseMount(player, mountId).ok);
    }

    /** ¿Va montado? */
    isMounted() {
        const player = this.world.getPlayer(this.id);
        return !!(player && player.mounted);
    }

    /**
     * Su grupo de caza, como la clase `Party` de TFS (`getLeader()`, `getMembers()`...), o null. Lleva
     * también `leader` y `members` (los nombres, con el líder), como antes.
     */
    getParty() {
        const player = this.world.getPlayer(this.id);
        const grupo = player ? this.world.partyOf(player) : null;
        return grupo ? new (T().PartyWrapper)(this.world, grupo) : null;
    }

    /** Invita a alguien a su grupo (lo crea si no tiene). Devuelve `{ok, reason}`. */
    partyInvite(nombre) {
        const player = this.world.getPlayer(this.id);
        const otro = this.world.playerByName(nombre);
        if (!player || !otro) {
            return { ok: false, reason: 'notOnline' };
        }
        return this.world.partyInvite(player, otro);
    }

    /** Entra en el grupo de quien le invitó. */
    partyJoin(nombreLider) {
        const player = this.world.getPlayer(this.id);
        const lider = this.world.playerByName(nombreLider);
        if (!player || !lider) {
            return { ok: false, reason: 'notOnline' };
        }
        return this.world.partyJoin(player, lider);
    }

    /** Sale de su grupo. */
    partyLeave() {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.partyLeave(player) : { ok: false, reason: 'noPlayer' };
    }

    /** Le manda un mensaje privado a otro jugador (como si lo escribiera él). */
    sendPrivateMessage(nombre, texto) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.sendPrivateMessage(player, nombre, texto, 'privado') : { ok: false };
    }

    /**
     * Le abre un DIÁLOGO con el texto y un botón «Aceptar» (el `popupFYI` de TFS). Los saltos de
     * línea (`\n`) se respetan.
     */
    popupFYI(texto) {
        return this.sendPopup('Información', texto);
    }

    /**
     * LE ABRE UNA VENTANA DE TEXTO (el `showTextDialog` de TFS): para leer, o para escribir con
     * `editable: true`; lo escrito llega a `alGuardar(texto)` (como el `onTextEdit` de TFS).
     *
     *     player.showTextDialog({ titulo: 'Carta', texto: '', editable: true, maximo: 500 },
     *         (texto) => item.setAttribute('text', texto));
     *
     * @returns {number} el id de la ventana, o 0
     */
    showTextDialog(opciones, alGuardar, editable, maximo) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return 0;
        }
        /*
         * LA FIRMA DE TFS, `player:showTextDialog(item, text[, canWrite[, length]])`: el primer argumento
         * es el objeto (o su id) y no unas opciones. Lo escrito se guarda en su atributo `text`.
         */
        let o = opciones || {};
        let guardar = alGuardar;
        const esObjeto = typeof o === 'number' || typeof o.getId === 'function';
        if (esObjeto) {
            const objeto = typeof o === 'number' ? null : o;
            const tipo = this.world.itemTypes.get(typeof o === 'number' ? o : o.getId());
            o = {
                titulo: tipo ? tipo.name : '',
                texto: typeof alGuardar === 'string' ? alGuardar : (objeto ? objeto.getAttribute('text') || '' : ''),
                editable: editable === true,
                maximo: Number(maximo) || (objeto ? Number(objeto.getAttribute('maxTextLen')) : 0) || 1000,
                item: objeto
            };
            guardar = objeto ? (texto) => objeto.setAttribute('text', texto) : null;
        }
        /*
         * `onTextEdit(player, item, text)` (un evento de criatura, `event: 'textedit'`): se avisa al
         * guardar una ventana de un OBJETO (`item` en las opciones, o la firma de TFS) y, si un script
         * devuelve false, lo escrito no se guarda.
         */
        const item = o.item || null;
        const registro = this.world.eventoDeTexto;
        const alGuardarConEvento = typeof guardar === 'function' && item && registro
            ? (texto) => {
                if (registro(this, item, texto) === false) {
                    return;
                }
                guardar(texto);
            }
            : guardar;
        // Una ventana de sólo lectura no espera respuesta: no hace falta pasarle con qué guardar.
        return this.world.abrirVentanaDeTexto(player, o, alGuardarConEvento);
    }

    /**
     * MANDA POR CORREO una carta o un paquete (el que recibe `onUse`: lo que lleva o uno del
     * mundo), como si lo echara en un buzón. Las reglas y los mensajes, en `engine/world/correo.js`.
     *
     * @returns {boolean} si se mandó
     */
    sendMail(item) {
        const player = this.world.getPlayer(this.id);
        if (!player || !item || !this.world.enviarPorCorreo) {
            return false;
        }
        const objeto = item.entry ? null : this.world.getItem(item.getUniqueId ? item.getUniqueId() : 0);
        const origen = item.entry ? { entry: item.entry } : (objeto ? { item: objeto } : null);
        return origen ? this.world.enviarPorCorreo(player, origen).ok === true : false;
    }

    /** Le entrega el correo que le esperaba (al entrar). Devuelve cuántos. */
    collectMail() {
        const player = this.world.getPlayer(this.id);
        return player && this.world.entregarCorreoPendiente ? this.world.entregarCorreoPendiente(player) : 0;
    }

    /** Lo mismo con un título propio. */
    sendPopup(titulo, texto) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return false;
        }
        this.world.emit('onPopup', player, String(titulo || 'Información'), String(texto == null ? '' : texto));
        return true;
    }

    /**
     * Los hechizos que puede lanzar por su vocación (sin mirar nivel ni maná), ordenados por nivel:
     * `[{words, name, group, level, mana, soul}]`.
     */
    getSpells() {
        const player = this.world.getPlayer(this.id);
        return player && this.world.spellsFor ? this.world.spellsFor(player) : [];
    }

    /**
     * El tipo del arma que lleva en la mano (`weaponType` de items.xml: 'sword', 'axe', 'club',
     * 'distance', 'wand'...), o 'fist' si pega con el puño.
     */
    getWeaponType() {
        const player = this.world.getPlayer(this.id);
        const arma = player ? this.world.weaponOf(player) : null;
        return arma && arma.attributes && arma.attributes.weaponType ? String(arma.attributes.weaponType) : 'fist';
    }

    /** '' (ninguna), 'blanca' o 'roja'. */
    getSkull() {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.skullOf(player) : '';
    }

    // -----------------------------------------------------------------------
    // Storages: la memoria del contenido
    // -----------------------------------------------------------------------

    /**
     * Guarda un valor en el personaje.
     *
     * Es la API de TFS y es la que hace posible el contenido con memoria: un módulo
     * necesita poder recordar que un jugador ya mató a un dragón o en qué paso va de
     * una misión, y sin esto no tendría dónde.
     *
     * Se escribe en el mundo, NO en la base de datos al momento. Si cada llamada
     * hiciera su propia escritura, un script con un bucle dentro machacaría el
     * disco; el guardado periódico y el de salida se encargan de bajarlo.
     */
    setStorageValue(key, value) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return false;
        }
        if (!(player.storages instanceof Map)) {
            player.storages = new Map();
        }
        player.storages.set(String(key), Number(value));
        return true;
    }

    /** Lee un valor guardado, o null si nunca se guardó. */
    getStorageValue(key) {
        const player = this.world.getPlayer(this.id);
        if (!player || !(player.storages instanceof Map)) {
            return null;
        }
        const value = player.storages.get(String(key));
        return value === undefined ? null : value;
    }

    // -----------------------------------------------------------------------
    // Bendiciones e historial de muertes (engine/world/muerte.js)
    // -----------------------------------------------------------------------
    //
    // Las cinco bendiciones de TFS 8.60, con su número (1 Escudo Espiritual ... 5 Sabiduría de la
    // Soledad). Se guardan como storages (`bendicion:<n>`), así que duran con el personaje, y se
    // gastan todas al morir. Lo que hacen al morir lo decide el combate; aquí sólo se miran y se dan.

    /** ¿Tiene la bendición `n` (1 a 5)? Como `player:hasBlessing(n)` de TFS. */
    hasBlessing(n) {
        return Muerte.tieneBendicion(this.world.getPlayer(this.id), n);
    }

    /** Le da la bendición `n`. Devuelve si se la dio (false si no existe o ya la tenía). */
    addBlessing(n) {
        return Muerte.darBendicion(this.world.getPlayer(this.id), n);
    }

    /** Se la quita. Devuelve si la tenía. */
    removeBlessing(n) {
        return Muerte.quitarBendicion(this.world.getPlayer(this.id), n);
    }

    /** Cuántas tiene (0 a 5). */
    getBlessingCount() {
        return Muerte.contarBendiciones(this.world.getPlayer(this.id));
    }

    /** Las cinco, con su nombre (`nombre` en español, `name` el de TFS) y si las tiene. Una copia. */
    getBlessings() {
        const player = this.world.getPlayer(this.id);
        return Muerte.BENDICIONES.map((b) => ({ ...b, has: Muerte.tieneBendicion(player, b.id) }));
    }

    /** Lo que le cuesta CADA bendición a su nivel (TFS `getBlessingsCost`: 2000 ... 20 000). */
    getBlessingCost() {
        return Muerte.costeBendicion(this.getLevel());
    }

    /**
     * Lo que perdería si muriera ahora: `percent` de experiencia, skills y nivel mágico, y la
     * probabilidad (en %) de perder cada objeto equipado (`item`) y la mochila (`container`).
     */
    getDeathPenalty() {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return null;
        }
        const config = (this.world.combat && this.world.combat.config) || {};
        const bendiciones = Muerte.contarBendiciones(player);
        const vocacion = this.world.vocationOf(player);
        const chances = Muerte.probabilidadesDePerdida(bendiciones,
            (this.world.skullOf ? this.world.skullOf(player) : player.skull) === 'roja');
        // Lo mismo que decide el combate: sin pérdida de objetos, nada; en el modo de antes, todo;
        // en el de TFS, a suertes (y nada sin vocación, como en Rookgaard).
        const objetos = config.deathDropInventory === false ? { objeto: 0, contenedor: 0 }
            : config.deathItemLoss !== true ? { objeto: 100, contenedor: 100 }
                : Number(vocacion && vocacion.id) === 0 ? { objeto: 0, contenedor: 0 } : chances;
        return {
            percent: Muerte.porcentajeDePerdida(player, vocacion,
                { deathLosePercent: config.deathLosePercent, bendiciones: bendiciones }),
            item: objetos.objeto,
            container: objetos.contenedor,
            blessings: bendiciones
        };
    }

    /**
     * Sus últimas muertes, o las de otro por su nombre (esté dentro o no), de la más nueva a la más
     * vieja: `{name, deaths: [{time, level, killedBy, isPlayer, unjustified}]}`. Null si el
     * personaje no existe, y `{name, deaths: [], noDatabase: true}` si el servidor no guarda nada.
     */
    getDeathList(limit, nombre) {
        const quien = nombre ? String(nombre).trim() : this.getName();
        if (typeof this.world.historialDeMuertes !== 'function') {
            return { name: quien, deaths: [], noDatabase: true };
        }
        return this.world.historialDeMuertes(quien, limit === undefined ? 10 : limit);
    }

    // -----------------------------------------------------------------------
    // Inventario
    // -----------------------------------------------------------------------

    /**
     * Lo que lleva encima, como lista.
     *
     * Se devuelve COPIADO y no la lista de dentro: si se devolviera la de verdad, un
     * módulo podría meter y sacar cosas del inventario sin pasar por ninguna regla, y
     * entonces el peso, el espacio y los topes de pila dejarían de poder comprobarse en
     * un solo sitio.
     */
    getInventory() {
        return this.world.inventoryOf(this.world.getPlayer(this.id) ||
            this.world.getCreature(this.id));
    }

    /**
     * Sin argumentos, cuántas cosas lleva. Con un id, cuántos objetos de ese tipo lleva, como
     * `player:getItemCount(itemId)` de TFS (lo mismo que `getItemCountById`).
     */
    getItemCount(typeId) {
        if (typeId !== undefined) {
            return this.getItemCountById(typeId);
        }
        return this.getInventory().length;
    }

    /** Cuanto dinero lleva encima. */
    getMoney() {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.countMoney(player) : 0;
    }

    // -----------------------------------------------------------------------
    // Peso
    // -----------------------------------------------------------------------

    /** Lo que pesa lo que lleva, en las unidades de Tibia (centesimas de onza). */
    getWeight() {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.weightOf(player) : 0;
    }

    /** Lo que puede cargar. Sale del nivel y la vocacion, no de un campo guardado. */
    getCapacity() {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.capacityOf(player) : 0;
    }

    /** Cuanto le queda libre. */
    getFreeCapacity() {
        return this.getCapacity() - this.getWeight();
    }

    /** El peso, ya formateado. El contenido no deberia tener que dividir entre cien. */
    getWeightText() {
        return formatWeight(this.getWeight());
    }

    getCapacityText() {
        return formatWeight(this.getCapacity());
    }

    /**
     * Cuanto pesaria un objeto, sin moverlo.
     *
     * Es lo que permite a un script comprobar si algo cabe ANTES de darselo a nadie. Sin
     * esto, lo unico que se puede hacer es darlo y mirar a ver.
     */
    getItemWeight(typeId, count) {
        return this.world.weightOfItem(typeId, count);
    }

    /** Cuántos objetos de un tipo lleva. */
    getItemCountById(typeId) {
        const player = this.world.getPlayer(this.id);
        return player ? this.world.countOf(player, typeId) : 0;
    }

    /**
     * Suelta un objeto, por su posición en la lista.
     *
     * @returns {{ok: boolean, reason?: string}}
     */
    dropItem(index) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return { ok: false, reason: 'no existe el jugador' };
        }
        return this.world.dropItem(player, index);
    }

    // -----------------------------------------------------------------------
    // Equipar
    // -----------------------------------------------------------------------

    /**
     * Se pone un objeto del inventario.
     *
     * POR QUE ESTOS METODOS NO EXISTIAN Y HACEN FALTA: el motor sabe equipar desde hace rondas
     * -`world.equipItem`- y el cliente dibuja el panel de equipo, pero NO HABIA FORMA DE LLEGAR
     * desde el contenido hasta el motor. Resultado: un panel de seis ranuras que se quedaba vacio
     * para siempre, porque nadie podia ponerse nada.
     *
     * @param {number} index posicion en el inventario
     * @returns {{ok: boolean, reason?: string, slot?: string}}
     */
    equipItem(index) {
        const player = this.world.getPlayer(this.id);

        if (!player) {
            return { ok: false, reason: "no existe el jugador" };
        }

        return this.world.equipItem(player, index);
    }

    /**
     * Se quita lo que lleve puesto en una ranura.
     *
     * @param {string} slot hand, body, head, feet, ring o backpack
     */
    unequipItem(slot) {
        const player = this.world.getPlayer(this.id);

        if (!player) {
            return { ok: false, reason: "no existe el jugador" };
        }

        return this.world.unequipItem(player, slot);
    }

    /** Lo que lleva puesto, por ranura. Para que el contenido pueda consultarlo. */
    getEquipment() {
        const player = this.world.getPlayer(this.id);

        if (!player) {
            return {};
        }

        const puesto = {};

        this.world.equipmentOf(player).forEach((entrada) => {
            puesto[entrada.slot] = {
                typeId: entrada.typeId,
                count: entrada.count,
                nombre: this.world.itemTypes.has(entrada.typeId)
                    ? this.world.itemTypes.get(entrada.typeId).name
                    : "objeto " + entrada.typeId
            };
        });

        return puesto;
    }

    // -----------------------------------------------------------------------
    // Aspecto
    // -----------------------------------------------------------------------

    /**
     * El aspecto actual, con LOS NOMBRES DE TFS.
     *
     * Por dentro el motor usa `head`, `body`, `legs`, `feet` y `addons`, que se leen
     * mejor. De cara a los scripts se usan `lookHead`, `lookBody`... porque es lo que
     * espera cualquiera que venga de The Forgotten Server, y este proyecto lo toma como
     * referencia. La traducción se hace aquí, en un solo sitio, y no repartida por todo
     * el contenido.
     */
    getOutfit() {
        const player = this.world.getCreature(this.id);
        if (!player) {
            return null;
        }

        const outfit = player.outfit || {};

        return {
            lookType: outfit.lookType,
            lookHead: outfit.head,
            lookBody: outfit.body,
            lookLegs: outfit.legs,
            lookFeet: outfit.feet,
            lookAddons: outfit.addons
        };
    }

    /**
     * Cambia el aspecto.
     *
     * Acepta los nombres de TFS y también los de dentro, porque escribir
     * `{lookType: 136, lookHead: 78}` y `{lookType: 136, head: 78}` son la misma
     * intención y obligar a recordar cuál toca en cada sitio es una trampa.
     *
     * @param {Object} outfit
     * @param {boolean} [check] si comprobar que el aspecto existe y se puede usar
     * @returns {{ok: boolean, reason: string|null}}
     */
    setOutfit(outfit, check) {
        const player = this.world.getPlayer(this.id);
        if (!player) {
            return { ok: false, reason: 'no existe el jugador' };
        }

        const source = outfit || {};
        const candidate = normalizeOutfit({
            lookType: source.lookType,
            head: source.lookHead !== undefined ? source.lookHead : source.head,
            body: source.lookBody !== undefined ? source.lookBody : source.body,
            legs: source.lookLegs !== undefined ? source.lookLegs : source.legs,
            feet: source.lookFeet !== undefined ? source.lookFeet : source.feet,
            addons: source.lookAddons !== undefined ? source.lookAddons : source.addons
        });

        if (check !== false) {
            const allowed = canUseOutfit(candidate, this.world.outfitTypes, player.premium === true);
            if (!allowed.ok) {
                return { ok: false, reason: allowed.reason };
            }
        }

        // La montura va en el aspecto (`lookMount`): un aspecto nuevo no puede bajarle de ella.
        player.outfit = { ...candidate, lookMount: (player.outfit && player.outfit.lookMount) || 0 };
        return { ok: true, reason: null };
    }
}

class MonsterWrapper extends CreatureWrapper {
    isMonster() {
        return true;
    }

    /** La definición del tipo, tal y como se registró en data/monsters. */
    getMonsterType() {
        const monster = this.world.getMonster(this.id);
        return monster ? monster.monsterType : null;
    }

    getExperience() {
        const monster = this.world.getMonster(this.id);
        return monster ? monster.experience : 0;
    }

    getLoot() {
        const monster = this.world.getMonster(this.id);
        return monster ? monster.loot : [];
    }

    getTargetId() {
        const monster = this.world.getMonster(this.id);
        return monster && monster.target ? monster.target.id : null;
    }

    /** `monster:getSpawnPosition()`: de dónde salió (su punto de aparición), o null si lo creó un script. */
    getSpawnPosition() {
        const monster = this.world.getMonster(this.id);
        const sitio = monster && monster.spawn ? (monster.spawn.position || monster.spawn.center || monster.spawn) : null;
        return sitio && sitio.x !== undefined ? new Position(sitio.x, sitio.y, sitio.z) : null;
    }
}

class ItemWrapper {
    /**
     * @param {number} instanceId identificador de la INSTANCIA, o 0
     * @param {number} [typeId] identificador del TIPO
     *
     * Los dos identificadores son distintos y hay eventos en los que el motor
     * conoce sólo uno. En un movimiento, el evento se registra por TIPO de item
     * (el 2376), pero el item que hay en el suelo es una INSTANCIA con su uid.
     * Sin poder declarar el tipo explícitamente, `getName()` devuelve null en esos
     * handlers.
     */
    constructor(world, instanceId, typeId) {
        this.world = world;
        this.uid = instanceId;
        this.typeId = (typeId === undefined || typeId === null) ? null : typeId;
    }

    _item() {
        return this.world.getItem(this.uid);
    }

    getUniqueId() {
        return this.uid;
    }

    getId() {
        if (this.typeId !== null) {
            return this.typeId;
        }
        const item = this._item();
        return item ? item.typeId : 0;
    }

    getCount() {
        const item = this._item();
        return item ? item.count : 1;
    }

    getName() {
        const definition = this.world.itemTypes.get(this.getId());
        return definition ? definition.name : null;
    }

    /** Un atributo (por nombre o ITEM_ATTRIBUTE_*): el de ESTE objeto, o el de su tipo. */
    getAttribute(clave) {
        const key = Enums.claveDeAtributo(clave);
        const item = this._item();
        if (item) {
            const own = item.getAttribute(key);
            if (own !== undefined) {
                return own;
            }
        }
        const definition = this.world.itemTypes.get(this.getId());
        if (!definition || !definition.attributes) {
            return undefined;
        }
        return definition.attributes[key];
    }

    /** Lo quita del mundo; con `count`, sólo esos de la pila (`item:remove(1)` de TFS). */
    remove(count) {
        const item = this._item();
        if (item && count !== undefined && Number(count) < item.count) {
            item.count -= Math.max(1, Math.trunc(Number(count)));
            if (item.position) {
                this.world.emit('onTileChanged', item.position, item);
            }
            return true;
        }
        if (item && item.parent) {
            this.world._sacarDeContenedor(item);
            this.world.items.delete(item.instanceId);
            return true;
        }
        return this.world.removeItem(this.uid);
    }

    /** Cambia un atributo de ESTE objeto (actionId, uniqueId, text...), no el de su tipo. */
    setAttribute(clave, value) {
        const item = this._item();
        if (!item) {
            return false;
        }
        if (!item.attributes) {
            item.attributes = {};
        }
        item.attributes[Enums.claveDeAtributo(clave)] = value;
        return true;
    }

    /** `item:removeAttribute(key)` de TFS (por nombre o ITEM_ATTRIBUTE_*). */
    removeAttribute(clave) {
        const item = this._item();
        if (!item || !item.attributes) {
            return false;
        }
        delete item.attributes[Enums.claveDeAtributo(clave)];
        return true;
    }

    /** Cambia cuántos hay en la pila (1-100). */
    setCount(n) {
        const item = this._item();
        if (!item) {
            return false;
        }
        item.count = Math.max(1, Math.min(100, Math.trunc(Number(n) || 1)));
        if (item.position) {
            this.world.emit('onTileChanged', item.position, item);
        }
        return true;
    }

    /** Lo pone en otra casilla (se junta con una pila igual, como al soltarlo). */
    moveTo(position) {
        const item = this._item();
        if (!item || !position) {
            return false;
        }
        if (item.parent) {
            this.world._sacarDeContenedor(item);
        } else if (item.position) {
            const tile = this.world.map.getTile(item.position.x, item.position.y, item.position.z);
            if (tile) {
                tile.removeItem(item);
                this.world.emit('onItemRemoved', item, tile);
                this.world.emit('onTileChanged', item.position, null);
            }
        }
        return this.world._ponerJuntando(item, { x: position.x, y: position.y, z: position.z }).ok;
    }

    /** Empieza a pudrirse (o a cambiar) según su `decayTo` y `duration` de items.xml. */
    decay() {
        const item = this._item();
        if (!item || !this.world.startDecay) {
            return false;
        }
        this.world.startDecay(item);
        return true;
    }

    isContainer() {
        const item = this._item();
        return item ? item.isContainer : this.world.isContainerType(this.getId());
    }

    /** Lo que hay dentro (si es un contenedor del suelo), como envoltorios. */
    getItems() {
        const item = this._item();
        if (!item || !item.isContainer) {
            return [];
        }
        return this.world.contentsOfItem(item).map((dentro) => {
            this.world.adoptItem(dentro);
            return new ItemWrapper(this.world, dentro.instanceId, null);
        });
    }

    /** Mete un objeto dentro (si es un contenedor del suelo y cabe). Devuelve su envoltorio o null. */
    addItem(typeId, count) {
        const item = this._item();
        if (!item || !item.isContainer) {
            return null;
        }
        const dentro = this.world.addToGroundContainer(item, Number(typeId), count || 1);
        return dentro ? new ItemWrapper(this.world, dentro.instanceId, null) : null;
    }

    /** Lo que pesa (la pila entera, y si es un contenedor, con todo lo que lleve dentro). */
    getWeight() {
        const item = this._item();
        return item && this.world.pesoDeObjeto ? this.world.pesoDeObjeto(item)
            : this.world.weightOfItem(this.getId(), this.getCount());
    }

    /** ¿Está en el inventario de alguien? (los del suelo, no). */
    isInInventory() {
        return false;
    }

    /**
     * Lo convierte en otro tipo de objeto, sin cambiar de sitio ni de instancia: el
     * `item:transform(id)` de TFS. Es lo que hace una puerta al abrirse.
     */
    transform(newTypeId) {
        const ok = this.world.transformItem(this.uid, Number(newTypeId));
        if (ok) {
            this.typeId = null;
        }
        return ok;
    }

    /**
     * Dónde está (una copia), o null si no está en el mundo. Lo que está DENTRO de un contenedor
     * del suelo (una espada en una bolsa dentro de un cuerpo) está donde esté el de fuera del todo.
     */
    getPosition() {
        const item = this._item();
        const donde = item && (item.parent && this.world.posicionDeObjeto
            ? this.world.posicionDeObjeto(item) : item.position);
        return donde ? new Position(donde.x, donde.y, donde.z) : null;
    }

    // -----------------------------------------------------------------------
    // Lo que TFS da a `Item` y a `Container` (lo común a los dos envoltorios, en METODOS_DE_OBJETO)
    // -----------------------------------------------------------------------

    /** `item:getCharges()`: las cargas propias (`charges`) o, si no las tiene, las de su tipo. */
    getCharges() {
        return Number(this.getAttribute('charges')) || 0;
    }

    /**
     * `item:getParent()`: el contenedor donde está (un `Item`) o, si está en el suelo, su casilla
     * (`Tile`). Null si no está en ningún sitio.
     */
    getParent() {
        const item = this._item();
        if (!item) {
            return null;
        }
        if (item.parent) {
            return T().envolverObjeto(this.world, item.parent, false);
        }
        return item.position ? T().crearTile(this.world, item.position) : null;
    }

    /** `item:getTopParent()`: la casilla del contenedor de fuera del todo (o la suya). */
    getTopParent() {
        const pos = this.getPosition();
        return pos ? T().crearTile(this.world, pos) : null;
    }

    /** `item:getTile()`. */
    getTile() {
        return this.getTopParent();
    }

    /** `item:isLoadedFromMap()`: si vino con el mapa (no lo creó un script, ni cayó de un monstruo). */
    isLoadedFromMap() {
        const item = this._item();
        return !!(item && item.loadedFromMap);
    }

    /** `item:clone()`: uno igual (tipo, cantidad y atributos), nuevo y sin poner en ningún sitio. */
    clone() {
        const item = this._item();
        if (!item) {
            return null;
        }
        const copia = this.world.createItem(item.typeId, item.count, null);
        if (!copia) {
            return null;
        }
        copia.attributes = JSON.parse(JSON.stringify(item.attributes || {}));
        return T().envolverObjeto(this.world, copia, false);
    }

    /**
     * `item:split([count])`: separa `count` de la pila (1 sin número) en un objeto nuevo, sin poner en
     * ningún sitio. Null si no es apilable o no hay tantos.
     */
    split(count) {
        const item = this._item();
        const n = Math.max(1, Math.trunc(Number(count) || 1));
        if (!item || !item.stackable || item.count <= n) {
            return null;
        }
        item.count -= n;
        if (item.position) {
            this.world.emit('onTileChanged', item.position, item);
        }
        const nuevo = this.world.createItem(item.typeId, n, null);
        return nuevo ? T().envolverObjeto(this.world, nuevo, false) : null;
    }

    /** `container:getCapacity()`: sus huecos (`containerSize`); 0 si no es contenedor. */
    getCapacity() {
        const item = this._item();
        return item && item.isContainer ? this.world.capacityOfContainer(item) : 0;
    }

    /**
     * `container:addItemEx(item)`: mete dentro un objeto QUE YA EXISTE (del suelo, de otro contenedor
     * o uno suelto de `clone`/`split`/`Game.createItem`), si cabe. Devuelve si entró.
     */
    addItemEx(otro) {
        const item = this._item();
        const objeto = T().objetoReal(this.world, otro);
        if (!item || !item.isContainer || !objeto || objeto === item) {
            return false;
        }
        if (!this.world.cabeEnObjeto(item, objeto.typeId, objeto.count)) {
            return false;
        }
        if (objeto.parent || objeto.position) {
            this.world._desprenderObjeto(objeto);
        }
        this.world._meterEnObjeto(item, objeto);
        if (this.world.posicionDeObjeto && this.world.posicionDeObjeto(item)) {
            this.world.emit('onTileChanged', this.world.posicionDeObjeto(item), item);
        }
        return true;
    }

    /** `container:getCorpseOwner()`: el id de criatura dueño del botín de un cuerpo (0 si no tiene). */
    getCorpseOwner() {
        const item = this._item();
        return item ? Number(item.corpseOwner || (item.attributes && item.attributes.corpseOwner)) || 0 : 0;
    }

    toString() {
        return 'Item(' + this.uid + ', ' + this.getName() + ')';
    }
}

/**
 * UN OBJETO QUE LLEVA UN JUGADOR (en la mochila, puesto o dentro de una bolsa de la mochila, a
 * cualquier profundidad): lo que recibe `onUse` al usar algo desde el inventario (comer, beber).
 * Las entradas del inventario no son objetos del mundo, así que este envoltorio guarda la entrada
 * misma y su dueño. Si es un contenedor, `getItems()` da lo de dentro (ver `engine/world/contenedores.js`).
 */
class InventoryItemWrapper {
    constructor(world, playerId, entry) {
        this.world = world;
        this.playerId = playerId;
        this.entry = entry;
    }

    _player() {
        return this.world.getPlayer(this.playerId);
    }

    /** El dueño, si TODAVÍA la lleva (en cualquier sitio de lo que lleva), o null. */
    _vivo() {
        const player = this._player();
        if (!player) {
            return null;
        }
        const la = this.world.tieneEntrada ? this.world.tieneEntrada(player, this.entry)
            : player.inventory.includes(this.entry);
        return la ? player : null;
    }

    getUniqueId() {
        return 0;
    }

    getId() {
        return this.entry.typeId;
    }

    getCount() {
        return this._vivo() ? this.entry.count : 0;
    }

    getName() {
        const definition = this.world.itemTypes.get(this.entry.typeId);
        return definition ? definition.name : null;
    }

    getAttribute(clave) {
        const key = Enums.claveDeAtributo(clave);
        if (this.entry.attributes && this.entry.attributes[key] !== undefined) {
            return this.entry.attributes[key];
        }
        const definition = this.world.itemTypes.get(this.entry.typeId);
        return definition && definition.attributes ? definition.attributes[key] : undefined;
    }

    setAttribute(clave, value) {
        if (!this._vivo()) {
            return false;
        }
        this.entry.attributes = { ...(this.entry.attributes || {}), [Enums.claveDeAtributo(clave)]: value };
        return true;
    }

    /** `item:removeAttribute(key)` de TFS (por nombre o ITEM_ATTRIBUTE_*). */
    removeAttribute(clave) {
        if (!this._vivo() || !this.entry.attributes) {
            return false;
        }
        const copia = { ...this.entry.attributes };
        delete copia[Enums.claveDeAtributo(clave)];
        this.entry.attributes = copia;
        return true;
    }

    /** Lo gasta: `remove(1)` (beberse una poción de la pila), o entero sin número. */
    remove(count) {
        const player = this._vivo();
        if (!player) {
            return false;
        }
        return this.world.consumeEntry(player, this.entry, count === undefined ? this.entry.count : count);
    }

    /** Lo convierte en otro objeto (una antorcha que se apaga), sin moverlo de su sitio. */
    transform(newTypeId) {
        const player = this._vivo();
        if (!player || !this.world.itemTypes.has(Number(newTypeId))) {
            return false;
        }
        this.entry.typeId = Number(newTypeId);
        this.world.recomputeEquipment(player);
        this.world.emit('onInventoryChange', player);
        return true;
    }

    /** Su sitio en el mundo es el de quien lo lleva. */
    getPosition() {
        const player = this._player();
        return player ? new Position(player.position.x, player.position.y, player.position.z) : null;
    }

    /** 'inside' (en la mochila) o la ranura donde lo lleva puesto. */
    getSlot() {
        return this.entry.slot;
    }

    /** Lo que pesa, con todo lo que lleve dentro si es una bolsa. */
    getWeight() {
        const player = this._vivo();
        if (player && this.world.pesoDeEntrada && this.world.containerOf(player) === this.entry) {
            // La mochila puesta: lo suyo son las entradas `inside`, no `contents`.
            return this.world.contenidoDeEntrada(player, this.entry)
                .reduce((total, e) => total + this.world.pesoDeEntrada(e), this.world.weightOfItem(this.entry.typeId, 1));
        }
        return this.world.pesoDeEntrada ? this.world.pesoDeEntrada(this.entry)
            : this.world.weightOfItem(this.entry.typeId, this.entry.count);
    }

    isContainer() {
        return this.world.isContainerType(this.entry.typeId);
    }

    /**
     * LO QUE HAY DENTRO, si es un contenedor que lleva (la mochila puesta o una bolsa a cualquier
     * profundidad), como envoltorios de inventario. Vacío si no es contenedor o ya no lo lleva.
     */
    getItems() {
        const player = this._vivo();
        if (!player || !this.isContainer()) {
            return [];
        }
        return this.world.contenidoDeEntrada(player, this.entry)
            .map((dentro) => new InventoryItemWrapper(this.world, this.playerId, dentro));
    }

    /** Los huecos que tiene, si es un contenedor (`containerSize` de items.xml); 0 si no. */
    getCapacity() {
        return this.isContainer() ? this.world.capacityOfType(this.entry.typeId) : 0;
    }

    /**
     * Mete objetos NUEVOS dentro, si es un contenedor que lleva, con todas las reglas (huecos, peso,
     * profundidad). Devuelve el envoltorio de donde quedaron, o null si no se pudo.
     */
    addItem(typeId, count, attributes) {
        const player = this._vivo();
        if (!player || !this.isContainer()) {
            return null;
        }
        const r = this.world.containerOf(player) === this.entry
            ? this.world.addItemTo(player, typeId, count, attributes)
            : this.world.addItemToEntry(player, this.entry, typeId, count, attributes);
        if (!r.ok) {
            return null;
        }
        const entrada = r.entry || this.world.contentsOf(player).slice(-1)[0];
        return entrada ? new InventoryItemWrapper(this.world, this.playerId, entrada) : null;
    }

    isInInventory() {
        return true;
    }

    // -----------------------------------------------------------------------
    // Lo que TFS da a `Item` y a `Container` (lo común a los dos envoltorios, en METODOS_DE_OBJETO)
    // -----------------------------------------------------------------------

    /** `item:getCharges()`: las cargas que le quedan (una runa, extras.js). */
    getCharges() {
        if (!this._vivo()) {
            return 0;
        }
        return this.world.runeCharges ? Number(this.world.runeCharges(this.entry)) || 0
            : Number(this.getAttribute('charges')) || 0;
    }

    /**
     * `item:getParent()`: la bolsa donde está (otro objeto del inventario) o, si va puesto o
     * directamente en la mochila puesta, el jugador. Null si ya no lo lleva.
     */
    getParent() {
        const player = this._vivo();
        if (!player) {
            return null;
        }
        const ubicacion = this.world.ubicacionDeEntrada ? this.world.ubicacionDeEntrada(player, this.entry) : null;
        const padre = ubicacion && ubicacion.padre ? ubicacion.padre
            : (this.entry.slot === 'inside' ? this.world.containerOf(player) : null);
        return padre && padre !== this.entry ? new InventoryItemWrapper(this.world, this.playerId, padre)
            : T().envolverCriatura(this.world, player);
    }

    /** `item:getTopParent()`: quien lo lleva. */
    getTopParent() {
        const player = this._vivo();
        return player ? T().envolverCriatura(this.world, player) : null;
    }

    /** `item:getTile()`: la casilla de quien lo lleva. */
    getTile() {
        const pos = this.getPosition();
        return pos ? T().crearTile(this.world, pos) : null;
    }

    /** `item:isLoadedFromMap()`: lo que lleva un jugador no viene del mapa. */
    isLoadedFromMap() {
        return false;
    }

    /** `item:clone()`: uno igual como objeto del mundo, nuevo y sin poner en ningún sitio. */
    clone() {
        const copia = this.world.createItem(this.entry.typeId, this.entry.count, null);
        if (!copia) {
            return null;
        }
        copia.attributes = JSON.parse(JSON.stringify(this.entry.attributes || {}));
        return T().envolverObjeto(this.world, copia, false);
    }

    /** `item:split([count])`: separa `count` de la pila en un objeto del mundo, sin poner en ningún sitio. */
    split(count) {
        const player = this._vivo();
        const n = Math.max(1, Math.trunc(Number(count) || 1));
        if (!player || !this.world.esApilable(this.entry.typeId) || this.entry.count <= n) {
            return null;
        }
        if (!this.world.consumeEntry(player, this.entry, n)) {
            return null;
        }
        const nuevo = this.world.createItem(this.entry.typeId, n, null);
        return nuevo ? T().envolverObjeto(this.world, nuevo, false) : null;
    }

    /**
     * `container:addItemEx(item)`: mete dentro un objeto que ya existe (del mundo o de su inventario),
     * con las reglas de siempre (huecos, peso, profundidad). Devuelve si entró.
     */
    addItemEx(otro) {
        const player = this._vivo();
        if (!player || !this.isContainer() || !otro) {
            return false;
        }
        const destino = { entry: this.entry };
        const origen = otro.entry ? { entry: otro.entry } : (() => {
            const objeto = T().objetoReal(this.world, otro);
            if (!objeto) {
                return null;
            }
            const tile = objeto.position ? this.world.map.getTile(objeto.position.x, objeto.position.y, objeto.position.z) : null;
            return { item: objeto, tile: tile };
        })();
        if (!origen || !this.world.moverADentro) {
            return false;
        }
        // Algo suelto (de `clone` o `split`) no está en ninguna casilla: se mete directamente.
        if (origen.item && !origen.item.position && !origen.item.parent) {
            const r = this.world.addItemToEntry(player, this.entry, origen.item.typeId, origen.item.count, origen.item.attributes);
            if (r && r.ok) {
                this.world.items.delete(origen.item.instanceId);
                return true;
            }
            return false;
        }
        const r = this.world.moverADentro(player, origen, destino);
        return !!(r && r.ok);
    }

    /** `container:getCorpseOwner()`: lo que lleva un jugador no es un cuerpo. */
    getCorpseOwner() {
        return 0;
    }

    toString() {
        return 'InventoryItem(' + this.getName() + ' x' + this.entry.count + ')';
    }
}

/**
 * Crea envoltorios con caché por identificador.
 *
 * La caché es por motor y no global: dos motores en el mismo proceso (por ejemplo
 * dos pruebas) no deben compartir envoltorios.
 */
/**
 * Una CASA (engine/world/casas.js), como la clase `House` de TFS. Envuelve el número de la casa: lo
 * que devuelve se lee al momento, así que un `getOwnerName()` después de un `!buyhouse` ya dice el
 * nuevo dueño. Cambiarla (comprar, dejar, las listas) se hace por el jugador, que es quien tiene
 * permiso o no.
 */
class HouseWrapper {
    constructor(world, id) {
        this.world = world;
        this.id = id;
    }

    _info() {
        return this.world.houseInfo(this.world.houseById(this.id)) || {};
    }

    getId() { return this.id; }
    getName() { return this._info().name || ''; }
    getTownId() { return this._info().townId || 0; }
    getRent() { return this._info().rent || 0; }
    /** Lo que cuesta comprarla: `housePriceEachSQM` × casillas. */
    getPrice() { return this._info().price || 0; }
    getTileCount() { return this._info().tiles || 0; }
    /** El id del personaje dueño (0 si no tiene) y su nombre ('' si no tiene). */
    getOwnerGuid() { return this._info().ownerId || 0; }
    getOwnerName() { return this._info().ownerName || ''; }
    /** Hasta cuándo está pagado el alquiler (ms del reloj del mundo; 0 = se cobra en la siguiente vuelta). */
    getPaidUntil() { return this._info().paidUntil || 0; }
    getRentWarnings() { return this._info().warnings || 0; }
    getExitPosition() { return this._info().exit || null; }
    /** Las puertas: `[{id, x, y, z}]`; el id es el de su lista de acceso. */
    getDoors() { return this._info().doors || []; }

    /** Una lista de acceso, el texto tal cual: 256 invitados, 257 subdueños, o el número de una puerta. */
    getAccessList(listId) {
        return this.world.houseList(this.world.houseById(this.id), listId);
    }

    /** El acceso de un jugador (su envoltorio): 0 nada, 1 invitado, 2 subdueño, 3 dueño. */
    getAccessLevel(player) {
        const p = player && player.getId ? this.world.getPlayer(player.getId()) : null;
        return this.world.houseAccessLevel(p, this.world.houseById(this.id));
    }

    _casa() {
        return this.world.houseById(this.id);
    }

    /** `house:getTown()`: la ciudad de la casa (`Town`), o null. */
    getTown() {
        return T().buscarCiudad(this.world, this.getTownId());
    }

    /** `house:getDoorCount()`. */
    getDoorCount() {
        return this.getDoors().length;
    }

    /** `house:getTiles()`: sus casillas (`Tile`). */
    getTiles() {
        const casa = this._casa();
        return casa ? casa.tiles.map((t) => new (T().TileWrapper)(this.world, t.x, t.y, t.z)) : [];
    }

    /** `house:getItems()`: lo que hay en sus casillas (sin los suelos). */
    getItems() {
        return this.getTiles().reduce((todos, tile) => todos.concat(tile.getItems()), []);
    }

    /** `house:getBeds()`: las CABECERAS de sus camas (una por cama), como objetos. */
    getBeds() {
        const casa = this._casa();
        if (!casa || !this.world.esCama) {
            return [];
        }
        const camas = [];
        casa.tiles.forEach((tile) => {
            tile.downItems.concat(tile.topItems).forEach((item) => {
                if (this.world.esCama(item) && this.world._esCabecera(item)) {
                    camas.push(T().envolverObjeto(this.world, item, false));
                }
            });
        });
        return camas;
    }

    /** `house:getBedCount()`. */
    getBedCount() {
        return this.getBeds().length;
    }

    /**
     * `house:setOwnerGuid(guid)`: le da la casa a ese personaje (por su id; también vale un jugador o
     * su nombre), o la deja sin dueño con 0. Lo de dentro va al depósito del dueño anterior, como al
     * dejarla. Devuelve si se pudo.
     */
    setOwnerGuid(guid) {
        const casa = this._casa();
        if (!casa) {
            return false;
        }
        if (!guid) {
            this.world.setHouseOwner(casa, null);
            return true;
        }
        const quien = guid && typeof guid.getId === 'function'
            ? this.world.getPlayer(guid.getId())
            : (this.world.buscarDestinatario ? this.world.buscarDestinatario(guid) : null);
        if (!quien) {
            return false;
        }
        const nuevo = quien.isPlayer ? quien : (quien.jugador || { id: quien.id, nombre: quien.nombre });
        this.world.setHouseOwner(casa, nuevo);
        return true;
    }

    /**
     * `house:setAccessList(listId, text)`: GUEST_LIST (256), SUBOWNER_LIST (257) o el número de una
     * puerta. Quien se quede sin acceso sale de la casa.
     */
    setAccessList(listId, texto) {
        const casa = this._casa();
        return !!(casa && this.world.setHouseList(casa, listId, texto));
    }

    /**
     * `house:canEditAccessList(listId, player)`: como `House::canEditAccessList` de TFS: el dueño
     * todas; un subdueño, sólo la de invitados.
     */
    canEditAccessList(listId, player) {
        const nivel = this.getAccessLevel(player);
        return nivel === 3 || (nivel === 2 && Number(listId) === Enums.HOUSE_LIST.GUEST_LIST);
    }

    /**
     * `house:kickPlayer(player, targetPlayer)`: echa a `targetPlayer` (que tiene que estar dentro) a la
     * salida. Uno puede echarse a sí mismo; a otro, sólo si tiene menos acceso.
     */
    kickPlayer(player, objetivo) {
        const casa = this._casa();
        const quien = player && player.getId ? this.world.getPlayer(player.getId()) : null;
        const a = objetivo && objetivo.getId ? this.world.getPlayer(objetivo.getId()) : null;
        if (!casa || !a || !a.tile || a.tile.houseId !== casa.id) {
            return false;
        }
        if (quien && quien !== a && this.world.houseAccessLevel(a, casa) >= this.world.houseAccessLevel(quien, casa)) {
            return false;
        }
        return this.world.kickOutOfHouse(a, casa);
    }

    /** `house:isInvited(player)`: si puede entrar (invitado, subdueño o dueño). */
    isInvited(player) {
        return this.getAccessLevel(player) > 0;
    }

    /** `house:getPlayers()`: los que están dentro ahora. */
    getPlayers() {
        const casa = this._casa();
        return casa ? this.world.playersInHouse(casa).map((p) => T().envolverCriatura(this.world, p)) : [];
    }

    toString() {
        return 'House(' + this.id + ', ' + this.getName() + ')';
    }
}

/**
 * LO QUE TFS DA A `Item` Y A `Container` y se escribe igual para los dos envoltorios de objeto (el
 * del suelo y el del inventario): sólo usa lo que los dos tienen (`getId`, `getCount`,
 * `getAttribute`, `setAttribute`, `isContainer`, `getItems`...). Lo que depende de dónde está cada
 * uno (`getParent`, `clone`, `addItemEx`...) va en cada clase.
 */
const METODOS_DE_OBJETO = {
    /** `item:isItem()`. */
    isItem() { return true; },
    /** `item:isCreature()`. */
    isCreature() { return false; },
    /** `item:getActionId()`. */
    getActionId() { return Number(this.getAttribute('actionId')) || 0; },
    /** `item:setActionId(aid)`. */
    setActionId(aid) { return this.setAttribute('actionId', Number(aid) || 0); },
    /** `item:getFluidType()`: el `fluidType` del objeto (Jetyum no tiene líquidos: 0). */
    getFluidType() { return Number(this.getAttribute('fluidType')) || 0; },
    /** `item:getSubType()`: el líquido, las cargas o la cantidad, lo que tenga (como en TFS). */
    getSubType() {
        const fluido = this.getFluidType();
        if (fluido) {
            return fluido;
        }
        const tipo = this.world.itemTypes.get(this.getId());
        if (tipo && tipo.attributes && tipo.attributes.charges !== undefined) {
            return this.getCharges();
        }
        return this.getCount();
    },
    /** `item:hasAttribute(key)`: si ESTE objeto lo tiene (no su tipo). */
    hasAttribute(clave) {
        const key = Enums.claveDeAtributo(clave);
        const propios = this.entry ? this.entry.attributes : (this._item() ? this._item().attributes : null);
        return !!(propios && propios[key] !== undefined);
    },
    /** `item:getArticle()`: el propio (atributo `article`) o el de su tipo. */
    getArticle() { return String(this.getAttribute('article') || this.getType().getArticle()); },
    /** `item:getPluralName()`. */
    getPluralName() { return String(this.getAttribute('pluralName') || this.getType().getPluralName()); },
    /**
     * `item:getDescription()`: el texto que ESTE objeto tiene como `description` (lo pone, por
     * ejemplo, el correo al escribir una carta) o el de su tipo.
     */
    getDescription() { return String(this.getAttribute('description') || ''); },
    /** `item:getText()`: lo escrito (atributo `text`, el de las cartas de correo.js). */
    getText() { return String(this.getAttribute('text') || ''); },
    /** `item:setText(texto)`. */
    setText(texto) { return this.setAttribute('text', String(texto == null ? '' : texto)); },
    /** `item:getType()`: su `ItemType`. */
    getType() { return new (T().ItemTypeWrapper)(this.world, this.getId()); },
    /** `item:hasProperty(CONST_PROP_*)`. */
    hasProperty(propiedad) {
        const item = this.entry ? { attributes: this.entry.attributes } : this._item();
        return T().propiedadDeObjeto(this.world, this.getId(), item, propiedad);
    },
    /** `item:getCustomAttribute(key)`: un atributo propio de los scripts (se guarda con el objeto). */
    getCustomAttribute(clave) {
        const v = this.getAttribute('custom:' + String(clave));
        return v === undefined ? null : v;
    },
    /** `item:setCustomAttribute(key, value)`. */
    setCustomAttribute(clave, valor) { return this.setAttribute('custom:' + String(clave), valor); },
    /** `item:removeCustomAttribute(key)`. */
    removeCustomAttribute(clave) { return this.removeAttribute('custom:' + String(clave)); },

    // --- Container ----------------------------------------------------------

    /** `container:getSize()`: cuántas cosas tiene dentro. */
    getSize() { return this.isContainer() ? this.getItems().length : 0; },
    /** `container:getEmptySlots([recursive])`: los huecos libres (con `recursive`, también los de dentro). */
    getEmptySlots(recursivo) {
        if (!this.isContainer()) {
            return 0;
        }
        const dentro = this.getItems();
        let libres = Math.max(0, this.getCapacity() - dentro.length);
        if (recursivo) {
            dentro.forEach((d) => {
                if (d.isContainer()) {
                    libres += d.getEmptySlots(true);
                }
            });
        }
        return libres;
    },
    /** `container:getItem(index)`: lo que hay en ese hueco (desde 0), o null. */
    getItem(index) { return this.getItems()[Number(index)] || null; },
    /** `container:getItemHoldingCount()`: cuántos objetos hay dentro, contando lo de dentro de las bolsas. */
    getItemHoldingCount() {
        return this.getItems().reduce((n, d) => n + 1 + (d.isContainer() ? d.getItemHoldingCount() : 0), 0);
    },
    /** `container:getItemCountById(id[, subType])`: cuántos de ese tipo hay dentro, a cualquier profundidad. */
    getItemCountById(typeId) {
        const id = Number(typeId);
        return this.getItems().reduce((n, d) =>
            n + (d.getId() === id ? d.getCount() : 0) + (d.isContainer() ? d.getItemCountById(id) : 0), 0);
    },
    /** `container:hasItem(item)`: si ese objeto está dentro (a cualquier profundidad). */
    hasItem(otro) {
        if (!otro) {
            return false;
        }
        const igual = (d) => (otro.entry ? d.entry === otro.entry
            : !d.entry && d.getUniqueId() !== 0 && d.getUniqueId() === otro.getUniqueId());
        return this.getItems().some((d) => igual(d) || (d.isContainer() && d.hasItem(otro)));
    }
};

/** Pone los métodos sin enumerar y sin pisar los que la clase ya tenga. */
function mezclar(Clase, metodos) {
    Object.keys(metodos).forEach((nombre) => {
        if (!Object.prototype.hasOwnProperty.call(Clase.prototype, nombre)) {
            Object.defineProperty(Clase.prototype, nombre, {
                value: metodos[nombre], writable: true, configurable: true, enumerable: false
            });
        }
    });
}

mezclar(ItemWrapper, METODOS_DE_OBJETO);
mezclar(InventoryItemWrapper, METODOS_DE_OBJETO);

class EntityFactory {
    constructor(world) {
        this.world = world;
        this.creatures = new Map();
        this.items = new Map();
    }

    /**
     * Devuelve el envoltorio que corresponde: jugador o monstruo.
     *
     * Es lo que permite que un handler de movimiento reciba al que de verdad pisó
     * el tile, sin que el módulo de contenido tenga que averiguarlo.
     */
    creature(id) {
        const key = Number(id) || 0;
        let existing = this.creatures.get(key);

        if (!existing) {
            existing = this.world.getPlayer(key)
                ? new PlayerWrapper(this.world, key)
                : new MonsterWrapper(this.world, key);
            this.creatures.set(key, existing);
        }

        return existing;
    }

    /** Igual que `creature`, pero deja claro en el código que se espera uno. */
    player(id) {
        return this.creature(id);
    }

    monster(id) {
        return this.creature(id);
    }

    item(instanceId, typeId) {
        const key = Number(instanceId) || 0;
        const type = (typeId === undefined || typeId === null) ? null : Number(typeId);

        // Si se declara el tipo explícitamente y no hay instancia, la caché por
        // uid no sirve: el mismo uid=0 se reutilizaría para todos los tipos.
        if (type !== null && key === 0) {
            return new ItemWrapper(this.world, key, type);
        }

        let existing = this.items.get(key);
        if (!existing) {
            existing = new ItemWrapper(this.world, key, type);
            this.items.set(key, existing);
        }
        return existing;
    }

    /** Un objeto del inventario de un jugador (la entrada misma). */
    inventoryItem(playerId, entry) {
        return new InventoryItemWrapper(this.world, playerId, entry);
    }

    position(x, y, z) {
        return new Position(x, y, z);
    }
}

module.exports = {
    CreatureWrapper,
    PlayerWrapper,
    MonsterWrapper,
    ItemWrapper,
    InventoryItemWrapper,
    HouseWrapper,
    EntityFactory,
    Position
};

// Los gremios y los castigos (`player:getGuild()`, `!createguild`, `/ban`...): engine/scripting/gremios-api.js.
Object.assign(PlayerWrapper.prototype, require('./gremios-api').delJugador);
