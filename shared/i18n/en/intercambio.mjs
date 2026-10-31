/**
 * Inglés: el INTERCAMBIO ENTRE JUGADORES (el «Trade with...» de Tibia). Lo que dice el motor al
 * ofrecer, aceptar y cancelar (engine/world/intercambio.js), que en inglés son las frases de TFS, y lo
 * que pinta el cliente: la ventana (client/jetyum/js/intercambio.js) y el menú de un objeto con su
 * cruz para elegir con quién (client/jetyum/js/menuobjeto.js, main.js).
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves: ver
 * `shared/js/i18n.mjs`. Lo registra `shared/i18n/juego.mjs`.
 */
export default {
    // --- engine/world/intercambio.js: ofrecer -------------------------------------------------
    '{nombre} quiere comerciar contigo.': '{nombre} wants to trade with you.',
    '{nombre} te pide que te acerques.': '{nombre} tells you to move closer.',
    'No puedes comerciar contigo mismo.': 'Sorry, you cannot trade with yourself.',
    'Ese jugador no está.': 'That player is not here.',
    'Ya estás comerciando.': 'You are already trading.',
    'Ese jugador ya está comerciando.': 'This player is already trading.',
    'Ese objeto ya se está comerciando.': 'This item is already being traded.',
    'No puedes comerciar con más de 100 objetos.': 'You can not trade more than 100 items.',
    'No puedes comerciar con eso.': 'You cannot trade this item.',
    'No tienes eso.': 'You do not have that.',

    // --- engine/world/intercambio.js: aceptar, cancelar ----------------------------------------
    'Intercambio cancelado.': 'Trade cancelled.',
    'Intercambio completado.': 'Trade completed.',
    'No tienes capacidad suficiente para llevar {objeto}: pesa {peso} y te quedarían {libre} libres.':
        'You do not have enough capacity to carry {objeto}: it weighs {peso} and you would have {libre} free.',
    'No tienes sitio para llevar {objeto}.': 'You do not have enough room to carry {objeto}.',
    '{nombre} no puede llevar lo que le ofreces.': '{nombre} cannot carry what you are offering.',

    // --- client/jetyum/js/intercambio.js: la ventana -------------------------------------------
    'Intercambio con {nombre}': 'Trade with {nombre}',
    'Tu oferta': 'Your offer',
    'La de {nombre}': "{nombre}'s offer",
    'Esperando su oferta…': 'Waiting for their offer…',
    'Has aceptado.': 'You have accepted.',
    '{nombre} ha aceptado.': '{nombre} has accepted.',
    'Acepto': 'Accept',
    'Aceptar el intercambio': 'Accept the trade',
    'Esperando a que acepte…': 'Waiting for them to accept…',
    'Cancelar el intercambio': 'Cancel the trade',
    '{objeto} (clic: mirarlo)': '{objeto} (click: look at it)',

    // --- client/jetyum/js/menuobjeto.js y main.js: empezar ------------------------------------
    'Comerciar con…': 'Trade with…',
    'Mirar': 'Look',
    'Elige con quién comerciar (Escape o clic derecho: cancelar)':
        'Choose who to trade with (Escape or right click: cancel)',
    'Elige con quién comerciar (Escape o clic derecho: cancelar).':
        'Choose who to trade with (Escape or right click: cancel).',
    'Para comerciar, haz clic en un jugador.': 'To trade, click on a player.',

    // --- client/jetyum/index.html: la ayuda de los controles -----------------------------------
    'Ctrl + clic derecho': 'Ctrl + right click',
    'sobre un objeto, su menú: mirarlo o comerciar con él con otro jugador («Comerciar con…» y clic en el jugador)':
        'on an item, its menu: look at it or trade it with another player («Trade with…» and click on the player)'
};
