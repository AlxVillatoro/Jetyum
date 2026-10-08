'use strict';

/**
 * ASPECTOS (outfits): el `data/XML/outfits.xml` de The Forgotten Server, en JavaScript.
 *
 * El motor los carga al arrancar (`engine/data/definiciones.js`) y deciden qué puede llevar cada
 * personaje: la ventana del personaje (clic derecho sobre uno mismo) sólo enseña los que valen para
 * él, y el motor rechaza los demás aunque un cliente los pida.
 *
 *   id        el lookType: el número que el motor manda y con el que el cliente busca los sprites
 *   name      el nombre que se ve en la ventana del personaje
 *   sex       'male', 'female' o 'any': quién puede llevarlo (el sexo se elige al crear personaje)
 *   player    true si lo puede llevar un jugador; false para los de criatura (ratas, dragones),
 *             que sólo existen para que el motor los acepte en monstruos y en el comando /outfit
 *   premium   sólo para cuentas premium
 *   unlocked  disponible desde el principio (false = hay que desbloquearlo, p. ej. con una misión)
 *   enabled   false lo quita del juego sin borrarlo
 *   addons    los añadidos que tiene, en orden: el primero es el bit 1 y el segundo el bit 2
 *
 * Los colores (cabeza, cuerpo, piernas y pies) no van aquí: son de cada personaje y se guardan con él.
 */

const aspecto = (id, name, sex, opciones) => ({
    id,
    name,
    sex,
    player: true,
    premium: false,
    unlocked: true,
    enabled: true,
    addons: [],
    ...(opciones || {})
});

const dosAnadidos = (nombre) => [nombre + ', primer añadido', nombre + ', segundo añadido'];

module.exports = [
    // --- Los aspectos clásicos (sin máscara de color; 129-131 y 136 tienen versión HD, docs/ARTE-HD.md) ---
    // El explorador de 8 direcciones (tools/generar-personaje-8d.mjs), para la vista isométrica.
    aspecto(350, 'Explorador', 'any'),
    aspecto(128, 'Citizen', 'any', { addons: dosAnadidos('Citizen') }),
    aspecto(129, 'Hunter', 'any', { addons: dosAnadidos('Hunter') }),
    aspecto(130, 'Mage', 'any', { addons: dosAnadidos('Mage') }),
    aspecto(131, 'Knight', 'any', { addons: dosAnadidos('Knight') }),
    aspecto(132, 'Nobleman', 'any', { premium: true, addons: ['Nobleman, primer añadido'] }),
    aspecto(133, 'Summoner', 'any', { premium: true }),
    aspecto(134, 'Warrior', 'any', { addons: dosAnadidos('Warrior') }),
    aspecto(135, 'Barbarian', 'any'),
    aspecto(136, 'Druid', 'any', { addons: ['Druid, primer añadido'] }),
    aspecto(137, 'Wizard', 'any', { premium: true, unlocked: false, addons: dosAnadidos('Wizard') }),

    // --- Los humanos del OpenTibia Sprite Pack (aspecto del pack + 300), con máscara de color ---
    aspecto(316, 'Aldeano', 'male'),
    aspecto(317, 'Aventurero', 'male'),
    aspecto(318, 'Viajero', 'any'),
    aspecto(320, 'Dama', 'female', { addons: dosAnadidos('Dama') }),
    aspecto(321, 'Caballero', 'male', { addons: dosAnadidos('Caballero') }),
    aspecto(344, 'Ciudadano', 'male', { addons: dosAnadidos('Ciudadano') }),
    aspecto(345, 'Ciudadana', 'female', { addons: dosAnadidos('Ciudadana') }),

    // --- De criatura: no los elige un jugador, pero el motor tiene que conocerlos ---
    aspecto(21, 'Rat', 'any', { player: false }),
    aspecto(34, 'Rat, variante', 'any', { player: false }),
    aspecto(35, 'Cave Rat', 'any', { player: false }),
    aspecto(36, 'Dragon', 'any', { player: false }),
    aspecto(37, 'Dragon Lord', 'any', { player: false })
];
