/**
 * El proveedor de sprites de VERDAD: lee `assets/things.json` y las hojas de 32x32.
 *
 * Es el lector del formato de `docs/SPRITES.md` (el equivalente a leer `Tibia.dat` y
 * `Tibia.spr`). Para cada objeto o aspecto compone su dibujo con las piezas de 32x32, en el
 * orden de Tibia, eligiendo el patrón (cantidad, posición, dirección, añadidos) y el fotograma
 * (animación) que tocan.
 *
 * LO QUE NO ESTÁ EN things.json, O NO TIENE NINGÚN SPRITE, SE PIDE AL RESPALDO si lo hay (el
 * editor tiene detrás el de procedimiento, rectángulos de color; el juego no tiene respaldo).
 *
 * LA INTERFAZ ES LA DE LOS OTROS PROVEEDORES, con dos campos más en lo que devuelve:
 *
 *   - `anchorX`: cuánto se corre el dibujo a la IZQUIERDA. Un objeto de 2x2 se apoya en su
 *     casilla (abajo-derecha) y sobresale hacia arriba Y HACIA LA IZQUIERDA.
 *   - `elevation`: cuánto sube lo que se ponga encima (mesas, cajas).
 */

import {
    SPRITE_SIZE,
    CATEGORY_NAMES,
    dimensionsOf,
    spriteIndex,
    frameAt,
    itemPattern,
    sheetOf,
    hasSprites
} from '../../../shared/js/assets.mjs';
import { paletteColor } from './sprites.js';
import { ampliarLienzo, modoValido } from './suavizado.js';

const S = SPRITE_SIZE;

/** De `hsl(...)` (lo que da la paleta) a [r, g, b]. */
export function hslToRgb(color) {
    const m = String(color).match(/hsl\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)/);
    if (!m) {
        const hex = String(color).match(/^#([0-9a-f]{6})$/i);
        if (hex) {
            const n = parseInt(hex[1], 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        return [255, 255, 255];
    }
    const h = Number(m[1]) / 360;
    const s = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const canal = (t) => {
        let x = t;
        if (x < 0) { x += 1; }
        if (x > 1) { x -= 1; }
        if (x < 1 / 6) { return p + (q - p) * 6 * x; }
        if (x < 1 / 2) { return q; }
        if (x < 2 / 3) { return p + (q - p) * (2 / 3 - x) * 6; }
        return p;
    };
    return [canal(h + 1 / 3), canal(h), canal(h - 1 / 3)].map((v) => Math.round(v * 255));
}

/**
 * Qué parte del cuerpo marca un píxel de la máscara de un aspecto (la capa 2 de Tibia):
 * amarillo cabeza, rojo cuerpo, verde piernas, azul pies.
 */
export function partOfMask(r, g, b) {
    if (r > 0 && g > 0 && b === 0) { return 'head'; }
    if (r > 0 && g === 0 && b === 0) { return 'body'; }
    if (r === 0 && g > 0 && b === 0) { return 'legs'; }
    if (r === 0 && g === 0 && b > 0) { return 'feet'; }
    return null;
}

function hayDocumento() {
    return typeof document !== 'undefined' && !!document.createElement;
}

function nuevoLienzo(ancho, alto) {
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    return lienzo;
}

export class AssetsProvider {
    /**
     * @param {Object} [opciones]
     * @param {Object} [opciones.respaldo] el proveedor al que se recurre
     * @param {string} [opciones.base] dónde están los assets (por defecto `/jetyum/assets/`)
     * @param {Object} [opciones.things] el things.json ya leído (el editor y las pruebas)
     */
    constructor(opciones) {
        const opts = opciones || {};
        this.name = 'assets';
        this.respaldo = opts.respaldo || null;
        this.base = opts.base || '/jetyum/assets/';

        this.porCategoria = {};
        CATEGORY_NAMES.forEach((categoria) => {
            this.porCategoria[categoria] = new Map();
        });

        this.indice = null;
        this.hojas = new Map();
        this.lienzos = new Map();
        this.fallos = [];
        this.version = 0;
        this.listo = false;
        /** El suavizado de los píxeles (js/suavizado.js); el editor los quiere tal cual. */
        this.suavizado = modoValido(opts.suavizado || 'nitido');
        /** Los lienzos que son la ampliación al doble de un dibujo de 32 px (se pintan a la mitad). */
        this.ampliados = new WeakSet();

        if (opts.things) {
            this.setThings(opts.things);
        }
        if (opts.indice) {
            this.indice = opts.indice;
        }

        this.ready = opts.cargar === false ? Promise.resolve(this) : this._cargar();
    }

    async _cargar() {
        if (typeof fetch === 'undefined') {
            return this;
        }
        try {
            const [things, indice] = await Promise.all([
                this.porCategoria.items.size > 0 ? null
                    : fetch(this.base + 'things.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
                fetch(this.base + 'sprites/index.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
            ]);
            if (things) {
                this.setThings(things);
            }
            if (indice) {
                this.indice = indice;
            }
            this.listo = true;
        } catch (error) {
            this.fallos.push(String(error && error.message ? error.message : error));
        }
        return this;
    }

    /** Sustituye las cosas (el editor lo llama al editar) y tira la caché de dibujos. */
    setThings(things) {
        CATEGORY_NAMES.forEach((categoria) => {
            const mapa = new Map();
            (things[categoria] || []).forEach((cosa) => mapa.set(Number(cosa.id), cosa));
            this.porCategoria[categoria] = mapa;
        });
        this.invalidar();
    }

    /** Cambia una sola cosa. */
    setThing(categoria, cosa) {
        this.porCategoria[categoria].set(Number(cosa.id), cosa);
        this.invalidar();
    }

    invalidar() {
        this.lienzos.clear();
        this.version += 1;
    }

    /** Cambia el suavizado de los píxeles (nitido, pixel, suave) y rehace los dibujos. */
    setSuavizado(modo) {
        const nuevo = modoValido(modo);
        if (nuevo !== this.suavizado) {
            this.suavizado = nuevo;
            this.invalidar();
        }
        return this.suavizado;
    }

    /**
     * El dibujo de una cosa con el suavizado puesto: un lienzo del doble (que se pinta a la mitad)
     * o el mismo si no hay que ampliarlo (el modo nítido, o el arte HD, que ya tiene la resolución).
     */
    suavizar(cosa, lienzo) {
        if (!lienzo || this.suavizado === 'nitido' || (cosa && cosa.flags && cosa.flags.hd)) {
            return lienzo;
        }
        const grande = ampliarLienzo(lienzo, this.suavizado);
        if (!grande) {
            return lienzo;
        }
        this.ampliados.add(grande);
        return grande;
    }

    /** ¿Este lienzo se pinta a media escala? (arte HD, o un dibujo ampliado por el suavizado) */
    mediaEscala(cosa, lienzo) {
        return !!((cosa && cosa.flags && cosa.flags.hd) || (lienzo && this.ampliados.has(lienzo)));
    }

    /**
     * Vuelve a pedir las hojas de sprites (al importar o cambiar un sprite en el editor).
     * El parámetro de la URL salta la caché del navegador.
     */
    recargarHojas(indice) {
        if (indice) {
            this.indice = indice;
        }
        this.hojas.clear();
        this.invalidar();
    }

    thing(categoria, id) {
        return this.porCategoria[categoria] ? this.porCategoria[categoria].get(Number(id)) || null : null;
    }

    _hoja(numero) {
        let hoja = this.hojas.get(numero);
        if (hoja) {
            return hoja.listo ? hoja.imagen : null;
        }
        hoja = { listo: false, imagen: null, pedida: false };
        this.hojas.set(numero, hoja);
        if (typeof Image === 'undefined' || !this.indice || !this.indice.sheets ||
            !this.indice.sheets[numero]) {
            return null;
        }
        const imagen = new Image();
        hoja.pedida = true;
        imagen.onload = () => {
            hoja.listo = true;
            hoja.pedida = false;
            hoja.imagen = imagen;
            this.invalidar();
        };
        imagen.onerror = () => {
            hoja.pedida = false;
            this.fallos.push('no se pudo cargar ' + this.indice.sheets[numero]);
        };
        imagen.src = this.base + 'sprites/' + this.indice.sheets[numero] + '?v=' + this.indice.count +
            '-' + this.version;
        return null;
    }

    /**
     * ¿El dibujo de este objeto ya es el DEFINITIVO? Mientras no han llegado las cosas o sus hojas,
     * `get` devuelve el de respaldo, y quien copia el dibujo (los paneles) tiene que volver a
     * pedirlo luego en vez de quedarse con el provisional.
     */
    dibujoListo(typeId) {
        if (!this.listo) {
            return false;
        }
        const cosa = this.thing('items', typeId);
        return !cosa || !hasSprites(cosa) || this._hojasListas(cosa);
    }

    /** Cuántas hojas de sprites se han pedido y aún no han llegado (la pantalla de carga). */
    hojasPendientes() {
        let n = 0;
        this.hojas.forEach((hoja) => {
            if (hoja.pedida) {
                n += 1;
            }
        });
        return n;
    }

    /** ¿Están cargadas todas las hojas que necesita esta cosa? */
    _hojasListas(cosa) {
        let todas = true;
        cosa.sprites.forEach((id) => {
            if (id > 0 && !this._hoja(sheetOf(id).sheet)) {
                todas = false;
            }
        });
        return todas;
    }

    /** Dibuja un sprite suelto en un contexto. */
    drawSprite(ctx, id, x, y) {
        if (!id) {
            return false;
        }
        const sitio = sheetOf(id);
        const hoja = this._hoja(sitio.sheet);
        if (!hoja) {
            return false;
        }
        ctx.drawImage(hoja, sitio.x, sitio.y, S, S, x, y, S, S);
        return true;
    }

    /** Un sprite suelto en su propio lienzo de 32x32 (la biblioteca del editor). */
    spriteCanvas(id) {
        if (!hayDocumento()) {
            return null;
        }
        const clave = 's:' + id;
        let lienzo = this.lienzos.get(clave);
        if (lienzo) {
            return lienzo;
        }
        lienzo = nuevoLienzo(S, S);
        if (!this.drawSprite(lienzo.getContext('2d'), id, 0, 0)) {
            return null;
        }
        this.lienzos.set(clave, lienzo);
        return lienzo;
    }

    /** Las piezas de una capa y un patrón, en un contexto de W*32 x H*32. */
    _pintarCapa(ctx, cosa, capa, px, py, pz, fotograma) {
        const d = dimensionsOf(cosa);
        for (let h = 0; h < d.height; h += 1) {
            for (let w = 0; w < d.width; w += 1) {
                const id = cosa.sprites[spriteIndex(cosa, w, h, capa, px, py, pz, fotograma)];
                if (id > 0) {
                    this.drawSprite(ctx, id, (d.width - 1 - w) * S, (d.height - 1 - h) * S);
                }
            }
        }
    }

    /**
     * Compone el dibujo de una cosa.
     *
     * @param {Object} cosa
     * @param {{px:number, py:number, pz:number, frame:number, colores?:Object, addons?:number}} sel
     */
    compose(cosa, sel) {
        if (!hayDocumento() || !hasSprites(cosa) || !this._hojasListas(cosa)) {
            return null;
        }
        const d = dimensionsOf(cosa);
        const px = Math.min(sel.px || 0, d.patternX - 1);
        const pz = Math.min(sel.pz || 0, d.patternZ - 1);
        const fotograma = Math.min(sel.frame || 0, d.frames - 1);
        const lienzo = nuevoLienzo(d.width * S, d.height * S);
        const ctx = lienzo.getContext('2d');

        // Los patrones Y que se pintan: el pedido, o en un aspecto el cuerpo y sus añadidos.
        const capasY = [Math.min(sel.py || 0, d.patternY - 1)];
        if (sel.addons !== undefined) {
            capasY.length = 0;
            capasY.push(0);
            if ((sel.addons & 1) && d.patternY > 1) { capasY.push(1); }
            if ((sel.addons & 2) && d.patternY > 2) { capasY.push(2); }
        }

        capasY.forEach((py) => {
            if (sel.colores && d.layers >= 2) {
                this._pintarConMascara(ctx, cosa, px, py, pz, fotograma, sel.colores);
            } else {
                for (let capa = 0; capa < d.layers; capa += 1) {
                    this._pintarCapa(ctx, cosa, capa, px, py, pz, fotograma);
                }
            }
        });
        return lienzo;
    }

    /**
     * Un aspecto con colores: la capa 0 es el dibujo y la 1 la MÁSCARA. Cada píxel de la máscara
     * dice qué parte del cuerpo es, y el dibujo se multiplica por el color de esa parte. Es como
     * lo hace el cliente de Tibia, y es lo que permite que un mismo dibujo sirva para todos los
     * colores sin guardarlo 133^4 veces.
     */
    _pintarConMascara(ctx, cosa, px, py, pz, fotograma, colores) {
        const d = dimensionsOf(cosa);
        const base = nuevoLienzo(d.width * S, d.height * S);
        const mascara = nuevoLienzo(d.width * S, d.height * S);
        this._pintarCapa(base.getContext('2d'), cosa, 0, px, py, pz, fotograma);
        this._pintarCapa(mascara.getContext('2d'), cosa, 1, px, py, pz, fotograma);

        const a = base.getContext('2d').getImageData(0, 0, base.width, base.height);
        const m = mascara.getContext('2d').getImageData(0, 0, base.width, base.height).data;
        for (let i = 0; i < a.data.length; i += 4) {
            if (m[i + 3] === 0) {
                continue;
            }
            const parte = partOfMask(m[i], m[i + 1], m[i + 2]);
            if (!parte || !colores[parte]) {
                continue;
            }
            const c = colores[parte];
            a.data[i] = (a.data[i] * c[0]) / 255;
            a.data[i + 1] = (a.data[i + 1] * c[1]) / 255;
            a.data[i + 2] = (a.data[i + 2] * c[2]) / 255;
        }
        base.getContext('2d').putImageData(a, 0, 0);
        ctx.drawImage(base, 0, 0);
    }

    _resultado(cosa, lienzo) {
        const flags = cosa.flags || {};
        const offset = flags.offset || { x: 0, y: 0 };
        // El ARTE HD (docs/ARTE-HD.md) es de 64 px por casilla: se pinta a media escala, así que
        // mide (y se ancla) la mitad. Lo que lo dibuja usa `drawW` y `drawH`.
        const hd = this.mediaEscala(cosa, lienzo);
        const k = hd ? 0.5 : 1;
        const ancho = lienzo.width * k;
        const alto = lienzo.height * k;
        return {
            canvas: lienzo,
            width: ancho,
            drawW: ancho,
            drawH: alto,
            hd,
            anchorX: ancho - S + (offset.x || 0),
            anchorY: alto + (offset.y || 0),
            elevation: Number(flags.elevation) || 0,
            thing: cosa
        };
    }

    /**
     * El dibujo de un objeto.
     *
     * @param {number} typeId
     * @param {number} [ahora] el reloj, para la animación
     * @param {{x?:number, y?:number, z?:number, count?:number}} [contexto] la operación de dibujo
     */
    get(typeId, ahora, contexto) {
        const cosa = this.thing('items', typeId);
        if (!cosa || !hasSprites(cosa)) {
            return this.respaldo ? this.respaldo.get(typeId, ahora) : null;
        }
        const ctx = contexto || {};
        const patron = itemPattern(cosa, ctx);
        const desfase = ((Number(ctx.x) || 0) * 7 + (Number(ctx.y) || 0) * 13) * 37;
        const fotograma = ahora === undefined ? 0 : frameAt(cosa, ahora, desfase);
        const clave = 'i:' + typeId + ':' + patron.x + ':' + patron.y + ':' + patron.z + ':' + fotograma;

        let lienzo = this.lienzos.get(clave);
        if (!lienzo) {
            lienzo = this.compose(cosa, { px: patron.x, py: patron.y, pz: patron.z, frame: fotograma });
            if (!lienzo) {
                return this.respaldo ? this.respaldo.get(typeId, ahora) : null;
            }
            lienzo = this.suavizar(cosa, lienzo);
            this.lienzos.set(clave, lienzo);
        }
        return this._resultado(cosa, lienzo);
    }

    /**
     * El dibujo de una criatura, por su `lookType`: dirección en el patrón X, añadidos en el Y,
     * fotograma 0 quieta y 1..n andando, y los cuatro colores del aspecto.
     */
    getCreature(op, ahora) {
        const outfit = (op && op.outfit) || {};
        const cosa = this.thing('outfits', outfit.lookType);
        if (!cosa || !hasSprites(cosa)) {
            return this.respaldo && this.respaldo.getCreature ? this.respaldo.getCreature(op, ahora) : null;
        }
        const d = dimensionsOf(cosa);
        const px = (Number(op.direction) || 0) % d.patternX;
        let fotograma = 0;
        if (op.moving && d.frames > 1 && ahora !== undefined) {
            const pasos = d.frames - 1;
            fotograma = 1 + Math.floor((ahora + (Number(op.id) || 0) * 53) / 120) % pasos;
        } else if (d.frames > 1 && (cosa.flags || {}).animateAlways && ahora !== undefined) {
            fotograma = frameAt(cosa, ahora);
        }
        const colores = d.layers >= 2 ? {
            head: hslToRgb(paletteColor(outfit.head)),
            body: hslToRgb(paletteColor(outfit.body)),
            legs: hslToRgb(paletteColor(outfit.legs)),
            feet: hslToRgb(paletteColor(outfit.feet))
        } : null;
        const addons = Number(outfit.addons) || 0;
        const clave = 'o:' + outfit.lookType + ':' + px + ':' + fotograma + ':' + addons + ':' +
            (colores ? [outfit.head, outfit.body, outfit.legs, outfit.feet].join(',') : '');

        let lienzo = this.lienzos.get(clave);
        if (!lienzo) {
            lienzo = this.compose(cosa, { px, py: 0, pz: 0, frame: fotograma, colores, addons });
            if (!lienzo) {
                return this.respaldo && this.respaldo.getCreature ? this.respaldo.getCreature(op, ahora) : null;
            }
            lienzo = this.suavizar(cosa, lienzo);
            this.lienzos.set(clave, lienzo);
        }
        return this._resultado(cosa, lienzo);
    }

    describe(typeId) {
        const cosa = this.thing('items', typeId);
        return cosa && cosa.name ? cosa.name : (this.respaldo && this.respaldo.describe
            ? this.respaldo.describe(typeId) : 'item ' + typeId);
    }

    get size() {
        return this.lienzos.size;
    }

    get estado() {
        return {
            objetos: this.porCategoria.items.size,
            aspectos: this.porCategoria.outfits.size,
            sprites: this.indice ? this.indice.count : 0,
            hojas: this.hojas.size,
            lienzos: this.lienzos.size,
            fallos: this.fallos.slice(),
            respaldo: this.respaldo ? this.respaldo.estado || this.respaldo.name : null
        };
    }
}
