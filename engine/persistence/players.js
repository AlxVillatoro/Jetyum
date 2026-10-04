'use strict';

/**
 * El repositorio de jugadores: el puente entre el mundo y la base de datos.
 *
 * La base sabe de filas y el mundo sabe de criaturas, y este archivo traduce entre
 * los dos. Es el único sitio donde se sabe que un `Player` del mundo tiene un
 * `account_id` en una tabla, y por eso es el único que hay que tocar si cambia
 * cualquiera de los dos lados.
 *
 * TRES DECISIONES QUE IMPORTAN
 *
 * 1. GUARDAR ES IDEMPOTENTE Y COMPLETO. No hay "guardar sólo lo que cambió": se
 *    escribe el personaje entero. Un inventario son decenas de filas, así que
 *    comparar para ahorrar escrituras cuesta más de lo que ahorra, y sobre todo
 *    puede desincronizarse. Reescribir no puede desincronizarse.
 *
 * 2. AL ENTRAR SE LIMPIA LA MARCA DE "DENTRO". La marca sólo vale mientras el
 *    proceso vive. Si el servidor se cayó con gente jugando, quedaría puesta para
 *    siempre y esos jugadores no podrían volver a entrar nunca. Es un fallo que se
 *    descubre tarde, en producción, y que se arregla aquí.
 *
 * 3. LA MISMA CUENTA NO ENTRA DOS VECES. Dos cuerpos con el mismo nombre, el
 *    inventario duplicado al guardar y el personaje saltando de un sitio a otro son
 *    las formas en que se manifiesta. Se rechaza la segunda entrada en vez de echar
 *    a la primera: es más predecible y no le rompe la partida a nadie que ya estaba
 *    jugando.
 */

const { Database } = require('./database');
const { normalizeOutfit, defaultOutfitFor } = require('../world/outfit');
const Vocacion = require('../world/vocacion');

/*
 * El nombre de la ranura de "dentro de la mochila" sale del archivo COMPARTIDO, porque el motor y
 * el cliente tienen que estar de acuerdo en el: ver `SLOT_INSIDE` en `shared/js/protocol.mjs`.
 */
const { SLOT_INSIDE } = require('../../shared/js/protocol.mjs');

/** Posición por defecto de un personaje nuevo, si el mapa no da otra. */
const DEFAULT_POSITION = { x: 0, y: 0, z: 7 };

/**
 * Lo que se comprueba al CREAR una cuenta o un personaje: nombres razonables y una contraseña
 * de al menos 4 caracteres. Devuelve el problema, o null.
 */
function validarAlta(cuenta, personaje, contrasena) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(cuenta)) {
        return 'la cuenta tiene que tener de 3 a 20 letras o numeros, sin espacios';
    }
    if (String(contrasena || '').length < 4) {
        return 'la contrasena tiene que tener al menos 4 caracteres';
    }
    if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]{2,19}$/.test(personaje) || /\s{2,}/.test(personaje)) {
        return 'el nombre del personaje tiene que tener de 3 a 20 letras (puede llevar espacios)';
    }
    return null;
}

class PlayerRepository {
    constructor(options) {
        const opts = options || {};

        this.world = opts.world;
        this.log = opts.logger || null;
        this.config = opts.config || {};
        this.now = opts.now || (() => Date.now());

        /** Dónde aparecen los personajes nuevos. Lo pone el motor con el mapa. */
        this.spawnPosition = opts.spawnPosition || null;

        this.database = opts.database || new Database({
            file: opts.file,
            logger: opts.logger,
            now: opts.now
        });

        this.stats = { logins: 0, logouts: 0, created: 0, autosaves: 0 };
    }

    open() {
        this.database.open();

        // Ningún personaje está dentro cuando el proceso arranca. Ver la cabecera.
        const cleared = this.database.clearOnlineFlags();
        if (cleared > 0 && this.log) {
            this.log.warning('se limpiaron ' + cleared + ' marcas de "dentro" de un ' +
                'arranque anterior: si el servidor se cayo, esos personajes se ' +
                'quedaron marcados');
        }

        return this;
    }

    close() {
        this.saveAll();
        this.database.close();
        return true;
    }

    get isOpen() {
        return this.database.isOpen;
    }

    // -----------------------------------------------------------------------
    // Entrar y salir
    // -----------------------------------------------------------------------

    /**
     * Mete a un personaje en el mundo.
     *
     * @param {Object} credentials { account, password, character }
     * @returns {{player: Player, created: boolean}|{error: string}}
     */
    login(credentials) {
        const accountName = String(credentials.account || '').trim();
        const characterName = String(credentials.character || '').trim();

        if (!accountName || !characterName) {
            return { error: 'faltan la cuenta o el personaje' };
        }

        /*
         * Cuenta que no existe: se crea, si está permitido.
         *
         * Es una comodidad de DESARROLLO y hay que decir en voz alta lo que
         * significa: cualquiera que se conecte puede crearse una cuenta con la
         * contraseña que quiera. En un servidor de verdad las cuentas se crean desde
         * una web, como en Tibia, y esto se apaga.
         *
         * Nótese que la contraseña se verifica DESPUÉS y por el mismo camino que la
         * de una cuenta que ya existía. Crear la cuenta y darla por buena sin pasar
         * por `authenticate` sería un segundo camino de entrada, y los fallos de
         * autenticación se cuelan justo por los segundos caminos.
         */
        let account = this.database.findAccount(accountName);
        const crear = credentials.crear === true;

        if (crear) {
            // CREAR CUENTA (el apartado «Crear cuenta» del cliente): la cuenta se crea si no
            // existe; si ya existe, la contraseña tiene que ser la suya y se le añade el personaje.
            const problema = validarAlta(accountName, characterName, credentials.password);
            if (problema) {
                return { error: problema };
            }
            if (!account) {
                try {
                    this.database.createAccount({ name: accountName, password: credentials.password });
                } catch (error) {
                    return { error: error.message };
                }
            }
            if (this.database.findCharacterByName(characterName)) {
                return { error: 'ya existe un personaje llamado "' + characterName + '": elige otro nombre' };
            }
        } else if (!account && this.config.autoCreateAccounts) {
            try {
                this.database.createAccount({
                    name: accountName,
                    password: credentials.password
                });
                if (this.log) {
                    this.log.warning('cuenta "' + accountName + '" creada sola: ' +
                        'autoCreateAccounts esta activo, y en un servidor de verdad ' +
                        'no deberia estarlo');
                }
            } catch (error) {
                return { error: error.message };
            }
        }

        // Siempre por el mismo camino, exista la cuenta o se acabe de crear.
        account = this.database.authenticate(accountName, credentials.password);
        if (!account) {
            return { error: crear
                ? 'esa cuenta ya existe y la contrasena no es esa'
                : 'cuenta o contrasena incorrectas (si no tienes cuenta, creala en «Crear cuenta»)' };
        }

        // El personaje tiene que ser DE ESA CUENTA. Sin esta comprobación, cualquiera
        // con una cuenta válida podría entrar con el personaje de otro con sólo
        // saberse el nombre.
        let row = this.database.findCharacterByName(characterName);

        if (row && row.account_id !== account.id) {
            return { error: 'ese personaje no es de esta cuenta' };
        }

        let created = false;

        const premium = Number(account.premium_until || 0) > Math.floor(this.now() / 1000);

        // Al ENTRAR, el personaje tiene que existir: se crea (con su vocación) en «Crear cuenta».
        // Sólo si el servidor lo permite (`autoCreateCharacters`, para pruebas) se crea solo.
        if (!row && !crear && this.config.autoCreateCharacters === false) {
            return { error: 'esa cuenta no tiene un personaje llamado "' + characterName +
                '": crealo en «Crear cuenta»' };
        }

        if (!row) {
            const spawn = this.spawnPosition || DEFAULT_POSITION;
            // La vocación elegida tiene que poder elegirse (vocations.js: que exista, que no sea
            // una promoción y, si es needPremium, que la cuenta lo sea).
            const vocacion = this.world.vocationForNewCharacter(credentials.vocation, premium);
            if (!vocacion.ok) {
                return { error: vocacion.reason };
            }
            try {
                row = this.database.createCharacter(account.id, characterName, {
                    x: spawn.x, y: spawn.y, z: spawn.z,
                    vocation: vocacion.vocation,
                    sex: credentials.sex,
                    maxHealth: Vocacion.maxHealthPara(this.world.vocationOf({ vocation: vocacion.vocation }), 1)
                });
                created = true;
                this.stats.created += 1;
            } catch (error) {
                return { error: error.message };
            }
        }

        if (this.database.isCharacterOnline(row.id)) {
            return { error: 'ese personaje ya esta dentro del mundo' };
        }

        const state = this.database.loadCharacter(row.id);
        if (!state) {
            return { error: 'no se pudo cargar el personaje' };
        }

        const player = this._spawnInWorld(state, account.id, created, premium);

        this.database.setCharacterOnline(row.id, true);
        this.stats.logins += 1;

        if (this.log) {
            this.log.info('entra ' + player.name + ' (nivel ' + player.level + ')' +
                (created ? ' [personaje nuevo]' : ''));
        }

        return { player: player, created: created };
    }

    /** Crea la criatura en el mundo a partir de lo que había en la base. */
    _spawnInWorld(state, accountId, created, premium) {
        const row = state.player;

        const player = this.world.createPlayer(row.name, row.position, {
            vocation: row.vocation,
            sex: row.sex,
            premium: premium === true
        });

        // Se conservan TODOS los campos guardados. Es fácil olvidar uno y que un
        // personaje vuelva con el nivel 1 sin que nada avise.
        player.accountId = accountId;
        player.characterId = row.id;
        player.vocation = row.vocation;
        player.level = row.level;
        player.experience = row.experience;
        player.health = row.health;
        player.maxHealth = row.maxHealth;
        player.direction = row.direction;

        // Lo que da la vocación: maná, almas, skills… y lo que depende del nivel (vida y maná
        // máximos, velocidad) se recalcula con vocations.js, por si han cambiado sus números.
        Vocacion.cargarProgreso(player, row.progress);
        if (!row.progress) {
            player.mana = undefined;
            player.soul = undefined;
        }
        this.world.applyLevel(player, { curar: created });

        player.inventory = state.items.slice();
        player.storages = new Map(Object.keys(state.storages)
            .map((key) => [key, state.storages[key]]));

        this._normalizeContainer(player, created);

        /**
         * El aspecto, con una excepción que importa: `lookType` a 0.
         *
         * Un 0 significa que la fila es de ANTES de que existieran los aspectos, así que
         * no es que el personaje no tenga apariencia, es que no se guardó. Ponerle el
         * aspecto por defecto a esos personajes es lo correcto, y hacerlo aquí y no en
         * la base es lo correcto también: el valor por defecto es una decisión del
         * juego, y la base no tiene por qué conocerla.
         *
         * Sin esta comprobación, todos los personajes creados antes de esta versión
         * saldrían con el aspecto 0, que no existe, y el cliente dibujaría un muñeco
         * en blanco.
         */
        const stored = row.outfit || {};
        player.outfit = (stored.lookType
            ? normalizeOutfit(stored)
            : defaultOutfitFor(player, this.world.outfitTypes));

        return player;
    }

    /**
     * PONE AL DÍA EL CONTENEDOR DE UN PERSONAJE QUE VIENE DE LA BASE.
     *
     * Aquí pasan dos cosas, y las dos son de datos de ANTES:
     *
     * 1. LA RANURA `backpack` YA NO SIGNIFICA LO MISMO. Cuando no había contenedores, el motor
     *    usaba `backpack` para "guardado, no puesto": todo lo que llevabas encima iba ahí, y la
     *    mochila también, mezcladas. Ahora `backpack` es la ranura de EQUIPO donde se pone la
     *    mochila y lo que va DENTRO se llama `SLOT_INSIDE`. Sin traducirlo, las monedas de un
     *    personaje de antes aparecerían "puestas" en la ranura de la mochila.
     *
     * 2. UN PERSONAJE SIN CONTENEDOR NO PUEDE JUGAR: no puede coger nada del suelo, ni comprar,
     *    ni recibir. Los de antes no tienen, así que se les da el de inicio.
     *
     * SE HACE AQUÍ Y NO EN UNA MIGRACIÓN DE LA BASE porque cuál es el contenedor de inicio es una
     * decisión del JUEGO y la base no tiene por qué conocerla: es el mismo motivo por el que el
     * aspecto por defecto se pone dos líneas más arriba y no en el esquema. La base guarda datos;
     * qué significan es de aquí.
     *
     * Y NO SE LE DA A CUALQUIERA QUE NO TENGA. Un personaje que se quedó sin mochila jugando tiene
     * que poder seguir sin ella: regalársela al entrar sería una forma de conseguir mochilas
     * gratis. Solo se le da a quien tiene cosas DENTRO y ninguna mochila, que es un estado que
     * este motor no puede producir -no deja sacar la mochila con cosas dentro- y que por tanto
     * solo puede venir de datos de antes.
     */
    _normalizeContainer(player, created) {
        const inventory = player.inventory;

        if (!(inventory instanceof Array)) {
            return;
        }

        // 1. Lo que estaba en la ranura vieja: se queda puesta UNA mochila -la primera- y el
        //    resto pasa a estar dentro. Sin contenedor declarado, todo pasa a estar dentro.
        let puesta = false;

        inventory.forEach((entry) => {
            if (entry.slot === SLOT_INSIDE) {
                return;
            }
            if (entry.slot !== 'backpack') {
                return;
            }
            if (!puesta && this.world.isContainerType(entry.typeId)) {
                puesta = true;
                return;
            }
            entry.slot = SLOT_INSIDE;
        });

        // 2. Y si tiene cosas dentro pero NINGUNA mochila, se le pone la de inicio. Un personaje
        //    nuevo entra por aquí también: su inventario en la base está vacío, así que el
        //    contenedor que le puso `createPlayer` se perdió al cargar el de la base.
        //
        //    SE MIRA QUE NO TENGA NINGUNA, y no sólo que no tenga una puesta, y esa diferencia es
        //    la que evita un regalo: un jugador que se saca la mochila -vacía, que es lo único que
        //    se puede- y vuelve a entrar la tendría DENTRO, sin poner, y con la comprobación corta
        //    se le daría otra. Con esta, sigue teniendo la suya y la vuelve a poner cuando quiera.
        const tieneContenedor = inventory.some((entry) =>
            this.world.isContainerType(entry.typeId));

        const huerfano = !tieneContenedor && this.world.contentsOf(player).length > 0;

        if (created || huerfano) {
            this.world.equipStartingContainer(player);
        }
    }

    /**
     * Saca a un personaje del mundo y lo guarda.
     *
     * El orden importa: guardar ANTES de marcarlo como fuera. Al revés, si el
     * guardado fallara el personaje quedaría marcado como fuera y con el estado
     * viejo, y el jugador perdería lo que hubiera hecho.
     */
    logout(player) {
        if (!player || !player.characterId) {
            return false;
        }

        this.save(player);

        try {
            this.database.setCharacterOnline(player.characterId, false);
        } catch (error) {
            if (this.log) {
                this.log.error('no se pudo marcar como fuera a ' + player.name + ': ' +
                    (error && error.message));
            }
        }

        this.stats.logouts += 1;
        return true;
    }

    // -----------------------------------------------------------------------
    // Guardar
    // -----------------------------------------------------------------------

    /** Guarda a un jugador. */
    save(player) {
        // Lo que hay en el depósito abierto se apunta en `player.deposito`, que va en el progreso.
        if (player && this.world && this.world.depotSnapshot) {
            this.world.depotSnapshot(player);
        }
        if (!player || !player.characterId) {
            return false;
        }

        const storages = {};
        if (player.storages instanceof Map) {
            player.storages.forEach((value, key) => { storages[key] = value; });
        } else if (player.storages) {
            Object.assign(storages, player.storages);
        }

        return this.database.saveCharacter({
            player: {
                id: player.characterId,
                vocation: player.vocation,
                sex: player.sex,
                progress: Vocacion.progresoParaGuardar(player),
                level: player.level,
                experience: player.experience,
                health: player.health,
                maxHealth: player.maxHealth,
                direction: player.direction,
                position: {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z
                },
                outfit: player.outfit
            },
            items: player.inventory || [],
            storages: storages
        });
    }
    /**
     * Guarda a todos los que están dentro.
     *
     * Se llama en el guardado periódico y al apagar. Un fallo al guardar a uno NO
     * debe impedir guardar a los demás: perder a uno es malo, perder a todos por
     * culpa de uno es mucho peor.
     */
    saveAll() {
        let saved = 0;
        let failed = 0;

        this.world.players.forEach((player) => {
            try {
                if (this.save(player)) {
                    saved += 1;
                }
            } catch (error) {
                failed += 1;
                if (this.log) {
                    this.log.error('no se pudo guardar a ' + player.name + ': ' +
                        (error && error.message));
                }
            }
        });

        if (saved > 0) {
            this.stats.autosaves += 1;
        }

        return { saved: saved, failed: failed };
    }

    // -----------------------------------------------------------------------
    // Storages: la memoria del contenido
    // -----------------------------------------------------------------------

    /**
     * Guarda un valor en el personaje.
     *
     * Es lo que permite que un módulo de contenido recuerde cosas. Se escribe en el
     * mundo y NO en la base al momento: si cada `setStorageValue` hiciera su propia
     * escritura, un script con un bucle dentro machacaría el disco. El guardado
     * periódico y el de salida se encargan de bajarlo.
     */
    setStorage(player, key, value) {
        if (!player) {
            return false;
        }
        if (!(player.storages instanceof Map)) {
            player.storages = new Map();
        }
        player.storages.set(String(key), Number(value));
        return true;
    }

    getStorage(player, key) {
        if (!player || !(player.storages instanceof Map)) {
            return null;
        }
        const value = player.storages.get(String(key));
        return value === undefined ? null : value;
    }

    // -----------------------------------------------------------------------
    // Cuentas, para las herramientas y las pruebas
    // -----------------------------------------------------------------------

    createAccount(name, password, email) {
        return this.database.createAccount({ name: name, password: password, email: email });
    }

    /**
     * Los personajes de una cuenta, comprobando su contraseña: lo que enseña la pantalla de
     * entrada para elegir con quién jugar. No mete a nadie en el mundo.
     *
     * @returns {{characters: Array<{name, level, vocation, online}>}|{error: string}}
     */
    charactersOf(credentials) {
        const accountName = String((credentials && credentials.account) || '').trim();
        const password = String((credentials && credentials.password) || '');
        if (!accountName || !password) {
            return { error: 'escribe tu cuenta y tu contrasena' };
        }
        const account = this.database.authenticate(accountName, password);
        if (!account) {
            return { error: 'cuenta o contrasena incorrectas (si no tienes cuenta, creala en «Crear cuenta»)' };
        }
        return {
            characters: this.database.listCharacters(account.id).map((row) => ({
                name: row.name,
                level: row.level,
                vocation: row.vocation,
                online: !!row.online
            }))
        };
    }

    listCharacters(accountName) {
        const account = this.database.findAccount(accountName);
        return account ? this.database.listCharacters(account.id) : [];
    }

    stats_() {
        return { ...this.database.stats_(), ...this.stats };
    }
}

module.exports = { PlayerRepository, DEFAULT_POSITION };
