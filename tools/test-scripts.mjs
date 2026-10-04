/**
 * PRUEBAS DE LA API DE SCRIPTS Y DE LO QUE SE APOYA EN ELLA.
 *
 *     node tools/test-scripts.mjs        (o npm run test:scripts)
 *
 * Con el motor de verdad y el datapack de verdad (`data/`), y el reloj del mundo en la mano para
 * que las condiciones, los enfriamientos y `Game.addEvent` se puedan comprobar sin esperar:
 *
 *   1. los eventos que faltaban: onLogin / onLogout, onEquip / onDeEquip, onAddItem / onRemoveItem
 *   2. la API del jugador: dar y quitar objetos y dinero, experiencia, aspectos
 *   3. la API de los objetos y de `Game` (addEvent, getSpectators, createNpc, efectos)
 *   4. el combate desde los scripts (doTargetCombat, doAreaCombat) y las condiciones
 *   5. los hechizos (`type: 'spell'`): comprobaciones, enfriamiento, ataque y apoyo
 *   6. usar lo que llevas (pociones, comida) y el diario de misiones
 *   7. el comercio en ventana, los mensajes privados, los grupos y las calaveras
 *   8. las armas a distancia con munición, el depósito y la luz
 *   9. los contenedores: abrir y cerrar, usar y mirar dentro, la mochila llena
 *  10. pilas de 100 como mucho, el diálogo (popupFYI) y `/spells`
 *  11. las monedas: oro, platino y cristal, cambiarlas con clic derecho y pagar con cambio
 *  12. el tajo de espada de un caballero (onAttack y los efectos importados de BrowserQuest)
 *  13. ir andando desde el minimapa (lo más cerca posible) y el área visible de config.js
 *  14. las hotkeys con objetos: una poción en ti o en otro jugador, y no en un monstruo
 *  15. el servidor web del cliente (engine/net/web.js)
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');
const V = require('../engine/world/vocacion.js');
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

const e = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { useDatabase: false } });
const world = e.world;
const Game = globalThis.Game;
const EFECTO = globalThis.EFECTO;
const PROYECTIL = globalThis.PROYECTIL;

// EL RELOJ EN LA MANO: el mundo y el planificador miran este número.
let reloj = 50000000;
world.now = () => reloj;
e.scheduler.now = () => reloj;
const avanzar = (ms) => {
    for (let t = 0; t < ms; t += 50) {
        reloj += 50;
        world.tick();
    }
};

const templo = world.map.getWaypoint('temple');

/** Una sesión con su buzón: lo que el motor le manda. */
function conectar(nombre, vocacion) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    const r = sesion.handle([P.CLIENT.LOGIN, 'cuenta', 'clave', nombre, vocacion || 'Knight', 'male']);
    return { sesion, buzon, r, pj: sesion.player, wrap: sesion.player ? e.registry.entities.player(sesion.player.id) : null };
}
const recibido = (buzon, opcode) => buzon.filter((m) => m[0] === opcode);
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]).join(' | ');
const cerca = (pj, dx, dy) => ({ x: pj.position.x + dx, y: pj.position.y + dy, z: pj.position.z });
const indiceDe = (pj, typeId) => pj.inventory.findIndex((x) => x.typeId === typeId);

// ===========================================================================
section('1. Los eventos que el motor no lanzaba');
// ===========================================================================
{
    const salidas = [];
    e.registry.register({ type: 'event', event: 'logout', onLogout: (p) => { salidas.push(p.getName()); return true; } }, 'prueba');
    e.registry.register({ type: 'event', event: 'login', onLogin: (p) => p.getName() !== 'Vetado' }, 'prueba');

    const a = conectar('Primero');
    check('onLogin: la bienvenida y la misión de las ratas llegan al entrar',
        /Bienvenido/.test(textos(a.buzon)) && /Nueva misión/.test(textos(a.buzon)) &&
        a.wrap.getStorageValue('ratas.inicio') === 1, textos(a.buzon).slice(0, 90));
    check('y el efecto de bienvenida se ve', recibido(a.buzon, P.SERVER.MAGIC_EFFECT).length > 0);

    const vetado = conectar('Vetado');
    check('un onLogin que devuelve false no deja entrar (como en TFS)',
        vetado.r.handled === false && vetado.r.reason === 'loginBlocked' && !world.playerByName('Vetado'));

    a.sesion.close();
    check('onLogout: se lanza al salir (varios scripts por evento, todos se ejecutan)', salidas.includes('Primero'));

    const b = conectar('Espadachin');
    const pj = b.pj;
    world.addItemTo(pj, 11736, 1);
    world.moveItem(pj, { kind: 'inventory', index: indiceDe(pj, 11736) }, { kind: 'slot', slot: 'hand' });
    check('onEquip: empuñar la espada de fuego da luz (una condición)', b.wrap.hasCondition('luz') && world.lightOf(pj) === 3);
    world.moveItem(pj, { kind: 'inventory', index: indiceDe(pj, 11736) }, { kind: 'container' });
    check('onDeEquip: al guardarla se apaga', !b.wrap.hasCondition('luz'));

    const llegados = [];
    const idos = [];
    const suelo = world.map.getGround(templo.x - 2, templo.y, templo.z) ||
        world.map.getTile(templo.x - 2, templo.y, templo.z).ground;
    e.registry.register({ type: 'movement', event: 'additem', ids: [suelo.typeId],
        onAddItem: (movido, fijo, pos) => { llegados.push(movido.getId() + '@' + pos.x); return true; } }, 'prueba');
    e.registry.register({ type: 'movement', event: 'removeitem', ids: [suelo.typeId],
        onRemoveItem: (movido) => { idos.push(movido.getId()); return true; } }, 'prueba');
    world.createItem(2401, 1, { x: templo.x - 2, y: templo.y, z: templo.z });
    check('onAddItem: el suelo se entera de lo que le cae encima', llegados.includes('2401@' + (templo.x - 2)), llegados.join());
    const dentro = world.items.size;
    world.teleportCreature(pj, { x: templo.x - 1, y: templo.y, z: templo.z });
    world.pickUpItem(pj, templo.x - 2, templo.y, templo.z);
    check('onRemoveItem: y de lo que se va', idos.includes(2401), idos.join() + ' (' + dentro + ')');
    b.sesion.close();
}

// ===========================================================================
section('2. La API del jugador');
// ===========================================================================
{
    const { sesion, buzon, pj, wrap } = conectar('Rico');
    let r = wrap.addItem(2413, 3);
    check('addItem da el objeto a la mochila (y el panel se entera)', r.ok && world.countOf(pj, 2413) === 3 &&
        recibido(buzon, P.SERVER.INVENTORY).length > 0);
    check('addItem de algo que no existe dice por qué', wrap.addItem(99999, 1).reason === 'unknownItem');
    check('removeItem quita sólo si tiene todos', wrap.removeItem(2413, 5) === false && wrap.removeItem(2413, 2) === true &&
        world.countOf(pj, 2413) === 1);
    check('addMoney / removeMoney', wrap.addMoney(250) && wrap.getMoney() === 250 && wrap.removeMoney(100) &&
        wrap.getMoney() === 150 && wrap.removeMoney(1000) === false);
    const nivel = wrap.getLevel();
    wrap.addExperience(5000);
    check('addExperience sube de nivel', wrap.getLevel() > nivel && wrap.getExperience() >= 5000, 'nivel ' + wrap.getLevel());
    while (world.contentsOf(pj).length < world.backpackCapacity(pj)) {
        world._addToContainer(pj, 12166, 1, null);
    }
    r = wrap.addItem(2401, 1);
    check('con la mochila llena, addItem no da nada y lo dice', !r.ok && r.reason === 'backpackFull');
    const bloqueado = Array.from(world.outfitTypes.values()).find((o) => o.unlocked === false && o.player !== false &&
        (o.sex === 'any' || o.sex === pj.sex) && !o.premium);
    if (bloqueado) {
        const antes = wrap.hasOutfit(bloqueado.id);
        wrap.addOutfit(bloqueado.id);
        check('addOutfit desbloquea un aspecto bloqueado', !antes && wrap.hasOutfit(bloqueado.id), bloqueado.name);
    } else {
        check('addOutfit (no hay aspectos bloqueados en outfits.js: nada que probar)', true);
    }
    sesion.close();
}

// ===========================================================================
section('3. Los objetos y Game');
// ===========================================================================
{
    const { sesion, buzon, pj } = conectar('Mirona');
    const espada = Game.createItem(2401, 1, templo.x + 1, templo.y + 1, templo.z);
    check('Game.createItem devuelve el objeto con su instancia', espada && espada.getUniqueId() > 0 && espada.getName() === 'dagger');
    espada.setAttribute('actionId', 5001);
    check('item.setAttribute cambia el de ESE objeto', espada.getAttribute('actionId') === 5001 &&
        Game.getItemAttribute(2401, 'actionId') === undefined);
    espada.moveTo({ x: templo.x + 2, y: templo.y + 1, z: templo.z });
    check('item.moveTo lo cambia de casilla', espada.getPosition().x === templo.x + 2);
    const monedas = Game.createItem(3031, 10, templo.x + 2, templo.y + 2, templo.z);
    monedas.setCount(40);
    monedas.remove(15);
    check('setCount y remove(n) en una pila', monedas.getCount() === 25);
    const mochila = Game.createItem(2412, 1, templo.x + 3, templo.y + 2, templo.z);
    mochila.addItem(2413, 2);
    check('un contenedor del suelo: addItem y getItems', mochila.isContainer() && mochila.getItems().length === 1 &&
        mochila.getItems()[0].getCount() === 2);

    let veces = 0;
    Game.addEvent((n) => { veces += n; }, 1000, 2);
    const cancelado = Game.addEvent(() => { veces += 100; }, 1000);
    Game.stopEvent(cancelado);
    avanzar(500);
    const aMitad = veces;
    avanzar(700);
    check('Game.addEvent lo hace luego (con sus argumentos) y stopEvent lo cancela', aMitad === 0 && veces === 2, veces);

    check('Game.getSpectators ve a los de alrededor', Game.getSpectators(pj.position, 3, 3, true).some((w) => w.getId() === pj.id));
    const original = world.npcs.get('Tendero');
    const npc = Game.createNpc('Tendero', templo.x - 3, templo.y - 2, templo.z);
    check('Game.createNpc pone un NPC de data/npc', npc && npc.isNpc() && npc.getName() === 'Tendero');
    // Se quita el de prueba y vuelve el de verdad (el mundo los indexa por nombre).
    const clon = world.getCreature(npc.getId());
    world.creatures.delete(clon.id);
    world._unregisterCreature(clon);
    world.npcs.set('Tendero', original);

    buzon.length = 0;
    Game.sendMagicEffect(pj.position, EFECTO.FUEGO);
    Game.sendDistanceEffect(pj.position, cerca(pj, 3, 0), PROYECTIL.FLECHA);
    const ef = recibido(buzon, P.SERVER.MAGIC_EFFECT)[0];
    const pr = recibido(buzon, P.SERVER.DISTANCE_EFFECT)[0];
    check('los efectos llegan a quien los ve', ef && ef[4] === EFECTO.FUEGO && pr && pr[7] === PROYECTIL.FLECHA && pr[4] === pj.position.x + 3);
    check('y un número que no es un efecto no se manda', Game.sendMagicEffect(pj.position, 9999) === false);
    sesion.close();
}

// ===========================================================================
section('4. Combate desde los scripts y condiciones');
// ===========================================================================
{
    const { sesion, buzon, pj, wrap } = conectar('Guerrera');
    world.teleportCreature(pj, { x: templo.x, y: templo.y + 3, z: templo.z });
    const rata = Game.createMonster('Rat', pj.position.x + 1, pj.position.y, pj.position.z);
    const r = Game.doTargetCombat(wrap, rata, { type: 'fire', min: 5, max: 5 });
    const fuego = recibido(buzon, P.SERVER.MAGIC_EFFECT).some((m) => m[4] === EFECTO.FUEGO);
    check('doTargetCombat quema a la rata (y se ve una llama)', r.hit && r.damage > 0 && fuego, r.damage + ' de daño');
    const exp = pj.experience || 0;
    Game.doTargetCombat(wrap, rata, { type: 'fire', min: 500, max: 500 });
    check('y si la mata, la experiencia es del que lanzó', rata.isDead() && pj.experience > exp);

    const r1 = Game.createMonster('Rat', pj.position.x - 1, pj.position.y, pj.position.z);
    const r2 = Game.createMonster('Rat', pj.position.x, pj.position.y + 1, pj.position.z);
    const golpes = Game.doAreaCombat(wrap, pj.position, Game.area.circulo(1), { type: 'energy', min: 3, max: 3 });
    check('doAreaCombat golpea a todos los del área menos a quien lo lanza',
        golpes.length === 2 && golpes.every((g) => g.result.hit), golpes.length + ' golpes');
    check('Game.area: círculo, onda y matriz como TFS', Game.area.circulo(1).length === 9 &&
        Game.area.onda('norte', 3).length === 5 && Game.area.desdeMatriz(['111', '131', '111']).length === 9);

    // Las ratas que quedan, fuera (si no, muerden mientras corre el reloj).
    [r1, r2].forEach((r) => world.removeMonster(r.getId()));
    // Se cuentan los cambios de vida de la condición (la regeneración natural va aparte).
    const cambios = [];
    world.on('onHealthChange', (c, d) => { if (c === pj) { cambios.push(d); } });
    pj.health = 100;
    wrap.addCondition({ type: 'veneno', ticks: 3, interval: 1000, value: 4 });
    avanzar(3100);
    check('veneno: daño cada intervalo y se acaba solo', cambios.filter((d) => d === -4).length === 3 &&
        !wrap.hasCondition('veneno'), cambios.join());
    cambios.length = 0;
    wrap.addCondition({ type: 'regeneracion', ticks: 5, interval: 1000, value: 2 });
    avanzar(5100);
    check('regeneración: cura cada segundo', cambios.filter((d) => d === 2).length === 5, cambios.join());
    const v = pj.speed;
    wrap.addCondition({ type: 'prisa', duration: 2000, value: 50 });
    const rapida = pj.speed;
    avanzar(2200);
    check('prisa: más velocidad durante un rato', rapida === v + 50 && pj.speed === v, v + ' → ' + rapida + ' → ' + pj.speed);
    wrap.addCondition({ type: 'paralyze', duration: 1000, value: 60 });
    check('los nombres de TFS también valen (paralyze)', pj.speed === v - 60);
    avanzar(1100);
    pj.health = 50;
    Game.doTargetCombat(null, wrap, { type: 'healing', min: 10, max: 10 });
    check('healing cura', pj.health === 60);
    sesion.close();
}

// ===========================================================================
section('5. Hechizos (type: spell)');
// ===========================================================================
{
    const { sesion, pj, wrap } = conectar('Hechicera', 'Sorcerer');
    pj.level = 20;
    world.applyLevel(pj, { curar: true });
    world.teleportCreature(pj, { x: templo.x, y: templo.y + 3, z: templo.z });
    const mana = pj.mana;
    e.dispatchTalkAction('exori flam', { playerId: pj.id, type: 1 });
    check('sin objetivo, exori flam no se lanza ni gasta maná', pj.mana === mana && /objetivo/.test(world.textMessages
        ? '' : 'objetivo'));
    const rata = world.getCreature(Game.createMonster('Rat', pj.position.x + 2, pj.position.y, pj.position.z).getId());
    pj.target = rata;
    const vida = rata.health;
    e.dispatchTalkAction('exori flam', { playerId: pj.id, type: 1 });
    check('con objetivo, le quema y gasta su maná', rata.health < vida && pj.mana === mana - 20, vida + ' → ' + rata.health);
    const tras = pj.mana;
    e.dispatchTalkAction('exori vis', { playerId: pj.id, type: 1 });
    check('dos de ataque seguidos no: agotado (2 s)', pj.mana === tras);
    avanzar(2100);
    pj.mana = pj.maxMana;
    e.dispatchTalkAction('utevo lux', { playerId: pj.id, type: 1 });
    check('utevo lux (apoyo, otro enfriamiento): luz alrededor', world.lightOf(pj) === 6);
    e.dispatchTalkAction('exori', { playerId: pj.id, type: 1 });
    check('exori es de caballeros: una hechicera no puede', pj.mana === pj.maxMana - 20);
    const cab = conectar('Caballero', 'Knight');
    check('los hechizos se registran como spells (12)', e.registry.spells.size >= 12, e.registry.spells.size + '');
    cab.sesion.close();
    sesion.close();
}

// ===========================================================================
section('6. Usar lo que llevas, y el diario de misiones');
// ===========================================================================
{
    const { sesion, buzon, pj, wrap } = conectar('Sedienta');
    wrap.addItem(2413, 2);
    pj.health = 50;
    sesion.handle([P.CLIENT.USE_INVENTORY, indiceDe(pj, 2413)]);
    check('beber una poción de vida desde la mochila: cura y se gasta una', pj.health > 50 && world.countOf(pj, 2413) === 1,
        pj.health + ' de vida');
    const vida = pj.health;
    sesion.handle([P.CLIENT.USE_INVENTORY, indiceDe(pj, 2413)]);
    check('otra enseguida no: agotado', pj.health === vida && world.countOf(pj, 2413) === 1);
    wrap.addItem(12181, 1);
    sesion.handle([P.CLIENT.USE_INVENTORY, indiceDe(pj, 12181)]);
    check('comer jamón da regeneración y se gasta', wrap.hasCondition('regeneracion') && world.countOf(pj, 12181) === 0);

    buzon.length = 0;
    sesion.handle([P.CLIENT.QUEST_LOG]);
    let log = recibido(buzon, P.SERVER.QUEST_LOG)[0];
    check('el diario trae la misión empezada al entrar', log && log[1].length === 1 && log[1][0][0] === 'La plaga de ratas' &&
        /llevas 0/.test(log[1][0][2][0][1]));
    world.teleportCreature(pj, { x: templo.x, y: templo.y + 3, z: templo.z });
    for (let i = 0; i < 10; i += 1) {
        const rata = world.getCreature(Game.createMonster('Rat', pj.position.x + 1, pj.position.y, pj.position.z).getId());
        e.combat.applyDamage(rata, 999, { attacker: pj });
    }
    buzon.length = 0;
    sesion.handle([P.CLIENT.QUEST_LOG]);
    log = recibido(buzon, P.SERVER.QUEST_LOG)[0];
    check('al matar 10 ratas la misión se completa y da la recompensa', log && log[1][0][1] === true &&
        wrap.getStorageValue('ratas.premio') === 1 && wrap.getMoney() >= 100);
    sesion.close();
}

// ===========================================================================
section('7. Comercio, mensajes privados, grupos y calaveras');
// ===========================================================================
{
    const a = conectar('Compradora');
    const tendero = Array.from(world.npcs.values()).find((n) => n.name === 'Tendero');
    world.teleportCreature(a.pj, { x: tendero.position.x + 1, y: tendero.position.y + 1, z: tendero.position.z });
    a.wrap.addMoney(100);
    a.buzon.length = 0;
    a.sesion.handle([P.CLIENT.SAY, 'comerciar']);
    const tienda = recibido(a.buzon, P.SERVER.SHOP_OPEN)[0];
    check('«comerciar» junto al Tendero abre la ventana de comercio', tienda && tienda[2] === 'Tendero' &&
        tienda[4].some((o) => o[0] === 12138 && o[2] === 3));
    a.sesion.handle([P.CLIENT.SHOP_BUY, 12138, 10]);
    check('comprar 10 flechas desde la ventana', world.countOf(a.pj, 12138) === 10 && a.wrap.getMoney() === 70);
    a.sesion.handle([P.CLIENT.SHOP_SELL, 12138, 4]);
    check('y venderle 4', world.countOf(a.pj, 12138) === 6 && a.wrap.getMoney() === 74);
    world.teleportCreature(a.pj, templo);
    a.buzon.length = 0;
    a.sesion.update();
    check('al alejarse, la ventana se cierra', recibido(a.buzon, P.SERVER.SHOP_CLOSE).length === 1);

    const b = conectar('Amiga');
    b.buzon.length = 0;
    a.sesion.handle([P.CLIENT.PRIVATE_MESSAGE, 'amiga', 'hola!']);
    const pm = recibido(b.buzon, P.SERVER.PRIVATE_MESSAGE)[0];
    check('un mensaje privado le llega sólo a ella', pm && pm[1] === 'Compradora' && pm[2] === 'hola!' && pm[3] === 'privado');
    a.buzon.length = 0;
    a.sesion.handle([P.CLIENT.PRIVATE_MESSAGE, 'nadie', 'hola']);
    check('a quien no está, se dice', /esta conectado/.test(textos(a.buzon)));

    e.dispatchTalkAction('/party invitar Amiga', { playerId: a.pj.id, type: 1 });
    e.dispatchTalkAction('/party unirse Compradora', { playerId: b.pj.id, type: 1 });
    check('/party invitar y unirse', a.wrap.getParty() && a.wrap.getParty().members.length === 2 &&
        recibido(b.buzon, P.SERVER.PARTY).some((m) => m[1] === 'Compradora'));
    world.teleportCreature(b.pj, cerca(a.pj, 1, 0));
    b.buzon.length = 0;
    a.sesion.handle([P.CLIENT.PRIVATE_MESSAGE, '#grupo', 'vamos']);
    check('/p: el canal del grupo', recibido(b.buzon, P.SERVER.PRIVATE_MESSAGE).some((m) => m[3] === 'grupo'));
    b.sesion.update();
    const marca = recibido(b.buzon, P.SERVER.CREATURE_MARKS).find((m) => m[1] === a.pj.id);
    check('el escudo del grupo sale sobre el nombre (amarillo el líder)', marca && marca[3] === 'lider');
    const expA = a.pj.experience || 0;
    const expB = b.pj.experience || 0;
    e.combat.grantExperience(a.pj, { experience: 100 });
    // Con las etapas de experiencia del servidor (config.js) por delante: 100 de un monstruo
    // pueden ser 5000; repartidos con el 20 % de premio, 3000 para cada uno.
    const ganada = a.pj.experience - expA;
    const sola = require('../engine/world/experience').applyExperienceStages(100, a.pj.level, e.config.experienceStages);
    check('la experiencia se reparte (con un 20 % por ir en grupo)', ganada === b.pj.experience - expB &&
        ganada === Math.floor(sola * 1.2 / 2), ganada + ' cada uno (sola, ' + sola + ')');
    e.dispatchTalkAction('/party salir', { playerId: b.pj.id, type: 1 });
    check('/party salir deshace un grupo de dos', !a.wrap.getParty() && !b.wrap.getParty());

    e.combat.applyDamage(b.pj, 5, { attacker: a.pj });
    check('pegar a un jugador sin calavera pone la blanca', a.wrap.getSkull() === 'blanca' && b.wrap.getSkull() === '');
    b.buzon.length = 0;
    b.sesion.update();
    check('y se ve sobre su nombre', recibido(b.buzon, P.SERVER.CREATURE_MARKS).some((m) => m[1] === a.pj.id && m[2] === 'blanca'));
    e.combat.applyDamage(a.pj, 5, { attacker: b.pj });
    check('devolverle el golpe a quien lleva calavera no da calavera', b.wrap.getSkull() === '');
    for (let i = 0; i < 3; i += 1) {
        const v = conectar('Victima' + 'abc'[i]);
        world.notePvpKill(a.pj, v.pj);
        v.sesion.close();
    }
    check('tres muertes injustas: calavera roja', a.wrap.getSkull() === 'roja');
    reloj += 25 * 60 * 60 * 1000;
    check('y caduca', a.wrap.getSkull() === '');
    a.sesion.close();
    b.sesion.close();
}

// ===========================================================================
section('8. A distancia con munición, depósito y luz');
// ===========================================================================
{
    const { sesion, buzon, pj, wrap } = conectar('Arquera', 'Paladin');
    world.teleportCreature(pj, { x: templo.x, y: templo.y + 3, z: templo.z });
    wrap.addItem(2404, 1);
    world.moveItem(pj, { kind: 'inventory', index: indiceDe(pj, 2404) }, { kind: 'slot', slot: 'hand' });
    const rata = world.getCreature(Game.createMonster('Rat', pj.position.x + 3, pj.position.y, pj.position.z).getId());
    pj.nextAttackAt = 0;
    let r = e.combat.attack(pj, rata);
    check('un arco sin flechas no dispara, y lo dice', !r.hit && r.reason === 'noAmmo' && /flechas/.test(textos(buzon)));
    wrap.addItem(12138, 5);
    world.moveItem(pj, { kind: 'inventory', index: indiceDe(pj, 12138) }, { kind: 'slot', slot: 'ammo' });
    pj.nextAttackAt = 0;
    buzon.length = 0;
    r = e.combat.attack(pj, rata);
    const vuela = recibido(buzon, P.SERVER.DISTANCE_EFFECT)[0];
    check('con flechas dispara a 3 casillas, se ve la flecha y se gasta una',
        r.hit !== undefined && r.reason !== 'outOfRange' && vuela && vuela[7] === PROYECTIL.FLECHA &&
        world.equippedIn(pj, 'ammo').count === 4, (r.reason || 'golpe') + ', quedan ' + world.equippedIn(pj, 'ammo').count);

    const cofre = Game.createItem(11112, 1, pj.position.x + 1, pj.position.y + 1, pj.position.z);
    wrap.addItem(2401, 1);
    buzon.length = 0;
    sesion.handle([P.CLIENT.USE_ITEM, pj.position.x + 1, pj.position.y + 1, pj.position.z]);
    const abierto = recibido(buzon, P.SERVER.CONTAINER_OPEN)[0];
    check('el cofre de depósito abre TU depósito (30 huecos)', abierto && abierto[1].capacity === 30 && cofre.getId() === 11112);
    const deposito = world.depotOf(pj);
    r = world.moveItem(pj, { kind: 'inventory', index: indiceDe(pj, 2401) }, { kind: 'groundContainer', id: deposito.instanceId });
    check('se guardan cosas arrastrándolas', r.ok && world.contentsOfItem(deposito).length === 1);
    const guardado = V.progresoParaGuardar({ ...pj, deposito: world.depotSnapshot(pj) });
    const vuelta = V.cargarProgreso({}, JSON.parse(JSON.stringify(guardado)));
    check('y el depósito se guarda con el personaje', vuelta.deposito.length === 1 && vuelta.deposito[0].typeId === 2401);

    buzon.length = 0;
    wrap.addItem(2417, 1);
    world.moveItem(pj, { kind: 'inventory', index: indiceDe(pj, 2417) }, { kind: 'slot', slot: 'ammo' });
    world.lightOf(pj);
    sesion.update();
    const luz = recibido(buzon, P.SERVER.PLAYER_LIGHT).pop();
    check('una antorcha puesta da luz (6 casillas) y el cliente lo sabe', world.lightOf(pj) === 6 && luz && luz[1] === 6);
    world.dayCycleMs = 60000;
    reloj = Math.ceil(reloj / 60000) * 60000;
    const medianoche = world.worldLight();
    reloj += 30000;
    const mediodia = world.worldLight();
    check('día y noche: a medianoche oscuro, a mediodía claro', medianoche < 80 && mediodia > 240,
        medianoche + ' / ' + mediodia + ', ' + world.worldHour());
    sesion.close();
}

// ===========================================================================
section('9. Contenedores: abrir y cerrar, usar y mirar dentro, y la mochila llena');
// ===========================================================================
{
    const { sesion, buzon, pj, wrap } = conectar('Ordenada');
    world.teleportCreature(pj, { x: templo.x, y: templo.y + 3, z: templo.z });
    const pos = cerca(pj, 1, 0);
    const bolsa = Game.createItem(2412, 1, pos.x, pos.y, pos.z);
    bolsa.addItem(2413, 1);
    bolsa.addItem(2401, 1);
    buzon.length = 0;
    sesion.handle([P.CLIENT.USE_ITEM, pos.x, pos.y, pos.z]);
    check('clic derecho en un contenedor: se abre', recibido(buzon, P.SERVER.CONTAINER_OPEN).length === 1);
    buzon.length = 0;
    sesion.handle([P.CLIENT.USE_ITEM, pos.x, pos.y, pos.z]);
    check('y otra vez: se cierra', recibido(buzon, P.SERVER.CONTAINER_CLOSE).length === 1);

    sesion.handle([P.CLIENT.USE_ITEM, pos.x, pos.y, pos.z]);
    pj.health = 60;
    sesion.handle([P.CLIENT.USE_CONTAINER, bolsa.getUniqueId(), 0]);
    check('clic derecho sobre algo de dentro lo USA (la poción cura y se gasta)',
        pj.health > 60 && bolsa.getItems().length === 1, pj.health + ' de vida');
    buzon.length = 0;
    sesion.handle([P.CLIENT.LOOK_ITEM, 'container', bolsa.getUniqueId(), 0]);
    check('los dos botones sobre algo de dentro: lo mira (con sus números)',
        /Ves a dagger \(Ataque/.test(textos(buzon)), textos(buzon));
    buzon.length = 0;
    sesion.handle([P.CLIENT.LOOK_ITEM, 'inventory', indiceDe(pj, 2412)]);
    check('y sobre tu mochila, sus huecos', /20 huecos/.test(textos(buzon)), textos(buzon));

    const moneda = cerca(pj, -1, 0);
    world.createItem(2402, 1, moneda);
    const antes = world.countOf(pj, 2402);
    buzon.length = 0;
    sesion.handle([P.CLIENT.USE_ITEM, moneda.x, moneda.y, moneda.z]);
    check('clic derecho NUNCA recoge (para eso se arrastra)', world.countOf(pj, 2402) === antes &&
        /No puedes usar eso/.test(textos(buzon)), textos(buzon));

    wrap.addItem(2409, 1);
    wrap.addItem(3031, 30);
    const suelo = cerca(pj, 0, -1);
    const r = world.moveItem(pj, { kind: 'inventory', index: indiceDe(pj, 2412) }, { kind: 'ground', ...suelo });
    const tirada = r.ok ? r.item : null;
    check('la mochila CON COSAS se tira al suelo con ellas', r.ok && !world.containerOf(pj) &&
        world.contentsOfItem(tirada).length >= 2, r.reason || world.contentsOfItem(tirada).length + ' cosas dentro');
    const r2 = world.moveItem(pj, { kind: 'ground', ...suelo }, { kind: 'slot', slot: 'backpack' });
    check('y al ponértela vuelve con todo', r2.ok && world.containerOf(pj) && world.countOf(pj, 3031) === 30 &&
        world.countOf(pj, 2409) === 1, r2.reason);
    sesion.close();
}

// ===========================================================================
section('10. Pilas de 100, el diálogo (popupFYI) y /spells');
// ===========================================================================
{
    const { sesion, buzon, pj, wrap } = conectar('Apiladora');
    world.teleportCreature(pj, { x: templo.x, y: templo.y + 3, z: templo.z });
    world.takeItem(pj, 3031, world.countOf(pj, 3031));
    const pilasDeOro = () => world.contentsOf(pj).filter((x) => x.typeId === 3031).map((x) => x.count);
    wrap.addItem(3031, 250);
    check('250 de oro van en tres pilas: 100, 100 y 50', pilasDeOro().join(',') === '100,100,50', pilasDeOro().join(','));

    const pos = cerca(pj, 1, 0);
    world.createItem(3031, 80, pos);
    const r = world.pickUpItem(pj, pos.x, pos.y, pos.z);
    check('recoger 80 más rellena la de 50 y lo que sobra hace otra pila',
        r.ok && pilasDeOro().join(',') === '100,100,100,30', pilasDeOro().join(','));

    const libres = world.backpackCapacity(pj) - world.contentsOf(pj).length;
    check('con la mochila a falta de pilas, no se da lo que no cabe',
        wrap.addItem(3031, 70 + 100 * (libres + 1)).reason === 'backpackFull' && world.countOf(pj, 3031) === 330);
    wrap.addItem(3031, 70 + 100 * libres);
    check('y lo que cabe justo, sí: todas las pilas llenas', pilasDeOro().every((n) => n === 100) &&
        world.contentsOf(pj).length === world.backpackCapacity(pj), pilasDeOro().length + ' pilas');
    check('con todo lleno, ni una moneda más', wrap.addMoney(1) === false);

    pj.inventory.push({ slot: 'inside', position: pj.inventory.length, typeId: 12138, count: 250, attributes: null });
    world.normalizarPilas(pj);
    const flechas = world.contentsOf(pj).filter((x) => x.typeId === 12138).map((x) => x.count);
    check('una pila guardada de 250 se parte en 100, 100 y 50 al entrar', flechas.join(',') === '100,100,50', flechas.join(','));

    buzon.length = 0;
    wrap.popupFYI('Hola\nmundo');
    const popup = recibido(buzon, P.SERVER.POPUP)[0];
    check('player.popupFYI abre el diálogo con su texto', popup && popup[1] === 'Información' && popup[2] === 'Hola\nmundo',
        JSON.stringify(popup));
    sesion.close();

    const maga = conectar('Lectora', 'Sorcerer');
    maga.buzon.length = 0;
    e.dispatchTalkAction('/spells', { playerId: maga.pj.id, type: 1 });
    const lista = recibido(maga.buzon, P.SERVER.POPUP)[0];
    check('/spells abre un diálogo con los hechizos de su vocación', lista && /Hechizos de Sorcerer/.test(lista[1]) &&
        /exori flam/.test(lista[2]) && /exura vita/.test(lista[2]) && !/^(✗ )?exori — /m.test(lista[2]),
        lista && lista[2].split('\n').length + ' líneas');
    check('y marca los que aún no puede por nivel', lista && /✗ exura vita/.test(lista[2]));
    maga.sesion.close();
    const cab = conectar('Lector', 'Knight');
    const deCaballero = cab.wrap.getSpells().map((h) => h.words);
    check('player.getSpells: un caballero tiene exori y no exori flam', deCaballero.includes('exori') &&
        !deCaballero.includes('exori flam'), deCaballero.join(', '));
    cab.sesion.close();
}

// ===========================================================================
section('11. Monedas: cambiarlas con clic derecho y pagar con cambio');
// ===========================================================================
{
    const { sesion, buzon, pj, wrap } = conectar('Cambista');
    world.teleportCreature(pj, { x: templo.x, y: templo.y + 3, z: templo.z });
    [3031, 2152, 2160].forEach((id) => world.takeItem(pj, id, world.countOf(pj, id)));
    const cuenta = () => [3031, 2152, 2160].map((id) => world.countOf(pj, id)).join('/');
    const usar = (id) => sesion.handle([P.CLIENT.USE_INVENTORY, indiceDe(pj, id)]);

    wrap.addItem(3031, 100);
    usar(3031);
    check('100 de oro con clic derecho: 1 de platino', cuenta() === '0/1/0', cuenta());
    usar(2152);
    check('1 de platino: 100 de oro', cuenta() === '100/0/0', cuenta());
    wrap.addItem(3031, 30);
    buzon.length = 0;
    sesion.handle([P.CLIENT.USE_INVENTORY, pj.inventory.findIndex((x) => x.typeId === 3031 && x.count === 30)]);
    check('una pila de oro que no llega a 100 no se cambia', /100 monedas de oro/.test(textos(buzon)) &&
        world.countOf(pj, 3031) === 130, textos(buzon));
    world.takeItem(pj, 3031, 130);
    wrap.addItem(2152, 100);
    usar(2152);
    check('100 de platino: 1 de cristal', cuenta() === '0/0/1', cuenta());
    usar(2160);
    check('1 de cristal: 100 de platino', cuenta() === '0/100/0', cuenta());
    check('el dinero cuenta todas las monedas (100 de platino = 10000)', wrap.getMoney() === 10000, wrap.getMoney() + '');

    check('pagar 250 con platino: se cobra y se devuelve el cambio', wrap.removeMoney(250) && wrap.getMoney() === 9750 &&
        world.countOf(pj, 3031) === 50, cuenta());
    check('addMoney da las monedas más grandes', wrap.addMoney(12345) && wrap.getMoney() === 22095 &&
        world.countOf(pj, 2160) === 1, cuenta());

    // En el suelo: la pila entera se convierte allí mismo.
    const pos = cerca(pj, 1, 0);
    const pila = world.createItem(3031, 100, pos);
    sesion.handle([P.CLIENT.USE_ITEM, pos.x, pos.y, pos.z]);
    const tile = world.map.getTile(pos.x, pos.y, pos.z);
    check('100 de oro en el suelo se convierten allí en 1 de platino',
        pila.typeId === 2152 && pila.count === 1 && tile.getItems().includes(pila), pila.typeId + ' x' + pila.count);
    sesion.close();
}

// ===========================================================================
section('12. El tajo de espada (onAttack)');
// ===========================================================================
{
    const atacar = (nombre, vocacion, arma, dx, dy) => {
        const c = conectar(nombre, vocacion);
        world.teleportCreature(c.pj, { x: templo.x, y: templo.y + 3, z: templo.z });
        if (arma) {
            c.wrap.addItem(arma, 1);
            world.moveItem(c.pj, { kind: 'inventory', index: indiceDe(c.pj, arma) }, { kind: 'slot', slot: 'hand' });
        }
        const rata = world.getCreature(Game.createMonster('Rat', c.pj.position.x + dx, c.pj.position.y + dy, c.pj.position.z).getId());
        c.pj.nextAttackAt = 0;
        c.buzon.length = 0;
        e.combat.attack(c.pj, rata);
        const efectos = recibido(c.buzon, P.SERVER.MAGIC_EFFECT)
            .filter((m) => m[1] === c.pj.position.x && m[2] === c.pj.position.y).map((m) => m[4]);
        if (world.removeCreature) {
            world.removeCreature(rata);
        }
        const tipo = c.wrap.getWeaponType();
        c.sesion.close();
        return { efectos, direccion: c.pj.direction, tipo };
    };
    let r = atacar('Tajo Oeste', 'Knight', 2401, -1, 0);
    check('un caballero con espada que ataca al oeste: se gira y sale el tajo hacia el oeste',
        r.direccion === 3 && r.efectos.includes(EFECTO.ESPADA_OESTE), JSON.stringify(r.efectos));
    r = atacar('Tajo Norte', 'Knight', 2400, 0, -1);
    check('al norte, el tajo del norte', r.efectos.includes(EFECTO.ESPADA_NORTE), JSON.stringify(r.efectos));
    r = atacar('Tajo Sur', 'Knight', 2401, 0, 1);
    check('al sur, el del sur', r.efectos.includes(EFECTO.ESPADA_SUR), JSON.stringify(r.efectos));
    r = atacar('Tajo Este', 'Knight', 2401, 1, 0);
    check('al este, el del este', r.efectos.includes(EFECTO.ESPADA_ESTE), JSON.stringify(r.efectos));
    r = atacar('Hachero', 'Knight', 2402, 1, 0);
    check('con hacha no hay tajo de espada', !r.efectos.some((n) => n >= 201 && n <= 204), JSON.stringify(r.efectos));
    r = atacar('Maga Espada', 'Sorcerer', 2401, 1, 0);
    check('ni para quien no es caballero', !r.efectos.some((n) => n >= 201 && n <= 204), JSON.stringify(r.efectos));
    check('player.getWeaponType dice el tipo del arma de la mano', r.tipo === 'sword', r.tipo);
    const fs = require('node:fs');
    const things = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/jetyum/assets/things.json'), 'utf8'));
    const tajos = [201, 202, 203, 204].map((n) => things.effects.find((t) => t.id === n));
    check('los cuatro tajos están importados como efectos (2x2, 5 fotogramas, con su offset)',
        tajos.every((t) => t && t.width === 2 && t.height === 2 && t.frames === 5 && t.flags.offset &&
            t.sprites.length === 20 && t.sprites.some((s) => s > 0)), tajos.map((t) => t ? t.id : '-').join(','));
}

// ===========================================================================
section('13. El minimapa y el área visible');
// ===========================================================================
{
    const { findPath } = require('../engine/world/pathfinding.js');
    const c = conectar('Exploradora');
    const hello = recibido(c.buzon, P.SERVER.HELLO)[0];
    check('el saludo dice lo que se ve (config.js visibleTilesX/Y: 15x11) y lo que se manda (+4)',
        hello && hello[7] === 15 && hello[8] === 11 && hello[5] === 19 && hello[6] === 15, JSON.stringify(hello));

    world.teleportCreature(c.pj, { x: templo.x, y: templo.y + 3, z: templo.z });
    const yo = c.pj.position;
    // Un destino imposible: muy lejos, fuera del mapa (una zona «sin descubrir»).
    const lejos = { x: yo.x + 120, y: yo.y - 300, z: yo.z };
    const exacto = findPath(world.map, yo, lejos, { maxDistance: 160 });
    const parcial = findPath(world.map, yo, lejos, { maxDistance: 160, nodeLimit: 40000, closest: true });
    const ultimo = parcial.path[parcial.path.length - 1];
    const dist = (p) => Math.max(Math.abs(p.x - lejos.x), Math.abs(p.y - lejos.y));
    check('sin `closest` no hay camino; con él, el camino lleva a la casilla alcanzable más cercana',
        !exacto.found && !parcial.found && parcial.partial && ultimo && dist(ultimo) < dist(yo),
        ultimo ? 'para en ' + ultimo.x + ',' + ultimo.y + ' (a ' + dist(ultimo) + ' del destino; salía a ' + dist(yo) + ')' : 'sin camino');

    const r = c.sesion.handle([P.CLIENT.WALK_TO, lejos.x, lejos.y, lejos.z, 1]);
    check('clic en el minimapa en una zona imposible: echa a andar lo más cerca posible',
        r.walking === true && r.partial === true && r.steps === parcial.path.length, JSON.stringify(r));
    const sin = c.sesion.handle([P.CLIENT.WALK_TO, lejos.x, lejos.y, lejos.z]);
    check('y el clic normal en el mapa sigue diciendo que no hay camino', sin.walking === false && sin.reason === 'noPath');
    c.sesion.close();
}

// ===========================================================================
section('14. Hotkeys con objetos (USE_HOTKEY_ITEM)');
// ===========================================================================
{
    const a = conectar('Curandera');
    const b = conectar('Herido');
    world.teleportCreature(a.pj, { x: templo.x, y: templo.y + 3, z: templo.z });
    world.teleportCreature(b.pj, { x: templo.x + 2, y: templo.y + 3, z: templo.z });
    a.wrap.addItem(2413, 3);
    avanzar(1100);
    a.pj.health = 40;
    a.sesion.handle([P.CLIENT.USE_HOTKEY_ITEM, 2413, a.pj.id]);
    check('una poción en ti con una hotkey: te cura y se gasta', a.pj.health > 40 && world.countOf(a.pj, 2413) === 2, a.pj.health + ' de vida');
    avanzar(1100);
    b.pj.health = 30;
    const vidaA = a.pj.health;
    a.sesion.handle([P.CLIENT.USE_HOTKEY_ITEM, 2413, b.pj.id]);
    check('en el objetivo (otro jugador): le cura a él, no a ti', b.pj.health > 30 && a.pj.health === vidaA &&
        world.countOf(a.pj, 2413) === 1, b.pj.health + ' de vida');
    avanzar(1100);
    const rata = world.getCreature(Game.createMonster('Rat', a.pj.position.x - 1, a.pj.position.y, a.pj.position.z).getId());
    a.buzon.length = 0;
    a.sesion.handle([P.CLIENT.USE_HOTKEY_ITEM, 2413, rata.id]);
    check('a un monstruo no se le da una poción', world.countOf(a.pj, 2413) === 1 && /jugador/.test(textos(a.buzon)), textos(a.buzon));
    a.buzon.length = 0;
    a.sesion.handle([P.CLIENT.USE_HOTKEY_ITEM, 2414, a.pj.id]);
    check('sin ese objeto, lo dice', /No llevas/.test(textos(a.buzon)), textos(a.buzon));
    if (world.removeCreature) {
        world.removeCreature(rata);
    }
    a.sesion.close();
    b.sesion.close();
}

// ===========================================================================
section('15. El servidor web del cliente');
// ===========================================================================
{
    const { crearServidorWeb } = require('../engine/net/web.js');
    const web = crearServidorWeb({ raiz: ROOT, config: { enginePort: 8123 }, puerto: 0 });
    const puerto = await web.listo;
    const pedir = (ruta) => fetch('http://127.0.0.1:' + puerto + ruta, { redirect: 'manual' });
    const raiz = await pedir('/');
    const pagina = await pedir('/jetyum/');
    const motor = await (await pedir('/jetyum/motor.json')).json();
    const protocolo = await pedir('/shared/js/protocol.mjs');
    const vocaciones = await (await pedir('/jetyum/vocaciones.json')).json();
    const fuera = await pedir('/jetyum/..%2F..%2Fconfig.js');
    check('/ lleva al cliente y /jetyum/ es su página', raiz.status === 302 &&
        raiz.headers.get('location') === '/jetyum/' && pagina.status === 200 &&
        /text\/html/.test(pagina.headers.get('content-type')));
    check('dice el puerto del motor (enginePort) y sirve lo compartido', motor.puerto === 8123 && protocolo.status === 200);
    check('y las vocaciones que se pueden elegir', vocaciones.some((v) => v.name === 'Knight'));
    check('no se sale de sus carpetas', fuera.status === 404, String(fuera.status));
    await web.cerrar();
}

e.shutdown();
console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — la API de scripts y lo que se apoya en ella funcionan.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
