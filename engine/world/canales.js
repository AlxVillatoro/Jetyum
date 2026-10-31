'use strict';

/**
 * LOS CANALES DEL CHAT, como en Tibia 8.60 (en TFS, `Chat`, `ChatChannel`, `PrivateChatChannel` y
 * `data/chatchannels/chatchannels.xml`).
 *
 * Se mezcla en `World` igual que `correo.js` (`Object.assign(World.prototype, canales)`).
 *
 * LOS QUE HAY, con los números de TFS 1.x (son los que ve el cliente):
 *
 *   0   EL DEL GREMIO: uno por gremio, y cada miembro sólo ve el suyo. Lo pide al gremio
 *       `world.gremioDe(player)` (`{ id, nombre, rango, nivel, motd }` o null), que pone el sistema de
 *       gremios; sin él, no hay canal de gremio. Al abrirlo, la primera línea es el mensaje del día.
 *   1   EL DEL GRUPO: el de siempre (`#grupo`, `extras.js`). Sale en la lista si estás en un grupo, y
 *       lo que se dice en él sigue llegando como `SERVER.PRIVATE_MESSAGE` con canal 'grupo'.
 *   3   «Juego», 5 «Comercio» y 7 «Ayuda»: los PÚBLICOS, que existen siempre. Cada uno pide un nivel
 *       para entrar y hablar (`chatChannels` de config.js) y en «Comercio» sólo se puede poner una
 *       oferta cada dos minutos, como el «Advertising» de TFS.
 *   100 y siguientes: los PRIVADOS. Cada jugador puede abrir uno («Canal de Ana»), invitar a otros
 *       y excluirlos; sólo los invitados lo ven en su lista y pueden entrar. Si el dueño lo cierra o
 *       sale del juego, el canal desaparece para todos.
 *
 * QUIÉN ESTÁ EN UN CANAL lo apunta el propio canal (`usuarios`, ids de jugador): los que lo han
 * abierto. Hablar en uno donde no estás no se puede. Antes de cualquier mensaje se pregunta a
 * `world.silenciado(player)`, que aquí siempre dice que no: el sistema de castigos lo sustituye (si
 * devuelve un texto, es lo que se le dice al jugador).
 *
 * LOS EVENTOS de TFS (`onJoin`, `onLeave`, `onSpeak`) están a dos niveles: un canal registrado con
 * `registrarCanal({ id, nombre, onJoin, onLeave, onSpeak })` lleva los suyos, y los scripts tienen
 * los eventos de criatura `channeljoin`, `channelleave` y `channelspeak` (para todos los canales, con
 * el id al final). En los dos, `false` en `onSpeak` impide el mensaje.
 *
 * Al cliente se llega por cuatro avisos del mundo: `onChannelOpen(player, {id, nombre, propio})`,
 * `onChannelClose(player, id)`, `onChannelMessage(player, id, autor, nivel, texto, tipo)` y los textos
 * de siempre (`sendTextMessage`). La lista la pide la sesión con `canalesPara(player)`.
 */

/** Los números de los canales: los de TFS 1.x. */
const CANAL = {
    GREMIO: 0,
    GRUPO: 1,
    JUEGO: 3,
    COMERCIO: 5,
    AYUDA: 7,
    /** El primero de los privados. */
    PRIVADO: 100
};

/** El tipo de habla de un mensaje de canal en los `onSpeak` (el TALKTYPE_CHANNEL_Y de Tibia 8.60). */
const TALKTYPE_CANAL = 5;

/** Los públicos, con sus valores de siempre. `clave` es la de `chatChannels` en config.js. */
const PUBLICOS = [
    { id: CANAL.JUEGO, clave: 'juego', nombre: 'Juego', nivel: 1, espera: 0 },
    { id: CANAL.COMERCIO, clave: 'comercio', nombre: 'Comercio', nivel: 1, espera: 2 * 60 * 1000 },
    { id: CANAL.AYUDA, clave: 'ayuda', nombre: 'Ayuda', nivel: 1, espera: 0 }
];

/** Las frases, para que el motor y las pruebas digan lo mismo. */
const TEXTOS = {
    noExiste: 'Ese canal no existe.',
    noEstas: 'No estás en ese canal.',
    nivelEntrar: 'Necesitas nivel {nivel} para entrar en este canal.',
    nivelHablar: 'Necesitas nivel {nivel} para hablar en este canal.',
    silenciado: 'No puedes hablar ahora.',
    espera: 'Sólo puedes poner una oferta cada dos minutos.',
    vacio: 'El mensaje esta vacio.',
    noInvitado: 'No estás invitado a ese canal.',
    sinCanalPrivado: 'No tienes ningún canal privado.',
    noConectado: 'Nadie llamado "{nombre}" esta conectado.',
    aTiMismo: 'No puedes invitarte a ti mismo.',
    teInvita: '{nombre} te invita a su canal privado.',
    invitado: '{nombre} ha sido invitado.',
    yaInvitado: '{nombre} ya está invitado.',
    excluido: '{nombre} ha sido excluido.',
    noEstaInvitado: '{nombre} no está invitado.',
    nombrePrivado: 'Canal de {nombre}',
    motd: 'Mensaje del día: {motd}',
    noEnGremio: 'No estás en ningún gremio.',
    noEnGrupo: 'No estas en ningun grupo.'
};

/**
 * EL HOOK DE MODERACIÓN: ¿está silenciado? Aquí, nunca. El sistema de castigos pone el suyo
 * (`world.silenciado`), y world.js sólo pone éste si no hay otro: así da igual qué se mezcle antes.
 * Un texto en vez de `true` es lo que se le dice al jugador.
 */
function silenciadoPorDefecto(player) {   // eslint-disable-line no-unused-vars
    return false;
}

function decir(texto, huecos) {
    return Object.keys(huecos || {}).reduce((t, k) => t.split('{' + k + '}').join(String(huecos[k])), texto);
}

/** Un canal nuevo, con todo lo que puede llevar. */
function nuevoCanal(datos) {
    return {
        id: Number(datos.id),
        nombre: String(datos.nombre || ''),
        tipo: datos.tipo || 'publico',
        nivel: Math.max(0, Number(datos.nivel) || 0),
        espera: Math.max(0, Number(datos.espera) || 0),
        usuarios: new Set(),
        dueno: datos.dueno || null,
        invitados: new Map(),
        gremioId: datos.gremioId === undefined ? null : datos.gremioId,
        onJoin: typeof datos.onJoin === 'function' ? datos.onJoin : null,
        onLeave: typeof datos.onLeave === 'function' ? datos.onLeave : null,
        onSpeak: typeof datos.onSpeak === 'function' ? datos.onSpeak : null
    };
}

const canales = {
    // -----------------------------------------------------------------------
    // El registro
    // -----------------------------------------------------------------------

    /**
     * Los niveles y las esperas de config.js (`chatChannels: { juego: { level }, comercio: { level,
     * cooldownMs }, ayuda: { level } }`). Lo llama el motor al arrancar; sin llamarlo, los de siempre.
     */
    configurarCanales(config) {
        this.opcionesDeCanales = (config && config.chatChannels) || {};
        this._canales = null;
        this._canalesDeGremio = null;
        return this._registroDeCanales().size;
    },

    /** Los canales públicos y privados por id (se montan la primera vez). */
    _registroDeCanales() {
        if (!this._canales) {
            this._canales = new Map();
            this._canalesDeGremio = new Map();
            const opciones = this.opcionesDeCanales || {};
            PUBLICOS.forEach((base) => {
                const o = opciones[base.clave] || {};
                this._canales.set(base.id, nuevoCanal({
                    id: base.id,
                    nombre: o.name || base.nombre,
                    nivel: o.level === undefined ? base.nivel : o.level,
                    espera: o.cooldownMs === undefined ? base.espera : o.cooldownMs
                }));
            });
        }
        return this._canales;
    },

    /**
     * Da de alta un canal PÚBLICO más (o sustituye uno), con sus eventos de TFS si se quiere:
     * `{ id, nombre, nivel, espera, onJoin(player), onLeave(player), onSpeak(player, texto) }`. Los
     * ids 0, 1 y del 100 en adelante son del gremio, del grupo y de los privados.
     */
    registrarCanal(definicion) {
        const d = definicion || {};
        const id = Number(d.id);
        if (!Number.isInteger(id) || id <= CANAL.GRUPO || id >= CANAL.PRIVADO || !d.nombre) {
            return { ok: false, reason: 'badChannel' };
        }
        const registro = this._registroDeCanales();
        const antes = registro.get(id);
        const canal = nuevoCanal({ ...d, id: id, tipo: 'publico' });
        if (antes) {
            antes.usuarios.forEach((u) => canal.usuarios.add(u));
        }
        registro.set(id, canal);
        return { ok: true, canal: canal };
    },

    /** El gremio de un jugador, si hay sistema de gremios (`world.gremioDe`), o null. */
    _gremioPara(player) {
        if (typeof this.gremioDe !== 'function' || !player) {
            return null;
        }
        const gremio = this.gremioDe(player);
        return gremio && gremio.id !== undefined && gremio.id !== null ? gremio : null;
    },

    _canalDeGremio(gremio, crear) {
        this._registroDeCanales();
        let canal = this._canalesDeGremio.get(gremio.id) || null;
        if (!canal && crear) {
            canal = nuevoCanal({ id: CANAL.GREMIO, tipo: 'gremio', nombre: gremio.nombre, gremioId: gremio.id });
            this._canalesDeGremio.set(gremio.id, canal);
        }
        if (canal && gremio.nombre) {
            canal.nombre = String(gremio.nombre);
        }
        return canal;
    },

    /**
     * El canal con ese id TAL COMO LO VE ese jugador (el 0 es el de SU gremio), o null. El del grupo
     * no vive en el registro: es el grupo mismo, y aquí sale como un canal de mentira.
     */
    canalDe(player, id) {
        const n = Number(id);
        if (n === CANAL.GREMIO) {
            const gremio = this._gremioPara(player);
            return gremio ? this._canalDeGremio(gremio, true) : null;
        }
        if (n === CANAL.GRUPO) {
            return this.partyOf && this.partyOf(player)
                ? { id: CANAL.GRUPO, nombre: 'Grupo', tipo: 'grupo', nivel: 0, espera: 0 } : null;
        }
        return this._registroDeCanales().get(n) || null;
    },

    /** Qué decir cuando no hay canal: el 0 y el 1 son «no estás en un gremio / grupo». */
    _sinCanal(id, texto) {
        const n = Number(id);
        return n === CANAL.GREMIO ? TEXTOS.noEnGremio : (n === CANAL.GRUPO ? TEXTOS.noEnGrupo : texto);
    },

    /** ¿Puede entrar en ese canal? `{ ok, reason, texto }`. */
    _puedeEntrar(player, canal) {
        if (!canal) {
            return { ok: false, reason: 'noChannel', texto: TEXTOS.noExiste };
        }
        if (canal.tipo === 'privado' && canal.dueno !== player.id &&
            !canal.invitados.has(player.name.toLowerCase())) {
            return { ok: false, reason: 'notInvited', texto: TEXTOS.noInvitado };
        }
        if (canal.nivel > 1 && (Number(player.level) || 1) < canal.nivel && !this.isStaff(player)) {
            return { ok: false, reason: 'level', texto: decir(TEXTOS.nivelEntrar, { nivel: canal.nivel }) };
        }
        return { ok: true };
    },

    /**
     * LA LISTA DE CANALES que ve un jugador, en el orden del cliente de Tibia: su gremio, su grupo,
     * los públicos a los que puede entrar y los privados (el suyo y aquellos a los que le invitaron).
     *
     * @returns {Array<{id: number, nombre: string}>}
     */
    canalesPara(player) {
        const lista = [];
        const gremio = this._gremioPara(player);
        if (gremio) {
            lista.push({ id: CANAL.GREMIO, nombre: String(gremio.nombre || '') });
        }
        if (this.partyOf && this.partyOf(player)) {
            lista.push({ id: CANAL.GRUPO, nombre: 'Grupo' });
        }
        const privados = [];
        this._registroDeCanales().forEach((canal) => {
            if (!this._puedeEntrar(player, canal).ok) {
                return;
            }
            (canal.tipo === 'privado' ? privados : lista).push({ id: canal.id, nombre: canal.nombre });
        });
        lista.sort((a, b) => a.id - b.id);
        return lista.concat(privados.sort((a, b) => a.id - b.id));
    },

    // -----------------------------------------------------------------------
    // Entrar y salir
    // -----------------------------------------------------------------------

    /**
     * ABRE un canal (lo pide el cliente al elegirlo de la lista). Si ya estaba dentro, se le vuelve
     * a mandar abierto, sin más.
     *
     * @returns {{ok: boolean, reason?: string, canal?: Object}}
     */
    abrirCanal(player, id) {
        const canal = this.canalDe(player, id);
        const puede = this._puedeEntrar(player, canal);
        if (!puede.ok) {
            this.sendTextMessage(player.id, this._sinCanal(id, puede.texto));
            return { ok: false, reason: puede.reason };
        }
        if (canal.tipo === 'grupo') {
            this.emit('onChannelOpen', player, { id: canal.id, nombre: canal.nombre, propio: false });
            return { ok: true, canal: canal };
        }
        const nuevo = !canal.usuarios.has(player.id);
        if (nuevo) {
            if (canal.onJoin && canal.onJoin(player) === false) {
                return { ok: false, reason: 'script' };
            }
            const ev = this.eventoDeCanal ? this.eventoDeCanal('channeljoin', player, canal.id) : null;
            if (ev && ev.blocked) {
                return { ok: false, reason: 'script' };
            }
            canal.usuarios.add(player.id);
        }
        this.emit('onChannelOpen', player, { id: canal.id, nombre: canal.nombre, propio: canal.dueno === player.id });
        // El del gremio empieza por el mensaje del día, como en TFS.
        if (canal.tipo === 'gremio') {
            const gremio = this._gremioPara(player);
            if (gremio && gremio.motd) {
                this.emit('onChannelMessage', player, CANAL.GREMIO, '', 0,
                    decir(TEXTOS.motd, { motd: String(gremio.motd) }), 'sistema');
            }
        }
        return { ok: true, canal: canal, nuevo: nuevo };
    },

    /**
     * Sale de un canal (cerró la pestaña). Si es el dueño de un canal privado, el canal se acaba y
     * se cierra para todos.
     */
    cerrarCanal(player, id) {
        const canal = this.canalDe(player, id);
        if (!canal || !canal.usuarios || !canal.usuarios.has(player.id)) {
            return { ok: false, reason: 'notInChannel' };
        }
        this._sacarDelCanal(player, canal, false);
        if (canal.tipo === 'privado' && canal.dueno === player.id) {
            this._borrarCanalPrivado(canal);
        }
        return { ok: true };
    },

    _sacarDelCanal(player, canal, avisar) {
        canal.usuarios.delete(player.id);
        if (canal.onLeave) {
            try {
                canal.onLeave(player);
            } catch (error) {
                if (this.log) {
                    this.log.error('onLeave del canal ' + canal.id + ': ' + error.message);
                }
            }
        }
        if (this.eventoDeCanal) {
            this.eventoDeCanal('channelleave', player, canal.id);
        }
        if (avisar) {
            this.emit('onChannelClose', player, canal.id);
        }
    },

    _borrarCanalPrivado(canal) {
        canal.usuarios.forEach((id) => {
            const otro = this.getPlayer(id);
            if (otro) {
                this._sacarDelCanal(otro, canal, true);
            }
        });
        canal.usuarios.clear();
        this._registroDeCanales().delete(canal.id);
    },

    /** Al salir del juego: deja todos los canales (y el suyo privado desaparece). */
    salirDeLosCanales(player) {
        if (!player || !this._canales) {
            return 0;
        }
        let dejados = 0;
        const todos = Array.from(this._canales.values()).concat(Array.from(this._canalesDeGremio.values()));
        todos.forEach((canal) => {
            if (canal.usuarios.has(player.id)) {
                this._sacarDelCanal(player, canal, false);
                dejados += 1;
            }
            if (canal.tipo === 'privado' && canal.dueno === player.id) {
                this._borrarCanalPrivado(canal);
            }
        });
        return dejados;
    },

    // -----------------------------------------------------------------------
    // Hablar
    // -----------------------------------------------------------------------

    /**
     * HABLA en un canal. En orden: silenciado, mensaje vacío, el canal y estar dentro, el nivel, la
     * espera (Comercio), los `onSpeak` y, si todo vale, a todos los que están dentro (él incluido),
     * con su nombre y su nivel. Lo que se dice en el del grupo va por el camino de siempre.
     *
     * @returns {{ok: boolean, reason?: string}}
     */
    hablarEnCanal(player, id, texto) {
        const silencio = typeof this.silenciado === 'function' ? this.silenciado(player) : false;
        if (silencio) {
            this.sendTextMessage(player.id, typeof silencio === 'string' ? silencio : TEXTOS.silenciado);
            return { ok: false, reason: 'muted' };
        }
        const mensaje = String(texto === undefined || texto === null ? '' : texto).slice(0, 255).trim();
        if (!mensaje) {
            return { ok: false, reason: 'empty' };
        }
        const canal = this.canalDe(player, id);
        if (canal && canal.tipo === 'grupo') {
            return this.sendPrivateMessage(player, '#grupo', mensaje, 'grupo');
        }
        if (!canal) {
            // Ya no tiene gremio, pero tenía abierto el canal del que era el suyo: se le cierra.
            if (Number(id) === CANAL.GREMIO && this._canalesDeGremio) {
                this._canalesDeGremio.forEach((c) => {
                    if (c.usuarios.has(player.id)) {
                        this._sacarDelCanal(player, c, true);
                    }
                });
            }
            this.sendTextMessage(player.id, this._sinCanal(id, TEXTOS.noExiste));
            return { ok: false, reason: 'noChannel' };
        }
        if (!canal.usuarios.has(player.id)) {
            this.sendTextMessage(player.id, TEXTOS.noEstas);
            return { ok: false, reason: 'notInChannel' };
        }
        // Del gremio sólo hablan los que siguen en él (alguien pudo salir con el canal abierto).
        if (canal.tipo === 'gremio') {
            const gremio = this._gremioPara(player);
            if (!gremio || gremio.id !== canal.gremioId) {
                this._sacarDelCanal(player, canal, true);
                this.sendTextMessage(player.id, TEXTOS.noEnGremio);
                return { ok: false, reason: 'notInGuild' };
            }
        }
        const staff = this.isStaff(player);
        if (canal.nivel > 1 && (Number(player.level) || 1) < canal.nivel && !staff) {
            this.sendTextMessage(player.id, decir(TEXTOS.nivelHablar, { nivel: canal.nivel }));
            return { ok: false, reason: 'level' };
        }
        const ahora = this.now();
        player.esperaDeCanal = player.esperaDeCanal || {};
        if (canal.espera > 0 && !staff && (player.esperaDeCanal[canal.id] || 0) > ahora) {
            this.sendTextMessage(player.id, TEXTOS.espera);
            return { ok: false, reason: 'cooldown' };
        }
        if (canal.onSpeak && canal.onSpeak(player, mensaje) === false) {
            return { ok: false, reason: 'script' };
        }
        const ev = this.eventoDeCanal ? this.eventoDeCanal('channelspeak', player, TALKTYPE_CANAL, mensaje, canal.id) : null;
        if (ev && ev.blocked) {
            return { ok: false, reason: 'script' };
        }
        if (canal.espera > 0 && !staff) {
            player.esperaDeCanal[canal.id] = ahora + canal.espera;
        }
        this._difundirEnCanal(canal, player.name, Number(player.level) || 1, mensaje, '');
        return { ok: true, to: canal.usuarios.size };
    },

    /** Manda una línea a todos los que están en un canal. Devuelve a cuántos. */
    _difundirEnCanal(canal, autor, nivel, texto, tipo) {
        let enviados = 0;
        Array.from(canal.usuarios).forEach((id) => {
            const destino = this.getPlayer(id);
            if (!destino) {
                canal.usuarios.delete(id);
                return;
            }
            this.emit('onChannelMessage', destino, canal.id, autor, nivel, texto, tipo);
            enviados += 1;
        });
        return enviados;
    },

    /**
     * UNA LÍNEA DEL SERVIDOR en un canal público o privado (el `sendChannelMessage(channelId, type,
     * message)` de TFS): sin autor, y el cliente la traduce. `tipo`: 'sistema' (por defecto) o 'rojo'.
     *
     * @returns {number} a cuántos llegó
     */
    enviarAlCanal(id, texto, tipo) {
        const canal = this._registroDeCanales().get(Number(id));
        if (!canal || !String(texto || '')) {
            return 0;
        }
        return this._difundirEnCanal(canal, '', 0, String(texto), tipo || 'sistema');
    },

    /**
     * Una línea del servidor en el canal de un gremio («Ana se ha unido al gremio.»): a los de ese
     * gremio que lo tienen abierto. Lo usa el sistema de gremios.
     */
    mensajeAlCanalDeGremio(guildId, texto, tipo) {
        this._registroDeCanales();
        const canal = this._canalesDeGremio.get(guildId) ||
            this._canalesDeGremio.get(Number(guildId)) || null;
        if (!canal || !String(texto || '')) {
            return 0;
        }
        return this._difundirEnCanal(canal, '', 0, String(texto), tipo || 'sistema');
    },

    // -----------------------------------------------------------------------
    // Los canales privados
    // -----------------------------------------------------------------------

    /** El canal privado de un jugador, o null. */
    canalPrivadoDe(player) {
        for (const canal of this._registroDeCanales().values()) {
            if (canal.tipo === 'privado' && canal.dueno === player.id) {
                return canal;
            }
        }
        return null;
    },

    /** ABRE SU CANAL PRIVADO (o el que ya tenía) y entra en él. */
    crearCanalPrivado(player) {
        let canal = this.canalPrivadoDe(player);
        if (!canal) {
            const registro = this._registroDeCanales();
            let id = CANAL.PRIVADO;
            while (registro.has(id)) {
                id += 1;
            }
            canal = nuevoCanal({ id: id, tipo: 'privado', dueno: player.id,
                nombre: decir(TEXTOS.nombrePrivado, { nombre: player.name }) });
            registro.set(id, canal);
        }
        return this.abrirCanal(player, canal.id);
    },

    /** INVITA a alguien (conectado) a su canal privado. */
    invitarAlCanal(player, nombre) {
        const canal = this.canalPrivadoDe(player);
        if (!canal) {
            this.sendTextMessage(player.id, TEXTOS.sinCanalPrivado);
            return { ok: false, reason: 'noPrivateChannel' };
        }
        const otro = this.playerByName(nombre);
        if (!otro) {
            this.sendTextMessage(player.id, decir(TEXTOS.noConectado, { nombre: String(nombre || '').trim() }));
            return { ok: false, reason: 'notOnline' };
        }
        if (otro === player) {
            this.sendTextMessage(player.id, TEXTOS.aTiMismo);
            return { ok: false, reason: 'self' };
        }
        const clave = otro.name.toLowerCase();
        if (canal.invitados.has(clave)) {
            this.sendTextMessage(player.id, decir(TEXTOS.yaInvitado, { nombre: otro.name }));
            return { ok: false, reason: 'alreadyInvited' };
        }
        canal.invitados.set(clave, otro.name);
        this.sendTextMessage(otro.id, decir(TEXTOS.teInvita, { nombre: player.name }));
        this.sendTextMessage(player.id, decir(TEXTOS.invitado, { nombre: otro.name }));
        return { ok: true };
    },

    /** EXCLUYE a alguien de su canal privado (esté o no conectado): si estaba dentro, se le cierra. */
    excluirDelCanal(player, nombre) {
        const canal = this.canalPrivadoDe(player);
        if (!canal) {
            this.sendTextMessage(player.id, TEXTOS.sinCanalPrivado);
            return { ok: false, reason: 'noPrivateChannel' };
        }
        const clave = String(nombre || '').trim().toLowerCase();
        if (!canal.invitados.has(clave)) {
            this.sendTextMessage(player.id, decir(TEXTOS.noEstaInvitado, { nombre: String(nombre || '').trim() }));
            return { ok: false, reason: 'notInvited' };
        }
        const visible = canal.invitados.get(clave);
        canal.invitados.delete(clave);
        const otro = this.playerByName(clave);
        if (otro && canal.usuarios.has(otro.id)) {
            this._sacarDelCanal(otro, canal, true);
        }
        this.sendTextMessage(player.id, decir(TEXTOS.excluido, { nombre: visible }));
        return { ok: true };
    }
};

module.exports = { canales, silenciadoPorDefecto, CANAL, CANALES_PUBLICOS: PUBLICOS, TEXTOS_CANALES: TEXTOS };
