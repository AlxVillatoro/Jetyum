/**
 * EL DIÁLOGO DE INFORMACIÓN, el `popupFYI` de Tibia: una ventanita en medio de la pantalla con un
 * título, un texto y un botón «Aceptar». Lo abre el servidor (`SERVER.POPUP`): los scripts con
 * `player:popupFYI(texto)` y el `/spells`.
 *
 * - Se cierra con «Aceptar», con Intro o con Escape (antes de que el chat las reciba).
 * - Si llegan varios seguidos, salen uno detrás de otro.
 * - El texto es texto: los saltos de línea se respetan y nada se interpreta como HTML.
 */

export function crearDialogo() {
    const cola = [];
    let fondo = null;

    function cerrar() {
        if (fondo) {
            fondo.remove();
            fondo = null;
        }
        if (cola.length) {
            const [titulo, texto] = cola.shift();
            pintar(titulo, texto);
        } else {
            // El chat vuelve a ser donde se escribe.
            const chat = document.getElementById('chat');
            if (chat) {
                chat.focus();
            }
        }
    }

    function pintar(titulo, texto) {
        fondo = document.createElement('div');
        fondo.className = 'dialogo-fondo';
        const caja = document.createElement('section');
        caja.className = 'dialogo';
        caja.setAttribute('role', 'dialog');
        caja.setAttribute('aria-modal', 'true');

        const cabecera = document.createElement('div');
        cabecera.className = 'ventana-cabecera';
        const t = document.createElement('span');
        t.className = 'titulo';
        t.textContent = titulo || 'Información';
        cabecera.appendChild(t);

        const cuerpo = document.createElement('div');
        cuerpo.className = 'dialogo-texto';
        cuerpo.textContent = texto;

        const pie = document.createElement('div');
        pie.className = 'dialogo-pie';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = 'Aceptar';
        ok.addEventListener('click', cerrar);
        pie.appendChild(ok);

        caja.append(cabecera, cuerpo, pie);
        fondo.appendChild(caja);
        document.body.appendChild(fondo);
        ok.focus();
    }

    // Intro y Escape cierran el diálogo, y no llegan al chat ni a caminar.
    window.addEventListener('keydown', (e) => {
        if (!fondo) {
            return;
        }
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            cerrar();
        }
    }, true);

    return {
        /** Abre un diálogo (o lo pone en cola si ya hay uno). */
        abrir(titulo, texto) {
            if (fondo) {
                cola.push([titulo, texto]);
            } else {
                pintar(titulo, texto);
            }
        },
        cerrar,
        abierto: () => !!fondo
    };
}
