# Jetyum

<p align="center">
  <a href="README.md"><img alt="Español" src="https://img.shields.io/badge/Espa%C3%B1ol-3a3a46?style=for-the-badge"></a>
  <a href="README.en.md"><img alt="English" src="https://img.shields.io/badge/English-012169?style=for-the-badge"></a>
</p>

**A multiplayer 2D MMORPG in the browser, Tibia-style with a 2.5D perspective.** It is built
like a Tibia server:

- an authoritative **engine** in Node.js (the project's "TFS");
- a **datapack** extensible with JavaScript modules and XML;
- a **web client** that draws 32×32 sprites and HD art at 64 px per tile;
- a set of **tools** for maps, composite objects, sprites and items (the project's "RME" and
  "ObjectBuilder").

| Piece | Reference it follows |
|---|---|
| Server mechanics | [forgottenserver-downgrade-1.8-8.60](https://github.com/Mateuzkl/forgottenserver-downgrade-1.8-8.60) |
| Map editor | [RME-CLIENTID](https://github.com/Mateuzkl/RME-CLIENTID) and [NexaMap-Editor](https://github.com/Mateuzkl/NexaMap-Editor) |
| Sprite editor | [ObjectBuilder](https://github.com/ottools/ObjectBuilder) |
| Client | [OTC-Fonticak](https://github.com/AlxVillatoro/OTC-Fonticak) (OTClient, protocol 8.60) |

> 🧭 **First time here?** Start with the **[visual guides](docs/guias/README.md)** (in Spanish): the
> whole journey of an item, from drawing to game, step by step and with screenshots.

> 📝 The code, its comments and the detailed documentation in `docs/` are written in Spanish. The
> game and the tools can be played and used in English (see [Languages](#languages)).

## Contents

1. [Getting started](#1-getting-started)
2. [The game](#2-the-game)
3. [The tools](#3-the-tools)
4. [Sprites and HD art](#4-sprites-and-hd-art)
5. [Maps and composite objects](#5-maps-and-composite-objects)
6. [Project structure](#6-project-structure)
7. [Documentation](#7-documentation)
8. [Tests](#8-tests)
9. [Roadmap](#9-roadmap)
10. [License and credits](#10-license-and-credits)

---

## 1. Getting started

Requires **Node.js 24.22.1+ or 26.12.1+** (the LTS lines with the October 2026 security patches).

```bash
npm install

npm start         # THE GAME: engine (ws://localhost:8081) and web client (http://localhost:8000)
npm run editor    # THE TOOLS (http://localhost:8090)
npm test          # every test
```

### Languages

**Spanish and English.** The game and the tools work in both: the client has the selector on the
login screen and under *Options*, and the editor at the top right. The choice is remembered;
**English by default**, which can be changed for the whole server with `defaultLanguage` in
`config.js` (`'en'` or `'es'`). Each player sees the game in their own language —engine
messages and what NPCs say are translated in their client— and NPCs understand keywords in both
(`hola`/`hi`, `comprar espada`/`buy sword`...).

Spanish is the source text and the translation lives in `shared/i18n/en/`: one Spanish sentence per
key, with placeholders in braces for what the code composes (`'Has recogido {n} {objeto}.'`). A
sentence without an entry stays in Spanish. How it works: `shared/js/i18n.mjs`; the tests:
`npm run test:i18n`.

| To… | Open |
|---|---|
| play (with `npm start` running) | **http://localhost:8000/jetyum/** |
| edit maps, composites, sprites and items | **http://localhost:8090/** |

Other commands:

| Command | What it does |
|---|---|
| `npm run serve:aldea` | Starts the game in the village made with the HD art |
| `npm run serve -- --map sample` | Starts the game with another map from `data/world` without touching `config.js` |
| `npm run engine` | Starts only the engine and summarizes the loaded datapack |
| `npm run engine:reload` | Checks hot reloading of content |
| `npm run mundo:otsp` | Regenerates the brushes, the composites and the `jetyum` map |
| `npm run mapa:continente` | Regenerates the big `continente` map |
| `npm run monstruos:importar` | Imports TFS monsters (`../forserver-downgrade`) into `data/monsters/importados` |
| `npm run mundo:aldea` | Regenerates the HD village map |
| `npm run arte:plantillas` | Generates the provisional HD art sheets from the 32 px art |
| `npm run arte:importar` | Brings the HD art from `data/arte-hd/` into the game |
| `npm run assets:otsp` | Imports the OpenTibia Sprite Pack cloned into `/tmp/otsp` |
| `npm run pinceles:generar` | Regenerates the brushes' demo art and `data/editor/pinceles.json` |
| `npm run banderas:generar` | Regenerates `assets/objetos.json`, the copy of the `items.xml` flags used by the client |
| `npm run check:jetyum` | Checks that the client and the editor load all their modules |

**Ports.** They live in `config.js`: `webPort` (8000, the web client) and `enginePort` (8081, the
engine). The client asks `/jetyum/motor.json` for the engine port, so changing it there and
restarting is enough. The editor uses 8090 (`node editor/server.js --port N`). To point the client
at another engine: `.../jetyum/index.html?ws=other-machine:8081`.

**Visible area.** `visibleTilesX` and `visibleTilesY` in `config.js` (15×11 by default, like
Tibia).

**Isometric view (prototype).** `http://localhost:8000/jetyum/?iso=1` draws the same world in
diamonds like Habbo, with the same sprites ([docs/CLIENTE.md §2.5](docs/CLIENTE.md#25-la-vista-isométrica-prototipo)).

---

## 2. The game

- **Accounts.** The **"Create account"** tab creates the account and the character (vocation and
  sex); **"Log in"** asks for the account and lets you pick a character. Everything is stored in
  `data/jetyum.db` (SQLite).
- **Multiplayer.** Each player opens the client in their browser. From another machine on the
  network, use the address the server prints at startup; ports 8000 and 8081 must be open.
- **Controls:**
  - arrows to walk (with `/wasd`, also W A S D), diagonally with two at once;
  - click to **walk there**, also **on the minimap** (if there is no path, it gets as close as
    possible);
  - **right click**: on a monster, attack it; on something, use it (doors, levers, stairs,
    potions, coins); on a container, open it; on yourself, your character sheet;
  - both buttons at once: **look**;
  - drag to pick up and move things;
  - **F1–F12 and Shift+F1–F12**: spell and item **hotkeys** (set them up with **Ctrl+K** or the
    button next to the capacity).
- **The screen** is Tibia's: minimap, health and mana and equipment in windows that move and
  minimize; Skills, Battle, VIP, Options, Help, Quests and Backpack; containers that close by
  themselves if they don't fit; and the tabbed console. **Options** include names, health bars,
  **pixel smoothing** (Scale2x, bilinear or sharp) and the **language**.
- **Vocations and outfits.** The rules come from `data/XML/vocations.js` and the clothes from
  `data/XML/outfits.js`. Skills are trained by fighting and magic level with spells. `/spells`
  lists your vocation's spells. See [docs/VOCACIONES.md](docs/VOCACIONES.md).
- **Inventory.** The backpack has 20 slots and each stack holds **up to 100**. Money comes in
  gold, platinum (100 gold) and crystal (100 platinum) coins; they are exchanged with right click
  and NPCs give change.
- **Combat and loot.** Monsters leave their corpse with the loot inside, which rots over time. A
  knight with a sword slashes in the direction they are facing. Dying costs 10% of experience and
  you respawn at the temple.
- **TFS combat.** Damage comes from level, skill and weapon attack; shields **block** and armor
  reduces; distance attacks can **miss** (by skill and distance); and there are **fight modes**
  (offensive, balanced, defensive), **chase** and **secure mode** (no attacking unmarked players by
  mistake). Monsters use **all their attacks**: ranged and area spells (which don't go through
  walls), paralysis, life and mana drain, self-healing, keeping their distance, fleeing at low health
  and their voices; and their immunities count.
- **Runes, fields and tools.** «Use with» (right click the rune or tool and then the target, or from
  a hotkey) casts **runes** —sudden death, magic missiles, healing, great fireball, explosion, fire,
  energy and poison fields, magic wall, destroy field, paralyze—, which are **conjured** on blank
  runes (`adori vita vis`…) and spend charges. **Fields** burn, shock or poison whoever steps on them
  and go out by themselves. The **shovel** opens stone piles and the **rope** pulls you up through
  holes. The Shopkeeper sells blank runes, some runes and tools.
- **More game.** Potions and food, attack and support spells with cooldowns, quests, NPC trade,
  private messages (`@name text`), parties (`/party`), PvP skulls, depot, bows with arrows,
  effects and projectiles, and day and night with lights.
- **NPCs.** Greet them with `hi` (or `hola`) and say goodbye with `bye` (or `adios`); they have
  keywords and trade. The healer heals wounds and poison (`heal`), except in the middle of a
  fight.
- **Dying costs what it does in TFS:** experience, skills and magic level; your corpse keeps what you lose (the backpack and, by chance, your equipment). The healer's five **blessings** (`blessings`) reduce it and are spent on death; `/bendiciones` and `/muertes [name]` (the death history).
- **Attributes.** Points to spend on strength, dexterity, intelligence, vitality and energy (more
  damage, capacity, health or mana; up to 100 in each), in the **Attributes** window or with
  `/attributes`. You earn them by playing: reaching certain levels, walking, exploring new places,
  making runes and using magic, active playing time and hunting different species. Resetting them
  costs 500 gold. Configure them under `attributes` in `config.js` (see `docs/VOCACIONES.md`).
- **Turn in place** with **Ctrl + arrow keys**, like in Tibia.
- **Mounts.** Pick one in the character window (right click on yourself) and mount or dismount with
  **Ctrl+R** or the «Ride» checkbox; they add speed. You can't mount inside a protection zone. They
  live in `data/XML/mounts.js`: everyone has the pack bear and the pig, and the others are given
  with `player.addMount(id)` or `/montura`.
- **World rules** (`engine/world/reglas.js`). In a **protection zone** nobody hits or gets hit,
  and monsters stop chasing you. PvP follows `worldType` and `protectionLevel` in `config.js`.
  Whoever hits or gets hit is **in a fight** for `pzLocked` (one minute): they can't log out, and
  if their connection drops the character stays until the fight ends. Attacking another player
  also bars you from entering a protection zone for that time.
- **Access groups** (`data/XML/groups.js`): player, tutor, senior tutor, gamemaster, community
  manager and god. GM commands don't exist for a player. The first god is named with
  `npm run grupo -- <character> god` (with the server stopped), and in game a god gives groups
  with `/grupo`.
- **Worlds.** The default map is **`jetyum`** (`data/world/jetyum.map.json`), with the OpenTibia
  Sprite Pack art: temple, square with a market, houses, shop, smithy, bank, park and, outside,
  forest, ruins, farm, lake and goblin camp. The **village** (`aldea.map.json`) is made with the HD
  art. The **continent** (`continente.map.json`, `mapName: 'continente'`) is the big map: a
  256×256 island with four towns, every monster and NPC, caves on three floors and a museum with
  every item, effect, missile and outfit.
- **Chat commands:** `/spells`, `/pos`, `/i`, `/outfit …`, `/stats`, `/party`, `/vocacion`,
  `/wasd` and `/ayuda` (help). GM: `/ir <place>` and `/montura`. God: `/item <id>`,
  `/raid [name]`, `/grupo` and changing the vocation with `/vocacion <name>`.

The whole game (actions, movements, commands, events, global events and raids) is written with the
server's scripting API: see [docs/SCRIPTS.md](docs/SCRIPTS.md).

---

## 3. The tools

`npm run editor` opens an application with **four tabs** ([docs/HERRAMIENTAS.md](docs/HERRAMIENTAS.md)):

- **Map**, RME-style: ground brushes with auto-borders, walls with doors and windows, carpets and
  tables; houses, towns and waypoints; respawns, monsters and NPCs; selection and clipboard, fill
  bucket, find and replace, undo and minimap. The shortcuts are RME's
  ([docs/MAPAS.md](docs/MAPAS.md#4-las-herramientas-de-rme)).
  Also: lower floors (with shade) and the upper floor as a ghost, multi-floor selection, map
  diagnostics (F7), and new map, save as, map properties and backups.
- **Composites**: templates of whole objects spanning one or more tiles, with parameters.
- **Sprites**, ObjectBuilder-style: things by category, animated preview, sprite library (import,
  replace, export), thing sheets, properties and flags of the 8.60 `.dat`, and a consistency check
  against `items.xml`.
- **Items**: edits `data/items/items.xml` keeping its comments and its order.

---

## 4. Sprites and HD art

- **32×32 sprites** in PNG sheets, numbered from 1. They are only ever appended: never renumbered.
- **Things** in `things.json` (`items`, `outfits`, `effects`, `missiles`), with their dimensions,
  patterns, frames, flags and the sprite list in **OTClient's order**. The anchor is at the bottom
  right: big things grow up and to the left.
- **HD art**: 64 px per tile, drawn at half scale on a double-resolution canvas. The sheets, their
  sizes and the prompts to generate them are in [docs/ARTE-HD.md](docs/ARTE-HD.md).

Full details in [docs/SPRITES.md](docs/SPRITES.md).

---

## 5. Maps and composite objects

- **The map** (`data/world/*.map.json`) only writes the exceptions to the default ground.
  Respawns, NPCs, towns, houses and waypoints go in the same file.
- **The brushes** (`data/editor/pinceles.json`) are RME's `grounds.xml`, `borders.xml` and
  `walls.xml`.
- **Attributes** configure one specific object: `actionId`, `uniqueId`, `text`,
  `teleportDestination`…
- **A composite object** is placed whole and expands into regular objects.

Full details in [docs/MAPAS.md](docs/MAPAS.md).

---

## 6. Project structure

```
config.js         engine configuration
engine/           ENGINE: core, scripting, persistence, network (WebSocket and web server) and world
data/             DATAPACK: items.xml, XML/, scripts/, monsters/, npc/, world/, editor/, arte-hd/
client/jetyum/    WEB CLIENT: index.html, js/ and assets/ (things.json, sprites/, objetos.json)
shared/js/        SHARED CONTRACTS: protocol, asset format, composites, effects and languages
shared/i18n/      TRANSLATIONS: the English dictionaries
editor/           TOOLS: server.js (API), lib/ and js/ (interface)
tools/            tests, generators and importers
docs/             detailed documentation and guides
```

The design decisions, with their evidence, are in [ARQUITECTURA.md](ARQUITECTURA.md).

---

## 7. Documentation

The detailed documentation is written in Spanish.

| Document | Contents |
|---|---|
| [docs/guias/](docs/guias/README.md) | Visual guides: draw, register, place and see an item in the game |
| [ARQUITECTURA.md](ARQUITECTURA.md) | Engine/client/tools separation and design decisions |
| [docs/SPRITES.md](docs/SPRITES.md) | Sprite format and order, flags and conventions |
| [docs/ARTE-HD.md](docs/ARTE-HD.md) | The HD art: sheets, sizes, prompts, importer and the village |
| [docs/MAPAS.md](docs/MAPAS.md) | Map format, object attributes and composite objects |
| [docs/HERRAMIENTAS.md](docs/HERRAMIENTAS.md) | Editor architecture and API |
| [docs/CLIENTE.md](docs/CLIENTE.md) | Client architecture compared to OTClient |
| [docs/VOCACIONES.md](docs/VOCACIONES.md) | Vocations, outfits, formulas and spells |
| [docs/SCRIPTS.md](docs/SCRIPTS.md) | The server's scripting API and how to write a script |
| [docs/CREDITOS.md](docs/CREDITOS.md) | Art credits |

---

## 8. Tests

`npm test` runs everything without a browser and without touching the datapack (whatever it writes,
it writes to temporary copies):

| Test | Covers |
|---|---|
| `test:engine` | Configuration, `items.xml`, vocations, module loading, events and hot reload |
| `test:world` | Walking cost, stacking, diagonals, visibility between floors and map validation |
| `test:simulation` | Scheduler, movement, teleport, spawns and respawn |
| `test:combat` | Experience, armor and elements, death, loot, paths and AI |
| `test:protocol` | What each player sees, and that no client message changes the world on its own |
| `test:persistence` | Accounts, transactions and that state survives a restart |
| `test:tools` | Map writer, `items.xml` and the editor's map API |
| `test:render` | 2.5D draw order, floors, palette, hotkeys and smoothing |
| `test:client` | The real client against a real engine |
| `test:assets` | Sprites, store, composites and the assets API |
| `test:mapa` | The RME tools |
| `test:otsp` | The `jetyum` world: loading, doors, global events and raids |
| `test:vocaciones` | Vocations and outfits |
| `test:atributos` | Attribute points: each source (levels, walking, exploring, magic, time and hunting), the cap, spending, resetting and what each one gives |
| `test:scripts` | The scripting API and the game built with it |
| `test:arte` | The HD art: templates, importer and the village |
| `test:i18n` | Languages: translation, dictionaries and that every text on the pages has a translation |
| `test:reglas` | Access groups, protection zones and PvP, in-fight and PZ lock, network protection, rates, the healer and mounts |
| `test:combate` | TFS formulas and fight modes, immunities, monster spells, runes and conjuring, fields and tools |

`npm run check:jetyum` also checks that the client and the editor load all their modules.

---

## 9. Roadmap

1. **Original art**: replace the provisional art with final HD art ([docs/ARTE-HD.md](docs/ARTE-HD.md)).
2. **Houses in the engine**: rent, owners and doors with `doorId` (the map already describes them).
3. **The rest of RME**: `inner`/`friend`/`specific` borders, variants in composites and ghost
   floors ([docs/MAPAS.md §5](docs/MAPAS.md#5-lo-que-queda-por-hacer-roadmap-de-mapas)).
4. **Importers** for 8.60 `.dat`/`.spr`. (OTBM is already imported and exported, along with RME
   materials: [docs/MAPAS.md §5.1](docs/MAPAS.md#51-importar-y-exportar-otbm).)

---

## 10. License and credits

The code is under **MPL 2.0** and the content (art and sound) under **CC-BY-SA 3.0**. See
[LICENSE](LICENSE).

The graphics of the "jetyum" world come from the **[OpenTibia Sprite Pack](https://github.com/peonso/opentibia_sprite_pack)**
(CC BY 4.0). Part of the asset art comes from **BrowserQuest**, by
[Little Workshop](http://www.littleworkshop.fr). Authors and details in
[docs/CREDITOS.md](docs/CREDITOS.md).

Tibia and its art are the property of CipSoft and are **not** reused here; Tibia's assets
(`.dat`/`.spr`) are not distributed with the project.
