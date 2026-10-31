/**
 * PRUEBA DE LA VISTA DE VARIAS PLANTAS DEL EDITOR: qué plantas se dibujan, en qué orden, con qué
 * transparencia y con qué sombra (`editor/js/plantas.js`), y que el truco con el que el lienzo
 * pinta una planta que no es la de la cámara cae donde la pondría el juego.
 *
 *     node tools/test-editor-plantas.mjs
 *
 *   1. todo apagado: una sola planta, con su fondo, como siempre
 *   2. el alcance hacia abajo: hasta la 7 en la superficie, dos más bajo tierra
 *   3. el plan con las de abajo, la sombra y el fantasma de encima
 *   4. el fondo: la regla del motor, no la del modelo del editor
 *   5. las opciones: se mezclan, no se pisan
 *   6. con el mapa de verdad y el orden de dibujo del cliente
 *
 * El lienzo (`mapcanvas.js`) no se puede importar aquí: importa la cámara y el orden de dibujo
 * con rutas del montaje (`/jetyum/js/...`). Por eso la decisión vive en `plantas.js`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as V from '../editor/js/plantas.js';
import { EditorMap } from '../editor/js/editormap.js';
import { Camera } from '../client/jetyum/js/camera.js';
import { buildDrawList } from '../client/jetyum/js/drawlist.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let fallos = 0;
let total = 0;

function check(label, condition, detail) {
    total += 1;
    if (!condition) {
        fallos += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

/** Un plan en una línea, para leer los fallos: `7i+ 6a` (i/a/s = papel, + = fondo, * = sombra). */
function resumen(plan) {
    return plan.map((p) => p.z + p.papel[0] + (p.fondo ? '+' : '') + (p.sombra > 0 ? '*' : '') +
        (p.alfa < 1 ? '~' + p.alfa : '')).join(' ');
}

const zs = (plan) => plan.map((p) => p.z).join(',');

// ---------------------------------------------------------------------------
section('1. Todo apagado: una sola planta, como siempre');
{
    check('la vista por defecto tiene los tres modos apagados',
        V.VISTA_POR_DEFECTO.inferiores === false && V.VISTA_POR_DEFECTO.fantasmaSuperior === false &&
        V.VISTA_POR_DEFECTO.sombra === false);
    check('y no se puede cambiar por accidente', Object.isFrozen(V.VISTA_POR_DEFECTO));

    let todas = true;
    let detalle = '';
    for (let z = 0; z <= 15; z += 1) {
        const plan = V.planDePlantas(z, V.VISTA_POR_DEFECTO, { numPlantas: 16 });
        const bien = plan.length === 1 && plan[0].z === z && plan[0].papel === 'actual' &&
            plan[0].fondo === true && plan[0].sobreOtras === false && plan[0].alfa === 1 &&
            plan[0].sombra === 0;
        if (!bien) {
            todas = false;
            detalle = 'z=' + z + ': ' + resumen(plan);
        }
    }
    check('en las 16 plantas: sólo la que se edita, opaca, CON su fondo y sin sombra', todas, detalle);
    check('sin vista es lo mismo que la vista por defecto',
        resumen(V.planDePlantas(6)) === resumen(V.planDePlantas(6, V.VISTA_POR_DEFECTO)));
    check('la sombra sola no enseña nada: sin plantas de abajo no hay qué oscurecer',
        resumen(V.planDePlantas(5, { sombra: true })) === '5a+');
}

// ---------------------------------------------------------------------------
section('2. El alcance hacia abajo (el de OTClient)');
{
    const casos = [
        [7, '', 'en la superficie no se ve nada debajo'],
        [6, '7', 'un piso por encima: la calle'],
        [5, '7,6', 'dos pisos por encima: la calle y el primero, de la más honda a la más alta'],
        [0, '7,6,5,4,3,2,1', 'desde lo más alto, hasta la superficie y no más'],
        [8, '10,9', 'bajo tierra, dos plantas más'],
        [12, '14,13', 'y en cualquier sótano'],
        [14, '15', 'sin pasarse de la 15'],
        [15, '', 'y en la 15, nada']
    ];
    casos.forEach(([z, esperado, texto]) => {
        const hay = V.plantasInferiores(z).join(',');
        check('z=' + z + ': ' + texto, hay === esperado, '[' + hay + ']');
    });
    check('un mapa con menos plantas no se sale de las suyas',
        V.plantasInferiores(8, 10).join(',') === '9', '[' + V.plantasInferiores(8, 10).join(',') + ']');
    check('y si no las tiene, no hay nada', V.plantasInferiores(8, 9).length === 0);
}

// ---------------------------------------------------------------------------
section('3. El plan: las de abajo, la sombra y el fantasma de encima');
{
    const conFondo = (z) => V.plantaConSueloPorDefecto({ 7: 100 }, z);
    const opciones = { numPlantas: 16, conFondo: conFondo };

    const piso = V.planDePlantas(6, { inferiores: true }, opciones);
    check('desde el piso de arriba se ve la calle DEBAJO, y luego el piso',
        resumen(piso) === '7i+ 6a', resumen(piso));
    check('la calle va con su fondo de hierba y no lleva nada debajo',
        piso[0].fondo === true && piso[0].sobreOtras === false);
    check('el piso NO lleva fondo: si no, taparía la calle entera', piso[1].fondo === false);
    check('y sabe que hay algo pintado debajo', piso[1].sobreOtras === true);

    const sombra = V.planDePlantas(5, { inferiores: true, sombra: true }, opciones);
    check('con sombra, cada planta de abajo lleva su velo y la que se edita no',
        resumen(sombra) === '7i+* 6i* 5a', resumen(sombra));
    check('el velo es ALFA_SOMBRA', sombra[0].sombra === V.ALFA_SOMBRA && sombra[1].sombra === V.ALFA_SOMBRA);
    check('así la más honda queda más oscura (dos velos encima)',
        sombra.filter((p) => p.sombra > 0).length === 2);
    check('sólo la primera pintada va sin nada debajo',
        sombra.map((p) => p.sobreOtras).join(',') === 'false,true,true');

    const decreciente = (plan) => plan.every((p, i) => i === 0 || p.z < plan[i - 1].z);
    let ordenBien = true;
    for (let z = 0; z <= 15; z += 1) {
        if (!decreciente(V.planDePlantas(z, { inferiores: true, fantasmaSuperior: true, sombra: true },
            opciones))) {
            ordenBien = false;
        }
    }
    check('en todas las plantas, el orden es el del juego: de la más honda a la más alta', ordenBien);

    const fantasma = V.planDePlantas(7, { fantasmaSuperior: true }, opciones);
    check('el fantasma de encima va DESPUÉS de la que se edita', resumen(fantasma) === '7a+ 6s~0.35',
        resumen(fantasma));
    check('transparente, al ALFA_FANTASMA_SUPERIOR, y sin fondo',
        fantasma[1].alfa === V.ALFA_FANTASMA_SUPERIOR && fantasma[1].fondo === false &&
        fantasma[1].sombra === 0);
    check('la planta que se edita sigue con su fondo: el fantasma no cuenta como «debajo»',
        fantasma[0].fondo === true && fantasma[0].sobreOtras === false);
    check('desde la planta 0 no hay nada encima', V.planDePlantas(0, { fantasmaSuperior: true }).length === 1);

    const todo = V.planDePlantas(6, { inferiores: true, fantasmaSuperior: true, sombra: true }, opciones);
    check('los tres a la vez: calle oscura, el piso y el tejado transparente',
        resumen(todo) === '7i+* 6a 5s~0.35', resumen(todo));

    const bajoTierra = V.planDePlantas(8, { inferiores: true, sombra: true }, opciones);
    check('bajo tierra: las dos de abajo, y todas con fondo (el motor las rellena)',
        resumen(bajoTierra) === '10i+* 9i+* 8a+', resumen(bajoTierra));

    // --- Las plantas vacías se saltan ---
    const conCasillas = new Set([7, 4]);
    const tieneCasillas = (z) => conCasillas.has(z);
    const saltando = V.planDePlantas(4, { inferiores: true, fantasmaSuperior: true },
        { numPlantas: 16, conFondo: conFondo, tieneCasillas: tieneCasillas });
    check('una planta de abajo sin fondo ni casillas no se recorre para nada',
        zs(saltando) === '7,4', resumen(saltando));
    check('ni el fantasma de una de encima vacía', !saltando.some((p) => p.papel === 'superior'));
    check('pero una con fondo se dibuja aunque no tenga casillas',
        zs(V.planDePlantas(6, { inferiores: true }, { conFondo: conFondo, tieneCasillas: () => false })) === '7,6');
    check('y la que se edita, siempre',
        zs(V.planDePlantas(3, { inferiores: true, fantasmaSuperior: true },
            { conFondo: () => false, tieneCasillas: () => false })) === '3');
    check('si todas las de abajo se saltan, la que se edita vuelve a su fondo de siempre',
        V.planDePlantas(3, { inferiores: true }, { conFondo: () => false, tieneCasillas: () => false })[0]
            .fondo === true);
}

// ---------------------------------------------------------------------------
section('4. El fondo: la regla del motor');
{
    check('la superficie lleva fondo', V.plantaConSueloPorDefecto({}, 7) === true);
    check('bajo tierra, también (el motor aplica el respaldo)', V.plantaConSueloPorDefecto({}, 9) === true);
    check('por encima, NO: ahí hay aire, aunque el editor devuelva el respaldo',
        V.plantaConSueloPorDefecto({}, 6) === false && V.plantaConSueloPorDefecto(null, 0) === false);
    check('salvo que el mapa la declare', V.plantaConSueloPorDefecto({ 6: 104 }, 6) === true);
    check('y con la clave como texto, que es como llega del JSON',
        V.plantaConSueloPorDefecto(JSON.parse('{"5": 104}'), 5) === true);
}

// ---------------------------------------------------------------------------
section('5. Las opciones se mezclan, no se pisan');
{
    const una = V.normalizarVista({ sombra: true });
    check('encender una deja las otras apagadas',
        una.sombra === true && una.inferiores === false && una.fantasmaSuperior === false);
    const dos = V.normalizarVista({ inferiores: true }, una);
    check('y encender otra no apaga la primera', dos.sombra === true && dos.inferiores === true);
    const tres = V.normalizarVista({ sombra: false }, dos);
    check('apagar una sólo apaga ésa', tres.sombra === false && tres.inferiores === true);
    check('lo que llega se lee como booleano', V.normalizarVista({ inferiores: 1 }).inferiores === true &&
        V.normalizarVista({ inferiores: '' }).inferiores === false);
    check('lo desconocido no se cuela', Object.keys(V.normalizarVista({ otra: true })).sort().join(',') ===
        'fantasmaSuperior,inferiores,sombra');
    check('y devuelve una vista NUEVA, no la de antes', V.normalizarVista({}, una) !== una);
    check('misma vista: igual', V.mismaVista(dos, V.normalizarVista({}, dos)));
    check('misma vista: distinta', !V.mismaVista(dos, tres));
    check('misma vista: sin nada es todo apagado', V.mismaVista(null, V.VISTA_POR_DEFECTO));
}

// ---------------------------------------------------------------------------
section('6. Con el mapa de verdad y el orden de dibujo del cliente');
{
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'world', 'jetyum.map.json'), 'utf8'));
    const mapa = new EditorMap(raw, new Map());

    const plantas = new Set();
    mapa.tiles.forEach((tile) => {
        if (!mapa.isVoid(tile)) {
            plantas.add(tile.z);
        }
    });

    // Lo mismo que hace el lienzo con el mapa.
    const opciones = {
        numPlantas: Number(mapa.floors),
        conFondo: (z) => V.plantaConSueloPorDefecto(mapa.defaultGround, z),
        tieneCasillas: (z) => plantas.has(z)
    };

    check('el mapa tiene casillas en la 6 (el piso de arriba)', plantas.has(6), Array.from(plantas).join(','));
    check('el editor le da hierba a la 6, el motor no',
        mapa.defaultGroundFor(6) === mapa.fallbackGround && !opciones.conFondo(6));

    const plan = V.planDePlantas(6, { inferiores: true, sombra: true, fantasmaSuperior: true }, opciones);
    check('editando la 6: la calle debajo, oscura, y nada encima (la 5 está vacía)',
        resumen(plan) === '7i+* 6a', resumen(plan));

    /*
     * EL TRUCO DE LA CÁMARA, comprobado contra el orden de dibujo DE VERDAD.
     *
     * El lienzo pinta cada planta con `onlyCurrentFloor` y una cámara cuya `z` dice la planta a
     * pintar, mientras `worldToScreen` y `visibleRect` siguen midiendo desde la planta de la
     * cámara (`_camaraAcotada(planta)` en `mapcanvas.js`). Si el orden de dibujo dejara de mirar
     * `camera.z` para elegir la planta, o de pedirle a la cámara las posiciones, la planta de abajo
     * caería encima de la de arriba y esto lo dice.
     */
    // La cámara, encima de una casilla del piso de arriba, para que las dos plantas tengan algo.
    const delPiso = Array.from(mapa.tiles.values()).find((tile) => tile.z === 6 && !mapa.isVoid(tile));
    const camara = new Camera({ width: 800, height: 600, tileSize: 32 });
    camara.setCenter(delPiso.x, delPiso.y, 6);

    const acotada = (planta) => ({
        get z() {
            return planta === undefined ? camara.z : planta;
        },
        worldToScreen: (x, y, z) => camara.worldToScreen(x, y, z),
        visibleRect(z) {
            const r = camara.visibleRect(z);
            return {
                x0: Math.max(0, r.x0), y0: Math.max(0, r.y0),
                x1: Math.min(mapa.width - 1, r.x1), y1: Math.min(mapa.height - 1, r.y1)
            };
        }
    });

    const abajo = buildDrawList(mapa, acotada(7), { now: 0, onlyCurrentFloor: true });
    const actual = buildDrawList(mapa, acotada(), { now: 0, onlyCurrentFloor: true });

    check('la lista de la planta de abajo sólo trae la 7', abajo.length > 0 && abajo.every((op) => op.z === 7),
        abajo.length + ' operaciones');
    check('y la de la que se edita, sólo la 6', actual.length > 0 && actual.every((op) => op.z === 6),
        actual.length + ' operaciones');

    const op = abajo[0];
    const misma = camara.worldToScreen(op.x, op.y, 6);
    check('una casilla de la 7 cae UNA casilla abajo y a la derecha de la misma casilla de la 6',
        op.sx - misma.x === 32 && op.sy - misma.y === 32, (op.sx - misma.x) + ',' + (op.sy - misma.y));

    const encima = buildDrawList(mapa, acotada(5), { now: 0, onlyCurrentFloor: true });
    check('y una planta vacía no trae nada (por eso el plan la salta)', encima.length === 0);
}

console.log('\n' + (fallos === 0
    ? '\x1b[32mTodo OK\x1b[0m — ' + total + ' comprobaciones: la vista de varias plantas como en RME.'
    : '\x1b[31m' + fallos + ' de ' + total + ' comprobaciones fallaron\x1b[0m'));
process.exit(fallos === 0 ? 0 : 1);
