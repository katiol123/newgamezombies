/*
 * Уровни. Уровень = набор тайлов + колоды + сценарии + параметры давления.
 * Новый уровень (новая локация) добавляется одним объектом.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  ZG.Levels.add({
    id: 'outskirts',
    num: 1,
    name: 'Окраина',
    subtitle: 'Уровень 1',
    text: 'Спальный район на краю города. Первая ночь после падения.',
    layout: { tw: 3, th: 2 }, // 3×2 тайла = поле 9×6 зон
    tiles: ['crossroad', 'shop', 'house', 'gas', 'pharmacy', 'park', 'garages', 'police', 'construction'],
    loot: {
      bat: 3, machete: 2, spear: 2, crowbar: 2, pistol: 2, shotgun: 1, molotov: 2, firecracker: 2,
      medkit: 2, energy: 3, chocolate: 2, sneakers: 1, backpack: 1, vest: 1, flashlight: 1, ambush: 3,
    },
    spawnDeck: ZG.SPAWN_DECK_L1,
    scenarios: ['fuel', 'meds', 'radio', 'nests'],
    conditions: ['calm', 'fog', 'rain', 'fullmoon', 'convoy', 'swarm', 'stash'],
    bonuses: ['quiet', 'hunter', 'scavenger', 'blitz', 'combo', 'unscathed', 'biggame'],
    rounds: 12,
    phaseStarts: [1, 4, 8], // Сумерки с 1-го, Ночь с 4-го, Глухая ночь с 8-го раунда
    hunger: { 2: 1 }, // Глухая ночь: зомби +1 к скорости
    alarmThreshold: 6,
    startAlarm: { 3: 3, 4: 4 }, // большой отряд шумит: стартовая Тревога
    spawnPoints: { 1: 2, 2: 3, 3: 4, 4: 4 },
    fog: true, // «Туман войны»: тайлы, кроме стартового и тайла выхода, закрыты до разведки
    fogBreak: 4, // столько зомби в закрытом тайле — и он открывается сам
    drawMax: 3, // добор в начале хода — до размера руки, но не больше 3 карт
    hordeAlarm: 8, // в шаге «Особые свойства»: Тревога +1 за каждые 8 зомби на поле
    pool: { walker: 30, runner: 10, fatso: 6, screamer: 4, brute: 2 }, // жетонов в коробке
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
