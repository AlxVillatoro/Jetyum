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
 */

import { paletteColor, PALETTE_SIZE } from './sprites.js';

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
 * @param {Function} opciones.guardar (outfit) => void, manda el aspecto al motor
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
        const sprite = provider.getCreature
            ? provider.getCreature({ id: 0, outfit, direction: direccion, moving: true }, performance.now())
            : null;
        if (sprite && sprite.canvas) {
            const escala = Math.floor(Math.min(lienzo.width, lienzo.height) / Math.max(sprite.canvas.width, sprite.canvas.height)) || 1;
            const w = sprite.canvas.width * escala;
            const h = sprite.canvas.height * escala;
            ctx.drawImage(sprite.canvas, (lienzo.width - w) / 2, (lienzo.height - h) / 2, w, h);
        }
        animacion = requestAnimationFrame(dibujarMuneco);
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

        cuerpo.append(izq, der);
        if (!animacion) {
            animacion = requestAnimationFrame(dibujarMuneco);
        }
    }

    function abrir(nuevosDatos) {
        datos = nuevosDatos;
        outfit = { ...datos.outfit };
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
        ok.title = 'Ponerse este aspecto y estos colores';
        ok.onclick = () => { guardar(outfit); cerrar(); };
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
