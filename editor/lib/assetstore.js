'use strict';

/**
 * El almacén de assets: las hojas de sprites y `things.json`, en disco.
 *
 * Es la mitad «servidor» de la pestaña Sprites del editor, y la que usa la herramienta de
 * migración. El formato lo define `shared/js/assets.mjs` y se documenta en `docs/SPRITES.md`.
 *
 * DOS REGLAS QUE CONVIENE TENER PRESENTES:
 *
 *   - LOS SPRITES SON DE SOLO AÑADIR. Un sprite nuevo recibe el siguiente número libre y no se
 *     renumera nada nunca: las cosas guardan NÚMEROS de sprite, y renumerar desordenaría todos
 *     los objetos que los usan. Borrar un sprite lo deja transparente, no hueco.
 *   - TODO SE ESCRIBE EN UN TEMPORAL Y SE RENOMBRA. Una hoja a medio escribir es un PNG roto, y
 *     un PNG roto son mil sprites menos.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Png = require('./png');
const Assets = require('../../shared/js/assets.mjs');

const {
    SPRITE_SIZE, SHEET_COLUMNS, SHEET_ROWS, SPRITES_PER_SHEET, SPRITE_BYTES
} = Assets;

const SHEET_WIDTH = SHEET_COLUMNS * SPRITE_SIZE;
const SHEET_HEIGHT = SHEET_ROWS * SPRITE_SIZE;

function escribirAtomico(destino, contenido) {
    const temporal = destino + '.tmp';
    fs.writeFileSync(temporal, contenido);
    fs.renameSync(temporal, destino);
}

/** ¿Es transparente del todo? Un sprite así es el 0 y no se guarda. */
function isEmptySprite(rgba) {
    for (let i = 3; i < rgba.length; i += 4) {
        if (rgba[i] !== 0) {
            return false;
        }
    }
    return true;
}

function huella(rgba) {
    return crypto.createHash('sha1').update(rgba).digest('hex');
}

class AssetStore {
    /**
     * @param {string} directory la carpeta de assets del cliente (`client/jetyum/assets`)
     */
    constructor(directory) {
        this.directory = directory;
        this.spritesDirectory = path.join(directory, 'sprites');
        this.indexFile = path.join(this.spritesDirectory, 'index.json');
        this.thingsFile = path.join(directory, 'things.json');

        this.count = 0;
        this.sheets = new Map();
        this.dirtySheets = new Set();
        this.hashes = null;

        this._loadIndex();
        this.firma = this._firmaEnDisco();
    }

    /**
     * La «firma» de los archivos en disco: fecha y tamaño del índice y de cada hoja.
     *
     * Sirve para darse cuenta de que alguien los ha cambiado POR FUERA —un `git pull`, una copia
     * restaurada— mientras el editor estaba abierto. Este almacén guarda las hojas en memoria, y
     * sin esta comprobación seguiría trabajando con la copia vieja: un sprite importado se daba
     * por «ya existente» y no se escribía, y el objeto se quedaba sin dibujo.
     */
    _firmaEnDisco() {
        const partes = [];
        [this.indexFile].concat(fs.existsSync(this.spritesDirectory)
            ? fs.readdirSync(this.spritesDirectory).filter((f) => f.endsWith('.png')).sort()
                .map((f) => path.join(this.spritesDirectory, f))
            : []).forEach((archivo) => {
            if (fs.existsSync(archivo)) {
                const st = fs.statSync(archivo);
                partes.push(path.basename(archivo) + ':' + st.mtimeMs + ':' + st.size);
            }
        });
        return partes.join('|');
    }

    /** ¿Han cambiado los archivos desde que este almacén los leyó o los escribió? */
    cambiadoFuera() {
        return this._firmaEnDisco() !== this.firma;
    }

    _loadIndex() {
        if (!fs.existsSync(this.indexFile)) {
            this.count = 0;
            return;
        }
        const index = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
        if (index.format !== Assets.SPRITES_FORMAT) {
            throw new Error(this.indexFile + ' no es un índice ' + Assets.SPRITES_FORMAT);
        }
        if (index.size !== SPRITE_SIZE) {
            throw new Error('los sprites tienen que ser de ' + SPRITE_SIZE + 'x' + SPRITE_SIZE);
        }
        this.count = Number(index.count) || 0;
    }

    /** El índice tal y como se escribe: lo que necesita el cliente para pedir las hojas. */
    index() {
        const sheets = Math.ceil(this.count / SPRITES_PER_SHEET);
        const files = [];
        const revisions = [];
        for (let i = 0; i < sheets; i += 1) {
            files.push(Assets.sheetFileName(i));
            revisions.push(this._revision(Assets.sheetFileName(i)));
        }
        return {
            format: Assets.SPRITES_FORMAT,
            version: Assets.FORMAT_VERSION,
            size: SPRITE_SIZE,
            columns: SHEET_COLUMNS,
            rows: SHEET_ROWS,
            count: this.count,
            sheets: files,
            revisions
        };
    }

    /**
     * LA REVISIÓN DE UNA HOJA: un resumen corto de su contenido. El cliente la pone en la URL de
     * la hoja para que el navegador no use una copia vieja. Antes se usaba el número de sprites,
     * y ese número se repite cuando se reimporta (el arte HD reescribe la última hoja): el
     * navegador mezclaba un things.json nuevo con una hoja vieja y los objetos salían a trozos.
     */
    _revision(archivo) {
        try {
            const datos = fs.readFileSync(path.join(this.spritesDirectory, archivo));
            return crypto.createHash('sha1').update(datos).digest('hex').slice(0, 12);
        } catch (e) {
            return null;
        }
    }

    _sheet(numero) {
        let hoja = this.sheets.get(numero);
        if (hoja) {
            return hoja;
        }
        const archivo = path.join(this.spritesDirectory, Assets.sheetFileName(numero));
        if (fs.existsSync(archivo)) {
            const imagen = Png.decode(fs.readFileSync(archivo));
            if (imagen.width !== SHEET_WIDTH || imagen.height !== SHEET_HEIGHT) {
                throw new Error(archivo + ' mide ' + imagen.width + 'x' + imagen.height +
                    ' y una hoja mide ' + SHEET_WIDTH + 'x' + SHEET_HEIGHT);
            }
            hoja = imagen.data;
        } else {
            hoja = Buffer.alloc(SHEET_WIDTH * SHEET_HEIGHT * 4);
        }
        this.sheets.set(numero, hoja);
        return hoja;
    }

    _check(id) {
        const n = Number(id);
        if (!Number.isInteger(n) || n < 1 || n > this.count) {
            throw new Error('el sprite ' + id + ' no existe (hay ' + this.count + ')');
        }
        return n;
    }

    /** Los píxeles RGBA de un sprite: 32*32*4 bytes. */
    getSprite(id) {
        const n = this._check(id);
        const sitio = Assets.sheetOf(n);
        const hoja = this._sheet(sitio.sheet);
        const salida = Buffer.alloc(SPRITE_BYTES);
        for (let y = 0; y < SPRITE_SIZE; y += 1) {
            const origen = ((sitio.y + y) * SHEET_WIDTH + sitio.x) * 4;
            hoja.copy(salida, y * SPRITE_SIZE * 4, origen, origen + SPRITE_SIZE * 4);
        }
        return salida;
    }

    _write(id, rgba) {
        const sitio = Assets.sheetOf(id);
        const hoja = this._sheet(sitio.sheet);
        for (let y = 0; y < SPRITE_SIZE; y += 1) {
            const destino = ((sitio.y + y) * SHEET_WIDTH + sitio.x) * 4;
            rgba.copy(hoja, destino, y * SPRITE_SIZE * 4, (y + 1) * SPRITE_SIZE * 4);
        }
        this.dirtySheets.add(sitio.sheet);
    }

    _hashes() {
        if (!this.hashes) {
            this.hashes = new Map();
            for (let id = 1; id <= this.count; id += 1) {
                const rgba = this.getSprite(id);
                if (!isEmptySprite(rgba)) {
                    const h = huella(rgba);
                    if (!this.hashes.has(h)) {
                        this.hashes.set(h, id);
                    }
                }
            }
        }
        return this.hashes;
    }

    static toBuffer(sprite) {
        const buffer = Buffer.isBuffer(sprite) ? sprite : Buffer.from(String(sprite), 'base64');
        if (buffer.length !== SPRITE_BYTES) {
            throw new Error('un sprite son ' + SPRITE_BYTES + ' bytes RGBA (32x32) y llegaron ' +
                buffer.length);
        }
        return buffer;
    }

    /**
     * Añade sprites al final y devuelve sus números.
     *
     * Un sprite transparente del todo devuelve 0 sin ocupar sitio. Con `dedupe`, uno idéntico a
     * otro que ya existe devuelve el número del que existe: importar dos veces la misma hoja no
     * duplica nada.
     *
     * @param {Array<Buffer|string>} sprites RGBA de 32x32, en Buffer o en base64
     * @param {{dedupe?: boolean}} [opciones]
     * @returns {{ids: number[], added: number, reused: number}}
     */
    addSprites(sprites, opciones) {
        const dedupe = !opciones || opciones.dedupe !== false;
        const ids = [];
        let added = 0;
        let reused = 0;

        sprites.forEach((sprite) => {
            const rgba = AssetStore.toBuffer(sprite);
            if (isEmptySprite(rgba)) {
                ids.push(0);
                return;
            }
            const h = huella(rgba);
            if (dedupe && this._hashes().has(h)) {
                ids.push(this._hashes().get(h));
                reused += 1;
                return;
            }
            this.count += 1;
            this._write(this.count, rgba);
            if (this.hashes && !this.hashes.has(h)) {
                this.hashes.set(h, this.count);
            }
            ids.push(this.count);
            added += 1;
        });

        return { ids, added, reused };
    }

    /** Sustituye los píxeles de un sprite. Afecta a TODAS las cosas que lo usan. */
    setSprite(id, sprite) {
        const n = this._check(id);
        this._write(n, AssetStore.toBuffer(sprite));
        this.hashes = null;
    }

    /** Deja un sprite transparente. El número no se reutiliza. */
    clearSprite(id) {
        const n = this._check(id);
        this._write(n, Buffer.alloc(SPRITE_BYTES));
        this.hashes = null;
    }

    /** Escribe las hojas tocadas y el índice. */
    flush() {
        fs.mkdirSync(this.spritesDirectory, { recursive: true });
        this.dirtySheets.forEach((numero) => {
            const hoja = this._sheet(numero);
            escribirAtomico(path.join(this.spritesDirectory, Assets.sheetFileName(numero)),
                Png.encode(SHEET_WIDTH, SHEET_HEIGHT, hoja));
        });
        this.dirtySheets.clear();
        escribirAtomico(this.indexFile, JSON.stringify(this.index(), null, 4) + '\n');
        this.firma = this._firmaEnDisco();
    }

    // -----------------------------------------------------------------------
    // things.json
    // -----------------------------------------------------------------------

    readThings() {
        if (!fs.existsSync(this.thingsFile)) {
            return Assets.emptyThings();
        }
        return JSON.parse(fs.readFileSync(this.thingsFile, 'utf8'));
    }

    /**
     * Valida y escribe `things.json`. SI HAY PROBLEMAS NO SE ESCRIBE NADA: un archivo de cosas
     * con un sprite que no existe es un objeto que se dibuja mal en todos los clientes.
     *
     * @returns {{ok: boolean, problems: string[], data?: Object}}
     */
    writeThings(raw, opciones) {
        const { data, problems } = Assets.normalizeThings(raw, this.count);
        if (problems.length > 0) {
            return { ok: false, problems };
        }
        if (raw && raw._comment) {
            data._comment = raw._comment;
        }
        if (!opciones || !opciones.dryRun) {
            fs.mkdirSync(this.directory, { recursive: true });
            escribirAtomico(this.thingsFile, Assets.serializeThings(data));
        }
        return { ok: true, problems: [], data };
    }

    /** Qué cosas usan un sprite: lo que hay que avisar antes de cambiarlo. */
    usage(spriteId, things) {
        const datos = things || this.readThings();
        const usos = [];
        Assets.CATEGORY_NAMES.forEach((category) => {
            (datos[category] || []).forEach((thing) => {
                if ((thing.sprites || []).includes(Number(spriteId))) {
                    usos.push({ category, id: thing.id, name: thing.name || null });
                }
            });
        });
        return usos;
    }
}

module.exports = { AssetStore, isEmptySprite, SHEET_WIDTH, SHEET_HEIGHT };
