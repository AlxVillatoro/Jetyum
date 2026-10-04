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
| `event` | `creaturescripts` | `data/scripts/events/` | `onKill`, `onDeath`, `onAdvance`, `onLogin`, `onLogout`, `onAttack` |
| `spell` | `spells` | `data/scripts/spells/` | `onCastSpell(player, target, param)` |
| `quest` | `quests.xml` | `data/scripts/quests/` | (definición: misiones por storages) |
| `globalevent` | `globalevents` | `data/scripts/globalevents/` | `onStartup`, `onShutdown`, `onThink(interval)`, `onTime(hora)` |
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

Los que vienen hechos: `/pos`, `/i`, `/item <id>`, `/outfit`, `/equipar`, `/quitar`, `/stats`,
`/ayuda`, `/ir <lugar>` (viajar a un waypoint del mapa) y `/raid [nombre]`.

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
caballeros); `utani hur` (correr), `utevo lux` (luz) y `exana pox` (quitar el veneno).

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
| `getExperience()`, `addExperience(n)` | La experiencia (sube de nivel si llega) |
| `getItemCountById(id)`, `getInventory()`, `getEquipment()`, `equipItem`, `unequipItem`, `dropItem` | Lo que lleva |
| `getWeight()`, `getCapacity()`, `getFreeCapacity()`, `getItemWeight(id, n)` | El peso |
| `getStorageValue(clave)`, `setStorageValue(clave, n)` | La memoria del contenido (se guarda con el personaje) |
| `sendTextMessage(texto)`, `sendCancelMessage(texto)`, `sendPrivateMessage(nombre, texto)` | Mensajes |
| `getOutfit()`, `setOutfit(...)`, `addOutfit(id)`, `hasOutfit(id)` | Aspectos (`addOutfit` desbloquea uno) |
| `getParty()`, `partyInvite(nombre)`, `partyJoin(nombre)`, `partyLeave()` | El grupo |
| `getSkull()` | `''`, `'blanca'` o `'roja'` |
| `getWeaponType()` | El tipo del arma de la mano (`weaponType` de items.xml: `'sword'`, `'axe'`, `'club'`, `'distance'`...) o `'fist'` |
| `popupFYI(texto)`, `sendPopup(titulo, texto)` | Le abre un **diálogo** con el texto y un botón «Aceptar» (el `popupFYI` de TFS); los `\n` son saltos de línea |
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

El cliente se entera solo de los cambios: el motor le manda las estadísticas, el inventario y
los efectos cuando cambian.

Las pruebas de todo esto están en `tools/test-scripts.mjs` (la API, los eventos, los hechizos, las
condiciones, el comercio, los grupos, las calaveras, la munición, el depósito y la luz),
`tools/test-otsp.mjs` (puertas, eventos globales y raids) y `tools/test-engine.js` (acciones,
movimientos, comandos y eventos).
