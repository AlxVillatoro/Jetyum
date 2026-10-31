/**
 * PRUEBAS DE LA MUERTE: el castigo, el cuerpo, el historial y las bendiciones.
 *
 *     node tools/test-muerte.mjs
 *
 * Con el motor de verdad, el mapa `jetyum`, el reloj en la mano, el azar del combate en la mano
 * (`combat.random`) y una base de datos TEMPORAL (en la carpeta temporal del sistema):
 *
 *   1. las cuentas puras (engine/world/muerte.js): el porcentaje, las rebajas, el precio, las
 *      probabilidades de perder objetos
 *   2. sin bendiciones: experiencia, skills y nivel mágico; la mochila al cuerpo; los objetos
 *      equipados a suertes; una mochila nueva
 *   3. el historial: la fila en `player_deaths` y `/muertes` (el suyo, el de otro, uno que no
 *      existe), y una muerte injusta a manos de otro jugador
 *   4. las bendiciones: el Sanador las vende (y cobra), `/bendiciones` las lista, se guardan
 *   5. con las cinco: se pierde menos y nada de lo que se lleva; y se gastan al morir
 *   6. lo que se dice, en inglés
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
const Muerte = require('../engine/world/muerte.js');
const Vocacion = require('../engine/world/vocacion.js');
const { experienceForLevel } = require('../engine/world/experience.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

// ===========================================================================
section('1. Las cuentas (engine/world/muerte.js)');
// ===========================================================================
{
    const knight = { id: 4, fromVoc: 4 };
    const elite = { id: 8, fromVoc: 4 };
    const pj = (n) => {
        const j = { level: 50, experience: experienceForLevel(50), storages: new Map() };
        for (let i = 1; i <= n; i += 1) {
            Muerte.darBendicion(j, i);
        }
        return j;
    };
    check('sin bendiciones se pierde el deathLosePercent tal cual (10 %)',
        Muerte.porcentajeDePerdida(pj(0), knight, { deathLosePercent: 10 }) === 10);
    check('cada bendición quita un 8 % de la pérdida: con cinco, un 6 %',
        Math.abs(Muerte.porcentajeDePerdida(pj(5), knight, { deathLosePercent: 10 }) - 6) < 1e-9,
        String(Muerte.porcentajeDePerdida(pj(5), knight, { deathLosePercent: 10 })));
    check('promocionado, un 30 % menos (7 %); y con cinco, un 70 % menos (3 %)',
        Math.abs(Muerte.porcentajeDePerdida(pj(0), elite, { deathLosePercent: 10 }) - 7) < 1e-9 &&
        Math.abs(Muerte.porcentajeDePerdida(pj(5), elite, { deathLosePercent: 10 }) - 3) < 1e-9);
    const tfs = { level: 100, experience: experienceForLevel(100), storages: new Map() };
    const esperado = 150 * 50 * (100 * 100 - 500 + 8) / experienceForLevel(100);
    check('con -1, la fórmula de TFS por nivel: (L+50)·50·(L²−5L+8)/exp', Math.abs(
        Muerte.porcentajeDePerdida(tfs, knight, { deathLosePercent: -1 }) - esperado) < 1e-9, esperado.toFixed(3) + ' %');
    check('y por debajo del 25, un 10 %',
        Muerte.porcentajeDePerdida({ level: 20, experience: experienceForLevel(20) }, knight, { deathLosePercent: -1 }) === 10);
    check('el precio: 2000 hasta el 30, (nivel−20)·200 en medio, 20 000 desde el 120',
        Muerte.costeBendicion(1) === 2000 && Muerte.costeBendicion(30) === 2000 && Muerte.costeBendicion(31) === 2200 &&
        Muerte.costeBendicion(50) === 6000 && Muerte.costeBendicion(120) === 20000 && Muerte.costeBendicion(300) === 20000);
    const p0 = Muerte.probabilidadesDePerdida(0, false);
    const p3 = Muerte.probabilidadesDePerdida(3, false);
    const p5 = Muerte.probabilidadesDePerdida(5, false);
    check('perder objetos: 10 % cada pieza y 100 % la mochila sin bendiciones; 4 % y 40 % con tres; 0 con cinco',
        p0.objeto === 10 && p0.contenedor === 100 && p3.objeto === 4 && p3.contenedor === 40 &&
        p5.objeto === 0 && p5.contenedor === 0);
    check('y con la calavera roja, todo aunque tenga las cinco',
        Muerte.probabilidadesDePerdida(5, true).objeto === 100);
    check('cinco bendiciones, con los nombres de TFS', Muerte.BENDICIONES.length === 5 &&
        Muerte.BENDICIONES[0].name === 'The Spiritual Shielding' && Muerte.BENDICIONES[4].name === 'The Wisdom of Solitude');
}

// ---------------------------------------------------------------------------
// El motor, con una base temporal.
// ---------------------------------------------------------------------------
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-muerte-'));
const baseDeDatos = path.join(carpeta, 'muerte.db');
const e = createEngine({
    rootDir: ROOT,
    logLevel: 'error',
    overrides: { useDatabase: true, databaseFile: baseDeDatos, deathLosePercent: 10, deathItemLoss: true, deathDropInventory: true }
});
const world = e.world;

let reloj = 60000000;
world.now = () => reloj;
e.scheduler.now = () => reloj;

/** EL AZAR EN LA MANO: lo que devuelva esto es la tirada de cada objeto (0 = se pierde todo). */
let tirada = 0.5;
e.combat.random = () => tirada;

const templo = world.map.getWaypoint('temple');
/** Un sitio transitable fuera de la zona de protección, para morir. */
const fuera = (() => {
    for (let r = 4; r < 60; r += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
            const c = { x: templo.x + dx, y: templo.y + r, z: templo.z };
            const t = world.map.getTile(c.x, c.y, c.z);
            if (t && !t.isProtectionZone() && world.map.isWalkable(c.x, c.y, c.z) && t.creatures.length === 0) {
                return c;
            }
        }
    }
    throw new Error('no hay sitio fuera de la zona de protección');
})();

e.repository.createAccount('Cementerio', 'clave-muerte');
function conectar(nombre, vocacion) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    const r = sesion.login({ account: 'Cementerio', password: 'clave-muerte', character: nombre, crear: true, vocation: vocacion || 'Knight' });
    if (!r.handled || !sesion.player) {
        throw new Error('no entra ' + nombre + ': ' + JSON.stringify(r));
    }
    return { sesion, buzon, pj: sesion.player };
}
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]);
const decir = (s, texto) => s.sesion.handle([P.CLIENT.SAY, texto]);

/** Le pone nivel, experiencia, skills y nivel mágico, y lo lleva a morir fuera del templo. */
function preparar(pj, nivel) {
    pj.level = nivel;
    pj.experience = experienceForLevel(nivel) + 1234;
    pj.skills.sword = { level: 40, tries: 300 };
    pj.skills.shielding = { level: 30, tries: 0 };
    pj.magicLevel = 4;
    pj.manaSpent = 500;
    world.applyLevel(pj, { curar: true });
    world.teleportCreature(pj, fuera);
}

/** Los tries totales de una skill (todos los niveles subidos más la barra). */
function triesTotales(vocacion, skill, estado) {
    let total = estado.tries;
    for (let n = Vocacion.SKILL_INICIAL; n < estado.level; n += 1) {
        total += Vocacion.triesParaSkill(vocacion, skill, n);
    }
    return total;
}
function manaTotal(vocacion, pj) {
    let total = pj.manaSpent;
    for (let n = 0; n < pj.magicLevel; n += 1) {
        total += Vocacion.manaParaNivelMagico(vocacion, n);
    }
    return total;
}

const monstruo = () => world.createMonster('Wolf', { x: fuera.x + 1, y: fuera.y, z: fuera.z }) ||
    world.createMonster([...world.monsterTypes.keys()][0], { x: fuera.x + 1, y: fuera.y, z: fuera.z });

// ===========================================================================
section('2. Morir sin bendiciones');
// ===========================================================================
const ana = conectar('Ana Muerte');
{
    const { pj } = ana;
    preparar(pj, 50);
    const voc = world.vocationOf(pj);
    world.giveItem(pj, 3031, 50);
    pj.inventory.push({ slot: 'hand', position: pj.inventory.length, typeId: 2400, count: 1 });
    pj.inventory.push({ slot: 'head', position: pj.inventory.length, typeId: 2410, count: 1 });
    world.recomputeEquipment(pj);
    const mochila = world.containerOf(pj);

    const antes = {
        exp: pj.experience, sword: triesTotales(voc, 'sword', pj.skills.sword),
        shielding: triesTotales(voc, 'shielding', pj.skills.shielding), mana: manaTotal(voc, pj)
    };
    const lobo = monstruo();
    tirada = 0.5;   // 50 ≥ 10: las piezas equipadas se salvan; la mochila (100 %) no
    const r = e.combat.applyDamage(pj, 999999, { attacker: lobo });
    const info = e.combat.lastPlayerDeath;

    check('muere y reaparece en el templo con la vida llena', r.killed === true && pj.health === pj.maxHealth &&
        pj.position.x === templo.x && pj.position.y === templo.y, String(pj.position));
    check('pierde un 10 % de la experiencia', pj.experience === antes.exp - Math.floor(antes.exp * 10 / 100),
        antes.exp + ' -> ' + pj.experience);
    check('y un 10 % de TODO lo entrenado de cada skill (baja de nivel si toca)',
        triesTotales(voc, 'sword', pj.skills.sword) === antes.sword - Math.floor(antes.sword * 0.1) &&
        triesTotales(voc, 'shielding', pj.skills.shielding) === antes.shielding - Math.floor(antes.shielding * 0.1) &&
        pj.skills.sword.level < 40, 'espada 40 -> ' + pj.skills.sword.level + ', escudo 30 -> ' + pj.skills.shielding.level);
    check('y del maná gastado de todos los niveles mágicos', manaTotal(voc, pj) === antes.mana - Math.floor(antes.mana * 0.1),
        'nivel mágico 4 -> ' + pj.magicLevel);
    check('el aviso trae el nivel AL MORIR y lo perdido', info && info.level === 50 && info.loss.experiencia > 0 &&
        info.killedBy === lobo.name && info.isPlayer === false, JSON.stringify({ nivel: info.level, por: info.killedBy }));

    const cuerpo = info.corpse;
    const dentro = cuerpo ? world.contentsOfItem(cuerpo) : [];
    const bolsa = dentro.find((i) => i.typeId === mochila.typeId);
    check('queda su cuerpo («dead human») donde cayó', cuerpo && cuerpo.typeId === 12246 &&
        cuerpo.position.x === fuera.x && cuerpo.position.y === fuera.y && cuerpo.getAttribute('corpseOf') === 'Ana Muerte',
        cuerpo ? String(cuerpo.position) : 'sin cuerpo');
    check('sin bendiciones la mochila se pierde (100 %), al cuerpo y con lo de dentro dentro',
        bolsa && world.contentsOfItem(bolsa).some((i) => i.typeId === 3031 && i.count === 50) && r.loot.includes(bolsa),
        dentro.map((i) => i.typeId).join(','));
    check('con la tirada en contra (50 ≥ 10 %), las piezas equipadas se quedan',
        world.equippedIn(pj, 'hand') && world.equippedIn(pj, 'head') && !dentro.some((i) => i.typeId === 2400));
    check('y le ponen una mochila nueva y vacía (sin ella no podría coger nada)',
        world.containerOf(pj) && world.containerOf(pj) !== mochila && world.contentsOf(pj).length === 0);
    check('se le dice que ha bajado de nivel si bajó', pj.level < 50
        ? textos(ana.buzon).some((t) => t === 'Has bajado del nivel 50 al nivel ' + pj.level + '.') : true,
        textos(ana.buzon).slice(-4).join(' | '));

    // Otra vez, con la tirada a favor: 5 < 10 %, se pierde también cada pieza equipada.
    preparar(pj, 50);
    tirada = 0.05;
    e.combat.applyDamage(pj, 999999, { attacker: monstruo() });
    const dentro2 = world.contentsOfItem(e.combat.lastPlayerDeath.corpse).map((i) => i.typeId);
    check('con la tirada por debajo del 10 %, las piezas equipadas también van al cuerpo',
        dentro2.includes(2400) && dentro2.includes(2410) && !world.equippedIn(pj, 'hand') && !world.equippedIn(pj, 'head'),
        dentro2.join(','));
}

// ===========================================================================
section('3. El historial de muertes');
// ===========================================================================
{
    const filas = e.repository.database.listDeaths(ana.pj.characterId, 10);
    check('cada muerte es una fila de player_deaths, la última primero', filas.length === 2 &&
        filas.every((f) => f.level === 50 && f.isPlayer === false && f.killedBy) &&
        filas[0].time === Math.floor(reloj / 1000) * 1000, JSON.stringify(filas[0]));

    ana.buzon.length = 0;
    decir(ana, '/muertes');
    const lineas = textos(ana.buzon);
    check('/muertes las lista', lineas[0] === 'Ultimas muertes de Ana Muerte:' &&
        lineas.filter((t) => / - murio a nivel 50 a manos de /.test(t)).length === 2, lineas.join(' | '));

    // Una muerte a manos de otro jugador, sin calavera: injusta.
    const beto = conectar('Beto Verdugo');
    const cris = conectar('Cris Victima');
    world.teleportCreature(cris.pj, fuera);
    world.teleportCreature(beto.pj, { x: fuera.x + 1, y: fuera.y, z: fuera.z });
    reloj += 60000;
    e.combat.applyDamage(cris.pj, 999999, { attacker: beto.pj });
    const suya = e.repository.database.listDeaths(cris.pj.characterId, 10);
    check('morir a manos de otro jugador sin calavera queda como injusta', suya.length === 1 &&
        suya[0].isPlayer === true && suya[0].unjustified === true && suya[0].killedBy === 'Beto Verdugo', JSON.stringify(suya[0]));

    ana.buzon.length = 0;
    decir(ana, '/muertes cris victima');
    check('/muertes <nombre> enseña las de otro (sin mayúsculas también)',
        textos(ana.buzon).some((t) => /murio a nivel 1 a manos de Beto Verdugo \(muerte injusta\)\.$/.test(t)),
        textos(ana.buzon).join(' | '));
    ana.buzon.length = 0;
    decir(ana, '/muertes Beto Verdugo');
    decir(ana, '/muertes Nadie Existe');
    check('de quien no ha muerto lo dice, y de quien no existe también',
        textos(ana.buzon)[0] === 'Beto Verdugo no ha muerto nunca.' &&
        textos(ana.buzon)[1] === 'No existe ningun personaje llamado «Nadie Existe».', textos(ana.buzon).join(' | '));
    beto.sesion.close();
    cris.sesion.close();
}

// ===========================================================================
section('4. Las bendiciones: el Sanador las vende');
// ===========================================================================
const sanador = world.getNpc('Sanador');
const oir = (pj, texto) => {
    reloj += 1000;
    sanador.hear(pj, texto, reloj);
    return sanador.lastSaid;
};
{
    const { pj } = ana;
    preparar(pj, 50);
    world.teleportCreature(pj, { x: sanador.position.x + 1, y: sanador.position.y, z: sanador.position.z });
    world.clearCombat(pj);
    world.darDinero(pj, 40000);
    const dinero = world.countMoney(pj);
    const wrap = e.registry.entities.creature(pj.id);

    check('el envoltorio: hasBlessing, getBlessingCount, getBlessingCost', wrap.hasBlessing(1) === false &&
        wrap.getBlessingCount() === 0 && wrap.getBlessingCost() === 6000);
    oir(pj, 'hola');
    const lista = oir(pj, 'bendiciones');
    check('«bendiciones» dice el precio a su nivel', /cuesta 6000 de oro/.test(lista), lista);
    const oferta = oir(pj, 'spark of the phoenix');
    check('el nombre de una (también en inglés) la ofrece', oferta ===
        'La bendicion "Chispa del Fenix" te cuesta 6000 de oro. ¿La quieres? Di "si" o "no".', oferta);
    oir(pj, 'yes');
    check('«yes» la compra y cobra', wrap.hasBlessing(4) && world.countMoney(pj) === dinero - 6000,
        dinero + ' -> ' + world.countMoney(pj));
    check('pedirla otra vez dice que ya la tiene', oir(pj, 'chispa') === 'Ya tienes la bendicion "Chispa del Fenix".');
    check('«no» deja la oferta sin efecto', /6000/.test(oir(pj, 'soledad')) && oir(pj, 'no') === 'Como quieras.' &&
        oir(pj, 'si') === 'No te he ofrecido nada. Preguntame por las "bendiciones".' && !wrap.hasBlessing(5));
    const todas = oir(pj, 'todas');
    check('«todas» ofrece las que faltan, al precio de cada una', /^Te faltan 4 bendiciones: son 24000 de oro/.test(todas), todas);
    oir(pj, 'si');
    check('y «si» las da todas y cobra', wrap.getBlessingCount() === 5 && world.countMoney(pj) === dinero - 30000,
        world.countMoney(pj) + ' de oro');
    check('con las cinco, «todas» lo dice', oir(pj, 'todas') === 'Ya tienes las cinco bendiciones.');

    const pobre = conectar('Pobre Sinoro');
    world.teleportCreature(pobre.pj, { x: sanador.position.x - 1, y: sanador.position.y, z: sanador.position.z });
    sanador.clearFocus();
    reloj += 1000;
    sanador.hear(pobre.pj, 'hi', reloj);
    oir(pobre.pj, 'embrace');
    check('sin dinero no se compra', oir(pobre.pj, 'si') === 'No te alcanza: hacen falta 2000 de oro.' &&
        !e.registry.entities.creature(pobre.pj.id).hasBlessing(2));
    sanador.clearFocus();
    pobre.sesion.close();

    ana.buzon.length = 0;
    decir(ana, '/bendiciones');
    const b = textos(ana.buzon).map((t) => t.trim());
    check('/bendiciones las lista con lo que perdería', b[0] === 'Tus bendiciones (5 de 5):' &&
        b.includes('Escudo Espiritual: la tienes.') &&
        b.includes('Si murieras ahora perderias un 6% de experiencia, skills y nivel magico.') &&
        b.includes('Cada objeto equipado se pierde con un 0% y la mochila con un 0%.'), b.join(' | '));

    e.repository.save(pj);
    check('se guardan con el personaje (storages bendicion:1 ... 5)',
        Number(e.repository.database.getStorage(pj.characterId, 'bendicion:1')) === 1 &&
        Number(e.repository.database.getStorage(pj.characterId, 'bendicion:5')) === 1);
}

// ===========================================================================
section('5. Morir con las cinco bendiciones');
// ===========================================================================
{
    const { pj } = ana;
    preparar(pj, 50);
    const voc = world.vocationOf(pj);
    world.giveItem(pj, 3031, 20);
    pj.inventory.push({ slot: 'hand', position: pj.inventory.length, typeId: 2400, count: 1 });
    world.recomputeEquipment(pj);
    const mochila = world.containerOf(pj);
    const cosas = pj.inventory.length;
    const antes = { exp: pj.experience, sword: triesTotales(voc, 'sword', pj.skills.sword) };
    tirada = 0;   // la tirada más a favor de perder: aun así, nada
    ana.buzon.length = 0;
    const r = e.combat.applyDamage(pj, 999999, { attacker: monstruo() });

    check('pierde un 6 % (10 % − 5 × 8 %) de experiencia y de skills',
        pj.experience === antes.exp - Math.floor(antes.exp * 6 / 100) &&
        triesTotales(voc, 'sword', pj.skills.sword) === antes.sword - Math.floor(antes.sword * 0.06),
        antes.exp + ' -> ' + pj.experience);
    check('y no pierde NADA de lo que lleva, ni con la peor tirada', r.loot.length === 0 &&
        pj.inventory.length === cosas && world.containerOf(pj) === mochila && world.equippedIn(pj, 'hand') &&
        world.contentsOfItem(e.combat.lastPlayerDeath.corpse).length === 0);
    check('el cuerpo queda igual, vacío', e.combat.lastPlayerDeath.corpse && e.combat.lastPlayerDeath.corpse.typeId === 12246);
    check('las bendiciones se gastan TODAS al morir', e.registry.entities.creature(pj.id).getBlessingCount() === 0 &&
        textos(ana.buzon).includes('Tus bendiciones te protegieron y se han gastado.'));
    e.repository.save(pj);
    check('y se guarda que ya no las tiene', Number(e.repository.database.getStorage(pj.characterId, 'bendicion:4')) === 0);
}

// ===========================================================================
section('6. En inglés');
// ===========================================================================
{
    const I = await import('../shared/js/i18n.mjs');
    await import('../shared/i18n/juego.mjs');
    const muerte = (await import('../shared/i18n/en/muerte.mjs')).default;
    check('el diccionario muerte.mjs no tiene problemas', I.problemasDeDiccionario(muerte).length === 0,
        I.problemasDeDiccionario(muerte).slice(0, 3).join(' | '));
    const casos = [
        ['La bendicion "Chispa del Fenix" te cuesta 6000 de oro. ¿La quieres? Di "si" o "no".',
            'The blessing "The Spark of the Phoenix" costs you 6000 gold. Do you want it? Say "yes" or "no".'],
        ['Has bajado del nivel 50 al nivel 49.', 'You were downgraded from Level 50 to Level 49.'],
        ['2026-10-31 18:05 - murio a nivel 50 a manos de Beto Verdugo (muerte injusta).',
            '2026-10-31 18:05 - died at level 50, killed by Beto Verdugo (unjustified kill).'],
        ['2026-10-31 18:05 - murio a nivel 50 a manos de Beto Verdugo.', '2026-10-31 18:05 - died at level 50, killed by Beto Verdugo.'],
        ['Escudo Espiritual: la tienes.', 'The Spiritual Shielding: you have it.'],
        ['Cada objeto equipado se pierde con un 4% y la mochila con un 40%.',
            'Each equipped item has a 4% chance of being lost, and the backpack 40%.'],
        ['Cada una te quita parte de lo que pierdes al morir, y se gastan todas cuando caes. A tu nivel cada una cuesta ' +
            '6000 de oro; di su nombre, o "todas" para las que te falten.',
        'Each one reduces what you lose when you die, and they are all spent when you fall. At your level each one costs ' +
            '6000 gold; say its name, or "all" for the ones you are missing.'],
        ['Ana Muerte no ha muerto nunca.', 'Ana Muerte has never died.']
    ];
    casos.forEach(([es, en]) => {
        const t = I.traducir(es, 'en');
        check('«' + es.slice(0, 50) + '…» se traduce', t === en, t);
    });
    // La lista de las cinco, tal como la dice el Sanador.
    const { pj } = ana;
    world.teleportCreature(pj, { x: sanador.position.x + 1, y: sanador.position.y, z: sanador.position.z });
    sanador.clearFocus();
    reloj += 1000;
    sanador.hear(pj, 'hi', reloj);
    const dichas = [];
    const antes = sanador.onSayLine;
    sanador.onSayLine = (t) => { dichas.push(t); if (antes) { antes(t); } };
    oir(pj, 'blessings');
    sanador.onSayLine = antes;
    check('y lo que dice el Sanador de las bendiciones, entero', dichas.length === 2 &&
        dichas.every((t) => I.traducir(t, 'en') !== t), dichas.map((t) => I.traducir(t, 'en')).join(' / '));
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
    console.log('\x1b[32mTodo OK\x1b[0m — morir cuesta lo que en TFS y las bendiciones lo abaratan.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
