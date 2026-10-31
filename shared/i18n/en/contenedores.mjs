/**
 * Inglés: los CONTENEDORES ANIDADOS (una bolsa dentro de tu mochila, una mochila dentro de un
 * cuerpo). Lo que dice el motor al mover y abrir (engine/net/session.js) y lo que pinta el cliente en
 * las ventanas y en el panel de la mochila (client/jetyum/js/contenedor.js, panels.js).
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves: ver
 * `shared/js/i18n.mjs`. Lo registra `shared/i18n/juego.mjs`.
 */
export default {
    // --- engine/net/session.js: mover dentro de un contenedor ------------------------------
    'No puedes meter un contenedor dentro de sí mismo.': 'You cannot put a container inside itself.',
    'No caben más contenedores unos dentro de otros: como mucho {n}.':
        'No more containers fit one inside another: {n} at most.',
    'No cabe: ese contenedor esta lleno (tiene {n} huecos).':
        'It does not fit: that container is full (it has {n} slots).',

    // --- client/jetyum/js/contenedor.js: la ventana de un contenedor -------------------------
    '{objeto} (arrástralo para moverlo; clic derecho: abrirlo; los dos botones: mirarlo)':
        '{objeto} (drag to move it; right click: open it; both buttons: look at it)',
    'Llevas esto: arrastra aquí para meter algo dentro.':
        'You carry this: drag here to put something inside.',

    // --- client/jetyum/js/panels.js: una bolsa dentro de la mochila ------------------------
    '{objeto} (arrastra para moverlo; clic derecho: abrirla; suelta algo encima para meterlo dentro)':
        '{objeto} (drag to move it; right click: open it; drop something on it to put it inside)'
};
