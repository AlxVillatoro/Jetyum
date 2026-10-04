'use strict';

/**
 * Registro de contenido y despacho de eventos.
 *
 * El contenido se declara con módulos que exportan una definición. Ésa es toda
 * la API que hay que aprender para añadir algo al juego:
 *
 *   action      -> un item que hace algo al usarlo
 *   movement    -> algo que ocurre al pisar, salir, equipar o soltar
 *   talkaction  -> un comando de chat
 *   monster     -> un tipo de monstruo
 *
 * No hay paso de registro que se pueda olvidar: si el módulo existe y exporta una
 * definición válida, queda registrado al arrancar. En la etapa anterior, con Lua,
 * había que llamar a `:register()` al final de cada script, y olvidarlo era un
 * fallo silencioso: el script se cargaba sin error y no hacía nada.
 *
 * Los handlers se invocan de forma DIRECTA, sin puente. Ésa es la ganancia
 * concreta frente a la versión con Lua, donde cada llamada cruzaba una frontera
 * y costaba entre 2x y 18x según cómo se pasaran las entidades.
 */

const { EntityFactory } = require('./entities');

/** El nombre del callback de un movimiento lo decide su tipo de evento. */
const MOVEMENT_CALLBACKS = {
    stepin: 'onStepIn',
    stepout: 'onStepOut',
    equip: 'onEquip',
    deequip: 'onDeEquip',
    additem: 'onAddItem',
    removeitem: 'onRemoveItem'
};

const KINDS = ['action', 'movement', 'talkaction', 'monster', 'npc', 'event', 'globalevent', 'raid', 'spell', 'quest'];

/**
 * El enfriamiento de cada grupo de hechizos (el «exhaust» de Tibia): tras uno de ataque no se
 * lanza otro de ataque en 2 s, pero sí uno de curación (que tiene el suyo, de 1 s).
 */
const ENFRIAMIENTO_DE_GRUPO = { ataque: 2000, curacion: 1000, apoyo: 2000 };

/**
 * Eventos GLOBALES: los `globalevents` de TFS. No dependen de nadie, sino del servidor y del
 * reloj: al arrancar, al apagar, cada cierto tiempo y a una hora del día.
 */
const GLOBAL_EVENTS = {
    startup: 'onStartup',
    shutdown: 'onShutdown',
    think: 'onThink',
    time: 'onTime'
};

/**
 * Eventos de criatura: el nombre del callback lo decide el tipo de evento, igual
 * que en los movimientos. Es el mecanismo de TFS para `onKill`, `onDeath` y
 * compañía.
 */
const CREATURE_EVENTS = {
    kill: 'onKill',
    death: 'onDeath',
    advance: 'onAdvance',
    login: 'onLogin',
    logout: 'onLogout',
    attack: 'onAttack'
};

/** Canales de chat, para el cuarto argumento de `onSay`. */
const TALKTYPE_SAY = 1;
const TALKTYPE_WHISPER = 2;
const TALKTYPE_YELL = 3;

/** Normaliza `ids`, que puede ser un número suelto o un array. */
function toIdList(value) {
    if (value === undefined || value === null) {
        return [];
    }
    const list = Array.isArray(value) ? value : [value];
    return list.map(Number).filter((n) => !Number.isNaN(n));
}

class ScriptRegistry {
    constructor(options) {
        this.world = options.world;
        this.log = options.logger;
        this.entities = new EntityFactory(this.world);

        this.actions = new Map();       // itemId      -> { handler, script }
        this.movements = new Map();     // "evento:id" -> { handler, script }
        // Por actionId y uniqueId: los atributos que el mapa pone a un objeto concreto.
        this.actionsByAid = new Map();
        this.actionsByUid = new Map();
        this.movementsByAid = new Map();    // "evento:aid"
        this.movementsByUid = new Map();    // "evento:uid"
        this.talkActions = [];          // { words, handler, script }
        this.registeredScripts = new Set();

        /** Eventos de criatura: tipo de evento -> { handler, script }. */
        this.events = new Map();

        /**
         * Eventos globales: una LISTA por tipo, porque a diferencia de los de criatura puede
         * haber muchos (un guardado periódico, un anuncio, una limpieza...). Cada entrada lleva
         * su nombre, su intervalo (`think`) o su hora (`time`).
         */
        this.globalEvents = { startup: [], shutdown: [], think: [], time: [] };

        /** Las raids, por nombre: anuncios y monstruos que llegan por etapas. */
        this.raids = new Map();

        /** Los hechizos (`type: 'spell'`), por sus palabras. También se lanzan como talkactions. */
        this.spells = new Map();

        // Los hechizos de la vocación de un jugador (`player.getSpells()`, el `/spells`).
        if (this.world) {
            this.world.spellsFor = (jugador) => [...this.spells.values()]
                .filter((h) => !h.vocations || h.vocations.includes(jugador.vocation))
                .sort((a, b) => a.level - b.level || a.mana - b.mana || a.words.localeCompare(b.words))
                .map((h) => ({ words: h.words, name: h.name, group: h.group, level: h.level, mana: h.mana, soul: h.soul }));
        }

        /** Las misiones del diario (`type: 'quest'`), en orden de carga. */
        this.quests = [];

        // Los tipos de monstruo son contenido, y el mundo es su dueño: el
        // registro escribe directamente en él en vez de mantener una segunda
        // copia que se pueda desincronizar.
        this.monsterTypes = this.world.monsterTypes;

        /**
         * Los diálogos de NPC, por nombre.
         *
         * El nombre lo declara EL MÓDULO y `data/npc/npcs.xml` declara el mismo nombre con
         * los datos estáticos. Que aparezca en los dos sitios es a propósito: es un dato
         * repetido que sirve para comprobar que el XML y el módulo hablan del mismo NPC, y
         * un desajuste se detecta al arrancar en vez de aparecer como un NPC mudo.
         */
        this.npcTypes = this.world.npcTypes;
    }

    // -----------------------------------------------------------------------
    // Registro
    // -----------------------------------------------------------------------

    /**
     * Registra una definición exportada por un módulo de contenido.
     *
     * @param {Object} definition
     * @param {string} script ruta relativa, sólo para diagnósticos
     * @returns {{kind: string, count: number}}
     */
    register(definition, script) {
        if (!definition || typeof definition !== 'object') {
            throw new Error('el modulo no exporta un objeto de definicion');
        }

        switch (definition.type) {
            case 'action':
                return this._registerAction(definition, script);
            case 'movement':
                return this._registerMovement(definition, script);
            case 'talkaction':
                return this._registerTalkAction(definition, script);
            case 'spell':
                return this._registerSpell(definition, script);
            case 'quest':
                return this._registerQuest(definition, script);
            case 'monster':
                return this._registerMonster(definition, script);
            case 'npc':
                return this._registerNpc(definition, script);
            case 'event':
                return this._registerEvent(definition, script);
            case 'globalevent':
                return this._registerGlobalEvent(definition, script);
            case 'raid':
                return this._registerRaid(definition, script);
            default:
                throw new Error("tipo de definicion desconocido: " + JSON.stringify(definition.type) +
                    '. Se esperaba uno de: ' + KINDS.join(', '));
        }
    }

    _registerAction(definition, script) {
        /*
         * TRES FORMAS DE ENGANCHARSE, las de TFS: por TIPO de objeto (`ids`), por ACTION ID
         * (`aids`, el atributo que se pone en el mapa a un objeto concreto) y por UNIQUE ID
         * (`uids`). Las dos últimas son las que hacen útil configurar objetos en el editor: la
         * palanca 1948 con actionId 2000 abre ESA puerta y no todas las palancas del mundo.
         */
        const ids = toIdList(definition.ids);
        const aids = toIdList(definition.aids);
        const uids = toIdList(definition.uids);
        if (ids.length === 0 && aids.length === 0 && uids.length === 0) {
            throw new Error("una accion necesita 'ids', 'aids' o 'uids' (numero o array de numeros)");
        }
        if (typeof definition.onUse !== 'function') {
            throw new Error("una accion necesita 'onUse'");
        }

        ids.forEach((id) => {
            const existing = this.actions.get(id);
            if (existing) {
                this.log.warning('accion duplicada para el item ' + id + ': ' +
                    existing.script + ' y ' + script);
            }
            this.actions.set(id, { handler: definition.onUse, script: script });
        });
        aids.forEach((aid) => {
            this.actionsByAid.set(aid, { handler: definition.onUse, script: script });
        });
        uids.forEach((uid) => {
            this.actionsByUid.set(uid, { handler: definition.onUse, script: script });
        });

        this.registeredScripts.add(script);
        return { kind: 'action', count: ids.length + aids.length + uids.length };
    }

    _registerMovement(definition, script) {
        const event = String(definition.event || 'stepin').toLowerCase();
        const callbackName = MOVEMENT_CALLBACKS[event];

        if (!callbackName) {
            throw new Error("tipo de movimiento desconocido: '" + definition.event +
                "'. Validos: " + Object.keys(MOVEMENT_CALLBACKS).join(', '));
        }
        if (typeof definition[callbackName] !== 'function') {
            throw new Error("un movimiento de tipo '" + event + "' necesita '" + callbackName + "'");
        }

        const ids = toIdList(definition.ids);
        const aids = toIdList(definition.aids);
        const uids = toIdList(definition.uids);
        if (ids.length === 0 && aids.length === 0 && uids.length === 0) {
            throw new Error("un movimiento necesita 'ids', 'aids' o 'uids'");
        }

        ids.forEach((id) => {
            this.movements.set(event + ':' + id, { handler: definition[callbackName], script: script });
        });
        aids.forEach((aid) => {
            this.movementsByAid.set(event + ':' + aid, { handler: definition[callbackName], script: script });
        });
        uids.forEach((uid) => {
            this.movementsByUid.set(event + ':' + uid, { handler: definition[callbackName], script: script });
        });

        this.registeredScripts.add(script);
        return { kind: 'movement', count: ids.length + aids.length + uids.length };
    }

    _registerTalkAction(definition, script) {
        if (typeof definition.words !== 'string' || definition.words === '') {
            throw new Error("una talkaction necesita 'words', por ejemplo words: '/pos'");
        }
        if (typeof definition.onSay !== 'function') {
            throw new Error("una talkaction necesita 'onSay'");
        }

        const words = definition.words.toLowerCase();
        const existing = this.talkActions.find((t) => t.words === words);
        if (existing) {
            this.log.warning('talkaction duplicada "' + words + '": ' +
                existing.script + ' y ' + script);
        }

        this.talkActions.push({ words: words, handler: definition.onSay, script: script });
        this.registeredScripts.add(script);
        return { kind: 'talkaction', count: 1 };
    }

    /**
     * UN HECHIZO, como los `spells` de TFS. El motor comprueba lo de siempre (vocación, nivel,
     * maná, enfriamiento y, si lo pide, que haya objetivo) y el script sólo dice QUÉ HACE:
     *
     *     {
     *         type: 'spell', words: 'exori flam', name: 'Flame Strike', group: 'ataque',
     *         level: 14, mana: 20, vocations: ['Sorcerer', 'Druid'], needTarget: true, range: 3,
     *         onCastSpell(player, target, param) {
     *             Game.doTargetCombat(player, target, { type: 'fire', min: 10, max: 30 });
     *             return true;      // true (o un texto, que se le dice): lanzado; false: no, sin gastar
     *         }
     *     }
     *
     * `vocations` vacío o ausente: todas. `cooldown` (ms) cambia el del grupo.
     */
    _registerSpell(definition, script) {
        if (typeof definition.words !== 'string' || definition.words === '') {
            throw new Error("un hechizo necesita 'words', por ejemplo words: 'exura'");
        }
        if (typeof definition.onCastSpell !== 'function') {
            throw new Error("un hechizo necesita 'onCastSpell(player, target, param)'");
        }
        const words = definition.words.toLowerCase();
        const hechizo = {
            words: words,
            name: definition.name || definition.words,
            group: ENFRIAMIENTO_DE_GRUPO[definition.group] ? definition.group : 'ataque',
            level: Number(definition.level) || 1,
            mana: Number(definition.mana) || 0,
            soul: Number(definition.soul) || 0,
            vocations: Array.isArray(definition.vocations) && definition.vocations.length ? definition.vocations : null,
            needTarget: definition.needTarget === true,
            range: Number(definition.range) || 7,
            cooldown: Number(definition.cooldown) || 0,
            onCastSpell: definition.onCastSpell,
            script: script
        };
        this.spells.set(words, hechizo);
        this.talkActions.push({
            words: words,
            spell: hechizo,
            handler: (player, dichas, param) => this._lanzarHechizo(hechizo, player, param),
            script: script
        });
        this.registeredScripts.add(script);
        return { kind: 'spell', count: 1 };
    }

    /** Las comprobaciones de un hechizo y, si pasan, el hechizo. */
    _lanzarHechizo(h, player, param) {
        const jugador = this.world.getPlayer(player.getId());
        if (!jugador) {
            return true;
        }
        const falla = (texto) => {
            player.sendCancelMessage(texto);
            this.world.sendMagicEffect(jugador.position, 103);   // POFF
            return true;
        };
        if (h.vocations && !h.vocations.includes(jugador.vocation)) {
            return falla('Tu vocación no puede lanzar ' + h.name + '.');
        }
        if (jugador.level < h.level) {
            return falla('Necesitas nivel ' + h.level + ' para ' + h.name + '.');
        }
        if (jugador.mana < h.mana) {
            return falla('No tienes suficiente maná (' + h.name + ' cuesta ' + h.mana + ').');
        }
        if (h.soul && (jugador.soul || 0) < h.soul) {
            return falla('No tienes suficientes almas (' + h.name + ' necesita ' + h.soul + ').');
        }
        const ahora = this.world.now();
        jugador.enfriamientos = jugador.enfriamientos || {};
        if (ahora < (jugador.enfriamientos[h.group] || 0)) {
            return falla('Estás agotado.');
        }
        let objetivo = null;
        if (h.needTarget) {
            const t = jugador.target;
            if (!t || t.isDead() || !this.world.getCreature(t.id) || t.position.z !== jugador.position.z ||
                jugador.position.distanceTo(t.position) > h.range) {
                return falla('Necesitas un objetivo a la vista (ataca a alguien primero).');
            }
            objetivo = this.entities.creature(t.id);
        }
        const r = this._invoke({ handler: h.onCastSpell, script: h.script }, 'onCastSpell', [player, objetivo, param || '']);
        if (r.error || r.result === false) {
            this.world.sendMagicEffect(jugador.position, 103);
            return true;
        }
        jugador.enfriamientos[h.group] = ahora + (h.cooldown || ENFRIAMIENTO_DE_GRUPO[h.group]);
        if (h.mana) {
            jugador.mana = Math.max(0, jugador.mana - h.mana);
            this.world.addManaSpent(jugador, h.mana);
        }
        if (h.soul) {
            jugador.soul = Math.max(0, (jugador.soul || 0) - h.soul);
        }
        if (typeof r.result === 'string') {
            player.sendTextMessage(r.result);
        }
        return true;
    }

    /**
     * UNA MISIÓN DEL DIARIO, como el quests.xml de TFS: el diario se calcula con los storages
     * del jugador, así que basta con que los scripts los vayan subiendo.
     *
     *     {
     *         type: 'quest', name: 'La plaga de ratas', storage: 'ratas.inicio', startValue: 1,
     *         missions: [
     *             { name: 'Mata 10 ratas', storage: 'ratas.muertas', startValue: 0, endValue: 10,
     *               description: (v) => 'Llevas ' + v + ' de 10.' },
     *         ]
     *     }
     *
     * La misión aparece cuando el storage de la misión (o el de la quest) llega a `startValue`, y
     * está terminada cuando llega a `endValue`.
     */
    _registerQuest(definition, script) {
        if (typeof definition.name !== 'string' || !definition.name) {
            throw new Error("una mision necesita 'name'");
        }
        if (!Array.isArray(definition.missions) || definition.missions.length === 0) {
            throw new Error("una mision necesita 'missions' (al menos una)");
        }
        definition.missions.forEach((m, i) => {
            if (!m || !m.name || m.storage === undefined) {
                throw new Error('la mision ' + (i + 1) + " de '" + definition.name + "' necesita 'name' y 'storage'");
            }
        });
        this.quests.push({ ...definition, script: script });
        this.registeredScripts.add(script);
        return { kind: 'quest', count: 1 };
    }

    /** El diario de misiones de un jugador: `[{ name, completed, missions: [{ name, description, completed }] }]`. */
    questLog(player) {
        const valor = (clave) => {
            const v = player.storages instanceof Map ? player.storages.get(String(clave)) : undefined;
            return v === undefined ? null : Number(v);
        };
        const log = [];
        this.quests.forEach((q) => {
            const inicio = q.storage !== undefined ? valor(q.storage) : null;
            const misiones = [];
            q.missions.forEach((m) => {
                const v = valor(m.storage);
                const empieza = m.startValue === undefined ? 0 : Number(m.startValue);
                if (v === null || v < empieza) {
                    return;
                }
                const fin = m.endValue === undefined ? empieza + 1 : Number(m.endValue);
                const texto = typeof m.description === 'function'
                    ? String(m.description(v))
                    : (m.description && typeof m.description === 'object'
                        ? String(m.description[v] || m.description.default || '')
                        : String(m.description || ''));
                misiones.push({ name: m.name, description: texto, completed: v >= fin });
            });
            const empezada = q.storage !== undefined
                ? inicio !== null && inicio >= (q.startValue === undefined ? 1 : Number(q.startValue))
                : misiones.length > 0;
            if (empezada && misiones.length > 0) {
                log.push({ name: q.name, completed: misiones.every((m) => m.completed), missions: misiones });
            }
        });
        return log;
    }

    _registerMonster(definition, script) {
        if (typeof definition.name !== 'string' || definition.name === '') {
            throw new Error("un monstruo necesita 'name'");
        }
        if (this.monsterTypes.has(definition.name)) {
            this.log.warning('tipo de monstruo duplicado: ' + definition.name);
        }

        // El nombre y el origen se copian a la definición: son lo que hace falta
        // para poder decir de dónde salió un monstruo cuando algo no cuadra.
        const stored = { ...definition, script: script };
        delete stored.type;

        this.monsterTypes.set(definition.name, stored);
        this.registeredScripts.add(script);
        return { kind: 'monster', count: 1 };
    }

    /**
     * Registra el diálogo de un NPC.
     *
     * El módulo no construye el NPC: declara QUÉ DICE. Los datos estáticos —aspecto,
     * salud, velocidad, cada cuánto pasea— están en `data/npc/npcs.xml`, que es donde TFS
     * también los tiene. La razón de partirlo así es que el XML se lee al arrancar y no
     * cambia, mientras que el diálogo es contenido y se recarga en caliente.
     */
    _registerNpc(definition, script) {
        if (typeof definition.name !== 'string' || definition.name === '') {
            throw new Error("un npc necesita 'name'");
        }
        if (this.npcTypes.has(definition.name)) {
            this.log.warning('npc duplicado: ' + definition.name);
        }
        if (!(definition.keywords instanceof Array) || definition.keywords.length === 0) {
            throw new Error('el npc "' + definition.name + '" no tiene palabras clave: ' +
                'un npc que no responde a nada no es un npc');
        }

        const stored = { ...definition, script: script };
        delete stored.type;

        this.npcTypes.set(definition.name, stored);
        this.registeredScripts.add(script);

        return { kind: 'npc', count: 1 };
    }

    _registerEvent(definition, script) {
        const event = String(definition.event || '').toLowerCase();
        const callbackName = CREATURE_EVENTS[event];

        if (!callbackName) {
            throw new Error("tipo de evento desconocido: '" + definition.event +
                "'. Validos: " + Object.keys(CREATURE_EVENTS).join(', '));
        }
        if (typeof definition[callbackName] !== 'function') {
            throw new Error("un evento de tipo '" + event + "' necesita '" + callbackName + "'");
        }

        // VARIOS SCRIPTS POR EVENTO, como los creaturescripts de TFS: un `onLogin` que da la
        // bienvenida y otro que reparte un regalo conviven, y se ejecutan en orden de carga.
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push({ handler: definition[callbackName], script: script });
        this.registeredScripts.add(script);
        return { kind: 'event', count: 1 };
    }

    /**
     * Un evento global, como los de TFS:
     *
     *     { type: 'globalevent', name: 'anuncio', event: 'think', interval: 60000, onThink(interval) {} }
     *     { type: 'globalevent', name: 'amanecer', event: 'time', time: '06:00', onTime(hora) {} }
     *     { type: 'globalevent', name: 'arranque', event: 'startup', onStartup() {} }
     */
    _registerGlobalEvent(definition, script) {
        const event = String(definition.event || '').toLowerCase();
        const callbackName = GLOBAL_EVENTS[event];
        if (!callbackName) {
            throw new Error("evento global desconocido: '" + definition.event +
                "'. Validos: " + Object.keys(GLOBAL_EVENTS).join(', '));
        }
        if (typeof definition[callbackName] !== 'function') {
            throw new Error("un evento global de tipo '" + event + "' necesita '" + callbackName + "'");
        }
        const entry = { name: definition.name || script, handler: definition[callbackName], script: script };
        if (event === 'think') {
            entry.interval = Number(definition.interval);
            if (!(entry.interval >= 100)) {
                throw new Error("un evento 'think' necesita 'interval' en milisegundos (100 o más)");
            }
        }
        if (event === 'time') {
            const hora = /^(\d{1,2}):(\d{2})$/.exec(String(definition.time || ''));
            if (!hora || Number(hora[1]) > 23 || Number(hora[2]) > 59) {
                throw new Error("un evento 'time' necesita 'time' con la forma 'HH:MM'");
            }
            entry.time = hora[1].padStart(2, '0') + ':' + hora[2];
        }
        this.globalEvents[event].push(entry);
        this.registeredScripts.add(script);
        return { kind: 'globalevent', count: 1 };
    }

    /**
     * Una raid: lo que en TFS es un XML de `data/raids/` con anuncios y monstruos por etapas.
     *
     *     {
     *       type: 'raid', name: 'Ratas', interval: 3600000, chance: 30,   // o time: '20:00'
     *       steps: [
     *         { delay: 0, announce: '¡Las ratas suben de las cloacas!' },
     *         { delay: 10000, spawn: { monster: 'Rat', x: 60, y: 40, z: 7, count: 8, radius: 4 } },
     *         { delay: 20000, run(Game) { ... } }                        // lo que haga falta
     *       ]
     *     }
     *
     * Sin `interval` ni `time` sólo se lanza a mano (`Game.startRaid` o el comando `/raid`).
     */
    _registerRaid(definition, script) {
        const name = String(definition.name || '').trim();
        if (!name) {
            throw new Error('una raid necesita nombre');
        }
        const steps = Array.isArray(definition.steps) ? definition.steps : [];
        if (steps.length === 0) {
            throw new Error('la raid «' + name + '» no tiene etapas (steps)');
        }
        steps.forEach((step, i) => {
            if (!step.announce && !step.spawn && typeof step.run !== 'function') {
                throw new Error('la etapa ' + i + ' de la raid «' + name + '» no hace nada: ' +
                    'necesita announce, spawn o run');
            }
            if (step.spawn && !step.spawn.monster) {
                throw new Error('la etapa ' + i + ' de la raid «' + name + '» no dice qué monstruo');
            }
        });
        this.raids.set(name.toLowerCase(), {
            name, steps, script,
            interval: Number(definition.interval) || 0,
            chance: definition.chance === undefined ? 100 : Number(definition.chance),
            time: definition.time || null
        });
        this.registeredScripts.add(script);
        return { kind: 'raid', count: 1 };
    }

    // -----------------------------------------------------------------------
    // Despacho
    // -----------------------------------------------------------------------

    /**
     * Invoca un handler aislando los fallos: un script roto no debe tumbar el
     * tick del mundo. El error se registra con su ruta, que es lo que permite
     * encontrar el culpable entre cientos de módulos.
     */
    _invoke(entry, handlerName, args) {
        let result;
        try {
            result = entry.handler.apply(null, args);
        } catch (error) {
            this.log.error('error en ' + handlerName + ' de ' + entry.script + ':\n' +
                (error && error.stack ? error.stack : error));
            return { handled: false, error: error, script: entry.script };
        }

        // El tick del mundo es síncrono. Un handler `async` devolvería una
        // promesa que nadie espera, y el efecto llegaría tarde o nunca: es un
        // fallo silencioso, así que se avisa en voz alta.
        if (result && typeof result.then === 'function') {
            this.log.warning(handlerName + ' de ' + entry.script + ' devolvio una promesa. ' +
                'El tick del mundo es sincrono y no la espera: el handler debe ser sincrono.');
        }

        return { handled: result === true, result: result, script: entry.script };
    }

    /**
     * Acción de item: el `onUse` de TFS.
     * Firma del handler: (player, item, fromPosition, target, toPosition, isHotkey)
     */
    /**
     * Los identificadores de la INSTANCIA: los del contexto, o los atributos del objeto que hay
     * en el mundo con ese uid.
     */
    _idsDeInstancia(c) {
        let actionId = c.actionId;
        let uniqueId = c.uniqueId;
        if ((actionId === undefined || uniqueId === undefined) && c.itemUid && this.world &&
            typeof this.world.getItem === 'function') {
            const item = this.world.getItem(c.itemUid);
            if (item && item.attributes) {
                if (actionId === undefined) { actionId = item.attributes.actionId; }
                if (uniqueId === undefined) { uniqueId = item.attributes.uniqueId; }
            }
        }
        return { actionId: Number(actionId) || 0, uniqueId: Number(uniqueId) || 0 };
    }

    /** La cascada de TFS: uniqueId, luego actionId, luego el tipo. */
    _buscar(porUid, porAid, porId, prefijo, itemId, c) {
        const { actionId, uniqueId } = this._idsDeInstancia(c);
        // Las acciones van por número y los movimientos por «evento:número».
        const clave = (n) => (prefijo === '' ? Number(n) : prefijo + Number(n));
        return (uniqueId && porUid.get(clave(uniqueId))) ||
            (actionId && porAid.get(clave(actionId))) ||
            porId.get(clave(itemId)) || null;
    }

    /** ¿Hay alguna acción para este objeto (por uid, aid o tipo)? Sin ejecutarla. */
    hasAction(itemId, context) {
        return this._buscar(this.actionsByUid, this.actionsByAid, this.actions, '', itemId, context || {}) !== null;
    }

    dispatchAction(itemId, context) {
        const entry = this._buscar(this.actionsByUid, this.actionsByAid, this.actions, '',
            itemId, context || {});
        if (!entry) {
            return { handled: false };
        }

        const c = context || {};
        return this._invoke(entry, 'onUse', [
            this.entities.player(c.playerId || 0),
            // Igual que en los movimientos: el tipo se declara siempre, y el uid
            // sólo si el motor conoce la instancia concreta.
            c.itemWrapper || this.entities.item(c.itemUid || 0, itemId),
            this.entities.position(c.fromX || 0, c.fromY || 0, c.fromZ || 0),
            // El objetivo: una criatura (una hotkey «en el objetivo») o un objeto.
            c.targetCreatureId ? this.entities.creature(c.targetCreatureId)
                : (c.targetId ? this.entities.item(c.targetUid || 0, c.targetId) : null),
            this.entities.position(c.toX || 0, c.toY || 0, c.toZ || 0),
            c.isHotkey === true
        ]);
    }

    /**
     * Movimiento: el `onStepIn` / `onStepOut` / `onEquip` de TFS.
     *
     * IMPORTANTE: la firma NO es la misma para todos los tipos de evento. En TFS
     * está verificado en el código que son distintas, y pasar los argumentos
     * equivocados produce un handler que recibe basura sin dar ningún error:
     *
     *   stepin / stepout  (creature, item, position, fromPosition)
     *   equip / deequip   (player, item, slot, isCheck)
     *   additem/removeitem(moveitem, tileitem, position)
     *
     * La búsqueda tiene la precedencia de TFS: uniqueid -> actionid -> itemid
     * (ver `_buscar`).
     */
    dispatchMovement(event, itemId, context) {
        const normalized = String(event).toLowerCase();
        const entry = this._buscar(this.movementsByUid, this.movementsByAid, this.movements,
            normalized + ':', itemId, context || {});
        if (!entry) {
            return { handled: false };
        }

        const c = context || {};
        // `creature` y no `player`: quien pisa un tile puede ser un monstruo, y
        // un handler de movimiento debe recibir el envoltorio que corresponde.
        const creature = this.entities.creature(c.creatureId || 0);

        // El evento se registra por TIPO de item, pero el handler debe recibir la
        // INSTANCIA que hay en el tile. El motor conoce las dos, así que se pasan
        // las dos: el uid si existe, y siempre el tipo (que es lo que permite que
        // getName() funcione aunque no haya instancia).
        const item = this.entities.item(c.itemUid || 0, itemId);

        let args;
        switch (normalized) {
            case 'equip':
            case 'deequip':
                args = [creature, item, c.slot || 0, c.isCheck === true];
                break;

            case 'additem':
            case 'removeitem':
                // Se registra por el objeto de la CASILLA (una papelera, un altar) y recibe el
                // que llega o se va: (moveitem, tileitem, position), como en TFS.
                args = [
                    this.entities.item(c.movedUid || 0, c.movedTypeId),
                    item,
                    this.entities.position(c.x || 0, c.y || 0, c.z || 0)
                ];
                break;

            default:
                args = [
                    creature,
                    item,
                    this.entities.position(c.x || 0, c.y || 0, c.z || 0),
                    this.entities.position(c.fromX || 0, c.fromY || 0, c.fromZ || 0)
                ];
        }

        return this._invoke(entry, MOVEMENT_CALLBACKS[normalized], args);
    }

    /**
     * Comando de chat: el `onSay` de TFS.
     * Firma del handler: (player, words, param, type)
     *
     * `type` es el canal por el que se dijo (hablar, susurrar, gritar): un script
     * puede querer tratarlos distinto, y omitirlo sería recortar la API real.
     *
     * La coincidencia es por prefijo, que es lo que permite que "/item 3031"
     * active la talkaction registrada como "/item". Se exige que lo que sigue
     * sea un espacio, para que "/itemx" no active "/item".
     */
    dispatchTalkAction(words, context) {
        const lower = String(words).toLowerCase();

        const matches = this.talkActions.filter((t) =>
            lower === t.words || lower.startsWith(t.words + ' '));

        if (matches.length === 0) {
            return { handled: false };
        }

        // Si varias casan, gana la más específica: "/item" antes que "/i".
        matches.sort((a, b) => b.words.length - a.words.length);
        const entry = matches[0];

        const c = context || {};
        const param = String(words).slice(entry.words.length).replace(/^\s+/, '');

        return this._invoke(entry, 'onSay', [
            this.entities.player(c.playerId || 0),
            words,
            param,
            c.type === undefined ? TALKTYPE_SAY : c.type
        ]);
    }

    /**
     * Evento de criatura: el `onKill` / `onDeath` / `onAdvance` de TFS.
     *
     * @param {string} event 'kill' | 'death' | 'advance' | ...
     * @param {Array} args ya construidos por quien avisa
     */
    dispatchEvent(event, args) {
        const nombre = String(event).toLowerCase();
        const lista = this.events.get(nombre) || [];
        if (lista.length === 0) {
            return { handled: false };
        }
        // Se ejecutan todos. `false` en uno (como en TFS, «no dejes entrar») se recoge en
        // `blocked`: quien avisa decide qué hacer con él (onLogin lo usa para rechazar).
        let handled = false;
        let blocked = false;
        lista.forEach((entry) => {
            const r = this._invoke(entry, CREATURE_EVENTS[nombre], args);
            handled = handled || r.handled;
            blocked = blocked || r.result === false;
        });
        return { handled: handled, blocked: blocked };
    }

    /**
     * Lanza los eventos globales de un tipo. Devuelve cuántos se ejecutaron sin error.
     * `filtro` elige cuáles (por ejemplo, los `time` de una hora concreta).
     */
    dispatchGlobal(event, args, filtro) {
        const lista = this.globalEvents[String(event).toLowerCase()] || [];
        let hechos = 0;
        lista.forEach((entry) => {
            if (filtro && !filtro(entry)) {
                return;
            }
            const r = this._invoke(entry, GLOBAL_EVENTS[event], args || []);
            if (!r.error) {
                hechos += 1;
            }
        });
        return hechos;
    }

    // -----------------------------------------------------------------------
    // Informe
    // -----------------------------------------------------------------------

    stats() {
        return {
            registeredScripts: this.registeredScripts.size,
            actions: this.actions.size,
            movements: this.movements.size,
            talkActions: this.talkActions.length,
            monsterTypes: this.monsterTypes.size,
            npcTypes: this.npcTypes.size,
            events: Array.from(this.events.values()).reduce((n, l) => n + l.length, 0),
            globalEvents: Object.values(this.globalEvents).reduce((n, l) => n + l.length, 0),
            raids: this.raids.size,
            spells: this.spells.size,
            quests: this.quests.length
        };
    }
}

module.exports = {
    ScriptRegistry,
    MOVEMENT_CALLBACKS,
    CREATURE_EVENTS,
    GLOBAL_EVENTS,
    KINDS,
    TALKTYPE_SAY,
    TALKTYPE_WHISPER,
    TALKTYPE_YELL
};
