/**
 * PRUEBAS DE LAS REGLAS DEL MUNDO Y DE LAS MONTURAS (la «fase 1»).
 *
 *     node tools/test-reglas.mjs        (o npm run test:reglas)
 *
 * Con el motor de verdad, el mapa `jetyum` (el templo es zona de protección) y el reloj en la mano:
 *
 *   1. los grupos de acceso: los comandos de GM no existen para un jugador; `/grupo` los da
 *   2. las zonas de protección, el no-PvP y el nivel de protección, en golpes y en hechizos
 *   3. en combate y PZ lock: no salir, no entrar en una zona de protección, quedarse si se cae
 *   4. la red: servidor lleno, ritmo del chat, mensajes por segundo y tamaño de un mensaje
 *   5. la configuración: rates, luz, templo de la ciudad, nivel inicial
 *   6. el sanador cura (y no en combate)
 *   7. las monturas: cuáles hay, montar y desmontar, velocidad, protocolo y guardado
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');
const { createNetworkServer } = require('../engine/net/server.js');
const P = require('../engine/net/protocol.js');
const { WebSocket } = require('ws');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

const e = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { mapName: 'jetyum', mapFile: null, useDatabase: false } });
const world = e.world;

// EL RELOJ EN LA MANO: el mundo y el planificador miran este número.
let reloj = 50000000;
world.now = () => reloj;
e.scheduler.now = () => reloj;
const avanzar = (ms) => {
    for (let t = 0; t < ms; t += 50) {
        reloj += 50;
        world.tick();
        e.scheduler.tick(1000);
    }
};

const templo = world.map.getWaypoint('temple');
const enPz = (pos) => {
    const t = world.map.getTile(pos.x, pos.y, pos.z);
    return !!(t && t.isProtectionZone());
};

/** Un sitio de 7x7 casillas transitables FUERA de toda zona de protección (ver test-scripts). */
const arena = (() => {
    for (let r = 4; r < 60; r += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
                const c = { x: templo.x + dx, y: templo.y + dy, z: templo.z };
                let libre = true;
                for (let yy = -3; yy <= 3 && libre; yy += 1) {
                    for (let xx = -3; xx <= 3 && libre; xx += 1) {
                        const t = world.map.getTile(c.x + xx, c.y + yy, c.z);
                        libre = (!t || (!t.isProtectionZone() && t.creatures.length === 0)) &&
                            world.map.isWalkable(c.x + xx, c.y + yy, c.z);
                    }
                }
                if (libre) {
                    return c;
                }
            }
        }
    }
    throw new Error('no hay sitio fuera de las zonas de protección para las pruebas');
})();

/** Una sesión con su buzón (sin base de datos: personaje efímero). */
function conectar(nombre, donde) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    sesion.handle([P.CLIENT.LOGIN, 'cuenta', 'clave', nombre, 'Knight', 'male']);
    if (donde && sesion.player) {
        world.teleportCreature(sesion.player, donde);
    }
    return { sesion, buzon, pj: sesion.player };
}
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]).join(' | ');
const limpiarCombate = (...pjs) => pjs.forEach((p) => world.clearCombat(p));

// ===========================================================================
section('1. Grupos de acceso');
// ===========================================================================
{
    check('se cargan los seis grupos de groups.js', world.groups.size === 6 &&
        world.groupByName('god').id === 6 && world.groupByName('gamemaster').access === true);
    const { sesion, buzon, pj } = conectar('Llano', arena);
    check('un personaje sin grupo es jugador (1)', world.groupOf(pj).id === 1 && !world.isStaff(pj));

    const items = world.items.size;
    sesion.handle([P.CLIENT.SAY, '/item 3031']);
    check('/item no existe para un jugador: no crea nada', world.items.size === items);
    const raids = textos(buzon);
    sesion.handle([P.CLIENT.SAY, '/raid']);
    check('/raid tampoco (no responde con la lista)', textos(buzon) === raids || !/Raids:/.test(textos(buzon)));
    sesion.handle([P.CLIENT.SAY, '/ir templo']);
    check('/ir es de gamemaster: no le lleva al templo', pj.position.x === arena.x && pj.position.y === arena.y);

    pj.groupId = 4;
    check('un gamemaster tiene ese grupo y los de debajo, no los de encima',
        world.hasGroup(pj, 'gamemaster') && world.hasGroup(pj, 'tutor') && !world.hasGroup(pj, 'god'));
    sesion.handle([P.CLIENT.SAY, '/ir templo']);
    check('un gamemaster sí puede usar /ir', pj.position.x === templo.x && pj.position.y === templo.y);
    sesion.handle([P.CLIENT.SAY, '/item 3031']);
    check('pero /item sigue siendo de god', world.items.size === items);

    pj.groupId = 6;
    sesion.handle([P.CLIENT.SAY, '/item 3031']);
    check('un god sí crea objetos', world.items.size === items + 1);
    const otro = conectar('Ascendido', arena);
    sesion.handle([P.CLIENT.SAY, '/grupo Ascendido, gamemaster']);
    check('/grupo da un grupo a otro jugador conectado', otro.pj.groupId === 4, textos(buzon).slice(-80));
    sesion.handle([P.CLIENT.SAY, '/grupo Ascendido, emperador']);
    check('y avisa de un grupo que no existe', /no existe el grupo/.test(textos(buzon)));
    check('un grupo mal escrito en una talkaction no lo tiene nadie', !world.hasGroup(pj, 'administrador'));
    sesion.close();
    otro.sesion.close();
}

// ===========================================================================
section('2. Zonas de protección, no-PvP y nivel de protección');
// ===========================================================================
{
    check('el templo es zona de protección y la arena no', enPz(templo) && !enPz(arena));
    const a = conectar('Atacante', arena);
    const b = conectar('Victima', { x: arena.x + 1, y: arena.y, z: arena.z });
    check('en la arena, un jugador puede atacar a otro', world.combatBlocked(a.pj, b.pj) === null);

    world.teleportCreature(b.pj, templo);
    world.teleportCreature(a.pj, { x: templo.x + 1, y: templo.y, z: templo.z });
    check('en el templo, no', world.combatBlocked(a.pj, b.pj) !== null);
    const intento = a.sesion.handle([P.CLIENT.ATTACK, b.pj.id]);
    check('el ataque se rechaza y se dice por qué', intento.result.reason === 'protected' &&
        /zona de protección/.test(textos(a.buzon)), textos(a.buzon).slice(-90));
    check('y la víctima no pierde vida', b.pj.health === b.pj.maxHealth);

    // Un hechizo de área tampoco hiere dentro de una zona de protección.
    const rata = world.createMonster('Rat', { x: templo.x, y: templo.y + 1, z: templo.z });
    const antes = rata ? rata.health : 0;
    const golpes = Game.doAreaCombat(e.registry.entities.player(a.pj.id), templo, Game.area.circulo(2),
        { type: 'fire', min: 30, max: 30 });
    check('un hechizo de área no hiere a nadie en la zona de protección',
        rata && rata.health === antes && golpes.every((g) => g.result.hit === false));
    check('los monstruos no persiguen a quien está en la zona de protección',
        !rata || e.ai._findNearestPlayer(rata) === null);
    if (rata) {
        world.removeMonster(rata.id);
    }

    world.teleportCreature(a.pj, arena);
    world.teleportCreature(b.pj, { x: arena.x + 1, y: arena.y, z: arena.z });
    world.worldType = 'no-pvp';
    check('en un mundo no-pvp los jugadores no se atacan', world.combatBlocked(a.pj, b.pj).reason === 'noPvpWorld');
    const rata2 = world.createMonster('Rat', { x: arena.x, y: arena.y + 1, z: arena.z });
    check('pero a un monstruo sí', rata2 && world.combatBlocked(a.pj, rata2) === null);
    if (rata2) {
        world.removeMonster(rata2.id);
    }
    world.worldType = 'pvp';
    world.protectionLevel = 8;
    check('por debajo del nivel de protección no se ataca', world.combatBlocked(a.pj, b.pj).reason === 'attackerLevel');
    world.protectionLevel = 1;
    limpiarCombate(a.pj, b.pj);
    a.sesion.close();
    b.sesion.close();
}

// ===========================================================================
section('3. En combate y PZ lock');
// ===========================================================================
{
    const a = conectar('Agresor', arena);
    const b = conectar('Agredido', { x: arena.x + 1, y: arena.y, z: arena.z });
    check('antes de pelear nadie está en combate', !world.isInFight(a.pj) && !world.isInFight(b.pj));
    a.pj.nextAttackAt = 0;
    e.combat.attack(a.pj, b.pj);
    // Un golpe y nada más: con objetivo puesto seguiría pegando (y el combate no acabaría nunca).
    a.pj.target = null;
    check('al pegar, los dos quedan en combate', world.isInFight(a.pj) && world.isInFight(b.pj));
    check('y el que pegó a un jugador, con PZ lock', world.isPzLocked(a.pj) && !world.isPzLocked(b.pj));

    const stats = e.view.statsOf(a.pj);
    check('las estadísticas lo dicen (los iconos del cliente)', stats.inFight === true && stats.pzLocked === true);

    a.buzon.length = 0;
    const salida = a.sesion.handle([P.CLIENT.LOGOUT]);
    const r = a.buzon.find((m) => m[0] === P.SERVER.LOGOUT_RESULT);
    check('en combate no se puede salir', salida.ok === false && r && r[1] === 0 && world.getPlayer(a.pj.id) !== null);

    // Junto a una zona de protección (una casilla de la arena, marcada para la prueba): con PZ lock
    // no se entra.
    const dentro = { x: arena.x, y: arena.y - 1, z: arena.z };
    const casilla = world.map.getOrCreateTile(dentro.x, dentro.y, dentro.z);
    casilla.setFlag(1, true);   // TILE_FLAGS.PROTECTION_ZONE
    world.teleportCreature(a.pj, arena);
    a.pj.nextStepAt = 0;
    const paso = a.sesion.handle([P.CLIENT.WALK_NORTH]);
    check('con PZ lock no entra en la zona de protección', paso.reason === 'pzLocked' &&
        a.pj.position.y === arena.y && /zona de protección/.test(textos(a.buzon)), paso.reason);
    avanzar(world.pzLockMs() + 100);
    a.pj.nextStepAt = 0;
    a.sesion.handle([P.CLIENT.WALK_NORTH]);
    check('pasado el PZ lock, sí', a.pj.position.y === dentro.y);
    casilla.setFlag(1, false);
    check('pasado el tiempo, ya no está en combate', !world.isInFight(a.pj));
    a.buzon.length = 0;
    const ok = a.sesion.handle([P.CLIENT.LOGOUT]);
    check('y puede salir', ok.ok === true && world.getPlayer(a.pj.id) === null &&
        a.buzon.some((m) => m[0] === P.SERVER.LOGOUT_RESULT && m[1] === 1));

    // Si se cae la conexión en combate, se queda en el mundo hasta que acabe.
    const c = conectar('Fugitivo', arena);
    world.noteCombat(b.pj, c.pj);
    c.sesion.close();
    check('si se cae la conexión en combate, se queda en el mundo', world.getPlayer(c.pj.id) !== null);
    avanzar(world.pzLockMs() + 1500);
    check('y sale al acabar el combate', world.getPlayer(c.pj.id) === null);
    limpiarCombate(b.pj);
    b.sesion.close();
}

// ===========================================================================
section('4. La red: servidor lleno, ritmo del chat y del socket');
// ===========================================================================
{
    const maximo = e.config.maxPlayers;
    e.config.maxPlayers = world.players.size + 1;
    const primero = conectar('Cabe', arena);
    const segundo = conectar('NoCabe', arena);
    check('con el servidor lleno no entra nadie más', primero.pj && !segundo.pj &&
        segundo.buzon.some((m) => m[0] === P.SERVER.LOGIN_ERROR && /lleno/.test(m[1])));
    e.config.maxPlayers = maximo;

    primero.buzon.length = 0;
    for (let i = 0; i < 10; i += 1) {
        primero.sesion.handle([P.CLIENT.SAY, 'hola ' + i]);
    }
    check('el chat tiene ritmo: a la séptima frase seguida se para', /demasiado deprisa/.test(textos(primero.buzon)));
    avanzar(6000);
    const r = primero.sesion.handle([P.CLIENT.SAY, 'ya puedo']);
    check('y al rato se puede volver a hablar', r.ok !== false);
    primero.pj.groupId = 4;
    primero.buzon.length = 0;
    for (let i = 0; i < 10; i += 1) {
        primero.sesion.handle([P.CLIENT.SAY, 'gm ' + i]);
    }
    check('el personal no tiene límite', !/demasiado deprisa/.test(textos(primero.buzon)));
    primero.sesion.close();

    // El socket: demasiados mensajes por segundo o uno enorme, y se cierra.
    const red = createNetworkServer({ engine: e, port: 0, logger: { info() {}, warning() {} } });
    const puerto = await red.ready;
    const cerrado = (ws) => new Promise((resolve) => ws.on('close', (code) => resolve(code)));
    const abierto = (ws) => new Promise((resolve) => ws.on('open', resolve));

    const inundador = new WebSocket('ws://127.0.0.1:' + puerto);
    await abierto(inundador);
    const finInundador = cerrado(inundador);
    inundador.send(JSON.stringify(Array.from({ length: e.config.maxPacketsPerSecond * 4 }, () => [P.CLIENT.SAY, 'x'])));
    const codigo = await Promise.race([finInundador, new Promise((res) => setTimeout(() => res('abierto'), 2000))]);
    check('quien manda el triple de mensajes por segundo se desconecta', codigo === 1008, String(codigo));

    const gordo = new WebSocket('ws://127.0.0.1:' + puerto);
    await abierto(gordo);
    const finGordo = cerrado(gordo);
    gordo.send('x'.repeat((e.config.maxMessageBytes || 65536) + 10));
    const codigoGordo = await Promise.race([finGordo, new Promise((res) => setTimeout(() => res('abierto'), 2000))]);
    check('y un mensaje más grande que maxMessageBytes, también', codigoGordo === 1009, String(codigoGordo));
    await red.close();
}

// ===========================================================================
section('5. Configuración: rates, luz y templo');
// ===========================================================================
{
    const { pj, sesion } = conectar('Rates', arena);
    const rata = { experience: 10 };
    let antes = pj.experience;
    e.combat.grantExperience(pj, rata);
    const normal = pj.experience - antes;
    pj.level = 1;
    pj.experience = antes;
    e.combat.config.rateExperience = 3;
    antes = pj.experience;
    e.combat.grantExperience(pj, rata);
    check('rateExperience multiplica la experiencia (después de las etapas)', pj.experience - antes === normal * 3,
        normal + ' x3 → ' + (pj.experience - antes));
    e.combat.config.rateExperience = 1;

    const sk = pj.skills.sword.tries;
    world.rateSkill = 4;
    world.addSkillTries(pj, 'sword', 1);
    check('rateSkill multiplica lo que se entrena', pj.skills.sword.tries - sk === 4 || pj.skills.sword.level > 10);
    world.rateSkill = 1;

    world.dayLight = 120;
    check('defaultWorldLight pone la luz máxima del día', world.worldLight() <= 120);
    world.dayLight = 255;

    const ciudad = world.map.towns[0];
    check('el templo de un jugador es el de su ciudad', ciudad &&
        JSON.stringify(world.templeOf(pj)) === JSON.stringify({ x: ciudad.temple.x, y: ciudad.temple.y, z: ciudad.temple.z }));
    sesion.close();
}

// ===========================================================================
section('6. El sanador cura');
// ===========================================================================
{
    const { pj, sesion } = conectar('Herido', arena);
    const sanador = world.getNpc('Sanador');
    world.teleportCreature(pj, { x: sanador.position.x + 1, y: sanador.position.y, z: sanador.position.z });
    const wrap = e.registry.entities.player(pj.id);
    let dichos = [];
    world.on('onCreatureSay', (c, t) => {
        if (c === sanador) {
            dichos.push(t);
        }
    });
    const oye = (texto) => {
        dichos = [];
        world.creatureSay(pj.id, texto);
        return dichos.join(' ');
    };
    oye('hola');
    pj.health = 40;
    wrap.addCondition({ type: 'veneno', ticks: 10, interval: 2000, value: 2 });
    world.noteCombat(pj, pj);
    pj.inFightUntil = reloj + 10000;
    check('en combate no cura', /pelea/.test(oye('curar')) && pj.health === 40);
    limpiarCombate(pj);
    const dicho = oye('curar');
    check('fuera de combate, cierra las heridas y quita el veneno', pj.health === pj.maxHealth &&
        !wrap.hasCondition('veneno') && /cerrado las heridas/.test(dicho), dicho);
    check('y sano, no tiene nada que curar', /nada que curar/.test(oye('curar')));
    sanador.clearFocus();
    sesion.close();
}

// ===========================================================================
section('7. Monturas');
// ===========================================================================
{
    check('se cargan las cinco monturas de mounts.js', world.mountTypes.size === 5 &&
        world.mountTypes.get(1).lookType === 312);
    const { pj, sesion, buzon } = conectar('Jinete', arena);
    const mias = world.mountsOf(pj).map((m) => m.id);
    check('de serie tiene las desbloqueadas (oso de carga y cerdo)', mias.includes(1) && mias.includes(2) && !mias.includes(3));

    check('sin montura elegida no se monta', world.rideMount(pj, true).ok === false);
    buzon.length = 0;
    sesion.handle([P.CLIENT.REQUEST_OUTFIT]);
    const ventana = buzon.find((m) => m[0] === P.SERVER.OUTFIT_WINDOW);
    check('la ventana del personaje trae las monturas', ventana && Array.isArray(ventana[1].mounts) &&
        ventana[1].mounts.length === 2 && ventana[1].mount === 0 && ventana[1].mounted === false);

    const velocidad = pj.speed;
    const o = pj.outfit;
    sesion.handle([P.CLIENT.SET_OUTFIT, o.lookType, o.head, o.body, o.legs, o.feet, o.addons, 1, 1]);
    check('SET_OUTFIT con montura: monta en el oso de carga', pj.mounted === true && pj.mountId === 1 &&
        pj.outfit.lookMount === 312);
    check('y suma su velocidad', pj.speed === velocidad + 10, velocidad + ' → ' + pj.speed);
    check('el protocolo manda la montura de la criatura', P.message(P.SERVER.CREATURE_ADD, ...P.describeCreature(pj))[P.CREATURE_FIELD.MOUNT] === 312);
    check('y las estadísticas dicen que va montado', e.view.statsOf(pj).mounted === true);

    const t = sesion.handle([P.CLIENT.TOGGLE_MOUNT]);
    check('Ctrl+R justo después espera (no se puede hacer parpadear)', t.ok === false && pj.mounted === true);
    avanzar(2100);
    sesion.handle([P.CLIENT.TOGGLE_MOUNT]);
    check('pasado el momento, desmonta y vuelve a su velocidad', pj.mounted === false &&
        pj.outfit.lookMount === 0 && pj.speed === velocidad);

    world.teleportCreature(pj, templo);
    avanzar(2100);
    const enTemplo = sesion.handle([P.CLIENT.TOGGLE_MOUNT]);
    check('en una zona de protección no se monta', enTemplo.ok === false && pj.mounted === false);
    world.teleportCreature(pj, arena);

    check('una montura bloqueada no se puede elegir', world.chooseMount(pj, 4).ok === false);
    e.registry.entities.player(pj.id).addMount(4);
    check('hasta que un script se la da (player.addMount)', world.chooseMount(pj, 4).ok === true &&
        world.mountsOf(pj).some((m) => m.id === 4));
    check('la premium no, sin cuenta premium', world.canUseMount(pj, 5).ok === false);
    sesion.close();
}

// ===========================================================================
section('8. Guardado: grupo, ciudad y montura');
// ===========================================================================
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-reglas-'));
    const archivo = path.join(tmp, 'reglas.db');
    const abrir = () => createEngine({ rootDir: ROOT, logLevel: 'error',
        overrides: { mapName: 'jetyum', mapFile: null, useDatabase: true, databaseFile: archivo, newPlayerLevel: 8 } });

    const e1 = abrir();
    const s1 = e1.createSession(() => {});
    s1.handle([P.CLIENT.CREATE_ACCOUNT, 'jinete', 'clave1234', 'Montador', 'Knight', 'male']);
    const p1 = s1.player;
    check('un personaje nuevo empieza en newPlayerLevel y en el templo de su ciudad', p1 && p1.level === 8 &&
        p1.townId === 1);
    e1.world.chooseMount(p1, 1);
    e1.world.rideMount(p1, true, { forzar: true });
    check('la base sabe poner grupos por nombre', e1.repository.database.setCharacterGroup('Montador', 4) &&
        e1.repository.database.characterGroup('montador') === 4);
    s1.close();
    e1.shutdown();

    const e2 = abrir();
    const s2 = e2.createSession(() => {});
    s2.handle([P.CLIENT.LOGIN, 'jinete', 'clave1234', 'Montador']);
    const p2 = s2.player;
    check('al volver es gamemaster', p2 && e2.world.groupOf(p2).name === 'gamemaster');
    check('y vuelve montado en su montura', p2 && p2.mounted === true && p2.mountId === 1 && p2.outfit.lookMount === 312);
    s2.close();
    e2.shutdown();
    fs.rmSync(tmp, { recursive: true, force: true });
}

e.shutdown();
console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — las reglas del mundo y las monturas funcionan.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
