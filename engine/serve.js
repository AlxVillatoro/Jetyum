'use strict';

/**
 * Arranque del servidor de juego completo: motor + red.
 *
 * Uso:  node engine/serve.js [--config ruta] [--port 8080] [--quiet]
 */

const path = require('path');

const { createEngine } = require('./core/engine');
const { createNetworkServer } = require('./net/server');
const { crearServidorWeb } = require('./net/web');

function parseArgs(argv) {
    const args = { config: null, port: null, webPort: null, web: true, map: null, quiet: false, verbose: false };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === '--config') {
            args.config = argv[index + 1];
            index += 1;
        } else if (arg === '--map' || arg === '--mapa') {
            // El mapa con el que arranca, sin tocar config.js: `npm run serve -- --map ciudad`
            // abre data/world/ciudad.map.json. Es lo que se usa para probar un mapa recién
            // guardado en el editor.
            args.map = argv[index + 1];
            index += 1;
        } else if (arg === '--port') {
            args.port = Number(argv[index + 1]);
            index += 1;
        } else if (arg === '--web-port') {
            args.webPort = Number(argv[index + 1]);
            index += 1;
        } else if (arg === '--sin-web' || arg === '--no-web') {
            // Sólo el servidor de juego (el cliente lo sirve otro).
            args.web = false;
        } else if (arg === '--quiet') {
            args.quiet = true;
        } else if (arg === '--verbose') {
            args.verbose = true;
        }
    }

    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = path.resolve(__dirname, '..');

    const engine = createEngine({
        rootDir: rootDir,
        configFile: args.config || undefined,
        overrides: args.map ? { mapName: args.map, mapFile: null } : undefined,
        logLevel: args.verbose ? 'debug' : 'info'
    });

    const port = args.port === null ? engine.config.enginePort : args.port;

    const network = createNetworkServer({
        engine: engine,
        port: port,
        logger: engine.log,
        verbose: args.verbose
    });

    // Se espera a que el servidor este ENLAZADO antes de seguir. Enlazar es
    // asincrono, asi que preguntar el puerto aqui mismo devolvia null y el
    // arranque anunciaba "ws://localhost:null", que es un mensaje peor que no
    // anunciar nada.
    const realPort = await network.ready;

    // El servidor web: el cliente del navegador (client/jetyum) y lo compartido (shared).
    const web = args.web ? crearServidorWeb({
        raiz: rootDir,
        config: engine.config,
        puerto: args.webPort === null ? (engine.config.webPort || 8000) : args.webPort,
        log: engine.log
    }) : null;
    const webPort = web ? await web.listo : null;

    // El motor arranca DESPUES de la red, para que el primer tick ya encuentre las
    // conexiones registradas y no se pierda el mapa inicial de nadie que entrara en
    // ese hueco.
    engine.start();

    if (!args.quiet) {
        console.log('');
        console.log('  Servidor de juego escuchando en ws://localhost:' + realPort);
        if (webPort) {
            console.log('  Para jugar, abre http://localhost:' + webPort + '/jetyum/');
        }
        console.log('');
    }

    engine.log.info('escuchando en el puerto ' + realPort);
    engine.log.info('jugadores: ' + engine.sessions.size);

    let stopping = false;

    const shutdown = (signal) => {
        if (stopping) {
            return;
        }
        stopping = true;

        engine.log.info('cerrando por ' + signal + '...');
        Promise.all([network.close(), web ? web.cerrar() : null]).then(() => {
            engine.shutdown();
            process.exit(0);
        });

        // Si algo se atasca, no quedarse colgado: se sale igual.
        setTimeout(() => process.exit(0), 2000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    return { engine: engine, network: network, port: realPort, web: web, webPort: webPort };
}

if (require.main === module) {
    main().catch((error) => {
        console.error('no se pudo arrancar el servidor:');
        console.error(error && error.stack ? error.stack : error);
        process.exit(1);
    });
}

module.exports = { main, parseArgs };
