/**
 * El renderer: recorre la lista de dibujo y pinta.
 *
 * Es DELIBERADAMENTE tonto. No decide qué se ve, ni en qué orden, ni dónde: eso ya
 * está resuelto en `camera.js` y `drawlist.js`, que son cálculo puro y se prueban
 * sin navegador. Aquí sólo quedan llamadas al lienzo, que es la parte que no se
 * puede probar sin abrir uno.
 *
 * Esa división es lo que hace verificable el 2.5D: si el orden estuviera mezclado
 * con las llamadas de dibujo, la única forma de comprobarlo sería mirar una captura
 * y confiar en la vista.
 */

import { DRAW } from './drawlist.js';
import { TILE } from './sprites.js';

/**
 * El reloj del cliente: `performance.now()`.
 *
 * ES EL MISMO RELOJ QUE USA TODO LO DEMAS, y eso es lo unico que importa aqui. `world.now`
 * mide con `performance.now()`, que son milisegundos desde que se abrio la pagina, y el
 * bucle de dibujo recibe lo mismo de `requestAnimationFrame`. Lo que NO se puede usar es
 * `Date.now()`: mide desde 1970, o sea un billon y pico de milisegundos, y mezclar las dos
 * escalas no da un desfase pequeño, da uno de un billon. Ya paso en este proyecto, con un
 * paso que se quedaba clavado en su casilla porque `elapsed` salia enormemente negativo.
 *
 * Se inyecta por el constructor para poder probarlo sin esperar, igual que en `world.js`.
 */
function relojDelCliente() {
    if (typeof performance !== 'undefined' && performance.now) {
        return () => performance.now();
    }
    return () => Date.now();
}

export class Renderer {
    constructor(options) {
        const opts = options || {};

        this.canvas = opts.canvas;
        this.ctx = this.canvas.getContext('2d');
        this.provider = opts.provider;
        this.showNames = opts.showNames !== false;
        this.showHealth = opts.showHealth !== false;

        /**
         * Cuantas veces se agranda la imagen.
         *
         * EL ZOOM NO TOCA NI UNA POSICION. Se hace en dos sitios y los dos son de dibujo:
         * el contexto se escala por este numero, y la camara recibe un viewport dividido por
         * el. Asi `worldToScreen` sigue devolviendo coordenadas coherentes consigo mismas y
         * todo lo que ya estaba calculado -el orden de dibujo, el desplazamiento por planta,
         * el ancla de los sprites- sigue valiendo sin cambios.
         *
         * Y SE DESACTIVA EL SUAVIZADO, que ya lo estaba: al agrandar pixel art, interpolar
         * cada pixel lo convierte en una mancha. Es la diferencia entre ver el doble y ver
         * el doble borroso.
         */
        this.zoom = 1;

        /**
         * EL ÁREA VISIBLE, EN CASILLAS: fija, como en Tibia (15x11), y NO lo que quepa en la ventana.
         *
         * El motor manda unas casillas alrededor del jugador (`viewWidth` x `viewHeight` de
         * config.js, más una de cada lado). Si la ventana enseñaba más de lo que llega, las
         * columnas del borde aparecían y desaparecían DE GOLPE al andar: con una ventana ancha
         * pasaba a los lados y no arriba y abajo. Con el área fija y dos casillas de margen por
         * lado, todo lo que entra en pantalla ya estaba en el cliente y se desliza.
         */
        this.tilesAncho = opts.tilesAncho || 15;
        this.tilesAlto = opts.tilesAlto || 11;

        /**
         * EL MUNDO SE PINTA A TAMAÑO REAL en un lienzo propio (un píxel del sprite es un píxel) y
         * luego se amplía entero a la ventana. Ampliar sprite a sprite dejaba costuras de un
         * píxel entre los suelos al moverse la cámara, porque cada casilla se redondeaba por su
         * cuenta; ampliar la imagen entera no tiene juntas que redondear.
         */
        this.mundo = typeof document !== 'undefined' ? document.createElement('canvas') : null;
        /**
         * LA RESOLUCIÓN DEL LIENZO DEL MUNDO: píxeles por píxel lógico. A 2, una casilla de 32 se
         * pinta en 64 píxeles: el arte del pack (32 px) se ve igual, ampliado sin suavizar, y el
         * ARTE HD (64 px por casilla, docs/ARTE-HD.md) se ve con todo su detalle.
         */
        this.resolucion = opts.resolucion || 2;
        this.mundoCtx = this.mundo ? this.mundo.getContext('2d') : this.ctx;
        this.escala = 1;
        this.origen = { x: 0, y: 0 };
        /**
         * EL SUAVIZADO (js/suavizado.js): con `pixel` o `suave`, la imagen del mundo se ajusta a la
         * ventana con filtro (un zoom no entero deja así todas las filas de píxeles iguales). Los
         * sprites los amplía el proveedor (`setSuavizado`).
         */
        this.suavizado = 'nitido';

        /** El reloj con el que se elige el fotograma de cada animacion. */
        this.now = opts.now || relojDelCliente();

        /** Contadores para el diagnóstico. */
        this.stats = { frames: 0, ops: 0, lastFrameMs: 0 };

        // El suavizado de imagen se DESACTIVA: los sprites son pixel art y
        // interpolarlos los convierte en manchas. Es lo primero que hay que
        // configurar en un cliente de este tipo y lo primero que se olvida.
        this.ctx.imageSmoothingEnabled = false;

        this.resize();
    }

    /** Cambia el suavizado de los píxeles: el de la ampliación final y el de los sprites. */
    setSuavizado(modo) {
        this.suavizado = this.provider && this.provider.setSuavizado ? this.provider.setSuavizado(modo) : modo;
        this._cacheEfectos = null;
        return this.suavizado;
    }

    /** Cambia el área visible (casillas). Lo dice el motor al entrar. */
    setVista(ancho, alto) {
        this.tilesAncho = Math.max(5, Math.floor(ancho));
        this.tilesAlto = Math.max(5, Math.floor(alto));
        return this.resize();
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;

        this.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
        this.canvas.height = Math.max(1, Math.floor(rect.height * ratio));

        this.cssWidth = rect.width;
        this.cssHeight = rect.height;
        this.ratio = ratio;

        const ancho = this.tilesAncho * TILE;
        const alto = this.tilesAlto * TILE;
        if (this.mundo) {
            this.mundo.width = ancho * this.resolucion;
            this.mundo.height = alto * this.resolucion;
            this.mundoCtx.imageSmoothingEnabled = false;
        }

        // La escala que hace caber el área visible en la ventana, centrada (con franjas negras
        // si la ventana no tiene su proporción).
        this.escala = Math.max(0.25, Math.min(rect.width / ancho, rect.height / alto));
        this.origen = {
            x: Math.round((rect.width - ancho * this.escala) / 2),
            y: Math.round((rect.height - alto * this.escala) / 2)
        };
        this.zoom = this.escala;

        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.ctx.imageSmoothingEnabled = false;

        return this;
    }

    /** El tamaño del área visible EN PÍXELES DEL MUNDO: el viewport de la cámara. */
    get viewWidth() {
        return this.tilesAncho * TILE;
    }

    get viewHeight() {
        return this.tilesAlto * TILE;
    }

    /** De un punto de la pantalla (clientX, clientY) a píxeles del mundo, para el ratón. */
    puntoMundo(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left - this.origen.x) / this.escala,
            y: (clientY - rect.top - this.origen.y) / this.escala
        };
    }

    /** De píxeles del mundo a píxeles CSS del lienzo grande (para los textos). */
    _aPantalla(x, y) {
        return { x: this.origen.x + x * this.escala, y: this.origen.y + y * this.escala };
    }

    /**
     * Pinta un fotograma.
     *
     * @param {Array} ops lista de dibujo, ya ordenada
     * @param {Camera} camera
     * @param {Object} [state] datos para la interfaz: jugador, textos, y el instante del fotograma
     */
    draw(ops, camera, state) {
        /*
         * EL INSTANTE SE TOMA UNA VEZ POR FOTOGRAFO, y con el se hace todo: el cronometro del
         * diagnostico y la eleccion del fotograma de cada animacion. Que sea UNO SOLO es la
         * regla; dos muestras del mismo reloj con microsegundos de diferencia no rompen nada,
         * pero dos relojes distintos -`Date.now()` por un lado y `requestAnimationFrame` por
         * otro- si, y esa cicatriz ya la tiene este proyecto.
         *
         * Si quien llama ya trae el instante del fotograma -`state.now`, que es lo que hace
         * falta si algun dia `main.js` quiere pasar el MISMO que le dio `requestAnimationFrame`
         * al mundo-, se usa ese: asi la animacion y la interpolacion de las criaturas miran
         * exactamente el mismo numero.
         */
        const started = this.now();
        const ahora = state && typeof state.now === 'number' ? state.now : started;
        const pantalla = this.ctx;
        const ctx = this.mundoCtx;
        // Los dibujos de abajo usan `this.ctx`: mientras se pinta el mundo, apunta al lienzo propio.
        this.ctx = ctx;
        this._etiquetas = [];

        // Todo se dibuja en píxeles lógicos (32 por casilla); el lienzo tiene `resolucion` veces más.
        const f = this.mundo ? this.resolucion : 1;
        ctx.setTransform(f, 0, 0, f, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#101014';
        ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

        /*
         * ESTE DESPLAZAMIENTO ES SÓLO PARA ALINEAR LA REJILLA AL PÍXEL. NO CENTRA.
         *
         * Aquí se sumaba `cssWidth / 2` y `cssHeight / 2`, y `camera.worldToScreen` YA SUMA
         * `width / 2` y `height / 2` para centrar. Las dos cosas juntas movían todo el dibujo
         * media pantalla hacia abajo y hacia la derecha: el resultado era una pantalla negra
         * con un trozo de mapa en la esquina inferior derecha, que es justo lo que se veía.
         *
         * Y por eso no lo cazó ninguna prueba: `worldToScreen` y la lista de dibujo hacían lo
         * correcto, y las dos se comprueban por separado. El error estaba en la suma de las
         * dos, y eso sólo se ve dibujando.
         *
         * Lo que hace falta es quitar la PARTE FRACCIONARIA del origen, que es lo que evita
         * que el navegador interpole las texturas al moverse la cámara en coordenadas
         * fraccionarias. Todos los tiles comparten esa parte fraccionaria, así que restarla
         * una vez los deja a todos en píxeles enteros.
         */
        /*
         * Y NO SE DESPLAZA NADA: cada sprite se dibuja ya en píxeles ENTEROS (`Math.round` en
         * `_drawSprite` y `_drawCreature`). Antes aquí se trasladaba todo el lienzo la parte
         * fraccionaria de la cámara, y eso dejaba CADA casilla en medio píxel mientras la cámara
         * se deslizaba: el navegador suavizaba el borde de cada sprite de 32 y se veían las juntas
         * de la rejilla, verticales al andar en horizontal y horizontales al andar en vertical.
         * Redondeando cada posición, todas las casillas comparten el mismo píxel de origen y
         * encajan sin junta.
         */
        const offsetX = 0;
        const offsetY = 0;

        ctx.save();

        // La ELEVACIÓN se acumula dentro de una casilla: lo que se pone encima de una mesa se
        // dibuja más arriba. Se reinicia al cambiar de casilla, y tiene el tope de Tibia (24).
        this._elevacion = { clave: null, valor: 0 };
        this._objetivo = state && state.objetivo !== undefined ? state.objetivo : null;
        // Las luces de los objetos de este fotograma (para la noche).
        this._luces = [];

        ops.forEach((op) => {
            const clave = op.x + ',' + op.y + ',' + op.z;
            if (this._elevacion.clave !== clave) {
                this._elevacion = { clave: clave, valor: 0 };
            }
            if (op.kind === DRAW.CREATURE) {
                this._drawCreature(op, ahora);
            } else {
                this._drawSprite(op, ahora);
            }
        });

        // Los efectos (una llama, un golpe) y los proyectiles que vuelan, encima de todo lo del
        // mundo y en sus píxeles (para que se vean igual de nítidos que los sprites).
        this._drawEfectos(camera, (state && state.efectos) || [], (state && state.proyectiles) || [], ahora);

        ctx.restore();

        // El mundo, ampliado entero a la ventana.
        this.ctx = pantalla;
        pantalla.fillStyle = '#000';
        pantalla.fillRect(0, 0, this.cssWidth, this.cssHeight);
        if (this.mundo && this.mundo !== this.canvas) {
            pantalla.imageSmoothingEnabled = this.suavizado !== 'nitido';
            pantalla.imageSmoothingQuality = 'high';
            pantalla.drawImage(this.mundo, this.origen.x, this.origen.y,
                this.viewWidth * this.escala, this.viewHeight * this.escala);
        }

        // Nombres y barras de vida, DESPUÉS de todo y en la pantalla grande: así nunca los tapa
        // una casilla que se pinta después, y el texto se lee nítido a cualquier escala.
        // La NOCHE: el mundo se oscurece según la luz del mundo, menos alrededor del jugador si
        // lleva luz (una antorcha, `utevo lux`). Los nombres van después: se leen siempre.
        this._drawOscuridad(camera, state);

        this._says = (state && state.recentSays) || [];
        this._marcas = (state && state.marcas) || null;
        // Los nombres y los números, SÓLO DENTRO DEL ÁREA DEL JUEGO: las criaturas de las casillas
        // de margen (las que llegan antes de verse) no deben asomar su nombre en las franjas.
        pantalla.save();
        pantalla.beginPath();
        pantalla.rect(this.origen.x, this.origen.y, this.viewWidth * this.escala, this.viewHeight * this.escala);
        pantalla.clip();
        this._drawEtiquetas(offsetX, offsetY);
        this._drawTextosFlotantes(camera, (state && state.textosFlotantes) || [], ahora);
        pantalla.restore();

        this._drawOverlay(state);

        this.stats.frames += 1;
        this.stats.ops = ops.length;
        this.stats.lastFrameMs = this.now() - started;
    }

    /**
     * El sprite de un objeto.
     *
     * El instante viaja hasta el proveedor porque es el quien elige el fotograma: los objetos
     * tambien tienen animacion -su `idle`, que en estos ficheros son seis fotogramas de un
     * brillo-, y sin el reloj se quedarian en el primero. El proveedor de procedimiento
     * ignora el segundo argumento, asi que esto no le afecta.
     */
    _drawSprite(op, ahora) {
        const sprite = this.provider.get(op.typeId, ahora, op);
        if (!sprite) {
            return;
        }
        const elevacion = this._elevacion ? this._elevacion.valor : 0;

        // El ancla sube el sprite para que su BASE coincida con la base del tile: un
        // muro de 32x64 se dibuja 32 píxeles más arriba y así sobresale hacia arriba,
        // que es lo que produce el volumen.
        // `anchorX` corre a la izquierda lo que mide más de una casilla de ancho (el ancla de
        // Tibia es la casilla de abajo a la derecha).
        this.ctx.drawImage(
            sprite.canvas,
            Math.round(op.sx) - (sprite.anchorX || 0) - elevacion,
            Math.round(op.sy) - sprite.anchorY + TILE - elevacion,
            sprite.drawW || sprite.canvas.width,
            sprite.drawH || sprite.canvas.height
        );

        // Lo que da luz (una farola, una hoguera, una antorcha en el suelo): se apunta para abrir
        // su círculo en la oscuridad de la noche.
        const luz = sprite.thing && sprite.thing.flags && sprite.thing.flags.light;
        if (luz && luz.level > 0 && this._luces) {
            this._luces.push({ x: Math.round(op.sx) + TILE / 2, y: Math.round(op.sy) + TILE / 2, nivel: Number(luz.level) });
        }

        if (sprite.elevation && this._elevacion && op.kind !== DRAW.GROUND) {
            this._elevacion.valor = Math.min(24, this._elevacion.valor + sprite.elevation);
        }
    }

    _drawCreature(op, ahora) {
        const x = Math.round(op.sx);
        const y = Math.round(op.sy);

        // Los colores del aspecto (cuatro índices de la paleta) los aplica el proveedor al
        // componer el sprite.

        // Sin sombra debajo: como en Tibia, los sprites ya traen la suya y una elipse añadida
        // se veía como una mancha.

        /*
         * SI HAY SPRITE DE VERDAD, SE DIBUJA Y SE SALTA EL MUÑECO DE COLORES.
         *
         * El proveedor devuelve null mientras el sprite no esta cargado y tambien cuando no
         * hay dibujo para esa criatura.
         *
         * El `else` cierra justo antes de la barra de vida, para que el nombre y la vida se
         * dibujen SIEMPRE, con sprite o sin el: son interfaz, no cuerpo.
         */
        const sprite = this.provider.getCreature ? this.provider.getCreature(op, ahora) : null;

        // EL OBJETIVO: un CÍRCULO de verdad alrededor de la criatura, detrás de su dibujo, con
        // degradado: un anillo rojo que brilla hacia dentro y hacia fuera, no una raya pintada.
        if (this._objetivo !== null && op.id === this._objetivo) {
            const elev = this._elevacion ? this._elevacion.valor : 0;
            dibujarCirculoObjetivo(this.ctx, Math.round(op.sx) + TILE / 2 - elev, Math.round(op.sy) + TILE / 2 + 2 - elev, ahora);
        }

        if (sprite) {
            const elevacion = this._elevacion ? this._elevacion.valor : 0;
            this.ctx.drawImage(sprite.canvas,
                Math.round(op.sx) - (sprite.anchorX || 0) - elevacion,
                Math.round(op.sy) - sprite.anchorY + TILE - elevacion,
                sprite.drawW || sprite.canvas.width,
                sprite.drawH || sprite.canvas.height);
        }
        // Sin sprite todavía (las hojas se están cargando) NO se dibuja nada: el muñeco de colores
        // de las primeras versiones se veía como rayas y cuadrados al entrar. Mientras carga, el
        // cliente enseña la pantalla de carga encima.

        const elevacionEtiqueta = this._elevacion ? this._elevacion.valor : 0;
        this._etiquetas.push({ x: x - elevacionEtiqueta, y: y - elevacionEtiqueta, op });
    }

    /**
     * LOS NÚMEROS QUE SUBEN: el daño en rojo («-29») y la curación en verde («+10»), sobre la
     * casilla donde pasó. Suben unos 26 píxeles del mundo y se desvanecen en algo más de un
     * segundo, como en Tibia. Si caen varios en la misma casilla, se escalonan para no taparse.
     */
    _drawTextosFlotantes(camera, textos, ahora) {
        if (!textos.length) {
            return;
        }
        const ctx = this.ctx;
        const porCasilla = new Map();
        ctx.save();
        ctx.font = 'bold ' + Math.max(12, Math.round(9 * this.escala)) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        textos.forEach((t) => {
            const edad = Math.min(1, Math.max(0, (ahora - t.desde) / 1100));
            const clave = t.x + ',' + t.y + ',' + t.z;
            const n = porCasilla.get(clave) || 0;
            porCasilla.set(clave, n + 1);
            const base = camera.worldToScreen(t.x, t.y, t.z);
            const p = this._aPantalla(base.x + TILE / 2, base.y + 16 - edad * 28 - n * 9);
            const x = Math.round(p.x);
            const y = Math.round(p.y);
            ctx.globalAlpha = edad < 0.6 ? 1 : 1 - (edad - 0.6) / 0.4;
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText(t.texto, x, y);
            ctx.fillStyle = t.tipo === 'cura' ? '#40e040' : '#ff3434';
            ctx.fillText(t.texto, x, y);
        });
        ctx.restore();
    }

    /**
     * LOS EFECTOS Y LOS PROYECTILES. Un efecto pasa sus fotogramas (100 ms cada uno) sobre su
     * casilla; un proyectil vuela de una casilla a otra con el dibujo de su dirección (el pack
     * los trae en una rejilla de 3x3: noroeste, norte, noreste...). Los dibujos se guardan
     * compuestos para no rehacerlos cada fotograma.
     */
    _drawEfectos(camera, efectos, proyectiles, ahora) {
        if ((!efectos.length && !proyectiles.length) || !this.provider || !this.provider.thing) {
            return;
        }
        const ctx = this.ctx;
        if (!this._cacheEfectos) {
            this._cacheEfectos = new Map();
        }
        const dibujo = (categoria, id, sel) => {
            const clave = categoria + ':' + id + ':' + sel.px + ':' + sel.py + ':' + sel.frame;
            let lienzo = this._cacheEfectos.get(clave);
            if (!lienzo) {
                const cosa = this.provider.thing(categoria, id);
                const compuesto = cosa ? this.provider.compose(cosa, { px: sel.px, py: sel.py, pz: 0, frame: sel.frame }) : null;
                if (compuesto) {
                    const img = this.provider.suavizar ? this.provider.suavizar(cosa, compuesto) : compuesto;
                    // Un efecto HD (64 px por casilla) o ampliado por el suavizado se pinta a media escala.
                    const k = (this.provider.mediaEscala ? this.provider.mediaEscala(cosa, img) : !!(cosa.flags && cosa.flags.hd)) ? 0.5 : 1;
                    lienzo = { img, w: img.width * k, h: img.height * k };
                    this._cacheEfectos.set(clave, lienzo);
                }
            }
            return lienzo;
        };
        efectos.forEach((e) => {
            const cosa = this.provider.thing('effects', e.efecto);
            const fotogramas = cosa ? Math.max(1, cosa.frames || 1) : 1;
            const paso = Math.floor(Math.max(0, ahora - e.desde) / DURACION_FOTOGRAMA_EFECTO);
            const cual = fotogramaDeEfecto(fotogramas, paso);
            if (cual === null) {
                return;
            }
            const dib = dibujo('effects', e.efecto, { px: 0, py: 0, frame: cual.fotograma });
            if (!dib) {
                return;
            }
            const p = camera.worldToScreen(e.x, e.y, e.z);
            // El último fotograma se desvanece en vez de desaparecer de golpe.
            ctx.globalAlpha = cual.ultimo
                ? Math.max(0, 1 - ((ahora - e.desde) % DURACION_FOTOGRAMA_EFECTO) / DURACION_FOTOGRAMA_EFECTO)
                : 1;
            // Anclado abajo a la derecha de su casilla, y desplazado por su `offset` (como los
            // objetos: positivo hacia la izquierda y arriba). El tajo de espada lo usa.
            const desplazado = (cosa && cosa.flags && cosa.flags.offset) || { x: 0, y: 0 };
            const { w, h } = dib;
            ctx.drawImage(dib.img, Math.round(p.x + TILE - w - (desplazado.x || 0)),
                Math.round(p.y + TILE - h - (desplazado.y || 0)), w, h);
            ctx.globalAlpha = 1;
        });
        proyectiles.forEach((m) => {
            const t = Math.min(1, Math.max(0, (ahora - m.desde) / m.dura));
            const dx = m.hasta.x - m.origen.x;
            const dy = m.hasta.y - m.origen.y;
            const sel = patronDeProyectil(dx, dy);
            const dib = dibujo('missiles', m.proyectil, { px: sel.px, py: sel.py, frame: 0 });
            if (!dib) {
                return;
            }
            const a = camera.worldToScreen(m.origen.x, m.origen.y, m.origen.z);
            const b = camera.worldToScreen(m.hasta.x, m.hasta.y, m.hasta.z);
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            ctx.drawImage(dib.img, Math.round(x + TILE - dib.w), Math.round(y + TILE - dib.h), dib.w, dib.h);
        });
    }

    /**
     * LA OSCURIDAD: una capa negra tanto más opaca cuanto menos luz tiene el mundo (de noche),
     * con un agujero redondo alrededor del jugador del tamaño de su luz.
     */
    _drawOscuridad(camera, state) {
        const luzMundo = state && state.luzMundo !== undefined ? state.luzMundo : 255;
        if (luzMundo >= 250) {
            return;
        }
        const ancho = Math.round(this.viewWidth * this.escala);
        const alto = Math.round(this.viewHeight * this.escala);
        if (!this._capaNoche || this._capaNoche.width !== ancho || this._capaNoche.height !== alto) {
            this._capaNoche = document.createElement('canvas');
            this._capaNoche.width = ancho;
            this._capaNoche.height = alto;
        }
        const c = this._capaNoche.getContext('2d');
        c.globalCompositeOperation = 'source-over';
        c.clearRect(0, 0, ancho, alto);
        c.fillStyle = 'rgba(0, 0, 12, ' + ((255 - luzMundo) / 255 * 0.88).toFixed(3) + ')';
        c.fillRect(0, 0, ancho, alto);
        // El jugador está siempre en el centro (la cámara le sigue).
        const radio = ((state.luzPropia || 0) + 1.2) * TILE * this.escala;
        const cx = (camera.width / 2 + TILE / 2) * this.escala;
        const cy = (camera.height / 2 + TILE / 2) * this.escala;
        const g = c.createRadialGradient(cx, cy, radio * 0.25, cx, cy, radio);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = g;
        c.beginPath();
        c.arc(cx, cy, radio, 0, Math.PI * 2);
        c.fill();
        // Y la de cada objeto que da luz (farolas, hogueras...).
        (this._luces || []).forEach((l) => {
            const r = (l.nivel * 0.8 + 0.8) * TILE * this.escala;
            const lx = l.x * this.escala;
            const ly = l.y * this.escala;
            const gl = c.createRadialGradient(lx, ly, r * 0.2, lx, ly, r);
            gl.addColorStop(0, 'rgba(0,0,0,0.95)');
            gl.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = gl;
            c.beginPath();
            c.arc(lx, ly, r, 0, Math.PI * 2);
            c.fill();
        });
        this.ctx.drawImage(this._capaNoche, this.origen.x, this.origen.y);
    }

    /** Las barras de vida y los nombres de las criaturas, en la pantalla grande. */
    _drawEtiquetas(offsetX, offsetY) {
        const ctx = this.ctx;
        (this._etiquetas || []).forEach(({ x, y, op }) => {
            // En píxeles enteros de la pantalla: un texto en medio píxel tiembla al moverse.
            const punto = this._aPantalla(x + offsetX + TILE / 2, y + offsetY);
            const arriba = { x: Math.round(punto.x), y: Math.round(punto.y) };
            const ancho = Math.max(24, (TILE - 6) * this.escala * 0.8);
            // Con la opción encendida la barra se ve SIEMPRE (también llena), como en Tibia.
            if (this.showHealth && op.health !== undefined) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(arriba.x - ancho / 2, arriba.y - 8, ancho, 4);
                ctx.fillStyle = op.health > 50 ? '#4ac04a' : (op.health > 25 ? '#c0c04a' : '#c04a4a');
                ctx.fillRect(arriba.x - ancho / 2, arriba.y - 8, Math.round(ancho * op.health / 100), 4);
            }
            if (this.showNames && op.name) {
                ctx.font = 'bold 12px monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fillText(op.name, arriba.x + 1, arriba.y - 11);
                ctx.fillStyle = op.isPlayer ? '#cfe6ff' : '#ffd0c0';
                ctx.fillText(op.name, arriba.x, arriba.y - 12);
            }
            // La calavera (PvP) y el escudo de grupo, a la derecha de la barra de vida.
            const marca = this._marcas ? this._marcas.get(op.id) : null;
            if (marca && (marca.calavera || marca.grupo)) {
                let mx = arriba.x + ancho / 2 + 7;
                const my = arriba.y - 6;
                if (marca.calavera) {
                    dibujarCalavera(ctx, mx, my, marca.calavera === 'roja' ? '#e03030' : '#f0f0f0');
                    mx += 12;
                }
                if (marca.grupo) {
                    dibujarEscudo(ctx, mx, my, marca.grupo === 'lider' ? '#f0c030' : '#40c040');
                }
            }
            // Lo que dice, encima de su cabeza y en amarillo, como en Tibia («Nombre dice:»).
            const dice = (this._says || []).find((say) => say.creatureId === op.id);
            if (dice) {
                ctx.font = 'bold 12px monospace';
                ctx.textAlign = 'center';
                const lineas = [dice.name + ' dice:'].concat(partirTexto(ctx, dice.text, 220));
                lineas.forEach((linea, i) => {
                    const y = arriba.y - 28 - (lineas.length - 1 - i) * 14;
                    ctx.fillStyle = 'rgba(0,0,0,0.8)';
                    ctx.fillText(linea, arriba.x + 1, y + 1);
                    ctx.fillStyle = '#ffe040';
                    ctx.fillText(linea, arriba.x, y);
                });
            }
        });
    }

    /**
     * Los textos que van sobre el mapa sin criatura a la que pegarlos (los que van con criatura
     * salen sobre su cabeza, y todo queda además en la consola de abajo).
     */
    _drawOverlay(state) {
        if (!state) {
            return;
        }

        const ctx = this.ctx;
        const says = (state.recentSays || []).filter((say) => say.creatureId === undefined);

        ctx.font = '12px monospace';
        ctx.textAlign = 'left';

        says.forEach((say, index) => {
            const y = 40 + index * 16;
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(8, y - 12, ctx.measureText(say.line).width + 12, 16);
            ctx.fillStyle = '#ffe8a0';
            ctx.fillText(say.line, 14, y);
        });
    }
}

/** Parte un texto en líneas que quepan en `ancho` píxeles. */
/**
 * EL CÍRCULO DEL OBJETIVO: un anillo de radio ~14 px con degradado radial (transparente → rojo
 * intenso → transparente) y un brillo que late despacio. Se dibuja detrás de la criatura.
 */
export function dibujarCirculoObjetivo(ctx, cx, cy, ahora) {
    const radio = 14;
    const ancho = 5;
    const latido = 0.75 + 0.25 * Math.sin((Number(ahora) || 0) / 260);
    ctx.save();
    // El halo: un anillo ancho y suave.
    const halo = ctx.createRadialGradient(cx, cy, radio - ancho, cx, cy, radio + ancho);
    halo.addColorStop(0, 'rgba(255, 40, 40, 0)');
    halo.addColorStop(0.5, 'rgba(255, 50, 40, ' + (0.55 * latido).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(255, 40, 40, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radio + ancho, 0, Math.PI * 2);
    ctx.arc(cx, cy, Math.max(0, radio - ancho), 0, Math.PI * 2, true);
    ctx.fill();
    // El filo: fino y más claro en el centro del anillo.
    const filo = ctx.createRadialGradient(cx, cy, radio - 1.5, cx, cy, radio + 1.5);
    filo.addColorStop(0, 'rgba(255, 90, 70, 0)');
    filo.addColorStop(0.5, 'rgba(255, 120, 90, ' + (0.9 * latido).toFixed(3) + ')');
    filo.addColorStop(1, 'rgba(255, 90, 70, 0)');
    ctx.fillStyle = filo;
    ctx.beginPath();
    ctx.arc(cx, cy, radio + 1.5, 0, Math.PI * 2);
    ctx.arc(cx, cy, radio - 1.5, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
}

/** Lo que dura cada fotograma de un efecto, en milisegundos (el `durations` del pack). */
export const DURACION_FOTOGRAMA_EFECTO = 100;

/**
 * QUÉ FOTOGRAMA DE UN EFECTO toca en el paso `paso` (cada paso dura DURACION_FOTOGRAMA_EFECTO).
 *
 * Los efectos CORTOS (4 fotogramas o menos, como la sangre del pack: un anillo que se abre) se
 * animan de IDA Y VUELTA (0 1 2 3 2 1 0): se abren y se cierran, en vez de quedarse en su forma
 * más grande y desaparecer de golpe. Los largos van una vez hacia delante.
 *
 * @returns {{fotograma: number, ultimo: boolean}|null} null cuando ya ha terminado
 */
export function fotogramaDeEfecto(fotogramas, paso) {
    const n = Math.max(1, fotogramas);
    const idaYVuelta = n > 1 && n <= 4;
    const total = idaYVuelta ? 2 * n - 1 : n;
    if (paso < 0 || paso >= total) {
        return null;
    }
    const fotograma = idaYVuelta && paso >= n ? 2 * n - 2 - paso : paso;
    return { fotograma: fotograma, ultimo: paso === total - 1 };
}

/**
 * El dibujo de un proyectil según hacia dónde vuela: el pack los trae en una rejilla de 3x3
 * (patrón X e Y), con el noroeste en (0,0) y el sureste en (2,2), como OTClient.
 */
export function patronDeProyectil(dx, dy) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    let sx = Math.sign(dx);
    let sy = Math.sign(dy);
    if (ax > 2 * ay) {
        sy = 0;
    } else if (ay > 2 * ax) {
        sx = 0;
    }
    return { px: sx + 1, py: sy + 1 };
}

/** Una calavera pequeña (blanca o roja), como la de Tibia junto al nombre. */
function dibujarCalavera(ctx, x, y, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y - 1, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(x - 2.5, y + 2, 5, 3);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 3, y - 2, 2, 2);
    ctx.fillRect(x + 1, y - 2, 2, 2);
    ctx.restore();
}

/** El escudo de grupo (amarillo el líder, verde los demás). */
function dibujarEscudo(ctx, x, y, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x - 4.5, y - 5);
    ctx.lineTo(x + 4.5, y - 5);
    ctx.lineTo(x + 4.5, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x - 4.5, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function partirTexto(ctx, texto, ancho) {
    const palabras = String(texto).split(/\s+/);
    const lineas = [];
    let actual = '';
    palabras.forEach((p) => {
        const prueba = actual ? actual + ' ' + p : p;
        if (actual && ctx.measureText(prueba).width > ancho) {
            lineas.push(actual);
            actual = p;
        } else {
            actual = prueba;
        }
    });
    if (actual) {
        lineas.push(actual);
    }
    return lineas.slice(0, 4);
}
