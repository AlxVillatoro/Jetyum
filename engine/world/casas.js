'use strict';

/**
 * LAS CASAS Y EL BANCO, como en The Forgotten Server 8.60.
 *
 * Se mezcla en `World` igual que `contenedores.js` (`Object.assign(World.prototype, casas)`): son
 * métodos del mundo, juntos en un archivo porque una cosa no va sin la otra. Una casa se compra con
 * el saldo del banco y el alquiler se cobra del banco, esté el dueño conectado o no.
 *
 * EL BANCO es el `balance` de TFS: un número de monedas de oro guardado con el personaje (la columna
 * `players.balance`, versión 6 de la base) que no se lleva encima y por tanto NO SE PIERDE AL MORIR.
 * Se mueve con cuatro operaciones, todas aquí y todas comprobadas antes de tocar nada:
 *
 *   - depositar: se le quitan las monedas (contando platino y cristal) y se suman al saldo;
 *   - retirar: se resta del saldo y se le dan monedas, si le caben y puede con el peso;
 *   - transferir: de un saldo a otro, también a quien no está conectado (por la base);
 *   - y leerlo y ponerlo (`getBankBalance` / `setBankBalance` del envoltorio).
 *
 * Lo que mueve saldo SIN mover monedas (una transferencia, una compra, el alquiler) se escribe en la
 * base AL MOMENTO (`_apuntarSaldo`): si el servidor se cayera antes del siguiente guardado, el
 * dinero no puede aparecer en dos sitios ni en ninguno. Depositar y retirar no, porque mueven
 * monedas del inventario, y el inventario y el saldo se guardan juntos, en una transacción.
 *
 * LAS CASAS salen del mapa (`map.houses` y el `houseId` de cada casilla) y su estado de la base:
 *
 *   - `houses`: el dueño (id del personaje, 0 = libre), hasta cuándo está pagada y los avisos;
 *   - `house_lists`: las listas de acceso, el texto tal cual lo escribe el dueño (256 invitados,
 *     257 subdueños, y para cada puerta su número de puerta, como TFS);
 *   - `house_items`: lo que hay dentro, como árbol JSON (ver `objetosDeCasa`).
 *
 * QUIÉN ENTRA. Como en TFS hay cuatro niveles (`houseAccessLevel`): el dueño, los subdueños, los
 * invitados y los demás. Sólo los tres primeros pisan las casillas de la casa; a una casa sin dueño
 * no entra nadie; y un monstruo o un NPC, nunca. Las PUERTAS tienen además su propia lista
 * (`aleta grav`): si la tiene, un invitado sólo la abre si está en ella; el dueño y los subdueños,
 * siempre. El personal (`isStaff`) entra en todas, como el `CanEditHouses` de TFS.
 *
 * QUÉ SE GUARDA DE DENTRO. Un objeto del mapa no tiene nada que lo distinga de uno soltado por un
 * jugador más que esto: LO QUE SE PUEDE COGER (`pickupable`) es de la casa y se guarda; lo que no
 * (paredes, puertas, camas, armarios) es del mapa y vuelve con el mapa. De los armarios y cofres
 * fijos se guarda lo que tienen DENTRO. La primera vez que arranca una casa sin fila en
 * `house_items` vale lo que trae el mapa; desde que se guarda, manda la base: al arrancar se quitan
 * de sus casillas los objetos cogibles del mapa y se ponen los guardados, que es lo que hace TFS al
 * borrar los objetos movibles del OTBM en las casillas de casa.
 *
 * LAS CAMAS (`sleepInBed`): dormir en la cama de una casa en la que estás invitado te saca del
 * juego, y al volver recuperas lo que se recupera durmiendo, como `BedItem::regeneratePlayer` de
 * TFS: un punto de vida y uno de maná cada 30 segundos y un alma cada 15 minutos, hasta el máximo.
 */

/** Las dos listas de cada casa, con los números de TFS. Una puerta usa su propio número. */
const LISTA_INVITADOS = 256;
const LISTA_SUBDUENOS = 257;

/** Los niveles de acceso de TFS (`HOUSE_NOT_INVITED` ... `HOUSE_OWNER`). */
const ACCESO = { NINGUNO: 0, INVITADO: 1, SUBDUENO: 2, DUENO: 3 };

/** Cuántos avisos de impago se aguantan: al octavo impago la casa se pierde, como en TFS. */
const MAX_AVISOS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Lo que dura cada período de alquiler (`houseRentPeriod` de config.js). */
const PERIODOS = { never: 0, daily: DIA_MS, weekly: 7 * DIA_MS, monthly: 30 * DIA_MS };

/** Cada cuánto se miran los alquileres, y cuánto se espera tras un impago para volver a cobrar. */
const COBRAR_CADA_MS = 60 * 60 * 1000;
const REINTENTO_MS = DIA_MS;

/**
 * Las camas de serie: cabecera y pies (los pies al sur de la cabecera) y sus dibujos con alguien
 * dentro. Se cambian con `bedItems` en config.js; un objeto con el atributo `bed` en items.xml es una
 * cama aunque no esté aquí.
 */
const CAMAS_POR_DEFECTO = [{ head: 21050, foot: 21051, headOccupied: 21052, footOccupied: 21053 }];

/** Lo que se recupera durmiendo (TFS): 1 de vida y de maná cada 30 s, y 1 alma cada 15 min. */
const REGENERA_CADA_MS = 30 * 1000;
const ALMA_CADA_MS = 15 * 60 * 1000;

/** El storage donde se apunta desde cuándo duerme (0 = despierto). */
const CLAVE_CAMA = 'cama:desde';

/** Hasta cuántas líneas se leen de una lista y cuánto puede medir cada una (TFS: 100). */
const MAX_LINEAS = 100;
const MAX_LINEA = 100;

/**
 * UNA LISTA DE ACCESO, del texto a algo que se puede consultar, como `AccessList::parseList` de TFS:
 * una entrada por línea, sin mayúsculas; `#` empieza un comentario; `*` vale cualquier cosa y `?`
 * una letra; y una línea que empieza por `!` EXCLUYE a quien case con ella (`!Pepe`, `!*bot*`). Las
 * de gremio (`@gremio`) se ignoran: aquí no hay gremios.
 */
function compilarLista(texto) {
    const lista = { nombres: new Set(), patrones: [] };
    String(texto || '').split(/\r?\n/).slice(0, MAX_LINEAS).forEach((cruda) => {
        const linea = cruda.trim().toLowerCase();
        if (!linea || linea[0] === '#' || linea.length > MAX_LINEA || linea[0] === '@') {
            return;
        }
        const excluir = linea[0] === '!';
        const cuerpo = (excluir ? linea.slice(1) : linea).trim();
        if (!cuerpo) {
            return;
        }
        if (!excluir && cuerpo.indexOf('*') === -1 && cuerpo.indexOf('?') === -1) {
            lista.nombres.add(cuerpo);
            return;
        }
        const fuente = cuerpo.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
        lista.patrones.push({ re: new RegExp('^' + fuente + '$'), excluir: excluir });
    });
    return lista;
}

/** ¿Está ese nombre en la lista? Una exclusión que case gana sobre todo lo demás. */
function enLista(lista, nombre) {
    if (!lista || !nombre) {
        return false;
    }
    const n = String(nombre).trim().toLowerCase();
    if (lista.patrones.some((p) => p.excluir && p.re.test(n))) {
        return false;
    }
    return lista.nombres.has(n) || lista.patrones.some((p) => !p.excluir && p.re.test(n));
}

/** Una cantidad como entero (0 si no es un número). */
function entero(valor) {
    const n = Math.trunc(Number(valor));
    return Number.isFinite(n) ? n : 0;
}

const casas = {
    // -----------------------------------------------------------------------
    // Arranque
    // -----------------------------------------------------------------------

    /**
     * CARGA LAS CASAS: las del mapa, con su estado de la base (si hay base: `this.baseDeCasas`, que
     * pone el motor) y lo que tenían dentro. Las casas nuevas del mapa se dan de alta en la base. Lo
     * llama el motor una vez, después de abrir la persistencia, y programa el cobro del alquiler.
     *
     * @param {Object} [config] la de config.js: `housePriceEachSQM`, `houseLevel`, `houseRentPeriod`
     *        y `bedItems`
     * @returns {{casas: number, conDueno: number, restauradas: number}}
     */
    cargarCasas(config) {
        const c = config || {};
        this.housePriceEachSQM = c.housePriceEachSQM === undefined ? 1000 : Math.max(0, Number(c.housePriceEachSQM) || 0);
        this.houseLevel = Math.max(1, Number(c.houseLevel) || 1);
        const periodo = String(c.houseRentPeriod || 'monthly').toLowerCase();
        this.houseRentPeriod = Object.prototype.hasOwnProperty.call(PERIODOS, periodo) ? periodo : 'monthly';
        this.bedItems = Array.isArray(c.bedItems) ? c.bedItems : CAMAS_POR_DEFECTO;

        this.casas = new Map();
        (this.map && this.map.houses ? this.map.houses : []).forEach((h) => {
            this.casas.set(h.id, {
                id: h.id, name: h.name, townId: h.townId, rent: h.rent, exit: h.exit,
                tiles: [], puertas: [],
                dueno: null, paid: 0, warnings: 0,
                listas: new Map(), compiladas: new Map(),
                proximoCobro: 0, ultimoGuardado: null
            });
        });
        if (this.casas.size === 0) {
            return { casas: 0, conDueno: 0, restauradas: 0 };
        }

        // Las casillas de cada casa, y sus puertas numeradas por posición (planta, fila, columna),
        // que es estable mientras no cambie el mapa. Una puerta con `doorId` en el mapa usa el suyo.
        this.map.forEachTile((tile) => {
            const casa = tile.houseId ? this.casas.get(tile.houseId) : null;
            if (casa) {
                casa.tiles.push(tile);
            }
        });
        this.casas.forEach((casa) => {
            casa.tiles.sort((a, b) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x));
            let siguiente = 1;
            casa.tiles.forEach((tile) => {
                const puerta = this._puertaEn(tile);
                if (puerta) {
                    const propio = Number(puerta.attributes && puerta.attributes.doorId) || 0;
                    casa.puertas.push({ id: propio || siguiente, x: tile.x, y: tile.y, z: tile.z });
                    siguiente = Math.max(siguiente, propio) + 1;
                }
            });
        });

        let restauradas = 0;
        const db = this._baseDeCasas();
        if (db) {
            this.casas.forEach((casa) => db.syncHouse(casa));
            db.loadHouses().forEach((fila) => {
                const casa = this.casas.get(fila.id);
                if (!casa) {
                    return;
                }
                // Un dueño que ya no existe (personaje borrado) deja la casa libre, como en TFS.
                casa.dueno = fila.owner && fila.ownerName ? { id: fila.owner, nombre: fila.ownerName } : null;
                casa.paid = casa.dueno ? fila.paid : 0;
                casa.warnings = casa.dueno ? fila.warnings : 0;
                if (fila.owner && !casa.dueno) {
                    db.saveHouse(casa);
                }
            });
            db.loadHouseLists().forEach((fila) => {
                const casa = this.casas.get(fila.houseId);
                if (casa) {
                    casa.listas.set(fila.listId, fila.list);
                    casa.compiladas.set(fila.listId, compilarLista(fila.list));
                }
            });
            const objetos = db.loadHouseItems();
            this.casas.forEach((casa) => {
                if (objetos.has(casa.id)) {
                    this._restaurarObjetosDeCasa(casa, objetos.get(casa.id));
                    casa.ultimoGuardado = JSON.stringify(objetos.get(casa.id));
                    restauradas += 1;
                }
            });
        }

        this._programarAlquileres();
        return {
            casas: this.casas.size,
            conDueno: Array.from(this.casas.values()).filter((c2) => c2.dueno).length,
            restauradas: restauradas
        };
    },

    /** La base de las casas (la pone el motor), o null si no hay o está cerrada. */
    _baseDeCasas() {
        const db = this.baseDeCasas;
        return db && db.isOpen !== false && typeof db.loadHouses === 'function' ? db : null;
    },

    /** Mira los alquileres cada hora, con el reloj del mundo (se puede adelantar en las pruebas). */
    _programarAlquileres() {
        if (!this.scheduler || this._alquileresProgramados) {
            return;
        }
        this._alquileresProgramados = true;
        const mirar = () => {
            this.cobrarAlquileres();
            this.scheduler.schedule(COBRAR_CADA_MS, mirar, 'alquileres');
        };
        this.scheduler.schedule(COBRAR_CADA_MS, mirar, 'alquileres');
    },

    // -----------------------------------------------------------------------
    // Consultas
    // -----------------------------------------------------------------------

    /** La casa de una casilla, o null. */
    houseAt(x, y, z) {
        if (!this.casas || !this.map) {
            return null;
        }
        const tile = this.map.getTile(Number(x), Number(y), Number(z));
        return tile && tile.houseId ? this.casas.get(tile.houseId) || null : null;
    },

    houseById(id) {
        return this.casas ? this.casas.get(Number(id)) || null : null;
    },

    /** La casa de la que es DUEÑO un jugador, o null (TFS `player:getHouse()`). */
    houseOf(player) {
        if (!this.casas || !player) {
            return null;
        }
        for (const casa of this.casas.values()) {
            if (this._esDueno(player, casa)) {
                return casa;
            }
        }
        return null;
    },

    /** La casa en la que está ahora mismo, o null. */
    houseOfTile(creature) {
        return creature && creature.position
            ? this.houseAt(creature.position.x, creature.position.y, creature.position.z) : null;
    },

    /** Lo que cuesta: `housePriceEachSQM` por cada casilla, como el `!buyhouse` de TFS. */
    housePrice(casa) {
        return casa ? (Number(this.housePriceEachSQM) || 0) * casa.tiles.length : 0;
    },

    /** ¿Es el dueño? Por su id de personaje si los dos lo tienen; si no (sin base), por el nombre. */
    _esDueno(player, casa) {
        if (!casa || !casa.dueno || !player) {
            return false;
        }
        if (casa.dueno.id && player.characterId) {
            return casa.dueno.id === player.characterId;
        }
        return String(casa.dueno.nombre).toLowerCase() === String(player.name).toLowerCase();
    },

    /** El nivel de acceso de un jugador a una casa (`ACCESO`), como `House::getHouseAccessLevel`. */
    houseAccessLevel(player, casa) {
        if (!player || !casa) {
            return ACCESO.NINGUNO;
        }
        if (this.isStaff && this.isStaff(player)) {
            return ACCESO.DUENO;
        }
        if (!casa.dueno) {
            return ACCESO.NINGUNO;
        }
        if (this._esDueno(player, casa)) {
            return ACCESO.DUENO;
        }
        if (enLista(casa.compiladas.get(LISTA_SUBDUENOS), player.name)) {
            return ACCESO.SUBDUENO;
        }
        if (enLista(casa.compiladas.get(LISTA_INVITADOS), player.name)) {
            return ACCESO.INVITADO;
        }
        return ACCESO.NINGUNO;
    },

    /** ¿Puede pisar las casillas de esta casa? */
    canEnterHouse(player, casa) {
        return this.houseAccessLevel(player, casa) > ACCESO.NINGUNO;
    },

    /** La puerta que hay en una casilla (el objeto), o null. Una puerta es un objeto «door». */
    _puertaEn(tile) {
        if (!tile) {
            return null;
        }
        return tile.downItems.concat(tile.topItems).find((item) => this._esPuerta(item)) || null;
    },

    _esPuerta(item) {
        if (!item) {
            return false;
        }
        if (item.attributes && item.attributes.doorId !== undefined) {
            return true;
        }
        return /\bdoor\b/i.test(String(item.getName() || ''));
    },

    /** La puerta de casa que hay en una posición: `{casa, puerta}` (la puerta es `{id, x, y, z}`), o null. */
    houseDoorAt(x, y, z) {
        const casa = this.houseAt(x, y, z);
        if (!casa) {
            return null;
        }
        const puerta = casa.puertas.find((p) => p.x === Number(x) && p.y === Number(y) && p.z === Number(z));
        return puerta ? { casa: casa, puerta: puerta } : null;
    },

    /** La casilla que tiene DELANTE (hacia donde mira). */
    _casillaDelante(player) {
        const deltas = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };
        const d = deltas[Number(player.direction)] || deltas[2];
        return { x: player.position.x + d[0], y: player.position.y + d[1], z: player.position.z };
    },

    /** La puerta de casa que tiene delante, o null (lo que piden `!buyhouse` y `aleta grav`). */
    houseDoorInFront(player) {
        const p = this._casillaDelante(player);
        return this.houseDoorAt(p.x, p.y, p.z);
    },

    /**
     * LO QUE SE VE AL MIRAR UNA PUERTA DE CASA, la descripción de TFS: de quién es, o lo que cuesta.
     * Null si en esa casilla no hay una puerta de casa. Lo añade la sesión al mirar.
     */
    houseLookText(x, y, z) {
        const r = this.houseDoorAt(x, y, z);
        if (!r) {
            return null;
        }
        return r.casa.dueno
            ? "Pertenece a la casa '" + r.casa.name + "'. " + r.casa.dueno.nombre + ' es su dueño.'
            : "Pertenece a la casa '" + r.casa.name + "'. Esta casa no tiene dueño. Cuesta " +
                this.housePrice(r.casa) + ' monedas de oro.';
    },

    /** Lo que se puede saber de una casa, en una copia (lo que devuelve el envoltorio de los scripts). */
    houseInfo(casa) {
        if (!casa) {
            return null;
        }
        return {
            id: casa.id,
            name: casa.name,
            townId: casa.townId,
            rent: casa.rent,
            price: this.housePrice(casa),
            tiles: casa.tiles.length,
            doors: casa.puertas.map((p) => ({ ...p })),
            exit: casa.exit ? { ...casa.exit } : null,
            ownerId: casa.dueno ? casa.dueno.id || 0 : 0,
            ownerName: casa.dueno ? casa.dueno.nombre : '',
            paidUntil: casa.paid,
            warnings: casa.warnings,
            guests: casa.listas.get(LISTA_INVITADOS) || '',
            subowners: casa.listas.get(LISTA_SUBDUENOS) || ''
        };
    },

    /** El texto de una lista (256, 257 o el número de una puerta), tal cual se escribió. */
    houseList(casa, listId) {
        return casa ? casa.listas.get(Number(listId)) || '' : '';
    },

    // -----------------------------------------------------------------------
    // Entrar, salir y echar
    // -----------------------------------------------------------------------

    /**
     * EL PASO A UNA CASILLA DE CASA (lo llama `moveCreature`): el motivo para no darlo, o null. Quien
     * ya está dentro de esa casa se mueve libre por ella; un monstruo o un NPC no entra nunca.
     */
    bloqueoDeCasa(creature, to) {
        if (!this.casas || !this.map) {
            return null;
        }
        const destino = this.map.getTile(to.x, to.y, to.z);
        const casa = destino && destino.houseId ? this.casas.get(destino.houseId) : null;
        if (!casa) {
            return null;
        }
        if (creature.tile && creature.tile.houseId === casa.id) {
            return null;
        }
        if (!(creature.isPlayer && creature.isPlayer())) {
            return 'notInvited';
        }
        if (this.canEnterHouse(creature, casa)) {
            return null;
        }
        this.sendTextMessage(creature.id, 'No estás invitado a esta casa.');
        return 'notInvited';
    },

    /**
     * EL DESTINO DE UN TELETRANSPORTE (lo llama `teleportCreature`): si es una casa en la que no puede
     * estar, la salida de esa casa; si no, null (va donde iba).
     */
    salidaDeCasaPara(creature, target) {
        if (!this.casas || !creature || !(creature.isPlayer && creature.isPlayer())) {
            return null;
        }
        const casa = this.houseAt(target.x, target.y, target.z);
        if (!casa || this.canEnterHouse(creature, casa)) {
            return null;
        }
        return this._salidaDe(casa, creature);
    },

    /** La salida de una casa (la del mapa; sin ella, el templo del jugador). */
    _salidaDe(casa, player) {
        if (casa && casa.exit) {
            return { ...casa.exit };
        }
        return this.templeOf ? this.templeOf(player) : null;
    },

    /** Saca a un jugador de una casa, a su salida. */
    kickOutOfHouse(player, casa) {
        const salida = this._salidaDe(casa, player);
        if (!salida || !player || player.removed) {
            return false;
        }
        const r = this.teleportCreature(player, salida);
        return !!(r && r.moved);
    },

    /** Los jugadores que están ahora dentro de una casa. */
    playersInHouse(casa) {
        return Array.from(this.players.values()).filter((p) => p.tile && p.tile.houseId === casa.id);
    },

    /** Echa a todos los que ya no pueden estar dentro (al cambiar las listas o el dueño). */
    _echarSinAcceso(casa) {
        let echados = 0;
        this.playersInHouse(casa).forEach((p) => {
            if (!this.canEnterHouse(p, casa) && this.kickOutOfHouse(p, casa)) {
                this.sendTextMessage(p.id, 'Ya no tienes acceso a la casa «' + casa.name + '».');
                echados += 1;
            }
        });
        return echados;
    },

    /**
     * `alana sio "nombre`: echar a alguien de la casa en la que estás (o a ti mismo, sin nombre). Como
     * `House::kickPlayer` de TFS: tiene que estar en la misma casa, y sólo se echa a quien tiene MENOS
     * acceso que tú (a ti mismo, siempre).
     *
     * @returns {{ok: boolean, reason?: string, name?: string}} reason: notInside, notFound, cannot
     */
    kickFromHouse(player, nombre) {
        const casa = this.houseOfTile(player);
        if (!casa) {
            return { ok: false, reason: 'notInside' };
        }
        const buscado = String(nombre || '').replace(/^["\s]+|["\s]+$/g, '');
        const objetivo = buscado ? this.playerByName(buscado) : player;
        if (!objetivo || !objetivo.tile || objetivo.tile.houseId !== casa.id) {
            return { ok: false, reason: 'notFound', name: buscado };
        }
        if (objetivo !== player && this.houseAccessLevel(objetivo, casa) >= this.houseAccessLevel(player, casa)) {
            return { ok: false, reason: 'cannot', name: objetivo.name };
        }
        if (!this.kickOutOfHouse(objetivo, casa)) {
            return { ok: false, reason: 'cannot', name: objetivo.name };
        }
        if (objetivo !== player) {
            this.sendTextMessage(objetivo.id, player.name + ' te ha echado de la casa «' + casa.name + '».');
        }
        return { ok: true, name: objetivo.name, house: casa.name };
    },

    // -----------------------------------------------------------------------
    // Puertas y objetos
    // -----------------------------------------------------------------------

    /**
     * ¿PUEDE ABRIR (O CERRAR) ESTA PUERTA DE CASA? Como `Door::canUse` de TFS: el dueño y los
     * subdueños, siempre; si la puerta tiene lista, quien esté en ella; si no, quien pueda entrar.
     */
    canUseHouseDoor(player, casa, puerta) {
        const nivel = this.houseAccessLevel(player, casa);
        if (nivel >= ACCESO.SUBDUENO) {
            return true;
        }
        const lista = casa.compiladas.get(puerta.id);
        if (lista && casa.listas.get(puerta.id)) {
            return casa.dueno !== null && enLista(lista, player.name);
        }
        return nivel > ACCESO.NINGUNO;
    },

    /**
     * USAR UNA PUERTA DE CASA SIN ACCESO (lo llama el motor antes de despachar la acción de usar): true
     * si se bloquea, y se le dice por qué. El contexto es el de la acción: quién y dónde.
     */
    puertaDeCasaBloqueada(contexto) {
        const c = contexto || {};
        if (!this.casas) {
            return false;
        }
        const player = this.getPlayer(Number(c.playerId) || 0);
        const r = player ? this.houseDoorAt(c.fromX, c.fromY, c.fromZ) : null;
        if (!r) {
            return false;
        }
        const item = this.items.get(Number(c.itemUid) || 0);
        if (item && !this._esPuerta(item)) {
            return false;
        }
        if (this.canUseHouseDoor(player, r.casa, r.puerta)) {
            return false;
        }
        this.sendTextMessage(player.id, 'No tienes acceso a esta puerta.');
        return true;
    },

    /** ¿Es una casilla de una casa en la que no está invitado? (no se coge ni se deja nada en ella) */
    objetoEnCasaAjena(creature, x, y, z) {
        const casa = this.houseAt(x, y, z);
        return !!(casa && creature && creature.isPlayer && creature.isPlayer() && !this.canEnterHouse(creature, casa));
    },

    // -----------------------------------------------------------------------
    // Comprar y dejar
    // -----------------------------------------------------------------------

    /**
     * `!buyhouse`: compra la casa de la puerta que tiene DELANTE, con el saldo del banco. Como el
     * `buyhouse.lua` de TFS, salvo la cuenta premium, que aquí no se pide.
     *
     * @returns {{ok: boolean, reason?: string, house?: Object, price?: number, level?: number}}
     *          reason: noDoor, level, alreadyOwner, hasOwner, noMoney
     */
    buyHouse(player) {
        const r = player ? this.houseDoorInFront(player) : null;
        if (!r) {
            return { ok: false, reason: 'noDoor' };
        }
        const casa = r.casa;
        const precio = this.housePrice(casa);
        if ((Number(player.level) || 1) < this.houseLevel) {
            return { ok: false, reason: 'level', level: this.houseLevel };
        }
        if (this.houseOf(player)) {
            return { ok: false, reason: 'alreadyOwner' };
        }
        if (casa.dueno) {
            return { ok: false, reason: 'hasOwner', house: this.houseInfo(casa) };
        }
        if (this.bankBalanceOf(player) < precio) {
            return { ok: false, reason: 'noMoney', price: precio, balance: this.bankBalanceOf(player) };
        }
        player.balance = this.bankBalanceOf(player) - precio;
        this._apuntarSaldo(player);
        this.setHouseOwner(casa, player);
        return { ok: true, house: this.houseInfo(casa), price: precio };
    },

    /**
     * `!leavehouse`: deja la casa en la que está, si es suya. Lo de dentro va a su depósito y las
     * listas se borran (`setHouseOwner`).
     *
     * @returns {{ok: boolean, reason?: string, house?: Object, delivered?: number}} reason: notInside, notOwner
     */
    leaveHouse(player) {
        const casa = this.houseOfTile(player);
        if (!casa) {
            return { ok: false, reason: 'notInside' };
        }
        if (!this._esDueno(player, casa)) {
            return { ok: false, reason: 'notOwner' };
        }
        const info = this.houseInfo(casa);
        const r = this.setHouseOwner(casa, null);
        return { ok: true, house: info, delivered: r.delivered };
    },

    /**
     * CAMBIA EL DUEÑO de una casa (a un jugador, o a nadie con null), como `House::setOwner` de TFS.
     * Si tenía dueño, antes se limpia: lo de dentro va al depósito del que se va (en la ciudad de la
     * casa), las listas se borran, las camas quedan libres y se echa a todos. El alquiler empieza de
     * cero: se cobra en la siguiente vuelta. Se guarda al momento.
     *
     * @param {Object|null} nuevo un jugador, `{id, nombre}`, o null
     * @returns {{delivered: number}}
     */
    setHouseOwner(casa, nuevo) {
        let entregados = 0;
        if (casa.dueno) {
            entregados = this._vaciarCasa(casa, casa.dueno);
            casa.listas.clear();
            casa.compiladas.clear();
            this._liberarCamas(casa);
            const db = this._baseDeCasas();
            if (db) {
                db.clearHouseLists(casa.id);
            }
        }
        // Un jugador se apunta por su id de personaje (0 sin base: entonces vale el nombre).
        const esJugador = !!(nuevo && typeof nuevo.isPlayer === 'function');
        casa.dueno = nuevo
            ? { id: Number(esJugador ? nuevo.characterId : nuevo.id) || 0, nombre: String(nuevo.name || nuevo.nombre || '') }
            : null;
        casa.paid = 0;
        casa.warnings = 0;
        casa.proximoCobro = 0;
        this._echarSinAcceso(casa);
        this._guardarEstadoDeCasa(casa);
        this.guardarObjetosDeCasa(casa);
        return { delivered: entregados };
    },

    /**
     * LO QUE HAY DENTRO, AL DEPÓSITO del que deja la casa, en la ciudad de la casa, con
     * `entregarEnDeposito` (el del correo). Cada objeto cogible va como un árbol (`objetoParaGuardar`),
     * con lo que lleve dentro; de los armarios fijos, lo que tienen dentro. Lo que no se pueda entregar
     * se queda en la casa, que es mejor que perderlo.
     *
     * @returns {number} cuántos objetos se entregaron
     */
    _vaciarCasa(casa, dueno) {
        const entregar = typeof this.entregarEnDeposito === 'function' ? this.entregarEnDeposito.bind(this) : null;
        if (!entregar) {
            if (this.log && this.objetosDeCasa(casa).length > 0) {
                this.log.warning('la casa ' + casa.id + ' se queda con lo de dentro: el mundo no sabe ' +
                    'entregar en el depósito (falta entregarEnDeposito)');
            }
            return 0;
        }
        const destinatario = dueno.id || dueno.nombre;
        // Sin aviso por objeto (serían decenas de «correo nuevo»): uno solo al final.
        const opciones = { townId: casa.townId, remitente: casa.name, aviso: false };
        let entregados = 0;
        casa.tiles.forEach((tile) => {
            tile.downItems.concat(tile.topItems).forEach((item) => {
                if (item.hasFlag('pickupable')) {
                    if (entregar(destinatario, this.objetoParaGuardar(item), opciones)) {
                        this._quitarDeCasilla(item, tile);
                        entregados += 1;
                    }
                } else if (item.isContainer && Array.isArray(item.contents) && item.contents.length > 0) {
                    item.contents.slice().forEach((hijo) => {
                        if (entregar(destinatario, this.objetoParaGuardar(hijo), opciones)) {
                            item.contents.splice(item.contents.indexOf(hijo), 1);
                            this._olvidarObjeto(hijo);
                            entregados += 1;
                        }
                    });
                }
            });
        });
        if (entregados > 0) {
            this.emit('onTileChanged', casa.tiles[0], null);
            const online = this._duenoConectado(casa);
            if (online) {
                this.sendTextMessage(online.id, 'Lo que había en la casa «' + casa.name + '» (' + entregados +
                    ' objetos) está en tu depósito.');
            }
        }
        return entregados;
    },

    /** Saca un objeto de su casilla y del mundo (con todo lo de dentro), sin avisos de movimiento. */
    _quitarDeCasilla(item, tile) {
        tile.removeItem(item);
        this._olvidarObjeto(item);
        item.position = null;
    },

    // -----------------------------------------------------------------------
    // Las listas de acceso
    // -----------------------------------------------------------------------

    /**
     * PONE UNA LISTA (256 invitados, 257 subdueños, o el número de una puerta) y la guarda. Al cambiar
     * las de la casa se echa a quien se haya quedado sin acceso, como en TFS.
     */
    setHouseList(casa, listId, texto) {
        const id = Number(listId);
        const limpio = String(texto == null ? '' : texto).split(/\r?\n/).slice(0, MAX_LINEAS).join('\n').trim();
        if (limpio) {
            casa.listas.set(id, limpio);
            casa.compiladas.set(id, compilarLista(limpio));
        } else {
            casa.listas.delete(id);
            casa.compiladas.delete(id);
        }
        const db = this._baseDeCasas();
        if (db) {
            db.saveHouseList(casa.id, id, limpio);
        }
        if (id === LISTA_INVITADOS || id === LISTA_SUBDUENOS) {
            this._echarSinAcceso(casa);
        }
        return true;
    },

    /**
     * ABRE LA VENTANA PARA EDITAR UNA LISTA: `aleta sio` (invitados: el dueño y los subdueños),
     * `aleta som` (subdueños: sólo el dueño) y `aleta grav` (la puerta que tiene delante: sólo el
     * dueño), como `House::canEditAccessList` de TFS. Lo que guarde llega a `setHouseList`.
     *
     * @param {'guests'|'subowners'|'door'} tipo
     * @returns {{ok: boolean, reason?: string, windowId?: number}} reason: notInside, noDoor, cannotEdit
     */
    editHouseList(player, tipo) {
        let casa;
        let listId;
        let titulo;
        if (tipo === 'door') {
            const r = this.houseDoorInFront(player);
            if (!r) {
                return { ok: false, reason: 'noDoor' };
            }
            casa = r.casa;
            listId = r.puerta.id;
            titulo = 'Puerta ' + r.puerta.id + ' de la casa «' + casa.name + '»';
        } else {
            casa = this.houseOfTile(player);
            if (!casa) {
                return { ok: false, reason: 'notInside' };
            }
            listId = tipo === 'subowners' ? LISTA_SUBDUENOS : LISTA_INVITADOS;
            titulo = (tipo === 'subowners' ? 'Subdueños' : 'Invitados') + ' de la casa «' + casa.name + '»';
        }
        const nivel = this.houseAccessLevel(player, casa);
        const puede = nivel === ACCESO.DUENO || (nivel === ACCESO.SUBDUENO && listId === LISTA_INVITADOS);
        if (!puede) {
            return { ok: false, reason: 'cannotEdit' };
        }
        const windowId = this.abrirVentanaDeTexto(player, {
            titulo: titulo,
            texto: casa.listas.get(listId) || '',
            editable: true,
            maximo: 4000
        }, (texto) => {
            // Entre abrir y guardar ha podido perder la casa o el permiso.
            const ahora = this.houseAccessLevel(player, casa);
            if (!(ahora === ACCESO.DUENO || (ahora === ACCESO.SUBDUENO && listId === LISTA_INVITADOS))) {
                this.sendTextMessage(player.id, 'Ya no puedes cambiar esa lista.');
                return;
            }
            this.setHouseList(casa, listId, texto);
            this.sendTextMessage(player.id, 'Guardado: ' + titulo + '.');
        });
        return { ok: true, windowId: windowId, listId: listId };
    },

    // -----------------------------------------------------------------------
    // El alquiler
    // -----------------------------------------------------------------------

    /**
     * COBRA LOS ALQUILERES VENCIDOS, como `Houses::payHouses` de TFS. Para cada casa con dueño y
     * alquiler cuyo pago haya vencido: si el saldo del dueño (conectado o no) alcanza, se paga y queda
     * pagada un período más; si no, un aviso (y otra vez mañana); y tras `MAX_AVISOS` avisos, la casa
     * se pierde. Lo llama el reloj cada hora; las pruebas lo llaman a mano después de adelantarlo.
     *
     * @returns {{pagadas: number, avisos: number, perdidas: number}}
     */
    cobrarAlquileres() {
        const resumen = { pagadas: 0, avisos: 0, perdidas: 0 };
        const periodo = PERIODOS[this.houseRentPeriod] || 0;
        if (!this.casas || !periodo) {
            return resumen;
        }
        const ahora = this.now();
        this.casas.forEach((casa) => {
            if (!casa.dueno || !casa.rent || casa.paid > ahora || casa.proximoCobro > ahora) {
                return;
            }
            const online = this._duenoConectado(casa);
            const db = this._baseDeCasas();
            let pagado = false;
            if (online) {
                if (this.bankBalanceOf(online) >= casa.rent) {
                    online.balance = this.bankBalanceOf(online) - casa.rent;
                    this._apuntarSaldo(online);
                    pagado = true;
                }
            } else if (db && casa.dueno.id) {
                if (db.getBalance(casa.dueno.id) === null) {
                    // El personaje ya no existe: la casa queda libre, como en TFS.
                    this.setHouseOwner(casa, null);
                    return;
                }
                pagado = db.addBalance(casa.dueno.id, -casa.rent);
            }

            if (pagado) {
                casa.paid = ahora + periodo;
                casa.warnings = 0;
                casa.proximoCobro = 0;
                resumen.pagadas += 1;
                if (online) {
                    this.sendTextMessage(online.id, 'Se ha pagado el alquiler de la casa «' + casa.name + '» (' +
                        casa.rent + ' de oro) con tu cuenta del banco.');
                }
                this._guardarEstadoDeCasa(casa);
                return;
            }

            if (casa.warnings < MAX_AVISOS) {
                casa.warnings += 1;
                casa.proximoCobro = ahora + REINTENTO_MS;
                resumen.avisos += 1;
                if (online) {
                    this.sendTextMessage(online.id, 'Aviso: no has pagado el alquiler de ' + casa.rent +
                        ' de oro de la casa «' + casa.name + '». Tienes ' + (MAX_AVISOS - casa.warnings + 1) +
                        ' días para ponerlo en el banco o la perderás.');
                }
                this._guardarEstadoDeCasa(casa);
                return;
            }

            const nombre = casa.name;
            this.setHouseOwner(casa, null);
            resumen.perdidas += 1;
            if (online) {
                this.sendTextMessage(online.id, 'Has perdido la casa «' + nombre + '»: no pagaste el alquiler.');
            }
        });
        return resumen;
    },

    /** El dueño de una casa, si está conectado. */
    _duenoConectado(casa) {
        if (!casa.dueno) {
            return null;
        }
        for (const p of this.players.values()) {
            if (this._esDueno(p, casa)) {
                return p;
            }
        }
        return null;
    },

    // -----------------------------------------------------------------------
    // Guardar
    // -----------------------------------------------------------------------

    /** El dueño, el pago y los avisos, a la base (al momento: es lo que cambia de golpe). */
    _guardarEstadoDeCasa(casa) {
        const db = this._baseDeCasas();
        if (db) {
            db.saveHouse({ id: casa.id, owner: casa.dueno ? casa.dueno.id || 0 : 0, paid: casa.paid, warnings: casa.warnings });
        }
    },

    /**
     * LO QUE HAY DENTRO DE UNA CASA, LISTO PARA GUARDAR: una entrada por casilla con algo, con
     *
     *   - `items`: lo que se puede coger, de abajo arriba, cada uno con su árbol (`objetoParaGuardar`);
     *   - `fijos`: lo que hay DENTRO de los armarios y cofres del mapa (`typeId` y cuál de los de ese
     *     tipo en la casilla, `n`), porque el armario es del mapa pero lo de dentro no;
     *   - `cama`: quién duerme en la cabecera de esa casilla y desde cuándo.
     */
    objetosDeCasa(casa) {
        const datos = [];
        casa.tiles.forEach((tile) => {
            const entrada = { x: tile.x, y: tile.y, z: tile.z };
            const todos = tile.downItems.concat(tile.topItems);
            const items = todos.filter((i) => i.hasFlag('pickupable')).map((i) => this.objetoParaGuardar(i));
            const fijos = [];
            todos.filter((i) => !i.hasFlag('pickupable')).forEach((i, _, lista) => {
                if (i.isContainer && Array.isArray(i.contents) && i.contents.length > 0) {
                    fijos.push({
                        typeId: i.typeId,
                        n: lista.filter((o) => o.typeId === i.typeId).indexOf(i),
                        contents: i.contents.map((hijo) => this.objetoParaGuardar(hijo))
                    });
                }
                if (this.esCama(i) && i.attributes && i.attributes.sleeper) {
                    entrada.cama = { sleeper: i.attributes.sleeper, nombre: i.attributes.sleeperName || '',
                        desde: Number(i.attributes.sleepStart) || 0 };
                }
            });
            if (items.length > 0) {
                entrada.items = items;
            }
            if (fijos.length > 0) {
                entrada.fijos = fijos;
            }
            if (entrada.items || entrada.fijos || entrada.cama) {
                datos.push(entrada);
            }
        });
        return datos;
    },

    /** Guarda lo de dentro de una casa, si ha cambiado desde la última vez. */
    guardarObjetosDeCasa(casa) {
        const db = this._baseDeCasas();
        if (!db) {
            return false;
        }
        const datos = this.objetosDeCasa(casa);
        const json = JSON.stringify(datos);
        if (json === casa.ultimoGuardado) {
            return false;
        }
        db.saveHouseItems(casa.id, datos);
        casa.ultimoGuardado = json;
        return true;
    },

    /** Guarda todas las casas: el estado y lo de dentro. Lo llama el motor al guardar y al apagar. */
    guardarCasas() {
        if (!this.casas || !this._baseDeCasas()) {
            return 0;
        }
        let guardadas = 0;
        this.casas.forEach((casa) => {
            this._guardarEstadoDeCasa(casa);
            if (this.guardarObjetosDeCasa(casa)) {
                guardadas += 1;
            }
        });
        return guardadas;
    },

    /**
     * Pone dentro de una casa lo guardado: primero se quitan los objetos cogibles que trajo el mapa (lo
     * guardado ya los incluye, si seguían ahí) y se vacían los armarios del mapa; luego se pone cada cosa.
     */
    _restaurarObjetosDeCasa(casa, datos) {
        casa.tiles.forEach((tile) => {
            tile.downItems.concat(tile.topItems).forEach((item) => {
                if (item.hasFlag('pickupable')) {
                    this._quitarDeCasilla(item, tile);
                } else if (Array.isArray(item.contents) && item.contents.length > 0) {
                    item.contents.forEach((hijo) => this._olvidarObjeto(hijo));
                    item.contents = [];
                }
            });
        });
        (Array.isArray(datos) ? datos : []).forEach((entrada) => {
            const tile = this.map.getTile(Number(entrada.x), Number(entrada.y), Number(entrada.z));
            if (!tile || tile.houseId !== casa.id) {
                return;
            }
            (entrada.items || []).forEach((guardado) => {
                const item = this.objetoDesdeGuardado(guardado, null);
                if (item) {
                    tile.addItem(item);
                }
            });
            (entrada.fijos || []).forEach((fijo) => {
                const iguales = tile.downItems.concat(tile.topItems)
                    .filter((i) => !i.hasFlag('pickupable') && i.typeId === Number(fijo.typeId));
                const armario = iguales[Number(fijo.n) || 0];
                if (armario && armario.isContainer) {
                    this.adoptItem(armario);
                    armario.contents = (fijo.contents || []).map((g) => this.objetoDesdeGuardado(g, armario)).filter(Boolean);
                }
            });
            if (entrada.cama) {
                const cabecera = tile.downItems.concat(tile.topItems).find((i) => this.esCama(i));
                if (cabecera) {
                    this._ocuparCama(cabecera, entrada.cama.sleeper, entrada.cama.nombre, entrada.cama.desde);
                }
            }
        });
    },

    // -----------------------------------------------------------------------
    // El banco
    // -----------------------------------------------------------------------

    /** Su saldo en el banco, en monedas de oro. */
    bankBalanceOf(player) {
        return player ? Math.max(0, Math.trunc(Number(player.balance) || 0)) : 0;
    },

    /** Le pone el saldo (lo que hace `setBankBalance` en TFS: sin mover monedas). */
    setBankBalance(player, cantidad) {
        if (!player) {
            return false;
        }
        player.balance = Math.max(0, Math.trunc(Number(cantidad) || 0));
        this._apuntarSaldo(player);
        return true;
    },

    /** Escribe el saldo en la base al momento (ver la cabecera: lo que no mueve monedas). */
    _apuntarSaldo(player) {
        const db = this._baseDeCasas();
        if (db && player && player.characterId) {
            db.setBalance(player.characterId, this.bankBalanceOf(player));
        }
    },

    /**
     * DEPOSITA dinero que lleva encima (oro, platino y cristal, con el cambio si hace falta).
     *
     * @returns {{ok: boolean, reason?: string, balance?: number, amount?: number}}
     *          reason: badAmount, notEnough (lleva menos), cannotPay (el cambio no le cabe)
     */
    depositMoney(player, cantidad) {
        const n = entero(cantidad);
        if (!player || n <= 0) {
            return { ok: false, reason: 'badAmount' };
        }
        if (this.countMoney(player) < n) {
            return { ok: false, reason: 'notEnough', money: this.countMoney(player) };
        }
        if (!this.removeMoneyFrom(player, n)) {
            return { ok: false, reason: 'cannotPay' };
        }
        player.balance = this.bankBalanceOf(player) + n;
        return { ok: true, amount: n, balance: player.balance };
    },

    /**
     * RETIRA dinero del banco a la mochila, en las monedas más grandes.
     *
     * @returns {{ok: boolean, reason?: string, balance?: number}} reason: badAmount, notEnough, cannotCarry
     */
    withdrawMoney(player, cantidad) {
        const n = entero(cantidad);
        if (!player || n <= 0) {
            return { ok: false, reason: 'badAmount' };
        }
        if (this.bankBalanceOf(player) < n) {
            return { ok: false, reason: 'notEnough', balance: this.bankBalanceOf(player) };
        }
        if (!this.addMoneyTo(player, n)) {
            return { ok: false, reason: 'cannotCarry' };
        }
        player.balance = this.bankBalanceOf(player) - n;
        return { ok: true, amount: n, balance: player.balance };
    },

    /**
     * TRANSFIERE de su saldo al de otro personaje, esté conectado (en memoria) o no (en la base). Los
     * dos saldos se escriben al momento, en la misma transacción si el otro no está.
     *
     * @returns {{ok: boolean, reason?: string, name?: string, balance?: number}}
     *          reason: badAmount, notEnough, notFound, self, noDatabase (no está y no hay base)
     */
    transferMoney(player, nombre, cantidad) {
        const n = entero(cantidad);
        const buscado = String(nombre || '').trim();
        if (!player || n <= 0) {
            return { ok: false, reason: 'badAmount' };
        }
        if (!buscado) {
            return { ok: false, reason: 'notFound', name: buscado };
        }
        if (this.bankBalanceOf(player) < n) {
            return { ok: false, reason: 'notEnough', balance: this.bankBalanceOf(player) };
        }
        const online = this.playerByName(buscado);
        if (online === player) {
            return { ok: false, reason: 'self' };
        }
        if (online) {
            player.balance = this.bankBalanceOf(player) - n;
            online.balance = this.bankBalanceOf(online) + n;
            this._apuntarSaldo(player);
            this._apuntarSaldo(online);
            return { ok: true, amount: n, name: online.name, balance: player.balance };
        }
        const db = this._baseDeCasas();
        if (!db) {
            return { ok: false, reason: 'noDatabase', name: buscado };
        }
        const fila = db.findCharacterByName(buscado);
        if (!fila) {
            return { ok: false, reason: 'notFound', name: buscado };
        }
        if (fila.id === player.characterId) {
            return { ok: false, reason: 'self' };
        }
        player.balance = this.bankBalanceOf(player) - n;
        db.transaction(() => {
            if (player.characterId) {
                db.setBalance(player.characterId, player.balance);
            }
            db.addBalance(fila.id, n);
        });
        return { ok: true, amount: n, name: fila.name, balance: player.balance };
    },

    // -----------------------------------------------------------------------
    // Las camas
    // -----------------------------------------------------------------------

    /** El juego de cama de un tipo (de `bedItems`), con su papel: `{set, parte, ocupada}`, o null. */
    _juegoDeCama(typeId) {
        const id = Number(typeId);
        for (const set of this.bedItems || CAMAS_POR_DEFECTO) {
            if (id === Number(set.head)) {
                return { set, parte: 'head', ocupada: false };
            }
            if (id === Number(set.foot)) {
                return { set, parte: 'foot', ocupada: false };
            }
            if (id === Number(set.headOccupied)) {
                return { set, parte: 'head', ocupada: true };
            }
            if (id === Number(set.footOccupied)) {
                return { set, parte: 'foot', ocupada: true };
            }
        }
        return null;
    },

    /** ¿Es (parte de) una cama? Por el atributo `bed` de items.xml o por `bedItems`. */
    esCama(item) {
        if (!item) {
            return false;
        }
        const bed = item.getAttribute ? item.getAttribute('bed') : undefined;
        if (bed !== undefined && bed !== false && bed !== 0 && bed !== '0') {
            return true;
        }
        return this._juegoDeCama(item.typeId) !== null;
    },

    /**
     * ¿Es la cabecera? Lo dice `bedPart` en items.xml («head» / «foot»); si no, `bedItems`; y si no,
     * los pies son los que dicen `partnerDirection="north"` (su cabecera está al norte).
     */
    _esCabecera(item) {
        const parte = String(item.getAttribute('bedPart') || '').toLowerCase();
        if (parte === 'head' || parte === 'foot') {
            return parte === 'head';
        }
        const juego = this._juegoDeCama(item.typeId);
        if (juego) {
            return juego.parte === 'head';
        }
        return String(item.getAttribute('partnerDirection') || 'south').toLowerCase() !== 'north';
    },

    /** La cabecera y los pies de la cama de un objeto (los pies, al sur de la cabecera). */
    _partesDeCama(item) {
        const p = item.position;
        if (!p) {
            return null;
        }
        const buscar = (x, y) => {
            const tile = this.map.getTile(x, y, p.z);
            return tile ? tile.downItems.concat(tile.topItems).find((i) => this.esCama(i)) || null : null;
        };
        const cabecera = this._esCabecera(item) ? item : buscar(p.x, p.y - 1);
        const pies = cabecera && cabecera.position ? buscar(cabecera.position.x, cabecera.position.y + 1) : null;
        return cabecera ? { cabecera: cabecera, pies: pies && pies !== cabecera ? pies : null } : null;
    },

    /**
     * Cambia una parte de cama a su dibujo libre u ocupado, si el tipo existe: el que dice items.xml
     * (`occupiedId` en la libre, `freeId` en la ocupada) o, si no lo dice, el de `bedItems`.
     */
    _dibujoDeCama(item, ocupada) {
        const juego = this._juegoDeCama(item.typeId);
        const propio = Number(item.getAttribute(ocupada ? 'occupiedId' : 'freeId')) || 0;
        const destino = propio || (juego ? Number(juego.set[juego.parte + (ocupada ? 'Occupied' : '')]) : 0);
        if (destino && destino !== item.typeId && this.itemTypes.has(destino)) {
            this.adoptItem(item);
            this.transformItem(item.instanceId, destino);
        }
    },

    /** Marca una cama como ocupada por alguien (en la cabecera) y le pone el dibujo. */
    _ocuparCama(cabecera, sleeper, nombre, desde) {
        const partes = this._partesDeCama(cabecera) || { cabecera: cabecera, pies: null };
        this.adoptItem(partes.cabecera);
        partes.cabecera.attributes.sleeper = sleeper;
        partes.cabecera.attributes.sleeperName = String(nombre || '');
        partes.cabecera.attributes.sleepStart = Number(desde) || 0;
        this._dibujoDeCama(partes.cabecera, true);
        if (partes.pies) {
            this._dibujoDeCama(partes.pies, true);
        }
    },

    /** La deja libre. */
    _liberarCama(cabecera) {
        const partes = this._partesDeCama(cabecera) || { cabecera: cabecera, pies: null };
        delete partes.cabecera.attributes.sleeper;
        delete partes.cabecera.attributes.sleeperName;
        delete partes.cabecera.attributes.sleepStart;
        this._dibujoDeCama(partes.cabecera, false);
        if (partes.pies) {
            this._dibujoDeCama(partes.pies, false);
        }
    },

    /** Todas las camas ocupadas de una casa quedan libres (al cambiar de dueño). */
    _liberarCamas(casa) {
        casa.tiles.forEach((tile) => {
            tile.downItems.concat(tile.topItems).forEach((i) => {
                if (this.esCama(i) && i.attributes && i.attributes.sleeper) {
                    this._liberarCama(i);
                }
            });
        });
    },

    /** La cabecera en la que duerme un jugador, o null. */
    _camaDe(player) {
        if (!this.casas) {
            return null;
        }
        const quien = player.characterId || player.name;
        for (const casa of this.casas.values()) {
            for (const tile of casa.tiles) {
                const cama = tile.downItems.concat(tile.topItems).find((i) => this.esCama(i) &&
                    i.attributes && i.attributes.sleeper && String(i.attributes.sleeper) === String(quien));
                if (cama) {
                    return cama;
                }
            }
        }
        return null;
    },

    /**
     * DORMIR EN UNA CAMA, como `BedItem::trySleep` / `sleep` de TFS: en una casa con dueño en la que
     * esté invitado, sin estar en combate y si la cama está libre. Se le pone en la cama, la cama se
     * ve ocupada y se le saca del juego (`sacarDelJuego`, que pone el motor); al volver, `casaAlEntrar`
     * le da lo que ha recuperado durmiendo.
     *
     * @returns {{ok: boolean, reason?: string, name?: string}} reason: notBed, notHouse, notInvited,
     *          inFight, occupied (name: quién duerme), broken
     */
    sleepInBed(player, item) {
        if (!player || !item || !this.esCama(item)) {
            return { ok: false, reason: 'notBed' };
        }
        const partes = this._partesDeCama(item);
        if (!partes) {
            return { ok: false, reason: 'broken' };
        }
        const p = partes.cabecera.position;
        const casa = this.houseAt(p.x, p.y, p.z);
        if (!casa || !casa.dueno) {
            return { ok: false, reason: 'notHouse' };
        }
        if (!this.canEnterHouse(player, casa)) {
            return { ok: false, reason: 'notInvited' };
        }
        const ocupada = partes.cabecera.attributes && partes.cabecera.attributes.sleeper;
        if (ocupada) {
            return { ok: false, reason: 'occupied', name: partes.cabecera.attributes.sleeperName || '' };
        }
        if ((this.isInFight && this.isInFight(player)) || (this.isPzLocked && this.isPzLocked(player))) {
            return { ok: false, reason: 'inFight' };
        }

        const ahora = this.now();
        this._ocuparCama(partes.cabecera, player.characterId || player.name, player.name, ahora);
        if (!(player.storages instanceof Map)) {
            player.storages = new Map();
        }
        player.storages.set(CLAVE_CAMA, ahora);
        this.teleportCreature(player, { x: p.x, y: p.y, z: p.z });
        this.guardarObjetosDeCasa(casa);

        // Se le saca en el siguiente paso del reloj, como TFS (`kickPlayer` en una tarea): ahora mismo
        // se está atendiendo su «usar», y salir a mitad dejaría la sesión a medias.
        const salir = () => {
            const fuera = typeof this.sacarDelJuego === 'function' ? this.sacarDelJuego(player) : false;
            if (!fuera && this.getPlayer(player.id)) {
                // No pudo salir (entró en combate entretanto): se despierta sin más.
                player.storages.set(CLAVE_CAMA, 0);
                this._liberarCama(partes.cabecera);
            }
        };
        if (this.scheduler) {
            this.scheduler.schedule(0, salir, 'dormir-' + player.name);
        } else {
            salir();
        }
        return { ok: true };
    },

    /**
     * AL ENTRAR AL JUEGO (lo llama el repositorio, con el personaje ya cargado): si venía de dormir,
     * se despierta con lo recuperado y la cama queda libre; y si aparece dentro de una casa en la que ya
     * no puede estar, sale a la puerta.
     *
     * @returns {{slept: number, health: number, mana: number, soul: number}|null} lo recuperado
     */
    casaAlEntrar(player) {
        if (!player) {
            return null;
        }
        let recuperado = null;
        const desde = player.storages instanceof Map ? Number(player.storages.get(CLAVE_CAMA)) || 0 : 0;
        if (desde > 0) {
            const dormido = Math.max(0, this.now() - desde);
            const puntos = Math.floor(dormido / REGENERA_CADA_MS);
            const almas = Math.floor(dormido / ALMA_CADA_MS);
            const antes = { health: player.health, mana: player.mana || 0, soul: player.soul || 0 };
            player.health = Math.min(player.maxHealth, (Number(player.health) || 0) + puntos);
            player.mana = Math.min(Number(player.maxMana) || 0, (Number(player.mana) || 0) + puntos);
            player.soul = Math.min(Number(player.soulMax) || 100, (Number(player.soul) || 0) + almas);
            recuperado = { slept: dormido, health: player.health - antes.health, mana: player.mana - antes.mana,
                soul: player.soul - antes.soul };
            player.storages.set(CLAVE_CAMA, 0);
            const cama = this._camaDe(player);
            if (cama) {
                this._liberarCama(cama);
            }
        }
        const casa = this.houseOfTile(player);
        if (casa && !this.canEnterHouse(player, casa)) {
            this.kickOutOfHouse(player, casa);
        }
        return recuperado;
    }
};

module.exports = {
    casas, compilarLista, enLista, ACCESO, LISTA_INVITADOS, LISTA_SUBDUENOS, MAX_AVISOS, PERIODOS,
    CAMAS_POR_DEFECTO, REGENERA_CADA_MS, ALMA_CADA_MS, CLAVE_CAMA
};
