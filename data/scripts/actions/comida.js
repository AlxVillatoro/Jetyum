'use strict';

/**
 * COMIDA: se come con clic derecho (o doble clic) desde la mochila o desde el suelo.
 *
 * Comer da REGENERACIÓN durante un rato (una condición `regeneracion`: vida cada segundo), y se
 * acumula hasta 20 minutos, como el «estar lleno» de Tibia. Pasado eso, «Estás lleno».
 *
 * Cada comida dice cuántos segundos alimenta. Para añadir una, una línea aquí (y el objeto en
 * items.xml).
 */

const COMIDA = {
    2415: { segundos: 180, frase: 'Ñam.' },        // meat
    12181: { segundos: 360, frase: 'Ñam.' },       // ham
    12183: { segundos: 120, frase: 'Ñam.' },       // cheese
    12177: { segundos: 60, frase: 'Ñam.' },        // red apple
    12174: { segundos: 80, frase: 'Ñam.' }         // banana
};

const MAXIMO_SEGUNDOS = 1200;

module.exports = {
    type: 'action',
    ids: Object.keys(COMIDA).map(Number),

    onUse(player, item) {
        const comida = COMIDA[item.getId()];
        const ya = player.getCondition('regeneracion');
        const quedan = ya ? ya.ticks : 0;
        if (quedan + comida.segundos > MAXIMO_SEGUNDOS) {
            player.sendCancelMessage('Estás lleno.');
            return true;
        }
        // Un punto de vida por segundo durante lo que alimente (más lo que quedaba).
        player.addCondition({ type: 'regeneracion', ticks: quedan + comida.segundos, interval: 1000, value: 1 });
        player.say(comida.frase);
        item.remove(1);
        return true;
    }
};
