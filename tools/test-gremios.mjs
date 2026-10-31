/**
 * PRUEBAS DE LOS GREMIOS.
 *
 *     node tools/test-gremios.mjs
 *
 * Con el motor de verdad, el mapa `jetyum`, el reloj en la mano y una base de datos TEMPORAL (en la
 * carpeta temporal del sistema):
 *
 *   1. fundar: cada motivo para no poder (`!createguild`) y la fundación, con sus tres rangos
 *   2. invitar y entrar: `!guildinvite`, `!joinguild` (y el aviso al gremio, por el canal o a mano)
 *   3. quién puede qué: la tabla de permisos del líder, el vicelíder y el miembro
 *   4. a quien no está conectado: invitar, echar y ascender por la base; retirar una invitación
 *   5. el mensaje del día y los apodos
 *   6. el look: «Ella es Líder del gremio…», «Él es…», «Eres…»
 *   7. `gremioDe` y `gremioPorId`, lo que usan los canales
 *   8. pasar el mando, salir y disolver
 *   9. se guarda: volver a entrar, y reiniciar el motor sobre la misma base
 *  10. los envoltorios de los scripts: `player:getGuild()` y compañía
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

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-gremios-'));
const baseDeDatos = path.join(carpeta, 'gremios.db');

let reloj = Date.now();
let e = null;
let world = null;
let db = null;

function arrancar() {
    e = createEngine({
        rootDir: ROOT,
        logLevel: 'error',
        overrides: { mapName: 'jetyum', mapFile: null, useDatabase: true, databaseFile: baseDeDatos, guildCreateLevel: 8 }
    });
    world = e.world;
    db = e.repository.database;
    world.now = () => reloj;
    e.scheduler.now = () => reloj;
}
arrancar();

function conectar(nombre, sexo) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    const existe = !!db.findCharacterByName(nombre);
    const r = sesion.login({ account: 'Gremial', password: 'clave-gremio', character: nombre, crear: !existe,
        vocation: 'Knight', sex: sexo || 'male' });
    if (!r.handled || !sesion.player) {
        throw new Error('no entra ' + nombre + ': ' + JSON.stringify(r));
    }
    return { sesion, buzon, pj: sesion.player, wrap: e.registry.entities.creature(sesion.player.id) };
}
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]);
const ultimo = (buzon) => textos(buzon).slice(-1)[0];
/** Dice algo y devuelve lo último que se le contestó. */
function decir(s, texto) {
    reloj += 1000;
    s.sesion.handle([P.CLIENT.SAY, texto]);
    return ultimo(s.buzon);
}
const recibio = (s, texto) => textos(s.buzon).includes(texto);
const nivelEnBase = (s) => {
    const m = db.guildMembership(s.pj.characterId);
    return m ? db.guildRanks(m.guildId).find((r) => r.id === m.rankId).level : 0;
};
/** Que nadie tenga abierto el canal del gremio: los avisos van a mano. */
function sinCanal() {
    world.mensajeAlCanalDeGremio = undefined;
}

// ===========================================================================
section('1. Fundar un gremio');
// ===========================================================================
const ana = conectar('Ana Gremial', 'female');
const beto = conectar('Beto Gremial');
const ciro = conectar('Ciro Gremial');
const dora = conectar('Dora Ausente', 'female');
const doraId = dora.pj.characterId;
dora.sesion.close();
sinCanal();
let guildId = 0;
{
    check('sin nombre, dice cómo se usa', decir(ana, '!createguild') === 'Uso: !createguild <nombre>');
    check('a nivel 1, no: «Necesitas nivel 8…»', decir(ana, '!createguild Dragones') ===
        'Necesitas nivel 8 para fundar un gremio.', ultimo(ana.buzon));
    [ana, beto, ciro].forEach((s) => { s.pj.level = 10; });
    check('un nombre corto no vale', decir(ana, '!createguild Dr') ===
        'El nombre de un gremio tiene que tener de 3 a 20 letras y espacios.');
    check('con cifras tampoco', decir(ana, '!createguild Dragones 2') ===
        'El nombre de un gremio tiene que tener de 3 a 20 letras y espacios.');
    check('ni de más de 20', decir(ana, '!createguild Los Dragones Del Norte Frio') ===
        'El nombre de un gremio tiene que tener de 3 a 20 letras y espacios.');
    const r = decir(ana, '!createguild   Dragones  ');
    check('con todo en regla, se funda', r === 'Has fundado el gremio Dragones. Eres su líder.', r);
    const fila = db.findGuild('dragones');
    guildId = fila ? fila.id : 0;
    check('en la base: el gremio, su dueño y sus tres rangos', fila && fila.name === 'Dragones' &&
        fila.ownerId === ana.pj.characterId &&
        JSON.stringify(db.guildRanks(fila.id).map((x) => [x.name, x.level])) ===
            JSON.stringify([['Líder', 3], ['Vicelíder', 2], ['Miembro', 1]]));
    check('y la fundadora es su líder', nivelEnBase(ana) === 3);
    check('estando en uno, no se funda otro', decir(ana, '!createguild Otros') === 'Ya estás en un gremio.');
    check('el nombre es único, sin mayúsculas', decir(beto, '!createguild DRAGONES') ===
        'Ya existe un gremio llamado DRAGONES.', ultimo(beto.buzon));
}

// ===========================================================================
section('2. Invitar y entrar');
// ===========================================================================
{
    check('sin invitación no se entra', decir(beto, '!joinguild Dragones') === 'No te han invitado al gremio Dragones.');
    check('a un gremio que no existe, tampoco', decir(beto, '!joinguild Nadie') ===
        'No existe ningún gremio llamado «Nadie».');
    check('!joinguild a secas: no tienes invitaciones', decir(beto, '!joinguild') ===
        'No tienes invitaciones a ningún gremio.');
    const r = decir(ana, '!guildinvite beto gremial');
    check('la líder invita', r === 'Beto Gremial está invitado al gremio Dragones.', r);
    check('y a Beto se le dice cómo entrar', recibio(beto,
        'Ana Gremial te ha invitado al gremio Dragones. Escribe !joinguild Dragones para entrar.'));
    check('dos veces, no', decir(ana, '!guildinvite Beto Gremial') === 'Beto Gremial ya estaba invitado.');
    check('a alguien que no existe, no', decir(ana, '!guildinvite Nadie Nunca') ===
        'No existe ningún personaje llamado «Nadie Nunca».');
    check('a sí misma, no', decir(ana, '!guildinvite Ana Gremial') === 'No puedes hacerte eso a ti mismo.');
    check('!joinguild a secas enseña las invitaciones', decir(beto, '!joinguild') ===
        'Te han invitado a: Dragones. Uso: !joinguild <gremio>');
    const j = decir(beto, '!joinguild dragones');
    check('Beto acepta', j === 'Has entrado en el gremio Dragones.' && nivelEnBase(beto) === 1, j);
    check('y la líder se entera (sin canal abierto, por mensaje)', recibio(ana, 'Beto Gremial se ha unido al gremio.'));
    check('la invitación ya no está', !db.hasGuildInvite(beto.pj.characterId, guildId));
    check('a quien ya está en un gremio no se le invita', decir(ana, '!guildinvite Beto Gremial') ===
        'Beto Gremial ya está en un gremio.');

    // Por el canal del gremio, si los canales lo ponen y alguien lo tiene abierto.
    const canal = [];
    world.mensajeAlCanalDeGremio = (id, texto) => { canal.push([id, texto]); return 1; };
    decir(ana, '!guildinvite Ciro Gremial');
    ciro.buzon.length = 0;
    decir(ciro, '!joinguild Dragones');
    check('con canal, el aviso va por el canal del gremio', canal.length === 1 && canal[0][0] === guildId &&
        canal[0][1] === 'Ciro Gremial se ha unido al gremio.', JSON.stringify(canal));
    sinCanal();
}

// ===========================================================================
section('3. Quién puede qué');
// ===========================================================================
{
    // Beto y Ciro son miembros.
    check('un miembro no invita', decir(beto, '!guildinvite Dora Ausente') === 'No tienes rango para eso en el gremio.');
    check('ni echa', decir(beto, '!guildkick Ciro Gremial') === 'No tienes rango para eso en el gremio.');
    check('ni asciende', decir(beto, '!guildpromote Ciro Gremial') === 'No tienes rango para eso en el gremio.');
    check('ni cambia el mensaje del día', decir(beto, '!guildmotd hola') === 'No tienes rango para eso en el gremio.');
    check('ni pasa el mando, ni disuelve', decir(beto, '!guildleader Ciro Gremial') === 'No tienes rango para eso en el gremio.' &&
        decir(beto, '!disbandguild') === 'No tienes rango para eso en el gremio.');

    const p = decir(ana, '!guildpromote Beto Gremial');
    check('la líder asciende a Beto a vicelíder', p === 'Beto Gremial es ahora Vicelíder.' && nivelEnBase(beto) === 2, p);
    check('el gremio se entera', recibio(ciro, 'Beto Gremial es ahora Vicelíder del gremio.'));
    check('más arriba no: para líder está !guildleader', decir(ana, '!guildpromote Beto Gremial') ===
        'Beto Gremial ya tiene el rango más alto: para hacerle líder, usa !guildleader.');
    check('degradar a un miembro, no', decir(ana, '!guilddemote Ciro Gremial') === 'Ciro Gremial ya tiene el rango más bajo.');
    check('a alguien de fuera, no', decir(ana, '!guildpromote Dora Ausente') === 'Dora Ausente no es de tu gremio.');

    check('el vicelíder SÍ invita', decir(beto, '!guildinvite Dora Ausente') ===
        'Dora Ausente está invitado al gremio Dragones.' && db.hasGuildInvite(doraId, guildId));
    check('pero no asciende ni degrada', decir(beto, '!guildpromote Ciro Gremial') === 'No tienes rango para eso en el gremio.' &&
        decir(beto, '!guilddemote Ciro Gremial') === 'No tienes rango para eso en el gremio.');
    check('ni echa a la líder', decir(beto, '!guildkick Ana Gremial') ===
        'No puedes echar a Ana Gremial: su rango es igual o mayor que el tuyo.');
    decir(ana, '!guildpromote Ciro Gremial');
    check('ni a otro vicelíder', decir(beto, '!guildkick Ciro Gremial') ===
        'No puedes echar a Ciro Gremial: su rango es igual o mayor que el tuyo.');
    check('la líder degrada a Ciro', decir(ana, '!guilddemote Ciro Gremial') === 'Ciro Gremial es ahora Miembro.' &&
        nivelEnBase(ciro) === 1);
    ciro.buzon.length = 0;
    const k = decir(beto, '!guildkick Ciro Gremial');
    check('y entonces el vicelíder sí puede echarle', k === 'Ciro Gremial ya no es del gremio.' &&
        !db.guildMembership(ciro.pj.characterId), k);
    check('a Ciro se le dice, y deja de estar en el gremio en memoria', recibio(ciro, 'Te han expulsado del gremio Dragones.') &&
        world.gremioDe(ciro.pj) === null);
    check('el gremio se entera', recibio(ana, 'Ciro Gremial ha sido expulsado del gremio por Beto Gremial.'));
    check('echarse a uno mismo, no', decir(beto, '!guildkick Beto Gremial') === 'No puedes hacerte eso a ti mismo.');
    check('sin gremio, «No estás en ningún gremio.»', decir(ciro, '!guildinvite Ana Gremial') === 'No estás en ningún gremio.' &&
        decir(ciro, '!leaveguild') === 'No estás en ningún gremio.');
}

// ===========================================================================
section('4. A quien no está conectado');
// ===========================================================================
{
    // Dora (desconectada) tiene la invitación de Beto: entra, sale del juego, y se la gestiona por la base.
    const d = conectar('Dora Ausente', 'female');
    decir(d, '!joinguild Dragones');
    d.sesion.close();
    check('Dora entró y se fue', db.guildMembership(doraId) && !world.playerByName('Dora Ausente'));
    const p = decir(ana, '!guildpromote Dora Ausente');
    check('ascender a quien no está: por la base', p === 'Dora Ausente es ahora Vicelíder.' &&
        db.guildRanks(guildId).find((r) => r.id === db.guildMembership(doraId).rankId).level === 2, p);
    decir(ana, '!guilddemote Dora Ausente');
    const k = decir(ana, '!guildkick Dora Ausente');
    check('echar a quien no está: por la base', k === 'Dora Ausente ya no es del gremio.' && !db.guildMembership(doraId), k);
    decir(ana, '!guildinvite Dora Ausente');
    check('invitar a quien no está: por la base', db.hasGuildInvite(doraId, guildId));
    check('!guildkick a quien sólo está invitado le retira la invitación', decir(ana, '!guildkick Dora Ausente') ===
        'Has retirado la invitación de Dora Ausente.' && !db.hasGuildInvite(doraId, guildId));
}

// ===========================================================================
section('5. El mensaje del día y los apodos');
// ===========================================================================
{
    check('sin mensaje del día', decir(beto, '!guildmotd') === 'El gremio no tiene mensaje del día.');
    const m = decir(ana, '!guildmotd Cazamos en el norte a las 20:00');
    check('la líder lo pone', m === 'Has cambiado el mensaje del día del gremio.' &&
        db.findGuild(guildId).motd === 'Cazamos en el norte a las 20:00', m);
    check('y el gremio lo recibe', recibio(beto, 'Mensaje del día del gremio: Cazamos en el norte a las 20:00'));
    check('!guildmotd a secas lo enseña', decir(beto, '!guildmotd') === 'Mensaje del día del gremio: Cazamos en el norte a las 20:00');
    check('el vicelíder también lo cambia', decir(beto, '!guildmotd Mañana descansamos') ===
        'Has cambiado el mensaje del día del gremio.' && world.gremioDe(ana.pj).motd === 'Mañana descansamos');
    check('«-» lo quita', decir(ana, '!guildmotd -') === 'Has quitado el mensaje del día del gremio.' &&
        world.gremioDe(ana.pj).motd === '');
    decir(ana, '!guildmotd Mañana descansamos');

    check('cada uno se pone su apodo', decir(beto, '!guildnick Rayo') === 'Tu apodo en el gremio es ahora «Rayo».' &&
        db.guildMembership(beto.pj.characterId).nick === 'Rayo');
    check('la líder pone el de otro', decir(ana, '!guildnick Beto Gremial, El Rayo') ===
        'Beto Gremial tiene ahora el apodo «El Rayo».' && world.gremioDe(beto.pj).apodo === 'El Rayo');
    check('el vicelíder no pone el de la líder', decir(beto, '!guildnick Ana Gremial, Jefa') ===
        'No tienes rango para eso en el gremio.');
    check('un apodo demasiado largo no vale', decir(beto, '!guildnick Un apodo larguisimo de verdad') ===
        'Un apodo puede tener hasta 15 letras, cifras y espacios.');
    check('ni con símbolos raros', decir(beto, '!guildnick <b>') === 'Un apodo puede tener hasta 15 letras, cifras y espacios.');
    check('el de alguien de fuera, no', decir(ana, '!guildnick Ciro Gremial, Nada') === 'Ciro Gremial no es de tu gremio.');
    check('sin apodo, se quita', decir(ana, '!guildnick') === 'Has quitado tu apodo del gremio.');
}

// ===========================================================================
section('6. Lo que se ve al mirar');
// ===========================================================================
{
    const mirar = (s, quien) => {
        s.buzon.length = 0;
        s.sesion.handle([P.CLIENT.LOOK, quien.pj.position.x, quien.pj.position.y, quien.pj.position.z]);
        return textos(s.buzon);
    };
    world.teleportCreature(ana.pj, { x: ana.pj.position.x, y: ana.pj.position.y, z: ana.pj.position.z });
    check('a la líder: «Ella es Líder del gremio Dragones.»', mirar(ciro, ana).includes('Ella es Líder del gremio Dragones.'),
        mirar(ciro, ana).join(' | '));
    check('a Beto, con su apodo: «Él es Vicelíder del gremio Dragones (El Rayo).»',
        mirar(ciro, beto).includes('Él es Vicelíder del gremio Dragones (El Rayo).'), mirar(ciro, beto).join(' | '));
    check('a sí misma: «Eres Líder del gremio Dragones.»', mirar(ana, ana).includes('Eres Líder del gremio Dragones.'));
    check('a quien no está en ninguno, nada de gremio', !mirar(ana, ciro).some((t) => /gremio/.test(t)),
        mirar(ana, ciro).join(' | '));
}

// ===========================================================================
section('7. gremioDe y gremioPorId');
// ===========================================================================
{
    const g = world.gremioDe(ana.pj);
    check('gremioDe: { id, nombre, rango, nivel, motd }', g && g.id === guildId && g.nombre === 'Dragones' &&
        g.rango === 'Líder' && g.nivel === 3 && g.motd === 'Mañana descansamos', JSON.stringify(g));
    check('de quien no está en ninguno, null', world.gremioDe(ciro.pj) === null);
    check('de un monstruo o de nada, null', world.gremioDe(null) === null && world.gremioDe({}) === null);
    const p = world.gremioPorId(guildId);
    check('gremioPorId: nombre, dueño y rangos', p && p.nombre === 'Dragones' && p.duenoId === ana.pj.characterId &&
        p.rangos.length === 3 && p.rangos[0].nivel === 3, JSON.stringify(p));
    check('uno que no existe, null', world.gremioPorId(9999) === null);
    check('quién está conectado', world.jugadoresDeGremio(guildId).map((x) => x.name).sort().join(',') ===
        'Ana Gremial,Beto Gremial');
    check('la caché se rehace al cambiar (la base manda)', (() => {
        db.setGuildMotd(guildId, 'a mano');
        const antes = world.gremioDe(ana.pj).motd;
        world.ponerMensajeDelGremio(guildId, 'Mañana descansamos');
        return antes === 'Mañana descansamos' && world.gremioDe(ana.pj).motd === 'Mañana descansamos';
    })());
}

// ===========================================================================
section('8. Pasar el mando, salir y disolver');
// ===========================================================================
{
    check('la líder no puede irse sin más', decir(ana, '!leaveguild') ===
        'El líder no puede dejar el gremio: pasa el mando con !guildleader o disuélvelo con !disbandguild.');
    check('pasar el mando a alguien de fuera, no', decir(ana, '!guildleader Ciro Gremial') === 'Ciro Gremial no es de tu gremio.');
    const l = decir(ana, '!guildleader Beto Gremial');
    check('pasa el mando a Beto', l === 'Beto Gremial es ahora el líder del gremio, y tú su vicelíder.' &&
        nivelEnBase(beto) === 3 && nivelEnBase(ana) === 2 && db.findGuild(guildId).ownerId === beto.pj.characterId, l);
    check('en memoria también', world.gremioDe(beto.pj).nivel === 3 && world.gremioDe(ana.pj).rango === 'Vicelíder');
    const s = decir(ana, '!leaveguild');
    check('ahora Ana sí puede irse', s === 'Has dejado el gremio Dragones.' && !db.guildMembership(ana.pj.characterId) &&
        world.gremioDe(ana.pj) === null, s);
    check('y el gremio se entera', recibio(beto, 'Ana Gremial ha dejado el gremio.'));
    // Se vuelve a montar para lo que sigue: Ana entra otra vez.
    decir(beto, '!guildinvite Ana Gremial');
    decir(ana, '!joinguild Dragones');
    check('Ana vuelve como miembro', nivelEnBase(ana) === 1);
}

// ===========================================================================
section('9. Se guarda');
// ===========================================================================
{
    beto.sesion.close();
    const b2 = conectar('Beto Gremial');
    check('al volver a entrar, sigue en el gremio (cargado al entrar)', b2.pj.gremio && b2.pj.gremio.guildId === guildId &&
        world.gremioDe(b2.pj).nivel === 3);
    ana.sesion.close();
    b2.sesion.close();
    ciro.sesion.close();
    e.shutdown();
    arrancar();
    const a3 = conectar('Ana Gremial', 'female');
    const b3 = conectar('Beto Gremial');
    check('y tras reiniciar el motor sobre la misma base', world.gremioDe(a3.pj).nombre === 'Dragones' &&
        world.gremioDe(b3.pj).rango === 'Líder' && world.gremioDe(b3.pj).motd === 'Mañana descansamos');

    // ===========================================================================
    section('10. Los envoltorios de los scripts');
    // ===========================================================================
    const g = b3.wrap.getGuild();
    check('player:getGuild() → getId / getName / getMotd', g && g.getId() === guildId && g.getName() === 'Dragones' &&
        g.getMotd() === 'Mañana descansamos');
    check('getMembersOnline: envoltorios de jugador', g.getMembersOnline().map((p) => p.getName()).sort().join(',') ===
        'Ana Gremial,Beto Gremial' && g.getMembersOnline().every((p) => p.isPlayer && p.isPlayer()));
    const lider = g.getRankByLevel(3);
    check('getRankByLevel(3) y getRankById', lider && lider.name === 'Líder' && lider.level === 3 &&
        g.getRankById(lider.id).name === 'Líder' && g.getRankByLevel(7) === null);
    check('getGuildLevel / getGuildNick', b3.wrap.getGuildLevel() === 3 && a3.wrap.getGuildLevel() === 1 &&
        b3.wrap.getGuildNick() === 'El Rayo');
    check('setMotd desde un script', g.setMotd('Desde un script') && world.gremioDe(a3.pj).motd === 'Desde un script');
    check('setGuildNick (el suyo)', a3.wrap.setGuildNick('Ani') && a3.wrap.getGuildNick() === 'Ani');
    const c3 = conectar('Ciro Gremial');
    check('sin gremio: getGuild() null y nivel 0', c3.wrap.getGuild() === null && c3.wrap.getGuildLevel() === 0 &&
        c3.wrap.getGuildNick() === '');
    check('!guild abre una ventana con el gremio y quién está', (() => {
        b3.buzon.length = 0;
        decir(b3, '!guild');
        const v = b3.buzon.find((m) => m[0] === P.SERVER.TEXT_WINDOW);
        const ventana = v ? v[2] : {};
        return ventana.titulo === 'Gremio Dragones' && /Mensaje del día: Desde un script/.test(ventana.texto) &&
            /Miembros: 2\. Conectados: 2\./.test(ventana.texto) && /Beto Gremial · Líder · El Rayo/.test(ventana.texto) &&
            /Ana Gremial · Miembro · Ani/.test(ventana.texto);
    })());

    const d = decir(b3, '!disbandguild');
    check('el líder disuelve el gremio', d === 'Has disuelto el gremio Dragones.' && !db.findGuild(guildId) &&
        !db.guildMembership(a3.pj.characterId), d);
    check('a los miembros se les dice, y ya no están en ninguno', recibio(a3, 'El gremio Dragones se ha disuelto.') &&
        world.gremioDe(a3.pj) === null && world.gremioDe(b3.pj) === null);
    check('y el nombre queda libre', decir(b3, '!createguild Dragones') === 'Has fundado el gremio Dragones. Eres su líder.');

    // ===========================================================================
    section('11. En inglés');
    // ===========================================================================
    const I = await import('../shared/js/i18n.mjs');
    await import('../shared/i18n/juego.mjs');
    const gremios = (await import('../shared/i18n/en/gremios.mjs')).default;
    check('el diccionario gremios.mjs no tiene problemas', I.problemasDeDiccionario(gremios).length === 0,
        I.problemasDeDiccionario(gremios).slice(0, 3).join(' | '));
    const casos = [
        ['Ella es Líder del gremio Dragones.', 'She is Leader of the Dragones.'],
        ['Él es Vicelíder del gremio Dragones (El Rayo).', 'He is Vice-Leader of the Dragones (El Rayo).'],
        ['Eres Miembro del gremio Dragones.', 'You are Member of the Dragones.'],
        ['Necesitas nivel 8 para fundar un gremio.', 'You need level 8 to create a guild.'],
        ['Ana Gremial te ha invitado al gremio Dragones. Escribe !joinguild Dragones para entrar.',
            'Ana Gremial has invited you to the guild Dragones. Type !joinguild Dragones to join.'],
        ['Beto Gremial se ha unido al gremio.', 'Beto Gremial has joined the guild.'],
        ['No puedes echar a Ana Gremial: su rango es igual o mayor que el tuyo.',
            'You cannot kick Ana Gremial: their rank is equal to or higher than yours.'],
        ['Beto Gremial es ahora Vicelíder.', 'Beto Gremial is now Vice-Leader.']
    ];
    casos.forEach(([es, en]) => {
        const t = I.traducir(es, 'en');
        check('«' + es.slice(0, 50) + '…» se traduce', t === en, t);
    });
    const ventana = 'Fundado el 2026-10-31.\nMensaje del día: Hola\nMiembros: 2. Conectados: 1.\n\nBeto Gremial · Líder · El Rayo';
    const vt = I.traducir(ventana, 'en');
    check('la ventana de !guild, línea a línea', vt ===
        'Founded on 2026-10-31.\nMessage of the day: Hola\nMembers: 2. Online: 1.\n\nBeto Gremial · Leader · El Rayo', vt);
}

e.shutdown();
try {
    fs.rmSync(carpeta, { recursive: true, force: true });
} catch (error) {
    // Windows a veces tarda en soltar el archivo: se queda en la carpeta temporal.
}

console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — los gremios funcionan como en TFS 8.60.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
