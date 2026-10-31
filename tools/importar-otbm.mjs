/**
 * IMPORTA UN MAPA OTBM (el de Remere's Map Editor y TFS) A UN MAPA DE JETYUM.
 *
 *     node tools/importar-otbm.mjs <mapa.otbm> --items-otb <items.otb> --items-xml <items.xml>
 *          [--materiales <materials.xml>] [--houses <x-house.xml>] [--spawns <x-spawn.xml>]
 *          [--area x1,y1,x2,y2[,z1,z2]] [--sin-desplazar] [--salida data/world/<nombre>.map.json]
 *          [--nombre <nombre>] [--informe] [--json]
 *
 *     node tools/importar-otbm.mjs --equivalencias --items-otb <items.otb> --items-xml <items.xml>
 *          --materiales <materials.xml>                 (regenera data/editor/equivalencias-otbm.json)
 *
 * Ejemplo con el mapa de muestra de TFS 8.60 (una ciudad):
 *
 *     node tools/importar-otbm.mjs ../forserver-downgrade/data/world/world.otbm \
 *          --items-otb ../forserver-downgrade/data/items/items.otb \
 *          --items-xml ../forserver-downgrade/data/items/items.xml \
 *          --houses ../forserver-downgrade/data/world/world-house.xml \
 *          --spawns ../forserver-downgrade/data/world/world-spawn.xml \
 *          --area 950,940,1060,1060,6,7 --salida data/world/classic.map.json
 *
 * Lo que hace y cómo traduce los ids está en `editor/lib/convertirotbm.js` y
 * `editor/lib/equivalencias.js`; el formato de las equivalencias, en `docs/MAPAS.md` (sección 5).
 *
 * NUNCA PISA UN MAPA: si `--salida` ya existe, se para. Sin `--salida` no escribe nada (sirve para
 * ver el informe antes de decidir el área). `--informe` saca el informe entero (todos los ids sin
 * equivalencia, monstruos desconocidos…) y `--json` lo saca en JSON.
 *
 * `--houses` y `--spawns`, si no se dan, se buscan junto al `.otbm` con el nombre que el propio
 * mapa dice (RME los apunta en la cabecera: `world-house.xml`, `world-spawn.xml`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Convertir = require('../editor/lib/convertirotbm.js');
const Otbm = require('../editor/lib/otbm.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Los monstruos y NPC del datapack, leídos como los lee el editor (para validar los respawns). */
export function tiposDelDatapack() {
    const Servidor = require('../editor/server.js');
    return { monsterTypes: Servidor.loadMonsterTypes(), npcTypes: Servidor.loadNpcTypes() };
}

/**
 * Los nombres de los archivos de casas y respawns que el `.otbm` dice tener, junto a él. Solo se
 * lee la cabecera (los datos del mapa van antes que las casillas): no hace falta recorrer el mapa.
 */
export function archivosVecinos(archivoOtbm) {
    const salida = { casas: null, spawns: null };
    const datos = { archivoCasas: null, archivoSpawns: null };
    try {
        Otbm.recorrerNodos(fs.readFileSync(archivoOtbm), {
            abrir(tipo, props, nivel) {
                if (nivel === 0) {
                    return true;
                }
                if (tipo === Otbm.NODO.DATOS_DEL_MAPA) {
                    const r = new Otbm.LectorDePropiedades(props);
                    while (r.quedan() > 0) {
                        const atributo = r.u8();
                        const texto = r.cadena();
                        if (atributo === Otbm.ATRIBUTO.ARCHIVO_CASAS) {
                            datos.archivoCasas = texto;
                        } else if (atributo === Otbm.ATRIBUTO.ARCHIVO_SPAWNS) {
                            datos.archivoSpawns = texto;
                        }
                    }
                    throw new Error('listo');
                }
                return false;
            }
        });
    } catch (error) {
        if (error.message !== 'listo') {
            return salida;
        }
    }
    const carpeta = path.dirname(archivoOtbm);
    if (datos.archivoCasas && fs.existsSync(path.join(carpeta, datos.archivoCasas))) {
        salida.casas = path.join(carpeta, datos.archivoCasas);
    }
    if (datos.archivoSpawns && fs.existsSync(path.join(carpeta, datos.archivoSpawns))) {
        salida.spawns = path.join(carpeta, datos.archivoSpawns);
    }
    return salida;
}

/**
 * Importa y, si se pide, escribe. Devuelve `{raw, informe, escrito}`.
 *
 * @param {Object} o los mismos campos que las opciones de la línea de órdenes
 */
export function importarOtbm(o) {
    const fuentes = o.fuentes || Convertir.cargarFuentes({
        itemsOtb: o.itemsOtb, itemsXml: o.itemsXml, materiales: o.materiales,
        equivalencias: o.equivalencias, recalcular: o.recalcular
    });
    const vecinos = archivosVecinos(o.otbm);
    const tipos = o.tipos || tiposDelDatapack();
    const nombre = o.nombre || (o.salida ? path.basename(o.salida).replace(/\.map\.json$/, '') : 'importado');

    const { raw, informe } = Convertir.importar({
        otbm: o.otbm,
        fuentes: fuentes,
        nombre: nombre,
        area: o.area,
        desplazar: o.desplazar !== false,
        casas: o.casas || vecinos.casas,
        spawns: o.spawns || vecinos.spawns,
        monsterTypes: tipos.monsterTypes,
        npcTypes: tipos.npcTypes
    });

    let escrito = null;
    if (o.salida) {
        const destino = path.resolve(o.salida);
        if (fs.existsSync(destino)) {
            throw new Error('ya existe ' + destino + ': no se pisa un mapa. Elige otro nombre con --salida');
        }
        if (!informe.carga.ok) {
            throw new Error('el mapa importado no carga en el motor, no se escribe:\n  ' +
                informe.carga.errores.join('\n  '));
        }
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        const texto = JSON.stringify(raw) + '\n';
        fs.writeFileSync(destino, texto, 'utf8');
        escrito = { ruta: destino, bytes: texto.length };
    }
    return { raw, informe, escrito, fuentes };
}

// ---------------------------------------------------------------------------

function opciones(args) {
    const valor = (nombre) => {
        const i = args.indexOf(nombre);
        return i === -1 ? undefined : args[i + 1];
    };
    const conValor = new Set(['--items-otb', '--items-xml', '--materiales', '--houses', '--spawns', '--area',
        '--salida', '--nombre', '--equivalencias-archivo']);
    const sueltos = args.filter((a, i) => !a.startsWith('--') && !conValor.has(args[i - 1]));
    return {
        otbm: sueltos[0],
        itemsOtb: valor('--items-otb'),
        itemsXml: valor('--items-xml'),
        materiales: valor('--materiales'),
        casas: valor('--houses'),
        spawns: valor('--spawns'),
        area: valor('--area'),
        salida: valor('--salida'),
        nombre: valor('--nombre'),
        equivalencias: valor('--equivalencias-archivo'),
        desplazar: !args.includes('--sin-desplazar'),
        recalcular: args.includes('--recalcular'),
        regenerar: args.includes('--equivalencias'),
        informe: args.includes('--informe'),
        json: args.includes('--json')
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const o = opciones(process.argv.slice(2));
    try {
        if (o.regenerar) {
            if (!o.itemsOtb) {
                throw new Error('--equivalencias necesita --items-otb (y conviene --items-xml y --materiales)');
            }
            const fuentes = Convertir.cargarFuentes({ itemsOtb: o.itemsOtb, itemsXml: o.itemsXml,
                materiales: o.materiales, equivalencias: o.equivalencias, recalcular: true });
            const r = Convertir.guardarEquivalencias(fuentes);
            console.log('equivalencias: ' + r.entradas + ' ids en ' + path.relative(RAIZ, r.ruta) + ' (' +
                Math.round(r.bytes / 1024) + ' KB)');
            console.log('  por metodo: ' + Object.keys(fuentes.resumen).map((k) => k + ' ' + fuentes.resumen[k]).join(', '));
            console.log('  tiempos (ms): ' + Object.keys(fuentes.tiempos).map((k) => k + ' ' + fuentes.tiempos[k]).join(', '));
            if (!o.otbm) {
                process.exit(0);
            }
        }
        if (!o.otbm || !o.itemsOtb) {
            console.error('Uso: node tools/importar-otbm.mjs <mapa.otbm> --items-otb <items.otb> --items-xml <items.xml>');
            console.error('       [--materiales <materials.xml>] [--houses <x-house.xml>] [--spawns <x-spawn.xml>]');
            console.error('       [--area x1,y1,x2,y2[,z1,z2]] [--sin-desplazar] [--salida data/world/<nombre>.map.json]');
            console.error('       [--nombre <nombre>] [--informe] [--json] [--recalcular]');
            console.error('     node tools/importar-otbm.mjs --equivalencias --items-otb <items.otb> --items-xml <items.xml>');
            console.error('       --materiales <materials.xml>   (regenera data/editor/equivalencias-otbm.json)');
            process.exit(1);
        }
        const inicio = Date.now();
        const r = importarOtbm(o);
        if (o.json) {
            console.log(JSON.stringify(r.informe, null, 2));
        } else {
            const texto = Convertir.informeEnTexto(o.informe ? r.informe
                : Object.assign({}, r.informe, { sinEquivalencia: r.informe.sinEquivalencia.slice(0, 10) }));
            console.log(texto);
            if (o.informe) {
                r.informe.sinEquivalencia.slice(20).forEach((s) => {
                    console.log('    ' + String(s.id).padStart(6) + '  x' + String(s.veces).padEnd(6) + ' ' + s.nombre);
                });
            }
            console.log('total: ' + (Date.now() - inicio) + ' ms');
        }
        if (r.escrito) {
            console.log('escrito ' + path.relative(RAIZ, r.escrito.ruta) + ' (' + Math.round(r.escrito.bytes / 1024) + ' KB)');
        } else if (!o.json) {
            console.log('(sin --salida no se escribe nada)');
        }
    } catch (error) {
        console.error('error: ' + error.message);
        process.exit(1);
    }
}
