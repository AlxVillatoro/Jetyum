/**
 * Prueba de la lógica de dibujo del cliente.
 *
 * El 2.5D no son píxeles: son dos decisiones —cuánto se desplaza cada planta y en
 * qué orden se pinta todo— y las dos son cálculo puro. Por eso se pueden verificar
 * sin abrir un navegador ni mirar una captura, que es lo que hace que esta prueba
 * sirva de algo.
 *
 * Se importan los MISMOS módulos que carga el navegador. No hay copia para la
 * prueba: si el cliente se rompe, aquí se ve.
 *
 * Uso:  node tools/test-render.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { Camera, TILE_PIXELS, floorOffset } from '../client/jetyum/js/camera.js';
import { ClientWorld } from '../client/jetyum/js/world.js';
import { buildDrawList, forEachTileInDrawOrder, summarize, DRAW } from '../client/jetyum/js/drawlist.js';
import { paletteColor, darker, PALETTE_SIZE, createProvider, ProceduralProvider } from '../client/jetyum/js/sprites.js';
import { accionDe, teclaDe, TECLAS } from '../client/jetyum/js/hotkeys.js';
import { scale2xDatos, bilineal2xDatos, modoValido } from '../client/jetyum/js/suavizado.js';

// El protocolo es el mismo archivo que usa el motor, y es CommonJS-friendly: se
// carga con require para no depender de la ruta del montaje del servidor.
const require = createRequire(import.meta.url);
const P = require('../shared/js/protocol.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;

function ok(label, detail) {
    console.log('  \u001b[32mPASS\u001b[0m  ' + label + (detail ? '  \u001b[90m' + detail + '\u001b[0m' : ''));
}
function fail(label, detail) {
    failures += 1;
    console.log('  \u001b[31mFAIL\u001b[0m  ' + label + (detail ? '  ' + detail : ''));
}
function check(label, condition, detail) {
    if (condition) { ok(label, detail); } else { fail(label, detail); }
}
function section(title) {
    console.log('\n' + title);
}

/** Un mundo de cliente con un reloj controlado. */
function makeWorld(startTime) {
    const clock = { value: startTime === undefined ? 100000 : startTime };
    const world = new ClientWorld({ now: () => clock.value });
    return { world, clock };
}

/** Mete un tile en el mundo tal y como lo mandaría el motor. */
function tileMessage(x, y, z, ground, downIds, topIds) {
    const down = (downIds || []).map((id) => [id, 1, 0]);
    const top = (topIds || []).map((id) => [id, 1, 0]);
    const items = down.concat(top);
    return [P.SERVER.TILE_ADD, x, y, z, ground, down.length, items.length]
        .concat(items.reduce((flat, entry) => flat.concat(entry), []));
}

/**
 * Construye un mensaje de aparición de criatura.
 *
 * Existe porque el formato de este mensaje YA CAMBIÓ una vez —al añadir el aspecto,
 * que pasó de un hueco a cinco campos— y todas las pruebas que lo escribían a mano
 * empezaron a leer el nombre donde estaba la cabeza. Poniéndolo en un sitio, el
 * próximo cambio es una edición y no una cacería.
 */
function creatureAdd(id, name, x, y, z, options) {
    const opts = options || {};

    return [
        P.SERVER.CREATURE_ADD,
        id,
        opts.lookType === undefined ? 21 : opts.lookType,
        opts.head === undefined ? 60 : opts.head,
        opts.body === undefined ? 60 : opts.body,
        opts.legs === undefined ? 60 : opts.legs,
        opts.feet === undefined ? 60 : opts.feet,
        opts.addons === undefined ? 0 : opts.addons,
        name,
        x, y, z,
        opts.direction === undefined ? 2 : opts.direction,
        opts.health === undefined ? 100 : opts.health,
        opts.kind === undefined ? 1 : opts.kind
    ];
}

function main() {
    console.log('Prueba de la lógica de dibujo del cliente (' + ROOT + ')');

    // =======================================================================
    section('1. El desplazamiento por planta (la mitad del 2.5D)');
    // =======================================================================

    check('la planta de la cámara no se desplaza',
        floorOffset(7, 7).x === 0 && floorOffset(7, 7).y === 0);

    // Una planta por ENCIMA se corre hacia arriba y a la izquierda (OTClient: coveredUp): así el
    // piso de arriba de una casa cae sobre lo alto de sus muros, que crecen hacia allí.
    check('una planta por encima se corre arriba-izquierda',
        floorOffset(6, 7).x === -1 && floorOffset(6, 7).y === -1,
        'planta 6 vista desde la 7: (-1, -1)');

    check('una planta por debajo se corre abajo-derecha',
        floorOffset(8, 7).x === 1 && floorOffset(8, 7).y === 1,
        'planta 8 vista desde la 7: (+1, +1)');

    check('el desplazamiento es proporcional a la diferencia de plantas',
        floorOffset(4, 7).x === -3 && floorOffset(11, 7).x === 4,
        'tres plantas arriba son -3; cuatro abajo son +4');

    {
        const camera = new Camera({ width: 320, height: 224, tileSize: TILE_PIXELS });
        camera.setCenter(40, 40, 7);

        const here = camera.worldToScreen(40, 40, 7);
        check('la casilla de la cámara cae en el centro del lienzo',
            here.x === 160 && here.y === 112,
            '(' + here.x + ', ' + here.y + ') con un lienzo de 320x224');

        const above = camera.worldToScreen(40, 40, 6);
        check('la misma casilla una planta arriba sale corrida un tile',
            above.x === 160 - TILE_PIXELS && above.y === 112 - TILE_PIXELS,
            'un tile es ' + TILE_PIXELS + ' px');

        const below = camera.worldToScreen(40, 40, 8);
        check('y una planta abajo, al contrario',
            below.x === 160 + TILE_PIXELS && below.y === 112 + TILE_PIXELS);

        const inverse = camera.screenToWorld(here.x + 4, here.y + 4, 7);
        check('la conversión inversa devuelve la misma casilla',
            inverse.x === 40 && inverse.y === 40,
            'de píxel a mundo y vuelta');

        // La planta de abajo necesita un rectángulo desplazado, o al mirarla se
        // vería un borde vacío por la derecha y por abajo.
        const rectHere = camera.visibleRect(7);
        const rectBelow = camera.visibleRect(8);
        check('el rectángulo visible de una planta de abajo se desplaza',
            rectBelow.x0 === rectHere.x0 - 1 && rectBelow.y0 === rectHere.y0 - 1,
            'sin esto se vería un borde vacío al mirar hacia abajo');
    }

    // =======================================================================
    section('2. El orden de dibujo dentro de una planta (la otra mitad)');
    // =======================================================================

    {
        const visited = [];
        forEachTileInDrawOrder({ x0: 0, y0: 0, x1: 2, y1: 2 }, (x, y) => {
            visited.push(x + ',' + y);
        });

        check('se visitan todas las casillas del rectángulo',
            visited.length === 9 && new Set(visited).size === 9,
            visited.length + ' casillas de 3x3');

        // La regla: de la esquina de arriba a la izquierda hacia la de abajo a la
        // derecha. Es lo que hace que lo que está más abajo en pantalla se pinte
        // después y tape al muñeco que tiene detrás.
        const sums = visited.map((k) => {
            const parts = k.split(',');
            return Number(parts[0]) + Number(parts[1]);
        });
        let nonDecreasing = true;
        for (let index = 1; index < sums.length; index += 1) {
            if (sums[index] < sums[index - 1]) { nonDecreasing = false; break; }
        }
        check('la suma x+y nunca retrocede',
            nonDecreasing, 'diagonales: ' + sums.join(','));

        check('la primera casilla es la de arriba a la izquierda',
            visited[0] === '0,0');
        check('y la última la de abajo a la derecha',
            visited[visited.length - 1] === '2,2');

        // Dentro de una diagonal se avanza en x y se retrocede en y.
        const diagonalThird = visited.filter((k) => {
            const parts = k.split(',');
            return Number(parts[0]) + Number(parts[1]) === 2;
        });
        check('dentro de una diagonal se avanza de izquierda a derecha',
            diagonalThird.join(' ') === '0,2 1,1 2,0',
            diagonalThird.join(' '));
    }

    {
        // Entre plantas: de la más profunda a la más alta, porque las de arriba se
        // pintan después y tienen que tapar a las de abajo.
        const { world } = makeWorld();
        world.apply([
            tileMessage(10, 10, 7, 102),
            tileMessage(10, 10, 6, 103),
            tileMessage(10, 10, 8, 104)
        ], P);

        check('el cliente ordena las plantas de la más profunda a la más alta',
            world.floors().join(',') === '8,7,6',
            'plantas recibidas: ' + world.floors().join(', '));
    }

    // =======================================================================
    section('3. Dentro de un tile: suelo, items de abajo, criaturas, items de arriba');
    // =======================================================================

    {
        const { world } = makeWorld();
        world.playerId = 1;

        // Un tile con un item abajo (muro) y uno arriba (barandilla), y una
        // criatura encima.
        world.apply([
            tileMessage(20, 20, 7, 102, [111], [112]),
            creatureAdd(5, 'Rata', 20, 20, 7)
        ], P);

        const camera = new Camera({ width: 320, height: 224 });
        camera.setCenter(20, 20, 7);

        const ops = buildDrawList(world, camera);
        const kinds = ops.map((op) => op.kind === DRAW.ITEM
            ? 'item' + op.typeId : op.kind);

        check('el suelo va primero, luego el item de abajo, luego la criatura, luego el de arriba',
            kinds.join(' -> ') === 'ground -> item111 -> creature -> item112',
            kinds.join(' -> '));

        check('y el corte entre abajo y arriba lo decidio el motor, no el cliente',
            world.getTile(20, 20, 7).downCount === 1,
            'el cliente solo obedece el numero que le llegó');
    }

    // =======================================================================
    section('4. El cliente NO se inventa lo que no ha recibido');
    // =======================================================================

    {
        const { world } = makeWorld();
        const camera = new Camera({ width: 320, height: 224 });
        camera.setCenter(40, 40, 7);

        let ops = buildDrawList(world, camera);
        check('sin haber recibido nada, no hay nada que dibujar',
            ops.length === 0, ops.length + ' operaciones');

        world.apply([tileMessage(40, 40, 7, 102)], P);
        ops = buildDrawList(world, camera);

        check('con un solo tile recibido, se dibuja una sola cosa',
            ops.length === 1 && ops[0].kind === DRAW.GROUND,
            'el mundo del cliente son 1 tile y el motor manda 1 tile');

        // Se pide un rectángulo enorme y el cliente sigue dibujando lo que tiene.
        camera.setViewport(3200, 3200);
        ops = buildDrawList(world, camera);
        check('un rectángulo enorme no hace aparecer terreno inventado',
            ops.length === 1,
            'el cliente NO rellena los huecos: lo que no llega no existe');

        world.apply([[P.SERVER.TILE_REMOVE, 40, 40, 7]], P);
        ops = buildDrawList(world, camera);
        check('y al borrarlo el motor, desaparece',
            ops.length === 0);
    }

    // =======================================================================
    section('5. Interpolación de las criaturas que se mueven');
    // =======================================================================

    {
        const { world, clock } = makeWorld(1000);
        world.playerId = 99;

        world.apply([
            tileMessage(30, 30, 7, 102),
            tileMessage(30, 31, 7, 102),
            creatureAdd(7, 'Rata', 30, 30, 7)
        ], P);

        const rat = world.creatures.get(7);
        check('la criatura empieza quieta',
            world.creaturePosition(rat).x === 30 && world.creaturePosition(rat).moving === false);

        // Se mueve de (30,30) a (30,31) en 550 ms.
        world.apply([
            [P.SERVER.CREATURE_MOVE, 7, 30, 30, 7, 30, 31, 7, 2, 550]
        ], P);

        const at0 = world.creaturePosition(rat, 1000);
        check('recién empezado el paso, está en el origen',
            at0.x === 30 && at0.y === 30 && at0.moving === true,
            'la posición la calcula el cliente, pero la DURACIÓN la puso el motor');

        const atHalf = world.creaturePosition(rat, 1275);
        check('a mitad del paso, está a mitad de camino',
            Math.abs(atHalf.y - 30.5) < 0.001 && atHalf.moving === true,
            'y = ' + atHalf.y + ' a los 275 ms de 550');

        const atEnd = world.creaturePosition(rat, 1550);
        check('pasado el tiempo, está en el destino',
            atEnd.y === 31 && atEnd.moving === false);

        // Cerrar el movimiento es un paso EXPLÍCITO. Antes lo hacía la propia
        // consulta de la posición, como efecto secundario, y eso significaba que la
        // posición lógica sólo avanzaba si alguien la había consultado: en una
        // prueba sin renderer, los muñecos se quedaban a medio camino para siempre.
        const closed = world.update(1550);
        check('cerrar el movimiento es un paso explícito',
            closed === 1 && rat.x === 30 && rat.y === 31 && rat.moving === null,
            'deja de interpolarse y pasa a ocupar la casilla nueva');

        // La posición interpolada se usa para DIBUJAR, pero el orden de la pila usa
        // la casilla lógica: si no, la criatura cambiaría de capa a mitad de paso.
        //
        // El reloj se avanza ANTES de aplicar el movimiento: `startedAt` es el
        // instante en que llega el mensaje, así que sin avanzarlo el paso ya
        // estaría terminado cuando se le pregunta por la mitad.
        clock.value = 2000;
        world.apply([[P.SERVER.CREATURE_MOVE, 7, 30, 31, 7, 30, 32, 7, 2, 550]], P);

        const camera = new Camera({ width: 320, height: 224 });
        camera.setCenter(30, 31, 7);

        const mid = buildDrawList(world, camera, { now: 2275 });
        const creatureOp = mid.find((op) => op.kind === DRAW.CREATURE);

        check('la criatura se dibuja en su posición interpolada',
            creatureOp && Math.abs(creatureOp.sy - (112 + TILE_PIXELS * 0.5)) < 1,
            creatureOp ? 'y = ' + creatureOp.sy + ' px, media casilla por debajo ' +
                'del centro: entre dos casillas, no saltando de una a otra'
                : 'no se dibujo la criatura');

        check('pero su sitio en la pila sigue siendo la casilla de ORIGEN',
            creatureOp && creatureOp.y === 31,
            'el sprite se desliza, la capa no cambia a mitad de camino');
    }

    // =======================================================================
    section('6. El jugador propio se interpola como los demás');
    // =======================================================================

    {
        const { world, clock } = makeWorld(1000);
        world.apply([
            [P.SERVER.LOGIN_OK, 42, 'Yo', 50, 50, 7, 150, 150, 1, 0, 'None'],
            tileMessage(50, 50, 7, 102),
            tileMessage(50, 51, 7, 102)
        ], P);

        check('el jugador se identifica a si mismo',
            world.playerId === 42 && world.player.name === 'Yo');

        world.apply([creatureAdd(42, 'Yo', 50, 50, 7, { kind: 0 })], P);
        const me = world.creatures.get(42);
        check('y se reconoce como tal', me.isPlayer === true);

        clock.value = 2000;
        world.apply([[P.SERVER.CREATURE_MOVE, 42, 50, 50, 7, 50, 51, 7, 2, 550]], P);

        const half = world.creaturePosition(me, 2275);
        check('su movimiento SI se interpola, como el de cualquier criatura',
            Math.abs(half.y - 50.5) < 0.001 && half.moving === true,
            'y = ' + half.y + ': el muñeco se desliza y el mundo con él');

        const done = world.creaturePosition(me, 2550);
        check('y al terminar ocupa la casilla nueva',
            done.y === 51 && done.moving === false);
    }

    // =======================================================================
    section('7. Cambio de planta y mensajes desconocidos');
    // =======================================================================

    {
        const { world } = makeWorld();
        world.apply([tileMessage(10, 10, 7, 102)], P);
        check('hay un tile antes del cambio de planta', world.tiles.size === 1);

        world.apply([[P.SERVER.FLOOR_CHANGE, 8]], P);
        check('el cambio de planta vacía lo anterior',
            world.tiles.size === 0 && world.creatures.size === 0,
            'sin esto quedarian tiles de la planta vieja dibujandose encima');

        world.apply([tileMessage(10, 10, 8, 104)], P);
        check('y a partir de ahi se recibe la planta nueva',
            world.getTile(10, 10, 8) !== null && world.getTile(10, 10, 7) === null);
    }

    {
        const { world } = makeWorld();
        const before = world.tiles.size;

        // Un opcode que este cliente no conoce. Ignorarlo es lo que permite que el
        // motor añada mensajes sin obligar a actualizar todos los clientes.
        const result = world.apply([[0x7E, 1, 2, 3]], P);

        check('un opcode desconocido se ignora sin romper nada',
            world.tiles.size === before && result.tiles === 0,
            'el motor puede añadir mensajes sin romper clientes viejos');
    }

    // =======================================================================
    section('8. Resumen de la lista de dibujo');
    // =======================================================================

    {
        const { world } = makeWorld();
        world.playerId = 1;

        const messages = [];
        for (let y = 30; y < 34; y += 1) {
            for (let x = 30; x < 34; x += 1) {
                messages.push(tileMessage(x, y, 7, 102, x === 31 ? [111] : [], []));
            }
        }
        messages.push(creatureAdd(3, 'Rata', 32, 32, 7, { health: 50 }));
        world.apply(messages, P);

        const camera = new Camera({ width: 320, height: 224 });
        camera.setCenter(31, 31, 7);

        const ops = buildDrawList(world, camera);
        const summary = summarize(ops);

        check('el resumen cuenta lo que hay',
            summary.ground === 16 && summary.items === 4 && summary.creatures === 1,
            JSON.stringify(summary));

        check('y la lista esta ordenada por planta y luego por diagonal',
            summary.floors.length === 1 && summary.floors[0] === 7);

        // El orden de las operaciones de suelo debe seguir las diagonales.
        const groundSums = ops.filter((op) => op.kind === DRAW.GROUND)
            .map((op) => op.x + op.y);
        let ordered = true;
        for (let index = 1; index < groundSums.length; index += 1) {
            if (groundSums[index] < groundSums[index - 1]) { ordered = false; break; }
        }
        check('las casillas se pintan en orden de diagonal',
            ordered, 'sumas: ' + groundSums.join(','));
    }

    // =======================================================================
    section('9. La paleta de los aspectos');
    // =======================================================================

    {
        // La paleta es un ASSET DEL CLIENTE, igual que los sprites: el motor manda un
        // índice y el cliente lo resuelve. Aquí se comprueba lo que tiene que cumplir
        // una paleta para que el sistema funcione, no qué color es cada índice.
        check('un índice da siempre el mismo color',
            paletteColor(78) === paletteColor(78) &&
            paletteColor(0) === paletteColor(0),
            'si no, el mismo aspecto se vería distinto en cada fotograma');

        check('índices distintos dan colores distintos',
            paletteColor(78) !== paletteColor(79) &&
            paletteColor(10) !== paletteColor(100),
            'si no, cambiarse de aspecto no se notaría');

        check('todos los índices del rango dan un color',
            (() => {
                for (let index = 0; index < PALETTE_SIZE; index += 1) {
                    const color = paletteColor(index);
                    if (!color || color.indexOf('hsl') !== 0 && color.indexOf('#') !== 0) {
                        return false;
                    }
                }
                return true;
            })(),
            PALETTE_SIZE + ' colores, que es el rango que el motor acota');

        check('un índice fuera de rango no rompe la paleta',
            paletteColor(-5) === paletteColor(0) &&
            paletteColor(9999) === paletteColor(PALETTE_SIZE - 1),
            'el motor ya lo acota, pero el cliente no se cae si le llega mal');

        check('el color oscuro de un color lo es de verdad',
            darker(paletteColor(78)) !== paletteColor(78) &&
            darker('no soy un color').indexOf('rgba') === 0,
            'y con algo que no es un color devuelve una sombra, no basura');

        // Y el aspecto llega hasta la lista de dibujo, que es lo que hace que el
        // renderer pueda pintarlo.
        //
        // Se manda TAMBIÉN EL TILE, porque el motor siempre manda los dos: el cliente
        // no dibuja criaturas sobre casillas que no tiene. Si sólo se mandara la
        // criatura, la lista de dibujo no la incluiría, y eso no sería un fallo sino la
        // consecuencia de que el cliente sólo dibuja lo que ha recibido.
        const { world } = makeWorld();
        world.apply([
            tileMessage(20, 20, 7, 102),
            creatureAdd(4, 'Vestido', 20, 20, 7, {
                lookType: 130, head: 100, body: 50, legs: 20, feet: 3,
                addons: 3, kind: 0
            })
        ], P);

        const camera = new Camera({ width: 320, height: 224 });
        camera.setCenter(20, 20, 7);

        const ops = buildDrawList(world, camera);
        const creatureOp = ops.find((op) => op.kind === DRAW.CREATURE);

        check('el aspecto llega hasta la lista de dibujo',
            creatureOp && creatureOp.outfit.lookType === 130 &&
            creatureOp.outfit.head === 100 && creatureOp.outfit.addons === 3,
            'el orden de dibujo no lo interpreta: sólo lo transporta');
    }

    // =======================================================================
    // =======================================================================
    section('10. El dibujo cae DENTRO del lienzo');
    // =======================================================================

    {
        /*
         * ESTA SECCION EXISTE POR UN FALLO QUE NINGUNA OTRA PODIA VER.
         *
         * `camera.worldToScreen` centra sumando media pantalla, y el renderer volvia a
         * desplazar el lienzo otra media pantalla. Las dos piezas eran correctas y estaban
         * comprobadas por separado; el error estaba en la SUMA de las dos, y el sintoma era
         * una pantalla negra con un trozo de mapa en la esquina inferior derecha.
         *
         * Lo que se comprueba aqui es que el DESTINO FINAL cae donde tiene que caer, que es
         * la unica forma de ver un desplazamiento contado dos veces.
         */
        const ANCHO = 1520;
        const ALTO = 780;
        const cam = new Camera({ width: ANCHO, height: ALTO });
        cam.setCenter(41, 40, 7);

        // El desplazamiento del renderer, que solo debe alinear la rejilla al pixel.
        const origenX = cam.width / 2 - cam.centerX * cam.tileSize;
        const origenY = cam.height / 2 - cam.centerY * cam.tileSize;
        const desplazamiento = {
            x: -(origenX - Math.floor(origenX)),
            y: -(origenY - Math.floor(origenY))
        };

        const centro = cam.worldToScreen(41, 40, 7);
        const destino = { x: centro.x + desplazamiento.x, y: centro.y + desplazamiento.y };

        check('lo que senala la camara cae en el CENTRO del lienzo',
            Math.abs(destino.x - ANCHO / 2) <= 1 && Math.abs(destino.y - ALTO / 2) <= 1,
            'destino (' + destino.x.toFixed(1) + ', ' + destino.y.toFixed(1) + ') de un ' +
            'lienzo de ' + ANCHO + 'x' + ALTO);

        check('y el desplazamiento viejo SI lo sacaba',
            centro.x + ANCHO / 2 >= ANCHO && centro.y + ALTO / 2 >= ALTO,
            'la formula vieja sumaba media pantalla, asi que el centro caia justo en el ' +
            'borde inferior derecho (' + (centro.x + ANCHO / 2) + ', ' +
            (centro.y + ALTO / 2) + ') y el resto del mapa quedaba fuera');

        // El desplazamiento solo quita la parte fraccionaria, asi que nunca llega a un pixel.
        check('el desplazamiento es de alineacion, no de centrado',
            Math.abs(desplazamiento.x) < 1 && Math.abs(desplazamiento.y) < 1,
            'medir ' + desplazamiento.x.toFixed(2) + ' px es alinear; medir media pantalla ' +
            'es centrar, y centrar ya lo hace worldToScreen');

        // Con la camara en coordenadas enteras no hay nada que alinear.
        check('una camara en coordenadas enteras no necesita alineacion',
            desplazamiento.x === 0 && desplazamiento.y === 0,
            'el suelo queda en pixeles enteros sin tocar nada');
    }

    // =======================================================================
    section('11. Los proveedores de dibujos');
    // =======================================================================

    {
        /*
         * EL JUEGO Y EL EDITOR DIBUJAN CON LOS ASSETS (things.json y sus hojas). El juego no
         * quiere respaldo: mientras un dibujo no ha llegado no pinta nada (un dibujo provisional
         * se veía como rayas al entrar). El editor sí: lo que no tiene dibujo sale como un
         * rectángulo de color en vez de desaparecer de la paleta.
         */
        const juego = createProvider({ provider: 'assets', sinRespaldo: true });
        const editor = createProvider({ provider: 'assets' });
        check('el juego dibuja con los assets y sin respaldo', juego.constructor.name === 'AssetsProvider' && juego.respaldo === null);
        check('el editor, con el de procedimiento detrás', editor.respaldo instanceof ProceduralProvider);
        check('un nombre que no existe no deja el cliente sin dibujos: el de procedimiento',
            createProvider({ provider: 'no-existe' }) instanceof ProceduralProvider);
    }

    // =======================================================================
    section('12. El inventario: que esta puesto y que esta dentro de la mochila');
    // =======================================================================

    {
        /*
         * EL MOTOR MANDA LA RANURA DE CADA COSA, y el cliente solo la obedece. La ranura de lo que
         * va DENTRO de la mochila es `inside` -ver `SLOT_INSIDE`-, y todo lo demas esta puesto.
         *
         * Esta comprobacion existe porque esa frontera se movio: antes la mochila y su contenido
         * compartian el nombre `backpack`, asi que el cliente no podia distinguir el contenedor de
         * lo que llevaba dentro. Si el cliente se quedara con el nombre viejo, la mochila se
         * pintaria como si estuviera dentro de si misma.
         */
        const { world } = makeWorld();

        const entradas = [
            [0, 2412, 1, 'backpack', 'backpack'],
            [1, 3031, 25, 'gold coin', 'inside'],
            [2, 2400, 1, 'magic sword', 'hand']
        ];

        const mensaje = [P.SERVER.INVENTORY, entradas.length, 1900, 40500]
            .concat(entradas.reduce((todo, entrada) => todo.concat(entrada), []));

        world.apply([mensaje], { SERVER: P.SERVER, CLIENT: P.CLIENT });

        const porRanura = {};
        world.inventory.forEach((entrada) => { porRanura[entrada.slot] = entrada; });

        check('la ranura de cada entrada llega tal cual, y el cliente no la deduce',
            world.inventory.length === 3 &&
            porRanura.backpack.typeId === 2412 &&
            porRanura.inside.typeId === 3031 &&
            porRanura.hand.typeId === 2400,
            world.inventory.map((e) => e.slot + ':' + e.name).join(', '));

        check('y solo lo que tiene ranura de equipo cuenta como puesto',
            porRanura.backpack.equipped === true &&
            porRanura.hand.equipped === true &&
            porRanura.inside.equipped === false,
            'la mochila esta puesta, la espada tambien, y las monedas estan DENTRO de la mochila');

        check('y el peso viaja en el mismo mensaje',
            world.weight === 1900 && world.capacity === 40500,
            'lo que llevas y lo que te cabe son la misma pregunta');
    }

    section('13. Las hotkeys');
    {
        const quien = { yo: 7, objetivo: 42 };
        check('24 teclas: F1-F12 y Shift+F1-F12', TECLAS.length === 24 && TECLAS[0] === 'F1' && TECLAS[23] === 'Shift+F12');
        check('la tecla de un evento', teclaDe({ key: 'F5' }) === 'F5' && teclaDe({ key: 'F12', shiftKey: true }) === 'Shift+F12' &&
            teclaDe({ key: 'a' }) === null);
        check('una magia se dice (o se escribe en el chat si no es al momento)',
            accionDe({ tipo: 'magia', texto: 'exura' }, quien).decir === 'exura' &&
            accionDe({ tipo: 'magia', texto: 'exori', auto: false }, quien).escribir === 'exori');
        check('un objeto en ti o en el objetivo',
            accionDe({ tipo: 'objeto', typeId: 2413, modo: 'yo' }, quien).en === 7 &&
            accionDe({ tipo: 'objeto', typeId: 2413, modo: 'objetivo' }, quien).en === 42);
        check('en el objetivo sin objetivo: aviso; y una tecla libre no hace nada',
            !!accionDe({ tipo: 'objeto', typeId: 2413, modo: 'objetivo' }, { yo: 7, objetivo: null }).aviso &&
            accionDe({}, quien) === null && accionDe({ tipo: 'magia', texto: '  ' }, quien) === null);
    }

    section('14. El suavizado de los píxeles');
    {
        // Una diagonal de 2x2 (rojo arriba a la izquierda y abajo a la derecha).
        const px = (datos, w, x, y) => Array.from(datos.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
        const diag = new Uint8ClampedArray(16);
        [0, 3].forEach((i) => diag.set([255, 0, 0, 255], i * 4));
        const g = scale2xDatos(diag, 2, 2);
        check('Scale2x dobla y redondea la diagonal sin mezclar colores',
            px(g, 4, 2, 1)[3] === 255 && px(g, 4, 1, 2)[3] === 255 && px(g, 4, 3, 0)[3] === 0 && px(g, 4, 0, 3)[3] === 0 &&
            [0, 1, 2, 3].every((y) => [0, 1, 2, 3].every((x) => [0, 255].includes(px(g, 4, x, y)[3]))));
        const liso = new Uint8ClampedArray(16).fill(200);
        check('un suelo liso sigue liso en los bordes (sin juntas entre casillas)',
            Array.from(scale2xDatos(liso, 2, 2)).every((v) => v === 200) && Array.from(bilineal2xDatos(liso, 2, 2)).every((v) => v === 200));
        const borde = new Uint8ClampedArray(8);
        borde.set([0, 0, 255, 255], 0);
        const b = bilineal2xDatos(borde, 2, 1);
        check('el bilineal funde el borde con lo transparente sin halo oscuro',
            px(b, 4, 1, 0)[3] > 0 && px(b, 4, 1, 0)[3] < 255 && px(b, 4, 1, 0)[2] === 255 && px(b, 4, 0, 0)[3] === 255);
        check('un modo desconocido es el de por defecto', modoValido('x') === 'pixel' && modoValido('suave') === 'suave');
    }

    console.log('');
    if (failures === 0) {
        console.log('\u001b[32mTodo OK\u001b[0m — el cliente ordena, desplaza y viste como debe.');
        process.exit(0);
    }
    console.log('\u001b[31m' + failures + ' comprobacion(es) fallaron\u001b[0m');
    process.exit(1);
}

main();
