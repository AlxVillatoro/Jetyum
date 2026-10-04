'use strict';

/**
 * UNA MISIÓN DE EJEMPLO para el diario (`type: 'quest'`), como el quests.xml de TFS.
 *
 * El diario se calcula con los STORAGES del jugador: aquí sólo se dice qué storage es cada
 * paso y qué valores significan «empezada» y «terminada». Quien los sube son los scripts:
 * `data/scripts/events/misiones.js` la empieza al entrar y cuenta las ratas que matas.
 */
module.exports = {
    type: 'quest',
    name: 'La plaga de ratas',
    storage: 'ratas.inicio',
    startValue: 1,
    missions: [
        {
            name: 'Caza ratas en las alcantarillas',
            storage: 'ratas.muertas',
            startValue: 0,
            endValue: 10,
            description: (v) => v >= 10
                ? 'Ya has matado 10 ratas. ¡La ciudad te lo agradece!'
                : 'La ciudad está llena de ratas. Mata 10 (llevas ' + v + ').'
        },
        {
            name: 'Recoge tu recompensa',
            storage: 'ratas.premio',
            startValue: 0,
            endValue: 1,
            description: (v) => v >= 1 ? 'Te dieron 100 monedas de oro y 2 pociones de vida.' : 'Mata las 10 ratas.'
        }
    ]
};
