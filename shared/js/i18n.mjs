/**
 * Los idiomas: español e inglés.
 *
 * EL ESPAÑOL ES EL TEXTO ORIGINAL Y LA CLAVE. Todo el proyecto —el motor, el cliente, el editor,
 * los NPC— está escrito en español, y traducir no cambia eso: un diccionario dice, para cada frase
 * en español, cómo se dice en inglés. Sin entrada, la frase se queda en español, que es un fallo
 * visible y no una pantalla rota. Y en español no se busca nada: el texto ya es el que es.
 *
 * DOS CLASES DE ENTRADA:
 *
 *   - EXACTAS: `'Entrar al mundo': 'Enter the world'`.
 *   - PATRONES, con huecos entre llaves: `'Has recogido {n} {objeto}.': 'You picked up {n}
 *     {objeto}.'`. Son las frases que el código compone pegando trozos —el motor manda
 *     «Has recogido 3 gold coin.» y no la plantilla—, así que el hueco casa con cualquier texto y
 *     lo que casa se pone en el mismo hueco del inglés, que puede ir en otro orden. Lo que cae en
 *     un hueco también se traduce si tiene entrada propia: el nombre de una ranura, de un objeto.
 *
 * Y SI NADA CASA CON LA FRASE ENTERA, SE PARTE: un estado como «abierto jetyum · 3 avisos» o un
 * mensaje de dos frases se traduce trozo a trozo, por los separadores de siempre y por frases.
 *
 * Este módulo no sabe nada del DOM ni del navegador más allá de recordar el idioma elegido: lo usan
 * el cliente, el editor y las pruebas en Node. Lo que traduce la página es `i18n-dom.mjs`.
 */

export const IDIOMAS = [
    { id: 'es', nombre: 'Español' },
    { id: 'en', nombre: 'English' }
];

/** El idioma en el que está escrito todo. */
export const ORIGINAL = 'es';

/**
 * El idioma con el que se abre el juego para quien no ha elegido otro, hasta que el servidor diga
 * el suyo (`defaultLanguage` en `config.js`, ver `idiomaDelServidor`). Es el mismo que trae
 * `config.js` de serie, para que la página no se abra en un idioma y salte al otro.
 */
export const POR_DEFECTO = 'en';

const CLAVE_GUARDADA = 'jetyum.idioma';

/** Los huecos de un patrón: `{n}`, `{objeto}`, `{0}`. */
const HUECO = /\{(\w+)\}/g;

/** Lo que tiene que tener un texto para que merezca la pena buscarlo: alguna letra. */
const CON_LETRAS = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡]/;

/**
 * Por dónde se parte un texto que no casa entero, en este orden. Cada expresión CAPTURA el
 * separador para devolverlo tal cual al juntar los trozos.
 */
const SEPARADORES = [
    /(\n+)/,
    /( · | — | \| |; )/,
    // Entre frases: un punto (o ! ? :) y espacio, y detrás algo que empieza frase.
    /(?<=[.!?:])(\s+)(?=[A-ZÁÉÍÓÚÑ¿¡"«(])/
];

/** Hasta dónde se baja traduciendo trozos y huecos: más es buscar por buscar. */
const PROFUNDIDAD = 3;

/** idioma -> { exactos: Map, porPrefijo: Map<string, patrón[]>, generales: patrón[] } */
const diccionarios = new Map();

const oyentes = new Set();

/** ¿La persona eligió idioma? Entonces el del servidor no la pisa. */
let elegido = false;

let actual = idiomaInicial();

function valido(id) {
    return IDIOMAS.some((idioma) => idioma.id === id);
}

/**
 * El idioma con el que se arranca: el que se eligió la última vez o, si no se ha elegido nunca, el
 * de por defecto. NO EL DEL NAVEGADOR: el idioma por defecto lo decide quien monta el servidor.
 * FUERA DEL NAVEGADOR, SIEMPRE EL ORIGINAL: Node no traduce nada para nadie, y las pruebas comprueban
 * los textos en español.
 */
function idiomaInicial() {
    if (typeof document === 'undefined') {
        return ORIGINAL;
    }
    try {
        const guardado = globalThis.localStorage && globalThis.localStorage.getItem(CLAVE_GUARDADA);
        if (valido(guardado)) {
            elegido = true;
            return guardado;
        }
    } catch (error) {
        // Sin almacenamiento —una ventana privada, un sitio bloqueado— se usa el de por defecto.
    }
    return POR_DEFECTO;
}

/**
 * El idioma por defecto que dice el servidor (`defaultLanguage` en `config.js`). Sólo se pone si la
 * persona no ha elegido uno —su elección gana siempre— y no se guarda: si el servidor cambia el
 * suyo, quien nunca eligió lo verá cambiar.
 */
export function idiomaDelServidor(id) {
    if (!elegido && valido(id)) {
        setIdioma(id, { guardar: false });
    }
    return actual;
}

/** El idioma puesto ahora. */
export function idioma() {
    return actual;
}

/**
 * Cambia el idioma, lo recuerda para la próxima vez y avisa a quien escuche.
 *
 * @param {string} id `es` o `en`
 * @param {{guardar?: boolean}} [opciones] `guardar: false` para no tocar el almacenamiento
 */
export function setIdioma(id, opciones) {
    if (!valido(id) || id === actual) {
        return actual;
    }
    actual = id;
    if (!opciones || opciones.guardar !== false) {
        elegido = true;
        try {
            if (globalThis.localStorage) {
                globalThis.localStorage.setItem(CLAVE_GUARDADA, id);
            }
        } catch (error) {
            // Se cambia igual; sólo no se recordará.
        }
    }
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = id;
    }
    oyentes.forEach((oyente) => oyente(id));
    return actual;
}

/** Escucha los cambios de idioma. Devuelve la función que deja de escuchar. */
export function alCambiarIdioma(oyente) {
    oyentes.add(oyente);
    return () => oyentes.delete(oyente);
}

function escapar(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function huecosDe(texto) {
    return Array.from(texto.matchAll(HUECO), (m) => m[1]);
}

/**
 * Lo que puede caer en un hueco. ESTRICTO: sin cruzar un separador. Una lista de problemas unida con
 * `; ` no puede acabar entera dentro del hueco del primero —quedaría el primero en español y el resto
 * hecho un lío—: el hueco estricto no casa, la lista se parte y cada problema se traduce solo. El
 * LIBRE es para lo que queda: un nombre que lleve un separador dentro.
 */
const CAPTURA_ESTRICTA = '((?:(?!; | · | — | \\| |\\n)[\\s\\S])+?)';
const CAPTURA_LIBRE = '([\\s\\S]+?)';

/** Las letras fijas que necesita un patrón para usarse con lo que llega hecho. */
const LETRAS_MINIMAS = 3;

function compilarPatron(original, traduccion) {
    const nombres = [];
    const trozos = [];
    let desde = 0;
    original.replace(HUECO, (todo, nombre, posicion) => {
        trozos.push(original.slice(desde, posicion));
        nombres.push(nombre);
        desde = posicion + todo.length;
        return todo;
    });
    trozos.push(original.slice(desde));
    const fuente = (captura) => '^' + trozos.map(escapar).join(captura) + '$';
    const literal = trozos.join('');
    return {
        re: new RegExp(fuente(CAPTURA_ESTRICTA)),
        reLibre: new RegExp(fuente(CAPTURA_LIBRE)),
        nombres: nombres,
        plantilla: traduccion,
        literal: literal.length,
        letras: (literal.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length,
        prefijo: trozos[0]
    };
}

/**
 * Comprueba un diccionario sin registrarlo: las entradas vacías y los huecos que no coinciden
 * entre el español y la traducción. Es lo que miran las pruebas.
 *
 * @returns {string[]} los problemas, uno por entrada
 */
export function problemasDeDiccionario(entradas) {
    const problemas = [];
    Object.keys(entradas).forEach((original) => {
        const traduccion = entradas[original];
        if (typeof traduccion !== 'string' || traduccion.trim() === '') {
            problemas.push('sin traducción: ' + JSON.stringify(original));
            return;
        }
        const a = huecosDe(original).sort().join(',');
        const b = huecosDe(traduccion).sort().join(',');
        if (a !== b) {
            problemas.push('huecos distintos en ' + JSON.stringify(original) + ': {' + a + '} y {' + b + '}');
        }
    });
    return problemas;
}

/**
 * Añade entradas al diccionario de un idioma. Se puede llamar varias veces —un diccionario por
 * parte del proyecto— y la última entrada para una misma frase gana.
 *
 * @param {string} id el idioma de la traducción
 * @param {Object<string, string>} entradas español -> traducción
 */
export function registrar(id, entradas) {
    let diccionario = diccionarios.get(id);
    if (!diccionario) {
        diccionario = { exactos: new Map(), porPrefijo: new Map(), generales: [] };
        diccionarios.set(id, diccionario);
    }
    Object.keys(entradas || {}).forEach((original) => {
        const traduccion = entradas[original];
        if (typeof traduccion !== 'string' || traduccion === '') {
            return;
        }
        // La plantilla también va entre las exactas: es lo que busca `t()` con sus parámetros.
        diccionario.exactos.set(original, traduccion);
        // Y con los espacios juntos: un texto de varias líneas del HTML se ve igual se sangre como
        // se sangre, y no puede dejar de traducirse porque alguien reformatee la página.
        const plano = original.replace(/\s+/g, ' ');
        if (plano !== original && !diccionario.exactos.has(plano)) {
            diccionario.exactos.set(plano, traduccion);
        }
        if (huecosDe(original).length === 0) {
            return;
        }
        const patron = compilarPatron(original, traduccion);
        // Casi sin letras fijas («{n} de {total}») casaría con cualquier cosa: sólo vale con `t()`.
        if (patron.letras < LETRAS_MINIMAS) {
            return;
        }
        const lista = patron.prefijo.length >= 2
            ? (diccionario.porPrefijo.get(patron.prefijo.slice(0, 2)) ||
                diccionario.porPrefijo.set(patron.prefijo.slice(0, 2), []).get(patron.prefijo.slice(0, 2)))
            : diccionario.generales;
        lista.push(patron);
        // El más concreto primero: «No puedes con eso: pesa {n}» antes que «No puedes {algo}».
        lista.sort((x, y) => y.literal - x.literal);
    });
}

function rellenar(diccionario, patron, m, profundidad) {
    const valores = {};
    patron.nombres.forEach((nombre, i) => {
        valores[nombre] = m[i + 1];
    });
    return patron.plantilla.replace(HUECO, (todo, nombre) => {
        if (!(nombre in valores)) {
            return todo;
        }
        return profundidad < PROFUNDIDAD
            ? traducirCon(diccionario, valores[nombre], profundidad + 1)
            : valores[nombre];
    });
}

function porPatron(diccionario, texto, profundidad, campo) {
    const candidatos = (diccionario.porPrefijo.get(texto.slice(0, 2)) || [])
        .concat(diccionario.generales);
    for (const patron of candidatos) {
        const m = patron[campo].exec(texto);
        if (m) {
            return rellenar(diccionario, patron, m, profundidad);
        }
    }
    return null;
}

/**
 * En este orden: la frase exacta; un patrón cuyos huecos no crucen un separador; la frase partida
 * en trozos; y, por último, un patrón con huecos libres.
 */
function buscar(diccionario, texto, profundidad) {
    const exacto = diccionario.exactos.get(texto);
    if (exacto !== undefined) {
        return exacto;
    }
    const plano = texto.replace(/\s+/g, ' ');
    if (plano !== texto && diccionario.exactos.has(plano)) {
        return diccionario.exactos.get(plano);
    }

    const estricto = porPatron(diccionario, texto, profundidad, 're');
    if (estricto !== null) {
        return estricto;
    }

    const partido = profundidad < PROFUNDIDAD ? partir(diccionario, texto, profundidad) : null;
    if (partido !== null) {
        return partido;
    }

    return porPatron(diccionario, texto, profundidad, 'reLibre');
}

function partir(diccionario, texto, profundidad) {
    for (const separador of SEPARADORES) {
        const piezas = texto.split(separador);
        if (piezas.length < 3) {
            continue;
        }
        let cambio = false;
        const traducidas = piezas.map((pieza, i) => {
            if (i % 2 === 1) {
                return pieza;
            }
            const traducida = traducirCon(diccionario, pieza, profundidad + 1);
            cambio = cambio || traducida !== pieza;
            return traducida;
        });
        if (cambio) {
            return traducidas.join('');
        }
    }

    return null;
}

function traducirCon(diccionario, texto, profundidad) {
    const partes = /^(\s*)([\s\S]*?)(\s*)$/.exec(texto);
    const nucleo = partes[2];
    if (!nucleo || !CON_LETRAS.test(nucleo)) {
        return texto;
    }
    const traducido = buscar(diccionario, nucleo, profundidad);
    return traducido === null ? texto : partes[1] + traducido + partes[3];
}

/**
 * Un texto ya compuesto, en el idioma puesto. Es lo que se usa con lo que llega hecho: un mensaje
 * del motor, un texto que el código ha pegado, lo que hay en la página.
 *
 * @param {string} texto en español
 * @param {string} [id] el idioma; por defecto, el puesto
 */
export function traducir(texto, id) {
    const destino = id || actual;
    if (destino === ORIGINAL || typeof texto !== 'string' || texto === '') {
        return texto;
    }
    const diccionario = diccionarios.get(destino);
    return diccionario ? traducirCon(diccionario, texto, 0) : texto;
}

/**
 * Una frase con huecos, traducida y rellena: `t('Nivel {n}', {n: 5})`.
 *
 * @param {string} plantilla la frase en español, con los huecos entre llaves
 * @param {Object} [valores] lo que va en cada hueco
 */
export function t(plantilla, valores) {
    const texto = traducir(plantilla);
    if (!valores) {
        return texto;
    }
    return texto.replace(HUECO, (todo, nombre) =>
        (Object.prototype.hasOwnProperty.call(valores, nombre) ? String(valores[nombre]) : todo));
}
