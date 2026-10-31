/**
 * Inglés: los mensajes que el motor manda a los jugadores (engine/ y data/scripts/).
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves
 * (`{n}`, `{nombre}`): ver `shared/js/i18n.mjs`.
 */
export default {
    // --- Palabras sueltas que caen en huecos ---------------------------------------------
    'algo': 'something',
    'eso': 'that',
    'ninguno': 'none',
    'ninguna': 'none',
    'mujer': 'women',
    'hombre': 'men',
    'flechas': 'arrows',
    'virotes': 'bolts',
    'sin vocación': 'no vocation',
    'objeto {n}': 'item {n}',

    // engine/world/vocacion.js (NOMBRE_SKILL, en «Has subido a ...»)
    'puño': 'fist fighting',
    'maza': 'club fighting',
    'espada': 'sword fighting',
    'hacha': 'axe fighting',
    'distancia': 'distance fighting',
    'escudo': 'shielding',
    'pesca': 'fishing',
    'nivel mágico': 'magic level',
    'nivel': 'level',

    // --- engine/net/session.js: entrar ---------------------------------------------------
    'el servidor no te deja entrar ahora': 'the server does not let you in right now',
    'este servidor no guarda cuentas (useDatabase esta apagado)':
        'this server does not store accounts (useDatabase is off)',

    // --- engine/persistence/players.js y database.js (LOGIN_ERROR) -----------------------
    'la cuenta tiene que tener de 3 a 20 letras o numeros, sin espacios':
        'the account name must have 3 to 20 letters or digits, without spaces',
    'la contrasena tiene que tener al menos 4 caracteres': 'the password must have at least 4 characters',
    'el nombre del personaje tiene que tener de 3 a 20 letras (puede llevar espacios)':
        'the character name must have 3 to 20 letters (spaces allowed)',
    'faltan la cuenta o el personaje': 'the account or the character is missing',
    'ya existe un personaje llamado "{nombre}": elige otro nombre':
        'a character named "{nombre}" already exists: choose another name',
    'esa cuenta ya existe y la contrasena no es esa': 'that account already exists and the password is wrong',
    'cuenta o contrasena incorrectas (si no tienes cuenta, creala en «Crear cuenta»)':
        'wrong account or password (if you have no account, create one in «Create account»)',
    'ese personaje no es de esta cuenta': 'that character does not belong to this account',
    'esa cuenta no tiene un personaje llamado "{nombre}": crealo en «Crear cuenta»':
        'that account has no character named "{nombre}": create it in «Create account»',
    'ese personaje ya esta dentro del mundo': 'that character is already in the world',
    'no se pudo cargar el personaje': 'the character could not be loaded',
    'escribe tu cuenta y tu contrasena': 'enter your account and your password',
    'la cuenta necesita un nombre': 'the account needs a name',
    'la cuenta necesita una contrasena': 'the account needs a password',
    'ya existe una cuenta con el nombre "{nombre}"': 'an account named "{nombre}" already exists',
    'el personaje necesita un nombre': 'the character needs a name',
    'ya existe un personaje llamado "{nombre}"': 'a character named "{nombre}" already exists',

    // --- engine/world/world.js: vocaciones (al crear y con setVocation) ------------------
    'no existe la vocacion {vocacion}': 'there is no vocation {vocacion}',
    '{vocacion} es una promocion: no se elige al crear': '{vocacion} is a promotion: it cannot be chosen at creation',
    '{vocacion} necesita cuenta premium': '{vocacion} requires a premium account',
    'no existe el jugador': 'the player does not exist',

    // --- engine/world/world.js: skills -----------------------------------------------------
    'Has subido a nivel mágico {n}.': 'You advanced to magic level {n}.',
    'Has subido a nivel {n}.': 'You advanced to level {n}.',
    'Has subido a {skill} {n}.': 'You advanced in {skill} ({n}).',

    // --- engine/world/outfit.js (motivos de «No puedes llevar ese aspecto: ...») ----------
    'no existe el aspecto {tipo}': 'there is no outfit {tipo}',
    'el aspecto "{nombre}" esta desactivado': 'the outfit "{nombre}" is disabled',
    'el aspecto "{nombre}" es de criatura': 'the outfit "{nombre}" is for creatures',
    'el aspecto "{nombre}" es de {sexo}': 'the outfit "{nombre}" is for {sexo}',
    'el aspecto "{nombre}" esta bloqueado': 'the outfit "{nombre}" is locked',
    'el aspecto "{nombre}" es premium': 'the outfit "{nombre}" is premium',
    'el aspecto "{nombre}" no tiene el anadido {n}': 'the outfit "{nombre}" has no addon {n}',

    // --- engine/net/session.js: usar, andar, recoger, mover ------------------------------
    'Esta demasiado lejos.': 'You are too far away.',
    'No puedes usar eso.': 'You cannot use this object.',
    'Algo te corta el paso.': 'Something is blocking your way.',
    'No hay camino.': 'There is no way.',
    'No puedes acercarte más.': 'You cannot get any closer.',
    'No llevas mochila: no tienes donde meterlo.': 'You have no backpack: there is nowhere to put it.',
    'Pesa demasiado: no puedes con ello.': 'It is too heavy: you cannot carry it.',
    'Tu mochila esta llena: tiene {n} huecos.': 'Your backpack is full: it has {n} slots.',
    'Eso ya no esta ahi.': 'That is no longer there.',
    'No puedes cogerlo.': 'You cannot take it.',
    'Coges {objeto}.': 'You take {objeto}.',
    'No puedes llevar ese aspecto: {motivo}.': 'You cannot wear that outfit: {motivo}.',
    'Aspecto cambiado.': 'Outfit changed.',
    'Has recogido {objeto} (se suma a lo que ya llevabas).': 'You picked up {objeto} (added to what you already had).',
    'Has recogido {objeto}.': 'You picked up {objeto}.',
    'Eso no se puede recoger.': 'You cannot pick that up.',
    'No llevas mochila, asi que no tienes donde meterlo. Ponte una mochila y podras llevar cosas.':
        'You have no backpack, so there is nowhere to put it. Equip a backpack to carry things.',
    'No llevas mochila, asi que no tienes donde meterlo.': 'You have no backpack, so there is nowhere to put it.',
    'Ponte una mochila y podras llevar cosas.': 'Equip a backpack to carry things.',
    'No puedes con eso: pesa {peso} y te quedan {libre} libres.':
        'You cannot carry that: it weighs {peso} and you have {libre} of free capacity.',
    'Has soltado {objeto}.': 'You dropped {objeto}.',
    'Eso no se puede coger del suelo.': 'You cannot take that from the ground.',
    'Eso no se puede llevar puesto.': 'You cannot wear that.',
    'Ahi no va eso: se pone en la ranura "{ranura}".': 'That does not go there: it goes in the "{ranura}" slot.',
    'No puedes mover la mochila: tiene cosas dentro. Vacia la mochila primero.':
        'You cannot move the backpack: there are things inside. Empty the backpack first.',
    'Esa mochila tiene cosas dentro: vaciala antes de meterla en la tuya, o ponte la mochila si no llevas otra.':
        'That backpack has things inside: empty it before putting it into yours, or wear it if you have no other.',
    'No cabe: ese contenedor esta lleno.': 'It does not fit: that container is full.',
    'Un contenedor no se puede meter dentro de otro.': 'A container cannot be put inside another one.',
    'Ahi no hay nada que mover.': 'There is nothing to move there.',
    'Eso ya esta ahi.': 'That is already there.',
    'Ahi no se puede poner nada.': 'Nothing can be placed there.',
    'No hay sitio ahi.': 'There is not enough room.',
    'No se ha podido mover.': 'It could not be moved.',
    'No puedes atacar a {nombre}.': 'You may not attack {nombre}.',
    'No llevas {objeto}.': 'You have no {objeto}.',
    'Tu objetivo no está a la vista.': 'Your target is not in sight.',

    // engine/net/session.js: mirar (una casilla y un objeto)
    'No ves nada especial.': 'You see nothing special.',
    'No sabes qué es eso.': 'You do not know what that is.',
    'Ves {objeto} ({datos}). Pesan {peso}. {descripcion}': 'You see {objeto} ({datos}). They weigh {peso}. {descripcion}',
    'Ves {objeto} ({datos}). Pesa {peso}. {descripcion}': 'You see {objeto} ({datos}). It weighs {peso}. {descripcion}',
    'Ves {objeto} ({datos}). Pesan {peso}.': 'You see {objeto} ({datos}). They weigh {peso}.',
    'Ves {objeto} ({datos}). Pesa {peso}.': 'You see {objeto} ({datos}). It weighs {peso}.',
    'Ves {objeto} ({datos}). {descripcion}': 'You see {objeto} ({datos}). {descripcion}',
    'Ves {objeto} ({datos}).': 'You see {objeto} ({datos}).',
    'Ves {objeto}. Pesan {peso}. {descripcion}': 'You see {objeto}. They weigh {peso}. {descripcion}',
    'Ves {objeto}. Pesa {peso}. {descripcion}': 'You see {objeto}. It weighs {peso}. {descripcion}',
    'Ves {objeto}. Pesan {peso}.': 'You see {objeto}. They weigh {peso}.',
    'Ves {objeto}. Pesa {peso}.': 'You see {objeto}. It weighs {peso}.',
    'Ves {objeto}. {descripcion}': 'You see {objeto}. {descripcion}',
    'Ves {objeto}.': 'You see {objeto}.',
    'Pesan {peso}.': 'They weigh {peso}.',
    'Pesa {peso}.': 'It weighs {peso}.',
    // Los números del objeto, entre paréntesis («Ataque 25, Defensa 12»)
    'Ataque {a}, Defensa {d}, Alcance {r}': 'Atk:{a}, Def:{d}, Range:{r}',
    'Ataque {a}, Defensa {d}, Armadura {r}': 'Atk:{a}, Def:{d}, Arm:{r}',
    'Ataque {a}, Defensa {d}': 'Atk:{a}, Def:{d}',
    'Ataque {a}, Alcance {r}': 'Atk:{a}, Range:{r}',
    'Ataque {a}, Armadura {r}': 'Atk:{a}, Arm:{r}',
    'Ataque {a}, Luz {l}': 'Atk:{a}, Light:{l}',
    'Ataque {a}': 'Atk:{a}',
    'Defensa {d}, Armadura {r}': 'Def:{d}, Arm:{r}',
    'Defensa {d}, Luz {l}': 'Def:{d}, Light:{l}',
    'Defensa {d}': 'Def:{d}',
    'Armadura {r}, Luz {l}': 'Arm:{r}, Light:{l}',
    'Armadura {r}': 'Arm:{r}',
    'Alcance {r}': 'Range:{r}',
    '{n} huecos, Luz {l}': 'Vol:{n}, Light:{l}',
    '{n} huecos': 'Vol:{n}',
    'Luz {l}': 'Light:{l}',

    // engine/net/session.js: comercio y mensajes privados
    'Compras {n} x {objeto} por {total} monedas.': 'You bought {n}x {objeto} for {total} gold.',
    'Vendes {n} x {objeto} por {total} monedas.': 'You sold {n}x {objeto} for {total} gold.',
    'Eso no lo vende.': 'That is not for sale here.',
    'Eso no lo compra.': 'That is not bought here.',
    'No te llega el dinero: cuesta {precio}.': 'You do not have enough money: it costs {precio}.',
    'No te llega el dinero.': 'You do not have enough money.',
    'No puedes con tanto peso.': 'You cannot carry that much weight.',
    'Tu mochila esta llena.': 'Your backpack is full.',
    'No llevas mochila.': 'You have no backpack.',
    'No tienes tantos.': 'You do not have that many.',
    'No se puede.': 'Sorry, not possible.',
    'Nadie llamado "{nombre}" esta conectado.': 'Nobody named "{nombre}" is online.',
    'No estas en ningun grupo.': 'You are not in a party.',
    'El mensaje esta vacio.': 'The message is empty.',
    'No se pudo mandar.': 'The message could not be sent.',

    // --- engine/core/engine.js: la muerte --------------------------------------------------
    'Has muerto a manos de {asesino}.': 'You were killed by {asesino}.',
    'Has muerto.': 'You are dead.',
    'Has soltado {n} cosa(s) donde caiste. Sigues en el templo.':
        'You dropped {n} item(s) where you fell. You are back in the temple.',

    // --- engine/world/combat.js y extras.js -------------------------------------------------
    'No te quedan {municion}: ponlas en la ranura de munición.':
        'You have no {municion} left: put them in the ammunition slot.',
    'Llevas la calavera roja: has matado a demasiados inocentes.':
        'You now carry a red skull: you have killed too many innocents.',

    // --- engine/scripting/registry.js: hechizos ---------------------------------------------
    'Tu vocación no puede lanzar {hechizo}.': 'Your vocation cannot cast {hechizo}.',
    'Necesitas nivel {n} para {hechizo}.': 'You need level {n} to cast {hechizo}.',
    'No tienes suficiente maná ({hechizo} cuesta {n}).': 'You do not have enough mana ({hechizo} costs {n}).',
    'No tienes suficientes almas ({hechizo} necesita {n}).': 'You do not have enough soul points ({hechizo} needs {n}).',
    'Estás agotado.': 'You are exhausted.',
    'Necesitas un objetivo a la vista (ataca a alguien primero).': 'You need a target in sight (attack someone first).',

    // --- engine/scripting/entities.js y globals.js -------------------------------------------
    'Información': 'Information',
    'no hay ninguna raid llamada «{nombre}»': 'there is no raid called «{nombre}»',
    'la raid «{nombre}» ya está en marcha': 'the raid «{nombre}» is already running',
    'sin reloj': 'no clock',

    // --- data/scripts/actions ---------------------------------------------------------------
    // comida.js
    'Estás lleno.': 'You are full.',
    'Ñam.': 'Munch.',
    // escaleras/escalera_de_mano.js
    'Arriba no hay sitio.': 'There is no room upstairs.',
    // monedas.js
    'Necesitas 100 monedas de oro juntas para cambiarlas por una de platino.':
        'You need 100 gold coins in one stack to change them into a platinum coin.',
    'No puedes con el peso del cambio.': 'You cannot carry the weight of the change.',
    'No te cabe el cambio en la mochila.': 'The change does not fit in your backpack.',
    'Cambias {a} monedas de oro por {b} moneda de platino.': 'You change {a} gold coins into {b} platinum coin.',
    'Cambias {a} monedas de platino por {b} moneda de cristal.': 'You change {a} platinum coins into {b} crystal coin.',
    'Cambias {a} moneda de platino por {b} monedas de oro.': 'You change {a} platinum coin into {b} gold coins.',
    'Cambias {a} moneda de cristal por {b} monedas de platino.': 'You change {a} crystal coin into {b} platinum coins.',
    // others/lever.js
    'No puedes subir aqui.': 'You cannot go up here.',
    'Subes a {posicion}.': 'You go up to {posicion}.',
    // others/movable_table.js
    'No puedes apartar esto de aqui.': 'You cannot move this out of the way.',
    'Apartas la mesa y el paso queda libre.': 'You push the table aside and the way is clear.',
    // others/one_time_chest.js
    'El cofre esta vacio: ya lo abriste.': 'The chest is empty: you already opened it.',
    'No llevas mochila donde guardarlo.': 'You have no backpack to keep it in.',
    'Tu mochila esta llena: haz sitio y vuelve.': 'Your backpack is full: make room and come back.',
    'Pesa demasiado para ti: suelta algo y vuelve.': 'It is too heavy for you: drop something and come back.',
    'Dentro hay {objeto}. {motivo}': 'Inside there is {objeto}. {motivo}',
    'Dentro hay {objeto}.': 'Inside there is {objeto}.',
    'Abres el cofre y encuentras {objeto}.': 'You open the chest and find {objeto}.',
    // pociones.js
    'Sólo puedes darle una poción a un jugador.': 'You can only give a potion to a player.',
    'Ya tienes la vida llena.': 'Your health is already full.',
    '{nombre} ya tiene la vida llena.': 'The health of {nombre} is already full.',
    'Recuperas {n} de maná.': 'You recover {n} mana.',
    // puertas/puertas.js
    'No puedes cerrar la puerta: hay alguien en el umbral.': 'You cannot close the door: someone is in the doorway.',

    // --- data/scripts/events -------------------------------------------------------------------
    // bienvenida.js
    'Bienvenido a Jetyum, {nombre}. Son las {hora} en el mundo.': 'Welcome to Jetyum, {nombre}. It is {hora} in the world.',
    // kill.js
    'Has matado a {nombre}.': 'You killed {nombre}.',
    'Has ganado {n} de experiencia.': 'You gained {n} experience points.',
    // misiones.js
    'Nueva misión: «La plaga de ratas». Mírala en tu diario (botón Misiones).':
        'New quest: «The rat plague». See it in your quest log (Quests button).',
    'Ratas: {n} de {total}.': 'Rats: {n} of {total}.',
    '¡Misión cumplida! Recibes 100 monedas de oro y 2 pociones de vida.':
        'Quest complete! You receive 100 gold coins and 2 health potions.',
    '¡Misión cumplida! Recibes 100 monedas de oro (las pociones no te caben: haz sitio en la mochila).':
        'Quest complete! You receive 100 gold coins (the potions do not fit: make room in your backpack).',

    // --- data/scripts/globalevents/arranque.js ------------------------------------------------
    'Consejo: haz doble clic en una puerta (o pulsa E delante de ella) para abrirla.':
        'Tip: double-click a door (or press E in front of it) to open it.',
    'Consejo: el templo es el sitio seguro de la ciudad. Si mueres, apareces allí.':
        'Tip: the temple is the safe place of the city. If you die, you appear there.',
    'Consejo: escribe /help para ver los comandos.': 'Tip: type /help to see the commands.',
    'Es medianoche en Jetyum. Cuidado con lo que sale de noche.':
        'It is midnight in Jetyum. Beware of what comes out at night.',

    // --- data/scripts/movements ------------------------------------------------------------------
    // items/life_ring.js
    'Te quitas {objeto}: ya no regeneras más rápido.': 'You take off {objeto}: you no longer regenerate faster.',
    // items/plate_armor.js y items/sword_ring.js
    'Te pones {objeto} en el slot {slot}.': 'You put on {objeto} in the {slot} slot.',
    'Suma {n} de armadura. El motor la recalcula al ponerla y al quitarla, asi que no se queda pegada.':
        'It adds {n} armor. The engine recalculates it when you put it on and take it off, so it does not stick.',
    'Regeneras vida mientras lo lleves.': 'You regenerate health while you wear it.',
    // tiles/floorchange.js
    'Por ahí no se puede pasar.': 'You cannot pass there.',
    // tiles/teleport.js
    'Un portal te absorbe.': 'A portal pulls you in.',
    // tiles/temple_mark.js
    'La marca tira de ti, pero este mapa no tiene templo.': 'The mark pulls at you, but this map has no temple.',
    'La marca no te lleva a ninguna parte.': 'The mark takes you nowhere.',
    'La marca del suelo te devuelve al templo.': 'The mark on the floor takes you back to the temple.',

    // --- data/scripts/quests/plaga_de_ratas.js (diario de misiones) --------------------------
    'La plaga de ratas': 'The rat plague',
    'Caza ratas en las alcantarillas': 'Hunt rats in the sewers',
    'Ya has matado 10 ratas. ¡La ciudad te lo agradece!': 'You have killed 10 rats. The city thanks you!',
    'La ciudad está llena de ratas. Mata 10 (llevas {n}).': 'The city is full of rats. Kill 10 (you have killed {n}).',
    'Recoge tu recompensa': 'Collect your reward',
    'Te dieron 100 monedas de oro y 2 pociones de vida.': 'You were given 100 gold coins and 2 health potions.',
    'Mata las 10 ratas.': 'Kill the 10 rats.',

    // --- data/scripts/raids/goblins.js -------------------------------------------------------------
    'Se oyen tambores en el suroeste... ¡los goblins se preparan!': 'Drums are heard in the southwest... the goblins are getting ready!',
    '¡Los goblins avanzan hacia Jetyum por el camino del oeste!': 'The goblins are marching on Jetyum along the western road!',
    'El jefe de los goblins ha llegado con su ocultista.': 'The goblin chief has arrived with his occultist.',

    // --- data/scripts/spells -------------------------------------------------------------------------
    'Corres más (velocidad {v}).': 'You run faster (speed {v}).',
    'No estás envenenado.': 'You are not poisoned.',
    'Ya no estás envenenado.': 'You are no longer poisoned.',

    // --- data/scripts/talkactions/commands.js ------------------------------------------------------
    'Posicion: {posicion}  Vida: {vida}  Nivel: {nivel}  Vocacion: {vocacion}':
        'Position: {posicion}  Health: {vida}  Level: {nivel}  Vocation: {vocacion}',
    'Uso: /item <id>': 'Usage: /item <id>',
    'No existe ningun item con id {id}': 'There is no item with id {id}',
    'Creado a tus pies: {nombre}': 'Created at your feet: {nombre}',
    'Uso: /outfit <tipo> [cabeza] [cuerpo] [piernas] [pies] [anadidos]':
        'Usage: /outfit <type> [head] [body] [legs] [feet] [addons]',
    'Los valores tienen que ser numeros.': 'The values must be numbers.',
    'No se puede: {motivo}': 'Not possible: {motivo}',
    'Aspecto: tipo {tipo}, colores {colores}, anadidos {anadidos}':
        'Outfit: type {tipo}, colors {colores}, addons {anadidos}',
    'No llevas nada.': 'You carry nothing.',
    'Llevas {n} cosa(s):': 'You carry {n} item(s):',
    'Peso: {peso} de {capacidad}.': 'Weight: {peso} of {capacidad}.',

    // data/scripts/talkactions/equipar.js
    'Uso: /equipar <numero de la lista>. Mira /i para verlos.': 'Usage: /equipar <number in the list>. See /i to list them.',
    'No llevas nada en el sitio {n}. Mira /i.': 'You carry nothing at position {n}. See /i.',
    '{objeto} no se puede llevar puesto.': '{objeto} cannot be worn.',
    'Ya te lo has puesto.': 'You are already wearing it.',
    'No se ha podido equipar ({motivo}).': 'It could not be equipped ({motivo}).',
    'Te pones {objeto} en la ranura "{ranura}". Guardas lo que llevabas.':
        'You put on {objeto} in the "{ranura}" slot. You put away what you were wearing.',
    'Te pones {objeto} en la ranura "{ranura}".': 'You put on {objeto} in the "{ranura}" slot.',
    'Llevas puesto: {lista}. Uso: /quitar <ranura>.': 'You are wearing: {lista}. Usage: /quitar <slot>.',
    'No llevas nada puesto.': 'You are not wearing anything.',
    'No llevas nada en la ranura "{ranura}".': 'You have nothing in the "{ranura}" slot.',
    'No se ha podido quitar ({motivo}).': 'It could not be taken off ({motivo}).',
    'Te quitas lo que llevabas en "{ranura}" y vuelve al inventario.':
        'You take off what you had in "{ranura}" and it goes back to your inventory.',

    // data/scripts/talkactions/help.js
    'No hay ningun comando "{comando}". Escribe /ayuda.': 'There is no command "{comando}". Type /ayuda.',
    'Comandos disponibles:': 'Available commands:',
    'Escribe /ayuda <comando> para ver uno solo.': 'Type /ayuda <command> to see just one.',
    '/pos  -  tu posicion, tu vida, tu nivel y tu vocacion': '/pos  -  your position, health, level and vocation',
    '/i  -  lo que llevas encima y cuanto pesa': '/i  -  what you carry and how much it weighs',
    '/stats  -  tus numeros y los del mundo en el que estas': '/stats  -  your numbers and those of the world you are in',
    '/item <id>  -  el nombre de un objeto, por su id': '/item <id>  -  the name of an item, by its id',
    '/outfit <tipo> [cabeza] [cuerpo] [piernas] [pies] [anadidos]  -  cambia tu aspecto. Los colores son indices de la paleta del cliente, no valores de color: el 78 es "el color 78", no "un poco de azul"':
        '/outfit <type> [head] [body] [legs] [feet] [addons]  -  changes your outfit. Colors are indices into the client palette, not color values: 78 is "color 78", not "a bit of blue"',
    '/spells  -  los hechizos de tu vocacion, en un dialogo': '/spells  -  the spells of your vocation, in a dialog',
    '/ayuda [comando]  -  esto mismo, o el detalle de uno': '/ayuda [command]  -  this list, or the details of one command',

    // data/scripts/talkactions/ir.js
    'Lugares: {lista}. Uso: /ir <lugar>': 'Places: {lista}. Usage: /ir <place>',
    'No hay ningún lugar llamado «{nombre}». Lugares: {lista}': 'There is no place called «{nombre}». Places: {lista}',
    'No se puede ir a {nombre} ahora.': 'You cannot go to {nombre} now.',
    'Estás en {nombre} {posicion}.': 'You are at {nombre} {posicion}.',

    // data/scripts/talkactions/party.js
    'Ese jugador no está conectado.': 'That player is not online.',
    'Sólo el líder del grupo puede invitar.': 'Only the party leader can invite.',
    'Ya está en un grupo.': 'That player is already in a party.',
    'No te ha invitado nadie con ese nombre.': 'Nobody with that name has invited you.',
    'No estás en ningún grupo.': 'You are not in a party.',
    'No puedes invitarte a ti mismo.': 'You cannot invite yourself.',
    'Has invitado a {nombre}.': 'You invited {nombre}.',
    '{lider} te invita a su grupo: escribe /party unirse {nombre}': '{lider} invites you to the party: type /party join {nombre}',
    'Tu grupo: {miembros} (manda {lider}).': 'Your party: {miembros} (leader: {lider}).',
    'No estás en ningún grupo. Usa: /party invitar Nombre, /party unirse Nombre, /party salir.':
        'You are not in a party. Use: /party invite Name, /party join Name, /party leave.',
    'No se pudo.': 'Sorry, not possible.',

    // data/scripts/talkactions/player_stats.js
    'Nivel {nivel}, vocacion {vocacion}, en {posicion}.': 'Level {nivel}, vocation {vocacion}, at {posicion}.',
    'Vida {vida} de {maxima} ({porcentaje}%).': 'Health {vida} of {maxima} ({porcentaje}%).',
    'Peso {peso} de {capacidad}.': 'Weight {peso} of {capacidad}.',
    'Llevas {n} cosa(s) y {dinero} de dinero.': 'You carry {n} item(s) and {dinero} gold.',
    'Mundo {nombre} ({tamano}): {waypoints} waypoints, {spawns} spawns, {npcs} npcs colocados.':
        'World {nombre} ({tamano}): {waypoints} waypoints, {spawns} spawns, {npcs} npcs placed.',
    'No hay ningun mapa cargado.': 'No map is loaded.',

    // data/scripts/talkactions/raid.js
    'Raids: {lista}': 'Raids: {lista}',
    'en marcha: {lista}': 'running: {lista}',
    'Empieza la raid «{nombre}» ({n} etapas).': 'The raid «{nombre}» begins ({n} stages).',

    // data/scripts/talkactions/spells.js
    'Ataque': 'Attack',
    'Curación': 'Healing',
    'Apoyo': 'Support',
    'Tu vocación ({vocacion}) no tiene hechizos.': 'Your vocation ({vocacion}) has no spells.',
    'Hechizos (sin vocación)': 'Spells (no vocation)',
    'Hechizos de {vocacion}': 'Spells of {vocacion}',
    'Tienes nivel {n}. Los marcados con ✗ necesitan más nivel.': 'You are level {n}. Those marked with ✗ need a higher level.',
    '{hechizo} ({grupo}): nivel {nivel}, maná {mana}, almas {almas}': '{hechizo} ({grupo}): level {nivel}, mana {mana}, soul {almas}',
    '{hechizo} ({grupo}): nivel {nivel}, maná {mana}': '{hechizo} ({grupo}): level {nivel}, mana {mana}',

    // data/scripts/talkactions/vocacion.js
    'No existe la vocación «{vocacion}».': 'There is no vocation «{vocacion}».',
    'Vocación: {vocacion} (nivel {nivel}). Por nivel: +{vida} vida, +{mana} maná, +{cap} oz. Regenera {rvida} de vida cada {tvida} s y {rmana} de maná cada {tmana} s. Daño cuerpo a cuerpo x{melee}, a distancia x{dist}, golpe cada {velocidad} ms.':
        'Vocation: {vocacion} (level {nivel}). Per level: +{vida} health, +{mana} mana, +{cap} oz. Regenerates {rvida} health every {tvida} s and {rmana} mana every {tmana} s. Melee damage x{melee}, distance x{dist}, one hit every {velocidad} ms.',

    // -----------------------------------------------------------------------
    // Reglas del mundo (engine/world/reglas.js, engine/net/session.js): zonas, PvP, combate,
    // salida, chat y servidor lleno
    // -----------------------------------------------------------------------
    'No puedes atacar desde una zona de protección.': 'You may not attack from a protection zone.',
    'No puedes atacar a quien está en una zona de protección.': 'You may not attack someone in a protection zone.',
    'En este mundo no se puede atacar a otros jugadores.': 'Attacking other players is not allowed in this world.',
    'Aquí no se puede atacar a otros jugadores.': 'You may not attack other players here.',
    'No puedes atacar a otros jugadores hasta el nivel {n}.': 'You may not attack other players until level {n}.',
    'Ese jugador está protegido hasta el nivel {n}.': 'That player is protected until level {n}.',
    'No puedes atacar ahora.': 'You cannot attack right now.',
    'No puedes entrar en una zona de protección después de atacar a otro jugador.':
        'You may not enter a protection zone after attacking another player.',
    'No puedes salir mientras estás en combate.': 'You may not log out during a fight.',
    'No puedes salir aquí.': 'You may not log out here.',
    'el servidor esta lleno ({n} jugadores): prueba mas tarde': 'the server is full ({n} players): try again later',
    'Estás hablando demasiado deprisa: espera un momento.': 'You are talking too fast: wait a moment.',

    // Monturas (reglas.js y la ventana del personaje)
    'No puedes llevar esa montura: {motivo}.': 'You cannot use that mount: {motivo}.',
    'esa montura no existe': 'that mount does not exist',
    'todavía no tienes la montura «{nombre}»': 'you do not have the «{nombre}» mount yet',
    'la montura «{nombre}» es premium': 'the «{nombre}» mount is premium',
    'Esa montura no existe.': 'That mount does not exist.',
    'Todavía no tienes la montura «{nombre}».': 'You do not have the «{nombre}» mount yet.',
    'La montura «{nombre}» es premium.': 'The «{nombre}» mount is premium.',
    'Espera un momento antes de volver a montar o desmontar.': 'Wait a moment before mounting or dismounting again.',
    'Elige primero una montura en la ventana del personaje.': 'Choose a mount in the character window first.',
    'No puedes montar en una zona de protección.': 'You may not mount in a protection zone.',

    // Comandos del personal (data/scripts/talkactions/personal.js, vocacion.js)
    'Sólo un god puede cambiar la vocación.': 'Only a god can change the vocation.',
    'Grupos: {lista}. Uso: /grupo <personaje>, <grupo>': 'Groups: {lista}. Usage: /grupo <character>, <group>',
    '{nombre} es ahora del grupo «{grupo}».': '{nombre} is now in the «{grupo}» group.',
    'No se pudo: {motivo}.': 'Could not do it: {motivo}.',
    'no existe el grupo «{grupo}»': 'there is no «{grupo}» group',
    'no existe ningún personaje llamado «{nombre}»': 'there is no character named «{nombre}»',
    'Monturas: {lista}. Uso: /montura <id>[, personaje]': 'Mounts: {lista}. Usage: /montura <id>[, character]',
    'No existe la montura «{montura}».': 'There is no «{montura}» mount.',
    'No hay nadie dentro llamado «{nombre}».': 'There is nobody online named «{nombre}».',
    '{nombre} tiene ahora la montura «{montura}».': '{nombre} now has the «{montura}» mount.'
};
