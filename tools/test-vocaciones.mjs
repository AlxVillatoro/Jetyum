/**
 * Pruebas de las vocaciones y los aspectos (`data/XML/vocations.js` y `outfits.js`).
 *
 * Comprueba que cada propiedad hace algo de verdad en el juego: la vida y el maná por nivel,
 * la regeneración, la velocidad, las almas, las skills (y su multiplicador), el nivel mágico,
 * la velocidad de ataque, las fórmulas de daño y armadura, la elección de vocación al crear
 * personaje (y needPremium), los aspectos por sexo, y que todo se guarda en la base.
 *
 *   node tools/test-vocaciones.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');
const { World } = require('../engine/world/world.js');
const { PlayerRepository } = require('../engine/persistence/players.js');
const Definiciones = require('../engine/data/definiciones.js');
const V = require('../engine/world/vocacion.js');
const { canUseOutfit, outfitsFor } = require('../engine/world/outfit.js');
const PR = require('../engine/net/protocol.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);

async function main() {
    // -----------------------------------------------------------------------
    section('1. Los archivos: vocations.js y outfits.js');
    const vocaciones = Definiciones.loadVocations(path.join(ROOT, 'data/XML/vocations.js'));
    const aspectos = Definiciones.loadOutfits(path.join(ROOT, 'data/XML/outfits.js'));
    check('nueve vocaciones: None, las cuatro y sus promociones', vocaciones.size === 9 &&
        ['None', 'Sorcerer', 'Druid', 'Paladin', 'Knight', 'Master Sorcerer', 'Elder Druid', 'Royal Paladin', 'Elite Knight']
            .every((n) => [...vocaciones.values()].some((v) => v.name === n)));
    const claves = ['gainCap', 'gainHp', 'gainMana', 'gainHpTicks', 'gainHpAmount', 'gainManaTicks', 'gainManaAmount',
        'manaMultiplier', 'attackSpeed', 'baseSpeed', 'soulMax', 'gainSoulTicks'];
    check('todas tienen todas las propiedades, con números', [...vocaciones.values()].every((v) =>
        claves.every((k) => Number.isFinite(v[k])) && Object.keys(v.formula).length === 8 &&
        Definiciones.SKILLS.every((s) => v.skills[s] > 1)));
    check('las que no dicen algo lo toman de None',
        Definiciones.normalizarVocacion({ id: 9, name: 'X' }, vocaciones.get(0)).gainHpTicks === vocaciones.get(0).gainHpTicks);
    check('los aspectos saben su sexo, si son de jugador y sus añadidos',
        aspectos.get(320).sex === 'female' && aspectos.get(321).sex === 'male' && aspectos.get(318).sex === 'any' &&
        aspectos.get(36).player === false && aspectos.get(345).addons.size === 2);
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voc-'));
        const xml = path.join(tmp, 'vocations.xml');
        fs.writeFileSync(xml, '<vocations><vocation id="0" name="None" gaincap="7" gainhp="5" gainmana="5">' +
            '<skill id="2" multiplier="1.7"/></vocation></vocations>');
        const viejas = Definiciones.loadVocations(xml);
        check('un vocations.xml del formato antiguo también se lee', viejas.get(0).gainCap === 7 && viejas.get(0).skills.sword === 1.7);
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    // -----------------------------------------------------------------------
    section('2. Las fórmulas (engine/world/vocacion.js)');
    const knight = vocaciones.get(4);
    const sorc = vocaciones.get(1);
    check('vida: 150 + gainHp × (nivel − 1)', V.maxHealthPara(knight, 8) === 150 + 15 * 7 && V.maxHealthPara(sorc, 1) === 150);
    check('maná: 55 + gainMana × (nivel − 1)', V.maxManaPara(sorc, 8) === 55 + 30 * 7);
    check('velocidad: baseSpeed + 2 × (nivel − 1)', V.velocidadPara(knight, 20) === 220 + 38);
    check('tries de espada a nivel 11: 50 × multiplicador^0', V.triesParaSkill(knight, 'sword', 10) === 50);
    check('y cuesta más a un hechicero que a un caballero subir la espada',
        V.triesParaSkill(sorc, 'sword', 20) > V.triesParaSkill(knight, 'sword', 20));
    check('nivel mágico: 1600 × manaMultiplier^nivel; el hechicero lo sube antes',
        V.manaParaNivelMagico(sorc, 0) === 1600 && V.manaParaNivelMagico(sorc, 5) < V.manaParaNivelMagico(knight, 5));
    {
        const p = { level: 1, health: 10, mana: 0, maxHealth: 150, maxMana: 55, soul: 99 };
        V.aplicarNivel(p, knight);
        let t = 0;
        let cambios = 0;
        for (; t <= 12000; t += 50) {
            if (V.regenerar(p, knight, t)) {
                cambios += 1;
            }
        }
        // Caballero: 2 de vida cada 6 s y 1 de maná cada 12 s, empezando a contar en t = 0.
        check('regenera gainHpAmount cada gainHpTicks segundos', p.health === 10 + 2 * 2, 'vida ' + p.health);
        check('y gainManaAmount cada gainManaTicks', p.mana === 1, 'maná ' + p.mana);
        check('las almas no pasan de soulMax', p.soul <= knight.soulMax);
    }
    {
        const p = { skills: V.skillsIniciales() };
        const r = V.sumarTries(p, knight, 'sword', 50);
        check('50 tries suben la espada del caballero a 11', r.subidas === 1 && p.skills.sword.level === 11 && p.skills.sword.tries === 0);
        const m = { magicLevel: 0, manaSpent: 0 };
        V.sumarManaGastado(m, sorc, 1600 + 1760);
        check('1600 + 1760 de maná gastado: el hechicero llega a nivel mágico 2', m.magicLevel === 2, 'nivel ' + m.magicLevel);
    }

    // -----------------------------------------------------------------------
    section('3. En el mundo');
    const engine = createEngine({ rootDir: ROOT, logLevel: 'error',
        overrides: { useDatabase: false, mapName: 'sample', mapFile: null } });
    const world = engine.world;
    {
        const k = world.createPlayer('Caballero', { x: 40, y: 40, z: 7 }, { vocation: 'Knight' });
        const s = world.createPlayer('Hechicera', { x: 41, y: 40, z: 7 }, { vocation: 'Sorcerer', sex: 'female' });
        check('un personaje nuevo nace con lo que dice su vocación',
            k.maxHealth === 150 && k.mana === 55 && k.soul === 100 && k.speed === 220 && s.sex === 'female');
        check('la capacidad sale de gainCap', world.capacityOf(k) > world.capacityOf(s));
        k.experience = 4200;
        const rata = world.createMonster('Rat', { x: 40, y: 41, z: 7 });
        rata.monsterType = { ...rata.monsterType, experience: 1 };
        engine.combat.grantExperience(k, rata);
        check('subir a nivel 8 aplica gainHp, gainMana y la velocidad, y cura',
            k.level === 8 && k.maxHealth === 150 + 15 * 7 && k.maxMana === 55 + 5 * 7 && k.health === k.maxHealth &&
            k.speed === 220 + 14, k.level + ' ' + k.maxHealth + '/' + k.maxMana);

        // Combate: espada, intervalo y entrenamiento.
        k.inventory.push({ slot: 'hand', position: 0, typeId: 2400, count: 1 });
        world.recomputeEquipment(k);
        check('una espada en la mano: weaponType sword', k.weaponType === 'sword');
        const objetivo = world.createMonster('Rat', { x: 40, y: 41, z: 7 });
        objetivo.maxHealth = objetivo.health = 100000;
        k.nextAttackAt = 0;
        const antes = k.skills.sword.tries;
        const golpe = engine.combat.attack(k, objetivo);
        check('pegar entrena la espada', golpe.hit !== undefined && k.skills.sword.tries === antes + 1);
        check('y el siguiente golpe espera attackSpeed', k.nextAttackAt - world.now() <= knight.attackSpeed &&
            k.nextAttackAt - world.now() > knight.attackSpeed - 50);
        check('el arma decide la skill y la formula de la vocación el daño',
            require('../engine/world/combat.js').attackProfile(k, world).maxDamage ===
            Math.floor((8 / 5 + 0.085 * 48 * k.skills.sword.level) * 1.1));
        check('la armadura del caballero vale un 10% más (formula.armor)', k.armorFactor === 1.1);

        // Regeneración en el tick del mundo.
        s.health = 100;
        const reloj = { t: 1e9 };
        world.now = () => reloj.t;
        s.regen = null;
        world.tick();
        reloj.t += 12001;
        world.tick();
        check('el tick del mundo regenera según la vocación', s.health === 101, 'vida ' + s.health);
        world.now = () => Date.now();

        // Promoción.
        const r = world.setVocation(k, 'Elite Knight');
        check('setVocation promociona y recalcula', r.ok && k.vocation === 'Elite Knight' && world.vocationOf(k).soulMax === 200);
        check('para crear: no vale una promoción ni una premium sin premium',
            !world.vocationForNewCharacter('Elite Knight', true).ok &&
            world.vocationForNewCharacter('druid', false).vocation === 'Druid' &&
            world.vocationForNewCharacter('', false).vocation === 'None' &&
            !world.vocationForNewCharacter('Pirata', false).ok);
    }

    // -----------------------------------------------------------------------
    section('4. Aspectos por sexo');
    {
        const el = { sex: 'male', premium: false };
        const ella = { sex: 'female', premium: false };
        const deEl = outfitsFor(el, world.outfitTypes).map((o) => o.lookType);
        const deElla = outfitsFor(ella, world.outfitTypes).map((o) => o.lookType);
        check('a él le salen los de hombre y los de cualquiera, no los de mujer',
            deEl.includes(321) && deEl.includes(318) && !deEl.includes(320) && !deEl.includes(345));
        check('a ella, al revés', deElla.includes(320) && deElla.includes(345) && !deElla.includes(321));
        check('nunca los de criatura ni los premium sin premium', !deEl.includes(36) && !deEl.includes(132));
        check('y canUseOutfit lo rechaza si se pide igual',
            !canUseOutfit({ lookType: 320, addons: 0 }, world.outfitTypes, false, el).ok);
    }

    // -----------------------------------------------------------------------
    section('5. La sesión: crear con vocación, estadísticas, hechizos, ataque continuo');
    {
        const enviados = [];
        const session = engine.createSession((m) => enviados.push(m));
        session.handle([PR.CLIENT.LOGIN, 'cuenta', 'clave', 'Maga', 'Sorcerer', 'female']);
        const yo = world.getPlayer(session.playerId);
        check('LOGIN con vocación y sexo crea así al personaje', yo.vocation === 'Sorcerer' && yo.sex === 'female');
        check('y el aspecto de inicio es uno que puede llevar',
            canUseOutfit(yo.outfit, world.outfitTypes, false, yo).ok, 'aspecto ' + yo.outfit.lookType);
        const stats = enviados.find((m) => m[0] === PR.SERVER.PLAYER_STATS);
        check('la bienvenida trae las estadísticas completas',
            stats && stats[5].maxMana === 55 && stats[5].soul === 100 && stats[5].skills.sword.level === 10 &&
            stats[5].stamina === 42 * 60 && stats[5].vocation === 'Sorcerer');
        enviados.length = 0;
        yo.mana = 40;
        session.update();
        check('si cambia el maná se vuelven a mandar', enviados.some((m) => m[0] === PR.SERVER.PLAYER_STATS && m[5].mana === 40));
        yo.health = 100;
        engine.dispatchTalkAction('exura', { playerId: yo.id, type: 1 });
        check('exura cura, gasta 20 de maná y cuenta para el nivel mágico',
            yo.health > 100 && yo.mana === 20 && yo.manaSpent === 20, yo.health + ' vida, ' + yo.mana + ' maná');
        engine.dispatchTalkAction('exura', { playerId: yo.id, type: 1 });
        check('justo después no se lanza otra: agotado (1 s entre curaciones)', yo.mana === 20 && yo.manaSpent === 20);
        yo.enfriamientos = {};
        engine.dispatchTalkAction('exura', { playerId: yo.id, type: 1 });
        yo.enfriamientos = {};
        engine.dispatchTalkAction('exura', { playerId: yo.id, type: 1 });
        check('sin maná no se lanza', yo.mana === 0 && yo.manaSpent === 40);

        const rata = world.createMonster('Rat', { x: yo.position.x + 1, y: yo.position.y, z: yo.position.z });
        rata.maxHealth = rata.health = 100000;
        yo.nextAttackAt = 0;
        session.handle([PR.CLIENT.ATTACK, rata.id]);
        const primero = rata.health;
        yo.nextAttackAt = 0;
        session.update();
        check('con objetivo, sigue golpeando solo', rata.health <= primero && yo.target === rata && yo.skills.fist.tries >= 2);
        session.handle([PR.CLIENT.CANCEL_ATTACK]);
        check('y CANCEL_ATTACK (Stop) lo deja', yo.target === null);
        const otra = engine.createSession(() => {});
        const r = otra.handle([PR.CLIENT.LOGIN, 'c', 'c', 'Promo', 'Elite Knight', 'male']);
        check('una promoción no se elige al crear', r.handled === false && /promocion/.test(r.error));
        session.close();
    }
    engine.shutdown();

    // -----------------------------------------------------------------------
    section('5b. Cambiar vocations.js con el servidor encendido');
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voc-rec-'));
        const archivo = path.join(tmp, 'vocations.js');
        const original = fs.readFileSync(path.join(ROOT, 'data/XML/vocations.js'), 'utf8');
        fs.writeFileSync(archivo, original);
        const e = createEngine({ rootDir: ROOT, logLevel: 'error',
            overrides: { useDatabase: false, mapName: 'sample', mapFile: null, vocationsXml: archivo } });
        const k = e.world.createPlayer('Recargado', { x: 40, y: 40, z: 7 }, { vocation: 'Knight' });
        k.level = 5;
        e.world.applyLevel(k, { curar: true });
        const antes = k.maxHealth;
        // Los números del usuario: gainHp 50, regeneración cada 3 s y daño x3.
        fs.writeFileSync(archivo, original.replace(/gainCap: 25, gainHp: 15, gainMana: 5,\s*gainHpTicks: 6, gainHpAmount: 2/,
            'gainCap: 25, gainHp: 50, gainMana: 5,\n        gainHpTicks: 3, gainHpAmount: 2')
            .replace("formula({ meleeDamage: 1.1, defense: 1.1, armor: 1.1 }),\n        skills: skills(1.1, 1.1, 1.1, 1.1, 3.0, 3.0, 3.0)",
                "formula({ meleeDamage: 3, defense: 1.1, armor: 1.1 }),\n        skills: skills(3, 1.1, 1.1, 1.1, 3.0, 3.0, 3.0)"));
        const r = e.recargarDefiniciones();
        const v = e.world.vocationOf(k);
        check('al recargar se aplican los números nuevos a quien está conectado',
            r.errores.length === 0 && v.gainHp === 50 && v.gainHpTicks === 3 && v.formula.meleeDamage === 3 &&
            k.maxHealth === 150 + 50 * 4 && antes === 150 + 15 * 4, antes + ' -> ' + k.maxHealth);
        const { attackProfile } = require('../engine/world/combat.js');
        check('y el daño ya sale con el multiplicador nuevo', attackProfile(k, e.world).maxDamage ===
            Math.floor((5 / 5 + 0.085 * 7 * 10) * 3), String(attackProfile(k, e.world).maxDamage));
        fs.writeFileSync(archivo, 'module.exports = [ { id: 0, name: ');
        const roto = e.recargarDefiniciones();
        check('un archivo con un error no rompe nada: se queda lo último bueno',
            roto.errores.length === 1 && e.world.vocationOf(k).gainHp === 50);
        e.dispatchTalkAction('/vocacion Druid', { playerId: k.id });
        check('/vocacion cambia la vocación del personaje', k.vocation === 'Druid');
        e.shutdown();
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    // -----------------------------------------------------------------------
    section('6. Se guarda en la base');
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voc-db-'));
        const file = path.join(tmp, 'p.db');
        const crear = () => {
            const w = new World({ logger: null });
            w.vocations = vocaciones;
            w.outfitTypes = aspectos;
            return new PlayerRepository({ world: w, file, spawnPosition: { x: 5, y: 5, z: 7 } }).open();
        };
        let repo = crear();
        repo.createAccount('ana', 'x');
        const nueva = repo.login({ account: 'ana', password: 'x', character: 'Ana', vocation: 'Druid', sex: 'female' });
        const p = nueva.player;
        check('el personaje nuevo es druida y mujer', p.vocation === 'Druid' && p.sex === 'female' && p.maxMana === 55);
        p.skills.club = { level: 14, tries: 3 };
        p.magicLevel = 7;
        p.manaSpent = 99;
        p.mana = 12;
        p.soul = 60;
        repo.logout(p);
        repo.close();
        repo = crear();
        const vuelta = repo.login({ account: 'ana', password: 'x', character: 'Ana', vocation: 'Knight' }).player;
        check('vuelve con su vocación, su sexo, sus skills, su nivel mágico, su maná y sus almas',
            vuelta.vocation === 'Druid' && vuelta.sex === 'female' && vuelta.skills.club.level === 14 &&
            vuelta.skills.club.tries === 3 && vuelta.magicLevel === 7 && vuelta.manaSpent === 99 &&
            vuelta.mana === 12 && vuelta.soul === 60);
        repo.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    // -----------------------------------------------------------------------
    section('7. Crear cuenta y entrar (sin cuentas que se crean solas)');
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voc-alta-'));
        const w = new World({ logger: null });
        w.vocations = vocaciones;
        w.outfitTypes = aspectos;
        const repo = new PlayerRepository({ world: w, file: path.join(tmp, 'p.db'), spawnPosition: { x: 5, y: 5, z: 7 },
            config: { autoCreateAccounts: false, autoCreateCharacters: false } }).open();
        const nadie = repo.login({ account: 'Sirakx', password: 'x', character: 'Sirakx' });
        check('entrar con una cuenta que no existe no la crea', !!nadie.error && !repo.database.findAccount('Sirakx'), nadie.error);
        const corta = repo.login({ crear: true, account: 'Sirakx', password: 'abc', character: 'Sirakx', vocation: 'Knight' });
        check('al crear, la contraseña necesita al menos 4 caracteres', /4 caracteres/.test(corta.error || ''));
        const alta = repo.login({ crear: true, account: 'Sirakx', password: 'clave1', character: 'Sir Akx', vocation: 'Knight', sex: 'male' });
        check('crear cuenta crea la cuenta y el personaje con su vocación y entra',
            alta.player && alta.created && alta.player.vocation === 'Knight' && alta.player.name === 'Sir Akx', alta.error);
        repo.logout(alta.player);
        w.removePlayer(alta.player.id);
        const otraVez = repo.login({ crear: true, account: 'Otra', password: 'clave2', character: 'Sir Akx' });
        check('el nombre del personaje no se repite', /ya existe un personaje/.test(otraVez.error || ''), otraVez.error);
        const mala = repo.login({ crear: true, account: 'Sirakx', password: 'mal', character: 'Segundo' });
        check('añadir un personaje a una cuenta que existe pide su contraseña', !!mala.error);
        const segundo = repo.login({ crear: true, account: 'Sirakx', password: 'clave1', character: 'Segundo', vocation: 'Druid' });
        check('con la contraseña buena se le añade otro personaje', segundo.player && segundo.player.vocation === 'Druid', segundo.error);
        repo.logout(segundo.player);
        w.removePlayer(segundo.player.id);
        const entrar = repo.login({ account: 'Sirakx', password: 'clave1', character: 'Sir Akx', vocation: 'Druid' });
        check('al entrar no se elige vocación: el personaje es lo que se creó', entrar.player && entrar.player.vocation === 'Knight');
        const nuevo = repo.login({ account: 'Sirakx', password: 'clave1', character: 'Fantasma' });
        check('y entrar con un personaje que no existe no lo crea', /crealo en/.test(nuevo.error || ''), nuevo.error);
        const lista = repo.charactersOf({ account: 'Sirakx', password: 'clave1' });
        check('la cuenta lista sus personajes con nivel y vocación',
            lista.characters && lista.characters.map((c) => c.name + ':' + c.vocation).join(',') === 'Segundo:Druid,Sir Akx:Knight' &&
            lista.characters.find((c) => c.name === 'Sir Akx').online === true,
            JSON.stringify(lista.characters || lista.error));
        check('y sin la contraseña buena no lista nada', !!repo.charactersOf({ account: 'Sirakx', password: 'mal' }).error);
        repo.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    // -----------------------------------------------------------------------
    section('8. Multijugador: dos jugadores entran a la vez');
    {
        const e = createEngine({ rootDir: ROOT, logLevel: 'error',
            overrides: { useDatabase: false, mapName: 'sample', mapFile: null } });
        const recibidos = { a: [], b: [] };
        const sa = e.createSession((m) => recibidos.a.push(m));
        const sb = e.createSession((m) => recibidos.b.push(m));
        sa.login({ character: 'Uno' });
        sb.login({ character: 'Dos' });
        const pa = sa.player.position;
        const pb = sb.player.position;
        check('el segundo no aparece encima del primero: va a la casilla de al lado',
            !(pa.x === pb.x && pa.y === pb.y && pa.z === pb.z) &&
            Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y)) <= 2 && e.world.map.isWalkable(pb.x, pb.y, pb.z),
            '(' + pa.x + ',' + pa.y + ') y (' + pb.x + ',' + pb.y + ')');
        sa.close();
        sb.close();
    }

    // -----------------------------------------------------------------------
    section('9. El botín de los monstruos: algo más que oro, y todo se ve');
    {
        const e = createEngine({ rootDir: ROOT, logLevel: 'error',
            overrides: { useDatabase: false, mapName: 'sample', mapFile: null } });
        const things = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/jetyum/assets/things.json'), 'utf8'));
        const conDibujo = new Set(things.items.filter((t) => t.sprites.some((n) => n > 0)).map((t) => t.id));
        const malos = [];
        let conMasQueOro = 0;
        e.world.monsterTypes.forEach((tipo, nombre) => {
            const loot = tipo.loot || [];
            if (loot.some((l) => Number(l.id) !== 3031)) {
                conMasQueOro += 1;
            }
            loot.forEach((l) => {
                const def = e.world.itemTypes.get(Number(l.id));
                if (!def || !conDibujo.has(Number(l.id))) {
                    malos.push(nombre + ':' + l.id);
                }
            });
        });
        check('todos los monstruos sueltan algo más que oro', conMasQueOro === e.world.monsterTypes.size,
            conMasQueOro + ' de ' + e.world.monsterTypes.size);
        check('cada objeto del botín existe en items.xml y tiene dibujo', malos.length === 0, malos.join(', ') || 'todos');
        const espada = e.world.itemTypes.get(11736);
        check('los objetos del pack tienen su nombre y sus números', espada && espada.name === 'fire sword' &&
            Number(espada.attributes.attack) === 24, espada && espada.name);
    }

    // -----------------------------------------------------------------------
    section('10. Mochilas: se abren como un cuerpo, se llenan arrastrando y tienen huecos');
    {
        const e = createEngine({ rootDir: ROOT, logLevel: 'error',
            overrides: { useDatabase: false, mapName: 'sample', mapFile: null } });
        const w = e.world;
        const pj = w.createPlayer('Mochilero', { x: 40, y: 40, z: 7 });
        w.equipStartingContainer(pj);
        const suelo = { x: 40, y: 41, z: 7 };
        const tirada = w.createItem(2412, 1, { x: 41, y: 40, z: 7 });
        const dentro = () => w.contentsOfItem(tirada).map((i) => i.typeId);

        check('una mochila tiene 20 huecos (containerSize de items.xml)',
            w.capacityOfType(2412) === 20 && w.backpackCapacity(pj) === 20 && w.capacityOfContainer(tirada) === 20);

        w.createItem(2401, 1, suelo);
        let r = w.moveItem(pj, { kind: 'ground', ...suelo }, { kind: 'groundContainer', id: tirada.instanceId });
        check('del suelo a la ventana de la mochila tirada: va dentro', r.ok && dentro().join() === '2401' &&
            !w.map.getTile(40, 41, 7).getItems().some((i) => i.typeId === 2401), r.reason);

        w.createItem(11704, 1, suelo);
        r = w.moveItem(pj, { kind: 'ground', ...suelo }, { kind: 'ground', x: 41, y: 40, z: 7 });
        check('soltarlo encima de la mochila en el mapa también lo mete dentro', r.ok && dentro().join() === '2401,11704', r.reason);

        w.giveItem(pj, 2409, 1);
        const escudo = pj.inventory.findIndex((x) => x.typeId === 2409);
        r = w.moveItem(pj, { kind: 'inventory', index: escudo }, { kind: 'groundContainer', id: tirada.instanceId });
        check('de tu mochila a la mochila tirada', r.ok && dentro().length === 3 &&
            !pj.inventory.some((x) => x.typeId === 2409), r.reason);

        r = w.moveItem(pj, { kind: 'container', id: tirada.instanceId, index: 0 }, { kind: 'slot', slot: 'backpack' });
        check('soltarlo en la ranura de tu mochila lo mete dentro de ella', r.ok &&
            pj.inventory.some((x) => x.typeId === 2401 && x.slot === 'inside') &&
            w.containerOf(pj) && w.containerOf(pj).slot === 'backpack', r.reason);

        w.createItem(2412, 1, suelo);
        r = w.moveItem(pj, { kind: 'ground', ...suelo }, { kind: 'groundContainer', id: tirada.instanceId });
        check('una mochila no va dentro de otra', !r.ok && r.reason === 'containerInContainer', r.reason);

        // Llenar la mochila puesta hasta sus 20 huecos.
        while (w.contentsOf(pj).length < 20) {
            w.giveItem(pj, 12166, 1);
        }
        w.giveItem(pj, 3031, 5);
        while (w.contentsOf(pj).length > 20) {
            const i = pj.inventory.findIndex((x) => x.slot === 'inside' && x.typeId === 12166);
            pj.inventory.splice(i, 1);
        }
        const llena = w.contentsOf(pj).length;
        w.createItem(2406, 1, { x: 39, y: 40, z: 7 });
        r = w.pickUpItem(pj, 39, 40, 7);
        check('con la mochila llena no se recoge nada más', !r.ok && r.reason === 'backpackFull' && r.slots === 20,
            llena + ' dentro, ' + (r.reason || 'cogido'));
        r = w.moveItem(pj, { kind: 'container', id: tirada.instanceId, index: 0 }, { kind: 'container' });
        check('ni se saca nada de un cuerpo o una mochila tirada', !r.ok && r.reason === 'backpackFull', r.reason);
        w.createItem(3031, 3, { x: 39, y: 41, z: 7 });
        r = w.pickUpItem(pj, 39, 41, 7);
        check('pero las monedas se juntan con su pila y caben', r.ok && r.stacked, r.reason);

        while (w.contentsOfItem(tirada).length < 20) {
            w.addToGroundContainer(tirada, 12166, 1);
        }
        const mano = pj.inventory.findIndex((x) => x.slot === 'inside' && x.typeId === 12166);
        r = w.moveItem(pj, { kind: 'inventory', index: mano }, { kind: 'groundContainer', id: tirada.instanceId });
        check('y en una mochila tirada llena tampoco cabe nada', !r.ok && r.reason === 'containerFull', r.reason);
    }

    console.log('');
    if (failures === 0) {
        console.log('\x1b[32mTodo OK\x1b[0m — las vocaciones y los aspectos mandan de verdad.');
        process.exit(0);
    }
    console.log('\x1b[31m' + failures + ' comprobacion(es) fallaron\x1b[0m');
    process.exit(1);
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
