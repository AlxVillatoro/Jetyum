'use strict';

/**
 * GRUPOS (rangos de acceso): el `data/XML/groups.xml` de The Forgotten Server, en JavaScript.
 *
 * Cada personaje tiene un grupo (la columna `group_id` de `players`; 1 si no se dice otro), y el
 * grupo decide qué comandos puede usar: una talkaction con `access: 'gamemaster'` sólo la usa quien
 * tenga ese grupo O UNO MAYOR. Para quien no llega, el comando no existe —se dice en voz alta como
 * cualquier frase—, igual que en TFS: no se le enseña a un jugador qué comandos de GM hay.
 *
 *   id      el número que se guarda en el personaje; MÁS ALTO, MÁS PODER
 *   name    el nombre con el que lo piden las talkactions (`access: 'god'`) y `/grupo`
 *   access  true para el personal (GM y más): entra aunque el servidor esté lleno y no le limita
 *           el ritmo del chat
 *
 * Para dar un grupo: `npm run grupo -- <personaje> <grupo>` con el servidor parado, o `/grupo` en el
 * juego siendo god. El primer god de un servidor nuevo sólo se puede poner con el comando de npm.
 */

module.exports = [
    { id: 1, name: 'player', access: false },
    { id: 2, name: 'tutor', access: false },
    { id: 3, name: 'senior tutor', access: false },
    { id: 4, name: 'gamemaster', access: true },
    { id: 5, name: 'community manager', access: true },
    { id: 6, name: 'god', access: true }
];
