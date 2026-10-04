'use strict';

/**
 * Configuración del motor.
 *
 * Es un módulo de JavaScript, así que el objeto exportado **es** la
 * configuración: no hay un formato intermedio que parsear ni una lista de claves
 * que mantener sincronizada. Lo que exportes es lo que ve el motor.
 *
 * Y al ser código, admite lo que un JSON no:
 *
 *   - Tablas anidadas con campos con nombre (las etapas de experiencia).
 *   - Cálculos: `maxPlayers: base * 2`.
 *   - Condicionales sobre el entorno, que es lo que permite tener un solo
 *     archivo para desarrollo y producción.
 *
 * Lo que NO debe hacer: efectos secundarios al cargarse (abrir puertos, conectar
 * a una base de datos). La configuración se lee, no se ejecuta como programa.
 */

const ENTORNO = process.env.NODE_ENV || 'development';
const ES_DESARROLLO = ENTORNO !== 'production';

module.exports = {

    // -----------------------------------------------------------------------
    // Identidad
    // -----------------------------------------------------------------------
    serverName: 'Jetyum',
    worldType: 'pvp',              // 'pvp' | 'no-pvp' | 'pvp-enforced'
    protectionLevel: 1,

    // -----------------------------------------------------------------------
    // Rutas
    //
    // El motor no asume ninguna disposición de carpetas: todo se declara aquí.
    // -----------------------------------------------------------------------
    dataDirectory: 'data',
    clientDirectory: 'client',

    itemsXml: 'data/items/items.xml',
    itemsOtb: 'data/items/items.otb',
    vocationsXml: 'data/XML/vocations.js',
    outfitsXml: 'data/XML/outfits.js',

    // Los NPC: `npcs.xml` lleva los datos estáticos y, junto a él, un módulo `.js` por
    // NPC con su diálogo. Es la disposición de TFS y se carga como contenido, así que
    // se recarga en caliente.
    npcDirectory: 'data/npc',
    scriptsDirectory: 'data/scripts',
    monstersDirectory: 'data/monsters',
    worldDirectory: 'data/world',

    // Nombre del mapa, SIN extensión: el motor resuelve
    // `<worldDirectory>/<mapName>.map.json`. `mapFile` permite apuntar a un
    // archivo concreto y gana sobre `mapName` si está definido.
    mapName: 'jetyum',
    mapFile: null,

    // ==========================================================================
    // Lo que el motor le ENVÍA a cada jugador
    // ==========================================================================
    // LO QUE SE VE EN EL CLIENTE, en casillas: ancho (x) y alto (y). El de Tibia es
    // 15x11; en una pantalla ancha, 21x11 (o más) llena el hueco de los lados en vez
    // de dejar franjas negras. Se redondea a impar, para que el personaje quede en el
    // centro. El motor manda 2 casillas más por cada lado (lo que entra deslizándose
    // al andar): más casillas es más tráfico en cada paso.
    visibleTilesX: 15,
    visibleTilesY: 11,

    // (Avanzado) Lo que se ENVÍA, si se quiere fijar a mano en vez de sacarlo de lo
    // visible: `viewWidth` y `viewHeight`. Sin ellos, es lo visible + 4.
    // viewWidth: 19,
    // viewHeight: 15,

    // Plantas que se envían por DEBAJO y por ENCIMA de la actual. NO es lo mismo
    // que la visibilidad de juego: aquélla decide a quién puedes ver, y ésta qué se
    // dibuja. Enviar las ocho plantas de superficie que la regla de juego permite
    // sería ocho veces el tráfico para dibujar una sola.
    //
    // Dos abajo es lo que hace falta para ver el fondo de un desnivel; una arriba,
    // para que el borde de un tejado no desaparezca al pasar por debajo. El número
    // exacto hay que ajustarlo cuando exista el renderer.
    viewFloorsBelow: 2,
    viewFloorsAbove: 1,

    // -----------------------------------------------------------------------
    // Red
    // -----------------------------------------------------------------------
    ip: '127.0.0.1',
    loginProtocolPort: 7171,
    gameProtocolPort: 7172,

    // Puerto del servidor de juego nuevo. Se separa de los dos de arriba, que son
    // los de Tibia y hoy sólo sirven de referencia: el motor nuevo habla JSON
    // sobre WebSocket, no el protocolo binario, así que no puede compartir puerto
    // con nada que espere aquél.
    enginePort: 8081,

    // Puerto del servidor web que sirve el cliente del navegador (engine/net/web.js):
    // http://localhost:8000/jetyum/. Lo arranca `npm start` junto al de juego.
    webPort: 8000,
    maxPlayers: ES_DESARROLLO ? 50 : 500,
    maxPacketsPerSecond: 50,

    // -----------------------------------------------------------------------
    // Persistencia
    // -----------------------------------------------------------------------
    //
    // Se puede APAGAR, y sirve para dos cosas: arrancar el motor sin dejar archivos
    // por el repositorio, y poder probar el juego sin crear una cuenta. Con la
    // persistencia apagada los personajes son efímeros: viven lo que vive el
    // proceso.
    useDatabase: true,
    databaseFile: 'data/jetyum.db',

    // Crear la cuenta sola al ENTRAR si no existe, con la contraseña que mande el cliente.
    //
    // Apagado: las cuentas se crean en el apartado «Crear cuenta» del cliente (con su
    // personaje, vocación y sexo). Encenderlo es una comodidad de desarrollo e inseguro:
    // cualquiera que escriba un nombre nuevo se crea una cuenta sin darse cuenta.
    autoCreateAccounts: false,

    // Los personajes tampoco se crean solos al entrar: se crean (con su vocación y sexo) en el
    // apartado «Crear cuenta» del cliente. Ponlo en true para que un nombre nuevo se cree al entrar.
    autoCreateCharacters: false,

    // Cada cuánto se guardan los jugadores que están dentro. Entre guardado y
    // guardado se pierde lo que haya pasado, así que cuanto más corto, menos se
    // pierde y más se escribe. Un minuto es el equilibrio que usa cualquier servidor
    // de este tamaño. Al desconectar y al apagar SIEMPRE se guarda.
    autosaveIntervalMs: 60000,

    // -----------------------------------------------------------------------
    // Muerte del jugador
    // -----------------------------------------------------------------------
    //
    // Sin castigo, morir no cuesta nada y el combate deja de tener tensión. Estas dos
    // son las que hacen que importe no morir, y son las de Tibia.
    //
    // El inventario se suelta en el sitio donde cayó, lo que convierte llevar cosas
    // encima en una decisión. Para un servidor de pruebas es molesto, así que se puede
    // apagar.
    deathLosePercent: 10,
    deathDropInventory: true,

    // -----------------------------------------------------------------------
    // Scripting
    // -----------------------------------------------------------------------
    // Interruptor maestro. Con esto en false el motor arranca sin cargar ningún
    // script, que es lo que se quiere para medir el coste base del mundo.
    scriptingEnabled: true,

    // Muestra en consola cada módulo de contenido que se carga.
    showScriptsLogInConsole: true,

    // Si un módulo de contenido falla al cargarse: 'abort' detiene el arranque
    // (útil mientras se desarrolla, para no arrancar con medio datapack) o
    // 'skip' lo descarta y sigue.
    scriptErrorPolicy: 'abort',

    // -----------------------------------------------------------------------
    // Mundo
    // -----------------------------------------------------------------------
    defaultWorldLight: { level: 250, color: 215 },

    // DÍA Y NOCHE: cuántos minutos reales dura un día del mundo. De noche el mapa se oscurece
    // y sólo se ve bien alrededor de quien lleva luz (una antorcha, el hechizo `utevo lux`).
    dayCycleMinutes: 60,

    // El cofre de DEPÓSITO (cada jugador guarda allí lo suyo, y se guarda con él). Se pone uno
    // junto al templo al arrancar (data/scripts/globalevents/arranque.js).
    depotItemId: 11112,

    // PvP: matar a tantos jugadores sin calavera en 24 h da la calavera ROJA. Atacar a quien no
    // la lleva pone la BLANCA durante 15 minutos.
    redSkullKills: 3,
    tickIntervalMs: 50,            // 20 Hz, el valor clásico de estos servidores

    // -----------------------------------------------------------------------
    // Jugador nuevo
    // -----------------------------------------------------------------------
    newPlayerLevel: 1,
    newPlayerHealth: 150,
    newPlayerMana: 0,
    newPlayerCap: 400,
    newPlayerSpawnPos: { x: 100, y: 100, z: 7 },
    newPlayerTownId: 1,

    // El objeto con el que EMPIEZA un personaje nuevo: la mochila (2412), que es el contenedor
    // del catalogo. Va aqui y no en `items.xml` porque no es una propiedad del objeto sino una
    // decision de este mundo, y va en el bloque del jugador nuevo porque es de quien empieza.
    //
    // NO ES UN ADORNO, ES LO QUE HACE JUGABLE A UN PERSONAJE NUEVO. Las cosas solo caben en un
    // contenedor, asi que sin mochila no se puede recoger nada del suelo... ni una mochila, que
    // es el problema del huevo y la gallina. En Tibia un personaje nuevo empieza con una puesta,
    // y aqui igual. Con `null` no se da nada, que es lo que quieren las pruebas que construyen
    // un mundo a mano.
    newPlayerContainerId: 2412,

    /**
     * El cuerpo de los monstruos que no declaran `corpse` en su ficha (o declaran uno que no
     * existe en items.xml): una caja de madera del OpenTibia Sprite Pack, para que el botín
     * tenga dónde ir. Y cuántos segundos se queda en el suelo antes de desaparecer.
     */
    corpseFallbackId: 11109,
    corpseFallbackDuration: 120,

    // -----------------------------------------------------------------------
    // Rates
    // -----------------------------------------------------------------------
    rateExperience: 1,
    rateSkill: 1,
    rateLoot: 1,
    rateSpawn: 1,

    // -----------------------------------------------------------------------
    // Etapas de experiencia
    //
    // `maxlevel: 0` significa "sin tope". Es el ejemplo que justifica que esto
    // sea código y no datos planos: la última etapa no tiene límite superior, y
    // un JSON obligaría a inventar un número centinela y a documentarlo.
    // -----------------------------------------------------------------------
    experienceStages: [
        { minlevel: 1, maxlevel: 50, multiplier: 100 },
        { minlevel: 51, maxlevel: 100, multiplier: 50 },
        { minlevel: 101, maxlevel: 150, multiplier: 25 },
        { minlevel: 151, maxlevel: 0, multiplier: 10 }
    ]
};
