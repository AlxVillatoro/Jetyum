/**
 * Inglés: las CASAS y el BANCO.
 *
 * Lo que dice el motor de las casas (engine/world/casas.js: entrar, puertas, listas, alquiler), los
 * comandos `!buyhouse`, `!leavehouse`, `aleta sio`, `aleta som`, `aleta grav` y `alana sio`
 * (data/scripts/talkactions/casas.js), las camas (data/scripts/actions/camas.js) y lo que dice el
 * Banquero (data/npc/ciudad/banquero.js). En inglés, las frases de TFS donde las hay.
 *
 * La clave es la frase en español TAL CUAL sale en pantalla, y los huecos van entre llaves: ver
 * `shared/js/i18n.mjs`. Como en el resto de los NPC, las pistas en inglés nombran las palabras en
 * inglés que el Banquero también entiende («say "deposit"», no «di "depositar"»).
 */
export default {
    // --- Mirar una puerta de casa ---
    "Pertenece a la casa '{nombre}'. {dueno} es su dueño.": "It belongs to house '{nombre}'. {dueno} owns this house.",
    "Pertenece a la casa '{nombre}'. Esta casa no tiene dueño. Cuesta {precio} monedas de oro.":
        "It belongs to house '{nombre}'. Nobody owns this house. It costs {precio} gold coins.",

    // --- Entrar, puertas y echar (el motor) ---
    'No estás invitado a esta casa.': 'You are not invited.',
    'No tienes acceso a esta puerta.': 'You do not have access to this door.',
    'Ya no tienes acceso a la casa «{nombre}».': 'You no longer have access to the house «{nombre}».',
    '{nombre} te ha echado de la casa «{casa}».': '{nombre} kicked you out of the house «{casa}».',

    // --- Las listas de acceso ---
    'Invitados de la casa «{nombre}»': 'Guests of the house «{nombre}»',
    'Subdueños de la casa «{nombre}»': 'Subowners of the house «{nombre}»',
    'Puerta {n} de la casa «{nombre}»': 'Door {n} of the house «{nombre}»',
    'Guardado: {titulo}.': 'Saved: {titulo}.',
    'Ya no puedes cambiar esa lista.': 'You can no longer change that list.',
    'Tienes que estar mirando una puerta de tu casa.': 'You have to be looking at a door of your house.',
    'No puedes editar esa lista.': 'You cannot edit that list.',

    // --- El alquiler ---
    'Se ha pagado el alquiler de la casa «{nombre}» ({renta} de oro) con tu cuenta del banco.':
        'The rent of the house «{nombre}» ({renta} gold) has been paid from your bank account.',
    'Aviso: no has pagado el alquiler de {renta} de oro de la casa «{nombre}». Tienes {dias} días para ponerlo en el banco o la perderás.':
        'Warning! The rent of {renta} gold for your house «{nombre}» is payable. Have it in the bank within {dias} days or you will lose this house.',
    'Has perdido la casa «{nombre}»: no pagaste el alquiler.': 'You have lost the house «{nombre}»: you did not pay the rent.',
    'Lo que había en la casa «{nombre}» ({n} objetos) está en tu depósito.':
        'The items from the house «{nombre}» ({n} items) are in your depot.',

    // --- !buyhouse y !leavehouse ---
    'Has comprado la casa «{nombre}» por {precio} de oro. Ten en el banco el dinero del alquiler.':
        'You have successfully bought the house «{nombre}» for {precio} gold. Be sure to have the money for the rent in the bank.',
    'Tienes que estar mirando la puerta de la casa que quieres comprar.':
        'You have to be looking at the door of the house you would like to buy.',
    'Necesitas nivel {n} para comprar una casa.': 'You need level {n} to buy a house.',
    'Ya eres dueño de una casa.': 'You are already the owner of a house.',
    'Esa casa ya tiene dueño.': 'This house already has an owner.',
    'No tienes dinero suficiente en el banco: la casa cuesta {precio} de oro.':
        'You do not have enough money in the bank: the house costs {precio} gold.',
    'No puedes comprar esa casa.': 'You cannot buy that house.',
    'Has dejado la casa «{nombre}». Lo que había dentro está en tu depósito.':
        'You have successfully left the house «{nombre}». What was inside is in your depot.',
    'No eres el dueño de esta casa.': 'You are not the owner of this house.',
    'No estás dentro de una casa.': 'You are not inside a house.',

    // --- alana sio ---
    '{nombre} ya está fuera de la casa.': '{nombre} is now outside the house.',
    'No hay nadie llamado «{nombre}» en esta casa.': 'There is nobody called «{nombre}» in this house.',
    'No puedes echar a {nombre} de esta casa.': 'You cannot kick {nombre} out of this house.',

    // --- Las camas ---
    '{nombre} está durmiendo ahí.': '{nombre} is sleeping there.',
    'Sólo puedes dormir en una casa en la que estés invitado.': 'You can only sleep in a house you are invited to.',
    'No puedes dormir mientras estás en combate.': 'You cannot sleep while you are in a fight.',
    'No puedes usar esa cama.': 'You cannot use this bed.',

    // --- El Banquero ---
    'No te entiendo. Dime "depositar", "retirar", "saldo" o "transferir".':
        'I don\'t understand. Say "deposit", "withdraw", "balance" or "transfer".',
    'Bienvenido al banco, {nombre}. Puedo guardarte el dinero: dime "depositar", "retirar", "saldo" o "transferir".':
        'Welcome to the bank, {nombre}. I can keep your money safe: say "deposit", "withdraw", "balance" or "transfer".',
    '¿Cuánto quieres depositar? Dime una cifra, o "todo".': 'How much would you like to deposit? Tell me an amount, or "all".',
    '¿Cuánto quieres retirar? Dime una cifra, o "todo".': 'How much would you like to withdraw? Tell me an amount, or "all".',
    '¿Cuánto quieres transferir?': 'How much would you like to transfer?',
    '¿A quién quieres transferir {n} de oro?': 'Who would you like to transfer {n} gold to?',
    '¿De verdad quieres depositar {n} de oro? Di "si" o "no".': 'Would you really like to deposit {n} gold? Say "yes" or "no".',
    '¿Seguro que quieres retirar {n} de oro de tu cuenta? Di "si" o "no".':
        'Are you sure you wish to withdraw {n} gold from your bank account? Say "yes" or "no".',
    '¿De verdad quieres transferir {n} de oro a {nombre}? Di "si" o "no".':
        'Would you really like to transfer {n} gold to {nombre}? Say "yes" or "no".',
    'No llevas dinero encima.': 'You are not carrying any money.',
    'No tienes nada en la cuenta.': 'You have nothing in your account.',
    'No llevas tanto: tienes {n} de oro encima.': 'You are not carrying that much: you have {n} gold on you.',
    'No tienes tanto en la cuenta: tu saldo es de {n} de oro.':
        'You do not have that much in your account: your balance is {n} gold.',
    'No te he propuesto nada. Dime "depositar", "retirar", "saldo" o "transferir".':
        'I have not offered you anything. Say "deposit", "withdraw", "balance" or "transfer".',
    'Hecho: he sumado {n} de oro a tu cuenta. Puedes retirarlo cuando quieras.':
        'Alright, I have added {n} gold to your balance. You can withdraw your money anytime you want to.',
    'No he podido cobrarte: no te cabe el cambio en la mochila.':
        'I could not take your money: the change does not fit in your backpack.',
    'Aquí tienes {n} de oro. Tu saldo es de {saldo} de oro.': 'Here you are, {n} gold. Your account balance is {saldo} gold.',
    'No puedes llevar tanto: no te cabe o pesa demasiado.': 'You cannot carry that much: it does not fit or it is too heavy.',
    'Hecho: has transferido {n} de oro a {nombre}.': 'Very well. You have transferred {n} gold to {nombre}.',
    'No puedes transferirte dinero a ti mismo.': 'You cannot transfer money to yourself.',
    'Sólo puedo transferir a quien esté conectado.': 'I can only transfer to someone who is online.',
    'No conozco a nadie llamado «{nombre}».': 'I do not know anybody called «{nombre}».',
    'Como quieras. ¿Algo más?': 'As you wish. Anything else?',
    'Tu saldo en el banco es de {n} de oro.': 'Your account balance is {n} gold.',
    'Al caer pierdes experiencia y, sin bendiciones, la mochila entera, monedas incluidas. Lo que esta en el banco no se pierde nunca.':
        'When you fall you lose experience and, without blessings, your whole backpack, coins included. What is in the bank is never lost.',
    'Las casas se pagan desde tu cuenta: mira la puerta de una libre y di "!buyhouse". El alquiler tambien sale del banco, asi que ten siempre algo guardado.':
        'Houses are paid from your account: look at the door of a free one and say "!buyhouse". The rent is taken from the bank too, so always keep something saved.',
    'Prestamos no hago, ni pago intereses: guardo lo tuyo y te lo devuelvo entero.':
        'I don\'t make loans or pay interest: I keep what is yours and give it back whole.',
    'Vas con {peso} de {capacidad}. Y las monedas pesan: cien de oro son diez onzas, aunque no lo parezca. Lo del banco no pesa nada.':
        'You are carrying {peso} of {capacidad}. And coins are heavy: a hundred gold weigh ten ounces, though it may not seem so. What is in the bank weighs nothing.'
};
