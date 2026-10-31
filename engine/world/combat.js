'use strict';

const { EFECTO, EFECTO_DE_ELEMENTO, PROYECTIL } = require('../../shared/js/efectos.mjs');

/**
 * Combate.
 *
 * El SISTEMA es fiel a Tibia: los ataques se declaran en la definición del
 * monstruo con su alcance, su probabilidad y su intervalo; las resistencias
 * elementales se declaran por tipo y porcentaje; la muerte reparte botín y
 * experiencia. Todo eso está verificado en la estructura real de las definiciones
 * (`monster.attacks`, `monster.elements`, `monster.defenses`, `monster.loot`).
 *
 * La FÓRMULA de daño NO está verificada contra el código de TFS, y se dice en voz
 * alta en vez de disimularlo. Está aislada en `DEFAULT_FORMULAS` y el motor la
 * acepta inyectada, así que sustituirla por la real es cambiar un objeto, no
 * tocar el combate. Mientras tanto, la forma es la correcta: daño base del
 * atacante, menos reducción por armadura del objetivo, ajustado por su
 * resistencia elemental.
 *
 * Los porcentajes elementales se leen como en Tibia:
 *   percent = 100   -> inmune (el daño se anula)
 *   percent = 25    -> resistente, un 25% menos
 *   percent = -12   -> débil, un 12% MÁS de daño
 */

const { levelForExperience, experienceToNextLevel, applyExperienceStages } =
    require('./experience');
const Vocacion = require('./vocacion');
const { VOCACION_BASE } = require('../data/definiciones');

/** Probabilidad de botín expresada sobre 100.000, como en Tibia. */
const LOOT_CHANCE_BASE = 100000;

/** El `shootEffect` de un ataque de monstruo (como en TFS: 'arrow', 'fire'...) a su proyectil. */
const PROYECTIL_POR_NOMBRE = {
    spear: PROYECTIL.LANZA, arrow: PROYECTIL.FLECHA, bolt: PROYECTIL.VIROTE, fire: PROYECTIL.FUEGO,
    energy: PROYECTIL.FLECHA_LIGERA, poison: PROYECTIL.VENENO, poisonarrow: PROYECTIL.FLECHA_VENENOSA,
    ice: PROYECTIL.HIELO, snowball: PROYECTIL.HIELO, earth: PROYECTIL.TIERRA, smallstone: PROYECTIL.PIEDRA,
    largerock: PROYECTIL.ROCA, throwingstar: PROYECTIL.ESTRELLA, throwingknife: PROYECTIL.CUCHILLO,
    explosion: PROYECTIL.BOLA_FUEGO
};

/**
 * Fórmulas por defecto.
 *
 * Inyectables a propósito: son la parte que hay que sustituir cuando se verifique
 * la de TFS, y tenerlas aparte evita que ese cambio toque la lógica de combate.
 */
const DEFAULT_FORMULAS = {

    /** Cuánto daño base hace un atacante. */
    baseDamage(attacker, random, world) {
        const profile = attackProfile(attacker, world);
        if (!profile) {
            return 0;
        }
        const min = Math.abs(profile.minDamage || 0);
        const max = Math.abs(profile.maxDamage === undefined ? min : profile.maxDamage);
        if (max <= min) {
            return min;
        }
        return min + Math.floor(random() * (max - min + 1));
    },

    /**
     * Reducción por armadura del objetivo.
     *
     * Aproximación documentada: en Tibia la armadura reduce un valor aleatorio y
     * la defensa da probabilidad de bloqueo, con una fórmula que no se ha
     * verificado. Aquí la armadura reduce hasta la mitad de su valor, y siempre
     * queda al menos un punto de daño: un golpe que no hace nada no se distingue
     * de un fallo y confunde al que juega.
     */
    /**
     * LO QUE PARA LA ARMADURA, como `Creature::blockHit` de TFS: con más de 3 de armadura, entre la
     * mitad y casi toda (`armor - (armor % 2 + 1)`); con 1 a 3, un punto.
     */
    armorReduction(target, random) {
        const armor = targetArmor(target);
        if (armor <= 0) {
            return 0;
        }
        if (armor <= 3) {
            return 1;
        }
        const min = Math.floor(armor / 2);
        const max = Math.max(min, armor - (armor % 2 + 1));
        return min + Math.floor(random() * (max - min + 1));
    },

    /**
     * LO QUE PARA EL ESCUDO (o el arma) de un golpe físico cuerpo a cuerpo o a distancia: entre la
     * mitad y toda la defensa (`Creature::blockHit` de TFS). Ver `targetDefense`.
     */
    defenseReduction(target, random, world) {
        const defensa = targetDefense(target, world);
        if (defensa <= 0) {
            return 0;
        }
        const min = Math.floor(defensa / 2);
        return min + Math.floor(random() * (defensa - min + 1));
    },

    /** Multiplicador por resistencia o debilidad elemental. */
    elementMultiplier(target, element) {
        if (!element) {
            return 1;
        }
        const percent = elementPercent(target, element);
        if (percent === 0) {
            return 1;
        }
        return Math.max(0, 1 - (percent / 100));
    }
};

// ---------------------------------------------------------------------------
// Lectura de perfiles
// ---------------------------------------------------------------------------

/** El ataque que usa una criatura ahora mismo, o null. */
function attackProfile(creature, world) {
    if (!creature) {
        return null;
    }

    // Un monstruo declara sus ataques; el primero es el cuerpo a cuerpo.
    if (creature.isMonster && creature.isMonster()) {
        const definition = creature.monsterType;
        if (definition && Array.isArray(definition.attacks) && definition.attacks.length > 0) {
            return definition.attacks[0];
        }
        return null;
    }

    // Un jugador ataca con su arma. El "perfil" sale de los atributos del arma,
    // que es lo que declara items.xml.
    if (creature.isPlayer && creature.isPlayer()) {
        return playerAttackProfile(creature, world);
    }

    return null;
}

/** Armadura del objetivo, venga de un monstruo o de un jugador. */
/**
 * El ataque de un jugador, con las reglas de su vocación (`data/XML/vocations.js`):
 *
 * - la SKILL es la del arma que lleva (`weaponType` de items.xml: sword, axe, club, distance;
 *   sin arma, puño con ataque 7), y es la que se entrena al golpear;
 * - el daño máximo es el de TFS, `nivel/5 + 0,085 × ataque × skill`, por el multiplicador de la
 *   vocación (`formula.meleeDamage`, `distDamage` o `wandDamage`);
 * - el intervalo entre golpes es su `attackSpeed`.
 */
function playerAttackProfile(player, world) {
    const vocation = world && world.vocationOf ? world.vocationOf(player) : VOCACION_BASE;
    const formula = vocation.formula || VOCACION_BASE.formula;
    const weaponType = String(player.weaponType || '').toLowerCase();

    if (weaponType === 'wand' || weaponType === 'rod') {
        /*
         * UNA VARITA usa SUS números si items.xml los trae (`minDamage`, `maxDamage`, `manaCost`,
         * `element`, `shootType`: el weapons.xml de TFS, en el propio objeto) y gasta ese maná por
         * disparo. Sin ellos, una fórmula por nivel, para que una varita sin datos no sea inútil.
         */
        const arma = world && world.weaponOf ? world.weaponOf(player) : null;
        const attrs = (arma && arma.attributes) || {};
        const conDatos = attrs.maxDamage !== undefined;
        const max = conDatos ? Math.abs(Number(attrs.maxDamage))
            : Math.max(1, Math.floor((8 + player.level / 2) * formula.wandDamage));
        const elemento = attrs.element ? String(attrs.element).toLowerCase() : (weaponType === 'rod' ? 'ice' : 'energy');
        return {
            minDamage: conDatos ? Math.abs(Number(attrs.minDamage) || 0) : Math.floor(max / 2),
            maxDamage: max,
            interval: vocation.attackSpeed,
            range: Number(attrs.range) || 3,
            skill: null,
            element: elemento,
            manaCost: Math.max(0, Number(attrs.manaCost) || 0),
            proyectil: Number(attrs.shootType) || PROYECTIL_POR_NOMBRE[elemento] || 0,
            magico: true
        };
    }

    const skill = Vocacion.skillDeArma(weaponType);
    const skillLevel = player.skills && player.skills[skill]
        ? player.skills[skill].level
        : (player.attackSkill === undefined ? 10 : player.attackSkill);
    let attack = player.weaponAttack > 0 ? player.weaponAttack : 7;
    const factor = skill === 'distance' ? formula.distDamage : formula.meleeDamage;

    /*
     * A DISTANCIA, como en Tibia: un arco o una ballesta disparan la MUNICIÓN de la ranura de
     * munición (`ammoType` del arma = `ammoType` de la munición, «arrow» o «bolt»), que pone el
     * ataque y el proyectil, y se gasta una por disparo. Una lanza o una estrella se lanzan ellas
     * mismas (`shootType`), y se gastan si tienen `breakChance`.
     */
    let proyectil = 0;
    let gasta = null;
    if (skill === 'distance' && world && world.weaponOf) {
        const arma = world.weaponOf(player);
        const attrs = (arma && arma.attributes) || {};
        if (attrs.ammoType) {
            const municion = world.equippedIn(player, 'ammo');
            const def = municion ? world.itemTypes.get(municion.typeId) : null;
            if (!def || String(def.attributes.ammoType) !== String(attrs.ammoType)) {
                return { noAmmo: true, ammoType: String(attrs.ammoType), interval: vocation.attackSpeed, range: Number(attrs.range) || 6 };
            }
            attack = Number(def.attributes.attack || 0) + Number(attrs.attack || 0);
            proyectil = Number(def.attributes.shootType) || PROYECTIL.FLECHA;
            gasta = { slot: 'ammo', siempre: true };
        } else {
            proyectil = Number(attrs.shootType) || PROYECTIL.LANZA;
            gasta = Number(attrs.breakChance) > 0 ? { slot: 'hand', chance: Number(attrs.breakChance) } : null;
        }
    }
    /*
     * LA FÓRMULA DE TFS 1.x (`Weapons::getMaxWeaponDamage`): nivel/5 más
     * (skill/4 + 1) · (ataque/3) · 1,03, dividido por el FACTOR DEL MODO DE COMBATE (ofensivo 1,
     * equilibrado 1,2, defensivo 2), y por la vocación. El mínimo es nivel/5.
     */
    const factorModo = factorDeAtaque(player);
    const max = Math.max(1, Math.round((Math.floor(player.level / 5) +
        ((skillLevel / 4 + 1) * (attack / 3) * 1.03) / factorModo) * factor));

    return {
        minDamage: Math.min(max, Math.floor(player.level / 5)),
        maxDamage: max,
        interval: vocation.attackSpeed,
        range: skill === 'distance' ? (player.weaponRange || 6) : 1,
        skill: skill,
        proyectil: proyectil,
        gasta: gasta
    };
}

function targetArmor(target) {
    if (!target) {
        return 0;
    }

    if (target.isMonster && target.isMonster()) {
        const defenses = target.monsterType && target.monsterType.defenses;
        return defenses && defenses.armor ? Number(defenses.armor) : 0;
    }

    // La armadura de un jugador cuenta según su vocación (`formula.armor`: el caballero, 1.1).
    return Math.floor(Number(target.armorLevel || 0) * (target.armorFactor || 1));
}

/**
 * Porcentaje elemental del objetivo para un tipo de daño.
 *
 * Los tipos se nombran en minúscula (`fire`, `ice`...) en vez de usar las
 * constantes `COMBAT_*` de Tibia, porque en JavaScript no existen y crear treinta
 * constantes globales para esto no aporta nada.
 */
// ---------------------------------------------------------------------------
// Modos de combate, defensa y acierto (TFS)
// ---------------------------------------------------------------------------

/**
 * LOS TRES MODOS DE COMBATE de Tibia (el jugador los elige en el cliente): cuánto se divide el daño
 * (`getAttackFactor` de TFS) y cuánto se multiplica la defensa (`getDefenseFactor`).
 */
const MODOS = {
    ofensivo: { ataque: 1.0, defensa: 1.0 },
    equilibrado: { ataque: 1.2, defensa: 1.0 },
    defensivo: { ataque: 2.0, defensa: 2.0 }
};

function modoDe(player) {
    return player && MODOS[player.fightMode] ? player.fightMode : 'equilibrado';
}

function factorDeAtaque(player) {
    return MODOS[modoDe(player)].ataque;
}

/** En ofensivo, quien acaba de pegar defiende la MITAD (está con la guardia baja), como en TFS. */
function factorDeDefensa(player, world) {
    const modo = modoDe(player);
    if (modo === 'ofensivo') {
        const ahora = world && world.now ? world.now() : Date.now();
        const ritmo = (world && world.vocationOf ? world.vocationOf(player).attackSpeed : 2000) || 2000;
        return ahora - (player.lastAttackAt || 0) < ritmo ? 0.5 : 1.0;
    }
    return MODOS[modo].defensa;
}

/**
 * LA DEFENSA con la que se bloquea un golpe físico. Un monstruo, la `defense` de su ficha. Un
 * jugador, como `Player::getDefense` de TFS: el escudo (con la skill de escudo) o, sin escudo, el
 * arma (con su skill) o los puños (7, con la de puño), por (skill/4 + 2,23) · defensa · 0,15, por el
 * factor del modo de combate y por la vocación.
 */
function targetDefense(target, world) {
    if (!target) {
        return 0;
    }
    if (target.isMonster && target.isMonster()) {
        const defenses = target.monsterType && target.monsterType.defenses;
        return defenses && defenses.defense ? Number(defenses.defense) : 0;
    }
    if (!(target.isPlayer && target.isPlayer())) {
        return 0;
    }
    let valor = 7;
    let skill = 'fist';
    if (target.weaponDefense > 0) {
        valor = target.weaponDefense;
        skill = Vocacion.skillDeArma(String(target.weaponType || '').toLowerCase()) || 'fist';
    }
    if (target.shieldDefense > 0) {
        valor = target.shieldDefense;
        skill = 'shielding';
    }
    const nivel = target.skills && target.skills[skill] ? target.skills[skill].level : 10;
    const vocacion = world && world.vocationOf ? world.vocationOf(target) : VOCACION_BASE;
    const multiplicador = (vocacion.formula && vocacion.formula.defense) || 1;
    return Math.floor((nivel / 4 + 2.23) * valor * 0.15 * factorDeDefensa(target, world) * multiplicador);
}

/**
 * LA PROBABILIDAD DE ACERTAR a distancia (en %), con la tabla de `WeaponDistance` de TFS 1.x para un
 * arma de una mano: depende de la skill de distancia y de a cuántas casillas está el objetivo.
 */
function probabilidadDeAcierto(skill, distancia) {
    const s = Math.max(0, Number(skill) || 0);
    switch (distancia) {
        case 2:
            return Math.min(s, 28) * 2.4 + 8;
        case 3:
            return Math.min(s, 45) * 1.55 + 6;
        case 4:
            return Math.min(s, 58) * 1.25 + 3;
        case 6:
            return Math.min(s, 90) * 0.8 + 3;
        case 7:
            return Math.min(s, 104) * 0.7 + 2;
        default:
            return Math.min(s, 74) + 1;
    }
}

function elementPercent(target, element) {
    if (!target) {
        return 0;
    }

    const esMonstruo = !!(target.isMonster && target.isMonster() && target.monsterType);
    const list = esMonstruo ? target.monsterType.elements : target.elements;

    // LAS INMUNIDADES de un monstruo (`immunities` de su ficha) son una resistencia del 100 %: el
    // inmune a la tierra no recibe nada de un hechizo de tierra. Antes se declaraban y no contaban.
    const inmune = esMonstruo && Array.isArray(target.monsterType.immunities) &&
        target.monsterType.immunities.some((i) => String(i && i.type).toLowerCase() === String(element).toLowerCase() &&
            (i.percent === undefined || Number(i.percent) >= 100));
    if (inmune) {
        return 100;
    }

    if (!Array.isArray(list)) {
        return 0;
    }

    const entry = list.find((item) =>
        String(item.type).toLowerCase().replace('combat_', '').replace('damage', '') ===
        String(element).toLowerCase());

    return entry && entry.percent !== undefined ? Number(entry.percent) : 0;
}

// ---------------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------------

class Combat {
    constructor(options) {
        const opts = options || {};

        this.world = opts.world;
        this.scheduler = opts.scheduler || null;
        this.log = opts.logger || null;
        this.random = opts.random || Math.random;
        this.formulas = { ...DEFAULT_FORMULAS, ...(opts.formulas || {}) };
        this.config = opts.config || {};

        /** Registro de golpes, para las pruebas y para depurar. */
        this.hits = [];

        this.stats = { attacks: 0, hits: 0, misses: 0, kills: 0 };
    }

    // -----------------------------------------------------------------------
    // Alcance y enfriamiento
    // -----------------------------------------------------------------------

    /**
     * ¿Puede el atacante golpear al objetivo ahora mismo?
     *
     * Se distinguen los motivos igual que en el movimiento: "fuera de alcance" es
     * un rechazo, "todavía no le toca" es el ritmo normal del juego.
     */
    canAttack(attacker, target) {
        if (!attacker || !target) {
            return { allowed: false, reason: 'noTarget' };
        }
        if (attacker.isDead() || target.isDead()) {
            return { allowed: false, reason: 'dead' };
        }
        if (this.world && !this.world.map.canSee(attacker.position.z, target.position.z)) {
            return { allowed: false, reason: 'differentFloor' };
        }
        // Las reglas del mundo (reglas.js): zonas de protección, no-PvP y nivel de protección.
        const bloqueo = this.world && this.world.combatBlocked ? this.world.combatBlocked(attacker, target) : null;
        if (bloqueo) {
            return { allowed: false, reason: 'protected', block: bloqueo };
        }

        const range = this.attackRange(attacker);
        if (attacker.position.distanceTo(target.position) > range) {
            return { allowed: false, reason: 'outOfRange' };
        }

        const now = this.world ? this.world.now() : Date.now();
        if (now < (attacker.nextAttackAt || 0)) {
            return { allowed: false, reason: 'exhausted', waitMs: attacker.nextAttackAt - now };
        }

        return { allowed: true, reason: null };
    }

    /** Alcance del ataque principal de una criatura. */
    attackRange(attacker) {
        const profile = attackProfile(attacker, this.world);
        if (profile && profile.range !== undefined) {
            return Number(profile.range);
        }
        // El cuerpo a cuerpo de Tibia alcanza las cuatro casillas contiguas,
        // incluida la diagonal.
        return 1;
    }

    /**
     * Resuelve un ataque completo: comprueba, calcula el daño, lo aplica y
     * devuelve lo que pasó.
     */
    attack(attacker, target) {
        const check = this.canAttack(attacker, target);
        if (!check.allowed) {
            return { hit: false, reason: check.reason };
        }

        const now = this.world ? this.world.now() : Date.now();
        const profile = attackProfile(attacker, this.world);
        const interval = profile && profile.interval ? Number(profile.interval) : 2000;

        attacker.nextAttackAt = now + interval;
        attacker.lastAttackAt = now;
        if (attacker.target === undefined) {
            attacker.target = target;
        }

        this.stats.attacks += 1;

        // La probabilidad del ataque es lo que hace que un monstruo no use todas
        // sus habilidades a la vez.
        const chance = profile && profile.chance !== undefined ? Number(profile.chance) : 100;
        if (this.random() * 100 >= chance) {
            this.stats.misses += 1;
            return { hit: false, reason: 'chance' };
        }

        // Un arco sin flechas no dispara (y se dice: es lo primero que hay que saber).
        if (profile && profile.noAmmo) {
            if (this.world && attacker.isPlayer && attacker.isPlayer()) {
                this.world.sendTextMessage(attacker.id, 'No te quedan ' + (profile.ammoType === 'bolt' ? 'virotes' : 'flechas') +
                    ': ponlas en la ranura de munición.');
            }
            return { hit: false, reason: 'noAmmo' };
        }

        // Una varita gasta maná por disparo; sin el suficiente, no dispara.
        if (profile && profile.manaCost > 0 && attacker.isPlayer && attacker.isPlayer()) {
            if ((attacker.mana || 0) < profile.manaCost) {
                if (this.world) {
                    this.world.sendTextMessage(attacker.id, 'No tienes maná suficiente.');
                }
                return { hit: false, reason: 'noMana' };
            }
            attacker.mana -= profile.manaCost;
            if (this.world && this.world.addManaSpent) {
                this.world.addManaSpent(attacker, profile.manaCost);
            }
        }

        // Quien ataca se gira hacia su objetivo, y se avisa (el `onAttack` de los scripts: el tajo
        // de espada, por ejemplo, sale hacia donde mira).
        if (attacker.faceTowards && target.position) {
            attacker.faceTowards(target.position);
        }
        if (this.world && this.world.emit) {
            this.world.emit('onCreatureAttack', attacker, target);
        }

        // EL PROYECTIL QUE VUELA (la flecha, la lanza, la bola de fuego de un monstruo).
        const proyectil = profile ? (profile.proyectil || PROYECTIL_POR_NOMBRE[String(profile.shootEffect || '').toLowerCase()]) : 0;
        if (proyectil && this.world && this.world.sendDistanceEffect) {
            this.world.sendDistanceEffect(attacker.position, target.position, proyectil);
        }
        // Y se gasta lo que se dispara (una flecha; una lanza, si se rompe).
        if (profile && profile.gasta && this.world && this.world.consumeEntry) {
            const entrada = this.world.equippedIn(attacker, profile.gasta.slot);
            if (entrada && (profile.gasta.siempre || this.random() * 100 < profile.gasta.chance)) {
                this.world.consumeEntry(attacker, entrada, 1);
            }
        }

        const raw = this.formulas.baseDamage(attacker, this.random, this.world);
        const element = (profile && profile.element) || null;

        // Pegar entrena la skill del arma, como en Tibia (un try por golpe).
        if (profile && profile.skill && this.world && this.world.addSkillTries &&
            attacker.isPlayer && attacker.isPlayer()) {
            this.world.addSkillTries(attacker, profile.skill, 1);
        }

        // A DISTANCIA SE PUEDE FALLAR: la probabilidad sale de la skill y de la distancia (TFS). La
        // flecha vuela y se gasta igual; sólo no llega.
        if (profile && profile.skill === 'distance' && attacker.isPlayer && attacker.isPlayer()) {
            const skill = attacker.skills && attacker.skills.distance ? attacker.skills.distance.level : 10;
            const distancia = attacker.position.distanceTo(target.position);
            if (this.random() * 100 >= probabilidadDeAcierto(skill, distancia)) {
                this.stats.misses += 1;
                if (this.world && this.world.sendMagicEffect) {
                    this.world.sendMagicEffect(target.position, EFECTO.POFF);
                }
                return { hit: false, reason: 'miss' };
            }
        }

        const resultado = this.applyDamage(target, raw, {
            attacker: attacker,
            element: element,
            // Un golpe con arma (cuerpo a cuerpo o a distancia) lo para el escudo; la magia de una
            // varita, ni el escudo ni la armadura.
            bloqueable: !(profile && profile.magico),
            ignoreArmor: !!(profile && profile.magico)
        });

        // Un ataque puede dejar una CONDICIÓN si hace daño (la araña venenosa envenena):
        // `condition: { type: 'veneno', ticks: 5, interval: 2000, value: 2 }` en su ficha.
        if (resultado.hit && resultado.damage > 0 && !resultado.killed && profile && profile.condition &&
            this.world && this.world.condiciones) {
            this.world.condiciones.add(target, { ...profile.condition, attacker: attacker });
        }
        return resultado;
    }

    /**
     * Aplica daño a una criatura, con armadura y resistencias, y resuelve la
     * muerte si la salud llega a cero.
     *
     * @returns {{hit: boolean, damage: number, killed: boolean, loot: Array}}
     */
    applyDamage(target, rawDamage, options) {
        const opts = options || {};

        if (!target || target.isDead()) {
            return { hit: false, damage: 0, killed: false, loot: [] };
        }

        const element = opts.element || null;
        const multiplier = this.formulas.elementMultiplier(target, element);

        /*
         * EL GOLPE, COMO `Creature::blockHit` DE TFS: un golpe FÍSICO con arma lo puede parar primero
         * la DEFENSA (el escudo o el arma) y luego la ARMADURA; lo que quede, entra. Si no queda nada,
         * está BLOQUEADO (daño 0, y se ven las chispas). La magia no la para la armadura
         * (`ignoreArmor`, que piden los hechizos) y una resistencia del 100 % (la inmunidad) lo anula.
         */
        let damage = multiplier <= 0 ? 0 : Math.floor(rawDamage * multiplier);
        const fisico = !element || element === 'physical';
        if (damage > 0 && fisico && opts.bloqueable) {
            damage -= this.formulas.defenseReduction(target, this.random, this.world);
        }
        if (damage > 0 && !opts.ignoreArmor) {
            damage -= this.formulas.armorReduction(target, this.random);
        }
        damage = Math.max(0, damage);

        // DRENAR MANÁ no quita vida: quita maná (a quien lo tenga) y se queda en eso.
        if (element === 'manadrain') {
            const quitado = Math.min(Number(target.mana) || 0, damage);
            if (quitado > 0) {
                target.mana -= quitado;
            }
            if (this.world && this.world.sendMagicEffect && opts.effect !== 0) {
                this.world.sendMagicEffect(target.position, opts.effect || EFECTO.MAGIA_AZUL);
            }
            if (opts.attacker && opts.attacker !== target && this.world && this.world.noteCombat) {
                this.world.noteCombat(opts.attacker, target);
            }
            return { hit: true, damage: 0, manaDrained: quitado, element: element, multiplier: multiplier, killed: false, loot: [] };
        }

        target.damage(damage);

        // DRENAR VIDA cura a quien lo lanza lo que le quita al otro.
        if (element === 'lifedrain' && damage > 0 && opts.attacker && opts.attacker !== target &&
                this.world && this.world.healCreature) {
            this.world.healCreature(opts.attacker, damage);
        }

        // Los dos quedan EN COMBATE (no pueden salir), y quien pega a otro jugador, con PZ lock.
        if (opts.attacker && opts.attacker !== target && this.world && this.world.noteCombat) {
            this.world.noteCombat(opts.attacker, target);
        }

        // PvP: pegar a un jugador sin calavera pone la blanca al que pega.
        if (opts.attacker && opts.attacker !== target && opts.attacker.isPlayer && opts.attacker.isPlayer() &&
            target.isPlayer && target.isPlayer() && this.world && this.world.notePvpAttack) {
            this.world.notePvpAttack(opts.attacker, target);
        }

        // LO QUE SE VE: el golpe que hace sangre, el que para la armadura o el del elemento (una
        // llama si es fuego). Un script puede pedir otro con `effect`, o ninguno con `effect: 0`.
        if (this.world && this.world.sendMagicEffect && opts.effect !== 0) {
            const efecto = opts.effect ||
                (damage > 0 ? EFECTO_DE_ELEMENTO[element || 'physical'] || EFECTO.SANGRE
                    : (multiplier <= 0 ? EFECTO.POFF : EFECTO.GOLPE));
            this.world.sendMagicEffect(target.position, efecto);
        }

        // El número que sube sobre la criatura («-29» en rojo).
        if (damage > 0 && this.world) {
            this.world.emit('onHealthChange', target, -damage);
        }

        // Al jugador que recibe un golpe con escudo puesto se le entrena el escudo.
        if (damage > 0 && opts.attacker && target.isPlayer && target.isPlayer() &&
            this.world && this.world.equippedIn && this.world.equippedIn(target, 'shield')) {
            this.world.addSkillTries(target, 'shielding', 1);
        }

        this.stats.hits += 1;
        this.hits.push({
            attackerId: opts.attacker ? opts.attacker.id : null,
            targetId: target.id,
            targetName: target.name,
            raw: rawDamage,
            damage: damage,
            element: element,
            multiplier: multiplier,
            remaining: target.health
        });

        // El objetivo se defiende: un monstruo al que pegan pasa a perseguir a
        // quien le pegó, que es lo que espera cualquiera que ataque a distancia.
        if (target.isMonster && target.isMonster() && opts.attacker) {
            target.target = opts.attacker;
        }

        const result = {
            hit: true,
            damage: damage,
            element: element,
            multiplier: multiplier,
            killed: false,
            loot: []
        };

        if (target.isDead()) {
            result.killed = true;
            result.loot = this.handleDeath(target, opts.attacker);
        }

        return result;
    }

    // -----------------------------------------------------------------------
    // Muerte
    // -----------------------------------------------------------------------

    /**
     * Resuelve la muerte de una criatura: reparte botín, da experiencia y avisa.
     *
     * @returns {Array} los items que cayeron al suelo
     */
    handleDeath(target, killer) {
        // Un JUGADOR que muere no es un monstruo que muere, y el camino se separa aquí.
        // Antes de esto, un jugador a cero de vida se quedaba en el mundo con la barra
        // vacía y sin que pasara nada: el combate no tenía conclusión para él.
        //
        // El contador de muertes NO se toca en este camino: que a uno le maten no es una
        // muerte que hayas causado, y sumarla haría que las estadísticas dijeran lo
        // contrario de lo que pasó.
        if (target.isPlayer && target.isPlayer()) {
            if (killer && killer.isPlayer && killer.isPlayer() && this.world && this.world.notePvpKill) {
                this.world.notePvpKill(killer, target);
            }
            return this.handlePlayerDeath(target, killer);
        }

        this.stats.kills += 1;

        const dropped = target.isMonster && target.isMonster()
            ? this.dropLoot(target)
            : [];

        if (killer && killer.isPlayer && killer.isPlayer() && target.isMonster && target.isMonster()) {
            this.grantExperience(killer, target);
        }

        // `onKill` y `onDeath` se avisan ANTES de quitar al monstruo del mundo.
        //
        // El orden importa: los envoltorios que reciben los handlers resuelven la
        // criatura contra el mundo, asi que si ya se hubiera quitado, un handler
        // de muerte veria `getName() === null`. Es tambien el orden de TFS, donde
        // la criatura sigue siendo valida durante la llamada.
        if (this.world) {
            this.world.emit('onKill', killer || null, target);
            this.world.emit('onDeath', target, killer || null, dropped);
        }

        // Y quitarlo del mundo es lo ULTIMO, porque eso dispara `onMonsterDeath`,
        // que es lo que hace reaparecer al monstruo. Si se quitara antes, el
        // gestor de spawns empezaria a contar el tiempo de reaparicion mientras
        // los handlers de muerte todavia se estan ejecutando.
        if (target.isMonster && target.isMonster() && this.world) {
            this.world.killMonster(target.id, killer || null);
        }

        return dropped;
    }

    /**
     * Resuelve la muerte de un jugador.
     *
     * LAS TRES COSAS QUE PASAN, y por qué cada una:
     *
     * 1. PIERDE EXPERIENCIA, un porcentaje configurable. Sin castigo, morir no cuesta
     *    nada y el combate deja de tener tensión; es la razón de que en Tibia importe
     *    no morir.
     * 2. SUELTA EL INVENTARIO en el sitio donde cayó. Es lo que hace Tibia, y es lo que
     *    convierte recoger cosas en una decisión: llevarlo todo encima tiene un precio.
     *    Se puede apagar con `deathDropInventory`, porque para un servidor de pruebas es
     *    molesto.
     * 3. REAPARECE en el templo con la vida llena. Es lo único que puede hacer: dejarlo
     *    a cero de vida en el sitio sería dejarlo atrapado sin poder jugar.
     *
     * @returns {Array} lo que soltó
     */
    handlePlayerDeath(player, killer) {
        const dropped = [];

        // --- 1. La experiencia ---
        const percent = this.config.deathLosePercent === undefined
            ? 10 : Number(this.config.deathLosePercent);

        if (percent > 0 && player.experience > 0) {
            const lost = Math.floor(player.experience * percent / 100);
            player.experience = Math.max(0, player.experience - lost);
            player.level = levelForExperience(player.experience, 1);
        }

        // --- 2. El inventario ---
        if (this.config.deathDropInventory !== false &&
            player.inventory instanceof Array && player.inventory.length > 0) {

            /*
             * SE SUELTAN TODOS, Y LA MOCHILA LA ULTIMA.
             *
             * Suelta primero lo que NO es el contenedor y deja el contenedor para el final, y ese
             * orden es la diferencia entre soltar todo y soltar casi todo: la mochila no se puede
             * soltar mientras tenga cosas dentro -lo de dentro se quedaria dentro de nada-, asi que
             * soltandola la primera se quedaria puesta con su contenido y el jugador moriria
             * conservando parte del inventario.
             *
             * Se corta si un objeto no se puede soltar, en vez de insistir: el bucle no puede dar
             * vueltas sobre lo mismo, y un fallo al soltar no debe impedir morir y reaparecer.
             */
            const maximo = player.inventory.length;

            for (let index = 0; index < maximo && player.inventory.length > 0; index += 1) {
                const contenedor = this.world.containerOf(player);
                const libre = player.inventory.findIndex((entrada) => entrada !== contenedor);
                const result = this.world.dropItem(player, libre === -1 ? 0 : libre);

                if (!result.ok) {
                    break;
                }
                dropped.push(result.item);
            }
        }

        // --- 3. Reaparecer: en el templo de SU ciudad (reglas.js), y ya fuera de combate ---
        const temple = this.world.templeOf ? this.world.templeOf(player)
            : (this.world.map ? this.world.map.getWaypoint('temple') : null);
        const spawn = this.config.templePosition ||
            (temple ? { x: temple.x, y: temple.y, z: temple.z } : null);
        if (this.world.clearCombat) {
            this.world.clearCombat(player);
        }

        if (spawn) {
            this.world.teleportCreature(player, spawn);
        }

        if (this.world.applyLevel) {
            // Perder niveles quita la vida, el maná y la velocidad que daban (vocations.js).
            this.world.applyLevel(player, { curar: true });
        }
        player.health = player.maxHealth;
        player.nextStepAt = this.world.now();
        player.nextAttackAt = this.world.now();

        // El objetivo del monstruo que lo mató deja de tener sentido: el jugador ya no
        // está donde estaba, y seguir persiguiendo un recuerdo lo dejaría dando vueltas.
        this.world.creatures.forEach((creature) => {
            if (creature.target === player) {
                creature.target = null;
            }
        });

        /*
         * Se avisa DESPUÉS de resucitarlo, y ese orden importa: quien escuche el aviso
         * y mire al jugador tiene que verlo vivo y en el templo, no a cero de vida y en
         * el sitio donde cayó. Un manejador que intente curarlo o moverlo se encontraría
         * con un muerto, que es lo que se quiere evitar.
         */
        this.world.emit('onDeath', player, killer || null, dropped);
        this.world.emit('onPlayerDeath', player, killer || null, dropped);

        return dropped;
    }

    /**
     * Tira el botín del monstruo.
     *
     * La probabilidad se expresa sobre 100.000, igual que en Tibia, así que
     * `chance: 40000` es un 40% y `1180` es un 1,18%. Se copia la convención en
     * vez de usar porcentajes normales porque los datapacks existentes están
     * escritos así y traducirlos al importarlos sería una fuente de errores.
     *
     * PENDIENTE: en Tibia el botín va dentro de un **cadáver** (un contenedor que
     * hay que abrir), no suelto en el suelo. Eso llega con el inventario; mientras
     * tanto cae al suelo, que es lo que hace el juego con los objetos cuando no hay
     * cadáver.
     */
    dropLoot(monster) {
        const dropped = [];
        const loot = monster.loot;

        if (!this.world) {
            return dropped;
        }

        // EL CUERPO PRIMERO, y el botín DENTRO: como en Tibia, lo que suelta un monstruo se
        // coge abriendo su cuerpo (clic derecho). Sólo si no cabe, o no hay cuerpo, cae al suelo.
        const corpse = this.world.createCorpse ? this.world.createCorpse(monster) : null;
        if (corpse) {
            this.lastCorpse = corpse;
        }

        if (!Array.isArray(loot)) {
            return dropped;
        }

        // `rateLoot` multiplica la probabilidad de cada objeto (con 2, sale el doble de a menudo).
        const rateLoot = Number(this.config.rateLoot) > 0 ? Number(this.config.rateLoot) : 1;
        loot.forEach((entry) => {
            const chance = (entry.chance === undefined ? LOOT_CHANCE_BASE : Number(entry.chance)) * rateLoot;
            if (this.random() * LOOT_CHANCE_BASE >= chance) {
                return;
            }

            const typeId = entry.id !== undefined
                ? Number(entry.id)
                : this.world.itemTypes.size
                    ? this._typeIdByName(entry.name)
                    : null;

            if (!typeId) {
                if (this.log) {
                    this.log.warning('botin con un item que no existe: ' +
                        JSON.stringify(entry.name || entry.id));
                }
                return;
            }

            const count = entry.maxCount === undefined
                ? 1
                : 1 + Math.floor(this.random() * Number(entry.maxCount));

            const dentro = corpse && corpse.isContainer
                ? this.world.addToGroundContainer(corpse, typeId, count)
                : null;
            const item = dentro || this.world.createItem(typeId, count, monster.position);
            if (item && !dropped.includes(item)) {
                dropped.push(item);
            }
        });

        return dropped;
    }

    /** Busca el id de un item por su nombre, que es como lo declara el botín. */
    _typeIdByName(name) {
        if (!name || !this.world) {
            return null;
        }
        const wanted = String(name).toLowerCase();

        for (const [id, definition] of this.world.itemTypes) {
            if (definition.name && definition.name.toLowerCase() === wanted) {
                return id;
            }
        }
        return null;
    }

    /**
     * Da experiencia al que mató, aplicando las etapas si están configuradas.
     *
     * También comprueba la subida de nivel: la experiencia es acumulada, así que
     * subir es una sola comparación por nivel ganado, sin sumar tramos.
     */
    grantExperience(player, monster) {
        const base = monster.experience;
        if (base <= 0) {
            return { gained: 0, levels: 0 };
        }

        const stages = this.config.experienceStages;
        // `rateExperience` multiplica DESPUÉS de las etapas: es el «por dos» de un evento.
        const rate = Number(this.config.rateExperience) > 0 ? Number(this.config.rateExperience) : 1;
        const gained = Math.max(1, Math.floor(applyExperienceStages(base, player.level, stages) * rate));

        // EN GRUPO SE REPARTE (como el «shared experience» de Tibia): a partes iguales entre los
        // del grupo que estén cerca, con un 20 % de premio por ir juntos.
        const grupo = this.world && this.world.partyMembersNear ? this.world.partyMembersNear(player) : [player];
        if (grupo.length > 1) {
            const cada = Math.max(1, Math.floor(gained * 1.2 / grupo.length));
            let mio = null;
            grupo.forEach((miembro) => {
                const r = this.addExperience(miembro, cada);
                if (miembro === player) {
                    mio = r;
                }
            });
            return mio || { gained: cada, levels: 0, experience: player.experience };
        }
        return this.addExperience(player, gained);
    }

    /**
     * Suma experiencia (ya con etapas, o la que dé un script con `player.addExperience`) y sube
     * de nivel si llega. Con un número negativo, quita (sin bajar de nivel).
     */
    addExperience(player, gained) {
        gained = Math.trunc(Number(gained) || 0);
        if (!player || gained === 0) {
            return { gained: 0, levels: 0, experience: player ? player.experience : 0 };
        }
        player.experience = Math.max(0, (player.experience || 0) + gained);
        if (this.world) {
            this.world.emit('onExperienceGain', player, gained);
        }

        const oldLevel = player.level;
        const newLevel = levelForExperience(player.experience, player.level);
        const levels = newLevel - player.level;

        if (levels > 0) {
            player.level = newLevel;
            // La vida y el maná máximos suben lo que diga la vocación (gainHp y gainMana de
            // vocations.js), igual que la velocidad, y se cura: es lo que hace Tibia.
            if (this.world && this.world.applyLevel) {
                this.world.applyLevel(player, { curar: true });
            } else {
                const perLevel = Number(this.config.healthPerLevel || 5);
                player.maxHealth += perLevel * levels;
                player.health = player.maxHealth;
            }

            // Se avisa con la firma de TFS: (jugador, habilidad, nivel anterior,
            // nivel nuevo). La habilidad es siempre 'level' porque las demas
            // (espada, escudo, magia) todavia no se entrenan.
            if (this.world) {
                this.world.emit('onAdvance', player, 'level', oldLevel, newLevel);
            }
        }

        return { gained: gained, levels: levels, experience: player.experience };
    }
}

module.exports = {
    Combat,
    DEFAULT_FORMULAS,
    attackProfile,
    targetArmor,
    targetDefense,
    probabilidadDeAcierto,
    MODOS,
    elementPercent,
    LOOT_CHANCE_BASE
};
