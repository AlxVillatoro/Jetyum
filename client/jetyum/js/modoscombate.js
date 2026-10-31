/**
 * LOS MODOS DE COMBATE, como los botones de Tibia junto al equipo:
 *
 *   - ofensivo / equilibrado / defensivo (uno de los tres): cuánto pegas y cuánto te defiendes
 *   - perseguir: ir detrás del objetivo cuando se aleja
 *   - modo seguro: no poder atacar por error a un jugador sin calavera (puesto de serie)
 *
 * Se mandan al motor (`CLIENT.FIGHT_MODES`) al entrar al mundo y cada vez que cambian, y se
 * recuerdan en este navegador. Lo que significan lo decide el motor: aquí sólo se eligen.
 */

import { CLIENT } from '../../../shared/js/protocol.mjs';

export const MODO = { OFENSIVO: 1, EQUILIBRADO: 2, DEFENSIVO: 3 };

/** Los del motor: equilibrado, sin perseguir y con el modo seguro puesto. */
export const POR_DEFECTO = Object.freeze({ modo: MODO.EQUILIBRADO, perseguir: false, seguro: true });

const CLAVE = 'jetyum.modosCombate';

/** Unos modos válidos a partir de lo que sea (lo guardado puede venir roto o ser de otra versión). */
export function normalizar(datos) {
    const d = datos && typeof datos === 'object' ? datos : {};
    const modo = Number(d.modo);
    return {
        modo: modo === MODO.OFENSIVO || modo === MODO.DEFENSIVO ? modo : MODO.EQUILIBRADO,
        perseguir: d.perseguir === true,
        seguro: d.seguro !== false
    };
}

/** El mensaje: `[FIGHT_MODES, modo, perseguir, seguro]`, con 1 y 0. */
export function mensajeModosCombate(modos) {
    const m = normalizar(modos);
    return [CLIENT.FIGHT_MODES, m.modo, m.perseguir ? 1 : 0, m.seguro ? 1 : 0];
}

function leer() {
    try {
        return normalizar(JSON.parse(localStorage.getItem(CLAVE)));
    } catch (e) {
        return normalizar(null);
    }
}

function guardar(modos) {
    try {
        localStorage.setItem(CLAVE, JSON.stringify(modos));
    } catch (e) {
        // Sin almacenamiento: duran lo que la pestaña.
    }
}

/**
 * Los botones (están en index.html, junto al equipo): `[data-modo-combate]` con 1, 2 o 3,
 * `[data-perseguir]` y `[data-seguro]`.
 *
 * @param {Object} o
 * @param {HTMLElement} o.raiz donde están los botones
 * @param {Function} o.enviar (mensaje) => lo manda al motor, si hay conexión
 */
export function crearModosCombate(o) {
    let modos = leer();

    function pintar() {
        if (!o.raiz) {
            return;
        }
        o.raiz.querySelectorAll('[data-modo-combate]').forEach((b) => {
            const puesto = Number(b.dataset.modoCombate) === modos.modo;
            b.classList.toggle('activo', puesto);
            b.setAttribute('aria-pressed', puesto ? 'true' : 'false');
        });
        [['[data-perseguir]', modos.perseguir], ['[data-seguro]', modos.seguro]].forEach(([selector, puesto]) => {
            const b = o.raiz.querySelector(selector);
            if (b) {
                b.classList.toggle('activo', puesto);
                b.setAttribute('aria-pressed', puesto ? 'true' : 'false');
            }
        });
    }

    function enviar() {
        o.enviar(mensajeModosCombate(modos));
    }

    function cambiar(nuevos) {
        modos = normalizar({ ...modos, ...nuevos });
        guardar(modos);
        pintar();
        enviar();
    }

    if (o.raiz) {
        o.raiz.addEventListener('click', (e) => {
            const boton = e.target.closest('button');
            if (!boton) {
                return;
            }
            if (boton.dataset.modoCombate) {
                cambiar({ modo: Number(boton.dataset.modoCombate) });
            } else if (boton.hasAttribute('data-perseguir')) {
                cambiar({ perseguir: !modos.perseguir });
            } else if (boton.hasAttribute('data-seguro')) {
                cambiar({ seguro: !modos.seguro });
            }
        });
    }
    pintar();

    return { enviar, cambiar, modos: () => ({ ...modos }) };
}
