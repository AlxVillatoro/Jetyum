/**
 * LOS EFECTOS Y LOS PROYECTILES, por su nombre.
 *
 * Son los del OpenTibia Sprite Pack (`things.json`, categorías `effects` y `missiles`, importados
 * con el id del pack + 100). El pack NO sigue la numeración de Tibia, así que aquí se les da
 * nombre mirando el dibujo, y cada nombre lleva también su alias de The Forgotten Server
 * (`CONST_ME_*`, `CONST_ANI_*`) para que un script copiado de TFS funcione sin cambiar nada:
 *
 *     Game.sendMagicEffect(pos, EFECTO.FUEGO);
 *     Game.sendMagicEffect(pos, CONST_ME_HITBYFIRE);        // lo mismo
 *     Game.sendDistanceEffect(desde, hasta, PROYECTIL.FLECHA);
 *
 * Lo comparten el motor (que manda el número), el cliente (que lo dibuja) y los scripts (que
 * los tienen como globales: `EFECTO`, `PROYECTIL` y los `CONST_*`).
 */

/** Los efectos sobre una casilla (`SERVER.MAGIC_EFFECT`). */
export const EFECTO = {
    SANGRE: 101,        // anillo rojo que se abre: un golpe que hace sangre
    MAGIA_AZUL: 102,    // estallido azul: curar, teletransporte, magia
    POFF: 103,          // nube rosa: algo que falla o desaparece
    GOLPE: 104,         // chispas amarillas en anillo: un golpe que para la armadura
    CHISPAS: 105,       // chispas pequeñas
    ONDA_FUEGO: 106,    // llamarada que se abre
    ENERGIA: 107,       // destellos azules: energía
    POLVO: 109,         // polvo que salta del suelo
    TIERRA: 110,        // tierra que se levanta
    FUEGO: 111,         // una llama
    EXPLOSION: 112,     // estallido rojo
    REMOLINO_FUEGO: 113, // remolino de fuego (área)
    ROCA: 114,          // una roca que sale del suelo
    HIELO: 115,         // tornado de hielo

    // El tajo de espada (el de BrowserQuest, importado en things.json), uno por dirección.
    ESPADA_NORTE: 201,
    ESPADA_ESTE: 202,
    ESPADA_SUR: 203,
    ESPADA_OESTE: 204
};

/** El tajo de espada según hacia dónde mira quien ataca (0 norte, 1 este, 2 sur, 3 oeste). */
export const EFECTO_ESPADA_POR_DIRECCION = [EFECTO.ESPADA_NORTE, EFECTO.ESPADA_ESTE, EFECTO.ESPADA_SUR, EFECTO.ESPADA_OESTE];

/** Los proyectiles que vuelan de una casilla a otra (`SERVER.DISTANCE_EFFECT`). */
export const PROYECTIL = {
    LANZA: 101,
    VIROTE: 102,
    FLECHA: 103,
    FUEGO: 104,
    VENENO: 105,
    ESTRELLA: 106,
    FLECHA_VENENOSA: 107,
    ESTRELLA_PEQUENA: 108,
    CUCHILLO: 109,
    PIEDRA: 110,
    BOLA_FUEGO: 111,
    ROCA: 112,
    HIELO: 113,
    FLECHA_LIGERA: 114,
    TIERRA: 115
};

/** Los alias de TFS. Los que el pack no tiene caen en el más parecido. */
export const CONST_ME = {
    CONST_ME_DRAWBLOOD: EFECTO.SANGRE,
    CONST_ME_LOSEENERGY: EFECTO.ENERGIA,
    CONST_ME_POFF: EFECTO.POFF,
    CONST_ME_BLOCKHIT: EFECTO.GOLPE,
    CONST_ME_EXPLOSIONAREA: EFECTO.REMOLINO_FUEGO,
    CONST_ME_EXPLOSIONHIT: EFECTO.EXPLOSION,
    CONST_ME_FIREAREA: EFECTO.REMOLINO_FUEGO,
    CONST_ME_HITAREA: EFECTO.GOLPE,
    CONST_ME_TELEPORT: EFECTO.MAGIA_AZUL,
    CONST_ME_ENERGYHIT: EFECTO.ENERGIA,
    CONST_ME_ENERGYAREA: EFECTO.ENERGIA,
    CONST_ME_MAGIC_BLUE: EFECTO.MAGIA_AZUL,
    CONST_ME_MAGIC_RED: EFECTO.EXPLOSION,
    CONST_ME_MAGIC_GREEN: EFECTO.MAGIA_AZUL,
    CONST_ME_HITBYFIRE: EFECTO.FUEGO,
    CONST_ME_HITBYPOISON: EFECTO.TIERRA,
    CONST_ME_FIREATTACK: EFECTO.ONDA_FUEGO,
    CONST_ME_GROUNDSHAKER: EFECTO.POLVO,
    CONST_ME_STONES: EFECTO.ROCA,
    CONST_ME_SMALLPLANTS: EFECTO.TIERRA,
    CONST_ME_ICEAREA: EFECTO.HIELO,
    CONST_ME_ICETORNADO: EFECTO.HIELO,
    CONST_ME_ICEATTACK: EFECTO.HIELO,
    CONST_ME_HOLYDAMAGE: EFECTO.MAGIA_AZUL,
    CONST_ME_YELLOW_RINGS: EFECTO.GOLPE
};

export const CONST_ANI = {
    CONST_ANI_SPEAR: PROYECTIL.LANZA,
    CONST_ANI_BOLT: PROYECTIL.VIROTE,
    CONST_ANI_ARROW: PROYECTIL.FLECHA,
    CONST_ANI_FIRE: PROYECTIL.FUEGO,
    CONST_ANI_ENERGY: PROYECTIL.FLECHA_LIGERA,
    CONST_ANI_POISONARROW: PROYECTIL.FLECHA_VENENOSA,
    CONST_ANI_THROWINGSTAR: PROYECTIL.ESTRELLA,
    CONST_ANI_THROWINGKNIFE: PROYECTIL.CUCHILLO,
    CONST_ANI_SMALLSTONE: PROYECTIL.PIEDRA,
    CONST_ANI_LARGEROCK: PROYECTIL.ROCA,
    CONST_ANI_SNOWBALL: PROYECTIL.HIELO,
    CONST_ANI_ICE: PROYECTIL.HIELO,
    CONST_ANI_POISON: PROYECTIL.VENENO,
    CONST_ANI_EARTH: PROYECTIL.TIERRA,
    CONST_ANI_EXPLOSION: PROYECTIL.BOLA_FUEGO
};

/** El efecto que corresponde al daño de cada elemento (el golpe de un hechizo). */
export const EFECTO_DE_ELEMENTO = {
    physical: EFECTO.SANGRE,
    fire: EFECTO.FUEGO,
    energy: EFECTO.ENERGIA,
    earth: EFECTO.TIERRA,
    poison: EFECTO.TIERRA,
    ice: EFECTO.HIELO,
    holy: EFECTO.MAGIA_AZUL,
    death: EFECTO.EXPLOSION,
    healing: EFECTO.MAGIA_AZUL
};

/** ¿Es un efecto o un proyectil que existe? (el motor no manda números al azar). */
export function esEfecto(id) {
    const n = Number(id);
    // Los del pack (101-164) y los propios (201-299: el tajo de espada...).
    return Number.isInteger(n) && ((n >= 101 && n <= 164) || (n >= 201 && n <= 299));
}

export function esProyectil(id) {
    const n = Number(id);
    return Number.isInteger(n) && n >= 101 && n <= 160;
}
