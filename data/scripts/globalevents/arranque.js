'use strict';

/**
 * Eventos GLOBALES de ejemplo: los `globalevents` de TFS.
 *
 * Cuatro tipos, con su callback:
 *
 *   startup   onStartup()          al arrancar el mundo
 *   shutdown  onShutdown()         al apagarlo
 *   think     onThink(interval)    cada `interval` milisegundos
 *   time      onTime(hora)         a la hora `time` ('HH:MM') del reloj del servidor
 *
 * Un archivo puede exportar uno o varios (un array), y puede haber tantos de cada tipo como
 * haga falta: no se pisan entre sí.
 */
module.exports = [
    {
        type: 'globalevent',
        name: 'arranque',
        event: 'startup',
        onStartup() {
            // EL COFRE DE DEPÓSITO y EL COFRE DEL PREMIO, junto al templo: cada jugador ve en el
            // depósito lo suyo (se guarda con él), y el del premio se abre una vez por jugador
            // (data/scripts/actions/others/one_time_chest.js).
            const templo = Game.getWaypoint('temple');
            if (templo) {
                const poner = (id, dx, dy) => {
                    const x = templo.x + dx;
                    const y = templo.y + dy;
                    if (Game.isWalkable(x, y, templo.z) && Game.getTileItemIds(x, y, templo.z).every((i) => i !== id)) {
                        Game.createItem(id, 1, x, y, templo.z);
                    }
                };
                poner(11112, -3, 2);   // depot chest
                poner(11111, 4, 2);    // el cofre del premio
            }
            const r = Game.getRaids();
            Game.log('mundo en marcha: ' + Game.getMonsterTypeNames().length + ' tipos de monstruo, ' +
                r.registradas.length + ' raid(s)');
            return true;
        }
    },
    {
        type: 'globalevent',
        name: 'consejos',
        event: 'think',
        interval: 15 * 60 * 1000,
        onThink() {
            const consejos = [
                'Consejo: haz doble clic en una puerta (o pulsa E delante de ella) para abrirla.',
                'Consejo: el templo es el sitio seguro de la ciudad. Si mueres, apareces allí.',
                'Consejo: escribe /help para ver los comandos.'
            ];
            Game.broadcastMessage(consejos[Math.floor(Math.random() * consejos.length)]);
            return true;
        }
    },
    {
        type: 'globalevent',
        name: 'medianoche',
        event: 'time',
        time: '00:00',
        onTime() {
            Game.broadcastMessage('Es medianoche en Jetyum. Cuidado con lo que sale de noche.');
            return true;
        }
    }
];
