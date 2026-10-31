'use strict';

/**
 * LAS CLASES DE TFS QUE NO SON CRIATURAS NI OBJETOS: `Tile`, `ItemType`, `Town`, `Group`, `Vocation`,
 * `Party` y `Condition`, y lo que se le añade a `Position` (`pos.sendMagicEffect`, `pos.getTile`...).
 *
 * Siguen la regla de entities.js: son ENVOLTORIOS. Un `Tile` guarda la coordenada y pregunta al mapa
 * cada vez; un `Party` guarda el grupo y lo da por deshecho en cuanto el mundo lo suelta. Nada de lo
 * que devuelven deja tocar el estado del mundo sin pasar por la API.
 *
 * Los nombres y lo que devuelve cada método son los de la clase de TFS 1.x que copian (lo dice cada
 * uno, como en entities.js). Donde Jetyum no tiene la pieza (no hay tipos de mensaje, ni
 * experiencia compartida opcional...), el método existe igual y devuelve lo más honesto, dicho al
 * lado: un script portado tiene que CARGAR, aunque una línea no haga nada.
 *
 * entities.js y este archivo se necesitan el uno al otro (un `Tile` da objetos y criaturas; un
 * objeto da su `Tile`), así que los dos se piden en diferido (`E()`), al usarse, y no al cargar.
 */

const { Position } = require('../world/position');
const { lineaDeVision } = require('../world/areas');
const Vocacion = require('../world/vocacion');
const Enums = require('./enums');

/** entities.js, pedido al usarse (ver arriba). */
const E = () => require('./entities');

/** Los puntos de cuerda de TFS (`ropeSpots` de actions.lua) y el de Jetyum (herramientas.js). */
const PUNTOS_DE_CUERDA = new Set([11000, 384, 418, 8278, 8592, 13189, 14435, 14436, 15635, 19518, 24940, 24941]);

/** ¿Está puesta una bandera de items.xml («1», 1, true)? */
function puesta(valor) {
    return valor === true || valor === 1 || valor === '1' || valor === 'true';
}

/** La posición de lo que sea (un envoltorio, un `{x, y, z}`, o `x, y, z` sueltos). */
function posicionDe(a, b, c) {
    if (a && typeof a.getPosition === 'function') {
        return a.getPosition();
    }
    if (a && typeof a === 'object') {
        return new Position(a.x, a.y, a.z);
    }
    if (a !== undefined && b !== undefined && c !== undefined) {
        return new Position(a, b, c);
    }
    return null;
}

// ---------------------------------------------------------------------------
// Envolver lo del mundo (con la caché del registro si la hay)
// ---------------------------------------------------------------------------

/** El envoltorio de una criatura: el de la fábrica del registro, para que `a === b` funcione. */
function envolverCriatura(world, creature) {
    if (!creature) {
        return null;
    }
    if (world.fabricaDeEnvoltorios) {
        return world.fabricaDeEnvoltorios.creature(creature.id);
    }
    if (world.wrapForContent) {
        return world.wrapForContent(creature);
    }
    const { PlayerWrapper, MonsterWrapper } = E();
    return creature.isPlayer && creature.isPlayer()
        ? new PlayerWrapper(world, creature.id) : new MonsterWrapper(world, creature.id);
}

/**
 * El envoltorio de un objeto del mundo. Uno que vino con el mapa todavía no tiene instancia: se le
 * da (`adoptItem`), como hace el motor al pisarlo. El suelo por defecto de una planta es UNO
 * compartido por todas sus casillas: ése no se adopta, se envuelve por su tipo.
 */
function envolverObjeto(world, item, compartido) {
    if (!item) {
        return null;
    }
    if (compartido) {
        return new (E().ItemWrapper)(world, 0, item.typeId);
    }
    const uid = item.instanceId || world.adoptItem(item);
    return world.fabricaDeEnvoltorios
        ? world.fabricaDeEnvoltorios.item(uid)
        : new (E().ItemWrapper)(world, uid, null);
}

/** El objeto del mundo detrás de un envoltorio de objeto del suelo, o null. */
function objetoReal(world, algo) {
    if (!algo || algo.entry) {
        return null;
    }
    const uid = typeof algo.getUniqueId === 'function' ? algo.getUniqueId() : Number(algo);
    return uid ? world.getItem(uid) : null;
}

/** La criatura de verdad detrás de un envoltorio, un id o un nombre de jugador. */
function criaturaReal(world, algo) {
    if (algo === undefined || algo === null) {
        return null;
    }
    if (typeof algo === 'string' && !/^\d+$/.test(algo)) {
        return world.playerByName ? world.playerByName(algo) : null;
    }
    const id = typeof algo.getId === 'function' ? algo.getId() : (algo.id !== undefined ? algo.id : algo);
    return world.getCreature(Number(id));
}

// ---------------------------------------------------------------------------
// ItemType
// ---------------------------------------------------------------------------

/** Qué es un tipo de objeto, como `ItemTypes_t` de TFS (ITEM_TYPE_*), mirando items.xml. */
function claseDeTipo(def) {
    const a = (def && def.attributes) || {};
    if (puesta(a.depot)) { return Enums.ITEM_TYPE.ITEM_TYPE_DEPOT; }
    if (puesta(a.mailbox)) { return Enums.ITEM_TYPE.ITEM_TYPE_MAILBOX; }
    if (puesta(a.trashHolder) || puesta(a.trashholder)) { return Enums.ITEM_TYPE.ITEM_TYPE_TRASHHOLDER; }
    if (puesta(a.isContainer)) { return Enums.ITEM_TYPE.ITEM_TYPE_CONTAINER; }
    if (a.doorId !== undefined || puesta(a.door) || /\bdoor\b/i.test(String(def && def.name || ''))) {
        return Enums.ITEM_TYPE.ITEM_TYPE_DOOR;
    }
    if (a.fieldType) { return Enums.ITEM_TYPE.ITEM_TYPE_MAGICFIELD; }
    if (puesta(a.teleport)) { return Enums.ITEM_TYPE.ITEM_TYPE_TELEPORT; }
    if (a.bed !== undefined && a.bed !== 0 && a.bed !== '0') { return Enums.ITEM_TYPE.ITEM_TYPE_BED; }
    if (puesta(a.key)) { return Enums.ITEM_TYPE.ITEM_TYPE_KEY; }
    if (puesta(a.rune)) { return Enums.ITEM_TYPE.ITEM_TYPE_RUNE; }
    return Enums.ITEM_TYPE.ITEM_TYPE_NONE;
}

/**
 * UN TIPO DE OBJETO de items.xml, como la clase `ItemType` de TFS: `ItemType(2400)` o
 * `ItemType('magic sword')`. Uno que no existe tiene id 0 (como en TFS) y responde con ceros.
 */
class ItemTypeWrapper {
    constructor(world, idONombre) {
        this.world = world;
        let def = null;
        if (typeof idONombre === 'number' || /^\d+$/.test(String(idONombre))) {
            def = world.itemTypes.get(Number(idONombre)) || null;
        } else if (idONombre) {
            const buscado = String(idONombre).trim().toLowerCase();
            for (const d of world.itemTypes.values()) {
                if (String(d.name || '').toLowerCase() === buscado) {
                    def = d;
                    break;
                }
            }
        }
        this.id = def ? def.id : 0;
    }

    _def() {
        return this.world.itemTypes.get(this.id) || null;
    }

    _attr(clave) {
        const def = this._def();
        return def && def.attributes ? def.attributes[clave] : undefined;
    }

    _num(clave) {
        return Number(this._attr(clave)) || 0;
    }

    /** `itemType:getId()` de TFS. 0 si el tipo no existe. */
    getId() { return this.id; }
    /** `itemType:getClientId()`: en Jetyum es el mismo número. */
    getClientId() { return this.id; }
    /** `itemType:getName()`. */
    getName() { const d = this._def(); return d && d.name ? d.name : ''; }
    /** `itemType:getArticle()` ('a', 'an' o ''). */
    getArticle() { const d = this._def(); return d && d.article ? d.article : ''; }
    /** `itemType:getPluralName()`: el de items.xml o, si no lo dice, el nombre con «s». */
    getPluralName() {
        const d = this._def();
        return d && d.plural ? d.plural : (d && d.name ? d.name + 's' : '');
    }
    /** `itemType:getDescription()`: el atributo `description` de items.xml, o ''. */
    getDescription() { return String(this._attr('description') || ''); }
    /** `itemType:getType()`: ITEM_TYPE_*. */
    getType() { return claseDeTipo(this._def()); }

    /** `itemType:getWeight([count])`: en centésimas de onza, como en TFS. */
    getWeight(count) {
        return this.id ? this.world.weightOfItem(this.id, count === undefined ? 1 : Number(count)) : 0;
    }

    /** `itemType:isStackable()`. */
    isStackable() { return puesta(this._attr('stackable')); }
    /** `itemType:isContainer()`. */
    isContainer() { return puesta(this._attr('isContainer')); }
    /** `itemType:getCapacity()`: los huecos (`containerSize`) de un contenedor; 0 si no lo es. */
    getCapacity() { return this.isContainer() ? this.world.capacityOfType(this.id) : 0; }
    /** `itemType:isPickupable()`. */
    isPickupable() { return puesta(this._attr('pickupable')); }
    /**
     * `itemType:isMovable()`: lo que dice `moveable` en items.xml; si no lo dice, lo que se puede
     * coger o lo que no estorba (una pared o un árbol no se mueven).
     */
    isMovable() {
        const propio = this._attr('moveable') !== undefined ? this._attr('moveable') : this._attr('movable');
        if (propio !== undefined) {
            return puesta(propio);
        }
        return this.isPickupable() || !(puesta(this._attr('blocksSolid')) || puesta(this._attr('isGround')));
    }
    /** `itemType:isRune()`. */
    isRune() { return puesta(this._attr('rune')); }
    /** `itemType:isUseable()`. */
    isUseable() { return puesta(this._attr('useable')); }
    /** `itemType:isGroundTile()`. */
    isGroundTile() { return puesta(this._attr('isGround')); }
    /** `itemType:isMagicField()`. */
    isMagicField() { return !!this._attr('fieldType'); }
    /** `itemType:isBlocking()`. */
    isBlocking() { return puesta(this._attr('blocksSolid')); }
    /** `itemType:isDoor()`: lleva `doorId` o se llama «door» (el mismo criterio que casas.js). */
    isDoor() { return this.getType() === Enums.ITEM_TYPE.ITEM_TYPE_DOOR; }
    /** `itemType:isFluidContainer()`: `fluidContainer` en items.xml (el pack no trae ninguno). */
    isFluidContainer() { return puesta(this._attr('fluidContainer')) || puesta(this._attr('fluidcontainer')); }
    /** `itemType:isReadable()`: lo que se lee (y lo que se escribe, que también se lee). */
    isReadable() { return puesta(this._attr('readable')) || this.isWritable(); }
    /** `itemType:isWritable()`. */
    isWritable() { return puesta(this._attr('writable')) || puesta(this._attr('writeable')); }
    /** `itemType:hasShowCount()`: TFS enseña la cantidad de lo apilable. */
    hasShowCount() { return this.isStackable() || puesta(this._attr('showcount')); }
    /** `itemType:hasShowCharges()`. */
    hasShowCharges() { return puesta(this._attr('showcharges')); }
    /** `itemType:getCharges()`. */
    getCharges() { return this._num('charges'); }
    /** `itemType:getArmor()`. */
    getArmor() { return this._num('armor'); }
    /** `itemType:getAttack()`. */
    getAttack() { return this._num('attack'); }
    /** `itemType:getDefense()`. */
    getDefense() { return this._num('defense'); }
    /** `itemType:getExtraDefense()`. */
    getExtraDefense() { return this._num('extraDefense') || this._num('extradef'); }
    /** `itemType:getShootRange()`. */
    getShootRange() { return this._num('range') || this._num('shootRange'); }
    /** `itemType:getMaxTextLength()`. */
    getMaxTextLength() { return this._num('maxTextLen'); }
    /** `itemType:getDecayId()`: el `decayTo` de items.xml. */
    getDecayId() { return this._num('decayTo'); }
    /** `itemType:getDuration()`: en segundos, como en items.xml. */
    getDuration() { return this._num('duration'); }
    /** `itemType:getTransformEquipId()`: `transformEquipTo` (ningún objeto del pack lo trae: 0). */
    getTransformEquipId() { return this._num('transformEquipTo'); }
    /** `itemType:getTransformDeEquipId()`. */
    getTransformDeEquipId() { return this._num('transformDeEquipTo'); }
    /** `itemType:getStackSize()`: 100 lo apilable, 1 lo demás. */
    getStackSize() { return this.isStackable() ? 100 : 1; }

    /** `itemType:getSlotPosition()`: la máscara SLOTP_* de donde se pone (0 si no se pone). */
    getSlotPosition() {
        const ranura = this.id ? this.world.slotOf(this.id) : null;
        return ranura ? Enums.SLOTP_DE_RANURA[ranura] || 0 : 0;
    }

    toString() {
        return 'ItemType(' + this.id + ', ' + this.getName() + ')';
    }
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

/**
 * UNA CASILLA, como la clase `Tile` de TFS: `Tile(pos)`, `Tile(x, y, z)` o `Game.getTile(pos)`. Es
 * una coordenada: lo que hay se le pregunta al mapa cada vez. Una casilla sin nada explícito (sólo
 * el suelo por defecto de su planta) también es una casilla; fuera del mapa, no hay (`null`).
 */
class TileWrapper {
    constructor(world, x, y, z) {
        this.world = world;
        this.x = Number(x);
        this.y = Number(y);
        this.z = Number(z);
    }

    _tile() {
        return this.world.map ? this.world.map.getTile(this.x, this.y, this.z) : null;
    }

    /** Lo que hay de abajo arriba sin el suelo: los de abajo y luego los de arriba. */
    _objetos() {
        const tile = this._tile();
        return tile ? tile.downItems.concat(tile.topItems) : [];
    }

    _envolver(item) {
        return envolverObjeto(this.world, item, false);
    }

    /** `tile:getPosition()`. */
    getPosition() {
        return new Position(this.x, this.y, this.z);
    }

    /** `tile:getGround()`: el suelo (el propio, o el de la planta si la casilla no tiene). */
    getGround() {
        const tile = this._tile();
        if (tile && tile.ground) {
            return this._envolver(tile.ground);
        }
        const suelo = this.world.map ? this.world.map.getGround(this.x, this.y, this.z) : null;
        return suelo ? envolverObjeto(this.world, suelo, true) : null;
    }

    /** `tile:getItems()`: los objetos, sin el suelo ni las criaturas. */
    getItems() {
        return this._objetos().map((item) => this._envolver(item));
    }

    /** `tile:getItemCount()`. */
    getItemCount() {
        return this._objetos().length;
    }

    /** `tile:getDownItemCount()`. */
    getDownItemCount() {
        const tile = this._tile();
        return tile ? tile.downItems.length : 0;
    }

    /** `tile:getTopItemCount()`. */
    getTopItemCount() {
        const tile = this._tile();
        return tile ? tile.topItems.length : 0;
    }

    /** `tile:getCreatures()`. */
    getCreatures() {
        const tile = this._tile();
        return tile ? tile.creatures.map((c) => envolverCriatura(this.world, c)) : [];
    }

    /** `tile:getCreatureCount()`. */
    getCreatureCount() {
        const tile = this._tile();
        return tile ? tile.creatures.length : 0;
    }

    /** `tile:getTopCreature()`: la última que llegó. */
    getTopCreature() {
        const tile = this._tile();
        return tile && tile.creatures.length ? envolverCriatura(this.world, tile.creatures[tile.creatures.length - 1]) : null;
    }

    /** `tile:getBottomCreature()`: la primera que llegó. */
    getBottomCreature() {
        const tile = this._tile();
        return tile && tile.creatures.length ? envolverCriatura(this.world, tile.creatures[0]) : null;
    }

    /** `tile:getThingCount()`: todo lo que hay apilado, el suelo y las criaturas incluidos. */
    getThingCount() {
        const tile = this._tile();
        if (tile) {
            return tile.getStack().length + (tile.ground ? 0 : (this.world.map.getGround(this.x, this.y, this.z) ? 1 : 0));
        }
        return this.world.map && this.world.map.getGround(this.x, this.y, this.z) ? 1 : 0;
    }

    /** `tile:getThing(stackpos)`: lo que hay en esa posición de la pila (0 es el suelo). */
    getThing(stackpos) {
        const tile = this._tile();
        const pila = tile ? tile.getStack() : [];
        if (!tile || !tile.ground) {
            if (Number(stackpos) === 0) {
                return this.getGround();
            }
            pila.unshift(null);
        }
        const cosa = pila[Number(stackpos)];
        if (!cosa) {
            return null;
        }
        return cosa.typeId !== undefined && cosa.definition !== undefined
            ? this._envolver(cosa) : envolverCriatura(this.world, cosa);
    }

    /** `tile:getItemById(id[, subType])`: el primero de ese tipo (el suelo incluido), o null. */
    getItemById(id, subType) {
        const buscado = Number(id);
        const tile = this._tile();
        const todos = (tile && tile.ground ? [tile.ground] : []).concat(this._objetos());
        const item = todos.find((i) => i.typeId === buscado &&
            (subType === undefined || subType === -1 || Number(i.count) === Number(subType)));
        if (item) {
            return this._envolver(item);
        }
        const suelo = this.getGround();
        return !tile && suelo && suelo.getId() === buscado ? suelo : null;
    }

    /** `tile:getItemByType(ITEM_TYPE_*)`. */
    getItemByType(tipo) {
        const item = this._objetos().find((i) => claseDeTipo(i.definition) === Number(tipo));
        return item ? this._envolver(item) : null;
    }

    /** `tile:getFieldItem()`: el campo de fuego, energía o veneno que haya (campos.js), o null. */
    getFieldItem() {
        const item = this._objetos().find((i) => i.getAttribute('fieldType'));
        return item ? this._envolver(item) : null;
    }

    /** `tile:getTopDownItem()`: el de más arriba de los que van debajo de las criaturas. */
    getTopDownItem() {
        const tile = this._tile();
        const item = tile ? tile.getTopDownItem() : null;
        return item ? this._envolver(item) : null;
    }

    /** `tile:getTopTopItem()`: el de más arriba de los que van encima de las criaturas. */
    getTopTopItem() {
        const tile = this._tile();
        const item = tile ? tile.getTopTopItem() : null;
        return item ? this._envolver(item) : null;
    }

    /**
     * `tile:getTopVisibleThing([creature])`: lo de más arriba que se ve, en el orden de TFS: una
     * criatura, luego el de arriba de los de debajo, luego el de arriba de los de encima, y el suelo.
     */
    getTopVisibleThing() {
        return this.getTopCreature() || this.getTopDownItem() || this.getTopTopItem() || this.getGround();
    }

    /** `tile:getHouse()`: la casa de la casilla (casas.js), o null. */
    getHouse() {
        const casa = this.world.houseAt ? this.world.houseAt(this.x, this.y, this.z) : null;
        return casa ? new (E().HouseWrapper)(this.world, casa.id) : null;
    }

    /** `tile:isHouse()`. */
    isHouse() {
        const tile = this._tile();
        return !!(tile && tile.houseId);
    }

    /** ¿Es una zona de protección? (`tile:hasFlag(TILESTATE_PROTECTIONZONE)`, más corto.) */
    isPz() {
        const tile = this._tile();
        return !!(tile && tile.isProtectionZone());
    }

    /** `tile:getZone()`: ZONE_PROTECTION, ZONE_NOPVP, ZONE_PVP, ZONE_NOLOGOUT o ZONE_NORMAL. */
    getZone() {
        const tile = this._tile();
        if (!tile) {
            return Enums.ZONE.ZONE_NORMAL;
        }
        if (tile.hasFlag(1)) { return Enums.ZONE.ZONE_PROTECTION; }
        if (tile.hasFlag(2)) { return Enums.ZONE.ZONE_NOPVP; }
        if (tile.hasFlag(8)) { return Enums.ZONE.ZONE_PVP; }
        if (tile.hasFlag(4)) { return Enums.ZONE.ZONE_NOLOGOUT; }
        return Enums.ZONE.ZONE_NORMAL;
    }

    /**
     * `tile:hasFlag(TILESTATE_*)`: las zonas salen de las banderas de la casilla (tile.js) y lo demás
     * de lo que hay en ella (un buzón, una cama, un campo, algo que bloquea...).
     */
    hasFlag(bandera) {
        const T = Enums.TILESTATE;
        const tile = this._tile();
        const f = Number(bandera);
        const objetos = this._objetos();
        const algun = (prueba) => objetos.some(prueba);
        const attr = (i, k) => i.getAttribute(k);
        switch (f) {
            case T.TILESTATE_NONE: return false;
            case T.TILESTATE_PROTECTIONZONE: return !!(tile && tile.hasFlag(1));
            case T.TILESTATE_NOPVPZONE: return !!(tile && tile.hasFlag(2));
            case T.TILESTATE_NOLOGOUT: return !!(tile && tile.hasFlag(4));
            case T.TILESTATE_PVPZONE: return !!(tile && tile.hasFlag(8));
            case T.TILESTATE_HOUSE: return this.isHouse();
            case T.TILESTATE_MAILBOX: return algun((i) => puesta(attr(i, 'mailbox')));
            case T.TILESTATE_DEPOT: return algun((i) => puesta(attr(i, 'depot')) || i.typeId === this.world.depotItemId);
            case T.TILESTATE_BED: return algun((i) => claseDeTipo(i.definition) === Enums.ITEM_TYPE.ITEM_TYPE_BED);
            case T.TILESTATE_MAGICFIELD: return algun((i) => !!attr(i, 'fieldType'));
            case T.TILESTATE_TELEPORT: return algun((i) => puesta(attr(i, 'teleport')) || attr(i, 'destination') !== undefined);
            case T.TILESTATE_TRASHHOLDER: return algun((i) => puesta(attr(i, 'trashHolder')));
            case T.TILESTATE_BLOCKSOLID:
            case T.TILESTATE_IMMOVABLEBLOCKSOLID:
                return !!(tile && (tile.hasBlockingItem() || (tile.ground && tile.ground.blocksSolid)));
            case T.TILESTATE_BLOCKPATH:
            case T.TILESTATE_IMMOVABLEBLOCKPATH:
                return !!(tile && (tile.ground ? [tile.ground] : []).concat(objetos).some((i) => i.blocksPathfind || i.blocksSolid));
            case T.TILESTATE_FLOORCHANGE:
            case T.TILESTATE_FLOORCHANGE_DOWN:
                return algun((i) => !!attr(i, 'floorchange')) ||
                    !!(tile && tile.ground && tile.ground.getAttribute('floorchange'));
            default:
                return false;
        }
    }

    /** `tile:hasProperty(CONST_PROP_*[, exceptItem])`: si algún objeto de la casilla la tiene. */
    hasProperty(propiedad, salvo) {
        const quitar = salvo && typeof salvo.getUniqueId === 'function' ? salvo.getUniqueId() : 0;
        const tile = this._tile();
        const todos = (tile && tile.ground ? [tile.ground] : []).concat(this._objetos())
            .filter((i) => !quitar || i.instanceId !== quitar);
        return todos.some((i) => propiedadDeObjeto(this.world, i.typeId, i, propiedad));
    }

    /**
     * `tile:queryAdd(thing)`. EN JETYUM DEVUELVE UN BOOLEANO (TFS devuelve un RETURNVALUE_*): una
     * criatura cabe si se puede pisar y no hay otra; un objeto, si la casilla tiene suelo y no lo
     * bloquea algo sólido.
     */
    queryAdd(cosa) {
        const map = this.world.map;
        if (!map) {
            return false;
        }
        const esCriatura = cosa && typeof cosa.isPlayer === 'function';
        if (esCriatura) {
            return map.isWalkable(this.x, this.y, this.z) && this.getCreatureCount() === 0;
        }
        return this.world._canHoldItems ? this.world._canHoldItems(this.x, this.y, this.z)
            : map.isWalkable(this.x, this.y, this.z);
    }

    /** `tile:addItem(itemId[, count])`: crea un objeto aquí. Devuelve su envoltorio o null. */
    addItem(itemId, count) {
        if (!this.world.itemTypes.has(Number(itemId))) {
            return null;
        }
        const item = this.world.createItem(Number(itemId), Math.max(1, Number(count) || 1), this.getPosition());
        return item ? this._envolver(item) : null;
    }

    /** `tile:addItemEx(item)`: deja aquí un objeto que ya existe (lo saca de donde estuviera). */
    addItemEx(item) {
        return !!(item && typeof item.moveTo === 'function' && item.moveTo(this.getPosition()));
    }

    /** `tile:isRopeSpot()`: un punto de cuerda (el 11000 de Jetyum, o uno de los de TFS). */
    isRopeSpot() {
        const tile = this._tile();
        const todos = (tile && tile.ground ? [tile.ground] : []).concat(this._objetos());
        return todos.some((i) => PUNTOS_DE_CUERDA.has(i.typeId) || puesta(i.getAttribute('ropeSpot')));
    }

    /** `tile:isWalkable()` (no es de TFS, pero lo usan muchos scripts portados). */
    isWalkable() {
        return !!(this.world.map && this.world.map.isWalkable(this.x, this.y, this.z));
    }

    toString() {
        return 'Tile(' + this.x + ', ' + this.y + ', ' + this.z + ')';
    }
}

/**
 * ¿Tiene un objeto (o su tipo) una propiedad CONST_PROP_*? Lo usan `item:hasProperty` y
 * `tile:hasProperty`. `item` puede ser null (sólo el tipo).
 */
function propiedadDeObjeto(world, typeId, item, propiedad) {
    const P = Enums.CONST_PROP;
    const def = world.itemTypes.get(Number(typeId));
    const leer = (k) => (item && item.attributes && item.attributes[k] !== undefined ? item.attributes[k]
        : (def && def.attributes ? def.attributes[k] : undefined));
    switch (Number(propiedad)) {
        case P.CONST_PROP_BLOCKSOLID:
        case P.CONST_PROP_IMMOVABLEBLOCKSOLID:
            return puesta(leer('blocksSolid'));
        case P.CONST_PROP_HASHEIGHT: return puesta(leer('hasHeight'));
        case P.CONST_PROP_BLOCKPROJECTILE: return puesta(leer('blocksProjectile'));
        case P.CONST_PROP_BLOCKPATH:
        case P.CONST_PROP_IMMOVABLEBLOCKPATH:
        case P.CONST_PROP_NOFIELDBLOCKPATH:
        case P.CONST_PROP_IMMOVABLENOFIELDBLOCKPATH:
            return puesta(leer('blocksPathfind')) || puesta(leer('blocksSolid'));
        case P.CONST_PROP_ISVERTICAL: return puesta(leer('vertical'));
        case P.CONST_PROP_ISHORIZONTAL: return puesta(leer('horizontal'));
        case P.CONST_PROP_MOVEABLE: return new ItemTypeWrapper(world, Number(typeId)).isMovable();
        case P.CONST_PROP_SUPPORTHANGABLE: return puesta(leer('hangable'));
        default: return false;
    }
}

// ---------------------------------------------------------------------------
// Town, Group, Vocation
// ---------------------------------------------------------------------------

/** UNA CIUDAD del mapa (`map.towns`), como la clase `Town` de TFS: `Town(1)` o `Town('Jetyum')`. */
class TownWrapper {
    constructor(world, ciudad) {
        this.world = world;
        this.id = Number(ciudad.id);
    }

    _ciudad() {
        return ((this.world.map && this.world.map.towns) || []).find((t) => Number(t.id) === this.id) || null;
    }

    /** `town:getId()`. */
    getId() { return this.id; }
    /** `town:getName()`. */
    getName() { const t = this._ciudad(); return t ? String(t.name || '') : ''; }
    /** `town:getTemplePosition()`. */
    getTemplePosition() {
        const t = this._ciudad();
        return t && t.temple ? new Position(t.temple.x, t.temple.y, t.temple.z) : null;
    }

    toString() {
        return 'Town(' + this.id + ', ' + this.getName() + ')';
    }
}

/** La ciudad por id o por nombre, o null. */
function buscarCiudad(world, idONombre) {
    const ciudades = (world.map && world.map.towns) || [];
    const porId = typeof idONombre === 'number' || /^\d+$/.test(String(idONombre));
    const t = porId
        ? ciudades.find((c) => Number(c.id) === Number(idONombre))
        : ciudades.find((c) => String(c.name || '').toLowerCase() === String(idONombre || '').trim().toLowerCase());
    return t ? new TownWrapper(world, t) : null;
}

/**
 * UN GRUPO DE ACCESO (data/XML/groups.js), como la clase `Group` de TFS. Lleva además, como
 * propiedades, lo que devolvía `player.getGroup()` antes de existir esta clase (`id`, `name`,
 * `access`): los scripts que lo leían así siguen funcionando.
 */
class GroupWrapper {
    constructor(world, def) {
        this.world = world;
        this.id = Number(def.id);
        this.name = String(def.name);
        this.access = def.access === true;
        Object.defineProperty(this, 'world', { enumerable: false });
    }

    _def() {
        return (this.world.groups && this.world.groups.get(this.id)) || { id: this.id, name: this.name, access: this.access };
    }

    /** `group:getId()`. */
    getId() { return this.id; }
    /** `group:getName()`. */
    getName() { return this.name; }
    /** `group:getAccess()`: si es del personal (GM o más). */
    getAccess() { return this.access; }
    /**
     * `group:getFlags()`: las `flags` que declare en groups.js; si no declara, las que de verdad tiene
     * el personal en Jetyum (entrar con el servidor lleno y editar cualquier casa) o ninguna.
     */
    getFlags() {
        const def = this._def();
        if (def.flags !== undefined) {
            return Number(def.flags) || 0;
        }
        return this.access ? Enums.BANDERAS_DEL_PERSONAL : 0;
    }
    /** `group:hasFlag(PlayerFlag_*)`. */
    hasFlag(bandera) { return Enums.tieneBandera(this.getFlags(), bandera); }
    /**
     * `group:getMaxDepotItems()`: `maxDepotItems` de groups.js o, si no lo dice, los huecos de un
     * depósito de Jetyum (extras.js; en TFS es un tope de objetos, aquí de huecos).
     */
    getMaxDepotItems() {
        const def = this._def();
        return def.maxDepotItems !== undefined ? Number(def.maxDepotItems) || 0 : require('../world/extras').HUECOS_DEPOSITO;
    }
    /** `group:getMaxVipEntries()`: `maxVipEntries` de groups.js; 0 = el tope por defecto del servidor, como en TFS. */
    getMaxVipEntries() { return Number(this._def().maxVipEntries) || 0; }

    toString() {
        return 'Group(' + this.id + ', ' + this.name + ')';
    }
}

/** Un grupo por id o nombre, o null. */
function buscarGrupo(world, idONombre) {
    const def = world.groupByName ? world.groupByName(idONombre) : null;
    return def ? new GroupWrapper(world, def) : null;
}

/** El nombre de una skill de Jetyum, venga como SKILL_* o como nombre. */
function nombreDeSkill(skill) {
    if (typeof skill === 'number' || /^\d+$/.test(String(skill))) {
        return Enums.SKILL_DE_NUMERO[Number(skill)] || null;
    }
    const s = String(skill || '').toLowerCase();
    return s === 'shield' ? 'shielding' : s;
}

/**
 * UNA VOCACIÓN (data/XML/vocations.js), como la clase `Vocation` de TFS: `Vocation(4)`,
 * `Vocation('Knight')` o `player.getVocationInfo()`. Lleva además, como propiedades, una COPIA de
 * su ficha (lo que devolvía `getVocationInfo()` antes de existir esta clase): `v.gainHp`,
 * `v.skills.sword`... siguen valiendo. Cambiarla no cambia la vocación.
 */
class VocationWrapper {
    constructor(world, def) {
        Object.assign(this, JSON.parse(JSON.stringify(def)));
        Object.defineProperty(this, '_world', { value: world, enumerable: false });
        Object.defineProperty(this, '_id', { value: Number(def.id), enumerable: false });
    }

    _def() {
        return (this._world.vocations && this._world.vocations.get(this._id)) || this;
    }

    /** `vocation:getId()`. */
    getId() { return this._id; }
    /** `vocation:getClientId()`. */
    getClientId() { return Number(this._def().clientId) || 0; }
    /** `vocation:getName()`. */
    getName() { return String(this._def().name || ''); }
    /** `vocation:getDescription()`: 'a knight'... */
    getDescription() { return String(this._def().description || ''); }
    /** `vocation:getRequiredSkillTries(skill, level)`: lo que hay que entrenar para ese nivel. */
    getRequiredSkillTries(skill, nivel) {
        const nombre = nombreDeSkill(skill);
        return nombre ? Vocacion.triesParaSkill(this._def(), nombre, Number(nivel)) : 0;
    }
    /** `vocation:getRequiredManaSpent(magLevel)`. */
    getRequiredManaSpent(nivel) { return Vocacion.manaParaNivelMagico(this._def(), Number(nivel)); }
    /** `vocation:getCapacityGain()`: en onzas por nivel (vocations.js), como el `gaincap` de TFS. */
    getCapacityGain() { return Number(this._def().gainCap) || 0; }
    /** `vocation:getHealthGain()`. */
    getHealthGain() { return Number(this._def().gainHp) || 0; }
    /** `vocation:getHealthGainTicks()`: en segundos. */
    getHealthGainTicks() { return Number(this._def().gainHpTicks) || 0; }
    /** `vocation:getHealthGainAmount()`. */
    getHealthGainAmount() { return Number(this._def().gainHpAmount) || 0; }
    /** `vocation:getManaGain()`. */
    getManaGain() { return Number(this._def().gainMana) || 0; }
    /** `vocation:getManaGainTicks()`. */
    getManaGainTicks() { return Number(this._def().gainManaTicks) || 0; }
    /** `vocation:getManaGainAmount()`. */
    getManaGainAmount() { return Number(this._def().gainManaAmount) || 0; }
    /** `vocation:getMaxSoul()`. */
    getMaxSoul() { return Number(this._def().soulMax) || 0; }
    /** `vocation:getSoulGainTicks()`. */
    getSoulGainTicks() { return Number(this._def().gainSoulTicks) || 0; }
    /** `vocation:getAttackSpeed()`. */
    getAttackSpeed() { return Number(this._def().attackSpeed) || 0; }
    /** `vocation:getBaseSpeed()`. */
    getBaseSpeed() { return Number(this._def().baseSpeed) || 0; }
    /** `vocation:allowsPvp()`: en Jetyum todas. */
    allowsPvp() { return true; }

    /** `vocation:getDemotion()`: de la que es promoción (`fromVoc`), o null. */
    getDemotion() {
        const desde = Number(this._def().fromVoc);
        if (!Number.isFinite(desde) || desde === this._id) {
            return null;
        }
        const def = this._world.vocations && this._world.vocations.get(desde);
        return def ? new VocationWrapper(this._world, def) : null;
    }

    /** `vocation:getPromotion()`: la que la tiene como `fromVoc`, o null. */
    getPromotion() {
        if (!this._world.vocations) {
            return null;
        }
        for (const def of this._world.vocations.values()) {
            if (Number(def.fromVoc) === this._id && Number(def.id) !== this._id) {
                return new VocationWrapper(this._world, def);
            }
        }
        return null;
    }

    toString() {
        return 'Vocation(' + this._id + ', ' + this.getName() + ')';
    }
}

/** Una vocación por id o nombre, o null. */
function buscarVocacion(world, idONombre) {
    const def = world.findVocation ? world.findVocation(idONombre) : null;
    return def ? new VocationWrapper(world, def) : null;
}

// ---------------------------------------------------------------------------
// Party
// ---------------------------------------------------------------------------

/**
 * UN GRUPO DE CAZA (extras.js), como la clase `Party` de TFS. Envuelve el grupo mientras exista: en
 * cuanto se deshace, todo devuelve vacío.
 *
 * Lleva además `leader` y `members` (los NOMBRES, el líder incluido), que es lo que devolvía
 * `player.getParty()` antes de existir esta clase. Ojo: `getMembers()` es el de TFS y NO incluye al
 * líder (`getMemberCount()` tampoco).
 */
class PartyWrapper {
    constructor(world, grupo) {
        Object.defineProperty(this, 'world', { value: world, enumerable: false });
        Object.defineProperty(this, '_grupo', { value: grupo, enumerable: false });
    }

    /** El grupo, si sigue vivo. */
    _g() {
        const g = this._grupo;
        return g && this.world.parties && this.world.parties.get(g.leader.id) === g && g.members.length > 0 ? g : null;
    }

    get leader() {
        const g = this._g();
        return g ? g.leader.name : null;
    }

    get members() {
        const g = this._g();
        return g ? g.members.map((m) => m.name) : [];
    }

    /** `party:getLeader()`. */
    getLeader() {
        const g = this._g();
        return g ? envolverCriatura(this.world, g.leader) : null;
    }

    /** `party:setLeader(player)`: pasa el mando a otro del grupo. */
    setLeader(player) {
        const g = this._g();
        const nuevo = criaturaReal(this.world, player);
        if (!g || !nuevo || !g.members.includes(nuevo) || nuevo === g.leader) {
            return false;
        }
        this.world.parties.delete(g.leader.id);
        g.leader = nuevo;
        g.members.forEach((m) => { m.partyLeaderId = nuevo.id; });
        this.world.parties.set(nuevo.id, g);
        this.world.emit('onPartyChange', g);
        return true;
    }

    /** `party:getMembers()`: los del grupo SIN el líder, como en TFS. */
    getMembers() {
        const g = this._g();
        return g ? g.members.filter((m) => m !== g.leader).map((m) => envolverCriatura(this.world, m)) : [];
    }

    /** `party:getMemberCount()`: sin el líder, como en TFS. */
    getMemberCount() {
        const g = this._g();
        return g ? g.members.length - 1 : 0;
    }

    /** `party:getInvitees()`. */
    getInvitees() {
        const g = this._g();
        return g ? Array.from(g.invited).map((id) => this.world.getPlayer(id)).filter(Boolean)
            .map((p) => envolverCriatura(this.world, p)) : [];
    }

    /** `party:getInviteeCount()`. */
    getInviteeCount() {
        return this.getInvitees().length;
    }

    /** `party:addInvite(player)`. */
    addInvite(player) {
        const g = this._g();
        const p = criaturaReal(this.world, player);
        return !!(g && p && this.world.partyInvite(g.leader, p).ok);
    }

    /** `party:removeInvite(player)`. */
    removeInvite(player) {
        const g = this._g();
        const p = criaturaReal(this.world, player);
        if (!g || !p || !g.invited.has(p.id)) {
            return false;
        }
        g.invited.delete(p.id);
        this.world.emit('onPartyChange', g);
        return true;
    }

    /** `party:addMember(player)`: lo mete directamente (invitado o no), si no tiene otro grupo. */
    addMember(player) {
        const g = this._g();
        const p = criaturaReal(this.world, player);
        if (!g || !p || this.world.partyOf(p)) {
            return false;
        }
        g.invited.add(p.id);
        return this.world.partyJoin(p, g.leader).ok === true;
    }

    /** `party:removeMember(player)`. */
    removeMember(player) {
        const g = this._g();
        const p = criaturaReal(this.world, player);
        return !!(g && p && g.members.includes(p) && this.world.partyLeave(p).ok);
    }

    /** `party:disband()`: lo deshace entero. */
    disband() {
        const g = this._g();
        if (!g) {
            return false;
        }
        const antes = g.members.slice();
        antes.forEach((m) => { m.partyLeaderId = null; });
        this.world.parties.delete(g.leader.id);
        g.members = [];
        g.invited.clear();
        this.world.emit('onPartyChange', g, antes);
        return true;
    }

    /**
     * `party:isSharedExperienceActive()`. En Jetyum la experiencia del grupo se reparte siempre entre
     * los que están cerca (combat.js, `expShareRange`), salvo que se apague con `setSharedExperience(false)`.
     */
    isSharedExperienceActive() {
        const g = this._g();
        return !!(g && g.compartir !== false && g.members.length > 1);
    }

    /** `party:isSharedExperienceEnabled()`. */
    isSharedExperienceEnabled() {
        const g = this._g();
        return !!(g && g.compartir !== false);
    }

    /** `party:setSharedExperience(active)`: con false, cada uno se queda la suya. */
    setSharedExperience(activa) {
        const g = this._g();
        if (!g) {
            return false;
        }
        g.compartir = activa !== false;
        return true;
    }

    /** `party:shareExperience(exp)`: la reparte a partes iguales entre los del grupo (cerca o no). */
    shareExperience(exp) {
        const g = this._g();
        if (!g || !this.world.combat) {
            return false;
        }
        const cada = Math.floor((Number(exp) || 0) / g.members.length);
        g.members.forEach((m) => this.world.combat.addExperience(m, cada));
        return true;
    }

    toString() {
        return 'Party(' + this.leader + ', ' + this.members.length + ')';
    }
}

// ---------------------------------------------------------------------------
// Condition
// ---------------------------------------------------------------------------

/**
 * UNA CONDICIÓN A LA MANERA DE TFS: `Condition(CONDITION_POISON)` y sus parámetros, para pasarla a
 * `creature.addCondition(condition)` (o a `doAddCondition`). Se traduce a las de Jetyum
 * (engine/world/condiciones.js): veneno, fuego, energía, sangrado, regeneración, prisa, parálisis y
 * luz. Las que Jetyum no tiene (invisible, maná-escudo, borracho...) se crean igual, pero ponerlas
 * no hace nada (`addCondition` devuelve false).
 */
class ConditionWrapper {
    constructor(tipo, id) {
        const numero = typeof tipo === 'number' ? tipo : (Enums.TIPO_DE_CONDICION[String(tipo).toLowerCase()] || 0);
        this.type = numero;
        this.id = id === undefined ? -1 : Number(id);
        this.subId = 0;
        this.params = {};
        this.damages = [];
        this.formula = null;
    }

    /** `condition:getType()`. */
    getType() { return this.type; }
    /** `condition:getId()`. */
    getId() { return this.id; }
    /** `condition:getSubId()`. */
    getSubId() { return this.subId; }
    /** `condition:getTicks()`: la duración en ms. */
    getTicks() { return Number(this.params[Enums.CONDITION_PARAM.CONDITION_PARAM_TICKS]) || 0; }
    /** `condition:setTicks(ms)`. */
    setTicks(ms) { this.params[Enums.CONDITION_PARAM.CONDITION_PARAM_TICKS] = Number(ms) || 0; return true; }
    /** `condition:setParameter(CONDITION_PARAM_*, value)`. */
    setParameter(clave, valor) {
        if (Number(clave) === Enums.CONDITION_PARAM.CONDITION_PARAM_SUBID) {
            this.subId = Number(valor) || 0;
        }
        this.params[Number(clave)] = valor;
        return true;
    }
    /** `condition:getParameter(CONDITION_PARAM_*)`. */
    getParameter(clave) { return this.params[Number(clave)]; }
    /** `condition:addDamage(rounds, time, value)`: `rounds` golpes de `value` cada `time` ms. */
    addDamage(rondas, tiempo, valor) {
        this.damages.push({ rondas: Math.max(1, Number(rondas) || 1), tiempo: Number(tiempo) || 2000, valor: Math.abs(Number(valor) || 0) });
        return true;
    }
    /** `condition:setFormula(mina, minb, maxa, maxb)`: la velocidad de prisa y parálisis. */
    setFormula(mina, minb, maxa, maxb) {
        this.formula = { mina: Number(mina) || 0, minb: Number(minb) || 0, maxa: Number(maxa) || 0, maxb: Number(maxb) || 0 };
        return true;
    }
    /** `condition:setOutfit(...)`: Jetyum no tiene condición de aspecto; no hace nada. */
    setOutfit() { return false; }
    /** `condition:clone()`. */
    clone() {
        const c = new ConditionWrapper(this.type, this.id);
        c.subId = this.subId;
        c.params = { ...this.params };
        c.damages = this.damages.map((d) => ({ ...d }));
        c.formula = this.formula ? { ...this.formula } : null;
        return c;
    }

    /**
     * La condición de Jetyum que corresponde, para una criatura (la velocidad de una fórmula sale de
     * la suya), o null si Jetyum no tiene ese tipo.
     */
    _paraJetyum(creature) {
        const P = Enums.CONDITION_PARAM;
        const nombre = Enums.CONDICION_DE_TIPO[this.type];
        if (!nombre) {
            return null;
        }
        const ticks = this.getTicks();
        const dueno = this.params[P.CONDITION_PARAM_OWNER];
        const c = { type: nombre };
        if (dueno) {
            c.attacker = dueno;
        }
        if (['veneno', 'fuego', 'energia', 'sangrado'].includes(nombre)) {
            if (this.damages.length > 0) {
                const rondas = this.damages.reduce((n, d) => n + d.rondas, 0);
                const total = this.damages.reduce((n, d) => n + d.rondas * d.valor, 0);
                c.ticks = rondas;
                c.interval = this.damages[0].tiempo;
                c.value = Math.max(1, Math.round(total / rondas));
            } else {
                const intervalo = Number(this.params[P.CONDITION_PARAM_TICKINTERVAL]) || 2000;
                c.interval = intervalo;
                c.ticks = Math.max(1, Math.round((ticks > 0 ? ticks : intervalo) / intervalo));
                c.value = Math.max(1, Math.abs(Number(this.params[P.CONDITION_PARAM_PERIODICDAMAGE] ||
                    this.params[P.CONDITION_PARAM_STARTVALUE] || this.params[P.CONDITION_PARAM_MINVALUE]) || 1));
            }
        } else if (nombre === 'regeneracion') {
            const intervalo = Number(this.params[P.CONDITION_PARAM_HEALTHTICKS]) || 1000;
            c.interval = intervalo;
            c.ticks = Math.max(1, Math.round((ticks > 0 ? ticks : intervalo) / intervalo));
            c.value = Number(this.params[P.CONDITION_PARAM_HEALTHGAIN]) || 1;
        } else if (nombre === 'prisa' || nombre === 'paralisis') {
            c.duration = ticks;
            let cambio = Math.abs(Number(this.params[P.CONDITION_PARAM_SPEED]) || 0);
            if (!cambio && this.formula) {
                // Como `ConditionSpeed::getFormulaValues` de TFS, con la velocidad base de la criatura.
                const base = (creature && (creature.baseSpeed || creature.speed)) || 220;
                const a = (this.formula.mina + this.formula.maxa) / 2;
                const b = (this.formula.minb + this.formula.maxb) / 2;
                cambio = Math.abs(Math.round(base * a + b));
            }
            c.value = cambio || 20;
        } else if (nombre === 'luz') {
            c.duration = ticks;
            c.value = Number(this.params[P.CONDITION_PARAM_LIGHT_LEVEL]) || 6;
        }
        return c;
    }

    toString() {
        return 'Condition(' + this.type + ')';
    }
}

// ---------------------------------------------------------------------------
// Position: lo que TFS le pone
// ---------------------------------------------------------------------------

/**
 * EL MUNDO DE LOS MÉTODOS DE POSITION. `pos.sendMagicEffect(...)` o `pos.getTile()` necesitan un
 * mundo y una `Position` no lleva ninguno (es del motor, la usa el mapa). Usan el del motor que
 * instaló la API de scripts (`installGame`), igual que `Game` es el de ese motor: es la misma regla
 * de una global deliberada, y se restaura al cerrarse.
 */
let mundoActivo = null;

/** Activa el mundo de los métodos de Position. Devuelve la función que deja el anterior. */
function activarMundo(world) {
    const anterior = mundoActivo;
    mundoActivo = world;
    return () => {
        mundoActivo = anterior;
    };
}

/** Los métodos que TFS da a `Position`. Los de aritmética no necesitan mundo. */
const METODOS_DE_POSICION = {
    /** `position:getDistance(pos)`: la mayor de las diferencias, la planta incluida. */
    getDistance(otra) {
        return Math.max(Math.abs(this.x - otra.x), Math.abs(this.y - otra.y), Math.abs(this.z - otra.z));
    },

    /** `position:isInRange(from, to)`: si está en el rectángulo (con plantas) de `from` a `to`. */
    isInRange(desde, hasta) {
        const entre = (v, a, b) => v >= Math.min(a, b) && v <= Math.max(a, b);
        return entre(this.x, desde.x, hasta.x) && entre(this.y, desde.y, hasta.y) && entre(this.z, desde.z, hasta.z);
    },

    /** `position:getNextPosition(direction[, steps])`: avanza ESTA posición, como en TFS. */
    getNextPosition(direccion, pasos) {
        const paso = Enums.PASO_DE_DIRECCION[Number(direccion)];
        const n = pasos === undefined ? 1 : Number(pasos);
        if (paso) {
            this.x += paso[0] * n;
            this.y += paso[1] * n;
        }
        return this;
    },

    /** `position:moveRel(dx, dy, dz)`. */
    moveRel(dx, dy, dz) {
        this.x += Number(dx) || 0;
        this.y += Number(dy) || 0;
        this.z += Number(dz) || 0;
        return this;
    },

    /** `position:sendMagicEffect(effect)`. */
    sendMagicEffect(efecto) {
        return !!(mundoActivo && mundoActivo.sendMagicEffect(this, efecto));
    },

    /** `position:sendDistanceEffect(toPos, effect)`. */
    sendDistanceEffect(hasta, proyectil) {
        return !!(mundoActivo && mundoActivo.sendDistanceEffect(this, hasta, proyectil));
    },

    /** `position:isSightClear(pos[, sameFloor])`: si se ve de una a otra (areas.js). */
    isSightClear(otra) {
        if (!mundoActivo || !mundoActivo.map || !otra) {
            return false;
        }
        // Entre plantas no hay línea de vista en Jetyum (en TFS, sólo con `sameFloor` a false).
        if (Number(otra.z) !== this.z) {
            return false;
        }
        return lineaDeVision(mundoActivo.map, this, { x: Number(otra.x), y: Number(otra.y), z: Number(otra.z) });
    },

    /** `position:getTile()`: la casilla (`Tile`), o null fuera del mapa. */
    getTile() {
        return mundoActivo ? crearTile(mundoActivo, this) : null;
    }
};

Object.keys(METODOS_DE_POSICION).forEach((nombre) => {
    if (!Object.prototype.hasOwnProperty.call(Position.prototype, nombre)) {
        // Sin enumerar: un `for...in` sobre una posición sigue dando sólo x, y, z.
        Object.defineProperty(Position.prototype, nombre, {
            value: METODOS_DE_POSICION[nombre], writable: true, configurable: true, enumerable: false
        });
    }
});

/** `Position.getDistanceBetween(a, b)` de TFS (estática). */
if (!Position.getDistanceBetween) {
    Position.getDistanceBetween = (a, b) => METODOS_DE_POSICION.getDistance.call(a, b);
}

/**
 * La global `Position` de los scripts: `Position(x, y, z)` como en TFS (sin `new`), con `new`, o
 * `Position({x, y, z})`. Crea una `Position` del motor (`instanceof Position` vale).
 */
function PosicionDeScript(x, y, z) {
    if (x && typeof x === 'object') {
        return new Position(x.x, x.y, x.z);
    }
    return new Position(x, y, z);
}
PosicionDeScript.prototype = Position.prototype;
PosicionDeScript.getDistanceBetween = Position.getDistanceBetween;
PosicionDeScript.from = Position.from;

/** Una casilla por posición (`Tile(pos)`, `Tile(x, y, z)`), o null si está fuera del mapa. */
function crearTile(world, a, b, c) {
    const pos = posicionDe(a, b, c);
    if (!pos || !world.map || !world.map.inBounds(pos.x, pos.y, pos.z)) {
        return null;
    }
    if (!world.map.getTile(pos.x, pos.y, pos.z) && !world.map.getGround(pos.x, pos.y, pos.z)) {
        return null;
    }
    return new TileWrapper(world, pos.x, pos.y, pos.z);
}

module.exports = {
    ItemTypeWrapper,
    TileWrapper,
    TownWrapper,
    GroupWrapper,
    VocationWrapper,
    PartyWrapper,
    ConditionWrapper,
    PosicionDeScript,
    METODOS_DE_POSICION,
    activarMundo,
    crearTile,
    buscarCiudad,
    buscarGrupo,
    buscarVocacion,
    claseDeTipo,
    propiedadDeObjeto,
    nombreDeSkill,
    envolverCriatura,
    envolverObjeto,
    objetoReal,
    criaturaReal,
    posicionDe,
    puesta
};
