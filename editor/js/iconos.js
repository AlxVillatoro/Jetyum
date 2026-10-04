/**
 * Los iconos de las barras del editor.
 *
 * Las barras de RME son de iconos con su explicación en el globo del ratón, y es lo que deja sitio
 * al mapa: una fila de 30 botones con texto no cabe en una pantalla, y con iconos cabe en media.
 * La explicación no se pierde: está en el `title` de cada botón, que es también lo que se le da
 * al lector de pantalla (`aria-label`).
 *
 * Son SVG escritos aquí, de trazo y en `currentColor`, para que tomen el color del botón (activo,
 * deshabilitado, peligro) sin una hoja de iconos aparte y sin pedir nada a internet: el editor
 * funciona sin conexión.
 *
 * Uso: `<button data-icono="guardar" title="...">`. Al arrancar, `pintarIconos()` rellena todos
 * los botones; `ponerIcono(boton, nombre)` cambia el de uno (la forma del pincel, por ejemplo).
 */

const ICONOS = {
    recargar: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    guardar: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3"/><rect x="7" y="13" width="10" height="8"/>',
    deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    rehacer: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    seleccionar: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M11 4h2M11 20h2M4 11v2M20 11v2"/>',
    copiar: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16a2 2 0 0 1-1-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 1"/>',
    cortar: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    pegar: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    'borrar-sel': '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="m9 9 6 6M15 9l-6 6"/>',
    elegir: '<path d="m4 4 7 17 2.5-7.5L21 11z"/>',
    borrar: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21"/><path d="M22 21H7M5 11l9 9"/>',
    bandera: '<path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>',
    capturar: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    rellenar: '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0z"/><path d="M5 2l5 5M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 2-4 2-4s2 2.4 2 4z"/>',
    borderizar: '<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="8" y="8" width="8" height="8" stroke-dasharray="2 2"/>',
    aleatorizar: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="16" r="1.3" fill="currentColor"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    reemplazar: '<path d="M14 4h6v6"/><path d="M20 4 13 11"/><path d="M10 20H4v-6"/><path d="m4 20 7-7"/>',
    ir: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    estadisticas: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
    limpiar: '<path d="m14 4 6 6"/><path d="M17 7 9.5 14.5"/><path d="M9.5 14.5c-2-2-5 0-6 6 6-1 8-4 6-6z"/>',
    autoborde: '<path d="m3 21 12-12"/><path d="m15 9 2-2"/><path d="M19 3v4M17 5h4M7 3v2M6 4h2M20 13v2M19 14h2"/>',
    rejilla: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
    casas: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    minimapa: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    'zoom-mas': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/>',
    'zoom-menos': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
    'ver-todo': '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    'vista-normal': '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M8 10v5M7 10.5l1-.5M16 10v5M15 10.5l1-.5"/><circle cx="12" cy="11" r=".6" fill="currentColor"/><circle cx="12" cy="14" r=".6" fill="currentColor"/>',
    cuadrado: '<rect x="5" y="5" width="14" height="14"/>',
    circulo: '<circle cx="12" cy="12" r="8"/>',
    soltar: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    propiedades: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    menos: '<path d="M5 12h14"/>',
    cerrar: '<path d="M18 6 6 18M6 6l12 12"/>',
    respawn: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 2"/><path d="M12 8c2 2 2 4 0 6-2-2-2-4 0-6z" fill="currentColor"/>',
    monstruo: '<path d="M5 20v-8a7 7 0 0 1 14 0v8l-3-2-2 2-2-2-2 2-2-2z"/><circle cx="9.5" cy="11" r="1.2" fill="currentColor"/><circle cx="14.5" cy="11" r="1.2" fill="currentColor"/>',
    npc: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    papelera: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
    imagen: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    'desde-imagen': '<path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9"/><circle cx="9" cy="9" r="2"/><path d="m21 17-4-4-9 8"/><path d="M19 2v6M16 5h6"/>',
    comprobar: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    importar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5M12 4v12"/>',
    exportar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 11 5 5 5-5M12 16V4"/>',
    'importar-hoja': '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 3v18"/><path d="m13 15 2-2 2 2M15 13v6" />',
    'exportar-hoja': '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 3v18"/><path d="m13 17 2 2 2-2M15 19v-6"/>',
    'reemplazar-sprite': '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M15 3h3a3 3 0 0 1 3 3v3M9 21H6a3 3 0 0 1-3-3v-3"/><path d="m19 7 2 2 2-2M5 17l-2-2-2 2"/>',
    vaciar: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2"/><path d="m9 9 6 6M15 9l-6 6"/>',
    reproducir: '<path d="M7 4v16l13-8z"/>',
    usar: '<path d="M12 3v11"/><path d="m7 9 5 5 5-5"/><rect x="5" y="17" width="14" height="4" rx="1"/>',
    objetos: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/>',
    aspectos: '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7M8 11h8M12 15l-3 6M12 15l3 6"/>',
    efectos: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    proyectiles: '<path d="M3 21 15 9"/><path d="M15 9h5l-3-3 1-3-3 1-3-3v5z"/><path d="M3 21h4M3 21v-4"/>',
    'sin-usar': '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    anterior: '<path d="m15 18-6-6 6-6"/>',
    siguiente: '<path d="m9 18 6-6-6-6"/>',
    magenta: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" fill="#ff00ff" fill-opacity=".85"/><path d="M4 20 20 4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'
};

/** El SVG de un icono, o `null` si no existe. */
export function svgDe(nombre) {
    const trazo = ICONOS[nombre];
    if (!trazo) {
        return null;
    }
    return '<svg class="icono" viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
        'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
        'aria-hidden="true">' + trazo + '</svg>';
}

/** Pone (o cambia) el icono de un botón. El texto del `title` pasa a ser su nombre accesible. */
export function ponerIcono(boton, nombre) {
    const svg = svgDe(nombre);
    if (!boton || !svg) {
        return;
    }
    boton.dataset.icono = nombre;
    boton.innerHTML = svg;
    boton.classList.add('icono-boton');
    if (boton.title && !boton.getAttribute('aria-label')) {
        boton.setAttribute('aria-label', boton.title.split('\n')[0]);
    }
}

/** Rellena todos los botones con `data-icono` de la página. */
export function pintarIconos(raiz = document) {
    raiz.querySelectorAll('[data-icono]').forEach((boton) => ponerIcono(boton, boton.dataset.icono));
}

export const NOMBRES_DE_ICONOS = Object.keys(ICONOS);
