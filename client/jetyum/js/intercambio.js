/**
 * LA VENTANA DEL INTERCAMBIO ENTRE JUGADORES, como la de Tibia («Trade with...»).
 *
 * - Se abre al ofrecerle algo a otro jugador (Ctrl + clic derecho sobre un objeto, «Comerciar con…»
 *   y clic en el jugador: main.js) y se pone al día con cada `SERVER.TRADE`.
 * - Dos listas: TU OFERTA y LA SUYA (vacía hasta que conteste). Un contenedor sale con todo lo de
 *   dentro, en una lista plana, como en TFS.
 * - Clic en un objeto de cualquiera de las dos: mirarlo (el motor contesta en el chat).
 * - «Acepto» y «Cancelar»; debajo de cada lista, si ese lado ya ha aceptado.
 * - El motor decide todo (si cabe, si pesa demasiado, si algo se movió) y la cierra con
 *   `SERVER.TRADE_CLOSE`, con el porqué en el chat.
 *
 * Los textos van en español: los traduce `shared/i18n/en/intercambio.mjs` al pintarse.
 *
 * Lo que se puede probar sin navegador -qué se manda- son funciones puras, aquí arriba.
 */

import { CLIENT } from '../../../shared/js/protocol.mjs';
import { iconoDeObjeto, numeroDeEsquina } from './panels.js';
import { pintarIconos } from './iconos.js';

/** Lo que se dice al empezar a elegir con quién comerciar. */
export const AYUDA_INTERCAMBIO = 'Elige con quién comerciar (Escape o clic derecho: cancelar)';

/**
 * EL ORIGEN DEL INTERCAMBIO a partir de lo que hay bajo el ratón (`_origenEnPunto` de main.js, el
 * mismo que usa el arrastre): `{ inventario }`, `{ contenedor, hueco }` o `{ suelo: [x, y, z] }`.
 */
export function origenDeIntercambio(origen) {
    const o = origen || {};
    if (o.kind === 'inventory') {
        return { inventario: Number(o.index) };
    }
    if (o.kind === 'container' || o.kind === 'inventoryContainer') {
        return { contenedor: Number(o.id), hueco: Number(o.index) };
    }
    if (o.kind === 'ground') {
        return { suelo: [Number(o.x), Number(o.y), Number(o.z)] };
    }
    return null;
}

/**
 * El mensaje de ofrecer, `[TRADE_REQUEST, origen, id]`, a partir del clic con la cruz (`destinoDeClic`
 * de usarcon.js): sólo sobre una criatura. Null si se hizo clic en una casilla vacía.
 */
export function mensajeIntercambio(origen, destino) {
    if (!origen || !destino || destino.criatura === undefined) {
        return null;
    }
    return [CLIENT.TRADE_REQUEST, origen, Number(destino.criatura)];
}

function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/**
 * @param {Object} o
 * @param {Object} o.gestor el de `ventanas.js`
 * @param {Object} o.provider para los dibujos
 * @param {Function} o.mirar (suya, indice) => pide al motor que lo describa
 * @param {Function} o.aceptar ()
 * @param {Function} o.cancelar () => avisa al motor (cerrar la ventana es cancelar)
 */
export function crearVentanaIntercambio(o) {
    let caja = null;
    let datos = null;
    let pendiente = false;

    function lista(objetos, suya) {
        if (!objetos) {
            return '<span class="vacio">Esperando su oferta…</span>';
        }
        return '<div class="rejilla-contenedor intercambio-rejilla">' + objetos.map((it, i) =>
            '<div class="objeto" data-intercambio-suya="' + (suya ? 1 : 0) + '" data-intercambio-indice="' + i + '" title="' +
            escapar(it.name + (it.count > 1 ? ' x' + it.count : '') + ' (clic: mirarlo)') + '">' +
            iconoDeObjeto(it.typeId, o.provider, 32, it.count) + numeroDeEsquina(it) + '</div>').join('') + '</div>';
    }

    function pintar() {
        pendiente = [].concat(datos.tuya || [], datos.suya || [])
            .some((it) => o.provider && o.provider.dibujoListo && !o.provider.dibujoListo(it.typeId));
        const listo = !!datos.suya && !datos.aceptaste;
        caja.innerHTML =
            '<div class="ventana-cabecera"><span class="titulo">' + escapar('Intercambio con ' + datos.companero) + '</span>' +
            '<button type="button" class="boton-icono" data-cancelar-intercambio data-icono="cerrar" title="Cancelar el intercambio"></button></div>' +
            '<div class="ventana-cuerpo intercambio">' +
            '<div class="intercambio-lado"><div class="intercambio-quien">Tu oferta</div>' + lista(datos.tuya, false) +
            (datos.aceptaste ? '<div class="intercambio-aceptado">Has aceptado.</div>' : '') + '</div>' +
            '<div class="intercambio-lado"><div class="intercambio-quien">' + escapar('La de ' + datos.companero) + '</div>' +
            lista(datos.suya, true) +
            (datos.acepto ? '<div class="intercambio-aceptado">' + escapar(datos.companero + ' ha aceptado.') + '</div>' : '') + '</div>' +
            '<div class="intercambio-pie">' +
            '<button type="button" class="hacer" data-aceptar-intercambio' + (listo ? '' : ' disabled') +
            ' title="' + (datos.aceptaste ? 'Esperando a que acepte…' : 'Aceptar el intercambio') + '">Acepto</button>' +
            '<button type="button" class="cancelar" data-cancelar-intercambio>Cancelar</button></div></div>';
        pintarIconos(caja);
    }

    function crear() {
        caja = document.createElement('section');
        caja.className = 'ventana ventana-intercambio';
        caja.dataset.ventanaId = 'intercambio';
        caja.dataset.temporal = '1';
        caja.dataset.orden = '0';
        // FIJA y sin `_cerrar`: el gestor no la encoge ni la cierra para hacer sitio a un cuerpo que se
        // abre (cerrarla sería cancelar el intercambio); se encogen las demás.
        caja.dataset.fija = '1';
        // Y FLOTANDO, junto a la columna de la derecha: con el equipo, la batalla y la mochila abiertos
        // no cabe entera en la columna, y aquí hay que ver las dos ofertas. Se puede arrastrar.
        caja._sitio = { sitio: 'flota', x: Math.max(0, window.innerWidth - 430), y: 70 };
        caja.addEventListener('click', (e) => {
            if (e.target.closest('[data-cancelar-intercambio]')) {
                o.cancelar();
                cerrar();
                return;
            }
            if (e.target.closest('[data-aceptar-intercambio]')) {
                o.aceptar();
                return;
            }
            const objeto = e.target.closest('[data-intercambio-indice]');
            if (objeto) {
                o.mirar(objeto.dataset.intercambioSuya === '1', Number(objeto.dataset.intercambioIndice));
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
        /** Abre la ventana, o la pone al día (contestó, alguien aceptó). */
        abrir(nuevos) {
            const nueva = !caja;
            if (nueva) {
                crear();
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
        /** Repinta si algún dibujo no había llegado todavía (los sprites llegan por HTTP). */
        repintar() {
            if (caja && pendiente) {
                pintar();
            }
        },
        abierta: () => !!caja
    };
}
