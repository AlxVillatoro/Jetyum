/**
 * LA CONSOLA DE ABAJO, como la de Tibia: pestañas, cada mensaje con su hora y la línea de
 * escribir debajo.
 *
 * - «Default» lleva lo que se dice alrededor (en amarillo) y los avisos del servidor.
 * - «Server Log» sólo los mensajes del servidor (resultados de comandos, subidas de nivel...).
 *
 * - Una pestaña por cada CONVERSACIÓN PRIVADA (se abre sola al recibir un mensaje, o con
 *   «@nombre texto») y otra para el GRUPO. Escribiendo con una de ellas delante, el mensaje va a
 *   esa persona o al grupo; se cierran con su ×.
 *
 * Una pestaña que no se está mirando y recibe algo se pone en amarillo, para que se note.
 */

const MAX_LINEAS = 300;

function hora(fecha) {
    return String(fecha.getHours()).padStart(2, '0') + ':' + String(fecha.getMinutes()).padStart(2, '0');
}

/** La clase de color de un mensaje del servidor, por lo que dice. */
function claseDeAviso(texto) {
    if (/^Has subido|subes? de nivel|advanced/i.test(texto)) {
        return 'avance';
    }
    if (/no puedes|demasiado lejos|no tienes|necesitas|rechaz|no se pudo|muerto/i.test(texto)) {
        return 'aviso';
    }
    return 'servidor';
}

/**
 * @param {Object} opciones
 * @param {HTMLElement} opciones.lineas donde se pintan los mensajes
 * @param {HTMLElement} opciones.pestanas la fila de pestañas (botones con data-canal)
 */
export function crearConsola(opciones) {
    const { lineas, pestanas } = opciones;
    const canales = { default: [], server: [] };
    const etiquetas = {};
    let actual = 'default';
    let conHora = true;

    /** Crea la pestaña de un canal (una conversación privada, el grupo) si no existe. */
    function asegurarCanal(canal, etiqueta) {
        if (canales[canal]) {
            return;
        }
        canales[canal] = [];
        etiquetas[canal] = etiqueta;
        if (pestanas) {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.dataset.canal = canal;
            boton.title = canal === 'grupo' ? 'Mensajes de tu grupo' : 'Conversación privada con ' + etiqueta;
            boton.append(document.createTextNode(etiqueta + ' '));
            const cerrar = document.createElement('span');
            cerrar.className = 'cerrar-canal';
            cerrar.dataset.cerrarCanal = canal;
            cerrar.title = 'Cerrar esta pestaña';
            cerrar.textContent = '×';
            boton.appendChild(cerrar);
            pestanas.appendChild(boton);
        }
    }

    function cerrarCanal(canal) {
        if (canal === 'default' || canal === 'server' || !canales[canal]) {
            return;
        }
        delete canales[canal];
        delete etiquetas[canal];
        const boton = pestanas && pestanas.querySelector('[data-canal="' + canal + '"]');
        if (boton) {
            boton.remove();
        }
        if (actual === canal) {
            elegir('default');
        }
    }

    function pintarLinea(entrada) {
        const div = document.createElement('div');
        div.className = 'linea ' + entrada.clase;
        if (conHora) {
            const h = document.createElement('span');
            h.className = 'hora';
            h.textContent = entrada.hora + ' ';
            div.appendChild(h);
        }
        div.appendChild(document.createTextNode(entrada.texto));
        return div;
    }

    function repintar() {
        if (!lineas) {
            return;
        }
        lineas.innerHTML = '';
        canales[actual].forEach((e) => lineas.appendChild(pintarLinea(e)));
        lineas.scrollTop = lineas.scrollHeight;
    }

    function anadir(canal, texto, clase) {
        const entrada = { hora: hora(new Date()), texto: String(texto), clase: clase || 'servidor' };
        const lista = canales[canal];
        lista.push(entrada);
        if (lista.length > MAX_LINEAS) {
            lista.shift();
        }
        if (canal === actual && lineas) {
            const abajo = lineas.scrollTop + lineas.clientHeight >= lineas.scrollHeight - 4;
            lineas.appendChild(pintarLinea(entrada));
            while (lineas.childNodes.length > MAX_LINEAS) {
                lineas.removeChild(lineas.firstChild);
            }
            if (abajo) {
                lineas.scrollTop = lineas.scrollHeight;
            }
        } else if (pestanas) {
            const boton = pestanas.querySelector('[data-canal="' + canal + '"]');
            if (boton) {
                boton.classList.add('nuevo');
            }
        }
    }

    function elegir(canal) {
        if (!canales[canal]) {
            return;
        }
        actual = canal;
        if (pestanas) {
            pestanas.querySelectorAll('[data-canal]').forEach((b) => {
                b.classList.toggle('activa', b.dataset.canal === canal);
                if (b.dataset.canal === canal) {
                    b.classList.remove('nuevo');
                }
            });
        }
        repintar();
    }

    if (pestanas) {
        pestanas.addEventListener('click', (e) => {
            const cierre = e.target.closest('[data-cerrar-canal]');
            if (cierre) {
                cerrarCanal(cierre.dataset.cerrarCanal);
                return;
            }
            const boton = e.target.closest('[data-canal]');
            if (boton) {
                elegir(boton.dataset.canal);
            }
        });
    }

    return {
        /** Alguien dice algo (amarillo, en Default). */
        hablar(nombre, texto) {
            anadir('default', (nombre ? nombre + ': ' : '') + texto, 'hablar');
        },
        /** Un mensaje del servidor: en Default y en Server Log. */
        servidor(texto) {
            const clase = claseDeAviso(String(texto));
            anadir('default', texto, clase);
            anadir('server', texto, clase);
        },
        /** Algo del propio cliente (conexión, errores). Sólo en Server Log. */
        local(texto) {
            anadir('server', texto, 'servidor');
        },
        /** Un mensaje privado: `con` es la otra persona; `de`, quien lo escribe (ella o tú). */
        privado(con, de, texto) {
            const canal = 'pm:' + String(con).toLowerCase();
            asegurarCanal(canal, con);
            anadir(canal, de + ': ' + texto, 'privado');
        },
        /** Un mensaje del grupo. */
        grupo(de, texto) {
            asegurarCanal('grupo', 'Grupo');
            anadir('grupo', de + ': ' + texto, 'grupo');
        },
        /** Abre (y pone delante) la conversación con alguien. */
        abrirPrivado(con) {
            const canal = 'pm:' + String(con).toLowerCase();
            asegurarCanal(canal, con);
            elegir(canal);
        },
        /**
         * A dónde va lo que se escribe con la pestaña de delante: el nombre de la otra persona,
         * '#grupo', o null (hablar en voz alta).
         */
        destino() {
            if (actual.startsWith('pm:')) {
                return etiquetas[actual];
            }
            return actual === 'grupo' ? '#grupo' : null;
        },
        elegir,
        ponerHora(valor) {
            conHora = valor !== false;
            repintar();
        },
        limpiar() {
            canales.default.length = 0;
            canales.server.length = 0;
            repintar();
        }
    };
}
