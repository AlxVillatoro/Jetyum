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
        const c = { ...(condicion || {}) };
        if (c.attacker && typeof c.attacker.getId === 'function') {
            c.attacker = this.world.getCreature(c.attacker.getId());
        }
        return !!(creature && this.world.condiciones && this.world.condiciones.add(creature, c));
    }

    removeCondition(tipo) {
        const creature = this._creature();
        return !!(creature && this.world.condiciones && this.world.condiciones.remove(creature, tipo));
    }

    hasCondition(tipo) {
        const creature = this._creature();
        return !!(creature && this.world.condiciones && this.world.condiciones.has(creature, tipo));
    }

    /** Lo que le queda de una condición: `{ type, value, ticks, ms }` o null. */
    getCondition(tipo) {
        const creature = this._creature();
        return creature && this.world.condiciones ? this.world.condiciones.get(creature, tipo) : null;
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

    /** La ficha entera de su vocación (vocations.js), de sólo lectura. */
    getVocationInfo() {
        const player = this.world.getPlayer(this.id);
        return player ? JSON.parse(JSON.stringify(this.world.vocationOf(player))) : null;
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

    getMagicLevel() {
        const player = this.world.getPlayer(this.id);
        return player ? player.magicLevel : 0;
    }

    /** Nivel de una skill: 'fist', 'club', 'sword', 'axe', 'distance', 'shielding' o 'fishing'. */
    getSkillLevel(skill) {
        const player = this.world.getPlayer(this.id);
        const estado = player && player.skills ? player.skills[skill] : null;
        return estado ? estado.level : 0;
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

    /** Mensaje privado, sólo para este jugador. */
    sendTextMessage(text) {
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

    /** Un mensaje en rojo de «no se puede» (el `sendCancelMessage` de TFS). */
    sendCancelMessage(text) {
        this.world.sendTextMessage(this.id, String(text));
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

    /** Su grupo: `{ leader, members: [nombres] }`, o null. */
    getParty() {
        const player = this.world.getPlayer(this.id);
        const grupo = player ? this.world.partyOf(player) : null;
        return grupo ? { leader: grupo.leader.name, members: grupo.members.map((m) => m.name) } : null;
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

    /** Cuántas cosas lleva. */
    getItemCount() {
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

        player.outfit = candidate;
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

    getAttribute(key) {
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
    setAttribute(key, value) {
        const item = this._item();
        if (!item) {
            return false;
        }
        if (!item.attributes) {
            item.attributes = {};
        }
        item.attributes[String(key)] = value;
        return true;
    }

    removeAttribute(key) {
        const item = this._item();
        if (!item || !item.attributes) {
            return false;
        }
        delete item.attributes[String(key)];
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

    /** Lo que pesa (la pila entera). */
    getWeight() {
        return this.world.weightOfItem(this.getId(), this.getCount());
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

    /** Dónde está (una copia), o null si no está en el suelo. */
    getPosition() {
        const item = this._item();
        return item && item.position ? new Position(item.position.x, item.position.y, item.position.z) : null;
    }

    toString() {
        return 'Item(' + this.uid + ', ' + this.getName() + ')';
    }
}

/**
 * UN OBJETO QUE LLEVA UN JUGADOR (en la mochila o puesto): lo que recibe `onUse` al usar algo
 * desde el inventario (comer, beber). Las entradas del inventario no son objetos del mundo, así
 * que este envoltorio guarda la entrada misma y su dueño.
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

    _vivo() {
        const player = this._player();
        return player && player.inventory.includes(this.entry) ? player : null;
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

    getAttribute(key) {
        if (this.entry.attributes && this.entry.attributes[key] !== undefined) {
            return this.entry.attributes[key];
        }
        const definition = this.world.itemTypes.get(this.entry.typeId);
        return definition && definition.attributes ? definition.attributes[key] : undefined;
    }

    setAttribute(key, value) {
        if (!this._vivo()) {
            return false;
        }
        this.entry.attributes = { ...(this.entry.attributes || {}), [String(key)]: value };
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

    getWeight() {
        return this.world.weightOfItem(this.entry.typeId, this.entry.count);
    }

    isContainer() {
        return this.world.isContainerType(this.entry.typeId);
    }

    isInInventory() {
        return true;
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
    EntityFactory,
    Position
};
