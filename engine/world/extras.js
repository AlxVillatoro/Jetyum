'use strict';

/**
 * LO QUE EL MUNDO SABE HACER PARA LOS SCRIPTS Y PARA EL JUEGO EN GRUPO, aparte de `world.js`:
 *
 *   - curar a cualquier criatura, y dar y quitar objetos con todas las reglas (mochila, huecos,
 *     peso), para `player.addItem` / `player.removeItem`;
 *   - gastar lo que se usa desde la mochila (comer, beber una poción);
 *   - la LUZ: la del mundo (día y noche) y la que lleva cada jugador;
 *   - los GRUPOS (party): invitar, entrar, salir y repartir la experiencia;
 *   - las CALAVERAS: blanca al atacar a quien no la lleva, roja al matar a demasiados;
 *   - los MENSAJES PRIVADOS y de grupo;
 *   - el DEPÓSITO: un cofre con lo de cada jugador, que se guarda con él.
 *
 * Se mezcla en `World` (`Object.assign(World.prototype, extras)`): son métodos del mundo, pero en
 * un archivo propio para que `world.js` no siga creciendo.
 */

const { SLOT_INSIDE } = require('../../shared/js/protocol.mjs');
const { Item } = require('./item');

/** Huecos del depósito de cada jugador. */
const HUECOS_DEPOSITO = 30;
/** Cuánto dura la calavera blanca desde el último ataque (como el «pz lock» de Tibia): 15 min. */
const DURA_CALAVERA_BLANCA = 15 * 60 * 1000;
/** Muertes injustas en 24 h que dan la calavera roja, y cuánto dura. */
const MUERTES_PARA_ROJA = 3;
const DURA_CALAVERA_ROJA = 24 * 60 * 60 * 1000;
/** Hasta dónde se reparte la experiencia del grupo (casillas, en la misma planta). */
const ALCANCE_GRUPO = 30;

const extras = {
    // -----------------------------------------------------------------------
    // Curar, dar y quitar
    // -----------------------------------------------------------------------

    /** Cura (o hiere, en negativo, sin matar) a cualquier criatura. Devuelve lo que cambió. */
    healCreature(creature, amount) {
        if (!creature || (creature.isDead && creature.isDead())) {
            return 0;
        }
        const antes = creature.health;
        creature.health = Math.max(1, Math.min(creature.maxHealth, creature.health + Math.trunc(Number(amount) || 0)));
        const cambio = creature.health - antes;
        if (cambio !== 0) {
            this.emit('onHealthChange', creature, cambio);
        }
        return cambio;
    },

    /**
     * Le da objetos a un jugador con TODAS las reglas: que exista, que lleve mochila, que quepa
     * en sus huecos y que pueda con el peso. `player.addItem` de los scripts.
     *
     * @returns {{ok: boolean, reason?: string}}
     */
    addItemTo(player, typeId, count, attributes) {
        const id = Number(typeId);
        const cuantos = Math.max(1, Math.trunc(Number(count) || 1));
        if (!this.itemTypes.has(id)) {
            return { ok: false, reason: 'unknownItem' };
        }
        if (!this.hasContainer(player)) {
            return { ok: false, reason: 'noContainer' };
        }
        if (!this.fitsInBackpack(player, id, 0, cuantos)) {
            return { ok: false, reason: 'backpackFull', slots: this.backpackCapacity(player) };
        }
        const peso = this.weightOfItem(id, cuantos);
        if (!this.canCarry(player, peso)) {
            return { ok: false, reason: 'tooHeavy', weight: peso, free: this.capacityOf(player) - this.weightOf(player) };
        }
        this._addToContainer(player, id, cuantos, attributes || null);
        this.emit('onInventoryChange', player);
        return { ok: true };
    },

    /** Le quita objetos, SÓLO si tiene todos los que se piden (como `removeItem` de TFS). */
    removeItemFrom(player, typeId, count) {
        const cuantos = Math.max(1, Math.trunc(Number(count) || 1));
        if (this.countOf(player, typeId) < cuantos) {
            return false;
        }
        this.takeItem(player, typeId, cuantos);
        this.recomputeEquipment(player);
        this.emit('onInventoryChange', player);
        return true;
    },

    /** Gasta `count` de una entrada del inventario (la poción que se bebe). Devuelve si pudo. */
    consumeEntry(player, entry, count) {
        const cuantos = Math.max(1, Math.trunc(Number(count) || 1));
        if (!player || !entry || !player.inventory.includes(entry) || entry.count < cuantos) {
            return false;
        }
        entry.count -= cuantos;
        if (entry.count <= 0) {
            player.inventory.splice(player.inventory.indexOf(entry), 1);
            this._reindexInventory(player.inventory);
        }
        this.recomputeEquipment(player);
        this.emit('onInventoryChange', player);
        return true;
    },

    /** Le da dinero, en las monedas más grandes (1234 → 12 de platino y 34 de oro), si le cabe. */
    addMoneyTo(player, amount) {
        const n = Math.trunc(Number(amount) || 0);
        if (n <= 0 || !this.hasContainer(player) || !this.cabeDinero(player, n)) {
            return false;
        }
        const peso = this.monedasPara(n).reduce((t, [id, c]) => t + this.weightOfItem(id, c), 0);
        if (!this.canCarry(player, peso)) {
            return false;
        }
        this.darDinero(player, n);
        this.emit('onInventoryChange', player);
        return true;
    },

    /** Le cobra dinero, sólo si lo tiene todo (con las monedas que haga falta, y le da el cambio). */
    removeMoneyFrom(player, amount) {
        const n = Math.trunc(Number(amount) || 0);
        if (n <= 0 || !this.canPayMoney(player, n)) {
            return false;
        }
        const copia = this._copiaInventario(player);
        this.pagarDinero(player, n);
        // El cambio tiene que caber; si no, no se cobra.
        if (this.contentsOf(player).length > Math.max(this.backpackCapacity(player), copia.filter((e) => e.slot === 'inside').length)) {
            this._restaurarInventario(player, copia);
            return false;
        }
        this.recomputeEquipment(player);
        this.emit('onInventoryChange', player);
        return true;
    },

    // -----------------------------------------------------------------------
    // Luz
    // -----------------------------------------------------------------------

    /**
     * LA LUZ DEL MUNDO, de 0 (noche cerrada) a 255 (pleno día). Un día dura `dayCycleMs` (una
     * hora real por defecto): amanece, es de día, atardece y es de noche, con transiciones suaves.
     */
    worldLight() {
        const ciclo = this.dayCycleMs || 60 * 60 * 1000;
        const t = ((this.now() % ciclo) + ciclo) % ciclo / ciclo;   // 0..1: 0 = medianoche
        const sol = Math.max(0, Math.sin((t - 0.25) * 2 * Math.PI) * 0.5 + 0.5);
        const noche = this.nightLight === undefined ? 40 : this.nightLight;
        return Math.round(noche + (255 - noche) * Math.min(1, sol * 1.6));
    },

    /** La hora del día del mundo, «HH:MM» (para `Game.getWorldHour`). */
    worldHour() {
        const ciclo = this.dayCycleMs || 60 * 60 * 1000;
        const minutos = Math.floor((((this.now() % ciclo) + ciclo) % ciclo) / ciclo * 24 * 60);
        return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' + String(minutos % 60).padStart(2, '0');
    },

    /** La luz que lleva una criatura, en casillas: la mayor de su equipo (`lightLevel`) y sus condiciones. */
    lightOf(creature) {
        let luz = this.condiciones ? this.condiciones.luzDe(creature) : 0;
        if (creature && creature.isPlayer && creature.isPlayer()) {
            this.equipmentOf(creature).forEach((entry) => {
                const def = this.itemTypes.get(entry.typeId);
                const nivel = Number(def && def.attributes && def.attributes.lightLevel) || 0;
                luz = Math.max(luz, nivel);
            });
        }
        return luz;
    },

    // -----------------------------------------------------------------------
    // Grupos
    // -----------------------------------------------------------------------

    /** El grupo de un jugador: `{ leader, members: [jugadores], invited: Set<id> }`, o null. */
    partyOf(player) {
        if (!player || !player.partyLeaderId || !this.parties) {
            return null;
        }
        return this.parties.get(player.partyLeaderId) || null;
    },

    /** El líder invita a alguien (si no tiene grupo, se crea con él dentro). */
    partyInvite(leader, target) {
        if (!leader || !target || leader === target) {
            return { ok: false, reason: 'badTarget' };
        }
        if (!this.parties) {
            this.parties = new Map();
        }
        let grupo = this.partyOf(leader);
        if (grupo && grupo.leader !== leader) {
            return { ok: false, reason: 'notLeader' };
        }
        if (this.partyOf(target)) {
            return { ok: false, reason: 'alreadyInParty' };
        }
        if (!grupo) {
            grupo = { leader: leader, members: [leader], invited: new Set() };
            this.parties.set(leader.id, grupo);
            leader.partyLeaderId = leader.id;
        }
        grupo.invited.add(target.id);
        this.emit('onPartyChange', grupo);
        return { ok: true };
    },

    /** Entra en el grupo de quien le invitó. */
    partyJoin(player, leader) {
        const grupo = this.partyOf(leader);
        if (!grupo || grupo.leader !== leader || !grupo.invited.has(player.id)) {
            return { ok: false, reason: 'notInvited' };
        }
        if (this.partyOf(player)) {
            return { ok: false, reason: 'alreadyInParty' };
        }
        grupo.invited.delete(player.id);
        grupo.members.push(player);
        player.partyLeaderId = leader.id;
        this.emit('onPartyChange', grupo);
        return { ok: true };
    },

    /** Sale del grupo. Si sale el líder, manda el siguiente; si queda uno solo, se deshace. */
    partyLeave(player) {
        const grupo = this.partyOf(player);
        if (!grupo) {
            return { ok: false, reason: 'notInParty' };
        }
        grupo.members = grupo.members.filter((m) => m !== player);
        player.partyLeaderId = null;
        this.parties.delete(grupo.leader.id);
        const antes = [player];
        if (grupo.members.length <= 1) {
            grupo.members.forEach((m) => { m.partyLeaderId = null; antes.push(m); });
            grupo.members = [];
        } else {
            grupo.leader = grupo.leader === player ? grupo.members[0] : grupo.leader;
            grupo.members.forEach((m) => { m.partyLeaderId = grupo.leader.id; });
            this.parties.set(grupo.leader.id, grupo);
        }
        this.emit('onPartyChange', grupo, antes);
        return { ok: true };
    },

    /** Los del grupo de un jugador que están cerca (con él), para repartir la experiencia. */
    partyMembersNear(player) {
        const grupo = this.partyOf(player);
        if (!grupo) {
            return [player];
        }
        return grupo.members.filter((m) => this.players.has(m.id) && !m.isDead() &&
            m.position.z === player.position.z &&
            Math.max(Math.abs(m.position.x - player.position.x), Math.abs(m.position.y - player.position.y)) <= ALCANCE_GRUPO);
    },

    /** ¿Van juntos? (los del mismo grupo no se ponen calavera al pegarse por error). */
    sameParty(a, b) {
        return !!(a && b && a.partyLeaderId && a.partyLeaderId === b.partyLeaderId);
    },

    // -----------------------------------------------------------------------
    // Calaveras (PvP)
    // -----------------------------------------------------------------------

    /** La calavera de un jugador: '', 'blanca' o 'roja' (caducada, ''). */
    skullOf(player) {
        if (!player || !player.skull) {
            return '';
        }
        if (player.skullUntil && this.now() >= player.skullUntil) {
            player.skull = '';
            player.skullUntil = 0;
            this.emit('onSkullChange', player);
            return '';
        }
        return player.skull;
    },

    /**
     * UN JUGADOR ATACA A OTRO. Si el otro no lleva calavera (y no van juntos), el que ataca se
     * pone la blanca (o la renueva): es lo que avisa a los demás de que ese jugador es peligroso.
     */
    notePvpAttack(attacker, target) {
        if (!attacker || !target || attacker === target || this.sameParty(attacker, target)) {
            return;
        }
        if (this.skullOf(target)) {
            return;   // pegar a quien lleva calavera está justificado
        }
        if (this.skullOf(attacker) !== 'roja') {
            const nueva = attacker.skull !== 'blanca';
            attacker.skull = 'blanca';
            attacker.skullUntil = this.now() + DURA_CALAVERA_BLANCA;
            if (nueva) {
                this.emit('onSkullChange', attacker);
            }
        }
    },

    /** UN JUGADOR MATA A OTRO sin calavera: muerte injusta. Demasiadas en 24 h, calavera roja. */
    notePvpKill(killer, victim) {
        if (!killer || !victim || killer === victim || this.sameParty(killer, victim) || this.skullOf(victim)) {
            return;
        }
        const ahora = this.now();
        killer.unjustifiedKills = (killer.unjustifiedKills || []).filter((t) => ahora - t < DURA_CALAVERA_ROJA);
        killer.unjustifiedKills.push(ahora);
        if (killer.unjustifiedKills.length >= (this.redSkullKills || MUERTES_PARA_ROJA)) {
            killer.skull = 'roja';
            killer.skullUntil = ahora + DURA_CALAVERA_ROJA;
            this.emit('onSkullChange', killer);
            this.sendTextMessage(killer.id, 'Llevas la calavera roja: has matado a demasiados inocentes.');
        }
    },

    // -----------------------------------------------------------------------
    // Mensajes privados
    // -----------------------------------------------------------------------

    /** Un jugador conectado por su nombre (sin mayúsculas), o null. */
    playerByName(name) {
        const buscado = String(name || '').trim().toLowerCase();
        for (const player of this.players.values()) {
            if (player.name.toLowerCase() === buscado) {
                return player;
            }
        }
        return null;
    },

    /**
     * Un mensaje privado (canal 'privado') o al grupo (canal 'grupo'). La capa de red lo entrega.
     * @returns {{ok: boolean, reason?: string, to?: Array}}
     */
    sendPrivateMessage(from, toName, text, canal) {
        const texto = String(text || '').slice(0, 255).trim();
        if (!texto) {
            return { ok: false, reason: 'empty' };
        }
        if (canal === 'grupo') {
            const grupo = this.partyOf(from);
            if (!grupo) {
                return { ok: false, reason: 'notInParty' };
            }
            grupo.members.forEach((m) => this.emit('onPrivateMessage', m, from.name, texto, 'grupo'));
            return { ok: true, to: grupo.members };
        }
        const destino = this.playerByName(toName);
        if (!destino) {
            return { ok: false, reason: 'notOnline' };
        }
        this.emit('onPrivateMessage', destino, from.name, texto, 'privado');
        return { ok: true, to: [destino] };
    },

    // -----------------------------------------------------------------------
    // Depósito
    // -----------------------------------------------------------------------

    /**
     * EL DEPÓSITO DE UN JUGADOR: un contenedor que sólo es suyo, el mismo en cualquier cofre de
     * depósito. Por dentro es un objeto contenedor (así sirven la ventana, arrastrar y coger) sin
     * casilla propia: toma la del cofre que se abrió, para que «estar al lado» funcione.
     * Lo que hay dentro se guarda con el personaje (`player.deposito`).
     */
    depotOf(player, cofre) {
        if (!player.depotItem) {
            const def = this.itemTypes.get(cofre ? cofre.typeId : 0) || this.itemTypes.get(this.depotItemId);
            if (!def) {
                return null;
            }
            const deposito = new Item(def, { count: 1 });
            deposito.instanceId = this._allocateItemId();
            deposito.attributes = { ...(deposito.attributes || {}), containerSize: HUECOS_DEPOSITO, depot: 1 };
            deposito.isDepot = true;
            deposito.ownerId = player.id;
            deposito.contents = [];
            (player.deposito || []).forEach((guardado) => {
                const dentro = this.addToGroundContainer(deposito, guardado.typeId, guardado.count);
                if (dentro && guardado.attributes) {
                    dentro.attributes = { ...guardado.attributes };
                }
            });
            this.items.set(deposito.instanceId, deposito);
            player.depotItem = deposito;
        }
        if (cofre && cofre.position) {
            player.depotItem.position = cofre.position;
        }
        return player.depotItem;
    },

    /** Lo que hay en el depósito, listo para guardar (lo llama el repositorio al guardar). */
    depotSnapshot(player) {
        if (!player.depotItem) {
            return player.deposito || [];
        }
        player.deposito = this.contentsOfItem(player.depotItem).map((item) => ({
            typeId: item.typeId,
            count: item.count,
            attributes: item.attributes && Object.keys(item.attributes).length ? { ...item.attributes } : null
        }));
        return player.deposito;
    },

    /** ¿Es un cofre de depósito? (el objeto de `depotItemId`, o uno con el atributo `depot`). */
    isDepot(item) {
        return !!(item && (item.typeId === this.depotItemId ||
            (item.attributes && Number(item.attributes.depot) === 1)));
    },

    /** Al salir, el depósito se olvida del mundo (sus objetos se guardan en `player.deposito`). */
    forgetDepot(player) {
        if (player && player.depotItem) {
            this.depotSnapshot(player);
            this.contentsOfItem(player.depotItem).forEach((item) => this.items.delete(item.instanceId));
            this.items.delete(player.depotItem.instanceId);
            player.depotItem = null;
        }
    },

    /** La entrada `index` del inventario de un jugador (para usarla), o null. */
    inventoryEntry(player, index) {
        const entry = player && player.inventory ? player.inventory[Number(index)] : null;
        return entry || null;
    }
};

module.exports = { extras, HUECOS_DEPOSITO, SLOT_INSIDE };
