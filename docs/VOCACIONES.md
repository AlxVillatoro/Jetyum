# Vocaciones y aspectos

En The Forgotten Server, lo que hace distinto a un caballero de un hechicero está en
`data/XML/vocations.xml`, y la ropa que puede llevar cada personaje en `data/XML/outfits.xml`.
Aquí son los mismos archivos, pero en **JavaScript**:

| Archivo | Qué define | Lo carga |
|---|---|---|
| `data/XML/vocations.js` | Las vocaciones: vida, maná, capacidad, regeneración, velocidad, almas, skills, daño | `engine/data/definiciones.js` |
| `data/XML/outfits.js` | Los aspectos: quién puede llevarlos (sexo, premium) y sus añadidos | `engine/data/definiciones.js` |

Las rutas están en `config.js` (`vocationsXml` y `outfitsXml`). Un `.xml` del formato antiguo
también vale: se lee y se traduce.

> [!IMPORTANT]
> **Se recargan solos**: al guardar `vocations.js` o `outfits.js` con el servidor encendido, el
> motor los vuelve a leer en un segundo y lo aplica a quien esté conectado (lo dice en la consola
> del servidor: «definiciones recargadas»). Si el archivo tiene un error, se queda con lo último que
> funcionaba y lo dice.
>
> Ojo con dos cosas al probar un cambio:
> - **Tu personaje tiene que ser de esa vocación.** Los creados antes de que hubiera vocaciones
>   son «None». Con `/vocacion` ves la tuya y sus números, y con `/vocacion Knight` te cambias.
> - **`gainHp`, `gainMana` y `gainCap` se notan a partir del nivel 2**: a nivel 1 todos tienen
>   150 de vida (la fórmula es 150 + gainHp × (nivel − 1)).

---

## 1. Las vocaciones

Hay nueve: **None** (0), **Sorcerer** (1), **Druid** (2), **Paladin** (3), **Knight** (4) y sus
promociones, **Master Sorcerer** (5), **Elder Druid** (6), **Royal Paladin** (7) y **Elite Knight**
(8). Una vocación que no dice alguna propiedad la toma de «None».

| Propiedad | Qué hace en el juego | Fórmula |
|---|---|---|
| `gainHp` | Vida máxima por nivel | 150 + gainHp × (nivel − 1) |
| `gainMana` | Maná máximo por nivel | 55 + gainMana × (nivel − 1) |
| `gainCap` | Capacidad por nivel | 400 + gainCap × nivel (onzas) |
| `baseSpeed` | Velocidad a nivel 1 | baseSpeed + 2 × (nivel − 1) |
| `gainHpTicks`, `gainHpAmount` | Regenera `gainHpAmount` de vida cada `gainHpTicks` segundos | |
| `gainManaTicks`, `gainManaAmount` | Lo mismo con el maná | |
| `soulMax`, `gainSoulTicks` | Almas máximas, y recupera una cada `gainSoulTicks` segundos | |
| `attackSpeed` | Milisegundos entre dos golpes | |
| `manaMultiplier` | Lo que cuesta cada nivel mágico | 1600 × manaMultiplier^nivel mágico de maná gastado |
| `skills.*` | Lo que cuesta cada skill (puño, maza, espada, hacha, distancia, escudo, pesca) | base × multiplicador^(nivel − 10) tries; base 50, 30 la distancia, 100 el escudo, 20 la pesca |
| `formula.meleeDamage`, `distDamage`, `wandDamage` | Multiplican el daño cuerpo a cuerpo, a distancia y con varita | |
| `formula.magHealingDamage` | Multiplica las curaciones (`exura`) | |
| `formula.armor` | Multiplica la armadura | |
| `needPremium` | Sólo una cuenta premium la puede elegir al crear | |
| `fromVoc` | De qué vocación es promoción. Una promoción no se elige al crear | |
| `clientId`, `description` | Identificador para el cliente y la descripción («a knight») | |

`formula.magDamage`, `formula.defense` y `formula.magDefense` se cargan y se guardan, pero todavía
no hay hechizos de ataque ni defensa con escudo que los usen.

### Cómo se entrenan las skills

- **Espada, hacha, maza, distancia o puño**: un *try* por cada golpe. La skill la decide el
  `weaponType` del arma que llevas en la mano (`items.xml`); sin arma, puño.
- **Escudo**: un *try* cada vez que te golpean llevando escudo.
- **Nivel mágico**: el maná que gastas en hechizos.

Al subir, el motor te lo dice y lanza `onAdvance(player, skill, antes, ahora)`, como TFS.

### El daño de un golpe

El de TFS: `nivel / 5 + 0,085 × ataque del arma × skill`, por el multiplicador de la vocación.
Sin arma, el ataque es 7.

### Elegir vocación y sexo

En la pantalla de entrada, en la pestaña «Crear cuenta»: es el único momento en que se eligen. La lista sale de `vocations.js`: las que no son
promoción. El motor vuelve a comprobarlo (que exista, que no sea promoción y `needPremium`).

### Hechizos

Los de `data/scripts/spells/` (`type: 'spell'`, ver [SCRIPTS.md](SCRIPTS.md)). Se lanzan
escribiéndolos en el chat; el motor comprueba la vocación, el nivel, el maná y el enfriamiento.

| Palabras | Hechizo | Nivel | Maná | Vocaciones |
|---|---|:-:|:-:|---|
| `exura` | Curación ligera | 1 | 20 | todas |
| `exura gran` | Curación intensa | 8 | 70 | hechiceros, druidas y paladines |
| `exura vita` | Curación máxima | 30 | 160 | hechiceros y druidas |
| `exori flam`, `exori vis` | Golpe de fuego / energía al objetivo | 12 | 20 | hechiceros y druidas |
| `exori frigo`, `exori tera` | Golpe de hielo / tierra al objetivo | 12 | 20 | druidas |
| `exevo flam hur` | Onda de fuego | 18 | 25 | hechiceros |
| `exori` | Tajo alrededor | 8 | 30 | caballeros |
| `utani hur` | Correr más durante 33 s | 14 | 60 | todas |
| `utevo lux` | Luz durante 5 min | 8 | 20 | todas |
| `exana pox` | Quitar el veneno | 10 | 30 | todas |

---|---|:-:|:-:|---|
| `exura` | Curación ligera | 1 | 20 | todas |
| `exura gran` | Curación intensa | 8 | 70 | hechiceros, druidas y paladines |
| `utani hur` | Correr más durante 33 s | 14 | 60 | todas |

---

## 2. Los aspectos

| Propiedad | Qué hace |
|---|---|
| `id` | El *lookType*: el número que el motor manda y con el que el cliente busca los sprites |
| `name` | El nombre en la ventana del personaje |
| `sex` | `'male'`, `'female'` o `'any'`: quién puede llevarlo |
| `player` | `false` en los de criatura (ratas, dragones): ningún jugador puede elegirlos |
| `premium` | Sólo cuentas premium |
| `unlocked` | `false` = bloqueado hasta desbloquearlo |
| `enabled` | `false` lo quita del juego sin borrarlo |
| `addons` | Los nombres de sus dos añadidos como mucho: el primero es el bit 1, el segundo el bit 2 |

La ventana del personaje (clic derecho sobre ti) sólo enseña los que puedes llevar, y el motor
rechaza los demás aunque se pidan. Un personaje nuevo empieza con el aspecto 136 si es de su sexo y,
si no, con el primero que lo sea.

---

## 3. Dónde se guarda

En la base de datos, en la tabla `players`: `vocation`, `sex`, y `progress` (JSON con el maná, las
almas, la stamina, el nivel mágico y las skills con sus *tries*). La vida y el maná máximos y la
velocidad no se guardan como verdad: se recalculan con el nivel y `vocations.js` al entrar.

Las pruebas están en `tools/test-vocaciones.mjs` (`npm run test:vocaciones`).
