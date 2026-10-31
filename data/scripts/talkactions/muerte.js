'use strict';

/**
 * Comandos de la MUERTE: el historial y las bendiciones.
 *
 *   /muertes            tus últimas 10 muertes
 *   /muertes <nombre>   las de otro personaje, esté dentro o no (el «deathlist» de TFS)
 *   /bendiciones        cuáles tienes, cuánto cuestan a tu nivel y lo que perderías si murieras ahora
 *
 * EL HISTORIAL SALE DE LA BASE (tabla `player_deaths`, ver engine/persistence/database.js): cada
 * muerte se apunta al momento, con el nivel que tenía AL CAER y quién dio el último golpe. Por eso
 * se puede mirar el de alguien que no está conectado, y por eso un servidor sin base de datos
 * (`useDatabase: false`) no tiene historial, y se dice en vez de decir «no ha muerto nunca».
 *
 * LAS BENDICIONES NO SE COMPRAN AQUÍ: las vende el Sanador del templo
 * (data/npc/ciudad/sanador.js), como los NPC del templo de Tibia. Este comando sólo informa; los
 * números (el precio, las rebajas, las probabilidades) los da el motor, `player.getBlessingCost()`
 * y `player.getDeathPenalty()`, para que no haya dos copias de la regla.
 */

/** Cuántas muertes enseña `/muertes`, como el deathlist de TFS. */
const CUANTAS = 10;

/** La fecha de una muerte: `2026-10-31 18:05`, en la hora del servidor. */
function fecha(ms) {
    const d = new Date(Number(ms) || 0);
    const dos = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + ' ' +
        dos(d.getHours()) + ':' + dos(d.getMinutes());
}

/** Un porcentaje legible: 10, 6, 5.6 (sin ceros de más). */
function pct(n) {
    return String(Math.round(Number(n) * 10) / 10);
}

module.exports = [
    {
        type: 'talkaction',
        words: '/muertes',

        onSay(player, words, param) {
            const nombre = String(param || '').trim();
            const r = player.getDeathList(CUANTAS, nombre || undefined);

            if (r && r.noDatabase) {
                player.sendTextMessage('Este servidor no guarda el historial de muertes (no tiene base de datos).');
                return true;
            }
            if (!r) {
                player.sendTextMessage('No existe ningun personaje llamado «' + nombre + '».');
                return true;
            }
            if (r.deaths.length === 0) {
                player.sendTextMessage(r.name + ' no ha muerto nunca.');
                return true;
            }

            player.sendTextMessage('Ultimas muertes de ' + r.name + ':');
            r.deaths.forEach((m) => {
                if (!m.killedBy) {
                    player.sendTextMessage(fecha(m.time) + ' - murio a nivel ' + m.level + '.');
                } else if (m.isPlayer && m.unjustified) {
                    player.sendTextMessage(fecha(m.time) + ' - murio a nivel ' + m.level + ' a manos de ' +
                        m.killedBy + ' (muerte injusta).');
                } else {
                    player.sendTextMessage(fecha(m.time) + ' - murio a nivel ' + m.level + ' a manos de ' +
                        m.killedBy + '.');
                }
            });
            return true;
        }
    },

    {
        type: 'talkaction',
        words: '/bendiciones',

        onSay(player) {
            const lista = player.getBlessings();
            const tiene = lista.filter((b) => b.has).length;

            player.sendTextMessage('Tus bendiciones (' + tiene + ' de ' + lista.length + '):');
            lista.forEach((b) => {
                player.sendTextMessage('  ' + b.nombre + (b.has ? ': la tienes.' : ': no la tienes.'));
            });

            if (tiene < lista.length) {
                player.sendTextMessage('A tu nivel cada una cuesta ' + player.getBlessingCost() +
                    ' de oro. Las da el Sanador del templo.');
            }

            const p = player.getDeathPenalty();
            if (p) {
                player.sendTextMessage('Si murieras ahora perderias un ' + pct(p.percent) +
                    '% de experiencia, skills y nivel magico.');
                player.sendTextMessage('Cada objeto equipado se pierde con un ' + pct(p.item) +
                    '% y la mochila con un ' + pct(p.container) + '%.');
            }
            if (tiene > 0) {
                player.sendTextMessage('Al morir se gastan todas.');
            }
            return true;
        }
    }
];
