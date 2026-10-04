import { SLOT_INSIDE } from '../../../shared/js/protocol.mjs';
import { pintarIconos } from './iconos.js';

/**
 * Los dos paneles del cliente: el equipo -con la mochila- y los stats.
 *
 * POR QUE ESTE ARCHIVO EXISTE, Y POR QUE NO ESTA EN `main.js`.
 *
 * `main.js` ata las piezas y reacciona a lo que llega: es el unico archivo que conoce a
 * todos los demas, y esa es su virtud y su limite. Pintar seis ranuras y dos barras son
 * unas ciento cincuenta lineas de HTML generado que no tienen nada que ver con atar nada:
 * metidas ahi, el archivo que hay que leer para entender el cliente pasa a tener la mitad
 * de su contenido hablando de bordes y de numeros con decimales.
 *
 * Aqui tampoco se decide NADA del juego. Todo lo que se pinta viene de lo que el motor mando:
 * las ranuras del inventario, la vida, la experiencia y el nivel. Este modulo no calcula si algo
 * se puede equipar, ni cuanto pesa, ni cuanta experiencia falta: presenta. Lo unico que consulta
 * son las BANDERAS de `itemtypes.js` -que salen de `items.xml`, las mismas que usa el motor-, y
 * solo para ENSENAR que se puede arrastrar y donde encaja cada cosa: el movimiento lo valida el
 * motor, como todo lo demas.
 *
 * EL DIBUJO DE UN OBJETO lo pone el proveedor de sprites, que es lo que hace que un anillo
 * y una espada no se vean los dos como un cuadrado de color. El proveedor tarda un momento
 * en tener los sprites -los carga por HTTP-, asi que la primera vez devuelve el respaldo o
 * nada: por eso existe `dibujarPendiente()`, que repinta cuando el dibujo de verdad esta
 * listo. Sin eso, el panel se quedaria con el hueco para siempre, porque nada avisa de que
 * el sprite acaba de llegar.
 */

/**
 * Las ranuras de equipo, EN ORDEN DE DIBUJO.
 *
 * El orden es el del cuerpo de arriba abajo -cabeza, mochila, cuerpo, mano, anillo, pies- y
 * no alfabetico ni el del motor: un panel de equipo se lee como un muñeco, y poner la cabeza
 * al lado de los pies obliga a buscarla cada vez.
 *
 * Estan las seis QUE EL MOTOR CONOCE. Si algun dia anade una -el cuello, las piernas-, el
 * panel no la ensena hasta que se anada aqui, y por eso la lista es una constante y no un
 * `if` por cada una: anadir una es anadir una linea.
 *
 * LA MOCHILA ES UNA RANURA MAS, y no un adorno del panel: es un objeto que se pone y se quita
 * como los demas, y lo que llevas DENTRO vive en ella. Antes esto era una lista siempre visible
 * debajo del mapa -el "llevas:"-, y estaba mal por lo que dijo el usuario: sin mochila no se
 * lleva nada, asi que una lista permanente ensenaba cosas que no pueden existir.
 */
const RANURAS = [
    { clave: 'necklace', etiqueta: 'collar' },
    { clave: 'head', etiqueta: 'cabeza' },
    { clave: 'backpack', etiqueta: 'mochila' },
    { clave: 'hand', etiqueta: 'arma' },
    { clave: 'body', etiqueta: 'cuerpo' },
    { clave: 'shield', etiqueta: 'escudo' },
    { clave: 'ring', etiqueta: 'anillo' },
    { clave: 'legs', etiqueta: 'piernas' },
    { clave: 'ammo', etiqueta: 'munición' },
    { clave: 'feet', etiqueta: 'pies' }
];

/** Los nombres de las skills, en el orden de la ventana de Tibia. */
const SKILLS = [
    ['fist', 'Puño'], ['club', 'Maza'], ['sword', 'Espada'], ['axe', 'Hacha'],
    ['distance', 'Distancia'], ['shielding', 'Escudo'], ['fishing', 'Pesca']
];

/**
 * El dibujo que se cuelga del cursor mientras se arrastra.
 *
 * Va en el panel y no en `main.js` porque es parte de la presentacion: un objeto que se mueve
 * tiene que VERSE mientras se mueve, y sin el fantasma el arrastre seria invisible hasta soltarlo.
 */
export function dibujoParaArrastrar(typeId, proveedor) {
    const sprite = proveedor && typeof proveedor.get === 'function'
        ? proveedor.get(typeId)
        : null;

    if (!sprite || !sprite.canvas) {
        return null;
    }

    // Al tamaño con que se ve en el mapa (un dibujo HD, a media escala).
    const copia = document.createElement('canvas');
    copia.width = sprite.drawW || sprite.canvas.width;
    copia.height = sprite.drawH || sprite.canvas.height;

    const ctx = copia.getContext('2d');
    ctx.imageSmoothingEnabled = !!sprite.hd;
    ctx.drawImage(sprite.canvas, 0, 0, copia.width, copia.height);

    return copia;
}

/**
 * Lo que se ensena cuando TODAVIA NO HAY JUGADOR.
 *
 * Antes de entrar al mundo no hay vida, ni nivel, ni experiencia, y el cero no vale como
 * sustituto: `0 / 0` de vida y `nivel 0` son datos falsos que ademas parecen un fallo del
 * motor. Una raya dice exactamente lo que pasa, que es que el dato no ha llegado.
 */
const SIN_DATO = '\u2014';

/**
 * CUANTAS VECES SE DUPLICA LA EXPERIENCIA EN UN NIVEL.
 *
 * ESTO ES UNA APROXIMACION, Y HAY QUE DECIRLO CLARO: el motor manda la experiencia TOTAL
 * acumulada y no la que falta para el siguiente nivel, asi que el cliente no puede calcular
 * el porcentaje exacto. La barra de experiencia es por tanto un progreso APROXIMADO y el
 * numero que va a su lado es el total exacto, que es el dato que sí llego.
 *
 * El factor es el de la progresion real de Tibia -cada nivel pide cerca del doble que el
 * anterior, con la formula cubica de `engine/world/experience.js`-, y se usa como referencia
 * de la DECADA en la que esta el jugador: nivel 9 esta entre la referencia del 8 y la del 16.
 * No pretende ser la formula del motor: pretende que la barra avance al ritmo del juego en
 * vez de quedarse clavada en el 100%.
 *
 * LA SOLUCION BUENA es que el motor mande la experiencia que falta -una linea en
 * `sendStats`, al lado de las otras cuatro-, y entonces esta constante y este comentario
 * desaparecen. No se ha hecho porque el encargo era no tocar `engine/` mas alla de la ranura
 * del inventario.
 */
const FACTOR_NIVEL = 2;

/** La experiencia de referencia del nivel 1. Es la de `experienceForLevel(1)` del motor. */
const EXPERIENCIA_BASE = 100;

/**
 * Los stats, por identificador.
 *
 * Se buscan por identificador en cada actualizacion y NO al cargar el modulo: una busqueda en la
 * parte de arriba reventaria al importar el archivo desde cualquier sitio donde todavia no haya
 * `document` -una prueba, o el propio arranque de la pagina-, y el fallo seria un `TypeError` al
 * importar que no dice nada de lo que falta.
 */
const ID = {
    salud: 'health-bar',
    saludValor: 'health-value',
    experiencia: 'experience-bar',
    experienciaValor: 'experience-value',
    nivel: 'level-value',
    vocacion: 'vocation-value',
    ranuras: 'equipment-slots',
    mochila: 'backpack-items',
    peso: 'weight'
};

/** Lo que ya se ha pintado, para no repetir trabajo en cada fotograma. */
let ultimaFirma = null;

/** Verdadero cuando algun sprite no estaba listo y hay que volver a intentarlo. */
let pendiente = false;

/**
 * Deja el panel de equipo listo, con sus ranuras.
 *
 * Se crean UNA VEZ y luego solo se rellenan. Si se regeneraran en cada actualizacion, el
 * navegador tiraria y volveria a construir los lienzos de los dibujos sesenta veces por
 * segundo y el panel parpadearia.
 *
 * AQUI YA NO HAY MANEJADOR DE CLIC, y es a proposito: antes un clic en una ranura soltaba lo que
 * hubiera puesto, y desde que se arrastra con el raton eso es una trampa. Un clic es el final de un
 * arrastre que no llego a ninguna parte -el raton se suelta encima de donde empezo-, asi que el
 * `click` se dispara igual y el objeto se caeria al suelo sin que nadie lo haya pedido. Para
 * soltar algo estan el arrastre al suelo y el comando `/quitar`.
 */
export function crearPanelEquipo() {
    const contenedor = document.getElementById(ID.ranuras);

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = armazonDeRanuras();
    pintarIconos(contenedor);
    ultimaFirma = null;
}

/**
 * El HTML de las ranuras, todas vacias.
 *
 * Se usa en dos sitios -al crear el panel y al limpiarlo-, y por eso es una funcion: dos
 * copias del mismo HTML son dos sitios donde olvidarse de anadir la ranura nueva.
 *
 * Lleva `data-destino="ranura"` para que el arrastre sepa que ahi se puede soltar algo, y
 * `data-slot` para saber EN CUAL: es lo unico que el cliente necesita para pedir el movimiento,
 * y el motor comprobara despues si la ranura es la que le toca al objeto.
 */
function armazonDeRanuras() {
    // Cada ranura va a su sitio de la rejilla (grid-area = su clave), como el equipo de Tibia, y
    // abajo las dos cajas de almas y capacidad.
    return RANURAS.map((ranura) =>
        '<div class="slot" data-destino="ranura" data-slot="' + ranura.clave +
        '" style="grid-area:' + ranura.clave + '" title="' + ranura.etiqueta + ': vacía">' +
        '<span class="nombre vacia">' + ranura.etiqueta + '</span>' +
        '</div>').join('') +
        '<div class="caja-valor" style="grid-area:soul" title="Almas"><span>alma</span><b id="soul-value">' + SIN_DATO + '</b></div>' +
        '<div class="caja-valor" style="grid-area:cap" title="Capacidad libre (onzas)"><span>cap</span><b id="cap-value">' + SIN_DATO + '</b></div>' +
        // Las hotkeys, junto a la capacidad (también con Ctrl+K).
        '<button type="button" class="boton-icono boton-hotkeys" style="grid-area:hk" data-abrir-hotkeys data-icono="teclado" ' +
        'title="Hotkeys: magias y objetos en F1–F12 (Ctrl+K)" aria-label="Hotkeys"></button>';
}

/**
 * Deja los dos paneles como recien abiertos.
 *
 * Hace falta al perder la conexion y al volver a la pantalla de entrada. El mundo del cliente
 * se tira entero en ese momento, y los paneles son parte de ese mundo: si se quedaran con la
 * vida y el equipo de la sesion anterior, ensenarian un jugador que ya no existe y pareceria
 * que la reconexion ha funcionado.
 */
export function limpiarPaneles() {
    ultimaFirma = null;
    pendiente = false;

    const contenedor = document.getElementById(ID.ranuras);
    if (contenedor) {
        contenedor.innerHTML = armazonDeRanuras();
        pintarIconos(contenedor);
    }

    const mochila = document.getElementById(ID.mochila);
    if (mochila) {
        mochila.innerHTML = '';
    }
    mostrarVentanaMochila(false, null);

    const peso = document.getElementById(ID.peso);
    if (peso) {
        peso.textContent = SIN_DATO + ' / ' + SIN_DATO + ' oz';
        peso.className = '';
    }

    const salud = document.getElementById(ID.salud);
    const saludValor = document.getElementById(ID.saludValor);
    if (salud && saludValor) {
        salud.max = 1;
        salud.value = 0;
        saludValor.textContent = SIN_DATO + ' / ' + SIN_DATO;
    }

    const mana = document.getElementById('mana-bar');
    const manaValor = document.getElementById('mana-value');
    if (mana && manaValor) {
        mana.max = 1;
        mana.value = 0;
        manaValor.textContent = SIN_DATO + ' / ' + SIN_DATO;
    }
    ['skill-vida', 'skill-mana', 'skill-almas', 'skill-cap', 'skill-velocidad', 'skill-stamina']
        .forEach((id) => {
            const e = document.getElementById(id);
            if (e) {
                e.textContent = SIN_DATO;
            }
        });
    const listaSkills = document.getElementById('lista-skills');
    if (listaSkills) {
        listaSkills.innerHTML = '';
    }

    const experiencia = document.getElementById(ID.experiencia);
    const experienciaValor = document.getElementById(ID.experienciaValor);
    if (experiencia && experienciaValor) {
        experiencia.max = 100;
        experiencia.value = 0;
        experienciaValor.textContent = SIN_DATO;
    }

    const nivel = document.getElementById(ID.nivel);
    if (nivel) {
        nivel.textContent = SIN_DATO;
    }

    const vocacion = document.getElementById(ID.vocacion);
    if (vocacion) {
        vocacion.textContent = SIN_DATO;
    }
}

/**
 * Pinta el equipo y la mochila a partir del inventario.
 *
 * QUE ES "EQUIPADO" LO DICE EL MOTOR, no este archivo: el motor manda la RANURA de cada entrada,
 * y equipado es tener una ranura distinta de `inside`. Aqui solo se aplica esa misma regla, sin
 * inventar ninguna marca nueva, para que las dos partes no puedan discrepar.
 *
 * Y LAS DOS MITADES SALEN DEL MISMO DATO: lo que tiene una ranura de equipo va en su casilla, y lo
 * que esta `inside` va a la lista de la mochila. No hay dos mensajes ni dos cuentas.
 *
 * @param {Array} inventario las entradas del inventario, tal y como llegaron
 * @param {Object} proveedor el proveedor de sprites, del que sale el dibujo
 * @param {Object} itemtypes las banderas de los objetos, para saber que es un contenedor
 * @param {Object} [peso] { weight, capacity } en centesimas de onza, si se conocen
 */
export function actualizarEquipo(inventario, proveedor, itemtypes, peso) {
    const contenedor = document.getElementById(ID.ranuras);

    if (!contenedor) {
        return;
    }

    // El panel nace OCULTO y se ensena en cuanto llega el primer inventario. Antes de entrar
    // al mundo no hay equipo que enseñar, y seis casillas vacias sobre la pantalla de entrada
    // solo estorban.
    const entradas = Array.isArray(inventario) ? inventario : [];
    const banderas = itemtypes || { esContenedor: () => false, ranuraDe: () => null };

    /*
     * LA MOCHILA ES LA RANURA DEL QUE NO VA PUESTO.
     *
     * Todo lo que se lleva encima entra con la ranura `inside`, asi que "esta equipado" y "no esta
     * dentro de la mochila" son la misma pregunta. Se pregunta por `inside` y no por la lista de
     * ranuras del equipo a proposito: si el motor anadiera una ranura nueva, lo que caiga en ella
     * se pintaria sola, en vez de quedar invisible hasta que alguien se acordara de anadirla a una
     * lista.
     */
    const porRanura = new Map();

    entradas.forEach((entrada) => {
        if (entrada && entrada.slot !== SLOT_INSIDE && entrada.slot !== undefined) {
            porRanura.set(entrada.slot, entrada);
        }
    });

    /*
     * La firma es lo que dice si algo cambio. El inventario llega entero cada vez -es una
     * decision del motor, para no desincronizarse-, asi que sin esta comprobacion se
     * repintarian los seis lienzos en cada mensaje, aunque fuera el mismo.
     */
    const firma = RANURAS.map((ranura) => {
        const entrada = porRanura.get(ranura.clave);
        return entrada ? entrada.index + ':' + entrada.typeId + ':' + entrada.count : '-';
    }).join('|') + '||' + entradas.filter((e) => e.slot === SLOT_INSIDE)
        .map((e) => e.index + ':' + e.typeId + ':' + e.count).join(',') +
        // El peso entra en la firma porque cambia solo: al subir de nivel sube la capacidad y el
        // inventario es el mismo, asi que sin esto la linea del peso se quedaria con el numero
        // viejo justo cuando el jugador acaba de poder cargar mas.
        '||' + (peso ? peso.weight + '/' + peso.capacity : '');

    if (firma === ultimaFirma) {
        return;
    }
    ultimaFirma = firma;

    pendiente = false;

    /*
     * Y CADA RANURA SE PINTA CON LO QUE LE TOQUE EN ESTE INVENTARIO.
     *
     * No se borra nada antes: las ranuras que ya tenian algo y siguen teniendolo se pintan
     * igual, y las que se han quedado vacias reciben su nombre. Repintar las seis cada vez que
     * cambia una es mas trabajo que tocar solo la que cambio, y a cambio no hay que llevar la
     * cuenta de cual cambio, que es justo el tipo de cuenta que se desincroniza.
     */
    RANURAS.forEach((ranura) => {
        const caja = contenedor.querySelector('[data-slot="' + ranura.clave + '"]');

        if (!caja) {
            return;
        }

        const entrada = porRanura.get(ranura.clave);
        pintarRanura(caja, ranura, entrada, proveedor);
    });

    pintarMochila(entradas, proveedor, banderas, peso);
}

/**
 * Pinta el contenido de la mochila: lo que llevas sin ponerte.
 *
 * CUANDO NO HAY MOCHILA SE DICE, y no se ensena una lista vacia. Son cosas distintas: "no tienes
 * mochila" explica por que no puedes coger nada del suelo, y una lista vacia solo dice que no
 * llevas nada, que es cierto y no explica nada.
 *
 * Cada objeto lleva su INDICE de inventario, que es lo unico que hace falta para pedirle al motor
 * que lo mueva: el cliente no manda el objeto, manda donde esta.
 */
function pintarMochila(entradas, proveedor, itemtypes, peso) {
    const caja = document.getElementById(ID.mochila);
    const pesoCaja = document.getElementById(ID.peso);

    if (!caja) {
        return;
    }

    /*
     * La mochila es el contenedor EQUIPADO: se busca entre lo que esta puesto -ranura distinta de
     * `inside`- porque una mochila dentro de otra no es la que llevas puesta. La bandera la dice
     * `items.xml`, y es la misma que consulta el motor.
     */
    const contenedor = entradas.find((entrada) =>
        entrada.slot !== SLOT_INSIDE && itemtypes.esContenedor(entrada.typeId)) || null;

    const dentro = entradas.filter((entrada) => entrada.slot === SLOT_INSIDE);

    // LA VENTANA DE LA MOCHILA SÓLO EXISTE SI LLEVAS UNA PUESTA: sin mochila no hay nada que
    // enseñar (el gestor de ventanas reparte el sitio al llamar a `colocar`).
    mostrarVentanaMochila(!!contenedor, contenedor);

    // Sus huecos son los de su `containerSize` (20 si items.xml no lo dice): se dibujan todos,
    // los vacíos también, como en Tibia, para que se vea cuánto sitio queda.
    const huecos = !contenedor ? 0 : (itemtypes.huecosDe ? itemtypes.huecosDe(contenedor.typeId) : 20);

    if (!contenedor) {
        caja.innerHTML = '';
    } else {
        caja.innerHTML = dentro.map((entrada) =>
            '<div class="objeto arrastrable" data-index="' + entrada.index + '" ' +
            'title="' + entrada.name + (entrada.count > 1 ? ' x' + entrada.count : '') +
            ' (arrastra para moverlo)">' +
            // Un hueco de contenedor como en Tibia: el dibujo a 32 y, si hay más de uno, cuántos.
            dibujarIcono(entrada.typeId, proveedor, 32, entrada.count) +
            '<span class="nombre">' + entrada.name +
            (entrada.count > 1 ? ' x' + entrada.count : '') + '</span>' +
            (entrada.count > 1 ? '<span class="cuantas">' + entrada.count + '</span>' : '') +
            '</div>').join('') +
            '<div class="objeto hueco-vacio"></div>'.repeat(Math.max(0, huecos - dentro.length));
    }

    // El peso va con la mochila porque es la misma pregunta -que llevas y cuanto te cabe- y aqui
    // es donde se mira: era la unica cosa que quedaba en la barra de abajo, y esa barra se ha
    // quitado entera porque sin mochila no hay nada que enseñar.
    if (pesoCaja && peso && peso.weight !== undefined) {
        const oz = (valor) => (Number(valor) / 100).toFixed(2);
        const lleno = peso.capacity > 0 ? peso.weight / peso.capacity : 0;

        pesoCaja.textContent = (contenedor ? dentro.length + '/' + huecos + ' huecos · ' : '') +
            oz(peso.weight) + ' / ' + oz(peso.capacity) + ' oz';
        pesoCaja.className = lleno >= 0.9 ? 'full' : (lleno >= 0.7 ? 'tight' : '');
    }
}

/**
 * Pinta una ranura: el dibujo si hay algo, y el nombre del hueco si no.
 *
 * @param {HTMLElement} caja el div de la ranura
 * @param {Object} ranura su clave y su etiqueta
 * @param {Object} entrada lo que hay en esa ranura, o `undefined`
 * @param {Object} proveedor el proveedor de sprites
 */
/** Si el jugador cerró la ventana de su mochila (clic derecho sobre ella, en su ranura). */
let mochilaCerrada = false;

/**
 * CLIC DERECHO EN LA MOCHILA PUESTA: abre o cierra su ventana, como cualquier contenedor.
 * @returns {boolean} si queda abierta
 */
export function alternarMochila() {
    mochilaCerrada = !mochilaCerrada;
    const ventana = document.getElementById('ventana-mochila');
    if (ventana && ventana.dataset.hayMochila === '1') {
        ventana.hidden = mochilaCerrada;
    }
    return !mochilaCerrada;
}

/** Enseña u oculta la ventana de la mochila, con el nombre de la que llevas puesta. */
function mostrarVentanaMochila(visible, contenedor) {
    const ventana = document.getElementById('ventana-mochila');
    if (!ventana) {
        return;
    }
    ventana.dataset.hayMochila = visible ? '1' : '';
    ventana.hidden = !visible || mochilaCerrada;
    const titulo = ventana.querySelector('.titulo');
    if (titulo && contenedor && contenedor.name) {
        titulo.textContent = contenedor.name.charAt(0).toUpperCase() + contenedor.name.slice(1);
    }
}

function pintarRanura(caja, ranura, entrada, proveedor) {
    caja.className = 'slot';
    caja.removeAttribute('data-index');
    caja.removeAttribute('aria-label');

    if (!entrada) {
        /*
         * UNA RANURA VACIA SIGUE ENSEÑANDO SU NOMBRE.
         *
         * Es lo unico que dice que ahi va un anillo. Un cuadrado gris y vacio no informa de
         * nada: no se sabe si falta el anillo o si el panel esta a medio pintar.
         */
        caja.innerHTML = '<span class="nombre vacia">' + ranura.etiqueta + '</span>';
        caja.title = ranura.etiqueta + ': vacia';
        return;
    }

    /*
     * `arrastrable` NO ES DECORACION: es lo que hace que el raton pueda empezar un arrastre aqui.
     * Y lo que hay puesto se puede arrastrar SIEMPRE -a otra ranura, a la mochila o al suelo-,
     * porque ya es tuyo; lo que decide donde cabe es la ranura, y de eso se encarga el motor.
     */
    caja.className = 'slot ocupada arrastrable';
    caja.dataset.index = entrada.index;
    caja.title = entrada.name + ' (' + ranura.etiqueta + ')';

    const cantidad = entrada.count > 1
        ? '<span class="cuantas">' + entrada.count + '</span>'
        : '';

    const dibujo = dibujarIcono(entrada.typeId, proveedor, 32, entrada.count);

    // El dibujo va arriba, con su propio hueco, y el nombre debajo: es como se lee una mochila
    // -primero se ve el objeto y luego se lee que es-. El numero de cosas, cuando hay mas de
    // una, va en la esquina y en el mismo color que las pilas del inventario, porque es el
    // mismo dato.
    caja.innerHTML = dibujo +
        '<span class="nombre">' + entrada.name +
        (entrada.count > 1 ? ' x' + entrada.count : '') + '</span>' +
        cantidad;
}

/**
 * El dibujo de un objeto en una casilla del panel, o su nombre si no hay dibujo.
 *
 * EL DIBUJO VIENE DEL PROVEEDOR y no se dibuja aqui: el mismo objeto tiene que verse igual en
 * el suelo y en el panel, y duplicar el dibujo seria garantizar que un dia no coincidan. El
 * proveedor devuelve un lienzo con su ANCLA, que es la altura a la que hay que subirlo para
 * que su base coincida con la base de la casilla: es la misma regla que usa el renderer.
 *
 * SI EL PROVEEDOR NO TIENE NADA -un objeto que no conoce, o un sprite que aun no ha
 * cargado- se pone un hueco con el nombre, que es lo que pide el encargo. Un hueco mudo
 * obligaria a adivinar si el objeto no tiene dibujo o si el cliente esta roto.
 *
 * @param {number} typeId el identificador del objeto
 * @param {Object} proveedor el proveedor de sprites
 * @param {number} [lado] el tamano del lienzo; por defecto el de una ranura
 * @returns {string} el HTML del dibujo o del hueco
 */
/** El dibujo de un objeto como HTML (una `<img>`), para otras ventanas (el cuerpo abierto). */
export function iconoDeObjeto(typeId, proveedor, lado, cuantos) {
    return dibujarIcono(typeId, proveedor, lado, cuantos);
}

/** ¿Quedan dibujos sin cargar en lo último que se pintó? */
export function hayDibujosPendientes() {
    return pendiente;
}

function dibujarIcono(typeId, proveedor, lado, cuantos) {
    // Con la cantidad: una pila de monedas se dibuja distinta según cuántas tenga.
    const sprite = proveedor && typeof proveedor.get === 'function'
        ? proveedor.get(typeId, undefined, { count: cuantos || 1 })
        : null;

    // Mientras el sprite llega se devuelve el hueco, y se apunta que hay que reintentarlo:
    // el proveedor no avisa de que ya lo tiene, asi que la unica forma de que el dibujo de
    // verdad acabe apareciendo es volver a preguntar.
    if (!sprite || !sprite.canvas) {
        pendiente = true;
        // Mientras carga, nada; «sin dibujo» sólo si de verdad no lo tiene.
        const cargando = proveedor && typeof proveedor.dibujoListo === 'function' && !proveedor.dibujoListo(typeId);
        return '<span class="sin-dibujo">' + (cargando ? '' : 'sin dibujo') + '</span>';
    }

    // El dibujo que llegó es el provisional (las hojas aún no han cargado): se pinta, pero se
    // vuelve a pedir en el siguiente fotograma. Sin esto la mochila se quedaba con el provisional.
    if (proveedor && typeof proveedor.dibujoListo === 'function' && !proveedor.dibujoListo(typeId)) {
        pendiente = true;
    }

    /*
     * Se pinta en un lienzo del tamano de la casilla del panel, que es MAS PEQUENA que la del
     * mundo pero ha crecido con el panel: 43x43 contra los 36x36 de antes -un 20% mas, que es lo
     * que pide el encargo-, y contra los 32x32 del mundo mas la altura del objeto. Por eso se
     * calcula una escala en vez de copiar el lienzo tal cual, que en un objeto alto desbordaria la
     * casilla.
     *
     * El ancla tambien se escala, o el dibujo se despegaria de su base justo cuando mas se
     * nota, que es con los objetos altos.
     */
    const ancho = lado || 43;
    const alto = ancho;
    const escala = Math.min(1, ancho / sprite.canvas.width, alto / sprite.canvas.height);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    lienzo.setAttribute('aria-label', String(typeId));

    const ctx = lienzo.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const dibujadoAncho = sprite.canvas.width * escala;
    const dibujadoAlto = sprite.canvas.height * escala;
    // El ancla viene en píxeles lógicos; un dibujo HD tiene el doble de píxeles que eso.
    const ancla = (typeof sprite.anchorY === 'number' ? sprite.anchorY * (sprite.hd ? 2 : 1) : sprite.canvas.height) *
        escala;

    ctx.drawImage(sprite.canvas,
        (ancho - dibujadoAncho) / 2,
        alto - ancla,
        dibujadoAncho, dibujadoAlto);

    /*
     * El lienzo va DENTRO de un contenedor en vez de ir suelto, y no es cosmetico: asi el
     * nombre del objeto queda debajo del dibujo y no encima. Un lienzo y un texto, los dos
     * hijos directos de una caja con `flex-direction: column`, se reparten el alto y el texto
     * acaba tapando el dibujo por abajo.
     */
    /*
     * Y SE CONVIERTE EN UNA IMAGEN: esto devuelve HTML en texto, y un `<canvas>` copiado como
     * texto pierde lo que tiene pintado (sale en blanco). Una `<img>` con el dibujo dentro sí
     * sobrevive a `innerHTML`.
     */
    const imagen = document.createElement('img');
    imagen.src = lienzo.toDataURL();
    imagen.width = ancho;
    imagen.height = alto;
    imagen.alt = String(typeId);
    imagen.draggable = false;

    const contenedor = document.createElement('span');
    contenedor.className = 'icono';
    contenedor.appendChild(imagen);

    return contenedor.outerHTML;
}

/**
 * Repinta el equipo si alguno de sus dibujos no estaba listo.
 *
 * Se llama desde el bucle de dibujo, y por eso lo PRIMERO que hace es salir si no hay nada
 * pendiente: preguntar por seis sprites -y ahora tambien por los de la mochila- sesenta veces por
 * segundo para acabar no pintando nada es exactamente el trabajo que hay que evitar.
 *
 * @param {Array} inventario las entradas del inventario
 * @param {Object} proveedor el proveedor de sprites
 * @param {Object} itemtypes las banderas de los objetos
 * @param {Object} [peso] { weight, capacity }
 * @param {boolean} forzar repinta aunque no haya nada pendiente
 */
export function dibujarPendiente(inventario, proveedor, itemtypes, peso, forzar) {
    if (!pendiente && !forzar) {
        return;
    }

    // Se olvida la firma a proposito: el contenido no ha cambiado, lo que ha cambiado es que
    // el proveedor ya sabe dibujarlo, y la firma no distingue las dos cosas.
    ultimaFirma = null;
    actualizarEquipo(inventario, proveedor, itemtypes, peso);
}

/**
 * Pinta los stats: vida, experiencia, nivel y vocacion.
 *
 * LA VIDA Y LA EXPERIENCIA SON BARRAS PORQUE SON CANTIDADES DENTRO DE UN MAXIMO. El nivel y
 * la vocacion son texto porque no lo son: no existe "nivel 12 de 30". Meterlos en una barra
 * seria inventarse un maximo que nadie ha definido.
 *
 * NO HAY BARRA DE MANA porque el motor no manda mana: `PLAYER_STATS` lleva vida, vida maxima,
 * nivel y experiencia, y `LOGIN_OK` los mismos cuatro. La vocacion sí trae `gainMana` en el
 * XML, pero eso es una definicion del motor, no un dato de la partida. Una barra de mana a
 * cero ensenaria algo falso, y una barra vacia que nunca se mueve es peor que no tenerla.
 *
 * @param {Object} jugador los datos del jugador segun el cliente, que pueden ser nulos
 */
export function actualizarStats(jugador) {
    const experiencia = document.getElementById(ID.experiencia);
    const experienciaValor = document.getElementById(ID.experienciaValor);
    const nivel = document.getElementById(ID.nivel);
    const vocacion = document.getElementById(ID.vocacion);

    if (!jugador) {
        /*
         * Sin jugador no se pinta NADA, y lo que hubiera se queda como estaba.
         *
         * No se pone a cero ni a rayas porque este caso es "todavia no ha llegado el dato", y
         * el momento en que deja de haber jugador -perder la conexion, volver a la pantalla de
         * entrada- ya lo cubre `limpiarPaneles`, que sí borra. Escribir aqui un cero seria
         * tapar con un dato falso el rato entre que se pide el inventario y llega.
         */
        return;
    }

    // Lo completo (maná, almas, skills...) llega en `stats` desde el motor (PLAYER_STATS), con
    // las reglas de la vocación ya aplicadas. Si un motor viejo no lo manda, se pinta lo básico.
    const st = jugador.stats || null;

    pintarBarra('health-bar', 'health-value', jugador.health, jugador.maxHealth, 'vida');
    if (st) {
        pintarBarra('mana-bar', 'mana-value', st.mana, st.maxMana, 'maná');
    }

    if (experiencia && experienciaValor) {
        const total = Math.max(0, Number(jugador.experience) || 0);
        const nivelActual = Math.max(1, Number(jugador.level) || 1);
        const porcentaje = st ? st.levelPercent : porcentajeAproximado(total, nivelActual);

        experiencia.value = porcentaje;
        experienciaValor.textContent = formatearNumero(total);
        const barraNivel = document.getElementById('nivel-barra');
        if (barraNivel) {
            barraNivel.style.width = porcentaje + '%';
            barraNivel.parentElement.title = porcentaje + '% hasta el nivel ' + (nivelActual + 1) +
                (st ? ' (' + formatearNumero(Math.max(0, st.nextLevelExperience - total)) + ' de experiencia)' : '');
        }
    }

    if (nivel) {
        nivel.textContent = String(Math.max(1, Number(jugador.level) || 1));
    }

    if (vocacion) {
        vocacion.textContent = !jugador.vocation || jugador.vocation === 'None' ? 'sin vocación' : jugador.vocation;
    }

    if (!st) {
        return;
    }

    const texto = (id, valor) => {
        const e = document.getElementById(id);
        if (e) {
            e.textContent = valor;
        }
    };
    const libre = Math.floor(Math.max(0, st.free) / 100);
    texto('skill-vida', st.health + ' / ' + st.maxHealth);
    texto('skill-mana', st.mana + ' / ' + st.maxMana);
    texto('skill-almas', String(st.soul));
    texto('skill-cap', String(libre));
    texto('skill-velocidad', String(st.speed));
    texto('skill-stamina', Math.floor(st.stamina / 60) + ':' + String(st.stamina % 60).padStart(2, '0'));
    texto('soul-value', String(st.soul));
    texto('cap-value', String(libre));

    const lista = document.getElementById('lista-skills');
    if (lista) {
        const fila = (nombre, nivelSkill, porcentaje) =>
            '<div class="skill" title="' + porcentaje + '% hasta el nivel ' + (nivelSkill + 1) + '"><span>' + nombre +
            '</span><b>' + nivelSkill + '</b></div>' +
            '<div class="skill-barra"><div style="width:' + porcentaje + '%"></div></div>';
        lista.innerHTML = fila('Nivel mágico', st.magicLevel, st.magicPercent) +
            SKILLS.map(([clave, nombre]) => {
                const sk = st.skills && st.skills[clave] ? st.skills[clave] : { level: 10, percent: 0 };
                return fila(nombre, sk.level, sk.percent);
            }).join('');
    }
}

/** Una barra de la barra lateral (vida o maná) con su número encima. */
function pintarBarra(idBarra, idValor, actual, maximo, nombre) {
    const barra = document.getElementById(idBarra);
    const valor = document.getElementById(idValor);
    if (!barra || !valor) {
        return;
    }
    const max = Math.max(1, Number(maximo) || 0);
    const ahora = Math.max(0, Number(actual) || 0);
    barra.max = max;
    barra.value = ahora;
    valor.textContent = ahora + ' / ' + max;
    barra.title = nombre + ' ' + ahora + ' de ' + max;
}

/**
 * El porcentaje APROXIMADO de la barra de experiencia.
 *
 * Ver `FACTOR_NIVEL`: el motor no manda la experiencia que falta para el siguiente nivel, asi
 * que esto no puede ser el porcentaje exacto y no pretende serlo. Lo que hace es colocar la
 * experiencia total dentro de la decada en la que esta el jugador -entre la referencia de su
 * nivel y la del doble-, que es lo que hace que la barra avance de forma parecida al juego.
 *
 * La alternativa era dibujar una barra siempre llena, que no informa de nada, o inventarse la
 * formula cubica del motor en el cliente, que seria tener la misma regla en dos sitios y
 * enterarse de que discrepan el dia que una de las dos cambie.
 *
 * @param {number} experiencia la experiencia total acumulada
 * @param {number} nivel el nivel actual
 * @returns {number} 0..100
 */
function porcentajeAproximado(experiencia, nivel) {
    const referencia = EXPERIENCIA_BASE * Math.pow(FACTOR_NIVEL, Math.max(0, nivel - 1));
    const siguiente = referencia * FACTOR_NIVEL;

    if (siguiente <= referencia) {
        return 0;
    }

    const dentro = (experiencia - referencia) / (siguiente - referencia);
    return Math.round(Math.max(0, Math.min(1, dentro)) * 100);
}

/**
 * Un numero con separadores de millar.
 *
 * Se separan a mano y no con `toLocaleString` porque el separador depende del idioma del
 * navegador: en una maquina en ingles saldria `1,234,567` y en una en espanol `1.234.567`, y
 * el mismo dato no puede verse distinto segun quien mire. Se usa el punto, que es el del
 * idioma del proyecto.
 *
 * @param {number} valor
 * @returns {string}
 */
function formatearNumero(valor) {
    return String(Math.round(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
