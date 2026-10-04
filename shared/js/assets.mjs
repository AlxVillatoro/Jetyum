/**
 * EL FORMATO DE LOS ASSETS: sprites de 32x32 y «things» (lo que en Tibia son `Tibia.spr` y
 * `Tibia.dat`).
 *
 * Este módulo es PURO —no toca disco, ni lienzos, ni red— y lo importan los tres lados: el
 * servidor de herramientas para validar lo que guarda, el cliente para saber qué sprite le
 * toca a cada casilla, y las pruebas. La especificación completa, con ejemplos, está en
 * `docs/SPRITES.md`; aquí está la versión ejecutable, y si discrepan, manda esta.
 *
 * DOS ARCHIVOS, IGUAL QUE EN TIBIA:
 *
 *   - LOS SPRITES (`assets/sprites/`): imágenes de 32x32 numeradas desde el 1, guardadas en
 *     hojas PNG de 32x32 sprites (1024x1024 píxeles). El sprite 0 es «transparente» y no se
 *     guarda. Un sprite no sabe a qué objeto pertenece: es una pieza suelta, y varias cosas
 *     pueden compartir la misma pieza.
 *   - LAS COSAS (`assets/things.json`): cada objeto, aspecto, efecto y proyectil, con su
 *     tamaño en casillas, sus capas, sus patrones, sus fotogramas, sus banderas y la LISTA
 *     ORDENADA de sprites que lo forman.
 *
 * EL ORDEN DE LA LISTA ES EL DE TIBIA (OTClient `ThingType::getSpriteIndex`), y es lo que hay
 * que respetar para que un objeto importado de ObjectBuilder se vea igual aquí:
 *
 *     indice = ((((((fotograma * pz + z) * py + y) * px + x) * capas + capa) * alto + h) * ancho + w)
 *
 * `w = 0, h = 0` es la casilla del ANCLA, la de abajo a la derecha; `w` crece hacia la
 * izquierda y `h` hacia arriba. Un árbol de 2x2 se apoya en su casilla y sobresale hacia arriba
 * y a la izquierda, que es lo que da el volumen 2.5D.
 */

/** El lado de un sprite, en píxeles. No es configurable: es el contrato. */
export const SPRITE_SIZE = 32;

/** Sprites por fila y por columna de cada hoja PNG. */
export const SHEET_COLUMNS = 32;
export const SHEET_ROWS = 32;
export const SPRITES_PER_SHEET = SHEET_COLUMNS * SHEET_ROWS;

/** Bytes de un sprite en RGBA. */
export const SPRITE_BYTES = SPRITE_SIZE * SPRITE_SIZE * 4;

export const THINGS_FORMAT = 'jetyum-things';
export const SPRITES_FORMAT = 'jetyum-sprites';
export const FORMAT_VERSION = 1;

/**
 * Las cuatro categorías, con el PRIMER IDENTIFICADOR de cada una. Es la numeración de Tibia:
 * los objetos empiezan en el 100 (por debajo hay identificadores reservados del protocolo) y
 * el resto en el 1.
 */
export const CATEGORIES = {
    items: { firstId: 100, label: 'Objetos', singular: 'objeto' },
    outfits: { firstId: 1, label: 'Aspectos', singular: 'aspecto' },
    effects: { firstId: 1, label: 'Efectos', singular: 'efecto' },
    missiles: { firstId: 1, label: 'Proyectiles', singular: 'proyectil' }
};

export const CATEGORY_NAMES = Object.keys(CATEGORIES);

/** Límites de cada dimensión. Tibia usa un byte para casi todas. */
export const LIMITS = {
    width: [1, 8],
    height: [1, 8],
    exactSize: [32, 256],
    layers: [1, 4],
    patternX: [1, 8],
    patternY: [1, 8],
    patternZ: [1, 4],
    frames: [1, 64]
};

export const DIMENSIONS = Object.keys(LIMITS);

/**
 * El catálogo de BANDERAS, con los nombres de ObjectBuilder y del `.dat` 8.60.
 *
 * `valor` dice qué lleva la bandera además de estar o no estar:
 *   - null:      sólo presencia (`"pickupable": true`)
 *   - 'numero':  un entero (`"elevation": 8`)
 *   - objeto:    varios campos con nombre (`"light": {"level": 3, "color": 215}`)
 *
 * `servidor` es la bandera de `items.xml` que dice LO MISMO para el motor. En Tibia es
 * `items.otb` quien la copia del `.dat`; aquí la herramienta de coherencia compara las dos
 * y avisa si no coinciden, porque un muro que el cliente cree atravesable y el motor no es
 * un fallo que no se ve hasta que alguien choca con él.
 */
export const FLAGS = [
    { key: 'ground', grupo: 'Suelo', etiqueta: 'Suelo', valor: { speed: 150 }, servidor: 'isGround',
      ayuda: 'Es suelo: uno por casilla, siempre abajo. speed es la velocidad de paso (100 rápido, 150 normal, 300 lento).' },
    { key: 'groundBorder', grupo: 'Suelo', etiqueta: 'Borde de suelo', valor: null,
      ayuda: 'Borde que se dibuja justo encima del suelo, antes que los demás objetos.' },
    { key: 'fullGround', grupo: 'Suelo', etiqueta: 'Suelo completo', valor: null,
      ayuda: 'El suelo tapa toda la casilla: lo de las plantas de abajo no se ve.' },
    { key: 'onBottom', grupo: 'Orden', etiqueta: 'Abajo (onBottom)', valor: null, servidor: 'onBottom',
      ayuda: 'Se dibuja antes que los objetos normales: muros, columnas.' },
    { key: 'onTop', grupo: 'Orden', etiqueta: 'Encima (onTop)', valor: null, servidor: 'alwaysOnTop',
      ayuda: 'Se dibuja por encima de las criaturas: marcos de puerta, tejados bajos.' },
    { key: 'notWalkable', grupo: 'Paso', etiqueta: 'No se puede pisar', valor: null, servidor: 'blocksSolid',
      ayuda: 'Bloquea el paso de las criaturas.' },
    { key: 'blockProjectile', grupo: 'Paso', etiqueta: 'Bloquea proyectiles', valor: null, servidor: 'blocksProjectile',
      ayuda: 'Los ataques a distancia no lo atraviesan.' },
    { key: 'notPathable', grupo: 'Paso', etiqueta: 'Evitar al buscar camino', valor: null, servidor: 'blocksPathfind',
      ayuda: 'La búsqueda de caminos lo rodea (fuego, campos).' },
    { key: 'notMoveable', grupo: 'Uso', etiqueta: 'No se puede mover', valor: null,
      ayuda: 'No se puede arrastrar.' },
    { key: 'pickupable', grupo: 'Uso', etiqueta: 'Se puede coger', valor: null, servidor: 'pickupable',
      ayuda: 'Se puede llevar en el inventario.' },
    { key: 'stackable', grupo: 'Uso', etiqueta: 'Apilable', valor: null, servidor: 'stackable',
      ayuda: 'Varios en una sola pieza con cantidad. Con patternX=4 y patternY=2 el dibujo cambia con la cantidad (1,2,3,4,5,10,25,50).' },
    { key: 'container', grupo: 'Uso', etiqueta: 'Contenedor', valor: null, servidor: 'isContainer',
      ayuda: 'Lleva objetos dentro.' },
    { key: 'forceUse', grupo: 'Uso', etiqueta: 'Uso directo', valor: null, servidor: 'useable',
      ayuda: 'Se usa con clic, sin elegir objetivo (palancas).' },
    { key: 'multiUse', grupo: 'Uso', etiqueta: 'Usar con...', valor: null, servidor: 'useable',
      ayuda: 'Se usa sobre otra cosa (pociones, cuerdas, palas).' },
    { key: 'writable', grupo: 'Uso', etiqueta: 'Se puede escribir', valor: { maxLength: 512 },
      ayuda: 'Cartas, pizarras.' },
    { key: 'writableOnce', grupo: 'Uso', etiqueta: 'Se escribe una vez', valor: { maxLength: 512 },
      ayuda: 'Libros que se firman una vez.' },
    { key: 'fluidContainer', grupo: 'Uso', etiqueta: 'Recipiente de líquido', valor: null,
      ayuda: 'Frascos, cubos: el dibujo cambia con el líquido.' },
    { key: 'splash', grupo: 'Uso', etiqueta: 'Charco', valor: null,
      ayuda: 'Charco de líquido en el suelo.' },
    { key: 'hangable', grupo: 'Pared', etiqueta: 'Se cuelga', valor: null,
      ayuda: 'Se puede colgar en una pared.' },
    { key: 'vertical', grupo: 'Pared', etiqueta: 'Pared vertical', valor: null,
      ayuda: 'Pared que admite objetos colgados de lado.' },
    { key: 'horizontal', grupo: 'Pared', etiqueta: 'Pared horizontal', valor: null,
      ayuda: 'Pared que admite objetos colgados de frente.' },
    { key: 'rotatable', grupo: 'Uso', etiqueta: 'Se puede girar', valor: null,
      ayuda: 'Tiene versión girada.' },
    { key: 'light', grupo: 'Dibujo', etiqueta: 'Luz', valor: { level: 3, color: 215 },
      ayuda: 'Emite luz: level es el radio y color un índice de la paleta de 216 colores.' },
    { key: 'dontHide', grupo: 'Dibujo', etiqueta: 'No ocultar', valor: null,
      ayuda: 'No se oculta al ver plantas de arriba.' },
    { key: 'translucent', grupo: 'Dibujo', etiqueta: 'Translúcido', valor: null,
      ayuda: 'Se dibuja semitransparente.' },
    { key: 'offset', grupo: 'Dibujo', etiqueta: 'Desplazamiento', valor: { x: 0, y: 0 },
      ayuda: 'Píxeles que se desplaza el dibujo hacia arriba-izquierda (negativo: abajo-derecha). Los aspectos suelen llevar 8,8.' },
    { key: 'elevation', grupo: 'Dibujo', etiqueta: 'Elevación', valor: 'numero', valorPorDefecto: 8,
      ayuda: 'Lo que se pone encima se dibuja tantos píxeles más arriba (mesas, cajas).' },
    { key: 'hd', grupo: 'Dibujo', etiqueta: 'Alta resolución (HD)', valor: null,
      ayuda: 'El dibujo es de 64 px por casilla (docs/ARTE-HD.md): se pinta a media escala, con el doble de detalle.' },
    { key: 'lyingObject', grupo: 'Dibujo', etiqueta: 'Tumbado', valor: null,
      ayuda: 'Cadáveres y objetos tumbados.' },
    { key: 'animateAlways', grupo: 'Dibujo', etiqueta: 'Animar siempre', valor: null,
      ayuda: 'Se anima aunque no se mueva (fuego, agua).' },
    { key: 'minimap', grupo: 'Dibujo', etiqueta: 'Color en minimapa', valor: 'numero', valorPorDefecto: 0,
      ayuda: 'Índice de color (0-215) en el minimapa.' },
    { key: 'ignoreLook', grupo: 'Dibujo', etiqueta: 'Ignorar al mirar', valor: null,
      ayuda: 'Mirar la casilla describe lo de debajo.' },
    { key: 'lensHelp', grupo: 'Dibujo', etiqueta: 'Ayuda (lente)', valor: 'numero', valorPorDefecto: 1100,
      ayuda: 'Texto de ayuda del cliente.' },
    { key: 'cloth', grupo: 'Equipo', etiqueta: 'Ropa (ranura)', valor: 'numero', valorPorDefecto: 4,
      ayuda: 'Ranura de equipo: 1 cabeza, 2 cuello, 3 espalda, 4 cuerpo, 5 derecha, 6 izquierda, 7 piernas, 8 pies, 9 anillo, 10 munición.' }
];

export const FLAG_KEYS = FLAGS.map((flag) => flag.key);

const FLAG_BY_KEY = new Map(FLAGS.map((flag) => [flag.key, flag]));

export function flagInfo(key) {
    return FLAG_BY_KEY.get(key) || null;
}

/** Las direcciones del patrón X de un aspecto: el orden de Tibia. */
export const DIRECTIONS = ['norte', 'este', 'sur', 'oeste'];

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

function entero(valor, defecto) {
    const n = Math.trunc(Number(valor));
    return Number.isFinite(n) ? n : defecto;
}

/** Las dimensiones de una cosa, con los valores por defecto. */
export function dimensionsOf(thing) {
    const t = thing || {};
    return {
        width: entero(t.width, 1),
        height: entero(t.height, 1),
        exactSize: entero(t.exactSize, SPRITE_SIZE * Math.max(entero(t.width, 1), entero(t.height, 1))),
        layers: entero(t.layers, 1),
        patternX: entero(t.patternX, 1),
        patternY: entero(t.patternY, 1),
        patternZ: entero(t.patternZ, 1),
        frames: entero(t.frames, 1)
    };
}

/** Cuántos sprites tiene que tener la lista de una cosa. */
export function spriteCount(thing) {
    const d = dimensionsOf(thing);
    return d.width * d.height * d.layers * d.patternX * d.patternY * d.patternZ * d.frames;
}

/**
 * La posición en la lista de sprites de una pieza. Es LA fórmula de Tibia (ver la cabecera).
 */
export function spriteIndex(thing, w, h, layer, px, py, pz, frame) {
    const d = dimensionsOf(thing);
    return ((((((frame * d.patternZ + pz) * d.patternY + py) * d.patternX + px) *
        d.layers + layer) * d.height + h) * d.width + w);
}

/** La operación inversa: de índice a coordenadas. La usa el editor para rotular las piezas. */
export function spriteCoords(thing, index) {
    const d = dimensionsOf(thing);
    let resto = index;
    const w = resto % d.width; resto = Math.floor(resto / d.width);
    const h = resto % d.height; resto = Math.floor(resto / d.height);
    const layer = resto % d.layers; resto = Math.floor(resto / d.layers);
    const px = resto % d.patternX; resto = Math.floor(resto / d.patternX);
    const py = resto % d.patternY; resto = Math.floor(resto / d.patternY);
    const pz = resto % d.patternZ; resto = Math.floor(resto / d.patternZ);
    return { w, h, layer, px, py, pz, frame: resto };
}

/**
 * Cambia las dimensiones de una cosa CONSERVANDO las piezas que siguen existiendo.
 *
 * Pasar de 1x1 a 2x2 no puede desordenar los sprites que ya estaban: cada pieza vieja se
 * busca por sus coordenadas y se copia a su sitio en la lista nueva. Las piezas nuevas quedan
 * a 0 (transparentes). Sin esto, ampliar un objeto mezclaría sus dibujos.
 */
export function resizeThing(thing, changes) {
    const antes = dimensionsOf(thing);
    const viejos = Array.isArray(thing.sprites) ? thing.sprites : [];
    const nueva = { ...thing };

    DIMENSIONS.forEach((dim) => {
        if (changes[dim] !== undefined) {
            const [min, max] = LIMITS[dim];
            nueva[dim] = Math.max(min, Math.min(max, entero(changes[dim], antes[dim])));
        }
    });

    const total = spriteCount(nueva);
    const sprites = new Array(total).fill(0);

    for (let i = 0; i < viejos.length; i += 1) {
        const c = spriteCoords(thing, i);
        const cabe = c.w < dimensionsOf(nueva).width && c.h < dimensionsOf(nueva).height &&
            c.layer < dimensionsOf(nueva).layers && c.px < dimensionsOf(nueva).patternX &&
            c.py < dimensionsOf(nueva).patternY && c.pz < dimensionsOf(nueva).patternZ &&
            c.frame < dimensionsOf(nueva).frames;
        if (cabe) {
            sprites[spriteIndex(nueva, c.w, c.h, c.layer, c.px, c.py, c.pz, c.frame)] = viejos[i];
        }
    }

    nueva.sprites = sprites;

    if (dimensionsOf(nueva).frames > 1) {
        nueva.animation = normalizeAnimation(nueva.animation, dimensionsOf(nueva).frames);
    } else {
        delete nueva.animation;
    }

    return nueva;
}

/** La animación con un tramo por fotograma. */
export function normalizeAnimation(animation, frames) {
    const a = animation || {};
    const duraciones = Array.isArray(a.durations) ? a.durations.slice(0, frames) : [];
    while (duraciones.length < frames) {
        duraciones.push(duraciones.length > 0 ? duraciones[duraciones.length - 1].slice() : [200, 200]);
    }
    return {
        mode: a.mode === 'sync' ? 'sync' : 'async',
        loop: Math.max(0, entero(a.loop, 0)),
        start: Math.max(0, Math.min(frames - 1, entero(a.start, 0))),
        durations: duraciones.map((par) => {
            const min = Math.max(1, entero(Array.isArray(par) ? par[0] : par, 200));
            const max = Math.max(min, entero(Array.isArray(par) ? par[1] : par, min));
            return [min, max];
        })
    };
}

/**
 * El fotograma que toca en un instante.
 *
 * Se usa el MÍNIMO de cada tramo: con el mismo reloj, dos clientes ven el mismo fotograma, y
 * para un editor eso importa más que el azar entre mínimo y máximo que hace Tibia.
 *
 * @param {Object} thing
 * @param {number} ahora milisegundos de un reloj cualquiera
 * @param {number} [desfase] para que dos antorchas no parpadeen a la vez
 */
export function frameAt(thing, ahora, desfase) {
    const d = dimensionsOf(thing);
    if (d.frames <= 1 || !Number.isFinite(ahora)) {
        return 0;
    }
    const anim = normalizeAnimation(thing.animation, d.frames);
    const total = anim.durations.reduce((suma, par) => suma + par[0], 0);
    if (total <= 0) {
        return 0;
    }
    let t = (Math.max(0, ahora + (desfase || 0))) % total;
    for (let i = 0; i < anim.durations.length; i += 1) {
        if (t < anim.durations[i][0]) {
            return i;
        }
        t -= anim.durations[i][0];
    }
    return 0;
}

/**
 * El patrón de un objeto según dónde está y cuántos hay. Es `ItemType::calculatePattern` de
 * OTClient: los apilables con 4x2 patrones cambian de dibujo con la cantidad, y el resto
 * (suelos, muros) repite su patrón según la posición, que es lo que evita que un prado de
 * hierba se vea como un mosaico.
 */
export function itemPattern(thing, context) {
    const d = dimensionsOf(thing);
    const ctx = context || {};
    const flags = thing.flags || {};

    if (flags.stackable && d.patternX === 4 && d.patternY === 2) {
        const count = entero(ctx.count, 1);
        let i;
        if (count <= 0) { i = 0; }
        else if (count < 5) { i = count - 1; }
        else if (count < 10) { i = 4; }
        else if (count < 25) { i = 5; }
        else if (count < 50) { i = 6; }
        else { i = 7; }
        return { x: i % 4, y: Math.floor(i / 4), z: 0 };
    }

    const modulo = (valor, n) => ((entero(valor, 0) % n) + n) % n;
    return {
        x: modulo(ctx.x, d.patternX),
        y: modulo(ctx.y, d.patternY),
        z: modulo(ctx.z, d.patternZ)
    };
}

/** Sprite y desplazamiento en el que cae una hoja. */
export function sheetOf(spriteId) {
    const indice = spriteId - 1;
    const hoja = Math.floor(indice / SPRITES_PER_SHEET);
    const dentro = indice % SPRITES_PER_SHEET;
    return {
        sheet: hoja,
        column: dentro % SHEET_COLUMNS,
        row: Math.floor(dentro / SHEET_COLUMNS),
        x: (dentro % SHEET_COLUMNS) * SPRITE_SIZE,
        y: Math.floor(dentro / SHEET_COLUMNS) * SPRITE_SIZE
    };
}

/** El nombre de archivo de una hoja: `sprites-0000.png`. */
export function sheetFileName(sheet) {
    return 'sprites-' + String(sheet).padStart(4, '0') + '.png';
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

function normalizeFlagValue(info, raw) {
    if (raw === undefined || raw === null || raw === false) {
        return undefined;
    }
    if (info.valor === null) {
        return true;
    }
    if (info.valor === 'numero') {
        const n = entero(typeof raw === 'object' ? raw.value : raw, info.valorPorDefecto || 0);
        return n;
    }
    const salida = {};
    Object.keys(info.valor).forEach((campo) => {
        const fuente = typeof raw === 'object' ? raw[campo] : undefined;
        salida[campo] = entero(fuente, info.valor[campo]);
    });
    return salida;
}

/**
 * Deja una cosa en su forma canónica y dice qué estaba mal.
 *
 * NO LANZA: devuelve la cosa arreglada y la lista de problemas, igual que el validador de mapas,
 * porque corregir un archivo de mil objetos de uno en uno es la fricción que hace que nadie valide.
 */
export function normalizeThing(raw, category, problems, spriteLimit) {
    const donde = category + ' ' + (raw && raw.id);
    const out = { id: entero(raw && raw.id, 0) };
    const lista = problems || [];

    if (!CATEGORIES[category]) {
        lista.push('categoría desconocida: ' + category);
    } else if (out.id < CATEGORIES[category].firstId) {
        lista.push(donde + ': el identificador tiene que ser >= ' + CATEGORIES[category].firstId);
    }

    if (raw && typeof raw.name === 'string' && raw.name.trim()) {
        out.name = raw.name.trim();
    }

    DIMENSIONS.forEach((dim) => {
        const [min, max] = LIMITS[dim];
        const defecto = dim === 'exactSize'
            ? SPRITE_SIZE * Math.max(entero(raw && raw.width, 1), entero(raw && raw.height, 1))
            : 1;
        const valor = entero(raw && raw[dim], defecto);
        if (valor < min || valor > max) {
            lista.push(donde + ': ' + dim + ' fuera de rango (' + min + '-' + max + '): ' + valor);
        }
        out[dim] = Math.max(min, Math.min(max, valor));
    });

    const flags = {};
    const rawFlags = (raw && raw.flags) || {};
    Object.keys(rawFlags).forEach((key) => {
        const info = flagInfo(key);
        if (!info) {
            lista.push(donde + ': bandera desconocida "' + key + '"');
            return;
        }
        const valor = normalizeFlagValue(info, rawFlags[key]);
        if (valor !== undefined) {
            flags[key] = valor;
        }
    });
    out.flags = flags;

    const total = spriteCount(out);
    const sprites = Array.isArray(raw && raw.sprites) ? raw.sprites.map((s) => entero(s, 0)) : [];
    if (sprites.length !== total) {
        lista.push(donde + ': tiene ' + sprites.length + ' sprites y sus dimensiones piden ' + total);
    }
    while (sprites.length < total) {
        sprites.push(0);
    }
    sprites.length = total;
    sprites.forEach((id, i) => {
        if (id < 0 || (spriteLimit !== undefined && id > spriteLimit)) {
            lista.push(donde + ': el sprite ' + id + ' (pieza ' + i + ') no existe');
            sprites[i] = 0;
        }
    });
    out.sprites = sprites;

    if (out.frames > 1) {
        out.animation = normalizeAnimation(raw && raw.animation, out.frames);
    }

    return out;
}

/** Un `things.json` vacío y válido. */
export function emptyThings() {
    const data = { format: THINGS_FORMAT, version: FORMAT_VERSION, spriteSize: SPRITE_SIZE };
    CATEGORY_NAMES.forEach((name) => {
        data[name] = [];
    });
    return data;
}

/**
 * Valida un `things.json` entero: formato, identificadores repetidos y cada cosa.
 *
 * @returns {{data: Object, problems: string[]}}
 */
export function normalizeThings(raw, spriteLimit) {
    const problems = [];
    const data = emptyThings();

    if (!raw || raw.format !== THINGS_FORMAT) {
        problems.push('no es un archivo ' + THINGS_FORMAT);
    }
    if (raw && raw.version !== undefined && raw.version !== FORMAT_VERSION) {
        problems.push('versión ' + raw.version + ' no soportada');
    }

    CATEGORY_NAMES.forEach((category) => {
        const vistos = new Set();
        const lista = Array.isArray(raw && raw[category]) ? raw[category] : [];
        lista.forEach((thing) => {
            const normal = normalizeThing(thing, category, problems, spriteLimit);
            if (vistos.has(normal.id)) {
                problems.push(category + ' ' + normal.id + ': identificador repetido');
                return;
            }
            vistos.add(normal.id);
            data[category].push(normal);
        });
        data[category].sort((a, b) => a.id - b.id);
    });

    return { data, problems };
}

/** El primer identificador libre de una categoría. */
export function nextFreeId(list, category) {
    const usados = new Set(list.map((thing) => thing.id));
    let id = CATEGORIES[category].firstId;
    while (usados.has(id)) {
        id += 1;
    }
    return id;
}

/** ¿Tiene algún sprite que no sea transparente? */
export function hasSprites(thing) {
    return Array.isArray(thing && thing.sprites) && thing.sprites.some((id) => id > 0);
}

/**
 * Escribe `things.json` con UNA COSA POR LÍNEA.
 *
 * Es por el diff: con el JSON indentado de siempre, un objeto de 2x2 con 4 fotogramas ocupa
 * cien líneas y cambiarle una bandera hace un diff ilegible. Una línea por cosa hace que el
 * diff diga «cambió el objeto 1387» y nada más.
 */
export function serializeThings(data) {
    const lineas = ['{'];
    lineas.push('    "format": ' + JSON.stringify(THINGS_FORMAT) + ',');
    lineas.push('    "version": ' + FORMAT_VERSION + ',');
    lineas.push('    "spriteSize": ' + SPRITE_SIZE + ',');
    if (data._comment) {
        lineas.push('    "_comment": ' + JSON.stringify(data._comment) + ',');
    }
    CATEGORY_NAMES.forEach((category, i) => {
        const lista = data[category] || [];
        const final = i === CATEGORY_NAMES.length - 1 ? '' : ',';
        if (lista.length === 0) {
            lineas.push('    "' + category + '": []' + final);
            return;
        }
        lineas.push('    "' + category + '": [');
        lista.forEach((thing, j) => {
            lineas.push('        ' + JSON.stringify(thing) + (j === lista.length - 1 ? '' : ','));
        });
        lineas.push('    ]' + final);
    });
    lineas.push('}');
    return lineas.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Coherencia con items.xml
// ---------------------------------------------------------------------------

function puesto(valor) {
    return valor === true || valor === 1 || valor === '1' || valor === 'true';
}

/**
 * Compara las banderas del cliente (things) con las del servidor (items.xml).
 *
 * En Tibia esto lo garantiza `items.otb`, que se genera desde el `.dat`. Aquí son dos archivos
 * escritos por personas, así que se comprueban: un objeto que el cliente dibuja como suelo y el
 * motor trata como mueble se ve bien y se juega mal.
 *
 * @param {Object} things el things.json normalizado
 * @param {Array<{id:number, name:string, attributes:Object}>} items los de items.xml, expandidos
 * @returns {{faltan: number[], sinDibujo: number[], sobran: number[], banderas: string[]}}
 */
export function checkCoherence(things, items) {
    const porId = new Map(things.items.map((thing) => [thing.id, thing]));
    const deServidor = new Map(items.map((item) => [item.id, item]));
    const informe = { faltan: [], sinDibujo: [], sobran: [], banderas: [] };

    items.forEach((item) => {
        const thing = porId.get(item.id);
        if (!thing) {
            informe.faltan.push(item.id);
            return;
        }
        if (!hasSprites(thing)) {
            informe.sinDibujo.push(item.id);
        }
        const attrs = item.attributes || {};
        const comparadas = new Set();
        FLAGS.forEach((flag) => {
            if (!flag.servidor || comparadas.has(flag.servidor)) {
                return;
            }
            // forceUse y multiUse dicen los dos «useable»: basta con uno.
            const enCliente = FLAGS.some((f) => f.servidor === flag.servidor && thing.flags[f.key] !== undefined);
            comparadas.add(flag.servidor);
            const enServidor = puesto(attrs[flag.servidor]);
            if (enCliente !== enServidor) {
                informe.banderas.push(item.id + ' (' + (item.name || '?') + '): ' + flag.servidor +
                    (enServidor ? ' está en items.xml y no en things' : ' está en things y no en items.xml'));
            }
        });
    });

    porId.forEach((thing, id) => {
        if (!deServidor.has(id)) {
            informe.sobran.push(id);
        }
    });

    return informe;
}

/** Las banderas de cliente que corresponden a los atributos de items.xml. */
export function flagsFromServer(attributes) {
    const attrs = attributes || {};
    const flags = {};
    FLAGS.forEach((flag) => {
        if (flag.servidor && puesto(attrs[flag.servidor]) && flag.key !== 'multiUse') {
            flags[flag.key] = flag.valor && typeof flag.valor === 'object' ? { ...flag.valor } : true;
        }
    });
    if (flags.ground && attrs.speed !== undefined) {
        flags.ground.speed = entero(attrs.speed, 150);
    }
    return flags;
}
