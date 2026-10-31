/**
 * Inglés: lo que dicen los NPC y los monstruos, y los nombres del contenido (data/npc, data/monsters, data/XML).
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves
 * (`{n}`, `{nombre}`): ver `shared/js/i18n.mjs`.
 *
 * LAS PISTAS EN INGLÉS NOMBRAN LAS PALABRAS EN INGLÉS. Un NPC que en español dice «dime "saldo"»
 * entiende también «balance» (las listas `words` de cada `data/npc/**.js` llevan los dos idiomas),
 * así que la traducción dice «say "balance"» y no la palabra española entre comillas.
 *
 * LOS OBJETOS DE LAS TIENDAS se traducen por el nombre que les da el mercader (`name` en su
 * `shop.items`), que es lo que el NPC pone en sus frases. Su nombre en inglés es una palabra del
 * nombre de `items.xml` («sword» de «magic sword»), y por eso «buy sword» funciona sin tocar la
 * tienda: el motor reconoce también el nombre del catálogo, palabra por palabra.
 */

/** Los objetos de las tiendas: el nombre del mercader y el suyo en inglés. */
const OBJETOS = {
    'espada': 'sword',
    'anillo': 'ring',
    'moneda': 'coin',
    'pocion de vida': 'health potion',
    'pocion de mana': 'mana potion',
    'carne': 'meat',
    'jamon': 'ham',
    'queso': 'cheese',
    'manzana': 'apple',
    'arco': 'bow',
    'flecha': 'arrow',
    'estrella arrojadiza': 'throwing star',
    'antorcha': 'torch',
    'cuerda': 'rope',
    'pala': 'shovel',
    'pico': 'pick',
    'runa en blanco': 'blank rune',
    'runa de curacion intensa': 'intense healing rune',
    'runa de curacion': 'ultimate healing rune',
    'runa de proyectil ligero': 'light magic missile rune',
    'runa de proyectil': 'heavy magic missile rune',
    'hueso': 'bone',
    'zafiro pequeno': 'small sapphire',
    'rubi pequeno': 'small ruby',
    'esmeralda pequena': 'small emerald',
    'amatista pequena': 'small amethyst',
    'diamante pequeno': 'small diamond'
};

/**
 * Los nombres sueltos. «espada» no va suelta: en motor.mjs es la habilidad («sword fighting»), y
 * una entrada exacta no sabe de qué se habla. Para el objeto van sus frases enteras, más abajo.
 */
const SUELTOS = Object.fromEntries(Object.entries(OBJETOS).filter(([nombre]) => nombre !== 'espada'));

/**
 * Las líneas del listado de una tienda: «  espada: 1000 monedas». Una por objeto y no un patrón
 * `{objeto}: {n} monedas`, que casaría con cualquier frase con dos puntos que acabe en «monedas».
 */
const LISTADO = {};
Object.keys(OBJETOS).forEach((nombre) => {
    LISTADO[nombre + ': {n} monedas'] = OBJETOS[nombre] + ': {n} coins';
    // El herrero dice además lo que paga por él.
    LISTADO[nombre + ': {n} monedas (te las compro a {m})'] =
        OBJETOS[nombre] + ': {n} coins (I buy them for {m})';
});

export default {
    // -----------------------------------------------------------------------
    // Los nombres de los NPC (data/npc/npcs.xml), que salen sobre su cabeza
    // -----------------------------------------------------------------------
    'Guia': 'Guide',
    'Guía': 'Guide',
    'Herrero': 'Blacksmith',
    'Tendero': 'Shopkeeper',
    'Sanador': 'Healer',
    'Banquero': 'Banker',
    'Guardia': 'Guard',
    'Anciano': 'Old Man',
    'Pescador': 'Fisherman',

    // -----------------------------------------------------------------------
    // Lo que se compra y se vende
    // -----------------------------------------------------------------------
    ...SUELTOS,
    ...LISTADO,

    // -----------------------------------------------------------------------
    // Las frases de comercio (herrero y tendero)
    // -----------------------------------------------------------------------
    'Aqui tienes {n}x {objeto}. Te he cobrado {total} monedas.':
        'Here you are: {n}x {objeto}. That was {total} coins.',
    'Te doy {total} monedas por {n}x {objeto}.': 'I give you {total} coins for {n}x {objeto}.',
    'Aqui tienes {n}x espada. Te he cobrado {total} monedas.': 'Here you are: {n}x sword. That was {total} coins.',
    'Te doy {total} monedas por {n}x espada.': 'I give you {total} coins for {n}x sword.',
    'Eso no lo vendo. Dime "ofrezco" para ver lo que tengo.':
        'I don\'t sell that. Say "offer" to see what I have.',
    'Eso no lo compro.': 'I don\'t buy that.',
    'No llevas eso encima.': 'You aren\'t carrying that.',
    'No he podido hacer la compra.': 'I couldn\'t complete the purchase.',
    'No he podido hacer la venta.': 'I couldn\'t complete the sale.',
    'Llevas {n} monedas.': 'You have {n} coins.',
    'Llevas {n} monedas encima.': 'You are carrying {n} coins.',

    // -----------------------------------------------------------------------
    // El guía (data/npc/ciudad/guia.js)
    // -----------------------------------------------------------------------
    'No te entiendo. Prueba con "templo", "salir" o "donde".':
        'I don\'t understand. Try "temple", "help" or "where".',
    'Hola, {nombre}. Soy el guia de la ciudad. Preguntame por el "templo", por como "salir" o por "donde" esta algo.':
        'Hello, {nombre}. I am the town guide. Ask me about the "temple", for "help" getting around, or "where" something is.',
    'El templo esta al norte. Si mueres, reapareces alli: recuerda que pierdes experiencia y sueltas lo que llevas.':
        'The temple is to the north. If you die, you respawn there: remember that you lose experience and drop what you carry.',
    'Ahora mismo estas en {posicion}.': 'Right now you are at {posicion}.',
    'Muevete con las flechas o WASD. Con Intro escribes, y con el boton derecho del raton recoges lo que haya en el suelo.':
        'Move with the arrow keys or WASD. Press Enter to type, and right-click to pick up whatever is on the ground.',
    'Hay ratas al sur. Son debiles, pero no bajes a la mina sin subir de nivel.':
        'There are rats to the south. They are weak, but don\'t go down into the mine before you level up.',
    'Adios. Vuelve cuando quieras.': 'Goodbye. Come back whenever you like.',

    // -----------------------------------------------------------------------
    // El herrero (data/npc/ciudad/herrero.js)
    // -----------------------------------------------------------------------
    'Me he alejado del taller. Vuelvo.': 'I\'ve wandered away from the forge. Heading back.',
    'No te he entendido. Dime "hola", "ofrezco", "comprar espada" o "vender espada".':
        'I didn\'t understand you. Say "hi", "offer", "buy sword" or "sell sword".',
    'Buenas. Soy el herrero. Dime "ofrezco" para ver lo que tengo, o "comprar espada" y "vender espada".':
        'Hello. I am the blacksmith. Say "offer" to see what I have, or "buy sword" and "sell sword".',
    'Ahora mismo no tengo nada que vender.': 'I have nothing to sell right now.',
    'Tengo {n} cosa(s) a la venta:': 'I have {n} item(s) for sale:',
    'Te faltan monedas: cuesta {precio} y llevas {dinero}.':
        'You don\'t have enough coins: it costs {precio} and you have {dinero}.',
    'Forjo espadas de ataque 48. Se nota mucho contra las ratas.':
        'I forge swords with 48 attack. You really notice it against the rats.',
    'Trabajo el hierro. Por eso me ves dando vueltas por aqui.':
        'I work iron. That\'s why you see me pacing around here.',
    'Que te vaya bien.': 'Take care.',

    // -----------------------------------------------------------------------
    // El tendero (data/npc/ciudad/tendero.js)
    // -----------------------------------------------------------------------
    'No te entiendo. Dime "comerciar" y te enseño todo lo que tengo, o "ofrezco" para oírlo.':
        'I don\'t understand. Say "trade" and I\'ll show you everything I have, or "offer" to hear it.',
    'Mira lo que tengo.': 'Take a look at what I have.',
    'Buenas, {nombre}. Compro lo que te sobre y vendo lo que me traen. Dime "comerciar" para verlo.':
        'Hello, {nombre}. I buy what you don\'t need and sell what others bring me. Say "trade" to see it.',
    'Tengo a la venta:': 'For sale:',
    'Y te compro:': 'And I buy:',
    'Hoy no tengo nada que ofrecerte.': 'I have nothing to offer you today.',
    'No te llega: cuesta {precio} y llevas {dinero}.':
        'You can\'t afford it: it costs {precio} and you have {dinero}.',
    'No te cabe: tu mochila esta llena. Haz hueco y vuelve.':
        'It won\'t fit: your backpack is full. Make some room and come back.',
    'No te cabe encima: vas demasiado cargado. Suelta algo y vuelve.':
        'You can\'t carry it: you are too heavily loaded. Drop something and come back.',
    'Eso esta en mi lista pero no existe. Avisa de este fallo.':
        'That is on my list but it doesn\'t exist. Please report this bug.',
    'Anillos compro todos los que me traigas. El herrero no te los cogera: dice que el hierro si y el oro no.':
        'I\'ll buy every ring you bring me. The blacksmith won\'t take them: he says iron yes, gold no.',
    'La moneda de cristal te la pago a 100 de oro. Es lo que sueltan las ratas del charco, y por aqui no la quiere nadie mas.':
        'I\'ll pay you 100 gold for a crystal coin. The rats by the pond drop them, and nobody else around here wants them.',
    'Llevas {n} monedas de oro encima.': 'You are carrying {n} gold coins.',
    'Vas cargado con {peso} de {capacidad}. Lo que no te quepa no te lo puedo vender.':
        'You are carrying {peso} of {capacidad}. I can\'t sell you what you can\'t carry.',
    'Compro barato y vendo caro. Si te parece mal, prueba a forjar tu el anillo.':
        'I buy cheap and sell dear. If you don\'t like it, try forging the ring yourself.',
    'Vuelve cuando tengas algo que soltar.': 'Come back when you have something to get rid of.',

    // -----------------------------------------------------------------------
    // El sanador (data/npc/ciudad/sanador.js)
    // -----------------------------------------------------------------------
    'No te entiendo. Dime "como estoy", "curar", "templo" o "veneno".':
        'I don\'t understand. Say "how am I", "heal", "temple" or "poison".',
    'Hola, {nombre}. Dime "curar" si vienes herido, o "como estoy" y te digo como llevas el cuerpo.':
        'Hello, {nombre}. Say "heal" if you come wounded, or "how am I" and I\'ll tell you how your body is holding up.',
    'Todavia hueles a pelea. Sal del combate y vuelve, que no curo a nadie para que vuelva a meterse.':
        'You still smell of battle. Get out of the fight and come back: I don\'t heal anyone just so they can jump back in.',
    'No tienes nada que curar. Vuelve cuando te hagan falta mis manos.':
        'You have nothing to heal. Come back when you need my hands.',
    'Ya esta: te he cerrado las heridas y te he sacado lo que llevabas dentro.':
        'There you go: I closed your wounds and drew out what you had inside.',
    'Ya esta: te he cerrado las heridas.': 'There you go: I closed your wounds.',
    'Estas a {salud} de {maxima} ({porcentaje}%).': 'You are at {salud} of {maxima} ({porcentaje}%).',
    'Entero. No te metas donde no te llaman y seguiras asi.':
        'In one piece. Stay out of trouble and you\'ll stay that way.',
    'Aguantas, pero no fuerces: otra pelea asi te deja en el suelo.':
        'You\'re holding up, but don\'t push it: another fight like that will put you on the ground.',
    'Dime "curar" y te cierro las heridas.': 'Say "heal" and I\'ll close your wounds.',
    'Estas para que te lleven. Dime "curar" antes de que caigas.':
        'You look like you need carrying. Say "heal" before you fall.',
    'Estas muerto, y eso ya no es cosa mia.': 'You are dead, and that is no longer my business.',
    'El templo te rehace entero cuando caes. Eso si: pierdes experiencia por el camino.':
        'The temple puts you back together when you fall. But mind you: you lose experience along the way.',
    'Al subir de nivel aguantas mas golpes que antes. Pero para cerrar heridas, mejor ven a verme.':
        'When you level up you can take more hits than before. But to close wounds, better come and see me.',
    'No llevas nada dentro. Las arañas de la mina si que envenenan: si te muerden, ven y dime "curar".':
        'You have nothing inside you. The spiders in the mine do poison, though: if they bite you, come and say "heal".',
    'Fuera. Ya no llevas nada dentro.': 'Out. You have nothing inside you anymore.',
    'La mina esta planta abajo y las ratas junto al charco. Las dos cosas dejan marca: si vuelves herido, ya sabes donde estoy.':
        'The mine is one floor down and the rats are by the pond. Both leave their mark: if you come back wounded, you know where I am.',
    'Vete con cuidado.': 'Go carefully.',

    // -----------------------------------------------------------------------
    // El banquero (data/npc/ciudad/banquero.js)
    // -----------------------------------------------------------------------
    'No te entiendo. Dime "saldo", "depositar" o "cuanto llevo".':
        'I don\'t understand. Say "balance", "deposit" or "how much".',
    'Buenas, {nombre}. Dime "saldo" y te digo lo que llevas.':
        'Hello, {nombre}. Say "balance" and I\'ll tell you what you carry.',
    'La caja fuerte esta por abrir: todavia no hay donde dejarlo. Hoy el dinero se lleva encima, con todo lo que eso tiene.':
        'The vault isn\'t open yet: there is nowhere to leave it. For now, money is carried on you, with all that implies.',
    'No hay nada tuyo que sacar: no guardo dinero de nadie todavia.':
        'There is nothing of yours to withdraw: I don\'t keep anyone\'s money yet.',
    'Llevas {n} de oro encima, contando platino y cristal.':
        'You are carrying {n} gold, counting platinum and crystal.',
    'En el zurron: {n} de oro, contando platino y cristal.':
        'In your pouch: {n} gold, counting platinum and crystal.',
    'Cien de oro son una de platino, y cien de platino una de cristal. Usa una pila llena para juntarla, o una moneda grande para partirla.':
        'A hundred gold make one platinum, and a hundred platinum one crystal. Use a full stack to merge it, or a large coin to break it.',
    'Al caer pierdes una decima parte de la experiencia y sueltas TODO lo que lleves, monedas incluidas. Por eso un banco vale mas de lo que parece.':
        'When you fall you lose a tenth of your experience and drop EVERYTHING you carry, coins included. That is why a bank is worth more than it seems.',
    'Prestamos no hago. Todavia no hay con que responder si no me los devolvieras.':
        'I don\'t make loans. There is nothing yet to cover it if you didn\'t pay me back.',
    'Vas con {peso} de {capacidad}. Y las monedas pesan: cien de oro son diez onzas, aunque no lo parezca.':
        'You are carrying {peso} of {capacidad}. And coins are heavy: a hundred gold weigh ten ounces, though it may not seem so.',
    'Cuida ese zurron.': 'Look after that pouch.',

    // -----------------------------------------------------------------------
    // El guardia (data/npc/ciudad/guardia.js)
    // -----------------------------------------------------------------------
    'No te entiendo, forastero. Prueba con "mina", "ratas", "peligro" o "ley".':
        'I don\'t understand you, stranger. Try "mine", "rats", "danger" or "law".',
    'Alto ahi, {nombre}. Guardia de la ciudad. Pregunta por la "mina", por las "ratas" o por la "ley".':
        'Halt, {nombre}. Town guard. Ask about the "mine", the "rats" or the "law".',
    'La mina esta una planta mas abajo. No bajes sin nivel y sin arma: ahi abajo nadie te oye, y aqui arriba no hay quien baje a buscarte.':
        'The mine is one floor down. Don\'t go down without levels and a weapon: nobody can hear you down there, and nobody up here will come down to find you.',
    'Las ratas salen junto al charco, al otro lado de la ciudad. Son debiles, pero muerden, y sin arma acabas en el suelo mas rapido de lo que crees.':
        'The rats come out by the pond, on the other side of town. They are weak, but they bite, and without a weapon you end up on the ground faster than you think.',
    'El agua somera se anda a la mitad de velocidad: el suelo mojado cuesta el doble. Si te persiguen, no te metas en el charco.':
        'You walk through shallow water at half speed: wet ground costs twice as much. If you are being chased, stay out of the pond.',
    'El que pega de cerca llega a una casilla, contando la diagonal. Y aqui se pega el que quiere: no hay calavera, ni carcel, ni juez.':
        'Melee reaches one square, counting diagonals. And here anyone who wants to fight, fights: there is no skull, no jail, no judge.',
    'No te fies de las plazas. Hay casillas marcadas como protegidas en el mapa, pero hoy no protegen de nada: si alguien te ataca, te ataca.':
        'Don\'t trust the squares. Some tiles are marked as protected on the map, but today they protect you from nothing: if someone attacks you, they attack you.',
    'La ley la pongo yo, y la pongo avisando. Bandidos no hay: nadie se ha puesto una calavera todavia, y sin calavera no hay a quien perseguir.':
        'I am the law, and I enforce it with warnings. There are no bandits: nobody has earned a skull yet, and without a skull there is no one to hunt.',
    'El templo te rehace cuando caes, pero te cuesta una decima parte de tu experiencia y todo lo que lleves encima. No es un sitio al que ir de visita.':
        'The temple puts you back together when you fall, but it costs you a tenth of your experience and everything you carry. It is not a place to visit for fun.',
    'Anda con ojo.': 'Watch your step.',

    // -----------------------------------------------------------------------
    // El anciano (data/npc/ciudad/anciano.js)
    // -----------------------------------------------------------------------
    '... y entonces el pozo se seco, y nadie supo decir por que.':
        '... and then the well ran dry, and nobody could say why.',
    'No te oigo bien, hijo. Hablame de la "historia", de la "mina" o del "templo".':
        'I can\'t hear you well, child. Talk to me about the "history", the "mine" or the "temple".',
    'Anda, {nombre}. Sientate, que yo ya no me levanto. Preguntame por la "historia" y te la cuento como me la contaron.':
        'Well now, {nombre}. Sit down, I don\'t get up anymore. Ask me about the "history" and I\'ll tell it the way it was told to me.',
    'Esto era un descampado con un templo, y nada mas. La gente se junto alrededor del templo porque era lo unico que no se caia, y asi acabo habiendo ciudad.':
        'This was an empty field with a temple, and nothing else. People gathered around the temple because it was the only thing that wasn\'t falling down, and that is how a town came to be.',
    'Despues abrieron la mina, y la ciudad crecio de golpe. Cuando la mina se quedo vacia, la ciudad ya no se fue.':
        'Then they opened the mine, and the town grew all at once. When the mine ran empty, the town didn\'t leave.',
    'Jetyum es un punado de casas y un templo. No esperes murallas: lo unico que nos ha defendido siempre es que no hay nada que robar.':
        'Jetyum is a handful of houses and a temple. Don\'t expect walls: the only thing that has ever protected us is that there is nothing to steal.',
    'La mina esta debajo de todo esto, una planta mas abajo. Esta abierta y vacia: se dice que abajo hay algo, pero no lo ha visto nadie todavia.':
        'The mine is beneath all this, one floor down. It is open and empty: they say there is something down there, but nobody has seen it yet.',
    'El templo es lo primero que hubo, y por eso esta donde esta. El que cae vuelve alli entero, aunque vuelve sin lo que llevaba.':
        'The temple was the first thing here, and that is why it stands where it does. Whoever falls comes back there whole, though without what they carried.',
    'Reyes no hay. Hubo uno, hace tanto que ya no me acuerdo del nombre, y no dejo heredero ni ganas de tenerlo.':
        'There are no kings. There was one, so long ago I no longer remember his name, and he left no heir and no wish for one.',
    'Las ratas llevan aqui mas que nosotros. Se crian en el charco y no se han ido nunca, ni cuando la mina daba de comer.':
        'The rats have been here longer than we have. They breed in the pond and have never left, not even when the mine fed us all.',
    'No te sabria decir cuantos anos tengo. Deje de contarlos cuando me di cuenta de que nadie me creia.':
        'I couldn\'t tell you how old I am. I stopped counting when I realized nobody believed me.',
    'Vete, vete. Yo me quedo aqui, como siempre.': 'Go on, go on. I\'ll stay here, as always.',

    // -----------------------------------------------------------------------
    // El pescador (data/npc/campo/pescador.js)
    // -----------------------------------------------------------------------
    'No te he entendido. Dime "pesca", "charco" o "cebo".':
        'I didn\'t understand you. Say "fishing", "pond" or "bait".',
    'Buenas, {nombre}. Si vienes a preguntar por la "pesca", te adelanto que hoy no pica nada.':
        'Hello, {nombre}. If you came to ask about the "fishing", I\'ll tell you now that nothing is biting today.',
    'Ni un pez. Llevo la manana entera con el sedal en el agua y no ha picado nada, y no es por falta de paciencia.':
        'Not a single fish. I\'ve had my line in the water all morning and nothing has bitten, and it\'s not for lack of patience.',
    'Aparejos tengo los mios, pero no te puedo vender ninguno: no hay donde comprarlos en toda la ciudad.':
        'I have my own tackle, but I can\'t sell you any: there is nowhere to buy it in the whole town.',
    'Metete en el charco y lo vas a notar: el agua somera se anda a la mitad de velocidad. Por eso los peces no tienen quien los moleste.':
        'Step into the pond and you\'ll notice: you walk through shallow water at half speed. That is why nobody bothers the fish.',
    'Las ratas vienen al charco a beber, y ya no se asustan de mi. Son mas duenas del agua que yo.':
        'The rats come to the pond to drink, and they aren\'t afraid of me anymore. The water is more theirs than mine.',
    'En la mina no hay agua, que yo sepa. Si la hubiera, seria la unica pesca tranquila de por aqui.':
        'There is no water in the mine, as far as I know. If there were, it would be the only quiet fishing around here.',
    'Que tengas mas suerte que yo.': 'Better luck than mine.',

    // -----------------------------------------------------------------------
    // Lo que dicen los monstruos (data/monsters/**, `voices`) que está en español
    // -----------------------------------------------------------------------
    'Te arrastraré...': 'I will drag you down...',
    'Me mata a ti!': 'Me kill you!',
    'Sangre fría!': 'Cold blood!',
    'Por la sombra!': 'For the shadow!',
    'Ven conmigo...': 'Come with me...',
    'Miau!': 'Meow!',

    // -----------------------------------------------------------------------
    // Los aspectos (data/XML/outfits.js): sus nombres y sus añadidos
    // -----------------------------------------------------------------------
    'Explorador': 'Explorer',
    'Aldeano': 'Villager',
    'Aventurero': 'Adventurer',
    'Viajero': 'Traveler',
    'Dama': 'Lady',
    'Caballero': 'Cavalier',
    'Ciudadano': 'Townsman',
    'Ciudadana': 'Townswoman',
    'Rat, variante': 'Rat, variant',
    '{aspecto}, primer añadido': '{aspecto}, first addon',
    '{aspecto}, segundo añadido': '{aspecto}, second addon',

    // -----------------------------------------------------------------------
    // Los pueblos y las casas de los mapas (data/world/*.map.json)
    // -----------------------------------------------------------------------
    'Aldea': 'Village',
    'Casa del Olmo': 'Elm House',
    'Casa del Roble': 'Oak House',
    'Casa de Piedra': 'Stone House',
    'Casa del Pozo': 'Well House',

    // Las monturas (data/XML/mounts.js)
    'Oso de carga': 'Pack Bear',
    'Cerdo': 'Pig',
    'Escarabajo': 'Beetle',
    'Jabalí mecánico': 'Mechanical Boar',
    'Escolopendra': 'Centipede'
};
