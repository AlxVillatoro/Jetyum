'use strict';

/**
 * Los ARCHIVOS de mapa: crear uno nuevo, guardar como, cambiar sus propiedades y las copias de
 * seguridad.
 *
 * Vive aparte de `server.js` porque son las reglas sobre el DISCO —qué nombre puede tener un
 * archivo, dónde van las copias, cuántas se guardan, cómo se crea un archivo sin pisar otro— y no
 * sobre el CONTENIDO del mapa, que sigue siendo cosa del cargador y del escritor del motor. El
 * servidor junta las dos cosas: valida el contenido con el motor y escribe con lo de aquí.
 *
 * POR QUÉ COPIAS DE SEGURIDAD SI YA SE COMPRUEBA LA IDA Y VUELTA. Porque la ida y vuelta protege
 * de un archivo ROTO, no de un archivo CORRECTO Y EQUIVOCADO: un cubo que rellena media planta
 * con lava, un respawn borrado sin querer o un guardado encima del mapa bueno con el mapa de
 * pruebas son mapas perfectamente válidos, y sin copias no hay forma de volver atrás. El deshacer
 * del editor vive en la pestaña y se pierde al cerrarla; las copias viven en el disco.
 *
 * Todo lo de aquí recibe la carpeta de mapas como argumento, en vez de leerla de un sitio
 * global, para que las pruebas trabajen sobre copias temporales igual que el resto del servidor.
 */

const fs = require('fs');
const path = require('path');

/** Los límites de tamaño de un mapa, en casillas, para el ancho y para el alto. */
const TAMANO_MINIMO = 16;
const TAMANO_MAXIMO = 4096;

/**
 * Las plantas: Tibia tiene 16 (de la 0, lo más alto, a la 15) y la 7 es la superficie. Un mapa
 * NUEVO necesita al menos 8, porque su templo va en la superficie; uno existente puede tener
 * menos si se escribió así a mano, y cambiar sus propiedades no se lo va a impedir.
 */
const PLANTAS_MAXIMO = 16;
const PLANTA_SUPERFICIE = 7;
const PLANTAS_POR_DEFECTO = 16;

/**
 * CUÁNTAS COPIAS SE GUARDAN DE CADA MAPA. Diez guardados hacia atrás bastan para deshacer un
 * desastre de la última sesión y no llenan el disco: un mapa grande ocupa unos cientos de KB, así
 * que diez son unos pocos MB. Las más viejas se borran solas al crear una nueva.
 */
const COPIAS_POR_MAPA = 10;

/** La carpeta de las copias, DENTRO de la de mapas: `data/world/backups/<nombre>/`. */
const CARPETA_COPIAS = 'backups';

const SUFIJO = '.map.json';

/** Un nombre de archivo de mapa no tiene por qué ser una frase. */
const LARGO_MAXIMO_NOMBRE = 64;

/**
 * Los nombres que WINDOWS NO DEJA USAR como archivo, aunque lleven extensión: `con.map.json` no
 * se puede crear. El repositorio se usa en Windows, así que se rechazan en todas partes; si no,
 * un mapa creado en Linux rompería el `git checkout` de quien trabaje en Windows.
 */
const NOMBRES_RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** El sello de tiempo de una copia: `20261031T142305123Z`, en UTC para que ordene bien. */
const PATRON_SELLO = '\\d{8}T\\d{9}Z';

// ---------------------------------------------------------------------------
// Nombres y tamaños
// ---------------------------------------------------------------------------

/**
 * Valida el nombre de un mapa NUEVO (al crearlo, al guardarlo como, al renombrarlo).
 *
 * Es más estricto que `safeMapName` del servidor, que sólo dice si un nombre se puede leer sin
 * salirse de la carpeta: un nombre nuevo además no puede ser un nombre reservado de Windows ni
 * tener más de 64 letras.
 *
 * @returns {{nombre: string}|{error: string}}
 */
function validarNombreNuevo(valor) {
    const nombre = String(valor === undefined || valor === null ? '' : valor).trim();

    if (nombre === '') {
        return { error: 'falta el nombre del mapa' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(nombre)) {
        return { error: 'el nombre del mapa solo puede llevar letras sin acentos, numeros, - y _: ' +
            JSON.stringify(nombre) };
    }
    if (nombre.length > LARGO_MAXIMO_NOMBRE) {
        return { error: 'el nombre del mapa pasa de ' + LARGO_MAXIMO_NOMBRE + ' letras' };
    }
    if (NOMBRES_RESERVADOS.test(nombre)) {
        return { error: 'el nombre ' + nombre + ' esta reservado por Windows y no puede ser un archivo' };
    }
    return { nombre: nombre };
}

/**
 * ¿Hay ya un mapa con ese nombre, SIN MIRAR MAYÚSCULAS? Devuelve el nombre que hay, o null.
 *
 * Sin mirar mayúsculas porque Windows y macOS no las distinguen: en Linux `Aldea.map.json` y
 * `aldea.map.json` serían dos mapas, y al clonar el repositorio en Windows uno pisaría al otro.
 */
function mapaExistente(carpeta, nombre) {
    if (!fs.existsSync(carpeta)) {
        return null;
    }
    const buscado = (nombre + SUFIJO).toLowerCase();
    const encontrado = fs.readdirSync(carpeta).find((archivo) => archivo.toLowerCase() === buscado);
    return encontrado ? encontrado.slice(0, -SUFIJO.length) : null;
}

/** El problema de un ancho o un alto, o null si está bien. */
function problemaDeTamano(valor, etiqueta) {
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < TAMANO_MINIMO || numero > TAMANO_MAXIMO) {
        return 'el ' + etiqueta + ' tiene que ser un numero entero de ' + TAMANO_MINIMO + ' a ' +
            TAMANO_MAXIMO + ' casillas: ' + JSON.stringify(valor);
    }
    return null;
}

/** El problema del número de plantas, o null. `minimo` cambia entre crear (8) y editar (1). */
function problemaDePlantas(valor, minimo) {
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < minimo || numero > PLANTAS_MAXIMO) {
        return 'las plantas tienen que ser un numero entero de ' + minimo + ' a ' + PLANTAS_MAXIMO +
            ': ' + JSON.stringify(valor);
    }
    return null;
}

/**
 * El problema de un suelo, o null.
 *
 * Tiene que EXISTIR en items.xml y SER SUELO (`isGround`): un muro como suelo por defecto haría
 * del mapa entero una pared. Y si `transitable`, además no puede bloquear el paso, que es lo que
 * se le pide al de la superficie de un mapa nuevo: el templo cae encima, y el cargador rechaza un
 * waypoint sobre una casilla que no se puede pisar.
 *
 * @param {Map<number, Object>} itemTypes
 */
function problemaDeSuelo(itemTypes, valor, etiqueta, transitable) {
    const id = Number(valor);
    const definicion = Number.isInteger(id) ? itemTypes.get(id) : null;

    if (!definicion) {
        return etiqueta + ': el objeto ' + JSON.stringify(valor) + ' no existe en items.xml';
    }

    const atributos = definicion.attributes || {};
    const activo = (clave) => atributos[clave] === true || atributos[clave] === 1 ||
        atributos[clave] === '1' || atributos[clave] === 'true';

    if (!activo('isGround')) {
        return etiqueta + ': el objeto ' + id + ' (' + (definicion.name || 'sin nombre') +
            ') no es un suelo';
    }
    if (transitable && activo('blocksSolid')) {
        return etiqueta + ': el suelo ' + id + ' (' + (definicion.name || 'sin nombre') +
            ') no se puede pisar, y el templo va encima';
    }
    return null;
}

// ---------------------------------------------------------------------------
// El mapa mínimo
// ---------------------------------------------------------------------------

/**
 * El contenido de un mapa NUEVO: lo justo para que el motor lo arranque.
 *
 * El cargador sólo exige el formato, la versión y un tamaño mayor que cero; pero un mapa que el
 * MOTOR pueda usar necesita además un sitio donde aparecer los jugadores. Por eso lleva:
 *
 *   - el suelo por defecto de la superficie (la planta 7), que es todo el terreno: el mapa entero
 *     es un prado (o lo que se elija) y no hay ni una casilla escrita;
 *   - una CIUDAD con su templo en el centro, que es donde se reaparece (`templeOf` de las reglas);
 *   - y el waypoint `temple` en el mismo sitio, que es lo que miran la sesión y el combate cuando
 *     un personaje no tiene ciudad. Los dos, porque el motor pregunta por los dos.
 *
 * @returns {Object} el mapa en bruto, con la forma de `*.map.json`
 */
function mapaMinimo(opciones) {
    const ancho = Number(opciones.ancho);
    const alto = Number(opciones.alto);
    const templo = [Math.floor(ancho / 2), Math.floor(alto / 2), PLANTA_SUPERFICIE];

    const raw = {
        format: 'jetyum-map',
        version: 1,
        name: opciones.nombre,
        width: ancho,
        height: alto,
        floors: Number(opciones.plantas)
    };

    if (opciones.descripcion) {
        raw._descripcion = String(opciones.descripcion);
    }

    raw.defaultGround = { [PLANTA_SUPERFICIE]: Number(opciones.suelo) };
    if (opciones.respaldo !== undefined && opciones.respaldo !== null && opciones.respaldo !== '') {
        raw.fallbackGround = Number(opciones.respaldo);
    }

    raw.tiles = [];
    raw.waypoints = { temple: templo };
    raw.towns = [{ id: 1, name: String(opciones.ciudad || opciones.nombre), temple: templo }];

    return raw;
}

// ---------------------------------------------------------------------------
// Lo que se queda fuera al encoger un mapa
// ---------------------------------------------------------------------------

/** Cuántos ejemplos se dan de cada clase de cosa que se queda fuera. */
const EJEMPLOS_POR_CLASE = 5;

/**
 * Todo lo que quedaría FUERA de un mapa de `ancho` x `alto` x `plantas`.
 *
 * Se mira el mapa YA SERIALIZADO (la forma de `*.map.json`), que es exactamente lo que se va a
 * escribir: una casilla que sólo tiene el suelo por defecto no se escribe, así que tampoco se
 * pierde nada al dejarla fuera, y no cuenta.
 *
 * EXISTE PORQUE ENCOGER NO PUEDE BORRAR NADA SIN AVISAR. El cargador rechaza una casilla, un
 * respawn o un NPC fuera del mapa —eso ya pararía el guardado—, pero un OBJETO COMPUESTO fuera
 * sólo da un aviso y se descarta, y el suelo por defecto de una planta que deja de existir se
 * ignora sin más. Aquí se cuenta todo, con lo que se perdería, antes de tocar el archivo.
 *
 * @returns {{total: number, porClase: Object, problemas: Array<string>}}
 */
function fueraDeLimites(data, ancho, alto, plantas) {
    const dentro = (x, y, z) => Number(x) >= 0 && Number(y) >= 0 && Number(z) >= 0 &&
        Number(x) < ancho && Number(y) < alto && Number(z) < plantas;
    const porClase = {};
    const ejemplos = {};

    const apuntar = (clase, texto) => {
        porClase[clase] = (porClase[clase] || 0) + 1;
        ejemplos[clase] = ejemplos[clase] || [];
        if (ejemplos[clase].length < EJEMPLOS_POR_CLASE) {
            ejemplos[clase].push(texto);
        }
    };
    const donde = (x, y, z) => '(' + x + ',' + y + ',' + z + ')';
    const de = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

    (data.tiles || []).forEach((t) => {
        if (!dentro(t.x, t.y, t.z)) {
            apuntar('casillas', 'la casilla ' + donde(t.x, t.y, t.z));
        }
    });

    (data.spawns || []).forEach((s) => {
        if (!dentro(s.x, s.y, s.z)) {
            apuntar('respawns', 'el respawn de ' + donde(s.x, s.y, s.z));
            return;
        }
        // Un monstruo con casilla propia fuera del mapa aparecería en ninguna parte.
        (s.monsters || []).forEach((m) => {
            if (m.x !== undefined && m.x !== null && !dentro(m.x, m.y, s.z)) {
                apuntar('monstruos', 'el monstruo "' + m.name + '" en ' + donde(m.x, m.y, s.z));
            }
        });
    });

    (data.npcs || []).forEach((n) => {
        if (!dentro(n.x, n.y, n.z)) {
            apuntar('npcs', 'el npc "' + n.name + '" en ' + donde(n.x, n.y, n.z));
        }
    });

    Object.keys(data.waypoints || {}).forEach((nombre) => {
        const p = de(data.waypoints[nombre]);
        if (!dentro(p[0], p[1], p[2])) {
            apuntar('waypoints', 'el waypoint "' + nombre + '" en ' + donde(p[0], p[1], p[2]));
        }
    });

    (data.towns || []).forEach((t) => {
        const p = de(t.temple);
        if (!dentro(p[0], p[1], p[2])) {
            apuntar('ciudades', 'el templo de la ciudad ' + t.id + ' en ' + donde(p[0], p[1], p[2]));
        }
    });

    (data.houses || []).forEach((h) => {
        if (h.exit) {
            const p = de(h.exit);
            if (!dentro(p[0], p[1], p[2])) {
                apuntar('casas', 'la salida de la casa ' + h.id + ' en ' + donde(p[0], p[1], p[2]));
            }
        }
    });

    (data.composites || []).forEach((c) => {
        if (!dentro(c.x, c.y, c.z)) {
            apuntar('compuestos', 'el compuesto ' + c.uid + ' (' + c.compuesto + ') en ' +
                donde(c.x, c.y, c.z));
        }
    });

    Object.keys(data.defaultGround || {}).forEach((z) => {
        if (Number(z) >= plantas) {
            apuntar('suelos', 'el suelo por defecto de la planta ' + z);
        }
    });

    const problemas = [];
    let total = 0;
    Object.keys(porClase).forEach((clase) => {
        total += porClase[clase];
        const resto = porClase[clase] - ejemplos[clase].length;
        ejemplos[clase].forEach((texto) => problemas.push(texto + ' quedaria fuera del mapa'));
        if (resto > 0) {
            problemas.push('y ' + resto + ' ' + clase + ' mas quedarian fuera del mapa');
        }
    });

    return { total: total, porClase: porClase, problemas: problemas };
}

// ---------------------------------------------------------------------------
// Escribir sin romper y sin pisar
// ---------------------------------------------------------------------------

/**
 * Escribe un archivo de forma atómica: a un `.tmp` y se renombra. Un guardado que se corta a la
 * mitad deja el archivo de antes intacto en vez de uno truncado.
 */
function escribirAtomico(destino, texto) {
    const temporal = destino + '.tmp';
    fs.writeFileSync(temporal, texto, 'utf8');
    fs.renameSync(temporal, destino);
}

/**
 * Crea un archivo NUEVO, atómico y SIN PISAR otro. Devuelve false si ya existía.
 *
 * `rename` pisa lo que haya, así que no vale para «crear si no existe». Se escribe el temporal
 * entero y se ENLAZA con el nombre definitivo: `link` falla con EEXIST si el destino ya existe, y
 * eso es atómico en el sistema de archivos —no hay hueco entre mirar y escribir en el que otra
 * pestaña del editor pueda crear el mismo mapa—. Si el disco no admite enlaces (algún FAT, alguna
 * carpeta de red), se cae a mirar y renombrar, que para una herramienta local basta.
 */
function crearExclusivo(destino, texto) {
    const temporal = destino + '.' + process.pid + '.' + Date.now() + '.tmp';
    fs.writeFileSync(temporal, texto, 'utf8');

    try {
        fs.linkSync(temporal, destino);
        return true;
    } catch (error) {
        if (error.code === 'EEXIST') {
            return false;
        }
        if (fs.existsSync(destino)) {
            return false;
        }
        fs.renameSync(temporal, destino);
        return true;
    } finally {
        if (fs.existsSync(temporal)) {
            fs.unlinkSync(temporal);
        }
    }
}

// ---------------------------------------------------------------------------
// Copias de seguridad
// ---------------------------------------------------------------------------

function carpetaDeCopias(carpeta, nombre) {
    return path.join(carpeta, CARPETA_COPIAS, nombre);
}

/** El sello de una fecha: `20261031T142305123Z`. Ancho fijo, así que ordenar el texto ordena el tiempo. */
function sello(fecha) {
    return fecha.toISOString().replace(/[-:.]/g, '');
}

/** La fecha de un sello, en ISO. */
function fechaDeSello(texto) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/.exec(texto);
    return m ? m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + '.' + m[7] + 'Z' : null;
}

function patronDeCopia(nombre) {
    return new RegExp('^' + nombre + '-(' + PATRON_SELLO + ')\\.map\\.json$');
}

/**
 * Las copias de un mapa, DE LA MÁS NUEVA A LA MÁS VIEJA.
 *
 * Sólo cuenta lo que tiene la forma exacta `<nombre>-<sello>.map.json`: lo que alguien deje a mano
 * en la carpeta ni se lista ni se poda.
 *
 * Se ordena por el sello del nombre y NO por la fecha del archivo, porque copiar un archivo en
 * Windows conserva su fecha de modificación: la copia tendría la fecha del guardado anterior.
 */
function listarCopias(carpeta, nombre) {
    const dir = carpetaDeCopias(carpeta, nombre);
    if (!fs.existsSync(dir)) {
        return [];
    }
    const patron = patronDeCopia(nombre);

    return fs.readdirSync(dir)
        .map((archivo) => ({ archivo: archivo, m: patron.exec(archivo) }))
        .filter((entrada) => entrada.m)
        .sort((a, b) => (a.m[1] < b.m[1] ? 1 : a.m[1] > b.m[1] ? -1 : 0))
        .map((entrada) => ({
            archivo: entrada.archivo,
            fecha: fechaDeSello(entrada.m[1]),
            bytes: fs.statSync(path.join(dir, entrada.archivo)).size
        }));
}

/** Borra las copias que sobran, las más viejas. Devuelve cuántas borró. */
function podarCopias(carpeta, nombre, maximo) {
    const limite = maximo === undefined ? COPIAS_POR_MAPA : maximo;
    const sobran = listarCopias(carpeta, nombre).slice(limite);
    sobran.forEach((copia) => {
        fs.unlinkSync(path.join(carpetaDeCopias(carpeta, nombre), copia.archivo));
    });
    return sobran.length;
}

/**
 * Copia el archivo ACTUAL de un mapa a `backups/<nombre>/<nombre>-<sello>.map.json` y poda las
 * viejas. Devuelve el nombre de la copia, o null si no había archivo que copiar.
 *
 * Se llama ANTES de sobrescribir el mapa, y sólo cuando de verdad se va a sobrescribir: un
 * guardado que la validación rechaza no deja copia, porque no ha cambiado nada.
 *
 * Si dos guardados caen en el mismo milisegundo, el segundo avanza su sello: las copias no se
 * pisan entre sí y siguen ordenando por nombre.
 */
function respaldar(carpeta, nombre, opciones) {
    const opts = opciones || {};
    const origen = path.join(carpeta, nombre + SUFIJO);
    if (!fs.existsSync(origen)) {
        return null;
    }

    const dir = carpetaDeCopias(carpeta, nombre);
    fs.mkdirSync(dir, { recursive: true });

    let instante = (opts.ahora || new Date()).getTime();
    let archivo = nombre + '-' + sello(new Date(instante)) + SUFIJO;
    while (fs.existsSync(path.join(dir, archivo))) {
        instante += 1;
        archivo = nombre + '-' + sello(new Date(instante)) + SUFIJO;
    }

    fs.copyFileSync(origen, path.join(dir, archivo));
    podarCopias(carpeta, nombre, opts.maximo);
    return archivo;
}

/**
 * La ruta de una copia por su nombre de archivo, o null si el nombre no es el de una copia de ESE
 * mapa. Es lo que impide que `restaurar` lea `../../config.js`: sólo vale la forma exacta.
 */
function rutaDeCopia(carpeta, nombre, archivo) {
    if (!patronDeCopia(nombre).test(String(archivo || ''))) {
        return null;
    }
    return path.join(carpetaDeCopias(carpeta, nombre), archivo);
}

/**
 * Lleva las copias de un mapa renombrado a la carpeta de su nombre nuevo, renombrando cada una.
 * Las que chocarían con una que ya existe se quedan donde estaban. Devuelve cuántas movió.
 */
function moverCopias(carpeta, viejo, nuevo) {
    const copias = listarCopias(carpeta, viejo);
    if (copias.length === 0) {
        return 0;
    }
    const origen = carpetaDeCopias(carpeta, viejo);
    const destino = carpetaDeCopias(carpeta, nuevo);
    fs.mkdirSync(destino, { recursive: true });

    let movidas = 0;
    copias.forEach((copia) => {
        const nuevoArchivo = nuevo + copia.archivo.slice(viejo.length);
        if (!fs.existsSync(path.join(destino, nuevoArchivo))) {
            fs.renameSync(path.join(origen, copia.archivo), path.join(destino, nuevoArchivo));
            movidas += 1;
        }
    });

    if (fs.readdirSync(origen).length === 0) {
        fs.rmdirSync(origen);
    }
    podarCopias(carpeta, nuevo);
    return movidas;
}

module.exports = {
    TAMANO_MINIMO,
    TAMANO_MAXIMO,
    PLANTAS_MAXIMO,
    PLANTA_SUPERFICIE,
    PLANTAS_POR_DEFECTO,
    COPIAS_POR_MAPA,
    CARPETA_COPIAS,
    LARGO_MAXIMO_NOMBRE,
    validarNombreNuevo,
    mapaExistente,
    problemaDeTamano,
    problemaDePlantas,
    problemaDeSuelo,
    mapaMinimo,
    fueraDeLimites,
    escribirAtomico,
    crearExclusivo,
    carpetaDeCopias,
    listarCopias,
    podarCopias,
    respaldar,
    rutaDeCopia,
    moverCopias,
    sello
};
