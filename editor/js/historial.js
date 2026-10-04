/**
 * DESHACER Y REHACER (Ctrl+Z / Ctrl+Y), como en RME.
 *
 * FUNCIONA POR DIFERENCIAS, NO POR COMANDOS. Cada herramienta del editor cambia el mapa a su
 * manera —pintar, borrar, arrastrar, colocar un compuesto, pegar...— y escribir el «deshacer»
 * de cada una sería escribir cada herramienta dos veces, con el riesgo de que una se olvide. En
 * vez de eso el historial guarda una FOTO del mapa (cada casilla y cada lista como texto) y, al
 * terminar cada acción, compara: lo que cambió es la entrada del historial, con su antes y su
 * después. Así cualquier herramienta, presente o futura, se puede deshacer sin saberlo.
 *
 * Lo que cuesta es serializar las casillas explícitas en cada acción. Con los mapas de este
 * proyecto (miles de casillas) son pocos milisegundos; se mide en `tools/test-mapa.mjs`.
 */

/** Las listas del mapa que no son casillas y también se deshacen. */
export const LISTAS = ['spawns', 'npcs', 'compuestos', 'waypoints', 'towns', 'houses'];

/** Qué bandera de «sin guardar» corresponde a cada lista. */
const SUCIA = {
    spawns: 'spawnsSucios',
    npcs: 'npcsSucios',
    compuestos: 'compuestosSucios',
    waypoints: 'extrasSucios',
    towns: 'extrasSucios',
    houses: 'extrasSucios'
};

function textoDeCasilla(tile) {
    if (!tile) {
        return null;
    }
    return JSON.stringify({ ground: tile.ground, items: tile.items, flags: tile.flags, houseId: tile.houseId || 0 });
}

export class Historial {
    /**
     * @param {Object} mapa un EditorMap
     * @param {number} [limite] cuántas acciones se recuerdan
     */
    constructor(mapa, limite) {
        this.mapa = mapa;
        this.limite = limite || 200;
        this.pasado = [];
        this.futuro = [];
        this.base = this._foto();
    }

    _foto() {
        const casillas = new Map();
        this.mapa.tiles.forEach((tile, clave) => {
            casillas.set(clave, textoDeCasilla(tile));
        });
        const listas = {};
        LISTAS.forEach((nombre) => {
            listas[nombre] = JSON.stringify(this.mapa[nombre] === undefined ? null : this.mapa[nombre]);
        });
        return { casillas, listas };
    }

    /**
     * Cierra una acción: si el mapa cambió desde la última, la apunta.
     *
     * @param {string} nombre lo que se enseña en «Deshacer ...»
     * @returns {boolean} si había algo que apuntar
     */
    confirmar(nombre) {
        const ahora = this._foto();
        const casillas = [];
        const claves = new Set([...this.base.casillas.keys(), ...ahora.casillas.keys()]);
        claves.forEach((clave) => {
            const antes = this.base.casillas.has(clave) ? this.base.casillas.get(clave) : null;
            const despues = ahora.casillas.has(clave) ? ahora.casillas.get(clave) : null;
            if (antes !== despues) {
                casillas.push({ clave, antes, despues });
            }
        });
        const listas = [];
        LISTAS.forEach((lista) => {
            if (this.base.listas[lista] !== ahora.listas[lista]) {
                listas.push({ lista, antes: this.base.listas[lista], despues: ahora.listas[lista] });
            }
        });
        this.base = ahora;
        if (casillas.length === 0 && listas.length === 0) {
            return false;
        }
        this.pasado.push({ nombre: nombre || 'cambio', casillas, listas });
        if (this.pasado.length > this.limite) {
            this.pasado.shift();
        }
        this.futuro.length = 0;
        return true;
    }

    _aplicar(entrada, lado) {
        entrada.casillas.forEach((c) => {
            const texto = c[lado];
            const [x, y, z] = c.clave.split(',').map(Number);
            if (texto === null) {
                this.mapa.tiles.delete(c.clave);
            } else {
                const datos = JSON.parse(texto);
                this.mapa.tiles.set(c.clave, {
                    x, y, z,
                    ground: datos.ground,
                    items: datos.items,
                    flags: datos.flags,
                    houseId: datos.houseId || 0
                });
            }
            this.mapa.markDirty(x, y, z);
        });
        entrada.listas.forEach((l) => {
            this.mapa[l.lista] = JSON.parse(l[lado]);
            this.mapa[SUCIA[l.lista]] = true;
        });
        // Lo elegido puede haber dejado de existir: se suelta en vez de apuntar a la nada.
        this.mapa.objeto = null;
        this.mapa.seleccion = null;
        if (this.mapa.compuestoSel !== null && this.mapa.compuestoPorUid &&
            !this.mapa.compuestoPorUid(this.mapa.compuestoSel)) {
            this.mapa.compuestoSel = null;
        }
        this.base = this._foto();
    }

    /** @returns {string|null} el nombre de lo deshecho */
    deshacer() {
        // Lo que esté a medias se cierra antes, para no deshacer la acción anterior por error.
        this.confirmar('cambio');
        const entrada = this.pasado.pop();
        if (!entrada) {
            return null;
        }
        this._aplicar(entrada, 'antes');
        this.futuro.push(entrada);
        return entrada.nombre;
    }

    /** @returns {string|null} el nombre de lo rehecho */
    rehacer() {
        const entrada = this.futuro.pop();
        if (!entrada) {
            return null;
        }
        this._aplicar(entrada, 'despues');
        this.pasado.push(entrada);
        return entrada.nombre;
    }

    get puedeDeshacer() {
        return this.pasado.length > 0;
    }

    get puedeRehacer() {
        return this.futuro.length > 0;
    }

    /** Tras guardar o abrir otro mapa, la foto de partida es el estado actual. */
    reiniciar() {
        this.pasado.length = 0;
        this.futuro.length = 0;
        this.base = this._foto();
    }
}
