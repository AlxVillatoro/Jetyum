'use strict';

/**
 * El banquero.
 *
 * GUARDA EL DINERO, como los banqueros de Tibia: lo que está en el banco no se lleva encima, así que
 * no pesa y NO SE PIERDE AL MORIR. Es el `balance` de TFS (la columna `players.balance` de la base),
 * y de ahí se pagan las casas y su alquiler (engine/world/casas.js).
 *
 * Lo que entiende, con las palabras del banquero de TFS (data/npc/lib/npcsystem, el módulo de banco):
 *
 *   - «depositar 500», «depositar todo» (o «depositar» y luego la cifra): de la mochila al banco;
 *   - «retirar 500», «retirar todo»: del banco a la mochila, si te cabe y puedes con el peso;
 *   - «saldo»: lo que tienes en el banco, y lo que llevas encima;
 *   - «transferir 500 a Pepe» (o por pasos: la cifra y luego el nombre): de tu saldo al de otro
 *     personaje, esté conectado o no;
 *   - y cada operación espera un «si» antes de hacerse, como en TFS: «no» la deja sin efecto.
 *
 * Las cuentas las hace el motor (`player.depositMoney`, `withdrawMoney`, `transferMoney` y
 * `getBankBalance`, engine/scripting/entities.js), que comprueba todo antes de tocar nada: aquí no se
 * suma ni se resta, sólo se pregunta y se dice el resultado. Antes este NPC sólo decía que el banco
 * estaba «por abrir», porque el contenido no podía mover monedas ni había dónde apuntar un saldo;
 * hoy el motor hace las dos cosas.
 *
 * LA OPERACIÓN PENDIENTE se guarda EN EL NPC (`npc.banco`), con el id de quien la pidió: es el truco
 * del sanador para recordar algo entre una frase y la siguiente, y el id es lo que impide que el «si»
 * de otro jugador mueva el dinero del primero. Mientras espera un nombre o una cifra, cualquier frase
 * es la respuesta (`atender`): un nombre como «Gold Digger» no tiene que confundirse con «oro».
 *
 * EL DINERO ES LA SUMA DE TODAS LAS MONEDAS, como en Tibia: oro (1), platino (100) y cristal
 * (10 000), `coinTypes` en el mundo. Se cambian unas por otras con clic derecho
 * (`data/scripts/actions/monedas.js`).
 *
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 */

/** Las palabras que significan «todo» al decir una cifra. */
const TODO = ['todo', 'todos', 'all', 'everything'];

/** Las palabras que se saltan entre la cifra y el nombre: «transferir 500 a Pepe». */
const RELLENO = ['a', 'al', 'para', 'to', 'de', 'oro', 'gold', 'monedas', 'coins'];

/** La cifra que se dice (500), `'todo'`, o null si no hay ninguna. */
function cifra(words) {
    const numero = words.find((w) => /^\d+$/.test(w));
    if (numero) {
        return Math.trunc(Number(numero));
    }
    return words.some((w) => TODO.includes(w)) ? 'todo' : null;
}

/** El nombre que se dice detrás de la cifra («transferir 500 a pepe perez» -> «pepe perez»). */
function nombreTrasCifra(words) {
    const i = words.findIndex((w) => /^\d+$/.test(w));
    const resto = (i === -1 ? [] : words.slice(i + 1));
    while (resto.length > 0 && RELLENO.includes(resto[0])) {
        resto.shift();
    }
    return resto.join(' ');
}

/** La operación pendiente de ESTE jugador, o null. */
function pendiente(npc, player) {
    const p = npc.banco;
    return p && p.jugador === player.getId() ? p : null;
}

/** Lo que se pregunta antes de hacer la operación. */
function confirmar(npc, player, accion, cantidad, nombre) {
    npc.banco = { jugador: player.getId(), paso: 'confirmar', accion, cantidad, nombre: nombre || '' };
    if (accion === 'depositar') {
        npc.say('¿De verdad quieres depositar ' + cantidad + ' de oro? Di "si" o "no".');
    } else if (accion === 'retirar') {
        npc.say('¿Seguro que quieres retirar ' + cantidad + ' de oro de tu cuenta? Di "si" o "no".');
    } else {
        npc.say('¿De verdad quieres transferir ' + cantidad + ' de oro a ' + nombre + '? Di "si" o "no".');
    }
}

/**
 * Sigue una operación con la cifra (o «todo») que se acaba de decir: se comprueba lo que se puede
 * comprobar ya y se pide el siguiente paso.
 */
function conCifra(npc, player, accion, valor, nombre) {
    let cantidad = valor;
    if (cantidad === 'todo') {
        cantidad = accion === 'depositar' ? player.getMoney() : player.getBankBalance();
    }
    if (!(cantidad > 0)) {
        npc.banco = null;
        npc.say(accion === 'depositar' ? 'No llevas dinero encima.' : 'No tienes nada en la cuenta.');
        return;
    }
    if (accion === 'depositar' && player.getMoney() < cantidad) {
        npc.banco = null;
        npc.say('No llevas tanto: tienes ' + player.getMoney() + ' de oro encima.');
        return;
    }
    if (accion !== 'depositar' && player.getBankBalance() < cantidad) {
        npc.banco = null;
        npc.say('No tienes tanto en la cuenta: tu saldo es de ' + player.getBankBalance() + ' de oro.');
        return;
    }
    if (accion === 'transferir' && !nombre) {
        npc.banco = { jugador: player.getId(), paso: 'nombre', accion, cantidad };
        npc.say('¿A quién quieres transferir ' + cantidad + ' de oro?');
        return;
    }
    confirmar(npc, player, accion, cantidad, nombre);
}

/** Empieza una operación: con la cifra si la ha dicho, o preguntándola. */
function empezar(npc, player, accion, words) {
    const valor = cifra(words);
    if (valor === null) {
        npc.banco = { jugador: player.getId(), paso: 'cantidad', accion };
        npc.say(accion === 'depositar' ? '¿Cuánto quieres depositar? Dime una cifra, o "todo".'
            : accion === 'retirar' ? '¿Cuánto quieres retirar? Dime una cifra, o "todo".'
                : '¿Cuánto quieres transferir?');
        return;
    }
    conCifra(npc, player, accion, valor, accion === 'transferir' ? nombreTrasCifra(words) : '');
}

/**
 * MIENTRAS ESPERA UNA RESPUESTA, la frase es la respuesta: la cifra o el nombre. Devuelve si la ha
 * consumido; si no (no había nada pendiente, o no es una cifra), la palabra clave sigue su camino.
 */
function responder(npc, player, words) {
    const p = pendiente(npc, player);
    if (!p) {
        return false;
    }
    if (p.paso === 'nombre') {
        // «no» a secas no es un nombre: deja la operación sin efecto (la palabra clave «no»).
        const resto = words.slice();
        while (resto.length > 0 && RELLENO.includes(resto[0])) {
            resto.shift();
        }
        const nombre = resto.join(' ');
        if (!nombre || (words.length === 1 && ['no', 'nope'].includes(words[0]))) {
            return false;
        }
        confirmar(npc, player, p.accion, p.cantidad, nombre);
        return true;
    }
    if (p.paso === 'cantidad') {
        const valor = cifra(words);
        if (valor === null) {
            return false;
        }
        conCifra(npc, player, p.accion, valor, p.accion === 'transferir' ? nombreTrasCifra(words) : '');
        return true;
    }
    return false;
}

/** Una palabra clave que antes deja contestar a lo pendiente. */
function atender(fn) {
    return (npc, player, words) => {
        if (responder(npc, player, words || [])) {
            return;
        }
        fn(npc, player, words || []);
    };
}

/** El «si»: hace la operación pendiente, con el motor, y dice cómo ha ido. */
function hacer(npc, player) {
    const p = pendiente(npc, player);
    if (!p || p.paso !== 'confirmar') {
        npc.say('No te he propuesto nada. Dime "depositar", "retirar", "saldo" o "transferir".');
        return;
    }
    npc.banco = null;
    if (p.accion === 'depositar') {
        const r = player.depositMoney(p.cantidad);
        if (r.ok) {
            npc.say('Hecho: he sumado ' + p.cantidad + ' de oro a tu cuenta. Puedes retirarlo cuando quieras.');
        } else if (r.reason === 'notEnough') {
            npc.say('No llevas tanto: tienes ' + player.getMoney() + ' de oro encima.');
        } else {
            npc.say('No he podido cobrarte: no te cabe el cambio en la mochila.');
        }
        return;
    }
    if (p.accion === 'retirar') {
        const r = player.withdrawMoney(p.cantidad);
        if (r.ok) {
            npc.say('Aquí tienes ' + p.cantidad + ' de oro. Tu saldo es de ' + r.balance + ' de oro.');
        } else if (r.reason === 'notEnough') {
            npc.say('No tienes tanto en la cuenta: tu saldo es de ' + player.getBankBalance() + ' de oro.');
        } else {
            npc.say('No puedes llevar tanto: no te cabe o pesa demasiado.');
        }
        return;
    }
    const r = player.transferMoney(p.nombre, p.cantidad);
    if (r.ok) {
        npc.say('Hecho: has transferido ' + p.cantidad + ' de oro a ' + r.name + '.');
    } else if (r.reason === 'self') {
        npc.say('No puedes transferirte dinero a ti mismo.');
    } else if (r.reason === 'notEnough') {
        npc.say('No tienes tanto en la cuenta: tu saldo es de ' + player.getBankBalance() + ' de oro.');
    } else if (r.reason === 'noDatabase') {
        npc.say('Sólo puedo transferir a quien esté conectado.');
    } else {
        npc.say('No conozco a nadie llamado «' + p.nombre + '».');
    }
}

module.exports = {

    type: 'npc',
    name: 'Banquero',

    default: (npc, player, words) => {
        if (player && responder(npc, player, words || [])) {
            return;
        }
        npc.say('No te entiendo. Dime "depositar", "retirar", "saldo" o "transferir".');
    },

    keywords: [
        {
            words: ['hola', 'hi', 'buenas', 'buenos dias',
                'hello', 'hey', 'greetings', 'good morning'],
            greeting: true,
            say: (npc, player) => {
                // `getName()` y no `player.name`: en el envoltorio el nombre es un metodo.
                npc.banco = null;
                npc.say('Bienvenido al banco, ' + player.getName() + '. Puedo guardarte el dinero: dime ' +
                    '"depositar", "retirar", "saldo" o "transferir".');
            }
        },

        {
            /*
             * DEPOSITAR va antes que "saldo" y que "dinero" a proposito: "quiero guardar mi
             * dinero" es una peticion, no una pregunta, y si ganara la palabra generica el
             * banquero contestaria el saldo a quien venia a ingresarlo. Es el mismo orden
             * que hace falta en la tienda con "comprar" y el nombre del objeto.
             */
            words: ['depositar', 'ingresar', 'guardar', 'deposito', 'meter',
                'deposit', 'store', 'save'],
            say: atender((npc, player, words) => empezar(npc, player, 'depositar', words))
        },

        {
            words: ['retirar', 'sacar', 'extraer', 'withdraw', 'take out'],
            say: atender((npc, player, words) => empezar(npc, player, 'retirar', words))
        },

        {
            // TRANSFERIR antes que "saldo" y "dinero", por lo mismo que depositar.
            words: ['transferir', 'transferencia', 'enviar', 'mandar', 'transfer', 'send'],
            say: atender((npc, player, words) => empezar(npc, player, 'transferir', words))
        },

        {
            words: ['saldo', 'cuenta', 'balance', 'cuanto llevo', 'cuanto tengo',
                'account', 'how much'],
            say: atender((npc, player) => {
                npc.say('Tu saldo en el banco es de ' + player.getBankBalance() + ' de oro.');
                npc.say('Llevas ' + player.getMoney() + ' de oro encima, contando platino y cristal.');
            })
        },

        {
            words: ['dinero', 'monedas', 'oro', 'money', 'coins', 'gold'],
            say: atender((npc, player) => {
                npc.say('En el zurron: ' + player.getMoney() + ' de oro, contando platino y cristal.');
            })
        },

        {
            words: ['cristal', 'moneda de cristal', 'crystal', 'platino', 'cambio', 'cambiar',
                'platinum', 'exchange', 'change'],
            say: atender((npc) => {
                npc.say('Cien de oro son una de platino, y cien de platino una de cristal. ' +
                    'Usa una pila llena para juntarla, o una moneda grande para partirla.');
            })
        },

        {
            words: ['morir', 'muerte', 'caer', 'perder', 'die', 'death', 'dying', 'lose'],
            say: atender((npc) => {
                // Lo que se pierde de verdad lo decide engine/world/muerte.js: sin bendiciones, la
                // mochila entera se queda en el cuerpo. Lo del banco no se pierde nunca.
                npc.say('Al caer pierdes experiencia y, sin bendiciones, la mochila entera, ' +
                    'monedas incluidas. Lo que esta en el banco no se pierde nunca.');
            })
        },

        {
            words: ['casa', 'casas', 'alquiler', 'house', 'houses', 'rent'],
            say: atender((npc) => {
                npc.say('Las casas se pagan desde tu cuenta: mira la puerta de una libre y di "!buyhouse". ' +
                    'El alquiler tambien sale del banco, asi que ten siempre algo guardado.');
            })
        },

        {
            words: ['interes', 'prestamo', 'deuda', 'credito',
                'interest', 'loan', 'debt', 'credit'],
            say: atender((npc) => {
                npc.say('Prestamos no hago, ni pago intereses: guardo lo tuyo y te lo devuelvo entero.');
            })
        },

        {
            words: ['peso', 'carga', 'capacidad', 'weight', 'load', 'capacity'],
            say: atender((npc, player) => {
                npc.say('Vas con ' + player.getWeightText() + ' de ' +
                    player.getCapacityText() + '. Y las monedas pesan: cien de oro son ' +
                    'diez onzas, aunque no lo parezca. Lo del banco no pesa nada.');
            })
        },

        // «si» y «no» van AL FINAL, como en el sanador: «no tengo dinero» pregunta por el dinero.
        {
            words: ['si', 'sí', 'vale', 'de acuerdo', 'yes', 'ok', 'okay'],
            say: atender((npc, player) => hacer(npc, player))
        },

        {
            words: ['no', 'nope'],
            say: atender((npc, player) => {
                npc.banco = null;
                npc.say('Como quieras. ¿Algo más?');
            })
        },

        {
            words: ['adios', 'bye', 'chao', 'hasta luego', 'farewell', 'goodbye', 'see you'],
            farewell: true,
            say: (npc) => {
                npc.banco = null;
                npc.say('Cuida ese zurron.');
            }
        }
    ]
};
