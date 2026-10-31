/**
 * LA VENTANA DEL PERSONAJE: clic derecho sobre uno mismo.
 *
 * Es la «Set Outfit» de Tibia más la ficha del personaje: a la izquierda el muñeco, girándolo con
 * las flechas, el aspecto (de los que se pueden llevar, ◀ ▶), los cuatro colores (cabeza, cuerpo,
 * piernas y pies, de la paleta de 133 de Tibia) y los añadidos; a la derecha el nivel, la
 * experiencia, la vocación, la vida, el maná, las almas, el nivel mágico, la velocidad, la
 * capacidad y el sexo. Los aspectos que salen son sólo los de tu sexo (data/XML/outfits.js).
 *
 * El motor manda los datos (`OUTFIT_WINDOW`) y es quien decide si el aspecto elegido vale
 * (`SET_OUTFIT`): esta ventana sólo enseña y propone.
 *
 * LA MONTURA va en la misma ventana, como en Tibia: se elige entre las que tienes (◀ ▶, o
 * «Ninguna»), se ve en el muñeco con el jinete encima, y la casilla «Montar» dice si vas montado.
 * Al guardar viaja con el aspecto (los dos últimos campos de `SET_OUTFIT`); montar y desmontar
 * sin abrir la ventana es Ctrl+R.
 */

import { paletteColor, PALETTE_SIZE } from './sprites.js';
import { alturaDelJinete } from './renderer.js';

const PARTES = [
    { clave: 'head', nombre: 'Cabeza' },
    { clave: 'body', nombre: 'Cuerpo' },
    { clave: 'legs', nombre: 'Piernas' },
    { clave: 'feet', nombre: 'Pies' }
];

const DIRECCIONES = ['norte', 'este', 'sur', 'oeste'];

function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) {
        e.className = clase;
    }
    if (texto !== undefined) {
        e.textContent = texto;
    }
    return e;
}

function onzas(centesimas) {
    return (Number(centesimas || 0) / 100).toFixed(2) + ' oz';
}

/**
 * @param {Object} opciones
 * @param {Object} opciones.provider el proveedor de sprites del juego (dibuja el muñeco)
 * @param {Function} opciones.guardar (outfit, montura) => void, manda el aspecto al motor;
 *        `montura` es `{id, montado}`, o null si el motor no manda monturas
 */
export function crearVentanaPersonaje(opciones) {
    const { provider, guardar } = opciones;
    let datos = null;
    let outfit = null;
    let parte = 'head';
    let direccion = 2;
    let caja = null;
    let lienzo = null;
    let animacion = null;
    /** La montura elegida (su id; 0 ninguna) y si se va montado. */
    let montura = 0;
    let montado = false;

    function cerrar() {
        if (caja) {
            caja.remove();
            caja = null;
        }
        if (animacion) {
            cancelAnimationFrame(animacion);
            animacion = null;
        }
    }

    function abierta() {
        return caja !== null;
    }

    function dibujarMuneco() {
        if (!lienzo) {
            return;
        }
        const ctx = lienzo.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, lienzo.width, lienzo.height);
        const ahora = performance.now();
        const sprite = provider.getCreature
            ? provider.getCreature({ id: 0, outfit, direction: direccion, moving: true }, ahora)
            : null;
        const def = monturaElegida();
        const bajo = def && provider.getCreature
            ? provider.getCreature({ id: 0, outfit: { lookType: def.lookType }, direction: direccion, moving: true }, ahora)
            : null;
        if (!bajo) {
            // A pie, como siempre: el dibujo entero, centrado y ampliado lo que quepa.
            if (sprite && sprite.canvas) {
                const escala = Math.floor(Math.min(lienzo.width, lienzo.height) / Math.max(sprite.canvas.width, sprite.canvas.height)) || 1;
                const w = sprite.canvas.width * escala;
                const h = sprite.canvas.height * escala;
                ctx.drawImage(sprite.canvas, (lienzo.width - w) / 2, (lienzo.height - h) / 2, w, h);
            }
        } else {
            dibujarMontado(ctx, bajo, sprite);
        }
        animacion = requestAnimationFrame(dibujarMuneco);
    }

    /**
     * EL MUÑECO MONTADO: los dos dibujos colocados como en el mapa (anclados a la casilla de abajo
     * a la derecha, la montura debajo y el jinete alzado `alturaDelJinete`), y la caja que ocupan
     * juntos, centrada y ampliada lo que quepa en el marco.
     */
    function dibujarMontado(ctx, bajo, jinete) {
        const piezas = [{ s: bajo, alzado: 0 }];
        if (jinete && jinete.canvas) {
            piezas.push({ s: jinete, alzado: alturaDelJinete(bajo) });
        }
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        piezas.forEach((p) => {
            p.w = p.s.drawW || p.s.canvas.width;
            p.h = p.s.drawH || p.s.canvas.height;
            p.x = -(p.s.anchorX || 0);
            p.y = 32 - (typeof p.s.anchorY === 'number' ? p.s.anchorY : p.h) - p.alzado;
            x0 = Math.min(x0, p.x);
            y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x + p.w);
            y1 = Math.max(y1, p.y + p.h);
        });
        const cabe = Math.min(lienzo.width, lienzo.height) / Math.max(x1 - x0, y1 - y0);
        // Entera si se puede (el pixel art se amplía mejor así); a medios si no llega a 2.
        const escala = cabe >= 2 ? Math.floor(cabe) : Math.max(0.5, Math.floor(cabe * 2) / 2);
        const ox = (lienzo.width - (x1 - x0) * escala) / 2 - x0 * escala;
        const oy = (lienzo.height - (y1 - y0) * escala) / 2 - y0 * escala;
        piezas.forEach((p) => {
            ctx.drawImage(p.s.canvas, Math.round(ox + p.x * escala), Math.round(oy + p.y * escala),
                Math.round(p.w * escala), Math.round(p.h * escala));
        });
    }

    /** Las monturas que tiene (las que manda el motor), o una lista vacía. */
    function monturas() {
        return datos && Array.isArray(datos.mounts) ? datos.mounts : [];
    }

    /** La montura elegida en la ventana, o null si ninguna. */
    function monturaElegida() {
        return montura ? monturas().find((m) => m.id === montura) || null : null;
    }

    function aspectoActual() {
        return datos.outfits.find((o) => o.lookType === outfit.lookType) || null;
    }

    function pintar() {
        const cuerpo = caja.querySelector('.pj-cuerpo');
        cuerpo.innerHTML = '';
        const s = datos.stats;

        // --- Izquierda: el muñeco y el aspecto ---
        const izq = el('div', 'pj-aspecto');
        const marco = el('div', 'pj-marco');
        lienzo = el('canvas');
        lienzo.width = 128;
        lienzo.height = 128;
        marco.appendChild(lienzo);
        const girar = el('div', 'pj-fila');
        const gIzq = el('button', 'pj-icono', '⟲');
        gIzq.title = 'Girar a la izquierda';
        const gDer = el('button', 'pj-icono', '⟳');
        gDer.title = 'Girar a la derecha';
        const mira = el('span', 'pj-nota', 'mira al ' + DIRECCIONES[direccion]);
        gIzq.onclick = () => { direccion = (direccion + 3) % 4; pintar(); };
        gDer.onclick = () => { direccion = (direccion + 1) % 4; pintar(); };
        girar.append(gIzq, mira, gDer);
        izq.append(marco, girar);

        const lista = datos.outfits;
        const indice = Math.max(0, lista.findIndex((o) => o.lookType === outfit.lookType));
        const selector = el('div', 'pj-fila pj-selector');
        const ant = el('button', 'pj-icono', '◀');
        ant.title = 'Aspecto anterior';
        const sig = el('button', 'pj-icono', '▶');
        sig.title = 'Aspecto siguiente';
        const nombre = el('span', 'pj-nombre-aspecto', (lista[indice] && lista[indice].name) || ('aspecto ' + outfit.lookType));
        const cambiar = (paso) => {
            const nuevo = lista[(indice + paso + lista.length) % lista.length];
            outfit = { ...outfit, lookType: nuevo.lookType, addons: 0 };
            pintar();
        };
        ant.onclick = () => cambiar(-1);
        sig.onclick = () => cambiar(1);
        selector.append(ant, nombre, sig);
        izq.appendChild(selector);

        // Las partes y la paleta.
        const partes = el('div', 'pj-fila pj-partes');
        PARTES.forEach((p) => {
            const b = el('button', 'pj-parte' + (p.clave === parte ? ' activa' : ''));
            b.title = 'Elegir el color de: ' + p.nombre.toLowerCase();
            const muestra = el('span', 'pj-muestra');
            muestra.style.background = paletteColor(outfit[p.clave]);
            b.append(muestra, document.createTextNode(p.nombre));
            b.onclick = () => { parte = p.clave; pintar(); };
            partes.appendChild(b);
        });
        izq.appendChild(partes);
        const paleta = el('div', 'pj-paleta');
        for (let i = 0; i < PALETTE_SIZE; i += 1) {
            const c = el('button', 'pj-color' + (outfit[parte] === i ? ' elegido' : ''));
            c.style.background = paletteColor(i);
            c.title = 'Color ' + i;
            c.onclick = () => { outfit = { ...outfit, [parte]: i }; pintar(); };
            paleta.appendChild(c);
        }
        izq.appendChild(paleta);

        // Los dos añadidos SIEMPRE están (desactivados si el aspecto no los tiene): así la ventana
        // mide lo mismo con todos los trajes y no salta al cambiar de uno a otro.
        const def = aspectoActual();
        const tiene = def ? def.addons : 0;
        const anadidos = el('div', 'pj-fila pj-anadidos');
        for (let a = 1; a <= 2; a += 1) {
            const bit = a === 1 ? 1 : 2;
            const lab = el('label', 'pj-anadido' + (a > tiene ? ' desactivado' : ''));
            lab.title = a > tiene ? 'Este aspecto no tiene añadido ' + a : 'Ponerse o quitarse el añadido ' + a;
            const chk = el('input');
            chk.type = 'checkbox';
            chk.disabled = a > tiene;
            chk.checked = a <= tiene && (Number(outfit.addons) & bit) !== 0;
            chk.onchange = () => { outfit = { ...outfit, addons: (Number(outfit.addons) || 0) ^ bit }; pintar(); };
            lab.append(chk, document.createTextNode(' añadido ' + a));
            anadidos.appendChild(lab);
        }
        izq.appendChild(anadidos);

        // --- Derecha: la ficha ---
        const der = el('div', 'pj-ficha');
        const fila = (etiqueta, valor) => {
            const f = el('div', 'pj-dato');
            f.append(el('span', '', etiqueta), el('b', '', String(valor)));
            der.appendChild(f);
        };
        fila('Nivel', s.level);
        fila('Experiencia', s.experience);
        fila('Vocación', s.vocation === 'None' ? 'sin vocación' : s.vocation);
        fila('Vida', s.health + ' / ' + s.maxHealth);
        const barra = el('div', 'pj-barra');
        const lleno = el('div');
        lleno.style.width = Math.round(100 * s.health / Math.max(1, s.maxHealth)) + '%';
        barra.appendChild(lleno);
        der.appendChild(barra);
        if (s.maxMana !== undefined) {
            fila('Maná', s.mana + ' / ' + s.maxMana);
            fila('Almas', s.soul);
            fila('Nivel mágico', s.magicLevel);
        }
        fila('Velocidad', s.speed);
        fila('Capacidad', onzas(s.free) + ' libres de ' + onzas(s.capacity));
        if (s.sex) {
            fila('Sexo', s.sex === 'female' ? 'mujer' : 'hombre');
        }

        // --- La montura (sólo si el motor las manda: uno antiguo no sabe de ellas) ---
        if (Array.isArray(datos.mounts)) {
            der.appendChild(seccionMontura());
        }

        cuerpo.append(izq, der);
        if (!animacion) {
            animacion = requestAnimationFrame(dibujarMuneco);
        }
    }

    /**
     * La sección «Montura»: ◀ nombre ▶ entre «Ninguna» y las que tienes, lo que suma a la
     * velocidad y la casilla «Montar». Sin ninguna, una nota.
     */
    function seccionMontura() {
        const seccion = el('div', 'pj-montura');
        seccion.appendChild(el('div', 'pj-subtitulo', 'Montura'));
        const lista = monturas();
        if (!lista.length) {
            seccion.appendChild(el('div', 'pj-nota', 'Todavía no tienes monturas.'));
            return seccion;
        }
        // «Ninguna» es la primera de la vuelta: así también se quita la montura con las flechas.
        const vuelta = [null].concat(lista);
        const indice = Math.max(0, vuelta.findIndex((m) => (m ? m.id : 0) === montura));
        const actual = vuelta[indice];
        const selector = el('div', 'pj-fila pj-selector');
        const ant = el('button', 'pj-icono', '◀');
        ant.title = 'Montura anterior';
        const sig = el('button', 'pj-icono', '▶');
        sig.title = 'Montura siguiente';
        const nombre = el('span', 'pj-nombre-aspecto', actual ? actual.name : 'Ninguna');
        const cambiar = (paso) => {
            const nueva = vuelta[(indice + paso + vuelta.length) % vuelta.length];
            montura = nueva ? nueva.id : 0;
            // Sin montura no se va montado.
            if (!montura) {
                montado = false;
            }
            pintar();
        };
        ant.onclick = () => cambiar(-1);
        sig.onclick = () => cambiar(1);
        selector.append(ant, nombre, sig);
        seccion.appendChild(selector);
        seccion.appendChild(el('div', 'pj-nota', actual
            ? '+' + (Number(actual.speed) || 0) + ' de velocidad'
            : 'Vas a pie.'));

        const lab = el('label', 'pj-anadido' + (actual ? '' : ' desactivado'));
        lab.title = actual ? 'Ir montado (también con Ctrl+R)' : 'Elige antes una montura';
        const chk = el('input');
        chk.type = 'checkbox';
        chk.disabled = !actual;
        chk.checked = !!actual && montado;
        chk.onchange = () => { montado = chk.checked; };
        lab.append(chk, document.createTextNode(' Montar'));
        seccion.appendChild(lab);
        return seccion;
    }

    function abrir(nuevosDatos) {
        datos = nuevosDatos;
        outfit = { ...datos.outfit };
        montura = Number(datos.mount) || 0;
        // Una montura que ya no está en la lista es como no tener ninguna.
        if (montura && !monturaElegida()) {
            montura = 0;
        }
        montado = !!datos.mounted && montura !== 0;
        cerrar();
        caja = el('div', 'pj-ventana');
        caja.setAttribute('role', 'dialog');
        const cabecera = el('div', 'pj-cabecera');
        cabecera.append(el('span', 'pj-titulo', datos.stats.name));
        const x = el('button', 'pj-icono', '✕');
        x.title = 'Cerrar (Escape)';
        x.onclick = cerrar;
        cabecera.appendChild(x);
        const cuerpo = el('div', 'pj-cuerpo');
        const pie = el('div', 'pj-pie');
        const ok = el('button', 'pj-guardar', 'Guardar aspecto');
        const conMonturas = Array.isArray(datos.mounts);
        ok.title = conMonturas ? 'Ponerse este aspecto, estos colores y esta montura'
            : 'Ponerse este aspecto y estos colores';
        ok.onclick = () => {
            guardar(outfit, conMonturas ? { id: montura, montado: montado && montura !== 0 } : null);
            cerrar();
        };
        const cancelar = el('button', '', 'Cerrar');
        cancelar.onclick = cerrar;
        pie.append(cancelar, ok);
        caja.append(cabecera, cuerpo, pie);
        document.body.appendChild(caja);
        pintar();
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && abierta()) {
            cerrar();
            e.stopPropagation();
        }
    }, true);

    return { abrir, cerrar, abierta };
}
