/**
 * Inglés: IMPORTAR OTBM en el editor (el diálogo de `editor/js/importarotbm.js`, sus rutas en
 * `editor/server.js` y los avisos del informe de `editor/lib/convertirotbm.js`).
 *
 * La clave es la frase en español TAL CUAL sale, y los huecos van entre llaves: ver
 * `shared/js/i18n.mjs`.
 */
export default {
    // -----------------------------------------------------------------------
    // editor/index.html: el botón
    // -----------------------------------------------------------------------
    'Importar OTBM…': 'Import OTBM…',
    'Importar OTBM: convertir un mapa de Remere\'s Map Editor o TFS (.otbm) en un mapa nuevo de data/world':
        'Import OTBM: convert a Remere\'s Map Editor or TFS map (.otbm) into a new map in data/world',

    // -----------------------------------------------------------------------
    // editor/js/importarotbm.js: el diálogo
    // -----------------------------------------------------------------------
    'Importar OTBM': 'Import OTBM',
    'Convierte un mapa de RME o TFS en un mapa nuevo de data/world. Los ids de Tibia se traducen con data/editor/equivalencias-otbm.json; lo que no tiene equivalencia se quita y sale en el informe.':
        'Converts an RME or TFS map into a new map in data/world. Tibia ids are translated with data/editor/equivalencias-otbm.json; whatever has no equivalent is removed and listed in the report.',
    'Mapa (.otbm)': 'Map (.otbm)',
    'El mapa de RME o de TFS': 'The RME or TFS map',
    'items.otb del servidor': 'server items.otb',
    'El items.otb con el que se hizo el mapa: da sentido a sus números':
        'The items.otb the map was made with: it gives meaning to its numbers',
    'items.xml del servidor (recomendado)': 'server items.xml (recommended)',
    'Los nombres de los objetos: sin él, casan muchos menos': 'The item names: without it, far fewer items match',
    'house.xml (opcional)': 'house.xml (optional)',
    'Las casas: nombre, ciudad, alquiler y salida': 'The houses: name, town, rent and exit',
    'spawn.xml (opcional)': 'spawn.xml (optional)',
    'Los respawns y los NPC': 'The respawns and the NPCs',
    'materials.xml de RME (opcional, ruta en el servidor)': 'RME materials.xml (optional, path on the server)',
    'Los pinceles de RME: con ellos los muros, los suelos y los bordes casan pieza a pieza. Sin ellos se usa la tabla guardada en data/editor/equivalencias-otbm.json':
        'The RME brushes: with them walls, grounds and borders match piece by piece. Without them the table saved in data/editor/equivalencias-otbm.json is used',
    'ruta en el servidor': 'path on the server',
    'Subir…': 'Upload…',
    'Subir el archivo al servidor del editor (a una carpeta temporal)':
        'Upload the file to the editor server (into a temporary folder)',
    'Área: x1,y1,x2,y2[,z1,z2]': 'Area: x1,y1,x2,y2[,z1,z2]',
    'La región que se importa, con las coordenadas del .otbm. Vacío: el mapa entero (puede ser enorme)':
        'The region to import, in .otbm coordinates. Empty: the whole map (it can be huge)',
    'vacío = el mapa entero': 'empty = the whole map',
    'Llevar el área al origen (0,0)': 'Move the area to the origin (0,0)',
    'La esquina del área pasa a ser la casilla 0,0: el mapa mide lo que mide el área. El desplazamiento queda apuntado en el archivo y la exportación lo deshace':
        'The corner of the area becomes tile 0,0: the map is as big as the area. The offset is recorded in the file and exporting undoes it',
    'Nombre del mapa nuevo': 'New map name',
    'Importar y abrir': 'Import and open',
    'Analizar': 'Analyze',
    'Leer el mapa y enseñar el informe, sin escribir nada': 'Read the map and show the report, without writing anything',
    'subiendo {archivo} ({kb} KB)...': 'uploading {archivo} ({kb} KB)...',
    'no se subió {archivo}: {error}': '{archivo} was not uploaded: {error}',
    'subido {archivo} ({kb} KB)': 'uploaded {archivo} ({kb} KB)',
    'Hay {n} cambio(s) sin guardar en el mapa abierto. ¿Abrir el mapa importado y perderlos?':
        'There are {n} unsaved change(s) in the open map. Open the imported map and lose them?',
    'analizando el mapa...': 'analyzing the map...',
    'importando el mapa {nombre}...': 'importing map {nombre}...',
    'no se importó el mapa: {error}': 'the map was not imported: {error}',
    'análisis: {n} casillas, {p}% de los objetos traducidos': 'analysis: {n} tiles, {p}% of the items translated',
    'mapa importado: {nombre} ({ancho}x{alto}, {n} casillas, {p}% de los objetos traducidos)':
        'imported map: {nombre} ({ancho}x{alto}, {n} tiles, {p}% of the items translated)',
    'Informe': 'Report',
    'Tamaño del mapa nuevo': 'Size of the new map',
    'Casillas': 'Tiles',
    'Objetos traducidos': 'Translated items',
    'Quitados a propósito (bordes sin equivalente)': 'Removed on purpose (borders without an equivalent)',
    'Sin equivalencia': 'Without an equivalent',
    '{n} ({ids} ids)': '{n} ({ids} ids)',
    'Ciudades': 'Towns',
    'Casas': 'Houses',
    'Waypoints': 'Waypoints',
    'Respawns': 'Respawns',
    '{n} ({m} monstruos)': '{n} ({m} monsters)',
    'Monstruos que no existen aquí': 'Monsters that do not exist here',
    'Tiempo de lectura': 'Reading time',
    'Ids sin equivalencia (de más a menos)': 'Ids without an equivalent (most frequent first)',
    'Para darles una, añádelos a «manual» en data/editor/equivalencias-otbm.json.':
        'To give them one, add them to "manual" in data/editor/equivalencias-otbm.json.',
    'Monstruos que no existen en data/monsters: {lista}': 'Monsters that do not exist in data/monsters: {lista}',

    // -----------------------------------------------------------------------
    // editor/server.js: subir e importar
    // -----------------------------------------------------------------------
    'solo se suben archivos {extensiones}: {archivo}': 'only {extensiones} files can be uploaded: {archivo}',
    'el archivo pasa de {n} MB': 'the file is larger than {n} MB',
    'la subida se corto: {error}': 'the upload was interrupted: {error}',
    'falta el mapa .otbm': 'the .otbm map is missing',
    'falta el items.otb': 'the items.otb is missing',
    '{archivo} tiene que ser un archivo {extensiones}: {ruta}': '{archivo} must be a {extensiones} file: {ruta}',
    'no existe el mapa .otbm: {ruta}': 'the .otbm map does not exist: {ruta}',
    'no existe el items.otb: {ruta}': 'the items.otb does not exist: {ruta}',
    'no existe el items.xml: {ruta}': 'the items.xml does not exist: {ruta}',
    'no existe el house.xml: {ruta}': 'the house.xml does not exist: {ruta}',
    'no existe el spawn.xml: {ruta}': 'the spawn.xml does not exist: {ruta}',
    'no existe el materials.xml: {ruta}': 'the materials.xml does not exist: {ruta}',
    'el area es x1,y1,x2,y2[,z1,z2] con enteros: {valor}': 'the area is x1,y1,x2,y2[,z1,z2] with whole numbers: {valor}',
    'la importacion no es valida': 'the import is not valid',
    'no se pudieron leer los archivos de items: {error}': 'the item files could not be read: {error}',
    'el .otbm no se pudo leer: {error}': 'the .otbm could not be read: {error}',
    'el mapa importado no carga en el motor': 'the imported map does not load in the engine',

    // -----------------------------------------------------------------------
    // editor/lib/convertirotbm.js: los avisos del informe
    // -----------------------------------------------------------------------
    '{n} objetos dentro de contenedores no se importan (el mapa de Jetyum no guarda contenidos)':
        '{n} items inside containers are not imported (Jetyum maps do not store contents)',
    '{n} cantidades o subtipos se pierden: el objeto de Jetyum no es apilable':
        '{n} counts or subtypes are lost: the Jetyum item is not stackable',
    '{n} teleports llevan fuera del area importada': '{n} teleports lead outside the imported area',
    '{n} casas tienen la salida fuera del area: se quedan sin salida':
        '{n} houses have their exit outside the area: they are left without an exit',
    '{n} casas son de una ciudad que queda fuera: se quedan sin ciudad':
        '{n} houses belong to a town outside the area: they are left without a town',
    '{n} casas salen en las casillas pero no en el house.xml: se crean con nombre generico y sin alquiler':
        '{n} houses appear on the tiles but not in the house.xml: they are created with a generic name and no rent',
    '{n} casas salen en las casillas pero no en el house.xml (no se dio ninguno): se crean con nombre generico y sin alquiler':
        '{n} houses appear on the tiles but not in the house.xml (none was given): they are created with a generic name and no rent',
    'waypoints en una casilla que no se puede pisar (se quitan): {lista}':
        'waypoints on a tile that cannot be walked on (removed): {lista}',
    'equivalencias calculadas sin materiales de RME: los muros y los bordes casan peor (usa --materiales)':
        'equivalences computed without RME materials: walls and borders match worse (use --materiales)',
    'ninguna ciudad tiene el templo dentro del area: se pone el waypoint "temple" en ({p})':
        'no town has its temple inside the area: the "temple" waypoint is placed at ({p})',
    'ninguna ciudad tiene el templo dentro del area y no hay ninguna casilla que se pueda pisar para poner uno: el motor no tendra donde hacer aparecer a los jugadores':
        'no town has its temple inside the area and there is no walkable tile to put one on: the engine will have nowhere to spawn players'
};
