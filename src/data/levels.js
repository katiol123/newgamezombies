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
    layout: { tw: 4, th: 2 }, // 4×2 тайла = поле 12×6 зон
    tiles: ['crossroad', 'shop', 'house', 'gas', 'pharmacy', 'park', 'garages', 'police', 'construction', 'school', 'market'],
    // колода добычи по редкости: обычная ×4, редкая ×2, уникальная ×1 (+ Засады)
    loot: {
      spear: 4, crowbar: 4, medkit: 4, energy: 4, chocolate: 4, brick: 4, bandage_roll: 4, whistle: 4, canned: 4,
      bat: 2, machete: 2, pistol: 2, molotov: 2, firecracker: 2, sneakers: 2, backpack: 2, vest: 2, flashlight: 2, smoke: 2, nailgun: 2, rope: 2,
      shotgun: 1, katana: 1, army_medkit: 1,
      ambush: 6,
    },
    spawnDeck: ZG.SPAWN_DECK_L1,
    scenarios: ['fuel', 'meds', 'radio', 'nests'],
    conditions: ['calm', 'fog', 'rain', 'fullmoon', 'convoy', 'swarm', 'stash'],
    bonuses: ['quiet', 'hunter', 'scavenger', 'blitz', 'combo', 'unscathed', 'biggame'],
    rounds: 14,
    phaseStarts: [1, 4, 7], // Сумерки с 1-го, Ночь с 4-го, Глухая ночь с 7-го раунда
    hunger: { 2: 1 }, // Глухая ночь: зомби +1 к скорости
    alarmThreshold: { 1: 4, 2: 5, 3: 6, 4: 4 }, // порог Волны по размеру отряда: большой отряд шумит больше
    roundsBonus: { 3: 2, 4: 2 }, // у большого отряда цели больше — и раунд в запасе
    startAlarm: { 3: 1, 4: 1 }, // большой отряд шумит: стартовая Тревога (ниже порога Волны)
    spawnPoints: { 1: 2, 2: 3, 3: 4, 4: 4 },
    events: ['ev_radio', 'ev_airdrop', 'ev_blackout', 'ev_silence', 'ev_gas', 'ev_survivor', 'ev_rush', 'ev_frenzy', 'ev_storm', 'ev_howl', 'ev_hound'],
    eventChance: 1 / 6, // в начале раунда (со 2-го) кубик: на 6 — событие, иначе затишье
    // укус: d6 ≤ die — Заражение (hand: сразу в руку; иначе в верхние top карт колоды), иначе Рана;
    // Заражение — тоже Рана (hurts); обращение, когда Заражение «досидело» в руке до конца хода turnAt раз
    infection: { die: 2, turnAt: 1, hand: true, hurts: true },
    maxAttackers: 3, // Теснота: героя за фазу кусают не больше 3 зомби (самые опасные)
    stealth: true, // скрытность: зомби бродят, пока не заметят героев (Тревога на максимуме выдаёт всех)
    doors: true, // двери на входах в помещения: закрыты в начале, укрытие от дальних зомби
    fog: true, // «Туман войны»: тайлы, кроме стартового и тайла выхода, закрыты до разведки
    fogBreak: 4, // столько зомби в закрытом тайле — и он открывается сам
    drawMax: 3, // добор в начале хода — до размера руки, но не больше 3 карт
    hordeAlarm: 8, // в шаге «Особые свойства»: Тревога +1 за каждые 8 зомби на поле
    pool: { walker: 16, runner: 6, fatso: 4, screamer: 3, brute: 2, plague: 3, grabber: 3, hound: 1 }, // жетонов в коробке
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
