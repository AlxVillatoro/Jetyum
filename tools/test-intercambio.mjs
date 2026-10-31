/**
 * PRUEBAS DEL INTERCAMBIO ENTRE JUGADORES (el «Trade with...» de Tibia): `engine/world/intercambio.js`
 * y los mensajes `CLIENT.TRADE_*` / `SERVER.TRADE`, `SERVER.TRADE_CLOSE`.
 *
 *     node tools/test-intercambio.mjs
 *
 * Con el motor de verdad, el mapa `jetyum` y una base de datos TEMPORAL; cada jugador es una sesión
 * con su buzón, como un cliente:
 *
 *   1. las reglas al ofrecer: contigo mismo, la distancia, lo que no se puede comerciar (el depósito,
 *      un objeto único, lo que no se coge), más de 100 objetos y quien ya está comerciando
 *   2. ofrecer y contestar: la invitación, las dos ventanas y un contenedor en lista plana
 *   3. mirar un objeto de cualquiera de las dos ofertas
 *   4. aceptar los dos y cambiar: una bolsa con otra dentro (y lo suyo) por una espada
 *   5. no cabe: sin capacidad o sin sitio, se cancela y no se mueve nada
 *   6. se cancela al mover lo ofrecido, al usarlo, al alejarse, al teletransportarse, al morir y al
 *      salir del juego; y al cerrar la ventana
 *   7. del suelo: ofrecer lo que hay en una casilla de al lado
 *   8. los scripts: `onTradeRequest` y `onTradeAccept` (con `false`, no), y `player:isTrading()`
 *   9. lo que se dice, en inglés
 *  10. el cliente: lo que lee de los mensajes y lo que manda (client/jetyum/js/intercambio.js)
 *  11. la mochila puesta también se puede ofrecer: el otro la recibe con todo lo de dentro
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
const { TEXTOS_INTERCAMBIO: T } = require('../engine/world/intercambio.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

const MOCHILA = 2412;      // backpack, 20 huecos
const ESPADA = 2400;       // magic sword (42 oz)
const ORO = 3031;          // gold coin
const CAJON = 99911;       // un contenedor de 200 huecos, hecho para la prueba (más de 100 objetos)

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-intercambio-'));
const e = createEngine({
    rootDir: ROOT,
    logLevel: 'error',
    overrides: { mapName: 'jetyum', mapFile: null, useDatabase: true, databaseFile: path.join(carpeta, 'intercambio.db') }
});
const world = e.world;

let reloj = 70000000;
world.now = () => reloj;
e.scheduler.now = () => reloj;

{
    const base = world.itemTypes.get(MOCHILA);
    const attributes = { ...base.attributes, containerSize: 200 };
    delete attributes.slotType;
    world.itemTypes.set(CAJON, { ...base, id: CAJON, name: 'cajon', attributes });
}

e.repository.createAccount('Mercado', 'clave-trato');
function conectar(nombre) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    const r = sesion.login({ account: 'Mercado', password: 'clave-trato', character: nombre, crear: true, vocation: 'Knight' });
    if (!r.handled || !sesion.player) {
        throw new Error('no entra ' + nombre + ': ' + JSON.stringify(r));
    }
    return { sesion, buzon, pj: sesion.player };
}
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]);
const dijo = (j, texto) => textos(j.buzon).includes(texto);
const ventanas = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TRADE).map((m) => m[1]);
const ultimaVentana = (j) => ventanas(j.buzon).pop() || null;
const cerradas = (j) => j.buzon.filter((m) => m[0] === P.SERVER.TRADE_CLOSE).length;
const decir = (texto, huecos) => Object.keys(huecos || {}).reduce((t, k) => t.split('{' + k + '}').join(huecos[k]), texto);
const limpiar = (...js) => js.forEach((j) => { j.buzon.length = 0; });

/** Ofrecer: `[TRADE_REQUEST, origen, id]`, como el cliente. */
const ofrecer = (j, origen, otro) => j.sesion.handle([P.CLIENT.TRADE_REQUEST, origen, otro.pj.id]);
const aceptar = (j) => j.sesion.handle([P.CLIENT.TRADE_ACCEPT]);
const cancelar = (j) => j.sesion.handle([P.CLIENT.TRADE_CLOSE]);
const indiceDe = (pj, typeId, slot) => pj.inventory.findIndex((x) => x.typeId === typeId && (!slot || x.slot === slot));

/** UNA FILA DE CINCO CASILLAS libres en la misma planta, para poner a cada uno donde haga falta. */
const templo = world.map.getWaypoint('temple');
const fila = (() => {
    for (let r = 0; r < 60; r += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
            const x0 = templo.x + dx;
            const y0 = templo.y + r;
            const libres = [0, 1, 2, 3, 4].every((i) => {
                const t = world.map.getTile(x0 + i, y0, templo.z);
                return t && world.map.isWalkable(x0 + i, y0, templo.z) && t.creatures.length === 0 &&
                    world._canHoldItems(x0 + i, y0 + 1, templo.z);
            });
            if (libres) {
                return [0, 1, 2, 3, 4].map((i) => ({ x: x0 + i, y: y0, z: templo.z }));
            }
        }
    }
    throw new Error('no hay cinco casillas libres seguidas');
})();
const poner = (j, i) => world.teleportCreature(j.pj, fila[i]);

/** Vacía lo de la mochila (lo `inside`) y le pone lo que se diga. */
function vaciar(pj) {
    pj.inventory = pj.inventory.filter((x) => x.slot !== P.SLOT_INSIDE && x.slot !== 'hand');
    world._reindexInventory(pj.inventory);
    world.recomputeEquipment(pj);
}

const ana = conectar('Ana Tratos');
const beto = conectar('Beto Tratos');
const cris = conectar('Cris Tratos');
poner(ana, 0);
poner(beto, 1);
poner(cris, 4);

// ===========================================================================
section('1. Las reglas al ofrecer');
// ===========================================================================
{
    vaciar(ana.pj);
    world.giveItem(ana.pj, ESPADA, 1);
    const iEspada = indiceDe(ana.pj, ESPADA);

    limpiar(ana);
    let r = ofrecer(ana, { inventario: iEspada }, ana);
    check('contigo mismo no', r.ok === false && r.reason === 'self' && dijo(ana, T.contigo), textos(ana.buzon).join(' | '));

    limpiar(ana);
    r = ofrecer(ana, { inventario: iEspada }, cris);
    check('a más de dos casillas: «Cris te pide que te acerques.»', r.reason === 'tooFar' &&
        dijo(ana, decir(T.acercate, { nombre: 'Cris Tratos' })), textos(ana.buzon).join(' | '));

    limpiar(ana);
    r = ana.sesion.handle([P.CLIENT.TRADE_REQUEST, { inventario: iEspada }, 999999]);
    check('con alguien que no está, no', r.reason === 'noPlayer' && dijo(ana, T.noEsta));

    limpiar(ana);
    r = ofrecer(ana, { inventario: 77 }, beto);
    check('algo que no llevas, no', r.reason === 'noItem' && dijo(ana, T.noTienes));

    // Un objeto con uniqueId (de una misión) no cambia de manos.
    world.giveItem(ana.pj, ORO, 5);
    const oro = ana.pj.inventory[indiceDe(ana.pj, ORO)];
    oro.attributes = { uniqueId: 4321 };
    limpiar(ana);
    r = ofrecer(ana, { inventario: indiceDe(ana.pj, ORO) }, beto);
    check('un objeto con uniqueId, no', r.reason === 'notTradeable' && dijo(ana, T.noSePuede));
    oro.attributes = null;

    // El cofre del depósito, en el suelo a su lado, no se puede comerciar.
    const cofre = world.createItem(world.depotItemId, 1, { x: fila[0].x, y: fila[0].y + 1, z: fila[0].z });
    limpiar(ana);
    r = ofrecer(ana, { suelo: [cofre.position.x, cofre.position.y, cofre.position.z] }, beto);
    check('el cofre del depósito, no', r.ok === false && (r.reason === 'notTradeable' || r.reason === 'noItem'), r.reason);
    world.removeItem(cofre.instanceId);

    // Ni el depósito mismo: no es algo que se coja.
    const deposito = world.depotOf(ana.pj, null);
    check('(el depósito es un contenedor del mundo que no se coge)', deposito && world._sePuedeComerciar({ item: deposito }) === false);

    // Más de 100 objetos: un cajón con 100 espadas dentro son 101.
    ana.pj.inventory.push({ slot: P.SLOT_INSIDE, position: ana.pj.inventory.length, typeId: CAJON, count: 1, attributes: null,
        contents: Array.from({ length: 100 }, (_, i) => ({ slot: P.SLOT_INSIDE, position: i, typeId: ORO, count: 1, attributes: null })) });
    limpiar(ana);
    r = ofrecer(ana, { inventario: indiceDe(ana.pj, CAJON) }, beto);
    check('un contenedor con más de 100 objetos (contándolo a él), no', r.reason === 'tooManyItems' && dijo(ana, T.demasiados),
        textos(ana.buzon).join(' | '));
    ana.pj.inventory.splice(indiceDe(ana.pj, CAJON), 1);
    world._reindexInventory(ana.pj.inventory);

    // Ocupados.
    limpiar(ana, beto, cris);
    r = ofrecer(ana, { inventario: indiceDe(ana.pj, ESPADA) }, beto);
    check('Ana ofrece la espada a Beto', r.ok === true && world.estaComerciando(ana.pj) && world.estaComerciando(beto.pj));
    poner(cris, 2);
    world.giveItem(cris.pj, ORO, 10);
    limpiar(cris);
    r = ofrecer(cris, { inventario: indiceDe(cris.pj, ORO) }, beto);
    check('Cris no puede ofrecer nada a Beto: «Ese jugador ya está comerciando.»', r.reason === 'partnerTrading' &&
        dijo(cris, T.yaComercia));
    r = ofrecer(cris, { inventario: indiceDe(cris.pj, ORO) }, ana);
    check('ni a Ana', r.reason === 'partnerTrading');
    limpiar(ana);
    r = ofrecer(ana, { inventario: indiceDe(ana.pj, ORO) }, cris);
    check('y Ana, que ya ofreció algo, no puede ofrecer otra cosa: «Ya estás comerciando.»', r.reason === 'alreadyTrading' &&
        dijo(ana, T.yaComercias));
    limpiar(ana, beto);
    cancelar(ana);
    check('al cancelar quedan libres los dos, con «Intercambio cancelado.»', !world.estaComerciando(ana.pj) &&
        !world.estaComerciando(beto.pj) && dijo(ana, T.cancelado) && dijo(beto, T.cancelado) && cerradas(ana) === 1);
    poner(cris, 4);
}

// ===========================================================================
section('2. Ofrecer y contestar');
// ===========================================================================
let bolsaDeBeto;
{
    vaciar(ana.pj);
    vaciar(beto.pj);
    world.giveItem(ana.pj, ESPADA, 1);
    // Beto: una mochila con otra dentro, y en la de dentro 30 de oro y una espada.
    world.giveItem(beto.pj, MOCHILA, 1);
    bolsaDeBeto = beto.pj.inventory[indiceDe(beto.pj, MOCHILA, P.SLOT_INSIDE)];
    world.addItemToEntry(beto.pj, bolsaDeBeto, MOCHILA, 1);
    const dentro = bolsaDeBeto.contents[0];
    world.addItemToEntry(beto.pj, dentro, ORO, 30);
    world.addItemToEntry(beto.pj, dentro, ESPADA, 1);
    world.addItemToEntry(beto.pj, bolsaDeBeto, ORO, 7);

    limpiar(ana, beto);
    const r = ofrecer(ana, { inventario: indiceDe(ana.pj, ESPADA) }, beto);
    const va = ultimaVentana(ana);
    check('Ana ve su oferta (la espada) y aún no la de Beto', r.ok && va && va.companero === 'Beto Tratos' &&
        va.tuya.length === 1 && va.tuya[0].typeId === ESPADA && va.suya === null && !va.aceptaste && !va.acepto,
        JSON.stringify(va));
    check('Beto recibe «Ana Tratos quiere comerciar contigo.» y todavía no tiene ventana',
        dijo(beto, decir(T.quiere, { nombre: 'Ana Tratos' })) && ventanas(beto.buzon).length === 0);

    limpiar(ana, beto);
    const r2 = ofrecer(beto, { inventario: beto.pj.inventory.indexOf(bolsaDeBeto) }, ana);
    const vb = ultimaVentana(beto);
    const va2 = ultimaVentana(ana);
    check('Beto contesta con su mochila: ahora los dos ven las dos ofertas', r2.ok && r2.counter === true &&
        vb && va2 && vb.suya.length === 1 && va2.suya && va2.suya.length === 5);
    check('la mochila se ve en LISTA PLANA, por niveles como en TFS: mochila, [mochila, oro], [oro, espada]',
        JSON.stringify(va2.suya.map((x) => [x.typeId, x.count])) ===
        JSON.stringify([[MOCHILA, 1], [MOCHILA, 1], [ORO, 7], [ORO, 30], [ESPADA, 1]]), JSON.stringify(va2.suya.map((x) => x.typeId)));
    check('cada objeto con su nombre para el cliente', va2.suya[4].name === 'magic sword');

    // ===========================================================================
    section('3. Mirar un objeto de cualquiera de las dos ofertas');
    // ===========================================================================
    limpiar(ana);
    let m = ana.sesion.handle([P.CLIENT.TRADE_LOOK, 1, 3]);
    check('Ana mira el oro de dentro de la bolsa de Beto: «Ves 30 gold coin.»', m.handled && /^Ves 30 gold coin/.test(m.text),
        m.text);
    m = ana.sesion.handle([P.CLIENT.TRADE_LOOK, 0, 0]);
    check('y su propia espada, con sus números', m.handled && /magic sword \(Ataque 48, Defensa 35\)/.test(m.text), m.text);
    m = beto.sesion.handle([P.CLIENT.TRADE_LOOK, 1, 0]);
    check('Beto mira la espada de Ana', m.handled && /magic sword/.test(m.text));
    m = ana.sesion.handle([P.CLIENT.TRADE_LOOK, 1, 99]);
    check('un índice que no existe no dice nada', m.handled === false);

    // ===========================================================================
    section('4. Aceptar los dos y cambiar');
    // ===========================================================================
    limpiar(ana, beto);
    const a1 = aceptar(ana);
    check('Ana acepta: todavía no se cambia, y los dos ven que ella ya aceptó', a1.ok && a1.completed === false &&
        ultimaVentana(ana).aceptaste === true && ultimaVentana(beto).acepto === true && ultimaVentana(beto).aceptaste === false);
    const pesoAna = world.weightOf(ana.pj);
    const pesoBeto = world.weightOf(beto.pj);
    limpiar(ana, beto);
    const a2 = aceptar(beto);
    check('Beto acepta: se cambian', a2.ok && a2.completed === true && dijo(ana, T.hecho) && dijo(beto, T.hecho) &&
        cerradas(ana) === 1 && cerradas(beto) === 1, textos(ana.buzon).join(' | '));
    check('los dos quedan libres', !world.estaComerciando(ana.pj) && !world.estaComerciando(beto.pj));
    const recibida = ana.pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    check('Ana tiene la mochila de Beto, CON su mochila de dentro y todo lo suyo', recibida === bolsaDeBeto &&
        recibida.contents.length === 2 && recibida.contents[0].typeId === MOCHILA &&
        recibida.contents[0].contents.map((x) => x.typeId).join() === [ORO, ESPADA].join(),
        JSON.stringify(world.contenidoParaGuardar([recibida])));
    check('y ya no tiene la espada suelta', indiceDe(ana.pj, ESPADA) === -1);
    check('Beto tiene la espada de Ana (en su mochila) y no la mochila', indiceDe(beto.pj, ESPADA, P.SLOT_INSIDE) !== -1 &&
        !beto.pj.inventory.some((x) => x === bolsaDeBeto));
    check('el peso viaja con ellos', world.weightOf(ana.pj) === pesoAna - world.weightOfItem(ESPADA, 1) +
        world.pesoDeEntrada(bolsaDeBeto) && world.weightOf(beto.pj) === pesoBeto - world.pesoDeEntrada(bolsaDeBeto) +
        world.weightOfItem(ESPADA, 1));
    check('a los dos les llega el inventario nuevo', ana.buzon.some((m2) => m2[0] === P.SERVER.INVENTORY) &&
        beto.buzon.some((m2) => m2[0] === P.SERVER.INVENTORY));
    limpiar(ana);
    check('aceptar sin intercambio no hace nada', aceptar(ana).ok === false);
}

// ===========================================================================
section('5. No cabe: se cancela y no se mueve nada');
// ===========================================================================
{
    vaciar(ana.pj);
    vaciar(beto.pj);
    world.giveItem(ana.pj, ESPADA, 1);
    world.giveItem(beto.pj, ORO, 3);
    ofrecer(ana, { inventario: indiceDe(ana.pj, ESPADA) }, beto);
    ofrecer(beto, { inventario: indiceDe(beto.pj, ORO) }, ana);
    // Beto, cargado hasta arriba: le quedan 5 oz.
    const capacidad = world.capacityOf;
    world.capacityOf = (c) => (c === beto.pj ? world.weightOf(beto.pj) + 500 : capacidad.call(world, c));
    limpiar(ana, beto);
    aceptar(ana);
    const r = aceptar(beto);
    world.capacityOf = capacidad;
    check('Beto no puede con la espada: no se cambia nada', r.ok === false && r.reason === 'tooHeavy' &&
        indiceDe(ana.pj, ESPADA) !== -1 && indiceDe(beto.pj, ORO) !== -1 && indiceDe(beto.pj, ESPADA) === -1);
    const aviso = textos(beto.buzon).find((t) => t.startsWith('No tienes capacidad suficiente'));
    check('Beto sabe por qué: «No tienes capacidad suficiente para llevar a magic sword: pesa 42.00 oz…»',
        !!aviso && /pesa 42\.00 oz/.test(aviso), aviso);
    check('Ana, que Beto no puede llevarlo; y los dos, «Intercambio cancelado.»',
        dijo(ana, decir(T.otroNoPuede, { nombre: 'Beto Tratos' })) && dijo(ana, T.cancelado) && dijo(beto, T.cancelado) &&
        !world.estaComerciando(ana.pj));

    // Sin sitio: la mochila de Ana, llena (20 huecos), y nada que se pueda poner.
    vaciar(ana.pj);
    world.giveItem(ana.pj, ESPADA, 1);
    for (let i = 0; i < 19; i += 1) {
        world.giveItem(ana.pj, MOCHILA, 1);
    }
    ana.pj.inventory.filter((x) => x.slot === 'hand').forEach((x) => { x.slot = P.SLOT_INSIDE; });
    vaciar(beto.pj);
    world.giveItem(beto.pj, ORO, 3);
    world.giveItem(beto.pj, ESPADA, 1);
    beto.pj.inventory.push({ slot: 'hand', position: beto.pj.inventory.length, typeId: ESPADA, count: 1, attributes: null });
    world.recomputeEquipment(beto.pj);
    // Ana ofrece una mochila VACÍA de dentro de la suya (deja un hueco), Beto su oro: cabe.
    const iBolsa = ana.pj.inventory.findIndex((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    ofrecer(ana, { inventario: iBolsa }, beto);
    ofrecer(beto, { inventario: indiceDe(beto.pj, ORO) }, ana);
    aceptar(ana);
    let r2 = aceptar(beto);
    check('con la mochila llena, lo que das deja su hueco: cabe el oro', r2.ok === true && indiceDe(ana.pj, ORO) !== -1,
        JSON.stringify(r2));
    // Ahora SIN NINGÚN HUECO: la mochila llena de bolsas llenas, la mano ocupada, y lo que Ana ofrece
    // está en el suelo (no deja hueco en lo que lleva).
    vaciar(ana.pj);
    for (let i = 0; i < 20; i += 1) {
        world.giveItem(ana.pj, MOCHILA, 1);
    }
    ana.pj.inventory.push({ slot: 'hand', position: ana.pj.inventory.length, typeId: ESPADA, count: 1, attributes: null });
    world.recomputeEquipment(ana.pj);
    const primera = ana.pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    ana.pj.inventory.filter((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE).forEach((b) => {
        b.contents = Array.from({ length: 20 }, (_, i) => ({ slot: P.SLOT_INSIDE, position: i, typeId: ORO, count: 100, attributes: null }));
    });
    const capacidad2 = world.capacityOf;
    world.capacityOf = () => 1e9;
    const moneda = primera.contents[0];
    const casilla = { x: fila[0].x, y: fila[0].y + 1, z: fila[0].z };
    world.createItem(ORO, 9, casilla);
    limpiar(ana, beto);
    ofrecer(ana, { suelo: [casilla.x, casilla.y, casilla.z] }, beto);
    ofrecer(beto, { inventario: indiceDe(beto.pj, ESPADA, P.SLOT_INSIDE) }, ana);
    aceptar(beto);
    r2 = aceptar(ana);
    world.capacityOf = capacidad2;
    check('sin sitio en ninguna bolsa ni ranura libre: «No tienes sitio para llevar a magic sword.»', r2.ok === false &&
        r2.reason === 'noRoom' && dijo(ana, decir(T.sinSitio, { objeto: 'a magic sword' })) && primera.contents[0] === moneda &&
        world.countOf(beto.pj, ORO) === 0, textos(ana.buzon).join(' | '));
    world.map.getTile(casilla.x, casilla.y, casilla.z).getItems().filter((it) => it.typeId === ORO)
        .forEach((it) => world.removeItem(world.adoptItem(it)));
}

// ===========================================================================
section('6. Se cancela');
// ===========================================================================
{
    const empezar = () => {
        vaciar(ana.pj);
        vaciar(beto.pj);
        world.giveItem(ana.pj, ESPADA, 1);
        world.giveItem(ana.pj, MOCHILA, 1);
        world.giveItem(beto.pj, ORO, 3);
        poner(ana, 0);
        poner(beto, 1);
        ofrecer(ana, { inventario: indiceDe(ana.pj, ESPADA) }, beto);
        ofrecer(beto, { inventario: indiceDe(beto.pj, ORO) }, ana);
        limpiar(ana, beto);
        return world.estaComerciando(ana.pj) && world.estaComerciando(beto.pj);
    };
    const cancelado = () => !world.estaComerciando(ana.pj) && !world.estaComerciando(beto.pj) &&
        dijo(ana, T.cancelado) && dijo(beto, T.cancelado) && cerradas(ana) === 1 && cerradas(beto) === 1;

    // Mover la espada (a la mano) lo cancela al momento.
    check('(empieza)', empezar());
    const F = P.MOVE_ITEM_FIELD;
    const m = new Array(F.TO_INDEX + 1).fill(0);
    m[0] = P.CLIENT.MOVE_ITEM;
    m[F.FROM_KIND] = P.MOVE_FROM.INVENTORY;
    m[F.FROM_INDEX] = indiceDe(ana.pj, ESPADA);
    m[F.TO_KIND] = P.MOVE_TO.SLOT;
    m[F.TO_SLOT] = 'hand';
    m[F.TO_INDEX] = -1;
    const mv = ana.sesion.handle(m);
    check('Ana se pone la espada que ofrecía: se cancela al momento', mv.moved === true && cancelado());

    // Meterla en una bolsa de dentro, también (cambia la cadena de contenedores que la rodean).
    empezar();
    world.moveItem(ana.pj, { kind: 'inventory', index: indiceDe(ana.pj, ESPADA) },
        { kind: 'inventory', index: indiceDe(ana.pj, MOCHILA, P.SLOT_INSIDE) });
    check('si la mueve un script o algo que no es un mensaje suyo, se ve en el tick siguiente',
        world.estaComerciando(ana.pj) && (ana.sesion.update(), cancelado()));

    // Gastarla / cambiarla: que el oro de Beto cambie de cantidad.
    empezar();
    beto.pj.inventory[indiceDe(beto.pj, ORO)].count = 2;
    beto.sesion.update();
    check('si lo ofrecido cambia (Beto gasta una moneda), se cancela', cancelado());

    // Usarla.
    empezar();
    ana.sesion.handle([P.CLIENT.USE_INVENTORY, indiceDe(ana.pj, ESPADA)]);
    check('usar lo que ofreces lo cancela', cancelado());

    // Alejarse andando: Beto da dos pasos (a tres casillas).
    empezar();
    reloj += 5000;
    beto.sesion.handle([P.CLIENT.WALK_EAST]);
    check('a dos casillas sigue', world.estaComerciando(ana.pj));
    reloj += 5000;
    beto.sesion.handle([P.CLIENT.WALK_EAST]);
    check('a tres, se cancela al momento', cancelado());

    // Teletransportado (un script, las escaleras).
    empezar();
    world.teleportCreature(beto.pj, fila[4]);
    check('teletransportado lejos: se cancela', cancelado());

    // Morir.
    empezar();
    world.emit('onPlayerDeath', beto.pj, null, [], {});
    check('si muere, se cancela', cancelado());

    // Cerrar la ventana.
    empezar();
    cancelar(beto);
    check('cerrar la ventana lo cancela para los dos', cancelado());

    // Salir del juego.
    empezar();
    beto.sesion.handle([P.CLIENT.LOGOUT]);
    check('salir del juego lo cancela', !world.estaComerciando(ana.pj) && dijo(ana, T.cancelado) && cerradas(ana) === 1);
}

// ===========================================================================
section('7. Del suelo');
// ===========================================================================
const dani = conectar('Dani Tratos');
{
    poner(dani, 1);
    vaciar(ana.pj);
    vaciar(dani.pj);
    world.giveItem(dani.pj, ORO, 50);
    const casilla = { x: fila[0].x, y: fila[0].y + 1, z: fila[0].z };
    const suelta = world.createItem(ESPADA, 1, casilla);
    limpiar(ana, dani);
    const r = ofrecer(ana, { suelo: [casilla.x, casilla.y, casilla.z] }, dani);
    check('Ana ofrece la espada del suelo de al lado', r.ok === true && ultimaVentana(ana).tuya[0].typeId === ESPADA);
    const r2 = ofrecer(dani, { suelo: [casilla.x, casilla.y, casilla.z] }, ana);
    check('Dani no puede contestar con esa misma espada: «Ese objeto ya se está comerciando.»',
        r2.reason === 'alreadyTraded' && dijo(dani, T.yaEnIntercambio));
    ofrecer(dani, { inventario: indiceDe(dani.pj, ORO) }, ana);
    aceptar(ana);
    const r3 = aceptar(dani);
    const tile = world.map.getTile(casilla.x, casilla.y, casilla.z);
    check('al cambiar, la espada sale del suelo y la tiene Dani; Ana tiene el oro', r3.completed === true &&
        !tile.getItems().includes(suelta) && indiceDe(dani.pj, ESPADA) !== -1 && world.countOf(ana.pj, ORO) === 50);

    // Si alguien se lleva lo del suelo, se cancela.
    const otra = world.createItem(ESPADA, 1, casilla);
    ofrecer(ana, { suelo: [casilla.x, casilla.y, casilla.z] }, dani);
    limpiar(ana, dani);
    world.removeItem(otra.instanceId);
    dani.sesion.update();
    check('si lo del suelo desaparece, se cancela', !world.estaComerciando(ana.pj) && dijo(ana, T.cancelado));
}

// ===========================================================================
section('8. Los scripts');
// ===========================================================================
{
    const vistos = [];
    let dejar = true;
    e.registry.register({ type: 'event', event: 'traderequest', onTradeRequest(player, target, item) {
        vistos.push(['pide', player.getName(), target.getName(), item.getId(), player.isTrading()]);
        return dejar;
    } }, 'prueba-intercambio');
    e.registry.register({ type: 'event', event: 'tradeaccept', onTradeAccept(player, target, item, targetItem) {
        vistos.push(['acepta', player.getName(), target.getName(), item.getId(), targetItem.getId()]);
        return dejar;
    } }, 'prueba-intercambio');

    vaciar(ana.pj);
    vaciar(dani.pj);
    world.giveItem(ana.pj, ESPADA, 1);
    world.giveItem(dani.pj, ORO, 4);
    dejar = false;
    let r = ofrecer(ana, { inventario: indiceDe(ana.pj, ESPADA) }, dani);
    check('onTradeRequest(player, target, item) que devuelve false: no se ofrece', r.ok === false && r.reason === 'script' &&
        !world.estaComerciando(ana.pj) && JSON.stringify(vistos[0]) === JSON.stringify(['pide', 'Ana Tratos', 'Dani Tratos', ESPADA, false]),
        JSON.stringify(vistos));
    dejar = true;
    r = ofrecer(ana, { inventario: indiceDe(ana.pj, ESPADA) }, dani);
    const wAna = e.registry.entities.player(ana.pj.id);
    check('con true, sí; y player:isTrading() lo dice', r.ok === true && wAna.isTrading() === true &&
        e.registry.entities.player(dani.pj.id).isTrading() === true);
    check('player:getTradePartner() da con quién', wAna.getTradePartner() && wAna.getTradePartner().getName() === 'Dani Tratos');
    ofrecer(dani, { inventario: indiceDe(dani.pj, ORO) }, ana);
    aceptar(ana);
    dejar = false;
    limpiar(ana, dani);
    r = aceptar(dani);
    check('onTradeAccept(player, target, item, targetItem) que devuelve false: se cancela sin cambiar',
        r.ok === false && dijo(ana, T.cancelado) && indiceDe(ana.pj, ESPADA) !== -1 &&
        JSON.stringify(vistos[vistos.length - 1]) === JSON.stringify(['acepta', 'Dani Tratos', 'Ana Tratos', ORO, ESPADA]),
        JSON.stringify(vistos[vistos.length - 1]));
    dejar = true;
    check('y sin intercambio, isTrading() es false', wAna.isTrading() === false && wAna.getTradePartner() === null);
}

// ===========================================================================
section('9. En inglés');
// ===========================================================================
{
    const I = await import('../shared/js/i18n.mjs');
    await import('../shared/i18n/juego.mjs');
    const dic = (await import('../shared/i18n/en/intercambio.mjs')).default;
    check('el diccionario intercambio.mjs no tiene problemas', I.problemasDeDiccionario(dic).length === 0,
        I.problemasDeDiccionario(dic).slice(0, 3).join(' | '));
    const sinIngles = Object.values(T).filter((t) => I.traducir(t, 'en') === t);
    check('todas las frases del motor tienen su inglés', sinIngles.length === 0, sinIngles.join(' | '));
    const casos = [
        ['Ana Tratos quiere comerciar contigo.', 'Ana Tratos wants to trade with you.'],
        ['Beto Tratos te pide que te acerques.', 'Beto Tratos tells you to move closer.'],
        ['Intercambio cancelado.', 'Trade cancelled.'],
        ['Intercambio completado.', 'Trade completed.'],
        ['Ya estás comerciando.', 'You are already trading.'],
        ['Ese jugador ya está comerciando.', 'This player is already trading.'],
        ['No puedes comerciar con más de 100 objetos.', 'You can not trade more than 100 items.'],
        ['No tienes capacidad suficiente para llevar a magic sword: pesa 42.00 oz y te quedarían 5.00 oz libres.',
            'You do not have enough capacity to carry a magic sword: it weighs 42.00 oz and you would have 5.00 oz free.'],
        ['No tienes sitio para llevar a magic sword.', 'You do not have enough room to carry a magic sword.'],
        ['Beto Tratos no puede llevar lo que le ofreces.', 'Beto Tratos cannot carry what you are offering.'],
        // Lo que se ve en la ventana del cliente.
        ['Intercambio con Beto Tratos', 'Trade with Beto Tratos'],
        ['Tu oferta', 'Your offer'],
        ['La de Beto Tratos', "Beto Tratos's offer"],
        ['Beto Tratos ha aceptado.', 'Beto Tratos has accepted.'],
        ['Comerciar con…', 'Trade with…'],
        ['Elige con quién comerciar (Escape o clic derecho: cancelar)', 'Choose who to trade with (Escape or right click: cancel)']
    ];
    casos.forEach(([es, en]) => {
        const t = I.traducir(es, 'en');
        check('«' + es.slice(0, 50) + '» se traduce', t === en, t);
    });
}

// ===========================================================================
section('10. El cliente');
// ===========================================================================
{
    const { ClientWorld } = await import('../client/jetyum/js/world.js');
    const C = await import('../client/jetyum/js/intercambio.js');
    check('del inventario, de una ventana y del suelo, el origen de TRADE_REQUEST',
        JSON.stringify(C.origenDeIntercambio({ kind: 'inventory', index: 3 })) === '{"inventario":3}' &&
        JSON.stringify(C.origenDeIntercambio({ kind: 'inventoryContainer', id: -9, index: 1 })) === '{"contenedor":-9,"hueco":1}' &&
        JSON.stringify(C.origenDeIntercambio({ kind: 'container', id: 77, index: 0 })) === '{"contenedor":77,"hueco":0}' &&
        JSON.stringify(C.origenDeIntercambio({ kind: 'ground', x: 1, y: 2, z: 7 })) === '{"suelo":[1,2,7]}' &&
        C.origenDeIntercambio({ kind: 'raro' }) === null);
    check('el clic con la cruz sobre un jugador da el mensaje; sobre una casilla, nada',
        JSON.stringify(C.mensajeIntercambio({ inventario: 3 }, { criatura: 42 })) ===
            JSON.stringify([P.CLIENT.TRADE_REQUEST, { inventario: 3 }, 42]) &&
        C.mensajeIntercambio({ inventario: 3 }, { casilla: [1, 2, 7] }) === null);

    vaciar(ana.pj);
    vaciar(dani.pj);
    world.giveItem(ana.pj, ESPADA, 1);
    world.giveItem(dani.pj, ORO, 12);
    limpiar(ana, dani);
    ofrecer(ana, { inventario: indiceDe(ana.pj, ESPADA) }, dani);
    ofrecer(dani, { inventario: indiceDe(dani.pj, ORO) }, ana);
    aceptar(dani);
    const cliente = new ClientWorld();
    const r = cliente.apply(ana.buzon.slice(), { SERVER: P.SERVER, CLIENT: P.CLIENT });
    const eventos = r.events.filter((ev) => ev.type === 'trade');
    const ultimo = eventos.pop();
    check('el cliente lee la ventana: las dos ofertas y que Dani ya aceptó', ultimo && ultimo.ventana.companero === 'Dani Tratos' &&
        ultimo.ventana.tuya[0].typeId === ESPADA && ultimo.ventana.suya[0].count === 12 && ultimo.ventana.acepto === true &&
        ultimo.ventana.aceptaste === false, JSON.stringify(ultimo && ultimo.ventana));
    limpiar(ana);
    cancelar(ana);
    const r2 = cliente.apply(ana.buzon.slice(), { SERVER: P.SERVER, CLIENT: P.CLIENT });
    check('y que se cierra', r2.events.some((ev) => ev.type === 'tradeClose'));
}

// ===========================================================================
section('11. La mochila puesta');
// ===========================================================================
{
    vaciar(ana.pj);
    vaciar(dani.pj);
    world.giveItem(ana.pj, ESPADA, 1);
    world.giveItem(ana.pj, ORO, 40);
    const mochila = world.containerOf(ana.pj);
    // Dani da su mochila puesta... y se queda sin: lo que recibe (la mochila de Ana) se la pone.
    const deDani = world.containerOf(dani.pj);
    world.giveItem(dani.pj, ORO, 5);
    limpiar(ana, dani);
    const r = ofrecer(ana, { inventario: ana.pj.inventory.indexOf(mochila) }, dani);
    check('Ana ofrece su mochila puesta: se ve con lo que lleva dentro', r.ok === true &&
        ultimaVentana(ana).tuya.map((x) => x.typeId).join() === [MOCHILA, ESPADA, ORO].join(),
        JSON.stringify(ultimaVentana(ana).tuya.map((x) => x.typeId)));
    ofrecer(dani, { inventario: dani.pj.inventory.indexOf(deDani) }, ana);
    aceptar(ana);
    const r2 = aceptar(dani);
    check('se cambian las mochilas puestas, cada una con lo suyo', r2.completed === true &&
        world.containerOf(dani.pj) === mochila && world.containerOf(ana.pj) === deDani &&
        world.countOf(dani.pj, ORO) === 40 && indiceDe(dani.pj, ESPADA, P.SLOT_INSIDE) !== -1 &&
        world.countOf(ana.pj, ORO) === 5, JSON.stringify(r2));
}

[ana, cris, dani].forEach((j) => j.sesion.close());
e.shutdown();
try {
    fs.rmSync(carpeta, { recursive: true, force: true });
} catch (error) {
    // La carpeta temporal se queda si el sistema no la deja borrar.
}

console.log('\n' + (failures === 0 ? '\x1b[32mtodo bien\x1b[0m' : '\x1b[31m' + failures + ' fallo(s)\x1b[0m'));
process.exit(failures === 0 ? 0 : 1);
