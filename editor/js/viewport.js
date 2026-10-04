/**
 * La vista del mapa: a qué escala se dibuja y dónde queda encuadrado.
 *
 * AQUÍ NO SE TOCA EL DOM Y NO SE IMPORTA NADA, y es a propósito. Lo que se puede
 * equivocar de verdad al añadir un "ver todo" y un zoom no es el botón: es la
 * aritmética, y la aritmética se puede comprobar sin abrir un navegador.
 *
 * LA CUENTA QUE HAY QUE ENTENDER, porque es la que decide todo lo demás: el mapa de
 * ejemplo mide 64x64 casillas y el de la ciudad 128x128, y a 32 píxeles por casilla
 * son 2.048 y 4.096 píxeles de ancho. En una ventana de 1.400 no caben, así que "ver
 * todo" no es una decisión de estilo: es REDUCIR la escala hasta que quepa. Lo que no
 * vale es dejar el mapa recortado y llamarlo "ver todo".
 *
 * Las dos escalas de este archivo son la de ajuste —la que hace que el mapa entero
 * quepa— y la del zoom, que es la que elige quien edita. La primera la calcula
 * `escalaDeAjuste` y la segunda sale de la lista de abajo.
 */

/**
 * Las escalas por las que pasa el zoom con los botones, la rueda y las teclas.
 *
 * Son pasos FIJOS y no un factor multiplicativo porque así el mismo número de clics
 * lleva siempre a las mismas escalas: con `* 1.2` se acaba en 87,3 % y nadie sabe si
 * está al 100 % o no. Los valores bajos existen por los mapas grandes: el de la ciudad
 * necesita un 14 % escaso para caber entero.
 */
export const ESCALAS = [
    0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.33,
    0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4
];

export const ESCALA_MINIMA = ESCALAS[0];
export const ESCALA_MAXIMA = ESCALAS[ESCALAS.length - 1];

/** La escala de la vista normal: un píxel del sprite por píxel de pantalla. */
export const ESCALA_NORMAL = 1;

/**
 * Margen que se deja alrededor del mapa en "ver todo", en píxeles.
 *
 * Sin margen, el borde del mapa cae justo en el borde de la ventana y la última
 * casilla parece cortada, que es exactamente la impresión que este botón viene a
 * quitar.
 */
export const MARGEN_AJUSTE = 12;

/**
 * Deja una escala dentro de lo que se puede dibujar.
 *
 * Un cero o un `NaN` aquí significa un lienzo en blanco y un mapa que parece perdido,
 * así que se cae a la escala normal en vez de propagar el valor roto.
 */
export function limitarEscala(escala) {
    const valor = Number(escala);

    if (!Number.isFinite(valor) || valor <= 0) {
        return ESCALA_NORMAL;
    }

    return Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, valor));
}

/**
 * La escala siguiente de la lista, en una dirección.
 *
 * Cuando la escala actual NO está en la lista —la de "ver todo" sale de una división y
 * casi nunca lo está— se toma la primera que quede por encima (o por debajo). Así el
 * primer clic desde el mapa ajustado no da un salto raro, que es lo que pasaría si se
 * buscara el índice exacto y no se encontrara.
 *
 * @param {number} actual
 * @param {number} direccion positiva acerca, negativa aleja
 */
export function siguienteEscala(actual, direccion) {
    const escala = limitarEscala(actual);

    if (direccion > 0) {
        for (let index = 0; index < ESCALAS.length; index += 1) {
            if (ESCALAS[index] > escala) {
                return ESCALAS[index];
            }
        }
        return ESCALA_MAXIMA;
    }

    for (let index = ESCALAS.length - 1; index >= 0; index -= 1) {
        if (ESCALAS[index] < escala) {
            return ESCALAS[index];
        }
    }

    return ESCALA_MINIMA;
}

/**
 * La escala a la que el mapa ENTERO cabe en la ventana.
 *
 * Es el MÍNIMO de las dos proporciones, y ahí está todo el asunto: si se eligiera la
 * del ancho, el mapa se saldría por abajo y seguiría apareciendo recortado, que es el
 * fallo que este número viene a arreglar.
 *
 * Se limita a 1 porque agrandar un mapa pequeño hasta llenar la ventana no es "ver el
 * mapa entero": a 1:1 ya se ve entero y con sus píxeles de verdad, y ampliarlo además
 * mentiría sobre el tamaño del sprite. Y por abajo NO se limita a `ESCALA_MINIMA`: si
 * un mapa enorme pidiera menos que el mínimo del zoom manual, se usa igual, porque el
 * compromiso de este botón es que quepa.
 *
 * @param {number} anchoMapa casillas
 * @param {number} altoMapa casillas
 * @param {number} anchoVista píxeles
 * @param {number} altoVista píxeles
 * @param {number} [ladoCasilla] píxeles de una casilla a escala 1
 * @param {number} [margen] píxeles que se dejan libres alrededor
 */
export function escalaDeAjuste(anchoMapa, altoMapa, anchoVista, altoVista, ladoCasilla, margen) {
    const lado = ladoCasilla || 32;
    const hueco = margen === undefined ? MARGEN_AJUSTE : margen;

    const anchoUtil = anchoVista - hueco * 2;
    const altoUtil = altoVista - hueco * 2;

    if (!(anchoMapa > 0) || !(altoMapa > 0) || !(anchoUtil > 0) || !(altoUtil > 0)) {
        return ESCALA_NORMAL;
    }

    const escala = Math.min(
        1,
        anchoUtil / (anchoMapa * lado),
        altoUtil / (altoMapa * lado));

    // El suelo es 0,002 y no `ESCALA_MINIMA` a propósito: es el valor por debajo del
    // cual un mapa no se vería ni con la ventana entera, y sólo existe para que nunca
    // se devuelva un cero.
    return Math.min(1, Math.max(0.002, escala));
}

/**
 * El centro de la cámara que deja el mapa en medio de la ventana.
 *
 * Es la MITAD del mapa y no "la mitad menos media casilla" porque la cámara centra una
 * coordenada, no una casilla: el mapa va de la coordenada 0 a la `anchoMapa`, y su
 * punto medio es exactamente ése. Se comprueba en la prueba, porque un desplazamiento
 * de media casilla no se ve a simple vista y deja el mapa descentrado para siempre.
 */
export function centroDeMapa(anchoMapa, altoMapa) {
    return { x: anchoMapa / 2, y: altoMapa / 2 };
}

/**
 * El centro de la cámara que deja un punto del mundo bajo el mismo píxel.
 *
 * Es lo que hace que el zoom con la rueda amplíe DONDE ESTÁ EL RATÓN y no hacia el
 * centro de la pantalla, que es lo que espera cualquiera que haya usado un editor de
 * mapas: se apunta a lo que se quiere ver de cerca y se acerca.
 *
 * Despejado de `worldToScreen`: `px = (x + corrimiento - centro) * lado + ancho / 2`.
 *
 * @param {{x: number, y: number}} mundo el punto del mundo que no debe moverse
 * @param {{x: number, y: number}} pantalla su posición en píxeles del lienzo
 * @param {{ancho: number, alto: number}} vista el tamaño del lienzo
 * @param {number} ladoCasilla píxeles de una casilla con la escala NUEVA
 * @param {{x: number, y: number}} [corrimiento] desplazamiento por planta, en casillas
 */
export function centroParaFijarPunto(mundo, pantalla, vista, ladoCasilla, corrimiento) {
    const desplazamientoX = corrimiento ? corrimiento.x : 0;
    const desplazamientoY = corrimiento ? corrimiento.y : 0;

    return {
        x: mundo.x + desplazamientoX - (pantalla.x - vista.ancho / 2) / ladoCasilla,
        y: mundo.y + desplazamientoY - (pantalla.y - vista.alto / 2) / ladoCasilla
    };
}

/**
 * La escala, para enseñarla.
 *
 * Por debajo del 10 % se enseña con un decimal y no redondeando: entre el 3 % y el
 * 4 % hay mapas que caben y mapas que no, y un "3 %" para los dos no dice nada.
 */
export function formatoDeEscala(escala) {
    const valor = Number(escala);

    // Sin `limitarEscala` a propósito: la escala de ajuste puede quedar por debajo del
    // mínimo del zoom manual, y redondearla hacia arriba enseñaría una escala que no
    // es la que se está dibujando.
    const porcentaje = (Number.isFinite(valor) && valor > 0 ? valor : ESCALA_NORMAL) * 100;

    return (porcentaje < 10 ? porcentaje.toFixed(1) : String(Math.round(porcentaje))) + ' %';
}
