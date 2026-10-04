/**
 * LOS OBJETOS COMPUESTOS: objetos enteros, de una o varias casillas, con parámetros.
 *
 * Es lo que en el editor de mapas de Tibia (RME, NexaMap) son los «doodads» y los «brushes»:
 * una casa, un árbol de 2x2, un teleport o una puerta de casa se ponen DE UNA VEZ, con todas sus
 * piezas, y se configuran al ponerlos (el destino del teleport, el actionId de la palanca, el
 * texto del cartel...). El formato y el flujo de trabajo están en `docs/MAPAS.md`.
 *
 * EL MOTOR NO SABE NADA DE ESTO, y es a propósito: igual que en Tibia, al servidor solo le llegan
 * OBJETOS CON ATRIBUTOS en sus casillas. El compuesto es una herramienta del editor que, al
 * colocarse, se EXPANDE a casillas normales. Lo que el mapa guarda además (la lista
 * `composites`) es para que el editor pueda volver a elegir el objeto entero, moverlo,
 * reconfigurarlo o borrarlo; el motor la conserva y no la usa.
 *
 * Este módulo es puro: lo usan el editor (al colocar), el servidor de herramientas (al validar
 * lo que guarda) y las pruebas.
 */

export const FORMAT = 'jetyum-compuestos';
export const VERSION = 1;

/**
 * Los tipos de parámetro.
 *
 *   numero   un entero (actionId, uniqueId, nivel de puerta...)
 *   texto    una cadena (texto de un cartel, descripción)
 *   posicion {x, y, z} (destino de un teleport)
 *   cantidad un entero >= 1 que va a la CANTIDAD del objeto (monedas, flechas)
 *   objeto   un identificador de objeto que SUSTITUYE al de la pieza (el color de una alfombra,
 *            la variante de una puerta). `opciones` limita los que se pueden elegir.
 */
export const TIPOS = ['numero', 'texto', 'posicion', 'cantidad', 'objeto'];

/** Atributos de objeto que el motor y los scripts entienden (los de un mapa de Tibia). */
export const ATRIBUTOS_CONOCIDOS = [
    { clave: 'actionId', tipo: 'numero', etiqueta: 'Action ID', ayuda: 'Lo usan los scripts de acción y movimiento (aid en Tibia). 100 o más.' },
    { clave: 'uniqueId', tipo: 'numero', etiqueta: 'Unique ID', ayuda: 'Identificador único en todo el mundo (uid en Tibia). 1000 o más.' },
    { clave: 'text', tipo: 'texto', etiqueta: 'Texto', ayuda: 'Lo que está escrito (cartas, carteles, libros).' },
    { clave: 'description', tipo: 'texto', etiqueta: 'Descripción', ayuda: 'Se añade al mirar el objeto.' },
    { clave: 'teleportDestination', tipo: 'posicion', etiqueta: 'Destino de teleport', ayuda: 'A dónde lleva al pisarlo.' },
    { clave: 'doorId', tipo: 'numero', etiqueta: 'Puerta (door id)', ayuda: 'Número de puerta de una casa.' },
    { clave: 'houseId', tipo: 'numero', etiqueta: 'Casa (house id)', ayuda: 'Casa a la que pertenece.' },
    { clave: 'depotId', tipo: 'numero', etiqueta: 'Depósito (depot id)', ayuda: 'Ciudad del depósito.' },
    { clave: 'charges', tipo: 'numero', etiqueta: 'Cargas', ayuda: 'Usos que le quedan (runas, anillos).' }
];

const CLAVE_VALIDA = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PARAMETRO_VALIDO = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

function entero(valor, defecto) {
    const n = Math.trunc(Number(valor));
    return Number.isFinite(n) ? n : defecto;
}

/** Un nombre legible a clave de archivo: «Casa de madera» -> «casa-de-madera». */
export function slug(nombre) {
    return String(nombre || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'compuesto';
}

function normalizarItem(entrada, problemas, donde, itemTypes) {
    const e = (typeof entrada === 'object' && entrada !== null) ? entrada : { id: entrada };
    const id = entero(e.id, NaN);
    if (!Number.isFinite(id) || id <= 0) {
        problemas.push(donde + ': objeto sin id válido');
        return null;
    }
    if (itemTypes && !itemTypes.has(id)) {
        problemas.push(donde + ': el objeto ' + id + ' no existe en items.xml');
    }
    const item = { id };
    if (e.count !== undefined && entero(e.count, 1) !== 1) {
        item.count = Math.max(1, entero(e.count, 1));
    }
    if (e.attributes && typeof e.attributes === 'object' && Object.keys(e.attributes).length > 0) {
        item.attributes = JSON.parse(JSON.stringify(e.attributes));
    }
    return item;
}

function normalizarValor(tipo, valor) {
    if (valor === undefined || valor === null || valor === '') {
        return null;
    }
    if (tipo === 'numero' || tipo === 'objeto') {
        const n = entero(valor, NaN);
        return Number.isFinite(n) ? n : null;
    }
    if (tipo === 'cantidad') {
        const n = entero(valor, NaN);
        return Number.isFinite(n) ? Math.max(1, n) : null;
    }
    if (tipo === 'posicion') {
        const v = Array.isArray(valor) ? { x: valor[0], y: valor[1], z: valor[2] } : valor;
        if (typeof v !== 'object') {
            const partes = String(v).split(/[,\s]+/).map(Number);
            if (partes.length !== 3 || partes.some((p) => !Number.isFinite(p))) {
                return null;
            }
            return { x: partes[0], y: partes[1], z: partes[2] };
        }
        const x = entero(v.x, NaN);
        const y = entero(v.y, NaN);
        const z = entero(v.z, NaN);
        return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
    }
    return String(valor);
}

/**
 * Deja una plantilla en su forma canónica, apuntando lo que está mal.
 *
 * @param {Object} raw
 * @param {string[]} problemas
 * @param {Map<number,Object>} [itemTypes] si se da, se comprueba que los objetos existan
 */
export function normalizarPlantilla(raw, problemas, itemTypes) {
    const p = problemas || [];
    const r = raw || {};
    const id = String(r.id || slug(r.nombre));
    const donde = 'compuesto "' + id + '"';
    if (!CLAVE_VALIDA.test(id)) {
        p.push(donde + ': la clave solo admite minúsculas, números y guiones');
    }
    const plantilla = {
        id,
        nombre: String(r.nombre || id),
        categoria: String(r.categoria || 'General'),
        celdas: [],
        parametros: []
    };
    if (r.descripcion) {
        plantilla.descripcion = String(r.descripcion);
    }

    const vistas = new Set();
    (Array.isArray(r.celdas) ? r.celdas : []).forEach((c, i) => {
        const celda = {
            dx: entero(c.dx, 0),
            dy: entero(c.dy, 0),
            dz: entero(c.dz, 0),
            items: []
        };
        const k = celda.dx + ',' + celda.dy + ',' + celda.dz;
        if (vistas.has(k)) {
            p.push(donde + ': la celda (' + k + ') está repetida');
        }
        vistas.add(k);
        if (c.suelo !== undefined && c.suelo !== null) {
            celda.suelo = entero(c.suelo, 0);
            if (itemTypes && !itemTypes.has(celda.suelo)) {
                p.push(donde + ', celda ' + i + ': el suelo ' + celda.suelo + ' no existe en items.xml');
            }
        }
        (Array.isArray(c.items) ? c.items : []).forEach((e, j) => {
            const item = normalizarItem(e, p, donde + ', celda ' + i + ' objeto ' + j, itemTypes);
            if (item) {
                celda.items.push(item);
            }
        });
        if (celda.suelo === undefined && celda.items.length === 0) {
            p.push(donde + ', celda ' + i + ': está vacía');
        }
        plantilla.celdas.push(celda);
    });
    if (plantilla.celdas.length === 0) {
        p.push(donde + ': no tiene ninguna celda');
    }

    const claves = new Set();
    (Array.isArray(r.parametros) ? r.parametros : []).forEach((rp, i) => {
        const tipo = TIPOS.includes(rp.tipo) ? rp.tipo : 'numero';
        if (!TIPOS.includes(rp.tipo)) {
            p.push(donde + ', parámetro ' + i + ': tipo desconocido "' + rp.tipo + '"');
        }
        const param = {
            clave: String(rp.clave || ''),
            etiqueta: String(rp.etiqueta || rp.clave || ''),
            tipo,
            destinos: []
        };
        if (!PARAMETRO_VALIDO.test(param.clave)) {
            p.push(donde + ': el parámetro "' + param.clave + '" necesita una clave de letras y números');
        }
        if (claves.has(param.clave)) {
            p.push(donde + ': el parámetro "' + param.clave + '" está repetido');
        }
        claves.add(param.clave);
        const defecto = normalizarValor(tipo, rp.defecto);
        if (defecto !== null) {
            param.defecto = defecto;
        }
        if (rp.obligatorio) {
            param.obligatorio = true;
        }
        if (rp.ayuda) {
            param.ayuda = String(rp.ayuda);
        }
        if (tipo === 'objeto' && Array.isArray(rp.opciones)) {
            param.opciones = rp.opciones.map((o) => entero(o, 0)).filter((o) => o > 0);
        }
        if (rp.min !== undefined) { param.min = entero(rp.min, 0); }
        if (rp.max !== undefined) { param.max = entero(rp.max, 0); }

        (Array.isArray(rp.destinos) ? rp.destinos : []).forEach((d, j) => {
            const destino = { celda: entero(d.celda, -1), item: entero(d.item, -1) };
            const celda = plantilla.celdas[destino.celda];
            const lugar = donde + ', parámetro "' + param.clave + '" destino ' + j;
            if (!celda) {
                p.push(lugar + ': la celda ' + d.celda + ' no existe');
            } else if (!celda.items[destino.item]) {
                p.push(lugar + ': la celda ' + d.celda + ' no tiene objeto ' + d.item);
            }
            if (tipo === 'cantidad') {
                destino.campo = 'count';
            } else if (tipo === 'objeto') {
                destino.campo = 'id';
            } else {
                destino.atributo = String(d.atributo || param.clave);
            }
            param.destinos.push(destino);
        });
        if (param.destinos.length === 0) {
            p.push(donde + ': el parámetro "' + param.clave + '" no se aplica a ningún objeto');
        }
        plantilla.parametros.push(param);
    });

    return plantilla;
}

export function vacio() {
    return { format: FORMAT, version: VERSION, compuestos: [] };
}

/** Valida el archivo entero. */
export function normalizarCompuestos(raw, itemTypes) {
    const problemas = [];
    const data = vacio();
    if (!raw || raw.format !== FORMAT) {
        problemas.push('no es un archivo ' + FORMAT);
    }
    if (raw && raw._comment) {
        data._comment = raw._comment;
    }
    const ids = new Set();
    (raw && Array.isArray(raw.compuestos) ? raw.compuestos : []).forEach((t) => {
        const plantilla = normalizarPlantilla(t, problemas, itemTypes);
        if (ids.has(plantilla.id)) {
            problemas.push('compuesto "' + plantilla.id + '": clave repetida');
        }
        ids.add(plantilla.id);
        data.compuestos.push(plantilla);
    });
    return { data, problemas };
}

/** Los valores de partida de los parámetros. */
export function valoresPorDefecto(plantilla) {
    const valores = {};
    plantilla.parametros.forEach((param) => {
        valores[param.clave] = param.defecto !== undefined ? param.defecto : null;
    });
    return valores;
}

/** Comprueba y normaliza los valores que el usuario ha puesto. */
export function validarValores(plantilla, entrada) {
    const problemas = [];
    const valores = {};
    plantilla.parametros.forEach((param) => {
        const crudo = entrada ? entrada[param.clave] : undefined;
        let valor = normalizarValor(param.tipo, crudo);
        if (crudo !== undefined && crudo !== null && crudo !== '' && valor === null) {
            problemas.push(param.etiqueta + ': valor no válido');
        }
        if (valor === null && param.defecto !== undefined) {
            valor = param.defecto;
        }
        if (valor === null && param.obligatorio) {
            problemas.push(param.etiqueta + ': es obligatorio');
        }
        if (typeof valor === 'number') {
            if (param.min !== undefined && valor < param.min) {
                problemas.push(param.etiqueta + ': mínimo ' + param.min);
            }
            if (param.max !== undefined && valor > param.max) {
                problemas.push(param.etiqueta + ': máximo ' + param.max);
            }
        }
        if (param.tipo === 'objeto' && valor !== null && param.opciones && param.opciones.length > 0 &&
            !param.opciones.includes(valor)) {
            problemas.push(param.etiqueta + ': ' + valor + ' no es una de las opciones');
        }
        valores[param.clave] = valor;
    });
    return { valores, problemas };
}

/**
 * EXPANDE un compuesto a casillas: lo que de verdad se escribe en el mapa.
 *
 * Cada parámetro con valor se aplica a sus destinos: un atributo, la cantidad o el id. Un
 * parámetro sin valor (y sin valor por defecto) no deja nada: un teleport sin destino es un
 * teleport decorativo, no uno que lleva al (0,0,0).
 *
 * @returns {Array<{x:number, y:number, z:number, suelo?:number, items:Array}>}
 */
export function expandir(plantilla, valores, x, y, z) {
    const casillas = plantilla.celdas.map((celda) => {
        const casilla = {
            x: x + celda.dx,
            y: y + celda.dy,
            z: z + celda.dz,
            items: celda.items.map((item) => JSON.parse(JSON.stringify(item)))
        };
        if (celda.suelo !== undefined) {
            casilla.suelo = celda.suelo;
        }
        return casilla;
    });

    const v = valores || {};
    plantilla.parametros.forEach((param) => {
        const dado = normalizarValor(param.tipo, v[param.clave]);
        const valor = dado !== null ? dado : (param.defecto !== undefined ? param.defecto : null);
        if (valor === null) {
            return;
        }
        param.destinos.forEach((destino) => {
            const casilla = casillas[destino.celda];
            const item = casilla && casilla.items[destino.item];
            if (!item) {
                return;
            }
            if (destino.campo === 'count') {
                if (valor !== 1) {
                    item.count = valor;
                } else {
                    delete item.count;
                }
            } else if (destino.campo === 'id') {
                item.id = valor;
            } else {
                item.attributes = item.attributes || {};
                item.attributes[destino.atributo] = typeof valor === 'object' ? { ...valor } : valor;
            }
        });
    });

    return casillas;
}

/** La caja que ocupa, relativa a su ancla. */
export function caja(plantilla) {
    const dxs = plantilla.celdas.map((c) => c.dx);
    const dys = plantilla.celdas.map((c) => c.dy);
    return {
        minX: Math.min(...dxs), maxX: Math.max(...dxs),
        minY: Math.min(...dys), maxY: Math.max(...dys),
        ancho: Math.max(...dxs) - Math.min(...dxs) + 1,
        alto: Math.max(...dys) - Math.min(...dys) + 1
    };
}

/**
 * Crea una plantilla a partir de casillas del mapa (la herramienta «Capturar»).
 *
 * El ancla es la casilla de ABAJO A LA DERECHA del recuadro, que es donde se apoya un objeto
 * grande en Tibia: así un árbol capturado se coloca pinchando donde va su tronco.
 *
 * @param {Array<{x,y,z,ground?,items}>} casillas las del recuadro, con lo que tengan
 * @param {{nombre:string, categoria?:string}} meta
 */
export function desdeCasillas(casillas, meta) {
    const llenas = casillas.filter((c) => (c.ground !== null && c.ground !== undefined) ||
        (c.items && c.items.length > 0));
    if (llenas.length === 0) {
        return null;
    }
    const ax = Math.max(...llenas.map((c) => c.x));
    const ay = Math.max(...llenas.map((c) => c.y));
    const az = Math.min(...llenas.map((c) => c.z));
    return {
        id: slug(meta && meta.nombre),
        nombre: (meta && meta.nombre) || 'Compuesto',
        categoria: (meta && meta.categoria) || 'Capturados',
        celdas: llenas.map((c) => {
            const celda = { dx: c.x - ax, dy: c.y - ay, dz: c.z - az, items: (c.items || []).map((i) => ({ ...i })) };
            if (c.ground !== null && c.ground !== undefined) {
                celda.suelo = c.ground;
            }
            return celda;
        }),
        parametros: []
    };
}

/** Escribe el archivo con un compuesto por bloque y una celda por línea, legible en un diff. */
export function serializar(data) {
    const l = ['{', '  "format": ' + JSON.stringify(FORMAT) + ',', '  "version": ' + VERSION + ','];
    if (data._comment) {
        l.push('  "_comment": ' + JSON.stringify(data._comment) + ',');
    }
    l.push('  "compuestos": [');
    data.compuestos.forEach((t, i) => {
        l.push('    {');
        l.push('      "id": ' + JSON.stringify(t.id) + ',');
        l.push('      "nombre": ' + JSON.stringify(t.nombre) + ',');
        l.push('      "categoria": ' + JSON.stringify(t.categoria) + ',');
        if (t.descripcion) {
            l.push('      "descripcion": ' + JSON.stringify(t.descripcion) + ',');
        }
        l.push('      "celdas": [');
        t.celdas.forEach((c, j) => {
            l.push('        ' + JSON.stringify(c) + (j === t.celdas.length - 1 ? '' : ','));
        });
        l.push('      ],');
        if (t.parametros.length === 0) {
            l.push('      "parametros": []');
        } else {
            l.push('      "parametros": [');
            t.parametros.forEach((p, j) => {
                l.push('        ' + JSON.stringify(p) + (j === t.parametros.length - 1 ? '' : ','));
            });
            l.push('      ]');
        }
        l.push('    }' + (i === data.compuestos.length - 1 ? '' : ','));
    });
    l.push('  ]', '}');
    return l.join('\n') + '\n';
}
