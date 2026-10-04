'use strict';

/**
 * Prueba de las herramientas: el escritor de mapas, la edición de `items.xml` y el
 * API del editor.
 *
 * TODO SE HACE SOBRE COPIAS. Las pruebas trabajan en un directorio temporal con su
 * propio `items.xml` y su propio mapa, nunca sobre `data/`. Una prueba que escribiera
 * en el datapack de verdad estaría modificando el proyecto cada vez que se ejecuta, y
 * entonces un fallo de la prueba se convierte en un mapa roto y el fallo real queda
 * escondido detrás del daño que hizo la propia prueba.
 *
 * Uso:  node tools/test-tools.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ItemsFile = require('../editor/lib/itemsfile');
const MapWriter = require('../engine/world/writer');
const MapLoader = require('../engine/world/loader');
const Xml = require('../engine/data/xml');
const { Spawner } = require('../engine/world/spawner');
const {
    createToolsServer,
    applyEdits,
    applySpawns,
    applyNpcs,
    flagsFromNames,
    safeMapName,
    documentationKeys,
    loadMonsterTypes
} = require('../editor/server');
const { loadMap } = require('../engine/world/loader');

const ROOT = path.resolve(__dirname, '..');

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

/**
 * Un lienzo de mentira con un dibujo opaco dentro.
 *
 * `getImageData` devuelve un cuadro opaco del tamaño que se pida, que es lo que la
 * paleta mira para centrar el dibujo. El resto del lienzo es transparente.
 */
function lienzoFalso(ancho, alto, x0, y0, cajaAncho, cajaAlto) {
    const contexto = {
        pintados: [],
        clearRect() {},
        drawImage(lienzo, dx, dy) {
            this.pintados.push({ lienzo: lienzo, dx: dx, dy: dy });
        },
        getImageData(cx, cy, w, h) {
            const datos = new Uint8ClampedArray(w * h * 4);

            for (let y = 0; y < h; y += 1) {
                for (let x = 0; x < w; x += 1) {
                    const dentro = x >= x0 && x < x0 + cajaAncho && y >= y0 && y < y0 + cajaAlto;
                    datos[(y * w + x) * 4 + 3] = dentro ? 255 : 0;
                }
            }

            return { data: datos, width: w, height: h };
        }
    };

    return {
        width: ancho,
        height: alto,
        getContext() {
            return contexto;
        }
    };
}

/**
 * Un contexto de lienzo de mentira que APUNTA TODO lo que se le pide.
 *
 * POR QUÉ ASÍ Y NO COMPROBANDO PÍXELES. El dibujo del respawn es un fuego, y un fuego no se
 * puede comprobar comparando píxeles: cualquier retoque de forma lo pondría en rojo sin que nada
 * estuviera mal. Lo que sí es una decisión y hay que sujetar es lo demás: que el área se dibuje
 * con el radio del formato y en el sitio correcto, que el respawn sea MORADO y el NPC VERDE
 * —confundirlos es poner un monstruo donde se quería un tendero—, que el recuadro sea
 * discontinuo, y que la etiqueta diga lo que vive ahí.
 *
 * Un `Proxy` que devuelve un apuntador para cualquier método hace que esto no haya que
 * mantenerlo: el día que el dibujo use `ctx.ellipse`, la prueba ya lo está apuntando.
 */
function contextoFalso() {
    const ops = [];

    const base = {
        ops: ops,
        measureText(texto) {
            ops.push({ op: 'measureText', args: [texto] });
            return { width: String(texto).length * 6 };
        }
    };

    return new Proxy(base, {
        get(objetivo, propiedad) {
            if (propiedad in objetivo) {
                return objetivo[propiedad];
            }
            return (...args) => {
                ops.push({ op: String(propiedad), args: args });
            };
        },
        set(objetivo, propiedad, valor) {
            objetivo[propiedad] = valor;
            ops.push({ op: 'set:' + String(propiedad), args: [valor] });
            return true;
        }
    });
}

/** Los valores que se le asignaron a una propiedad del contexto (`fillStyle`, `lineWidth`...). */
function valoresDe(ops, propiedad) {
    return ops.filter((op) => op.op === 'set:' + propiedad).map((op) => op.args[0]);
}

/** Las llamadas a un método del contexto, en orden. */
function llamadas(ops, metodo) {
    return ops.filter((op) => op.op === metodo);
}

/**
 * La «firma» de una lista de respawns: centro, radio, intervalo y cada monstruo con su casilla.
 *
 * Es lo que permite comparar la lectura del MOTOR con la del EDITOR, que son dos módulos que no
 * pueden importarse entre sí (uno es CommonJS y el otro un módulo ES del navegador). Comparar
 * por firma y no por número es lo que hace que la comprobación valga: dos respawns cambiados de
 * sitio son el mismo recuento y un mapa distinto.
 */
function firmaDeAreas(areas) {
    return (areas || []).map((area) =>
        [area.x, area.y, area.z, area.radius, area.interval,
            (area.monsters || []).map((monstruo) =>
                [monstruo.name, monstruo.x, monstruo.y, monstruo.interval].join(':')).join('+')
        ].join('|')).join(' # ');
}

/** La firma de los NPC colocados: casilla, nombre y radio de paseo. */
function firmaDeNpcs(map) {
    return (map.npcPlacements || []).map((npc) =>
        [npc.x, npc.y, npc.z, npc.name, npc.radius].join(':')).sort().join('|');
}

/** Un `document` de mentira: lo justo para construir la paleta sin navegador. */function documentoFalso() {
    const crear = (etiqueta) => {
        const elemento = {
            tagName: String(etiqueta).toUpperCase(),
            hijos: [],
            dataset: {},
            className: '',
            textContent: '',
            hidden: false,
            width: 0,
            height: 0,
            classList: {
                clases: new Set(),
                add(clase) { this.clases.add(clase); },
                remove(clase) { this.clases.delete(clase); },
                toggle(clase, activo) {
                    if (activo) { this.clases.add(clase); } else { this.clases.delete(clase); }
                },
                contains(clase) { return this.clases.has(clase); }
            },
            appendChild(hijo) { this.hijos.push(hijo); return hijo; },
            addEventListener() {},
            querySelectorAll() { return []; }
        };

        if (etiqueta === 'canvas') {
            elemento.width = 32;
            elemento.height = 32;
            // El contexto se guarda: quien pinta y quien mide piden el mismo, y si
            // fueran dos, lo pintado no se podría comprobar.
            const contexto = lienzoFalso(32, 32, 0, 0, 0, 0).getContext('2d');
            contexto.lienzo = elemento;
            elemento.getContext = () => contexto;
        }

        return elemento;
    };

    return { createElement: crear };
}

/**
 * El CSS que hay dentro del `<style>` de una pagina, sin los comentarios.
 *
 * SE LEE EL TEXTO Y NO UN DOM, y es lo que hace que estas comprobaciones corran en cada
 * `npm test`: el editor se sirve tal cual, asi que el archivo es exactamente lo que ve el
 * navegador. Los comentarios se quitan antes de buscar reglas porque los comentarios de este CSS
 * NOMBRAN selectores (`.palette-item.hoja` aparece en la explicacion de al lado), y una regla
 * sacada de un comentario seria una regla que no existe.
 */
function cssDeLaPagina(html) {
    const bloque = /<style>([\s\S]*?)<\/style>/.exec(html);
    return bloque ? bloque[1].replace(/\/\*[\s\S]*?\*\//g, '') : '';
}

/** Las declaraciones de una regla del CSS, por su selector exacto, en un `Map`. */
function declaracionesCss(css, selector) {
    const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regla = new RegExp('(?:^|[},])\\s*' + escapado + '\\s*\\{([^}]*)\\}', 'm').exec(css);

    if (!regla) {
        return null;
    }

    const declaraciones = new Map();
    regla[1].split(';').forEach((linea) => {
        const corte = linea.indexOf(':');
        if (corte !== -1) {
            declaraciones.set(linea.slice(0, corte).trim(), linea.slice(corte + 1).trim());
        }
    });

    return declaraciones;
}

/** El primer numero con `px` de un valor del CSS, o `null` si no hay ninguno. */
function pxDe(valor) {
    const match = /(-?\d+(?:\.\d+)?)px/.exec(String(valor === undefined ? '' : valor));
    return match ? Number(match[1]) : null;
}

/**
 * El lado, en pixeles, al que se VE el dibujo de una casilla de la hoja.
 *
 * Es el ancho EFECTIVO, no el que declara una regla: si alguien vuelve a poner un
 * `.palette-item.hoja .palette-dibujo { width: 20px }` —que es como estaba— manda ese, porque es
 * mas especifico, y el lienzo de 32x32 se veria a 20. Comprobar solo la regla base daria verde con
 * el dibujo encogido.
 */
function ladoVisibleDeLaHoja(css) {
    const propia = declaracionesCss(css, '.palette-item.hoja .palette-dibujo');
    const base = declaracionesCss(css, '.palette-dibujo');

    return pxDe((propia && propia.get('width')) || (base && base.get('width')));
}

/** La rejilla de la hoja: cuantas columnas y cuanto descuenta el CSS por el hueco. */
function rejillaDeLaHoja(css) {
    const regla = declaracionesCss(css, '.palette-item.hoja');

    if (!regla) {
        return null;
    }

    // `flex: 0 0 calc(12.5% - 2px)` es «un octavo del ancho menos el hueco», que es la forma de
    // que ocho botones y sus siete huecos ocupen exactamente la fila.
    const match = /calc\(\s*([\d.]+)%\s*-\s*([\d.]+)px\s*\)/.exec(regla.get('flex') || '');

    if (!match) {
        return null;
    }

    return { columnas: 100 / Number(match[1]), descuento: Number(match[2]), minimo: pxDe(regla.get('min-width')) };
}

/** Un directorio de trabajo desechable con copias de lo que se va a editar. */
function makeWorkspace() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-tools-'));

    fs.mkdirSync(path.join(dir, 'world'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'items'), { recursive: true });

    fs.copyFileSync(
        path.join(ROOT, 'data', 'world', 'sample.map.json'),
        path.join(dir, 'world', 'prueba.map.json'));

    fs.copyFileSync(
        path.join(ROOT, 'data', 'items', 'items.xml'),
        path.join(dir, 'items', 'items.xml'));

    return {
        dir: dir,
        mapsDir: path.join(dir, 'world'),
        itemsFile: path.join(dir, 'items', 'items.xml'),
        mapFile: path.join(dir, 'world', 'prueba.map.json'),
        remove() {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    };
}

async function api(port, method, route, body) {
    const response = await fetch('http://127.0.0.1:' + port + route, {
        method: method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    let payload = null;
    try {
        payload = JSON.parse(text);
    } catch (error) {
        payload = { raw: text };
    }

    return { status: response.status, body: payload };
}

async function main() {
    console.log('Prueba de las herramientas (' + ROOT + ')');

    const workspace = makeWorkspace();
    const itemTypes = Xml.loadItems(workspace.itemsFile);

    // =======================================================================
    section('1. El escritor: ida y vuelta y almacenamiento disperso');
    // =======================================================================

    {
        const original = loadMap(workspace.mapFile, {
            itemTypes: itemTypes,
            monsterTypes: new Map([['Rat', {}]])
        });

        check('el mapa de partida carga', original.report.ok,
            original.map.stats().size + ', ' + original.map.stats().explicitTiles + ' tiles explicitos');

        const roundTrip = MapWriter.verifyRoundTrip(original.map, MapLoader.buildMap, {
            itemTypes: itemTypes,
            monsterTypes: new Map([['Rat', {}]])
        });

        check('cargar, escribir y volver a cargar da el mismo mapa',
            roundTrip.ok,
            roundTrip.ok ? 'sin diferencias' : roundTrip.problems.join('; '));

        const text = MapWriter.writeMap(original.map, { itemTypes: itemTypes });
        const data = JSON.parse(text);

        // LO IMPORTANTE DEL ESCRITOR: que no materialice el mapa. Si volcara todos los
        // tiles, el archivo pasaria de 2 KB a 67 millones de celdas en la primera
        // edicion, y el almacenamiento disperso del motor se perderia al guardar.
        check('no se escriben los tiles que son suelo por defecto',
            data.tiles.length === original.map.stats().explicitTiles,
            data.tiles.length + ' tiles escritos de ' +
            original.map.stats().cellsIfMaterialized.toLocaleString('es-ES') + ' celdas posibles');

        check('y el archivo sigue siendo pequeno',
            text.length < 8000,
            text.length + ' bytes frente a los ' +
            original.map.stats().cellsIfMaterialized.toLocaleString('es-ES') +
            ' que ocuparia materializado');

        // Los valores por defecto se omiten: un item con cantidad 1 no lleva `count`.
        const oneItem = data.tiles.find((tile) => tile.items && tile.items.length === 1);
        check('los valores por defecto se omiten al escribir',
            oneItem && oneItem.items[0].count === undefined,
            'un item de cantidad 1 se escribe solo con su id: ' +
            JSON.stringify(oneItem.items[0]));

        // Y una cantidad distinta SI se escribe, que es lo que hace que omitir sea
        // seguro.
        const stacked = data.tiles.find((tile) =>
            tile.items && tile.items.some((item) => item.count !== undefined));
        check('pero una cantidad distinta de 1 si se escribe',
            stacked !== undefined,
            stacked ? JSON.stringify(stacked.items) : 'no se encontro ninguno');

        check('las banderas se escriben por nombre',
            data.tiles.some((tile) => tile.flags && tile.flags.indexOf('protectionZone') !== -1),
            'para que el archivo se pueda leer sin saber numeros de bit');

        check('las claves de documentacion se conservan si se piden',
            MapWriter.writeMap(original.map, {
                itemTypes: itemTypes,
                extraKeys: { _comment: ['no borrar'] }
            }).indexOf('no borrar') !== -1,
            'si no, abrir un mapa en el editor borraria sus comentarios sin avisar');
    }

    {
        // Un mapa con un suelo distinto al de su planta tiene que conservarlo.
        const loaded = loadMap(workspace.mapFile, { itemTypes: itemTypes });
        const charco = loaded.map.getTile(20, 20, 7);

        check('el mapa de ejemplo tiene un suelo distinto al de su planta',
            charco && charco.ground && charco.ground.typeId === 105,
            'un charco con groundSpeed 300');

        const data = JSON.parse(MapWriter.writeMap(loaded.map, { itemTypes: itemTypes }));
        const written = data.tiles.find((tile) => tile.x === 20 && tile.y === 20);

        check('y el escritor lo escribe en vez de darlo por defecto',
            written && written.ground === 105,
            'omitirlo lo perderia al guardar');
    }

    // =======================================================================
    section('2. Edicion quirurgica de items.xml');
    // =======================================================================

    {
        const xml = fs.readFileSync(workspace.itemsFile, 'utf8');
        const items = ItemsFile.readItems(xml);

        // El tope es el numero de bloques <item> que habia cuando se escribio la prueba.
        // Un `<item>` nuevo en el datapack no es un fallo del lector, asi que el numero
        // exacto solo servia para poner la prueba en rojo cada vez que se anadia un objeto.
        // Lo que hay que seguir cazando es lo contrario, que el lector se deje bloques por
        // el camino, y eso se comprueba abajo con un item concreto y con el rango.
        check('se leen todos los items del archivo',
            items.length >= 14,
            items.length + ' bloques <item>, ' + itemTypes.size + ' tipos resueltos');

        const rata = items.find((item) => item.id === 111);
        check('y se leen sus atributos',
            rata && rata.name === 'stone wall' && rata.attributes.blocksSolid === 1,
            JSON.stringify(rata.attributes));

        const range = items.find((item) => item.isRange === true);
        check('los items por rango se reconocen como tales',
            range && range.fromid === 1950 && range.toid === 1954,
            'fromid ' + range.fromid + ' a toid ' + range.toid);

        // --- Anadir ---
        const added = ItemsFile.saveItem(xml, {
            id: 9001,
            name: 'objeto de prueba',
            article: 'un',
            attributes: { pickupable: 1, weight: 25 }
        });

        check('se anade un item nuevo', added.action === 'added');

        const afterAdd = fs.writeFileSync(workspace.itemsFile + '.probe', added.xml, 'utf8');
        const reread = Xml.loadItems(workspace.itemsFile + '.probe');

        check('y el archivo resultante se puede leer',
            reread.get(9001) !== undefined &&
            reread.get(9001).name === 'objeto de prueba' &&
            reread.get(9001).attributes.weight === 25,
            'el motor lo veria como "' + reread.get(9001).name + '"');
        fs.unlinkSync(workspace.itemsFile + '.probe');

        // --- Sustituir ---
        const replaced = ItemsFile.saveItem(added.xml, {
            id: 9001,
            name: 'objeto cambiado',
            attributes: { pickupable: 1 }
        });

        check('se sustituye un item que ya existe', replaced.action === 'replaced');

        const afterReplace = ItemsFile.readItems(replaced.xml);
        check('y no se duplica',
            afterReplace.filter((item) => item.id === 9001).length === 1 &&
            afterReplace.length === items.length + 1,
            afterReplace.length + ' items, uno de ellos el cambiado');

        fs.writeFileSync(workspace.itemsFile + '.probe', replaced.xml, 'utf8');
        check('y el archivo sigue siendo valido tras sustituir',
            Xml.loadItems(workspace.itemsFile + '.probe').get(9001).name === 'objeto cambiado');
        fs.unlinkSync(workspace.itemsFile + '.probe');

        // --- Borrar ---
        const deleted = ItemsFile.deleteItem(replaced.xml, 9001);
        check('se borra un item', deleted.action === 'deleted');

        const afterDelete = ItemsFile.readItems(deleted.xml);
        check('y el archivo vuelve a tener los de antes',
            afterDelete.length === items.length &&
            afterDelete.find((item) => item.id === 9001) === undefined,
            afterDelete.length + ' items');

        check('borrar algo que no existe no rompe nada',
            ItemsFile.deleteItem(xml, 999999).action === 'notFound');

        // --- LO IMPORTANTE: que no se pierda el resto del archivo ---
        // Se buscan cadenas que existan DE VERDAD en el archivo. La primera version de
        // esta comprobacion buscaba una frase que cruzaba un salto de linea, y por eso
        // fallaba aunque los comentarios estuvieran intactos.
        check('los comentarios del archivo sobreviven a una edicion',
            added.xml.indexOf('FLAG_ALWAYSONTOP') !== -1 &&
            added.xml.indexOf('binarias viven en') !== -1 &&
            added.xml.indexOf('conviene no confundir') !== -1,
            'por eso se edita el texto en vez de reescribir el archivo entero');

        check('y el orden de los items no cambia',
            ItemsFile.readItems(added.xml).slice(0, 3).map((item) => item.id).join(',') ===
            items.slice(0, 3).map((item) => item.id).join(','),
            'un archivo reordenado entero llena el control de versiones de ruido');
    }

    // =======================================================================
    section('3. Aplicar ediciones a un mapa');
    // =======================================================================

    {
        const loaded = loadMap(workspace.mapFile, { itemTypes: itemTypes });
        const before = loaded.map.stats().explicitTiles;

        // Pintar un muro donde no habia nada.
        const applied = applyEdits(loaded.map, [
            { x: 50, y: 50, z: 7, items: [{ id: 111 }] }
        ], itemTypes);

        check('se puede pintar un item en una celda vacia',
            applied.changed === 1 && applied.problems.length === 0 &&
            loaded.map.getTile(50, 50, 7) !== null,
            loaded.map.getTile(50, 50, 7).downItems.length + ' item(s) en (50,50)');

        check('y el mapa tiene un tile mas',
            loaded.map.stats().explicitTiles === before + 1);

        // Una edicion dice COMO DEBE QUEDAR el tile, no que hay que anadir. Aplicarla
        // dos veces tiene que dar lo mismo.
        applyEdits(loaded.map, [{ x: 50, y: 50, z: 7, items: [{ id: 111 }] }], itemTypes);
        check('aplicar la misma edicion dos veces no acumula',
            loaded.map.getTile(50, 50, 7).downItems.length === 1,
            'la edicion describe el estado final, no un incremento');

        // Borrar: una edicion sin nada devuelve el tile a suelo por defecto.
        const erased = applyEdits(loaded.map, [{ x: 50, y: 50, z: 7 }], itemTypes);
        check('una edicion vacia borra el tile',
            erased.changed === 1 && loaded.map.getTile(50, 50, 7) === null &&
            loaded.map.stats().explicitTiles === before,
            'y vuelve a ser suelo por defecto, no un agujero');

        // Un suelo distinto al de la planta se puede pintar.
        applyEdits(loaded.map, [{ x: 51, y: 50, z: 7, ground: 105 }], itemTypes);
        check('se puede pintar otro suelo',
            loaded.map.getTile(51, 50, 7).ground.typeId === 105);

        // --- Lo que tiene que rechazar ---
        const badItem = applyEdits(loaded.map, [
            { x: 52, y: 50, z: 7, items: [{ id: 999999 }] }
        ], itemTypes);
        check('se rechaza un item que no existe',
            badItem.problems.length > 0 && /999999/.test(badItem.problems[0]),
            badItem.problems[0]);

        const badFlag = applyEdits(loaded.map, [
            { x: 52, y: 50, z: 7, flags: ['banderaInventada'] }
        ], itemTypes);
        check('se rechaza una bandera que no existe',
            badFlag.problems.length > 0 && /banderaInventada/.test(badFlag.problems[0]),
            badFlag.problems[0]);

        const outOfBounds = applyEdits(loaded.map, [
            { x: 9999, y: 9999, z: 7, items: [{ id: 111 }] }
        ], itemTypes);
        check('se rechaza una edicion fuera del mapa',
            outOfBounds.problems.length > 0 && /fuera del mapa/.test(outOfBounds.problems[0]),
            outOfBounds.problems[0]);

        const badGround = applyEdits(loaded.map, [
            { x: 52, y: 50, z: 7, ground: 99999 }
        ], itemTypes);
        check('se rechaza un suelo que no existe',
            badGround.problems.length > 0,
            badGround.problems[0]);

        check('las banderas se traducen de nombre a bits',
            flagsFromNames(['protectionZone', 'noPvp']).bits === 3 &&
            flagsFromNames(['protectionZone', 'noPvp']).unknown.length === 0,
            'protectionZone es el bit 1 y noPvp el 2');

        check('una bandera desconocida se señala en vez de ignorarse',
            flagsFromNames(['protectionZone']).unknown.indexOf('noExiste') === -1 &&
            flagsFromNames(['noExiste']).unknown.length === 1,
            'ignorarla dejaria un mapa que parece correcto y no lo esta');
    }

    // =======================================================================
    section('4. El API del editor');
    // =======================================================================

    const tools = createToolsServer({
        port: 0,
        mapsDir: workspace.mapsDir,
        itemsFile: workspace.itemsFile,
        logger: { info() {}, warning() {}, error() {} }
    });

    const port = await tools.ready;

    check('el servidor de herramientas escucha', port > 0, 'puerto ' + port);

    {
        const status = await api(port, 'GET', '/api/status');
        check('el estado informa de items y mapas',
            status.status === 200 && status.body.items > 0 && status.body.maps === 1,
            status.body.items + ' items, ' + status.body.maps + ' mapa(s)');

        const maps = await api(port, 'GET', '/api/maps');
        check('se listan los mapas',
            maps.status === 200 && maps.body.maps.length === 1 &&
            maps.body.maps[0].name === 'prueba' &&
            maps.body.maps[0].width === 64,
            JSON.stringify(maps.body.maps[0]));

        const map = await api(port, 'GET', '/api/map?name=prueba');
        check('se lee un mapa entero',
            map.status === 200 && map.body.raw.tiles.length > 0 &&
            map.body.stats.explicitTiles > 0,
            map.body.stats.size + ', ' + map.body.stats.explicitTiles + ' tiles explicitos');

        const missing = await api(port, 'GET', '/api/map?name=noExiste');
        check('un mapa que no existe da 404', missing.status === 404);

        const badName = await api(port, 'GET', '/api/map?name=../../server/config');
        check('un nombre de mapa con barras se rechaza',
            badName.status === 400,
            'sin esto se podria leer cualquier archivo del proyecto');

        check('el nombre de mapa se valida con una lista blanca',
            safeMapName('prueba') === 'prueba' &&
            safeMapName('../secreto') === null &&
            safeMapName('con espacio') === null,
            'solo letras, numeros, guion y guion bajo');

        const items = await api(port, 'GET', '/api/items');
        check('se leen los items',
            items.status === 200 && items.body.items.length > 0 &&
            items.body.attributeKeys.length > 0,
            items.body.items.length + ' items y ' +
            items.body.attributeKeys.length + ' claves de atributo conocidas');
    }

    {
        // --- Guardar una edicion de verdad ---
        const before = JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8'));

        const edit = await api(port, 'POST', '/api/map', {
            name: 'prueba',
            edits: [{ x: 55, y: 55, z: 7, items: [{ id: 111 }] }]
        });

        check('el API aplica y guarda una edicion',
            edit.status === 200 && edit.body.ok === true && edit.body.changed === 1,
            edit.body.stats ? edit.body.stats.explicitTiles + ' tiles explicitos' : '');

        const after = JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8'));
        const written = after.tiles.find((tile) => tile.x === 55 && tile.y === 55);

        check('y el archivo del mapa ha cambiado de verdad',
            written !== undefined && written.items[0].id === 111,
            'la edicion esta en el disco');

        check('el mapa guardado se puede volver a cargar',
            loadMap(workspace.mapFile, { itemTypes: itemTypes }).report.ok,
            'la ida y vuelta se comprueba ANTES de escribir: un fallo del escritor ' +
            'no puede llegar a sobrescribir el mapa bueno');

        check('y conserva los comentarios del original',
            after._comment !== undefined,
            'las claves que empiezan por _ se conservan');

        check('el archivo no ha crecido de forma desmedida',
            fs.statSync(workspace.mapFile).size < 12000,
            fs.statSync(workspace.mapFile).size + ' bytes');

        // --- Lo que tiene que rechazar ---
        const badEdit = await api(port, 'POST', '/api/map', {
            name: 'prueba',
            edits: [{ x: 56, y: 56, z: 7, items: [{ id: 999999 }] }]
        });
        check('un item inexistente se rechaza con 422', badEdit.status === 422,
            badEdit.body.problems ? badEdit.body.problems[0] : '');

        const afterBad = JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8'));
        check('y el mapa NO se ha tocado',
            afterBad.tiles.find((tile) => tile.x === 56 && tile.y === 56) === undefined,
            'un rechazo no puede dejar el archivo a medias');

        const dryRun = await api(port, 'POST', '/api/map', {
            name: 'prueba',
            dryRun: true,
            edits: [{ x: 57, y: 57, z: 7, items: [{ id: 111 }] }]
        });
        check('se puede simular un guardado sin escribir',
            dryRun.status === 200 && dryRun.body.dryRun === true,
            'util para comprobar antes de tocar el archivo');

        const afterDry = JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8'));
        check('y la simulacion no escribe nada',
            afterDry.tiles.find((tile) => tile.x === 57 && tile.y === 57) === undefined);
    }

    {
        // --- Items por el API ---
        const saved = await api(port, 'POST', '/api/items', {
            item: { id: 9100, name: 'cosa del api', attributes: { pickupable: 1 } }
        });

        check('el API guarda un item',
            saved.status === 200 && saved.body.action === 'added',
            'accion: ' + saved.body.action);

        check('y el archivo de items sigue siendo valido',
            Xml.loadItems(workspace.itemsFile).get(9100) !== undefined,
            'el motor veria "' + Xml.loadItems(workspace.itemsFile).get(9100).name + '"');

        const updated = await api(port, 'POST', '/api/items', {
            item: { id: 9100, name: 'cosa cambiada', attributes: {} }
        });
        check('y lo sustituye en vez de duplicarlo',
            updated.body.action === 'replaced' &&
            ItemsFile.readItems(fs.readFileSync(workspace.itemsFile, 'utf8'))
                .filter((item) => item.id === 9100).length === 1);

        // Un item sin id ni fromid no se puede guardar.
        const noId = await api(port, 'POST', '/api/items', { item: { name: 'sin id' } });
        check('un item sin id se rechaza', noId.status === 400, noId.body.error);

        check('y el archivo de items no se ha tocado',
            ItemsFile.readItems(fs.readFileSync(workspace.itemsFile, 'utf8'))
                .find((item) => item.name === 'sin id') === undefined);
    }

    // =======================================================================
    section('5. El editor: el suelo se sustituye, la pila se apila y la paleta lo enseña todo');
    // =======================================================================

    {
        /*
         * SE IMPORTAN LOS MÓDULOS DEL EDITOR TAL CUAL. `editor/js` está marcado como
         * módulos ES en su `package.json`, así que Node los carga igual que el
         * navegador: lo que se comprueba es el código que se ejecuta, no una copia que
         * se puede desincronizar. Los tres módulos que se importan aquí no tocan el DOM
         * a propósito —la aritmética de la escala, las reglas de la paleta y el mapa que
         * se edita—, que es justo lo que los hace comprobables sin abrir un navegador.
         */
        const { EditorMap } = await import('../editor/js/editormap.js');
        const Vista = await import('../editor/js/viewport.js');
        const Paleta = await import('../editor/js/palette.js');

        // Un mapa diminuto con los casos que importan: un item escrito como número, una
        // pila con cantidad, un suelo distinto al de la planta, una casilla con bandera.
        const crudo = {
            name: 'editor',
            width: 8, height: 8, floors: 2,
            defaultGround: { 0: 102, 1: 104 },
            fallbackGround: 102,
            tiles: [
                { x: 1, y: 1, z: 0, items: [111] },
                { x: 2, y: 1, z: 0, items: [{ id: 3031, count: 50 }] },
                { x: 3, y: 1, z: 0, ground: 105 },
                { x: 5, y: 1, z: 0, flags: ['protectionZone'] }
            ]
        };

        // --- Los items escritos como número suelto ---
        const mapa = new EditorMap(crudo, itemTypes);
        const muro = mapa.tileAt(1, 1, 0);

        check('el editor lee un item escrito como numero suelto',
            muro && muro.items.length === 1 && muro.items[0].id === 111,
            'en el mapa es `"items": [111]`, que es la forma corta del formato: ' +
            JSON.stringify(muro ? muro.items : null));

        const dibujable = mapa.getTile(1, 1, 0);
        check('y llega al dibujo con su identificador',
            dibujable && dibujable.items[0].id === 111 && dibujable.downCount === 1,
            'un item sin id no se dibuja y ademas hace fallar el guardado con "NaN"');

        // Sobre el mapa de verdad, que es donde estaba el problema: la ciudad tiene
        // cientos de items en forma corta.
        const ciudad = JSON.parse(fs.readFileSync(
            path.join(ROOT, 'tools', 'fixtures', 'ciudad-antigua.map.json'), 'utf8'));
        const mapaCiudad = new EditorMap(ciudad, itemTypes);

        let conId = 0;
        let sinId = 0;
        mapaCiudad.tiles.forEach((tile) => {
            tile.items.forEach((item) => {
                if (Number.isFinite(item.id)) { conId += 1; } else { sinId += 1; }
            });
        });

        check('y ningun item del mapa de la ciudad se queda sin identificador',
            sinId === 0 && conId > 1500,
            conId + ' items legibles, ' + sinId + ' ilegibles');

        // --- El suelo: se sustituye, no se apila ---
        const suelos = new EditorMap(crudo, itemTypes);

        check('la casilla de partida tiene un suelo distinto al de su planta',
            suelos.tileAt(3, 1, 0).ground === 105 && suelos.groundAt(3, 1, 0) === 105);

        suelos.paintGround(3, 1, 0, 104);
        suelos.paintGround(3, 1, 0, 103);

        const edicionSuelo = suelos.edits()
            .find((edicion) => edicion.x === 3 && edicion.y === 1 && edicion.z === 0);

        check('pintar un suelo encima de otro deja UNO solo, el ultimo',
            suelos.tileAt(3, 1, 0).ground === 103 &&
            suelos.groundAt(3, 1, 0) === 103 &&
            edicionSuelo.ground === 103,
            'el 105 y el 104 desaparecen: en el formato una casilla tiene un unico ' +
            '`ground`, y es sobre lo que se anda');

        suelos.paintGround(2, 1, 0, 104);
        check('y cambiar el suelo no se lleva los objetos de la casilla',
            suelos.tileAt(2, 1, 0).items.length === 1 &&
            suelos.tileAt(2, 1, 0).items[0].id === 3031 &&
            suelos.tileAt(2, 1, 0).items[0].count === 50,
            'una habitacion amueblada no puede perder los muebles por repintar el suelo');

        // Y el suelo viejo desaparece tambien en el archivo, que es lo que se guarda.
        const conSuelo = loadMap(workspace.mapFile, { itemTypes: itemTypes });
        applyEdits(conSuelo.map, [{ x: 20, y: 20, z: 7, ground: 103 }], itemTypes);

        const escrito = JSON.parse(MapWriter.writeMap(conSuelo.map, { itemTypes: itemTypes }));
        const casilla = escrito.tiles.find((tile) => tile.x === 20 && tile.y === 20);

        check('el archivo guarda el suelo nuevo y no el de antes',
            casilla && casilla.ground === 103,
            'el 105 que habia se sustituye, no se escribe debajo');

        // --- La pila de objetos: ahi SI se apila, y el orden importa ---
        const pila = new EditorMap(crudo, itemTypes);

        pila.paintItem(6, 1, 0, 2400);
        pila.addItem(6, 1, 0, 3031);

        const apilado = pila.getTile(6, 1, 0);
        check('con Mayus los objetos se apilan y el ultimo queda arriba',
            pila.tileAt(6, 1, 0).items.length === 2 &&
            apilado.items[0].id === 2400 && apilado.items[1].id === 3031 &&
            apilado.downCount === 2,
            'el orden de la pila es el de dibujo: el ultimo anadido tapa a los de abajo');

        pila.addItem(6, 1, 0, 113);
        const conMesa = pila.getTile(6, 1, 0);
        check('y un mueble de la banda de arriba se dibuja por encima de todo',
            conMesa.downCount === 2 && conMesa.items[2].id === 113,
            'la mesa va despues de las criaturas; la espada y la moneda, antes');

        pila.paintItem(6, 1, 0, 2401);
        check('sin Mayus el pincel sustituye la pila entera',
            pila.tileAt(6, 1, 0).items.length === 1 && pila.tileAt(6, 1, 0).items[0].id === 2401,
            'si anadiera, pintar dos veces el mismo muro lo pondria dos veces');

        pila.addItem(6, 1, 0, 3031);
        check('y se puede deshacer la ultima capa de la pila',
            pila.popItem(6, 1, 0) === true && pila.tileAt(6, 1, 0).items.length === 1,
            'quita el de mas arriba, que es el unico que se podria coger');

        // --- Las banderas: un conjunto, no un valor ---
        const banderas = new EditorMap(crudo, itemTypes);

        banderas.toggleFlag(5, 1, 0, 'noPvp');
        check('una casilla puede tener varias banderas a la vez',
            banderas.tileAt(5, 1, 0).flags.join(',') === 'protectionZone,noPvp',
            'son un conjunto: una casilla puede ser zona de proteccion y no dejar salir');

        banderas.toggleFlag(5, 1, 0, 'protectionZone');
        const edicionBanderas = banderas.edits()
            .find((edicion) => edicion.x === 5 && edicion.y === 1 && edicion.z === 0);

        check('quitar una no quita las demas, y viajan por su nombre',
            banderas.tileAt(5, 1, 0).flags.join(',') === 'noPvp' &&
            edicionBanderas.flags.join(',') === 'noPvp',
            'por nombre, para que el archivo se lea sin saber numeros de bit');

        // --- La paleta: agrupada y sin dejar nada fuera ---
        const grupos = new Set(Paleta.nombresDeGrupo());
        const grupoSuelos = [];
        const deLaHoja = [];
        const fuera = [];

        itemTypes.forEach((definicion) => {
            // `grupoDeCatalogo` es la pregunta que hace la paleta de verdad: sus banderas MÁS la
            // excepción de la hoja de terreno.
            const grupo = Paleta.grupoDeCatalogo(definicion);

            if (!grupos.has(grupo)) {
                fuera.push(definicion.id);
            }
            if (grupo === 'Suelos') {
                grupoSuelos.push(definicion.id);
            }
            if (grupo === Paleta.GRUPO_HOJA) {
                deLaHoja.push(definicion.id);
            }
        });

        check('todos los objetos del catalogo caen en un grupo de la paleta',
            itemTypes.size > 0 && fuera.length === 0,
            itemTypes.size + ' objetos repartidos en ' + grupos.size +
            ' grupos, ninguno sin sitio');

        check('y los cuatro suelos de siempre son del grupo de suelos, y todo suelo cae ahi',
            [102, 103, 104, 105].every((id) => grupoSuelos.indexOf(id) !== -1) &&
            itemTypes.size > 0 &&
            Array.from(itemTypes.values()).every((definicion) =>
                !Paleta.estaPuesto((definicion.attributes || {}).isGround) ||
                grupoSuelos.indexOf(definicion.id) !== -1 ||
                deLaHoja.indexOf(definicion.id) !== -1),
            grupoSuelos.length + ' suelos; antes eran exactamente los cuatro de 102 a 105 ' +
            'porque el catalogo tenia 38 objetos, y con un catalogo que crece —se le anaden ' +
            'hojas de tiles— la lista exacta pondria la prueba en rojo cada vez que alguien ' +
            'anade un suelo, que es justo lo contrario de lo que quiere comprobar');

        /*
         * EL TERRENO DE LA HOJA TIENE SU PROPIO GRUPO, y es lo que hace que 471 casillas (la 5487, vacía, se quitó) se puedan
         * RECORRER. Sin él caían en «Muebles y adornos» —412 de los 510 objetos del catálogo— y
         * la única forma de encontrar un dibujo era el buscador, o sea saber ya cuál se busca.
         */
        check('el terreno de la hoja tiene SU PROPIO GRUPO, para poder recorrerlo',
            deLaHoja.length === 471 && grupos.has(Paleta.GRUPO_HOJA) &&
            deLaHoja.every((id) => id >= Paleta.HOJA_TERRENO.desde &&
                id <= Paleta.HOJA_TERRENO.hasta) &&
            deLaHoja.indexOf(5000) !== -1 && deLaHoja.indexOf(5486) !== -1,
            deLaHoja.length + ' casillas de la hoja en «' + Paleta.GRUPO_HOJA + '», con ' +
            Paleta.HOJA_TERRENO.columnas + ' columnas: ' + deLaHoja.length + ' botones en una ' +
            'lista corrida no se manejan, y en una rejilla de diez se ven como la hoja que son ' +
            '(5487, 5488 y 5489 no estan: son casillas VACIAS de la hoja, y no tienen objeto)');

        check('y un suelo de la hoja sigue siendo un suelo por sus banderas',
            Paleta.grupoDeItem(itemTypes.get(5005).attributes) === 'Suelos' &&
            Paleta.grupoDeCatalogo(itemTypes.get(5005)) === Paleta.GRUPO_HOJA,
            'la excepcion es del GRUPO EN EL QUE SE ENSEÑA, no de lo que el objeto es: llamarlo ' +
            '«Muebles» por estar en la hoja seria mentir sobre sus banderas');

        check('y las banderas de items.xml siguen decidiendo el grupo',
            Paleta.grupoDeItem({ isGround: 1 }) === 'Suelos' &&
            Paleta.grupoDeItem({ blocksSolid: 1 }) === 'Muros y obstáculos' &&
            Paleta.grupoDeItem({ alwaysOnTop: 1 }) === 'Muebles y adornos' &&
            Paleta.grupoDeItem({ attack: 48 }) === 'Armas' &&
            Paleta.grupoDeItem({ slotType: 'body' }) === 'Equipo y protección' &&
            Paleta.grupoDeItem({}) === Paleta.GRUPO_OTROS,
            'y no una lista de identificadores escrita a mano, que es lo que dejo la ' +
            'paleta a medias la primera vez');

        // --- La vista: el mapa entero cabe y el zoom no da saltos raros ---
        const ventanaAncho = 1400;
        const ventanaAlto = 700;

        [[64, 64], [128, 128]].forEach(([anchoMapa, altoMapa]) => {
            const escala = Vista.escalaDeAjuste(anchoMapa, altoMapa,
                ventanaAncho, ventanaAlto, 32, Vista.MARGEN_AJUSTE);

            const anchoDibujado = anchoMapa * 32 * escala;
            const altoDibujado = altoMapa * 32 * escala;

            check('el mapa ' + anchoMapa + 'x' + altoMapa + ' cabe entero en la ventana (' +
                Vista.formatoDeEscala(escala) + ')',
                anchoDibujado <= ventanaAncho - 2 * Vista.MARGEN_AJUSTE + 1e-9 &&
                altoDibujado <= ventanaAlto - 2 * Vista.MARGEN_AJUSTE + 1e-9 &&
                escala < 1,
                'a 32 px por casilla son ' + (anchoMapa * 32) + ' px de ancho: hay que ' +
                'reducir la escala, y aun asi no puede quedar recortado');
        });

        check('el mapa se encuadra en su mitad',
            Vista.centroDeMapa(128, 64).x === 64 && Vista.centroDeMapa(128, 64).y === 32,
            'un desplazamiento de media casilla deja el mapa descentrado para siempre');

        check('el zoom pasa por escalas fijas',
            Vista.siguienteEscala(1, 1) === 1.25 && Vista.siguienteEscala(1, -1) === 0.75,
            'con un factor multiplicativo se acaba en 87,3 % y nadie sabe si esta al 100 %');

        check('y desde la escala de ajuste, que no esta en la lista, no da un salto',
            Vista.siguienteEscala(0.165, 1) === 0.2 && Vista.siguienteEscala(0.165, -1) === 0.15,
            'la escala de "ver todo" sale de una division y casi nunca es una de la lista');

        check('una escala rota no deja el lienzo en blanco',
            Vista.limitarEscala(0) === 1 && Vista.limitarEscala(NaN) === 1 &&
            Vista.limitarEscala(999) === Vista.ESCALA_MAXIMA,
            'un cero aqui es un mapa que parece perdido');

        const centro = Vista.centroParaFijarPunto(
            { x: 10, y: 20 }, { x: 300, y: 400 }, { ancho: 1000, alto: 500 }, 64, { x: 0, y: 0 });

        check('acercar con la rueda deja quieto el punto donde esta el raton',
            Math.abs((10 - centro.x) * 64 + 500 - 300) < 1e-9 &&
            Math.abs((20 - centro.y) * 64 + 250 - 400) < 1e-9,
            'es lo que permite apuntar a una casilla y acercarse sin recolocar la camara');

        check('y la escala se enseña en porcentaje',
            Vista.formatoDeEscala(1) === '100 %' &&
            Vista.formatoDeEscala(0.05) === '5.0 %' &&
            Vista.formatoDeEscala(0.165) === '17 %',
            'por debajo del 10 % con un decimal: entre el 3 % y el 4 % hay mapas que ' +
            'caben y mapas que no');

        // --- La paleta, construida de verdad ---
        /*
         * CON UN DOM DE MENTIRA, porque no hay navegador. `palette.js` no importa nada y
         * sólo toca `document` dentro de sus métodos, así que se le puede dar un
         * `document` mínimo y comprobar lo que de verdad importa de una paleta: que haya
         * un botón por objeto, que cada uno tenga su dibujo pintado y que el filtro deje
         * a la vista lo que casa. El aspecto no se puede ver sin navegador; la
         * estructura, sí.
         */
        const documentoReal = global.document;
        const resultados = [];

        try {
            global.document = documentoFalso();

            const paleta = new Paleta.PaletteView({
                contenedor: global.document.createElement('div'),
                proveedor: {
                    /*
                     * Un sprite distinto por id, con su dibujo de 8x8 en el centro, y
                     * DEVUELTO SIEMPRE EL MISMO OBJETO. Eso último no es un detalle de
                     * la prueba: los dos proveedores de verdad cachean su lienzo, y de
                     * que el objeto no cambie depende que la paleta sepa que ya no hay
                     * nada que repintar.
                     */
                    cache: new Map(),
                    get(id) {
                        if (!this.cache.has(id)) {
                            this.cache.set(id, {
                                canvas: lienzoFalso(32, 32, 4, 4, 8, 8),
                                anchorY: 32,
                                id: id
                            });
                        }
                        return this.cache.get(id);
                    }
                },
                onElegir: (definicion, esSuelo) => resultados.push({ id: definicion.id, esSuelo })
            });

            paleta.setItems(itemTypes);

            check('la paleta construye un boton por objeto del catalogo',
                paleta.entradas.length === itemTypes.size && itemTypes.size > 0,
                paleta.entradas.length + ' botones para ' + itemTypes.size + ' objetos');

            check('y a cada uno le pinta su dibujo',
                paleta.entradas.every((entrada) => entrada.pintado !== null) &&
                paleta.entradas.every((entrada) => entrada.lienzo.width === 32),
                'antes salia un rectangulo de color porque el lienzo usaba el proveedor ' +
                'de procedimiento en vez del de los dibujos');

            check('el dibujo se centra en su hueco y no se pega al borde',
                paleta.entradas.every((entrada) =>
                    entrada.lienzo.getContext('2d').pintados.length === 1 &&
                    entrada.lienzo.getContext('2d').pintados[0].dx === 8 &&
                    entrada.lienzo.getContext('2d').pintados[0].dy === 8),
                'el dibujo de un objeto va apoyado en el suelo de su casilla; tal cual ' +
                'dejaria media casilla vacia encima');

            check('y no se repinta lo que ya estaba pintado',
                paleta.refrescarPendientes() === 0 &&
                paleta.entradas.every((entrada) =>
                    entrada.lienzo.getContext('2d').pintados.length === 1),
                'esto se llama en cada fotograma, asi que tiene que salir en cuanto no ' +
                'queda nada que hacer');

            // El caso que hace que la paleta se rellene sola al abrir el editor: el
            // proveedor devuelve primero el respaldo de procedimiento y, cuando el
            // fichero llega, el dibujo de verdad, que es OTRO objeto.
            const antesDelCambio = paleta.entradas
                .find((entrada) => entrada.definicion.id === 113)
                .lienzo.getContext('2d').pintados.length;

            paleta.proveedor.cache.set(113, {
                canvas: lienzoFalso(32, 32, 4, 4, 8, 8), anchorY: 32, id: 113
            });

            check('y se repinta solo el que ha cambiado de dibujo',
                paleta.refrescarPendientes() === 1 &&
                paleta.entradas.find((entrada) => entrada.definicion.id === 113)
                    .lienzo.getContext('2d').pintados.length === antesDelCambio + 1,
                'sin esto, la paleta se quedaria con los rectangulos de color de antes ' +
                'de que llegaran los ficheros');

            paleta.setFiltro('potion');
            check('el filtro deja a la vista solo lo que casa por nombre',
                paleta.visibles === 2,
                'health potion y mana potion: ' + paleta.visibles + ' visibles');

            paleta.setFiltro('2413');
            // Busca por TROZO de identificador: «2413» encuentra el 2413 y también, por ejemplo, el
            // 12413 del OpenTibia Sprite Pack. Lo que importa es que esté y que no salga nada que no
            // lo contenga.
            const visiblesPorId = paleta.entradas.filter((entrada) => !entrada.boton.hidden);
            check('y tambien busca por identificador',
                visiblesPorId.some((entrada) => entrada.definicion.id === 2413) &&
                visiblesPorId.every((entrada) => String(entrada.definicion.id).includes('2413')),
                'quien edita unas veces sabe que la mesa es la 113 y otras que se llama table');

            paleta.setFiltro('');
            check('y sin filtro vuelven todos',
                paleta.visibles === paleta.entradas.length);

            paleta.elegirPorId(102);
            check('elegir un suelo lo dice, para que el pincel sea el de suelo',
                resultados.length === 1 && resultados[0].id === 102 && resultados[0].esSuelo === true);

            paleta.elegirPorId(113);
            check('y elegir un objeto no',
                resultados.length === 2 && resultados[1].id === 113 && resultados[1].esSuelo === false);

            check('el elegido se marca y se desmarca el anterior',
                paleta.entradas.filter((entrada) =>
                    entrada.boton.classList.contains('selected')).length === 1);

            /*
             * LA HOJA VA EN REJILLA, y el dato que lo consigue está en el botón: el CSS reparte
             * los de clase `hoja` en diez columnas, así que una fila de botones es una fila de
             * `tilesheet.png`. Sin esa clase, los 472 serían una lista corrida más.
             */
            const botonesHoja = paleta.entradas.filter((entrada) =>
                entrada.boton.className.indexOf('hoja') !== -1);

            check('y los botones de la hoja van marcados para salir en rejilla',
                botonesHoja.length === 471 &&
                botonesHoja.every((entrada) => entrada.boton.dataset.grupo === Paleta.GRUPO_HOJA) &&
                paleta.entradas.filter((entrada) =>
                    entrada.boton.className.indexOf('hoja') === -1 &&
                    entrada.boton.dataset.grupo === Paleta.GRUPO_HOJA).length === 0,
                botonesHoja.length + ' botones en rejilla: el nombre y el id no caben en la ' +
                'casilla de 32x32, asi que van en el globo del raton y el boton se queda con el ' +
                'dibujo');

            /*
             * Y EL GLOBO CON EL NOMBRE Y EL ID, que es donde vive lo que el boton ya no ensena: en
             * la rejilla no cabe ni el identificador, asi que el `title` tiene que estar en TODOS
             * los botones —tambien en los de la lista— y tiene que llevar las dos cosas, porque es
             * lo unico que queda de ellas.
             */
            check('cada boton lleva su nombre y su id en el globo del raton',
                paleta.entradas.every((entrada) =>
                    entrada.boton.title === (entrada.definicion.name ||
                        ('objeto ' + entrada.definicion.id)) + ' (' + entrada.definicion.id + ')'),
                'es lo unico que enseña el boton de la rejilla: el dibujo, y en el globo el ' +
                'nombre con su identificador para quien busque por numero');

            /*
             * SOLTAR LA SELECCION: la paleta se queda vacía y no avisa de que se ha elegido
             * nada, porque soltar no es elegir otro objeto. Es la mitad del estado «no llevo
             * nada»; la otra mitad es el fantasma del lienzo, que desaparece.
             */
            const elegidosAntes = resultados.length;

            paleta.soltar();

            check('soltar deja la paleta SIN nada elegido y sin ningun boton marcado',
                paleta.elegido === null &&
                paleta.entradas.every((entrada) =>
                    !entrada.boton.classList.contains('selected')) &&
                resultados.length === elegidosAntes,
                'y no llama a onElegir: soltar no es elegir otro objeto, es dejar de llevar algo');
        } finally {
            global.document = documentoReal;
        }
    }

    // =======================================================================
    section('6. Los archivos servidos');
    // =======================================================================

    {
        const page = await fetch('http://127.0.0.1:' + port + '/');
        check('se sirve la pagina del editor',
            page.status === 200 &&
            String(page.headers.get('content-type')).indexOf('text/html') === 0,
            page.status + ' ' + page.headers.get('content-type'));

        const camera = await fetch('http://127.0.0.1:' + port + '/jetyum/js/camera.js');
        check('y los modulos del CLIENTE, que el editor reutiliza',
            camera.status === 200 &&
            String(camera.headers.get('content-type')).indexOf('javascript') !== -1,
            camera.status + ' ' + camera.headers.get('content-type') + ': misma camara y ' +
            'mismo orden de dibujo que el juego, porque si fueran distintos un mapa se ' +
            'veria bien en el editor y mal en el juego');

        const protocol = await fetch('http://127.0.0.1:' + port + '/shared/js/protocol.mjs');
        check('y el protocolo compartido', protocol.status === 200);

        const escape = await fetch(
            'http://127.0.0.1:' + port + '/../config.js');
        check('no se puede salir del montaje',
            escape.status === 403 || escape.status === 404,
            'estado ' + escape.status + ': es el fallo clasico de un servidor de archivos');

        /*
         * --- La tabla de banderas del cliente ---
         *
         * `assets/objetos.json` es la copia de las banderas de items.xml para el navegador (la
         * genera tools/generar-banderas.mjs). Tiene que estar AL DÍA: se vuelve a generar en una
         * copia y tiene que salir igual.
         */
        const tabla = JSON.parse(fs.readFileSync(
            path.join(ROOT, 'client', 'jetyum', 'assets', 'objetos.json'), 'utf8'));
        const { generar: generarBanderas } = await import('./generar-banderas.mjs');
        const copiaBanderas = path.join(require('os').tmpdir(), 'objetos-' + process.pid + '.json');
        generarBanderas({ salida: copiaBanderas });
        const recien = JSON.parse(fs.readFileSync(copiaBanderas, 'utf8'));
        fs.rmSync(copiaBanderas, { force: true });
        check('la tabla de banderas está al día con items.xml',
            JSON.stringify(recien.items) === JSON.stringify(tabla.items),
            'si no, hay que volver a ejecutar tools/generar-banderas.mjs (npm run banderas:generar)');

        const tablaPropia = await fetch('http://127.0.0.1:' + port + '/jetyum/assets/objetos.json');
        check('y la tabla se sirve por HTTP',
            tablaPropia.status === 200 &&
            String(tablaPropia.headers.get('content-type')).indexOf('json') !== -1,
            tablaPropia.status + ' ' + tablaPropia.headers.get('content-type'));

        /*
         * --- Y LAS BANDERAS ---
         *
         * La tabla lleva, ademas del dibujo, las BANDERAS de `items.xml` -`pickupable`,
         * `blocksSolid`, `slotType`...-, que es lo que hace que el cliente sepa que un muro no se
         * arrastra y que una moneda si, sin preguntar al servidor. Es lo mismo que hace `Tibia.dat`
         * en el cliente de Tibia.
         *
         * LA COMPARACION ES GENERICA, objeto por objeto, y no una lista de tres ids escrita aqui:
         * el valor de esta comprobacion esta en que se ejecuta sola cada vez que alguien anade un
         * objeto con banderas nuevas. Con el motor de un lado y la tabla del otro, la discrepancia
         * se ve antes de que el cliente ofrezca un arrastre que el motor va a rechazar.
         */
        const { FLAG_DEFAULTS } = require('../engine/world/item.js');
        const itemtypes = await import('../client/jetyum/js/itemtypes.js');

        // Antes de cargar nada, el cliente tiene que contestar lo CONSERVADOR: no se sabe si algo
        // se puede arrastrar, asi que se dice que no. Lo contrario ofreceria un arrastre que el
        // motor rechazaria en cada intento.
        check('sin tabla cargada, el cliente no deja arrastrar nada',
            itemtypes.estaCargada() === false && itemtypes.esMovible(3031) === false &&
            itemtypes.ranuraDe(2400) === null,
            'es lo que dura hasta que llega el fichero, y se prefiere a ofrecer algo que ' +
            'el motor va a rechazar');

        itemtypes.usarTabla(tabla);

        const discrepancias = [];

        itemTypes.forEach((definicion, id) => {
            const atributos = definicion.attributes || {};
            const banderas = (tabla.items[id] || {}).banderas || {};

            const encendida = (valor) => valor === true || valor === 1 || valor === '1';

            Object.keys(FLAG_DEFAULTS).forEach((clave) => {
                if (encendida(atributos[clave]) !== (banderas[clave] === true)) {
                    discrepancias.push(id + ' ' + clave + ': motor=' +
                        Boolean(atributos[clave]) + ' tabla=' + Boolean(banderas[clave]));
                }
            });

            if (String(atributos.slotType || '') !== String(banderas.slotType || '')) {
                discrepancias.push(id + ' slotType: motor=' + atributos.slotType +
                    ' tabla=' + banderas.slotType);
            }
        });

        check('las banderas de la tabla son exactamente las de items.xml',
            discrepancias.length === 0,
            discrepancias.length === 0
                ? itemTypes.size + ' objetos comparados bandera a bandera con lo que cargo el motor'
                : discrepancias.join(', '));

        check('y el cliente las lee con las mismas respuestas que da el motor',
            itemtypes.esMovible(3031) === true &&
            itemtypes.esApilable(3031) === true &&
            itemtypes.esMovible(111) === false &&
            itemtypes.esBloqueante(111) === true &&
            itemtypes.esContenedor(2412) === true &&
            itemtypes.ranuraDe(2412) === 'backpack' &&
            itemtypes.esEquipable(2400) === true &&
            itemtypes.ranuraDe(2400) === 'hand' &&
            itemtypes.ranuraDe(3031) === null,
            'moneda movible y apilable, muro bloqueante y NO movible, mochila contenedora en ' +
            'su ranura, espada equipable en la mano, monedas sin ranura');

    }

    // =======================================================================
    section('7. El respawn es un AREA: las dos formas del formato, y el motor y el editor de acuerdo');
    // =======================================================================

    /*
     * UN RESPAWN ES UN AREA —un centro, un radio y los monstruos que viven dentro, cada uno con
     * su casilla— y hay DOS FORMAS de escribirla en el archivo: la de Tibia, que es la que
     * escribe el escritor, y la antigua, un monstruo por entrada con la (x,y) como centro, que
     * es la que tienen los mapas que ya existen. Las dos se leen y las dos dan el mismo modelo,
     * y eso es lo que comprueba esta seccion: que los mapas de verdad siguen cargando y que el
     * editor y el motor los leen IGUAL.
     */
    const ciudadRuta = path.join(ROOT, 'tools', 'fixtures', 'ciudad-antigua.map.json');
    const ciudadCrudo = JSON.parse(fs.readFileSync(ciudadRuta, 'utf8'));
    const npcTypesReales = Xml.loadNpcs(path.join(ROOT, 'data', 'npc', 'npcs.xml'));

    /*
     * Los monstruos se cargan con el MISMO lector que usa el servidor de herramientas
     * (`editor/server.js`), que a su vez usa el cargador de contenido del motor. Escribir aquí
     * una lista a mano —`new Map([['Rat', {}]])`— fue el primer intento y es una trampa: la
     * validación de respawns comprobaría contra una lista inventada y no contra `data/monsters/`,
     * así que un monstruo que existe de verdad (Cave Rat) se leería como inexistente.
     */
    const monsterTypesReales = loadMonsterTypes();

    {
        const ciudad = loadMap(ciudadRuta, {
            itemTypes: itemTypes,
            monsterTypes: monsterTypesReales,
            npcTypes: npcTypesReales
        });

        check('el mapa de la ciudad, escrito en la forma ANTIGUA, sigue cargando',
            ciudad.report.ok,
            ciudad.report.ok ? ciudad.map.stats().size : ciudad.report.format());

        check('y sus 10 entradas son 10 respawns con un monstruo cada uno',
            ciudad.map.stats().spawnAreas === 10 && ciudad.map.stats().spawns === 10,
            ciudad.map.stats().spawnAreas + ' respawns, ' + ciudad.map.stats().spawns + ' monstruos');

        check('y coloca sus 8 NPC',
            ciudad.map.stats().npcs === 8,
            ciudad.map.stats().npcs + ' npc');

        check('un monstruo de la forma antigua NO tiene casilla propia',
            ciudad.map.spawns.every((area) =>
                area.monsters.every((monstruo) => monstruo.x === null && monstruo.y === null)),
            'es lo que hace que un mapa viejo no cambie de comportamiento al cargarse: el ' +
            'area entera es su sitio y el motor lo sortea dentro, como hacia antes');

        check('y su radio se lee del archivo, no se inventa',
            ciudad.map.spawns.map((area) => area.radius).sort((a, b) => a - b).join(',') ===
            '2,2,2,3,3,3,3,4,4,4',
            'radios declarados: ' + ciudad.map.spawns.map((area) => area.radius).join(','));

        const ejemplo = loadMap(path.join(ROOT, 'data', 'world', 'sample.map.json'), {
            itemTypes: itemTypes,
            monsterTypes: monsterTypesReales,
            npcTypes: npcTypesReales
        });

        check('y el mapa de ejemplo tambien sigue cargando',
            ejemplo.report.ok && ejemplo.map.stats().spawnAreas === 1 &&
            ejemplo.map.stats().spawns === 1 && ejemplo.map.stats().npcs === 2,
            ejemplo.map.stats().spawnAreas + ' respawn, ' + ejemplo.map.stats().spawns +
            ' monstruo, ' + ejemplo.map.stats().npcs + ' npc');

        /*
         * --- El motor y el editor leen lo mismo ---
         *
         * Son DOS LECTORES y no puede ser uno: el del motor es CommonJS y el del editor es un
         * módulo ES que corre en el navegador, así que no pueden importarse entre sí. Lo que
         * impide que se separen es esta comprobación, que carga el MISMO archivo con los dos y
         * compara área por área y monstruo por monstruo. Es la misma idea que la comprobación de
         * las banderas del cliente contra `items.xml`.
         */
        const Marcadores = await import('../editor/js/marcadores.js');
        const delEditor = Marcadores.normalizarRespawns(ciudadCrudo.spawns);

        check('el editor lee los respawns de la ciudad IGUAL que el motor',
            firmaDeAreas(delEditor) === firmaDeAreas(ciudad.map.spawns),
            delEditor.length + ' areas leidas por los dos; la firma compara centro, radio, ' +
            'intervalo y cada monstruo con su casilla');
    }

    {
        // --- La forma nueva, con varios monstruos dentro de un area ---
        const armado = MapLoader.buildMap({
            format: 'jetyum-map', version: 1, name: 'respawns',
            width: 32, height: 32, floors: 2,
            defaultGround: { '0': 102 },
            spawns: [
                {
                    x: 10, y: 10, z: 0, radius: 2,
                    monsters: [
                        { name: 'Rat', x: 10, y: 10 },
                        { name: 'Rat', x: 12, y: 11, interval: 30000 }
                    ]
                },
                // Y la antigua en el MISMO archivo: se pueden mezclar.
                { x: 20, y: 20, z: 0, monster: 'Rat', interval: 60000, radius: 2 }
            ]
        }, { itemTypes: itemTypes, monsterTypes: monsterTypesReales });

        check('un mapa con las DOS formas a la vez carga',
            armado.report.ok,
            armado.report.ok ? '' : armado.report.format());

        check('y cada area declara sus monstruos',
            armado.map.stats().spawnAreas === 2 && armado.map.stats().spawns === 3,
            armado.map.stats().spawnAreas + ' respawns, ' + armado.map.stats().spawns + ' monstruos');

        check('y el intervalo puede ser distinto por monstruo',
            armado.map.spawns[0].monsters[0].interval === 60000 &&
            armado.map.spawns[0].monsters[1].interval === 30000,
            'es el spawntime de Tibia: por monstruo, con el del area como valor por defecto');

        /*
         * --- Y el motor los coloca donde dice el mapa ---
         *
         * Con un mundo de mentira: lo que se comprueba es el aplanado de áreas a puntos de
         * aparición y dónde aparece cada monstruo, no el mundo entero.
         */
        const creados = [];
        const mundoFalso = {
            map: armado.map,
            hasCreatureAt: () => false,
            createMonster(name, position, entry) {
                creados.push({ name: name, position: position, entry: entry });
                return { id: creados.length, position: position, spawn: entry };
            },
            on() {}
        };

        const spawner = new Spawner({ world: mundoFalso, random: () => 0 });
        const cargado = spawner.loadFromMap(armado.map);

        check('el motor aplana las areas en un punto de aparicion por monstruo',
            cargado.spawns === 3 && cargado.monsters === 3,
            cargado.spawns + ' puntos, ' + cargado.monsters + ' monstruos');

        check('y un monstruo CON casilla aparece en SU casilla',
            creados[0].position.x === 10 && creados[0].position.y === 10 &&
            creados[1].position.x === 12 && creados[1].position.y === 11,
            'es lo que hace TFS, y lo que espera quien coloca un monstruo en un editor');

        check('y uno SIN casilla aparece dentro del area, no en el centro',
            creados[2].position.x === 18 && creados[2].position.y === 18 &&
            creados[2].entry.tieneCasilla === false,
            'con azar 0 el desplazamiento es -radio: (' + creados[2].position.x + ',' +
            creados[2].position.y + ') en un area de centro (20,20) y radio 2, que es ' +
            'exactamente lo que hacia este motor antes de la forma nueva');

        // --- Lo que el validador tiene que rechazar ---
        const fuera = MapLoader.buildMap({
            format: 'jetyum-map', version: 1, name: 'fuera',
            width: 32, height: 32, floors: 2, defaultGround: { '0': 102 },
            spawns: [{ x: 10, y: 10, z: 0, radius: 1, monsters: [{ name: 'Rat', x: 15, y: 15 }] }]
        }, { itemTypes: itemTypes, monsterTypes: monsterTypesReales });

        check('un monstruo FUERA del area de su respawn se rechaza',
            !fuera.report.ok && fuera.report.errors.some((e) => /fuera de su respawn/.test(e.message)),
            'es la regla que pidio el usuario, y se cumple en el validador y no solo en el editor: ' +
            'un mapa asi no puede ni llegar a arrancar');

        const vacio = MapLoader.buildMap({
            format: 'jetyum-map', version: 1, name: 'vacio',
            width: 32, height: 32, floors: 2, defaultGround: { '0': 102 },
            spawns: [{ x: 10, y: 10, z: 0, radius: 1, monsters: [] }]
        }, { itemTypes: itemTypes, monsterTypes: monsterTypesReales });

        check('un respawn sin monstruos se rechaza',
            !vacio.report.ok && vacio.report.errors.some((e) => /no tiene ningun monstruo/.test(e.message)),
            'un respawn es un area CON monstruos: sin ellos no hay nada que guardar');

        const radioMalo = MapLoader.buildMap({
            format: 'jetyum-map', version: 1, name: 'radio',
            width: 32, height: 32, floors: 2, defaultGround: { '0': 102 },
            spawns: [{ x: 10, y: 10, z: 0, radius: -2, monsters: [{ name: 'Rat' }] }]
        }, { itemTypes: itemTypes, monsterTypes: monsterTypesReales });

        check('un radio negativo se rechaza',
            !radioMalo.report.ok && radioMalo.report.errors.some((e) => /radio/.test(e.message)));

        const npcRadio = MapLoader.buildMap({
            format: 'jetyum-map', version: 1, name: 'npcradio',
            width: 32, height: 32, floors: 2, defaultGround: { '0': 102 },
            npcs: [
                { x: 5, y: 5, z: 0, name: 'Guia', radius: 0 },
                { x: 6, y: 5, z: 0, name: 'Guia', radius: -1 }
            ]
        }, { itemTypes: itemTypes, npcTypes: npcTypesReales });

        check('un radio de paseo negativo en un NPC se rechaza',
            !npcRadio.report.ok && npcRadio.report.errors.some((e) => /radio de paseo/.test(e.message)));

        const conRadioCero = MapLoader.buildMap({
            format: 'jetyum-map', version: 1, name: 'npcquieto',
            width: 32, height: 32, floors: 2, defaultGround: { '0': 102 },
            npcs: [{ x: 5, y: 5, z: 0, name: 'Herrero', radius: 0 }]
        }, { itemTypes: itemTypes, npcTypes: npcTypesReales });

        check('y el radio 0 del mapa es «aqui no se mueve», distinto de no decir nada',
            conRadioCero.report.ok && conRadioCero.map.npcPlacements[0].radius === 0,
            'null seria «manda npcs.xml»; 0 es una decision, y un `||` los confundiria');
    }

    {
        // --- El escritor escribe la forma de Tibia, y sin inventar casillas ---
        const ciudad = loadMap(ciudadRuta, {
            itemTypes: itemTypes,
            monsterTypes: monsterTypesReales,
            npcTypes: npcTypesReales
        });

        const texto = MapWriter.writeMap(ciudad.map, {
            itemTypes: itemTypes,
            extraKeys: documentationKeys(ciudadCrudo)
        });
        const escrito = JSON.parse(texto);

        check('el escritor escribe los respawns con sus monstruos dentro',
            Array.isArray(escrito.spawns[0].monsters) &&
            escrito.spawns[0].monsters[0].name === 'Rat' &&
            escrito.spawns[0].monster === undefined,
            'la forma de Tibia: centro, radio y la lista dentro. La entrada suelta `monster` ' +
            'desaparece al guardar');

        check('y NO le inventa casilla a un monstruo que no la tenia',
            escrito.spawns[0].monsters[0].x === undefined &&
            escrito.spawns[0].monsters[0].y === undefined,
            'escribirle el centro le cambiaria el comportamiento al mapa al guardarlo');

        check('y conserva los comentarios del mapa',
            texto.indexOf('Ciudad de Jetyum') !== -1,
            'las claves que empiezan por _ se conservan, como en los items');

        const releido = MapLoader.buildMap(escrito, {
            itemTypes: itemTypes,
            monsterTypes: monsterTypesReales,
            npcTypes: npcTypesReales
        });

        check('y la ida y vuelta deja los respawns igual',
            releido.report.ok &&
            firmaDeAreas(releido.map.spawns) === firmaDeAreas(ciudad.map.spawns),
            'cargar, escribir y volver a cargar no cambia ni un monstruo');

        const ida = MapWriter.verifyRoundTrip(ciudad.map, MapLoader.buildMap, {
            itemTypes: itemTypes,
            monsterTypes: monsterTypesReales,
            npcTypes: npcTypesReales,
            extraKeys: documentationKeys(ciudadCrudo)
        });

        check('y la comprobacion de ida y vuelta del escritor lo confirma',
            ida.ok,
            ida.ok ? 'sin diferencias' : ida.problems.join('; '));

        // Los NPC tambien tienen que volver: el escritor los escribia y la comprobacion de ida
        // y vuelta NO miraba si volvian, asi que un fallo que se los comiera pasaba en verde.
        check('y los NPC vuelven, que antes no se comprobaba',
            releido.map.stats().npcs === 8 &&
            firmaDeNpcs(releido.map) === firmaDeNpcs(ciudad.map),
            'el escritor los escribia y nadie comprobaba que volvieran');

        // --- Los valores por defecto del formato ---
        const conDefaults = MapLoader.buildMap({
            format: 'jetyum-map', version: 1, name: 'defectos',
            width: 32, height: 32, floors: 2, defaultGround: { '0': 102 },
            spawns: [{ x: 10, y: 10, z: 0, radius: 1, monsters: [{ name: 'Rat' }] }],
            npcs: [{ x: 5, y: 5, z: 0, name: 'Guia' }]
        }, { itemTypes: itemTypes, monsterTypes: monsterTypesReales, npcTypes: npcTypesReales });

        const escritoDefaults = JSON.parse(MapWriter.writeMap(conDefaults.map, { itemTypes: itemTypes }));
        const releidoDefaults = MapLoader.buildMap(escritoDefaults, {
            itemTypes: itemTypes, monsterTypes: monsterTypesReales, npcTypes: npcTypesReales
        });

        check('el radio y el intervalo por defecto se omiten al escribir',
            escritoDefaults.spawns[0].radius === undefined &&
            escritoDefaults.spawns[0].interval === undefined &&
            escritoDefaults.spawns[0].monsters[0].interval === undefined,
            'igual que un item de cantidad 1: el archivo solo lleva lo que alguien decidio');

        check('y al releerlos siguen siendo los del formato, 1 y 60000',
            releidoDefaults.map.spawns[0].radius === 1 &&
            releidoDefaults.map.spawns[0].interval === 60000 &&
            releidoDefaults.map.spawns[0].monsters[0].interval === 60000,
            'omitir solo es seguro si el lector reconstruye lo mismo: por eso esto se comprueba');

        const conRadios = MapLoader.buildMap({
            format: 'jetyum-map', version: 1, name: 'radios',
            width: 32, height: 32, floors: 2, defaultGround: { '0': 102 },
            spawns: [{ x: 10, y: 10, z: 0, radius: 4, interval: 30000, monsters: [{ name: 'Rat' }] }],
            npcs: [{ x: 5, y: 5, z: 0, name: 'Herrero', radius: 0 }]
        }, { itemTypes: itemTypes, monsterTypes: monsterTypesReales, npcTypes: npcTypesReales });

        const escritoRadios = JSON.parse(MapWriter.writeMap(conRadios.map, { itemTypes: itemTypes }));

        check('y un radio distinto SI se escribe, tambien el del NPC',
            escritoRadios.spawns[0].radius === 4 &&
            escritoRadios.spawns[0].interval === 30000 &&
            escritoRadios.npcs[0].radius === 0,
            'el radio 0 de un NPC es «aqui no se mueve» y se escribe: no se puede confundir con ' +
            'no decir nada');
    }

    // =======================================================================
    section('8. El API: listar monstruos y NPC, y guardar respawns y NPC');
    // =======================================================================

    {
        const status = await api(port, 'GET', '/api/status');
        check('el estado dice cuantos monstruos y NPC se pueden colocar',
            status.status === 200 && status.body.monsters === 27 && status.body.npcs === 8,
            status.body.monsters + ' monstruos y ' + status.body.npcs + ' npc');

        const monstruos = await api(port, 'GET', '/api/monsters');
        const rata = monstruos.body.monsters.find((monstruo) => monstruo.name === 'Rat');

        check('se listan los monstruos de data/monsters/',
            monstruos.status === 200 && monstruos.body.monsters.length === 27 &&
            rata !== undefined && rata.health === 20 && rata.experience === 5,
            'Rat: ' + rata.health + ' de vida y ' + rata.experience + ' de experiencia, leidos ' +
            'del modulo del monstruo y no con una expresion regular sobre el texto');

        const npcs = await api(port, 'GET', '/api/npcs');
        const herrero = npcs.body.npcs.find((npc) => npc.name === 'Herrero');
        const guia = npcs.body.npcs.find((npc) => npc.name === 'Guia');

        check('y se listan los NPC de npcs.xml con su radio de paseo',
            npcs.status === 200 && npcs.body.npcs.length === 8 &&
            herrero.walkRadius === 3 && guia.walkRadius === 0,
            'el herrero pasea 3 y el guia 0: es el radio que el editor dibuja para cada NPC ' +
            'colocado');
    }

    {
        // --- Un guardado que solo pinta celdas NO toca los respawns ---
        const antes = JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8'));
        const marcador = await api(port, 'POST', '/api/map', {
            name: 'prueba',
            edits: [{ x: 58, y: 58, z: 7, items: [{ id: 111 }] }]
        });

        const despues = JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8'));

        check('un guardado de solo celdas no borra los respawns ni los NPC',
            marcador.status === 200 && marcador.body.spawnAreas === 1 &&
            marcador.body.spawns === 1 && marcador.body.npcs === 2 &&
            despues.npcs.length === antes.npcs.length,
            'las listas solo se tocan si vienen: si no, cualquier guardado de un muro se ' +
            'llevaria por delante todos los monstruos del mapa');
    }

    {
        // --- Guardar respawns: un area con dos monstruos dentro ---
        const respawns = [{
            x: 30, y: 30, z: 7, radius: 2, interval: 60000,
            monsters: [
                { name: 'Rat', x: 30, y: 30 },
                { name: 'Cave Rat', x: 32, y: 31, interval: 30000 }
            ]
        }];

        const simulacro = await api(port, 'POST', '/api/map', {
            name: 'prueba', dryRun: true, spawns: respawns
        });

        check('se puede guardar un respawn con varios monstruos dentro (en simulacro)',
            simulacro.status === 200 && simulacro.body.spawnAreas === 1 &&
            simulacro.body.spawns === 2,
            simulacro.body.spawnAreas + ' respawn con ' + simulacro.body.spawns + ' monstruos');

        const sinEscribir = JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8'));
        check('y la simulacion no ha escrito nada',
            sinEscribir.spawns[0].x !== 30,
            'el archivo sigue con el respawn de antes');

        const guardado = await api(port, 'POST', '/api/map', {
            name: 'prueba', spawns: respawns, npcs: [
                { x: 41, y: 41, z: 7, name: 'Guia' },
                { x: 38, y: 42, z: 7, name: 'Herrero', radius: 1 }
            ]
        });

        check('y se guarda de verdad',
            guardado.status === 200 && guardado.body.spawns === 2 && guardado.body.npcs === 2,
            JSON.stringify(guardado.body.problems || []));

        const escrito = JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8'));

        check('el archivo lleva el area con sus monstruos dentro',
            escrito.spawns.length === 1 && escrito.spawns[0].x === 30 &&
            escrito.spawns[0].radius === 2 && escrito.spawns[0].monsters.length === 2 &&
            escrito.spawns[0].monsters[1].name === 'Cave Rat',
            JSON.stringify(escrito.spawns[0]));

        check('y el radio de paseo del NPC llega al archivo',
            escrito.npcs.find((npc) => npc.name === 'Herrero').radius === 1 &&
            escrito.npcs.find((npc) => npc.name === 'Guia').radius === undefined,
            'el que se decide en el mapa manda sobre npcs.xml, y el que no se decide no se escribe');

        const releido = loadMap(workspace.mapFile, {
            itemTypes: itemTypes,
            monsterTypes: monsterTypesReales,
            npcTypes: npcTypesReales
        });

        check('y el mapa guardado se puede volver a cargar',
            releido.report.ok && releido.map.stats().spawnAreas === 1 &&
            releido.map.stats().spawns === 2 && releido.map.stats().npcs === 2,
            releido.report.ok ? '' : releido.report.format());

        check('y el monstruo aparece donde dice el area',
            releido.map.spawns[0].monsters[1].x === 32 &&
            releido.map.spawns[0].monsters[1].y === 31,
            'la casilla viaja en el archivo y vuelve');
    }

    {
        // --- Quitar un respawn que ya existe ---
        const quitado = await api(port, 'POST', '/api/map', { name: 'prueba', spawns: [] });

        check('se puede quitar un respawn que ya estaba',
            quitado.status === 200 && quitado.body.spawnAreas === 0,
            'spawns vacio es «no queda ninguno»: la lista es el estado final, no una diferencia');

        const escrito = JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8'));

        check('y desaparece del archivo',
            escrito.spawns === undefined,
            'el escritor omite la seccion entera cuando no queda ningun respawn');

        check('y el mapa sin respawns sigue cargando',
            loadMap(workspace.mapFile, {
                itemTypes: itemTypes, monsterTypes: monsterTypesReales, npcTypes: npcTypesReales
            }).report.ok);

        const sinNpcs = await api(port, 'POST', '/api/map', { name: 'prueba', npcs: [] });
        check('y se pueden quitar los NPC',
            sinNpcs.status === 200 && sinNpcs.body.npcs === 0 &&
            JSON.parse(fs.readFileSync(workspace.mapFile, 'utf8')).npcs === undefined);
    }

    {
        // --- Lo que el API tiene que rechazar, y SIN tocar el archivo ---
        const antes = fs.readFileSync(workspace.mapFile, 'utf8');

        const fuera = await api(port, 'POST', '/api/map', {
            name: 'prueba',
            spawns: [{
                x: 30, y: 30, z: 7, radius: 1,
                monsters: [{ name: 'Rat', x: 40, y: 40 }]
            }]
        });

        check('un monstruo fuera de su respawn se rechaza con 422',
            fuera.status === 422 &&
            fuera.body.problems.some((problema) => /fuera de su respawn/.test(problema)),
            fuera.body.problems ? fuera.body.problems[0] : '');

        const monstruoRaro = await api(port, 'POST', '/api/map', {
            name: 'prueba',
            spawns: [{ x: 30, y: 30, z: 7, radius: 1, monsters: [{ name: 'Dragon' }] }]
        });

        check('un monstruo que no existe se rechaza y se dice donde mirar',
            monstruoRaro.status === 422 &&
            /data\/monsters/.test(monstruoRaro.body.problems[0]),
            monstruoRaro.body.problems[0]);

        const npcRaro = await api(port, 'POST', '/api/map', {
            name: 'prueba',
            npcs: [{ x: 41, y: 41, z: 7, name: 'TenderoFantasma' }]
        });

        check('un NPC que no esta definido se rechaza',
            npcRaro.status === 422 && /npcs\.xml/.test(npcRaro.body.problems[0]),
            npcRaro.body.problems[0]);

        const respawnVacio = await api(port, 'POST', '/api/map', {
            name: 'prueba',
            spawns: [{ x: 30, y: 30, z: 7, radius: 1, monsters: [] }]
        });

        check('un respawn sin monstruos se rechaza',
            respawnVacio.status === 422 &&
            /no tiene ningun monstruo/.test(respawnVacio.body.problems[0]),
            respawnVacio.body.problems[0]);

        check('y ningun rechazo ha tocado el archivo',
            fs.readFileSync(workspace.mapFile, 'utf8') === antes,
            'el mapa se valida entero antes de escribir: un rechazo no puede dejar el archivo a ' +
            'medias');
    }

    // =======================================================================
    section('9. El editor: el area del respawn, los monstruos que van DENTRO y los NPC');
    // =======================================================================

    const { EditorMap } = await import('../editor/js/editormap.js');
    const Marcadores = await import('../editor/js/marcadores.js');

    {
        // El mapa de la ciudad, tal cual, leido por el editor: sus 10 entradas antiguas son 10
        // areas de un monstruo, sin casilla.
        const ciudad = new EditorMap(ciudadCrudo, itemTypes, npcTypesReales);

        check('el editor ve los 10 respawns de la ciudad como 10 areas',
            ciudad.stats().spawnAreas === 10 && ciudad.stats().spawns === 10,
            ciudad.stats().spawnAreas + ' respawns, ' + ciudad.stats().spawns + ' monstruos');

        check('y sus monstruos no tienen casilla, que es lo que dice la forma antigua',
            ciudad.spawns.every((area) => area.monsters.every((monstruo) => monstruo.x === null)),
            'el area entera es su sitio; el editor puede darles casilla moviendolos');

        check('y conoce el radio de paseo de cada NPC colocado',
            ciudad.radioDeNpc({ name: 'Herrero', radius: null }) === 3 &&
            ciudad.radioDeNpc({ name: 'Guia', radius: null }) === 0 &&
            ciudad.radioDeNpc({ name: 'Guia', radius: 2 }) === 2,
            'el del mapa manda; si no lo dice, manda npcs.xml');

        check('y el area de un respawn es el cuadrado de lado 2*radio+1',
            JSON.stringify(ciudad.areaDe({ x: 10, y: 10, z: 0, radius: 3 })) ===
            JSON.stringify({ x0: 7, y0: 7, lado: 7 }),
            'cuadrada y no redonda: el motor sortea la X y la Y por separado');
    }

    {
        // Un mapa vacio para operar: aqui no hay nada que estorbe.
        const mapa = new EditorMap({
            name: 'respawns', width: 32, height: 32, floors: 2,
            defaultGround: { 0: 102 }, fallbackGround: 102, tiles: []
        }, itemTypes, npcTypesReales);

        // --- La regla: un monstruo no existe fuera de un respawn ---
        const sinMonstruo = mapa.ponerRespawn(10, 10, 0, '', 3, 60000);

        check('no se puede poner un respawn sin decir que monstruo vive dentro',
            !sinMonstruo.ok && /no existe fuera de un respawn/.test(sinMonstruo.problema),
            sinMonstruo.problema);

        const creado = mapa.ponerRespawn(10, 10, 0, 'Rat', 3, 60000);

        check('se crea un respawn con su primer monstruo dentro',
            creado.ok && creado.respawn.radius === 3 && creado.respawn.monsters.length === 1 &&
            creado.respawn.monsters[0].x === 10,
            'radius ' + creado.respawn.radius + ', ' + creado.respawn.monsters.length + ' monstruo');

        check('y queda elegido y pendiente de guardar',
            mapa.seleccion.tipo === 'respawn' && mapa.marcadoresPendientes() === 1 &&
            mapa.stats().spawnAreas === 1,
            'el respawn recien puesto se ve en el panel sin tener que buscarlo');

        const dentro = mapa.ponerRespawn(11, 11, 0, 'Rat', 3, 60000);

        check('y no se puede poner otro respawn dentro de uno que ya existe',
            !dentro.ok && /ya esta dentro del respawn/.test(dentro.problema),
            dentro.problema);

        const fuera = mapa.anadirMonstruo(20, 20, 0, 'Rat', 60000);

        check('y no se puede poner un monstruo fuera de todo respawn',
            !fuera.ok && fuera.problema === Marcadores.MOTIVO_MONSTRUO_FUERA,
            'es la regla que pidio el usuario, y se dice con un mensaje en vez de no hacer nada');

        const segundo = mapa.anadirMonstruo(12, 11, 0, 'Cave Rat', 30000);

        check('pero si se pueden poner varios monstruos DENTRO del mismo respawn',
            segundo.ok && segundo.respawn.monsters.length === 2 &&
            segundo.respawn.monsters[1].name === 'Cave Rat' &&
            segundo.respawn.monsters[1].x === 12,
            segundo.respawn.monsters.length + ' monstruos en el mismo respawn, cada uno en su casilla');

        const repetido = mapa.anadirMonstruo(12, 11, 0, 'Rat', 60000);

        check('y no se apilan dos monstruos en la misma casilla',
            !repetido.ok && /ya tiene al monstruo/.test(repetido.problema),
            repetido.problema);

        // --- Mover un monstruo dentro de su area ---
        const clave = mapa.claveDe(creado.respawn);

        // Se suelta la selección a propósito: `anadirMonstruo` deja elegido el monstruo que
        // acaba de poner, y sin soltarla esto probaría el camino de mover en vez del de avisar.
        mapa.limpiarSeleccion();

        const sinElegir = mapa.moverMonstruo(11, 11, 0);
        check('mover exige haber elegido antes un monstruo',
            !sinElegir.ok && /hay que elegirlo antes/.test(sinElegir.problema),
            sinElegir.problema);

        mapa.seleccionarMonstruo(clave, 0);
        const movido = mapa.moverMonstruo(8, 8, 0);

        check('un monstruo se puede mover dentro de su respawn',
            movido.ok && mapa.spawns[0].monsters[0].x === 8 &&
            mapa.spawns[0].monsters[0].y === 8,
            'y la casilla es lo que decide donde aparece y a donde vuelve');

        const fueraDelArea = mapa.moverMonstruo(20, 20, 0);

        check('y no se puede mover fuera del area',
            !fueraDelArea.ok && /fuera de un respawn/.test(fueraDelArea.problema),
            fueraDelArea.problema);

        // --- Redimensionar el area ---
        const encogido = mapa.cambiarRadioDeRespawn(clave, 1);

        check('no se puede encoger el area dejando un monstruo fuera',
            !encogido.ok && /se quedaria/.test(encogido.problema) &&
            mapa.spawns[0].radius === 3,
            encogido.problema);

        const crecido = mapa.cambiarRadioDeRespawn(clave, 5);

        check('pero si se puede agrandar',
            crecido.ok && crecido.cambiado && mapa.spawns[0].radius === 5,
            'radio ' + mapa.spawns[0].radius);

        check('y al redimensionar, la seleccion se recoloca sola',
            mapa.seleccion.clave === mapa.claveDe(mapa.spawns[0]) && mapa.seleccion.clave !== clave,
            'la clave de un respawn incluye su radio: si no se recolocara, el panel se quedaria ' +
            'hablando de un respawn que ya no existe');

        const mismo = mapa.cambiarRadioDeRespawn(mapa.claveDe(mapa.spawns[0]), 5);
        check('y poner el mismo radio no cuenta como cambio',
            mismo.ok && mismo.cambiado === false);

        const intervalo = mapa.cambiarIntervaloDeRespawn(mapa.claveDe(mapa.spawns[0]), 45000);

        check('el intervalo se cambia para todo el respawn',
            intervalo.ok && mapa.spawns[0].interval === 45000 &&
            mapa.spawns[0].monsters.every((monstruo) => monstruo.interval === 45000),
            'el formato admite un intervalo por monstruo; el editor los mantiene iguales porque ' +
            'la unidad con la que se trabaja es el respawn');

        const cambiado = mapa.cambiarMonstruo(mapa.claveDe(mapa.spawns[0]), 1, 'Wolf');

        check('y el monstruo de una casilla se puede cambiar por otro',
            cambiado.ok && mapa.spawns[0].monsters[1].name === 'Wolf' &&
            cambiado.antes === 'Cave Rat',
            'de Cave Rat a Wolf, avisando de cual era');

        // --- Quitar monstruos, y el respawn cuando se queda vacio ---
        const claveFinal = mapa.claveDe(mapa.spawns[0]);
        const primero = mapa.quitarMonstruo(claveFinal, 0);

        check('quitar un monstruo deja a los demas',
            primero.ok && primero.respawnBorrado === false &&
            mapa.spawns[0].monsters.length === 1);

        const ultimo = mapa.quitarMonstruo(claveFinal, 0);

        check('y quitar el ultimo se lleva el respawn, diciendolo',
            ultimo.ok && ultimo.respawnBorrado === true &&
            /se ha borrado tambien el respawn/.test(ultimo.aviso) &&
            mapa.spawns.length === 0,
            'un respawn sin monstruos no se puede escribir en el archivo, asi que no puede ' +
            'quedarse a medias sin avisar');
    }

    {
        // --- Los NPC ---
        const mapa = new EditorMap({
            name: 'npcs', width: 32, height: 32, floors: 2,
            defaultGround: { 0: 102 }, fallbackGround: 102, tiles: []
        }, itemTypes, npcTypesReales);

        const colocado = mapa.ponerNpc(10, 10, 0, 'Herrero', '');

        check('se coloca un NPC de la lista de npcs.xml',
            colocado.ok && colocado.npc.radius === null &&
            mapa.npcEn(10, 10, 0).name === 'Herrero',
            'sin radio en el mapa, que significa «manda npcs.xml»');

        check('y su radio de paseo es el del XML',
            mapa.radioDeNpc(mapa.npcEn(10, 10, 0)) === 3,
            'el herrero pasea 3 casillas: es una decision ya tomada de este proyecto');

        const conRadio = mapa.ponerNpc(11, 10, 0, 'Herrero', 0);

        check('y el radio del MAPA manda sobre el del XML, incluido el cero',
            conRadio.ok && mapa.radioDeNpc(mapa.npcEn(11, 10, 0)) === 0,
            'en Remere\'s un NPC no pasea; aqui si, y por colocacion se puede dejar quieto');

        const repetido = mapa.ponerNpc(10, 10, 0, 'Guia', '');

        check('y no se apilan dos NPC en la misma casilla',
            !repetido.ok && /ya tiene un NPC/.test(repetido.problema),
            repetido.problema);

        const respawnCerca = mapa.ponerRespawn(20, 20, 0, 'Rat', 3, 60000);

        check('se puede poner un respawn lejos de los NPC',
            respawnCerca.ok);

        const enLaCasillaDelMonstruo = mapa.ponerNpc(20, 20, 0, 'Guia', '');

        check('pero no un NPC encima de un monstruo de un respawn',
            !enLaCasillaDelMonstruo.ok && /se pondria encima/.test(enLaCasillaDelMonstruo.problema),
            enLaCasillaDelMonstruo.problema);

        const dentroDelRespawn = mapa.ponerNpc(21, 21, 0, 'Guia', '');

        check('y dentro de un respawn se permite, avisando',
            dentroDelRespawn.ok && /queda DENTRO del respawn/.test(dentroDelRespawn.aviso),
            'el motor admite las dos criaturas y el formato lo escribe: prohibirlo seria ' +
            'inventarse una regla, pero callarlo seria peor');

        const claveNpc = '10,10,0';
        const cambiadoNpc = mapa.cambiarNpc(claveNpc, { name: 'Sanador', radius: '' });

        check('se puede cambiar el NPC y volver a dejar su radio en manos del XML',
            cambiadoNpc.ok && mapa.npcEn(10, 10, 0).name === 'Sanador' &&
            mapa.npcEn(10, 10, 0).radius === null,
            'vacio es «manda npcs.xml», distinto de cero');

        const quitado = mapa.quitarNpc(claveNpc);

        check('y se puede quitar',
            quitado.ok && quitado.npc.name === 'Sanador' && mapa.npcEn(10, 10, 0) === null);

        // --- Elegir lo que hay en una casilla ---
        const elMonstruo = mapa.seleccionar(20, 20, 0);
        const elNpc = mapa.seleccionar(11, 10, 0);
        const elArea = mapa.seleccionar(18, 18, 0);
        const nada = mapa.seleccionar(30, 30, 0);

        check('elegir una casilla con monstruo elige el MONSTRUO, no el area',
            elMonstruo.ok && elMonstruo.marcador.tipo === 'monstruo',
            'lo que se quiere tocar al pinchar la casilla de una rata es la rata');

        check('y una casilla con NPC elige el NPC, y elegir en el area elige el respawn',
            elNpc.ok && elNpc.marcador.tipo === 'npc' &&
            elArea.ok && elArea.marcador.tipo === 'respawn',
            'el area se elige en cualquier casilla suya que no tenga un monstruo');

        check('y elegir donde no hay nada lo dice',
            !nada.ok && /no hay ningun respawn/.test(nada.problema),
            nada.problema);

        mapa.limpiarSeleccion();
        check('y se puede soltar la seleccion', mapa.seleccion === null);
    }

    {
        // --- Lo que se manda al guardar ---
        const mapa = new EditorMap({
            name: 'pendiente', width: 16, height: 16, floors: 2,
            defaultGround: { 0: 102 }, fallbackGround: 102, tiles: [],
            spawns: [{ x: 5, y: 5, z: 0, monster: 'Rat', interval: 60000, radius: 3 }],
            npcs: [{ x: 6, y: 6, z: 0, name: 'Guia' }]
        }, itemTypes, npcTypesReales);

        check('sin tocar nada no se manda ni una lista de respawns',
            mapa.pendiente().spawns === undefined && mapa.pendiente().npcs === undefined &&
            mapa.stats().pending === 0,
            'asi un guardado que solo pinta un muro no reescribe los respawns del mapa entero');

        mapa.ponerRespawn(9, 9, 0, 'Wolf', 2, 60000);
        const pendiente = mapa.pendiente();

        check('al tocar un respawn se mandan TODOS, en la forma del archivo',
            Array.isArray(pendiente.spawns) && pendiente.spawns.length === 2 &&
            pendiente.spawns[0].monsters[0].x === null &&
            pendiente.spawns[1].monsters[0].x === 9,
            'la lista entera es el estado final: un monstruo de la forma antigua viaja SIN ' +
            'casilla, que es lo que impide que guardar le cambie el comportamiento');

        check('y el monstruo antiguo conserva su ausencia de casilla al ir y volver',
            mapa.spawnsFinales()[0].monsters[0].x === null &&
            Object.prototype.hasOwnProperty.call(mapa.spawnsFinales()[0].monsters[0], 'x'),
            'se manda `null` explicitamente: el escritor sabe omitirlo y el cargador sabe leerlo');

        mapa.ponerNpc(7, 7, 0, 'Tendero', '');
        check('y al tocar un NPC se mandan todos los NPC',
            Array.isArray(mapa.pendiente().npcs) && mapa.pendiente().npcs.length === 2 &&
            mapa.stats().pending === 2);

        mapa.clearDirty();
        check('y guardar limpia las dos cosas: casillas y marcadores',
            mapa.stats().pending === 0 && mapa.pendiente().spawns === undefined &&
            mapa.marcadoresPendientes() === 0,
            'si solo se limpiaran las casillas, el respawn se volveria a mandar en cada guardado');
    }

    // =======================================================================
    section('10. El dibujo de los marcadores, sin abrir un navegador');
    // =======================================================================

    {
        const mapa = new EditorMap({
            name: 'dibujo', width: 32, height: 32, floors: 2,
            defaultGround: { 0: 102 }, fallbackGround: 102, tiles: [],
            waypoints: { templo: [4, 4, 0], otra_planta: [4, 4, 1] },
            spawns: [{
                x: 10, y: 10, z: 0, radius: 3,
                monsters: [
                    { name: 'Rat', x: 10, y: 10 },
                    { name: 'Rat', x: 8, y: 12 },
                    { name: 'Cave Rat' }
                ]
            }],
            npcs: [{ x: 20, y: 20, z: 0, name: 'Herrero' }]
        }, itemTypes, npcTypesReales);

        const marcas = Marcadores.marcadoresDePlanta(mapa, 0, null);
        const porTipo = (tipo) => marcas.filter((marca) => marca.tipo === tipo);

        check('una planta da el area, un marcador por monstruo CON casilla, el NPC y el waypoint',
            porTipo('respawn').length === 1 && porTipo('monstruo').length === 2 &&
            porTipo('npc').length === 1 && porTipo('waypoint').length === 1,
            marcas.length + ' marcadores: ' + JSON.stringify(marcas.map((m) => m.tipo)));

        check('y el monstruo sin casilla NO se dibuja: se cuenta en la etiqueta',
            porTipo('monstruo').every((marca) => marca.x === 10 || marca.x === 8) &&
            /Cave Rat/.test(porTipo('respawn')[0].etiqueta) &&
            /1 en el area/.test(porTipo('respawn')[0].etiqueta),
            porTipo('respawn')[0].etiqueta);

        check('y solo se dibuja la planta que se esta mirando',
            Marcadores.marcadoresDePlanta(mapa, 1, null).every((marca) => marca.tipo === 'waypoint'),
            'el waypoint de la planta 1 si, y los respawns y NPC de la planta 0 no');

        check('los tres tipos de marcador tienen colores distintos',
            Marcadores.COLOR_RESPAWN !== Marcadores.COLOR_NPC &&
            Marcadores.COLOR_RESPAWN !== Marcadores.COLOR_WAYPOINT &&
            Marcadores.COLOR_NPC !== Marcadores.COLOR_WAYPOINT,
            'morado el respawn, verde el NPC y amarillo el waypoint: confundir un respawn con ' +
            'un NPC es poner un monstruo donde se queria un tendero');

        check('el NPC dice DE DONDE sale su radio de paseo',
            /Herrero/.test(porTipo('npc')[0].etiqueta) &&
            /radio 3/.test(porTipo('npc')[0].etiqueta) &&
            /npcs\.xml/.test(porTipo('npc')[0].etiqueta),
            porTipo('npc')[0].etiqueta + '  (en Remere\'s un NPC no pasea; aqui si)');
    }

    {
        // --- El area se dibuja con el radio del formato, en su sitio ---
        const area = { tipo: 'respawn', x: 0, y: 0, radio: 3, etiqueta: 'Rat x2  radio 3', color: Marcadores.COLOR_RESPAWN, colorClaro: Marcadores.COLOR_RESPAWN_CLARO, seleccionado: false };

        const ctx = contextoFalso();
        Marcadores.dibujarMarcador(ctx, area, { x: 100, y: 200, paso: 32, etiqueta: true, t: 0 });

        const rectangulos = llamadas(ctx.ops, 'strokeRect');

        check('el radio se dibuja como un cuadrado de lado 2*radio+1 casillas',
            rectangulos.length === 1 &&
            rectangulos[0].args[2] === 7 * 32 && rectangulos[0].args[3] === 7 * 32,
            'radio 3 con casillas de 32 px: ' + JSON.stringify(rectangulos[0].args));

        check('y el cuadrado queda CENTRADO en la casilla del respawn',
            rectangulos[0].args[0] === 100 - 3 * 32 + 0.5 &&
            rectangulos[0].args[1] === 200 - 3 * 32 + 0.5,
            'de (' + rectangulos[0].args[0] + ',' + rectangulos[0].args[1] + ') a ' +
            '(' + (rectangulos[0].args[0] + rectangulos[0].args[2]) + ',' +
            (rectangulos[0].args[1] + rectangulos[0].args[3]) + ')');

        const discontinuos = llamadas(ctx.ops, 'setLineDash');

        check('y es DISCONTINUO, para que se lea como una zona y no como una linea del mapa',
            discontinuos.some((llamada) => llamada.args[0].length === 2) &&
            discontinuos.some((llamada) => llamada.args[0].length === 0),
            'a trazos mientras se dibuja y sin trazos al terminar');

        check('y el respawn se dibuja de color MORADO, que es lo que lo hace reconocible',
            valoresDe(ctx.ops, 'fillStyle').indexOf(Marcadores.COLOR_RESPAWN) !== -1 &&
            valoresDe(ctx.ops, 'strokeStyle').indexOf(Marcadores.COLOR_RESPAWN) !== -1,
            'como en Remere\'s Map Editor: quien lo haya usado lo reconoce sin que nadie se lo ' +
            'explique');

        check('y se le dibuja un fuego de verdad: curvas, nucleo y chispas',
            llamadas(ctx.ops, 'quadraticCurveTo').length >= 5 &&
            llamadas(ctx.ops, 'fill').length >= 4,
            llamadas(ctx.ops, 'quadraticCurveTo').length + ' curvas y ' +
            llamadas(ctx.ops, 'fill').length + ' rellenos');

        check('y su etiqueta dice que monstruos lleva y cuanto territorio tiene',
            llamadas(ctx.ops, 'fillText').length === 1 &&
            llamadas(ctx.ops, 'fillText')[0].args[0] === 'Rat x2  radio 3',
            'lo que el usuario pidio ver de un vistazo: que monstruo lleva y hasta donde llega');

        // --- El marcador elegido se distingue ---
        const elegidoCtx = contextoFalso();
        Marcadores.dibujarMarcador(elegidoCtx, { ...area, seleccionado: true },
            { x: 100, y: 200, paso: 32, etiqueta: false, t: 0 });

        check('el marcador elegido se dibuja distinto',
            llamadas(elegidoCtx.ops, 'fillRect').length === 1 &&
            valoresDe(elegidoCtx.ops, 'strokeStyle').indexOf('#ffffff') !== -1,
            'con un velo sobre el area y un anillo alrededor del fuego: con varios respawns ' +
            'pegados, el recuadro a secas no dice cual se ha elegido');

        // --- El monstruo de dentro: el mismo fuego, mas pequeno ---
        const monstruoCtx = contextoFalso();
        Marcadores.dibujarMarcador(monstruoCtx,
            { tipo: 'monstruo', x: 8, y: 12, radio: null, etiqueta: 'Rat', color: Marcadores.COLOR_RESPAWN, colorClaro: Marcadores.COLOR_RESPAWN_CLARO, seleccionado: false },
            { x: 300, y: 400, paso: 32, etiqueta: true, t: 0 });

        const halos = llamadas(monstruoCtx.ops, 'arc');

        check('un monstruo del respawn es el MISMO fuego, mas pequeno',
            halos.length > 0 && Math.abs(halos[0].args[2] - 32 * 0.62 * 0.45) < 1e-9,
            'mismo dibujo y menor tamano: es lo que hace evidente que ese monstruo pertenece a ' +
            'ese respawn');

        check('y un monstruo no lleva etiqueta: la del area ya los cuenta',
            llamadas(monstruoCtx.ops, 'fillText').length === 0);

        // --- El NPC, en verde y sin confundirse ---
        const npcCtx = contextoFalso();
        Marcadores.dibujarMarcador(npcCtx,
            { tipo: 'npc', x: 20, y: 20, radio: 3, etiqueta: 'Herrero  radio 3 (npcs.xml)', color: Marcadores.COLOR_NPC, colorClaro: Marcadores.COLOR_NPC_CLARO, seleccionado: false },
            { x: 0, y: 0, paso: 32, etiqueta: true, t: 0 });

        check('el NPC se dibuja en VERDE y con su propio radio',
            valoresDe(npcCtx.ops, 'fillStyle').indexOf(Marcadores.COLOR_NPC) !== -1 &&
            llamadas(npcCtx.ops, 'strokeRect').length === 1 &&
            llamadas(npcCtx.ops, 'strokeRect')[0].args[2] === 7 * 32,
            'el radio que se dibuja es el de paseo: el del mapa si lo dice, y si no el de npcs.xml');

        check('y no se le cuela ni un solo trazo del color del respawn',
            valoresDe(npcCtx.ops, 'fillStyle').indexOf(Marcadores.COLOR_RESPAWN) === -1 &&
            valoresDe(npcCtx.ops, 'strokeStyle').indexOf(Marcadores.COLOR_RESPAWN) === -1,
            'dos colores distintos o no sirven para distinguirlos');

        // --- Con el mapa muy alejado no se dibujan etiquetas que no caben ---
        const pequeno = contextoFalso();
        Marcadores.dibujarMarcador(pequeno, area, { x: 0, y: 0, paso: 8, etiqueta: true, t: 1500 });

        check('sin sitio para el texto no se dibuja la etiqueta, pero si el area',
            llamadas(pequeno.ops, 'fillText').length === 0 &&
            llamadas(pequeno.ops, 'strokeRect').length === 1,
            'a 8 px por casilla una etiqueta es un borron encima del mapa');
    }

    // =======================================================================
    section('11. La mano, el pincel y el objeto elegido del mapa');
    // =======================================================================

    {
        /*
         * LA GEOMETRÍA Y EL COLOR, SIN NAVEGADOR. Es el mismo reparto que `marcadores.js` y
         * `viewport.js`: lo que se puede equivocar de verdad —de qué casilla cuelga el cuadro del
         * pincel, de qué color se ve lo elegido, en qué orden se dibuja una pila— es cálculo puro,
         * y el lienzo sólo lo pinta. El cableado de los botones vive en `main.js`, que no se
         * importa aquí porque toca el DOM al arrancar.
         */
        const Pincel = await import('../editor/js/pincel.js');
        const Tintes = await import('../editor/js/tintes.js');
        const Detalle = await import('../editor/js/detalle.js');
        const Peso = require('../engine/world/weight');

        // --- La geometría del pincel ---
        check('un pincel de 1x1 pinta la casilla que hay bajo el raton',
            JSON.stringify(Pincel.casillasDelPincel(5, 7, 1)) === '[{"x":5,"y":7}]',
            'es el de siempre, y el unico que no cambia nada');

        const cuadro3 = Pincel.casillasDelPincel(5, 7, 3);

        check('y un 3x3 pinta el cuadro entero, con la casilla del raton como ESQUINA',
            cuadro3.length === 9 && cuadro3[0].x === 5 && cuadro3[0].y === 7 &&
            cuadro3[8].x === 7 && cuadro3[8].y === 9,
            'de (5,7) a (7,9): el cuadro cuelga de la esquina de arriba a la izquierda y crece ' +
            'hacia abajo y a la derecha');

        const cuadro2 = Pincel.casillasDelPincel(5, 7, 2);

        check('un 2x2 no tiene casilla central, y por eso el cuadro cuelga de una esquina',
            cuadro2.length === 4 && cuadro2[0].x === 5 && cuadro2[3].x === 6 &&
            cuadro2[3].y === 8,
            'centrado habria que elegir entre dos casillas centrales, y el cuadro saltaria media ' +
            'casilla al pasar de 1x1 a 2x2: el raton dejaria de estar donde se cree');

        check('el pincel tiene tope y no acepta tamanos rotos',
            Pincel.limitarTamano(0) === 1 && Pincel.limitarTamano(-3) === 1 &&
            Pincel.limitarTamano(NaN) === 1 && Pincel.limitarTamano('4') === 4 &&
            Pincel.limitarTamano(99) === Pincel.TAMANO_MAXIMO,
            'un cero o un NaN pintarian nada, o vete a saber que: el tope es ' +
            Pincel.TAMANO_MAXIMO + 'x' + Pincel.TAMANO_MAXIMO);

        check('y se para en los extremos en vez de dar la vuelta',
            Pincel.siguienteTamano(1, -1) === 1 && Pincel.siguienteTamano(2, 1) === 3 &&
            Pincel.siguienteTamano(Pincel.TAMANO_MAXIMO, 1) === Pincel.TAMANO_MAXIMO,
            'un «+» de mas no puede convertir el pincel en diminuto sin que nadie lo espere');

        check('el tamano se enseña como NxN y dice cuantas casillas son',
            Pincel.nombreDeTamano(3) === '3x3' && Pincel.nombreDeTamano(1) === '1x1' &&
            Pincel.cuantasCasillas(4) === 16,
            'decir «4 casillas» cuando son 16 es una forma comoda de pintar de mas');

        const recortado = Pincel.casillasDelPincel(6, 6, 4, (x, y) => x < 8 && y < 8);

        check('el cuadro se recorta al mapa y no escribe fuera de el',
            recortado.length === 4 &&
            JSON.stringify(recortado) === '[{"x":6,"y":6},{"x":7,"y":6},{"x":6,"y":7},{"x":7,"y":7}]',
            'un 4x4 pegado a la esquina del mapa pinta 4 casillas y no 16');

        // --- Los tintes: el fantasma, el verde del elegido y el morado del respawn ---
        check('sin nada en la mano NO hay fantasma, y con algo si',
            Tintes.hayFantasma(null) === false && Tintes.hayFantasma({}) === false &&
            Tintes.hayFantasma({ typeId: 111 }) === true,
            'es la mitad de la respuesta a «¿como se que no llevo nada?»: un fantasma que se ' +
            'dibujara igual diria justo lo contrario');

        check('el fantasma se dibuja TRANSPARENTE, para saber que no esta puesto',
            Tintes.ALFA_FANTASMA > 0.3 && Tintes.ALFA_FANTASMA < 1,
            'alfa ' + Tintes.ALFA_FANTASMA + ': se distingue el objeto y se ve el mapa detras');

        check('el objeto elegido del mapa se tiñe de VERDE y lo de dentro de un respawn de MORADO',
            Tintes.tinteDeElemento({ elegido: true }) === Tintes.COLOR_ELEGIDO &&
            Tintes.tinteDeElemento({ enRespawn: true }) === Tintes.COLOR_EN_RESPAWN &&
            Tintes.tinteDeElemento({}) === null,
            'dos tintes distintos para dos preguntas distintas: que llevo elegido y que es de ' +
            'este respawn');

        check('y el VERDE manda sobre el morado: elegir algo dentro de un respawn se tiene que ver',
            Tintes.tinteDeElemento({ elegido: true, enRespawn: true }) === Tintes.COLOR_ELEGIDO,
            'si el morado ganara, elegir un objeto dentro de un area no se notaria, y elegir es ' +
            'lo que se esta haciendo en ese momento');

        check('el suelo NO se tiñe por estar dentro de un respawn',
            Tintes.tinteDeElemento({ enRespawn: true, esSuelo: true }) === null,
            'el area ya lleva su velo morado encima; teñir ademas el dibujo del suelo ' +
            'convertiria un respawn grande en una mancha donde no se distingue el terreno');

        check('`conAlfa` pone transparencia a un color, y no se la inventa a lo que no entiende',
            Tintes.conAlfa('#b06cff', 0.45) === 'rgba(176, 108, 255, 0.45)' &&
            Tintes.conAlfa('#fff', 1) === 'rgba(255, 255, 255, 1)' &&
            Tintes.conAlfa('azul', 0.5) === null,
            'devolver `null` se ve raro y teñirlo todo de negro se ve roto: se prefiere lo raro');

        check('el morado del tinte es el mismo que el del fuego del respawn',
            Tintes.COLOR_EN_RESPAWN === Tintes.conAlfa(Marcadores.COLOR_RESPAWN, 0.45),
            Tintes.COLOR_EN_RESPAWN + ': dos morados para la misma idea dejarian de verse como ' +
            'la misma cosa');

        check('el color de «sin suelo» es el mismo con el que el cliente limpia su lienzo',
            Tintes.COLOR_SIN_SUELO === '#101014',
            'el suelo de la hoja tiene pixeles transparentes: en el juego se ve ese fondo por ' +
            'los agujeros, asi que en el editor tiene que verse el mismo');

        check('y el velo del area elegida es mas fuerte que el de las demas',
            Marcadores.alfaDelVelo(true) > Marcadores.alfaDelVelo(false) &&
            Marcadores.alfaDelVelo(false) > 0 && Marcadores.alfaDelVelo(true) < 1,
            'con dos respawns pegados, el velo mas fuerte es lo unico que dice cual esta elegido');

        // --- La ficha del objeto elegido ---
        const filasMuro = Detalle.filasDeDetalle({
            definicion: itemTypes.get(111), id: 111, stackpos: 2, z: 7, x: 3, y: 4, banda: 'abajo'
        });
        const valor = (etiqueta) => (filasMuro.find((fila) => fila.etiqueta === etiqueta) || {}).valor;

        check('la ficha dice el id, el nombre, la casilla, la planta y la posicion en la pila',
            valor('Id') === '111' && valor('Nombre') === 'stone wall' &&
            valor('Casilla') === '3,4,7' && valor('Planta') === 'planta 7 (superficie)' &&
            /posicion 2/.test(valor('Pila')) && /debajo de las criaturas/.test(valor('Banda')));

        check('y sus banderas, con lo que significa cada una',
            filasMuro.some((fila) => fila.etiqueta === 'blocksSolid = 1' &&
                fila.valor === 'impide caminar') &&
            filasMuro.some((fila) => fila.etiqueta === 'blocksProjectile = 1'),
            'es la misma tabla de propiedades que rellena el formulario de items.xml, no otra ' +
            'lista que se pueda desincronizar');

        const filasMesa = Detalle.filasDeDetalle({
            definicion: itemTypes.get(113), id: 113, stackpos: 1, z: 7, x: 0, y: 0, banda: 'arriba'
        });

        check('la mesa dice que va ENCIMA de las criaturas, que es lo que la dibuja despues',
            filasMesa.some((fila) => fila.etiqueta === 'alwaysOnTop = 1' &&
                /encima de las criaturas/.test(fila.valor)) &&
            filasMesa.some((fila) => fila.etiqueta === 'Banda' &&
                /encima de las criaturas/.test(fila.valor)));

        const filasMoneda = Detalle.filasDeDetalle({
            definicion: itemTypes.get(3031), id: 3031, stackpos: 1, z: 7, x: 0, y: 0, banda: 'abajo'
        });

        check('y la moneda dice que se coge y cuanto pesa',
            filasMoneda.some((fila) => fila.etiqueta === 'pickupable = 1' &&
                /se puede recoger/.test(fila.valor)) &&
            filasMoneda.some((fila) => fila.etiqueta === 'Peso' && fila.valor === '0.10 oz'),
            '10 centesimas de onza: el peso se dice como lo dice el motor');

        check('el peso del editor y el del MOTOR dicen lo mismo',
            [0, 10, 250, 950, 4200, 10000].every((unidades) =>
                Detalle.formatoDePeso(unidades) === Peso.formatWeight(unidades)),
            'son dos cuentas distintas porque el editor no puede importar el modulo CommonJS ' +
            'del motor; lo que impide que se separen es esta comprobacion');

        const filasRaras = Detalle.filasDeDetalle({
            definicion: null, id: 99999, stackpos: 1, z: 8, x: 0, y: 0, banda: 'abajo'
        });

        check('un objeto que ya no esta en items.xml lo DICE, no se calla',
            filasRaras.some((fila) => fila.etiqueta === 'Nombre' && /sin definir/.test(fila.valor)) &&
            filasRaras.some((fila) => fila.etiqueta === 'Peso' && fila.valor === 'no lo declara') &&
            filasRaras.some((fila) => fila.etiqueta === 'Planta' && /subsuelo/.test(fila.valor)),
            'una casilla puede tener un objeto borrado del catalogo, y el editor tiene que ' +
            'poder decirlo en vez de enseñar un hueco');

        // --- La pila de una casilla: el orden de DIBUJO ---
        const crudoPila = {
            name: 'pila', width: 16, height: 16, floors: 2,
            defaultGround: { 0: 102 }, fallbackGround: 102,
            tiles: [{
                x: 2, y: 2, z: 0, ground: 104,
                // La mesa (siempre encima) esta escrita ENTRE la moneda y el muro, y aun asi se
                // dibuja la ultima: eso es lo que el orden del archivo no dice y la pila si.
                items: [{ id: 3031 }, { id: 113 }, { id: 111 }]
            }]
        };
        const mapaPila = new EditorMap(crudoPila, itemTypes);

        const pila = mapaPila.pilaDe(2, 2, 0);

        check('la pila se lee en el orden en que se DIBUJA, con el suelo en la posicion 0',
            pila.length === 4 && pila[0].esSuelo && pila[0].stackpos === 0 &&
            pila[1].nombre === 'gold coin' && pila[2].nombre === 'stone wall' &&
            pila[3].nombre === 'table' && pila[3].banda === 'arriba',
            pila.map((ficha) => ficha.nombre).join(' + ') +
            ': el motor dibuja suelo, items de abajo y items de arriba');

        const elegidoArriba = mapaPila.seleccionarObjeto(2, 2, 0);

        check('pinchar una casilla elige el objeto de MAS ARRIBA, que es el que se ve',
            elegidoArriba.ok && elegidoArriba.objeto.id === 113 &&
            elegidoArriba.objeto.stackpos === 3 && elegidoArriba.objeto.esSuelo === false,
            'con cinco cosas apiladas, lo que se coge al pinchar es la de encima');

        check('y se puede elegir otra por su posicion en la pila',
            mapaPila.seleccionarObjeto(2, 2, 0, 1).ok &&
            mapaPila.objetoElegido().id === 3031 && mapaPila.objetoElegido().stackpos === 1,
            'las demas posiciones estan en la lista del panel para poder trabajar con un objeto ' +
            'que esta debajo de otro');

        /*
         * MOVER DE VERDAD. El orden de la pila es el de dibujo, asi que subir un objeto tiene que
         * cambiar lo que se ve Y lo que se escribe: si solo cambiara el numerito que se enseña,
         * seria peor que no hacer nada, porque el editor mentiria.
         */
        const pilaAntes = mapaPila.getTile(2, 2, 0).items.map((item) => item.id).join(',');
        const movimiento = mapaPila.moverObjetoEnPila(1);
        const pilaDespues = mapaPila.getTile(2, 2, 0).items.map((item) => item.id).join(',');

        check('subir un objeto en la pila CAMBIA EL ORDEN DE VERDAD, no solo el numerito',
            movimiento.ok && pilaAntes === '3031,111,113' && pilaDespues === '111,3031,113' &&
            mapaPila.pilaDe(2, 2, 0).map((ficha) => ficha.nombre).join(' + ') ===
                'stone floor + stone wall + gold coin + table',
            'la moneda pasa a dibujarse debajo del muro, y el archivo lo dice en el mismo orden');

        check('y el objeto elegido sigue siendo el mismo despues de moverse',
            mapaPila.objetoElegido().id === 3031 && mapaPila.objetoElegido().stackpos === 2,
            'la seleccion sigue al objeto, no a la posicion que tenia');

        check('y bajarlo lo devuelve a donde estaba',
            mapaPila.moverObjetoEnPila(-1).ok &&
            mapaPila.pilaDe(2, 2, 0).map((ficha) => ficha.nombre).join(' + ') ===
                'stone floor + gold coin + stone wall + table');

        // Los dos casos en que mover NO puede cambiar nada, y por eso se dice en vez de hacerlo.
        mapaPila.seleccionarObjeto(2, 2, 0, 0);
        const sueloQuieto = mapaPila.moverObjetoEnPila(1);

        check('el suelo no se mueve en la pila: hay uno y va siempre abajo del todo',
            sueloQuieto.ok === false && /suelo/.test(sueloQuieto.problema), sueloQuieto.problema);

        mapaPila.seleccionarObjeto(2, 2, 0, 2);
        const cruzar = mapaPila.moverObjetoEnPila(1);

        check('un objeto no puede cruzar la frontera entre las dos bandas, y lo dice',
            cruzar.ok === false && /alwaysOnTop/.test(cruzar.problema) &&
            mapaPila.pilaDe(2, 2, 0).map((ficha) => ficha.nombre).join(' + ') ===
                'stone floor + gold coin + stone wall + table',
            'la banda la decide la bandera del objeto y no el orden del archivo: reordenar sin ' +
            'cambiar el dibujo seria cambiar el numerito y nada mas');

        check('y arriba del todo tampoco se puede subir mas',
            mapaPila.seleccionarObjeto(2, 2, 0, 3).ok &&
            mapaPila.moverObjetoEnPila(1).ok === false,
            'la mesa ya esta arriba del todo: mas alla no hay nada que la tape');

        // --- Borrar el objeto elegido ---
        mapaPila.seleccionarObjeto(2, 2, 0, 1);
        const borrado = mapaPila.borrarObjetoElegido();
        const edicionPila = mapaPila.edits().find((edicion) =>
            edicion.x === 2 && edicion.y === 2 && edicion.z === 0);

        check('borrar el objeto elegido lo quita de la casilla y de lo que se guarda',
            borrado.ok && borrado.borrado.id === 3031 &&
            mapaPila.getTile(2, 2, 0).items.map((item) => item.id).join(',') === '111,113' &&
            edicionPila.items.map((item) => item.id).join(',') === '113,111' &&
            edicionPila.ground === 104,
            'la edicion que viaja al servidor lleva la pila con el objeto quitado, y el suelo ' +
            'intacto');

        check('y soltar la seleccion no borra nada',
            mapaPila.soltarObjeto() === mapaPila && mapaPila.objetoElegido() === null &&
            mapaPila.getTile(2, 2, 0).items.length === 2);

        mapaPila.seleccionarObjeto(2, 2, 0, 0);
        const sinSuelo = mapaPila.borrarObjetoElegido();

        check('borrar el suelo devuelve la casilla al suelo por defecto de su planta',
            sinSuelo.ok && sinSuelo.borrado.esSuelo === true &&
            mapaPila.tileAt(2, 2, 0).ground === null &&
            mapaPila.groundAt(2, 2, 0) === 102 && /102/.test(sinSuelo.aviso),
            'el suelo por defecto no se pierde: sigue en `defaultGround` del mapa');

        check('y elegir donde no hay nada lo dice en vez de no hacer nada',
            mapaPila.seleccionarObjeto(9, 9, 0).ok === false &&
            mapaPila.objetoElegido() === null &&
            /suelo por defecto de la planta/.test(mapaPila.seleccionarObjeto(9, 9, 0).problema),
            'una casilla vacia no tiene pila que enseñar, pero SI tiene el suelo de su planta, y ' +
            'eso se dice en vez de decir que no hay suelo');

        // --- Que casillas tienen que quedarse SIN el fondo de la planta ---
        /*
         * ESTA ES LA MITAD COMPROBABLE DEL ARREGLO DEL SUELO QUE SE APILABA. El lienzo pinta el
         * suelo por defecto de la planta como un fondo de un solo rectángulo, y encima el suelo
         * propio de cada casilla; como el de la hoja tiene píxeles transparentes, por los agujeros
         * se veía el de la planta y parecían dos. Lo que decide qué casillas hay que dejar sin
         * fondo es esto, y es lo que se comprueba aquí.
         */
        const crudoFondo = {
            name: 'fondo', width: 4, height: 4, floors: 2,
            defaultGround: { 0: 102, 1: 104 }, fallbackGround: 102,
            tiles: [
                { x: 1, y: 1, z: 0, ground: 104 },
                { x: 2, y: 1, z: 0, items: [{ id: 111 }] },
                { x: 3, y: 1, z: 0, ground: 105 },
                { x: 3, y: 3, z: 1, ground: 103 }
            ]
        };
        const mapaFondo = new EditorMap(crudoFondo, itemTypes);

        const conSueloPropio = mapaFondo.casillasConSueloPropio(0);

        check('el lienzo sabe que casillas tienen que quedarse SIN el fondo de la planta',
            conSueloPropio.length === 2 &&
            conSueloPropio.every((casilla) => mapaFondo.getTile(casilla.x, casilla.y, 0).ownGround) &&
            !conSueloPropio.some((casilla) => casilla.x === 2 && casilla.y === 1),
            'las dos que el mapa escribe, y no la del muro, que lleva el suelo de su planta: sin ' +
            'borrarles el fondo, por los agujeros del suelo de la hoja se ve el de debajo');

        check('y solo se limpia la planta que se esta mirando',
            mapaFondo.casillasConSueloPropio(1).length === 1 &&
            mapaFondo.casillasConSueloPropio(1)[0].x === 3 &&
            mapaFondo.casillasConSueloPropio(1)[0].y === 3);

        check('y solo las que se ven, que es lo que la deja llamarse en cada fotograma',
            JSON.stringify(mapaFondo.casillasConSueloPropio(0, { x0: 2, y0: 0, x1: 3, y1: 1 })) ===
                '[{"x":3,"y":1}]' &&
            mapaFondo.casillasConSueloPropio(0, { x0: 0, y0: 0, x1: 0, y1: 0 }).length === 0,
            'el mapa de la ciudad tiene 2.825 casillas con suelo propio y a 1:1 se ven unas 250: ' +
            'borrar las 2.825 para pintar 250 es trabajo tirado');

        mapaFondo.paintGround(1, 1, 0, 103);
        mapaFondo.paintGround(1, 1, 0, 105);

        check('pintar un suelo encima de otro deja UNA sola casilla que limpiar, la ultima',
            mapaFondo.casillasConSueloPropio(0)
                .filter((casilla) => casilla.x === 1 && casilla.y === 1).length === 1 &&
            mapaFondo.tileAt(1, 1, 0).ground === 105,
            'en el archivo hay un unico `ground`: el viejo no se queda debajo ni en los datos ni ' +
            'en el dibujo, que es lo que el usuario veia como dos suelos apilados');

        // --- El pincel, sobre el mapa de verdad ---
        const pintadas = mapaFondo.pintarSueloEnCuadro(0, 0, 0, 2, 103);

        check('el pincel pinta el cuadro entero y no solo la casilla del raton',
            pintadas === 4 && mapaFondo.tileAt(0, 0, 0).ground === 103 &&
            mapaFondo.tileAt(1, 0, 0).ground === 103 &&
            mapaFondo.tileAt(0, 1, 0).ground === 103 &&
            mapaFondo.tileAt(1, 1, 0).ground === 103,
            'es lo que permite pintar un suelo de 2x2 de un clic en vez de cuatro');

        const enLaEsquina = mapaFondo.pintarSueloEnCuadro(3, 3, 0, 2, 104);

        check('y en la esquina del mapa se recorta, no escribe fuera',
            enLaEsquina === 1 && mapaFondo.tileAt(3, 3, 0).ground === 104 &&
            mapaFondo.tileAt(4, 3, 0) === null,
            'un 2x2 pegado a la ultima casilla pinta una: la de fuera no existe');

        const objetosPintados = mapaFondo.pintarObjetoEnCuadro(0, 2, 0, 2, 111, false);

        check('y vale igual para objetos que para suelos',
            objetosPintados === 4 && [[0, 2], [1, 2], [0, 3], [1, 3]].every(([x, y]) =>
                mapaFondo.getTile(x, y, 0) && mapaFondo.getTile(x, y, 0).items[0].id === 111),
            'el pincel es del editor, no de un tipo de objeto: por eso sigue puesto al cambiar ' +
            'de lo que se lleva en la mano');

        // --- El numero con el que el lienzo distingue un objeto elegido de sus vecinos ---
        const mapaIds = new EditorMap({
            name: 'ids', width: 4, height: 4, floors: 1,
            defaultGround: { 0: 102 }, fallbackGround: 102,
            tiles: [{ x: 0, y: 0, z: 0, items: [{ id: 113 }, { id: 111 }] }]
        }, itemTypes);

        const dibujo = mapaIds.getTile(0, 0, 0);

        check('cada objeto de la lista de dibujo lleva su posicion en la pila',
            dibujo.items.map((item) => item.id).join(',') === '111,113' &&
            dibujo.items.map((item) => item.instanceId).join(',') === '1,2' &&
            dibujo.downCount === 1,
            'sin ese numero, elegir un objeto teñiria la casilla entera y con ella los que no se ' +
            'han elegido');

        check('y la posicion que enseña la pila es la misma con la que numera el dibujo',
            mapaIds.pilaDe(0, 0, 0).map((ficha) => ficha.orden).join(',') ===
                dibujo.items.map((item) => item.instanceId).join(','),
            'si los dos numeraran distinto, el lienzo teñiria un objeto y el panel diria otro');
    }

    await tools.close();
    workspace.remove();


    // =======================================================================
    section('13. El pincel al borrar, su fantasma, el arrastre y la zona protegida');
    // =======================================================================

    {
        /*
         * GEOMETRÍA DE ESTADO, SIN NAVEGADOR, que es como se ha comprobado todo el editor.
         *
         * Lo que se prueba aquí son cuatro cosas que el usuario pidió y que no se pueden ver en un
         * pixel: cuántas casillas se lleva por delante la goma, qué fantasma enseña el ratón
         * mientras se va a borrar, qué le pasa a un respawn —y a sus monstruos— cuando se arrastra,
         * y qué le pasa a la pila de una casilla cuando se suelta encima un objeto que viene de
         * otra. Y la zona protegida, que es una bandera de casilla y se mueve como un bloque.
         *
         * EL VALIDADOR DEL MOTOR ENTRA EN JUEGO, y no es un adorno: mover un respawn tiene que dar
         * un mapa que `engine/world/loader.js` siga aceptando, porque un monstruo fuera de su
         * respawn es exactamente lo que rechaza al cargar. Se comprueba con `buildMap` sobre el
         * JSON que el editor mandaría al guardar.
         */
        const EditorMap = (await import('../editor/js/editormap.js')).EditorMap;
        const Fantasma = await import('../editor/js/fantasma.js');
        const Tintes = await import('../editor/js/tintes.js');

        /** Cuántos items de un tipo hay en TODO el mapa: es como se ve una duplicación. */
        function cuantosItems(mapa, id) {
            let total = 0;

            mapa.tiles.forEach((tile) => {
                tile.items.forEach((item) => {
                    if (Number(item.id) === Number(id)) {
                        total += 1;
                    }
                });
            });

            return total;
        }

        const monstruosDePrueba = new Map([['Rat', {}], ['Cave Rat', {}], ['Wolf', {}]]);

        // -------------------------------------------------------------------
        // 1. BORRAR CON EL PINCEL, que es lo que pidió el usuario
        // -------------------------------------------------------------------

        const goma = new EditorMap({
            format: 'jetyum-map', version: 1,
            name: 'goma', width: 16, height: 16, floors: 1,
            defaultGround: { 0: 102 }, fallbackGround: 102,
            tiles: []
        }, itemTypes);

        for (let y = 2; y <= 4; y += 1) {
            for (let x = 2; x <= 4; x += 1) {
                goma.paintGround(x, y, 0, 103);
                goma.paintItem(x, y, 0, 111);
            }
        }

        const gomaAntes = goma.stats().explicitTiles;
        goma.clearDirty();

        const borradas = goma.borrarEnCuadro(2, 2, 0, 3);
        const vacias = [];

        for (let y = 2; y <= 4; y += 1) {
            for (let x = 2; x <= 4; x += 1) {
                if (!goma.tileAt(x, y, 0)) {
                    vacias.push(x + ',' + y);
                }
            }
        }

        check('borrar con un pincel de 3x3 deja vacias las NUEVE casillas',
            borradas === 9 && vacias.length === 9 && gomaAntes === 9 &&
            goma.stats().explicitTiles === 0 && goma.groundAt(2, 2, 0) === 102,
            borradas + ' casilla(s) borradas y ' + vacias.length + ' vacias: la casilla vuelve al ' +
            'suelo por defecto de la planta (' + goma.groundAt(2, 2, 0) + '), que es lo que hace ' +
            'la goma de una en una');

        const edicionesDeBorrado = goma.edits();

        check('y lo que se guarda son NUEVE ediciones vacias, una por casilla borrada',
            edicionesDeBorrado.length === 9 && edicionesDeBorrado.every((edicion) =>
                edicion.ground === undefined && edicion.items === undefined &&
                edicion.flags === undefined),
            'una edicion sin suelo, sin items y sin banderas es un borrado: si no se marcaran ' +
            'las nueve, guardar dejaria ocho casillas sin borrar');

        // En la esquina del mapa el cuadro se recorta igual que al pintar: no inventa casillas.
        const enLaEsquinaGoma = new EditorMap({
            format: 'jetyum-map', version: 1,
            name: 'esquina', width: 8, height: 8, floors: 1,
            defaultGround: { 0: 102 }, fallbackGround: 102,
            tiles: [{ x: 7, y: 7, z: 0, ground: 104 }]
        }, itemTypes);

        check('y en la esquina del mapa borra las que existen, no las de fuera',
            enLaEsquinaGoma.borrarEnCuadro(6, 6, 0, 3) === 4 &&
            enLaEsquinaGoma.tileAt(7, 7, 0) === null &&
            enLaEsquinaGoma.tileAt(5, 5, 0) === null,
            'un 3x3 pegado a la ultima casilla borra cuatro: la de fuera no existe');

        // -------------------------------------------------------------------
        // 2. EL FANTASMA DEL BORRADO, que es lo que resuelve la objecion
        // -------------------------------------------------------------------

        const enLaMano = { typeId: 111, esSuelo: false, nombre: 'stone wall', tamano: 3 };
        const fantasmaGoma = Fantasma.fantasmaDeHerramienta('erase', null, false, 3);
        const fantasmaPincel = Fantasma.fantasmaDeHerramienta('paint', enLaMano, false, 3);

        /*
         * SE LEE CON ESTOS DOS ATAJOS Y NO CON `fantasma.algo` A SECAS, y no es adorno: si el
         * fantasma de borrar desapareciera —que es justo la regresión que estas comprobaciones
         * vigilan—, un acceso directo lanzaría un `TypeError` y la prueba se cortaría ahí, con lo
         * que las comprobaciones de debajo no se ejecutarían y no se vería CUÁNTAS cosas rompe. Un
         * fallo tiene que salir como un FAIL que se lee, no como una excepción que esconde el resto.
         */
        const claseDe = (fantasma) => (fantasma ? fantasma.clase : 'ninguno');
        const typeIdDe = (fantasma) => (fantasma ? fantasma.typeId : undefined);

        check('con la goma puesta el raton enseña el fantasma de BORRAR, y con un objeto en la mano el de pintar',
            claseDe(fantasmaGoma) === 'borrar' && fantasmaGoma.tamano === 3 &&
            fantasmaGoma.color === Tintes.COLOR_GOMA &&
            claseDe(fantasmaPincel) === 'pintar' &&
            typeIdDe(fantasmaPincel) === 111 && fantasmaPincel.color === Tintes.COLOR_PINCEL,
            'es lo que resuelve la objecion que tenia el pincel en el borrado: sin nada en la mano ' +
            'no habia fantasma que enseñara el bloque, y con esto SI lo hay');

        check('y los dos fantasmas NO se pueden confundir: uno lleva el dibujo del objeto y el otro no',
            typeIdDe(fantasmaPincel) === 111 && typeIdDe(fantasmaGoma) === undefined &&
            claseDe(fantasmaGoma) !== 'pintar',
            'azul con dibujo (pintar) frente a rojo sin dibujo (borrar): el mismo color diria ' +
            'cuantas casillas se tocan pero no QUE se les va a hacer');

        check('sin nada en la mano no hay fantasma, y con el boton derecho pulsado si —y es el de borrar',
            Fantasma.fantasmaDeHerramienta('objeto', null, false, 3) === null &&
            Fantasma.fantasmaDeHerramienta('flag', null, false, 3) === null &&
            claseDe(Fantasma.fantasmaDeHerramienta('paint', enLaMano, true, 3)) === 'borrar',
            'el boton derecho borra con la herramienta que sea, asi que mientras se mantiene ' +
            'pulsado el raton tiene que enseñar lo que se va a llevar por delante');

        const hover = { x: 2, y: 2 };
        const dentroDelMapa = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16;
        const pantallaDe = (casilla) => ({ x: casilla.x * 32, y: casilla.y * 32 });
        const casillasGoma = Fantasma.casillasDelFantasma(fantasmaGoma, hover, dentroDelMapa);
        const casillasPincel = Fantasma.casillasDelFantasma(fantasmaPincel, hover, dentroDelMapa);

        const ctxGoma = contextoFalso();
        Fantasma.dibujarFantasma(ctxGoma, fantasmaGoma,
            { casillas: casillasGoma, pantallaDe: pantallaDe, paso: 32, escala: 1, sprite: null });

        const rectangulosGoma = llamadas(ctxGoma.ops, 'fillRect');

        check('el fantasma del borrado enseña las NUEVE casillas del pincel, en rojo y SIN el dibujo del objeto',
            casillasGoma.length === 9 && rectangulosGoma.length === 9 &&
            rectangulosGoma.every((rectangulo, indice) =>
                rectangulo.args[0] === casillasGoma[indice].x * 32 &&
                rectangulo.args[1] === casillasGoma[indice].y * 32) &&
            valoresDe(ctxGoma.ops, 'fillStyle').indexOf(Tintes.COLOR_GOMA) !== -1 &&
            valoresDe(ctxGoma.ops, 'fillStyle').indexOf(Tintes.COLOR_PINCEL) === -1 &&
            llamadas(ctxGoma.ops, 'drawImage').length === 0 &&
            llamadas(ctxGoma.ops, 'strokeRect').length === 1,
            'nueve casillas de (2,2) a (4,4) con el velo rojo y el borde, y ni un solo dibujo de ' +
            'objeto dentro: al borrar no hay nada que enseñar, porque lo que va a pasar es que lo ' +
            'que hay deje de verse');

        const spriteFalso = { canvas: { width: 32, height: 32 }, anchorY: 0 };
        const ctxPincel = contextoFalso();
        Fantasma.dibujarFantasma(ctxPincel, fantasmaPincel,
            { casillas: casillasPincel, pantallaDe: pantallaDe, paso: 32, escala: 1, sprite: spriteFalso });

        check('y el de pintar son las mismas casillas pero CON el dibujo y el azul del pincel',
            casillasPincel.length === 9 &&
            JSON.stringify(casillasPincel) === JSON.stringify(casillasGoma) &&
            llamadas(ctxPincel.ops, 'drawImage').length === 9 &&
            valoresDe(ctxPincel.ops, 'fillStyle').indexOf(Tintes.COLOR_PINCEL) !== -1 &&
            valoresDe(ctxPincel.ops, 'fillStyle').indexOf(Tintes.COLOR_GOMA) === -1,
            'el fantasma de pintar lleva el sprite en las nueve casillas —que es lo que enseña ' +
            'como va a quedar— y el de borrar no lleva ninguno');

        // -------------------------------------------------------------------
        // 3. ARRASTRAR UN RESPAWN, con sus monstruos dentro
        // -------------------------------------------------------------------

        const crudoArrastre = {
            format: 'jetyum-map', version: 1,
            name: 'arrastre', width: 32, height: 32, floors: 2,
            defaultGround: { 0: 102 }, fallbackGround: 102, tiles: [],
            spawns: [{
                x: 10, y: 10, z: 0, radius: 3, interval: 60000,
                monsters: [
                    { name: 'Rat', x: 10, y: 10, interval: 60000 },
                    { name: 'Cave Rat', x: 8, y: 12, interval: 60000 },
                    { name: 'Wolf', interval: 60000 }
                ]
            }]
        };

        const arrastrable = new EditorMap(crudoArrastre, itemTypes);
        const areaOriginal = arrastrable.spawns[0];

        const agarreRespawn = arrastrable.agarrarMarcador(11, 10, 0);

        check('se agarra el respawn por cualquier casilla de su area, sin haberlo elegido antes',
            agarreRespawn.ok && agarreRespawn.clase === 'respawn' &&
            arrastrable.seleccion.tipo === 'respawn',
            'agarrar es elegir mientras se mueve: es lo que hace que arrastrar un respawn sea un ' +
            'gesto y no dos');

        const movimiento = arrastrable.arrastrarA(13, 12, 0);

        check('mover un respawn lleva sus monstruos DENTRO, conservando la posicion relativa de cada uno',
            movimiento.ok && areaOriginal.x === 12 && areaOriginal.y === 12 &&
            areaOriginal.monsters[0].x === 12 && areaOriginal.monsters[0].y === 12 &&
            areaOriginal.monsters[1].x === 10 && areaOriginal.monsters[1].y === 14 &&
            areaOriginal.monsters[0].x - areaOriginal.x === 0 &&
            areaOriginal.monsters[0].y - areaOriginal.y === 0 &&
            areaOriginal.monsters[1].x - areaOriginal.x === -2 &&
            areaOriginal.monsters[1].y - areaOriginal.y === 2,
            'el area se desplaza rígida, así que ningún monstruo puede quedarse fuera por el ' +
            'camino: la rata sigue en el centro y la rata de cueva sigue a dos casillas al oeste ' +
            'y dos al sur');

        check('y el monstruo SIN casilla se queda sin ella, que es lo que significa «vive en el area»',
            areaOriginal.monsters[2].x === null && areaOriginal.monsters[2].y === null,
            'la forma antigua del formato no cambia de significado al mover el respawn');

        const soltadoRespawn = arrastrable.soltarArrastre(false);

        const releido = MapLoader.buildMap(
            { ...crudoArrastre, spawns: arrastrable.spawnsFinales() },
            { itemTypes: itemTypes, monsterTypes: monstruosDePrueba });

        check('y el VALIDADOR del motor acepta el mapa con el respawn movido y sus monstruos',
            soltadoRespawn.ok && soltadoRespawn.movido && releido.report.ok,
            releido.report.ok
                ? 'sin errores: ningun monstruo cae fuera de su respawn, que es lo que el cargador ' +
                  'rechaza'
                : releido.report.format());

        const seVaDelMapa = arrastrable.agarrarMarcador(12, 13, 0);
        const negado = arrastrable.arrastrarA(31, 31, 0);

        check('un respawn que se saldria del mapa NO se mueve, y lo dice',
            seVaDelMapa.ok && !negado.ok && /saldria/.test(negado.problema) &&
            areaOriginal.x === 12 && areaOriginal.y === 12 &&
            areaOriginal.monsters[1].x === 10 && areaOriginal.monsters[1].y === 14,
            negado.problema);

        const sueltaSinMover = arrastrable.soltarArrastre(false);

        check('y soltarlo donde el movimiento se nego no ha movido nada',
            sueltaSinMover.ok && sueltaSinMover.movido === false &&
            areaOriginal.x === 12 && areaOriginal.y === 12);

        arrastrable.agarrarMarcador(12, 13, 0);
        arrastrable.arrastrarA(14, 13, 0);
        const cancelado = arrastrable.cancelarArrastre();

        check('cancelar el arrastre devuelve el respawn —y sus monstruos— exactamente donde estaba',
            cancelado.ok && cancelado.cancelado === true &&
            areaOriginal.x === 12 && areaOriginal.y === 12 &&
            areaOriginal.monsters[0].x === 12 && areaOriginal.monsters[0].y === 12 &&
            areaOriginal.monsters[1].x === 10 && areaOriginal.monsters[1].y === 14,
            'mientras no se suelta no hay nada escrito: cancelar tiene que dejar el mapa como ' +
            'estaba, no «casi» como estaba');

        // -------------------------------------------------------------------
        // 4. ARRASTRAR OBJETOS de una casilla a otra
        // -------------------------------------------------------------------

        const objetos = new EditorMap({
            format: 'jetyum-map', version: 1,
            name: 'objetos', width: 16, height: 16, floors: 1,
            defaultGround: { 0: 102 }, fallbackGround: 102,
            tiles: []
        }, itemTypes);

        objetos.paintGround(5, 5, 0, 103);
        objetos.paintItem(5, 5, 0, 113);      // una mesa
        objetos.paintItem(9, 9, 0, 111);      // un muro
        objetos.addItem(9, 9, 0, 3031);       // y una moneda ENCIMA del muro
        objetos.clearDirty();

        const agarreMoneda = objetos.agarrarObjetos(9, 9, 0, 1);

        check('se agarra el objeto de MAS ARRIBA de la casilla, que es el que se ve',
            agarreMoneda.ok && agarreMoneda.typeId === 3031 && agarreMoneda.piezas === 1,
            'la pila se lee en orden de dibujo: la moneda esta encima del muro y es la que se coge');

        const destinoObjeto = objetos.arrastrarA(11, 11, 0);
        const soltadoObjeto = objetos.soltarArrastre(false);

        check('arrastrar un objeto de una casilla a otra lo deja alli y NO lo duplica',
            destinoObjeto.ok && soltadoObjeto.ok && soltadoObjeto.movidos === 1 &&
            objetos.getTile(11, 11, 0).items.map((item) => item.id).join(',') === '3031' &&
            objetos.getTile(9, 9, 0).items.map((item) => item.id).join(',') === '111' &&
            cuantosItems(objetos, 3031) === 1,
            'queda una sola moneda en todo el mapa: se ha movido, no copiado — y el muro de la ' +
            'casilla de origen se queda donde estaba');

        const agarreMuro = objetos.agarrarObjetos(9, 9, 0, 1);
        objetos.arrastrarA(5, 5, 0);
        const sustitucion = objetos.soltarArrastre(false);

        check('soltar encima de una casilla que YA tiene cosas SUSTITUYE la pila, como hace el pincel',
            agarreMuro.ok && sustitucion.ok && sustitucion.sustituidas === 1 &&
            objetos.getTile(5, 5, 0).items.map((item) => item.id).join(',') === '111' &&
            objetos.groundAt(5, 5, 0) === 103,
            'es la misma operacion que pintar sin Mayus (`paintItem`): arrastrar y pintar son ' +
            '«poner esto aqui» visto desde dos sitios, y que uno sustituyera y el otro anadiera ' +
            'seria una trampa. El SUELO no se toca: el 103 sigue en su casilla');

        const agarreMesa = objetos.agarrarObjetos(5, 5, 0, 1);
        objetos.arrastrarA(11, 11, 0);
        const anadido = objetos.soltarArrastre(true);

        check('y con Mayus se AÑADE a la pila del destino en vez de sustituirla',
            agarreMesa.ok && anadido.ok &&
            objetos.getTile(11, 11, 0).items.map((item) => item.id).join(',') === '3031,111',
            'es la forma de poner una cosa encima de otra sin llevarse la de debajo, igual que ' +
            'pintar con Mayus');

        const antesDeSalirse = objetos.getTile(11, 11, 0).items.length;
        const agarreFuera = objetos.agarrarObjetos(11, 11, 0, 1);
        const fueraDelMapa = objetos.arrastrarA(40, 40, 0);
        const soltadoFuera = objetos.soltarArrastre(false);

        check('arrastrar fuera del mapa se CANCELA, se dice y no se pierde el objeto',
            agarreFuera.ok && !fueraDelMapa.ok && /fuera del mapa/.test(fueraDelMapa.problema) &&
            !soltadoFuera.ok && /no se ha movido nada/.test(soltadoFuera.problema) &&
            objetos.getTile(11, 11, 0).items.length === antesDeSalirse,
            'nada se toca hasta que se suelta: por eso cancelar es gratis y no hay forma de ' +
            'perder un objeto por salirse de la ventana');

        // Un arrastre que empieza y acaba en la MISMA casilla no toca nada: ni el objeto ni el
        // contador de «sin guardar». Es lo que hace que un temblor del ratón al pulsar no mueva
        // cosas sin querer.
        objetos.clearDirty();

        const agarreQuieto = objetos.agarrarObjetos(11, 11, 0, 1);

        objetos.arrastrarA(11, 11, 0);
        const quieto = objetos.soltarArrastre(false);

        check('soltar en la misma casilla NO toca nada, ni siquiera el contador de sin guardar',
            agarreQuieto.ok && quieto.ok && quieto.movidos === 0 &&
            objetos.pendiente().edits.length === 0 &&
            objetos.getTile(11, 11, 0).items.length === antesDeSalirse,
            'sacarlo y volverlo a escribir dejaria la casilla marcada como pendiente sin que haya ' +
            'cambiado nada, y el contador del editor diria que hay trabajo donde no lo hay');

        // Un pincel de 3x3 mueve los objetos de encima de las NUEVE casillas, cada uno a su sitio.
        const bloque = new EditorMap({
            format: 'jetyum-map', version: 1,
            name: 'bloque', width: 16, height: 16, floors: 1,
            defaultGround: { 0: 102 }, fallbackGround: 102,
            tiles: []
        }, itemTypes);

        for (let y = 0; y < 3; y += 1) {
            for (let x = 0; x < 3; x += 1) {
                bloque.paintItem(x, y, 0, 111);
            }
        }

        bloque.clearDirty();

        const agarreBloque = bloque.agarrarObjetos(0, 0, 0, 3);
        bloque.arrastrarA(5, 0, 0);
        const movidoBloque = bloque.soltarArrastre(false);
        let destinosDelBloque = 0;

        for (let y = 0; y < 3; y += 1) {
            for (let x = 5; x < 8; x += 1) {
                const tile = bloque.getTile(x, y, 0);
                if (tile && tile.items.length === 1 && tile.items[0].id === 111) {
                    destinosDelBloque += 1;
                }
            }
        }

        check('y un pincel de 3x3 se lleva los objetos de las nueve casillas, cada uno a su sitio',
            agarreBloque.ok && agarreBloque.piezas === 9 && movidoBloque.ok &&
            movidoBloque.movidos === 9 && destinosDelBloque === 9 &&
            cuantosItems(bloque, 111) === 9,
            'el bloque se mueve entero: nueve objetos siguen siendo nueve, ni uno mas ni uno menos');

        // -------------------------------------------------------------------
        // 5. LA ZONA PROTEGIDA: una BANDERA por casilla, movida como un bloque
        // -------------------------------------------------------------------

        const zonaMapa = new EditorMap({
            format: 'jetyum-map', version: 1,
            name: 'zona', width: 16, height: 16, floors: 1,
            defaultGround: { 0: 102 }, fallbackGround: 102,
            tiles: [
                { x: 3, y: 3, z: 0, ground: 104, flags: ['protectionZone', 'noPvp'] },
                { x: 4, y: 3, z: 0, ground: 104, items: [{ id: 111 }], flags: ['protectionZone'] },
                { x: 5, y: 3, z: 0, ground: 104, flags: ['protectionZone'] },
                { x: 3, y: 4, z: 0, ground: 104, flags: ['protectionZone'] },
                // Esta SOLO se toca en diagonal con las de arriba: con cuatro vecinos es otra zona.
                { x: 6, y: 4, z: 0, flags: ['protectionZone'] },
                { x: 9, y: 9, z: 0, flags: ['noPvp'] }
            ]
        }, itemTypes);

        const zona = zonaMapa.zonaEn(4, 3, 0);

        check('la zona protegida es un BLOQUE de casillas contiguas, agarrable por cualquiera de ellas',
            zona !== null && zona.celdas.length === 4 && zona.x === 3 && zona.y === 3 &&
            zona.x0 === 3 && zona.y0 === 3 && zona.x1 === 5 && zona.y1 === 4 &&
            zonaMapa.zonaEn(5, 4, 0) === null &&
            zonaMapa.zonaEn(3, 4, 0).celdas.length === 4 &&
            zonaMapa.zonaEn(3, 4, 0).x === 3,
            'no es un area con centro y radio: es la bandera `protectionZone` de cada casilla, asi ' +
            'que la unidad es el bloque contiguo — y contiguo de CUATRO vecinos, porque una ' +
            'esquina no es un pasillo. Se agarra por (3,3) o por (3,4) y sale el mismo bloque');

        check('y una casilla protegida que solo se toca EN DIAGONAL es otra zona, no la misma',
            zonaMapa.zonaEn(6, 4, 0).celdas.length === 1 && zonaMapa.zonasDe(0).length === 2,
            'con ocho vecinos, mover una de las dos se llevaria la otra por la esquina');

        check('y una bandera que no es de proteccion no forma zona',
            zonaMapa.zonaEn(9, 9, 0) === null,
            'noPvp es una bandera de casilla, pero la zona protegida es la de proteccion');

        const marcasConZona = Marcadores.marcadoresDePlanta(zonaMapa, 0, null);
        const marcasDeZona = marcasConZona.filter((marca) => marca.tipo === 'zona');

        check('y el lienzo la recibe como un marcador mas, con su color y sus casillas',
            marcasDeZona.length === 2 && marcasDeZona[0].color === Marcadores.COLOR_ZONA &&
            marcasDeZona[0].celdas.length === 4 && marcasDeZona[0].radio === null &&
            /4 casillas protegidas/.test(marcasDeZona[0].etiqueta) &&
            marcasDeZona[1].colorClaro === Marcadores.COLOR_ZONA_CLARO,
            marcasDeZona.map((marca) => marca.etiqueta).join(' + ') +
            ': se enseña como el respawn —velo del color y borde— pero con sus casillas, que es lo ' +
            'que la hace elegible y movible');

        const seleccionZona = zonaMapa.seleccionar(4, 3, 0);

        check('se puede ELEGIR con el selector y sale en el panel del marcador elegido',
            seleccionZona.ok && seleccionZona.marcador.tipo === 'zona' &&
            seleccionZona.marcador.zona.celdas.length === 4 &&
            zonaMapa.marcadorElegido().tipo === 'zona',
            'igual que el respawn y el NPC: pinchar dentro de la proteccion la elige entera');

        const ctxZona = contextoFalso();
        // Sin etiqueta a proposito: la etiqueta lleva fondo y tambien es un `fillRect`, y lo que se
        // esta contando aqui son las casillas del velo.
        Marcadores.dibujarMarcador(ctxZona, marcasDeZona[0],
            { x: 3 * 32, y: 3 * 32, paso: 32, etiqueta: false, t: 0 });

        check('y se pinta de AZUL CELESTE, casilla a casilla',
            llamadas(ctxZona.ops, 'fillRect').length === 4 &&
            valoresDe(ctxZona.ops, 'fillStyle').indexOf(Marcadores.COLOR_ZONA) !== -1 &&
            valoresDe(ctxZona.ops, 'strokeStyle').indexOf(Marcadores.COLOR_ZONA) !== -1 &&
            llamadas(ctxZona.ops, 'strokeRect').length === 1 &&
            llamadas(ctxZona.ops, 'strokeRect')[0].args[2] === 3 * 32 &&
            llamadas(ctxZona.ops, 'setLineDash').some((llamada) => llamada.args[0].length === 2),
            'cuatro rellenos —uno por casilla— y un recuadro discontinuo de 3x2: pintar el ' +
            'rectangulo entero diria que hay proteccion en casillas que no la tienen');

        check('y los objetos de dentro se tiñen de azul celeste, no de morado',
            Tintes.tinteDeElemento({ enZona: true }) === Tintes.COLOR_EN_ZONA &&
            Tintes.COLOR_EN_ZONA === Tintes.conAlfa(Marcadores.COLOR_ZONA, 0.45) &&
            Tintes.tinteDeElemento({ enZona: true, esSuelo: true }) === null,
            'el tinte sale del mismo azul que el velo, como el morado sale del fuego del respawn; ' +
            'y el SUELO no se tiñe, porque el velo ya lo cubre');

        check('con VERDE, AZUL y MORADO a la vez manda el verde; y sin verde, el azul',
            Tintes.tinteDeElemento({ elegido: true, enZona: true, enRespawn: true }) ===
                Tintes.COLOR_ELEGIDO &&
            Tintes.tinteDeElemento({ enZona: true, enRespawn: true }) === Tintes.COLOR_EN_ZONA &&
            Tintes.tinteDeElemento({ enRespawn: true }) === Tintes.COLOR_EN_RESPAWN,
            'el verde es lo que se esta haciendo en ese momento; y entre el azul y el morado manda ' +
            'el azul, porque la proteccion es una propiedad DE LA CASILLA y el respawn es una ' +
            'region que la cubre');

        const agarreZona = zonaMapa.agarrarMarcador(4, 3, 0);

        check('la zona se agarra como un bloque, por donde se pinche',
            agarreZona.ok && agarreZona.clase === 'zona' &&
            zonaMapa.arrastreEnCurso().piezas.length === 4,
            'una zona no es un dato con una casilla al que moverle la posicion: lo que viaja es la ' +
            'foto de sus casillas, con sus banderas y sus objetos');

        const zonaNegada = zonaMapa.arrastrarA(15, 15, 0);

        check('y una zona que se saldria del mapa no se mueve, y lo dice',
            !zonaNegada.ok && /fuera del mapa/.test(zonaNegada.problema) &&
            zonaMapa.zonaEn(4, 3, 0) !== null,
            zonaNegada.problema);

        // Y SI SE SUELTA AHÍ, NO SE MUEVE A LA ÚLTIMA CASILLA VÁLIDA: como la zona no sigue al ratón,
        // aparecería en un sitio que nadie ha visto. El rechazo se recuerda hasta que se suelta.
        const soltadaSinSitio = zonaMapa.soltarArrastre(false);

        check('y soltarla donde no cabe cancela el movimiento en vez de dejarla en la ultima casilla valida',
            !soltadaSinSitio.ok && /no se ha movido nada/.test(soltadaSinSitio.problema) &&
            zonaMapa.zonaEn(4, 3, 0) !== null && zonaMapa.arrastreEnCurso() === null,
            'la zona no se ve moverse mientras se arrastra, asi que dejarla donde el raton no ' +
            'esta seria un movimiento que nadie ha pedido');

        zonaMapa.agarrarMarcador(4, 3, 0);

        const zonaMovida = zonaMapa.arrastrarA(7, 8, 0);
        const zonaSoltada = zonaMapa.soltarArrastre(false);

        check('mover la zona se lleva sus banderas Y sus objetos, y deja el suelo donde estaba',
            zonaMovida.ok && zonaSoltada.ok && zonaSoltada.celdas === 4 &&
            zonaMapa.zonaEn(6, 8, 0) !== null && zonaMapa.zonaEn(6, 8, 0).celdas.length === 4 &&
            zonaMapa.zonaEn(3, 3, 0) === null &&
            zonaMapa.tileAt(6, 8, 0).flags.indexOf('noPvp') !== -1 &&
            zonaMapa.getTile(7, 8, 0).items.map((item) => item.id).join(',') === '111' &&
            zonaMapa.tileAt(4, 3, 0).ground === 104 &&
            zonaMapa.tileAt(4, 3, 0).items.length === 0,
            'el bloque entero se va tres al este y cinco al sur: se lleva las banderas —incluida ' +
            'la de noPvp, que es del mismo recinto— y el muro que tenia dentro, y el SUELO se ' +
            'queda, porque el suelo se pinta y no se arrastra');

        const claveDeLaZonaMovida = Marcadores.claveDeZona(zonaMapa.zonaEn(6, 8, 0));
        const quitada = zonaMapa.quitarZona(claveDeLaZonaMovida);

        check('y borrar la zona le quita la BANDERA a sus casillas, sin llevarse lo que hay dentro',
            quitada.ok && quitada.celdas === 4 && zonaMapa.zonaEn(6, 8, 0) === null &&
            zonaMapa.tileAt(6, 8, 0).flags.indexOf('noPvp') !== -1 &&
            zonaMapa.getTile(7, 8, 0).items.map((item) => item.id).join(',') === '111' &&
            zonaMapa.marcadorElegido() === null,
            'desproteger un pueblo no puede vaciarlo: se quita la bandera de proteccion y se ' +
            'quedan los objetos y las demas banderas');

        /*
         * Y UNA CONSECUENCIA DEL MODELO QUE CONVIENE TENER ESCRITA: si una zona se mueve hasta
         * TOCAR a otra, las dos pasan a ser UNA. No es un fallo del arrastre: la bandera vive en la
         * casilla, así que dos bloques que se tocan SON el mismo bloque, y el editor lo que hace es
         * contar la verdad del mapa. Prohibirlo sería inventarse una regla que el formato no tiene.
         */
        const pegada = new EditorMap({
            format: 'jetyum-map', version: 1,
            name: 'pegada', width: 16, height: 16, floors: 1,
            defaultGround: { 0: 102 }, fallbackGround: 102,
            tiles: [
                { x: 3, y: 3, z: 0, flags: ['protectionZone'] },
                { x: 6, y: 3, z: 0, flags: ['protectionZone'] }
            ]
        }, itemTypes);

        pegada.agarrarMarcador(3, 3, 0);
        pegada.arrastrarA(5, 3, 0);
        pegada.soltarArrastre(false);

        check('y dos zonas que se tocan pasan a ser UNA, porque la bandera vive en la casilla',
            pegada.zonasDe(0).length === 1 && pegada.zonasDe(0)[0].celdas.length === 2,
            'mover una zona hasta pegarla a otra las funde: es la verdad del mapa, y por eso el ' +
            'editor no lo prohibe — lo que no se puede es mover media zona');

        // --- Entre un respawn y una zona que cubren la misma casilla, gana la MAS PEQUENA ---
        const mixto = new EditorMap({
            format: 'jetyum-map', version: 1,
            name: 'mixto', width: 16, height: 16, floors: 1,
            defaultGround: { 0: 102 }, fallbackGround: 102,
            tiles: [{ x: 8, y: 8, z: 0, flags: ['protectionZone'] }],
            spawns: [{ x: 8, y: 8, z: 0, radius: 2, interval: 60000,
                monsters: [{ name: 'Rat', x: 7, y: 8, interval: 60000 }] }]
        }, itemTypes);

        check('con un respawn y una zona en la misma casilla se elige la MAS PEQUEÑA, que es la mas concreta',
            mixto.seleccionar(8, 8, 0).ok && mixto.marcadorElegido().tipo === 'zona' &&
            mixto.seleccionar(10, 8, 0).ok && mixto.marcadorElegido().tipo === 'respawn',
            'una casilla protegida de una sola casilla dentro de un area de 25: se agarra la ' +
            'proteccion, que es lo que se esta mirando — y el area se sigue eligiendo en ' +
            'cualquier otra casilla suya');
    }

    // =======================================================================
    section('14. La paleta se ve a 32x32 y el panel no lleva prosa: la ayuda va en el globo');
    // =======================================================================

    /*
     * DOS COSAS QUE NO COMPROBABA NINGUNA PRUEBA, porque las dos se ven en el navegador.
     *
     * 1. A QUE TAMAÑO SE VE LA HOJA DE TERRENO. El lienzo de la paleta ya se construye a 32x32
     *    —eso lo comprueba la seccion 5—, pero quien decide el tamaño en pantalla es el CSS, y
     *    estaba en 20 px: el dibujo era el de verdad, encogido. Aqui se lee el CSS DE VERDAD, el
     *    mismo archivo que sirve el servidor de herramientas, y se resuelve el ancho EFECTIVO de
     *    una casilla de la hoja. Comprobar solo la regla base daria verde con un `width: 20px` mas
     *    especifico encima, que es exactamente como estaba.
     *
     * 2. QUE EL PANEL NO SEA UN MANUAL. Las explicaciones se han movido al `title` de cada
     *    control. Sin navegador no se puede ver un globo, pero SI se puede comprobar que el texto
     *    sigue estando: cada explicacion que salio del panel tiene que aparecer en algun `title`.
     *    Es la unica forma de sujetar «no se ha perdido nada» sin abrir el navegador, y es la
     *    comprobacion que impide que el proximo cambio borre una explicacion en vez de moverla.
     */

    {
        const html = fs.readFileSync(path.join(ROOT, 'editor', 'index.html'), 'utf8');
        const css = cssDeLaPagina(html);

        check('se encuentra el CSS del editor, que es lo que se esta midiendo',
            css.length > 1000 && declaracionesCss(css, '#palette') !== null,
            css.length + ' bytes de CSS y la regla de la paleta localizada');

        const lado = ladoVisibleDeLaHoja(css);

        check('la casilla de la hoja se ve a 32x32, el tamaño con el que se pinta en el mapa',
            lado >= 32,
            lado + ' px de lado: por debajo de 32 el dibujo se encoge y deja de ser la casilla ' +
            'que se pone en el mapa');

        // Sin esto el dibujo sale borroso justo al ampliarlo, que es cuando importa.
        const dibujo = declaracionesCss(css, '.palette-dibujo');

        check('y el dibujo se amplia sin interpolarlo (image-rendering: pixelated)',
            dibujo !== null && /pixelated/.test(dibujo.get('image-rendering') || ''),
            dibujo ? 'image-rendering: ' + dibujo.get('image-rendering') : 'no hay regla .palette-dibujo');

        const rejilla = rejillaDeLaHoja(css);

        check('la hoja va en rejilla y el descuento del ancho es el hueco que las separa',
            rejilla !== null && Number.isInteger(rejilla.columnas) &&
            rejilla.columnas >= 2 && rejilla.descuento === pxDe(declaracionesCss(css, '#palette').get('gap')),
            rejilla
                ? rejilla.columnas + ' columnas, ' + rejilla.descuento + ' px de descuento por boton'
                : 'la regla .palette-item.hoja no reparte el ancho con un calc(porcentaje - px)');

        /*
         * Y LA CUENTA QUE LO HACE POSIBLE, con la barra de desplazamiento mas ancha que se puede
         * encontrar: la barra lateral mide lo que mide, menos su borde, menos su relleno, menos la
         * barra de desplazamiento. Con ese ancho util, cada boton tiene que caber con el dibujo de
         * 32 y sus dos pixeles de borde. Si alguien devuelve la barra lateral a 280 px, aqui se
         * entera: con 280 no caben ocho, y la rejilla pasa a siete sin que nadie lo note mirando.
         */
        const BARRA_DE_DESPLAZAMIENTO = 17; // px, la barra clasica de Chrome en Windows.
        const barra = declaracionesCss(css, '#map-side') || new Map();
        const cuerpo = declaracionesCss(css, '#map-side-scroll') || new Map();
        const relleno = pxDe(cuerpo.get('padding'));
        // Si a la rejilla le falta el `calc`, esto no puede medir nada: se dice con un cero en vez
        // de reventar, porque un fallo tiene que salir como FAIL y no como excepcion.
        const columnas = rejilla ? rejilla.columnas : 0;
        const descuento = rejilla ? rejilla.descuento : 0;
        const minimo = rejilla ? rejilla.minimo : 0;
        const anchoUtil = pxDe(barra.get('width')) - pxDe(barra.get('border-right')) -
            2 * relleno - BARRA_DE_DESPLAZAMIENTO;
        const anchoDeBoton = columnas > 0 ? anchoUtil / columnas - descuento : 0;

        check('y la barra lateral da ancho a las ' + columnas + ' casillas de 32 y su borde',
            anchoDeBoton > 0 && anchoDeBoton >= lado + 2,
            anchoUtil + ' px utiles / ' + columnas + ' columnas = ' + anchoDeBoton.toFixed(2) +
            ' px por boton, y el dibujo con su borde pide ' + (lado + 2));

        check('y el boton no se encoge por debajo del dibujo, pase lo que pase',
            minimo > 0 && minimo >= lado + 2,
            'min-width ' + minimo + ' px: sin ese minimo, estrechar la barra sacaria el ' +
            'dibujo de su casilla en vez de dejar siete por fila');

        // --- La ayuda emergente: nada de prosa en el panel ---
        /*
         * LOS UNICOS PARRAFOS QUE PUEDEN QUEDAR SON MENSAJES DE ESTADO, y esos no se tocan: los
         * escribe el JavaScript al hacer algo («no se pudo...») o al no haber nada elegido, y son
         * respuestas, no explicaciones. Cualquier otro `.nota` es un manual metido en el panel.
         */
        const ESTADOS_CON_NOTA = ['monster-detalle', 'objeto-info', 'marcador-info', 'mano-info', 'compuesto-info'];
        // Toda la pestaña del mapa: la paleta (izquierda), las propiedades (derecha) y la barra
        // de estado, que es donde viven ahora los mensajes de la mano.
        const aside = /<div class="panel active" id="panel-map">([\s\S]*?)<!-- =+ Compuestos/.exec(html);
        const etiquetasConNota = aside
            ? [...aside[1].replace(/<!--[\s\S]*?-->/g, '').matchAll(
                /<[a-z]+[^>]*class="[^"]*\bnota\b[^"]*"[^>]*>/g)].map((match) => match[0])
            : [];
        const notasSueltas = etiquetasConNota.filter((etiqueta) => {
            const id = /id="([^"]+)"/.exec(etiqueta);
            return !id || ESTADOS_CON_NOTA.indexOf(id[1]) === -1;
        });

        check('el panel no tiene parrafos de explicacion: los unicos `.nota` son mensajes de estado',
            etiquetasConNota.length === ESTADOS_CON_NOTA.length && notasSueltas.length === 0,
            notasSueltas.length === 0
                ? etiquetasConNota.length + ' parrafos, todos de estado (' + ESTADOS_CON_NOTA.join(', ') + ')'
                : 'sobran: ' + notasSueltas.join(' '));

        /*
         * Y LO QUE SE QUITO TIENE QUE ESTAR EN EL GLOBO DE ALGUN CONTROL. Se comprueba por trozos
         * de texto, uno por explicacion: si alguien borra un `title` en vez de moverlo, aqui sale
         * cual falta. Estos trozos son los que dicen algo que no se puede adivinar mirando el
         * boton —por que el derecho borra, que hace una bandera, donde se puede poner un
         * monstruo, que significa el radio vacio, como se elige un objeto del mapa—.
         *
         * Los espacios se normalizan antes de buscar: un `title` partido en dos lineas por el
         * ancho del archivo es el mismo texto, y la comprobacion no puede depender de donde acabe
         * la linea.
         */
        const titulos = [...html.matchAll(/title="([^"]*)"/g)]
            .map((match) => match[1].replace(/\s+/g, ' '))
            .join('\n');
        const EXPLICACIONES = [
            'se pierde lo que no se haya guardado',
            'borra el bloque del pincel',
            'protectionZone forma la ZONA PROTEGIDA',
            'sin combate entre jugadores',
            'no se puede salir aquí',
            'Dentro sólo se pueden poner monstruos',
            'no pone nada y lo dice',
            'una zona protegida o lo que hay en una casilla',
            'vacío = el radio que declara npcs.xml',
            'el ratón lo enseña como fantasma sobre el mapa',
            'planta, pincel, vista y mano',
            'Ctrl+rueda planta',
            'Alt+derecho mueve la vista',
            'vuelve a no llevar nada'
        ];
        const perdidas = EXPLICACIONES.filter((trozo) => titulos.indexOf(trozo) === -1);

        check('y cada explicacion que salio del panel esta en el globo de un control',
            perdidas.length === 0,
            perdidas.length === 0
                ? EXPLICACIONES.length + ' explicaciones, todas en algun `title`'
                : 'no estan en ningun title: ' + perdidas.join(' | '));

        /*
         * LA MISMA REGLA EN LA PESTAÑA DE OBJETOS, donde la explicacion de cada propiedad se
         * pintaba DOS veces: en el `title` de la fila y en un `<em>` a la derecha. El `<em>` se ha
         * quitado y la ayuda sigue llegando por el globo, que es lo que se comprueba aqui.
         */
        const { COMMON_ATTRIBUTES } = await import('../editor/js/itemsview.js');
        const fuenteItems = fs.readFileSync(path.join(ROOT, 'editor', 'js', 'itemsview.js'), 'utf8');

        check('y la ficha de cada propiedad de items.xml explica en el globo y no en el formulario',
            COMMON_ATTRIBUTES.length > 0 &&
            COMMON_ATTRIBUTES.every((atributo) => atributo.hint && atributo.hint.length > 2) &&
            /row\.title = attribute\.hint;/.test(fuenteItems) &&
            !/attribute\.hint \+ '<\/em>'/.test(fuenteItems),
            COMMON_ATTRIBUTES.length + ' propiedades, cada una con su explicacion en el `title` de ' +
            'su fila y ninguna pintada en el formulario');
    }

    // =======================================================================
    console.log('');
    if (failures === 0) {
        console.log('\u001b[32mTodo OK\u001b[0m — las herramientas leen, editan y guardan sin romper nada.');
        process.exit(0);
    }
    console.log('\u001b[31m' + failures + ' comprobacion(es) fallaron\u001b[0m');
    process.exit(1);
}

main().catch((error) => {
    console.error('\u001b[31mLa prueba fallo con una excepcion:\u001b[0m');
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
