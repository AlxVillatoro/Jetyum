'use strict';

/**
 * Persistencia: la base de datos de cuentas y personajes.
 *
 * La estructura sigue la de The Forgotten Server —cuentas, personajes, items y
 * *storages*— porque es la que espera cualquiera que venga de ahí, y porque cada una
 * de esas tablas existe por una razón que se descubre al intentar quitarla.
 *
 * POR QUÉ SQLITE Y NO MYSQL. TFS usa MySQL, y su motivo es que atiende a miles de
 * jugadores desde varios procesos. Aquí hay un proceso y la escala es otra, y
 * SQLite viene **dentro de Node** desde la versión 22: cero dependencias, cero
 * servidor que instalar, cero compilación nativa. Es la elección correcta para este
 * proyecto y sería la incorrecta para el que tiene TFS.
 *
 * TRES COSAS QUE HAY QUE CONFIGURAR SIEMPRE, y que se olvidan:
 *
 * 1. `PRAGMA foreign_keys = ON`. SQLite las trae DESACTIVADAS por compatibilidad
 *    hacia atrás. Sin esto, borrar una cuenta deja sus personajes huérfanos y no
 *    pasa nada visible hasta que alguien mira la base y encuentra basura.
 *
 * 2. `PRAGMA journal_mode = WAL`. Sin él, un lector bloquea a un escritor. Con él,
 *    se puede guardar un personaje mientras otro se está cargando.
 *
 * 3. `PRAGMA synchronous = NORMAL`. Es el ajuste recomendado con WAL: sobrevive a
 *    que se caiga el PROCESO, aunque no a que se apague la máquina de golpe. Para un
 *    servidor de juego es el equilibrio correcto; para un banco no lo sería.
 *
 * LO QUE NO HACE, y conviene saberlo: no guarda el mundo (los items del suelo, las
 * criaturas) sino sólo a los jugadores. El mundo se regenera del mapa al arrancar,
 * que es lo que hace TFS. La excepción, también como en TFS, es lo que hay dentro de
 * las casas (`house_items`, versión 6: ver engine/world/casas.js).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Versión del esquema. Sube cuando cambie la estructura. */
const SCHEMA_VERSION = 11;

/**
 * Las tablas.
 *
 * El orden importa: las claves ajenas obligan a crear `accounts` antes que
 * `players`, y `players` antes que lo que cuelga de él.
 */
const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS accounts (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT    NOT NULL,
        password_salt TEXT    NOT NULL,
        email         TEXT,
        premium_until INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        last_login    INTEGER
    )`,

    `CREATE TABLE IF NOT EXISTS players (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        vocation    TEXT    NOT NULL DEFAULT 'None',
        level       INTEGER NOT NULL DEFAULT 1,
        experience  INTEGER NOT NULL DEFAULT 0,
        health      INTEGER NOT NULL DEFAULT 150,
        max_health  INTEGER NOT NULL DEFAULT 150,
        direction   INTEGER NOT NULL DEFAULT 2,
        pos_x       INTEGER NOT NULL DEFAULT 0,
        pos_y       INTEGER NOT NULL DEFAULT 0,
        pos_z       INTEGER NOT NULL DEFAULT 7,
        created_at  INTEGER NOT NULL,
        last_login  INTEGER,
        online      INTEGER NOT NULL DEFAULT 0
    )`,

    /*
     * Los items del jugador.
     *
     * `slot` es dónde va: los nombres de las ranuras de EQUIPO —`hand`, `ring`, `backpack`— y
     * `inside` para lo que va dentro de la mochila (ver `SLOT_INSIDE` en `shared/js/protocol.mjs`).
     * `position` es el orden dentro de ese sitio. Se separan porque una mochila tiene orden y un
     * anillo no, y meterlos en el mismo campo obligaría a inventar convenciones.
     *
     * OJO CON UNA BASE DE ANTES: aquí `backpack` quería decir "lo que llevas encima", mochila
     * incluida. Ahora es la ranura de la mochila y lo de dentro es `inside`, y la traducción de
     * los datos viejos se hace al cargar el personaje -mira `_normalizeContainer` en
     * `engine/persistence/players.js`-, porque para saber si una fila es un contenedor hay que
     * conocer los OBJETOS, y eso lo sabe el juego y no la base.
     *
     * `attributes` es JSON en texto. Los items de Tibia llevan atributos propios
     * (cargas, texto escrito, dueño), y hacer una columna por cada uno posible sería
     * un esquema que crece con cada datapack.
     *
     * LOS CONTENEDORES ANIDADOS NO TIENEN FILAS PROPIAS: una bolsa dentro de la mochila es una
     * fila (`inside`) y lo que lleva dentro va en SU `attributes`, bajo la clave `_contenido`, como
     * un árbol JSON. Por eso no hubo migración y las filas de antes se cargan igual. El porqué
     * está en `CLAVE_CONTENIDO` de `engine/world/contenedores.js`.
     */
    `CREATE TABLE IF NOT EXISTS player_items (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        slot       TEXT    NOT NULL,
        position   INTEGER NOT NULL DEFAULT 0,
        item_type  INTEGER NOT NULL,
        count      INTEGER NOT NULL DEFAULT 1,
        attributes TEXT
    )`,

    /*
     * Los *storages*: la memoria de los scripts.
     *
     * Es la tabla que hace posible el contenido. Un módulo de contenido necesita
     * recordar que un jugador ya mató a un dragón o en qué paso va de una misión, y
     * sin esto no tendría dónde. En TFS son claves numéricas; aquí la clave es texto
     * para poder escribir `mision.dragon` en vez de `4021`, pero los números
     * funcionan igual porque en SQLite el texto los admite.
     */
    `CREATE TABLE IF NOT EXISTS player_storages (
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        key       TEXT    NOT NULL,
        value     INTEGER NOT NULL,
        PRIMARY KEY (player_id, key)
    )`,

    `CREATE INDEX IF NOT EXISTS idx_players_account ON players(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_player_items_player ON player_items(player_id)`,
    `CREATE INDEX IF NOT EXISTS idx_players_online ON players(online)`
];

/**
 * Los cambios de estructura, uno por versión.
 *
 * EL ESQUEMA DE ARRIBA ES LA VERSIÓN 1 Y NO SE TOCA. Cuando hay que añadir algo, se
 * añade aquí una migración que lleve de la versión anterior a la nueva. Es la forma de
 * que una base que ya tiene personajes se actualice sin perderlos: si en vez de esto
 * se cambiara el `CREATE TABLE`, las bases existentes se quedarían con el esquema
 * viejo y las consultas fallarían con un "no existe la columna" que aparece en
 * producción y no en las pruebas, porque las pruebas crean bases nuevas.
 *
 * Es justo lo que TFS no hace, y por eso actualizar un servidor suyo obliga a ejecutar
 * `ALTER TABLE` a mano y a acordarse de cuáles faltan.
 */
const MIGRATIONS = {
    /**
     * Versión 2: el aspecto de los personajes.
     *
     * Cinco columnas y no una con JSON, siguiendo a TFS: son cinco enteros pequeños y
     * separados se pueden consultar y comparar. Los nombres son los de TFS para que
     * quien venga de ahí reconozca la tabla.
     */
    2: (db) => {
        ['looktype', 'lookhead', 'lookbody', 'looklegs', 'lookfeet', 'lookaddons']
            .forEach((column) => {
                try {
                    db.exec('ALTER TABLE players ADD COLUMN ' + column +
                        ' INTEGER NOT NULL DEFAULT 0');
                } catch (error) {
                    /*
                     * Si la columna YA está, no se hace nada.
                     *
                     * En teoría no puede pasar: la versión dice qué migraciones faltan,
                     * y cada una se aplica una sola vez. En la práctica pasa cuando la
                     * fila de la versión y la estructura real no coinciden —una copia de
                     * seguridad restaurada a medias, alguien tocando la tabla `meta` a
                     * mano— y entonces hay que elegir entre dos males.
                     *
                     * Negarse a arrancar deja al servidor sin bootear y sin más salida
                     * que abrir SQLite a mano, que es justo lo que sabe hacer poca gente.
                     * Tolerarlo deja el resultado que se quería, que es que la columna
                     * esté. Se elige lo segundo, y se avisa.
                     */
                    if (!/duplicate column name/i.test(String(error.message))) {
                        throw error;
                    }
                    if (this.log) {
                        this.log.warning('la columna ' + column + ' ya existia al migrar: ' +
                            'la version de la base y su estructura no coincidian');
                    }
                }
            });
    },

    /**
     * Versión 3: lo que da la vocación (data/XML/vocations.js).
     *
     * `sex` decide qué aspectos puede llevar (outfits.js). `progress` es JSON con el maná, las
     * almas, la stamina, el nivel mágico y las skills con sus tries: son muchos números que
     * siempre se leen y se guardan juntos, y una columna por skill sería un esquema que cambia
     * cada vez que se añade una.
     */
    3: (db) => {
        [['sex', "TEXT NOT NULL DEFAULT 'male'"], ['progress', 'TEXT']].forEach(([column, type]) => {
            try {
                db.exec('ALTER TABLE players ADD COLUMN ' + column + ' ' + type);
            } catch (error) {
                if (!/duplicate column name/i.test(String(error.message))) {
                    throw error;
                }
            }
        });
    },

    /**
     * Versión 4: el GRUPO de acceso (`group_id`, como en TFS: 1 jugador ... 6 god; ver
     * `data/XML/groups.js`), la CIUDAD (`town_id`: adónde se vuelve al morir) y la MONTURA
     * (`mount_id`, la elegida, y `mounted`, si iba montado al salir).
     */
    4: (db) => {
        [['group_id', 'INTEGER NOT NULL DEFAULT 1'], ['town_id', 'INTEGER NOT NULL DEFAULT 0'],
            ['mount_id', 'INTEGER NOT NULL DEFAULT 0'], ['mounted', 'INTEGER NOT NULL DEFAULT 0']]
            .forEach(([column, type]) => {
                try {
                    db.exec('ALTER TABLE players ADD COLUMN ' + column + ' ' + type);
                } catch (error) {
                    if (!/duplicate column name/i.test(String(error.message))) {
                        throw error;
                    }
                }
            });
    },

    /**
     * Versión 5: EL HISTORIAL DE MUERTES, la tabla `player_deaths` de TFS con sus columnas: cuándo
     * (`time`, en SEGUNDOS como TFS), a qué nivel (el que tenía AL CAER, antes de perder nada), quién
     * dio el último golpe (`killed_by`, e `is_player` si fue un jugador), quién hizo más daño
     * (`mostdamage_by`; hoy vacío, porque el combate no apunta el daño por atacante) y si la muerte
     * fue injusta.
     *
     * Una fila por muerte y NUNCA se reescribe: se inserta al morir (el aviso `onPlayerDeath`, en
     * engine/core/engine.js) y se lee con `/muertes`. El índice es para «las últimas N de este».
     */
    5: (db) => {
        db.exec(`CREATE TABLE IF NOT EXISTS player_deaths (
            id                     INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id              INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            time                   INTEGER NOT NULL,
            level                  INTEGER NOT NULL,
            killed_by              TEXT    NOT NULL DEFAULT '',
            is_player              INTEGER NOT NULL DEFAULT 0,
            mostdamage_by          TEXT    NOT NULL DEFAULT '',
            mostdamage_is_player   INTEGER NOT NULL DEFAULT 0,
            unjustified            INTEGER NOT NULL DEFAULT 0,
            mostdamage_unjustified INTEGER NOT NULL DEFAULT 0
        )`);
        db.exec('CREATE INDEX IF NOT EXISTS idx_player_deaths_player ON player_deaths(player_id, time)');
    },

    /**
     * Versión 6: LAS CASAS, como las tablas `houses`, `house_lists` y `tile_store` de TFS.
     *
     * - `houses`: una fila por casa del mapa (el id es el del mapa). `owner` es el id del personaje
     *   (0 = libre), `paid` hasta cuándo está pagado el alquiler (milisegundos del reloj del mundo)
     *   y `warnings` cuántos avisos de impago lleva.
     * - `house_lists`: las listas de acceso, una fila por lista: `listid` 256 = invitados, 257 =
     *   subdueños, y para una puerta, su id de puerta (como TFS). `list` es el texto tal cual lo
     *   escribió el dueño, una entrada por línea.
     * - `house_items`: lo que hay en el suelo de la casa, como árbol JSON (`data`), para que lo
     *   que se deja en casa siga ahí al reiniciar.
     * - `players.balance`: el saldo del banco (en monedas de oro), la columna de TFS. De ahí se
     *   paga el alquiler.
     */
    6: (db) => {
        try {
            db.exec('ALTER TABLE players ADD COLUMN balance INTEGER NOT NULL DEFAULT 0');
        } catch (error) {
            if (!/duplicate column name/i.test(String(error.message))) {
                throw error;
            }
        }
        db.exec(`CREATE TABLE IF NOT EXISTS houses (
            id       INTEGER PRIMARY KEY,
            owner    INTEGER NOT NULL DEFAULT 0,
            paid     INTEGER NOT NULL DEFAULT 0,
            warnings INTEGER NOT NULL DEFAULT 0,
            name     TEXT    NOT NULL DEFAULT '',
            rent     INTEGER NOT NULL DEFAULT 0,
            town_id  INTEGER NOT NULL DEFAULT 0
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS house_lists (
            house_id INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
            listid   INTEGER NOT NULL,
            list     TEXT    NOT NULL DEFAULT '',
            PRIMARY KEY (house_id, listid)
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS house_items (
            house_id INTEGER PRIMARY KEY REFERENCES houses(id) ON DELETE CASCADE,
            data     TEXT    NOT NULL DEFAULT '[]'
        )`);
    },

    /**
     * Versión 7: EL CORREO que aún no ha llegado. Una carta o un paquete a alguien que no está
     * conectado no puede ir a su depósito (el depósito vive con el progreso del personaje), así
     * que espera aquí y se entrega en cuanto entra: `item` es el objeto como árbol JSON (el de
     * `objetoParaGuardar`), `town_id` la ciudad de destino y `time` cuándo se envió.
     */
    7: (db) => {
        db.exec(`CREATE TABLE IF NOT EXISTS player_mail (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            town_id   INTEGER NOT NULL DEFAULT 0,
            time      INTEGER NOT NULL,
            sender    TEXT    NOT NULL DEFAULT '',
            item      TEXT    NOT NULL
        )`);
        db.exec('CREATE INDEX IF NOT EXISTS idx_player_mail_player ON player_mail(player_id)');
    },

    /**
     * Versión 8: LA LISTA VIP EN EL SERVIDOR, la `account_viplist` de TFS. Es de la CUENTA, no del
     * personaje (todos los personajes de una cuenta ven la misma lista), y apunta a personajes por
     * id: si uno cambia de nombre, sigue en la lista. `description`, `icon` y `notify` son los
     * campos de TFS para la nota, el icono y si avisar al entrar.
     */
    8: (db) => {
        db.exec(`CREATE TABLE IF NOT EXISTS account_viplist (
            account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            description TEXT    NOT NULL DEFAULT '',
            icon        INTEGER NOT NULL DEFAULT 0,
            notify      INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (account_id, player_id)
        )`);
    },

    /**
     * Versión 9: LOS GREMIOS, con las tablas de TFS: `guilds` (el dueño, cuándo se fundó y el
     * mensaje del día), `guild_ranks` (`level` 3 = líder, 2 = vicelíder, 1 = miembro), `guild_membership`
     * (un personaje está en un gremio como mucho: la clave es el personaje) y `guild_invites`.
     * `guild_wars` también, aunque las guerras se dejen para más adelante: así no hará falta otra
     * migración para empezarlas.
     */
    9: (db) => {
        db.exec(`CREATE TABLE IF NOT EXISTS guilds (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            ownerid      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            creationdata INTEGER NOT NULL,
            motd         TEXT    NOT NULL DEFAULT ''
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS guild_ranks (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
            name     TEXT    NOT NULL,
            level    INTEGER NOT NULL
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS guild_membership (
            player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
            guild_id  INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
            rank_id   INTEGER NOT NULL REFERENCES guild_ranks(id) ON DELETE CASCADE,
            nick      TEXT    NOT NULL DEFAULT ''
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS guild_invites (
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            guild_id  INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
            PRIMARY KEY (player_id, guild_id)
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS guild_wars (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            guild1  INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
            guild2  INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
            name1   TEXT    NOT NULL,
            name2   TEXT    NOT NULL,
            status  INTEGER NOT NULL DEFAULT 0,
            started INTEGER NOT NULL DEFAULT 0,
            ended   INTEGER NOT NULL DEFAULT 0
        )`);
        db.exec('CREATE INDEX IF NOT EXISTS idx_guild_membership_guild ON guild_membership(guild_id)');
    },

    /**
     * Versión 10: LOS CASTIGOS, con las tablas de TFS: `account_bans` (uno vigente por cuenta),
     * `account_ban_history` (todos los que hubo), `ip_bans` y `player_namelocks` (un personaje que
     * tiene que cambiar de nombre antes de volver a jugar). Las horas van en SEGUNDOS, como TFS, y
     * `expires_at` 0 es para siempre.
     */
    10: (db) => {
        db.exec(`CREATE TABLE IF NOT EXISTS account_bans (
            account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
            reason     TEXT    NOT NULL DEFAULT '',
            banned_at  INTEGER NOT NULL,
            expires_at INTEGER NOT NULL DEFAULT 0,
            banned_by  INTEGER NOT NULL DEFAULT 0
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS account_ban_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            reason     TEXT    NOT NULL DEFAULT '',
            banned_at  INTEGER NOT NULL,
            expired_at INTEGER NOT NULL DEFAULT 0,
            banned_by  INTEGER NOT NULL DEFAULT 0
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS ip_bans (
            ip         TEXT    PRIMARY KEY,
            reason     TEXT    NOT NULL DEFAULT '',
            banned_at  INTEGER NOT NULL,
            expires_at INTEGER NOT NULL DEFAULT 0,
            banned_by  INTEGER NOT NULL DEFAULT 0
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS player_namelocks (
            player_id     INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
            reason        TEXT    NOT NULL DEFAULT '',
            namelocked_at INTEGER NOT NULL,
            namelocked_by INTEGER NOT NULL DEFAULT 0
        )`);
    },

    /**
     * Versión 11: `players.lastip`, LA ÚLTIMA IP desde la que entró cada personaje (la columna de
     * TFS). Sin ella, `/ipban` sólo podía con quien estuviera dentro, porque la IP la sabe la conexión.
     */
    11: (db) => {
        try {
            db.exec("ALTER TABLE players ADD COLUMN lastip TEXT NOT NULL DEFAULT ''");
        } catch (error) {
            if (!/duplicate column name/i.test(String(error.message))) {
                throw error;
            }
        }
    }
};

/**
 * Deriva la clave de contraseña.
 *
 * TFS usa SHA1 sin sal, que hoy no protege nada: cualquiera con la base puede
 * sacar las contraseñas de sus jugadores. `scrypt` viene en Node, está pensado para
 * resistir ataques con hardware dedicado y apenas cuesta unas líneas más. Es una
 * divergencia deliberada de la referencia.
 */
function hashPassword(password, salt) {
    return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

/** Comparación en tiempo constante, para no filtrar la contraseña por el tiempo. */
function passwordsMatch(expected, actual) {
    const a = Buffer.from(String(expected), 'hex');
    const b = Buffer.from(String(actual), 'hex');

    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(a, b);
}

class Database {
    constructor(options) {
        const opts = options || {};

        this.file = opts.file;
        this.log = opts.logger || null;

        /** Inyectable para las pruebas. */
        this.now = opts.now || (() => Date.now());

        this.db = null;
        this.stats = { saves: 0, loads: 0, transactions: 0 };
    }

    // -----------------------------------------------------------------------
    // Ciclo de vida
    // -----------------------------------------------------------------------

    open() {
        if (this.db) {
            return this;
        }

        // La carpeta puede no existir: es el fallo más tonto y más frecuente al
        // desplegar, y SQLite no la crea por su cuenta.
        const directory = path.dirname(this.file);
        if (directory && directory !== '.' && !fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        const { DatabaseSync } = require('node:sqlite');
        this.db = new DatabaseSync(this.file);

        // Las tres configuraciones que no se pueden olvidar. Ver la cabecera.
        this.db.exec('PRAGMA foreign_keys = ON');
        this.db.exec('PRAGMA journal_mode = WAL');
        this.db.exec('PRAGMA synchronous = NORMAL');

        this.migrate();

        if (this.log) {
            this.log.info('base de datos: ' + this.file);
        }
        return this;
    }

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        return true;
    }

    get isOpen() {
        return this.db !== null;
    }

    /**
     * Crea las tablas y lleva la versión del esquema.
     *
     * La versión existe para poder cambiar la estructura más adelante sin adivinar
     * en qué estado está la base de alguien. TFS no la lleva, y eso convierte cada
     * actualización en un `ALTER TABLE` a mano que hay que recordar.
     */
    migrate() {
        this.db.exec('BEGIN');

        try {
            // Las tablas se crean sólo si no existen, así que en una base que ya tiene
            // datos esto no hace nada. Lo que la pone al día es lo de después.
            SCHEMA.forEach((statement) => this.db.exec(statement));

            const row = this.db.prepare('SELECT value FROM meta WHERE key = ?')
                .get('schema_version');

            const current = row ? Number(row.value) : null;

            if (current === null) {
                // Base nueva: las tablas se acaban de crear con el esquema de la
                // versión 1, así que se marca así y las migraciones la llevan al día
                // igual que a una que ya tuviera datos. Es lo que garantiza que el
                // camino de una base nueva y el de una vieja sean EL MISMO: si se
                // marcara directamente en la última versión, una base nueva tendría
                // un esquema que nunca se ha probado a través de las migraciones.
                this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
                    .run('schema_version', '1');
            } else if (current > SCHEMA_VERSION) {
                throw new Error('la base de datos es de una version mas nueva (' +
                    current + ') que este motor (' + SCHEMA_VERSION + ')');
            }

            // Se aplican las migraciones que falten, EN ORDEN y una por una.
            for (let version = (current === null ? 1 : current) + 1;
                version <= SCHEMA_VERSION; version += 1) {

                const migration = MIGRATIONS[version];
                if (!migration) {
                    throw new Error('falta la migracion a la version ' + version +
                        ': la base no se puede poner al dia');
                }

                migration(this.db);
                this.db.prepare('UPDATE meta SET value = ? WHERE key = ?')
                    .run(String(version), 'schema_version');

                if (this.log) {
                    this.log.info('base de datos migrada a la version ' + version);
                }
            }

            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }

        return this;
    }

    /**
     * Ejecuta algo dentro de una transacción.
     *
     * Se usa `BEGIN IMMEDIATE` y no `BEGIN` a secas: el modo diferido empieza a
     * escribir sólo cuando hace falta, y entonces una transacción que empezó
     * leyendo puede fallar al escribir si otro la adelantó. Con `IMMEDIATE` se toma
     * el bloqueo de escritura desde el principio y eso no pasa.
     */
    transaction(work) {
        this.db.exec('BEGIN IMMEDIATE');
        this.stats.transactions += 1;

        try {
            const result = work();
            this.db.exec('COMMIT');
            return result;
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    // -----------------------------------------------------------------------
    // Cuentas
    // -----------------------------------------------------------------------

    /**
     * Crea una cuenta.
     *
     * @returns {Object} { id, name } o lanza si el nombre ya existe
     */
    createAccount(options) {
        const opts = options || {};
        const name = String(opts.name || '').trim();

        if (!name) {
            throw new Error('la cuenta necesita un nombre');
        }
        if (!opts.password) {
            throw new Error('la cuenta necesita una contrasena');
        }

        const salt = crypto.randomBytes(16).toString('hex');
        const hash = hashPassword(opts.password, salt);

        try {
            const result = this.db.prepare(
                `INSERT INTO accounts (name, password_hash, password_salt, email, created_at)
                 VALUES (?, ?, ?, ?, ?)`
            ).run(name, hash, salt, opts.email || null, this.now());

            return { id: Number(result.lastInsertRowid), name: name };
        } catch (error) {
            if (/UNIQUE/i.test(String(error.message))) {
                throw new Error('ya existe una cuenta con el nombre "' + name + '"');
            }
            throw error;
        }
    }

    findAccount(name) {
        return this.db.prepare(
            'SELECT * FROM accounts WHERE name = ? COLLATE NOCASE'
        ).get(String(name)) || null;
    }

    /**
     * Comprueba unas credenciales.
     *
     * Devuelve `null` tanto si la cuenta no existe como si la contraseña está mal, y
     * eso es a propósito: distinguirlos permitiría averiguar qué nombres de cuenta
     * existen probando uno a uno.
     */
    authenticate(name, password) {
        const account = this.findAccount(name);
        if (!account) {
            // Se calcula igualmente una derivación para que el tiempo de respuesta no
            // delate que la cuenta no existe.
            hashPassword(password, 'sal-falsa-para-igualar-el-tiempo');
            return null;
        }

        const expected = hashPassword(password, account.password_salt);
        if (!passwordsMatch(account.password_hash, expected)) {
            return null;
        }

        this.db.prepare('UPDATE accounts SET last_login = ? WHERE id = ?')
            .run(this.now(), account.id);

        return account;
    }

    // -----------------------------------------------------------------------
    // Personajes
    // -----------------------------------------------------------------------

    listCharacters(accountId) {
        return this.db.prepare(
            `SELECT id, name, vocation, level, experience, online
             FROM players WHERE account_id = ? ORDER BY name`
        ).all(Number(accountId));
    }

    findCharacterByName(name) {
        return this.db.prepare(
            'SELECT * FROM players WHERE name = ? COLLATE NOCASE'
        ).get(String(name)) || null;
    }

    /**
     * Crea un personaje.
     *
     * El nombre es único en TODO el servidor y no sólo dentro de la cuenta, porque
     * es como funciona un juego: dos jugadores con el mismo nombre serían
     * indistinguibles al hablar o al comerciar.
     */
    createCharacter(accountId, name, options) {
        const opts = options || {};
        const clean = String(name || '').trim();

        if (!clean) {
            throw new Error('el personaje necesita un nombre');
        }

        try {
            const result = this.db.prepare(
                `INSERT INTO players
                 (account_id, name, vocation, sex, level, experience, health, max_health,
                  direction, pos_x, pos_y, pos_z, created_at, town_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?)`
            ).run(
                Number(accountId),
                clean,
                opts.vocation || 'None',
                opts.sex === 'female' ? 'female' : 'male',
                Math.max(1, Number(opts.level) || 1),
                Math.max(0, Number(opts.experience) || 0),
                opts.maxHealth === undefined ? 150 : Number(opts.maxHealth),
                opts.maxHealth === undefined ? 150 : Number(opts.maxHealth),
                opts.x === undefined ? 0 : Number(opts.x),
                opts.y === undefined ? 0 : Number(opts.y),
                opts.z === undefined ? 7 : Number(opts.z),
                this.now(),
                Number(opts.townId) || 0
            );

            return this.db.prepare('SELECT * FROM players WHERE id = ?')
                .get(Number(result.lastInsertRowid));
        } catch (error) {
            if (/UNIQUE/i.test(String(error.message))) {
                throw new Error('ya existe un personaje llamado "' + clean + '"');
            }
            throw error;
        }
    }

    /**
     * Cambia el GRUPO de acceso de un personaje (groups.js) por su nombre. Va aparte del guardado
     * normal a propósito: el grupo no lo cambia el juego al guardar, sólo quien administra
     * (`npm run grupo` o `/grupo`), y así un guardado no puede deshacer un ascenso.
     *
     * @returns {boolean} si existía el personaje
     */
    setCharacterGroup(name, groupId) {
        const r = this.db.prepare('UPDATE players SET group_id = ? WHERE name = ? COLLATE NOCASE')
            .run(Math.max(1, Number(groupId) || 1), String(name || '').trim());
        return r.changes > 0;
    }

    /** El grupo de un personaje por su nombre, o null si no existe. */
    characterGroup(name) {
        const row = this.db.prepare('SELECT group_id FROM players WHERE name = ? COLLATE NOCASE')
            .get(String(name || '').trim());
        return row ? Number(row.group_id) || 1 : null;
    }

    /**
     * ¿Está ese personaje dentro del mundo ya?
     *
     * Existe para impedir que la misma cuenta entre dos veces a la vez, que es un
     * fallo que se manifiesta de formas raras: dos cuerpos con el mismo nombre, el
     * inventario duplicado al guardar, o el personaje saltando de un sitio a otro.
     */
    isCharacterOnline(characterId) {
        const row = this.db.prepare('SELECT online FROM players WHERE id = ?')
            .get(Number(characterId));
        return !!(row && row.online);
    }

    setCharacterOnline(characterId, online) {
        this.db.prepare('UPDATE players SET online = ? WHERE id = ?')
            .run(online ? 1 : 0, Number(characterId));
        return true;
    }

    /**
     * Al arrancar, NINGÚN personaje está dentro.
     *
     * La marca de "dentro" sólo vale mientras el proceso vive. Si el servidor se
     * cayó con gente jugando, quedaría marcada como dentro para siempre y esos
     * jugadores no podrían volver a entrar nunca. Se limpia al abrir.
     */
    clearOnlineFlags() {
        const result = this.db.prepare('UPDATE players SET online = 0 WHERE online = 1').run();
        return Number(result.changes || 0);
    }

    // -----------------------------------------------------------------------
    // Cargar y guardar
    // -----------------------------------------------------------------------

    /**
     * Carga un personaje completo: sus datos, sus items y sus storages.
     *
     * @returns {{player: Object, items: Array, storages: Object}|null}
     */
    loadCharacter(characterId) {
        const row = this.db.prepare('SELECT * FROM players WHERE id = ?')
            .get(Number(characterId));

        if (!row) {
            return null;
        }

        const items = this.db.prepare(
            `SELECT id, slot, position, item_type, count, attributes
             FROM player_items WHERE player_id = ? ORDER BY slot, position`
        ).all(row.id).map((item) => ({
            id: item.id,
            slot: item.slot,
            position: item.position,
            typeId: item.item_type,
            count: item.count,
            attributes: item.attributes ? JSON.parse(item.attributes) : null
        }));

        const storages = {};
        this.db.prepare('SELECT key, value FROM player_storages WHERE player_id = ?')
            .all(row.id).forEach((storage) => {
                storages[storage.key] = storage.value;
            });

        this.stats.loads += 1;

        return {
            player: {
                id: row.id,
                accountId: row.account_id,
                name: row.name,
                vocation: row.vocation,
                sex: row.sex === 'female' ? 'female' : 'male',
                /** Maná, almas, stamina, nivel mágico y skills (null en una fila de antes). */
                progress: row.progress ? JSON.parse(row.progress) : null,
                level: row.level,
                experience: row.experience,
                health: row.health,
                maxHealth: row.max_health,
                direction: row.direction,
                position: { x: row.pos_x, y: row.pos_y, z: row.pos_z },
                /** El grupo de acceso (groups.js), la ciudad y la montura (versión 4 del esquema). */
                groupId: Number(row.group_id) || 1,
                townId: Number(row.town_id) || 0,
                mountId: Number(row.mount_id) || 0,
                mounted: Number(row.mounted) === 1,
                /** El saldo del banco, en monedas de oro (versión 6). */
                balance: Math.max(0, Number(row.balance) || 0),
                /**
                 * El aspecto. `looktype` a 0 significa que la fila es de ANTES de que
                 * existieran los aspectos, y quien la lea tiene que decidir qué hacer;
                 * aquí se devuelve 0 y es el repositorio el que pone el de por defecto,
                 * porque el valor por defecto es una decisión del juego y no de la base.
                 */
                outfit: {
                    lookType: row.looktype,
                    head: row.lookhead,
                    body: row.lookbody,
                    legs: row.looklegs,
                    feet: row.lookfeet,
                    addons: row.lookaddons
                }
            },
            items: items,
            storages: storages
        };
    }

    /**
     * Guarda un personaje: datos, items y storages, todo o nada.
     *
     * Va en UNA transacción porque las tres cosas son el mismo estado. Guardar el
     * personaje y fallar al guardar los items dejaría a alguien con nivel nuevo y
     * sin la espada que acababa de recoger, y ese fallo es imposible de reconstruir
     * después.
     *
     * Los items se borran y se reinsertan enteros en vez de calcular diferencias.
     * Para un inventario, que son decenas de filas, es más rápido que comparar, y
     * sobre todo es imposible que se desincronice.
     */
    saveCharacter(state) {
        if (!state || !state.player) {
            throw new Error('saveCharacter necesita un personaje');
        }

        const player = state.player;

        this.transaction(() => {
            this.db.prepare(
                `UPDATE players SET
                    vocation = ?, level = ?, experience = ?, health = ?, max_health = ?,
                    direction = ?, pos_x = ?, pos_y = ?, pos_z = ?, last_login = ?,
                    looktype = ?, lookhead = ?, lookbody = ?, looklegs = ?, lookfeet = ?,
                    lookaddons = ?, sex = ?, progress = ?, town_id = ?, mount_id = ?, mounted = ?
                 WHERE id = ?`
            ).run(
                player.vocation || 'None',
                Number(player.level || 1),
                Number(player.experience || 0),
                Number(player.health || 0),
                Number(player.maxHealth || 0),
                Number(player.direction || 2),
                Number(player.position.x),
                Number(player.position.y),
                Number(player.position.z),
                this.now(),
                Number(player.outfit && player.outfit.lookType || 0),
                Number(player.outfit && player.outfit.head || 0),
                Number(player.outfit && player.outfit.body || 0),
                Number(player.outfit && player.outfit.legs || 0),
                Number(player.outfit && player.outfit.feet || 0),
                Number(player.outfit && player.outfit.addons || 0),
                player.sex === 'female' ? 'female' : 'male',
                player.progress ? JSON.stringify(player.progress) : null,
                Number(player.townId) || 0,
                Number(player.mountId) || 0,
                player.mounted ? 1 : 0,
                Number(player.id)
            );

            // El saldo del banco va con lo demás (las monedas que se depositan salen del inventario
            // en este mismo guardado). Un estado sin saldo, de quien no lo conoce, no lo toca.
            if (player.balance !== undefined) {
                this.db.prepare('UPDATE players SET balance = ? WHERE id = ?')
                    .run(Math.max(0, Math.trunc(Number(player.balance) || 0)), Number(player.id));
            }

            this.db.prepare('DELETE FROM player_items WHERE player_id = ?')
                .run(Number(player.id));

            const insertItem = this.db.prepare(
                `INSERT INTO player_items
                 (player_id, slot, position, item_type, count, attributes)
                 VALUES (?, ?, ?, ?, ?, ?)`
            );

            (state.items || []).forEach((item, index) => {
                insertItem.run(
                    Number(player.id),
                    // Una entrada SIN ranura es una que se lleva encima, y eso es estar dentro de
                    // la mochila: `inside`. Antes el valor por defecto era `backpack`, que ahora
                    // significa otra cosa -la ranura de la mochila- y dejaria el objeto "puesto".
                    String(item.slot || 'inside'),
                    item.position === undefined ? index : Number(item.position),
                    Number(item.typeId),
                    Number(item.count || 1),
                    item.attributes ? JSON.stringify(item.attributes) : null
                );
            });

            this.db.prepare('DELETE FROM player_storages WHERE player_id = ?')
                .run(Number(player.id));

            const insertStorage = this.db.prepare(
                'INSERT INTO player_storages (player_id, key, value) VALUES (?, ?, ?)'
            );

            Object.keys(state.storages || {}).forEach((key) => {
                insertStorage.run(Number(player.id), String(key),
                    Number(state.storages[key]));
            });
        });

        this.stats.saves += 1;
        return true;
    }

    // -----------------------------------------------------------------------
    // Storages sueltos
    // -----------------------------------------------------------------------

    getStorage(characterId, key) {
        const row = this.db.prepare(
            'SELECT value FROM player_storages WHERE player_id = ? AND key = ?'
        ).get(Number(characterId), String(key));

        return row ? row.value : null;
    }

    setStorage(characterId, key, value) {
        this.db.prepare(
            `INSERT INTO player_storages (player_id, key, value) VALUES (?, ?, ?)
             ON CONFLICT (player_id, key) DO UPDATE SET value = excluded.value`
        ).run(Number(characterId), String(key), Number(value));

        return true;
    }

    // -----------------------------------------------------------------------
    // El historial de muertes (versión 5)
    // -----------------------------------------------------------------------

    /**
     * Apunta una muerte. `time` en milisegundos (el reloj del mundo) y se guarda en segundos, como
     * TFS. Los textos se recortan a lo que guarda TFS (255 y 100).
     *
     * @returns {number} el id de la fila
     */
    addDeath(characterId, death) {
        const d = death || {};
        const result = this.db.prepare(
            `INSERT INTO player_deaths (player_id, time, level, killed_by, is_player, mostdamage_by,
                mostdamage_is_player, unjustified, mostdamage_unjustified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            Number(characterId),
            Math.floor((d.time === undefined ? this.now() : Number(d.time)) / 1000),
            Math.max(1, Number(d.level) || 1),
            String(d.killedBy || '').slice(0, 255),
            d.isPlayer ? 1 : 0,
            String(d.mostDamageBy || '').slice(0, 100),
            d.mostDamageIsPlayer ? 1 : 0,
            d.unjustified ? 1 : 0,
            d.mostDamageUnjustified ? 1 : 0
        );
        return Number(result.lastInsertRowid);
    }

    /**
     * Las últimas muertes de un personaje, de la más nueva a la más vieja (`time` en milisegundos).
     *
     * @returns {Array<{time, level, killedBy, isPlayer, mostDamageBy, unjustified}>}
     */
    listDeaths(characterId, limit) {
        const n = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 10)));
        return this.db.prepare(
            `SELECT time, level, killed_by, is_player, mostdamage_by, mostdamage_is_player, unjustified
               FROM player_deaths WHERE player_id = ? ORDER BY time DESC, id DESC LIMIT ?`
        ).all(Number(characterId), n).map((row) => ({
            time: Number(row.time) * 1000,
            level: Number(row.level),
            killedBy: row.killed_by,
            isPlayer: Boolean(row.is_player),
            mostDamageBy: row.mostdamage_by,
            mostDamageIsPlayer: Boolean(row.mostdamage_is_player),
            unjustified: Boolean(row.unjustified)
        }));
    }

    // -----------------------------------------------------------------------
    // Las casas (versión 6)
    // -----------------------------------------------------------------------
    //
    // Lo que usa `engine/world/casas.js`: una fila por casa del mapa, sus listas de acceso y lo que
    // hay dentro (JSON), y el saldo del banco de cada personaje, que es de donde se paga.

    /** Las casas guardadas, con el nombre de su dueño ('' si no tiene, o si el personaje ya no existe). */
    loadHouses() {
        return this.db.prepare(
            `SELECT h.id, h.owner, h.paid, h.warnings, COALESCE(p.name, '') AS owner_name
               FROM houses h LEFT JOIN players p ON p.id = h.owner`
        ).all().map((row) => ({
            id: Number(row.id),
            owner: Number(row.owner) || 0,
            ownerName: row.owner_name,
            paid: Number(row.paid) || 0,
            warnings: Number(row.warnings) || 0
        }));
    }

    /**
     * Da de alta una casa del mapa, o pone al día su nombre, su alquiler y su ciudad: esos los manda
     * el mapa. El dueño, el pago y los avisos no se tocan.
     */
    syncHouse(house) {
        this.db.prepare(
            `INSERT INTO houses (id, name, rent, town_id) VALUES (?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name, rent = excluded.rent, town_id = excluded.town_id`
        ).run(Number(house.id), String(house.name || ''), Number(house.rent) || 0, Number(house.townId) || 0);
        return true;
    }

    /** El dueño (id del personaje, 0 = libre), hasta cuándo está pagada (ms) y los avisos. */
    saveHouse(house) {
        this.db.prepare('UPDATE houses SET owner = ?, paid = ?, warnings = ? WHERE id = ?')
            .run(Number(house.owner) || 0, Math.trunc(Number(house.paid) || 0), Number(house.warnings) || 0,
                Number(house.id));
        return true;
    }

    /** Todas las listas de acceso: `[{houseId, listId, list}]`. */
    loadHouseLists() {
        return this.db.prepare('SELECT house_id, listid, list FROM house_lists').all().map((row) => ({
            houseId: Number(row.house_id),
            listId: Number(row.listid),
            list: String(row.list || '')
        }));
    }

    /** Guarda una lista (256 invitados, 257 subdueños, o el número de una puerta); vacía, la borra. */
    saveHouseList(houseId, listId, text) {
        if (!String(text || '').trim()) {
            this.db.prepare('DELETE FROM house_lists WHERE house_id = ? AND listid = ?')
                .run(Number(houseId), Number(listId));
            return true;
        }
        this.db.prepare(
            `INSERT INTO house_lists (house_id, listid, list) VALUES (?, ?, ?)
             ON CONFLICT (house_id, listid) DO UPDATE SET list = excluded.list`
        ).run(Number(houseId), Number(listId), String(text));
        return true;
    }

    /** Borra todas las listas de una casa (al cambiar de dueño). */
    clearHouseLists(houseId) {
        this.db.prepare('DELETE FROM house_lists WHERE house_id = ?').run(Number(houseId));
        return true;
    }

    /** Lo que hay dentro de cada casa: un Map de id de casa al árbol guardado (sólo las que tienen fila). */
    loadHouseItems() {
        const casas = new Map();
        this.db.prepare('SELECT house_id, data FROM house_items').all().forEach((row) => {
            try {
                casas.set(Number(row.house_id), JSON.parse(row.data || '[]'));
            } catch (error) {
                if (this.log) {
                    this.log.error('lo guardado en la casa ' + row.house_id + ' no se puede leer: ' + error.message);
                }
            }
        });
        return casas;
    }

    saveHouseItems(houseId, data) {
        this.db.prepare(
            `INSERT INTO house_items (house_id, data) VALUES (?, ?)
             ON CONFLICT (house_id) DO UPDATE SET data = excluded.data`
        ).run(Number(houseId), JSON.stringify(data || []));
        return true;
    }

    /** El saldo del banco de un personaje, o null si no existe. */
    getBalance(characterId) {
        const row = this.db.prepare('SELECT balance FROM players WHERE id = ?').get(Number(characterId));
        return row ? Math.max(0, Number(row.balance) || 0) : null;
    }

    setBalance(characterId, balance) {
        const r = this.db.prepare('UPDATE players SET balance = ? WHERE id = ?')
            .run(Math.max(0, Math.trunc(Number(balance) || 0)), Number(characterId));
        return r.changes > 0;
    }

    /**
     * Suma (o resta, en negativo) al saldo de un personaje, sin dejarlo por debajo de cero: lo que se
     * usa con quien no está conectado (una transferencia, el alquiler). Va en una sola sentencia, así
     * que no hay un momento en que se haya leído y no escrito.
     *
     * @returns {boolean} false si no existe o no le alcanza
     */
    addBalance(characterId, delta) {
        const d = Math.trunc(Number(delta) || 0);
        const r = this.db.prepare('UPDATE players SET balance = balance + ? WHERE id = ? AND balance + ? >= 0')
            .run(d, Number(characterId), d);
        return r.changes > 0;
    }

    // -----------------------------------------------------------------------
    // El correo (versión 7)
    // -----------------------------------------------------------------------

    /**
     * Un personaje para el correo, por su id (un número) o por su nombre (sin mayúsculas): lo justo
     * para mandarle algo, esté dentro o no. Null si no existe.
     *
     * @returns {{id: number, name: string, townId: number}|null}
     */
    findCharacterForMail(idOrName) {
        const porId = typeof idOrName === 'number' || /^\d+$/.test(String(idOrName || ''));
        const row = porId
            ? this.db.prepare('SELECT id, name, town_id FROM players WHERE id = ?').get(Number(idOrName))
            : this.db.prepare('SELECT id, name, town_id FROM players WHERE name = ? COLLATE NOCASE')
                .get(String(idOrName || '').trim());
        return row ? { id: Number(row.id), name: row.name, townId: Number(row.town_id) || 0 } : null;
    }

    /**
     * Deja correo para un personaje que no está dentro. `item` es el árbol del objeto (el de
     * `objetoParaGuardar`) y va en JSON; `time` en milisegundos (el reloj del mundo), y se guarda
     * en segundos, como las muertes.
     *
     * @returns {number} el id de la fila
     */
    addMail(characterId, mail) {
        const m = mail || {};
        const result = this.db.prepare(
            'INSERT INTO player_mail (player_id, town_id, time, sender, item) VALUES (?, ?, ?, ?, ?)'
        ).run(
            Number(characterId),
            Number(m.townId) || 0,
            Math.floor((m.time === undefined ? this.now() : Number(m.time)) / 1000),
            String(m.sender || '').slice(0, 255),
            JSON.stringify(m.item || null)
        );
        return Number(result.lastInsertRowid);
    }

    /**
     * El correo que espera a un personaje, del más viejo al más nuevo (`time` en milisegundos). Una
     * fila cuyo JSON no se puede leer sale con `item` a null: quien entrega decide qué hacer con ella.
     *
     * @returns {Array<{id, townId, time, sender, item}>}
     */
    listMail(characterId) {
        return this.db.prepare(
            'SELECT id, town_id, time, sender, item FROM player_mail WHERE player_id = ? ORDER BY time, id'
        ).all(Number(characterId)).map((row) => {
            let item = null;
            try {
                item = JSON.parse(row.item);
            } catch (error) {
                item = null;
            }
            return {
                id: Number(row.id),
                townId: Number(row.town_id) || 0,
                time: Number(row.time) * 1000,
                sender: row.sender,
                item: item
            };
        });
    }

    /** Borra las filas de correo ya entregadas. Devuelve cuántas borró. */
    deleteMail(ids) {
        const lista = (Array.isArray(ids) ? ids : [ids]).map(Number).filter((n) => n > 0);
        if (lista.length === 0) {
            return 0;
        }
        const borrar = this.db.prepare('DELETE FROM player_mail WHERE id = ?');
        return this.transaction(() => lista.reduce((n, id) => n + Number(borrar.run(id).changes), 0));
    }

    // -----------------------------------------------------------------------
    // La lista VIP (versión 8)
    // -----------------------------------------------------------------------

    // Lo que usa `engine/world/vip.js`: la lista es de la CUENTA y apunta a personajes por su id.

    /**
     * La lista VIP de una cuenta, por nombre.
     *
     * @returns {Array<{playerId: number, name: string, description: string, icon: number, notify: boolean}>}
     */
    listVip(accountId) {
        return this.db.prepare(
            `SELECT v.player_id, p.name, v.description, v.icon, v.notify
             FROM account_viplist v JOIN players p ON p.id = v.player_id
             WHERE v.account_id = ? ORDER BY p.name COLLATE NOCASE`
        ).all(Number(accountId)).map((row) => ({
            playerId: Number(row.player_id),
            name: row.name,
            description: row.description,
            icon: Number(row.icon) || 0,
            notify: !!row.notify
        }));
    }

    /** Añade un personaje a la lista de una cuenta. Devuelve si no estaba. */
    addVip(accountId, playerId, options) {
        const o = options || {};
        const r = this.db.prepare(
            `INSERT OR IGNORE INTO account_viplist (account_id, player_id, description, icon, notify)
             VALUES (?, ?, ?, ?, ?)`
        ).run(Number(accountId), Number(playerId), String(o.description || '').slice(0, 128),
            Number(o.icon) || 0, o.notify ? 1 : 0);
        return Number(r.changes) > 0;
    }

    /** Quita un personaje de la lista de una cuenta. Devuelve si estaba. */
    removeVip(accountId, playerId) {
        const r = this.db.prepare('DELETE FROM account_viplist WHERE account_id = ? AND player_id = ?')
            .run(Number(accountId), Number(playerId));
        return Number(r.changes) > 0;
    }

    /** Las cuentas que tienen a ese personaje en su lista (a quién avisar cuando entra o sale). */
    vipFollowers(playerId) {
        return this.db.prepare('SELECT account_id FROM account_viplist WHERE player_id = ?')
            .all(Number(playerId)).map((row) => Number(row.account_id));
    }

    // -----------------------------------------------------------------------
    // Los gremios (versión 9)
    // -----------------------------------------------------------------------

    // Lo que usa `engine/world/gremios.js`. Las reglas (quién puede invitar, echar, ascender) son del
    // mundo; aquí sólo se lee y se escribe. Las horas, en SEGUNDOS, como en TFS.

    /**
     * Funda un gremio: la fila, sus tres rangos (`rangos`: `[{name, level}]`, del líder al miembro)
     * y al fundador como líder, todo en una transacción. Lanza si el nombre ya existe.
     *
     * @returns {number} el id del gremio
     */
    createGuild(name, ownerId, creationTime, rangos) {
        return this.transaction(() => {
            const r = this.db.prepare('INSERT INTO guilds (name, ownerid, creationdata, motd) VALUES (?, ?, ?, ?)')
                .run(String(name), Number(ownerId), Math.floor(Number(creationTime) || 0), '');
            const guildId = Number(r.lastInsertRowid);
            const insertar = this.db.prepare('INSERT INTO guild_ranks (guild_id, name, level) VALUES (?, ?, ?)');
            let lider = 0;
            (rangos || []).forEach((rango) => {
                const id = Number(insertar.run(guildId, String(rango.name), Number(rango.level)).lastInsertRowid);
                if (Number(rango.level) === 3) {
                    lider = id;
                }
            });
            this.db.prepare('DELETE FROM guild_invites WHERE player_id = ?').run(Number(ownerId));
            this.db.prepare(
                `INSERT INTO guild_membership (player_id, guild_id, rank_id, nick) VALUES (?, ?, ?, '')
                 ON CONFLICT (player_id) DO UPDATE SET guild_id = excluded.guild_id, rank_id = excluded.rank_id, nick = ''`
            ).run(Number(ownerId), guildId, lider);
            return guildId;
        });
    }

    /** Un gremio por su id (un número) o su nombre (sin mayúsculas), o null. */
    findGuild(idOrName) {
        const porId = typeof idOrName === 'number';
        const row = porId
            ? this.db.prepare('SELECT * FROM guilds WHERE id = ?').get(Number(idOrName))
            : this.db.prepare('SELECT * FROM guilds WHERE name = ? COLLATE NOCASE').get(String(idOrName || '').trim());
        return row ? {
            id: Number(row.id),
            name: row.name,
            ownerId: Number(row.ownerid),
            creationData: Number(row.creationdata) || 0,
            motd: row.motd || ''
        } : null;
    }

    /** Los rangos de un gremio, del más alto al más bajo: `[{id, name, level}]`. */
    guildRanks(guildId) {
        return this.db.prepare('SELECT id, name, level FROM guild_ranks WHERE guild_id = ? ORDER BY level DESC, id')
            .all(Number(guildId)).map((row) => ({ id: Number(row.id), name: row.name, level: Number(row.level) }));
    }

    /** El gremio de un personaje: `{guildId, rankId, nick}`, o null si no está en ninguno. */
    guildMembership(playerId) {
        const row = this.db.prepare('SELECT guild_id, rank_id, nick FROM guild_membership WHERE player_id = ?')
            .get(Number(playerId));
        return row ? { guildId: Number(row.guild_id), rankId: Number(row.rank_id), nick: row.nick || '' } : null;
    }

    /**
     * Los miembros de un gremio, del rango más alto al más bajo y por nombre:
     * `[{playerId, name, sex, rankId, rankName, rankLevel, nick}]`.
     */
    guildMembers(guildId) {
        return this.db.prepare(
            `SELECT m.player_id, p.name, p.sex, m.rank_id, r.name AS rank_name, r.level AS rank_level, m.nick
             FROM guild_membership m
             JOIN players p ON p.id = m.player_id
             JOIN guild_ranks r ON r.id = m.rank_id
             WHERE m.guild_id = ? ORDER BY r.level DESC, p.name COLLATE NOCASE`
        ).all(Number(guildId)).map((row) => ({
            playerId: Number(row.player_id),
            name: row.name,
            sex: row.sex,
            rankId: Number(row.rank_id),
            rankName: row.rank_name,
            rankLevel: Number(row.rank_level),
            nick: row.nick || ''
        }));
    }

    /**
     * Mete a un personaje en un gremio con un rango (o le cambia el gremio). Al entrar se borran sus
     * invitaciones, como en TFS: ya no le sirven.
     */
    setGuildMembership(playerId, guildId, rankId, nick) {
        return this.transaction(() => {
            this.db.prepare('DELETE FROM guild_invites WHERE player_id = ?').run(Number(playerId));
            this.db.prepare(
                `INSERT INTO guild_membership (player_id, guild_id, rank_id, nick) VALUES (?, ?, ?, ?)
                 ON CONFLICT (player_id) DO UPDATE SET guild_id = excluded.guild_id, rank_id = excluded.rank_id,
                 nick = excluded.nick`
            ).run(Number(playerId), Number(guildId), Number(rankId), String(nick || ''));
            return true;
        });
    }

    /** Lo saca de su gremio. Devuelve si estaba en alguno. */
    removeGuildMembership(playerId) {
        return this.db.prepare('DELETE FROM guild_membership WHERE player_id = ?').run(Number(playerId)).changes > 0;
    }

    setGuildRank(playerId, rankId) {
        return this.db.prepare('UPDATE guild_membership SET rank_id = ? WHERE player_id = ?')
            .run(Number(rankId), Number(playerId)).changes > 0;
    }

    setGuildNick(playerId, nick) {
        return this.db.prepare('UPDATE guild_membership SET nick = ? WHERE player_id = ?')
            .run(String(nick || ''), Number(playerId)).changes > 0;
    }

    setGuildMotd(guildId, motd) {
        return this.db.prepare('UPDATE guilds SET motd = ? WHERE id = ?')
            .run(String(motd || ''), Number(guildId)).changes > 0;
    }

    setGuildOwner(guildId, ownerId) {
        return this.db.prepare('UPDATE guilds SET ownerid = ? WHERE id = ?')
            .run(Number(ownerId), Number(guildId)).changes > 0;
    }

    /** Disuelve un gremio: con él se van sus rangos, sus miembros y sus invitaciones (ON DELETE CASCADE). */
    deleteGuild(guildId) {
        return this.db.prepare('DELETE FROM guilds WHERE id = ?').run(Number(guildId)).changes > 0;
    }

    addGuildInvite(playerId, guildId) {
        return this.db.prepare('INSERT OR IGNORE INTO guild_invites (player_id, guild_id) VALUES (?, ?)')
            .run(Number(playerId), Number(guildId)).changes > 0;
    }

    removeGuildInvite(playerId, guildId) {
        return this.db.prepare('DELETE FROM guild_invites WHERE player_id = ? AND guild_id = ?')
            .run(Number(playerId), Number(guildId)).changes > 0;
    }

    hasGuildInvite(playerId, guildId) {
        return !!this.db.prepare('SELECT 1 AS si FROM guild_invites WHERE player_id = ? AND guild_id = ?')
            .get(Number(playerId), Number(guildId));
    }

    /** Los gremios que han invitado a un personaje: `[{id, name}]`. */
    guildInvitesOf(playerId) {
        return this.db.prepare(
            `SELECT g.id, g.name FROM guild_invites i JOIN guilds g ON g.id = i.guild_id
             WHERE i.player_id = ? ORDER BY g.name COLLATE NOCASE`
        ).all(Number(playerId)).map((row) => ({ id: Number(row.id), name: row.name }));
    }

    // -----------------------------------------------------------------------
    // Los castigos (versión 10)
    // -----------------------------------------------------------------------

    // Lo que usa `engine/world/castigos.js`: suspender una cuenta o una IP, y bloquear un personaje
    // por su nombre. Las horas en SEGUNDOS, como en TFS; `expires_at` 0 es para siempre, y
    // `banned_by` es el id del personaje que castigó (0 si fue el sistema).

    /** La suspensión vigente de una cuenta (con el nombre de quien la puso), o null. */
    getAccountBan(accountId) {
        const row = this.db.prepare(
            `SELECT b.*, p.name AS banned_by_name FROM account_bans b
             LEFT JOIN players p ON p.id = b.banned_by WHERE b.account_id = ?`
        ).get(Number(accountId));
        return row ? {
            accountId: Number(row.account_id),
            reason: row.reason || '',
            bannedAt: Number(row.banned_at) || 0,
            expiresAt: Number(row.expires_at) || 0,
            bannedBy: Number(row.banned_by) || 0,
            bannedByName: row.banned_by_name || ''
        } : null;
    }

    /** Suspende una cuenta (o cambia la suspensión que ya tenía). */
    banAccount(accountId, ban) {
        const b = ban || {};
        this.db.prepare(
            `INSERT INTO account_bans (account_id, reason, banned_at, expires_at, banned_by) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (account_id) DO UPDATE SET reason = excluded.reason, banned_at = excluded.banned_at,
             expires_at = excluded.expires_at, banned_by = excluded.banned_by`
        ).run(Number(accountId), String(b.reason || '').slice(0, 255), Math.floor(Number(b.bannedAt) || 0),
            Math.max(0, Math.floor(Number(b.expiresAt) || 0)), Number(b.bannedBy) || 0);
        return true;
    }

    /**
     * Quita la suspensión de una cuenta y la pasa al HISTORIAL (`account_ban_history`) con la hora en
     * que acabó (`endedAt`, en segundos): la levante un GM o caduque, queda constancia.
     *
     * @returns {boolean} si tenía una
     */
    liftAccountBan(accountId, endedAt) {
        return this.transaction(() => {
            const row = this.db.prepare('SELECT * FROM account_bans WHERE account_id = ?').get(Number(accountId));
            if (!row) {
                return false;
            }
            this.db.prepare(
                `INSERT INTO account_ban_history (account_id, reason, banned_at, expired_at, banned_by)
                 VALUES (?, ?, ?, ?, ?)`
            ).run(Number(row.account_id), row.reason || '', Number(row.banned_at) || 0,
                Math.floor(Number(endedAt) || 0), Number(row.banned_by) || 0);
            this.db.prepare('DELETE FROM account_bans WHERE account_id = ?').run(Number(accountId));
            return true;
        });
    }

    /** Las suspensiones que tuvo una cuenta, de la más nueva a la más vieja. */
    accountBanHistory(accountId) {
        return this.db.prepare(
            `SELECT h.*, p.name AS banned_by_name FROM account_ban_history h
             LEFT JOIN players p ON p.id = h.banned_by WHERE h.account_id = ? ORDER BY h.banned_at DESC, h.id DESC`
        ).all(Number(accountId)).map((row) => ({
            reason: row.reason || '',
            bannedAt: Number(row.banned_at) || 0,
            expiredAt: Number(row.expired_at) || 0,
            bannedBy: Number(row.banned_by) || 0,
            bannedByName: row.banned_by_name || ''
        }));
    }

    /** La suspensión vigente de una IP, o null. */
    getIpBan(ip) {
        const row = this.db.prepare(
            `SELECT b.*, p.name AS banned_by_name FROM ip_bans b
             LEFT JOIN players p ON p.id = b.banned_by WHERE b.ip = ?`
        ).get(String(ip || ''));
        return row ? {
            ip: row.ip,
            reason: row.reason || '',
            bannedAt: Number(row.banned_at) || 0,
            expiresAt: Number(row.expires_at) || 0,
            bannedBy: Number(row.banned_by) || 0,
            bannedByName: row.banned_by_name || ''
        } : null;
    }

    /** Apunta la IP desde la que ha entrado un personaje (`players.lastip`, versión 11). */
    setLastIp(characterId, ip) {
        this.db.prepare('UPDATE players SET lastip = ? WHERE id = ?').run(String(ip || ''), Number(characterId));
    }

    banIp(ip, ban) {
        const b = ban || {};
        this.db.prepare(
            `INSERT INTO ip_bans (ip, reason, banned_at, expires_at, banned_by) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (ip) DO UPDATE SET reason = excluded.reason, banned_at = excluded.banned_at,
             expires_at = excluded.expires_at, banned_by = excluded.banned_by`
        ).run(String(ip), String(b.reason || '').slice(0, 255), Math.floor(Number(b.bannedAt) || 0),
            Math.max(0, Math.floor(Number(b.expiresAt) || 0)), Number(b.bannedBy) || 0);
        return true;
    }

    /** Quita la suspensión de una IP. Las de IP no tienen historial en TFS. */
    liftIpBan(ip) {
        return this.db.prepare('DELETE FROM ip_bans WHERE ip = ?').run(String(ip || '')).changes > 0;
    }

    /** El bloqueo de nombre de un personaje (con el nombre de quien lo puso), o null. */
    getNamelock(playerId) {
        const row = this.db.prepare(
            `SELECT n.*, p.name AS by_name FROM player_namelocks n
             LEFT JOIN players p ON p.id = n.namelocked_by WHERE n.player_id = ?`
        ).get(Number(playerId));
        return row ? {
            playerId: Number(row.player_id),
            reason: row.reason || '',
            namelockedAt: Number(row.namelocked_at) || 0,
            namelockedBy: Number(row.namelocked_by) || 0,
            namelockedByName: row.by_name || ''
        } : null;
    }

    namelockPlayer(playerId, lock) {
        const l = lock || {};
        this.db.prepare(
            `INSERT INTO player_namelocks (player_id, reason, namelocked_at, namelocked_by) VALUES (?, ?, ?, ?)
             ON CONFLICT (player_id) DO UPDATE SET reason = excluded.reason, namelocked_at = excluded.namelocked_at,
             namelocked_by = excluded.namelocked_by`
        ).run(Number(playerId), String(l.reason || '').slice(0, 255), Math.floor(Number(l.namelockedAt) || 0),
            Number(l.namelockedBy) || 0);
        return true;
    }

    removeNamelock(playerId) {
        return this.db.prepare('DELETE FROM player_namelocks WHERE player_id = ?').run(Number(playerId)).changes > 0;
    }

    // -----------------------------------------------------------------------
    // Información
    // -----------------------------------------------------------------------

    /** Cuántas filas hay de cada cosa, para el informe de arranque. */
    stats_() {
        const count = (table) =>
            Number(this.db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n);

        return {
            accounts: count('accounts'),
            players: count('players'),
            items: count('player_items'),
            storages: count('player_storages'),
            deaths: count('player_deaths'),
            saves: this.stats.saves,
            loads: this.stats.loads
        };
    }
}

module.exports = { Database, SCHEMA_VERSION, MIGRATIONS, hashPassword, passwordsMatch };
