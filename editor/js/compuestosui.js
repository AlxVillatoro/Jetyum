/**
 * La interfaz de los OBJETOS COMPUESTOS y de las PROPIEDADES DE UN OBJETO.
 *
 * Tres piezas:
 *
 *   - `formularioDeValores`: los parámetros de un compuesto (destino, actionId, cantidad...),
 *     que se usan al colocarlo desde la paleta y al reconfigurar uno ya colocado.
 *   - `formularioDePropiedades`: el diálogo «Propiedades» de RME para UN objeto de una casilla
 *     (cantidad, actionId, uniqueId, texto, destino de teleport...).
 *   - `CompuestosView`: la pestaña Compuestos, donde se crean y editan las plantillas.
 *
 * El formato está en `shared/js/compuestos.mjs` y se documenta en `docs/MAPAS.md`.
 */

import {
    TIPOS,
    ATRIBUTOS_CONOCIDOS,
    normalizarPlantilla,
    valoresPorDefecto,
    caja,
    slug
} from '../../shared/js/compuestos.mjs';

const S = 32;

function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) {
        e.className = clase;
    }
    if (texto !== undefined) {
        e.textContent = texto;
    }
    return e;
}

function campo(etiqueta, control, ayuda) {
    const lab = el('label', 'field');
    lab.appendChild(el('span', '', etiqueta));
    lab.appendChild(control);
    if (ayuda) {
        lab.title = ayuda;
    }
    return lab;
}

function entrada(tipo, valor, placeholder) {
    const i = el('input');
    i.type = tipo;
    if (valor !== undefined && valor !== null) {
        i.value = valor;
    }
    if (placeholder) {
        i.placeholder = placeholder;
    }
    return i;
}

function textoDePosicion(v) {
    return v && typeof v === 'object' ? v.x + ', ' + v.y + ', ' + v.z : '';
}

/**
 * Los controles de UN valor según su tipo. Devuelve el control y cómo leerlo.
 */
function controlDeValor(tipo, valor, opciones, nombreDe) {
    if (tipo === 'objeto' && opciones && opciones.length > 0) {
        const s = el('select');
        opciones.forEach((id) => {
            const o = el('option', '', id + (nombreDe ? ' · ' + nombreDe(id) : ''));
            o.value = String(id);
            s.appendChild(o);
        });
        if (valor !== null && valor !== undefined) {
            s.value = String(valor);
        }
        return { control: s, leer: () => Number(s.value) };
    }
    if (tipo === 'posicion') {
        const i = entrada('text', textoDePosicion(valor), 'x, y, z');
        return { control: i, leer: () => (i.value.trim() === '' ? null : i.value) };
    }
    if (tipo === 'texto') {
        const i = entrada('text', valor);
        return { control: i, leer: () => (i.value === '' ? null : i.value) };
    }
    const i = entrada('number', valor);
    return { control: i, leer: () => (i.value === '' ? null : Number(i.value)) };
}

/**
 * Pinta el formulario de parámetros de una plantilla.
 *
 * @returns {{leer: Function}} lee los valores tal y como están ahora
 */
export function formularioDeValores(contenedor, plantilla, valores, nombreDe) {
    contenedor.innerHTML = '';
    const actuales = valores || valoresPorDefecto(plantilla);
    const lectores = {};
    if (plantilla.parametros.length === 0) {
        contenedor.appendChild(el('div', 'nota', 'Este compuesto no tiene nada que configurar.'));
    }
    plantilla.parametros.forEach((p) => {
        const { control, leer } = controlDeValor(p.tipo, actuales[p.clave], p.opciones, nombreDe);
        contenedor.appendChild(campo(p.etiqueta + (p.obligatorio ? ' *' : ''), control,
            (p.ayuda || '') + ' (' + p.tipo + ')'));
        lectores[p.clave] = leer;
    });
    return {
        leer() {
            const salida = {};
            Object.keys(lectores).forEach((k) => {
                salida[k] = lectores[k]();
            });
            return salida;
        }
    };
}

/**
 * Las propiedades de UN objeto de una casilla: cantidad y atributos de mapa de Tibia.
 *
 * @param {Object} item `{id, count?, attributes?}` del archivo del mapa
 * @param {Function} alAplicar recibe `{count, attributes}`
 */
export function formularioDePropiedades(contenedor, item, alAplicar) {
    contenedor.innerHTML = '';
    if (!item) {
        return;
    }
    const attrs = item.attributes || {};
    const cantidad = entrada('number', item.count || 1);
    cantidad.min = 1;
    contenedor.appendChild(campo('Cantidad', cantidad, 'Para objetos apilables (monedas, flechas)'));
    const lectores = {};
    ATRIBUTOS_CONOCIDOS.forEach((a) => {
        const { control, leer } = controlDeValor(a.tipo, attrs[a.clave]);
        contenedor.appendChild(campo(a.etiqueta, control, a.ayuda));
        lectores[a.clave] = { leer, tipo: a.tipo };
    });
    const otros = Object.keys(attrs).filter((k) => !lectores[k]);
    if (otros.length > 0) {
        contenedor.appendChild(el('div', 'nota', 'Otros atributos (se conservan): ' + otros.join(', ')));
    }
    const boton = el('button', '', 'Aplicar propiedades');
    boton.type = 'button';
    boton.addEventListener('click', () => {
        const attributes = {};
        Object.keys(lectores).forEach((k) => {
            let v = lectores[k].leer();
            if (lectores[k].tipo === 'posicion' && v !== null) {
                const partes = String(v).split(/[,\s]+/).map(Number);
                v = partes.length === 3 && partes.every(Number.isFinite)
                    ? { x: partes[0], y: partes[1], z: partes[2] } : null;
            }
            attributes[k] = v;
        });
        alAplicar({ count: Number(cantidad.value) || 1, attributes });
    });
    contenedor.appendChild(boton);
}

/** Dibuja una plantilla en un lienzo, con su ancla marcada. */
export function dibujarPlantilla(lienzo, plantilla, proveedor, escalaMax) {
    const ctx = lienzo.getContext('2d');
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    if (!plantilla || plantilla.celdas.length === 0) {
        return;
    }
    const c = caja(plantilla);
    const escala = Math.max(0.25, Math.min(escalaMax || 2,
        (lienzo.width - 8) / ((c.ancho + 1) * S), (lienzo.height - 8) / ((c.alto + 1) * S)));
    const paso = S * escala;
    const x0 = (lienzo.width - c.ancho * paso) / 2 - c.minX * paso;
    const y0 = (lienzo.height - c.alto * paso) / 2 - c.minY * paso + paso / 2;
    ctx.imageSmoothingEnabled = false;
    const celdas = plantilla.celdas.filter((k) => k.dz === 0)
        .slice().sort((a, b) => (a.dy - b.dy) || (a.dx - b.dx));
    celdas.forEach((k) => {
        const ids = (k.suelo !== undefined ? [k.suelo] : []).concat(k.items.map((i) => i.id));
        ids.forEach((id) => {
            const sprite = proveedor.get(id);
            if (sprite && sprite.canvas) {
                ctx.drawImage(sprite.canvas,
                    x0 + k.dx * paso - (sprite.anchorX || 0) * escala,
                    y0 + k.dy * paso - sprite.anchorY * escala + paso,
                    sprite.canvas.width * escala, sprite.canvas.height * escala);
            }
        });
    });
    ctx.strokeStyle = '#ffd24a';
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, paso - 1, paso - 1);
    ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// Texto de las piezas de una celda: «1387», «3031x10», «1948{"actionId":100}»
// ---------------------------------------------------------------------------

export function itemsATexto(items) {
    return items.map((i) => i.id + (i.count ? 'x' + i.count : '') +
        (i.attributes ? JSON.stringify(i.attributes) : '')).join(', ');
}

export function textoAItems(texto) {
    const salida = [];
    // Las llaves van escapadas como \x7B y \x7D para no confundir a los comprobadores de llaves.
    const re = new RegExp('(\\d+)(?:x(\\d+))?(\\x7B[^\\x7D]*\\x7D)?', 'g');
    let m;
    while ((m = re.exec(texto)) !== null) {
        const item = { id: Number(m[1]) };
        if (m[2]) {
            item.count = Number(m[2]);
        }
        if (m[3]) {
            try {
                item.attributes = JSON.parse(m[3]);
            } catch (e) {
                // un atributo mal escrito se ignora; la validación del servidor lo dirá
            }
        }
        salida.push(item);
    }
    return salida;
}

// ---------------------------------------------------------------------------
// La pestaña Compuestos
// ---------------------------------------------------------------------------

export class CompuestosView {
    /**
     * @param {Object} opciones
     * @param {Object} opciones.api
     * @param {Function} opciones.proveedor devuelve el proveedor de sprites del mapa
     * @param {Function} opciones.nombreDe id de objeto -> nombre
     * @param {Function} opciones.alGuardar recibe la lista de plantillas guardada
     */
    constructor(opciones) {
        this.api = opciones.api;
        this.proveedor = opciones.proveedor;
        this.nombreDe = opciones.nombreDe || (() => '');
        this.alGuardar = opciones.alGuardar || (() => {});
        this.data = null;
        this.elegida = null;
        this.sucio = false;
        this.cargado = false;
    }

    $(id) {
        return document.getElementById(id);
    }

    estado(texto, error) {
        const e = this.$('cmp-estado');
        e.textContent = texto;
        e.className = error ? 'error' : '';
    }

    async cargar() {
        const r = await this.api.getCompuestos();
        if (r.error) {
            this.estado('no se pudieron leer los compuestos: ' + r.error, true);
            return;
        }
        this.data = r.data;
        this.cargado = true;
        if (!this.cableado) {
            this._cablear();
            this.cableado = true;
        }
        this._pintarLista();
        this.elegir(this.data.compuestos[0] ? this.data.compuestos[0].id : null);
        this.estado(this.data.compuestos.length + ' plantilla(s) en data/editor/compuestos.json' +
            (r.problems && r.problems.length ? ' — AVISO: ' + r.problems.slice(0, 3).join('; ') : ''),
        r.problems && r.problems.length > 0);
        this._bucle();
    }

    /** La lista de plantillas, por si otra pestaña (el mapa, al capturar) la cambió. */
    setPlantillas(lista) {
        if (!this.data) {
            return;
        }
        this.data.compuestos = lista;
        this._pintarLista();
    }

    _cablear() {
        this.$('cmp-filtro').addEventListener('input', () => this._pintarLista());
        this.$('cmp-nueva').addEventListener('click', () => this.nueva());
        this.$('cmp-duplicar').addEventListener('click', () => this.duplicar());
        this.$('cmp-borrar').addEventListener('click', () => this.borrar());
        this.$('cmp-guardar').addEventListener('click', () => this.guardar());
        this.$('cmp-json-aplicar').addEventListener('click', () => this.aplicarJson());
    }

    plantilla() {
        return this.data ? this.data.compuestos.find((t) => t.id === this.elegida) || null : null;
    }

    _marcarSucio() {
        this.sucio = true;
        this.$('cmp-guardar').classList.add('active');
        this.$('cmp-guardar').title = 'Guardar data/editor/compuestos.json — HAY CAMBIOS SIN GUARDAR';
    }

    _pintarLista() {
        const contenedor = this.$('cmp-lista');
        contenedor.innerHTML = '';
        const filtro = this.$('cmp-filtro').value.trim().toLowerCase();
        const porCategoria = new Map();
        this.data.compuestos.forEach((t) => {
            if (filtro && !(t.nombre + ' ' + t.id + ' ' + t.categoria).toLowerCase().includes(filtro)) {
                return;
            }
            if (!porCategoria.has(t.categoria)) {
                porCategoria.set(t.categoria, []);
            }
            porCategoria.get(t.categoria).push(t);
        });
        Array.from(porCategoria.keys()).sort().forEach((categoria) => {
            contenedor.appendChild(el('div', 'palette-title', categoria));
            porCategoria.get(categoria).forEach((t) => {
                const fila = el('div', 'item-row' + (t.id === this.elegida ? ' selected' : ''));
                const c = caja(t);
                fila.appendChild(el('span', 'item-name', t.nombre));
                fila.appendChild(el('span', 'item-attrs', c.ancho + 'x' + c.alto +
                    (t.parametros.length ? ' · ' + t.parametros.length + ' parám.' : '')));
                fila.addEventListener('click', () => this.elegir(t.id));
                contenedor.appendChild(fila);
            });
        });
    }

    elegir(id) {
        this.elegida = id;
        this._pintarLista();
        this._pintarFormulario();
    }

    _cambiar(nueva) {
        const lista = this.data.compuestos;
        const i = lista.findIndex((t) => t.id === this.elegida);
        lista[i] = nueva;
        this.elegida = nueva.id;
        this._marcarSucio();
        this._pintarLista();
        this._pintarFormulario();
    }

    _pintarFormulario() {
        const form = this.$('cmp-form');
        form.innerHTML = '';
        const t = this.plantilla();
        this.$('cmp-json').value = t ? JSON.stringify(t, null, 2) : '';
        if (!t) {
            form.appendChild(el('div', 'nota', 'Elige una plantilla, o crea una nueva. También se crean con la herramienta «Capturar» del mapa.'));
            return;
        }
        const clon = () => JSON.parse(JSON.stringify(this.plantilla()));

        form.appendChild(el('div', 'section-title', 'Plantilla «' + t.id + '»'));
        const nombre = entrada('text', t.nombre);
        nombre.addEventListener('change', () => { const n = clon(); n.nombre = nombre.value; this._cambiar(n); });
        form.appendChild(campo('Nombre', nombre));
        const categoria = entrada('text', t.categoria);
        categoria.addEventListener('change', () => { const n = clon(); n.categoria = categoria.value || 'General'; this._cambiar(n); });
        form.appendChild(campo('Categoría (agrupa en la paleta)', categoria));
        const desc = entrada('text', t.descripcion || '');
        desc.addEventListener('change', () => { const n = clon(); n.descripcion = desc.value || undefined; this._cambiar(n); });
        form.appendChild(campo('Descripción', desc));

        // --- Celdas ---
        form.appendChild(el('div', 'section-title', 'Celdas (relativas al ancla)'));
        form.appendChild(el('div', 'nota', 'Objetos de abajo arriba, separados por comas. «3031x10» pone 10; ' +
            '«1948{"actionId":100}» pone un atributo fijo. El suelo sustituye al de la casilla al colocar.'));
        const tabla = el('div', 'cmp-celdas');
        t.celdas.forEach((k, i) => {
            const fila = el('div', 'row cmp-celda');
            fila.appendChild(el('span', 'cmp-indice', '#' + i));
            const dx = entrada('number', k.dx);
            const dy = entrada('number', k.dy);
            const dz = entrada('number', k.dz);
            const suelo = entrada('number', k.suelo === undefined ? '' : k.suelo, 'suelo');
            const items = entrada('text', itemsATexto(k.items), 'objetos');
            [dx, dy, dz, suelo].forEach((x) => x.classList.add('corto'));
            dx.title = 'dx'; dy.title = 'dy'; dz.title = 'dz (planta)';
            const quitar = el('button', 'plain', '✕');
            quitar.type = 'button';
            quitar.title = 'Quitar esta celda';
            [dx, dy, dz, suelo, items].forEach((x) => fila.appendChild(x));
            fila.appendChild(quitar);
            const aplicar = () => {
                const n = clon();
                n.celdas[i] = { dx: Number(dx.value) || 0, dy: Number(dy.value) || 0, dz: Number(dz.value) || 0,
                    items: textoAItems(items.value) };
                if (suelo.value !== '') {
                    n.celdas[i].suelo = Number(suelo.value);
                }
                this._cambiar(n);
            };
            [dx, dy, dz, suelo, items].forEach((x) => x.addEventListener('change', aplicar));
            quitar.addEventListener('click', () => {
                const n = clon();
                n.celdas.splice(i, 1);
                n.parametros.forEach((p) => {
                    p.destinos = p.destinos.filter((d) => d.celda !== i)
                        .map((d) => ({ ...d, celda: d.celda > i ? d.celda - 1 : d.celda }));
                });
                this._cambiar(n);
            });
            tabla.appendChild(fila);
        });
        form.appendChild(tabla);
        const nuevaCelda = el('button', 'plain', '+ Celda');
        nuevaCelda.type = 'button';
        nuevaCelda.addEventListener('click', () => {
            const n = clon();
            const c = caja(n);
            n.celdas.push({ dx: c.maxX + 1, dy: 0, dz: 0, items: [{ id: 111 }] });
            this._cambiar(n);
        });
        form.appendChild(nuevaCelda);

        // --- Parámetros ---
        form.appendChild(el('div', 'section-title', 'Parámetros (lo que se configura al colocar)'));
        form.appendChild(el('div', 'nota', 'Destinos: «celda:objeto» y, para atributos, «celda:objeto:atributo» ' +
            '(p. ej. 0:0:teleportDestination). Varios, separados por «;». Atributos conocidos: ' +
            ATRIBUTOS_CONOCIDOS.map((a) => a.clave).join(', ') + '.'));
        t.parametros.forEach((p, i) => {
            const caja2 = el('div', 'cmp-param');
            const fila1 = el('div', 'row');
            const clave = entrada('text', p.clave, 'clave');
            const etiqueta = entrada('text', p.etiqueta, 'etiqueta');
            const tipo = el('select');
            TIPOS.forEach((x) => { const o = el('option', '', x); o.value = x; tipo.appendChild(o); });
            tipo.value = p.tipo;
            [clave, etiqueta, tipo].forEach((x) => fila1.appendChild(x));
            const fila2 = el('div', 'row');
            const defecto = entrada('text', p.tipo === 'posicion' ? textoDePosicion(p.defecto) : (p.defecto === undefined ? '' : p.defecto), 'por defecto');
            const destinos = entrada('text', p.destinos.map((d) => d.celda + ':' + d.item +
                (d.atributo ? ':' + d.atributo : '')).join('; '), 'destinos');
            const opciones = entrada('text', (p.opciones || []).join(', '), 'opciones (tipo objeto)');
            const quitar = el('button', 'plain', '✕');
            quitar.type = 'button';
            [defecto, destinos].forEach((x) => fila2.appendChild(x));
            fila2.appendChild(quitar);
            caja2.appendChild(fila1);
            caja2.appendChild(fila2);
            if (p.tipo === 'objeto') {
                caja2.appendChild(opciones);
            }
            const aplicar = () => {
                const n = clon();
                const nuevo = {
                    clave: clave.value.trim(), etiqueta: etiqueta.value.trim() || clave.value.trim(), tipo: tipo.value,
                    destinos: destinos.value.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
                        const [c, it, atributo] = x.split(':');
                        const d = { celda: Number(c), item: Number(it) };
                        if (atributo) {
                            d.atributo = atributo.trim();
                        }
                        return d;
                    })
                };
                if (defecto.value.trim() !== '') {
                    nuevo.defecto = tipo.value === 'texto' || tipo.value === 'posicion'
                        ? defecto.value : Number(defecto.value);
                }
                if (tipo.value === 'objeto' && opciones.value.trim()) {
                    nuevo.opciones = opciones.value.split(/[,\s]+/).map(Number).filter((x) => x > 0);
                }
                ['min', 'max', 'obligatorio', 'ayuda'].forEach((k) => {
                    if (p[k] !== undefined) {
                        nuevo[k] = p[k];
                    }
                });
                const problemas = [];
                n.parametros[i] = normalizarPlantilla({ ...n, parametros: [nuevo] }, problemas).parametros[0];
                this._cambiar(n);
                if (problemas.length) {
                    this.estado(problemas.join('; '), true);
                }
            };
            [clave, etiqueta, tipo, defecto, destinos, opciones].forEach((x) => x.addEventListener('change', aplicar));
            quitar.addEventListener('click', () => {
                const n = clon();
                n.parametros.splice(i, 1);
                this._cambiar(n);
            });
            form.appendChild(caja2);
        });
        const nuevoParam = el('button', 'plain', '+ Parámetro');
        nuevoParam.type = 'button';
        nuevoParam.addEventListener('click', () => {
            const n = clon();
            n.parametros.push({ clave: 'actionId' + (n.parametros.length || ''), etiqueta: 'Action ID', tipo: 'numero',
                destinos: n.celdas[0] && n.celdas[0].items.length ? [{ celda: 0, item: 0, atributo: 'actionId' }] : [] });
            this._cambiar(n);
        });
        form.appendChild(nuevoParam);

        // --- Vista previa de la configuración ---
        form.appendChild(el('div', 'section-title', 'Probar la configuración'));
        const prueba = el('div');
        formularioDeValores(prueba, t, null, this.nombreDe);
        form.appendChild(prueba);
    }

    nueva() {
        const nombre = window.prompt('Nombre del compuesto nuevo:', 'Nuevo compuesto');
        if (!nombre) {
            return;
        }
        let id = slug(nombre);
        while (this.data.compuestos.some((t) => t.id === id)) {
            id += '-2';
        }
        this.data.compuestos.push({ id, nombre, categoria: 'General', celdas: [{ dx: 0, dy: 0, dz: 0, items: [{ id: 111 }] }], parametros: [] });
        this._marcarSucio();
        this.elegir(id);
    }

    duplicar() {
        const t = this.plantilla();
        if (!t) {
            return;
        }
        const copia = JSON.parse(JSON.stringify(t));
        copia.id = t.id + '-copia';
        while (this.data.compuestos.some((x) => x.id === copia.id)) {
            copia.id += '-2';
        }
        copia.nombre = t.nombre + ' (copia)';
        this.data.compuestos.push(copia);
        this._marcarSucio();
        this.elegir(copia.id);
    }

    borrar() {
        const t = this.plantilla();
        if (!t || !window.confirm('¿Borrar la plantilla «' + t.nombre + '»? Lo ya colocado en los mapas se queda, ' +
            'pero dejará de reconocerse como objeto entero.')) {
            return;
        }
        this.data.compuestos.splice(this.data.compuestos.indexOf(t), 1);
        this._marcarSucio();
        this.elegir(this.data.compuestos[0] ? this.data.compuestos[0].id : null);
    }

    aplicarJson() {
        try {
            const n = JSON.parse(this.$('cmp-json').value);
            const problemas = [];
            const normal = normalizarPlantilla(n, problemas);
            this._cambiar(normal);
            this.estado(problemas.length ? 'aplicado con avisos: ' + problemas.join('; ') : 'JSON aplicado', problemas.length > 0);
        } catch (e) {
            this.estado('el JSON no es válido: ' + e.message, true);
        }
    }

    async guardar() {
        const r = await this.api.saveCompuestos(this.data);
        if (r.error) {
            this.estado('no se guardó: ' + r.error + ' — ' + (r.problems || []).slice(0, 4).join('; '), true);
            return;
        }
        this.sucio = false;
        this.$('cmp-guardar').classList.remove('active');
        this.$('cmp-guardar').title = 'Guardar data/editor/compuestos.json: todo guardado';
        this.estado('guardadas ' + r.count + ' plantilla(s) en data/editor/compuestos.json');
        this.alGuardar(this.data.compuestos);
    }

    _bucle() {
        if (this.bucleEnMarcha) {
            return;
        }
        this.bucleEnMarcha = true;
        const paso = () => {
            if (this.$('panel-compuestos').classList.contains('active')) {
                const lienzo = this.$('cmp-preview');
                const contenedor = lienzo.parentElement;
                if (lienzo.width !== contenedor.clientWidth || lienzo.height !== contenedor.clientHeight) {
                    lienzo.width = contenedor.clientWidth;
                    lienzo.height = contenedor.clientHeight;
                }
                dibujarPlantilla(lienzo, this.plantilla(), this.proveedor(), 3);
            }
            requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
    }
}
