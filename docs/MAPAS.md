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
| M | Minimapa |
| T / I / D / H / W | Paletas Terreno / Objetos / Compuestos / Casas / Waypoints |
| `[` `]` | Tamaño del pincel |
| rueda / Ctrl+rueda | Zoom / planta |
| RePág / AvPág | Planta |
| Escape | Soltar lo que se lleva en la mano |

---

## 5. Lo que queda por hacer (roadmap de mapas)

- **Bordes `inner`, `friend`/`enemy` y `specific`** de `grounds.xml`. Hoy cada suelo tiene un
  solo borde exterior.
- **Bordes opcionales** (montañas) y el **thickness** de los doodads (rellenar un área con
  objetos al azar).
- **Puertas con llave, de misión y mágicas** (los tipos de puerta de RME). Antes hacen falta
  sus mecánicas en el motor.
- **Ver plantas superiores e inferiores** en fantasma, y luces.
- **Importar y exportar OTBM.** El formato interno ya tiene todo lo que hace falta: casillas,
  atributos, spawns, NPC, ciudades y casas.

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

