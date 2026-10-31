'use strict';

/**
 * El sanador.
 *
 * CURA, como los sanadores de Tibia: «curar» le cierra las heridas a quien está herido y le quita
 * lo que le esté haciendo daño por dentro (veneno, fuego, electricidad, hemorragia). Antes sólo
 * diagnosticaba, porque el contenido no podía devolver vida; hoy el envoltorio tiene
 * `player.addHealth` y `player.removeCondition` (engine/scripting/entities.js), y un sanador que
 * no cura parecía una broma.
 *
 * NO CURA EN COMBATE: quien acaba de pelear (`player.isInFight()`, engine/world/reglas.js) no puede
 * correr al sanador a mitad de la pelea y volver entero; tiene que salir del combate primero.
 *
 * Sigue diagnosticando con «como estoy», que es un dato que el jugador no tiene: el cliente dibuja
 * una barra, no un número.
 *
 * Y DA LAS BENDICIONES, como los NPC del templo de Tibia (`StdModule.bless` de TFS,
 * data/npc/lib/npcsystem/modules.lua): es el que está junto al templo en los dos mapas, y el que ya
 * hablaba de la muerte. «bendiciones» las explica y dice el precio; el nombre de una («chispa del
 * fenix», «spark of the phoenix») o «todas» la ofrece, y «si» la compra. El precio sube con el nivel
 * (`player.getBlessingCost()`: 2000 de oro hasta el nivel 30 y hasta 20 000 desde el 120) y se cobra
 * con `removeMoney`, contando platino y cristal. Como en TFS, en un mundo «pvp-enforced» no se
 * bendice a nadie. Lo que hacen al morir lo decide el motor (engine/world/muerte.js).
 *
 * LA OFERTA PENDIENTE se guarda EN EL NPC (`npc.ofertaBendicion`), con el id de quien la pidió:
 * es el truco del anciano y del herrero para recordar algo entre una frase y la siguiente, y el id
 * es lo que impide que el «si» de otro jugador compre lo que pidió el primero.
 *
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 */

/** Lo que el sanador quita, además de cerrar las heridas. */
const MALES = ['veneno', 'fuego', 'energia', 'sangrado'];

/**
 * Las palabras de cada bendición (el número es el de TFS y el de `player.hasBlessing`). El nombre
 * que se dice lo da el motor (`player.getBlessings()`), para que no haya dos copias.
 */
const PALABRAS_BENDICION = {
    1: ['escudo espiritual', 'espiritual', 'spiritual shielding', 'spiritual', 'shielding'],
    2: ['abrazo de tibia', 'abrazo', 'embrace of tibia', 'embrace'],
    3: ['fuego de los soles', 'soles', 'fire of the suns', 'suns'],
    4: ['chispa del fenix', 'chispa del fénix', 'chispa', 'fenix', 'fénix', 'spark of the phoenix', 'spark', 'phoenix'],
    5: ['sabiduria de la soledad', 'sabiduría de la soledad', 'sabiduria', 'sabiduría', 'soledad',
        'wisdom of solitude', 'wisdom', 'solitude']
};

/** ¿Se puede bendecir en este mundo? En TFS no, si es «pvp-enforced». */
function sePuedeBendecir() {
    const stats = typeof Game !== 'undefined' && Game.getStats ? Game.getStats() : null;
    return !stats || String(stats.worldType || '').toLowerCase() !== 'pvp-enforced';
}

/** Ofrece la bendición `n` (o todas las que falten, con `n = 'todas'`) y espera el «si». */
function ofrecer(npc, player, n) {
    if (!sePuedeBendecir()) {
        npc.say('En un mundo de guerra los dioses no bendicen a nadie.');
        return;
    }
    const lista = player.getBlessings();
    const precio = player.getBlessingCost();
    if (n === 'todas') {
        const faltan = lista.filter((b) => !b.has);
        if (faltan.length === 0) {
            npc.say('Ya tienes las cinco bendiciones.');
            return;
        }
        npc.ofertaBendicion = { jugador: player.getId(), ids: faltan.map((b) => b.id), precio: precio * faltan.length };
        npc.say('Te faltan ' + faltan.length + ' bendiciones: son ' + precio * faltan.length +
            ' de oro. ¿Las quieres? Di "si" o "no".');
        return;
    }
    const bendicion = lista.find((b) => b.id === n);
    if (bendicion.has) {
        npc.say('Ya tienes la bendicion "' + bendicion.nombre + '".');
        return;
    }
    npc.ofertaBendicion = { jugador: player.getId(), ids: [n], precio: precio };
    npc.say('La bendicion "' + bendicion.nombre + '" te cuesta ' + precio + ' de oro. ¿La quieres? ' +
        'Di "si" o "no".');
}

/** La oferta pendiente de ESTE jugador, o null. */
function ofertaDe(npc, player) {
    const oferta = npc.ofertaBendicion;
    return oferta && oferta.jugador === player.getId() ? oferta : null;
}

/**
 * Las palabras clave de las bendiciones, en DOS TANDAS porque el orden decide (gana la primera que
 * casa): las que nombran una bendición van PRONTO, para que «blessing for death» no lo conteste el
 * «templo»; «si», «no» y «todas» van AL FINAL, para que «no, curar» siga curando.
 */
function palabrasDeBendiciones() {
    const una = Object.keys(PALABRAS_BENDICION).map((id) => ({
        words: PALABRAS_BENDICION[id],
        say: (npc, player) => ofrecer(npc, player, Number(id))
    }));
    return [
        {
            words: ['bendiciones', 'bendicion', 'bendición', 'bendecir', 'bendiceme', 'bendíceme',
                'blessings', 'blessing', 'bless'],
            say: (npc, player) => {
                const nombres = player.getBlessings().map((b) => '"' + b.nombre + '"');
                npc.say('Hay cinco bendiciones: ' + nombres.slice(0, -1).join(', ') + ' y ' +
                    nombres[nombres.length - 1] + '.');
                npc.say('Cada una te quita parte de lo que pierdes al morir, y se gastan todas cuando caes. ' +
                    'A tu nivel cada una cuesta ' + player.getBlessingCost() + ' de oro; di su nombre, o ' +
                    '"todas" para las que te falten.');
            }
        },
        ...una
    ];
}

function respuestasDeBendiciones() {
    return [
        {
            words: ['todas', 'todas las bendiciones', 'all', 'all blessings'],
            say: (npc, player) => ofrecer(npc, player, 'todas')
        },
        {
            words: ['si', 'sí', 'vale', 'de acuerdo', 'yes', 'ok', 'okay'],
            say: (npc, player) => {
                const oferta = ofertaDe(npc, player);
                if (!oferta) {
                    npc.say('No te he ofrecido nada. Preguntame por las "bendiciones".');
                    return;
                }
                npc.ofertaBendicion = null;
                // Se vuelve a mirar: entre la oferta y el «si» ha podido conseguir alguna.
                const faltan = oferta.ids.filter((id) => !player.hasBlessing(id));
                if (faltan.length === 0) {
                    npc.say('Ya tienes esa bendicion: los dioses no bendicen dos veces lo mismo.');
                    return;
                }
                const precio = player.getBlessingCost() * faltan.length;
                if (!player.removeMoney(precio)) {
                    npc.say('No te alcanza: hacen falta ' + precio + ' de oro.');
                    return;
                }
                faltan.forEach((id) => player.addBlessing(id));
                npc.say(faltan.length === 1
                    ? 'Los dioses te han bendecido. Que te guarden.'
                    : 'Los dioses te han dado ' + faltan.length + ' bendiciones. Que te guarden.');
            }
        },
        {
            words: ['no', 'nope'],
            say: (npc, player) => {
                if (ofertaDe(npc, player)) {
                    npc.ofertaBendicion = null;
                }
                npc.say('Como quieras.');
            }
        }
    ];
}

module.exports = {

    type: 'npc',
    name: 'Sanador',

    default: (npc) => {
        npc.say('No te entiendo. Dime "como estoy", "curar", "templo" o "veneno".');
    },

    keywords: [
        {
            words: ['hola', 'hi', 'buenas', 'buenos dias',
                'hello', 'hey', 'greetings', 'good morning'],
            greeting: true,
            say: (npc, player) => {
                // Saludar de nuevo deja sin efecto lo que se le hubiera ofrecido antes.
                if (ofertaDe(npc, player)) {
                    npc.ofertaBendicion = null;
                }
                // `getName()` y no `player.name`: en el envoltorio el nombre es un metodo.
                npc.say('Hola, ' + player.getName() + '. Dime "curar" si vienes herido, o ' +
                    '"como estoy" y te digo como llevas el cuerpo.');
            }
        },

        // Las bendiciones: «bendiciones» y el nombre de cada una (ver `palabrasDeBendiciones`).
        ...palabrasDeBendiciones(),

        {
            words: ['curar', 'cura', 'curas', 'sanar', 'sanacion', 'medico', 'remedio',
                'heal', 'healing', 'cure', 'remedy', 'medic'],
            say: (npc, player) => {
                if (player.isInFight()) {
                    npc.say('Todavia hueles a pelea. Sal del combate y vuelve, que no curo a ' +
                        'nadie para que vuelva a meterse.');
                    return;
                }
                const salud = player.getHealth();
                const maxima = player.getMaxHealth();
                const males = MALES.filter((mal) => player.hasCondition(mal));
                if (salud >= maxima && males.length === 0) {
                    npc.say('No tienes nada que curar. Vuelve cuando te hagan falta mis manos.');
                    return;
                }
                males.forEach((mal) => player.removeCondition(mal));
                if (salud < maxima) {
                    player.addHealth(maxima - salud);
                }
                npc.say(males.length > 0
                    ? 'Ya esta: te he cerrado las heridas y te he sacado lo que llevabas dentro.'
                    : 'Ya esta: te he cerrado las heridas.');
            }
        },

        {
            words: ['como estoy', 'salud', 'heridas', 'vida', 'estado', 'herido',
                'how am i', 'health', 'wounds', 'life', 'status', 'hurt', 'wounded'],
            say: (npc, player) => {
                const salud = player.getHealth();
                const maxima = player.getMaxHealth() || 1;
                // El porcentaje se calcula aqui y no se manda crudo: lo que el jugador ve
                // en pantalla es una barra, y el numero solo es util comparado con algo.
                const porcentaje = Math.round(salud * 100 / maxima);

                npc.say('Estas a ' + salud + ' de ' + maxima + ' (' + porcentaje + '%).');

                if (porcentaje >= 90) {
                    npc.say('Entero. No te metas donde no te llaman y seguiras asi.');
                } else if (porcentaje >= 50) {
                    npc.say('Aguantas, pero no fuerces: otra pelea asi te deja en el suelo. ' +
                        'Dime "curar" y te cierro las heridas.');
                } else if (porcentaje > 0) {
                    npc.say('Estas para que te lleven. Dime "curar" antes de que caigas.');
                } else {
                    npc.say('Estas muerto, y eso ya no es cosa mia.');
                }
            }
        },

        {
            words: ['templo', 'reaparecer', 'resucitar', 'morir', 'muerte',
                'temple', 'respawn', 'revive', 'resurrect', 'die', 'death'],
            say: (npc) => {
                npc.say('El templo te rehace entero cuando caes. Eso si: pierdes experiencia ' +
                    'por el camino.');
                npc.say('Si quieres perder menos, pideme las "bendiciones".');
            }
        },

        {
            words: ['nivel', 'subir', 'experiencia', 'level', 'experience'],
            say: (npc) => {
                npc.say('Al subir de nivel aguantas mas golpes que antes. Pero para cerrar ' +
                    'heridas, mejor ven a verme.');
            }
        },

        {
            words: ['veneno', 'enfermedad', 'maldicion', 'fiebre',
                'poison', 'disease', 'curse', 'fever'],
            say: (npc, player) => {
                const males = MALES.filter((mal) => player.hasCondition(mal));
                if (males.length === 0) {
                    npc.say('No llevas nada dentro. Las arañas de la mina si que envenenan: ' +
                        'si te muerden, ven y dime "curar".');
                    return;
                }
                if (player.isInFight()) {
                    npc.say('Todavia hueles a pelea. Sal del combate y vuelve, que no curo a ' +
                        'nadie para que vuelva a meterse.');
                    return;
                }
                males.forEach((mal) => player.removeCondition(mal));
                npc.say('Fuera. Ya no llevas nada dentro.');
            }
        },

        {
            words: ['mina', 'ratas', 'peligro', 'mine', 'rats', 'danger'],
            say: (npc) => {
                npc.say('La mina esta planta abajo y las ratas junto al charco. Las dos ' +
                    'cosas dejan marca: si vuelves herido, ya sabes donde estoy.');
            }
        },

        // «todas», «si» y «no»: al final, para que no tapen a las de arriba.
        ...respuestasDeBendiciones(),

        {
            words: ['adios', 'bye', 'chao', 'hasta luego', 'farewell', 'goodbye', 'see you'],
            farewell: true,
            say: (npc) => {
                npc.say('Vete con cuidado.');
            }
        }
    ]
};
