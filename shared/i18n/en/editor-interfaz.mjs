/**
 * Inglés: la interfaz que ata en la pestaña Mapa las cuatro piezas nuevas del editor —la vista de
 * varias plantas, el modo de selección, el diagnóstico y los archivos de mapa (nuevo, guardar
 * como, propiedades y copias de seguridad)—: los botones y desplegables de `editor/index.html` y
 * los diálogos y mensajes que compone `editor/js/main.js`.
 *
 * Los textos de las piezas en sí (los mensajes de la API, del panel de diagnóstico, de la
 * selección) están en sus diccionarios: `editor-mapas`, `editor-diagnostico`, `editor-seleccion` y
 * `editor-plantas`. La clave es la frase en español TAL CUAL sale, y los huecos van entre llaves:
 * ver `shared/js/i18n.mjs`.
 */
export default {
    // -----------------------------------------------------------------------
    // index.html: los archivos de mapa, junto al selector
    // -----------------------------------------------------------------------
    'Nuevo mapa': 'New map',
    'Nuevo mapa: crear un archivo de mapa vacío en data/world, con su tamaño y su suelo':
        'New map: create an empty map file in data/world, with its size and its ground',
    'Guardar como': 'Save as',
    'Guardar como: escribir el mapa, con lo que no se haya guardado, en un archivo nuevo; el original no se toca':
        'Save as: write the map, including anything not yet saved, to a new file; the original is left untouched',
    'Propiedades del mapa': 'Map properties',
    'Propiedades del mapa: nombre, descripción, tamaño y suelos por defecto':
        'Map properties: name, description, size and default grounds',
    'Copias de seguridad': 'Backups',
    'Copias de seguridad: las últimas versiones guardadas del mapa, para volver a una':
        'Backups: the latest saved versions of the map, to go back to one',

    // -----------------------------------------------------------------------
    // index.html: el modo de selección
    // -----------------------------------------------------------------------
    // El botón dice el modo puesto en la primera línea y explica los tres en las otras (cada
    // línea se traduce por separado).
    'Modo de selección': 'Selection mode',
    'Modo de selección: sólo la planta actual (clic para cambiar)': 'Selection mode: current floor only (click to change)',
    'Modo de selección: esta planta y las de abajo (clic para cambiar)':
        'Selection mode: this floor and the ones below (click to change)',
    'Modo de selección: las plantas visibles (clic para cambiar)': 'Selection mode: visible floors (click to change)',
    'Planta actual — sólo la planta que se ve': 'Current floor — only the floor in view',
    'Y las de abajo — esta planta y las de debajo (al aire libre, hasta la 7)':
        'And those below — this floor and the ones below it (above ground, down to 7)',
    'Plantas visibles — las que se ven desde aquí (al aire libre, hasta la 7; bajo tierra, esta y dos más)':
        'Visible floors — the ones visible from here (above ground, down to 7; underground, this one and two more)',
    'Planta actual': 'Current floor',
    'sólo la planta que se ve': 'only the floor in view',
    'Y las de abajo': 'And those below',
    'esta planta y las de debajo (al aire libre, hasta la 7)': 'this floor and the ones below it (above ground, down to 7)',
    'Plantas visibles': 'Visible floors',
    'las que se ven desde aquí (al aire libre, hasta la 7; bajo tierra, esta y dos más)':
        'the ones visible from here (above ground, down to 7; underground, this one and two more)',

    // -----------------------------------------------------------------------
    // index.html: el diagnóstico y las plantas a la vista
    // -----------------------------------------------------------------------
    'Diagnóstico': 'Diagnostics',
    'Diagnóstico del mapa (F7): teleports rotos, uniqueId repetidos, casillas sin suelo, objetos que ya no existen, casas sin salida... con un clic para ir a cada uno':
        'Map diagnostics (F7): broken teleports, duplicate uniqueIds, tiles without ground, items that no longer exist, houses without an exit... with one click to go to each',
    'Las plantas a la vista': 'The floors in view',
    'Plantas de abajo: ver bajo la que se edita las de debajo, como en el juego (P). Al aire libre se baja hasta la 7, y bajo tierra se ven dos más':
        'Lower floors: show the floors below the one being edited, as in the game (P). Above ground it goes down to 7, and underground two more are shown',
    'Sombra: oscurecer las plantas de abajo, más cuanto más hondas, para distinguirlas de la que se edita (Q)':
        'Shade: darken the lower floors, the deeper the darker, to tell them apart from the one being edited (Q)',
    'Planta de arriba: ver la de encima, transparente, sobre la que se edita (Ctrl+L)':
        'Upper floor: show the floor above, transparent, over the one being edited (Ctrl+L)',

    // La ayuda de la barra de estado, con los atajos nuevos al final.
    'izquierdo pinta · derecho BORRA EL BLOQUE del pincel · Mayús añade a la pila al soltar · sin nada en la mano, el izquierdo elige del mapa y ARRASTRA lo que hay en la casilla, y el derecho abre el menú de la casilla (Ctrl+derecho, con cualquier herramienta) · con «Elegir», el izquierdo arrastra el respawn (con sus monstruos), el NPC o la zona protegida · Escape suelta o cancela el arrastre · [ y ] el pincel · rueda zoom · Ctrl+rueda planta · flechas mueven la vista (Mayús, más deprisa) · botón central, Espacio+arrastrar o Alt+derecho mueve la vista · 0 ver todo · P plantas de abajo · Q sombra · Ctrl+L planta de arriba · F7 diagnóstico':
        'left click paints · right click ERASES THE BRUSH BLOCK · Shift adds to the stack on release · with nothing in hand, left click picks from the map and DRAGS what is on the tile, and right click opens the tile menu (Ctrl+right, with any tool) · with "Pick", left click drags the respawn (with its monsters), the NPC or the protected zone · Escape drops or cancels the drag · [ and ] the brush · wheel zoom · Ctrl+wheel floor · arrows move the view (Shift, faster) · middle button, Space+drag or Alt+right moves the view · 0 show all · P lower floors · Q shade · Ctrl+L upper floor · F7 diagnostics',

    // -----------------------------------------------------------------------
    // main.js: los diálogos y sus campos
    // -----------------------------------------------------------------------
    'Los suelos de items.xml (isGround); también se puede escribir el número al lado':
        'The grounds in items.xml (isGround); you can also type the number next to it',
    '— elegir un suelo —': '— choose a ground —',
    'El id del suelo en items.xml; vacío, ninguno': 'The ground id in items.xml; empty, none',
    'y {n} más': 'and {n} more',
    'quedarían fuera: {lista}': 'would be left outside: {lista}',
    'no hay ningún mapa abierto': 'no map is open',

    // Nuevo mapa
    'Nombre del archivo': 'File name',
    'Se guarda como data/world/<nombre>.map.json': 'It is saved as data/world/<name>.map.json',
    'letras sin acentos, números, - y _': 'unaccented letters, digits, - and _',
    'Ancho (casillas)': 'Width (tiles)',
    'Alto (casillas)': 'Height (tiles)',
    'Plantas': 'Floors',
    'Suelo por defecto (planta 7)': 'Default ground (floor 7)',
    'Descripción (opcional)': 'Description (optional)',
    'El mapa se crea vacío, con una ciudad y su templo en el centro, y se abre.':
        'The map is created empty, with a town and its temple in the centre, and then opened.',
    'Crear y abrir': 'Create and open',
    'Hay {n} cambio(s) sin guardar en el mapa abierto. ¿Abrir el mapa nuevo y perderlos?':
        'There are {n} unsaved change(s) in the open map. Open the new map and lose them?',
    'creando el mapa {nombre}...': 'creating map {nombre}...',
    'no se creó el mapa: {error}': 'the map was not created: {error}',
    'mapa nuevo: {nombre} ({ancho}x{alto})': 'new map: {nombre} ({ancho}x{alto})',

    // Guardar como
    'Nombre del archivo nuevo': 'New file name',
    'Se guarda como data/world/<nombre>.map.json; no puede ser el de un mapa que ya exista':
        'It is saved as data/world/<name>.map.json; it cannot be the name of an existing map',
    'Los {n} cambio(s) sin guardar van a la copia; el original se queda como está en el disco.':
        'The {n} unsaved change(s) go into the copy; the original stays as it is on disk.',
    'Se copia el archivo tal y como está guardado; el original no se toca.':
        'The file is copied exactly as saved; the original is not touched.',
    'guardando como {nombre}...': 'saving as {nombre}...',
    'no se guardó como {nombre}: {error}': 'not saved as {nombre}: {error}',
    'guardado como {nombre}: el original {viejo} no se ha tocado':
        'saved as {nombre}: the original {viejo} has not been touched',

    // Propiedades del mapa
    'no se pudieron leer las propiedades: {error}': 'the properties could not be read: {error}',
    'Nombre (cambiarlo renombra el archivo y sus copias)': 'Name (changing it renames the file and its backups)',
    'Tamaño permitido: de {min} a {max} casillas; plantas, hasta {p}.':
        'Allowed size: {min} to {max} tiles; floors, up to {p}.',
    'Suelo por defecto de la planta {z}': 'Default ground of floor {z}',
    'Suelo de respaldo: el de las plantas de la 7 hacia abajo que no tienen suelo propio (vacío: ninguno)':
        'Fallback ground: the one for floors 7 and below that have no ground of their own (empty: none)',
    'Encoger nunca borra: si algo quedara fuera, no se cambia nada y se dice qué. Cambiar un suelo sólo cambia el terreno sin pintar.':
        'Shrinking never deletes: if anything would be left outside, nothing changes and you are told what. Changing a ground only changes the unpainted terrain.',
    'no has cambiado nada': 'you have not changed anything',
    'Hay {n} cambio(s) sin guardar. Cambiar las propiedades vuelve a abrir el mapa desde el disco y se perderían. ¿Seguir?':
        'There are {n} unsaved change(s). Changing the properties reopens the map from disk and they would be lost. Continue?',
    'no se cambiaron las propiedades: {error}': 'the properties were not changed: {error}',
    'propiedades guardadas: {cambios}': 'properties saved: {cambios}',

    // Copias de seguridad
    'no se pudieron listar las copias: {error}': 'the backups could not be listed: {error}',
    'Antes de cada guardado se copia el archivo de antes; se quedan las {n} últimas.':
        'Before every save the previous file is copied; the latest {n} are kept.',
    'Todavía no hay ninguna copia: se hace una cada vez que se guarda.':
        'There are no backups yet: one is made every time the map is saved.',
    'Restaurar': 'Restore',
    'Volver el mapa a esta copia (antes se copia cómo está ahora, así que también se puede deshacer)':
        'Return the map to this backup (the current state is backed up first, so this can be undone too)',
    '¿Volver el mapa {nombre} a la copia del {fecha}? Antes se guarda una copia de cómo está ahora.':
        'Return map {nombre} to the backup from {fecha}? The current state is backed up first.',
    '¿Volver el mapa {nombre} a la copia del {fecha}? Antes se guarda una copia de cómo está ahora. Los {n} cambio(s) sin guardar se perderán.':
        'Return map {nombre} to the backup from {fecha}? The current state is backed up first. The {n} unsaved change(s) will be lost.',
    'restaurando la copia {archivo}...': 'restoring backup {archivo}...',
    'no se restauró la copia: {error}': 'the backup was not restored: {error}',
    'mapa {nombre} restaurado a la copia {archivo}': 'map {nombre} restored to backup {archivo}',

    // -----------------------------------------------------------------------
    // main.js: el diagnóstico y las plantas a la vista
    // -----------------------------------------------------------------------
    'diagnóstico: ningún problema': 'diagnostics: no problems',
    'diagnóstico: {e} error(es) y {a} aviso(s)': 'diagnostics: {e} error(s) and {a} warning(s)',
    'plantas de abajo: no se ven': 'lower floors: hidden',
    'plantas de abajo: se ven': 'lower floors: shown',
    'plantas de abajo: se ven (desde la planta 7 no hay nada debajo que ver, como en el juego)':
        'lower floors: shown (from floor 7 there is nothing below to see, as in the game)',
    'sombra de las plantas de abajo: quitada': 'shade of the lower floors: off',
    'sombra de las plantas de abajo: puesta': 'shade of the lower floors: on',
    'sombra de las plantas de abajo: puesta (sólo se nota con «Plantas de abajo» encendido)':
        'shade of the lower floors: on (only visible with "Lower floors" switched on)',
    'planta de arriba: se ve en fantasma': 'upper floor: shown as a ghost',
    'planta de arriba: no se ve': 'upper floor: hidden'
};
