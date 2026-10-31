/**
 * Prueba del importador de monstruos (tools/importar-monstruos.mjs): el lector de tablas de Lua, la
 * conversión de una ficha de TFS a la nuestra y los monstruos ya importados en
 * `data/monsters/importados` (que cargan, que se dibujan y que su botín existe). Si está el servidor
 * de origen al lado (../forserver-downgrade), además, que volver a importar da lo mismo.
 *
 *     node tools/test-importar-monstruos.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
    trocear, leerExpresion, leerFicha, convertirFicha, convertirAtaque, moduloDe, importar,
    ASPECTOS_FIELES, nombreDeConstante
} from './importar-monstruos.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createEngine } = require('../engine/core/engine.js');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) {
        failures += 1;
    }
    console.log('  ' + (condition ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  ' + label +
        (detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''));
}
const section = (t) => console.log('\n' + t);
const leer = (src) => leerExpresion(trocear(src), 0).valor;

console.log('Prueba del importador de monstruos (' + ROOT + ')');

// ---------------------------------------------------------------------------
section('1. Leer Lua');
{
    check('números, negativos y cuentas', leer('-8') === -8 && leer('2 * 100') === 200 && leer('0.5') === 0.5 && leer('-(2+3)') === -5);
    check('cadenas con escapes, comillas simples y largas', leer('"a \\"b\\"\\n"') === 'a "b"\n' && leer("'x'") === 'x' &&
        leer('[[uno\ndos]]') === 'uno\ndos');
    check('booleanos y nil', leer('true') === true && leer('false') === false && leer('nil') === null);
    check('las constantes se guardan por su nombre', nombreDeConstante(leer('COMBAT_FIREDAMAGE')) === 'COMBAT_FIREDAMAGE' &&
        nombreDeConstante(leer('CONST_ME.X')) === 'CONST_ME.X');
    const t = leer('{ interval = 5000, chance = 10, { text = "Meep!", yell = false }, }');
    check('una tabla con claves y posiciones: objeto con $lista', t.interval === 5000 && t.$lista.length === 1 && t.$lista[0].text === 'Meep!');
    const a = leer('{ { name = "melee", minDamage = 0, maxDamage = -8 }, -- un comentario\n --[[ y otro\n largo ]] { name = "x" } }');
    check('una lista de tablas, con comentarios en medio', Array.isArray(a) && a.length === 2 && a[0].maxDamage === -8 && a[1].name === 'x');
    check('claves entre corchetes', leer('{ ["a b"] = 1, [COMBAT_X] = 2 }')['a b'] === 1);
    let fallo = null;
    try {
        leer('math.random(1, 2)');
    } catch (e) {
        fallo = e.message;
    }
    check('una llamada no se inventa: falla', /llamada/.test(String(fallo)), fallo);
}

// ---------------------------------------------------------------------------
section('2. Una ficha de TFS');
const FICHA = `local mType = Game.createMonsterType("Bandido de Prueba")
local monster = {}

monster.description = "a test bandit"
monster.experience = 65
monster.outfit = {
	lookType = 129,
	lookHead = 58, lookBody = 59, lookLegs = 45, lookFeet = 95, lookAddons = 0,
}
monster.health = 245
monster.maxHealth = 245
monster.race = "blood"
monster.corpse = 777
monster.speed = 180 -- rápido
monster.voices = {
	interval = 5000,
	chance = 10,
	{ text = "Your money or your life!", yell = false },
}
monster.loot = {
	{ name = "gold coin", chance = 50000, maxCount = 30 },
	{ id = 3607, chance = 1000 }, -- cheese
	{ name = "something we do not have", chance = 100 },
}
monster.attacks = {
	{ name = "melee", interval = 2000, chance = 100, minDamage = 0, maxDamage = -65, condition = { type = CONDITION_POISON, totalDamage = 40, interval = 4000 } },
	{ name = "combat", interval = 2000, chance = 15, type = COMBAT_FIREDAMAGE, minDamage = -10, maxDamage = -40, range = 7, shootEffect = CONST_ANI_FIRE, effect = CONST_ME_HITBYFIRE, target = true },
	{ name = "fire wave", interval = 2000, chance = 10, minDamage = -10, maxDamage = -20 },
}
monster.defenses = {
	defense = 15,
	armor = 10,
	{ name = "combat", interval = 2000, chance = 10, type = COMBAT_HEALING, minDamage = 10, maxDamage = 30 },
}
monster.elements = {
	{ type = COMBAT_PHYSICALDAMAGE, percent = 0 },
	{ type = COMBAT_EARTHDAMAGE, percent = 20 },
}
monster.immunities = {
	{ type = "paralyze", condition = true },
	{ type = "invisible", condition = false },
}
mType.onThink = function(monster, interval) end
mType:register(monster)
`;
{
    const { ficha, problemas } = leerFicha(FICHA);
    check('lee las asignaciones `monster.x = ...` y el nombre de createMonsterType',
        ficha.name === 'Bandido de Prueba' && ficha.experience === 65 && ficha.outfit.lookType === 129 && ficha.speed === 180,
        JSON.stringify(problemas));
    const ctx = {
        carpeta: 'humans', archivo: 'bandido.lua',
        idANombre: (id) => ({ 777: 'dead human', 3607: 'cheese' })[id] || null,
        nombreAId: (n) => ({ 'gold coin': 3031, 'dead human': 12246, cheese: 2416 })[String(n).toLowerCase()] || 0
    };
    const informe = { sinAtaque: {}, sinBotin: {} };
    const m = convertirFicha(ficha, ctx, informe);
    check('el aspecto, la vida y el cuerpo (por nombre)', m.outfit.lookType === 129 && m.outfit.lookBody === 59 &&
        m.maxHealth === 245 && m.corpse === 12246);
    check('el cuerpo a cuerpo con su veneno (40 de daño: 10 golpes de 4)', m.attacks[0].name === 'melee' &&
        JSON.stringify(m.attacks[0].condition) === JSON.stringify({ type: 'veneno', ticks: 10, interval: 4000, value: 4 }));
    check('un `combat` de fuego es un ataque de fuego, con su proyectil y a su objetivo',
        m.attacks[1].name === 'fire' && m.attacks[1].shootEffect === 'fire' && m.attacks[1].target === true && m.attacks[1].maxDamage === -40);
    check('lo que el motor no sabe hacer («fire wave») se queda fuera y se cuenta', m.attacks.length === 2 && informe.sinAtaque['fire wave'] === 1);
    check('la curación va a las defensas', m.defenses.defense === 15 && m.defenses.list.length === 1 && m.defenses.list[0].name === 'healing');
    check('resistencias (sin las de 0) e inmunidades a condiciones', JSON.stringify(m.elements) === JSON.stringify([{ type: 'earth', percent: 20 }]) &&
        JSON.stringify(m.immunities) === JSON.stringify([{ type: 'paralyze' }]));
    check('las frases', m.voices.lines.length === 1 && m.voices.lines[0].text === 'Your money or your life!');
    check('el botín por nombre (y por id con el items.xml de origen); lo que no tenemos, fuera',
        m.loot.length === 2 && m.loot[0].id === 3031 && m.loot[0].maxCount === 30 && m.loot[1].id === 2416 &&
        informe.sinBotin['something we do not have'] === 1);
    check('una parálisis sin cambio de velocidad no es un ataque', convertirAtaque({ name: 'speed', chance: 10 }) === null);
    check('el cuerpo a cuerpo con `skill` y `attack` lleva el daño de TFS (10 y 9: hasta 9; 80 y 68: hasta 306)',
        convertirAtaque({ name: 'melee', skill: 10, attack: 9 }).maxDamage === -9 &&
        convertirAtaque({ name: 'melee', skill: 80, attack: 68 }).maxDamage === -306);
    const sinMelee = convertirFicha(leerFicha('monster.name = "Mago"\nmonster.experience = 100\nmonster.attacks = { { name = "combat", type = COMBAT_ENERGYDAMAGE, minDamage = -1, maxDamage = -2 } }').ficha, ctx);
    check('un monstruo sin cuerpo a cuerpo recibe uno flojo', sinMelee.attacks[0].name === 'melee' && sinMelee.attacks[1].name === 'energy');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'monstruo-'));
    try {
        const archivo = path.join(tmp, 'bandido.js');
        fs.writeFileSync(archivo, moduloDe(m, 'prueba/bandido.lua'));
        const cargado = require(archivo);
        check('el módulo que escribe es JavaScript que carga, y dice de dónde viene',
            cargado.name === 'Bandido de Prueba' && cargado.loot.length === 2 && cargado.attacks.length === 2 &&
            fs.readFileSync(archivo, 'utf8').includes('IMPORTADO de prueba/bandido.lua') && !('_nombre' in cargado.loot[0]));
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------
section('3. Los monstruos importados');
{
    const dir = path.join(ROOT, 'data', 'monsters', 'importados');
    const archivos = [];
    const recorrer = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory()
        ? recorrer(path.join(d, e.name)) : archivos.push(path.join(d, e.name))));
    recorrer(dir);
    const things = JSON.parse(fs.readFileSync(path.join(ROOT, 'client', 'jetyum', 'assets', 'things.json'), 'utf8'));
    const aspectos = new Set(things.outfits.map((o) => o.id));
    const mods = archivos.filter((f) => f.endsWith('.js')).map((f) => require(f));
    check('hay monstruos importados (' + mods.length + ')', mods.length >= 30);
    check('todos se dibujan con un aspecto fiel que el cliente tiene',
        mods.every((m) => ASPECTOS_FIELES.has(m.outfit.lookType) && aspectos.has(m.outfit.lookType)),
        mods.filter((m) => !aspectos.has(m.outfit.lookType)).map((m) => m.name).join(', '));
    const e = createEngine({ rootDir: ROOT, logLevel: 'error', overrides: { useDatabase: false, mapName: 'jetyum', mapFile: null } });
    const tipos = e.world.monsterTypes;
    check('el motor los carga todos', mods.every((m) => tipos.has(m.name)));
    const items = e.world.itemTypes;
    check('su botín y su cuerpo existen en items.xml', mods.every((m) => m.loot.every((l) => items.has(l.id)) && (!m.corpse || items.has(m.corpse))));
    check('ninguno pisa a uno de los nuestros (los nombres no se repiten)', new Set(mods.map((m) => m.name)).size === mods.length);
    check('cada uno dice de qué carpeta viene', mods.every((m) => m.origen && m.origen.carpeta && m.origen.archivo));

    // Que peleen: cada uno, contra un jugador que no muere, un rato de juego simulado.
    {
        const w = e.world;
        let reloj = 90000000;
        w.now = () => reloj;
        e.scheduler.now = () => reloj;
        const avanzar = (ms) => {
            for (let t = 0; t < ms; t += 50) {
                reloj += 50;
                w.tick();
                e.scheduler.tick(1000);
            }
        };
        const templo = w.map.getWaypoint('temple');
        let sitio = null;
        for (let r = 8; r < 60 && !sitio; r += 1) {
            for (let dx = -r; dx <= r && !sitio; dx += 1) {
                const c = { x: templo.x + dx, y: templo.y + r, z: templo.z };
                let libre = true;
                for (let a = -2; a <= 2 && libre; a += 1) {
                    for (let b = -2; b <= 2 && libre; b += 1) {
                        const t = w.map.getTile(c.x + a, c.y + b, c.z);
                        libre = w.map.isWalkable(c.x + a, c.y + b, c.z) && !(t && t.isProtectionZone());
                    }
                }
                sitio = libre ? c : null;
            }
        }
        const yo = w.createPlayer('Saco de Golpes', sitio);
        const errores = [];
        let pegaron = 0;
        mods.forEach((m) => {
            yo.maxHealth = yo.health = 10000000;
            let monstruo = null;
            try {
                monstruo = w.createMonster(m.name, { x: sitio.x + 2, y: sitio.y, z: sitio.z });
                avanzar(8000);
            } catch (err) {
                errores.push(m.name + ': ' + err.message);
            }
            if (yo.health < 10000000) {
                pegaron += 1;
            }
            if (monstruo && !monstruo.removed) {
                w.removeMonster(monstruo.id);
            }
        });
        check('los ' + mods.length + ' pelean contra un jugador sin romper nada', errores.length === 0, errores.slice(0, 3).join(' | '));
        check('y casi todos le hacen daño (' + pegaron + ')', pegaron >= mods.length * 0.8);
    }

    const origen = path.resolve(ROOT, '..', 'forserver-downgrade', 'data', 'monsters');
    if (fs.existsSync(origen)) {
        const { informe, modulos } = importar({ escribir: false });
        const iguales = modulos.every(({ ruta, m, rel }) => fs.existsSync(ruta) &&
            fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n') === moduloDe(m, 'forserver-downgrade/data/monsters/' + rel));
        check('volver a importar de forserver-downgrade da lo mismo (' + informe.leidos + ' leídos, ' + modulos.length + ' importados, ' +
            informe.fallos.length + ' fallos de lectura)', iguales && modulos.length === mods.length && informe.fallos.length === 0,
            'si falla: node tools/importar-monstruos.mjs');
    } else {
        console.log('  (no está ../forserver-downgrade: no se comprueba la reimportación)');
    }
}

console.log('\n' + (failures === 0 ? '\x1b[32mTodo bien.\x1b[0m' : '\x1b[31m' + failures + ' fallo(s).\x1b[0m'));
process.exit(failures === 0 ? 0 : 1);
