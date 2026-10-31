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
 * - Una por cada CANAL abierto (engine/world/canales.js): «Juego», «Comercio», «Ayuda», el del gremio
 *   y los privados. Se abren con el «+» de la fila (la lista la manda el servidor); escribiendo con
 *   una delante se habla en ese canal, y cerrarla es salir de él. Cada línea dice «Nombre [nivel]:
 *   texto», como en Tibia. El del grupo (el canal 1) es la pestaña «Grupo» de siempre.
 *
 * Una pestaña que no se está mirando y recibe algo se pone en amarillo, para que se note.
 */

import { traducir } from '../../../shared/js/i18n.mjs';

const MAX_LINEAS = 300;

function hora(fecha) {
    return String(fecha.getHours()).padStart(2, '0') + ':' + String(fecha.getMinutes()).padStart(2, '0');
}

/**
 * La clase de color de un mensaje del servidor, por lo que dice. En los DOS idiomas: el mensaje
 * llega ya traducido (ver `world.js`).
 */
function claseDeAviso(texto) {
    if (/^Has subido|subes? de nivel|advanced|level up/i.test(texto)) {
        return 'avance';
    }
    if (/no puedes|demasiado lejos|no tienes|necesitas|rechaz|no se pudo|muerto|you can(no|')t|too far|you do(n't| not) have|you need|reject|could not|dead|killed/i.test(texto)) {
        return 'aviso';
    }
    return 'servidor';
}

/**
 * @param {Object} opciones
 * @param {HTMLElement} opciones.lineas donde se pintan los mensajes
 * @param {HTMLElement} opciones.pestanas la fila de pestañas (botones con data-canal)
 * @param {Function} [opciones.alCerrarCanal] se cerró la pestaña de un canal del servidor: `(id)`
 * @param {Function} [opciones.alPedirCanales] se pulsó el «+»: `(boton)`
 */
export function crearConsola(opciones) {
    const { lineas, pestanas } = opciones;
    const canales = { default: [], server: [] };
    const etiquetas = {};
    /** Los canales del servidor abiertos: clave de pestaña -> { id, propio }. */
    const delServidor = {};
    let actual = 'default';
    let conHora = true;

    /** La pestaña de un canal del servidor: el 1 (el grupo) es la de siempre. */
    const claveDeCanal = (id) => (Number(id) === 1 ? 'grupo' : 'c:' + Number(id));

    /** El título de una pestaña, en español (la página lo traduce). */
    function tituloDe(canal, etiqueta) {
        if (canal === 'grupo') {
            return 'Mensajes de tu grupo';
        }
        if (delServidor[canal]) {
            return delServidor[canal].propio
                ? 'Tu canal privado: invita con «/invitar nombre» y excluye con «/excluir nombre»'
                : 'Canal: ' + etiqueta;
        }
        return 'Conversación privada con ' + etiqueta;
    }

    /** Crea la pestaña de un canal (una conversación privada, el grupo, un canal) si no existe. */
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
            boton.title = tituloDe(canal, etiqueta);
            // El nombre de un gremio o de una persona no es una frase: no se traduce.
            if (canal === 'c:0' || canal.startsWith('pm:')) {
                const nombre = document.createElement('span');
                nombre.setAttribute('translate', 'no');
                nombre.textContent = etiqueta;
                boton.append(nombre, document.createTextNode(' '));
            } else {
                boton.append(document.createTextNode(etiqueta + ' '));
            }
            const cerrar = document.createElement('span');
            cerrar.className = 'cerrar-canal';
            cerrar.dataset.cerrarCanal = canal;
            cerrar.title = 'Cerrar esta pestaña';
            cerrar.textContent = '×';
            boton.appendChild(cerrar);
            // Antes del «+», que se queda siempre al final.
            pestanas.insertBefore(boton, pestanas.querySelector('[data-abrir-canales]'));
        }
    }

    /**
     * Cierra una pestaña. Si es la de un canal del servidor y la cierra el jugador, se avisa
     * (`alCerrarCanal`): cerrarla es salir del canal. Si la cerró el servidor, no.
     */
    function cerrarCanal(canal, porElServidor) {
        if (canal === 'default' || canal === 'server' || !canales[canal]) {
            return;
        }
        const delCanal = delServidor[canal];
        delete delServidor[canal];
        if (delCanal && !porElServidor && opciones.alCerrarCanal) {
            opciones.alCerrarCanal(delCanal.id);
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
        // Lo que escribe un jugador es suyo: la traducción de la página no lo toca.
        if (entrada.deJugador) {
            div.setAttribute('translate', 'no');
        }
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

    function anadir(canal, texto, clase, deJugador) {
        const entrada = { hora: hora(new Date()), texto: String(texto), clase: clase || 'servidor',
            deJugador: !!deJugador };
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
            const mas = e.target.closest('[data-abrir-canales]');
            if (mas) {
                if (opciones.alPedirCanales) {
                    opciones.alPedirCanales(mas);
                }
                return;
            }
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
        /**
         * Alguien dice algo (amarillo, en Default). El texto ya llega traducido si es del juego (ver
         * `world.js`); aquí se traduce el NOMBRE de un NPC o un monstruo, y la línea entera se deja
         * fuera de la traducción de la página: lo de un jugador es suyo y lo demás ya está hecho.
         * `delJuego` es `false` cuando habla un jugador.
         */
        hablar(nombre, texto, delJuego) {
            const quien = nombre && delJuego !== false ? traducir(nombre) : nombre;
            anadir('default', (quien ? quien + ': ' : '') + texto, 'hablar', true);
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
            anadir(canal, de + ': ' + texto, 'privado', true);
        },
        /** Un mensaje del grupo. */
        grupo(de, texto) {
            asegurarCanal('grupo', 'Grupo');
            anadir('grupo', de + ': ' + texto, 'grupo', true);
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
        /**
         * Se ha abierto un canal del servidor (`SERVER.CHANNEL_OPEN`): su pestaña, delante. `propio`:
         * es tu canal privado.
         */
        canalAbierto(id, nombre, propio) {
            const canal = claveDeCanal(id);
            if (canal !== 'grupo') {
                delServidor[canal] = { id: Number(id), propio: !!propio };
            }
            asegurarCanal(canal, canal === 'grupo' ? 'Grupo' : nombre);
            elegir(canal);
        },
        /**
         * Una línea en un canal: «Autor [nivel]: texto» si la dice un jugador (no se traduce), o el
         * texto del servidor (ya traducido) si no tiene autor.
         */
        mensajeDeCanal(id, autor, nivel, texto, tipo) {
            const canal = claveDeCanal(id);
            if (!canales[canal]) {
                if (canal !== 'grupo') {
                    delServidor[canal] = { id: Number(id), propio: false };
                }
                asegurarCanal(canal, canal === 'grupo' ? 'Grupo' : '#' + id);
            }
            if (autor) {
                anadir(canal, autor + (nivel ? ' [' + nivel + ']' : '') + ': ' + texto, 'canal', true);
            } else {
                anadir(canal, texto, tipo === 'rojo' ? 'aviso' : 'canal-sistema');
            }
        },
        /** El servidor te ha sacado de un canal: se cierra su pestaña. */
        canalCerrado(id) {
            cerrarCanal(claveDeCanal(id), true);
        },
        /** El canal del servidor de la pestaña de delante (su id), o null. El grupo va por `destino`. */
        canalActual() {
            return delServidor[actual] ? delServidor[actual].id : null;
        },
        /** Las pestañas de canales abiertas: [{ id, nombre, propio }]. */
        canalesAbiertos() {
            return Object.keys(delServidor).map((c) => ({ id: delServidor[c].id, nombre: etiquetas[c],
                propio: delServidor[c].propio }));
        },
        elegir,
        ponerHora(valor) {
            conHora = valor !== false;
            repintar();
        },
        limpiar() {
            // Los canales eran de la sesión que se acaba: al volver a entrar no se está en ninguno.
            Object.keys(delServidor).forEach((c) => cerrarCanal(c, true));
            canales.default.length = 0;
            canales.server.length = 0;
            repintar();
        }
    };
}
