'use strict';

/**
 * Gestor de spawns.
 *
 * Instancia los monstruos que el mapa declara y los hace reaparecer cuando mueren.
 * Es el sistema que convierte un mapa en un mundo con vida: sin él, el mapa es
 * geometría muerta.
 *
 * Sobre el ciclo de vida, que es donde están los detalles que importan:
 *
 *   - Un spawn mantiene **como mucho un monstruo vivo**. Si no se controlara,
 *     reintentar la aparición tras un fallo iría acumulando monstruos en el mismo
 *     punto hasta que el servidor se ahogara.
 *   - El monstruo aparece **en su casilla** si el mapa se la da, y si no en una celda
 *     transitable y libre dentro del radio de su respawn. Nunca fuera del respawn: el
 *     respaldo del radio existe para que una mesa encima de la casilla no deje el
 *     respawn muerto, no para pasear al monstruo por el mapa.
 *   - Si no encuentra sitio, **lo reintenta más tarde** en vez de rendirse. Un
 *     spawn bloqueado un instante no debe quedarse vacío para siempre.
 *   - El tiempo de reaparición se cuenta **desde la muerte**, no desde la última
 *     aparición, que es lo que espera cualquiera al diseñar una zona.
 */

const { Position } = require('./position');

/** Intentos de encontrar una celda libre antes de dejarlo para más tarde. */
const PLACEMENT_ATTEMPTS = 12;

/** Cuánto se espera antes de reintentar si no había sitio. */
const RETRY_DELAY_MS = 5000;

class Spawner {
    constructor(options) {
        const opts = options || {};

        this.world = opts.world;
        this.scheduler = opts.scheduler;
        this.log = opts.logger || null;

        /** Inyectable para que las pruebas sean deterministas. */
        this.random = opts.random || Math.random;

        /** Lista de puntos de aparición, con el monstruo vivo que tienen. */
        this.spawns = [];

        /** Contadores para el informe de arranque. */
        this.stats = { spawned: 0, failed: 0, respawns: 0 };

        /**
         * El gestor de spawns se suscribe ÉL MISMO a las muertes.
         *
         * Es quien las necesita, así que no debería depender de que alguien se
         * acuerde de cablearlo. Cuando ese cableado vivía en el motor, usar el
         * mundo y el gestor juntos «a mano» dejaba las reapariciones muertas sin
         * ningún error: el monstruo moría y no volvía nunca.
         */
        if (this.world && typeof this.world.on === 'function') {
            this.world.on('onMonsterDeath', (monster) => this.onMonsterDeath(monster));
        }
    }

    /**
     * Instancia los spawns declarados en el mapa.
     *
     * EL MAPA DECLARA RESPAWNS (áreas con sus monstruos dentro) y el gestor trabaja con
     * PUNTOS DE APARICIÓN, uno por monstruo: al motor lo que le hace falta es «este monstruo
     * vive aquí», y el área sólo importa para saber dónde se le deja aparecer cuando su
     * casilla está ocupada. El aplanado se hace AQUÍ y no en el cargador para que el mapa
     * siga siendo lo que alguien dibujó, con sus áreas enteras.
     *
     * @param {GameMap} map
     * @returns {{spawns: number, monsters: number}}
     */
    loadFromMap(map) {
        const areas = map.spawns || [];

        this.spawns = [];

        areas.forEach((area) => {
            (area.monsters || []).forEach((monster) => {
                /*
                 * LA CASILLA BASE ES LA DEL MONSTRUO SI LA TIENE, y si no el centro del área.
                 *
                 * Y `tieneCasilla` es lo que distingue las dos cosas, que se comportan
                 * distinto: un monstruo con casilla propia aparece en ella (lo que hace TFS),
                 * y uno sin casilla aparece en cualquier punto del área (lo que hacía este
                 * motor antes de que el formato supiera decir dónde va cada monstruo). Es la
                 * diferencia que permite que un mapa antiguo siga comportándose igual.
                 */
                const tieneCasilla = monster.x !== undefined && monster.x !== null;

                this.spawns.push({
                    x: tieneCasilla ? monster.x : area.x,
                    y: tieneCasilla ? monster.y : area.y,
                    z: area.z,
                    monster: monster.name,
                    interval: monster.interval === undefined
                        ? (area.interval === undefined ? 60000 : area.interval)
                        : monster.interval,
                    radius: area.radius === undefined ? 1 : area.radius,
                    /** Si `x`/`y` es la casilla del monstruo (true) o el centro del área (false). */
                    tieneCasilla: tieneCasilla,
                    /** Id del monstruo vivo de este punto, o null. */
                    activeMonsterId: null
                });
            });
        });

        let monsters = 0;
        this.spawns.forEach((entry) => {
            if (this.spawn(entry)) {
                monsters += 1;
            }
        });

        return { spawns: this.spawns.length, monsters: monsters };
    }

    /**
     * Hace aparecer el monstruo de un punto de aparición.
     * @returns {Monster|null}
     */
    spawn(entry) {
        // Ojo con la comparación: un punto de aparición construido a mano puede no
        // traer `activeMonsterId`, y `undefined !== null` es cierto, así que el
        // guardia se cumplía y el spawn no hacía NADA. Se comprueban los dos
        // casos explícitamente en vez de confiar en una comparación holgada.
        const hasLiveMonster = entry.activeMonsterId !== null &&
            entry.activeMonsterId !== undefined;

        if (hasLiveMonster) {
            return null;
        }

        const position = this._findFreePosition(entry);

        if (!position) {
            // No hay sitio ahora mismo. Se reintenta en vez de abandonar.
            this.stats.failed += 1;
            if (this.scheduler) {
                this.scheduler.schedule(RETRY_DELAY_MS, () => this.spawn(entry), 'spawn-retry');
            }
            return null;
        }

        const monster = this.world.createMonster(entry.monster, position, entry);

        if (!monster) {
            // El tipo de monstruo no existe. La validación del mapa ya lo habría
            // detectado, así que llegar aquí significa que el contenido cambió
            // después de cargar el mapa.
            if (this.log) {
                this.log.error('no se pudo crear el monstruo "' + entry.monster +
                    '" del spawn en (' + entry.x + ',' + entry.y + ',' + entry.z + ')');
            }
            return null;
        }

        entry.activeMonsterId = monster.id;
        this.stats.spawned += 1;
        return monster;
    }

    /**
     * Avisa de que un monstruo ha muerto, para programar su reaparición.
     *
     * Se conecta al enganche `onMonsterDeath` del mundo. El monstruo guarda su
     * punto de aparición, así que se puede liberar el hueco sin buscar nada.
     */
    onMonsterDeath(monster) {
        const entry = monster.spawn;
        if (!entry) {
            return false;
        }

        entry.activeMonsterId = null;

        if (this.scheduler) {
            this.scheduler.schedule(entry.interval, () => {
                this.stats.respawns += 1;
                this.spawn(entry);
            }, 'respawn-' + entry.monster);
        }

        return true;
    }

    /**
     * Dónde aparece un monstruo: en su casilla si la tiene, y si no dentro del área.
     *
     * PRIMERO SU CASILLA, y sólo después el resto del área. Un monstruo con casilla propia
     * —la que le puso quien hizo el mapa— aparece donde el mapa dice, que es lo que hace TFS y
     * lo que espera cualquiera que coloque un monstruo en un editor. El respaldo dentro del
     * área existe porque un brasero o una mesa encima de esa casilla no debe dejar el respawn
     * muerto para siempre: se busca alrededor, dentro de su respawn, y nunca fuera.
     *
     * Un monstruo SIN casilla (los de la forma antigua del formato) se sortea dentro del área
     * desde el primer intento, que es exactamente lo que hacía este motor antes.
     *
     * Se prueban celdas al azar en vez de recorrer el área en orden porque recorrerla siempre
     * igual haría que los monstruos aparecieran amontonados en la primera celda libre, que es
     * un patrón muy visible.
     */
    _findFreePosition(entry) {
        const map = this.world.map;
        if (!map) {
            return null;
        }

        const radius = Math.max(0, entry.radius || 0);

        if (entry.tieneCasilla !== false &&
            map.isWalkable(entry.x, entry.y, entry.z) &&
            !this.world.hasCreatureAt(entry.x, entry.y, entry.z)) {
            return new Position(entry.x, entry.y, entry.z);
        }

        for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
            const x = entry.x + this._randomOffset(radius);
            const y = entry.y + this._randomOffset(radius);

            if (map.isWalkable(x, y, entry.z) && !this.world.hasCreatureAt(x, y, entry.z)) {
                return new Position(x, y, entry.z);
            }
        }

        return null;
    }

    /** Desplazamiento entero en [-radius, radius], ambos incluidos. */
    _randomOffset(radius) {
        if (radius === 0) {
            return 0;
        }
        return Math.floor(this.random() * (radius * 2 + 1)) - radius;
    }

    /** Monstruos vivos, por punto de aparición. */
    snapshot() {
        return this.spawns.map((entry) => ({
            monster: entry.monster,
            position: { x: entry.x, y: entry.y, z: entry.z },
            alive: entry.activeMonsterId !== null,
            monsterId: entry.activeMonsterId
        }));
    }
}

module.exports = { Spawner, PLACEMENT_ATTEMPTS, RETRY_DELAY_MS };
