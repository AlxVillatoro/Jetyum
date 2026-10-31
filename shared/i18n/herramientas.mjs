/**
 * Los diccionarios de las HERRAMIENTAS: el editor y su servidor.
 *
 * Llevan también los del motor y el contenido: el editor enseña los avisos de los mismos lectores
 * que usa el motor, y los nombres de los NPC y los monstruos.
 */
import { registrar } from '../js/i18n.mjs';
import motor from './en/motor.mjs';
import contenido from './en/contenido.mjs';
import editorA from './en/editor-a.mjs';
import editorB from './en/editor-b.mjs';
import editorC from './en/editor-c.mjs';
import editorPlantas from './en/editor-plantas.mjs';
import editorSeleccion from './en/editor-seleccion.mjs';
import editorMapas from './en/editor-mapas.mjs';
import editorDiagnostico from './en/editor-diagnostico.mjs';
import editorInterfaz from './en/editor-interfaz.mjs';

registrar('en', motor);
registrar('en', contenido);
registrar('en', editorA);
registrar('en', editorB);
registrar('en', editorC);
registrar('en', editorPlantas);
registrar('en', editorSeleccion);
registrar('en', editorMapas);
registrar('en', editorDiagnostico);
registrar('en', editorInterfaz);
