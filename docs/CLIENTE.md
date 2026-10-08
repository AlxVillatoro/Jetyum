# Arquitectura del cliente

El cliente (`client/jetyum/`) es un **terminal de dibujo con assets propios**: recibe del
motor lo que tiene a la vista, lo dibuja y le pide acciones. Nunca decide reglas de juego.

Como guía se usa [**OTC-Fonticak**](https://github.com/AlxVillatoro/OTC-Fonticak), un OTClient
(rama Redemption de mehah) adaptado a TFS 1.8 downgrade con **protocolo 8.60** y assets en
`data/things/860`. Este documento recoge lo que se toma de él y cómo encaja en un cliente web
(JavaScript y Canvas).

---

## 1. Correspondencia de módulos

OTClient separa el núcleo (`src/client`: ThingType, Tile, MapView, Creature…) de la interfaz,
que son módulos Lua (`modules/game_*`). Aquí el núcleo y la interfaz son módulos ES de
`client/jetyum/js/`.

| OTClient / OTC-Fonticak | Aquí | Estado |
|---|---|---|
| `src/client/thingtype.cpp`, `spritemanager.cpp` (lectura de `.dat`/`.spr`) | `js/assets.js` (`AssetsProvider`) + `shared/js/assets.mjs` | hecho |
| `src/client/mapview.cpp` (pisos, cámara, fade) | `js/camera.js` + `js/drawlist.js` | hecho (sin fade entre pisos) |
| `src/client/tile.cpp` (orden dentro de una casilla, elevación) | `js/drawlist.js` + `js/renderer.js` | hecho |
| `src/client/creature.cpp` (andar, fases, colores de outfit) | `js/world.js` (interpolación) + `AssetsProvider.getCreature` | hecho (ver §3) |
| `src/client/protocolgameparse.cpp` | `js/world.js` + `shared/js/protocol.mjs` (JSON por WebSocket) | hecho |
| `modules/client_entergame` | formulario de login de `index.html` (con vocación y sexo para personajes nuevos, de `vocations.js`) | hecho |
| `modules/game_interface` (layout, ratón, menús) | `js/main.js` | hecho (básico) |
| `modules/game_walk` (flechas, numpad, Ctrl+dirección = girar) | `js/main.js` (flechas/WASD, diagonales) | parcial: falta girar sin andar |
| `modules/game_console` | `js/consola.js`: pestañas Default y Server Log, hora en cada mensaje, lo que se dice también sobre la cabeza | hecho (faltan canales privados) |
| `modules/game_inventory`, `game_containers` | `js/panels.js` + `js/arrastrar.js`: las 10 ranuras de Tibia con almas y capacidad, la mochila en huecos | hecho |
| `modules/game_textmessage` | mensajes de estado | hecho |
| `modules/game_battle` | `js/lateral.js`: ventana Batalla (cercanía, vida, clic para atacar, marco rojo en el objetivo) | hecho |
| `modules/game_skills` / `game_healthinfo` | barras de vida y maná, ventana Skills (nivel, experiencia, nivel mágico, las 7 skills con su barra, almas, capacidad, stamina) | hecho |
| `modules/game_minimap` | `js/minimapa.js`: lo explorado con el color `minimap` de cada cosa, zoom y ver otras plantas | hecho (sin marcas ni clic para andar) |
| `modules/game_outfit` | `js/personaje.js`: clic derecho sobre ti (aspectos de tu sexo, colores, añadidos y ficha) | hecho |
| `modules/game_hotkeys`, `game_actionbar` | — | pendiente |
| `modules/game_npcmodal` | diálogo por chat | hecho (por chat) |
| `modules/game_viplist` | `js/lateral.js`: ventana VIP (se guarda en el navegador; verde si lo ves) | hecho (sin estado en línea del servidor) |
| `modules/client_options` | ventana Opciones: nombres, barras de vida, hora, diagnóstico, suavizado | hecho |
| `modules/game_interface` (paneles laterales, `MiniWindow`) | `js/ventanas.js`: columnas derecha e izquierda en un orden fijo, se reparten el alto sin desplazar la página; consola redimensionable | hecho |

---

## 2. Dibujo: lo que se copia de OTClient

### 2.1 Las cosas y el orden de los sprites

`ThingType::getSpriteIndex` es la fórmula de [SPRITES.md §2](SPRITES.md#2-el-orden-la-fórmula-de-tibia),
con el ancla abajo a la derecha. El desplazamiento (`displacement`, la bandera `offset`) y la
elevación (tope de 24, `max-elevation` en `setup.otml`) se aplican igual que en OTClient:

- `AssetsProvider` devuelve `anchorX`/`anchorY` (tamaño en casillas más desplazamiento) y la
  `elevation` de cada cosa.
- `renderer.js` acumula la elevación dentro de cada casilla y dibuja lo de encima más arriba y
  más a la izquierda.

### 2.2 El orden dentro de una casilla

En OTClient, `Tile::draw` dibuja: el suelo, los bordes y lo de abajo (`onBottom`); los objetos
comunes; las criaturas; y por último lo de encima (`onTop`) y los efectos. Aquí `drawlist.js`
produce el mismo orden: **suelo → objetos de abajo → criaturas → objetos de encima**. Las
casillas se recorren por **diagonales** y cada planta se desplaza (el 2.5D), que es lo que hace
`MapView::drawFloor`.

### 2.3 Aspectos

- **Patrón X = dirección** (0 N, 1 E, 2 S, 3 O), **Y = añadidos** por bitmask (`addons & (1 << (y-1))`)
  y **Z = montura**.
- **Colores:** la capa 1 es la máscara (amarillo = cabeza, rojo = cuerpo, verde = piernas, azul =
  pies). Se multiplica por los colores de la paleta de 133 (19 tonos × 7 valores, como
  `Outfit::getColor`).
- **Fotogramas:** el 0 es quieto y del 1 al n es andando.

### 2.4 El suavizado de los píxeles

Opciones > Suavizado (`js/suavizado.js`; se guarda en el navegador). El mundo se pinta a 2 píxeles
por píxel lógico, así que cada sprite de 32 px se amplía al doble:

| Modo | Los sprites | La imagen a la ventana |
|---|---|---|
| **Píxel suave** (por defecto) | Scale2x: diagonales y curvas redondeadas, sin emborronar | con filtro |
| **Suave** | bilineal (como el «smooth» de OTClient), con alfa premultiplicado | con filtro |
| **Nítido** | el píxel tal cual | sin filtro |

Los bordes se repiten al ampliar, así que los suelos siguen encajando sin juntas. El arte HD
(64 px por casilla) no se amplía: ya tiene la resolución del lienzo. Las ampliaciones se guardan
con el resto de dibujos del proveedor y se rehacen al cambiar de modo.

---

### 2.5 La vista isométrica (prototipo)

`index.html?iso=1` dibuja el mismo mundo en una rejilla de rombos 2:1 como Habbo (`js/iso.js`).
Es un prototipo para VER cómo quedaría antes de decidir si el proyecto cambia de proyección:

- `IsoCamera` sustituye a `Camera`: `pantallaX = (x - y) * 32`, `pantallaY = (x + y) * 16`, y
  las plantas de abajo bajan 40 px. La lista de dibujo ya va por diagonales `x + y`, que es el
  orden de profundidad del isométrico, así que no cambia.
- `IsoRenderer` sustituye a `Renderer`: el suelo se deforma al rombo (la textura real); lo que
  está de pie se pinta como un cartel vertical centrado en su casilla, con una sombra elíptica
  debajo. Etiquetas, efectos, noche y textos son los de siempre.
- El motor no cambia. Lo que no encaja: el arte está dibujado para verse de frente (los muros
  salen planos), las flechas siguen siendo norte/sur/este/oeste del mundo (el norte va arriba a
  la derecha), y el editor sigue en la vista de Tibia.

---

## 3. Diferencias deliberadas con OTClient

| OTClient | Aquí | Por qué |
|---|---|---|
| Protocolo binario 8.60 (puertos 7171/7172) | JSON sobre WebSocket (`enginePort` 8080) | El navegador no abre TCP. El formato se define en `shared/js/protocol.mjs` |
| `.dat`/`.spr` binarios | `things.json` + hojas PNG | Diffs legibles, carga directa en `<img>` y editable con la pestaña Sprites. El contenido es el mismo 1:1 |
| Viewport de 15×11 (`viewport: 8 6`) | 15×11 por defecto (`visibleTilesX`/`visibleTilesY` en `config.js`; 21×11 o más llena una pantalla ancha) | Se envían 2 casillas más por lado para que el borde no se vea al desplazarse |
| La fase de andar va ligada al progreso del paso | Va ligada al reloj mientras la criatura se mueve | Pendiente de alinear: `drawlist.js` ya calcula el progreso de la interpolación |
| Ticks de animación de 75 ms por fotograma | Las duraciones de cada cosa (`animation.durations`) | Por cosa, igual que en el `.dat` con animaciones mejoradas |

---

## 4. Layout objetivo de la interfaz

Es el de `game_interface/gameinterface.otui`, adaptado a una ventana de navegador:

```
┌───────────────────────────────────────────────┬──────────────────┐
│ barra superior: vida, maná, nivel, experiencia │ minimapa         │
├───────────────────────────────────────────────┤ inventario       │
│                                               │ (equipo, mochila)│
│             MAPA (gameMapPanel)               ├──────────────────┤
│                                               │ battle / skills  │
│                                               │ contenedores     │
├───────────────────────────────────────────────┤ (mini-ventanas)  │
│ consola (canales con pestañas)                │                  │
└───────────────────────────────────────────────┴──────────────────┘
```

Hoy ya están el mapa, la barra superior, el panel de equipo y mochila, y el chat. El orden para
completarlo es:

1. **Battle list**: las criaturas que llegan con la vista ya bastan, no hace falta nada nuevo
   en el protocolo.
2. **Skills**.
3. **Minimapa**: se dibuja con la bandera `minimap` de cada cosa.
4. **Consola con canales**.
5. **Hotkeys**.

---

## 5. Archivos

```
client/jetyum/
  index.html        página, login, lienzo, chat y paneles
  assets/           things.json + sprites/ (ver SPRITES.md); objetos.json, las banderas de items.xml
  js/
    main.js         arranque, entrada, bucle y cámara que sigue al jugador
    connection.js   WebSocket con reconexión
    world.js        el mundo espejo: SOLO lo que manda el motor
    camera.js       de mundo a píxeles, con el desplazamiento por planta
    drawlist.js     el orden de dibujo (diagonales, plantas, bandas de la pila)
    renderer.js     pinta la lista: anclas, elevación, criaturas y barras
    assets.js       AssetsProvider: las cosas de 32x32
    suavizado.js    Scale2x y bilineal: el suavizado de los píxeles (Opciones)
    iso.js          la vista isométrica (prototipo, ?iso=1): cámara y pintado en rombos
    sprites.js      proveedor de procedimiento, paleta de colores y createProvider()
    panels.js       equipo, mochila y peso
    arrastrar.js    arrastrar y soltar
    itemtypes.js    las banderas que el cliente necesita para arrastrar sin preguntar
```
