/**
 * Los marcadores del mapa: el RESPAWN, los MONSTRUOS que viven dentro, el NPC y el WAYPOINT.
 *
 * QUÉ ES UN RESPAWN, porque es la pieza que ordena todo lo demás. Un respawn es un AREA: un
 * centro, un radio, y la lista de monstruos que viven dentro, cada uno en su casilla. Es lo
 * que declara el formato de Tibia —
 *
 *     <spawn centerx="100" centery="100" centerz="7" radius="5">
 *         <monster name="Rat" x="100" y="100" z="7" spawntime="60" />
 *         <monster name="Rat" x="103" y="98" z="7" spawntime="60" />
 *     </spawn>
 *
 * — y es lo que escribe el motor (`engine/world/writer.js`). Que el área sea UNA cosa es lo
 * que permite redimensionarla de una vez y que el editor la dibuje entera; con un monstruo
 * por entrada, cambiar el radio obligaría a tocar todas las entradas del grupo y no habría
 * forma de saber cuáles son del mismo respawn.
 *
 * LA REGLA QUE LO ORDENA TODO: un monstruo NO EXISTE FUERA DE UN RESPAWN. Por eso no hay
 * ninguna forma de dibujar ni de colocar un monstruo suelto: el monstruo es un elemento de la
 * lista de su área, y su casilla tiene que caer DENTRO del área. Quien lo intente recibe el
 * mensaje de `MOTIVO_MONSTRUO_FUERA`, no un silencio.
 *
 * POR QUÉ ESTÁ ESTE ARCHIVO SEPARADO DE `mapcanvas.js`. El lienzo no se puede probar sin
 * navegador: importa la cámara y el orden de dibujo del cliente con rutas del MONTAJE
 * (`/jetyum/js/...`), que en Node no existen. Y decidir qué forma tiene un respawn, con
 * qué radio y de qué color es justo lo que hay que poder comprobar, porque si se rompe no da
 * ningún error: se ve raro y ya está.
 *
 * Así que aquí NO SE IMPORTA NADA. Todo es aritmética y llamadas a un contexto de lienzo que
 * se recibe como parámetro: el lienzo pone las coordenadas de pantalla y el contexto, y lo
 * que se decide —qué forma, de qué color, con qué radio, qué etiqueta— vive aquí. Con eso,
 * `tools/test-tools.js` lo comprueba con un contexto de mentira que apunta lo que se le pide,
 * sin abrir un navegador.
 */

/**
 * Los colores. MORADO PARA EL RESPAWN porque es lo que hace Remere's Map Editor, que es la
 * referencia que pidió el usuario: allí un respawn se ve como un fuego morado, y quien haya
 * usado ese editor lo reconoce sin que nadie se lo explique.
 *
 * El NPC va en VERDE y el waypoint en AMARILLO, y son tres colores distintos a propósito:
 * confundir un respawn con un NPC es poner un monstruo donde se quería un tendero, y eso no
 * se ve en el archivo, se ve al jugar.
 */
export const COLOR_RESPAWN = '#b06cff';
export const COLOR_RESPAWN_CLARO = '#f2dcff';
export const COLOR_NPC = '#3fd6a0';
export const COLOR_NPC_CLARO = '#d6fff0';
export const COLOR_WAYPOINT = '#ffd24a';

/**
 * LO TRANSPARENTE QUE SE VE EL ÁREA de un respawn (y el radio de paseo de un NPC).
 *
 * El área se ve como un VELO de su color, no sólo como un recuadro: lo pidió el usuario —«el
 * radio del respawn se ve de morado transparente»— y es lo que hace que un área se lea como una
 * zona de un vistazo. El recuadro discontinuo se queda para marcar el borde, porque un velo
 * solo, sobre un mapa con hierba y piedra, no dice dónde acaba.
 *
 * Es SUAVE a propósito: el velo tapa una región entera y tiene que dejar leer el mapa que hay
 * debajo, que es la mitad de lo que se mira al colocar un respawn. El del área ELEGIDA es más
 * fuerte, y esa diferencia es lo único que dice CUÁL está elegida cuando hay dos respawns
 * pegados.
 */
export const ALFA_VELO_AREA = 0.16;
export const ALFA_VELO_ELEGIDO = 0.3;

/**
 * LOS VALORES POR DEFECTO SON DOS COSAS DISTINTAS, y conviene no mezclarlas:
 *
 *   - `RADIO_POR_DEFECTO` (3) es lo que PROPONE el editor al poner un respawn nuevo: el mapa
 *     de la ciudad usa 2, 3 y 4, así que 3 es el que menos hay que retocar.
 *   - `RADIO_DEL_FORMATO` (1) es lo que el MOTOR entiende cuando el archivo no dice radio:
 *     `engine/world/loader.js` hace `entry.radius === undefined ? 1 : ...` y
 *     `engine/world/writer.js` omite el campo justo cuando vale 1.
 *
 * Escribir un 3 explícito es correcto —el escritor sólo omite el 1—, pero saber cuál es el del
 * formato importa: si alguien escribe `"radius": 1` a mano, al guardar desde aquí desaparece
 * del archivo porque ES el valor por defecto, y eso no es un fallo.
 */
export const RADIO_POR_DEFECTO = 3;
export const RADIO_DEL_FORMATO = 1;
export const INTERVALO_POR_DEFECTO = 60000;

/** Un monstruo sin respawn no tiene dónde vivir. Se dice, no se ignora. */
export const MOTIVO_SIN_MONSTRUO =
    'un monstruo no existe fuera de un respawn: elige el monstruo y pon primero su RESPAWN, ' +
    'que es el area donde vive';

/** Un monstruo sólo puede estar DENTRO del área de su respawn. */
export const MOTIVO_MONSTRUO_FUERA =
    'un monstruo no existe fuera de un respawn: esa casilla no esta dentro de ningun ' +
    'respawn, y para poner un monstruo fuera del area de su respawn habria que inventarse ' +
    'un formato que el motor no sabe leer';

/** Un entero de casillas, saneado. `null` si no se puede leer. */
function entero(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.trunc(numero) : null;
}

/**
 * Los respawns del archivo, en el modelo del editor: áreas con sus monstruos dentro.
 *
 * AQUÍ SE ACEPTAN LAS DOS FORMAS DEL FORMATO, y es a propósito:
 *
 *   - la FIEL A TIBIA, con `monsters` dentro y cada monstruo con su casilla;
 *   - la ANTIGUA, un monstruo por entrada y con la (x,y) de la entrada como CENTRO del área.
 *     Es la que tienen `data/world/ciudad.map.json` (10 respawns) y `sample.map.json` (1), y
 *     tiene que seguir cargando.
 *
 * La forma antigua da un monstruo SIN CASILLA (`x` y `y` valen `null`), que significa «vive en
 * cualquier punto del área»: es lo que el motor hacía con ella y así un mapa viejo no cambia de
 * comportamiento al abrirlo. El editor puede darle casilla moviéndolo, y entonces sí.
 *
 * ESTA LECTURA TIENE QUE COINCIDIR CON LA DEL MOTOR (`engine/world/loader.js`), y hay dos
 * sitios porque uno es CommonJS del motor y el otro es un módulo ES del navegador, que no
 * pueden importarse entre sí. Lo que impide que se separen es una prueba: `tools/test-tools.js`
 * carga el MISMO archivo con los dos y compara área por área y monstruo por monstruo. Es la
 * misma idea que la tabla de banderas del cliente, que se compara con `items.xml`.
 *
 * Un respawn ilegible —sin coordenadas o sin ningún monstruo— se descarta, igual que un item
 * ilegible: dejarlo pasar daría un marcador que no se puede ni dibujar ni guardar.
 *
 * @param {Array} lista la clave `spawns` del archivo del mapa
 * @returns {Array<Object>} áreas `{x, y, z, radius, interval, monsters}`
 */
export function normalizarRespawns(lista) {
    const areas = [];

    (lista || []).forEach((entrada) => {
        if (!entrada || typeof entrada !== 'object') {
            return;
        }

        const x = entero(entrada.x);
        const y = entero(entrada.y);
        const z = entero(entrada.z);

        if (x === null || y === null || z === null) {
            return;
        }

        const radio = entero(entrada.radius);
        const radius = radio === null || radio < 0 ? RADIO_DEL_FORMATO : radio;

        const intervalo = entero(entrada.interval);
        const interval = intervalo === null || intervalo <= 0 ? INTERVALO_POR_DEFECTO : intervalo;

        const monsters = [];

        if (Array.isArray(entrada.monsters)) {
            entrada.monsters.forEach((monstruo) => {
                if (!monstruo || typeof monstruo !== 'object') {
                    return;
                }

                const nombre = monstruo.name ? String(monstruo.name).trim() : '';
                if (nombre === '') {
                    return;
                }

                const casillaX = entero(monstruo.x);
                const casillaY = entero(monstruo.y);
                const propioIntervalo = entero(monstruo.interval);
                // Una casilla a medias no es una casilla: si falta una de las dos
                // coordenadas, el monstruo se queda sin sitio en vez de inventarse un cero.
                const conCasilla = casillaX !== null && casillaY !== null;

                monsters.push({
                    name: nombre,
                    x: conCasilla ? casillaX : null,
                    y: conCasilla ? casillaY : null,
                    interval: propioIntervalo === null || propioIntervalo <= 0
                        ? interval : propioIntervalo
                });
            });
        } else {
            const nombre = entrada.monster ? String(entrada.monster).trim() : '';

            if (nombre !== '') {
                monsters.push({ name: nombre, x: null, y: null, interval: interval });
            }
        }

        if (monsters.length === 0) {
            return;
        }

        areas.push({ x: x, y: y, z: z, radius: radius, interval: interval, monsters: monsters });
    });

    return areas;
}

/**
 * Un NPC colocado en el mapa.
 *
 * `radius` es el radio de paseo DE ESTA COLOCACIÓN y `null` significa «manda
 * `data/npc/npcs.xml`». Se distinguen a propósito, porque `0` es una decisión —«aquí no se
 * mueve»— y no lo mismo que no decir nada: con un `||` se confundirían.
 *
 * Existe por una diferencia real con Remere's: allí un NPC no pasea, se coloca y se queda.
 * Aquí sí pasea, por decisión de este proyecto (`walkradius` en `npcs.xml`), y el mapa puede
 * afinarlo por colocación sin duplicar la definición del NPC.
 *
 * @param {Object} entrada
 * @returns {{x: number, y: number, z: number, name: string, radius: (number|null)}|null}
 */
export function normalizarNpc(entrada) {
    if (!entrada || typeof entrada !== 'object') {
        return null;
    }

    const x = entero(entrada.x);
    const y = entero(entrada.y);
    const z = entero(entrada.z);
    const nombre = entrada.name === undefined || entrada.name === null
        ? '' : String(entrada.name).trim();

    if (x === null || y === null || z === null || nombre === '') {
        return null;
    }

    const radio = entrada.radius === undefined || entrada.radius === null
        ? null : entero(entrada.radius);

    return {
        x: x,
        y: y,
        z: z,
        name: nombre,
        radius: radio === null || radio < 0 ? null : radio
    };
}

/** La identidad de un respawn: su centro y su radio. Estable aunque cambie la lista. */
export function claveDeRespawn(area) {
    return area.x + ',' + area.y + ',' + area.z + ',' + area.radius;
}

/**
 * El área que cubre un respawn, en casillas.
 *
 * CUADRADA Y NO REDONDA, y la razón está en el motor, no en el dibujo:
 * `engine/world/spawner.js` sortea el desplazamiento de la X y el de la Y POR SEPARADO
 * (`_randomOffset`, un entero en `[-radio, radio]` para cada eje), así que el área es el
 * cuadrado de lado `2 * radio + 1` centrado en (x,y). Dibujar un círculo enseñaría esquinas
 * que el motor no usa y recortaría casillas a las que sí puede salir un monstruo.
 *
 * @returns {{x0: number, y0: number, lado: number}} en casillas
 */
export function areaDelRespawn(area) {
    const radio = Math.max(0, entero(area.radius) === null ? 0 : entero(area.radius));
    return { x0: area.x - radio, y0: area.y - radio, lado: radio * 2 + 1 };
}

/** ¿Cae esta casilla dentro del área del respawn? */
export function dentroDelArea(area, x, y) {
    const radio = Math.max(0, entero(area.radius) === null ? 0 : entero(area.radius));
    return Math.abs(x - area.x) <= radio && Math.abs(y - area.y) <= radio;
}

/** El respawn que cubre una casilla, o null. Con varios, gana el MÁS PEQUEÑO. */
export function respawnQueCubre(respawns, x, y, z) {
    let encontrado = null;

    (respawns || []).forEach((area) => {
        if (area.z !== z || !dentroDelArea(area, x, y)) {
            return;
        }

        // Con áreas solapadas gana la más pequeña, que es la más concreta: pulsar dentro de
        // una ratonera metida en una zona grande tiene que coger la ratonera.
        if (encontrado === null || area.radius < encontrado.radius) {
            encontrado = area;
        }
    });

    return encontrado;
}

/**
 * El área movida un desplazamiento, CON SUS MONSTRUOS DENTRO.
 *
 * ES LA OPERACIÓN DE ARRASTRAR UN RESPAWN, y por eso está aquí y no en el editor: es geometría
 * pura y es lo que hay que poder comprobar sin abrir un navegador. El área se mueve ENTERA —el
 * centro y la casilla de cada monstruo con la MISMA diferencia—, así que cada monstruo conserva
 * su posición RELATIVA dentro del área y ninguno puede quedarse fuera por el camino: si estaba
 * dentro, sigue dentro; si estaba fuera (un mapa escrito a mano, que el formato admite), sigue
 * fuera igual que antes y lo dice `monstruosFueraDelArea`.
 *
 * NO MUTA NADA: devuelve un área nueva. Quien llama decide si la acepta (y entonces la aplica)
 * o si se queda con la que había, que es lo que permite arrastrar enseñando el resultado antes
 * de soltarlo y volver atrás sin haber tocado el mapa.
 *
 * Un monstruo SIN casilla no tiene nada que mover: vive en el área entera y se queda sin `x` ni
 * `y`, que es lo que significa para el motor «aparece en cualquier punto del respawn».
 *
 * @param {Object} area
 * @param {number} dx
 * @param {number} dy
 * @returns {Object} un área nueva, con monstruos nuevos
 */
export function areaDesplazada(area, dx, dy) {
    // Un desplazamiento ilegible es «no muevas nada», que es la única lectura segura: mover el
    // área a un sitio que no se sabe cuál es sería peor que no moverse.
    const leidoX = entero(dx);
    const leidoY = entero(dy);
    const pasoX = leidoX === null ? 0 : leidoX;
    const pasoY = leidoY === null ? 0 : leidoY;

    return {
        x: Number(area.x) + pasoX,
        y: Number(area.y) + pasoY,
        z: area.z,
        radius: area.radius,
        interval: area.interval,
        monsters: (area.monsters || []).map((monstruo) => {
            // Sólo se mueve la casilla; el nombre y el intervalo son los mismos. Un monstruo sin
            // casilla la conserva en `null`, que es «vive en el área entera».
            const conCasilla = monstruo.x !== null && monstruo.x !== undefined;

            return {
                name: monstruo.name,
                x: conCasilla ? Number(monstruo.x) + pasoX : null,
                y: conCasilla ? Number(monstruo.y) + pasoY : null,
                interval: monstruo.interval
            };
        })
    };
}

/**
 * Los monstruos CON casilla que caen fuera del área de su respawn.
 *
 * EXISTE PORQUE EL VALIDADOR LO PROHÍBE —`engine/world/loader.js` rechaza un monstruo fuera de su
 * respawn, y `editor/server.js` también—, así que el editor tiene que poder decirlo. Arrastrar un
 * área no puede provocarlo (el desplazamiento es rígido), pero un mapa escrito a mano SÍ puede
 * traerlo, y entonces mover el área no lo arregla ni lo empeora: lo honesto es contarlo.
 *
 * @returns {Array<Object>} los monstruos que se salen, con su nombre y su casilla
 */
export function monstruosFueraDelArea(area) {
    return (area.monsters || []).filter((monstruo) =>
        monstruo.x !== null && monstruo.x !== undefined &&
        !dentroDelArea(area, monstruo.x, monstruo.y));
}

/** La posición, dentro de la lista de monstruos de un área, del que está en una casilla. */
export function indiceDeMonstruoEn(area, x, y) {
    return (area.monsters || []).findIndex((monstruo) =>
        monstruo.x !== null && monstruo.x === x && monstruo.y === y);
}

/** Un intervalo en milisegundos, en segundos y sin decimales de más. */
export function segundos(milisegundos) {
    const total = Number(milisegundos);

    if (!Number.isFinite(total) || total <= 0) {
        return '?';
    }
    if (total % 1000 === 0) {
        return (total / 1000) + ' s';
    }
    return (total / 1000).toFixed(1) + ' s';
}

/**
 * LA ZONA PROTEGIDA: la bandera `protectionZone` de un BLOQUE de casillas contiguas.
 *
 * QUÉ ES, COMPROBADO Y NO SUPUESTO. No es un área con centro y radio como el respawn: es una
 * BANDERA DE CASILLA. Está declarada en `engine/world/tile.js` (`TILE_FLAGS.PROTECTION_ZONE = 1`,
 * «nadie puede atacar a nadie aquí»), el cargador la acepta por nombre (`FLAG_NAMES` en
 * `engine/world/loader.js`) y en el mapa se escribe dentro de cada tile:
 *
 *     { "x": 67, "y": 45, "z": 7, "ground": 104, "flags": ["protectionZone"] }
 *
 * O sea: el editor ya sabe escribirla —es la herramienta Bandera, y `protectionZone` es la primera
 * de su desplegable— y lo que NO sabía era tratarla como una cosa: se veía como un borde por
 * casilla (mira `_drawFlags` en `mapcanvas.js`) y no se podía ni elegir ni mover.
 *
 * CÓMO SE MUEVE ALGO QUE NO TIENE CENTRO, que es la pregunta que deja el modelo: **como un BLOQUE**,
 * el conjunto de casillas contiguas que llevan la bandera. Se agarra por donde se pinche y se mueve
 * entero. Las otras dos opciones son peores:
 *
 *   - CASILLA A CASILLA: mover una zona de 60 casillas serían 120 clics —poner y quitar—, que es
 *     justo el trabajo que el arrastre viene a ahorrar.
 *   - POR SU RECTÁNGULO: se llevaría por delante las casillas del hueco que no están protegidas.
 *     En el mapa de la ciudad la zona protegida son DOS bloques de 63 y 180 casillas dentro de un
 *     rectángulo de 17x20: 97 casillas del rectángulo NO están protegidas, y mover el rectángulo
 *     protegería 97 casillas de más sin que nadie lo haya pedido. Es el mismo motivo por el que el
 *     velo se dibuja CASILLA A CASILLA.
 *
 * CONTIGUAS DE CUATRO VECINOS, no de ocho: dos casillas protegidas que sólo se tocan en diagonal son
 * dos zonas, no una. Con ocho vecinos, mover una se llevaría la otra por una esquina, y una esquina
 * no es un pasillo.
 *
 * SE ACEPTAN VARIAS ZONAS POR PLANTA, que es lo que hay de verdad en el mapa de la ciudad.
 */
export const BANDERA_ZONA = 'protectionZone';

/**
 * El azul celeste de la zona protegida, y por qué no es el morado del respawn ni el verde del
 * elegido: son tres cosas distintas y dos de ellas pueden estar en la misma casilla.
 */
export const COLOR_ZONA = '#63d2ff';
export const COLOR_ZONA_CLARO = '#eafaff';

/** ¿Esta casilla lleva la bandera de protección? */
export function casillaProtegida(mapa, x, y, z) {
    const tile = mapa && typeof mapa.tileAt === 'function' ? mapa.tileAt(x, y, z) : null;

    return !!tile && (tile.flags || []).indexOf(BANDERA_ZONA) !== -1;
}

/**
 * El bloque de casillas protegidas contiguas que contiene una casilla, o `null`.
 *
 * Se recorre en anchura desde la casilla que se pincha y se para en el borde del mapa o en la
 * primera casilla sin la bandera, así que no hace falta conocer el tamaño del mapa: una casilla
 * fuera de él no tiene tile y corta el recorrido sola.
 */
export function zonaQueCubre(mapa, x, y, z) {
    if (!casillaProtegida(mapa, x, y, z)) {
        return null;
    }

    const celdas = recorrerZona(mapa, x, y, z);

    return bloqueDeZona(celdas, z);
}

/**
 * TODOS los bloques protegidos de una planta, en orden de lectura.
 *
 * Es lo que dibuja el lienzo y lo que permite que la zona elegida se distinga de las demás: una
 * planta puede tener varias —el mapa de la ciudad tiene dos— y sin recorrerlas todas no habría
 * forma de enseñarlas.
 *
 * @returns {Array<Object>} bloques `{z, x, y, celdas, x0, y0, x1, y1, ancho, alto}`
 */
export function bloquesProtegidos(mapa, z) {
    const bloques = [];

    if (!mapa || !mapa.tiles) {
        return bloques;
    }

    const sueltas = [];

    mapa.tiles.forEach((tile) => {
        if (tile.z !== z || (tile.flags || []).indexOf(BANDERA_ZONA) === -1) {
            return;
        }

        sueltas.push({ x: tile.x, y: tile.y });
    });

    sueltas.sort(ordenDeLectura);

    const vistas = new Set();

    sueltas.forEach((casilla) => {
        const k = casilla.x + ',' + casilla.y;

        if (vistas.has(k)) {
            return;
        }

        const celdas = recorrerZona(mapa, casilla.x, casilla.y, z);

        celdas.forEach((celda) => vistas.add(celda.x + ',' + celda.y));
        bloques.push(bloqueDeZona(celdas, z));
    });

    return bloques;
}

/** El orden de lectura: por filas y, dentro de una fila, de izquierda a derecha. */
function ordenDeLectura(a, b) {
    return a.y - b.y || a.x - b.x;
}

/** El recorrido en anchura de una zona: la casilla y todo lo que se le toca de lado. */
function recorrerZona(mapa, x, y, z) {
    const pendientes = [{ x: x, y: y }];
    const vistas = new Set();
    const celdas = [];

    while (pendientes.length > 0) {
        const actual = pendientes.pop();
        const k = actual.x + ',' + actual.y;

        if (vistas.has(k)) {
            continue;
        }
        vistas.add(k);

        if (!casillaProtegida(mapa, actual.x, actual.y, z)) {
            continue;
        }

        celdas.push(actual);
        pendientes.push({ x: actual.x + 1, y: actual.y });
        pendientes.push({ x: actual.x - 1, y: actual.y });
        pendientes.push({ x: actual.x, y: actual.y + 1 });
        pendientes.push({ x: actual.x, y: actual.y - 1 });
    }

    celdas.sort(ordenDeLectura);

    return celdas;
}

/**
 * Un bloque, con lo que hace falta para dibujarlo, para etiquetarlo y para moverlo.
 *
 * `x`/`y` son la casilla de ARRIBA A LA IZQUIERDA, que es el ancla del bloque: como dos bloques
 * distintos no pueden compartir su primera casilla, sirve de identidad —igual que el centro de un
 * respawn— y es de donde cuelga la etiqueta. `x0..x1`/`y0..y1` son el rectángulo que lo contiene,
 * que es lo que se dibuja como borde discontinuo.
 */
function bloqueDeZona(celdas, z) {
    const primera = celdas[0];

    let x0 = primera.x;
    let y0 = primera.y;
    let x1 = primera.x;
    let y1 = primera.y;

    celdas.forEach((celda) => {
        x0 = Math.min(x0, celda.x);
        y0 = Math.min(y0, celda.y);
        x1 = Math.max(x1, celda.x);
        y1 = Math.max(y1, celda.y);
    });

    return {
        tipo: 'zona',
        z: z,
        x: primera.x,
        y: primera.y,
        celdas: celdas,
        x0: x0,
        y0: y0,
        x1: x1,
        y1: y1,
        ancho: x1 - x0 + 1,
        alto: y1 - y0 + 1
    };
}

/**
 * La identidad de una zona: su casilla de arriba a la izquierda y su planta.
 *
 * Es su ancla y viaja con ella, igual que la clave de un respawn es su centro y su radio: mover la
 * zona cambia la clave, y quien la tenga elegida tiene que recolocarla (lo hace
 * `_reclavarSeleccionDeZona` en `editormap.js`).
 */
export function claveDeZona(bloque) {
    return 'zona:' + bloque.x + ',' + bloque.y + ',' + bloque.z;
}

/** La etiqueta de una zona: cuántas casillas son y por dónde llega. */
export function etiquetaDeZona(bloque) {
    const cuantas = bloque.celdas.length;

    return cuantas + (cuantas === 1 ? ' casilla protegida' : ' casillas protegidas') +
        (bloque.ancho === 1 && bloque.alto === 1
            ? ''
            : '  de (' + bloque.x0 + ',' + bloque.y0 + ') a (' + bloque.x1 + ',' + bloque.y1 + ')');
}

/**
 * La etiqueta de un respawn: quién vive dentro, cuánto territorio tiene y cada cuánto vuelve.
 *
 * Los monstruos SIN casilla se cuentan aparte y se dice cuántos son, porque ésos no tienen un
 * punto en el mapa donde dibujarlos: viven en el área entera, y callarlo haría que la cuenta
 * de la etiqueta no cuadrara con los fuegos que se ven.
 */
export function etiquetaDeRespawn(area) {
    const cuantos = new Map();
    let sinCasilla = 0;

    (area.monsters || []).forEach((monstruo) => {
        cuantos.set(monstruo.name, (cuantos.get(monstruo.name) || 0) + 1);

        if (monstruo.x === null || monstruo.x === undefined) {
            sinCasilla += 1;
        }
    });

    const nombres = Array.from(cuantos.entries())
        .map(([nombre, total]) => (total > 1 ? nombre + ' x' + total : nombre))
        .join(', ');

    return nombres +
        (sinCasilla > 0 ? ' (' + sinCasilla + ' en el area)' : '') +
        '  radio ' + area.radius + '  cada ' + segundos(area.interval);
}

/**
 * La etiqueta de un NPC. Dice DE DÓNDE sale el radio, que es lo que se puede cambiar desde el
 * mapa y lo que no.
 */
export function etiquetaDeNpc(npc, definicion) {
    if (!npc) {
        return '';
    }

    const radio = (npc.radius === null || npc.radius === undefined)
        ? (definicion && Number.isFinite(Number(definicion.walkRadius))
            ? Number(definicion.walkRadius) : 0)
        : Number(npc.radius);

    // «(npcs.xml)» o «(mapa)» no es adorno: es la respuesta a «¿y por qué este NPC tiene
    // radio y yo no puedo cambiarlo aquí?». En Remere's los NPC no pasean y aquí sí, y quien
    // lo lea tiene que poder saber de dónde sale el número sin abrir el XML.
    const origen = (npc.radius === null || npc.radius === undefined) ? 'npcs.xml' : 'mapa';

    return npc.name + '  radio ' + radio + ' (' + origen + ')';
}

/** El texto largo de un marcador, para el estado del editor y para la casilla bajo el cursor. */
export function descripcionDeMarcador(marca) {
    if (!marca) {
        return '';
    }

    if (marca.tipo === 'waypoint') {
        return 'waypoint ' + marca.etiqueta;
    }
    if (marca.tipo === 'npc') {
        return 'npc ' + marca.etiqueta + ' en (' + marca.x + ',' + marca.y + ',' + marca.z + ')';
    }
    if (marca.tipo === 'monstruo') {
        return 'monstruo ' + marca.etiqueta + ' del respawn ' +
            '(' + marca.respawnX + ',' + marca.respawnY + ',' + marca.z + ')';
    }

    return 'respawn ' + marca.etiqueta + ' en (' + marca.x + ',' + marca.y + ',' + marca.z + ')';
}

/**
 * Los marcadores de una planta, listos para dibujar.
 *
 * NO SE PUEDEN SACAR DE LA LISTA DE DIBUJO DEL CLIENTE, y por eso se recorren los datos del
 * mapa: los respawns y los NPC son cosas del ARCHIVO, y al cliente no le llegan —el cliente ve
 * monstruos y NPC porque el motor se los manda como criaturas, no porque sepa dónde están sus
 * respawns—. Un editor sí tiene que enseñarlos: son parte del mapa que se escribe.
 *
 * Cada respawn da DOS clases de marcador: el ÁREA (el fuego morado del centro y su recuadro
 * discontinuo) y un marcador por cada monstruo CON casilla, para poder verlo, pincharlo y
 * moverlo. Los monstruos sin casilla no tienen dónde dibujarse y se cuentan en la etiqueta del
 * área.
 *
 * @param {Object} mapa el mapa que se edita
 * @param {number} z la planta que se está mirando
 * @param {{tipo: string, clave: (string|undefined), posicion: (number|undefined)}|null} [seleccion]
 * @returns {Array<Object>}
 */
export function marcadoresDePlanta(mapa, z, seleccion) {
    const elegido = seleccion || null;
    const marcas = [];

    const estaElegido = (tipo, clave, posicion) => elegido !== null && elegido.tipo === tipo &&
        elegido.clave === clave &&
        (posicion === undefined || elegido.posicion === posicion);

    (mapa.spawns || []).forEach((area) => {
        if (area.z !== z) {
            return;
        }

        const clave = claveDeRespawn(area);

        marcas.push({
            tipo: 'respawn',
            clave: clave,
            x: area.x,
            y: area.y,
            z: area.z,
            radio: area.radius,
            monstruos: (area.monsters || []).length,
            etiqueta: etiquetaDeRespawn(area),
            color: COLOR_RESPAWN,
            colorClaro: COLOR_RESPAWN_CLARO,
            seleccionado: estaElegido('respawn', clave)
        });

        (area.monsters || []).forEach((monstruo, posicion) => {
            if (monstruo.x === null || monstruo.x === undefined) {
                return;
            }

            marcas.push({
                tipo: 'monstruo',
                clave: clave,
                posicion: posicion,
                respawnX: area.x,
                respawnY: area.y,
                x: monstruo.x,
                y: monstruo.y,
                z: area.z,
                radio: null,
                etiqueta: monstruo.name,
                color: COLOR_RESPAWN,
                colorClaro: COLOR_RESPAWN_CLARO,
                seleccionado: estaElegido('monstruo', clave, posicion)
            });
        });
    });

    (mapa.npcs || []).forEach((npc, indice) => {
        if (npc.z !== z) {
            return;
        }

        const definicion = typeof mapa.definicionDeNpc === 'function'
            ? mapa.definicionDeNpc(npc.name)
            : null;

        const radio = (npc.radius === null || npc.radius === undefined)
            ? (definicion ? Number(definicion.walkRadius) || 0 : 0)
            : Number(npc.radius);

        marcas.push({
            tipo: 'npc',
            indice: indice,
            x: npc.x,
            y: npc.y,
            z: npc.z,
            radio: radio,
            etiqueta: etiquetaDeNpc(npc, definicion),
            color: COLOR_NPC,
            colorClaro: COLOR_NPC_CLARO,
            // La clave de un NPC es su casilla: los NPC se borran y se ponen, no se mueven.
            seleccionado: estaElegido('npc', npc.x + ',' + npc.y + ',' + npc.z)
        });
    });

    const waypoints = mapa.waypoints || {};
    Object.keys(waypoints).forEach((nombre) => {
        const posicion = waypoints[nombre];

        if (!posicion || Number(posicion[2]) !== z) {
            return;
        }

        marcas.push({
            tipo: 'waypoint',
            x: Number(posicion[0]),
            y: Number(posicion[1]),
            z: Number(posicion[2]),
            // Un waypoint no tiene radio: es un punto al que te llevan, no un territorio.
            radio: null,
            etiqueta: nombre,
            color: COLOR_WAYPOINT,
            colorClaro: '#fff0c0',
            seleccionado: false
        });
    });

    /*
     * LAS ZONAS PROTEGIDAS, una por bloque, y van al final a propósito: son las únicas que no
     * ocupan un punto sino un conjunto de casillas, así que dibujarlas después deja sus velos por
     * encima de las casillas y no al revés. Se dibujan TODAS y no sólo la elegida —igual que los
     * respawns—: una zona que no se ve es una zona que se pisa sin saberlo.
     */
    bloquesProtegidos(mapa, z).forEach((bloque) => {
        const clave = claveDeZona(bloque);

        marcas.push({
            tipo: 'zona',
            clave: clave,
            x: bloque.x,
            y: bloque.y,
            z: bloque.z,
            // Una zona no tiene radio: no es un área alrededor de un centro, es un conjunto de
            // casillas. Por eso lleva `casillas` y el rectángulo que las contiene.
            radio: null,
            celdas: bloque.celdas,
            caja: { x0: bloque.x0, y0: bloque.y0, x1: bloque.x1, y1: bloque.y1 },
            etiqueta: etiquetaDeZona(bloque),
            color: COLOR_ZONA,
            colorClaro: COLOR_ZONA_CLARO,
            seleccionado: estaElegido('zona', clave)
        });
    });

    return marcas;
}

/**
 * Dibuja un marcador entero en la casilla que se le diga.
 *
 * `vista` lleva la esquina SUPERIOR IZQUIERDA de la casilla en píxeles, el lado de la casilla,
 * si caben las etiquetas y un tiempo para el parpadeo del fuego. Todo lo que se decide aquí se
 * puede comprobar con un contexto de mentira.
 *
 * @param {Object} ctx contexto de lienzo (2D)
 * @param {Object} marca un marcador de `marcadoresDePlanta`
 * @param {{x: number, y: number, paso: number, etiqueta: boolean, t: number}} vista
 */
export function dibujarMarcador(ctx, marca, vista) {
    if (marca.radio !== null && marca.radio !== undefined) {
        dibujarRadio(ctx, marca, vista);
    }

    if (marca.tipo === 'respawn') {
        dibujarFuego(ctx, marca, vista);
    } else if (marca.tipo === 'monstruo') {
        // Un monstruo del respawn: el MISMO fuego, más pequeño. Que sea el mismo dibujo no es
        // pereza: es lo que hace evidente que ese monstruo pertenece a ese respawn.
        dibujarFuego(ctx, marca, { ...vista, escala: 0.45 });
    } else if (marca.tipo === 'npc') {
        dibujarNpc(ctx, marca, vista);
    } else if (marca.tipo === 'zona') {
        dibujarZona(ctx, marca, vista);
    } else {
        dibujarWaypoint(ctx, marca, vista);
    }

    if (vista.etiqueta && vista.paso >= 14 && marca.tipo !== 'monstruo') {
        dibujarEtiqueta(ctx, marca, vista);
    }
}

/**
 * La zona protegida: un velo azul celeste CASILLA A CASILLA y el rectángulo discontinuo que la
 * contiene.
 *
 * EL VELO VA POR CASILLA Y NO POR EL RECTÁNGULO, y no es un detalle de dibujo: la zona del mapa de
 * la ciudad son 63 y 180 casillas dentro de un rectángulo de 17x20, o sea que el rectángulo tiene 97
 * casillas que NO están protegidas. Pintar el rectángulo entero diría que hay protección donde no
 * la hay, y el editor estaría mintiendo sobre el mapa que se está escribiendo. El rectángulo se
 * queda para el BORDE, que es lo que dice de un vistazo hasta dónde llega el bloque.
 *
 * Se comporta igual que el respawn —velo del color, más fuerte si está elegida, y borde a trazos—
 * porque es la misma pregunta: «¿qué casillas son de esto?».
 */
export function dibujarZona(ctx, marca, vista) {
    const paso = vista.paso;
    const celdas = marca.celdas || [];

    if (celdas.length === 0) {
        return;
    }

    ctx.save();

    ctx.globalAlpha = alfaDelVelo(marca.seleccionado);
    ctx.fillStyle = marca.color;

    celdas.forEach((celda) => {
        // La casilla se sitúa por su DIFERENCIA con el ancla del bloque, que es la misma cuenta que
        // hace `dibujarRadio` con el área de un respawn: así el dibujo es el mismo con cualquier
        // escala y no hace falta que el lienzo pase una coordenada por casilla.
        ctx.fillRect(
            vista.x + (celda.x - marca.x) * paso,
            vista.y + (celda.y - marca.y) * paso,
            paso,
            paso);
    });

    ctx.globalAlpha = 1;

    const caja = marca.caja || { x0: marca.x, y0: marca.y, x1: marca.x, y1: marca.y };

    ctx.strokeStyle = marca.color;
    ctx.lineWidth = marca.seleccionado ? 3 : 2;
    ctx.setLineDash(marca.seleccionado ? [7, 4] : [4, 4]);
    ctx.strokeRect(
        Math.round(vista.x + (caja.x0 - marca.x) * paso) + 0.5,
        Math.round(vista.y + (caja.y0 - marca.y) * paso) + 0.5,
        (caja.x1 - caja.x0 + 1) * paso,
        (caja.y1 - caja.y0 + 1) * paso);
    ctx.setLineDash([]);

    ctx.restore();
}

/**
 * Lo transparente que se ve el velo de un área, según esté elegida o no.
 *
 * Está aparte de `dibujarRadio` porque es un NÚMERO que se puede comprobar y que decide algo:
 * que el área elegida se distinga de las demás. Enterrado en una llamada al lienzo no se podría
 * ni comprobar ni comparar.
 */
export function alfaDelVelo(elegido) {
    return elegido ? ALFA_VELO_ELEGIDO : ALFA_VELO_AREA;
}

/**
 * El radio del respawn: un velo de su color dentro de un recuadro DISCONTINUO.
 *
 * Discontinuo y no continuo por una razón de dibujo: el mapa ya tiene líneas por todas partes
 * —la rejilla, el borde, las banderas—, y una línea más sin distinguirse se lee como parte del
 * mapa. A trazos se lee como «esto es una zona», que es lo que es. Y es lo que hace Remere's:
 * el área de un spawn se ve como una zona, no como un objeto.
 *
 * EL VELO VA EN TODAS LAS ÁREAS, no sólo en la elegida, y es lo que pidió el usuario: el morado
 * transparente es lo que hace que el respawn se vea de un vistazo sin tener que pulsarlo. El
 * elegido lleva el mismo velo, más fuerte.
 */
export function dibujarRadio(ctx, marca, vista) {
    /*
     * El radio se lee de `marca.radio`, que es el nombre que tiene en un MARCADOR, y no de
     * `marca.radius`, que es el que tiene en el ARCHIVO. Se construye el área a mano en vez de
     * pasar el marcador a `areaDelRespawn` porque esa función trabaja con la forma del archivo
     * —el respawn con sus monstruos—, y confundir las dos formas fue exactamente el fallo que
     * hacía que el área se dibujara de una casilla.
     */
    const area = areaDelRespawn({ x: marca.x, y: marca.y, radius: marca.radio });
    const paso = vista.paso;

    // Las coordenadas del área se calculan DESDE LA CASILLA del centro y no desde el marcador:
    // así el recuadro es el mismo tanto si lo dibuja el respawn como el NPC, y no hay dos
    // cuentas del radio que puedan discrepar.
    const desplazamientoX = (area.x0 - marca.x) * paso;
    const desplazamientoY = (area.y0 - marca.y) * paso;
    const ancho = area.lado * paso;

    ctx.save();

    // El VELO, que es lo que se ve de un vistazo. Va antes del recuadro para que la línea quede
    // encima de él y se lea nítida.
    ctx.globalAlpha = alfaDelVelo(marca.seleccionado);
    ctx.fillStyle = marca.color;
    ctx.fillRect(vista.x + desplazamientoX, vista.y + desplazamientoY, ancho, ancho);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = marca.color;
    ctx.lineWidth = marca.seleccionado ? 3 : 2;
    ctx.setLineDash(marca.seleccionado ? [7, 4] : [4, 4]);
    ctx.strokeRect(
        Math.round(vista.x + desplazamientoX) + 0.5,
        Math.round(vista.y + desplazamientoY) + 0.5,
        ancho,
        ancho);
    ctx.setLineDash([]);

    ctx.restore();
}

/**
 * El fuego morado de un respawn (y, más pequeño, el de cada monstruo que vive dentro).
 *
 * Es un dibujo de procedimiento y no un sprite a propósito: el proveedor de sprites del cliente
 * devuelve los dibujos de los OBJETOS del catálogo, y un respawn no es un objeto del catálogo
 * —no está en `items.xml` y no debe estar, porque no se pisa ni se recoge—. Un fuego dibujado
 * aquí no depende de que exista un PNG, y por eso funciona en cualquier mapa y con cualquier
 * datapack.
 *
 * El parpadeo sale de `vista.t` y no de `Math.random()`: un dibujo que cambia en cada fotograma
 * se puede mirar, pero uno que cambia de forma ALEATORIA no se puede comprobar. Con el tiempo
 * como parámetro, la prueba pasa un tiempo fijo y el resultado es siempre el mismo.
 */
export function dibujarFuego(ctx, marca, vista) {
    const paso = vista.paso;
    const escala = vista.escala === undefined ? 1 : vista.escala;

    const centroX = vista.x + paso / 2;
    const baseY = vista.y + paso * (escala < 0.6 ? 0.78 : 0.86);

    // El fuego del respawn ocupa la casilla casi entera: uno pequeño se pierde entre los
    // dibujos del mapa, y el respawn es lo que hay que ver de un vistazo.
    const oscilacion = 1 + 0.1 * Math.sin((Number(vista.t) || 0) / 120);
    const alto = paso * 0.8 * oscilacion * escala;
    const ancho = paso * 0.3 * escala;

    // --- El halo, que es lo que hace que se lea como fuego y no como una mancha ---
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = marca.color;
    ctx.beginPath();
    ctx.arc(centroX, baseY - alto * 0.35, paso * 0.62 * escala, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- La llama ---
    ctx.save();
    const degradado = typeof ctx.createLinearGradient === 'function'
        ? ctx.createLinearGradient(centroX, baseY, centroX, baseY - alto)
        : null;

    if (degradado && typeof degradado.addColorStop === 'function') {
        degradado.addColorStop(0, marca.color);
        degradado.addColorStop(1, marca.colorClaro);
        ctx.fillStyle = degradado;
    } else {
        // Sin degradado —un lienzo que no lo soporta, o un contexto de mentira— se pinta del
        // morado del respawn. Es menos bonito y sigue siendo un fuego morado, que es lo que hay
        // que reconocer.
        ctx.fillStyle = marca.color;
    }

    ctx.beginPath();
    ctx.moveTo(centroX - ancho, baseY);
    ctx.quadraticCurveTo(centroX - ancho * 1.6, baseY - alto * 0.55, centroX, baseY - alto);
    ctx.quadraticCurveTo(centroX + ancho * 1.6, baseY - alto * 0.55, centroX + ancho, baseY);
    ctx.quadraticCurveTo(centroX, baseY + alto * 0.12, centroX - ancho, baseY);
    ctx.closePath();
    ctx.fill();

    // --- El núcleo claro, que es lo que da la sensación de temperatura ---
    ctx.fillStyle = marca.colorClaro;
    ctx.beginPath();
    ctx.moveTo(centroX - ancho * 0.45, baseY);
    ctx.quadraticCurveTo(centroX - ancho * 0.8, baseY - alto * 0.45, centroX, baseY - alto * 0.62);
    ctx.quadraticCurveTo(centroX + ancho * 0.8, baseY - alto * 0.45, centroX + ancho * 0.45, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- Las chispas: tres puntos colocados con el mismo tiempo que la llama ---
    ctx.save();
    ctx.fillStyle = marca.colorClaro;
    for (let indice = 0; indice < 3; indice += 1) {
        const fase = (Number(vista.t) || 0) / 400 + indice * 2.1;
        const altura = baseY - alto * (0.75 + 0.25 * Math.sin(fase));
        ctx.beginPath();
        ctx.arc(centroX + Math.sin(fase) * paso * 0.28 * escala, altura,
            Math.max(1, paso * 0.045 * escala), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // El marcador elegido lleva un anillo alrededor: el fuego tapa el velo del radio.
    if (marca.seleccionado) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centroX, baseY - alto * 0.4, paso * 0.55 * escala, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * El NPC: una figura verde, para no confundirla con el fuego morado del respawn.
 *
 * Se dibuja como una persona esquemática —cabeza y cuerpo— y no como un punto de color: a
 * simple vista, un punto se confunde con un item del mapa, y lo que hay que reconocer es que
 * ahí vive alguien con quien se habla.
 */
export function dibujarNpc(ctx, marca, vista) {
    const paso = vista.paso;
    const centroX = vista.x + paso / 2;
    const centroY = vista.y + paso * 0.34;
    const radioCabeza = paso * 0.16;

    ctx.save();

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = marca.color;
    ctx.beginPath();
    ctx.arc(centroX, vista.y + paso / 2, paso * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Cabeza
    ctx.fillStyle = marca.colorClaro;
    ctx.strokeStyle = marca.color;
    ctx.lineWidth = Math.max(1, paso * 0.06);
    ctx.beginPath();
    ctx.arc(centroX, centroY + radioCabeza, radioCabeza, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cuerpo: un trapecio, que es lo que hace que se lea como una figura de pie.
    ctx.fillStyle = marca.color;
    ctx.beginPath();
    ctx.moveTo(centroX - radioCabeza * 1.5, centroY + radioCabeza * 2.2);
    ctx.lineTo(centroX + radioCabeza * 1.5, centroY + radioCabeza * 2.2);
    ctx.lineTo(centroX + radioCabeza * 1.1, centroY + radioCabeza * 5);
    ctx.lineTo(centroX - radioCabeza * 1.1, centroY + radioCabeza * 5);
    ctx.closePath();
    ctx.fill();

    if (marca.seleccionado) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(vista.x + 1, vista.y + 1, paso - 2, paso - 2);
    }

    ctx.restore();
}

/** Un waypoint: el rombo amarillo de siempre. */
export function dibujarWaypoint(ctx, marca, vista) {
    const paso = vista.paso;
    const centroX = vista.x + paso / 2;
    const centroY = vista.y + paso / 2;
    const tamano = Math.max(2, Math.min(paso * 0.28, 7));

    ctx.save();
    ctx.fillStyle = marca.color;
    ctx.beginPath();
    ctx.moveTo(centroX, centroY - tamano);
    ctx.lineTo(centroX + tamano, centroY);
    ctx.lineTo(centroX, centroY + tamano);
    ctx.lineTo(centroX - tamano, centroY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/**
 * La etiqueta del marcador, encima de su casilla.
 *
 * Lleva fondo porque el mapa está detrás y un texto suelto sobre hierba o sobre piedra no se
 * lee. Es la misma decisión que toma `_drawHover` con la casilla bajo el cursor.
 */
export function dibujarEtiqueta(ctx, marca, vista) {
    const paso = vista.paso;
    const texto = marca.etiqueta;

    ctx.save();
    ctx.font = Math.max(9, Math.min(12, paso * 0.34)) + 'px monospace';
    ctx.textAlign = 'center';

    const ancho = ctx.measureText(texto).width + 8;
    const alto = Math.max(12, paso * 0.4);
    const x = vista.x + paso / 2 - ancho / 2;
    const y = vista.y - alto - 1;

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(Math.round(x), Math.round(y), ancho, alto);

    ctx.fillStyle = marca.colorClaro;
    ctx.fillText(texto, vista.x + paso / 2, Math.round(y + alto * 0.75));

    ctx.restore();
}
