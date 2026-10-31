/**
 * Inglés: los GREMIOS y los CASTIGOS.
 *
 * Lo que dice el motor de los gremios (engine/world/gremios.js: avisos al gremio, el look), los
 * comandos `!createguild`, `!joinguild`, `!guildinvite`... (data/scripts/talkactions/gremios.js), lo
 * que dice el motor de los castigos al entrar, al echar y al silenciar (engine/world/castigos.js) y
 * los comandos de GM `/ban`, `/mute`, `/baninfo`... (data/scripts/talkactions/castigos.js). En
 * inglés, las frases de TFS donde las hay («You are muted for N minutes.», «He is Leader of the …»).
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves: ver
 * `shared/js/i18n.mjs`. Lo que va dentro de un hueco se traduce también si es una frase conocida:
 * por eso los nombres de los rangos («Líder») y «un administrador» van sueltos.
 */
export default {
    // --- Los rangos (dentro del look, de los avisos y de la ventana de !guild) ---
    'Líder': 'Leader',
    'Vicelíder': 'Vice-Leader',
    'Miembro': 'Member',

    // --- El look, como en TFS ---
    'Eres {rango} del gremio {gremio}.': 'You are {rango} of the {gremio}.',
    'Eres {rango} del gremio {gremio} ({apodo}).': 'You are {rango} of the {gremio} ({apodo}).',
    'Él es {rango} del gremio {gremio}.': 'He is {rango} of the {gremio}.',
    'Él es {rango} del gremio {gremio} ({apodo}).': 'He is {rango} of the {gremio} ({apodo}).',
    'Ella es {rango} del gremio {gremio}.': 'She is {rango} of the {gremio}.',
    'Ella es {rango} del gremio {gremio} ({apodo}).': 'She is {rango} of the {gremio} ({apodo}).',

    // --- Los avisos al gremio (el motor) ---
    '{quien} te ha invitado al gremio {gremio}. Escribe !joinguild {gremio} para entrar.':
        '{quien} has invited you to the guild {gremio}. Type !joinguild {gremio} to join.',
    '{nombre} se ha unido al gremio.': '{nombre} has joined the guild.',
    '{nombre} ha dejado el gremio.': '{nombre} has left the guild.',
    'Te han expulsado del gremio {gremio}.': 'You have been kicked from the guild {gremio}.',
    '{nombre} ha sido expulsado del gremio por {quien}.': '{nombre} has been kicked from the guild by {quien}.',
    '{nombre} es ahora {rango} del gremio.': '{nombre} is now {rango} of the guild.',
    'El gremio {gremio} se ha disuelto.': 'The guild {gremio} has been disbanded.',
    'Mensaje del día del gremio: {motd}': 'Guild message of the day: {motd}',

    // --- Los comandos de los gremios ---
    'Este servidor no tiene gremios (no tiene base de datos).': 'This server has no guilds (it has no database).',
    'No estás en ningún gremio.': 'You are not in a guild.',
    'No tienes rango para eso en el gremio.': 'Your guild rank does not allow that.',
    'No existe ningún personaje llamado «{nombre}».': 'There is no character called «{nombre}».',
    'No puedes hacerte eso a ti mismo.': 'You cannot do that to yourself.',
    '{nombre} no es de tu gremio.': '{nombre} is not in your guild.',
    'No se ha podido.': 'It could not be done.',
    'Uso: !createguild <nombre>': 'Usage: !createguild <name>',
    'Uso: !guildinvite <nombre>': 'Usage: !guildinvite <name>',
    'Uso: !guildkick <nombre>': 'Usage: !guildkick <name>',
    'Uso: !guildpromote <nombre>': 'Usage: !guildpromote <name>',
    'Uso: !guilddemote <nombre>': 'Usage: !guilddemote <name>',
    'Uso: !guildleader <nombre>': 'Usage: !guildleader <name>',
    'Has fundado el gremio {gremio}. Eres su líder.': 'You have founded the guild {gremio}. You are its leader.',
    'Necesitas nivel {n} para fundar un gremio.': 'You need level {n} to create a guild.',
    'Ya estás en un gremio.': 'You are already in a guild.',
    'El nombre de un gremio tiene que tener de {min} a {max} letras y espacios.':
        'A guild name must have {min} to {max} letters and spaces.',
    'Ya existe un gremio llamado {nombre}.': 'There is already a guild called {nombre}.',
    'Te han invitado a: {lista}. Uso: !joinguild <gremio>': 'You have been invited to: {lista}. Usage: !joinguild <guild>',
    'No tienes invitaciones a ningún gremio.': 'You have no guild invitations.',
    'Has entrado en el gremio {gremio}.': 'You have joined the guild {gremio}.',
    'No existe ningún gremio llamado «{nombre}».': 'There is no guild called «{nombre}».',
    'No te han invitado al gremio {gremio}.': 'You have not been invited to the guild {gremio}.',
    'Has dejado el gremio {gremio}.': 'You have left the guild {gremio}.',
    'El líder no puede dejar el gremio: pasa el mando con !guildleader o disuélvelo con !disbandguild.':
        'The leader cannot leave the guild: pass the leadership with !guildleader or disband it with !disbandguild.',
    '{nombre} está invitado al gremio {gremio}.': '{nombre} has been invited to the guild {gremio}.',
    '{nombre} ya está en un gremio.': '{nombre} is already in a guild.',
    '{nombre} ya estaba invitado.': '{nombre} was already invited.',
    'Has retirado la invitación de {nombre}.': 'You have revoked the invitation of {nombre}.',
    '{nombre} ya no es del gremio.': '{nombre} is no longer in the guild.',
    'No puedes echar a {nombre}: su rango es igual o mayor que el tuyo.':
        'You cannot kick {nombre}: their rank is equal to or higher than yours.',
    '{nombre} es ahora {rango}.': '{nombre} is now {rango}.',
    '{nombre} ya tiene el rango más alto: para hacerle líder, usa !guildleader.':
        '{nombre} already has the highest rank: to make them leader, use !guildleader.',
    '{nombre} ya tiene el rango más bajo.': '{nombre} already has the lowest rank.',
    'No puedes degradar al líder.': 'You cannot demote the leader.',
    '{nombre} es ahora el líder del gremio, y tú su vicelíder.': '{nombre} is now the leader of the guild, and you are vice-leader.',
    'Has disuelto el gremio {gremio}.': 'You have disbanded the guild {gremio}.',
    'El gremio no tiene mensaje del día.': 'The guild has no message of the day.',
    'Has cambiado el mensaje del día del gremio.': 'You have changed the guild message of the day.',
    'Has quitado el mensaje del día del gremio.': 'You have removed the guild message of the day.',
    'Tu apodo en el gremio es ahora «{apodo}».': 'Your guild nick is now «{apodo}».',
    'Has quitado tu apodo del gremio.': 'You have removed your guild nick.',
    '{nombre} tiene ahora el apodo «{apodo}».': '{nombre} now has the guild nick «{apodo}».',
    'Has quitado el apodo de {nombre}.': 'You have removed the guild nick of {nombre}.',
    'Un apodo puede tener hasta {max} letras, cifras y espacios.': 'A nick can have up to {max} letters, digits and spaces.',

    // --- La ventana de !guild ---
    'Gremio {gremio}': 'Guild {gremio}',
    'Fundado el {fecha}.': 'Founded on {fecha}.',
    'Mensaje del día: {motd}': 'Message of the day: {motd}',
    'Miembros: {n}. Conectados: {m}.': 'Members: {n}. Online: {m}.',

    // --- Los castigos al entrar y al echar (el motor) ---
    'un administrador': 'a gamemaster',
    'Tu cuenta ha sido suspendida hasta el {fecha} por {gm}. Motivo: {motivo}.':
        'Your account has been banned until {fecha} by {gm}. Reason: {motivo}.',
    'Tu cuenta ha sido suspendida para siempre por {gm}. Motivo: {motivo}.':
        'Your account has been permanently banned by {gm}. Reason: {motivo}.',
    'Tu IP ha sido suspendida hasta el {fecha} por {gm}. Motivo: {motivo}.':
        'Your IP has been banned until {fecha} by {gm}. Reason: {motivo}.',
    'Tu IP ha sido suspendida para siempre por {gm}. Motivo: {motivo}.':
        'Your IP has been permanently banned by {gm}. Reason: {motivo}.',
    'Tu personaje tiene el nombre bloqueado: tienes que cambiarlo antes de volver a jugar. Motivo: {motivo}.':
        'Your character has been namelocked: its name must be changed before playing again. Reason: {motivo}.',
    'Un administrador te ha sacado del juego.': 'A gamemaster has kicked you from the game.',
    'Estás silenciado durante {n} minutos.': 'You are muted for {n} minutes.',
    'Un administrador te ha silenciado durante {n} minutos.': 'A gamemaster has muted you for {n} minutes.',
    'Ya puedes volver a hablar.': 'You can speak again.',

    // --- /baninfo ---
    'Castigos de {nombre}': 'Punishments of {nombre}',
    'Cuenta suspendida hasta el {fecha} por {gm}.': 'Account banned until {fecha} by {gm}.',
    'Cuenta suspendida para siempre por {gm}.': 'Account permanently banned by {gm}.',
    'Motivo: {motivo}.': 'Reason: {motivo}.',
    'Desde: {fecha}.': 'Since: {fecha}.',
    'La cuenta no está suspendida.': 'The account is not banned.',
    'Nombre bloqueado por {gm} el {fecha}. Motivo: {motivo}.': 'Namelocked by {gm} on {fecha}. Reason: {motivo}.',
    'Suspensiones anteriores: {n}.': 'Previous bans: {n}.',
    '{desde} - {hasta}, por {gm}. Motivo: {motivo}.': '{desde} - {hasta}, by {gm}. Reason: {motivo}.',

    // --- Los comandos de GM ---
    'Este servidor no guarda castigos (no tiene base de datos).': 'This server does not keep punishments (it has no database).',
    '{nombre} no está conectado.': '{nombre} is not online.',
    'No puedes castigarte a ti mismo.': 'You cannot punish yourself.',
    'No puedes castigar a {nombre}: es del personal y de un grupo igual o mayor que el tuyo.':
        'You cannot punish {nombre}: they are staff with a group equal to or higher than yours.',
    'Los días tienen que ser un número.': 'The days must be a number.',
    'Los minutos tienen que ser un número mayor que cero.': 'The minutes must be a number greater than zero.',
    'No se sabe desde qué IP juega {nombre}.': 'The IP {nombre} plays from is unknown.',
    'La cuenta de {nombre} no está suspendida.': 'The account of {nombre} is not banned.',
    '{nombre} no está silenciado.': '{nombre} is not muted.',
    'Uso: /ban <personaje>[, días[, motivo]]': 'Usage: /ban <character>[, days[, reason]]',
    'Uso: /unban <personaje>': 'Usage: /unban <character>',
    'Uso: /ipban <personaje>[, días[, motivo]]': 'Usage: /ipban <character>[, days[, reason]]',
    'Uso: /namelock <personaje>[, motivo]': 'Usage: /namelock <character>[, reason]',
    'Uso: /kick <personaje>': 'Usage: /kick <character>',
    'Uso: /mute <personaje>[, minutos]': 'Usage: /mute <character>[, minutes]',
    'Uso: /unmute <personaje>': 'Usage: /unmute <character>',
    'Uso: /baninfo <personaje>': 'Usage: /baninfo <character>',
    'La cuenta de {nombre} queda suspendida para siempre.': 'The account of {nombre} is now permanently banned.',
    'La cuenta de {nombre} queda suspendida hasta el {fecha}.': 'The account of {nombre} is now banned until {fecha}.',
    'La IP de {nombre} queda suspendida para siempre.': 'The IP of {nombre} is now permanently banned.',
    'La IP de {nombre} queda suspendida hasta el {fecha}.': 'The IP of {nombre} is now banned until {fecha}.',
    'La cuenta de {nombre} ya no está suspendida.': 'The account of {nombre} is no longer banned.',
    '{nombre} tiene el nombre bloqueado: no entrará hasta que se lo cambien.':
        '{nombre} is namelocked: they cannot log in until their name is changed.',
    '{nombre} está fuera del juego.': '{nombre} has been kicked from the game.',
    '{nombre} está silenciado durante {n} minutos.': '{nombre} is muted for {n} minutes.',
    '{nombre} ya puede hablar.': '{nombre} can speak again.'
};
