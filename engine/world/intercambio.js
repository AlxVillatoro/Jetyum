'use strict';

/**
 * EL INTERCAMBIO ENTRE JUGADORES: la ventana «Trade with...» de Tibia 8.60 (en TFS,
 * `Game::playerRequestTrade`, `playerAcceptTrade`, `playerLookInTrade`, `internalCloseTrade`).
 *
 * Se mezcla en `World` igual que `contenedores.js` (`Object.assign(World.prototype, intercambio)`).
 *
 * CÓMO VA, como en TFS:
 *
 *   1. A OFRECE un objeto a B (`pedirIntercambio`): de lo que lleva, de un contenedor abierto o del
 *      suelo a su lado. A ve su oferta; B sólo recibe «A quiere comerciar contigo.».
 *   2. B CONTESTA ofreciendo otro a A, con las mismas reglas. Desde ese momento los dos ven las dos
 *      ofertas (un contenedor, con todo lo de dentro en una lista plana, como la de TFS).
 *   3. Cada uno puede MIRAR cualquier objeto de las dos ofertas (`mirarEnIntercambio`).
 *   4. Cada uno ACEPTA; al aceptar el segundo se comprueba que cada uno puede llevar lo que recibe
 *      (peso, y un hueco en un contenedor o una ranura libre) y se cambian los dos de golpe.
 *   5. Cualquier cosa que lo estropee lo CANCELA para los dos: cerrar la ventana, mover, usar o
 *      perder lo ofrecido, alejarse, salir del juego o morir.
 *
 * EL ESTADO vive en el jugador (`player.intercambio`, el mismo objeto en los dos): `{ lados: [lado,
 * lado] }`, y cada lado `{ player, oferta, aceptado }`. Una OFERTA es `{ entry }` (algo que lleva,
 * a cualquier profundidad) o `{ item }` (un objeto del mundo: en el suelo o dentro de un contenedor
 * del suelo), con su HUELLA del momento en que se ofreció.
 *
 * LA HUELLA es lo que hace posible "si ha cambiado, se cancela" sin engancharse a cada sitio del
 * motor que mueve objetos: dónde está (la cadena de contenedores que lo rodean, por identidad, y la
 * ranura o la casilla de fuera del todo) y qué es (el árbol de tipos, cantidades y atributos con
 * todo lo de dentro). Se vuelve a calcular tras cada mensaje del jugador, en cada tick y justo antes
 * de cambiar: si no coincide, el objeto se ha movido, gastado, transformado o le han metido o sacado
 * algo, y el intercambio se cancela, como el `checkTradeState` de TFS.
 *
 * Los mensajes al cliente salen por dos avisos del mundo: `onTradeUpdate(player, ventana)` (la
 * ventana al día) y `onTradeClose(player)` (se cierra). Los textos, por `sendTextMessage`.
 */

const { SLOT_INSIDE } = require('../../shared/js/protocol.mjs');
const { MAX_ANIDADO } = require('./contenedores');
const { Item } = require('./item');
const { formatWeight } = require('./weight');

/** Hasta dónde puede estar el otro: dos casillas, en la misma planta (como en TFS). */
const DISTANCIA_INTERCAMBIO = 2;

/** Lo más que se puede ofrecer de una vez, contando el contenedor y todo lo de dentro (TFS: 100). */
const MAX_OBJETOS_INTERCAMBIO = 100;

/** Las frases, para que el motor y las pruebas digan lo mismo. */
const TEXTOS = {
    quiere: '{nombre} quiere comerciar contigo.',
    acercate: '{nombre} te pide que te acerques.',
    contigo: 'No puedes comerciar contigo mismo.',
    noEsta: 'Ese jugador no está.',
    yaComercias: 'Ya estás comerciando.',
    yaComercia: 'Ese jugador ya está comerciando.',
    yaEnIntercambio: 'Ese objeto ya se está comerciando.',
    demasiados: 'No puedes comerciar con más de 100 objetos.',
    noSePuede: 'No puedes comerciar con eso.',
    noTienes: 'No tienes eso.',
    lejos: 'Esta demasiado lejos.',
    cancelado: 'Intercambio cancelado.',
    hecho: 'Intercambio completado.',
    sinCapacidad: 'No tienes capacidad suficiente para llevar {objeto}: pesa {peso} y te quedarían {libre} libres.',
    sinSitio: 'No tienes sitio para llevar {objeto}.',
    otroNoPuede: '{nombre} no puede llevar lo que le ofreces.'
};

function decir(texto, huecos) {
    return Object.keys(huecos || {}).reduce((t, k) => t.split('{' + k + '}').join(String(huecos[k])), texto);
}

const intercambio = {
    // -----------------------------------------------------------------------
    // Preguntar
    // -----------------------------------------------------------------------

    /** ¿Está comerciando (ha ofrecido algo, o alguien le ha ofrecido algo)? */
    estaComerciando(player) {
        return !!(player && player.intercambio);
    },

    /** Con quién comercia, o null. */
    companeroDeIntercambio(player) {
        const lados = this._ladosDeIntercambio(player);
        return lados ? lados.suyo.player : null;
    },

    /** Su lado y el del otro: `{ mio, suyo }`, o null si no comercia. */
    _ladosDeIntercambio(player) {
        const trato = player && player.intercambio;
        if (!trato) {
            return null;
        }
        const [a, b] = trato.lados;
        return a.player === player ? { mio: a, suyo: b } : { mio: b, suyo: a };
    },

    /**
     * ¿Ese objeto (`{ entry }` o `{ item }`) es lo que ofrece, o está dentro de lo que ofrece, o lo
     * lleva dentro? Es lo que se mira al USARLO: usar lo ofrecido cancela el intercambio.
     */
    objetoEnIntercambio(player, ref) {
        const lados = this._ladosDeIntercambio(player);
        const oferta = lados && lados.mio.oferta;
        if (!oferta || !ref) {
            return false;
        }
        if (oferta.entry && ref.entry) {
            return this._entradaContiene(player, oferta.entry, ref.entry) ||
                this._entradaContiene(player, ref.entry, oferta.entry);
        }
        if (oferta.item && ref.item) {
            return this._objetoDentroDe(ref.item, oferta.item) || this._objetoDentroDe(oferta.item, ref.item);
        }
        return false;
    },

    /** ¿`item` es `contenedor` o está dentro de él, a cualquier profundidad? */
    _objetoDentroDe(item, contenedor) {
        let actual = item;
        for (let paso = 0; actual && paso <= MAX_ANIDADO + 1; paso += 1) {
            if (actual === contenedor) {
                return true;
            }
            actual = actual.parent;
        }
        return false;
    },

    // -----------------------------------------------------------------------
    // Lo que se ofrece
    // -----------------------------------------------------------------------

    /**
     * El objeto que el cliente dice, ya buscado: `{ inventario: índice }` (lo que lleva), `{ contenedor:
     * id, hueco }` (de una ventana abierta: una bolsa suya, id negativo, o un contenedor del suelo) o
     * `{ suelo: [x, y, z] }` (lo de arriba de una casilla de al lado). La misma forma que el origen de
     * «usar con».
     *
     * @returns {{entry?: Object, item?: Item, reason?: string}}
     */
    _objetoParaIntercambio(player, origen) {
        const o = origen && typeof origen === 'object' ? origen : {};
        if (o.inventario !== undefined) {
            const entry = this.inventoryEntry(player, o.inventario);
            return entry ? { entry } : { reason: 'noItem' };
        }
        if (o.contenedor !== undefined && Number(o.contenedor) < 0) {
            const entry = this.entradaEnContenedorPropio(player, o.contenedor, o.hueco);
            return entry ? { entry } : { reason: 'noItem' };
        }
        if (o.contenedor !== undefined) {
            const contenedor = this.items.get(Number(o.contenedor));
            const donde = contenedor ? this.posicionDeObjeto(contenedor) : null;
            if (!contenedor || !donde || !contenedor.isContainer) {
                return { reason: 'noItem' };
            }
            if (!this.canReach(player, donde)) {
                return { reason: 'tooFar' };
            }
            const item = this.contentsOfItem(contenedor)[Number(o.hueco)];
            return item ? { item } : { reason: 'noItem' };
        }
        if (Array.isArray(o.suelo)) {
            const [x, y, z] = o.suelo.map(Number);
            if (!this._withinReach(player, x, y, z)) {
                return { reason: 'tooFar' };
            }
            const arriba = this._topItemAt(x, y, z);
            return arriba.item ? { item: arriba.item } : { reason: 'noItem' };
        }
        return { reason: 'noItem' };
    },

    /**
     * ¿SE PUEDE COMERCIAR CON ESO? Tiene que poder cogerse (lo que llevas ya se pudo), no ser el
     * depósito ni un cofre de depósito, y no tener `uniqueId` (los objetos únicos de las misiones no
     * cambian de manos: es la regla de TFS).
     */
    _sePuedeComerciar(oferta) {
        const typeId = oferta.entry ? oferta.entry.typeId : oferta.item.typeId;
        const attrs = (oferta.entry ? oferta.entry.attributes : oferta.item.attributes) || {};
        const objeto = oferta.item || new Item(this.itemTypes.get(Number(typeId)) || null, { attributes: attrs });
        if (!objeto.definition || !objeto.hasFlag('pickupable')) {
            return false;
        }
        if (oferta.item && (oferta.item.isDepot || this.isDepot(oferta.item))) {
            return false;
        }
        return !(attrs.uniqueId !== undefined && attrs.uniqueId !== null && Number(attrs.uniqueId) > 0);
    },

    /** Lo de dentro de un nodo de la oferta (una entrada o un objeto del mundo). */
    _hijosDeOferta(player, nodo, esEntrada) {
        return esEntrada ? this.contenidoDeEntrada(player, nodo) : this.contentsOfItem(nodo);
    },

    /**
     * LA OFERTA EN LISTA PLANA, como la enseña TFS: el objeto y, si es un contenedor, todo lo de dentro
     * por niveles (primero lo que lleva, luego lo de cada bolsa de dentro...). Cada uno con lo que hace
     * falta para dibujarlo y mirarlo.
     */
    _listaDeOferta(player, oferta) {
        const esEntrada = !!oferta.entry;
        const raiz = oferta.entry || oferta.item;
        const lista = [];
        const cola = [{ nodo: raiz, nivel: 0 }];
        while (cola.length > 0 && lista.length <= MAX_OBJETOS_INTERCAMBIO) {
            const { nodo, nivel } = cola.shift();
            lista.push(nodo);
            if (nivel <= MAX_ANIDADO) {
                this._hijosDeOferta(player, nodo, esEntrada).forEach((hijo) => cola.push({ nodo: hijo, nivel: nivel + 1 }));
            }
        }
        return lista;
    },

    /** Cómo viaja un objeto de la lista al cliente: `{ typeId, count, name, charges }`. */
    _objetoDeVentana(nodo) {
        const def = this.itemTypes.get(Number(nodo.typeId));
        const cargas = nodo.attributes && nodo.attributes.charges !== undefined ? Number(nodo.attributes.charges)
            : (def && def.attributes && def.attributes.charges !== undefined ? Number(def.attributes.charges) : 0);
        return {
            typeId: nodo.typeId,
            count: nodo.count,
            name: (def && def.name) || ('objeto ' + nodo.typeId),
            charges: Number(cargas) || 0
        };
    },

    /** El árbol de una oferta (tipos, cantidades, atributos), en texto: lo que dice si ha cambiado. */
    _arbolDeOferta(player, nodo, esEntrada, nivel) {
        const hijos = (nivel || 0) <= MAX_ANIDADO ? this._hijosDeOferta(player, nodo, esEntrada) : [];
        return [nodo.typeId, nodo.count, nodo.attributes || null,
            hijos.map((hijo) => this._arbolDeOferta(player, hijo, esEntrada, (nivel || 0) + 1))];
    },

    /**
     * LA HUELLA DE UNA OFERTA: dónde está y qué es (ver arriba). Null si ya no está: lo que llevaba
     * ya no lo lleva, o el objeto del mundo ya no cuelga de nada que esté en el mundo.
     */
    _huellaDeOferta(player, oferta) {
        const cadena = [];
        let raiz;
        if (oferta.entry) {
            let actual = oferta.entry;
            let arriba = null;
            for (let paso = 0; actual && paso <= MAX_ANIDADO + 2; paso += 1) {
                const ubicacion = this.ubicacionDeEntrada(player, actual);
                if (!ubicacion) {
                    return null;
                }
                cadena.push(actual);
                arriba = actual;
                actual = ubicacion.padre;
            }
            raiz = 'ranura:' + arriba.slot;
        } else {
            const donde = this.posicionDeObjeto(oferta.item);
            if (!donde) {
                return null;
            }
            for (let actual = oferta.item; actual; actual = actual.parent) {
                cadena.push(actual);
            }
            raiz = 'suelo:' + donde.x + ',' + donde.y + ',' + donde.z;
        }
        return { cadena, raiz, arbol: JSON.stringify(this._arbolDeOferta(player, oferta.entry || oferta.item, !!oferta.entry)) };
    },

    /** ¿Sigue la oferta igual que cuando se hizo? */
    _ofertaIntacta(player, oferta) {
        const ahora = this._huellaDeOferta(player, oferta);
        const antes = oferta.huella;
        if (!ahora || !antes || ahora.raiz !== antes.raiz || ahora.arbol !== antes.arbol ||
                ahora.cadena.length !== antes.cadena.length) {
            return false;
        }
        if (!ahora.cadena.every((nodo, i) => nodo === antes.cadena[i])) {
            return false;
        }
        // Lo del suelo, además, sigue al alcance de quien lo ofrece (TFS: a una casilla).
        return !oferta.item || this.canReach(player, this.posicionDeObjeto(oferta.item));
    },

    /**
     * ¿Ese objeto del mundo ya está en otro intercambio (él, uno que lo lleva dentro o uno que va
     * dentro de él)? Lo que lleva cada jugador sólo puede estar en el suyo, que es uno.
     */
    _yaEnIntercambio(oferta) {
        if (!oferta.item) {
            return false;
        }
        for (const otro of this.players.values()) {
            const trato = otro.intercambio;
            if (!trato) {
                continue;
            }
            for (const lado of trato.lados) {
                const suyo = lado.oferta && lado.oferta.item;
                if (suyo && (this._objetoDentroDe(oferta.item, suyo) || this._objetoDentroDe(suyo, oferta.item))) {
                    return true;
                }
            }
        }
        return false;
    },

    /** ¿Está el otro lo bastante cerca (dos casillas, misma planta)? */
    _cercaParaComerciar(a, b) {
        return !!(a && b && a.position && b.position && a.position.z === b.position.z &&
            Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y)) <= DISTANCIA_INTERCAMBIO);
    },

    // -----------------------------------------------------------------------
    // Ofrecer, aceptar, mirar, cancelar
    // -----------------------------------------------------------------------

    /**
     * OFRECE UN OBJETO A OTRO JUGADOR (el «Trade with...» de Tibia), o CONTESTA con uno a quien le
     * ofreció algo. Las reglas, en el orden de TFS: no contigo mismo, a dos casillas, un objeto que
     * se pueda comerciar y que no esté ya en otro intercambio, como mucho 100 objetos, y que ninguno
     * de los dos esté comerciando con otro. Un `onTradeRequest` de los scripts que devuelva `false`
     * lo impide (el script dice el porqué).
     *
     * Una invitación que todavía no has contestado no te deja ocupado: si ofreces algo a OTRO, esa
     * invitación se cancela (en TFS te quedabas bloqueado hasta que el otro la cerrara).
     *
     * @param {Object} origen ver `_objetoParaIntercambio`
     * @returns {{ok: boolean, reason?: string}}
     */
    pedirIntercambio(player, origen, otroId) {
        const avisar = (texto, huecos) => this.sendTextMessage(player.id, decir(texto, huecos));
        const otro = this.getPlayer(Number(otroId));
        if (!otro || (otro.isDead && otro.isDead())) {
            avisar(TEXTOS.noEsta);
            return { ok: false, reason: 'noPlayer' };
        }
        if (otro === player) {
            avisar(TEXTOS.contigo);
            return { ok: false, reason: 'self' };
        }
        if (!this._cercaParaComerciar(player, otro)) {
            avisar(TEXTOS.acercate, { nombre: otro.name });
            return { ok: false, reason: 'tooFar' };
        }

        const hallado = this._objetoParaIntercambio(player, origen);
        if (hallado.reason) {
            avisar(hallado.reason === 'tooFar' ? TEXTOS.lejos : TEXTOS.noTienes);
            return { ok: false, reason: hallado.reason };
        }
        const oferta = hallado.entry ? { entry: hallado.entry } : { item: hallado.item };
        if (!this._sePuedeComerciar(oferta)) {
            avisar(TEXTOS.noSePuede);
            return { ok: false, reason: 'notTradeable' };
        }
        if (this._yaEnIntercambio(oferta)) {
            avisar(TEXTOS.yaEnIntercambio);
            return { ok: false, reason: 'alreadyTraded' };
        }
        if (this._listaDeOferta(player, oferta).length > MAX_OBJETOS_INTERCAMBIO) {
            avisar(TEXTOS.demasiados);
            return { ok: false, reason: 'tooManyItems' };
        }

        // ¿Ocupados? Tú, si ya ofreciste algo (a quien sea); el otro, si comercia con otro.
        const mios = this._ladosDeIntercambio(player);
        if (mios && (mios.mio.oferta || mios.suyo.player !== otro)) {
            if (mios.mio.oferta) {
                avisar(TEXTOS.yaComercias);
                return { ok: false, reason: 'alreadyTrading' };
            }
            // Una invitación sin contestar de otro: se rechaza al ofrecer a éste.
            this.cancelarIntercambio(player);
        }
        const suyos = this._ladosDeIntercambio(otro);
        if (suyos && suyos.suyo.player !== player) {
            avisar(TEXTOS.yaComercia);
            return { ok: false, reason: 'partnerTrading' };
        }

        // Los scripts (`onTradeRequest(player, target, item)`): con `false`, no.
        if (this.eventoDeIntercambio) {
            const r = this.eventoDeIntercambio('traderequest', player, otro, this._refDeScript(player, oferta));
            if (r && r.blocked) {
                return { ok: false, reason: 'script' };
            }
        }

        if (oferta.item) {
            // Un objeto del mapa necesita identidad para seguirle la pista (y su raíz también).
            this.adoptItem(oferta.item);
            this.adoptItem(this.raizDeObjeto(oferta.item));
        }
        oferta.huella = this._huellaDeOferta(player, oferta);

        if (suyos) {
            // CONTESTA: el otro ya le había ofrecido algo. Ahora los dos ven las dos ofertas.
            suyos.suyo.oferta = oferta;
            this._enviarIntercambio(player.intercambio);
            return { ok: true, counter: true };
        }

        const trato = {
            lados: [
                { player: player, oferta: oferta, aceptado: false },
                { player: otro, oferta: null, aceptado: false }
            ]
        };
        player.intercambio = trato;
        otro.intercambio = trato;
        this.sendTextMessage(otro.id, decir(TEXTOS.quiere, { nombre: player.name }));
        this._enviarIntercambio(trato);
        return { ok: true, counter: false };
    },

    /**
     * ACEPTA. Hacen falta las dos ofertas. Si el otro ya había aceptado, se intenta cambiar; si no,
     * los dos ven que éste ha aceptado.
     *
     * @returns {{ok: boolean, reason?: string, completed?: boolean}}
     */
    aceptarIntercambio(player) {
        const lados = this._ladosDeIntercambio(player);
        if (!lados || !lados.mio.oferta || !lados.suyo.oferta) {
            return { ok: false, reason: 'notTrading' };
        }
        if (!this.revisarIntercambio(player)) {
            return { ok: false, reason: 'cancelled' };
        }
        lados.mio.aceptado = true;
        if (!lados.suyo.aceptado) {
            this._enviarIntercambio(player.intercambio);
            return { ok: true, completed: false };
        }
        return this._completarIntercambio(player, lados.suyo.player);
    },

    /**
     * MIRAR un objeto de una oferta: `suya` (la del otro, o la tuya) y su índice en la lista plana.
     *
     * @returns {{typeId: number, count: number, attributes: Object}|null}
     */
    mirarEnIntercambio(player, suya, indice) {
        const lados = this._ladosDeIntercambio(player);
        const lado = lados ? (suya ? lados.suyo : lados.mio) : null;
        if (!lado || !lado.oferta || !this.revisarIntercambio(player)) {
            return null;
        }
        const nodo = this._listaDeOferta(lado.player, lado.oferta)[Number(indice)];
        return nodo ? { typeId: nodo.typeId, count: nodo.count, attributes: nodo.attributes || null } : null;
    },

    /**
     * CANCELA el intercambio en el que esté (si está en alguno): «Intercambio cancelado.» a los dos y
     * se cierran sus ventanas.
     *
     * @returns {boolean} si había algo que cancelar
     */
    cancelarIntercambio(player) {
        const trato = player && player.intercambio;
        if (!trato) {
            return false;
        }
        this._cerrarIntercambio(trato, TEXTOS.cancelado);
        return true;
    },

    /**
     * ¿SIGUE VALIENDO? Los dos en el mundo y vivos, a dos casillas en la misma planta, y lo ofrecido
     * donde estaba y como estaba. Si no, se cancela. Lo llama la sesión tras cada mensaje y en cada
     * tick, el motor cuando alguien se mueve, y esto mismo antes de cambiar.
     *
     * @returns {boolean} si sigue en pie
     */
    revisarIntercambio(player) {
        const trato = player && player.intercambio;
        if (!trato) {
            return false;
        }
        const roto = trato.lados.some((lado) => {
            const p = lado.player;
            if (this.getPlayer(p.id) !== p || p.removed || (p.isDead && p.isDead())) {
                return true;
            }
            return !!lado.oferta && !this._ofertaIntacta(p, lado.oferta);
        }) || !this._cercaParaComerciar(trato.lados[0].player, trato.lados[1].player);
        if (roto) {
            this._cerrarIntercambio(trato, TEXTOS.cancelado);
            return false;
        }
        return true;
    },

    // -----------------------------------------------------------------------
    // Por dentro
    // -----------------------------------------------------------------------

    /** Lo que se le pasa a un script por una oferta (el motor lo envuelve). */
    _refDeScript(player, oferta) {
        return oferta ? { playerId: player.id, entry: oferta.entry || null, item: oferta.item || null } : null;
    },

    /** La ventana de cada uno al día: a quien ya tiene ventana (el que ofreció algo). */
    _enviarIntercambio(trato) {
        trato.lados.forEach((lado, i) => {
            const otro = trato.lados[1 - i];
            // Quien sólo ha sido invitado no tiene ventana hasta que contesta (como en TFS).
            if (!lado.oferta) {
                return;
            }
            this.emit('onTradeUpdate', lado.player, {
                companero: otro.player.name,
                tuya: this._listaDeOferta(lado.player, lado.oferta).map((n) => this._objetoDeVentana(n)),
                suya: otro.oferta ? this._listaDeOferta(otro.player, otro.oferta).map((n) => this._objetoDeVentana(n)) : null,
                aceptaste: lado.aceptado === true,
                acepto: otro.aceptado === true
            });
        });
    },

    /** Se acaba (cancelado o hecho): se dice a los dos, se cierran sus ventanas y quedan libres. */
    _cerrarIntercambio(trato, texto) {
        trato.lados.forEach((lado) => {
            if (lado.player.intercambio === trato) {
                lado.player.intercambio = null;
            }
        });
        trato.lados.forEach((lado) => {
            if (texto) {
                this.sendTextMessage(lado.player.id, texto);
            }
            this.emit('onTradeClose', lado.player);
        });
    },

    /** Lo que pesa lo ofrecido, con todo lo de dentro (la mochila puesta, con lo que lleva). */
    _pesoDeOferta(player, oferta) {
        if (oferta.item) {
            return this.pesoDeObjeto(oferta.item);
        }
        const entry = oferta.entry;
        if (entry === this.containerOf(player)) {
            return this.contentsOf(player).reduce((total, e) => total + this.pesoDeEntrada(e),
                this.weightOfItem(entry.typeId, entry.count));
        }
        return this.pesoDeEntrada(entry);
    },

    /** El nombre de lo ofrecido, para los mensajes: «a sword», «25 arrows». */
    _nombreDeOferta(oferta) {
        const nodo = oferta.entry || oferta.item;
        const def = this.itemTypes.get(Number(nodo.typeId));
        const nombre = (def && def.name) || ('objeto ' + nodo.typeId);
        return nodo.count > 1 ? nodo.count + ' ' + nombre : ((def && def.article ? def.article + ' ' : '') + nombre);
    },

    /**
     * DÓNDE IRÍA LO QUE RECIBE `receptor`, contando con que lo que él da ya se ha ido (`sale`): su peso
     * no cuenta y su hueco queda libre. Por orden, como el `INDEX_WHEREEVER` de TFS: su mochila, otra
     * bolsa que lleve (la primera con hueco) o, si va en una ranura y la tiene libre, puesto. Sin
     * tocar nada.
     *
     * @returns {{ok: boolean, destino?: Object, reason?: string, weight?: number, free?: number}}
     */
    _dondeRecibe(receptor, sale, entra, dador) {
        const nodo = entra.entry || entra.item;
        const typeId = nodo.typeId;
        const count = nodo.count;
        const altura = entra.entry ? this.alturaDeEntrada(dador, entra.entry) : this.alturaDeObjeto(entra.item);

        // --- El peso: lo que tiene, menos lo que da, más lo que recibe ---
        const peso = this._pesoDeOferta(dador, entra);
        const libre = this.capacityOf(receptor) - this.weightOf(receptor) +
            (sale && sale.entry ? this._pesoDeOferta(receptor, sale) : 0);
        if (peso > libre) {
            return { ok: false, reason: 'tooHeavy', weight: peso, free: libre };
        }

        // --- Un sitio ---
        const saliente = sale && sale.entry ? sale.entry : null;
        const fuera = (e) => !!saliente && this._entradaContiene(receptor, saliente, e);
        const cabe = (lista, capacidad) => {
            const dentro = lista.filter((e) => !fuera(e));
            const nuevas = this._pilasNuevasEn(dentro, typeId, count);
            return nuevas === 0 || dentro.length + nuevas <= capacidad;
        };
        const mochila = this.containerOf(receptor);
        if (mochila && !fuera(mochila) && 1 + altura <= MAX_ANIDADO &&
                cabe(this.contentsOf(receptor), this.capacityOfType(mochila.typeId))) {
            return { ok: true, destino: { mochila: true } };
        }
        const bolsas = this.todasLasEntradas(receptor).map((t) => t.entry)
            .filter((e) => e !== mochila && this.isContainerEntry(e) && !fuera(e));
        for (const bolsa of bolsas) {
            const ubicacion = this.ubicacionDeEntrada(receptor, bolsa);
            if (ubicacion && ubicacion.nivel + 1 + altura <= MAX_ANIDADO &&
                    cabe(this.contenidoDeEntrada(receptor, bolsa), this.capacityOfType(bolsa.typeId))) {
                return { ok: true, destino: { entry: bolsa } };
            }
        }
        const ranura = this.slotOf(typeId);
        const puesto = ranura ? this.equippedIn(receptor, ranura) : null;
        if (ranura && (!puesto || fuera(puesto)) && altura <= MAX_ANIDADO &&
                (ranura !== 'backpack' || !mochila || fuera(mochila))) {
            return { ok: true, destino: { ranura: ranura } };
        }
        return { ok: false, reason: 'noRoom' };
    },

    /** Saca lo ofrecido de donde esté y lo devuelve hecho ENTRADA, con todo lo de dentro. */
    _sacarOferta(lado) {
        const oferta = lado.oferta;
        if (oferta.entry) {
            return this._desprenderEntrada(lado.player, oferta.entry);
        }
        const item = oferta.item;
        const entrada = this._entradaDesdeObjeto(item);
        const casilla = item.parent || !item.position ? null
            : this.map.getTile(item.position.x, item.position.y, item.position.z);
        this._takeFromGround(item, casilla);
        return entrada;
    },

    /** Pone una entrada suelta donde dijo `_dondeRecibe`. */
    _ponerRecibido(receptor, entrada, destino) {
        if (!(receptor.inventory instanceof Array)) {
            receptor.inventory = [];
        }
        if (destino.ranura) {
            entrada.slot = destino.ranura;
            entrada.position = receptor.inventory.length;
            receptor.inventory.push(entrada);
            if (this.isContainerEntry(entrada) && destino.ranura === 'backpack') {
                this._desplegarComoMochila(receptor, entrada);
            }
            return;
        }
        this._ponerEntradaEn(receptor, destino.entry || null, entrada);
    },

    /**
     * EL CAMBIO, cuando los dos han aceptado (`player` el último). Se comprueba todo otra vez —las dos
     * ofertas intactas, el `onTradeAccept` de los scripts y que cada uno pueda llevar lo que recibe— y
     * sólo entonces se sacan las dos y se pone cada una en su sitio: o se cambian las dos, o ninguna.
     */
    _completarIntercambio(player, otro) {
        const trato = player.intercambio;
        const lados = this._ladosDeIntercambio(player);
        if (!this.revisarIntercambio(player)) {
            return { ok: false, reason: 'cancelled' };
        }
        if (this.eventoDeIntercambio) {
            const r = this.eventoDeIntercambio('tradeaccept', player, otro,
                this._refDeScript(player, lados.mio.oferta), this._refDeScript(otro, lados.suyo.oferta));
            // Un script puede haber movido algo: se mira otra vez.
            if ((r && r.blocked) || !this.revisarIntercambio(player)) {
                if (player.intercambio === trato) {
                    this._cerrarIntercambio(trato, TEXTOS.cancelado);
                }
                return { ok: false, reason: 'script' };
            }
        }

        const paraMi = this._dondeRecibe(player, lados.mio.oferta, lados.suyo.oferta, otro);
        const paraEl = this._dondeRecibe(otro, lados.suyo.oferta, lados.mio.oferta, player);
        const explicar = (quien, r, oferta) => {
            const objeto = this._nombreDeOferta(oferta);
            this.sendTextMessage(quien.id, r.reason === 'tooHeavy'
                ? decir(TEXTOS.sinCapacidad, { objeto, peso: formatWeight(r.weight), libre: formatWeight(Math.max(0, r.free)) })
                : decir(TEXTOS.sinSitio, { objeto }));
        };
        if (!paraMi.ok || !paraEl.ok) {
            if (!paraMi.ok) {
                explicar(player, paraMi, lados.suyo.oferta);
                this.sendTextMessage(otro.id, decir(TEXTOS.otroNoPuede, { nombre: player.name }));
            }
            if (!paraEl.ok) {
                explicar(otro, paraEl, lados.mio.oferta);
                this.sendTextMessage(player.id, decir(TEXTOS.otroNoPuede, { nombre: otro.name }));
            }
            this._cerrarIntercambio(trato, TEXTOS.cancelado);
            return { ok: false, reason: !paraMi.ok ? paraMi.reason : paraEl.reason };
        }

        // Y ahora sí: las dos fuera, y cada una a su sitio.
        const miEntrada = this._sacarOferta(lados.mio);
        const suEntrada = this._sacarOferta(lados.suyo);
        this._ponerRecibido(player, suEntrada, paraMi.destino);
        this._ponerRecibido(otro, miEntrada, paraEl.destino);
        [player, otro].forEach((p) => {
            this._reindexInventory(p.inventory);
            this.recomputeEquipment(p);
        });
        this._cerrarIntercambio(trato, TEXTOS.hecho);
        [player, otro].forEach((p) => this.emit('onInventoryChange', p));
        return { ok: true, completed: true };
    }
};

module.exports = { intercambio, DISTANCIA_INTERCAMBIO, MAX_OBJETOS_INTERCAMBIO, TEXTOS_INTERCAMBIO: TEXTOS };
