/**
 * LA VENTANA DE COMERCIO, como la de los NPC de Tibia: se abre diciendo «comerciar» (o «trade»)
 * junto a un NPC con tienda.
 *
 * - Dos pestañas: COMPRAR (lo que vende el NPC) y VENDER (lo que te compra; sale cuántos tienes).
 * - Clic en una fila para elegirla, la cantidad con los botones o escribiéndola, y el total.
 * - El motor decide todo (dinero, huecos de la mochila, peso) y contesta con la ventana al día.
 * - Se cierra sola si te alejas del NPC.
 */

import { iconoDeObjeto } from './panels.js';
import { pintarIconos } from './iconos.js';

function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/**
 * @param {Object} o
 * @param {Object} o.gestor el de `ventanas.js`
 * @param {Object} o.provider para los dibujos
 * @param {Function} o.comprar (typeId, cantidad)
 * @param {Function} o.vender (typeId, cantidad)
 * @param {Function} o.cerrar ()
 */
export function crearVentanaComercio(o) {
    let caja = null;
    let datos = null;
    let modo = 'comprar';
    let elegido = null;
    let cantidad = 1;

    function lista() {
        if (!datos) {
            return [];
        }
        return datos.offers
            .map(([typeId, nombre, compra, venta, tienes]) => ({ typeId, nombre, compra, venta, tienes }))
            .filter((x) => (modo === 'comprar' ? x.compra > 0 : x.venta > 0));
    }

    function precio(x) {
        return modo === 'comprar' ? x.compra : x.venta;
    }

    function pintar() {
        const filas = lista();
        if (!filas.some((x) => x.typeId === elegido)) {
            elegido = filas.length ? filas[0].typeId : null;
        }
        const actual = filas.find((x) => x.typeId === elegido);
        const maximo = actual && modo === 'vender' ? Math.max(1, actual.tienes) : 100;
        cantidad = Math.max(1, Math.min(maximo, cantidad));
        caja.innerHTML =
            '<div class="ventana-cabecera"><span class="titulo">' + escapar(datos.npc) + '</span>' +
            '<button type="button" class="boton-icono" data-cerrar-comercio data-icono="cerrar" title="Cerrar"></button></div>' +
            '<div class="ventana-cuerpo comercio">' +
            '<div class="comercio-pestanas">' +
            '<button type="button" data-modo="comprar" class="' + (modo === 'comprar' ? 'activa' : '') + '">Comprar</button>' +
            '<button type="button" data-modo="vender" class="' + (modo === 'vender' ? 'activa' : '') + '">Vender</button></div>' +
            '<div class="comercio-lista">' + (filas.length ? filas.map((x) =>
                '<div class="comercio-fila' + (x.typeId === elegido ? ' elegida' : '') + '" data-tipo="' + x.typeId + '" title="' +
                escapar(x.nombre) + (modo === 'vender' ? ' (tienes ' + x.tienes + ')' : '') + '">' +
                iconoDeObjeto(x.typeId, o.provider, 32, 1) +
                '<span class="nombre">' + escapar(x.nombre) + (modo === 'vender' ? ' <small>x' + x.tienes + '</small>' : '') + '</span>' +
                '<span class="precio">' + precio(x) + '</span></div>').join('')
                : '<span class="vacio">' + (modo === 'comprar' ? 'no vende nada' : 'no te compra nada') + '</span>') +
            '</div>' +
            '<div class="comercio-pie">' +
            '<div class="cantidad"><button type="button" data-menos title="Uno menos">−</button>' +
            '<input type="number" min="1" max="' + maximo + '" value="' + cantidad + '" data-cantidad>' +
            '<button type="button" data-mas title="Uno más">+</button></div>' +
            '<div class="total">' + (actual ? precio(actual) * cantidad : 0) + ' oro · tienes ' + datos.money + '</div>' +
            '<button type="button" class="hacer" data-hacer' + (actual ? '' : ' disabled') + '>' +
            (modo === 'comprar' ? 'Comprar' : 'Vender') + '</button></div></div>';
        pintarIconos(caja);
    }

    function crear() {
        caja = document.createElement('section');
        caja.className = 'ventana ventana-comercio';
        caja.dataset.ventanaId = 'comercio';
        caja.dataset.temporal = '1';
        caja.dataset.orden = '0';
        caja.addEventListener('click', (e) => {
            if (e.target.closest('[data-cerrar-comercio]')) {
                o.cerrar();
                cerrar();
                return;
            }
            const pestana = e.target.closest('[data-modo]');
            if (pestana) {
                modo = pestana.dataset.modo;
                cantidad = 1;
                pintar();
                return;
            }
            const fila = e.target.closest('[data-tipo]');
            if (fila) {
                elegido = Number(fila.dataset.tipo);
                pintar();
                return;
            }
            if (e.target.closest('[data-menos]')) {
                cantidad -= 1;
                pintar();
            } else if (e.target.closest('[data-mas]')) {
                cantidad += 1;
                pintar();
            } else if (e.target.closest('[data-hacer]') && elegido !== null) {
                (modo === 'comprar' ? o.comprar : o.vender)(elegido, cantidad);
            }
        });
        caja.addEventListener('change', (e) => {
            if (e.target.matches('[data-cantidad]')) {
                cantidad = Math.trunc(Number(e.target.value) || 1);
                pintar();
            }
        });
    }

    function cerrar() {
        if (caja) {
            caja.remove();
            caja = null;
            datos = null;
            o.gestor.colocar();
        }
    }

    return {
        /** Abre la ventana (o la pone al día tras comprar o vender). */
        abrir(nuevos) {
            const nueva = !caja;
            if (nueva) {
                crear();
                modo = 'comprar';
                cantidad = 1;
                elegido = null;
            }
            datos = nuevos;
            pintar();
            if (nueva) {
                o.gestor.abrir(caja);
            } else {
                o.gestor.colocar();
            }
        },
        cerrar,
        abierta: () => !!caja
    };
}
