/**
 * LA PESTAÑA SPRITES: el editor de cosas y sprites de 32x32 (lo que es ObjectBuilder para Tibia).
 *
 * TRES ZONAS, en el orden en el que se trabaja:
 *
 *   1. LA LISTA (izquierda): las cosas de una categoría —objetos, aspectos, efectos,
 *      proyectiles—, con su dibujo, para elegir cuál se edita.
 *   2. EL TALLER (centro): la vista previa animada, las PIEZAS de 32x32 del patrón y fotograma
 *      elegidos, y debajo la BIBLIOTECA de sprites. Una pieza se rellena eligiéndola y pinchando
 *      un sprite de la biblioteca (o arrastrándolo encima).
 *   3. LAS PROPIEDADES (derecha): dimensiones, animación y banderas.
 *
 * QUÉ SE GUARDA CUÁNDO, porque son dos cosas distintas:
 *
 *   - Los SPRITES se guardan AL MOMENTO (importar, reemplazar, vaciar): son de solo añadir y un
 *     sprite nuevo no cambia nada que ya exista.
 *   - Las COSAS (things.json) se guardan con «Guardar»: editar un objeto es una serie de cambios
 *     que se quiere poder revisar antes de escribirlos.
 *
 * El formato y el orden de los sprites están en `docs/SPRITES.md` y en `shared/js/assets.mjs`.
 */

import {
    SPRITE_SIZE,
    CATEGORIES,
    CATEGORY_NAMES,
    FLAGS,
    LIMITS,
    DIMENSIONS,
    DIRECTIONS,
    dimensionsOf,
    spriteIndex,
    spriteCount,
    resizeThing,
    normalizeAnimation,
    frameAt,
    nextFreeId,
    hasSprites,
    flagInfo
} from '../../shared/js/assets.mjs';
import { AssetsProvider, hslToRgb } from '/jetyum/js/assets.js';
import { paletteColor } from '/jetyum/js/sprites.js';
import { svgDe, ponerIcono } from './iconos.js';

/** El icono de cada categoría de cosas. */
const ICONO_DE_CATEGORIA = { items: 'objetos', outfits: 'aspectos', effects: 'efectos', missiles: 'proyectiles' };

/** Qué es cada categoría, para su globo. */
const AYUDA_DE_CATEGORIA = {
    items: 'lo que hay en el mundo: suelos, muros, decoración y equipo',
    outfits: 'personajes y monstruos, con sus cuatro direcciones',
    effects: 'animaciones que aparecen en una casilla (golpes, hechizos...)',
    missiles: 'lo que vuela de una casilla a otra (flechas, bolas de fuego...)'
};
import {
    trocearImagen,
    piezasDeHoja,
    quitarFondoMagenta,
    esMultiploDe32,
    enTandas,
    distribucionDeHoja,
    base64DeBytes
} from './imagenes.js';

const S = SPRITE_SIZE;
const POR_PAGINA = 288;

const ETIQUETAS_DIMENSION = {
    width: 'Ancho (casillas)',
    height: 'Alto (casillas)',
    exactSize: 'Tamaño exacto (px)',
    layers: 'Capas',
    patternX: 'Patrón X',
    patternY: 'Patrón Y',
    patternZ: 'Patrón Z',
    frames: 'Fotogramas'
};

const AYUDA_DIMENSION = {
    width: 'Casillas hacia la izquierda desde el ancla',
    height: 'Casillas hacia arriba desde el ancla',
    exactSize: 'Lado del dibujo en la interfaz (inventario)',
    layers: 'En un aspecto, 2: dibujo y máscara de colores',
    patternX: 'Aspectos: 4 direcciones (N, E, S, O). Suelos: se repite por posición x. Apilables: 4',
    patternY: 'Aspectos: cuerpo + añadidos. Apilables: 2 (8 dibujos por cantidad)',
    patternZ: 'Montura en aspectos; posición z en objetos',
    frames: 'Fotogramas de animación. Aspectos: 0 quieto, 1..n andando'
};

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

function clonar(valor) {
    return JSON.parse(JSON.stringify(valor));
}

/** Lee un archivo de imagen y devuelve sus píxeles. */
function leerImagen(archivo) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(archivo);
        const imagen = new Image();
        imagen.onload = () => {
            const lienzo = document.createElement('canvas');
            lienzo.width = imagen.width;
            lienzo.height = imagen.height;
            const ctx = lienzo.getContext('2d');
            ctx.drawImage(imagen, 0, 0);
            URL.revokeObjectURL(url);
            resolve(ctx.getImageData(0, 0, imagen.width, imagen.height));
        };
        imagen.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('no se pudo leer la imagen ' + archivo.name));
        };
        imagen.src = url;
    });
}

/** Sprites por petición: unos 1,1 MB en base64, lejos del límite de 4 MB del servidor. */
const TANDA = 200;

function elegirArchivo(input) {
    return new Promise((resolve) => {
        input.value = '';
        input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
        input.click();
    });
}

function descargar(lienzo, nombre) {
    const enlace = document.createElement('a');
    enlace.download = nombre;
    enlace.href = lienzo.toDataURL('image/png');
    enlace.click();
}

export class SpritesView {
    /**
     * @param {Object} opciones
     * @param {Object} opciones.api el ApiClient
     * @param {Function} [opciones.alGuardar] se llama con things e índice al guardar o importar,
     *        para que el mapa se redibuje con lo nuevo
     */
    constructor(opciones) {
        this.api = opciones.api;
        this.alGuardar = opciones.alGuardar || (() => {});
        this.things = null;
        this.indice = null;
        this.categoria = 'items';
        this.cosaId = null;
        this.sucio = false;
        this.sel = { capa: -1, px: 0, py: 0, pz: 0, frame: 0 };
        this.pieza = { w: 0, h: 0 };
        this.spriteElegido = 0;
        this.pagina = 0;
        this.reproducir = true;
        this.zoom = 3;
        this.colores = { head: 78, body: 69, legs: 58, feet: 76 };
        this.usados = new Set();
        this.cargado = false;
    }

    $(id) {
        return document.getElementById(id);
    }

    async cargar() {
        this.estado('cargando assets...');
        const r = await this.api.getAssets();
        if (r.error) {
            this.estado('no se pudieron cargar los assets: ' + r.error, true);
            return;
        }
        this.things = r.things;
        this.indice = r.index;
        this.provider = new AssetsProvider({ things: this.things, indice: this.indice, cargar: false });
        this.provider.recargarHojas(this.indice);
        this._contarUsos();
        this.cargado = true;
        this._cablear();
        this._pintarCategorias();
        this._pintarLista();
        const primera = this.things[this.categoria][0];
        this.elegir(primera ? primera.id : null);
        this._pintarBiblioteca();
        this._bucle();
        this.estado(this.indice.count + ' sprites de 32x32 en ' + this.indice.sheets.length +
            ' hoja(s); ' + CATEGORY_NAMES.map((c) => this.things[c].length + ' ' +
            CATEGORIES[c].label.toLowerCase()).join(', ') +
            (r.problems && r.problems.length ? ' — AVISO: ' + r.problems.length + ' problema(s) en things.json' : ''));
    }

    estado(texto, error) {
        const e = this.$('spr-estado');
        if (e) {
            e.textContent = texto;
            e.className = error ? 'error' : '';
        }
    }

    cosa() {
        if (this.cosaId === null) {
            return null;
        }
        return this.things[this.categoria].find((t) => t.id === this.cosaId) || null;
    }

    _contarUsos() {
        this.usados = new Set();
        CATEGORY_NAMES.forEach((c) => this.things[c].forEach((t) => t.sprites.forEach((id) => {
            if (id > 0) {
                this.usados.add(id);
            }
        })));
    }

    _marcarSucio() {
        this.sucio = true;
        this.$('spr-guardar').classList.add('active');
        // El icono se ilumina y el globo lo dice: hay cambios sin guardar.
        this.$('spr-guardar').title = 'Guardar things.json (Ctrl+S) — HAY CAMBIOS SIN GUARDAR';
    }

    /** Sustituye la cosa elegida por su versión cambiada y lo refresca todo. */
    _cambiar(nueva, sinLista) {
        const lista = this.things[this.categoria];
        const i = lista.findIndex((t) => t.id === this.cosaId);
        lista[i] = nueva;
        this.provider.setThing(this.categoria, nueva);
        this._contarUsos();
        this._marcarSucio();
        this._limitarSeleccion();
        if (!sinLista) {
            this._pintarFila(nueva);
        }
        this._pintarPiezas();
        this._pintarControles();
    }

    // -----------------------------------------------------------------------
    // Cableado
    // -----------------------------------------------------------------------

    _cablear() {
        this.$('spr-filtro').addEventListener('input', () => this._pintarLista());
        this.$('spr-nuevo').addEventListener('click', () => this.nueva());
        this.$('spr-duplicar').addEventListener('click', () => this.duplicar());
        this.$('spr-borrar').addEventListener('click', () => this.borrar());
        this.$('spr-guardar').addEventListener('click', () => this.guardar());
        this.$('spr-coherencia').addEventListener('click', () => this.coherencia());
        this.$('spr-importar-cosa').addEventListener('click', () => this.importarHojaDeCosa());
        this.$('spr-exportar-cosa').addEventListener('click', () => this.exportarHojaDeCosa());
        this.$('spr-desde-imagen').addEventListener('click', () => this.nuevaDesdeImagen());
        this.$('spr-importar').addEventListener('click', () => this.importarSprites());
        this.$('spr-reemplazar').addEventListener('click', () => this.reemplazarSprite());
        this.$('spr-vaciar').addEventListener('click', () => this.vaciarSprite());
        this.$('spr-exportar').addEventListener('click', () => this.exportarSprite());
        this.$('spr-usar').addEventListener('click', () => this.usarSpriteElegido());
        this.$('spr-pag-ant').addEventListener('click', () => { this.pagina = Math.max(0, this.pagina - 1); this._pintarBiblioteca(); });
        this.$('spr-pag-sig').addEventListener('click', () => { this.pagina += 1; this._pintarBiblioteca(); });
        this.$('spr-sin-usar').addEventListener('change', () => { this.pagina = 0; this._pintarBiblioteca(); });
        this.$('spr-ir').addEventListener('change', (e) => this._irASprite(Number(e.target.value)));
        this.$('spr-zoom').addEventListener('change', (e) => { this.zoom = Number(e.target.value); });
        this.$('spr-play').addEventListener('click', () => {
            this.reproducir = !this.reproducir;
            this.$('spr-play').classList.toggle('active', this.reproducir);
        });

        document.addEventListener('keydown', (e) => {
            if (!this.$('panel-sprites').classList.contains('active') ||
                e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.guardar();
            }
        });

        window.addEventListener('beforeunload', (e) => {
            if (this.sucio) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    // -----------------------------------------------------------------------
    // 1. La lista
    // -----------------------------------------------------------------------

    _pintarCategorias() {
        const caja = this.$('spr-cats');
        caja.innerHTML = '';
        CATEGORY_NAMES.forEach((c) => {
            const b = el('button', 'plain' + (c === this.categoria ? ' active' : ''));
            b.innerHTML = svgDe(ICONO_DE_CATEGORIA[c]);
            b.appendChild(el('span', '', String(this.things[c].length)));
            b.type = 'button';
            b.title = CATEGORIES[c].label + ' (' + this.things[c].length + '): ' + AYUDA_DE_CATEGORIA[c] +
                '.\nIdentificadores desde ' + CATEGORIES[c].firstId;
            b.setAttribute('aria-label', CATEGORIES[c].label);
            b.addEventListener('click', () => {
                this.categoria = c;
                this._pintarCategorias();
                this._pintarLista();
                const primera = this.things[c][0];
                this.elegir(primera ? primera.id : null);
            });
            caja.appendChild(b);
        });
    }

    _pintarLista() {
        const caja = this.$('spr-cosas');
        const filtro = this.$('spr-filtro').value.trim().toLowerCase();
        caja.innerHTML = '';
        this.filas = new Map();
        const fragmento = document.createDocumentFragment();
        this.things[this.categoria].forEach((t) => {
            if (filtro && !String(t.id).includes(filtro) &&
                !(t.name || '').toLowerCase().includes(filtro)) {
                return;
            }
            const fila = el('div', 'spr-fila' + (t.id === this.cosaId ? ' selected' : ''));
            fila.dataset.id = t.id;
            const mini = el('canvas', 'spr-mini');
            mini.width = S;
            mini.height = S;
            fila.appendChild(mini);
            fila.appendChild(el('span', 'spr-fila-id', String(t.id)));
            fila.appendChild(el('span', 'spr-fila-nombre', t.name || '—'));
            if (!hasSprites(t)) {
                fila.appendChild(el('em', '', 'sin dibujo'));
            }
            fila.addEventListener('click', () => this.elegir(t.id));
            this.filas.set(t.id, { fila, mini, pintada: -1 });
            fragmento.appendChild(fila);
        });
        caja.appendChild(fragmento);
        this.$('spr-cuenta').textContent = this.filas.size + ' de ' + this.things[this.categoria].length;
    }

    _pintarFila(t) {
        const entrada = this.filas && this.filas.get(t.id);
        if (!entrada) {
            this._pintarLista();
            return;
        }
        entrada.fila.querySelector('.spr-fila-nombre').textContent = t.name || '—';
        const aviso = entrada.fila.querySelector('em');
        if (hasSprites(t) && aviso) {
            aviso.remove();
        } else if (!hasSprites(t) && !aviso) {
            entrada.fila.appendChild(el('em', '', 'sin dibujo'));
        }
        entrada.pintada = -1;
    }

    /** Las miniaturas se pintan a ritmo de bucle: las hojas cargan solas y no hay que esperarlas. */
    _pintarMiniaturas() {
        if (!this.filas) {
            return;
        }
        const caja = this.$('spr-cosas');
        const arriba = caja.scrollTop;
        const abajo = arriba + caja.clientHeight;
        this.filas.forEach((entrada, id) => {
            const top = entrada.fila.offsetTop - caja.offsetTop;
            if (top + 40 < arriba || top > abajo || entrada.pintada === this.provider.version) {
                return;
            }
            const t = this.things[this.categoria].find((x) => x.id === id);
            const ctx = entrada.mini.getContext('2d');
            ctx.clearRect(0, 0, S, S);
            const lienzo = t ? this.provider.compose(t, { px: this.categoria === 'outfits' ? 2 : 0, py: 0, pz: 0, frame: 0 }) : null;
            if (lienzo) {
                const escala = Math.min(1, S / Math.max(lienzo.width, lienzo.height));
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(lienzo, (S - lienzo.width * escala) / 2, S - lienzo.height * escala,
                    lienzo.width * escala, lienzo.height * escala);
                entrada.pintada = this.provider.version;
            } else if (!t || !hasSprites(t)) {
                entrada.pintada = this.provider.version;
            }
        });
    }

    elegir(id) {
        this.cosaId = id;
        if (this.filas) {
            this.filas.forEach((entrada, k) => entrada.fila.classList.toggle('selected', k === id));
            const entrada = this.filas.get(id);
            if (entrada) {
                entrada.fila.scrollIntoView({ block: 'nearest' });
            }
        }
        this.sel = { capa: -1, px: this.categoria === 'outfits' ? 2 : 0, py: 0, pz: 0, frame: 0 };
        this.pieza = { w: 0, h: 0 };
        this._limitarSeleccion();
        this._pintarControles();
        this._pintarPiezas();
        this._pintarPropiedades();
    }

    nueva() {
        const lista = this.things[this.categoria];
        const id = nextFreeId(lista, this.categoria);
        const cosa = {
            id, name: CATEGORIES[this.categoria].singular + ' ' + id,
            width: 1, height: 1, exactSize: S, layers: 1, patternX: this.categoria === 'outfits' ? 4 : 1,
            patternY: 1, patternZ: 1, frames: 1, flags: {}, sprites: []
        };
        cosa.sprites = new Array(spriteCount(cosa)).fill(0);
        lista.push(cosa);
        lista.sort((a, b) => a.id - b.id);
        this.provider.setThing(this.categoria, cosa);
        this._marcarSucio();
        this._pintarCategorias();
        this._pintarLista();
        this.elegir(id);
        this.estado('nueva cosa ' + id + ': elige una pieza y pincha un sprite de la biblioteca, o «Importar hoja de la cosa»');
        return cosa;
    }

    duplicar() {
        const original = this.cosa();
        if (!original) {
            return;
        }
        const lista = this.things[this.categoria];
        const copia = clonar(original);
        copia.id = nextFreeId(lista, this.categoria);
        copia.name = (original.name || '') + ' (copia)';
        lista.push(copia);
        lista.sort((a, b) => a.id - b.id);
        this.provider.setThing(this.categoria, copia);
        this._marcarSucio();
        this._pintarCategorias();
        this._pintarLista();
        this.elegir(copia.id);
        this.estado('duplicado ' + original.id + ' como ' + copia.id + ' (comparte los sprites: no se copian píxeles)');
    }

    borrar() {
        const t = this.cosa();
        if (!t) {
            return;
        }
        const aviso = this.categoria === 'items'
            ? '\n\nSi el objeto ' + t.id + ' sigue en items.xml, el juego lo dibujará con el dibujo de respaldo.'
            : '';
        if (!window.confirm('¿Borrar ' + CATEGORIES[this.categoria].singular + ' ' + t.id + ' (' +
            (t.name || 'sin nombre') + ')? Sus sprites siguen en la biblioteca.' + aviso)) {
            return;
        }
        const lista = this.things[this.categoria];
        const i = lista.indexOf(t);
        lista.splice(i, 1);
        this.provider.setThings(this.things);
        this._contarUsos();
        this._marcarSucio();
        this._pintarCategorias();
        this._pintarLista();
        const siguiente = lista[Math.min(i, lista.length - 1)];
        this.elegir(siguiente ? siguiente.id : null);
        this.estado('borrado ' + t.id + ' (sin guardar)');
    }

    // -----------------------------------------------------------------------
    // 2. El taller: vista, piezas y biblioteca
    // -----------------------------------------------------------------------

    _limitarSeleccion() {
        const t = this.cosa();
        if (!t) {
            return;
        }
        const d = dimensionsOf(t);
        this.sel.px = Math.min(this.sel.px, d.patternX - 1);
        this.sel.py = Math.min(this.sel.py, d.patternY - 1);
        this.sel.pz = Math.min(this.sel.pz, d.patternZ - 1);
        this.sel.frame = Math.min(this.sel.frame, d.frames - 1);
        if (this.sel.capa >= d.layers) {
            this.sel.capa = -1;
        }
        this.pieza.w = Math.min(this.pieza.w, d.width - 1);
        this.pieza.h = Math.min(this.pieza.h, d.height - 1);
    }

    /** Los selectores de patrón, capa y fotograma. */
    _pintarControles() {
        const caja = this.$('spr-controles');
        caja.innerHTML = '';
        const t = this.cosa();
        if (!t) {
            return;
        }
        const d = dimensionsOf(t);
        const selector = (etiqueta, clave, n, nombres) => {
            if (n <= 1 && clave !== 'frame') {
                return;
            }
            const lab = el('label', 'spr-ctl');
            lab.appendChild(el('span', '', etiqueta));
            const s = el('select');
            if (clave === 'capa') {
                const o = el('option', '', 'todas');
                o.value = '-1';
                s.appendChild(o);
            }
            for (let i = 0; i < n; i += 1) {
                const o = el('option', '', nombres ? nombres[i] || String(i) : String(i));
                o.value = String(i);
                s.appendChild(o);
            }
            s.value = String(this.sel[clave]);
            s.addEventListener('change', () => {
                this.sel[clave] = Number(s.value);
                if (clave === 'frame') {
                    this.reproducir = false;
                    this.$('spr-play').classList.remove('active');
                }
                this._pintarPiezas();
            });
            lab.appendChild(s);
            caja.appendChild(lab);
        };
        const esAspecto = this.categoria === 'outfits';
        selector(esAspecto ? 'Dirección' : 'Patrón X', 'px', d.patternX, esAspecto && d.patternX === 4 ? DIRECTIONS : null);
        selector(esAspecto ? 'Añadido' : 'Patrón Y', 'py', d.patternY, esAspecto ? ['cuerpo', 'añadido 1', 'añadido 2'] : null);
        selector(esAspecto ? 'Montura' : 'Patrón Z', 'pz', d.patternZ);
        selector('Capa', 'capa', d.layers, esAspecto && d.layers >= 2 ? ['dibujo', 'máscara'] : null);
        selector('Fotograma', 'frame', d.frames, esAspecto ? ['0 quieto'].concat(
            Array.from({ length: d.frames - 1 }, (_, i) => (i + 1) + ' andando')) : null);

        if (esAspecto && d.layers >= 2) {
            ['head', 'body', 'legs', 'feet'].forEach((parte) => {
                const lab = el('label', 'spr-ctl');
                lab.appendChild(el('span', '', { head: 'Cabeza', body: 'Cuerpo', legs: 'Piernas', feet: 'Pies' }[parte]));
                const i = el('input');
                i.type = 'number';
                i.min = 0;
                i.max = 132;
                i.value = this.colores[parte];
                i.addEventListener('change', () => {
                    this.colores[parte] = Number(i.value);
                });
                lab.appendChild(i);
                caja.appendChild(lab);
            });
        }
    }

    _frameActual(t) {
        if (this.reproducir && dimensionsOf(t).frames > 1) {
            if (this.categoria === 'outfits') {
                const pasos = dimensionsOf(t).frames - 1;
                return 1 + Math.floor(performance.now() / 120) % pasos;
            }
            return frameAt(t, performance.now());
        }
        return this.sel.frame;
    }

    /** La vista previa: se redibuja cada fotograma, para la animación. */
    _pintarVista() {
        const lienzo = this.$('spr-preview');
        const ctx = lienzo.getContext('2d');
        const caja = lienzo.parentElement;
        lienzo.width = caja.clientWidth;
        lienzo.height = caja.clientHeight;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, lienzo.width, lienzo.height);

        const t = this.cosa();
        if (!t) {
            return;
        }
        const d = dimensionsOf(t);
        const z = this.zoom;
        const ancho = d.width * S * z;
        const alto = d.height * S * z;
        const x0 = Math.round((lienzo.width - ancho) / 2);
        const y0 = Math.round((lienzo.height - alto) / 2);

        // La rejilla de casillas, y el ANCLA (abajo a la derecha) marcada.
        ctx.strokeStyle = '#2a2a3a';
        for (let h = 0; h < d.height; h += 1) {
            for (let w = 0; w < d.width; w += 1) {
                ctx.strokeRect(x0 + w * S * z + 0.5, y0 + h * S * z + 0.5, S * z - 1, S * z - 1);
            }
        }
        ctx.strokeStyle = '#4a8ac0';
        ctx.strokeRect(x0 + (d.width - 1) * S * z + 0.5, y0 + (d.height - 1) * S * z + 0.5, S * z - 1, S * z - 1);

        const frame = this._frameActual(t);
        const colores = this.categoria === 'outfits' && d.layers >= 2 && this.sel.capa === -1 ? {
            head: this._rgb(this.colores.head), body: this._rgb(this.colores.body),
            legs: this._rgb(this.colores.legs), feet: this._rgb(this.colores.feet)
        } : null;

        let dibujo;
        if (this.sel.capa >= 0) {
            dibujo = document.createElement('canvas');
            dibujo.width = d.width * S;
            dibujo.height = d.height * S;
            this.provider._pintarCapa(dibujo.getContext('2d'), t, this.sel.capa, this.sel.px, this.sel.py, this.sel.pz, frame);
        } else {
            dibujo = this.provider.compose(t, { px: this.sel.px, py: this.sel.py, pz: this.sel.pz, frame, colores });
        }
        if (dibujo) {
            const off = (t.flags && t.flags.offset) || { x: 0, y: 0 };
            ctx.drawImage(dibujo, x0 - off.x * z, y0 - off.y * z, dibujo.width * z, dibujo.height * z);
        }

        ctx.fillStyle = '#6a6a80';
        ctx.font = '11px monospace';
        ctx.fillText('fotograma ' + frame + ' · ancla en azul · ' + d.width + 'x' + d.height + ' casillas', 8, lienzo.height - 8);
    }

    _rgb(indice) {
        return hslToRgb(paletteColor(indice));
    }

    /** Las piezas del patrón y fotograma elegidos: lo que se edita a mano. */
    _pintarPiezas() {
        const caja = this.$('spr-piezas-rejilla');
        caja.innerHTML = '';
        const t = this.cosa();
        const info = this.$('spr-piezas-info');
        if (!t) {
            info.textContent = 'elige una cosa de la lista';
            return;
        }
        const d = dimensionsOf(t);
        const capas = this.sel.capa >= 0 ? [this.sel.capa] : Array.from({ length: d.layers }, (_, i) => i);
        capas.forEach((capa) => {
            const bloque = el('div', 'spr-bloque');
            if (d.layers > 1) {
                bloque.appendChild(el('div', 'sub-title', 'capa ' + capa));
            }
            const rejilla = el('div', 'spr-rejilla');
            rejilla.style.gridTemplateColumns = 'repeat(' + d.width + ', 68px)';
            for (let h = d.height - 1; h >= 0; h -= 1) {
                for (let w = d.width - 1; w >= 0; w -= 1) {
                    const indice = spriteIndex(t, w, h, capa, this.sel.px, this.sel.py, this.sel.pz, this.sel.frame);
                    const id = t.sprites[indice] || 0;
                    const celda = el('div', 'spr-pieza' +
                        (w === this.pieza.w && h === this.pieza.h && capa === Math.max(0, this.sel.capa) ? ' selected' : '') +
                        (w === 0 && h === 0 ? ' ancla' : ''));
                    celda.title = 'pieza ' + indice + ' de la lista (w=' + w + ', h=' + h + ', capa ' + capa +
                        ')\nsprite ' + id + '\nclic: elegirla · «Usar» o doble clic en la biblioteca: ponerle el sprite elegido' +
                        '\nclic derecho: vaciarla · también puedes soltar aquí un sprite de la biblioteca';
                    const c = el('canvas');
                    c.width = S;
                    c.height = S;
                    if (id > 0) {
                        this.provider.drawSprite(c.getContext('2d'), id, 0, 0);
                    }
                    celda.appendChild(c);
                    celda.appendChild(el('span', '', id > 0 ? '#' + id : 'vacía'));
                    celda.addEventListener('click', () => {
                        this.pieza = { w, h };
                        if (d.layers > 1) {
                            this.sel.capa = capa;
                        }
                        this._pintarPiezas();
                        this._pintarControles();
                    });
                    celda.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        this._asignar(indice, 0);
                    });
                    celda.addEventListener('dragover', (e) => e.preventDefault());
                    celda.addEventListener('drop', (e) => {
                        e.preventDefault();
                        const sprite = Number(e.dataTransfer.getData('text/plain'));
                        if (sprite > 0) {
                            this._asignar(indice, sprite);
                        }
                    });
                    rejilla.appendChild(celda);
                }
            }
            bloque.appendChild(rejilla);
            caja.appendChild(bloque);
        });
        info.textContent = t.sprites.filter((x) => x > 0).length + ' de ' + spriteCount(t) +
            ' piezas con sprite · elegida w=' + this.pieza.w + ', h=' + this.pieza.h;
        this._refrescarUsar();
    }

    _asignar(indice, sprite) {
        const t = this.cosa();
        if (!t) {
            return;
        }
        const nueva = clonar(t);
        nueva.sprites[indice] = sprite;
        this._cambiar(nueva);
        this.estado(sprite > 0 ? 'pieza ' + indice + ' = sprite ' + sprite : 'pieza ' + indice + ' vaciada');
    }

    /** Pone el sprite elegido de la biblioteca en la pieza elegida. */
    usarSpriteElegido() {
        const indice = this._indiceElegido();
        if (!this.spriteElegido || indice < 0) {
            this.estado('elige una pieza y un sprite de la biblioteca', true);
            return;
        }
        const t = this.cosa();
        if (t.sprites[indice] === this.spriteElegido) {
            this.estado('la pieza ' + indice + ' ya usa el sprite ' + this.spriteElegido);
            return;
        }
        this._asignar(indice, this.spriteElegido);
    }

    /** El botón «Usar»: dice qué sprite se va a poner, y no se puede pulsar si falta algo. */
    _refrescarUsar() {
        const boton = this.$('spr-usar');
        if (!boton) {
            return;
        }
        const listo = Boolean(this.spriteElegido) && this._indiceElegido() >= 0;
        boton.disabled = !listo;
        boton.innerHTML = svgDe('usar');
        boton.appendChild(el('span', '', this.spriteElegido ? 'Usar #' + this.spriteElegido : 'Usar sprite'));
    }

    /** El índice de la pieza elegida en la lista de sprites de la cosa. */
    _indiceElegido() {
        const t = this.cosa();
        if (!t) {
            return -1;
        }
        return spriteIndex(t, this.pieza.w, this.pieza.h, Math.max(0, this.sel.capa),
            this.sel.px, this.sel.py, this.sel.pz, this.sel.frame);
    }

    _spritesDeLaPagina() {
        const total = this.indice.count;
        const soloSinUsar = this.$('spr-sin-usar').checked;
        const ids = [];
        for (let id = 1; id <= total; id += 1) {
            if (!soloSinUsar || !this.usados.has(id)) {
                ids.push(id);
            }
        }
        const paginas = Math.max(1, Math.ceil(ids.length / POR_PAGINA));
        this.pagina = Math.min(this.pagina, paginas - 1);
        return { ids: ids.slice(this.pagina * POR_PAGINA, (this.pagina + 1) * POR_PAGINA), paginas, total: ids.length };
    }

    _pintarBiblioteca() {
        const caja = this.$('spr-sprites');
        caja.innerHTML = '';
        const { ids, paginas, total } = this._spritesDeLaPagina();
        this.$('spr-pagina').textContent = 'página ' + (this.pagina + 1) + ' de ' + paginas + ' · ' + total + ' sprites';
        const fragmento = document.createDocumentFragment();
        this.lienzosBiblioteca = [];
        ids.forEach((id) => {
            const celda = el('div', 'spr-sprite' + (id === this.spriteElegido ? ' selected' : '') +
                (this.usados.has(id) ? '' : ' libre'));
            celda.draggable = true;
            celda.title = 'sprite ' + id + (this.usados.has(id) ? '' : ' (sin usar)') +
                '\nclic: elegirlo · doble clic: usarlo en la pieza elegida · arrastrar: soltarlo en una pieza';
            const c = el('canvas');
            c.width = S;
            c.height = S;
            celda.appendChild(c);
            celda.appendChild(el('span', '', String(id)));
            celda.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(id)));
            celda.addEventListener('click', () => {
                this.spriteElegido = id;
                caja.querySelectorAll('.spr-sprite.selected').forEach((x) => x.classList.remove('selected'));
                celda.classList.add('selected');
                this._infoSprite();
                this._refrescarUsar();
            });
            // Elegir un sprite NO cambia la cosa: se usa con el botón «Usar», con doble clic o
            // arrastrándolo a una pieza. Antes el clic lo ponía directamente, y era fácil cambiar
            // un dibujo sin querer.
            celda.addEventListener('dblclick', () => this.usarSpriteElegido());
            this.lienzosBiblioteca.push({ id, c, pintado: -1 });
            fragmento.appendChild(celda);
        });
        caja.appendChild(fragmento);
    }

    _pintarLienzosBiblioteca() {
        (this.lienzosBiblioteca || []).forEach((entrada) => {
            if (entrada.pintado === this.provider.version) {
                return;
            }
            const ctx = entrada.c.getContext('2d');
            ctx.clearRect(0, 0, S, S);
            if (this.provider.drawSprite(ctx, entrada.id, 0, 0)) {
                entrada.pintado = this.provider.version;
            }
        });
    }

    async _infoSprite() {
        const info = this.$('spr-sprite-info');
        if (!this.spriteElegido) {
            info.textContent = 'ningún sprite elegido';
            return;
        }
        const r = await this.api.spriteUsage(this.spriteElegido);
        const usos = r.usage || [];
        info.textContent = 'sprite ' + this.spriteElegido + ': ' + (usos.length === 0 ? 'sin usar (en el archivo guardado)'
            : 'lo usan ' + usos.slice(0, 6).map((u) => CATEGORIES[u.category].singular + ' ' + u.id).join(', ') +
            (usos.length > 6 ? ' y ' + (usos.length - 6) + ' más' : ''));
    }

    _irASprite(id) {
        if (!(id > 0) || id > this.indice.count) {
            return;
        }
        this.$('spr-sin-usar').checked = false;
        this.pagina = Math.floor((id - 1) / POR_PAGINA);
        this.spriteElegido = id;
        this._pintarBiblioteca();
        this._infoSprite();
        this._refrescarUsar();
    }

    _trasImportar(r) {
        this.indice = r.index;
        this.provider.recargarHojas(this.indice);
        this.alGuardar(this.things, this.indice);
    }

    /**
     * Lee una imagen y, si está marcada la casilla «magenta = transparente», le quita el fondo
     * magenta (#FF00FF), que es como vienen las hojas de sprites de Tibia y de ObjectBuilder.
     */
    async _leer(archivo) {
        const imagen = await leerImagen(archivo);
        const casilla = this.$('spr-magenta');
        imagen.sinFondo = casilla && casilla.checked ? quitarFondoMagenta(imagen.data, imagen.width) : 0;
        return imagen;
    }

    /** Lo que se dice de la imagen leída: su tamaño, si no es de casillas enteras y el fondo. */
    _notaDeImagen(archivo, imagen) {
        return archivo.name + ' (' + imagen.width + 'x' + imagen.height + ')' +
            (esMultiploDe32(imagen.width, imagen.height) ? ''
                : ' AVISO: no mide un número entero de casillas de 32; el borde se completó con transparente.') +
            (imagen.sinFondo ? ' Fondo magenta quitado.' : '');
    }

    /**
     * Sube sprites a la biblioteca POR TANDAS: una hoja grande (mil sprites son unos 5 MB) no
     * cabe en una sola petición. Si una tanda falla, las anteriores ya están guardadas, y se dice.
     */
    async _subirSprites(sprites) {
        const total = { ids: [], added: 0, reused: 0, index: null };
        const tandas = enTandas(sprites, TANDA);
        for (let i = 0; i < tandas.length; i += 1) {
            if (tandas.length > 1) {
                this.estado('subiendo sprites: ' + Math.min((i + 1) * TANDA, sprites.length) + ' de ' +
                    sprites.length + '...');
            }
            const r = await this.api.addSprites(tandas[i], true);
            if (r.error) {
                if (total.index) {
                    this._trasImportar(total);
                }
                return Object.assign(total, {
                    error: r.error + (total.ids.length ? ' (antes se guardaron ' + total.ids.length + ' sprites)' : '')
                });
            }
            total.ids.push(...r.ids);
            total.added += r.added;
            total.reused += r.reused;
            total.index = r.index;
        }
        return total;
    }

    /**
     * Importa una imagen a la biblioteca, cortada en sprites de 32x32, de izquierda a derecha y
     * de arriba abajo. Vale cualquier tamaño (lo normal es un múltiplo de 32): las casillas
     * vacías no ocupan sitio y las repetidas reutilizan el sprite que ya existe.
     */
    async importarSprites() {
        const archivo = await elegirArchivo(this.$('spr-archivo'));
        if (!archivo) {
            return;
        }
        const imagen = await this._leer(archivo);
        const todas = trocearImagen(imagen.data, imagen.width, imagen.height);
        const piezas = todas.filter((p) => !p.vacio);
        if (piezas.length === 0) {
            this.estado('la imagen es transparente del todo: no hay nada que importar', true);
            return;
        }
        this.estado('importando ' + piezas.length + ' sprites...');
        const r = await this._subirSprites(piezas.map((p) => base64DeBytes(p.rgba)));
        if (r.error) {
            this.estado('no se importó del todo: ' + r.error, true);
            return;
        }
        this._trasImportar(r);
        const nuevos = r.ids.filter((x) => x > 0);
        this.estado(this._notaDeImagen(archivo, imagen) + ' ' + todas.length + ' casillas: ' +
            r.added + ' sprites nuevos, ' + r.reused + ' ya existían, ' + (todas.length - piezas.length) +
            ' vacías.' + (r.added > 0 ? ' Del ' + Math.min(...nuevos) + ' al ' + Math.max(...nuevos) + '.' : ''));
        if (nuevos.length) {
            this._irASprite(Math.max(...nuevos));
        }
    }

    async reemplazarSprite() {
        if (!this.spriteElegido) {
            this.estado('elige antes un sprite de la biblioteca', true);
            return;
        }
        const usos = (await this.api.spriteUsage(this.spriteElegido)).usage || [];
        if (usos.length > 0 && !window.confirm('El sprite ' + this.spriteElegido + ' lo usan ' + usos.length +
            ' cosa(s). Reemplazarlo cambia el dibujo de todas. ¿Seguir?')) {
            return;
        }
        const archivo = await elegirArchivo(this.$('spr-archivo'));
        if (!archivo) {
            return;
        }
        const imagen = await this._leer(archivo);
        const pieza = trocearImagen(imagen.data, Math.min(imagen.width, S), Math.min(imagen.height, S))[0];
        const r = await this.api.replaceSprite(this.spriteElegido, base64DeBytes(pieza.rgba));
        if (r.error) {
            this.estado('no se reemplazó: ' + r.error, true);
            return;
        }
        this._trasImportar(r);
        this.estado('sprite ' + this.spriteElegido + ' reemplazado' + (imagen.width !== S || imagen.height !== S
            ? ' (la imagen medía ' + imagen.width + 'x' + imagen.height + ': se tomó la esquina de 32x32)' : ''));
    }

    async vaciarSprite() {
        if (!this.spriteElegido) {
            return;
        }
        const usos = (await this.api.spriteUsage(this.spriteElegido)).usage || [];
        if (!window.confirm('¿Dejar transparente el sprite ' + this.spriteElegido + '?' +
            (usos.length ? ' Lo usan ' + usos.length + ' cosa(s).' : '') + ' Su número no se reutiliza.')) {
            return;
        }
        const r = await this.api.clearSprite(this.spriteElegido);
        if (r.error) {
            this.estado(r.error, true);
            return;
        }
        this._trasImportar(r);
        this.estado('sprite ' + this.spriteElegido + ' vaciado');
    }

    exportarSprite() {
        if (!this.spriteElegido) {
            return;
        }
        const c = this.provider.spriteCanvas(this.spriteElegido);
        if (c) {
            descargar(c, 'sprite-' + this.spriteElegido + '.png');
        }
    }

    /**
     * Importa la HOJA DE UNA COSA: todos sus patrones y fotogramas de una vez (ver
     * `imagenes.js` para la distribución). Es la forma rápida de dibujar un objeto grande o un
     * aspecto con sus cuatro direcciones.
     */
    async importarHojaDeCosa(archivoDado) {
        const t = this.cosa();
        if (!t) {
            return;
        }
        const archivo = archivoDado || await elegirArchivo(this.$('spr-archivo'));
        if (!archivo) {
            return;
        }
        const imagen = await this._leer(archivo);
        const hoja = distribucionDeHoja(t);
        const piezas = piezasDeHoja(t, imagen.data, imagen.width, imagen.height);
        const r = await this._subirSprites(piezas.map((p) => base64DeBytes(p.rgba)));
        if (r.error) {
            this.estado('no se importó: ' + r.error, true);
            return;
        }
        const nueva = clonar(this.cosa());
        piezas.forEach((p, i) => {
            nueva.sprites[p.indice] = r.ids[i];
        });
        this._trasImportar(r);
        this._cambiar(nueva);
        this.estado('hoja importada en ' + t.id + ': ' + r.added + ' sprites nuevos, ' + r.reused +
            ' reutilizados.' + (imagen.width !== hoja.ancho || imagen.height !== hoja.alto
                ? ' AVISO: la hoja de esta cosa mide ' + hoja.ancho + 'x' + hoja.alto + ' y la imagen ' +
                  imagen.width + 'x' + imagen.height + '.' : ''));
    }

    exportarHojaDeCosa() {
        const t = this.cosa();
        if (!t) {
            return;
        }
        const d = dimensionsOf(t);
        const hoja = distribucionDeHoja(t);
        const lienzo = document.createElement('canvas');
        lienzo.width = hoja.ancho;
        lienzo.height = hoja.alto;
        const ctx = lienzo.getContext('2d');
        for (let capa = 0; capa < d.layers; capa += 1) {
            for (let pz = 0; pz < d.patternZ; pz += 1) {
                for (let py = 0; py < d.patternY; py += 1) {
                    for (let px = 0; px < d.patternX; px += 1) {
                        for (let f = 0; f < d.frames; f += 1) {
                            ctx.save();
                            ctx.translate(f * hoja.celdaAncho, hoja.fila(capa, px, py, pz) * hoja.celdaAlto);
                            this.provider._pintarCapa(ctx, t, capa, px, py, pz, f);
                            ctx.restore();
                        }
                    }
                }
            }
        }
        descargar(lienzo, this.categoria + '-' + t.id + '.png');
        this.estado('hoja de ' + t.id + ' exportada: ' + hoja.columnas + ' fotograma(s) por ' + hoja.filas +
            ' fila(s) de ' + hoja.celdaAncho + 'x' + hoja.celdaAlto);
    }

    /** Una cosa nueva del tamaño de una imagen, con la imagen ya cortada dentro. */
    async nuevaDesdeImagen() {
        const archivo = await elegirArchivo(this.$('spr-archivo'));
        if (!archivo) {
            return;
        }
        const imagen = await this._leer(archivo);
        const ancho = Math.min(LIMITS.width[1], Math.ceil(imagen.width / S));
        const alto = Math.min(LIMITS.height[1], Math.ceil(imagen.height / S));
        const cosa = this.nueva();
        cosa.name = archivo.name.replace(/\.[a-z]+$/i, '');
        const nueva = resizeThing(cosa, { width: ancho, height: alto, exactSize: S * Math.max(ancho, alto), patternX: 1 });
        this._cambiar(nueva);
        this._pintarPropiedades();
        await this.importarHojaDeCosa(archivo);
    }

    // -----------------------------------------------------------------------
    // 3. Las propiedades
    // -----------------------------------------------------------------------

    _pintarPropiedades() {
        const caja = this.$('spr-props-form');
        caja.innerHTML = '';
        const t = this.cosa();
        if (!t) {
            caja.appendChild(el('div', 'nota', 'no hay nada elegido'));
            return;
        }

        // Un título de sección. Si lleva explicación, va en su globo con un icono ⓘ: el panel
        // enseña los controles y la ayuda está a un gesto de ratón.
        const seccion = (titulo, ayuda) => {
            const cabecera = el('div', 'section-title', titulo);
            if (ayuda) {
                cabecera.title = ayuda;
                cabecera.classList.add('con-ayuda');
                cabecera.insertAdjacentHTML('beforeend', svgDe('info'));
            }
            caja.appendChild(cabecera);
        };

        seccion(CATEGORIES[this.categoria].singular + ' ' + t.id);
        const nombre = el('label', 'field');
        nombre.appendChild(el('span', '', 'Nombre (solo para el editor)'));
        const inNombre = el('input');
        inNombre.type = 'text';
        inNombre.value = t.name || '';
        inNombre.addEventListener('change', () => {
            const nueva = clonar(this.cosa());
            nueva.name = inNombre.value.trim() || undefined;
            this._cambiar(nueva);
        });
        nombre.appendChild(inNombre);
        caja.appendChild(nombre);

        const idLab = el('label', 'field');
        idLab.appendChild(el('span', '', 'Identificador (desde ' + CATEGORIES[this.categoria].firstId + ')'));
        const inId = el('input');
        inId.type = 'number';
        inId.value = t.id;
        inId.addEventListener('change', () => {
            const nuevo = Math.trunc(Number(inId.value));
            const lista = this.things[this.categoria];
            if (!(nuevo >= CATEGORIES[this.categoria].firstId) || lista.some((x) => x.id === nuevo)) {
                this.estado('el identificador ' + inId.value + ' no vale o ya está usado', true);
                inId.value = t.id;
                return;
            }
            const nueva = clonar(this.cosa());
            nueva.id = nuevo;
            lista[lista.indexOf(this.cosa())] = nueva;
            lista.sort((a, b) => a.id - b.id);
            this.provider.setThings(this.things);
            this._marcarSucio();
            this._pintarLista();
            this.elegir(nuevo);
        });
        idLab.appendChild(inId);
        caja.appendChild(idLab);

        seccion('Dimensiones', spriteCount(t) + ' piezas = ancho × alto × capas × patrones × fotogramas.\n' +
            'Al cambiar un número, las piezas que siguen existiendo se conservan en su sitio.');
        const rejilla = el('div', 'spr-dims');
        DIMENSIONS.forEach((dim) => {
            const lab = el('label', 'field');
            lab.title = AYUDA_DIMENSION[dim];
            lab.appendChild(el('span', '', ETIQUETAS_DIMENSION[dim]));
            const i = el('input');
            i.type = 'number';
            i.min = LIMITS[dim][0];
            i.max = LIMITS[dim][1];
            i.value = dimensionsOf(t)[dim];
            i.addEventListener('change', () => {
                const nueva = resizeThing(this.cosa(), { [dim]: Number(i.value) });
                this._cambiar(nueva);
                this._pintarPropiedades();
            });
            lab.appendChild(i);
            rejilla.appendChild(lab);
        });
        caja.appendChild(rejilla);

        if (dimensionsOf(t).frames > 1) {
            seccion('Animación');
            const anim = normalizeAnimation(t.animation, dimensionsOf(t).frames);
            const fila = el('div', 'row');
            const modo = el('select');
            ['async', 'sync'].forEach((m) => {
                const o = el('option', '', m === 'async' ? 'cada uno a su ritmo' : 'sincronizada');
                o.value = m;
                modo.appendChild(o);
            });
            modo.value = anim.mode;
            fila.appendChild(modo);
            const duracion = el('input');
            duracion.type = 'text';
            duracion.title = 'Milisegundos de cada fotograma, separados por comas (uno solo vale para todos)';
            duracion.value = anim.durations.map((p) => p[0]).join(',');
            fila.appendChild(duracion);
            caja.appendChild(fila);
            const aplicar = () => {
                const partes = duracion.value.split(/[,\s]+/).map(Number).filter((n) => n > 0);
                const nueva = clonar(this.cosa());
                const n = dimensionsOf(nueva).frames;
                nueva.animation = normalizeAnimation({
                    mode: modo.value, loop: anim.loop, start: anim.start,
                    durations: Array.from({ length: n }, (_, k) => {
                        const v = partes[Math.min(k, partes.length - 1)] || 200;
                        return [v, v];
                    })
                }, n);
                this._cambiar(nueva);
            };
            modo.addEventListener('change', aplicar);
            duracion.addEventListener('change', aplicar);
        }

        seccion('Banderas', 'Cómo se comporta la cosa. Pasa el ratón por cada una para ver qué hace.' +
            (this.categoria === 'items' ? '\nLas que tienen equivalente en items.xml (isGround, blocksSolid, ' +
                'pickupable...) tienen que coincidir con las del servidor: «Comprobar coherencia» lo verifica.' : ''));
        let grupo = null;
        FLAGS.forEach((flag) => {
            if (flag.grupo !== grupo) {
                grupo = flag.grupo;
                caja.appendChild(el('div', 'sub-title', grupo));
            }
            const fila = el('div', 'attribute-row spr-flag');
            fila.title = flag.ayuda + (flag.servidor ? '\n(en items.xml: ' + flag.servidor + ')' : '');
            const check = el('input');
            check.type = 'checkbox';
            const valor = (t.flags || {})[flag.key];
            check.checked = valor !== undefined;
            fila.appendChild(check);
            fila.appendChild(el('span', '', flag.etiqueta));
            const campos = [];
            if (flag.valor === 'numero') {
                campos.push({ campo: null, defecto: flag.valorPorDefecto || 0 });
            } else if (flag.valor && typeof flag.valor === 'object') {
                Object.keys(flag.valor).forEach((campo) => campos.push({ campo, defecto: flag.valor[campo] }));
            }
            const entradas = campos.map((c) => {
                const i = el('input');
                i.type = 'number';
                i.title = c.campo || flag.key;
                i.placeholder = c.campo || '';
                i.value = valor === undefined ? c.defecto : (c.campo ? valor[c.campo] : valor);
                i.disabled = valor === undefined;
                fila.appendChild(i);
                return { ...c, i };
            });
            const aplicar = () => {
                const nueva = clonar(this.cosa());
                nueva.flags = nueva.flags || {};
                if (!check.checked) {
                    delete nueva.flags[flag.key];
                } else if (flag.valor === null) {
                    nueva.flags[flag.key] = true;
                } else if (flag.valor === 'numero') {
                    nueva.flags[flag.key] = Math.trunc(Number(entradas[0].i.value)) || 0;
                } else {
                    nueva.flags[flag.key] = {};
                    entradas.forEach((e) => {
                        nueva.flags[flag.key][e.campo] = Math.trunc(Number(e.i.value)) || 0;
                    });
                }
                entradas.forEach((e) => {
                    e.i.disabled = !check.checked;
                });
                this._cambiar(nueva, true);
            };
            check.addEventListener('change', aplicar);
            entradas.forEach((e) => e.i.addEventListener('change', aplicar));
            caja.appendChild(fila);
        });

    }

    // -----------------------------------------------------------------------
    // Guardar y comprobar
    // -----------------------------------------------------------------------

    async guardar() {
        if (!this.things) {
            return;
        }
        this.estado('guardando things.json...');
        const r = await this.api.saveThings(this.things);
        if (r.error) {
            this.estado('no se guardó: ' + r.error + (r.problems && r.problems.length
                ? ' — ' + r.problems.slice(0, 3).join('; ') : ''), true);
            return;
        }
        this.sucio = false;
        this.$('spr-guardar').classList.remove('active');
        this.$('spr-guardar').title = 'Guardar things.json (Ctrl+S): todo guardado';
        this.alGuardar(this.things, this.indice);
        this.estado('guardado things.json: ' + CATEGORY_NAMES.map((c) => r.counts[c] + ' ' +
            CATEGORIES[c].label.toLowerCase()).join(', '));
    }

    async coherencia() {
        if (this.sucio) {
            this.estado('guarda antes: la comprobación mira el archivo guardado', true);
            return;
        }
        const r = await this.api.checkAssets();
        if (r.error) {
            this.estado(r.error, true);
            return;
        }
        const partes = [];
        partes.push(r.faltan.length + ' objeto(s) de items.xml sin cosa' + (r.faltan.length ? ' (' + r.faltan.slice(0, 8).join(', ') + '…)' : ''));
        partes.push(r.sinDibujo.length + ' sin dibujo');
        partes.push(r.sobran.length + ' cosa(s) que no están en items.xml');
        partes.push(r.banderas.length + ' bandera(s) que no coinciden');
        this.estado('coherencia con items.xml: ' + partes.join(' · ') +
            (r.banderas.length ? ' — ' + r.banderas.slice(0, 3).join('; ') : ''), r.faltan.length > 0 || r.banderas.length > 0);
    }

    // -----------------------------------------------------------------------
    // El bucle
    // -----------------------------------------------------------------------

    _bucle() {
        const paso = () => {
            if (this.$('panel-sprites').classList.contains('active')) {
                this._pintarVista();
                this._pintarMiniaturas();
                this._pintarLienzosBiblioteca();
                if (this.versionPiezas !== this.provider.version) {
                    this.versionPiezas = this.provider.version;
                    this._repintarCanvasDePiezas();
                }
            }
            requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
    }

    /** Las hojas llegan tarde: cuando llegan, se repintan las piezas sin rehacer el DOM. */
    _repintarCanvasDePiezas() {
        const t = this.cosa();
        if (!t) {
            return;
        }
        this._pintarPiezas();
    }
}

export { flagInfo };
