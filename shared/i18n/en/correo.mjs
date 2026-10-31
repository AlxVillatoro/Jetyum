/**
 * Inglés: el CORREO (buzones, cartas, paquetes y etiquetas) y lo que llega al depósito.
 *
 * Lo que dice el motor al mandar y al entregar (engine/world/correo.js), lo que dicen la carta y la
 * etiqueta al escribirlas y leerlas (data/scripts/actions/correo.js) y lo que vende y cuenta el
 * Tendero (data/npc/ciudad/tendero.js). Los nombres de los objetos ya están en inglés en items.xml.
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves: ver
 * `shared/js/i18n.mjs`. «No existe ningun personaje llamado «{nombre}».» ya está en muerte.mjs.
 */
export default {
    // --- Llega correo ---
    'Te ha llegado correo nuevo.': 'New mail has arrived.',
    'Tienes correo nuevo.': 'You have new mail.',

    // --- Al mandar ---
    'Has enviado la carta a {nombre} ({ciudad}).': 'You sent the letter to {nombre} ({ciudad}).',
    'Has enviado la carta a {nombre}.': 'You sent the letter to {nombre}.',
    'Has enviado el paquete a {nombre} ({ciudad}).': 'You sent the parcel to {nombre} ({ciudad}).',
    'Has enviado el paquete a {nombre}.': 'You sent the parcel to {nombre}.',
    'Eso no se puede enviar por correo.': 'That cannot be sent by mail.',
    'Eso no se puede enviar por correo: mete la etiqueta en un paquete.':
        'That cannot be sent by mail: put the label inside a parcel.',
    'Un depósito no se puede enviar por correo.': 'A depot cannot be sent by mail.',
    'Ese paquete lleva demasiados contenedores unos dentro de otros: como mucho {max}.':
        'That parcel has too many containers inside one another: {max} at most.',
    'Ese paquete no lleva etiqueta: mete dentro una etiqueta con el nombre de quien lo recibe.':
        "That parcel has no label: put a label with the recipient's name inside it.",
    'La etiqueta del paquete no dice a quién va: escribe su nombre en la primera línea.':
        "The parcel's label does not say who it is for: write the recipient's name on the first line.",
    'Esa carta no dice a quién va: escribe su nombre en la primera línea.':
        "That letter does not say who it is for: write the recipient's name on the first line.",
    'No existe la ciudad «{ciudad}».': 'There is no town called «{ciudad}».',
    'No se ha podido enviar: inténtalo más tarde.': 'It could not be sent: try again later.',

    // --- Escribir y leer ---
    'Lees: «{texto}»': 'You read: «{texto}»',
    'No hay nada escrito.': 'Nothing is written on it.',
    'Carta de {nombre}': 'Letter from {nombre}',

    // --- El Tendero ---
    'carta': 'letter',
    'paquete': 'parcel',
    'etiqueta': 'label',
    'Vendo cartas, paquetes y etiquetas. Escribe en la primera linea el nombre de quien lo recibe y en la segunda su ciudad, y echalo en un buzon: le llega al deposito.':
        "I sell letters, parcels and labels. Write the recipient's name on the first line and their town on the second, and drop it into a mailbox: it arrives at their depot."
};
