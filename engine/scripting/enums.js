'use strict';

/**
 * LAS CONSTANTES DE TFS, como globales de los scripts (`MESSAGE_INFO_DESCR`, `CONST_SLOT_HEAD`,
 * `CONDITION_POISON`, `SKULL_WHITE`, `DIRECTION_NORTH`...).
 *
 * Existen para que un script copiado de un datapack de The Forgotten Server (1.x o 0.x) CARGUE y
 * funcione. En Lua una global que no existe vale `nil` y el script sigue; en JavaScript es un
 * `ReferenceError` que lo tumba. Por eso están todas las de uso común, aunque algunas no signifiquen
 * nada aquí (no hay tipos de mensaje en el cliente, ni mundo «enforced»): llevan EL MISMO NÚMERO que
 * en TFS 1.x y la API las acepta o las ignora sin romperse.
 *
 * Además de las tablas, aquí están las TRADUCCIONES entre los números de TFS y los nombres de Jetyum
 * (la condición 1 es 'veneno', la ranura 5 es 'hand', el combate 8 es 'fire'...), para que los
 * envoltorios y las funciones de compatibilidad acepten las dos formas.
 *
 * Los efectos y los proyectiles (`CONST_ME_*`, `CONST_ANI_*`) están en `shared/js/efectos.mjs`, que
 * los comparte con el cliente; aquí sólo se completan los nombres de TFS que el pack no tiene, cada
 * uno con el efecto más parecido (el mismo criterio que allí).
 */

const { EFECTO, PROYECTIL, CONST_ME, CONST_ANI } = require('../../shared/js/efectos.mjs');

// ---------------------------------------------------------------------------
// Mensajes y habla
// ---------------------------------------------------------------------------

/**
 * Los tipos de mensaje de `player:sendTextMessage(type, text)`. El cliente de Jetyum tiene una sola
 * consola, así que todos llegan igual: el número se acepta y no cambia nada.
 */
const MESSAGE = {
    MESSAGE_STATUS_CONSOLE_BLUE: 4,
    MESSAGE_STATUS_CONSOLE_RED: 13,
    MESSAGE_STATUS_DEFAULT: 17,
    MESSAGE_STATUS_WARNING: 18,
    MESSAGE_EVENT_ADVANCE: 19,
    MESSAGE_STATUS_SMALL: 21,
    MESSAGE_INFO_DESCR: 22,
    MESSAGE_DAMAGE_DEALT: 23,
    MESSAGE_DAMAGE_RECEIVED: 24,
    MESSAGE_HEALED: 25,
    MESSAGE_EXPERIENCE: 26,
    MESSAGE_DAMAGE_OTHERS: 27,
    MESSAGE_HEALED_OTHERS: 28,
    MESSAGE_EXPERIENCE_OTHERS: 29,
    MESSAGE_EVENT_DEFAULT: 30,
    MESSAGE_LOOT: 31,
    MESSAGE_GUILD: 33,
    MESSAGE_PARTY_MANAGEMENT: 34,
    MESSAGE_PARTY: 35,
    MESSAGE_EVENT_ORANGE: 36,
    MESSAGE_STATUS_CONSOLE_ORANGE: 37,
    // Los de 0.x que ya no existen en 1.x: caen en el más parecido.
    MESSAGE_FIRST: 4,
    MESSAGE_LAST: 37,
    MESSAGE_STATUS_CONSOLE_YELLOW: 37
};

/** Por dónde se dice algo: el cuarto argumento de `onSay` (los tres primeros, los de registry.js). */
const TALKTYPE = {
    TALKTYPE_SAY: 1,
    TALKTYPE_WHISPER: 2,
    TALKTYPE_YELL: 3,
    TALKTYPE_PRIVATE_FROM: 4,
    TALKTYPE_PRIVATE_TO: 5,
    TALKTYPE_CHANNEL_Y: 7,
    TALKTYPE_CHANNEL_O: 8,
    TALKTYPE_PRIVATE_NP: 10,
    TALKTYPE_PRIVATE_PN: 12,
    TALKTYPE_BROADCAST: 13,
    TALKTYPE_CHANNEL_R1: 14,
    TALKTYPE_PRIVATE_RED_FROM: 15,
    TALKTYPE_PRIVATE_RED_TO: 16,
    TALKTYPE_MONSTER_SAY: 36,
    TALKTYPE_MONSTER_YELL: 37,
    TALKTYPE_CHANNEL_R2: 255
};

// ---------------------------------------------------------------------------
// Ranuras del equipo
// ---------------------------------------------------------------------------

const CONST_SLOT = {
    CONST_SLOT_WHEREEVER: 0,
    CONST_SLOT_HEAD: 1,
    CONST_SLOT_NECKLACE: 2,
    CONST_SLOT_BACKPACK: 3,
    CONST_SLOT_ARMOR: 4,
    CONST_SLOT_RIGHT: 5,
    CONST_SLOT_LEFT: 6,
    CONST_SLOT_LEGS: 7,
    CONST_SLOT_FEET: 8,
    CONST_SLOT_RING: 9,
    CONST_SLOT_AMMO: 10,
    CONST_SLOT_FIRST: 1,
    CONST_SLOT_LAST: 10
};

/** La ranura de Jetyum de cada `CONST_SLOT_*` (la derecha es el arma; la izquierda, el escudo). */
const RANURA_DE_SLOT = {
    1: 'head', 2: 'necklace', 3: 'backpack', 4: 'body', 5: 'hand',
    6: 'shield', 7: 'legs', 8: 'feet', 9: 'ring', 10: 'ammo'
};

/** Y al revés: el `CONST_SLOT_*` de una ranura de Jetyum. */
const SLOT_DE_RANURA = Object.fromEntries(Object.entries(RANURA_DE_SLOT).map(([n, r]) => [r, Number(n)]));

/** Las máscaras de `ItemType:getSlotPosition()` (SLOTP_* de TFS). */
const SLOTP = {
    SLOTP_WHEREEVER: 0xFFFFFFFF,
    SLOTP_HEAD: 1,
    SLOTP_NECKLACE: 2,
    SLOTP_BACKPACK: 4,
    SLOTP_ARMOR: 8,
    SLOTP_RIGHT: 16,
    SLOTP_LEFT: 32,
    SLOTP_LEGS: 64,
    SLOTP_FEET: 128,
    SLOTP_RING: 256,
    SLOTP_AMMO: 512,
    SLOTP_DEPOT: 1024,
    SLOTP_TWO_HAND: 2048,
    SLOTP_HAND: 48
};

/** La máscara SLOTP_* de una ranura de Jetyum. */
const SLOTP_DE_RANURA = {
    head: 1, necklace: 2, backpack: 4, body: 8, hand: 48, shield: 48,
    legs: 64, feet: 128, ring: 256, ammo: 512
};

// ---------------------------------------------------------------------------
// Combate y condiciones
// ---------------------------------------------------------------------------

/** Los tipos de daño (`CombatType_t`). Se traducen a los elementos de Jetyum (`ELEMENTO_DE_COMBATE`). */
const COMBAT = {
    COMBAT_NONE: 0,
    COMBAT_PHYSICALDAMAGE: 1,
    COMBAT_ENERGYDAMAGE: 2,
    COMBAT_EARTHDAMAGE: 4,
    COMBAT_POISONDAMAGE: 4,
    COMBAT_FIREDAMAGE: 8,
    COMBAT_UNDEFINEDDAMAGE: 16,
    COMBAT_LIFEDRAIN: 32,
    COMBAT_MANADRAIN: 64,
    COMBAT_HEALING: 128,
    COMBAT_DROWNDAMAGE: 256,
    COMBAT_ICEDAMAGE: 512,
    COMBAT_HOLYDAMAGE: 1024,
    COMBAT_DEATHDAMAGE: 2048
};

const ELEMENTO_DE_COMBATE = {
    0: 'physical', 1: 'physical', 2: 'energy', 4: 'earth', 8: 'fire', 16: 'physical',
    32: 'lifedrain', 64: 'manadrain', 128: 'healing', 256: 'drown', 512: 'ice', 1024: 'holy', 2048: 'death'
};

/** Y al revés, para avisar a `onHealthChange` con el número de TFS. */
const COMBATE_DE_ELEMENTO = {
    physical: 1, energy: 2, earth: 4, poison: 4, fire: 8, lifedrain: 32, manadrain: 64,
    healing: 128, drown: 256, ice: 512, holy: 1024, death: 2048
};

/** De dónde viene un daño (`CombatOrigin`): el último argumento de `onHealthChange`. */
const ORIGIN = {
    ORIGIN_NONE: 0,
    ORIGIN_CONDITION: 1,
    ORIGIN_SPELL: 2,
    ORIGIN_MELEE: 3,
    ORIGIN_RANGED: 4
};

/** Las condiciones (`ConditionType_t`). Las que Jetyum tiene se traducen con `CONDICION_DE_TIPO`. */
const CONDITION = {
    CONDITION_NONE: 0,
    CONDITION_POISON: 1,
    CONDITION_FIRE: 2,
    CONDITION_ENERGY: 4,
    CONDITION_BLEEDING: 8,
    CONDITION_HASTE: 16,
    CONDITION_PARALYZE: 32,
    CONDITION_OUTFIT: 64,
    CONDITION_INVISIBLE: 128,
    CONDITION_LIGHT: 256,
    CONDITION_MANASHIELD: 512,
    CONDITION_INFIGHT: 1024,
    CONDITION_DRUNK: 2048,
    CONDITION_EXHAUST_WEAPON: 4096,
    CONDITION_REGENERATION: 8192,
    CONDITION_SOUL: 16384,
    CONDITION_DROWN: 32768,
    CONDITION_MUTED: 65536,
    CONDITION_CHANNELMUTEDTICKS: 131072,
    CONDITION_YELLTICKS: 262144,
    CONDITION_ATTRIBUTES: 524288,
    CONDITION_FREEZING: 1048576,
    CONDITION_DAZZLED: 2097152,
    CONDITION_CURSED: 4194304,
    CONDITION_EXHAUST_COMBAT: 8388608,
    CONDITION_EXHAUST_HEAL: 16777216,
    CONDITION_PACIFIED: 33554432,
    CONDITION_SPELLCOOLDOWN: 67108864,
    CONDITION_SPELLGROUPCOOLDOWN: 134217728,
    // 0.x
    CONDITION_EXHAUST: 4096,
    CONDITION_PHYSICAL: 8
};

/** El nombre de Jetyum (engine/world/condiciones.js) de cada condición de TFS que existe aquí. */
const CONDICION_DE_TIPO = {
    1: 'veneno', 2: 'fuego', 4: 'energia', 8: 'sangrado', 16: 'prisa', 32: 'paralisis',
    256: 'luz', 8192: 'regeneracion'
};

/** Y al revés. */
const TIPO_DE_CONDICION = Object.fromEntries(Object.entries(CONDICION_DE_TIPO).map(([n, c]) => [c, Number(n)]));

/** Los parámetros de `condition:setParameter(...)` (`ConditionParam_t`). */
const CONDITION_PARAM = {
    CONDITION_PARAM_OWNER: 1,
    CONDITION_PARAM_TICKS: 2,
    CONDITION_PARAM_HEALTHGAIN: 4,
    CONDITION_PARAM_HEALTHTICKS: 5,
    CONDITION_PARAM_MANAGAIN: 6,
    CONDITION_PARAM_MANATICKS: 7,
    CONDITION_PARAM_DELAYED: 8,
    CONDITION_PARAM_SPEED: 9,
    CONDITION_PARAM_LIGHT_LEVEL: 10,
    CONDITION_PARAM_LIGHT_COLOR: 11,
    CONDITION_PARAM_SOULGAIN: 12,
    CONDITION_PARAM_SOULTICKS: 13,
    CONDITION_PARAM_MINVALUE: 14,
    CONDITION_PARAM_MAXVALUE: 15,
    CONDITION_PARAM_STARTVALUE: 16,
    CONDITION_PARAM_TICKINTERVAL: 17,
    CONDITION_PARAM_FORCEUPDATE: 18,
    CONDITION_PARAM_SUBID: 45,
    CONDITION_PARAM_PERIODICDAMAGE: 48
};

const CONDITIONID = {
    CONDITIONID_DEFAULT: -1,
    CONDITIONID_COMBAT: 0,
    CONDITIONID_HEAD: 1,
    CONDITIONID_NECKLACE: 2,
    CONDITIONID_BACKPACK: 3,
    CONDITIONID_ARMOR: 4,
    CONDITIONID_RIGHT: 5,
    CONDITIONID_LEFT: 6,
    CONDITIONID_LEGS: 7,
    CONDITIONID_FEET: 8,
    CONDITIONID_RING: 9,
    CONDITIONID_AMMO: 10
};

// ---------------------------------------------------------------------------
// Jugador
// ---------------------------------------------------------------------------

/** Las skills por número (`skills_t`), para `getSkillLevel(SKILL_SWORD)`. */
const SKILL = {
    SKILL_FIST: 0,
    SKILL_CLUB: 1,
    SKILL_SWORD: 2,
    SKILL_AXE: 3,
    SKILL_DISTANCE: 4,
    SKILL_SHIELD: 5,
    SKILL_FISHING: 6,
    SKILL_MAGLEVEL: 7,
    SKILL_LEVEL: 8,
    SKILL_FIRST: 0,
    SKILL_LAST: 6
};

/** El nombre de Jetyum (vocacion.js) de cada SKILL_* que es una skill de verdad. */
const SKILL_DE_NUMERO = ['fist', 'club', 'sword', 'axe', 'distance', 'shielding', 'fishing'];

/** Las calaveras (`Skulls_t`). Jetyum sólo tiene la blanca y la roja (`player.getSkull()`). */
const SKULL = {
    SKULL_NONE: 0,
    SKULL_YELLOW: 1,
    SKULL_GREEN: 2,
    SKULL_WHITE: 3,
    SKULL_RED: 4,
    SKULL_BLACK: 5,
    SKULL_ORANGE: 6
};

const CALAVERA_DE_TEXTO = { '': 0, blanca: 3, roja: 4 };

const PLAYERSEX = {
    PLAYERSEX_FEMALE: 0,
    PLAYERSEX_MALE: 1
};

/** Los tipos de cuenta de TFS. En Jetyum es el grupo: los ids de groups.js coinciden (1 jugador ... 6 god). */
const ACCOUNT_TYPE = {
    ACCOUNT_TYPE_NORMAL: 1,
    ACCOUNT_TYPE_TUTOR: 2,
    ACCOUNT_TYPE_SENIORTUTOR: 3,
    ACCOUNT_TYPE_GAMEMASTER: 4,
    ACCOUNT_TYPE_COMMUNITYMANAGER: 5,
    ACCOUNT_TYPE_GOD: 6
};

/**
 * Las banderas de grupo (`PlayerFlags`). Son bits de 64, así que se guardan como potencias de 2
 * (no como `1 << n`, que en JavaScript se corta a 32 bits) y se comprueban con aritmética.
 */
const NOMBRES_DE_BANDERA = [
    'CannotUseCombat', 'CannotAttackPlayer', 'CannotAttackMonster', 'CannotBeAttacked', 'CanConvinceAll',
    'CanSummonAll', 'CanIllusionAll', 'CanSenseInvisibility', 'IgnoredByMonsters', 'NotGainInFight',
    'HasInfiniteMana', 'HasInfiniteSoul', 'HasNoExhaustion', 'CannotUseSpells', 'CannotPickupItem',
    'CanAlwaysLogin', 'CanBroadcast', 'CanEditHouses', 'CannotBeBanned', 'CannotBePushed',
    'HasInfiniteCapacity', 'CanPushAllCreatures', 'CanTalkRedPrivate', 'CanTalkRedChannel',
    'TalkOrangeHelpChannel', 'NotGainExperience', 'NotGainMana', 'NotGainHealth', 'NotGainSkill',
    'SetMaxSpeed', 'SpecialVIP', 'NotGenerateLoot', 'CanTalkRedChannelAnonymous', 'IgnoreProtectionZone',
    'IgnoreSpellCheck', 'IgnoreWeaponCheck', 'CannotBeMuted', 'IsAlwaysPremium'
];
const PLAYER_FLAG = {};
NOMBRES_DE_BANDERA.forEach((nombre, i) => {
    PLAYER_FLAG['PlayerFlag_' + nombre] = 2 ** i;
});

/**
 * Lo que de verdad puede el PERSONAL en Jetyum (un grupo con `access: true`, reglas.js): entrar con
 * el servidor lleno y abrir/editar cualquier casa (`houseAccessLevel`). Es lo que `Group:hasFlag`
 * responde si el grupo no declara sus `flags` en groups.js.
 */
const BANDERAS_DEL_PERSONAL = PLAYER_FLAG.PlayerFlag_CanAlwaysLogin + PLAYER_FLAG.PlayerFlag_CanEditHouses;

/** ¿Lleva la bandera? Sin operadores de bits: las banderas pasan de 32 bits. */
function tieneBandera(banderas, bandera) {
    const b = Number(bandera) || 0;
    return b > 0 && Math.floor((Number(banderas) || 0) / b) % 2 === 1;
}

// ---------------------------------------------------------------------------
// Mapa y mundo
// ---------------------------------------------------------------------------

/** Direcciones (`Direction`): las cuatro de Jetyum y las diagonales de TFS. */
const DIRECTION = {
    DIRECTION_NORTH: 0,
    DIRECTION_EAST: 1,
    DIRECTION_SOUTH: 2,
    DIRECTION_WEST: 3,
    DIRECTION_SOUTHWEST: 4,
    DIRECTION_SOUTHEAST: 5,
    DIRECTION_NORTHWEST: 6,
    DIRECTION_NORTHEAST: 7,
    DIRECTION_NONE: 8,
    // 0.x
    NORTH: 0,
    EAST: 1,
    SOUTH: 2,
    WEST: 3,
    SOUTHWEST: 4,
    SOUTHEAST: 5,
    NORTHWEST: 6,
    NORTHEAST: 7
};

/** El paso de cada dirección: `[dx, dy]`. */
const PASO_DE_DIRECCION = {
    0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0],
    4: [-1, 1], 5: [1, 1], 6: [-1, -1], 7: [1, -1]
};

/** Las zonas (`ZoneType_t`), lo que devuelve `creature:getZone()` y `tile:getZone()`. */
const ZONE = {
    ZONE_PROTECTION: 0,
    ZONE_NOPVP: 1,
    ZONE_PVP: 2,
    ZONE_NOLOGOUT: 3,
    ZONE_NORMAL: 4
};

/** Las banderas de casilla de TFS (`tileflags_t`), para `tile:hasFlag(TILESTATE_PROTECTIONZONE)`. */
const TILESTATE = {
    TILESTATE_NONE: 0,
    TILESTATE_FLOORCHANGE_DOWN: 1,
    TILESTATE_FLOORCHANGE_NORTH: 2,
    TILESTATE_FLOORCHANGE_SOUTH: 4,
    TILESTATE_FLOORCHANGE_EAST: 8,
    TILESTATE_FLOORCHANGE_WEST: 16,
    TILESTATE_FLOORCHANGE_SOUTH_ALT: 32,
    TILESTATE_FLOORCHANGE_EAST_ALT: 64,
    TILESTATE_PROTECTIONZONE: 128,
    TILESTATE_NOPVPZONE: 256,
    TILESTATE_NOLOGOUT: 512,
    TILESTATE_PVPZONE: 1024,
    TILESTATE_TELEPORT: 2048,
    TILESTATE_MAGICFIELD: 4096,
    TILESTATE_MAILBOX: 8192,
    TILESTATE_TRASHHOLDER: 16384,
    TILESTATE_BED: 32768,
    TILESTATE_DEPOT: 65536,
    TILESTATE_BLOCKSOLID: 131072,
    TILESTATE_BLOCKPATH: 262144,
    TILESTATE_IMMOVABLEBLOCKSOLID: 524288,
    TILESTATE_IMMOVABLEBLOCKPATH: 1048576,
    TILESTATE_IMMOVABLENOFIELDBLOCKPATH: 2097152,
    TILESTATE_NOFIELDBLOCKPATH: 4194304,
    TILESTATE_SUPPORTS_HANGABLE: 8388608,
    TILESTATE_FLOORCHANGE: 127,
    // Jetyum guarda las casas aparte (tile.houseId); se acepta igual.
    TILESTATE_HOUSE: 16777216
};

/** Las propiedades de `item:hasProperty` y `tile:hasProperty` (`ITEMPROPERTY`). */
const CONST_PROP = {
    CONST_PROP_BLOCKSOLID: 0,
    CONST_PROP_HASHEIGHT: 1,
    CONST_PROP_BLOCKPROJECTILE: 2,
    CONST_PROP_BLOCKPATH: 3,
    CONST_PROP_ISVERTICAL: 4,
    CONST_PROP_ISHORIZONTAL: 5,
    CONST_PROP_MOVEABLE: 6,
    CONST_PROP_IMMOVABLEBLOCKSOLID: 7,
    CONST_PROP_IMMOVABLEBLOCKPATH: 8,
    CONST_PROP_IMMOVABLENOFIELDBLOCKPATH: 9,
    CONST_PROP_NOFIELDBLOCKPATH: 10,
    CONST_PROP_SUPPORTHANGABLE: 11
};

/** Los tipos de objeto (`ItemTypes_t`), `ItemType:getType()`. */
const ITEM_TYPE = {
    ITEM_TYPE_NONE: 0,
    ITEM_TYPE_DEPOT: 1,
    ITEM_TYPE_MAILBOX: 2,
    ITEM_TYPE_TRASHHOLDER: 3,
    ITEM_TYPE_CONTAINER: 4,
    ITEM_TYPE_DOOR: 5,
    ITEM_TYPE_MAGICFIELD: 6,
    ITEM_TYPE_TELEPORT: 7,
    ITEM_TYPE_BED: 8,
    ITEM_TYPE_KEY: 9,
    ITEM_TYPE_RUNE: 10
};

/** Los atributos de objeto por número (`itemAttrTypes`), y su nombre en Jetyum. */
const ITEM_ATTRIBUTE = {
    ITEM_ATTRIBUTE_NONE: 0,
    ITEM_ATTRIBUTE_ACTIONID: 1,
    ITEM_ATTRIBUTE_UNIQUEID: 2,
    ITEM_ATTRIBUTE_DESCRIPTION: 4,
    ITEM_ATTRIBUTE_TEXT: 8,
    ITEM_ATTRIBUTE_DATE: 16,
    ITEM_ATTRIBUTE_WRITER: 32,
    ITEM_ATTRIBUTE_NAME: 64,
    ITEM_ATTRIBUTE_ARTICLE: 128,
    ITEM_ATTRIBUTE_PLURALNAME: 256,
    ITEM_ATTRIBUTE_WEIGHT: 512,
    ITEM_ATTRIBUTE_ATTACK: 1024,
    ITEM_ATTRIBUTE_DEFENSE: 2048,
    ITEM_ATTRIBUTE_EXTRADEFENSE: 4096,
    ITEM_ATTRIBUTE_ARMOR: 8192,
    ITEM_ATTRIBUTE_HITCHANCE: 16384,
    ITEM_ATTRIBUTE_SHOOTRANGE: 32768,
    ITEM_ATTRIBUTE_OWNER: 65536,
    ITEM_ATTRIBUTE_DURATION: 131072,
    ITEM_ATTRIBUTE_DECAYSTATE: 262144,
    ITEM_ATTRIBUTE_CORPSEOWNER: 524288,
    ITEM_ATTRIBUTE_CHARGES: 1048576,
    ITEM_ATTRIBUTE_FLUIDTYPE: 2097152,
    ITEM_ATTRIBUTE_DOORID: 4194304
};

const CLAVE_DE_ATRIBUTO = {
    1: 'actionId', 2: 'uniqueId', 4: 'description', 8: 'text', 16: 'date', 32: 'writer', 64: 'name',
    128: 'article', 256: 'pluralName', 512: 'weight', 1024: 'attack', 2048: 'defense', 4096: 'extraDefense',
    8192: 'armor', 16384: 'hitChance', 32768: 'shootRange', 65536: 'owner', 131072: 'duration',
    262144: 'decayState', 524288: 'corpseOwner', 1048576: 'charges', 2097152: 'fluidType', 4194304: 'doorId'
};

/** La clave de un atributo: el nombre tal cual, o el de Jetyum si viene un ITEM_ATTRIBUTE_*. */
function claveDeAtributo(clave) {
    if (typeof clave === 'number') {
        return CLAVE_DE_ATRIBUTO[clave] || String(clave);
    }
    return String(clave);
}

/** Unos pocos `ReturnValue` de TFS, con su número. */
const RETURNVALUE = {
    RETURNVALUE_NOERROR: 0,
    RETURNVALUE_NOTPOSSIBLE: 1,
    RETURNVALUE_NOTENOUGHROOM: 2,
    RETURNVALUE_PLAYERISPZLOCKED: 3,
    RETURNVALUE_PLAYERISNOTINVITED: 4,
    RETURNVALUE_CANNOTTHROW: 5,
    RETURNVALUE_THEREISNOWAY: 6,
    RETURNVALUE_DESTINATIONOUTOFREACH: 7,
    RETURNVALUE_CREATUREBLOCK: 8,
    RETURNVALUE_NOTMOVEABLE: 9,
    RETURNVALUE_DROPTWOHANDEDITEM: 10,
    RETURNVALUE_BOTHHANDSNEEDTOBEFREE: 11,
    RETURNVALUE_CANONLYUSEONEWEAPON: 12,
    RETURNVALUE_NEEDEXCHANGE: 13,
    RETURNVALUE_CANNOTBEDRESSED: 14,
    RETURNVALUE_PUTTHISOBJECTINYOURHAND: 15,
    RETURNVALUE_PUTTHISOBJECTINBOTHHANDS: 16,
    RETURNVALUE_TOOFARAWAY: 17,
    RETURNVALUE_FIRSTGODOWNSTAIRS: 18,
    RETURNVALUE_FIRSTGOUPSTAIRS: 19,
    RETURNVALUE_CONTAINERNOTENOUGHROOM: 20,
    RETURNVALUE_NOTENOUGHCAPACITY: 21,
    RETURNVALUE_CANNOTPICKUP: 22,
    RETURNVALUE_THISISIMPOSSIBLE: 23,
    RETURNVALUE_DEPOTISFULL: 24,
    RETURNVALUE_CREATUREDOESNOTEXIST: 25,
    RETURNVALUE_CANNOTUSETHISOBJECT: 26
};

/** El ReturnValue de cada motivo con que Jetyum dice que no (`addItemTo`, `moveItem`...). */
const RETURNVALUE_DE_MOTIVO = {
    unknownItem: 1, noContainer: 2, backpackFull: 20, tooHeavy: 21, notPickupable: 22,
    tooFar: 17, notInvited: 4, pz: 3, noPlayer: 25
};

const WORLD_TYPE = {
    WORLD_TYPE_NO_PVP: 1,
    WORLD_TYPE_PVP: 2,
    WORLD_TYPE_PVP_ENFORCED: 3
};

/** El `worldType` de config.js, en número de TFS. */
function tipoDeMundo(texto) {
    const t = String(texto || 'pvp').toLowerCase();
    return t === 'no-pvp' ? 1 : (t === 'pvp-enforced' ? 3 : 2);
}

const GAME_STATE = {
    GAME_STATE_STARTUP: 0,
    GAME_STATE_INIT: 1,
    GAME_STATE_NORMAL: 2,
    GAME_STATE_CLOSED: 3,
    GAME_STATE_SHUTDOWN: 4,
    GAME_STATE_CLOSING: 5,
    GAME_STATE_MAINTAIN: 6
};

/** Las listas de acceso de una casa (casas.js: 256 invitados, 257 subdueños). */
const HOUSE_LIST = {
    GUEST_LIST: 256,
    SUBOWNER_LIST: 257
};

/** Restos de 0.x que los scripts viejos dan por hechos. */
const LEGADO = {
    LUA_ERROR: false,
    LUA_NO_ERROR: true,
    LUA_NULL: null,
    CONTAINER_POSITION: 0xFFFF,
    STACKPOS_GROUND: 0,
    STACKPOS_TOP_CREATURE: 253,
    STACKPOS_TOP_FIELD: 254,
    STACKPOS_TOP_MOVEABLE_ITEM_OR_CREATURE: 255
};

// ---------------------------------------------------------------------------
// Efectos y proyectiles que el pack no tiene
// ---------------------------------------------------------------------------

/**
 * Los `CONST_ME_*` de TFS que `efectos.mjs` no nombra, cada uno con el efecto más parecido del
 * pack. Sin ellos, un script de TFS que usa (por ejemplo) `CONST_ME_FIREWORK_RED` no cargaría.
 */
const CONST_ME_RESTO = {
    CONST_ME_NONE: 0,
    CONST_ME_GREEN_RINGS: EFECTO.GOLPE,
    CONST_ME_MORTAREA: EFECTO.EXPLOSION,
    CONST_ME_SOUND_GREEN: EFECTO.CHISPAS,
    CONST_ME_SOUND_RED: EFECTO.CHISPAS,
    CONST_ME_POISONAREA: EFECTO.TIERRA,
    CONST_ME_SOUND_YELLOW: EFECTO.CHISPAS,
    CONST_ME_SOUND_PURPLE: EFECTO.CHISPAS,
    CONST_ME_SOUND_BLUE: EFECTO.CHISPAS,
    CONST_ME_SOUND_WHITE: EFECTO.CHISPAS,
    CONST_ME_BUBBLES: EFECTO.MAGIA_AZUL,
    CONST_ME_CRAPS: EFECTO.POFF,
    CONST_ME_GIFT_WRAPS: EFECTO.CHISPAS,
    CONST_ME_FIREWORK_YELLOW: EFECTO.CHISPAS,
    CONST_ME_FIREWORK_RED: EFECTO.EXPLOSION,
    CONST_ME_FIREWORK_BLUE: EFECTO.MAGIA_AZUL,
    CONST_ME_STUN: EFECTO.CHISPAS,
    CONST_ME_SLEEP: EFECTO.POFF,
    CONST_ME_WATERCREATURE: EFECTO.MAGIA_AZUL,
    CONST_ME_HEARTS: EFECTO.CHISPAS,
    CONST_ME_SMALLCLOUDS: EFECTO.POLVO,
    CONST_ME_BIGCLOUDS: EFECTO.POLVO,
    CONST_ME_CARNIPHILA: EFECTO.TIERRA,
    CONST_ME_PURPLEENERGY: EFECTO.ENERGIA,
    CONST_ME_YELLOWENERGY: EFECTO.ENERGIA,
    CONST_ME_HOLYAREA: EFECTO.MAGIA_AZUL,
    CONST_ME_BIGPLANTS: EFECTO.TIERRA,
    CONST_ME_CAKE: EFECTO.CHISPAS,
    CONST_ME_GIANTICE: EFECTO.HIELO,
    CONST_ME_WATERSPLASH: EFECTO.MAGIA_AZUL,
    CONST_ME_PLANTATTACK: EFECTO.TIERRA,
    CONST_ME_TUTORIALARROW: EFECTO.CHISPAS,
    CONST_ME_TUTORIALSQUARE: EFECTO.CHISPAS,
    CONST_ME_MIRRORHORIZONTAL: EFECTO.CHISPAS,
    CONST_ME_MIRRORVERTICAL: EFECTO.CHISPAS,
    CONST_ME_SKULLHORIZONTAL: EFECTO.EXPLOSION,
    CONST_ME_SKULLVERTICAL: EFECTO.EXPLOSION,
    CONST_ME_ASSASSIN: EFECTO.POFF,
    CONST_ME_STEPSHORIZONTAL: EFECTO.POLVO,
    CONST_ME_BLOODYSTEPS: EFECTO.SANGRE,
    CONST_ME_STEPSVERTICAL: EFECTO.POLVO,
    CONST_ME_YALAHARIGHOST: EFECTO.POFF,
    CONST_ME_BATS: EFECTO.POFF,
    CONST_ME_SMOKE: EFECTO.POLVO,
    CONST_ME_INSECTS: EFECTO.TIERRA,
    CONST_ME_DRAGONHEAD: EFECTO.ONDA_FUEGO
};

const CONST_ANI_RESTO = {
    CONST_ANI_NONE: 0,
    CONST_ANI_BURSTARROW: PROYECTIL.FLECHA,
    CONST_ANI_DEATH: PROYECTIL.BOLA_FUEGO,
    CONST_ANI_POWERBOLT: PROYECTIL.VIROTE,
    CONST_ANI_INFERNALBOLT: PROYECTIL.VIROTE,
    CONST_ANI_HUNTINGSPEAR: PROYECTIL.LANZA,
    CONST_ANI_ENCHANTEDSPEAR: PROYECTIL.LANZA,
    CONST_ANI_REDSTAR: PROYECTIL.ESTRELLA,
    CONST_ANI_GREENSTAR: PROYECTIL.ESTRELLA,
    CONST_ANI_ROYALSPEAR: PROYECTIL.LANZA,
    CONST_ANI_SNIPERARROW: PROYECTIL.FLECHA,
    CONST_ANI_ONYXARROW: PROYECTIL.FLECHA,
    CONST_ANI_PIERCINGBOLT: PROYECTIL.VIROTE,
    CONST_ANI_WHIRLWINDSWORD: PROYECTIL.CUCHILLO,
    CONST_ANI_WHIRLWINDAXE: PROYECTIL.CUCHILLO,
    CONST_ANI_WHIRLWINDCLUB: PROYECTIL.PIEDRA,
    CONST_ANI_ETHEREALSPEAR: PROYECTIL.LANZA,
    CONST_ANI_HOLY: PROYECTIL.FLECHA_LIGERA,
    CONST_ANI_SUDDENDEATH: PROYECTIL.BOLA_FUEGO,
    CONST_ANI_FLASHARROW: PROYECTIL.FLECHA_LIGERA,
    CONST_ANI_FLAMMINGARROW: PROYECTIL.FUEGO,
    CONST_ANI_SHIVERARROW: PROYECTIL.HIELO,
    CONST_ANI_ENERGYBALL: PROYECTIL.FLECHA_LIGERA,
    CONST_ANI_SMALLICE: PROYECTIL.HIELO,
    CONST_ANI_SMALLHOLY: PROYECTIL.FLECHA_LIGERA,
    CONST_ANI_SMALLEARTH: PROYECTIL.TIERRA,
    CONST_ANI_EARTHARROW: PROYECTIL.TIERRA,
    CONST_ANI_CAKE: PROYECTIL.PIEDRA
};

/** Todas las constantes que se instalan como globales, en un solo objeto. */
const ENUMS = {
    ...MESSAGE, ...TALKTYPE, ...CONST_SLOT, ...SLOTP, ...COMBAT, ...ORIGIN, ...CONDITION, ...CONDITION_PARAM,
    ...CONDITIONID, ...SKILL, ...SKULL, ...PLAYERSEX, ...ACCOUNT_TYPE, ...PLAYER_FLAG, ...DIRECTION, ...ZONE,
    ...TILESTATE, ...CONST_PROP, ...ITEM_TYPE, ...ITEM_ATTRIBUTE, ...RETURNVALUE, ...WORLD_TYPE, ...GAME_STATE,
    ...HOUSE_LIST, ...LEGADO,
    // Los que el pack ya nombra (efectos.mjs) mandan sobre los de aquí.
    ...CONST_ME_RESTO, ...CONST_ME, ...CONST_ANI_RESTO, ...CONST_ANI
};

module.exports = {
    ENUMS,
    MESSAGE,
    TALKTYPE,
    CONST_SLOT,
    RANURA_DE_SLOT,
    SLOT_DE_RANURA,
    SLOTP_DE_RANURA,
    COMBAT,
    ELEMENTO_DE_COMBATE,
    COMBATE_DE_ELEMENTO,
    ORIGIN,
    CONDITION,
    CONDICION_DE_TIPO,
    TIPO_DE_CONDICION,
    CONDITION_PARAM,
    SKILL,
    SKILL_DE_NUMERO,
    SKULL,
    CALAVERA_DE_TEXTO,
    PLAYERSEX,
    ACCOUNT_TYPE,
    PLAYER_FLAG,
    BANDERAS_DEL_PERSONAL,
    tieneBandera,
    DIRECTION,
    PASO_DE_DIRECCION,
    ZONE,
    TILESTATE,
    CONST_PROP,
    ITEM_TYPE,
    ITEM_ATTRIBUTE,
    claveDeAtributo,
    RETURNVALUE,
    RETURNVALUE_DE_MOTIVO,
    WORLD_TYPE,
    tipoDeMundo,
    GAME_STATE,
    HOUSE_LIST
};
