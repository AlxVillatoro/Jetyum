'use strict';

/**
 * VOCACIONES: el `data/XML/vocations.xml` de The Forgotten Server, en JavaScript.
 *
 * El motor las carga al arrancar (`engine/data/definiciones.js`) y son la base REAL del jugador:
 * cada propiedad se usa (lo dice al lado de cada una), y si falta alguna se toma la de la
 * vocación «None». Cambiar un número aquí y reiniciar el servidor cambia el juego.
 *
 *   gainCap        capacidad que gana por nivel (onzas)                     → world.capacityOf
 *   gainHp         vida máxima que gana por nivel                           → vocacion.aplicarNivel
 *   gainMana       maná máximo que gana por nivel                           → vocacion.aplicarNivel
 *   gainHpTicks    cada cuántos segundos regenera vida…                     → vocacion.regenerar
 *   gainHpAmount   …y cuánta
 *   gainManaTicks  cada cuántos segundos regenera maná…
 *   gainManaAmount …y cuánto
 *   manaMultiplier lo que encarece cada nivel mágico (maná gastado)         → vocacion.manaParaNivelMagico
 *   attackSpeed    milisegundos entre dos golpes                            → combat (intervalo)
 *   baseSpeed      velocidad a nivel 1 (luego +2 por nivel, como Tibia)     → vocacion.aplicarNivel
 *   soulMax        almas máximas…                                           → vocacion.regenerar
 *   gainSoulTicks  …y cada cuántos segundos recupera una
 *   needPremium    sólo cuentas premium pueden elegirla al crear personaje
 *   fromVoc        de qué vocación es promoción (Master Sorcerer ← Sorcerer)
 *   formula        multiplicadores de daño y defensa                        → combat
 *   skills         multiplicador de cada skill: cuánto cuesta subirla       → vocacion.triesParaSkill
 *                  (fist, club, sword, axe, distance, shielding, fishing)
 *
 * Las cinco primeras conservan los números que tenía el XML de este proyecto; las promociones
 * (5-8) son las de TFS.
 */

const formula = (cambios) => ({
    meleeDamage: 1.0, distDamage: 1.0, wandDamage: 1.0, magDamage: 1.0, magHealingDamage: 1.0,
    defense: 1.0, magDefense: 1.0, armor: 1.0,
    ...cambios
});

const skills = (fist, club, sword, axe, distance, shielding, fishing) =>
    ({ fist, club, sword, axe, distance, shielding, fishing });

module.exports = [
    {
        id: 0, clientId: 0, name: 'None', description: 'none', needPremium: false, fromVoc: 0,
        gainCap: 5, gainHp: 5, gainMana: 5,
        gainHpTicks: 6, gainHpAmount: 1, gainManaTicks: 6, gainManaAmount: 1,
        manaMultiplier: 4.0, attackSpeed: 2000, baseSpeed: 220, soulMax: 100, gainSoulTicks: 120,
        formula: formula({}),
        skills: skills(1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5)
    },
    {
        id: 1, clientId: 3, name: 'Sorcerer', description: 'a sorcerer', needPremium: false, fromVoc: 1,
        gainCap: 10, gainHp: 5, gainMana: 30,
        gainHpTicks: 12, gainHpAmount: 1, gainManaTicks: 3, gainManaAmount: 2,
        manaMultiplier: 1.1, attackSpeed: 2000, baseSpeed: 220, soulMax: 100, gainSoulTicks: 120,
        formula: formula({ magDamage: 1.1 }),
        skills: skills(2.0, 2.0, 2.0, 2.0, 1.1, 1.1, 1.1)
    },
    {
        id: 2, clientId: 4, name: 'Druid', description: 'a druid', needPremium: false, fromVoc: 2,
        gainCap: 10, gainHp: 5, gainMana: 30,
        gainHpTicks: 12, gainHpAmount: 1, gainManaTicks: 3, gainManaAmount: 2,
        manaMultiplier: 1.1, attackSpeed: 2000, baseSpeed: 220, soulMax: 100, gainSoulTicks: 120,
        formula: formula({ magDamage: 1.1, magHealingDamage: 1.1 }),
        skills: skills(2.0, 2.0, 2.0, 2.0, 1.1, 1.1, 1.1)
    },
    {
        id: 3, clientId: 2, name: 'Paladin', description: 'a paladin', needPremium: false, fromVoc: 3,
        gainCap: 20, gainHp: 10, gainMana: 15,
        gainHpTicks: 8, gainHpAmount: 1, gainManaTicks: 6, gainManaAmount: 1,
        manaMultiplier: 1.4, attackSpeed: 2000, baseSpeed: 220, soulMax: 100, gainSoulTicks: 120,
        formula: formula({ distDamage: 1.1, magDamage: 1.1, magHealingDamage: 1.1 }),
        skills: skills(1.5, 1.5, 1.5, 1.5, 1.4, 1.4, 1.4)
    },
    {
        id: 4, clientId: 1, name: 'Knight', description: 'a knight', needPremium: false, fromVoc: 4,
        gainCap: 25, gainHp: 15, gainMana: 5,
        gainHpTicks: 6, gainHpAmount: 2, gainManaTicks: 12, gainManaAmount: 1,
        manaMultiplier: 3.0, attackSpeed: 2000, baseSpeed: 220, soulMax: 100, gainSoulTicks: 120,
        formula: formula({ meleeDamage: 1.1, defense: 1.1, armor: 1.1 }),
        skills: skills(1.1, 1.1, 1.1, 1.1, 3.0, 3.0, 3.0)
    },
    // --- Promociones: mismas reglas, regeneran más deprisa y llevan el doble de almas. ---
    {
        id: 5, clientId: 13, name: 'Master Sorcerer', description: 'a master sorcerer', needPremium: true, fromVoc: 1,
        gainCap: 10, gainHp: 5, gainMana: 30,
        gainHpTicks: 12, gainHpAmount: 2, gainManaTicks: 2, gainManaAmount: 2,
        manaMultiplier: 1.1, attackSpeed: 2000, baseSpeed: 220, soulMax: 200, gainSoulTicks: 15,
        formula: formula({ magDamage: 1.1 }),
        skills: skills(2.0, 2.0, 2.0, 2.0, 1.1, 1.1, 1.1)
    },
    {
        id: 6, clientId: 14, name: 'Elder Druid', description: 'an elder druid', needPremium: true, fromVoc: 2,
        gainCap: 10, gainHp: 5, gainMana: 30,
        gainHpTicks: 12, gainHpAmount: 2, gainManaTicks: 2, gainManaAmount: 2,
        manaMultiplier: 1.1, attackSpeed: 2000, baseSpeed: 220, soulMax: 200, gainSoulTicks: 15,
        formula: formula({ magDamage: 1.1, magHealingDamage: 1.1 }),
        skills: skills(2.0, 2.0, 2.0, 2.0, 1.1, 1.1, 1.1)
    },
    {
        id: 7, clientId: 12, name: 'Royal Paladin', description: 'a royal paladin', needPremium: true, fromVoc: 3,
        gainCap: 20, gainHp: 10, gainMana: 15,
        gainHpTicks: 6, gainHpAmount: 2, gainManaTicks: 3, gainManaAmount: 2,
        manaMultiplier: 1.4, attackSpeed: 2000, baseSpeed: 220, soulMax: 200, gainSoulTicks: 15,
        formula: formula({ distDamage: 1.1, magDamage: 1.1, magHealingDamage: 1.1 }),
        skills: skills(1.2, 1.2, 1.2, 1.2, 1.1, 1.1, 1.1)
    },
    {
        id: 8, clientId: 11, name: 'Elite Knight', description: 'an elite knight', needPremium: true, fromVoc: 4,
        gainCap: 25, gainHp: 15, gainMana: 5,
        gainHpTicks: 4, gainHpAmount: 2, gainManaTicks: 6, gainManaAmount: 2,
        manaMultiplier: 3.0, attackSpeed: 2000, baseSpeed: 220, soulMax: 200, gainSoulTicks: 15,
        formula: formula({ meleeDamage: 1.1, defense: 1.1, armor: 1.1 }),
        skills: skills(1.1, 1.1, 1.1, 1.1, 1.4, 1.1, 1.1)
    }
];
