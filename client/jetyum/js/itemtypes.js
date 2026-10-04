/**
 * LAS BANDERAS DE LOS OBJETOS, EN EL CLIENTE.
 *
 * POR QUE ESTE ARCHIVO EXISTE. Hasta ahora el cliente solo sabia QUE DIBUJO le toca a cada id:
 * recibia `[id, cantidad, instancia]` por cada objeto del suelo y una tabla de dibujos. Con eso
 * no puede saber si una moneda se puede coger y un muro no, asi que TODA la decision estaba en
 * el motor y el raton no podia distinguir una cosa de la otra.
 *
 * Esto es lo mismo que hace el cliente de Tibia con su `Tibia.dat`: el servidor manda el id y el
 * cliente ya sabe que se puede hacer con el, porque lleva una copia de las banderas. La copia la
 * genera `tools/generar-banderas.mjs` LEYENDO `data/items/items.xml`, que es el mismo archivo del
 * que las aprende el motor. No hay dos listas: hay una, copiada.
 *
 * ESTE MODULO NO DECIDE NADA DEL JUEGO. Lo unico que hace es contestar preguntas para que la
 * interfaz pueda ENSENAR lo que se puede hacer: que un objeto del suelo se puede arrastrar y que
 * un muro no, en que ranura encaja cada cosa. El movimiento lo valida el MOTOR cuando se le pide,
 * y si aqui nos equivocaramos, lo que pasaria es que el motor rechazaria el movimiento y lo diria.
 * Es la regla del proyecto: el cliente pide, el servidor decide.
 *
 * Y TOLERA QUE LA TABLA NO HAYA LLEGADO. Se carga por HTTP, asi que durante los primeros
 * fotogramas no esta. En ese rato TODA consulta contesta lo mas conservador posible -"no se puede
 * arrastrar"-, que es lo correcto: dejar arrastrar algo que a lo mejor no se puede daria un
 * rechazo del motor por cada intento, y no dejar arrastrar dura unas decimas de segundo.
 */

/** La direccion de la tabla generada (tools/generar-banderas.mjs). */
const FICHERO = '/jetyum/assets/objetos.json';

/**
 * La tabla, ya cargada, o `null` mientras no ha llegado.
 *
 * Empieza en `null` y NO en `{}` a proposito: "no ha llegado" y "ha llegado vacia" son cosas
 * distintas, y solo la primera se arregla sola esperando.
 */
let tabla = null;

/** Si ya se ha pedido el fichero, para no pedirlo dos veces. */
let pidiendo = null;

/**
 * Usa una tabla ya cargada.
 *
 * Existe para dos cosas: que `cargar` no sea el unico camino, y que las comprobaciones puedan
 * pasarle una tabla de mentira sin abrir un navegador ni un servidor.
 *
 * @param {Object} datos el contenido del fichero, o el mapa de items directamente
 */
export function usarTabla(datos) {
    const items = datos && datos.items ? datos.items : datos;
    tabla = items && typeof items === 'object' ? items : {};
    return tabla;
}

/**
 * Pide la tabla por HTTP.
 *
 * Se llama al arrancar y NO se espera: el cliente tiene que poder dibujar el mundo aunque la
 * tabla tarde. Mientras llega, las consultas contestan lo conservador (ver la cabecera).
 *
 * @param {string} [url] para poder apuntar a otro sitio en las pruebas
 * @returns {Promise<Object>} la tabla, cuando llegue
 */
export function cargar(url) {
    if (pidiendo) {
        return pidiendo;
    }

    const direccion = url || FICHERO;

    pidiendo = fetch(direccion)
        .then((respuesta) => (respuesta.ok ? respuesta.json() : null))
        .then((datos) => usarTabla(datos))
        .catch(() => {
            /*
             * Si no llega, se deja la tabla VACIA y no en null: asi las consultas ya no esperan
             * nada, y el juego sigue jugandose sin poder arrastrar. Reintentar en cada fotograma
             * un fichero que no esta seria peor que no tenerlo.
             */
            usarTabla({});
            return tabla;
        });

    return pidiendo;
}

/** ¿Ya se sabe algo de las banderas? */
export function estaCargada() {
    return tabla !== null;
}

/**
 * Las banderas de un objeto, tal y como vienen del fichero.
 *
 * Devuelve siempre un objeto: uno vacio significa "no tiene ninguna bandera de las que viajan",
 * que es lo mismo que dice el motor cuando la bandera no esta declarada.
 *
 * @param {number} id el tipo de objeto
 */
export function banderasDe(id) {
    if (!tabla) {
        return {};
    }

    const entrada = tabla[Number(id)];
    return entrada && entrada.banderas ? entrada.banderas : {};
}

/** ¿Tiene esta bandera puesta? Las que no estan declaradas no las tiene. */
export function tieneBandera(id, nombre) {
    return banderasDe(id)[nombre] === true;
}

/**
 * MOVIBLE: se puede coger del suelo. Es `pickupable` en `items.xml`, y es la bandera que decide
 * si un objeto del mapa deja arrastrarse.
 *
 * SIN TABLA CONTESTA `false`, y es la eleccion importante de este archivo: no saberlo se trata
 * como "no", porque lo contrario seria ofrecer un arrastre que el motor va a rechazar. Es la
 * misma direccion que toma el motor cuando una bandera no esta declarada.
 */
export function esMovible(id) {
    return tieneBandera(id, 'pickupable');
}

/**
 * BLOQUEANTE: no se puede pisar. Son tres banderas y NO son lo mismo -`blocksSolid` es el paso,
 * `blocksProjectile` las flechas y `blocksPathfind` el calculo de rutas-, asi que se pregunta por
 * la que interesa con `tieneBandera`; esto es el resumen para la interfaz.
 */
export function esBloqueante(id) {
    return tieneBandera(id, 'blocksSolid');
}

/** ¿Impide el paso de proyectiles? */
export function bloqueaProyectiles(id) {
    return tieneBandera(id, 'blocksProjectile');
}

/** ¿Impide que el calculo de rutas lo atraviese? */
export function bloqueaCamino(id) {
    return tieneBandera(id, 'blocksPathfind');
}

/** EQUIPABLE: declara una ranura, asi que se puede llevar puesto. */
export function esEquipable(id) {
    return ranuraDe(id) !== null;
}

/**
 * La ranura donde se pone, segun su `slotType`.
 *
 * @returns {string|null} `null` si no es equipable, que NO es un error: la mayoria de las cosas
 * no lo son.
 */
export function ranuraDe(id) {
    const banderas = banderasDe(id);
    const arma = banderas.weaponType ? String(banderas.weaponType) : null;

    // La misma regla que el motor (`slotOf`): el escudo en su mano, la munición en su ranura y
    // las demás armas en la mano del arma aunque items.xml no diga `slotType`.
    if (arma === 'shield') {
        return 'shield';
    }
    if (banderas.slotType) {
        return String(banderas.slotType);
    }
    if (arma === 'ammunition') {
        return 'ammo';
    }
    // Un `slotType` vacio no es una ranura: es un objeto que no se pone en ningun sitio.
    return arma ? 'hand' : null;
}

/**
 * ¿Encaja en esta ranura?
 *
 * Es la comprobacion que hace que el panel pueda ensenar DONDE se puede soltar algo. El motor
 * hace la misma y manda el motivo cuando no encaja.
 */
export function encajaEn(id, ranura) {
    // La ranura de la munición admite cualquier cosa que se lleve, menos un contenedor (como Tibia).
    if (String(ranura) === 'ammo') {
        return esMovible(id) && !esContenedor(id);
    }
    return ranuraDe(id) === String(ranura);
}

/** CONTENEDOR: puede llevar cosas dentro. La mochila lo es. */
export function esContenedor(id) {
    return tieneBandera(id, 'isContainer');
}

/** APILABLE: varias unidades del mismo objeto son una sola entrada. */
/**
 * Los huecos de un contenedor: su `containerSize` de items.xml, o 20 (los de una mochila) si no
 * lo dice. Es el mismo número con el que el motor decide si algo cabe.
 */
export function huecosDe(id) {
    const n = Number((banderasDe(id) || {}).containerSize);
    return n > 0 ? n : 20;
}

export function esApilable(id) {
    return tieneBandera(id, 'stackable');
}

/** ES SUELO: el que define el tile. Hay uno por casilla y va abajo del todo. */
export function esSuelo(id) {
    return tieneBandera(id, 'isGround');
}

/**
 * VA ENCIMA de las criaturas -mesas, barandillas, tejados-. Es `alwaysOnTop`, que en Tibia se
 * llama asi aunque signifique "siempre en la banda de arriba".
 */
export function vaEncima(id) {
    return tieneBandera(id, 'alwaysOnTop');
}

/** USABLE: tiene un `onUse` en el contenido. Hoy describe y no ejecuta, mira `items.xml`. */
export function esUsable(id) {
    return tieneBandera(id, 'useable');
}
