/**
 * Inglés: la interfaz del cliente del juego (client/jetyum).
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves
 * (`{n}`, `{nombre}`): ver `shared/js/i18n.mjs`.
 */
export default {
    // --- index.html: página, carga y diagnóstico ---
    'Jetyum — cliente': 'Jetyum — client',
    'esperando': 'waiting',
    'Conectando…': 'Connecting…',
    'sin conectar': 'offline',
    'Arrastra para cambiar el alto de la consola': 'Drag to change the console height',

    // --- index.html: ventanas de la barra lateral ---
    'Minimizar': 'Minimize',
    'Cerrar': 'Close',
    'Minimapa': 'Minimap',
    'Minimapa: lo que has visto (la cruz blanca eres tú). Clic: ir andando hasta ahí':
        'Minimap: what you have seen (the white cross is you). Click: walk there',
    'Acercar el minimapa': 'Zoom in the minimap',
    'Alejar el minimapa': 'Zoom out the minimap',
    'Ver la planta de arriba en el minimapa': 'Show the floor above on the minimap',
    'Ver la planta de abajo en el minimapa': 'Show the floor below on the minimap',
    'Volver a centrar el minimapa en ti': 'Center the minimap on you again',
    'Planta que enseña el minimapa': 'Floor shown on the minimap',
    'Vida y maná': 'Health & Mana',
    'Puntos de vida': 'Hit points',
    'Puntos de maná': 'Mana points',
    'Equipo': 'Inventory',
    'Skills': 'Skills',
    'Experiencia': 'Experience',
    'Nivel': 'Level',
    'Progreso hasta el siguiente nivel': 'Progress to the next level',
    'Vocación': 'Vocation',
    'Vida': 'Hit Points',
    'Maná': 'Mana',
    'Almas': 'Soul Points',
    'Capacidad': 'Capacity',
    'Velocidad': 'Speed',
    'Stamina': 'Stamina',
    'Batalla': 'Battle',
    'nadie a la vista': 'nobody in sight',
    'nombre': 'name',
    'Añadir a la lista VIP': 'Add to the VIP list',
    'Misiones': 'Quests',
    'Todavía no hay misiones en este mundo. Las crean los scripts del servidor (data/scripts) con los storages del jugador.':
        'There are no quests in this world yet. They are created by the server scripts (data/scripts) using the player storages.',
    'Opciones': 'Options',
    'Nombres sobre las criaturas': 'Names above creatures',
    'Barras de vida': 'Health bars',
    'Hora en la consola': 'Time in the console',
    'Diagnóstico (fps, red)': 'Diagnostics (fps, network)',
    'Cómo se amplían los píxeles del dibujo': 'How the sprite pixels are scaled up',
    'Suavizado': 'Smoothing',
    'Píxel suave (Scale2x)': 'Smooth pixel (Scale2x)',
    'Suave (bilineal)': 'Smooth (bilinear)',
    'Nítido (sin suavizar)': 'Sharp (no smoothing)',
    'Mochila': 'Backpack',
    'peso / capacidad': 'weight / capacity',

    // --- panels.js: los estados de debajo de la vida (los iconos de Tibia) ---
    'En combate: no puedes salir del juego': 'In a fight: you may not log out',
    'Protección bloqueada: no puedes entrar en una zona de protección':
        'Protection zone blocked: you may not enter a protection zone',
    'En zona de protección: aquí no se puede luchar': 'In a protection zone: no fighting here',
    'Montado (Ctrl+R para desmontar)': 'Mounted (Ctrl+R to dismount)',

    // --- index.html: la ayuda ---
    'Ayuda': 'Help',
    'Flechas': 'Arrows',
    'andar (dos a la vez, en diagonal); con': 'walk (two at once to go diagonally); with',
    ', también W A S D': ', also W A S D',
    'Clic': 'Click',
    'ir andando hasta ahí': 'walk there',
    'Los dos botones': 'Both buttons',
    'mirar': 'look',
    'Clic derecho': 'Right click',
    'sobre un monstruo, atacarlo (otra vez, dejarlo); sobre algo, usarlo (también en la mochila y en los cuerpos); sobre un contenedor, abrirlo o cerrarlo; sobre ti, tu ficha':
        'on a monster, attack it (again, stop); on something, use it (also in the backpack and on corpses); on a container, open or close it; on yourself, your character sheet',
    'Arrastrar': 'Drag',
    'coger y mover cosas: al suelo, a tu equipo, a tu mochila o a un contenedor abierto':
        'pick up and move things: to the ground, to your equipment, to your backpack or to an open container',
    'usar lo que tienes delante (en modo /wasd)': 'use what is in front of you (in /wasd mode)',
    'dejar de atacar': 'stop attacking',
    'Ctrl+R': 'Ctrl+R',
    'Ctrl + flechas': 'Ctrl + arrows',
    'girar sin moverte': 'turn without moving',

    // --- La ventana de atributos (panels.js y main.js) ---
    'Atributos': 'Attributes',
    'Atributos: reparte los puntos que ganas al subir de nivel': 'Attributes: spend the points you earn when you level up',
    'Puntos por repartir': 'Points to spend',
    'Reiniciar atributos': 'Reset attributes',
    'Fuerza': 'Strength',
    'Destreza': 'Dexterity',
    'Inteligencia': 'Intelligence',
    'Vitalidad': 'Vitality',
    'Energía': 'Energy',
    '+{d}% cuerpo a cuerpo, +{c} oz': '+{d}% melee, +{c} oz',
    '+{d}% a distancia': '+{d}% distance',
    '+{d}% magia, +{h}% curación': '+{d}% magic, +{h}% healing',
    '+{v} de vida': '+{v} health',
    '+{m} de maná': '+{m} mana',
    'Cada punto: +{d}% de daño cuerpo a cuerpo y +{c} oz de capacidad': 'Each point: +{d}% melee damage and +{c} oz capacity',
    'Cada punto: +{d}% de daño a distancia': 'Each point: +{d}% distance damage',
    'Cada punto: +{d}% de daño mágico y +{h}% de curación': 'Each point: +{d}% magic damage and +{h}% healing',
    'Cada punto: +{v} de vida máxima': 'Each point: +{v} max health',
    'Cada punto: +{m} de maná máximo': 'Each point: +{m} max mana',
    'Poner un punto (Mayús+clic: cinco)': 'Add a point (Shift+click: five)',
    'Recupera todos los puntos para repartirlos de nuevo': 'Get all your points back to spend them again',
    'Recupera todos los puntos para repartirlos de nuevo (cuesta {n} de oro)': 'Get all your points back to spend them again (costs {n} gold)',
    '¿Recuperar todos tus puntos de atributo para repartirlos de nuevo?': 'Get all your attribute points back to spend them again?',
    '¿Recuperar todos tus puntos de atributo para repartirlos de nuevo? Cuesta {n} de oro.':
        'Get all your attribute points back to spend them again? It costs {n} gold.',
    'Tope: {n}': 'Cap: {n}',
    'FUE': 'STR',
    'DES': 'DEX',
    'al nivel {n}': 'at level {n}',
    'listo por hoy': 'done today',
    'Tiempo': 'Time',
    '{p}/{t} lugares': '{p}/{t} places',
    '{r}/{g} runas': '{r}/{g} runes',
    '{m}/{g} min': '{m}/{g} min',
    'Cómo se ganan': 'How to earn them',
    'pts': 'pts',
    'Los puntos se ganan jugando: subiendo de nivel, caminando, explorando, con la magia, jugando y cazando':
        'Points are earned by playing: leveling up, walking, exploring, using magic, playing and hunting',
    'Caminar': 'Walking',
    'Explorar': 'Exploring',
    'Magia': 'Magic',
    'Tiempo activo': 'Active time',
    'Caza': 'Hunting',
    'hoy ya no: vuelve mañana': 'done for today: come back tomorrow',
    'el próximo, al nivel {n}': 'next one at level {n}',
    'todos conseguidos': 'all earned',
    '{s} / {g} pasos': '{s} / {g} steps',
    '{p} / {t} lugares': '{p} / {t} places',
    '{a} / {g} zonas': '{a} / {g} areas',
    '{r} / {g} runas': '{r} / {g} runes',
    'maná {m}%': 'mana {m}%',
    '{m} / {g} min': '{m} / {g} min',
    '{s} especies': '{s} species',
    '{m} con {k} muertes': '{m} with {k} kills',
    '/atributos': '/attributes',
    'repartir tus puntos de atributo (también en la ventana Atributos)': 'spend your attribute points (also in the Attributes window)',
    'montar o desmontar (la montura se elige en tu ficha; no se monta en una zona de protección)':
        'mount or dismount (choose the mount in your character sheet; you cannot mount in a protection zone)',
    'tus': 'your',
    ': magias y objetos (configúralas con': ': spells and items (set them up with',
    'o el botón del teclado junto a la capacidad)': 'or the keyboard button next to the capacity)',
    'Escribir': 'Typing',
    'va directo al chat; Intro lo manda (con /wasd, Intro para empezar a escribir)':
        'goes straight to the chat; Enter sends it (with /wasd, Enter to start typing)',
    'curarte (gasta maná)': 'heal yourself (costs mana)',
    'correr más (nivel 14)': 'run faster (level 14)',
    'viajar a un sitio del mapa': 'travel to a place on the map',
    'más comandos': 'more commands',

    // --- index.html: botones de la barra lateral ---
    'Stop: dejar de atacar y de andar (Escape)': 'Stop: stop attacking and walking (Escape)',
    'Quests: registro de misiones': 'Quests: quest log',
    'Options: opciones del cliente': 'Options: client options',
    'Help: controles y comandos': 'Help: controls and commands',
    'Skills: nivel, experiencia y habilidades': 'Skills: level, experience and skills',
    'Battle: criaturas a la vista (clic para atacar)': 'Battle: creatures in sight (click to attack)',
    'VIP: tu lista de amigos': 'VIP: your friends list',
    'Logout: salir del juego': 'Logout: leave the game',

    // --- index.html: la consola ---
    'Lo que se dice a tu alrededor y los avisos': 'What is said around you, and notices',
    'Sólo los mensajes del servidor': 'Server messages only',
    'Intro para escribir: habla, lanza un hechizo (exura) o un comando (/ayuda)':
        'Enter to type: talk, cast a spell (exura) or a command (/ayuda)',

    // --- index.html: la entrada (login) ---
    'Entrar': 'Log in',
    'Crear cuenta': 'Create account',
    'Cuenta': 'Account',
    'Contraseña': 'Password',
    'Mostrar la contraseña': 'Show password',
    'Recordar cuenta en este navegador': 'Remember account in this browser',
    'Cambiar de cuenta': 'Change account',
    'Personajes de': 'Characters of',
    'Personajes': 'Characters',
    'de 3 a 20 letras o números': '3 to 20 letters or numbers',
    'al menos 4 caracteres': 'at least 4 characters',
    'Repite la contraseña': 'Repeat the password',
    'Nombre del personaje': 'Character name',
    'Sin vocación': 'No vocation',
    'Sexo': 'Sex',
    'Hombre': 'Male',
    'Mujer': 'Female',
    'Si la cuenta ya existe (con esa contraseña), se le añade este personaje.':
        'If the account already exists (with that password), this character is added to it.',
    'Entrar al mundo': 'Enter the world',

    // --- main.js: estado de la conexión (barra lateral) ---
    'conectado, entrando al mundo...': 'connected, entering the world...',
    'desconectado, reintentando...': 'disconnected, retrying...',
    'no se pudo conectar, reintentando...': 'could not connect, retrying...',
    'error de conexion': 'connection error',
    'dentro del mundo como {nombre}': 'in the world as {nombre}',
    'has muerto': 'you are dead',
    'has muerto a manos de {asesino}': 'you were killed by {asesino}',
    'has muerto; soltaste {n} cosa(s)': 'you are dead; you dropped {n} item(s)',
    'has muerto a manos de {asesino}; soltaste {n} cosa(s)': 'you were killed by {asesino}; you dropped {n} item(s)',
    'no se pudo entrar: {error}': 'could not log in: {error}',
    'has salido del mundo': 'you have left the world',
    'No puedes salir ahora.': 'You may not log out now.',

    // --- main.js: mensajes en la consola ---
    'Has muerto.': 'You are dead.',
    'Has muerto a manos de {asesino}.': 'You were killed by {asesino}.',
    'Tu grupo: {miembros} (manda {lider}). Escribe «/p texto» para hablarles.':
        'Your party: {miembros} (leader: {lider}). Type «/p text» to talk to them.',
    'Ya no estás en ningún grupo.': 'You are no longer in a party.',
    'Tú: {texto}': 'You: {texto}',
    'Modo WASD: caminas con W, A, S, D (y las flechas). Pulsa Intro para escribir.':
        'WASD mode: you walk with W, A, S, D (and the arrows). Press Enter to type.',
    'Chat siempre abierto: escribe directamente; caminas con las flechas.':
        'Chat always open: type directly; you walk with the arrows.',
    'Intro para escribir: habla, un hechizo (exura) o un comando (/ayuda). /wasd: escribir sin Intro':
        'Enter to type: talk, a spell (exura) or a command (/ayuda). /wasd: type without Enter',
    'Escribe aquí: habla, un hechizo (exura) o un comando (/ayuda). Camina con las flechas':
        'Type here: talk, a spell (exura) or a command (/ayuda). Walk with the arrows',

    // --- main.js: la pantalla de carga ---
    'Conectando con el servidor…': 'Connecting to the server…',
    'Entrando al mundo…': 'Entering the world…',
    'Cargando los dibujos…': 'Loading the sprites…',
    'Cargando el escenario… ({hechas} de {total})': 'Loading the scenery… ({hechas} of {total})',
    'Listo': 'Ready',

    // --- main.js: diagnóstico (se parte por « | ») ---
    'dibujo {total} ops ({suelo} suelo, {items} items, {criaturas} criaturas)':
        'drawing {total} ops ({suelo} ground, {items} items, {criaturas} creatures)',
    'mundo {tiles} tiles, {criaturas} criaturas': 'world {tiles} tiles, {criaturas} creatures',
    'plantas {plantas}': 'floors {plantas}',
    'camara {posicion}': 'camera {posicion}',
    'red {n} msgs': 'network {n} msgs',

    // --- main.js: diario de misiones ---
    'Todavía no has empezado ninguna misión. Habla con la gente de la ciudad.':
        'You have not started any quest yet. Talk to the people in town.',

    // --- main.js: la entrada (login) y la lista de personajes ---
    'Rellena la cuenta, la contraseña y el nombre del personaje.': 'Fill in the account, the password and the character name.',
    'Las dos contraseñas no coinciden.': 'The two passwords do not match.',
    'Elige un personaje de la lista.': 'Choose a character from the list.',
    'Escribe tu cuenta y tu contraseña.': 'Enter your account and your password.',
    'Crear y entrar': 'Create and enter',
    'Esta cuenta todavía no tiene personajes: créalo en «Crear cuenta» (con la misma cuenta y contraseña).':
        'This account has no characters yet: create one in «Create account» (with the same account and password).',
    'Nivel {nivel} · {vocacion}': 'Level {nivel} · {vocacion}',
    'en el mundo': 'online',
    'Doble clic para entrar con {nombre}': 'Double-click to play as {nombre}',
    'Ocultar la contraseña': 'Hide password',

    // --- connection.js: errores al pedir los personajes ---
    'no se puede conectar con el servidor': 'cannot connect to the server',
    'el servidor no responde': 'the server does not respond',
    'no se pudo entrar': 'could not log in',
    'no se puede conectar con el servidor: ¿está encendido el motor?': 'cannot connect to the server: is the engine running?',
    'el servidor cerró la conexión': 'the server closed the connection',

    // --- panels.js: el equipo (ranuras, almas, capacidad) ---
    'collar': 'necklace',
    'cabeza': 'head',
    'mochila': 'backpack',
    'arma': 'weapon',
    'cuerpo': 'body',
    'escudo': 'shield',
    'anillo': 'ring',
    'piernas': 'legs',
    'munición': 'ammo',
    'pies': 'feet',
    '{ranura}: vacía': '{ranura}: empty',
    '{ranura}: vacia': '{ranura}: empty',
    '{objeto} (collar)': '{objeto} (necklace)',
    '{objeto} (cabeza)': '{objeto} (head)',
    '{objeto} (mochila)': '{objeto} (backpack)',
    '{objeto} (arma)': '{objeto} (weapon)',
    '{objeto} (cuerpo)': '{objeto} (body)',
    '{objeto} (escudo)': '{objeto} (shield)',
    '{objeto} (anillo)': '{objeto} (ring)',
    '{objeto} (piernas)': '{objeto} (legs)',
    '{objeto} (munición)': '{objeto} (ammo)',
    '{objeto} (pies)': '{objeto} (feet)',
    'alma': 'soul',
    'Capacidad libre (onzas)': 'Free capacity (oz)',
    'Hotkeys: magias y objetos en F1–F12 (Ctrl+K)': 'Hotkeys: spells and items on F1–F12 (Ctrl+K)',
    'sin dibujo': 'no sprite',

    // --- panels.js: la mochila y el peso ---
    '{objeto} (arrastra para moverlo)': '{objeto} (drag to move it)',
    '{dentro}/{huecos} huecos · {peso} / {capacidad} oz': '{dentro}/{huecos} slots · {peso} / {capacidad} oz',

    // --- panels.js: stats y skills ---
    '{porcentaje}% hasta el nivel {nivel}': '{porcentaje}% to level {nivel}',
    '{porcentaje}% hasta el nivel {nivel} ({falta} de experiencia)': '{porcentaje}% to level {nivel} ({falta} experience left)',
    'sin vocación': 'no vocation',
    'Nivel mágico': 'Magic Level',
    'Puño': 'Fist Fighting',
    'Maza': 'Club Fighting',
    'Espada': 'Sword Fighting',
    'Hacha': 'Axe Fighting',
    'Distancia': 'Distance Fighting',
    'Escudo': 'Shielding',
    'Pesca': 'Fishing',
    'vida {actual} de {maximo}': 'health {actual} of {maximo}',
    'maná {actual} de {maximo}': 'mana {actual} of {maximo}',

    // --- lateral.js: VIP y batalla ---
    'añade a tus amigos abajo': 'add your friends below',
    '{nombre}: a la vista': '{nombre}: in sight',
    '{nombre}: no lo ves': '{nombre}: out of sight',
    'Quitar de la lista': 'Remove from the list',
    'Atacando a {nombre} (clic para dejarlo)': 'Attacking {nombre} (click to stop)',
    'Clic para atacar a {nombre}': 'Click to attack {nombre}',

    // --- consola.js: pestañas ---
    'Grupo': 'Party',
    'Mensajes de tu grupo': 'Messages from your party',
    'Conversación privada con {nombre}': 'Private conversation with {nombre}',
    'Cerrar esta pestaña': 'Close this tab',

    // --- dialogo.js ---
    'Información': 'Information',
    'Aceptar': 'OK',
    'Cancelar': 'Cancel',
    'Guardar': 'Save',

    // --- comercio.js: la tienda de un NPC ---
    'Comprar': 'Buy',
    'Vender': 'Sell',
    '{objeto} (tienes {n})': '{objeto} (you have {n})',
    'no vende nada': 'sells nothing',
    'no te compra nada': 'buys nothing from you',
    'Uno menos': 'One less',
    'Uno más': 'One more',
    '{total} oro · tienes {dinero}': '{total} gold · you have {dinero}',

    // --- contenedor.js: un contenedor abierto (cuerpo, caja) ---
    '{objeto} (arrástralo para moverlo; clic derecho: usarlo; los dos botones: mirarlo)':
        '{objeto} (drag to move it; right click: use it; both buttons: look at it)',
    'Coger todo (a tu mochila)': 'Take all (to your backpack)',
    'vacío': 'empty',

    // --- hotkeys.js: la ventana de hotkeys ---
    'No tienes ningún objetivo.': 'You have no target.',
    'objeto {id}': 'item {id}',
    '(al chat)': '(to chat)',
    'en el objetivo': 'on target',
    'en ti': 'on yourself',
    'Nada': 'Nothing',
    'Magia o texto': 'Spell or text',
    'Objeto': 'Item',
    'Enviar al momento': 'Send immediately',
    'no llevas nada': 'you carry nothing',
    'Usar en mí': 'Use on myself',
    'Usar en el objetivo': 'Use on target',
    'Usar con la cruz': 'Use with crosshair',
    'con la cruz': 'with crosshair',

    // --- usarcon.js: la cruz de «usar con» (runas y herramientas) ---
    'Elige sobre qué usarlo (Escape o clic derecho: cancelar)': 'Choose what to use it on (Escape or right click: cancel)',
    'Elige sobre qué usarlo (Escape o clic derecho: cancelar).': 'Choose what to use it on (Escape or right click: cancel).',

    // --- index.html y modoscombate.js: los modos de combate, junto al equipo ---
    'Modos de combate': 'Fight modes',
    'Ofensivo: pegas más fuerte y te defiendes menos': 'Offensive: you hit harder and defend less',
    'Equilibrado: tanto ataque como defensa': 'Balanced: as much attack as defense',
    'Defensivo: te defiendes mejor y pegas menos': 'Defensive: you defend better and hit less',
    'Perseguir: ir detrás de tu objetivo': 'Chase: follow your target',
    'Modo seguro: no atacar por error a un jugador sin calavera': 'Secure mode: do not attack an unmarked player by mistake',
    'Cerrar (Ctrl+K)': 'Close (Ctrl+K)',
    'F1–F12 y Shift+F1–F12 · Ctrl+K abre y cierra': 'F1–F12 and Shift+F1–F12 · Ctrl+K opens and closes',

    // --- personaje.js: la ventana del personaje (aspecto y ficha) ---
    'Girar a la izquierda': 'Turn left',
    'Girar a la derecha': 'Turn right',
    'mira al norte': 'facing north',
    'mira al este': 'facing east',
    'mira al sur': 'facing south',
    'mira al oeste': 'facing west',
    'Aspecto anterior': 'Previous outfit',
    'Aspecto siguiente': 'Next outfit',
    'aspecto {n}': 'outfit {n}',
    'Cabeza': 'Head',
    'Cuerpo': 'Body',
    'Piernas': 'Legs',
    'Pies': 'Feet',
    'Elegir el color de: {parte}': 'Choose the color of: {parte}',
    'Este aspecto no tiene añadido {n}': 'This outfit has no addon {n}',
    'Ponerse o quitarse el añadido {n}': 'Put on or take off addon {n}',
    'añadido {n}': 'addon {n}',
    '{libre} libres de {total}': '{libre} free of {total}',
    'mujer': 'female',
    'hombre': 'male',
    'Cerrar (Escape)': 'Close (Escape)',
    'Guardar aspecto': 'Save outfit',
    'Ponerse este aspecto y estos colores': 'Wear this outfit and these colors',
    'Ponerse este aspecto, estos colores y esta montura': 'Wear this outfit, these colors and this mount',
    'Montura': 'Mount',
    'Todavía no tienes monturas.': 'You have no mounts yet.',
    'Montura anterior': 'Previous mount',
    'Montura siguiente': 'Next mount',
    'Ninguna': 'None',
    '+{n} de velocidad': '+{n} speed',
    'Vas a pie.': 'You are on foot.',
    'Ir montado (también con Ctrl+R)': 'Ride the mount (also with Ctrl+R)',
    'Elige antes una montura': 'Choose a mount first',
    'Montar': 'Ride',

    // --- renderer.js: lo que dice una criatura, sobre su cabeza (lienzo) ---
    '{nombre} dice:': '{nombre} says:',

    // --- El selector de idioma (index.html) ---
    'Idioma': 'Language',
    'Idioma / Language': 'Language',
    'Idioma de la interfaz y de los mensajes del juego': 'Language of the interface and of the game messages'
};
