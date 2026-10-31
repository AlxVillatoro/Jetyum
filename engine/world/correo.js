'use strict';

/**
 * EL CORREO: buzones, cartas, paquetes y etiquetas, como en Tibia 8.60 (el `Mailbox` de TFS).
 *
 * Se mezcla en `World` igual que `contenedores.js` (`Object.assign(World.prototype, correo)`): son
 * métodos del mundo, en un archivo propio porque son un sistema entero con sus reglas.
 *
 * CÓMO SE MANDA ALGO, que es lo que hace un jugador:
 *
 *   1. compra una CARTA (o un PAQUETE y una ETIQUETA) al Tendero;
 *   2. la usa y escribe: en la PRIMERA LÍNEA el nombre de quien la recibe y, si quiere, en la
 *      SEGUNDA la ciudad (sin ella, la de quien la recibe). Un paquete lleva esas dos líneas en una
 *      etiqueta metida dentro (`data/scripts/actions/correo.js`);
 *   3. la echa en un BUZÓN: la arrastra a su casilla (`echarAlBuzon`, desde `moveItem`) o la usa
 *      sobre él (`enviarPorCorreo`, desde el script).
 *
 * Si todo está bien la carta se SELLA (pasa a su versión sellada, `stampedId` en items.xml, que ya
 * no se escribe ni se vuelve a mandar) y llega al DEPÓSITO de esa ciudad de quien la recibe:
 *
 *   - si está dentro, al momento (y si tiene el depósito abierto, la ventana se pone al día sola);
 *   - si no, espera en la tabla `player_mail` (versión 7 de la base) y se le entrega al entrar
 *     (`entregarCorreoPendiente`, desde el `onLogin` de `data/scripts/events/correo.js`).
 *
 * Si algo falla (no dice a quién va, no existe esa persona o esa ciudad, el paquete lleva un
 * depósito o demasiadas bolsas unas dentro de otras), NO SE MUEVE NADA: la carta se queda donde
 * estaba y se le dice por qué.
 *
 * Y LA PUERTA PARA LOS DEMÁS: `entregarEnDeposito(personaje, árbol, { townId, remitente })` deja
 * cualquier objeto en el depósito de alguien, esté dentro o no. El correo la usa, y la usan las
 * casas para mandar al depósito de su antiguo dueño lo que había dentro.
 *
 * QUÉ ES CADA COSA lo dice items.xml, no este archivo (los objetos los da de alta
 * `tools/generar-correo.mjs`): un buzón lleva `mailbox`, lo que se puede mandar lleva `stampedId`
 * (el id de su versión sellada) y una etiqueta lleva `mailLabel`.
 */

const { MAX_ANIDADO } = require('./contenedores');

/** Un atributo del TIPO de un objeto (`items.xml`), o undefined. */
function atributoDeTipo(world, typeId, clave) {
    const def = world.itemTypes.get(Number(typeId));
    return def && def.attributes ? def.attributes[clave] : undefined;
}

/** ¿Está puesta una bandera de items.xml («1», 1, true)? */
function puesta(valor) {
    return valor === true || valor === 1 || valor === '1' || valor === 'true';
}

/** Cuántos niveles de contenedor tiene un árbol guardado (0 si no es contenedor). */
function alturaDeArbol(world, arbol, profundidad) {
    if (!arbol || !world.isContainerType(arbol.typeId) || (profundidad || 0) > MAX_ANIDADO + 1) {
        return 0;
    }
    const hijos = Array.isArray(arbol.contents) ? arbol.contents : [];
    return 1 + hijos.reduce((maximo, hijo) => Math.max(maximo, alturaDeArbol(world, hijo, (profundidad || 0) + 1)), 0);
}

/** ¿Lleva un depósito en algún sitio del árbol? (Un depósito no viaja.) */
function llevaDeposito(world, arbol, profundidad) {
    if (!arbol || (profundidad || 0) > MAX_ANIDADO + 1) {
        return false;
    }
    if (world.isDepot({ typeId: arbol.typeId, attributes: arbol.attributes })) {
        return true;
    }
    return (Array.isArray(arbol.contents) ? arbol.contents : []).some((hijo) => llevaDeposito(world, hijo, (profundidad || 0) + 1));
}

const correo = {
    // -----------------------------------------------------------------------
    // Qué es cada cosa
    // -----------------------------------------------------------------------

    /** ¿Es un buzón? (un objeto, o un envoltorio de los scripts con `getId`). */
    esBuzon(item) {
        const typeId = item && (item.typeId !== undefined ? item.typeId : (item.getId ? item.getId() : 0));
        return !!typeId && puesta(atributoDeTipo(this, typeId, 'mailbox'));
    },

    /** ¿Hay un buzón en esa casilla? */
    buzonEn(x, y, z) {
        const tile = this.map ? this.map.getTile(Number(x), Number(y), Number(z)) : null;
        return !!tile && tile.getItems().some((item) => this.esBuzon(item));
    },

    /** El id de la versión SELLADA de lo que se puede mandar (una carta, un paquete), o 0. */
    selladoDe(typeId) {
        return Number(atributoDeTipo(this, typeId, 'stampedId')) || 0;
    },

    /** ¿Es una etiqueta de paquete? */
    esEtiqueta(typeId) {
        return puesta(atributoDeTipo(this, typeId, 'mailLabel'));
    },

    /**
     * A QUIÉN VA, leído de un texto: la primera línea es el nombre y la segunda la ciudad (vacía si
     * no la dice). Como en TFS, se mira línea a línea y sin espacios alrededor.
     */
    destinatarioDe(texto) {
        const lineas = String(texto || '').split(/\r?\n/);
        return { nombre: (lineas[0] || '').trim(), ciudad: (lineas[1] || '').trim() };
    },

    /** Una ciudad del mapa por su nombre (sin mayúsculas), o null. */
    ciudadPorNombre(nombre) {
        const buscado = String(nombre || '').trim().toLowerCase();
        return ((this.map && this.map.towns) || []).find((t) => String(t.name || '').toLowerCase() === buscado) || null;
    },

    // -----------------------------------------------------------------------
    // Entregar en un depósito
    // -----------------------------------------------------------------------

    /**
     * QUIÉN ES, por su id de personaje (un número) o por su nombre: si está dentro, su jugador; si
     * no, lo que diga la base (`correoEnLaBase.personaje`; `correoEnLaBase` lo pone engine.js cuando
     * hay base de datos, y sin ella sólo existe quien está dentro). Null si no existe.
     *
     * @returns {{jugador: Player|null, id: number, nombre: string, townId: number}|null}
     */
    buscarDestinatario(idONombre) {
        const porId = typeof idONombre === 'number' || /^\d+$/.test(String(idONombre || '').trim());
        let jugador = null;
        if (porId) {
            const id = Number(idONombre);
            jugador = [...this.players.values()].find((p) => p.characterId === id) || null;
        } else {
            jugador = this.playerByName(idONombre);
        }
        if (jugador) {
            return { jugador, id: jugador.characterId || 0, nombre: jugador.name, townId: Number(jugador.townId) || 0 };
        }
        const base = this.correoEnLaBase || null;
        let fila = null;
        try {
            fila = base ? base.personaje(porId ? Number(idONombre) : String(idONombre || '').trim()) : null;
        } catch (error) {
            fila = null;
        }
        if (!fila) {
            return null;
        }
        // Por si entró con otro nombre en las mayúsculas: el de dentro manda.
        jugador = [...this.players.values()].find((p) => p.characterId === fila.id) || null;
        return { jugador, id: fila.id, nombre: jugador ? jugador.name : fila.name, townId: Number(fila.townId) || 0 };
    },

    /**
     * La ciudad a la que va: la pedida, si existe (null si no); y sin pedir ninguna, la de quien lo
     * recibe. En un mapa sin ciudades vale cualquiera (sólo hay un depósito).
     */
    _ciudadDeEntrega(destino, townId) {
        const ciudades = (this.map && this.map.towns) || [];
        if (townId !== undefined && townId !== null && townId !== '' && Number(townId) > 0) {
            if (ciudades.length === 0) {
                return Number(townId);
            }
            const ciudad = ciudades.find((t) => t.id === Number(townId));
            return ciudad ? ciudad.id : null;
        }
        return this.ciudadDelJugador(destino.jugador || { townId: destino.townId });
    },

    /**
     * DEJA UN OBJETO EN EL DEPÓSITO DE ALGUIEN, esté dentro o no. Es la puerta del correo y de lo
     * que no es correo (las cosas de una casa que se pierde vuelven al depósito de su dueño).
     *
     * @param {number|string} idONombre su id de personaje (`characterId`) o su nombre
     * @param {Object} guardado el objeto como árbol `{typeId, count, attributes, contents?}`, el
     *        formato de `objetoParaGuardar` (contenedores.js). Se copia: el que se pasa no se toca.
     * @param {Object} [opciones]
     * @param {number} [opciones.townId] la ciudad del depósito; sin ella, la de quien lo recibe. Una
     *        que no existe hace que no se entregue.
     * @param {string} [opciones.remitente] quién lo manda (se apunta con el correo que espera).
     * @param {string|false} [opciones.aviso] lo que se le dice si está dentro (por defecto «Te ha
     *        llegado correo nuevo.»; `false`, nada).
     * @returns {boolean} si se entregó (o quedó esperando a que entre)
     */
    entregarEnDeposito(idONombre, guardado, opciones) {
        const o = opciones || {};
        if (!guardado || typeof guardado !== 'object' || !this.itemTypes.has(Number(guardado.typeId))) {
            return false;
        }
        const destino = this.buscarDestinatario(idONombre);
        if (!destino) {
            return false;
        }
        const ciudad = this._ciudadDeEntrega(destino, o.townId);
        if (ciudad === null) {
            return false;
        }
        const arbol = JSON.parse(JSON.stringify(guardado));

        // DENTRO: a su depósito ya. Si lo tiene abierto, su ventana lo enseña en el siguiente tick.
        if (destino.jugador) {
            if (!this._meterEnDeposito(destino.jugador, ciudad, arbol)) {
                return false;
            }
            if (o.aviso !== false) {
                this.sendTextMessage(destino.jugador.id, o.aviso || 'Te ha llegado correo nuevo.');
            }
            return true;
        }

        // FUERA: espera en la base a que entre.
        const base = this.correoEnLaBase || null;
        if (!base || !destino.id) {
            return false;
        }
        try {
            base.dejar(destino.id, { townId: ciudad, time: this.now(), sender: o.remitente || '', item: arbol });
        } catch (error) {
            return false;
        }
        return true;
    },

    /**
     * Mete un árbol en el depósito de una ciudad de un jugador que está dentro, DELANTE de lo que
     * hubiera (lo nuevo se ve primero). El depósito no tiene tope para lo que llega, como en TFS:
     * lo que te mandan no se pierde por tenerlo lleno.
     */
    _meterEnDeposito(player, ciudad, arbol) {
        const montado = player.depotItems instanceof Map ? player.depotItems.get(Number(ciudad)) : null;
        if (montado) {
            const objeto = this.objetoDesdeGuardado(arbol, montado);
            if (!objeto) {
                return false;
            }
            montado.contents.unshift(objeto);
            return true;
        }
        const depositos = this._depositosDe(player);
        depositos[String(ciudad)] = [arbol].concat(depositos[String(ciudad)] || []);
        return true;
    },

    /**
     * AL ENTRAR, EL CORREO QUE ESPERABA: cada fila de `player_mail` va al depósito de su ciudad (o
     * al de la suya, si esa ciudad ya no está en el mapa), se guarda el personaje y se borran las
     * filas, en ese orden: si algo falla en medio, el correo se entrega dos veces antes que ninguna.
     * Lo que ya no existe en items.xml se queda esperando. Devuelve cuántos entregó.
     */
    entregarCorreoPendiente(player) {
        const base = this.correoEnLaBase || null;
        if (!base || !player || !player.characterId) {
            return 0;
        }
        let filas = [];
        try {
            filas = base.pendiente(player.characterId) || [];
        } catch (error) {
            return 0;
        }
        const ciudades = (this.map && this.map.towns) || [];
        const entregadas = [];
        filas.forEach((fila) => {
            if (!fila.item || !this.itemTypes.has(Number(fila.item.typeId))) {
                return;
            }
            const ciudad = ciudades.some((t) => t.id === fila.townId) || (ciudades.length === 0 && fila.townId > 0)
                ? fila.townId : this.ciudadDelJugador(player);
            if (this._meterEnDeposito(player, ciudad, fila.item)) {
                entregadas.push(fila.id);
            }
        });
        if (entregadas.length === 0) {
            return 0;
        }
        if (base.guardar) {
            base.guardar(player);
        }
        base.borrar(entregadas);
        this.sendTextMessage(player.id, 'Tienes correo nuevo.');
        return entregadas.length;
    },

    // -----------------------------------------------------------------------
    // Mandar
    // -----------------------------------------------------------------------

    /**
     * ALGO QUE SE SUELTA EN LA CASILLA DE UN BUZÓN (lo llama `moveItem`): una carta o un paquete se
     * manda; cualquier otra cosa no cabe, porque el buzón ocupa la casilla. Si mandarlo falla, el
     * motivo `mailFailed` lleva la frase (ya dicha al jugador) en `message`.
     */
    echarAlBuzon(creature, origen) {
        const o = origen || {};
        const typeId = o.entry ? o.entry.typeId : (o.item ? o.item.typeId : 0);
        if (!this.selladoDe(typeId)) {
            return { ok: false, reason: 'notEnoughRoom' };
        }
        const r = this.enviarPorCorreo(creature, o);
        return r.ok
            ? { ok: true, mailed: true, to: r.to, townId: r.townId }
            : { ok: false, reason: 'mailFailed', message: r.message };
    },

    /**
     * MANDA UNA CARTA O UN PAQUETE: lo que lleva (`{entry}`) o un objeto del mundo (`{item, tile}`,
     * del suelo o de dentro de un contenedor). Todo se comprueba antes de tocar nada; si sale bien,
     * se sella, llega al depósito de quien lo recibe y deja de estar donde estaba.
     *
     * @returns {{ok: boolean, reason?: string, message?: string, to?: string, townId?: number}}
     */
    enviarPorCorreo(player, origen) {
        const o = origen || {};
        const entry = o.entry || null;
        const item = entry ? null : (o.item || null);
        if (!player || (!entry && !item) || (entry && !this.tieneEntrada(player, entry))) {
            return { ok: false, reason: 'badSource' };
        }
        const typeId = entry ? entry.typeId : item.typeId;
        const sellado = this.selladoDe(typeId);
        if (!sellado || !this.itemTypes.has(sellado) || (entry && entry === this.containerOf(player))) {
            return this._noSeEnvia(player, 'notMailable', 'Eso no se puede enviar por correo.');
        }

        // Lo que se manda, como árbol: así viaja, con todo lo de dentro, y así se guarda.
        const arbol = entry ? this.contenidoParaGuardar([entry])[0] : this.objetoParaGuardar(item);
        const esPaquete = this.isContainerType(typeId);
        if (llevaDeposito(this, arbol)) {
            return this._noSeEnvia(player, 'depot', 'Un depósito no se puede enviar por correo.');
        }
        if (alturaDeArbol(this, arbol) > MAX_ANIDADO) {
            return this._noSeEnvia(player, 'tooDeep',
                'Ese paquete lleva demasiados contenedores unos dentro de otros: como mucho ' + MAX_ANIDADO + '.');
        }

        // A quién va: la carta lo dice ella; el paquete, la primera etiqueta escrita de dentro.
        let texto = '';
        if (esPaquete) {
            const etiquetas = (arbol.contents || []).filter((hijo) => this.esEtiqueta(hijo.typeId));
            if (etiquetas.length === 0) {
                return this._noSeEnvia(player, 'noLabel',
                    'Ese paquete no lleva etiqueta: mete dentro una etiqueta con el nombre de quien lo recibe.');
            }
            const escrita = etiquetas.find((e) => e.attributes && String(e.attributes.text || '').trim());
            texto = escrita ? escrita.attributes.text : '';
        } else {
            texto = arbol.attributes && arbol.attributes.text ? arbol.attributes.text : '';
        }
        const para = this.destinatarioDe(texto);
        if (!para.nombre) {
            return this._noSeEnvia(player, 'noRecipient', esPaquete
                ? 'La etiqueta del paquete no dice a quién va: escribe su nombre en la primera línea.'
                : 'Esa carta no dice a quién va: escribe su nombre en la primera línea.');
        }
        const destino = this.buscarDestinatario(para.nombre);
        if (!destino) {
            return this._noSeEnvia(player, 'unknownRecipient', 'No existe ningun personaje llamado «' + para.nombre + '».');
        }
        let ciudad = null;
        if (para.ciudad) {
            const pedida = this.ciudadPorNombre(para.ciudad);
            if (!pedida) {
                return this._noSeEnvia(player, 'unknownTown', 'No existe la ciudad «' + para.ciudad + '».');
            }
            ciudad = pedida.id;
        } else {
            ciudad = this._ciudadDeEntrega(destino, null);
        }

        // SELLADO: ya no se escribe ni se vuelve a mandar, y recuerda quién lo mandó.
        arbol.typeId = sellado;
        arbol.attributes = { ...(arbol.attributes || {}), sender: player.name };
        const entregado = this.entregarEnDeposito(destino.id || destino.nombre, arbol,
            { townId: ciudad, remitente: player.name });
        if (!entregado) {
            return this._noSeEnvia(player, 'notDelivered', 'No se ha podido enviar: inténtalo más tarde.');
        }

        // Y deja de estar donde estaba (lo que llega es una copia, con sus objetos nuevos).
        if (entry) {
            this._desprenderEntrada(player, entry);
            this.recomputeEquipment(player);
            this.emit('onInventoryChange', player);
        } else {
            this._desprenderObjeto(item, o.tile || null);
            this._olvidarObjeto(item);
        }
        const nombreCiudad = this._nombreDeCiudad(ciudad);
        this.sendTextMessage(player.id, (esPaquete ? 'Has enviado el paquete a ' : 'Has enviado la carta a ') +
            destino.nombre + (nombreCiudad ? ' (' + nombreCiudad + ')' : '') + '.');
        return { ok: true, to: destino.nombre, townId: ciudad };
    },

    /** No se manda: se le dice por qué y no se toca nada. */
    _noSeEnvia(player, reason, message) {
        this.sendTextMessage(player.id, message);
        return { ok: false, reason, message };
    },

    /** El nombre de una ciudad por su id, o '' si el mapa no la tiene. */
    _nombreDeCiudad(id) {
        const ciudad = ((this.map && this.map.towns) || []).find((t) => t.id === Number(id));
        return ciudad ? String(ciudad.name || '') : '';
    }
};

module.exports = { correo };
