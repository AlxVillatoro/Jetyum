/**
 * La paleta: todo lo que se puede pintar, con su dibujo de verdad.
 *
 * DOS PROBLEMAS RESUELVEN ESTE ARCHIVO, y los dos se notaban al editar.
 *
 * 1. NO SALÍA TODO. La paleta se construía con una tabla escrita a mano en el cliente
 *    (`SHAPES` de `sprites.js`), así que sólo aparecían los objetos que a alguien se le
 *    ocurrieron. Ahora sale TODO lo que declara `data/items/items.xml` —los 38 objetos
 *    de hoy, contando el rango 1950-1954 como sus cinco casillas—, y si mañana se añade
 *    uno, aparece solo: la paleta se construye con lo que devuelve el API, que es el
 *    catálogo de verdad.
 *
 * 2. SALÍA UN RECTÁNGULO DE COLOR. El dibujo se pide al MISMO proveedor que usa el
 *    juego, el de los assets (`client/jetyum/assets/things.json` y sus hojas). Que el
 *    editor enseñe el mismo dibujo que
 *    el juego es la misma razón por la que reutiliza la cámara: si cada uno pintara a
 *    su manera, se elegiría un objeto creyendo que es otro.
 *
 * EL DIBUJO TARDA EN LLEGAR, porque son ficheros por HTTP. El proveedor devuelve el
 * respaldo de procedimiento mientras tanto y el dibujo bueno un momento después, así
 * que la paleta se repinta sola cuando el sprite CAMBIA. Se compara la identidad del
 * objeto que devuelve `get()`: si es otro, se vuelve a pintar. Es lo que hace que la
 * paleta se rellene sola sin recargar la página y sin un temporizador a ojo.
 *
 * Y AGRUPADA, porque 510 objetos en una lista corrida no se manejan. Los grupos salen de
 * las BANDERAS del propio `items.xml` y no de una lista de identificadores escrita aquí:
 * una lista hay que acordarse de ampliarla, y eso es justo lo que dejó la paleta
 * incompleta la primera vez. La única excepción es el terreno de la hoja, que tiene su grupo
 * porque es un ARCHIVO y no una propiedad: el motivo está en `GRUPO_HOJA`.
 *
 * Y SE PUEDE NO TENER NADA ELEGIDO. Antes la paleta obligaba a llevar algo en la mano —elegía
 * un objeto sola al abrir un mapa—, así que no había forma de soltarlo y el clic izquierdo
 * siempre pintaba. Ahora `soltar()` deja la paleta sin nada elegido, y ese estado significa
 * algo: el clic izquierdo elige lo que hay en el mapa en vez de pintar encima.
 */

/** Un atributo de `items.xml` está puesto cuando vale cualquiera de estas cosas. */
export function estaPuesto(valor) {
    return valor === 1 || valor === true || valor === '1' || valor === 'true';
}

/**
 * Los grupos, EN ORDEN.
 *
 * El orden es significativo y es lo que hace que cada objeto caiga en un solo grupo: se
 * recorre de arriba abajo y gana el primero que casa. Por eso una mesa —que bloquea el
 * paso Y va encima de las criaturas— sale en muebles y no en muros: de las dos cosas
 * que es, la que se mira al colocarla es que es un mueble.
 */
export const GRUPOS = [
    {
        nombre: 'Suelos',
        motivo: 'el suelo del tile, uno por casilla',
        es: (attributes) => estaPuesto(attributes.isGround)
    },
    {
        nombre: 'Muros y obstáculos',
        motivo: 'impiden caminar',
        es: (attributes) => estaPuesto(attributes.blocksSolid)
    },
    {
        nombre: 'Muebles y adornos',
        motivo: 'se dibujan encima de las criaturas',
        es: (attributes) => estaPuesto(attributes.alwaysOnTop)
    },
    {
        nombre: 'Armas',
        motivo: 'tienen ataque',
        es: (attributes) => attributes.attack !== undefined
    },
    {
        nombre: 'Equipo y protección',
        motivo: 'tienen ranura donde ponerse',
        es: (attributes) => attributes.slotType !== undefined
    },
    {
        nombre: 'Usables',
        motivo: 'tienen un onUse',
        es: (attributes) => estaPuesto(attributes.useable)
    },
    {
        nombre: 'Objetos sueltos',
        motivo: 'se pueden recoger',
        es: (attributes) => estaPuesto(attributes.pickupable)
    }
];

/** Lo que no casa con ningún grupo. Siempre hay algo: un portal, una huella... */
export const GRUPO_OTROS = 'Otros';

/**
 * EL TERRENO DE LA HOJA, EN SU PROPIO GRUPO.
 *
 * `tilesheet.png` tiene 490 casillas y 472 son objetos —los ids 5000 a 5489, con
 * `indice = fila * 10 + columna`—, así que la paleta tiene 510 botones y 412 de ellos caían en
 * un único grupo, «Muebles y adornos», donde el buscador era la única forma de encontrar algo.
 * Con su propio grupo la hoja se puede RECORRER: el grupo se enseña en una rejilla de 10
 * columnas, así que una fila de botones es una fila de la hoja, y buscar un dibujo es mirarlo.
 *
 * ESTE GRUPO NO SALE DE LAS BANDERAS, y es la única excepción, con su motivo: la hoja es un
 * ARCHIVO con una numeración propia, no una propiedad de los objetos. Las banderas de sus 472
 * objetos son valores de partida —unos son suelo y otros decoración— y por eso mismo reparten la
 * hoja entre los grupos de siempre, que es justo lo que impide recorrerla.
 *
 * El rango es el de la regla de ids de `items.xml` (`id = 5000 + indice`), no una lista de ids
 * escrita aquí: si mañana se añade una casilla a la hoja, cae en el grupo sola.
 */
export const GRUPO_HOJA = 'Terreno (hoja)';

/** El rango de ids de la hoja de terreno, y sus columnas: son la regla de `items.xml`. */
export const HOJA_TERRENO = { desde: 5000, hasta: 5489, columnas: 10 };

/** ¿Este identificador es una casilla de la hoja de terreno? */
export function esDeLaHoja(id) {
    const valor = Number(id);
    return Number.isFinite(valor) && valor >= HOJA_TERRENO.desde && valor <= HOJA_TERRENO.hasta;
}

/**
 * En qué grupo cae un objeto, mirando sólo sus atributos.
 *
 * @param {Object} attributes los de `items.xml`
 * @returns {string}
 */
export function grupoDeItem(attributes) {
    const propios = attributes || {};
    const encontrado = GRUPOS.find((grupo) => grupo.es(propios));

    return encontrado ? encontrado.nombre : GRUPO_OTROS;
}

/**
 * En qué grupo se enseña un objeto DEL CATÁLOGO, que es la pregunta que hace la paleta.
 *
 * Es `grupoDeItem` más la excepción de la hoja: primero se mira si el objeto es una casilla de
 * `tilesheet.png` y, si no lo es, se pregunta por sus banderas. Se separa de `grupoDeItem` para
 * que la regla de las banderas siga siendo exactamente la misma —y siga significando lo mismo
 * cuando se pregunta por unos atributos sueltos— y para que la excepción esté en un solo sitio,
 * a la vista.
 *
 * @param {{id: number, attributes: Object}} definicion
 * @returns {string}
 */
export function grupoDeCatalogo(definicion) {
    if (definicion && esDeLaHoja(definicion.id)) {
        return GRUPO_HOJA;
    }

    return grupoDeItem(definicion ? definicion.attributes : {});
}

/**
 * El orden en el que se pintan los grupos, para que la paleta no baile entre recargas.
 *
 * La hoja va PRIMERO porque es el grupo que se recorre mirándolo y el que más crece; los suelos
 * de siempre y los muebles, que se eligen por nombre, quedan debajo.
 */
export function nombresDeGrupo() {
    return [GRUPO_HOJA].concat(GRUPOS.map((grupo) => grupo.nombre), [GRUPO_OTROS]);
}

/** El lado, en píxeles, del dibujo de una casilla. Es el del cliente. */
const LADO = 32;

/**
 * La caja de los píxeles no transparentes de un lienzo, o null si está vacío o no se puede leer
 * (un lienzo contaminado por una imagen de otro origen lanza al leerlo).
 */
export function cajaVisible(lienzo) {
    if (!lienzo || !lienzo.getContext) {
        return null;
    }
    // Leer los píxeles es caro (el navegador los baja de la tarjeta gráfica): una vez por dibujo.
    if (CAJAS.has(lienzo)) {
        return CAJAS.get(lienzo);
    }
    const caja = medirCaja(lienzo);
    CAJAS.set(lienzo, caja);
    return caja;
}

/** La caja ya medida de cada dibujo (los proveedores guardan cada dibujo en su lienzo). */
const CAJAS = new WeakMap();

function medirCaja(lienzo) {
    try {
        const datos = lienzo.getContext('2d').getImageData(0, 0, lienzo.width, lienzo.height).data;
        let x0 = lienzo.width;
        let y0 = lienzo.height;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < lienzo.height; y += 1) {
            for (let x = 0; x < lienzo.width; x += 1) {
                if (datos[(y * lienzo.width + x) * 4 + 3] === 0) {
                    continue;
                }
                if (x < x0) { x0 = x; }
                if (y < y0) { y0 = y; }
                if (x > x1) { x1 = x; }
                if (y > y1) { y1 = y; }
            }
        }
        return x1 < 0 ? null : { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
    } catch (error) {
        return null;
    }
}

/**
 * PINTA UN DIBUJO ENTERO DENTRO DE UN HUECO de `lado` x `lado`: recortado a lo que tiene píxeles,
 * centrado y, si no cabe, REDUCIDO. Es lo que hace que en una paleta se vea el objeto completo:
 * uno de dos casillas de alto (1x2), uno de 2x2 o uno que sólo tiene dibujo en dos de sus cuatro
 * casillas (una pieza diagonal) se enseñan enteros en vez de cortados a la casilla del ancla. Lo
 * que cabe se pinta a su tamaño, píxel a píxel; lo que se reduce, suavizado (reducir sin suavizar
 * se come las líneas finas).
 *
 * @param {CanvasRenderingContext2D} ctx el del hueco (se limpia antes)
 * @param {number} lado el lado del hueco
 * @param {HTMLCanvasElement} origen el dibujo compuesto (todas sus casillas)
 */
export function pintarEncajado(ctx, lado, origen) {
    ctx.clearRect(0, 0, lado, lado);
    const caja = cajaVisible(origen) || { x: 0, y: 0, ancho: origen.width, alto: origen.height };
    const escala = Math.min(1, lado / caja.ancho, lado / caja.alto);
    const ancho = caja.ancho * escala;
    const alto = caja.alto * escala;
    ctx.imageSmoothingEnabled = escala < 1;
    ctx.drawImage(origen, caja.x, caja.y, caja.ancho, caja.alto,
        Math.round((lado - ancho) / 2), Math.round((lado - alto) / 2), ancho, alto);
}

/**
 * La paleta en pantalla.
 *
 * Recibe las definiciones de `items.xml` y un proveedor de sprites, y construye un
 * botón por objeto con su dibujo dentro. No sabe nada de mapas: quien la usa decide qué
 * hacer cuando se elige un objeto.
 */
export class PaletteView {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.contenedor donde se construye la lista
     * @param {Object} options.proveedor el proveedor de sprites del cliente
     * @param {Function} options.onElegir se llama con (definición, esSuelo)
     */
    constructor(options) {
        const opts = options || {};

        this.contenedor = opts.contenedor;
        this.proveedor = opts.proveedor;
        this.onElegir = opts.onElegir || (() => {});

        /** Una entrada por objeto pintable: su definición, su botón y su dibujo. */
        this.entradas = [];

        this.elegido = null;
        this.filtro = '';
        /** La categoría a la vista (el «tileset» de RME); vacía, todas. */
        this.grupo = '';
        /** El último que se enseñó con `mostrar`: desde él siguen las flechas si no hay nada elegido. */
        this.mostrado = null;

        /*
         * SÓLO SE PINTA LO QUE SE VE. La paleta tiene miles de botones y pintarlos todos al abrir
         * un mapa (cada dibujo hay que medirlo) dejaba el navegador sin responder: cada botón se
         * pinta cuando entra en pantalla (o le falta poco). Donde no hay `IntersectionObserver`
         * (las pruebas) se pintan todos, como antes.
         */
        this.porBoton = new Map();
        this.observador = typeof IntersectionObserver === 'undefined' ? null
            : new IntersectionObserver((cambios) => {
                cambios.forEach((cambio) => {
                    const entrada = this.porBoton.get(cambio.target);
                    if (!entrada) {
                        return;
                    }
                    entrada.enVista = cambio.isIntersecting;
                    if (entrada.enVista) {
                        this._refrescar(entrada);
                    }
                });
            }, { rootMargin: '300px 0px' });
    }

    /**
     * Construye la paleta entera.
     *
     * @param {Map<number, Object>} itemTypes las definiciones, por id
     */
    setItems(itemTypes) {
        if (this.observador) {
            this.observador.disconnect();
        }
        this.porBoton.clear();
        this.contenedor.innerHTML = '';
        this.entradas = [];
        this.elegido = null;

        const porGrupo = new Map();
        nombresDeGrupo().forEach((nombre) => porGrupo.set(nombre, []));

        itemTypes.forEach((definicion) => {
            const grupo = grupoDeCatalogo(definicion);
            porGrupo.get(grupo).push(definicion);
        });

        nombresDeGrupo().forEach((nombre) => {
            const lista = porGrupo.get(nombre);

            // Un grupo vacío no se pinta: un título sin nada debajo es ruido.
            if (lista.length === 0) {
                return;
            }

            const titulo = document.createElement('div');
            titulo.className = 'palette-title';
            titulo.dataset.grupo = nombre;
            titulo.textContent = nombre + ' (' + lista.length + ')';
            this.contenedor.appendChild(titulo);

            // Dentro de un grupo, por identificador: el orden del archivo es el orden en
            // el que se escribieron, y buscar el 2413 entre el 2400 y el 2416 es más
            // fácil si van seguidos.
            lista.sort((a, b) => a.id - b.id).forEach((definicion) => {
                this.contenedor.appendChild(this._boton(titulo, definicion));
            });
        });

        this._aplicarFiltro();
        this.refrescarPendientes();
        return this;
    }

    /** Un botón de la paleta, con su lienzo. */
    _boton(titulo, definicion) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'palette-item' +
            (titulo.dataset.grupo === GRUPO_HOJA ? ' hoja' : '');
        boton.dataset.id = String(definicion.id);
        boton.dataset.grupo = titulo.dataset.grupo;
        // El nombre y el id son DATOS (los de items.xml), no textos de la interfaz: no se traducen.
        // Pasarlos por el traductor (miles de botones, cada uno contra todo el diccionario) era lo
        // más lento de abrir un mapa. Los títulos de las secciones sí se traducen.
        boton.setAttribute('translate', 'no');

        /*
         * EL NOMBRE COMPLETO VA EN EL `title`, que es lo único que cabe: en la rejilla de la
         * hoja cada botón mide 24 píxeles, y ahí no entra ni el identificador. El nombre del
         * objeto y su id siguen estando, en el globo del ratón, y la rejilla gana poder
         * RECORRER la hoja mirándola, que es lo que no se podía hacer con 412 botones en una
         * lista.
         */
        boton.title = (definicion.name || ('objeto ' + definicion.id)) + ' (' + definicion.id + ')';

        const lienzo = document.createElement('canvas');
        lienzo.className = 'palette-dibujo';
        lienzo.width = LADO;
        lienzo.height = LADO;

        const nombre = document.createElement('span');
        nombre.className = 'palette-nombre';
        nombre.textContent = definicion.name || ('objeto ' + definicion.id);

        const id = document.createElement('em');
        id.textContent = String(definicion.id);

        boton.appendChild(lienzo);
        boton.appendChild(nombre);
        boton.appendChild(id);

        const entrada = {
            definicion: definicion,
            boton: boton,
            lienzo: lienzo,
            titulo: titulo,
            /** El último sprite pintado, para saber cuándo hay uno nuevo. */
            pintado: null,
            /** Si está en pantalla (o cerca): sólo esos se pintan. */
            enVista: !this.observador
        };

        boton.addEventListener('click', () => {
            this._elegir(entrada);
        });

        this.entradas.push(entrada);
        this.porBoton.set(boton, entrada);
        if (this.observador) {
            this.observador.observe(boton);
        }

        return boton;
    }

    _elegir(entrada) {
        const definicion = entrada.definicion;
        const esSuelo = estaPuesto((definicion.attributes || {}).isGround);

        this.elegido = definicion.id;

        this.entradas.forEach((otra) => {
            otra.boton.classList.toggle('selected', otra === entrada);
        });

        this.onElegir(definicion, esSuelo);
    }

    /**
     * Marca un objeto como elegido sin pasar por el clic.
     *
     * Es lo que devuelve la mano a donde estaba al recargar un mapa: el objeto elegido no cambia
     * porque se abra otro mapa, y volver a empezar de cero obligaría a buscarlo otra vez.
     * Devuelve `false` si ese id ya no está en el catálogo, y entonces quien llama suelta la
     * selección: es mejor no llevar nada —que es un estado válido— que llevar un identificador
     * que el servidor rechazaría al guardar.
     */
    elegirPorId(id) {
        const entrada = this.entradas.find((candidata) => candidata.definicion.id === Number(id));

        if (entrada) {
            this._elegir(entrada);
        }

        return entrada !== undefined;
    }

    /**
     * LAS FLECHAS EN LA PALETA: elige el que está `paso` botones antes o después del elegido, entre
     * los que están a la vista (con el filtro y la categoría puestos), y lo deja a la vista en la
     * lista, pasando de una sección a la siguiente. Sin nada elegido empieza por el primero.
     * Devuelve si ha elegido algo.
     */
    mover(paso) {
        const visibles = this.entradas.filter((entrada) => !entrada.boton.hidden);
        if (visibles.length === 0) {
            return false;
        }
        // Sin nada elegido, desde el último que se enseñó con `mostrar` (si sigue a la vista).
        const desde = this.elegido !== null ? this.elegido : this.mostrado;
        const actual = visibles.findIndex((entrada) => entrada.definicion.id === desde);
        const indice = actual < 0 ? 0 : Math.max(0, Math.min(visibles.length - 1, actual + paso));
        const destino = visibles[indice];
        if (actual >= 0 && destino === visibles[actual]) {
            return false;
        }
        this._elegir(destino);
        if (destino.boton.scrollIntoView) {
            destino.boton.scrollIntoView({ block: 'nearest' });
        }
        return true;
    }

    /**
     * ENSEÑA UN OBJETO EN LA PALETA, SIN ELEGIRLO: desplaza la lista hasta él y lo resalta un
     * momento. Si el buscador o la categoría lo tapan, los quita (y lo dice: `{ quitoFiltro }`),
     * porque lo que se pide es verlo. Es el «dónde está esto en la paleta» del menú del botón
     * derecho; elegirlo para pintar es otra cosa (`elegirPorId`). Devuelve null si no está.
     */
    mostrar(id) {
        const entrada = this.entradas.find((candidata) => candidata.definicion.id === Number(id));
        if (!entrada) {
            return null;
        }
        let quitoFiltro = false;
        if (entrada.boton.hidden) {
            this.filtro = '';
            this.grupo = '';
            this._aplicarFiltro();
            quitoFiltro = true;
        }
        this.mostrado = entrada.definicion.id;
        if (entrada.boton.scrollIntoView) {
            entrada.boton.scrollIntoView({ block: 'center' });
        }
        entrada.boton.classList.add('resaltado');
        setTimeout(() => entrada.boton.classList.remove('resaltado'), 1600);
        return { quitoFiltro, grupo: entrada.titulo.dataset.grupo };
    }

    /** ¿Lo elegido está en la rejilla de la hoja (donde arriba y abajo saltan una fila entera)? */
    elegidoEnRejilla() {
        const id = this.elegido !== null ? this.elegido : this.mostrado;
        const entrada = this.entradas.find((candidata) => candidata.definicion.id === id);
        return !!entrada && entrada.titulo.dataset.grupo === GRUPO_HOJA;
    }

    /**
     * Suelta lo elegido: la paleta se queda SIN NADA.
     *
     * NO LLAMA A `onElegir`, y es la diferencia con elegir un objeto: soltar no es elegir otro,
     * es dejar de llevar algo. Quien lo pulse tiene que enterarse —el rótulo de la mano y el
     * fantasma desaparecen—, y de eso se encarga `main.js`, que es el que sabe qué hacer con una
     * mano vacía.
     */
    soltar() {
        this.elegido = null;

        this.entradas.forEach((entrada) => {
            entrada.boton.classList.remove('selected');
        });

        return this;
    }

    /**
     * El filtro del buscador.
     *
     * Busca por identificador Y por nombre a la vez, sin distinguir mayúsculas: quien
     * edita un mapa unas veces sabe que la mesa es la 113 y otras que se llama `table`.
     */
    setFiltro(texto) {
        this.filtro = String(texto || '').trim().toLowerCase();
        this._aplicarFiltro();
        return this;
    }

    /**
     * La categoría a la vista, como el desplegable «Tileset» de RME: la paleta enseña solo un
     * grupo y no hay que recorrer los demás. Vacía, enseña todos.
     */
    setGrupo(nombre) {
        this.grupo = String(nombre || '');
        this._aplicarFiltro();
        return this;
    }

    /** Los grupos que tienen algún objeto, en el orden de la paleta, con cuántos tiene cada uno. */
    grupos() {
        const cuenta = new Map();
        this.entradas.forEach((entrada) => {
            const grupo = entrada.titulo.dataset.grupo;
            cuenta.set(grupo, (cuenta.get(grupo) || 0) + 1);
        });
        return [...cuenta].map(([nombre, total]) => ({ nombre, total }));
    }

    _aplicarFiltro() {
        const filtro = this.filtro;
        const grupoVisible = this.grupo;
        const visiblesPorGrupo = new Map();

        this.entradas.forEach((entrada) => {
            const definicion = entrada.definicion;
            const nombre = String(definicion.name || '').toLowerCase();

            const visible = (!grupoVisible || entrada.titulo.dataset.grupo === grupoVisible) &&
                (!filtro ||
                    String(definicion.id).indexOf(filtro) !== -1 ||
                    nombre.indexOf(filtro) !== -1);

            entrada.boton.hidden = !visible;

            if (visible) {
                const grupo = entrada.titulo.dataset.grupo;
                visiblesPorGrupo.set(grupo, (visiblesPorGrupo.get(grupo) || 0) + 1);
            }
        });

        // Un título se esconde cuando el filtro deja su grupo vacío. Sin esto, buscar
        // "espada" dejaría siete títulos y un solo objeto debajo.
        const titulos = new Set(this.entradas.map((entrada) => entrada.titulo));
        titulos.forEach((titulo) => {
            titulo.hidden = (visiblesPorGrupo.get(titulo.dataset.grupo) || 0) === 0;
        });
    }

    /** Cuántos objetos enseña la paleta ahora mismo, para el estado. */
    get visibles() {
        return this.entradas.filter((entrada) => !entrada.boton.hidden).length;
    }

    /**
     * Pinta los dibujos que falten o hayan cambiado.
     *
     * Se llama desde el bucle de dibujo, así que hace lo mínimo: recorre los que aún no
     * tienen dibujo o cuyo sprite es otro que el último pintado, y sale en cuanto no
     * queda ninguno. Cuando la paleta está completa esto es un recorrido de 38
     * comparaciones por fotograma, que no se nota.
     */
    refrescarPendientes() {
        if (!this.proveedor) {
            return 0;
        }

        let pintados = 0;

        this.entradas.forEach((entrada) => {
            if (entrada.enVista && this._refrescar(entrada)) {
                pintados += 1;
            }
        });

        return pintados;
    }

    /** Pinta una entrada si su dibujo ha cambiado. Devuelve si la ha pintado. */
    _refrescar(entrada) {
        if (!this.proveedor) {
            return false;
        }
        const sprite = this.proveedor.get(entrada.definicion.id);

        // `!==` y no `!=`: lo que se compara es la IDENTIDAD del sprite, porque el
        // proveedor devuelve uno distinto cuando pasa del respaldo al dibujo bueno.
        if (!sprite || sprite === entrada.pintado) {
            return false;
        }

        this._pintar(entrada, sprite);
        return true;
    }

    /**
     * Pinta un sprite dentro del hueco de la paleta: ENTERO (`pintarEncajado`).
     *
     * EL DIBUJO SE CENTRA, y hace falta. El de un objeto va APOYADO EN EL SUELO de su
     * casilla —un sprite de 32x32 con una moneda en la mitad de abajo—, así que pintarlo
     * tal cual dejaría la mitad de arriba vacía y el objeto pegado al borde inferior. Y SE
     * REDUCE SI NO CABE: un objeto de varias casillas (1x2, 2x2, una pieza diagonal) se ve
     * completo, no cortado a su casilla del ancla.
     */
    _pintar(entrada, sprite) {
        pintarEncajado(entrada.lienzo.getContext('2d'), LADO, sprite.canvas);
        entrada.pintado = sprite;
    }
}
