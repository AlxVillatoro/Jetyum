/**
 * Inglés: la MUERTE del jugador, el historial de muertes y las bendiciones.
 *
 * Lo que dice el motor al morir (engine/world/combat.js), los comandos `/muertes` y `/bendiciones`
 * (data/scripts/talkactions/muerte.js), lo que dice el Sanador al venderlas
 * (data/npc/ciudad/sanador.js) y los nombres de las cinco (engine/world/muerte.js), que en inglés
 * son los de Tibia.
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves: ver
 * `shared/js/i18n.mjs`. Como en el resto de los NPC, las pistas en inglés nombran las palabras en
 * inglés que el Sanador también entiende («say "yes"», no «di "si"»).
 */
export default {
    // --- Los nombres de las cinco bendiciones ---
    'Escudo Espiritual': 'The Spiritual Shielding',
    'Abrazo de Tibia': 'The Embrace of Tibia',
    'Fuego de los Soles': 'The Fire of the Suns',
    'Chispa del Fenix': 'The Spark of the Phoenix',
    'Sabiduria de la Soledad': 'The Wisdom of Solitude',

    // --- Al morir (el motor) ---
    'Has bajado del nivel {antes} al nivel {ahora}.': 'You were downgraded from Level {antes} to Level {ahora}.',
    'Tus bendiciones te protegieron y se han gastado.': 'Your blessings protected you and are now spent.',

    // --- /muertes ---
    'Este servidor no guarda el historial de muertes (no tiene base de datos).':
        'This server does not keep a death history (it has no database).',
    'No existe ningun personaje llamado «{nombre}».': 'There is no character called «{nombre}».',
    '{nombre} no ha muerto nunca.': '{nombre} has never died.',
    'Ultimas muertes de {nombre}:': 'Latest deaths of {nombre}:',
    '{fecha} - murio a nivel {nivel}.': '{fecha} - died at level {nivel}.',
    '{fecha} - murio a nivel {nivel} a manos de {asesino}.': '{fecha} - died at level {nivel}, killed by {asesino}.',
    '{fecha} - murio a nivel {nivel} a manos de {asesino} (muerte injusta).':
        '{fecha} - died at level {nivel}, killed by {asesino} (unjustified kill).',

    // --- /bendiciones ---
    'Tus bendiciones ({n} de {total}):': 'Your blessings ({n} of {total}):',
    '{nombre}: la tienes.': '{nombre}: you have it.',
    '{nombre}: no la tienes.': '{nombre}: you do not have it.',
    'A tu nivel cada una cuesta {precio} de oro. Las da el Sanador del templo.':
        'At your level each one costs {precio} gold. The Healer at the temple grants them.',
    'Si murieras ahora perderias un {pct}% de experiencia, skills y nivel magico.':
        'If you died now you would lose {pct}% of your experience, skills and magic level.',
    'Cada objeto equipado se pierde con un {objeto}% y la mochila con un {mochila}%.':
        'Each equipped item has a {objeto}% chance of being lost, and the backpack {mochila}%.',
    'Al morir se gastan todas.': 'They are all spent when you die.',

    // --- El Sanador ---
    'Hay cinco bendiciones: "Escudo Espiritual", "Abrazo de Tibia", "Fuego de los Soles", "Chispa del Fenix" y "Sabiduria de la Soledad".':
        'There are five blessings: "The Spiritual Shielding", "The Embrace of Tibia", "The Fire of the Suns", "The Spark of the Phoenix" and "The Wisdom of Solitude".',
    'Cada una te quita parte de lo que pierdes al morir, y se gastan todas cuando caes. A tu nivel cada una cuesta {precio} de oro; di su nombre, o "todas" para las que te falten.':
        'Each one reduces what you lose when you die, and they are all spent when you fall. At your level each one costs {precio} gold; say its name, or "all" for the ones you are missing.',
    'En un mundo de guerra los dioses no bendicen a nadie.': 'In a world of war the gods bless no one.',
    'Ya tienes las cinco bendiciones.': 'You already have all five blessings.',
    'Te faltan {n} bendiciones: son {precio} de oro. ¿Las quieres? Di "si" o "no".':
        'You are missing {n} blessings: that is {precio} gold. Do you want them? Say "yes" or "no".',
    'Ya tienes la bendicion "{nombre}".': 'You already have the blessing "{nombre}".',
    'La bendicion "{nombre}" te cuesta {precio} de oro. ¿La quieres? Di "si" o "no".':
        'The blessing "{nombre}" costs you {precio} gold. Do you want it? Say "yes" or "no".',
    'No te he ofrecido nada. Preguntame por las "bendiciones".':
        'I have not offered you anything. Ask me about the "blessings".',
    'Ya tienes esa bendicion: los dioses no bendicen dos veces lo mismo.':
        'You already have that blessing: the gods do not bless the same thing twice.',
    'No te alcanza: hacen falta {precio} de oro.': 'You cannot afford it: it takes {precio} gold.',
    'Los dioses te han bendecido. Que te guarden.': 'The gods have blessed you. May they keep you.',
    'Los dioses te han dado {n} bendiciones. Que te guarden.': 'The gods have given you {n} blessings. May they keep you.',
    'Como quieras.': 'As you wish.',
    'Si quieres perder menos, pideme las "bendiciones".': 'If you want to lose less, ask me for the "blessings".',

    // --- Lo que otros NPC dicen de la muerte (el banquero y el guardia) ---
    'Al caer pierdes experiencia y, sin bendiciones, la mochila entera, monedas incluidas. Por eso un banco vale mas de lo que parece.':
        'When you fall you lose experience and, without blessings, your whole backpack, coins included. That is why a bank is worth more than it seems.',
    'El templo te rehace cuando caes, pero te cuesta experiencia y, si no llevas bendiciones, la mochila. No es un sitio al que ir de visita.':
        'The temple remakes you when you fall, but it costs you experience and, if you carry no blessings, your backpack. It is not a place to visit.'
};
