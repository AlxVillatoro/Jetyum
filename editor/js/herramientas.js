/**
 * LAS HERRAMIENTAS DE RME EN LA PESTAÑA MAPA: la barra de edición, las paletas de Terreno, Casas,
 * Ciudades y Waypoints, la selección y el portapapeles, el cubo, buscar y reemplazar, el
 * minimapa, el historial y sus atajos.
 *
 * La lógica está en módulos puros —`pinceles.js` (bordes, muros, alfombras, mesas),
 * `edicion.js` (portapapeles, relleno, búsqueda, casas...) e `historial.js` (deshacer)— y aquí
 * solo se cablean botones, ratón y teclado. `main.js` le pasa un contexto con el estado y sus
 * funciones de refresco, y le cede el ratón cuando la herramienta puesta es una de estas.
 */

import {
    normalizarPinceles, indexar, pintarSuelo, pintarMuro, pintarAlineable, ponerHueco,
    rehacerAlrededor, borderizarArea
} from './pinceles.js';
import {
    rectangulo, dentroDe, copiarArea, borrarArea, pegar, areaDeRelleno, buscar, reemplazar,
    quitarPorId, aleatorizar, estadisticas, crearCiudad, borrarCiudad, ponerTemplo, crearCasa,
    cambiarCasa, borrarCasa, pintarCasa, ponerSalida, casillasDeCasa, limpiarCasasInvalidas,
    ponerWaypoint, quitarWaypoint
} from './edicion.js';
import { Historial } from './historial.js';
import { ponerForma, formaDelPincel, nombreDeTamano } from './pincel.js';
import { ponerIcono } from './iconos.js';

const TILE = 32;

/** Las herramientas que lleva este módulo (el resto las lleva main.js). */
export const HERRAMIENTAS_PROPIAS = ['seleccionar', 'pegar', 'rellenar', 'pincel-suelo', 'pincel-muro',
    'pincel-alineable', 'puerta', 'ventana', 'casa', 'salida-casa', 'templo', 'waypoint'];

/** Las que pintan con el pincel y se pueden arrastrar. */
const DE_ARRASTRE = ['pincel-suelo', 'pincel-muro', 'pincel-alineable', 'casa'];

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

/** Un color estable por casa, para teñir sus casillas. */
function colorDeCasa(id, alfa) {
    const tono = (Number(id) * 137) % 360;
    return 'hsla(' + tono + ', 80%, 55%, ' + alfa + ')';
}

export class Herramientas {
    /**
     * @param {Object} ctx
     * @param {Object} ctx.state el estado de main.js
     * @param {Object} ctx.api
     * @param {Function} ctx.estado (texto, error) escribe en la barra de estado
     * @param {Function} ctx.refrescar refresca paneles y recuentos
     * @param {Function} ctx.ponerHerramienta (nombre, elemento)
     * @param {Function} ctx.soltarMano
     * @param {Function} ctx.nombreDeObjeto
     * @param {Function} ctx.modoDePaleta
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.state = ctx.state;
        this.idx = indexar(normalizarPinceles({ format: 'jetyum-pinceles' }).data);
        this.autoborde = true;
        this.verCasas = true;
        this.verMinimapa = true;
        this.seleccion = null;
        this.portapapeles = null;
        this.pincelElegido = null;
        this.casaElegida = null;
        this.ciudadElegida = null;
        this.waypointElegido = null;
        this.pulsado = null;
        this.historial = null;
        this.versionMapa = 0;
        this.minimapa = { version: -1, z: -1, lienzo: null, colores: new Map() };
    }

    $(id) {
        return document.getElementById(id);
    }

    get mapa() {
        return this.state.map;
    }

    get lienzo() {
        return this.state.canvas;
    }

    // -----------------------------------------------------------------------
    // Arranque
    // -----------------------------------------------------------------------

    async iniciar() {
        const r = await this.ctx.api.getPinceles();
        if (!r.error) {
            this.idx = indexar(r.data);
            if (r.problems && r.problems.length) {
                this.ctx.estado('pinceles con avisos: ' + r.problems.slice(0, 2).join('; '), true);
            }
        }
        this._cablearBarra();
        this._cablearTeclado();
        this._cablearHistorial();
        this._cablearMinimapa();
        this.lienzo.alDibujar = (lienzo) => this._dibujarEncima(lienzo);
        this.pintarPaletaTerreno();
    }

    /** Al abrir un mapa: historial nuevo y paletas de sus listas. */
    alAbrirMapa() {
        this.historial = new Historial(this.mapa);
        this.seleccion = null;
        this.casaElegida = null;
        this.ciudadElegida = null;
        this.versionMapa += 1;
        this.pintarPaletaCasas();
        this.pintarPaletaCiudades();
        this.pintarPaletaWaypoints();
    }

    alCambiarPaleta(modo) {
        if (modo === 'terreno') { this.pintarPaletaTerreno(); }
        if (modo === 'casas') { this.pintarPaletaCasas(); }
        if (modo === 'ciudades') { this.pintarPaletaCiudades(); }
        if (modo === 'waypoints') { this.pintarPaletaWaypoints(); }
    }

    maneja(herramienta) {
        return HERRAMIENTAS_PROPIAS.includes(herramienta);
    }

    _poner(nombre, boton, mano) {
        this.ctx.ponerHerramienta(nombre, boton || null);
        if (mano) {
            const info = this.$('mano-info');
            info.textContent = mano;
        }
    }

    // -----------------------------------------------------------------------
    // Historial
    // -----------------------------------------------------------------------

    _cablearHistorial() {
        // Cada vez que termina un gesto (soltar el ratón, una tecla, un clic en un botón) se cierra
        // la acción: si el mapa cambió, entra en el historial con el texto del estado como nombre.
        const cerrar = () => setTimeout(() => this.confirmar(), 0);
        ['mouseup', 'keyup', 'click', 'change'].forEach((evento) => window.addEventListener(evento, cerrar));
    }

    confirmar() {
        if (!this.historial || !this.mapa) {
            return;
        }
        const nombre = (this.$('map-status').textContent || 'cambio').slice(0, 80);
        if (this.historial.confirmar(nombre)) {
            this.versionMapa += 1;
            this._refrescarBotonesHistorial();
        }
    }

    deshacer() {
        if (!this.historial) {
            return;
        }
        const nombre = this.historial.deshacer();
        this.versionMapa += 1;
        this.ctx.refrescar();
        this._refrescarBotonesHistorial();
        this.ctx.estado(nombre ? 'deshecho: ' + nombre : 'no hay nada que deshacer', !nombre);
        this._refrescarListas();
    }

    rehacer() {
        if (!this.historial) {
            return;
        }
        const nombre = this.historial.rehacer();
        this.versionMapa += 1;
        this.ctx.refrescar();
        this._refrescarBotonesHistorial();
        this.ctx.estado(nombre ? 'rehecho: ' + nombre : 'no hay nada que rehacer', !nombre);
        this._refrescarListas();
    }

    _refrescarBotonesHistorial() {
        this.$('rme-deshacer').disabled = !this.historial || !this.historial.puedeDeshacer;
        this.$('rme-rehacer').disabled = !this.historial || !this.historial.puedeRehacer;
    }

    _refrescarListas() {
        this.pintarPaletaCasas();
        this.pintarPaletaCiudades();
        this.pintarPaletaWaypoints();
    }

    // -----------------------------------------------------------------------
    // La barra
    // -----------------------------------------------------------------------

    _cablearBarra() {
        const clic = (id, fn) => this.$(id).addEventListener('click', (e) => fn(e));
        clic('rme-deshacer', () => this.deshacer());
        clic('rme-rehacer', () => this.rehacer());
        clic('rme-seleccionar', (e) => this.herramientaSeleccionar(e.currentTarget));
        clic('rme-copiar', () => this.copiar());
        clic('rme-cortar', () => this.cortar());
        clic('rme-pegar', (e) => this.empezarPegado(e.currentTarget));
        clic('rme-borrar-sel', () => this.borrarSeleccion());
        clic('rme-borderizar', () => this.borderizar());
        clic('rme-aleatorizar', () => this.aleatorizar());
        clic('rme-rellenar', (e) => this.herramientaRellenar(e.currentTarget));
        clic('rme-buscar', () => this.dialogoBuscar());
        clic('rme-reemplazar', () => this.dialogoReemplazar());
        clic('rme-ir', () => this.irA());
        clic('rme-estadisticas', () => this.dialogoEstadisticas());
        clic('rme-limpiar', () => this.dialogoLimpiar());
        clic('rme-autoborde', () => this.alternarAutoborde());
        clic('rme-forma', () => {
            const forma = ponerForma(formaDelPincel() === 'cuadrado' ? 'circulo' : 'cuadrado');
            ponerIcono(this.$('rme-forma'), forma === 'circulo' ? 'circulo' : 'cuadrado');
            this.ctx.estado('pincel ' + forma + ' de ' + nombreDeTamano(this.state.pincel));
        });
        clic('rme-rejilla', () => {
            this.lienzo.sinRejilla = !this.lienzo.sinRejilla;
            this.$('rme-rejilla').classList.toggle('active', !this.lienzo.sinRejilla);
        });
        clic('rme-ver-casas', () => {
            this.verCasas = !this.verCasas;
            this.$('rme-ver-casas').classList.toggle('active', this.verCasas);
        });
        clic('rme-minimapa', () => this.alternarMinimapa());
        this._refrescarBotonesHistorial();
    }

    alternarAutoborde() {
        this.autoborde = !this.autoborde;
        this.$('rme-autoborde').classList.toggle('active', this.autoborde);
        this.ctx.estado('bordes automáticos ' + (this.autoborde ? 'activados' : 'desactivados'));
    }

    alternarMinimapa() {
        this.verMinimapa = !this.verMinimapa;
        this.$('rme-minimapa').classList.toggle('active', this.verMinimapa);
        this.$('minimapa').hidden = !this.verMinimapa;
    }

    // -----------------------------------------------------------------------
    // Teclado: los atajos de RME
    // -----------------------------------------------------------------------

    _cablearTeclado() {
        window.addEventListener('keydown', (e) => {
            const t = e.target && e.target.tagName;
            if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') {
                return;
            }
            if (!this.$('panel-map').classList.contains('active')) {
                return;
            }
            const ctrl = e.ctrlKey || e.metaKey;
            const k = e.key.toLowerCase();
            let hecho = true;
            if (ctrl && k === 'z' && !e.shiftKey) { this.deshacer(); }
            else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { this.rehacer(); }
            else if (ctrl && k === 'c') { this.copiar(); }
            else if (ctrl && k === 'x') { this.cortar(); }
            else if (ctrl && k === 'v') { this.empezarPegado(this.$('rme-pegar')); }
            else if (ctrl && k === 'f' && e.shiftKey) { this.dialogoReemplazar(); }
            else if (ctrl && k === 'f') { this.dialogoBuscar(); }
            else if (ctrl && k === 'g') { this.irA(); }
            else if (ctrl && k === 'b') { this.borderizar(); }
            else if (ctrl && k === 'd') { this.herramientaRellenar(this.$('rme-rellenar')); }
            else if (ctrl || e.altKey) { hecho = false; }
            else if (e.key === 'Delete') { this.borrarSeleccion(); }
            else if (e.key === 'F8') { this.dialogoEstadisticas(); }
            else if (k === 'a') { this.alternarAutoborde(); }
            else if (k === 'm') { this.alternarMinimapa(); }
            else if (k === 's') { this.herramientaSeleccionar(this.$('rme-seleccionar')); }
            else if (k === 't') { this.ctx.modoDePaleta('terreno'); }
            else if (k === 'i') { this.ctx.modoDePaleta('sueltos'); }
            else if (k === 'd') { this.ctx.modoDePaleta('compuestos'); }
            else if (k === 'h') { this.ctx.modoDePaleta('casas'); }
            else if (k === 'w') { this.ctx.modoDePaleta('waypoints'); }
            else { hecho = false; }
            if (hecho) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    }

    // -----------------------------------------------------------------------
    // El ratón (main.js se lo cede con estas herramientas)
    // -----------------------------------------------------------------------

    /** @returns {boolean} si se ha ocupado del clic */
    alPulsar(cell, event) {
        const tool = this.state.tool;
        if (!this.maneja(tool) || !this.mapa) {
            return false;
        }
        const z = this.lienzo.z;
        const derecho = event.button === 2;
        this.pulsado = { inicio: cell, derecho, ultima: null };

        if (tool === 'seleccionar') {
            this.seleccion = rectangulo(cell, cell, z);
            return true;
        }
        if (tool === 'pegar') {
            this.pegarEn(cell);
            return true;
        }
        if (tool === 'rellenar') {
            this.rellenarEn(cell, derecho);
            return true;
        }
        if (tool === 'puerta' || tool === 'ventana') {
            const r = ponerHueco(this.mapa, this.idx, cell.x, cell.y, z, tool);
            this.ctx.estado(r.ok ? tool + ' puesta (' + r.alineacion + ')' : r.problema, !r.ok);
            this.ctx.refrescar();
            return true;
        }
        if (tool === 'salida-casa') {
            const r = ponerSalida(this.mapa, this.casaElegida, cell.x, cell.y, z);
            this.ctx.estado(r.ok ? 'salida de «' + r.casa.name + '» en (' + cell.x + ',' + cell.y + ',' + z + ')' : r.problema, !r.ok);
            this.pintarPaletaCasas();
            return true;
        }
        if (tool === 'templo') {
            const r = ponerTemplo(this.mapa, this.ciudadElegida, cell.x, cell.y, z);
            this.ctx.estado(r.ok ? 'templo de «' + r.ciudad.name + '» en (' + cell.x + ',' + cell.y + ',' + z + ')' : r.problema, !r.ok);
            this.pintarPaletaCiudades();
            return true;
        }
        if (tool === 'waypoint') {
            const r = ponerWaypoint(this.mapa, this.waypointElegido, cell.x, cell.y, z);
            this.ctx.estado(r.ok ? 'waypoint «' + this.waypointElegido + '» en (' + cell.x + ',' + cell.y + ',' + z + ')' : r.problema, !r.ok);
            this.pintarPaletaWaypoints();
            return true;
        }
        this._pintarCon(cell, derecho);
        return true;
    }

    alMover(cell) {
        if (!this.pulsado || !this.mapa) {
            return;
        }
        const tool = this.state.tool;
        if (tool === 'seleccionar') {
            this.seleccion = rectangulo(this.pulsado.inicio, cell, this.lienzo.z);
            return;
        }
        if (DE_ARRASTRE.includes(tool)) {
            this._pintarCon(cell, this.pulsado.derecho);
        }
    }

    alSoltar() {
        if (!this.pulsado) {
            return;
        }
        if (this.state.tool === 'seleccionar' && this.seleccion) {
            const s = this.seleccion;
            this.ctx.estado('selección de ' + (s.x1 - s.x0 + 1) + 'x' + (s.y1 - s.y0 + 1) + ' en la planta ' + s.z +
                ': Ctrl+C copia, Ctrl+X corta, Supr borra, Ctrl+B borderiza');
        }
        this.pulsado = null;
        this.ctx.refrescar();
    }

    _casillasDelPincel(cell) {
        return this.mapa.casillasDelCuadro(cell.x, cell.y, this.lienzo.z, this.state.pincel);
    }

    /** Pinta (o borra, con el derecho) con el pincel de terreno o de casa elegido. */
    _pintarCon(cell, derecho) {
        const clave = cell.x + ',' + cell.y;
        if (this.pulsado && this.pulsado.ultima === clave) {
            return;
        }
        if (this.pulsado) {
            this.pulsado.ultima = clave;
        }
        const z = this.lienzo.z;
        const casillas = this._casillasDelPincel(cell);
        const tool = this.state.tool;

        if (tool === 'casa') {
            if (!this.casaElegida) {
                this.ctx.estado('elige antes una casa en la paleta Casas', true);
                return;
            }
            const n = pintarCasa(this.mapa, casillas, z, this.casaElegida, derecho);
            this.ctx.estado((derecho ? 'quitadas ' : 'marcadas ') + n + ' casilla(s) de la casa ' + this.casaElegida);
            return;
        }
        if (derecho) {
            casillas.forEach((c) => this.mapa.erase(c.x, c.y, z));
            if (this.autoborde) {
                rehacerAlrededor(this.mapa, this.idx, casillas, z);
            }
            this.ctx.estado('borradas ' + casillas.length + ' casilla(s)');
            return;
        }
        const p = this.pincelElegido;
        if (!p) {
            return;
        }
        let n = 0;
        if (tool === 'pincel-suelo') {
            n = pintarSuelo(this.mapa, this.autoborde ? this.idx : this._sinBordes(), p.pincel, casillas, z);
        } else if (tool === 'pincel-muro') {
            n = pintarMuro(this.mapa, this.idx, p.pincel, casillas, z);
        } else if (tool === 'pincel-alineable') {
            n = pintarAlineable(this.mapa, this.idx, p.pincel, casillas, z);
        }
        this.ctx.estado(p.pincel.nombre + ' en ' + n + ' casilla(s)' + (tool === 'pincel-suelo' && this.autoborde ? ' con bordes' : ''));
    }

    /** Un índice sin bordes, para pintar suelo con el borde automático apagado. */
    _sinBordes() {
        return { ...this.idx, bordePorId: new Map() };
    }

    /**
     * Lo que main.js llama al pintar un SUELO SUELTO de la paleta de objetos: si ese suelo es de
     * un pincel y el borde automático está puesto, se pinta con el pincel y se borderiza.
     *
     * @returns {number|null} casillas pintadas, o null si no le toca
     */
    pintarSueloSuelto(x, y, z, typeId) {
        const pincel = this.idx.sueloDeObjeto.get(Number(typeId));
        if (!this.autoborde || !pincel) {
            return null;
        }
        const casillas = this.mapa.casillasDelCuadro(x, y, z, this.state.pincel);
        casillas.forEach((c) => {
            const tile = this.mapa.editableTile(c.x, c.y, z);
            tile.ground = Number(typeId) === this.mapa.defaultGroundFor(z) ? null : Number(typeId);
            this.mapa.markDirty(c.x, c.y, z);
        });
        rehacerAlrededor(this.mapa, this.idx, casillas, z);
        return casillas.length;
    }

    /** Después de borrar con la goma: los vecinos se rehacen, como en RME. */
    trasBorrar(x, y, z) {
        if (this.autoborde && this.mapa) {
            rehacerAlrededor(this.mapa, this.idx, this.mapa.casillasDelCuadro(x, y, z, this.state.pincel), z);
        }
    }

    // -----------------------------------------------------------------------
    // Selección y portapapeles
    // -----------------------------------------------------------------------

    herramientaSeleccionar(boton) {
        this.ctx.soltarMano();
        this._poner('seleccionar', boton, 'seleccionar: arrastra un rectángulo en el mapa');
        this.ctx.estado('seleccionar: arrastra para marcar un rectángulo');
    }

    _rectActual() {
        return this.seleccion && this.seleccion.z === this.lienzo.z ? this.seleccion : null;
    }

    copiar() {
        const r = this._rectActual();
        if (!r) {
            this.ctx.estado('no hay selección en esta planta: usa «Seleccionar» (S)', true);
            return false;
        }
        this.portapapeles = copiarArea(this.mapa, r);
        this.ctx.estado('copiadas ' + this.portapapeles.celdas.length + ' casilla(s) de ' +
            this.portapapeles.ancho + 'x' + this.portapapeles.alto + '. Ctrl+V para pegar');
        return true;
    }

    cortar() {
        if (!this.copiar()) {
            return;
        }
        const r = this._rectActual();
        const n = borrarArea(this.mapa, r);
        if (this.autoborde) {
            borderizarArea(this.mapa, this.idx, r.x0, r.y0, r.x1, r.y1, r.z);
        }
        this.ctx.estado('cortadas ' + n + ' casilla(s): Ctrl+V para pegarlas');
        this.ctx.refrescar();
    }

    empezarPegado(boton) {
        if (!this.portapapeles) {
            this.ctx.estado('no hay nada copiado', true);
            return;
        }
        this._poner('pegar', boton, 'pegando ' + this.portapapeles.ancho + 'x' + this.portapapeles.alto +
            ': clic para pegar (esquina de arriba a la izquierda), Escape para soltar');
        this.ctx.estado('pegar: clic donde va la esquina de arriba a la izquierda');
    }

    pegarEn(cell) {
        const z = this.lienzo.z;
        const n = pegar(this.mapa, this.portapapeles, cell.x, cell.y, z);
        if (this.autoborde) {
            borderizarArea(this.mapa, this.idx, cell.x, cell.y, cell.x + this.portapapeles.ancho - 1,
                cell.y + this.portapapeles.alto - 1, z);
        }
        this.seleccion = rectangulo(cell, { x: cell.x + this.portapapeles.ancho - 1, y: cell.y + this.portapapeles.alto - 1 }, z);
        this.ctx.estado('pegadas ' + n + ' casilla(s) en (' + cell.x + ',' + cell.y + ',' + z + ')');
        this.ctx.refrescar();
    }

    borrarSeleccion() {
        const r = this._rectActual();
        if (!r) {
            this.ctx.estado('no hay selección en esta planta', true);
            return;
        }
        const n = borrarArea(this.mapa, r);
        if (this.autoborde) {
            borderizarArea(this.mapa, this.idx, r.x0, r.y0, r.x1, r.y1, r.z);
        }
        this.ctx.estado('borradas ' + n + ' casilla(s) de la selección');
        this.ctx.refrescar();
    }

    /** La selección, o lo que se ve en pantalla si no hay selección. */
    _areaDeTrabajo() {
        const r = this._rectActual();
        if (r) {
            return r;
        }
        const cam = this.lienzo.camera;
        const paso = this.lienzo.tileSize;
        const ancho = this.lienzo.vista.ancho / paso / 2;
        const alto = this.lienzo.vista.alto / paso / 2;
        return {
            x0: Math.max(0, Math.floor(cam.centerX - ancho)), y0: Math.max(0, Math.floor(cam.centerY - alto)),
            x1: Math.min(this.mapa.width - 1, Math.ceil(cam.centerX + ancho)),
            y1: Math.min(this.mapa.height - 1, Math.ceil(cam.centerY + alto)), z: this.lienzo.z
        };
    }

    borderizar() {
        const r = this._areaDeTrabajo();
        const n = borderizarArea(this.mapa, this.idx, r.x0, r.y0, r.x1, r.y1, r.z);
        this.ctx.estado('borderizado ' + (this._rectActual() ? 'la selección' : 'lo visible') + ': ' + n + ' casilla(s) cambiadas');
        this.ctx.refrescar();
    }

    aleatorizar() {
        const r = this._areaDeTrabajo();
        const n = aleatorizar(this.mapa, this.idx, r);
        this.ctx.estado('aleatorizado: ' + n + ' suelo(s) cambiados' + (n === 0 ? ' (los pinceles de suelo necesitan varias variantes)' : ''));
        this.ctx.refrescar();
    }

    // -----------------------------------------------------------------------
    // El cubo
    // -----------------------------------------------------------------------

    herramientaRellenar(boton) {
        const suelo = this._sueloParaRellenar();
        if (!suelo) {
            this.ctx.estado('para rellenar, elige antes un pincel de suelo (Terreno) o un suelo de la paleta', true);
            return;
        }
        this._sueloDeRelleno = suelo;
        this._poner('rellenar', boton, 'cubo de ' + suelo.nombre + ': clic en una zona del mismo suelo');
        this.ctx.estado('rellenar con ' + suelo.nombre + ': clic en el mapa');
    }

    _sueloParaRellenar() {
        if (this.pincelElegido && this.pincelElegido.tipo === 'suelo') {
            return { nombre: this.pincelElegido.pincel.nombre, pincel: this.pincelElegido.pincel };
        }
        if (this.state.selectedGround !== null && this.state.selectedGround !== undefined) {
            const id = this.state.selectedGround;
            const pincel = this.idx.sueloDeObjeto.get(Number(id)) || { nombre: this.ctx.nombreDeObjeto(id), z: 0, items: [{ id, chance: 1 }] };
            return { nombre: pincel.nombre, pincel };
        }
        return this._sueloDeRelleno || null;
    }

    rellenarEn(cell) {
        const s = this._sueloDeRelleno;
        const z = this.lienzo.z;
        const area = areaDeRelleno(this.mapa, cell.x, cell.y, z, 10000);
        pintarSuelo(this.mapa, this.autoborde ? this.idx : this._sinBordes(), s.pincel, area.casillas, z);
        this.ctx.estado('rellenadas ' + area.casillas.length + ' casilla(s) con ' + s.nombre +
            (area.cortado ? ' (tope de 10.000: el resto no)' : ''));
        this.ctx.refrescar();
    }

    // -----------------------------------------------------------------------
    // Paleta de Terreno
    // -----------------------------------------------------------------------

    _miniatura(id) {
        const c = el('canvas');
        c.width = TILE;
        c.height = TILE;
        const pinta = () => {
            const sprite = this.lienzo.provider.get(id);
            if (sprite && sprite.canvas) {
                const ctx = c.getContext('2d');
                ctx.clearRect(0, 0, TILE, TILE);
                ctx.drawImage(sprite.canvas, 0, TILE - sprite.canvas.height);
            }
        };
        pinta();
        setTimeout(pinta, 600);
        setTimeout(pinta, 2000);
        return c;
    }

    pintarPaletaTerreno() {
        const caja = this.$('paleta-terreno');
        if (!caja) {
            return;
        }
        caja.innerHTML = '';
        const p = this.idx.pinceles;
        const grupo = (titulo, lista, tipo, herramienta, primera) => {
            if (!lista || lista.length === 0) {
                return;
            }
            caja.appendChild(el('div', 'palette-title', titulo));
            lista.forEach((pincel) => {
                const b = el('button', 'plain pincel-boton' +
                    (this.pincelElegido && this.pincelElegido.pincel === pincel ? ' active' : ''));
                b.type = 'button';
                b.appendChild(this._miniatura(primera(pincel)));
                b.appendChild(el('span', '', pincel.nombre));
                b.addEventListener('click', () => {
                    this.pincelElegido = { tipo, pincel };
                    this.ctx.soltarMano();
                    this._poner(herramienta, null, pincel.nombre + ' — clic o arrastrar para pintar con el pincel de ' +
                        nombreDeTamano(this.state.pincel) + '; clic derecho borra' +
                        (tipo === 'suelo' ? '; los bordes se ponen solos' : ''));
                    this.ctx.estado('pincel: ' + pincel.nombre);
                    this.pintarPaletaTerreno();
                });
                caja.appendChild(b);
            });
        };
        grupo('Suelos (con borde)', p.suelos, 'suelo', 'pincel-suelo', (s) => s.items[0].id);
        grupo('Muros', p.muros, 'muro', 'pincel-muro', (m) => m.piezas.horizontal || m.piezas.poste);
        grupo('Alfombras', p.alfombras, 'alfombra', 'pincel-alineable', (a) => a.piezas.centro);
        grupo('Mesas', p.mesas, 'mesa', 'pincel-alineable', (m) => m.piezas.sola);

        caja.appendChild(el('div', 'palette-title', 'Puertas y ventanas'));
        const fila = el('div', 'row');
        [['puerta', 'Puerta'], ['ventana', 'Ventana']].forEach(([tool, nombre]) => {
            const b = el('button', 'plain tool', nombre);
            b.type = 'button';
            b.title = 'Clic sobre un muro: la ' + tool + ' toma la alineación del muro';
            b.addEventListener('click', () => {
                this.ctx.soltarMano();
                this._poner(tool, b, nombre + ': clic sobre un muro');
            });
            fila.appendChild(b);
        });
        caja.appendChild(fila);
        if (p.suelos.length === 0) {
            caja.appendChild(el('div', 'nota', 'No hay pinceles: genera los de prueba con node tools/generar-pinceles.mjs ' +
                'o escribe data/editor/pinceles.json (ver docs/MAPAS.md).'));
        }
    }

    // -----------------------------------------------------------------------
    // Paletas de Casas, Ciudades y Waypoints
    // -----------------------------------------------------------------------

    _boton(texto, fn, clase, titulo) {
        const b = el('button', clase || 'plain', texto);
        b.type = 'button';
        if (titulo) {
            b.title = titulo;
        }
        b.addEventListener('click', fn);
        return b;
    }

    pintarPaletaCasas() {
        const caja = this.$('paleta-casas');
        if (!caja || !this.mapa) {
            return;
        }
        caja.innerHTML = '';
        const m = this.mapa;
        const fila = el('div', 'row');
        fila.appendChild(this._boton('+ Casa', () => {
            const nombre = window.prompt('Nombre de la casa nueva:', 'Casa ' + (m.houses.length + 1));
            if (!nombre) { return; }
            const casa = crearCasa(m, nombre, this.ciudadElegida || (m.towns[0] && m.towns[0].id) || 0);
            this.casaElegida = casa.id;
            this.ctx.estado('casa «' + casa.name + '» creada (#' + casa.id + '): marca sus casillas con «Casillas»');
            this.pintarPaletaCasas();
        }));
        fila.appendChild(this._boton('Casillas', (e) => {
            if (!this.casaElegida) { this.ctx.estado('elige una casa', true); return; }
            this.ctx.soltarMano();
            this._poner('casa', e.currentTarget, 'casillas de la casa ' + this.casaElegida + ': pinta con el pincel; clic derecho las quita');
        }, 'plain tool', 'Pintar las casillas de la casa elegida (derecho: quitar)'));
        fila.appendChild(this._boton('Salida', (e) => {
            if (!this.casaElegida) { this.ctx.estado('elige una casa', true); return; }
            this.ctx.soltarMano();
            this._poner('salida-casa', e.currentTarget, 'salida de la casa ' + this.casaElegida + ': clic fuera de la casa');
        }, 'plain tool', 'La casilla de salida de la casa (fuera de ella)'));
        caja.appendChild(fila);

        m.houses.forEach((h) => {
            const f = el('div', 'lista-fila' + (h.id === this.casaElegida ? ' selected' : ''));
            const muestra = el('span', '', '■');
            muestra.style.color = colorDeCasa(h.id, 1);
            f.appendChild(muestra);
            f.appendChild(el('span', '', '#' + h.id + ' ' + h.name));
            const ciudad = m.towns.find((t) => t.id === h.townId);
            f.appendChild(el('em', '', casillasDeCasa(m, h.id).length + ' cas. · ' + (ciudad ? ciudad.name : 'sin ciudad')));
            f.addEventListener('click', () => {
                this.casaElegida = h.id;
                this.pintarPaletaCasas();
            });
            caja.appendChild(f);
        });

        const casa = m.houses.find((h) => h.id === this.casaElegida);
        if (casa) {
            caja.appendChild(el('div', 'sub-title', 'Casa #' + casa.id));
            const nombre = el('input');
            nombre.type = 'text';
            nombre.value = casa.name;
            nombre.addEventListener('change', () => { cambiarCasa(m, casa.id, { name: nombre.value }); this.pintarPaletaCasas(); });
            const renta = el('input');
            renta.type = 'number';
            renta.min = 0;
            renta.value = casa.rent || 0;
            renta.title = 'Alquiler';
            renta.addEventListener('change', () => cambiarCasa(m, casa.id, { rent: renta.value }));
            const ciudad = el('select');
            const ninguna = el('option', '', 'sin ciudad');
            ninguna.value = '0';
            ciudad.appendChild(ninguna);
            m.towns.forEach((t) => {
                const o = el('option', '', t.name);
                o.value = String(t.id);
                ciudad.appendChild(o);
            });
            ciudad.value = String(casa.townId || 0);
            ciudad.addEventListener('change', () => { cambiarCasa(m, casa.id, { townId: ciudad.value }); this.pintarPaletaCasas(); });
            [['Nombre', nombre], ['Alquiler', renta], ['Ciudad', ciudad]].forEach(([t, c]) => {
                const lab = el('label', 'field');
                lab.appendChild(el('span', '', t));
                lab.appendChild(c);
                caja.appendChild(lab);
            });
            caja.appendChild(el('div', 'nota', 'Salida: ' + (casa.exit ? casa.exit.join(', ') : 'sin poner')));
            const acciones = el('div', 'row');
            acciones.appendChild(this._boton('Ir', () => {
                const c = casillasDeCasa(m, casa.id)[0];
                const destino = c ? [c.x, c.y, c.z] : casa.exit;
                if (destino) { this.irAPosicion(destino[0], destino[1], destino[2]); }
            }));
            acciones.appendChild(this._boton('Borrar casa', () => {
                if (!window.confirm('¿Borrar la casa «' + casa.name + '»? Sus casillas dejan de ser de casa.')) { return; }
                const n = borrarCasa(m, casa.id);
                this.casaElegida = null;
                this.ctx.estado('casa borrada; ' + n + ' casilla(s) liberadas');
                this.pintarPaletaCasas();
                this.ctx.refrescar();
            }, 'danger'));
            caja.appendChild(acciones);
        }
        if (m.houses.length === 0) {
            caja.appendChild(el('div', 'nota', 'No hay casas. «+ Casa» crea una; después «Casillas» pinta su interior y «Salida» marca la puerta de fuera.'));
        }
    }

    pintarPaletaCiudades() {
        const caja = this.$('paleta-ciudades');
        if (!caja || !this.mapa) {
            return;
        }
        caja.innerHTML = '';
        const m = this.mapa;
        const fila = el('div', 'row');
        fila.appendChild(this._boton('+ Ciudad', () => {
            const nombre = window.prompt('Nombre de la ciudad nueva:', 'Ciudad ' + (m.towns.length + 1));
            if (!nombre) { return; }
            const centro = [Math.round(this.lienzo.camera.centerX), Math.round(this.lienzo.camera.centerY), this.lienzo.z];
            const c = crearCiudad(m, nombre, centro);
            this.ciudadElegida = c.id;
            this.ctx.estado('ciudad «' + c.name + '» creada con el templo en el centro de la vista: «Templo» lo coloca');
            this.pintarPaletaCiudades();
        }));
        fila.appendChild(this._boton('Templo', (e) => {
            if (!this.ciudadElegida) { this.ctx.estado('elige una ciudad', true); return; }
            this.ctx.soltarMano();
            this._poner('templo', e.currentTarget, 'templo de la ciudad ' + this.ciudadElegida + ': clic en el mapa');
        }, 'plain tool', 'Colocar el templo (donde se reaparece) de la ciudad elegida'));
        caja.appendChild(fila);
        m.towns.forEach((t) => {
            const f = el('div', 'lista-fila' + (t.id === this.ciudadElegida ? ' selected' : ''));
            f.appendChild(el('span', '', '#' + t.id + ' ' + t.name));
            f.appendChild(el('em', '', 'templo ' + (Array.isArray(t.temple) ? t.temple.join(',') : '?')));
            f.addEventListener('click', () => { this.ciudadElegida = t.id; this.pintarPaletaCiudades(); });
            f.addEventListener('dblclick', () => { if (Array.isArray(t.temple)) { this.irAPosicion(...t.temple); } });
            caja.appendChild(f);
        });
        const ciudad = m.towns.find((t) => t.id === this.ciudadElegida);
        if (ciudad) {
            const nombre = el('input');
            nombre.type = 'text';
            nombre.value = ciudad.name;
            nombre.addEventListener('change', () => { ciudad.name = nombre.value; m.extrasSucios = true; this.pintarPaletaCiudades(); });
            const lab = el('label', 'field');
            lab.appendChild(el('span', '', 'Nombre'));
            lab.appendChild(nombre);
            caja.appendChild(lab);
            caja.appendChild(this._boton('Borrar ciudad', () => {
                const r = borrarCiudad(m, ciudad.id);
                this.ctx.estado(r.ok ? 'ciudad borrada' : r.problema, !r.ok);
                if (r.ok) { this.ciudadElegida = null; }
                this.pintarPaletaCiudades();
            }, 'danger'));
        }
        caja.appendChild(el('div', 'nota', 'Doble clic en una ciudad lleva a su templo.'));
    }

    pintarPaletaWaypoints() {
        const caja = this.$('paleta-waypoints');
        if (!caja || !this.mapa) {
            return;
        }
        caja.innerHTML = '';
        const m = this.mapa;
        const fila = el('div', 'row');
        fila.appendChild(this._boton('+ Waypoint', (e) => {
            const nombre = window.prompt('Nombre del waypoint:', 'waypoint' + (Object.keys(m.waypoints).length + 1));
            if (!nombre) { return; }
            this.waypointElegido = nombre.trim();
            this.ctx.soltarMano();
            this._poner('waypoint', e.currentTarget, 'waypoint «' + this.waypointElegido + '»: clic donde va');
            this.ctx.estado('waypoint «' + this.waypointElegido + '»: clic en el mapa para colocarlo');
        }));
        fila.appendChild(this._boton('Mover', (e) => {
            if (!this.waypointElegido) { this.ctx.estado('elige un waypoint', true); return; }
            this.ctx.soltarMano();
            this._poner('waypoint', e.currentTarget, 'mover el waypoint «' + this.waypointElegido + '»: clic en el mapa');
        }, 'plain tool'));
        fila.appendChild(this._boton('Quitar', () => {
            if (!this.waypointElegido) { return; }
            if (this.waypointElegido === 'temple' && !window.confirm('«temple» es donde aparecen los jugadores nuevos. ¿Quitarlo?')) { return; }
            const r = quitarWaypoint(m, this.waypointElegido);
            this.ctx.estado(r.ok ? 'waypoint quitado' : r.problema, !r.ok);
            this.waypointElegido = null;
            this.pintarPaletaWaypoints();
        }, 'danger'));
        caja.appendChild(fila);
        Object.keys(m.waypoints).sort().forEach((nombre) => {
            const f = el('div', 'lista-fila' + (nombre === this.waypointElegido ? ' selected' : ''));
            f.appendChild(el('span', '', nombre));
            f.appendChild(el('em', '', m.waypoints[nombre].join(', ')));
            f.addEventListener('click', () => { this.waypointElegido = nombre; this.pintarPaletaWaypoints(); });
            f.addEventListener('dblclick', () => this.irAPosicion(...m.waypoints[nombre]));
            caja.appendChild(f);
        });
    }

    // -----------------------------------------------------------------------
    // Diálogos: buscar, reemplazar, estadísticas, limpiar, ir a
    // -----------------------------------------------------------------------

    _dialogo(titulo) {
        const d = this.$('map-dialogo');
        d.innerHTML = '';
        d.hidden = false;
        const cerrar = this._boton('✕', () => { d.hidden = true; }, 'plain cerrar');
        d.appendChild(cerrar);
        d.appendChild(el('div', 'section-title', titulo));
        return d;
    }

    _campo(caja, etiqueta, tipo, valor, placeholder) {
        const i = el('input');
        i.type = tipo;
        if (valor !== undefined) { i.value = valor; }
        if (placeholder) { i.placeholder = placeholder; }
        const lab = el('label', 'field');
        lab.appendChild(el('span', '', etiqueta));
        lab.appendChild(i);
        caja.appendChild(lab);
        return i;
    }

    irAPosicion(x, y, z) {
        if (z !== undefined && z !== this.lienzo.z) {
            this.lienzo.setFloor(Number(z));
            const floor = this.$('floor-select');
            if (floor) { floor.value = String(z); }
        }
        this.lienzo.centerOn(Number(x), Number(y));
        this.lienzo.hover = { x: Number(x), y: Number(y) };
    }

    irA() {
        const texto = window.prompt('Ir a la posición (x, y, z):',
            Math.round(this.lienzo.camera.centerX) + ', ' + Math.round(this.lienzo.camera.centerY) + ', ' + this.lienzo.z);
        if (!texto) { return; }
        const p = texto.split(/[,\s]+/).map(Number);
        if (p.length < 2 || p.some((n) => !Number.isFinite(n))) {
            this.ctx.estado('posición no válida: escribe x, y, z', true);
            return;
        }
        this.irAPosicion(p[0], p[1], p.length > 2 ? p[2] : this.lienzo.z);
        this.ctx.estado('en (' + p.join(',') + ')');
    }

    dialogoBuscar() {
        const d = this._dialogo('Buscar (Ctrl+F)');
        const id = this._campo(d, 'Id de objeto', 'number');
        const aid = this._campo(d, 'Action ID', 'number');
        const uid = this._campo(d, 'Unique ID', 'number');
        const texto = this._campo(d, 'Texto escrito', 'text');
        const soloSel = el('label', 'row');
        const chk = el('input');
        chk.type = 'checkbox';
        soloSel.appendChild(chk);
        soloSel.appendChild(el('span', '', 'solo en la selección'));
        d.appendChild(soloSel);
        const resultados = el('div');
        d.appendChild(this._boton('Buscar', () => {
            const lista = buscar(this.mapa, {
                id: Number(id.value) || 0, actionId: Number(aid.value) || 0,
                uniqueId: Number(uid.value) || 0, texto: texto.value.trim()
            }, chk.checked ? this._rectActual() : null);
            resultados.innerHTML = '';
            resultados.appendChild(el('div', 'nota', lista.length + ' resultado(s)' + (lista.length > 300 ? ' (se enseñan 300)' : '')));
            lista.slice(0, 300).forEach((r) => {
                const f = el('div', 'resultado');
                f.appendChild(el('span', '', r.x + ', ' + r.y + ', ' + r.z));
                f.appendChild(el('span', '', this.ctx.nombreDeObjeto(r.id) + ' (' + r.id + ')'));
                f.appendChild(el('em', '', r.motivo));
                f.addEventListener('click', () => this.irAPosicion(r.x, r.y, r.z));
                resultados.appendChild(f);
            });
        }, ''));
        d.appendChild(resultados);
        id.focus();
    }

    dialogoReemplazar() {
        const d = this._dialogo('Reemplazar objetos (Ctrl+Shift+F)');
        const de = this._campo(d, 'Cambiar el objeto', 'number');
        const a = this._campo(d, 'por el objeto', 'number');
        d.appendChild(el('div', 'nota', this._rectActual() ? 'Se aplica en la SELECCIÓN.' : 'Sin selección: se aplica en TODO el mapa.'));
        d.appendChild(this._boton('Reemplazar', () => {
            const origen = Number(de.value);
            const destino = Number(a.value);
            if (!this.mapa.itemTypes.has(destino)) {
                this.ctx.estado('el objeto ' + destino + ' no existe en items.xml', true);
                return;
            }
            const n = reemplazar(this.mapa, origen, destino, this._rectActual());
            this.ctx.estado('reemplazados ' + n + ' objeto(s) ' + origen + ' por ' + destino);
            this.ctx.refrescar();
        }, ''));
        de.focus();
    }

    dialogoEstadisticas() {
        const d = this._dialogo('Estadísticas del mapa (F8)');
        const e = estadisticas(this.mapa);
        const filas = [
            ['Tamaño', e.tamano], ['Casillas explícitas', e.casillas], ['Plantas usadas', e.plantasUsadas.join(', ')],
            ['Objetos', e.objetos], ['Con atributos', e.conAtributos], ['Tipos distintos', e.tiposDistintos],
            ['Respawns / monstruos', e.respawns + ' / ' + e.monstruos], ['NPC', e.npcs], ['Compuestos', e.compuestos],
            ['Ciudades', e.ciudades], ['Casas (casillas)', e.casas + ' (' + e.casillasDeCasa + ')'], ['Waypoints', e.waypoints]
        ];
        filas.forEach(([k, v]) => {
            const f = el('div', 'detalle-fila');
            f.appendChild(el('span', '', k));
            f.appendChild(el('em', '', String(v)));
            d.appendChild(f);
        });
        d.appendChild(el('div', 'sub-title', 'Los más usados'));
        e.masUsados.forEach(([id, n]) => {
            const f = el('div', 'resultado');
            f.appendChild(el('span', '', this.ctx.nombreDeObjeto(id) + ' (' + id + ')'));
            f.appendChild(el('em', '', n + ' vez/veces'));
            f.addEventListener('click', () => {
                const r = buscar(this.mapa, { id })[0];
                if (r) { this.irAPosicion(r.x, r.y, r.z); }
            });
            d.appendChild(f);
        });
    }

    dialogoLimpiar() {
        const d = this._dialogo('Limpieza del mapa');
        d.appendChild(this._boton('Limpiar casas inválidas', () => {
            const n = limpiarCasasInvalidas(this.mapa);
            this.ctx.estado(n + ' casilla(s) de casas que ya no existen, liberadas');
            this.ctx.refrescar();
        }, 'plain', 'Casillas marcadas con una casa que no está en la lista'));
        const id = this._campo(d, 'Quitar todos los objetos con el id', 'number');
        d.appendChild(this._boton('Quitar', () => {
            const n = quitarPorId(this.mapa, Number(id.value), this._rectActual());
            this.ctx.estado('quitados ' + n + ' objeto(s) ' + id.value + (this._rectActual() ? ' de la selección' : ' del mapa'));
            this.ctx.refrescar();
        }, 'danger'));
    }

    // -----------------------------------------------------------------------
    // Dibujo: selección, pegado, pinceles, casas y minimapa
    // -----------------------------------------------------------------------

    _cablearMinimapa() {
        const mini = this.$('minimapa');
        mini.addEventListener('mousedown', (e) => {
            if (!this.mapa) { return; }
            const r = mini.getBoundingClientRect();
            const x = Math.floor((e.clientX - r.left) / r.width * this.mapa.width);
            const y = Math.floor((e.clientY - r.top) / r.height * this.mapa.height);
            this.lienzo.centerOn(x, y);
            e.stopPropagation();
        });
    }

    _colorDe(id) {
        const cache = this.minimapa.colores;
        if (cache.has(id)) {
            return cache.get(id);
        }
        const sprite = this.lienzo.provider.get(id);
        if (!sprite || !sprite.canvas) {
            return null;
        }
        const color = this.lienzo._colorDeSuelo(sprite);
        // Mientras las hojas cargan sale el gris neutro: no se guarda para volver a intentarlo.
        if (color !== '#2a2a30') {
            cache.set(id, color);
        }
        return color;
    }

    _dibujarMinimapa() {
        const mini = this.$('minimapa');
        if (!this.verMinimapa || !this.mapa) {
            return;
        }
        const m = this.mapa;
        const z = this.lienzo.z;
        const firma = this.versionMapa + ':' + z + ':' + m.tiles.size + ':' + this.minimapa.colores.size;
        if (this.minimapa.firma !== firma) {
            this.minimapa.firma = firma;
            const fuera = this.minimapa.lienzo || document.createElement('canvas');
            fuera.width = m.width;
            fuera.height = m.height;
            const ctx = fuera.getContext('2d');
            ctx.fillStyle = this._colorDe(m.defaultGroundFor(z)) || '#1a1a20';
            ctx.fillRect(0, 0, m.width, m.height);
            m.tiles.forEach((tile) => {
                if (tile.z !== z) { return; }
                const arriba = tile.items.filter((i) => !this.idx.piezasDeBorde.has(i.id));
                const id = arriba.length ? arriba[arriba.length - 1].id : (tile.ground !== null ? tile.ground : null);
                const color = id !== null ? this._colorDe(id) : null;
                if (color) {
                    ctx.fillStyle = color;
                    ctx.fillRect(tile.x, tile.y, 1, 1);
                }
            });
            this.minimapa.lienzo = fuera;
        }
        const lado = 200;
        const escala = lado / Math.max(m.width, m.height);
        mini.width = Math.round(m.width * escala);
        mini.height = Math.round(m.height * escala);
        const ctx = mini.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.minimapa.lienzo, 0, 0, mini.width, mini.height);
        const paso = this.lienzo.tileSize;
        const cam = this.lienzo.camera;
        const ancho = this.lienzo.vista.ancho / paso;
        const alto = this.lienzo.vista.alto / paso;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect((cam.centerX - ancho / 2) * escala + 0.5, (cam.centerY - alto / 2) * escala + 0.5,
            ancho * escala, alto * escala);
    }

    _dibujarEncima(lienzo) {
        const ctx = lienzo.ctx;
        const paso = lienzo.tileSize;
        const z = lienzo.z;
        const m = this.mapa;
        if (!m) {
            return;
        }

        // Las casas: cada una con su color, y su salida con una «S».
        if (this.verCasas && (m.houses.length > 0 || this.state.tool === 'casa')) {
            ctx.save();
            m.tiles.forEach((tile) => {
                if (tile.z !== z || !tile.houseId) { return; }
                const p = lienzo.camera.worldToScreen(tile.x, tile.y, z);
                ctx.fillStyle = colorDeCasa(tile.houseId, tile.houseId === this.casaElegida ? 0.4 : 0.22);
                ctx.fillRect(p.x, p.y, paso, paso);
            });
            m.houses.forEach((h) => {
                if (!h.exit || h.exit[2] !== z) { return; }
                const p = lienzo.camera.worldToScreen(h.exit[0], h.exit[1], z);
                ctx.strokeStyle = colorDeCasa(h.id, 1);
                ctx.lineWidth = 2;
                ctx.strokeRect(p.x + 2, p.y + 2, paso - 4, paso - 4);
                if (paso >= 14) {
                    ctx.fillStyle = colorDeCasa(h.id, 1);
                    ctx.font = 'bold 10px monospace';
                    ctx.fillText('S' + h.id, p.x + 4, p.y + 12);
                }
            });
            // Los templos de las ciudades.
            m.towns.forEach((t) => {
                if (!Array.isArray(t.temple) || t.temple[2] !== z) { return; }
                const p = lienzo.camera.worldToScreen(t.temple[0], t.temple[1], z);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(p.x + paso / 2, p.y + paso / 2, paso / 3, 0, Math.PI * 2);
                ctx.stroke();
                if (paso >= 14) {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '10px monospace';
                    ctx.fillText('templo ' + t.name, p.x, p.y - 3);
                }
            });
            ctx.restore();
        }

        // La selección.
        const s = this._rectActual();
        if (s) {
            const a = lienzo.camera.worldToScreen(s.x0, s.y0, z);
            ctx.save();
            ctx.fillStyle = 'rgba(80, 160, 255, 0.12)';
            ctx.fillRect(a.x, a.y, (s.x1 - s.x0 + 1) * paso, (s.y1 - s.y0 + 1) * paso);
            ctx.setLineDash([6, 3]);
            ctx.strokeStyle = '#5aa0ff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(a.x + 0.5, a.y + 0.5, (s.x1 - s.x0 + 1) * paso - 1, (s.y1 - s.y0 + 1) * paso - 1);
            ctx.restore();
        }

        const hover = lienzo.hover;
        // El fantasma del pegado.
        if (this.state.tool === 'pegar' && this.portapapeles && hover) {
            ctx.save();
            ctx.globalAlpha = 0.55;
            const escala = paso / TILE;
            this.portapapeles.celdas.forEach((c) => {
                const p = lienzo.camera.worldToScreen(hover.x + c.dx, hover.y + c.dy, z);
                const ids = (c.ground !== null ? [c.ground] : []).concat(c.items.map((i) => i.id));
                ids.forEach((id) => {
                    const sprite = lienzo.provider.get(id);
                    if (sprite && sprite.canvas) {
                        ctx.drawImage(sprite.canvas, Math.round(p.x - (sprite.anchorX || 0) * escala),
                            Math.round(p.y - sprite.anchorY * escala + paso), sprite.canvas.width * escala, sprite.canvas.height * escala);
                    }
                });
            });
            ctx.globalAlpha = 1;
            const p = lienzo.camera.worldToScreen(hover.x, hover.y, z);
            ctx.strokeStyle = '#5aa0ff';
            ctx.strokeRect(p.x + 0.5, p.y + 0.5, this.portapapeles.ancho * paso - 1, this.portapapeles.alto * paso - 1);
            ctx.restore();
        }

        // El bloque del pincel de terreno o de casa.
        if (hover && ['pincel-suelo', 'pincel-muro', 'pincel-alineable', 'casa', 'rellenar', 'puerta', 'ventana',
            'salida-casa', 'templo', 'waypoint'].includes(this.state.tool)) {
            const bloque = ['rellenar', 'puerta', 'ventana', 'salida-casa', 'templo', 'waypoint'].includes(this.state.tool)
                ? [hover] : this._casillasDelPincel(hover);
            ctx.save();
            ctx.strokeStyle = this.state.tool === 'casa' ? colorDeCasa(this.casaElegida || 1, 1) : '#ffd24a';
            ctx.lineWidth = 1;
            bloque.forEach((c) => {
                const p = lienzo.camera.worldToScreen(c.x, c.y, z);
                ctx.strokeRect(p.x + 0.5, p.y + 0.5, paso - 1, paso - 1);
            });
            ctx.restore();
        }

        this._dibujarMinimapa();
    }
}
