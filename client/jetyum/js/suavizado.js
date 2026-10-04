/**
 * EL SUAVIZADO DE LOS PÍXELES (Opciones > Suavizado).
 *
 * El mundo se pinta a 2 píxeles por píxel lógico (`renderer.resolucion`): un sprite del pack, de
 * 32 px por casilla, se amplía al doble y luego la imagen entera se ajusta a la ventana. Cómo se
 * hace esa ampliación es lo que cambia este ajuste:
 *
 *   nitido  el píxel tal cual (vecino más próximo): cuadrados duros, escalones en las diagonales
 *   pixel   Scale2x (EPX): redondea las diagonales y las curvas SIN emborronar; sigue siendo pixel
 *           art, con el contorno limpio. Es el de por defecto
 *   suave   interpolación bilineal: todo se funde, sin escalones ni contornos duros (como el
 *           «smooth» de OTClient)
 *
 * En `pixel` y `suave`, la imagen del mundo también se ajusta a la ventana con filtro: con un zoom
 * no entero (1,56, por ejemplo) unas filas de píxeles salían más gruesas que otras.
 *
 * El arte HD (64 px por casilla) no se amplía: ya tiene la resolución del lienzo.
 */

export const MODOS_SUAVIZADO = ['nitido', 'pixel', 'suave'];
export const SUAVIZADO_POR_DEFECTO = 'pixel';

export function modoValido(modo) {
    return MODOS_SUAVIZADO.includes(modo) ? modo : SUAVIZADO_POR_DEFECTO;
}

/** ¿Dos píxeles (RGBA, en `d` a partir de `a` y `b`) son iguales? */
function iguales(d, a, b) {
    return d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2] && d[a + 3] === d[b + 3];
}

/**
 * Scale2x sobre píxeles RGBA: cada píxel se vuelve 2x2, y una esquina toma el color de sus dos
 * vecinos cuando coinciden (y no forman una línea recta). Los bordes repiten el píxel del borde,
 * así que los suelos siguen encajando sin juntas.
 *
 * @returns {Uint8ClampedArray} de (2w x 2h) píxeles
 */
export function scale2xDatos(src, w, h) {
    const out = new Uint8ClampedArray(w * h * 16);
    const at = (x, y) => (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4;
    const poner = (x, y, desde) => {
        const o = (y * w * 2 + x) * 4;
        out[o] = src[desde];
        out[o + 1] = src[desde + 1];
        out[o + 2] = src[desde + 2];
        out[o + 3] = src[desde + 3];
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const p = at(x, y);
            const a = at(x, y - 1);
            const b = at(x + 1, y);
            const c = at(x - 1, y);
            const d = at(x, y + 1);
            let e0 = p;
            let e1 = p;
            let e2 = p;
            let e3 = p;
            if (!iguales(src, a, d) && !iguales(src, c, b)) {
                if (iguales(src, c, a)) { e0 = a; }
                if (iguales(src, a, b)) { e1 = b; }
                if (iguales(src, d, c)) { e2 = c; }
                if (iguales(src, b, d)) { e3 = d; }
            }
            poner(2 * x, 2 * y, e0);
            poner(2 * x + 1, 2 * y, e1);
            poner(2 * x, 2 * y + 1, e2);
            poner(2 * x + 1, 2 * y + 1, e3);
        }
    }
    return out;
}

/**
 * Ampliación bilineal al doble, con el alfa premultiplicado (el borde de un objeto se funde con lo
 * de detrás, sin halo oscuro) y los bordes repetidos (los suelos encajan sin juntas).
 *
 * @returns {Uint8ClampedArray} de (2w x 2h) píxeles
 */
export function bilineal2xDatos(src, w, h) {
    const W = w * 2;
    const H = h * 2;
    const out = new Uint8ClampedArray(W * H * 4);
    const pre = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const al = src[i * 4 + 3] / 255;
        pre[i * 4] = src[i * 4] * al;
        pre[i * 4 + 1] = src[i * 4 + 1] * al;
        pre[i * 4 + 2] = src[i * 4 + 2] * al;
        pre[i * 4 + 3] = src[i * 4 + 3];
    }
    const lim = (v, n) => Math.min(n - 1, Math.max(0, v));
    for (let oy = 0; oy < H; oy++) {
        const sy = (oy + 0.5) / 2 - 0.5;
        const y0 = Math.floor(sy);
        const fy = sy - y0;
        const ya = lim(y0, h);
        const yb = lim(y0 + 1, h);
        for (let ox = 0; ox < W; ox++) {
            const sx = (ox + 0.5) / 2 - 0.5;
            const x0 = Math.floor(sx);
            const fx = sx - x0;
            const xa = lim(x0, w);
            const xb = lim(x0 + 1, w);
            const i00 = (ya * w + xa) * 4;
            const i10 = (ya * w + xb) * 4;
            const i01 = (yb * w + xa) * 4;
            const i11 = (yb * w + xb) * 4;
            const v = [0, 0, 0, 0];
            for (let k = 0; k < 4; k++) {
                const arriba = pre[i00 + k] * (1 - fx) + pre[i10 + k] * fx;
                const abajo = pre[i01 + k] * (1 - fx) + pre[i11 + k] * fx;
                v[k] = arriba * (1 - fy) + abajo * fy;
            }
            const o = (oy * W + ox) * 4;
            const al = v[3] / 255;
            out[o] = al > 0 ? v[0] / al : 0;
            out[o + 1] = al > 0 ? v[1] / al : 0;
            out[o + 2] = al > 0 ? v[2] / al : 0;
            out[o + 3] = v[3];
        }
    }
    return out;
}

/**
 * Un lienzo ampliado al doble según el modo, o null si el modo no amplía (`nitido`).
 *
 * @param {HTMLCanvasElement} lienzo
 * @param {string} modo
 */
export function ampliarLienzo(lienzo, modo) {
    if (modo !== 'pixel' && modo !== 'suave') {
        return null;
    }
    const w = lienzo.width;
    const h = lienzo.height;
    const datos = lienzo.getContext('2d').getImageData(0, 0, w, h).data;
    const salida = modo === 'pixel' ? scale2xDatos(datos, w, h) : bilineal2xDatos(datos, w, h);
    const grande = document.createElement('canvas');
    grande.width = w * 2;
    grande.height = h * 2;
    grande.getContext('2d').putImageData(new ImageData(salida, w * 2, h * 2), 0, 0);
    return grande;
}
