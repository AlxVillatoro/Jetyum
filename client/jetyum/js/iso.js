/**
 * LA VISTA ISOMÉTRICA (PROTOTIPO): el mismo mundo, el mismo motor y los mismos sprites, dibujados
 * en una rejilla de rombos como en Habbo. Se entra con `?iso=1` en la URL.
 *
 * Es para VER cómo quedaría antes de decidir si el proyecto cambia de proyección: no es la vista
 * definitiva, y el arte no está hecho para ella. Lo que hace con el arte que hay:
 *
 *   - El SUELO se proyecta de verdad: la textura de 32x32 se deforma al rombo de 64x32, así que
 *     se ven las juntas de las casillas en diagonal y la hierba, el agua y el adoquín siguen
 *     siendo los suyos.
 *   - Lo que está DE PIE (criaturas, objetos, muros, árboles) se pinta como un cartel vertical
 *     centrado en su casilla, con una SOMBRA elíptica debajo, que es lo que lo asienta en el suelo.
 *     Un muro de Tibia está dibujado para verse de frente, no de esquina: aquí se verá «plano».
 *   - Las plantas de abajo se dibujan más abajo en la pantalla (el eje Z del isométrico).
 *
 * Fórmulas (una casilla del mundo es un rombo de `ANCHO_ROMBO` x `ALTO_ROMBO`):
 *
 *     pantallaX = (x - y) * ANCHO_ROMBO / 2
 *     pantallaY = (x + y) * ALTO_ROMBO / 2 + (z - zCamara) * ALTO_PLANTA
 *
 * `IsoCamera` sustituye a `Camera` (la lista de dibujo ya va por diagonales x+y, que es justo el
 * orden de profundidad del isométrico) e `IsoRenderer` a `Renderer` (sólo cambia cómo se pinta
 * cada operación; etiquetas, noche, efectos y textos son los de siempre).
 */

import { Camera, TILE_PIXELS as TILE } from './camera.js';
import { Renderer } from './renderer.js';
import { DRAW as DRAW_KINDS } from './drawlist.js';

/** El rombo de una casilla, en píxeles lógicos: proporción 2:1 como Habbo. */
export const ANCHO_ROMBO = 64;
export const ALTO_ROMBO = 32;
/** Cuánto baja en pantalla cada planta por debajo de la cámara. */
export const ALTO_PLANTA = 40;

const HW = ANCHO_ROMBO / 2;
const HH = ALTO_ROMBO / 2;

export class IsoCamera extends Camera {
    /**
     * La ESQUINA NORTE (la de arriba) del rombo de la casilla (x, y). Para un punto fraccionario
     * (una criatura andando) es la proyección de ese punto.
     */
    worldToScreen(x, y, z) {
        const dz = (z === undefined ? this.z : z) - this.z;
        const dx = x - this.centerX;
        const dy = y - this.centerY;
        return {
            x: (dx - dy) * HW + this.width / 2,
            y: (dx + dy) * HH + this.height / 2 + dz * ALTO_PLANTA
        };
    }

    /** El inverso: qué casilla hay bajo un punto de la pantalla, en la planta `z`. */
    screenToWorld(px, py, z) {
        const floor = z === undefined ? this.z : z;
        const X = (px - this.width / 2) / HW;
        const Y = (py - this.height / 2 - (floor - this.z) * ALTO_PLANTA) / HH;
        return {
            x: Math.floor((X + Y) / 2 + this.centerX),
            y: Math.floor((Y - X) / 2 + this.centerY),
            z: floor
        };
    }

    /**
     * Cuántas casillas hay que recorrer: el rectángulo de la pantalla cabe en un rombo del mundo,
     * así que en x y en y hace falta el mismo margen, la mitad de la suma de ambos ejes.
     */
    _lado() {
        return Math.ceil((this.width / HW + this.height / HH) / 2) + 4;
    }

    tilesAcross() {
        return this._lado();
    }

    tilesDown() {
        return this._lado();
    }

    visibleRect(z) {
        const half = this._lado() / 2;
        const dz = (z === undefined ? this.z : z) - this.z;
        // Las plantas de abajo se ven más abajo: hay que mirar un poco más al norte para llenar
        // el borde de arriba.
        const extra = Math.ceil(Math.abs(dz) * ALTO_PLANTA / ALTO_ROMBO);
        return {
            x0: Math.floor(this.centerX - half) - extra,
            y0: Math.floor(this.centerY - half) - extra,
            x1: Math.ceil(this.centerX + half) + extra,
            y1: Math.ceil(this.centerY + half) + extra
        };
    }
}

export class IsoRenderer extends Renderer {
    /**
     * Los efectos, los textos flotantes y la noche son los del renderer de siempre, que colocan
     * cada cosa a partir de la ESQUINA de su casilla (`p.x + TILE/2` es su centro). En el rombo
     * el centro está en `(sx, sy + HH)`: se les da una cámara que devuelve la esquina que les
     * cuadra, y todo lo demás de la cámara sigue siendo el mismo objeto.
     */
    draw(ops, camera, state) {
        const ajustada = Object.create(camera);
        ajustada.worldToScreen = (x, y, z) => {
            const q = camera.worldToScreen(x, y, z);
            return { x: q.x - TILE / 2, y: q.y };
        };
        return super.draw(ops, ajustada, state);
    }

    /** El centro del rombo de una operación (sx, sy es su esquina norte). */
    _centro(op) {
        return { x: op.sx, y: op.sy + HH };
    }

    /**
     * EL SUELO: la textura de la casilla, deformada al rombo. El cuadrado del sprite (u, v) va a
     * `(sx + (u - v) * HW / 32, sy + (u + v) * HH / 32)`: su esquina (0,0) a la norte, (32,0) a la
     * este, (0,32) a la oeste y (32,32) a la sur.
     */
    _drawSuelo(op, sprite) {
        const ctx = this.ctx;
        const ancho = sprite.drawW || sprite.canvas.width;
        const alto = sprite.drawH || sprite.canvas.height;
        // Un suelo HD (64 px por casilla) ya es de 32 lógicos de ancho; uno del pack también.
        const su = sprite.canvas.width / ancho;
        const sv = sprite.canvas.height / alto;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.translate(Math.round(op.sx), Math.round(op.sy));
        // Sólo la última casilla del sprite (un suelo de 2x2 trozos se ancla abajo a la derecha).
        const u0 = sprite.canvas.width - TILE * su;
        const v0 = sprite.canvas.height - TILE * sv;
        ctx.transform(HW / TILE, HH / TILE, -HW / TILE, HH / TILE, 0, 0);
        // Medio píxel de más por cada lado tapa la junta que deja el filtro entre rombos.
        ctx.drawImage(sprite.canvas, u0, v0, TILE * su, TILE * sv, -0.5, -0.5, TILE + 1, TILE + 1);
        ctx.restore();
    }

    _sombra(cx, cy, rx, ry, alfa) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alfa;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * UN CARTEL: el sprite de pie, con la casilla que ocupa (la de abajo a la derecha del dibujo,
     * `anchorX`/`anchorY`) centrada en el rombo y los pies un poco por debajo de su centro.
     */
    _cartel(op, sprite, elevacion) {
        const c = this._centro(op);
        const ancho = sprite.drawW || sprite.canvas.width;
        const alto = sprite.drawH || sprite.canvas.height;
        const anclaX = sprite.anchorX || 0;
        const anclaY = typeof sprite.anchorY === 'number' ? sprite.anchorY : alto;
        const x = Math.round(c.x - anclaX - TILE / 2);
        const y = Math.round(c.y + HH / 2 - anclaY - elevacion);
        this.ctx.drawImage(sprite.canvas, x, y, ancho, alto);
        return { x, y, ancho, alto, cx: c.x, cy: c.y };
    }

    _drawSprite(op, ahora) {
        const sprite = this.provider.get(op.typeId, ahora, op);
        if (!sprite) {
            return;
        }
        const flags = (sprite.thing && sprite.thing.flags) || {};
        const elevacion = this._elevacion ? this._elevacion.valor : 0;
        const c = this._centro(op);

        if (op.kind === DRAW_KINDS.GROUND || flags.groundBorder) {
            this._drawSuelo(op, sprite);
        } else {
            // Lo que es un bulto (un muro, un árbol, un barril) lleva sombra; lo plano (una
            // alfombra, una moneda en el suelo), no.
            const bulto = flags.blocksSolid || flags.notWalkable || (sprite.thing && sprite.thing.height > 1);
            if (bulto) {
                this._sombra(c.x, c.y + 4 - elevacion, HW * 0.45, HH * 0.45, 0.3);
            }
            this._cartel(op, sprite, elevacion);
        }

        const luz = flags.light;
        if (luz && luz.level > 0 && this._luces) {
            this._luces.push({ x: c.x, y: c.y, nivel: Number(luz.level) });
        }
        if (sprite.elevation && this._elevacion && op.kind !== DRAW_KINDS.GROUND) {
            this._elevacion.valor = Math.min(24, this._elevacion.valor + sprite.elevation);
        }
    }

    _drawCreature(op, ahora) {
        const sprite = this.provider.getCreature ? this.provider.getCreature(op, ahora) : null;
        const elevacion = this._elevacion ? this._elevacion.valor : 0;
        const c = this._centro(op);

        // El objetivo: una elipse roja en el suelo del rombo, delante de la sombra.
        if (this._objetivo !== null && op.id === this._objetivo) {
            const ctx = this.ctx;
            const pulso = 0.6 + 0.4 * Math.abs(Math.sin(ahora / 300));
            ctx.save();
            ctx.strokeStyle = 'rgba(230,40,40,' + pulso + ')';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y + 4 - elevacion, HW * 0.55, HH * 0.55, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        this._sombra(c.x, c.y + 4 - elevacion, 12, 6, 0.35);
        let arriba = c.y - 40;
        if (sprite) {
            const d = this._cartel(op, sprite, elevacion);
            // La cabeza: lo primero no transparente sería lo exacto; el borde del dibujo basta.
            arriba = d.y + Math.max(0, d.alto - TILE - 16);
        }
        // Las etiquetas (nombre, vida) las pinta el renderer de siempre en `x + TILE/2, y`.
        this._etiquetas.push({ x: c.x - TILE / 2, y: arriba, op });
    }
}
