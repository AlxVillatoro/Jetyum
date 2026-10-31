/**
 * PRUEBAS DE LA COMPATIBILIDAD CON LA API DE SCRIPTS DE TFS.
 *
 *     node tools/test-api-tfs.mjs
 *
 * Con el motor de verdad, el mapa `jetyum`, el reloj en la mano y una base de datos TEMPORAL:
 *
 *   1. las constantes de TFS como globales (MESSAGE_*, CONST_SLOT_*, CONDITION_*...)
 *   2. Position: aritmética, efectos, línea de vista y su casilla
 *   3. Tile: zonas, objetos, criaturas, casas, puntos de cuerda
 *   4. ItemType
 *   5. Item y Container (del suelo y del inventario)
 *   6. Player y Creature
 *   7. Town, Group, Vocation y Condition
 *   8. House
 *   9. Party
 *  10. las funciones de 0.x (compat.js), por grupos
 *  11. los eventos: talkactions con access/accountType/separator, onPrepareDeath, onHealthChange,
 *      onManaChange, onThink, onTextEdit, onSave y onRecord
 *  12. el storage global y el récord sobreviven a reiniciar el motor
 *  13. PORTAR: un script escrito a la manera de TFS, cargado con el cargador de verdad
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');
const { loadContent } = require('../engine/scripting/loader.js');

let failures = 0;
let total = 0;
function check(label, condition, detail) {
    total += 1;
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail !== undefined && detail !== '' ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);
/** Lo que lanza una comprobación cuenta como fallo, con el error al lado. */
function intentar(label, hacer) {
    try {
        hacer();
    } catch (error) {
        check(label + ' (sin lanzar)', false, error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : String(error));
    }
}

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jetyum-tfs-'));
const baseDeDatos = path.join(carpeta, 'tfs.db');

let reloj = Date.now();
let e = null;
let world = null;

function arrancar() {
    e = createEngine({
        rootDir: ROOT,
        logLevel: 'error',
        overrides: { useDatabase: true, databaseFile: baseDeDatos, autosaveIntervalMs: 60000 }
    });
    world = e.world;
    world.now = () => reloj;
    e.scheduler.now = () => reloj;
}
arrancar();

function conectar(nombre, ip) {
    const sesion = e.createSession(() => {}, { ip: ip || '127.0.0.1' });
    const existe = !!e.repository.database.findCharacterByName(nombre);
    const r = sesion.login({ account: 'Portador', password: 'clave-tfs', character: nombre, crear: !existe, vocation: 'Knight' });
    if (!r.handled || !sesion.player) {
        throw new Error('no entra ' + nombre + ': ' + JSON.stringify(r));
    }
    return { sesion, pj: sesion.player, wrap: e.registry.entities.creature(sesion.player.id) };
}
/** Pasa el tiempo: el reloj y el planificador (que lleva el reloj global y los addEvent). */
function pasar(ms) {
    const paso = 250;
    for (let t = 0; t < ms; t += paso) {
        reloj += paso;
        e.scheduler.tick(1000);
    }
}
const ultimosTextos = (pj, n) => world.messages.filter((m) => m.playerId === pj.id).slice(-(n || 1)).map((m) => m.text);
const efectos = [];
const engancharEfectos = () => {
    world.on('onMagicEffect', (pos, efecto) => efectos.push({ pos: { x: pos.x, y: pos.y, z: pos.z }, efecto }));
    world.on('onDistanceEffect', (desde, hasta, proyectil) => efectos.push({ desde, hasta, proyectil }));
};
engancharEfectos();

const TEMPLO = world.templeOf({});
const ana = conectar('Ana Portadora', '10.0.0.5');
const beto = conectar('Beto Portador');
world.teleportCreature(ana.pj, TEMPLO);

// ===========================================================================
section('1. Las constantes de TFS, como globales');
// ===========================================================================
intentar('constantes', () => {
    check('MESSAGE_INFO_DESCR, TALKTYPE_SAY, CONST_SLOT_HEAD y CONST_SLOT_LAST',
        MESSAGE_INFO_DESCR === 22 && TALKTYPE_SAY === 1 && CONST_SLOT_HEAD === 1 && CONST_SLOT_LAST === 10);
    check('COMBAT_FIREDAMAGE, CONDITION_POISON, SKILL_SWORD, SKULL_RED',
        COMBAT_FIREDAMAGE === 8 && CONDITION_POISON === 1 && SKILL_SWORD === 2 && SKULL_RED === 4);
    check('DIRECTION_*, ZONE_*, RETURNVALUE_*, TILESTATE_*, ITEM_TYPE_*',
        DIRECTION_NORTH === 0 && DIRECTION_NORTHEAST === 7 && ZONE_PROTECTION === 0 && RETURNVALUE_NOERROR === 0 &&
        TILESTATE_PROTECTIONZONE === 128 && ITEM_TYPE_CONTAINER === 4);
    check('PlayerFlag_*, WORLD_TYPE_*, GAME_STATE_*, ACCOUNT_TYPE_GOD',
        PlayerFlag_CannotUseCombat === 1 && PlayerFlag_CanEditHouses === 2 ** 17 && WORLD_TYPE_PVP === 2 &&
        GAME_STATE_NORMAL === 2 && ACCOUNT_TYPE_GOD === 6);
    check('CONST_ME_* del pack y los que el pack no tiene (al más parecido)',
        CONST_ME_MAGIC_BLUE === EFECTO.MAGIA_AZUL && CONST_ME_FIREWORK_RED === EFECTO.EXPLOSION && CONST_ANI_ROYALSPEAR === PROYECTIL.LANZA);
    check('los de 0.x: NORTH, LUA_NO_ERROR', NORTH === 0 && WEST === 3 && LUA_NO_ERROR === true);
});

// ===========================================================================
section('2. Position');
// ===========================================================================
intentar('Position', () => {
    const p = Position(10, 10, 7);
    check('Position(x, y, z) sin new, y con new, son Position del motor',
        p instanceof Position && new Position(1, 2, 3).z === 3 && Position({ x: 4, y: 5, z: 6 }).y === 5);
    check('getDistance y Position.getDistanceBetween', p.getDistance(Position(13, 8, 7)) === 3 &&
        Position.getDistanceBetween(p, Position(10, 10, 9)) === 2);
    check('isInRange', p.isInRange(Position(5, 5, 7), Position(15, 15, 7)) && !p.isInRange(Position(11, 11, 7), Position(15, 15, 7)));
    const q = Position(10, 10, 7).getNextPosition(DIRECTION_EAST, 2);
    check('getNextPosition avanza la posición (como en TFS)', q.x === 12 && q.y === 10);
    efectos.length = 0;
    const t = Position(TEMPLO.x, TEMPLO.y, TEMPLO.z);
    t.sendMagicEffect(CONST_ME_TELEPORT);
    t.sendDistanceEffect(Position(TEMPLO.x + 3, TEMPLO.y, TEMPLO.z), CONST_ANI_FIRE);
    check('sendMagicEffect y sendDistanceEffect llegan al mundo', efectos.length === 2 &&
        efectos[0].efecto === CONST_ME_TELEPORT && efectos[1].proyectil === CONST_ANI_FIRE);
    check('isSightClear de una casilla a su vecina', t.isSightClear(Position(TEMPLO.x + 1, TEMPLO.y, TEMPLO.z)));
    check('getTile da la casilla', t.getTile() && t.getTile().getPosition().equals(t));
    const claves = [];
    for (const k in p) {
        claves.push(k);
    }
    check('los métodos no se enumeran: un for...in sigue dando x, y, z', claves.join(',') === 'x,y,z', claves.join(','));
});

// ===========================================================================
section('3. Tile');
// ===========================================================================
intentar('Tile', () => {
    const t = Tile(TEMPLO);
    check('Tile(pos) y Game.getTile(x, y, z)', t && Game.getTile(TEMPLO.x, TEMPLO.y, TEMPLO.z).getPosition().equals(t.getPosition()));
    check('el templo es zona de protección (hasFlag y getZone)', t.hasFlag(TILESTATE_PROTECTIONZONE) && t.getZone() === ZONE_PROTECTION);
    check('ana está en la zona de protección (creature.getZone)', ana.wrap.getZone() === ZONE_PROTECTION);
    check('tiene suelo', t.getGround() !== null && t.getGround().getName() !== null, t.getGround() && t.getGround().getName());
    check('getTopCreature y getCreatures dan a ana', t.getTopCreature() === ana.wrap && t.getCreatures().includes(ana.wrap));
    check('getTopVisibleThing: la criatura primero', t.getTopVisibleThing() === ana.wrap);
    const vecina = Tile(TEMPLO.x + 1, TEMPLO.y, TEMPLO.z);
    const antes = vecina.getItemCount();
    const espada = vecina.addItem(2400);
    check('addItem crea un objeto en la casilla', espada && espada.getName() === 'magic sword' && vecina.getItemCount() === antes + 1);
    check('getItemById y getItems', vecina.getItemById(2400).getUniqueId() === espada.getUniqueId() &&
        vecina.getItems().some((i) => i.getId() === 2400));
    check('getTopDownItem es la espada', vecina.getTopDownItem() && vecina.getTopDownItem().getId() === 2400);
    check('queryAdd: una casilla libre admite una criatura y un objeto', vecina.queryAdd(beto.wrap) === true && vecina.queryAdd(espada) === true);
    check('queryAdd: con alguien encima no admite otra criatura', t.queryAdd(beto.wrap) === false);
    espada.remove();
    const casa = House(1);
    const casilla = casa.getTiles()[5];
    check('una casilla de casa: isHouse y getHouse', casilla.isHouse() && casilla.getHouse().getId() === 1 && !t.isHouse());
    check('hasFlag(TILESTATE_HOUSE)', casilla.hasFlag(TILESTATE_HOUSE));
    const mochila = vecina.addItem(2412);
    check('getItemByType(ITEM_TYPE_CONTAINER)', vecina.getItemByType(ITEM_TYPE_CONTAINER).getUniqueId() === mochila.getUniqueId());
    mochila.remove();
    // El punto de cuerda (11000) es un SUELO: se pone en una casilla apartada, que cambia de suelo.
    const lejos = Tile(TEMPLO.x - 6, TEMPLO.y + 6, TEMPLO.z);
    check('isRopeSpot: no hasta que hay un punto de cuerda', !lejos.isRopeSpot());
    Game.createItem(11000, 1, TEMPLO.x - 6, TEMPLO.y + 6, TEMPLO.z);
    check('isRopeSpot con el 11000', lejos.isRopeSpot() && lejos.getGround().getId() === 11000);
    check('Tile fuera del mapa es null', Tile(-5, -5, 7) === null);
});

// ===========================================================================
section('4. ItemType');
// ===========================================================================
intentar('ItemType', () => {
    const espada = ItemType(2400);
    check('ItemType(2400): magic sword, 42 oz (4200), ataque 48, defensa 35', espada.getName() === 'magic sword' &&
        espada.getWeight() === 4200 && espada.getAttack() === 48 && espada.getDefense() === 35, espada.toString());
    check('se pone en la mano (SLOTP_HAND) y no es apilable', (espada.getSlotPosition() & SLOTP_HAND) !== 0 && !espada.isStackable());
    check('ItemType por nombre', ItemType('magic sword').getId() === 2400);
    const oro = ItemType(3031);
    check('gold coin: apilable, plural, cuenta, cogible y movible', oro.isStackable() && oro.getPluralName() === 'gold coins' &&
        oro.hasShowCount() && oro.isPickupable() && oro.isMovable() && oro.getArticle() === 'a');
    const mochila = ItemType(2412);
    check('backpack: contenedor de 20', mochila.isContainer() && mochila.getCapacity() === 20 && mochila.getType() === ITEM_TYPE_CONTAINER);
    check('letter: se escribe y se lee', ItemType(21041).isWritable() && ItemType(21041).isReadable() && ItemType(21041).getMaxTextLength() === 500);
    check('sudden death rune: runa con 3 cargas', ItemType(21001).isRune() && ItemType(21001).getCharges() === 3);
    check('un tipo que no existe tiene id 0', ItemType(987654).getId() === 0 && ItemType(987654).getName() === '');
    check('una puerta es una puerta', ItemType(4604).isDoor());
});

// ===========================================================================
section('5. Item y Container');
// ===========================================================================
intentar('Item', () => {
    const p = { x: TEMPLO.x + 2, y: TEMPLO.y, z: TEMPLO.z };
    const oro = Game.createItem(3031, 50, p.x, p.y, p.z);
    check('getSubType de una pila es su cantidad', oro.getSubType() === 50 && oro.getCount() === 50);
    const parte = oro.split(20);
    check('split(20) separa 20 en un objeto suelto', parte && parte.getCount() === 20 && oro.getCount() === 30 && parte.getPosition() === null);
    const copia = oro.clone();
    check('clone: igual y nuevo', copia.getId() === 3031 && copia.getCount() === 30 && copia.getUniqueId() !== oro.getUniqueId());
    oro.setActionId(4500);
    check('setActionId / getActionId / getAttribute(ITEM_ATTRIBUTE_ACTIONID)',
        oro.getActionId() === 4500 && oro.getAttribute(ITEM_ATTRIBUTE_ACTIONID) === 4500 && oro.hasAttribute(ITEM_ATTRIBUTE_ACTIONID));
    oro.removeAttribute(ITEM_ATTRIBUTE_ACTIONID);
    check('removeAttribute(ITEM_ATTRIBUTE_ACTIONID)', oro.getActionId() === 0 && !oro.hasAttribute('actionId'));
    oro.setCustomAttribute('dueño', 'Ana');
    check('atributos propios (custom)', oro.getCustomAttribute('dueño') === 'Ana' && oro.getCustomAttribute('nada') === null);
    oro.setText('hola');
    check('setText / getText', oro.getText() === 'hola');
    check('getType, getArticle y getPluralName', oro.getType().getId() === 3031 && oro.getArticle() === 'a' && oro.getPluralName() === 'gold coins');
    check('getParent y getTile de un objeto del suelo: su casilla', oro.getParent() && oro.getParent().getPosition().x === p.x &&
        oro.getTile().getPosition().equals(Position(p.x, p.y, p.z)));
    check('hasProperty(CONST_PROP_MOVEABLE) y no bloquea', oro.hasProperty(CONST_PROP_MOVEABLE) && !oro.hasProperty(CONST_PROP_BLOCKSOLID));
    check('lo creado por un script no viene del mapa', !oro.isLoadedFromMap());
    const suelo = Tile(TEMPLO.x + 4, TEMPLO.y + 1, TEMPLO.z).getGround();
    check('el suelo de una casilla del mapa sí viene del mapa', suelo && suelo.isLoadedFromMap(), suelo && suelo.toString());

    // Un contenedor del suelo, con otro dentro.
    const caja = Game.createItem(2412, 1, p.x, p.y, p.z);
    caja.addItem(2400, 1);
    check('addItemEx mete un objeto que ya existe (la parte separada)', caja.addItemEx(parte) && parte.getParent().getUniqueId() === caja.getUniqueId());
    const bolsa = caja.addItem(2412, 1);
    bolsa.addItem(3031, 5);
    check('getSize, getCapacity y getEmptySlots', caja.getSize() === 3 && caja.getCapacity() === 20 && caja.getEmptySlots() === 17);
    check('getEmptySlots(true) cuenta los de dentro', caja.getEmptySlots(true) === 17 + 19);
    check('getItem(0) es la espada', caja.getItem(0).getId() === 2400);
    check('getItemCountById cuenta a cualquier profundidad', caja.getItemCountById(3031) === 25, String(caja.getItemCountById(3031)));
    check('getItemHoldingCount', caja.getItemHoldingCount() === 4);
    check('hasItem (dentro de la bolsa también)', caja.hasItem(parte) && caja.hasItem(bolsa.getItem(0)) && !caja.hasItem(copia));
    check('getTopParent de lo de dentro: la casilla de la caja', bolsa.getItem(0).getTopParent().getPosition().x === p.x);
    check('Container(uid) y Item(uid)', Container(caja.getUniqueId()) === caja && Container(oro.getUniqueId()) === null && Item(oro.getUniqueId()) === oro);
    check('getCorpseOwner de una caja: 0', caja.getCorpseOwner() === 0);
    caja.remove();
    oro.remove();

    // El inventario: la mochila puesta.
    const mochila = ana.wrap.getSlotItem(CONST_SLOT_BACKPACK);
    check('getSlotItem(CONST_SLOT_BACKPACK): la mochila puesta', mochila && mochila.getId() === 2412 && mochila.isContainer());
    const libres = mochila.getEmptySlots();
    check('addItemEx a la mochila: un objeto suelto', mochila.addItemEx(copia) && mochila.getEmptySlots() === libres - 1 &&
        ana.wrap.getItemCount(3031) >= 30);
    check('getParent de lo que va en la mochila: la mochila; getTopParent: ana',
        ana.wrap.getItemById(3031).getParent().getId() === 2412 && ana.wrap.getItemById(3031).getTopParent() === ana.wrap);
    check('getParent de la mochila puesta: ana', mochila.getParent() === ana.wrap);
    const s = ana.wrap.getItemById(3031).split(10);
    check('split en el inventario', s && s.getCount() === 10 && ana.wrap.getItemCount(3031) === 20);
});

// ===========================================================================
section('6. Player y Creature');
// ===========================================================================
intentar('Player', () => {
    const a = ana.wrap;
    check('getGuid y getAccountId (de la base)', a.getGuid() === ana.pj.characterId && a.getGuid() > 0 && a.getAccountId() > 0);
    check('getIp: 10.0.0.5 como número de TFS', a.getIp() === 10 + 5 * 16777216, String(a.getIp()));
    check('getSkillLevel(SKILL_SWORD) es la de «sword»', a.getSkillLevel(SKILL_SWORD) === a.getSkillLevel('sword') && a.getSkillLevel(SKILL_SWORD) >= 10);
    check('getEffectiveSkillLevel, getMagicLevel, getBaseMagicLevel', a.getEffectiveSkillLevel(SKILL_SHIELD) === a.getSkillLevel('shielding') &&
        a.getBaseMagicLevel() === a.getMagicLevel() && a.getSkillLevel(SKILL_LEVEL) === a.getLevel());
    check('getStamina: llena (42 h)', a.getStamina() === 2520);
    const almas = a.getSoul();
    a.addSoul(-10);
    check('addSoul / getSoul / getMaxSoul', a.getSoul() === almas - 10 && a.getMaxSoul() === 100);
    check('getCapacity y getFreeCapacity', a.getCapacity() > 0 && a.getFreeCapacity() < a.getCapacity());
    a.setSex(PLAYERSEX_FEMALE);
    check('setSex(PLAYERSEX_FEMALE)', a.getSex() === 'female' && getPlayerSex(a.getId()) === PLAYERSEX_FEMALE);
    a.setSex('male');
    check('isPremium / getPremiumDays / getLastLoginSaved', a.isPremium() === false && a.getPremiumDays() === 0 && a.getLastLoginSaved() === 0);
    check('getAccountType: el grupo (1, normal)', a.getAccountType() === ACCOUNT_TYPE_NORMAL);
    const dep = a.getDepotChest(1);
    check('getDepotChest(1) y getInbox: el depósito de su ciudad', dep && dep.isContainer() && a.getInbox().getUniqueId() === dep.getUniqueId());
    check('getTown: Jetyum', a.getTown() && a.getTown().getName() === 'Jetyum');
    const voc = a.getVocationInfo();
    check('getVocationInfo es un Vocation, y con su ficha como antes', voc.getName() === 'Knight' && voc.getId() === 4 &&
        voc.gainHp === 15 && voc.skills.sword === 1.1);
    check('getGroup es un Group, y con id/name como antes', a.getGroup().getName() === 'player' && a.getGroup().id === 1);
    world.messages.length = 0;
    a.sendTextMessage(MESSAGE_INFO_DESCR, 'Hola desde TFS');
    a.sendCancelMessage(RETURNVALUE_NOTENOUGHCAPACITY);
    check('sendTextMessage(tipo, texto) y sendCancelMessage(RETURNVALUE_*)',
        ultimosTextos(ana.pj, 2).join('|') === 'Hola desde TFS|Pesa demasiado.', ultimosTextos(ana.pj, 2).join('|'));
    a.registerEvent('cualquiera');
    check('registerEvent existe (y no hace falta)', a.registerEvent('x') === true && a.unregisterEvent('x') === true);
    check('getSkullTime sin calavera: 0', a.getSkullTime() === 0);
    check('save() lo guarda en la base', a.save() === true);
});

intentar('Creature', () => {
    const b = beto.wrap;
    world.teleportCreature(beto.pj, { x: TEMPLO.x + 3, y: TEMPLO.y + 3, z: TEMPLO.z });
    b.setDirection(DIRECTION_WEST);
    check('setDirection / getDirection', b.getDirection() === DIRECTION_WEST);
    const base = b.getBaseSpeed();
    b.changeSpeed(40);
    check('changeSpeed cambia la base', b.getBaseSpeed() === base + 40 && b.getSpeed() >= base + 40, b.getBaseSpeed() + ' ' + b.getSpeed());
    b.changeSpeed(-40);
    check('getSkull, getMaster y getSummons', b.getSkull() === '' && b.getMaster() === null && b.getSummons().length === 0);
    b.setNoMove(true);
    beto.pj.nextStepAt = 0;
    check('setNoMove(true): no da un paso', b.move('north') === false);
    b.setNoMove(false);
    beto.pj.nextStepAt = 0;
    check('setNoMove(false): ya anda', b.move('north') === true);
    const lobo = Game.createMonster('Wolf', TEMPLO.x + 6, TEMPLO.y + 6, TEMPLO.z);
    check('un monstruo: getOutfit y setOutfit sin comprobar', lobo && lobo.setOutfit({ lookType: 35 }).ok && lobo.getOutfit().lookType === 35);
    check('isRemoved: vivo no, quitado sí', !lobo.isRemoved() && lobo.remove() && lobo.isRemoved());
    const prisa = Condition(CONDITION_HASTE);
    prisa.setParameter(CONDITION_PARAM_TICKS, 5000);
    prisa.setParameter(CONDITION_PARAM_SPEED, 50);
    const antes = b.getSpeed();
    check('addCondition(Condition(CONDITION_HASTE))', b.addCondition(prisa) && b.hasCondition(CONDITION_HASTE) && b.getSpeed() === antes + 50);
    check('getCondition(CONDITION_HASTE) da lo que queda', b.getCondition(CONDITION_HASTE).ms === 5000);
    check('removeCondition(CONDITION_HASTE)', b.removeCondition(CONDITION_HASTE) && !b.hasCondition(CONDITION_HASTE) && b.getSpeed() === antes);
    const veneno = Condition(CONDITION_POISON);
    veneno.addDamage(3, 1000, -5);
    check('un veneno de TFS (addDamage) se convierte en el de Jetyum', b.addCondition(veneno) &&
        b.getCondition('veneno').ticks === 3 && b.getCondition('veneno').value === 5);
    b.removeCondition(CONDITION_POISON);
    check('una condición que Jetyum no tiene: false', b.addCondition(Condition(CONDITION_INVISIBLE)) === false);
    check('getTile de la criatura', b.getTile().getPosition().equals(b.getPosition()));
});

// ===========================================================================
section('7. Town, Group, Vocation');
// ===========================================================================
intentar('Town/Group/Vocation', () => {
    const t = Town(1);
    check('Town(1) y Town("Jetyum")', t.getName() === 'Jetyum' && Town('jetyum').getId() === 1 &&
        t.getTemplePosition().equals(Position(TEMPLO.x, TEMPLO.y, TEMPLO.z)));
    check('Game.getTowns()', Game.getTowns().length === 1 && Game.getTowns()[0].getId() === 1);
    check('Group(6) god: personal, edita casas', Group(6).getName() === 'god' && Group(6).getAccess() && Group(6).hasFlag(PlayerFlag_CanEditHouses));
    check('Group(1) no', !Group(1).getAccess() && !Group(1).hasFlag(PlayerFlag_CanEditHouses) && Group(1).getFlags() === 0);
    check('getMaxDepotItems y getMaxVipEntries', Group(1).getMaxDepotItems() > 0 && Group(1).getMaxVipEntries() === 0);
    const k = Vocation('Knight');
    check('Vocation: nombre, descripción y ganancias', k.getId() === 4 && k.getDescription() === 'a knight' &&
        k.getHealthGain() === 15 && k.getCapacityGain() === 25 && k.getManaGain() === 5);
    check('getRequiredSkillTries y getRequiredManaSpent crecen', k.getRequiredSkillTries(SKILL_SWORD, 12) > k.getRequiredSkillTries(SKILL_SWORD, 11) &&
        k.getRequiredManaSpent(2) > k.getRequiredManaSpent(1));
    check('getPromotion / getDemotion', k.getPromotion().getName() === 'Elite Knight' && Vocation('Elite Knight').getDemotion().getId() === 4 &&
        k.getDemotion() === null);
});

// ===========================================================================
section('8. House');
// ===========================================================================
intentar('House', () => {
    const h = House(1);
    check('House(1): casillas, puertas, ciudad, alquiler', h.getTiles().length === 31 && h.getTileCount() === 31 &&
        h.getDoorCount() === 1 && h.getTown().getName() === 'Jetyum' && h.getRent() >= 0);
    check('Game.getHouses()', Game.getHouses().length === 4 && Game.getHouse(2).getId() === 2);
    check('sin camas en el mapa: getBeds vacío', h.getBedCount() === 0 && h.getBeds().length === 0);
    check('setOwnerGuid(guid de ana)', h.setOwnerGuid(ana.wrap.getGuid()) && h.getOwnerGuid() === ana.wrap.getGuid() &&
        h.getOwnerName() === 'Ana Portadora' && ana.wrap.getHouse().getId() === 1);
    check('setAccessList(GUEST_LIST) / getAccessList', h.setAccessList(GUEST_LIST, 'Beto Portador') && h.getAccessList(GUEST_LIST) === 'Beto Portador');
    check('canEditAccessList: la dueña todas, un invitado ninguna', h.canEditAccessList(SUBOWNER_LIST, ana.wrap) && !h.canEditAccessList(GUEST_LIST, beto.wrap));
    const dentro = h.getTiles().find((tile) => tile.queryAdd(beto.wrap));
    world.teleportCreature(beto.pj, dentro.getPosition());
    check('kickPlayer: la dueña echa al invitado a la salida', h.getPlayers().includes(beto.wrap) && h.kickPlayer(ana.wrap, beto.wrap) &&
        beto.wrap.getPosition().equals(h.getExitPosition()));
    check('setOwnerGuid(0): sin dueño', h.setOwnerGuid(0) && h.getOwnerGuid() === 0 && ana.wrap.getHouse() === null);
});

// ===========================================================================
section('9. Party');
// ===========================================================================
intentar('Party', () => {
    ana.wrap.partyInvite('Beto Portador');
    beto.wrap.partyJoin('Ana Portadora');
    const g = ana.wrap.getParty();
    check('getParty es un Party: getLeader y getMembers (sin el líder)', g.getLeader() === ana.wrap && g.getMembers().length === 1 &&
        g.getMembers()[0] === beto.wrap && g.getMemberCount() === 1);
    check('y conserva leader/members como antes', g.leader === 'Ana Portadora' && g.members.length === 2);
    check('la experiencia se comparte', g.isSharedExperienceActive());
    g.setSharedExperience(false);
    const exp = beto.wrap.getExperience();
    world.partyMembersNear(ana.pj);
    check('setSharedExperience(false): cada uno la suya', !g.isSharedExperienceActive() && world.partyMembersNear(ana.pj).length === 1);
    g.setSharedExperience(true);
    check('shareExperience reparte', g.shareExperience(100) && beto.wrap.getExperience() === exp + 50);
    check('setLeader(beto)', g.setLeader(beto.wrap) && beto.wrap.getParty().getLeader() === beto.wrap);
    check('disband', g.disband() && ana.wrap.getParty() === null && beto.wrap.getParty() === null);
});

// ===========================================================================
section('10. Las funciones de 0.x');
// ===========================================================================
intentar('compat', () => {
    const cid = ana.wrap.getId();
    world.messages.length = 0;
    check('mensajes: doPlayerSendTextMessage, doPlayerSendCancel', doPlayerSendTextMessage(cid, MESSAGE_EVENT_ADVANCE, 'uno') &&
        doPlayerSendCancel(cid, 'dos') && ultimosTextos(ana.pj, 2).join('|') === 'uno|dos');
    efectos.length = 0;
    check('efectos: doSendMagicEffect, doSendDistanceShoot', doSendMagicEffect(getCreaturePosition(cid), CONST_ME_POFF) &&
        doSendDistanceShoot(TEMPLO, { x: TEMPLO.x + 2, y: TEMPLO.y, z: TEMPLO.z }, CONST_ANI_ARROW) && efectos.length === 2);
    check('doSendAnimatedText', doSendAnimatedText(TEMPLO, '+5', 0) === true);

    const antes = getPlayerItemCount(cid, 2160);
    check('doPlayerAddItem da el objeto', doPlayerAddItem(cid, 2160, 3) && getPlayerItemCount(cid, 2160) === antes + 3);
    check('doPlayerRemoveItem lo quita (y no si no hay tantos)', doPlayerRemoveItem(cid, 2160, 3) && !doPlayerRemoveItem(cid, 2160, 999));
    const dinero = getPlayerMoney(cid);
    check('doPlayerAddMoney / doPlayerRemoveMoney / getPlayerMoney', doPlayerAddMoney(cid, 150) && getPlayerMoney(cid) === dinero + 150 &&
        doPlayerRemoveMoney(cid, 150) && getPlayerMoney(cid) === dinero);

    const p = { x: TEMPLO.x + 2, y: TEMPLO.y + 1, z: TEMPLO.z };
    const uid = doCreateItem(2400, 1, p);
    check('doCreateItem devuelve el uid', typeof uid === 'number' && getThing(uid).itemid === 2400 && getThingPos(uid).x === p.x);
    check('doTransformItem', doTransformItem(uid, 2412) && getThing(uid).itemid === 2412);
    check('doItemSetAttribute / getItemAttribute', doItemSetAttribute(uid, 'actionId', 77) && getItemAttribute(uid, 'actionId') === 77);
    check('doTeleportThing con un objeto', doTeleportThing(uid, { x: p.x + 1, y: p.y, z: p.z }) && getThingPos(uid).x === p.x + 1);
    check('doRemoveItem', doRemoveItem(uid) && !isItem(uid));
    check('getTileItemById y getTopCreature', getTileItemById(TEMPLO, 999999).uid === 0 && getTopCreature(TEMPLO).uid === cid);

    check('storage del jugador: -1 sin valor', getPlayerStorageValue(cid, 9001) === -1 && setPlayerStorageValue(cid, 9001, 5) &&
        getPlayerStorageValue(cid, 9001) === 5);
    check('storage global: -1 sin valor, y se guarda', getGlobalStorageValue(777) === -1 && setGlobalStorageValue(777, 42) &&
        getGlobalStorageValue(777) === 42 && Game.getStorageValue(777) === 42);

    check('getPlayerLevel, getPlayerMagLevel, getPlayerName, getCreatureName',
        getPlayerLevel(cid) === ana.wrap.getLevel() && getPlayerMagLevel(cid) === 0 && getPlayerName(cid) === 'Ana Portadora' &&
        getCreatureName(cid) === 'Ana Portadora');
    check('getPlayerVocation: el número', getPlayerVocation(cid) === 4);
    check('getCreaturePosition / getThingPos de una criatura', getThingPos(cid).equals(getCreaturePosition(cid)));
    check('isPlayer, isCreature, isMonster, isNpc', isPlayer(cid) && isCreature(cid) && !isMonster(cid) && !isNpc(cid) && !isPlayer(999999));
    check('getPlayerByName', getPlayerByName('beto portador') === beto.wrap.getId() && getPlayerByName('Nadie') === false);
    world.healCreature(ana.pj, -20);
    const vida = getCreatureHealth(cid);
    check('doCreatureAddHealth / getCreatureHealth / getCreatureMaxHealth', doCreatureAddHealth(cid, 10) && getCreatureHealth(cid) === vida + 10 &&
        getCreatureMaxHealth(cid) === ana.pj.maxHealth);
    check('doCreatureAddMana', doCreatureAddMana(cid, 5) && getCreatureMana(cid) >= 0);
    const exp = ana.wrap.getExperience();
    check('doPlayerAddExp / doPlayerAddExperience', doPlayerAddExp(cid, 10) && doPlayerAddExperience(cid, 5) && ana.wrap.getExperience() === exp + 15);

    const lobo = doSummonCreature('Wolf', { x: TEMPLO.x + 7, y: TEMPLO.y + 7, z: TEMPLO.z });
    check('doSummonCreature / doCreateMonster dan un cid de monstruo', lobo && isMonster(lobo) && getCreatureName(lobo) === 'Wolf');
    const npc = doCreateNpc('Guardia', { x: TEMPLO.x - 4, y: TEMPLO.y - 4, z: TEMPLO.z });
    check('doCreateNpc', npc && isNpc(npc));
    check('getWorldCreatures(0, 1, 2)', getWorldCreatures(0) === 2 && getWorldCreatures(1) >= 1 && getWorldCreatures(2) >= 1);
    doRemoveCreature(lobo);

    world.messages.length = 0;
    check('broadcastMessage llega a todos', broadcastMessage('Aviso') && world.messages.filter((m) => m.text === 'Aviso').length === 2);
    check('getPlayersOnline', getPlayersOnline().length === 2 && getPlayersOnline().includes(cid));
    check('doPlayerSetTown / getPlayerTown', doPlayerSetTown(cid, 1) && getPlayerTown(cid) === 1);
    check('getTownTemplePosition / getTownName / getTownId', getTownTemplePosition(1).x === TEMPLO.x && getTownName(1) === 'Jetyum' && getTownId('Jetyum') === 1);
    check('getHouseOwner / getTileHouseInfo', getHouseOwner(1) === 0 && getTileHouseInfo(House(1).getTiles()[0].getPosition()) === 1 &&
        getTileHouseInfo(TEMPLO) === false);
    check('isInArray (sin mayúsculas)', isInArray(['Uno', 'dos'], 'uno') && isInArray([1, 2], 2) && !isInArray([1], 3));
    check('getConfigValue y configManager', getConfigValue('worldType') === e.config.worldType &&
        configManager.getNumber(configKeys.RATE_EXPERIENCE) === Number(e.config.rateExperience) &&
        configManager.getString(configKeys.SERVER_NAME) === String(e.config.serverName) && configManager.getBoolean('useDatabase') === true);
    const t = getWorldTime();
    check('getWorldTime: minutos del día', t >= 0 && t < 1440);
    check('getPlayerGroupId / getPlayerAccess', getPlayerGroupId(cid) === 1 && getPlayerAccess(cid) === 0);

    let corrio = false;
    const ev = addEvent((x) => { corrio = x; }, 500, 'sí');
    const ev2 = addEvent(() => { corrio = 'no'; }, 500);
    stopEvent(ev2);
    pasar(750);
    check('addEvent / stopEvent', ev > 0 && corrio === 'sí');

    const cond = createConditionObject(CONDITION_PARALYZE);
    setConditionParam(cond, CONDITION_PARAM_TICKS, 4000);
    setConditionFormula(cond, -0.5, 0, -0.5, 0);
    const vel = beto.wrap.getSpeed();
    check('createConditionObject + setConditionFormula + doAddCondition', doAddCondition(beto.wrap.getId(), cond) &&
        getCreatureCondition(beto.wrap.getId(), CONDITION_PARALYZE) && beto.wrap.getSpeed() < vel);
    check('doRemoveCondition', doRemoveCondition(beto.wrap.getId(), CONDITION_PARALYZE) && !getCreatureCondition(beto.wrap.getId(), CONDITION_PARALYZE));
    check('doTeleportThing con una criatura', doTeleportThing(beto.wrap, { x: TEMPLO.x + 2, y: TEMPLO.y + 2, z: TEMPLO.z }) &&
        getThingPos(beto.wrap.getId()).x === TEMPLO.x + 2);
    check('mezclar las dos APIs: un envoltorio donde va un cid', getPlayerName(ana.wrap) === 'Ana Portadora');
    check('getCreatureSkullType y getPlayerSlotItem', getCreatureSkullType(cid) === SKULL_NONE && getPlayerSlotItem(cid, CONST_SLOT_BACKPACK).itemid === 2412);
    check('lo que no existe: false', doPlayerSendTextMessage(999999, 1, 'x') === false && getCreatureName(999999) === false);
});

// ===========================================================================
section('11. Los eventos');
// ===========================================================================
intentar('talkactions', () => {
    const r = e.registry;
    const dichas = [];
    r.register({ type: 'talkaction', words: '/staff', access: true, onSay: (p, w, param) => { dichas.push('staff:' + param); return true; } }, 'test');
    r.register({ type: 'talkaction', words: '/god', accountType: ACCOUNT_TYPE_GOD, onSay: () => { dichas.push('god'); return true; } }, 'test');
    r.register({ type: 'talkaction', words: '!casa', separator: '"', onSay: (p, w, param) => { dichas.push('casa:' + param); return true; } }, 'test');
    r.register({ type: 'talkaction', words: '/t', separator: '', onSay: (p, w, param) => { dichas.push('t:' + param); return true; } }, 'test');
    const decir = (texto) => e.dispatchTalkAction(texto, { playerId: ana.pj.id }).handled;
    check('access: true: un jugador no la tiene', !decir('/staff hola'));
    ana.pj.groupId = 4;
    check('...un gamemaster sí', decir('/staff hola') && dichas.includes('staff:hola'));
    check('accountType: ACCOUNT_TYPE_GOD: un gamemaster no', !decir('/god'));
    ana.pj.groupId = 6;
    check('...un god sí', decir('/god') && dichas.includes('god'));
    ana.pj.groupId = 1;
    check('separator \'"\': !casa "Bob', decir('!casa "Bob') && dichas.includes('casa:Bob'));
    check('...y sin el separador no casa', !decir('!casa Bob'));
    check('separator \'\': /t123 pegado', decir('/t123') && dichas.includes('t:123'));
});

intentar('eventos de criatura', () => {
    const r = e.registry;
    // onPrepareDeath: la arena. Se cura y no muere.
    r.register({ type: 'event', event: 'preparedeath', onPrepareDeath(creature) {
        if (creature.isPlayer() && creature.getName() === 'Beto Portador') {
            creature.addHealth(creature.getMaxHealth());
            return false;
        }
        return true;
    } }, 'test');
    const muertes = [];
    world.on('onPlayerDeath', (p) => muertes.push(p.name));
    world.teleportCreature(beto.pj, { x: TEMPLO.x + 5, y: TEMPLO.y + 5, z: TEMPLO.z });
    const golpe = world.combat.applyDamage(beto.pj, 100000, { ignoreArmor: true });
    check('onPrepareDeath con false: no muere (y se curó)', !golpe.killed && muertes.length === 0 && beto.pj.health === beto.pj.maxHealth,
        beto.pj.health + '/' + beto.pj.maxHealth);
    r.events.delete('preparedeath');

    // onHealthChange: la mitad de daño.
    r.register({ type: 'event', event: 'healthchange', onHealthChange(creature, attacker, dano, tipo) {
        return creature.getName() === 'Beto Portador' && tipo === COMBAT_FIREDAMAGE ? Math.floor(dano / 2) : dano;
    } }, 'test');
    const vida = beto.pj.health;
    const g2 = world.combat.applyDamage(beto.pj, 20, { element: 'fire', ignoreArmor: true });
    check('onHealthChange cambia el daño (la mitad del fuego)', g2.damage === 10 && beto.pj.health === vida - 10, JSON.stringify(g2.damage));
    r.events.delete('healthchange');

    // onManaChange: nada de drenar maná.
    r.register({ type: 'event', event: 'manachange', onManaChange() { return 0; } }, 'test');
    beto.pj.mana = Math.max(10, beto.pj.mana);
    const mana = beto.pj.mana;
    world.combat.applyDamage(beto.pj, 5, { element: 'manadrain', ignoreArmor: true });
    check('onManaChange cambia el maná drenado', beto.pj.mana === mana);
    r.events.delete('manachange');

    // onThink: cada segundo por jugador.
    const piensan = [];
    r.register({ type: 'event', event: 'think', onThink(creature, intervalo) { piensan.push(creature.getName() + ':' + intervalo); } }, 'test');
    e.globalClock.start();
    pasar(2100);
    check('onThink(creature, interval) cada segundo', piensan.filter((x) => x === 'Ana Portadora:1000').length >= 2, piensan.length + ' veces');
    r.events.delete('think');

    // onTextEdit: lo que se escribe en un objeto.
    r.register({ type: 'event', event: 'textedit', onTextEdit(player, item, texto) { return texto !== 'prohibido'; } }, 'test');
    const carta = Game.createItem(21041, 1, TEMPLO.x + 1, TEMPLO.y + 1, TEMPLO.z);
    const v1 = ana.wrap.showTextDialog(carta, '', true, 100);
    world.guardarVentanaDeTexto(ana.pj, v1, 'prohibido');
    check('onTextEdit con false: no se guarda', carta.getText() === '');
    const v2 = ana.wrap.showTextDialog(carta, '', true, 100);
    world.guardarVentanaDeTexto(ana.pj, v2, 'Querida Beto');
    check('onTextEdit con true: se guarda (firma de TFS: item, text, canWrite, length)', carta.getText() === 'Querida Beto');
    const v3 = ana.wrap.showTextDialog({ titulo: 'Carta', editable: true, item: carta }, (t) => carta.setText(t));
    world.guardarVentanaDeTexto(ana.pj, v3, 'prohibido');
    check('...y con las opciones de Jetyum (`item`)', carta.getText() === 'Querida Beto');
    r.events.delete('textedit');
    carta.remove();
});

intentar('eventos globales', () => {
    const r = e.registry;
    let guardados = 0;
    r.register({ type: 'globalevent', name: 'al guardar', event: 'save', onSave() { guardados += 1; } }, 'test');
    pasar(61000);
    check('onSave en el guardado periódico', guardados >= 1, String(guardados));
    const records = [];
    r.register({ type: 'globalevent', name: 'récord', event: 'record', onRecord(ahora, antes) { records.push(ahora + '>' + antes); } }, 'test');
    const carla = conectar('Carla Portadora');
    pasar(500);
    check('onRecord(current, old) con un jugador más que nunca', records.includes('3>2'), records.join(' '));
    check('Game.getPlayersRecord', Game.getPlayersRecord() === 3);
    carla.sesion.close();
});

// ===========================================================================
section('12. El storage global y el récord sobreviven a reiniciar');
// ===========================================================================
intentar('reinicio', () => {
    ana.sesion.close();
    beto.sesion.close();
    e.shutdown();
    arrancar();
    engancharEfectos();
    const otra = conectar('Ana Portadora');
    check('getGlobalStorageValue(777) después de reiniciar', getGlobalStorageValue(777) === 42);
    check('el récord también', Game.getPlayersRecord() === 3);
    check('y el storage del jugador', getPlayerStorageValue(otra.wrap.getId(), 9001) === 5);
    otra.sesion.close();
});

// ===========================================================================
section('13. Portar: un script de TFS, cargado con el cargador de verdad');
// ===========================================================================
intentar('portar', () => {
    const dir = path.join(carpeta, 'scripts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'premio.js'), `
// Un !premio de un datapack de TFS 0.x, casi línea por línea, más un par de cosas de 1.x.
const STORAGE = 50001;
const RECOGIDOS = 60000;

module.exports = [
    {
        type: 'talkaction',
        words: '!premio',
        onSay(player, words, param) {
            const cid = player.getId();
            if (!Tile(getCreaturePosition(cid)).hasFlag(TILESTATE_PROTECTIONZONE)) {
                doPlayerSendCancel(cid, 'Sólo en el templo.');
                return true;
            }
            if (getPlayerStorageValue(cid, STORAGE) !== -1) {
                doPlayerSendCancel(cid, 'Ya tienes tu premio.');
                return true;
            }
            doPlayerAddItem(cid, ItemType('crystal coin').getId(), 2);
            setPlayerStorageValue(cid, STORAGE, 1);
            setGlobalStorageValue(RECOGIDOS, Math.max(0, getGlobalStorageValue(RECOGIDOS)) + 1);
            doPlayerSendTextMessage(cid, MESSAGE_INFO_DESCR, 'Has recibido tu premio, ' + getPlayerName(cid) + '.');
            doSendMagicEffect(getCreaturePosition(cid), CONST_ME_GIFT_WRAPS);
            addEvent((id) => {
                const p = Player(id);
                if (p) {
                    p.getPosition().sendMagicEffect(CONST_ME_FIREWORK_RED);
                }
            }, 1000, cid);
            return true;
        }
    },
    {
        type: 'event',
        event: 'login',
        onLogin(player) {
            player.registerEvent('PremioDeath');
            return true;
        }
    }
];
`);
    const r = loadContent(e.registry, { directories: [dir], rootDir: carpeta, logger: e.log });
    check('el cargador lo carga', r.files === 1 && r.definitions === 2, JSON.stringify(r));
    const dani = conectar('Dani Portadora');
    world.teleportCreature(dani.pj, TEMPLO);
    const cid = dani.wrap.getId();
    efectos.length = 0;
    const cristal = getPlayerItemCount(cid, 2160);
    const h = e.dispatchTalkAction('!premio', { playerId: dani.pj.id });
    check('!premio da 2 crystal coins', h.handled && getPlayerItemCount(cid, 2160) === cristal + 2);
    check('y apunta los storages', getPlayerStorageValue(cid, 50001) === 1 && getGlobalStorageValue(60000) === 1);
    check('y le habla, con el efecto', ultimosTextos(dani.pj)[0] === 'Has recibido tu premio, Dani Portadora.' && efectos.some((x) => x.efecto === CONST_ME_GIFT_WRAPS));
    pasar(1250);
    check('el addEvent con Player(cid) y pos.sendMagicEffect', efectos.some((x) => x.efecto === CONST_ME_FIREWORK_RED));
    e.dispatchTalkAction('!premio', { playerId: dani.pj.id });
    check('la segunda vez no', getPlayerItemCount(cid, 2160) === cristal + 2 && ultimosTextos(dani.pj)[0] === 'Ya tienes tu premio.');
    world.teleportCreature(dani.pj, { x: TEMPLO.x + 6, y: TEMPLO.y + 6, z: TEMPLO.z });
    check('fuera del templo tampoco', e.dispatchTalkAction('!premio', { playerId: dani.pj.id }).handled && ultimosTextos(dani.pj)[0] === 'Sólo en el templo.');
    dani.sesion.close();
});

e.shutdown();
try {
    fs.rmSync(carpeta, { recursive: true, force: true });
} catch (error) {
    // Windows a veces tarda en soltar el archivo: se queda en la carpeta temporal.
}

console.log('');
if (failures === 0) {
    console.log('\x1b[32mTodo OK\x1b[0m — ' + total + ' comprobaciones: un script de TFS encuentra las clases, las constantes y las funciones que espera.');
    process.exit(0);
}
console.log('\x1b[31m' + failures + ' de ' + total + ' comprobacion(es) fallaron\x1b[0m');
process.exit(1);
