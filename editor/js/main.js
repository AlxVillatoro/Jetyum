/**
 * El editor: ata las dos herramientas.
 *
 * Dos pestañas que no comparten nada salvo el cliente del API: el mapa y los objetos
 * son cosas distintas, se editan de formas distintas y mezclarlas en una sola pantalla
 * haría que ninguna de las dos estuviera cómoda.
 *
 * Lo único que las une es que LAS DOS ESCRIBEN EN EL DATAPACK, y por eso las dos
 * enseñan siempre qué han guardado y qué queda pendiente. Un editor que no dice si ha
 * guardado es un editor en el que no se puede confiar.
 *
 * LA VISTA DEL MAPA TIENE TRES CONTROLES y conviene saber qué hace cada uno, porque
 * los tres cambian la escala y no significan lo mismo:
 *
 *   - Acercar y alejar (botones, rueda, `+` y `-`): la escala del zoom. Con la rueda se
 *     acerca DONDE ESTÁ EL RATÓN, que es lo que permite apuntar a una casilla concreta.
 *   - "Ver todo": el mapa entero ajustado a la ventana. Es lo que hace falta para
 *     mirarlo de un vistazo, y con el mapa de la ciudad (128x128) obliga a reducirlo.
 *   - "Vista normal": vuelve al 100 %, sin mover la cámara de donde estaba.
 *
 * La escala está siempre a la vista en el panel, porque un zoom sin saber a cuánto se
 * está es una forma cómoda de pintar en la casilla equivocada.
 *
 * Y ESTÁN LOS RESPAWNS Y LOS NPC, que son la otra mitad del mapa. Un respawn es un ÁREA —un
 * centro, un radio y los monstruos que viven dentro, cada uno en su casilla— y se ve como lo
 * que es: un fuego morado en el centro, un recuadro discontinuo alrededor que enseña hasta
 * dónde llega, y un fuego pequeño por cada monstruo que tiene casilla. La regla que ordena las
 * herramientas es la que pidió el usuario y la que hace cumplir el formato: **un monstruo no
 * existe fuera de un respawn**. Por eso hay una herramienta para el área, otra para los
 * monstruos que van DENTRO y ninguna para pintar un monstruo suelto; y por eso, cuando se
 * intenta algo que no tiene sentido, se dice con un mensaje en vez de no hacer nada.
 */

import { ApiClient } from './apiclient.js';
import { filasDeDetalle } from './detalle.js';
import { EditorMap } from './editormap.js';
import { MapCanvas } from './mapcanvas.js';
import { PaletteView } from './palette.js';
import { ItemsView } from './itemsview.js';
import { SpritesView } from './spritesview.js';
import { pintarIconos } from './iconos.js';
import { Herramientas, HERRAMIENTAS_PROPIAS } from './herramientas.js';
import {
    CompuestosView,
    formularioDeValores,
    formularioDePropiedades,
    dibujarPlantilla
} from './compuestosui.js';
import { expandir, caja, desdeCasillas, normalizarPlantilla } from '../../shared/js/compuestos.mjs';
import {
    TAMANO_POR_DEFECTO,
    cuantasCasillas,
    limitarTamano,
    nombreDeTamano,
    siguienteTamano
} from './pincel.js';
import {
    INTERVALO_POR_DEFECTO,
    RADIO_POR_DEFECTO,
    etiquetaDeNpc,
    etiquetaDeRespawn,
    etiquetaDeZona,
    segundos
} from './marcadores.js';

const api = new ApiClient();

/** El estado del mapa que se está editando. */
const state = {
    map: null,
    canvas: null,
    palette: null,

    /**
     * La herramienta del mapa.
     *
     * `objeto` ES LA HERRAMIENTA DE NO LLEVAR NADA, y es con la que se abre el editor: sin nada
     * en la mano el clic izquierdo elige lo que hay en la casilla —no pinta— y el derecho enseña
     * sus detalles. Es la decisión prudente que pedía el usuario: un editor que pinta sin que se
     * haya elegido nada es un editor en el que se pinta sin querer.
     */
    tool: 'objeto',

    /**
     * Lo que se lleva en la mano: el id de un objeto, o el de un suelo, o NADA (`null`).
     *
     * Son dos campos y no uno porque un suelo y un objeto se pintan con herramientas distintas
     * aunque se elijan en la misma paleta: `isGround` en `items.xml` decide cuál de las dos.
     */
    selectedType: null,
    selectedGround: null,

    /**
     * El lado del cuadro del pincel, en casillas.
     *
     * EL PINCEL ES DEL EDITOR, NO DE UN OBJETO: se elige una vez y vale para el suelo y para los
     * objetos, y sigue puesto al cambiar de objeto. Es lo que hace que pintar un suelo y luego
     * una valla no obligue a volver a poner el 4x4.
     */
    pincel: TAMANO_POR_DEFECTO,

    selectedFlag: 'protectionZone',

    /** Las plantillas de objetos compuestos (`data/editor/compuestos.json`). */
    plantillas: [],
    /** El compuesto en la mano: `{plantilla, formulario}`, o null. */
    compuestoEnMano: null,
    /** El primer clic de «Capturar», o null. */
    capturaDesde: null,
    /** Los monstruos que se pueden colocar, de `data/monsters/`. */
    monsters: [],
    /** Los NPC que se pueden colocar, de `data/npc/npcs.xml`. */
    npcs: [],
    /** Esas definiciones por nombre: el radio de paseo de un NPC sale de aquí. */
    npcTypes: new Map()
};

/** ¿Es una herramienta de marcadores? Las que no pintan casillas, vamos. */
function esHerramientaDeMarcador(herramienta) {
    return herramienta === 'respawn' || herramienta === 'monster' ||
        herramienta === 'npc' || herramienta === 'pick';
}

// ---------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------

function showTab(name) {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === 'panel-' + name);
    });

    // Las pestañas pesadas se cargan la primera vez que se abren: el editor arranca en el mapa
    // y no tiene por qué esperar a decodificar la biblioteca de sprites.
    if (name === 'sprites' && state.sprites && !state.sprites.cargado && !state.sprites.cargando) {
        state.sprites.cargando = true;
        state.sprites.cargar();
    }
    if (name === 'compuestos' && state.compuestosView && !state.compuestosView.cargado) {
        state.compuestosView.cargar();
    }
}

// ---------------------------------------------------------------------------
// La mano, el pincel y el objeto elegido del mapa
//
// TRES COSAS QUE PARECEN LA MISMA Y NO LO SON, y por eso tienen tres sitios distintos:
//
//   - LA MANO es lo que se va a pintar. La lleva la paleta y la enseña el lienzo como fantasma.
//   - EL PINCEL es cuántas casillas se pintan de una vez. Es del editor, no del objeto: sigue
//     puesto al cambiar de objeto, que es lo que hace que no haya que volver a ponerlo.
//   - EL OBJETO ELEGIDO DEL MAPA es lo que ya está puesto y se ha pinchado para mirarlo. No se
//     pinta con él: sus botones lo mueven en la pila de su casilla o lo borran.
//
// ESTE BLOQUE ES CABLEADO, y a propósito: la geometría del pincel, el color de los tintes y las
// reglas de la pila viven en `pincel.js`, `tintes.js` y `editormap.js`, que se comprueban sin
// navegador. Aquí sólo se leen botones y se escriben rótulos.
// ---------------------------------------------------------------------------

/**
 * Pone algo en la mano (o la vacía con `null`) y lo enseña.
 *
 * EL FANTASMA DEL LIENZO SALE DE AQUÍ: es el mismo dato que el rótulo, así que no pueden
 * discrepar. Un fantasma que dijera una cosa y el rótulo otra es el fallo clásico de tener el
 * mismo estado en dos sitios.
 */
function ponerEnLaMano(elegido) {
    if (state.canvas) {
        state.canvas.enLaMano = elegido === null ? null : {
            typeId: elegido.typeId,
            esSuelo: elegido.esSuelo,
            nombre: elegido.nombre,
            tamano: state.pincel
        };
    }

    refrescarMano();
}

/** El rótulo de la mano y el tamaño del pincel, que es lo que dice qué se va a pintar. */
function refrescarMano() {
    const info = document.getElementById('mano-info');
    const enLaMano = state.canvas ? state.canvas.enLaMano : null;

    document.getElementById('pincel-tamano').textContent = nombreDeTamano(state.pincel);

    if (!enLaMano) {
        info.textContent = 'nada elegido — el clic izquierdo elige lo que hay en la casilla y el ' +
            'derecho enseña sus detalles. Elige un objeto de la paleta para pintar.';
        info.className = 'nota';
    } else {
        info.textContent = enLaMano.nombre + ' (id ' + enLaMano.typeId + ')' +
            (enLaMano.esSuelo
                ? ' — se pinta como SUELO: sustituye el de la casilla, no se apila'
                : ' — se pinta como objeto: Mayús lo anade a la pila') +
            '. Pincel ' + nombreDeTamano(enLaMano.tamano) + ': ' +
            cuantasCasillas(enLaMano.tamano) + ' casilla(s) por clic.';
        info.className = 'nota';
    }
    // En la barra de estado el texto se recorta: entero, en el globo.
    info.title = info.textContent;

    // Los botones de tamaño se marcan para que se vea CUÁL está puesto, que es lo que pidió el
    // usuario: un pincel sin saber de qué tamaño es una forma cómoda de pintar de más.
    document.querySelectorAll('#pincel-pasos button').forEach((boton) => {
        boton.classList.toggle('active', Number(boton.dataset.tamano) === state.pincel);
    });
}

/**
 * Cambia el tamaño del pincel. Vale para el suelo, para los objetos Y PARA BORRAR: es del editor.
 *
 * SE ESCRIBE EN DOS SITIOS A LA VEZ —el estado del editor y el lienzo— y es a propósito: el lienzo
 * necesita el número para dibujar el fantasma del bloque que se va a pintar o a borrar, y el
 * fantasma tiene que decir exactamente lo que el clic va a hacer. Al ser el mismo dato escrito en el
 * mismo sitio, no pueden discrepar.
 */
function cambiarPincel(tamano) {
    state.pincel = limitarTamano(tamano);

    if (state.canvas) {
        state.canvas.pincel = state.pincel;

        if (state.canvas.enLaMano) {
            state.canvas.enLaMano.tamano = state.pincel;
        }
    }

    refrescarMano();

    // Se dice en el estado además de en el panel: el tamaño del pincel es lo que decide cuántas
    // casillas se lleva por delante un clic, y no es sitio para que nadie tenga que adivinarlo.
    if (state.map) {
        setMapStatus('pincel de ' + nombreDeTamano(state.pincel) + ': ' +
            cuantasCasillas(state.pincel) + ' casilla(s) por clic, pintando, borrando y ' +
            'arrastrando');
    }
}

/**
 * Pone la herramienta, y la deja dicha TAMBIÉN EN EL LIENZO.
 *
 * El lienzo no aplica la herramienta —eso lo hace `applyTool` aquí— pero la necesita para una sola
 * cosa, y es la que resolvió la objeción que tenía el pincel en el borrado: con la goma puesta el
 * ratón tiene que enseñar el bloque que se va a borrar, y para eso el lienzo tiene que saber qué
 * herramienta está puesta. Escribirlo aquí, en un solo sitio, es lo que impide que la herramienta
 * del rótulo y la del fantasma se separen.
 */
function ponerHerramienta(nombre, elemento) {
    state.tool = nombre;
    marcarHerramienta(elemento || null);

    if (state.canvas) {
        state.canvas.herramienta = nombre;
    }
}

/**
 * Suelta la mano: no se lleva nada.
 *
 * ES UN ESTADO VÁLIDO Y NO UN ERROR, así que no se avisa de nada malo: se dice qué hacer ahora.
 * Y sólo se cambia la herramienta si era una de las que dependen de la mano —pintar objeto o
 * suelo—: la goma, las banderas y las de marcadores son herramientas explícitas y siguen puestas
 * aunque no se lleve nada, porque no pintan lo que se lleva en la mano sino que hacen otra cosa.
 *
 * SI HAY UN ARRASTRE EN CURSO, ESTO LO CANCELA Y NO SUELTA LA MANO: durante el arrastre la mano
 * lleva el fantasma de lo que se está moviendo, así que vaciarla sería quedarse a medias —y con los
 * objetos, perder lo que se llevaba—. Escape, en mitad de un arrastre, significa «déjalo donde
 * estaba», que es lo que espera cualquiera.
 */
function soltarMano(mensaje) {
    if (state.map && state.map.arrastreEnCurso()) {
        const cancelado = state.map.cancelarArrastre();

        ponerEnLaMano(null);
        refrescarSeleccion();
        setMapStatus('arrastre cancelado: ' + (cancelado.aviso || 'nada se ha movido'), true);
        return;
    }

    state.selectedType = null;
    state.selectedGround = null;

    if (state.palette) {
        state.palette.soltar();
    }

    if (state.tool === 'paint' || state.tool === 'ground' || state.tool === 'compuesto' ||
        state.tool === 'capturar' || state.tool === 'mover-compuesto' ||
        HERRAMIENTAS_PROPIAS.includes(state.tool)) {
        ponerHerramienta('objeto', null);
    }
    soltarCompuesto();

    ponerEnLaMano(null);

    if (mensaje) {
        setMapStatus(mensaje);
    }
}

/**
 * Elige el objeto que hay en una casilla, o su suelo.
 *
 * CON `detalles` (el botón derecho) SE CONSERVA LO QUE YA ESTUVIERA ELEGIDO EN ESA CASILLA: lo
 * que se quiere ver son SUS detalles, no los del objeto que esté más arriba. Es la diferencia
 * entre «enséñame esto» y «enséñame lo que hay aquí».
 */
function elegirObjetoDeCasilla(cell, detalles) {
    if (!state.map) {
        return;
    }

    const z = state.canvas.z;
    const actual = state.map.objetoElegido();
    const mismoSitio = actual && actual.x === cell.x && actual.y === cell.y && actual.z === z;

    const resultado = state.map.seleccionarObjeto(cell.x, cell.y, z,
        mismoSitio && detalles ? actual.stackpos : undefined);

    if (!resultado.ok) {
        refrescarObjeto();
        elegirCompuestoDeCasilla(cell);
        setMapStatus(resultado.problema, true);
        return;
    }

    refrescarObjeto();
    elegirCompuestoDeCasilla(cell);

    const elegido = resultado.objeto;

    setMapStatus('elegido ' + elegido.nombre + ' (id ' + elegido.id + ') en (' + cell.x + ',' +
        cell.y + ',' + z + '), posicion ' + elegido.stackpos + ' de la pila de la casilla' +
        (detalles ? ' — los detalles, en el panel' : ''));
}

/** El panel del objeto elegido: la pila entera, lo que se puede hacer y su ficha. */
function refrescarObjeto() {
    refrescarPropiedades();
    const info = document.getElementById('objeto-info');
    const lista = document.getElementById('objeto-pila');
    const acciones = document.getElementById('objeto-acciones');
    const detalle = document.getElementById('objeto-detalle');

    lista.innerHTML = '';
    lista.hidden = true;
    acciones.hidden = true;
    detalle.innerHTML = '';

    const elegido = state.map ? state.map.objetoElegido() : null;

    if (!elegido) {
        info.textContent = 'ninguno — con nada en la mano, pincha una casilla para elegir lo ' +
            'que hay en ella; el botón derecho enseña sus detalles.';
        return;
    }

    info.textContent = elegido.nombre + ' (id ' + elegido.id + ') en (' + elegido.x + ',' +
        elegido.y + ',' + elegido.z + ')' +
        (elegido.esSuelo ? '  ·  es el SUELO de la casilla' : '') +
        '  ·  posicion ' + elegido.stackpos + ' de la pila';

    /*
     * LA PILA ENTERA, DE ARRIBA ABAJO. Lo primero de la lista es lo que se ve encima y lo último
     * es el suelo, que es el orden de cualquier panel de capas y el único en el que «subir»
     * significa subir. Las demás filas se pueden pinchar para elegirlas: es lo que permite
     * trabajar con un objeto que está debajo de otro sin tener que borrar el de encima.
     */
    const pila = state.map.pilaDe(elegido.x, elegido.y, elegido.z);

    pila.slice().reverse().forEach((ficha) => {
        const fila = document.createElement('button');
        fila.type = 'button';
        fila.className = 'pila-fila' + (ficha.stackpos === elegido.stackpos ? ' selected' : '');
        fila.textContent = ficha.nombre + (ficha.count > 1 ? ' x' + ficha.count : '');

        const posicion = document.createElement('em');
        posicion.textContent = ficha.esSuelo ? 'el suelo' : 'posicion ' + ficha.stackpos;
        fila.appendChild(posicion);

        fila.addEventListener('click', () => {
            state.map.seleccionarObjeto(ficha.x, ficha.y, ficha.z, ficha.stackpos);
            refrescarObjeto();
        });

        lista.appendChild(fila);
    });

    lista.hidden = false;
    acciones.hidden = false;

    // La ficha: id, nombre, peso, banderas, posición en la pila y planta. Se construye en
    // `detalle.js`, que reutiliza la tabla de propiedades de la pestaña de Objetos.
    filasDeDetalle({
        definicion: elegido.definicion,
        id: elegido.id,
        stackpos: elegido.stackpos,
        z: elegido.z,
        x: elegido.x,
        y: elegido.y,
        banda: elegido.banda
    }).forEach((fila) => {
        const contenedor = document.createElement('div');
        contenedor.className = 'detalle-fila';

        const etiqueta = document.createElement('span');
        etiqueta.textContent = fila.etiqueta;

        const valor = document.createElement('em');
        valor.textContent = fila.valor;

        contenedor.appendChild(etiqueta);
        contenedor.appendChild(valor);
        detalle.appendChild(contenedor);
    });
}

/** Mueve el objeto elegido en la pila de su casilla. */
function moverEnPila(direccion) {
    if (!state.map) {
        return;
    }

    const resultado = state.map.moverObjetoEnPila(direccion);

    if (!resultado.ok) {
        setMapStatus(resultado.problema, true);
        refrescarObjeto();
        return;
    }

    refrescarObjeto();
    setMapStatus(resultado.aviso || 'movido en la pila');
}

/** Quita de la casilla el objeto elegido. */
function borrarObjetoElegido() {
    if (!state.map) {
        return;
    }

    const resultado = state.map.borrarObjetoElegido();

    if (!resultado.ok) {
        setMapStatus(resultado.problema, true);
        refrescarObjeto();
        return;
    }

    refrescarObjeto();
    refreshMapStatus();
    setMapStatus('quitado "' + resultado.borrado.nombre + '" (id ' + resultado.borrado.id +
        ')' + (resultado.aviso ? '  —  ' + resultado.aviso : ''));
}

// ---------------------------------------------------------------------------
// El mapa
// ---------------------------------------------------------------------------

async function loadMapList() {
    const result = await api.listMaps();
    const select = document.getElementById('map-select');

    select.innerHTML = '';

    if (result.error) {
        setMapStatus('no se pudo listar los mapas: ' + result.error, true);
        return;
    }

    result.maps.forEach((map) => {
        const option = document.createElement('option');
        option.value = map.name;
        option.textContent = map.name + '  (' + map.width + 'x' + map.height +
            'x' + map.floors + ', ' + map.tiles + ' tiles)';
        select.appendChild(option);
    });
}

// ---------------------------------------------------------------------------
// Monstruos, NPC y respawns
// ---------------------------------------------------------------------------

/**
 * Llena las dos listas de contenido: monstruos y NPC.
 *
 * SALEN DEL SERVIDOR Y NO DE UNA LISTA ESCRITA AQUÍ. Es el mismo motivo por el que la paleta se
 * construye con lo que declara `items.xml`: el servidor las lee con LOS MISMOS lectores que usa
 * el motor (`data/monsters/` y `data/npc/npcs.xml`), así que un monstruo nuevo aparece solo y
 * no hay dos listas que mantener de acuerdo.
 */
async function cargarMonstruosYNpcs() {
    const [monstruos, npcs] = await Promise.all([api.getMonsters(), api.getNpcs()]);

    if (monstruos.error || npcs.error) {
        setMapStatus('no se pudieron listar los monstruos o los NPC: ' +
            (monstruos.error || npcs.error), true);
        return;
    }

    state.monsters = monstruos.monsters || [];
    state.npcs = npcs.npcs || [];
    state.npcTypes = new Map();
    state.npcs.forEach((npc) => state.npcTypes.set(npc.name, npc));

    const selectMonstruos = document.getElementById('monster-select');
    selectMonstruos.innerHTML = '';
    state.monsters.forEach((monstruo) => {
        const option = document.createElement('option');
        option.value = monstruo.name;
        option.textContent = monstruo.name;
        selectMonstruos.appendChild(option);
    });

    const selectNpcs = document.getElementById('npc-select');
    selectNpcs.innerHTML = '';
    state.npcs.forEach((npc) => {
        const option = document.createElement('option');
        option.value = npc.name;
        option.textContent = npc.name + '  (pasea ' + npc.walkRadius + ')';
        selectNpcs.appendChild(option);
    });

    mostrarDetalleDeMonstruo();

    // Un aviso del servidor sobre un módulo de monstruo que no carga: se enseña en vez de
    // esconderse, porque un monstruo que falta en la lista es justo lo que se echaría de menos.
    if (monstruos.problems && monstruos.problems.length > 0) {
        setMapStatus(monstruos.problems.join('; '), true);
    }
}

/** La salud y la experiencia del monstruo elegido, para saber qué se está colocando. */
function mostrarDetalleDeMonstruo() {
    const nombre = document.getElementById('monster-select').value;
    const monstruo = state.monsters.find((candidato) => candidato.name === nombre);
    const detalle = document.getElementById('monster-detalle');

    detalle.textContent = monstruo
        ? monstruo.health + ' de vida, ' + monstruo.experience + ' de experiencia' +
          (monstruo.description ? '  ·  ' + monstruo.description : '')
        : 'no hay ningun monstruo definido en data/monsters/';
}

/** El radio del respawn que dice el formulario, con el valor sensato si está vacío. */
function radioDelFormulario() {
    const valor = Number(document.getElementById('respawn-radius').value);
    return Number.isFinite(valor) && valor >= 0 ? Math.trunc(valor) : RADIO_POR_DEFECTO;
}

/** El intervalo del respawn que dice el formulario, con el valor sensato si está vacío. */
function intervaloDelFormulario() {
    const valor = Number(document.getElementById('respawn-interval').value);
    return Number.isFinite(valor) && valor > 0 ? Math.trunc(valor) : INTERVALO_POR_DEFECTO;
}

/**
 * Enseña el resultado de una operación de marcadores.
 *
 * EL PROBLEMA NO SE ESCONDE NUNCA, y es lo que pidió el usuario: intentar poner un monstruo
 * fuera de un respawn tiene que decir por qué no se puede, no quedarse en silencio. El aviso es
 * para lo que sí se ha hecho y conviene saber (por ejemplo, que un NPC ha quedado dentro de un
 * respawn).
 */
function mostrarResultado(resultado, exito) {
    if (!resultado.ok) {
        setMapStatus(resultado.problema, true);
        return false;
    }

    setMapStatus(exito + (resultado.aviso ? '  —  ' + resultado.aviso : ''));
    return true;
}

/** La selección del mapa, en el lienzo y en el panel. Es lo que hay tras elegir un marcador. */
function refrescarSeleccion() {
    state.canvas.seleccion = state.map ? state.map.seleccion : null;
    refrescarPanel();
    // El objeto elegido de una casilla va aparte del marcador, pero los dos se enseñan en el
    // mismo panel lateral y cualquier cambio del mapa puede haberlo dejado obsoleto: una casilla
    // repintada, un respawn movido. Se refresca aquí y así no hay dos sitios que lo hagan.
    refrescarObjeto();
    refreshMapStatus();
}

/**
 * Suelta el marcador elegido sin exigir que haya un mapa abierto.
 *
 * Las herramientas se pueden pulsar antes de que se abra un mapa —el desplegable está llenándose
 * todavía— y un `state.map.limpiarSeleccion()` a secas reventaría en ese momento.
 */
function limpiarSeleccion() {
    if (state.map) {
        state.map.limpiarSeleccion();
    }
    refrescarSeleccion();
}

/** El panel del marcador elegido: qué es, qué monstruos tiene y qué se puede hacer. */
function refrescarPanel() {
    const info = document.getElementById('marcador-info');
    const lista = document.getElementById('marcador-monstruos');
    const acciones = document.getElementById('marcador-acciones');
    const aplicar = document.getElementById('btn-marcador-aplicar');
    const borrar = document.getElementById('btn-marcador-borrar');
    const botonMonstruo = document.getElementById('btn-monster');

    lista.innerHTML = '';
    lista.hidden = true;
    acciones.hidden = true;
    // El botón de aplicar se esconde en la zona —no hay nada que aplicar—, así que hay que
    // volver a enseñarlo al elegir cualquier otra cosa.
    aplicar.hidden = false;
    botonMonstruo.textContent = 'Monstruo';

    const elegido = state.map ? state.map.marcadorElegido() : null;

    if (!elegido) {
        info.textContent = 'ninguno — pulsa «Elegir» sobre un respawn, un monstruo, un NPC o ' +
            'una zona protegida; con «Elegir» tambien se ARRASTRA lo que hay.';
        return;
    }

    if (elegido.tipo === 'npc') {
        const npc = elegido.npc;
        info.textContent = 'npc ' + etiquetaDeNpc(npc, state.npcTypes.get(npc.name)) +
            ' en (' + npc.x + ',' + npc.y + ',' + npc.z + ')';

        // Los controles de arriba son también los del marcador elegido: se rellenan con lo que
        // tiene, que es lo que hace que «Aplicar» signifique algo.
        document.getElementById('npc-select').value = npc.name;
        document.getElementById('npc-radius').value =
            npc.radius === null || npc.radius === undefined ? '' : String(npc.radius);

        aplicar.textContent = 'Aplicar al NPC';
        borrar.textContent = 'Borrar el NPC';
        acciones.hidden = false;
        return;
    }

    /*
     * LA ZONA PROTEGIDA, EN EL MISMO PANEL QUE EL RESPAWN Y EL NPC.
     *
     * NO TIENE NADA QUE APLICAR, y por eso es la única que no enseña el botón: un respawn tiene
     * radio e intervalo y un NPC tiene radio de paseo, pero una zona protegida es una BANDERA —está
     * o no está— y no hay ningún número que ajustar. Lo que sí tiene es borrado, que es quitarle la
     * bandera al bloque entero.
     */
    if (elegido.tipo === 'zona') {
        const zona = elegido.zona;

        info.textContent = 'zona protegida: ' + etiquetaDeZona(zona) + '  ·  planta ' + zona.z +
            '  ·  la bandera protectionZone de esas casillas, la misma que pone la herramienta ' +
            'Bandera';

        aplicar.hidden = true;
        borrar.textContent = 'Borrar la zona protegida';
        acciones.hidden = false;
        // El monstruo no tiene nada que hacer con una zona: se deja dicho en el botón, que si no
        // parecería que va a anadir una rata dentro de la protección.
        botonMonstruo.title = 'Una zona protegida no lleva monstruos: la herramienta Monstruo ' +
            'los pone dentro de un respawn';
        return;
    }

    const respawn = elegido.respawn;
    const monstruos = respawn.monsters.length;

    info.textContent = 'respawn en (' + respawn.x + ',' + respawn.y + ',' + respawn.z + ')  ·  ' +
        etiquetaDeRespawn(respawn) + '  ·  ' + monstruos +
        (monstruos === 1 ? ' monstruo' : ' monstruos');

    document.getElementById('respawn-radius').value = String(respawn.radius);
    document.getElementById('respawn-interval').value = String(respawn.interval);

    respawn.monsters.forEach((monstruo, posicion) => {
        const fila = document.createElement('div');
        fila.className = 'monstruo-fila' +
            (elegido.tipo === 'monstruo' && elegido.posicion === posicion ? ' selected' : '');

        const select = document.createElement('select');
        state.monsters.forEach((candidato) => {
            const option = document.createElement('option');
            option.value = candidato.name;
            option.textContent = candidato.name;
            select.appendChild(option);
        });
        select.value = monstruo.name;
        select.addEventListener('change', () => {
            const resultado = state.map.cambiarMonstruo(state.map.claveDe(respawn), posicion, select.value);
            if (!mostrarResultado(resultado, 'monstruo cambiado a ' + select.value)) {
                select.value = monstruo.name;
            }
            refrescarPanel();
        });

        const donde = document.createElement('em');
        donde.textContent = monstruo.x === null || monstruo.x === undefined
            ? 'en el area'
            : '(' + monstruo.x + ',' + monstruo.y + ')';

        const quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.className = 'plain';
        quitar.textContent = 'x';
        quitar.title = 'Quitar este monstruo del respawn';
        quitar.addEventListener('click', () => {
            const resultado = state.map.quitarMonstruo(state.map.claveDe(respawn), posicion);
            if (mostrarResultado(resultado, 'monstruo quitado' +
                (resultado.respawnBorrado ? ' (y el respawn, que se quedaba vacio)' : ''))) {
                refrescarSeleccion();
            }
        });

        fila.appendChild(select);
        fila.appendChild(donde);
        fila.appendChild(quitar);

        // Pinchar la fila (fuera del desplegable y del botón) elige ESE monstruo: es lo que
        // hace que la herramienta Monstruo pase a moverlo en vez de añadir otro.
        fila.addEventListener('click', (event) => {
            if (event.target === select || event.target === quitar) {
                return;
            }
            state.map.seleccionarMonstruo(state.map.claveDe(respawn), posicion);
            refrescarSeleccion();
        });

        lista.appendChild(fila);
    });

    lista.hidden = false;
    aplicar.textContent = 'Aplicar al respawn';
    borrar.textContent = 'Borrar el respawn';

    if (elegido.tipo === 'monstruo') {
        botonMonstruo.textContent = 'Mover';
        botonMonstruo.title = 'Mover a otra casilla el monstruo elegido, dentro de su respawn';
    } else {
        botonMonstruo.title = 'Anadir el monstruo elegido dentro de un respawn que exista';
    }

    acciones.hidden = false;
}

/** Crea un respawn con el monstruo elegido, en la casilla que se ha pulsado. */
function ponerRespawnEn(cell) {
    const z = state.canvas.z;
    const resultado = state.map.ponerRespawn(cell.x, cell.y, z,
        document.getElementById('monster-select').value,
        radioDelFormulario(), intervaloDelFormulario());

    if (mostrarResultado(resultado, 'respawn creado en (' + cell.x + ',' + cell.y + ',' + z +
        ') con radio ' + radioDelFormulario())) {
        refrescarSeleccion();
    }
}

/**
 * Añade un monstruo dentro de un respawn, o MUEVE el elegido si hay uno elegido.
 *
 * Las dos cosas en la misma herramienta porque son la misma pregunta —«dónde va este
 * monstruo»—, y el panel dice cuál de las dos va a pasar: el botón se llama «Monstruo» o
 * «Mover» según lo que haya elegido.
 */
function ponerOMoverMonstruo(cell) {
    const z = state.canvas.z;
    const elegido = state.map.marcadorElegido();

    if (elegido && elegido.tipo === 'monstruo') {
        const resultado = state.map.moverMonstruo(cell.x, cell.y, z);

        if (mostrarResultado(resultado, 'monstruo movido a (' + cell.x + ',' + cell.y + ',' + z + ')')) {
            refrescarSeleccion();
        }
        return;
    }

    const resultado = state.map.anadirMonstruo(cell.x, cell.y, z,
        document.getElementById('monster-select').value, intervaloDelFormulario());

    if (mostrarResultado(resultado, 'monstruo anadido al respawn de (' +
        resultado.respawn.x + ',' + resultado.respawn.y + '): ahora tiene ' +
        resultado.respawn.monsters.length)) {
        refrescarSeleccion();
    }
}

/** Coloca el NPC elegido. */
function ponerNpcEn(cell) {
    const z = state.canvas.z;
    const resultado = state.map.ponerNpc(cell.x, cell.y, z,
        document.getElementById('npc-select').value,
        document.getElementById('npc-radius').value);

    if (mostrarResultado(resultado, 'npc ' + document.getElementById('npc-select').value +
        ' colocado en (' + cell.x + ',' + cell.y + ',' + z + ')')) {
        refrescarSeleccion();
    }
}

/** Elige el marcador que hay en una casilla. */
function elegirMarcador(cell) {
    const resultado = state.map.seleccionar(cell.x, cell.y, state.canvas.z);

    if (!mostrarResultado(resultado, '')) {
        return;
    }

    const elegido = resultado.marcador;

    if (elegido.tipo === 'monstruo') {
        setMapStatus('elegido el monstruo ' + elegido.monstruo.name + ' del respawn de (' +
            elegido.respawn.x + ',' + elegido.respawn.y + '): pulsa «Mover» dentro del area ' +
            'para cambiarlo de casilla, o cambialo en la lista');
    } else if (elegido.tipo === 'npc') {
        setMapStatus('elegido el npc ' + elegido.npc.name + ' en (' + elegido.npc.x + ',' +
            elegido.npc.y + ',' + elegido.npc.z + ')');
    } else if (elegido.tipo === 'zona') {
        setMapStatus('elegida la zona protegida: ' + etiquetaDeZona(elegido.zona) +
            '  —  arrastrala para moverla entera, con sus banderas y sus objetos, o pulsa ' +
            '«Borrar la zona protegida»');
    } else {
        setMapStatus('elegido el respawn de (' + elegido.respawn.x + ',' + elegido.respawn.y +
            ',' + elegido.respawn.z + '): ' + etiquetaDeRespawn(elegido.respawn));
    }

    refrescarSeleccion();
}

/**
 * Borra el marcador de una casilla: el monstruo, el NPC, la zona protegida, o nada.
 *
 * UN RESPAWN ENTERO NO SE BORRA CON EL BOTÓN DERECHO, y es a propósito: pulsar dentro del área
 * de un respawn de cinco monstruos y que desaparezcan los cinco es un accidente que se comete
 * una vez y no se perdona. Para eso está el botón Borrar del panel, que dice lo que va a
 * borrar. Aquí se dice qué hacer.
 *
 * CON LA ZONA PROTEGIDA VALE LO MISMO, y con más motivo si cabe: una zona son decenas de casillas
 * —la del mapa de la ciudad tiene 63 y 180— y quitarle la bandera a todas de un clic derecho sería
 * desproteger un pueblo entero sin querer.
 */
function borrarMarcador(cell) {
    const z = state.canvas.z;
    const monstruo = state.map.monstruoEn(cell.x, cell.y, z);

    if (monstruo) {
        const resultado = state.map.quitarMonstruo(state.map.claveDe(monstruo.respawn),
            monstruo.posicion);
        mostrarResultado(resultado, 'monstruo ' + monstruo.monstruo.name + ' quitado' +
            (resultado.respawnBorrado ? ' (y el respawn, que se quedaba sin monstruos)' : ''));
        refrescarSeleccion();
        return;
    }

    const npc = state.map.npcEn(cell.x, cell.y, z);

    if (npc) {
        const resultado = state.map.quitarNpc(npc.x + ',' + npc.y + ',' + npc.z);
        mostrarResultado(resultado, 'npc ' + npc.name + ' quitado');
        refrescarSeleccion();
        return;
    }

    const area = state.map.respawnEn(cell.x, cell.y, z);

    if (area) {
        setMapStatus('esa casilla esta dentro del respawn de (' + area.x + ',' + area.y +
            ') pero ahi no hay ningun monstruo: elige el respawn con «Elegir» y pulsa «Borrar ' +
            'el respawn» para quitarlo entero', true);
        return;
    }

    const zona = state.map.zonaEn(cell.x, cell.y, z);

    if (zona) {
        setMapStatus('esa casilla esta protegida: forma parte de una zona de ' +
            zona.celdas.length + ' casilla(s) de (' + zona.x0 + ',' + zona.y0 + ') a (' +
            zona.x1 + ',' + zona.y1 + '). Pinchala con «Elegir» y pulsa «Borrar la zona ' +
            'protegida» para quitarle la bandera al bloque entero', true);
        return;
    }

    setMapStatus('en (' + cell.x + ',' + cell.y + ',' + z + ') no hay ningun monstruo ni ' +
        'ningun NPC que borrar');
}

async function openMap(name) {
    setMapStatus('abriendo ' + name + '...');

    const [mapResult, itemsResult] = await Promise.all([
        api.getMap(name),
        api.getItems()
    ]);

    if (mapResult.error) {
        setMapStatus('no se pudo abrir: ' + mapResult.error +
            (mapResult.problems ? ' — ' + mapResult.problems.join('; ') : ''), true);
        return;
    }

    // Los tipos de objeto hacen falta para saber qué item va por encima de las
    // criaturas y para dibujarlos. Se cargan del mismo sitio que el motor.
    const itemTypes = new Map();
    itemsResult.items.forEach((item) => {
        const attributes = item.attributes || {};
        if (item.isRange) {
            for (let id = item.fromid; id <= item.toid; id += 1) {
                itemTypes.set(id, { id: id, name: item.name, attributes: attributes });
            }
        } else {
            itemTypes.set(item.id, { id: item.id, name: item.name, attributes: attributes });
        }
    });

    state.map = new EditorMap(mapResult.raw, itemTypes, state.npcTypes);
    state.map.setPlantillas(state.plantillas);
    state.itemTypes = itemTypes;

    // EL NOMBRE CON EL QUE SE GUARDA ES EL QUE SE PIDIÓ, no el que lleve dentro el
    // archivo. Son el mismo casi siempre, y cuando no lo son —un mapa copiado y
    // renombrado, que es lo primero que se hace para probar algo— guardar usaba el de
    // dentro: se escribía en el archivo equivocado sin decir nada.
    state.map.name = mapResult.name;
    state.canvas.setMap(state.map);

    const spawn = (mapResult.raw.waypoints && mapResult.raw.waypoints.temple)
        ? mapResult.raw.waypoints.temple
        : [Math.floor(mapResult.raw.width / 2), Math.floor(mapResult.raw.height / 2), 7];

    // La vista normal al abrir: el mapa se abre a 1:1 en el templo, que es lo que
    // espera quien viene a retocar algo concreto. El mapa entero se pide con su botón.
    state.canvas.vistaNormal();
    state.canvas.setFloor(spawn[2]);
    state.canvas.centerOn(spawn[0], spawn[1]);

    document.getElementById('floor-select').value = String(spawn[2]);

    /*
     * LA PALETA SE CONSTRUYE CON LO QUE DECLARA `items.xml`, no con una tabla escrita en
     * el cliente. El proveedor es el MISMO objeto que usa el lienzo: si fueran dos, la
     * paleta y el mapa podrían enseñar dibujos distintos del mismo objeto.
     */
    state.palette.setItems(itemTypes);
    rellenarGruposDePaleta();

    /*
     * LA MANO SE RESTAURA AL ABRIR UN MAPA, y NO SE ELIGE NADA SOLA.
     *
     * Antes esto elegía un objeto por su cuenta —el 111 o el primero de la lista— para poder
     * pintar sin tocar la paleta, y el efecto era que no había forma de NO llevar nada: el clic
     * izquierdo siempre pintaba y no se podía elegir del mapa. Si el objeto que se llevaba ya no
     * está en `items.xml` se suelta y se dice, porque llevar un identificador que el servidor
     * rechazaría al guardar es peor que no llevar nada.
     */
    const enLaMano = state.selectedGround !== null ? state.selectedGround : state.selectedType;

    if (enLaMano !== null && !state.palette.elegirPorId(enLaMano)) {
        soltarMano('el objeto ' + enLaMano + ' ya no esta en items.xml: no llevas nada en la ' +
            'mano. Elige otro en la paleta');
    } else {
        ponerEnLaMano(state.canvas.enLaMano);
    }

    refreshMapStatus();
    setMapStatus('abierto ' + name);

    // Abrir un mapa suelta las dos selecciones: el marcador elegido era de OTRO mapa, y lo mismo
    // el objeto, cuya casilla puede no existir en el mapa nuevo. Mantenerlos dejaría el panel
    // hablando de cosas que ya no están en pantalla.
    if (state.map) {
        state.map.soltarObjeto();
    }
    limpiarSeleccion();
    refrescarCompuesto();
    if (state.herramientas) {
        state.herramientas.alAbrirMapa();
    }
}

function refreshMapStatus() {
    if (!state.map) {
        return;
    }
    const stats = state.map.stats();
    document.getElementById('map-stats').textContent =
        stats.explicitTiles + ' tiles explícitos (' + stats.withItems + ' con objetos, ' +
        stats.withFlags + ' con banderas) de ' +
        stats.cellsIfMaterialized.toLocaleString('es-ES') + ' celdas  |  ' +
        stats.spawnAreas + ' respawn(s) con ' + stats.spawns + ' monstruo(s)  |  ' +
        stats.npcs + ' npc  |  ' + stats.composites + ' compuesto(s)' +
        (stats.pending > 0 ? '  |  ' + stats.pending + ' sin guardar' : '  |  todo guardado');
}

function setMapStatus(text, isError) {
    const element = document.getElementById('map-status');
    element.textContent = text;
    element.className = isError ? 'error' : '';
}

/** La escala y el modo, en el panel. */
function mostrarVista(vista) {
    document.getElementById('vista-escala').textContent =
        vista.texto + (vista.modo === 'todo' ? '  (mapa entero)' : '');

    document.getElementById('btn-fit').classList.toggle('active', vista.modo === 'todo');
    document.getElementById('btn-normal').classList.toggle(
        'active', vista.modo === 'vista' && vista.escala === 1);
}

async function saveMap() {
    if (!state.map) {
        return;
    }

    /*
     * SE GUARDA LO QUE HAY PENDIENTE, y hay tres clases de cosa: las casillas pintadas, los
     * respawns y los NPC. Las listas sólo van si se han tocado, para que un guardado que
     * únicamente pinta un muro no reescriba los respawns del mapa entero.
     */
    const pendiente = state.map.pendiente();
    const hayMarcadores = pendiente.spawns !== undefined || pendiente.npcs !== undefined ||
        pendiente.composites !== undefined || pendiente.towns !== undefined;

    if (pendiente.edits.length === 0 && !hayMarcadores) {
        setMapStatus('no hay nada que guardar');
        return;
    }

    setMapStatus('guardando ' + pendiente.edits.length + ' celda(s)' +
        (hayMarcadores ? ' y los marcadores' : '') + '...');

    const result = await api.saveMap(state.map.name, pendiente.edits, {
        spawns: pendiente.spawns,
        npcs: pendiente.npcs,
        composites: pendiente.composites,
        waypoints: pendiente.waypoints,
        towns: pendiente.towns,
        houses: pendiente.houses
    });

    if (result.error) {
        // El servidor comprueba la ida y vuelta ANTES de escribir, así que un rechazo
        // significa que el archivo está intacto. Decirlo tranquiliza y es verdad.
        setMapStatus('no se guardó: ' + result.error +
            (result.problems && result.problems.length
                ? ' — ' + result.problems.slice(0, 3).join('; ') : '') +
            '  (el archivo no se ha tocado)', true);
        return;
    }

    state.map.clearDirty();
    refreshMapStatus();
    setMapStatus('guardado: ' + result.changed + ' celda(s), ' + result.spawnAreas +
        ' respawn(s) con ' + result.spawns + ' monstruo(s) y ' + result.npcs +
        ' npc en el archivo (' + result.bytes + ' bytes)');
}

// ---------------------------------------------------------------------------
// Objetos compuestos y propiedades de objeto
//
// UN COMPUESTO SE PONE ENTERO: se elige en la paleta (modo «Compuestos»), se configura en el
// formulario de debajo y cada clic pone una copia con su ancla en la casilla. Ya puesto, se elige
// pinchando cualquiera de sus casillas con la mano vacía, y desde «El objeto compuesto» se
// reconfigura, se mueve, se descompone o se borra entero. La geometría vive en `editormap.js`
// (`colocarCompuesto`...) y el formato en `shared/js/compuestos.mjs`.
// ---------------------------------------------------------------------------

function nombreDeObjeto(id) {
    const definicion = state.itemTypes ? state.itemTypes.get(Number(id)) : null;
    return definicion ? definicion.name : 'objeto ' + id;
}

async function cargarPlantillas() {
    const r = await api.getCompuestos();
    if (r.error) {
        setMapStatus('no se pudieron leer los compuestos: ' + r.error, true);
        return;
    }
    ponerPlantillas(r.data.compuestos);
}

function ponerPlantillas(lista) {
    state.plantillas = lista;
    if (state.map) {
        state.map.setPlantillas(lista);
    }
    if (state.compuestosView) {
        state.compuestosView.setPlantillas(lista);
    }
    pintarPaletaDeCompuestos();
}

/** Las categorías de la paleta de objetos, en su desplegable (el «Tileset» de RME). */
function rellenarGruposDePaleta() {
    const select = document.getElementById('palette-grupo');
    const elegido = select.value;
    select.innerHTML = '';
    const todas = document.createElement('option');
    todas.value = '';
    todas.textContent = 'Todas las categorías';
    select.appendChild(todas);
    state.palette.grupos().forEach((grupo) => {
        const option = document.createElement('option');
        option.value = grupo.nombre;
        option.textContent = grupo.nombre + ' (' + grupo.total + ')';
        select.appendChild(option);
    });
    select.value = state.palette.grupos().some((g) => g.nombre === elegido) ? elegido : '';
    state.palette.setGrupo(select.value);
}

/**
 * EL PANEL DE PROPIEDADES, A LA DERECHA. Se abre solo cuando se elige algo en el mapa (la pila
 * de una casilla, un compuesto o un marcador) y se cierra con su X o con el botón de la barra.
 * Si lo abrió la elección, se vuelve a cerrar solo cuando ya no queda nada elegido; si lo abrió
 * la persona, se queda abierto.
 */
function wireInspector() {
    const panel = document.getElementById('map-inspector');
    const boton = document.getElementById('btn-inspector');
    let abiertoAMano = false;

    const poner = (abierto) => {
        if (panel.hidden === !abierto) {
            return;
        }
        panel.hidden = !abierto;
        boton.classList.toggle('active', abierto);
    };

    boton.addEventListener('click', () => {
        abiertoAMano = panel.hidden;
        poner(panel.hidden);
    });
    document.getElementById('btn-inspector-cerrar').addEventListener('click', () => {
        abiertoAMano = false;
        poner(false);
    });

    const vigilados = ['objeto-pila', 'compuesto-elegido', 'marcador-acciones']
        .map((id) => document.getElementById(id));
    let habiaAlgo = false;
    const revisar = () => {
        const hayAlgo = vigilados.some((el) => !el.hidden);
        if (hayAlgo && !habiaAlgo) {
            poner(true);
        } else if (!hayAlgo && habiaAlgo && !abiertoAMano) {
            poner(false);
        }
        habiaAlgo = hayAlgo;
    };
    const observador = new MutationObserver(revisar);
    vigilados.forEach((el) => observador.observe(el, { attributes: true, attributeFilter: ['hidden'] }));
}

function modoDePaleta(modo) {
    document.querySelectorAll('#paleta-modo button').forEach((b) => {
        b.classList.toggle('active', b.dataset.modo === modo);
    });
    const compuestos = modo === 'compuestos';
    const sueltos = modo === 'sueltos';
    document.getElementById('compuestos-paleta').hidden = !compuestos;
    document.getElementById('compuesto-config').hidden = !compuestos || !state.compuestoEnMano;
    document.getElementById('palette').hidden = !sueltos;
    document.getElementById('palette-filter').hidden = !sueltos;
    document.getElementById('palette-grupo').hidden = !sueltos;
    document.getElementById('paleta-tipo').value = modo;
    document.querySelectorAll('[data-modo-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.modoPanel !== modo;
    });
    if (compuestos) {
        pintarPaletaDeCompuestos();
    }
    if (state.herramientas) {
        state.herramientas.alCambiarPaleta(modo);
    }
}

function pintarPaletaDeCompuestos() {
    const caja2 = document.getElementById('compuestos-paleta');
    if (!caja2) {
        return;
    }
    caja2.innerHTML = '';
    const porCategoria = new Map();
    state.plantillas.forEach((t) => {
        if (!porCategoria.has(t.categoria)) {
            porCategoria.set(t.categoria, []);
        }
        porCategoria.get(t.categoria).push(t);
    });
    const lienzos = [];
    Array.from(porCategoria.keys()).sort().forEach((categoria) => {
        const titulo = document.createElement('div');
        titulo.className = 'palette-title';
        titulo.textContent = categoria;
        caja2.appendChild(titulo);
        porCategoria.get(categoria).forEach((t) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'plain cmp-boton' + (state.compuestoEnMano && state.compuestoEnMano.plantilla.id === t.id ? ' active' : '');
            b.title = (t.descripcion || t.nombre) + (t.parametros.length
                ? '\nSe configura: ' + t.parametros.map((p) => p.etiqueta).join(', ') : '');
            const c = document.createElement('canvas');
            c.width = 48;
            c.height = 48;
            b.appendChild(c);
            const nombre = document.createElement('span');
            nombre.textContent = t.nombre;
            b.appendChild(nombre);
            const em = document.createElement('em');
            const medida = caja(t);
            em.textContent = medida.ancho + 'x' + medida.alto;
            b.appendChild(em);
            b.addEventListener('click', () => elegirCompuestoDePaleta(t));
            caja2.appendChild(b);
            lienzos.push([c, t]);
        });
    });
    // Las hojas de sprites pueden llegar después: se repintan las miniaturas un par de veces.
    const pintar = () => lienzos.forEach(([c, t]) => dibujarPlantilla(c, t, state.canvas.provider, 1));
    pintar();
    setTimeout(pintar, 600);
    setTimeout(pintar, 2000);
}

function elegirCompuestoDePaleta(plantilla) {
    const config = document.getElementById('compuesto-config');
    config.hidden = false;
    const formulario = formularioDeValores(config, plantilla, null, nombreDeObjeto);
    state.compuestoEnMano = { plantilla, formulario };
    config.oninput = actualizarFantasmaDeCompuesto;
    config.onchange = actualizarFantasmaDeCompuesto;

    state.selectedType = null;
    state.selectedGround = null;
    if (state.palette) {
        state.palette.soltar();
    }
    ponerHerramienta('compuesto', null);
    ponerEnLaMano(null);
    actualizarFantasmaDeCompuesto();
    pintarPaletaDeCompuestos();

    const info = document.getElementById('mano-info');
    info.textContent = 'compuesto: ' + plantilla.nombre + ' — cada clic pone uno entero con su ancla en la ' +
        'casilla. Configúralo debajo de la paleta. Escape lo suelta.';
    setMapStatus('compuesto en la mano: ' + plantilla.nombre);
}

function actualizarFantasmaDeCompuesto() {
    if (!state.canvas) {
        return;
    }
    const enMano = state.compuestoEnMano;
    if (!enMano) {
        state.canvas.compuestoEnLaMano = null;
        return;
    }
    state.canvas.compuestoEnLaMano = expandir(enMano.plantilla, enMano.formulario.leer(), 0, 0, 0)
        .map((k) => ({ dx: k.x, dy: k.y, dz: k.z, suelo: k.suelo, items: k.items }));
}

function soltarCompuesto() {
    state.compuestoEnMano = null;
    if (state.canvas) {
        state.canvas.compuestoEnLaMano = null;
        state.canvas.recuadro = null;
    }
    state.capturaDesde = null;
    const config = document.getElementById('compuesto-config');
    if (config) {
        config.hidden = true;
    }
    pintarPaletaDeCompuestos();
}

function colocarCompuestoEn(cell) {
    const enMano = state.compuestoEnMano;
    if (!enMano) {
        return 'no llevas ningún compuesto en la mano';
    }
    const r = state.map.colocarCompuesto(enMano.plantilla.id, enMano.formulario.leer(),
        cell.x, cell.y, state.canvas.z);
    if (!r.ok) {
        return 'no se colocó: ' + r.problema;
    }
    refrescarCompuesto();
    return enMano.plantilla.nombre + ' colocado en (' + cell.x + ',' + cell.y + ',' + state.canvas.z +
        '): ' + r.casillas + ' casilla(s). Sin guardar.';
}

/** «Capturar»: el primer clic marca una esquina y el segundo la otra. */
function capturarEn(cell) {
    if (!state.capturaDesde) {
        state.capturaDesde = { x: cell.x, y: cell.y };
        state.canvas.recuadro = { x1: cell.x, y1: cell.y };
        return 'capturar: ahora pincha la esquina opuesta del recuadro';
    }
    const desde = state.capturaDesde;
    state.capturaDesde = null;
    state.canvas.recuadro = null;
    terminarCaptura(desde, cell);
    return 'capturando...';
}

async function terminarCaptura(desde, cell) {
    const z = state.canvas.z;
    const casillas = state.map.casillasDelRecuadro(desde.x, desde.y, cell.x, cell.y, z);
    const nombre = window.prompt('Nombre del compuesto nuevo (' + casillas.length + ' casilla(s) con algo):',
        'Capturado');
    if (!nombre) {
        setMapStatus('captura cancelada');
        return null;
    }
    const categoria = window.prompt('Categoría (agrupa en la paleta):', 'Capturados') || 'Capturados';
    const plantilla = desdeCasillas(casillas, { nombre, categoria });
    if (!plantilla) {
        setMapStatus('el recuadro está vacío: no hay nada que capturar', true);
        return null;
    }
    while (state.plantillas.some((t) => t.id === plantilla.id)) {
        plantilla.id += '-2';
    }
    const lista = state.plantillas.concat([normalizarPlantilla(plantilla, [])]);
    const r = await api.saveCompuestos({ format: 'jetyum-compuestos', version: 1, compuestos: lista });
    if (r.error) {
        setMapStatus('no se guardó el compuesto: ' + r.error + ' — ' + (r.problems || []).slice(0, 2).join('; '), true);
        return null;
    }
    ponerPlantillas(lista);
    ponerHerramienta('objeto', null);
    setMapStatus('compuesto «' + nombre + '» creado con ' + plantilla.celdas.length +
        ' celda(s); su ancla es la casilla de abajo a la derecha. Está en la paleta «Compuestos» y ' +
        'en la pestaña Compuestos para añadirle parámetros.');
    return null;
}

/** Si la casilla pinchada es de un compuesto colocado, lo elige. */
function elegirCompuestoDeCasilla(cell) {
    if (!state.map) {
        return;
    }
    const c = state.map.compuestoEn(cell.x, cell.y, state.canvas.z);
    state.map.compuestoSel = c ? c.uid : null;
    refrescarCompuesto();
}

function refrescarCompuesto() {
    const info = document.getElementById('compuesto-info');
    const caja2 = document.getElementById('compuesto-elegido');
    const c = state.map && state.map.compuestoSel !== null ? state.map.compuestoPorUid(state.map.compuestoSel) : null;
    if (!c) {
        info.textContent = 'ninguno — con nada en la mano, pincha una casilla de un compuesto (contorno amarillo).';
        caja2.hidden = true;
        state.formularioCompuesto = null;
        return;
    }
    const plantilla = state.map.plantillaDe(c);
    info.textContent = (plantilla ? plantilla.nombre : c.compuesto + ' (plantilla desconocida)') +
        ' #' + c.uid + ' con su ancla en (' + c.x + ',' + c.y + ',' + c.z + ')';
    caja2.hidden = false;
    state.formularioCompuesto = plantilla
        ? formularioDeValores(document.getElementById('compuesto-elegido-form'), plantilla, c.valores, nombreDeObjeto)
        : null;
}

function refrescarPropiedades() {
    const caja2 = document.getElementById('objeto-propiedades');
    const item = state.map ? state.map.itemElegido() : null;
    caja2.hidden = !item;
    if (!item) {
        caja2.innerHTML = '';
        return;
    }
    formularioDePropiedades(caja2, item, (cambios) => {
        const r = state.map.cambiarPropiedades(cambios);
        if (!r.ok) {
            setMapStatus(r.problema, true);
            return;
        }
        refreshMapStatus();
        setMapStatus('propiedades de ' + nombreDeObjeto(item.id) + ' cambiadas: ' +
            (Object.keys(item.attributes || {}).join(', ') || 'sin atributos') + '. Sin guardar.');
    });
}

function wireCompuestos() {
    document.querySelectorAll('#paleta-modo button').forEach((b) => {
        b.addEventListener('click', () => modoDePaleta(b.dataset.modo));
    });
    // El desplegable de la paleta, como el de RME: elige cuál de ellas se ve.
    document.getElementById('paleta-tipo').addEventListener('change', (e) => {
        modoDePaleta(e.target.value);
        e.target.blur();
    });
    document.getElementById('btn-capturar').addEventListener('click', (e) => {
        soltarMano();
        ponerHerramienta('capturar', e.currentTarget);
        setMapStatus('capturar: pincha una esquina del recuadro y luego la opuesta');
    });
    document.getElementById('btn-compuesto-aplicar').addEventListener('click', () => {
        const c = state.map && state.map.compuestoPorUid(state.map.compuestoSel);
        if (!c || !state.formularioCompuesto) {
            return;
        }
        const r = state.map.reconfigurarCompuesto(c.uid, state.formularioCompuesto.leer());
        setMapStatus(r.ok ? 'compuesto #' + c.uid + ' reconfigurado (sin guardar)' : r.problema, !r.ok);
        refrescarCompuesto();
        refrescarObjeto();
        refreshMapStatus();
    });
    document.getElementById('btn-compuesto-mover').addEventListener('click', (e) => {
        if (state.map && state.map.compuestoSel !== null) {
            ponerHerramienta('mover-compuesto', e.currentTarget);
            setMapStatus('mover: pincha la casilla donde irá el ancla del compuesto');
        }
    });
    document.getElementById('btn-compuesto-descomponer').addEventListener('click', () => {
        const r = state.map.descomponerCompuesto(state.map.compuestoSel);
        setMapStatus(r.ok ? 'descompuesto: sus piezas quedan como objetos sueltos' : r.problema, !r.ok);
        refrescarCompuesto();
        refreshMapStatus();
    });
    document.getElementById('btn-compuesto-borrar').addEventListener('click', () => {
        const r = state.map.quitarCompuesto(state.map.compuestoSel);
        setMapStatus(r.ok ? 'compuesto borrado entero (sin guardar)' : r.problema, !r.ok);
        refrescarCompuesto();
        refrescarObjeto();
        refreshMapStatus();
    });
}

// ---------------------------------------------------------------------------
// Interacción con el lienzo
// ---------------------------------------------------------------------------

/** Marca qué botón de herramienta está activo. Con `null` no queda ninguno. */
function marcarHerramienta(elemento) {
    document.querySelectorAll('.tool').forEach((boton) => boton.classList.remove('active'));

    if (elemento) {
        elemento.classList.add('active');
    }
}

/**
 * La goma: el bloque ENTERO del pincel vuelve a su suelo por defecto.
 *
 * BORRA NxN Y NO UNA CASILLA, que es lo que pidió el usuario, y la objeción que había en contra
 * —que al borrar no hay nada en la mano y por tanto no había fantasma que enseñara el bloque— está
 * resuelta en el lienzo: con la goma puesta el ratón enseña el bloque rojo que se va a llevar por
 * delante (`fantasma.js` decide cuál). El razonamiento entero, con las dos decisiones y sus motivos,
 * está en la sección del pincel de `editormap.js`.
 *
 * @returns {number} cuántas casillas se han borrado
 */
function borrarCelda(cell) {
    if (!state.map) {
        return 0;
    }

    // `borrarEnCuadro` recorta al mapa por su cuenta, así que no hace falta preguntar antes: una
    // casilla de fuera no borra nada y lo dice devolviendo cero.
    const borradas = state.map.borrarEnCuadro(cell.x, cell.y, state.canvas.z, state.pincel);

    if (borradas > 0) {
        refreshMapStatus();
    }

    return borradas;
}

/**
 * Aplica la herramienta puesta a una casilla, y devuelve el aviso que hay que enseñar (o `null`).
 *
 * DEVUELVE EL AVISO EN VEZ DE ESCRIBIRLO, porque esto también se llama al ARRASTRAR: un mensaje
 * por casilla mientras se pinta una línea sería ruido, y el aviso de lo que se ha hecho sólo
 * interesa al pulsar. Quien llama al pulsar es quien lo enseña.
 */
function applyTool(cell, event) {
    if (!state.map) {
        return null;
    }

    const additive = event.shiftKey;
    const { x, y } = cell;
    const z = state.canvas.z;

    if (!state.map.inBounds(x, y, z)) {
        return null;
    }

    // --- Sin nada en la mano, el clic ELIGE del mapa en vez de pintar ---
    if (state.tool === 'objeto') {
        elegirObjetoDeCasilla(cell, false);
        return null;
    }

    // --- Los marcadores, que no son casillas ---
    if (state.tool === 'respawn') {
        ponerRespawnEn(cell);
        return null;
    }

    if (state.tool === 'monster') {
        ponerOMoverMonstruo(cell);
        return null;
    }

    if (state.tool === 'npc') {
        ponerNpcEn(cell);
        return null;
    }

    if (state.tool === 'pick') {
        elegirMarcador(cell);
        return null;
    }

    if (state.tool === 'compuesto') {
        return colocarCompuestoEn(cell);
    }

    if (state.tool === 'capturar') {
        return capturarEn(cell);
    }

    if (state.tool === 'mover-compuesto') {
        const uid = state.map.compuestoSel;
        const r = state.map.moverCompuesto(uid, x, y, z);
        ponerHerramienta('objeto', null);
        refrescarCompuesto();
        refreshMapStatus();
        return r.ok ? 'compuesto movido a (' + x + ',' + y + ',' + z + ')' : 'no se movió: ' + r.problema;
    }

    if (state.tool === 'erase') {
        const borradas = state.map.borrarEnCuadro(x, y, z, state.pincel);
        if (state.herramientas) {
            state.herramientas.trasBorrar(x, y, z);
        }

        return 'borradas ' + borradas + ' casilla(s) (pincel ' + nombreDeTamano(state.pincel) + ')';
    }

    if (state.tool === 'ground') {
        // Un suelo que es de un pincel de terreno se pinta con sus bordes (borde automático).
        const conPincel = state.herramientas
            ? state.herramientas.pintarSueloSuelto(x, y, z, state.selectedGround) : null;
        if (conPincel !== null) {
            return 'suelo con bordes en ' + conPincel + ' casilla(s) (pincel ' + nombreDeTamano(state.pincel) + ')';
        }
        const cuantas = state.map.pintarSueloEnCuadro(x, y, z, state.pincel, state.selectedGround);

        return 'suelo pintado en ' + cuantas + ' casilla(s) (pincel ' +
            nombreDeTamano(state.pincel) + ')';
    }

    if (state.tool === 'flag') {
        state.map.toggleFlag(x, y, z, state.selectedFlag);
        return null;
    }

    // Pintar: con Mayúsculas se AÑADE al montón en vez de sustituirlo, que es lo que
    // hace falta para poner una moneda encima de una mesa.
    const cuantas = state.map.pintarObjetoEnCuadro(x, y, z, state.pincel, state.selectedType,
        additive);

    return (additive ? 'anadido a la pila en ' : 'pintado en ') + cuantas +
        ' casilla(s) (pincel ' + nombreDeTamano(state.pincel) + ')';
}

function describeCell(cell) {
    if (!state.map) {
        return '';
    }

    const parts = [cell.x + ',' + cell.y + ',' + cell.z];

    /*
     * LA PILA CON SU POSICIÓN DELANTE, y sale de `pilaDe` en vez de recorrer el archivo: en una
     * casilla con cinco cosas apiladas, lo que se pregunta al mirarla es cuál es la de arriba, y
     * el orden del archivo no lo dice —la banda de cada objeto la decide su bandera—. El suelo
     * va sin número porque es la posición 0 y se sobreentiende.
     */
    const pila = state.map.pilaDe(cell.x, cell.y, cell.z);

    if (pila.length === 0) {
        parts.push('sin nada (suelo ' + state.map.defaultGroundFor(cell.z) + ' de la planta)');
    } else {
        parts.push(pila.map((ficha) =>
            (ficha.esSuelo ? '' : ficha.stackpos + ':') + ficha.nombre).join(' + '));
    }

    const tile = state.map.tileAt(cell.x, cell.y, cell.z);

    if (tile && tile.flags.length > 0) {
        parts.push('[' + tile.flags.join(',') + ']');
    }

    // Lo que vive en la casilla, que es lo que se está colocando con las herramientas nuevas.
    const monstruo = state.map.monstruoEn(cell.x, cell.y, cell.z);

    if (monstruo) {
        parts.push('MONSTRUO ' + monstruo.monstruo.name +
            (monstruo.monstruo.x === null ? ' (en el area)' : '') +
            ' del respawn de (' + monstruo.respawn.x + ',' + monstruo.respawn.y +
            ') radio ' + monstruo.respawn.radius);
    }

    const npc = state.map.npcEn(cell.x, cell.y, cell.z);

    if (npc) {
        parts.push('NPC ' + npc.name + '  pasea ' + state.map.radioDeNpc(npc) +
            (npc.radius === null ? ' (npcs.xml)' : ' (mapa)'));
    }

    const area = state.map.respawnEn(cell.x, cell.y, cell.z);

    if (area && !monstruo) {
        parts.push('respawn ' + etiquetaDeRespawn(area));
    }

    // La zona protegida va la última y se nombra ENTERA —cuántas casillas son y hasta dónde llega—
    // porque no se ve en la lista de la casilla: es una bandera, y lo que se quiere saber al pasar
    // el ratón por encima es si esa casilla es de una zona y de qué zona.
    const zona = state.map.zonaEn(cell.x, cell.y, cell.z);

    if (zona) {
        parts.push('ZONA PROTEGIDA (' + etiquetaDeZona(zona) + ')');
    }

    return parts.join('  |  ');
}

/** Cambia de planta, que con la rueda necesita el modificador. */
function cambiarPlanta(paso) {
    if (!state.map) {
        return;
    }

    const z = Math.max(0, Math.min(state.map.floors - 1, state.canvas.z + paso));
    state.canvas.setFloor(z);
    document.getElementById('floor-select').value = String(z);
}

/**
 * CUÁNTOS PÍXELES HAY QUE MOVER EL RATÓN PARA QUE EMPIECE UN ARRASTRE.
 *
 * Sin esto, el temblor de un píxel que hace cualquiera al pulsar convertiría cada clic en un
 * arrastre de una casilla a la de al lado, y elegir un objeto del mapa —que es el gesto más usado
 * del editor— movería cosas sin querer. Cuatro píxeles es menos de lo que ocupa el borde de una
 * casilla a cualquier zoom, así que no estorba a quien de verdad quiere arrastrar, y es más de lo
 * que se mueve un ratón quieto.
 *
 * EL UMBRAL SÓLO DECIDE CUÁNDO EMPIEZA A MOVERSE: si al soltar se está en la misma casilla, lo que
 * ha habido es un clic y se elige, haya recorrido el ratón cuatro píxeles o ninguno.
 */
const UMBRAL_DE_ARRASTRE = 4;

/**
 * ¿Este clic izquierdo empieza un ARRASTRE en vez de aplicar la herramienta?
 *
 * ES LA PREGUNTA QUE ORDENA EL GESTO, y la respuesta depende de la herramienta puesta, porque
 * arrastrar y hacer son cosas distintas según lo que se esté haciendo:
 *
 *   - CON NADA EN LA MANO (la herramienta `objeto`) se agarra EL OBJETO de encima de la casilla —o
 *     los de encima de un bloque, si el pincel es mayor de 1x1—. Si no hay nada que agarrar se
 *     devuelve `false` y el clic sigue siendo lo de siempre: ELEGIR. Es lo que permite que el mismo
 *     gesto elija al pinchar y mueva al arrastrar, sin botones de por medio.
 *   - CON «ELEGIR» (la herramienta `pick`) se agarra el MARCADOR: el monstruo, el NPC, el respawn o
 *     la zona protegida. Es la herramienta que ya estaba para tocar lo que hay puesto, y por eso es
 *     la que arrastra: la de Respawn crea, la de Monstruo coloca y la de NPC pone, y ninguna de las
 *     tres puede además mover sin volverse ambigua.
 *   - CON CUALQUIER OTRA (pintar, suelo, goma, bandera, respawn, monstruo, npc) NO SE ARRASTRA
 *     NADA: el clic hace lo suyo. Pintar arrastrando tiene que seguir pintando una línea, y una
 *     herramienta que además moviera lo que hay debajo sería un editor en el que no se puede pintar
 *     encima de nada.
 *
 * LO QUE SE QUEDA A MEDIAS SE CANCELA ANTES DE EMPEZAR OTRA COSA. Si el ratón salió de la ventana a
 * mitad de un arrastre —y el botón se soltó fuera—, el mapa se quedaría con un movimiento sin dueño:
 * el arrastre siguiente lo cancela y lo dice, y así no hay dos arrastres a la vez ni objetos
 * perdidos.
 *
 * @returns {boolean} true si hay un arrastre en curso y el clic no debe hacer nada más
 */
function intentarAgarrar(cell) {
    if (!state.map) {
        return false;
    }

    const z = state.canvas.z;

    if (state.map.arrastreEnCurso()) {
        const abandonado = state.map.cancelarArrastre();

        setMapStatus('se ha cancelado el arrastre que habia a medias' +
            (abandonado.aviso ? ': ' + abandonado.aviso : ''), true);
        refrescarSeleccion();
    }

    if (state.tool === 'objeto') {
        const agarre = state.map.agarrarObjetos(cell.x, cell.y, z, state.pincel);

        if (!agarre.ok) {
            return false;
        }

        /*
         * EL OBJETO AGARRADO SE PONE EN LA MANO, y es lo que hace que el ratón lo enseñe: el
         * fantasma es el mismo de pintar, así que se ve exactamente dónde va a caer y con el mismo
         * lenguaje que al pintarlo. No se está pintando nada —la herramienta sigue siendo la de
         * elegir— pero el fantasma es la respuesta a «¿qué llevo?» que ya existe.
         */
        ponerEnLaMano({ typeId: agarre.typeId, esSuelo: false, nombre: agarre.nombre });
        setMapStatus('arrastrando ' + (agarre.piezas > 1 ? agarre.piezas + ' objetos' : agarre.nombre) +
            '  —  suelta en otra casilla para moverlo' +
            (agarre.tamano > 1 ? ', o en la misma para elegir' : ', o en la misma para elegirlo'));

        return true;
    }

    if (state.tool === 'pick') {
        const agarre = state.map.agarrarMarcador(cell.x, cell.y, z);

        if (!agarre.ok) {
            return false;
        }

        refrescarSeleccion();
        setMapStatus('arrastrando ' + etiquetaDeArrastre(agarre) +
            '  —  suelta en otra casilla para moverlo, o en la misma para elegirlo');

        return true;
    }

    return false;
}

/** Cómo se llama lo que se está arrastrando, para el estado del editor. */
function etiquetaDeArrastre(agarre) {
    if (agarre.clase === 'respawn') {
        const monstruos = agarre.marcador.respawn.monsters.length;

        return 'el respawn de (' + agarre.marcador.respawn.x + ',' + agarre.marcador.respawn.y +
            ') con sus ' + monstruos + (monstruos === 1 ? ' monstruo' : ' monstruos');
    }
    if (agarre.clase === 'monstruo') {
        return 'el monstruo ' + agarre.marcador.monstruo.name;
    }
    if (agarre.clase === 'zona') {
        return 'la zona protegida (' + agarre.marcador.zona.celdas.length + ' casillas)';
    }

    return 'el npc ' + agarre.marcador.npc.name;
}

/**
 * Termina el arrastre: o se suelta lo agarrado, o era un CLIC y toca elegir.
 *
 * LA MISMA CASILLA SIGNIFICA CLIC, y es lo que sostiene las dos cosas a la vez: pinchar un objeto
 * sin mover el ratón lo elige —como se ha hecho siempre— y llevarlo a otra casilla lo mueve. Un
 * arrastre que sale y vuelve al punto de partida es, por tanto, un clic: el mapa se queda como
 * estaba y lo que se elige es lo que hay ahí.
 */
function terminarArrastre(event) {
    const agarre = state.map ? state.map.arrastreEnCurso() : null;

    if (!agarre) {
        return;
    }

    const cell = state.canvas.cellAt(event.clientX, event.clientY);

    if (cell.x === agarre.agarreX && cell.y === agarre.agarreY) {
        state.map.cancelarArrastre();
        ponerEnLaMano(null);

        if (state.tool === 'objeto') {
            elegirObjetoDeCasilla(cell, false);
        } else {
            elegirMarcador(cell);
        }

        return;
    }

    // El destino se aplica con la última posición del ratón: si el ratón salió y volvió, lo que vale
    // es dónde se suelta, y `arrastrarA` es quien decide si ahí se puede.
    state.map.arrastrarA(cell.x, cell.y, state.canvas.z);

    // Mayúsculas al SOLTAR, no al agarrar: es lo que decide si lo que se suelta sustituye la pila
    // del destino o se añade a ella, igual que al pintar.
    const resultado = state.map.soltarArrastre(event.shiftKey);

    ponerEnLaMano(null);
    refrescarSeleccion();

    if (!resultado.ok) {
        setMapStatus(resultado.problema, true);
        return;
    }

    setMapStatus(resultado.aviso || 'movido');
}

function wireCanvas(canvasElement) {
    // DOS BOTONES, DOS ACCIONES, y por eso son dos banderas y no una: antes el botón
    // derecho borraba al pulsar y, al ARRASTRAR, aplicaba la herramienta que estuviera
    // puesta, así que arrastrar con el derecho para borrar una línea acababa pintando
    // muros encima. Con el izquierdo se pinta y con el derecho se borra, también al
    // arrastrar.
    let pintando = false;
    let borrando = false;

    /**
     * Lo agarrado y dónde se pulsó, o `null` si no hay arrastre. Guarda también los píxeles, para
     * poder distinguir un clic de un arrastre antes de mover nada.
     */
    let agarre = null;

    /*
     * ESPACIO + ARRASTRAR MUEVE LA VISTA, como en los programas de dibujo: es la forma de moverse
     * con el ratón sin botón central (un portátil). Mientras se mantiene, el cursor es una mano.
     */
    let espacioPulsado = false;
    window.addEventListener('keydown', (event) => {
        const t = event.target && event.target.tagName;
        if (event.code === 'Space' && t !== 'INPUT' && t !== 'SELECT' && t !== 'TEXTAREA' &&
            document.getElementById('panel-map').classList.contains('active')) {
            espacioPulsado = true;
            canvasElement.style.cursor = state.canvas.dragging ? 'grabbing' : 'grab';
            event.preventDefault();
        }
    });
    window.addEventListener('keyup', (event) => {
        if (event.code === 'Space' && espacioPulsado) {
            // Sin esto, un botón de la barra con el foco se pulsaría al soltar el Espacio.
            event.preventDefault();
            espacioPulsado = false;
            canvasElement.style.cursor = '';
        }
    });

    canvasElement.addEventListener('contextmenu', (event) => event.preventDefault());

    canvasElement.addEventListener('mousedown', (event) => {
        const cell = state.canvas.cellAt(event.clientX, event.clientY);

        // El botón central y el derecho con Alt arrastran la vista; el izquierdo pinta y
        // el derecho borra. Es la distribución de cualquier editor de mapas y no hay
        // razón para inventar otra. (La ayuda de la barra de abajo dice Alt y no
        // Mayús, que es lo que hace el código: Mayús ya significa "añadir a la pila".)
        if (event.button === 1 || (event.button === 2 && event.altKey) ||
            (event.button === 0 && espacioPulsado)) {
            state.canvas.soltarModo();
            state.canvas.dragging = {
                x: event.clientX, y: event.clientY,
                cx: state.canvas.camera.centerX, cy: state.canvas.camera.centerY
            };
            return;
        }

        // Las herramientas de RME (selección, pegar, cubo, pinceles de terreno, casas...) llevan
        // su propio ratón: ver `herramientas.js`.
        if (state.herramientas && state.herramientas.maneja(state.tool)) {
            state.herramientas.alPulsar(cell, event);
            return;
        }

        if (event.button === 2) {
            /*
             * CON UNA HERRAMIENTA DE MARCADORES, EL BOTÓN DERECHO BORRA EL MARCADOR, y con las
             * de casilla sigue borrando la casilla. Son dos cosas distintas y el botón derecho
             * es «quita lo que hay aquí» en las dos: en una capa de respawns, borrar el suelo
             * de debajo no es lo que nadie espera.
             */
            if (esHerramientaDeMarcador(state.tool)) {
                borrarMarcador(cell);
                return;
            }

            /*
             * Y SIN NADA EN LA MANO, EL DERECHO ENSEÑA LOS DETALLES de lo que hay en la casilla
             * en vez de borrarlo. Es lo que pidió el usuario, y además es lo prudente: con la
             * mano vacía no se está editando nada, se está mirando.
             */
            if (state.tool === 'objeto') {
                elegirObjetoDeCasilla(cell, true);
                return;
            }

            /*
             * BORRAR TAMBIÉN ES CON EL PINCEL, y con el botón derecho se borra el bloque ENTERO
             * aunque la herramienta puesta sea otra —pintar, suelo o bandera—: es la misma regla
             * que al pintar y la que pidió el usuario. El fantasma rojo del bloque lo enseña
             * MIENTRAS SE MANTIENE EL BOTÓN (`state.canvas.borrando`), que es lo que resuelve la
             * objeción de que borrar a ciegas 16 casillas es un accidente.
             */
            borrando = true;
            state.canvas.borrando = true;

            const borradas = borrarCelda(cell);
            if (state.herramientas) {
                state.herramientas.trasBorrar(cell.x, cell.y, state.canvas.z);
            }

            setMapStatus('borradas ' + borradas + ' casilla(s) (pincel ' +
                nombreDeTamano(state.pincel) + ')');
            refrescarObjeto();
            return;
        }

        /*
         * CON EL IZQUIERDO, PRIMERO SE MIRA SI ESTO ES UN ARRASTRE. Agarrar y elegir son el mismo
         * gesto —se pincha y, si se mueve, se arrastra—, así que la decisión se toma aquí y el
         * clic sin movimiento la resuelve `terminarArrastre` al soltar.
         */
        if (intentarAgarrar(cell)) {
            agarre = { cell: cell, x: event.clientX, y: event.clientY, haMovido: false };
            return;
        }

        /*
         * UNA HERRAMIENTA DE MARCADORES ACTÚA AL PULSAR, NO AL ARRASTRAR. Con el pincel tiene
         * sentido pintar una línea arrastrando; con un respawn, no: arrastrar pondría un área en
         * cada casilla por la que pasa el ratón, y deshacer eso es borrar una por una.
         */
        if (esHerramientaDeMarcador(state.tool)) {
            applyTool(cell, event);
            return;
        }

        // Los compuestos, capturar y mover un compuesto actúan AL PULSAR: arrastrando se
        // pondría una casa en cada casilla por la que pasa el ratón.
        if (state.tool === 'compuesto' || state.tool === 'capturar' || state.tool === 'mover-compuesto') {
            const aviso = applyTool(cell, event);
            if (aviso) {
                setMapStatus(aviso, aviso.startsWith('no '));
            }
            refrescarObjeto();
            refreshMapStatus();
            return;
        }

        /*
         * ELEGIR DEL MAPA TAMPOCO SE ARRASTRA, por el mismo motivo: arrastrar con la mano vacía
         * iría cambiando de objeto elegido por todas las casillas que se crucen, y el panel
         * acabaría hablando de la última sin que nadie lo haya pedido.
         */
        if (state.tool === 'objeto') {
            applyTool(cell, event);
            return;
        }

        pintando = true;

        const aviso = applyTool(cell, event);

        if (aviso) {
            setMapStatus(aviso);
        }

        // Pintar puede haber cambiado la casilla del objeto elegido —una pila sustituida, una
        // casilla borrada— y entonces su selección ya no vale: el panel se refresca AL PULSAR y
        // no al arrastrar, que si no se reconstruiría cien veces por segundo.
        refrescarObjeto();
        refreshMapStatus();
    });

    canvasElement.addEventListener('mousemove', (event) => {
        const cell = state.canvas.cellAt(event.clientX, event.clientY);
        state.canvas.hover = cell;
        document.getElementById('map-pos').textContent = cell
            ? 'x: ' + cell.x + '  y: ' + cell.y + '  z: ' + state.canvas.z
            : '—';

        if (state.canvas.dragging) {
            // Se divide por el lado de la casilla EN PANTALLA y no por 32: con zoom, 32
            // píxeles de ratón ya no son una casilla, y el mapa se movería más deprisa
            // que el cursor o más despacio según la escala.
            const paso = state.canvas.tileSize;
            const dx = (event.clientX - state.canvas.dragging.x) / paso;
            const dy = (event.clientY - state.canvas.dragging.y) / paso;
            state.canvas.camera.setCenter(
                state.canvas.dragging.cx - dx,
                state.canvas.dragging.cy - dy,
                state.canvas.z);
            return;
        }

        /*
         * UN GESTO QUE YA NO TIENE ARRASTRE DETRÁS SE OLVIDA AQUÍ. El arrastre se puede cancelar por
         * otro camino —Escape, o la ventana perdiendo el foco— y este `agarre` es del lienzo: sin
         * esto, el ratón seguiría pidiendo mover algo que ya no se está moviendo, y el estado se
         * llenaría de «no se esta arrastrando nada» en cada movimiento.
         */
        if (state.herramientas && state.herramientas.pulsado) {
            state.herramientas.alMover(cell, event);
            return;
        }

        if (agarre && !state.map.arrastreEnCurso()) {
            agarre = null;
        }

        if (agarre) {
            /*
             * EL TEMBLOR NO ES UN ARRASTRE. Hasta que el ratón no se aleja del punto donde se pulsó,
             * esto sigue siendo un clic: mover el objeto de sitio por un píxel de pulso sería el
             * fallo que más se comete en un editor de mapas, porque el gesto de elegir es el mismo
             * que el de arrastrar.
             */
            if (!agarre.haMovido) {
                const recorridoX = event.clientX - agarre.x;
                const recorridoY = event.clientY - agarre.y;

                if (recorridoX * recorridoX + recorridoY * recorridoY <
                    UMBRAL_DE_ARRASTRE * UMBRAL_DE_ARRASTRE) {
                    return;
                }

                agarre.haMovido = true;
            }

            /*
             * ARRASTRAR. Los MARCADORES CON CASILLA —el respawn, uno de sus monstruos y el NPC—
             * siguen al ratón en vivo, y los OBJETOS y la ZONA PROTEGIDA se mueven al soltar. El
             * motivo de la diferencia está en `editormap.js` y no es capricho: un marcador es un dato
             * con una casilla y se puede devolver a la suya en cualquier momento —así que verlo
             * moverse es gratis—, mientras que un bloque de casillas con banderas y objetos dentro
             * necesita recordar qué había en cada destino para poder deshacerlo, y pintarlo en vivo
             * sería un movimiento que habría que deshacer casilla a casilla.
             *
             * EL MOTIVO DEL RECHAZO SE ENSEÑA, y sólo cuando se rechaza: si el respawn no cabe ahí
             * —porque se sale del mapa o porque caería dentro de otro—, el ratón lo dice en vez de
             * no moverse en silencio, que es lo que hace que arrastrar contra el borde se entienda.
             */
            const resultado = state.map.arrastrarA(cell.x, cell.y, state.canvas.z);

            if (!resultado.ok) {
                setMapStatus(resultado.problema, true);
            }

            return;
        }

        if (borrando) {
            borrarCelda(cell);
            return;
        }

        if (pintando) {
            // El aviso que devuelve `applyTool` se tira a propósito: mientras se arrastra, un
            // mensaje por casilla tapa el estado del mapa y no dice nada nuevo.
            applyTool(cell, event);
            refreshMapStatus();
        }
    });

    window.addEventListener('mouseup', (event) => {
        if (state.herramientas) {
            state.herramientas.alSoltar(event);
        }
        if (agarre) {
            agarre = null;
            terminarArrastre(event);
        }

        pintando = false;
        borrando = false;
        state.canvas.borrando = false;
        state.canvas.dragging = null;
    });

    canvasElement.addEventListener('mouseleave', () => {
        state.canvas.hover = null;
        pintando = false;
        borrando = false;
        // La vista y el botón derecho sí se sueltan al salir del lienzo; el ARRASTRE no, porque
        // llevar algo de una casilla a otra pasa por salirse del mapa si el destino está cerca del
        // borde. Se cancela con Escape, o soltando el botón.
        state.canvas.borrando = false;
    });

    /*
     * SI LA VENTANA PIERDE EL FOCO —cambio de pestaña, un diálogo del navegador— el ratón se suelta
     * sin que nadie lo vea y el arrastre se quedaría a medias. Se cancela aquí, que es lo que deja
     * el mapa como estaba y no deja nada colgando.
     */
    window.addEventListener('blur', () => {
        if (state.map && state.map.arrastreEnCurso()) {
            state.map.cancelarArrastre();
            ponerEnLaMano(null);
            refrescarSeleccion();
            setMapStatus('arrastre cancelado: la ventana ha perdido el foco', true);
        }

        agarre = null;
        pintando = false;
        borrando = false;
        state.canvas.borrando = false;
        state.canvas.dragging = null;
    });

    /*
     * LA RUEDA ES EL ZOOM, y con Ctrl o Alt cambia de planta.
     *
     * Antes la rueda cambiaba de planta y no había zoom, así que la única forma de ver
     * un mapa de 128x128 era arrastrar. El zoom es lo que más se usa de los dos —se
     * acerca y se aleja constantemente mientras se pinta— y la planta ya tiene su
     * desplegable y sus teclas, así que el sitio de la rueda es éste. El zoom se ancla
     * al ratón: se apunta a la casilla y se acerca, sin tener que recolocar la cámara
     * después.
     */
    canvasElement.addEventListener('wheel', (event) => {
        event.preventDefault();

        if (event.ctrlKey || event.altKey || event.metaKey) {
            cambiarPlanta(event.deltaY > 0 ? 1 : -1);
            return;
        }

        // Las coordenadas son las del evento: el lienzo las pasa a su propio sistema,
        // que es el único sitio que conoce su posición en la página.
        state.canvas.zoom(event.deltaY > 0 ? -1 : 1, { x: event.clientX, y: event.clientY });
    }, { passive: false });
}

/** Los atajos: la vista, el pincel y soltar la mano. No se disparan mientras se escribe. */
function wireTeclado() {
    /*
     * LAS FLECHAS MUEVEN LA VISTA, como en RME: una casilla por pulsación (manteniéndolas, se
     * desliza) y, con Mayús, diez. Solo en la pestaña del mapa.
     *
     * VALEN AUNQUE EL FOCO ESTÉ EN UN DESPLEGABLE. Al elegir algo con el ratón en un desplegable
     * (el mapa, la planta, la paleta...) el foco se queda en él, y entonces las flechas cambiaban
     * su valor en vez de mover el mapa; en el del mapa, abrían OTRO mapa. Se escucha en la fase de
     * captura para llegar antes que nadie, y solo se respetan los campos donde se escribe.
     */
    const FLECHAS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    window.addEventListener('keydown', (event) => {
        const flecha = FLECHAS[event.key];
        if (!flecha || event.ctrlKey || event.altKey || event.metaKey || !state.canvas ||
            !document.getElementById('panel-map').classList.contains('active')) {
            return;
        }
        const objetivo = event.target;
        const etiqueta = objetivo && objetivo.tagName;
        if (etiqueta === 'TEXTAREA' || objetivo.isContentEditable ||
            (etiqueta === 'INPUT' && !['checkbox', 'radio', 'button'].includes(objetivo.type))) {
            return;
        }
        if (etiqueta === 'SELECT') {
            objetivo.blur();
        }
        const paso = event.shiftKey ? 10 : 1;
        state.canvas.desplazar(flecha[0] * paso, flecha[1] * paso);
        event.preventDefault();
        event.stopPropagation();
    }, true);

    window.addEventListener('keydown', (event) => {
        const objetivo = event.target;
        const etiqueta = objetivo && objetivo.tagName;

        if (etiqueta === 'INPUT' || etiqueta === 'SELECT' || etiqueta === 'TEXTAREA') {
            return;
        }

        /*
         * ESCAPE SUELTA LO QUE SE LLEVA EN LA MANO, que es la forma rápida de llegar al estado
         * «no llevo nada» y así poder elegir del mapa. Está en la tecla que cierra las cosas en
         * cualquier programa, y su efecto no se puede deshacer por accidente: para volver a
         * pintar hay que elegir otra vez.
         */
        if (event.key === 'Escape') {
            soltarMano('nada en la mano: el clic izquierdo elige lo que hay en la casilla y el ' +
                'derecho ensena sus detalles');
            event.preventDefault();
            return;
        }

        /*
         * EL PINCEL, CON CORCHETES. Los signos + y - ya son el zoom y las cifras 0 y 1 son las
         * vistas, así que el tamaño del cuadro se lleva en los corchetes, que es donde lo tienen
         * los programas de dibujo.
         */
        if (event.key === '[') {
            cambiarPincel(siguienteTamano(state.pincel, -1));
            event.preventDefault();
            return;
        }

        if (event.key === ']') {
            cambiarPincel(siguienteTamano(state.pincel, 1));
            event.preventDefault();
            return;
        }

        if (event.key === '+' || event.key === '=') {
            state.canvas.zoom(1);
            event.preventDefault();
            return;
        }

        if (event.key === '-' || event.key === '_') {
            state.canvas.zoom(-1);
            event.preventDefault();
            return;
        }

        if (event.key === '0') {
            state.canvas.ajustar();
            event.preventDefault();
            return;
        }

        if (event.key === '1') {
            state.canvas.vistaNormal();
            event.preventDefault();
            return;
        }

        if (event.key === 'PageUp') {
            cambiarPlanta(-1);
            event.preventDefault();
            return;
        }

        if (event.key === 'PageDown') {
            cambiarPlanta(1);
            event.preventDefault();
        }
    });
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

function loop() {
    if (state.canvas) {
        state.canvas.draw(state.canvas.hover ? describeCell(state.canvas.hover) : null);
    }

    // Los dibujos de la paleta llegan por HTTP, así que hay que repintar los que aún no
    // tenían sprite. Cuando ya están todos, esto es un recorrido de comparaciones y no
    // se nota.
    if (state.palette) {
        state.palette.refrescarPendientes();
    }

    requestAnimationFrame(loop);
}

async function boot() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => showTab(tab.dataset.tab));
    });

    const status = await api.status();

    if (status.error) {
        document.getElementById('global-status').textContent =
            'no se pudo hablar con el servidor: ' + status.error;
        document.getElementById('global-status').className = 'error';
        return;
    }

    document.getElementById('global-status').textContent =
        status.items + ' objetos, ' + status.monsters + ' monstruos, ' + status.npcs +
        ' npc, ' + status.maps + ' mapas — ' + status.root;

    // Los monstruos y los NPC que se pueden colocar. Se piden ANTES de abrir el mapa, porque
    // el mapa necesita sus definiciones para dibujar el radio de paseo de cada NPC colocado.
    await cargarMonstruosYNpcs();

    // --- Mapa ---
    const canvasElement = document.getElementById('map-canvas');
    state.canvas = new MapCanvas({ canvas: canvasElement, onVista: mostrarVista });

    // El lienzo necesita saber con qué se está trabajando para dibujar el fantasma que toca: el
    // objeto de la mano, el bloque rojo de la goma o ninguno. Se le dice aquí, una vez, y a partir
    // de ahí lo mantiene `ponerHerramienta` y `cambiarPincel` —en un solo sitio cada uno—.
    state.canvas.herramienta = state.tool;
    state.canvas.pincel = state.pincel;

    wireCanvas(canvasElement);
    wireTeclado();
    wireInspector();
    pintarIconos();

    // El lienzo cambia de tamaño también al abrir o cerrar el panel de propiedades, no solo con
    // la ventana: se vigila su caja.
    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(() => state.canvas.resize()).observe(document.getElementById('map-lienzo'));
    }

    // --- Las herramientas de RME: barra, paletas, historial, minimapa y atajos ---
    state.herramientas = new Herramientas({
        state: state,
        api: api,
        estado: setMapStatus,
        refrescar: () => {
            refreshMapStatus();
            refrescarObjeto();
            refrescarCompuesto();
        },
        ponerHerramienta: ponerHerramienta,
        soltarMano: () => soltarMano(),
        nombreDeObjeto: (id) => nombreDeObjeto(id),
        modoDePaleta: (modo) => modoDePaleta(modo)
    });
    await state.herramientas.iniciar();

    /*
     * La paleta se ata al proveedor de sprites DEL LIENZO, el de los assets
     * (`assets/things.json`). Se construye una vez y se
     * rellena en cada mapa, porque los objetos del catálogo no cambian al cambiar de
     * mapa.
     */
    state.palette = new PaletteView({
        contenedor: document.getElementById('palette'),
        proveedor: state.canvas.provider,
        onElegir: (definicion, esSuelo) => {
            marcarHerramienta(null);
            soltarCompuesto();

            /*
             * ELEGIR UN OBJETO ES PONERLO EN LA MANO, y las dos cosas que salen de aquí —el
             * rótulo del panel y el fantasma del lienzo— se escriben EN EL MISMO SITIO, con
             * `ponerEnLaMano`. Si se escribieran por separado podrían discrepar, y un fantasma
             * que no coincide con el rótulo es peor que no tener fantasma.
             */
            state.selectedGround = esSuelo ? definicion.id : null;
            state.selectedType = esSuelo ? null : definicion.id;
            ponerHerramienta(esSuelo ? 'ground' : 'paint', null);

            ponerEnLaMano({
                typeId: definicion.id,
                esSuelo: esSuelo,
                nombre: definicion.name || ('objeto ' + definicion.id)
            });

            setMapStatus((esSuelo ? 'pincel de suelo: ' : 'pincel: ') + definicion.name +
                '  ·  ' + nombreDeTamano(state.pincel) + ', ' + cuantasCasillas(state.pincel) +
                ' casilla(s) por clic' +
                (esSuelo ? '' : '  ·  Mayús para anadir a la pila en vez de sustituirla'));
        }
    });

    // --- La mano y el pincel ---
    /*
     * EL PINCEL SE CAMBIA CON DOS BOTONES, CON LOS ATAJOS Y CON LOS CUATRO TAMAÑOS DE SIEMPRE.
     * El tamaño no se pierde al cambiar de objeto ni al soltar la mano, porque es del editor y no
     * del objeto: es lo que hace que pintar un suelo y luego una valla no obligue a ponerlo otra
     * vez. Y `refrescarMano` marca el que está puesto, que es lo que pidió el usuario.
     */
    document.getElementById('btn-pincel-menos').addEventListener('click',
        () => cambiarPincel(siguienteTamano(state.pincel, -1)));

    document.getElementById('btn-pincel-mas').addEventListener('click',
        () => cambiarPincel(siguienteTamano(state.pincel, 1)));

    document.querySelectorAll('#pincel-pasos button').forEach((boton) => {
        boton.addEventListener('click', () => cambiarPincel(Number(boton.dataset.tamano)));
    });

    document.getElementById('btn-soltar').addEventListener('click',
        () => soltarMano('nada en la mano: el clic izquierdo elige lo que hay en la casilla y ' +
            'el derecho ensena sus detalles'));

    // --- El objeto elegido del mapa ---
    document.getElementById('btn-objeto-subir').addEventListener('click', () => moverEnPila(1));
    document.getElementById('btn-objeto-bajar').addEventListener('click', () => moverEnPila(-1));
    document.getElementById('btn-objeto-borrar').addEventListener('click', borrarObjetoElegido);

    document.getElementById('palette-grupo').addEventListener('change', (event) => {
        state.palette.setGrupo(event.target.value);
        event.target.blur();
        setMapStatus(state.palette.visibles + ' de ' + state.palette.entradas.length +
            ' objetos en la paleta' + (event.target.value ? ' (' + event.target.value + ')' : ''));
    });

    document.getElementById('palette-filter').addEventListener('input', (event) => {
        state.palette.setFiltro(event.target.value);

        if (!state.map) {
            return;
        }

        setMapStatus(state.palette.visibles + ' de ' + state.palette.entradas.length +
            ' objetos en la paleta');
    });

    // --- Respawns y NPC ---
    /*
     * LAS CUATRO HERRAMIENTAS DE MARCADORES. Se marcan como activas igual que las de casilla, y
     * lo que cambian es con qué se pincha: la de respawn crea un área, la de monstruo mete uno
     * DENTRO de un área (o mueve el elegido), la de NPC coloca un NPC y la de elegir selecciona
     * lo que ya hay para cambiarlo o borrarlo.
     */
    document.getElementById('btn-respawn').addEventListener('click', (event) => {
        ponerHerramienta('respawn', event.target);
        limpiarSeleccion();
        setMapStatus('respawn: pulsa una casilla vacia y se creara un area con el monstruo ' +
            'elegido dentro, de radio ' + radioDelFormulario() +
            '. Para anadir mas monstruos, usa despues la herramienta Monstruo');
    });

    document.getElementById('btn-monster').addEventListener('click', (event) => {
        ponerHerramienta('monster', event.target);
        const elegido = state.map ? state.map.marcadorElegido() : null;
        setMapStatus(elegido && elegido.tipo === 'monstruo'
            ? 'mover: pulsa una casilla DENTRO del respawn de (' + elegido.respawn.x + ',' +
              elegido.respawn.y + ') y el monstruo ' + elegido.monstruo.name + ' se movera ahi'
            : 'monstruo: pulsa una casilla que este DENTRO de un respawn y se anadira el ' +
              'monstruo elegido. Un monstruo no existe fuera de un respawn');
    });

    document.getElementById('btn-npc').addEventListener('click', (event) => {
        ponerHerramienta('npc', event.target);
        limpiarSeleccion();
        setMapStatus('npc: pulsa una casilla y se colocara el NPC elegido. Su radio de paseo ' +
            'es el de npcs.xml salvo que escribas uno');
    });

    document.getElementById('btn-pick').addEventListener('click', (event) => {
        ponerHerramienta('pick', event.target);
        setMapStatus('elegir: pulsa un respawn, uno de sus monstruos, un NPC o una zona ' +
            'protegida para cambiarlo o borrarlo — y ARRASTRALO para moverlo de sitio');
    });

    document.getElementById('monster-select').addEventListener('change', mostrarDetalleDeMonstruo);

    // Los controles del formulario son TAMBIÉN los del marcador elegido: al elegir un respawn o
    // un NPC se rellenan con lo que tienen, y «Aplicar» escribe lo que se ve.
    document.getElementById('btn-marcador-aplicar').addEventListener('click', () => {
        const elegido = state.map ? state.map.marcadorElegido() : null;

        if (!elegido) {
            setMapStatus('no hay ningun marcador elegido', true);
            return;
        }

        if (elegido.tipo === 'npc') {
            const resultado = state.map.cambiarNpc(
                elegido.npc.x + ',' + elegido.npc.y + ',' + elegido.npc.z,
                {
                    name: document.getElementById('npc-select').value,
                    radius: document.getElementById('npc-radius').value
                });

            if (mostrarResultado(resultado, 'NPC actualizado: ' + resultado.npc.name +
                ' pasea ' + state.map.radioDeNpc(resultado.npc))) {
                refrescarSeleccion();
            }
            return;
        }

        const clave = state.map.claveDe(elegido.respawn);
        const radio = state.map.cambiarRadioDeRespawn(clave, radioDelFormulario());

        if (!mostrarResultado(radio, 'respawn redimensionado a radio ' + radioDelFormulario())) {
            return;
        }

        // El intervalo se cambia DESPUÉS del radio porque redimensionar puede recolocar la
        // selección (la clave de un respawn incluye su radio), y hay que usar la clave nueva.
        const nuevaClave = state.map.claveDe(radio.respawn);
        const intervalo = state.map.cambiarIntervaloDeRespawn(nuevaClave,
            intervaloDelFormulario());

        if (!mostrarResultado(intervalo, 'respawn actualizado: radio ' + radio.respawn.radius +
            ' y cada ' + segundos(radio.respawn.interval))) {
            return;
        }

        refrescarSeleccion();
    });

    document.getElementById('btn-marcador-borrar').addEventListener('click', () => {
        const elegido = state.map ? state.map.marcadorElegido() : null;

        if (!elegido) {
            setMapStatus('no hay ningun marcador elegido', true);
            return;
        }

        if (elegido.tipo === 'npc') {
            const resultado = state.map.quitarNpc(
                elegido.npc.x + ',' + elegido.npc.y + ',' + elegido.npc.z);
            mostrarResultado(resultado, 'npc ' + elegido.npc.name + ' borrado');
            refrescarSeleccion();
            return;
        }

        if (elegido.tipo === 'zona') {
            const cuantas = elegido.zona.celdas.length;
            const resultado = state.map.quitarZona(elegido.clave);

            mostrarResultado(resultado, 'zona protegida borrada: se le ha quitado la bandera a ' +
                cuantas + ' casilla(s). Los objetos y las demas banderas se quedan donde estaban');
            refrescarSeleccion();
            return;
        }

        const monstruos = elegido.respawn.monsters.length;
        const resultado = state.map.quitarRespawn(state.map.claveDe(elegido.respawn));
        mostrarResultado(resultado, 'respawn borrado con sus ' + monstruos + ' monstruo(s)');
        refrescarSeleccion();
    });

    // --- Vista ---
    document.getElementById('btn-zoom-in').addEventListener('click', () => state.canvas.zoom(1));
    document.getElementById('btn-zoom-out').addEventListener('click', () => state.canvas.zoom(-1));
    document.getElementById('btn-fit').addEventListener('click', () => state.canvas.ajustar());
    document.getElementById('btn-normal').addEventListener('click', () => state.canvas.vistaNormal());

    mostrarVista({ texto: '100 %', escala: 1, modo: 'vista' });

    await loadMapList();

    document.getElementById('map-select').addEventListener('change', (event) => {
        openMap(event.target.value);
    });

    document.getElementById('btn-reload').addEventListener('click', () => {
        const name = document.getElementById('map-select').value;
        // El aviso cuenta TODO lo que se perdería: las casillas y también los respawns y los
        // NPC, que son justo lo que no se ve en el contador de casillas.
        const pendientes = state.map ? state.map.stats().pending : 0;

        if (pendientes > 0 &&
            !window.confirm('Hay ' + pendientes + ' cambio(s) sin guardar. ' +
                '¿Recargar y perderlos?')) {
            return;
        }
        openMap(name);
    });

    document.getElementById('btn-save').addEventListener('click', saveMap);
    document.getElementById('btn-erase').addEventListener('click', (event) => {
        ponerHerramienta('erase', event.target);
        setMapStatus('goma de borrar: borra el bloque del pincel —' +
            cuantasCasillas(state.pincel) + ' casilla(s)— y el raton ensena en ROJO el bloque ' +
            'que se va a llevar por delante. El boton derecho tambien borra');
    });
    document.getElementById('btn-flag').addEventListener('click', (event) => {
        ponerHerramienta('flag', event.target);
        state.selectedFlag = document.getElementById('flag-select').value;
        setMapStatus('bandera: ' + state.selectedFlag +
            '  (se vuelve a pulsar para quitarla de la casilla)' +
            (state.selectedFlag === 'protectionZone'
                ? '  —  es la ZONA PROTEGIDA: se ve en azul celeste, se elige y se arrastra con ' +
                  'la herramienta Elegir'
                : ''));
    });

    document.getElementById('flag-select').addEventListener('change', (event) => {
        state.selectedFlag = event.target.value;
    });

    document.getElementById('floor-select').addEventListener('change', (event) => {
        state.canvas.setFloor(Number(event.target.value));
    });

    window.addEventListener('resize', () => state.canvas.resize());

    // La lista de plantas se llena con las que tiene el mapa abierto.
    const floorSelect = document.getElementById('floor-select');
    floorSelect.innerHTML = '';
    for (let z = 0; z < 16; z += 1) {
        const option = document.createElement('option');
        option.value = String(z);
        option.textContent = 'planta ' + z + (z <= 7 ? ' (superficie)' : ' (subsuelo)');
        floorSelect.appendChild(option);
    }

    // --- Objetos ---
    const itemsView = new ItemsView({
        api: api,
        list: document.getElementById('item-list'),
        form: document.getElementById('item-form'),
        status: document.getElementById('items-status'),
        onSaved: () => {
            // La paleta del mapa depende de los objetos, así que al guardar uno hay que
            // recargarla. Si no, un objeto nuevo no se podría pintar hasta recargar la
            // página, y parecería que no se ha guardado.
            if (state.map) {
                openMap(state.map.name);
            }
        }
    });

    document.getElementById('item-filter').addEventListener('input', () => {
        itemsView._renderList();
    });

    await itemsView.load();

    // --- Compuestos ---
    wireCompuestos();
    await cargarPlantillas();
    state.compuestosView = new CompuestosView({
        api: api,
        proveedor: () => state.canvas.provider,
        nombreDe: nombreDeObjeto,
        alGuardar: (lista) => ponerPlantillas(lista)
    });

    // --- Sprites ---
    // Al guardar things.json o importar sprites, el mapa se redibuja con lo nuevo: el lienzo
    // usa el mismo formato y basta con darle las cosas y avisarle de que las hojas cambiaron.
    state.sprites = new SpritesView({
        api: api,
        alGuardar: (things, indice) => {
            const proveedor = state.canvas && state.canvas.provider;
            if (proveedor && proveedor.setThings) {
                proveedor.setThings(things);
                proveedor.recargarHojas(indice);
            }
        }
    });

    showTab('map');
    openMap(document.getElementById('map-select').value);
    loop();
}

boot();
