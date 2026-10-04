/**
 * El protocolo: lo único que hay entre el motor y el cliente.
 *
 * Es la frontera que hace real la separación de responsabilidades. El cliente no
 * tiene el mapa, ni los items, ni las reglas: tiene un lienzo y una lista de cosas
 * que dibujar. Todo lo que sabe del mundo se lo ha dicho el motor por aquí, y si
 * algo no viaja en un mensaje, el cliente no puede saberlo.
 *
 * POR QUÉ ESTE ARCHIVO ESTÁ EN `shared/` Y NO EN `engine/`. Porque lo usan los dos
 * lados, y tiene que ser EL MISMO archivo. Dos copias de una tabla de opcodes se
 * separan en cuanto alguien toca una, y el fallo que produce eso —un mensaje que
 * el cliente interpreta como otro distinto— es de los que se buscan durante horas.
 *
 * Es un módulo ES y funciona en los dos sitios: el navegador lo importa con
 * `import` desde `/shared/js/protocol.mjs`, y el motor lo carga con `require()`,
 * que Node admite desde la 22 siempre que el módulo no tenga `await` de nivel
 * superior. Un solo archivo, sin copia generada y sin paso de compilación.
 *
 * SOBRE LA NUMERACIÓN. Los opcodes del cliente para caminar y girar (0x64 a 0x6B)
 * son los de Tibia, porque son los que están documentados y no hay razón para
 * inventar otros. El resto son nuestros, en rangos separados por dirección para
 * que un mensaje enviado al revés se detecte solo. Y conviene decirlo claro: **el
 * transporte es JSON sobre WebSocket, no el protocolo binario de Tibia**. Copiar
 * los números no da compatibilidad; darla exigiría XTEA, el handshake RSA y el
 * formato binario exacto de cada mensaje, que es un trabajo aparte.
 *
 * SOBRE LOS NOMBRES. Cada opcode tiene nombre, y el servidor puede registrar los
 * mensajes en claro para depurar. Un protocolo numérico sin tabla de nombres es
 * imposible de depurar cuando algo no cuadra.
 */

// ---------------------------------------------------------------------------
// Servidor -> cliente
// ---------------------------------------------------------------------------

export const SERVER = {
    /**
     * Saludo inicial: `[versión, ancho, alto, plantas del mundo, ancho y alto ENVIADOS, ancho y alto
     * VISIBLES]` (los visibles son `visibleTilesX/Y` de config.js; 0 en un motor antiguo).
     */
    HELLO: 0x01,

    /** Login aceptado: los datos del jugador y su posición. */
    LOGIN_OK: 0x02,

    /** Login rechazado, con el motivo. */
    LOGIN_ERROR: 0x03,

    /**
     * Los personajes de una cuenta, para elegir con cuál entrar (la lista de Tibia):
     * `[[nombre, nivel, vocacion, enLinea], ...]`. Responde a CLIENT.CHARACTER_LIST; si la
     * cuenta o la contraseña no valen, llega LOGIN_ERROR.
     */
    CHARACTER_LIST: 0x04,

    /** Aparece un tile que el cliente no tenía. */
    TILE_ADD: 0x10,

    /** Un tile que el cliente ya tenía ha cambiado (se reemplaza entero). */
    TILE_UPDATE: 0x11,

    /** Un tile sale de la vista. */
    TILE_REMOVE: 0x12,

    /** Aparece una criatura. */
    CREATURE_ADD: 0x20,

    /**
     * Una criatura se mueve.
     *
     * Lleva la DURACIÓN del paso en milisegundos, y ese es el detalle que hace que
     * el 2.5D se sienta bien: el cliente interpola el desplazamiento durante
     * exactamente el tiempo que el motor calculó con la fórmula de Tibia. Si el
     * cliente eligiera la duración por su cuenta, el muñeco iría a un ritmo
     * distinto del que el motor considera real y el desfase se vería en cada paso.
     */
    CREATURE_MOVE: 0x21,

    /** Una criatura sale de la vista. */
    CREATURE_REMOVE: 0x22,

    /**
     * Cambia el estado visible de una criatura: su dirección y su salud.
     *
     * Van juntos en un solo mensaje porque los dos son "lo mismo": información de
     * una criatura que no es su posición. Separarlos obligaría a dos mensajes cada
     * vez que alguien recibe un golpe y se gira, que es casi siempre.
     */
    CREATURE_UPDATE: 0x23,

    /** La criatura dice algo. */
    CREATURE_SAY: 0x24,

    /** Mensaje de texto al jugador. */
    TEXT: 0x30,

    /** Las estadísticas del jugador (nivel, experiencia, salud, maná). */
    PLAYER_STATS: 0x31,

    /** El jugador ha muerto. */
    PLAYER_DEATH: 0x32,

    /**
     * El inventario entero.
     *
     * Se manda completo cada vez que cambia. Un inventario son decenas de entradas, así
     * que calcular diferencias para ahorrar eso cuesta más código del que ahorra y abre
     * la puerta a que el jugador y el motor no estén de acuerdo sobre lo que lleva.
     */
    INVENTORY: 0x33,

    /**
     * Un número que sube y se desvanece sobre una casilla: el daño (en rojo, «-29») y la
     * curación (en verde, «+10»). `[x, y, z, tipo, texto]`, con tipo 'dano' o 'cura'. Es el
     * «animated text» de Tibia (0x84 allí).
     */
    ANIMATED_TEXT: 0x36,

    /**
     * Un efecto sobre una casilla (`Game.sendMagicEffect`): `[x, y, z, efecto]`. El número es
     * el de `things.json` (`effects`); los nombres están en `shared/js/efectos.mjs`.
     */
    MAGIC_EFFECT: 0x37,

    /** Un proyectil que vuela de una casilla a otra: `[x1, y1, z1, x2, y2, z2, proyectil]`. */
    DISTANCE_EFFECT: 0x38,

    /**
     * El diario de misiones: `[[nombre, terminada, [[mision, descripcion, terminada], ...]], ...]`.
     * Responde a `CLIENT.QUEST_LOG`. Las misiones las declaran los scripts (`type: 'quest'`).
     */
    QUEST_LOG: 0x39,

    /**
     * La ventana de comercio de un NPC: `[npcId, nombreNpc, dinero, [[tipo, nombre, compra, venta,
     * cuantasTienes], ...]]`. `compra` es lo que cuesta comprárselo (0: no lo vende) y `venta` lo
     * que te da por el tuyo (0: no lo compra).
     */
    SHOP_OPEN: 0x3A,

    /** Se cierra la ventana de comercio (te alejaste o te despediste). */
    SHOP_CLOSE: 0x3B,

    /** Un mensaje privado o de grupo: `[de, texto, canal]`, canal 'privado' o 'grupo'. */
    PRIVATE_MESSAGE: 0x3C,

    /** La luz del mundo (día y noche): `[nivel 0-255, color]`. */
    WORLD_LIGHT: 0x3D,

    /** La luz que lleva el jugador (antorcha, `utevo lux`): `[radio en casillas, color]`. */
    PLAYER_LIGHT: 0x3E,

    /**
     * Las marcas de una criatura sobre su nombre: `[id, calavera, grupo]`. Calavera: '' | 'blanca'
     * | 'roja'; grupo: '' | 'lider' | 'miembro' (de TU grupo).
     */
    CREATURE_MARKS: 0x3F,

    /** Tu grupo: `[lider, [miembros]]`, o `['', []]` si no estás en ninguno. */
    PARTY: 0x42,

    /**
     * Un DIÁLOGO con texto y un botón «Aceptar», como el `popupFYI` de Tibia: `[titulo, texto]`.
     * Lo abren los scripts (`player:popupFYI(texto)`, la lista de `/spells`).
     */
    POPUP: 0x41,

    /** Cambio de planta: el cliente debe redibujar todo. */
    FLOOR_CHANGE: 0x40,

    /**
     * Se abre (o cambia) un contenedor del suelo: un cuerpo, una caja. Un objeto con
     * `{id, typeId, name, capacity, items: [{index, typeId, count, name}]}`. (En Tibia es el 0x6E.)
     */
    CONTAINER_OPEN: 0x34,

    /** Se cierra ese contenedor (te alejaste, se pudrió o se lo llevaron): `[id]`. (En Tibia, 0x6F.) */
    CONTAINER_CLOSE: 0x35,

    /**
     * La ventana del personaje (el «Set Outfit» de Tibia, 0xC8): un objeto con el aspecto
     * actual, los aspectos que puede llevar y sus datos (nivel, vocación, vida, capacidad...).
     */
    OUTFIT_WINDOW: 0xC8,

    /**
     * Latido del servidor: el instante del motor y cuántos mensajes se enviaron.
     * Sirve para que el cliente pueda medir su latencia y para saber que la
     * conexión sigue viva aunque no pase nada.
     */
    PING: 0x50
};

// ---------------------------------------------------------------------------
// Cliente -> servidor
// ---------------------------------------------------------------------------

export const CLIENT = {
    /**
     * Caminar. Los ocho opcodes son los de Tibia: 0x64 a 0x67 los cuatro pasos
     * rectos y 0x68 a 0x6B las cuatro diagonales.
     *
     * El cliente PIDE el paso; no lo da. Si el motor lo rechaza, no pasa nada y
     * no hay mensaje de vuelta, porque caminar contra una pared es normal y no un
     * error que merezca una respuesta.
     */
    /**
     * Ir andando hasta una casilla: `[x, y, z]` (el clic izquierdo en el mapa). El motor busca
     * el camino y lleva al personaje paso a paso; si no hay camino, lo dice.
     */
    WALK_TO: 0x63,

    WALK_NORTH: 0x64,
    WALK_EAST: 0x65,
    WALK_SOUTH: 0x66,
    WALK_WEST: 0x67,
    WALK_NORTH_EAST: 0x68,
    WALK_SOUTH_EAST: 0x69,
    WALK_SOUTH_WEST: 0x6A,
    WALK_NORTH_WEST: 0x6B,

    /** Girar sin moverse. */
    TURN_NORTH: 0x6C,
    TURN_EAST: 0x6D,
    TURN_SOUTH: 0x6E,
    TURN_WEST: 0x6F,

    /** Decir algo. */
    SAY: 0x96,

    /** Usar un item del suelo. */
    USE_ITEM: 0x82,

    /** Pedir la ventana del personaje (0xD2 en Tibia). */
    REQUEST_OUTFIT: 0xD2,

    /** Cambiar de aspecto: [0xD3, lookType, cabeza, cuerpo, piernas, pies, añadidos]. */
    SET_OUTFIT: 0xD3,

    /** Mirar algo. */
    LOOK: 0x8C,

    /**
     * Recoger el objeto que hay encima de una casilla.
     *
     * En Tibia esto se hace con los opcodes de mover objeto, que llevan origen, destino y
     * posición en la pila. Aquí se pide directamente "recoge de esta casilla" porque el
     * motor ya sabe cuál es el objeto de más arriba, y mandar la posición en la pila
     * obligaría al cliente a contar la misma pila que el motor para llegar a la misma
     * conclusión.
     */
    PICKUP: 0x8D,

    /** Soltar en el suelo un objeto del inventario. */
    DROP: 0x8E,

    /**
     * MOVER un objeto: del suelo a la mochila, de la mochila a una ranura, entre ranuras, o de
     * vuelta al suelo.
     *
     * ES EL MENSAJE DEL ARRASTRAR, y lleva ORIGEN Y DESTINO, que es como lo hace Tibia. Un
     * mensaje que solo dijera "pon esto en la mano" no serviria para las otras tres direcciones,
     * y uno por direccion serian cuatro mensajes que hay que mantener de acuerdo.
     *
     * Forma: `[MOVE_ITEM, origen, x, y, z, indice, destino, x, y, z, ranura]`. Los campos que no
     * usa cada caso van a 0 y se leen segun `MOVE_ITEM_FIELD`; el porque de cada uno esta alli.
     *
     * EL MOTOR VALIDA TODO y no se fia de nada de lo que llegue: que el objeto sea movible, que
     * este donde dice, que la ranura sea la que le toca por su `slotType`, que haya mochila si va
     * a la mochila y que no se mueva lo que esta en el suelo y no se puede coger. Si no se puede,
     * contesta con el motivo, y el cliente lo ensena en vez de callarse.
     *
     * NO LLEVA CANTIDAD, y es una decision y no un olvido: aqui no se parten pilas. Un campo de
     * cantidad que el motor fuera a ignorar seria un campo que miente, y el dia que se partan
     * pilas hay que anadirlo con su trozo de logica detras, no antes.
     */
    MOVE_ITEM: 0x8F,

    /**
     * Atacar a una criatura. Se queda como OBJETIVO: el jugador sigue golpeando, al ritmo de
     * su vocación (`attackSpeed`), mientras esté a su alcance.
     */
    ATTACK: 0x8A,

    /** Dejar de atacar (el botón «Stop» o Escape). Es el 0xBE de Tibia. */
    CANCEL_ATTACK: 0xBE,

    /** Coger un objeto del contenedor abierto y meterlo en la mochila: `[id, indice]`. */
    CONTAINER_TAKE: 0x7A,

    /** Cerrar la ventana del contenedor: `[id]`. Es el 0x87 de Tibia. */
    CLOSE_CONTAINER: 0x87,

    /**
     * Entrar al mundo, con credenciales.
     *
     * Lleva `[cuenta, contrasena, personaje, vocacion, sexo]`. El servidor autentica y carga
     * el personaje; si la persistencia está apagada, crea uno efímero con ese nombre,
     * que es el atajo de desarrollo. La vocación (nombre o id de `data/XML/vocations.js`) y
     * el sexo ('male' o 'female') sólo cuentan si el personaje se crea en ese momento.
     *
     * El opcode 0x0A es el de la zona de login de Tibia. El transporte sigue siendo
     * JSON sobre WebSocket: copiar el número no da compatibilidad.
     */
    LOGIN: 0x0A,

    /**
     * Crear cuenta (o un personaje nuevo en una cuenta que ya existe, con su contraseña) y
     * entrar: `[cuenta, contrasena, personaje, vocacion, sexo]`. La vocación y el sexo SÓLO se
     * eligen aquí; al entrar con LOGIN el personaje ya es lo que es.
     */
    CREATE_ACCOUNT: 0x0B,

    /** Pedir la lista de personajes de una cuenta: `[cuenta, contrasena]`. No entra al mundo. */
    CHARACTER_LIST: 0x0C,

    /**
     * USAR un objeto que llevas (en la mochila o puesto): `[indice del inventario]`. Comer, beber
     * una poción, leer... Es el `onUse` de los scripts con el objeto en tu inventario.
     */
    USE_INVENTORY: 0x83,

    /**
     * USAR un objeto que está DENTRO de un contenedor abierto (un cuerpo, una mochila tirada, el
     * depósito): `[id del contenedor, hueco]`. Clic derecho en su ventana.
     */
    USE_CONTAINER: 0x84,

    /**
     * Una HOTKEY con un objeto: `[typeId, id de la criatura]`. Usa el primero que lleves de ese tipo
     * (en la mochila o puesto) sobre esa criatura: tú mismo (una poción) o tu objetivo.
     */
    USE_HOTKEY_ITEM: 0x85,

    /**
     * MIRAR un objeto de un panel (los dos botones a la vez): `['inventory', indice]` o
     * `['container', id del contenedor, hueco]`.
     */
    LOOK_ITEM: 0x8B,

    /** Pedir el diario de misiones. */
    QUEST_LOG: 0xF0,

    /** Comprar al NPC de la ventana de comercio: `[tipo, cantidad]`. */
    SHOP_BUY: 0x7B,

    /** Venderle: `[tipo, cantidad]`. */
    SHOP_SELL: 0x7C,

    /** Cerrar la ventana de comercio. */
    SHOP_CLOSE: 0x7D,

    /** Un mensaje privado a otro jugador: `[nombre, texto]`. */
    PRIVATE_MESSAGE: 0x97,

    /** El cliente ya terminó de cargar y quiere entrar al mundo. */
    ENTER_WORLD: 0x0F,

    /** Desconexión ordenada. */
    LOGOUT: 0x14
};

/** Desplazamiento de cada opcode de caminar. */
export const WALK_OFFSETS = {
    [CLIENT.WALK_NORTH]: { x: 0, y: -1 },
    [CLIENT.WALK_EAST]: { x: 1, y: 0 },
    [CLIENT.WALK_SOUTH]: { x: 0, y: 1 },
    [CLIENT.WALK_WEST]: { x: -1, y: 0 },
    [CLIENT.WALK_NORTH_EAST]: { x: 1, y: -1 },
    [CLIENT.WALK_SOUTH_EAST]: { x: 1, y: 1 },
    [CLIENT.WALK_SOUTH_WEST]: { x: -1, y: 1 },
    [CLIENT.WALK_NORTH_WEST]: { x: -1, y: -1 }
};

/** Dirección de cada opcode de girar. */
export const TURN_DIRECTIONS = {
    [CLIENT.TURN_NORTH]: 0,
    [CLIENT.TURN_EAST]: 1,
    [CLIENT.TURN_SOUTH]: 2,
    [CLIENT.TURN_WEST]: 3
};

/**
 * El opcode de caminar que corresponde a un desplazamiento.
 *
 * Lo usa el cliente para no tener que llevar su propia tabla de teclas a opcodes,
 * que sería otra cosa que puede separarse de ésta.
 */
export const OFFSET_TO_WALK = {
    '0,-1': CLIENT.WALK_NORTH,
    '1,0': CLIENT.WALK_EAST,
    '0,1': CLIENT.WALK_SOUTH,
    '-1,0': CLIENT.WALK_WEST,
    '1,-1': CLIENT.WALK_NORTH_EAST,
    '1,1': CLIENT.WALK_SOUTH_EAST,
    '-1,1': CLIENT.WALK_SOUTH_WEST,
    '-1,-1': CLIENT.WALK_NORTH_WEST
};

/** Las cuatro direcciones, para orientar al dibujar. */
export const DIRECTION = {
    NORTH: 0,
    EAST: 1,
    SOUTH: 2,
    WEST: 3
};

// ---------------------------------------------------------------------------
// Tabla de nombres, para depurar
// ---------------------------------------------------------------------------

const NAMES = {};
Object.keys(SERVER).forEach((name) => { NAMES[SERVER[name]] = 'S:' + name; });
Object.keys(CLIENT).forEach((name) => { NAMES[CLIENT[name]] = 'C:' + name; });

export { NAMES };

/** El nombre de un opcode, para los registros. */
export function opcodeName(code) {
    return NAMES[code] || ('0x' + Number(code).toString(16));
}

/**
 * Versión del protocolo. Se comprueba en el saludo.
 *
 * v2: el inventario distingue lo que esta PUESTO de lo que va DENTRO del contenedor -la ranura
 *     `inside`-, y hay un mensaje para mover objetos -`MOVE_ITEM`-. Las dos cosas cambian lo que
 *     significan los mensajes que ya existian, que es justo lo que una version tiene que decir.
 */
export const PROTOCOL_VERSION = 2;

// ---------------------------------------------------------------------------
// Constructores de mensajes
// ---------------------------------------------------------------------------

/**
 * Los mensajes son arrays `[opcode, ...datos]` y no objetos con nombres.
 *
 * Un array gasta bastante menos que `{"opcode":16,"x":100,...}`, y en un juego
 * donde el mapa se reenvía al caminar eso se nota. El precio es que hay que mirar
 * la tabla para saber qué es cada posición, y por eso la tabla existe y por eso el
 * servidor puede registrar los mensajes en claro.
 */
export function message(opcode, ...payload) {
    return [opcode, ...payload];
}

/**
 * Describe un tile para el cliente.
 *
 * Formato: `[suelo, cuantosAbajo, cuantosTotal, ...items]`, y cada item es
 * `[id, cantidad, instancia]`.
 *
 * EL CORTE ENTRE ABAJO Y ARRIBA VIAJA EXPLÍCITAMENTE, y no es un detalle: el
 * cliente tiene que dibujar a las criaturas ENTRE los dos grupos, porque las
 * mesas y las barandillas van por encima de los jugadores y las alfombras por
 * debajo. Sin ese número, el cliente recibe una lista plana de items y no puede
 * saber dónde meter al muñeco.
 *
 * Se descubrió al escribir el renderer, no al escribir el protocolo: es la clase
 * de dato que sólo se echa en falta cuando alguien lo consume.
 *
 * El ORDEN de `items` es el de DIBUJO, así que el cliente los pinta en el orden en
 * que llegan y no necesita saber nada de bandas de apilado más allá del corte.
 */
export function describeTile(tile, ground) {
    const items = [];

    const groundId = tile && tile.ground ? tile.ground.typeId
        : (ground ? ground.typeId : 0);

    let downCount = 0;

    if (tile) {
        tile.downItems.forEach((item) => {
            items.push([item.typeId, item.count, item.instanceId || 0]);
        });
        downCount = items.length;

        tile.topItems.forEach((item) => {
            items.push([item.typeId, item.count, item.instanceId || 0]);
        });
    }

    return [groundId, downCount, items.length].concat(
        items.reduce((flat, entry) => flat.concat(entry), [])
    );
}

/**
 * Los canales del habla.
 *
 * Son números porque viajan en el protocolo y porque el motor los pasa a los
 * `onSay` de los talkactions, que es la firma de TFS. El 1, 2 y 3 son los suyos.
 */
export const TALKTYPE = {
    SAY: 1,
    WHISPER: 2,
    YELL: 3
};

/**
 * Los índices de cada campo dentro de un mensaje.
 *
 * LOS MENSAJES SON ARRAYS, y por eso cada campo tiene una POSICIÓN. Usar números
 * sueltos por el código funciona hasta que alguien añade un campo en medio: entonces
 * todo lo que venía detrás se desplaza y el cliente lee la posición como si fuera el
 * nombre, sin que nada avise. Con estos nombres, añadir un campo es cambiar la tabla y
 * los sitios que lo usan.
 *
 * OJO CON EL CERO: la posición 0 es SIEMPRE el opcode, así que los campos empiezan en
 * 1. Es la trampa de estas tablas y ya se cayó en ella una vez: los índices de criatura
 * se escribieron empezando en 0 y todo quedó desplazado uno, de modo que el cliente leía
 * el nombre donde estaba el identificador. Por eso hay una prueba que compara esta tabla
 * con lo que produce `describeCreature`, en vez de confiar en que estén de acuerdo.
 */
export const CREATURE_FIELD = {
    ID: 1,
    LOOK_TYPE: 2,
    HEAD: 3,
    BODY: 4,
    LEGS: 5,
    FEET: 6,
    ADDONS: 7,
    NAME: 8,
    X: 9,
    Y: 10,
    Z: 11,
    DIRECTION: 12,
    HEALTH: 13,
    KIND: 14
};

export const TILE_FIELD = {
    X: 1,
    Y: 2,
    Z: 3,
    GROUND: 4,
    DOWN_COUNT: 5,
    ITEM_COUNT: 6,
    /** Donde empiezan los items; cada uno ocupa tres posiciones. */
    ITEMS: 7,
    ITEM_STRIDE: 3
};

export const MOVE_FIELD = {
    ID: 1,
    FROM_X: 2, FROM_Y: 3, FROM_Z: 4,
    TO_X: 5, TO_Y: 6, TO_Z: 7,
    DIRECTION: 8,
    DURATION: 9
};

/**
 * De donde SALE un objeto que se mueve.
 *
 * Son dos sitios y no tres: un objeto del inventario se identifica por su INDICE, que ya dice si
 * esta puesto o dentro de la mochila -para eso viaja la ranura en el inventario-. Pedir ademas el
 * sitio seria mandar dos veces el mismo dato, y dos datos que dicen lo mismo acaban discrepando.
 */
export const MOVE_FROM = {
    /** De la casilla del suelo que se indica. */
    GROUND: 'ground',
    /** de la entrada del inventario que se indica. */
    INVENTORY: 'inventory',
    /** De DENTRO de un contenedor del suelo abierto (el botín de un cuerpo): `FROM_ID` y `FROM_INDEX`. */
    CONTAINER: 'container'
};

/**
 * A donde VA.
 *
 * Aqui si son tres, porque son tres sitios DISTINTOS y no se pueden deducir uno de otro: una
 * ranura de equipo, dentro de la mochila, o el suelo. "Dentro de la mochila" no es una ranura mas:
 * es donde van las cosas que llevas sin ponerte, y por eso necesita mochila y una ranura no.
 */
export const MOVE_TO = {
    /** A una casilla del suelo. */
    GROUND: 'ground',
    /** A una ranura de EQUIPO, por su nombre (`hand`, `head`, `ring`...). */
    SLOT: 'slot',
    /** Dentro del contenedor -la mochila-. */
    CONTAINER: 'container',
    /**
     * Dentro de un contenedor DEL SUELO (una mochila tirada, un cuerpo): el de `TO_ID`. Es lo que
     * pasa al soltar algo en su ventana abierta. Soltarlo encima de él en el mapa llega como
     * `GROUND` y el motor ve que arriba hay un contenedor y lo mete dentro, como en Tibia.
     */
    GROUND_CONTAINER: 'groundContainer'
};

/**
 * Los indices de cada campo del mensaje de mover objeto.
 *
 * Se respeta la forma de Tibia -origen con su posicion y destino con la suya- y por eso los dos
 * bloques van en el mismo orden: quien haya leido el de Tibia reconoce este. El indice de la
 * posicion 0 es SIEMPRE el opcode, asi que los campos empiezan en 1, como en todas las tablas de
 * este archivo.
 *
 * LOS CAMPOS QUE NO USA UN CASO VAN A CERO, y se leen segun `FROM_KIND`/`TO_KIND`. La alternativa
 * -mensajes distintos por direccion- serian cuatro formas que hay que mantener de acuerdo, y el
 * fallo de tenerlas desacuerdo es un objeto que se mueve a donde no debe.
 */
export const MOVE_ITEM_FIELD = {
    /** `MOVE_FROM.GROUND` o `MOVE_FROM.INVENTORY`. */
    FROM_KIND: 1,
    /** La casilla de origen, cuando el origen es el suelo. */
    FROM_X: 2,
    FROM_Y: 3,
    FROM_Z: 4,
    /** La entrada del inventario, cuando el origen es el inventario. */
    FROM_INDEX: 5,
    /** `MOVE_TO.GROUND`, `MOVE_TO.SLOT` o `MOVE_TO.CONTAINER`. */
    TO_KIND: 6,
    /** La casilla de destino, cuando el destino es el suelo. */
    TO_X: 7,
    TO_Y: 8,
    TO_Z: 9,
    /** La ranura de destino, cuando el destino es una ranura de equipo. */
    TO_SLOT: 10,
    /** La instancia del contenedor del suelo, cuando `FROM_KIND` es `MOVE_FROM.CONTAINER`. */
    FROM_ID: 11,
    /** La instancia del contenedor del suelo, cuando `TO_KIND` es `MOVE_TO.GROUND_CONTAINER`. */
    TO_ID: 12
};

export const LOGIN_FIELD = {
    ID: 1,
    NAME: 2,
    X: 3, Y: 4, Z: 5,
    HEALTH: 6,
    MAX_HEALTH: 7,
    LEVEL: 8,
    EXPERIENCE: 9,
    VOCATION: 10
};

export const UPDATE_FIELD = {
    ID: 1,
    DIRECTION: 2,
    HEALTH: 3
};

/**
 * LA RANURA DE "DENTRO DEL CONTENEDOR".
 *
 * El motor guarda TODO lo que lleva un jugador en una sola lista, y la ranura dice donde esta
 * cada cosa: lo que tiene el nombre de una ranura de equipo -`hand`, `head`, `ring`...- esta
 * PUESTO, y lo que tiene este nombre esta DENTRO de la mochila.
 *
 * SE LLAMA `inside` Y NO `backpack` A PROPOSITO. `backpack` es una ranura de verdad -la del
 * contenedor, la que declara el 2412 en `items.xml`-, y hasta ahora este motor usaba el mismo
 * nombre para las dos cosas: la mochila "estaba" en la misma ranura que su contenido. Eso hacia
 * imposible distinguir el contenedor de lo que lleva dentro, y por eso el panel de equipo no
 * podia ensenar ni cual es la mochila ni que hay en ella.
 *
 * VIVE AQUI, en el archivo COMPARTIDO, porque son dos los que tienen que estar de acuerdo: el
 * motor decide en que ranura va cada cosa cuando manda el inventario, y el cliente mira esa
 * ranura para saber que poner en el panel de equipo y que dentro de la mochila. Dos copias de
 * este nombre se separan en cuanto alguien toque una.
 */
export const SLOT_INSIDE = 'inside';

export const INVENTORY_FIELD = {
    COUNT: 1,
    /**
     * Cuánto pesa lo que lleva y cuánto puede cargar.
     *
     * Van EN EL MENSAJE DEL INVENTARIO y no en el de estadísticas porque es el inventario
     * lo que pesa: quien pregunta "¿cuánto llevo?" es el mismo que quiere saber si le cabe
     * algo más, y partirlo en dos mensajes obligaría al cliente a juntarlos para poder
     * enseñar una sola línea.
     *
     * Las unidades son las de Tibia: centésimas de onza. El cliente las divide para
     * mostrarlas, que es trabajo de presentación y por tanto suyo.
     */
    WEIGHT: 2,
    CAPACITY: 3,
    /** Donde empieza cada entrada; cada una ocupa cinco posiciones. */
    ENTRIES: 4,
    /*
     * LA RANURA VIAJA EN LA ENTRADA, y es el campo que hace posible el panel de equipo.
     *
     * Antes una entrada eran cuatro numeros -indice, tipo, cantidad y nombre- y la ranura se
     * quedaba en el motor: el cliente recibia una lista plana y no podia saber cual de las
     * cosas que lleva esta PUESTA ni donde ponerla. El dato ya existia (`inventoryOf` lo
     * calcula), lo que faltaba era mandarlo.
     *
     * Se manda la ranura y NO una marca de "equipado" porque son el mismo dato: el motor
     * define equipado como "tiene ranura distinta de la mochila", asi que mandar las dos
     * cosas serian dos campos que pueden contradecirse. Quien pinta decide, con la misma
     * regla que usa el motor.
     *
     * Los valores son los nombres de ranura del motor: las de equipo -'backpack', 'hand', 'body',
     * 'head', 'feet' y 'ring'- y `SLOT_INSIDE` para lo que va dentro de la mochila. Es un TEXTO y
     * no un numero a proposito: un numero obligaria a mantener una tabla compartida entre motor y
     * cliente, y anadir una ranura -el cuello, las piernas- pasaria a ser un cambio de protocolo
     * con su version nueva.
     *
     * Va al final y no en medio por una razon practica: los cuatro campos anteriores
     * conservan su sitio, asi que leerlos sigue siendo el mismo desplazamiento.
     */
    SLOT: 4,
    STRIDE: 5
};

/**
 * Describe una criatura para el cliente.
 *
 * Lleva el ASPECTO: qué conjunto de sprites y de qué colores. El motor manda números y
 * el cliente, que es quien tiene los sprites y la paleta, los resuelve.
 *
 * El aspecto de un monstruo viaja igual que el de un jugador, y es lo que permite que
 * el mismo monstruo cambie de apariencia al transformarse sin que el cliente sepa qué
 * monstruos se transforman.
 */
export function describeCreature(creature) {
    const outfit = creature.outfit || {};

    return [
        creature.id,
        outfit.lookType === undefined ? 0 : outfit.lookType,
        outfit.head === undefined ? 0 : outfit.head,
        outfit.body === undefined ? 0 : outfit.body,
        outfit.legs === undefined ? 0 : outfit.legs,
        outfit.feet === undefined ? 0 : outfit.feet,
        outfit.addons === undefined ? 0 : outfit.addons,
        creature.name,
        creature.position.x,
        creature.position.y,
        creature.position.z,
        creature.direction,
        healthPercent(creature),
        // 0 jugador, 1 monstruo, 2 NPC: el cliente sólo deja atacar a los monstruos y jugadores.
        creature.isPlayer() ? 0 : (creature.kind === 'npc' ? 2 : 1)
    ];
}

/** Salud en porcentaje, que es lo que dibuja la barra. */
export function healthPercent(creature) {
    if (!creature.maxHealth) {
        return 100;
    }
    return Math.max(0, Math.min(100,
        Math.round((creature.health / creature.maxHealth) * 100)));
}

// ---------------------------------------------------------------------------
// Lectura de un mensaje del servidor, del lado del cliente
// ---------------------------------------------------------------------------

/**
 * Desempaqueta un marco recibido.
 *
 * El servidor agrupa todos los mensajes de un tick en un solo marco, así que lo que
 * llega es un array de mensajes. Se acepta también uno suelto, para no tener que
 * elegir un formato en los dos lados.
 */
export function unwrapFrame(parsed) {
    if (!Array.isArray(parsed) || parsed.length === 0) {
        return [];
    }
    return Array.isArray(parsed[0]) ? parsed : [parsed];
}
