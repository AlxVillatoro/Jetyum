/**
 * PRUEBAS DE LOS CASTIGOS: suspender cuentas e IP, namelock, echar y silenciar.
 *
 *     node tools/test-castigos.mjs
 *
 * Con el motor de verdad, el mapa `jetyum`, el reloj en la mano y una base de datos TEMPORAL (en la
 * carpeta temporal del sistema):
 *
 *   1. quién puede: para un jugador los comandos no existen; a alguien del personal sólo le castiga
 *      un grupo mayor
 *   2. `/ban`: la cuenta suspendida, el jugador fuera (aunque esté en combate) y el motivo al entrar
 *   3. `/unban`, los días por defecto, para siempre, y la que caduca (se limpia al entrar)
 *   4. `/baninfo`
 *   5. `/ipban`, con la IP que la sesión recibe de `createSession(send, {ip})`
 *   6. `/namelock`
 *   7. `/kick`
 *   8. `/mute`: no habla en voz alta ni en los canales; los comandos sí; dura lo que dura
 *   9. lo que se dice, en inglés (los dos diccionarios: gremios.mjs lleva los castigos)
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

const DIA = 24 * 60 * 60 * 1000;
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-castigos-'));
const baseDeDatos = path.join(carpeta, 'castigos.db');

let reloj = Date.now();
const e = createEngine({
    rootDir: ROOT,
    logLevel: 'error',
    overrides: { useDatabase: true, databaseFile: baseDeDatos, banDays: 7 }
});
const world = e.world;
const db = e.repository.database;
world.now = () => reloj;
e.scheduler.now = () => reloj;

/** Intenta entrar: `{r, sesion, buzon, pj}` (pj null si no entró). */
function intentar(nombre, cuenta, ip) {
    const buzon = [];
    const sesion = ip === undefined ? e.createSession((m) => buzon.push(m)) : e.createSession((m) => buzon.push(m), { ip });
    const existe = !!db.findCharacterByName(nombre);
    const r = sesion.login({ account: cuenta, password: 'clave-' + cuenta, character: nombre, crear: !existe,
        vocation: 'Knight' });
    return { r, sesion, buzon, pj: r.handled ? sesion.player : null };
}
function conectar(nombre, cuenta, ip) {
    const s = intentar(nombre, cuenta, ip);
    if (!s.pj) {
        throw new Error('no entra ' + nombre + ': ' + JSON.stringify(s.r));
    }
    return s;
}
const textos = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]);
const ultimo = (buzon) => textos(buzon).slice(-1)[0];
function decir(s, texto) {
    reloj += 1000;
    s.resultado = s.sesion.handle([P.CLIENT.SAY, texto]);
    return ultimo(s.buzon);
}
const dentro = (nombre) => !!world.playerByName(nombre);
const errorDeEntrada = (s) => (s.buzon.find((m) => m[0] === P.SERVER.LOGIN_ERROR) || [])[1];
const segundos = () => Math.floor(reloj / 1000);

const gema = conectar('Gema Admin', 'Personal');
gema.pj.groupId = 4;            // gamemaster
const gus = conectar('Gus Dios', 'Dioses');
gus.pj.groupId = 6;             // god
const greta = conectar('Greta Admin', 'Personal2');
greta.pj.groupId = 4;
let pepe = conectar('Pepe Malo', 'Malos', '10.0.0.7');
const pepeCuenta = pepe.pj.accountId;

// ===========================================================================
section('1. Quién puede');
// ===========================================================================
{
    const tito = conectar('Tito Normal', 'Normales');
    decir(tito, '/ban Pepe Malo, 3, porque si');
    check('para un jugador, /ban no existe: se dice en voz alta', tito.resultado.action === 'say' &&
        !db.getAccountBan(pepeCuenta) && dentro('Pepe Malo'), JSON.stringify(tito.resultado));
    ['/unban Pepe Malo', '/ipban Pepe Malo', '/namelock Pepe Malo', '/kick Pepe Malo', '/mute Pepe Malo',
        '/unmute Pepe Malo', '/baninfo Pepe Malo'].forEach((c) => {
        decir(tito, c);
        check(c.split(' ')[0] + ' tampoco existe para él', tito.resultado.action === 'say' && dentro('Pepe Malo'));
    });
    tito.sesion.close();
    check('un GM sin nombre: cómo se usa', decir(gema, '/ban') === 'Uso: /ban <personaje>[, días[, motivo]]');
    check('un GM no castiga a otro GM', decir(gema, '/ban Greta Admin, 1, x') ===
        'No puedes castigar a Greta Admin: es del personal y de un grupo igual o mayor que el tuyo.');
    check('ni a un god', decir(gema, '/kick Gus Dios') ===
        'No puedes castigar a Gus Dios: es del personal y de un grupo igual o mayor que el tuyo.' && dentro('Gus Dios'));
    check('ni a sí mismo', decir(gema, '/mute Gema Admin, 5') === 'No puedes castigarte a ti mismo.');
    check('a quien no existe, no', decir(gema, '/ban Nadie Nunca') === 'No existe ningún personaje llamado «Nadie Nunca».');
    check('días que no son un número, no', decir(gema, '/ban Pepe Malo, mucho, x') === 'Los días tienen que ser un número.');
    // Un god sí puede con un GM (el mayor manda): se le silencia un minuto y se le devuelve la palabra.
    check('un god sí castiga a un GM', decir(gus, '/mute Greta Admin, 1') === 'Greta Admin está silenciado durante 1 minutos.' &&
        decir(gus, '/unmute Greta Admin') === 'Greta Admin ya puede hablar.');
}

// ===========================================================================
section('2. /ban');
// ===========================================================================
{
    pepe.pj.inFightUntil = reloj + 60000;   // en combate: aun así sale
    const r = decir(gema, '/ban Pepe Malo, 2, insultos');
    const ban = db.getAccountBan(pepeCuenta);
    check('la cuenta queda suspendida 2 días, por Gema y con el motivo', ban && ban.expiresAt === segundos() + 2 * 86400 &&
        ban.reason === 'insultos' && ban.bannedByName === 'Gema Admin' && ban.bannedAt === segundos(), JSON.stringify(ban));
    check('el GM recibe la fecha', /^La cuenta de Pepe Malo queda suspendida hasta el \d{4}-\d\d-\d\d \d\d:\d\d\.$/.test(r), r);
    check('Pepe sale del juego aunque estuviera en combate', !dentro('Pepe Malo'));
    check('y se le dijo por qué', textos(pepe.buzon).some((t) => /^Tu cuenta ha sido suspendida hasta el .* por Gema Admin\. Motivo: insultos\.$/.test(t)));
    const otra = intentar('Pepe Malo', 'Malos');
    check('al volver, no entra y se le dice hasta cuándo, quién y por qué', !otra.pj && otra.r.reason === 'loginFailed' &&
        /^Tu cuenta ha sido suspendida hasta el \d{4}-\d\d-\d\d \d\d:\d\d por Gema Admin\. Motivo: insultos\.$/.test(errorDeEntrada(otra)),
    errorDeEntrada(otra));
    const lista = e.repository.charactersOf({ account: 'Malos', password: 'clave-Malos' });
    check('ni ve la lista de personajes', !!lista.error && /suspendida/.test(lista.error));
    const otroPj = intentar('Pepe Segundo', 'Malos');
    check('ni con otro personaje de la cuenta', !otroPj.pj && /suspendida/.test(errorDeEntrada(otroPj) || ''));
    check('la contraseña mal sigue siendo «incorrecta» (no se cuenta nada a quien no la sabe)', (() => {
        const s = e.createSession(() => {});
        const x = s.login({ account: 'Malos', password: 'otra', character: 'Pepe Malo' });
        return /incorrectas/.test(x.error || '');
    })());
}

// ===========================================================================
section('3. /unban, los días por defecto, para siempre y la que caduca');
// ===========================================================================
{
    check('/unban la levanta', decir(gema, '/unban Pepe Malo') === 'La cuenta de Pepe Malo ya no está suspendida.' &&
        !db.getAccountBan(pepeCuenta));
    check('y pasa al historial', db.accountBanHistory(pepeCuenta).length === 1 &&
        db.accountBanHistory(pepeCuenta)[0].reason === 'insultos');
    check('otra vez, no: no lo está', decir(gema, '/unban Pepe Malo') === 'La cuenta de Pepe Malo no está suspendida.');
    pepe = conectar('Pepe Malo', 'Malos', '10.0.0.7');
    check('y Pepe vuelve a entrar', dentro('Pepe Malo'));

    decir(gema, '/ban Pepe Malo');
    check('sin días: los de banDays (7)', db.getAccountBan(pepeCuenta).expiresAt === segundos() + 7 * 86400 &&
        db.getAccountBan(pepeCuenta).reason === '');
    decir(gema, '/unban Pepe Malo');
    decir(gema, '/ban Pepe Malo, 0, spam');
    check('con 0 días, también 7', db.getAccountBan(pepeCuenta).expiresAt === segundos() + 7 * 86400);
    const r = decir(gema, '/ban Pepe Malo, -1, bots, y más bots');
    check('con días negativos, para siempre (y el motivo puede llevar comas)', r ===
        'La cuenta de Pepe Malo queda suspendida para siempre.' && db.getAccountBan(pepeCuenta).expiresAt === 0 &&
        db.getAccountBan(pepeCuenta).reason === 'bots, y más bots', r);
    reloj += 400 * DIA;
    const s = intentar('Pepe Malo', 'Malos');
    check('para siempre es para siempre', !s.pj && errorDeEntrada(s) ===
        'Tu cuenta ha sido suspendida para siempre por Gema Admin. Motivo: bots, y más bots.', errorDeEntrada(s));

    decir(gema, '/unban Pepe Malo');
    decir(gema, '/ban Pepe Malo, 1, flood');
    const antes = intentar('Pepe Malo', 'Malos');
    check('suspendida un día: hoy no entra', !antes.pj);
    reloj += 2 * DIA;
    const despues = intentar('Pepe Malo', 'Malos', '10.0.0.7');
    check('pasado el día, entra: la caducada se limpia al entrar', !!despues.pj && !db.getAccountBan(pepeCuenta),
        JSON.stringify(despues.r));
    check('y queda en el historial', db.accountBanHistory(pepeCuenta).length === 5 &&
        db.accountBanHistory(pepeCuenta)[0].reason === 'flood', String(db.accountBanHistory(pepeCuenta).length));
    pepe = despues;
}

// ===========================================================================
section('4. /baninfo');
// ===========================================================================
{
    gema.buzon.length = 0;
    decir(gema, '/baninfo Pepe Malo');
    let v = gema.buzon.find((m) => m[0] === P.SERVER.TEXT_WINDOW);
    check('sin suspensión: lo dice, y cuenta las anteriores', v && v[2].titulo === 'Castigos de Pepe Malo' &&
        /La cuenta no está suspendida\./.test(v[2].texto) && /Suspensiones anteriores: 5\./.test(v[2].texto) &&
        /por Gema Admin\. Motivo: flood\./.test(v[2].texto), v && v[2].texto);
    decir(gema, '/ban Pepe Malo, 3, trampas');
    gema.buzon.length = 0;
    decir(gema, '/baninfo pepe malo');
    v = gema.buzon.find((m) => m[0] === P.SERVER.TEXT_WINDOW);
    check('con suspensión: hasta cuándo, quién y por qué', v && /^Cuenta suspendida hasta el .* por Gema Admin\.\nMotivo: trampas\.\nDesde: /.test(v[2].texto),
        v && v[2].texto);
    check('el envoltorio: getBanInfo', (() => {
        const i = e.registry.entities.creature(gema.pj.id).getBanInfo('Pepe Malo');
        return i && i.ok && i.ban.reason === 'trampas' && i.history.length === 5 && /trampas/.test(i.text);
    })());
    decir(gema, '/unban Pepe Malo');
    pepe = conectar('Pepe Malo', 'Malos', '10.0.0.7');
}

// ===========================================================================
section('5. /ipban');
// ===========================================================================
{
    const vecino = conectar('Vero Vecina', 'Vecinos', '10.0.0.7');
    const lejos = conectar('Lalo Lejos', 'Lejanos', '10.0.0.99');
    check('la IP llega a la sesión con createSession(send, {ip})', pepe.sesion.ip === '10.0.0.7' &&
        e.createSession(() => {}).ip === '');
    const r = decir(gema, '/ipban Pepe Malo, 1, multicuentas');
    check('/ipban suspende la IP de Pepe', /^La IP de Pepe Malo queda suspendida hasta el /.test(r) &&
        db.getIpBan('10.0.0.7') && db.getIpBan('10.0.0.7').reason === 'multicuentas', r);
    check('y saca a todos los que entraron desde ella', !dentro('Pepe Malo') && !dentro('Vero Vecina') && dentro('Lalo Lejos'));
    const s = intentar('Vero Vecina', 'Vecinos', '10.0.0.7');
    check('desde esa IP no entra nadie', !s.pj && s.r.reason === 'banned' &&
        /^Tu IP ha sido suspendida hasta el .* por Gema Admin\. Motivo: multicuentas\.$/.test(errorDeEntrada(s)), errorDeEntrada(s));
    const otraIp = intentar('Vero Vecina', 'Vecinos', '10.0.0.8');
    check('desde otra, sí', !!otraIp.pj);
    otraIp.sesion.close();
    check('la IP desde la que entra queda en la base (players.lastip)',
        db.findCharacterByName('Vero Vecina').lastip === '10.0.0.8');
    const fuera = decir(gema, '/ipban Vero Vecina');
    check('a quien no está conectado, se le suspende su última IP', /^La IP de Vero Vecina queda suspendida/.test(fuera) &&
        !!db.getIpBan('10.0.0.8'), fuera);
    db.liftIpBan('10.0.0.8');
    const sinIp = conectar('Sin Ip', 'SinIp');
    check('ni a quien entró sin IP conocida', decir(gema, '/ipban Sin Ip') === 'No se sabe desde qué IP juega Sin Ip.');
    sinIp.sesion.close();
    reloj += 2 * DIA;
    const luego = intentar('Pepe Malo', 'Malos', '10.0.0.7');
    check('pasado el día, entra; la suspensión de la IP se borra', !!luego.pj && !db.getIpBan('10.0.0.7'));
    pepe = luego;
    lejos.sesion.close();
}

// ===========================================================================
section('6. /namelock');
// ===========================================================================
{
    const r = decir(gema, '/namelock Pepe Malo, nombre ofensivo');
    check('/namelock: el personaje fuera y apuntado', r === 'Pepe Malo tiene el nombre bloqueado: no entrará hasta que se lo cambien.' &&
        !dentro('Pepe Malo') && db.getNamelock(db.findCharacterByName('Pepe Malo').id).reason === 'nombre ofensivo', r);
    const s = intentar('Pepe Malo', 'Malos');
    check('no entra, y se le dice', !s.pj && errorDeEntrada(s) ===
        'Tu personaje tiene el nombre bloqueado: tienes que cambiarlo antes de volver a jugar. Motivo: nombre ofensivo.',
    errorDeEntrada(s));
    const otro = intentar('Pepe Segundo', 'Malos');
    check('otro personaje de la misma cuenta sí entra', !!otro.pj);
    otro.sesion.close();
    db.removeNamelock(db.findCharacterByName('Pepe Malo').id);
    pepe = conectar('Pepe Malo', 'Malos', '10.0.0.7');
}

// ===========================================================================
section('7. /kick');
// ===========================================================================
{
    const r = decir(gema, '/kick Pepe Malo');
    check('/kick le saca', r === 'Pepe Malo está fuera del juego.' && !dentro('Pepe Malo') &&
        textos(pepe.buzon).includes('Un administrador te ha sacado del juego.'), r);
    check('a quien no está, no', decir(gema, '/kick Pepe Malo') === 'Pepe Malo no está conectado.');
    pepe = conectar('Pepe Malo', 'Malos', '10.0.0.7');
    check('y puede volver a entrar', dentro('Pepe Malo'));
}

// ===========================================================================
section('8. /mute');
// ===========================================================================
{
    const r = decir(gema, '/mute Pepe Malo, 2');
    check('/mute 2 minutos', r === 'Pepe Malo está silenciado durante 2 minutos.' &&
        textos(pepe.buzon).includes('Un administrador te ha silenciado durante 2 minutos.'), r);
    const dichas = world.says.length;
    const contesta = decir(pepe, 'hola a todos');
    check('no habla en voz alta, y se le dice cuánto le queda', world.says.length === dichas &&
        contesta === 'Estás silenciado durante 2 minutos.', contesta);
    check('world.silenciado(player) lo dice (lo que preguntan los canales)', world.silenciado(pepe.pj) ===
        'Estás silenciado durante 2 minutos.' && world.silenciado(gema.pj) === false);
    if (typeof world.hablarEnCanal === 'function') {
        pepe.buzon.length = 0;
        const c = world.hablarEnCanal(pepe.pj, 0, 'hola');
        check('en un canal tampoco', c && c.reason === 'muted' && ultimo(pepe.buzon) === 'Estás silenciado durante 2 minutos.',
            JSON.stringify(c));
    }
    const antes = pepe.buzon.length;
    decir(pepe, '!joinguild');
    check('los comandos siguen funcionando', pepe.buzon.length > antes && ultimo(pepe.buzon) !== 'Estás silenciado durante 2 minutos.');
    check('el envoltorio: getMutedTime', e.registry.entities.creature(pepe.pj.id).getMutedTime() > 0);
    pepe.sesion.close();
    pepe = conectar('Pepe Malo', 'Malos', '10.0.0.7');
    check('salir y entrar no lo quita', decir(pepe, 'hola') === 'Estás silenciado durante 2 minutos.');
    reloj += 3 * 60 * 1000;
    const tras = world.says.length;
    decir(pepe, 'ya puedo');
    check('pasados los minutos, vuelve a hablar', world.says.length === tras + 1 && world.silenciado(pepe.pj) === false);
    decir(gema, '/mute Pepe Malo');
    check('sin minutos: 5', world.silencioRestante(pepe.pj) === 5 * 60 * 1000);
    check('/unmute', decir(gema, '/unmute Pepe Malo') === 'Pepe Malo ya puede hablar.' &&
        textos(pepe.buzon).includes('Ya puedes volver a hablar.') && world.silencioRestante(pepe.pj) === 0);
    check('/unmute a quien no lo está', decir(gema, '/unmute Pepe Malo') === 'Pepe Malo no está silenciado.');
    check('minutos que no valen', decir(gema, '/mute Pepe Malo, -3') === 'Los minutos tienen que ser un número mayor que cero.');
}

// ===========================================================================
section('9. En inglés');
// ===========================================================================
{
    const I = await import('../shared/js/i18n.mjs');
    await import('../shared/i18n/juego.mjs');
    const gremios = (await import('../shared/i18n/en/gremios.mjs')).default;
    check('el diccionario gremios.mjs (gremios y castigos) no tiene problemas', I.problemasDeDiccionario(gremios).length === 0,
        I.problemasDeDiccionario(gremios).slice(0, 3).join(' | '));
    const muerte = (await import('../shared/i18n/en/muerte.mjs')).default;
    check('y el de la muerte, que comparte frases, tampoco', I.problemasDeDiccionario(muerte).length === 0);
    const casos = [
        ['Tu cuenta ha sido suspendida hasta el 2026-11-02 18:05 por Gema Admin. Motivo: insultos.',
            'Your account has been banned until 2026-11-02 18:05 by Gema Admin. Reason: insultos.'],
        ['Tu cuenta ha sido suspendida para siempre por un administrador. Motivo: bots.',
            'Your account has been permanently banned by a gamemaster. Reason: bots.'],
        ['Tu IP ha sido suspendida hasta el 2026-11-02 18:05 por Gema Admin. Motivo: x.',
            'Your IP has been banned until 2026-11-02 18:05 by Gema Admin. Reason: x.'],
        ['Tu personaje tiene el nombre bloqueado: tienes que cambiarlo antes de volver a jugar. Motivo: feo.',
            'Your character has been namelocked: its name must be changed before playing again. Reason: feo.'],
        ['Estás silenciado durante 2 minutos.', 'You are muted for 2 minutes.'],
        ['La cuenta de Pepe Malo queda suspendida para siempre.', 'The account of Pepe Malo is now permanently banned.'],
        ['No puedes castigar a Gus Dios: es del personal y de un grupo igual o mayor que el tuyo.',
            'You cannot punish Gus Dios: they are staff with a group equal to or higher than yours.'],
        ['Uso: /ban <personaje>[, días[, motivo]]', 'Usage: /ban <character>[, days[, reason]]']
    ];
    casos.forEach(([es, en]) => {
        const t = I.traducir(es, 'en');
        check('«' + es.slice(0, 50) + '…» se traduce', t === en, t);
    });
    const info = 'Cuenta suspendida hasta el 2026-11-02 18:05 por Gema Admin.\nMotivo: trampas.\nDesde: 2026-10-30 18:05.';
    const it = I.traducir(info, 'en');
    check('la ventana de /baninfo, línea a línea', it ===
        'Account banned until 2026-11-02 18:05 by Gema Admin.\nReason: trampas.\nSince: 2026-10-30 18:05.', it);
}

e.shutdown();
try {
    fs.rmSync(carpeta, { recursive: true, force: true });
} catch (error) {
    // Windows a veces tarda en soltar el archivo: se queda en la carpeta temporal.
}

console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — los castigos funcionan como en TFS 8.60.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
