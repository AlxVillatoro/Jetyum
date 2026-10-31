/**
 * PRUEBAS DE LOS IDIOMAS (español e inglés).
 *
 *     node tools/test-i18n.mjs        (o npm run test:i18n)
 *
 *   1. el módulo: frases exactas, patrones con huecos, trozos, `t()` y el español intacto
 *   2. los diccionarios: sin entradas vacías, con los mismos huecos a los dos lados y sin claves
 *      repetidas (en un objeto de JS la segunda tapa a la primera sin avisar)
 *   3. el cliente traduce lo que dice el juego al llegar, y deja como está lo que dice un jugador
 *   4. lo que está escrito en las páginas (el cliente y el editor) tiene traducción
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as I from '../shared/js/i18n.mjs';
import * as P from '../shared/js/protocol.mjs';
import { ClientWorld } from '../client/jetyum/js/world.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

// ---------------------------------------------------------------------------
section('1. El módulo');
{
    check('fuera del navegador se arranca en español', I.idioma() === 'es');
    I.registrar('en', {
        'Prueba: esta demasiado lejos.': 'Test: it is too far away.',
        'Prueba: has recogido {n} {objeto}.': 'Test: you picked up {n} {objeto}.',
        'Prueba: {quien} te da {cosa}.': 'Test: you get {cosa} from {quien}.',
        'Prueba: va en la ranura "{ranura}".': 'Test: it goes in the "{ranura}" slot.',
        'pruebamochila': 'testbackpack',
        'Prueba: abierto {mapa}': 'Test: opened {mapa}',
        'Prueba: {n} avisos': 'Test: {n} warnings',
        'Prueba: nivel {n}': 'Test: level {n}',
        'Prueba: falta {cosa}': 'Test: {cosa} is missing',
        '{n} de {total}': '{n} of {total}'
    });
    check('en español no se toca nada', I.traducir('Prueba: esta demasiado lejos.') === 'Prueba: esta demasiado lejos.');

    I.setIdioma('en', { guardar: false });
    check('exacta', I.traducir('Prueba: esta demasiado lejos.') === 'Test: it is too far away.');
    check('y respeta los espacios de alrededor', I.traducir('  Prueba: esta demasiado lejos.\n') ===
        '  Test: it is too far away.\n');
    check('un patrón rellena sus huecos', I.traducir('Prueba: has recogido 3 gold coin.') ===
        'Test: you picked up 3 gold coin.');
    check('aunque el inglés los ponga en otro orden', I.traducir('Prueba: Ana te da una espada.') ===
        'Test: you get una espada from Ana.');
    check('lo que cae en un hueco se traduce si tiene entrada',
        I.traducir('Prueba: va en la ranura "pruebamochila".') === 'Test: it goes in the "testbackpack" slot.');
    check('un estado con separadores se traduce a trozos',
        I.traducir('Prueba: abierto jetyum · Prueba: 3 avisos') === 'Test: opened jetyum · Test: 3 warnings');
    check('y un mensaje de dos frases, frase a frase',
        I.traducir('Prueba: esta demasiado lejos. Prueba: has recogido 1 sword.') ===
        'Test: it is too far away. Test: you picked up 1 sword.');
    check('una lista unida con «; » no acaba entera dentro de un hueco',
        I.traducir('Prueba: falta el suelo; Prueba: falta la mesa') ===
        'Test: el suelo is missing; Test: la mesa is missing');
    check('una plantilla casi sin letras no se usa con lo que llega hecho',
        I.traducir('mapa de prueba') === 'mapa de prueba');
    check('pero sí con t()', I.t('{n} de {total}', { n: 3, total: 9 }) === '3 of 9');
    check('los espacios y saltos de línea de dentro no impiden casar',
        I.traducir('Prueba:   esta\n   demasiado lejos.') === 'Test: it is too far away.');
    check('lo que no tiene entrada se queda como está', I.traducir('algo que nadie ha traducido') ===
        'algo que nadie ha traducido');
    check('lo que no tiene letras ni se busca', I.traducir('12 / 40') === '12 / 40');
    check('t() traduce la plantilla y la rellena', I.t('Prueba: nivel {n}', { n: 5 }) === 'Test: level 5');
    check('un idioma que no existe no se pone', I.setIdioma('xx', { guardar: false }) === 'en');

    let avisado = null;
    const dejar = I.alCambiarIdioma((id) => {
        avisado = id;
    });
    I.setIdioma('es', { guardar: false });
    dejar();
    check('cambiar de idioma avisa', avisado === 'es');
    check('y de vuelta en español, el texto es el original', I.t('Prueba: nivel {n}', { n: 5 }) === 'Prueba: nivel 5');

    check('el idioma de serie, para quien no ha elegido, es el inglés', I.POR_DEFECTO === 'en');
    check('el del servidor se pone si nadie ha elegido', I.idiomaDelServidor('en') === 'en');
    I.setIdioma('es');
    check('pero no pisa el que se eligió', I.idiomaDelServidor('en') === 'es');
    check('y uno que no existe no se pone', I.idiomaDelServidor('xx') === 'es');

    check('el diccionario avisa de un hueco que falta',
        I.problemasDeDiccionario({ 'Tienes {n} monedas.': 'You have coins.' }).length === 1);
    check('y de una traducción vacía', I.problemasDeDiccionario({ 'Hola': '' }).length === 1);
}

// ---------------------------------------------------------------------------
section('2. Los diccionarios');
const carpeta = path.join(ROOT, 'shared', 'i18n', 'en');
const diccionarios = {};
for (const archivo of fs.readdirSync(carpeta).filter((f) => f.endsWith('.mjs')).sort()) {
    const ruta = path.join(carpeta, archivo);
    const entradas = (await import(pathToFileURL(ruta).href)).default;
    diccionarios[archivo] = entradas;
    const problemas = I.problemasDeDiccionario(entradas);
    check(archivo + ': ' + Object.keys(entradas).length + ' entradas, todas bien', problemas.length === 0,
        problemas.slice(0, 3).join(' | '));

    // Las claves que empiezan una línea: si hay más que claves tiene el objeto, alguna se repite.
    const fuente = fs.readFileSync(ruta, 'utf8');
    const vistas = new Map();
    for (const m of fuente.matchAll(/^\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*:/gm)) {
        const clave = m[1];
        vistas.set(clave, (vistas.get(clave) || 0) + 1);
    }
    const repetidas = [...vistas].filter(([, n]) => n > 1).map(([clave]) => clave);
    check(archivo + ': sin claves repetidas', repetidas.length === 0, repetidas.slice(0, 3).join(', '));
}
// Los cargadores importan bien y registran todo.
await import('../shared/i18n/juego.mjs');
await import('../shared/i18n/herramientas.mjs');
check('los cargadores del juego y de las herramientas se importan', true);

// ---------------------------------------------------------------------------
section('3. El cliente traduce lo que dice el juego, no lo que dice un jugador');
{
    I.registrar('en', { 'Prueba: bienvenido a la tienda.': 'Test: welcome to the shop.' });
    I.setIdioma('en', { guardar: false });
    const mundo = new ClientWorld();
    const criatura = (id, nombre, kind) => [P.SERVER.CREATURE_ADD, id, 128, 0, 0, 0, 0, 0, nombre, 10, 10, 7, 2, 100, kind];
    mundo.apply([
        criatura(1, 'Ana', 0),
        criatura(2, 'Herrero', 2),
        [P.SERVER.CREATURE_SAY, 2, 'Herrero', 'Prueba: bienvenido a la tienda.'],
        [P.SERVER.CREATURE_SAY, 1, 'Ana', 'Prueba: bienvenido a la tienda.'],
        [P.SERVER.TEXT, 0, 'Prueba: esta demasiado lejos.']
    ], P);
    check('lo que dice un NPC llega traducido', mundo.says[0].text === 'Test: welcome to the shop.', mundo.says[0].text);
    check('lo que dice un jugador, tal cual', mundo.says[1].text === 'Prueba: bienvenido a la tienda.');
    check('un mensaje del motor llega traducido', mundo.texts[0] === 'Test: it is too far away.', mundo.texts[0]);
    I.setIdioma('es', { guardar: false });
}

// ---------------------------------------------------------------------------
section('4. Lo escrito en las páginas tiene traducción');
{
    /**
     * Los textos de un HTML: lo que hay entre etiquetas y los atributos que se traducen, sin los
     * `<script>`, los `<style>`, los comentarios ni lo marcado con `translate="no"`. No es un
     * analizador de HTML de verdad, y no hace falta: estas páginas son nuestras.
     */
    function entidades(texto) {
        return texto.replace(/&nbsp;/g, ' ').replace(/&#10;/g, '\n').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    }

    function textosDe(html) {
        const limpio = html
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<([a-z]+)\b[^>]*translate="no"[^>]*>[\s\S]*?<\/\1>/gi, ' ');
        const textos = new Set();
        for (const m of limpio.matchAll(/\s(?:title|placeholder|aria-label|alt)="([^"]*)"/g)) {
            textos.add(entidades(m[1]).trim());
        }
        // Un nodo de texto va de etiqueta a etiqueta, con sus saltos de línea dentro.
        for (const trozo of limpio.split(/<[^>]+>/)) {
            textos.add(entidades(trozo).trim());
        }
        return [...textos].filter((texto) => /[a-záéíóúñ]{3}/i.test(texto));
    }

    /** Lo que se escribe igual en los dos idiomas: nombres, teclas, hechizos, comandos. */
    const IGUALES = new Set(['VIP', '/wasd', 'Escape', 'F1–F12, Shift+F1–F12', 'hotkeys', 'Ctrl+K',
        'exura', 'utani hur', '/ayuda', 'Default', 'Server Log', 'Jetyum', 'Sprites', 'noPvp',
        'noLogout', 'pvpZone', 'house', 'Waypoints (W)', 'Waypoints', 'Respawn', 'NPC']);

    I.setIdioma('en', { guardar: false });
    for (const pagina of ['client/jetyum/index.html', 'editor/index.html']) {
        const textos = textosDe(fs.readFileSync(path.join(ROOT, pagina), 'utf8'));
        // Lo que ya está en inglés (o es un nombre) se queda igual y está bien: se cuenta como
        // traducido lo que cambia o lo que tiene entrada propia en el diccionario.
        const sinTraducir = textos.filter((texto) => !IGUALES.has(texto) && I.traducir(texto) === texto &&
            !Object.values(diccionarios).some((d) => Object.prototype.hasOwnProperty.call(d, texto)));
        check(pagina + ': ' + (textos.length - sinTraducir.length) + ' de ' + textos.length + ' textos traducidos',
            sinTraducir.length === 0, sinTraducir.slice(0, 40).map((texto) => JSON.stringify(texto)).join(', '));
    }
    I.setIdioma('es', { guardar: false });
}

console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — los idiomas funcionan y los diccionarios están bien.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
