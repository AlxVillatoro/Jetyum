/**
 * El cliente del API del editor.
 *
 * Envuelve `fetch` para que quien llama no tenga que acordarse de comprobar el estado,
 * analizar el JSON ni mirar si la respuesta traía un error. Todas las funciones
 * devuelven un objeto y NUNCA lanzan por un error del servidor: un 422 con una lista de
 * problemas es una respuesta normal de esta herramienta, no una excepción.
 */

async function request(method, route, body) {
    let response;

    try {
        response = await fetch(route, {
            method: method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (error) {
        // El servidor de herramientas no está levantado, o se cayó. Es el caso más
        // probable con diferencia y merece un mensaje que lo diga.
        return { error: 'no se pudo hablar con el servidor: ' + error.message };
    }

    let payload;
    try {
        payload = await response.json();
    } catch (error) {
        return { error: 'el servidor devolvio algo que no es JSON (estado ' + response.status + ')' };
    }

    if (!response.ok) {
        // Lo que el servidor añada al error (p. ej. `fuera`, cuánto se quedaría fuera al encoger
        // un mapa) llega también: quien llama decide si lo enseña.
        return {
            ...payload,
            error: payload.error || ('el servidor respondio ' + response.status),
            problems: payload.problems || [],
            status: response.status
        };
    }

    return payload;
}

export class ApiClient {
    constructor(options) {
        const opts = options || {};
        this.base = opts.base || '';
    }

    status() {
        return request('GET', this.base + '/api/status');
    }

    listMaps() {
        return request('GET', this.base + '/api/maps');
    }

    getMap(name) {
        return request('GET', this.base + '/api/map?name=' + encodeURIComponent(name));
    }

    /**
     * Guarda las ediciones de un mapa.
     *
     * SE MANDAN TRES COSAS DISTINTAS, y van separadas porque son estados de cosas distintas:
     * `edits` son las CASILLAS tocadas (cómo debe quedar cada tile), y `spawns` y `npcs` son
     * las listas enteras de respawns y de NPC, que no son casillas y no pueden viajar como si
     * lo fueran. Si un respawn fuera una edición de casilla, guardarlo borraría el suelo y los
     * objetos de su casilla.
     *
     * @param {string} name
     * @param {Array} edits las casillas tocadas
     * @param {Object} [opciones] `{spawns, npcs, dryRun}`; las listas sólo se mandan si se han
     *        tocado, para que un guardado que sólo pinta un muro no reescriba los respawns
     */
    saveMap(name, edits, opciones) {
        const opts = opciones || {};
        const cuerpo = {
            name: name,
            edits: edits,
            dryRun: opts.dryRun === true
        };

        if (opts.spawns !== undefined) {
            cuerpo.spawns = opts.spawns;
        }
        if (opts.npcs !== undefined) {
            cuerpo.npcs = opts.npcs;
        }
        ['composites', 'waypoints', 'towns', 'houses'].forEach((clave) => {
            if (opts[clave] !== undefined) {
                cuerpo[clave] = opts[clave];
            }
        });

        return request('POST', this.base + '/api/map', cuerpo);
    }

    // --- Archivos de mapa: nuevo, guardar como, propiedades y copias de seguridad ---

    /**
     * Crea un mapa nuevo con lo mínimo para que el motor lo arranque: el suelo de la superficie,
     * una ciudad con su templo en el centro y el waypoint `temple`.
     *
     * @param {Object} datos `{nombre, ancho, alto, plantas?, sueloPorDefecto, sueloDeRespaldo?,
     *        descripcion?, ciudad?, dryRun?}`. Responde 201 con `{nombre, propiedades, stats}`;
     *        409 si ya existe, 400 si el nombre o el tamaño no valen, 422 si el suelo no vale.
     */
    crearMapa(datos) {
        return request('POST', this.base + '/api/maps', datos || {});
    }

    /**
     * Sube un archivo (`.otbm`, `.otb` o `.xml`) para importarlo. Va TAL CUAL en el cuerpo, sin
     * JSON: un mapa de Tibia pasa de los 4 MB que admite el resto del API. Responde `{ruta, bytes}`,
     * la ruta en el servidor que luego se le da a `importarOtbm`.
     *
     * @param {File|Blob} archivo
     * @param {string} nombre el nombre original (por su extensión)
     */
    async subirArchivo(archivo, nombre) {
        let response;
        try {
            response = await fetch(this.base + '/api/subidas?nombre=' + encodeURIComponent(nombre || archivo.name),
                { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: archivo });
        } catch (error) {
            return { error: 'no se pudo hablar con el servidor: ' + error.message };
        }
        let payload;
        try {
            payload = await response.json();
        } catch (error) {
            return { error: 'el servidor devolvio algo que no es JSON (estado ' + response.status + ')' };
        }
        return response.ok ? payload
            : Object.assign({}, payload, { error: payload.error || ('el servidor respondio ' + response.status) });
    }

    /**
     * Importar un OTBM: crea `data/world/<nombre>.map.json` a partir de un `.otbm` y sus archivos.
     *
     * @param {Object} datos `{nombre, otbm, itemsOtb, itemsXml?, casas?, spawns?, materiales?, area?,
     *        desplazar?, dryRun?}` (las rutas, en el servidor). Responde `{nombre, informe}`; con
     *        `dryRun`, solo el informe (es «Analizar»). 409 si el mapa ya existe.
     */
    importarOtbm(datos) {
        return request('POST', this.base + '/api/maps/importar-otbm', datos || {});
    }

    /**
     * Guardar como: escribe el mapa `nombre` con otro nombre SIN TOCAR EL ORIGINAL.
     *
     * @param {string} nombre el mapa abierto
     * @param {string} nuevoNombre el archivo que se crea (nunca pisa uno que exista: 409)
     * @param {Object} [cambios] lo que todavía no se ha guardado, con los mismos campos que
     *        `saveMap` (`{edits, spawns, npcs, composites, waypoints, towns, houses}`): se aplica a
     *        la copia y sólo a la copia. Sin cambios, se copia el archivo guardado.
     */
    guardarMapaComo(nombre, nuevoNombre, cambios) {
        const cuerpo = Object.assign({}, cambios || {}, { nuevoNombre: nuevoNombre });
        return request('POST', this.base + '/api/maps/' + encodeURIComponent(nombre) + '/copia', cuerpo);
    }

    /** `{propiedades: {nombre, descripcion, ancho, alto, plantas, suelos, sueloDeRespaldo, limites}}` */
    getPropiedadesMapa(nombre) {
        return request('GET', this.base + '/api/maps/' + encodeURIComponent(nombre) + '/propiedades');
    }

    /**
     * Cambia las propiedades de un mapa. Sólo se manda lo que cambia: `{nombre?, descripcion?,
     * ancho?, alto?, plantas?, suelos?: {planta: objeto|null}, sueloDeRespaldo?: objeto|null,
     * dryRun?}`. Encoger con cosas fuera responde 422 con `problems` y `fuera` (cuántas de cada
     * clase) y no toca nada. Al renombrar, la respuesta trae el `nombre` nuevo y quizá un `aviso`.
     */
    savePropiedadesMapa(nombre, propiedades) {
        return request('PUT', this.base + '/api/maps/' + encodeURIComponent(nombre) + '/propiedades',
            propiedades || {});
    }

    /** `{nombre, maximo, copias: [{archivo, fecha, bytes}]}`, de la más nueva a la más vieja. */
    listarCopiasMapa(nombre) {
        return request('GET', this.base + '/api/maps/' + encodeURIComponent(nombre) + '/copias');
    }

    /**
     * Vuelve el mapa a una copia de seguridad (haciendo antes copia del estado actual). Después
     * hay que volver a abrir el mapa con `getMap`: lo que hay en el editor ya no es lo guardado.
     */
    restaurarCopiaMapa(nombre, archivo, dryRun) {
        return request('POST', this.base + '/api/maps/' + encodeURIComponent(nombre) + '/copias/' +
            encodeURIComponent(archivo) + '/restaurar', { dryRun: dryRun === true });
    }

    /**
     * Los monstruos que existen, de `data/monsters/`.
     *
     * Salen del servidor y NO de una lista escrita en el navegador: un monstruo nuevo en el
     * datapack tiene que aparecer solo en la lista del editor, que es el mismo motivo por el
     * que la paleta de objetos se construye con lo que devuelve el API.
     */
    // --- Assets: sprites de 32x32 y things.json ---

    getAssets() {
        return request('GET', this.base + '/api/assets');
    }

    saveThings(things, dryRun) {
        return request('POST', this.base + '/api/assets/things', { things: things, dryRun: dryRun === true });
    }

    checkAssets() {
        return request('GET', this.base + '/api/assets/check');
    }

    /** @param {string[]} sprites RGBA de 32x32 en base64 */
    addSprites(sprites, dedupe) {
        return request('POST', this.base + '/api/sprites', { sprites: sprites, dedupe: dedupe !== false });
    }

    replaceSprite(id, sprite) {
        return request('POST', this.base + '/api/sprites/replace', { id: id, sprite: sprite });
    }

    clearSprite(id) {
        return request('POST', this.base + '/api/sprites/clear', { id: id });
    }

    spriteUsage(id) {
        return request('GET', this.base + '/api/sprites/usage?id=' + encodeURIComponent(id));
    }

    getPinceles() {
        return request('GET', this.base + '/api/pinceles');
    }

    // --- Objetos compuestos ---

    getCompuestos() {
        return request('GET', this.base + '/api/compuestos');
    }

    saveCompuestos(data) {
        return request('POST', this.base + '/api/compuestos', { data: data });
    }

    getMonsters() {
        return request('GET', this.base + '/api/monsters');
    }

    /** Los NPC definidos en `data/npc/npcs.xml`, con su radio de paseo. */
    getNpcs() {
        return request('GET', this.base + '/api/npcs');
    }

    getItems() {
        return request('GET', this.base + '/api/items');
    }

    saveItem(item) {
        return request('POST', this.base + '/api/items', { item: item });
    }

    /**
     * Borra un objeto.
     *
     * El API no tiene borrado propio: se manda el objeto SIN contenido y el servidor
     * lo interpreta. Si se añade un `DELETE` de verdad, este es el sitio.
     */
    async deleteItem(id) {
        const current = await this.getItems();
        const item = current.items.find((entry) => entry.id === Number(id));

        if (!item) {
            return { error: 'no existe el objeto ' + id };
        }

        // El servidor sólo sabe añadir o sustituir, así que borrar es sustituir por un
        // objeto sin propiedades... que no es lo mismo. Se hace con un `DELETE` de
        // verdad, que es lo honesto.
        return request('DELETE', this.base + '/api/items?id=' + encodeURIComponent(id));
    }
}
