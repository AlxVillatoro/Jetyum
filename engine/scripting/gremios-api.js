'use strict';

/**
 * LO QUE LOS SCRIPTS VEN DE LOS GREMIOS Y DE LOS CASTIGOS: métodos de más para el jugador
 * (`PlayerWrapper`) y el envoltorio de un gremio (`GuildWrapper`), con los nombres de TFS donde los
 * hay (`player:getGuild()`, `guild:getMembersOnline()`, `guild:getRankByLevel(3)`).
 *
 * Va aparte de entities.js porque es un sistema entero; entities.js lo mezcla en el jugador con una
 * línea al final (`Object.assign(PlayerWrapper.prototype, require('./gremios-api').delJugador)`).
 *
 * Las reglas no están aquí sino en el mundo (engine/world/gremios.js y engine/world/castigos.js):
 * estos métodos sólo buscan al jugador de verdad y llaman. Lo que devuelven las órdenes es lo del
 * mundo, `{ok, reason, ...}`, y los comandos (data/scripts/talkactions/gremios.js y castigos.js) lo
 * dicen en palabras.
 */

/** Un rango para los scripts: `{id, name, level}` (como el `GuildRank` de TFS). */
function rangoParaScripts(r) {
    return r ? { id: r.id, name: r.nombre, level: r.nivel } : null;
}

/** UN GREMIO, para los scripts: un envoltorio alrededor de su id, como los de entities.js. */
class GuildWrapper {
    constructor(world, id) {
        this.world = world;
        this.id = Number(id);
    }

    _info() {
        return this.world.gremioPorId(this.id) || { nombre: '', motd: '', rangos: [] };
    }

    getId() { return this.id; }
    getName() { return this._info().nombre; }
    getMotd() { return this._info().motd; }
    /** El id del personaje que es dueño (el líder). */
    getOwnerGuid() { return this._info().duenoId || 0; }

    /** Cambia el mensaje del día, sin mirar quién (eso lo hace `!guildmotd`). */
    setMotd(texto) {
        return this.world.ponerMensajeDelGremio(this.id, texto).ok === true;
    }

    /** Los miembros conectados, como envoltorios de jugador. */
    getMembersOnline() {
        return this.world.jugadoresDeGremio(this.id).map((p) => this.world.wrapForContent(p));
    }

    /** Todos los miembros, conectados o no: `[{guid, name, rank, level, nick, online}]`. */
    getMembers() {
        return this.world.miembrosDeGremio(this.id).map((m) => ({
            guid: m.id, name: m.nombre, rank: m.rango, level: m.nivel, nick: m.apodo, online: m.conectado
        }));
    }

    getRanks() { return this._info().rangos.map(rangoParaScripts); }
    getRankById(id) { return rangoParaScripts(this._info().rangos.find((r) => r.id === Number(id))); }
    /** 3 líder, 2 vicelíder, 1 miembro. */
    getRankByLevel(nivel) { return rangoParaScripts(this._info().rangos.find((r) => r.nivel === Number(nivel))); }

    toString() {
        return 'Guild(' + this.id + ', ' + this.getName() + ')';
    }
}

/** El jugador de verdad detrás de un envoltorio, o null. */
function real(envoltorio) {
    return envoltorio.world.getPlayer(envoltorio.id);
}

/** Llama a una orden del mundo con el jugador de verdad, o dice que no hay jugador. */
function orden(envoltorio, metodo, ...args) {
    const player = real(envoltorio);
    if (!player || typeof envoltorio.world[metodo] !== 'function') {
        return { ok: false, reason: 'noPlayer' };
    }
    return envoltorio.world[metodo](player, ...args);
}

/** Los métodos que se mezclan en `PlayerWrapper.prototype`. */
const delJugador = {
    // --- Gremios: leer (TFS) ---

    /** Su gremio (`player:getGuild()`), o null. */
    getGuild() {
        const g = this.world.gremioDe ? this.world.gremioDe(real(this)) : null;
        return g ? new GuildWrapper(this.world, g.id) : null;
    },

    /** Su rango: 3 líder, 2 vicelíder, 1 miembro; 0 si no está en ningún gremio. */
    getGuildLevel() {
        const g = this.world.gremioDe ? this.world.gremioDe(real(this)) : null;
        return g ? g.nivel : 0;
    },

    /** Su apodo en el gremio, o ''. */
    getGuildNick() {
        const g = this.world.gremioDe ? this.world.gremioDe(real(this)) : null;
        return g ? g.apodo : '';
    },

    /** Se pone su propio apodo (`player:setGuildNick` de TFS). */
    setGuildNick(apodo) {
        return orden(this, 'apodoEnGremio', '', apodo).ok === true;
    },

    /** Los gremios que le han invitado: `[{id, name}]`. */
    getGuildInvites() {
        const player = real(this);
        return player && this.world.invitacionesDeGremio ? this.world.invitacionesDeGremio(player) : [];
    },

    // --- Gremios: las órdenes de los comandos ---

    createGuild(nombre) { return orden(this, 'crearGremio', nombre); },
    joinGuild(nombre) { return orden(this, 'entrarEnGremio', nombre); },
    leaveGuild() { return orden(this, 'salirDelGremio'); },
    inviteToGuild(nombre) { return orden(this, 'invitarAlGremio', nombre); },
    kickFromGuild(nombre) { return orden(this, 'echarDelGremio', nombre); },
    promoteInGuild(nombre) { return orden(this, 'ascenderEnGremio', nombre); },
    demoteInGuild(nombre) { return orden(this, 'degradarEnGremio', nombre); },
    passGuildLeadership(nombre) { return orden(this, 'pasarMandoDelGremio', nombre); },
    disbandGuild() { return orden(this, 'disolverGremio'); },
    changeGuildMotd(texto) { return orden(this, 'mensajeDelDiaDelGremio', texto); },
    /** El apodo de otro miembro (o el suyo, con su nombre o sin él). */
    changeGuildNick(nombre, apodo) { return orden(this, 'apodoEnGremio', nombre, apodo); },
    /** `{ok, guild, miembros, conectados}`: lo que enseña `!guild`. */
    getGuildInfo() { return orden(this, 'infoDelGremio'); },

    // --- Castigos (las órdenes de los comandos de GM; quien las da es este jugador) ---

    banPlayer(nombre, dias, motivo) { return orden(this, 'suspenderCuenta', nombre, dias, motivo); },
    unbanPlayer(nombre) { return orden(this, 'levantarSuspension', nombre); },
    ipBanPlayer(nombre, dias, motivo) { return orden(this, 'suspenderIp', nombre, dias, motivo); },
    namelockPlayer(nombre, motivo) { return orden(this, 'bloquearNombre', nombre, motivo); },
    kickPlayer(nombre) { return orden(this, 'expulsarDelJuego', nombre); },
    mutePlayer(nombre, minutos) { return orden(this, 'silenciarJugador', nombre, minutos); },
    unmutePlayer(nombre) { return orden(this, 'quitarSilencio', nombre); },

    /** `{ok, name, ban, history, namelock, text}`: lo que enseña `/baninfo`. */
    getBanInfo(nombre) {
        const r = this.world.infoDeCastigos ? this.world.infoDeCastigos(nombre) : { ok: false, reason: 'noDatabase' };
        return r.ok ? { ...r, text: this.world.textoDeInfoDeCastigos(r) } : r;
    },

    /** ¿Está silenciado? Los milisegundos que le quedan (0 si no). */
    getMutedTime() {
        const player = real(this);
        return player && this.world.silencioRestante ? this.world.silencioRestante(player) : 0;
    }
};

module.exports = { GuildWrapper, delJugador };
