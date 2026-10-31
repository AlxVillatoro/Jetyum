'use strict';

/**
 * LO QUE HACE UN MONSTRUO ADEMÁS DE PEGAR, como en TFS: sus HECHIZOS (todos los `attacks` de su ficha
 * que no son el cuerpo a cuerpo), sus DEFENSAS (curarse, acelerarse), sus FRASES (`voices`) y CAMBIAR
 * DE OBJETIVO (`changeTarget`). Lo llama la IA (`ai.js`) en cada turno; moverse, perseguir, mantener
 * la distancia y huir siguen siendo cosa de la IA.
 *
 * UN ATAQUE DE LA FICHA, con los nombres de TFS:
 *
 *   name        'melee' (el cuerpo a cuerpo, que resuelve el combate), un ELEMENTO ('physical', 'fire',
 *               'energy', 'earth' o 'poison', 'ice', 'holy', 'death'), 'lifedrain' (cura al monstruo lo
 *               que quita), 'manadrain' (quita maná), 'speed' (paraliza: `speedChange` negativo) o
 *               'healing' (se cura a sí mismo; también vale en `defenses.list`)
 *   interval    cada cuánto lo intenta (ms) — cada ataque lleva su propio reloj
 *   chance      probabilidad (%) cada vez que le toca
 *   minDamage, maxDamage   el daño (negativo, como en TFS: se toma el valor absoluto)
 *   range       a cuántas casillas del objetivo puede lanzarlo (7 si no se dice)
 *   radius      un ÁREA redonda de ese radio: alrededor del monstruo o, con `target: true`, del objetivo
 *   length      un RAYO de ese largo hacia el objetivo; con `spread` > 0, una ONDA que se abre
 *   shootEffect el proyectil que vuela hasta el objetivo ('fire', 'energy', 'spear', 'smallstone'…)
 *   effect      el efecto en cada casilla alcanzada (por defecto, el del elemento)
 *   condition   una condición que deja a quien alcanza (`{ type: 'veneno', ticks, interval, value }`)
 *   speedChange, duration   para 'speed' (y para una defensa de prisa)
 *
 * LOS HECHIZOS SÓLO ALCANZAN A JUGADORES: en TFS los monstruos no se hacen daño entre ellos. Y pasan
 * por las reglas del mundo (`reglas.js`): en una zona de protección no alcanzan a nadie. Necesitan
 * VER al objetivo: una pared en medio corta el hechizo (`areas.js`, `lineaDeVision`).
 */

const { AREA, lineaDeVision, direccionHacia } = require('./areas');
const { EFECTO, EFECTO_DE_ELEMENTO, PROYECTIL } = require('../../shared/js/efectos.mjs');

/** Los nombres de ataque que son un elemento, y a cuál corresponden. */
const ELEMENTO_DE = {
    physical: 'physical', fire: 'fire', energy: 'energy', earth: 'earth', poison: 'earth', ice: 'ice',
    holy: 'holy', death: 'death', lifedrain: 'lifedrain', manadrain: 'manadrain', drown: 'physical'
};

/** Proyectiles por nombre (los de TFS que tienen dibujo aquí). */
const PROYECTIL_DE = {
    spear: PROYECTIL.LANZA, arrow: PROYECTIL.FLECHA, bolt: PROYECTIL.VIROTE, fire: PROYECTIL.FUEGO,
    energy: PROYECTIL.FLECHA_LIGERA, poison: PROYECTIL.VENENO, poisonarrow: PROYECTIL.FLECHA_VENENOSA,
    ice: PROYECTIL.HIELO, snowball: PROYECTIL.HIELO, earth: PROYECTIL.TIERRA, smallstone: PROYECTIL.PIEDRA,
    largerock: PROYECTIL.ROCA, throwingstar: PROYECTIL.ESTRELLA, throwingknife: PROYECTIL.CUCHILLO,
    explosion: PROYECTIL.BOLA_FUEGO, death: PROYECTIL.FUEGO, holy: PROYECTIL.FLECHA_LIGERA
};

const EFECTO_EXTRA = { lifedrain: EFECTO.SANGRE, manadrain: EFECTO.MAGIA_AZUL, speed: EFECTO.POFF, healing: EFECTO.MAGIA_AZUL };

const nombreDe = (a) => String((a && a.name) || '').toLowerCase();
const esCuerpoACuerpo = (a) => nombreDe(a) === 'melee';
const esCuracion = (a) => ['healing', 'heal'].includes(nombreDe(a));
const esVelocidad = (a) => ['speed', 'paralyze', 'haste'].includes(nombreDe(a));

/** Un número de efecto o de proyectil: el que se dé, o por su nombre, o el de por defecto. */
function efectoDe(valor, porDefecto) {
    if (valor === undefined || valor === null || valor === '') {
        return porDefecto;
    }
    const n = Number(valor);
    if (Number.isFinite(n)) {
        return n;
    }
    const clave = String(valor).toUpperCase();
    return EFECTO[clave] || porDefecto;
}

function proyectilDe(valor) {
    if (valor === undefined || valor === null || valor === '') {
        return 0;
    }
    const n = Number(valor);
    if (Number.isFinite(n)) {
        return n;
    }
    return PROYECTIL_DE[String(valor).toLowerCase()] || 0;
}

class HechizosDeMonstruo {
    constructor(options) {
        const opts = options || {};
        this.world = opts.world;
        this.combat = opts.combat;
        this.random = opts.random || Math.random;
        this.stats = { hechizos: 0, curas: 0, frases: 0, cambios: 0 };
    }

    /** Los ataques de la ficha que NO son el cuerpo a cuerpo ni curaciones: los hechizos. */
    hechizosDe(monstruo) {
        const def = monstruo.monsterType || {};
        return (def.attacks || []).filter((a) => !esCuerpoACuerpo(a) && !esCuracion(a));
    }

    /** Las defensas: las curaciones de `attacks` (fichas antiguas) y la lista `defenses.list`. */
    defensasDe(monstruo) {
        const def = monstruo.monsterType || {};
        const lista = (def.attacks || []).filter(esCuracion);
        const defensas = def.defenses && Array.isArray(def.defenses.list) ? def.defenses.list : [];
        return lista.concat(defensas);
    }

    /** ¿Le toca a ese ataque? Cada uno lleva su reloj y su probabilidad. */
    _leToca(monstruo, clave, entrada, ahora) {
        monstruo.relojes = monstruo.relojes || {};
        if (ahora < (monstruo.relojes[clave] || 0)) {
            return false;
        }
        monstruo.relojes[clave] = ahora + Math.max(200, Number(entrada.interval) || 2000);
        const chance = entrada.chance === undefined ? 100 : Number(entrada.chance);
        return this.random() * 100 < chance;
    }

    // -----------------------------------------------------------------------
    // Frases y cambiar de objetivo
    // -----------------------------------------------------------------------

    /** Dice una de sus frases (`voices`), de vez en cuando. */
    hablar(monstruo, ahora) {
        const voces = monstruo.monsterType && monstruo.monsterType.voices;
        if (!voces || !Array.isArray(voces.lines) || voces.lines.length === 0) {
            return null;
        }
        if (!this._leToca(monstruo, 'voces', { interval: voces.interval || 5000, chance: voces.chance || 10 }, ahora)) {
            return null;
        }
        const linea = voces.lines[Math.floor(this.random() * voces.lines.length)];
        const texto = typeof linea === 'string' ? linea : linea && linea.text;
        if (!texto) {
            return null;
        }
        this.world.creatureSay(monstruo.id, texto);
        this.stats.frases += 1;
        return texto;
    }

    /**
     * CAMBIA DE OBJETIVO (`changeTarget: { interval, chance }`): de vez en cuando se va a por otro
     * jugador que también tenga a la vista. Devuelve el nuevo, o null si sigue con el mismo.
     */
    cambiarObjetivo(monstruo, actual, candidatos, ahora) {
        const regla = monstruo.monsterType && monstruo.monsterType.changeTarget;
        if (!regla || !actual || candidatos.length < 2) {
            return null;
        }
        if (!this._leToca(monstruo, 'cambio', regla, ahora)) {
            return null;
        }
        const otros = candidatos.filter((c) => c !== actual);
        const nuevo = otros[Math.floor(this.random() * otros.length)] || null;
        if (nuevo) {
            this.stats.cambios += 1;
        }
        return nuevo;
    }

    // -----------------------------------------------------------------------
    // Defensas
    // -----------------------------------------------------------------------

    /** Se cura o se acelera, si le toca. Devuelve lo que hizo, o null. */
    defenderse(monstruo, ahora) {
        const lista = this.defensasDe(monstruo);
        for (let i = 0; i < lista.length; i += 1) {
            const d = lista[i];
            if (!this._leToca(monstruo, 'defensa' + i, d, ahora)) {
                continue;
            }
            if (esCuracion(d)) {
                if (monstruo.health >= monstruo.maxHealth) {
                    continue;
                }
                const cantidad = this._cantidad(d);
                this.world.healCreature(monstruo, cantidad);
                this.world.sendMagicEffect(monstruo.position, efectoDe(d.effect, EFECTO.MAGIA_AZUL));
                this.stats.curas += 1;
                return { tipo: 'curacion', cantidad };
            }
            if (esVelocidad(d) && Number(d.speedChange) > 0 && this.world.condiciones) {
                this.world.condiciones.add(monstruo, { type: 'prisa', value: Number(d.speedChange),
                    duration: Number(d.duration) || 5000, ticks: 1, interval: Number(d.duration) || 5000 });
                this.world.sendMagicEffect(monstruo.position, efectoDe(d.effect, EFECTO.MAGIA_AZUL));
                return { tipo: 'prisa' };
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // Hechizos
    // -----------------------------------------------------------------------

    /**
     * Lanza los hechizos que le toquen contra `objetivo`. Uno por turno como mucho, como el
     * `Monster::onThinkTarget` de TFS: así un monstruo no suelta tres bolas de fuego de golpe.
     *
     * @returns {Object|null} lo que lanzó: `{ nombre, alcanzados }`
     */
    atacar(monstruo, objetivo, ahora) {
        if (!objetivo || objetivo.isDead()) {
            return null;
        }
        const lista = this.hechizosDe(monstruo);
        for (let i = 0; i < lista.length; i += 1) {
            const a = lista[i];
            const alcance = a.range !== undefined ? Number(a.range)
                : (a.length ? Number(a.length) : (a.radius && !a.target ? Number(a.radius) : 7));
            const distancia = monstruo.position.distanceTo(objetivo.position);
            if (monstruo.position.z !== objetivo.position.z || distancia > alcance) {
                continue;
            }
            if (!lineaDeVision(this.world.map, monstruo.position, objetivo.position)) {
                continue;
            }
            if (!this._leToca(monstruo, 'hechizo' + i, a, ahora)) {
                continue;
            }
            return this.lanzar(monstruo, a, objetivo);
        }
        return null;
    }

    /** Las casillas que alcanza un hechizo. */
    casillasDe(monstruo, a, objetivo) {
        const desde = monstruo.position;
        if (a.length) {
            const dir = direccionHacia(desde, objetivo.position);
            const forma = Number(a.spread) > 0 ? AREA.onda(dir, Number(a.length)) : AREA.rayo(dir, Number(a.length));
            return forma.map((d) => ({ x: desde.x + d.x, y: desde.y + d.y, z: desde.z }));
        }
        if (a.radius) {
            const centro = a.target === false || (a.target === undefined && a.range === 0) ? desde : objetivo.position;
            return AREA.circulo(Number(a.radius)).map((d) => ({ x: centro.x + d.x, y: centro.y + d.y, z: centro.z }));
        }
        return [{ x: objetivo.position.x, y: objetivo.position.y, z: objetivo.position.z }];
    }

    _cantidad(a) {
        const min = Math.abs(Number(a.minDamage) || 0);
        const max = Math.abs(Number(a.maxDamage === undefined ? min : a.maxDamage) || 0);
        const bajo = Math.min(min, max);
        const alto = Math.max(min, max);
        return bajo + Math.floor(this.random() * (alto - bajo + 1));
    }

    /** Lanza un hechizo: el proyectil, el efecto en cada casilla y el daño a los jugadores alcanzados. */
    lanzar(monstruo, a, objetivo) {
        const nombre = nombreDe(a);
        const elemento = ELEMENTO_DE[nombre] || null;
        const proyectil = proyectilDe(a.shootEffect);
        const area = !!(a.length || a.radius);

        // El proyectil vuela al objetivo (o al centro del área).
        if (proyectil && !a.length) {
            this.world.sendDistanceEffect(monstruo.position, objetivo.position, proyectil);
        }

        const efecto = efectoDe(a.effect, EFECTO_DE_ELEMENTO[elemento] || EFECTO_EXTRA[nombre] || EFECTO.GOLPE);
        const alcanzados = [];
        this.casillasDe(monstruo, a, objetivo).forEach((pos) => {
            const tile = this.world.map.getTile(pos.x, pos.y, pos.z);
            if (area && (!tile || tile.hasProjectileBlocker() || !lineaDeVision(this.world.map, monstruo.position, pos))) {
                return;
            }
            if (area && efecto) {
                this.world.sendMagicEffect(pos, efecto);
            }
            (tile ? tile.creatures.slice() : []).forEach((c) => {
                if (!(c.isPlayer && c.isPlayer()) || c.isDead() || alcanzados.includes(c)) {
                    return;
                }
                if (this.world.combatBlocked && this.world.combatBlocked(monstruo, c)) {
                    return;
                }
                alcanzados.push(c);
                this._alcanzar(monstruo, a, nombre, elemento, c, area ? 0 : efecto);
            });
        });
        this.stats.hechizos += 1;
        return { nombre, alcanzados: alcanzados.map((c) => c.id) };
    }

    /** Lo que le pasa a un jugador alcanzado. */
    _alcanzar(monstruo, a, nombre, elemento, jugador, efecto) {
        if (esVelocidad(a)) {
            // Paraliza (o ralentiza) lo que diga `speedChange`, durante `duration`.
            if (this.world.condiciones) {
                const duracion = Number(a.duration) || 10000;
                this.world.condiciones.add(jugador, { type: 'paralisis', value: Math.abs(Number(a.speedChange) || 100),
                    duration: duracion, ticks: 1, interval: duracion, attacker: monstruo });
            }
            this.world.sendMagicEffect(jugador.position, efectoDe(a.effect, EFECTO.POFF));
            if (this.world.noteCombat) {
                this.world.noteCombat(monstruo, jugador);
            }
            return;
        }
        const resultado = this.combat.applyDamage(jugador, this._cantidad(a), {
            attacker: monstruo,
            element: elemento && elemento !== 'physical' ? elemento : null,
            // La magia no la para la armadura; un golpe físico a distancia (una piedra), sí.
            ignoreArmor: !!elemento && elemento !== 'physical',
            effect: efecto
        });
        if (a.condition && resultado.hit && resultado.damage > 0 && !resultado.killed && this.world.condiciones) {
            this.world.condiciones.add(jugador, { ...a.condition, attacker: monstruo });
        }
    }
}

module.exports = { HechizosDeMonstruo, ELEMENTO_DE, esCuerpoACuerpo, esCuracion };
