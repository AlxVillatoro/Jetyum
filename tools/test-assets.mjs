/**
 * PRUEBA DE LOS ASSETS Y LOS COMPUESTOS: sprites de 32x32, things.json, objetos compuestos,
 * propiedades de objeto y la cascada uniqueId -> actionId -> itemId del motor.
 *
 *     node tools/test-assets.mjs
 *
 * Todo lo que escribe lo escribe en COPIAS de una carpeta temporal: una prueba que tocara
 * `client/jetyum/assets` convertiría un fallo suyo en una biblioteca de sprites rota.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as A from '../shared/js/assets.mjs';
import * as C from '../shared/js/compuestos.mjs';
import { trocearImagen, piezasDeHoja, distribucionDeHoja, esVacio, base64DeBytes, quitarFondoMagenta, esMultiploDe32, enTandas } from '../editor/js/imagenes.js';
import { EditorMap } from '../editor/js/editormap.js';
import { hslToRgb, partOfMask } from '../client/jetyum/js/assets.js';

const require = createRequire(import.meta.url);
const Png = require('../editor/lib/png.js');
const { AssetStore } = require('../editor/lib/assetstore.js');
const Xml = require('../engine/data/xml.js');
const MapLoader = require('../engine/world/loader.js');
const { Item } = require('../engine/world/item.js');
const { createEngine } = require('../engine/core/engine.js');
const Tools = require('../editor/server.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;
let total = 0;

function check(label, condition, detail) {
    total += 1;
    if (condition) {
        console.log('  \x1b[32mPASS\x1b[0m  ' + label + (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
    } else {
        fallos += 1;
        console.log('  \x1b[31mFAIL\x1b[0m  ' + label + (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
    }
}

function section(t) {
    console.log('\n' + t);
}

function temporal() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-assets-'));
}

/** Un sprite RGBA de 32x32 de un color, con un píxel distinto para que no se deduplique. */
function sprite(r, g, b, marca) {
    const d = Buffer.alloc(A.SPRITE_BYTES);
    for (let i = 0; i < d.length; i += 4) {
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
    d[0] = marca || 0;
    return d;
}

async function api(port, method, route, body) {
    const r = await fetch('http://127.0.0.1:' + port + route, {
        method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
    return { status: r.status, body: json };
}

async function main() {
    console.log('Prueba de assets y compuestos (' + ROOT + ')');
    const items = Xml.loadItems(path.join(ROOT, 'data', 'items', 'items.xml'));
    const listaItems = Array.from(items.values());

    // -----------------------------------------------------------------------
    section('1. El orden de los sprites: la fórmula de Tibia');
    {
        const t = { width: 2, height: 3, layers: 2, patternX: 4, patternY: 2, patternZ: 1, frames: 3 };
        check('spriteCount = w*h*capas*px*py*pz*frames', A.spriteCount(t) === 2 * 3 * 2 * 4 * 2 * 3, String(A.spriteCount(t)));
        check('la pieza (0,0) del primer fotograma es la 0', A.spriteIndex(t, 0, 0, 0, 0, 0, 0, 0) === 0);
        check('w crece primero, luego h', A.spriteIndex(t, 1, 0, 0, 0, 0, 0, 0) === 1 && A.spriteIndex(t, 0, 1, 0, 0, 0, 0, 0) === 2);
        check('la capa va después del tamaño', A.spriteIndex(t, 0, 0, 1, 0, 0, 0, 0) === 6);
        check('el fotograma es lo último', A.spriteIndex(t, 0, 0, 0, 0, 0, 0, 1) === 2 * 3 * 2 * 4 * 2);
        let ida = true;
        for (let i = 0; i < A.spriteCount(t); i += 1) {
            const c = A.spriteCoords(t, i);
            if (A.spriteIndex(t, c.w, c.h, c.layer, c.px, c.py, c.pz, c.frame) !== i) { ida = false; }
        }
        check('spriteCoords es la inversa exacta de spriteIndex', ida);
        const hoja = A.sheetOf(1025);
        check('el sprite 1025 es el primero de la segunda hoja', hoja.sheet === 1 && hoja.x === 0 && hoja.y === 0);
        check('el sprite 33 es el primero de la segunda fila', A.sheetOf(33).row === 1 && A.sheetOf(33).column === 0);
    }

    section('2. Redimensionar conserva las piezas, patrones y animación');
    {
        const t = { id: 200, width: 1, height: 1, layers: 1, patternX: 2, patternY: 1, patternZ: 1, frames: 2, flags: {}, sprites: [1, 2, 3, 4] };
        const r = A.resizeThing(t, { width: 2 });
        check('al ensanchar cada pieza sigue en sus coordenadas',
            r.sprites[A.spriteIndex(r, 0, 0, 0, 1, 0, 0, 1)] === 4 && r.sprites[A.spriteIndex(r, 1, 0, 0, 0, 0, 0, 0)] === 0,
            JSON.stringify(r.sprites));
        const menos = A.resizeThing(r, { frames: 1 });
        check('al quitar fotogramas se quita la animación', menos.animation === undefined && menos.sprites.length === 4);
        check('un valor fuera de rango se recorta', A.resizeThing(t, { width: 99 }).width === A.LIMITS.width[1]);
    }

    section('3. Patrones de objetos y animación');
    {
        const monedas = { patternX: 4, patternY: 2, flags: { stackable: true } };
        const p = (n) => { const x = A.itemPattern(monedas, { count: n }); return x.y * 4 + x.x; };
        check('apilable 4x2: 1,2,3,4,5,10,25,50 dan dibujos 0..7',
            [1, 2, 3, 4, 5, 10, 25, 50].map(p).join() === '0,1,2,3,4,5,6,7', [1, 2, 3, 4, 5, 10, 25, 50].map(p).join());
        const suelo = { patternX: 2, patternY: 2, flags: { ground: { speed: 150 } } };
        const q = A.itemPattern(suelo, { x: 5, y: 2, z: 7 });
        check('un suelo repite su patrón por posición', q.x === 1 && q.y === 0);
        const fuego = { frames: 3, animation: { durations: [[100, 100], [200, 200], [300, 300]] } };
        check('el fotograma sale de las duraciones', A.frameAt(fuego, 50) === 0 && A.frameAt(fuego, 150) === 1 && A.frameAt(fuego, 599) === 2 && A.frameAt(fuego, 600) === 0);
    }

    section('4. Validación de things.json');
    {
        const malo = { format: A.THINGS_FORMAT, version: 1, items: [
            { id: 50, sprites: [0] },
            { id: 100, sprites: [1, 2] },
            { id: 101, flags: { inventada: true }, sprites: [0] },
            { id: 101, sprites: [0] },
            { id: 102, sprites: [9999] }
        ] };
        const { problems } = A.normalizeThings(malo, 10);
        const hay = (t) => problems.some((p) => p.includes(t));
        check('acumula TODOS los problemas', problems.length >= 5, problems.length + ' problemas');
        check('identificador por debajo del primero de la categoría', hay('>= 100'));
        check('número de sprites que no cuadra con las dimensiones', hay('dimensiones piden'));
        check('bandera desconocida', hay('inventada'));
        check('identificador repetido', hay('repetido'));
        check('sprite que no existe', hay('9999'));
        const bueno = A.normalizeThings({ format: A.THINGS_FORMAT, version: 1, items: [{ id: 100, flags: { light: { level: 4 } }, sprites: [0] }] }, 0);
        check('una luz sin color recibe el color por defecto', bueno.data.items[0].flags.light.color === 215);
        const texto = A.serializeThings(bueno.data);
        check('things.json se escribe con una cosa por línea', texto.split('\n').some((l) => l.trim().startsWith('{"id":100')));
        check('y se vuelve a leer igual', JSON.stringify(A.normalizeThings(JSON.parse(texto)).data) === JSON.stringify(bueno.data));
    }

    // -----------------------------------------------------------------------
    section('5. PNG: escribir y leer');
    {
        const datos = Buffer.alloc(40 * 3 * 4);
        for (let i = 0; i < datos.length; i += 1) { datos[i] = (i * 37) & 255; }
        const leido = Png.decode(Png.encode(40, 3, datos));
        check('ida y vuelta RGBA exacta', leido.width === 40 && leido.height === 3 && leido.data.equals(datos));
        const hoja = Png.decode(fs.readFileSync(path.join(ROOT, 'client', 'jetyum', 'assets', 'sprites', 'sprites-0000.png')));
        check('lee una hoja del almacén de sprites (1024x1024)', hoja.width === 1024 && hoja.height === 1024);
    }

    section('6. El almacén de sprites');
    const dirStore = temporal();
    {
        const store = new AssetStore(dirStore);
        const r = store.addSprites([sprite(255, 0, 0, 1), Buffer.alloc(A.SPRITE_BYTES), sprite(0, 255, 0, 2), sprite(255, 0, 0, 1)]);
        check('los transparentes devuelven 0 y no ocupan sitio', r.ids[1] === 0 && store.count === 2, JSON.stringify(r.ids));
        check('un sprite repetido devuelve el número del que ya existe', r.ids[3] === r.ids[0] && r.reused === 1);
        store.flush();
        const revisionAntes = JSON.parse(fs.readFileSync(path.join(dirStore, 'sprites', 'index.json'), 'utf8')).revisions[0];
        const otra = new AssetStore(dirStore);
        check('el índice y la hoja sobreviven a recargar', otra.count === 2 && otra.getSprite(2)[1] === 255);
        otra.setSprite(1, sprite(0, 0, 255, 3));
        otra.clearSprite(2);
        otra.flush();
        const indiceDespues = JSON.parse(fs.readFileSync(path.join(dirStore, 'sprites', 'index.json'), 'utf8'));
        check('la revisión de la hoja cambia con su contenido aunque no cambie el número de sprites (la caché del navegador)',
            indiceDespues.count === 2 && !!revisionAntes && indiceDespues.revisions[0] !== revisionAntes);
        const tercera = new AssetStore(dirStore);
        check('reemplazar y vaciar se guardan, y vaciar no renumera', tercera.count === 2 &&
            tercera.getSprite(1)[2] === 255 && tercera.getSprite(2).every((b) => b === 0));
        let lanzo = false;
        try { tercera.addSprites([Buffer.alloc(10)]); } catch (e) { lanzo = true; }
        check('un sprite que no mide 32x32 se rechaza', lanzo);
        const mal = tercera.writeThings({ format: A.THINGS_FORMAT, version: 1, items: [{ id: 100, sprites: [5] }] });
        check('things.json con un sprite que no existe NO se escribe', !mal.ok && !fs.existsSync(path.join(dirStore, 'things.json')));
        const bien = tercera.writeThings({ format: A.THINGS_FORMAT, version: 1, items: [{ id: 100, sprites: [1] }] });
        check('y uno correcto sí', bien.ok && fs.existsSync(path.join(dirStore, 'things.json')));
        check('usage dice qué cosas usan un sprite', tercera.usage(1).length === 1 && tercera.usage(2).length === 0);
        const vieja = new AssetStore(dirStore);
        check('un almacén recién leído no ve cambios', !vieja.cambiadoFuera());
        const otraMano = new AssetStore(dirStore);
        otraMano.addSprites([sprite(9, 9, 9, 7)]);
        otraMano.flush();
        check('detecta que otro (un git pull, otro proceso) cambió los archivos', vieja.cambiadoFuera());
        check('y lo que él mismo escribe no cuenta como cambio de fuera', !otraMano.cambiadoFuera());
    }

    section('7. Cortar imágenes y la hoja de una cosa (imagenes.js)');
    {
        const w = 70;
        const h = 40;
        const data = new Uint8ClampedArray(w * h * 4);
        data[(5 * w + 40) * 4 + 3] = 255;
        const piezas = trocearImagen(data, w, h);
        check('una imagen de 70x40 son 3x2 piezas', piezas.length === 6);
        check('solo la pieza con un píxel opaco no está vacía', piezas.filter((p) => !p.vacio).length === 1 && !piezas[1].vacio);
        const cosa = { width: 2, height: 1, layers: 1, patternX: 4, patternY: 1, patternZ: 1, frames: 2 };
        const hoja = distribucionDeHoja(cosa);
        check('la hoja de un aspecto 2x1 con 4 direcciones y 2 fotogramas mide 128x128',
            hoja.ancho === 128 && hoja.alto === 128 && hoja.filas === 4 && hoja.columnas === 2);
        const img = new Uint8ClampedArray(128 * 128 * 4);
        img[(32 * 128 + 64 + 32) * 4 + 3] = 255;
        const pz = piezasDeHoja(cosa, img, 128, 128);
        const llena = pz.find((p) => !esVacio(p.rgba));
        check('el ancla de cada celda es la casilla de la DERECHA (w=0)',
            llena && llena.indice === A.spriteIndex(cosa, 0, 0, 0, 1, 0, 0, 1), llena && String(llena.indice));
        // Una hoja con FONDO MAGENTA, como las de Tibia y ObjectBuilder: 64x32, dos casillas, un
        // dibujo morado de 4x4 en la primera con un contorno teñido de magenta y la segunda vacía.
        const hm = new Uint8ClampedArray(64 * 32 * 4);
        for (let i = 0; i < hm.length; i += 4) { hm[i] = 255; hm[i + 1] = 0; hm[i + 2] = 255; hm[i + 3] = 255; }
        const pinta = (x, y, c) => { const o = (y * 64 + x) * 4; hm[o] = c[0]; hm[o + 1] = c[1]; hm[o + 2] = c[2]; hm[o + 3] = 255; };
        for (let y = 10; y < 16; y++) for (let x = 10; x < 16; x++) pinta(x, y, [200, 120, 210]); // contorno teñido
        for (let y = 11; y < 15; y++) for (let x = 11; x < 15; x++) pinta(x, y, [120, 40, 160]);  // morado de verdad
        pinta(12, 12, [220, 60, 215]); // un rosado DENTRO del dibujo
        hm[(5 * 64 + 40) * 4] = 245; hm[(5 * 64 + 40) * 4 + 1] = 20; hm[(5 * 64 + 40) * 4 + 2] = 250; // magenta con pérdida
        quitarFondoMagenta(hm, 64);
        const piezasM = trocearImagen(hm, 64, 32);
        const alfa = (x, y) => hm[(y * 64 + x) * 4 + 3];
        check('el fondo magenta (también el aproximado de un WebP) se vuelve transparente',
            piezasM[1].vacio && alfa(0, 0) === 0 && alfa(40, 5) === 0);
        check('el contorno teñido de magenta se limpia, pero el morado y el rosado del interior se quedan',
            alfa(10, 10) === 0 && alfa(15, 13) === 0 && alfa(11, 11) === 255 && alfa(12, 12) === 255 && !piezasM[0].vacio);
        check('múltiplo de 32: 512x1568 sí, 508x2000 no', esMultiploDe32(512, 1568) && !esMultiploDe32(508, 2000));
        const tandas = enTandas(Array.from({ length: 1008 }, (_, i) => i), 200);
        check('mil sprites se suben en tandas de 200, sin perder ninguno ni cambiar el orden',
            tandas.length === 6 && tandas[5].length === 8 && tandas.flat().every((v, i) => v === i));
        check('base64 de 4096 bytes', Buffer.from(base64DeBytes(new Uint8ClampedArray(4096)), 'base64').length === 4096);
    }

    section('8. Colores de los aspectos (cliente)');
    check('hsl a rgb', hslToRgb('hsl(0, 100%, 50%)').join() === '255,0,0' && hslToRgb('#102030').join() === '16,32,48');
    check('la máscara: amarillo cabeza, rojo cuerpo, verde piernas, azul pies',
        partOfMask(255, 255, 0) === 'head' && partOfMask(255, 0, 0) === 'body' &&
        partOfMask(0, 255, 0) === 'legs' && partOfMask(0, 0, 255) === 'feet' && partOfMask(10, 10, 10) === null);

    // -----------------------------------------------------------------------
    section('9. Los assets del repositorio');
    {
        const store = new AssetStore(path.join(ROOT, 'client', 'jetyum', 'assets'));
        const { data, problems } = A.normalizeThings(store.readThings(), store.count);
        check('things.json del repositorio es válido', problems.length === 0, problems.slice(0, 2).join('; '));
        const coh = A.checkCoherence(data, listaItems);
        check('ningún objeto de items.xml se queda sin cosa', coh.faltan.length === 0, coh.faltan.slice(0, 5).join());
        check('las banderas de cliente y servidor coinciden', coh.banderas.length === 0, coh.banderas.slice(0, 2).join('; '));
        const looks = new Set(data.outfits.map((o) => o.id));
        const npcs = fs.readFileSync(path.join(ROOT, 'data', 'npc', 'npcs.xml'), 'utf8').match(/<look type="(\d+)"/g)
            .map((m) => Number(m.match(/\d+/)[0]));
        check('todos los NPC tienen su aspecto dibujado', npcs.every((n) => looks.has(n)), npcs.join());
        const jugadores = require('../data/XML/outfits.js').map((o) => o.id);
        check('y todos los aspectos de outfits.js', jugadores.every((n) => looks.has(n)), jugadores.join());
        const hojas = fs.readdirSync(path.join(ROOT, 'client', 'jetyum', 'assets', 'sprites')).filter((f) => f.endsWith('.png'));
        check('hay una hoja por cada 1024 sprites', hojas.length === Math.ceil(store.count / A.SPRITES_PER_SHEET), hojas.join());
    }

    // -----------------------------------------------------------------------
    section('10. Compuestos: formato, parámetros y expansión');
    {
        const t = C.normalizarPlantilla({
            id: 'prueba', nombre: 'Prueba',
            celdas: [{ dx: 0, dy: 0, suelo: 104, items: [{ id: 1387 }] }, { dx: -1, dy: 0, items: [{ id: 3031 }] }],
            parametros: [
                { clave: 'destino', tipo: 'posicion', destinos: [{ celda: 0, item: 0, atributo: 'teleportDestination' }] },
                { clave: 'monedas', tipo: 'cantidad', defecto: 5, destinos: [{ celda: 1, item: 0 }] },
                { clave: 'moneda', tipo: 'objeto', opciones: [3031, 2160], destinos: [{ celda: 1, item: 0 }] }
            ]
        }, [], items);
        const k = C.expandir(t, { destino: '10, 11, 7', moneda: 2160 }, 20, 30, 7);
        check('expandir pone cada celda relativa al ancla', k[0].x === 20 && k[1].x === 19 && k[1].y === 30);
        check('un parámetro posición va al atributo', k[0].items[0].attributes &&
            k[0].items[0].attributes.teleportDestination.x === 10, JSON.stringify(k[0].items[0]));
        check('cantidad usa su valor por defecto y objeto cambia el id', k[1].items[0].count === 5 && k[1].items[0].id === 2160);
        check('el suelo de la celda viaja', k[0].suelo === 104);
        const sin = C.expandir(t, {}, 0, 0, 7);
        check('sin valor no se escribe el atributo', !sin[0].items[0].attributes);
        const v = C.validarValores(t, { moneda: 1, destino: 'basura' });
        check('validarValores rechaza opciones y posiciones malas', v.problemas.length === 2, v.problemas.join('; '));
        const problemas = [];
        C.normalizarPlantilla({ id: 'MAL id', celdas: [{ dx: 0, dy: 0, items: [{ id: 999999 }] }, { dx: 0, dy: 0, items: [] }],
            parametros: [{ clave: 'x', tipo: 'numero', destinos: [{ celda: 5, item: 0 }] }] }, problemas, items);
        check('las plantillas malas acumulan todos sus problemas', problemas.length >= 4, problemas.join(' | '));
        const cap = C.desdeCasillas([{ x: 5, y: 5, z: 7, ground: null, items: [{ id: 111 }] },
            { x: 6, y: 6, z: 7, ground: 104, items: [] }], { nombre: 'Rincón' });
        check('capturar pone el ancla abajo a la derecha', cap.id === 'rincon' &&
            cap.celdas.some((c) => c.dx === -1 && c.dy === -1) && cap.celdas.some((c) => c.dx === 0 && c.dy === 0 && c.suelo === 104));
        const archivo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'editor', 'compuestos.json'), 'utf8'));
        const n = C.normalizarCompuestos(archivo, items);
        check('data/editor/compuestos.json es válido contra items.xml', n.problemas.length === 0, n.problemas.slice(0, 3).join('; '));
        check('y se reescribe igual', C.serializar(n.data) === fs.readFileSync(path.join(ROOT, 'data', 'editor', 'compuestos.json'), 'utf8'));
    }

    section('11. Compuestos en el editor: colocar, mover, reconfigurar, borrar');
    {
        const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'world', 'sample.map.json'), 'utf8'));
        const plantillas = C.normalizarCompuestos(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'editor', 'compuestos.json'), 'utf8'))).data.compuestos;
        const mapa = new EditorMap(raw, items);
        mapa.setPlantillas(plantillas);
        mapa.paintItem(40, 40, 7, 113);
        const r = mapa.colocarCompuesto('teleport', { destino: { x: 1, y: 2, z: 7 } }, 40, 40, 7);
        const tile = mapa.tileAt(40, 40, 7);
        check('colocar APILA encima de lo que hay', r.ok && tile.items.length === 2 && tile.items[0].id === 113 &&
            tile.items[1].attributes.teleportDestination.y === 2, JSON.stringify(tile.items));
        check('y queda apuntado como objeto entero', mapa.compuestoEn(40, 40, 7).uid === r.instancia.uid);
        const casa = mapa.colocarCompuesto('habitacion-de-piedra', { accionPalanca: 777 }, 60, 20, 7);
        check('un compuesto de 5x5 ocupa 25 casillas', casa.ok && casa.casillas === 25);
        check('fuera del mapa no se coloca', !mapa.colocarCompuesto('habitacion-de-piedra', {}, 1, 1, 7).ok);
        const palanca = mapa.tileAt(57, 17, 7).items.find((i) => i.id === 1948);
        check('el parámetro llega a su pieza', palanca && palanca.attributes.actionId === 777);
        mapa.reconfigurarCompuesto(casa.instancia.uid, { accionPalanca: 900 });
        const palanca2 = mapa.tileAt(57, 17, 7).items.filter((i) => i.id === 1948);
        check('reconfigurar no duplica piezas', palanca2.length === 1 && palanca2[0].attributes.actionId === 900);
        mapa.moverCompuesto(casa.instancia.uid, 60, 62, 7);
        check('mover deja vacío el sitio viejo y lleno el nuevo', !mapa.tileAt(60, 20, 7) && mapa.tileAt(60, 62, 7).ground === 104);
        mapa.quitarCompuesto(r.instancia.uid);
        check('borrar entero deja lo que había antes', mapa.tileAt(40, 40, 7).items.length === 1 &&
            mapa.tileAt(40, 40, 7).items[0].id === 113);
        const p = mapa.pendiente();
        check('el guardado manda la lista de compuestos', p.composites && p.composites.length === 1 &&
            p.composites[0].valores.accionPalanca === 900);
        mapa.descomponerCompuesto(casa.instancia.uid);
        check('descomponer olvida el objeto y deja sus piezas', mapa.compuestos.length === 0 && mapa.tileAt(60, 62, 7).items.length > 0);

        mapa.seleccionarObjeto(40, 40, 7);
        const cambio = mapa.cambiarPropiedades({ count: 1, attributes: { actionId: 1234, text: 'hola', uniqueId: '' } });
        const mesa = mapa.tileAt(40, 40, 7).items[0];
        check('propiedades: actionId y texto se ponen, lo vacío se quita',
            cambio.ok && mesa.attributes.actionId === 1234 && mesa.attributes.text === 'hola' && !('uniqueId' in mesa.attributes));
    }

    // -----------------------------------------------------------------------
    section('12. El servidor de herramientas: API de assets, compuestos y mapa');
    const dirSrv = temporal();
    {
        fs.mkdirSync(path.join(dirSrv, 'world'));
        fs.copyFileSync(path.join(ROOT, 'data', 'world', 'sample.map.json'), path.join(dirSrv, 'world', 'prueba.map.json'));
        fs.copyFileSync(path.join(ROOT, 'data', 'editor', 'compuestos.json'), path.join(dirSrv, 'compuestos.json'));
        fs.cpSync(path.join(ROOT, 'client', 'jetyum', 'assets'), path.join(dirSrv, 'assets'), { recursive: true });
        const srv = Tools.createToolsServer({
            port: 0, logger: { info() {}, warning() {}, error() {} },
            mapsDir: path.join(dirSrv, 'world'),
            assetsDir: path.join(dirSrv, 'assets'),
            compuestosFile: path.join(dirSrv, 'compuestos.json')
        });
        const port = await srv.ready;
        try {
            const a = await api(port, 'GET', '/api/assets');
            check('GET /api/assets da cosas e índice', a.status === 200 && a.body.things.items.length > 0 && a.body.index.count > 0);
            const antes = a.body.index.count;
            const enorme = await api(port, 'POST', '/api/sprites', { sprites: Array(1000).fill(sprite(9, 9, 9, 9).toString('base64')) });
            check('una petición de más de 4 MB recibe un error que se puede leer, no un corte de conexión',
                enorme.status >= 400 && /MB/.test(enorme.body.error || ''), enorme.status + ' ' + (enorme.body.error || ''));
            const s = await api(port, 'POST', '/api/sprites', { sprites: [sprite(1, 2, 3, 9).toString('base64')] });
            check('POST /api/sprites añade al final', s.status === 200 && s.body.ids[0] === antes + 1 && s.body.index.count === antes + 1);
            const sitio = A.sheetOf(antes + 1);
            const png = await fetch('http://127.0.0.1:' + port + '/jetyum/assets/sprites/sprites-' +
                String(sitio.sheet).padStart(4, '0') + '.png');
            const leida = Png.decode(Buffer.from(await png.arrayBuffer()));
            check('la hoja que sirve el editor es la COPIA y ya lleva el sprite nuevo',
                leida.data[(sitio.y * 1024 + sitio.x) * 4 + 1] === 2);
            const things = a.body.things;
            things.items[0].sprites = [antes + 1];
            const g = await api(port, 'POST', '/api/assets/things', { things });
            check('POST /api/assets/things guarda', g.status === 200 && g.body.ok);
            things.items[0].sprites = [antes + 99];
            const m = await api(port, 'POST', '/api/assets/things', { things });
            check('y rechaza un sprite inexistente con 422', m.status === 422);
            const coh = await api(port, 'GET', '/api/assets/check');
            check('GET /api/assets/check informa', coh.status === 200 && Array.isArray(coh.body.banderas));
            const comp = await api(port, 'GET', '/api/compuestos');
            check('GET /api/compuestos', comp.status === 200 && comp.body.data.compuestos.length >= 5);
            const malos = JSON.parse(JSON.stringify(comp.body.data));
            malos.compuestos[0].celdas[0].items[0].id = 999999;
            check('POST /api/compuestos rechaza un objeto inexistente', (await api(port, 'POST', '/api/compuestos', { data: malos })).status === 422);

            // Un compuesto colocado viaja como casillas normales + la lista composites.
            const raw = (await api(port, 'GET', '/api/map?name=prueba')).body.raw;
            const editor = new EditorMap(raw, items);
            editor.setPlantillas(comp.body.data.compuestos);
            editor.colocarCompuesto('teleport', { destino: { x: 40, y: 40, z: 7 } }, 25, 25, 7);
            const pend = editor.pendiente();
            const guardado = await api(port, 'POST', '/api/map', { name: 'prueba', edits: pend.edits, composites: pend.composites });
            check('POST /api/map guarda casillas y compuestos', guardado.status === 200, JSON.stringify(guardado.body).slice(0, 200));
            const texto = JSON.parse(fs.readFileSync(path.join(dirSrv, 'world', 'prueba.map.json'), 'utf8'));
            check('el archivo lleva la lista composites', texto.composites && texto.composites[0].compuesto === 'teleport');
            const cargado = MapLoader.buildMap(texto, { itemTypes: items });
            const tp = cargado.map.getTile(25, 25, 7).getItems().find((i) => i.typeId === 1387);
            check('y el MOTOR lee el teleport con su destino y conserva los compuestos',
                cargado.report.ok && tp && tp.attributes.teleportDestination.x === 40 && cargado.map.composites.length === 1);
            const desconocido = await api(port, 'POST', '/api/map', { name: 'prueba', edits: [], composites: [{ uid: 1, compuesto: 'no-existe', x: 1, y: 1, z: 7 }] });
            check('un compuesto con plantilla desconocida se rechaza', desconocido.status === 422);
        } finally {
            await srv.close();
        }
    }

    // -----------------------------------------------------------------------
    section('13. El motor: uniqueId -> actionId -> itemId, y el teleport con destino');
    {
        const engine = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { useDatabase: false, mapName: 'sample', mapFile: null } });
        const world = engine.world;
        const player = world.createPlayer('Probador', { x: 40, y: 40, z: 7 });
        const llamadas = [];
        engine.registry.register({ type: 'action', aids: [4242], onUse() { llamadas.push('aid'); return true; } }, 'prueba-aid');
        engine.registry.register({ type: 'action', uids: [7777], onUse() { llamadas.push('uid'); return true; } }, 'prueba-uid');
        const palanca = world.createItem(1948, 1, { x: 41, y: 40, z: 7 });
        palanca.setAttribute('actionId', 4242);
        engine.dispatchAction(1948, { playerId: player.id, itemUid: palanca.instanceId });
        palanca.setAttribute('uniqueId', 7777);
        engine.dispatchAction(1948, { playerId: player.id, itemUid: palanca.instanceId });
        check('una acción por actionId gana a la del tipo, y una por uniqueId gana a las dos',
            llamadas.join() === 'aid,uid', llamadas.join());

        const portal = world.createItem(1387, 1, { x: 42, y: 40, z: 7 });
        portal.setAttribute('teleportDestination', { x: 45, y: 44, z: 7 });
        engine.dispatchMovement('stepin', 1387, { creatureId: player.id, itemUid: portal.instanceId, x: 42, y: 40, z: 7 });
        check('el teleport lleva a su destino', player.position.x === 45 && player.position.y === 44, String(player.position));

        const suelto = new Item(items.get(1387), { attributes: { actionId: 1 } });
        const uid = world.adoptItem(suelto);
        check('un objeto del mapa con atributos recibe identidad al hacer falta', uid > 0 && world.getItem(uid) === suelto);
        engine.reloadContent();
        check('recargar vacía también los registros por aid/uid', engine.registry.actionsByAid.size === 0 && engine.registry.actionsByUid.size === 0);
        if (engine.stop) { engine.stop(); }
    }

    [dirStore, dirSrv].forEach((d) => fs.rmSync(d, { recursive: true, force: true }));

    console.log('\n' + (fallos === 0
        ? '\x1b[32mTodo OK\x1b[0m — ' + total + ' comprobaciones: sprites, cosas, compuestos y motor en orden.'
        : '\x1b[31m' + fallos + ' de ' + total + ' comprobaciones fallaron\x1b[0m'));
    process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
