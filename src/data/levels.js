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
      medkit: 3, energy: 3, chocolate: 2, sneakers: 1, backpack: 1, vest: 1, flashlight: 1, ambush: 3,
    },
    spawnDeck: ZG.SPAWN_DECK_L1,
    scenarios: ['fuel', 'meds', 'radio', 'nests'],
    conditions: ['calm', 'fog', 'rain', 'fullmoon', 'convoy', 'swarm', 'stash'],
    bonuses: ['quiet', 'hunter', 'scavenger', 'blitz', 'combo', 'unscathed', 'biggame'],
    rounds: 12,
    phaseStarts: [1, 3, 6], // Сумерки с 1-го, Ночь с 3-го, Глухая ночь с 6-го раунда
    hunger: { 2: 1 }, // Глухая ночь: зомби +1 к скорости
    alarmThreshold: { 1: 6, 2: 6, 3: 4, 4: 3 }, // порог Волны по размеру отряда: большой отряд шумит больше
    startAlarm: { 3: 3, 4: 5 }, // большой отряд шумит: стартовая Тревога
    spawnPoints: { 1: 2, 2: 3, 3: 4, 4: 4 },
    events: ['ev_radio', 'ev_airdrop', 'ev_blackout', 'ev_silence', 'ev_gas', 'ev_survivor', 'ev_rush', 'ev_frenzy', 'ev_storm', 'ev_howl'],
    eventChance: 1 / 6, // в начале раунда (со 2-го) кубик: на 6 — событие, иначе затишье
    // укус: d6 ≤ die — Заражение (hand: сразу в руку; иначе в верхние top карт колоды), иначе Рана;
    // Заражение — тоже Рана (hurts); обращение, когда Заражение «досидело» в руке до конца хода turnAt раз
    infection: { die: 2, turnAt: 1, hand: true, hurts: true },
    maxAttackers: 3, // Теснота: героя за фазу кусают не больше 3 зомби (самые опасные)
    fog: true, // «Туман войны»: тайлы, кроме стартового и тайла выхода, закрыты до разведки
    fogBreak: 4, // столько зомби в закрытом тайле — и он открывается сам
    drawMax: 3, // добор в начале хода — до размера руки, но не больше 3 карт
    hordeAlarm: 8, // в шаге «Особые свойства»: Тревога +1 за каждые 8 зомби на поле
    pool: { walker: 16, runner: 6, fatso: 4, screamer: 3, brute: 2 }, // жетонов в коробке
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
