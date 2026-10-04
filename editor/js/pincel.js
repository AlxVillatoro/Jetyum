/**
 * El pincel: cuántas casillas se pintan de una vez y CUÁLES son.
 *
 * AQUÍ NO SE TOCA EL DOM Y NO SE IMPORTA NADA, por el mismo motivo que en `viewport.js`: lo
 * que se puede equivocar de verdad no es el botón de subir el tamaño, es la GEOMETRÍA —de
 * qué casilla cuelga el cuadro y hasta dónde llega—, y la geometría se comprueba sin abrir un
 * navegador. El botón sólo llama a estas funciones.
 *
 * DE DÓNDE CUELGA EL CUADRO, que es la decisión que este archivo toma y hay que explicar:
 * **la casilla bajo el ratón es la ESQUINA de arriba a la izquierda y el cuadro crece hacia
 * abajo y hacia la derecha.** Las otras dos opciones son peores y por eso se descartan:
 *
 *   - CENTRADO: con tamaños pares no hay centro exacto (un 2x2 no tiene casilla central), así
 *     que el cuadro saltaría media casilla al pasar de 1x1 a 2x2 y el ratón dejaría de estar
 *     donde se cree. Un pincel que se mueve solo al cambiar de tamaño es un pincel con el que
 *     se pinta donde no se quiere.
 *   - LA ESQUINA DE ABAJO A LA DERECHA (creciendo hacia arriba-izquierda): el cuadro taparía
 *     lo que ya se ha pintado, que es justo lo que se está mirando al pintar.
 *
 * Con la esquina de arriba a la izquierda el ratón está SIEMPRE en la misma casilla del
 * cuadro, sea el tamaño que sea, así que la referencia no cambia nunca. Y es el mismo criterio
 * que sigue el ratón de cualquier editor de mapas.
 *
 * EL CUADRO NO SE RECORTA AQUÍ. `casillasDelPincel` devuelve la geometría pura —el cuadro
 * entero, aunque se salga del mapa— y quien llama decide qué hacer con lo que cae fuera. Para
 * pintar y para el fantasma se le pasa el filtro del mapa, que es lo mismo que ya hace el
 * editor casilla a casilla (`inBounds`) y así no hay dos reglas de recorte.
 */

/** Un pincel de 1x1 es un pincel de una casilla: el de siempre. */
export const TAMANO_MINIMO = 1;

/**
 * El tope del pincel.
 *
 * Ocho y no más porque un cuadro grande deja de ser un pincel y pasa a ser un relleno: pintar
 * un 16x16 de un clic tapa 256 casillas que hay que deshacer una por una, y este editor no
 * tiene «deshacer». Con 8 el cuadro sigue cabiendo en la pantalla a 1:1 con una ventana normal.
 */
/** Como en RME: hasta 19x19. */
export const TAMANO_MAXIMO = 19;

/** El tamaño con el que se abre el editor: una casilla. */
export const TAMANO_POR_DEFECTO = 1;

/**
 * Deja un tamaño dentro de lo que se puede pintar.
 *
 * Un cero, un negativo o un `NaN` aquí significa «no pintes nada» o «pinta vete a saber qué»,
 * así que se cae al tamaño por defecto en vez de propagar el valor roto. Es la misma decisión
 * que toma `limitarEscala` en `viewport.js`, y por el mismo motivo.
 */
export function limitarTamano(tamano) {
    const valor = Number(tamano);

    if (!Number.isFinite(valor)) {
        return TAMANO_POR_DEFECTO;
    }

    return Math.min(TAMANO_MAXIMO, Math.max(TAMANO_MINIMO, Math.trunc(valor)));
}

/**
 * El tamaño siguiente, en una dirección.
 *
 * SE PARA EN LOS EXTREMOS en vez de dar la vuelta: un «+» en el 8 que volviera al 1 convertiría
 * un clic de más en un pincel diminuto sin que nadie lo esperara, y eso se nota al pintar, no
 * al pulsar.
 *
 * @param {number} actual
 * @param {number} direccion positiva agranda, negativa reduce
 */
export function siguienteTamano(actual, direccion) {
    const tamano = limitarTamano(actual);
    const paso = Number(direccion) < 0 ? -1 : 1;

    return limitarTamano(tamano + paso);
}

/**
 * El tamaño, para enseñarlo: `3x3`, `1x1`.
 *
 * Cuadrado siempre, así que un solo número basta para nombrarlo: decir «3x3» en vez de «3»
 * evita que alguien lea «3 casillas» cuando son nueve.
 */
export function nombreDeTamano(tamano) {
    const lado = limitarTamano(tamano);
    return lado + 'x' + lado;
}

/** Cuántas casillas pinta un tamaño. Se usa para avisar antes de pintar. */
export function cuantasCasillas(tamano) {
    const lado = limitarTamano(tamano);
    let n = 0;
    for (let fila = 0; fila < lado; fila += 1) {
        for (let columna = 0; columna < lado; columna += 1) {
            if (dentroDeLaForma(columna, fila, lado)) {
                n += 1;
            }
        }
    }
    return n;
}

/**
 * Las casillas del cuadro, de arriba a la izquierda a abajo a la derecha.
 *
 * El orden es el de lectura —fila a fila— y no el de dibujo: esto es geometría, y quien pinta
 * no depende del orden porque cada casilla se pinta por su cuenta.
 *
 * @param {number} x la casilla bajo el ratón, que es la esquina de arriba a la izquierda
 * @param {number} y idem
 * @param {number} tamano el lado del cuadro, en casillas
 * @param {Function} [dentro] `(x, y) => boolean`; si se da, se saltan las casillas que no
 *        cumplan. Es el recorte al mapa, y se hace con la misma regla que usa el editor.
 * @returns {Array<{x: number, y: number}>}
 */
/**
 * LA FORMA DEL PINCEL: cuadrado o círculo, como el panel de tamaño de RME. Es del editor, igual
 * que el tamaño, y vale para pintar, borrar y los pinceles de suelo y muro.
 */
let forma = 'cuadrado';

export function ponerForma(nueva) {
    forma = nueva === 'circulo' ? 'circulo' : 'cuadrado';
    return forma;
}

export function formaDelPincel() {
    return forma;
}

/** ¿Entra la casilla (columna, fila) de un bloque de lado `lado` en la forma actual? */
export function dentroDeLaForma(columna, fila, lado) {
    if (forma !== 'circulo' || lado <= 2) {
        return true;
    }
    const centro = (lado - 1) / 2;
    return Math.hypot(columna - centro, fila - centro) <= lado / 2;
}

export function casillasDelPincel(x, y, tamano, dentro) {
    const lado = limitarTamano(tamano);
    const casillas = [];

    for (let fila = 0; fila < lado; fila += 1) {
        for (let columna = 0; columna < lado; columna += 1) {
            const cx = x + columna;
            const cy = y + fila;

            if (!dentroDeLaForma(columna, fila, lado)) {
                continue;
            }
            if (dentro && !dentro(cx, cy)) {
                continue;
            }

            casillas.push({ x: cx, y: cy });
        }
    }

    return casillas;
}
