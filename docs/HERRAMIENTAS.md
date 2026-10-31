# Arquitectura de las herramientas

> Este documento es técnico. Para **usar** las herramientas paso a paso, con capturas, lee las
> [guías visuales](guias/README.md).

Las herramientas son lo que en el ecosistema de Tibia son RME/NexaMap (mapas), ObjectBuilder
(sprites y `.dat`) y los editores de `items.xml`. Aquí están juntas en **una aplicación web local
con cuatro pestañas**, servida por un servidor propio:

```bash
npm run editor          # http://localhost:8090/
```

| Pestaña | Equivalente | Edita | Documento |
|---|---|---|---|
| **Mapa** | RME-CLIENTID / NexaMap | `data/world/*.map.json` y `data/editor/pinceles.json` | [MAPAS.md](MAPAS.md) |
| **Compuestos** | `doodads.xml` de RME | `data/editor/compuestos.json` | [MAPAS.md §3](MAPAS.md#3-objetos-compuestos) |
| **Sprites** | ObjectBuilder | `client/jetyum/assets/{things.json,sprites/}` | [SPRITES.md](SPRITES.md) |
| **Objetos (items.xml)** | editor de items.xml | `data/items/items.xml` | — |

---

## 1. Principios

1. **Las herramientas solo producen archivos.** No hablan con el motor en marcha. El motor lee
   lo que ellas escriben al arrancar, igual que TFS lee el OTBM.
2. **Un solo dueño para cada formato.** Cada formato lo define un módulo **puro** de `shared/js/`
   (`assets.mjs`, `compuestos.mjs`, `protocol.mjs`), y ese mismo módulo lo importan el motor, el
   cliente, el editor y las pruebas. Así nunca hay dos lectores que discrepen.
3. **El editor dibuja con el código del cliente.** La cámara, el orden de dibujo y el proveedor
   de sprites del editor son los del juego, importados de `/jetyum/js/`. Lo que se ve en el
   editor es lo que se verá en el juego.
4. **Validar antes de escribir, y escribir de forma atómica.** El servidor valida cada guardado
   entero (y en los mapas, la ida y vuelta), escribe en un `.tmp` y lo renombra. Un guardado que
   falla deja el archivo como estaba.
5. **Solo localhost y sin autenticación.** El servidor escribe en el datapack, así que antes de
   exponerlo a la red habría que ponerle autenticación.

---

## 2. Piezas

```
editor/
  server.js           servidor HTTP: estático + API JSON (único que escribe en disco)
  lib/
    itemsfile.js        edición quirúrgica de items.xml (conserva comentarios y orden)
    assetstore.js       hojas de sprites y things.json: añadir, reemplazar, vaciar, validar
    png.js              PNG sin dependencias (leer cualquier PNG de 8 bits, escribir RGBA)
    mapfiles.js         archivos de mapa: nombres, mapa mínimo, encoger sin perder nada, copias
  index.html          la interfaz: cuatro pestañas y sus estilos. La del mapa sigue a RME:
                      barra de iconos arriba, paleta con su desplegable a la izquierda, mapa,
                      propiedades de lo elegido a la derecha y barra de estado con planta y zoom
  js/
    main.js             arranque, pestañas y cableado de la pestaña Mapa (y el panel de propiedades)
    iconos.js           los iconos SVG de las barras (sin dependencias): `data-icono` en el HTML
    apiclient.js        el cliente de la API (una función por endpoint)
    editormap.js        EL MAPA QUE SE EDITA: casillas, pila, pincel, respawns, NPC, compuestos,
                        propiedades y arrastres. Lógica pura, probada sin navegador
    mapcanvas.js        el lienzo del mapa (cámara y orden de dibujo del cliente)
    palette.js          la paleta de objetos sueltos
    fantasma.js         qué enseña el ratón antes de pintar o borrar
    pincel.js tintes.js marcadores.js viewport.js detalle.js   geometría y dibujo auxiliar
    herramientas.js     LAS HERRAMIENTAS DE RME: barra de edición, paletas Terreno/Casas/Ciudades/
                        Waypoints, selección, portapapeles, cubo, buscar, minimapa y atajos
    pinceles.js         auto-borde de suelos, muros (tablas de RME), puertas, alfombras y mesas (puro)
    edicion.js          copiar/pegar, relleno, buscar, reemplazar, aleatorizar, casas, ciudades (puro)
    historial.js        deshacer/rehacer por diferencias (puro)
    compuestosui.js     formularios de parámetros y de propiedades, y la pestaña Compuestos
    spritesview.js      la pestaña Sprites
    imagenes.js         cortar imágenes en 32x32 y la «hoja de una cosa» (puro, probado)
    itemsview.js        la pestaña Objetos (items.xml)
shared/js/
  assets.mjs          formato de sprites y cosas: orden de Tibia, banderas, validación
  compuestos.mjs      formato de compuestos: validación, parámetros y expansión
client/jetyum/js/
  assets.js           AssetsProvider: compone cosas a partir de las hojas (juego y editor)
```

### 2.1 Montajes del servidor

| Prefijo | Carpeta | Para qué |
|---|---|---|
| `/jetyum/assets/` | `PATHS.assetsDir` | Sprites y things.json, configurable para que las pruebas usen una copia |
| `/jetyum/` | `client/jetyum` | El código del cliente que reutiliza el editor |
| `/shared/` | `shared` | Los contratos compartidos |
| `/` | `editor` | La propia interfaz |

`tools/check-jetyum-client.js` comprueba que estos montajes cuadran con los imports.

---

## 3. La API

Todas las respuestas son JSON. Un error devuelve `{error, problems[]}` con estado 4xx y **no
escribe nada**.

| Método y ruta | Cuerpo | Hace |
|---|---|---|
| `GET /api/status` | | Recuentos del datapack |
| `GET /api/maps` | | Mapas de `data/world` |
| `GET /api/map?name=` | | El mapa en bruto (`raw`) |
| `POST /api/map` | `{name, edits[], spawns?, npcs?, composites?, waypoints?, towns?, houses?, dryRun?}` | Aplica las casillas tocadas (cada una dice **cómo debe quedar**), y las listas solo si vienen. Valida la ida y vuelta, hace **copia de seguridad** del archivo de antes (`copia` en la respuesta) y escribe |
| `POST /api/maps` | `{nombre, ancho, alto, plantas?, sueloPorDefecto, sueloDeRespaldo?, descripcion?, ciudad?, dryRun?}` | **Nuevo mapa** (201). Ver §3.1 |
| `POST /api/maps/<nombre>/copia` | `{nuevoNombre, edits?, spawns?, …, dryRun?}` | **Guardar como** (201), sin tocar el original |
| `GET /api/maps/<nombre>/propiedades` | | `{propiedades: {nombre, descripcion, ancho, alto, plantas, suelos, sueloDeRespaldo, limites}}` |
| `PUT /api/maps/<nombre>/propiedades` | `{nombre?, descripcion?, ancho?, alto?, plantas?, suelos?, sueloDeRespaldo?, dryRun?}` | Cambia las propiedades; encoger con cosas fuera es 422 |
| `GET /api/maps/<nombre>/copias` | | `{nombre, maximo, copias: [{archivo, fecha, bytes}]}`, la más nueva primero |
| `POST /api/maps/<nombre>/copias/<archivo>/restaurar` | `{dryRun?}` | Vuelve el mapa a esa copia (antes copia el estado actual) |
| `GET /api/monsters`, `GET /api/npcs` | | Lo que se puede colocar |
| `GET/POST/DELETE /api/items` | | Lee y edita `items.xml` |
| `GET /api/assets` | | `things` normalizado e `index` de los sprites |
| `POST /api/assets/things` | `{things, dryRun?}` | Valida y escribe `things.json` |
| `GET /api/assets/check` | | Coherencia con items.xml: `faltan`, `sinDibujo`, `sobran` y `banderas` |
| `POST /api/sprites` | `{sprites: [base64 RGBA 32x32], dedupe?}` | Añade sprites al final y devuelve `ids` (0 para los transparentes) |
| `POST /api/sprites/replace` | `{id, sprite}` | Cambia los píxeles de un sprite |
| `POST /api/sprites/clear` | `{id}` | Deja un sprite transparente (no se renumera) |
| `GET /api/sprites/usage?id=` | | Qué cosas usan un sprite |
| `GET /api/pinceles` | | Pinceles de terreno, muros, alfombras y mesas, validados contra items.xml |
| `GET /api/compuestos` | | Plantillas y atributos conocidos |
| `POST /api/compuestos` | `{data}` | Valida contra items.xml y escribe |

### 3.1 Archivos de mapa: nuevo, guardar como, propiedades y copias

La lógica del disco vive en `editor/lib/mapfiles.js`; el contenido lo siguen validando el cargador
y el escritor del motor, así que un mapa creado, copiado o redimensionado pasa por **la misma ida y
vuelta** que un guardado.

- **Nombres.** `[A-Za-z0-9_-]`, hasta 64 letras, sin los reservados de Windows (`con`, `nul`,
  `lpt1`…). Un nombre que ya existe **sin mirar mayúsculas** es 409: nada pisa un mapa existente
  (el archivo nuevo se crea con un enlace exclusivo, no con `rename`).
- **Nuevo mapa.** Ancho y alto de 16 a 4096, plantas de 8 a 16 (16 por defecto). El suelo tiene que
  existir en items.xml, ser suelo (`isGround`) y, el de la superficie, poder pisarse. El mapa lleva
  el suelo de la planta 7, una ciudad (`ciudad`, por defecto el nombre) con su templo en el centro y
  el waypoint `temple` en el mismo sitio, y ninguna casilla escrita. 400 nombre o tamaño, 409 ya
  existe, 422 suelo.
- **Guardar como.** Sin cambios en el cuerpo, copia el archivo guardado; con los campos de
  `POST /api/map`, los aplica **solo a la copia**, por el mismo camino y con la misma validación.
- **Propiedades.** Solo se manda lo que cambia. `suelos` es parcial (`{"8": 104}` pone,
  `{"8": null}` quita). La descripción se guarda en la clave de documentación `_descripcion`.
  **Encoger nunca borra**: si quedaría fuera alguna casilla escrita, respawn, monstruo, NPC,
  waypoint, templo, salida de casa, compuesto o suelo de planta, responde 422 con `problems`
  (ejemplos) y `fuera` (cuántos de cada clase) y no toca nada. Cambiar un suelo por defecto solo
  cambia el terreno sin pintar: las casillas escritas conservan el suelo que tenían. Cambiar
  `nombre` renombra el archivo, muda sus copias y avisa (`aviso`) si es el `mapName` de `config.js`.
- **Copias de seguridad.** Antes de sobrescribir un mapa (`POST /api/map`, propiedades, restaurar)
  se copia el archivo de antes a `data/world/backups/<nombre>/<nombre>-<AAAAMMDDTHHMMSSmmmZ>.map.json`
  y se dejan las **10 últimas** (`COPIAS_POR_MAPA`). Un guardado rechazado, en seco o que no cambia
  el texto no gasta copia. La carpeta `backups/` no sale en `GET /api/maps` y está en `.gitignore`.
  Restaurar escribe la copia byte a byte, después de comprobar que carga con los datos de ahora
  (422 si no).
- **En la interfaz**, los cuatro están en la barra del mapa, junto al selector: *Nuevo mapa*,
  *Guardar como*, *Propiedades del mapa* y *Copias de seguridad*. Abren su diálogo en la esquina
  del mapa (el mismo que Buscar o Estadísticas), enseñan ahí el error y los `problems` de un
  rechazo, y al terminar vuelven a pedir la lista de mapas y abren el que toca. Lo que vuelve a
  leer el mapa del disco (propiedades, restaurar, abrir uno nuevo) pregunta antes si hay cambios
  sin guardar; *Guardar como* no, porque se los lleva a la copia.

---

## 4. Flujo de datos

```
     ┌────────── pestaña Sprites ──────────┐        ┌──────────── pestaña Mapa ────────────┐
     │ PNG ─► imagenes.js (cortar 32x32)   │        │ paleta ─► mano ─► EditorMap           │
     │      ─► POST /api/sprites ─► hojas   │        │ compuesto + valores ─► expandir()     │
     │ cosas ─► POST /api/assets/things     │        │   ─► casillas + lista composites      │
     └──────────────┬──────────────────────┘        └──────────────┬───────────────────────┘
                    │ things.json + sprites-NNNN.png                │ *.map.json
                    ▼                                               ▼
     ┌────────────── CLIENTE (AssetsProvider) ─┐       ┌───────────── MOTOR ────────────────┐
     │ compone cosas; respaldo BQ/procedimiento │◄─────│ objetos con atributos; aid/uid       │
     └──────────────────────────────────────────┘ red   └─────────────────────────────────────┘
```

Al guardar sprites o cosas, el editor le pasa las cosas nuevas al proveedor del lienzo del mapa
(`setThings` y `recargarHojas`), así que el mapa se redibuja sin recargar la página.

---

## 5. Pruebas

| Prueba | Qué cubre |
|---|---|
| `tools/test-tools.js` | Escritor de mapas, items.xml, API de mapas, pincel, arrastres, respawns, NPC y la maquetación del panel |
| `tools/test-editor-mapas.mjs` | Nuevo mapa (y que lo carga el motor), guardar como, propiedades (rechazo a encoger), copias de seguridad, poda y restaurar |
| `tools/test-mapa.mjs` | Herramientas de RME: regla de bordes, tablas de muros, puertas, alfombras, mesas, portapapeles, cubo, buscar/reemplazar, casas, ciudades, waypoints, deshacer, forma del pincel, casas y ciudades en el motor, la API y el generador de pinceles |
| `tools/test-assets.mjs` | Orden de los sprites, patrones, animación, validación, PNG, almacén, cortes, migración, assets del repositorio, compuestos (formato, expansión y edición), API de assets y compuestos, y la cascada aid/uid y el teleport del motor |
| `tools/check-jetyum-client.js` | Que el cliente y el editor pueden cargar todos sus módulos con los montajes reales |

Todas trabajan sobre **copias temporales**: ninguna prueba escribe en `data/` ni en
`client/jetyum/assets/`.

---

## 6. Cómo añadir una herramienta

1. Si introduce un formato nuevo, primero se escribe su módulo puro en `shared/js/`, con su
   validación (acumulando **todos** los problemas) y su serializador legible en un diff.
2. Después, los endpoints en `editor/server.js`, que validan con ese módulo y escriben de forma
   atómica con una ruta configurable en `PATHS` (para las pruebas).
3. El panel va en `editor/index.html` y su módulo en `editor/js/`. La lógica que se pueda
   probar sin navegador va en un módulo aparte.
4. Las pruebas van en `tools/` y se añaden a `npm test`.
5. Por último, se documenta en `docs/`.
