/**
 * Inglés: la selección del editor de mapas al estilo RME (sumar y restar con Mayús y Ctrl, mover
 * arrastrando, los modos de varias plantas y el fantasma del pegado). Ver `editor/js/herramientas.js`.
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves: ver
 * `shared/js/i18n.mjs`.
 */
export default {
    'seleccionar: arrastra un rectángulo; Mayús suma, Ctrl resta, arrastrar lo seleccionado lo mueve':
        'select: drag a rectangle; Shift adds, Ctrl removes, dragging the selection moves it',
    'modo de selección: sólo la planta actual': 'selection mode: current floor only',
    'modo de selección: esta planta y las de debajo (hasta la 7 al aire libre)':
        'selection mode: this floor and the ones below (down to 7 above ground)',
    'modo de selección: las plantas visibles': 'selection mode: visible floors',
    'arrastre cancelado': 'drag cancelled',
    'moviendo la selección: suelta donde va (Escape cancela)': 'moving the selection: release where it goes (Escape cancels)',
    'selección vacía': 'empty selection',
    'selección de {n} casilla(s) ({ancho}x{alto}) en la planta {z}: Mayús suma, Ctrl resta, arrastrar la mueve; Ctrl+C copia, Ctrl+X corta, Supr borra':
        'selection of {n} tile(s) ({ancho}x{alto}) on floor {z}: Shift adds, Ctrl removes, dragging moves it; Ctrl+C copies, Ctrl+X cuts, Del deletes',
    'selección de {n} casilla(s) ({ancho}x{alto}) en las plantas {z0} a {z1}: Mayús suma, Ctrl resta, arrastrar la mueve; Ctrl+C copia, Ctrl+X corta, Supr borra':
        'selection of {n} tile(s) ({ancho}x{alto}) on floors {z0} to {z1}: Shift adds, Ctrl removes, dragging moves it; Ctrl+C copies, Ctrl+X cuts, Del deletes',
    'movida la selección ({d}): {n} casilla(s)': 'selection moved ({d}): {n} tile(s)',
    'movida la selección ({d}): {n} casilla(s) y {m} marcador(es)': 'selection moved ({d}): {n} tile(s) and {m} marker(s)',
    'copiadas {n} casilla(s) de {ancho}x{alto} en {p} plantas. Ctrl+V para pegar':
        'copied {n} tile(s) from {ancho}x{alto} on {p} floors. Ctrl+V to paste',
    'pegando {ancho}x{alto} en {p} plantas: clic para pegar (esquina de arriba a la izquierda), Escape para soltar':
        'pasting {ancho}x{alto} on {p} floors: click to paste (top-left corner), Escape to drop',
    'y {n} planta(s) más': 'and {n} more floor(s)',

    // edicion.js: mover la selección
    'no hay selección que mover': 'there is no selection to move',
    'no se puede mover ahí: la casilla ({x},{y},{z}) quedaría fuera del mapa':
        'cannot move there: tile ({x},{y},{z}) would fall outside the map',
    'respawn de ({x},{y},{z}): {problema}': 'spawn at ({x},{y},{z}): {problema}',
    'NPC «{nombre}»: {problema}': 'NPC «{nombre}»: {problema}'
};
