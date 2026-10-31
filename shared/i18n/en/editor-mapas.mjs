/**
 * Inglés: los ARCHIVOS de mapa del editor: nuevo mapa, guardar como, propiedades y copias de
 * seguridad (`editor/lib/mapfiles.js` y sus rutas en `editor/server.js`).
 *
 * Son los errores y avisos que devuelve la API y que el editor enseña tal cual. La clave es la
 * frase en español TAL CUAL sale, y los huecos van entre llaves: ver `shared/js/i18n.mjs`.
 */
export default {
    // -----------------------------------------------------------------------
    // editor/lib/mapfiles.js: nombres, tamaños y suelos
    // -----------------------------------------------------------------------
    'falta el nombre del mapa': 'the map name is missing',
    'el nombre del mapa solo puede llevar letras sin acentos, numeros, - y _: {nombre}':
        'the map name may only contain unaccented letters, digits, - and _: {nombre}',
    'el nombre del mapa pasa de {n} letras': 'the map name is longer than {n} characters',
    'el nombre {nombre} esta reservado por Windows y no puede ser un archivo':
        'the name {nombre} is reserved by Windows and cannot be a file',
    'ya existe un mapa llamado {nombre}': 'a map called {nombre} already exists',
    'el ancho tiene que ser un numero entero de {min} a {max} casillas: {valor}':
        'the width must be a whole number from {min} to {max} tiles: {valor}',
    'el alto tiene que ser un numero entero de {min} a {max} casillas: {valor}':
        'the height must be a whole number from {min} to {max} tiles: {valor}',
    'las plantas tienen que ser un numero entero de {min} a {max}: {valor}':
        'the floors must be a whole number from {min} to {max}: {valor}',
    'el suelo por defecto': 'the default ground',
    'el suelo de respaldo': 'the fallback ground',
    'el suelo de la planta {z}': 'the ground of floor {z}',
    '{suelo}: el objeto {id} no existe en items.xml': '{suelo}: item {id} does not exist in items.xml',
    '{suelo}: el objeto {id} ({nombre}) no es un suelo': '{suelo}: item {id} ({nombre}) is not a ground',
    '{suelo}: el suelo {id} ({nombre}) no se puede pisar, y el templo va encima':
        '{suelo}: ground {id} ({nombre}) cannot be walked on, and the temple goes on it',

    // -----------------------------------------------------------------------
    // editor/lib/mapfiles.js: lo que quedaría fuera al encoger un mapa
    // -----------------------------------------------------------------------
    'la casilla {p} quedaria fuera del mapa': 'tile {p} would fall outside the map',
    'el respawn de {p} quedaria fuera del mapa': 'the respawn at {p} would fall outside the map',
    'el monstruo "{nombre}" en {p} quedaria fuera del mapa': 'monster "{nombre}" at {p} would fall outside the map',
    'el npc "{nombre}" en {p} quedaria fuera del mapa': 'npc "{nombre}" at {p} would fall outside the map',
    'el waypoint "{nombre}" en {p} quedaria fuera del mapa': 'waypoint "{nombre}" at {p} would fall outside the map',
    'el templo de la ciudad {id} en {p} quedaria fuera del mapa':
        'the temple of town {id} at {p} would fall outside the map',
    'la salida de la casa {id} en {p} quedaria fuera del mapa': 'the exit of house {id} at {p} would fall outside the map',
    'el compuesto {uid} ({plantilla}) en {p} quedaria fuera del mapa':
        'composite {uid} ({plantilla}) at {p} would fall outside the map',
    'el suelo por defecto de la planta {z} quedaria fuera del mapa':
        'the default ground of floor {z} would fall outside the map',
    'y {n} casillas mas quedarian fuera del mapa': 'and {n} more tiles would fall outside the map',
    'y {n} respawns mas quedarian fuera del mapa': 'and {n} more respawns would fall outside the map',
    'y {n} monstruos mas quedarian fuera del mapa': 'and {n} more monsters would fall outside the map',
    'y {n} npcs mas quedarian fuera del mapa': 'and {n} more npcs would fall outside the map',
    'y {n} waypoints mas quedarian fuera del mapa': 'and {n} more waypoints would fall outside the map',
    'y {n} ciudades mas quedarian fuera del mapa': 'and {n} more towns would fall outside the map',
    'y {n} casas mas quedarian fuera del mapa': 'and {n} more houses would fall outside the map',
    'y {n} compuestos mas quedarian fuera del mapa': 'and {n} more composites would fall outside the map',
    'y {n} suelos mas quedarian fuera del mapa': 'and {n} more floor grounds would fall outside the map',

    // -----------------------------------------------------------------------
    // editor/server.js: nuevo mapa, guardar como, propiedades y copias
    // -----------------------------------------------------------------------
    'el mapa nuevo no es valido': 'the new map is not valid',
    'el suelo del mapa no es valido': 'the map ground is not valid',
    'el mapa nuevo no se puede cargar': 'the new map cannot be loaded',
    'la descripcion tiene que ser un texto': 'the description must be text',
    'la descripcion pasa de {n} letras': 'the description is longer than {n} characters',
    'las propiedades del mapa no son validas': 'the map properties are not valid',
    'los suelos tienen que ser un objeto con un objeto de items.xml por planta':
        'the grounds must be an object with one items.xml item per floor',
    'la planta {planta} no existe': 'floor {planta} does not exist',
    'el mapa no se puede encoger: quedarian {n} cosas fuera':
        'the map cannot be shrunk: {n} things would fall outside',
    'con estas propiedades el mapa no se puede cargar': 'with these properties the map cannot be loaded',
    'config.js arranca el motor con el mapa {viejo}: cambia mapName a {nuevo} o el servidor no lo encontrara':
        'config.js starts the engine with map {viejo}: change mapName to {nuevo} or the server will not find it',
    '{archivo} no es una copia del mapa {nombre}': '{archivo} is not a backup of map {nombre}',
    'no existe la copia {archivo}': 'backup {archivo} does not exist',
    'la copia {archivo} no es JSON valido': 'backup {archivo} is not valid JSON',
    'la copia {archivo} no se puede cargar con los datos de ahora':
        'backup {archivo} cannot be loaded with the current data'
};
