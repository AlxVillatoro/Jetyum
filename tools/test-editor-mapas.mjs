/**
 * PRUEBA DE LOS ARCHIVOS DE MAPA DEL EDITOR: nuevo mapa, guardar como, propiedades (con el
 * rechazo a encoger cuando algo quedaría fuera) y las copias de seguridad (se hacen al guardar,
 * se podan a las últimas N y se restauran).
 *
 *     node tools/test-editor-mapas.mjs
 *
 * TODO SE HACE SOBRE COPIAS, como en `test-tools.js`: el servidor de herramientas arranca contra
 * una carpeta temporal con su propio mapa y su propio `items.xml`, y nada de lo que se prueba toca
 * `data/world/` de verdad.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Xml = require('../engine/data/xml.js');
const MapLoader = require('../engine/world/loader.js');
const Tools = require('../editor/server.js');
const MapFiles = require('../editor/lib/mapfiles.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;
let total = 0;

function check(label, condition, detail) {
    total += 1;
    if (!condition) {
        fallos += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}

function section(t) {
    console.log('\n' + t);
}

/** Una carpeta desechable con una copia del mapa de ejemplo y de items.xml. */
function espacioDeTrabajo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-mapas-'));
    fs.mkdirSync(path.join(dir, 'world'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'items'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'data', 'world', 'sample.map.json'), path.join(dir, 'world', 'prueba.map.json'));
    fs.copyFileSync(path.join(ROOT, 'data', 'items', 'items.xml'), path.join(dir, 'items', 'items.xml'));
    return {
        dir: dir,
        mapsDir: path.join(dir, 'world'),
        itemsFile: path.join(dir, 'items', 'items.xml'),
        archivo: (nombre) => path.join(dir, 'world', nombre + '.map.json'),
        copias: (nombre) => path.join(dir, 'world', 'backups', nombre),
        quitar() {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    };
}

let puerto = 0;

async function api(method, route, body) {
    const response = await fetch('http://127.0.0.1:' + puerto + route, {
        method: method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let payload;
    try {
        payload = JSON.parse(text);
    } catch (error) {
        payload = { raw: text };
    }
    return { status: response.status, body: payload };
}

const leer = (archivo) => fs.readFileSync(archivo, 'utf8');
const resumen = (r) => r.status + ' ' + (r.body.error || '') + (r.body.problems ? ' | ' + r.body.problems.slice(0, 2).join(' | ') : '');

async function main() {
    console.log('Prueba de los archivos de mapa del editor (' + ROOT + ')');

    const ws = espacioDeTrabajo();
    const tools = Tools.createToolsServer({
        port: 0,
        mapsDir: ws.mapsDir,
        itemsFile: ws.itemsFile,
        logger: { info() {}, warning() {}, error() {} }
    });
    puerto = await tools.ready;

    const itemTypes = Xml.loadItems(ws.itemsFile);
    const monsterTypes = Tools.loadMonsterTypes();
    const npcTypes = Tools.loadNpcTypes();
    const cargarConElMotor = (nombre) => MapLoader.loadMap(ws.archivo(nombre), { itemTypes, monsterTypes, npcTypes });

    try {
        // ===================================================================
        section('1. Nuevo mapa');
        // ===================================================================
        {
            const r = await api('POST', '/api/maps', { nombre: 'nuevo', ancho: 64, alto: 48, sueloPorDefecto: 102,
                descripcion: 'Un prado para probar', ciudad: 'Pradera' });
            check('se crea un mapa nuevo (201)', r.status === 201 && r.body.nombre === 'nuevo', resumen(r));
            check('el archivo existe', fs.existsSync(ws.archivo('nuevo')));

            const raw = JSON.parse(leer(ws.archivo('nuevo')));
            check('tiene el tamaño, 16 plantas y el suelo de la superficie',
                raw.width === 64 && raw.height === 48 && raw.floors === 16 && raw.defaultGround['7'] === 102,
                raw.width + 'x' + raw.height + 'x' + raw.floors);
            check('la descripcion va en _descripcion', raw._descripcion === 'Un prado para probar');

            const cargado = cargarConElMotor('nuevo');
            check('EL CARGADOR DEL MOTOR lo acepta sin errores', cargado.report.ok,
                cargado.report.errors.map((e) => e.message).join(' | '));
            const templo = cargado.map.getWaypoint('temple');
            check('el waypoint temple esta en el centro de la superficie y se puede pisar',
                templo && templo.x === 32 && templo.y === 24 && templo.z === 7 &&
                cargado.map.isWalkable(templo.x, templo.y, templo.z));
            const ciudad = cargado.map.towns[0];
            check('hay una ciudad con su templo en el mismo sitio',
                cargado.map.towns.length === 1 && ciudad.name === 'Pradera' &&
                ciudad.temple.x === 32 && ciudad.temple.y === 24 && ciudad.temple.z === 7);

            const lista = await api('GET', '/api/maps');
            check('aparece en la lista de mapas', lista.body.maps.some((m) => m.name === 'nuevo'));
            const abierto = await api('GET', '/api/map?name=nuevo');
            check('el editor lo puede abrir', abierto.status === 200);

            const props = await api('GET', '/api/maps/nuevo/propiedades');
            check('sus propiedades', props.status === 200 && props.body.propiedades.ancho === 64 &&
                props.body.propiedades.descripcion === 'Un prado para probar' &&
                props.body.propiedades.suelos['7'] === 102 && props.body.propiedades.sueloDeRespaldo === null,
                JSON.stringify(props.body.propiedades && props.body.propiedades.suelos));

            const ensayo = await api('POST', '/api/maps', { nombre: 'ensayo', ancho: 32, alto: 32, sueloPorDefecto: 102, dryRun: true });
            check('dryRun valida y no crea nada', ensayo.status === 201 && ensayo.body.dryRun === true &&
                !fs.existsSync(ws.archivo('ensayo')));

            const minimo = await api('POST', '/api/maps', { nombre: 'pequeno', ancho: 16, alto: 16, plantas: 8,
                sueloPorDefecto: 104, sueloDeRespaldo: 102 });
            check('el tamaño minimo (16x16x8) con suelo de respaldo', minimo.status === 201 && cargarConElMotor('pequeno').report.ok,
                resumen(minimo));

            // 4096 de ancho y 16 de alto: el limite se prueba igual, y un 4096x4096 tarda unos segundos
            // en cada carga (el cargador recorre la planta 0 entera buscando una casilla transitable).
            const t0 = Date.now();
            const maximo = await api('POST', '/api/maps', { nombre: 'enorme', ancho: 4096, alto: 16,
                sueloPorDefecto: 102, dryRun: true });
            check('el tamaño maximo (4096) se acepta', maximo.status === 201, resumen(maximo) + ' ' + (Date.now() - t0) + ' ms');
        }

        section('1b. Nuevo mapa: lo que se rechaza');
        {
            const antes = leer(ws.archivo('prueba'));
            const base = { ancho: 32, alto: 32, sueloPorDefecto: 102 };
            const malos = [['', 'vacio'], ['../fuera', 'con barras'], ['a b', 'con espacio'], ['mapa.json', 'con punto'],
                ['con', 'reservado de Windows'], ['LPT1', 'reservado de Windows'], ['x'.repeat(65), 'de 65 letras'],
                ['ñandú', 'con acentos']];
            for (const [nombre, por] of malos) {
                const r = await api('POST', '/api/maps', Object.assign({ nombre }, base));
                check('nombre ' + por + ' -> 400', r.status === 400, resumen(r));
            }

            const existe = await api('POST', '/api/maps', Object.assign({ nombre: 'prueba' }, base));
            check('un nombre que ya existe -> 409 y no se toca', existe.status === 409 && leer(ws.archivo('prueba')) === antes, resumen(existe));
            const mayus = await api('POST', '/api/maps', Object.assign({ nombre: 'PRUEBA' }, base));
            check('...tampoco cambiando mayusculas (Windows no las distingue)', mayus.status === 409, resumen(mayus));

            for (const [ancho, alto, plantas, por] of [[15, 32, 16, 'ancho 15'], [32, 4097, 16, 'alto 4097'],
                ['abc', 32, 16, 'ancho no numerico'], [32.5, 32, 16, 'ancho con decimales'], [32, 32, 7, '7 plantas (sin superficie)'],
                [32, 32, 17, '17 plantas']]) {
                const r = await api('POST', '/api/maps', { nombre: 'malo', ancho, alto, plantas, sueloPorDefecto: 102 });
                check(por + ' -> 400', r.status === 400 && !fs.existsSync(ws.archivo('malo')), resumen(r));
            }

            const sinSuelo = await api('POST', '/api/maps', { nombre: 'malo', ancho: 32, alto: 32, sueloPorDefecto: 99999 });
            check('un suelo que no existe en items.xml -> 422', sinSuelo.status === 422 && !fs.existsSync(ws.archivo('malo')), resumen(sinSuelo));
            const muro = await api('POST', '/api/maps', { nombre: 'malo', ancho: 32, alto: 32, sueloPorDefecto: 111 });
            check('un objeto que no es suelo (un muro) -> 422', muro.status === 422, resumen(muro));
            const bloqueante = [...itemTypes.values()].find((d) => d.attributes && d.attributes.isGround && d.attributes.blocksSolid);
            if (bloqueante) {
                const r = await api('POST', '/api/maps', { nombre: 'malo', ancho: 32, alto: 32, sueloPorDefecto: bloqueante.id });
                check('un suelo que no se puede pisar (el templo va encima) -> 422', r.status === 422, resumen(r));
            }
            const respaldoMalo = await api('POST', '/api/maps', { nombre: 'malo', ancho: 32, alto: 32, sueloPorDefecto: 102, sueloDeRespaldo: 111 });
            check('un suelo de respaldo que no es suelo -> 422', respaldoMalo.status === 422, resumen(respaldoMalo));
        }

        // ===================================================================
        section('2. Guardar como');
        // ===================================================================
        {
            const original = leer(ws.archivo('prueba'));
            const r = await api('POST', '/api/maps/prueba/copia', { nuevoNombre: 'copia' });
            check('se copia el mapa guardado (201)', r.status === 201 && r.body.nombre === 'copia', resumen(r));
            const raw = JSON.parse(leer(ws.archivo('copia')));
            check('la copia lleva su nombre nuevo dentro', raw.name === 'copia');
            check('la copia conserva lo del original (respawns, npc, waypoints, _comment)',
                raw.spawns.length === 1 && raw.npcs.length === 2 && raw.waypoints.temple && Array.isArray(raw._comment));
            check('la copia carga con el motor', cargarConElMotor('copia').report.ok);
            check('el original no se toca', leer(ws.archivo('prueba')) === original);

            const conCambios = await api('POST', '/api/maps/prueba/copia', { nuevoNombre: 'variante',
                edits: [{ x: 5, y: 5, z: 7, ground: 104 }] });
            const variante = JSON.parse(leer(ws.archivo('variante')));
            check('con cambios sin guardar: van a la copia', conCambios.status === 201 &&
                variante.tiles.some((t) => t.x === 5 && t.y === 5 && t.z === 7 && t.ground === 104), resumen(conCambios));
            check('...y el original sigue sin ellos', leer(ws.archivo('prueba')) === original &&
                !JSON.parse(original).tiles.some((t) => t.x === 5 && t.y === 5));
            check('...y guardar como no deja copia de seguridad del original', !fs.existsSync(ws.copias('prueba')));

            const cambiosMalos = await api('POST', '/api/maps/prueba/copia', { nuevoNombre: 'rota',
                edits: [{ x: 5, y: 5, z: 7, ground: 99999 }] });
            check('cambios que no valen -> 422 y no se crea nada', cambiosMalos.status === 422 && !fs.existsSync(ws.archivo('rota')),
                resumen(cambiosMalos));

            const nuevoAntes = leer(ws.archivo('nuevo'));
            const pisar = await api('POST', '/api/maps/prueba/copia', { nuevoNombre: 'nuevo' });
            check('NUNCA pisa un mapa que existe -> 409', pisar.status === 409 && leer(ws.archivo('nuevo')) === nuevoAntes, resumen(pisar));
            const sinOrigen = await api('POST', '/api/maps/nohay/copia', { nuevoNombre: 'otro' });
            check('copiar un mapa que no existe -> 404', sinOrigen.status === 404, resumen(sinOrigen));
            const nombreMalo = await api('POST', '/api/maps/prueba/copia', { nuevoNombre: 'a/b' });
            check('un nombre nuevo que no vale -> 400', nombreMalo.status === 400, resumen(nombreMalo));
        }

        // ===================================================================
        section('3. Propiedades');
        // ===================================================================
        {
            const props = await api('GET', '/api/maps/prueba/propiedades');
            const p = props.body.propiedades;
            check('se leen las propiedades', props.status === 200 && p.ancho === 64 && p.alto === 64 && p.plantas === 16 &&
                p.suelos['7'] === 102 && p.suelos['8'] === 104 && p.sueloDeRespaldo === 102 && p.limites.tamanoMaximo === 4096,
                JSON.stringify(p));

            const antes = leer(ws.archivo('prueba'));
            const encoger = await api('PUT', '/api/maps/prueba/propiedades', { ancho: 16, alto: 16 });
            check('ENCOGER CON COSAS FUERA SE RECHAZA (422)', encoger.status === 422, resumen(encoger));
            check('...diciendo que quedaria fuera', encoger.body.fuera && encoger.body.fuera.casillas > 0 &&
                encoger.body.fuera.waypoints === 1 && encoger.body.fuera.respawns === 1 && encoger.body.fuera.npcs === 2,
                JSON.stringify(encoger.body.fuera));
            check('...con ejemplos en problems', encoger.body.problems.some((t) => /casilla \(20,20,7\) quedaria fuera/.test(t)));
            check('...y el archivo NO se toca', leer(ws.archivo('prueba')) === antes);
            check('...ni deja copia de seguridad', !fs.existsSync(ws.copias('prueba')));

            const plantas = await api('PUT', '/api/maps/prueba/propiedades', { plantas: 8 });
            check('quitar plantas con cosas debajo tambien se rechaza', plantas.status === 422 &&
                plantas.body.fuera.casillas === 2 && plantas.body.fuera.waypoints === 1 && plantas.body.fuera.suelos === 1,
                JSON.stringify(plantas.body.fuera));

            const chico = await api('PUT', '/api/maps/prueba/propiedades', { ancho: 12 });
            check('un ancho por debajo del minimo -> 400', chico.status === 400, resumen(chico));
            const suelo = await api('PUT', '/api/maps/prueba/propiedades', { suelos: { 7: 99999 } });
            check('un suelo que no existe -> 422', suelo.status === 422 && leer(ws.archivo('prueba')) === antes, resumen(suelo));
            const nada = await api('PUT', '/api/maps/prueba/propiedades', { ancho: 64 });
            check('sin cambios: 200, no se escribe ni se copia', nada.status === 200 && nada.body.cambios.length === 0 &&
                leer(ws.archivo('prueba')) === antes && !fs.existsSync(ws.copias('prueba')));

            const crecer = await api('PUT', '/api/maps/prueba/propiedades', { ancho: 100, alto: 80, descripcion: 'Ejemplo ampliado' });
            const raw = JSON.parse(leer(ws.archivo('prueba')));
            check('crecer y describir', crecer.status === 200 && raw.width === 100 && raw.height === 80 &&
                raw._descripcion === 'Ejemplo ampliado' && Array.isArray(raw._comment), resumen(crecer));
            check('...el mapa sigue cargando con el motor y con todo dentro', cargarConElMotor('prueba').report.ok &&
                raw.spawns.length === 1 && raw.npcs.length === 2);
            check('...y se hizo copia de seguridad de lo de antes', crecer.body.copia &&
                leer(path.join(ws.copias('prueba'), crecer.body.copia)) === antes, crecer.body.copia);

            // El muro de (10,10,7) no escribe suelo: usa el de la planta (102). Al cambiar el
            // suelo por defecto a 104, el muro tiene que seguir sobre hierba.
            const fondo = await api('PUT', '/api/maps/prueba/propiedades', { suelos: { 7: 104 } });
            const conFondo = cargarConElMotor('prueba');
            check('cambiar el suelo por defecto', fondo.status === 200 && conFondo.report.ok &&
                conFondo.map.getGround(50, 50, 7).typeId === 104, resumen(fondo));
            check('...no cambia el suelo de las casillas escritas', conFondo.map.getGround(10, 10, 7).typeId === 102 &&
                conFondo.map.getTile(10, 10, 7).downItems.length + conFondo.map.getTile(10, 10, 7).topItems.length === 1);

            const quitar = await api('PUT', '/api/maps/prueba/propiedades', { suelos: { 8: null }, sueloDeRespaldo: null });
            const sinSuelos = JSON.parse(leer(ws.archivo('prueba')));
            check('quitar el suelo de una planta y el de respaldo', quitar.status === 200 &&
                sinSuelos.defaultGround['8'] === undefined && sinSuelos.fallbackGround === undefined &&
                cargarConElMotor('prueba').report.ok, resumen(quitar));

            // Renombrar: el archivo cambia de nombre y sus copias se mudan con él.
            const copiasAntes = MapFiles.listarCopias(ws.mapsDir, 'prueba').length;
            const renombrar = await api('PUT', '/api/maps/prueba/propiedades', { nombre: 'ejemplo' });
            check('renombrar', renombrar.status === 200 && renombrar.body.nombre === 'ejemplo' &&
                !fs.existsSync(ws.archivo('prueba')) && JSON.parse(leer(ws.archivo('ejemplo'))).name === 'ejemplo', resumen(renombrar));
            const copiasDespues = await api('GET', '/api/maps/ejemplo/copias');
            check('...las copias se mudan (y la del ultimo estado con el nombre viejo tambien)',
                copiasDespues.body.copias.length === copiasAntes + 1 && !fs.existsSync(ws.copias('prueba')),
                copiasAntes + ' -> ' + copiasDespues.body.copias.length);
            const pisar = await api('PUT', '/api/maps/ejemplo/propiedades', { nombre: 'nuevo' });
            check('renombrar encima de otro mapa -> 409', pisar.status === 409 && fs.existsSync(ws.archivo('ejemplo')), resumen(pisar));
            const noHay = await api('GET', '/api/maps/prueba/propiedades');
            check('las propiedades de un mapa que no existe -> 404', noHay.status === 404);
        }

        // ===================================================================
        section('4. Copias de seguridad');
        // ===================================================================
        {
            const lista = await api('GET', '/api/maps');
            check('la lista de mapas no incluye las copias', lista.body.maps.every((m) => !/backups|\d{8}T/.test(m.name)) &&
                fs.existsSync(path.join(ws.mapsDir, 'backups')), lista.body.maps.map((m) => m.name).join(', '));
            const estado = await api('GET', '/api/status');
            check('...ni el recuento del estado', estado.body.maps === lista.body.maps.length, String(estado.body.maps));

            const antes = leer(ws.archivo('nuevo'));
            const ensayo = await api('POST', '/api/map', { name: 'nuevo', edits: [{ x: 1, y: 1, z: 7, items: [111] }], dryRun: true });
            check('un guardado en seco no deja copia', ensayo.status === 200 && !fs.existsSync(ws.copias('nuevo')));

            const guardado = await api('POST', '/api/map', { name: 'nuevo', edits: [{ x: 1, y: 1, z: 7, items: [111] }] });
            const copias = copiasEnDisco('nuevo');
            check('guardar hace copia del archivo de antes', guardado.status === 200 && guardado.body.copia &&
                copias.length === 1 && leer(path.join(ws.copias('nuevo'), copias[0].archivo)) === antes, guardado.body.copia);
            check('...con la forma <nombre>-<sello>.map.json', /^nuevo-\d{8}T\d{9}Z\.map\.json$/.test(copias[0].archivo));

            const repetido = await api('POST', '/api/map', { name: 'nuevo', edits: [{ x: 1, y: 1, z: 7, items: [111] }] });
            check('guardar sin cambiar nada no gasta una copia', repetido.status === 200 && repetido.body.copia === null &&
                copiasEnDisco('nuevo').length === 1);

            const rechazado = await api('POST', '/api/map', { name: 'nuevo', edits: [{ x: 1, y: 1, z: 7, items: [99999] }] });
            check('un guardado rechazado no deja copia', rechazado.status === 422 && copiasEnDisco('nuevo').length === 1);

            // Muchos guardados distintos: se quedan las ultimas N.
            const textos = [];
            for (let i = 0; i < MapFiles.COPIAS_POR_MAPA + 3; i += 1) {
                textos.push(leer(ws.archivo('nuevo')));
                const r = await api('POST', '/api/map', { name: 'nuevo', edits: [{ x: 2 + i, y: 2, z: 7, items: [111] }] });
                if (r.status !== 200) {
                    check('guardado ' + i, false, resumen(r));
                }
            }
            const podadas = (await api('GET', '/api/maps/nuevo/copias')).body;
            check('se guardan como mucho ' + MapFiles.COPIAS_POR_MAPA + ' copias', podadas.copias.length === MapFiles.COPIAS_POR_MAPA &&
                podadas.maximo === MapFiles.COPIAS_POR_MAPA, String(podadas.copias.length));
            check('...de la mas nueva a la mas vieja', podadas.copias.every((c, i, todas) => i === 0 || todas[i - 1].archivo > c.archivo) &&
                podadas.copias.every((c) => typeof c.fecha === 'string' && c.bytes > 0));
            check('...y son las ultimas: la mas nueva es el estado anterior al ultimo guardado',
                leer(path.join(ws.copias('nuevo'), podadas.copias[0].archivo)) === textos[textos.length - 1] &&
                leer(path.join(ws.copias('nuevo'), podadas.copias[podadas.copias.length - 1].archivo)) ===
                    textos[textos.length - MapFiles.COPIAS_POR_MAPA]);

            // Restaurar.
            const elegida = podadas.copias[4];
            const contenidoElegido = leer(path.join(ws.copias('nuevo'), elegida.archivo));
            const actual = leer(ws.archivo('nuevo'));
            const restaurar = await api('POST', '/api/maps/nuevo/copias/' + encodeURIComponent(elegida.archivo) + '/restaurar', {});
            check('restaurar una copia', restaurar.status === 200 && leer(ws.archivo('nuevo')) === contenidoElegido, resumen(restaurar));
            check('...haciendo antes copia del estado actual', restaurar.body.copia &&
                leer(path.join(ws.copias('nuevo'), restaurar.body.copia)) === actual &&
                copiasEnDisco('nuevo').length === MapFiles.COPIAS_POR_MAPA, restaurar.body.copia);
            check('...y el mapa restaurado carga con el motor', cargarConElMotor('nuevo').report.ok);

            const ajeno = await api('POST', '/api/maps/nuevo/copias/items.xml/restaurar', {});
            check('restaurar algo que no es una copia -> 400', ajeno.status === 400, resumen(ajeno));
            const deOtro = await api('POST', '/api/maps/nuevo/copias/' + encodeURIComponent(copiasEnDisco('ejemplo')[0].archivo) + '/restaurar', {});
            check('...ni una copia de otro mapa -> 400', deOtro.status === 400, resumen(deOtro));
            const traversal = await api('POST', '/api/maps/nuevo/copias/' + encodeURIComponent('../../items/items.xml') + '/restaurar', {});
            check('...ni una ruta que se sale de la carpeta', traversal.status === 400 || traversal.status === 404, resumen(traversal));
            const noHay = await api('POST', '/api/maps/nuevo/copias/nuevo-20000101T000000000Z.map.json/restaurar', {});
            check('una copia que no existe -> 404', noHay.status === 404, resumen(noHay));

            // Una copia que ya no carga (un objeto que se borro de items.xml): no se restaura.
            const rota = JSON.parse(contenidoElegido);
            rota.tiles.push({ x: 3, y: 3, z: 7, items: [99999] });
            const archivoRoto = 'nuevo-20000101T000000001Z.map.json';
            fs.writeFileSync(path.join(ws.copias('nuevo'), archivoRoto), JSON.stringify(rota));
            const antesDeRota = leer(ws.archivo('nuevo'));
            const restaurarRota = await api('POST', '/api/maps/nuevo/copias/' + archivoRoto + '/restaurar', {});
            check('una copia que el motor no cargaria -> 422 y el mapa no se toca', restaurarRota.status === 422 &&
                leer(ws.archivo('nuevo')) === antesDeRota, resumen(restaurarRota));

            check('.gitignore ignora data/world/backups/', /^data\/world\/backups\/$/m.test(leer(path.join(ROOT, '.gitignore'))));
        }
    } finally {
        await tools.close();
        ws.quitar();
    }

    /** Las copias de un mapa, leídas del disco con la misma regla que el servidor. */
    function copiasEnDisco(nombre) {
        return MapFiles.listarCopias(ws.mapsDir, nombre);
    }

    console.log('');
    if (fallos === 0) {
        console.log('\x1b[32mTodo OK\x1b[0m — ' + total + ' comprobaciones: nuevo mapa, guardar como, propiedades y copias.');
        process.exit(0);
    }
    console.log('\x1b[31m' + fallos + ' de ' + total + ' comprobaciones fallaron\x1b[0m');
    process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
