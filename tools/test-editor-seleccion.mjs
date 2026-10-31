/**
 * PRUEBA DE LA SELECCIÓN DEL EDITOR DE MAPAS AL ESTILO RME: la selección como conjunto de
 * casillas (Mayús+arrastrar suma, Ctrl+arrastrar resta), mover lo seleccionado arrastrándolo como
 * UNA acción del historial, los modos de selección de varias plantas (actual / inferiores /
 * visibles) con copiar, pegar, borrar y mover conservando la z relativa, y el fantasma del pegado.
 *
 *     node tools/test-editor-seleccion.mjs
 *
 * Usa el EditorMap de verdad y la clase Herramientas de verdad, con un lienzo y un contexto de
 * mentira: los gestos del ratón entran por `alPulsar`/`alMover`/`alSoltar`, como desde main.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as P from '../editor/js/pinceles.js';
import * as E from '../editor/js/edicion.js';
import { Historial } from '../editor/js/historial.js';
import { EditorMap } from '../editor/js/editormap.js';
import { Herramientas } from '../editor/js/herramientas.js';

const require = createRequire(import.meta.url);
const Xml = require('../engine/data/xml.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;
let total = 0;

function check(label, condition, detail) {
    total += 1;
    if (!condition) {
        fallos += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}

function section(t) {
    console.log('\n' + t);
}

function mapaVacio(items) {
    return new EditorMap({
        format: 'jetyum-map', version: 1, name: 'prueba', width: 32, height: 32, floors: 16,
        defaultGround: { 7: 102 }, tiles: []
    }, items);
}

/** Una foto comparable de todo lo que se mueve: casillas y listas. */
function foto(m) {
    const casillas = Array.from(m.tiles.values()).map((t) => JSON.stringify(t)).sort();
    return JSON.stringify({ casillas, npcs: m.npcs, spawns: m.spawns, compuestos: m.compuestos });
}

/** Un lienzo de mentira: lo justo para que Herramientas dibuje y sepa la planta. */
function lienzoFalso(z) {
    const llamadas = [];
    const ctx = {
        llamadas, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
        save() {}, restore() {}, beginPath() {}, setLineDash() {}, arc() {},
        moveTo() {}, lineTo() {}, fillText() {},
        fillRect(...a) { llamadas.push(['fillRect', this.fillStyle, ...a]); },
        strokeRect() {},
        stroke() { llamadas.push(['stroke', this.strokeStyle]); },
        drawImage(img, x, y) { llamadas.push(['drawImage', img.id, this.globalAlpha, x, y]); }
    };
    const camera = {
        centerX: 16, centerY: 16, z,
        worldToScreen(x, y) {
            return { x: (x - this.centerX) * 32 + 512, y: (y - this.centerY) * 32 + 512 };
        }
    };
    return {
        z, ctx, camera, tileSize: 32, vista: { ancho: 1024, alto: 1024 }, hover: null,
        provider: { get: (id) => ({ canvas: { id, width: 32, height: 32 }, anchorX: 0, anchorY: 32 }) }
    };
}

/** Herramientas de verdad sobre un mapa, con el DOM sustituido por nada. */
function herramientasPara(m, idx) {
    let ultimo = '';
    const state = { map: m, canvas: lienzoFalso(7), tool: 'seleccionar', pincel: 1 };
    const h = new Herramientas({
        state, api: {}, estado: (texto) => { ultimo = texto; }, refrescar() {}, ponerHerramienta(nombre) { state.tool = nombre; },
        soltarMano() {}, nombreDeObjeto: (id) => String(id), modoDePaleta() {}
    });
    h.$ = (id) => (id === 'map-status' ? { textContent: ultimo } : (id === 'mano-info' ? {} : null));
    h.verMinimapa = false;
    if (idx) {
        h.idx = idx;
    }
    h.alAbrirMapa();
    h.estado = () => ultimo;
    return { h, state };
}

/** Un arrastre del ratón de `a` a `b`, con las teclas de `teclas` (shiftKey, ctrlKey...). */
function arrastrar(h, a, b, teclas) {
    const evento = { button: 0, shiftKey: false, ctrlKey: false, metaKey: false, ...(teclas || {}) };
    h.alPulsar(a, evento);
    h.alMover(b, evento);
    h.alSoltar(evento);
}

async function main() {
    console.log('Prueba de la selección del editor de mapas (RME) (' + ROOT + ')');
    const items = Xml.loadItems(path.join(ROOT, 'data', 'items', 'items.xml'));
    const crudo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'editor', 'pinceles.json'), 'utf8'));
    const idx = P.indexar(P.normalizarPinceles(crudo, items).data);

    section('1. Los modos de selección (plantas que coge un rectángulo)');
    check('actual: sólo la planta', E.plantasDeSeleccion('actual', 5, 16).join() === '5');
    check('inferiores al aire libre: hasta la 7', E.plantasDeSeleccion('inferiores', 5, 16).join() === '5,6,7' &&
        E.plantasDeSeleccion('inferiores', 7, 16).join() === '7');
    check('inferiores bajo tierra: hasta la última', E.plantasDeSeleccion('inferiores', 13, 16).join() === '13,14,15');
    check('visibles: al aire libre hasta la 7, bajo tierra dos más', E.plantasDeSeleccion('visibles', 4, 16).join() === '4,5,6,7' &&
        E.plantasDeSeleccion('visibles', 9, 16).join() === '9,10,11' && E.plantasDeSeleccion('visibles', 15, 16).join() === '15');

    section('2. La selección es un conjunto: sumar y restar rectángulos');
    {
        const sel = E.seleccionDeRectangulo(E.rectangulo({ x: 2, y: 2 }, { x: 5, y: 5 }, 7), [7]);
        E.marcarRectangulo(sel, E.rectangulo({ x: 8, y: 2 }, { x: 9, y: 3 }, 7), [7]);
        E.marcarRectangulo(sel, E.rectangulo({ x: 3, y: 3 }, { x: 4, y: 4 }, 7), [7], true);
        check('16 + 4 - 4 casillas, con un agujero y una isla', E.tamanoDeSeleccion(sel) === 16 &&
            !E.enSeleccion(sel, 3, 3, 7) && E.enSeleccion(sel, 2, 2, 7) && E.enSeleccion(sel, 9, 3, 7) && !E.enSeleccion(sel, 7, 2, 7));
        const l = E.limitesDeSeleccion(sel);
        check('su recuadro y sus plantas', l.x0 === 2 && l.x1 === 9 && l.y0 === 2 && l.y1 === 5 && l.plantas.join() === '7');
        const m = mapaVacio(items);
        m.paintItem(3, 3, 7, 1948);
        m.paintItem(2, 2, 7, 1948);
        check('buscar y reemplazar respetan el conjunto (el agujero no cuenta)',
            E.buscar(m, { id: 1948 }, sel).length === 1 && E.reemplazar(m, 1948, 2417, sel) === 1 &&
            m.tileAt(3, 3, 7).items[0].id === 1948 && m.tileAt(2, 2, 7).items[0].id === 2417);
        check('quitar por id también', E.quitarPorId(m, 1948, sel) === 0 && E.quitarPorId(m, 2417, sel) === 1);
    }

    section('3. Con el ratón: arrastrar sustituye, Mayús suma, Ctrl resta');
    {
        const m = mapaVacio(items);
        const { h } = herramientasPara(m);
        arrastrar(h, { x: 2, y: 2 }, { x: 5, y: 5 });
        check('un rectángulo de 4x4', E.tamanoDeSeleccion(h.seleccion) === 16, h.estado());
        h.alPulsar({ x: 10, y: 10 }, { button: 0, shiftKey: true });
        h.alMover({ x: 11, y: 11 });
        check('mientras se arrastra, la selección no ha cambiado aún (se ve compuesta)',
            E.tamanoDeSeleccion(h.seleccion) === 16 && h._enSeleccionViva(11, 11, 7) && h._enSeleccionViva(2, 2, 7));
        h.alSoltar({});
        check('Mayús+arrastrar suma', E.tamanoDeSeleccion(h.seleccion) === 20 && E.enSeleccion(h.seleccion, 11, 11, 7));
        arrastrar(h, { x: 3, y: 3 }, { x: 4, y: 4 }, { ctrlKey: true });
        check('Ctrl+arrastrar resta (aunque se empiece dentro: no mueve)', E.tamanoDeSeleccion(h.seleccion) === 16 &&
            !E.enSeleccion(h.seleccion, 3, 3, 7));
        arrastrar(h, { x: 20, y: 20 }, { x: 20, y: 20 });
        check('un clic fuera la sustituye', E.tamanoDeSeleccion(h.seleccion) === 1 && E.enSeleccion(h.seleccion, 20, 20, 7));
        arrastrar(h, { x: 20, y: 20 }, { x: 20, y: 20 }, { ctrlKey: true });
        check('restarlo todo la deja vacía', h.seleccion === null, h.estado());
        h.alPulsar(null, { button: 0 });
        check('un clic fuera del mapa no rompe nada', h.seleccion === null);
    }

    section('4. Mover la selección arrastrándola: una sola acción, y deshacer lo devuelve todo');
    {
        const m = mapaVacio(items);
        m.editableTile(2, 2, 7).ground = 104;
        m.markDirty(2, 2, 7);
        m.addItem(2, 2, 7, 1948);
        m.tileAt(2, 2, 7).items[0].attributes = { actionId: 2001 };
        E.pintarCasa(m, [{ x: 3, y: 2 }], 7, 1);
        m.toggleFlag(4, 3, 7, 'noPvp');
        m.npcs.push({ x: 2, y: 3, z: 7, name: 'Herrero', radius: null });
        m.spawns.push({ x: 4, y: 4, z: 7, radius: 1, interval: 60, monsters: [{ name: 'rat', x: 4, y: 5, interval: 60 }] });
        m.paintItem(13, 7, 7, 2417);
        const { h } = herramientasPara(m, idx);
        h.autoborde = true;
        arrastrar(h, { x: 2, y: 2 }, { x: 5, y: 5 });
        h.confirmar();
        const antes = foto(m);
        const entradas = h.historial.pasado.length;

        h.alPulsar({ x: 2, y: 2 }, { button: 0 });
        h.alMover({ x: 12, y: 7 });
        check('agarrar dentro de la selección empieza a moverla, y mientras se arrastra el mapa no cambia',
            !!h.pulsado.mover && foto(m) === antes && h.pulsado.mover.dx === 10 && h.pulsado.mover.dy === 5);
        h.alSoltar({});
        const t = m.tileAt(12, 7, 7);
        check('el contenido llega entero: suelo, pila con atributos, houseId y banderas',
            t && t.ground === 104 && t.items.some((i) => i.id === 1948 && i.attributes.actionId === 2001) &&
            m.tileAt(13, 7, 7).houseId === 1 && m.tileAt(13, 7, 7).flags.includes('house') &&
            m.tileAt(14, 8, 7).flags.includes('noPvp'), h.estado());
        check('el origen queda vacío', !m.tileAt(2, 2, 7) && !m.tileAt(3, 2, 7) && !m.tileAt(4, 3, 7));
        check('la casilla movida SUSTITUYE a la de destino (el 2417 de (13,7) ya no está)',
            !m.tileAt(13, 7, 7).items.some((i) => i.id === 2417));
        check('el NPC y el respawn (con su monstruo) viajan con la selección',
            m.npcs[0].x === 12 && m.npcs[0].y === 8 && m.spawns[0].x === 14 && m.spawns[0].y === 9 &&
            m.spawns[0].monsters[0].x === 14 && m.spawns[0].monsters[0].y === 10);
        check('la selección se va con el contenido', E.enSeleccion(h.seleccion, 12, 7, 7) && !E.enSeleccion(h.seleccion, 2, 2, 7) &&
            E.tamanoDeSeleccion(h.seleccion) === 16);
        h.confirmar();
        check('el movimiento es UNA entrada del historial', h.historial.pasado.length === entradas + 1);
        h.deshacer();
        check('deshacer lo devuelve TODO (casillas, banderas, casa, NPC y respawn)', foto(m) === antes);
        check('y la selección vuelve a su sitio', E.enSeleccion(h.seleccion, 2, 2, 7) && !E.enSeleccion(h.seleccion, 12, 7, 7));
        h.rehacer();
        check('rehacer lo vuelve a mover, selección incluida', m.tileAt(12, 7, 7).ground === 104 && E.enSeleccion(h.seleccion, 12, 7, 7));

        const despues = foto(m);
        h.alPulsar({ x: 12, y: 7 }, { button: 0 });
        h.alMover({ x: 30, y: 7 });
        h.alSoltar({});
        check('si algo se saldría del mapa no se mueve nada', foto(m) === despues && E.enSeleccion(h.seleccion, 12, 7, 7), h.estado());
        h.alPulsar({ x: 12, y: 7 }, { button: 0 });
        h.alMover({ x: 12, y: 7 });
        h.alSoltar({});
        check('un clic sin arrastrar sobre la selección la conserva', foto(m) === despues && E.tamanoDeSeleccion(h.seleccion) === 16);
        h.alPulsar({ x: 12, y: 7 }, { button: 0 });
        h.alMover({ x: 15, y: 7 });
        check('Escape en mitad del arrastre lo cancela', h.cancelarArrastre() && h.pulsado === null);
        h.alSoltar({});
        check('y al soltar ya no pasa nada', foto(m) === despues);
    }

    section('5. Las casillas vacías de la selección no hacen agujeros al moverla');
    {
        const m = mapaVacio(items);
        m.paintItem(2, 2, 7, 1948);
        m.paintItem(9, 3, 7, 2417);
        const sel = E.seleccionDeRectangulo(E.rectangulo({ x: 2, y: 2 }, { x: 3, y: 3 }, 7), [7]);
        const r = E.moverSeleccion(m, sel, 6, 0);
        check('lo de debajo de una casilla seleccionada sin nada se queda', r.ok && r.n === 1 &&
            m.tileAt(8, 2, 7).items[0].id === 1948 && m.tileAt(9, 3, 7).items[0].id === 2417);
    }

    section('6. Varias plantas: seleccionar, copiar, pegar, borrar y mover con la z relativa');
    {
        const m = mapaVacio(items);
        m.paintItem(2, 2, 5, 1948);
        m.paintItem(2, 2, 6, 2417);
        m.editableTile(3, 3, 7).ground = 104;
        m.markDirty(3, 3, 7);
        m.paintItem(2, 2, 8, 1948);
        const { h, state } = herramientasPara(m);
        h.autoborde = false;
        check('setModoSeleccion valida el modo', h.setModoSeleccion('inferiores') && !h.setModoSeleccion('todas') &&
            h.modoSeleccion === 'inferiores');
        state.canvas.z = 5;
        arrastrar(h, { x: 2, y: 2 }, { x: 3, y: 3 });
        check('el rectángulo coge las plantas 5, 6 y 7 (no la 8: está bajo tierra)', E.tamanoDeSeleccion(h.seleccion) === 12 &&
            h._limites.plantas.join() === '5,6,7' && !E.enSeleccion(h.seleccion, 2, 2, 8), h.estado());
        state.canvas.z = 6;
        check('vale desde cualquiera de sus plantas', h._selActual() === h.seleccion);
        state.canvas.z = 5;
        h.copiar();
        const p = h.portapapeles;
        check('copiar lleva las tres plantas con su dz desde la que se ve', p.plantas === 3 && p.celdas.length === 3 &&
            p.celdas.map((c) => c.dz).sort().join() === '0,1,2' && p.mascara.length === 12, h.estado());

        state.canvas.z = 3;
        h.empezarPegado(null);
        check('Ctrl+V pone la herramienta de pegar', state.tool === 'pegar');
        h.alPulsar({ x: 20, y: 20 }, { button: 0 });
        h.alSoltar({});
        check('pegar en la 3 deja los pisos en la 3, la 4 y la 5', m.tileAt(20, 20, 3).items[0].id === 1948 &&
            m.tileAt(20, 20, 4).items[0].id === 2417 && m.tileAt(21, 21, 5).ground === 104, h.estado());
        check('lo pegado queda seleccionado con su forma y sus plantas', E.tamanoDeSeleccion(h.seleccion) === 12 &&
            h._limites.plantas.join() === '3,4,5');
        state.canvas.z = 14;
        const n = E.pegar(m, p, 0, 0, 14);
        check('lo que caería por debajo de la última planta se recorta', n === 2 && m.tileAt(0, 0, 14) && m.tileAt(0, 0, 15));

        // Mover las tres plantas a la vez.
        state.tool = 'seleccionar';
        state.canvas.z = 3;
        h.confirmar();
        const h0 = h.historial.pasado.length;
        h.alPulsar({ x: 20, y: 20 }, { button: 0 });
        h.alMover({ x: 25, y: 22 });
        h.alSoltar({});
        h.confirmar();
        check('mover lleva todas las plantas de la selección, cada una en la suya',
            m.tileAt(25, 22, 3).items[0].id === 1948 && m.tileAt(25, 22, 4).items[0].id === 2417 &&
            m.tileAt(26, 23, 5).ground === 104 && !m.tileAt(20, 20, 3) && !m.tileAt(20, 20, 4) && !m.tileAt(21, 21, 5), h.estado());
        check('y es una sola entrada del historial', h.historial.pasado.length === h0 + 1);
        h.deshacer();
        check('deshacerla devuelve las tres plantas', m.tileAt(20, 20, 3) && m.tileAt(20, 20, 4) && m.tileAt(21, 21, 5) &&
            !m.tileAt(25, 22, 3));

        state.canvas.z = 4;
        h.borrarSeleccion();
        check('borrar la selección borra en todas sus plantas', !m.tileAt(20, 20, 3) && !m.tileAt(20, 20, 4) && !m.tileAt(21, 21, 5) &&
            m.tileAt(2, 2, 5) && m.tileAt(2, 2, 8));
        state.canvas.z = 5;
        arrastrar(h, { x: 2, y: 2 }, { x: 3, y: 3 });
        h.cortar();
        check('cortar también', !m.tileAt(2, 2, 5) && !m.tileAt(2, 2, 6) && !m.tileAt(3, 3, 7) && m.tileAt(2, 2, 8) &&
            h.portapapeles.celdas.length === 3);
        h.setModoSeleccion('actual');
        arrastrar(h, { x: 6, y: 6 }, { x: 7, y: 7 });
        check('con el modo «actual», sólo la planta que se ve', h._limites.plantas.join() === '5');
    }

    section('7. El fantasma del pegado y del movimiento: sprites semitransparentes bajo el ratón');
    {
        const m = mapaVacio(items);
        m.paintItem(2, 2, 7, 1948);
        m.editableTile(3, 2, 7).ground = 104;
        m.markDirty(3, 2, 7);
        m.paintItem(2, 2, 6, 2417);
        const { h, state } = herramientasPara(m);
        h.setModoSeleccion('visibles');
        state.canvas.z = 6;
        arrastrar(h, { x: 2, y: 2 }, { x: 3, y: 2 });
        state.canvas.z = 7;
        h.copiar();
        check('una copia de dos plantas vista desde la de abajo (dz -1 y 0)', h.portapapeles.plantas === 2 &&
            h.portapapeles.celdas.map((c) => c.dz).sort().join() === '-1,0,0');
        h.empezarPegado(null);
        const lienzo = state.canvas;
        lienzo.hover = { x: 10, y: 10 };
        lienzo.ctx.llamadas.length = 0;
        h._dibujarEncima(lienzo);
        const imagenes = lienzo.ctx.llamadas.filter((c) => c[0] === 'drawImage');
        check('dibuja los sprites de lo copiado (suelo y objeto) y no sólo un recuadro',
            imagenes.length === 2 && imagenes.some((c) => c[1] === 1948) && imagenes.some((c) => c[1] === 104));
        check('semitransparentes', imagenes.every((c) => c[2] > 0 && c[2] < 1));
        check('el suelo primero y la pila después', imagenes[0][1] === 104);
        check('donde va: la esquina bajo el ratón', imagenes.some((c) => c[1] === 1948 && c[3] === (10 - 16) * 32 + 512));
        check('sólo la planta que se ve (el 2417 de la 6 no)', !imagenes.some((c) => c[1] === 2417));
        lienzo.hover = { x: 31, y: 10 };
        lienzo.ctx.llamadas.length = 0;
        h._dibujarEncima(lienzo);
        check('lo que cae fuera del mapa sale en rojo', lienzo.ctx.llamadas.some((c) => c[0] === 'stroke' && c[1] === '#ff5050'));

        state.tool = 'seleccionar';
        lienzo.ctx.llamadas.length = 0;
        h.alPulsar({ x: 2, y: 2 }, { button: 0 });
        h.alMover({ x: 6, y: 9 });
        h._dibujarEncima(lienzo);
        const movidas = lienzo.ctx.llamadas.filter((c) => c[0] === 'drawImage');
        check('al mover se ve el fantasma en el destino', movidas.length === 2 &&
            movidas.some((c) => c[1] === 1948 && c[3] === (6 - 16) * 32 + 512 && c[4] === (9 - 16) * 32 + 512));
        h.alSoltar({});
    }

    section('8. El historial a secas: mover y deshacer con las funciones puras');
    {
        const m = mapaVacio(items);
        m.paintItem(5, 5, 7, 1948);
        m.paintItem(5, 5, 6, 2417);
        const hist = new Historial(m);
        const antes = foto(m);
        const sel = E.seleccionDeRectangulo(E.rectangulo({ x: 5, y: 5 }, { x: 5, y: 5 }, 6), [6, 7]);
        const r = E.moverSeleccion(m, sel, 1, 1);
        check('mover dos plantas', r.ok && m.tileAt(6, 6, 7) && m.tileAt(6, 6, 6) && !m.tileAt(5, 5, 7));
        check('una entrada', hist.confirmar('mover') && hist.pasado.length === 1);
        hist.deshacer();
        check('deshecho', foto(m) === antes);
        const r2 = E.moverSeleccion(m, sel, 0, 0, 1);
        check('también entre plantas (dz)', r2.ok && m.tileAt(5, 5, 8) && m.tileAt(5, 5, 7).items[0].id === 2417);
    }

    console.log('\n' + (fallos === 0
        ? '\x1b[32mTodo OK\x1b[0m — ' + total + ' comprobaciones: selección por conjuntos, mover, varias plantas y fantasma.'
        : '\x1b[31m' + fallos + ' de ' + total + ' comprobaciones fallaron\x1b[0m'));
    process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
