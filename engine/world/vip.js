'use strict';

/**
 * LA LISTA VIP EN EL SERVIDOR, como en Tibia 8.60 (en TFS, `account_viplist`, `Player::addVIP`,
 * `Game::playerRequestAddVip` y `Player::notifyStatusChange`).
 *
 * Se mezcla en `World` igual que `correo.js` (`Object.assign(World.prototype, vip)`).
 *
 * ES DE LA CUENTA, no del personaje: todos los personajes de una cuenta ven la misma lista, que vive
 * en la tabla `account_viplist` (versión 8 de la base). Apunta a personajes por su id, así que
 * añadir sólo vale con un nombre que EXISTA en la base (esté dentro o no), y un personaje que cambie
 * de nombre sigue en la lista. Caben `vipLimit` (config.js; 20, los de una cuenta gratuita de TFS).
 *
 *   - Al ENTRAR, el jugador recibe su lista entera con quién está dentro (`enviarListaVip`), y cada
 *     jugador que lo tiene en su lista recibe que ha entrado (`avisarVip(player, true)`).
 *   - Al SALIR, lo mismo con «ha salido» (`avisarVip(player, false)`).
 *   - Añadir o quitar manda la lista nueva a todos los personajes de esa cuenta que estén dentro.
 *
 * La base la pone el motor en `world.vipEnLaBase` (como `correoEnLaBase`); sin persistencia no hay
 * lista en el servidor y el cliente se queda con la suya, la de su navegador.
 *
 * Al cliente se llega por dos avisos del mundo: `onVipList(player, [{id, nombre, enLinea}])` y
 * `onVipState(player, id, nombre, enLinea)`. Los errores, por `sendTextMessage`.
 */

/** Cuántos caben si config.js no dice otra cosa (TFS: 20 en una cuenta gratuita). */
const LIMITE_VIP = 20;

/** Las frases, para que el motor y las pruebas digan lo mismo (las de TFS). */
const TEXTOS = {
    noExiste: 'No existe ningún personaje con ese nombre.',
    yaEsta: 'Ese jugador ya está en tu lista.',
    lleno: 'No puedes añadir más amigos.',
    tuMismo: 'No puedes añadirte a ti mismo.',
    noEsta: 'Ese jugador no está en tu lista.',
    sinBase: 'La lista VIP necesita que el servidor guarde las cuentas.'
};

const vip = {
    /** ¿Hay lista VIP en el servidor para este jugador? (Base abierta y personaje con cuenta.) */
    tieneListaVip(player) {
        return !!(this.vipEnLaBase && player && player.accountId);
    },

    /** Cuántos caben en una lista (`vipLimit` de config.js). */
    limiteVip() {
        return Number(this.vipLimit) > 0 ? Number(this.vipLimit) : LIMITE_VIP;
    },

    /** Los ids de personaje que están dentro ahora mismo. */
    _personajesDentro() {
        const dentro = new Set();
        this.players.forEach((p) => {
            if (p.characterId) {
                dentro.add(Number(p.characterId));
            }
        });
        return dentro;
    },

    /**
     * LA LISTA de la cuenta de un jugador, por nombre, con quién está dentro.
     *
     * @returns {Array<{id: number, nombre: string, enLinea: boolean}>}
     */
    listaVip(player) {
        if (!this.tieneListaVip(player)) {
            return [];
        }
        const dentro = this._personajesDentro();
        return this.vipEnLaBase.listar(player.accountId).map((fila) => ({
            id: Number(fila.playerId),
            nombre: fila.name,
            enLinea: dentro.has(Number(fila.playerId))
        }));
    },

    /** Le manda su lista (al entrar). */
    enviarListaVip(player) {
        if (!this.tieneListaVip(player)) {
            return false;
        }
        this.emit('onVipList', player, this.listaVip(player));
        return true;
    },

    /** La lista nueva, a todos los personajes de esa cuenta que estén dentro. */
    _listaVipALaCuenta(accountId) {
        let lista = null;
        this.players.forEach((p) => {
            if (p.accountId === accountId) {
                lista = lista || this.listaVip(p);
                this.emit('onVipList', p, lista);
            }
        });
    },

    /**
     * AÑADE un personaje a la lista de la cuenta, por su nombre.
     *
     * @returns {{ok: boolean, reason?: string, entrada?: Object}}
     */
    anadirVip(player, nombre) {
        if (!this.tieneListaVip(player)) {
            this.sendTextMessage(player.id, TEXTOS.sinBase);
            return { ok: false, reason: 'noDatabase' };
        }
        const otro = this.vipEnLaBase.personaje(String(nombre || '').trim());
        if (!otro) {
            this.sendTextMessage(player.id, TEXTOS.noExiste);
            return { ok: false, reason: 'notFound' };
        }
        if (Number(otro.id) === Number(player.characterId)) {
            this.sendTextMessage(player.id, TEXTOS.tuMismo);
            return { ok: false, reason: 'self' };
        }
        const lista = this.vipEnLaBase.listar(player.accountId);
        if (lista.some((f) => Number(f.playerId) === Number(otro.id))) {
            this.sendTextMessage(player.id, TEXTOS.yaEsta);
            return { ok: false, reason: 'already' };
        }
        if (lista.length >= this.limiteVip() && !this.isStaff(player)) {
            this.sendTextMessage(player.id, TEXTOS.lleno);
            return { ok: false, reason: 'full' };
        }
        this.vipEnLaBase.anadir(player.accountId, otro.id);
        this._listaVipALaCuenta(player.accountId);
        return { ok: true, entrada: { id: Number(otro.id), nombre: otro.name,
            enLinea: this._personajesDentro().has(Number(otro.id)) } };
    },

    /** QUITA a alguien de la lista, por su id de personaje o por su nombre. */
    quitarVip(player, idONombre) {
        if (!this.tieneListaVip(player)) {
            this.sendTextMessage(player.id, TEXTOS.sinBase);
            return { ok: false, reason: 'noDatabase' };
        }
        const porId = typeof idONombre === 'number' || /^\d+$/.test(String(idONombre || ''));
        const buscado = String(idONombre || '').trim().toLowerCase();
        const fila = this.vipEnLaBase.listar(player.accountId).find((f) => (porId
            ? Number(f.playerId) === Number(idONombre)
            : String(f.name).toLowerCase() === buscado));
        if (!fila) {
            this.sendTextMessage(player.id, TEXTOS.noEsta);
            return { ok: false, reason: 'notInList' };
        }
        this.vipEnLaBase.quitar(player.accountId, fila.playerId);
        this._listaVipALaCuenta(player.accountId);
        return { ok: true };
    },

    /**
     * AVISA de que un jugador ha entrado (o salido) a todos los que están dentro y lo tienen en su
     * lista (menos a él mismo). Devuelve a cuántos.
     */
    avisarVip(player, enLinea) {
        if (!this.vipEnLaBase || !player || !player.characterId) {
            return 0;
        }
        const cuentas = new Set(this.vipEnLaBase.seguidores(player.characterId).map(Number));
        if (cuentas.size === 0) {
            return 0;
        }
        let avisados = 0;
        this.players.forEach((p) => {
            if (p !== player && cuentas.has(Number(p.accountId))) {
                this.emit('onVipState', p, Number(player.characterId), player.name, !!enLinea);
                avisados += 1;
            }
        });
        return avisados;
    }
};

module.exports = { vip, LIMITE_VIP, TEXTOS_VIP: TEXTOS };
