/**
 * PRUEBA DEL MUNDO OTSP Y DE LOS SCRIPTS DE SERVIDOR NUEVOS.
 *
 *     node tools/test-otsp.mjs
 *
 *   1. El lector de `.dat`/`.spr` y lo que dejó el importador (si el pack está en /tmp/otsp o en
 *      la ruta de OTSP_PACK; si no, esa parte se salta y lo dice).
 *   2. Los pinceles y compuestos OTSP, y el mapa «jetyum» cargado por el motor.
 *   3. Usar objetos: el mensaje USE_ITEM, las puertas (abrir, pasar, no cerrar con alguien dentro).
 *   4. Los eventos globales (startup, think, time, shutdown) y las raids, con reloj de prueba.
 *
 * Nada de esto escribe en `data/`: el generador se ejecuta sobre una carpeta temporal.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { leerDat, leerSpr, atributosDeServidor, ponerBloque, lineaDeItem, DESPLAZAMIENTO } from './importar-otsp.mjs';
import { generar, MUROS, pincelesOtsp } from './generar-mundo-otsp.mjs';
import * as P from '../editor/js/pinceles.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');
const { ScriptRegistry } = require('../engine/scripting/registry.js');
const { createGlobalClock, LATIDO_MS } = require('../engine/scripting/globals.js');
const { Scheduler } = require('../engine/core/scheduler.js');
const Xml = require('../engine/data/xml.js');
const PR = require('../engine/net/protocol.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);
const silencio = { info() {}, warning() {}, error() {}, debug() {} };

async function main() {
    console.log('Prueba del mundo OTSP y de los scripts de servidor (' + ROOT + ')');
    const items = Xml.loadItems(path.join(ROOT, 'data', 'items', 'items.xml'));
    const things = JSON.parse(fs.readFileSync(path.join(ROOT, 'client', 'jetyum', 'assets', 'things.json'), 'utf8'));

    // -----------------------------------------------------------------------
    section('1. El importador del OpenTibia Sprite Pack');
    {
        const pack = process.env.OTSP_PACK || '/tmp/otsp';
        const dat = path.join(pack, 'client_files', 'otsp.dat');
        if (fs.existsSync(dat)) {
            const d = leerDat(fs.readFileSync(dat));
            const spr = leerSpr(fs.readFileSync(path.join(pack, 'client_files', 'otsp.spr')));
            check('el .dat se lee entero: 2613 objetos, 46 aspectos, 64 efectos, 60 proyectiles',
                d.cosas.items.length === 2613 && d.cosas.outfits.length === 46 &&
                d.cosas.effects.length === 64 && d.cosas.missiles.length === 60);
            const muro = d.cosas.items.find((c) => c.id === 534);
            check('un muro llega entero: 2x2, con sus banderas', muro.width === 2 && muro.height === 2 &&
                muro.flags.onBottom && muro.flags.notWalkable && muro.flags.horizontal);
            const sprite = spr.sprite(d.cosas.items.find((c) => c.id === 101).sprites[0]);
            check('y el .spr da sprites opacos de 32x32', sprite && sprite.length === 4096 && sprite[3] === 255);
        } else {
            console.log('  (sin el pack en ' + pack + ': se comprueba solo lo importado)');
        }
        const deOtsp = things.items.filter((t) => t.id >= DESPLAZAMIENTO.items);
        check('things.json tiene los objetos del pack con su id desplazado (+10000)', deOtsp.length > 2600,
            deOtsp.length + ' objetos');
        check('y cada uno tiene ficha en items.xml', deOtsp.every((t) => items.has(t.id)));
        check('los aspectos del pack están en el 301-346', things.outfits.filter((t) => t.id > 300 && t.id <= 346).length === 46);
        check('las banderas de servidor salen de las del cliente',
            JSON.stringify(atributosDeServidor({ ground: { speed: 120 }, notWalkable: true, onTop: true })) ===
            JSON.stringify({ isGround: 1, groundSpeed: 120, alwaysOnTop: 1, blocksSolid: 1 }));
        const xml = '<items>\n\t<item id="1" name="a" />\n</items>\n';
        const una = ponerBloque(xml, [lineaDeItem(10100, 'b', null, {})]);
        const dos = ponerBloque(una, [lineaDeItem(10100, 'c', 'a', { weight: 5 })]);
        check('el bloque del pack en items.xml se sustituye, no se duplica',
            (dos.match(/OTSP:inicio/g) || []).length === 1 && dos.includes('name="c"') && !dos.includes('name="b"') &&
            dos.includes('<item id="1" name="a" />'));
    }

    // -----------------------------------------------------------------------
    section('2. Pinceles, compuestos y el mapa «jetyum»');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-otsp-'));
    try {
        const r = generar({ salida: tmp });
        const { data: pinceles, problemas } = P.normalizarPinceles(
            JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'editor', 'pinceles.json'), 'utf8')), items);
        check('los pinceles OTSP son válidos contra items.xml', problemas.length === 0, problemas.slice(0, 2).join('; '));
        check('hay un pincel de muro por material, con puertas', pincelesOtsp().muros.length === MUROS.length &&
            pinceles.muros.filter((m) => m.id.startsWith('otsp-')).every((m) => m.puertas));
        const compuestos = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'editor', 'compuestos.json'), 'utf8')).compuestos;
        const otsp = compuestos.filter((c) => c.id.startsWith('otsp-'));
        check('compuestos: muros (tramos, esquina, habitación) de cada material y edificios, parque y naturaleza',
            otsp.filter((c) => c.categoria === 'OTSP · Muros').length === MUROS.length * 3 &&
            otsp.some((c) => c.nombre === 'Templo') && otsp.some((c) => c.nombre === 'Fuente') &&
            otsp.some((c) => c.categoria === 'OTSP · Naturaleza'), otsp.length + ' compuestos OTSP');
        check('y los compuestos de antes se conservan', compuestos.some((c) => c.id === 'teleport'));
        const otraVez = generar({ salida: tmp });
        check('generar dos veces da lo mismo (determinista, sin duplicar)',
            otraVez.compuestos === r.compuestos && JSON.stringify(otraVez.mapa) === JSON.stringify(r.mapa));
        const real = fs.readFileSync(path.join(ROOT, 'data', 'world', 'jetyum.map.json'), 'utf8');
        check('el mapa del repositorio es el que sale del generador', real === fs.readFileSync(
            path.join(tmp, 'data', 'world', 'jetyum.map.json'), 'utf8'),
            'si falla: node tools/generar-mundo-otsp.mjs');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    const engine = createEngine({ rootDir: ROOT, logLevel: 'error',
        overrides: { useDatabase: false, mapName: 'jetyum', mapFile: null } });
    const world = engine.world;
    const map = world.map;
    {
        const s = map.stats();
        check('el motor carga «jetyum» sin errores', s && s.size === '112x96x16', JSON.stringify(s).slice(0, 160));
        check('con su templo, sus 4 casas, 11 respawns (2 en la cueva) y 8 NPC',
            map.getWaypoint('temple') && map.towns.length === 1 && map.houses.length === 4 &&
            s.spawnAreas === 11 && s.npcs === 8);
        const t = map.getWaypoint('temple');
        check('el templo es zona protegida y se puede pisar',
            map.getTile(t.x, t.y, t.z).isProtectionZone() && map.isWalkable(t.x, t.y, t.z));
        const nombres = new Set();
        map.spawns.forEach((a) => a.monsters.forEach((m) => nombres.add(m.name)));
        check('todos los monstruos de los respawns existen', [...nombres].every((n) => world.monsterTypes.has(n)),
            [...nombres].join(', '));
        check('y usan aspectos del pack', [...nombres].every((n) => world.monsterTypes.get(n).outfit.lookType > 300));
    }

    // -----------------------------------------------------------------------
    section('3. Usar objetos: las puertas');
    {
        const sent = [];
        const session = engine.createSession((m) => sent.push(m));
        session.enterWorld('Portero');
        const t = map.getWaypoint('temple');
        // La puerta del templo: en la fila del muro sur, en el pasillo central.
        let puerta = null;
        for (let y = t.y; y < t.y + 10 && !puerta; y += 1) {
            const tile = map.getTile(t.x, y, 7);
            const item = tile && tile.downItems.concat(tile.topItems).find((i) => i.getName() === 'door');
            if (item) {
                puerta = { x: t.x, y, item };
            }
        }
        check('hay una puerta cerrada en el muro del templo', puerta && puerta.item.blocksSolid, puerta && 'en ' + puerta.x + ',' + puerta.y);
        const cerrada = puerta.item.typeId;

        const lejos = session.handle([PR.CLIENT.USE_ITEM, puerta.x, puerta.y, 7]);
        check('desde lejos no se usa al instante: primero hay que llegar', lejos.used === false && lejos.walking === true &&
            puerta.item.blocksSolid);
        session.autoCamino = null;

        world.teleportPlayer(session.playerId, puerta.x, puerta.y - 1, 7);
        const abrir = session.handle([PR.CLIENT.USE_ITEM, puerta.x, puerta.y, 7]);
        check('al lado, usarla la ABRE (el script de puertas la transforma)',
            abrir.used === true && puerta.item.typeId !== cerrada && !puerta.item.blocksSolid && puerta.item.alwaysOnTop,
            cerrada + ' -> ' + puerta.item.typeId);
        check('y abierta se puede cruzar', map.isWalkable(puerta.x, puerta.y, 7));

        world.teleportPlayer(session.playerId, puerta.x, puerta.y, 7);
        const otro = engine.createSession(() => {});
        otro.enterWorld('Vecino');
        world.teleportPlayer(otro.playerId, puerta.x, puerta.y + 1, 7);
        const conAlguien = otro.handle([PR.CLIENT.USE_ITEM, puerta.x, puerta.y, 7]);
        check('con alguien en el umbral no se cierra', conAlguien.used === true && !puerta.item.blocksSolid);

        world.teleportPlayer(session.playerId, puerta.x, puerta.y - 1, 7);
        session.handle([PR.CLIENT.USE_ITEM, puerta.x, puerta.y, 7]);
        check('sin nadie, usarla otra vez la CIERRA', puerta.item.typeId === cerrada && puerta.item.blocksSolid);

        const nada = session.handle([PR.CLIENT.USE_ITEM, puerta.x, puerta.y - 1, 7]);
        check('usar una casilla sin nada usable lo dice', nada.used === false && nada.reason === 'nothingToUse');
        session.close();
        otro.close();
    }
    section('3c. Clic derecho: ir andando y usar; la ventana del personaje');
    {
        const sent = [];
        const session = engine.createSession((m) => sent.push(m));
        session.enterWorld('Caminante');
        const yo = world.getPlayer(session.playerId);
        const t = map.getWaypoint('temple');
        world.teleportPlayer(session.playerId, t.x, t.y, 7);
        const puerta = map.getTile(t.x, 35, 7).downItems.concat(map.getTile(t.x, 35, 7).topItems)
            .find((i) => i.getName() === 'door');
        const r = session.handle([PR.CLIENT.USE_ITEM, t.x, 35, 7]);
        check('usar algo lejos con camino: el jugador se pone a andar', r.walking === true && r.steps >= 2, JSON.stringify(r));
        for (let i = 0; i < 20 && session.autoCamino; i += 1) {
            yo.nextStepAt = 0;
            session.update();
        }
        check('y al llegar al lado lo usa: la puerta se abre',
            Math.max(Math.abs(yo.position.x - t.x), Math.abs(yo.position.y - 35)) <= 1 && !puerta.blocksSolid,
            String(yo.position));
        sent.length = 0;
        world.teleportPlayer(session.playerId, 70, 26, 7);   // dentro de la torre
        const lejos = session.handle([PR.CLIENT.USE_ITEM, t.x, 35, 7]);
        check('sin camino (otra sala cerrada) no anda y dice que está demasiado lejos',
            lejos.reason === 'tooFar' && !session.autoCamino &&
            sent.some((m) => m[0] === PR.SERVER.TEXT && /demasiado lejos/.test(JSON.stringify(m))));
        sent.length = 0;
        session.handle([PR.CLIENT.REQUEST_OUTFIT]);
        const ventana = sent.find((m) => m[0] === PR.SERVER.OUTFIT_WINDOW);
        check('pedir la ventana del personaje devuelve aspecto, aspectos y ficha',
            ventana && ventana[1].outfit && ventana[1].stats.level >= 1 && ventana[1].stats.vocation &&
            ventana[1].outfits.some((o) => o.lookType === 317) && ventana[1].outfits.every((o) => o.lookType >= 100));
        const cambio = session.handle([PR.CLIENT.SET_OUTFIT, 317, 94, 10, 20, 30, 0]);
        check('y cambiar de aspecto lo aplica', cambio.ok && yo.outfit.lookType === 317 && yo.outfit.head === 94);
        const malo = session.handle([PR.CLIENT.SET_OUTFIT, 137, 0, 0, 0, 0, 0]);
        check('un aspecto bloqueado se rechaza', malo.ok === false && yo.outfit.lookType === 317);
        session.close();
    }

    section('3d. Cuerpos y botín: el monstruo deja su cuerpo, con el botín dentro');
    {
        const t = map.getWaypoint('temple');
        const azar = engine.combat.random;
        engine.combat.random = () => 0;   // todas las tiradas de botín entran
        const goblin = world.createMonster('Goblin', { x: t.x + 1, y: t.y, z: 7 });
        const muerte = engine.combat.applyDamage(goblin, 100000, {});
        const cuerpo = engine.combat.lastCorpse;
        check('el goblin deja el cuerpo de su ficha (corpse: 12234, «dead goblin»)',
            muerte.killed && cuerpo && cuerpo.typeId === 12234 && cuerpo.position.x === t.x + 1,
            cuerpo && (cuerpo.getName() + ' ' + cuerpo.typeId));
        check('con su botín DENTRO, no en el suelo', world.contentsOfItem(cuerpo).length > 0 &&
            muerte.loot.every((i) => i.parent === cuerpo), muerte.loot.map((i) => i.getName()).join(', '));
        check('y el cuerpo no se puede coger', !cuerpo.hasFlag('pickupable'));
        const cerdo = world.createMonster('Pig', { x: t.x - 1, y: t.y, z: 7 });
        engine.combat.applyDamage(cerdo, 100000, {});
        check('un monstruo sin cuerpo en el pack deja la caja (corpseFallbackId)',
            engine.combat.lastCorpse && engine.combat.lastCorpse.typeId === 11109 &&
            engine.combat.lastCorpse.getName() === 'wooden box' && !engine.combat.lastCorpse.hasFlag('pickupable'));
        engine.combat.random = azar;

        const sent = [];
        const session = engine.createSession((m) => sent.push(m));
        session.enterWorld('Saqueador');
        const yo = world.getPlayer(session.playerId);
        world.teleportPlayer(session.playerId, t.x, t.y, 7);
        const abrir = session.handle([PR.CLIENT.USE_ITEM, t.x + 1, t.y, 7]);
        const ventana = sent.find((m) => m[0] === PR.SERVER.CONTAINER_OPEN);
        check('clic derecho (usar) sobre el cuerpo lo abre y manda lo de dentro',
            abrir.action === 'openContainer' && ventana && ventana[1].id === cuerpo.instanceId &&
            ventana[1].items.length === world.contentsOfItem(cuerpo).length && ventana[1].capacity === 10,
            ventana && JSON.stringify(ventana[1]).slice(0, 140));
        const antes = world.contentsOfItem(cuerpo).length;
        const primero = world.contentsOfItem(cuerpo)[0];
        sent.length = 0;
        const coger = session.handle([PR.CLIENT.CONTAINER_TAKE, cuerpo.instanceId, 0]);
        check('coger del cuerpo lo mete en la mochila',
            coger.ok && world.contentsOfItem(cuerpo).length === antes - 1 &&
            yo.inventory.some((e) => e.typeId === primero.typeId && e.slot === 'inside'));
        check('y la ventana se actualiza sola', sent.some((m) => m[0] === PR.SERVER.CONTAINER_OPEN && m[1].items.length === antes - 1));
        sent.length = 0;
        world.teleportPlayer(session.playerId, t.x, t.y + 3, 7);
        session.update();
        check('al alejarse se cierra', sent.some((m) => m[0] === PR.SERVER.CONTAINER_CLOSE && m[1] === cuerpo.instanceId));
        const lejos = session.handle([PR.CLIENT.CONTAINER_TAKE, cuerpo.instanceId, 0]);
        check('y de lejos no se puede coger', lejos.ok === false && lejos.reason === 'tooFar');
        session.close();

        const cosas = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/jetyum/assets/things.json'), 'utf8')).items;
        const cosa = (id) => cosas.find((c) => c.id === id);
        // El del pack, o su versión HD (docs/ARTE-HD.md: 64 px por casilla, la marca `hd`).
        const delPackOHD = (id, pack) => (cosa(id).flags && cosa(id).flags.hd
            ? cosa(id).width === 2 && cosa(id).sprites.some((n) => n > 0)
            : JSON.stringify(cosa(id).sprites) === JSON.stringify(cosa(pack).sprites));
        check('la mochila de inicio y las monedas tienen el dibujo del pack o el HD (no uno provisional)',
            delPackOHD(2412, 12099) && delPackOHD(3031, 12192) && delPackOHD(2160, 12209));

        // Se pudre: fresco -> podrido -> huesos (ya no es contenedor) -> desaparece.
        world.addToGroundContainer(cuerpo, 3031, 5);
        world._decay(cuerpo.instanceId, 12234);
        check('se pudre a su segunda etapa con lo de dentro', cuerpo.typeId === 12235 && world.contentsOfItem(cuerpo).length > 0);
        world._decay(cuerpo.instanceId, 12235);
        check('luego son huesos, y lo que quedaba se pierde', cuerpo.typeId === 12236 && world.contentsOfItem(cuerpo).length === 0);
        world._decay(cuerpo.instanceId, 12236);
        check('y al final desaparece', !world.items.has(cuerpo.instanceId) &&
            !map.getTile(t.x + 1, t.y, 7).getItems().includes(cuerpo));
    }

    section('3e. Arrastrar objetos por el mapa, y la vida al reaparecer');
    {
        const t = map.getWaypoint('temple');
        const sent = [];
        const session = engine.createSession((m) => sent.push(m));
        session.enterWorld('Lanzador');
        const yo = world.getPlayer(session.playerId);
        world.teleportPlayer(session.playerId, t.x, t.y, 7);
        const espada = world.createItem(11677, 1, { x: t.x, y: t.y + 1, z: 7 });
        const F = PR.MOVE_ITEM_FIELD;
        const mover = (desde, hacia) => {
            const m = [];
            m[0] = PR.CLIENT.MOVE_ITEM;
            m[F.FROM_KIND] = PR.MOVE_FROM.GROUND; m[F.FROM_X] = desde.x; m[F.FROM_Y] = desde.y; m[F.FROM_Z] = desde.z;
            Object.assign(m, hacia(m));
            return session.handle(m);
        };
        const alSuelo = (x, y) => (m) => { m[F.TO_KIND] = PR.MOVE_TO.GROUND; m[F.TO_X] = x; m[F.TO_Y] = y; m[F.TO_Z] = 7; return m; };
        const r1 = mover({ x: t.x, y: t.y + 1, z: 7 }, alSuelo(t.x, t.y + 4));
        check('se puede lanzar un objeto a otra casilla del mapa (hasta 7)',
            r1.moved !== false && espada.position.y === t.y + 4, JSON.stringify(r1));
        const r2 = mover({ x: t.x, y: t.y + 4, z: 7 }, alSuelo(t.x + 20, t.y));
        check('pero no más lejos', r2.moved === false && r2.reason === 'tooFar', JSON.stringify(r2));
        const r3 = mover({ x: t.x, y: t.y + 4, z: 7 }, (m) => { m[F.TO_KIND] = PR.MOVE_TO.CONTAINER; return m; });
        check('arrastrarlo de lejos a la mochila hace que el personaje vaya andando', r3.walking === true, JSON.stringify(r3));
        sent.length = 0;
        for (let i = 0; i < 20 && session.autoCamino; i += 1) {
            yo.nextStepAt = 0;
            session.update();
        }
        check('y al llegar lo coge', !espada.position || !map.getTile(t.x, t.y + 4, 7).getItems().includes(espada) &&
            yo.inventory.some((e) => e.typeId === 11677));

        // Morir con la barra a medias y reaparecer: el cliente tiene que recibir la vida llena.
        yo.health = 20;   // herido: el cliente ve la barra roja
        session.update();
        sent.length = 0;
        const rata = world.createMonster('Cat', { x: yo.position.x + 1, y: yo.position.y, z: 7 });
        engine.combat.config.deathDropInventory = false;
        engine.combat.applyDamage(yo, 100000, { attacker: rata });
        session.update();
        const vida = sent.filter((m) => m[0] === PR.SERVER.CREATURE_UPDATE && m[1] === yo.id).pop();
        check('al reaparecer se manda la vida llena (la barra no se queda roja)', vida && vida[3] === 100, JSON.stringify(vida));
        session.close();
    }

    section('3f. Atacar: a los monstruos sí, a los NPC no');
    {
        const sent = [];
        const session = engine.createSession((m) => sent.push(m));
        session.enterWorld('Pacifico');
        const npc = [...world.creatures.values()].find((c) => c.kind === 'npc');
        const r = session.handle([PR.CLIENT.ATTACK, npc.id]);
        check('atacar a un NPC se rechaza y se dice', r.result.reason === 'npc' &&
            sent.some((m) => m[0] === PR.SERVER.TEXT && /No puedes atacar/.test(m[2])) && npc.health === npc.maxHealth);
        check('y los NPC llegan al cliente como clase 2 (el cliente no los deja marcar)',
            PR.describeCreature(npc)[13] === 2);
        session.close();
    }

    section('3g. Lo de dentro de un cuerpo se arrastra: al mapa, a las ranuras, a la munición');
    {
        const t = map.getWaypoint('temple');
        const session = engine.createSession(() => {});
        session.enterWorld('Saqueadora');
        const yo = world.getPlayer(session.playerId);
        world.teleportPlayer(session.playerId, t.x, t.y, 7);
        const caja = world.createItem(11109, 1, { x: t.x + 1, y: t.y, z: 7 });
        caja.attributes.pickupable = 0;
        world.addToGroundContainer(caja, 3031, 7);       // monedas
        world.addToGroundContainer(caja, 11677, 1);      // una espada
        world.addToGroundContainer(caja, 2160, 1);       // un cristal
        const F = PR.MOVE_ITEM_FIELD;
        const mover = (index, hacia) => {
            const m = [PR.CLIENT.MOVE_ITEM, PR.MOVE_FROM.CONTAINER, 0, 0, 0, index, hacia[0], hacia[1] || 0, hacia[2] || 0, hacia[3] || 0, hacia[4] || 0];
            m[F.FROM_ID] = caja.instanceId;
            return session.handle(m);
        };
        const espada = world.contentsOfItem(caja).findIndex((i) => i.typeId === 11677);
        const r1 = mover(espada, [PR.MOVE_TO.SLOT, 0, 0, 0, 'hand']);
        check('la espada del cuerpo va a la ranura del arma', r1.moved !== false &&
            world.equippedIn(yo, 'hand') && world.equippedIn(yo, 'hand').typeId === 11677 &&
            !world.contentsOfItem(caja).some((i) => i.typeId === 11677), JSON.stringify(r1.reason));
        const monedas = world.contentsOfItem(caja).findIndex((i) => i.typeId === 3031);
        const r2 = mover(monedas, [PR.MOVE_TO.SLOT, 0, 0, 0, 'ammo']);
        check('las monedas a la ranura de la munición (admite cualquier cosa, como Tibia)',
            r2.moved !== false && world.equippedIn(yo, 'ammo') && world.equippedIn(yo, 'ammo').count === 7, JSON.stringify(r2.reason));
        const cristal = world.contentsOfItem(caja).findIndex((i) => i.typeId === 2160);
        const r3 = mover(cristal, [PR.MOVE_TO.GROUND, t.x - 2, t.y + 2, 7]);
        const suelo = map.getTile(t.x - 2, t.y + 2, 7);
        check('y el cristal, al mapa (sale del cuerpo y queda en el suelo)',
            r3.moved !== false && suelo && suelo.getItems().some((i) => i.typeId === 2160) &&
            world.contentsOfItem(caja).length === 0, JSON.stringify(r3.reason));
        check('una mochila no cabe en la munición', world.moveItem(yo, { kind: 'inventory', index: yo.inventory.findIndex((e) => e.typeId === 2412) },
            { kind: 'slot', slot: 'ammo' }).ok === false);
        session.close();
    }

    section('3h. Clic izquierdo: ir andando hasta una casilla');
    {
        const t = map.getWaypoint('parque');   // sin NPC paseando que se crucen
        const sent = [];
        const session = engine.createSession((m) => sent.push(m));
        session.enterWorld('Paseante');
        const yo = world.getPlayer(session.playerId);
        world.teleportPlayer(session.playerId, t.x, t.y, 7);
        const r = session.handle([PR.CLIENT.WALK_TO, t.x, t.y + 3, 7]);
        for (let i = 0; i < 30 && session.autoCamino; i += 1) {
            yo.nextStepAt = 0;
            session.update();
        }
        check('va andando hasta la casilla', r.walking && yo.position.x === t.x && yo.position.y === t.y + 3, String(yo.position) + ' ' + JSON.stringify(r));
        sent.length = 0;
        const muro = session.handle([PR.CLIENT.WALK_TO, 0, 0, 7]);
        check('si no se puede llegar, lo dice', muro.walking === false &&
            sent.some((m) => m[0] === PR.SERVER.TEXT && /No hay camino/.test(m[2])));
        session.close();
    }

    section('3i. Los objetos apilables se juntan (como las monedas)');
    {
        const t = map.getWaypoint('parque');
        const session = engine.createSession(() => {});
        session.enterWorld('Apilador');
        const yo = world.getPlayer(session.playerId);
        world.teleportPlayer(session.playerId, t.x, t.y, 7);
        const sitio = { x: t.x + 1, y: t.y, z: 7 };
        const pila = world.createItem(3031, 30, sitio);
        const otra = world.createItem(3031, 25, { x: t.x - 1, y: t.y, z: 7 });
        world.moveItem(yo, { kind: 'ground', x: t.x - 1, y: t.y, z: 7 }, { kind: 'ground', ...sitio });
        const monedas = () => map.getTile(sitio.x, sitio.y, 7).getItems().filter((i) => i.typeId === 3031);
        check('una pila encima de otra del mismo objeto se juntan', monedas().length === 1 && pila.count === 55 &&
            !world.items.has(otra.instanceId), monedas().map((i) => i.count).join('+'));
        world.createItem(3031, 70, { x: t.x - 1, y: t.y, z: 7 });
        world.moveItem(yo, { kind: 'ground', x: t.x - 1, y: t.y, z: 7 }, { kind: 'ground', ...sitio });
        check('hasta 100: lo que no cabe se queda como otra pila', monedas().map((i) => i.count).join('+') === '100+25',
            monedas().map((i) => i.count).join('+'));
        // De la mochila al suelo, encima de la pila de 25.
        yo.inventory.push({ slot: 'inside', position: yo.inventory.length, typeId: 3031, count: 10, attributes: null });
        world.moveItem(yo, { kind: 'inventory', index: yo.inventory.length - 1 }, { kind: 'ground', ...sitio });
        check('soltar monedas sobre una pila también las junta', monedas().map((i) => i.count).join('+') === '100+35',
            monedas().map((i) => i.count).join('+'));
        // En la ranura de la munición.
        yo.inventory.push({ slot: 'ammo', position: yo.inventory.length, typeId: 3031, count: 5, attributes: null });
        yo.inventory.push({ slot: 'inside', position: yo.inventory.length, typeId: 3031, count: 7, attributes: null });
        world.moveItem(yo, { kind: 'inventory', index: yo.inventory.length - 1 }, { kind: 'slot', slot: 'ammo' });
        check('en la ranura de la munición se juntan con las que ya hay', world.equippedIn(yo, 'ammo').count === 12 &&
            yo.inventory.filter((e) => e.typeId === 3031).length === 1);
        // De la munición a la mochila, con otra pila dentro.
        yo.inventory.push({ slot: 'inside', position: yo.inventory.length, typeId: 3031, count: 3, attributes: null });
        world.moveItem(yo, { kind: 'inventory', index: yo.inventory.findIndex((e) => e.slot === 'ammo') }, { kind: 'container' });
        const dentro = yo.inventory.filter((e) => e.typeId === 3031);
        check('y en la mochila, también', dentro.length === 1 && dentro[0].count === 15 && dentro[0].slot === 'inside',
            JSON.stringify(dentro));
        session.close();
    }

    section('3j. Los números de daño y curación');
    {
        const t = map.getWaypoint('parque');
        const sent = [];
        const session = engine.createSession((m) => sent.push(m));
        session.enterWorld('Golpeado');
        const yo = world.getPlayer(session.playerId);
        world.teleportPlayer(session.playerId, t.x, t.y, 7);
        const gato = world.createMonster('Cat', { x: t.x + 1, y: t.y, z: 7 });
        sent.length = 0;
        engine.combat.applyDamage(yo, 12, { attacker: gato });
        const dano = sent.find((m) => m[0] === PR.SERVER.ANIMATED_TEXT);
        check('un golpe manda «-12» en rojo sobre la casilla', dano && dano[4] === 'dano' && dano[5] === '-12' &&
            dano[1] === t.x && dano[2] === t.y, JSON.stringify(dano));
        sent.length = 0;
        yo.mana = yo.maxMana;
        engine.dispatchTalkAction('exura', { playerId: yo.id, type: 1 });
        const cura = sent.find((m) => m[0] === PR.SERVER.ANIMATED_TEXT);
        check('curarse manda «+N» en verde', cura && cura[4] === 'cura' && /^\+\d+$/.test(cura[5]), JSON.stringify(cura));
        world.removeMonster(gato.id);
        session.close();
    }

    section('3b. Cambiar de planta: escaleras, agujero y escalera de mano');
    {
        const session = engine.createSession(() => {});
        session.enterWorld('Escalador');
        const yo = world.getPlayer(session.playerId);
        const paso = (op, x, y, z) => {
            world.teleportPlayer(session.playerId, x, y, z);
            yo.nextStepAt = 0;
            session.handle([op]);
            return yo.position.x + ',' + yo.position.y + ',' + yo.position.z;
        };
        check('subir la escalera de la torre lleva al piso 6, una casilla al norte',
            paso(PR.CLIENT.WALK_NORTH, 70, 26, 7) === '70,24,6');
        check('y bajar por la de arriba vuelve a la 7, delante de la escalera',
            paso(PR.CLIENT.WALK_SOUTH, 70, 24, 6) === '70,26,7');
        check('la escalera de la Casa de Piedra baja a la bodega (planta 8)',
            paso(PR.CLIENT.WALK_SOUTH, 24, 55, 7) === '24,57,8');
        check('el agujero del bosque cae a la cueva', paso(PR.CLIENT.WALK_NORTH, 26, 25, 7) === '26,24,8');
        world.teleportPlayer(session.playerId, 36, 32, 8);
        const usar = session.handle([PR.CLIENT.USE_ITEM, 36, 31, 8]);
        check('la escalera de mano de la cueva se USA para subir', usar.used === true && yo.position.z === 7,
            String(yo.position));
        const rata = world.createMonster('Cat', { x: 69, y: 26, z: 7 }, null);
        rata.nextStepAt = 0;
        world.moveCreature(rata, { x: 1, y: -1 });
        check('un monstruo NO cambia de planta al pisar una escalera', rata.position.z === 7);
        session.close();
    }

    engine.shutdown();

    // -----------------------------------------------------------------------
    section('4. Eventos globales y raids');
    {
        let ahora = 0;
        const reloj = { hora: new Date(2026, 0, 1, 11, 59, 30) };
        const scheduler = new Scheduler({ logger: silencio, now: () => ahora });
        const avanzar = (ms) => {
            for (let t = 0; t < ms; t += LATIDO_MS) {
                ahora += LATIDO_MS;
                reloj.hora = new Date(reloj.hora.getTime() + LATIDO_MS);
                scheduler.tick(1000);
            }
        };
        const mensajes = [];
        const creados = [];
        const mundo = {
            players: new Map([[1, { id: 1 }]]),
            sendTextMessage: (id, t) => mensajes.push(t),
            map: { getTile: () => ({ creatures: [] }), isWalkable: () => true },
            createMonster: (n, pos) => { creados.push(n + '@' + pos.x + ',' + pos.y); return { id: creados.length }; },
            monsterTypes: new Map(), npcTypes: new Map()
        };
        const registro = new ScriptRegistry({ world: mundo, logger: silencio });
        const llamadas = { startup: 0, think: 0, time: [], shutdown: 0 };
        registro.register({ type: 'globalevent', event: 'startup', onStartup() { llamadas.startup += 1; return true; } }, 'a');
        registro.register({ type: 'globalevent', event: 'think', interval: 1000, onThink(i) { llamadas.think += 1; llamadas.i = i; return true; } }, 'b');
        registro.register({ type: 'globalevent', event: 'time', time: '12:00', onTime(h) { llamadas.time.push(h); return true; } }, 'c');
        registro.register({ type: 'globalevent', event: 'shutdown', onShutdown() { llamadas.shutdown += 1; return true; } }, 'd');
        let mal = null;
        try { registro.register({ type: 'globalevent', event: 'think', onThink() {} }, 'e'); } catch (e) { mal = e.message; }
        check('un think sin intervalo se rechaza al cargar, con su motivo', /interval/.test(mal || ''), mal);

        registro.register({ type: 'raid', name: 'Prueba', steps: [
            { delay: 0, announce: 'vienen' },
            { delay: 2000, spawn: { monster: 'Goblin', x: 10, y: 10, z: 7, count: 3, radius: 1 } },
            { delay: 3000, run(Game) { mensajes.push('run:' + (Game && Game.ok)); } }
        ] }, 'r');
        try { registro.register({ type: 'raid', name: 'Vacia', steps: [{ delay: 0 }] }, 'v'); mal = null; } catch (e) { mal = e.message; }
        check('una etapa de raid que no hace nada se rechaza', /no hace nada/.test(mal || ''), mal);

        const relojGlobal = createGlobalClock({ registry: registro, world: mundo, scheduler, logger: silencio,
            game: () => ({ ok: true }), ahora: () => reloj.hora, azar: () => 0.5 });
        relojGlobal.start();
        check('onStartup se lanza al arrancar', llamadas.startup === 1);
        avanzar(3200);
        check('think se lanza cada su intervalo, y recibe el intervalo', llamadas.think === 3 && llamadas.i === 1000, llamadas.think + ' veces');
        avanzar(30000);
        check('time se lanza al llegar la hora, una sola vez', llamadas.time.length === 1 && llamadas.time[0] === '12:00',
            JSON.stringify(llamadas.time));

        mensajes.length = 0;
        const r1 = relojGlobal.startRaid('prueba');
        const r2 = relojGlobal.startRaid('Prueba');
        check('una raid empieza por su nombre y no se solapa consigo misma', r1.ok && r1.etapas === 3 && !r2.ok);
        avanzar(500);
        check('la primera etapa anuncia a todos', mensajes.includes('vienen'));
        avanzar(2000);
        check('la segunda hace aparecer sus monstruos alrededor del punto',
            creados.length === 3 && creados.every((c) => c.startsWith('Goblin@')), creados.join(' '));
        avanzar(1000);
        check('la tercera ejecuta su código con Game', mensajes.includes('run:true'));
        avanzar(500);
        check('y al acabar se puede volver a lanzar', relojGlobal.startRaid('Prueba').ok);
        check('una raid que no existe lo dice', /no hay ninguna raid/.test(relojGlobal.startRaid('nada').problema));
        relojGlobal.stop();
        check('onShutdown se lanza al parar', llamadas.shutdown === 1);
    }
    {
        const e = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { useDatabase: false, mapName: 'sample', mapFile: null } });
        const st = e.registry ? e.registry.stats() : null;
        const reg = e.globalClock ? e.registry : null;
        check('el motor carga los globalevents y raids de data/scripts',
            st && st.globalEvents >= 3 && st.raids >= 1, st && (st.globalEvents + ' eventos globales, ' + st.raids + ' raid(s)'));
        e.shutdown();
        void reg;
    }

    console.log('');
    if (failures === 0) {
        console.log('\x1b[32mTodo OK\x1b[0m — el mundo OTSP carga, las puertas se abren y los eventos globales y las raids corren.');
        process.exit(0);
    }
    console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
    process.exit(1);
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
