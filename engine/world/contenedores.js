'use strict';

/**
 * LOS CONTENEDORES ANIDADOS: una mochila dentro de otra, como en Tibia.
 *
 * Se mezcla en `World` igual que `extras.js` (`Object.assign(World.prototype, contenedores)`): son
 * métodos del mundo, en un archivo propio porque son la base de lo que viene después -los paquetes
 * del correo, los cofres de las casas, comerciar con una mochila llena- y conviene que estén juntos
 * y contados en un solo sitio.
 *
 * EL MODELO, EN DOS MITADES QUE YA EXISTÍAN.
 *
 *   1. LO QUE LLEVA UN JUGADOR sigue siendo la lista PLANA de siempre, `player.inventory`: lo puesto
 *      (ranura de equipo) y lo que va DIRECTAMENTE dentro de la mochila puesta (ranura `inside`).
 *      Esa lista no cambia de forma, y por eso no cambian el mensaje INVENTORY, la muerte que suelta
 *      el inventario (combat.js), ni las filas viejas de la base.
 *
 *      Lo nuevo es que UNA ENTRADA QUE ES UN CONTENEDOR -que no sea la mochila puesta- PUEDE LLEVAR
 *      DENTRO OTRAS ENTRADAS, en `entry.contents`, con la misma forma
 *      `{slot: 'inside', position, typeId, count, attributes, contents?}`, a cualquier profundidad.
 *      LA MOCHILA PUESTA ES LA EXCEPCIÓN Y NO TIENE `contents`: lo suyo son las entradas `inside`
 *      de la lista plana, como antes. Así hay UNA sola manera de estar dentro de la mochila, y
 *      `contenidoDeEntrada` es el único sitio que sabe de las dos y las presenta iguales.
 *
 *   2. LO QUE ESTÁ EN EL MUNDO (un cuerpo, una caja, el depósito, una mochila tirada) son `Item`s con
 *      `item.contents`, y eso tampoco cambia: lo de dentro son `Item`s con su instancia y su
 *      `parent`. Lo nuevo es que lo de dentro puede ser OTRO contenedor con lo suyo, y que su sitio
 *      en el mapa es el de su raíz (`posicionDeObjeto`).
 *
 * Y LAS DOS MITADES SE TRADUCEN AL CRUZAR: lo que sale del inventario al mundo se vuelve `Item`
 * con todo lo que lleve dentro (`_objetoDesdeEntrada`), y lo que entra se vuelve entrada
 * (`_entradaDesdeObjeto`). Lo de dentro viaja SIEMPRE con su contenedor: una mochila con cosas se
 * suelta, se mete en un cuerpo, se recoge o se guarda en el depósito con todo.
 *
 * LAS REGLAS, todas aquí y todas comprobadas ANTES de tocar nada (si no cabe, no se mueve nada):
 *
 *   - cada contenedor tiene SUS huecos (`containerSize` de items.xml, 20 si no lo dice); una pila
 *     ocupa un hueco y se junta con las iguales hasta MAX_PILA (100);
 *   - el PESO cuenta todo, a cualquier profundidad (`pesoDeEntrada`, `pesoDeObjeto`);
 *   - un contenedor no entra DENTRO DE SÍ MISMO ni de nada que lleve dentro (`containerInItself`);
 *   - y como mucho MAX_ANIDADO contenedores uno dentro de otro, contando el de fuera (`tooDeep`).
 *
 * LAS VENTANAS de los contenedores que llevas se nombran con un id NEGATIVO (`-entry.uid`); las de
 * los del suelo, con la instancia, positiva. Está contado en `CONTAINER_ID` de
 * `shared/js/protocol.mjs`.
 *
 * Y CÓMO SE GUARDA, en `CLAVE_CONTENIDO`.
 */

const { SLOT_INSIDE } = require('../../shared/js/protocol.mjs');
const { Item } = require('./item');

/** Lo máximo que cabe en una pila (monedas, flechas…), como en Tibia. */
const MAX_PILA = 100;

/**
 * CUÁNTOS CONTENEDORES, COMO MUCHO, UNO DENTRO DE OTRO, contando el de fuera (la mochila puesta, o
 * el cuerpo del suelo). Con 8: tu mochila, una bolsa dentro, otra dentro de ésa... hasta ocho.
 *
 * Hace falta un tope por dos razones de las que no se ven al jugar: todo lo que recorre un
 * contenedor (el peso, guardar, soltar al morir) es recursivo, y un árbol sin fondo es una pila de
 * llamadas sin fondo; y lo que se guarda va en el JSON de una fila, que no debe poder crecer sin
 * límite. Tibia no tiene un número fijo, pero sus clientes dejan de pintar mucho antes.
 */
const MAX_ANIDADO = 8;

/**
 * DÓNDE SE GUARDA LO DE DENTRO DE UNA BOLSA: en el JSON de `attributes` de SU FILA, bajo esta clave.
 *
 * ES LA DECISIÓN DE PERSISTENCIA, y se tomó así por tres razones:
 *
 *   - NO HAY MIGRACIÓN. `player_items` tiene una fila por entrada de la lista plana y una columna
 *     `attributes` que ya es JSON libre. Una bolsa dentro de la mochila es una fila más (ranura
 *     `inside`), y lo que lleva dentro va en su JSON. Las filas de antes no tienen la clave, así que
 *     se cargan exactamente igual: bolsas vacías.
 *   - LO DE DENTRO NO TIENE IDENTIDAD PROPIA en la base: no se consulta ni se busca por separado,
 *     se carga y se guarda con su contenedor. Una columna `parent` obligaría a resolver referencias
 *     al cargar y a mantenerlas al guardar, y un fallo ahí deja objetos huérfanos.
 *   - ES LA MISMA FORMA QUE EL DEPÓSITO, que se guarda en el JSON del progreso: un árbol
 *     `{typeId, count, attributes, contents}`. Un formato para los dos.
 *
 * Lleva el guion bajo para que no se confunda con un atributo de verdad (`actionId`, `charges`...):
 * en memoria lo de dentro va en `entry.contents`, nunca en `attributes`; la clave sólo existe en
 * la fila guardada, la pone `filasParaGuardar` y la quita `inventarioDesdeFilas`.
 */
const CLAVE_CONTENIDO = '_contenido';

/** Una copia de unos atributos, o null si no hay ninguno. */
function copiarAtributos(attributes) {
    return attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0
        ? { ...attributes } : null;
}

const contenedores = {
    // -----------------------------------------------------------------------
    // El árbol del inventario
    // -----------------------------------------------------------------------

    /**
     * LO QUE HAY DENTRO DE UN CONTENEDOR QUE LLEVAS, como lista de entradas.
     *
     * Para la mochila puesta son las entradas `inside` de la lista plana (una copia filtrada: para
     * cambiarla se usa `_ponerEntradaEn` / `_desprenderEntrada`); para cualquier otra bolsa, su
     * `entry.contents`. Es el único sitio que sabe que hay dos formas de estar dentro.
     */
    contenidoDeEntrada(creature, entry) {
        if (!entry) {
            return [];
        }
        if (entry === this.containerOf(creature)) {
            return this.contentsOf(creature);
        }
        return Array.isArray(entry.contents) ? entry.contents : [];
    },

    /**
     * DÓNDE ESTÁ UNA ENTRADA: la lista que la guarda, el contenedor que la tiene dentro (null si va
     * puesta) y su NIVEL, cuántos contenedores la rodean (0 lo puesto, 1 lo de dentro de la
     * mochila, 2 lo de dentro de una bolsa de la mochila...). Null si no la lleva.
     */
    ubicacionDeEntrada(creature, buscada) {
        let hallada = null;
        this._recorrerInventario(creature, (entry, lista, padre, nivel) => {
            if (entry === buscada) {
                hallada = { lista: lista, padre: padre, nivel: nivel };
                return true;
            }
            return false;
        });
        return hallada;
    },

    /** ¿La lleva encima, a cualquier profundidad? */
    tieneEntrada(creature, entry) {
        return !!entry && this.ubicacionDeEntrada(creature, entry) !== null;
    },

    /**
     * Recorre TODO lo que lleva, en orden (cada contenedor seguido de lo suyo). `visitar(entry,
     * lista, padre, nivel)` corta el recorrido devolviendo true. No baja de MAX_ANIDADO + 1
     * niveles, por si un dato guardado a mano trajera un árbol sin fondo.
     */
    _recorrerInventario(creature, visitar) {
        const inventario = creature && creature.inventory instanceof Array ? creature.inventory : [];
        const mochila = this.containerOf(creature);
        const bajar = (lista, padre, nivel) => {
            for (const entry of lista) {
                if (visitar(entry, lista, padre, nivel)) {
                    return true;
                }
                if (Array.isArray(entry.contents) && entry.contents.length > 0 && nivel <= MAX_ANIDADO &&
                    bajar(entry.contents, entry, nivel + 1)) {
                    return true;
                }
            }
            return false;
        };
        for (const entry of inventario) {
            const dentro = entry.slot === SLOT_INSIDE;
            if (visitar(entry, inventario, dentro ? mochila : null, dentro ? 1 : 0)) {
                return true;
            }
            if (Array.isArray(entry.contents) && entry.contents.length > 0 &&
                bajar(entry.contents, entry, (dentro ? 1 : 0) + 1)) {
                return true;
            }
        }
        return false;
    },

    /** Todas las entradas que lleva, a cualquier profundidad, con su lista: `[{entry, lista}]`. */
    todasLasEntradas(creature) {
        const todas = [];
        this._recorrerInventario(creature, (entry, lista) => {
            todas.push({ entry: entry, lista: lista });
            return false;
        });
        return todas;
    },

    /**
     * CUÁNTOS NIVELES DE CONTENEDOR HAY EN UNA ENTRADA, contándola a ella: 0 si no es contenedor, 1
     * una bolsa (vacía o con cosas que no son bolsas), 2 una bolsa con otra dentro...
     */
    alturaDeEntrada(creature, entry) {
        if (!this.isContainerEntry(entry)) {
            return 0;
        }
        const hijos = this.contenidoDeEntrada(creature, entry);
        return 1 + hijos.reduce((maximo, hijo) => Math.max(maximo, this._alturaDeHijo(hijo, 1)), 0);
    },

    _alturaDeHijo(entry, profundidad) {
        if (!this.isContainerEntry(entry) || profundidad > MAX_ANIDADO + 1) {
            return 0;
        }
        const hijos = Array.isArray(entry.contents) ? entry.contents : [];
        return 1 + hijos.reduce((maximo, hijo) => Math.max(maximo, this._alturaDeHijo(hijo, profundidad + 1)), 0);
    },

    /** ¿`buscada` es `entry` o está dentro de ella, a cualquier profundidad? */
    _entradaContiene(creature, entry, buscada) {
        if (entry === buscada) {
            return true;
        }
        const bajar = (lista, profundidad) => lista.some((hijo) => hijo === buscada ||
            (profundidad <= MAX_ANIDADO && Array.isArray(hijo.contents) && bajar(hijo.contents, profundidad + 1)));
        return bajar(this.contenidoDeEntrada(creature, entry), 1);
    },

    /** Lo que pesa una entrada CON TODO LO QUE LLEVE DENTRO. */
    pesoDeEntrada(entry, profundidad) {
        const nivel = profundidad || 0;
        const propio = this.weightOfItem(entry.typeId, entry.count);
        if (!Array.isArray(entry.contents) || nivel > MAX_ANIDADO) {
            return propio;
        }
        return entry.contents.reduce((total, hijo) => total + this.pesoDeEntrada(hijo, nivel + 1), propio);
    },

    // -----------------------------------------------------------------------
    // Las ventanas de los contenedores que llevas
    // -----------------------------------------------------------------------

    /**
     * EL ID DE LA VENTANA de un contenedor que llevas: `-uid`. El `uid` se le da la primera vez que
     * hace falta, del mismo contador que las instancias de los objetos del mundo, así que es único
     * y su negativo no puede ser nunca una instancia. No se guarda en la base: es de esta ejecución.
     */
    idDeContenedorPropio(entry) {
        if (!entry.uid) {
            entry.uid = this._allocateItemId();
        }
        return -entry.uid;
    },

    /**
     * EL CONTENEDOR QUE LLEVAS con ese id de ventana (negativo), o null: el que ya no lleva, el que
     * dejó de ser contenedor, o un id que no es de los suyos.
     */
    contenedorPropio(creature, id) {
        const uid = -Number(id);
        if (!(uid > 0)) {
            return null;
        }
        let hallado = null;
        this._recorrerInventario(creature, (entry) => {
            if (entry.uid === uid) {
                hallado = entry;
                return true;
            }
            return false;
        });
        return hallado && this.isContainerEntry(hallado) ? hallado : null;
    },

    /** La entrada que hay en el hueco `index` de un contenedor que llevas (por su id), o null. */
    entradaEnContenedorPropio(creature, id, index) {
        const contenedor = this.contenedorPropio(creature, id);
        return contenedor ? this.contenidoDeEntrada(creature, contenedor)[Number(index)] || null : null;
    },

    /**
     * LA PRIMERA ENTRADA DE UN TIPO QUE LLEVA, para las hotkeys: primero lo de la mochila, luego lo
     * de las bolsas de dentro (en orden) y, si no, lo puesto. Como en Tibia, una hotkey de pociones
     * gasta las de cualquier bolsa.
     */
    buscarEntradaDeTipo(creature, typeId) {
        const id = Number(typeId);
        const todas = this.todasLasEntradas(creature).map((t) => t.entry).filter((e) => e.typeId === id);
        return todas.find((e) => e.slot === SLOT_INSIDE) || todas[0] || null;
    },

    /** Lo que se manda al cliente para pintar la ventana de un contenedor que llevas. */
    containerPayloadPropio(creature, entry) {
        const definicion = this.itemTypes.get(Number(entry.typeId));
        return {
            id: this.idDeContenedorPropio(entry),
            typeId: entry.typeId,
            name: (definicion && definicion.name) || 'contenedor',
            capacity: this.capacityOfType(entry.typeId),
            items: this.contenidoDeEntrada(creature, entry).map((dentro, index) => {
                const def = this.itemTypes.get(Number(dentro.typeId));
                return {
                    index: index,
                    typeId: dentro.typeId,
                    count: dentro.count,
                    name: (def && def.name) || ('objeto ' + dentro.typeId),
                    // Las cargas de una runa, para su esquina (0 si no tiene).
                    charges: def && def.attributes && def.attributes.charges !== undefined
                        ? this.runeCharges(dentro) : 0
                };
            })
        };
    },

    // -----------------------------------------------------------------------
    // Meter y sacar en el inventario
    // -----------------------------------------------------------------------

    /**
     * ¿CABE `count` de `typeId` en ese contenedor que llevas? Una pila se junta con las iguales hasta
     * MAX_PILA y lo que sobre hace pilas nuevas, cada una en su hueco. `excluir` no cuenta (lo que se
     * está moviendo, si ya estaba dentro).
     */
    cabeEnEntrada(creature, destino, typeId, count, excluir) {
        const dentro = this.contenidoDeEntrada(creature, destino).filter((e) => e !== excluir);
        const nuevas = this._pilasNuevasEn(dentro, typeId, count);
        return nuevas === 0 || dentro.length + nuevas <= this.capacityOfType(destino.typeId);
    },

    /** Cuántas pilas nuevas hacen falta para meter `count` de un tipo en una lista de entradas. */
    _pilasNuevasEn(lista, typeId, count) {
        const cuantos = Math.max(1, Math.trunc(Number(count) || 1));
        if (!this.esApilable(typeId)) {
            return 1;
        }
        const hueco = lista.filter((e) => e.typeId === Number(typeId))
            .reduce((total, e) => total + Math.max(0, MAX_PILA - e.count), 0);
        return Math.ceil(Math.max(0, cuantos - hueco) / MAX_PILA);
    },

    /**
     * PONE UNA ENTRADA (suelta, ya desprendida de donde estuviera) DENTRO DE UN CONTENEDOR QUE
     * LLEVAS: `destino` null o la mochila puesta es la mochila. Lo apilable se junta con sus iguales
     * (y la entrada que llega desaparece en ellas); lo demás entra tal cual, con su `uid` y lo que
     * lleve dentro. No comprueba nada: eso se hace antes.
     *
     * @returns {Object} la entrada donde ha quedado (la última pila que recibió algo)
     */
    _ponerEntradaEn(creature, destino, entry) {
        const mochila = this.containerOf(creature);
        const enMochila = !destino || destino === mochila;
        if (this.esApilable(entry.typeId)) {
            return this._addToContainer(creature, entry.typeId, entry.count, entry.attributes, entry,
                { destino: enMochila ? null : destino });
        }
        if (!(creature.inventory instanceof Array)) {
            creature.inventory = [];
        }
        const lista = enMochila ? creature.inventory
            : (Array.isArray(destino.contents) ? destino.contents : (destino.contents = []));
        entry.slot = SLOT_INSIDE;
        entry.position = lista.length;
        lista.push(entry);
        return entry;
    },

    /**
     * SACA UNA ENTRADA DE DONDE ESTÉ (puesta, en la mochila o en una bolsa a cualquier profundidad)
     * y la devuelve suelta, CON TODO LO SUYO DENTRO: si es la mochila puesta, sus entradas `inside`
     * salen con ella y pasan a ser su `contents`, para que viaje como cualquier otra bolsa.
     *
     * @returns {Object|null} la misma entrada, o null si no la llevaba
     */
    _desprenderEntrada(creature, entry) {
        const ubicacion = this.ubicacionDeEntrada(creature, entry);
        if (!ubicacion) {
            return null;
        }
        const mochila = this.containerOf(creature);
        const lista = ubicacion.lista;
        lista.splice(lista.indexOf(entry), 1);
        if (entry === mochila) {
            const dentro = creature.inventory.filter((e) => e.slot === SLOT_INSIDE);
            dentro.forEach((e) => creature.inventory.splice(creature.inventory.indexOf(e), 1));
            entry.contents = dentro;
            this._reindexInventory(entry.contents);
        }
        this._reindexInventory(lista);
        if (lista !== creature.inventory) {
            this._reindexInventory(creature.inventory);
        }
        return entry;
    },

    /**
     * SE PONE UN CONTENEDOR COMO MOCHILA: lo que llevaba en `contents` pasa a ser lo de dentro de la
     * mochila (entradas `inside` de la lista plana), que es donde vive lo de la mochila puesta.
     */
    _desplegarComoMochila(creature, entry) {
        const dentro = Array.isArray(entry.contents) ? entry.contents : [];
        delete entry.contents;
        dentro.forEach((hijo) => {
            hijo.slot = SLOT_INSIDE;
            hijo.position = creature.inventory.length;
            creature.inventory.push(hijo);
        });
        this._reindexInventory(creature.inventory);
    },

    // -----------------------------------------------------------------------
    // Entre el inventario y el mundo
    // -----------------------------------------------------------------------

    /**
     * UNA ENTRADA HECHA OBJETO DEL MUNDO, con todo lo que lleve dentro hecho objetos también (cada
     * uno con su instancia, en la tabla de objetos y con su `parent`). Sin casilla: quien llama lo
     * pone en el suelo o dentro de algo. `contenido` manda sobre `entry.contents` (la mochila
     * puesta, cuyo contenido son las entradas `inside`).
     *
     * @returns {Item|null} null si el tipo ya no existe en items.xml
     */
    _objetoDesdeEntrada(entry, padre, contenido, profundidad) {
        const definicion = this.itemTypes.get(Number(entry.typeId));
        if (!definicion) {
            return null;
        }
        const item = new Item(definicion, { count: entry.count, attributes: entry.attributes || null });
        item.instanceId = this._allocateItemId();
        item.parent = padre || null;
        item.position = null;
        this.items.set(item.instanceId, item);
        const dentro = contenido || (Array.isArray(entry.contents) ? entry.contents : []);
        if (dentro.length > 0 && (profundidad || 0) <= MAX_ANIDADO) {
            item.contents = dentro
                .map((hijo) => this._objetoDesdeEntrada(hijo, item, null, (profundidad || 0) + 1))
                .filter(Boolean);
        }
        return item;
    },

    /**
     * UN OBJETO DEL MUNDO HECHO ENTRADA, con todo lo suyo dentro. Lo de DENTRO deja la tabla de
     * objetos sueltos (ya no está en el mundo); el objeto de fuera lo saca quien llama, que es quien
     * sabe de dónde venía (una casilla, un cuerpo).
     */
    _entradaDesdeObjeto(item, profundidad) {
        const entry = {
            slot: SLOT_INSIDE,
            position: 0,
            typeId: item.typeId,
            count: Math.max(1, Number(item.count) || 1),
            attributes: copiarAtributos(item.attributes)
        };
        const dentro = Array.isArray(item.contents) ? item.contents : [];
        if (dentro.length > 0 && (profundidad || 0) <= MAX_ANIDADO) {
            entry.contents = dentro.map((hijo, index) => {
                const e = this._entradaDesdeObjeto(hijo, (profundidad || 0) + 1);
                e.position = index;
                this.items.delete(hijo.instanceId);
                return e;
            });
        }
        return entry;
    },

    /** Borra de la tabla de objetos un objeto y todo lo que lleve dentro (se ha destruido). */
    _olvidarObjeto(item, profundidad) {
        if (!item) {
            return;
        }
        (Array.isArray(item.contents) ? item.contents : []).forEach((hijo) => {
            if ((profundidad || 0) <= MAX_ANIDADO) {
                this._olvidarObjeto(hijo, (profundidad || 0) + 1);
            }
        });
        this.items.delete(item.instanceId);
    },

    // -----------------------------------------------------------------------
    // El árbol del mundo
    // -----------------------------------------------------------------------

    /**
     * EL OBJETO DE FUERA DEL TODO de un objeto que está dentro de otros (el cuerpo donde está la
     * bolsa donde está la espada), o null si la cadena está rota: alguien se llevó un contenedor de
     * en medio y lo de dentro ya no cuelga de nada que esté en el mundo.
     */
    raizDeObjeto(item) {
        let actual = item;
        for (let paso = 0; actual && actual.parent; paso += 1) {
            const padre = actual.parent;
            if (paso > MAX_ANIDADO + 1 || !Array.isArray(padre.contents) || padre.contents.indexOf(actual) === -1) {
                return null;
            }
            actual = padre;
        }
        return actual || null;
    },

    /**
     * DÓNDE ESTÁ, EN EL MAPA, UN OBJETO QUE PUEDE ESTAR DENTRO DE OTROS: la casilla de su raíz (el
     * cuerpo, la mochila tirada, el cofre del depósito). Null si no está en el mundo. Es lo que se
     * mira para "estar al lado" de un contenedor de dentro de otro.
     */
    posicionDeObjeto(item) {
        const raiz = item ? this.raizDeObjeto(item) : null;
        if (!raiz || !raiz.position || this.items.get(raiz.instanceId) !== raiz) {
            return null;
        }
        return raiz.position;
    },

    /** Cuántos contenedores rodean a un objeto del mundo (0 si está en una casilla). */
    nivelDeObjeto(item) {
        let nivel = 0;
        for (let actual = item; actual && actual.parent && nivel <= MAX_ANIDADO + 1; actual = actual.parent) {
            nivel += 1;
        }
        return nivel;
    },

    /** Como `alturaDeEntrada`, para un objeto del mundo. */
    alturaDeObjeto(item, profundidad) {
        if (!item || !item.isContainer || (profundidad || 0) > MAX_ANIDADO + 1) {
            return 0;
        }
        const hijos = Array.isArray(item.contents) ? item.contents : [];
        return 1 + hijos.reduce((maximo, hijo) =>
            Math.max(maximo, this.alturaDeObjeto(hijo, (profundidad || 0) + 1)), 0);
    },

    /** Lo que pesa un objeto del mundo CON TODO LO QUE LLEVE DENTRO. */
    pesoDeObjeto(item, profundidad) {
        const propio = this.weightOfItem(item.typeId, item.count);
        if (!Array.isArray(item.contents) || (profundidad || 0) > MAX_ANIDADO) {
            return propio;
        }
        return item.contents.reduce((total, hijo) => total + this.pesoDeObjeto(hijo, (profundidad || 0) + 1), propio);
    },

    /** ¿Cabe `count` de `typeId` en ese contenedor del mundo? (Las mismas cuentas que en el inventario.) */
    cabeEnObjeto(container, typeId, count) {
        const dentro = this.contentsOfItem(container);
        const nuevas = this._pilasNuevasEn(dentro, typeId, count);
        return nuevas === 0 || dentro.length + nuevas <= this.capacityOfContainer(container);
    },

    /**
     * METE UN OBJETO DEL MUNDO (suelto, sin casilla ni contenedor) DENTRO DE UN CONTENEDOR DEL
     * MUNDO. Lo apilable se junta con sus iguales hasta MAX_PILA (y si se gasta entero, deja la
     * tabla de objetos); lo demás entra tal cual, CONSERVANDO SU INSTANCIA y lo que lleve dentro.
     * No comprueba los huecos: eso es `cabeEnObjeto`, antes.
     *
     * @returns {Item} donde ha quedado (la última pila que recibió algo)
     */
    _meterEnObjeto(container, item) {
        const contents = this.contentsOfItem(container);
        let ultimo = null;
        if (item.stackable) {
            for (const pila of contents) {
                if (item.count <= 0) {
                    break;
                }
                if (pila !== item && pila.typeId === item.typeId && pila.count < MAX_PILA) {
                    const cabe = Math.min(MAX_PILA - pila.count, item.count);
                    pila.count += cabe;
                    item.count -= cabe;
                    ultimo = pila;
                }
            }
            if (item.count <= 0) {
                this.items.delete(item.instanceId);
                return ultimo;
            }
        }
        item.parent = container;
        item.position = null;
        // Lo de dentro de un contenedor se busca por su instancia (las ventanas, los scripts).
        if (!item.instanceId) {
            this.adoptItem(item);
        } else {
            this.items.set(item.instanceId, item);
        }
        contents.push(item);
        return item;
    },

    /**
     * SACA UN OBJETO DEL MUNDO DE DONDE ESTÉ (una casilla o un contenedor) SIN DESTRUIRLO: sigue en
     * la tabla de objetos, con su instancia y lo suyo dentro. Es lo que se hace antes de meterlo en
     * otro contenedor del mundo.
     */
    _desprenderObjeto(item, tile) {
        if (item.parent) {
            this._sacarDeContenedor(item);
            return item;
        }
        const casilla = tile || (item.position
            ? this.map.getTile(item.position.x, item.position.y, item.position.z) : null);
        if (casilla && casilla.removeItem(item)) {
            this.emit('onItemRemoved', item, casilla);
            this.emit('onTileChanged', item.position, null);
        }
        this.adoptItem(item);
        item.position = null;
        return item;
    },

    // -----------------------------------------------------------------------
    // Mover a dentro de un contenedor: la regla entera, en un sitio
    // -----------------------------------------------------------------------

    /**
     * MUEVE ALGO DENTRO DE UN CONTENEDOR, venga de donde venga y vaya a donde vaya:
     *
     *   - `origen`: `{ entry }` (algo que llevas, a cualquier profundidad) o `{ item, tile }` (algo
     *     del mundo: de una casilla, o de dentro de un contenedor del mundo);
     *   - `destino`: `{ entry }` (un contenedor que llevas, la mochila incluida) o `{ item }` (un
     *     contenedor del mundo: un cuerpo, el depósito, una bolsa dentro de un cuerpo).
     *
     * COMPRUEBA TODO ANTES DE TOCAR NADA, en el orden de los mensajes: que no esté ya ahí, que un
     * contenedor no vaya dentro de sí mismo, la profundidad, los huecos y el peso (este sólo si lo
     * que entra en el inventario viene de fuera: dentro de tu inventario pesa lo mismo esté donde
     * esté). Y sólo entonces lo saca de su sitio y lo mete en el nuevo.
     *
     * @returns {{ok: boolean, reason?: string, item?: Object, slots?: number, max?: number}}
     */
    moverADentro(creature, origen, destino) {
        const entry = origen.entry || null;
        const item = origen.item || null;
        const typeId = entry ? entry.typeId : item.typeId;
        const count = Math.max(1, Number(entry ? entry.count : item.count) || 1);
        const mochila = this.containerOf(creature);

        // --- 1. ¿Ya está ahí? ---
        if (destino.entry) {
            const ubicacion = entry ? this.ubicacionDeEntrada(creature, entry) : null;
            if (entry && ubicacion && ubicacion.padre === destino.entry) {
                return { ok: false, reason: 'alreadyThere' };
            }
        } else if (item && (item === destino.item || item.parent === destino.item)) {
            return { ok: false, reason: item === destino.item ? 'containerInItself' : 'alreadyThere' };
        }

        // --- 2. Un contenedor no entra dentro de sí mismo ni de lo que lleva dentro ---
        if (entry && destino.entry && this._entradaContiene(creature, entry, destino.entry)) {
            return { ok: false, reason: 'containerInItself' };
        }
        if (item && destino.item) {
            for (let actual = destino.item; actual; actual = actual.parent) {
                if (actual === item) {
                    return { ok: false, reason: 'containerInItself' };
                }
            }
        }

        // --- 3. La profundidad: la cadena de contenedores no pasa de MAX_ANIDADO ---
        let nivelDestino;
        if (destino.entry) {
            const ubicacion = this.ubicacionDeEntrada(creature, destino.entry);
            if (!ubicacion) {
                return { ok: false, reason: 'badTarget' };
            }
            nivelDestino = ubicacion.nivel;
        } else {
            nivelDestino = this.nivelDeObjeto(destino.item);
        }
        const altura = entry ? this.alturaDeEntrada(creature, entry) : this.alturaDeObjeto(item);
        if (nivelDestino + 1 + altura > MAX_ANIDADO) {
            return { ok: false, reason: 'tooDeep', max: MAX_ANIDADO };
        }

        // --- 4. Los huecos ---
        if (destino.entry) {
            if (!this.cabeEnEntrada(creature, destino.entry, typeId, count, entry)) {
                return destino.entry === mochila
                    ? { ok: false, reason: 'backpackFull', slots: this.backpackCapacity(creature) }
                    : { ok: false, reason: 'containerFull', slots: this.capacityOfType(destino.entry.typeId) };
            }
        } else if (!this.cabeEnObjeto(destino.item, typeId, count)) {
            return { ok: false, reason: 'containerFull', slots: this.capacityOfContainer(destino.item) };
        }

        // --- 5. El peso: sólo lo que entra de fuera ---
        if (item && destino.entry) {
            const peso = this.pesoDeObjeto(item);
            if (!this.canCarry(creature, peso)) {
                return {
                    ok: false, reason: 'tooHeavy', weight: peso,
                    free: this.capacityOf(creature) - this.weightOf(creature)
                };
            }
        }

        // --- 6. Y ahora sí: se saca de donde estaba y se mete ---
        let puesto;
        if (entry && destino.entry) {
            this._desprenderEntrada(creature, entry);
            puesto = this._ponerEntradaEn(creature, destino.entry, entry);
        } else if (item && destino.entry) {
            const nueva = this._entradaDesdeObjeto(item);
            this._takeFromGround(item, origen.tile);
            puesto = this._ponerEntradaEn(creature, destino.entry, nueva);
        } else if (entry) {
            const objeto = this._objetoDesdeEntrada(entry, null, this.contenidoDeEntrada(creature, entry));
            if (!objeto) {
                return { ok: false, reason: 'unknownItem' };
            }
            this._desprenderEntrada(creature, entry);
            puesto = this._meterEnObjeto(destino.item, objeto);
        } else {
            this._desprenderObjeto(item, origen.tile);
            puesto = this._meterEnObjeto(destino.item, item);
        }

        const stats = entry || destino.entry ? this.recomputeEquipment(creature) : undefined;
        return {
            ok: true, item: puesto, stats: stats,
            container: destino.item ? destino.item.instanceId : this.idDeContenedorPropio(destino.entry)
        };
    },

    /**
     * SACA DEL INVENTARIO UNA ENTRADA CON TODO LO SUYO Y LA DEJA EN EL MUNDO: dentro de
     * `destino.container` (un cuerpo, un paquete del correo) si cabe, y si no -o si no se da- en la
     * casilla `destino.position`. Sin comprobar alcance ni peso: es para lo que el juego hace por su
     * cuenta (morir, mandar algo por correo), no para lo que pide el jugador (eso es `moveItem`).
     *
     * ES LA FORMA DE QUE UNA BOLSA LLENA NO PIERDA LO DE DENTRO al salir del inventario sin pasar
     * por el arrastrar: rehacerla con `addToGroundContainer(tipo, cantidad)` la dejaría vacía.
     *
     * @returns {{ok: boolean, item?: Item, reason?: string}}
     */
    sacarEntradaAlMundo(creature, entry, destino) {
        const d = destino || {};
        if (!this.tieneEntrada(creature, entry)) {
            return { ok: false, reason: 'badSource' };
        }
        const objeto = this._objetoDesdeEntrada(entry, null, this.contenidoDeEntrada(creature, entry));
        if (!objeto) {
            return { ok: false, reason: 'unknownItem' };
        }
        let puesto = null;
        if (d.container && d.container.isContainer && this.cabeEnObjeto(d.container, objeto.typeId, objeto.count) &&
                this.nivelDeObjeto(d.container) + 1 + this.alturaDeObjeto(objeto) <= MAX_ANIDADO) {
            puesto = this._meterEnObjeto(d.container, objeto);
        } else if (d.position) {
            const r = this._ponerJuntando(objeto, d.position);
            puesto = r.ok ? r.item : null;
        }
        if (!puesto) {
            this._olvidarObjeto(objeto);
            return { ok: false, reason: 'noTile' };
        }
        this._desprenderEntrada(creature, entry);
        this.recomputeEquipment(creature);
        return { ok: true, item: puesto };
    },

    /**
     * Le mete a un jugador objetos NUEVOS en un contenedor que lleva (no la mochila: para eso
     * `addItemTo`), con todas las reglas: que exista, que quepa en sus huecos y que pueda con el
     * peso. Es el `addItem` de una bolsa en los scripts.
     *
     * @returns {{ok: boolean, reason?: string, entry?: Object}}
     */
    addItemToEntry(creature, destino, typeId, count, attributes) {
        const id = Number(typeId);
        const cuantos = Math.max(1, Math.trunc(Number(count) || 1));
        if (!this.itemTypes.has(id)) {
            return { ok: false, reason: 'unknownItem' };
        }
        const ubicacion = this.ubicacionDeEntrada(creature, destino);
        if (!ubicacion || !this.isContainerEntry(destino)) {
            return { ok: false, reason: 'noContainer' };
        }
        if (this.isContainerType(id) && ubicacion.nivel + 2 > MAX_ANIDADO) {
            return { ok: false, reason: 'tooDeep', max: MAX_ANIDADO };
        }
        if (!this.cabeEnEntrada(creature, destino, id, cuantos)) {
            return { ok: false, reason: 'containerFull', slots: this.capacityOfType(destino.typeId) };
        }
        const peso = this.weightOfItem(id, cuantos);
        if (!this.canCarry(creature, peso)) {
            return { ok: false, reason: 'tooHeavy', weight: peso, free: this.capacityOf(creature) - this.weightOf(creature) };
        }
        const puesta = this._addToContainer(creature, id, cuantos, attributes || null, null,
            { destino: destino === this.containerOf(creature) ? null : destino });
        this.emit('onInventoryChange', creature);
        return { ok: true, entry: puesta };
    },

    // -----------------------------------------------------------------------
    // Guardar y cargar
    // -----------------------------------------------------------------------

    /**
     * LO DE DENTRO DE UNA LISTA DE ENTRADAS, LISTO PARA GUARDAR en JSON: un árbol
     * `[{typeId, count, attributes, contents?}]`. Sin `uid` ni `slot` ni `position`: lo de dentro de
     * una bolsa está dentro, y su orden es el de la lista.
     */
    contenidoParaGuardar(lista, profundidad) {
        return (Array.isArray(lista) ? lista : []).map((entry) => {
            const guardado = {
                typeId: Number(entry.typeId),
                count: Math.max(1, Number(entry.count) || 1),
                attributes: copiarAtributos(entry.attributes)
            };
            if (Array.isArray(entry.contents) && entry.contents.length > 0 && (profundidad || 0) <= MAX_ANIDADO) {
                guardado.contents = this.contenidoParaGuardar(entry.contents, (profundidad || 0) + 1);
            }
            return guardado;
        });
    },

    /** Al revés: un árbol guardado, hecho entradas (lo que se lee del JSON). */
    contenidoDesdeGuardado(lista, profundidad) {
        return (Array.isArray(lista) ? lista : [])
            .filter((g) => g && Number(g.typeId) > 0)
            .map((g, index) => {
                const entry = {
                    slot: SLOT_INSIDE,
                    position: index,
                    typeId: Number(g.typeId),
                    count: Math.max(1, Number(g.count) || 1),
                    attributes: copiarAtributos(g.attributes)
                };
                if (Array.isArray(g.contents) && g.contents.length > 0 && (profundidad || 0) <= MAX_ANIDADO) {
                    entry.contents = this.contenidoDesdeGuardado(g.contents, (profundidad || 0) + 1);
                }
                return entry;
            });
    },

    /**
     * EL INVENTARIO HECHO FILAS DE `player_items`: las mismas entradas de la lista plana, y en las
     * bolsas lo de dentro metido en su JSON de atributos bajo `CLAVE_CONTENIDO`. No toca el
     * inventario: devuelve copias.
     */
    filasParaGuardar(inventario) {
        return (Array.isArray(inventario) ? inventario : []).map((entry) => {
            const fila = {
                slot: entry.slot,
                position: entry.position,
                typeId: entry.typeId,
                count: entry.count,
                attributes: copiarAtributos(entry.attributes)
            };
            if (Array.isArray(entry.contents) && entry.contents.length > 0) {
                fila.attributes = { ...(fila.attributes || {}), [CLAVE_CONTENIDO]: this.contenidoParaGuardar(entry.contents) };
            }
            return fila;
        });
    },

    /**
     * Y LAS FILAS HECHAS INVENTARIO: se saca `CLAVE_CONTENIDO` de los atributos y se pone en
     * `entry.contents`. Las filas de antes no la tienen y salen tal cual.
     */
    inventarioDesdeFilas(filas) {
        return (Array.isArray(filas) ? filas : []).map((fila) => {
            const entry = { ...fila };
            const atributos = fila.attributes && typeof fila.attributes === 'object' ? { ...fila.attributes } : null;
            if (atributos && Object.prototype.hasOwnProperty.call(atributos, CLAVE_CONTENIDO)) {
                const dentro = this.contenidoDesdeGuardado(atributos[CLAVE_CONTENIDO]);
                delete atributos[CLAVE_CONTENIDO];
                if (dentro.length > 0) {
                    entry.contents = dentro;
                }
            }
            entry.attributes = copiarAtributos(atributos);
            return entry;
        });
    },

    /** Un objeto del mundo, con lo suyo, hecho árbol para guardar (el depósito). */
    objetoParaGuardar(item, profundidad) {
        const guardado = {
            typeId: item.typeId,
            count: item.count,
            attributes: copiarAtributos(item.attributes)
        };
        const dentro = Array.isArray(item.contents) ? item.contents : [];
        if (dentro.length > 0 && (profundidad || 0) <= MAX_ANIDADO) {
            guardado.contents = dentro.map((hijo) => this.objetoParaGuardar(hijo, (profundidad || 0) + 1));
        }
        return guardado;
    },

    /** Al revés: un árbol guardado hecho objeto del mundo, dentro de `padre` (el depósito). */
    objetoDesdeGuardado(guardado, padre) {
        const entry = this.contenidoDesdeGuardado([guardado])[0];
        return entry ? this._objetoDesdeEntrada(entry, padre) : null;
    }
};

module.exports = { contenedores, MAX_PILA, MAX_ANIDADO, CLAVE_CONTENIDO };
