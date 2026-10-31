/**
 * Inglés: el diagnóstico del mapa del editor (`editor/js/diagnostico.js`).
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves
 * (`{n}`, `{nombre}`): ver `shared/js/i18n.mjs`. Las plantillas de los mensajes son las de
 * `MENSAJES` en el módulo, y la prueba (`tools/test-editor-diagnostico.mjs`) comprueba que no
 * falte ninguna.
 */
export default {
    // -----------------------------------------------------------------------
    // Los tipos de problema (el filtro del panel), sueltos y con su cuenta
    // -----------------------------------------------------------------------
    'Objeto desconocido': 'Unknown item',
    'uniqueId repetido': 'Duplicate uniqueId',
    'Teleport roto': 'Broken teleport',
    'Escalera o agujero sin salida': 'Stairs or hole leading nowhere',
    'Ciudad y templo': 'Town and temple',
    'Waypoint': 'Waypoint',
    'Casa': 'House',
    'Respawn': 'Respawn',
    'NPC': 'NPC',
    'Casilla sin suelo': 'Tile without ground',
    'Bloqueo sobre bloqueo': 'Blocking upon blocking',
    'Objeto desconocido ({n})': 'Unknown item ({n})',
    'uniqueId repetido ({n})': 'Duplicate uniqueId ({n})',
    'Teleport roto ({n})': 'Broken teleport ({n})',
    'Escalera o agujero sin salida ({n})': 'Stairs or hole leading nowhere ({n})',
    'Ciudad y templo ({n})': 'Town and temple ({n})',
    'Waypoint ({n})': 'Waypoint ({n})',
    'Casa ({n})': 'House ({n})',
    'Respawn ({n})': 'Respawn ({n})',
    'NPC ({n})': 'NPC ({n})',
    'Casilla sin suelo ({n})': 'Tile without ground ({n})',
    'Bloqueo sobre bloqueo ({n})': 'Blocking upon blocking ({n})',

    // -----------------------------------------------------------------------
    // El panel
    // -----------------------------------------------------------------------
    'Diagnóstico del mapa': 'Map diagnostics',
    '{n} problemas: {e} errores y {a} avisos': '{n} problems: {e} errors and {a} warnings',
    'No se ha encontrado ningún problema.': 'No problems found.',
    'Ningún problema con este filtro.': 'No problems match this filter.',
    'Todos ({n})': 'All ({n})',
    'Errores ({n})': 'Errors ({n})',
    'Avisos ({n})': 'Warnings ({n})',
    'Todos los tipos ({n})': 'All types ({n})',
    'error': 'error',
    'aviso': 'warning',
    'mapa': 'map',
    'Volver a analizar': 'Analyze again',
    'Se enseñan {n} de {total}: filtra para ver el resto.': 'Showing {n} of {total}: filter to see the rest.',
    'Ir a la casilla': 'Go to the tile',
    'Es un problema del mapa entero, no de una casilla.': 'This is a problem of the whole map, not of a tile.',

    // -----------------------------------------------------------------------
    // Los mensajes (MENSAJES en editor/js/diagnostico.js)
    // -----------------------------------------------------------------------
    'el suelo por defecto de la planta {z} es el objeto {id}, que no existe en items.xml':
        'the default ground of floor {z} is item {id}, which does not exist in items.xml',
    'el suelo de reserva (fallbackGround) es el objeto {id}, que no existe en items.xml':
        'the fallback ground (fallbackGround) is item {id}, which does not exist in items.xml',
    'el objeto {id} no existe en items.xml: el motor lo descarta al cargar':
        'item {id} does not exist in items.xml: the engine drops it on load',
    'el suelo {id} no existe en items.xml: el motor lo descarta al cargar':
        'ground {id} does not exist in items.xml: the engine drops it on load',

    'uniqueId {uid} repetido en {objeto}: también está en {pos}':
        'duplicate uniqueId {uid} on {objeto}: it is also at {pos}',

    'el teleport no tiene destino: quien lo pise no irá a ninguna parte':
        'the teleport has no destination: whoever steps on it will go nowhere',
    'el destino del teleport no se puede leer: {valor}':
        'the destination of the teleport cannot be read: {valor}',
    'el teleport lleva a {pos}, que está fuera del mapa':
        'the teleport leads to {pos}, which is outside the map',
    'el teleport lleva a {pos}, que es vacío: no hay suelo':
        'the teleport leads to {pos}, which is void: there is no ground',
    'el teleport lleva a {pos}, que no se puede pisar':
        'the teleport leads to {pos}, which is not walkable',
    'el teleport lleva a su propia casilla':
        'the teleport leads to its own tile',

    '{objeto} ({sentido}) lleva a la planta {z}, que no existe':
        '{objeto} ({sentido}) leads to floor {z}, which does not exist',
    '{objeto} ({sentido}) lleva a {pos}, que es vacío: no hay suelo':
        '{objeto} ({sentido}) leads to {pos}, which is void: there is no ground',
    '{objeto} ({sentido}) lleva a {pos}, que no se puede pisar':
        '{objeto} ({sentido}) leads to {pos}, which is not walkable',
    '{objeto} tiene un floorchange desconocido: «{sentido}»':
        '{objeto} has an unknown floorchange: "{sentido}"',

    'casilla con objetos y sin suelo: en el juego es un agujero':
        'tile with items and no ground: in the game it is a hole',
    '{n} objetos que bloquean el paso en la misma casilla: {nombres}':
        '{n} blocking items on the same tile: {nombres}',

    '{n} casillas de la casa {id}, que no está en la lista de casas':
        '{n} tiles of house {id}, which is not in the house list',
    'la casa #{indice} tiene un id inválido o repetido ({id})':
        'house #{indice} has an invalid or duplicate id ({id})',
    'la casa «{nombre}» no tiene ninguna casilla':
        'house "{nombre}" has no tiles',
    'la casa «{nombre}» es de la ciudad {ciudad}, que no existe':
        'house "{nombre}" belongs to town {ciudad}, which does not exist',
    'la casa «{nombre}» no tiene salida':
        'house "{nombre}" has no exit',
    'la salida de la casa «{nombre}» no se puede leer: {valor}':
        'the exit of house "{nombre}" cannot be read: {valor}',
    'la salida de la casa «{nombre}» cae fuera del mapa: {pos}':
        'the exit of house "{nombre}" is outside the map: {pos}',
    'la salida de la casa «{nombre}» está dentro de una casa':
        'the exit of house "{nombre}" is inside a house',
    'la salida de la casa «{nombre}» no se puede pisar':
        'the exit of house "{nombre}" is not walkable',
    'la salida de la casa «{nombre}» está a {n} casillas de la casa':
        'the exit of house "{nombre}" is {n} tiles away from the house',
    'la salida de la casa «{nombre}» está en una planta sin casillas de la casa':
        'the exit of house "{nombre}" is on a floor with no tiles of the house',

    'la ciudad #{indice} tiene un id inválido o repetido ({id})':
        'town #{indice} has an invalid or duplicate id ({id})',
    'la ciudad «{nombre}» no tiene templo, o no se puede leer: {valor}':
        'town "{nombre}" has no temple, or it cannot be read: {valor}',
    'el templo de la ciudad «{nombre}» cae fuera del mapa: {pos}':
        'the temple of town "{nombre}" is outside the map: {pos}',
    'el templo de la ciudad «{nombre}» cae en una casilla que no se puede pisar':
        'the temple of town "{nombre}" is on a tile that is not walkable',

    'el waypoint «{nombre}» no se puede leer: {valor}':
        'waypoint "{nombre}" cannot be read: {valor}',
    'el waypoint «{nombre}» cae fuera del mapa: {pos}':
        'waypoint "{nombre}" is outside the map: {pos}',
    'el waypoint «{nombre}» cae en una casilla que no se puede pisar: el motor no carga el mapa así':
        'waypoint "{nombre}" is on a tile that is not walkable: the engine will not load the map like this',

    'el respawn de {monstruos} tiene el centro fuera del mapa':
        'the respawn of {monstruos} has its centre outside the map',
    'el respawn tiene monstruos que no existen en data/monsters/: {nombres}':
        'the respawn has monsters that do not exist in data/monsters/: {nombres}',
    'el centro del respawn de {monstruos} no se puede pisar':
        'the centre of the respawn of {monstruos} is not walkable',
    'el respawn de {monstruos} no tiene ninguna casilla que se pueda pisar':
        'the respawn of {monstruos} has no walkable tile',
    '{monstruo} está fuera de su respawn':
        '{monstruo} is outside its respawn',
    '{monstruo} está en una casilla que no se puede pisar':
        '{monstruo} is on a tile that is not walkable',
    '{monstruo} está en una zona protegida, donde no entran los monstruos':
        '{monstruo} is in a protection zone, where monsters cannot go',

    'el NPC «{nombre}» está fuera del mapa: {pos}':
        'NPC "{nombre}" is outside the map: {pos}',
    'el NPC «{nombre}» no está definido en data/npc/npcs.xml':
        'NPC "{nombre}" is not defined in data/npc/npcs.xml',
    'el NPC «{nombre}» está en una casilla que no se puede pisar: no se podrá llegar a él':
        'NPC "{nombre}" is on a tile that is not walkable: it will not be reachable',
    'hay {n} NPC en la misma casilla: {nombres}':
        'there are {n} NPCs on the same tile: {nombres}'
};
