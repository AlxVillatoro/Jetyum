/**
 * PRUEBAS DE LAS CASAS Y EL BANCO.
 *
 *     node tools/test-casas.mjs
 *
 * Con el motor de verdad, el mapa `jetyum` (cuatro casas, ids 1 a 4), el reloj en la mano y una base
 * de datos TEMPORAL (en la carpeta temporal del sistema):
 *
 *   1. el banco: el Banquero deposita, retira, da el saldo y transfiere (a quien está y a quien no);
 *      y el saldo se guarda con el personaje
 *   2. comprar: cada motivo para no poder (`!buyhouse`) y la compra; lo que se ve al mirar la puerta
 *   3. quién entra: andar, teletransportarse, un monstruo, la lista de invitados por la ventana de
 *      texto (`CLIENT.TEXT_WINDOW_SAVE`), echar (`alana sio`), la lista de una puerta, perder acceso
 *   4. lo de dentro sobrevive a reiniciar el motor sobre la misma base
 *   5. `!leavehouse`: lo de dentro al depósito
 *   6. el alquiler: se paga (conectado y sin conectar), avisa, y a los 7 avisos la casa se pierde
 *   7. dormir en una cama y lo que se recupera durmiendo
 *   8. lo que se dice, en inglés
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
const Casas = require('../engine/world/casas.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

const DIA = 24 * 60 * 60 * 1000;
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-casas-'));
const baseDeDatos = path.join(carpeta, 'casas.db');

// EL RELOJ EMPIEZA EN LA HORA DE VERDAD: el motor programa sus tareas (el cobro del alquiler, el
// guardado) al arrancar, con el reloj de verdad, antes de que la prueba ponga el suyo.
let reloj = Date.now();
let e = null;
let world = null;
let db = null;
/** Lo que se ha mandado al depósito (`entregarEnDeposito`), para mirarlo. */
const entregas = [];

/** Arranca un motor sobre la base temporal, con el reloj en la mano. */
function arrancar() {
    e = createEngine({
        rootDir: ROOT,
        logLevel: 'error',
        overrides: { useDatabase: true, databaseFile: baseDeDatos, houseRentPeriod: 'monthly', housePriceEachSQM: 1000 }
    });
    world = e.world;
    db = e.repository.database;
    world.now = () => reloj;
    e.scheduler.now = () => reloj;
    // El correo pone `entregarEnDeposito`; si no estuviera, se finge. En los dos casos se apunta.
    const original = typeof world.entregarEnDeposito === 'function' ? world.entregarEnDeposito.bind(world) : null;
    world.entregarEnDeposito = (quien, guardado, opciones) => {
        entregas.push({ quien, guardado, opciones });
        return original ? original(quien, guardado, opciones) : true;
    };
    // Las camas: si items.xml todavía no las tiene, se dan de alta en memoria.
    [[21050, 'head', 21052, 0], [21051, 'foot', 21053, 0], [21052, 'head', 0, 21050], [21053, 'foot', 0, 21051]]
        .forEach(([id, parte, ocupada, libre]) => {
            if (!world.itemTypes.has(id)) {
                world.itemTypes.set(id, { id, name: 'bed', attributes: { blocksSolid: 1, bed: 1, bedPart: parte,
                    partnerDirection: parte === 'head' ? 'south' : 'north', ...(ocupada ? { occupiedId: ocupada } : {}),
                    ...(libre ? { freeId: libre } : {}) } });
            }
        });
}
arrancar();

function conectar(nombre) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    const existe = !!db.findCharacterByName(nombre);
    const r = sesion.login({ account: 'Casero', password: 'clave-casa', character: nombre, crear: !existe,
        vocation: 'Sorcerer' });
    if (!r.handled || !sesion.player) {
        throw new Error('no entra ' + nombre + ': ' + JSON.stringify(r));
    }
    return { sesion, buzon, pj: sesion.player, wrap: e.registry.entities.creature(sesion.player.id) };
}
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]);
const ultimo = (buzon) => textos(buzon).slice(-1)[0];
const decir = (s, texto) => s.sesion.handle([P.CLIENT.SAY, texto]);
const ventanas = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT_WINDOW);
/** Pone a alguien en un sitio, mirando hacia `dir` (0 norte, 1 este, 2 sur, 3 oeste). */
function poner(s, x, y, dir) {
    world.teleportCreature(s.pj, { x, y, z: 7 });
    if (dir !== undefined) {
        s.pj.direction = dir;
    }
    s.pj.nextStepAt = 0;
}
function andar(s, op) {
    s.pj.nextStepAt = 0;
    reloj += 1000;
    return s.sesion.handle([op]);
}
const en = (s) => s.pj.position.x + ',' + s.pj.position.y + ',' + s.pj.position.z;
const objetosEn = (x, y) => {
    const t = world.map.getTile(x, y, 7);
    return t ? t.downItems.concat(t.topItems) : [];
};

// ===========================================================================
section('1. El banco');
// ===========================================================================
const ana = conectar('Ana Casera');
const beto = conectar('Beto Casero');
const dora = conectar('Dora Ausente');
const doraId = dora.pj.characterId;
dora.sesion.close();
const banquero = world.getNpc('Banquero');
const oir = (s, texto) => {
    reloj += 1000;
    banquero.hear(s.pj, texto, reloj);
    return banquero.lastSaid;
};
{
    poner(ana, banquero.position.x + 1, banquero.position.y);
    world.darDinero(ana.pj, 40000);
    check('empieza sin saldo y con 40000 encima', ana.wrap.getBankBalance() === 0 && world.countMoney(ana.pj) === 40000);
    oir(ana, 'hola');
    const pide = oir(ana, 'deposit 40000');
    check('«deposit 40000» pide confirmación y no mueve nada todavía',
        pide === '¿De verdad quieres depositar 40000 de oro? Di "si" o "no".' && world.countMoney(ana.pj) === 40000, pide);
    const hecho = oir(ana, 'yes');
    check('«yes» lo deposita', ana.wrap.getBankBalance() === 40000 && world.countMoney(ana.pj) === 0, hecho);
    oir(ana, 'retirar');
    check('«retirar» a secas pregunta cuánto', /^¿Cuánto quieres retirar\?/.test(banquero.lastSaid), banquero.lastSaid);
    oir(ana, '500');
    const retirado = oir(ana, 'si');
    check('y con la cifra y el «si», retira', ana.wrap.getBankBalance() === 39500 && world.countMoney(ana.pj) === 500 &&
        retirado === 'Aquí tienes 500 de oro. Tu saldo es de 39500 de oro.', retirado);
    check('retirar más de lo que hay no deja', oir(ana, 'withdraw 999999') ===
        'No tienes tanto en la cuenta: tu saldo es de 39500 de oro.');
    oir(ana, 'depositar todo');
    oir(ana, 'si');
    check('«depositar todo» deja todo lo que lleva', ana.wrap.getBankBalance() === 40000 && world.countMoney(ana.pj) === 0);
    oir(ana, 'saldo');
    check('«saldo» dice el del banco (y luego lo que lleva)', banquero.lastSaid ===
        'Llevas 0 de oro encima, contando platino y cristal.');
    oir(ana, 'deposit 10');
    check('«no» deja la operación sin efecto', oir(ana, 'no') === 'Como quieras. ¿Algo más?' &&
        /^No te he propuesto nada/.test(oir(ana, 'si')) && ana.wrap.getBankBalance() === 40000);

    // Transferir a quien está dentro.
    oir(ana, 'transfer 1000 to beto casero');
    check('transferir pide confirmación con el nombre', /a beto casero\? Di "si" o "no"\.$/.test(banquero.lastSaid),
        banquero.lastSaid);
    const tr = oir(ana, 'yes');
    check('y lo pasa al saldo de Beto, que está conectado', tr === 'Hecho: has transferido 1000 de oro a Beto Casero.' &&
        beto.wrap.getBankBalance() === 1000 && ana.wrap.getBankBalance() === 39000, tr);
    check('las dos cuentas se escriben al momento en la base',
        db.getBalance(ana.pj.characterId) === 39000 && db.getBalance(beto.pj.characterId) === 1000);

    // A quien no está, por pasos.
    oir(ana, 'transferir 500');
    check('sin nombre, pregunta a quién', banquero.lastSaid === '¿A quién quieres transferir 500 de oro?');
    oir(ana, 'dora ausente');
    oir(ana, 'si');
    check('a quien no está conectado: por la base', db.getBalance(doraId) === 500 && ana.wrap.getBankBalance() === 38500 &&
        db.getBalance(ana.pj.characterId) === 38500, banquero.lastSaid);
    oir(ana, 'transfer 5 to nadie nunca');
    check('a quien no existe, no', oir(ana, 'si') === 'No conozco a nadie llamado «nadie nunca».' &&
        ana.wrap.getBankBalance() === 38500);
    oir(ana, 'transfer 5 to ana casera');
    check('a sí misma, no', oir(ana, 'si') === 'No puedes transferirte dinero a ti mismo.');
    banquero.clearFocus();

    // El saldo vuelve con el personaje.
    ana.wrap.depositMoney(0);
    world.darDinero(ana.pj, 100);
    check('el envoltorio: depositMoney / withdrawMoney', ana.wrap.depositMoney(100).ok && ana.wrap.getBankBalance() === 38600 &&
        ana.wrap.withdrawMoney(100).ok && ana.wrap.depositMoney(1000000).reason === 'notEnough');
    ana.wrap.depositMoney(100);
    ana.sesion.close();
    check('al salir, el saldo queda en players.balance', db.getBalance(ana.pj.characterId) === 38600);
}
let ana2 = conectar('Ana Casera');
check('y al volver lo tiene', ana2.wrap.getBankBalance() === 38600, String(ana2.wrap.getBankBalance()));

// ===========================================================================
section('2. Comprar una casa');
// ===========================================================================
const cris = conectar('Cris Prima');
const olmo = world.houseById(1);
const roble = world.houseById(2);
{
    check('las cuatro casas del mapa, con su fila en la base', world.casas.size === 4 &&
        db.loadHouses().length === 4 && olmo.name === 'Casa del Olmo');
    check('el precio: housePriceEachSQM × casillas (31 × 1000)', olmo.tiles.length === 31 && world.housePrice(olmo) === 31000);
    check('la puerta de cada casa se encuentra (la del Olmo es la 1, en 21,36)', olmo.puertas.length === 1 &&
        olmo.puertas[0].id === 1 && olmo.puertas[0].x === 21 && olmo.puertas[0].y === 36);
    check('mirar la puerta de una casa libre dice lo que cuesta', world.houseLookText(21, 36, 7) ===
        "Pertenece a la casa 'Casa del Olmo'. Esta casa no tiene dueño. Cuesta 31000 monedas de oro.");
    check('y una casilla que no es puerta de casa, nada', world.houseLookText(55, 31, 7) === null);

    poner(ana2, 55, 33, 0);
    decir(ana2, '!buyhouse');
    check('sin mirar una puerta: no', ultimo(ana2.buzon) === 'Tienes que estar mirando la puerta de la casa que quieres comprar.',
        ultimo(ana2.buzon));
    poner(ana2, 21, 37, 0);
    world.houseLevel = 50;
    decir(ana2, '!buyhouse');
    check('sin el nivel (houseLevel): no', ultimo(ana2.buzon) === 'Necesitas nivel 50 para comprar una casa.');
    world.houseLevel = 1;
    poner(beto, 22, 37, 0);
    poner(beto, 21, 37, 0);
    poner(ana2, 20, 37, 0);
    decir(beto, '!buyhouse');
    check('sin saldo suficiente: no', ultimo(beto.buzon) ===
        'No tienes dinero suficiente en el banco: la casa cuesta 31000 de oro.', ultimo(beto.buzon));
    poner(beto, 22, 38);
    poner(ana2, 21, 37, 0);
    decir(ana2, '!buyhouse');
    check('con todo: la compra', ultimo(ana2.buzon) ===
        'Has comprado la casa «Casa del Olmo» por 31000 de oro. Ten en el banco el dinero del alquiler.', ultimo(ana2.buzon));
    check('paga del banco, y la base lo sabe al momento', ana2.wrap.getBankBalance() === 7600 &&
        db.getBalance(ana2.pj.characterId) === 7600 &&
        db.loadHouses().find((h) => h.id === 1).owner === ana2.pj.characterId, ana2.wrap.getBankBalance() + ' / ' + db.getBalance(ana2.pj.characterId) + ' / ' + JSON.stringify(db.loadHouses().find((h) => h.id === 1)) + ' / ' + ana2.pj.characterId);
    check('mirar la puerta dice ahora quién es su dueño', world.houseLookText(21, 36, 7) ===
        "Pertenece a la casa 'Casa del Olmo'. Ana Casera es su dueño.");
    beto.sesion.handle([P.CLIENT.LOOK, 21, 36, 7]);
    check('y le llega al cliente al mirar (CLIENT.LOOK), aparte', ultimo(beto.buzon) ===
        "Pertenece a la casa 'Casa del Olmo'. Ana Casera es su dueño.", ultimo(beto.buzon));
    const casa = ana2.wrap.getHouse();
    check('player.getHouse(): la casa, con sus datos', casa && casa.getId() === 1 && casa.getName() === 'Casa del Olmo' &&
        casa.getOwnerName() === 'Ana Casera' && casa.getRent() === 500 && casa.getPrice() === 31000 &&
        casa.getTileCount() === 31 && casa.getExitPosition().y === 37 && casa.getTownId() === 1);
    poner(ana2, 21, 38);
    poner(beto, 21, 37, 0);
    decir(beto, '!buyhouse');
    check('una casa con dueño no se compra', ultimo(beto.buzon) === 'Esa casa ya tiene dueño.');
    poner(ana2, 35, 37, 0);
    decir(ana2, '!buyhouse');
    check('quien ya tiene una no compra otra', ultimo(ana2.buzon) === 'Ya eres dueño de una casa.');
}

// ===========================================================================
section('3. Quién entra');
// ===========================================================================
const puertaCerrada = () => objetosEn(21, 36).find((i) => /door/.test(i.getName())).typeId;
{
    poner(beto, 21, 37, 0);
    const antes = puertaCerrada();
    beto.sesion.handle([P.CLIENT.USE_ITEM, 21, 36, 7]);
    check('quien no está invitado no abre la puerta', puertaCerrada() === antes &&
        ultimo(beto.buzon) === 'No tienes acceso a esta puerta.', ultimo(beto.buzon));
    poner(beto, 22, 38);
    poner(ana2, 21, 37, 0);
    ana2.sesion.handle([P.CLIENT.USE_ITEM, 21, 36, 7]);
    check('la dueña sí la abre', puertaCerrada() !== antes);
    andar(ana2, P.CLIENT.WALK_NORTH);
    andar(ana2, P.CLIENT.WALK_NORTH);
    check('y entra', en(ana2) === '21,35,7', en(ana2));
    poner(ana2, 22, 35);

    poner(beto, 21, 37, 0);
    andar(beto, P.CLIENT.WALK_NORTH);
    check('un extraño no pisa la casa, con la puerta abierta y todo', en(beto) === '21,37,7' &&
        ultimo(beto.buzon) === 'No estás invitado a esta casa.', en(beto));
    world.teleportCreature(beto.pj, { x: 21, y: 34, z: 7 });
    check('ni entra por teletransporte: aparece en la puerta', en(beto) === '21,37,7', en(beto));
    poner(beto, 22, 38);
    const lobo = world.createMonster('Wolf', { x: 21, y: 37, z: 7 }) ||
        world.createMonster([...world.monsterTypes.keys()][0], { x: 21, y: 37, z: 7 });
    lobo.nextStepAt = 0;
    const m = world.moveCreature(lobo, { x: 0, y: -1 });
    check('un monstruo nunca entra en una casa', !m.moved && m.reason === 'notInvited', JSON.stringify(m));
    world.removeMonster(lobo.id);

    // La lista de invitados, por la ventana de texto.
    ana2.buzon.length = 0;
    decir(ana2, 'aleta sio');
    const v = ventanas(ana2.buzon).slice(-1)[0];
    check('«aleta sio» abre la lista de invitados, editable', v && v[2].editable === true &&
        v[2].titulo === 'Invitados de la casa «Casa del Olmo»' && v[2].texto === '', v ? JSON.stringify(v[2]) : 'sin ventana');
    const r = ana2.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, v[1], 'Beto Casero\n# la familia\ncris*']);
    check('lo que se guarda llega a la casa y a la base (house_lists, 256)', r.ok === true &&
        world.houseList(olmo, 256) === 'Beto Casero\n# la familia\ncris*' &&
        db.loadHouseLists().some((l) => l.houseId === 1 && l.listId === 256 && /cris\*/.test(l.list)) &&
        ultimo(ana2.buzon) === 'Guardado: Invitados de la casa «Casa del Olmo».', ultimo(ana2.buzon));
    check('nombres exactos y comodines: Beto y Cris (por «cris*») pueden, Dora no',
        world.canEnterHouse(beto.pj, olmo) && world.canEnterHouse(cris.pj, olmo) &&
        !world.canEnterHouse({ name: 'Dora Ausente', isPlayer: () => true }, olmo));
    const l = Casas.compilarLista('# nada\n*ana*\n!mariana\nJuan?');
    check('las listas: «#» comenta, «*» y «?» casan, «!» excluye', Casas.enLista(l, 'Ana') && Casas.enLista(l, 'juanx') &&
        Casas.enLista(l, 'Diana Roja') && !Casas.enLista(l, 'Mariana') && !Casas.enLista(l, 'juan') &&
        !Casas.enLista(l, 'nada'));
    poner(beto, 21, 37, 0);
    andar(beto, P.CLIENT.WALK_NORTH);
    andar(beto, P.CLIENT.WALK_NORTH);
    check('el invitado entra', en(beto) === '21,35,7', en(beto));
    decir(beto, 'aleta som');
    check('un invitado no edita la lista de subdueños', ultimo(beto.buzon) === 'No puedes editar esa lista.');

    // Echar.
    decir(ana2, 'alana sio "Beto Casero');
    check('«alana sio "nombre» lo echa a la puerta', en(beto) === '21,37,7' &&
        ultimo(ana2.buzon) === 'Beto Casero ya está fuera de la casa.' &&
        ultimo(beto.buzon) === 'Ana Casera te ha echado de la casa «Casa del Olmo».', en(beto));
    decir(beto, 'alana sio "Ana Casera');
    check('desde fuera no se echa a nadie', ultimo(beto.buzon) === 'No estás dentro de una casa.');

    // La lista de una puerta: un invitado que no está en ella no la abre.
    poner(ana2, 21, 35, 2);
    ana2.buzon.length = 0;
    decir(ana2, 'aleta grav');
    const vp = ventanas(ana2.buzon).slice(-1)[0];
    check('«aleta grav» abre la lista de la puerta que tiene delante', vp && vp[2].titulo === 'Puerta 1 de la casa «Casa del Olmo»');
    ana2.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, vp[1], 'Cris Prima']);
    poner(ana2, 22, 35);
    const abierta = puertaCerrada();
    beto.sesion.handle([P.CLIENT.USE_ITEM, 21, 36, 7]);
    check('Beto es invitado pero no está en la lista de la puerta: no la usa', puertaCerrada() === abierta &&
        ultimo(beto.buzon) === 'No tienes acceso a esta puerta.');
    poner(beto, 22, 38);
    poner(cris, 21, 37, 0);
    cris.sesion.handle([P.CLIENT.USE_ITEM, 21, 36, 7]);
    check('Cris está en la lista: la cierra', puertaCerrada() !== abierta);
    check('y la dueña la usa siempre', world.canUseHouseDoor(ana2.pj, olmo, olmo.puertas[0]));
    poner(cris, 23, 38);

    // Perder el acceso estando dentro.
    world.teleportCreature(beto.pj, { x: 21, y: 34, z: 7 });
    check('(Beto, invitado, entra por teletransporte)', en(beto) === '21,34,7');
    decir(ana2, 'aleta sio');
    const v2 = ventanas(ana2.buzon).slice(-1)[0];
    ana2.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, v2[1], 'cris*']);
    check('quitarle de la lista lo saca a la puerta', en(beto) === '21,37,7' &&
        ultimo(beto.buzon) === 'Ya no tienes acceso a la casa «Casa del Olmo».', en(beto));
    poner(beto, 22, 38);
}

// ===========================================================================
section('4. Lo de dentro sobrevive a reiniciar');
// ===========================================================================
{
    const espada = world.createItem(2400, 1, { x: 22, y: 34, z: 7 });
    const bolsa = world.createItem(2412, 1, { x: 23, y: 34, z: 7 });
    world.addToGroundContainer(bolsa, 3031, 50);
    const cofre = objetosEn(24, 31).find((i) => i.typeId === 11113);
    world.adoptItem(cofre);
    world.addToGroundContainer(cofre, 2400, 1);
    const fijo = objetosEn(19, 35).filter((i) => i.typeId === 11088).length;
    check('(dentro: una espada, una bolsa con 50 de oro, y una espada en el cofre del mapa)',
        espada && bolsa && cofre && world.contentsOfItem(cofre).length === 1 && fijo === 1);
    check('lo que se puede coger es de la casa; el cofre, del mapa (sólo se guarda lo de dentro)',
        world.objetosDeCasa(olmo).some((t) => t.fijos && t.fijos[0].typeId === 11113) &&
        world.objetosDeCasa(olmo).some((t) => t.items && t.items.some((i) => i.typeId === 2412 && i.contents)));
    poner(ana2, 22, 35);
    e.shutdown();
    check('al apagar se guarda en house_items', (() => {
        const d = new (require('../engine/persistence/database.js').Database)({ file: baseDeDatos });
        d.open();
        const filas = d.loadHouseItems();
        d.close();
        return filas.has(1) && JSON.stringify(filas.get(1)).includes('"typeId":2400');
    })());

    arrancar();
    const casa = world.houseById(1);
    const espadas = objetosEn(22, 34).filter((i) => i.typeId === 2400);
    const bolsa2 = objetosEn(23, 34).find((i) => i.typeId === 2412);
    const cofre2 = objetosEn(24, 31).find((i) => i.typeId === 11113);
    check('al volver a arrancar la casa tiene dueña y lista', casa.dueno && casa.dueno.nombre === 'Ana Casera' &&
        world.houseList(casa, 256) === 'cris*' && world.houseList(casa, 1) === 'Cris Prima');
    check('la espada sigue en su casilla (y sólo una)', espadas.length === 1);
    check('la bolsa, con sus 50 de oro dentro', bolsa2 && world.contentsOfItem(bolsa2).some((i) => i.typeId === 3031 && i.count === 50));
    check('el cofre del mapa, con su espada dentro', cofre2 && world.contentsOfItem(cofre2).length === 1 &&
        world.contentsOfItem(cofre2)[0].typeId === 2400);
    check('y lo cogible que trajo el mapa no se duplica', objetosEn(19, 35).filter((i) => i.typeId === 11088).length === 1);
}

// ===========================================================================
section('5. Dejar la casa: lo de dentro, al depósito');
// ===========================================================================
let ana3 = conectar('Ana Casera');
{
    const casa = world.houseById(1);
    check('(la dueña vuelve dentro de su casa, y se queda)', en(ana3) === '22,35,7', en(ana3));
    entregas.length = 0;
    decir(ana3, '!leavehouse');
    check('«!leavehouse» la deja', textos(ana3.buzon).includes(
        'Has dejado la casa «Casa del Olmo». Lo que había dentro está en tu depósito.') && casa.dueno === null,
    textos(ana3.buzon).slice(-2).join(' | '));
    const tipos = entregas.map((x) => x.guardado.typeId);
    const bolsa = entregas.find((x) => x.guardado.typeId === 2412);
    check('cada cosa va al depósito de su antigua dueña, en la ciudad de la casa y sin un aviso por objeto',
        entregas.length >= 3 && entregas.every((x) => x.quien === ana3.pj.characterId && x.opciones.townId === 1 &&
            x.opciones.aviso === false), tipos.join(','));
    check('la bolsa va con lo de dentro; y lo del cofre también', bolsa && bolsa.guardado.contents &&
        bolsa.guardado.contents[0].count === 50 && tipos.filter((t) => t === 2400).length === 2, tipos.join(','));
    check('y se le dice una sola vez', textos(ana3.buzon).filter((t) => /está en tu depósito\.$/.test(t) && /objetos/.test(t)).length === 1,
        textos(ana3.buzon).slice(-3).join(' | '));
    check('la casa queda vacía, sin listas, y ella fuera', world.objetosDeCasa(casa).length === 0 &&
        world.houseList(casa, 256) === '' && db.loadHouseLists().every((l) => l.houseId !== 1) && en(ana3) === '21,37,7');
    check('la base: sin dueño', db.loadHouses().find((h) => h.id === 1).owner === 0);
    decir(ana3, '!leavehouse');
    check('fuera de una casa, «!leavehouse» lo dice', ultimo(ana3.buzon) === 'No estás dentro de una casa.');
}

// ===========================================================================
section('6. El alquiler');
// ===========================================================================
let beto2 = conectar('Beto Casero');
{
    const olmo2 = world.houseById(1);
    const roble2 = world.houseById(2);
    ana3.wrap.setBankBalance(35000);
    beto2.wrap.setBankBalance(40000);
    poner(ana3, 21, 37, 0);
    decir(ana3, '!buyhouse');
    poner(ana3, 21, 38);
    poner(beto2, 35, 37, 0);
    decir(beto2, '!buyhouse');
    check('(las dos compran: el Olmo, 500 de alquiler, y el Roble, 750)', olmo2.dueno && roble2.dueno &&
        ana3.wrap.getBankBalance() === 4000 && beto2.wrap.getBankBalance() === 9000);
    const r1 = world.cobrarAlquileres();
    check('el primer alquiler se cobra en la primera vuelta, del banco', r1.pagadas === 2 &&
        ana3.wrap.getBankBalance() === 3500 && beto2.wrap.getBankBalance() === 8250 &&
        olmo2.paid === reloj + 30 * DIA, JSON.stringify(r1));
    check('y se le dice a quien está dentro', ultimo(ana3.buzon) ===
        'Se ha pagado el alquiler de la casa «Casa del Olmo» (500 de oro) con tu cuenta del banco.');
    check('pagado, no se cobra otra vez hasta que venza', world.cobrarAlquileres().pagadas === 0);

    ana3.wrap.setBankBalance(100);
    beto2.sesion.close();
    const betoId = beto2.pj.characterId;
    reloj += 30 * DIA + 60 * 60 * 1000;
    e.scheduler.tick(Infinity);
    check('al mes, el reloj cobra solo: Beto, desconectado, paga desde la base', db.getBalance(betoId) === 7500 &&
        roble2.paid > reloj && db.loadHouses().find((h) => h.id === 2).paid === roble2.paid, String(db.getBalance(betoId)));
    check('Ana no llega: primer aviso', olmo2.warnings === 1 && ultimo(ana3.buzon) ===
        'Aviso: no has pagado el alquiler de 500 de oro de la casa «Casa del Olmo». Tienes 7 días para ponerlo en el banco o la perderás.',
    ultimo(ana3.buzon));
    world.createItem(2400, 1, { x: 22, y: 34, z: 7 });
    ana3.sesion.close();
    const anaId = ana3.pj.characterId;
    for (let d = 0; d < 6; d += 1) {
        reloj += DIA;
        world.cobrarAlquileres();
    }
    check('un aviso por día, también sin conectar, hasta 7 (en la base)', olmo2.warnings === 7 &&
        db.loadHouses().find((h) => h.id === 1).warnings === 7 && olmo2.dueno !== null && db.getBalance(anaId) === 100);
    entregas.length = 0;
    reloj += DIA;
    const r2 = world.cobrarAlquileres();
    check('al octavo impago la casa se pierde', r2.perdidas === 1 && olmo2.dueno === null &&
        db.loadHouses().find((h) => h.id === 1).owner === 0, JSON.stringify(r2));
    check('y lo de dentro va a su depósito, aunque no esté', entregas.length === 1 && entregas[0].quien === anaId &&
        entregas[0].guardado.typeId === 2400);
    world.houseRentPeriod = 'never';
    reloj += 60 * DIA;
    check('con houseRentPeriod «never» no se cobra nada', world.cobrarAlquileres().pagadas === 0 && roble2.warnings === 0);
    world.houseRentPeriod = 'monthly';
}

// ===========================================================================
section('7. Dormir en una cama');
// ===========================================================================
{
    const roble3 = world.houseById(2);
    const cabecera = world.createItem(21050, 1, { x: 37, y: 32, z: 7 });
    const pies = world.createItem(21051, 1, { x: 37, y: 33, z: 7 });
    world.setHouseList(roble3, 256, 'Cris Prima');
    const beto3 = conectar('Beto Casero');
    poner(beto3, 36, 32);
    beto3.pj.health = 10;
    beto3.pj.mana = 0;
    beto3.pj.soul = 0;
    const desde = reloj;
    const id = beto3.pj.id;
    beto3.sesion.handle([P.CLIENT.USE_ITEM, 37, 32, 7]);
    check('usar la cama lo acuesta y la cama se ve ocupada', cabecera.typeId === 21052 && pies.typeId === 21053 &&
        en(beto3) === '37,32,7' && cabecera.attributes.sleeperName === 'Beto Casero');
    e.scheduler.tick(Infinity);
    check('y lo saca del juego (guardado, con la hora a la que se durmió)', !world.getPlayer(id) &&
        Number(db.getStorage(beto3.pj.characterId, Casas.CLAVE_CAMA)) === desde);
    // (Cris entró en el motor de antes de reiniciar: vuelve a entrar en éste.)
    const cris2 = conectar('Cris Prima');
    poner(cris2, 36, 33);
    cris2.sesion.handle([P.CLIENT.USE_ITEM, 37, 32, 7]);
    check('otro invitado que la usa: «Beto Casero está durmiendo ahí.»',
        textos(cris2.buzon).includes('Beto Casero está durmiendo ahí.'), textos(cris2.buzon).slice(-2).join(' | '));
    cris2.sesion.close();
    check('quien no está invitado no duerme', world.sleepInBed({ name: 'Nadie', isPlayer: () => true, storages: new Map() },
        cabecera).reason === 'notInvited');

    reloj += 20 * 60 * 1000;
    const beto4 = conectar('Beto Casero');
    const p = beto4.pj;
    check('al volver, 20 minutos dormido: +40 de vida, +40 de maná (hasta el máximo) y +1 alma',
        p.health === 50 && p.mana === Math.min(p.maxMana, 40) && p.soul === 1,
        'vida ' + p.health + ', maná ' + p.mana + '/' + p.maxMana + ', almas ' + p.soul);
    check('y la cama vuelve a estar libre', cabecera.typeId === 21050 && pies.typeId === 21051 && !cabecera.attributes.sleeper &&
        Number(p.storages.get(Casas.CLAVE_CAMA)) === 0);
    beto4.sesion.close();
}

// ===========================================================================
section('8. En inglés');
// ===========================================================================
{
    const I = await import('../shared/js/i18n.mjs');
    await import('../shared/i18n/juego.mjs');
    const casas = (await import('../shared/i18n/en/casas.mjs')).default;
    check('el diccionario casas.mjs no tiene problemas', I.problemasDeDiccionario(casas).length === 0,
        I.problemasDeDiccionario(casas).slice(0, 3).join(' | '));
    const casos = [
        ["Pertenece a la casa 'Casa del Olmo'. Ana Casera es su dueño.", "It belongs to house 'Elm House'. Ana Casera owns this house."],
        ["Pertenece a la casa 'Casa del Olmo'. Esta casa no tiene dueño. Cuesta 31000 monedas de oro.",
            "It belongs to house 'Elm House'. Nobody owns this house. It costs 31000 gold coins."],
        ['Beto Casero está durmiendo ahí.', 'Beto Casero is sleeping there.'],
        ['¿De verdad quieres depositar 40000 de oro? Di "si" o "no".', 'Would you really like to deposit 40000 gold? Say "yes" or "no".'],
        ['Hecho: has transferido 1000 de oro a Beto Casero.', 'Very well. You have transferred 1000 gold to Beto Casero.'],
        ['No estás invitado a esta casa.', 'You are not invited.'],
        ['Necesitas nivel 50 para comprar una casa.', 'You need level 50 to buy a house.'],
        ['Aviso: no has pagado el alquiler de 500 de oro de la casa «Casa del Olmo». Tienes 7 días para ponerlo en el banco o la perderás.',
            'Warning! The rent of 500 gold for your house «Elm House» is payable. Have it in the bank within 7 days or you will lose this house.']
    ];
    casos.forEach(([es, en2]) => {
        const t = I.traducir(es, 'en');
        check('«' + es.slice(0, 50) + '…» se traduce', t === en2, t);
    });
    // Todo lo que dice el Banquero tiene traducción (el del motor de ahora: se ha reiniciado).
    const banquero = world.getNpc('Banquero');
    const dichas = [];
    const antes = banquero.onSayLine;
    banquero.onSayLine = (t) => { dichas.push(t); if (antes) { antes(t); } };
    const dora2 = conectar('Dora Ausente');
    world.teleportCreature(dora2.pj, { x: banquero.position.x - 1, y: banquero.position.y, z: banquero.position.z });
    ['hi', 'balance', 'deposit', 'transfer 10', 'yes', 'xyzzy', 'house', 'bye'].forEach((t) => {
        reloj += 1000;
        banquero.hear(dora2.pj, t, reloj);
    });
    banquero.onSayLine = antes;
    check('y lo que dice el Banquero, entero', dichas.length >= 8 && dichas.every((t) => I.traducir(t, 'en') !== t),
        dichas.filter((t) => I.traducir(t, 'en') === t).join(' / '));
    dora2.sesion.close();
}

e.shutdown();
try {
    fs.rmSync(carpeta, { recursive: true, force: true });
} catch (error) {
    // Windows a veces tarda en soltar el archivo: se queda en la carpeta temporal.
}

console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — las casas se compran, se alquilan y se cierran como en TFS, y el banco guarda el dinero.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
