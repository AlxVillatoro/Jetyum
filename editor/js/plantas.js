/**
 * LA VISTA DE VARIAS PLANTAS: qué plantas se dibujan, en qué orden, con qué transparencia y con
 * qué sombra.
 *
 * VIVE APARTE DEL LIENZO PORQUE ASÍ SE PUEDE PROBAR. `mapcanvas.js` importa la cámara y el orden
 * de dibujo del cliente con rutas del montaje (`/jetyum/js/...`), que en Node no existen; esto no
 * importa nada, así que la DECISIÓN —que es lo que puede estar mal— se comprueba sin navegador
 * (`tools/test-editor-plantas.mjs`), y en el lienzo sólo queda pintar lo que aquí se decide.
 *
 * LOS TRES MODOS SON LOS DE RME Y NEXAMAP, y los tres empiezan APAGADOS: con todo apagado el plan
 * es una sola planta —la que se edita, con su fondo— y el editor se ve exactamente como antes.
 *
 *   - `inferiores` («show all floors»): debajo de la planta que se edita se dibujan las de abajo,
 *     como hace el juego cuando ningún techo las tapa. El alcance es el del cliente de Tibia
 *     (`calcLastVisibleFloor` de OTClient): en la superficie y por encima se baja HASTA LA 7 y no
 *     más —bajo la calle hay tierra, no se ve el sótano—, y bajo tierra se ven DOS plantas más.
 *     En la 7 justo no hay nada debajo que enseñar, y eso no es un fallo: es lo que hace el juego.
 *   - `sombra` («show shade»): cada planta de abajo se oscurece con un velo negro al acabar de
 *     dibujarla, así que cuanto más honda, más oscura. Sin esto no se distingue a simple vista
 *     qué es de la planta que se edita y qué es del sótano que se ve por un agujero.
 *   - `fantasmaSuperior` («ghost higher floors»): DESPUÉS de la planta que se edita se dibuja la
 *     de encima, transparente, para ver qué hay sobre lo que se está pintando —el piso de arriba
 *     de una casa, un puente— sin tener que subir a mirarlo.
 *
 * EL ORDEN ES EL DEL JUEGO: de la planta más honda (z mayor) a la más alta (z menor). Las de
 * arriba se pintan después y por eso tapan a las de abajo; es el mismo criterio que sigue
 * `drawlist.js`, y aquí no se inventa otro.
 */

/** La superficie. Por encima (z menor) está el aire; por debajo (z mayor), el subsuelo. */
export const SUPERFICIE = 7;

/** La planta más honda que existe en Tibia. */
export const PLANTA_MAS_HONDA = 15;

/** Cuántas plantas de abajo se ven estando bajo tierra (el `AWARE_UNDEGROUND_FLOOR_RANGE`). */
export const ALCANCE_BAJO_TIERRA = 2;

/**
 * La opacidad del velo negro que oscurece cada planta de abajo.
 *
 * Se aplica UNA VEZ POR PLANTA, así que dos plantas por debajo quedan con dos velos encima: con
 * 0,4 la de justo abajo se ve al 60 % y la siguiente al 36 %. Lo bastante oscuro para que no se
 * confunda con la que se edita, y lo bastante claro para que se lea qué hay.
 */
export const ALFA_SOMBRA = 0.4;

/**
 * La opacidad de la planta de encima en el modo fantasma.
 *
 * Por debajo de un tercio no se distingue un muro de un suelo; por encima de la mitad ya tapa lo
 * que se está pintando, que es justo lo que el fantasma no tiene que hacer.
 */
export const ALFA_FANTASMA_SUPERIOR = 0.35;

/** Los tres modos apagados: el editor de siempre, una sola planta. */
export const VISTA_POR_DEFECTO = Object.freeze({
    inferiores: false,
    fantasmaSuperior: false,
    sombra: false
});

/**
 * Mezcla unas opciones con la vista actual y devuelve una vista completa y nueva.
 *
 * SÓLO SE CAMBIA LO QUE SE DICE: `{sombra: true}` enciende la sombra y deja como estaban los
 * otros dos modos, que es lo que espera un botón que conmuta uno solo. Cualquier valor se lee
 * como booleano, para que un `1` de una casilla de marcar no se quede guardado como número.
 *
 * @param {Object} [opciones] `{inferiores?, fantasmaSuperior?, sombra?}`
 * @param {Object} [actual] la vista de antes; por defecto, todo apagado
 * @returns {{inferiores: boolean, fantasmaSuperior: boolean, sombra: boolean}}
 */
export function normalizarVista(opciones, actual) {
    const base = actual || VISTA_POR_DEFECTO;
    const cambios = opciones || {};
    const vista = {};

    Object.keys(VISTA_POR_DEFECTO).forEach((nombre) => {
        vista[nombre] = cambios[nombre] === undefined ? !!base[nombre] : !!cambios[nombre];
    });

    return vista;
}

/** ¿Son la misma vista? Es lo que decide si hay que tirar la copia de la capa de abajo. */
export function mismaVista(a, b) {
    return Object.keys(VISTA_POR_DEFECTO).every((nombre) => !!(a && a[nombre]) === !!(b && b[nombre]));
}

/**
 * Las plantas que se ven por debajo de una, DE LA MÁS HONDA A LA DE JUSTO ABAJO.
 *
 * @param {number} z la planta que se edita
 * @param {number} [numPlantas] cuántas plantas tiene el mapa; por defecto, las 16 de Tibia
 * @returns {Array<number>} en orden de pintado; vacía en la 7 y en la última
 */
export function plantasInferiores(z, numPlantas) {
    const total = numPlantas > 0 ? numPlantas : PLANTA_MAS_HONDA + 1;
    const ultima = z > SUPERFICIE
        ? Math.min(z + ALCANCE_BAJO_TIERRA, PLANTA_MAS_HONDA)
        : SUPERFICIE;
    const plantas = [];

    for (let planta = Math.min(ultima, total - 1); planta > z; planta -= 1) {
        plantas.push(planta);
    }

    return plantas;
}

/**
 * ¿Tiene esta planta, EN EL JUEGO, un suelo por defecto que la cubra entera?
 *
 * ES LA REGLA DEL MOTOR (`defaultGroundFor` de `engine/world/map.js`) y no la del modelo del
 * editor, y la diferencia importa aquí: el editor devuelve el suelo de respaldo para CUALQUIER
 * planta, así que la 6 sale cubierta de hierba de punta a punta; el motor no aplica el respaldo
 * por encima de la superficie, porque ahí no hay suelo, hay aire. Con una sola planta en pantalla
 * da igual —se pinta el fondo y listo, como siempre—, pero con las de abajo encendidas ese fondo
 * taparía la 7 entera y el modo no serviría para nada justo donde más falta hace: editando el
 * piso de arriba de una casa.
 *
 * @param {Object} [declarados] el `defaultGround` del mapa, `{z: typeId}`
 * @param {number} z
 */
export function plantaConSueloPorDefecto(declarados, z) {
    if (declarados && declarados[z] !== undefined && declarados[z] !== null) {
        return true;
    }
    return z >= SUPERFICIE;
}

/**
 * EL PLAN DE DIBUJO: la lista de plantas que el lienzo tiene que pintar, ya en orden.
 *
 * Cada paso dice:
 *   - `z`: la planta.
 *   - `papel`: `inferior`, `actual` o `superior` (el fantasma de encima).
 *   - `alfa`: la opacidad con la que se pinta la planta ENTERA (no cada sprite: ver el lienzo).
 *   - `fondo`: si se pinta su suelo por defecto como fondo. La actual lo lleva SIEMPRE con las de
 *     abajo apagadas —el comportamiento de siempre—, y con ellas encendidas sólo si el juego se
 *     lo pondría (`plantaConSueloPorDefecto`). El fantasma de encima nunca: un velo de hierba al
 *     35 % sobre todo el mapa no enseña lo que hay encima, lo emborrona.
 *   - `sobreOtras`: si ya hay alguna planta pintada debajo. Es lo que le dice al lienzo que el
 *     fondo no puede pintarse «borrando» las casillas con suelo propio, porque borraría lo de
 *     abajo.
 *   - `sombra`: la opacidad del velo negro que va DESPUÉS de esta planta, o 0.
 *
 * @param {number} z la planta que se edita
 * @param {Object} [vista] `{inferiores, fantasmaSuperior, sombra}`
 * @param {Object} [opciones]
 * @param {number} [opciones.numPlantas] cuántas plantas tiene el mapa
 * @param {Function} [opciones.conFondo] `(z) => boolean`; por defecto, la regla del motor sin
 *        plantas declaradas
 * @param {Function} [opciones.tieneCasillas] `(z) => boolean`. Si se da, una planta de abajo o de
 *        encima que no tiene ni fondo ni casillas se SALTA: no hay nada que dibujar, y recorrerla
 *        entera para no dibujar nada es trabajo tirado (en «ver todo» son miles de consultas).
 * @returns {Array<{z: number, papel: string, alfa: number, fondo: boolean, sobreOtras: boolean, sombra: number}>}
 */
export function planDePlantas(z, vista, opciones) {
    const modo = normalizarVista(vista);
    const opts = opciones || {};
    const conFondo = typeof opts.conFondo === 'function'
        ? opts.conFondo
        : (planta) => plantaConSueloPorDefecto(null, planta);
    const tieneCasillas = typeof opts.tieneCasillas === 'function' ? opts.tieneCasillas : null;
    const pasos = [];

    if (modo.inferiores) {
        plantasInferiores(z, opts.numPlantas).forEach((planta) => {
            const fondo = !!conFondo(planta);

            if (!fondo && tieneCasillas && !tieneCasillas(planta)) {
                return;
            }

            pasos.push({
                z: planta,
                papel: 'inferior',
                alfa: 1,
                fondo: fondo,
                sobreOtras: pasos.length > 0,
                sombra: modo.sombra ? ALFA_SOMBRA : 0
            });
        });
    }

    pasos.push({
        z: z,
        papel: 'actual',
        alfa: 1,
        // Sin nada debajo, el fondo de siempre; con algo debajo, sólo el que pondría el juego.
        fondo: pasos.length === 0 || modo.inferiores === false ? true : !!conFondo(z),
        sobreOtras: pasos.length > 0,
        sombra: 0
    });

    const encima = z - 1;

    if (modo.fantasmaSuperior && encima >= 0 && (!tieneCasillas || tieneCasillas(encima))) {
        pasos.push({
            z: encima,
            papel: 'superior',
            alfa: ALFA_FANTASMA_SUPERIOR,
            fondo: false,
            sobreOtras: true,
            sombra: 0
        });
    }

    return pasos;
}
