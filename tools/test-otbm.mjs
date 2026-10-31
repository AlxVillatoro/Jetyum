/**
 * PRUEBAS DE OTBM: el lector y el escritor del binario, las equivalencias de ids, la importación de
 * un mapa de Tibia a Jetyum (que tiene que cargar en el motor) y la exportación de vuelta.
 *
 *     node tools/test-otbm.mjs
 *
 *   1. el lector sobre un OTBM HECHO A MANO, byte a byte: escapes, objetos dentro de objetos,
 *      atributos, casas, ciudades y waypoints
 *   2. el escritor: lo que escribe se lee igual (ida y vuelta)
 *   3. el lector sobre el mapa de muestra de verdad (`forserver-downgrade/data/world/world.otbm`):
 *      la cabecera, cuántas casillas y ciudades, el recorte por área y el tiempo
 *   4. las equivalencias: objetos conocidos casan con lo que tienen que casar, y `manual` manda
 *   5. importar un área pequeña de la muestra a una carpeta temporal: el resultado carga con el
 *      cargador del motor, con casas, ciudades, puertas y teleports en su sitio
 *   6. exportar lo importado y volver a leerlo: cada cosa vuelve a su coordenada original
 *   7. el editor: subir el .otbm, «Analizar» e «Importar y abrir» por el API, sobre copias
 *
 * Las secciones 3 y siguientes necesitan las muestras de los proyectos vecinos (`../forserver-downgrade`
 * y `../NexaMap-Editor`); si no están, se saltan diciéndolo. NADA ESCRIBE EN `data/`: todo va a la
 * carpeta temporal del sistema.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Otbm = require('../editor/lib/otbm.js');
const Equivalencias = require('../editor/lib/equivalencias.js');
const Convertir = require('../editor/lib/convertirotbm.js');
const MapLoader = require('../engine/world/loader.js');
const Xml = require('../engine/data/xml.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VECINOS = path.resolve(ROOT, '..');
const MUESTRA = {
    otbm: path.join(VECINOS, 'forserver-downgrade', 'data', 'world', 'world.otbm'),
    casas: path.join(VECINOS, 'forserver-downgrade', 'data', 'world', 'world-house.xml'),
    spawns: path.join(VECINOS, 'forserver-downgrade', 'data', 'world', 'world-spawn.xml'),
    itemsOtb: path.join(VECINOS, 'forserver-downgrade', 'data', 'items', 'items.otb'),
    itemsXml: path.join(VECINOS, 'forserver-downgrade', 'data', 'items', 'items.xml'),
    materiales: path.join(VECINOS, 'NexaMap-Editor', 'data', 'editor', 'materials.xml')
};
const HAY_MUESTRA = ['otbm', 'itemsOtb', 'itemsXml', 'materiales'].every((k) => fs.existsSync(MUESTRA[k]));

let fallos = 0;
let total = 0;

function check(label, condition, detail) {
    total += 1;
    if (!condition) {
        fallos += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}

function section(t) {
    console.log('\n' + t);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-otbm-'));

// ---------------------------------------------------------------------------
section('1. El lector, sobre un OTBM hecho a mano');
{
    // Un constructor mínimo e INDEPENDIENTE del escritor: bytes, con los de control escapados.
    const esc = (bytes) => bytes.flatMap((b) => (b === 0xFD || b === 0xFE || b === 0xFF ? [0xFD, b] : [b]));
    const u16 = (v) => [v & 0xFF, (v >> 8) & 0xFF];
    const u32 = (v) => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF];
    const cadena = (s) => u16(Buffer.byteLength(s, 'latin1')).concat([...Buffer.from(s, 'latin1')]);
    const nodo = (tipo, props, hijos) => [0xFE, tipo].concat(esc(props), ...(hijos || []), [0xFF]);

    // Un objeto con texto que lleva un 0xFF (ÿ en Latin-1) y un contenedor con algo dentro.
    const carta = nodo(6, u16(2597).concat([4], u16(1001), [6], cadena('hola ÿ'), [15], [3]));
    const dentro = nodo(6, u16(2148).concat([15], [0xFE]));
    const bolsa = nodo(6, u16(1987).concat([5], u16(0x01FD)), [dentro]);
    const portal = nodo(6, u16(1387).concat([8], u16(300), u16(301), [7]));
    const puerta = nodo(6, u16(1209).concat([14], [7]));
    const casilla = nodo(5, [10, 0xFF].concat([3], u32(1 | 4), [9], u16(4526)), [carta, bolsa, portal]);
    const deCasa = nodo(14, [11, 0xFE].concat(u32(42), [9], u16(406)), [puerta]);
    const zona = nodo(4, u16(0x01FE).concat(u16(0x0300), [7]), [casilla, deCasa]);
    const ciudades = nodo(12, [], [nodo(13, u32(3).concat(cadena('Thais'), u16(0x01FE + 10), u16(0x0300 + 255), [7]))]);
    const waypoints = nodo(15, [], [nodo(16, cadena('templo').concat(u16(500), u16(600), [6]))]);
    const datos = nodo(2, [1].concat(cadena('mapa de prueba'), [11], cadena('x-spawn.xml'), [13], cadena('x-house.xml')),
        [zona, ciudades, waypoints]);
    const raiz = nodo(0, u32(2).concat(u16(2048), u16(2048), u32(3), u32(20)), [datos]);
    const buffer = Buffer.from([0, 0, 0, 0].concat(raiz));

    const m = Otbm.leerOtbm(buffer);
    check('la cabecera', m.cabecera.version === 2 && m.cabecera.ancho === 2048 && m.cabecera.itemsMenor === 20,
        JSON.stringify(m.cabecera));
    check('la descripción y los archivos de casas y respawns', m.descripciones[0] === 'mapa de prueba' &&
        m.archivoSpawns === 'x-spawn.xml' && m.archivoCasas === 'x-house.xml');
    check('dos casillas, una de casa', m.casillas.length === 2 && m.estadisticas.casillasDeCasa === 1);
    const c = m.casillas[0];
    check('la zona y el desplazamiento se leen con sus escapes (0x1FE + 10, 0x300 + 255)',
        c.x === 0x01FE + 10 && c.y === 0x0300 + 255 && c.z === 7, c.x + ',' + c.y);
    check('las banderas: zona de protección y sin PvP', Otbm.nombresDeBanderas(c.flags).join() === 'protectionZone,noPvp');
    check('el suelo en línea va primero y luego los objetos, en orden',
        c.items.map((i) => i.id).join() === '4526,2597,1987,1387');
    check('los atributos: actionId, texto (con un 0xFF dentro) y cantidad',
        c.items[1].atributos.actionId === 1001 && c.items[1].atributos.text === 'hola ÿ' && c.items[1].count === 3);
    check('un objeto dentro de otro, con su cantidad escapada (0xFE)', c.items[2].contenido &&
        c.items[2].contenido[0].id === 2148 && c.items[2].contenido[0].count === 0xFE &&
        c.items[2].atributos.uniqueId === 0x01FD && m.estadisticas.contenidos === 1);
    check('el destino de un teleport', JSON.stringify(c.items[3].atributos.teleportDestination) === '{"x":300,"y":301,"z":7}');
    const casa = m.casillas[1];
    check('la casilla de casa: su casa y la puerta con su número', casa.houseId === 42 && casa.y === 0x0300 + 0xFE &&
        casa.items[1].atributos.doorId === 7);
    check('las ciudades', m.ciudades.length === 1 && m.ciudades[0].nombre === 'Thais' &&
        m.ciudades[0].templo.x === 0x01FE + 10);
    check('los waypoints', m.waypoints.length === 1 && m.waypoints[0].nombre === 'templo' && m.waypoints[0].z === 6);

    const recortado = Otbm.leerOtbm(buffer, { area: { x1: 0, y1: 0, x2: 100, y2: 100, z1: 7, z2: 7 } });
    check('con un área que no la toca, la zona entera se salta', recortado.casillas.length === 0 &&
        recortado.estadisticas.areasSaltadas === 1 && recortado.ciudades.length === 1);
    const vistas = [];
    Otbm.leerOtbm(buffer, { alCasilla: (x) => vistas.push(x.x) });
    check('con alCasilla se entregan sin guardarse', vistas.length === 2);

    let error = null;
    try {
        Otbm.leerOtbm(buffer.subarray(0, buffer.length - 3));
    } catch (e) {
        error = e.message;
    }
    check('un archivo cortado da un error que lo dice', /sin cerrar/.test(error || ''), error);
}

// ---------------------------------------------------------------------------
section('2. El escritor: ida y vuelta');
{
    const datos = {
        cabecera: { version: 2, ancho: 1024, alto: 1024, itemsMayor: 3, itemsMenor: 20 },
        descripciones: ['ida y vuelta'],
        archivoSpawns: 'a-spawn.xml',
        archivoCasas: 'a-house.xml',
        casillas: [
            { x: 255, y: 254, z: 7, houseId: 0, flags: 1, items: [{ id: 0xFEFD, atributos: {} },
                { id: 1988, atributos: { actionId: 0xFFFE, text: 'ÿþý' }, contenido: [{ id: 2148, count: 100, atributos: {} }] }] },
            { x: 256, y: 1, z: 6, houseId: 0x00FFFEFD, flags: 16, items: [{ id: 1209, atributos: { doorId: 3 } }] },
            { x: 1, y: 2, z: 7, houseId: 0, flags: 0, items: [{ id: 1387, atributos: { teleportDestination: { x: 9, y: 8, z: 7 } } }] }
        ],
        ciudades: [{ id: 1, nombre: 'Ñandú', templo: { x: 255, y: 254, z: 7 } }],
        waypoints: [{ nombre: 'w', x: 1, y: 2, z: 7 }]
    };
    const buffer = Otbm.escribirOtbm(datos);
    const leido = Otbm.leerOtbm(buffer);
    const porPosicion = (lista) => lista.slice().sort((a, b) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x));
    // Con las claves ordenadas: lo que importa es lo que hay, no en qué orden se escribieron.
    const ordenado = (v) => (Array.isArray(v) ? v.map(ordenado) : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenado(v[k])])) : v);
    const limpiar = (c) => ordenado({ x: c.x, y: c.y, z: c.z, houseId: c.houseId, flags: c.flags, items: c.items });
    check('las casillas vuelven iguales (con bytes de control en ids, atributos y casas)',
        JSON.stringify(porPosicion(leido.casillas).map(limpiar)) === JSON.stringify(porPosicion(datos.casillas).map(limpiar)));
    check('la cabecera, los textos, las ciudades y los waypoints también',
        leido.cabecera.ancho === 1024 && leido.descripciones[0] === 'ida y vuelta' && leido.archivoCasas === 'a-house.xml' &&
        leido.ciudades[0].nombre === 'Ñandú' && leido.waypoints[0].nombre === 'w');
    check('y lo escrito dos veces es idéntico', Buffer.compare(buffer, Otbm.escribirOtbm(leido)) === 0);
}

// ---------------------------------------------------------------------------
section('3. El lector, sobre el mapa de muestra');
let fuentes = null;
if (!HAY_MUESTRA) {
    console.log('  SALTADA: no están las muestras en ' + VECINOS + ' (forserver-downgrade y NexaMap-Editor)');
} else {
    const buffer = fs.readFileSync(MUESTRA.otbm);
    let t = process.hrtime.bigint();
    const entero = Otbm.leerOtbm(buffer, { alCasilla: () => {} });
    const msEntero = Number(process.hrtime.bigint() - t) / 1e6;
    check('la cabecera: OTBM 2, 2048x2048, items 3.20 (8.60)', entero.cabecera.version === 2 &&
        entero.cabecera.ancho === 2048 && entero.cabecera.alto === 2048 && entero.cabecera.itemsMayor === 3 &&
        entero.cabecera.itemsMenor === 20, JSON.stringify(entero.cabecera));
    check('cientos de miles de casillas y de objetos', entero.estadisticas.casillas > 300000 &&
        entero.estadisticas.items > 400000, entero.estadisticas.casillas + ' casillas, ' + entero.estadisticas.items + ' objetos');
    check('las tres ciudades, con su templo', entero.ciudades.length === 3 &&
        entero.ciudades.some((c) => c.nombre === 'Classic City' && c.templo.x === 1000 && c.templo.y === 1000));
    check('nombra sus archivos de casas y de respawns', entero.archivoCasas === 'world-house.xml' &&
        entero.archivoSpawns === 'world-spawn.xml');
    check('el mapa entero se recorre en menos de 3 s', msEntero < 3000, Math.round(msEntero) + ' ms para ' +
        Math.round(buffer.length / 1024) + ' KB');

    t = process.hrtime.bigint();
    const area = Otbm.leerOtbm(buffer, { area: { x1: 980, y1: 980, x2: 1020, y2: 1020, z1: 7, z2: 7 } });
    const msArea = Number(process.hrtime.bigint() - t) / 1e6;
    check('un área de 41x41: solo sus casillas, y las zonas de fuera se saltan sin leerlas',
        area.casillas.length > 1000 && area.casillas.every((c) => c.x >= 980 && c.x <= 1020 && c.z === 7) &&
        area.estadisticas.areasSaltadas > area.estadisticas.areas / 2,
        area.casillas.length + ' casillas en ' + Math.round(msArea) + ' ms (' + area.estadisticas.areasSaltadas +
        ' de ' + area.estadisticas.areas + ' zonas saltadas)');
    const templo = area.casillas.find((c) => c.x === 1000 && c.y === 1000);
    check('el templo de Classic City es zona de protección', templo && (templo.flags & 1) === 1);

    t = process.hrtime.bigint();
    fuentes = Convertir.cargarFuentes({ itemsOtb: MUESTRA.itemsOtb, itemsXml: MUESTRA.itemsXml,
        materiales: MUESTRA.materiales, equivalencias: path.join(tmp, 'no-existe.json') });
    check('items.otb: la versión 3.20 de 8.60 y decenas de miles de objetos', fuentes.otb.version.menor === 20 &&
        fuentes.otb.items.size > 10000, fuentes.otb.version.descripcion + ', ' + fuentes.otb.items.size + ' objetos, ' +
        'fuentes en ' + Math.round(Number(process.hrtime.bigint() - t) / 1e6) + ' ms');
}

// ---------------------------------------------------------------------------
section('4. Las equivalencias');
{
    const n = Equivalencias.normalizarNombre;
    check('los nombres se normalizan (artículo, mayúsculas, acentos, signos)', n('A Gold Coin') === 'gold coin' &&
        n('the  Pájaro-Loco') === 'pajaro loco');
    check('el color de minimapa de Tibia (cubo 6x6x6)', Equivalencias.colorDeMinimapa(24).join() === '0,204,0' &&
        Equivalencias.colorDeMinimapa(300) === null);
    const inversa = Equivalencias.tablaInversa(new Map([
        [10, { destino: 500, metodo: 'color' }], [11, { destino: 500, metodo: 'pincel' }],
        [12, { destino: 500, metodo: 'pincel' }], [13, { destino: 0, metodo: 'omitido' }]]));
    check('la tabla inversa se queda con el método más fiable, y el primero a igualdad', inversa.get(500).id === 11 &&
        inversa.size === 1);
    const final = Equivalencias.tablaFinal(new Map([[10, { destino: 500, metodo: 'color', nombre: 'x' }]]), { 10: 0, 20: 7 });
    check('manual manda sobre la automática (0 es quitar)', final.get(10).destino === 0 && final.get(10).metodo === 'manual' &&
        final.get(20).destino === 7);
    const texto = Equivalencias.serializar(Object.assign(Equivalencias.porDefecto(), { manual: { 5: 1 },
        automatico: { 4515: [10101, 'pincel', 'grass'] } }));
    const vuelta = JSON.parse(texto);
    check('el archivo se escribe una entrada por línea y se vuelve a leer', vuelta.automatico['4515'][0] === 10101 &&
        texto.includes('\n    "4515": [10101,"pincel","grass"]\n') && texto.includes('["grass*", "otsp-hierba"]'));

    if (fuentes) {
        const t = fuentes.tabla;
        const destino = (id) => (t.get(id) ? t.get(id).destino : null);
        const metodo = (id) => (t.get(id) ? t.get(id).metodo : null);
        check('la hierba (4515) va a la hierba principal del pincel de Jetyum (10101), por su papel en el pincel',
            destino(4515) === 10101 && metodo(4515) === 'pincel');
        check('el muro de piedra va pieza a pieza: vertical, horizontal, esquina y poste',
            destino(1294) === 10534 && destino(1295) === 10535 && destino(1298) === 10537 && destino(1296) === 10536,
            [1294, 1295, 1298, 1296].map(destino).join(','));
        check('y su puerta horizontal y la vertical, a las de su muro', destino(6251) === 12389 && destino(6248) === 12386);
        check('la moneda de oro, por su nombre', destino(3031) === 3031 && metodo(3031) === 'nombre');
        check('la escalera de mano, por lo que hace', destino(1948) === 11009 && metodo(1948) === 'funcional');
        check('el portal (magic forcefield), al teleport de Jetyum', destino(1949) === 1387);
        const pino = t.get(3682);
        check('un árbol, por su clase, a un árbol', pino && fuentes.itemTypes.get(pino.destino).name === 'tree' &&
            pino.metodo === 'clase', pino && pino.nombre);
        check('los suelos que bloquean siguen bloqueando (el agua del mar, 4597)', fuentes.itemTypes.get(destino(4597)) &&
            fuentes.itemTypes.get(destino(4597)).attributes.blocksSolid === 1, destino(4597));
        check('un borde de suelo sin equivalente se quita a propósito (el de la hierba sobre el agua, 4608)',
            destino(4608) === 0 && metodo(4608) === 'omitido');
        const cuantas = (m) => Array.from(t.values()).filter((e) => e.metodo === m).length;
        check('todas las capas trabajan', ['pincel', 'funcional', 'nombre', 'clase', 'color', 'omitido']
            .every((m) => cuantas(m) > 0), Object.keys(fuentes.resumen).map((k) => k + ' ' + fuentes.resumen[k]).join(', '));
        const ids = Array.from(t.values()).filter((e) => e.destino > 0).map((e) => e.destino);
        check('y todo destino existe en items.xml de Jetyum', ids.every((id) => fuentes.itemTypes.has(id)));
    }
}

// ---------------------------------------------------------------------------
section('5. Importar un área de la muestra (a una carpeta temporal)');
let importado = null;
if (fuentes) {
    const { tiposDelDatapack, importarOtbm } = await import('./importar-otbm.mjs');
    const tipos = tiposDelDatapack();
    const salida = path.join(tmp, 'world', 'classic.map.json');
    const t = process.hrtime.bigint();
    importado = importarOtbm({ otbm: MUESTRA.otbm, fuentes: fuentes, tipos: tipos, casas: MUESTRA.casas,
        spawns: MUESTRA.spawns, area: '980,980,1020,1020,6,7', salida: salida });
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    const informe = importado.informe;
    check('escribe el mapa en la carpeta temporal', fs.existsSync(salida), Math.round(ms) + ' ms');
    check('casi todo se traduce o se quita a propósito', informe.items.porcentajeResuelto > 95 &&
        informe.items.porcentajeMapeado > 75,
        informe.items.porcentajeMapeado + '% traducido, ' + informe.items.porcentajeResuelto + '% resuelto, ' +
        informe.items.sinEquivalencia + ' sin equivalencia');

    const itemTypes = Xml.loadItems(path.join(ROOT, 'data', 'items', 'items.xml'));
    const cargado = MapLoader.loadMap(salida, { itemTypes: itemTypes, monsterTypes: tipos.monsterTypes, npcTypes: tipos.npcTypes });
    check('CARGA CON EL CARGADOR DEL MOTOR, sin errores', cargado.report.ok && !!cargado.map,
        cargado.report.errors.slice(0, 3).map((e) => e.message).join('; '));
    const map = cargado.map;
    const raw = JSON.parse(fs.readFileSync(salida, 'utf8'));
    check('el área va al origen y el desplazamiento queda apuntado', map.width === 41 && map.height === 41 &&
        raw._otbm.origen.x === 980 && raw._otbm.origen.y === 980);
    check('la ciudad Classic City, con su templo en (20,20,7)', map.towns.length === 1 &&
        map.towns[0].name === 'Classic City' && map.towns[0].temple.x === 20 && map.towns[0].temple.y === 20);
    const templo = map.getTile(20, 20, 7);
    check('el templo se puede pisar y es zona de protección', map.isWalkable(20, 20, 7) && templo &&
        templo.hasFlag && templo.hasFlag(1));
    check('las casas, con su nombre de house.xml, su ciudad y sus casillas', map.houses.length > 3 &&
        map.houses.every((h) => /^Classic City House/.test(h.name) && h.townId === 1) &&
        raw.tiles.filter((x) => x.houseId).length > 100, map.houses.length + ' casas');
    const puerta = map.getTile(0, 1, 7);
    const conPuerta = puerta && puerta.downItems.concat(puerta.topItems).find((i) => i.attributes.doorId === 1);
    check('la puerta de la casa 6 conserva su número (doorId 1)', !!conPuerta && puerta.houseId === 6,
        conPuerta ? conPuerta.typeId + ' ' + (itemTypes.get(conPuerta.typeId) || {}).name : '');
    const portal = map.getTile(17, 15, 7);
    const tp = portal && portal.downItems.concat(portal.topItems).find((i) => i.typeId === 1387);
    check('el teleport es el de Jetyum y su destino se desplaza con el área', tp &&
        JSON.stringify(tp.attributes.teleportDestination) === '{"x":75,"y":20,"z":6}',
        tp ? JSON.stringify(tp.attributes.teleportDestination) : 'sin teleport');
    check('los respawns que quedan son de monstruos de data/monsters', raw.spawns.every((s) =>
        s.monsters.every((m) => tipos.monsterTypes.has(m.name))), informe.spawns.importados + ' respawns, ' +
        informe.spawns.monstruosDesconocidos + ' monstruos desconocidos quitados');
    check('el informe lista los ids sin equivalencia de más a menos', informe.sinEquivalencia.every((s, i, l) =>
        i === 0 || l[i - 1].veces >= s.veces));
    let error = null;
    try {
        importarOtbm({ otbm: MUESTRA.otbm, fuentes: fuentes, tipos: tipos, area: '980,980,990,990,7,7', salida: salida });
    } catch (e) {
        error = e.message;
    }
    check('nunca pisa un mapa que ya existe', /ya existe/.test(error || ''));

    // Una zona con respawns de monstruos que sí existen aquí (Goblin) y de otros que no.
    const conRespawns = Convertir.importar({ otbm: MUESTRA.otbm, fuentes: fuentes, area: '900,960,960,1020,5,6',
        spawns: MUESTRA.spawns, monsterTypes: tipos.monsterTypes, npcTypes: tipos.npcTypes });
    const goblins = conRespawns.raw.spawns.filter((s) => s.monsters.some((m) => m.name === 'Goblin'));
    check('los respawns de monstruos conocidos se importan, con el radio cubriendo a todos', goblins.length > 0 &&
        conRespawns.raw.spawns.every((s) => s.monsters.every((m) => m.x === undefined ||
            (Math.abs(m.x - s.x) <= s.radius && Math.abs(m.y - s.y) <= s.radius))) && conRespawns.informe.carga.ok,
        conRespawns.informe.spawns.importados + ' respawns, ' + conRespawns.informe.spawns.monstruos + ' monstruos');
    check('y los monstruos que no existen se quitan y se listan', conRespawns.informe.spawns.monstruosDesconocidos > 0 &&
        conRespawns.informe.spawns.desconocidos.length > 0,
        conRespawns.informe.spawns.desconocidos.slice(0, 4).map((d) => d.nombre).join(', '));
} else {
    console.log('  SALTADA: sin muestras');
}

// ---------------------------------------------------------------------------
section('6. Exportar lo importado y volver a leerlo');
if (importado) {
    const { exportarOtbm } = await import('./exportar-otbm.mjs');
    const config = Equivalencias.porDefecto();
    const archivoEq = path.join(tmp, 'equivalencias.json');
    fs.writeFileSync(archivoEq, Equivalencias.serializar(Object.assign(config, {
        origen: fuentes.sello, automatico: Equivalencias.tablaAArchivo(fuentes.automatica) })));
    const destino = path.join(tmp, 'vuelta', 'classic.otbm');
    const r = exportarOtbm({ mapa: path.join(tmp, 'world', 'classic.map.json'), salida: destino, equivalencias: archivoEq });
    const conSpawns = importado.raw.spawns.length > 0 || importado.raw.npcs.length > 0;
    check('escribe el .otbm y el house.xml (y el spawn.xml si hay respawns)',
        r.escritos.length === (conSpawns ? 3 : 2) && r.informe.sinVuelta === 0,
        r.escritos.map((e) => path.basename(e)).join(', '));
    const vuelta = Otbm.leerOtbm(fs.readFileSync(destino));
    check('las mismas casillas, en su coordenada ORIGINAL', vuelta.casillas.length === importado.raw.tiles.length &&
        vuelta.casillas.every((c) => c.x >= 980 && c.x <= 1020 && c.y >= 980 && c.y <= 1020),
        vuelta.casillas.length + ' casillas');
    check('el templo vuelve a (1000,1000,7)', vuelta.ciudades[0].templo.x === 1000 && vuelta.ciudades[0].templo.y === 1000);
    const casas = Convertir.leerCasas(path.join(tmp, 'vuelta', 'classic-house.xml'));
    check('las casas vuelven con su salida original', casas.length === importado.raw.houses.length &&
        casas.some((c) => c.entrada.x >= 980));
    const tp = vuelta.casillas.flatMap((c) => c.items).find((i) => i.atributos.teleportDestination);
    check('y el destino del teleport también', tp && tp.atributos.teleportDestination.x === 1055 &&
        tp.atributos.teleportDestination.y === 1000);
    // Y la vuelta se puede volver a importar: el ciclo se cierra.
    const otra = Convertir.importar({ otbm: destino, fuentes: fuentes, area: '980,980,1020,1020,6,7',
        casas: path.join(tmp, 'vuelta', 'classic-house.xml') });
    check('lo exportado se vuelve a importar y carga', otra.informe.carga.ok &&
        otra.raw.tiles.length === importado.raw.tiles.length, otra.informe.items.porcentajeMapeado + '% traducido');
} else {
    console.log('  SALTADA: sin muestras');
}

// ---------------------------------------------------------------------------
section('7. El editor: subir, analizar e importar por el API (sobre copias)');
if (HAY_MUESTRA) {
    const Tools = require('../editor/server.js');
    fs.mkdirSync(path.join(tmp, 'editor-world'), { recursive: true });
    const srv = Tools.createToolsServer({ port: 0, logger: { info() {}, warning() {}, error() {} },
        mapsDir: path.join(tmp, 'editor-world'), subidasDir: path.join(tmp, 'subidas') });
    const port = await srv.ready;
    const api = async (method, ruta, cuerpo, crudo) => {
        const r = await fetch('http://127.0.0.1:' + port + ruta, { method,
            headers: crudo ? undefined : cuerpo ? { 'Content-Type': 'application/json' } : undefined,
            body: crudo || (cuerpo ? JSON.stringify(cuerpo) : undefined) });
        return { status: r.status, body: await r.json() };
    };
    try {
        const sub = await api('POST', '/api/subidas?nombre=world.otbm', null, fs.readFileSync(MUESTRA.otbm));
        check('POST /api/subidas: el .otbm de 4 MB sube tal cual a la carpeta temporal', sub.status === 201 &&
            fs.existsSync(sub.body.ruta) && sub.body.bytes === fs.statSync(MUESTRA.otbm).size &&
            sub.body.ruta.startsWith(path.join(tmp, 'subidas')));
        const mala = await api('POST', '/api/subidas?nombre=config.js', null, Buffer.from('x'));
        check('y no acepta lo que no es .otbm, .otb o .xml', mala.status === 400);
        const cuerpo = { nombre: 'desde-editor', otbm: sub.body.ruta, itemsOtb: MUESTRA.itemsOtb, itemsXml: MUESTRA.itemsXml,
            casas: MUESTRA.casas, spawns: MUESTRA.spawns, area: '990,990,1010,1010,7,7' };
        const analisis = await api('POST', '/api/maps/importar-otbm', Object.assign({ dryRun: true }, cuerpo));
        check('«Analizar» devuelve el informe y no escribe nada', analisis.status === 200 &&
            analisis.body.informe.casillas.escritas > 300 &&
            !fs.existsSync(path.join(tmp, 'editor-world', 'desde-editor.map.json')),
            analisis.body.informe && analisis.body.informe.items.porcentajeMapeado + '% traducido');
        const hecho = await api('POST', '/api/maps/importar-otbm', cuerpo);
        check('«Importar» crea el mapa por el camino de siempre (ida y vuelta comprobada)', hecho.status === 201 &&
            hecho.body.stats.towns === 1 && fs.existsSync(path.join(tmp, 'editor-world', 'desde-editor.map.json')));
        const abierto = await api('GET', '/api/map?name=desde-editor');
        check('y el editor lo abre, con su apunte _otbm conservado', abierto.status === 200 &&
            abierto.body.raw._otbm && abierto.body.raw._otbm.origen.x === 990);
        const otra = await api('POST', '/api/maps/importar-otbm', cuerpo);
        check('importar otra vez con el mismo nombre no pisa: 409', otra.status === 409);
        const sinMapa = await api('POST', '/api/maps/importar-otbm', { nombre: 'x', itemsOtb: MUESTRA.itemsOtb });
        check('sin .otbm, 400 con el motivo', sinMapa.status === 400 && sinMapa.body.problems.some((p) => /otbm/.test(p)));
    } finally {
        await srv.close();
    }
} else {
    console.log('  SALTADA: sin muestras');
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + (fallos === 0
    ? '\x1b[32mTodo OK\x1b[0m — ' + total + ' comprobaciones: OTBM se lee, se escribe, se traduce y carga en el motor.'
    : '\x1b[31m' + fallos + ' de ' + total + ' comprobaciones fallaron\x1b[0m'));
process.exitCode = fallos === 0 ? 0 : 1;
