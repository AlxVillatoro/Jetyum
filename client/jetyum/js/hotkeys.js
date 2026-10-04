/**
 * LAS HOTKEYS, como las de Tibia: F1 a F12 (y con Mayúsculas, Shift+F1 a Shift+F12) lanzan una
 * magia o usan un objeto, contigo o contra tu objetivo.
 *
 * - Se abren con Ctrl+K o con el botón del teclado junto a la capacidad (en el equipo).
 * - Cada tecla puede ser:
 *     · MAGIA o TEXTO: lo que se dice («exura», «exori flam»). Con «enviar al momento» se dice al
 *       pulsar; si no, se escribe en el chat para terminarlo.
 *     · OBJETO: uno de los que llevas (una poción...), usado EN TI o EN TU OBJETIVO (la criatura
 *       que estás atacando). El motor usa el primero de ese tipo que lleves.
 * - Se guardan en este navegador, por personaje.
 *
 * QUÉ SE PUEDE Y QUÉ NO lo decide el motor (que tengas el objeto, que el objetivo esté a la vista,
 * que la poción no se le dé a un monstruo...), y lo dice en el chat.
 */

import { iconoDeObjeto } from './panels.js';

export const TECLAS = [];
for (let i = 1; i <= 12; i += 1) {
    TECLAS.push('F' + i);
}
for (let i = 1; i <= 12; i += 1) {
    TECLAS.push('Shift+F' + i);
}

const PREFIJO = 'jetyum.hotkeys.';

function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** El nombre de la tecla de un evento de teclado ('F5', 'Shift+F5'), o null si no es una F. */
export function teclaDe(evento) {
    if (!/^F([1-9]|1[0-2])$/.test(evento.key || '')) {
        return null;
    }
    return (evento.shiftKey ? 'Shift+' : '') + evento.key;
}

/**
 * Qué hay que hacer al pulsar una hotkey: `{ decir }`, `{ escribir }`, `{ usar: typeId, en: id }`,
 * `{ aviso }` o null si la tecla está libre.
 *
 * @param {Object} h lo guardado para esa tecla
 * @param {{yo: number, objetivo: number|null}} quien
 */
export function accionDe(h, quien) {
    if (!h || !h.tipo) {
        return null;
    }
    if (h.tipo === 'magia') {
        const texto = String(h.texto || '').trim();
        if (!texto) {
            return null;
        }
        return h.auto === false ? { escribir: texto } : { decir: texto };
    }
    if (h.tipo === 'objeto' && h.typeId) {
        if (h.modo === 'objetivo') {
            return quien.objetivo ? { usar: Number(h.typeId), en: quien.objetivo } : { aviso: 'No tienes ningún objetivo.' };
        }
        return { usar: Number(h.typeId), en: quien.yo };
    }
    return null;
}

/**
 * @param {Object} o
 * @param {Object} o.provider para los dibujos de los objetos
 * @param {Function} o.inventario () => las entradas que lleva el jugador
 * @param {Function} o.personaje () => su nombre (las hotkeys son de cada personaje)
 * @param {Function} o.ejecutar (accion) => hace lo que diga `accionDe`
 * @param {Function} o.quien () => { yo, objetivo }
 */
export function crearHotkeys(o) {
    let datos = {};
    let cargadoPara = null;
    let caja = null;
    let elegida = 'F1';

    function clave() {
        return PREFIJO + String(o.personaje() || '').toLowerCase();
    }

    function cargar() {
        const nombre = o.personaje() || '';
        if (cargadoPara === nombre) {
            return;
        }
        cargadoPara = nombre;
        try {
            datos = JSON.parse(localStorage.getItem(clave())) || {};
        } catch (e) {
            datos = {};
        }
    }

    function guardar() {
        try {
            localStorage.setItem(clave(), JSON.stringify(datos));
        } catch (e) {
            // Sin almacenamiento: duran hasta recargar.
        }
    }

    function nombreDe(typeId) {
        const e = (o.inventario() || []).find((x) => x.typeId === Number(typeId));
        return e && e.name ? e.name : 'objeto ' + typeId;
    }

    /** Lo que se ve de una tecla en la lista. */
    function resumen(h) {
        if (!h || !h.tipo) {
            return '<span class="libre">—</span>';
        }
        if (h.tipo === 'magia') {
            return '<span class="magia">' + escapar(h.texto || '') + '</span>' + (h.auto === false ? ' <small>(al chat)</small>' : '');
        }
        return iconoDeObjeto(h.typeId, o.provider, 16, 1) + ' <span>' + escapar(nombreDe(h.typeId)) + '</span> <small>' +
            (h.modo === 'objetivo' ? 'en el objetivo' : 'en ti') + '</small>';
    }

    function pintar() {
        if (!caja) {
            return;
        }
        const h = datos[elegida] || {};
        const tipo = h.tipo || '';
        // Los objetos que llevas, sin repetir (uno por tipo), más el que ya estaba elegido.
        const vistos = new Set();
        const objetos = (o.inventario() || []).filter((e) => e.slot !== 'backpack' && !vistos.has(e.typeId) && vistos.add(e.typeId));
        if (h.typeId && !vistos.has(Number(h.typeId))) {
            objetos.push({ typeId: Number(h.typeId), name: nombreDe(h.typeId) });
        }
        caja.querySelector('.hotkeys-lista').innerHTML = TECLAS.map((t) =>
            '<div class="hotkey-fila' + (t === elegida ? ' elegida' : '') + '" data-tecla="' + t + '">' +
            '<b>' + t + '</b><span class="que">' + resumen(datos[t]) + '</span></div>').join('');
        caja.querySelector('.hotkeys-editor').innerHTML =
            '<div class="hotkeys-titulo">' + elegida + '</div>' +
            '<label><input type="radio" name="hk-tipo" value="" ' + (tipo === '' ? 'checked' : '') + '> Nada</label> ' +
            '<label><input type="radio" name="hk-tipo" value="magia" ' + (tipo === 'magia' ? 'checked' : '') + '> Magia o texto</label> ' +
            '<label><input type="radio" name="hk-tipo" value="objeto" ' + (tipo === 'objeto' ? 'checked' : '') + '> Objeto</label>' +
            (tipo === 'magia'
                ? '<div class="hk-bloque"><input type="text" data-hk-texto maxlength="80" placeholder="exura, exori flam, utani hur…" value="' + escapar(h.texto || '') + '">' +
                  '<label><input type="checkbox" data-hk-auto ' + (h.auto === false ? '' : 'checked') + '> Enviar al momento</label></div>'
                : '') +
            (tipo === 'objeto'
                ? '<div class="hk-bloque"><div class="hk-objetos">' + (objetos.length ? objetos.map((e) =>
                    '<button type="button" class="hk-objeto' + (Number(h.typeId) === e.typeId ? ' elegido' : '') + '" data-hk-objeto="' + e.typeId +
                    '" title="' + escapar(e.name || '') + '">' + iconoDeObjeto(e.typeId, o.provider, 32, 1) + '</button>').join('')
                    : '<span class="vacio">no llevas nada</span>') + '</div>' +
                  '<label><input type="radio" name="hk-modo" value="yo" ' + (h.modo !== 'objetivo' ? 'checked' : '') + '> Usar en mí</label> ' +
                  '<label><input type="radio" name="hk-modo" value="objetivo" ' + (h.modo === 'objetivo' ? 'checked' : '') + '> Usar en el objetivo</label></div>'
                : '');
    }

    function crear() {
        caja = document.createElement('section');
        caja.className = 'hotkeys';
        caja.setAttribute('role', 'dialog');
        caja.innerHTML =
            '<div class="ventana-cabecera"><span class="titulo">Hotkeys</span>' +
            '<button type="button" class="boton-icono" data-hk-cerrar title="Cerrar (Ctrl+K)">×</button></div>' +
            '<div class="hotkeys-cuerpo"><div class="hotkeys-lista"></div><div class="hotkeys-editor"></div></div>' +
            '<div class="hotkeys-pie">F1–F12 y Shift+F1–F12 · Ctrl+K abre y cierra</div>';
        caja.addEventListener('click', (e) => {
            if (e.target.closest('[data-hk-cerrar]')) {
                cerrar();
                return;
            }
            const fila = e.target.closest('[data-tecla]');
            if (fila) {
                elegida = fila.dataset.tecla;
                pintar();
                return;
            }
            const obj = e.target.closest('[data-hk-objeto]');
            if (obj) {
                datos[elegida] = { tipo: 'objeto', typeId: Number(obj.dataset.hkObjeto), modo: (datos[elegida] || {}).modo || 'yo' };
                guardar();
                pintar();
            }
        });
        caja.addEventListener('change', (e) => {
            const h = datos[elegida] || {};
            if (e.target.name === 'hk-tipo') {
                datos[elegida] = e.target.value === 'magia' ? { tipo: 'magia', texto: h.texto || '', auto: true }
                    : e.target.value === 'objeto' ? { tipo: 'objeto', typeId: h.typeId || 0, modo: h.modo || 'yo' }
                        : {};
            } else if (e.target.name === 'hk-modo') {
                datos[elegida] = { ...h, modo: e.target.value };
            } else if (e.target.matches('[data-hk-auto]')) {
                datos[elegida] = { ...h, auto: e.target.checked };
            } else {
                // El texto ya se guardó al escribirlo; repintar aquí se comería el clic siguiente.
                return;
            }
            guardar();
            pintar();
        });
        caja.addEventListener('input', (e) => {
            if (e.target.matches('[data-hk-texto]')) {
                datos[elegida] = { ...(datos[elegida] || { tipo: 'magia', auto: true }), texto: e.target.value };
                guardar();
                // Sólo se repinta la lista (repintar el editor quitaría el foco al escribir).
                const fila = caja.querySelector('[data-tecla="' + elegida + '"] .que');
                if (fila) {
                    fila.innerHTML = resumen(datos[elegida]);
                }
            }
        });
        document.body.appendChild(caja);
    }

    function abrir() {
        cargar();
        if (!caja) {
            crear();
        }
        caja.hidden = false;
        pintar();
    }

    function cerrar() {
        if (caja) {
            caja.hidden = true;
        }
        const chat = document.getElementById('chat');
        if (chat) {
            chat.focus();
        }
    }

    const abierta = () => !!caja && !caja.hidden;

    // Ctrl+K abre y cierra; las F lanzan su hotkey (aunque se esté escribiendo en el chat, como en
    // Tibia), salvo mientras se edita el texto de una hotkey.
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (abierta()) {
                cerrar();
            } else {
                abrir();
            }
            return;
        }
        if (abierta() && e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            cerrar();
            return;
        }
        const tecla = teclaDe(e);
        if (!tecla || (abierta() && e.target && e.target.matches && e.target.matches('[data-hk-texto]'))) {
            return;
        }
        cargar();
        const accion = accionDe(datos[tecla], o.quien());
        if (accion) {
            e.preventDefault();
            e.stopImmediatePropagation();
            o.ejecutar(accion);
        }
    }, true);

    return {
        abrir,
        cerrar,
        alternar: () => (abierta() ? cerrar() : abrir()),
        abierta,
        /** Las hotkeys guardadas del personaje (para pruebas y la ayuda). */
        datos: () => {
            cargar();
            return datos;
        },
        repintar: () => {
            if (abierta()) {
                pintar();
            }
        }
    };
}
