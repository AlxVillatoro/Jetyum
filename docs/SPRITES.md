# Sprites y cosas: el formato de 32×32

Esta es la especificación de los assets gráficos del proyecto: qué archivos hay, cómo se
numeran los sprites y en qué orden se guardan. Es el equivalente a los `Tibia.spr` y
`Tibia.dat` de un servidor de Tibia, y sigue sus reglas para que un objeto hecho en
[ObjectBuilder](https://github.com/ottools/ObjectBuilder) se pueda pasar aquí sin reordenar nada.

La versión ejecutable de este documento es [`shared/js/assets.mjs`](../shared/js/assets.mjs). Si
este documento y el código no coinciden, manda el código. Las pruebas de
`tools/test-assets.mjs` comprueban el código.

---

## 1. Las dos piezas

| Pieza | Archivo | Equivalente en Tibia | Qué contiene |
|---|---|---|---|
| **Sprites** | `client/jetyum/assets/sprites/sprites-NNNN.png` + `index.json` | `Tibia.spr` | Imágenes de **32×32** numeradas desde el 1. No saben a qué objeto pertenecen. |
| **Cosas** | `client/jetyum/assets/things.json` | `Tibia.dat` | Cada objeto, aspecto, efecto y proyectil: tamaño, capas, patrones, fotogramas, banderas y la **lista ordenada** de sprites que lo forman. |

Un sprite es una pieza suelta. Una cosa es un objeto montado con piezas. Varias cosas pueden
compartir piezas: los diez aspectos de jugador migrados reutilizan los mismos dibujos de
armadura, y el disco solo los guarda una vez.

### 1.1 Los sprites

- **Tamaño fijo de 32×32 píxeles**, RGBA. No es configurable: es el contrato.
- **Numeración desde el 1.** El **0** significa «transparente» y no ocupa sitio.
- **Hojas de 32×32 sprites** (PNG de 1024×1024). La hoja `sprites-0000.png` lleva los sprites
  1 a 1024, la `sprites-0001.png` del 1025 al 2048, y así sucesivamente. Dentro de una hoja se
  cuenta de izquierda a derecha y de arriba abajo:

  ```
  hoja    = floor((id - 1) / 1024)
  columna = (id - 1) % 1024 % 32        x = columna * 32
  fila    = floor((id - 1) % 1024 / 32) y = fila * 32
  ```

- **Solo se añaden sprites, nunca se renumeran.** Un sprite nuevo recibe el siguiente número
  libre. «Vaciar» un sprite lo deja transparente pero conserva su número. Así ninguna cosa
  cambia de dibujo porque otra se haya borrado.
- **No hay sprites duplicados.** Al importar, un sprite con los mismos píxeles que otro ya
  guardado devuelve el número del existente.
- `index.json` lleva el formato (`jetyum-sprites`), el tamaño, cuántos sprites hay y la
  lista de hojas. El cliente lo lee primero para saber qué hojas pedir.

### 1.2 Las cosas

`things.json` tiene cuatro listas. Cada una tiene su propia numeración, como en Tibia:

| Categoría | Clave | Primer id | Qué es | Lo pide el motor como |
|---|---|---|---|---|
| Objetos | `items` | **100** | Suelos, muros, muebles, equipo… | el id de `items.xml` |
| Aspectos | `outfits` | 1 | Jugadores, monstruos, NPC | el `lookType` |
| Efectos | `effects` | 1 | Magias, golpes, brillos | número de efecto |
| Proyectiles | `missiles` | 1 | Flechas, bolas de fuego | número de proyectil |

**Id de cliente = id de servidor.** En Tibia, `items.otb` traduce el id del servidor (el de
`items.xml`) al id del cliente (el del `.dat`). Aquí los dos archivos son nuestros, así que se
usa el mismo número y la traducción no existe. El objeto 1387 de `items.xml` se dibuja con la
cosa 1387 de `things.json`.

Una cosa se escribe así:

```json
{"id":1387,"name":"teleport","width":1,"height":1,"exactSize":32,"layers":1,
 "patternX":1,"patternY":1,"patternZ":1,"frames":4,
 "animation":{"mode":"async","loop":0,"start":0,"durations":[[150,150],[150,150],[150,150],[150,150]]},
 "flags":{"animateAlways":true},"sprites":[201,202,203,204]}
```

El archivo lleva **una cosa por línea** a propósito. Así el diff de un cambio dice «cambió la
cosa 1387» en vez de cien líneas de JSON indentado.

---

## 2. El orden: la fórmula de Tibia

Las dimensiones de una cosa son:

| Campo | Rango | Significado |
|---|---|---|
| `width` | 1–8 | Casillas de ancho. Crece **hacia la izquierda** desde el ancla. |
| `height` | 1–8 | Casillas de alto. Crece **hacia arriba** desde el ancla. |
| `exactSize` | 32–256 | Lado del dibujo en la interfaz (inventario). |
| `layers` | 1–4 | Capas. En un aspecto: 0 = dibujo, 1 = máscara de colores. |
| `patternX` | 1–8 | Aspectos: dirección. Objetos: posición x, o cantidad. |
| `patternY` | 1–8 | Aspectos: añadidos. Objetos: posición y, o cantidad. |
| `patternZ` | 1–4 | Aspectos: montura. Objetos: posición z. |
| `frames` | 1–64 | Fotogramas de animación. |

La lista `sprites` tiene exactamente `width × height × layers × patternX × patternY × patternZ
× frames` entradas. La posición de cada pieza en la lista es **la misma que en OTClient**
(`ThingType::getSpriteIndex`):

```
indice = ((((((fotograma * patternZ + z) * patternY + y) * patternX + x) * layers + capa) * height + h) * width + w)
```

Dicho de otro modo, el que cambia más rápido es `w`, luego `h`, luego la capa, luego los
patrones X, Y y Z, y el último es el fotograma.

### 2.1 El ancla

La pieza `w = 0, h = 0` es la **casilla del ancla**, la de abajo a la derecha. Es la casilla en
la que «está» el objeto en el mapa. Un árbol de 2×3 se pone pinchando donde va su tronco y
sobresale dos casillas hacia arriba y una hacia la izquierda. Eso es lo que hace que un objeto
grande tape lo que tiene detrás: el efecto 2.5D.

```
 w=1,h=2 │ w=0,h=2
 ────────┼────────
 w=1,h=1 │ w=0,h=1
 ────────┼────────
 w=1,h=0 │ w=0,h=0  ← ancla: la casilla del mapa
```

En la pestaña Sprites el ancla aparece con borde discontinuo en las piezas y con borde azul en
la vista previa.

### 2.2 Qué patrón toca

| Cosa | Patrón X | Patrón Y | Patrón Z | Fotograma |
|---|---|---|---|---|
| **Aspecto** | dirección: 0 norte, 1 este, 2 sur, 3 oeste | 0 cuerpo; 1 y 2 añadidos, que se dibujan **encima** según el bitmask `addons` | montura | 0 quieto; de 1 a n andando |
| **Objeto apilable** con 4×2 patrones | cantidad: 1, 2, 3, 4, 5, 6–9, 10–24, 25–49 y 50+ dan los dibujos 0 a 7 (`x = i % 4`, `y = i / 4`) | | | animación |
| **Otro objeto** (suelos, muros) | `x % patternX` | `y % patternY` | `z % patternZ` | animación |

Repetir el patrón según la posición es lo que evita que un prado de hierba con 2×2 variantes
parezca un mosaico.

### 2.3 Los colores de un aspecto

Un aspecto con `layers = 2` lleva en la capa 1 una **máscara**. Cada color de la máscara marca
una parte del cuerpo:

- amarillo: cabeza
- rojo: cuerpo
- verde: piernas
- azul: pies

El cliente multiplica cada píxel del dibujo por el color de la paleta que el motor manda para
esa parte (`head`, `body`, `legs` y `feet`, índices de 0 a 132). Es el `overwriteMask` de
OTClient. Así un mismo dibujo vale para todas las combinaciones de colores.

### 2.4 La animación

Si una cosa tiene más de un fotograma, `animation.durations` da un par `[mín, máx]` de
milisegundos por fotograma. El cliente usa el mínimo, para que dos pantallas vean el mismo
fotograma con el mismo reloj. `mode` puede valer:

- `sync`: todas las copias van a la vez.
- `async`: cada una lleva un desfase según su posición, así dos antorchas no parpadean
  juntas.

---

## 3. Las banderas

Son las del `.dat` 8.60 con los nombres de ObjectBuilder. La lista completa, con la ayuda de
cada una, está en `FLAGS` de `shared/js/assets.mjs` y en el formulario de la pestaña Sprites.
Algunas llevan valor:

| Bandera | Valor | Equivalente en `items.xml` (servidor) |
|---|---|---|
| `ground` | `{speed}` | `isGround` |
| `onBottom` / `onTop` | — | `onBottom` / `alwaysOnTop` |
| `notWalkable` | — | `blocksSolid` |
| `blockProjectile` | — | `blocksProjectile` |
| `notPathable` | — | `blocksPathfind` |
| `pickupable`, `stackable`, `container` | — | `pickupable`, `stackable`, `isContainer` |
| `forceUse` / `multiUse` | — | `useable` |
| `light` | `{level, color}` | — |
| `offset` | `{x, y}` | — (desplazamiento del dibujo: positivo hacia arriba y a la izquierda) |
| `elevation` | número | — (lo de encima se dibuja más arriba, con un tope de 24) |
| `minimap`, `lensHelp`, `cloth` | número | — |
| `writable`, `writableOnce` | `{maxLength}` | — |

**El cliente y el servidor tienen que coincidir.** En Tibia lo garantiza `items.otb`, que se
genera a partir del `.dat`. Aquí son dos archivos que escriben personas. Por eso **«Comprobar
coherencia»**, en la pestaña Sprites, y la prueba `tools/test-assets.mjs` comparan las banderas
de la tabla con las de `items.xml`. También avisan de los objetos de `items.xml` que no tienen
cosa y de los que la tienen pero sin dibujo.

---

## 4. El flujo de trabajo (pestaña Sprites)

`npm run editor` y luego la pestaña **Sprites**. Tiene tres zonas:

1. **Las cosas.** Se elige la categoría, se filtra y se elige una cosa. Desde aquí se crean
   cosas nuevas (con el primer id libre), se duplican y se borran.
2. **El taller.** Contiene la vista previa animada (con dirección, añadidos, capa, fotograma,
   colores y zoom), las **piezas de 32×32** del patrón y fotograma elegidos, y la
   **biblioteca de sprites**.
3. **Las propiedades.** Nombre, id, dimensiones, animación y banderas.

Lo que se hace en cada zona:

- **Dibujar una pieza.** Se elige la pieza en «Piezas» y se pincha un sprite de la biblioteca
  (o se arrastra encima). Con el botón derecho la pieza se vacía.
- **Importar sprites sueltos.** «Importar PNG» corta una imagen de cualquier tamaño (lo normal,
  un múltiplo de 32; si no lo es, avisa y completa el borde con transparente) en trozos de 32×32,
  de izquierda a derecha y de arriba abajo, y los añade al final de la biblioteca. Los
  transparentes y los repetidos no se añaden. Se suben por tandas de 200, así que una hoja de
  miles de sprites cabe sin problema.
- **Fondo magenta.** Con «magenta = transparente» (marcado por defecto), el `#FF00FF` del fondo se
  vuelve transparente al importar, como en ObjectBuilder. Admite un margen para imágenes que han
  pasado por JPEG o WebP, y limpia el contorno teñido de magenta que esos formatos dejan alrededor
  de cada dibujo (solo el contorno: lo morado del interior se respeta). Para no perder nada,
  importa siempre el PNG original.
- **Importar una cosa entera.** «Importar hoja de la cosa» rellena todos los patrones y
  fotogramas de una vez a partir de una imagen con esta distribución (es la misma que produce
  «Exportar hoja»):
  - cada **celda** mide `width×32` por `height×32`;
  - cada **columna** es un fotograma;
  - cada **fila** es una combinación de capa, patrón Z, patrón Y y patrón X, en ese orden (la X
    cambia primero). En un aspecto, cuatro filas seguidas son norte, este, sur y oeste.
- **Crear una cosa desde una imagen.** «Nueva desde imagen» crea una cosa del tamaño de la
  imagen (redondeado a casillas) y la corta dentro.
- **Cambiar dimensiones.** Las piezas que siguen existiendo se quedan en su sitio
  (`resizeThing`). Ampliar un objeto de 1×1 a 2×2 no desordena nada.
- **Guardar.** Los sprites se guardan **al momento**, porque solo se añaden y no rompen nada.
  `things.json` se guarda con **«Guardar things.json»** (Ctrl+S). El servidor lo valida entero
  y, si hay un problema, no escribe nada.

Al guardar, el mapa de la pestaña Mapa se redibuja con los dibujos nuevos sin recargar la
página.

### 4.1 Convenciones de orden recomendadas

Son reglas de equipo, no del formato. Sirven para que la biblioteca no se convierta en un
cajón de sastre:

- **Importar por familias.** Una hoja PNG por familia (suelos, muros, muebles, un monstruo):
  así sus sprites quedan contiguos en la biblioteca.
- **Aspectos de jugador en `128+`**, como en Tibia. Los de NPC propios van de `150` a `199` y
  los de monstruo usan su `lookType` de Tibia cuando existe.
- **Objetos con el id de Tibia cuando existe** (`1387` teleport, `1948` palanca, `2160` y
  `3031` monedas), y si no, en la zona de su familia: del 100 al 999 terreno y construcción,
  del 1000 al 1999 decoración y mecanismos, del 2000 al 2999 equipo y consumibles. Del 5000 en
  adelante están las casillas de la hoja de terreno heredada (`5000 + casilla`).
- **Un nombre en cada cosa**, aunque sea solo para el editor: el filtro busca por nombre.

---

## 5. De dónde salen los assets actuales

- Los objetos, aspectos, efectos y proyectiles del **OpenTibia Sprite Pack**, importados con
  `npm run assets:otsp` (`tools/importar-otsp.mjs`).
- El **arte HD** de `data/arte-hd/`, importado con `npm run arte:importar` (docs/ARTE-HD.md).
- Lo que queda del arte de **BrowserQuest** con el que nació el proyecto (la hoja de terreno,
  objetos 5000-5471; los aspectos 128-137 y algunos de monstruo; el tajo de espada 201-204), ya
  convertido a este formato. El código y las imágenes originales de BrowserQuest ya no están.
- Lo dibujado o retocado con el editor (pestaña Sprites).

**Lo que no tiene dibujo** no se ve en el juego (el juego no tiene respaldo: un dibujo provisional
se veía como rayas al entrar). En el editor sale como un rectángulo de color.

---

## 6. Interoperabilidad

- **Desde ObjectBuilder.** Se exporta la cosa como hoja PNG y se importa con «Importar hoja de
  la cosa» en una cosa con las mismas dimensiones. El orden de las piezas es el mismo.
- **`.dat`/`.spr` de Tibia.** El formato admite su contenido 1:1 (las mismas dimensiones,
  patrones, banderas y orden). El importador binario está pendiente en el roadmap. Recuerda que
  los assets de CipSoft **no** se pueden distribuir con el proyecto (ver
  [CREDITOS.md](CREDITOS.md)).

---

## Importar el OpenTibia Sprite Pack

El [OpenTibia Sprite Pack](https://github.com/peonso/opentibia_sprite_pack) (CC BY 4.0, créditos en
[CREDITOS.md](CREDITOS.md)) trae un cliente completo de Tibia 10.41: `otsp.dat` (las cosas) y
`otsp.spr` (los sprites). `tools/importar-otsp.mjs` los lee como ObjectBuilder, así que cada cosa
llega **entera**, con su tamaño (muros y árboles de 2×2), patrones, animación y banderas, sin tener
que recomponer piezas sueltas cortadas de una hoja PNG.

```bash
git clone --depth 1 https://github.com/peonso/opentibia_sprite_pack /tmp/otsp
npm run assets:otsp          # = node tools/importar-otsp.mjs --pack /tmp/otsp
npm run mundo:otsp           # pinceles, compuestos y el mapa jetyum
```

Para no chocar con lo que ya existía, los identificadores se desplazan:

| Categoría | En el pack | Aquí |
|---|---|---|
| Objetos | 100–2712 | **10100–12712** |
| Aspectos | 1–46 | **301–346** |
| Efectos | 1–64 | **101–164** |
| Proyectiles | 1–60 | **101–160** |

Las fichas de servidor (`items.xml`) se generan en un bloque marcado con `OTSP:inicio` y
`OTSP:fin`, con los nombres del `items.xml` del pack y las banderas sacadas del `.dat`. Todo es
idempotente: los sprites se deduplican (los que ya estaban, por ejemplo los cortados a mano de las
hojas PNG del pack, se reutilizan) y volver a importar sustituye lo del pack sin tocar lo demás.

