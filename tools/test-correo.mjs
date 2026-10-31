/**
 * PRUEBAS DEL DEPÓSITO POR CIUDAD Y DEL CORREO: buzón, cartas, paquetes y etiquetas.
 *
 *     node tools/test-correo.mjs
 *
 * Con el motor de verdad, el mapa `jetyum` con una SEGUNDA CIUDAD añadida aquí («Puerto», con el
 * templo en el campamento), el reloj en la mano y una base de datos TEMPORAL:
 *
 *   1. un depósito por ciudad: qué ciudad es cada cofre, cada uno lo suyo, y se guardan los dos
 *   2. el depósito de antes (uno solo, `deposito`) se carga como el de su ciudad, sin duplicarse
 *   3. escribir una carta (CLIENT.TEXT_WINDOW_SAVE) y mirarla
 *   4. mandarla a alguien que está dentro (con su depósito abierto) y usándola sobre el buzón
 *   5. a alguien que no está: espera en `player_mail` y le llega al entrar
 *   6. lo que no se manda: sin nombre, a quien no existe, a una ciudad que no existe
 *   7. un paquete con su etiqueta y una bolsa con cosas dentro llega entero
 *   8. todo sigue ahí al salir y volver a entrar; y la carta sellada se lee
 *   9. `entregarEnDeposito`, la puerta de las casas
 *  10. el Tendero lo vende
 *  11. lo que se dice, en inglés
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');
const P = require('../engine/net/protocol.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

const BUZON = 21040;
const CARTA = 21041;
const CARTA_SELLADA = 21042;
const PAQUETE = 21043;
const PAQUETE_SELLADO = 21044;
const ETIQUETA = 21045;
const MOCHILA = 2412;
const ORO = 3031;
const ESPADA = 2400;

// ---------------------------------------------------------------------------
// El motor, con una base temporal y una segunda ciudad.
// ---------------------------------------------------------------------------
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-correo-'));
const baseDeDatos = path.join(carpeta, 'correo.db');
const e = createEngine({
    rootDir: ROOT,
    logLevel: 'error',
    overrides: { mapName: 'jetyum', mapFile: null, useDatabase: true, databaseFile: baseDeDatos }
});
const world = e.world;
const db = e.repository.database;

let reloj = 60000000;
world.now = () => reloj;
e.scheduler.now = () => reloj;

const templo = world.map.getWaypoint('temple');
const campamento = world.map.getWaypoint('campamento');
world.map.towns.push({ id: 2, name: 'Puerto', temple: { x: campamento.x, y: campamento.y, z: campamento.z } });

e.repository.createAccount('Correos', 'clave-correo');
function conectar(nombre) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    const r = sesion.login({ account: 'Correos', password: 'clave-correo', character: nombre,
        crear: !e.repository.database.findCharacterByName(nombre), vocation: 'Knight' });
    if (!r.handled || !sesion.player) {
        throw new Error('no entra ' + nombre + ': ' + JSON.stringify(r));
    }
    return { sesion, buzon, pj: sesion.player };
}
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]);
const ventanasDeTexto = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT_WINDOW);
const ventanaDeContenedor = (buzon, id) => buzon.filter((m) => m[0] === P.SERVER.CONTAINER_OPEN && m[1].id === id)
    .map((m) => m[1]).pop() || null;
const entrada = (pj, typeId) => pj.inventory.find((x) => x.typeId === typeId) || null;

/** Una casilla de al lado donde se puede dejar algo, sin contenedor encima ni las de `evitar`. */
function casillaLibre(pj, evitar) {
    for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
            const c = { x: pj.position.x + dx, y: pj.position.y + dy, z: pj.position.z };
            if ((dx || dy) && world._canHoldItems(c.x, c.y, c.z) && !world._contenedorArribaEn(c.x, c.y, c.z) &&
                !world.buzonEn(c.x, c.y, c.z) && !(evitar || []).some((o) => o.x === c.x && o.y === c.y)) {
                return c;
            }
        }
    }
    throw new Error('no hay casilla libre al lado de ' + pj.name);
}

/** Lleva a un jugador a una casilla pisable cerca de `donde`. */
function llevar(pj, donde) {
    const libre = world.freeTileNear(donde, pj) || donde;
    world.teleportCreature(pj, libre);
}

function mover(sesion, desde, hasta) {
    const F = P.MOVE_ITEM_FIELD;
    const m = new Array(F.TO_INDEX + 1).fill(0);
    m[0] = P.CLIENT.MOVE_ITEM;
    m[F.FROM_KIND] = desde.kind;
    m[F.FROM_X] = desde.x || 0;
    m[F.FROM_Y] = desde.y || 0;
    m[F.FROM_Z] = desde.z || 0;
    m[F.FROM_INDEX] = desde.index || 0;
    m[F.FROM_ID] = desde.id || 0;
    m[F.TO_KIND] = hasta.kind;
    m[F.TO_X] = hasta.x || 0;
    m[F.TO_Y] = hasta.y || 0;
    m[F.TO_Z] = hasta.z || 0;
    m[F.TO_SLOT] = hasta.slot || 0;
    m[F.TO_ID] = hasta.id || 0;
    m[F.TO_INDEX] = hasta.index === undefined ? -1 : hasta.index;
    return sesion.handle(m);
}

/** Escribe en lo que lleva en `entry` por la ventana de texto, como el cliente. */
function escribir(s, entry, texto) {
    s.sesion.handle([P.CLIENT.USE_INVENTORY, s.pj.inventory.indexOf(entry)]);
    const v = ventanasDeTexto(s.buzon).pop();
    return { ventana: v, r: v ? s.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, v[1], texto]) : null };
}

/** Una carta nueva en la mochila, ya escrita. */
function cartaEscrita(s, texto) {
    world.addItemTo(s.pj, CARTA, 1);
    const carta = s.pj.inventory.filter((x) => x.typeId === CARTA).pop();
    escribir(s, carta, texto);
    return carta;
}

/** Echa lo que lleva en `entry` en el buzón de `sitio` arrastrándolo. */
const echar = (s, entry, sitio) => mover(s.sesion, { kind: P.MOVE_FROM.INVENTORY, index: s.pj.inventory.indexOf(entry) },
    { kind: P.MOVE_TO.GROUND, x: sitio.x, y: sitio.y, z: sitio.z });

const ana = conectar('Ana Correo');
const beto = conectar('Beto Correo');

// ===========================================================================
section('1. Un depósito por ciudad');
// ===========================================================================
let cofre1;
let cofre2;
{
    const cofre = (typeId, attrs, pos) => ({ typeId, attributes: attrs || {}, position: pos });
    check('un cofre es de la ciudad de su atributo townId', world.ciudadDeCofre(cofre(11112, { townId: 2 }, templo)) === 2);
    check('si no lo tiene, de la del templo más cercano en su planta',
        world.ciudadDeCofre(cofre(11112, null, { x: templo.x + 2, y: templo.y, z: 7 })) === 1 &&
        world.ciudadDeCofre(cofre(11112, null, { x: campamento.x + 3, y: campamento.y - 1, z: 7 })) === 2);
    check('y en una planta sin templos, la del más cercano en cualquiera',
        world.ciudadDeCofre(cofre(11112, null, { x: campamento.x, y: campamento.y, z: 8 })) === 2 &&
        world.ciudadDeCofre(cofre(11112, null, { x: templo.x, y: templo.y, z: 6 })) === 1);

    const { pj, sesion, buzon } = ana;
    const sitio1 = casillaLibre(pj);
    cofre1 = world.createItem(world.depotItemId, 1, sitio1);
    world.addItemTo(pj, ESPADA, 1);
    buzon.length = 0;
    sesion.handle([P.CLIENT.USE_ITEM, sitio1.x, sitio1.y, sitio1.z]);
    const dep1 = world.depotOf(pj, cofre1);
    check('el cofre de Jetyum abre el depósito de Jetyum', dep1 && dep1.townId === 1 && ventanaDeContenedor(buzon, dep1.instanceId) !== null);
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: pj.inventory.indexOf(entrada(pj, ESPADA)) },
        { kind: P.MOVE_TO.GROUND_CONTAINER, id: dep1.instanceId });
    check('se guarda una espada en el de Jetyum', world.contentsOfItem(dep1).some((i) => i.typeId === ESPADA) && !entrada(pj, ESPADA));

    llevar(pj, campamento);
    const sitio2 = casillaLibre(pj);
    cofre2 = world.createItem(world.depotItemId, 1, sitio2);
    world.addItemTo(pj, ORO, 40);
    buzon.length = 0;
    sesion.handle([P.CLIENT.USE_ITEM, sitio2.x, sitio2.y, sitio2.z]);
    const dep2 = world.depotOf(pj, cofre2);
    check('el cofre del campamento abre OTRO depósito, el de Puerto, vacío',
        dep2 && dep2 !== dep1 && dep2.townId === 2 && world.contentsOfItem(dep2).length === 0 &&
        ventanaDeContenedor(buzon, dep2.instanceId) !== null);
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: pj.inventory.indexOf(entrada(pj, ORO)) },
        { kind: P.MOVE_TO.GROUND_CONTAINER, id: dep2.instanceId });
    check('se guarda el oro en el de Puerto, y el de Jetyum sigue con su espada',
        world.contentsOfItem(dep2).some((i) => i.typeId === ORO && i.count === 40) &&
        world.contentsOfItem(dep1).length === 1 && world.contentsOfItem(dep1)[0].typeId === ESPADA);
    check('sin cofre, depotOf da el de su ciudad', world.depotOf(pj) === dep1);
    const guardado = world.depotSnapshot(pj);
    check('al guardar: los dos en `depositos`, y `deposito` es el de su ciudad',
        pj.depositos['1'].length === 1 && pj.depositos['2'].length === 1 && guardado === pj.deposito &&
        guardado[0].typeId === ESPADA, JSON.stringify(pj.depositos));
}

// ===========================================================================
section('2. El depósito de antes (uno solo) se carga como el de su ciudad');
// ===========================================================================
{
    const viejo = conectar('Vieja Guardia');
    const id = viejo.pj.characterId;
    viejo.sesion.close();
    const fila = db.db.prepare('SELECT progress FROM players WHERE id = ?').get(id);
    const progreso = JSON.parse(fila.progress);
    delete progreso.depositos;
    progreso.deposito = [{ typeId: ESPADA, count: 1, attributes: { actionId: 777 } },
        { typeId: MOCHILA, count: 1, attributes: null, contents: [{ typeId: ORO, count: 12, attributes: null }] }];
    db.db.prepare('UPDATE players SET progress = ? WHERE id = ?').run(JSON.stringify(progreso), id);

    const otra = conectar('Vieja Guardia');
    const dep = world.depotOf(otra.pj);
    const bolsa = world.contentsOfItem(dep).find((i) => i.typeId === MOCHILA);
    check('lo del depósito viejo está en el de su ciudad (Jetyum), con sus atributos y su árbol',
        dep.townId === 1 && world.contentsOfItem(dep).some((i) => i.typeId === ESPADA && i.attributes.actionId === 777) &&
        bolsa && world.contentsOfItem(bolsa).some((i) => i.typeId === ORO && i.count === 12));
    check('y el de Puerto está vacío', world.contentsOfItem(world.depotOf(otra.pj, null, 2)).length === 0);
    otra.sesion.close();
    const guardado = JSON.parse(db.db.prepare('SELECT progress FROM players WHERE id = ?').get(id).progress);
    check('al guardar pasa a `depositos` (y `deposito` queda como su copia)',
        guardado.depositos && guardado.depositos['1'].length === 2 && guardado.deposito.length === 2,
        JSON.stringify(guardado.depositos));
    const tercera = conectar('Vieja Guardia');
    check('y al volver no se duplica', world.contentsOfItem(world.depotOf(tercera.pj)).length === 2);
    tercera.sesion.close();
}

// Ana vuelve al templo, junto a un buzón.
llevar(ana.pj, templo);
const sitioBuzon = casillaLibre(ana.pj);
world.createItem(BUZON, 1, sitioBuzon);

// ===========================================================================
section('3. Escribir una carta');
// ===========================================================================
{
    const { pj, buzon } = ana;
    world.addItemTo(pj, CARTA, 1);
    const carta = entrada(pj, CARTA);
    buzon.length = 0;
    const { ventana, r } = escribir(ana, carta, 'Beto Correo\nPuerto\nTe mando esto desde Jetyum.');
    check('usar la carta abre una ventana para escribir de 500', ventana && ventana[2].editable === true &&
        ventana[2].maximo === 500 && ventana[2].titulo === 'letter' && ventana[2].texto === '', ventana ? JSON.stringify(ventana[2]) : '');
    check('lo guardado (TEXT_WINDOW_SAVE) queda en la carta', r && r.ok === true &&
        carta.attributes.text === 'Beto Correo\nPuerto\nTe mando esto desde Jetyum.');
    ana.sesion.handle([P.CLIENT.LOOK_ITEM, 'inventory', pj.inventory.indexOf(carta)]);
    const mirada = textos(buzon).pop();
    check('al mirarla se lee lo escrito', /Lees: «Beto Correo \/ Puerto \/ Te mando esto desde Jetyum\.»$/.test(mirada), mirada);
    escribir(ana, carta, 'Beto Correo\nPuerto\nHola otra vez.');
    const v2 = ventanasDeTexto(buzon).slice(-1)[0];
    check('al volver a usarla se abre con lo que tenía', carta.attributes.text === 'Beto Correo\nPuerto\nHola otra vez.' &&
        ventanasDeTexto(buzon).length === 2 && v2[2].texto === 'Beto Correo\nPuerto\nTe mando esto desde Jetyum.');
}

// ===========================================================================
section('4. A alguien que está dentro');
// ===========================================================================
let depBetoPuerto;
{
    // Beto, en el campamento con su depósito de Puerto abierto.
    llevar(beto.pj, campamento);
    const sitio = casillaLibre(beto.pj);
    world.createItem(world.depotItemId, 1, sitio);
    beto.sesion.handle([P.CLIENT.USE_ITEM, sitio.x, sitio.y, sitio.z]);
    depBetoPuerto = world.depotOf(beto.pj, null, 2);
    check('Beto tiene abierto su depósito de Puerto', ventanaDeContenedor(beto.buzon, depBetoPuerto.instanceId) !== null);

    const carta = entrada(ana.pj, CARTA);
    ana.buzon.length = 0;
    beto.buzon.length = 0;
    const r = echar(ana, carta, sitioBuzon);
    check('echar la carta en el buzón la manda', r.moved === true && !entrada(ana.pj, CARTA), JSON.stringify(r));
    const llegada = world.contentsOfItem(depBetoPuerto)[0];
    check('llega SELLADA al depósito de Puerto de Beto, con su texto y quién la manda',
        llegada && llegada.typeId === CARTA_SELLADA && llegada.attributes.text === 'Beto Correo\nPuerto\nHola otra vez.' &&
        llegada.attributes.sender === 'Ana Correo');
    check('a Ana se le dice', textos(ana.buzon).includes('Has enviado la carta a Beto Correo (Puerto).'), textos(ana.buzon).join(' | '));
    check('y a Beto también', textos(beto.buzon).includes('Te ha llegado correo nuevo.'));
    check('el buzón no se queda con nada', world.map.getTile(sitioBuzon.x, sitioBuzon.y, sitioBuzon.z).getItems()
        .every((i) => i.typeId !== CARTA && i.typeId !== CARTA_SELLADA));
    world.tick();
    const ventana = ventanaDeContenedor(beto.buzon, depBetoPuerto.instanceId);
    check('su ventana del depósito se pone al día sola', ventana && ventana.items[0].typeId === CARTA_SELLADA,
        ventana ? JSON.stringify(ventana.items.map((i) => i.typeId)) : 'sin ventana');
    check('y su depósito de Jetyum no ha recibido nada', world.contentsOfItem(world.depotOf(beto.pj, null, 1)).length === 0);

    // Usándola sobre el buzón (USE_WITH), y sin ciudad: va a la suya (Jetyum).
    const otra = cartaEscrita(ana, 'beto correo');
    ana.buzon.length = 0;
    ana.sesion.handle([P.CLIENT.USE_WITH, { inventario: ana.pj.inventory.indexOf(otra) }, { casilla: [sitioBuzon.x, sitioBuzon.y, sitioBuzon.z] }]);
    const enJetyum = world.contentsOfItem(world.depotOf(beto.pj, null, 1));
    check('usada sobre el buzón también se manda; sin ciudad, a la de quien la recibe',
        !entrada(ana.pj, CARTA) && enJetyum.length === 1 && enJetyum[0].typeId === CARTA_SELLADA &&
        textos(ana.buzon).includes('Has enviado la carta a Beto Correo (Jetyum).'), textos(ana.buzon).join(' | '));
}

// ===========================================================================
section('5. A alguien que no está');
// ===========================================================================
{
    const cris = conectar('Cris Ausente');
    const id = cris.pj.characterId;
    cris.sesion.close();
    const carta = cartaEscrita(ana, 'Cris Ausente\nPuerto\nTe espero.');
    ana.buzon.length = 0;
    const r = echar(ana, carta, sitioBuzon);
    const filas = db.listMail(id);
    check('se manda igual', r.moved === true && !entrada(ana.pj, CARTA) &&
        textos(ana.buzon).includes('Has enviado la carta a Cris Ausente (Puerto).'));
    check('y espera en player_mail, con su ciudad, quién la manda y el árbol', filas.length === 1 && filas[0].townId === 2 &&
        filas[0].sender === 'Ana Correo' && filas[0].item.typeId === CARTA_SELLADA && filas[0].item.attributes.text === 'Cris Ausente\nPuerto\nTe espero.' &&
        filas[0].time === Math.floor(reloj / 1000) * 1000, JSON.stringify(filas[0]));

    const vuelve = conectar('Cris Ausente');
    const dep = world.depotOf(vuelve.pj, null, 2);
    check('al entrar se le dice que tiene correo', textos(vuelve.buzon).includes('Tienes correo nuevo.'), textos(vuelve.buzon).join(' | '));
    check('y está en su depósito de Puerto', world.contentsOfItem(dep).some((i) => i.typeId === CARTA_SELLADA &&
        i.attributes.text === 'Cris Ausente\nPuerto\nTe espero.'));
    check('y la fila ya no está', db.listMail(id).length === 0);
    const progreso = JSON.parse(db.db.prepare('SELECT progress FROM players WHERE id = ?').get(id).progress);
    check('ya está guardado con el personaje (antes de borrar la fila)', progreso.depositos && progreso.depositos['2'] &&
        progreso.depositos['2'][0].typeId === CARTA_SELLADA, JSON.stringify(progreso.depositos));
    vuelve.sesion.close();
    const otraVez = conectar('Cris Ausente');
    check('volver a entrar no lo entrega otra vez', !textos(otraVez.buzon).includes('Tienes correo nuevo.') &&
        world.contentsOfItem(world.depotOf(otraVez.pj, null, 2)).length === 1);
    otraVez.sesion.close();
}

// ===========================================================================
section('6. Lo que no se manda');
// ===========================================================================
{
    const probar = (texto, esperado, etiqueta) => {
        const carta = cartaEscrita(ana, texto);
        ana.buzon.length = 0;
        const r = echar(ana, carta, sitioBuzon);
        check(etiqueta, r.moved === false && r.reason === 'mailFailed' && entrada(ana.pj, CARTA) === carta &&
            carta.attributes.text === texto && textos(ana.buzon).includes(esperado), textos(ana.buzon).join(' | '));
        world.consumeEntry(ana.pj, carta, 1);
    };
    probar('', 'Esa carta no dice a quién va: escribe su nombre en la primera línea.', 'sin nombre: se queda donde estaba y lo dice');
    probar('Nadie Existe\nPuerto', 'No existe ningun personaje llamado «Nadie Existe».', 'a quien no existe: tampoco');
    probar('Beto Correo\nAtlantis', 'No existe la ciudad «Atlantis».', 'a una ciudad que no existe: tampoco');

    world.addItemTo(ana.pj, MOCHILA, 1);
    const bolsa = ana.pj.inventory.filter((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE).pop();
    const r = echar(ana, bolsa, sitioBuzon);
    check('lo que no es correo no entra en el buzón (ocupa la casilla)', r.moved === false && r.reason === 'notEnoughRoom' &&
        ana.pj.inventory.includes(bolsa));
    world.consumeEntry(ana.pj, bolsa, 1);

    world.addItemTo(ana.pj, PAQUETE, 1);
    const paquete = entrada(ana.pj, PAQUETE);
    ana.buzon.length = 0;
    const r2 = echar(ana, paquete, sitioBuzon);
    check('un paquete sin etiqueta no se manda', r2.moved === false && ana.pj.inventory.includes(paquete) &&
        textos(ana.buzon).includes('Ese paquete no lleva etiqueta: mete dentro una etiqueta con el nombre de quien lo recibe.'),
    textos(ana.buzon).join(' | '));
    world.consumeEntry(ana.pj, paquete, 1);
    check('la base no ha apuntado nada de esto', db.db.prepare('SELECT COUNT(*) AS n FROM player_mail').get().n === 0);
}

// ===========================================================================
section('7. Un paquete con etiqueta y una bolsa dentro');
// ===========================================================================
{
    const { pj } = ana;
    world.addItemTo(pj, PAQUETE, 1);
    world.addItemTo(pj, ETIQUETA, 1);
    const paquete = entrada(pj, PAQUETE);
    const etiqueta = entrada(pj, ETIQUETA);
    const { ventana } = escribir(ana, etiqueta, 'Beto Correo\nPuerto');
    check('la etiqueta se escribe (100 como mucho)', ventana && ventana[2].maximo === 100 && etiqueta.attributes.text === 'Beto Correo\nPuerto');
    // La etiqueta, soltada encima del paquete, entra en él.
    mover(ana.sesion, { kind: P.MOVE_FROM.INVENTORY, index: pj.inventory.indexOf(etiqueta) },
        { kind: P.MOVE_TO.INVENTORY, index: pj.inventory.indexOf(paquete) });
    // Y una mochila con oro y una espada con su actionId.
    world.addItemToEntry(pj, paquete, MOCHILA, 1);
    const bolsa = paquete.contents.find((x) => x.typeId === MOCHILA);
    world.addItemToEntry(pj, bolsa, ORO, 77);
    world.addItemToEntry(pj, bolsa, ESPADA, 1, { actionId: 4242 });
    check('el paquete lleva la etiqueta y la bolsa, y la bolsa lo suyo', paquete.contents.length === 2 &&
        bolsa.contents.length === 2, JSON.stringify(paquete.contents.map((x) => x.typeId)));

    ana.buzon.length = 0;
    const antes = world.contentsOfItem(depBetoPuerto).length;
    const r = echar(ana, paquete, sitioBuzon);
    const llegado = world.contentsOfItem(depBetoPuerto)[0];
    const dentro = llegado ? world.contentsOfItem(llegado) : [];
    const bolsa2 = dentro.find((i) => i.typeId === MOCHILA);
    const etiqueta2 = dentro.find((i) => i.typeId === ETIQUETA);
    check('se manda', r.moved === true && !entrada(pj, PAQUETE) && textos(ana.buzon).includes('Has enviado el paquete a Beto Correo (Puerto).'),
        textos(ana.buzon).join(' | '));
    check('llega sellado al depósito de Puerto de Beto, delante de lo que había', llegado && llegado.typeId === PAQUETE_SELLADO &&
        world.contentsOfItem(depBetoPuerto).length === antes + 1);
    check('con la etiqueta escrita dentro', etiqueta2 && etiqueta2.attributes.text === 'Beto Correo\nPuerto');
    check('y la bolsa con su oro y su espada (con su actionId)', bolsa2 &&
        world.contentsOfItem(bolsa2).some((i) => i.typeId === ORO && i.count === 77) &&
        world.contentsOfItem(bolsa2).some((i) => i.typeId === ESPADA && i.attributes.actionId === 4242));
    check('y lo de dentro está en el mundo, colgando del depósito', bolsa2 && world.posicionDeObjeto(bolsa2) !== null &&
        world.items.get(bolsa2.instanceId) === bolsa2);
}

// ===========================================================================
section('8. Al salir y volver a entrar');
// ===========================================================================
{
    beto.sesion.close();
    const otra = conectar('Beto Correo');
    const puerto = world.contentsOfItem(world.depotOf(otra.pj, null, 2));
    const jetyum = world.contentsOfItem(world.depotOf(otra.pj, null, 1));
    const paquete = puerto.find((i) => i.typeId === PAQUETE_SELLADO);
    const bolsa = paquete ? world.contentsOfItem(paquete).find((i) => i.typeId === MOCHILA) : null;
    check('el depósito de Puerto trae la carta y el paquete', puerto.length === 2 &&
        puerto.some((i) => i.typeId === CARTA_SELLADA && i.attributes.sender === 'Ana Correo') && !!paquete);
    check('el paquete con su etiqueta y la bolsa con lo suyo', paquete && bolsa &&
        world.contentsOfItem(paquete).some((i) => i.typeId === ETIQUETA && i.attributes.text === 'Beto Correo\nPuerto') &&
        world.contentsOfItem(bolsa).length === 2);
    check('y el de Jetyum, la otra carta', jetyum.length === 1 && jetyum[0].typeId === CARTA_SELLADA);

    // La carta sellada se lee (y no se escribe).
    world.addItemTo(otra.pj, CARTA_SELLADA, 1, { text: 'Hola, Beto.', sender: 'Ana Correo' });
    otra.buzon.length = 0;
    otra.sesion.handle([P.CLIENT.USE_INVENTORY, otra.pj.inventory.indexOf(entrada(otra.pj, CARTA_SELLADA))]);
    const v = ventanasDeTexto(otra.buzon).pop();
    check('la carta sellada se lee en una ventana que no se escribe', v && v[2].editable === false &&
        v[2].texto === 'Hola, Beto.' && v[2].titulo === 'Carta de Ana Correo', v ? JSON.stringify(v[2]) : '');
    const sellada = entrada(otra.pj, CARTA_SELLADA);
    otra.buzon.length = 0;
    const r = echar(otra, sellada, sitioBuzon);
    check('y no se vuelve a mandar', r.moved === false && otra.pj.inventory.includes(sellada));
    otra.sesion.close();
}

// ===========================================================================
section('9. entregarEnDeposito (lo usan las casas)');
// ===========================================================================
{
    const fila = db.findCharacterForMail('beto correo');
    const espada = { typeId: ESPADA, count: 1, attributes: { actionId: 99 } };
    check('a alguien que no está, por su id y a una ciudad: espera en la base',
        world.entregarEnDeposito(fila.id, espada, { townId: 1, remitente: 'Casa 7' }) === true &&
        db.listMail(fila.id).length === 1 && db.listMail(fila.id)[0].sender === 'Casa 7');
    espada.attributes.actionId = 1;
    check('lo que se pasa se copia (cambiarlo luego no cambia lo entregado)', db.listMail(fila.id)[0].item.attributes.actionId === 99);
    check('a quien no existe, false', world.entregarEnDeposito('Nadie Existe', espada) === false);
    check('a una ciudad que no existe, false', world.entregarEnDeposito('Beto Correo', espada, { townId: 99 }) === false);
    check('un objeto que no existe, false', world.entregarEnDeposito('Beto Correo', { typeId: 999999, count: 1 }) === false);
    ana.buzon.length = 0;
    check('a alguien que está, por su nombre y sin aviso: a su depósito ya', world.entregarEnDeposito('ana correo',
        { typeId: MOCHILA, count: 1, attributes: null, contents: [{ typeId: ORO, count: 5, attributes: null }] },
        { townId: 2, aviso: false }) === true &&
        world.contentsOfItem(world.depotOf(ana.pj, null, 2))[0].typeId === MOCHILA && !textos(ana.buzon).includes('Te ha llegado correo nuevo.'));
    const otra = conectar('Beto Correo');
    check('y lo que esperaba le llega al entrar, a la ciudad pedida', world.contentsOfItem(world.depotOf(otra.pj, null, 1))
        .some((i) => i.typeId === ESPADA && i.attributes.actionId === 99) && db.listMail(fila.id).length === 0);
    otra.sesion.close();
}

// ===========================================================================
section('10. El Tendero lo vende');
// ===========================================================================
{
    const tendero = world.getNpc('Tendero');
    const lista = world.npcShopList(tendero);
    const precio = (id) => (lista.find((o) => o.typeId === id) || {}).buy;
    check('carta 8, paquete 15 y etiqueta 1, como en Tibia', precio(CARTA) === 8 && precio(PAQUETE) === 15 && precio(ETIQUETA) === 1,
        [precio(CARTA), precio(PAQUETE), precio(ETIQUETA)].join(', '));
    world.darDinero(ana.pj, 100);
    const r = world.buyFromNpc(ana.pj, tendero, PAQUETE, 1);
    check('y se compra un paquete', r.ok === true && !!entrada(ana.pj, PAQUETE), JSON.stringify(r));
    llevar(ana.pj, { x: tendero.position.x + 1, y: tendero.position.y, z: tendero.position.z });
    reloj += 1000;
    tendero.hear(ana.pj, 'hola', reloj);
    reloj += 1000;
    tendero.hear(ana.pj, 'carta', reloj);
    const dicho = tendero.lastSaid;
    reloj += 1000;
    tendero.hear(ana.pj, 'comprar carta', reloj);
    check('«carta» cuenta cómo se manda, y «comprar carta» la vende', /^Vendo cartas, paquetes y etiquetas\./.test(dicho) &&
        !!entrada(ana.pj, CARTA), dicho);
    tendero.clearFocus();
    llevar(ana.pj, templo);
}

// ===========================================================================
section('11. En inglés');
// ===========================================================================
{
    const I = await import('../shared/js/i18n.mjs');
    await import('../shared/i18n/juego.mjs');
    const correo = (await import('../shared/i18n/en/correo.mjs')).default;
    check('el diccionario correo.mjs no tiene problemas', I.problemasDeDiccionario(correo).length === 0,
        I.problemasDeDiccionario(correo).slice(0, 3).join(' | '));
    const casos = [
        ['Te ha llegado correo nuevo.', 'New mail has arrived.'],
        ['Tienes correo nuevo.', 'You have new mail.'],
        ['Has enviado la carta a Beto Correo (Puerto).', 'You sent the letter to Beto Correo (Puerto).'],
        ['Has enviado el paquete a Beto Correo (Puerto).', 'You sent the parcel to Beto Correo (Puerto).'],
        ['No existe la ciudad «Atlantis».', 'There is no town called «Atlantis».'],
        ['No existe ningun personaje llamado «Nadie Existe».', 'There is no character called «Nadie Existe».'],
        ['Ese paquete lleva demasiados contenedores unos dentro de otros: como mucho 8.',
            'That parcel has too many containers inside one another: 8 at most.'],
        ['Carta de Ana Correo', 'Letter from Ana Correo'],
        ['Vendo cartas, paquetes y etiquetas. Escribe en la primera linea el nombre de quien lo recibe y en la segunda ' +
            'su ciudad, y echalo en un buzon: le llega al deposito.', "I sell letters, parcels and labels. Write the " +
            "recipient's name on the first line and their town on the second, and drop it into a mailbox: it arrives at their depot."],
        ['Ves a letter. Pesa 0.50 oz. Lees: «Beto Correo / Puerto»', 'You see a letter. It weighs 0.50 oz. You read: «Beto Correo / Puerto»']
    ];
    casos.forEach(([es, en]) => {
        const t = I.traducir(es, 'en');
        check('«' + es.slice(0, 50) + '» se traduce', t === en, t);
    });
    const mirada = (() => {
        const carta = cartaEscrita(ana, 'Beto Correo\nPuerto');
        ana.buzon.length = 0;
        ana.sesion.handle([P.CLIENT.LOOK_ITEM, 'inventory', ana.pj.inventory.indexOf(carta)]);
        return textos(ana.buzon).pop();
    })();
    check('y lo que se ve al mirar una carta escrita, entero', I.traducir(mirada, 'en') !== mirada &&
        /You read: «Beto Correo \/ Puerto»$/.test(I.traducir(mirada, 'en')), I.traducir(mirada, 'en'));
}

ana.sesion.close();
e.shutdown();
try {
    fs.rmSync(carpeta, { recursive: true, force: true });
} catch (error) {
    // Windows a veces tarda en soltar el archivo: se queda en la carpeta temporal.
}

console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — cada ciudad tiene su depósito y el correo llega, esté quien esté.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
