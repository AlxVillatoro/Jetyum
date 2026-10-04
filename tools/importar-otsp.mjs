/**
 * IMPORTAR EL OPENTIBIA SPRITE PACK (OTSP) — el «abrir .dat/.spr» de ObjectBuilder.
 *
 *     git clone --depth 1 https://github.com/peonso/opentibia_sprite_pack /tmp/otsp
 *     node tools/importar-otsp.mjs --pack /tmp/otsp
 *     node tools/importar-otsp.mjs --pack /tmp/otsp --assets d --items f   # otra carpeta (pruebas)
 *
 * El pack (https://github.com/peonso/opentibia_sprite_pack, CC BY 4.0) trae los archivos de
 * cliente de Tibia 10.41 (`otsp.dat` y `otsp.spr`) y el `items.xml` de servidor. Con ellos cada
 * cosa llega ENTERA: su tamaño (los muros y los árboles miden 64x64), sus patrones, su animación y
 * sus banderas. Cortar las hojas PNG a mano obliga a recomponer cada pieza grande como un
 * rompecabezas; leer el `.dat` no.
 *
 * LOS IDENTIFICADORES SE DESPLAZAN para no chocar con los que ya hay (el 102 del pack es una
 * hierba y aquí el 102 ya es otra):
 *
 *     objetos      id del pack + 10000   (100..2712   ->  10100..12712)
 *     aspectos     id del pack + 300     (1..46       ->  301..346)
 *     efectos      id del pack + 100     (1..64       ->  101..164)
 *     proyectiles  id del pack + 100     (1..60       ->  101..160)
 *
 * Así el cliente y el servidor siguen usando el MISMO número para cada cosa (como en Tibia), los
 * mapas y aspectos que ya existían no cambian y el pack se puede volver a importar.
 *
 * ES IDEMPOTENTE: los sprites se deduplican (los que ya estaban en la biblioteca, por ejemplo los
 * cortados de las hojas PNG del pack, se reutilizan), las cosas del pack se sustituyen y el bloque
 * del pack en `items.xml` va entre dos marcas y se reescribe entero.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as Assets from '../shared/js/assets.mjs';

const require = createRequire(import.meta.url);
const { AssetStore } = require('../editor/lib/assetstore.js');
const Xml = require('../engine/data/xml.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = Assets.SPRITE_SIZE;

export const DESPLAZAMIENTO = { items: 10000, outfits: 300, effects: 100, missiles: 100 };

/** Milisegundos por fotograma cuando el `.dat` no los trae (los de ObjectBuilder). */
const DURACION = { items: 500, outfits: 300, effects: 100, missiles: 100 };

const MARCA_INICIO = '<!-- OTSP:inicio (generado por tools/importar-otsp.mjs: no editar a mano) -->';
const MARCA_FIN = '<!-- OTSP:fin -->';

/** Los atributos del `items.xml` de TFS que se conservan (los demás no los usa este motor). */
const ATRIBUTOS_TFS = ['weight', 'attack', 'defense', 'armor', 'slotType', 'weaponType',
    'description', 'containerSize', 'floorchange'];

// ---------------------------------------------------------------------------
// El .spr: sprites de 32x32 comprimidos por tiradas
// ---------------------------------------------------------------------------

/**
 * Lee el `.spr` «extendido» (contador de 32 bits) y sin canal alfa: cada sprite es una lista de
 * tiradas «n transparentes, m de color» con m píxeles RGB detrás.
 *
 * @returns {{count:number, sprite:(id:number)=>Buffer|null}}
 */
export function leerSpr(buffer) {
    const count = buffer.readUInt32LE(4);
    return {
        count,
        sprite(id) {
            const offset = buffer.readUInt32LE(8 + (id - 1) * 4);
            if (offset === 0) {
                return null;
            }
            const rgba = Buffer.alloc(S * S * 4);
            let p = offset + 3; // la clave de color transparente no se usa
            const tamano = buffer.readUInt16LE(p);
            p += 2;
            const fin = p + tamano;
            let pixel = 0;
            while (p < fin && pixel < S * S) {
                pixel += buffer.readUInt16LE(p);
                const color = buffer.readUInt16LE(p + 2);
                p += 4;
                for (let i = 0; i < color && pixel < S * S; i += 1) {
                    rgba[pixel * 4] = buffer[p];
                    rgba[pixel * 4 + 1] = buffer[p + 1];
                    rgba[pixel * 4 + 2] = buffer[p + 2];
                    rgba[pixel * 4 + 3] = 255;
                    p += 3;
                    pixel += 1;
                }
            }
            return rgba;
        }
    };
}

// ---------------------------------------------------------------------------
// El .dat: las cosas, en el formato de Tibia 10.10-10.41
// ---------------------------------------------------------------------------

/**
 * Las banderas del `.dat` de 10.10+ (las «MetadataFlags6» de ObjectBuilder) y cómo se llaman
 * aquí. `datos` son los bytes que llevan detrás.
 */
const BANDERAS_DAT = {
    0x00: ['ground', 'u16'], 0x01: ['groundBorder'], 0x02: ['onBottom'], 0x03: ['onTop'],
    0x04: ['container'], 0x05: ['stackable'], 0x06: ['forceUse'], 0x07: ['multiUse'],
    0x08: ['writable', 'u16'], 0x09: ['writableOnce', 'u16'], 0x0A: ['fluidContainer'],
    0x0B: ['splash'], 0x0C: ['notWalkable'], 0x0D: ['notMoveable'], 0x0E: ['blockProjectile'],
    0x0F: ['notPathable'], 0x10: [null], 0x11: ['pickupable'], 0x12: ['hangable'],
    0x13: ['vertical'], 0x14: ['horizontal'], 0x15: ['rotatable'], 0x16: ['light', 'u16u16'],
    0x17: ['dontHide'], 0x18: ['translucent'], 0x19: ['offset', 'i16i16'], 0x1A: ['elevation', 'u16'],
    0x1B: ['lyingObject'], 0x1C: ['animateAlways'], 0x1D: ['minimap', 'u16'], 0x1E: ['lensHelp', 'u16'],
    0x1F: ['fullGround'], 0x20: ['ignoreLook'], 0x21: ['cloth', 'u16'], 0x22: [null, 'mercado'],
    0x23: [null, 'u16'], 0x24: [null], 0x25: [null], 0x26: [null], 0xFE: [null]
};

/**
 * Lee el `.dat`. Devuelve las cosas de las cuatro categorías con los identificadores DEL PACK y
 * los sprites con los números DEL `.spr`.
 */
export function leerDat(buffer) {
    let p = 0;
    const u8 = () => buffer[p++];
    const u16 = () => { const v = buffer.readUInt16LE(p); p += 2; return v; };
    const i16 = () => { const v = buffer.readInt16LE(p); p += 2; return v; };
    const u32 = () => { const v = buffer.readUInt32LE(p); p += 4; return v; };

    u32(); // firma
    const cuantos = { items: u16(), outfits: u16(), effects: u16(), missiles: u16() };
    const primero = { items: 100, outfits: 1, effects: 1, missiles: 1 };
    const salida = { items: [], outfits: [], effects: [], missiles: [] };

    Assets.CATEGORY_NAMES.forEach((categoria) => {
        for (let id = primero[categoria]; id <= cuantos[categoria]; id += 1) {
            const flags = {};
            for (;;) {
                const codigo = u8();
                if (codigo === 0xFF) {
                    break;
                }
                const definicion = BANDERAS_DAT[codigo];
                if (!definicion) {
                    throw new Error('bandera 0x' + codigo.toString(16) + ' desconocida en ' + categoria +
                        ' ' + id + ' (byte ' + (p - 1) + ')');
                }
                const [clave, datos] = definicion;
                let valor = true;
                if (datos === 'u16') {
                    valor = u16();
                } else if (datos === 'u16u16') {
                    valor = [u16(), u16()];
                } else if (datos === 'i16i16') {
                    valor = [i16(), i16()];
                } else if (datos === 'mercado') {
                    u16(); u16(); u16();
                    p += u16();
                    u16(); u16();
                }
                if (!clave) {
                    continue;
                }
                if (clave === 'ground') {
                    flags.ground = { speed: valor };
                } else if (clave === 'writable' || clave === 'writableOnce') {
                    flags[clave] = { maxLength: valor };
                } else if (clave === 'light') {
                    flags.light = { level: valor[0], color: valor[1] };
                } else if (clave === 'offset') {
                    flags.offset = { x: valor[0], y: valor[1] };
                } else {
                    flags[clave] = valor;
                }
            }

            const width = u8();
            const height = u8();
            const exactSize = width > 1 || height > 1 ? u8() : S;
            const layers = u8();
            const patternX = u8();
            const patternY = u8();
            const patternZ = u8();
            const frames = u8();
            const total = width * height * layers * patternX * patternY * patternZ * frames;
            const sprites = [];
            for (let i = 0; i < total; i += 1) {
                sprites.push(u32());
            }
            salida[categoria].push({ id, width, height, exactSize, layers, patternX, patternY, patternZ,
                frames, flags, sprites });
        }
    });

    return { cuantos, cosas: salida };
}

// ---------------------------------------------------------------------------
// items.xml: del de TFS al de este motor
// ---------------------------------------------------------------------------

/** Los atributos de servidor que corresponden a las banderas de cliente (como hace items.otb). */
export function atributosDeServidor(flags) {
    const attrs = {};
    if (flags.ground) {
        attrs.isGround = 1;
        attrs.groundSpeed = flags.ground.speed || 150;
    }
    Assets.FLAGS.forEach((flag) => {
        if (flag.servidor && flag.key !== 'ground' && flags[flag.key] !== undefined) {
            attrs[flag.servidor] = 1;
        }
    });
    return attrs;
}

function escaparXml(texto) {
    return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Una ficha en una línea: el diff del bloque dice qué objeto cambió. */
export function lineaDeItem(id, nombre, articulo, attrs) {
    const cabecera = '\t<item id="' + id + '"' + (articulo ? ' article="' + escaparXml(articulo) + '"' : '') +
        ' name="' + escaparXml(nombre) + '"';
    const claves = Object.keys(attrs);
    if (claves.length === 0) {
        return cabecera + ' />';
    }
    return cabecera + '>' + claves.map((k) => '<attribute key="' + k + '" value="' + escaparXml(attrs[k]) + '" />').join('') +
        '</item>';
}

/**
 * NOMBRES PROPIOS para cosas del pack que vienen como «object», «sword» o «helmet» a secas y el
 * juego usa por su nombre: la caja que dejan los monstruos sin cuerpo (`corpseFallbackId` en
 * config.js) y el BOTÍN de los monstruos (`loot` en data/monsters). Cada uno puede traer:
 *
 * - `attrs`: los atributos de servidor que manda (ataque, defensa, armadura, peso en centésimas de
 *   onza, ranura...), por encima de los del items.xml del pack;
 * - `apilable`: se amontona como las monedas (gemas, comida).
 *
 * Los números son los del pack (sin el desplazamiento): el 1725 es el objeto 11725.
 */
const espada = (ataque, defensa, peso) => ({ attack: ataque, defense: defensa, weight: peso, weaponType: 'sword' });
const hacha = (ataque, defensa, peso) => ({ attack: ataque, defense: defensa, weight: peso, weaponType: 'axe' });
const maza = (ataque, defensa, peso) => ({ attack: ataque, defense: defensa, weight: peso, weaponType: 'club' });
const escudo = (defensa, peso) => ({ defense: defensa, weight: peso, weaponType: 'shield' });
const ropa = (ranura, armadura, peso) => ({ armor: armadura, weight: peso, slotType: ranura });
const objeto = (peso) => ({ weight: peso });

export const NOMBRES_PROPIOS = {
    1109: { nombre: 'wooden box', articulo: 'a' },

    // Armas
    1725: { nombre: 'short sword', articulo: 'a', attrs: espada(11, 11, 3500) },
    1704: { nombre: 'sabre', articulo: 'a', attrs: espada(12, 10, 2500) },
    1771: { nombre: 'longsword', articulo: 'a', attrs: espada(17, 14, 4200) },
    1736: { nombre: 'fire sword', articulo: 'a', attrs: espada(24, 20, 2300) },
    1849: { nombre: 'hand axe', articulo: 'a', attrs: hacha(10, 5, 1800) },
    1855: { nombre: 'battle axe', articulo: 'a', attrs: hacha(23, 12, 5000) },
    1805: { nombre: 'battle hammer', articulo: 'a', attrs: maza(24, 14, 6800) },

    // Escudos
    1923: { nombre: 'studded shield', articulo: 'a', attrs: escudo(16, 5900) },
    1926: { nombre: 'brass shield', articulo: 'a', attrs: escudo(16, 6000) },
    1916: { nombre: 'plate shield', articulo: 'a', attrs: escudo(17, 6500) },
    1933: { nombre: 'steel shield', articulo: 'a', attrs: escudo(21, 6900) },

    // Yelmos, armaduras, piernas
    1970: { nombre: 'chain helmet', articulo: 'a', attrs: ropa('head', 2, 4200) },
    1956: { nombre: 'brass helmet', articulo: 'a', attrs: ropa('head', 3, 2700) },
    1949: { nombre: 'viking helmet', articulo: 'a', attrs: ropa('head', 3, 3900) },
    2010: { nombre: 'doublet', articulo: 'a', attrs: ropa('body', 2, 2500) },
    2062: { nombre: 'brass armor', articulo: 'a', attrs: ropa('body', 8, 8000) },
    2079: { nombre: 'leather legs', articulo: '', attrs: ropa('legs', 1, 1800) },
    2077: { nombre: 'studded legs', articulo: '', attrs: ropa('legs', 2, 2600) },
    2081: { nombre: 'chain legs', articulo: '', attrs: ropa('legs', 3, 3500) },
    2085: { nombre: 'brass legs', articulo: '', attrs: ropa('legs', 5, 3800) },

    // Comida (se amontona)
    2181: { nombre: 'ham', articulo: 'a', attrs: objeto(2000), apilable: true },
    2183: { nombre: 'cheese', articulo: 'a', attrs: objeto(400), apilable: true },
    2177: { nombre: 'red apple', articulo: 'a', attrs: objeto(150), apilable: true },
    2174: { nombre: 'banana', articulo: 'a', attrs: objeto(180), apilable: true },

    // Gemas (se amontonan)
    2207: { nombre: 'small sapphire', articulo: 'a', attrs: objeto(10), apilable: true },
    2211: { nombre: 'small ruby', articulo: 'a', attrs: objeto(10), apilable: true },
    2213: { nombre: 'small emerald', articulo: 'a', attrs: objeto(10), apilable: true },
    2215: { nombre: 'small amethyst', articulo: 'a', attrs: objeto(10), apilable: true },
    2219: { nombre: 'small diamond', articulo: 'a', attrs: objeto(10), apilable: true },

    // Otras
    2166: { nombre: 'bone', articulo: 'a', attrs: objeto(950) },
    2137: { nombre: 'rope', articulo: 'a', attrs: objeto(1800) },

    // A distancia: la flecha (la munición del arco, en la ranura de munición; sale volando con
    // `shootType` 103, la flecha del pack) y la estrella arrojadiza (se lanza ella misma y a
    // veces se rompe, `breakChance` en %).
    2138: { nombre: 'arrow', articulo: 'an', apilable: true,
        attrs: { weight: 70, attack: 25, ammoType: 'arrow', shootType: 103, weaponType: 'ammunition' } },
    1892: { nombre: 'throwing star', articulo: 'a', apilable: true,
        attrs: { weight: 200, attack: 20, range: 5, shootType: 106, breakChance: 10, weaponType: 'distance' } },

    // El cofre de DEPÓSITO: cada jugador ve dentro lo suyo (`depotItemId` en config.js).
    1112: { nombre: 'depot chest', articulo: 'a', attrs: { containerSize: 30, depot: 1 } }
};

/**
 * OBJETOS DE ANTES CON EL DIBUJO DEL PACK: la mochila de inicio (2412, la que reparte
 * `newPlayerContainerId` y llevan los personajes guardados) y las monedas del botín usaban un
 * dibujo provisional. Se les pone el del pack (la mochila 2099 → 12099, las monedas…) sin
 * cambiarles el número, para no tocar ni la base de datos, ni los mapas, ni el botín.
 */
export const DIBUJO_DEL_PACK = {
    2412: 2099,   // backpack
    3031: 2192,   // gold coin (el botín de casi todos los monstruos)
    2152: 2191,   // platinum coin (100 de oro; se cambian con clic derecho, data/scripts/actions/monedas.js)
    2160: 2209,   // crystal coin
    // Las armas, la ropa y lo demás del principio, que también salen en el botín.
    2401: 1750,   // dagger
    2402: 1850,   // axe
    2403: 1816,   // mace
    2404: 1879,   // bow
    2405: 1810,   // staff
    2406: 2024,   // leather armor
    2407: 2066,   // chain armor
    2408: 2030,   // plate armor
    2409: 1915,   // wooden shield
    2410: 1943,   // leather helmet
    2411: 2091,   // leather boots
    2413: 2130,   // health potion
    2414: 2131,   // mana potion
    2415: 2187,   // meat
    2417: 2103    // torch
};

/** Lo que dura cada etapa de un cuerpo, en segundos: fresco, podrido y huesos. */
export const ETAPAS_DE_CUERPO = [180, 120, 60];

/**
 * EL CUERPO SE PUDRE, como en TFS: en el pack, cada criatura trae tres cuerpos seguidos con el
 * mismo nombre («dead cat»): fresco y podrido (contenedores, con el botín dentro) y los huesos.
 * Se encadenan con `decayTo` y `duration`: fresco → podrido → huesos → desaparece.
 *
 * @param {Array<{id:number, nombre:string, attrs:Object}>} fichas en orden de id
 */
export function decaimientoDeCuerpos(fichas) {
    for (let i = 0; i < fichas.length;) {
        let j = i;
        while (j + 1 < fichas.length && fichas[j + 1].nombre === fichas[i].nombre && fichas[j + 1].id === fichas[j].id + 1) {
            j += 1;
        }
        const tanda = fichas.slice(i, j + 1);
        const esCuerpo = /^dead /.test(fichas[i].nombre) && tanda.length === 3 &&
            tanda[0].attrs.isContainer && tanda[1].attrs.isContainer && !tanda[2].attrs.isContainer;
        if (esCuerpo) {
            tanda.forEach((ficha, k) => {
                if (k < 2) {
                    ficha.attrs.decayTo = tanda[k + 1].id;
                }
                ficha.attrs.duration = ETAPAS_DE_CUERPO[k];
                ficha.attrs.corpse = 1;
            });
        }
        i = j + 1;
    }
    return fichas;
}

/** Sustituye (o añade) el bloque del pack en items.xml, dejando intacto todo lo demás. */
export function ponerBloque(xml, lineas) {
    const bloque = '\t' + MARCA_INICIO + '\n' + lineas.join('\n') + '\n\t' + MARCA_FIN + '\n';
    const inicio = xml.indexOf('\t' + MARCA_INICIO);
    if (inicio !== -1) {
        const fin = xml.indexOf(MARCA_FIN, inicio) + MARCA_FIN.length + 1;
        return xml.slice(0, inicio) + bloque + xml.slice(fin);
    }
    const cierre = xml.lastIndexOf('</items>');
    return xml.slice(0, cierre) + '\n' + bloque + xml.slice(cierre);
}

// ---------------------------------------------------------------------------
// La importación
// ---------------------------------------------------------------------------

function cosaNueva(categoria, cosa, idsDeSprite, nombre) {
    const t = {
        id: cosa.id + DESPLAZAMIENTO[categoria],
        name: nombre,
        width: cosa.width,
        height: cosa.height,
        exactSize: Math.max(S, Math.min(256, cosa.exactSize)),
        layers: cosa.layers,
        patternX: cosa.patternX,
        patternY: cosa.patternY,
        patternZ: cosa.patternZ,
        frames: cosa.frames,
        flags: cosa.flags,
        sprites: cosa.sprites.map((n) => (n > 0 ? idsDeSprite.get(n) || 0 : 0))
    };
    if (cosa.frames > 1) {
        const d = DURACION[categoria];
        t.animation = { mode: 'async', loop: 0, start: 0,
            durations: Array.from({ length: cosa.frames }, () => [d, d]) };
    }
    return t;
}

/**
 * @param {{pack:string, assets?:string, items?:string, registro?:Function}} opciones
 */
export function importar(opciones) {
    const pack = opciones.pack;
    const dirAssets = opciones.assets || path.join(RAIZ, 'client', 'jetyum', 'assets');
    const archivoItems = opciones.items || path.join(RAIZ, 'data', 'items', 'items.xml');
    const log = opciones.registro || (() => {});

    const dat = leerDat(fs.readFileSync(path.join(pack, 'client_files', 'otsp.dat')));
    const spr = leerSpr(fs.readFileSync(path.join(pack, 'client_files', 'otsp.spr')));
    const tfs = Xml.loadItems(path.join(pack, 'server_files', 'items.xml'));

    // 1. Los sprites que se usan, en orden: se añaden de una vez y se deduplican.
    const usados = new Set();
    Assets.CATEGORY_NAMES.forEach((c) => dat.cosas[c].forEach((cosa) => cosa.sprites.forEach((n) => {
        if (n > 0 && n <= spr.count) {
            usados.add(n);
        }
    })));
    const orden = [...usados].sort((a, b) => a - b);
    const store = new AssetStore(dirAssets);
    const resultado = store.addSprites(orden.map((n) => spr.sprite(n) || Buffer.alloc(S * S * 4)));
    const idsDeSprite = new Map(orden.map((n, i) => [n, resultado.ids[i]]));
    store.flush();
    log('sprites: ' + orden.length + ' del pack, ' + resultado.added + ' nuevos, ' + resultado.reused +
        ' ya estaban en la biblioteca');

    // 2. Las cosas. Las del pack sustituyen a las que tuvieran su identificador desplazado.
    const things = store.readThings();
    const nombres = { outfits: 'otsp aspecto ', effects: 'otsp efecto ', missiles: 'otsp proyectil ' };
    const fichas = [];
    const cuenta = {};
    Assets.CATEGORY_NAMES.forEach((categoria) => {
        const nuevas = dat.cosas[categoria].map((cosa) => {
            let nombre = nombres[categoria] ? nombres[categoria] + cosa.id : null;
            if (categoria === 'items') {
                const ficha = tfs.get(cosa.id);
                nombre = (ficha && ficha.name) || 'otsp ' + cosa.id;
                const propio = NOMBRES_PROPIOS[cosa.id];
                if (propio) {
                    nombre = propio.nombre;
                    if (propio.apilable) {
                        cosa.flags = { ...cosa.flags, stackable: true };
                    }
                }
                const attrs = atributosDeServidor(cosa.flags);
                ATRIBUTOS_TFS.forEach((k) => {
                    if (ficha && ficha.attributes && ficha.attributes[k] !== undefined) {
                        attrs[k] = ficha.attributes[k];
                    }
                });
                if (propio && propio.attrs) {
                    // Lo de combate es del objeto que de verdad es (un escudo no es un yelmo).
                    ['attack', 'defense', 'armor', 'slotType', 'weaponType'].forEach((k) => delete attrs[k]);
                    Object.assign(attrs, propio.attrs);
                }
                fichas.push({ id: cosa.id + DESPLAZAMIENTO.items, nombre, articulo: propio && propio.articulo !== undefined ? propio.articulo : (ficha && ficha.article), attrs });
            }
            return cosaNueva(categoria, cosa, idsDeSprite, nombre);
        });
        if (categoria === 'items') {
            Object.keys(DIBUJO_DEL_PACK).forEach((viejo) => {
                const delPack = nuevas.find((t) => t.id === DIBUJO_DEL_PACK[viejo] + DESPLAZAMIENTO.items);
                const antes = (things.items || []).find((t) => t.id === Number(viejo));
                if (delPack && antes) {
                    // Del pack, sólo lo del dibujo; lo que el objeto hace en el juego (las banderas
                    // que también tiene el servidor) sigue siendo lo suyo de siempre.
                    const deDibujo = Object.fromEntries(Object.entries(delPack.flags || {}).filter(([k]) =>
                        !Assets.FLAGS.some((f) => f.key === k && f.servidor)));
                    nuevas.push({ ...delPack, id: Number(viejo), name: antes.name,
                        flags: { ...antes.flags, ...deDibujo } });
                }
            });
        }
        const ids = new Set(nuevas.map((t) => t.id));
        things[categoria] = (things[categoria] || []).filter((t) => !ids.has(t.id)).concat(nuevas)
            .sort((a, b) => a.id - b.id);
        cuenta[categoria] = nuevas.length;
    });

    const escrito = store.writeThings(things);
    if (!escrito.ok) {
        throw new Error('things.json no es válido: ' + escrito.problems.slice(0, 5).join('; '));
    }
    log('cosas: ' + Object.keys(cuenta).map((c) => cuenta[c] + ' ' + c).join(', '));

    // 3. Las fichas de servidor, con los cuerpos encadenados para pudrirse.
    const lineas = decaimientoDeCuerpos(fichas.sort((a, b) => a.id - b.id))
        .map((f) => lineaDeItem(f.id, f.nombre, f.articulo, f.attrs));
    fs.writeFileSync(archivoItems, ponerBloque(fs.readFileSync(archivoItems, 'utf8'), lineas));
    log('items.xml: ' + lineas.length + ' fichas del pack');

    return { sprites: resultado, cuenta, fichas: lineas.length };
}

// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const valor = (nombre) => {
        const i = args.indexOf(nombre);
        return i === -1 ? undefined : args[i + 1];
    };
    if (!valor('--pack')) {
        console.error('Uso: node tools/importar-otsp.mjs --pack <carpeta del opentibia_sprite_pack>');
        console.error('     git clone --depth 1 https://github.com/peonso/opentibia_sprite_pack /tmp/otsp');
        process.exit(1);
    }
    importar({ pack: valor('--pack'), assets: valor('--assets'), items: valor('--items'), registro: console.log });
}
