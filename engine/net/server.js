'use strict';

/**
 * Adaptador de red: WebSocket sobre la capa de sesiones.
 *
 * Es DELIBERADAMENTE delgado. Todo lo que decide algo —qué ve el jugador, si un
 * paso es válido, cuánto dura— está por debajo, en `session.js` y en el mundo. Este
 * archivo sólo hace tres cosas: aceptar conexiones, convertir texto en arrays y
 * agrupar las respuestas.
 *
 * AGRUPAR LAS RESPUESTAS ES LO IMPORTANTE. Un tick puede generar cientos de
 * mensajes (el mapa inicial de un jugador son más de ochocientos tiles), y mandar
 * cada uno como un marco de WebSocket añade una cabecera por mensaje y despierta
 * al cliente ochocientas veces. Se acumulan y se envían **todos en un solo marco,
 * como un array**.
 *
 * El orden de los enganches importa y por eso se avisa: el motor engancha
 * `updateAll` al tick al construirse, así que este adaptador DEBE enganchar su
 * vaciado después para que le llegue la cola ya llena. Si se enganchara antes,
 * vaciaría colas vacías.
 */

const { WebSocketServer } = require('ws');

function createNetworkServer(options) {
    const opts = options || {};

    const engine = opts.engine;
    const log = opts.logger || console;

    if (!engine) {
        throw new Error('createNetworkServer necesita un motor');
    }

    const config = (engine && engine.config) || {};

    /*
     * EL TAMAÑO DE UN MENSAJE tiene tope (`maxMessageBytes` de config.js, 64 KB si no se dice). El
     * cliente manda mensajes de unos pocos bytes; sin tope, la librería acepta hasta 100 MB, y uno
     * solo basta para que el servidor se pase un rato parseando basura.
     */
    const wss = new WebSocketServer({
        port: opts.port,
        host: opts.host || '0.0.0.0',
        maxPayload: Number(config.maxMessageBytes) || 64 * 1024
    });

    /*
     * Y EL RITMO: `maxPacketsPerSecond` mensajes por segundo y conexión (50 si no se dice). Lo que
     * pase de ahí se descarta; quien mande más del TRIPLE se desconecta, porque eso ya no es un
     * cliente con prisa sino uno que intenta tumbar el servidor.
     */
    const porSegundo = Number(config.maxPacketsPerSecond) || 50;

    /** Conexiones vivas: socket -> { session, queue } */
    const connections = new Map();

    const stats = { accepted: 0, rejected: 0, closed: 0, frames: 0, messages: 0 };

    /**
     * Promesa que se resuelve cuando el servidor ya escucha, con su puerto.
     *
     * Hace falta porque enlazar es ASINCRONO: preguntar `wss.address()` justo
     * despues de construirlo devuelve null, y con puerto 0 (que es lo que se usa en
     * las pruebas, para que el sistema elija uno libre) no hay forma de saber el
     * puerto sin esperar. Sin esto, la prueba fallaba con un `ws://127.0.0.1:null`.
     */
    const ready = new Promise((resolve, reject) => {
        wss.once('listening', () => resolve(wss.address().port));
        wss.once('error', reject);
    });

    wss.on('connection', (socket, request) => {
        const queue = [];

        // La IP del cliente va a la sesión: con ella se mira si está suspendida (castigos.js).
        const session = engine.createSession((message) => {
            queue.push(message);
        }, { ip: request && request.socket ? String(request.socket.remoteAddress || '') : '' });

        const entry = { session: session, queue: queue, socket: socket, ventana: 0, cuenta: 0 };
        connections.set(socket, entry);
        stats.accepted += 1;

        if (opts.verbose) {
            log.info('conexion desde ' + (request && request.socket
                ? request.socket.remoteAddress : 'desconocida'));
        }

        socket.on('message', (raw) => {
            let parsed;

            try {
                parsed = JSON.parse(raw.toString());
            } catch (error) {
                // Basura por el socket. No se cierra la conexion: un cliente que
                // manda algo raro una vez puede seguir siendo valido, y cerrar por
                // un mensaje mal formado convierte un fallo tonto en una
                // desconexion.
                stats.rejected += 1;
                return;
            }

            // Se admite tanto un mensaje suelto como un lote: el cliente puede
            // agrupar igual que el servidor, y procesarlos de las dos formas evita
            // tener que elegir un formato.
            const messages = Array.isArray(parsed) && Array.isArray(parsed[0])
                ? parsed
                : [parsed];

            const segundo = Math.floor(Date.now() / 1000);
            if (entry.ventana !== segundo) {
                entry.ventana = segundo;
                entry.cuenta = 0;
            }
            for (const message of messages) {
                entry.cuenta += 1;
                if (entry.cuenta > porSegundo * 3) {
                    stats.flooded = (stats.flooded || 0) + 1;
                    (log.warning || log.warn).call(log, 'desconectado por inundar el servidor (' + entry.cuenta +
                        ' mensajes en un segundo)');
                    socket.close(1008, 'demasiados mensajes');
                    return;
                }
                if (entry.cuenta > porSegundo) {
                    stats.rejected += 1;
                    continue;
                }
                stats.messages += 1;
                session.handle(message);
            }
        });

        socket.on('close', () => {
            session.close();
            connections.delete(socket);
            stats.closed += 1;
        });

        socket.on('error', (error) => {
            if (opts.verbose) {
                log.warning('error de socket: ' + (error && error.message));
            }
            session.close();
            connections.delete(socket);
            stats.closed += 1;
        });
    });

    /**
     * Vacía las colas de todas las conexiones.
     *
     * Se engancha al tick DESPUES de que el motor haya actualizado las vistas, así
     * que cuando se ejecuta las colas ya tienen los cambios del tick.
     */
    function flush() {
        connections.forEach((entry, socket) => {
            if (entry.queue.length === 0) {
                return;
            }

            const batch = entry.queue.splice(0, entry.queue.length);

            if (socket.readyState !== socket.OPEN) {
                return;
            }

            try {
                socket.send(JSON.stringify(batch));
                stats.frames += 1;
            } catch (error) {
                // El socket se cayó entre la comprobación y el envío. No es un
                // error del servidor: se cierra la sesión y se sigue.
                entry.session.close();
                connections.delete(socket);
            }
        });
    }

    // El vaciado va al final del tick. Como el motor ya engancho `updateAll` al
    // construirse, este suscriptor se ejecuta despues y ve la cola llena.
    engine.world.on('onTick', flush);

    return {
        server: wss,
        connections: connections,
        stats: stats,
        flush: flush,

        /** Se resuelve con el puerto cuando el servidor ya escucha. */
        ready: ready,

        /** Puerto real, o null si todavia no esta enlazado. */
        port() {
            const address = wss.address();
            return address ? address.port : null;
        },

        close() {
            connections.forEach((entry) => {
                entry.session.close();
                try {
                    entry.socket.close();
                } catch (error) {
                    // Ya estaba cerrado.
                }
            });
            connections.clear();

            return new Promise((resolve) => {
                wss.close(() => resolve(true));
            });
        }
    };
}

module.exports = { createNetworkServer };
