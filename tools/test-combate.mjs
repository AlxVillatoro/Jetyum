/**
 * PRUEBAS DEL COMBATE «COMO EN TIBIA» (la «fase 2»).
 *
 *     node tools/test-combate.mjs        (o npm run test:combate)
 *
 * Con el motor de verdad, el mapa `jetyum` y el reloj en la mano:
 *
 *   1. las fórmulas de TFS: daño por nivel, skill y ataque; modos de combate; escudo y armadura;
 *      acierto a distancia; varitas con sus números
 *   2. las inmunidades de los monstruos (al daño y a las condiciones)
 *   3. los monstruos: hechizos a distancia que necesitan ver al objetivo, mantener la distancia,
 *      huir, curarse, drenar vida y maná, y frases
 *   4. las runas: conjurarlas, usarlas con «usar con» y desde una hotkey, cargas, nivel mágico,
 *      alcance, visión y zonas de protección
 *   5. los campos: fuego al pisarlo, muro mágico que no se atraviesa, destroy field, se apagan solos
 *   6. las herramientas: la pala abre el montón de piedras y la cuerda sube
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');
const P = require('../engine/net/protocol.js');
const { attackProfile, probabilidadDeAcierto } = require('../engine/world/combat.js');

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

let reloj = 60000000;
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
/** Un sitio de 9x9 casillas transitables, libres y FUERA de toda zona de protección. */
const arena = (() => {
    for (let r = 6; r < 70; r += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
                const c = { x: templo.x + dx, y: templo.y + dy, z: templo.z };
                let libre = true;
                for (let yy = -4; yy <= 4 && libre; yy += 1) {
                    for (let xx = -4; xx <= 4 && libre; xx += 1) {
                        const t = world.map.getTile(c.x + xx, c.y + yy, c.z);
                        libre = (!t || (!t.isProtectionZone() && t.creatures.length === 0 && t.getItems().length <= 1)) &&
                            world.map.isWalkable(c.x + xx, c.y + yy, c.z);
                    }
                }
                if (libre) {
                    return c;
                }
            }
        }
    }
    throw new Error('no hay sitio para las pruebas');
})();
const en = (dx, dy) => ({ x: arena.x + dx, y: arena.y + dy, z: arena.z });

function conectar(nombre, donde, vocacion) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    sesion.handle([P.CLIENT.LOGIN, 'cuenta', 'clave', nombre, vocacion || 'Sorcerer', 'male']);
    if (donde) {
        world.teleportCreature(sesion.player, donde);
    }
    return { sesion, buzon, pj: sesion.player };
}
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]).join(' | ');
const limpiarMonstruos = () => Array.from(world.monsters.keys()).forEach((id) => world.removeMonster(id));
const indice = (pj, typeId) => world.inventoryEntry(pj, pj.inventory.findIndex((x) => x.typeId === typeId)) &&
    pj.inventory.findIndex((x) => x.typeId === typeId);

limpiarMonstruos();

// ===========================================================================
section('1. Fórmulas de TFS');
// ===========================================================================
{
    const { pj, sesion } = conectar('Formulas', en(0, 0), 'Knight');
    pj.level = 20;
    pj.weaponType = 'sword';
    pj.weaponAttack = 30;
    pj.skills.sword.level = 40;
    const max = (modo) => {
        pj.fightMode = modo;
        return attackProfile(pj, world).maxDamage;
    };
    const ofensivo = max('ofensivo');
    const equilibrado = max('equilibrado');
    const defensivo = max('defensivo');
    check('el daño máximo es el de TFS 1.x (equilibrado)', equilibrado ===
        Math.round((4 + ((40 / 4 + 1) * (30 / 3) * 1.03) / 1.2) * 1.1), String(equilibrado));
    check('ofensivo pega más y defensivo menos', ofensivo > equilibrado && defensivo < equilibrado,
        ofensivo + ' / ' + equilibrado + ' / ' + defensivo);
    check('el mínimo es nivel/5', attackProfile(pj, world).minDamage === 4);

    check('acertar a distancia depende de la skill y de la distancia (tabla de TFS)',
        probabilidadDeAcierto(50, 1) === 51 && probabilidadDeAcierto(50, 3) === 45 * 1.55 + 6 &&
        probabilidadDeAcierto(10, 7) < probabilidadDeAcierto(10, 1));

    // La armadura sale de `armor` (un casco protege) y el escudo es la defensa.
    const casco = world.items.size;
    pj.inventory.push({ slot: 'head', position: 0, typeId: 11910, count: 1 });
    world.recomputeEquipment(pj);
    check('un casco con armor 4 da 4 de armadura', pj.armorLevel === 4, String(pj.armorLevel) + ' ' + casco);

    // Los modos de combate llegan del cliente; el seguro, encendido de serie.
    sesion.handle([P.CLIENT.FIGHT_MODES, 1, 1, 1]);
    check('FIGHT_MODES pone el modo ofensivo y perseguir', pj.fightMode === 'ofensivo' && pj.chaseMode === true);
    const otro = conectar('Inocente', en(1, 0), 'Knight');
    const seguro = sesion.handle([P.CLIENT.ATTACK, otro.pj.id]);
    check('con el modo seguro no se ataca a un jugador sin calavera', seguro.result.reason === 'secureMode' &&
        otro.pj.health === otro.pj.maxHealth);
    sesion.handle([P.CLIENT.FIGHT_MODES, 2, 0, 0]);
    pj.nextAttackAt = 0;
    const sinSeguro = sesion.handle([P.CLIENT.ATTACK, otro.pj.id]);
    check('sin él, sí (y le pone la calavera blanca)', sinSeguro.result.hit === true && world.skullOf(pj) === 'blanca');
    pj.target = null;
    world.clearCombat(pj);
    world.clearCombat(otro.pj);
    pj.skull = '';
    otro.sesion.close();
    sesion.close();
}

// ===========================================================================
section('2. Inmunidades');
// ===========================================================================
{
    const arana = world.createMonster('Poison Spider', en(3, 3));
    check('la araña venenosa no se envenena (inmune al veneno)',
        world.condiciones.add(arana, { type: 'veneno', ticks: 3, interval: 1000, value: 5 }) === false);
    const golpe = e.combat.applyDamage(arana, 20, { element: 'earth', ignoreArmor: true });
    check('ni recibe daño de tierra', golpe.damage === 0 && golpe.multiplier === 0);
    limpiarMonstruos();
}

// ===========================================================================
section('3. Los monstruos usan todos sus ataques');
// ===========================================================================
{
    const { pj, sesion } = conectar('Presa', en(0, 0), 'Knight');
    pj.maxHealth = pj.health = 5000;
    const ocultista = world.createMonster('Occultist', en(4, 0));
    ocultista.spawn = { x: ocultista.position.x, y: ocultista.position.y, z: ocultista.position.z };
    // El azar, en la mano: le toca siempre (los monstruos también piensan solos con el reloj).
    e.ai.hechizos.random = () => 0;
    const vidaAntes = pj.health;
    const hechizosAntes = e.ai.hechizos.stats.hechizos;
    avanzar(3000);
    const lanzo = e.ai.hechizos.stats.hechizos > hechizosAntes && pj.health < vidaAntes;
    check('el ocultista lanza hechizos a distancia (sin estar al lado)', lanzo &&
        ocultista.position.distanceTo(pj.position) > 1, 'distancia ' + ocultista.position.distanceTo(pj.position));
    check('y mantiene la distancia (targetDistance 4)', ocultista.position.distanceTo(pj.position) >= 2);

    // Un muro en medio: no le ve, no le lanza nada.
    const muro = world.createItem(21025, 1, en(2, 0));
    world.teleportCreature(ocultista, en(4, 0));
    world.teleportCreature(pj, en(0, 0));
    ocultista.relojes = {};
    const sinVer = e.ai.hechizos.atacar(ocultista, pj, reloj);
    check('con un muro mágico en medio no puede lanzarle nada', sinVer === null);
    world.removeItem(muro.instanceId);

    // Huir con poca vida.
    const lobo = world.createMonster('Wolf', en(1, 0));
    lobo.spawn = { x: lobo.position.x, y: lobo.position.y, z: lobo.position.z };
    lobo.health = 3;
    avanzar(1000);
    const antes = lobo.position.distanceTo(pj.position);
    const huida = e.ai.think(lobo);
    check('con poca vida (runHealth) huye en vez de pegar', huida.action === 'flee' &&
        lobo.position.distanceTo(pj.position) >= antes, huida.action);

    // Curarse y drenar.
    const ghoul = world.createMonster('Ghoul', en(-1, 0));
    ghoul.health = 10;
    const curas = e.ai.hechizos.stats.curas;
    avanzar(4100);
    check('el ghoul se cura a sí mismo (healing)', e.ai.hechizos.stats.curas > curas);
    ghoul.health = 10;
    const vida = pj.health;
    e.ai.hechizos.lanzar(ghoul, { name: 'lifedrain', minDamage: -20, maxDamage: -20, range: 1 }, pj);
    check('lifedrain quita vida y se la queda', pj.health < vida && ghoul.health > 10, vida + ' → ' + pj.health);

    pj.mana = 50;
    const espectro = world.createMonster('Wraith', en(0, 2));
    e.ai.hechizos.lanzar(espectro, { name: 'manadrain', minDamage: -20, maxDamage: -20, radius: 3, target: false }, pj);
    check('manadrain quita maná y no vida', pj.mana === 30, String(pj.mana));
    e.ai.hechizos.random = Math.random;
    limpiarMonstruos();
    sesion.close();
}

// ===========================================================================
section('4. Las runas');
// ===========================================================================
{
    const { pj, sesion, buzon } = conectar('Runero', en(0, 0), 'Sorcerer');
    // Que el cíclope no lo mate mientras pasa el tiempo: al morir perdería la runa (y la prueba).
    pj.maxHealth = pj.health = 100000;
    pj.level = 60;
    pj.magicLevel = 20;
    pj.maxMana = pj.mana = 3000;
    pj.soul = 100;
    world.giveItem(pj, 21000, 1);
    sesion.handle([P.CLIENT.SAY, 'adori vita vis']);
    const sd = pj.inventory.find((x) => x.typeId === 21001);
    check('«adori vita vis» convierte la runa en blanco en una sudden death de 3 cargas',
        sd && world.runeCharges(sd) === 3 && !pj.inventory.some((x) => x.typeId === 21000), textos(buzon).slice(-80));
    check('y gasta maná y almas', pj.mana === 3000 - 400 && pj.soul === 95);

    const rata = world.createMonster('Cyclops', en(3, 0));
    rata.maxHealth = rata.health = 100000;
    avanzar(2100);
    const i = pj.inventory.indexOf(sd);
    const r = sesion.handle([P.CLIENT.USE_WITH, { inventario: i }, { criatura: rata.id }]);
    check('usada sobre un monstruo, le hace daño de muerte', r.used === true && rata.health < 100000,
        String(100000 - rata.health));
    check('y gasta una carga', world.runeCharges(sd) === 2);
    const otra = sesion.handle([P.CLIENT.USE_WITH, { inventario: i }, { criatura: rata.id }]);
    check('justo después: agotado', otra.used === false && otra.reason === 'exhausted');

    pj.magicLevel = 2;
    avanzar(2100);
    check('sin el nivel mágico no se puede', sesion.handle([P.CLIENT.USE_WITH, { inventario: i }, { criatura: rata.id }])
        .reason === 'magicLevel');
    pj.magicLevel = 20;

    world.teleportCreature(rata, en(4, 4));
    world.teleportCreature(pj, { x: arena.x - 4, y: arena.y - 4, z: arena.z });
    const lejos = world.createMonster('Cyclops', { x: arena.x + 4, y: arena.y + 4, z: arena.z });
    world.teleportCreature(pj, { x: lejos.position.x - 8, y: lejos.position.y, z: lejos.position.z });
    check('a más de 7 casillas, demasiado lejos',
        sesion.handle([P.CLIENT.USE_WITH, { inventario: pj.inventory.indexOf(sd) }, { criatura: lejos.id }]).reason === 'tooFar');
    world.teleportCreature(pj, en(0, 0));

    // Curar desde una hotkey, sobre uno mismo.
    world.giveItem(pj, 21002, 1);
    pj.health = 50;
    avanzar(1100);
    const cura = sesion.handle([P.CLIENT.USE_HOTKEY_ITEM, 21002, 0]);
    check('una ultimate healing desde una hotkey te cura', cura.used === true && pj.health > 50, String(pj.health));
    check('y con su única carga, desaparece', !pj.inventory.some((x) => x.typeId === 21002));

    // En una zona de protección, una ofensiva no.
    world.teleportCreature(pj, templo);
    avanzar(2100);
    const pz = sesion.handle([P.CLIENT.USE_WITH, { inventario: pj.inventory.indexOf(sd) },
        { casilla: [templo.x + 1, templo.y, templo.z] }]);
    check('una runa ofensiva no se usa desde una zona de protección', pz.reason === 'pz', String(pz.reason));
    world.teleportCreature(pj, en(0, 0));
    limpiarMonstruos();
    sesion.close();
}

// ===========================================================================
section('5. Los campos');
// ===========================================================================
{
    const { pj, sesion } = conectar('Pisador', en(0, 0), 'Sorcerer');
    pj.level = 60;
    pj.magicLevel = 20;
    world.giveItem(pj, 21008, 1);
    world.giveItem(pj, 21012, 1);
    world.giveItem(pj, 21013, 1);
    avanzar(2100);
    const r = sesion.handle([P.CLIENT.USE_WITH, { hotkey: 21008 }, { casilla: [arena.x + 1, arena.y, arena.z] }]);
    const fuego = world.map.getTile(arena.x + 1, arena.y, arena.z).getItems().find((x) => x.typeId === 21020);
    check('la runa de fuego deja un campo de fuego', r.used === true && !!fuego);

    const victima = conectar('Quemado', en(1, 1), 'Knight');
    const vida = victima.pj.health;
    victima.pj.nextStepAt = 0;
    world.moveCreature(victima.pj, { x: 0, y: -1 });
    check('quien lo pisa se quema y sigue ardiendo', victima.pj.health < vida && world.condiciones.has(victima.pj, 'fuego'),
        vida + ' → ' + victima.pj.health);
    world.condiciones.remove(victima.pj, 'fuego');
    world.clearCombat(victima.pj);

    avanzar(61000);
    const medio = world.map.getTile(arena.x + 1, arena.y, arena.z).getItems().some((x) => x.typeId === 21021);
    check('al minuto, el fuego grande pasa a mediano', medio);
    avanzar(125000);
    check('y luego se apaga', !world.map.getTile(arena.x + 1, arena.y, arena.z).getItems().some((x) => world.fieldTypeOf(x)));

    // El muro mágico no se atraviesa, y destroy field no lo quita (sí los demás campos).
    world.teleportCreature(victima.pj, en(-3, -3));
    sesion.handle([P.CLIENT.USE_WITH, { hotkey: 21012 }, { casilla: [arena.x, arena.y + 1, arena.z] }]);
    pj.nextStepAt = 0;
    const paso = world.moveCreature(pj, { x: 0, y: 1 });
    check('el muro mágico no se atraviesa', paso.moved === false);
    world.createField(21023, en(-1, 0), pj);
    avanzar(2100);
    sesion.handle([P.CLIENT.USE_WITH, { hotkey: 21013 }, { casilla: [arena.x - 1, arena.y, arena.z] }]);
    check('destroy field quita el campo de energía',
        !world.map.getTile(arena.x - 1, arena.y, arena.z).getItems().some((x) => world.fieldTypeOf(x)));
    check('no se crean campos en una zona de protección', world.createField(21020, templo, pj) === null);
    victima.sesion.close();
    sesion.close();
}

// ===========================================================================
section('6. Las herramientas');
// ===========================================================================
{
    const { pj, sesion } = conectar('Minero', en(0, 0), 'Knight');
    world.giveItem(pj, 21030, 1);
    world.giveItem(pj, 12137, 1);
    world.createItem(21032, 1, en(1, 0));
    const r = sesion.handle([P.CLIENT.USE_WITH, { hotkey: 21030 }, { casilla: [arena.x + 1, arena.y, arena.z] }]);
    const tile = world.map.getTile(arena.x + 1, arena.y, arena.z);
    check('la pala aparta el montón de piedras y deja un agujero', r.used === true &&
        tile.getItems().some((x) => x.typeId === 21033));
    avanzar(61000);
    check('que se cierra solo al minuto', tile.getItems().some((x) => x.typeId === 21032) &&
        !tile.getItems().some((x) => x.typeId === 21033));

    // La cuerda: un punto de cuerda al lado y suelo en la planta de arriba.
    const punto = en(-1, 0);
    world.createItem(11000, 1, punto);
    const arriba = { x: punto.x, y: punto.y + 1, z: punto.z - 1 };
    world.map.getOrCreateTile(arriba.x, arriba.y, arriba.z).setGround(world.createItem(102, 1, null));
    const cuerda = sesion.handle([P.CLIENT.USE_WITH, { hotkey: 12137 }, { casilla: [punto.x, punto.y, punto.z] }]);
    check('la cuerda en el punto de cuerda te sube', cuerda.used === true && pj.position.z === arena.z - 1,
        JSON.stringify(pj.position));
    sesion.close();
}

e.shutdown();
console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — el combate, las runas, los campos y las herramientas son de Tibia.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
