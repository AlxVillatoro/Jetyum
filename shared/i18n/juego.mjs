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
import contenedores from './en/contenedores.mjs';
import muerte from './en/muerte.mjs';
import casas from './en/casas.mjs';
import correo from './en/correo.mjs';
import intercambio from './en/intercambio.mjs';
import gremios from './en/gremios.mjs';
import canales from './en/canales.mjs';

registrar('en', motor);
registrar('en', contenido);
registrar('en', cliente);
registrar('en', contenedores);
registrar('en', muerte);
registrar('en', casas);
registrar('en', correo);
registrar('en', intercambio);
registrar('en', gremios);
registrar('en', canales);
