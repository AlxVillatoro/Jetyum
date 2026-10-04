/**
 * LA BARRA LATERAL: sus botones y sus ventanas.
 *
 * - Los ocho botones de Tibia: Stop, Quests, Options, Help / Skills, Battle, VIP, Logout. Los de
 *   ventana la abren o la cierran; Stop y Logout hacen su acción.
 * - Las ventanas se minimizan (−) o se cierran (×) desde su cabecera.
 * - Batalla: las criaturas a la vista, la más cercana arriba, con su vida; clic para atacar. La
 *   que estás atacando sale con el marco rojo.
 * - VIP: tu lista de amigos (se guarda en este navegador); el punto verde es que lo ves ahora.
 * - Opciones: nombres, barras de vida, hora en la consola y el diagnóstico.
 *
 * Todo lo que sabe del mundo lo saca del mundo del cliente: no pide nada al motor.
 */

import { pintarIconos } from './iconos.js';

const CLAVE_VIP = 'jetyum.vip';
const CLAVE_VENTANAS = 'jetyum.ventanas';

function leer(clave, porDefecto) {
    try {
        const v = JSON.parse(localStorage.getItem(clave));
        return v === null || v === undefined ? porDefecto : v;
    } catch (e) {
        return porDefecto;
    }
}

function guardar(clave, valor) {
    try {
        localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) {
        // Sin almacenamiento (modo privado): se pierde al recargar, nada más.
    }
}

function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/**
 * @param {Object} o
 * @param {Object} o.acciones { stop(), salir(), atacar(id), opcion(nombre, valor) }
 * @param {Object} o.minimapa el de `minimapa.js`
 * @param {Object} o.provider para dibujar las criaturas de la lista de batalla
 */
export function crearLateral(o) {
    const { acciones, minimapa, provider, gestor } = o;
    pintarIconos(document);

    // --- Ventanas: abrir, cerrar y minimizar; se recuerda cuáles estaban abiertas ---
    const estado = leer(CLAVE_VENTANAS, {});
    const ventana = (id) => document.querySelector('[data-ventana-id="' + id + '"]');
    const boton = (id) => document.querySelector('[data-ventana="' + id + '"]');

    function mostrar(id, visible) {
        const v = ventana(id);
        if (!v) {
            return;
        }
        v.hidden = !visible;
        const b = boton(id);
        if (b) {
            b.classList.toggle('activo', visible);
        }
        estado[id] = visible;
        guardar(CLAVE_VENTANAS, estado);
        gestor.colocar();
    }

    Object.keys(estado).forEach((id) => mostrar(id, estado[id]));

    document.querySelectorAll('[data-ventana]').forEach((b) => {
        b.addEventListener('click', () => {
            const v = ventana(b.dataset.ventana);
            mostrar(b.dataset.ventana, v ? v.hidden : true);
        });
    });
    document.querySelectorAll('.ventana').forEach((v) => {
        const min = v.querySelector('[data-minimizar]');
        const cer = v.querySelector('[data-cerrar]');
        // Minimizada o no, también se recuerda (clave «min:<id>»).
        const claveMin = 'min:' + v.dataset.ventanaId;
        if (min && v.dataset.ventanaId && estado[claveMin]) {
            v.classList.add('minimizada');
        }
        if (min) {
            min.addEventListener('click', () => {
                v.classList.toggle('minimizada');
                if (v.dataset.ventanaId) {
                    estado[claveMin] = v.classList.contains('minimizada');
                    guardar(CLAVE_VENTANAS, estado);
                }
                gestor.colocar();
            });
        }
        if (cer) {
            cer.addEventListener('click', () => mostrar(v.dataset.ventanaId, false));
        }
    });

    // --- Botones con acción ---
    document.querySelectorAll('[data-accion]').forEach((b) => {
        b.addEventListener('click', () => {
            switch (b.dataset.accion) {
                case 'stop': acciones.stop(); break;
                case 'salir': acciones.salir(); break;
                case 'zoom-mas': minimapa.acercar(); break;
                case 'zoom-menos': minimapa.alejar(); break;
                case 'planta-arriba': minimapa.cambiarPlanta(-1); break;
                case 'planta-abajo': minimapa.cambiarPlanta(1); break;
                case 'centrar': minimapa.cambiarPlanta(null); break;
                default: break;
            }
        });
    });

    // --- Opciones ---
    const opciones = leer('jetyum.opciones', {});
    [['op-nombres', 'nombres'], ['op-vida', 'vida'], ['op-hora', 'hora'], ['op-diagnostico', 'diagnostico']]
        .forEach(([idCasilla, nombre]) => {
            const casilla = document.getElementById(idCasilla);
            if (!casilla) {
                return;
            }
            if (opciones[nombre] !== undefined) {
                casilla.checked = opciones[nombre];
            }
            acciones.opcion(nombre, casilla.checked);
            casilla.addEventListener('change', () => {
                opciones[nombre] = casilla.checked;
                guardar('jetyum.opciones', opciones);
                acciones.opcion(nombre, casilla.checked);
            });
        });

    // El suavizado de los píxeles: una lista, no una casilla.
    const suavizado = document.getElementById('op-suavizado');
    if (suavizado) {
        if (opciones.suavizado) {
            suavizado.value = opciones.suavizado;
        }
        if (!suavizado.value) {
            suavizado.value = 'pixel';
        }
        acciones.opcion('suavizado', suavizado.value);
        suavizado.addEventListener('change', () => {
            opciones.suavizado = suavizado.value;
            guardar('jetyum.opciones', opciones);
            acciones.opcion('suavizado', suavizado.value);
        });
    }

    // --- VIP ---
    let vip = leer(CLAVE_VIP, []);
    const listaVip = document.getElementById('lista-vip');
    const formVip = document.getElementById('vip-anadir');
    let vistos = new Set();

    function pintarVip() {
        if (!listaVip) {
            return;
        }
        listaVip.innerHTML = vip.length === 0
            ? '<span class="vacio">añade a tus amigos abajo</span>'
            : vip.map((nombre) => {
                const visto = vistos.has(nombre.toLowerCase());
                return '<div class="vip-fila" title="' + escapar(nombre) + (visto ? ': a la vista' : ': no lo ves') + '">' +
                    '<span class="punto' + (visto ? ' visto' : '') + '"></span>' +
                    '<span class="nombre">' + escapar(nombre) + '</span>' +
                    '<button type="button" class="boton-icono" data-quitar="' + escapar(nombre) +
                    '" data-icono="cerrar" title="Quitar de la lista"></button></div>';
            }).join('');
        pintarIconos(listaVip);
    }
    if (formVip) {
        formVip.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('vip-nombre');
            const nombre = (input.value || '').trim();
            if (nombre && !vip.some((n) => n.toLowerCase() === nombre.toLowerCase())) {
                vip.push(nombre);
                guardar(CLAVE_VIP, vip);
            }
            input.value = '';
            input.blur();
            pintarVip();
        });
    }
    if (listaVip) {
        listaVip.addEventListener('click', (e) => {
            const quitar = e.target.closest('[data-quitar]');
            if (quitar) {
                vip = vip.filter((n) => n !== quitar.dataset.quitar);
                guardar(CLAVE_VIP, vip);
                pintarVip();
            }
        });
    }
    pintarVip();

    // --- Batalla ---
    const listaBatalla = document.getElementById('lista-batalla');
    let firmaBatalla = '';
    if (listaBatalla) {
        // Clic (derecho o izquierdo) en la lista: atacar; otra vez sobre el objetivo, dejarlo.
        const alternar = (e) => {
            const fila = e.target.closest('[data-criatura]');
            if (fila) {
                e.preventDefault();
                acciones.atacar(Number(fila.dataset.criatura));
            }
        };
        listaBatalla.addEventListener('click', alternar);
        listaBatalla.addEventListener('contextmenu', alternar);
    }

    function miniatura(criatura) {
        const lienzo = document.createElement('canvas');
        lienzo.width = 24;
        lienzo.height = 24;
        const sprite = provider && provider.getCreature && criatura.outfit
            ? provider.getCreature({ id: criatura.id, outfit: criatura.outfit, direction: 2, moving: false }, 0)
            : null;
        if (sprite && sprite.canvas) {
            const ctx = lienzo.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const escala = Math.min(1, 24 / Math.max(sprite.canvas.width, sprite.canvas.height));
            const w = sprite.canvas.width * escala;
            const h = sprite.canvas.height * escala;
            ctx.drawImage(sprite.canvas, 24 - w, 24 - h, w, h);
        }
        return lienzo;
    }

    /** Pinta la lista de batalla (y los puntos de la VIP). Se llama unas cuatro veces por segundo. */
    function actualizar(mundo, objetivo) {
        const yo = mundo.playerId ? mundo.creatures.get(mundo.playerId) : null;
        const visibles = [];
        const ahoraVistos = new Set();
        mundo.creatures.forEach((c) => {
            if (c.name) {
                ahoraVistos.add(String(c.name).toLowerCase());
            }
            if (!yo || c.id === yo.id || c.z !== yo.z) {
                return;
            }
            visibles.push({ c, d: Math.max(Math.abs(c.x - yo.x), Math.abs(c.y - yo.y)) });
        });
        visibles.sort((a, b) => a.d - b.d || String(a.c.name).localeCompare(String(b.c.name)));

        const cambioVip = ahoraVistos.size !== vistos.size || [...ahoraVistos].some((n) => !vistos.has(n));
        vistos = ahoraVistos;
        if (cambioVip) {
            pintarVip();
        }

        if (!listaBatalla) {
            return;
        }
        // La versión del proveedor cambia al llegar una hoja de sprites: así las miniaturas que se
        // pintaron vacías mientras cargaba se vuelven a pintar.
        const firma = visibles.map(({ c }) => c.id + ':' + c.health + ':' + (c.outfit ? c.outfit.lookType : 0)).join('|') +
            '#' + objetivo + '#' + (provider ? provider.version : 0);
        if (firma === firmaBatalla) {
            return;
        }
        firmaBatalla = firma;
        listaBatalla.innerHTML = '';
        if (visibles.length === 0) {
            listaBatalla.innerHTML = '<span class="vacio">nadie a la vista</span>';
            return;
        }
        visibles.forEach(({ c }) => {
            const fila = document.createElement('div');
            fila.className = 'batalla-fila' + (c.id === objetivo ? ' objetivo' : '');
            fila.dataset.criatura = c.id;
            fila.title = (c.id === objetivo ? 'Atacando a ' + c.name + ' (clic para dejarlo)' : 'Clic para atacar a ' + c.name);
            const datos = document.createElement('div');
            datos.className = 'batalla-datos';
            const vida = Math.max(0, Math.min(100, Number(c.health) || 0));
            const color = vida > 60 ? '#30c030' : (vida > 30 ? '#c0c030' : '#c03030');
            datos.innerHTML = '<div class="batalla-nombre">' + escapar(c.name) + '</div>' +
                '<div class="batalla-vida"><div style="width:' + vida + '%;background:' + color + '"></div></div>';
            fila.append(miniatura(c), datos);
            listaBatalla.appendChild(fila);
        });
    }

    return { actualizar, mostrar };
}
