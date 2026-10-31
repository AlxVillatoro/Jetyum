/**
 * «USAR CON»: LA CRUZ DE TIBIA.
 *
 * Una runa o una herramienta (la cuerda, la pala) no se usan solas: se usan SOBRE algo. Al usarlas
 * -clic derecho en el equipo o en la mochila, o una hotkey «con la cruz»- el cursor se vuelve una
 * cruz, y el siguiente clic izquierdo dice sobre qué: la criatura que haya ahí (tú también) o, si
 * no hay ninguna, la casilla. Escape o el clic derecho lo cancelan.
 *
 * El cliente sólo dice QUÉ y SOBRE QUÉ (`CLIENT.USE_WITH`): si llega, si se ve, si es una zona de
 * protección o si quedan cargas lo decide el motor, y lo dice en el chat.
 *
 * Lo que se puede probar sin navegador -qué mensaje sale de un clic- son funciones puras, aquí
 * arriba; `crearCruz` es lo que escucha al ratón.
 */

import { CLIENT } from '../../../shared/js/protocol.mjs';

/** Lo que se dice al entrar en la cruz (en la línea de estado y, la primera vez, en el chat). */
export const AYUDA_CRUZ = 'Elige sobre qué usarlo (Escape o clic derecho: cancelar)';

/**
 * El DESTINO de un clic con la cruz: la criatura de esa casilla, si hay alguna (la de más arriba,
 * que es la que se ve), o la casilla.
 *
 * @param {{x: number, y: number, z: number}} casilla la casilla bajo el ratón
 * @param {Array} criaturas las criaturas que hay en ella (`world.creaturesAt`)
 * @returns {Object} `{ criatura: id }` o `{ casilla: [x, y, z] }`
 */
export function destinoDeClic(casilla, criaturas) {
    const lista = Array.isArray(criaturas) ? criaturas : [];
    const criatura = lista.length > 0 ? lista[lista.length - 1] : null;
    if (criatura && criatura.id) {
        return { criatura: Number(criatura.id) };
    }
    return { casilla: [Number(casilla.x), Number(casilla.y), Number(casilla.z)] };
}

/**
 * El mensaje «usar con»: `[USE_WITH, origen, destino]`.
 *
 * @param {Object} origen `{ inventario: índice }` o `{ hotkey: typeId }`
 * @param {Object} destino `{ criatura: id }` o `{ casilla: [x, y, z] }`
 */
export function mensajeUsarCon(origen, destino) {
    return [CLIENT.USE_WITH, origen, destino];
}

/**
 * La cruz: el modo en que el siguiente clic elige sobre qué se usa algo.
 *
 * Escucha en la fase de CAPTURA de la ventana, antes que nadie: mientras la cruz está puesta, el clic
 * en el mapa no tiene que andar, ni el botón derecho atacar, ni el ratón empezar un arrastre.
 *
 * @param {Object} o
 * @param {Function} o.destinoEn (evento) => el destino bajo el ratón (`destinoDeClic`), o null si
 *        ahí no hay nada sobre lo que usarlo (fuera del mapa): entonces se cancela
 * @param {Function} o.enviar (mensaje) => lo manda al motor
 * @param {HTMLElement} [o.estado] la línea de estado, donde se pone la ayuda mientras dure
 * @param {Function} [o.aviso] (texto) => la ayuda en el chat, sólo la primera vez
 */
export function crearCruz(o) {
    let origen = null;
    let textoAntes = null;
    let avisado = false;
    // El clic (o el menú) que el navegador manda al soltar el botón que eligió o canceló: ya se
    // atendió al pulsar, y no tiene que andar ni usar nada.
    let tragarHasta = 0;

    const activa = () => origen !== null;

    function empezar(desde) {
        origen = desde;
        document.body.classList.add('usando-con');
        if (o.estado) {
            if (textoAntes === null) {
                textoAntes = o.estado.textContent;
            }
            o.estado.textContent = AYUDA_CRUZ;
        }
        if (!avisado && o.aviso) {
            avisado = true;
            o.aviso(AYUDA_CRUZ + '.');
        }
    }

    function cancelar() {
        if (!activa()) {
            return;
        }
        origen = null;
        document.body.classList.remove('usando-con');
        if (o.estado && textoAntes !== null) {
            // Si alguien cambió el estado entretanto (se perdió la conexión), se deja el suyo.
            if (o.estado.textContent === AYUDA_CRUZ || o.estado.textContent === '') {
                o.estado.textContent = textoAntes;
            }
        }
        textoAntes = null;
    }

    window.addEventListener('mousedown', (e) => {
        if (!activa()) {
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        tragarHasta = performance.now() + 600;
        const desde = origen;
        if (e.button === 0) {
            const destino = o.destinoEn(e);
            cancelar();
            if (destino) {
                o.enviar(mensajeUsarCon(desde, destino));
            }
            return;
        }
        // Cualquier otro botón (el derecho): cancelar, como en Tibia.
        cancelar();
    }, true);

    const tragar = (e) => {
        if (performance.now() < tragarHasta) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.type === 'click' || e.type === 'contextmenu') {
                tragarHasta = 0;
            }
        }
    };
    window.addEventListener('click', tragar, true);
    window.addEventListener('dblclick', tragar, true);
    window.addEventListener('contextmenu', tragar, true);

    window.addEventListener('keydown', (e) => {
        if (activa() && e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            cancelar();
        }
    }, true);

    return { empezar, cancelar, activa, origen: () => origen };
}
