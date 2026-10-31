/**
 * Inglés: LOS CANALES DEL CHAT y LA LISTA VIP del servidor. Lo que dice el motor al entrar, hablar,
 * invitar y excluir (engine/world/canales.js) y al añadir y quitar amigos (engine/world/vip.js), que
 * en inglés son las frases de TFS, y lo que pinta el cliente: las pestañas y el «+» de la consola
 * (client/jetyum/js/consola.js, main.js) y la ventana VIP (client/jetyum/js/lateral.js).
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves: ver
 * `shared/js/i18n.mjs`. Lo registra `shared/i18n/juego.mjs`.
 */
export default {
    // --- engine/world/canales.js: los nombres --------------------------------------------------
    'Juego': 'World Chat',
    'Comercio': 'Trade',
    'Canal de {nombre}': "{nombre}'s Channel",

    // --- engine/world/canales.js: entrar y hablar ----------------------------------------------
    'Ese canal no existe.': 'This channel does not exist.',
    'No estás en ese canal.': 'You are not in this channel.',
    'Necesitas nivel {nivel} para entrar en este canal.': 'You need level {nivel} to join this channel.',
    'Necesitas nivel {nivel} para hablar en este canal.': 'You may not speak into this channel until you are level {nivel}.',
    'No puedes hablar ahora.': 'You may not speak right now.',
    'Sólo puedes poner una oferta cada dos minutos.': 'You may only place one offer in two minutes.',
    'No estás en ningún gremio.': 'You are not in a guild.',
    'Mensaje del día: {motd}': 'Message of the day: {motd}',

    // --- engine/world/canales.js: el canal privado ---------------------------------------------
    'No estás invitado a ese canal.': 'You are not invited to this channel.',
    'No tienes ningún canal privado.': 'You do not have a private chat channel.',
    'No puedes invitarte a ti mismo.': 'You cannot invite yourself.',
    '{nombre} te invita a su canal privado.': '{nombre} invites you to their private chat channel.',
    '{nombre} ha sido invitado.': '{nombre} has been invited.',
    '{nombre} ya está invitado.': '{nombre} is already invited.',
    '{nombre} ha sido excluido.': '{nombre} has been excluded.',
    '{nombre} no está invitado.': '{nombre} is not invited.',

    // --- engine/world/vip.js -------------------------------------------------------------------
    'No existe ningún personaje con ese nombre.': 'A player with this name does not exist.',
    'Ese jugador ya está en tu lista.': 'This player is already in your list.',
    'No puedes añadir más amigos.': 'You cannot add more buddies.',
    'No puedes añadirte a ti mismo.': 'You cannot add yourself.',
    'Ese jugador no está en tu lista.': 'This player is not in your list.',
    'La lista VIP necesita que el servidor guarde las cuentas.': 'The VIP list needs a server that stores accounts.',

    // --- client/jetyum/js/world.js y lateral.js: la VIP ----------------------------------------
    '{nombre} ha entrado en el juego.': '{nombre} has logged in.',
    '{nombre} ha salido del juego.': '{nombre} has logged out.',
    '{nombre}: conectado': '{nombre}: online',
    '{nombre}: desconectado': '{nombre}: offline',

    // --- client/jetyum/js/consola.js, main.js e index.html: las pestañas y el «+» ---------------
    'Canal: {nombre}': 'Channel: {nombre}',
    'Tu canal privado: invita con «/invitar nombre» y excluye con «/excluir nombre»':
        'Your private channel: invite with «/invite name» and exclude with «/exclude name»',
    'Abrir tu canal privado': 'Open your private channel',
    'Canales: abrir un canal del chat (Juego, Comercio, Ayuda, tu gremio o uno privado)':
        'Channels: open a chat channel (World Chat, Trade, Help, your guild or a private one)',
    'junto a las pestañas de la consola: abrir un canal (Juego, Comercio, Ayuda, tu gremio) o tu canal privado; en el tuyo, «/invitar nombre» y «/excluir nombre»':
        'next to the console tabs: open a channel (World Chat, Trade, Help, your guild) or your private channel; in yours, «/invite name» and «/exclude name»'
};
