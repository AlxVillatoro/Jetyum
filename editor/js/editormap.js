/**
 * El mapa que se está editando.
 *
 * Trabaja sobre el JSON TAL Y COMO viaja por el API, no sobre las clases del motor.
 * Es deliberado: el editor es una herramienta del datapack y no debe cargar el motor
 * entero —con sus monstruos, sus temporizadores y su base de datos— para poder pintar
 * un muro. Lo único que comparte con el motor es el FORMATO, que es el contrato.
 *
 * ADEMÁS SIRVE DE ADAPTADOR para `drawlist.js`, que es el módulo del CLIENTE. Ese
 * módulo espera un mundo con `floors()`, `getTile()` y `creatures`, y da igual que
 * detrás haya un cliente conectado o un archivo abierto. Que el mismo código de
 * dibujo sirva para los dos es la prueba de que la separación está bien hecha: si el
 * editor necesitara su propio renderer, acabarían discrepando y un mapa se vería bien
 * en el editor y mal en el juego.
 *
 * TAMBIÉN LLEVA LOS RESPAWNS Y LOS NPC, y ahí hay una decisión que conviene entender: un
 * respawn NO es una casilla del mapa. Es una entrada de otra lista del mismo archivo —la
 * casilla, el monstruo que vive en ella y el radio al que se le deja salir—, y por eso no
 * puede viajar por `edits()`, que manda ESTADOS DE TILE. Si un respawn se mandara como una
 * edición de casilla, guardar un respawn BORRARÍA el suelo y los objetos de esa casilla, que
 * es exactamente el fallo que la prueba de ida y vuelta del mapa existe para cazar.
 *
 * Y LLEVA LA PILA DE CADA CASILLA, que es lo que permite elegir un objeto del mapa, mirarlo y
 * moverlo de sitio dentro de su casilla. La pila se lee EN EL ORDEN EN QUE SE DIBUJA —el mismo
 * que aplica el motor en `engine/world/tile.js`: suelo, items de abajo, items de arriba— y no
 * en el orden en que está escrito el archivo, porque lo que se quiere tocar es lo que se ve, y
 * porque mover algo «en la pila» sólo significa algo si el número que se enseña es el de dibujo.
 */

import {
    BANDERA_ZONA,
    MOTIVO_MONSTRUO_FUERA,
    MOTIVO_SIN_MONSTRUO,
    areaDelRespawn,
    areaDesplazada,
    bloquesProtegidos,
    claveDeRespawn,
    claveDeZona,
    dentroDelArea,
    etiquetaDeZona,
    indiceDeMonstruoEn,
    monstruosFueraDelArea,
    normalizarNpc,
    normalizarRespawns,
    respawnQueCubre,
    zonaQueCubre
} from './marcadores.js';
import { casillasDelPincel, limitarTamano, nombreDeTamano } from './pincel.js';
import { expandir, validarValores } from '../../shared/js/compuestos.mjs';

/** El separador de claves, igual que en el cliente. */
function key(x, y, z) {
    return x + ',' + y + ',' + z;
}

/**
 * Un número de casillas o de milisegundos, saneado. `null` si no se puede leer.
 *
 * Se usa para el radio y el intervalo, que llegan de campos de formulario: un campo vacío
 * da `''`, y `Number('')` es 0, que en el radio significa «no se mueve» y en el intervalo
 * «no aparece nunca». Confundir «vacío» con «cero» pondría un respawn que no respawnea sin
 * decir nada.
 */
function numero(valor) {
    if (valor === '' || valor === null || valor === undefined) {
        return null;
    }
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : null;
}

/**
 * La forma de las respuestas de la edición de marcadores.
 *
 * Ninguno de esos métodos lanza ni devuelve `undefined`: contestan siempre lo mismo, con un
 * `problema` cuando no se puede hacer y un `aviso` cuando se ha hecho algo que conviene
 * saber. Así la herramienta puede decir por qué no se puede poner un monstruo fuera de su
 * respawn, que es lo que pidió el usuario, y la prueba puede comprobarlo sin navegador.
 */
function fallo(problema, aviso) {
    return { ok: false, problema: problema, aviso: aviso || null };
}

function bien(datos) {
    const respuesta = { ok: true, problema: null, aviso: null };
    Object.keys(datos || {}).forEach((clave) => {
        respuesta[clave] = datos[clave];
    });
    return respuesta;
}

/**
 * Un item del archivo, en la forma que usa el editor.
 *
 * EN EL MAPA UN ITEM PUEDE SER UN NÚMERO SUELTO, y esto no es un detalle: en
 * `ciudad.map.json` hay 1.658 items escritos así (`"items": [111]`) porque es la forma
 * corta que el escritor usa para los objetos sin cantidad ni atributos, y es la que hace
 * legible un archivo con miles de ellos. El cargador del motor lo normaliza con
 * `descriptor = { id: entry }` (ver `engine/world/loader.js`).
 *
 * El editor NO lo normalizaba: hacía `{ ...item }`, y como un número no tiene
 * propiedades propias, extendía a `{}`. El resultado era un objeto sin identificador,
 * que se dibujaba como nada —los muros de la ciudad no aparecían en pantalla— y que al
 * guardar llegaba al servidor como `NaN`: pintar un suelo encima de un muro y darle a
 * guardar devolvía un 422 con "el item NaN no existe en items.xml". El mapa no se
 * corrompía, porque el servidor lo rechaza entero, pero el editor no se podía usar sin
 * tropezar con eso.
 *
 * @param {number|Object} entry
 * @returns {{id: number, count: (number|undefined), attributes: (Object|undefined)}|null}
 */
function normalizarItem(entry) {
    const descriptor = (typeof entry === 'object' && entry !== null) ? entry : { id: entry };
    const id = Number(descriptor.id);

    if (!Number.isFinite(id)) {
        // Un item ilegible se descarta en vez de convertirse en `NaN`: el cargador del
        // motor también lo rechaza, y dejar un `NaN` daría un fallo al guardar en una
        // casilla que ni siquiera se ha tocado.
        return null;
    }

    const item = { id: id };

    if (descriptor.count !== undefined) {
        item.count = Number(descriptor.count);
    }
    if (descriptor.attributes && Object.keys(descriptor.attributes).length > 0) {
        item.attributes = { ...descriptor.attributes };
    }

    return item;
}

export class EditorMap {
    /**
     * @param {Object} raw el JSON del mapa, tal y como lo devuelve el API
     * @param {Map<number, Object>} itemTypes definiciones de items.xml, por id
     * @param {Map<string, Object>} [npcTypes] definiciones de npcs.xml, por nombre
     */
    constructor(raw, itemTypes, npcTypes) {
        this.raw = raw;
        this.itemTypes = itemTypes || new Map();

        /**
         * Las definiciones de `data/npc/npcs.xml`, por nombre.
         *
         * Hacen falta para DIBUJAR el radio de paseo de un NPC, que no está en el mapa: el
         * mapa dice dónde está y el XML dice cómo es. Sin esto, el editor enseñaría a todos
         * los NPC clavados en su casilla, y el herrero pasea tres.
         */
        this.npcTypes = npcTypes || new Map();

        this.name = raw.name;
        this.width = raw.width;
        this.height = raw.height;
        this.floors = raw.floors;

        this.defaultGround = raw.defaultGround || {};
        this.fallbackGround = raw.fallbackGround === undefined ? 0 : raw.fallbackGround;

        /** Los tiles explícitos, por clave. */
        this.tiles = new Map();

        (raw.tiles || []).forEach((tile) => {
            this.tiles.set(key(tile.x, tile.y, tile.z), {
                x: tile.x,
                y: tile.y,
                z: tile.z,
                ground: tile.ground === undefined ? null : tile.ground,
                items: (tile.items || []).map(normalizarItem).filter((item) => item !== null),
                flags: (tile.flags || []).slice(),
                houseId: Number(tile.houseId) || 0
            });
        });

        /** Las claves que se han tocado desde el último guardado. */
        this.dirty = new Set();

        /** Los waypoints: nombre -> [x, y, z]. Se editan con la paleta de waypoints. */
        this.waypoints = JSON.parse(JSON.stringify(raw.waypoints || {}));

        /** Ciudades `{id, name, temple:[x,y,z]}` y casas `{id, name, townId, rent, exit}`. */
        this.towns = JSON.parse(JSON.stringify(raw.towns || []));
        this.houses = JSON.parse(JSON.stringify(raw.houses || []));

        /** Si se han tocado los waypoints, las ciudades o las casas. */
        this.extrasSucios = false;

        /**
         * Los respawns: ÁREAS con sus monstruos dentro, no «una casilla con un monstruo».
         *
         * Se normalizan al entrar, igual que los items, y ahí se aceptan las dos formas del
         * formato (ver `normalizarRespawns`). Un respawn ilegible se descarta en vez de llegar
         * al dibujo y dar un marcador que no se puede ni pintar ni guardar.
         */
        this.spawns = normalizarRespawns(raw.spawns);

        /**
         * LOS OBJETOS COMPUESTOS COLOCADOS: `{uid, compuesto, x, y, z, valores}`.
         *
         * Sus piezas están en las casillas como objetos normales (es lo que lee el motor); esta
         * lista es lo que permite elegir el objeto ENTERO, moverlo, reconfigurarlo o borrarlo.
         * Las plantillas las pone `setPlantillas` (vienen de `data/editor/compuestos.json`).
         */
        this.compuestos = (raw.composites || []).map((c) => ({
            uid: Number(c.uid), compuesto: String(c.compuesto),
            x: Number(c.x), y: Number(c.y), z: Number(c.z),
            valores: c.valores ? JSON.parse(JSON.stringify(c.valores)) : {}
        }));
        this.compuestosSucios = false;
        this.plantillas = new Map();
        /** El uid del compuesto elegido, o null. */
        this.compuestoSel = null;

        /** Los NPC colocados: casilla, nombre y el radio de paseo si el mapa lo decidió. */
        this.npcs = (raw.npcs || []).map(normalizarNpc).filter((npc) => npc !== null);

        /**
         * Si se han tocado los respawns o los NPC desde el último guardado.
         *
         * VAN APARTE DE `dirty`, que es un conjunto de CASILLAS. Meter un respawn en `dirty`
         * haría que guardar mandara además una edición de esa casilla, y esa edición —sin
         * suelo, sin items— la dejaría vacía: poner un respawn encima de una mesa se llevaría
         * la mesa por delante.
         */
        this.spawnsSucios = false;
        this.npcsSucios = false;

        /** El marcador elegido: `{tipo: 'respawn'|'monstruo'|'npc', clave?, posicion?}`. */
        this.seleccion = null;

        /**
         * El OBJETO elegido de una casilla: `{x, y, z, indice, id}`, o `null`.
         *
         * VA APARTE DE `seleccion` A PROPÓSITO. `seleccion` es un marcador —un respawn, un
         * monstruo o un NPC, que son listas del archivo— y esto es un objeto de la PILA de una
         * casilla. Son dos cosas distintas que se eligen con herramientas distintas, y
         * mezclarlas en un solo campo haría que elegir un respawn borrara el objeto que se
         * estaba mirando, y al revés.
         *
         * `indice` es la posición en `tile.items` del archivo y `null` significa el SUELO, que
         * en el formato no es un objeto de la lista sino un número de la casilla.
         */
        this.objeto = null;

        /**
         * EL ARRASTRE EN CURSO, o `null`. Es lo que se está moviendo con el ratón ahora mismo.
         *
         * VIVE AQUÍ Y NO EN `main.js` porque un arrastre es GEOMETRÍA DE ESTADO —qué se agarró,
         * desde qué casilla, dónde está ahora y qué pasaría si se soltara ahí— y la geometría de
         * estado de este editor se comprueba sin navegador. En `main.js` sólo queda el gesto: qué
         * botón lo empieza y qué botón lo termina.
         *
         * Las clases de arrastre son cuatro y se distinguen en `clase`: `objetos` (lo de encima de
         * un bloque de casillas), `respawn` (un área entera con sus monstruos dentro), `monstruo`
         * (uno de esos monstruos, dentro de su área) y `npc`.
         */
        this.arrastre = null;

        /** Lo que el cliente espera: aquí no hay criaturas. */
        this.creatures = new Map();
    }

    // -----------------------------------------------------------------------
    // Consulta
    // -----------------------------------------------------------------------

    inBounds(x, y, z) {
        return x >= 0 && y >= 0 && z >= 0 &&
            x < this.width && y < this.height && z < this.floors;
    }

    /** El suelo por defecto de una planta. */
    defaultGroundFor(z) {
        if (this.defaultGround[z] !== undefined) {
            return this.defaultGround[z];
        }
        return this.fallbackGround;
    }

    /** El tile explícito, o null si sólo hay suelo por defecto. */
    tileAt(x, y, z) {
        return this.tiles.get(key(x, y, z)) || null;
    }

    /** El suelo que se ve en una celda: el explícito o el de su planta. */
    groundAt(x, y, z) {
        const tile = this.tileAt(x, y, z);
        if (tile && tile.ground !== null) {
            return tile.ground;
        }
        return this.defaultGroundFor(z);
    }

    /**
     * Las casillas de una planta que tienen SU PROPIO suelo, o sea las que el mapa escribe.
     *
     * EXISTE POR UN FALLO DE DIBUJO, y conviene contarlo porque el síntoma no se parecía a la
     * causa: el lienzo pinta el suelo por defecto de la planta como UN fondo de un solo
     * rectángulo para todo el mapa —que es lo que permite ver un mapa de 128x128 sin dibujar
     * 16.384 casillas—, y encima dibuja el suelo propio de las casillas que lo tienen. Si ese
     * suelo propio tiene píxeles transparentes —y los tiene: las casillas de la hoja son
     * dibujos, no cuadros opacos—, por los agujeros se ve el suelo de la planta. O sea: se ven
     * los DOS suelos a la vez, como si estuvieran apilados, cuando en el archivo hay uno solo.
     *
     * Un juego no tiene ese problema porque no pinta ningún fondo: dibuja el suelo de cada
     * casilla sobre el vacío. El editor sí lo tiene, y la solución es saber QUÉ casillas hay
     * que dejar sin fondo antes de dibujarlas. Eso es lo que devuelve esto, y es la única
     * respuesta a «¿cuáles?»: las que tienen `ground` en el archivo.
     *
     * @param {number} z
     * @param {{x0: number, y0: number, x1: number, y1: number}} [rect] si se da, sólo las
     *        casillas de ese rectángulo. ES LO QUE HACE QUE ESTO SE PUEDA LLAMAR EN CADA
     *        FOTOGRAMA: el mapa de la ciudad tiene 2.825 casillas con suelo propio, y el lienzo
     *        sólo dibuja las que se ven —unas 250 a 1:1—. Recorrer las 2.825 para borrar 250 es
     *        justo el trabajo tirado que el editor ya evita acotando la cámara al mapa.
     * @returns {Array<{x: number, y: number}>}
     */
    casillasConSueloPropio(z, rect) {
        const casillas = [];

        this.tiles.forEach((tile) => {
            if (tile.z !== z || tile.ground === null) {
                return;
            }

            if (rect && (tile.x < rect.x0 || tile.x > rect.x1 ||
                tile.y < rect.y0 || tile.y > rect.y1)) {
                return;
            }

            casillas.push({ x: tile.x, y: tile.y });
        });

        return casillas;
    }

    definitionOf(typeId) {
        return this.itemTypes.get(Number(typeId)) || null;
    }

    isAlwaysOnTop(typeId) {
        const definition = this.definitionOf(typeId);
        if (!definition || !definition.attributes) {
            return false;
        }
        const raw = definition.attributes.alwaysOnTop;
        return raw === true || raw === 1 || raw === '1' || raw === 'true';
    }

    // -----------------------------------------------------------------------
    // Consulta de respawns y NPC
    // -----------------------------------------------------------------------

    /** La definición de un NPC, de `data/npc/npcs.xml`. */
    definicionDeNpc(nombre) {
        return this.npcTypes.get(String(nombre)) || null;
    }

    /**
     * Cuántas casillas pasea un NPC colocado.
     *
     * El radio de la COLOCACIÓN manda sobre el de `npcs.xml`, y `null` en la colocación
     * significa «no dice nada, manda el XML». Es la respuesta a la pregunta que deja el
     * modelo: en Remere's un NPC no pasea— se coloca y se queda—, aquí sí pasea por decisión
     * de este proyecto, y el mapa puede afinarlo.
     */
    radioDeNpc(npc) {
        if (!npc) {
            return 0;
        }
        if (npc.radius !== null && npc.radius !== undefined) {
            return Number(npc.radius);
        }

        const definicion = this.definicionDeNpc(npc.name);
        return definicion ? Number(definicion.walkRadius) || 0 : 0;
    }

    /** El respawn (área) que cubre una casilla, o null. */
    respawnEn(x, y, z) {
        return respawnQueCubre(this.spawns, x, y, z);
    }

    /**
     * La ZONA PROTEGIDA que cubre una casilla, o null.
     *
     * Una zona protegida NO es un área con centro y radio: es la bandera `protectionZone` de la
     * casilla, así que lo que devuelve esto es el BLOQUE de casillas contiguas que la llevan
     * (`marcadores.js` tiene el razonamiento entero: por qué un bloque, y por qué contiguas de
     * cuatro vecinos y no de ocho).
     */
    zonaEn(x, y, z) {
        return zonaQueCubre(this, x, y, z);
    }

    /** Todas las zonas protegidas de una planta, para dibujarlas y para contarlas. */
    zonasDe(z) {
        return bloquesProtegidos(this, z);
    }

    /** El índice del NPC que está en una casilla, o -1. */
    indiceDeNpcEn(x, y, z) {
        return this.npcs.findIndex((npc) => npc.x === x && npc.y === y && npc.z === z);
    }

    /** El NPC que está en una casilla, o null. */
    npcEn(x, y, z) {
        const indice = this.indiceDeNpcEn(x, y, z);
        return indice === -1 ? null : this.npcs[indice];
    }

    /**
     * El monstruo que está en una casilla, con el respawn al que pertenece.
     *
     * Devuelve `{respawn, posicion, monstruo}` o null. Es lo que permite pinchar un monstruo
     * concreto para moverlo, que es lo que hace utilizable el área: sin esto, un respawn con
     * cinco ratas sería una lista y no un mapa.
     */
    monstruoEn(x, y, z) {
        const area = this.respawnEn(x, y, z);

        if (!area) {
            return null;
        }

        const posicion = indiceDeMonstruoEn(area, x, y);
        if (posicion === -1) {
            return null;
        }

        return { respawn: area, posicion: posicion, monstruo: area.monsters[posicion] };
    }

    /** La lista de respawns, tal cual, para el panel y el dibujo. */
    respawns() {
        return this.spawns;
    }

    /** El área, en casillas, de un respawn. Lo usa el dibujo y lo usa el panel. */
    areaDe(respawn) {
        return areaDelRespawn(respawn);
    }

    /** Resuelve la selección a los objetos que hay detrás, o null si ya no existen. */
    marcadorElegido() {
        const elegido = this.seleccion;

        if (!elegido) {
            return null;
        }

        if (elegido.tipo === 'npc') {
            const npc = this.npcs.find((candidato) =>
                candidato.x + ',' + candidato.y + ',' + candidato.z === elegido.clave);
            return npc ? { tipo: 'npc', npc: npc } : null;
        }

        // Una zona protegida se resuelve VOLVIENDO A RECORRERLA desde su ancla: la bandera se puede
        // haber quitado (con la herramienta Bandera o borrando la zona), y entonces la selección se
        // suelta sola en vez de seguir hablando de un bloque que ya no existe.
        if (elegido.tipo === 'zona') {
            const zona = this._zonaDeClave(elegido.clave);

            return zona ? { tipo: 'zona', zona: zona, clave: claveDeZona(zona) } : null;
        }

        const respawn = this.spawns.find((area) => claveDeRespawn(area) === elegido.clave);

        if (!respawn) {
            return null;
        }

        if (elegido.tipo === 'monstruo') {
            const monstruo = respawn.monsters[elegido.posicion];
            return monstruo
                ? { tipo: 'monstruo', respawn: respawn, posicion: elegido.posicion, monstruo: monstruo }
                : null;
        }

        return { tipo: 'respawn', respawn: respawn };
    }

    /** La clave de un respawn, para seleccionarlo. */
    claveDe(respawn) {
        return claveDeRespawn(respawn);
    }

    // -----------------------------------------------------------------------
    // La interfaz que necesita `drawlist.js`
    // -----------------------------------------------------------------------

    now() {
        return 0;
    }

    creaturePosition(creature) {
        return { x: creature.x, y: creature.y, moving: false };
    }

    /** Las plantas que tienen algo que dibujar. */
    floors() {
        const found = new Set();

        // Sólo se dibujan las plantas que TIENEN TILES EXPLÍCITOS. Dibujar una planta
        // entera de suelo por defecto sería pintar 4096 celdas idénticas, y además
        // escondería lo que se está editando debajo del suelo de arriba.
        this.tiles.forEach((tile) => {
            if (!this.isVoid(tile)) {
                found.add(tile.z);
            }
        });

        return Array.from(found).sort((a, b) => b - a);
    }

    /** Un tile sin suelo propio, sin items y sin banderas no aporta nada al dibujo. */
    isVoid(tile) {
        return tile.ground === null && tile.items.length === 0 && tile.flags.length === 0 &&
            !tile.houseId;
    }

    /**
     * Un tile, en el formato que espera el orden de dibujo.
     *
     * Devuelve `null` para las celdas que NO tienen nada explícito, y eso es lo que
     * hace que el editor sea manejable: el suelo por defecto lo pinta el editor como
     * un fondo de un solo rectángulo, y la lista de dibujo sólo lleva lo que alguien
     * puso. Dibujar las 4096 celdas de suelo por defecto de una planta sería pintar
     * lo mismo 4096 veces y además taparía lo que se está editando.
     *
     * `downCount` se CALCULA aquí a partir de la bandera `alwaysOnTop` de cada item.
     * Es la misma regla que aplica el motor al colocar un item en un tile, y tiene que
     * ser la misma: si el editor dibujara las mesas por debajo de los muñecos y el
     * juego por encima, el mapa se vería distinto en cada sitio.
     *
     * Y CADA ITEM LLEVA UN `instanceId` QUE ES SU POSICIÓN EN ESE ORDEN, que es lo que
     * permite al lienzo teñir EL ELEGIDO y sólo él: en la lista de dibujo que se pasa al
     * lienzo no viaja de qué item del archivo salió cada operación, y sin ese número habría que
     * teñir toda la casilla —y con ella los objetos que no se han elegido—. El cliente no lo
     * mira: viaja en el mensaje del protocolo y allí significa otra cosa, así que aquí se usa
     * sólo dentro del editor.
     */
    getTile(x, y, z) {
        const tile = this.tileAt(x, y, z);
        if (!tile || this.isVoid(tile)) {
            return null;
        }

        const ground = tile.ground !== null ? tile.ground : this.defaultGroundFor(z);

        const down = [];
        const top = [];

        tile.items.forEach((item) => {
            const definition = this.definitionOf(item.id);
            const entry = {
                id: item.id,
                count: item.count === undefined ? 1 : item.count,
                instanceId: 0,
                name: definition ? definition.name : 'item ' + item.id
            };

            if (this.isAlwaysOnTop(item.id)) {
                top.push(entry);
            } else {
                down.push(entry);
            }
        });

        const items = down.concat(top);

        items.forEach((entry, posicion) => {
            entry.instanceId = posicion + 1;
        });

        return {
            x: x, y: y, z: z,
            ground: ground,
            items: items,
            downCount: down.length,
            flags: tile.flags,
            /** El suelo se pintó a mano, no es el de la planta. */
            ownGround: tile.ground !== null
        };
    }

    // -----------------------------------------------------------------------
    // Edición
    //
    // TRES COSAS DISTINTAS QUE PARECEN LA MISMA, y confundirlas es el fallo que más
    // caro sale en un editor de mapas:
    //
    //   - EL SUELO NO SE APILA. Una casilla tiene UN `ground` (ver `loader.js` y
    //     `data/world/sample.map.json`): es sobre lo que se anda y lo que decide el
    //     coste de paso. Pintar otro suelo SUSTITUYE al de antes, y así está escrito
    //     en `paintGround`.
    //   - LOS OBJETOS SÍ SE APILAN, y el orden importa: la pila se dibuja de abajo
    //     arriba y sólo se puede coger lo de más arriba. `paintItem` sustituye la pila
    //     entera y `addItem` (Mayús) añade al final, encima.
    //   - LAS BANDERAS SON UN CONJUNTO. Varias conviven en la misma casilla y
    //     `toggleFlag` pone o quita la que se le diga, sin tocar las demás.
    //
    // Ninguna de las tres toca a las otras: cambiar el suelo de una habitación
    // amueblada no puede llevarse los muebles por delante.
    // -----------------------------------------------------------------------

    /** Un tile que se pueda modificar, creándolo si no existe. */
    editableTile(x, y, z) {
        const k = key(x, y, z);
        let tile = this.tiles.get(k);

        if (!tile) {
            tile = { x: x, y: y, z: z, ground: null, items: [], flags: [], houseId: 0 };
            this.tiles.set(k, tile);
        }

        return tile;
    }

    markDirty(x, y, z) {
        this.dirty.add(key(x, y, z));
    }

    /**
     * Pone un item como ÚNICO contenido de la pila de un tile.
     *
     * Es el pincel normal: un clic deja ese objeto y quita los que hubiera, porque si
     * añadiera, pintar dos veces el mismo muro lo pondría dos veces y el mapa acumularía
     * basura con cada retoque. Para apilar está `addItem`, que es Mayús.
     */
    paintItem(x, y, z, typeId, count) {
        const tile = this.editableTile(x, y, z);
        tile.items = [{ id: Number(typeId) }];
        if (count !== undefined && count !== 1) {
            tile.items[0].count = Number(count);
        }
        this.markDirty(x, y, z);
    }

    /**
     * Añade un item AL FINAL de la pila, sin quitar los que hubiera.
     *
     * El final es la parte de arriba: la pila se dibuja en el orden en que está escrita,
     * así que lo último que se añade es lo que se ve encima. Es lo que hace falta para
     * poner una moneda sobre una mesa, y por eso está en Mayús y no en el clic normal.
     */
    addItem(x, y, z, typeId) {
        const tile = this.editableTile(x, y, z);
        tile.items.push({ id: Number(typeId) });
        this.markDirty(x, y, z);
    }

    /** Quita el último item del tile, que es el de más arriba de la pila. */
    popItem(x, y, z) {
        const tile = this.tileAt(x, y, z);
        if (!tile || tile.items.length === 0) {
            return false;
        }
        tile.items.pop();
        this.markDirty(x, y, z);
        return true;
    }

    /**
     * Pinta un suelo distinto al de la planta.
     *
     * REEMPLAZA, NO APILA. El suelo es uno por casilla en el formato del mapa, así que
     * pintar encima del anterior lo sustituye. El suelo antiguo no se queda debajo: lo
     * que se guarda es el número nuevo, y el escritor escribe uno solo. Tampoco se
     * pierde nada por el camino, porque el suelo por defecto de la planta sigue estando
     * en `defaultGround` y vuelve solo al borrar la casilla.
     */
    paintGround(x, y, z, typeId) {
        const tile = this.editableTile(x, y, z);
        tile.ground = Number(typeId);
        this.markDirty(x, y, z);
        return tile.ground;
    }

    /**
     * Pone o quita una bandera, dejando las demás como estaban.
     *
     * Las banderas son un CONJUNTO: una casilla puede ser zona de protección y no
     * permitir salir a la vez. Por eso esto alterna una sola y no reemplaza la lista.
     */
    toggleFlag(x, y, z, flagName) {
        const tile = this.editableTile(x, y, z);
        const index = tile.flags.indexOf(flagName);

        if (index === -1) {
            tile.flags.push(flagName);
        } else {
            tile.flags.splice(index, 1);
        }

        this.markDirty(x, y, z);
        return tile.flags.slice();
    }

    // -----------------------------------------------------------------------
    // El pincel: varias casillas de una vez
    //
    // QUIÉN DECIDE QUÉ CASILLAS SON: `pincel.js`, que es geometría pura y está probado aparte.
    // Aquí sólo se le pasa el recorte al mapa y se hace lo mismo en cada casilla, y eso importa
    // porque es lo único que impide que un pincel de 4x4 pegado a la esquina del mapa escriba
    // fuera de él.
    //
    // ===================================================================
    // ESTO ANULA UNA DECISIÓN ANTERIOR, Y CONVIENE SABER LAS DOS MITADES
    // ===================================================================
    //
    // LA DECISIÓN QUE HABÍA, y su motivo, que era bueno: **el pincel era para pintar y NO para
    // borrar**. Borrar seguía siendo casilla a casilla aunque el pincel estuviera grande, porque
    // el fantasma sólo enseñaba lo que se LLEVABA EN LA MANO: al borrar no hay nada en la mano, así
    // que no había forma de ver el bloque que se iba a llevar por delante, y borrar 16 casillas de
    // un clic sin verlo es un accidente que se comete una vez y no se perdona. Pintar sí se veía:
    // ahí estaba el fantasma.
    //
    // POR QUÉ SE CAMBIA: **lo pidió el usuario**, y el usuario manda. Un pincel que pinta 3x3 y
    // borra 1x1 obliga a decidir de qué tamaño es la herramienta antes de saber qué se va a hacer
    // con ella, y borrar una habitación entera pasa a ser un trabajo de veinticinco clics.
    //
    // POR QUÉ NO SE QUEDA SÓLO EN «LO PIDIÓ EL USUARIO»: porque el motivo de la decisión anterior
    // se puede resolver, y se resuelve **dándole al borrado SU PROPIO FANTASMA**. Cuando la
    // herramienta puesta es la goma —y también mientras se mantiene el botón derecho, que borra
    // con la herramienta que sea— el ratón enseña el bloque NxN que se va a borrar, en rojo y sin
    // el dibujo del objeto dentro (`fantasma.js` decide cuál y de qué color). O sea: el accidente
    // que se quería evitar —borrar a ciegas— deja de ser posible, y con él desaparece la razón por
    // la que el borrado estaba fuera. Lo que queda es la comodidad de que las dos herramientas
    // usen el mismo cuadro.
    //
    // Y NO SE BORRA DE AQUÍ EL RAZONAMIENTO VIEJO a propósito: un comentario que dice «esto se
    // decidió así por tal motivo, y luego se cambió por tal otro» vale mucho más que uno que sólo
    // describe lo que hace el código, porque el siguiente que lea esto no sabe si la asimetría era
    // un olvido o una decisión. Era una decisión, y ya no lo es.
    // -----------------------------------------------------------------------

    /** Las casillas que toca el pincel en una planta, recortadas al mapa. */
    casillasDelCuadro(x, y, z, tamano) {
        return casillasDelPincel(x, y, tamano, (cx, cy) => this.inBounds(cx, cy, z));
    }

    /**
     * Pinta el suelo elegido en todo el cuadro del pincel.
     *
     * @returns {number} cuántas casillas se han pintado
     */
    pintarSueloEnCuadro(x, y, z, tamano, typeId) {
        const casillas = this.casillasDelCuadro(x, y, z, tamano);

        casillas.forEach((casilla) => {
            this.paintGround(casilla.x, casilla.y, z, typeId);
        });

        return casillas.length;
    }

    /**
     * Pinta el objeto elegido en todo el cuadro del pincel.
     *
     * `anadir` es la tecla Mayúsculas: añade a la pila en vez de sustituirla, igual que con una
     * sola casilla.
     *
     * @returns {number} cuántas casillas se han pintado
     */
    pintarObjetoEnCuadro(x, y, z, tamano, typeId, anadir) {
        const casillas = this.casillasDelCuadro(x, y, z, tamano);

        casillas.forEach((casilla) => {
            if (anadir) {
                this.addItem(casilla.x, casilla.y, z, typeId);
            } else {
                this.paintItem(casilla.x, casilla.y, z, typeId);
            }
        });

        return casillas.length;
    }

    /**
     * Borra el cuadro entero del pincel: las NxN casillas vuelven a su suelo por defecto.
     *
     * ES LA OPERACIÓN QUE ANULA LA DECISIÓN ANTERIOR, y el razonamiento —el de antes y el de
     * ahora— está en la cabecera de esta sección: el borrado tenía su propio fantasma desde que
     * `fantasma.js` se lo da, así que ya no se borra a ciegas y el pincel puede valer para las dos
     * cosas. Sin ese fantasma, esto sería exactamente el accidente que se quiso evitar.
     *
     * DEVUELVE CUÁNTAS CASILLAS HA BORRADO, y no es un adorno: es lo que la herramienta enseña en
     * el estado, y es la diferencia entre «se ha borrado algo» y «se han borrado nueve casillas,
     * que es lo que el bloque rojo decía».
     *
     * Se recorta al mapa con la misma regla que al pintar (`casillasDelCuadro`), así que un 3x3
     * pegado a la esquina borra las que existen y no inventa las de fuera. Borrar una casilla que
     * no tiene nada es una operación válida y sin efecto: la deja como estaba, con el suelo de su
     * planta.
     *
     * @returns {number} cuántas casillas se han borrado
     */
    borrarEnCuadro(x, y, z, tamano) {
        const casillas = this.casillasDelCuadro(x, y, z, tamano);

        casillas.forEach((casilla) => {
            this.erase(casilla.x, casilla.y, z);
        });

        return casillas.length;
    }

    // -----------------------------------------------------------------------
    // La pila de una casilla: elegir un objeto, mirarlo y moverlo de sitio
    //
    // EL ORDEN ES EL DE DIBUJO, no el del archivo. El motor ordena la pila como
    // suelo -> items de abajo -> criaturas -> items de arriba (`engine/world/tile.js`), y el
    // archivo guarda los items mezclados: un muro y una mesa pueden estar escritos en
    // cualquier orden y dibujarse siempre con la mesa encima, porque la banda de cada uno la
    // decide su bandera `alwaysOnTop`. Enseñar el orden del ARCHIVO como «posición en la pila»
    // sería enseñar un número que no es el que se ve.
    // -----------------------------------------------------------------------

    /**
     * La pila de una casilla, de abajo arriba.
     *
     * La posición 0 es el suelo, que en el formato no es un objeto de la lista sino un número de
     * la casilla —hay exactamente uno y siempre va abajo del todo—, y por eso aparece con
     * `indice: null`.
     *
     * @returns {Array<Object>} fichas con `{x, y, z, indice, id, count, definicion, nombre,
     *          banda, stackpos, orden, esSuelo}`
     */
    pilaDe(x, y, z) {
        const tile = this.tileAt(x, y, z);

        if (!tile) {
            return [];
        }

        const abajo = [];
        const arriba = [];

        tile.items.forEach((item, indice) => {
            (this.isAlwaysOnTop(item.id) ? arriba : abajo).push(indice);
        });

        const pila = [];
        let stackpos = 0;
        let orden = 0;

        if (tile.ground !== null) {
            pila.push(this._fichaDePila(tile, null, tile.ground, undefined, stackpos, 'suelo',
                null));
            stackpos += 1;
        }

        abajo.concat(arriba).forEach((indice) => {
            const item = tile.items[indice];
            const banda = this.isAlwaysOnTop(item.id) ? 'arriba' : 'abajo';

            orden += 1;
            pila.push(this._fichaDePila(tile, indice, item.id, item.count, stackpos, banda, orden));
            stackpos += 1;
        });

        return pila;
    }

    /**
     * Una ficha de la pila, con lo que hace falta para enseñarla y para elegirla.
     *
     * EL TIPO DE OBJETO LLEGA APARTE Y NO COMO UN OBJETO, y es por el suelo: en el formato el
     * suelo de una casilla es un NÚMERO (`"ground": 104`) y los objetos son entradas de una
     * lista. Confundir las dos formas es lo que hacía que el suelo saliera como «item undefined».
     */
    _fichaDePila(tile, indice, typeId, count, stackpos, banda, orden) {
        const definicion = this.definitionOf(typeId);

        return {
            x: tile.x,
            y: tile.y,
            z: tile.z,
            /** La posición en `tile.items`, o `null` si es el suelo. */
            indice: indice,
            id: Number(typeId),
            count: count,
            definicion: definicion,
            nombre: definicion ? definicion.name : 'item ' + typeId,
            banda: banda,
            /** La posición en la pila, contando el suelo: la 0 es el suelo. */
            stackpos: stackpos,
            /**
             * La posición entre los OBJETOS, sin contar el suelo, empezando en 1.
             *
             * No es lo mismo que `stackpos` y por eso se guarda aparte: una casilla sin suelo
             * propio —que existe, y es la que sólo tiene objetos— tiene su primer objeto en la
             * posición 0 de la pila y en la 1 de los objetos. El lienzo numera los objetos con
             * esta cuenta (`instanceId` en `getTile`) y es lo que permite teñir EL elegido.
             */
            orden: orden,
            esSuelo: banda === 'suelo'
        };
    }

    /**
     * Elige un objeto de la pila de una casilla.
     *
     * Sin `stackpos` se elige EL DE MÁS ARRIBA, que es el que se ve: pinchar una casilla con
     * cinco cosas apiladas tiene que coger la de encima, y las demás están en la lista del panel
     * para cuando se quiera bajar en la pila.
     */
    seleccionarObjeto(x, y, z, stackpos) {
        if (!this.inBounds(x, y, z)) {
            return fallo('la casilla (' + x + ',' + y + ',' + z + ') esta fuera del mapa');
        }

        const pila = this.pilaDe(x, y, z);

        if (pila.length === 0) {
            // Se dice lo que SÍ hay, que es el suelo por defecto de la planta: decir «no hay
            // suelo» sería mentira, y lo que se ve en esa casilla es precisamente ese suelo.
            return fallo('en (' + x + ',' + y + ',' + z + ') no hay ningun objeto que elegir: la ' +
                'casilla no tiene suelo propio ni nada puesto encima, asi que usa el suelo por ' +
                'defecto de la planta (el ' + this.defaultGroundFor(z) + ')');
        }

        const posicion = (stackpos === undefined || stackpos === null)
            ? pila[pila.length - 1].stackpos
            : Number(stackpos);

        const entrada = pila.find((ficha) => ficha.stackpos === posicion);

        if (!entrada) {
            return fallo('en (' + x + ',' + y + ',' + z + ') no hay nada en la posicion ' +
                posicion + ' de la pila: tiene ' + pila.length + ' posiciones');
        }

        this.objeto = this._referenciaDe(entrada);

        return bien({ objeto: this.objetoElegido(), pila: pila });
    }

    /**
     * A QUÉ apunta la selección: al OBJETO, no a su posición.
     *
     * Es la diferencia entre seguir a lo que se ha elegido y seguir a un número. Guardar la
     * posición parecía más simple y estaba mal: en cuanto el objeto se movía en la pila, esa
     * posición pasaba a ser de otro —o de nadie— y la selección se perdía justo después de
     * moverlo, que es cuando más falta hace que siga puesta para poder moverlo otra vez.
     *
     * El suelo no es un objeto de la lista —es un número de la casilla—, así que su referencia es
     * su tipo, y basta: hay un suelo por casilla.
     */
    _referenciaDe(ficha) {
        if (ficha.esSuelo) {
            return { x: ficha.x, y: ficha.y, z: ficha.z, esSuelo: true, id: ficha.id };
        }

        const tile = this.tileAt(ficha.x, ficha.y, ficha.z);

        return {
            x: ficha.x,
            y: ficha.y,
            z: ficha.z,
            esSuelo: false,
            item: tile.items[ficha.indice]
        };
    }

    /**
     * El objeto elegido, con su posición en la pila RECALCULADA.
     *
     * Se recalcula y no se guarda porque mover un objeto de sitio cambia la posición de los
     * demás, y porque el número que hay que enseñar es el de AHORA. Y si el objeto ya no está
     * —lo ha borrado la herramienta, o se ha pintado encima de esa casilla—, la selección se
     * suelta sola en vez de seguir hablando de algo que no existe.
     */
    objetoElegido() {
        const guardado = this.objeto;

        if (!guardado) {
            return null;
        }

        const tile = this.tileAt(guardado.x, guardado.y, guardado.z);

        if (!tile) {
            this.objeto = null;
            return null;
        }

        if (guardado.esSuelo) {
            if (tile.ground === null || Number(tile.ground) !== Number(guardado.id)) {
                this.objeto = null;
                return null;
            }

            return this.pilaDe(guardado.x, guardado.y, guardado.z)
                .find((ficha) => ficha.esSuelo) || null;
        }

        const indice = tile.items.indexOf(guardado.item);

        if (indice === -1) {
            this.objeto = null;
            return null;
        }

        return this.pilaDe(guardado.x, guardado.y, guardado.z)
            .find((ficha) => !ficha.esSuelo && ficha.indice === indice) || null;
    }

    /** Suelta el objeto elegido. */
    soltarObjeto() {
        this.objeto = null;
        return this;
    }

    /**
     * Mueve el objeto elegido una posición en la pila: +1 hacia arriba (se dibuja después) y -1
     * hacia abajo (se dibuja antes).
     *
     * CAMBIA EL ORDEN DE VERDAD, y cuando no puede, LO DICE en vez de reordenar el archivo y
     * dejar el dibujo igual. Los dos casos en que no puede son reales y tienen su motivo:
     *
     *   - El SUELO no se mueve: hay uno por casilla y va siempre abajo del todo. Para cambiar el
     *     suelo de una casilla se pinta otro encima, que es lo que hace la herramienta de suelo.
     *   - Un objeto no puede CRUZAR LA FRONTERA de las dos bandas: los que van encima de las
     *     criaturas se dibujan todos después de los que van debajo, así que intercambiar un muro
     *     con una mesa no cambiaría nada de lo que se ve. La banda la decide la bandera
     *     `alwaysOnTop` de `items.xml`, no el orden del archivo; si de verdad hay que cambiar el
     *     orden entre esas dos, lo que hay que cambiar es la bandera del objeto.
     */
    moverObjetoEnPila(direccion) {
        const elegido = this.objetoElegido();

        if (!elegido) {
            return fallo('para mover algo en la pila hay que elegirlo antes: con nada en la ' +
                'mano, pincha una casilla para elegir lo que hay en ella');
        }

        if (elegido.esSuelo) {
            return fallo('el suelo es uno por casilla y va siempre abajo del todo, asi que no ' +
                'se mueve en la pila: para cambiarlo, pinta otro suelo encima');
        }

        const pila = this.pilaDe(elegido.x, elegido.y, elegido.z);
        const posicion = pila.findIndex((ficha) => ficha.stackpos === elegido.stackpos);
        const destino = posicion + (Number(direccion) < 0 ? -1 : 1);

        if (destino < 0) {
            return fallo('"' + elegido.nombre + '" ya esta abajo del todo de la pila: lo unico ' +
                'que puede quedar debajo es el suelo');
        }

        if (destino >= pila.length) {
            return fallo('"' + elegido.nombre + '" ya esta arriba del todo de la pila');
        }

        const vecino = pila[destino];

        if (vecino.esSuelo) {
            return fallo('debajo del primer objeto de la pila esta el suelo, que no se mueve');
        }

        if (vecino.banda !== elegido.banda) {
            return fallo('"' + elegido.nombre + '" no puede pasar al otro lado de "' +
                vecino.nombre + '": los objetos que van encima de las criaturas se dibujan ' +
                'siempre despues de los que van debajo, y esa banda la decide la bandera ' +
                'alwaysOnTop del objeto en items.xml, no el orden de la pila');
        }

        const tile = this.tileAt(elegido.x, elegido.y, elegido.z);
        const suyo = tile.items[elegido.indice];

        tile.items[elegido.indice] = tile.items[vecino.indice];
        tile.items[vecino.indice] = suyo;

        this.markDirty(elegido.x, elegido.y, elegido.z);

        return bien({
            objeto: this.objetoElegido(),
            aviso: 'ahora "' + elegido.nombre + '" se dibuja ' +
                (Number(direccion) < 0 ? 'debajo de "' : 'encima de "') + vecino.nombre + '"'
        });
    }

    /**
     * Borra de la casilla el objeto elegido.
     *
     * Si lo elegido es el SUELO, la casilla vuelve al suelo por defecto de su planta —que no se
     * pierde: sigue en `defaultGround` del mapa— y si la casilla se queda sin nada, desaparece
     * del archivo. Es la misma regla que la goma de borrar.
     */
    borrarObjetoElegido() {
        const elegido = this.objetoElegido();

        if (!elegido) {
            return fallo('no hay ningun objeto elegido que borrar: con nada en la mano, pincha ' +
                'una casilla para elegir lo que hay en ella');
        }

        const tile = this.tileAt(elegido.x, elegido.y, elegido.z);

        if (elegido.esSuelo) {
            tile.ground = null;
        } else {
            tile.items.splice(elegido.indice, 1);
        }

        this.markDirty(elegido.x, elegido.y, elegido.z);
        this.objeto = null;

        // Una casilla que se queda sin suelo, sin objetos y sin banderas no dice nada: se va del
        // mapa en vez de quedarse como una entrada vacía en el archivo.
        if (this.isVoid(tile)) {
            this.tiles.delete(key(elegido.x, elegido.y, elegido.z));
        }

        return bien({
            borrado: { id: elegido.id, nombre: elegido.nombre, esSuelo: elegido.esSuelo },
            aviso: elegido.esSuelo
                ? 'la casilla vuelve al suelo por defecto de la planta (' +
                  this.defaultGroundFor(elegido.z) + ')'
                : null
        });
    }

    // -----------------------------------------------------------------------
    // Edición de respawns y NPC
    //
    // NINGUNO DE ESTOS MÉTODOS LANZA NI DEVUELVE `undefined`: todos contestan
    // `{ok, problema, aviso, ...}`. Es lo que permite que la herramienta DIGA por qué no se
    // puede hacer algo —el usuario lo pidió expresamente— en vez de no hacer nada en
    // silencio, y es lo que se puede comprobar sin abrir un navegador.
    //
    // Y LAS REGLAS QUE HACEN CUMPLIR SON LAS DEL FORMATO, no caprichos del editor: un
    // monstruo sin respawn, un monstruo fuera del área de su respawn o dos monstruos en la
    // misma casilla son cosas que el cargador del motor rechaza al leer el mapa. Rechazarlas
    // aquí convierte un mapa que no arrancaría en un mensaje.
    // -----------------------------------------------------------------------

    /**
     * Pone un RESPAWN nuevo con su primer monstruo dentro.
     *
     * El área NACE CON UN MONSTRUO, y no es una limitación del editor: el formato guarda los
     * monstruos del respawn, así que un respawn vacío no se puede escribir en el archivo. Es
     * la regla que pidió el usuario —sin respawn no se pueden poner monstruos— vista desde el
     * otro lado: sin monstruo tampoco hay respawn que guardar.
     */
    ponerRespawn(x, y, z, monstruo, radio, intervalo) {
        if (!this.inBounds(x, y, z)) {
            return fallo('la casilla (' + x + ',' + y + ',' + z + ') esta fuera del mapa');
        }

        const nombre = monstruo === undefined || monstruo === null ? '' : String(monstruo).trim();
        if (nombre === '') {
            return fallo(MOTIVO_SIN_MONSTRUO);
        }

        const r = numero(radio);
        if (r === null || r < 0) {
            return fallo('el radio del respawn tiene que ser un numero de casillas igual o ' +
                'mayor que cero: ' + JSON.stringify(radio));
        }

        const i = numero(intervalo);
        if (i === null || i <= 0) {
            return fallo('el intervalo del respawn tiene que ser un numero de milisegundos ' +
                'mayor que cero: ' + JSON.stringify(intervalo));
        }

        const npc = this.npcEn(x, y, z);
        if (npc) {
            return fallo('esa casilla ya tiene al NPC "' + npc.name + '": un NPC y un respawn ' +
                'no pueden compartir casilla, porque el monstruo apareceria encima de el');
        }

        const dentro = this.respawnEn(x, y, z);
        if (dentro) {
            return fallo('esa casilla ya esta dentro del respawn de (' + dentro.x + ',' +
                dentro.y + ',' + dentro.z + ') con radio ' + dentro.radius + ': para anadir otro ' +
                'monstruo a ese respawn, pulsa con la herramienta Monstruo dentro de su area; ' +
                'para redimensionarlo, eligelo y cambia su radio');
        }

        const area = {
            x: x,
            y: y,
            z: z,
            radius: Math.trunc(r),
            interval: Math.trunc(i),
            monsters: [{ name: nombre, x: x, y: y, interval: Math.trunc(i) }]
        };

        this.spawns.push(area);
        this.spawnsSucios = true;
        this.seleccion = { tipo: 'respawn', clave: claveDeRespawn(area) };

        return bien({ respawn: area });
    }

    /**
     * Añade un monstruo a un respawn que ya existe, en la casilla que se le diga.
     *
     * LA CASILLA TIENE QUE ESTAR DENTRO DEL ÁREA, y si no lo está no se hace nada y se dice
     * por qué. Es la regla que pidió el usuario: un monstruo no existe fuera de un respawn.
     */
    anadirMonstruo(x, y, z, monstruo, intervalo) {
        if (!this.inBounds(x, y, z)) {
            return fallo('la casilla (' + x + ',' + y + ',' + z + ') esta fuera del mapa');
        }

        const nombre = monstruo === undefined || monstruo === null ? '' : String(monstruo).trim();
        if (nombre === '') {
            return fallo(MOTIVO_SIN_MONSTRUO);
        }

        const area = this.respawnEn(x, y, z);
        if (!area) {
            return fallo(MOTIVO_MONSTRUO_FUERA);
        }

        const npc = this.npcEn(x, y, z);
        if (npc) {
            return fallo('esa casilla ya tiene al NPC "' + npc.name + '": el monstruo ' +
                'apareceria encima de el');
        }

        const ocupada = indiceDeMonstruoEn(area, x, y);
        if (ocupada !== -1) {
            return fallo('esa casilla ya tiene al monstruo "' + area.monsters[ocupada].name +
                '" de este respawn: dos monstruos en la misma casilla se pisarian');
        }

        const i = numero(intervalo);
        const intervaloDelArea = i === null || i <= 0 ? area.interval : Math.trunc(i);

        area.monsters.push({ name: nombre, x: x, y: y, interval: intervaloDelArea });
        this.spawnsSucios = true;
        this.seleccion = {
            tipo: 'monstruo',
            clave: claveDeRespawn(area),
            posicion: area.monsters.length - 1
        };

        return bien({ respawn: area, posicion: area.monsters.length - 1 });
    }

    /**
     * Mueve el monstruo elegido a otra casilla DE SU RESPAWN.
     *
     * Mover y no borrar-y-poner porque la casilla de un monstruo es lo que decide dónde
     * aparece y a dónde vuelve cuando se aleja (mira `engine/world/ai.js`): cambiarla es un
     * dato, no un monstruo nuevo.
     */
    moverMonstruo(x, y, z) {
        const elegido = this.marcadorElegido();

        if (!elegido || elegido.tipo !== 'monstruo') {
            return fallo('para mover un monstruo hay que elegirlo antes: pincha en el o ' +
                'en su fila de la lista del respawn');
        }

        const area = elegido.respawn;
        const problema = this._problemaDeCasillaDeMonstruo(area, elegido.posicion, x, y, z);

        if (problema) {
            return fallo(problema);
        }

        elegido.monstruo.x = x;
        elegido.monstruo.y = y;
        this.spawnsSucios = true;

        return bien({ respawn: area, posicion: elegido.posicion });
    }

    /**
     * Por qué NO se puede poner un monstruo de un respawn en una casilla, o `null` si sí.
     *
     * ESTÁ APARTE PORQUE HAY DOS CAMINOS QUE TIENEN QUE COMPROBAR LO MISMO: mover un monstruo con
     * la herramienta Monstruo (`moverMonstruo`, que pulsa y coloca) y ARRASTRARLO con el ratón
     * (`arrastrarA`, que lo lleva en vivo por todas las casillas del camino). Si cada uno tuviera
     * su copia de las reglas, arrastrar podría meter un monstruo donde pulsar no deja, y el mapa
     * que el editor acepta al arrastrar lo rechazaría el cargador del motor.
     *
     * `posicion` es la del monstruo que se mueve: su propia casilla no cuenta como ocupada, que es
     * lo que permite moverlo a la casilla en la que ya está sin que se estorbe a sí mismo.
     */
    _problemaDeCasillaDeMonstruo(area, posicion, x, y, z) {
        if (!this.inBounds(x, y, z)) {
            return 'la casilla (' + x + ',' + y + ',' + z + ') esta fuera del mapa';
        }
        if (z !== area.z) {
            return 'un respawn vive en una sola planta: este esta en la planta ' + area.z;
        }
        if (!dentroDelArea(area, x, y)) {
            return MOTIVO_MONSTRUO_FUERA + '  (el respawn de (' + area.x + ',' + area.y +
                ') con radio ' + area.radius + ' llega de (' + (area.x - area.radius) + ',' +
                (area.y - area.radius) + ') a (' + (area.x + area.radius) + ',' +
                (area.y + area.radius) + '))';
        }

        const npc = this.npcEn(x, y, z);
        if (npc) {
            return 'esa casilla ya tiene al NPC "' + npc.name + '"';
        }

        const ocupada = indiceDeMonstruoEn(area, x, y);
        if (ocupada !== -1 && ocupada !== posicion) {
            return 'esa casilla ya tiene al monstruo "' + area.monsters[ocupada].name +
                '" del mismo respawn';
        }

        return null;
    }

    /** Quita un monstruo de un respawn. Si se queda sin ninguno, el respawn desaparece. */
    quitarMonstruo(clave, posicion) {
        const area = this.spawns.find((candidata) => claveDeRespawn(candidata) === clave);

        if (!area) {
            return fallo('ese respawn ya no existe');
        }
        if (!area.monsters[posicion]) {
            return fallo('ese monstruo ya no esta en el respawn');
        }

        const quitado = area.monsters.splice(posicion, 1)[0];
        this.spawnsSucios = true;
        this.seleccion = null;

        // Un respawn sin monstruos no se puede escribir en el archivo, así que se va con el
        // último monstruo. Decirlo importa: borrar una rata no debería borrar el área sin
        // avisar.
        if (area.monsters.length === 0) {
            this.spawns = this.spawns.filter((candidata) => candidata !== area);
            return bien({
                quitado: quitado,
                respawnBorrado: true,
                aviso: 'se ha borrado tambien el respawn: se quedaba sin monstruos, y un ' +
                    'respawn sin monstruos no se puede guardar'
            });
        }

        return bien({ quitado: quitado, respawnBorrado: false, respawn: area });
    }

    /** Cambia el monstruo de una casilla del respawn por otro de la lista. */
    cambiarMonstruo(clave, posicion, monstruo) {
        const nombre = monstruo === undefined || monstruo === null ? '' : String(monstruo).trim();

        if (nombre === '') {
            return fallo(MOTIVO_SIN_MONSTRUO);
        }

        const area = this.spawns.find((candidata) => claveDeRespawn(candidata) === clave);

        if (!area || !area.monsters[posicion]) {
            return fallo('ese monstruo ya no esta en el respawn');
        }

        const antes = area.monsters[posicion].name;
        area.monsters[posicion].name = nombre;
        this.spawnsSucios = true;

        return bien({ respawn: area, posicion: posicion, antes: antes });
    }

    /**
     * Cambia el intervalo de reaparición de un respawn entero.
     *
     * El formato permite un intervalo POR MONSTRUO (es el `spawntime` de Tibia) y el editor
     * los mantiene todos iguales porque el respawn es la unidad con la que se trabaja: un
     * respawn con tres ratas que vuelven a ritmos distintos es una pregunta que nadie se hace
     * al colocar el respawn.
     */
    cambiarIntervaloDeRespawn(clave, intervalo) {
        const i = numero(intervalo);

        if (i === null || i <= 0) {
            return fallo('el intervalo tiene que ser un numero de milisegundos mayor que cero: ' +
                JSON.stringify(intervalo));
        }

        const area = this.spawns.find((candidata) => claveDeRespawn(candidata) === clave);

        if (!area) {
            return fallo('ese respawn ya no existe');
        }

        area.interval = Math.trunc(i);
        area.monsters.forEach((monstruo) => {
            monstruo.interval = area.interval;
        });
        this.spawnsSucios = true;

        return bien({ respawn: area });
    }

    /**
     * REDIMENSIONA el área de un respawn. Es la operación que pidió el usuario.
     *
     * Se niega si algún monstruo se quedaría fuera, y esa negativa es lo que hace que el área
     * sea de verdad un límite: encogerla por encima de un monstruo produciría un mapa que el
     * cargador rechaza —un monstruo fuera de su respawn— y el fallo aparecería al guardar, en
     * otro sitio y más tarde.
     */
    cambiarRadioDeRespawn(clave, radio) {
        const r = numero(radio);

        if (r === null || r < 0) {
            return fallo('el radio tiene que ser un numero de casillas igual o mayor que cero: ' +
                JSON.stringify(radio));
        }

        const area = this.spawns.find((candidata) => claveDeRespawn(candidata) === clave);

        if (!area) {
            return fallo('ese respawn ya no existe');
        }

        const nuevo = Math.trunc(r);

        if (nuevo === area.radius) {
            return bien({ respawn: area, cambiado: false });
        }

        const fuera = area.monsters.filter((monstruo) =>
            monstruo.x !== null && monstruo.x !== undefined &&
            (Math.abs(monstruo.x - area.x) > nuevo || Math.abs(monstruo.y - area.y) > nuevo));

        if (fuera.length > 0) {
            return fallo('no se puede poner el radio a ' + nuevo + ': ' +
                (fuera.length === 1 ? 'el monstruo "' + fuera[0].name + '"' : 'los monstruos ' +
                    fuera.map((monstruo) => '"' + monstruo.name + '"').join(', ')) +
                (fuera.length === 1 ? ' se quedaria' : ' se quedarian') +
                ' fuera del respawn. Muevelos dentro del area nueva o quitalos antes');
        }

        area.radius = nuevo;
        this.spawnsSucios = true;

        // La clave de un respawn incluye su radio, así que al redimensionarlo cambia: hay que
        // recolocar la selección o se perdería sola.
        this.seleccion = { tipo: 'respawn', clave: claveDeRespawn(area) };

        const dentro = this.npcs.filter((npc) =>
            npc.z === area.z && dentroDelArea(area, npc.x, npc.y));

        return bien({
            respawn: area,
            cambiado: true,
            aviso: dentro.length > 0
                ? 'el NPC "' + dentro[0].name + '" queda dentro del respawn; dentro de un ' +
                  'respawn se ponen monstruos, asi que revisa que sea lo que quieres'
                : null
        });
    }

    /** Borra un respawn entero, con todos sus monstruos. */
    quitarRespawn(clave) {
        const area = this.spawns.find((candidata) => claveDeRespawn(candidata) === clave);

        if (!area) {
            return fallo('ese respawn ya no existe');
        }

        const monstruos = area.monsters.length;
        this.spawns = this.spawns.filter((candidata) => candidata !== area);
        this.spawnsSucios = true;
        this.seleccion = null;

        return bien({ monstruos: monstruos });
    }

    /**
     * Coloca un NPC.
     *
     * `radio` vacío (`''`, `undefined` o `null`) significa «manda `npcs.xml`», que es lo que
     * quiere casi todo el mundo; un número manda sobre el XML.
     *
     * Un NPC DENTRO de un respawn se permite con aviso, y es una decisión: el motor admite las
     * dos criaturas en el mismo sitio y el formato lo puede escribir, así que prohibirlo sería
     * inventarse una regla. Lo que sí se prohíbe es compartir CASILLA con un monstruo, porque
     * entonces uno se dibujaría encima del otro sin que nadie lo haya decidido.
     */
    ponerNpc(x, y, z, nombre, radio) {
        if (!this.inBounds(x, y, z)) {
            return fallo('la casilla (' + x + ',' + y + ',' + z + ') esta fuera del mapa');
        }

        const limpio = nombre === undefined || nombre === null ? '' : String(nombre).trim();
        if (limpio === '') {
            return fallo('un NPC necesita el nombre de uno de los definidos en ' +
                'data/npc/npcs.xml');
        }

        if (this.npcEn(x, y, z)) {
            return fallo('esa casilla ya tiene un NPC: dos NPC en la misma casilla se ' +
                'pisarian. Borra el que hay o elige otra casilla');
        }

        const monstruo = this.monstruoEn(x, y, z);
        if (monstruo) {
            return fallo('esa casilla ya tiene al monstruo "' + monstruo.monstruo.name +
                '" del respawn de (' + monstruo.respawn.x + ',' + monstruo.respawn.y + '): el ' +
                'NPC se pondria encima de el');
        }

        let paseo = null;

        if (radio !== undefined && radio !== null && radio !== '') {
            const r = numero(radio);
            if (r === null || r < 0) {
                return fallo('el radio de paseo del NPC tiene que ser un numero de casillas ' +
                    'igual o mayor que cero, o quedar vacio para que mande npcs.xml: ' +
                    JSON.stringify(radio));
            }
            paseo = Math.trunc(r);
        }

        const npc = { x: x, y: y, z: z, name: limpio, radius: paseo };
        this.npcs.push(npc);
        this.npcsSucios = true;
        this.seleccion = { tipo: 'npc', clave: npc.x + ',' + npc.y + ',' + npc.z };

        const area = this.respawnEn(x, y, z);

        return bien({
            npc: npc,
            aviso: area
                ? 'el NPC queda DENTRO del respawn de (' + area.x + ',' + area.y + '): dentro ' +
                  'de un respawn se ponen monstruos, pero el motor admite las dos cosas'
                : null
        });
    }

    /**
     * Cambia el nombre o el radio de paseo de un NPC ya colocado.
     *
     * Mover un NPC NO se hace aquí: mover es borrar y volver a poner, y eso deja claro que su
     * casilla es su identidad. El diálogo no depende de la casilla, así que no se pierde nada.
     */
    cambiarNpc(clave, cambios) {
        const npc = this.npcs.find((candidato) =>
            candidato.x + ',' + candidato.y + ',' + candidato.z === clave);

        if (!npc) {
            return fallo('ese NPC ya no esta en el mapa');
        }

        const opciones = cambios || {};

        if (opciones.name !== undefined) {
            const limpio = String(opciones.name).trim();
            if (limpio === '') {
                return fallo('un NPC necesita el nombre de uno de los definidos en ' +
                    'data/npc/npcs.xml');
            }
            npc.name = limpio;
        }

        if (opciones.radius !== undefined) {
            if (opciones.radius === null || opciones.radius === '') {
                // Vacío es «manda npcs.xml», que es distinto de cero.
                npc.radius = null;
            } else {
                const r = numero(opciones.radius);
                if (r === null || r < 0) {
                    return fallo('el radio de paseo del NPC tiene que ser un numero de ' +
                        'casillas igual o mayor que cero, o quedar vacio: ' +
                        JSON.stringify(opciones.radius));
                }
                npc.radius = Math.trunc(r);
            }
        }

        this.npcsSucios = true;

        return bien({ npc: npc });
    }

    /** Quita un NPC colocado. */
    quitarNpc(clave) {
        const indice = this.npcs.findIndex((candidato) =>
            candidato.x + ',' + candidato.y + ',' + candidato.z === clave);

        if (indice === -1) {
            return fallo('ese NPC ya no esta en el mapa');
        }

        const quitado = this.npcs.splice(indice, 1)[0];
        this.npcsSucios = true;
        this.seleccion = null;

        return bien({ npc: quitado });
    }

    /**
     * Elige lo que hay en una casilla: el monstruo, el NPC, el respawn o la zona protegida.
     *
     * EN ESE ORDEN, y el orden importa: si una casilla tiene un monstruo y está dentro de un
     * área, lo que se quiere tocar al pincharla es el monstruo, no el área entera. El área se
     * elige pinchando en cualquier otra casilla suya.
     *
     * ENTRE UN RESPAWN Y UNA ZONA PROTEGIDA QUE CUBREN LA MISMA CASILLA GANA LA MÁS PEQUEÑA, y es
     * el mismo criterio que ya usa `respawnQueCubre` entre dos áreas solapadas: lo pequeño es lo
     * concreto. Pasa de verdad —el usuario puso el ejemplo de una casilla protegida dentro de un
     * respawn— y con la regla del tamaño se agarra lo que se está mirando: si la zona es un templo
     * de 60 casillas dentro de un área de 49, se agarra el área; si la zona es una casilla suelta
     * dentro de un área grande, se agarra la zona. Cualquiera de las dos se puede seguir eligiendo
     * desde el panel en cuanto se tiene.
     */
    seleccionar(x, y, z) {
        const monstruo = this.monstruoEn(x, y, z);

        if (monstruo) {
            this.seleccion = {
                tipo: 'monstruo',
                clave: claveDeRespawn(monstruo.respawn),
                posicion: monstruo.posicion
            };
            return bien({ marcador: this.marcadorElegido() });
        }

        const npc = this.npcEn(x, y, z);

        if (npc) {
            this.seleccion = { tipo: 'npc', clave: npc.x + ',' + npc.y + ',' + npc.z };
            return bien({ marcador: this.marcadorElegido() });
        }

        const area = this.respawnEn(x, y, z);
        const zona = this.zonaEn(x, y, z);

        if (area && zona) {
            const casillasDelArea = (area.radius * 2 + 1) * (area.radius * 2 + 1);

            if (zona.celdas.length <= casillasDelArea) {
                this.seleccion = { tipo: 'zona', clave: claveDeZona(zona) };
                return bien({ marcador: this.marcadorElegido() });
            }
        }

        if (area) {
            this.seleccion = { tipo: 'respawn', clave: claveDeRespawn(area) };
            return bien({ marcador: this.marcadorElegido() });
        }

        if (zona) {
            this.seleccion = { tipo: 'zona', clave: claveDeZona(zona) };
            return bien({ marcador: this.marcadorElegido() });
        }

        this.seleccion = null;
        return fallo('en (' + x + ',' + y + ',' + z + ') no hay ningun respawn, ningun ' +
            'monstruo, ningun NPC ni ninguna zona protegida');
    }

    /**
     * La zona protegida a la que apunta una clave de selección, o `null`.
     *
     * La clave lleva la casilla ANCLA del bloque (`zona:x,y,z`), así que se vuelve a recorrer desde
     * ella: si esa casilla ya no lleva la bandera —la ha quitado la herramienta Bandera—, la zona
     * no existe y la selección se cae sola.
     */
    _zonaDeClave(clave) {
        const trozos = String(clave || '').split(':');
        const partes = (trozos[1] || '').split(',');

        if (partes.length !== 3) {
            return null;
        }

        return this.zonaEn(Number(partes[0]), Number(partes[1]), Number(partes[2]));
    }

    /**
     * Borra una zona protegida entera: le quita la bandera a todas sus casillas.
     *
     * NO SE LLEVA LOS OBJETOS POR DELANTE, y la asimetría con el arrastre es deliberada: mover la
     * zona es «este recinto se va allá» y por eso viaja con lo que tiene dentro, pero desproteger un
     * pueblo no puede vaciarlo. Quitar la bandera es lo que pide el botón, y lo demás se queda
     * donde está.
     *
     * Las OTRAS banderas de esas casillas tampoco se tocan: una casilla puede ser zona de
     * protección y no permitir salir a la vez, y quitar la protección no es quitar todo lo demás.
     */
    quitarZona(clave) {
        const zona = this._zonaDeClave(clave);

        if (!zona) {
            return fallo('esa zona protegida ya no existe');
        }

        zona.celdas.forEach((celda) => {
            const tile = this.tileAt(celda.x, celda.y, zona.z);

            if (!tile) {
                return;
            }

            tile.flags = tile.flags.filter((bandera) => bandera !== BANDERA_ZONA);
            this.markDirty(celda.x, celda.y, zona.z);

            if (this.isVoid(tile)) {
                this.tiles.delete(key(celda.x, celda.y, zona.z));
            }
        });

        this.seleccion = null;

        return bien({ celdas: zona.celdas.length });
    }

    /** Elige un respawn por su clave, sin pasar por el lienzo. Lo usa el panel. */
    seleccionarRespawn(clave) {
        const area = this.spawns.find((candidata) => claveDeRespawn(candidata) === clave);

        if (!area) {
            return fallo('ese respawn ya no existe');
        }

        this.seleccion = { tipo: 'respawn', clave: claveDeRespawn(area) };
        return bien({ marcador: this.marcadorElegido() });
    }

    /** Elige un monstruo concreto de un respawn, para moverlo o cambiarlo. */
    seleccionarMonstruo(clave, posicion) {
        const area = this.spawns.find((candidata) => claveDeRespawn(candidata) === clave);

        if (!area || !area.monsters[posicion]) {
            return fallo('ese monstruo ya no esta en el respawn');
        }

        this.seleccion = { tipo: 'monstruo', clave: claveDeRespawn(area), posicion: posicion };
        return bien({ marcador: this.marcadorElegido() });
    }

    /** Suelta la selección. */
    limpiarSeleccion() {
        this.seleccion = null;
        return this;
    }

    // -----------------------------------------------------------------------
    // ARRASTRAR CON EL RATÓN
    //
    // QUE SE ARRASTRA Y QUE NO, porque es la pregunta que ordena todo esto:
    //
    //   - UN RESPAWN, entero, con sus monstruos dentro. Un monstruo con casilla propia se mueve
    //     CON su área y conserva su posición relativa, que es lo que hace que arrastrar un respawn
    //     de cinco ratas no obligue a recolocar las cinco.
    //   - UN MONSTRUO suelto, dentro de su área. No se pidió, pero sale del mismo mecanismo y es
    //     la operación que antes había que hacer a pulsos con la herramienta Monstruo.
    //   - UN NPC, con su radio de paseo, que es su colocación y viaja con él.
    //   - LOS OBJETOS de encima de un bloque de casillas: uno, o los de un pincel de NxN.
    //   - EL SUELO NO SE ARRASTRA: se pinta. Un suelo es un número de la casilla, no una cosa que
    //     se pueda llevar de un sitio a otro, y moverlo dejaría las dos casillas con el suelo de
    //     su planta, que no es lo que nadie quiere al arrastrar hierba.
    //   - LAS BANDERAS TAMPOCO: se alternan con su herramienta. Son un conjunto de la casilla.
    //   - LOS WAYPOINTS TAMPOCO, y es lo único que se queda fuera por trabajo y no por diseño: un
    //     waypoint es un punto con nombre del archivo y moverlo sería escribir en `waypoints`, que
    //     el editor hoy sólo lee. Se dice aquí para que no parezca un olvido.
    //
    // LA GEOMETRÍA ES LA MISMA PARA LOS CUATRO, y por eso es un solo mecanismo: se agarra en una
    // casilla, el ratón dice a qué casilla ha ido, y la diferencia es el desplazamiento. El
    // desplazamiento se aplica SIEMPRE SOBRE LO QUE SE AGARRÓ (`arrastre.original`) y no sobre
    // dónde está ahora, que es lo que permite que el área siga al ratón sin acumular error y que
    // volver al punto de partida la deje exactamente donde estaba.
    //
    // SE MUEVE EN VIVO Y SE PUEDE VOLVER ATRÁS. Arrastrar enseña el resultado antes de soltarlo, y
    // mientras no se suelte nada está escrito en el archivo: la lista que se manda al servidor sale
    // del estado en el momento de guardar. Un arrastre que se cancela —soltar fuera del mapa, o
    // pulsar Escape— deja el mapa como estaba, y por eso `cancelarArrastre` existe y se prueba.
    //
    // LO QUE NO SE PUEDE SE DICE: cada movimiento que se rechaza contesta con su motivo, y el
    // llamante lo enseña. Ninguna casilla se rechaza en silencio.
    // -----------------------------------------------------------------------

    /** El arrastre en curso, o `null`. Lo mira `main.js` para saber si soltar es mover o pulsar. */
    arrastreEnCurso() {
        return this.arrastre;
    }

    /**
     * Agarra los OBJETOS de encima de un bloque de casillas para llevarlos a otro sitio.
     *
     * SE AGARRA LO DE MÁS ARRIBA DE CADA CASILLA, que es lo que se ve y lo que elige un clic: la
     * pila se lee en orden de dibujo, así que «lo de encima» es el último de la pila y no el
     * último del archivo (un muro escrito después de una mesa se dibuja antes, porque la banda la
     * decide `alwaysOnTop`).
     *
     * LAS CASILLAS DEL BLOQUE QUE NO TIENEN OBJETOS NO APORTAN NADA: el pincel de NxN mueve lo que
     * hay, y una casilla vacía dentro del bloque no cancela el arrastre de las demás —igual que
     * pintar un 3x3 sobre casillas distintas no se cancela porque una esté ya pintada—. Si NINGUNA
     * tiene nada, no hay arrastre y se dice.
     *
     * AL AGARRAR NO SE TOCA EL MAPA: aquí sólo se APUNTA qué objetos son los que viajan, y el
     * movimiento se hace al soltar (`_soltarObjetos`). Es la diferencia con un arrastre en vivo, y
     * tiene tres consecuencias que importan:
     *
     *   - Un clic sin movimiento —que es como se elige un objeto del mapa— no modifica NADA. Si el
     *     agarrar sacara el objeto de su casilla, un clic de ésos dejaría la casilla marcada como
     *     «sin guardar» y el contador del editor diría que hay cambios donde no los hay.
     *   - Cancelar es no hacer nada: no hay que devolver nada a ningún sitio, así que no hay forma
     *     de perder un objeto por el camino —ni por un Escape, ni por salirse de la ventana—.
     *   - Y el ratón enseña lo que va a soltar por el FANTASMA, que es el de pintar y sale de lo que
     *     se lleva en la mano, no de que el objeto haya salido del mapa.
     *
     * @param {number} x la casilla del ratón, que es la esquina del bloque
     * @param {number} y idem
     * @param {number} z la planta
     * @param {number} tamano el lado del pincel, en casillas
     */
    agarrarObjetos(x, y, z, tamano) {
        if (this.arrastre) {
            return fallo('ya se esta arrastrando algo: sueltalo antes de agarrar otra cosa');
        }
        if (!this.inBounds(x, y, z)) {
            return fallo('la casilla (' + x + ',' + y + ',' + z + ') esta fuera del mapa: ahi no ' +
                'hay ningun objeto que agarrar');
        }

        const lado = limitarTamano(tamano);
        const piezas = [];

        this.casillasDelCuadro(x, y, z, lado).forEach((casilla) => {
            const pila = this.pilaDe(casilla.x, casilla.y, z);
            const encima = pila.length > 0 && !pila[pila.length - 1].esSuelo
                ? pila[pila.length - 1]
                : null;

            if (!encima) {
                return;
            }

            const tile = this.tileAt(casilla.x, casilla.y, z);
            const item = tile.items[encima.indice];

            piezas.push({
                origenX: casilla.x,
                origenY: casilla.y,
                z: z,
                /** Su sitio dentro del bloque: es lo que hace que el bloque se mueva entero. */
                dx: casilla.x - x,
                dy: casilla.y - y,
                item: item,
                typeId: Number(item.id),
                nombre: encima.nombre
            });
        });

        if (piezas.length === 0) {
            return fallo('en (' + x + ',' + y + ',' + z + ') no hay ningun objeto que arrastrar ' +
                'con un pincel de ' + nombreDeTamano(lado) + ': esa casilla solo tiene el suelo ' +
                'de su planta, y el suelo no se arrastra —se pinta—');
        }

        const ancla = piezas.find((pieza) => pieza.dx === 0 && pieza.dy === 0) || piezas[0];

        this.arrastre = {
            clase: 'objetos',
            z: z,
            agarreX: x,
            agarreY: y,
            tamano: lado,
            piezas: piezas,
            destinoX: x,
            destinoY: y
        };

        return bien({
            clase: 'objetos',
            piezas: piezas.length,
            typeId: ancla.typeId,
            nombre: ancla.nombre,
            tamano: lado
        });
    }

    /**
     * Agarra lo que hay en una casilla para moverlo: el monstruo, el NPC, el respawn que la cubre
     * o la zona protegida a la que pertenece.
     *
     * EL ORDEN ES EL MISMO QUE AL ELEGIR (`seleccionar`), y por el mismo motivo: pinchar la casilla
     * de una rata tiene que coger la rata y no el área entera de su respawn. El área se agarra
     * pinchando en cualquier casilla suya que no tenga un monstruo.
     *
     * NO HACE FALTA ELEGIR ANTES: agarrar es elegir mientras se mueve. Es lo que hace que arrastrar
     * un respawn sea un gesto y no dos.
     *
     * LA ZONA PROTEGIDA SE AGARRA DISTINTO QUE LOS DEMÁS, y se ve en lo que guarda el arrastre: no
     * hay un objeto «zona» en el mapa al que moverle la casilla, así que lo que se guarda es una
     * COPIA de las casillas del bloque con sus banderas y sus objetos, y el movimiento se aplica al
     * soltar (mira `_moverZona`). Nada se saca del mapa al agarrarla, así que cancelar es no hacer
     * nada: el mapa nunca llega a quedarse sin la zona.
     */
    agarrarMarcador(x, y, z) {
        if (this.arrastre) {
            return fallo('ya se esta arrastrando algo: sueltalo antes de agarrar otra cosa');
        }

        const agarrado = this.seleccionar(x, y, z);

        if (!agarrado.ok) {
            return fallo('en (' + x + ',' + y + ',' + z + ') no hay ningun respawn, ningun ' +
                'monstruo, ningun NPC ni ninguna zona protegida que arrastrar');
        }

        const marcador = agarrado.marcador;
        const arrastre = {
            clase: marcador.tipo,
            z: z,
            agarreX: x,
            agarreY: y,
            movido: false,
            /** El último rechazo del movimiento, para poder decirlo al soltar. Ver `_soltarZona`. */
            problema: null
        };

        if (marcador.tipo === 'respawn') {
            // El original es el ÁREA ENTERA —centro y monstruos—, no sólo su centro: es lo que
            // permite volver a dejarla exactamente donde estaba al cancelar.
            arrastre.area = marcador.respawn;
            arrastre.original = areaDesplazada(marcador.respawn, 0, 0);
        } else if (marcador.tipo === 'monstruo') {
            arrastre.area = marcador.respawn;
            arrastre.posicion = marcador.posicion;
            arrastre.original = { x: marcador.monstruo.x, y: marcador.monstruo.y };
        } else if (marcador.tipo === 'zona') {
            arrastre.zona = marcador.zona;
            arrastre.original = { x: marcador.zona.x, y: marcador.zona.y };
            arrastre.piezas = this._fotografiaDeZona(marcador.zona);
        } else {
            arrastre.npc = marcador.npc;
            arrastre.original = { x: marcador.npc.x, y: marcador.npc.y };
        }

        this.arrastre = arrastre;

        return bien({ clase: arrastre.clase, marcador: marcador });
    }

    /**
     * La foto de un bloque protegido: qué banderas y qué objetos tiene cada una de sus casillas.
     *
     * ES UNA FOTO Y NO UN LEVANTAMIENTO: las casillas siguen en el mapa mientras se arrastra la
     * zona. Lo que se mueve al soltar es esto, y por eso la zona no desaparece de su sitio mientras
     * se busca dónde ponerla —que es lo que pasaría si el arrastre se la llevara por delante—.
     *
     * SE COPIA LA BANDERA ENTERA DE LA CASILLA, no sólo `protectionZone`: una casilla de un pueblo
     * protegido lleva también `noPvp`, y mover la protección dejando atrás lo demás sería medio
     * movimiento. Y SE COPIA EL MONTAJE DE OBJETOS COMPLETO —no sólo el de encima, como al
     * arrastrar objetos sueltos—: lo que se mueve es un recinto, y un recinto son sus muros.
     *
     * El SUELO no se copia: no se arrastra, se pinta.
     */
    _fotografiaDeZona(zona) {
        return zona.celdas.map((celda) => {
            const tile = this.tileAt(celda.x, celda.y, zona.z);

            return {
                origenX: celda.x,
                origenY: celda.y,
                dx: celda.x - zona.x,
                dy: celda.y - zona.y,
                flags: tile ? tile.flags.slice() : [BANDERA_ZONA],
                items: tile ? tile.items.slice() : []
            };
        });
    }

    /**
     * Lleva lo agarrado a una casilla. Es lo que se llama en cada movimiento del ratón.
     *
     * `original` es lo que se movió al agarrar y el desplazamiento se calcula SIEMPRE desde ahí:
     * acumularlo sobre la posición actual haría que el área se fuera quedando atrás o adelante
     * según los rechazos, y volver al punto de partida no la dejaría donde estaba.
     *
     * UN MOVIMIENTO QUE NO SE PUEDE NO MUEVE NADA y contesta con el motivo, así que el área se
     * queda en la última casilla válida mientras el ratón sigue por encima de sitios imposibles.
     * Es lo que hace que arrastrar un respawn contra el borde del mapa se parezca a empujarlo
     * contra una pared y no a que se pierda.
     */
    arrastrarA(x, y, z) {
        const arrastre = this.arrastre;

        if (!arrastre) {
            return fallo('no se esta arrastrando nada');
        }

        if (arrastre.clase === 'objetos') {
            arrastre.destinoX = x;
            arrastre.destinoY = y;

            if (!this.inBounds(x, y, z)) {
                return fallo('esa casilla esta fuera del mapa: si se suelta ahi, lo que se ' +
                    'arrastra vuelve a su sitio');
            }

            return bien({ clase: 'objetos', destino: { x: x, y: y, z: z } });
        }

        if (z !== arrastre.z) {
            return fallo('lo que se arrastra vive en la planta ' + arrastre.z + ': cambia de ' +
                'planta y estara alli');
        }

        const dx = x - arrastre.agarreX;
        const dy = y - arrastre.agarreY;

        /*
         * LA ZONA PROTEGIDA NO SE MUEVE EN VIVO, y es la única que no: se valida el destino y se
         * aplica al soltar. El motivo es que una zona no es un dato con una casilla —como un
         * respawn, un NPC o un monstruo— sino un BLOQUE de casillas con banderas y objetos dentro,
         * y moverlo en vivo obligaría a guardar lo que había en cada casilla destino para poder
         * devolverlo cuando el ratón siguiera de largo. Con un arrastre que se comete al soltar no
         * hay nada que deshacer: si el destino no vale, no se ha tocado el mapa.
         */
        if (arrastre.clase === 'zona') {
            const destinoX = arrastre.original.x + dx;
            const destinoY = arrastre.original.y + dy;
            const problema = this._problemaDeMoverZona(arrastre, destinoX, destinoY, arrastre.z);

            if (problema) {
                /*
                 * SE RECUERDA EL ÚLTIMO RECHAZO, y sólo para la zona: como no sigue al ratón, si se
                 * soltara donde no cabe y el bloque apareciera en la última casilla válida por la que
                 * pasó el ratón, el editor estaría haciendo algo que nadie ha visto. Con el respawn
                 * —que sí sigue al ratón— quedarse en la última casilla válida es lo que se está
                 * viendo, y ahí sí es la respuesta buena.
                 */
                arrastre.problema = problema;

                return fallo(problema);
            }

            arrastre.destinoX = destinoX;
            arrastre.destinoY = destinoY;
            arrastre.problema = null;
            arrastre.movido = dx !== 0 || dy !== 0;

            return bien({ clase: 'zona', movido: arrastre.movido, destino: { x: destinoX, y: destinoY } });
        }

        if (arrastre.clase === 'respawn') {
            const candidata = areaDesplazada(arrastre.original, dx, dy);
            const problema = this._problemaDeMoverArea(arrastre.area, candidata);

            if (problema) {
                return fallo(problema);
            }

            this._aplicarArea(arrastre.area, candidata);
            arrastre.movido = dx !== 0 || dy !== 0;

            return bien({ clase: 'respawn', respawn: arrastre.area, movido: arrastre.movido });
        }

        if (arrastre.clase === 'npc') {
            const destinoX = arrastre.original.x + dx;
            const destinoY = arrastre.original.y + dy;
            const problema = this._problemaDeMoverNpc(arrastre.npc, destinoX, destinoY, arrastre.z);

            if (problema) {
                return fallo(problema);
            }

            this._moverNpcA(arrastre.npc, destinoX, destinoY);
            arrastre.movido = dx !== 0 || dy !== 0;

            return bien({ clase: 'npc', npc: arrastre.npc, movido: arrastre.movido });
        }

        const destinoX = arrastre.original.x + dx;
        const destinoY = arrastre.original.y + dy;
        const problema = this._problemaDeCasillaDeMonstruo(arrastre.area, arrastre.posicion,
            destinoX, destinoY, arrastre.z);

        if (problema) {
            return fallo(problema);
        }

        arrastre.area.monsters[arrastre.posicion].x = destinoX;
        arrastre.area.monsters[arrastre.posicion].y = destinoY;
        this.spawnsSucios = true;
        arrastre.movido = dx !== 0 || dy !== 0;

        return bien({ clase: 'monstruo', respawn: arrastre.area, movido: arrastre.movido });
    }

    /**
     * Suelta lo que se arrastra. Devuelve lo que hay que contar, o el motivo por el que no se hizo.
     *
     * PARA LOS MARCADORES NO HAY NADA QUE APLICAR: se movieron en vivo, así que soltar es dar por
     * bueno lo que ya está en el mapa y contarlo. Para los OBJETOS sí hay algo que escribir —están
     * en la mano, no en el mapa— y ahí está la decisión que el usuario preguntó a propósito:
     *
     *   - SIN MAYÚSCULAS SE SUSTITUYE LA PILA de la casilla destino, que es exactamente lo que hace
     *     `paintItem` al pintar. El pincel y el arrastre son la misma operación vista desde dos
     *     sitios —poner esto aquí—, y que una sustituya y la otra añada sería una trampa: el mismo
     *     objeto en la misma casilla acabaría de dos formas distintas según cómo se haya llevado.
     *   - CON MAYÚSCULAS SE AÑADE a la pila, igual que al pintar con Mayúsculas. Es la forma de
     *     poner una moneda encima de una mesa sin llevarse la mesa.
     *
     * @param {boolean} [anadir] la tecla Mayúsculas
     */
    soltarArrastre(anadir) {
        const arrastre = this.arrastre;

        if (!arrastre) {
            return fallo('no se esta arrastrando nada');
        }

        if (arrastre.clase === 'objetos') {
            return this._soltarObjetos(arrastre, anadir);
        }

        if (arrastre.clase === 'zona') {
            return this._soltarZona(arrastre, anadir);
        }

        this.arrastre = null;

        if (!arrastre.movido) {
            return bien({
                clase: arrastre.clase,
                movido: false,
                aviso: 'no se ha movido nada: se ha soltado en la misma casilla donde se agarro'
            });
        }

        return bien({
            clase: arrastre.clase,
            movido: true,
            movidoA: this._sitioDeLoArrastrado(arrastre),
            aviso: this._avisoDeLoArrastrado(arrastre)
        });
    }

    /**
     * Cancela el arrastre y deja el mapa COMO ESTABA.
     *
     * PARA LOS OBJETOS Y PARA LA ZONA NO HAY NADA QUE DESHACER, y eso no es un olvido: los dos se
     * agarran apuntando lo que viaja y el mapa no se toca hasta que se suelta (mira `agarrarObjetos`
     * y `_fotografiaDeZona`). Así que cancelar es, literalmente, dejar de arrastrar —y no hay forma
     * de perder un objeto por salirse de la ventana a mitad de camino—.
     *
     * EL RESPAWN, EL NPC Y EL MONSTRUO sí hay que devolverlos: ésos se mueven EN VIVO, así que al
     * cancelar se les pone donde estaban —el área entera, con sus monstruos— y el mapa queda como
     * antes de agarrarlos.
     */
    cancelarArrastre() {
        const arrastre = this.arrastre;

        if (!arrastre) {
            return bien({ clase: null, cancelado: false });
        }

        this.arrastre = null;

        if (arrastre.clase === 'objetos' || arrastre.clase === 'zona') {
            // No hay nada que deshacer: ni los objetos ni la zona salieron de su sitio.
            return bien({
                clase: arrastre.clase,
                cancelado: true,
                aviso: arrastre.clase === 'zona'
                    ? 'la zona protegida se queda donde estaba'
                    : null
            });
        }

        if (arrastre.clase === 'respawn') {
            // Se deshace el desplazamiento que tenga AHORA, no el último que se intentó: si el
            // ratón acabó sobre una casilla imposible, el área se quedó en la última válida.
            const area = arrastre.area;
            const vuelta = areaDesplazada(area, arrastre.original.x - area.x,
                arrastre.original.y - area.y);

            this._aplicarArea(area, vuelta);
        } else if (arrastre.clase === 'npc') {
            this._moverNpcA(arrastre.npc, arrastre.original.x, arrastre.original.y);
        } else {
            arrastre.area.monsters[arrastre.posicion].x = arrastre.original.x;
            arrastre.area.monsters[arrastre.posicion].y = arrastre.original.y;
            this.spawnsSucios = true;
        }

        return bien({ clase: arrastre.clase, cancelado: true });
    }

    /**
     * Mueve los objetos que se llevan en la mano a su casilla destino. Es la operación que pidió el
     * usuario, y sus dos decisiones están razonadas arriba, en `soltarArrastre`.
     *
     * EN DOS PASADAS —sacar todos los orígenes y después escribir todos los destinos— y no casilla a
     * casilla, que es lo que hace que un bloque de 3x3 que se suelta una casilla más allá de donde
     * estaba no se pise a sí mismo.
     *
     * LA CASILLA BAJO EL RATÓN ES LA QUE DECIDE, y si está fuera del mapa no se mueve NADA: es lo
     * que pidió el usuario —arrastrar fuera del mapa se cancela y se dice— y es lo que distingue «lo
     * he soltado mal» de «esto ya no cabe». Con un bloque de NxN, en cambio, las casillas del bloque
     * que se salen del mapa se recortan igual que al pintar: la pieza que no cabe SE QUEDA DONDE
     * ESTABA en vez de perderse, y se dice cuántas.
     */
    _soltarObjetos(arrastre, anadir) {
        const z = arrastre.z;

        if (!this.inBounds(arrastre.destinoX, arrastre.destinoY, z)) {
            this.arrastre = null;

            return fallo('esa casilla esta fuera del mapa: no se ha movido nada, los ' +
                arrastre.piezas.length + ' objeto(s) siguen donde estaban');
        }

        const deltaX = arrastre.destinoX - arrastre.agarreX;
        const deltaY = arrastre.destinoY - arrastre.agarreY;

        /*
         * SOLTAR EN LA MISMA CASILLA NO TOCA NADA, y no es una optimización: sin esto, un arrastre
         * que empieza y termina en la misma casilla —el ratón se movió cinco píxeles y volvió— sacaría
         * los objetos de su casilla y los volvería a escribir, dejando la casilla marcada como «sin
         * guardar» sin que haya cambiado nada. El contador del editor diría que hay trabajo pendiente
         * donde no lo hay, que es la clase de mentira que hace desconfiar de un editor.
         */
        if (deltaX === 0 && deltaY === 0) {
            this.arrastre = null;

            return bien({
                clase: 'objetos',
                movidos: 0,
                devueltos: 0,
                sustituidas: 0,
                aviso: 'no se ha movido nada: se ha soltado en la misma casilla donde se agarro'
            });
        }

        const seMueven = arrastre.piezas.filter((pieza) =>
            this.inBounds(pieza.origenX + deltaX, pieza.origenY + deltaY, z));
        const devueltos = arrastre.piezas.length - seMueven.length;

        // --- 1. Los objetos salen de sus casillas ---
        seMueven.forEach((pieza) => {
            const tile = this.tileAt(pieza.origenX, pieza.origenY, z);

            if (!tile) {
                return;
            }

            // POR IDENTIDAD, no vaciando la lista: lo que sale es exactamente el objeto que se
            // agarró, y no lo que alguien haya podido poner encima mientras se arrastraba.
            tile.items = tile.items.filter((item) => item !== pieza.item);
            this.markDirty(pieza.origenX, pieza.origenY, z);

            if (this.isVoid(tile)) {
                this.tiles.delete(key(pieza.origenX, pieza.origenY, z));
            }
        });

        // --- 2. Y entran donde se ha soltado ---
        let sustituidas = 0;
        let encima = null;

        seMueven.forEach((pieza) => {
            const destinoX = pieza.origenX + deltaX;
            const destinoY = pieza.origenY + deltaY;
            const tile = this.editableTile(destinoX, destinoY, z);

            if (anadir) {
                tile.items.push(pieza.item);
            } else {
                if (tile.items.length > 0) {
                    sustituidas += 1;
                }
                // Se SUSTITUYE la pila entera, como `paintItem`: es la misma operación que pintar,
                // sólo que el objeto viene de otra casilla en vez de la paleta.
                tile.items = [pieza.item];
            }

            this.markDirty(destinoX, destinoY, z);

            if (pieza.dx === 0 && pieza.dy === 0) {
                encima = { x: destinoX, y: destinoY, item: pieza.item };
            }
        });

        this.arrastre = null;

        // Lo movido queda ELEGIDO, en su casilla nueva: es lo que se acaba de tocar y lo que el
        // panel tiene que enseñar. El objeto elegido sigue al objeto por identidad, así que
        // apuntarlo aquí es lo que hace que «Subir», «Bajar» y «Borrar» sigan funcionando después.
        this.objeto = encima
            ? { x: encima.x, y: encima.y, z: z, esSuelo: false, item: encima.item }
            : null;

        const avisos = [];

        if (anadir) {
            avisos.push('anadido a la pila de la casilla');
        } else if (sustituidas > 0) {
            avisos.push('se ha sustituido lo que habia en ' + sustituidas + ' casilla(s): Mayus ' +
                'lo anade a la pila en vez de sustituirla');
        }
        if (devueltos > 0) {
            avisos.push(devueltos + ' objeto(s) se han quedado donde estaban porque su casilla ' +
                'destino cae fuera del mapa');
        }

        return bien({
            clase: 'objetos',
            movidos: seMueven.length,
            devueltos: devueltos,
            sustituidas: sustituidas,
            aviso: 'movido(s) ' + seMueven.length + ' objeto(s) a (' + arrastre.destinoX + ',' +
                arrastre.destinoY + ',' + z + ')' +
                (avisos.length > 0 ? '  —  ' + avisos.join('; ') : '')
        });
    }

    /**
     * Por qué NO se puede llevar un área a donde dice la candidata, o `null` si sí.
     *
     * LAS REGLAS SON LAS DEL FORMATO Y LAS QUE YA APLICA EL EDITOR AL CREAR UN RESPAWN, no
     * caprichos nuevos:
     *
     *   - El CENTRO tiene que estar dentro del mapa: es lo que comprueba el cargador del motor
     *     (`spawn #N fuera del mapa`) y el API al guardar.
     *   - Los MONSTRUOS CON CASILLA también, y esto es más estricto que el cargador a propósito: un
     *     monstruo con su casilla fuera del mapa aparecería en un sitio que no existe. El
     *     desplazamiento es rígido, así que esto sólo salta cuando el monstruo ya estaba fuera
     *     antes de mover —un mapa escrito a mano—, pero la comprobación se hace igual porque es la
     *     única forma de que la promesa «ningún monstruo se queda fuera» sea verdadera.
     *   - NO SE PUEDEN ANIDAR DOS RESPAWNS: si el centro cayera dentro de otra área, se rechaza con
     *     el mismo motivo que al crear uno (`ponerRespawn`). Dos áreas que se solapan por los
     *     bordes SÍ se admiten —el motor no lo prohíbe y hay mapas que los tienen así—, pero una
     *     dentro de otra deja al motor eligiendo la más pequeña y al editor sin saber cuál se está
     *     tocando.
     *   - Un monstruo no puede acabar ENCIMA DE UN NPC: es la regla de `ponerNpc` y `moverMonstruo`.
     *     Un NPC que simplemente quede dentro del área se admite con aviso, igual que al
     *     redimensionarla.
     */
    _problemaDeMoverArea(area, candidata) {
        if (!this.inBounds(candidata.x, candidata.y, candidata.z)) {
            return 'no se puede mover ahi: el respawn se saldria del mapa, su centro caeria en (' +
                candidata.x + ',' + candidata.y + ',' + candidata.z + ')';
        }

        const fueraDelMapa = candidata.monsters.filter((monstruo) =>
            monstruo.x !== null && monstruo.x !== undefined &&
            !this.inBounds(monstruo.x, monstruo.y, candidata.z));

        if (fueraDelMapa.length > 0) {
            return 'no se puede mover ahi: ' + this._nombresDeMonstruos(fueraDelMapa) +
                ' se saldria(n) del mapa, en (' + fueraDelMapa[0].x + ',' + fueraDelMapa[0].y +
                ',' + candidata.z + '). Un monstruo con casilla propia aparece donde dice su ' +
                'casilla, y esa casilla no existe';
        }

        const dentro = this.spawns.find((otra) =>
            otra !== area && otra.z === candidata.z &&
            dentroDelArea(otra, candidata.x, candidata.y));

        if (dentro) {
            return 'no se puede mover ahi: su centro caeria dentro del respawn de (' + dentro.x +
                ',' + dentro.y + ',' + dentro.z + ') con radio ' + dentro.radius + '. Dos ' +
                'respawns anidados no se pueden leer: quedate con el borde fuera del otro, o ' +
                'mueve el respawn pequeno';
        }

        for (let indice = 0; indice < candidata.monsters.length; indice += 1) {
            const monstruo = candidata.monsters[indice];

            if (monstruo.x === null || monstruo.x === undefined) {
                continue;
            }

            const npc = this.npcEn(monstruo.x, monstruo.y, candidata.z);

            if (npc) {
                return 'no se puede mover ahi: el monstruo "' + monstruo.name + '" caeria encima ' +
                    'del NPC "' + npc.name + '", en (' + monstruo.x + ',' + monstruo.y + ')';
            }
        }

        return null;
    }

    /** Por qué NO se puede llevar un NPC a una casilla, o `null` si sí. */
    _problemaDeMoverNpc(npc, x, y, z) {
        if (!this.inBounds(x, y, z)) {
            return 'no se puede mover ahi: el NPC se saldria del mapa, en (' + x + ',' + y + ',' +
                z + ')';
        }

        const otro = this.npcEn(x, y, z);

        if (otro && otro !== npc) {
            return 'no se puede mover ahi: esa casilla ya tiene al NPC "' + otro.name +
                '", y dos NPC en la misma casilla se pisarian';
        }

        const monstruo = this.monstruoEn(x, y, z);

        if (monstruo) {
            return 'no se puede mover ahi: esa casilla ya tiene al monstruo "' +
                monstruo.monstruo.name + '" del respawn de (' + monstruo.respawn.x + ',' +
                monstruo.respawn.y + '), y el NPC se pondria encima de el';
        }

        return null;
    }

    /**
     * Por qué NO se puede llevar un BLOQUE protegido a un ancla, o `null` si sí.
     *
     * LA REGLA ES UNA Y ES LA DEL FORMATO: TODAS las casillas del bloque tienen que caer dentro del
     * mapa. La bandera vive en la casilla, así que una casilla que no existe no puede llevarla, y
     * recortar el bloque —como hace el pincel al pintar— dejaría la mitad de la zona en un sitio y
     * la otra mitad en otro, que no es lo que nadie quiere al mover un recinto.
     *
     * Y por eso el arrastre de una zona se NIEGA en vez de recortar: al pintar, recortar deja en el
     * mapa lo que cabe; al mover, recortar partiría la zona en dos.
     */
    _problemaDeMoverZona(arrastre, destinoX, destinoY, z) {
        const fuera = arrastre.piezas.filter((pieza) =>
            !this.inBounds(destinoX + pieza.dx, destinoY + pieza.dy, z));

        if (fuera.length === 0) {
            return null;
        }

        const ejemplo = fuera[0];

        return 'no se puede mover ahi: ' + fuera.length + ' casilla(s) del bloque protegido ' +
            'caerian fuera del mapa (por ejemplo (' + (destinoX + ejemplo.dx) + ',' +
            (destinoY + ejemplo.dy) + ',' + z + ')). Un bloque se mueve entero o no se mueve: ' +
            'recortarlo lo partiria en dos zonas';
    }

    /**
     * Mueve la zona protegida a donde se ha soltado: se lleva sus banderas y sus objetos.
     *
     * EN DOS PASADAS Y NO EN UNA, y es lo que hace que mover una zona sobre sí misma funcione: se
     * vacían TODAS las casillas de origen y después se escriben TODAS las de destino. Haciéndolo
     * casilla a casilla, el bloque que se solapa consigo mismo se borraría lo que acaba de escribir.
     *
     * EL SUELO NO VIAJA, sólo las banderas y los objetos: el suelo de una casilla se pinta, y mover
     * una zona un par de casillas no puede cambiar el terreno de debajo. Lo que sí viaja es todo el
     * montón de objetos de cada casilla, que es lo que hace que un recinto amurallado se mueva
     * entero.
     *
     * SIN MAYÚSCULAS EL DESTINO SE SUSTITUYE y con Mayúsculas se AÑADE, que es exactamente lo que
     * hace el pincel al pintar (`paintItem` frente a `addItem`): arrastrar y pintar son la misma
     * operación vista desde dos sitios.
     */
    _soltarZona(arrastre, anadir) {
        const z = arrastre.z;

        /*
         * SI LA ÚLTIMA CASILLA POR LA QUE PASÓ EL RATÓN NO VALE, NO SE MUEVE NADA. La zona no sigue
         * al ratón mientras se arrastra, así que dejarla en la última casilla válida sería moverla a
         * un sitio que nadie ha visto; el rechazo se recuerda en `arrastrarA` justo para esto.
         */
        if (arrastre.problema) {
            this.arrastre = null;

            return fallo(arrastre.problema + '  —  no se ha movido nada: la zona sigue donde estaba');
        }

        if (!arrastre.movido) {
            this.arrastre = null;
            return bien({
                clase: 'zona',
                movido: false,
                aviso: 'no se ha movido nada: se ha soltado en la misma casilla donde se agarro'
            });
        }

        const deltaX = arrastre.destinoX - arrastre.original.x;
        const deltaY = arrastre.destinoY - arrastre.original.y;
        const problema = this._problemaDeMoverZona(arrastre, arrastre.destinoX, arrastre.destinoY, z);

        if (problema) {
            this.arrastre = null;
            return fallo(problema);
        }

        // --- 1. El bloque sale de donde estaba ---
        arrastre.piezas.forEach((pieza) => {
            this._vaciarCasillaDeBloque(pieza, z);
        });

        // --- 2. Y entra donde se ha soltado ---
        let sustituidas = 0;

        arrastre.piezas.forEach((pieza) => {
            const x = pieza.origenX + deltaX;
            const y = pieza.origenY + deltaY;
            const tile = this.editableTile(x, y, z);

            if (anadir) {
                pieza.flags.forEach((bandera) => {
                    if (tile.flags.indexOf(bandera) === -1) {
                        tile.flags.push(bandera);
                    }
                });
                tile.items = tile.items.concat(pieza.items);
            } else {
                if (tile.flags.length > 0 || tile.items.length > 0) {
                    sustituidas += 1;
                }
                tile.flags = pieza.flags.slice();
                tile.items = pieza.items.slice();
            }

            this.markDirty(x, y, z);
        });

        this._reclavarSeleccionDeZona(arrastre.zona, arrastre.destinoX, arrastre.destinoY, z);
        this.arrastre = null;

        const cuantas = arrastre.piezas.length;

        return bien({
            clase: 'zona',
            movido: true,
            celdas: cuantas,
            sustituidas: sustituidas,
            aviso: 'zona protegida movida a (' + arrastre.destinoX + ',' + arrastre.destinoY +
                ',' + z + '): ' + cuantas + ' casilla(s) con sus banderas y sus objetos' +
                (anadir
                    ? '  —  anadida a lo que hubiera en el destino'
                    : (sustituidas > 0
                        ? '  —  se ha sustituido lo que habia en ' + sustituidas +
                          ' casilla(s): Mayus lo anade en vez de sustituir'
                        : ''))
        });
    }

    /** Saca de una casilla la bandera y los objetos de una pieza de bloque, y deja el suelo. */
    _vaciarCasillaDeBloque(pieza, z) {
        const tile = this.tileAt(pieza.origenX, pieza.origenY, z);

        if (!tile) {
            return;
        }

        tile.flags = tile.flags.filter((bandera) => pieza.flags.indexOf(bandera) === -1);
        // Los objetos se quitan POR IDENTIDAD, no vaciando la lista: así lo que se saque es
        // exactamente lo que se copió al agarrar, y nada más.
        tile.items = tile.items.filter((item) => pieza.items.indexOf(item) === -1);
        this.markDirty(pieza.origenX, pieza.origenY, z);

        if (this.isVoid(tile)) {
            this.tiles.delete(key(pieza.origenX, pieza.origenY, z));
        }
    }

    /** La selección sigue a la zona que se ha movido: su clave es su ancla, y el ancla se ha ido. */
    _reclavarSeleccionDeZona(zona, x, y, z) {
        const claveVieja = claveDeZona(zona);

        if (this.seleccion && this.seleccion.tipo === 'zona' && this.seleccion.clave === claveVieja) {
            this.seleccion = { tipo: 'zona', clave: claveDeZona({ x: x, y: y, z: z }) };
        }
    }

    /** Los nombres de una lista de monstruos, para un mensaje: `"Rat" y "Cave Rat"`. */
    _nombresDeMonstruos(monstruos) {
        const nombres = monstruos.map((monstruo) => '"' + monstruo.name + '"');

        if (nombres.length === 1) {
            return 'el monstruo ' + nombres[0];
        }

        return 'los monstruos ' + nombres.slice(0, -1).join(', ') + ' y ' +
            nombres[nombres.length - 1];
    }

    /**
     * Deja el área REAL como la candidata: centro y casillas de sus monstruos.
     *
     * SE COPIA EN VEZ DE SUSTITUIRLA porque el área es una referencia que está en `this.spawns` y
     * en la selección: cambiarla por un objeto nuevo dejaría la lista apuntando a otra cosa.
     */
    _aplicarArea(area, candidata) {
        const claveVieja = claveDeRespawn(area);

        area.x = candidata.x;
        area.y = candidata.y;

        candidata.monsters.forEach((monstruo, indice) => {
            if (!area.monsters[indice]) {
                return;
            }
            area.monsters[indice].x = monstruo.x;
            area.monsters[indice].y = monstruo.y;
        });

        this.spawnsSucios = true;
        this._reclavarSeleccionDeRespawn(claveVieja, area);
    }

    /**
     * Recoloca la selección cuando cambia la clave del respawn al que apunta.
     *
     * HACE FALTA PORQUE LA CLAVE DE UN RESPAWN ES SU CENTRO Y SU RADIO
     * (`claveDeRespawn`): al moverlo cambia, y una selección que no se recolocara se quedaría
     * apuntando a una clave que ya no existe —el panel diría «ninguno» justo mientras se arrastra—.
     * Es el mismo problema que resolvió `cambiarRadioDeRespawn` al redimensionar.
     */
    _reclavarSeleccionDeRespawn(claveVieja, area) {
        if (!this.seleccion || this.seleccion.clave !== claveVieja) {
            return;
        }

        this.seleccion = this.seleccion.tipo === 'monstruo'
            ? { tipo: 'monstruo', clave: claveDeRespawn(area), posicion: this.seleccion.posicion }
            : { tipo: 'respawn', clave: claveDeRespawn(area) };
    }

    /** Mueve la colocación de un NPC, y la deja elegida en su casilla nueva. */
    _moverNpcA(npc, x, y) {
        const claveVieja = npc.x + ',' + npc.y + ',' + npc.z;

        npc.x = x;
        npc.y = y;
        this.npcsSucios = true;

        // La clave de un NPC es su casilla, así que al moverse cambia igual que la de un respawn.
        if (this.seleccion && this.seleccion.tipo === 'npc' && this.seleccion.clave === claveVieja) {
            this.seleccion = { tipo: 'npc', clave: npc.x + ',' + npc.y + ',' + npc.z };
        }
    }

    /** Dónde ha quedado lo que se arrastraba, para contarlo. */
    _sitioDeLoArrastrado(arrastre) {
        if (arrastre.clase === 'respawn') {
            return '(' + arrastre.area.x + ',' + arrastre.area.y + ',' + arrastre.area.z + ')';
        }
        if (arrastre.clase === 'npc') {
            return '(' + arrastre.npc.x + ',' + arrastre.npc.y + ',' + arrastre.npc.z + ')';
        }

        const monstruo = arrastre.area.monsters[arrastre.posicion];

        return '(' + monstruo.x + ',' + monstruo.y + ',' + arrastre.area.z + ')';
    }

    /**
     * Lo que hay que contar al soltar un marcador.
     *
     * SE DICE CUÁNTAS COSAS SE HAN MOVIDO CON ÉL, porque es la mitad de lo que se pregunta al
     * arrastrar un área: cuántos monstruos se lleva. Y SE DICE SI UN MONSTRUO ESTABA FUERA DEL
     * ÁREA, que es lo único que el arrastre no puede arreglar: mover el área no lo mete dentro
     * —el desplazamiento es rígido—, y callarlo dejaría un mapa que el cargador rechaza sin que
     * nadie sepa por qué.
     */
    _avisoDeLoArrastrado(arrastre) {
        if (arrastre.clase === 'npc') {
            const area = this.respawnEn(arrastre.npc.x, arrastre.npc.y, arrastre.npc.z);

            return area
                ? 'el NPC queda DENTRO del respawn de (' + area.x + ',' + area.y +
                  '): dentro de un respawn se ponen monstruos, pero el motor admite las dos cosas'
                : null;
        }

        if (arrastre.clase === 'monstruo') {
            return 'el monstruo sigue dentro de su respawn: el area llega de (' +
                (arrastre.area.x - arrastre.area.radius) + ',' + (arrastre.area.y - arrastre.area.radius) +
                ') a (' + (arrastre.area.x + arrastre.area.radius) + ',' +
                (arrastre.area.y + arrastre.area.radius) + ')';
        }

        const monstruos = arrastre.area.monsters.length;
        const fuera = monstruosFueraDelArea(arrastre.area);
        const dentro = this.npcs.filter((npc) =>
            npc.z === arrastre.area.z && dentroDelArea(arrastre.area, npc.x, npc.y));

        const partes = ['el respawn se ha llevado sus ' + monstruos +
            (monstruos === 1 ? ' monstruo' : ' monstruos') +
            ', cada uno en su sitio dentro del area'];

        if (fuera.length > 0) {
            partes.push('ojo: ' + this._nombresDeMonstruos(fuera) + ' ya estaba fuera del area ' +
                'antes de moverla, y moverla no lo arregla: colocalo con la herramienta Monstruo');
        }
        if (dentro.length > 0) {
            partes.push('el NPC "' + dentro[0].name + '" queda dentro del respawn');
        }

        return partes.join('  —  ');
    }

    /**
     * Borra el tile: vuelve a ser suelo por defecto.
     *
     * Se marca como sucio aunque el tile desaparezca, porque el API necesita recibir
     * una edición VACÍA para saber que hay que borrarlo. Si no se marcara, borrar no
     * se guardaría nunca.
     */
    erase(x, y, z) {
        this.tiles.delete(key(x, y, z));
        this.markDirty(x, y, z);
    }
    /**
     * Lo que hay que mandar al servidor.
     *
     * Se mandan LAS CLAVES TOCADAS, no el mapa entero: el servidor ya tiene el mapa y
     * sólo necesita saber qué celdas cambian. Mandar los 28 tiles de un mapa pequeño
     * da igual, pero mandar los de uno de 2048x2048 en cada trazo no.
     */
    edits() {
        const edits = [];

        this.dirty.forEach((k) => {
            const parts = k.split(',');
            const x = Number(parts[0]);
            const y = Number(parts[1]);
            const z = Number(parts[2]);

            const tile = this.tiles.get(k);

            // Un tile que ya no existe es un BORRADO, y se representa con una edición
            // sin suelo, sin items y sin banderas.
            if (!tile || this.isVoid(tile)) {
                edits.push({ x: x, y: y, z: z });
                return;
            }

            const edit = { x: x, y: y, z: z };

            if (tile.ground !== null) {
                edit.ground = tile.ground;
            }
            if (tile.items.length > 0) {
                edit.items = tile.items.map((item) => ({ ...item }));
            }
            if (tile.flags.length > 0) {
                edit.flags = tile.flags.slice();
            }
            if (tile.houseId) {
                edit.houseId = tile.houseId;
            }

            edits.push(edit);
        });

        return edits;
    }

    /**
     * TODO lo que hay que mandar al servidor: las celdas tocadas y, si se han tocado, los
     * respawns y los NPC.
     *
     * LOS RESPAWNS Y LOS NPC NO VIAJAN DENTRO DE `edits()`, y es lo que evita un fallo que
     * costaría caro: `edits()` describe CÓMO DEBE QUEDAR UNA CASILLA, así que mandar un
     * respawn por ahí sería mandar una casilla sin suelo y sin objetos, y guardar un respawn
     * encima de una mesa se llevaría la mesa por delante.
     *
     * Las listas se mandan ENTERAS, no como diferencia, igual que las casillas: es el estado
     * final lo que se manda, así que aplicar lo mismo dos veces da lo mismo y el editor no
     * tiene que llevar la cuenta de lo que ya mandó.
     */
    pendiente() {
        const pendiente = { edits: this.edits() };

        if (this.spawnsSucios) {
            pendiente.spawns = this.spawnsFinales();
        }
        if (this.npcsSucios) {
            pendiente.npcs = this.npcsFinales();
        }
        if (this.compuestosSucios) {
            pendiente.composites = this.compuestosFinales();
        }
        if (this.extrasSucios) {
            pendiente.waypoints = JSON.parse(JSON.stringify(this.waypoints));
            pendiente.towns = JSON.parse(JSON.stringify(this.towns));
            pendiente.houses = JSON.parse(JSON.stringify(this.houses));
        }

        return pendiente;
    }

    /** Los respawns en la forma del archivo: áreas con sus monstruos dentro. */
    spawnsFinales() {
        return this.spawns.map((area) => ({
            x: area.x,
            y: area.y,
            z: area.z,
            radius: area.radius,
            interval: area.interval,
            monsters: area.monsters.map((monstruo) => ({
                name: monstruo.name,
                // `null` es «este monstruo vive en cualquier punto del area» y se manda tal
                // cual: el escritor del motor sabe omitir la casilla, y así un monstruo de la
                // forma antigua del formato no cambia de comportamiento al guardar.
                x: monstruo.x,
                y: monstruo.y,
                interval: monstruo.interval
            }))
        }));
    }

    /** Los NPC en la forma del archivo. */
    npcsFinales() {
        return this.npcs.map((npc) => ({
            x: npc.x,
            y: npc.y,
            z: npc.z,
            name: npc.name,
            radius: npc.radius
        }));
    }

    /** Cuántas cosas de las que no son casillas están sin guardar. */
    marcadoresPendientes() {
        return (this.spawnsSucios ? 1 : 0) + (this.npcsSucios ? 1 : 0) + (this.compuestosSucios ? 1 : 0) + (this.extrasSucios ? 1 : 0);
    }

    /**
     * Da por guardado todo lo que había pendiente.
     *
     * Se limpian TAMBIÉN los marcadores: si sólo se limpiaran las casillas, un respawn recién
     * guardado se volvería a mandar en cada guardado posterior y el estado diría «sin guardar»
     * para siempre.
     */
    clearDirty() {
        this.dirty.clear();
        this.spawnsSucios = false;
        this.npcsSucios = false;
        this.compuestosSucios = false;
        this.extrasSucios = false;
    }


    // -----------------------------------------------------------------------
    // Objetos compuestos
    //
    // COLOCAR ES EXPANDIR: las piezas de la plantilla se añaden a sus casillas (el suelo se
    // sustituye, los objetos se APILAN encima de lo que haya) y el objeto queda apuntado en
    // `compuestos`. QUITAR es lo contrario y es TOLERANTE: se quita de cada casilla la pieza que
    // coincide con la de la plantilla, y si alguien ya la quitó a mano no pasa nada.
    // -----------------------------------------------------------------------

    setPlantillas(lista) {
        this.plantillas = new Map((lista || []).map((t) => [t.id, t]));
    }

    plantillaDe(instancia) {
        return instancia ? this.plantillas.get(instancia.compuesto) || null : null;
    }

    compuestoPorUid(uid) {
        return this.compuestos.find((c) => c.uid === Number(uid)) || null;
    }

    /** Las casillas que ocupa un compuesto colocado (o que ocuparía en otra posición). */
    casillasDeCompuesto(instancia, x, y, z) {
        const plantilla = this.plantillaDe(instancia);
        if (!plantilla) {
            return [];
        }
        return expandir(plantilla, instancia.valores,
            x === undefined ? instancia.x : x,
            y === undefined ? instancia.y : y,
            z === undefined ? instancia.z : z);
    }

    /** El compuesto que ocupa una casilla: el último colocado, que es el que se ve encima. */
    compuestoEn(x, y, z) {
        for (let i = this.compuestos.length - 1; i >= 0; i -= 1) {
            const c = this.compuestos[i];
            if (this.casillasDeCompuesto(c).some((k) => k.x === x && k.y === y && k.z === z)) {
                return c;
            }
        }
        return null;
    }

    /** Los compuestos de una planta, con su recuadro: para dibujarlos en el lienzo. */
    compuestosDePlanta(z) {
        const salida = [];
        this.compuestos.forEach((c) => {
            const casillas = this.casillasDeCompuesto(c).filter((k) => k.z === z);
            if (casillas.length === 0) {
                return;
            }
            const plantilla = this.plantillaDe(c);
            salida.push({
                uid: c.uid,
                nombre: plantilla ? plantilla.nombre : c.compuesto,
                casillas: casillas,
                elegido: c.uid === this.compuestoSel
            });
        });
        return salida;
    }

    _ponerPiezas(casillas) {
        casillas.forEach((k) => {
            const tile = this.editableTile(k.x, k.y, k.z);
            if (k.suelo !== undefined) {
                tile.ground = k.suelo;
            }
            k.items.forEach((item) => tile.items.push(JSON.parse(JSON.stringify(item))));
            this.markDirty(k.x, k.y, k.z);
        });
    }

    _quitarPiezas(casillas) {
        casillas.forEach((k) => {
            const tile = this.tileAt(k.x, k.y, k.z);
            if (!tile) {
                return;
            }
            for (let i = k.items.length - 1; i >= 0; i -= 1) {
                const pieza = k.items[i];
                let j = -1;
                for (let n = tile.items.length - 1; n >= 0; n -= 1) {
                    if (tile.items[n].id === pieza.id) {
                        j = n;
                        break;
                    }
                }
                if (j >= 0) {
                    tile.items.splice(j, 1);
                }
            }
            if (k.suelo !== undefined && tile.ground === k.suelo) {
                tile.ground = null;
            }
            if (this.isVoid(tile)) {
                this.tiles.delete(key(k.x, k.y, k.z));
            }
            this.markDirty(k.x, k.y, k.z);
        });
        this.objeto = null;
    }

    _problemaDeSitio(casillas) {
        const fuera = casillas.find((k) => !this.inBounds(k.x, k.y, k.z));
        return fuera ? 'no cabe: la casilla (' + fuera.x + ',' + fuera.y + ',' + fuera.z + ') queda fuera del mapa' : null;
    }

    /**
     * Coloca un compuesto con su ANCLA en (x, y, z).
     *
     * @returns {{ok:boolean, problema?:string, instancia?:Object}}
     */
    colocarCompuesto(plantillaId, valores, x, y, z) {
        const plantilla = this.plantillas.get(plantillaId);
        if (!plantilla) {
            return fallo('no existe la plantilla «' + plantillaId + '»');
        }
        const validados = validarValores(plantilla, valores);
        if (validados.problemas.length > 0) {
            return fallo('configuración no válida: ' + validados.problemas.join('; '));
        }
        const casillas = expandir(plantilla, validados.valores, x, y, z);
        const problema = this._problemaDeSitio(casillas);
        if (problema) {
            return fallo(problema);
        }
        this._ponerPiezas(casillas);
        const uid = this.compuestos.reduce((max, c) => Math.max(max, c.uid), 0) + 1;
        const instancia = { uid, compuesto: plantillaId, x, y, z, valores: validados.valores };
        this.compuestos.push(instancia);
        this.compuestosSucios = true;
        this.compuestoSel = uid;
        return bien({ instancia, casillas: casillas.length });
    }

    /** Borra el objeto ENTERO: todas sus piezas. */
    quitarCompuesto(uid) {
        const c = this.compuestoPorUid(uid);
        if (!c) {
            return fallo('no hay ningún compuesto ' + uid);
        }
        this._quitarPiezas(this.casillasDeCompuesto(c));
        this.compuestos.splice(this.compuestos.indexOf(c), 1);
        this.compuestosSucios = true;
        if (this.compuestoSel === c.uid) {
            this.compuestoSel = null;
        }
        return bien({ instancia: c });
    }

    /** Lo mueve entero a otra casilla. Si no cabe, se queda donde estaba. */
    moverCompuesto(uid, x, y, z) {
        const c = this.compuestoPorUid(uid);
        if (!c) {
            return fallo('no hay ningún compuesto ' + uid);
        }
        const destino = this.casillasDeCompuesto(c, x, y, z);
        const problema = this._problemaDeSitio(destino);
        if (problema) {
            return fallo(problema);
        }
        this._quitarPiezas(this.casillasDeCompuesto(c));
        this._ponerPiezas(destino);
        c.x = x;
        c.y = y;
        c.z = z;
        this.compuestosSucios = true;
        return bien({ instancia: c });
    }

    /** Cambia su configuración: se quitan las piezas con la vieja y se ponen con la nueva. */
    reconfigurarCompuesto(uid, valores) {
        const c = this.compuestoPorUid(uid);
        const plantilla = this.plantillaDe(c);
        if (!c || !plantilla) {
            return fallo('no hay ningún compuesto ' + uid + ' con plantilla conocida');
        }
        const validados = validarValores(plantilla, valores);
        if (validados.problemas.length > 0) {
            return fallo('configuración no válida: ' + validados.problemas.join('; '));
        }
        this._quitarPiezas(this.casillasDeCompuesto(c));
        c.valores = validados.valores;
        this._ponerPiezas(this.casillasDeCompuesto(c));
        this.compuestosSucios = true;
        return bien({ instancia: c });
    }

    /** Lo olvida como objeto entero: las piezas se quedan como objetos sueltos. */
    descomponerCompuesto(uid) {
        const c = this.compuestoPorUid(uid);
        if (!c) {
            return fallo('no hay ningún compuesto ' + uid);
        }
        this.compuestos.splice(this.compuestos.indexOf(c), 1);
        this.compuestosSucios = true;
        if (this.compuestoSel === c.uid) {
            this.compuestoSel = null;
        }
        return bien({ instancia: c });
    }

    compuestosFinales() {
        return this.compuestos.map((c) => ({
            uid: c.uid, compuesto: c.compuesto, x: c.x, y: c.y, z: c.z, valores: c.valores
        }));
    }

    /** Las casillas de un recuadro, con lo que tienen: para capturar un compuesto. */
    casillasDelRecuadro(x1, y1, x2, y2, z) {
        const salida = [];
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) {
            for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
                const tile = this.tileAt(x, y, z);
                if (tile) {
                    salida.push({ x, y, z, ground: tile.ground, items: tile.items.map((i) => ({ ...i })) });
                }
            }
        }
        return salida;
    }

    // -----------------------------------------------------------------------
    // Propiedades del objeto elegido (el diálogo «Propiedades» de RME)
    // -----------------------------------------------------------------------

    /** El objeto del archivo que está elegido (no el suelo), o null. */
    itemElegido() {
        const ficha = this.objetoElegido();
        if (!ficha || ficha.esSuelo || !this.objeto) {
            return null;
        }
        return this.objeto.item || null;
    }

    /**
     * Cambia la cantidad y los atributos del objeto elegido: actionId, uniqueId, texto, destino
     * de teleport... Un atributo vacío se QUITA, no se guarda vacío.
     */
    cambiarPropiedades(cambios) {
        const item = this.itemElegido();
        if (!item) {
            return fallo('elige antes un objeto (no el suelo) de una casilla');
        }
        const c = cambios || {};
        if (c.count !== undefined) {
            const n = Math.max(1, Math.trunc(Number(c.count)) || 1);
            if (n === 1) {
                delete item.count;
            } else {
                item.count = n;
            }
        }
        if (c.attributes) {
            const attrs = { ...(item.attributes || {}) };
            Object.keys(c.attributes).forEach((k) => {
                const v = c.attributes[k];
                if (v === null || v === undefined || v === '') {
                    delete attrs[k];
                } else {
                    attrs[k] = v;
                }
            });
            if (Object.keys(attrs).length > 0) {
                item.attributes = attrs;
            } else {
                delete item.attributes;
            }
        }
        this.markDirty(this.objeto.x, this.objeto.y, this.objeto.z);
        return bien({ item });
    }

    stats() {
        let withItems = 0;
        let withFlags = 0;

        this.tiles.forEach((tile) => {
            if (tile.items.length > 0) {
                withItems += 1;
            }
            if (tile.flags.length > 0) {
                withFlags += 1;
            }
        });

        let monstruos = 0;
        this.spawns.forEach((area) => {
            monstruos += area.monsters.length;
        });

        return {
            explicitTiles: this.tiles.size,
            withItems: withItems,
            withFlags: withFlags,
            /** Respawns (áreas) declarados. */
            spawnAreas: this.spawns.length,
            /** Monstruos que viven en ellos: es lo que el motor coloca. */
            spawns: monstruos,
            npcs: this.npcs.length,
            composites: this.compuestos.length,
            pending: this.dirty.size + this.marcadoresPendientes(),
            cellsIfMaterialized: this.width * this.height * this.floors
        };
    }
}

export { key };
