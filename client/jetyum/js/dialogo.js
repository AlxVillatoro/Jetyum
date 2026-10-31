/**
 * EL DIÁLOGO DE INFORMACIÓN, el `popupFYI` de Tibia: una ventanita en medio de la pantalla con un
 * título, un texto y un botón «Aceptar». Lo abre el servidor (`SERVER.POPUP`): los scripts con
 * `player:popupFYI(texto)` y el `/spells`.
 *
 * Y LA VENTANA DE TEXTO (`SERVER.TEXT_WINDOW`), que es lo mismo pero con un área donde escribir:
 * una carta, la lista de invitados de una casa. Con «Guardar» (o Ctrl+Intro) lo escrito va a
 * `alGuardar(texto)`; «Cancelar» o Escape la cierran sin mandar nada.
 *
 * - El de información se cierra con «Aceptar», con Intro o con Escape (antes de que el chat las reciba).
 * - Si llegan varios seguidos, salen uno detrás de otro.
 * - El texto es texto: los saltos de línea se respetan y nada se interpreta como HTML.
 */

export function crearDialogo() {
    const cola = [];
    let fondo = null;
    let actual = null;
    let area = null;

    function cerrar() {
        if (fondo) {
            fondo.remove();
            fondo = null;
            actual = null;
            area = null;
        }
        if (cola.length) {
            pintar(cola.shift());
        } else {
            // El chat vuelve a ser donde se escribe.
            const chat = document.getElementById('chat');
            if (chat) {
                chat.focus();
            }
        }
    }

    function guardar() {
        const d = actual;
        const texto = area ? area.value : '';
        cerrar();
        if (d && typeof d.alGuardar === 'function') {
            d.alGuardar(texto);
        }
    }

    function boton(texto, alPulsar) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = texto;
        b.addEventListener('click', alPulsar);
        return b;
    }

    function pintar(d) {
        actual = d;
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
        t.textContent = d.titulo || 'Información';
        cabecera.appendChild(t);

        let cuerpo;
        if (d.editable) {
            area = document.createElement('textarea');
            area.className = 'dialogo-area';
            area.value = d.texto || '';
            area.maxLength = d.maximo || 1000;
            area.rows = 8;
            area.spellcheck = false;
            cuerpo = area;
        } else {
            cuerpo = document.createElement('div');
            cuerpo.className = 'dialogo-texto';
            cuerpo.textContent = d.texto;
        }

        const pie = document.createElement('div');
        pie.className = 'dialogo-pie';
        let foco;
        if (d.editable) {
            pie.append(boton('Cancelar', cerrar), boton('Guardar', guardar));
            foco = area;
        } else {
            foco = boton('Aceptar', cerrar);
            pie.appendChild(foco);
        }

        caja.append(cabecera, cuerpo, pie);
        fondo.appendChild(caja);
        document.body.appendChild(fondo);
        foco.focus();
    }

    // Intro y Escape cierran el diálogo, y no llegan al chat ni a caminar. En la ventana de
    // escribir, Intro es un salto de línea y Ctrl+Intro guarda; ninguna tecla llega al juego.
    window.addEventListener('keydown', (e) => {
        if (!fondo) {
            return;
        }
        if (actual && actual.editable) {
            e.stopImmediatePropagation();
            if (e.key === 'Escape') {
                e.preventDefault();
                cerrar();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                guardar();
            }
            return;
        }
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            cerrar();
        }
    }, true);

    function poner(d) {
        if (fondo) {
            cola.push(d);
        } else {
            pintar(d);
        }
    }

    return {
        /** Abre un diálogo (o lo pone en cola si ya hay uno). */
        abrir(titulo, texto) {
            poner({ titulo, texto });
        },
        /** Abre una ventana de texto: `{ titulo, texto, editable, maximo }`, y a quién darle lo escrito. */
        abrirTexto(ventana, alGuardar) {
            poner({ ...ventana, alGuardar });
        },
        cerrar,
        abierto: () => !!fondo
    };
}
