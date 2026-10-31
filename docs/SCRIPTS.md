# Los scripts del servidor

En un servidor de Tibia (The Forgotten Server) casi todo lo que **pasa** en el juego no está en el
motor, sino en scripts Lua de `data/`: abrir una puerta, el teletransporte, un comando de chat, lo
que dice un NPC, un anuncio cada hora o una invasión de monstruos. Aquí es igual, pero los scripts
son **JavaScript** y están en `data/scripts/`.

Para añadir comportamiento **no se toca el motor**. Se crea un archivo `.js` en la carpeta que
toque, y al arrancar el motor lo carga solo. Para recargarlos sin reiniciar el servidor está
`Game.reload()` (el `/reload` de TFS); lo más sencillo es reiniciar `npm run serve`.

| Tipo (`type`) | Equivale en TFS a | Carpeta (orientativa) | Callback |
|---|---|---|---|
| `action` | `actions` | `data/scripts/actions/` | `onUse(player, item, fromPos, target, toPos, isHotkey)` |
| `movement` | `movements` | `data/scripts/movements/` | `onStepIn`, `onStepOut`, `onEquip`, `onDeEquip`, `onAddItem`, `onRemoveItem` |
| `talkaction` | `talkactions` | `data/scripts/talkactions/` | `onSay(player, words, param, type)` |
| `event` | `creaturescripts` | `data/scripts/events/` | `onKill`, `onDeath`, `onAdvance`, `onLogin`, `onLogout`, `onAttack`, `onTradeRequest`, `onTradeAccept`, los de los canales: `onJoin`, `onLeave`, `onSpeak`, y los de TFS: `onThink`, `onHealthChange`, `onManaChange`, `onPrepareDeath`, `onTextEdit` |
| `spell` | `spells` | `data/scripts/spells/` | `onCastSpell(player, target, param)` |
| `quest` | `quests.xml` | `data/scripts/quests/` | (definición: misiones por storages) |
| `globalevent` | `globalevents` | `data/scripts/globalevents/` | `onStartup`, `onShutdown`, `onThink(interval)`, `onTime(hora)`, `onSave()`, `onRecord(current, old)` |
| `raid` | `raids` (XML) | `data/scripts/raids/` | etapas: `announce`, `spawn`, `run(Game)` |
| `monster` | `monster/*.xml` | `data/monsters/` | (definición, no callback) |
| `npc` | `npc/scripts/*.lua` | `data/npc/` | `onSay`, palabras clave, comercio |

La carpeta solo sirve para ordenar: el cargador recorre `data/scripts/` entera y lo que decide
qué es cada archivo es su `type`. Un archivo puede exportar una definición o una lista de ellas.
Puede haber **varios scripts para el mismo evento** (dos `onLogin`, tres `onKill`): se ejecutan
todos, en orden de carga.

Si un script tiene un error, el motor lo dice al cargar con el nombre del archivo y el motivo (por
ejemplo, «un evento 'think' necesita 'interval'»), y un fallo dentro de un callback se registra
sin tumbar el servidor.

---

## Acciones: usar un objeto (`onUse`)

En el juego, un objeto se **usa** con **clic derecho** (o doble clic, o la tecla **E** mirando
hacia él). Hay que estar al lado: si el jugador está lejos y hay camino, va andando y lo usa al
llegar. El motor prueba los objetos de la casilla de arriba abajo y usa el primero que tenga una
acción.

Una acción se engancha de tres formas, igual que en TFS:

- `ids`: todos los objetos de ese tipo (todas las palancas);
- `aids`: los objetos con ese **actionId** (lo pones en el editor, en las propiedades del objeto);
- `uids`: el objeto con ese **uniqueId**.

Si varias encajan, gana el uniqueId, luego el actionId y por último el tipo.

```js
// data/scripts/actions/palanca_secreta.js
module.exports = {
    type: 'action',
    aids: [5001],
    onUse(player, item) {
        if (player.getStorageValue('secreto') !== null) {
            player.sendTextMessage('La palanca ya no se mueve.');
            return true;
        }
        player.setStorageValue('secreto', 1);
        player.sendTextMessage('Algo cruje bajo tus pies...');
        Game.createMonster('Wraith', 33, 10, 7);
        return true;   // true = «me he ocupado yo»
    }
};
```

### Ejemplo de verdad: las puertas

`data/scripts/actions/puertas/puertas.js` abre y cierra **todas** las puertas. Al usar una
cerrada la **transforma** (`item.transform(id)`) en su versión abierta, que se puede pisar. Al
usarla otra vez, vuelve a cerrarla, salvo que haya alguien en el umbral.

La tabla de parejas cerrada/abierta no está escrita a mano. Se calcula al cargar a partir de
`items.xml`: en el OpenTibia Sprite Pack las puertas vienen de tres en tres, dos cerradas y una
abierta. Una puerta nueva funciona con solo darla de alta. Para otras puertas, se añaden parejas
a `EXTRA`.

---

## Movimientos: pisar, salir, equipar

```js
// data/scripts/movements/tiles/trampa.js
module.exports = {
    type: 'movement',
    event: 'stepin',            // stepin, stepout, equip, deequip, additem, removeitem
    aids: [7001],
    onStepIn(creature, item, position, fromPosition) {
        if (creature.isPlayer()) {
            creature.sendTextMessage('¡Una trampa! Caes al templo.');
            creature.teleportTo(Game.getWaypoint('temple'));
        }
        return true;
    }
};
```

Todos estos eventos los lanza el motor:

| Evento | Cuándo | Firma |
|---|---|---|
| `stepin` / `stepout` | Una criatura entra o sale de una casilla con ese objeto | `(creature, item, position, fromPosition)` |
| `equip` / `deequip` | El jugador se pone o se quita un objeto de ese tipo | `(player, item, slot, isCheck)` |
| `additem` / `removeitem` | Un objeto llega a la casilla de ese objeto, o se va (lo de la papelera de TFS) | `(objetoQueLlega, objetoDeLaCasilla, position)` |

Ejemplo de `equip`: `movements/items/espada_de_fuego.js` (empuñarla arde y da luz).

El teletransporte (`movements/tiles/teleport.js`) es un `stepin` sobre el objeto 1387. Las
**escaleras, rampas y agujeros** (`movements/tiles/floorchange.js`) también: leen el atributo
`floorchange` de items.xml (`down` baja; `north`, `south`, `east`, `west` suben en esa dirección)
como hace TFS, y las escaleras de mano son una acción (`actions/escaleras/`). Los
anillos y armaduras (`movements/items/`) son `equip` y `deequip`.

---

## Monstruos: su cuerpo y su botín

Cada monstruo de `data/monsters/` dice qué **cuerpo** deja al morir y qué **botín** lleva:

```js
module.exports = {
    type: 'monster',
    name: 'Goblin',
    corpse: 12234,   // el objeto de items.xml que queda en el suelo ("dead goblin")
    loot: [
        { id: 3031, chance: 60000, maxCount: 11 }   // gold coin: 60 % (sobre 100.000), de 1 a 11
    ],
    // ...
};
```

- Al morir, el cuerpo aparece donde cayó y **el botín va dentro**. Sólo si no cabe (o no hay
  cuerpo) cae al suelo.
- `corpse: 0`, o un número que no exista en items.xml: deja **una caja** (`corpseFallbackId` en
  `config.js`, la 11109 «wooden box»), que desaparece a los `corpseFallbackDuration` segundos.
  Así todos los monstruos tienen dónde dejar su botín.
- **Clic derecho** sobre el cuerpo lo abre (si está lejos, el personaje va andando). Se pueden
  tener varios abiertos a la vez: cada uno se abre **debajo** de lo que ya tenías abierto (y si
  ya no cabe, se cierra el último contenedor abierto en esa columna). En su ventana, clic derecho o doble clic sobre un objeto lo mete en
  tu mochila; el botón ⤓ lo coge todo. También se **arrastran**: al mapa (hasta 7 casillas),
  a una ranura de tu equipo o a la mochila. La ranura de la **munición** admite cualquier cosa
  (menos un contenedor), como en Tibia. La ventana se cierra si te alejas.
- **Se pudre**, como en TFS, con `decayTo` y `duration` de items.xml: el cuerpo fresco (3 min),
  el podrido (2 min, aún con el botín) y los huesos (1 min, ya no es contenedor: lo que quedaba se
  pierde); luego desaparece.
- Los cuerpos del OpenTibia Sprite Pack que existen: Cat, Coleoptera, Goblin, Occultist («dead
  human»), Scolopendra, Succubus y Vespidae. Los demás monstruos dejan la caja.

**Sus ataques, como en TFS** (engine/world/monstruos.js). El primero, `melee`, es el cuerpo a cuerpo;
los demás son HECHIZOS, cada uno con su reloj (`interval`) y su probabilidad (`chance`):

```js
attacks: [
    { name: 'melee', interval: 2000, chance: 100, minDamage: 0, maxDamage: -34 },
    { name: 'fire', interval: 2000, chance: 25, minDamage: -10, maxDamage: -35, range: 7, shootEffect: 'fire' },
    { name: 'speed', interval: 4000, chance: 10, speedChange: -150, duration: 6000, range: 7 },   // paraliza
    { name: 'energy', interval: 3000, chance: 15, minDamage: -20, maxDamage: -40, radius: 3, target: false },  // área
    { name: 'healing', interval: 4000, chance: 20, minDamage: 15, maxDamage: 35 }               // se cura
],
```

`name` es un elemento (`physical`, `fire`, `energy`, `earth`/`poison`, `ice`, `holy`, `death`), o
`lifedrain` (se queda la vida que quita), `manadrain`, `speed` o `healing`. `range`: a cuántas casillas;
`radius` (con `target: true`, alrededor del objetivo) o `length`/`spread` (un rayo o una onda) para un
área; `shootEffect` y `effect` lo que se ve; `condition` lo que deja. Sólo alcanzan a jugadores, y no a
través de paredes. Las `immunities` cuentan (al daño y a las condiciones), y `flags.runHealth` (huye
con poca vida), `flags.targetDistance` (mantiene la distancia), `voices` y `changeTarget` también.

### Monstruos importados de TFS

`npm run monstruos:importar` (`tools/importar-monstruos.mjs`) lee las fichas Lua de un servidor TFS o
Canary (por defecto `../forserver-downgrade/data/monsters`) y escribe un módulo por monstruo en
`data/monsters/importados/<carpeta>/`. Cada vez que se ejecuta sustituye lo importado: si quieres
cambiar uno a mano, sácalo de `importados/`. Ahora mismo trae 40.

Qué se importa:

- **Solo los que se dibujan bien:** su `lookType` tiene que estar en `ASPECTOS_FIELES`. Los aspectos
  301-346 del cliente son los del OpenTibia Sprite Pack, no los de Tibia. Tampoco se importan los jefes,
  las misiones, los eventos y los entrenadores, ni los que ya existen.
- **Los ataques que el motor sabe hacer:** los de arriba. Un `combat` lleva su `type` como elemento, y
  el cuerpo a cuerpo con `skill`/`attack` lleva el daño máximo de TFS. Los hechizos con nombre propio
  («fire wave») no se importan y salen en el informe.
- **El botín y el cuerpo, por nombre:** el id del otro servidor se busca en su `items.xml` y el nombre,
  en el nuestro. Lo que no tenemos se queda fuera. Un humano sin cuerpo propio deja el `dead human`.

En el mapa «continente», cada importado tiene respawn en la zona que le toca por su nombre o por lo
duro que es (`ZONAS` en `tools/generar-continente.mjs`). La prueba es `npm run test:monstruos`.

---

## Comandos de chat

```js
module.exports = {
    type: 'talkaction',
    words: '/hola',
    onSay(player, words, param) {
        player.sendTextMessage('Hola, ' + player.getName() + (param ? ' (' + param + ')' : ''));
        return true;
    }
};
```

Los que vienen hechos: `/pos`, `/i`, `/outfit`, `/equipar`, `/quitar`, `/stats`, `/ayuda`; de GM,
`/ir <lugar>` (viajar a un waypoint del mapa) y `/montura`; de god, `/item <id>`, `/raid [nombre]` y
`/grupo`.

**Comandos del personal.** `access: 'gamemaster'` (o `'god'`, `'tutor'`…: los nombres de
`data/XML/groups.js`) deja el comando sólo para ese grupo o uno mayor. Para los demás NO EXISTE: la
frase se dice en voz alta como cualquier otra, igual que en TFS.

```js
module.exports = {
    type: 'talkaction',
    words: '/teletransportar',
    access: 'gamemaster',
    onSay(player, words, param) { /* ... */ return true; }
};
```

**Como en TFS**, también valen `access: true` (el `talk:access(true)`: sólo el personal, los grupos con
`access: true`) y `accountType: ACCOUNT_TYPE_GOD` (el `talk:accountType`: el id del grupo tiene que
llegar a ese número; los ids de `groups.js` coinciden con los `ACCOUNT_TYPE_*` de TFS, 1 normal ... 4
gamemaster ... 6 god). Los comandos de moderación (`talkactions/castigos.js`) piden `access:
'gamemaster'`, que es lo mismo que `accountType: ACCOUNT_TYPE_GAMEMASTER`; cualquiera de las dos formas
vale para un comando nuevo.

`separator` (el de TFS) dice qué separa las palabras del parámetro: por defecto un espacio
(`/item 3031`); con `''` vale pegado (`/t3031`, `param` = `'3031'`); con otro (`'"'`) el parámetro
tiene que empezar por él (`!casa "Bob`, `param` = `'Bob'`), y sin él el comando no casa.

Los **hechizos** se escriben igual, sin barra (`exura`, `exori flam`…), pero tienen su propio
tipo, `spell`, más abajo.

---

## Eventos globales

No dependen de ningún jugador, sino del servidor y del reloj. Puede haber tantos como quieras de
cada tipo.

```js
// data/scripts/globalevents/guardado.js
module.exports = [
    { type: 'globalevent', name: 'bienvenida', event: 'startup',
      onStartup() { Game.log('servidor en marcha'); return true; } },

    { type: 'globalevent', name: 'anuncio', event: 'think', interval: 10 * 60 * 1000,
      onThink(interval) { Game.broadcastMessage('Recuerda: el templo es zona segura.'); return true; } },

    { type: 'globalevent', name: 'amanecer', event: 'time', time: '06:00',
      onTime(hora) { Game.broadcastMessage('Amanece en Jetyum.'); return true; } },

    { type: 'globalevent', name: 'cierre', event: 'shutdown',
      onShutdown() { Game.log('apagando'); return true; } }
];
```

- `think`: cada `interval` milisegundos (100 como mínimo).
- `time`: todos los días a la hora `HH:MM` del reloj del servidor.
- `save`: en cada guardado periódico (`autosaveIntervalMs`), con todo ya guardado. Sin base de datos
  no hay guardado y no se lanza.
- `record`: `onRecord(current, old)` cuando hay más jugadores a la vez que nunca. El récord se guarda
  en la base (tabla `meta`) y `Game.getPlayersRecord()` lo da.

El ejemplo que viene hecho está en `data/scripts/globalevents/arranque.js`.

---

## Raids

Una raid es una invasión por **etapas**. Cada etapa empieza `delay` milisegundos después del
comienzo de la raid y puede:

| Campo | Hace |
|---|---|
| `announce: 'texto'` | Avisa a todos los jugadores conectados |
| `spawn: { monster, x, y, z, count, radius }` | Hace aparecer `count` monstruos en casillas libres alrededor del punto |
| `run(Game) { ... }` | Cualquier otra cosa |

Cuándo empieza:

- `interval` y `chance`: cada `interval` se tira un dado, y empieza si sale por debajo de
  `chance` (de 0 a 100);
- `time: 'HH:MM'`: todos los días a esa hora;
- sin ninguno de los dos, solo a mano con `/raid nombre`.

Una raid no se solapa consigo misma.

```js
// data/scripts/raids/goblins.js (viene hecha)
module.exports = {
    type: 'raid',
    name: 'goblins',
    interval: 2 * 60 * 60 * 1000,
    chance: 25,
    steps: [
        { delay: 0, announce: 'Se oyen tambores en el suroeste...' },
        { delay: 40000, spawn: { monster: 'Goblin', x: 8, y: 45, z: 7, count: 6, radius: 3 } },
        { delay: 100000, run(Game) { Game.createMonster('Occultist', 24, 45, 7); } }
    ]
};
```

---

## Entrar y salir (`onLogin`, `onLogout`)

```js
// data/scripts/events/bienvenida.js
module.exports = {
    type: 'event',
    event: 'login',
    onLogin(player) {
        player.sendMagicEffect(EFECTO.MAGIA_AZUL);
        player.sendTextMessage('Bienvenido, ' + player.getName());
        return true;          // false: no le deja entrar (como en TFS)
    }
};
```

`onLogout(player)` se lanza al salir, todavía en el mundo (para guardar algo en un storage).

## Comerciar entre jugadores (`onTradeRequest`, `onTradeAccept`)

El intercambio entre jugadores (`engine/world/intercambio.js`, el «Trade with...» de Tibia) avisa a
los scripts como los `events/player.lua` de TFS. Con `false`, no se deja:

```js
module.exports = [{
    type: 'event',
    event: 'traderequest',
    onTradeRequest(player, target, item) {         // al ofrecer (o contestar con) algo
        if (item.getId() === 2160 && player.getLevel() < 20) {
            player.sendCancelMessage('No puedes comerciar con eso hasta el nivel 20.');
            return false;
        }
        return true;
    }
}, {
    type: 'event',
    event: 'tradeaccept',
    onTradeAccept(player, target, item, targetItem) { // los dos han aceptado, antes de cambiar
        return true;                                  // false: se cancela y no se cambia nada
    }
}];
```

`item` es lo que ofrece `player` (un objeto del inventario, o uno del suelo) y `targetItem` lo de
`target`; `onTradeAccept` llega con `player` el último en aceptar. Las reglas que pone el motor
antes de preguntar: a dos casillas en la misma planta, que se pueda coger, que no sea el depósito ni
tenga `uniqueId`, como mucho 100 objetos y que ninguno comercie con otro.

## Los canales del chat (`onJoin`, `onLeave`, `onSpeak`)

Los canales (`engine/world/canales.js`, los de TFS 1.x): **0** el del gremio de cada uno, **1** el del
grupo, **3** «Juego», **5** «Comercio», **7** «Ayuda» y del **100** en adelante los privados. El
nivel que pide cada público y la espera de Comercio están en `config.js`:

```js
chatChannels: {
    juego: { level: 1 },
    comercio: { level: 1, cooldownMs: 2 * 60 * 1000 },   // «Sólo puedes poner una oferta cada dos minutos.»
    ayuda: { level: 1 }                                   // `name` cambia el nombre que se ve
},
vipLimit: 20,                                             // cuántos caben en la lista VIP de una cuenta
```

Por debajo del nivel, el canal no sale en la lista, no se puede abrir y no se puede hablar en él. El
personal (GM y más) no tiene ni nivel ni espera.

Los eventos de los canales de TFS llegan a los scripts como eventos de criatura, para **todos** los
canales, con el id al final; `false` en `onSpeak` impide el mensaje:

```js
module.exports = [{
    type: 'event',
    event: 'channelspeak',
    onSpeak(player, type, message, channelId) {     // type: 5, el TALKTYPE_CHANNEL_Y de Tibia 8.60
        if (channelId === 5 && /http/i.test(message)) {
            player.sendCancelMessage('Nada de enlaces en Comercio.');
            return false;
        }
        return true;
    }
}, {
    type: 'event',
    event: 'channeljoin',
    onJoin(player, channelId) {}                     // también `channelleave` → onLeave(player, channelId)
}];
```

Para un canal propio con sus eventos (como un `<channel>` de `chatchannels.xml` con su script), el
motor tiene `world.registrarCanal({ id, nombre, nivel, espera, onJoin(player), onLeave(player),
onSpeak(player, texto) })`, con un id entre 2 y 99.

**Mandar una línea del servidor** a un canal (sin autor; el cliente la traduce):

| Función | Qué hace |
|---|---|
| `Game.sendChannelMessage(channelId, type, texto)` | A todos los que tienen abierto un canal público o privado. `type`: `'sistema'` o `'rojo'` (o el número de TFS: 10 y 14 son rojos) |
| `Game.sendGuildChannelMessage(guildId, type, texto)` | Lo mismo en el canal de un gremio |

**Lo que los demás sistemas enganchan** (en el mundo):

- `world.gremioDe(player)` → `{ id, nombre, rango, nivel, motd }` o null. La pone el sistema de
  gremios; sin ella no hay canal 0. Sólo los de ese gremio lo ven, y al abrirlo la primera línea es
  «Mensaje del día: …» si hay `motd`.
- `world.mensajeAlCanalDeGremio(guildId, texto)` → una línea del servidor a los de ese gremio que
  tienen el canal abierto («Ana se ha unido al gremio.»). Devuelve a cuántos llegó.
- `world.silenciado(player)` → el **hook de moderación**: se pregunta antes de cualquier mensaje en
  un canal. Aquí devuelve `false`; el sistema de castigos lo sustituye (`engine/world/castigos.js`
  añade el silencio de un GM). Si devuelve un texto, es lo que se le dice al jugador; con `true`, «No
  puedes hablar ahora.».

## La lista VIP

Es de la **cuenta** (tabla `account_viplist`, `engine/world/vip.js`): se añade por nombre (un
personaje que exista en la base) y caben `vipLimit`. Al entrar, cada jugador recibe su lista con
quién está dentro, y quien le tiene en la suya recibe que ha entrado (o salido, al irse). En el
mundo: `world.listaVip(player)`, `world.anadirVip(player, nombre)`, `world.quitarVip(player,
idONombre)` y `world.avisarVip(player, enLinea)`. Sin persistencia no hay lista en el servidor.

## Usar con una hotkey (`target` es una criatura)

Una hotkey de objeto (Ctrl+K en el cliente) usa el primero que lleves de ese tipo **en ti o en tu
objetivo**: el `onUse(player, item, fromPos, target, toPos, isHotkey)` recibe como `target` la
**criatura** (con `toPos` su posición) e `isHotkey` a `true`. Las pociones lo usan para curar a otro
jugador (`data/scripts/actions/pociones.js`); a un monstruo no se la dan.

## Cada ataque (`onAttack`)

`event: 'attack'` → `onAttack(atacante, objetivo)`, en cada ataque de un jugador o de un monstruo
(golpee o falle), con el atacante ya girado hacia su objetivo. Es lo que lanza el **tajo de
espada** de los caballeros (`data/scripts/events/tajo_espada.js`):

```js
const POR_DIRECCION = [EFECTO.ESPADA_NORTE, EFECTO.ESPADA_ESTE, EFECTO.ESPADA_SUR, EFECTO.ESPADA_OESTE];

module.exports = {
    type: 'event',
    event: 'attack',
    onAttack(atacante) {
        if (atacante.isPlayer() && /knight/i.test(atacante.getVocation()) && atacante.getWeaponType() === 'sword') {
            Game.sendMagicEffect(atacante.getPosition(), POR_DIRECCION[atacante.getDirection()]);
        }
        return true;
    }
};
```

Los cuatro tajos (`EFECTO.ESPADA_NORTE` 201, `ESPADA_ESTE` 202, `ESPADA_SUR` 203, `ESPADA_OESTE`
204) son la espada de BrowserQuest importada como efectos de verdad (están en `things.json`). Los
efectos propios van del 201 al 299.

---

## Hechizos (`type: 'spell'`)

El motor comprueba lo de siempre (vocación, nivel, maná, almas, el **enfriamiento** del grupo y,
si lo pide, que haya **objetivo** a su alcance), gasta el maná (y sube el nivel mágico) y, si algo
falla, lo dice con una nube «poff». El script sólo dice qué hace:

```js
// data/scripts/spells/ataque.js (un trozo)
module.exports = {
    type: 'spell', words: 'exori flam', name: 'Flame Strike',
    group: 'ataque',           // 'ataque' (2 s), 'curacion' (1 s) o 'apoyo' (2 s); `cooldown` en ms lo cambia
    level: 12, mana: 20, soul: 0,
    vocations: ['Sorcerer', 'Druid'],   // vacío: todas
    needTarget: true, range: 3,         // el objetivo es a quien estás atacando
    onCastSpell(player, target, param) {
        Game.doTargetCombat(player, target, { type: 'fire', min: 10, max: 30, proyectil: PROYECTIL.FUEGO });
        return true;           // true (o un texto, que se le dice): lanzado; false: no, y no gasta maná
    }
};
```

Los que hay: `exura`, `exura gran`, `exura vita` (curar); `exori flam`, `exori vis`, `exori frigo`,
`exori tera` (golpe al objetivo), `exevo flam hur` (onda de fuego), `exori` (tajo alrededor, de
caballeros); `utani hur` (correr), `utevo lux` (luz), `exana pox` (quitar el veneno) y `exani tera`
(la cuerda mágica; está junto a la cuerda, en `data/scripts/actions/herramientas.js`). Y los
**conjuros** de runas (más abajo).

**Un conjuro** no necesita script: `conjurar: { de, a, cargas }` convierte una runa en blanco (`de`) que
lleves en la runa `a` con sus cargas:

```js
{ type: 'spell', words: 'adori vita vis', name: 'Sudden Death', group: 'apoyo', level: 20, mana: 400, soul: 5,
  vocations: ['Sorcerer', 'Master Sorcerer'], conjurar: { de: 21000, a: 21001, cargas: 3 } }
```

---

## Runas (`type: 'rune'`)

Una runa es un objeto con cargas que lanza un hechizo al usarlo **sobre** algo («usar con»: clic
derecho en la runa y luego en una criatura o una casilla, o desde una hotkey). El motor comprueba
nivel, **nivel mágico**, vocación, enfriamiento, alcance (7) y que se vea el sitio; las ofensivas no
se usan desde una zona de protección. Si el script devuelve `true`, gasta una carga (con la última,
la runa desaparece):

```js
// data/scripts/spells/runas.js (un trozo)
module.exports = {
    type: 'rune', id: 21001, name: 'Sudden Death', level: 20, magicLevel: 5,
    needTarget: true,       // sólo sobre una criatura (si no, también sobre una casilla)
    aggressive: true,       // un ataque: grupo «ataque» y no desde una zona de protección
    onCastSpell(player, variant) {          // variant: { creature (o null), position }
        Game.doTargetCombat(player, variant.creature, { type: 'death', min: 40, max: 80, proyectil: PROYECTIL.FUEGO });
        return true;
    }
};
```

Las que hay (21001-21014 de items.xml): sudden death, heavy y light magic missile, ultimate e
intense healing, great fireball, explosion, fire field, fire bomb, energy field, poison field, magic
wall, destroy field y paralyze. Los **campos** se crean con `Game.createField(id, posicion, quien)` y
se quitan con `Game.removeFields(posicion)` (engine/world/campos.js): hacen daño y dejan la condición
al pisarlos, y se apagan solos.

---

## Misiones (`type: 'quest'`)

El diario (botón **Misiones**) se calcula con los **storages** del jugador: la misión sólo dice qué
storage es cada paso y qué valores son «empezada» y «terminada». Quien los sube son los scripts.

```js
// data/scripts/quests/plaga_de_ratas.js
module.exports = {
    type: 'quest', name: 'La plaga de ratas', storage: 'ratas.inicio', startValue: 1,
    missions: [
        { name: 'Caza ratas', storage: 'ratas.muertas', startValue: 0, endValue: 10,
          description: (v) => 'Mata 10 (llevas ' + v + ').' }
    ]
};
```

`data/scripts/events/misiones.js` la empieza al entrar (`onLogin`) y cuenta las ratas (`onKill`); a
las 10 da la recompensa con `player.addMoney` y `player.addItem`.

---

## Efectos y condiciones

**Efectos**: `Game.sendMagicEffect(pos, EFECTO.FUEGO)` sobre una casilla y
`Game.sendDistanceEffect(desde, hasta, PROYECTIL.FLECHA)` volando. Son los del OpenTibia Sprite
Pack; los nombres están en `shared/js/efectos.mjs` y valen también los de TFS (`CONST_ME_HITBYFIRE`,
`CONST_ANI_ARROW`...). Son globales: no hay que importarlos.

| `EFECTO.` | | `PROYECTIL.` | |
|---|---|---|---|
| `SANGRE` | golpe que hace sangre | `LANZA`, `FLECHA`, `VIROTE` | armas |
| `GOLPE` | golpe parado por la armadura | `ESTRELLA`, `CUCHILLO`, `PIEDRA`, `ROCA` | arrojadizas |
| `POFF` | algo que falla | `FUEGO`, `BOLA_FUEGO` | fuego |
| `MAGIA_AZUL` | curar, magia | `HIELO`, `TIERRA`, `VENENO` | elementos |
| `FUEGO`, `ONDA_FUEGO`, `REMOLINO_FUEGO`, `EXPLOSION` | fuego | `FLECHA_LIGERA`, `FLECHA_VENENOSA` | flechas mágicas |
| `ENERGIA`, `HIELO`, `TIERRA`, `ROCA`, `POLVO`, `CHISPAS` | elementos | | |

El combate ya los usa solo: cada golpe enseña sangre, un golpe parado o el efecto de su elemento;
un arco enseña la flecha que vuela.

**Condiciones**: lo que le pasa a una criatura un rato.

```js
player.addCondition({ type: 'veneno', ticks: 10, interval: 2000, value: 5 });   // 5 de daño, 10 veces
player.addCondition({ type: 'regeneracion', ticks: 30, interval: 1000, value: 2 });
player.addCondition({ type: 'prisa', duration: 10000, value: 60 });              // +60 de velocidad
player.addCondition({ type: 'paralisis', duration: 5000, value: 80 });
player.addCondition({ type: 'luz', duration: 60000, value: 6 });                 // 6 casillas
player.hasCondition('veneno'); player.removeCondition('veneno'); player.getCondition('prisa');
```

Tipos: `veneno`, `fuego`, `energia`, `sangrado` (daño), `regeneracion`, `prisa`, `paralisis`, `luz`
(y sus nombres de TFS: `poison`, `fire`, `energy`, `bleeding`, `regeneration`, `haste`,
`paralyze`, `light`). Un ataque de monstruo puede dejar una: la araña venenosa lleva
`condition: { type: 'veneno', ... }` en su ataque.

---

## Usar lo que llevas

Clic derecho (o doble clic) sobre algo de tu mochila o de tu equipo lo **usa**: es el mismo
`onUse` de las acciones, con un objeto que sabe gastarse (`item.remove(1)`), cambiar
(`item.transform(id)`) o decir dónde está (`item.getSlot()`, `item.isInInventory()`). Así funcionan
`actions/pociones.js` y `actions/comida.js`.

---

## El depósito y el correo

**Un depósito por ciudad.** Cada jugador tiene un depósito en cada ciudad del mapa
(`player.depositos`, `{ idDeCiudad: [árboles] }`, que se guarda con el personaje). Un cofre de
depósito abre el de SU ciudad: la de su atributo `townId` si lo tiene, si no la del templo más
cercano en su planta, y si no hay ninguno en su planta la del más cercano en cualquiera. Un
personaje de cuando había un depósito solo (`player.deposito`) lo encuentra en el de su ciudad.

**El correo** (`engine/world/correo.js`, los objetos de `tools/generar-correo.mjs`): el Tendero
vende la carta (21041, 8 de oro), el paquete (21043, 15) y la etiqueta (21045, 1). La carta o la
etiqueta se usan y se escriben: en la **primera línea** el nombre de quien lo recibe y en la
**segunda**, si se quiere, la ciudad (sin ella, la suya). Un paquete lleva la etiqueta dentro. Se
manda echándolo en un **buzón** (21040): arrastrándolo a su casilla o, la carta, usándola sobre él.
Se sella (la carta sellada es la 21042, el paquete sellado la 21044) y llega al depósito de esa
ciudad: al momento si está dentro («Te ha llegado correo nuevo.»), y si no, al entrar («Tienes
correo nuevo.»; espera en la tabla `player_mail`). Si no se puede mandar —no dice a quién, no
existe esa persona o esa ciudad, lleva un depósito o demasiadas bolsas unas dentro de otras— no se
mueve y se dice por qué. Las acciones están en `actions/correo.js` y la entrega al entrar en
`events/correo.js`.

**Dejar algo en el depósito de alguien**, desde el motor (lo usa el correo y lo usan las casas
para devolver lo que había en una casa a su antiguo dueño):

```js
world.entregarEnDeposito(personaje, guardado, { townId, remitente, aviso })   // → true / false
```

- `personaje`: su id de personaje (`characterId`, un número) o su nombre (sin mayúsculas).
- `guardado`: el objeto como árbol `{ typeId, count, attributes, contents? }`, el formato de
  `world.objetoParaGuardar(item)` (y de `contenidoParaGuardar` para lo que se lleva). Se copia.
- `townId`: la ciudad del depósito; sin él, la de quien lo recibe. Una que no existe → `false`.
- `remitente`: quién lo manda (se apunta con el correo que espera); `aviso`: lo que se le dice si
  está dentro (por defecto «Te ha llegado correo nuevo.»; `false`, nada).
- Si está dentro, va a su depósito de esa ciudad (delante de lo que hubiera, sin tope de huecos,
  como en TFS; si tiene la ventana abierta, se pone al día sola). Si no, se apunta en `player_mail`
  y se le entrega al entrar. `false` si no existe, si el objeto no existe en `items.xml`, o si no
  está dentro y el servidor no tiene base de datos.

**Las camas** (21050 la cabecera, con los pies 21051 en la casilla del sur; 21052 y 21053 con
alguien durmiendo) sólo se dibujan aquí: llevan `bed`, `bedPart` (`head`/`foot`),
`partnerDirection` y el id de su otra versión (`occupiedId` / `freeId`). Lo que hacen es de las casas.

---

## Las casas y el banco

Como en TFS 8.60 (`engine/world/casas.js`). **El banco** es el `balance` de TFS: monedas de oro
guardadas con el personaje (`players.balance`), que no pesan y **no se pierden al morir**. El
Banquero (`data/npc/ciudad/banquero.js`) entiende «depositar 500» / «deposit all», «retirar 500»,
«saldo» y «transferir 500 a Pepe» (también por pasos), y cada operación espera un «si»; transferir
vale también a quien no está conectado (va por la base). Lo que mueve saldo sin mover monedas
(transferir, comprar, el alquiler) se escribe en la base al momento.

**Las casas** salen del mapa (`houses` y el `houseId` de cada casilla) y su estado de la base
(`houses`, `house_lists`, `house_items`). Los comandos (`data/scripts/talkactions/casas.js`):

| Comando | Qué hace |
|---|---|
| `!buyhouse` | Compra la casa de la **puerta que tienes delante**, con el saldo del banco: `housePriceEachSQM` × casillas, desde `houseLevel`, si no tienes ya una y está libre (no se pide premium) |
| `!leavehouse` | Deja la casa en la que estás, si es tuya: lo de dentro va a tu depósito de la ciudad de la casa (`entregarEnDeposito`), las listas se borran y sale todo el mundo |
| `aleta sio` | La lista de **invitados** de la casa en la que estás, en una ventana de texto (el dueño y los subdueños) |
| `aleta som` | La lista de **subdueños** (sólo el dueño) |
| `aleta grav` | La lista de la **puerta** que tienes delante (sólo el dueño) |
| `alana sio "nombre` | Echa a alguien de la casa en la que estás (sólo a quien tiene menos acceso); sin nombre, te echas tú |

`!sellhouse` no está: en TFS hace falta un comercio con un documento de la casa.

- **Las listas**: un nombre por línea, sin mayúsculas; `*` vale cualquier cosa y `?` una letra;
  `!` delante excluye (`!Pepe`); `#` empieza un comentario.
- **Quién entra**: el dueño, los subdueños y los invitados; a una casa sin dueño, nadie; un
  monstruo o un NPC, nunca; el personal, siempre. Quien no puede, no pisa sus casillas, no coge ni
  deja nada en ellas, y si se teletransporta (o entra al juego) dentro aparece en la salida. Al
  quitarle de una lista estando dentro, sale a la puerta.
- **Las puertas**: el dueño y los subdueños las abren siempre; si la puerta tiene lista, sólo quien
  esté en ella; si no, quien pueda entrar. Mirar una puerta de casa dice «Pertenece a la casa
  'X'. Pepe es su dueño.» o lo que cuesta (`world.houseLookText(x, y, z)`).
- **El alquiler** (el `rent` de cada casa) se cobra del banco cada `houseRentPeriod` (`'never'`,
  `'daily'`, `'weekly'`, `'monthly'`), esté el dueño conectado o no; el primero, en la primera
  vuelta del reloj (cada hora) después de comprar. Sin saldo, un aviso al día; tras 7 avisos, la
  casa se pierde y lo de dentro va al depósito del que era su dueño.
- **Lo de dentro se guarda**: lo que se puede coger (`pickupable`) que hay en las casillas de la
  casa, con lo que lleve dentro, y lo que hay dentro de los armarios y cofres del mapa. Lo demás
  (paredes, puertas, camas) es del mapa.
- **Las camas** (`data/scripts/actions/camas.js`): usar una cama de una casa en la que estás
  invitado te acuesta y te saca del juego; al volver recuperas 1 de vida y 1 de maná cada 30
  segundos y 1 alma cada 15 minutos, hasta el máximo. Si está ocupada: «Pepe está durmiendo ahí.».
  Una cama es un objeto con `bed` en items.xml o uno de `bedItems` (config.js).

Desde un script, el jugador tiene `getBankBalance()`, `setBankBalance(n)`, `depositMoney(n)`,
`withdrawMoney(n)`, `transferMoney(nombre, n)`, `getHouse()` (la suya), `getTileHouse()` (en la que
está), `buyHouse()`, `leaveHouse()`, `editHouseList('guests'|'subowners'|'door')`,
`kickFromHouse(nombre)` y `sleepInBed(item)`: todos devuelven `{ ok, reason, ... }` (ver la tabla
de abajo). Una casa (`getHouse()`) tiene `getId()`, `getName()`, `getTownId()`, `getRent()`,
`getPrice()`, `getTileCount()`, `getOwnerGuid()`, `getOwnerName()`, `getPaidUntil()`,
`getRentWarnings()`, `getExitPosition()`, `getDoors()`, `getAccessList(256|257|puerta)` y
`getAccessLevel(player)` (0 nada, 1 invitado, 2 subdueño, 3 dueño).

## Los gremios

Como en los servidores de TFS 8.60 que los llevan por comandos (`engine/world/gremios.js`, tablas
`guilds`, `guild_ranks`, `guild_membership` y `guild_invites`, versión 9 de la base). Un gremio nace
con tres rangos —**Líder** (3), **Vicelíder** (2) y **Miembro** (1)— y quien lo funda es su líder.
Sin base de datos no hay gremios. Los comandos (`data/scripts/talkactions/gremios.js`):

| Comando | Quién | Qué hace |
|---|---|---|
| `!createguild Nombre` | cualquiera desde `guildCreateLevel` (8) | Funda un gremio: de 3 a 20 letras y espacios, nombre único (sin mayúsculas), y no estar ya en uno |
| `!joinguild Nombre` | invitado | Entra como miembro (sin nombre: las invitaciones que tienes). Al entrar se borran las demás invitaciones |
| `!leaveguild` | vicelíder, miembro | Sale. El líder no puede: antes pasa el mando o disuelve |
| `!guildinvite nombre` | líder, vicelíder | Invita, esté dentro o no |
| `!guildkick nombre` | líder (a todos), vicelíder (a miembros) | Echa, esté dentro o no; a quien sólo está invitado le retira la invitación |
| `!guildpromote nombre` / `!guilddemote nombre` | líder | De miembro a vicelíder y al revés |
| `!guildleader nombre` | líder | Le pasa el mando (y el gremio, `guilds.ownerid`); el antiguo líder queda de vicelíder |
| `!disbandguild` | líder | Disuelve el gremio: rangos, miembros e invitaciones |
| `!guildmotd [texto]` | líder, vicelíder | El mensaje del día: sin texto lo enseña (a cualquiera), `-` lo quita |
| `!guildnick [nombre,] apodo` | cada uno el suyo; vicelíder, el de los miembros; líder, el de todos | El apodo (hasta 15 caracteres); sin apodo, lo quita |
| `!guild` | miembro | El gremio, su mensaje del día y quién está conectado, en una ventana de texto |

Los avisos («Pepe se ha unido al gremio.», el mensaje del día, ascensos, quién sale) van por el
**canal del gremio** (`world.mensajeAlCanalDeGremio`) si alguien lo tiene abierto, y si no, como
mensaje a cada miembro conectado. **Al mirar** a un jugador sale, como en TFS, «Él es Líder del
gremio Dragones (apodo).» —«Ella es…» según el sexo del personaje, «Eres…» si te miras—. El gremio
de cada jugador conectado se carga al entrar y se guarda en memoria hasta que algo cambia.

Para los demás sistemas: `world.gremioDe(player)` → `{ id, nombre, rango, nivel, motd, apodo }` o
`null`, `world.gremioPorId(id)`, `world.gremioPorNombre(nombre)`, `world.jugadoresDeGremio(id)` y
`world.miembrosDeGremio(id)`; al cambiarle el gremio a alguien conectado, el mundo avisa
`onGuildChange(player, gremio)`.

Desde un script (los de TFS): `player.getGuild()` (un gremio o `null`), `player.getGuildLevel()` (0
sin gremio), `player.getGuildNick()`, `player.setGuildNick(apodo)` y `player.getGuildInvites()`. Un
gremio tiene `getId()`, `getName()`, `getMotd()`, `setMotd(texto)`, `getOwnerGuid()`,
`getMembersOnline()` (envoltorios de jugador), `getMembers()` (todos, conectados o no), `getRanks()`,
`getRankById(id)` y `getRankByLevel(nivel)` (`{ id, name, level }`). Y las órdenes de los comandos,
que comprueban los permisos y devuelven `{ ok, reason, ... }`: `createGuild(nombre)`,
`joinGuild(nombre)`, `leaveGuild()`, `inviteToGuild(nombre)`, `kickFromGuild(nombre)`,
`promoteInGuild(nombre)`, `demoteInGuild(nombre)`, `passGuildLeadership(nombre)`, `disbandGuild()`,
`changeGuildMotd(texto)`, `changeGuildNick(nombre, apodo)` y `getGuildInfo()`
(`engine/scripting/gremios-api.js`). Las guerras (`guild_wars`) no están.

## Moderación: suspensiones, namelock, echar y silenciar

Comandos del personal (`data/scripts/talkactions/castigos.js`, `access: 'gamemaster'`): para un
jugador no existen y se dicen en voz alta, como `/grupo`. A alguien del personal sólo le castiga
quien tenga un grupo **mayor** (un GM no castiga a otro GM ni a un god). Las reglas, en
`engine/world/castigos.js`; lo que se guarda, en las tablas de TFS (versión 10), con las horas en
segundos:

| Comando | Qué hace |
|---|---|
| `/ban nombre[, días[, motivo]]` | Suspende la **cuenta** (`account_bans`), esté dentro o no; 0 o sin días son `banDays` (7), negativo es para siempre. Saca del juego a sus personajes conectados, aunque estén en combate |
| `/unban nombre` | Levanta la suspensión; pasa a `account_ban_history` (también la que se sustituye con otro `/ban`, y la que caduca) |
| `/ipban nombre[, días[, motivo]]` | Suspende la **IP** desde la que juega (`ip_bans`): la de su conexión o, si no está dentro, la última desde la que entró (`players.lastip`). Saca a todos los de esa IP |
| `/namelock nombre[, motivo]` | No entra hasta que se le cambie el nombre (`player_namelocks`) |
| `/kick nombre` | Le saca del juego |
| `/mute nombre[, minutos]` | No habla en voz alta ni en los canales (5 minutos si no se dice): «Estás silenciado durante N minutos.». Los comandos y los hechizos sí. Va en un storage del personaje, así que salir y volver no lo quita |
| `/unmute nombre` | Le devuelve la palabra |
| `/baninfo nombre` | La suspensión vigente, el namelock y el historial, en una ventana de texto |

**Al entrar**: una IP suspendida no llega a autenticarse; una cuenta suspendida, con la contraseña
bien, recibe «Tu cuenta ha sido suspendida hasta el 2026-11-02 18:05 por Gema. Motivo: spam.» (o
«…para siempre…»), también al pedir la lista de personajes; un personaje con namelock, «Tu personaje
tiene el nombre bloqueado…». Lo que ya caducó se limpia en ese momento y deja entrar.

El silencio de un GM llega a los canales por `world.silenciado(player)`, que devuelve el texto del
aviso (o lo que diga el hook de los canales si no hay silencio), y a hablar en voz alta por
`creatureSay`. Desde un script: `banPlayer(nombre, días, motivo)`, `unbanPlayer(nombre)`,
`ipBanPlayer(...)`, `namelockPlayer(nombre, motivo)`, `kickPlayer(nombre)`, `mutePlayer(nombre,
minutos)`, `unmutePlayer(nombre)`, `getBanInfo(nombre)` y `getMutedTime()`, con el jugador que las
llama como quien castiga.

**Configuración** (`config.js`): `guildCreateLevel` (8) y `banDays` (7).

---

## Compatibilidad con TFS

Quien porta un datapack de The Forgotten Server (1.x con revscripts, o 0.x / 8.60) encuentra los
nombres que espera. Los scripts siguen siendo módulos JavaScript (`type: 'action'`...), pero dentro
de los callbacks valen las clases, las constantes y las funciones sueltas de TFS, todas como
globales (como `Game`):

- **Constructores** de TFS 1.x: `Player(cid | nombre)`, `Creature(...)`, `Monster(cid)`,
  `Npc(cid | nombre)`, `Item(uid)`, `Container(uid)`, `Tile(pos)` (o `Tile(x, y, z)`),
  `ItemType(id | nombre)`, `Town(id | nombre)`, `Group(id)`, `Vocation(id | nombre)`, `House(id)`,
  `Condition(CONDITION_*)` y `Position(x, y, z)` (sin `new`, como en TFS; es la `Position` del motor).
- **Constantes** (`engine/scripting/enums.js`), con los números de TFS 1.x: `MESSAGE_*`,
  `TALKTYPE_*`, `CONST_SLOT_*`, `SLOTP_*`, `CONST_ME_*` / `CONST_ANI_*` (los que el pack no tiene caen
  en el efecto más parecido), `COMBAT_*`, `ORIGIN_*`, `CONDITION_*`, `CONDITION_PARAM_*`, `CONDITIONID_*`,
  `SKILL_*`, `SKULL_*`, `PLAYERSEX_*`, `ACCOUNT_TYPE_*`, `PlayerFlag_*`, `DIRECTION_*` (y los `NORTH`...
  de 0.x), `ZONE_*`, `TILESTATE_*`, `CONST_PROP_*`, `ITEM_TYPE_*`, `ITEM_ATTRIBUTE_*`, `RETURNVALUE_*`
  (los 27 primeros), `WORLD_TYPE_*`, `GAME_STATE_*`, `GUEST_LIST` / `SUBOWNER_LIST`, `LUA_ERROR` /
  `LUA_NO_ERROR`. Las que no significan nada aquí existen igual, para que el script cargue: en
  JavaScript una global que falta es un `ReferenceError`, no un `nil`.
- **Funciones de 0.x** (`engine/scripting/compat.js`): la tabla de abajo.

Donde la API admite un tipo, admite también el número de TFS: `getSkillLevel(SKILL_SWORD)`,
`addCondition(Condition(...))`, `hasCondition(CONDITION_POISON)`, `getAttribute(ITEM_ATTRIBUTE_ACTIONID)`,
`Game.doTargetCombat(a, b, { type: COMBAT_FIREDAMAGE, ... })`, `getSlotItem(CONST_SLOT_RIGHT)`.

**Lo que se hace distinto a propósito** (porque los scripts de Jetyum ya lo usaban así):

| TFS | Jetyum |
|---|---|
| `player:getVocation()` → `Vocation` | `getVocation()` da el **nombre**; el objeto es `getVocationInfo()` o `Vocation(...)` |
| `player:getSex()` → 0/1 | `'male'` / `'female'`; `setSex` acepta las dos formas y `getPlayerSex(cid)` da el número |
| `creature:getSkull()` → `SKULL_*` | `''`, `'blanca'` o `'roja'`; `getCreatureSkullType(cid)` da el número |
| `player:getStorageValue(k)` → -1 sin valor | `null` sin valor; `getPlayerStorageValue(cid, k)` da -1 |
| `tile:queryAdd(thing)` → `RETURNVALUE_*` | `true` / `false` |
| `creature:getCondition(type)` → `Condition` | sus datos: `{ type, value, ticks, ms }` |
| `house:getDoors()` → objetos | `[{ id, x, y, z }]` (el id es el de su lista de acceso) |
| `creature:registerEvent(name)` | No hace falta (los eventos son de todos): existe y devuelve `true` |
| `player:getIp()` | El número de TFS (a + b·256 + c·256² + d·256³), de la IP de su sesión (`world.ipDe`); 0 sin sesión o con IPv6 |
| `player:getStamina()` | Se guarda pero no se gasta: 2520 (llena) salvo que un script use `setStamina` |
| `player:getPremiumDays()` | 65535 si la cuenta es premium (el jugador no sabe hasta cuándo), 0 si no |
| `player:getLastLoginSaved()` | 0 (la visita anterior no se carga con el personaje) |
| `player:getInbox()` | El 8.60 no tiene buzón: es el depósito de su ciudad, que es donde llega el correo |
| `getWorldTime()` (0.x) | Minutos del día del juego, como en TFS; `Game.getWorldTime()` sigue dando los segundos de mundo |
| `player:sendTextMessage(type, text)` | Hay una sola consola: el tipo se acepta y no cambia nada |

### Cobertura por clase

Porcentajes aproximados de los métodos de la clase de TFS 1.x que existen en Jetyum.

| Clase | Antes | Ahora | Dónde | Lo que falta |
|---|---|---|---|---|
| `Game` | ~30 % | ~55 % | `game.js` | `getExperienceStage`, `createContainer`, `getReturnMessage`, `startRaid` por objeto, `loadMap` |
| `Position` | ~17 % | ~90 % | `tfs.js` (en `Position.prototype`) | `getPathTo` (está en `Creature` en TFS 1.x+) |
| `Tile` | ~0 % | ~80 % | `tfs.js` | `getItemByTopOrder`, `getItemCountById`, `getThingIndex`, `get*VisibleCreature`, `getBottomVisibleCreature` |
| `Item` | ~17 % | ~80 % | `entities.js` | `getSpecialDescription`, `serializeAttributes`, `setStoreItem`; `getText` es un atributo (`text`), no hay `writer`/`date` automáticos |
| `Container` | ~18 % | ~85 % | `entities.js` | `getContentDescription`; `getCorpseOwner` da 0 (Jetyum no tiene dueño del botín) |
| `ItemType` | ~4 % | ~70 % | `tfs.js` | `getWeaponType` (como número), `getElementType`, `getAbsorbPercent`, `getFluidSource`, `getLevelDoor`, `getRequiredLevel`... |
| `Creature` | ~40 % | ~75 % | `entities.js` | `getDamageMap`, `getPathTo`, `isHealthHidden`, `getEvents`, `canSee`; sin invocaciones (`getMaster` null, `getSummons` vacío) |
| `Player` | ~35 % | ~65 % | `entities.js` | `getContainerById`, `openChannel`, `learnSpell` / `canLearnSpell`, `getClient`, `setGhostMode`, `addMapMark`, `getStoreInbox`; lo de los gremios está en `gremios-api.js` |
| `Monster` | ~30 % | ~35 % | `entities.js` | `getType` (como `MonsterType`), `selectTarget`, `isIdle`, `addFriend`... (`getMonsterType()` da la definición) |
| `Town` | 0 % | 100 % | `tfs.js` | — |
| `House` | ~45 % | ~85 % | `entities.js` | `getDoorIdByPosition`, `startTrade`; `getDoors` da datos, no objetos |
| `Group` | 0 % | 100 % | `tfs.js` | — (`flags`, `maxDepotItems` y `maxVipEntries` se pueden declarar en `groups.js`) |
| `Vocation` | 0 % | ~85 % | `tfs.js` | `getMinSoul`, `getMagicShield`, los multiplicadores de daño por separado (están en `v.formula`) |
| `Party` | ~25 % | ~90 % | `tfs.js` | `canUseSharedExperience`, `updateSharedExperience` (en Jetyum se reparte siempre entre los que están cerca, salvo `setSharedExperience(false)`) |
| `Condition` | 0 % | ~60 % | `tfs.js` | `setOutfit` (no hay condición de aspecto), las condiciones que Jetyum no tiene (invisible, manashield, drunk, muted...) se crean pero no se ponen |
| `Guild` | — | — | `gremios-api.js` (`GuildWrapper`) | ver [Los gremios](#los-gremios) |

**No se cubren**: `NetworkMessage` (los scripts no escriben el protocolo: el motor no expone sus bytes),
`ModalWindow` (el cliente 8.60 no tiene ventanas modales; `popupFYI` y `showTextDialog` son lo que hay)
y `Weapon` (las armas de Jetyum son datos de `items.xml` que usa el combate, no scripts).

### Eventos de TFS

| Evento | Callback | Cuándo |
|---|---|---|
| `event: 'think'` | `onThink(creature, interval)` | Cada segundo, por cada jugador conectado |
| `event: 'healthchange'` | `onHealthChange(creature, attacker, primaryDamage, primaryType, secondaryDamage, secondaryType, origin)` | Antes de quitar vida (todo el daño pasa por `combat.applyDamage`). El daño llega en positivo y el script puede devolver otro: un número, `[daño, tipo, ...]` o `{ primaryDamage }`. `origin` es `ORIGIN_MELEE` en un golpe cuerpo a cuerpo y `ORIGIN_NONE` en lo demás |
| `event: 'manachange'` | `onManaChange(...)` | Lo mismo, con el maná que se drena (`manadrain`) |
| `event: 'preparedeath'` | `onPrepareDeath(creature, killer)` | Antes de morir. Con `false` no muere: durante el aviso tiene 1 de vida (así `creature.addHealth(...)` le cura, como en las arenas de TFS) y se queda con lo que el script le deje |
| `event: 'textedit'` | `onTextEdit(player, item, text)` | Al guardar lo escrito en un objeto (`showTextDialog(item, ...)` o `item` en las opciones). Con `false` no se guarda |
| `globalevent`, `event: 'save'` | `onSave()` | En cada guardado periódico |
| `globalevent`, `event: 'record'` | `onRecord(current, old)` | Más jugadores a la vez que nunca |

Los enganches están en `engine/world/combat.js` (`world.alCambiarVida`, `world.alCambiarMana`,
`world.antesDeMorir`), `engine/scripting/globals.js` (`onThink`, `onRecord`) y `engine/core/engine.js`
(`onSave`); los pone `engine/scripting/game.js` (`engancharEventosTfs`).

### Storage global

`Game.getStorageValue(clave)` / `Game.setStorageValue(clave, valor)` (y `getGlobalStorageValue` /
`setGlobalStorageValue`) son del servidor, no de un jugador. Con base de datos se escriben al momento
en la tabla `meta` (clave `global_storage`) y duran entre reinicios; sin base viven lo que viva el
proceso. El récord de jugadores va en la misma tabla (`players_record`).

### Funciones de 0.x

Cada una es una llamada a la API de objetos. Una criatura es su `cid` y un objeto su `uid` (vale
también el envoltorio); lo que no existe devuelve `false`; las «cosas» son `{ uid, itemid, type,
actionid }`.

| Función de 0.x | Equivale a |
|---|---|
| `doPlayerSendTextMessage(cid, type, text)` | `player.sendTextMessage(type, text)` |
| `doPlayerSendCancel(cid, text)` | `player.sendCancelMessage(text)` |
| `doCreatureSay(cid, text)` | `creature.say(text)` |
| `doSendMagicEffect(pos, effect)` | `Game.sendMagicEffect(pos, effect)` / `pos.sendMagicEffect(effect)` |
| `doSendDistanceShoot(from, to, type)` | `Game.sendDistanceEffect(from, to, type)` |
| `doSendAnimatedText(pos, text, color)` | `Game.sendAnimatedText(pos, text)` (el número que sube; el color no se usa) |
| `broadcastMessage(text)`, `doBroadcastMessage(text)` | `Game.broadcastMessage(text)` |
| `sendChannelMessage(channelId, type, text)`, `sendGuildChannelMessage(guildId, type, text)` | `Game.sendChannelMessage(...)`, `Game.sendGuildChannelMessage(...)` |
| `doTeleportThing(cid \| uid, pos)` | `creature.teleportTo(pos)` / `item.moveTo(pos)` |
| `doCreateItem(id, count, pos)` → uid | `Game.createItem(id, count, x, y, z)` |
| `doCreateItemEx(id, count)` → uid | `Game.createItem(id, count)` (suelto, para `addItemEx`) |
| `doRemoveItem(uid[, count])` | `item.remove(count)` |
| `doTransformItem(uid, id[, count])` | `item.transform(id)` (+ `setCount`) |
| `doItemSetAttribute(uid, key, value)`, `getItemAttribute(uid, key)`, `doItemSetActionId(uid, aid)` | `item.setAttribute`, `item.getAttribute`, `item.setActionId` |
| `getThing(uid)`, `getThingPos(uid)`, `getThingPosition(uid)` | `{ uid, itemid, type, actionid }` / `getPosition()` |
| `getItemName(id)`, `getItemNameById(id)`, `getItemWeight(id, n)`, `getItemIdByName(nombre)` | `ItemType(id).getName()`, `.getWeight(n)`, `ItemType(nombre).getId()` |
| `getTileItemById(pos, id)`, `getTopCreature(pos)`, `getTileHouseInfo(pos)` | `Tile(pos).getItemById(id)`, `.getTopCreature()`, `.getHouse()` (el id, o false) |
| `doPlayerAddItem(cid, id, count[, canDropOnMap])` | `player.addItem(id, count)`; si no cabe, a sus pies (salvo `canDropOnMap` false) |
| `doPlayerRemoveItem(cid, id, count)` | `player.removeItem(id, count)` |
| `getPlayerItemCount(cid, id)` | `player.getItemCount(id)` |
| `doPlayerAddMoney`, `doPlayerRemoveMoney`, `getPlayerMoney` | `addMoney`, `removeMoney`, `getMoney` |
| `getPlayerSlotItem(cid, slot)`, `getPlayerItemById(cid, deep, id)`, `getPlayerWeapon(cid)`, `getPlayerFreeCap(cid)` | `getSlotItem(slot)`, `getItemById(id, deep)`, `getSlotItem(CONST_SLOT_RIGHT)`, `getFreeCapacity()` |
| `getPlayerStorageValue(cid, k)` (-1 sin valor), `setPlayerStorageValue(cid, k, v)` | `getStorageValue`, `setStorageValue` |
| `getGlobalStorageValue(k)` (-1 sin valor), `setGlobalStorageValue(k, v)` | `Game.getStorageValue`, `Game.setStorageValue` |
| `getPlayerLevel`, `getPlayerExperience`, `getPlayerMagLevel`, `getPlayerSkillLevel(cid, skill)` | `getLevel`, `getExperience`, `getMagicLevel`, `getSkillLevel` |
| `getPlayerVocation(cid)` (el número), `doPlayerSetVocation(cid, voc)` | `getVocationInfo().getId()`, `setVocation` |
| `getPlayerName`, `getCreatureName`, `getPlayerGUID`, `getPlayerAccountId`, `getPlayerIp` | `getName`, `getGuid`, `getAccountId`, `getIp` |
| `getPlayerSex` (0/1), `doPlayerSetSex`, `getPlayerPremiumDays`, `isPremium` | `getSex`, `setSex`, `getPremiumDays`, `isPremium` |
| `getPlayerSoul`, `doPlayerAddSoul`, `getPlayerMana`, `getPlayerMaxMana` | `getSoul`, `addSoul`, `getMana`, `getMaxMana` |
| `getPlayerTown`, `doPlayerSetTown(cid, townId)` | `getTown().getId()`, `setTown` |
| `getPlayerGroupId`, `doPlayerSetGroupId`, `getPlayerAccess` (grupo − 1), `getPlayerFlagValue(cid, flag)` | `getGroup().getId()`, `setGroup`, `getGroup().hasFlag(flag)` |
| `getPlayerBlessing(cid, n)`, `doPlayerAddBlessing(cid, n)` | `hasBlessing`, `addBlessing` |
| `doPlayerAddExp`, `doPlayerAddExperience`, `doPlayerAddSkillTry`, `doPlayerAddManaSpent` | `addExperience`, `addSkillTries`, `addManaSpent` |
| `getPlayerPosition`, `getCreaturePosition`, `getPlayerLookDir`, `getCreatureLookDirection`, `doSetCreatureDirection` | `getPosition`, `getDirection`, `setDirection` |
| `getPlayerParty(cid)` | `getParty().getLeader().getId()` |
| `getPlayerByName(nombre)`, `getPlayerByNameWildcard(nombre~)` → cid | `Game.getPlayerByName(nombre)` |
| `getPlayersOnline()` (cids), `getOnlinePlayers()` (nombres) | `Game.getPlayers()` |
| `isPlayer`, `isMonster`, `isNpc`, `isCreature`, `isItem`, `isContainer` | `isPlayer()`, `isMonster()`, `isNpc()`... |
| `getCreatureHealth`, `getCreatureMaxHealth`, `getCreatureMana`, `getCreatureMaxMana`, `doCreatureAddHealth`, `doCreatureAddMana` | `getHealth`, `getMaxHealth`, `getMana`, `getMaxMana`, `addHealth`, `addMana` |
| `getCreatureSpeed`, `getCreatureBaseSpeed`, `doChangeSpeed`, `doCreatureSetNoMove` | `getSpeed`, `getBaseSpeed`, `changeSpeed`, `setNoMove` |
| `getCreatureOutfit`, `doSetCreatureOutfit(cid, outfit)` | `getOutfit`, `setOutfit` (el tiempo no se usa) |
| `getCreatureSkullType` (`SKULL_*`), `getCreatureTarget`, `getCreatureMaster`, `getCreatureSummons` | `getSkull`, `getTarget`, la propia criatura, `[]` |
| `getCreatureCondition(cid, type)`, `doAddCondition(cid, condition)`, `doRemoveCondition(cid, type)` | `hasCondition`, `addCondition`, `removeCondition` |
| `createConditionObject(type[, ticks])`, `setConditionParam`, `addDamageCondition`, `setConditionFormula` | `Condition(type)`, `setParameter`, `addDamage`, `setFormula` |
| `doSummonCreature(nombre, pos)`, `doCreateMonster(nombre, pos)` → cid | `Game.createMonster(nombre, x, y, z)` |
| `doCreateNpc(nombre, pos)` → cid | `Game.createNpc(nombre, x, y, z)` (los de `data/npc`) |
| `doRemoveCreature(cid)` | `monster.remove()` / `player.remove()` |
| `getWorldCreatures(type)` (0 jugadores, 1 monstruos, 2 NPC, 3 todos) | `Game.getPlayerCount()`, `Game.getMonsterCount()`, `Game.getNpcCount()` |
| `getTownTemplePosition(id)`, `getTownName(id)`, `getTownId(nombre)` | `Town(id).getTemplePosition()`, `.getName()`, `.getId()` |
| `getHouseOwner(id)` (guid), `getHouseName`, `getHouseRent`, `getHouseTown`, `setHouseOwner(id, guid)`, `getHouseByPlayerGUID(guid)` | `House(id).getOwnerGuid()`, `.getName()`, `.getRent()`, `.getTownId()`, `.setOwnerGuid()`, `player.getHouse()` |
| `getWorldTime()` (minutos del día), `getWorldLight()`, `getWorldType()`, `getWorldUpTime()` | `Game.getWorldHour()`, `Game.getWorldLight()`, `Game.getWorldType()`, `Game.getWorldTime()` |
| `getConfigValue(clave)`, `getConfigInfo(clave)`, `configManager.getNumber/getString/getBoolean(configKeys.X)` | `config.js` (las `configKeys` de TFS se traducen: `RATE_EXPERIENCE` → `rateExperience`...) |
| `getDistanceBetween(a, b)`, `isSightClear(a, b)`, `isInRange(pos, from, to)` | `Position.getDistanceBetween`, `pos.isSightClear`, `pos.isInRange` |
| `isInArray(array, value)` | `array.includes` (los textos sin mayúsculas, como en TFS) |
| `addEvent(fn, ms, ...)`, `stopEvent(id)` | `Game.addEvent`, `Game.stopEvent` |

### Un script de TFS, portado

```js
// data/scripts/talkactions/premio.js: un !premio de 0.x, casi línea por línea.
module.exports = {
    type: 'talkaction',
    words: '!premio',
    onSay(player, words, param) {
        const cid = player.getId();
        if (!Tile(getCreaturePosition(cid)).hasFlag(TILESTATE_PROTECTIONZONE)) {
            doPlayerSendCancel(cid, 'Sólo en el templo.');
            return true;
        }
        if (getPlayerStorageValue(cid, 50001) !== -1) {
            doPlayerSendCancel(cid, 'Ya tienes tu premio.');
            return true;
        }
        doPlayerAddItem(cid, ItemType('crystal coin').getId(), 2);
        setPlayerStorageValue(cid, 50001, 1);
        doPlayerSendTextMessage(cid, MESSAGE_INFO_DESCR, 'Has recibido tu premio.');
        doSendMagicEffect(getCreaturePosition(cid), CONST_ME_GIFT_WRAPS);
        return true;
    }
};
```

Lo que cambia al portar: la sintaxis (`player:getName()` → `player.getName()`, `local` → `const`,
`~=` → `!==`, `..` → `+`), el registro (`type` y `words` en el objeto, en vez de
`talk:register()`) y lo de la tabla «Lo que se hace distinto». Las pruebas de todo esto están en
`tools/test-api-tfs.mjs`.

---

## Lo que un script puede usar

**`Game`** (global):

| Función | Para qué |
|---|---|
| `addEvent(fn, ms, ...args)`, `stopEvent(id)` | Hacer algo más tarde (el `addEvent` de TFS) y cancelarlo |
| `now()`, `getWorldHour()`, `getWorldLight()` | El reloj del mundo (ms), la hora del día («HH:MM») y la luz (0-255) |
| `getPlayers()`, `getPlayerByName(nombre)`, `getPlayerCount()` | Los jugadores conectados |
| `getSpectators(pos, rangoX, rangoY, soloJugadores)` | Las criaturas alrededor de una casilla |
| `createMonster(nombre, x, y, z)`, `createNpc(nombre, x, y, z)` | Hacer aparecer un monstruo o un NPC |
| `createItem(id, cantidad, x, y, z)` | Crear un objeto (en el suelo, con posición) |
| `sendMagicEffect(pos, efecto)`, `sendDistanceEffect(desde, hasta, proyectil)` | Efectos |
| `doTargetCombat(atacante, objetivo, { type, min, max, effect, proyectil })` | Golpear (o curar, `type: 'healing'`) a una criatura |
| `doAreaCombat(atacante, centro, area, { type, min, max, effect })` | Golpear un área |
| `area.circulo(r)`, `area.cuadrado(r)`, `area.onda(dir, largo)`, `area.rayo(dir, largo)`, `area.desdeMatriz([...])` | Áreas |
| `addCondition(criatura, condicion)` | Una condición |
| `broadcastMessage(texto)` | Mensaje a todos los jugadores |
| `sendChannelMessage(canal, tipo, texto)`, `sendGuildChannelMessage(gremio, tipo, texto)` | Una línea del servidor en un canal del chat (ver «Los canales del chat») |
| `startRaid(nombre)`, `getRaids()` | Lanzar y listar raids |
| `getWaypoint(nombre)`, `getWaypointNames()` | Los lugares con nombre del mapa |
| `isWalkable(x, y, z)`, `getCreatureCount(x, y, z)`, `getTileStack(x, y, z)`, `getTileItemIds(x, y, z)` | Preguntar por una casilla |
| `getItemName(id)`, `getItemAttribute(id, clave)`, `itemTypeExists(id)` | Las fichas de `items.xml` |
| `log(...)`, `reload()` | Registro y recarga |

Los tipos de daño (`type`): `physical`, `fire`, `energy`, `earth`, `ice`, `holy`, `death` y
`healing`. La magia ignora la armadura; las resistencias de cada monstruo cuentan.

**Toda criatura** (jugador o monstruo): `getId`, `getName`, `getPosition`, `getHealth`,
`getMaxHealth`, `addHealth(n)`, `getSpeed`, `getDirection`, `isPlayer`, `isMonster`, `isNpc`,
`isDead`, `say(texto)`, `teleportTo(pos)`, `move('norte')`, `getTarget()`, `setTarget(otra)`,
`sendMagicEffect(efecto)`, `addCondition`, `removeCondition`, `hasCondition`, `getCondition` y
`getLight()`.

**El jugador** (`player`), además:

| Función | Para qué |
|---|---|
| `addItem(id, cantidad)` → `{ ok, reason }` | Darle un objeto (comprueba mochila, huecos y peso; `reason`: `noContainer`, `backpackFull`, `tooHeavy`, `unknownItem`). Lo apilable va en **pilas de 100 como mucho**: `addItem(3031, 250)` deja pilas de 100, 100 y 50, y cada pila nueva ocupa un hueco |
| `removeItem(id, cantidad)` → `true/false` | Quitárselo, sólo si los tiene todos |
| `getMoney()`, `addMoney(n)`, `removeMoney(n)` | El dinero: la suma de todas las monedas (oro 1, platino 100, cristal 10 000; `world.coinTypes`). `addMoney` da las monedas más grandes y `removeMoney` cobra con las que haga falta y devuelve el cambio. Las monedas se cambian con clic derecho (`data/scripts/actions/monedas.js`) |
| `getBankBalance()`, `setBankBalance(n)` | El saldo del banco, en monedas de oro (`player:getBankBalance` de TFS). `setBankBalance` lo pone sin mover monedas y se escribe en la base al momento |
| `depositMoney(n)`, `withdrawMoney(n)`, `transferMoney(nombre, n)` → `{ ok, reason, balance }` | Mover dinero entre la mochila y el banco, o a otro personaje (conectado o no). `reason`: `badAmount`, `notEnough`, `cannotPay` (el cambio no cabe), `cannotCarry`, `notFound`, `self`, `noDatabase` |
| `getHouse()`, `getTileHouse()` | La casa de la que es dueño, y la casa en la que está (o `null`): ver [Las casas y el banco](#las-casas-y-el-banco) |
| `getGuild()`, `getGuildLevel()`, `getGuildNick()` | Su gremio (o `null`), su rango (3 líder, 2 vicelíder, 1 miembro, 0 sin gremio) y su apodo: ver [Los gremios](#los-gremios) |
| `banPlayer(...)`, `kickPlayer(nombre)`, `mutePlayer(nombre, min)`... | Los castigos de un GM, con este jugador como quien castiga: ver [Moderación](#moderación-suspensiones-namelock-echar-y-silenciar) |
| `buyHouse()`, `leaveHouse()`, `editHouseList(tipo)`, `kickFromHouse(nombre)`, `sleepInBed(item)` → `{ ok, reason }` | Lo de los comandos de las casas y las camas. `reason`: `noDoor`, `level`, `alreadyOwner`, `hasOwner`, `noMoney`, `notInside`, `notOwner`, `cannotEdit`, `notFound`, `cannot`, `notInvited`, `inFight`, `occupied` |
| `getExperience()`, `addExperience(n)` | La experiencia (sube de nivel si llega) |
| `getItemCountById(id)`, `getInventory()`, `getEquipment()`, `equipItem`, `unequipItem`, `dropItem` | Lo que lleva |
| `getWeight()`, `getCapacity()`, `getFreeCapacity()`, `getItemWeight(id, n)` | El peso |
| `getStorageValue(clave)`, `setStorageValue(clave, n)` | La memoria del contenido (se guarda con el personaje) |
| `hasBlessing(n)`, `addBlessing(n)`, `removeBlessing(n)`, `getBlessingCount()`, `getBlessings()`, `getBlessingCost()`, `getDeathPenalty()`, `getDeathList(n, nombre)` | Las cinco bendiciones de TFS (1 a 5, storages `bendicion:<n>`; se gastan al morir), su precio por nivel, lo que se perdería al morir y el historial de muertes (`engine/world/muerte.js`) |
| `sendTextMessage(texto)`, `sendCancelMessage(texto)`, `sendPrivateMessage(nombre, texto)` | Mensajes. También con la firma de TFS: `sendTextMessage(MESSAGE_INFO_DESCR, texto)` (el tipo no cambia nada: hay una sola consola) y `sendCancelMessage(RETURNVALUE_NOTENOUGHROOM)` |
| `getOutfit()`, `setOutfit(...)`, `addOutfit(id)`, `hasOutfit(id)` | Aspectos (`addOutfit` desbloquea uno) |
| `addMount(id)`, `removeMount(id)`, `hasMount(id)`, `isMounted()` | Monturas de `data/XML/mounts.js` (`addMount` da una bloqueada) |
| `getGroup()`, `hasGroup(nombre)` | Su grupo de acceso (un `Group` de TFS que lleva también `id`, `name` y `access`) y si tiene ese o uno mayor |
| `isInFight()`, `isPzLocked()` | En combate (no puede salir) y con PZ lock (no puede entrar en una zona de protección) |
| `isTrading()`, `getTradePartner()` | Si está en un intercambio con otro jugador (ofreció algo o se lo ofrecieron) y con quién (su jugador, o `null`) |
| `getParty()`, `partyInvite(nombre)`, `partyJoin(nombre)`, `partyLeave()` | El grupo: `getParty()` es un `Party` de TFS (ver «Compatibilidad con TFS») que lleva también `leader` y `members` (nombres, el líder incluido) |
| `getSkull()` | `''`, `'blanca'` o `'roja'` |
| `getWeaponType()` | El tipo del arma de la mano (`weaponType` de items.xml: `'sword'`, `'axe'`, `'club'`, `'distance'`...) o `'fist'` |
| `popupFYI(texto)`, `sendPopup(titulo, texto)` | Le abre un **diálogo** con el texto y un botón «Aceptar» (el `popupFYI` de TFS); los `\n` son saltos de línea |
| `showTextDialog({ titulo, texto, editable, maximo }, alGuardar)` | Le abre una **ventana de texto**: para leer, o para escribir con `editable: true` (como el `showTextDialog` + `onTextEdit` de TFS). Lo que guarde llega a `alGuardar(texto)`, recortado a `maximo` (1000 si no se dice); sólo puede contestarla ese jugador y una sola vez. Devuelve el id de la ventana. También con la firma de TFS, `showTextDialog(item, texto, canWrite, length)`: lo escrito va al atributo `text` del objeto. Con un objeto (esa firma, o `item` en las opciones) avisa a `onTextEdit` |
| `sendMail(item)` → `true/false` | Manda por correo una carta o un paquete (el `item` que recibe `onUse`), como si lo echara en un buzón. Las reglas y los mensajes, en [El depósito y el correo](#el-depósito-y-el-correo) |
| `collectMail()` → n | Le entrega el correo que le esperaba (lo hace `events/correo.js` al entrar) |
| `getSpells()` | Los hechizos de su vocación, por nivel: `[{ words, name, group, level, mana, soul }]` (lo usa `/spells`) |

Y lo de la vocación (ver [VOCACIONES.md](VOCACIONES.md)):

| Función | Para qué |
|---|---|
| `getVocation()`, `getVocationInfo()`, `setVocation(nombre)` | La vocación, su ficha de `vocations.js`, promocionar |
| `getSex()`, `getLevel()` | Sexo y nivel |
| `getMana()`, `getMaxMana()`, `addMana(n)` | El maná (n negativo lo gasta) |
| `getSoul()`, `getMagicLevel()`, `getSkillLevel('sword')` | Almas, nivel mágico y skills |
| `addSkillTries(skill, n)`, `addManaSpent(n)` | Entrenar (sube y avisa con `onAdvance`) |
| `addSpeedBonus(n, ms)` | Más velocidad un rato |

**El objeto** (`item`): `getId`, `getUniqueId`, `getName`, `getCount`, `getAttribute(clave)`,
`setAttribute(clave, valor)`, `removeAttribute`, `getPosition`, `transform(nuevoId)`,
`remove(cantidad)`, `setCount(n)`, `moveTo(pos)`, `decay()`, `getWeight`, `isContainer`, y si es un
contenedor del suelo `getItems()` y `addItem(id, n)`. Uno que lleva el jugador (al usarlo desde la
mochila) tiene además `getSlot()` y `isInInventory()`.

Y todo lo de las clases de TFS (`getActionId`, `getParent`, `clone`, `split`, `getType`, los métodos
de `Container`, `Tile`, `ItemType`...): ver [Compatibilidad con TFS](#compatibilidad-con-tfs).

El cliente se entera solo de los cambios: el motor le manda las estadísticas, el inventario y
los efectos cuando cambian.

Las pruebas de todo esto están en `tools/test-scripts.mjs` (la API, los eventos, los hechizos, las
condiciones, el comercio, los grupos, las calaveras, la munición, el depósito y la luz),
`tools/test-otsp.mjs` (puertas, eventos globales y raids), `tools/test-api-tfs.mjs` (la compatibilidad con TFS), `tools/test-correo.mjs` (el depósito por
ciudad y el correo) y `tools/test-engine.js` (acciones, movimientos, comandos y eventos).
