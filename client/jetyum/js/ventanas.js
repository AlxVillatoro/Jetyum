/**
 * LAS VENTANAS DEL JUGADOR: dónde va cada una.
 *
 * Como en Tibia, las ventanas (skills, batalla, VIP, mochila, el cuerpo que abres...) van en
 * COLUMNAS a los lados del mapa, y se pueden llevar a donde quieras:
 *
 * - SE ARRASTRAN por su cabecera. Si las sueltas cerca de una columna (la derecha o la
 *   izquierda), se quedan ahí, en el hueco que marca la línea azul. Si las sueltas en cualquier
 *   otro sitio, se quedan FLOTANDO justo ahí, encima del mapa.
 * - Las que no has movido se colocan solas: en la columna derecha, en el orden de siempre, y los
 *   contenedores debajo de lo que ya estaba abierto. NINGUNA CAMBIA DE COLUMNA SOLA.
 * - SI ABRES UN CONTENEDOR Y YA NO CABE, SE CIERRA EL ÚLTIMO CONTENEDOR que había abierto en esa
 *   columna (y el anterior, si sigue sin caber). Sólo si no queda ninguno que cerrar se encogen
 *   las ventanas: la página NUNCA tiene barra de desplazamiento (lo de dentro se desplaza dentro de
 *   cada ventana).
 * - El MINIMAPA, la VIDA y el EQUIPO también son ventanas (`data-fija`): se mueven y se minimizan,
 *   pero no se encogen ni se cierran.
 * - La columna izquierda está SIEMPRE: así el mapa no cambia de tamaño de golpe cuando se abre o
 *   se cierra un cuerpo.
 * - Dónde dejaste cada ventana fija (skills, batalla...) se recuerda en este navegador.
 *
 * ORDEN DENTRO DE UNA COLUMNA: cada ventana tiene una «llave» numérica. Las que se colocan solas
 * usan la de siempre (su puesto en la página; los contenedores, 1000 + el orden en que se
 * abrieron) y las que has soltado tú, la que les tocó entre sus dos vecinas. Así una ventana
 * soltada entre «Skills» y «Batalla» sigue ahí aunque luego se abran y cierren otras.
 */

const ALTO_MINIMO_CUERPO = 48;
const CLAVE_SITIOS = 'jetyum.sitio-ventanas';
/** Píxeles alrededor de una columna en los que una ventana soltada se engancha a ella. */
const IMAN = 40;
/** Lo que hay que mover el ratón para que un clic en la cabecera sea un arrastre. */
const UMBRAL = 4;

function leerSitios() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_SITIOS)) || {};
    } catch (e) {
        return {};
    }
}

/**
 * @param {Object} o
 * @param {HTMLElement} o.der la columna de la barra lateral derecha
 * @param {HTMLElement} o.izq la columna de la izquierda
 * @param {HTMLElement} o.lateralIzq la barra izquierda entera
 * @param {Function} [o.alCambiar] se llama si cambia el ancho que le queda al mapa
 */
export function crearGestorVentanas(o) {
    const { der, izq, lateralIzq } = o;
    const alCambiar = o.alCambiar || (() => {});
    const columnas = { der, izq };

    // La capa de las ventanas flotantes: encima del mapa, debajo de la pantalla de entrada.
    const capa = document.createElement('div');
    capa.id = 'ventanas-flotantes';
    document.body.appendChild(capa);

    // La columna izquierda, siempre a la vista.
    lateralIzq.classList.remove('vacia');
    alCambiar();

    // El orden de siempre: el de la página.
    const ordenOriginal = [...der.querySelectorAll(':scope > .ventana')].map((v) => v.dataset.ventanaId);
    const sitios = leerSitios();
    let encima = 10;

    const ventanas = () => [...der.children, ...izq.children, ...capa.children]
        .filter((v) => v.classList && v.classList.contains('ventana'));
    const visibles = (c) => [...c.querySelectorAll(':scope > .ventana:not([hidden])')];
    const sobra = (c) => c.scrollHeight - c.clientHeight;

    /** La llave de orden por defecto: su puesto en la página, o 1000 + orden si es un contenedor. */
    const pesoDe = (v) => v.dataset.temporal
        ? 1000 + Number(v.dataset.orden || 0)
        : Math.max(0, ordenOriginal.indexOf(v.dataset.ventanaId));

    /** Dónde la dejó el jugador: { sitio: 'der'|'izq'|'flota', llave, x, y }, o null si nunca la movió. */
    function sitioDe(v) {
        if (v._sitio) {
            return v._sitio;
        }
        const guardado = v.dataset.ventanaId && !v.dataset.temporal ? sitios[v.dataset.ventanaId] : null;
        if (guardado && ['der', 'izq', 'flota'].includes(guardado.sitio)) {
            v._sitio = guardado;
        }
        return v._sitio || null;
    }

    const llaveDe = (v) => {
        const s = sitioDe(v);
        return s && s.sitio !== 'flota' && Number.isFinite(s.llave) ? s.llave : pesoDe(v);
    };

    function guardar(v) {
        if (!v.dataset.ventanaId || v.dataset.temporal) {
            return;
        }
        sitios[v.dataset.ventanaId] = v._sitio;
        try {
            localStorage.setItem(CLAVE_SITIOS, JSON.stringify(sitios));
        } catch (e) {
            // Sin almacenamiento: se olvida al recargar, nada más.
        }
    }

    /** Pone una ventana flotante en su sitio, sin salirse de la pantalla. */
    function colocarFlotante(v, s) {
        if (v.parentNode !== capa) {
            capa.appendChild(v);
        }
        v.classList.add('flotante');
        const ancho = v.offsetWidth || 188;
        const x = Math.max(0, Math.min(window.innerWidth - ancho, Number(s.x) || 0));
        const y = Math.max(0, Math.min(window.innerHeight - 24, Number(s.y) || 0));
        v.style.left = x + 'px';
        v.style.top = y + 'px';
        const cuerpo = v.querySelector('.ventana-cuerpo');
        if (cuerpo) {
            const cabecera = v.querySelector('.ventana-cabecera');
            const alto = window.innerHeight - y - (cabecera ? cabecera.offsetHeight : 20) - 6;
            cuerpo.style.maxHeight = Math.max(ALTO_MINIMO_CUERPO, alto) + 'px';
        }
    }

    /** Quita el encogido de las ventanas, para medir lo que ocupan de verdad. */
    function soltarAltos(lista) {
        lista.forEach((v) => {
            const cuerpo = v.querySelector('.ventana-cuerpo');
            if (cuerpo) {
                cuerpo.style.maxHeight = '';
            }
        });
    }

    /**
     * Reparte las ventanas: las flotantes en su sitio; las demás, en su columna y en orden (nunca
     * se cambian de columna solas). Si una columna no cabe, se encogen sus ventanas más altas.
     */
    function colocar() {
        const todas = ventanas();
        soltarAltos(todas);

        const lista = { der: [], izq: [] };
        todas.forEach((v) => {
            const s = sitioDe(v);
            if (s && s.sitio === 'flota') {
                colocarFlotante(v, s);
                return;
            }
            v.classList.remove('flotante');
            v.style.left = '';
            v.style.top = '';
            v.style.zIndex = '';
            lista[s ? s.sitio : 'der'].push(v);
        });

        const enOrden = (a, b) => llaveDe(a) - llaveDe(b);
        lista.der.sort(enOrden).forEach((v) => der.appendChild(v));
        lista.izq.sort(enOrden).forEach((v) => izq.appendChild(v));

        [der, izq].forEach(encoger);
    }

    /** Si una columna sigue sin caber, se encogen sus ventanas más altas. */
    function encoger(c) {
        let vueltas = 0;
        while (sobra(c) > 0 && vueltas < 20) {
            const cuerpos = visibles(c)
                .filter((v) => !v.classList.contains('minimizada') && !v.dataset.fija)
                .map((v) => v.querySelector('.ventana-cuerpo'))
                .filter((b) => b && b.offsetHeight > ALTO_MINIMO_CUERPO)
                .sort((a, b) => b.offsetHeight - a.offsetHeight);
            if (!cuerpos.length) {
                break;
            }
            const alto = Math.max(ALTO_MINIMO_CUERPO, cuerpos[0].offsetHeight - sobra(c) - 2);
            cuerpos[0].style.maxHeight = alto + 'px';
            vueltas += 1;
        }
    }

    /**
     * Una ventana nueva (el cuerpo que abres): debajo de todo lo que ya estaba abierto. Si ya no
     * cabe en su columna, se cierra EL ÚLTIMO CONTENEDOR que había abierto en ella (los que traen
     * `_cerrar`), y otro más si sigue sin caber. Si no queda ninguno, se encogen.
     */
    function abrir(ventana) {
        if (!ventana.parentNode || ![der, izq, capa].includes(ventana.parentNode)) {
            der.appendChild(ventana);
        }
        ventana.hidden = false;
        colocar();
        const columna = ventana.parentNode;
        if (columna !== der && columna !== izq) {
            return;
        }
        for (let vueltas = 0; vueltas < 20; vueltas += 1) {
            soltarAltos(visibles(columna));
            if (sobra(columna) <= 0) {
                break;
            }
            const otros = visibles(columna).filter((v) => v !== ventana && typeof v._cerrar === 'function');
            if (otros.length === 0) {
                break;
            }
            // Cerrarlo avisa al motor y vuelve a colocar (que encoge): se mide otra vez arriba.
            otros[otros.length - 1]._cerrar();
        }
        encoger(columna);
    }

    // -----------------------------------------------------------------------
    // ARRASTRAR: por la cabecera, a una columna o a cualquier sitio.
    // -----------------------------------------------------------------------

    const linea = document.createElement('div');
    linea.className = 'ventana-hueco';
    let arrastre = null;

    /** La columna a la que se engancharía la ventana con el ratón en (x, y), o null. */
    function columnaBajo(x, y) {
        for (const nombre of ['der', 'izq']) {
            const r = columnas[nombre].getBoundingClientRect();
            if (r.width > 0 && x >= r.left - IMAN && x <= r.right + IMAN && y >= r.top - IMAN && y <= r.bottom + IMAN) {
                return nombre;
            }
        }
        return null;
    }

    /** Entre qué dos ventanas de la columna caería: la primera cuya mitad queda por debajo del ratón. */
    function huecoEn(nombre, y, arrastrada) {
        const lista = visibles(columnas[nombre]).filter((v) => v !== arrastrada);
        const siguiente = lista.find((v) => {
            const r = v.getBoundingClientRect();
            return y < r.top + r.height / 2;
        }) || null;
        const indice = siguiente ? lista.indexOf(siguiente) : lista.length;
        return { lista, siguiente, anterior: indice > 0 ? lista[indice - 1] : null };
    }

    document.addEventListener('mousedown', (e) => {
        const cabecera = e.button === 0 && e.target.closest('.ventana-cabecera');
        if (!cabecera || e.target.closest('button, input, select, a')) {
            return;
        }
        const v = cabecera.closest('.ventana');
        if (!v || !ventanas().includes(v)) {
            return;
        }
        e.preventDefault();
        const r = v.getBoundingClientRect();
        arrastre = { v, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, ancho: r.width, movido: false };
        if (v.classList.contains('flotante')) {
            encima += 1;
            v.style.zIndex = String(encima);
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!arrastre) {
            return;
        }
        const { v } = arrastre;
        if (!arrastre.movido) {
            if (Math.abs(e.clientX - arrastre.x0) + Math.abs(e.clientY - arrastre.y0) < UMBRAL) {
                return;
            }
            // Empieza el arrastre: la ventana se suelta de su columna y sigue al ratón.
            arrastre.movido = true;
            const estaba = v.parentNode;
            capa.appendChild(v);
            v.classList.add('flotante', 'arrastrando');
            v.style.width = arrastre.ancho + 'px';
            encima += 1;
            v.style.zIndex = String(encima);
            document.body.classList.add('moviendo-ventana');
            if (estaba !== capa) {
                // En la columna de la que sale, lo de debajo sube y puede volver a crecer.
                [der, izq].forEach((c) => visibles(c).forEach((w) => {
                    const cuerpo = w.querySelector('.ventana-cuerpo');
                    if (cuerpo) {
                        cuerpo.style.maxHeight = '';
                    }
                }));
                [der, izq].forEach(encoger);
            }
        }
        v.style.left = (e.clientX - arrastre.dx) + 'px';
        v.style.top = (e.clientY - arrastre.dy) + 'px';

        // La línea azul dice dónde se quedaría si la sueltas ahora.
        const nombre = columnaBajo(e.clientX, e.clientY);
        if (nombre) {
            const { siguiente } = huecoEn(nombre, e.clientY, v);
            columnas[nombre].insertBefore(linea, siguiente);
        } else {
            linea.remove();
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (!arrastre) {
            return;
        }
        const { v, movido } = arrastre;
        arrastre = null;
        if (!movido) {
            return;
        }
        linea.remove();
        v.classList.remove('arrastrando');
        v.style.width = '';
        document.body.classList.remove('moviendo-ventana');

        const nombre = columnaBajo(e.clientX, e.clientY);
        if (nombre) {
            // Enganchada a la columna, entre sus dos vecinas.
            const { anterior, siguiente } = huecoEn(nombre, e.clientY, v);
            const a = anterior ? llaveDe(anterior) : null;
            const b = siguiente ? llaveDe(siguiente) : null;
            const llave = a === null && b === null ? 0
                : a === null ? b - 1
                    : b === null ? a + 1
                        : (a + b) / 2;
            v._sitio = { sitio: nombre, llave };
        } else {
            v._sitio = { sitio: 'flota', x: parseFloat(v.style.left) || 0, y: parseFloat(v.style.top) || 0 };
        }
        guardar(v);
        colocar();
    });

    window.addEventListener('resize', () => colocar());

    // La versión anterior guardaba otro orden: se olvida.
    try {
        localStorage.removeItem('jetyum.orden-ventanas');
    } catch (e) {
        // Nada.
    }

    return { colocar, abrir };
}
