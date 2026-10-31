'use strict';

/**
 * LOS GREMIOS (guilds), como en Tibia 8.60 y en los servidores de TFS que los llevan por comandos.
 *
 * Se mezcla en `World` igual que `casas.js` (`Object.assign(World.prototype, gremios)`): son métodos
 * del mundo, en un archivo propio porque son un sistema entero con sus reglas.
 *
 * LO QUE HAY, con las tablas de TFS (versión 9 de la base, engine/persistence/database.js):
 *
 *   - un GREMIO tiene nombre (único, sin mayúsculas), dueño, fecha de fundación y mensaje del día;
 *   - tres RANGOS, por su `level`: 3 líder, 2 vicelíder y 1 miembro. Se crean con el gremio;
 *   - cada personaje está en UN gremio como mucho, con un rango y un apodo (`nick`) opcional;
 *   - para entrar hace falta una INVITACIÓN de un líder o un vicelíder.
 *
 * QUIÉN PUEDE QUÉ (lo comprueba este archivo; los comandos, data/scripts/talkactions/gremios.js,
 * sólo dicen el resultado):
 *
 *                       líder    vicelíder              miembro
 *     invitar            sí        sí                     no
 *     echar              a todos   sólo a miembros        no
 *     ascender/degradar  sí        no                     no
 *     pasar el mando     sí        no                     no
 *     disolver           sí        no                     no
 *     mensaje del día    sí        sí                     no
 *     apodos             a todos   el suyo y de miembros  el suyo
 *
 * El líder no puede irse sin más: tiene que pasar el mando (`!guildleader`) o disolver el gremio.
 *
 * TODO VA A LA BASE (`baseDeGremios`, que pone engine.js): se puede invitar, echar o ascender a
 * quien no está conectado. Sin base de datos no hay gremios, como en TFS. Lo que SÍ se guarda en
 * memoria es lo que se pregunta a menudo —el gremio de cada jugador conectado (`player.gremio`,
 * cargado al entrar) y los datos de cada gremio— y se rehace en cuanto algo cambia.
 *
 * LO QUE USAN LOS DEMÁS:
 *
 *   - `gremioDe(player)` → `{ id, nombre, rango, nivel, motd, apodo }` o null: el canal del gremio
 *     y el look;
 *   - `gremioPorId(id)` → los datos del gremio, con sus rangos;
 *   - `textoDeGremio(criatura, quienMira)`: la línea del look («Él es Líder del gremio Dragones.»).
 *
 * Y lo que usa de los demás, si está: `mensajeAlCanalDeGremio(guildId, texto)` (los canales) para
 * avisar de quién entra y quién sale. Si no está, se avisa con un mensaje a cada miembro conectado.
 *
 * LAS GUERRAS (`guild_wars`) no están: la tabla existe para no necesitar otra migración el día que
 * se hagan.
 */

/** Los niveles de los rangos, los de TFS. */
const NIVEL = { LIDER: 3, VICE: 2, MIEMBRO: 1 };

/** Los rangos con los que nace un gremio, del más alto al más bajo. */
const RANGOS_INICIALES = [
    { name: 'Líder', level: NIVEL.LIDER },
    { name: 'Vicelíder', level: NIVEL.VICE },
    { name: 'Miembro', level: NIVEL.MIEMBRO }
];

/** El nivel para fundar un gremio si `config.js` no dice otro (`guildCreateLevel`). */
const NIVEL_PARA_FUNDAR = 8;

/** Lo largo que puede ser un nombre de gremio, un apodo y el mensaje del día. */
const NOMBRE_MIN = 3;
const NOMBRE_MAX = 20;
const APODO_MAX = 15;
const MOTD_MAX = 255;

const LETRAS = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';

/**
 * Un nombre de gremio en limpio (sin espacios de más), o null si no vale: de 3 a 20 letras y
 * espacios sueltos, como pide TFS.
 */
function nombreDeGremio(texto) {
    const limpio = String(texto || '').trim().replace(/\s+/g, ' ');
    if (limpio.length < NOMBRE_MIN || limpio.length > NOMBRE_MAX) {
        return null;
    }
    return new RegExp('^[' + LETRAS + ']+( [' + LETRAS + ']+)*$').test(limpio) ? limpio : null;
}

/** Un apodo en limpio ('' lo quita), o null si no vale: hasta 15 letras, cifras, espacios, - y '. */
function apodoDeGremio(texto) {
    const limpio = String(texto || '').trim().replace(/\s+/g, ' ');
    if (limpio.length > APODO_MAX) {
        return null;
    }
    return new RegExp("^[" + LETRAS + "0-9' -]*$").test(limpio) ? limpio : null;
}

const gremios = {
    // -----------------------------------------------------------------------
    // Leer: la base, la caché y lo que preguntan los demás
    // -----------------------------------------------------------------------

    /** La base de datos de los gremios, o null si el servidor corre sin ella. */
    _baseDeGremios() {
        return this.baseDeGremios || null;
    },

    /** El nivel para fundar un gremio (`guildCreateLevel` de config.js; 8 si no lo dice). */
    nivelParaFundarGremio() {
        const n = Number(this.guildCreateLevel);
        return Number.isFinite(n) && n > 0 ? n : NIVEL_PARA_FUNDAR;
    },

    /**
     * Carga (o vuelve a cargar) el gremio de un jugador conectado en `player.gremio`:
     * `{guildId, rankId, nick}` o null. Lo llama el repositorio al entrar y este archivo cada vez
     * que algo le cambia.
     */
    cargarGremioDe(player) {
        const base = this._baseDeGremios();
        if (!player) {
            return null;
        }
        let fila = null;
        if (base && player.characterId) {
            try {
                fila = base.guildMembership(player.characterId);
            } catch (error) {
                fila = null;
            }
        }
        player.gremio = fila;
        return fila;
    },

    /** Los datos de un gremio, de la caché o de la base. */
    _gremio(id) {
        this._gremiosEnMemoria = this._gremiosEnMemoria || new Map();
        const guardado = this._gremiosEnMemoria.get(Number(id));
        if (guardado) {
            return guardado;
        }
        const base = this._baseDeGremios();
        const fila = base ? base.findGuild(Number(id)) : null;
        if (!fila) {
            return null;
        }
        const gremio = { ...fila, rangos: base.guildRanks(fila.id) };
        this._gremiosEnMemoria.set(gremio.id, gremio);
        return gremio;
    },

    /** Algo ha cambiado en un gremio: la próxima vez se lee de la base. */
    _olvidarGremio(id) {
        if (this._gremiosEnMemoria) {
            this._gremiosEnMemoria.delete(Number(id));
        }
    },

    /**
     * EL GREMIO DE UN JUGADOR, lo que preguntan el canal del gremio y el look:
     * `{ id, nombre, rango, nivel, motd, apodo }`, o null si no está en ninguno.
     */
    gremioDe(player) {
        if (!player || !player.isPlayer || !player.isPlayer()) {
            return null;
        }
        if (player.gremio === undefined) {
            this.cargarGremioDe(player);
        }
        const m = player.gremio;
        const gremio = m ? this._gremio(m.guildId) : null;
        if (!gremio) {
            return null;
        }
        const rango = gremio.rangos.find((r) => r.id === m.rankId) || null;
        return {
            id: gremio.id,
            nombre: gremio.name,
            rango: rango ? rango.name : '',
            nivel: rango ? rango.level : NIVEL.MIEMBRO,
            motd: gremio.motd || '',
            apodo: m.nick || ''
        };
    },

    /**
     * Un gremio por su id: `{ id, nombre, motd, duenoId, fundado (ms), rangos: [{id, nombre, nivel}] }`,
     * o null.
     */
    gremioPorId(id) {
        const g = this._gremio(id);
        return g ? {
            id: g.id,
            nombre: g.name,
            motd: g.motd || '',
            duenoId: g.ownerId,
            fundado: g.creationData * 1000,
            rangos: g.rangos.map((r) => ({ id: r.id, nombre: r.name, nivel: r.level }))
        } : null;
    },

    /** Un gremio por su nombre (sin mayúsculas), como `gremioPorId`, o null. */
    gremioPorNombre(nombre) {
        const base = this._baseDeGremios();
        const fila = base ? base.findGuild(String(nombre || '')) : null;
        return fila ? this.gremioPorId(fila.id) : null;
    },

    /** Los miembros de un gremio que están conectados (los jugadores). */
    jugadoresDeGremio(id) {
        const lista = [];
        this.players.forEach((player) => {
            if (player.gremio === undefined) {
                this.cargarGremioDe(player);
            }
            if (player.gremio && player.gremio.guildId === Number(id)) {
                lista.push(player);
            }
        });
        return lista;
    },

    /**
     * Todos los miembros de un gremio, conectados o no: `[{ id, nombre, rango, nivel, apodo,
     * conectado }]`, del rango más alto al más bajo.
     */
    miembrosDeGremio(id) {
        const base = this._baseDeGremios();
        if (!base) {
            return [];
        }
        const dentro = new Set(this.jugadoresDeGremio(id).map((p) => p.characterId));
        return base.guildMembers(Number(id)).map((m) => ({
            id: m.playerId,
            nombre: m.name,
            rango: m.rankName,
            nivel: m.rankLevel,
            apodo: m.nick,
            conectado: dentro.has(m.playerId)
        }));
    },

    /**
     * LA LÍNEA DEL LOOK, como en TFS: «Él es Líder del gremio Dragones (apodo).», «Ella es…», o «Eres…»
     * si se mira a sí mismo. Null si no es un jugador o no está en ningún gremio.
     */
    textoDeGremio(creature, quienMira) {
        const g = this.gremioDe(creature);
        if (!g) {
            return null;
        }
        const sujeto = creature === quienMira ? 'Eres' : (creature.sex === 'female' ? 'Ella es' : 'Él es');
        return sujeto + ' ' + g.rango + ' del gremio ' + g.nombre + (g.apodo ? ' (' + g.apodo + ')' : '') + '.';
    },

    // -----------------------------------------------------------------------
    // Ayudas de las órdenes
    // -----------------------------------------------------------------------

    /**
     * Un personaje por su nombre, esté dentro o no: `{ id, nombre, jugador, sexo }`, o null si no
     * existe.
     */
    _personajeParaGremio(nombre) {
        const jugador = this.playerByName(nombre);
        if (jugador && jugador.characterId) {
            return { id: jugador.characterId, nombre: jugador.name, jugador, sexo: jugador.sex };
        }
        const base = this._baseDeGremios();
        const fila = base && String(nombre || '').trim() ? base.findCharacterByName(String(nombre).trim()) : null;
        if (!fila) {
            return null;
        }
        const dentro = [...this.players.values()].find((p) => p.characterId === Number(fila.id)) || null;
        return { id: Number(fila.id), nombre: fila.name, jugador: dentro, sexo: fila.sex };
    },

    /** El jugador conectado con ese id de personaje, o null. */
    _jugadorPorPersonaje(characterId) {
        return [...this.players.values()].find((p) => p.characterId === Number(characterId)) || null;
    },

    /** A un personaje le ha cambiado el gremio: si está dentro, se vuelve a cargar y se avisa. */
    _refrescarMiembro(characterId) {
        const jugador = this._jugadorPorPersonaje(characterId);
        if (jugador) {
            this.cargarGremioDe(jugador);
            this.emit('onGuildChange', jugador, this.gremioDe(jugador));
        }
        return jugador;
    },

    /**
     * Lo de quien da la orden: su gremio y su rango, leídos de la BASE (que es la verdad: otro pudo
     * echarle hace un momento). `{ok:false, reason}` si no puede.
     */
    _miGremio(player) {
        const base = this._baseDeGremios();
        if (!base) {
            return { ok: false, reason: 'noDatabase' };
        }
        if (!player || !player.characterId) {
            return { ok: false, reason: 'noGuild' };
        }
        const m = base.guildMembership(player.characterId);
        const gremio = m ? this._gremio(m.guildId) : null;
        if (!gremio) {
            return { ok: false, reason: 'noGuild' };
        }
        const rango = gremio.rangos.find((r) => r.id === m.rankId) || { level: NIVEL.MIEMBRO };
        return { ok: true, base, gremio, membresia: m, nivel: rango.level, characterId: player.characterId };
    },

    /** El rango de un gremio con ese nivel. */
    _rangoDeNivel(gremio, nivel) {
        return gremio.rangos.find((r) => r.level === Number(nivel)) || null;
    },

    /**
     * Un miembro del MISMO gremio que quien manda, por su nombre: `{ok, objetivo, membresia, nivel}`
     * o el motivo (`notFound`, `notMember`, `self`).
     */
    _otroMiembro(yo, nombre) {
        const objetivo = this._personajeParaGremio(nombre);
        if (!objetivo) {
            return { ok: false, reason: 'notFound', name: String(nombre || '').trim() };
        }
        if (objetivo.id === yo.characterId) {
            return { ok: false, reason: 'self', name: objetivo.nombre };
        }
        const m = yo.base.guildMembership(objetivo.id);
        if (!m || m.guildId !== yo.gremio.id) {
            return { ok: false, reason: 'notMember', name: objetivo.nombre, objetivo };
        }
        const rango = yo.gremio.rangos.find((r) => r.id === m.rankId) || { level: NIVEL.MIEMBRO };
        return { ok: true, objetivo, membresia: m, nivel: rango.level, name: objetivo.nombre };
    },

    /**
     * Avisa a un gremio: por su canal si los canales lo ponen (`mensajeAlCanalDeGremio`) y alguien lo
     * tiene abierto; si no, con un mensaje a cada miembro conectado menos `excepto` (quien lo hizo,
     * que ya lo sabe).
     */
    _avisarAlGremio(guildId, texto, excepto) {
        if (typeof this.mensajeAlCanalDeGremio === 'function') {
            try {
                // Devuelve a cuántos llegó: si nadie tiene el canal abierto, se avisa a mano.
                if (this.mensajeAlCanalDeGremio(Number(guildId), texto) !== 0) {
                    return;
                }
            } catch (error) {
                // Si el canal falla, también.
            }
        }
        this.jugadoresDeGremio(guildId).forEach((p) => {
            if (p !== excepto) {
                this.sendTextMessage(p.id, texto);
            }
        });
    },

    // -----------------------------------------------------------------------
    // Fundar, entrar y salir
    // -----------------------------------------------------------------------

    /**
     * `!createguild`: funda un gremio con los tres rangos, y quien lo funda es su líder.
     * reason: noDatabase, level (con `level`), alreadyInGuild, badName, nameTaken.
     */
    crearGremio(player, nombre) {
        const base = this._baseDeGremios();
        if (!base || !player || !player.characterId) {
            return { ok: false, reason: 'noDatabase' };
        }
        const nivel = this.nivelParaFundarGremio();
        if ((Number(player.level) || 1) < nivel) {
            return { ok: false, reason: 'level', level: nivel };
        }
        if (base.guildMembership(player.characterId)) {
            return { ok: false, reason: 'alreadyInGuild' };
        }
        const limpio = nombreDeGremio(nombre);
        if (!limpio) {
            return { ok: false, reason: 'badName', min: NOMBRE_MIN, max: NOMBRE_MAX };
        }
        if (base.findGuild(limpio)) {
            return { ok: false, reason: 'nameTaken', name: limpio };
        }
        let id = 0;
        try {
            id = base.createGuild(limpio, player.characterId, Math.floor(this.now() / 1000), RANGOS_INICIALES);
        } catch (error) {
            return { ok: false, reason: /UNIQUE/i.test(String(error.message)) ? 'nameTaken' : 'error', name: limpio };
        }
        this._olvidarGremio(id);
        this._refrescarMiembro(player.characterId);
        return { ok: true, guild: this.gremioPorId(id) };
    },

    /**
     * `!guildinvite`: invita a alguien (esté dentro o no). Sólo el líder y el vicelíder.
     * reason: noDatabase, noGuild, noRights, notFound, self, alreadyInGuild, alreadyInvited.
     */
    invitarAlGremio(player, nombre) {
        const yo = this._miGremio(player);
        if (!yo.ok) {
            return yo;
        }
        if (yo.nivel < NIVEL.VICE) {
            return { ok: false, reason: 'noRights' };
        }
        const objetivo = this._personajeParaGremio(nombre);
        if (!objetivo) {
            return { ok: false, reason: 'notFound', name: String(nombre || '').trim() };
        }
        if (objetivo.id === player.characterId) {
            return { ok: false, reason: 'self', name: objetivo.nombre };
        }
        if (yo.base.guildMembership(objetivo.id)) {
            return { ok: false, reason: 'alreadyInGuild', name: objetivo.nombre };
        }
        if (!yo.base.addGuildInvite(objetivo.id, yo.gremio.id)) {
            return { ok: false, reason: 'alreadyInvited', name: objetivo.nombre };
        }
        if (objetivo.jugador) {
            this.sendTextMessage(objetivo.jugador.id, player.name + ' te ha invitado al gremio ' + yo.gremio.name +
                '. Escribe !joinguild ' + yo.gremio.name + ' para entrar.');
        }
        return { ok: true, name: objetivo.nombre, guild: yo.gremio.name };
    },

    /**
     * `!joinguild`: acepta una invitación y entra como miembro.
     * reason: noDatabase, alreadyInGuild, notFound, notInvited.
     */
    entrarEnGremio(player, nombreGremio) {
        const base = this._baseDeGremios();
        if (!base || !player || !player.characterId) {
            return { ok: false, reason: 'noDatabase' };
        }
        if (base.guildMembership(player.characterId)) {
            return { ok: false, reason: 'alreadyInGuild' };
        }
        const fila = base.findGuild(String(nombreGremio || '').trim());
        if (!fila) {
            return { ok: false, reason: 'notFound', name: String(nombreGremio || '').trim() };
        }
        if (!base.hasGuildInvite(player.characterId, fila.id)) {
            return { ok: false, reason: 'notInvited', name: fila.name };
        }
        const gremio = this._gremio(fila.id);
        const rango = this._rangoDeNivel(gremio, NIVEL.MIEMBRO);
        base.setGuildMembership(player.characterId, gremio.id, rango.id, '');
        this._refrescarMiembro(player.characterId);
        this._avisarAlGremio(gremio.id, player.name + ' se ha unido al gremio.', player);
        return { ok: true, guild: gremio.name };
    },

    /**
     * `!leaveguild`: sale de su gremio. El líder no puede: antes tiene que pasar el mando o disolverlo.
     * reason: noDatabase, noGuild, leader.
     */
    salirDelGremio(player) {
        const yo = this._miGremio(player);
        if (!yo.ok) {
            return yo;
        }
        if (yo.nivel >= NIVEL.LIDER) {
            return { ok: false, reason: 'leader' };
        }
        yo.base.removeGuildMembership(player.characterId);
        this._refrescarMiembro(player.characterId);
        this._avisarAlGremio(yo.gremio.id, player.name + ' ha dejado el gremio.', player);
        return { ok: true, guild: yo.gremio.name };
    },

    /**
     * `!guildkick`: echa a un miembro (o le retira la invitación a quien sólo está invitado). El
     * líder echa a cualquiera; el vicelíder sólo a los miembros.
     * reason: noDatabase, noGuild, noRights, notFound, self, notMember, rank.
     */
    echarDelGremio(player, nombre) {
        const yo = this._miGremio(player);
        if (!yo.ok) {
            return yo;
        }
        if (yo.nivel < NIVEL.VICE) {
            return { ok: false, reason: 'noRights' };
        }
        const otro = this._otroMiembro(yo, nombre);
        if (!otro.ok && otro.reason === 'notMember' && yo.base.removeGuildInvite(otro.objetivo.id, yo.gremio.id)) {
            return { ok: true, revoked: true, name: otro.name, guild: yo.gremio.name };
        }
        if (!otro.ok) {
            return otro;
        }
        if (otro.nivel >= yo.nivel) {
            return { ok: false, reason: 'rank', name: otro.name };
        }
        yo.base.removeGuildMembership(otro.objetivo.id);
        const echado = this._refrescarMiembro(otro.objetivo.id);
        if (echado) {
            this.sendTextMessage(echado.id, 'Te han expulsado del gremio ' + yo.gremio.name + '.');
        }
        this._avisarAlGremio(yo.gremio.id, otro.name + ' ha sido expulsado del gremio por ' + player.name + '.', player);
        return { ok: true, name: otro.name, guild: yo.gremio.name };
    },

    // -----------------------------------------------------------------------
    // Rangos y mando
    // -----------------------------------------------------------------------

    /**
     * Cambia el rango de un miembro un escalón (`paso` +1 asciende, −1 degrada). Sólo el líder, y
     * sin llegar a líder (para eso está `pasarMandoDelGremio`) ni bajar de miembro.
     * reason: noDatabase, noGuild, noRights, notFound, self, notMember, maxRank, minRank.
     */
    _cambiarRango(player, nombre, paso) {
        const yo = this._miGremio(player);
        if (!yo.ok) {
            return yo;
        }
        if (yo.nivel < NIVEL.LIDER) {
            return { ok: false, reason: 'noRights' };
        }
        const otro = this._otroMiembro(yo, nombre);
        if (!otro.ok) {
            return otro;
        }
        const nuevoNivel = otro.nivel + paso;
        if (nuevoNivel >= NIVEL.LIDER) {
            return { ok: false, reason: 'maxRank', name: otro.name };
        }
        const rango = this._rangoDeNivel(yo.gremio, nuevoNivel);
        if (nuevoNivel < NIVEL.MIEMBRO || !rango) {
            return { ok: false, reason: 'minRank', name: otro.name };
        }
        yo.base.setGuildRank(otro.objetivo.id, rango.id);
        this._refrescarMiembro(otro.objetivo.id);
        this._avisarAlGremio(yo.gremio.id, otro.name + ' es ahora ' + rango.name + ' del gremio.', player);
        return { ok: true, name: otro.name, rank: rango.name, guild: yo.gremio.name };
    },

    /** `!guildpromote`: de miembro a vicelíder. */
    ascenderEnGremio(player, nombre) {
        return this._cambiarRango(player, nombre, 1);
    },

    /** `!guilddemote`: de vicelíder a miembro. */
    degradarEnGremio(player, nombre) {
        return this._cambiarRango(player, nombre, -1);
    },

    /**
     * `!guildleader`: el líder pasa el mando a otro miembro, y él queda de vicelíder. El gremio
     * cambia de dueño (`guilds.ownerid`).
     * reason: noDatabase, noGuild, noRights, notFound, self, notMember.
     */
    pasarMandoDelGremio(player, nombre) {
        const yo = this._miGremio(player);
        if (!yo.ok) {
            return yo;
        }
        if (yo.nivel < NIVEL.LIDER) {
            return { ok: false, reason: 'noRights' };
        }
        const otro = this._otroMiembro(yo, nombre);
        if (!otro.ok) {
            return otro;
        }
        const lider = this._rangoDeNivel(yo.gremio, NIVEL.LIDER);
        const vice = this._rangoDeNivel(yo.gremio, NIVEL.VICE);
        yo.base.transaction(() => {
            yo.base.setGuildRank(otro.objetivo.id, lider.id);
            yo.base.setGuildRank(player.characterId, vice.id);
            yo.base.setGuildOwner(yo.gremio.id, otro.objetivo.id);
        });
        this._olvidarGremio(yo.gremio.id);
        this._refrescarMiembro(otro.objetivo.id);
        this._refrescarMiembro(player.characterId);
        this._avisarAlGremio(yo.gremio.id, otro.name + ' es ahora ' + lider.name + ' del gremio.', player);
        return { ok: true, name: otro.name, guild: yo.gremio.name };
    },

    /**
     * `!disbandguild`: el líder disuelve el gremio. Se van sus rangos, sus miembros y sus
     * invitaciones, y a cada miembro conectado se le dice.
     * reason: noDatabase, noGuild, noRights.
     */
    disolverGremio(player) {
        const yo = this._miGremio(player);
        if (!yo.ok) {
            return yo;
        }
        if (yo.nivel < NIVEL.LIDER) {
            return { ok: false, reason: 'noRights' };
        }
        const conectados = this.jugadoresDeGremio(yo.gremio.id);
        yo.base.deleteGuild(yo.gremio.id);
        this._olvidarGremio(yo.gremio.id);
        conectados.forEach((p) => {
            this._refrescarMiembro(p.characterId);
            if (p !== player) {
                this.sendTextMessage(p.id, 'El gremio ' + yo.gremio.name + ' se ha disuelto.');
            }
        });
        return { ok: true, guild: yo.gremio.name };
    },

    // -----------------------------------------------------------------------
    // Mensaje del día y apodos
    // -----------------------------------------------------------------------

    /**
     * `!guildmotd`: cambia el mensaje del día (vacío lo quita). El líder y el vicelíder.
     * reason: noDatabase, noGuild, noRights.
     */
    mensajeDelDiaDelGremio(player, texto) {
        const yo = this._miGremio(player);
        if (!yo.ok) {
            return yo;
        }
        if (yo.nivel < NIVEL.VICE) {
            return { ok: false, reason: 'noRights' };
        }
        return this.ponerMensajeDelGremio(yo.gremio.id, texto, player);
    },

    /**
     * Pone el mensaje del día de un gremio sin mirar quién (`Guild:setMotd` de los scripts), y se lo
     * dice a los miembros menos a `quien`.
     */
    ponerMensajeDelGremio(guildId, texto, quien) {
        const base = this._baseDeGremios();
        const gremio = this._gremio(guildId);
        if (!base || !gremio) {
            return { ok: false, reason: 'noGuild' };
        }
        const motd = String(texto || '').trim().slice(0, MOTD_MAX);
        base.setGuildMotd(gremio.id, motd);
        this._olvidarGremio(gremio.id);
        if (motd) {
            this._avisarAlGremio(gremio.id, 'Mensaje del día del gremio: ' + motd, quien || null);
        }
        return { ok: true, motd, guild: gremio.name };
    },

    /**
     * `!guildnick`: el apodo de un miembro ('' lo quita). Cada uno el suyo; el vicelíder también el
     * de los miembros, y el líder el de cualquiera. Sin nombre (o con el propio), el suyo.
     * reason: noDatabase, noGuild, noRights, notFound, notMember, badNick.
     */
    apodoEnGremio(player, nombre, apodo) {
        const yo = this._miGremio(player);
        if (!yo.ok) {
            return yo;
        }
        const limpio = apodoDeGremio(apodo);
        if (limpio === null) {
            return { ok: false, reason: 'badNick', max: APODO_MAX };
        }
        let id = player.characterId;
        let nombreFinal = player.name;
        const pedido = String(nombre || '').trim();
        if (pedido && pedido.toLowerCase() !== player.name.toLowerCase()) {
                const otro = this._otroMiembro(yo, pedido);
            if (!otro.ok) {
                return otro;
            }
            if (yo.nivel < NIVEL.VICE || (yo.nivel < NIVEL.LIDER && otro.nivel >= yo.nivel)) {
                return { ok: false, reason: 'noRights', name: otro.name };
            }
            id = otro.objetivo.id;
            nombreFinal = otro.name;
        }
        yo.base.setGuildNick(id, limpio);
        this._refrescarMiembro(id);
        return { ok: true, name: nombreFinal, nick: limpio, self: id === player.characterId };
    },

    /**
     * `!guild`: los datos del gremio para enseñarlos. `{ok, guild, miembros, conectados}` o el motivo
     * (noDatabase, noGuild).
     */
    infoDelGremio(player) {
        const yo = this._miGremio(player);
        if (!yo.ok) {
            return yo;
        }
        const miembros = this.miembrosDeGremio(yo.gremio.id);
        return {
            ok: true,
            guild: this.gremioPorId(yo.gremio.id),
            miembros,
            conectados: miembros.filter((m) => m.conectado)
        };
    },

    /** Las invitaciones que tiene un jugador: `[{id, name}]`. */
    invitacionesDeGremio(player) {
        const base = this._baseDeGremios();
        return base && player && player.characterId ? base.guildInvitesOf(player.characterId) : [];
    }
};

module.exports = { gremios, NIVEL, RANGOS_INICIALES, NIVEL_PARA_FUNDAR, nombreDeGremio, apodoDeGremio };
