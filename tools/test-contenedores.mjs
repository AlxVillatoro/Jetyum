/**
 * PRUEBAS DE LOS CONTENEDORES ANIDADOS (una bolsa dentro de tu mochila, una mochila dentro de un
 * cuerpo). El modelo y las reglas están en `engine/world/contenedores.js`.
 *
 *     node tools/test-contenedores.mjs
 *
 * Con el motor de verdad, el datapack de verdad y sesiones con su buzón, como un cliente:
 *
 *   1. una bolsa dentro de la mochila se abre en su ventana (id negativo) y se llena arrastrando
 *   2. las pilas se juntan hasta 100 también dentro de una bolsa
 *   3. cada contenedor tiene SUS huecos
 *   4. el peso cuenta todo, a cualquier profundidad
 *   5. un contenedor no entra dentro de sí mismo, y como mucho 8 uno dentro de otro
 *   6. mover entre la mochila, las bolsas, el equipo, el suelo y los contenedores del suelo
 *   7. abrir, cerrar, mirar y coger desde las ventanas de las bolsas
 *   8. el dinero de una bolsa paga, y los scripts ven lo de dentro (`getItems`)
 *   9. soltar la mochila (al morir, o a mano) la deja en el suelo con su árbol entero
 *  10. guardar y cargar un personaje con bolsas dentro de bolsas (base de datos temporal)
 *  11. el depósito guarda una bolsa con lo suyo
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
const { MAX_ANIDADO, CLAVE_CONTENIDO } = require('../engine/world/contenedores.js');

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
const ESPADA = 2400;       // magic sword
const ORO = 3031;          // gold coin
const BOLSITA = 99901;     // una bolsa de 3 huecos, hecha para la prueba (ver abajo)

const e = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { mapName: 'jetyum', mapFile: null, useDatabase: false } });
const world = e.world;

/** Una bolsa de TRES huecos, copiada de la mochila: para probar que cada contenedor tiene los suyos. */
function anadirBolsita(w) {
    const base = w.itemTypes.get(MOCHILA);
    const attributes = { ...base.attributes, containerSize: 3 };
    delete attributes.slotType;
    w.itemTypes.set(BOLSITA, { ...base, id: BOLSITA, name: 'bolsita', attributes: attributes });
}
anadirBolsita(world);

/** Una sesión con su buzón: lo que el motor le manda. */
function conectar(engine, nombre, crear) {
    const buzon = [];
    const sesion = engine.createSession((m) => buzon.push(m));
    const r = sesion.handle([crear ? P.CLIENT.CREATE_ACCOUNT : P.CLIENT.LOGIN, 'cuenta' + nombre.toLowerCase(),
        'clave1234', nombre, 'Knight', 'male']);
    return { sesion, buzon, r, pj: sesion.player };
}
const recibido = (buzon, opcode) => buzon.filter((m) => m[0] === opcode);
const ultimaVentana = (buzon, id) => recibido(buzon, P.SERVER.CONTAINER_OPEN).map((m) => m[1])
    .filter((d) => id === undefined || d.id === id).pop() || null;
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]).join(' | ');
const indiceDe = (pj, typeId, desde) => pj.inventory.findIndex((x, i) => x.typeId === typeId && i >= (desde || 0));
const ultimoInventario = (buzon) => recibido(buzon, P.SERVER.INVENTORY).pop();

/** Las entradas de un mensaje INVENTORY, como las lee el cliente. */
function entradasDe(mensaje) {
    const I = P.INVENTORY_FIELD;
    const lista = [];
    for (let i = 0; i < mensaje[I.COUNT]; i += 1) {
        const base = I.ENTRIES + i * I.STRIDE;
        lista.push({ index: mensaje[base], typeId: mensaje[base + 1], count: mensaje[base + 2], slot: mensaje[base + I.SLOT] });
    }
    return lista;
}

/** MOVE_ITEM como lo manda el cliente: origen y destino por sus campos (`MOVE_ITEM_FIELD`). */
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

/** Una casilla de al lado donde se puede dejar algo (y que no tenga un contenedor encima). */
function casillaLibre(w, pj, saltar) {
    const evitar = saltar || [];
    for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
            const c = { x: pj.position.x + dx, y: pj.position.y + dy, z: pj.position.z };
            if ((dx || dy) && w._canHoldItems(c.x, c.y, c.z) && !w._contenedorArribaEn(c.x, c.y, c.z) &&
                !evitar.some((o) => o.x === c.x && o.y === c.y)) {
                return c;
            }
        }
    }
    throw new Error('no hay casilla libre al lado del personaje');
}

// ===========================================================================
section('1. Una bolsa dentro de la mochila: su ventana y llenarla arrastrando');
// ===========================================================================
let comun;
{
    comun = conectar(e, 'Anidador');
    const { sesion, buzon, pj } = comun;
    check('el personaje entra con su mochila puesta', !!world.containerOf(pj) && world.containerOf(pj).typeId === MOCHILA);

    world.giveItem(pj, MOCHILA, 1);
    world.giveItem(pj, ESPADA, 1);
    const iBolsa = pj.inventory.findIndex((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    const bolsa = pj.inventory[iBolsa];

    buzon.length = 0;
    const r = sesion.handle([P.CLIENT.USE_INVENTORY, iBolsa]);
    const ventana = ultimaVentana(buzon);
    check('usar una bolsa de la mochila ABRE su ventana (no busca un script)',
        r.action === 'useInventory' && r.container === 'openContainer' && ventana !== null, JSON.stringify(r));
    check('su id es negativo (CONTAINER_ID: las tuyas) y la encuentra el mundo',
        ventana && ventana.id < 0 && P.CONTAINER_ID.esPropio(ventana.id) &&
        world.contenedorPropio(pj, ventana.id) === bolsa, ventana && ventana.id);
    check('y dice sus huecos y que está vacía', ventana && ventana.capacity === 20 && ventana.items.length === 0);

    buzon.length = 0;
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: indiceDe(pj, ESPADA) },
        { kind: P.MOVE_TO.INVENTORY_CONTAINER, id: ventana.id });
    const tras = ultimaVentana(buzon, ventana.id);
    check('arrastrar la espada a la ventana de la bolsa la mete DENTRO de la bolsa',
        bolsa.contents && bolsa.contents.length === 1 && bolsa.contents[0].typeId === ESPADA &&
        !pj.inventory.some((x) => x.typeId === ESPADA), textos(buzon));
    check('la ventana se pone al día en el mismo momento', tras && tras.items.length === 1 && tras.items[0].typeId === ESPADA);
    const inv = entradasDe(ultimoInventario(buzon));
    check('y el INVENTORY sigue con su forma de siempre: lo de la bolsa no viaja en él',
        inv.every((x) => x.typeId !== ESPADA) && inv.some((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE) &&
        P.INVENTORY_FIELD.STRIDE === 6, inv.map((x) => x.typeId + ':' + x.slot).join(' '));

    // Soltarlo ENCIMA de la bolsa en el panel (MOVE_TO.INVENTORY con su índice) también la mete dentro.
    world.giveItem(pj, 2409, 1);
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: indiceDe(pj, 2409) },
        { kind: P.MOVE_TO.INVENTORY, index: pj.inventory.indexOf(bolsa) });
    check('soltarlo encima del dibujo de la bolsa en el panel lo mete dentro de ella',
        bolsa.contents.length === 2 && bolsa.contents[1].typeId === 2409);
    world.giveItem(pj, 2409, 1);
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: indiceDe(pj, 2409) },
        { kind: P.MOVE_TO.INVENTORY, index: indiceDe(pj, MOCHILA) });
    check('y encima de la MOCHILA puesta, a la mochila (lo de siempre)', world.contentsOf(pj).some((x) => x.typeId === 2409));
    world.takeItem(pj, 2409, 1);
    check('lo de dentro de la bolsa no cuenta como hueco de la mochila',
        world.contentsOf(pj).length === 1, world.contentsOf(pj).map((x) => x.typeId).join(','));
}

// ===========================================================================
section('2. Las pilas se juntan hasta 100 dentro de una bolsa');
// ===========================================================================
{
    const { sesion, pj } = comun;
    const bolsa = pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    const id = world.idDeContenedorPropio(bolsa);
    check('meter 60 de oro en la bolsa (como un script)', world.addItemToEntry(pj, bolsa, ORO, 60).ok);
    world.giveItem(pj, ORO, 60);
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: indiceDe(pj, ORO) }, { kind: P.MOVE_TO.INVENTORY_CONTAINER, id: id });
    const pilas = bolsa.contents.filter((x) => x.typeId === ORO).map((x) => x.count);
    check('otras 60 arrastradas se juntan: una pila de 100 y otra de 20', pilas.join(',') === '100,20', pilas.join(','));
    check('y el oro de la mochila se acabó', !world.contentsOf(pj).some((x) => x.typeId === ORO));
    check('el dinero de la bolsa cuenta como tuyo', world.countMoney(pj) === 120 && world.countOf(pj, ORO) === 120);
}

// ===========================================================================
section('3. Cada contenedor tiene SUS huecos');
// ===========================================================================
{
    const { sesion, buzon, pj } = comun;
    world.giveItem(pj, BOLSITA, 1);
    const bolsita = pj.inventory.find((x) => x.typeId === BOLSITA);
    const id = world.idDeContenedorPropio(bolsita);
    for (let i = 0; i < 3; i += 1) {
        world.giveItem(pj, 2409, 1);
        mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: indiceDe(pj, 2409) }, { kind: P.MOVE_TO.INVENTORY_CONTAINER, id: id });
    }
    check('una bolsa de 3 huecos admite 3 cosas', bolsita.contents && bolsita.contents.length === 3);
    world.giveItem(pj, 2409, 1);
    buzon.length = 0;
    const r = world.moveItem(pj, { kind: 'inventory', index: indiceDe(pj, 2409) }, { kind: 'inventoryContainer', id: id });
    check('y la cuarta no: containerFull, con sus huecos', !r.ok && r.reason === 'containerFull' && r.slots === 3, r.reason);
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: indiceDe(pj, 2409) }, { kind: P.MOVE_TO.INVENTORY_CONTAINER, id: id });
    check('y el jugador lee por qué', /tiene 3 huecos/.test(textos(buzon)), textos(buzon));
    check('la ventana de una bolsa dice SUS huecos', world.containerPayloadPropio(pj, bolsita).capacity === 3);
    world.takeItem(pj, 2409, world.countOf(pj, 2409));
}

// ===========================================================================
section('4. El peso cuenta todo, a cualquier profundidad');
// ===========================================================================
{
    const { pj } = comun;
    const sumaAMano = world.todasLasEntradas(pj)
        .reduce((total, t) => total + world.weightOfItem(t.entry.typeId, t.entry.count), 0);
    check('lo que pesa el jugador es la suma de todo lo que lleva, bolsas de dentro incluidas',
        world.weightOf(pj) === sumaAMano && sumaAMano > 0, world.weightOf(pj) + ' / ' + sumaAMano);
    const bolsa = pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    check('una bolsa pesa lo suyo y lo que lleva', world.pesoDeEntrada(bolsa) ===
        world.weightOfItem(MOCHILA, 1) + bolsa.contents.reduce((t, x) => t + world.pesoDeEntrada(x), 0));

    // Una mochila del suelo con 12 espadas (42 oz cada una) pesa más de lo que puede un caballero de nivel 1.
    const suelo = casillaLibre(world, pj);
    const pesada = world.createItem(MOCHILA, 1, suelo);
    for (let i = 0; i < 12; i += 1) {
        world.addToGroundContainer(pesada, ESPADA, 1);
    }
    const sola = world.weightOfItem(MOCHILA, 1);
    const r = world.moveItem(pj, { kind: 'ground', ...suelo }, { kind: 'container' });
    check('recoger una mochila llena pesa CON lo de dentro: no se puede', !r.ok && r.reason === 'tooHeavy' &&
        r.weight === world.pesoDeObjeto(pesada) && world.canCarry(pj, sola), r.reason + ' ' + r.weight);
    world.removeItem(pesada.instanceId);
}

// ===========================================================================
section('5. Dentro de sí mismo, nunca; y como mucho ' + MAX_ANIDADO + ' uno dentro de otro');
// ===========================================================================
{
    const { pj } = comun;
    const bolsa = pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    const idBolsa = world.idDeContenedorPropio(bolsa);
    let r = world.moveItem(pj, { kind: 'inventory', index: pj.inventory.indexOf(bolsa) }, { kind: 'inventoryContainer', id: idBolsa });
    check('una bolsa no entra en su propia ventana', !r.ok && r.reason === 'containerInItself', r.reason);

    world.addItemToEntry(pj, bolsa, MOCHILA, 1);
    const hija = bolsa.contents.find((x) => x.typeId === MOCHILA);
    const idHija = world.idDeContenedorPropio(hija);
    r = world.moveItem(pj, { kind: 'inventory', index: pj.inventory.indexOf(bolsa) }, { kind: 'inventoryContainer', id: idHija });
    check('ni en una bolsa que lleva dentro', !r.ok && r.reason === 'containerInItself', r.reason);
    r = world.moveItem(pj, { kind: 'inventory', index: indiceDe(pj, MOCHILA) }, { kind: 'inventoryContainer', id: idHija });
    check('ni la mochila puesta en una bolsa suya', !r.ok && r.reason === 'containerInItself' &&
        world.containerOf(pj) && world.containerOf(pj).slot === 'backpack', r.reason);
    r = world.moveItem(pj, { kind: 'inventoryContainer', id: idBolsa, index: bolsa.contents.indexOf(hija) },
        { kind: 'inventoryContainer', id: idBolsa });
    check('lo que ya está en esa bolsa, ya está', !r.ok && r.reason === 'alreadyThere', r.reason);

    // Una cadena: la mochila puesta (1), la bolsa (2), la hija (3)... hasta MAX_ANIDADO.
    let ultima = hija;
    let nivel = 3;
    while (nivel < MAX_ANIDADO) {
        const dentro = world.addItemToEntry(pj, ultima, MOCHILA, 1);
        if (!dentro.ok) {
            break;
        }
        ultima = dentro.entry;
        nivel += 1;
    }
    check('se pueden anidar ' + MAX_ANIDADO + ' contenedores, la mochila puesta incluida',
        nivel === MAX_ANIDADO && world.ubicacionDeEntrada(pj, ultima).nivel === MAX_ANIDADO - 1, 'nivel ' + nivel);
    r = world.addItemToEntry(pj, ultima, MOCHILA, 1);
    check('y el siguiente no: tooDeep', !r.ok && r.reason === 'tooDeep' && r.max === MAX_ANIDADO, r.reason);
    check('pero en el último cabe lo que no es contenedor', world.addItemToEntry(pj, ultima, ESPADA, 1).ok);
    world.giveItem(pj, MOCHILA, 1);
    const suelta = pj.inventory.filter((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE).pop();
    world.addItemToEntry(pj, suelta, MOCHILA, 1);
    r = world.moveItem(pj, { kind: 'inventory', index: pj.inventory.indexOf(suelta) },
        { kind: 'inventoryContainer', id: world.idDeContenedorPropio(ultima) });
    check('una bolsa con otra dentro tampoco cabe donde sólo cabía una', !r.ok && r.reason === 'tooDeep', r.reason);

    // Se deshace la cadena para lo que sigue: la hija (con todo) se suelta del todo.
    world._desprenderEntrada(pj, hija);
    world._desprenderEntrada(pj, suelta);
}

// ===========================================================================
section('6. Mover entre la mochila, las bolsas, el equipo, el suelo y los contenedores del suelo');
// ===========================================================================
{
    const { sesion, buzon, pj } = comun;
    const bolsa = pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    const id = world.idDeContenedorPropio(bolsa);
    const espada = () => bolsa.contents.findIndex((x) => x.typeId === ESPADA);

    mover(sesion, { kind: P.MOVE_FROM.INVENTORY_CONTAINER, id: id, index: espada() }, { kind: P.MOVE_TO.SLOT, slot: 'hand' });
    check('de la bolsa a la mano: se la pone', world.equippedIn(pj, 'hand') && world.equippedIn(pj, 'hand').typeId === ESPADA &&
        espada() === -1 && pj.weaponAttack > 0, textos(buzon));
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: indiceDe(pj, ESPADA) }, { kind: P.MOVE_TO.INVENTORY_CONTAINER, id: id });
    check('de la mano a la bolsa: se la quita y queda dentro', !world.equippedIn(pj, 'hand') && espada() !== -1 &&
        pj.weaponAttack === 0);
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY_CONTAINER, id: id, index: espada() }, { kind: P.MOVE_TO.CONTAINER });
    check('de la bolsa a la mochila', espada() === -1 && world.contentsOf(pj).some((x) => x.typeId === ESPADA));
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: indiceDe(pj, ESPADA) }, { kind: P.MOVE_TO.INVENTORY_CONTAINER, id: id });

    // Una bolsa dentro de la bolsa, con algo dentro, al suelo: sale CON lo suyo.
    world.addItemToEntry(pj, bolsa, BOLSITA, 1);
    const bolsita = bolsa.contents.find((x) => x.typeId === BOLSITA);
    world.addItemToEntry(pj, bolsita, 2409, 1);
    const suelo = casillaLibre(world, pj);
    buzon.length = 0;
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY_CONTAINER, id: id, index: bolsa.contents.indexOf(bolsita) },
        { kind: P.MOVE_TO.GROUND, ...suelo });
    const enSuelo = world._topItemAt(suelo.x, suelo.y, suelo.z).item;
    check('una bolsa de dentro de otra se tira al suelo CON lo suyo', enSuelo && enSuelo.typeId === BOLSITA &&
        world.contentsOfItem(enSuelo).length === 1 && world.contentsOfItem(enSuelo)[0].typeId === 2409 &&
        !bolsa.contents.includes(bolsita), textos(buzon));
    check('y lo de dentro es un objeto del mundo, con instancia y padre', world.items.get(world.contentsOfItem(enSuelo)[0].instanceId) &&
        world.contentsOfItem(enSuelo)[0].parent === enSuelo && world.posicionDeObjeto(world.contentsOfItem(enSuelo)[0]).x === suelo.x);

    // Y del suelo a la bolsa que llevas: entra entera, pesando lo suyo.
    const antes = world.weightOf(pj);
    mover(sesion, { kind: P.MOVE_FROM.GROUND, ...suelo }, { kind: P.MOVE_TO.INVENTORY_CONTAINER, id: id });
    const vuelta = bolsa.contents.find((x) => x.typeId === BOLSITA);
    check('del suelo a la ventana de la bolsa: vuelve con lo suyo', vuelta && vuelta.contents &&
        vuelta.contents[0].typeId === 2409 && world.weightOf(pj) === antes + world.pesoDeEntrada(vuelta), textos(buzon));
    check('y lo de dentro ya no está en la tabla de objetos del mundo', !world._topItemAt(suelo.x, suelo.y, suelo.z).item ||
        world._topItemAt(suelo.x, suelo.y, suelo.z).item.typeId !== BOLSITA);

    // Un contenedor del suelo (una mochila tirada que hace de cofre) con una bolsa dentro.
    const cofreSitio = casillaLibre(world, pj, [suelo]);
    const cofre = world.createItem(MOCHILA, 1, cofreSitio);
    buzon.length = 0;
    sesion.handle([P.CLIENT.USE_ITEM, cofreSitio.x, cofreSitio.y, cofreSitio.z]);
    check('el cofre del suelo se abre con su instancia (positiva)', ultimaVentana(buzon, cofre.instanceId) !== null);
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY_CONTAINER, id: id, index: bolsa.contents.indexOf(vuelta) },
        { kind: P.MOVE_TO.GROUND_CONTAINER, id: cofre.instanceId });
    const enCofre = world.contentsOfItem(cofre).find((x) => x.typeId === BOLSITA);
    check('una bolsa de tu bolsa va al cofre del suelo con lo suyo', enCofre && world.contentsOfItem(enCofre)[0].typeId === 2409 &&
        ultimaVentana(buzon, cofre.instanceId).items.some((x) => x.typeId === BOLSITA), textos(buzon));

    buzon.length = 0;
    const abre = sesion.handle([P.CLIENT.USE_CONTAINER, cofre.instanceId, world.contentsOfItem(cofre).indexOf(enCofre)]);
    const ventanaBolsita = ultimaVentana(buzon, enCofre.instanceId);
    check('clic derecho en una bolsa de dentro del cofre: se abre en su ventana', abre.container === 'openContainer' &&
        ventanaBolsita && ventanaBolsita.capacity === 3 && ventanaBolsita.items[0].typeId === 2409, JSON.stringify(abre));

    // Soltar algo ENCIMA de la bolsita en la ventana del cofre (TO_INDEX) lo mete en la bolsita.
    world.giveItem(pj, 2409, 1);
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY, index: indiceDe(pj, 2409) },
        { kind: P.MOVE_TO.GROUND_CONTAINER, id: cofre.instanceId, index: world.contentsOfItem(cofre).indexOf(enCofre) });
    check('soltarlo encima de la bolsita en la ventana del cofre lo mete en la bolsita',
        world.contentsOfItem(enCofre).length === 2 && world.contentsOfItem(cofre).length === 1, textos(buzon));

    buzon.length = 0;
    mover(sesion, { kind: P.MOVE_FROM.CONTAINER, id: enCofre.instanceId, index: 0 }, { kind: P.MOVE_TO.CONTAINER });
    check('de la bolsita del cofre a tu mochila', world.contentsOfItem(enCofre).length === 1 &&
        world.contentsOf(pj).some((x) => x.typeId === 2409), textos(buzon));
    mover(sesion, { kind: P.MOVE_FROM.CONTAINER, id: cofre.instanceId, index: 0 }, { kind: P.MOVE_TO.INVENTORY_CONTAINER, id: id });
    const otraVez = bolsa.contents.find((x) => x.typeId === BOLSITA);
    check('y la bolsita del cofre a tu bolsa, con lo que le quedaba', otraVez && otraVez.contents.length === 1 &&
        world.contentsOfItem(cofre).length === 0);
    sesion.update();
    check('la ventana de la bolsita, que ya no está en el mundo, se cierra',
        recibido(buzon, P.SERVER.CONTAINER_CLOSE).some((m) => m[1] === enCofre.instanceId));

    const r = world.moveItem(pj, { kind: 'container', id: cofre.instanceId, index: 0 }, { kind: 'groundContainer', id: cofre.instanceId });
    check('un contenedor del suelo vacío no da nada que mover', !r.ok, r.reason);
    const r2 = world.moveItem(pj, { kind: 'ground', ...cofreSitio }, { kind: 'groundContainer', id: cofre.instanceId });
    check('un contenedor del suelo no entra en sí mismo', !r2.ok && r2.reason === 'containerInItself', r2.reason);
    world.removeItem(cofre.instanceId);
}

// ===========================================================================
section('7. Las ventanas: abrir, cerrar, mirar, coger y cerrarse solas');
// ===========================================================================
{
    const { sesion, buzon, pj } = comun;
    const bolsa = pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    const id = world.idDeContenedorPropio(bolsa);

    buzon.length = 0;
    const cierra = sesion.handle([P.CLIENT.USE_INVENTORY, pj.inventory.indexOf(bolsa)]);
    check('usarla otra vez, con la ventana abierta, la CIERRA', cierra.container === 'closeContainer' &&
        recibido(buzon, P.SERVER.CONTAINER_CLOSE).some((m) => m[1] === id));
    sesion.handle([P.CLIENT.USE_INVENTORY, pj.inventory.indexOf(bolsa)]);
    buzon.length = 0;
    sesion.handle([P.CLIENT.CLOSE_CONTAINER, id]);
    sesion.update();
    check('y CLOSE_CONTAINER la cierra y deja de mandarla', recibido(buzon, P.SERVER.CONTAINER_OPEN).length === 0 &&
        recibido(buzon, P.SERVER.CONTAINER_CLOSE).some((m) => m[1] === id));

    sesion.handle([P.CLIENT.USE_INVENTORY, pj.inventory.indexOf(bolsa)]);
    const bolsita = bolsa.contents.find((x) => x.typeId === BOLSITA);
    buzon.length = 0;
    sesion.handle([P.CLIENT.USE_CONTAINER, id, bolsa.contents.indexOf(bolsita)]);
    const idBolsita = world.idDeContenedorPropio(bolsita);
    check('desde la ventana de una bolsa se abre otra de dentro (también negativa)',
        ultimaVentana(buzon, idBolsita) !== null && idBolsita < 0 && idBolsita !== id);

    buzon.length = 0;
    const mira = sesion.handle([P.CLIENT.LOOK_ITEM, 'container', idBolsita, 0]);
    check('mirar algo de dentro de una bolsa', mira.handled && /Ves/.test(mira.text), mira.text);

    buzon.length = 0;
    const coge = sesion.handle([P.CLIENT.CONTAINER_TAKE, idBolsita, 0]);
    check('CONTAINER_TAKE de una bolsa tuya lo pasa a la mochila', coge.ok && bolsita.contents.length === 0 &&
        ultimaVentana(buzon, idBolsita) && ultimaVentana(buzon, idBolsita).items.length === 0, textos(buzon));

    // La bolsa sale de tu inventario: su ventana se cierra (ya es un objeto del mundo, con otro id).
    const suelo = casillaLibre(world, pj);
    buzon.length = 0;
    mover(sesion, { kind: P.MOVE_FROM.INVENTORY_CONTAINER, id: id, index: bolsa.contents.indexOf(bolsita) },
        { kind: P.MOVE_TO.GROUND, ...suelo });
    check('si la bolsa sale de tu inventario, su ventana se cierra', recibido(buzon, P.SERVER.CONTAINER_CLOSE).some((m) => m[1] === idBolsita));
    mover(sesion, { kind: P.MOVE_FROM.GROUND, ...suelo }, { kind: P.MOVE_TO.INVENTORY_CONTAINER, id: id });

    const mal = world.moveItem(pj, { kind: 'inventoryContainer', id: -123456789, index: 0 }, { kind: 'container' });
    check('una ventana que no es tuya no sirve de origen', !mal.ok && mal.reason === 'badSource');
    const mal2 = sesion.handle([P.CLIENT.MOVE_ITEM, 'deLaNada', 0, 0, 0, 0, 'container', 0, 0, 0, 0]);
    check('y un origen que no existe se rechaza como mensaje mal formado', mal2.handled === false && mal2.reason === 'badSource');
}

// ===========================================================================
section('8. El dinero de una bolsa paga, y los scripts ven lo de dentro');
// ===========================================================================
{
    const { pj } = comun;
    const bolsa = pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    const antes = world.countMoney(pj);
    check('se paga con el oro de la bolsa', antes >= 50 && world.removeMoneyFrom(pj, 50) && world.countMoney(pj) === antes - 50,
        antes + ' -> ' + world.countMoney(pj));

    const wrap = e.registry.entities.inventoryItem(pj.id, bolsa);
    const dentro = wrap.getItems();
    check('getItems() de una bolsa que llevas da lo de dentro', dentro.length === bolsa.contents.length &&
        dentro.every((w, i) => w.getId() === bolsa.contents[i].typeId), dentro.map((w) => w.getId()).join(','));
    check('y cada uno sigue "vivo" aunque esté dentro de una bolsa', dentro.every((w) => w.getCount() > 0));
    const puesta = wrap.addItem(2409, 1);
    check('addItem() mete algo nuevo en la bolsa', puesta && bolsa.contents.some((x) => x.typeId === 2409) && puesta.getId() === 2409);
    check('y se gasta con remove() aunque esté dentro', puesta.remove(1) && !bolsa.contents.some((x) => x.typeId === 2409));
    check('getWeight() de la bolsa cuenta lo de dentro', wrap.getWeight() === world.pesoDeEntrada(bolsa));
    const mochila = e.registry.entities.inventoryItem(pj.id, world.containerOf(pj));
    check('y la mochila puesta da sus entradas de dentro', mochila.getItems().length === world.contentsOf(pj).length);
}

// ===========================================================================
section('9. Soltar la mochila la deja en el suelo con su árbol entero');
// ===========================================================================
{
    const { pj } = comun;
    const bolsa = pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    world.addItemToEntry(pj, bolsa, BOLSITA, 1);
    world.addItemToEntry(pj, bolsa.contents.find((x) => x.typeId === BOLSITA), 2409, 1);
    const peso = world.weightOf(pj);
    const r = world.dropItem(pj, indiceDe(pj, MOCHILA));     // la mochila PUESTA: así suelta al morir el modo de antes
    const tirada = r.item;
    const enBolsa = tirada ? world.contentsOfItem(tirada).find((x) => x.typeId === MOCHILA) : null;
    const enBolsita = enBolsa ? world.contentsOfItem(enBolsa).find((x) => x.typeId === BOLSITA) : null;
    check('la mochila puesta cae con la bolsa, y la bolsa con la bolsita, y la bolsita con lo suyo',
        r.ok && enBolsa && enBolsita && world.contentsOfItem(enBolsita)[0].typeId === 2409 && !world.containerOf(pj),
        r.reason || '');
    check('y en el suelo pesa lo mismo que pesaba encima', world.pesoDeObjeto(tirada) === peso - world.weightOf(pj));

    const de = tirada.position;
    const r2 = world.moveItem(pj, { kind: 'ground', x: de.x, y: de.y, z: de.z }, { kind: 'slot', slot: 'backpack' });
    const otra = pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    check('y al ponértela vuelve todo: lo de dentro a la mochila, y cada bolsa con lo suyo', r2.ok && world.containerOf(pj) &&
        !world.containerOf(pj).contents && otra && otra.contents.some((x) => x.typeId === BOLSITA &&
            x.contents && x.contents[0].typeId === 2409) && world.weightOf(pj) === peso, r2.reason || '');

    // `sacarEntradaAlMundo`: lo que usaría la muerte o el correo para sacar una bolsa llena.
    const sitio = casillaLibre(world, pj);
    const caja = world.createItem(MOCHILA, 1, sitio);
    const s = world.sacarEntradaAlMundo(pj, otra, { container: caja, position: sitio });
    check('sacarEntradaAlMundo deja una bolsa llena dentro de un contenedor del mundo, con lo suyo', s.ok &&
        world.contentsOfItem(caja)[0] === s.item && world.alturaDeObjeto(caja) === 3 && !world.tieneEntrada(pj, otra));
    world.removeItem(caja.instanceId);
}

// ===========================================================================
section('10. Guardar y cargar un personaje con bolsas dentro de bolsas');
// ===========================================================================
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-contenedores-'));
const archivo = path.join(tmp, 'contenedores.db');
const abrir = () => {
    const motor = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { mapName: 'jetyum', mapFile: null, useDatabase: true, databaseFile: archivo } });
    anadirBolsita(motor.world);
    return motor;
};
{
    const w = world;
    const filas = w.filasParaGuardar([{ slot: 'inside', position: 0, typeId: MOCHILA, count: 1, attributes: { actionId: 7 },
        contents: [{ slot: 'inside', position: 0, typeId: ESPADA, count: 1, attributes: null }] }]);
    check('al guardar, lo de dentro va en el JSON de atributos de la fila de su bolsa',
        filas[0].attributes.actionId === 7 && filas[0].attributes[CLAVE_CONTENIDO][0].typeId === ESPADA && !filas[0].contents);
    const vieja = [{ id: 1, slot: 'inside', position: 3, typeId: ORO, count: 40, attributes: null },
        { id: 2, slot: 'hand', position: 0, typeId: ESPADA, count: 1, attributes: { charges: 2 } }];
    const cargada = w.inventarioDesdeFilas(vieja);
    check('una fila de antes (sin la clave) se carga igual que siempre', JSON.stringify(cargada) === JSON.stringify(vieja),
        JSON.stringify(cargada));

    const e1 = abrir();
    const a = conectar(e1, 'Guardabolsas', true);
    const w1 = e1.world;
    w1.giveItem(a.pj, MOCHILA, 1);
    const bolsa = a.pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    w1.addItemToEntry(a.pj, bolsa, ORO, 77);
    w1.addItemToEntry(a.pj, bolsa, BOLSITA, 1);
    const bolsita = bolsa.contents.find((x) => x.typeId === BOLSITA);
    w1.addItemToEntry(a.pj, bolsita, 2409, 1);
    w1.addItemToEntry(a.pj, bolsita, ESPADA, 1, { actionId: 4242 });
    const pesoAntes = w1.weightOf(a.pj);
    a.sesion.close();
    const filasBase = e1.repository.database.db.prepare(
        "SELECT slot, item_type, attributes FROM player_items WHERE item_type = ? AND slot = 'inside'").all(MOCHILA);
    check('en la base es UNA fila para la bolsa, con su contenido en `attributes`', filasBase.length === 1 &&
        JSON.parse(filasBase[0].attributes)[CLAVE_CONTENIDO].length === 2, filasBase.map((f) => f.attributes).join(' '));
    e1.shutdown();

    const e2 = abrir();
    const b = conectar(e2, 'Guardabolsas');
    const w2 = e2.world;
    const bolsa2 = b.pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    const bolsita2 = bolsa2 && bolsa2.contents ? bolsa2.contents.find((x) => x.typeId === BOLSITA) : null;
    check('al volver, la bolsa trae su oro y su bolsita', bolsa2 && bolsa2.contents.some((x) => x.typeId === ORO && x.count === 77) &&
        !!bolsita2, JSON.stringify(bolsa2 && bolsa2.contents));
    check('y la bolsita lo suyo, con sus atributos', bolsita2 && bolsita2.contents.length === 2 &&
        bolsita2.contents.find((x) => x.typeId === ESPADA).attributes.actionId === 4242);
    check('y pesa lo mismo, y el dinero de dentro cuenta', w2.weightOf(b.pj) === pesoAntes && w2.countMoney(b.pj) >= 77);
    check('la mochila puesta no trae `contents` (lo suyo son las entradas de dentro)', !w2.containerOf(b.pj).contents);

    // ---------------------------------------------------------------------
    section('11. El depósito guarda una bolsa con lo suyo');
    // ---------------------------------------------------------------------
    const sitio = casillaLibre(w2, b.pj);
    w2.createItem(w2.depotItemId, 1, sitio);
    b.buzon.length = 0;
    b.sesion.handle([P.CLIENT.USE_ITEM, sitio.x, sitio.y, sitio.z]);
    const deposito = w2.depotOf(b.pj);
    check('el cofre abre el depósito', ultimaVentana(b.buzon, deposito.instanceId) !== null);
    mover(b.sesion, { kind: P.MOVE_FROM.INVENTORY, index: b.pj.inventory.indexOf(bolsa2) },
        { kind: P.MOVE_TO.GROUND_CONTAINER, id: deposito.instanceId });
    const enDeposito = w2.contentsOfItem(deposito).find((x) => x.typeId === MOCHILA);
    check('la bolsa se guarda en el depósito con todo', enDeposito && w2.alturaDeObjeto(enDeposito) === 2 &&
        !w2.tieneEntrada(b.pj, bolsa2), textos(b.buzon));
    b.sesion.close();
    e2.shutdown();

    const e3 = abrir();
    const c = conectar(e3, 'Guardabolsas');
    const w3 = e3.world;
    w3.createItem(w3.depotItemId, 1, sitio);
    c.buzon.length = 0;
    c.sesion.handle([P.CLIENT.USE_ITEM, sitio.x, sitio.y, sitio.z]);
    const deposito3 = w3.depotOf(c.pj);
    const bolsa3 = w3.contentsOfItem(deposito3).find((x) => x.typeId === MOCHILA);
    const bolsita3 = bolsa3 ? w3.contentsOfItem(bolsa3).find((x) => x.typeId === BOLSITA) : null;
    check('al volver a entrar, el depósito tiene la bolsa, y la bolsa su bolsita, y la bolsita lo suyo',
        bolsa3 && bolsita3 && w3.contentsOfItem(bolsita3).length === 2 &&
        w3.contentsOfItem(bolsa3).some((x) => x.typeId === ORO && x.count === 77), JSON.stringify(c.pj.deposito));
    c.buzon.length = 0;
    c.sesion.handle([P.CLIENT.USE_CONTAINER, deposito3.instanceId, w3.contentsOfItem(deposito3).indexOf(bolsa3)]);
    check('y la bolsa del depósito se abre en su ventana', ultimaVentana(c.buzon, bolsa3.instanceId) !== null);
    mover(c.sesion, { kind: P.MOVE_FROM.CONTAINER, id: deposito3.instanceId, index: w3.contentsOfItem(deposito3).indexOf(bolsa3) },
        { kind: P.MOVE_TO.CONTAINER });
    const recuperada = c.pj.inventory.find((x) => x.typeId === MOCHILA && x.slot === P.SLOT_INSIDE);
    check('y se saca del depósito a la mochila con todo', recuperada && recuperada.contents &&
        recuperada.contents.some((x) => x.typeId === BOLSITA && x.contents.length === 2), textos(c.buzon));
    c.sesion.close();
    e3.shutdown();
}
fs.rmSync(tmp, { recursive: true, force: true });

comun.sesion.close();
e.shutdown();
console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — los contenedores se anidan, pesan, se mueven y se guardan.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
