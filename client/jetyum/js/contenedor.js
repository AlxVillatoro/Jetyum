/**
 * LAS VENTANAS DE LOS CONTENEDORES: los del suelo (los cuerpos o cajas que abres con clic derecho,
 * el depósito) y LOS QUE LLEVAS (una bolsa dentro de tu mochila, a cualquier profundidad).
 *
 * LAS DOS CLASES SE PINTAN IGUAL Y SE DISTINGUEN POR EL SIGNO DEL ID (`CONTAINER_ID` en
 * `shared/js/protocol.mjs`): positivo, un objeto del mundo; negativo, uno tuyo. Lo único que cambia
 * es lo que se le pide al motor al arrastrar desde o hacia la ventana (`data-destino`), y que en las
 * tuyas no hay «coger todo»: ya es tuyo. Dentro de una ventana, CLIC DERECHO SOBRE OTRA BOLSA LA ABRE
 * en su propia ventana, y SOLTAR ALGO ENCIMA DE UNA BOLSA lo mete dentro de ella.
 *
 * Puede haber varios abiertos a la vez, como en Tibia, y CADA UNO SE ABRE DEBAJO DE LO QUE YA
 * TENÍAS ABIERTO. Si ya no cabe, se cierra el último contenedor que tenías abierto en esa columna
 * (lo decide `ventanas.js`, que llama a `caja._cerrar`). Dentro, los
 * huecos del contenedor con lo que tiene. Para coger algo: clic derecho o doble clic (va a tu
 * mochila), el botón «coger todo», o arrastrarlo al mapa, a tu equipo o a la mochila. El motor
 * decide si se puede (al lado, con mochila y si puedes con el peso) y cierra la ventana si te
 * alejas o el cuerpo se pudre.
 */

import { iconoDeObjeto, numeroDeEsquina } from './panels.js';
import { pintarIconos } from './iconos.js';
import { CONTAINER_ID } from '../../../shared/js/protocol.mjs';

function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/**
 * @param {Object} o
 * @param {Object} o.provider para dibujar los objetos
 * @param {Function} o.coger (id, indice) => void   (el botón «coger todo»)
 * @param {Function} o.usar (id, indice) => void    (clic derecho sobre algo de dentro)
 * @param {Function} [o.ambos] () => boolean, si se están pulsando los dos botones (mirar)
 * @param {Function} o.cerrar (id) => void
 * @param {Object} o.gestor el gestor de ventanas (las coloca)
 * @param {Function} [o.esContenedor] (typeId) => boolean, para decir en su título que se abre
 */
export function crearVentanaContenedor(o) {
    const { provider, coger, cerrar, gestor } = o;
    /** id del contenedor → { datos, caja, pendiente } */
    const abiertos = new Map();
    let orden = 0;

    function crearCaja(id) {
        const caja = document.createElement('section');
        caja.className = 'ventana ventana-contenedor';
        caja.dataset.contenedorId = String(id);
        // Una tuya (una bolsa de tu mochila) o una del suelo: ver `CONTAINER_ID`.
        caja.dataset.propio = CONTAINER_ID.esPropio(id) ? '1' : '';
        // Temporal y con su número de orden: se coloca DEBAJO de lo que ya estaba abierto.
        caja.dataset.temporal = '1';
        orden += 1;
        caja.dataset.orden = String(orden);
        const datosDe = () => (abiertos.get(id) || {}).datos;
        // Para que el gestor de ventanas lo cierre si al abrir otro ya no cabe (avisa al motor).
        caja._cerrar = () => {
            cerrar(id);
            quitar(id);
        };
        // CLIC DERECHO sobre algo de dentro: USARLO (comer, beber...). Para cogerlo, se arrastra.
        // Con los dos botones a la vez se mira (eso lo hace main.js).
        caja.addEventListener('contextmenu', (e) => {
            const hueco = e.target.closest('[data-hueco]');
            if (hueco) {
                e.preventDefault();
                if (!(o.ambos && o.ambos())) {
                    o.usar(id, Number(hueco.dataset.hueco));
                }
            }
        });
        caja.addEventListener('click', (e) => {
            if (e.target.closest('[data-cerrar]')) {
                cerrar(id);
                quitar(id);
            } else if (e.target.closest('[data-minimizar]')) {
                caja.classList.toggle('minimizada');
                gestor.colocar();
            } else if (e.target.closest('[data-coger-todo]')) {
                const datos = datosDe();
                // De atrás adelante: al coger uno, los de detrás no cambian de índice.
                for (let i = datos.items.length - 1; i >= 0; i -= 1) {
                    coger(id, datos.items[i].index);
                }
            }
        });
        return caja;
    }

    function pintar(id) {
        const v = abiertos.get(id);
        const { datos, caja } = v;
        v.pendiente = datos.items.some((it) => provider && provider.dibujoListo && !provider.dibujoListo(it.typeId));
        const propio = CONTAINER_ID.esPropio(datos.id);
        const huecos = [];
        for (let i = 0; i < datos.capacity; i += 1) {
            const it = datos.items[i];
            // Una bolsa de dentro se ABRE con clic derecho, y lo que se suelta encima va dentro de ella.
            const bolsa = it && o.esContenedor && o.esContenedor(it.typeId);
            huecos.push(it
                ? '<div class="objeto arrastrable' + (bolsa ? ' es-contenedor' : '') + '" data-contenedor="' + datos.id +
                  '" data-hueco="' + it.index + '"' + (bolsa ? ' data-bolsa="1"' : '') +
                  ' title="' + escapar(it.name) + (it.count > 1 ? ' x' + it.count : '') +
                  (bolsa ? ' (arrástralo para moverlo; clic derecho: abrirlo; los dos botones: mirarlo)">'
                      : ' (arrástralo para moverlo; clic derecho: usarlo; los dos botones: mirarlo)">') +
                  iconoDeObjeto(it.typeId, provider, 32, it.count) +
                  numeroDeEsquina(it) + '</div>'
                : '<div class="objeto hueco-vacio"></div>');
        }
        caja.innerHTML =
            '<div class="ventana-cabecera"><span class="titulo"' +
            (propio ? ' title="Llevas esto: arrastra aquí para meter algo dentro."' : '') + '>' + escapar(datos.name) + '</span>' +
            // «Coger todo» sólo en los del suelo: lo de una bolsa tuya ya lo llevas.
            (propio ? '' : '<button type="button" class="boton-icono" data-coger-todo data-icono="coger" title="Coger todo (a tu mochila)"></button>') +
            '<button type="button" class="boton-icono" data-minimizar data-icono="minimizar" title="Minimizar"></button>' +
            '<button type="button" class="boton-icono" data-cerrar data-icono="cerrar" title="Cerrar"></button></div>' +
            // El cuerpo de la ventana es un DESTINO: lo que sueltas en él va dentro de este contenedor.
            '<div class="ventana-cuerpo" data-destino="' + (propio ? 'contenedor-propio' : 'contenedor-suelo') +
            '" data-contenedor-id="' + datos.id + '">' +
            '<div class="rejilla-contenedor">' + huecos.join('') + '</div>' +
            (datos.items.length === 0 ? '<span class="vacio">vacío</span>' : '') + '</div>';
        pintarIconos(caja);
    }

    function quitar(id) {
        const v = abiertos.get(id);
        if (v) {
            v.caja.remove();
            abiertos.delete(id);
            gestor.colocar();
        }
    }

    return {
        /** Abre (o actualiza, si ya estaba abierto) la ventana de un contenedor. */
        abrir(datos) {
            const id = Number(datos.id);
            const nuevo = !abiertos.has(id);
            if (nuevo) {
                abiertos.set(id, { datos, caja: crearCaja(id), pendiente: false });
            } else {
                abiertos.get(id).datos = datos;
            }
            pintar(id);
            if (nuevo) {
                gestor.abrir(abiertos.get(id).caja);
            } else {
                gestor.colocar();
            }
        },
        /** Cierra uno (por su id) o, sin id, todos. */
        cerrar(id) {
            if (id === undefined) {
                [...abiertos.keys()].forEach(quitar);
            } else {
                quitar(Number(id));
            }
        },
        /** Repinta los que tenían algún dibujo sin cargar (los sprites llegan por HTTP). */
        repintar() {
            abiertos.forEach((v, id) => {
                if (v.pendiente) {
                    pintar(id);
                }
            });
        },
        get abierto() {
            return abiertos.size ? [...abiertos.keys()].pop() : null;
        },
        /** Lo que hay en el hueco `indice` del contenedor `id` (para arrastrarlo). */
        objetoEn(id, indice) {
            const v = abiertos.get(Number(id));
            return v ? v.datos.items.find((it) => it.index === indice) || null : null;
        }
    };
}
