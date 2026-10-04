/**
 * El lienzo del editor.
 *
 * DIBUJA CON EL MISMO CÓDIGO QUE EL JUEGO. La cámara y el orden de dibujo son los
 * módulos del cliente, importados tal cual. Si el editor tuviera su propio renderer,
 * los dos acabarían discrepando, y un mapa que se ve bien en el editor y mal en el
 * juego es un fallo que cuesta horas entender porque cada mitad parece correcta.
 *
 * Lo único propio es lo que el juego no necesita: la rejilla, el resaltado de la celda
 * bajo el cursor, el fondo de la planta actual, el borde del mapa y los marcadores de
 * waypoint, de RESPAWN (con sus monstruos dentro) y de NPC. Un juego no dibuja esas cosas; un
 * editor no puede funcionar sin ellas.
 *
 * DOS MODOS DE VISTA, Y LA ESCALA ES LO QUE LOS DISTINGUE
 *
 *   - `vista` (normal): la escala la elige quien edita, y 1 significa un píxel de
 *     sprite por píxel de pantalla.
 *   - `todo`: el mapa ENTERO ajustado a la ventana. El mapa de ejemplo mide 64x64 y el
 *     de la ciudad 128x128: a 32 píxeles por casilla son 2.048 y 4.096 píxeles de
 *     ancho, que no caben en ninguna ventana. Así que "ver todo" REDUCE la escala, y
 *     los sprites de 32 píxeles se dibujan más pequeños. Eso es lo que hace cualquier
 *     editor; lo que no vale es dejar el mapa recortado.
 *
 * El modo `todo` se abandona en cuanto se toca el zoom o se arrastra el mapa: en ese
 * momento ya no se está mirando el mapa entero, se está mirando un trozo, y decir lo
 * contrario en el indicador de escala sería mentir. El botón "Ver todo" lo vuelve a
 * encajar cuando se quiera.
 */

import { Camera, floorOffset } from '/jetyum/js/camera.js';
import { buildDrawList, DRAW } from '/jetyum/js/drawlist.js';
import { createProvider, TILE } from '/jetyum/js/sprites.js';
import { BANDERA_ZONA, bloquesProtegidos, dibujarMarcador, marcadoresDePlanta } from './marcadores.js';
import {
    casillasDelFantasma,
    dibujarFantasma,
    fantasmaDeHerramienta
} from './fantasma.js';
import { TAMANO_POR_DEFECTO } from './pincel.js';
import { COLOR_SIN_SUELO, tinteDeElemento } from './tintes.js';
import {
    ESCALA_NORMAL,
    MARGEN_AJUSTE,
    centroDeMapa,
    centroParaFijarPunto,
    escalaDeAjuste,
    formatoDeEscala,
    limitarEscala,
    siguienteEscala
} from './viewport.js';

/** El resto de un número, siempre positivo. El operador `%` de JS no lo garantiza. */
function resto(valor, paso) {
    if (!(paso > 0)) {
        return 0;
    }
    const r = valor % paso;
    return r < 0 ? r + paso : r;
}

/** La clave de una casilla, igual que en el mapa y en el cliente. */
function clave(x, y, z) {
    return x + ',' + y + ',' + z;
}

export class MapCanvas {
    /**
     * @param {Object} options
     * @param {HTMLCanvasElement} options.canvas
     * @param {Object} [options.provider] el proveedor de sprites; por defecto, el del juego
     * @param {Function} [options.onVista] se avisa en cada cambio de escala o de modo
     */
    constructor(options) {
        const opts = options || {};

        this.canvas = opts.canvas;
        this.ctx = this.canvas.getContext('2d');

        /*
         * EL MISMO PROVEEDOR QUE EL JUEGO, y no el de procedimiento.
         *
         * El editor dibujaba rectángulos de color porque construía el proveedor sin
         * decirle cuál: `createProvider({})` devuelve el de procedimiento y el de los
         * assets sólo se elige pidiéndolo por su nombre. Como el juego sí lo pide,
         * el editor y el juego enseñaban el MISMO mapa con dibujos distintos, que es
         * justo lo que la reutilización de la cámara y del orden de dibujo viene a
         * evitar.
         */
        this.provider = opts.provider || createProvider({ provider: 'assets' });

        this.camera = new Camera({ width: 800, height: 600, tileSize: TILE });
        this.map = null;

        /** La planta que se está editando. */
        this.z = 7;

        /** La celda bajo el cursor, para resaltarla. */
        this.hover = null;

        /**
         * El marcador elegido, en la forma que entiende `marcadoresDePlanta`: lo pone quien
         * edita (mira `main.js`) y aquí sólo sirve para dibujarlo distinto.
         */
        this.seleccion = null;

        /**
         * LO QUE SE LLEVA EN LA MANO: `{typeId, esSuelo, tamano, nombre}` o `null`.
         *
         * `null` significa «no llevo nada», que es un estado válido y el estado inicial: sin
         * nada en la mano no hay fantasma, y el clic izquierdo elige lo que hay en la casilla en
         * vez de pintar. Lo pone `main.js`, que es quien tiene la paleta.
         */
        this.enLaMano = null;

        /**
         * El COMPUESTO que se lleva en la mano: sus casillas relativas al ancla, ya expandidas
         * con la configuración elegida (`[{dx, dy, dz, suelo?, items}]`). Se dibuja entero,
         * transparente, donde caería al pinchar. `null` si no se lleva ninguno.
         */
        this.compuestoEnLaMano = null;

        /** El recuadro de la herramienta «Capturar»: `{x1, y1}` tras el primer clic. */
        this.recuadro = null;

        /**
         * LA HERRAMIENTA PUESTA, y aquí se guarda porque decide QUÉ fantasma se enseña.
         *
         * El lienzo no la usa para nada más: quien la aplica a cada casilla es `main.js`. Aquí
         * interesa por una sola cosa, y es la que resolvió la objeción del borrado: con la goma
         * puesta —o con el botón derecho pulsado— el ratón tiene que enseñar el bloque NxN que se
         * va a borrar, y eso no se puede saber sin saber qué herramienta está puesta. El
         * razonamiento entero está en `fantasma.js`.
         */
        this.herramienta = 'objeto';

        /** El lado del cuadro del pincel, en casillas. Lo comparte con `main.js`, que lo manda. */
        this.pincel = TAMANO_POR_DEFECTO;

        /** ¿Se está borrando ahora mismo? Es el botón derecho, pulsado o arrastrando. */
        this.borrando = false;

        /** El lienzo de cada sprite teñido, para no rehacerlo en cada fotograma. */
        this.tenidos = new Map();

        /** Desplazamiento mientras se arrastra. */
        this.dragging = null;

        /** La escala del zoom: 1 es un píxel de sprite por píxel de pantalla. */
        this.escala = ESCALA_NORMAL;

        /** `vista` o `todo`. Ver la cabecera. */
        this.modo = 'vista';

        this.onVista = opts.onVista || (() => {});

        /** La caché del relleno del suelo por defecto, por tipo. */
        this.suelos = new Map();

        this.ctx.imageSmoothingEnabled = false;
        this.resize();
    }

    /** El lado de una casilla EN PANTALLA, ya con el zoom aplicado. */
    get tileSize() {
        return this.camera.tileSize;
    }

    /** El tamaño del lienzo en píxeles CSS, que es donde se dibuja. */
    get vista() {
        return { ancho: this.camera.width, alto: this.camera.height };
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;

        this.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
        this.canvas.height = Math.max(1, Math.floor(rect.height * ratio));

        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.ctx.imageSmoothingEnabled = false;

        this.camera.setViewport(rect.width, rect.height);

        // En "ver todo" la ventana manda: si cambia de tamaño, el mapa se vuelve a
        // encajar. En la vista normal no se toca nada, que es lo que espera quien está
        // pintando y ha dejado la cámara donde le interesaba.
        if (this.modo === 'todo') {
            this._encajar();
            this._publicarVista();
        }

        return this;
    }

    setMap(map) {
        this.map = map;
        this.suelos.clear();
        return this;
    }

    /**
     * Cambia la planta que se edita.
     *
     * LA CÁMARA TIENE QUE ENTERARSE, y esto era un fallo de verdad: el orden de dibujo
     * del cliente pregunta por `camera.z`, no por una planta aparte, así que al cambiar
     * sólo `this.z` la rejilla, el fondo y los marcadores se iban a la planta nueva
     * mientras los tiles se seguían dibujando los de la vieja. Se cambiaba de planta y
     * el mapa no cambiaba, que es la peor clase de fallo: el que parece que funciona.
     */
    setFloor(z) {
        this.z = z;
        this.camera.z = z;
        return this;
    }

    centerOn(x, y) {
        this.camera.setCenter(x, y, this.z);
        return this;
    }

    /**
     * Mueve la vista tantas casillas (las flechas del teclado). Mover a mano es salirse de «ver
     * todo», igual que arrastrar.
     */
    desplazar(dx, dy) {
        this.soltarModo();
        this.camera.setCenter(this.camera.centerX + dx, this.camera.centerY + dy, this.z);
        return this;
    }

    // -----------------------------------------------------------------------
    // Escala y encuadre
    // -----------------------------------------------------------------------

    /**
     * Cambia la escala. Si se da un punto del ratón, ese punto SE QUEDA QUIETO.
     *
     * Es lo que hace que la rueda amplíe donde está el ratón y no hacia el centro: se
     * apunta a lo que se quiere ver de cerca y se acerca.
     *
     * @param {number} escala
     * @param {{x: number, y: number}} [foco] coordenadas del ratón, las del evento
     */
    setEscala(escala, foco) {
        const nueva = limitarEscala(escala);

        if (nueva === this.escala) {
            return this;
        }

        if (foco && this.map) {
            // El punto del mundo y su sitio en el lienzo se toman ANTES de cambiar la
            // escala: son los que hay que dejar donde estaban.
            const mundo = this.puntoMundo(foco.x, foco.y);

            this.escala = nueva;
            this.camera.tileSize = TILE * nueva;

            const centro = centroParaFijarPunto(mundo, this.puntoCanvas(foco.x, foco.y),
                this.vista, this.camera.tileSize, floorOffset(this.z, this.camera.z));

            this.camera.setCenter(centro.x, centro.y, this.z);
        } else {
            this.escala = nueva;
            this.camera.tileSize = TILE * nueva;
        }

        // Tocar el zoom es salirse de "mapa completo": ya no se está viendo entero.
        this.modo = 'vista';
        this._publicarVista();

        return this;
    }

    /** Un paso de zoom. @param {number} direccion positiva acerca */
    zoom(direccion, foco) {
        return this.setEscala(siguienteEscala(this.escala, direccion), foco);
    }

    /**
     * Sale del modo "mapa completo" sin tocar la escala.
     *
     * Lo usa el arrastre: quien mueve el mapa a mano ya no está mirándolo entero, y si
     * la ventana cambiara de tamaño no debe reencuadrarlo por su cuenta.
     */
    soltarModo() {
        if (this.modo !== 'vista') {
            this.modo = 'vista';
            this._publicarVista();
        }
        return this;
    }

    /** "Ver todo": el mapa entero, ajustado a la ventana. */
    ajustar() {
        this._encajar();
        this.modo = 'todo';
        this._publicarVista();
        return this;
    }

    /** La vista normal: escala 1, sin mover la cámara de donde estaba. */
    vistaNormal() {
        this.modo = 'vista';
        this.escala = ESCALA_NORMAL;
        this.camera.tileSize = TILE;
        this._publicarVista();
        return this;
    }

    _encajar() {
        if (!this.map) {
            return;
        }

        const escala = escalaDeAjuste(this.map.width, this.map.height,
            this.camera.width, this.camera.height, TILE, MARGEN_AJUSTE);

        this.escala = escala;
        this.camera.tileSize = TILE * escala;

        const centro = centroDeMapa(this.map.width, this.map.height);
        this.camera.setCenter(centro.x, centro.y, this.z);
    }

    _publicarVista() {
        this.onVista({
            escala: this.escala,
            texto: formatoDeEscala(this.escala),
            modo: this.modo
        });
    }

    // -----------------------------------------------------------------------
    // Del ratón al mundo
    // -----------------------------------------------------------------------

    /** Un punto del ratón, en píxeles del lienzo. */
    puntoCanvas(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();

        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    /** El punto del mundo —con decimales— que hay bajo un píxel del lienzo. */
    puntoMundo(clientX, clientY) {
        const punto = this.puntoCanvas(clientX, clientY);
        const corrimiento = floorOffset(this.z, this.camera.z);

        return {
            x: (punto.x - this.camera.width / 2) / this.tileSize +
                this.camera.centerX - corrimiento.x,
            y: (punto.y - this.camera.height / 2) / this.tileSize +
                this.camera.centerY - corrimiento.y
        };
    }

    /** La celda bajo un punto del lienzo. */
    cellAt(clientX, clientY) {
        const punto = this.puntoCanvas(clientX, clientY);
        return this.camera.screenToWorld(punto.x, punto.y, this.z);
    }

    // -----------------------------------------------------------------------
    // Dibujo
    // -----------------------------------------------------------------------

    draw(hoverInfo) {
        const ctx = this.ctx;
        const vista = this.vista;

        // EL MISMO COLOR CON EL QUE EL JUEGO LIMPIA SU LIENZO. Ver `COLOR_SIN_SUELO`: es lo que
        // se ve por los píxeles transparentes de un suelo, así que tiene que ser el mismo en el
        // editor y en el juego o un suelo con transparencia se vería distinto en cada sitio.
        ctx.fillStyle = COLOR_SIN_SUELO;
        ctx.fillRect(0, 0, vista.ancho, vista.alto);

        if (!this.map) {
            return;
        }

        this._drawFloorBackground();
        this._drawMapBorder();

        const ops = buildDrawList(this.map, this._camaraAcotada(), {
            now: 0,
            // Sólo la planta que se está editando. Ver las de arriba y abajo está bien
            // en un juego y estorba en un editor: al pintar hay que ver lo que se pinta.
            onlyCurrentFloor: true
        });

        /*
         * EL OBJETO ELEGIDO Y LAS CASILLAS DEL RESPAWN SE AVERIGUAN UNA VEZ POR FOTOGRAMA, no
         * por operación de dibujo. En «ver todo» un mapa de 128x128 son 16.384 casillas, y
         * preguntar por cada una si cae dentro de algún respawn serían 160.000 comprobaciones
         * por fotograma para pintar diez áreas.
         */
        const elegido = this.map.objetoElegido();
        const enRespawn = this._celdasEnRespawn();
        const enZona = this._celdasEnZona();

        ops.forEach((op) => {
            if (op.kind === DRAW.CREATURE) {
                return;
            }
            this._drawSprite(op, { elegido: elegido, enRespawn: enRespawn, enZona: enZona });
        });

        this._drawFlags();
        this._drawMarkers();
        this._drawGrid();
        // El fantasma va DESPUÉS de la rejilla —para que las líneas no le cruzen el dibujo— y
        // ANTES del aviso de la casilla, que es lo último y tiene que leerse siempre.
        this._drawCompuestos();
        this._drawFantasma();
        this._drawFantasmaDeCompuesto();
        this._drawRecuadro();
        // Lo que dibujan las herramientas de edición (selección, pegado, casas...): ver
        // `herramientas.js`. Va antes del aviso de la casilla, que es lo último.
        if (this.alDibujar) {
            this.alDibujar(this);
        }
        this._drawHover(hoverInfo);
    }

    /**
     * Las casillas de la planta que caen dentro de algún respawn, como un conjunto de claves.
     *
     * Se calcula de las ÁREAS y no preguntando casilla a casilla: las áreas son pequeñas —el
     * cuadrado de 2*radio+1— y hay pocas, así que recorrerlas cuesta menos que preguntarle al
     * mapa por cada tile que se dibuja.
     */
    _celdasEnRespawn() {
        const celdas = new Set();

        if (!this.map || !this.map.spawns) {
            return celdas;
        }

        this.map.spawns.forEach((area) => {
            if (area.z !== this.z) {
                return;
            }

            const radio = Math.max(0, Math.trunc(Number(area.radius)) || 0);

            for (let y = area.y - radio; y <= area.y + radio; y += 1) {
                for (let x = area.x - radio; x <= area.x + radio; x += 1) {
                    celdas.add(clave(x, y, area.z));
                }
            }
        });

        return celdas;
    }

    /**
     * Las casillas de la planta que están PROTEGIDAS, como un conjunto de claves.
     *
     * Es el hermano de `_celdasEnRespawn` y existe por el mismo motivo: el tinte de cada objeto se
     * decide una vez por fotograma y no una vez por operación de dibujo. Se recorren las zonas —que
     * son bloques de casillas contiguas— y no las casillas del mapa, así que cuesta lo que ocupa la
     * protección y no lo que ocupa el mapa.
     */
    _celdasEnZona() {
        const celdas = new Set();

        if (!this.map) {
            return celdas;
        }

        bloquesProtegidos(this.map, this.z).forEach((bloque) => {
            bloque.celdas.forEach((celda) => celdas.add(clave(celda.x, celda.y, bloque.z)));
        });

        return celdas;
    }

    /**
     * La cámara que se le da al orden de dibujo, con el rectángulo visible ACOTADO al
     * mapa.
     *
     * El cliente no lo necesita: su cámara va pegada al jugador y nunca mira lejos del
     * mapa. El editor sí, y por una razón medida: en "ver todo" la cámara se pone en el
     * centro, y el rectángulo visible es el de la VENTANA, no el del mapa. Con el mapa
     * de la ciudad (128x128) eso son 16.384 casillas, que ya es todo el mapa; pero al
     * alejar un mapa grande la ventana pediría un cuadrado mucho mayor, y recorrerlo
     * entero cada fotograma para no dibujar nada es trabajo tirado.
     *
     * Acotarlo no cambia ni un píxel del resultado: fuera del mapa, el mundo del editor
     * devuelve `null` y el orden de dibujo ya lo saltaba. Lo único que cambia es cuántas
     * veces se pregunta.
     */
    _camaraAcotada() {
        const camera = this.camera;
        const mapa = this.map;

        return {
            get z() {
                return camera.z;
            },
            worldToScreen(x, y, z) {
                return camera.worldToScreen(x, y, z);
            },
            visibleRect(z) {
                const rect = camera.visibleRect(z);

                return {
                    x0: Math.max(0, rect.x0),
                    y0: Math.max(0, rect.y0),
                    x1: Math.min(mapa.width - 1, rect.x1),
                    y1: Math.min(mapa.height - 1, rect.y1)
                };
            }
        };
    }

    /**
     * El suelo por defecto de la planta.
     *
     * Es el suelo de casi todas las casillas, pintado de UNA vez en lugar de celda a
     * celda: sin esto habría que dibujar 4.096 celdas idénticas por planta, y además
     * taparía lo que se está editando.
     *
     * SE PINTA SÓLO DENTRO DEL MAPA, y eso es nuevo: antes se cubría el rectángulo
     * entero con margen, así que fuera del mapa se veía el mismo suelo que dentro y no
     * había forma de saber dónde acaba. Con el mapa de la ciudad, que no llena la
     * ventana ni de lejos, eso hacía imposible ver sus límites.
     *
     * Y NO SE PINTA DEBAJO DE LAS CASILLAS QUE TIENEN SU PROPIO SUELO, que es el arreglo de un
     * fallo que se veía como si los suelos se apilaran. El fondo cubre el mapa entero, así que
     * una casilla con suelo propio lo tenía DEBAJO, y el suelo de la hoja tiene píxeles
     * transparentes: por los agujeros se veía el suelo de la planta, o sea los dos a la vez,
     * cuando en el archivo hay uno solo. En el juego no pasa porque no hay fondo: cada casilla
     * se dibuja sobre el vacío. Aquí se imita eso borrando el fondo de esas casillas antes de
     * dibujarlas, y son pocas —las que el mapa escribe—, así que sigue siendo una operación de
     * dibujo por casilla y no 16.384.
     */
    _drawFloorBackground() {
        const paso = this.tileSize;
        const origen = this.camera.worldToScreen(0, 0, this.z);
        const ancho = this.map.width * paso;
        const alto = this.map.height * paso;

        const typeId = this.map.defaultGroundFor(this.z);
        const sprite = this.provider.get(typeId);

        this.ctx.fillStyle = this._rellenoDeSuelo(typeId, sprite, origen, paso);
        this.ctx.fillRect(origen.x, origen.y, ancho, alto);

        this._borrarFondoDeSuelosPropios(paso);
    }

    /**
     * Deja sin fondo las casillas que tienen suelo propio.
     *
     * SE BORRA CON EL MISMO RECTÁNGULO CON EL QUE SE DIBUJA SU SUELO —redondeado a píxel
     * entero, como todo lo que se pinta en una casilla—, y eso no es un detalle: el fondo es un
     * patrón que va anclado a la rejilla con su parte fraccionaria, y con la cámara en una
     * coordenada con decimales los dos rectángulos pueden no coincidir al píxel. Redondeando
     * igual que los sprites, lo que quede de diferencia es la misma franja de menos de un píxel
     * que ya hay hoy entre el patrón y cualquier suelo, y no una franja nueva.
     */
    _borrarFondoDeSuelosPropios(paso) {
        this.ctx.fillStyle = COLOR_SIN_SUELO;

        // Sólo las que se ven: ver `casillasConSueloPropio`, que explica por qué se le pasa el
        // rectángulo en vez de dejar que devuelva las 2.825 del mapa de la ciudad.
        const rect = this._camaraAcotada().visibleRect(this.z);

        this.map.casillasConSueloPropio(this.z, rect).forEach((casilla) => {
            const pantalla = this.camera.worldToScreen(casilla.x, casilla.y, this.z);

            this.ctx.fillRect(Math.round(pantalla.x), Math.round(pantalla.y), paso, paso);
        });
    }

    /** El borde del mapa, para que se vea dónde acaba aunque el suelo de fuera sea igual. */
    _drawMapBorder() {
        const paso = this.tileSize;
        const origen = this.camera.worldToScreen(0, 0, this.z);

        this.ctx.strokeStyle = 'rgba(120,140,180,0.55)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(Math.round(origen.x) + 0.5, Math.round(origen.y) + 0.5,
            Math.round(this.map.width * paso) - 1, Math.round(this.map.height * paso) - 1);
    }

    /**
     * El relleno del suelo por defecto: un patrón anclado a la rejilla.
     *
     * Un patrón y no un color plano porque el suelo de verdad es un dibujo de 32x32 con
     * su textura, y el juego lo pinta casilla a casilla. Repetirlo es una sola operación
     * de dibujo y se ve igual, que es lo que permite ver el mapa entero sin que se
     * arrastre.
     *
     * El anclaje importa: el patrón se alinea con la rejilla de casillas, no con el
     * lienzo, o la textura y los tiles quedarían desfasados y el mapa parecería moverse
     * al arrastrarlo. Se hace con `setTransform`, que es lo que permite escalar el
     * patrón además de moverlo.
     *
     * Si no se puede —un navegador sin `setTransform`, o un sprite al que no se le puede
     * leer el color— se cae a un color plano sacado del propio dibujo. Es peor, y es
     * infinitamente mejor que un fondo negro.
     */
    _rellenoDeSuelo(typeId, sprite, origen, paso) {
        if (!sprite || !sprite.canvas) {
            return '#1a1a20';
        }

        let entrada = this.suelos.get(typeId);

        // El proveedor devuelve un sprite DISTINTO cuando pasa del respaldo de
        // procedimiento al dibujo bueno, así que la caché se invalida comparando la
        // identidad y no el identificador.
        if (!entrada || entrada.sprite !== sprite) {
            entrada = {
                sprite: sprite,
                patron: null,
                color: this._colorDeSuelo(sprite)
            };

            if (this.ctx.createPattern) {
                const patron = this.ctx.createPattern(sprite.canvas, 'repeat');
                // Sin `setTransform` no se puede escalar el patrón, y un patrón sin
                // escalar está mal en cuanto la escala no es 1: mejor el color plano.
                const sePuedeAnclar = patron && patron.setTransform &&
                    typeof DOMMatrix !== 'undefined';
                entrada.patron = sePuedeAnclar ? patron : null;
            }

            this.suelos.set(typeId, entrada);
        }

        if (!entrada.patron) {
            return entrada.color;
        }

        const escala = paso / TILE;

        entrada.patron.setTransform(new DOMMatrix([
            escala, 0, 0, escala, resto(origen.x, paso), resto(origen.y, paso)
        ]));

        return entrada.patron;
    }

    /** El color medio de un dibujo, para cuando no se puede usar como patrón. */
    _colorDeSuelo(sprite) {
        const lienzo = sprite && sprite.canvas;

        if (!lienzo || !lienzo.getContext) {
            return '#2a2a30';
        }

        try {
            const ctx = lienzo.getContext('2d');
            const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;

            let rojo = 0;
            let verde = 0;
            let azul = 0;
            let cuantos = 0;

            for (let indice = 0; indice < datos.length; indice += 4) {
                if (datos[indice + 3] === 0) {
                    continue;
                }
                rojo += datos[indice];
                verde += datos[indice + 1];
                azul += datos[indice + 2];
                cuantos += 1;
            }

            if (cuantos === 0) {
                return '#2a2a30';
            }

            return 'rgb(' + Math.round(rojo / cuantos) + ',' +
                Math.round(verde / cuantos) + ',' + Math.round(azul / cuantos) + ')';
        } catch (error) {
            // Un lienzo contaminado por una imagen de otro origen lanza aquí. El suelo
            // se ve de un gris neutro y el editor sigue funcionando.
            return '#2a2a30';
        }
    }

    /**
     * Un sprite en su casilla, con el tinte que le toque.
     *
     * LA CUENTA DEL ANCLA ES LA DEL CLIENTE, con la escala metida dentro: el renderer
     * dibuja en `sy - anchorY + TILE`, y aquí `anchorY` está en píxeles del sprite y el
     * tile en píxeles de pantalla, así que el ancla se multiplica por la escala. Sin
     * ese factor, al alejar el mapa los objetos se despegarían de su casilla.
     *
     * EL TINTE SE DECIDE EN `tintes.js` y aquí sólo se aplica: si es el verde del elegido, el
     * morado de un respawn o ninguno es una decisión de color, y las decisiones de color se
     * comprueban sin navegador. Lo que se decide aquí es a QUÉ operación le toca, que es lo que
     * sólo se sabe teniendo la lista de dibujo delante.
     */
    _drawSprite(op, contexto) {
        const sprite = this.provider.get(op.typeId, undefined, op);

        if (!sprite || !sprite.canvas) {
            return;
        }

        const paso = this.tileSize;
        const escala = paso / TILE;
        const tinte = tinteDeElemento({
            elegido: this._esElElegido(op, contexto && contexto.elegido),
            enRespawn: !!(contexto && contexto.enRespawn &&
                contexto.enRespawn.has(clave(op.x, op.y, op.z))),
            enZona: !!(contexto && contexto.enZona &&
                contexto.enZona.has(clave(op.x, op.y, op.z))),
            esSuelo: op.kind === DRAW.GROUND
        });

        const lienzo = tinte ? this._tenido(sprite, tinte) : sprite.canvas;

        this.ctx.drawImage(lienzo,
            Math.round(op.sx - (sprite.anchorX || 0) * escala),
            Math.round(op.sy - sprite.anchorY * escala + paso),
            sprite.canvas.width * escala,
            sprite.canvas.height * escala);
    }

    /**
     * ¿Esta operación de dibujo es el objeto elegido?
     *
     * POR EL `instanceId` Y NO POR EL ID: en una casilla puede haber dos objetos del mismo tipo
     * —dos monedas, dos huellas— y teñir por identificador encendería las dos. El `instanceId`
     * del editor es la posición del objeto en el orden de dibujo de su casilla, que es
     * exactamente lo que distingue a uno del otro.
     */
    _esElElegido(op, elegido) {
        if (!elegido || elegido.x !== op.x || elegido.y !== op.y || elegido.z !== op.z) {
            return false;
        }

        if (op.kind === DRAW.GROUND) {
            return elegido.esSuelo;
        }

        return !elegido.esSuelo && elegido.orden === op.instanceId;
    }

    /**
     * El dibujo de un sprite, teñido de un color.
     *
     * SE HACE EN UN LIENZO APARTE Y NO CON UN RECTÁNGULO ENCIMA. El camino corto —pintar el
     * sprite y luego un `fillRect` translúcido encima— taparía también lo que hay DEBAJO del
     * sprite: el suelo de su casilla y los objetos de más abajo, porque el rectángulo no sabe
     * qué píxeles son del sprite. Con `source-atop` en un lienzo propio sólo se tiñen los píxeles
     * que el sprite pinta, que es lo que se quiere: el objeto se ve verde, el suelo de debajo no.
     *
     * Y SE GUARDA EN UNA CACHÉ porque esto se llama en cada fotograma: el proveedor devuelve
     * siempre el mismo sprite para el mismo dibujo, así que cada sprite se tiñe una vez y luego
     * se reutiliza el lienzo. Sin caché serían dos lienzos nuevos por objeto y por fotograma.
     */
    _tenido(sprite, color) {
        const guardado = this.tenidos.get(sprite);

        if (guardado && guardado[color]) {
            return guardado[color];
        }

        if (typeof document === 'undefined' || !document.createElement) {
            return sprite.canvas;
        }

        const lienzo = document.createElement('canvas');
        lienzo.width = sprite.canvas.width;
        lienzo.height = sprite.canvas.height;

        const ctx = lienzo.getContext('2d');
        ctx.drawImage(sprite.canvas, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        ctx.globalCompositeOperation = 'source-over';

        const porColor = guardado || {};
        porColor[color] = lienzo;
        this.tenidos.set(sprite, porColor);

        return lienzo;
    }


    /** Los compuestos colocados en la planta: un contorno discontinuo y su nombre. */
    _drawCompuestos() {
        if (!this.map || !this.map.compuestosDePlanta) {
            return;
        }
        const paso = this.tileSize;
        this.ctx.save();
        this.map.compuestosDePlanta(this.z).forEach((c) => {
            this.ctx.setLineDash(c.elegido ? [] : [4, 3]);
            this.ctx.strokeStyle = c.elegido ? '#ffd24a' : 'rgba(255, 210, 74, 0.45)';
            this.ctx.lineWidth = c.elegido ? 2 : 1;
            c.casillas.forEach((k) => {
                const p = this.camera.worldToScreen(k.x, k.y, this.z);
                this.ctx.strokeRect(p.x + 1, p.y + 1, paso - 2, paso - 2);
            });
            if (c.elegido && paso >= 12) {
                const ancla = c.casillas[c.casillas.length - 1];
                const p = this.camera.worldToScreen(ancla.x, ancla.y, this.z);
                this.ctx.fillStyle = '#ffd24a';
                this.ctx.font = '10px monospace';
                this.ctx.fillText(c.nombre, p.x, p.y + paso + 11);
            }
        });
        this.ctx.restore();
    }

    /** El compuesto de la mano, entero y transparente, con su ancla bajo el ratón. */
    _drawFantasmaDeCompuesto() {
        if (!this.map || !this.hover || !this.compuestoEnLaMano || this.herramienta !== 'compuesto') {
            return;
        }
        const paso = this.tileSize;
        const escala = paso / TILE;
        this.ctx.save();
        this.ctx.globalAlpha = 0.6;
        this.compuestoEnLaMano.forEach((k) => {
            const x = this.hover.x + k.dx;
            const y = this.hover.y + k.dy;
            const dentro = this.map.inBounds(x, y, this.z);
            const p = this.camera.worldToScreen(x, y, this.z);
            const ids = (k.suelo !== undefined ? [k.suelo] : []).concat(k.items.map((i) => i.id));
            ids.forEach((id) => {
                const sprite = this.provider.get(id);
                if (sprite && sprite.canvas) {
                    this.ctx.drawImage(sprite.canvas,
                        Math.round(p.x - (sprite.anchorX || 0) * escala),
                        Math.round(p.y - sprite.anchorY * escala + paso),
                        sprite.canvas.width * escala, sprite.canvas.height * escala);
                }
            });
            this.ctx.strokeStyle = dentro ? '#ffd24a' : '#ff5050';
            this.ctx.strokeRect(p.x + 0.5, p.y + 0.5, paso - 1, paso - 1);
        });
        this.ctx.restore();
    }

    /** El recuadro de «Capturar», desde el primer clic hasta el ratón. */
    _drawRecuadro() {
        if (!this.recuadro || !this.hover) {
            return;
        }
        const paso = this.tileSize;
        const a = this.camera.worldToScreen(Math.min(this.recuadro.x1, this.hover.x), Math.min(this.recuadro.y1, this.hover.y), this.z);
        const ancho = (Math.abs(this.hover.x - this.recuadro.x1) + 1) * paso;
        const alto = (Math.abs(this.hover.y - this.recuadro.y1) + 1) * paso;
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(80, 200, 255, 0.12)';
        this.ctx.fillRect(a.x, a.y, ancho, alto);
        this.ctx.strokeStyle = '#50c8ff';
        this.ctx.setLineDash([5, 3]);
        this.ctx.strokeRect(a.x + 0.5, a.y + 0.5, ancho - 1, alto - 1);
        this.ctx.restore();
    }

    /**
     * EL FANTASMA: lo que va a pasar en el bloque que hay bajo el ratón.
     *
     * El lienzo NO decide qué se enseña —eso es `fantasma.js`, que se comprueba sin navegador—:
     * aquí sólo se le dan las coordenadas de pantalla y el dibujo del objeto, que es lo único que
     * sabe la cámara. Son dos fantasmas y no uno: el de PINTAR lleva el sprite de lo que se lleva
     * en la mano, transparente, para enseñar dónde y cómo va a caer; y el de BORRAR es el bloque
     * rojo sin dibujo, que es lo que resuelve la objeción que tenía el pincel en el borrado (el
     * razonamiento entero está en la cabecera de `fantasma.js` y en la sección del pincel de
     * `editormap.js`).
     *
     * SIN NADA QUE ENSEÑAR NO HAY FANTASMA, que es la mitad de la respuesta a «¿cómo sé que no
     * llevo nada?»: un fantasma que se dibujara igual diría justo lo contrario.
     */
    _drawFantasma() {
        if (!this.map || !this.hover) {
            return;
        }

        const fantasma = fantasmaDeHerramienta(this.herramienta, this.enLaMano, this.borrando,
            this.pincel);

        const casillas = casillasDelFantasma(fantasma, this.hover,
            (x, y) => this.map.inBounds(x, y, this.z));

        dibujarFantasma(this.ctx, fantasma, {
            casillas: casillas,
            pantallaDe: (casilla) => this.camera.worldToScreen(casilla.x, casilla.y, this.z),
            paso: this.tileSize,
            escala: this.tileSize / TILE,
            sprite: fantasma && fantasma.clase === 'pintar'
                ? this.provider.get(fantasma.typeId)
                : null
        });
    }

    /**
     * Las banderas de la planta, como un borde de color.
     *
     * NO SE PUEDEN SACAR DE LA LISTA DE DIBUJO, y por eso se recorren los tiles del
     * mapa: la lista es la del CLIENTE, y al cliente las banderas no le llegan —no
     * viajan en el protocolo, el cliente de verdad las saca de su propio `.dat`—. Un
     * editor sí tiene que enseñarlas, porque son parte del mapa que se está escribiendo.
     *
     * LA BANDERA DE PROTECCIÓN YA NO SE DIBUJA AQUÍ. Ahora la dibuja SU ZONA, con velo azul celeste
     * casilla a casilla, borde discontinuo y su etiqueta (`dibujarZona` en `marcadores.js`), que es
     * lo que la hace elegible y movible. Dibujarla además aquí sería una línea por casilla encima
     * del velo y dos nombres de la misma cosa. Las demás banderas —`noPvp`, `house`...— siguen
     * como estaban: son propiedades de la casilla y no forman bloques que se muevan.
     */
    _drawFlags() {
        const paso = this.tileSize;
        const conTexto = paso >= 12;
        let alguno = false;

        this.ctx.strokeStyle = '#4ad0ff';
        this.ctx.lineWidth = 2;

        this.map.tiles.forEach((tile) => {
            if (tile.z !== this.z || tile.flags.length === 0) {
                return;
            }

            const banderas = tile.flags.filter((bandera) => bandera !== BANDERA_ZONA);

            if (banderas.length === 0) {
                return;
            }

            const pantalla = this.camera.worldToScreen(tile.x, tile.y, tile.z);
            this.ctx.strokeRect(pantalla.x + 1, pantalla.y + 1, paso - 2, paso - 2);

            if (!conTexto) {
                return;
            }

            if (!alguno) {
                this.ctx.fillStyle = '#4ad0ff';
                this.ctx.font = '9px monospace';
                this.ctx.textAlign = 'left';
                alguno = true;
            }

            this.ctx.fillText(banderas.join(',').slice(0, 14), pantalla.x + 3, pantalla.y + 10);
        });
    }

    /**
     * LOS MARCADORES: respawns, los monstruos que viven dentro, NPC y waypoints.
     *
     * EL DIBUJO NO SE DECIDE AQUÍ, se decide en `marcadores.js`, y la razón es que aquí no se
     * puede probar: este archivo importa la cámara y el orden de dibujo del cliente con rutas
     * del montaje (`/jetyum/js/...`), que en Node no existen. Lo que sí se decide aquí son
     * las coordenadas de pantalla y el tiempo del parpadeo, que es lo único que necesita el
     * lienzo.
     *
     * El tiempo sale de `performance.now()` y NO de un contador propio: los fuegos de todos los
     * respawns tienen que parpadear a la vez, y con un contador por marcador cada uno iría a su
     * aire. Es presentación, así que no se prueba; lo que se prueba es la forma, con un tiempo
     * fijo.
     */
    _drawMarkers() {
        const paso = this.tileSize;
        const conEtiqueta = paso >= 16;
        const t = typeof performance !== 'undefined' && performance.now
            ? performance.now() : 0;

        marcadoresDePlanta(this.map, this.z, this.seleccion).forEach((marca) => {
            const pantalla = this.camera.worldToScreen(marca.x, marca.y, this.z);

            dibujarMarcador(this.ctx, marca, {
                x: pantalla.x,
                y: pantalla.y,
                paso: paso,
                etiqueta: conEtiqueta,
                t: t
            });
        });
    }

    /**
     * La rejilla de casillas, alineada con el desplazamiento de la planta.
     *
     * Se dibuja SÓLO sobre el mapa y se quita cuando las casillas miden menos de cuatro
     * píxeles: a esa escala una rejilla no es una rejilla, es un velo gris encima del
     * mapa, y en "ver todo" el mapa es justo lo que se quiere mirar.
     */
    _drawGrid() {
        const paso = this.tileSize;

        if (paso < 4 || this.sinRejilla) {
            return;
        }

        const vista = this.vista;
        const origen = this.camera.worldToScreen(0, 0, this.z);
        const derecha = origen.x + this.map.width * paso;
        const abajo = origen.y + this.map.height * paso;

        this.ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();

        for (let x = resto(origen.x, paso); x < vista.ancho; x += paso) {
            if (x < origen.x || x > derecha) {
                continue;
            }
            this.ctx.moveTo(Math.round(x) + 0.5, Math.max(0, origen.y));
            this.ctx.lineTo(Math.round(x) + 0.5, Math.min(vista.alto, abajo));
        }

        for (let y = resto(origen.y, paso); y < vista.alto; y += paso) {
            if (y < origen.y || y > abajo) {
                continue;
            }
            this.ctx.moveTo(Math.max(0, origen.x), Math.round(y) + 0.5);
            this.ctx.lineTo(Math.min(vista.ancho, derecha), Math.round(y) + 0.5);
        }

        this.ctx.stroke();
    }

    /** La celda bajo el cursor y lo que hay en ella. */
    _drawHover(info) {
        if (!this.hover || !this.map.inBounds(this.hover.x, this.hover.y, this.z)) {
            return;
        }

        const paso = this.tileSize;
        const pantalla = this.camera.worldToScreen(this.hover.x, this.hover.y, this.z);

        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(pantalla.x + 1, pantalla.y + 1, paso - 2, paso - 2);

        if (!info || paso < 8) {
            return;
        }

        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'left';

        const ancho = this.ctx.measureText(info).width + 8;
        this.ctx.fillStyle = 'rgba(0,0,0,0.75)';
        this.ctx.fillRect(pantalla.x, pantalla.y - 16, ancho, 15);
        this.ctx.fillStyle = '#e8e8f0';
        this.ctx.fillText(info, pantalla.x + 4, pantalla.y - 5);
    }
}
