'use strict';

/**
 * LAS REGLAS DEL MUNDO: lo que impide hacer cosas, aparte de `world.js`.
 *
 *   - los GRUPOS de acceso (jugador, tutor, GM, god): quién puede usar qué comando;
 *   - las ZONAS: en una zona de protección nadie pega ni recibe golpes; en una no-PvP, o en un
 *     mundo `no-pvp`, los jugadores no se atacan entre sí; y por debajo de `protectionLevel`
 *     tampoco;
 *   - el COMBATE: quien pega o recibe un golpe está «en combate» `pzLocked` milisegundos (no
 *     puede salir del juego), y quien ataca a otro JUGADOR además no puede entrar en una zona de
 *     protección en ese tiempo (el «PZ lock» de Tibia);
 *   - el TEMPLO de cada ciudad, que es donde aparece un personaje nuevo y adonde vuelve al morir;
 *   - las MONTURAS: cuáles tiene cada uno, montar y desmontar, y lo que suman a la velocidad.
 *
 * Se mezcla en `World` igual que `extras.js`: son métodos del mundo en un archivo propio.
 */

/** Lo que dura estar en combate (y el PZ lock) si `config.js` no dice otra cosa: un minuto. */
const PZ_LOCK_POR_DEFECTO = 60 * 1000;

/** Entre montar y desmontar: así no se puede hacer parpadear al personaje (como en TFS). */
const MONTAR_CADA_MS = 2000;

/** El grupo de quien no tiene ninguno guardado. */
const GRUPO_JUGADOR = { id: 1, name: 'player', access: false };

function esJugador(creature) {
    return !!(creature && creature.isPlayer && creature.isPlayer());
}

const reglas = {
    // -----------------------------------------------------------------------
    // Grupos de acceso
    // -----------------------------------------------------------------------

    /** El grupo de un jugador (`data/XML/groups.js`); el de jugador si no tiene o no existe. */
    groupOf(player) {
        const grupos = this.groups || new Map();
        const id = Number(player && player.groupId) || 1;
        return grupos.get(id) || grupos.get(1) || GRUPO_JUGADOR;
    },

    /** Un grupo por su nombre (`'gamemaster'`) o su número, o null. */
    groupByName(nombre) {
        const grupos = this.groups || new Map([[1, GRUPO_JUGADOR]]);
        const n = Number(nombre);
        if (Number.isInteger(n) && grupos.has(n)) {
            return grupos.get(n);
        }
        const buscado = String(nombre || '').trim().toLowerCase();
        for (const grupo of grupos.values()) {
            if (grupo.name === buscado) {
                return grupo;
            }
        }
        return null;
    },

    /**
     * ¿Tiene el jugador ese grupo O UNO MAYOR? Un grupo que no existe no lo tiene nadie: un comando
     * que pide un grupo mal escrito queda cerrado, que es el lado seguro.
     */
    hasGroup(player, requerido) {
        const grupo = this.groupByName(requerido);
        return !!(grupo && this.groupOf(player).id >= grupo.id);
    },

    /** ¿Es del personal (GM o más)? No le limita el ritmo del chat y entra con el servidor lleno. */
    isStaff(player) {
        return this.groupOf(player).access === true;
    },

    // -----------------------------------------------------------------------
    // Zonas y PvP
    // -----------------------------------------------------------------------

    _casillaDe(creature) {
        if (!creature || !creature.position || !this.map) {
            return null;
        }
        return creature.tile || this.map.getTile(creature.position.x, creature.position.y, creature.position.z);
    },

    /** ¿Está en una zona de protección? */
    inProtectionZone(creature) {
        const tile = this._casillaDe(creature);
        return !!(tile && tile.isProtectionZone());
    },

    /** ¿Está en una casilla donde los jugadores no se pueden atacar? */
    inNoPvpZone(creature) {
        const tile = this._casillaDe(creature);
        // 2 es TILE_FLAGS.NO_PVP (tile.js); se pregunta así para no atar este módulo al mapa.
        return !!(tile && tile.hasFlag && tile.hasFlag(2));
    },

    /**
     * ¿Impiden LAS REGLAS que `atacante` hiera a `objetivo`? Devuelve el motivo, o null si no.
     *
     * Sólo las reglas del mundo: el alcance, la planta y el ritmo de los golpes los mira el
     * combate. Se usa en los golpes cuerpo a cuerpo, en los hechizos de los scripts y en la IA.
     * Curar no pasa por aquí: en una zona de protección se puede curar.
     *
     * @returns {{reason: string, level?: number}|null}
     */
    combatBlocked(atacante, objetivo) {
        if (!atacante || !objetivo || atacante === objetivo) {
            return null;
        }
        if (this.inProtectionZone(atacante)) {
            return { reason: 'attackerInPz' };
        }
        if (this.inProtectionZone(objetivo)) {
            return { reason: 'targetInPz' };
        }
        if (!esJugador(atacante) || !esJugador(objetivo)) {
            return null;
        }
        if (String(this.worldType || 'pvp').toLowerCase() === 'no-pvp') {
            return { reason: 'noPvpWorld' };
        }
        if (this.inNoPvpZone(atacante) || this.inNoPvpZone(objetivo)) {
            return { reason: 'noPvpZone' };
        }
        const nivel = Number(this.protectionLevel) || 0;
        if (nivel > 1 && (Number(atacante.level) || 1) < nivel) {
            return { reason: 'attackerLevel', level: nivel };
        }
        if (nivel > 1 && (Number(objetivo.level) || 1) < nivel) {
            return { reason: 'targetLevel', level: nivel };
        }
        return null;
    },

    /** Lo que se le dice a quien intenta atacar y no puede, por el motivo de `combatBlocked`. */
    combatBlockedText(bloqueo) {
        switch (bloqueo && bloqueo.reason) {
            case 'attackerInPz':
                return 'No puedes atacar desde una zona de protección.';
            case 'targetInPz':
                return 'No puedes atacar a quien está en una zona de protección.';
            case 'noPvpWorld':
                return 'En este mundo no se puede atacar a otros jugadores.';
            case 'noPvpZone':
                return 'Aquí no se puede atacar a otros jugadores.';
            case 'attackerLevel':
                return 'No puedes atacar a otros jugadores hasta el nivel ' + bloqueo.level + '.';
            case 'targetLevel':
                return 'Ese jugador está protegido hasta el nivel ' + bloqueo.level + '.';
            default:
                return 'No puedes atacar ahora.';
        }
    },

    // -----------------------------------------------------------------------
    // En combate y PZ lock
    // -----------------------------------------------------------------------

    /** Lo que dura estar en combate y el PZ lock (`pzLocked` en config.js). */
    pzLockMs() {
        const ms = Number(this.pzLocked);
        return Number.isFinite(ms) && ms >= 0 ? ms : PZ_LOCK_POR_DEFECTO;
    },

    /**
     * HA HABIDO UN GOLPE entre `atacante` y `objetivo`. Los dos jugadores que haya quedan en combate
     * y, si un jugador ha atacado a otro, el atacante además no puede entrar en una zona de
     * protección. Lo llama el combate cada vez que hiere.
     */
    noteCombat(atacante, objetivo) {
        const hasta = this.now() + this.pzLockMs();
        [atacante, objetivo].forEach((c) => {
            if (esJugador(c)) {
                const antes = this.isInFight(c);
                c.inFightUntil = Math.max(c.inFightUntil || 0, hasta);
                if (!antes) {
                    this.emit('onInFightChange', c, true);
                }
            }
        });
        if (esJugador(atacante) && esJugador(objetivo) && atacante !== objetivo &&
                !(this.sameParty && this.sameParty(atacante, objetivo))) {
            atacante.pzLockedUntil = Math.max(atacante.pzLockedUntil || 0, hasta);
        }
    },

    /** ¿Está en combate? (No puede salir del juego.) */
    isInFight(player) {
        return !!(player && this.now() < (player.inFightUntil || 0));
    },

    /** ¿Tiene el PZ lock? (No puede entrar en una zona de protección.) */
    isPzLocked(player) {
        return !!(player && this.now() < (player.pzLockedUntil || 0));
    },

    /** Al morir se acaba el combate: reaparece en el templo y puede salir. */
    clearCombat(player) {
        if (player) {
            player.inFightUntil = 0;
            player.pzLockedUntil = 0;
        }
    },

    // -----------------------------------------------------------------------
    // Ventanas de texto
    // -----------------------------------------------------------------------

    /**
     * ABRE UNA VENTANA DE TEXTO a un jugador (`SERVER.TEXT_WINDOW`): para leer, o para escribir si
     * `editable`. Al guardar, `alGuardar(texto)` recibe lo escrito, ya recortado a `maximo`. Una
     * ventana sólo la puede contestar su jugador, y una sola vez.
     *
     * @returns {number} el id de la ventana
     */
    abrirVentanaDeTexto(player, opciones, alGuardar) {
        const o = opciones || {};
        this.ventanasDeTexto = this.ventanasDeTexto || new Map();
        this.siguienteVentanaDeTexto = (this.siguienteVentanaDeTexto || 0) + 1;
        const id = this.siguienteVentanaDeTexto;
        const ventana = {
            titulo: String(o.titulo || ''),
            texto: String(o.texto == null ? '' : o.texto),
            editable: o.editable === true,
            maximo: Math.max(1, Math.min(8000, Number(o.maximo) || 1000))
        };
        if (ventana.editable && typeof alGuardar === 'function') {
            this.ventanasDeTexto.set(id, { playerId: player.id, alGuardar, maximo: ventana.maximo });
        }
        this.emit('onTextWindow', player, id, ventana);
        return id;
    },

    /** Lo que el cliente devuelve de una ventana editable. Devuelve si se aceptó. */
    guardarVentanaDeTexto(player, id, texto) {
        const ventana = this.ventanasDeTexto && this.ventanasDeTexto.get(Number(id));
        if (!ventana || !player || ventana.playerId !== player.id) {
            return false;
        }
        this.ventanasDeTexto.delete(Number(id));
        ventana.alGuardar(String(texto == null ? '' : texto).slice(0, ventana.maximo));
        return true;
    },

    // -----------------------------------------------------------------------
    // Ciudades y templos
    // -----------------------------------------------------------------------

    /** La ciudad de un jugador (la de `townId`, o la de los nuevos), o null si el mapa no tiene. */
    townOf(player) {
        const ciudades = (this.map && this.map.towns) || [];
        const id = Number(player && player.townId) || Number(this.newPlayerTownId) || 0;
        return ciudades.find((t) => t.id === id) || ciudades[0] || null;
    },

    /**
     * El templo al que va un jugador: el de su ciudad; si el mapa no tiene ciudades, el waypoint
     * `temple`; y si tampoco, null (quien pregunta decide).
     */
    templeOf(player) {
        const ciudad = this.townOf(player);
        if (ciudad && ciudad.temple) {
            return { x: ciudad.temple.x, y: ciudad.temple.y, z: ciudad.temple.z };
        }
        const waypoint = this.map && this.map.getWaypoint ? this.map.getWaypoint('temple') : null;
        return waypoint ? { x: waypoint.x, y: waypoint.y, z: waypoint.z } : null;
    },

    // -----------------------------------------------------------------------
    // Monturas
    // -----------------------------------------------------------------------

    /** ¿Puede llevar esa montura? `{ok, reason}`, con el motivo en palabras. */
    canUseMount(player, mountId) {
        const def = (this.mountTypes || new Map()).get(Number(mountId));
        if (!def || def.enabled === false) {
            return { ok: false, reason: 'esa montura no existe' };
        }
        const suya = player && player.storages instanceof Map && player.storages.has('mount:' + def.id);
        if (!def.unlocked && !suya) {
            return { ok: false, reason: 'todavía no tienes la montura «' + def.name + '»' };
        }
        if (def.premium && !(player && player.premium === true)) {
            return { ok: false, reason: 'la montura «' + def.name + '» es premium' };
        }
        return { ok: true, reason: null, mount: def };
    },

    /** Las monturas que puede llevar un jugador, para la ventana del personaje. */
    mountsOf(player) {
        const lista = [];
        (this.mountTypes || new Map()).forEach((def) => {
            if (this.canUseMount(player, def.id).ok) {
                lista.push({ id: def.id, name: def.name, lookType: def.lookType, speed: def.speed });
            }
        });
        return lista;
    },

    /** Le da una montura (la apunta en el storage `mount:<id>`, que se guarda con él). */
    giveMount(player, mountId) {
        const def = (this.mountTypes || new Map()).get(Number(mountId));
        if (!player || !def) {
            return false;
        }
        if (!(player.storages instanceof Map)) {
            player.storages = new Map();
        }
        player.storages.set('mount:' + def.id, 1);
        return true;
    },

    /** Se la quita; si iba montado en ella, desmonta. */
    takeMount(player, mountId) {
        const id = Number(mountId);
        if (!player || !(player.storages instanceof Map) || !player.storages.has('mount:' + id)) {
            return false;
        }
        player.storages.delete('mount:' + id);
        if (Number(player.mountId) === id && !this.canUseMount(player, id).ok) {
            this.rideMount(player, false, { forzar: true });
            player.mountId = 0;
        }
        return true;
    },

    /** Elige la montura (sin montarla). Si ya iba montado, cambia de una a otra. */
    chooseMount(player, mountId) {
        const id = Number(mountId) || 0;
        if (id === 0) {
            this.rideMount(player, false, { forzar: true });
            player.mountId = 0;
            return { ok: true };
        }
        const puede = this.canUseMount(player, id);
        if (!puede.ok) {
            return puede;
        }
        player.mountId = id;
        if (player.mounted) {
            this._aplicarMontura(player);
        }
        return { ok: true };
    },

    /**
     * Montar (`true`) o desmontar (`false`). No se monta en una zona de protección, ni sin montura
     * elegida, ni más de una vez cada dos segundos. `forzar` se salta el ritmo y la zona (al morir,
     * al quitarle la montura).
     *
     * @returns {{ok: boolean, reason?: string}}
     */
    rideMount(player, montar, opciones) {
        const o = opciones || {};
        if (!player) {
            return { ok: false, reason: 'no hay jugador' };
        }
        const quiere = montar === undefined ? !player.mounted : montar === true;
        if (quiere === !!player.mounted) {
            return { ok: true };
        }
        const ahora = this.now();
        if (!o.forzar && ahora < (player.nextMountAt || 0)) {
            return { ok: false, reason: 'espera un momento antes de volver a montar o desmontar' };
        }
        if (quiere) {
            if (!player.mountId) {
                return { ok: false, reason: 'elige primero una montura en la ventana del personaje' };
            }
            const puede = this.canUseMount(player, player.mountId);
            if (!puede.ok) {
                return puede;
            }
            if (!o.forzar && this.inProtectionZone(player) && !this.isStaff(player)) {
                return { ok: false, reason: 'no puedes montar en una zona de protección' };
            }
        }
        player.mounted = quiere;
        player.nextMountAt = ahora + MONTAR_CADA_MS;
        this._aplicarMontura(player);
        return { ok: true };
    },

    /**
     * Lo que cambia al montar o desmontar: el aspecto (`lookMount`, que el cliente dibuja debajo)
     * y la velocidad. Se llama también al entrar, para quien salió montado.
     */
    _aplicarMontura(player) {
        const def = player.mounted ? (this.mountTypes || new Map()).get(Number(player.mountId)) : null;
        if (player.mounted && !def) {
            player.mounted = false;
        }
        player.outfit = { ...(player.outfit || {}), lookMount: def ? def.lookType : 0 };
        player.mountSpeed = def ? def.speed : 0;
        if (this.recomputeSpeed) {
            this.recomputeSpeed(player);
        }
        if (this.emit && player.position) {
            this.emit('onTileChanged', player.position, null);
        }
    },

    /**
     * LA VELOCIDAD de una criatura: la de su nivel (`baseSpeed`), más lo que dé el equipo, las
     * condiciones (prisa, parálisis) y la montura. Es la única fórmula, para que no haya tres que
     * se olviden de algo.
     */
    recomputeSpeed(creature) {
        if (!creature) {
            return 0;
        }
        const base = creature.baseSpeed === undefined ? creature.speed : creature.baseSpeed;
        creature.speed = Math.max(40, base + (creature.speedBonus || 0) + (creature.condSpeed || 0) +
            (creature.mountSpeed || 0));
        return creature.speed;
    }
};

module.exports = { reglas, PZ_LOCK_POR_DEFECTO, MONTAR_CADA_MS };
