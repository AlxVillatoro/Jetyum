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
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 */

/** Lo que el sanador quita, además de cerrar las heridas. */
const MALES = ['veneno', 'fuego', 'energia', 'sangrado'];

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
                // `getName()` y no `player.name`: en el envoltorio el nombre es un metodo.
                npc.say('Hola, ' + player.getName() + '. Dime "curar" si vienes herido, o ' +
                    '"como estoy" y te digo como llevas el cuerpo.');
            }
        },

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

        {
            words: ['adios', 'bye', 'chao', 'hasta luego', 'farewell', 'goodbye', 'see you'],
            farewell: true,
            say: (npc) => {
                npc.say('Vete con cuidado.');
            }
        }
    ]
};
