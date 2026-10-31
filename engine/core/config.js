'use strict';

/**
 * Carga de `config.js`.
 *
 * Al ser un módulo de JavaScript, el objeto exportado **es** la configuración:
 * no hay claves que extraer del código ni lista que mantener sincronizada, que
 * era la parte delicada de la versión con Lua. Añadir una opción al archivo basta
 * para que llegue al motor.
 *
 * Los valores por defecto de aquí son sólo los que el motor necesita para poder
 * arrancar aunque el archivo no exista o esté incompleto. Todo lo demás lo
 * declara la configuración.
 */

const fs = require('fs');

const DEFAULTS = {
    serverName: 'Jetyum',
    // El idioma con el que abren el juego y las herramientas quien no ha elegido otro: 'en' | 'es'.
    defaultLanguage: 'en',
    dataDirectory: 'data',
    clientDirectory: 'client',
    itemsXml: 'data/items/items.xml',
    itemsOtb: 'data/items/items.otb',
    vocationsXml: 'data/XML/vocations.js',
    outfitsXml: 'data/XML/outfits.js',
    mountsXml: 'data/XML/mounts.js',
    groupsXml: 'data/XML/groups.js',
    scriptsDirectory: 'data/scripts',
    monstersDirectory: 'data/monsters',
    worldDirectory: 'data/world',
    mapName: 'world',
    loginProtocolPort: 7171,
    gameProtocolPort: 7172,
    enginePort: 8081,
    webPort: 8000,
    maxPlayers: 200,
    maxPacketsPerSecond: 50,
    maxMessageBytes: 64 * 1024,
    talkSpamMessages: 6,
    talkSpamWindowMs: 5000,
    // Los canales del chat (nivel y espera de cada uno) y la lista VIP: ver config.js.
    chatChannels: {
        juego: { level: 1 },
        comercio: { level: 1, cooldownMs: 2 * 60 * 1000 },
        ayuda: { level: 1 }
    },
    vipLimit: 20,
    scriptingEnabled: true,
    showScriptsLogInConsole: true,
    scriptErrorPolicy: 'abort',
    worldType: 'pvp',
    protectionLevel: 1,
    pzLocked: 60 * 1000,
    redSkullKills: 3,
    redSkullTime: 24 * 60 * 60 * 1000,
    whiteSkullTime: 15 * 60 * 1000,
    expShareRange: 30,
    tickIntervalMs: 50,
    newPlayerLevel: 1,
    newPlayerTownId: 1,
    // El objeto con el que empieza un personaje nuevo. Sin el no tendria donde llevar nada, y
    // como sin contenedor no se puede coger del suelo -ni una mochila-, el personaje se quedaria
    // sin poder jugar. Es lo mismo que hace Tibia.
    newPlayerContainerId: 2412,

    /**
     * El cuerpo de los monstruos que no declaran `corpse` en su ficha (o declaran uno que no
     * existe en items.xml): una caja de madera del OpenTibia Sprite Pack, para que el botín
     * tenga dónde ir. Y cuántos segundos se queda en el suelo antes de desaparecer.
     */
    corpseFallbackId: 11109,
    corpseFallbackDuration: 120,

    /**
     * LA MUERTE DEL JUGADOR (engine/world/combat.js y engine/world/muerte.js): el porcentaje que
     * se pierde de experiencia, skills y nivel mágico (-1, la fórmula de TFS por nivel), si se
     * pierden objetos, y si se pierden como en TFS (`deathItemLoss`: al cuerpo, a suertes y menos
     * con cada bendición) o todos al suelo. `playerCorpseId` es el cuerpo («dead human»).
     */
    deathLosePercent: 10,
    deathDropInventory: true,
    deathItemLoss: true,
    playerCorpseId: 12246,
    // Las casas (engine/world/casas.js): precio por casilla, nivel para comprar y cada cuánto se paga.
    housePriceEachSQM: 1000,
    houseLevel: 1,
    houseRentPeriod: 'monthly',
    // Los gremios (nivel para fundar uno) y los castigos (días de un /ban que no los dice).
    guildCreateLevel: 8,
    banDays: 7,
    rateExperience: 1,
    rateSkill: 1,
    rateMagic: 1,
    rateLoot: 1,
    rateSpawn: 1
};

/**
 * Carga la configuración.
 *
 * @param {string} filepath ruta de config.js
 * @param {Object} log
 * @param {Object} [overrides] valores que GANAN sobre el archivo
 * @returns {{config: Object, source: string|null, declaredKeys: number}}
 */
function load(filepath, log, overrides) {
    if (!fs.existsSync(filepath)) {
        log.warning('no se encontro ' + filepath + ': se usan los valores por defecto');
        return {
            config: { ...DEFAULTS, ...(overrides || {}) },
            source: null,
            declaredKeys: 0
        };
    }

    // Se descarta la caché para que recargar la configuración funcione.
    delete require.cache[require.resolve(filepath)];

    const exported = require(filepath);

    if (!exported || typeof exported !== 'object' || Array.isArray(exported)) {
        throw new Error('config.js debe exportar un objeto de configuracion');
    }

    // El archivo gana sobre los valores por defecto, pero las claves que no
    // declare siguen teniendo un valor sensato.
    //
    // Y las SOBREESCRITURAS ganan sobre el archivo, que es lo que permite que las
    // pruebas arranquen un motor con la persistencia apagada o con una base de datos
    // en un archivo temporal, sin tocar `config.js` ni ensuciar el repositorio.
    const config = { ...DEFAULTS, ...exported, ...(overrides || {}) };

    return {
        config: config,
        source: filepath,
        declaredKeys: Object.keys(exported).length
    };
}

module.exports = { load, DEFAULTS };
