/**
 * Inglés: el editor: el mapa, los marcadores, el lienzo, las herramientas de edición.
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves
 * (`{n}`, `{nombre}`): ver `shared/js/i18n.mjs`.
 */
export default {
    // --- editor/js/editormap.js: la pila de una casilla ---------------------------------------
    'la casilla ({x},{y},{z}) esta fuera del mapa': 'tile ({x},{y},{z}) is outside the map',
    'en ({x},{y},{z}) no hay ningun objeto que elegir: la casilla no tiene suelo propio ni nada puesto encima, asi que usa el suelo por defecto de la planta (el {id})':
        'there is no item to pick at ({x},{y},{z}): the tile has no ground of its own and nothing on top, so it uses the floor\'s default ground ({id})',
    'en ({x},{y},{z}) no hay nada en la posicion {pos} de la pila: tiene {n} posiciones':
        'there is nothing at stack position {pos} at ({x},{y},{z}): it has {n} positions',
    'para mover algo en la pila hay que elegirlo antes: con nada en la mano, pincha una casilla para elegir lo que hay en ella':
        'to move something in the stack, pick it first: with nothing in hand, click a tile to pick what is on it',
    'el suelo es uno por casilla y va siempre abajo del todo, asi que no se mueve en la pila: para cambiarlo, pinta otro suelo encima':
        'each tile has one ground and it always sits at the very bottom, so it does not move in the stack: to change it, paint another ground over it',
    '"{nombre}" ya esta abajo del todo de la pila: lo unico que puede quedar debajo es el suelo':
        '"{nombre}" is already at the bottom of the stack: only the ground can be below it',
    '"{nombre}" ya esta arriba del todo de la pila': '"{nombre}" is already at the top of the stack',
    'debajo del primer objeto de la pila esta el suelo, que no se mueve':
        'below the first item in the stack is the ground, which does not move',
    '"{nombre}" no puede pasar al otro lado de "{vecino}": los objetos que van encima de las criaturas se dibujan siempre despues de los que van debajo, y esa banda la decide la bandera alwaysOnTop del objeto en items.xml, no el orden de la pila':
        '"{nombre}" cannot move past "{vecino}": items that go above creatures are always drawn after those that go below, and that band is set by the item\'s alwaysOnTop flag in items.xml, not by the stack order',
    'ahora "{nombre}" se dibuja debajo de "{vecino}"': 'now "{nombre}" is drawn below "{vecino}"',
    'ahora "{nombre}" se dibuja encima de "{vecino}"': 'now "{nombre}" is drawn above "{vecino}"',
    'no hay ningun objeto elegido que borrar: con nada en la mano, pincha una casilla para elegir lo que hay en ella':
        'there is no picked item to delete: with nothing in hand, click a tile to pick what is on it',
    'la casilla vuelve al suelo por defecto de la planta ({id})':
        'the tile goes back to the floor\'s default ground ({id})',
    'elige antes un objeto (no el suelo) de una casilla': 'first pick an item (not the ground) on a tile',

    // --- editor/js/editormap.js: respawns, monstruos y NPC ---------------------------------------
    'un monstruo no existe fuera de un respawn: elige el monstruo y pon primero su RESPAWN, que es el area donde vive':
        'a monster cannot exist outside a respawn: pick the monster and place its RESPAWN first, which is the area where it lives',
    'un monstruo no existe fuera de un respawn: esa casilla no esta dentro de ningun respawn, y para poner un monstruo fuera del area de su respawn habria que inventarse un formato que el motor no sabe leer':
        'a monster cannot exist outside a respawn: that tile is not inside any respawn, and placing a monster outside its respawn area would require a format the engine cannot read',
    'un monstruo no existe fuera de un respawn: esa casilla no esta dentro de ningun respawn, y para poner un monstruo fuera del area de su respawn habria que inventarse un formato que el motor no sabe leer  (el respawn de ({x},{y}) con radio {r} llega de ({x0},{y0}) a ({x1},{y1}))':
        'a monster cannot exist outside a respawn: that tile is not inside any respawn, and placing a monster outside its respawn area would require a format the engine cannot read  (the respawn at ({x},{y}) with radius {r} spans ({x0},{y0}) to ({x1},{y1}))',
    'el radio del respawn tiene que ser un numero de casillas igual o mayor que cero: {valor}':
        'the respawn radius must be a number of tiles, zero or more: {valor}',
    'el intervalo del respawn tiene que ser un numero de milisegundos mayor que cero: {valor}':
        'the respawn interval must be a number of milliseconds greater than zero: {valor}',
    'esa casilla ya tiene al NPC "{npc}": un NPC y un respawn no pueden compartir casilla, porque el monstruo apareceria encima de el':
        'that tile already has the NPC "{npc}": an NPC and a respawn cannot share a tile, because the monster would appear on top of it',
    'esa casilla ya esta dentro del respawn de ({x},{y},{z}) con radio {r}: para anadir otro monstruo a ese respawn, pulsa con la herramienta Monstruo dentro de su area; para redimensionarlo, eligelo y cambia su radio':
        'that tile is already inside the respawn at ({x},{y},{z}) with radius {r}: to add another monster to that respawn, click inside its area with the Monster tool; to resize it, pick it and change its radius',
    'esa casilla ya tiene al NPC "{npc}": el monstruo apareceria encima de el':
        'that tile already has the NPC "{npc}": the monster would appear on top of it',
    'esa casilla ya tiene al monstruo "{monstruo}" de este respawn: dos monstruos en la misma casilla se pisarian':
        'that tile already has the monster "{monstruo}" from this respawn: two monsters on the same tile would overlap',
    'para mover un monstruo hay que elegirlo antes: pincha en el o en su fila de la lista del respawn':
        'to move a monster, pick it first: click it or its row in the respawn list',
    'un respawn vive en una sola planta: este esta en la planta {z}':
        'a respawn lives on a single floor: this one is on floor {z}',
    'esa casilla ya tiene al NPC "{npc}"': 'that tile already has the NPC "{npc}"',
    'esa casilla ya tiene al monstruo "{monstruo}" del mismo respawn':
        'that tile already has the monster "{monstruo}" from the same respawn',
    'ese respawn ya no existe': 'that respawn no longer exists',
    'ese monstruo ya no esta en el respawn': 'that monster is no longer in the respawn',
    'se ha borrado tambien el respawn: se quedaba sin monstruos, y un respawn sin monstruos no se puede guardar':
        'the respawn was deleted too: it was left with no monsters, and a respawn with no monsters cannot be saved',
    'el intervalo tiene que ser un numero de milisegundos mayor que cero: {valor}':
        'the interval must be a number of milliseconds greater than zero: {valor}',
    'el radio tiene que ser un numero de casillas igual o mayor que cero: {valor}':
        'the radius must be a number of tiles, zero or more: {valor}',
    'no se puede poner el radio a {r}: el monstruo "{monstruo}" se quedaria fuera del respawn. Muevelos dentro del area nueva o quitalos antes':
        'cannot set the radius to {r}: the monster "{monstruo}" would be left outside the respawn. Move them inside the new area or remove them first',
    'no se puede poner el radio a {r}: los monstruos {lista} se quedarian fuera del respawn. Muevelos dentro del area nueva o quitalos antes':
        'cannot set the radius to {r}: the monsters {lista} would be left outside the respawn. Move them inside the new area or remove them first',
    'el NPC "{npc}" queda dentro del respawn; dentro de un respawn se ponen monstruos, asi que revisa que sea lo que quieres':
        'the NPC "{npc}" ends up inside the respawn; respawns are meant for monsters, so check that this is what you want',
    'un NPC necesita el nombre de uno de los definidos en data/npc/npcs.xml':
        'an NPC needs the name of one of those defined in data/npc/npcs.xml',
    'esa casilla ya tiene un NPC: dos NPC en la misma casilla se pisarian. Borra el que hay o elige otra casilla':
        'that tile already has an NPC: two NPCs on the same tile would overlap. Delete the existing one or pick another tile',
    'esa casilla ya tiene al monstruo "{monstruo}" del respawn de ({x},{y}): el NPC se pondria encima de el':
        'that tile already has the monster "{monstruo}" from the respawn at ({x},{y}): the NPC would be placed on top of it',
    'el radio de paseo del NPC tiene que ser un numero de casillas igual o mayor que cero, o quedar vacio para que mande npcs.xml: {valor}':
        'the NPC walk radius must be a number of tiles, zero or more, or left empty to use npcs.xml: {valor}',
    'el radio de paseo del NPC tiene que ser un numero de casillas igual o mayor que cero, o quedar vacio: {valor}':
        'the NPC walk radius must be a number of tiles, zero or more, or left empty: {valor}',
    'el NPC queda DENTRO del respawn de ({x},{y}): dentro de un respawn se ponen monstruos, pero el motor admite las dos cosas':
        'the NPC ends up INSIDE the respawn at ({x},{y}): respawns are meant for monsters, but the engine accepts both',
    'ese NPC ya no esta en el mapa': 'that NPC is no longer on the map',
    'en ({x},{y},{z}) no hay ningun respawn, ningun monstruo, ningun NPC ni ninguna zona protegida':
        'there is no respawn, monster, NPC or protected zone at ({x},{y},{z})',
    'esa zona protegida ya no existe': 'that protected zone no longer exists',

    // --- editor/js/editormap.js: arrastrar ------------------------------------------------------
    'ya se esta arrastrando algo: sueltalo antes de agarrar otra cosa':
        'something is already being dragged: drop it before grabbing something else',
    'la casilla ({x},{y},{z}) esta fuera del mapa: ahi no hay ningun objeto que agarrar':
        'tile ({x},{y},{z}) is outside the map: there is nothing there to grab',
    'en ({x},{y},{z}) no hay ningun objeto que arrastrar con un pincel de {tamano}: esa casilla solo tiene el suelo de su planta, y el suelo no se arrastra —se pinta—':
        'there is no item to drag at ({x},{y},{z}) with a {tamano} brush: that tile only has its floor\'s ground, and ground is not dragged —it is painted—',
    'en ({x},{y},{z}) no hay ningun respawn, ningun monstruo, ningun NPC ni ninguna zona protegida que arrastrar':
        'there is no respawn, monster, NPC or protected zone to drag at ({x},{y},{z})',
    'no se esta arrastrando nada': 'nothing is being dragged',
    'esa casilla esta fuera del mapa: si se suelta ahi, lo que se arrastra vuelve a su sitio':
        'that tile is outside the map: if you drop it there, what you are dragging goes back to its place',
    'lo que se arrastra vive en la planta {z}: cambia de planta y estara alli':
        'what you are dragging lives on floor {z}: switch to that floor and it will be there',
    'no se ha movido nada: se ha soltado en la misma casilla donde se agarro':
        'nothing was moved: it was dropped on the same tile it was grabbed from',
    'la zona protegida se queda donde estaba': 'the protected zone stays where it was',
    'esa casilla esta fuera del mapa: no se ha movido nada, los {n} objeto(s) siguen donde estaban':
        'that tile is outside the map: nothing was moved, the {n} item(s) stay where they were',
    'anadido a la pila de la casilla': 'added to the tile\'s stack',
    'se ha sustituido lo que habia en {n} casilla(s): Mayus lo anade a la pila en vez de sustituirla':
        'replaced what was on {n} tile(s): Shift adds to the stack instead of replacing it',
    '{n} objeto(s) se han quedado donde estaban porque su casilla destino cae fuera del mapa':
        '{n} item(s) stayed where they were because their target tile is outside the map',
    'movido(s) {n} objeto(s) a ({x},{y},{z})': 'moved {n} item(s) to ({x},{y},{z})',
    'no se puede mover ahi: el respawn se saldria del mapa, su centro caeria en ({x},{y},{z})':
        'cannot move there: the respawn would leave the map, its center would land at ({x},{y},{z})',
    'no se puede mover ahi: {monstruos} se saldria(n) del mapa, en ({x},{y},{z}). Un monstruo con casilla propia aparece donde dice su casilla, y esa casilla no existe':
        'cannot move there: {monstruos} would leave the map, at ({x},{y},{z}). A monster with its own tile appears on that tile, and that tile does not exist',
    'el monstruo "{nombre}"': 'the monster "{nombre}"',
    'los monstruos "{lista}" y "{ultimo}"': 'the monsters "{lista}" and "{ultimo}"',
    'no se puede mover ahi: su centro caeria dentro del respawn de ({x},{y},{z}) con radio {r}. Dos respawns anidados no se pueden leer: quedate con el borde fuera del otro, o mueve el respawn pequeno':
        'cannot move there: its center would land inside the respawn at ({x},{y},{z}) with radius {r}. Two nested respawns cannot be read: keep its edge outside the other one, or move the smaller respawn',
    'no se puede mover ahi: el monstruo "{monstruo}" caeria encima del NPC "{npc}", en ({x},{y})':
        'cannot move there: the monster "{monstruo}" would land on the NPC "{npc}", at ({x},{y})',
    'no se puede mover ahi: el NPC se saldria del mapa, en ({x},{y},{z})':
        'cannot move there: the NPC would leave the map, at ({x},{y},{z})',
    'no se puede mover ahi: esa casilla ya tiene al NPC "{npc}", y dos NPC en la misma casilla se pisarian':
        'cannot move there: that tile already has the NPC "{npc}", and two NPCs on the same tile would overlap',
    'no se puede mover ahi: esa casilla ya tiene al monstruo "{monstruo}" del respawn de ({x},{y}), y el NPC se pondria encima de el':
        'cannot move there: that tile already has the monster "{monstruo}" from the respawn at ({x},{y}), and the NPC would be placed on top of it',
    'no se puede mover ahi: {n} casilla(s) del bloque protegido caerian fuera del mapa (por ejemplo ({x},{y},{z})). Un bloque se mueve entero o no se mueve: recortarlo lo partiria en dos zonas':
        'cannot move there: {n} tile(s) of the protected block would fall outside the map (for example ({x},{y},{z})). A block moves whole or not at all: trimming it would split it into two zones',
    'no se ha movido nada: la zona sigue donde estaba': 'nothing was moved: the zone stays where it was',
    'zona protegida movida a ({x},{y},{z}): {n} casilla(s) con sus banderas y sus objetos':
        'protected zone moved to ({x},{y},{z}): {n} tile(s) with their flags and items',
    'anadida a lo que hubiera en el destino': 'added to whatever was at the destination',
    'se ha sustituido lo que habia en {n} casilla(s): Mayus lo anade en vez de sustituir':
        'replaced what was on {n} tile(s): Shift adds instead of replacing',
    'el monstruo sigue dentro de su respawn: el area llega de ({x0},{y0}) a ({x1},{y1})':
        'the monster stays inside its respawn: the area spans ({x0},{y0}) to ({x1},{y1})',
    'el respawn se ha llevado sus {n} monstruo, cada uno en su sitio dentro del area':
        'the respawn took its {n} monster along, in its place inside the area',
    'el respawn se ha llevado sus {n} monstruos, cada uno en su sitio dentro del area':
        'the respawn took its {n} monsters along, each in its place inside the area',
    'ojo: {monstruos} ya estaba fuera del area antes de moverla, y moverla no lo arregla: colocalo con la herramienta Monstruo':
        'note: {monstruos} was already outside the area before moving it, and moving it does not fix that: place it with the Monster tool',
    'el NPC "{npc}" queda dentro del respawn': 'the NPC "{npc}" ends up inside the respawn',

    // --- editor/js/editormap.js: compuestos ------------------------------------------------------
    'no cabe: la casilla ({x},{y},{z}) queda fuera del mapa': 'does not fit: tile ({x},{y},{z}) is outside the map',
    'no existe la plantilla «{id}»': 'template «{id}» does not exist',
    'configuración no válida: {problemas}': 'invalid configuration: {problemas}',
    'no hay ningún compuesto {uid}': 'there is no composite {uid}',
    'no hay ningún compuesto {uid} con plantilla conocida': 'there is no composite {uid} with a known template',

    // --- editor/js/marcadores.js: etiquetas del lienzo ---------------------------------------
    '1 casilla protegida': '1 protected tile',
    '{n} casillas protegidas': '{n} protected tiles',
    '{n} casillas protegidas  de ({x0},{y0}) a ({x1},{y1})': '{n} protected tiles  from ({x0},{y0}) to ({x1},{y1})',
    '{monstruos}  radio {r}  cada {t} s': '{monstruos}  radius {r}  every {t} s',
    '{monstruos}  radio {r}  cada ?': '{monstruos}  radius {r}  every ?',
    '{monstruos} ({n} en el area)  radio {r}  cada {t} s': '{monstruos} ({n} in the area)  radius {r}  every {t} s',
    '{monstruos} ({n} en el area)  radio {r}  cada ?': '{monstruos} ({n} in the area)  radius {r}  every ?',
    '{nombre}  radio {r} (npcs.xml)': '{nombre}  radius {r} (npcs.xml)',
    '{nombre}  radio {r} (mapa)': '{nombre}  radius {r} (map)',
    'npc {etiqueta} en ({x},{y},{z})': 'npc {etiqueta} at ({x},{y},{z})',
    'monstruo {etiqueta} del respawn ({x},{y},{z})': 'monster {etiqueta} of the respawn ({x},{y},{z})',
    'respawn {etiqueta} en ({x},{y},{z})': 'respawn {etiqueta} at ({x},{y},{z})',

    // --- editor/js/herramientas.js: barra, historial y pinceles ------------------------------
    'pinceles con avisos: {lista}': 'brushes with warnings: {lista}',
    'cambio': 'change',
    'deshecho: {nombre}': 'undone: {nombre}',
    'no hay nada que deshacer': 'nothing to undo',
    'rehecho: {nombre}': 'redone: {nombre}',
    'no hay nada que rehacer': 'nothing to redo',
    'pincel cuadrado de {tamano}': '{tamano} square brush',
    'pincel circulo de {tamano}': '{tamano} circle brush',
    'bordes automáticos activados': 'automatic borders on',
    'bordes automáticos desactivados': 'automatic borders off',
    'puerta puesta ({alineacion})': 'door placed ({alineacion})',
    'ventana puesta ({alineacion})': 'window placed ({alineacion})',
    'salida de «{casa}» en ({x},{y},{z})': 'exit of «{casa}» at ({x},{y},{z})',
    'templo de «{ciudad}» en ({x},{y},{z})': 'temple of «{ciudad}» at ({x},{y},{z})',
    'waypoint «{nombre}» en ({x},{y},{z})': 'waypoint «{nombre}» at ({x},{y},{z})',
    'selección de {ancho}x{alto} en la planta {z}: Ctrl+C copia, Ctrl+X corta, Supr borra, Ctrl+B borderiza':
        '{ancho}x{alto} selection on floor {z}: Ctrl+C copies, Ctrl+X cuts, Del deletes, Ctrl+B adds borders',
    'elige antes una casa en la paleta Casas': 'first pick a house in the Houses palette',
    'quitadas {n} casilla(s) de la casa {id}': 'removed {n} tile(s) from house {id}',
    'marcadas {n} casilla(s) de la casa {id}': 'marked {n} tile(s) as house {id}',
    'borradas {n} casilla(s)': 'erased {n} tile(s)',
    '{pincel} en {n} casilla(s)': '{pincel} on {n} tile(s)',
    '{pincel} en {n} casilla(s) con bordes': '{pincel} on {n} tile(s) with borders',
    'seleccionar: arrastra un rectángulo en el mapa': 'select: drag a rectangle on the map',
    'seleccionar: arrastra para marcar un rectángulo': 'select: drag to mark a rectangle',
    'no hay selección en esta planta: usa «Seleccionar» (S)': 'no selection on this floor: use «Select» (S)',
    'copiadas {n} casilla(s) de {ancho}x{alto}. Ctrl+V para pegar': 'copied {n} tile(s) from {ancho}x{alto}. Ctrl+V to paste',
    'cortadas {n} casilla(s): Ctrl+V para pegarlas': 'cut {n} tile(s): Ctrl+V to paste them',
    'no hay nada copiado': 'nothing copied',
    'pegando {ancho}x{alto}: clic para pegar (esquina de arriba a la izquierda), Escape para soltar':
        'pasting {ancho}x{alto}: click to paste (top-left corner), Escape to drop',
    'pegar: clic donde va la esquina de arriba a la izquierda': 'paste: click where the top-left corner goes',
    'pegadas {n} casilla(s) en ({x},{y},{z})': 'pasted {n} tile(s) at ({x},{y},{z})',
    'no hay selección en esta planta': 'no selection on this floor',
    'borradas {n} casilla(s) de la selección': 'erased {n} tile(s) from the selection',
    'borderizado la selección: {n} casilla(s) cambiadas': 'added borders to the selection: {n} tile(s) changed',
    'borderizado lo visible: {n} casilla(s) cambiadas': 'added borders to the visible area: {n} tile(s) changed',
    'aleatorizado: {n} suelo(s) cambiados': 'randomized: {n} ground(s) changed',
    'aleatorizado: {n} suelo(s) cambiados (los pinceles de suelo necesitan varias variantes)':
        'randomized: {n} ground(s) changed (ground brushes need several variants)',
    'para rellenar, elige antes un pincel de suelo (Terreno) o un suelo de la paleta':
        'to fill, first pick a ground brush (Terrain) or a ground from the palette',
    'cubo de {suelo}: clic en una zona del mismo suelo': 'fill with {suelo}: click an area of the same ground',
    'rellenar con {suelo}: clic en el mapa': 'fill with {suelo}: click on the map',
    'rellenadas {n} casilla(s) con {suelo}': 'filled {n} tile(s) with {suelo}',
    'rellenadas {n} casilla(s) con {suelo} (tope de 10.000: el resto no)':
        'filled {n} tile(s) with {suelo} (10,000 limit: the rest was not filled)',
    '{pincel} — clic o arrastrar para pintar con el pincel de {tamano}; clic derecho borra':
        '{pincel} — click or drag to paint with the {tamano} brush; right-click erases',
    '{pincel} — clic o arrastrar para pintar con el pincel de {tamano}; clic derecho borra; los bordes se ponen solos':
        '{pincel} — click or drag to paint with the {tamano} brush; right-click erases; borders are added automatically',
    'pincel: {nombre}': 'brush: {nombre}',
    'Suelos (con borde)': 'Grounds (with borders)',
    'Muros': 'Walls',
    'Alfombras': 'Carpets',
    'Mesas': 'Tables',
    'Puertas y ventanas': 'Doors and windows',
    'Puerta': 'Door',
    'Ventana': 'Window',
    'Clic sobre un muro: la puerta toma la alineación del muro': 'Click on a wall: the door takes the wall\'s alignment',
    'Clic sobre un muro: la ventana toma la alineación del muro': 'Click on a wall: the window takes the wall\'s alignment',
    'Puerta: clic sobre un muro': 'Door: click on a wall',
    'Ventana: clic sobre un muro': 'Window: click on a wall',
    'No hay pinceles: genera los de prueba con node tools/generar-pinceles.mjs o escribe data/editor/pinceles.json (ver docs/MAPAS.md).':
        'No brushes: generate the test ones with node tools/generar-pinceles.mjs or write data/editor/pinceles.json (see docs/MAPAS.md).',

    // --- editor/js/herramientas.js: casas, ciudades y waypoints ----------------------------
    '+ Casa': '+ House',
    'Nombre de la casa nueva:': 'Name of the new house:',
    'casa «{nombre}» creada (#{id}): marca sus casillas con «Casillas»':
        'house «{nombre}» created (#{id}): mark its tiles with «Tiles»',
    'Casillas': 'Tiles',
    'elige una casa': 'pick a house',
    'casillas de la casa {id}: pinta con el pincel; clic derecho las quita':
        'tiles of house {id}: paint with the brush; right-click removes them',
    'Pintar las casillas de la casa elegida (derecho: quitar)': 'Paint the tiles of the selected house (right-click: remove)',
    'Salida': 'Exit',
    'salida de la casa {id}: clic fuera de la casa': 'exit of house {id}: click outside the house',
    'La casilla de salida de la casa (fuera de ella)': 'The house\'s exit tile (outside it)',
    '{n} cas.': '{n} tiles',
    'sin ciudad': 'no town',
    'Casa #{id}': 'House #{id}',
    'Nombre': 'Name',
    'Alquiler': 'Rent',
    'Ciudad': 'Town',
    'Salida: {posicion}': 'Exit: {posicion}',
    'sin poner': 'not set',
    'Ir': 'Go',
    'Borrar casa': 'Delete house',
    '¿Borrar la casa «{nombre}»? Sus casillas dejan de ser de casa.':
        'Delete the house «{nombre}»? Its tiles will no longer belong to a house.',
    'casa borrada; {n} casilla(s) liberadas': 'house deleted; {n} tile(s) freed',
    'No hay casas. «+ Casa» crea una; después «Casillas» pinta su interior y «Salida» marca la puerta de fuera.':
        'No houses. «+ House» creates one; then «Tiles» paints its interior and «Exit» marks the outside door.',
    '+ Ciudad': '+ Town',
    'Nombre de la ciudad nueva:': 'Name of the new town:',
    'ciudad «{nombre}» creada con el templo en el centro de la vista: «Templo» lo coloca':
        'town «{nombre}» created with its temple at the center of the view: «Temple» places it',
    'Templo': 'Temple',
    'elige una ciudad': 'pick a town',
    'templo de la ciudad {id}: clic en el mapa': 'temple of town {id}: click on the map',
    'Colocar el templo (donde se reaparece) de la ciudad elegida': 'Place the temple (where players respawn) of the selected town',
    'templo {nombre}': 'temple {nombre}',
    'Borrar ciudad': 'Delete town',
    'ciudad borrada': 'town deleted',
    'Doble clic en una ciudad lleva a su templo.': 'Double-click a town to go to its temple.',
    'Nombre del waypoint:': 'Waypoint name:',
    'waypoint «{nombre}»: clic donde va': 'waypoint «{nombre}»: click where it goes',
    'waypoint «{nombre}»: clic en el mapa para colocarlo': 'waypoint «{nombre}»: click on the map to place it',
    'Mover': 'Move',
    'elige un waypoint': 'pick a waypoint',
    'mover el waypoint «{nombre}»: clic en el mapa': 'move waypoint «{nombre}»: click on the map',
    'Quitar': 'Remove',
    '«temple» es donde aparecen los jugadores nuevos. ¿Quitarlo?': '«temple» is where new players appear. Remove it?',
    'waypoint quitado': 'waypoint removed',

    // --- editor/js/herramientas.js: diálogos (ir a, buscar, reemplazar, estadísticas, limpiar) ---
    'Ir a la posición (x, y, z):': 'Go to position (x, y, z):',
    'posición no válida: escribe x, y, z': 'invalid position: type x, y, z',
    'en ({posicion})': 'at ({posicion})',
    'Buscar (Ctrl+F)': 'Find (Ctrl+F)',
    'Id de objeto': 'Item id',
    'Texto escrito': 'Written text',
    'solo en la selección': 'only in the selection',
    'Buscar': 'Find',
    '{n} resultado(s)': '{n} result(s)',
    '{n} resultado(s) (se enseñan 300)': '{n} result(s) (showing 300)',
    'Reemplazar objetos (Ctrl+Shift+F)': 'Replace items (Ctrl+Shift+F)',
    'Cambiar el objeto': 'Replace item',
    'por el objeto': 'with item',
    'Se aplica en la SELECCIÓN.': 'Applies to the SELECTION.',
    'Sin selección: se aplica en TODO el mapa.': 'No selection: applies to the WHOLE map.',
    'Reemplazar': 'Replace',
    'el objeto {id} no existe en items.xml': 'item {id} does not exist in items.xml',
    'reemplazados {n} objeto(s) {origen} por {destino}': 'replaced {n} item(s) {origen} with {destino}',
    'Estadísticas del mapa (F8)': 'Map statistics (F8)',
    'Tamaño': 'Size',
    'Casillas explícitas': 'Explicit tiles',
    'Plantas usadas': 'Floors used',
    'Objetos': 'Items',
    'Con atributos': 'With attributes',
    'Tipos distintos': 'Distinct types',
    'Respawns / monstruos': 'Respawns / monsters',
    'Compuestos': 'Composites',
    'Ciudades': 'Towns',
    'Casas (casillas)': 'Houses (tiles)',
    'Los más usados': 'Most used',
    '{n} vez/veces': '{n} time(s)',
    'Limpieza del mapa': 'Map cleanup',
    'Limpiar casas inválidas': 'Clean up invalid houses',
    '{n} casilla(s) de casas que ya no existen, liberadas': 'freed {n} tile(s) of houses that no longer exist',
    'Casillas marcadas con una casa que no está en la lista': 'Tiles marked with a house that is not in the list',
    'Quitar todos los objetos con el id': 'Remove all items with id',
    'quitados {n} objeto(s) {id} de la selección': 'removed {n} item(s) {id} from the selection',
    'quitados {n} objeto(s) {id} del mapa': 'removed {n} item(s) {id} from the map',

    // --- editor/js/edicion.js: motivos de búsqueda y problemas ------------------------------
    'suelo': 'ground',
    'objeto': 'item',
    'texto': 'text',
    'atributos': 'attributes',
    'la ciudad tiene {n} casa(s): bórralas o múdalas antes': 'the town has {n} house(s): delete or move them first',
    'no hay ninguna ciudad {id}': 'there is no town {id}',
    'no hay ninguna casa {id}': 'there is no house {id}',
    'elige antes una casa': 'pick a house first',
    'la salida no puede estar dentro de una casa': 'the exit cannot be inside a house',
    'el waypoint necesita un nombre': 'the waypoint needs a name',
    'no hay ningún waypoint «{nombre}»': 'there is no waypoint «{nombre}»',

    // --- editor/js/pinceles.js (lo enseña herramientas.js): puertas, ventanas y avisos ---------
    'en ({x},{y},{z}) no hay muro: una puerta va en un muro': 'there is no wall at ({x},{y},{z}): a door goes on a wall',
    'en ({x},{y},{z}) no hay muro: una ventana va en un muro': 'there is no wall at ({x},{y},{z}): a window goes on a wall',
    'el muro «{muro}» no tiene puertas': 'the wall «{muro}» has no doors',
    'el muro «{muro}» no tiene ventanas': 'the wall «{muro}» has no windows',
    'no es un archivo jetyum-pinceles': 'not a jetyum-pinceles file',
    '{donde}: el objeto {id} no existe en items.xml': '{donde}: item {id} does not exist in items.xml',
    'el borde {id} no tiene piezas': 'border {id} has no pieces',
    'suelo {id} repetido': 'duplicate ground {id}',
    'el suelo {id} no tiene objetos': 'ground {id} has no items',
    'el suelo {id} usa el borde {borde}, que no existe': 'ground {id} uses border {borde}, which does not exist',
    'el muro {id} necesita al menos la pieza horizontal o el poste': 'wall {id} needs at least the horizontal piece or the post',
    '{id}: necesita la pieza «{pieza}»': '{id}: needs the «{pieza}» piece',

    // --- data/editor/pinceles.json: los nombres de los pinceles (paleta Terreno) -------------
    'Adoquín (OTSP)': 'Cobblestone (OTSP)',
    'Agua (OTSP)': 'Water (OTSP)',
    'Agua': 'Water',
    'Alfombra roja': 'Red carpet',
    'Arena (OTSP)': 'Sand (OTSP)',
    'Arenisca (OTSP)': 'Sandstone (OTSP)',
    'Estuco amarillo (OTSP)': 'Yellow stucco (OTSP)',
    'Estuco beige (OTSP)': 'Beige stucco (OTSP)',
    'Estuco blanco (OTSP)': 'White stucco (OTSP)',
    'Estuco crema (OTSP)': 'Cream stucco (OTSP)',
    'Estuco naranja (OTSP)': 'Orange stucco (OTSP)',
    'Estuco rosa (OTSP)': 'Pink stucco (OTSP)',
    'Grava (OTSP)': 'Gravel (OTSP)',
    'Hielo (OTSP)': 'Ice (OTSP)',
    'Hierba (OTSP)': 'Grass (OTSP)',
    'Hierba': 'Grass',
    'Losa gris (OTSP)': 'Grey flagstone (OTSP)',
    'Madera (OTSP)': 'Wood (OTSP)',
    'Madera oscura (OTSP)': 'Dark wood (OTSP)',
    'Mesa de madera': 'Wooden table',
    'Muro de piedra': 'Stone wall',
    'Mármol (OTSP)': 'Marble (OTSP)',
    'Mármol blanco (OTSP)': 'White marble (OTSP)',
    'Oro (OTSP)': 'Gold (OTSP)',
    'Piedra gris (OTSP)': 'Grey stone (OTSP)',
    'Piedra negra (OTSP)': 'Black stone (OTSP)',
    'Piedra oscura (OTSP)': 'Dark stone (OTSP)',
    'Piedra plateada (OTSP)': 'Silver stone (OTSP)',
    'Piedra redondeada (OTSP)': 'Rounded stone (OTSP)',
    'Piedra tallada (OTSP)': 'Carved stone (OTSP)',
    'Roca (OTSP)': 'Rock (OTSP)',
    'Suelo de piedra': 'Stone floor',
    'Tablones (OTSP)': 'Planks (OTSP)',
    'Tarima (OTSP)': 'Floorboards (OTSP)',
    'Tierra (OTSP)': 'Dirt (OTSP)',
    'Tierra': 'Dirt'
};
