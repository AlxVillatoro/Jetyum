'use strict';

/**
 * Un lector de XML PEQUEÑO Y TOLERANTE, para los XML que escriben los editores de mapas de Tibia.
 *
 * Por qué no `fast-xml-parser`, que ya es una dependencia: los `materials.xml` de RME no son XML
 * del todo. Llevan comentarios sueltos como texto (`<border id="58"> -- mountain edge border --`),
 * atributos repetidos y algún `&` sin escapar, y un parser estricto los rechaza o los convierte en
 * objetos con formas distintas según cuántos hijos tenga cada nodo. Lo que hace falta aquí es poco:
 * etiquetas, atributos e hijos, en orden. El texto entre etiquetas se ignora; ninguno de estos
 * archivos guarda nada en él.
 *
 * El resultado es un árbol `{nombre, atributos, hijos}` con los nombres de etiqueta y de atributo
 * en minúsculas (RME no distingue `lookid` de `lookId`).
 */

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function desentidar(texto) {
    return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entera, cuerpo) => {
        if (cuerpo[0] === '#') {
            const codigo = cuerpo[1] === 'x' || cuerpo[1] === 'X'
                ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
            return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : entera;
        }
        return ENTIDADES[cuerpo.toLowerCase()] !== undefined ? ENTIDADES[cuerpo.toLowerCase()] : entera;
    });
}

const PATRON_ATRIBUTO = /([^\s=/>]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function leerAtributos(texto) {
    const atributos = {};
    PATRON_ATRIBUTO.lastIndex = 0;
    let m;
    while ((m = PATRON_ATRIBUTO.exec(texto)) !== null) {
        const valor = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
        atributos[m[1].toLowerCase()] = desentidar(valor);
    }
    return atributos;
}

/**
 * Lee un texto XML y devuelve la raíz (o un nodo `#documento` si hay varias).
 *
 * Una etiqueta de cierre que no corresponde a la abierta se tolera: se cierra hasta la que
 * coincide, o se ignora si no hay ninguna. Es lo que hacen los editores con sus propios archivos.
 */
function leerXml(texto) {
    const documento = { nombre: '#documento', atributos: {}, hijos: [] };
    const pila = [documento];
    const largo = texto.length;
    let p = 0;

    while (p < largo) {
        const inicio = texto.indexOf('<', p);
        if (inicio === -1) {
            break;
        }
        if (texto.startsWith('<!--', inicio)) {
            const fin = texto.indexOf('-->', inicio + 4);
            p = fin === -1 ? largo : fin + 3;
            continue;
        }
        if (texto.startsWith('<![CDATA[', inicio)) {
            const fin = texto.indexOf(']]>', inicio);
            p = fin === -1 ? largo : fin + 3;
            continue;
        }
        if (texto[inicio + 1] === '?' || texto[inicio + 1] === '!') {
            const fin = texto.indexOf('>', inicio);
            p = fin === -1 ? largo : fin + 1;
            continue;
        }

        // El final de la etiqueta, sin cortarse en un `>` que vaya dentro de unas comillas.
        let fin = inicio + 1;
        let comilla = null;
        while (fin < largo) {
            const c = texto[fin];
            if (comilla) {
                if (c === comilla) {
                    comilla = null;
                }
            } else if (c === '"' || c === "'") {
                comilla = c;
            } else if (c === '>') {
                break;
            }
            fin += 1;
        }
        const cuerpo = texto.slice(inicio + 1, fin).trim();
        p = fin + 1;

        if (cuerpo[0] === '/') {
            const nombre = cuerpo.slice(1).trim().toLowerCase();
            for (let i = pila.length - 1; i > 0; i -= 1) {
                if (pila[i].nombre === nombre) {
                    pila.length = i;
                    break;
                }
            }
            continue;
        }

        const autocerrada = cuerpo.endsWith('/');
        const limpio = autocerrada ? cuerpo.slice(0, -1) : cuerpo;
        const espacio = limpio.search(/\s/);
        const nombre = (espacio === -1 ? limpio : limpio.slice(0, espacio)).toLowerCase();
        const nodo = {
            nombre: nombre,
            atributos: espacio === -1 ? {} : leerAtributos(limpio.slice(espacio)),
            hijos: []
        };
        pila[pila.length - 1].hijos.push(nodo);
        if (!autocerrada) {
            pila.push(nodo);
        }
    }

    return documento.hijos.length === 1 ? documento.hijos[0] : documento;
}

/** Los hijos de un nodo con ese nombre. */
function hijos(nodo, nombre) {
    return (nodo && nodo.hijos ? nodo.hijos : []).filter((h) => h.nombre === nombre);
}

/** Todos los descendientes con ese nombre, en orden de documento. */
function descendientes(nodo, nombre) {
    const salida = [];
    const visitar = (n) => {
        (n.hijos || []).forEach((h) => {
            if (h.nombre === nombre) {
                salida.push(h);
            }
            visitar(h);
        });
    };
    visitar(nodo);
    return salida;
}

module.exports = { leerXml, hijos, descendientes };
