# Mapas, objetos configurables y objetos compuestos

Este documento explica cómo se describe el mundo y cómo se edita: el archivo de mapa, los
**atributos** que configuran un objeto concreto (como en un mapa de Tibia) y los **objetos
compuestos**, que son objetos enteros de una o varias casillas que se colocan de una vez y se
configuran al colocarlos.

El modelo es el de un servidor de Tibia con su editor de mapas: The Forgotten Server
([downgrade 8.60](https://github.com/Mateuzkl/forgottenserver-downgrade-1.8-8.60)) y Remere's Map
Editor, en concreto [RME-CLIENTID](https://github.com/Mateuzkl/RME-CLIENTID) y
[NexaMap](https://github.com/Mateuzkl/NexaMap-Editor). Las herramientas de RME y su equivalente
aquí están en la [sección 4](#4-las-herramientas-de-rme).

| En Tibia | Aquí |
|---|---|
| `world.otbm` | `data/world/<nombre>.map.json` |
| atributos de objeto en el OTBM (`aid`, `uid`, `text`, `dest`…) | `attributes` del objeto en la casilla |
| `world-spawn.xml` | `spawns` dentro del mapa |
| NPC colocados | `npcs` dentro del mapa |
| doodads de RME (`doodads.xml`) | `data/editor/compuestos.json` + `composites` en el mapa |
| `grounds.xml`, `borders.xml`, `walls.xml` y carpets/tables de RME | `data/editor/pinceles.json` |
| towns del OTBM y `houses.xml` | `towns`, `houses` y el `houseId` de cada casilla, dentro del mapa |
| ids de servidor (`items.otb`) de un `.otbm` | `data/editor/equivalencias-otbm.json` ([§5.1](#51-importar-y-exportar-otbm)) |
| `actions.xml` / `movements.xml` con `actionid=` / `uniqueid=` | módulos JS con `aids: [...]` / `uids: [...]` |

---

## 1. El archivo de mapa

```json
{
    "format": "jetyum-map", "version": 1, "name": "ciudad",
    "width": 256, "height": 256, "floors": 16,
    "defaultGround": { "7": 102 },
    "tiles": [
        { "x": 40, "y": 41, "z": 7, "ground": 104, "items": [113, { "id": 3031, "count": 50 }] },
        { "x": 42, "y": 40, "z": 7, "items": [ { "id": 1387, "attributes": { "teleportDestination": { "x": 60, "y": 60, "z": 8 } } } ] },
        { "x": 12, "y": 12, "z": 7, "flags": ["protectionZone"] }
    ],
    "waypoints": { "temple": [40, 40, 7] },
    "spawns":    [ { "x": 30, "y": 30, "z": 7, "radius": 3, "interval": 60000, "monsters": [ { "name": "Rat" } ] } ],
    "npcs":      [ { "x": 41, "y": 40, "z": 7, "name": "Guia" } ],
    "towns":     [ { "id": 1, "name": "Jetyum", "temple": [40, 40, 7] } ],
    "houses":    [ { "id": 1, "name": "Casa del herrero", "townId": 1, "rent": 500, "exit": [36, 44, 7] } ],
    "composites":[ { "uid": 1, "compuesto": "teleport", "x": 42, "y": 40, "z": 7, "valores": { "destino": { "x": 60, "y": 60, "z": 8 } } } ]
}
```

Sobre las casillas:

- **Solo se escriben las excepciones.** Las casillas que únicamente tienen el suelo por defecto
  de su planta no aparecen. Por eso un mapa de 2048×2048 no ocupa gigabytes.
- **Un suelo por casilla** (`ground`) y una **pila** de objetos (`items`), que se dibuja de
  abajo arriba. Los objetos `alwaysOnTop` se dibujan por encima de las criaturas.
- **Las banderas** son un conjunto: `protectionZone`, `noPvp`, `noLogout`, `pvpZone` y `house`.
- **Las casillas de una casa** llevan su `houseId` (y la bandera `house`). La casa, con su
  ciudad, alquiler y salida, está en `houses`, y las ciudades con su templo en `towns`. El motor
  comprueba que los ids no se repiten, que cada casa es de una ciudad que existe y que los
  templos y salidas caen dentro del mapa.

El motor valida el mapa al cargarlo y **acumula todos los errores con su coordenada**. El editor
comprueba la ida y vuelta (escribir y volver a leer) **antes** de sobrescribir el archivo, así
que un guardado que fallaría nunca deja el mapa a medias.

---

## 2. Objetos configurables: los atributos

Un objeto del mapa puede ser un número (`113`) o un descriptor con cantidad y atributos.
Estos son los atributos que se configuran desde el editor, y son los mismos que admite un
mapa de Tibia:

| Atributo | Tipo | Para qué sirve |
|---|---|---|
| `actionId` | número (100 o más) | Engancha un script de acción o movimiento a **este** objeto (`aid` en TFS). |
| `uniqueId` | número (1000 o más) | Identificador único en todo el mundo (`uid`). Para cofres de misión o puertas especiales. |
| `text` | texto | Lo que está escrito: cartas, carteles, libros. |
| `description` | texto | Se añade a la descripción al mirar el objeto. |
| `teleportDestination` | `{x, y, z}` | A dónde lleva un teleport al pisarlo. |
| `doorId`, `houseId` | número | Puerta y casa a las que pertenece. |
| `depotId` | número | Ciudad del depósito. |
| `charges` | número | Usos que le quedan. |

La lista está en `ATRIBUTOS_CONOCIDOS` (`shared/js/compuestos.mjs`). Un atributo distinto se
conserva igualmente: el formato no los limita.

### 2.1 Cómo los usa el motor

Igual que en TFS, un script puede engancharse por **tipo de objeto**, por **actionId** o por
**uniqueId**. Si coinciden varios, gana el más concreto: primero `uniqueId`, luego `actionId` y
por último el id de objeto.

```js
// data/scripts/actions/puerta_del_sotano.js
module.exports = {
    type: 'action',
    aids: [2001],                  // solo la palanca con actionId 2001, no todas
    onUse(player, item, fromPosition, target, toPosition, isHotkey) {
        player.sendTextMessage('Algo se abre en el sótano.');
        return true;
    }
};
```

El atributo de la instancia se lee con `item.getAttribute('text')`. El teleport
(`data/scripts/movements/tiles/teleport.js`) lee `teleportDestination` y lleva al jugador a
ese destino.

Los objetos del mapa se cargan sin identidad, porque son miles y casi ninguno la necesita. El
que tiene atributos la recibe la primera vez que un script lo necesita (`world.adoptItem`).

### 2.2 Cómo se ponen en el editor

En la pestaña **Mapa**, con la mano vacía, se pincha un objeto. En **«3 · Lo que hay puesto →
El objeto de la casilla»** aparece el formulario de **propiedades**, que es el diálogo
«Properties» de RME. Ahí se ponen la cantidad y los atributos, y se pulsa «Aplicar
propiedades». Un campo vacío **quita** el atributo.

---

## 3. Objetos compuestos

Un **compuesto** es una plantilla de uno o varios objetos repartidos por casillas, con
**parámetros**: una casa, un árbol de 2×3, una habitación con su palanca, un teleport con su
destino, una mesa con monedas…

- **Se coloca entero** con un clic, y lo que se pinta es la plantilla **ya configurada**.
- **Se elige entero.** Con la mano vacía, se pincha cualquiera de sus casillas. Los
  compuestos colocados tienen un contorno amarillo.
- **Se reconfigura, se mueve, se descompone o se borra entero** desde «El objeto compuesto».

### 3.1 Qué guarda el mapa y qué ve el motor

**Al motor solo le llegan objetos con atributos**, igual que a un servidor de Tibia. Al
colocarse, un compuesto se **expande**: sus piezas se escriben en sus casillas como objetos
normales, con los parámetros ya aplicados como atributos. Además, el mapa guarda la lista
`composites` (`uid`, plantilla, ancla y valores). Esa lista es solo para el editor: el motor la
conserva al leer y escribir, pero no la usa.

Gracias a esa lista, el editor puede volver a reconocer el objeto entero. Si alguien quita una
pieza a mano, el resto sigue siendo el compuesto. Al borrarlo, se quitan las piezas que queden.
«Descomponer» olvida el compuesto y deja sus piezas como objetos sueltos.

### 3.2 Las plantillas: `data/editor/compuestos.json`

```json
{
  "id": "teleport", "nombre": "Teleport", "categoria": "Mecanismos",
  "descripcion": "Portal que lleva a quien lo pisa a su destino.",
  "celdas": [
    {"dx":0,"dy":0,"dz":0,"items":[{"id":1387}]}
  ],
  "parametros": [
    {"clave":"destino","etiqueta":"Destino","tipo":"posicion",
     "destinos":[{"celda":0,"item":0,"atributo":"teleportDestination"}]}
  ]
}
```

Las **celdas** van relativas al **ancla**, que es la casilla que se pincha al colocar. Una
celda puede llevar:

- un `suelo`, que sustituye al de la casilla;
- una lista de `items`, que se **apilan encima** de lo que ya haya.

Así una mesa con monedas puesta sobre una alfombra no se lleva la alfombra por delante.
Cuando una plantilla se captura del mapa, su ancla es la casilla de **abajo a la derecha**, la
misma regla de los objetos grandes de Tibia (ver [SPRITES.md](SPRITES.md#21-el-ancla)).

Los **parámetros** son lo que se configura al colocar. Cada uno tiene una `clave`, una
`etiqueta`, un `tipo` y uno o varios `destinos` (celda e índice de objeto dentro de la celda):

| Tipo | Se escribe en | Ejemplo |
|---|---|---|
| `numero` | el `atributo` del destino | actionId de una palanca |
| `texto` | el `atributo` del destino | el texto de un cartel |
| `posicion` | el `atributo` del destino, como `{x,y,z}` | el destino de un teleport |
| `cantidad` | la cantidad del objeto | las monedas de una mesa |
| `objeto` | el **id** del objeto (con `opciones` para limitar cuáles) | moneda de oro o de cristal |

Los parámetros también admiten `defecto`, `min`, `max`, `obligatorio` y `ayuda`. Un parámetro
sin valor y sin valor por defecto **no escribe nada**: un teleport sin destino es decorativo, no
uno que lleva al (0,0,0).

Las plantillas que vienen de serie son:

- Construcciones: «Habitación de piedra 5×5» (con el actionId de su palanca como parámetro),
  «Casa azul» y «Casa roja».
- Mecanismos: «Teleport» (destino) y «Palanca con acción» (actionId y uniqueId).
- Muebles: «Mesa con monedas» (cantidad y tipo de moneda).
- Naturaleza: «Árbol grande».

### 3.3 Flujo de trabajo

1. **Colocar.** En la pestaña **Mapa**, en «4 · La paleta», se pasa a **Compuestos**. Se elige
   uno, se configura en el formulario que aparece debajo y se pincha el mapa. El fantasma
   enseña el objeto entero donde caería (en rojo las casillas que quedan fuera). Escape lo
   suelta.
2. **Editar uno colocado.** Con la mano vacía, se pincha una de sus casillas. En «El objeto
   compuesto» están **Aplicar** (con la configuración nueva), **Mover** (el siguiente clic es
   el ancla nueva), **Descomponer** y **Borrar entero**.
3. **Crear plantillas desde el mapa.** Con la herramienta **Capturar** se marcan dos esquinas
   y se le da un nombre y una categoría. Lo que hay dentro del recuadro pasa a ser una
   plantilla nueva.
4. **Afinar plantillas.** En la pestaña **Compuestos** se pueden editar el nombre, la
   categoría, las celdas (por ejemplo `113, 3031x10, 1948{"actionId":100}`) y los parámetros
   con sus destinos, ver la vista previa y probar la configuración. También hay un editor
   JSON para cambios rápidos. **«Guardar compuestos»** valida la plantilla contra
   `items.xml` antes de escribir.
5. **Guardar el mapa** con «Guardar». Se envían las casillas tocadas y, si han cambiado, la
   lista de compuestos. El servidor rechaza un compuesto cuya plantilla no existe.

---

## 4. Las herramientas de RME

La pestaña Mapa reproduce las herramientas de RME-CLIENTID. La lógica está en módulos puros que
se prueban sin navegador (`tools/test-mapa.mjs`): `editor/js/pinceles.js`,
`editor/js/edicion.js` y `editor/js/historial.js`. La interfaz está en `editor/js/herramientas.js`.

| RME | Aquí | Dónde |
|---|---|---|
| Paleta **Terrain** (ground, wall, carpet, table) | Paleta **Terreno**: suelos con borde, muros, alfombras, mesas, puertas y ventanas | Paleta → Terreno (T) |
| Paleta **Item / RAW** | Paleta **Objetos** (de `items.xml`) | Paleta → Objetos (I) |
| Paleta **Doodad** | Paleta **Compuestos** ([sección 3](#3-objetos-compuestos)) | Paleta → Compuestos (D) |
| Paleta **House** (casillas, salida, propiedades) | Paleta **Casas** | Paleta → Casas (H) |
| **Edit Towns** | Paleta **Ciudades** (nombre y templo) | Paleta → Ciudades |
| Paleta **Waypoint** | Paleta **Waypoints** | Paleta → Waypoints (W) |
| Paleta **Creature** (spawn, criatura, spawntime) | Respawn, Monstruo, NPC | Herramientas |
| Flag brushes (PZ, NoPVP, NoLogout, PvP) | Bandera | Herramientas |
| Eraser (rehace bordes y muros alrededor) | Borrar / clic derecho (con borde automático) | Herramientas |
| Tamaño y forma del pincel (cuadrado/círculo, hasta 19×19) | Pincel 1×1 a 19×19, ■/● | Pie y barra |
| Undo / Redo | Deshacer / Rehacer | Barra (Ctrl+Z, Ctrl+Y) |
| Selección, copiar, cortar, pegar, borrar | Seleccionar, Copiar, Cortar, Pegar, Borrar sel. | Barra (S, Ctrl+C/X/V, Supr) |
| Fill (Ctrl+D) | Rellenar | Barra (Ctrl+D) |
| Border Automagic / Borderize Selection | Borde auto / Borderizar | Barra (A, Ctrl+B) |
| Randomize Selection | Aleatorizar | Barra |
| Find Item / Unique / Action | Buscar (id, actionId, uniqueId, texto) | Barra (Ctrl+F) |
| Replace Items | Reemplazar (en la selección o en todo el mapa) | Barra (Ctrl+Shift+F) |
| Remove Items by ID, Clear Invalid Houses | Limpiar | Barra |
| Go to Position | Ir a… | Barra (Ctrl+G) |
| Statistics | Estadísticas | Barra (F8) |
| Map Diagnostics (NexaMap) | Diagnóstico: teleports rotos, uniqueId repetidos, casillas sin suelo… con un clic para ir | Barra (F7) |
| Selection mode (current / lower / visible floors) | Desplegable junto a «Seleccionar» | Barra |
| Show all floors / Show shade / Ghost higher floors | Plantas de abajo / Sombra / Planta de arriba | Barra (P, Q, Ctrl+L) |
| New map, Save as, Map properties | Nuevo mapa, Guardar como, Propiedades del mapa | Barra, junto al selector de mapa |
| (copias automáticas) | Copias de seguridad: las 10 últimas, con «Restaurar» | Barra, junto al selector de mapa |
| Minimap | Minimapa (clic para ir) | Barra (M) |
| Properties del objeto | Propiedades del objeto | Lo que hay puesto |

### 4.1 Pinceles de suelo: el auto-borde

Cada pincel de suelo tiene una **z**. Cuando dos suelos se tocan, el de **mayor z** pone su
borde en la casilla del de menor z: la hierba (z 30) junto a la tierra (z 20) deja un borde de
hierba en la casilla de tierra. Para cada casilla se miran los 8 vecinos y se eligen las piezas
con la regla de la tabla de 256 entradas de RME (`border_types`):

- **Dos lados contiguos, y solo esos dos**, dan la pieza diagonal: N+O → `dnw`, N+E → `dne`,
  S+O → `dsw`, S+E → `dse`.
- **En cualquier otro caso**, una recta por cada lado: `n`, `e`, `s`, `w`.
- **Una diagonal sin sus dos lados** da una esquina exterior: `cnw`, `cne`, `csw`, `cse`.
- Si al borde le falta la pieza diagonal, se ponen sus dos rectas (`dnw` → `n` + `w`).

Las piezas de borde van **abajo de la pila**, justo encima del suelo, y se rehacen enteras cada
vez. Así pintar, borrar y repintar nunca deja bordes huérfanos. Se rehacen en el área pintada y
en el anillo de alrededor, como hace RME.

### 4.2 Muros

Cada casilla de muro mira sus cuatro vecinos con la máscara de RME (N=1, O=2, E=4, S=8):

1. Primero busca la pieza del **tipo completo**. Hay 16: poste, los cuatro extremos,
   horizontal, vertical, las cuatro diagonales, las cuatro T y el cruce.
2. Si el muro no tiene esa pieza, usa la **tabla media** de Tibia, que solo distingue poste,
   horizontal, vertical y esquina.

La **esquina** de Tibia es la que une hacia el **norte y el oeste**: la de abajo a la derecha de
una habitación. Las puertas y las ventanas se ponen **encima de un muro** y toman su
alineación (horizontal o vertical). Cuentan como muro para sus vecinos.

### 4.3 Alfombras y mesas

- **Alfombra:** se miran los 8 vecinos. Si está rodeada, toca el centro; si no, la pieza del
  lado o de la esquina que da hacia fuera.
- **Mesa:** se miran los 4 vecinos y se da prioridad al eje horizontal, como en RME: horizontal,
  extremos este y oeste, vertical, extremos norte y sur, o sola.

### 4.4 `data/editor/pinceles.json`

```json
{
  "format": "jetyum-pinceles", "version": 1,
  "suelos":  [ { "id": "hierba", "nombre": "Hierba", "z": 30, "items": [ { "id": 102, "chance": 1 } ], "borde": "borde-hierba" } ],
  "bordes":  [ { "id": "borde-hierba", "piezas": { "n": 4500, "e": 4501, "s": 4502, "w": 4503, "cnw": 4504, "...": 0, "dse": 4511 } } ],
  "muros":   [ { "id": "muro-piedra", "nombre": "Muro de piedra",
                 "piezas":   { "poste": 4600, "horizontal": 4601, "vertical": 4602, "esquina": 4603 },
                 "puertas":  { "horizontal": 4604, "vertical": 4605 },
                 "ventanas": { "horizontal": 4606, "vertical": 4607 } } ],
  "alfombras": [ { "id": "alfombra-roja", "piezas": { "centro": 4640, "n": 4641, "...": 0 } } ],
  "mesas":     [ { "id": "mesa-madera", "piezas": { "sola": 4660, "horizontal": 4661, "...": 0 } } ]
}
```

- **Variantes de suelo.** Un suelo puede tener varias, cada una con su `chance`. Al pintar se
  elige una al azar, y «Aleatorizar» las vuelve a tirar.
- **Piezas de muro.** Un muro puede dar todas las de `PIEZAS_DE_MURO` (`fin_norte`, `t_sur`,
  `cruce`…). Las que falten se sustituyen por la tabla media.
- **Arte de demostración.** El que hay ahora (bordes de hierba y tierra, muro de piedra, puertas,
  ventanas, alfombra roja y mesa) lo dibuja `npm run pinceles:generar` a partir de los suelos
  existentes. Para cambiarlo, basta reemplazar sus sprites en la pestaña Sprites: los pinceles
  siguen igual.

### 4.5 Deshacer

El historial funciona **por diferencias**, no por comandos:

- Al terminar cada gesto (soltar el ratón, una tecla, un botón), compara una foto del mapa
  (casillas y listas) con la anterior y apunta lo que cambió, con el texto del estado como
  nombre.
- Así cualquier herramienta, presente o futura, se puede deshacer sin escribir su «deshacer».
- Recuerda 200 acciones y se vacía al abrir otro mapa.

### 4.6 Atajos

| Atajo | Acción |
|---|---|
| Ctrl+Z | Deshacer |
| Ctrl+Y, Ctrl+Shift+Z | Rehacer |
| S | Seleccionar |
| Ctrl+C / Ctrl+X / Ctrl+V | Copiar / cortar / pegar |
| Supr | Borrar la selección |
| Ctrl+B | Borderizar (la selección o lo visible) |
| A | Activar o desactivar el borde automático |
| Ctrl+D | Rellenar |
| Ctrl+F | Buscar |
| Ctrl+Shift+F | Reemplazar |
| Ctrl+G | Ir a posición |
| F8 | Estadísticas |
| F7 | Diagnóstico del mapa |
| P | Ver las plantas de abajo (el Ctrl+W de RME: el navegador no deja quitarle Ctrl+W, que cierra la pestaña) |
| Q | Sombra de las plantas de abajo |
| Ctrl+L | Ver la planta de arriba en fantasma |
| M | Minimapa |
| T / I / D / H / W | Paletas Terreno / Objetos / Compuestos / Casas / Waypoints |
| `[` `]` | Tamaño del pincel |
| rueda / Ctrl+rueda | Zoom / planta |
| RePág / AvPág | Planta |
| Escape | Cancelar el arrastre de la selección a medias; si no hay ninguno, soltar lo que se lleva en la mano |

### 4.7 Varias plantas, selección, diagnóstico y archivos de mapa

- **Las plantas a la vista** (botones de capas a la derecha de la barra). *Plantas de abajo* dibuja
  bajo la que se edita las de debajo, como el juego: al aire libre hasta la 7 —desde la 7 misma no
  hay nada que ver— y bajo tierra dos más. *Sombra* las oscurece, más cuanto más hondas. *Planta
  de arriba* dibuja la de encima, transparente. Sólo se miran: se pinta y se elige siempre en la
  planta del selector. Lo elegido se recuerda en el navegador.
- **La selección** es un conjunto de casillas: Mayús+arrastrar suma, Ctrl+arrastrar resta y
  arrastrar lo seleccionado lo mueve (Escape cancela el gesto). El desplegable de al lado elige
  qué plantas coge el rectángulo: *Planta actual*, *Y las de abajo* o *Plantas visibles*.
- **Diagnóstico** (F7) abre en la esquina del mapa la lista de problemas, con filtros por gravedad
  y por tipo; un clic en una fila va a la casilla (y a su planta). El globito del botón cuenta lo
  del último análisis: se analiza al abrir el mapa, al abrir el panel y con «Volver a analizar».
- **Archivos de mapa**, junto al selector: *Nuevo mapa* (nombre, tamaño, plantas y suelo de la
  superficie), *Guardar como* (los cambios sin guardar van a la copia; el original no se toca),
  *Propiedades del mapa* (nombre, descripción, tamaño, plantas y suelos por defecto; encoger con
  cosas fuera no toca nada y dice qué quedaría fuera) y *Copias de seguridad* (las últimas
  versiones guardadas, la más nueva primero, con «Restaurar»). Lo que reabre el mapa desde el
  disco pregunta antes si hay cambios sin guardar. Los detalles de la API: docs/HERRAMIENTAS.md §3.1.

---

## 5. Lo que queda por hacer (roadmap de mapas)

- **Bordes `inner`, `friend`/`enemy` y `specific`** de `grounds.xml`. Hoy cada suelo tiene un
  solo borde exterior.
- **Bordes opcionales** (montañas) y el **thickness** de los doodads (rellenar un área con
  objetos al azar).
- **Puertas con llave, de misión y mágicas** (los tipos de puerta de RME). Antes hacen falta
  sus mecánicas en el motor.
- **Luces** en la vista del editor (las plantas de abajo y la de arriba en fantasma ya están: §4.7).
- **OTBM:** el contenido de los contenedores (el formato de mapa no lo guarda), las variantes de
  los doodads al importar materiales (un compuesto no sortea) y un `.dat`/`.spr` 8.60 para ver el
  arte original al revisar las equivalencias. Lo demás está hecho: §5.1.

### 5.1 Importar y exportar OTBM

Hecho. OTBM es la FRONTERA (ARQUITECTURA.md §3.6): el motor sigue con su JSON y un `.otbm` se
convierte al entrar y al salir. Sin dependencias: el lector y el escritor son `editor/lib/otbm.js`
(el árbol de nodos `0xFE`/`0xFF` con el escape `0xFD`, OTBM 1 a 4 y el `items.otb`).

```sh
# importar una región (siempre a un archivo NUEVO; sin --salida solo da el informe)
node tools/importar-otbm.mjs ../forserver-downgrade/data/world/world.otbm \
     --items-otb ../forserver-downgrade/data/items/items.otb \
     --items-xml ../forserver-downgrade/data/items/items.xml \
     --area 950,940,1060,1060,5,7 --salida data/world/classic.map.json [--informe]
# (--houses/--spawns: si no se dan, los que nombra el propio .otbm, junto a él)

# regenerar la tabla de equivalencias con los materiales de RME
node tools/importar-otbm.mjs --equivalencias --items-otb … --items-xml … \
     --materiales ../NexaMap-Editor/data/editor/materials.xml

# exportar (con la tabla al revés; deshace el desplazamiento de --area)
node tools/exportar-otbm.mjs data/world/classic.map.json --salida /tmp/classic.otbm

# pinceles y doodads de RME -> data/editor/pinceles-rme.json y compuestos-rme.json
node tools/importar-materiales-rme.mjs ../NexaMap-Editor/data/editor/materials.xml [--fusionar]
```

En el editor, **Importar OTBM…** (junto a *Nuevo mapa*): se suben los archivos (o se escribe su
ruta en el servidor), se elige el área y el nombre, *Analizar* enseña el informe sin escribir e
*Importar y abrir* crea el mapa por el mismo camino que *Nuevo mapa*.

**Lo que se convierte:** casillas con su pila en orden, banderas (PZ, sin PvP, sin logout, zona
PvP) y casa; los atributos `actionId`, `uniqueId`, `text`, `description`, `teleportDestination`,
`depotId`, `doorId` y `charges`; ciudades con su templo; casas de `house.xml` (nombre, ciudad,
alquiler, salida); waypoints; respawns y NPC de `spawn.xml`. Con `--area` la región se lleva al
origen (`--sin-desplazar` para no hacerlo) y el desplazamiento queda en `_otbm.origen`, que la
exportación deshace. Lo que no se puede se quita y va al informe: objetos sin equivalencia
(ordenados por cuántas veces salen), monstruos y NPC que no existen en este datapack, contenidos
de contenedores, waypoints sobre casillas que no se pisan. El mapa resultante se valida con el
cargador del motor antes de escribirse.

**Las equivalencias** (`data/editor/equivalencias-otbm.json`, código en
`editor/lib/equivalencias.js`). Un `.otbm` guarda ids de servidor de Tibia; el catálogo de Jetyum
es el del OpenTibia Sprite Pack, con otros números y nombres genéricos. Cada id se resuelve con la
primera capa que lo casa:

1. `manual` del archivo (manda siempre; `0` = quitar);
2. **pincel**: con los materiales de RME, cada pieza va a la misma pieza del pincel de Jetyum que
   le corresponde (la horizontal del muro de piedra a la horizontal de `otsp-piedra-gris`, la
   esquina `dnw` del borde de hierba a la suya…). La correspondencia de pinceles sale de
   `pinceles` (explícita), de `palabras` (palabras clave del nombre) o del color de minimapa;
3. **funcional**: teleports, depósitos, buzones, escaleras y agujeros (`floorchange`), escaleras
   de mano, sitios de cuerda, campos;
4. **nombre** normalizado igual, con la misma clase (suelo con suelo);
5. **clase**: palabras clave del nombre (`palabras.clases`: «tree», «bush»…) a una clase de
   Jetyum, eligiendo por color de minimapa;
6. **color** (suelos): el suelo de Jetyum de color de minimapa más cercano que bloquee igual;
7. **respaldo** (suelos): `respaldo.suelo`, o `respaldo.sueloQueBloquea` si el de Tibia bloquea.

Los bordes de suelo sin equivalente se quitan a propósito (`omitido`). `automatico` es la tabla
calculada, una entrada por línea (`"4515": [10101, "pincel", "grass"]`), para revisarla; la
reescribe `--equivalencias`, así que las correcciones van en `manual`. Si el archivo se hizo con
otro `items.otb` (su `origen` no coincide), la tabla se recalcula en el momento.

Con el mapa de muestra de TFS 8.60 (564 264 objetos), el ~83 % de los objetos se traduce, el
~15,5 % se quita a propósito (bordes, `void`) y el ~1,5 % queda sin equivalencia. Leer el mapa
entero cuesta ~0,4 s; un área de 41x41, ~50 ms (las zonas de 256x256 de fuera se saltan sin
leerlas); cargar `items.otb` y `items.xml` de Tibia, ~1-2 s.

**Paquetes de pinceles y compuestos.** El editor carga, además de `pinceles.json` y
`compuestos.json`, todo `pinceles-*.json` y `compuestos-*.json` de `data/editor/` (los que escribe
`importar-materiales-rme.mjs`). Son de solo lectura: la pestaña Compuestos edita y guarda solo
`compuestos.json`. Con `--fusionar` se añaden a los propios (prefijo `rme-`, repetible).

Pruebas: `node tools/test-otbm.mjs` y `node tools/test-materiales-rme.mjs` (usan las muestras de
`../forserver-downgrade` y `../NexaMap-Editor`, y se saltan sin ellas).

---

## El mapa «jetyum» y los compuestos del OpenTibia Sprite Pack

`tools/generar-mundo-otsp.mjs` (`npm run mundo:otsp`) construye, **con el código del editor**:

- **Pinceles** `otsp-*` en `data/editor/pinceles.json`: 20 muros (cada uno con su tramo vertical,
  horizontal, poste y esquina de 2×2, y sus puertas, y ventanas cuando el material las tiene) y
  9 suelos, con el borde de la hierba.
- **Compuestos** de las categorías «OTSP · …» en `data/editor/compuestos.json`: por cada muro,
  un tramo horizontal, uno vertical, una esquina y una habitación con puerta; y además casas
  amuebladas, tienda, templo, ruinas, fuente, estanque, macizo de flores, arboleda, huerto,
  rocas, puesto de mercado, campamento, comedor y almacén.
- **El mapa** `data/world/jetyum.map.json` (112×96): el templo (con su ciudad y el punto de
  reaparición), la plaza, cuatro casas alquilables (con sus casillas y su salida), tienda, herrería,
  banco, el parque, y fuera bosque, ruinas, granja, lago y campamento, con 9 respawns, 8 NPC y
  waypoints para `/ir`.

Los muros se pintan con el pincel de muro, que elige cada pieza por sus vecinos. Las puertas y
ventanas se ponen con el «door brush» y los bordes con el auto-borde, así que el resultado es el
mismo que pintándolo a mano. Volver a generar sustituye el mapa: si lo editas en el editor, guarda
tus cambios con otro nombre o deja de usar el generador.

