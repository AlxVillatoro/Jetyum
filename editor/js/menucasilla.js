/**
 * EL MENÚ DEL BOTÓN DERECHO sobre una casilla del mapa, como el de Remere's Map Editor: lo que hay
 * en la casilla (para elegir sobre qué objeto actuar) y lo que se puede hacer con él.
 *
 * Este archivo sólo PINTA el menú y lo cierra; las acciones las pone quien lo abre (`main.js`),
 * que es el que sabe qué es elegir, borrar o centrar la vista. Así el menú no tiene que saber nada
 * del mapa y las acciones son las mismas que las de los botones del panel.
 *
 * Una entrada es `{ texto, accion, titulo, deshabilitado, marcada, mantener }` o
 * `{ separador: true }`. Con `mantener`, el menú no se cierra al pulsarla (es lo que hacen las
 * filas de la pila: cambian de objeto y vuelven a pintar el menú).
 */

let abierto = null;

/** Cierra el menú, si hay uno. */
export function cerrarMenuDeCasilla() {
    if (abierto) {
        abierto.remove();
        abierto = null;
        window.removeEventListener('mousedown', cerrarSiFuera, true);
        window.removeEventListener('keydown', cerrarConEscape, true);
        window.removeEventListener('wheel', cerrarMenuDeCasilla, true);
        window.removeEventListener('blur', cerrarMenuDeCasilla);
    }
}

function cerrarSiFuera(event) {
    if (abierto && !abierto.contains(event.target)) {
        cerrarMenuDeCasilla();
    }
}

function cerrarConEscape(event) {
    if (event.key === 'Escape') {
        cerrarMenuDeCasilla();
        event.preventDefault();
        event.stopPropagation();
    }
}

/**
 * Abre el menú en (x, y) de la pantalla, con su título y sus entradas. Si ya había uno, lo
 * sustituye (es lo que hace una fila de la pila al cambiar de objeto).
 */
export function abrirMenuDeCasilla(x, y, titulo, entradas) {
    const yaAbierto = !!abierto;
    if (abierto) {
        abierto.remove();
    }
    const menu = document.createElement('div');
    menu.className = 'menu-casilla';
    menu.setAttribute('role', 'menu');
    // El menú se abre al PULSAR el botón derecho, justo bajo el ratón, así que el `contextmenu` que
    // el navegador manda al soltarlo cae en el menú y no en el lienzo: sin esto salía, encima, el
    // menú del navegador.
    menu.addEventListener('contextmenu', (event) => event.preventDefault());
    if (titulo) {
        const cabeza = document.createElement('div');
        cabeza.className = 'menu-casilla-titulo';
        cabeza.textContent = titulo;
        cabeza.title = titulo;
        menu.appendChild(cabeza);
    }
    entradas.forEach((entrada) => {
        if (entrada.separador) {
            menu.appendChild(Object.assign(document.createElement('div'), { className: 'menu-casilla-separador' }));
            return;
        }
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'menu-casilla-entrada' + (entrada.marcada ? ' marcada' : '');
        boton.textContent = entrada.texto;
        boton.disabled = !!entrada.deshabilitado;
        if (entrada.titulo) {
            boton.title = entrada.titulo;
        }
        boton.addEventListener('click', () => {
            if (!entrada.mantener) {
                cerrarMenuDeCasilla();
            }
            entrada.accion();
        });
        menu.appendChild(boton);
    });
    document.body.appendChild(menu);
    abierto = menu;

    // Dentro de la ventana: si no cabe a la derecha o abajo, se abre hacia el otro lado.
    const caja = menu.getBoundingClientRect();
    const izquierda = x + caja.width > window.innerWidth ? Math.max(0, x - caja.width) : x;
    const arriba = y + caja.height > window.innerHeight ? Math.max(0, window.innerHeight - caja.height - 4) : y;
    menu.style.left = izquierda + 'px';
    menu.style.top = arriba + 'px';

    if (!yaAbierto) {
        window.addEventListener('mousedown', cerrarSiFuera, true);
        window.addEventListener('keydown', cerrarConEscape, true);
        window.addEventListener('wheel', cerrarMenuDeCasilla, true);
        window.addEventListener('blur', cerrarMenuDeCasilla);
    }
    return menu;
}
