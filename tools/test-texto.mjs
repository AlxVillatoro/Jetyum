/**
 * PRUEBAS DE LA VENTANA DE TEXTO (`SERVER.TEXT_WINDOW` / `CLIENT.TEXT_WINDOW_SAVE`).
 *
 *     node tools/test-texto.mjs
 *
 * Con el motor de verdad y una base de datos TEMPORAL:
 *
 *   1. un script abre una ventana para leer: llega al cliente y no espera respuesta
 *   2. una ventana para escribir: lo guardado llega al script, recortado a `maximo`, una sola vez
 *   3. nadie más puede contestarla, ni con un id que no existe
 *   4. el inglés de los botones nuevos
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

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-texto-'));
const e = createEngine({
    rootDir: ROOT,
    logLevel: 'error',
    overrides: { mapName: 'jetyum', mapFile: null, useDatabase: true, databaseFile: path.join(carpeta, 'texto.db') }
});
const world = e.world;

e.repository.createAccount('Escribano', 'clave-texto');
function conectar(nombre) {
    const buzon = [];
    const sesion = e.createSession((m) => buzon.push(m));
    const r = sesion.login({ account: 'Escribano', password: 'clave-texto', character: nombre, crear: true, vocation: 'Sorcerer' });
    if (!r.handled || !sesion.player) {
        throw new Error('no entra ' + nombre + ': ' + JSON.stringify(r));
    }
    return { sesion, buzon, pj: sesion.player };
}
const ventanas = (buzon) => buzon.filter((m) => m[0] === P.SERVER.TEXT_WINDOW);

const ana = conectar('Ana Escribe');
const beto = conectar('Beto Lee');
const scriptAna = world.wrapForContent(ana.pj);

// ===========================================================================
section('1. Una ventana para leer');
// ===========================================================================
{
    const id = scriptAna.showTextDialog({ titulo: 'Cartel', texto: 'Se alquila.\nPreguntar dentro.' });
    const llegadas = ventanas(ana.buzon);
    const v = llegadas.length ? llegadas[llegadas.length - 1] : null;
    check('showTextDialog devuelve un id', id > 0, String(id));
    check('llega SERVER.TEXT_WINDOW con ese id', v && v[1] === id);
    check('con el título, el texto y editable a false',
        v && v[2].titulo === 'Cartel' && v[2].texto === 'Se alquila.\nPreguntar dentro.' && v[2].editable === false,
        v ? JSON.stringify(v[2]) : '');
    check('a Beto no le llega nada', ventanas(beto.buzon).length === 0);
    const r = ana.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, id, 'pintada']);
    check('contestar una ventana de leer no se acepta', r && r.handled && r.ok === false, JSON.stringify(r));
}

// ===========================================================================
section('2. Una ventana para escribir');
// ===========================================================================
{
    const guardados = [];
    const id = scriptAna.showTextDialog({ titulo: 'Carta', texto: 'Hola', editable: true, maximo: 10 },
        (texto) => guardados.push(texto));
    const v = ventanas(ana.buzon).pop();
    check('llega editable con su máximo', v && v[1] === id && v[2].editable === true && v[2].maximo === 10,
        v ? JSON.stringify(v[2]) : '');

    const otro = beto.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, id, 'no es mía']);
    check('Beto no puede contestar la ventana de Ana', otro.ok === false && guardados.length === 0);
    const falso = ana.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, 9999, 'x']);
    check('un id que no existe no se acepta', falso.ok === false);

    const r = ana.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, id, 'Hola, ¿qué tal estás?']);
    check('Ana la guarda', r.ok === true);
    check('al script le llega lo escrito, recortado a 10', guardados.length === 1 && guardados[0] === 'Hola, ¿qué',
        JSON.stringify(guardados));
    const otraVez = ana.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, id, 'otra vez']);
    check('sólo se contesta una vez', otraVez.ok === false && guardados.length === 1);

    const sinTexto = [];
    const id2 = scriptAna.showTextDialog({ titulo: 'Lista', editable: true }, (t) => sinTexto.push(t));
    ana.sesion.handle([P.CLIENT.TEXT_WINDOW_SAVE, id2, null]);
    check('sin texto llega una cadena vacía', sinTexto.length === 1 && sinTexto[0] === '');
    const v2 = ventanas(ana.buzon).pop();
    check('sin máximo, 1000', v2 && v2[2].maximo === 1000);
}

// ===========================================================================
section('3. El inglés');
// ===========================================================================
{
    const I = await import('../shared/js/i18n.mjs');
    await import('../shared/i18n/juego.mjs');
    for (const t of ['Guardar', 'Cancelar', 'Aceptar']) {
        check('«' + t + '» tiene inglés', I.traducir(t, 'en') !== t, I.traducir(t, 'en'));
    }
}

ana.sesion.close();
beto.sesion.close();
e.shutdown();
try {
    fs.rmSync(carpeta, { recursive: true, force: true });
} catch (error) {
    // Windows a veces tarda en soltar el archivo: se queda en la carpeta temporal.
}

console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — los scripts pueden pedir y recibir texto.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
