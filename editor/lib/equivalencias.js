'use strict';

/**
 * LAS EQUIVALENCIAS: de un id de servidor de Tibia (el de un `.otbm`) a un id de Jetyum.
 *
 * ES EL PROBLEMA DIFÍCIL DE IMPORTAR UN MAPA. Un `.otbm` guarda ids de SERVIDOR, los del
 * `items.otb` con el que se hizo. El catálogo de Jetyum es otro: viene del OpenTibia Sprite Pack
 * (desplazado a 10000+, ver `tools/importar-otsp.mjs`), más lo propio (21000+), y ni los números
 * ni los dibujos son los de Tibia. Además los nombres del pack son genéricos («wall», «door»,
 * «plant»…), así que casar por nombre a secas no basta. Se casa por CAPAS, de la más fiable a la
 * menos, y cada id se queda con la primera que lo resuelve:
 *
 *   1. MANUAL. Lo que diga `manual` en `data/editor/equivalencias-otbm.json`. Manda siempre.
 *      `0` quiere decir «quitarlo a propósito».
 *   2. PINCEL (por papel). Con los materiales de RME (`--materiales`) se sabe que el 1295 es «la
 *      pieza horizontal del muro de piedra» o que el 4515 es «la hierba de más probabilidad».
 *      Cada pincel de RME se corresponde con uno de Jetyum (`pinceles.json`) —por nombre, por
 *      palabras clave o por el color del minimapa— y cada pieza va a LA MISMA PIEZA del pincel de
 *      Jetyum: la horizontal a la horizontal, la esquina interior noroeste del borde a la suya, la
 *      puerta de un muro vertical a la puerta vertical. Es lo que conserva la forma de un mapa.
 *   3. FUNCIONAL. Lo que el juego necesita que siga funcionando: teleports, depósitos, buzones,
 *      escaleras y agujeros (por `floorchange`), escaleras de mano, sitios de cuerda, campos.
 *   4. NOMBRE. El nombre normalizado igual («gold coin», «backpack», «torch»), con la misma clase
 *      (suelo con suelo, apilable con apilable).
 *   5. CLASE. Palabras clave del nombre («tree», «bush», «boulder»…) a una clase de Jetyum (los
 *      objetos que se llaman «tree», «plant», «stone»…). Dentro de la clase se elige por el color
 *      del minimapa y, entre los parecidos, por el propio id: así dos árboles distintos de Tibia no
 *      acaban siendo el mismo árbol.
 *   6. COLOR (solo suelos). El suelo de Jetyum con el color de minimapa más cercano y el mismo
 *      bloqueo (el agua sigue sin poder pisarse).
 *   7. RESPALDO (solo suelos). `respaldo.suelo`: un suelo que no se pudo casar se cambia por éste,
 *      para que el mapa cargue y se pueda andar.
 *
 * Los BORDES de suelo sin equivalente se quitan a propósito (`omitido`): son cosméticos, y un
 * borde de arena pintado con el dibujo del de hierba se ve peor que ninguno. Lo demás que no casa
 * se queda SIN EQUIVALENCIA: el importador lo quita y lo lista, ordenado por cuántas veces sale.
 *
 * El archivo guarda la tabla automática (`automatico`) para poder revisarla, y `manual` para
 * corregirla. Para cambiar un id, se copia a `manual` con otro destino: `automatico` se reescribe
 * entero cada vez que se regenera.
 */

const fs = require('fs');

const FORMATO = 'jetyum-equivalencias-otbm';
const VERSION = 1;

/** El orden de confianza de cada método: el que gana al construir la tabla inversa (exportar). */
const METODOS = ['manual', 'pincel', 'funcional', 'nombre', 'clase', 'muro', 'color', 'respaldo', 'omitido'];

/** Los tipos de pieza de muro de RME, con su posición en `TIPO_COMPLETO` (máscara N=1 W=2 E=4 S=8). */
const TIPO_DE_MURO_RME = {
    pole: 0, 'south end': 1, 'east end': 2, corner: 3, 'northwest diagonal': 3, 'west end': 4,
    'northeast diagonal': 5, horizontal: 6, 'south t': 7, 'north end': 8, vertical: 9,
    'southwest diagonal': 10, 'east t': 11, 'southeast diagonal': 12, 'west t': 13, 'north t': 14,
    intersection: 15
};
/** Lo mismo que `TIPO_COMPLETO` y `TIPO_MEDIO` de `editor/js/pinceles.js` (que es un módulo ES). */
const TIPO_COMPLETO = ['poste', 'fin_sur', 'fin_este', 'esquina', 'fin_oeste', 'diagonal_ne', 'horizontal',
    't_sur', 'fin_norte', 'vertical', 'diagonal_so', 't_este', 'diagonal_se', 't_oeste', 't_norte', 'cruce'];
const TIPO_MEDIO = ['poste', 'vertical', 'horizontal', 'esquina', 'poste', 'vertical', 'horizontal', 'esquina',
    'poste', 'vertical', 'horizontal', 'esquina', 'poste', 'vertical', 'horizontal', 'esquina'];

/** Las piezas de una mesa de RME y su nombre en Jetyum. */
const PIEZA_DE_MESA = { alone: 'sola', horizontal: 'horizontal', vertical: 'vertical', north: 'fin_norte',
    south: 'fin_sur', east: 'fin_este', west: 'fin_oeste' };

/**
 * LO QUE TRAE EL ARCHIVO POR DEFECTO. Las palabras se miran en orden y gana la primera; todas son
 * datos, no código: se cambian en `data/editor/equivalencias-otbm.json` sin tocar nada más.
 *
 *   - `palabras.suelos`: palabra del nombre de un pincel de suelo de RME -> pincel de suelo de Jetyum.
 *   - `palabras.muros`:  palabra del nombre de un muro de RME -> muro de Jetyum.
 *   - `palabras.clases`: palabra del nombre de un objeto de Tibia -> nombre de objeto de Jetyum.
 *   - `pinceles`: correspondencias EXPLÍCITAS de pincel de RME a pincel de Jetyum, que mandan sobre
 *     las palabras (`{"suelos": {"grass": "otsp-hierba"}}`).
 */
function porDefecto() {
    return {
        format: FORMATO,
        version: VERSION,
        _comment: [
            'EQUIVALENCIAS DE IDS DE TIBIA (items.otb) A IDS DE JETYUM, para importar mapas OTBM y materiales de RME.',
            'manual manda sobre automatico (0 = quitar). automatico lo REESCRIBE tools/importar-otbm.mjs --equivalencias:',
            'para corregir uno, copialo a manual. Cada entrada de automatico es [id de Jetyum, metodo, nombre en Tibia].',
            'Formato y capas en docs/MAPAS.md (seccion 5) y en editor/lib/equivalencias.js.'
        ],
        origen: null,
        respaldo: { suelo: 10101, sueloQueBloquea: 10990, muro: 'otsp-piedra-gris' },
        pinceles: { suelos: {}, muros: {}, alfombras: {}, mesas: {} },
        palabras: {
            suelos: [
                ['water', 'otsp-agua'], ['sea', 'otsp-agua'], ['ocean', 'otsp-agua'], ['lake', 'otsp-agua'],
                ['grass*', 'otsp-hierba'], ['jungle', 'otsp-hierba'], ['lawn', 'otsp-hierba'], ['moss*', 'otsp-hierba'],
                ['sand', 'otsp-arena'], ['sandy', 'otsp-arena'], ['desert', 'otsp-arena'], ['beach', 'otsp-arena'],
                ['gravel', 'otsp-grava'], ['pebble*', 'otsp-grava'],
                ['cobble*', 'otsp-adoquin'], ['paving', 'otsp-adoquin'], ['street', 'otsp-adoquin'], ['road', 'otsp-adoquin'],
                ['marble', 'otsp-marmol'],
                ['wood*', 'otsp-madera'], ['plank*', 'otsp-madera'], ['parquet', 'otsp-madera'], ['bridge', 'otsp-madera'],
                ['tile*', 'otsp-losa'], ['stone', 'otsp-losa'], ['floor', 'otsp-losa'], ['brick*', 'otsp-losa'],
                ['earth*', 'otsp-tierra'], ['dirt*', 'otsp-tierra'], ['mud*', 'otsp-tierra'], ['soil', 'otsp-tierra'],
                ['cave', 'otsp-tierra'], ['swamp*', 'otsp-tierra'], ['ash*', 'otsp-tierra'], ['clay', 'otsp-tierra'],
                ['grotto', 'otsp-tierra'], ['tar', 'otsp-tierra'], ['lava', 'otsp-tierra']
            ],
            muros: [
                ['framework', 'otsp-madera'], ['timber', 'otsp-madera'], ['wood*', 'otsp-madera'],
                ['log*', 'otsp-madera-oscura'], ['plank*', 'otsp-tablones'], ['bamboo', 'otsp-tablones'],
                ['fence', 'otsp-tablones'], ['railing', 'otsp-tablones'], ['palisade', 'otsp-tablones'],
                ['sandstone', 'otsp-arenisca'], ['desert', 'otsp-arenisca'], ['clay', 'otsp-arenisca'],
                ['egypt*', 'otsp-arenisca'], ['limestone', 'otsp-crema'], ['alabaster', 'otsp-blanco'],
                ['brick*', 'otsp-naranja'], ['marble', 'otsp-marmol'], ['white', 'otsp-blanco'],
                ['ice', 'otsp-hielo'], ['icy', 'otsp-hielo'], ['frozen', 'otsp-hielo'], ['snow*', 'otsp-hielo'],
                ['gold*', 'otsp-oro'], ['cave', 'otsp-roca'], ['rock*', 'otsp-roca'], ['mountain', 'otsp-roca'],
                ['dark', 'otsp-piedra-oscura'], ['black', 'otsp-piedra-negra'], ['ornamented', 'otsp-piedra-tallada'],
                ['carved', 'otsp-piedra-tallada'], ['temple', 'otsp-piedra-tallada'], ['round', 'otsp-piedra-redonda'],
                ['cobble*', 'otsp-piedra-redonda'], ['ruin*', 'otsp-piedra-oscura'], ['stone*', 'otsp-piedra-gris']
            ],
            clases: [
                ['giant mushroom', 'giant mushroom'],
                ['tree*', 'tree'], ['palm*', 'tree'], ['fir', 'tree'], ['pine*', 'tree'], ['willow', 'tree'],
                ['birch', 'tree'], ['oak', 'tree'], ['cypress', 'tree'], ['mangrove', 'tree'],
                ['trunk', 'tree log'], ['stump', 'tree log'], ['log', 'tree log'], ['logs', 'tree log'],
                ['timber', 'tree log'],
                ['bush*', 'plant'], ['shrub*', 'plant'], ['flower*', 'plant'], ['fern*', 'plant'],
                ['plant*', 'plant'], ['rose*', 'plant'], ['tulip*', 'plant'], ['blossom*', 'plant'], ['reed*', 'plant'],
                ['grass*', 'plant'], ['weed*', 'plant'], ['vine*', 'plant'], ['ivy', 'plant'], ['cactus', 'plant'],
                ['herb*', 'plant'], ['lily', 'plant'], ['lilly', 'plant'], ['moss', 'plant'], ['mushroom*', 'plant'],
                ['branch*', 'plant'], ['kelp', 'plant'], ['leaf', 'plant'], ['leaves', 'plant'], ['sprout*', 'plant'],
                ['whip', 'plant'], ['wheat', 'plant'], ['agave', 'plant'], ['catcher', 'plant'], ['twine*', 'plant'],
                ['wart', 'plant'], ['claw', 'plant'], ['saddle*', 'plant'], ['seaweed', 'plant'], ['coral', 'plant'],
                ['mountain', 'mountain'], ['boulder*', 'stone'], ['rock', 'stone'], ['rocks', 'stone'],
                ['stalagmite*', 'stone'], ['stone', 'stones'], ['stones', 'stones'], ['pebble*', 'stones'],
                ['earth', 'mountain'], ['debris', 'debries'], ['rubble', 'debries'], ['heap', 'debries'], ['pile', 'debries'],
                ['archway', 'archway'], ['window', 'window'],
                ['blood', 'pool'], ['puddle', 'pool'], ['slime', 'pool'],
                ['barrel', 'barrel'], ['crate', 'wooden crate'], ['box', 'wooden box'], ['chest', 'chest'],
                ['lamp*', 'street lamp'], ['well', 'well'], ['chair', 'chair'], ['table', 'table'],
                ['campfire', 'campfire'], ['torch', 'torch'], ['candelabrum', 'candelabrum'], ['vase', 'vase'],
                ['flower pot', 'flower pot'], ['bones', 'pile of bones'], ['skeleton', 'pile of bones'],
                ['skull', 'pile of bones'], ['pillar', 'stone pillar'], ['column', 'stone pillar'],
                ['statue', 'stone pillar'], ['sign', 'signpost'], ['signpost', 'signpost'], ['lever', 'lever'],
                ['fence', 'wooden fence'], ['railing', 'wooden fence'], ['palisade', 'wooden fence']
            ]
        },
        manual: {},
        automatico: {}
    };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** «A Gold Coin» -> «gold coin». Sin artículo, sin acentos, sin mayúsculas, un espacio entre palabras. */
function normalizarNombre(nombre) {
    return String(nombre || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        .replace(/^(a|an|the|some) /, '');
}

/**
 * ¿Lleva el nombre esa palabra (o esas palabras) entera? Con un `*` al final basta con que una
 * palabra EMPIECE así: `cobble*` casa con «cobblestone» y `fir` no casa con «fire».
 */
function contienePalabra(nombre, palabra) {
    if (palabra.endsWith('*')) {
        return (' ' + nombre).includes(' ' + palabra.slice(0, -1));
    }
    return (' ' + nombre + ' ').includes(' ' + palabra + ' ');
}

/** `normalizarNombre` que respeta el `*` final de una palabra clave. */
function normalizarPalabra(palabra) {
    const p = String(palabra || '');
    return normalizarNombre(p) + (p.endsWith('*') ? '*' : '');
}

/**
 * El color de un índice de minimapa de Tibia: un cubo de 6x6x6 (`r*36 + g*6 + b`, pasos de 51).
 * Es el mismo en el `.dat` de Tibia y en el del pack, así que sirve para comparar los dos.
 */
function colorDeMinimapa(indice) {
    if (indice === null || indice === undefined || !(indice >= 0 && indice < 216)) {
        return null;
    }
    return [Math.floor(indice / 36) * 51, (Math.floor(indice / 6) % 6) * 51, (indice % 6) * 51];
}

function distanciaDeColor(a, b) {
    if (!a || !b) {
        return Infinity;
    }
    // Ponderada como la ve el ojo (el verde pesa más): «redmean» simplificada.
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

/** Un número estable por id, para repartir variantes sin azar. */
function mezcla(n) {
    let x = (n | 0) ^ 0x9E3779B9;
    x = Math.imul(x ^ (x >>> 16), 0x85EBCA6B);
    x = Math.imul(x ^ (x >>> 13), 0xC2B2AE35);
    return (x ^ (x >>> 16)) >>> 0;
}

const activo = (v) => v === true || v === 1 || v === '1' || v === 'true';

// ---------------------------------------------------------------------------
// Lo que se sabe de cada objeto
// ---------------------------------------------------------------------------

/**
 * Lo de Jetyum: de cada objeto de items.xml, su clase y su color de minimapa (de `things.json`).
 *
 * @param {Map<number,Object>} itemTypes
 * @param {Map<number,Object>} [things] id -> cosa de things.json (por las banderas de dibujo)
 */
function indiceDeJetyum(itemTypes, things) {
    const objetos = new Map();
    const porNombre = new Map();
    itemTypes.forEach((definicion, id) => {
        const a = definicion.attributes || {};
        const banderas = (things && things.get(id) && things.get(id).flags) || {};
        const o = {
            id: id,
            nombre: normalizarNombre(definicion.name),
            suelo: activo(a.isGround),
            bloquea: activo(a.blocksSolid),
            apilable: activo(a.stackable),
            contenedor: activo(a.isContainer),
            floorchange: a.floorchange ? String(a.floorchange) : null,
            fieldType: a.fieldType ? String(a.fieldType) : null,
            depot: activo(a.depot),
            mailbox: activo(a.mailbox),
            color: colorDeMinimapa(banderas.minimap),
            // Los cortes de hoja sin nombre propio no son destino de nada que case por nombre. Los
            // de demostración (`tools/generar-pinceles.mjs` y los primeros de items.xml) sí, pero
            // solo por su nombre exacto y detrás de cualquier otro: su dibujo es provisional.
            relleno: /^tilesheet |^otsp \d+$/.test(normalizarNombre(definicion.name)),
            demo: (id >= 4500 && id < 4700) || (id >= 100 && id < 120)
        };
        objetos.set(id, o);
        if (!o.relleno) {
            if (!porNombre.has(o.nombre)) {
                porNombre.set(o.nombre, []);
            }
            porNombre.get(o.nombre).push(o);
        }
    });
    return { objetos, porNombre };
}

/**
 * Lo de Tibia: de cada id de servidor, lo del `items.otb` (grupo, banderas, color) y lo del
 * `items.xml` (nombre y atributos como `type` o `floorchange`).
 */
function fichaDeTibia(id, otb, tfs) {
    const o = otb.get(id) || null;
    const x = tfs ? tfs.get(id) : null;
    const a = (x && x.attributes) || {};
    const banderas = o ? o.banderas : 0;
    return {
        id: id,
        nombre: normalizarNombre(x && x.name ? x.name : o && o.nombre),
        nombreOriginal: x && x.name ? String(x.name) : (o && o.nombre) || '',
        grupo: o ? o.grupo : 'ninguno',
        suelo: o ? o.grupo === 'suelo' : activo(a.isGround),
        bloquea: (banderas & 1) !== 0,
        apilable: (banderas & (1 << 7)) !== 0,
        horizontal: (banderas & (1 << 18)) !== 0,
        vertical: (banderas & (1 << 17)) !== 0,
        topOrder: o ? o.topOrder : null,
        color: colorDeMinimapa(o ? o.minimapa : null),
        tipo: a.type ? String(a.type).toLowerCase() : null,
        floorchange: a.floorchange ? String(a.floorchange).toLowerCase() : null
    };
}

// ---------------------------------------------------------------------------
// Construir la tabla
// ---------------------------------------------------------------------------

/**
 * Construye la tabla automática.
 *
 * @param {Object} fuentes
 * @param {Map<number,Object>} fuentes.otb      `leerItemsOtb(...).items`
 * @param {Map<number,Object>} [fuentes.tfs]    `Xml.loadItems(items.xml de TFS)`
 * @param {Map<number,Object>} fuentes.itemTypes los de Jetyum
 * @param {Map<number,Object>} [fuentes.things]  los de Jetyum, por id
 * @param {Object} [fuentes.pinceles]            `data/editor/pinceles.json` de Jetyum
 * @param {Object} [fuentes.materiales]          `leerMateriales(...)` de RME
 * @param {Object} [fuentes.config]              el archivo de equivalencias (palabras, respaldo, pinceles)
 * @returns {{tabla: Map<number,{destino:number, metodo:string, nombre:string}>, correspondencias: Object,
 *            resumen: Object}}
 */
function construirEquivalencias(fuentes) {
    const config = Object.assign(porDefecto(), fuentes.config || {});
    const palabras = Object.assign(porDefecto().palabras, config.palabras || {});
    const explicitas = Object.assign({ suelos: {}, muros: {}, alfombras: {}, mesas: {} }, config.pinceles || {});
    const jet = indiceDeJetyum(fuentes.itemTypes, fuentes.things);
    const pinceles = fuentes.pinceles || { suelos: [], bordes: [], muros: [], alfombras: [], mesas: [] };
    const otb = fuentes.otb;
    const tfs = fuentes.tfs || null;
    const tabla = new Map();
    const fichas = new Map();

    const ficha = (id) => {
        if (!fichas.has(id)) {
            fichas.set(id, fichaDeTibia(id, otb, tfs));
        }
        return fichas.get(id);
    };
    const asignar = (id, destino, metodo) => {
        if (!tabla.has(id) && (otb.has(id) || !otb.size)) {
            tabla.set(id, { destino: destino, metodo: metodo, nombre: ficha(id).nombreOriginal });
        }
    };

    const sueloJ = new Map((pinceles.suelos || []).map((s) => [s.id, s]));
    const bordeJ = new Map((pinceles.bordes || []).map((b) => [b.id, b]));
    const muroJ = new Map((pinceles.muros || []).map((m) => [m.id, m]));
    const alfombraJ = new Map((pinceles.alfombras || []).map((a) => [a.id, a]));
    const mesaJ = new Map((pinceles.mesas || []).map((a) => [a.id, a]));
    const porPalabra = (lista, nombre, validos) => {
        const n = normalizarNombre(nombre);
        const par = (lista || []).find(([palabra, destino]) => contienePalabra(n, normalizarPalabra(palabra)) &&
            validos.has(destino));
        return par ? par[1] : null;
    };
    const colorDeObjetoJ = (id) => (jet.objetos.get(id) ? jet.objetos.get(id).color : null);
    const masCercano = (color, lista, colorDe) => {
        let mejor = null;
        let distancia = Infinity;
        lista.forEach((x) => {
            const d = distanciaDeColor(color, colorDe(x));
            if (d < distancia) {
                distancia = d;
                mejor = x;
            }
        });
        return mejor;
    };

    // --- 2. Por papel en un pincel de RME ------------------------------------
    const piezasDeBorde = new Set();
    const correspondencias = { suelos: {}, bordes: {}, muros: {}, alfombras: {}, mesas: {} };
    const materiales = fuentes.materiales || null;

    if (materiales) {
        // Suelos: pincel de RME -> pincel de Jetyum. Primero lo explícito, luego las palabras y por
        // último el color de su objeto de muestra.
        const suelosJ = Array.from(sueloJ.values()).filter((s) => s.items.length > 0);
        materiales.suelos.forEach((s) => {
            if (s.items.length === 0) {
                return;
            }
            let destino = explicitas.suelos[s.nombre] || porPalabra(palabras.suelos, s.nombre, sueloJ);
            if (!destino) {
                const color = ficha(s.lookid || s.items[0].id).color;
                const cercano = masCercano(color, suelosJ, (j) => colorDeObjetoJ(j.items[0].id));
                destino = cercano ? cercano.id : null;
            }
            if (destino && sueloJ.has(destino)) {
                correspondencias.suelos[s.nombre] = destino;
            }
        });

        // Por z-order de mayor a menor: si un objeto está en dos pinceles, gana el principal.
        Array.from(materiales.suelos.values()).sort((a, b) => b.z - a.z).forEach((s) => {
            const j = sueloJ.get(correspondencias.suelos[s.nombre]);
            if (!j) {
                return;
            }
            const destinos = j.items.slice().sort((a, b) => b.chance - a.chance).map((i) => i.id);
            const bloqueaJ = jet.objetos.get(destinos[0]) && jet.objetos.get(destinos[0]).bloquea;
            s.items.slice().sort((a, b) => b.chance - a.chance).forEach((item, k) => {
                // Un suelo que bloquea (agua, montaña) no se convierte en uno que se pisa, ni al revés.
                if (ficha(item.id).bloquea === Boolean(bloqueaJ)) {
                    asignar(item.id, destinos[k % destinos.length], 'pincel');
                }
            });
            // Sus bordes, al borde del pincel de Jetyum (si lo tiene).
            if (j.borde && bordeJ.has(j.borde)) {
                s.bordes.forEach((b) => {
                    // Solo el EXTERIOR: el interior de la hierba de RME es el borde de montaña.
                    if (!correspondencias.bordes[b.id] && b.align === 'outer' && (b.to === null || b.to === 'none')) {
                        correspondencias.bordes[b.id] = j.borde;
                    }
                });
            }
        });

        materiales.bordes.forEach((borde, idBorde) => {
            const j = bordeJ.get(correspondencias.bordes[idBorde]);
            Object.keys(borde.piezas).forEach((lado) => {
                if (j && j.piezas[lado]) {
                    asignar(borde.piezas[lado], j.piezas[lado], 'pincel');
                }
            });
        });
        // Los bordes que no tienen equivalente se quitan a propósito (ver la cabecera).
        // Eso se decide abajo, objeto a objeto: los que BLOQUEAN (los bordes de montaña de Tibia son
        // la pared de la montaña) antes intentan casar con una montaña o una roca de Jetyum.
        materiales.bordes.forEach((borde) => {
            Object.values(borde.piezas).forEach((id) => piezasDeBorde.add(id));
        });

        // Muros: explícito, palabras, color; y si nada, el muro de respaldo.
        const murosJ = Array.from(muroJ.values());
        materiales.muros.forEach((m) => {
            if (Object.keys(m.tipos).length === 0) {
                return;
            }
            let destino = explicitas.muros[m.nombre] || porPalabra(palabras.muros, m.nombre, muroJ);
            if (!destino) {
                const cercano = masCercano(ficha(m.lookid).color, murosJ,
                    (j) => colorDeObjetoJ(j.piezas.horizontal || j.piezas.poste));
                destino = cercano ? cercano.id : null;
            }
            if (!destino || !muroJ.has(destino)) {
                destino = muroJ.has(config.respaldo && config.respaldo.muro) ? config.respaldo.muro : null;
            }
            if (!destino) {
                return;
            }
            correspondencias.muros[m.nombre] = destino;
            const j = muroJ.get(destino);
            Object.keys(m.tipos).forEach((tipo) => {
                const indice = TIPO_DE_MURO_RME[tipo];
                const pieza = indice === undefined ? null
                    : (j.piezas[TIPO_COMPLETO[indice]] || j.piezas[TIPO_MEDIO[indice]]);
                const base = pieza || j.piezas.horizontal || j.piezas.poste;
                m.tipos[tipo].items.forEach((item) => asignar(item.id, base, 'pincel'));
                const alineacion = tipo === 'vertical' ? 'vertical' : 'horizontal';
                m.tipos[tipo].puertas.forEach((puerta) => {
                    const esVentana = /window/.test(puerta.tipo);
                    const lista = esVentana ? j.ventanas : j.puertas;
                    const destinoPuerta = (lista && (lista[alineacion] || lista.horizontal)) || base;
                    asignar(puerta.id, destinoPuerta, 'pincel');
                });
            });
        });

        // Alfombras y mesas: solo con un pincel de Jetyum que les corresponda. Las «alfombras» de
        // RME que no se llaman alfombra (hojas, grava suelta, hielo) no son alfombras para casar.
        const primera = (mapa) => (mapa.size > 0 ? mapa.keys().next().value : null);
        materiales.alfombras.forEach((a) => {
            const destino = explicitas.alfombras[a.nombre] ||
                (/carpet|rug/.test(normalizarNombre(a.nombre)) ? primera(alfombraJ) : null);
            const j = alfombraJ.get(destino);
            if (!j) {
                return;
            }
            correspondencias.alfombras[a.nombre] = destino;
            Object.keys(a.piezas).forEach((lado) => {
                const pieza = j.piezas[lado === 'center' ? 'centro' : lado];
                if (pieza) {
                    a.piezas[lado].forEach((item) => asignar(item.id, pieza, 'pincel'));
                }
            });
        });
        materiales.mesas.forEach((m) => {
            const destino = explicitas.mesas[m.nombre] ||
                (/table|counter|desk|bench|bar/.test(normalizarNombre(m.nombre)) ? primera(mesaJ) : null);
            const j = mesaJ.get(destino);
            if (!j) {
                return;
            }
            correspondencias.mesas[m.nombre] = destino;
            Object.keys(m.piezas).forEach((lado) => {
                const pieza = j.piezas[PIEZA_DE_MESA[lado]] || j.piezas.sola;
                m.piezas[lado].forEach((item) => asignar(item.id, pieza, 'pincel'));
            });
        });
    }

    // Los nombres de pincel de RME en que sale cada objeto: una segunda oportunidad para la clase
    // («brushes (blueberry)» dice más que el «blueberry bush» que no está en el catálogo).
    const nombresDePincel = new Map();
    if (materiales) {
        materiales.doodads.forEach((d) => d.variantes.forEach((v) => v.celdas.forEach((c) => c.items.forEach((id) => {
            if (!nombresDePincel.has(id)) {
                nombresDePincel.set(id, normalizarNombre(d.nombre));
            }
        }))));
    }

    // --- 3 a 7: objeto a objeto --------------------------------------------------
    const elegirEntre = (t, candidatos) => {
        if (candidatos.length === 0) {
            return null;
        }
        const mismos = candidatos.filter((c) => c.bloquea === t.bloquea);
        const lista = (mismos.length > 0 ? mismos : candidatos)
            .map((c) => ({ c: c, d: distanciaDeColor(t.color, c.color) }))
            .sort((a, b) => (a.d - b.d) || (a.c.id - b.c.id));
        // Entre los cinco de color más parecido, uno fijo por id: variedad sin azar.
        const cercanos = lista.slice(0, Math.min(5, lista.length));
        return cercanos[mezcla(t.id) % cercanos.length].c;
    };
    const conClase = (t, nombreJ) => (jet.porNombre.get(normalizarNombre(nombreJ)) || [])
        .filter((c) => c.suelo === t.suelo && !c.demo);
    const primeroCon = (filtro) => {
        for (const o of jet.objetos.values()) {
            if (filtro(o)) {
                return o;
            }
        }
        return null;
    };
    const alterno = { south: 'southalt', southalt: 'south', east: 'eastalt', eastalt: 'east' };
    const suelosConColor = Array.from(jet.objetos.values())
        .filter((o) => o.suelo && o.color && !o.floorchange && !o.relleno && !o.demo);
    const respaldoDe = (clave) => (jet.objetos.has(Number(config.respaldo && config.respaldo[clave]))
        ? Number(config.respaldo[clave]) : null);
    // Dos suelos de respaldo: el que se pisa y el que no. Un suelo de Tibia que bloquea (el «earth»
    // negro de debajo de las montañas) cambiado por hierba abriría un paso donde no lo hay.
    const respaldoSuelo = respaldoDe('suelo');
    const respaldoQueBloquea = respaldoDe('sueloQueBloquea') || respaldoSuelo;
    const murosRespaldo = muroJ.get(config.respaldo && config.respaldo.muro) || muroJ.values().next().value || null;

    const funcional = (t) => {
        if (t.tipo === 'teleport' || t.grupo === 'teleport') {
            return primeroCon((o) => o.nombre === 'teleport' && !o.suelo);
        }
        if (t.tipo === 'depot') {
            return primeroCon((o) => o.depot);
        }
        if (t.tipo === 'mailbox') {
            return primeroCon((o) => o.mailbox);
        }
        if (t.floorchange) {
            return primeroCon((o) => o.floorchange === t.floorchange && o.suelo === t.suelo) ||
                primeroCon((o) => o.floorchange === alterno[t.floorchange] && o.suelo === t.suelo) || null;
        }
        if (contienePalabra(t.nombre, 'ladder')) {
            return primeroCon((o) => o.nombre === 'ladder');
        }
        if (contienePalabra(t.nombre, 'rope spot') || t.nombre === 'hole' && t.suelo) {
            return primeroCon((o) => o.nombre === 'rope spot');
        }
        if (contienePalabra(t.nombre, 'sewer')) {
            return primeroCon((o) => o.nombre === 'sewers');
        }
        if (t.tipo === 'magicfield') {
            const clase = ['fire', 'energy', 'poison'].find((p) => contienePalabra(t.nombre, p));
            return clase ? primeroCon((o) => o.fieldType === clase) : null;
        }
        if (t.grupo === 'salpicadura') {
            return elegirEntre(t, conClase(t, 'pool'));
        }
        return null;
    };

    const porNombre = (t) => {
        const candidatos = (jet.porNombre.get(t.nombre) || []).filter((c) => c.suelo === t.suelo);
        if (candidatos.length === 0) {
            return null;
        }
        const ordenados = candidatos.slice().sort((a, b) => (a.demo - b.demo) ||
            ((a.bloquea !== t.bloquea) - (b.bloquea !== t.bloquea)) ||
            ((a.apilable !== t.apilable) - (b.apilable !== t.apilable)) || (a.id - b.id));
        return ordenados[0];
    };

    const porClase = (t) => {
        for (const nombre of [t.nombre, nombresDePincel.get(t.id)]) {
            if (!nombre) {
                continue;
            }
            for (const [palabra, clase] of palabras.clases || []) {
                if (contienePalabra(nombre, normalizarPalabra(palabra))) {
                    const elegido = elegirEntre(t, conClase(t, clase));
                    if (elegido) {
                        return elegido;
                    }
                }
            }
        }
        return null;
    };

    otb.forEach((_, id) => {
        if (tabla.has(id)) {
            return;
        }
        const t = ficha(id);
        if (!t.nombre && !t.suelo) {
            return;
        }
        // El «void» de Tibia es la nada: una casilla con él no se escribe.
        if (t.nombre === 'void') {
            asignar(id, 0, 'omitido');
            return;
        }
        const esBorde = piezasDeBorde.has(id) || (!t.suelo && (t.topOrder === 1 || contienePalabra(t.nombre, 'border')));
        if (esBorde && !t.bloquea) {
            asignar(id, 0, 'omitido');
            return;
        }
        let o = funcional(t);
        if (o) {
            asignar(id, o.id, 'funcional');
            return;
        }
        o = porNombre(t);
        if (o) {
            asignar(id, o.id, 'nombre');
            return;
        }
        if (!t.suelo) {
            o = porClase(t);
            if (o) {
                asignar(id, o.id, 'clase');
                return;
            }
            // Un muro suelto (que no está en ningún pincel): la pieza del muro de respaldo que
            // corresponde a su orientación.
            if (murosRespaldo && t.bloquea && contienePalabra(t.nombre, 'wall')) {
                const pieza = t.vertical ? 'vertical' : t.horizontal ? 'horizontal' : 'poste';
                asignar(id, murosRespaldo.piezas[pieza] || murosRespaldo.piezas.horizontal, 'muro');
                return;
            }
            if (esBorde) {
                asignar(id, 0, 'omitido');
            }
            return;
        }
        // Un suelo suelto cuyo nombre dice qué es («earth», «swamp»): el objeto principal de ese
        // pincel de Jetyum, si bloquea igual.
        const pincel = sueloJ.get(porPalabra(palabras.suelos, t.nombre, sueloJ));
        if (pincel && pincel.items.length > 0) {
            const principal = pincel.items.slice().sort((a, b) => b.chance - a.chance)[0].id;
            if (jet.objetos.get(principal) && jet.objetos.get(principal).bloquea === t.bloquea) {
                asignar(id, principal, 'nombre');
                return;
            }
        }
        o = masCercano(t.color, suelosConColor.filter((s) => s.bloquea === t.bloquea), (s) => s.color);
        if (o && t.color) {
            asignar(id, o.id, 'color');
            return;
        }
        if (t.bloquea ? respaldoQueBloquea : respaldoSuelo) {
            asignar(id, t.bloquea ? respaldoQueBloquea : respaldoSuelo, 'respaldo');
        }
    });

    const resumen = {};
    tabla.forEach((e) => {
        resumen[e.metodo] = (resumen[e.metodo] || 0) + 1;
    });
    return { tabla: tabla, correspondencias: correspondencias, resumen: resumen };
}

// ---------------------------------------------------------------------------
// El archivo
// ---------------------------------------------------------------------------

/** Lee el archivo de equivalencias (o lo de por defecto si no existe). */
function leerArchivo(ruta) {
    const base = porDefecto();
    if (!ruta || !fs.existsSync(ruta)) {
        return base;
    }
    const raw = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    if (raw.format !== FORMATO) {
        throw new Error(ruta + ' no es un archivo ' + FORMATO);
    }
    return Object.assign(base, raw, {
        respaldo: Object.assign(base.respaldo, raw.respaldo || {}),
        pinceles: Object.assign(base.pinceles, raw.pinceles || {}),
        palabras: Object.assign(base.palabras, raw.palabras || {}),
        manual: raw.manual || {},
        automatico: raw.automatico || {}
    });
}

/**
 * Escribe el archivo con una entrada por línea en `manual` y `automatico`, para que se pueda
 * leer, buscar y comparar en un diff. Lo demás va con su sangría normal.
 */
function serializar(datos) {
    const cabecera = {};
    Object.keys(datos).forEach((clave) => {
        if (clave !== 'manual' && clave !== 'automatico') {
            cabecera[clave] = datos[clave];
        }
    });
    // Los pares de palabras, cada uno en su línea: `["grass*", "otsp-hierba"]`.
    const texto = JSON.stringify(cabecera, null, 2)
        .replace(/\[\n\s+("(?:[^"\\]|\\.)*"),\n\s+("(?:[^"\\]|\\.)*")\n\s+\]/g, '[$1, $2]');
    const bloque = (nombre, objeto, ultimo) => {
        const claves = Object.keys(objeto).sort((a, b) => Number(a) - Number(b));
        const lineas = claves.map((k, i) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(objeto[k]) +
            (i === claves.length - 1 ? '' : ','));
        return '  ' + JSON.stringify(nombre) + ': {' + (lineas.length ? '\n' + lineas.join('\n') + '\n  ' : '') + '}' +
            (ultimo ? '' : ',');
    };
    return texto.slice(0, -2) + ',\n' + bloque('manual', datos.manual || {}, false) + '\n' +
        bloque('automatico', datos.automatico || {}, true) + '\n}\n';
}

/** La tabla automática en la forma del archivo: `{"4515": [10101, "pincel", "grass"]}`. */
function tablaAArchivo(tabla) {
    const salida = {};
    tabla.forEach((e, id) => {
        salida[id] = [e.destino, e.metodo, e.nombre];
    });
    return salida;
}

/** Lo contrario: la tabla del archivo como Map. */
function tablaDeArchivo(automatico) {
    const tabla = new Map();
    Object.keys(automatico || {}).forEach((k) => {
        const v = automatico[k];
        const [destino, metodo, nombre] = Array.isArray(v) ? v : [v, 'automatico', ''];
        tabla.set(Number(k), { destino: Number(destino), metodo: String(metodo), nombre: String(nombre || '') });
    });
    return tabla;
}

/** El sello de un items.otb, para saber si la tabla guardada se hizo con el mismo. */
function selloDeOtb(otb) {
    return { descripcion: otb.version.descripcion, mayor: otb.version.mayor, menor: otb.version.menor,
        items: otb.items.size };
}

function mismoOrigen(a, b) {
    return Boolean(a && b) && a.descripcion === b.descripcion && a.mayor === b.mayor &&
        a.menor === b.menor && a.items === b.items;
}

/**
 * La tabla que se usa al importar: la automática con `manual` encima. Cada entrada es
 * `{destino, metodo, nombre}`; `destino` 0 es «quitar a propósito».
 */
function tablaFinal(automatica, manual) {
    const tabla = new Map(automatica);
    Object.keys(manual || {}).forEach((k) => {
        const anterior = tabla.get(Number(k));
        tabla.set(Number(k), { destino: Number(manual[k]) || 0, metodo: 'manual',
            nombre: anterior ? anterior.nombre : '' });
    });
    return tabla;
}

/**
 * La tabla INVERSA, de Jetyum a Tibia, para exportar. De todos los ids de Tibia que van a un mismo
 * id de Jetyum se queda el del método más fiable y, a igualdad, el primero (el de más probabilidad
 * en su pincel, que es el que se asignó antes).
 */
function tablaInversa(tabla) {
    const inversa = new Map();
    const rango = (m) => {
        const i = METODOS.indexOf(m);
        return i === -1 ? METODOS.length : i;
    };
    tabla.forEach((e, idTibia) => {
        if (!e.destino) {
            return;
        }
        const actual = inversa.get(e.destino);
        if (!actual || rango(e.metodo) < rango(actual.metodo)) {
            inversa.set(e.destino, { id: idTibia, metodo: e.metodo });
        }
    });
    return inversa;
}

module.exports = {
    FORMATO,
    VERSION,
    METODOS,
    porDefecto,
    normalizarNombre,
    colorDeMinimapa,
    construirEquivalencias,
    leerArchivo,
    serializar,
    tablaAArchivo,
    tablaDeArchivo,
    tablaFinal,
    tablaInversa,
    selloDeOtb,
    mismoOrigen,
    fichaDeTibia
};
