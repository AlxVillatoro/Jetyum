/**
 * Los iconos de la barra lateral del cliente.
 *
 * Como en el editor: botones con un icono y su explicación en el globo del ratón (`title`, que es
 * también lo que se le da al lector de pantalla con `aria-label`). SVG de trazo en `currentColor`,
 * escritos aquí, para que tomen el color del botón y no haya que pedir nada a internet.
 *
 * Uso: `<button data-icono="stop" title="...">`. `pintarIconos()` rellena todos al arrancar.
 */

const ICONOS = {
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    misiones: '<path d="M6 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6"/><path d="M6 3a2 2 0 0 0-2 2v1h4V5a2 2 0 0 0-2-2z"/><path d="M8 9h7M8 13h7M8 17h4"/>',
    opciones: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><circle cx="12" cy="17.5" r=".6" fill="currentColor"/>',
    skills: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
    batalla: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 17.5 21 6V3h-3L6.5 14.5"/><path d="m11 19-6-6M8 16l-4 4M5 21l-2-2"/>',
    vip: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    'zoom-mas': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>',
    'zoom-menos': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
    centrar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    arriba: '<path d="m6 15 6-6 6 6"/>',
    abajo: '<path d="m6 9 6 6 6-6"/>',
    minimizar: '<path d="M5 12h14"/>',
    coger: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
    ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'ojo-cerrado': '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    volver: '<path d="m15 18-6-6 6-6"/>',
    teclado: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    vida: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor"/>',
    mana: '<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" fill="currentColor"/>'
};

/** El SVG de un icono, listo para meter en un botón. */
export function svgDe(nombre) {
    const trazo = ICONOS[nombre];
    if (!trazo) {
        return '';
    }
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + trazo + '</svg>';
}

/** Rellena todos los `[data-icono]` de la página y pone su `aria-label`. */
export function pintarIconos(raiz) {
    (raiz || document).querySelectorAll('[data-icono]').forEach((elemento) => {
        elemento.innerHTML = svgDe(elemento.dataset.icono) + elemento.innerHTML.replace(/<svg[\s\S]*?<\/svg>/, '');
        if (elemento.title && !elemento.getAttribute('aria-label')) {
            elemento.setAttribute('aria-label', elemento.title);
        }
    });
}
