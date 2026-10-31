'use strict';

/**
 * MONTURAS: el `data/XML/mounts.xml` de The Forgotten Server, en JavaScript.
 *
 * Una montura es un ASPECTO sobre el que va el jugador: el cliente la dibuja debajo y al jinete
 * encima. Se elige en la ventana del personaje (clic derecho sobre uno mismo) y se monta o
 * desmonta con Ctrl+R o con la casilla «Montar» de esa misma ventana.
 *
 *   id        el número de la montura (el que se guarda en el personaje y piden los scripts)
 *   name      el nombre que se ve en la ventana
 *   lookType  el aspecto que se dibuja (`things.json`): aquí, criaturas del OpenTibia Sprite Pack
 *   speed     la velocidad que suma mientras se va montado
 *   premium   sólo para cuentas premium
 *   unlocked  la tiene todo el mundo desde el principio (false = hay que darla: un script con
 *             `player.addMount(id)`, una misión, o un GM con `/montura`)
 *   enabled   false la quita del juego sin borrarla
 *
 * NO SE PUEDE MONTAR EN UNA ZONA DE PROTECCIÓN, como en TFS; quien ya va montado puede entrar.
 */

const montura = (id, name, lookType, speed, opciones) => ({
    id,
    name,
    lookType,
    speed,
    premium: false,
    unlocked: true,
    enabled: true,
    ...(opciones || {})
});

module.exports = [
    // El oso del pack ya lleva silla y alforjas: es la montura de serie.
    montura(1, 'Oso de carga', 312, 10),
    montura(2, 'Cerdo', 306, 5),
    montura(3, 'Escarabajo', 308, 15, { unlocked: false }),
    montura(4, 'Jabalí mecánico', 311, 20, { unlocked: false }),
    montura(5, 'Escolopendra', 313, 20, { unlocked: false, premium: true })
];
