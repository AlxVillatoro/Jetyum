/**
 * EL MENÚ DE UN OBJETO: Ctrl + clic derecho sobre algo de tu mochila, tu equipo, una ventana abierta
 * o el suelo de al lado (como el menú de OTClient en modo clásico). Una lista de acciones; elegir una
 * la hace, y un clic fuera o Escape lo cierran.
 *
 * Lo que va en el menú lo decide quien lo abre (main.js); éste sólo lo enseña.
 */

function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function crearMenuObjeto() {
    let caja = null;

    function cerrar() {
        if (caja) {
            caja.remove();
            caja = null;
        }
    }

    /**
     * Lo abre en (x, y) de la pantalla, sin salirse de ella.
     *
     * @param {Array<{texto: string, accion: Function}>} opciones
     */
    function abrir(x, y, opciones) {
        cerrar();
        caja = document.createElement('div');
        caja.className = 'menu-objeto';
        caja.setAttribute('role', 'menu');
        caja.innerHTML = opciones.map((op, i) =>
            '<button type="button" role="menuitem" data-opcion="' + i + '">' + escapar(op.texto) + '</button>').join('');
        caja.addEventListener('click', (e) => {
            const boton = e.target.closest('[data-opcion]');
            if (boton) {
                const opcion = opciones[Number(boton.dataset.opcion)];
                cerrar();
                opcion.accion();
            }
        });
        caja.addEventListener('contextmenu', (e) => e.preventDefault());
        document.body.appendChild(caja);
        const ancho = caja.offsetWidth;
        const alto = caja.offsetHeight;
        caja.style.left = Math.max(0, Math.min(x, window.innerWidth - ancho - 2)) + 'px';
        caja.style.top = Math.max(0, Math.min(y, window.innerHeight - alto - 2)) + 'px';
        const primero = caja.querySelector('button');
        if (primero) {
            primero.focus();
        }
    }

    // Un clic fuera, o Escape, lo cierran (y el clic sigue su camino).
    window.addEventListener('mousedown', (e) => {
        if (caja && !caja.contains(e.target)) {
            cerrar();
        }
    }, true);
    window.addEventListener('keydown', (e) => {
        if (caja && e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            cerrar();
        }
    }, true);

    return { abrir, cerrar, abierto: () => !!caja };
}
