/**
 * IMPORTA LOS MATERIALES DE RME (materials.xml: suelos, bordes, muros, alfombras, mesas y doodads)
 * A PINCELES Y OBJETOS COMPUESTOS DE JETYUM.
 *
 *     node tools/importar-materiales-rme.mjs <materials.xml>
 *          [--items-otb <items.otb> --items-xml <items.xml>]   (si no, la tabla guardada)
 *          [--equivalencias-archivo data/editor/equivalencias-otbm.json]
 *          [--pinceles data/editor/pinceles-rme.json] [--compuestos data/editor/compuestos-rme.json]
 *          [--fusionar] [--informe]
 *
 * Ejemplo con los materiales de NexaMap (8.60):
 *
 *     node tools/importar-materiales-rme.mjs ../NexaMap-Editor/data/editor/materials.xml
 *
 * QUÉ HACE CON CADA COSA (los ids se traducen con la MISMA tabla que el importador de mapas,
 * `data/editor/equivalencias-otbm.json`; ver `editor/lib/equivalencias.js`):
 *
 *   - un SUELO de RME es un pincel de suelo de Jetyum con sus objetos y su probabilidad (los que
 *     van a parar al mismo objeto de Jetyum suman su probabilidad), su `z` (el `z-order` de RME
 *     entre 100) y su borde exterior;
 *   - un BORDE es un borde de Jetyum con sus doce piezas;
 *   - un MURO es un muro de Jetyum: cada tipo de pieza de RME a su pieza (horizontal, vertical,
 *     esquina, poste, extremos, T, cruce) y la primera puerta normal y la primera ventana de cada
 *     alineación;
 *   - una ALFOMBRA y una MESA, a las suyas;
 *   - un DOODAD es un OBJETO COMPUESTO (la variante de más probabilidad: un compuesto de Jetyum no
 *     sortea variantes), en la categoría de la paleta de RME en que sale.
 *
 * UN PINCEL CON ALGÚN OBJETO SIN EQUIVALENCIA SE SALTA ENTERO y se lista: medio muro o medio árbol
 * es peor que ninguno. Los compuestos que, traducidos, quedan IGUALES que otro ya convertido (muchos
 * doodads de Tibia caen en la misma clase de Jetyum) no se repiten.
 *
 * NUNCA TOCA LOS ORIGINALES por defecto: escribe `data/editor/pinceles-rme.json` y
 * `data/editor/compuestos-rme.json`, que el editor carga como PAQUETES junto a los suyos (todo
 * `pinceles-*.json` y `compuestos-*.json` de esa carpeta; ver docs/MAPAS.md). Con `--fusionar` los
 * añade a `pinceles.json` y `compuestos.json` (quitando antes lo de una importación anterior, que se
 * reconoce por el prefijo `rme-`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { normalizarPinceles, PIEZAS_DE_BORDE, FORMATO_PINCELES } from '../editor/js/pinceles.js';
import * as Compuestos from '../shared/js/compuestos.mjs';

const require = createRequire(import.meta.url);
const Convertir = require('../editor/lib/convertirotbm.js');
const Equivalencias = require('../editor/lib/equivalencias.js');
const { leerMateriales } = require('../editor/lib/materialesrme.js');
const Xml = require('../engine/data/xml.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIJO = 'rme-';

/** El tipo de pieza de muro de RME -> la pieza de Jetyum (ver `TIPO_DE_MURO_RME`). */
const PIEZA_DE_MURO = {
    pole: 'poste', horizontal: 'horizontal', vertical: 'vertical', corner: 'esquina',
    'northwest diagonal': 'esquina', 'south end': 'fin_sur', 'east end': 'fin_este', 'west end': 'fin_oeste',
    'north end': 'fin_norte', 'northeast diagonal': 'diagonal_ne', 'southwest diagonal': 'diagonal_so',
    'southeast diagonal': 'diagonal_se', 'south t': 't_sur', 'east t': 't_este', 'west t': 't_oeste',
    'north t': 't_norte', intersection: 'cruce'
};
const PIEZA_DE_MESA = { alone: 'sola', horizontal: 'horizontal', vertical: 'vertical', north: 'fin_norte',
    south: 'fin_sur', east: 'fin_este', west: 'fin_oeste' };

/** «grass (dried)» -> «rme-grass-dried». */
function clave(nombre) {
    return (PREFIJO + Compuestos.slug(nombre)).slice(0, 64).replace(/-+$/, '');
}

/**
 * Convierte unos materiales ya leídos con una tabla de equivalencias.
 *
 * @param {Object} materiales `leerMateriales(...)`
 * @param {Map<number,{destino:number}>} tabla la final (automática + manual)
 * @param {Map<number,Object>} [itemTypes] para validar
 * @returns {{pinceles: Object, compuestos: Object, informe: Object}}
 */
export function convertirMateriales(materiales, tabla, itemTypes) {
    const traducir = (id) => {
        const e = tabla.get(Number(id));
        return e && e.destino > 0 ? e.destino : null;
    };
    const saltados = { suelos: [], bordes: [], muros: [], alfombras: [], mesas: [], doodads: [] };
    const sinEquivalencia = new Map();
    const apuntar = (lista, nombre, ids) => {
        saltados[lista].push(nombre);
        ids.forEach((id) => sinEquivalencia.set(id, (sinEquivalencia.get(id) || 0) + 1));
    };
    const pinceles = { format: FORMATO_PINCELES, version: 1,
        _comment: ['PINCELES IMPORTADOS DE RME por tools/importar-materiales-rme.mjs. Se regenera: no editar a mano.'],
        suelos: [], bordes: [], muros: [], alfombras: [], mesas: [] };
    const usadas = new Set();
    const unica = (base) => {
        let id = base;
        let n = 2;
        while (usadas.has(id)) {
            id = base.slice(0, 60) + '-' + n;
            n += 1;
        }
        usadas.add(id);
        return id;
    };

    // --- Bordes (solo los que usa algún suelo: los demás no tendrían quién los pusiera) ---
    const bordesUsados = new Set();
    materiales.suelos.forEach((s) => s.bordes.forEach((b) => bordesUsados.add(b.id)));
    const bordeConvertido = new Map();
    materiales.bordes.forEach((borde, id) => {
        if (!bordesUsados.has(id)) {
            return;
        }
        const piezas = {};
        const faltan = [];
        PIEZAS_DE_BORDE.forEach((lado) => {
            if (borde.piezas[lado] === undefined) {
                return;
            }
            const destino = traducir(borde.piezas[lado]);
            if (destino) {
                piezas[lado] = destino;
            } else {
                faltan.push(borde.piezas[lado]);
            }
        });
        if (faltan.length > 0 || Object.keys(piezas).length === 0) {
            apuntar('bordes', 'borde ' + id, faltan);
            return;
        }
        const idJ = unica(clave('borde-' + id));
        bordeConvertido.set(id, idJ);
        pinceles.bordes.push({ id: idJ, piezas: piezas });
    });

    // --- Suelos ---
    materiales.suelos.forEach((s) => {
        if (s.items.length === 0) {
            return;
        }
        const porDestino = new Map();
        const faltan = [];
        s.items.forEach((i) => {
            const destino = traducir(i.id);
            if (!destino) {
                faltan.push(i.id);
                return;
            }
            porDestino.set(destino, (porDestino.get(destino) || 0) + Math.max(1, i.chance));
        });
        if (faltan.length > 0) {
            apuntar('suelos', s.nombre, faltan);
            return;
        }
        const suelo = {
            id: unica(clave(s.nombre)),
            nombre: s.nombre + ' (RME)',
            z: Math.round(s.z / 100),
            items: Array.from(porDestino.entries()).map(([id, chance]) => ({ id: id, chance: chance }))
        };
        const exterior = s.bordes.find((b) => b.align === 'outer' && (b.to === null || b.to === 'none') &&
            bordeConvertido.has(b.id));
        if (exterior) {
            suelo.borde = bordeConvertido.get(exterior.id);
        }
        pinceles.suelos.push(suelo);
    });

    // --- Muros ---
    materiales.muros.forEach((m) => {
        if (Object.keys(m.tipos).length === 0) {
            return;
        }
        const muro = { id: unica(clave(m.nombre)), nombre: m.nombre + ' (RME)', piezas: {} };
        const faltan = [];
        Object.keys(m.tipos).forEach((tipo) => {
            const pieza = PIEZA_DE_MURO[tipo];
            const principal = m.tipos[tipo].items.slice().sort((a, b) => b.chance - a.chance)[0];
            if (!pieza || !principal) {
                return;
            }
            const destino = traducir(principal.id);
            if (!destino) {
                faltan.push(principal.id);
                return;
            }
            muro.piezas[pieza] = muro.piezas[pieza] || destino;
            const alineacion = tipo === 'vertical' ? 'vertical' : tipo === 'horizontal' ? 'horizontal' : null;
            if (!alineacion) {
                return;
            }
            const puerta = m.tipos[tipo].puertas.find((p) => p.tipo === 'normal' && !p.abierta);
            const ventana = m.tipos[tipo].puertas.find((p) => /window/.test(p.tipo));
            [['puertas', puerta], ['ventanas', ventana]].forEach(([lista, cual]) => {
                const d = cual ? traducir(cual.id) : null;
                if (d) {
                    muro[lista] = muro[lista] || {};
                    muro[lista][alineacion] = d;
                }
            });
        });
        if (faltan.length > 0 || (!muro.piezas.horizontal && !muro.piezas.poste)) {
            apuntar('muros', m.nombre, faltan);
            return;
        }
        pinceles.muros.push(muro);
    });

    // --- Alfombras y mesas ---
    [['alfombras', materiales.alfombras, (lado) => (lado === 'center' ? 'centro' : lado), 'centro'],
        ['mesas', materiales.mesas, (lado) => PIEZA_DE_MESA[lado], 'sola']].forEach(([lista, fuente, pieza, basica]) => {
        fuente.forEach((a) => {
            const pincel = { id: unica(clave(a.nombre)), nombre: a.nombre + ' (RME)', piezas: {} };
            const faltan = [];
            Object.keys(a.piezas).forEach((lado) => {
                const nombrePieza = pieza(lado);
                const principal = a.piezas[lado].slice().sort((x, y) => y.chance - x.chance)[0];
                if (!nombrePieza || !principal) {
                    return;
                }
                const destino = traducir(principal.id);
                if (destino) {
                    pincel.piezas[nombrePieza] = destino;
                } else {
                    faltan.push(principal.id);
                }
            });
            if (faltan.length > 0 || !pincel.piezas[basica]) {
                apuntar(lista, a.nombre, faltan);
                return;
            }
            pinceles[lista].push(pincel);
        });
    });

    // --- Doodads -> objetos compuestos ---
    const compuestos = Compuestos.vacio();
    compuestos._comment = ['DOODADS IMPORTADOS DE RME por tools/importar-materiales-rme.mjs. Se regenera: no editar a mano.'];
    const firmas = new Set();
    let repetidos = 0;
    const idsCompuestos = new Set();
    materiales.doodads.forEach((d) => {
        const variante = d.variantes.slice().sort((a, b) => b.chance - a.chance)[0];
        if (!variante) {
            return;
        }
        const faltan = [];
        // Las celdas, con el ancla abajo a la derecha como los compuestos de Jetyum: dx y dy <= 0.
        const maxX = Math.max(...variante.celdas.map((c) => c.x));
        const maxY = Math.max(...variante.celdas.map((c) => c.y));
        // Dos `<tile>` en la misma casilla (RME lo permite) son una celda con los objetos de los dos.
        const porCasilla = new Map();
        variante.celdas.forEach((c) => {
            const k = (c.x - maxX) + ',' + (c.y - maxY) + ',' + (c.z || 0);
            if (!porCasilla.has(k)) {
                porCasilla.set(k, { dx: c.x - maxX, dy: c.y - maxY, dz: c.z || 0, items: [] });
            }
            c.items.forEach((id) => {
                const destino = traducir(id);
                if (!destino) {
                    faltan.push(id);
                }
                porCasilla.get(k).items.push({ id: destino });
            });
        });
        const celdas = Array.from(porCasilla.values());
        if (faltan.length > 0) {
            apuntar('doodads', d.nombre, faltan);
            return;
        }
        const firma = JSON.stringify(celdas);
        if (firmas.has(firma)) {
            repetidos += 1;
            return;
        }
        firmas.add(firma);
        let id = clave(d.nombre) || PREFIJO + 'doodad';
        let n = 2;
        while (idsCompuestos.has(id)) {
            id = clave(d.nombre).slice(0, 60) + '-' + n;
            n += 1;
        }
        idsCompuestos.add(id);
        compuestos.compuestos.push({
            id: id,
            nombre: d.nombre,
            categoria: 'RME: ' + (materiales.paletas.get(d.nombre) || 'doodads'),
            descripcion: 'Doodad «' + d.nombre + '» de RME' + (d.variantes.length > 1
                ? ' (la variante más probable de ' + d.variantes.length + ')' : ''),
            celdas: celdas,
            parametros: []
        });
    });

    const pincelesNormales = normalizarPinceles(pinceles, itemTypes);
    const compuestosNormales = Compuestos.normalizarCompuestos(compuestos, itemTypes);
    const cuenta = (lista) => pinceles[lista].length;
    return {
        pinceles: pincelesNormales.data,
        compuestos: compuestosNormales.data,
        informe: {
            convertidos: { suelos: cuenta('suelos'), bordes: cuenta('bordes'), muros: cuenta('muros'),
                alfombras: cuenta('alfombras'), mesas: cuenta('mesas'), compuestos: compuestos.compuestos.length },
            leidos: { suelos: materiales.suelos.size, bordes: materiales.bordes.size, muros: materiales.muros.size,
                alfombras: materiales.alfombras.size, mesas: materiales.mesas.size, doodads: materiales.doodads.size },
            saltados: saltados,
            compuestosRepetidos: repetidos,
            sinEquivalencia: Array.from(sinEquivalencia.entries()).sort((a, b) => b[1] - a[1])
                .map(([id, veces]) => ({ id: id, veces: veces })),
            problemas: pincelesNormales.problemas.concat(compuestosNormales.problemas)
        }
    };
}

/** Une `nuevos` a un archivo de pinceles quitando antes lo que tenga el prefijo `rme-`. */
function fusionarPinceles(base, nuevos) {
    const salida = Object.assign({}, base);
    ['suelos', 'bordes', 'muros', 'alfombras', 'mesas'].forEach((lista) => {
        salida[lista] = (base[lista] || []).filter((p) => !String(p.id).startsWith(PREFIJO)).concat(nuevos[lista] || []);
    });
    return salida;
}

/**
 * La importación entera: lee, convierte y escribe.
 *
 * @param {Object} o {materiales, itemsOtb?, itemsXml?, equivalencias?, pinceles?, compuestos?, fusionar?}
 */
export function importarMateriales(o) {
    const inicio = Date.now();
    const materiales = leerMateriales(o.materiales);
    let tabla;
    let itemTypes;
    if (o.itemsOtb) {
        const fuentes = Convertir.cargarFuentes({ itemsOtb: o.itemsOtb, itemsXml: o.itemsXml,
            materiales: o.materiales, equivalencias: o.equivalencias });
        tabla = fuentes.tabla;
        itemTypes = fuentes.itemTypes;
    } else {
        const config = Equivalencias.leerArchivo(o.equivalencias ||
            path.join(RAIZ, 'data', 'editor', 'equivalencias-otbm.json'));
        tabla = Equivalencias.tablaFinal(Equivalencias.tablaDeArchivo(config.automatico), config.manual);
        if (tabla.size === 0) {
            throw new Error('no hay tabla de equivalencias guardada: da --items-otb y --items-xml, o generala con ' +
                'node tools/importar-otbm.mjs --equivalencias');
        }
        itemTypes = Xml.loadItems(o.itemsJetyum || path.join(RAIZ, 'data', 'items', 'items.xml'));
    }
    const r = convertirMateriales(materiales, tabla, itemTypes);

    const carpeta = path.join(RAIZ, 'data', 'editor');
    const destinoPinceles = path.resolve(o.pinceles || path.join(carpeta, o.fusionar ? 'pinceles.json' : 'pinceles-rme.json'));
    const destinoCompuestos = path.resolve(o.compuestos ||
        path.join(carpeta, o.fusionar ? 'compuestos.json' : 'compuestos-rme.json'));

    let pinceles = r.pinceles;
    let compuestos = r.compuestos;
    if (o.fusionar) {
        if (fs.existsSync(destinoPinceles)) {
            pinceles = fusionarPinceles(JSON.parse(fs.readFileSync(destinoPinceles, 'utf8')), r.pinceles);
        }
        if (fs.existsSync(destinoCompuestos)) {
            const base = JSON.parse(fs.readFileSync(destinoCompuestos, 'utf8'));
            compuestos = Object.assign({}, base, { compuestos: (base.compuestos || [])
                .filter((c) => !String(c.id).startsWith(PREFIJO)).concat(r.compuestos.compuestos) });
        }
    }
    const escribir = (destino, texto) => {
        if (o.noEscribir) {
            return;
        }
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino + '.tmp', texto, 'utf8');
        fs.renameSync(destino + '.tmp', destino);
    };
    escribir(destinoPinceles, JSON.stringify(pinceles, null, 2) + '\n');
    escribir(destinoCompuestos, Compuestos.serializar(compuestos));
    r.informe.archivos = { pinceles: destinoPinceles, compuestos: destinoCompuestos };
    r.informe.ms = Date.now() - inicio;
    return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const valor = (nombre) => {
        const i = args.indexOf(nombre);
        return i === -1 ? undefined : args[i + 1];
    };
    const conValor = ['--items-otb', '--items-xml', '--equivalencias-archivo', '--pinceles', '--compuestos'];
    const archivo = args.find((a, i) => !a.startsWith('--') && !conValor.includes(args[i - 1]));
    if (!archivo) {
        console.error('Uso: node tools/importar-materiales-rme.mjs <materials.xml> [--items-otb <items.otb> --items-xml <items.xml>]');
        console.error('       [--equivalencias-archivo <json>] [--pinceles <json>] [--compuestos <json>] [--fusionar] [--informe]');
        process.exit(1);
    }
    try {
        const r = importarMateriales({ materiales: archivo, itemsOtb: valor('--items-otb'), itemsXml: valor('--items-xml'),
            equivalencias: valor('--equivalencias-archivo'), pinceles: valor('--pinceles'),
            compuestos: valor('--compuestos'), fusionar: args.includes('--fusionar') });
        const i = r.informe;
        const c = i.convertidos;
        console.log('convertidos: ' + c.suelos + ' suelos, ' + c.bordes + ' bordes, ' + c.muros + ' muros, ' +
            c.alfombras + ' alfombras, ' + c.mesas + ' mesas y ' + c.compuestos + ' compuestos (' +
            i.compuestosRepetidos + ' doodads repetidos tras traducir)');
        console.log('leidos:      ' + Object.keys(i.leidos).map((k) => i.leidos[k] + ' ' + k).join(', '));
        console.log('saltados (algun objeto sin equivalencia): ' + Object.keys(i.saltados)
            .map((k) => i.saltados[k].length + ' ' + k).join(', '));
        if (args.includes('--informe')) {
            Object.keys(i.saltados).forEach((k) => {
                if (i.saltados[k].length) {
                    console.log('  ' + k + ': ' + i.saltados[k].join(', '));
                }
            });
            console.log('  ids sin equivalencia: ' + i.sinEquivalencia.slice(0, 60).map((s) => s.id + ' x' + s.veces).join(', '));
        }
        if (i.problemas.length) {
            console.log('problemas: ' + i.problemas.slice(0, 10).join('; '));
        }
        console.log('escrito ' + path.relative(RAIZ, i.archivos.pinceles) + ' y ' + path.relative(RAIZ, i.archivos.compuestos) +
            ' (' + i.ms + ' ms)');
    } catch (error) {
        console.error('error: ' + error.message);
        process.exit(1);
    }
}
