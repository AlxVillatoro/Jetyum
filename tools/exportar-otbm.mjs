/**
 * EXPORTA UN MAPA DE JETYUM A OTBM (más su `-house.xml` y su `-spawn.xml`), para abrirlo con
 * Remere's Map Editor o cargarlo en TFS.
 *
 *     node tools/exportar-otbm.mjs <mapa.map.json> --salida <mapa.otbm>
 *          [--equivalencias-archivo data/editor/equivalencias-otbm.json] [--sin-origen]
 *
 * Es el camino de vuelta de `tools/importar-otbm.mjs` y usa la MISMA tabla de equivalencias, del
 * revés (`tablaInversa` en `editor/lib/equivalencias.js`): de todos los ids de Tibia que van a parar
 * a un mismo id de Jetyum se elige el más fiable (manual, luego por pincel, luego funcional…). Un
 * objeto de Jetyum que no tiene vuelta (los propios de Jetyum, 21000+, si nadie les ha puesto una en
 * `manual`) se quita y se lista.
 *
 * Si el mapa se importó de un OTBM con desplazamiento (`_otbm.origen`), cada cosa vuelve a su
 * coordenada original; con `--sin-origen` se exporta tal cual. Nunca pisa archivos que existan.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Convertir = require('../editor/lib/convertirotbm.js');
const Equivalencias = require('../editor/lib/equivalencias.js');
const Otbm = require('../editor/lib/otbm.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {{mapa: string|Object, salida?: string, equivalencias?: string, sinOrigen?: boolean}} o
 * @returns {{buffer: Buffer, casasXml: string|null, spawnsXml: string|null, informe: Object, escritos: string[]}}
 */
export function exportarOtbm(o) {
    const raw = typeof o.mapa === 'string' ? JSON.parse(fs.readFileSync(o.mapa, 'utf8')) : o.mapa;
    const config = Equivalencias.leerArchivo(o.equivalencias ||
        path.join(RAIZ, 'data', 'editor', 'equivalencias-otbm.json'));
    const tabla = Equivalencias.tablaFinal(Equivalencias.tablaDeArchivo(config.automatico), config.manual);
    if (tabla.size === 0) {
        throw new Error('la tabla de equivalencias esta vacia: genera una con ' +
            'node tools/importar-otbm.mjs --equivalencias --items-otb ... --materiales ...');
    }
    const base = o.salida ? path.basename(o.salida).replace(/\.otbm$/i, '') : (raw.name || 'mapa');
    const r = Convertir.exportar(raw, {
        inversa: Equivalencias.tablaInversa(tabla),
        origen: o.sinOrigen ? { x: 0, y: 0 } : undefined,
        nombreBase: base,
        itemsMayor: config.origen ? config.origen.mayor : undefined,
        itemsMenor: config.origen ? config.origen.menor : undefined
    });
    const buffer = Otbm.escribirOtbm(r.datos);

    const escritos = [];
    if (o.salida) {
        const destino = path.resolve(o.salida);
        const carpeta = path.dirname(destino);
        const archivos = [[destino, buffer]];
        if (r.casasXml) {
            archivos.push([path.join(carpeta, r.datos.archivoCasas), r.casasXml]);
        }
        if (r.spawnsXml) {
            archivos.push([path.join(carpeta, r.datos.archivoSpawns), r.spawnsXml]);
        }
        const yaEsta = archivos.find(([ruta]) => fs.existsSync(ruta));
        if (yaEsta) {
            throw new Error('ya existe ' + yaEsta[0] + ': no se pisa. Elige otro --salida');
        }
        fs.mkdirSync(carpeta, { recursive: true });
        archivos.forEach(([ruta, contenido]) => {
            fs.writeFileSync(ruta, contenido);
            escritos.push(ruta);
        });
    }
    return { buffer, casasXml: r.casasXml, spawnsXml: r.spawnsXml, datos: r.datos, informe: r.informe, escritos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const valor = (nombre) => {
        const i = args.indexOf(nombre);
        return i === -1 ? undefined : args[i + 1];
    };
    const mapa = args.find((a, i) => !a.startsWith('--') && !['--salida', '--equivalencias-archivo'].includes(args[i - 1]));
    if (!mapa || !valor('--salida')) {
        console.error('Uso: node tools/exportar-otbm.mjs <mapa.map.json> --salida <mapa.otbm>');
        console.error('       [--equivalencias-archivo data/editor/equivalencias-otbm.json] [--sin-origen]');
        process.exit(1);
    }
    try {
        const inicio = Date.now();
        const r = exportarOtbm({ mapa, salida: valor('--salida'), equivalencias: valor('--equivalencias-archivo'),
            sinOrigen: args.includes('--sin-origen') });
        const i = r.informe;
        console.log('casillas: ' + i.casillas + ', objetos: ' + i.exportados + ' de ' + i.items +
            (i.sinVuelta ? ' (' + i.sinVuelta + ' sin vuelta a Tibia: ' +
                i.idsSinVuelta.slice(0, 10).map((s) => s.id + ' x' + s.veces).join(', ') + ')' : ''));
        r.escritos.forEach((ruta) => console.log('escrito ' + path.relative(RAIZ, ruta)));
        console.log('total: ' + (Date.now() - inicio) + ' ms');
    } catch (error) {
        console.error('error: ' + error.message);
        process.exit(1);
    }
}
