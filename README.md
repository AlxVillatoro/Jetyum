# Jetyum

**MMORPG 2D multijugador en el navegador, estilo Tibia con perspectiva 2.5D.** Está construido
como un servidor de Tibia:

- un **motor** autoritativo en Node.js (el «TFS» del proyecto);
- un **datapack** extensible con módulos JavaScript y XML;
- un **cliente web** que dibuja con sprites de 32×32 y arte HD de 64 px por casilla;
- unas **herramientas** de mapa, objetos compuestos, sprites y objetos (el «RME» y el
  «ObjectBuilder» del proyecto).

| Pieza | Referencia que sigue |
|---|---|
| Mecánicas del servidor | [forgottenserver-downgrade-1.8-8.60](https://github.com/Mateuzkl/forgottenserver-downgrade-1.8-8.60) |
| Editor de mapas | [RME-CLIENTID](https://github.com/Mateuzkl/RME-CLIENTID) y [NexaMap-Editor](https://github.com/Mateuzkl/NexaMap-Editor) |
| Editor de sprites | [ObjectBuilder](https://github.com/ottools/ObjectBuilder) |
| Cliente | [OTC-Fonticak](https://github.com/AlxVillatoro/OTC-Fonticak) (OTClient, protocolo 8.60) |

> 🧭 **¿Primera vez?** Empieza por las **[guías visuales](docs/guias/README.md)**: el camino completo
> de un objeto, del dibujo al juego, paso a paso y con capturas.

## Índice

1. [Cómo ejecutarlo](#1-cómo-ejecutarlo)
2. [El juego](#2-el-juego)
3. [Las herramientas](#3-las-herramientas)
4. [Sprites y arte HD](#4-sprites-y-arte-hd)
5. [Mapas y objetos compuestos](#5-mapas-y-objetos-compuestos)
6. [Estructura del proyecto](#6-estructura-del-proyecto)
7. [Documentación](#7-documentación)
8. [Pruebas](#8-pruebas)
9. [Roadmap](#9-roadmap)
10. [Licencia y créditos](#10-licencia-y-créditos)

---

## 1. Cómo ejecutarlo

Requiere **Node.js 20.19+ o 22.12+**.

```bash
npm install

npm start         # EL JUEGO: motor (ws://localhost:8081) y cliente web (http://localhost:8000)
npm run editor    # LAS HERRAMIENTAS (http://localhost:8090)
npm test          # todas las pruebas
```

| Para… | Abre |
|---|---|
| jugar (con `npm start` en marcha) | **http://localhost:8000/jetyum/** |
| editar mapas, compuestos, sprites y objetos | **http://localhost:8090/** |

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run serve:aldea` | Arranca el juego en la aldea hecha con el arte HD |
| `npm run serve -- --map sample` | Arranca el juego con otro mapa de `data/world` sin tocar `config.js` |
| `npm run engine` | Arranca solo el motor y resume el datapack cargado |
| `npm run engine:reload` | Comprueba la recarga en caliente del contenido |
| `npm run mundo:otsp` | Regenera los pinceles, los compuestos y el mapa `jetyum` |
| `npm run mundo:aldea` | Regenera el mapa de la aldea HD |
| `npm run arte:plantillas` | Genera las hojas provisionales del arte HD a partir del arte de 32 px |
| `npm run arte:importar` | Mete el arte HD de `data/arte-hd/` en el juego |
| `npm run assets:otsp` | Importa el OpenTibia Sprite Pack clonado en `/tmp/otsp` |
| `npm run pinceles:generar` | Regenera el arte de demostración de los pinceles y `data/editor/pinceles.json` |
| `npm run banderas:generar` | Regenera `assets/objetos.json`, la copia de las banderas de `items.xml` que usa el cliente |
| `npm run check:jetyum` | Comprueba que el cliente y el editor cargan todos sus módulos |

**Puertos.** Están en `config.js`: `webPort` (8000, el cliente web) y `enginePort` (8081, el
motor). El cliente pregunta el puerto del motor a `/jetyum/motor.json`, así que basta con
cambiarlo ahí y reiniciar. El editor usa el 8090 (`node editor/server.js --port N`). Para
apuntar el cliente a otro motor: `.../jetyum/index.html?ws=otra-maquina:8081`.

**Área visible.** `visibleTilesX` y `visibleTilesY` en `config.js` (15×11 por defecto, como
Tibia).

---

## 2. El juego

- **Cuentas.** La pestaña **«Crear cuenta»** crea la cuenta y el personaje (vocación y sexo);
  **«Entrar»** pide la cuenta y deja elegir personaje. Todo se guarda en `data/jetyum.db`
  (SQLite).
- **Multijugador.** Cada jugador abre el cliente en su navegador. Desde otro equipo de la red se
  usa la dirección que el servidor escribe al arrancar; hay que abrir los puertos 8000 y 8081.
- **Controles:**
  - flechas para andar (con `/wasd`, también W A S D), en diagonal con dos a la vez;
  - clic para **ir andando**, también **en el minimapa** (si no hay camino, se acerca lo más
    posible);
  - **clic derecho**: sobre un monstruo, atacarlo; sobre algo, usarlo (puertas, palancas,
    escaleras, pociones, monedas); sobre un contenedor, abrirlo; sobre ti, tu ficha;
  - los dos botones a la vez: **mirar**;
  - arrastrar para coger y mover cosas;
  - **F1–F12 y Shift+F1–F12**: las **hotkeys** de hechizos y objetos (se configuran con
    **Ctrl+K** o el botón junto a la capacidad).
- **La pantalla** es la de Tibia: minimapa, vida y maná y equipo en ventanas que se mueven y se
  minimizan; Skills, Batalla, VIP, Opciones, Ayuda, Misiones y Mochila; contenedores que se
  cierran solos si no caben; y la consola con pestañas. En **Opciones** están, entre otras, los
  nombres, las barras de vida y el **suavizado de los píxeles** (Scale2x, bilineal o nítido).
- **Vocaciones y aspectos.** Las reglas salen de `data/XML/vocations.js` y la ropa de
  `data/XML/outfits.js`. Las skills se entrenan peleando y el nivel mágico con hechizos. `/spells`
  lista los hechizos de tu vocación. Ver [docs/VOCACIONES.md](docs/VOCACIONES.md).
- **Inventario.** La mochila tiene 20 huecos y cada pila admite **hasta 100**. El dinero va en
  monedas de oro, platino (100 de oro) y cristal (100 de platino); se cambian con clic derecho y
  los NPC dan el cambio.
- **Combate y botín.** Los monstruos dejan su cuerpo con el botín dentro, que se pudre con el
  tiempo. Un caballero con espada da un tajo en la dirección en que mira. Al morir se pierde un
  10 % de experiencia y se reaparece en el templo.
- **Más juego.** Pociones y comida, hechizos de ataque y apoyo con enfriamiento, misiones,
  comercio con NPC, mensajes privados (`@nombre texto`), grupos (`/party`), calaveras PvP,
  depósito, arcos con flechas, efectos y proyectiles, y día y noche con luces.
- **NPC.** Se saluda con `hola` y se despide con `adios`; tienen palabras clave y comercio.
- **Mundos.** El mapa por defecto es **`jetyum`** (`data/world/jetyum.map.json`), con el arte del
  OpenTibia Sprite Pack: templo, plaza con mercado, casas, tienda, herrería, banco, parque y, fuera,
  bosque, ruinas, granja, lago y campamento goblin. La **aldea** (`aldea.map.json`) está hecha con
  el arte HD.
- **Comandos de chat:** `/ir <lugar>`, `/spells`, `/pos`, `/i`, `/item <id>`, `/outfit …`,
  `/raid [nombre]`, `/wasd` y `/ayuda`.

Todo el juego (acciones, movimientos, comandos, eventos, eventos globales y raids) está escrito con
la API de scripts del servidor: ver [docs/SCRIPTS.md](docs/SCRIPTS.md).

---

## 3. Las herramientas

`npm run editor` abre una aplicación con **cuatro pestañas** ([docs/HERRAMIENTAS.md](docs/HERRAMIENTAS.md)):

- **Mapa**, al estilo RME: pinceles de suelo con auto-borde, muros con puertas y ventanas,
  alfombras y mesas; casas, ciudades y waypoints; respawns, monstruos y NPC; selección y
  portapapeles, cubo de relleno, buscar y reemplazar, deshacer y minimapa. Los atajos son los de
  RME ([docs/MAPAS.md](docs/MAPAS.md#4-las-herramientas-de-rme)).
- **Compuestos**: plantillas de objetos enteros de una o varias casillas, con parámetros.
- **Sprites**, al estilo ObjectBuilder: cosas por categoría, vista previa animada, biblioteca de
  sprites (importar, reemplazar, exportar), hojas de cosa, propiedades y banderas del `.dat` 8.60,
  y comprobación de coherencia con `items.xml`.
- **Objetos**: edita `data/items/items.xml` conservando sus comentarios y su orden.

---

## 4. Sprites y arte HD

- **Sprites de 32×32** en hojas PNG, numerados desde el 1. Solo se añaden: nunca se renumeran.
- **Cosas** en `things.json` (`items`, `outfits`, `effects`, `missiles`), con sus dimensiones,
  patrones, fotogramas, banderas y la lista de sprites en **el orden de OTClient**. El ancla está
  abajo a la derecha: lo grande crece hacia arriba y a la izquierda.
- **Arte HD**: 64 px por casilla, dibujado a media escala sobre un lienzo de doble resolución.
  Las hojas, sus medidas y los prompts para generarlas están en [docs/ARTE-HD.md](docs/ARTE-HD.md).

Detalle completo en [docs/SPRITES.md](docs/SPRITES.md).

---

## 5. Mapas y objetos compuestos

- **El mapa** (`data/world/*.map.json`) solo escribe las excepciones al suelo por defecto. Los
  respawns, NPC, ciudades, casas y waypoints van en el mismo archivo.
- **Los pinceles** (`data/editor/pinceles.json`) son los `grounds.xml`, `borders.xml` y
  `walls.xml` de RME.
- **Los atributos** configuran un objeto concreto: `actionId`, `uniqueId`, `text`,
  `teleportDestination`…
- **Un objeto compuesto** se coloca entero y se expande a objetos normales.

Detalle completo en [docs/MAPAS.md](docs/MAPAS.md).

---

## 6. Estructura del proyecto

```
config.js         configuración del motor
engine/           MOTOR: núcleo, scripting, persistencia, red (WebSocket y servidor web) y mundo
data/             DATAPACK: items.xml, XML/, scripts/, monsters/, npc/, world/, editor/, arte-hd/
client/jetyum/    CLIENTE WEB: index.html, js/ y assets/ (things.json, sprites/, objetos.json)
shared/js/        CONTRATOS compartidos: protocolo, formato de assets, compuestos y efectos
editor/           HERRAMIENTAS: server.js (API), lib/ y js/ (interfaz)
tools/            pruebas, generadores e importadores
docs/             documentación de detalle y guías
```

Las decisiones de diseño, con su evidencia, están en [ARQUITECTURA.md](ARQUITECTURA.md).

---

## 7. Documentación

| Documento | Contenido |
|---|---|
| [docs/guias/](docs/guias/README.md) | Guías visuales: dibujar, dar de alta, colocar y ver un objeto en el juego |
| [ARQUITECTURA.md](ARQUITECTURA.md) | Separación motor/cliente/herramientas y decisiones de diseño |
| [docs/SPRITES.md](docs/SPRITES.md) | Formato y orden de los sprites, banderas y convenciones |
| [docs/ARTE-HD.md](docs/ARTE-HD.md) | El arte HD: hojas, medidas, prompts, importador y la aldea |
| [docs/MAPAS.md](docs/MAPAS.md) | Formato de mapa, atributos de objeto y objetos compuestos |
| [docs/HERRAMIENTAS.md](docs/HERRAMIENTAS.md) | Arquitectura y API del editor |
| [docs/CLIENTE.md](docs/CLIENTE.md) | Arquitectura del cliente comparada con OTClient |
| [docs/VOCACIONES.md](docs/VOCACIONES.md) | Vocaciones, aspectos, fórmulas y hechizos |
| [docs/SCRIPTS.md](docs/SCRIPTS.md) | La API de scripts del servidor y cómo se escribe uno |
| [docs/CREDITOS.md](docs/CREDITOS.md) | Créditos del arte |

---

## 8. Pruebas

`npm test` lo ejecuta todo sin navegador y sin tocar el datapack (lo que escribe, lo escribe en
copias temporales):

| Prueba | Cubre |
|---|---|
| `test:engine` | Configuración, `items.xml`, vocaciones, carga de módulos, eventos y recarga en caliente |
| `test:world` | Coste de paso, apilado, diagonales, visibilidad entre plantas y validación de mapas |
| `test:simulation` | Planificador, movimiento, teletransporte, spawns y reaparición |
| `test:combat` | Experiencia, armadura y elementos, muerte, botín, caminos e IA |
| `test:protocol` | Lo que ve cada jugador y que ningún mensaje del cliente cambie el mundo por su cuenta |
| `test:persistence` | Cuentas, transacciones y que el estado sobreviva a reiniciar |
| `test:tools` | Escritor de mapas, `items.xml` y la API de mapas del editor |
| `test:render` | Orden de dibujo 2.5D, plantas, paleta, hotkeys y suavizado |
| `test:client` | El cliente real contra un motor real |
| `test:assets` | Sprites, almacén, compuestos y la API de assets |
| `test:mapa` | Las herramientas de RME |
| `test:otsp` | El mundo `jetyum`: carga, puertas, eventos globales y raids |
| `test:vocaciones` | Vocaciones y aspectos |
| `test:scripts` | La API de scripts y el juego hecho con ella |
| `test:arte` | El arte HD: plantillas, importador y la aldea |

`npm run check:jetyum` comprueba además que el cliente y el editor cargan todos sus módulos.

---

## 9. Roadmap

1. **Arte propio**: sustituir el arte provisional por arte HD definitivo ([docs/ARTE-HD.md](docs/ARTE-HD.md)).
2. **Casas en el motor**: alquiler, dueños y puertas con `doorId` (el mapa ya las describe).
3. **El resto de RME**: bordes `inner`/`friend`/`specific`, variantes en los compuestos y plantas
   en fantasma ([docs/MAPAS.md §5](docs/MAPAS.md#5-lo-que-queda-por-hacer-roadmap-de-mapas)).
4. **Importadores** de OTBM y de `.dat`/`.spr` 8.60.

---

## 10. Licencia y créditos

El código está bajo **MPL 2.0** y el contenido (arte y sonido) bajo **CC-BY-SA 3.0**. Ver
[LICENSE](LICENSE).

Los gráficos del mundo «jetyum» son del **[OpenTibia Sprite Pack](https://github.com/peonso/opentibia_sprite_pack)**
(CC BY 4.0). Parte del arte de los assets viene de **BrowserQuest**, de
[Little Workshop](http://www.littleworkshop.fr). Autores y detalles en
[docs/CREDITOS.md](docs/CREDITOS.md).

Tibia y su arte son propiedad de CipSoft y **no** se reutilizan aquí; los assets de Tibia
(`.dat`/`.spr`) no se distribuyen con el proyecto.
