/**
 * PRUEBAS DE LOS CANALES DEL CHAT Y DE LA LISTA VIP DEL SERVIDOR: `engine/world/canales.js`,
 * `engine/world/vip.js` y los mensajes `CLIENT.CHANNEL_*` / `SERVER.CHANNEL_*`, `CLIENT.VIP_*` /
 * `SERVER.VIP_*`.
 *
 *     node tools/test-canales.mjs
 *
 * Con el motor de verdad, el mapa `jetyum` y una base de datos TEMPORAL; cada jugador es una sesión
 * con su buzón, como un cliente:
 *
 *   1. la lista de canales: los públicos, sin el que pide más nivel
 *   2. entrar, hablar («Nombre [nivel]»), salir y lo que no se puede
 *   3. Comercio: una oferta cada dos minutos
 *   4. el nivel para entrar y para hablar
 *   5. el canal privado: crear, invitar, excluir, quien no está invitado y cerrarlo
 *   6. el canal del gremio, con `world.gremioDe` de mentira: el mensaje del día, sólo los suyos,
 *      `mensajeAlCanalDeGremio` y quien sale del gremio
 *   7. el canal del grupo (el 1) sigue por el camino de siempre
 *   8. silenciado, las líneas del servidor y los eventos (los del canal y los de los scripts)
 *   9. la VIP: añadir (no existe, repetido, uno mismo, el tope), quitar, la misma lista en toda la
 *      cuenta y los avisos al entrar y salir entre dos cuentas
 *  10. la VIP se guarda: otro motor con la misma base la tiene
 *  11. en inglés
 *  12. el cliente: lo que lee de los mensajes nuevos
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
const { CANAL, TEXTOS_CANALES: T, silenciadoPorDefecto } = require('../engine/world/canales.js');
const { TEXTOS_VIP: TV } = require('../engine/world/vip.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-canales-'));
const archivoDb = path.join(carpeta, 'canales.db');
const CONFIG = {
    mapName: 'jetyum',
    mapFile: null,
    useDatabase: true,
    databaseFile: archivoDb,
    // Ayuda pide nivel 8, para probar el nivel; Comercio, la espera de TFS.
    chatChannels: { juego: { level: 1 }, comercio: { level: 1, cooldownMs: 120000 }, ayuda: { level: 8 } },
    vipLimit: 20
};

let reloj = 80000000;
function arrancar() {
    const motor = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: CONFIG });
    motor.world.now = () => reloj;
    motor.scheduler.now = () => reloj;
    return motor;
}
let e = arrancar();
let world = e.world;

e.repository.createAccount('Canales', 'clave-canal');
e.repository.createAccount('Amigos', 'clave-amigo');
function conectar(nombre, cuenta, yaExiste) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    const credenciales = cuenta === 'Amigos'
        ? { account: 'Amigos', password: 'clave-amigo' } : { account: 'Canales', password: 'clave-canal' };
    const r = sesion.login({ ...credenciales, character: nombre, crear: !yaExiste, vocation: 'Knight' });
    if (!r.handled || !sesion.player) {
        throw new Error('no entra ' + nombre + ': ' + JSON.stringify(r));
    }
    // La lista VIP que llegó al entrar (el buzón se vacía muchas veces en las pruebas).
    const vip = buzon.filter((m) => m[0] === P.SERVER.VIP_LIST).map((m) => m[1]).pop() || null;
    return { sesion, buzon, pj: sesion.player, vipAlEntrar: vip };
}
const decir = (texto, huecos) => Object.keys(huecos || {}).reduce((t, k) => t.split('{' + k + '}').join(huecos[k]), texto);
const textos = (j) => j.buzon.filter((m) => m[0] === P.SERVER.TEXT).map((m) => m[2]);
const dijo = (j, texto) => textos(j).includes(texto);
const de = (j, opcode) => j.buzon.filter((m) => m[0] === opcode);
const lineas = (j, id) => de(j, P.SERVER.CHANNEL_MESSAGE).filter((m) => id === undefined || m[1] === id);
const limpiar = (...js) => js.forEach((j) => { j.buzon.length = 0; });
const pedirLista = (j) => {
    limpiar(j);
    j.sesion.handle([P.CLIENT.CHANNEL_LIST]);
    const m = de(j, P.SERVER.CHANNEL_LIST).pop();
    return m ? m[1] : null;
};
const abrir = (j, id) => j.sesion.handle([P.CLIENT.CHANNEL_OPEN, id]);
const cerrar = (j, id) => j.sesion.handle([P.CLIENT.CHANNEL_CLOSE, id]);
const hablar = (j, id, texto) => {
    reloj += 1000;   // el ritmo del chat (6 frases cada 5 s) no cuenta aquí
    return j.sesion.handle([P.CLIENT.CHANNEL_SAY, id, texto]);
};

const ana = conectar('Ana Canal');
const beto = conectar('Beto Canal');
const cris = conectar('Cris Canal');

// ===========================================================================
section('1. La lista de canales');
// ===========================================================================
{
    const lista = pedirLista(ana);
    check('llega SERVER.CHANNEL_LIST con [id, nombre]', Array.isArray(lista) && lista.every((c) => c.length === 2),
        JSON.stringify(lista));
    check('los públicos: Juego (3) y Comercio (5), con los ids de TFS',
        JSON.stringify(lista) === JSON.stringify([[CANAL.JUEGO, 'Juego'], [CANAL.COMERCIO, 'Comercio']]), JSON.stringify(lista));
    check('Ayuda (pide nivel 8) no sale a nivel 1', !lista.some((c) => c[0] === CANAL.AYUDA));
    check('sin gremio ni grupo, ni el 0 ni el 1', !lista.some((c) => c[0] === 0 || c[0] === 1));
}

// ===========================================================================
section('2. Entrar, hablar y salir');
// ===========================================================================
{
    limpiar(ana, beto, cris);
    let r = abrir(ana, CANAL.JUEGO);
    const abierto = de(ana, P.SERVER.CHANNEL_OPEN).pop();
    check('abrir Juego: ok y SERVER.CHANNEL_OPEN [3, "Juego", 0]', r.ok === true &&
        JSON.stringify(abierto) === JSON.stringify([P.SERVER.CHANNEL_OPEN, 3, 'Juego', 0]), JSON.stringify(abierto));
    abrir(beto, CANAL.JUEGO);
    check('el registro apunta a los dos', world.canalDe(ana.pj, 3).usuarios.size === 2);

    limpiar(ana, beto, cris);
    ana.pj.level = 23;
    r = hablar(ana, CANAL.JUEGO, '  hola a todos  ');
    const linea = lineas(beto, 3)[0];
    check('hablar: llega a los dos (él incluido)', r.ok === true && lineas(ana, 3).length === 1 && lineas(beto, 3).length === 1);
    check('con autor, nivel y texto: [3, "Ana Canal", 23, "hola a todos", ""]',
        JSON.stringify(linea) === JSON.stringify([P.SERVER.CHANNEL_MESSAGE, 3, 'Ana Canal', 23, 'hola a todos', '']), JSON.stringify(linea));
    check('a quien no está en el canal no le llega', lineas(cris).length === 0);
    ana.pj.level = 1;

    r = hablar(cris, CANAL.JUEGO, 'yo también');
    check('quien no ha entrado no puede hablar', r.ok === false && r.reason === 'notInChannel' && dijo(cris, T.noEstas),
        textos(cris).join(' | '));
    r = hablar(ana, 42, 'eco');
    check('un canal que no existe', r.ok === false && dijo(ana, T.noExiste));
    r = hablar(ana, CANAL.JUEGO, '   ');
    check('un mensaje vacío no se manda', r.ok === false && r.reason === 'empty');

    limpiar(ana, beto);
    r = cerrar(ana, CANAL.JUEGO);
    hablar(beto, CANAL.JUEGO, '¿sigues ahí?');
    check('cerrar la pestaña es salir: ya no le llega', r.ok === true && lineas(ana).length === 0 && lineas(beto).length === 1);
    check('cerrar uno en el que no está', cerrar(ana, CANAL.JUEGO).ok === false);
    r = hablar(ana, CANAL.JUEGO, 'hola');
    check('y ya no puede hablar en él', r.ok === false && r.reason === 'notInChannel');
    cerrar(beto, CANAL.JUEGO);
}

// ===========================================================================
section('3. Comercio: una oferta cada dos minutos');
// ===========================================================================
{
    abrir(ana, CANAL.COMERCIO);
    abrir(beto, CANAL.COMERCIO);
    limpiar(ana, beto);
    let r = hablar(ana, CANAL.COMERCIO, 'vendo espada');
    check('la primera oferta sale', r.ok === true && lineas(beto, 5).length === 1);
    r = hablar(ana, CANAL.COMERCIO, 'vendo espada barata');
    check('la segunda, no: «' + T.espera + '»', r.ok === false && r.reason === 'cooldown' && dijo(ana, T.espera),
        textos(ana).join(' | '));
    reloj += 110000;
    r = hablar(ana, CANAL.COMERCIO, 'vendo espada');
    check('a los 1:52 todavía no', r.ok === false && r.reason === 'cooldown');
    r = hablar(beto, CANAL.COMERCIO, 'compro escudo');
    check('la espera es de cada uno: Beto sí puede', r.ok === true);
    reloj += 10000;
    r = hablar(ana, CANAL.COMERCIO, 'vendo espada');
    check('pasados los dos minutos, sí', r.ok === true);
    r = hablar(ana, CANAL.JUEGO, 'hola');
    check('(Juego no tiene espera, pero hay que estar dentro)', r.reason === 'notInChannel');
    cerrar(ana, CANAL.COMERCIO);
    cerrar(beto, CANAL.COMERCIO);
}

// ===========================================================================
section('4. El nivel');
// ===========================================================================
{
    limpiar(ana);
    let r = abrir(ana, CANAL.AYUDA);
    check('a nivel 1 no entra en Ayuda (nivel 8)', r.ok === false && r.reason === 'level' &&
        dijo(ana, decir(T.nivelEntrar, { nivel: 8 })), textos(ana).join(' | '));
    ana.pj.level = 8;
    check('a nivel 8 ya sale en la lista', pedirLista(ana).some((c) => c[0] === CANAL.AYUDA));
    r = abrir(ana, CANAL.AYUDA);
    check('y entra', r.ok === true);
    ana.pj.level = 1;
    limpiar(ana);
    r = hablar(ana, CANAL.AYUDA, 'ayuda');
    check('si baja de nivel, no habla: «' + decir(T.nivelHablar, { nivel: 8 }) + '»', r.ok === false && r.reason === 'level' &&
        dijo(ana, decir(T.nivelHablar, { nivel: 8 })));
    cerrar(ana, CANAL.AYUDA);
    check('el nivel sale de config.js (chatChannels)', world.canalDe(ana.pj, CANAL.AYUDA).nivel === 8 &&
        world.canalDe(ana.pj, CANAL.COMERCIO).espera === 120000);
}

// ===========================================================================
section('5. El canal privado');
// ===========================================================================
{
    limpiar(ana, beto, cris);
    let r = ana.sesion.handle([P.CLIENT.CHANNEL_CREATE_PRIVATE]);
    const abierto = de(ana, P.SERVER.CHANNEL_OPEN).pop();
    const id = abierto ? abierto[1] : -1;
    check('crearlo lo abre: [id ≥ 100, "Canal de Ana Canal", 1 (propio)]', r.ok === true && id >= CANAL.PRIVADO &&
        abierto[2] === decir(T.nombrePrivado, { nombre: 'Ana Canal' }) && abierto[3] === 1, JSON.stringify(abierto));
    r = ana.sesion.handle([P.CLIENT.CHANNEL_CREATE_PRIVATE]);
    check('crearlo otra vez da el mismo', de(ana, P.SERVER.CHANNEL_OPEN).pop()[1] === id);
    check('Ana lo ve en su lista', pedirLista(ana).some((c) => c[0] === id));
    check('Beto no (no está invitado)', !pedirLista(beto).some((c) => c[0] === id));

    limpiar(beto);
    r = abrir(beto, id);
    check('Beto no puede abrirlo', r.ok === false && r.reason === 'notInvited' && dijo(beto, T.noInvitado));
    r = hablar(beto, id, 'hola');
    check('ni hablar en él', r.ok === false && r.reason === 'notInChannel');

    limpiar(ana, beto);
    r = ana.sesion.handle([P.CLIENT.CHANNEL_INVITE, 'beto canal']);
    check('Ana invita a Beto (sin mayúsculas): a él se lo dice, y a ella', r.ok === true &&
        dijo(beto, decir(T.teInvita, { nombre: 'Ana Canal' })) && dijo(ana, decir(T.invitado, { nombre: 'Beto Canal' })),
    textos(beto).concat(textos(ana)).join(' | '));
    r = ana.sesion.handle([P.CLIENT.CHANNEL_INVITE, 'Beto Canal']);
    check('invitarle otra vez', r.ok === false && dijo(ana, decir(T.yaInvitado, { nombre: 'Beto Canal' })));
    r = ana.sesion.handle([P.CLIENT.CHANNEL_INVITE, 'Ana Canal']);
    check('invitarse a sí misma', r.ok === false && dijo(ana, T.aTiMismo));
    r = ana.sesion.handle([P.CLIENT.CHANNEL_INVITE, 'Nadie Conocido']);
    check('a alguien que no está', r.ok === false && dijo(ana, decir(T.noConectado, { nombre: 'Nadie Conocido' })));
    limpiar(cris);
    r = cris.sesion.handle([P.CLIENT.CHANNEL_INVITE, 'Beto Canal']);
    check('Cris, que no tiene canal, no puede invitar', r.ok === false && dijo(cris, T.sinCanalPrivado));

    check('ahora Beto lo ve en su lista', pedirLista(beto).some((c) => c[0] === id));
    limpiar(ana, beto, cris);
    r = abrir(beto, id);
    hablar(ana, id, 'bienvenido');
    check('Beto entra y oye a Ana', r.ok === true && lineas(beto, id).some((m) => m[2] === 'Ana Canal' && m[4] === 'bienvenido'));
    check('Cris, no', lineas(cris).length === 0 && hablar(cris, id, 'eh').ok === false);

    limpiar(ana, beto);
    r = ana.sesion.handle([P.CLIENT.CHANNEL_EXCLUDE, 'Beto Canal']);
    const cerrado = de(beto, P.SERVER.CHANNEL_CLOSE).pop();
    check('excluir a Beto: se le cierra (SERVER.CHANNEL_CLOSE [id])', r.ok === true && cerrado && cerrado[1] === id &&
        dijo(ana, decir(T.excluido, { nombre: 'Beto Canal' })), JSON.stringify(cerrado));
    check('y ya no habla ni entra', hablar(beto, id, 'hola').ok === false && abrir(beto, id).reason === 'notInvited');
    r = ana.sesion.handle([P.CLIENT.CHANNEL_EXCLUDE, 'Beto Canal']);
    check('excluir a quien no está invitado', r.ok === false && dijo(ana, decir(T.noEstaInvitado, { nombre: 'Beto Canal' })));

    ana.sesion.handle([P.CLIENT.CHANNEL_INVITE, 'Beto Canal']);
    abrir(beto, id);
    limpiar(beto);
    r = cerrar(ana, id);
    check('si la dueña lo cierra, se acaba para todos', r.ok === true && de(beto, P.SERVER.CHANNEL_CLOSE).some((m) => m[1] === id) &&
        !world.canalDe(ana.pj, id) && !pedirLista(beto).some((c) => c[0] === id));
}

// ===========================================================================
section('6. El canal del gremio (con world.gremioDe de mentira)');
// ===========================================================================
{
    const gremios = new Map([
        [ana.pj, { id: 7, nombre: 'Los Valientes', rango: 'Lider', nivel: 3, motd: 'Cazamos a las 8.' }],
        [beto.pj, { id: 7, nombre: 'Los Valientes', rango: 'Miembro', nivel: 1, motd: 'Cazamos a las 8.' }],
        [cris.pj, { id: 9, nombre: 'Los Otros', rango: 'Lider', nivel: 3, motd: '' }]
    ]);
    world.gremioDe = (p) => gremios.get(p) || null;

    const lista = pedirLista(ana);
    check('el del gremio sale el primero: [0, "Los Valientes"]', JSON.stringify(lista[0]) === JSON.stringify([0, 'Los Valientes']),
        JSON.stringify(lista));
    limpiar(ana);
    let r = abrir(ana, CANAL.GREMIO);
    const msgs = ana.buzon.filter((m) => m[0] === P.SERVER.CHANNEL_OPEN || m[0] === P.SERVER.CHANNEL_MESSAGE);
    check('al abrirlo, la primera línea es el mensaje del día', r.ok === true && msgs.length === 2 &&
        JSON.stringify(msgs[1]) === JSON.stringify([P.SERVER.CHANNEL_MESSAGE, 0, '', 0, decir(T.motd, { motd: 'Cazamos a las 8.' }), 'sistema']),
    JSON.stringify(msgs));
    abrir(beto, CANAL.GREMIO);
    abrir(cris, CANAL.GREMIO);
    limpiar(ana, beto, cris);
    hablar(ana, CANAL.GREMIO, 'reunión');
    check('lo que dice Ana llega a Beto (su gremio) y no a Cris (otro gremio)',
        lineas(beto, 0).length === 1 && lineas(cris).length === 0);
    check('Cris tiene el suyo: sin mensaje del día, y sólo él', world.canalDe(cris.pj, 0).usuarios.size === 1 &&
        world.canalDe(cris.pj, 0) !== world.canalDe(ana.pj, 0));

    limpiar(ana, beto, cris);
    const n = world.mensajeAlCanalDeGremio(7, 'Dani Amigo se ha unido al gremio.');
    check('mensajeAlCanalDeGremio(7, texto): a los dos de ese gremio, sin autor', n === 2 &&
        lineas(beto, 0).some((m) => m[2] === '' && m[4] === 'Dani Amigo se ha unido al gremio.' && m[5] === 'sistema') &&
        lineas(cris).length === 0);

    gremios.delete(beto.pj);
    limpiar(beto);
    r = hablar(beto, CANAL.GREMIO, 'adiós');
    check('quien sale del gremio no habla en él y se le cierra', r.ok === false && dijo(beto, T.noEnGremio) &&
        de(beto, P.SERVER.CHANNEL_CLOSE).some((m) => m[1] === 0));
    check('y no lo ve en su lista', !pedirLista(beto).some((c) => c[0] === 0));
    limpiar(beto);
    check('ni lo puede abrir', abrir(beto, CANAL.GREMIO).ok === false && dijo(beto, T.noEnGremio));
    cerrar(ana, 0);
    cerrar(cris, 0);
    delete world.gremioDe;
    check('sin gremio (o sin sistema de gremios), no hay canal 0', !pedirLista(ana).some((c) => c[0] === 0));
}

// ===========================================================================
section('7. El canal del grupo (el 1)');
// ===========================================================================
{
    world.partyInvite(ana.pj, beto.pj);
    world.partyJoin(beto.pj, ana.pj);
    check('en un grupo sale [1, "Grupo"]', pedirLista(ana).some((c) => c[0] === 1 && c[1] === 'Grupo'));
    limpiar(ana, beto);
    let r = abrir(ana, CANAL.GRUPO);
    check('abrirlo: SERVER.CHANNEL_OPEN [1, "Grupo", 0]', r.ok === true &&
        JSON.stringify(de(ana, P.SERVER.CHANNEL_OPEN).pop()) === JSON.stringify([P.SERVER.CHANNEL_OPEN, 1, 'Grupo', 0]));
    r = hablar(ana, CANAL.GRUPO, 'vamos');
    const pm = de(beto, P.SERVER.PRIVATE_MESSAGE).pop();
    check('hablar en el 1 llega como siempre (PRIVATE_MESSAGE canal "grupo")', r.ok === true &&
        JSON.stringify(pm) === JSON.stringify([P.SERVER.PRIVATE_MESSAGE, 'Ana Canal', 'vamos', 'grupo']), JSON.stringify(pm));
    limpiar(beto);
    reloj += 1000;
    ana.sesion.handle([P.CLIENT.PRIVATE_MESSAGE, '#grupo', 'por el camino viejo']);
    check('y «#grupo» sigue funcionando', de(beto, P.SERVER.PRIVATE_MESSAGE).some((m) => m[2] === 'por el camino viejo'));
    world.partyLeave(beto.pj);
    limpiar(beto);
    check('fuera del grupo, el 1 no está', abrir(beto, CANAL.GRUPO).ok === false && dijo(beto, T.noEnGrupo));
}

// ===========================================================================
section('8. Silenciado, líneas del servidor y eventos');
// ===========================================================================
{
    abrir(ana, CANAL.JUEGO);
    abrir(beto, CANAL.JUEGO);
    check('world.silenciado existe y por defecto dice que no', typeof world.silenciado === 'function' && world.silenciado(ana.pj) === false);
    world.silenciado = (p) => (p === ana.pj ? 'Estás silenciado 30 segundos.' : false);
    limpiar(ana, beto);
    let r = hablar(ana, CANAL.JUEGO, 'hola');
    check('silenciada: no habla y se le dice lo que diga el hook', r.ok === false && r.reason === 'muted' &&
        dijo(ana, 'Estás silenciado 30 segundos.') && lineas(beto).length === 0);
    world.silenciado = () => true;
    limpiar(beto);
    hablar(beto, CANAL.JUEGO, 'hola');
    check('con `true`, el texto de siempre', dijo(beto, T.silenciado));
    // (Con el sistema de castigos, `silenciado` es una propiedad del prototipo con su escritura: lo que se
    // asigna sustituye a la parte de los canales. Se vuelve a poner la de siempre.)
    world.silenciado = silenciadoPorDefecto;
    check('y quitándolo vuelve el de siempre', hablar(ana, CANAL.JUEGO, 'ya puedo').ok === true);

    limpiar(ana, beto, cris);
    const n = world.enviarAlCanal(CANAL.JUEGO, 'El servidor se reinicia en 5 minutos.');
    check('enviarAlCanal: una línea sin autor a los que están', n === 2 &&
        lineas(beto, 3).some((m) => m[2] === '' && m[5] === 'sistema') && lineas(cris).length === 0);
    globalThis.Game && check('Game.sendChannelMessage(3, 10, texto) la manda en rojo',
        globalThis.Game.sendChannelMessage(3, 10, 'Aviso rojo.') === 2 && lineas(beto, 3).some((m) => m[4] === 'Aviso rojo.' && m[5] === 'rojo'));

    // Un canal con sus eventos (los de TFS en el registro) y el evento de los scripts.
    const visto = [];
    world.registrarCanal({ id: 9, nombre: 'Pruebas', nivel: 1,
        onJoin: (p) => { visto.push('join:' + p.name); },
        onLeave: (p) => { visto.push('leave:' + p.name); },
        onSpeak: (p, texto) => !/palabrota/.test(texto) });
    check('un canal registrado sale en la lista', pedirLista(ana).some((c) => c[0] === 9 && c[1] === 'Pruebas'));
    abrir(ana, 9);
    abrir(beto, 9);
    limpiar(beto);
    r = hablar(ana, 9, 'una palabrota');
    check('onSpeak con false lo calla', r.ok === false && r.reason === 'script' && lineas(beto).length === 0);
    check('onJoin, al entrar', visto.join(',') === 'join:Ana Canal,join:Beto Canal', visto.join(','));
    cerrar(beto, 9);
    check('onLeave, al salir', visto.includes('leave:Beto Canal'));

    const deScripts = [];
    e.registry.register({ type: 'event', event: 'channelspeak',
        onSpeak(player, tipo, texto, canal) {
            deScripts.push([player.getName(), tipo, texto, canal]);
            return texto !== 'prohibido';
        } }, 'test-canales');
    e.registry.register({ type: 'event', event: 'channeljoin',
        onJoin(player, canal) { deScripts.push(['join', player.getName(), canal]); } }, 'test-canales');
    abrir(beto, 9);
    r = hablar(ana, 9, 'prohibido');
    check('el evento «channelspeak» de los scripts: (player, tipo, texto, canal); false lo calla', r.ok === false &&
        deScripts.some((d) => d[0] === 'Ana Canal' && d[2] === 'prohibido' && d[3] === 9), JSON.stringify(deScripts));
    check('y «channeljoin» al entrar', deScripts.some((d) => d[0] === 'join' && d[1] === 'Beto Canal' && d[2] === 9));
    e.registry.events.delete('channelspeak');
    e.registry.events.delete('channeljoin');
    cerrar(ana, 9);
    cerrar(beto, 9);
    cerrar(ana, CANAL.JUEGO);
    cerrar(beto, CANAL.JUEGO);
}

// ===========================================================================
section('9. La lista VIP');
// ===========================================================================
let idDani = 0;
{
    // Dani es de OTRA cuenta; entra y sale para existir en la base.
    let dani = conectar('Dani Amigo', 'Amigos');
    idDani = dani.pj.characterId;
    dani.sesion.close();
    const vips = (j) => de(j, P.SERVER.VIP_LIST);
    const ultimaVip = (j) => (vips(j).pop() || [0, null])[1];

    check('al entrar llega la lista VIP (vacía)', JSON.stringify(ana.vipAlEntrar) === '[]', JSON.stringify(ana.vipAlEntrar));

    limpiar(ana, beto);
    let r = ana.sesion.handle([P.CLIENT.VIP_ADD, 'Nadie Existe']);
    check('un nombre que no existe: «' + TV.noExiste + '»', r.ok === false && r.reason === 'notFound' && dijo(ana, TV.noExiste));
    r = ana.sesion.handle([P.CLIENT.VIP_ADD, 'Ana Canal']);
    check('a sí misma, no', r.ok === false && dijo(ana, TV.tuMismo));
    r = ana.sesion.handle([P.CLIENT.VIP_ADD, 'dani amigo']);
    check('a Dani (desconectado, sin mayúsculas): ok y la lista nueva [[id, "Dani Amigo", 0]]', r.ok === true &&
        JSON.stringify(ultimaVip(ana)) === JSON.stringify([[idDani, 'Dani Amigo', 0]]), JSON.stringify(ultimaVip(ana)));
    check('es de la CUENTA: Beto (misma cuenta) recibe la misma lista', JSON.stringify(ultimaVip(beto)) === JSON.stringify([[idDani, 'Dani Amigo', 0]]));
    r = beto.sesion.handle([P.CLIENT.VIP_ADD, 'Dani Amigo']);
    check('repetido (aunque lo añada otro personaje de la cuenta): «' + TV.yaEsta + '»', r.ok === false && dijo(beto, TV.yaEsta));
    check('está en la base (account_viplist)', e.repository.database.listVip(ana.pj.accountId).map((f) => f.playerId).join() === String(idDani));

    // El tope: vipLimit.
    const otraCuenta = e.repository.database.findAccount('Amigos').id;
    ['Eva Relleno', 'Fede Relleno', 'Gil Relleno'].forEach((n) => e.repository.database.createCharacter(otraCuenta, n));
    world.vipLimit = 3;
    check('caben `vipLimit`', world.limiteVip() === 3);
    r = ana.sesion.handle([P.CLIENT.VIP_ADD, 'Eva Relleno']);
    const r2 = ana.sesion.handle([P.CLIENT.VIP_ADD, 'Fede Relleno']);
    limpiar(ana);
    r = ana.sesion.handle([P.CLIENT.VIP_ADD, 'Gil Relleno']);
    check('con la lista llena: «' + TV.lleno + '»', r2.ok === true && r.ok === false && r.reason === 'full' && dijo(ana, TV.lleno));
    world.vipLimit = 20;
    check('sin config, 20 (TFS)', (() => { const v = world.vipLimit; world.vipLimit = undefined; const l = world.limiteVip(); world.vipLimit = v; return l === 20; })());

    limpiar(ana);
    const eva = e.repository.database.findCharacterByName('Eva Relleno').id;
    r = ana.sesion.handle([P.CLIENT.VIP_REMOVE, eva]);
    check('quitar por id: sale de la lista', r.ok === true && !ultimaVip(ana).some((v) => v[0] === eva) && ultimaVip(ana).length === 2);
    r = ana.sesion.handle([P.CLIENT.VIP_REMOVE, 'Fede Relleno']);
    check('y por nombre', r.ok === true && ultimaVip(ana).length === 1);
    r = ana.sesion.handle([P.CLIENT.VIP_REMOVE, 'Fede Relleno']);
    check('quitar a quien no está', r.ok === false && dijo(ana, TV.noEsta));

    // Los avisos: Dani entra y sale; los de la cuenta Canales lo tienen en su lista.
    limpiar(ana, beto, cris);
    dani = conectar('Dani Amigo', 'Amigos', true);
    const estado = (j) => de(j, P.SERVER.VIP_STATE);
    check('Dani entra: SERVER.VIP_STATE [id, "Dani Amigo", 1] a Ana, Beto y Cris (los tres de la cuenta)',
        [ana, beto, cris].every((j) => JSON.stringify(estado(j).pop()) === JSON.stringify([P.SERVER.VIP_STATE, idDani, 'Dani Amigo', 1])),
        JSON.stringify(estado(ana)));
    check('Dani recibe su lista (vacía) y nadie le avisa de sí mismo', JSON.stringify(dani.vipAlEntrar) === '[]' && estado(dani).length === 0);
    limpiar(ana);
    ana.sesion.handle([P.CLIENT.VIP_ADD, 'Eva Relleno']);
    check('la lista dice quién está dentro', JSON.stringify(ultimaVip(ana).find((v) => v[0] === idDani)) === JSON.stringify([idDani, 'Dani Amigo', 1]) &&
        ultimaVip(ana).find((v) => v[1] === 'Eva Relleno')[2] === 0);

    // Dani tiene a Ana: Ana sale y vuelve.
    dani.sesion.handle([P.CLIENT.VIP_ADD, 'Ana Canal']);
    const idAna = ana.pj.characterId;
    limpiar(dani);
    ana.sesion.close();
    check('Ana sale: a Dani le llega [id, "Ana Canal", 0]',
        JSON.stringify(estado(dani).pop()) === JSON.stringify([P.SERVER.VIP_STATE, idAna, 'Ana Canal', 0]), JSON.stringify(estado(dani)));
    limpiar(dani);
    const ana2 = conectar('Ana Canal', 'Canales', true);
    check('Ana vuelve: a Dani le llega que ha entrado', JSON.stringify(estado(dani).pop()) === JSON.stringify([P.SERVER.VIP_STATE, idAna, 'Ana Canal', 1]));
    check('y Ana recibe al entrar su lista con Dani dentro', JSON.stringify(ana2.vipAlEntrar.find((v) => v[0] === idDani)) ===
        JSON.stringify([idDani, 'Dani Amigo', 1]), JSON.stringify(ana2.vipAlEntrar));
    limpiar(ana2, beto);
    dani.sesion.close();
    check('Dani sale: a los de la cuenta Canales les llega que ha salido',
        [ana2, beto].every((j) => JSON.stringify(estado(j).pop()) === JSON.stringify([P.SERVER.VIP_STATE, idDani, 'Dani Amigo', 0])));
    ana2.sesion.close();
}

// ===========================================================================
section('10. La VIP se guarda');
// ===========================================================================
{
    beto.sesion.close();
    cris.sesion.close();
    e.shutdown();
    e = arrancar();
    world = e.world;
    const ana3 = conectar('Ana Canal', 'Canales', true);
    const lista = ana3.vipAlEntrar || [];
    check('otro motor con la misma base: la lista de la cuenta sigue ahí', lista.some((v) => v[0] === idDani && v[1] === 'Dani Amigo') &&
        lista.some((v) => v[1] === 'Eva Relleno'), JSON.stringify(lista));
    check('y los canales empiezan vacíos (no se guardan)', world.canalDe(ana3.pj, CANAL.JUEGO).usuarios.size === 0);
    ana3.sesion.close();
}

// ===========================================================================
section('11. En inglés');
// ===========================================================================
{
    const I = await import('../shared/js/i18n.mjs');
    await import('../shared/i18n/juego.mjs');
    const canales = (await import('../shared/i18n/en/canales.mjs')).default;
    check('el diccionario canales.mjs no tiene problemas', I.problemasDeDiccionario(canales).length === 0,
        I.problemasDeDiccionario(canales).slice(0, 3).join(' | '));
    const huecos = { nombre: 'Ana Canal', nivel: 8, motd: 'Cazamos a las 8.' };
    const sinTraducir = Object.values(T).concat(Object.values(TV)).map((x) => decir(x, huecos))
        .filter((x) => I.traducir(x, 'en') === x);
    check('todo lo que dicen canales.js y vip.js tiene traducción', sinTraducir.length === 0, sinTraducir.join(' | '));
    const casos = [
        ['Sólo puedes poner una oferta cada dos minutos.', 'You may only place one offer in two minutes.'],
        ['Canal de Ana Canal', "Ana Canal's Channel"],
        ['Juego', 'World Chat'],
        ['Comercio', 'Trade'],
        ['Ayuda', 'Help'],
        ['Grupo', 'Party'],
        ['Mensaje del día: Cazamos a las 8.', 'Message of the day: Cazamos a las 8.'],
        ['Necesitas nivel 8 para hablar en este canal.', 'You may not speak into this channel until you are level 8.'],
        ['Beto Canal te invita a su canal privado.', 'Beto Canal invites you to their private chat channel.'],
        ['No existe ningún personaje con ese nombre.', 'A player with this name does not exist.'],
        ['No puedes añadir más amigos.', 'You cannot add more buddies.'],
        ['Dani Amigo ha entrado en el juego.', 'Dani Amigo has logged in.'],
        ['Dani Amigo ha salido del juego.', 'Dani Amigo has logged out.']
    ];
    casos.forEach(([es, en]) => {
        const t = I.traducir(es, 'en');
        check('«' + es + '» se traduce', t === en, t);
    });
}

// ===========================================================================
section('12. El cliente');
// ===========================================================================
{
    const I = await import('../shared/js/i18n.mjs');
    const { ClientWorld } = await import('../client/jetyum/js/world.js');
    const mundo = new ClientWorld();
    I.setIdioma('en', { guardar: false });
    const r = mundo.apply([
        [P.SERVER.CHANNEL_LIST, [[0, 'Los Valientes'], [3, 'Juego'], [100, 'Canal de Ana']]],
        [P.SERVER.CHANNEL_OPEN, 100, 'Canal de Ana', 1],
        [P.SERVER.CHANNEL_MESSAGE, 3, 'Beto', 12, 'Mensaje del día: hola', ''],
        [P.SERVER.CHANNEL_MESSAGE, 0, '', 0, 'Mensaje del día: hola', 'sistema'],
        [P.SERVER.CHANNEL_CLOSE, 100],
        [P.SERVER.VIP_LIST, [[5, 'Dani', 0], [6, 'Eva', 1]]],
        [P.SERVER.VIP_STATE, 5, 'Dani', 1]
    ], P);
    I.setIdioma('es', { guardar: false });
    const ev = (tipo) => r.events.filter((x) => x.type === tipo);
    check('la lista de canales, con los nombres en español (los traduce la página)',
        JSON.stringify(ev('channelList')[0].canales) === JSON.stringify([{ id: 0, nombre: 'Los Valientes' },
            { id: 3, nombre: 'Juego' }, { id: 100, nombre: 'Canal de Ana' }]));
    check('canal abierto, propio', ev('channelOpen')[0].id === 100 && ev('channelOpen')[0].propio === true);
    const [jugador, servidor] = ev('channelMessage');
    check('lo de un jugador, tal cual y con su nivel', jugador.autor === 'Beto' && jugador.nivel === 12 && jugador.text === 'Mensaje del día: hola');
    check('lo del servidor, traducido', servidor.autor === '' && servidor.text === 'Message of the day: hola', servidor.text);
    check('canal cerrado', ev('channelClose')[0].id === 100);
    check('la VIP: lista y estado al día', ev('vipList').length === 1 && mundo.vip.find((v) => v.id === 5).enLinea === true &&
        mundo.vip.find((v) => v.id === 6).enLinea === true);
    check('y lo que se dice al entrar, en el idioma puesto', ev('vipState')[0].text === 'Dani has logged in.', ev('vipState')[0].text);
}

e.shutdown();
try {
    fs.rmSync(carpeta, { recursive: true, force: true });
} catch (error) {
    // Windows a veces tarda en soltar el archivo: se queda en la carpeta temporal.
}

console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — los canales y la lista VIP funcionan como en TFS.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
