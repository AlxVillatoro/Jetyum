'use strict';

/**
 * El RELOJ DE LOS EVENTOS GLOBALES y de las RAIDS: los `globalevents` y `raids` de TFS.
 *
 * Todo cuelga del planificador del motor (un solo reloj, que las pruebas pueden avanzar a mano),
 * con un latido de `LATIDO_MS`:
 *
 *   - `think`: cada evento lleva su intervalo y su próxima hora; se lanza cuando le toca.
 *   - `time`: cuando cambia el minuto del reloj de pared (`HH:MM`), se lanzan los de esa hora.
 *   - raids con `interval`: cuando les toca, se tira `chance` y, si sale, empiezan.
 *   - raids con `time`: empiezan a esa hora.
 *
 * Una raid en marcha programa sus etapas (`delay` desde que empieza): anunciar a todos los
 * jugadores, hacer aparecer monstruos alrededor de un punto o ejecutar código. Una raid no puede
 * solaparse consigo misma: si sigue en marcha, no vuelve a empezar.
 */

const LATIDO_MS = 250;

function horaDe(fecha) {
    return String(fecha.getHours()).padStart(2, '0') + ':' + String(fecha.getMinutes()).padStart(2, '0');
}

/**
 * @param {Object} deps
 * @param {Object} deps.registry el ScriptRegistry
 * @param {Object} deps.world
 * @param {Object} deps.scheduler
 * @param {Object} deps.logger
 * @param {Function} [deps.game] devuelve el objeto `Game` (se pasa a `run` de las raids)
 * @param {Function} [deps.ahora] reloj de pared (las pruebas lo fijan)
 * @param {Function} [deps.azar] número en [0, 1) (las pruebas lo fijan)
 */
function createGlobalClock(deps) {
    const { registry, world, scheduler } = deps;
    const log = deps.logger;
    const ahora = deps.ahora || (() => new Date());
    const azar = deps.azar || Math.random;
    const enMarcha = new Set();
    let ultimoMinuto = null;
    let parado = true;
    let transcurrido = 0;

    /** Avisa a todos los jugadores conectados. */
    function anunciar(texto) {
        let n = 0;
        world.players.forEach((player) => {
            world.sendTextMessage(player.id, String(texto));
            n += 1;
        });
        log.info('[raid] ' + texto);
        return n;
    }

    /** Una casilla libre y pisable alrededor de un punto, o null. */
    function casillaLibre(x, y, z, radio) {
        for (let intento = 0; intento < 30; intento += 1) {
            const px = x + Math.round((azar() * 2 - 1) * radio);
            const py = y + Math.round((azar() * 2 - 1) * radio);
            const tile = world.map && world.map.getTile(px, py, z);
            if (tile && world.map.isWalkable(px, py, z) && (!tile.creatures || tile.creatures.length === 0)) {
                return { x: px, y: py, z };
            }
        }
        return null;
    }

    /** Hace aparecer `count` monstruos alrededor de un punto. Devuelve cuántos aparecieron. */
    function aparecer(spawn) {
        let n = 0;
        const cuantos = Math.max(1, Number(spawn.count) || 1);
        for (let i = 0; i < cuantos; i += 1) {
            const sitio = casillaLibre(Number(spawn.x), Number(spawn.y), Number(spawn.z), Number(spawn.radius) || 0);
            if (sitio && world.createMonster(spawn.monster, sitio, null)) {
                n += 1;
            }
        }
        return n;
    }

    function startRaid(nombre) {
        const raid = registry.raids.get(String(nombre).toLowerCase());
        if (!raid) {
            return { ok: false, problema: 'no hay ninguna raid llamada «' + nombre + '»' };
        }
        if (enMarcha.has(raid.name)) {
            return { ok: false, problema: 'la raid «' + raid.name + '» ya está en marcha' };
        }
        enMarcha.add(raid.name);
        log.info('[raid] empieza «' + raid.name + '» (' + raid.script + ')');
        let ultima = 0;
        raid.steps.forEach((step, i) => {
            const delay = Math.max(0, Number(step.delay) || 0);
            ultima = Math.max(ultima, delay);
            scheduler.schedule(delay, () => {
                try {
                    if (step.announce) {
                        anunciar(step.announce);
                    }
                    if (step.spawn) {
                        const n = aparecer(step.spawn);
                        log.info('[raid] «' + raid.name + '» etapa ' + i + ': ' + n + ' ' + step.spawn.monster);
                    }
                    if (typeof step.run === 'function') {
                        step.run(deps.game ? deps.game() : null);
                    }
                } catch (error) {
                    log.error('error en la etapa ' + i + ' de la raid «' + raid.name + '» (' + raid.script + '):\n' +
                        (error && error.stack ? error.stack : error));
                }
            }, 'raid');
        });
        scheduler.schedule(ultima + 1, () => enMarcha.delete(raid.name), 'raid-fin');
        return { ok: true, etapas: raid.steps.length };
    }

    function latido() {
        if (parado) {
            return;
        }
        transcurrido += LATIDO_MS;

        // think: cada uno con su propio intervalo, que es también lo que recibe.
        registry.globalEvents.think.forEach((entry) => {
            if (entry.siguiente === undefined) {
                entry.siguiente = transcurrido + entry.interval;
            }
            if (transcurrido >= entry.siguiente) {
                entry.siguiente = transcurrido + entry.interval;
                registry._invoke(entry, 'onThink', [entry.interval]);
            }
        });

        // raids periódicas.
        registry.raids.forEach((raid) => {
            if (!raid.interval) {
                return;
            }
            if (raid.siguiente === undefined) {
                raid.siguiente = transcurrido + raid.interval;
                return;
            }
            if (transcurrido >= raid.siguiente) {
                raid.siguiente = transcurrido + raid.interval;
                if (azar() * 100 < raid.chance) {
                    startRaid(raid.name);
                }
            }
        });

        // time: una vez por minuto de reloj.
        const hora = horaDe(ahora());
        if (hora !== ultimoMinuto) {
            if (ultimoMinuto !== null) {
                registry.dispatchGlobal('time', [hora], (entry) => entry.time === hora);
                registry.raids.forEach((raid) => {
                    if (raid.time === hora) {
                        startRaid(raid.name);
                    }
                });
            }
            ultimoMinuto = hora;
        }

        scheduler.schedule(LATIDO_MS, latido, 'global-clock');
    }

    return {
        LATIDO_MS,
        start() {
            if (!parado) {
                return;
            }
            parado = false;
            registry.dispatchGlobal('startup', []);
            scheduler.schedule(LATIDO_MS, latido, 'global-clock');
        },
        stop() {
            if (parado) {
                return;
            }
            parado = true;
            registry.dispatchGlobal('shutdown', []);
        },
        startRaid,
        anunciar,
        aparecer,
        raidsEnMarcha: () => Array.from(enMarcha)
    };
}

module.exports = { createGlobalClock, LATIDO_MS };
