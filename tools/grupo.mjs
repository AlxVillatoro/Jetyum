/**
 * PONE EL GRUPO DE ACCESO DE UN PERSONAJE (data/XML/groups.js) directamente en la base.
 *
 *     npm run grupo -- <personaje> <grupo>      p. ej.  npm run grupo -- Alex god
 *     npm run grupo -- <personaje>              dice el grupo que tiene
 *
 * Es la única forma de nombrar al PRIMER god de un servidor: desde el juego sólo un god puede dar
 * grupos (`/grupo`). Mejor con el servidor parado; si el personaje está dentro, lo notará al volver
 * a entrar (o usa `/grupo` en el juego).
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Database } = require('../engine/persistence/database.js');
const Definiciones = require('../engine/data/definiciones.js');
const config = require('../config.js');

const [nombre, grupo] = process.argv.slice(2);
if (!nombre) {
    console.log('Uso: npm run grupo -- <personaje> [grupo]');
    process.exit(1);
}

const rutaGrupos = Definiciones.resolverRuta(path.join(ROOT, config.groupsXml || 'data/XML/groups.js'));
const grupos = rutaGrupos ? Definiciones.loadGroups(rutaGrupos) : new Map([[1, Definiciones.GRUPO_JUGADOR]]);
const nombreDe = (id) => (grupos.get(id) || { name: '?' }).name;

const db = new Database({ file: path.join(ROOT, config.databaseFile || 'data/jetyum.db') }).open();
try {
    if (!grupo) {
        const actual = db.characterGroup(nombre);
        console.log(actual === null ? 'No existe el personaje «' + nombre + '».'
            : nombre + ' es del grupo ' + actual + ' (' + nombreDe(actual) + ').');
        process.exit(actual === null ? 1 : 0);
    }
    const buscado = String(grupo).toLowerCase();
    const def = grupos.get(Number(grupo)) || Array.from(grupos.values()).find((g) => g.name === buscado);
    if (!def) {
        console.log('No existe el grupo «' + grupo + '». Grupos: ' +
            Array.from(grupos.values()).map((g) => g.id + ' ' + g.name).join(', '));
        process.exit(1);
    }
    if (!db.setCharacterGroup(nombre, def.id)) {
        console.log('No existe el personaje «' + nombre + '».');
        process.exit(1);
    }
    console.log(nombre + ' es ahora del grupo ' + def.id + ' (' + def.name + ').');
} finally {
    db.close();
}
