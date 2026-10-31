/**
 * Los diccionarios del JUEGO: el cliente y lo que le manda el motor.
 *
 * Importar esto los registra. Van aparte de los del editor para que el cliente no se descargue
 * miles de frases de unas herramientas que no usa.
 */
import { registrar } from '../js/i18n.mjs';
import motor from './en/motor.mjs';
import contenido from './en/contenido.mjs';
import cliente from './en/cliente.mjs';

registrar('en', motor);
registrar('en', contenido);
registrar('en', cliente);
