/**
 * LA TABLA DE BANDERAS DEL CLIENTE: `client/jetyum/assets/objetos.json`.
 *
 *     node tools/generar-banderas.mjs        (también lo hace npm run arte:importar)
 *
 * El cliente necesita saber, SIN preguntar al servidor, qué se puede arrastrar, qué es un
 * contenedor, en qué ranura va cada cosa...: lo mismo que hace `Tibia.dat` con el cliente de Tibia.
 * Esas propiedades son las de `data/items/items.xml`, y esta tabla es su COPIA para el navegador:
 * de cada objeto, las banderas que TIENE (`pickupable`, `blocksSolid`, `isContainer`...) y las de
 * texto (`slotType`, `weaponType`, `containerSize`). Una ausente significa que no la tiene, igual
 * que el valor por defecto del motor.
 *
 * QUÉ BANDERAS SON lo decide `FLAG_DEFAULTS` del motor (engine/world/item.js), importada y no
 * copiada: si el motor aprende una, esta tabla la copia sola. Hay que volver a generarla al cambiar
 * items.xml (las pruebas lo comprueban).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import itemModule from '../engine/world/item.js';

const { FLAG_DEFAULTS } = itemModule;

/** Las claves que se copian y NO son sí/no: la ranura, el tipo de arma y los huecos. */
export const CLAVES_DE_TEXTO = ['slotType', 'weaponType', 'containerSize'];

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SALIDA = path.join(RAIZ, 'client', 'jetyum', 'assets', 'objetos.json');
const ITEMS = path.join(RAIZ, 'data', 'items', 'items.xml');

/** Las banderas que declara el cuerpo de un `<item>`. */
export function leerBanderas(cuerpo) {
    const banderas = {};
    const atributo = /<attribute\s+key="([^"]+)"\s+value="([^"]*)"\s*\/>/g;
    let m;
    while ((m = atributo.exec(cuerpo)) !== null) {
        const [, clave, valor] = m;
        if (Object.prototype.hasOwnProperty.call(FLAG_DEFAULTS, clave)) {
            if (valor === '1' || valor === 'true') {
                banderas[clave] = true;
            }
        } else if (CLAVES_DE_TEXTO.includes(clave)) {
            banderas[clave] = valor;
        }
    }
    return banderas;
}

/** Los objetos de items.xml con sus banderas (`fromid`/`toid` incluidos). */
export function leerItems(xml) {
    const lista = [];
    const elemento = /<item\b([^>]*?)(?:\/>|>([\s\S]*?)<\/item>)/g;
    let bloque;
    while ((bloque = elemento.exec(xml)) !== null) {
        const cabecera = bloque[1];
        const attr = (nombre) => {
            const m = cabecera.match(new RegExp('\\b' + nombre + '="([^"]*)"'));
            return m ? m[1] : null;
        };
        const desde = attr('fromid') || attr('id');
        const hasta = attr('toid') || desde;
        if (!desde) {
            continue;
        }
        const banderas = leerBanderas(bloque[2] || '');
        for (let id = Number(desde); id <= Number(hasta); id += 1) {
            lista.push({ id, nombre: attr('name') || '', banderas });
        }
    }
    return lista;
}

export function generar(opciones) {
    const o = opciones || {};
    const items = leerItems(fs.readFileSync(o.items || ITEMS, 'utf8'));
    const tabla = {};
    items.forEach((item) => {
        if (Object.keys(item.banderas).length > 0) {
            tabla[item.id] = { banderas: item.banderas };
        }
    });
    const datos = {
        _comment: [
            'LAS BANDERAS DE CADA OBJETO PARA EL CLIENTE: la copia de las de data/items/items.xml.',
            'NO SE EDITA A MANO: lo genera tools/generar-banderas.mjs.'
        ],
        format: 'jetyum-banderas',
        version: 1,
        items: tabla
    };
    const salida = o.salida || SALIDA;
    fs.mkdirSync(path.dirname(salida), { recursive: true });
    fs.writeFileSync(salida, JSON.stringify(datos, null, 1) + '\n');
    return { objetos: items.length, conBanderas: Object.keys(tabla).length, salida };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const r = generar();
    console.log('escrito ' + path.relative(RAIZ, r.salida) + ': ' + r.conBanderas + ' objetos con banderas de ' + r.objetos);
}
