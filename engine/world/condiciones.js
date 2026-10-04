'use strict';

/**
 * LAS CONDICIONES: lo que le pasa a una criatura durante un rato, las «conditions» de TFS.
 *
 *   - de DAÑO cada cierto tiempo: veneno, fuego, energía, sangrado (cada golpe con su efecto);
 *   - de CURA cada cierto tiempo: regeneración (la de la comida, la de un hechizo);
 *   - de VELOCIDAD durante un tiempo: prisa (`utani hur`) y parálisis;
 *   - de LUZ durante un tiempo: `utevo lux`.
 *
 * Se las ponen los scripts (`player.addCondition({...})`, `Game.addCondition`) o los hechizos, y
 * el mundo las hace correr en cada tick. Una condición del mismo tipo SUSTITUYE a la que hubiera
 * (no se acumulan dos venenos), como en Tibia.
 *
 * Una condición es:
 *
 *     { type: 'veneno', ticks: 10, interval: 2000, value: 5, attacker }   // 5 de daño, 10 veces
 *     { type: 'regeneracion', ticks: 30, interval: 1000, value: 2 }      // +2 de vida cada segundo
 *     { type: 'prisa', duration: 10000, value: 60 }                      // +60 de velocidad 10 s
 *     { type: 'luz', duration: 60000, value: 6 }                         // 6 casillas de luz 1 min
 *
 * Los nombres en inglés de TFS también valen: poison, fire, energy, bleeding, regeneration,
 * haste, paralyze, light.
 */

const { EFECTO } = require('../../shared/js/efectos.mjs');

/** Cada tipo: su elemento (para las resistencias) y el efecto que se ve en cada golpe. */
const TIPOS = {
    veneno: { clase: 'dano', elemento: 'earth', efecto: EFECTO.TIERRA },
    fuego: { clase: 'dano', elemento: 'fire', efecto: EFECTO.FUEGO },
    energia: { clase: 'dano', elemento: 'energy', efecto: EFECTO.ENERGIA },
    sangrado: { clase: 'dano', elemento: 'physical', efecto: EFECTO.SANGRE },
    regeneracion: { clase: 'cura' },
    prisa: { clase: 'velocidad', signo: 1 },
    paralisis: { clase: 'velocidad', signo: -1, efecto: EFECTO.POFF },
    luz: { clase: 'luz' }
};

const ALIAS = {
    poison: 'veneno', fire: 'fuego', energy: 'energia', bleeding: 'sangrado',
    regeneration: 'regeneracion', haste: 'prisa', paralyze: 'paralisis', light: 'luz'
};

function tipoDe(nombre) {
    const t = String(nombre || '').toLowerCase();
    return TIPOS[t] ? t : (ALIAS[t] || null);
}

class Condiciones {
    constructor(options) {
        this.world = options.world;
        /** Las criaturas que tienen alguna condición: no se recorre el mundo entero cada tick. */
        this.conAlguna = new Set();
    }

    /**
     * Pone una condición. Devuelve false si el tipo no existe o la criatura ya no está.
     */
    add(creature, condicion) {
        const c = condicion || {};
        const tipo = tipoDe(c.type);
        if (!tipo || !creature || (creature.isDead && creature.isDead())) {
            return false;
        }
        const def = TIPOS[tipo];
        const ahora = this.world.now();
        const entrada = {
            type: tipo,
            value: Math.trunc(Number(c.value) || 0),
            interval: Math.max(100, Number(c.interval) || 1000),
            ticks: Math.max(1, Math.trunc(Number(c.ticks) || 1)),
            hasta: ahora + Math.max(0, Number(c.duration) || 0),
            proximo: ahora + Math.max(100, Number(c.interval) || 1000),
            attackerId: c.attacker ? (c.attacker.id || c.attacker.getId && c.attacker.getId()) : null
        };
        if (!Array.isArray(creature.condiciones)) {
            creature.condiciones = [];
        }
        this._quitar(creature, tipo);
        creature.condiciones.push(entrada);
        this.conAlguna.add(creature);

        if (def.clase === 'velocidad') {
            this._velocidad(creature);
        } else if (def.clase === 'luz') {
            this.world.emit('onLightChange', creature);
        }
        if (def.efecto && def.clase === 'velocidad') {
            this.world.sendMagicEffect(creature.position, def.efecto);
        }
        return true;
    }

    /** Quita una condición (o todas, sin tipo). */
    remove(creature, nombre) {
        if (!creature || !Array.isArray(creature.condiciones)) {
            return false;
        }
        const tipo = nombre === undefined ? null : tipoDe(nombre);
        const antes = creature.condiciones.length;
        if (tipo) {
            this._quitar(creature, tipo);
        } else {
            creature.condiciones = [];
        }
        this._velocidad(creature);
        this.world.emit('onLightChange', creature);
        return creature.condiciones.length !== antes;
    }

    has(creature, nombre) {
        const tipo = tipoDe(nombre);
        return !!(creature && Array.isArray(creature.condiciones) && creature.condiciones.some((c) => c.type === tipo));
    }

    /** Lo que queda de una condición, para un script: `{ type, value, ticks, ms }` o null. */
    get(creature, nombre) {
        const tipo = tipoDe(nombre);
        const c = creature && Array.isArray(creature.condiciones) ? creature.condiciones.find((x) => x.type === tipo) : null;
        if (!c) {
            return null;
        }
        return { type: c.type, value: c.value, ticks: c.ticks, ms: Math.max(0, c.hasta - this.world.now()) };
    }

    /** La luz que lleva una criatura por sus condiciones (`utevo lux`), en casillas. */
    luzDe(creature) {
        const c = creature && Array.isArray(creature.condiciones) ? creature.condiciones.find((x) => x.type === 'luz') : null;
        return c ? c.value : 0;
    }

    _quitar(creature, tipo) {
        creature.condiciones = creature.condiciones.filter((c) => c.type !== tipo);
    }

    /** La velocidad: la base, más lo de `addSpeedBonus`, más la prisa, menos la parálisis. */
    _velocidad(creature) {
        if (creature.baseSpeed === undefined) {
            creature.baseSpeed = creature.speed;
        }
        const porCondicion = (creature.condiciones || []).reduce((total, c) => {
            const def = TIPOS[c.type];
            return def.clase === 'velocidad' ? total + def.signo * Math.abs(c.value) : total;
        }, 0);
        creature.condSpeed = porCondicion;
        creature.speed = Math.max(40, creature.baseSpeed + (creature.speedBonus || 0) + porCondicion);
    }

    /** Un paso del reloj: golpea, cura y caduca lo que toque. Lo llama el mundo en cada tick. */
    tick(ahora) {
        this.conAlguna.forEach((creature) => {
            if (!Array.isArray(creature.condiciones) || creature.condiciones.length === 0 ||
                (creature.isDead && creature.isDead()) || !this.world.getCreature(creature.id)) {
                creature.condiciones = [];
                this.conAlguna.delete(creature);
                return;
            }
            let cambioVelocidad = false;
            let cambioLuz = false;
            creature.condiciones.slice().forEach((c) => {
                const def = TIPOS[c.type];
                if (def.clase === 'velocidad' || def.clase === 'luz') {
                    if (ahora >= c.hasta) {
                        this._quitar(creature, c.type);
                        cambioVelocidad = cambioVelocidad || def.clase === 'velocidad';
                        cambioLuz = cambioLuz || def.clase === 'luz';
                    }
                    return;
                }
                if (ahora < c.proximo) {
                    return;
                }
                c.proximo = ahora + c.interval;
                c.ticks -= 1;
                if (def.clase === 'dano') {
                    const atacante = c.attackerId ? this.world.getCreature(c.attackerId) : null;
                    if (this.world.combat) {
                        this.world.combat.applyDamage(creature, Math.abs(c.value), {
                            attacker: atacante, element: def.elemento, ignoreArmor: true, effect: def.efecto
                        });
                    }
                } else if (def.clase === 'cura') {
                    this.world.healCreature(creature, Math.abs(c.value));
                }
                if (c.ticks <= 0) {
                    this._quitar(creature, c.type);
                }
            });
            if (cambioVelocidad) {
                this._velocidad(creature);
            }
            if (cambioLuz) {
                this.world.emit('onLightChange', creature);
            }
            if (!creature.condiciones || creature.condiciones.length === 0) {
                this.conAlguna.delete(creature);
            }
        });
    }
}

module.exports = { Condiciones, TIPOS_DE_CONDICION: TIPOS, tipoDeCondicion: tipoDe };
