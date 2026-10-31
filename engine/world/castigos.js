'use strict';

/**
 * LOS CASTIGOS: suspender una cuenta o una IP (el «ban» de Tibia), bloquear un personaje por su
 * nombre (el «namelock»), echar a alguien del juego y silenciarle, como en TFS 8.60.
 *
 * Se mezcla en `World` igual que `casas.js`, y además engancha dos cosas que no son suyas
 * (`engancharCastigos`, desde world.js): ver «Silenciar» más abajo.
 *
 * LO QUE SE GUARDA, con las tablas de TFS (versión 10 de la base, engine/persistence/database.js),
 * y con las horas en SEGUNDOS como allí:
 *
 *   - `account_bans`: una suspensión vigente por cuenta, con su motivo, quién la puso y hasta cuándo
 *     (`expires_at` 0 = para siempre). Al levantarse —la levante un GM o caduque— pasa al historial,
 *     `account_ban_history`;
 *   - `ip_bans`: lo mismo para una IP (sin historial, como en TFS);
 *   - `player_namelocks`: un personaje que no puede volver a entrar hasta que se le cambie el nombre.
 *
 * AL ENTRAR (`castigoAlEntrar`, desde el repositorio, y `castigoDeIp`, desde la sesión) se rechaza
 * con el motivo: «Tu cuenta ha sido suspendida hasta el … por … Motivo: …». Lo que ya ha caducado se
 * limpia en ese momento, y se deja entrar.
 *
 * SILENCIAR NO SE GUARDA EN LA BASE sino en el personaje (el storage `castigo:silencio`, con la hora
 * del reloj del mundo hasta la que dura): así sobrevive a salir y volver a entrar, que es lo que
 * hace la condición «muted» de TFS.
 *
 * QUIÉN PUEDE: los comandos (data/scripts/talkactions/castigos.js) piden el grupo `gamemaster`
 * (data/XML/groups.js), y aquí además se impide castigar a alguien del PERSONAL que tenga un grupo
 * igual o mayor que el de quien castiga: un GM no suspende a otro GM ni a un god.
 */

/** Los días de una suspensión si no se dicen (`banDays` de config.js). */
const DIAS_POR_DEFECTO = 7;

/** Los minutos de silencio si no se dicen. */
const MINUTOS_DE_SILENCIO = 5;

/** El storage en el que se apunta hasta cuándo está silenciado (ms del reloj del mundo). */
const STORAGE_SILENCIO = 'castigo:silencio';

const SEGUNDOS_POR_DIA = 24 * 60 * 60;

/** Una fecha de castigo: `2026-10-31 18:05`, en la hora del servidor. */
function fechaDeCastigo(segundos) {
    const d = new Date((Number(segundos) || 0) * 1000);
    const dos = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + ' ' +
        dos(d.getHours()) + ':' + dos(d.getMinutes());
}

/** Quién castigó, por su nombre; si ya no existe (o fue el sistema), «un administrador». */
function quienCastigo(nombre) {
    return nombre ? String(nombre) : 'un administrador';
}

const castigos = {
    // -----------------------------------------------------------------------
    // Ayudas
    // -----------------------------------------------------------------------

    /** La base de datos de los castigos (la misma que la de los gremios), o null. */
    _baseDeCastigos() {
        return this.baseDeCastigos || this.baseDeGremios || null;
    },

    /** La hora del mundo en segundos, como la guarda TFS. */
    _segundosDelMundo() {
        return Math.floor(this.now() / 1000);
    },

    /** Los días de una suspensión si no se dicen (`banDays` de config.js; 7 si no lo dice). */
    diasDeSuspension() {
        const n = Number(this.banDays);
        return Number.isFinite(n) && n > 0 ? n : DIAS_POR_DEFECTO;
    },

    /** La IP de un jugador conectado (la pone engine.js con lo que sabe la sesión), o ''. */
    _ipDe(player) {
        return typeof this.ipDe === 'function' && player ? String(this.ipDe(player) || '') : '';
    },

    /**
     * A QUIÉN SE CASTIGA, por su nombre, esté dentro o no: `{ok, objetivo: {id, nombre, accountId,
     * jugador, grupo}}`, o el motivo: noDatabase, notFound, self, protected (es del personal y de un
     * grupo igual o mayor que el de quien castiga).
     */
    _objetivoDeCastigo(gm, nombre, opciones) {
        const o = opciones || {};
        const pedido = String(nombre || '').trim();
        const base = this._baseDeCastigos();
        const jugador = pedido ? this.playerByName(pedido) : null;
        let fila = null;
        if (base && pedido) {
            fila = base.findCharacterByName(pedido);
        }
        if (!o.sinBase && !base) {
            return { ok: false, reason: 'noDatabase' };
        }
        if (!fila && !jugador) {
            return { ok: false, reason: 'notFound', name: pedido };
        }
        const objetivo = {
            id: fila ? Number(fila.id) : (jugador.characterId || 0),
            nombre: jugador ? jugador.name : fila.name,
            accountId: fila ? Number(fila.account_id) : (jugador.accountId || 0),
            jugador,
            grupo: jugador ? this.groupOf(jugador) : (this.groupByName(Number(fila.group_id) || 1) || this.groupOf(null))
        };
        if (gm && jugador === gm) {
            return { ok: false, reason: 'self', name: objetivo.nombre };
        }
        if (objetivo.grupo && objetivo.grupo.access === true && gm && objetivo.grupo.id >= this.groupOf(gm).id) {
            return { ok: false, reason: 'protected', name: objetivo.nombre };
        }
        return { ok: true, objetivo, name: objetivo.nombre };
    },

    /**
     * SACA A ALGUIEN DEL JUEGO por un castigo: se le dice por qué y sale como al pulsar «Salir»
     * (`sacarDelJuego`, que pone el motor). Un castigo no espera a que acabe el combate: se le quita
     * antes, y si está en una casilla de la que no se puede salir, se le lleva al templo.
     */
    _sacarPorCastigo(player, texto) {
        if (!player || !this.getPlayer(player.id)) {
            return false;
        }
        if (texto) {
            this.sendTextMessage(player.id, texto);
        }
        this.clearCombat(player);
        if (typeof this.sacarDelJuego === 'function' && this.sacarDelJuego(player)) {
            return true;
        }
        const templo = this.templeOf(player);
        if (templo && this.getPlayer(player.id)) {
            this.teleportCreature(player, templo);
            if (typeof this.sacarDelJuego === 'function' && this.sacarDelJuego(player)) {
                return true;
            }
        }
        if (this.getPlayer(player.id)) {
            this.removePlayer(player.id);
        }
        return true;
    },

    /** Los jugadores conectados de una cuenta. */
    _jugadoresDeCuenta(accountId) {
        return [...this.players.values()].filter((p) => p.accountId && p.accountId === Number(accountId));
    },

    // -----------------------------------------------------------------------
    // Al entrar
    // -----------------------------------------------------------------------

    /**
     * El texto de una suspensión, para la pantalla de entrada.
     * `deIp`: la de una IP, no la de una cuenta.
     */
    textoDeSuspension(ban, deIp) {
        const quien = deIp ? 'Tu IP' : 'Tu cuenta';
        const gm = quienCastigo(ban.bannedByName);
        const motivo = ban.reason || '-';
        return ban.expiresAt > 0
            ? quien + ' ha sido suspendida hasta el ' + fechaDeCastigo(ban.expiresAt) + ' por ' + gm + '. Motivo: ' + motivo + '.'
            : quien + ' ha sido suspendida para siempre por ' + gm + '. Motivo: ' + motivo + '.';
    },

    /**
     * ¿PUEDE ENTRAR esa cuenta con ese personaje? Null si sí; si no, el texto de por qué. Una
     * suspensión que ya caducó se pasa al historial y deja entrar. Lo llama el repositorio, con la
     * contraseña ya comprobada.
     */
    castigoAlEntrar(accountId, playerId) {
        const base = this._baseDeCastigos();
        if (!base) {
            return null;
        }
        const ahora = this._segundosDelMundo();
        const ban = accountId ? base.getAccountBan(accountId) : null;
        if (ban && ban.expiresAt > 0 && ban.expiresAt <= ahora) {
            base.liftAccountBan(accountId, ahora);
        } else if (ban) {
            return this.textoDeSuspension(ban, false);
        }
        const bloqueo = playerId ? base.getNamelock(playerId) : null;
        if (bloqueo) {
            return 'Tu personaje tiene el nombre bloqueado: tienes que cambiarlo antes de volver a jugar. Motivo: ' +
                (bloqueo.reason || '-') + '.';
        }
        return null;
    },

    /** ¿Está suspendida esa IP? Null si no; si sí, el texto. La que caducó se borra. */
    castigoDeIp(ip) {
        const base = this._baseDeCastigos();
        if (!base || !ip) {
            return null;
        }
        const ban = base.getIpBan(String(ip));
        if (!ban) {
            return null;
        }
        if (ban.expiresAt > 0 && ban.expiresAt <= this._segundosDelMundo()) {
            base.liftIpBan(String(ip));
            return null;
        }
        return this.textoDeSuspension(ban, true);
    },

    // -----------------------------------------------------------------------
    // Suspender
    // -----------------------------------------------------------------------

    /**
     * Cuándo acaba una suspensión de `dias` días que empieza `desde` (segundos): 0 o sin decir son
     * los de `banDays`; un número negativo, para siempre (devuelve 0).
     */
    _finDeSuspension(dias, desde) {
        const texto = String(dias === undefined || dias === null ? '' : dias).trim();
        const n = texto === '' ? 0 : Number(texto);
        if (Number.isFinite(n) && n < 0) {
            return 0;
        }
        const d = Number.isFinite(n) && n > 0 ? n : this.diasDeSuspension();
        return desde + Math.round(d * SEGUNDOS_POR_DIA);
    },

    /**
     * `/ban`: SUSPENDE LA CUENTA de un personaje (esté dentro o no) y saca del juego a todos sus
     * personajes conectados.
     * reason: noDatabase, badDays, notFound, self, protected.
     * @returns {{ok, name, permanent, expiresAt (ms), reason?}}
     */
    suspenderCuenta(gm, nombre, dias, motivo) {
        if (dias !== undefined && dias !== null && String(dias).trim() !== '' && !Number.isFinite(Number(dias))) {
            return { ok: false, reason: 'badDays' };
        }
        const r = this._objetivoDeCastigo(gm, nombre);
        if (!r.ok) {
            return r;
        }
        const base = this._baseDeCastigos();
        const ahora = this._segundosDelMundo();
        const ban = {
            reason: String(motivo || '').trim(),
            bannedAt: ahora,
            expiresAt: this._finDeSuspension(dias, ahora),
            bannedBy: gm && gm.characterId ? gm.characterId : 0
        };
        // La que tuviera se cambia por ésta, pero no se pierde: pasa al historial.
        base.liftAccountBan(r.objetivo.accountId, ahora);
        base.banAccount(r.objetivo.accountId, ban);
        const texto = this.textoDeSuspension({ ...ban, bannedByName: gm ? gm.name : '' }, false);
        this._jugadoresDeCuenta(r.objetivo.accountId).forEach((p) => this._sacarPorCastigo(p, texto));
        return { ok: true, name: r.name, permanent: ban.expiresAt === 0, expiresAt: ban.expiresAt * 1000 };
    },

    /**
     * `/unban`: levanta la suspensión de la cuenta de un personaje (pasa al historial).
     * reason: noDatabase, notFound, notBanned.
     */
    levantarSuspension(gm, nombre) {
        const base = this._baseDeCastigos();
        if (!base) {
            return { ok: false, reason: 'noDatabase' };
        }
        const fila = base.findCharacterByName(String(nombre || '').trim());
        if (!fila) {
            return { ok: false, reason: 'notFound', name: String(nombre || '').trim() };
        }
        if (!base.liftAccountBan(Number(fila.account_id), this._segundosDelMundo())) {
            return { ok: false, reason: 'notBanned', name: fila.name };
        }
        return { ok: true, name: fila.name };
    },

    /**
     * `/ipban`: SUSPENDE LA IP desde la que juega un personaje. Si está dentro, la de su conexión; si
     * no, la última desde la que entró (`players.lastip`). Saca del juego a todos los que entraron
     * desde esa IP.
     * reason: noDatabase, badDays, notFound, self, protected, noIp.
     */
    suspenderIp(gm, nombre, dias, motivo) {
        if (dias !== undefined && dias !== null && String(dias).trim() !== '' && !Number.isFinite(Number(dias))) {
            return { ok: false, reason: 'badDays' };
        }
        const r = this._objetivoDeCastigo(gm, nombre);
        if (!r.ok) {
            return r;
        }
        let ip = r.objetivo.jugador ? this._ipDe(r.objetivo.jugador) : '';
        if (!ip) {
            const fila = this._baseDeCastigos().findCharacterByName(r.name);
            ip = fila && fila.lastip ? String(fila.lastip) : '';
        }
        if (!ip) {
            return { ok: false, reason: 'noIp', name: r.name };
        }
        const base = this._baseDeCastigos();
        const ahora = this._segundosDelMundo();
        const ban = {
            reason: String(motivo || '').trim(),
            bannedAt: ahora,
            expiresAt: this._finDeSuspension(dias, ahora),
            bannedBy: gm && gm.characterId ? gm.characterId : 0
        };
        base.banIp(ip, ban);
        const texto = this.textoDeSuspension({ ...ban, bannedByName: gm ? gm.name : '' }, true);
        [...this.players.values()].filter((p) => p !== gm && this._ipDe(p) === ip)
            .forEach((p) => this._sacarPorCastigo(p, texto));
        return { ok: true, name: r.name, ip, permanent: ban.expiresAt === 0, expiresAt: ban.expiresAt * 1000 };
    },

    /**
     * `/namelock`: bloquea un personaje por su nombre: no entra hasta que se le cambie. Si está
     * dentro, sale.
     * reason: noDatabase, notFound, self, protected.
     */
    bloquearNombre(gm, nombre, motivo) {
        const r = this._objetivoDeCastigo(gm, nombre);
        if (!r.ok) {
            return r;
        }
        if (!r.objetivo.id) {
            return { ok: false, reason: 'notFound', name: r.name };
        }
        const base = this._baseDeCastigos();
        const razon = String(motivo || '').trim();
        base.namelockPlayer(r.objetivo.id, {
            reason: razon,
            namelockedAt: this._segundosDelMundo(),
            namelockedBy: gm && gm.characterId ? gm.characterId : 0
        });
        if (r.objetivo.jugador) {
            this._sacarPorCastigo(r.objetivo.jugador,
                'Tu personaje tiene el nombre bloqueado: tienes que cambiarlo antes de volver a jugar. Motivo: ' +
                (razon || '-') + '.');
        }
        return { ok: true, name: r.name };
    },

    /**
     * `/kick`: le saca del juego, sin más castigo.
     * reason: notFound, notOnline, self, protected.
     */
    expulsarDelJuego(gm, nombre) {
        const r = this._objetivoDeCastigo(gm, nombre, { sinBase: true });
        if (!r.ok) {
            return r;
        }
        if (!r.objetivo.jugador) {
            return { ok: false, reason: 'notOnline', name: r.name };
        }
        this._sacarPorCastigo(r.objetivo.jugador, 'Un administrador te ha sacado del juego.');
        return { ok: true, name: r.name };
    },

    /**
     * `/baninfo`: lo que pesa sobre un personaje y su cuenta. `{ok, name, ban, history, namelock}`
     * (`ban` y `namelock`, null si no hay), o reason: noDatabase, notFound.
     */
    infoDeCastigos(nombre) {
        const base = this._baseDeCastigos();
        if (!base) {
            return { ok: false, reason: 'noDatabase' };
        }
        const fila = base.findCharacterByName(String(nombre || '').trim());
        if (!fila) {
            return { ok: false, reason: 'notFound', name: String(nombre || '').trim() };
        }
        let ban = base.getAccountBan(Number(fila.account_id));
        const ahora = this._segundosDelMundo();
        if (ban && ban.expiresAt > 0 && ban.expiresAt <= ahora) {
            base.liftAccountBan(Number(fila.account_id), ban.expiresAt);
            ban = null;
        }
        return {
            ok: true,
            name: fila.name,
            ban,
            history: base.accountBanHistory(Number(fila.account_id)),
            namelock: base.getNamelock(Number(fila.id))
        };
    },

    /** Las líneas de `/baninfo`, para la ventana de texto. */
    textoDeInfoDeCastigos(info) {
        const lineas = [];
        if (info.ban) {
            lineas.push(info.ban.expiresAt > 0
                ? 'Cuenta suspendida hasta el ' + fechaDeCastigo(info.ban.expiresAt) + ' por ' +
                    quienCastigo(info.ban.bannedByName) + '.'
                : 'Cuenta suspendida para siempre por ' + quienCastigo(info.ban.bannedByName) + '.');
            lineas.push('Motivo: ' + (info.ban.reason || '-') + '.');
            lineas.push('Desde: ' + fechaDeCastigo(info.ban.bannedAt) + '.');
        } else {
            lineas.push('La cuenta no está suspendida.');
        }
        if (info.namelock) {
            lineas.push('Nombre bloqueado por ' + quienCastigo(info.namelock.namelockedByName) + ' el ' +
                fechaDeCastigo(info.namelock.namelockedAt) + '. Motivo: ' + (info.namelock.reason || '-') + '.');
        }
        if (info.history.length > 0) {
            lineas.push('');
            lineas.push('Suspensiones anteriores: ' + info.history.length + '.');
            info.history.slice(0, 10).forEach((h) => {
                lineas.push(fechaDeCastigo(h.bannedAt) + ' - ' + fechaDeCastigo(h.expiredAt) + ', por ' +
                    quienCastigo(h.bannedByName) + '. Motivo: ' + (h.reason || '-') + '.');
            });
        }
        return lineas.join('\n');
    },

    // -----------------------------------------------------------------------
    // Silenciar
    // -----------------------------------------------------------------------

    /** Cuántos milisegundos de silencio le quedan (0 si no está silenciado; el que acabó se borra). */
    silencioRestante(player) {
        if (!player || !(player.storages instanceof Map) || !player.storages.has(STORAGE_SILENCIO)) {
            return 0;
        }
        const queda = Number(player.storages.get(STORAGE_SILENCIO)) - this.now();
        if (!(queda > 0)) {
            player.storages.delete(STORAGE_SILENCIO);
            return 0;
        }
        return queda;
    },

    /** Lo que se le dice a quien intenta hablar silenciado, o null si puede hablar. */
    textoDeSilencio(player) {
        const queda = this.silencioRestante(player);
        return queda > 0 ? 'Estás silenciado durante ' + Math.ceil(queda / 60000) + ' minutos.' : null;
    },

    /**
     * `/mute`: le silencia `minutos` (5 si no se dice): no puede hablar en voz alta ni en los canales.
     * reason: badMinutes, notFound, notOnline, self, protected.
     */
    silenciarJugador(gm, nombre, minutos) {
        const texto = String(minutos === undefined || minutos === null ? '' : minutos).trim();
        const n = texto === '' ? MINUTOS_DE_SILENCIO : Number(texto);
        if (!Number.isFinite(n) || n <= 0) {
            return { ok: false, reason: 'badMinutes' };
        }
        const r = this._objetivoDeCastigo(gm, nombre, { sinBase: true });
        if (!r.ok) {
            return r;
        }
        const jugador = r.objetivo.jugador;
        if (!jugador) {
            return { ok: false, reason: 'notOnline', name: r.name };
        }
        if (!(jugador.storages instanceof Map)) {
            jugador.storages = new Map();
        }
        const ms = Math.round(n * 60000);
        jugador.storages.set(STORAGE_SILENCIO, this.now() + ms);
        this.sendTextMessage(jugador.id, 'Un administrador te ha silenciado durante ' + Math.ceil(ms / 60000) + ' minutos.');
        return { ok: true, name: r.name, minutes: Math.ceil(ms / 60000) };
    },

    /**
     * `/unmute`: le devuelve la palabra.
     * reason: notFound, notOnline, notMuted.
     */
    quitarSilencio(gm, nombre) {
        const jugador = this.playerByName(String(nombre || '').trim());
        if (!jugador) {
            const base = this._baseDeCastigos();
            const existe = base && base.findCharacterByName(String(nombre || '').trim());
            return { ok: false, reason: existe ? 'notOnline' : 'notFound', name: existe ? existe.name : String(nombre || '').trim() };
        }
        if (this.silencioRestante(jugador) <= 0) {
            return { ok: false, reason: 'notMuted', name: jugador.name };
        }
        jugador.storages.delete(STORAGE_SILENCIO);
        this.sendTextMessage(jugador.id, 'Ya puedes volver a hablar.');
        return { ok: true, name: jugador.name };
    }
};

/**
 * LO QUE SE ENGANCHA FUERA DE ESTE ARCHIVO, desde world.js, después de mezclar `castigos`:
 *
 * 1. `silenciado(player)`, que preguntan los canales antes de dejar hablar en uno. Los canales
 *    ponen el suyo (por defecto, false); este archivo le añade el silencio de un GM, y devuelve el
 *    texto («Estás silenciado durante 5 minutos.»), que es lo que los canales le dicen al jugador. Para que dé
 *    igual quién se mezcle antes, `silenciado` se define como una propiedad con lectura y escritura:
 *    lo que ponga cualquiera después (`Object.assign`, una asignación) queda guardado como «lo de
 *    los canales», y lo que se lee siempre mira primero el silencio de un GM.
 *
 * 2. `creatureSay`, el hablar en voz alta: un jugador silenciado no dice nada y se le dice por qué.
 *    Los comandos y los hechizos no pasan por aquí (se miran antes), así que siguen funcionando,
 *    como en TFS.
 */
function engancharCastigos(World) {
    const proto = World.prototype;

    const previo = Object.getOwnPropertyDescriptor(proto, 'silenciado');
    let deLosCanales = previo && typeof previo.value === 'function' ? previo.value : null;
    function silenciado(player, ...resto) {
        // Un texto en vez de `true`: es lo que los canales le dicen al jugador.
        const aviso = typeof this.textoDeSilencio === 'function' ? this.textoDeSilencio(player) : null;
        if (aviso) {
            return aviso;
        }
        return typeof deLosCanales === 'function' ? deLosCanales.call(this, player, ...resto) : false;
    }
    Object.defineProperty(proto, 'silenciado', {
        configurable: true,
        enumerable: false,
        get() {
            return silenciado;
        },
        set(fn) {
            if (this !== proto) {
                // En UN mundo (una prueba que lo sustituye): sólo en ése, como cualquier propiedad.
                Object.defineProperty(this, 'silenciado', { value: fn, writable: true, configurable: true, enumerable: true });
                return;
            }
            deLosCanales = typeof fn === 'function' && fn !== silenciado ? fn : deLosCanales;
        }
    });

    const decir = proto.creatureSay;
    if (typeof decir === 'function' && !decir.conCastigos) {
        const decirConCastigos = function (creatureId, text) {
            const creature = this.getCreature(creatureId);
            if (creature && creature.isPlayer && creature.isPlayer()) {
                const aviso = this.textoDeSilencio(creature);
                if (aviso) {
                    this.sendTextMessage(creature.id, aviso);
                    return { ok: false, reason: 'muted' };
                }
            }
            return decir.apply(this, arguments);
        };
        decirConCastigos.conCastigos = true;
        proto.creatureSay = decirConCastigos;
    }
}

module.exports = {
    castigos,
    engancharCastigos,
    fechaDeCastigo,
    DIAS_POR_DEFECTO,
    MINUTOS_DE_SILENCIO,
    STORAGE_SILENCIO
};
