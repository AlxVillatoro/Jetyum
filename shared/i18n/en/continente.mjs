/**
 * Inglés: el mapa CONTINENTE (tools/generar-continente.mjs).
 *
 * Lo que se lee al mirar las cosas del mapa (las marcas de ciudadano, los carteles y las piezas del
 * museo, que llevan su texto en `description`), la marca de ciudadano
 * (data/scripts/movements/tiles/ciudadano.js) y el museo (data/scripts/actions/museo.js).
 */
export default {
    // --- Las marcas de ciudadano ---
    'Pisa aquí para ser vecino de {ciudad}.': 'Step here to become a citizen of {ciudad}.',
    'Ahora eres vecino de {ciudad}.': 'You are now a citizen of {ciudad}.',
    'Ya eres vecino de {ciudad}.': 'You are already a citizen of {ciudad}.',

    // --- El museo ---
    'Pieza {n} del museo.': 'Museum piece {n}.',
    'Efecto {n}.': 'Effect {n}.',
    'Proyectil {n}.': 'Missile {n}.',
    'Aspecto {n}.': 'Outfit {n}.',
    'Es una pieza del museo: se mira, pero no se toca.': 'It is a museum piece: look, but do not touch.',
    'Te pruebas el aspecto {n}. Bájate de la marca para volver al tuyo.':
        'You try on outfit {n}. Step off the mark to get yours back.',
    'Entrada.': 'Entrance.',
    'Sala 1 · Suelos.': 'Hall 1 · Grounds.',
    'Sala 2 · Bordes y detalles del suelo.': 'Hall 2 · Borders and ground details.',
    'Sala 3 · Muros, puertas, ventanas y tejados.': 'Hall 3 · Walls, doors, windows and roofs.',
    'Sala 4 · Naturaleza: árboles, plantas y rocas.': 'Hall 4 · Nature: trees, plants and rocks.',
    'Sala 5 · Muebles y decoración.': 'Hall 5 · Furniture and decoration.',
    'Sala 6 · Armas, munición y runas.': 'Hall 6 · Weapons, ammunition and runes.',
    'Sala 7 · Armaduras, cascos, escudos, botas y joyas.': 'Hall 7 · Armors, helmets, shields, boots and jewelry.',
    'Sala 8 · Contenedores.': 'Hall 8 · Containers.',
    'Sala 9 · Objetos: herramientas, comida, pociones, gemas y correo.': 'Hall 9 · Items: tools, food, potions, gems and mail.',
    'Sala 10 · La hoja de casillas (5000).': 'Hall 10 · The tile sheet (5000).',
    'Sala 11 · Campos y muros mágicos (en vitrina).': 'Hall 11 · Fields and magic walls (in a showcase).',
    'Sala 12 · Efectos (pisa cada marca).': 'Hall 12 · Effects (step on each mark).',
    'Sala 13 · Proyectiles (pisa cada marca).': 'Hall 13 · Missiles (step on each mark).',
    'Sala 14 · El probador: cada aspecto (pisa una marca y mira).': 'Hall 14 · The fitting room: every outfit (step on a mark and look).'
};
