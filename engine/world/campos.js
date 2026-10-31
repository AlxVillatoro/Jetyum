'use strict';

/**
 * LOS CAMPOS: fuego, energía, veneno y el muro mágico, como en TFS.
 *
 * Un campo es un OBJETO del suelo con `fieldType` en items.xml (`fire`, `energy`, `poison` o
 * `magicwall`) y `fieldDamage`: lo que hace al pisarlo, o al caerle encima a quien ya estaba. Se
 * deshace solo (`duration` y `decayTo`: el fuego grande pasa a mediano, a pequeño y se apaga).
 *
 *   - FUEGO: `fieldDamage` de fuego y te deja ardiendo (la condición `fuego`).
 *   - ENERGÍA: `fieldDamage` de energía y te deja electrificado (`energia`).
 *   - VENENO: te envenena (`veneno`), empezando por `fieldDamage`.
 *   - MURO MÁGICO: no hace daño; no se puede atravesar ni disparar a través (`blocksSolid`,
 *     `blocksProjectile`).
 *
 * Los crean las runas (`Game.createField`, data/scripts/spells/runas.js) y los quita «destroy field»
 * (`Game.removeFields`). NO SE CREAN EN UNA ZONA DE PROTECCIÓN, ni en una casilla que no se pueda
 * pisar; un muro mágico, tampoco donde haya alguien. Los monstruos los rodean, salvo los que pueden
 * pisarlos (`canWalkOnFire`, `canWalkOnEnergy`, `canWalkOnPoison`) o son inmunes a ese elemento.
 *
 * Se mezcla en `World` igual que `extras.js` y `reglas.js`.
 */

/** Lo que deja cada campo al pisarlo: el elemento del golpe y la condición. */
const CAMPO = {
    fire: { elemento: 'fire', condicion: { type: 'fuego', ticks: 7, interval: 4000, value: 10 }, puede: 'canWalkOnFire' },
    energy: { elemento: 'energy', condicion: { type: 'energia', ticks: 3, interval: 4000, value: 25 }, puede: 'canWalkOnEnergy' },
    poison: { elemento: null, condicion: { type: 'veneno', ticks: 10, interval: 4000 }, puede: 'canWalkOnPoison' },
    magicwall: { elemento: null, condicion: null, puede: null }
};

const campos = {
    /** El tipo de campo de un objeto (`fire`, `energy`, `poison`, `magicwall`) o null. */
    fieldTypeOf(item) {
        const tipo = item && item.getAttribute ? item.getAttribute('fieldType') : null;
        return tipo && CAMPO[String(tipo).toLowerCase()] ? String(tipo).toLowerCase() : null;
    },

    /** Los campos que hay en una casilla. */
    fieldsAt(tile) {
        return tile ? tile.getItems().filter((item) => this.fieldTypeOf(item)) : [];
    },

    /**
     * CREA UN CAMPO (el objeto `typeId`) en `pos`. Si ya había uno, lo sustituye. `creador` es quien
     * lo lanza: el daño que haga cuenta como suyo (combate, calaveras).
     *
     * @returns {Object|null} el objeto, o null si ahí no se puede
     */
    createField(typeId, pos, creador) {
        const def = this.itemTypes.get(Number(typeId));
        const tipo = def && def.attributes ? String(def.attributes.fieldType || '').toLowerCase() : '';
        if (!CAMPO[tipo] || !pos) {
            return null;
        }
        // Una casilla con sólo el suelo de la planta no existe como objeto hasta que se le pone algo.
        const tile = this.map.isWalkable(pos.x, pos.y, pos.z) ? this.map.getOrCreateTile(pos.x, pos.y, pos.z) : null;
        if (!tile || tile.isProtectionZone()) {
            return null;
        }
        if (tipo === 'magicwall' && tile.creatures.length > 0) {
            return null;
        }
        this.fieldsAt(tile).forEach((viejo) => this.removeItem(viejo.instanceId));
        const item = this.createItem(Number(typeId), 1, pos);
        if (!item) {
            return null;
        }
        if (creador && creador.id) {
            item.setAttribute('ownerId', creador.id);
        }
        this.startDecay(item);
        // A quien ya estaba en la casilla también le alcanza.
        tile.creatures.slice().forEach((c) => this.stepOnField(c, tile));
        return item;
    },

    /** QUITA los campos de fuego, energía y veneno de una casilla («destroy field»). El muro, no. */
    removeFields(pos) {
        const tile = pos ? this.map.getTile(pos.x, pos.y, pos.z) : null;
        let quitados = 0;
        this.fieldsAt(tile).forEach((item) => {
            if (this.fieldTypeOf(item) !== 'magicwall') {
                this.removeItem(item.instanceId);
                quitados += 1;
            }
        });
        return quitados;
    },

    /** ¿Puede ese monstruo pisar ese campo sin que le importe? (para que la IA lo rodee). */
    monsterIgnoresField(monster, item) {
        const tipo = this.fieldTypeOf(item);
        const regla = CAMPO[tipo];
        if (!regla || tipo === 'magicwall') {
            return false;
        }
        const def = monster.monsterType || {};
        if (regla.puede && def.flags && def.flags[regla.puede] === true) {
            return true;
        }
        const inmunes = Array.isArray(def.immunities) ? def.immunities.map((i) => String(i && i.type).toLowerCase()) : [];
        return regla.elemento ? inmunes.includes(regla.elemento) : inmunes.includes('poison') || inmunes.includes('earth');
    },

    /** ¿Hay en esa casilla un campo que ese monstruo prefiera no pisar? */
    monsterAvoidsTile(monster, x, y, z) {
        const tile = this.map.getTile(x, y, z);
        return this.fieldsAt(tile).some((item) => !this.monsterIgnoresField(monster, item));
    },

    /**
     * ALGUIEN PISA UNA CASILLA CON CAMPO (o le cae encima): el golpe y la condición. En una zona de
     * protección no hay campos, pero por si acaso no se hiere a nadie que esté en una.
     */
    stepOnField(creature, tile) {
        if (!creature || creature.isDead() || !tile || tile.isProtectionZone()) {
            return false;
        }
        const campo = this.fieldsAt(tile)[0];
        const tipo = this.fieldTypeOf(campo);
        const regla = CAMPO[tipo];
        if (!regla || tipo === 'magicwall' || (creature.kind === 'npc')) {
            return false;
        }
        const dueno = campo.getAttribute('ownerId') ? this.getCreature(Number(campo.getAttribute('ownerId'))) : null;
        const atacante = dueno && dueno !== creature && !(this.combatBlocked && this.combatBlocked(dueno, creature)) ? dueno : null;
        if (dueno && !atacante && dueno !== creature && this.combatBlocked && this.combatBlocked(dueno, creature)) {
            return false;   // el PvP no lo permite: el campo de otro jugador no te hace nada
        }
        const dano = Math.max(0, Number(campo.getAttribute('fieldDamage')) || 0);
        if (regla.elemento && dano > 0 && this.combat) {
            this.combat.applyDamage(creature, dano, { attacker: atacante, element: regla.elemento, ignoreArmor: true });
        }
        if (regla.condicion && this.condiciones && !creature.isDead()) {
            const valor = regla.condicion.value || dano || 5;
            this.condiciones.add(creature, { ...regla.condicion, value: valor, attacker: atacante });
        }
        return true;
    }
};

module.exports = { campos, CAMPO };
