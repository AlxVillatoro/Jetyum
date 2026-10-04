'use strict';

/**
 * RAID: los goblins atacan la ciudad. Es el `data/raids/*.xml` de TFS, en JS.
 *
 * Una raid son ETAPAS con un retraso desde que empieza (`delay`, en ms). Cada etapa puede:
 *
 *   announce: 'texto'                                  avisar a todos los jugadores
 *   spawn: { monster, x, y, z, count, radius }         hacer aparecer monstruos alrededor
 *   run(Game) { ... }                                  cualquier otra cosa
 *
 * Cuándo empieza: `interval` (cada cuánto se tira el dado) y `chance` (de 0 a 100), o `time`
 * ('HH:MM', todos los días a esa hora). Sin ninguno de los dos, sólo con `/raid goblins`.
 */
module.exports = {
    type: 'raid',
    name: 'goblins',
    interval: 2 * 60 * 60 * 1000,   // cada dos horas...
    chance: 25,                      // ...con un 25 % de probabilidad

    steps: [
        { delay: 0, announce: 'Se oyen tambores en el suroeste... ¡los goblins se preparan!' },
        { delay: 30000, announce: '¡Los goblins avanzan hacia Jetyum por el camino del oeste!' },
        { delay: 40000, spawn: { monster: 'Goblin', x: 8, y: 45, z: 7, count: 6, radius: 3 } },
        { delay: 70000, spawn: { monster: 'Goblin', x: 20, y: 44, z: 7, count: 4, radius: 2 } },
        {
            delay: 100000,
            run(Game) {
                Game.broadcastMessage('El jefe de los goblins ha llegado con su ocultista.');
                Game.createMonster('Occultist', 24, 45, 7);
            }
        }
    ]
};
