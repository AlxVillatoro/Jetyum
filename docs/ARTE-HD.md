# Arte HD: cómo generarlo y cómo meterlo en el juego

El juego dibuja el mundo en una cuadrícula de casillas. El arte original (el OpenTibia Sprite Pack)
es de **32×32 píxeles por casilla**. El arte HD es de **64×64 por casilla**: el doble de detalle en
la misma casilla. La lógica del juego no cambia (la casilla sigue siendo una casilla); sólo el dibujo
gana resolución.

Todo el arte va en **hojas PNG con fondo transparente** dentro de `data/arte-hd/`, con una
**rejilla fija**. `data/arte-hd/manifiesto.json` dice qué hay en cada celda de cada hoja y a qué
objeto, aspecto o efecto del juego corresponde.

```
npm run arte:plantillas   # rehace las hojas PROVISIONALES (el arte del pack, ampliado ×2)
npm run arte:importar     # mete las hojas de data/arte-hd/ en el juego
npm run mundo:aldea       # genera el mapa básico «aldea» con ese arte
```

Las hojas provisionales sirven de **plantilla**: abre una y verás exactamente qué va en cada celda.
Sustituye la hoja por la tuya (mismo nombre, mismo tamaño, misma rejilla), ejecuta
`npm run arte:importar` y reinicia el motor.

---

## 1. Reglas que tiene que cumplir TODO el arte

| Regla | Por qué |
|---|---|
| **64×64 px por casilla**, en múltiplos exactos (64, 128...) | La rejilla se corta a 64 px. Un píxel de más desplaza todo lo que viene detrás |
| **Fondo transparente** (PNG con canal alfa), sin sombras ni brillos fuera de la figura | Lo que no es transparente se ve como un cuadro alrededor |
| **Bordes duros** (pixel art, sin antialias contra el fondo) | Los bordes semitransparentes dejan un halo al dibujarse sobre otro suelo |
| **Perspectiva de Tibia**: vista desde arriba en 3/4 («oblicua»). El suelo se ve plano desde arriba; lo que tiene altura (muros, árboles, personajes) enseña su cara frontal y crece **hacia arriba** | Es la proyección del motor: lo alto se dibuja hacia arriba desde su casilla |
| **Luz desde arriba a la izquierda**, sombras hacia abajo a la derecha | Si cada pieza tiene la luz por un lado, el mapa no encaja |
| **La misma paleta en todo** (unos 48 colores, cálidos, de fantasía medieval) | Es lo que hace que piezas generadas por separado parezcan del mismo juego |
| **Las figuras se apoyan en la parte de abajo de su celda** | El motor alinea cada dibujo por abajo (los pies, la base del árbol) |
| Los suelos **encajan en mosaico** (tileable) por sus cuatro lados | Si no, se ve la cuadrícula |

---

## 2. Las hojas

En todas, **fila 0 arriba, columna 0 a la izquierda**.

### `suelos.png` — 512×256 (8 columnas × 4 filas de 64×64)

| Fila | Columnas |
|---|---|
| 0 | hierba ×4 variantes · tierra ×4 variantes |
| 1 | adoquín ×4 · arena ×2 · suelo de madera ×2 |
| 2 | losa de piedra clara ×2 (templo) · alfombra roja ×2 · agua (4 fotogramas de animación) |
| 3 | hierba alta ×2 · flores sobre hierba ×2 · camino de tierra ×2 · barro ×2 |

### `muros.png` — 512×128 (8 celdas de 64×128)

Cada muro es un **bloque**: los 64 px de abajo son su **cara frontal** (la que mira al sur) y los
64 de arriba, su **parte de arriba** vista desde la cámara. Así un muro ocupa su casilla y tapa un
poco la de detrás, como en Tibia.

| Columna | Pieza |
|---|---|
| 0 | muro de piedra |
| 1 | muro de piedra con ventana |
| 2 | muro de piedra con puerta cerrada |
| 3 | muro de piedra con puerta abierta (se puede pasar) |
| 4 | muro de madera (casas) |
| 5 | muro de madera con ventana |
| 6 | valla de madera (baja: sólo la mitad de abajo) |
| 7 | columna de piedra |

### `objetos.png` — 1024×256 (8 columnas × 2 filas de 128×128)

Cada objeto **se apoya en el cuadrado de 64×64 de abajo a la derecha** de su celda (esa es su
casilla). Lo grande (un árbol) puede crecer hacia arriba y hacia la izquierda, ocupando el resto de
la celda; lo pequeño (un barril) cabe en ese cuadrado.

| Fila | Columnas |
|---|---|
| 0 | árbol grande · pino · arbusto · roca · barril · caja de madera · mesa · silla |
| 1 | cofre · farola (da luz) · cartel · pozo · tocón · macizo de flores · escalera hacia abajo · hoguera (da luz) |

### `inventario.png` — 512×192 (8 columnas × 3 filas de 64×64)

Los objetos que se cogen. **El mismo dibujo es su icono en la mochila y lo que se ve en el suelo**,
centrado y un poco más pequeño que la celda (unos 44 px).

| Fila | Columnas |
|---|---|
| 0 | espada mágica · daga · hacha · maza · arco · bastón · escudo de madera · yelmo de cuero |
| 1 | armadura de cuero · cota de malla · armadura de placas · botas · anillo · mochila · poción de vida · poción de maná |
| 2 | moneda de oro · moneda de platino · moneda de cristal · carne · pan · antorcha · flecha · cuerda |

### `personajes/<nombre>.png` — 384×512 cada uno (3 columnas × 4 filas de 128×128)

Un archivo por personaje o monstruo.

| | Columna 0 | Columna 1 | Columna 2 |
|---|---|---|---|
| Fila 0: **mirando al norte** (de espaldas) | quieto | paso izquierdo | paso derecho |
| Fila 1: **mirando al este** (perfil, hacia la derecha) | quieto | paso | paso |
| Fila 2: **mirando al sur** (de frente) | quieto | paso | paso |
| Fila 3: **mirando al oeste** (perfil, hacia la izquierda) | quieto | paso | paso |

Cada celda son **2×2 casillas**: la casilla donde está la criatura es el cuarto de **abajo a la
derecha** (64×64), y lo que no cabe en ella crece hacia arriba y hacia la izquierda, como en Tibia.
Un humano mide unos 90 px de alto (casilla y media), con los pies unos
16 px por encima del borde de abajo y 16 px a la izquierda del derecho (el desplazamiento de 8,8
de los aspectos del pack, ya metido en el dibujo). Así un aspecto HD y uno del pack se ven **igual
de grandes y en el mismo sitio** de su casilla. Los mismos colores y la misma ropa en las 12 celdas.

Las plantillas provisionales son el dibujo del pack al doble (Scale2x), sin encoger ni centrar.

Personajes: `caballero`, `paladin`, `hechicero`, `druida` (jugadores, uno por vocación),
`aldeano`, `comerciante`, `sacerdote` (NPC) y `rata`, `lobo`, `goblin`, `esqueleto` (monstruos).

### `cadaveres.png` — 256×64 (4 celdas de 64×64)

rata muerta · lobo muerto · goblin muerto · montón de huesos. Tumbados en el suelo, vistos desde arriba,
y anclados abajo a la derecha de la celda como cualquier objeto.

### `efectos.png` — 320×512 (5 columnas × 8 filas de 64×64)

Cada fila es una animación de **5 fotogramas** que empieza pequeña, crece y se desvanece. Cada
celda es la casilla del efecto: se dibuja **en el mismo sitio que el efecto de 32 px** al que
sustituye (anclado abajo a la derecha, sin centrar ni reescalar), así que un golpe cae donde caía.

| Fila | Efecto |
|---|---|
| 0 | sangre (golpe que hace daño) |
| 1 | chispas amarillas (golpe parado por la armadura) |
| 2 | destello azul (curar, magia) |
| 3 | nube de humo rosa (algo que falla) |
| 4 | llamarada (fuego) |
| 5 | rayos azules (energía) |
| 6 | cristales de hielo |
| 7 | burbujas verdes (veneno) |

---

## 3. Los prompts

Los generadores de imágenes no respetan bien una rejilla de muchas celdas. Lo que mejor funciona es
**generar pieza a pieza** (o fila a fila) con el mismo prompt de estilo y montar la hoja después
(con cualquier editor: Aseprite, LibreSprite, Photopea). Para los personajes, las herramientas
pensadas para sprites (PixelLab, Retro Diffusion, Scenario...) generan las cuatro direcciones de un
mismo personaje con coherencia; un generador general (Midjourney, DALL·E, Stable Diffusion) suele
cambiar detalles entre direcciones y hay que retocarlo.

### Estilo común (va delante de TODOS los prompts)

```
High-quality hand-crafted pixel art for a classic 2D MMORPG in the style of Tibia,
oblique top-down 3/4 view (ground seen from above, objects show their front face and grow upward),
64x64 pixels per tile, crisp hard pixel edges, no anti-aliasing against the background,
transparent background, consistent light source from the top-left with soft shadows toward the
bottom-right, warm medieval fantasy palette of about 48 colors, rich but readable detail,
no text, no watermark, no border, no drop shadow outside the sprite.
```

### Suelos

```
[ESTILO COMÚN] A single seamless tileable ground texture, exactly 64x64 pixels, viewed straight
from above, {lush green grass with small blades and subtle color variation | packed brown dirt
with pebbles | grey cobblestone street | pale sandstone floor tiles of a temple | wooden plank floor
| clear blue water with small ripples, frame N of a 4-frame loop}. Must tile perfectly on all four
sides, no objects, no vignette.
```

### Muros (bloque de 64×128)

```
[ESTILO COMÚN] A single wall block sprite, 64 pixels wide and 128 pixels tall, transparent background.
The bottom 64x64 is the front face of a {grey stone wall | stone wall with a small arched window |
stone wall with a closed wooden door | wooden house wall}, the top 64x64 is the top of the wall seen
from above at a 3/4 angle. The block must connect seamlessly with identical blocks to its left and right.
```

### Objetos (celda de 128×128, apoyado abajo a la derecha)

```
[ESTILO COMÚN] A single {large oak tree | pine tree | round bush | grey boulder | wooden barrel |
wooden crate | wooden table | wooden chair | treasure chest | iron street lamp with a warm glow |
wooden signpost | stone well | tree stump | flower bed | stone stairs going down into a hole |
campfire} sprite on a 128x128 transparent canvas. Its base stands inside the bottom-right 64x64
square of the canvas; tall parts grow upward (and to the left if needed). Oblique 3/4 view.
```

### Objetos de inventario (64×64)

```
[ESTILO COMÚN] A single item icon, {a magic sword with a glowing blue blade | a short dagger |
a woodcutter's axe | a spiked mace | a wooden longbow | a wizard's staff | a round wooden shield |
a leather helmet | leather armor | chain mail armor | steel plate armor | leather boots | a golden
ring | a leather backpack | a red health potion in a round flask | a blue mana potion in a round
flask | a gold coin | a platinum coin | a cyan crystal coin | a piece of roasted meat | a loaf of
bread | a lit torch | an arrow | a coil of rope}, centered on a 64x64 transparent canvas, about 44
pixels tall, lying diagonally as if on the floor, readable silhouette.
```

### Personajes (384×512: 4 direcciones × 3 fotogramas)

```
[ESTILO COMÚN] A character sprite sheet on a transparent background, 3 columns x 4 rows of 128x128
cells (384x512 total). Rows: facing north (back view), facing east (right profile), facing south
(front view), facing west (left profile). Columns: standing idle, walking left foot forward,
walking right foot forward. Each cell is 2x2 tiles of 64x64; the character stands on the bottom-right
64x64 tile, about 90 pixels tall, feet 16 pixels above the bottom edge and centered about 24 pixels
from the right edge, overflowing up and to the left; identical outfit and colors in every cell.
Character: {a knight in steel armor with a red cape and a sword |
a paladin in green leather with a bow and quiver | a sorcerer in a dark blue robe and pointed hat |
a druid in a brown hooded robe with a wooden staff | a villager in a simple tunic |
a merchant with an apron and a coin pouch | a temple priest in white robes |
a large brown rat | a grey wolf | a green goblin with a club | an undead skeleton warrior}.
```

### Cadáveres

```
[ESTILO COMÚN] A single dead {rat | wolf | goblin} lying on the ground, seen from above in 3/4 view,
or a small pile of bones, centered on a 64x64 transparent canvas, no blood pool larger than the sprite.
```

### Efectos (fila de 5 fotogramas de 64×64)

```
[ESTILO COMÚN] A 5-frame animation strip, 320x64 pixels (five 64x64 frames left to right) on a
transparent background: {a splash of red blood | a ring of yellow sparks | a burst of blue magic
light | a puff of pink smoke | a burst of orange flames | crackling blue lightning | sharp ice
crystals | green poison bubbles}. Frame 1 small, frames 2-3 at full size, frames 4-5 fading out.
Centered in each frame.
```

---

## 4. Qué hace el importador

`tools/importar-arte-hd.mjs` lee `data/arte-hd/manifiesto.json` y cada hoja:

- corta cada celda en trozos de 32×32 (el formato del almacén de sprites) y los guarda (los iguales
  se reutilizan: importar dos veces no duplica nada);
- crea o actualiza su **cosa** en `client/jetyum/assets/things.json` con la marca `hd: true`
  (el cliente la dibuja a media escala: 64 px de dibujo en una casilla);
- lo que el manifiesto dice que **sustituye** a algo que ya existe (la espada, las pociones, la rata,
  la sangre...) cambia sólo de dibujo: su lógica (items.xml, monstruos, tiendas, botín) es la misma;
- lo nuevo (suelos, muros y objetos del mapa) se escribe en `data/items/items.xml`, entre las marcas
  `ARTE-HD:inicio` y `ARTE-HD:fin`, con sus atributos (pisable, bloquea, luz...).

Si una hoja no está, se salta (se queda el dibujo que hubiera). Así se puede ir sustituyendo el arte
poco a poco.

---

## 5. Qué sustituye cada pieza

| Hoja | Qué es en el juego |
|---|---|
| `suelos.png`, `muros.png`, `objetos.png` | Cosas **nuevas** (ids 20001-20216), las del mapa de la aldea |
| `inventario.png` | El dibujo de las armas, armaduras, pociones, monedas... que ya existen (2400-2417, 2376, 3031, 2152, 2160, la flecha y la cuerda) |
| `cadaveres.png` | Los cuerpos de la rata (20301), el lobo (20302) y el esqueleto (20304), y el del goblin (12234) |
| `efectos.png` | Los efectos 101 (sangre), 104 (chispas), 102 (magia azul), 103 (humo), 111 (fuego), 107 (energía), 115 (hielo) y 110 (veneno) |
| `personajes/caballero.png`, `paladin.png`, `hechicero.png`, `druida.png` | Los aspectos de jugador 131 (Knight), 129 (Hunter), 130 (Mage) y 136 (Druid, el de inicio) |
| `personajes/aldeano.png`, `comerciante.png`, `sacerdote.png` | El Pescador (316), el Tendero (320) y el Sanador (315) |
| `personajes/rata.png`, `lobo.png`, `goblin.png`, `esqueleto.png` | Los monstruos Rat (21), Wolf (27), Goblin (307) y Skeleton (33) |

Los personajes HD no llevan máscara de colores: los cuatro colores del aspecto no cambian su dibujo.

## 6. El mapa de la aldea

`npm run mundo:aldea` genera `data/world/aldea.map.json` (48×40, `tools/generar-aldea-hd.mjs`):
el templo de piedra (donde se aparece, zona protegida, con el Sanador), la plaza de adoquín con el
pozo, la tienda de madera (el Tendero), el lago con el Pescador, el campamento goblin con su hoguera,
el bosque de los lobos, el camposanto de los esqueletos y las ratas al sur. Las farolas y la hoguera
**dan luz de noche**.

Para jugar en él: `npm run serve:aldea` (o `mapName: 'aldea'` en `config.js`). Lugares para `/ir`:
`templo`, `plaza`, `tienda`, `lago`, `campamento`, `bosque`, `camposanto`.

## 7. Cómo lo dibuja el cliente

- El lienzo del mundo se pinta a **doble resolución** (`resolucion: 2` del renderer): el arte de 32 px
  se ve igual y el de 64 con todo su detalle.
- Una cosa con la marca **`hd`** se pinta a media escala (64 px de dibujo en una casilla) y se ancla
  igual que las demás: por abajo a la derecha.
- Los objetos con **`light`** (farolas, hogueras, antorchas) abren su círculo en la oscuridad de la noche.
