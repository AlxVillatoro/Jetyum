'use strict';

/**
 * EL SERVIDOR WEB DEL JUEGO: sirve el cliente al navegador.
 *
 *     http://localhost:8000/jetyum/      (webPort en config.js)
 *
 * Lo arranca `engine/serve.js` junto al servidor de juego (`npm start`). Sólo sirve archivos, y
 * dos respuestas que el cliente necesita antes de conectarse:
 *
 *   /                          -> /jetyum/
 *   /jetyum/...            -> client/jetyum/  (el cliente: html, js y sus assets)
 *   /shared/...                -> shared/             (lo que comparten motor y cliente: protocolo...)
 *   /jetyum/motor.json     -> { puerto }: dónde escucha el motor (enginePort)
 *   /jetyum/vocaciones.json -> las vocaciones que se pueden elegir al crear un personaje
 *
 * Nada fuera de esas carpetas: una ruta con `..` no sale de su raíz.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

/** Lo que se sirve: prefijo de URL -> carpeta (relativa a la raíz del proyecto). */
const MONTAJES = [
    { prefijo: '/jetyum/', dir: 'client/jetyum' },
    { prefijo: '/shared/', dir: 'shared' }
];

/** La ruta del disco para `relativa` dentro de `raiz`, o null si se sale de ella. */
function dentroDe(raiz, relativa) {
    let texto;
    try {
        texto = decodeURIComponent(relativa);
    } catch (e) {
        return null;
    }
    const absoluta = path.resolve(raiz, path.normalize(texto).replace(/^([/\\])+/, ''));
    const base = path.resolve(raiz);
    return absoluta === base || absoluta.startsWith(base + path.sep) ? absoluta : null;
}

function enviarJson(res, datos) {
    const cuerpo = JSON.stringify(datos);
    res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(cuerpo)
    });
    res.end(cuerpo);
}

function enviarArchivo(req, res, archivo) {
    let stat;
    try {
        stat = fs.statSync(archivo);
        if (stat.isDirectory()) {
            archivo = path.join(archivo, 'index.html');
            stat = fs.statSync(archivo);
        }
    } catch (e) {
        return false;
    }
    res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    if (req.method === 'HEAD') {
        res.end();
        return true;
    }
    const lectura = fs.createReadStream(archivo);
    lectura.on('error', () => res.destroy());
    lectura.pipe(res);
    return true;
}

/** Las vocaciones que se pueden elegir al crear un personaje (las de base, no las promociones). */
function vocacionesElegibles(config, raiz) {
    try {
        const ruta = path.resolve(raiz, config.vocationsXml || 'data/XML/vocations.js');
        delete require.cache[ruta];
        const lista = /\.js$/.test(ruta) ? require(ruta) : [];
        return lista
            .filter((v) => v.fromVoc === undefined || Number(v.fromVoc) === Number(v.id))
            .map((v) => ({ id: v.id, name: v.name, description: v.description || '', needPremium: v.needPremium === true }));
    } catch (e) {
        return [];
    }
}

/**
 * @param {Object} o
 * @param {string} o.raiz la raíz del proyecto
 * @param {Object} o.config la configuración (enginePort, vocationsXml...)
 * @param {number} [o.puerto] 0: uno libre (pruebas)
 * @param {Object} [o.log]
 * @returns {{servidor: http.Server, listo: Promise<number>, cerrar: Function}}
 */
function crearServidorWeb(o) {
    const raiz = o.raiz;
    const config = o.config || {};
    const montajes = MONTAJES.map((m) => ({ prefijo: m.prefijo, dir: path.join(raiz, m.dir) }));

    const servidor = http.createServer((req, res) => {
        let ruta;
        try {
            ruta = new URL(req.url, 'http://localhost').pathname;
        } catch (e) {
            ruta = '/';
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405);
            res.end();
            return;
        }
        if (ruta === '/' || ruta === '/jetyum') {
            res.writeHead(302, { Location: '/jetyum/' });
            res.end();
            return;
        }
        if (ruta === '/jetyum/motor.json') {
            enviarJson(res, { puerto: Number(config.enginePort) || 8081 });
            return;
        }
        if (ruta === '/jetyum/vocaciones.json') {
            enviarJson(res, vocacionesElegibles(config, raiz));
            return;
        }
        for (const m of montajes) {
            if (ruta.startsWith(m.prefijo)) {
                const archivo = dentroDe(m.dir, ruta.slice(m.prefijo.length));
                if (archivo && enviarArchivo(req, res, archivo)) {
                    return;
                }
            }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404: ' + ruta);
    });

    const listo = new Promise((resolve, reject) => {
        servidor.once('error', reject);
        servidor.listen(o.puerto === undefined ? 8000 : o.puerto, o.host || '0.0.0.0', () => {
            const puerto = servidor.address().port;
            if (o.log) {
                o.log.info('cliente web: http://localhost:' + puerto + '/jetyum/');
                const red = Object.values(os.networkInterfaces()).flat()
                    .filter((i) => i && i.family === 'IPv4' && !i.internal)
                    .map((i) => 'http://' + i.address + ':' + puerto + '/jetyum/');
                if (red.length) {
                    o.log.info('para jugar desde otro equipo de tu red: ' + red.join('  '));
                }
            }
            resolve(puerto);
        });
    });

    return {
        servidor,
        listo,
        cerrar: () => new Promise((resolve) => servidor.close(() => resolve()))
    };
}

module.exports = { crearServidorWeb, dentroDe, MONTAJES };
