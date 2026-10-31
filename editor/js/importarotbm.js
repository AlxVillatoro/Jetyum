/**
 * EL DIÁLOGO «IMPORTAR OTBM»: un mapa de Remere's Map Editor o de TFS, a un mapa nuevo del editor.
 *
 * Va al lado de «Nuevo mapa» y abre su diálogo en la misma esquina. El trabajo lo hace el servidor
 * (`POST /api/maps/importar-otbm`, con `editor/lib/convertirotbm.js`); aquí solo se piden los
 * archivos, el área y el nombre, y se enseña el informe.
 *
 * LOS ARCHIVOS SE SUBEN o se escriben por RUTA. Un `.otbm` de verdad pasa de los 4 MB que admite el
 * API en JSON, así que «Subir…» manda el archivo tal cual a `POST /api/subidas`, que lo deja en una
 * carpeta temporal y devuelve su ruta; esa ruta es lo que queda en el campo. Si el archivo ya está
 * en la máquina del servidor (el editor es local), basta con escribir su ruta. Los
 * `materials.xml` de RME incluyen otros archivos por ruta relativa, así que ésos van solo por ruta.
 *
 * «Analizar» no escribe nada: devuelve el informe (cuántas casillas, cuánto se traduce, qué ids no
 * tienen equivalencia, qué monstruos no existen) para elegir bien el área. «Importar y abrir» crea
 * el mapa —nunca encima de otro— y lo abre. Las rutas se recuerdan en este navegador.
 */

const CLAVE_RECUERDO = 'jetyum.editor.importarOtbm';

/** Los campos de archivo: clave del API, rótulo, extensiones y si se puede subir. */
const CAMPOS = [
    { clave: 'otbm', rotulo: 'Mapa (.otbm)', acepta: '.otbm', subir: true, ayuda: 'El mapa de RME o de TFS' },
    { clave: 'itemsOtb', rotulo: 'items.otb del servidor', acepta: '.otb', subir: true,
        ayuda: 'El items.otb con el que se hizo el mapa: da sentido a sus números' },
    { clave: 'itemsXml', rotulo: 'items.xml del servidor (recomendado)', acepta: '.xml', subir: true,
        ayuda: 'Los nombres de los objetos: sin él, casan muchos menos' },
    { clave: 'casas', rotulo: 'house.xml (opcional)', acepta: '.xml', subir: true,
        ayuda: 'Las casas: nombre, ciudad, alquiler y salida' },
    { clave: 'spawns', rotulo: 'spawn.xml (opcional)', acepta: '.xml', subir: true,
        ayuda: 'Los respawns y los NPC' },
    { clave: 'materiales', rotulo: 'materials.xml de RME (opcional, ruta en el servidor)', acepta: '.xml', subir: false,
        ayuda: 'Los pinceles de RME: con ellos los muros, los suelos y los bordes casan pieza a pieza. ' +
            'Sin ellos se usa la tabla guardada en data/editor/equivalencias-otbm.json' }
];

function leerRecuerdo() {
    try {
        return JSON.parse(window.localStorage.getItem(CLAVE_RECUERDO) || '{}') || {};
    } catch (error) {
        return {};
    }
}

function guardarRecuerdo(datos) {
    try {
        window.localStorage.setItem(CLAVE_RECUERDO, JSON.stringify(datos));
    } catch (error) {
        // Sin almacenamiento (ventana privada): el diálogo funciona igual, solo no recuerda.
    }
}

/**
 * Abre el diálogo. `ctx` trae los ayudantes de diálogo de `main.js` (que no se exportan) y el API.
 */
export function dialogoImportarOtbm(ctx) {
    const { api, nodo } = ctx;
    const recuerdo = leerRecuerdo();
    const dialogo = ctx.abrirDialogo('Importar OTBM', true);
    const formulario = ctx.formularioDeDialogo(dialogo, () => enviar(false));

    formulario.appendChild(nodo('div', 'nota',
        'Convierte un mapa de RME o TFS en un mapa nuevo de data/world. Los ids de Tibia se traducen con ' +
        'data/editor/equivalencias-otbm.json; lo que no tiene equivalencia se quita y sale en el informe.'));

    const entradas = {};
    CAMPOS.forEach((campo) => {
        const rotulo = nodo('label', 'field');
        rotulo.appendChild(nodo('span', '', campo.rotulo));
        const fila = nodo('div', 'suelo-fila');
        const entrada = nodo('input');
        entrada.type = 'text';
        entrada.placeholder = 'ruta en el servidor';
        entrada.title = campo.ayuda;
        entrada.value = recuerdo[campo.clave] || '';
        fila.appendChild(entrada);
        if (campo.subir) {
            const archivo = nodo('input');
            archivo.type = 'file';
            archivo.accept = campo.acepta;
            archivo.hidden = true;
            const boton = ctx.botonDeDialogo(fila, 'Subir…', 'plain');
            boton.title = 'Subir el archivo al servidor del editor (a una carpeta temporal)';
            boton.addEventListener('click', () => archivo.click());
            archivo.addEventListener('change', async () => {
                const elegido = archivo.files && archivo.files[0];
                if (!elegido) {
                    return;
                }
                boton.disabled = true;
                ctx.setMapStatus('subiendo ' + elegido.name + ' (' + Math.round(elegido.size / 1024) + ' KB)...');
                const r = await api.subirArchivo(elegido, elegido.name);
                boton.disabled = false;
                archivo.value = '';
                if (r.error) {
                    ctx.setMapStatus('no se subió ' + elegido.name + ': ' + r.error, true);
                    return;
                }
                entrada.value = r.ruta;
                ctx.setMapStatus('subido ' + elegido.name + ' (' + Math.round(r.bytes / 1024) + ' KB)');
            });
            fila.appendChild(archivo);
        }
        rotulo.appendChild(fila);
        formulario.appendChild(rotulo);
        entradas[campo.clave] = entrada;
    });

    const area = ctx.campoDeDialogo(formulario, 'Área: x1,y1,x2,y2[,z1,z2]', 'text', recuerdo.area || '',
        'La región que se importa, con las coordenadas del .otbm. Vacío: el mapa entero (puede ser enorme)');
    area.placeholder = 'vacío = el mapa entero';
    const rotuloDesplazar = nodo('label', 'field');
    const desplazar = nodo('input');
    desplazar.type = 'checkbox';
    desplazar.checked = recuerdo.desplazar !== false;
    rotuloDesplazar.appendChild(desplazar);
    rotuloDesplazar.appendChild(nodo('span', '', ' Llevar el área al origen (0,0)'));
    rotuloDesplazar.title = 'La esquina del área pasa a ser la casilla 0,0: el mapa mide lo que mide el área. ' +
        'El desplazamiento queda apuntado en el archivo y la exportación lo deshace';
    formulario.appendChild(rotuloDesplazar);
    const nombre = ctx.campoDeDialogo(formulario, 'Nombre del mapa nuevo', 'text', recuerdo.nombre || '',
        'Se guarda como data/world/<nombre>.map.json; no puede ser el de un mapa que ya exista');
    nombre.placeholder = 'letras sin acentos, números, - y _';

    const pie = ctx.pieDeDialogo(formulario, 'Importar y abrir');
    const analizar = ctx.botonDeDialogo(pie.boton.parentNode, 'Analizar', 'plain');
    analizar.title = 'Leer el mapa y enseñar el informe, sin escribir nada';
    analizar.addEventListener('click', () => enviar(true));
    const resultado = nodo('div', 'importar-informe');
    dialogo.appendChild(resultado);

    function datos() {
        const d = { nombre: nombre.value.trim(), area: area.value.trim() || undefined, desplazar: desplazar.checked };
        CAMPOS.forEach((campo) => {
            const valor = entradas[campo.clave].value.trim();
            if (valor) {
                d[campo.clave] = valor;
            }
        });
        return d;
    }

    async function enviar(soloAnalizar) {
        const d = datos();
        guardarRecuerdo(Object.assign({}, d, { nombre: d.nombre }));
        if (!soloAnalizar) {
            const pendientes = ctx.cambiosSinGuardar();
            if (pendientes > 0 && !window.confirm('Hay ' + pendientes + ' cambio(s) sin guardar en el ' +
                'mapa abierto. ¿Abrir el mapa importado y perderlos?')) {
                return;
            }
        }
        pie.error.textContent = '';
        resultado.innerHTML = '';
        pie.boton.disabled = true;
        analizar.disabled = true;
        ctx.setMapStatus(soloAnalizar ? 'analizando el mapa...' : 'importando el mapa ' + d.nombre + '...');
        const r = await api.importarOtbm(Object.assign({}, d, { dryRun: soloAnalizar }));
        pie.boton.disabled = false;
        analizar.disabled = false;

        if (r.informe) {
            pintarInforme(resultado, r.informe, nodo);
        }
        if (r.error) {
            ctx.mostrarErrorDeDialogo(pie.error, r);
            ctx.setMapStatus('no se importó el mapa: ' + r.error, true);
            return;
        }
        const i = r.informe.items;
        if (soloAnalizar) {
            ctx.setMapStatus('análisis: ' + r.informe.casillas.escritas + ' casillas, ' + i.porcentajeMapeado +
                '% de los objetos traducidos');
            return;
        }
        ctx.cerrarDialogo();
        await ctx.abrirMapaDeArchivo(r.nombre, 'mapa importado: ' + r.nombre + ' (' + r.informe.ancho + 'x' +
            r.informe.alto + ', ' + r.informe.casillas.escritas + ' casillas, ' + i.porcentajeMapeado +
            '% de los objetos traducidos)');
    }

    (entradas.otbm.value ? nombre : entradas.otbm).focus();
}

/** El informe de la importación, en filas cortas y con la lista de ids sin equivalencia. */
function pintarInforme(caja, informe, nodo) {
    const fila = (texto, valor) => {
        const f = nodo('div', 'copia-fila');
        f.appendChild(nodo('span', '', texto));
        if (valor !== undefined) {
            f.appendChild(nodo('em', '', String(valor)));
        }
        caja.appendChild(f);
    };
    const i = informe.items;
    caja.appendChild(nodo('div', 'section-title', 'Informe'));
    fila('Tamaño del mapa nuevo', informe.ancho + 'x' + informe.alto);
    fila('Casillas', informe.casillas.escritas + ' / ' + informe.casillas.leidas);
    fila('Objetos traducidos', i.mapeados + ' (' + i.porcentajeMapeado + '%)');
    fila('Quitados a propósito (bordes sin equivalente)', i.omitidos);
    fila('Sin equivalencia', i.sinEquivalencia + ' (' + informe.idsSinEquivalencia + ' ids)');
    fila('Ciudades', informe.ciudades.importadas + ' / ' + informe.ciudades.total);
    fila('Casas', informe.casas.importadas);
    fila('Waypoints', informe.waypoints.importados + ' / ' + informe.waypoints.total);
    fila('Respawns', informe.spawns.importados + ' (' + informe.spawns.monstruos + ' monstruos)');
    fila('Monstruos que no existen aquí', informe.spawns.monstruosDesconocidos);
    fila('Tiempo de lectura', Math.round(informe.tiempos.lectura || 0) + ' ms');
    if (informe.sinEquivalencia.length > 0) {
        caja.appendChild(nodo('div', 'section-title', 'Ids sin equivalencia (de más a menos)'));
        informe.sinEquivalencia.slice(0, 15).forEach((s) => {
            fila(s.id + ' ' + (s.nombre || ''), 'x' + s.veces);
        });
        caja.appendChild(nodo('div', 'nota', 'Para darles una, añádelos a «manual» en data/editor/equivalencias-otbm.json.'));
    }
    if (informe.spawns.desconocidos.length > 0) {
        caja.appendChild(nodo('div', 'nota', 'Monstruos que no existen en data/monsters: ' +
            informe.spawns.desconocidos.slice(0, 12).map((d) => d.nombre).join(', ')));
    }
    (informe.avisos || []).forEach((aviso) => caja.appendChild(nodo('div', 'nota', aviso)));
}
