/**
 * El cliente: atar las piezas.
 *
 * Aquí se juntan la conexión, el mundo del cliente, la cámara, la lista de dibujo y
 * el renderer. Es el único archivo de esta carpeta que sabe de todos los demás, y a
 * propósito: las piezas no se conocen entre sí, así que cada una se puede probar
 * sola.
 *
 * SOBRE EL BUCLE. Se dibuja con `requestAnimationFrame`, que va a la frecuencia del
 * monitor, pero eso es sólo el DIBUJO. La simulación no vive aquí: el mundo lo
 * simula el servidor y el cliente se limita a interpolar lo que le llega. Es la
 * diferencia entre un cliente y un motor, y es lo que hace que no se pueda hacer
 * trampa desde aquí.
 */

import { CLIENT, SERVER, OFFSET_TO_WALK, MOVE_ITEM_FIELD } from '/shared/js/protocol.mjs';

import { Connection, pedirPersonajes } from './connection.js';
import { ClientWorld } from './world.js';
import { Camera } from './camera.js';
import { buildDrawList, summarize } from './drawlist.js';
import { crearVentanaPersonaje } from './personaje.js';
import { Renderer } from './renderer.js';
import { IsoCamera, IsoRenderer } from './iso.js';
import { createProvider, TILE } from './sprites.js';
import * as itemtypes from './itemtypes.js';
import { crearArrastre } from './arrastrar.js';
import { crearConsola } from './consola.js';
import { crearMinimapa } from './minimapa.js';
import { crearLateral } from './lateral.js';
import { crearVentanaContenedor } from './contenedor.js';
import { crearVentanaComercio } from './comercio.js';
import { crearDialogo } from './dialogo.js';
import { crearHotkeys } from './hotkeys.js';
import { crearGestorVentanas } from './ventanas.js';
import { pintarIconos } from './iconos.js';
import {
    alternarMochila,
    crearPanelEquipo,
    actualizarEquipo,
    actualizarStats,
    dibujarPendiente,
    dibujoParaArrastrar,
    limpiarPaneles
} from './panels.js';

/** Cada cuánto se puede reintentar un paso rechazado. */
/*
 * CUANTAS VECES SE AGRANDA EL MUNDO.
 *
 * Con 1, en un monitor de 1500 px se ven unos 47 tiles de ancho y los muñecos son
 * diminutos. Con 2 se ven 23 y se distinguen las caras, que es como se juega a esto.
 *
 * No hay que tocar nada mas: el renderer escala el contexto y la camara recibe un viewport
 * dividido por este numero, asi que el mundo se ve el doble de grande sin mover ni una
 * posicion. Y el raton se divide tambien, o los clics caerian al doble de lejos.
 */
// El zoom ya no es un número fijo: el renderer amplía el área visible (15x11 casillas, o la que
// diga el motor) hasta llenar la ventana. Ver `Renderer.resize`.

const REPEAT_DELAY = 150;

/** Cuánto dura un texto dicho por alguien en pantalla. */
const SAY_DURATION = 4000;

/** Lo que tarda un número de daño o curación en subir y desvanecerse. */
const DURACION_TEXTO_FLOTANTE = 1100;

class Game {
    constructor(options) {
        const opts = options || {};

        this.canvas = opts.canvas;
        this.diagnostics = opts.diagnostics || null;

        this.world = new ClientWorld();
        // LA VISTA ISOMÉTRICA (prototipo, js/iso.js): `?iso=1` en la URL. Mismo mundo, otra cámara
        // y otro pintado.
        this.iso = !!opts.iso;
        this.camera = new (this.iso ? IsoCamera : Camera)({ width: 960, height: 640, tileSize: TILE });
        this.provider = createProvider({ provider: 'assets', sinRespaldo: true });
        this.renderer = new (this.iso ? IsoRenderer : Renderer)({
            canvas: this.canvas,
            provider: this.provider
        });

        this.connection = null;
        this.playerName = opts.name || 'Aventurero';

        /** Teclas de dirección pulsadas ahora mismo. */
        this.pressed = new Set();
        this.lastWalkSentAt = 0;

        /** Lo que se está diciendo, con su caducidad. */
        this.recentSays = [];

        /** Los números de daño y curación que suben sobre las casillas («-29», «+10»). */
        this.textosFlotantes = [];

        /** Los efectos sobre las casillas (una llama, un golpe) y los proyectiles que vuelan. */
        this.efectos = [];
        this.proyectiles = [];

        this.running = false;
        this.lastFrameAt = 0;
        this.fps = 0;

        /*
         * EL PANEL DE EQUIPO SE CREA AQUI Y NO EN `boot()`.
         *
         * Lo unico que necesita son las ranuras, y las crea el mismo. Antes recibia una funcion
         * para soltar con un clic, y eso se ha quitado al llegar el arrastre: un clic es el final
         * de un arrastre que no llego a ninguna parte, asi que seguir soltando objetos con el
         * haria que un arrastre fallido tirara el objeto al suelo.
         *
         * Y se limpia justo despues porque al arrancar no hay partida: los paneles nacen con
         * rayas y con el equipo oculto, que es lo que dice la verdad hasta que el motor mande
         * los datos del jugador.
         */
        crearPanelEquipo();
        limpiarPaneles();

        /*
         * LAS BANDERAS DE LOS OBJETOS, que llegan por HTTP y NO se esperan.
         *
         * Son las que dicen que se puede arrastrar y donde encaja cada cosa, y salen del mismo
         * `items.xml` del que las aprende el motor porque las copia el generador de sprites. Hasta
         * que lleguen, el cliente contesta lo conservador -no se puede arrastrar-, asi que el mundo
         * se puede dibujar igual y no hay que bloquear el arranque esperando un fichero.
         */
        itemtypes.cargar();

        /*
         * EL ARRASTRE. Aqui se le dan los tres extremos que solo el juego sabe resolver -de donde
         * sale el objeto, que hay debajo del raton y como se pide el movimiento-, y el modulo se
         * queda con el gesto: pulsar, seguir al raton y soltar.
         */
        /** La ventana del personaje: clic derecho sobre uno mismo. */
        this.ventanaPersonaje = crearVentanaPersonaje({
            provider: this.provider,
            guardar: (o) => this.connection && this.connection.send(
                [CLIENT.SET_OUTFIT, o.lookType, o.head, o.body, o.legs, o.feet, o.addons || 0])
        });

        /** La consola de abajo: lo que se dice y los mensajes del servidor, con su hora. */
        this.consola = crearConsola({
            lineas: document.getElementById('consola-lineas'),
            pestanas: document.querySelector('.consola-pestanas')
        });

        /** El minimapa: el color `minimap` de cada cosa del pack. */
        this.minimapa = crearMinimapa({
            lienzo: document.getElementById('minimapa'),
            colorDe: (id) => {
                const cosa = this.provider.thing ? this.provider.thing('items', id) : null;
                return cosa && cosa.flags && cosa.flags.minimap ? Number(cosa.flags.minimap) : 0;
            }
        });

        // CLIC EN EL MINIMAPA: ir andando hasta ahí (o lo más cerca posible, aunque sea una zona
        // sin descubrir).
        const lienzoMinimapa = document.getElementById('minimapa');
        if (lienzoMinimapa) {
            lienzoMinimapa.addEventListener('click', (e) => {
                const yo = this.world.playerId ? this.world.creatures.get(this.world.playerId) : null;
                if (!yo) {
                    return;
                }
                const r = lienzoMinimapa.getBoundingClientRect();
                const px = (e.clientX - r.left) * lienzoMinimapa.width / r.width;
                const py = (e.clientY - r.top) * lienzoMinimapa.height / r.height;
                const destino = this.minimapa.casillaEn(px, py, { x: yo.x, y: yo.y, z: yo.z });
                if (destino) {
                    this.walkTo(destino.x, destino.y, destino.z, true);
                }
            });
        }

        /** La criatura que se está atacando (para la lista de batalla). */
        this.objetivo = null;
        this.ultimoLateral = 0;

        /** Dónde va cada ventana: columna derecha, izquierda si no cabe, y se arrastran. */
        this.ventanas = crearGestorVentanas({
            der: document.getElementById('columna-der'),
            izq: document.getElementById('columna-izq'),
            lateralIzq: document.getElementById('lateral-izq'),
            alCambiar: () => this.resize()
        });

        this.lateral = crearLateral({
            gestor: this.ventanas,
            provider: this.provider,
            minimapa: this.minimapa,
            acciones: {
                stop: () => this.stop(),
                salir: () => this.salir(),
                atacar: (id) => this.alternarObjetivo(id),
                opcion: (nombre, valor) => this._opcion(nombre, valor)
            }
        });

        /** El cuerpo (o la caja) abierto con clic derecho. */
        this.contenedor = crearVentanaContenedor({
            gestor: this.ventanas,
            provider: this.provider,
            coger: (id, indice) => this.connection && this.connection.send([CLIENT.CONTAINER_TAKE, id, indice]),
            usar: (id, indice) => this.connection && this.connection.send([CLIENT.USE_CONTAINER, id, indice]),
            ambos: () => performance.now() < (this.mirandoHasta || 0),
            cerrar: (id) => this.connection && this.connection.send([CLIENT.CLOSE_CONTAINER, id])
        });

        /** La ventana de comercio de un NPC («comerciar» a su lado). */
        this.dialogo = crearDialogo();

        // El botón de las hotkeys (junto a la capacidad: panels.js lo repinta, así que se escucha
        // en el documento).
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-abrir-hotkeys]')) {
                this.hotkeys.alternar();
            }
        });
        // Las hotkeys (F1-F12, Shift+F1-F12): magias y objetos, en ti o en tu objetivo. Ctrl+K.
        this.hotkeys = crearHotkeys({
            provider: this.provider,
            inventario: () => this.world.inventory,
            personaje: () => (this.world.player ? this.world.player.name : ''),
            quien: () => ({ yo: this.world.playerId, objetivo: this.objetivo }),
            ejecutar: (accion) => {
                if (accion.decir) {
                    this.say(accion.decir);
                } else if (accion.escribir) {
                    const chat = document.getElementById('chat');
                    if (chat) {
                        chat.value = accion.escribir + ' ';
                        chat.focus();
                    }
                } else if (accion.usar && this.connection) {
                    this.connection.send([CLIENT.USE_HOTKEY_ITEM, accion.usar, accion.en]);
                } else if (accion.aviso) {
                    this.consola.servidor(accion.aviso);
                }
            }
        });
        this.comercio = crearVentanaComercio({
            gestor: this.ventanas,
            provider: this.provider,
            comprar: (typeId, n) => this.connection && this.connection.send([CLIENT.SHOP_BUY, typeId, n]),
            vender: (typeId, n) => this.connection && this.connection.send([CLIENT.SHOP_SELL, typeId, n]),
            cerrar: () => this.connection && this.connection.send([CLIENT.SHOP_CLOSE])
        });

        this.arrastre = crearArrastre({
            origenEnPunto: (x, y) => this._origenEnPunto(x, y),
            destinoEnPunto: (x, y) => this._destinoEnPunto(x, y),
            encaja: (typeId, destino) => this._encaja(typeId, destino),
            alMover: (origen, destino) => this.moverObjeto(origen, destino)
        });
    }

    // -----------------------------------------------------------------------
    // Arranque
    // -----------------------------------------------------------------------

    start(url, credentials) {
        this.resize();
        this._mostrarCarga();

        this.connection = new Connection({
            url: url,
            credentials: credentials,

            onMessages: (messages) => this._onMessages(messages),
            onOpen: () => this._setStatus('conectado, entrando al mundo...'),
            onClose: (wasConnected) => {
                this._setStatus(wasConnected
                    ? 'desconectado, reintentando...'
                    : 'no se pudo conectar, reintentando...');

                // Al perder la conexión el mundo del cliente ya no vale: lo que
                // tuviera es de una sesión que ya no existe.
                this.world = new ClientWorld();
                this.camera.setCenter(0, 0, 7);

                // Y si el jugador estaba arrastrando algo, el fantasma que sigue al raton se
                // queda colgado en la pantalla para siempre: no hay raton que lo suelte, porque
                // la partida a la que pertenecia ya no existe.
                if (this.arrastre) {
                    this.arrastre.cancelar();
                }

                // Y los paneles son parte de ese mundo: dejarlos con la vida y el equipo de
                // la sesión que se acaba de perder ensenaria un jugador que ya no existe.
                limpiarPaneles();
                this.contenedor.cerrar();
            },
            onError: () => this._setStatus('error de conexion')
        });

        this.connection.connect();

        this.running = true;
        this.lastFrameAt = performance.now();
        requestAnimationFrame((time) => this._frame(time));
    }

    // -----------------------------------------------------------------------
    // Lo que llega
    // -----------------------------------------------------------------------

    _onMessages(messages) {
        const result = this.world.apply(messages, { SERVER: SERVER, CLIENT: CLIENT });

        result.events.forEach((event) => {
            if (event.type === 'animatedText') {
                // El número que sube: lo guarda el cliente y lo dibuja el renderer un segundo.
                this.textosFlotantes.push({ x: event.x, y: event.y, z: event.z, tipo: event.tipo,
                    texto: event.text, desde: performance.now() });
            } else if (event.type === 'magicEffect') {
                this.efectos.push({ x: event.x, y: event.y, z: event.z, efecto: event.efecto, desde: performance.now() });
            } else if (event.type === 'distanceEffect') {
                // Como en OTClient: tarda más cuanto más lejos va (150 ms × raíz de la distancia).
                const distancia = Math.max(1, Math.hypot(event.hasta.x - event.desde.x, event.hasta.y - event.desde.y));
                this.proyectiles.push({ origen: event.desde, hasta: event.hasta, proyectil: event.proyectil,
                    desde: performance.now(), dura: 150 * Math.sqrt(distancia) });
            } else if (event.type === 'questLog') {
                pintarMisiones(event.quests);
            } else if (event.type === 'shopOpen') {
                this.comercio.abrir(event);
            } else if (event.type === 'shopClose') {
                this.comercio.cerrar();
            } else if (event.type === 'privateMessage') {
                if (event.canal === 'grupo') {
                    this.consola.grupo(event.from, event.text);
                } else {
                    this.consola.privado(event.from, event.from, event.text);
                }
            } else if (event.type === 'popup') {
                this.dialogo.abrir(event.titulo, event.texto);
            } else if (event.type === 'party') {
                this.consola.servidor(event.lider
                    ? 'Tu grupo: ' + event.miembros.join(', ') + ' (manda ' + event.lider + '). Escribe «/p texto» para hablarles.'
                    : 'Ya no estás en ningún grupo.');
            } else if (event.type === 'containerOpen') {
                this.contenedor.abrir(event.data);
            } else if (event.type === 'containerClose') {
                this.contenedor.cerrar(event.id);
            } else if (event.type === 'outfitWindow') {
                this.ventanaPersonaje.abrir(event.data);
            } else if (event.type === 'hello') {
                // El motor dice cuántas casillas se VEN (config.js `visibleTilesX/Y`). Uno antiguo
                // sólo dice cuántas manda: se enseñan dos menos por lado, que es el margen que
                // deja entrar las casillas deslizándose.
                if (event.size.visibleWidth && event.size.visibleHeight) {
                    this.renderer.setVista(event.size.visibleWidth, event.size.visibleHeight);
                    this.resize();
                } else if (event.size.viewWidth && event.size.viewHeight) {
                    const enviadoAncho = 2 * Math.floor(event.size.viewWidth / 2) + 1;
                    const enviadoAlto = 2 * Math.floor(event.size.viewHeight / 2) + 1;
                    this.renderer.setVista(enviadoAncho - 4, enviadoAlto - 4);
                    this.resize();
                }
            } else if (event.type === 'text') {
                this.consola.servidor(event.text);
            } else if (event.type === 'say') {
                this.consola.hablar(event.name, event.text);
                this._addSay(event.name, event.text, event.creatureId);
            } else if (event.type === 'login') {
                this._setStatus('dentro del mundo como ' + event.player.name);
                this.camera.setCenter(event.player.x, event.player.y, event.player.z);

                // La vida, el nivel y la vocacion llegan con la bienvenida, asi que los stats
                // se pintan ya y no cuando cambie algo: si no, el panel empezaria a cero y
                // pareceria que el jugador entra herido.
                actualizarStats(event.player);
            } else if (event.type === 'floorChange') {
                this.camera.z = event.z;
            } else if (event.type === 'loginError') {
                // Se vuelve a la pantalla de entrada con el motivo puesto. Sin esto,
                // una contraseña mal escrita dejaba al jugador mirando una pantalla
                // en negro sin saber qué había pasado.
                this._showLoginError(event.error);
            } else if (event.type === 'inventory') {
                this._updateInventory(event.entries, event.weight, event.capacity);
            } else if (event.type === 'stats') {
                /*
                 * Se lee del mundo y no del evento: los stats los guarda `world.js` en el
                 * jugador -que es donde vive el estado del cliente-, y pasarlos por el evento
                 * seria el mismo dato en dos sitios. Los del inventario sí viajan porque
                 * llevan el peso y la capacidad, que no son del jugador.
                 */
                actualizarStats(this.world.player);
            } else if (event.type === 'death') {
                this.objetivo = null;
                this.consola.servidor('Has muerto' + (event.killer ? ' a manos de ' + event.killer : '') + '.');
                // El motor avisa por separado del texto, así que el cliente puede
                // reaccionar sin tener que interpretar el mensaje. Aquí basta con
                // centrar la cámara en el templo: el muñeco ya está allí.
                this._setStatus('has muerto' +
                    (event.killer ? ' a manos de ' + event.killer : '') +
                    (event.dropped > 0 ? '; soltaste ' + event.dropped + ' cosa(s)' : ''));
            }
        });
    }

    /**
     * Pinta el equipo, la mochila y el peso.
     *
     * LA BARRA DE ABAJO YA NO EXISTE, y es lo que pedia el usuario: decia "llevas:" y enseñaba una
     * lista siempre visible, que contradice la regla de que sin mochila no se lleva nada. Todo lo
     * que llevas se ve ahora en su sitio -lo puesto en su ranura y lo demas dentro de la mochila-,
     * que es ademas donde hace falta para poder arrastrarlo.
     *
     * Las dos vistas salen del MISMO mensaje del motor, y el motor manda la ranura de cada cosa:
     * aqui no se deduce nada.
     */
    _updateInventory(entries, weight, capacity) {
        actualizarEquipo(entries, this.provider, itemtypes,
            { weight: weight, capacity: capacity });
        // La mochila puede haber crecido: se vuelve a repartir el alto de las ventanas.
        this.ventanas.colocar();
    }

    // -----------------------------------------------------------------------
    // Arrastrar
    // -----------------------------------------------------------------------

    /** El tile que hay debajo de un punto de la pantalla. */
    _tileEnPantalla(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();

        void rect;
        const p = this.renderer.puntoMundo(clientX, clientY);
        return this.camera.screenToWorld(p.x, p.y, this.camera.z);
    }

    /**
     * De donde sale un objeto que se empieza a arrastrar, o null.
     *
     * DOS SITIOS: una entrada del panel -que lleva su indice de inventario- y el SUELO, que es el
     * objeto de mas arriba de la casilla. El suelo es el caso que obliga a hacer el arrastre a mano
     * -un lienzo no tiene hijos que arrastrar-, y el que necesita las banderas: si el objeto de
     * arriba no se puede coger, el arrastre NI EMPIEZA. Es lo que hace que un muro no deje
     * arrastrarse, y es lo unico que el cliente decide por su cuenta... porque el motor lo dice
     * igual: `pickupable` es la misma bandera que consulta el.
     */
    _origenEnPunto(clientX, clientY) {
        const elemento = document.elementFromPoint(clientX, clientY);

        if (!elemento) {
            return null;
        }

        const entradaDom = elemento.closest('.arrastrable');

        // Un objeto de la ventana del cuerpo abierto: se arrastra al mapa, a una ranura o a la mochila.
        if (entradaDom && entradaDom.dataset.contenedor) {
            const objeto = this.contenedor.objetoEn(Number(entradaDom.dataset.contenedor), Number(entradaDom.dataset.hueco));
            if (!objeto) {
                return null;
            }
            return {
                origen: { kind: 'container', id: Number(entradaDom.dataset.contenedor), index: objeto.index },
                typeId: objeto.typeId,
                dibujo: dibujoParaArrastrar(objeto.typeId, this.provider)
            };
        }

        if (entradaDom) {
            const indice = Number(entradaDom.dataset.index);
            const entrada = this.world.inventory.find((e) => e.index === indice);

            if (!entrada) {
                return null;
            }

            return {
                origen: { kind: 'inventory', index: indice },
                typeId: entrada.typeId,
                dibujo: dibujoParaArrastrar(entrada.typeId, this.provider)
            };
        }

        if (elemento === this.canvas) {
            const position = this._tileEnPantalla(clientX, clientY);
            const tile = this.world.getTile(position.x, position.y, position.z);
            // Lo de arriba que se pueda mover, con la misma regla que el motor: lo que va siempre
            // encima y no se mueve (un borde) no tapa a lo que hay debajo.
            const arriba = tile ? objetoMovible(tile) : null;

            if (!arriba || !itemtypes.esMovible(arriba.id)) {
                return null;
            }

            return {
                origen: { kind: 'ground', x: position.x, y: position.y, z: position.z },
                typeId: arriba.id,
                dibujo: dibujoParaArrastrar(arriba.id, this.provider)
            };
        }

        return null;
    }

    /**
     * Donde se suelta lo que se arrastra: una ranura, la mochila o el suelo.
     *
     * Devuelve tambien el ELEMENTO, que es lo que hay que resaltar. El motor comprobara despues si
     * el destino vale; aqui solo se dice "aqui".
     */
    _destinoEnPunto(clientX, clientY) {
        const elemento = document.elementFromPoint(clientX, clientY);

        if (!elemento) {
            return null;
        }

        const ranura = elemento.closest('[data-destino="ranura"]');
        if (ranura) {
            return {
                destino: { kind: 'slot', slot: ranura.dataset.slot },
                elemento: ranura
            };
        }

        const mochila = elemento.closest('[data-destino="mochila"]');
        if (mochila) {
            return { destino: { kind: 'container' }, elemento: mochila };
        }

        // La ventana abierta de una mochila tirada o de un cuerpo: dentro de ese contenedor.
        const delSuelo = elemento.closest('[data-destino="contenedor-suelo"]');
        if (delSuelo) {
            return {
                destino: { kind: 'groundContainer', id: Number(delSuelo.dataset.contenedorId) },
                elemento: delSuelo
            };
        }

        if (elemento === this.canvas) {
            const position = this._tileEnPantalla(clientX, clientY);
            return {
                destino: { kind: 'ground', x: position.x, y: position.y, z: position.z },
                elemento: this.canvas
            };
        }

        return null;
    }

    /**
     * Si el objeto ENCAJA en ese destino. Solo sirve para resaltarlo.
     *
     * Se contesta con las mismas banderas que usa el motor, y con la misma regla para la mochila:
     * meter algo dentro necesita una mochila puesta. Cuando no encaja, el arrastre se marca en rojo
     * y AUN ASI SE PIDE: el motor es el que dice que no, y su motivo es el que se enseña. Decidir
     * aqui que no se pide seria tener la regla en dos sitios, y el dia que discreparan el cliente
     * se quedaria sin hacer algo que si se puede.
     */
    _encaja(typeId, destino) {
        if (destino.kind === 'slot') {
            // En la ranura de la mochila puesta, lo que no es otra mochila va DENTRO de ella.
            if (destino.slot === 'backpack' && !itemtypes.esContenedor(typeId) &&
                this.world.inventory.some((e) => e.slot === 'backpack' && itemtypes.esContenedor(e.typeId))) {
                return true;
            }
            return itemtypes.encajaEn(typeId, destino.slot);
        }

        if (destino.kind === 'groundContainer') {
            return !itemtypes.esContenedor(typeId);
        }

        if (destino.kind === 'container') {
            return this.world.inventory.some((entrada) =>
                entrada.slot !== 'inside' && itemtypes.esContenedor(entrada.typeId));
        }

        return destino.kind === 'ground';
    }

    /**
     * Pide al motor que mueva un objeto. El cliente no decide nada: pide y espera.
     *
     * Si el motor dice que no, contesta con un texto que sale en el chat. Si dice que si, manda el
     * inventario entero y la casilla que cambio, y el panel se repinta solo.
     */
    moverObjeto(origen, destino) {
        if (!this.connection) {
            return;
        }

        const desde = origen.kind === 'ground'
            ? [origen.kind, origen.x, origen.y, origen.z, 0]
            : [origen.kind, 0, 0, 0, origen.index];

        const hasta = destino.kind === 'slot'
            ? [destino.kind, 0, 0, 0, destino.slot]
            : [destino.kind, destino.x || 0, destino.y || 0, destino.z || 0, 0];

        // Del cuerpo abierto: además, de qué contenedor (FROM_ID va al final del mensaje); y a
        // la ventana de un contenedor del suelo, a cuál (TO_ID).
        const mensaje = [CLIENT.MOVE_ITEM].concat(desde, hasta);
        mensaje[MOVE_ITEM_FIELD.FROM_ID] = origen.kind === 'container' ? origen.id : 0;
        if (destino.kind === 'groundContainer') {
            mensaje[MOVE_ITEM_FIELD.TO_ID] = destino.id;
        }
        this.connection.send(mensaje);
    }

    _showLoginError(error) {
        this.running = false;
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }

        // Se vuelve a la pantalla de entrada, asi que los paneles vuelven a su sitio: el
        // jugador que se veia en ellos no ha llegado a existir.
        limpiarPaneles();

        const overlay = document.getElementById('overlay');
        const message = document.getElementById('login-error');

        if (message) {
            message.textContent = error;
            message.style.display = 'block';
        }
        this._ocultarCarga();
        if (overlay) {
            overlay.style.display = 'flex';
        }
        this._setStatus('no se pudo entrar: ' + error);
    }

    _addSay(name, text, creatureId) {
        // Lo que dice alguien sale encima de su cabeza un rato, como en Tibia (y queda en la consola).
        this.recentSays = this.recentSays.filter((say) => say.creatureId !== creatureId || creatureId === undefined);
        this.recentSays.push({
            line: name ? name + ': ' + text : text,
            name: name,
            text: text,
            creatureId: creatureId,
            until: performance.now() + SAY_DURATION
        });
        if (this.recentSays.length > 6) {
            this.recentSays.shift();
        }
    }

    // -----------------------------------------------------------------------
    // Entrada
    // -----------------------------------------------------------------------

    onKeyDown(key) {
        this.pressed.add(key);
    }

    onKeyUp(key) {
        this.pressed.delete(key);
    }

    clearKeys() {
        this.pressed.clear();
    }

    /**
     * Lo que se escribe abajo. Con la pestaña de una conversación delante va a esa persona;
     * «@nombre texto» abre una conversación; «/p texto» habla al grupo. Lo demás se dice en voz
     * alta (o es un comando: «/item», un hechizo...).
     */
    say(text) {
        if (!text || !this.connection) {
            return;
        }
        const privado = /^@(\S+)\s+(.+)$/.exec(text);
        if (privado) {
            this.mandarPrivado(privado[1], privado[2]);
            this.consola.abrirPrivado(privado[1]);
            return;
        }
        const grupo = /^\/p\s+(.+)$/.exec(text);
        if (grupo) {
            this.connection.send([CLIENT.PRIVATE_MESSAGE, '#grupo', grupo[1]]);
            return;
        }
        const destino = this.consola.destino();
        if (destino && !text.startsWith('/')) {
            if (destino === '#grupo') {
                this.connection.send([CLIENT.PRIVATE_MESSAGE, '#grupo', text]);
            } else {
                this.mandarPrivado(destino, text);
            }
            return;
        }
        this.connection.send([CLIENT.SAY, text]);
    }

    /** Un mensaje privado: se manda y se apunta en su pestaña. */
    mandarPrivado(nombre, texto) {
        this.connection.send([CLIENT.PRIVATE_MESSAGE, nombre, texto]);
        const yo = this.world.player ? this.world.player.name : 'Tú';
        this.consola.privado(nombre, yo, texto);
    }

    /** Usar algo que llevas (comer, beber): su índice en el inventario. */
    usarDelInventario(indice) {
        if (this.connection) {
            this.connection.send([CLIENT.USE_INVENTORY, Number(indice)]);
        }
    }

    /** Pedir el diario de misiones (al abrir su ventana). */
    pedirMisiones() {
        if (this.connection) {
            this.connection.send([CLIENT.QUEST_LOG]);
        }
    }

    look(x, y, z) {
        if (this.connection) {
            this.connection.send([CLIENT.LOOK, x, y, z]);
        }
    }

    pickUp(x, y, z) {
        if (this.connection) {
            this.connection.send([CLIENT.PICKUP, x, y, z]);
        }
    }

    /**
     * USA lo que hay en una casilla: abrir una puerta, tirar de una palanca. El motor decide qué
     * objeto se usa (el de más arriba que tenga una acción) y si está al alcance.
     */
    use(x, y, z) {
        if (this.connection) {
            this.connection.send([CLIENT.USE_ITEM, x, y, z]);
        }
    }

    /** Usa la casilla que el jugador tiene delante (la tecla E). */
    useInFront() {
        const me = this.world.playerId ? this.world.creatures.get(this.world.playerId) : null;
        if (!me) {
            return;
        }
        // Las direcciones de Tibia: 0 norte, 1 este, 2 sur, 3 oeste.
        const delante = [[0, -1], [1, 0], [0, 1], [-1, 0]][me.direction] || [0, 1];
        this.use(me.x + delante[0], me.y + delante[1], me.z);
    }

    /**
     * Suelta en el suelo el objeto de esa entrada del inventario.
     *
     * YA NO HAY NINGUN BOTON QUE LO LLAME, y se deja a proposito: soltar es lo que hace el arrastre
     * al suelo -que pasa por el mensaje de mover objeto, con su origen y su destino-, pero este
     * sigue siendo el unico camino para pedir un `DROP` suelto, y el motor lo tiene y lo prueba.
     * Desde la consola del navegador, `game.drop(0)` sigue funcionando.
     */
    drop(index) {
        if (this.connection) {
            this.connection.send([CLIENT.DROP, index]);
        }
    }

    attack(creatureId) {
        if (this.connection) {
            this.connection.send([CLIENT.ATTACK, creatureId]);
            this.objetivo = creatureId;
        }
    }

    /**
     * LA PANTALLA DE CARGA: tapa el mapa desde que se pulsa «Entrar» hasta que el escenario está
     * dibujado de verdad (llegó el mundo, llegaron las cosas y todas las hojas de sprites que se
     * ven). Así no se ve el mapa a medio pintar.
     */
    _mostrarCarga() {
        const capa = document.getElementById('cargando');
        if (!capa) {
            return;
        }
        this.cargando = { listos: 0, maxHojas: 0 };
        capa.hidden = false;
        capa.classList.remove('saliendo');
    }

    _comprobarCarga() {
        if (!this.cargando) {
            return;
        }
        const texto = document.getElementById('cargando-texto');
        const barra = document.getElementById('cargando-progreso');
        const pendientes = this.provider.hojasPendientes ? this.provider.hojasPendientes() : 0;
        this.cargando.maxHojas = Math.max(this.cargando.maxHojas, pendientes);
        let mensaje;
        let avance;
        if (!this.connection || !this.connection.connected) {
            mensaje = 'Conectando con el servidor…';
            avance = 5;
        } else if (!this.world.player || this.world.tiles.size === 0) {
            mensaje = 'Entrando al mundo…';
            avance = 25;
        } else if (!this.provider.listo) {
            mensaje = 'Cargando los dibujos…';
            avance = 45;
        } else if (pendientes > 0) {
            const hechas = this.cargando.maxHojas - pendientes;
            mensaje = 'Cargando el escenario… (' + hechas + ' de ' + this.cargando.maxHojas + ')';
            avance = 50 + Math.round(45 * hechas / Math.max(1, this.cargando.maxHojas));
        } else {
            mensaje = 'Listo';
            avance = 100;
        }
        if (texto) {
            texto.textContent = mensaje;
        }
        if (barra) {
            barra.style.width = avance + '%';
        }
        // Listo varios fotogramas seguidos: el primer dibujo pide las hojas, y hasta que no se
        // ha dibujado una vez con todo no se sabe si falta alguna.
        this.cargando.listos = avance === 100 ? this.cargando.listos + 1 : 0;
        if (this.cargando.listos >= 3) {
            this._ocultarCarga();
        }
    }

    _ocultarCarga() {
        this.cargando = null;
        const capa = document.getElementById('cargando');
        if (capa) {
            capa.classList.add('saliendo');
            setTimeout(() => { capa.hidden = true; }, 260);
        }
    }

    /**
     * Clic izquierdo en el mapa: ir andando hasta esa casilla (el motor busca el camino). Con
     * `acercarse` (clic en el minimapa), si no se puede llegar se va lo más cerca posible.
     */
    walkTo(x, y, z, acercarse) {
        if (this.connection) {
            this.connection.send(acercarse ? [CLIENT.WALK_TO, x, y, z, 1] : [CLIENT.WALK_TO, x, y, z]);
        }
    }

    /** Clic derecho sobre una criatura: atacarla, o dejar de hacerlo si ya era el objetivo. */
    alternarObjetivo(creatureId) {
        const criatura = this.world.creatures.get(creatureId);
        if (!criatura || criatura.kind === 2 || creatureId === this.world.playerId) {
            return;   // a un NPC (o a uno mismo) no se le ataca
        }
        if (this.objetivo === creatureId) {
            this.stop();
        } else {
            this.attack(creatureId);
        }
    }

    /** Stop: dejar de atacar (y el motor deja de llevarte andando si ibas a usar algo). */
    stop() {
        if (this.connection) {
            this.connection.send([CLIENT.CANCEL_ATTACK]);
        }
        this.objetivo = null;
    }

    /** Logout: salir del mundo y volver a la pantalla de entrada. */
    salir() {
        if (this.connection) {
            this.connection.send([CLIENT.LOGOUT]);
            this.connection.close();
            this.connection = null;
        }
        this.running = false;
        this._ocultarCarga();
        this.world = new ClientWorld();
        this.objetivo = null;
        this.contenedor.cerrar();
        limpiarPaneles();
        this.consola.limpiar();
        this.minimapa.olvidar();
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
        // De vuelta en la lista de personajes, al día (el que salía ya no está «en el mundo»).
        if (ultimaCuenta) {
            const { account, password } = ultimaCuenta;
            setTimeout(() => abrirCuenta(account, password), 300);
        }
        this._setStatus('has salido del mundo');
    }

    /** Una opción de la ventana de opciones. */
    _opcion(nombre, valor) {
        if (nombre === 'nombres') {
            this.renderer.showNames = valor;
        } else if (nombre === 'vida') {
            this.renderer.showHealth = valor;
        } else if (nombre === 'hora') {
            this.consola.ponerHora(valor);
        } else if (nombre === 'suavizado') {
            this.renderer.setSuavizado(valor);
        } else if (nombre === 'diagnostico' && this.diagnostics) {
            this.diagnostics.hidden = !valor;
        }
    }

    /**
     * El desplazamiento que piden las teclas ahora mismo.
     *
     * Se suman las direcciones para que dos teclas a la vez den una diagonal, que es
     * lo que espera cualquiera que haya jugado a algo de esto.
     */
    _pressedOffset() {
        let x = 0;
        let y = 0;

        if (this.pressed.has('up')) { y -= 1; }
        if (this.pressed.has('down')) { y += 1; }
        if (this.pressed.has('left')) { x -= 1; }
        if (this.pressed.has('right')) { x += 1; }

        if (x === 0 && y === 0) {
            return null;
        }
        return { x: x, y: y };
    }

    /**
     * Pide un paso, si procede.
     *
     * Se pide cuando el paso anterior ya terminó, y no en cada fotograma: así se
     * manda UNA petición por paso y no sesenta por segundo. El motor rechaza lo que
     * no toca de todas formas, pero pedirlo sin necesidad es gastar red y batería
     * para nada.
     *
     * Si el paso se rechaza (un muro), no hay respuesta y `moving` sigue siendo
     * nulo, así que se espera un poco antes de reintentar: sin esa espera, empujar
     * contra una pared mandaría una petición por fotograma.
     */
    _tryWalk(now) {
        const offset = this._pressedOffset();
        if (!offset || !this.world.playerId) {
            return;
        }

        const me = this.world.creatures.get(this.world.playerId);
        if (me && me.moving) {
            return;
        }

        if (now - this.lastWalkSentAt < REPEAT_DELAY) {
            return;
        }

        const opcode = OFFSET_TO_WALK[offset.x + ',' + offset.y];
        if (opcode === undefined) {
            return;
        }

        this.lastWalkSentAt = now;
        this.connection.send([opcode]);
    }

    // -----------------------------------------------------------------------
    // Bucle
    // -----------------------------------------------------------------------

    _frame(time) {
        if (!this.running) {
            return;
        }

        const delta = Math.min(100, time - this.lastFrameAt);
        this.lastFrameAt = time;
        this._comprobarCarga();
        this.fps = this.fps === 0 ? 1000 / Math.max(1, delta)
            : this.fps * 0.9 + (1000 / Math.max(1, delta)) * 0.1;

        this._tryWalk(time);

        // Se cierran los movimientos que ya terminaron ANTES de dibujar, para que
        // las criaturas que llegaron a su casilla ocupen la nueva y no la de salida.
        this.world.update(time);

        // Los sprites del panel se cargan por HTTP, asi que la primera vez que se pinta el
        // equipo puede que su dibujo todavia no este. Nada avisa de que ha llegado, asi que
        // se vuelve a preguntar por fotograma; la funcion sale sola si no queda nada
        // pendiente, que es el caso normal.
        dibujarPendiente(this.world.inventory, this.provider, itemtypes,
            { weight: this.world.weight, capacity: this.world.capacity });

        // El MISMO instante que el dibujo: si la cámara y el muñeco se calculan en dos instantes
        // distintos, quedan a una fracción de píxel y el muñeco tiembla ±1 píxel.
        this._followPlayer(time);
        this._expireSays(time);
        this._draw(time);

        // La barra lateral (minimapa, batalla, VIP) no necesita 60 fotogramas: cuatro por segundo.
        if (time - this.ultimoLateral > 250) {
            this.ultimoLateral = time;
            if (this.objetivo !== null && !this.world.creatures.has(this.objetivo)) {
                this.objetivo = null;
            }
            this.minimapa.recordar(this.world);
            const yo = this.world.playerId ? this.world.creatures.get(this.world.playerId) : null;
            this.minimapa.dibujar(yo ? { x: yo.x, y: yo.y, z: yo.z } : null);
            const planta = document.getElementById('minimapa-planta');
            if (planta && yo) {
                planta.textContent = 'z ' + (yo.z + this.minimapa.desvioPlanta);
            }
            this.lateral.actualizar(this.world, this.objetivo);
            // Los dibujos llegan por HTTP: si en el cuerpo abierto faltaba alguno, se repinta.
            this.contenedor.repintar();
        }

        requestAnimationFrame((next) => this._frame(next));
    }

    /** La cámara sigue al jugador, deslizándose. */
    _followPlayer(time) {
        const me = this.world.playerId
            ? this.world.creatures.get(this.world.playerId)
            : null;

        if (!me) {
            return;
        }

        const position = this.world.creaturePosition(me, time);

        // LA CÁMARA VA PEGADA AL PERSONAJE, como en Tibia: su posición ya se interpola suave
        // durante el paso, así que copiarla tal cual da un desplazamiento continuo y el muñeco
        // queda siempre en el centro. Antes la cámara lo perseguía con retraso (un 25% por
        // fotograma): personaje y cámara iban a velocidades distintas y, al redondear cada uno a
        // píxeles, el muñeco y su nombre temblaban, sobre todo en diagonal.
        this.camera.centerX = position.x;
        this.camera.centerY = position.y;

        this.camera.z = me.z;
    }

    _expireSays(now) {
        this.recentSays = this.recentSays.filter((say) => say.until > now);
        this.textosFlotantes = this.textosFlotantes.filter((t) => now - t.desde < DURACION_TEXTO_FLOTANTE);
        const ahora = performance.now();
        this.efectos = this.efectos.filter((e) => ahora - e.desde < 1600);
        this.proyectiles = this.proyectiles.filter((m) => ahora - m.desde < m.dura);
    }

    _draw(now) {
        // La cámara se dibuja en PÍXELES ENTEROS del mundo (múltiplos de 1/32 de casilla): así
        // todas las casillas caen en coordenadas exactas y no queda junta entre sprites al andar.
        // Sólo para dibujar: el seguimiento suave sigue con su posición de verdad.
        const real = { x: this.camera.centerX, y: this.camera.centerY };
        const pixel = this.camera.tileSize;
        this.camera.centerX = Math.round(real.x * pixel) / pixel;
        this.camera.centerY = Math.round(real.y * pixel) / pixel;
        try {
            this._dibujar(now);
        } finally {
            this.camera.centerX = real.x;
            this.camera.centerY = real.y;
        }
    }

    _dibujar(now) {
        const yo = this.world.playerId ? this.world.creatures.get(this.world.playerId) : null;
        const ops = buildDrawList(this.world, this.camera, {
            now: now,
            desdePlanta: yo ? this.world.firstVisibleFloor(yo.x, yo.y, yo.z) : 0,
            // Los bordes de suelo son planos: van en la pasada del suelo, debajo de las criaturas.
            esPlano: (id) => {
                const cosa = this.provider.thing ? this.provider.thing('items', id) : null;
                return !!(cosa && cosa.flags && cosa.flags.groundBorder);
            }
        });

        this.renderer.draw(ops, this.camera, {
            recentSays: this.recentSays,
            textosFlotantes: this.textosFlotantes,
            efectos: this.efectos,
            proyectiles: this.proyectiles,
            // La luz del mundo (día o noche) y la que lleva el jugador.
            luzMundo: this.world.luzMundo,
            luzPropia: this.world.luzPropia,
            // La calavera y el escudo de grupo sobre los nombres.
            marcas: this.world.marcas,
            // El círculo rojo a los pies de la criatura que estás atacando.
            objetivo: this.objetivo
        });

        this._updateDiagnostics(ops);
    }

    _updateDiagnostics(ops) {
        if (!this.diagnostics) {
            return;
        }

        const summary = summarize(ops);
        const world = this.world.stats();

        this.diagnostics.textContent =
            'fps ' + this.fps.toFixed(0) +
            '  |  dibujo ' + summary.total + ' ops (' + summary.ground + ' suelo, ' +
            summary.items + ' items, ' + summary.creatures + ' criaturas)' +
            '  |  mundo ' + world.tiles + ' tiles, ' + world.creatures + ' criaturas' +
            '  |  plantas ' + summary.floors.join('/') +
            '  |  camara ' + this.camera.centerX.toFixed(2) + ',' +
            this.camera.centerY.toFixed(2) + ' z' + this.camera.z +
            '  |  red ' + (this.connection ? this.connection.stats.messages : 0) + ' msgs';
    }

    _setStatus(text) {
        const element = document.getElementById('status');
        if (element) {
            element.textContent = text;
        }
    }

    resize() {
        this.renderer.resize();
        this.camera.setViewport(this.renderer.viewWidth, this.renderer.viewHeight);
    }
}

// ---------------------------------------------------------------------------
// Arranque de la página
// ---------------------------------------------------------------------------

/**
 * ¿Se esta escribiendo en algun sitio?
 *
 * SI LA RESPUESTA ES SI, EL TECLADO NO ES DEL JUEGO. Y esto no puede mirar solo el chat, que es
 * lo que hacia antes: en el formulario de entrada el foco esta en #account, #password o #name,
 * asi que la comprobacion fallaba, la A se traducia a "izquierda", se llamaba a preventDefault y
 * LA LETRA NO LLEGABA NUNCA AL CAMPO. Solo se notaba en cuatro teclas -A, W, S y D-, que son
 * justamente las de moverse, y por eso parecia un fallo del teclado y no del juego.
 *
 * Mirar el TIPO de elemento en vez de un id concreto es lo que lo arregla de raiz: cualquier
 * campo de texto que se anada manana queda cubierto sin acordarse de nada.
 */
function escribiendoEnAlgunSitio() {
    const el = document.activeElement;

    if (!el) {
        return false;
    }

    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true;
}

/** La dirección de una tecla: las flechas siempre; W, A, S y D sólo en modo `/wasd`. */
function wheelToKey(event, conWasd) {
    switch (event.key) {
        case 'ArrowUp': return 'up';
        case 'ArrowDown': return 'down';
        case 'ArrowLeft': return 'left';
        case 'ArrowRight': return 'right';
        default: break;
    }
    if (!conWasd) {
        return null;
    }
    switch (event.key) {
        case 'w': case 'W': return 'up';
        case 's': case 'S': return 'down';
        case 'a': case 'A': return 'left';
        case 'd': case 'D': return 'right';
        default: return null;
    }
}

/** El objeto que se coge de una casilla al arrastrar (ver `_topItemAt` en el motor). */
function objetoMovible(tile) {
    const items = tile.items;
    const corte = Math.max(0, Number(tile.downCount) || 0);
    for (let i = items.length - 1; i >= corte; i -= 1) {
        if (itemtypes.esMovible(items[i].id)) {
            return items[i];
        }
    }
    return corte > 0 ? items[corte - 1] : (items[items.length - 1] || null);
}

function boot() {
    const canvas = document.getElementById('game');
    const diagnostics = document.getElementById('diagnostics');
    const form = document.getElementById('login');
    const chatForm = document.getElementById('chat-bar');
    const chatInput = document.getElementById('chat');
    const overlay = document.getElementById('overlay');

    const game = new Game({
        canvas: canvas,
        diagnostics: diagnostics,
        iso: new URLSearchParams(window.location.search).get('iso') === '1'
    });
    window.game = game;

    // Se expone para poder mirar el estado desde la consola del navegador, que es
    // la herramienta de depuración más útil que tiene un cliente.
    window.__jetyum = game;

    // El diario de misiones se pide al abrir su ventana, y se refresca mientras está abierta.
    const botonMisiones = document.querySelector('[data-ventana="misiones"]');
    if (botonMisiones) {
        botonMisiones.addEventListener('click', () => setTimeout(() => {
            const v = document.getElementById('ventana-misiones');
            if (v && !v.hidden) {
                game.pedirMisiones();
            }
        }, 0));
    }
    setInterval(() => {
        const v = document.getElementById('ventana-misiones');
        if (v && !v.hidden && game.running) {
            game.pedirMisiones();
        }
    }, 5000);

    // USAR lo que llevas: clic derecho (o doble clic) sobre algo de tu mochila o de tu equipo
    // (comer, beber una poción). Sobre la MOCHILA PUESTA, abre o cierra su ventana (la regla de
    // todos los contenedores). Con los DOS BOTONES a la vez, se MIRA (lo de abajo).
    const usarEntrada = (e) => {
        const entrada = e.target.closest('.arrastrable[data-index]');
        if (!entrada || entrada.dataset.contenedor || (game.arrastre && game.arrastre.acabaDeSoltar && game.arrastre.acabaDeSoltar())) {
            return;
        }
        e.preventDefault();
        if (performance.now() < (game.mirandoHasta || 0)) {
            return;
        }
        const indice = Number(entrada.dataset.index);
        const datos = game.world.inventory.find((x) => x.index === indice);
        if (datos && datos.slot === 'backpack' && itemtypes.esContenedor(datos.typeId)) {
            alternarMochila();
            game.ventanas.colocar();
            return;
        }
        game.usarDelInventario(indice);
    };
    document.addEventListener('contextmenu', usarEntrada);
    document.addEventListener('dblclick', usarEntrada);

    // MIRAR algo de un panel (tu mochila, tu equipo, un cuerpo abierto): los dos botones a la vez.
    document.addEventListener('mousedown', (e) => {
        if (e.buttons !== 3) {
            return;
        }
        const deInventario = e.target.closest('.arrastrable[data-index]:not([data-contenedor])');
        const deContenedor = e.target.closest('[data-contenedor][data-hueco]');
        if (!deInventario && !deContenedor) {
            return;
        }
        e.preventDefault();
        game.mirandoHasta = performance.now() + 400;
        if (game.arrastre) {
            game.arrastre.cancelar();
        }
        if (deContenedor) {
            game.connection && game.connection.send([CLIENT.LOOK_ITEM, 'container',
                Number(deContenedor.dataset.contenedor), Number(deContenedor.dataset.hueco)]);
        } else {
            game.connection && game.connection.send([CLIENT.LOOK_ITEM, 'inventory', Number(deInventario.dataset.index)]);
        }
    });
    document.addEventListener('mouseup', (e) => {
        if (e.buttons === 0 && performance.now() < (game.mirandoHasta || 0)) {
            game.mirandoHasta = performance.now() + 300;
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const avisoAnterior = document.getElementById('login-error');
        if (avisoAnterior) {
            avisoAnterior.style.display = 'none';
        }

        const valor = (id) => (document.getElementById(id).value || '').trim();
        const crear = modoLogin === 'crear';
        let credentials;
        if (crear) {
            // CREAR CUENTA: la cuenta, la contraseña dos veces, el personaje y su vocación y sexo.
            if (!valor('nueva-cuenta') || !document.getElementById('nueva-clave').value || !valor('nuevo-personaje')) {
                mostrarErrorLogin('Rellena la cuenta, la contraseña y el nombre del personaje.');
                return;
            }
            if (document.getElementById('nueva-clave').value !== document.getElementById('nueva-clave2').value) {
                mostrarErrorLogin('Las dos contraseñas no coinciden.');
                return;
            }
            credentials = {
                crear: true,
                account: valor('nueva-cuenta'),
                password: document.getElementById('nueva-clave').value,
                character: valor('nuevo-personaje'),
                vocation: document.getElementById('vocation').value || '',
                sex: document.getElementById('sex').value || 'male'
            };
        } else if (!cuentaAbierta) {
            // ENTRAR, paso 1: la cuenta y la contraseña. Se piden sus personajes y se enseñan.
            await abrirCuenta(valor('account'), document.getElementById('password').value);
            return;
        } else {
            // Paso 2: entrar al mundo con el personaje elegido de la lista.
            if (!personajeElegido) {
                mostrarErrorLogin('Elige un personaje de la lista.');
                return;
            }
            credentials = {
                account: cuentaAbierta.account,
                password: cuentaAbierta.password,
                character: personajeElegido
            };
        }
        recordarCuenta(credentials, crear);
        ultimaCuenta = { account: credentials.account, password: credentials.password };

        const url = await urlDelMotor();

        const error = document.getElementById('login-error');
        if (error) {
            error.style.display = 'none';
        }

        overlay.style.display = 'none';
        game.start(url, credentials);
    });

    /*
     * EL TECLADO, en dos modos:
     *
     * - Por defecto, EL CHAT ESTÁ SIEMPRE ABIERTO: lo que escribes va a la línea de abajo e Intro
     *   lo manda (sin tener que pulsar Intro antes). Se camina con las FLECHAS, también mientras
     *   escribes, como en Tibia.
     * - Con `/wasd`: se camina también con W, A, S y D, y para escribir hay que pulsar Intro
     *   antes (y después de mandar se vuelve a caminar). `/wasd` otra vez lo quita. Se recuerda
     *   en este navegador.
     */
    let modoWasd = false;
    try {
        modoWasd = localStorage.getItem('jetyum.wasd') === '1';
    } catch (e) {
        modoWasd = false;
    }
    const ponerAyudaDelChat = () => {
        chatInput.placeholder = modoWasd
            ? 'Intro para escribir: habla, un hechizo (exura) o un comando (/ayuda). /wasd: escribir sin Intro'
            : 'Escribe aquí: habla, un hechizo (exura) o un comando (/ayuda). Camina con las flechas';
    };
    ponerAyudaDelChat();

    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const texto = chatInput.value;
        chatInput.value = '';
        if (texto.trim().toLowerCase() === '/wasd') {
            modoWasd = !modoWasd;
            try {
                localStorage.setItem('jetyum.wasd', modoWasd ? '1' : '0');
            } catch (e) {
                // Sin almacenamiento: dura lo que la pestaña.
            }
            ponerAyudaDelChat();
            game.consola.servidor(modoWasd
                ? 'Modo WASD: caminas con W, A, S, D (y las flechas). Pulsa Intro para escribir.'
                : 'Chat siempre abierto: escribe directamente; caminas con las flechas.');
        } else {
            game.say(texto);
        }
        if (modoWasd) {
            chatInput.blur();
        }
    });

    // En modo WASD, mientras se escribe en el chat las teclas no mueven al muñeco. Con el chat
    // siempre abierto no hace falta: las flechas caminan igual.
    chatInput.addEventListener('focus', () => modoWasd && game.clearKeys());
    chatInput.addEventListener('blur', () => modoWasd && game.clearKeys());

    window.addEventListener('keydown', (event) => {
        // En la pantalla de entrada, el teclado es del formulario.
        if (overlay.style.display !== 'none') {
            return;
        }
        const enChat = document.activeElement === chatInput;
        // En otro campo (la VIP, la cantidad del comercio...) se escribe ahí y nada más.
        if (escribiendoEnAlgunSitio() && !enChat) {
            return;
        }

        if (!modoWasd) {
            // CHAT SIEMPRE ABIERTO: las flechas caminan (aunque estés escribiendo)...
            const flecha = wheelToKey(event, false);
            if (flecha && !event.shiftKey) {
                game.onKeyDown(flecha);
                event.preventDefault();
                return;
            }
            if (event.key === 'Escape') {
                game.stop();
                return;
            }
            // ...y lo demás se escribe en el chat, esté o no el cursor en él.
            if (!enChat && !event.ctrlKey && !event.metaKey && !event.altKey) {
                if (event.key.length === 1) {
                    chatInput.focus();
                    chatInput.value += event.key;
                    event.preventDefault();
                } else if (event.key === 'Enter' || event.key === 'Backspace') {
                    chatInput.focus();
                    if (event.key === 'Backspace') {
                        chatInput.value = chatInput.value.slice(0, -1);
                    }
                    event.preventDefault();
                }
            }
            return;
        }

        // MODO WASD: escribiendo en el chat, el teclado es del chat.
        if (enChat) {
            return;
        }

        // El chat se abre con Intro.
        if (event.key === 'Enter') {
            chatInput.focus();
            event.preventDefault();
            return;
        }

        const key = wheelToKey(event, true);
        if (key) {
            game.onKeyDown(key);
            // Sin esto, las flechas hacen scroll de la página mientras se camina.
            event.preventDefault();
        }

        // Escape: Stop, dejar de atacar.
        if (event.key === 'Escape') {
            game.stop();
            return;
        }

        // E: usar lo que hay delante (abrir y cerrar puertas, palancas...).
        if (event.key === 'e' || event.key === 'E') {
            game.useInFront();
            event.preventDefault();
            return;
        }

        if (event.key === ' ') {
            const me = game.world.playerId
                ? game.world.creatures.get(game.world.playerId)
                : null;
            if (me) {
                game.look(me.x, me.y, me.z);
            }
            event.preventDefault();
        }
    });

    window.addEventListener('keyup', (event) => {
        const key = wheelToKey(event, modoWasd);
        if (key) {
            game.onKeyUp(key);
        }
    });

    window.addEventListener('blur', () => game.clearKeys());
    window.addEventListener('resize', () => game.resize());

    // Un clic en el mapa: atacar a la criatura que haya ahí, o mirar el tile.
    /*
     * LOS DOS BOTONES A LA VEZ: MIRAR, como en Tibia. Al pulsar el segundo se mira la casilla, y
     * el clic y el clic derecho que el navegador manda al soltar no hacen nada más.
     */
    let ambos = false;
    let ambosHasta = 0;
    const deAmbos = () => ambos || performance.now() < ambosHasta;
    canvas.addEventListener('mousedown', (event) => {
        if (event.buttons === 3) {
            ambos = true;
            if (game.arrastre) {
                game.arrastre.cancelar();
            }
            const target = game._tileEnPantalla(event.clientX, event.clientY);
            game.look(target.x, target.y, target.z);
            event.preventDefault();
        }
    });
    document.addEventListener('mouseup', (event) => {
        if (ambos && event.buttons === 0) {
            ambos = false;
            ambosHasta = performance.now() + 300;
        }
    });

    canvas.addEventListener('click', (event) => {
        // El clic que llega al soltar un arrastre no es un clic (el objeto ya se movió), y
        // DESLIZAR el ratón con el botón pulsado tampoco, aunque no se lleve nada y se suelte en la
        // misma casilla: el personaje sólo va andando con un clic de verdad.
        if (deAmbos() || (game.arrastre && (game.arrastre.acabaDeSoltar() || game.arrastre.fueDeslizamiento()))) {
            return;
        }
        // El clic izquierdo te lleva ANDANDO hasta esa casilla, si se puede llegar. Para atacar,
        // clic derecho; para mirar, los dos botones a la vez.
        const target = game._tileEnPantalla(event.clientX, event.clientY);
        game.walkTo(target.x, target.y, target.z);
    });

    // (El doble clic ya no usa: el clic lleva andando y usar es el clic derecho, como en Tibia.)

    /*
     * EL BOTÓN DERECHO USA, como en Tibia: abre puertas, tira de palancas, sube escaleras de mano
     * y, si lo de arriba no se usa pero se puede coger, lo recoge. Quien decide qué se usa es el
     * MOTOR, que es quien conoce las acciones registradas (data/scripts/actions/).
     */
    canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (deAmbos()) {
            return;
        }

        const target = game._tileEnPantalla(event.clientX, event.clientY);
        const me = game.world.playerId ? game.world.creatures.get(game.world.playerId) : null;

        // Sobre una criatura que se puede atacar (un monstruo u otro jugador, no un NPC): ATACARLA.
        // Si ya era tu objetivo, se deja de atacar.
        const atacable = game.world.creaturesAt(target.x, target.y, target.z)
            .find((c) => c.id !== game.world.playerId && c.kind !== 2);
        if (atacable) {
            game.alternarObjetivo(atacable.id);
            return;
        }

        // Sobre uno mismo: la ventana del personaje (aspecto, colores, nivel, vocación...). Salvo
        // que estés encima de un cuerpo o una caja (se abre) o de algo que se coge, como unas
        // monedas (se usa: cambiarlas), como en Tibia.
        const tile = game.world.getTile ? game.world.getTile(target.x, target.y, target.z) : null;
        const hayAlgo = tile && tile.items.some((it) => itemtypes.esContenedor(it.id) ||
            (!itemtypes.esSuelo(it.id) && itemtypes.esMovible(it.id)));
        if (me && me.x === target.x && me.y === target.y && me.z === target.z && !hayAlgo) {
            game.connection && game.connection.send([CLIENT.REQUEST_OUTFIT]);
            return;
        }

        // Sobre cualquier otra cosa: USARLA (abrir una puerta, tirar de una palanca) o, si no se
        // usa, recogerla. Si está lejos, el motor lleva al personaje andando hasta ella; si no
        // hay camino, dice que está demasiado lejos.
        game.use(target.x, target.y, target.z);
    });

    // Fuera del mapa tampoco sale el menú del navegador («Inspeccionar»...), salvo en los campos
    // de texto, donde sirve para copiar y pegar.
    document.addEventListener('contextmenu', (event) => {
        if (!event.target.closest('input, textarea')) {
            event.preventDefault();
        }
    });

    activarSeparador(game);
    cargarVocaciones();
    prepararLogin();
}

/** «Entrar» o «Crear cuenta»: la pestaña del formulario de entrada que está activa. */
let modoLogin = 'entrar';

/** La cuenta cuyos personajes se están enseñando ({account, password}), y el elegido. */
let cuentaAbierta = null;
let personajeElegido = null;
/** Con la que se entró al mundo la última vez: al salir se vuelve a su lista de personajes. */
let ultimaCuenta = null;

/**
 * La dirección del motor. Se puede forzar con `?ws=host:puerto`, que es lo que hace falta para
 * apuntar a otra máquina sin tocar el código. Por defecto, el mismo host que sirvió la página y el
 * puerto del motor, que se pregunta al servidor de archivos (lo lee de `enginePort` en config.js).
 */
async function urlDelMotor() {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('ws');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    let puerto = 8080;
    if (!override) {
        try {
            const respuesta = await fetch('/jetyum/motor.json', { cache: 'no-store' });
            if (respuesta.ok) {
                puerto = Number((await respuesta.json()).puerto) || 8080;
            }
        } catch (e) {
            // Sin respuesta se queda el puerto de siempre.
        }
    }

    return override
        ? protocol + '//' + override
        : protocol + '//' + window.location.hostname + ':' + puerto;
}

const CLAVE_CUENTA = 'jetyum.cuenta';

/**
 * EL DIARIO DE MISIONES: cada misión con sus pasos; lo terminado, tachado en verde. Lo calcula el
 * motor con los storages del jugador (las declaran los scripts con `type: 'quest'`).
 */
function pintarMisiones(quests) {
    const cuerpo = document.querySelector('#ventana-misiones .ventana-cuerpo');
    if (!cuerpo) {
        return;
    }
    const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    if (!quests.length) {
        cuerpo.innerHTML = '<span class="vacio">Todavía no has empezado ninguna misión. Habla con la gente de la ciudad.</span>';
        return;
    }
    cuerpo.innerHTML = quests.map(([nombre, terminada, misiones]) =>
        '<details class="mision' + (terminada ? ' terminada' : '') + '" open><summary>' + escapar(nombre) +
        (terminada ? ' ✓' : '') + '</summary>' +
        misiones.map(([m, descripcion, hecha]) => '<div class="paso' + (hecha ? ' hecho' : '') + '">' +
            '<b>' + escapar(m) + '</b>' + (descripcion ? '<br>' + escapar(descripcion) : '') + '</div>').join('') +
        '</details>').join('');
}

function mostrarErrorLogin(texto) {
    const error = document.getElementById('login-error');
    if (error) {
        error.textContent = texto;
        error.style.display = 'block';
    }
}

/** Cambia de pestaña en el formulario de entrada. */
function elegirModoLogin(modo) {
    modoLogin = modo;
    document.querySelectorAll('.login-pestanas [data-modo]').forEach((b) =>
        b.classList.toggle('activa', b.dataset.modo === modo));
    document.querySelectorAll('.login-modo').forEach((d) => { d.hidden = d.dataset.modo !== modo; });
    const boton = document.getElementById('login-boton');
    if (boton) {
        boton.textContent = modo === 'crear' ? 'Crear y entrar' : (cuentaAbierta ? 'Entrar al mundo' : 'Entrar');
    }
    const error = document.getElementById('login-error');
    if (error) {
        error.style.display = 'none';
    }
    const primero = document.getElementById(modo === 'crear' ? 'nueva-cuenta'
        : (cuentaAbierta ? 'lista-personajes' : 'account'));
    if (primero) {
        primero.focus();
    }
}

/**
 * «RECORDAR CUENTA»: si está marcado, la cuenta, la contraseña y el último personaje se guardan en
 * ESTE navegador (y nada más: no van a ningún sitio) y la próxima vez sale directamente la lista
 * de personajes. Si se desmarca, se borra lo guardado.
 */
function recordarCuenta(credentials, crear) {
    const recordar = document.getElementById('recordar');
    // La cuenta recién creada queda escrita en «Entrar» para la próxima vez.
    if (crear) {
        document.getElementById('account').value = credentials.account;
    }
    try {
        if (recordar && recordar.checked) {
            localStorage.setItem(CLAVE_CUENTA, JSON.stringify({
                account: credentials.account, password: credentials.password, character: credentials.character || ''
            }));
        } else if (!crear) {
            localStorage.removeItem(CLAVE_CUENTA);
        }
    } catch (e) {
        // Sin almacenamiento (modo privado): no se recuerda, nada más.
    }
}

function cuentaGuardada() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_CUENTA));
    } catch (e) {
        return null;
    }
}

/**
 * ENTRAR, paso 1: comprueba la cuenta y la contraseña con el motor y enseña sus personajes, como
 * la lista de personajes de Tibia.
 */
async function abrirCuenta(account, password) {
    if (!account || !password) {
        mostrarErrorLogin('Escribe tu cuenta y tu contraseña.');
        return;
    }
    const boton = document.getElementById('login-boton');
    boton.disabled = true;
    boton.textContent = 'Conectando…';
    let lista;
    try {
        lista = await pedirPersonajes(await urlDelMotor(), account, password);
    } catch (error) {
        boton.disabled = false;
        boton.textContent = 'Entrar';
        mostrarErrorLogin(error.message);
        return;
    }
    boton.disabled = false;
    cuentaAbierta = { account, password };
    // Si se recuerda la cuenta, ya queda guardada aunque todavía no se haya entrado al mundo.
    const guardada = cuentaGuardada();
    recordarCuenta({ account, password, character: guardada && guardada.account === account ? guardada.character : '' }, false);
    const preferido = guardada && guardada.account === account ? guardada.character : '';
    pintarPersonajes(lista, preferido);
    document.getElementById('pj-cuenta').textContent = account;
    document.getElementById('paso-cuenta').hidden = true;
    document.getElementById('paso-personajes').hidden = false;
    elegirModoLogin('entrar');
}

/** Vuelve al paso 1 (otra cuenta). */
function cerrarCuenta() {
    cuentaAbierta = null;
    personajeElegido = null;
    document.getElementById('paso-personajes').hidden = true;
    document.getElementById('paso-cuenta').hidden = false;
    elegirModoLogin('entrar');
}

function pintarPersonajes(lista, preferido) {
    const caja = document.getElementById('lista-personajes');
    caja.innerHTML = '';
    personajeElegido = null;
    if (!lista.length) {
        caja.innerHTML = '<span class="vacio">Esta cuenta todavía no tiene personajes: créalo en «Crear cuenta» ' +
            '(con la misma cuenta y contraseña).</span>';
        return;
    }
    lista.forEach((pj) => {
        const fila = document.createElement('div');
        fila.className = 'lpj-fila';
        fila.setAttribute('role', 'option');
        fila.dataset.nombre = pj.name;
        const nombre = document.createElement('span');
        nombre.className = 'lpj-nombre';
        nombre.textContent = pj.name;
        const datos = document.createElement('span');
        datos.className = 'lpj-datos';
        datos.textContent = 'Nivel ' + pj.level + ' · ' + (pj.vocation && pj.vocation !== 'None' ? pj.vocation : 'Sin vocación');
        if (pj.online) {
            const enLinea = document.createElement('div');
            enLinea.className = 'en-linea';
            enLinea.textContent = 'en el mundo';
            datos.appendChild(enLinea);
        }
        fila.title = 'Doble clic para entrar con ' + pj.name;
        fila.append(nombre, datos);
        caja.appendChild(fila);
    });
    const inicial = lista.find((pj) => pj.name.toLowerCase() === String(preferido || '').toLowerCase()) || lista[0];
    elegirPersonaje(inicial.name);
}

function elegirPersonaje(nombre) {
    personajeElegido = nombre;
    document.querySelectorAll('#lista-personajes .lpj-fila').forEach((f) => {
        const elegido = f.dataset.nombre === nombre;
        f.classList.toggle('elegido', elegido);
        f.setAttribute('aria-selected', elegido ? 'true' : 'false');
        if (elegido) {
            f.scrollIntoView({ block: 'nearest' });
        }
    });
}

/** El ojo de las contraseñas: enseña u oculta lo escrito. */
function activarOjos() {
    document.querySelectorAll('.ver-clave').forEach((boton) => {
        boton.addEventListener('click', () => {
            const campo = boton.parentNode.querySelector('input');
            const ver = campo.type === 'password';
            campo.type = ver ? 'text' : 'password';
            boton.dataset.icono = ver ? 'ojo-cerrado' : 'ojo';
            boton.title = ver ? 'Ocultar la contraseña' : 'Mostrar la contraseña';
            boton.setAttribute('aria-label', boton.title);
            pintarIconos(boton.parentNode);
            campo.focus();
        });
    });
}

/** Rellena el formulario con la cuenta recordada y engancha las pestañas, la lista y los ojos. */
function prepararLogin() {
    const form = document.getElementById('login');
    pintarIconos(form);
    document.querySelectorAll('.login-pestanas [data-modo]').forEach((b) =>
        b.addEventListener('click', () => elegirModoLogin(b.dataset.modo)));
    activarOjos();
    document.getElementById('cambiar-cuenta').addEventListener('click', cerrarCuenta);

    const caja = document.getElementById('lista-personajes');
    caja.addEventListener('click', (e) => {
        const fila = e.target.closest('.lpj-fila');
        if (fila) {
            elegirPersonaje(fila.dataset.nombre);
        }
    });
    caja.addEventListener('dblclick', (e) => {
        const fila = e.target.closest('.lpj-fila');
        if (fila) {
            elegirPersonaje(fila.dataset.nombre);
            form.requestSubmit();
        }
    });
    // Flechas para moverse por la lista; Intro entra (lo hace el formulario).
    caja.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
            return;
        }
        e.preventDefault();
        const filas = [...caja.querySelectorAll('.lpj-fila')];
        const i = filas.findIndex((f) => f.dataset.nombre === personajeElegido);
        const siguiente = filas[Math.max(0, Math.min(filas.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (siguiente) {
            elegirPersonaje(siguiente.dataset.nombre);
        }
    });
    caja.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    elegirModoLogin('entrar');
    const guardada = cuentaGuardada();
    if (guardada && guardada.account && guardada.password) {
        document.getElementById('account').value = guardada.account;
        document.getElementById('password').value = guardada.password;
        document.getElementById('recordar').checked = true;
        // Con la cuenta recordada, la lista de personajes sale directamente.
        abrirCuenta(guardada.account, guardada.password);
    }
}

/**
 * LA CONSOLA SE ESTIRA arrastrando la barra que tiene encima. El mapa cede el alto, pero nunca
 * por debajo de su tamaño de verdad (15x11 casillas de 32): más pequeño ya no se leería. El alto
 * elegido se recuerda en este navegador.
 */
function activarSeparador(game) {
    const layout = document.getElementById('layout');
    const separador = document.getElementById('separador');
    if (!layout || !separador) {
        return;
    }
    const MIN_CONSOLA = 60;
    const fijar = (alto) => {
        const total = layout.clientHeight;
        const maximo = Math.max(MIN_CONSOLA, total - separador.offsetHeight - game.renderer.viewHeight);
        const valor = Math.round(Math.max(MIN_CONSOLA, Math.min(maximo, alto)));
        layout.style.setProperty('--alto-consola', valor + 'px');
        game.resize();
        return valor;
    };
    let guardado = 168;
    try {
        guardado = Number(localStorage.getItem('jetyum.alto-consola')) || 168;
    } catch (e) {
        // Sin almacenamiento: el de siempre.
    }
    fijar(guardado);

    let arrastrando = false;
    separador.addEventListener('mousedown', (e) => {
        arrastrando = true;
        document.body.classList.add('redimensionando');
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (arrastrando) {
            const r = layout.getBoundingClientRect();
            guardado = fijar(r.bottom - e.clientY - separador.offsetHeight / 2);
        }
    });
    document.addEventListener('mouseup', () => {
        if (!arrastrando) {
            return;
        }
        arrastrando = false;
        document.body.classList.remove('redimensionando');
        try {
            localStorage.setItem('jetyum.alto-consola', String(guardado));
        } catch (e) {
            // Nada.
        }
    });
    window.addEventListener('resize', () => fijar(guardado));
}

/**
 * Las vocaciones que se pueden elegir al crear un personaje: las de `data/XML/vocations.js`, que
 * el servidor de archivos lee para nosotros. Si no contesta, se queda «None».
 */
async function cargarVocaciones() {
    const select = document.getElementById('vocation');
    if (!select) {
        return;
    }
    try {
        const respuesta = await fetch('/jetyum/vocaciones.json', { cache: 'no-store' });
        const lista = respuesta.ok ? await respuesta.json() : [];
        if (Array.isArray(lista) && lista.length > 0) {
            select.innerHTML = lista.map((v) =>
                '<option value="' + v.name + '" title="' + (v.description || '') + '">' +
                (v.name === 'None' ? 'Sin vocación' : v.name) + (v.needPremium ? ' (premium)' : '') +
                '</option>').join('');
        }
    } catch (e) {
        // Sin lista: se queda «None».
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

export { Game };
