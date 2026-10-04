/**
 * ARRASTRAR CON EL RATON: de la mochila a una ranura, de una ranura a otra y del suelo a la
 * mochila.
 *
 * POR QUE CON EL RATON A MANO Y NO CON EL API DE ARRASTRAR DEL NAVEGADOR.
 *
 * El API del navegador (`draggable`, `dragstart`, `dragover`, `drop`) funciona muy bien entre
 * elementos del DOM, y el panel lo es. El problema es el SUELO: el mundo se dibuja en un `<canvas>`,
 * y de un lienzo no se puede empezar un arrastre nativo, porque dentro de el no hay elementos -hay
 * pixeles-. Poner una capa de divs encima del mapa para poder arrastrar seria duplicar en el cliente
 * la rejilla que ya tiene el motor, y esas dos rejillas se separan en cuanto una cambie.
 *
 * Asi que se hace a mano, que ademas es MAS robusto para lo que hay aqui: un solo camino para las
 * tres direcciones, el fantasma se puede pintar con el sprite de verdad del objeto, y no depende de
 * que el navegador quiera iniciar un arrastre nativo desde un lienzo.
 *
 * QUE DECIDE ESTE MODULO Y QUE NO. Aqui solo hay gesto: de donde sale el objeto, que hay debajo del
 * raton y cuando se suelta. LOS EXTREMOS LOS RESUELVE `main.js`, que es el unico que conoce la
 * camara, el mundo y el panel: aqui se le piden ya resueltos con `origenEnPunto` y `destinoEnPunto`.
 *
 * Y NO SE DECIDE SI EL MOVIMIENTO VALE: se pide. Lo unico que se hace con las banderas es ENSENAR
 * -que el objeto se puede arrastrar, y en que casillas encaja-, y eso es presentacion. El motor
 * valida el movimiento y contesta con un motivo cuando no se puede, y ese mensaje se ve en el chat.
 *
 * @param {Object} opciones
 * @param {Function} opciones.origenEnPunto (x, y) -> { origen, typeId, dibujo } o null
 * @param {Function} opciones.destinoEnPunto (x, y) -> { destino, elemento } o null
 * @param {Function} opciones.encaja (typeId, destino) -> boolean, solo para el resaltado
 * @param {Function} opciones.alMover (origen, destino) -> pide el movimiento al motor
 * @returns {{cancelar: Function, activo: Function}}
 */
/**
 * Píxeles que hay que mover el ratón con el botón pulsado para que sea un ARRASTRE y no un clic.
 * Por debajo, el gesto es un clic (andar hasta ahí); por encima, un deslizamiento, que NUNCA es un
 * clic aunque se vuelva a soltar en la misma casilla.
 */
export const UMBRAL_ARRASTRE = 6;

export function crearArrastre(opciones) {
    const opts = opciones || {};

    /** El arrastre en curso (ya empezado: con su fantasma), o null. */
    let arrastre = null;

    /** Lo que se ha pulsado y TODAVÍA NO es arrastre (no se ha movido lo bastante), o null. */
    let pendiente = null;

    /**
     * El gesto del botón izquierdo: dónde se pulsó y si se ha deslizado más del umbral. Cuenta
     * aunque no haya nada que arrastrar: deslizar el ratón por el mapa no es un clic.
     */
    let gesto = null;
    let ultimoFueDeslizamiento = false;

    /** Lo que se resalta ahora mismo, para poder quitarle el resaltado. */
    let resaltado = null;

    /** Cuándo se soltó el último arrastre: el clic que el navegador manda justo después no es un clic. */
    let soltadoEn = 0;

    /** Un fantasma con el dibujo del objeto, colgado del cursor. */
    function crearFantasma(dibujo) {
        const caja = document.createElement('div');
        caja.className = 'fantasma';

        if (dibujo) {
            caja.appendChild(dibujo);
        }

        return caja;
    }

    /*
     * EL FANTASMA NO RECIBE EL RATON, y no es un detalle: si lo recibiera, `elementFromPoint`
     * devolveria el fantasma en vez de lo que hay debajo, y el destino de un arrastre seria siempre
     * el propio fantasma. Se apaga desde el CSS con `pointer-events: none`, y aqui se documenta
     * porque es la clase de linea que alguien borra por parecer decorativa.
     */
    function colocarFantasma(x, y) {
        if (!arrastre || !arrastre.fantasma) {
            return;
        }
        arrastre.fantasma.style.left = x + 'px';
        arrastre.fantasma.style.top = y + 'px';
    }

    /** Quita el resaltado del destino que lo tuviera. */
    function limpiarResaltado() {
        if (resaltado) {
            resaltado.classList.remove('encaja', 'no-encaja');
            resaltado = null;
        }
    }

    /** Resalta lo que hay debajo, segun si el objeto encaja o no. */
    function resaltar(x, y, destino) {
        limpiarResaltado();

        if (!destino || !destino.elemento) {
            return;
        }

        const vale = opts.encaja(arrastre.typeId, destino.destino);
        destino.elemento.classList.add(vale ? 'encaja' : 'no-encaja');
        resaltado = destino.elemento;
    }

    function limpiar() {
        limpiarResaltado();

        if (arrastre && arrastre.fantasma && arrastre.fantasma.parentNode) {
            arrastre.fantasma.parentNode.removeChild(arrastre.fantasma);
        }

        arrastre = null;
        pendiente = null;
        // La manita de arrastrar sólo mientras de verdad se lleva un objeto.
        document.body.classList.remove('arrastrando-objeto');
    }

    /** Empieza el arrastre de verdad: el fantasma con el dibujo y la manita. */
    function empezar(x, y) {
        arrastre = {
            origen: pendiente.origen,
            typeId: pendiente.typeId,
            fantasma: crearFantasma(pendiente.dibujo)
        };
        pendiente = null;
        document.body.appendChild(arrastre.fantasma);
        document.body.classList.add('arrastrando-objeto');
        colocarFantasma(x, y);
        resaltar(x, y, opts.destinoEnPunto(x, y));
    }

    function onMouseDown(evento) {
        // Los dos botones a la vez es «mirar», no arrastrar.
        if ((arrastre || pendiente) && evento.buttons === 3) {
            limpiar();
            gesto = null;
            return;
        }
        // Solo el boton izquierdo, y solo si no hay ya un arrastre en curso. El derecho sigue
        // siendo el de usar y atacar.
        if (arrastre || evento.button !== 0) {
            return;
        }

        gesto = { x: evento.clientX, y: evento.clientY, deslizado: false };

        const encontrado = opts.origenEnPunto(evento.clientX, evento.clientY);

        if (!encontrado) {
            return;
        }

        // Sin esto, arrastrar seleccionaria el texto del panel y el navegador empezaria su propio
        // arrastre de imagenes.
        evento.preventDefault();

        // TODAVÍA NO ES UN ARRASTRE: lo será si el ratón se mueve más del umbral con el botón
        // pulsado. Si se suelta antes, es un clic.
        pendiente = encontrado;
    }

    function onMouseMove(evento) {
        if (gesto && !gesto.deslizado &&
            Math.hypot(evento.clientX - gesto.x, evento.clientY - gesto.y) > UMBRAL_ARRASTRE) {
            gesto.deslizado = true;
        }
        if (pendiente && gesto && gesto.deslizado) {
            empezar(evento.clientX, evento.clientY);
        }
        if (!arrastre) {
            return;
        }

        colocarFantasma(evento.clientX, evento.clientY);
        resaltar(evento.clientX, evento.clientY, opts.destinoEnPunto(evento.clientX, evento.clientY));
    }

    function onMouseUp(evento) {
        if (evento.button === 0 && gesto) {
            ultimoFueDeslizamiento = gesto.deslizado;
            gesto = null;
        }
        if (!arrastre) {
            // Pulsar y soltar sin moverse más del umbral no es arrastrar: es un CLIC.
            pendiente = null;
            return;
        }

        const destino = opts.destinoEnPunto(evento.clientX, evento.clientY);
        const origen = arrastre.origen;

        limpiar();
        soltadoEn = performance.now();

        if (!destino) {
            // Soltado en el aire: no se ha pedido nada. No hace falta un mensaje, porque no hay
            // nada que explicar: el jugador ha cambiado de idea.
            return;
        }

        opts.alMover(origen, destino.destino);
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return {
        cancelar: () => {
            limpiar();
            gesto = null;
        },
        activo: () => arrastre !== null,
        acabaDeSoltar: () => performance.now() - soltadoEn < 250,
        /**
         * ¿El último gesto del botón izquierdo fue DESLIZAR el ratón (más del umbral)? Entonces no
         * es un clic, aunque no se arrastrara nada y aunque se soltara en la misma casilla.
         */
        fueDeslizamiento: () => ultimoFueDeslizamiento
    };
}
