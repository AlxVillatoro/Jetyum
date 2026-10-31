# Jetyum

<p align="center">
  <a href="README.md"><img alt="Español" src="https://img.shields.io/badge/Espa%C3%B1ol-c60b1e?style=for-the-badge"></a>
  <a href="README.en.md"><img alt="English" src="https://img.shields.io/badge/English-3a3a46?style=for-the-badge"></a>
</p>

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

Requiere **Node.js 24.22.1+ o 26.12.1+** (las líneas LTS con los parches de seguridad de octubre de 2026).

```bash
npm install

npm start         # EL JUEGO: motor (ws://localhost:8081) y cliente web (http://localhost:8000)
npm run editor    # LAS HERRAMIENTAS (http://localhost:8090)
npm test          # todas las pruebas
```

**Idiomas: español e inglés.** El juego y las herramientas se pueden usar en los dos: el cliente
tiene el selector en la pantalla de entrada y en *Opciones*, y el editor arriba a la derecha. Se
recuerda la elección; **por defecto, inglés**, y se cambia para todo el servidor con
`defaultLanguage` en `config.js` (`'en'` o `'es'`). Cada jugador ve el juego en su
idioma —los mensajes del motor y lo que dicen los NPC se traducen en su cliente— y los NPC entienden
las palabras clave en los dos (`hola`/`hi`, `comprar espada`/`buy sword`...).

El texto original es el español y la traducción vive en `shared/i18n/en/`: una frase en español por
clave, con huecos entre llaves para lo que el código compone (`'Has recogido {n} {objeto}.'`). Una
frase sin entrada se queda en español. Cómo funciona, en `shared/js/i18n.mjs`; las pruebas, en
`npm run test:i18n`.

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

**Vista isométrica (prototipo).** `http://localhost:8000/jetyum/?iso=1` dibuja el mismo mundo en
rombos como Habbo, con los mismos sprites ([docs/CLIENTE.md §2.5](docs/CLIENTE.md#25-la-vista-isométrica-prototipo)).

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
  nombres, las barras de vida, el **suavizado de los píxeles** (Scale2x, bilineal o nítido) y el
  **idioma**.
- **Vocaciones y aspectos.** Las reglas salen de `data/XML/vocations.js` y la ropa de
  `data/XML/outfits.js`. Las skills se entrenan peleando y el nivel mágico con hechizos. `/spells`
  lista los hechizos de tu vocación. Ver [docs/VOCACIONES.md](docs/VOCACIONES.md).
- **Inventario.** La mochila tiene 20 huecos y cada pila admite **hasta 100**. El dinero va en
  monedas de oro, platino (100 de oro) y cristal (100 de platino); se cambian con clic derecho y
  los NPC dan el cambio.
- **Combate y botín.** Los monstruos dejan su cuerpo con el botín dentro, que se pudre con el
  tiempo. Un caballero con espada da un tajo en la dirección en que mira. Al morir se pierde un
  10 % de experiencia y se reaparece en el templo.
- **Combate como en TFS.** El daño sale del nivel, la skill y el ataque del arma; el escudo
  **bloquea** y la armadura reduce; a distancia se puede **fallar** (según la skill y la distancia);
  y hay **modos de combate** (ofensivo, equilibrado, defensivo), **perseguir** y **modo seguro** (no
  atacar por error a jugadores sin calavera). Los monstruos usan **todos sus ataques**: hechizos a
  distancia y de área (que no atraviesan paredes), parálisis, drenar vida y maná, curarse, mantener
  la distancia, huir con poca vida y sus frases; y sus inmunidades cuentan.
- **Runas, campos y herramientas.** «Usar con» (clic derecho en la runa o la herramienta y luego en
  el objetivo, o desde una hotkey) lanza las **runas** —sudden death, magic missiles, curación, great
  fireball, explosion, campos de fuego, energía y veneno, magic wall, destroy field, paralyze—, que
  se **conjuran** sobre runas en blanco (`adori vita vis`…) y gastan cargas. Los **campos** queman,
  electrifican o envenenan al pisarlos y se apagan solos. La **pala** abre los montones de piedras y
  la **cuerda** sube por los agujeros. El Tendero vende runas en blanco, algunas runas y herramientas.
- **Más juego.** Pociones y comida, hechizos de ataque y apoyo con enfriamiento, misiones,
  comercio con NPC, mensajes privados (`@nombre texto`), grupos (`/party`), calaveras PvP,
  depósito, arcos con flechas, efectos y proyectiles, y día y noche con luces.
- **NPC.** Se saluda con `hola` y se despide con `adios`; tienen palabras clave y comercio. El
  sanador cura las heridas y el veneno (`curar`), salvo en pleno combate.
- **Morir cuesta como en TFS:** experiencia, skills y nivel mágico; queda tu cuerpo con lo que pierdes (la mochila y, a suertes, lo equipado). Las cinco **bendiciones** del sanador (`bendiciones`) lo rebajan y se gastan al morir; `/bendiciones` y `/muertes [nombre]` (el historial).
- **Monturas.** Se eligen en la ventana del personaje (clic derecho sobre ti) y se monta o desmonta
  con **Ctrl+R** o la casilla «Montar»; suman velocidad. No se monta en una zona de protección.
  Están en `data/XML/mounts.js`: el oso de carga y el cerdo los tiene todo el mundo, y las demás
  se dan con `player.addMount(id)` o `/montura`.
- **Reglas del mundo** (`engine/world/reglas.js`). En una **zona de protección** nadie pega ni
  recibe golpes, y los monstruos dejan de perseguirte. El PvP sigue `worldType` y
  `protectionLevel` de `config.js`. Quien pega o recibe un golpe queda **en combate** durante
  `pzLocked` (un minuto): no puede salir del juego, y si se le cae la conexión el personaje se
  queda hasta que acabe. Quien ataca a otro jugador, además, no puede entrar en una zona de
  protección en ese tiempo.
- **Rangos de acceso** (`data/XML/groups.js`): jugador, tutor, senior tutor, gamemaster, community
  manager y god. Los comandos de GM no existen para un jugador. El primer god se nombra con
  `npm run grupo -- <personaje> god` (con el servidor parado), y desde el juego un god da rangos
  con `/grupo`.
- **Mundos.** El mapa por defecto es **`jetyum`** (`data/world/jetyum.map.json`), con el arte del
  OpenTibia Sprite Pack: templo, plaza con mercado, casas, tienda, herrería, banco, parque y, fuera,
  bosque, ruinas, granja, lago y campamento goblin. La **aldea** (`aldea.map.json`) está hecha con
  el arte HD.
- **Comandos de chat:** `/spells`, `/pos`, `/i`, `/outfit …`, `/stats`, `/party`, `/vocacion`,
  `/wasd` y `/ayuda`. De GM: `/ir <lugar>` y `/montura`. De god: `/item <id>`,
  `/raid [nombre]`, `/grupo` y cambiar la vocación con `/vocacion <nombre>`.

Todo el juego (acciones, movimientos, comandos, eventos, eventos globales y raids) está escrito con
la API de scripts del servidor: ver [docs/SCRIPTS.md](docs/SCRIPTS.md).

---

## 3. Las herramientas

`npm run editor` abre una aplicación con **cuatro pestañas** ([docs/HERRAMIENTAS.md](docs/HERRAMIENTAS.md)):

- **Mapa**, al estilo RME: pinceles de suelo con auto-borde, muros con puertas y ventanas,
  alfombras y mesas; casas, ciudades y waypoints; respawns, monstruos y NPC; selección y
  portapapeles, cubo de relleno, buscar y reemplazar, deshacer y minimapa. Los atajos son los de
  RME ([docs/MAPAS.md](docs/MAPAS.md#4-las-herramientas-de-rme)).
  También: ver las plantas de abajo (con sombra) y la de arriba en fantasma, selección de varias
  plantas, diagnóstico del mapa (F7) y nuevo mapa, guardar como, propiedades y copias de seguridad.
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
shared/js/        CONTRATOS compartidos: protocolo, formato de assets, compuestos, efectos e idiomas
shared/i18n/      TRADUCCIONES: los diccionarios en inglés
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
| `test:i18n` | Los idiomas: traducción, diccionarios y que todo el texto de las páginas tenga traducción |
| `test:reglas` | Rangos de acceso, zonas de protección y PvP, en combate y PZ lock, protección de la red, rates, el sanador y las monturas |
| `test:combate` | Fórmulas de TFS y modos de combate, inmunidades, hechizos de los monstruos, runas y conjuros, campos y herramientas |

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
