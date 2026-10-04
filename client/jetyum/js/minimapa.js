/**
 * EL MINIMAPA de la barra lateral.
 *
 * Como el de Tibia, enseña lo que has VISTO: cada casilla que llega del motor se apunta con su
 * color y se queda aunque salga de la vista, así que el minimapa se va rellenando al explorar.
 *
 * El color es el de Tibia: cada cosa del pack trae `minimap` en sus banderas (de 0 a 215, una
 * paleta de 6×6×6). Se usa el de la cosa más alta de la casilla que tenga uno; si ninguna lo
 * tiene, un gris para el suelo pisable. Tu posición es la cruz blanca del centro.
 */

/** Color de la paleta de 216 de Tibia. */
export function colorMinimapa(indice) {
    const c = Number(indice) || 0;
    const r = Math.floor(c / 36) % 6 * 51;
    const g = Math.floor(c / 6) % 6 * 51;
    const b = c % 6 * 51;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

const ZOOMS = [1, 2, 3, 4, 6];

/**
 * @param {Object} opciones
 * @param {HTMLCanvasElement} opciones.lienzo
 * @param {Function} opciones.colorDe (itemId) => índice de minimapa, o 0
 */
export function crearMinimapa(opciones) {
    const { lienzo, colorDe } = opciones;
    const ctx = lienzo ? lienzo.getContext('2d') : null;
    const memoria = new Map();
    let zoom = 2;
    let desvioPlanta = 0;

    function colorDeCasilla(tile) {
        for (let i = tile.items.length - 1; i >= 0; i -= 1) {
            const c = colorDe(tile.items[i].id);
            if (c > 0) {
                return colorMinimapa(c);
            }
        }
        const suelo = tile.ground ? colorDe(tile.ground) : 0;
        if (suelo > 0) {
            return colorMinimapa(suelo);
        }
        return tile.ground ? '#4a4a4a' : null;
    }

    /** Apunta lo que se ve ahora (se llama cada poco, no en cada fotograma). */
    function recordar(mundo) {
        mundo.tiles.forEach((tile) => {
            const color = colorDeCasilla(tile);
            if (color) {
                memoria.set(tile.x + ',' + tile.y + ',' + tile.z, color);
            }
        });
    }

    function dibujar(centro) {
        if (!ctx || !centro) {
            return;
        }
        const z = centro.z + desvioPlanta;
        const ancho = lienzo.width;
        const alto = lienzo.height;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ancho, alto);
        const radioX = Math.ceil(ancho / zoom / 2);
        const radioY = Math.ceil(alto / zoom / 2);
        const cx = Math.round(centro.x);
        const cy = Math.round(centro.y);
        for (let dy = -radioY; dy <= radioY; dy += 1) {
            for (let dx = -radioX; dx <= radioX; dx += 1) {
                const color = memoria.get((cx + dx) + ',' + (cy + dy) + ',' + z);
                if (color) {
                    ctx.fillStyle = color;
                    ctx.fillRect(Math.floor(ancho / 2 + dx * zoom - zoom / 2), Math.floor(alto / 2 + dy * zoom - zoom / 2), zoom, zoom);
                }
            }
        }
        // Tú: la cruz blanca del centro (sólo en tu planta).
        if (desvioPlanta === 0) {
            const mx = Math.floor(ancho / 2);
            const my = Math.floor(alto / 2);
            ctx.fillStyle = '#fff';
            ctx.fillRect(mx - 2, my, 5, 1);
            ctx.fillRect(mx, my - 2, 1, 5);
        }
    }

    /**
     * La casilla del mundo bajo un punto del minimapa (px, py en píxeles del lienzo), con el
     * jugador en el centro. Para el clic: ir andando hasta allí.
     */
    function casillaEn(px, py, centro) {
        if (!lienzo || !centro) {
            return null;
        }
        return {
            x: Math.round(centro.x) + Math.round((px - lienzo.width / 2) / zoom),
            y: Math.round(centro.y) + Math.round((py - lienzo.height / 2) / zoom),
            z: centro.z + desvioPlanta
        };
    }

    return {
        recordar,
        dibujar,
        casillaEn,
        acercar() {
            zoom = ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)];
        },
        alejar() {
            zoom = ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)];
        },
        /** Ver otra planta (−1 arriba, +1 abajo); `null` vuelve a la tuya. */
        cambiarPlanta(paso) {
            desvioPlanta = paso === null ? 0 : Math.max(-7, Math.min(7, desvioPlanta + paso));
            return desvioPlanta;
        },
        get desvioPlanta() {
            return desvioPlanta;
        },
        olvidar() {
            memoria.clear();
            desvioPlanta = 0;
        },
        get casillas() {
            return memoria.size;
        }
    };
}
