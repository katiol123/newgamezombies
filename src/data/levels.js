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
      spear: 4, crowbar: 4, medkit: 4, energy: 4, chocolate: 4, brick: 4, bandage_roll: 4, whistle: 4, canned: 4, garrote: 4, grenade: 4,
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
    fogBreak: 8, // столько жетонов в стопке закрытого тайла (зомби + пустышки) — и он открывается сам
    decoys: true, // пустышки: в тумане за каждого зомби 2 жетона, каждый 50/50 зомби или пустышка
    drawMax: 3, // добор в начале хода — до размера руки, но не больше 3 карт
    hordeAlarm: 8, // в шаге «Особые свойства»: Тревога +1 за каждые 8 зомби на поле
    pool: { walker: 16, runner: 6, fatso: 4, screamer: 3, brute: 2, plague: 3, grabber: 3, hound: 1 }, // жетонов в коробке
  });

  // Кампания, миссия 1: облегчённая Окраина — поле 3×2 тайла, только Шатуны и Бегуны, у люка появляется 1 зомби
  const base = ZG.Levels.get('outskirts');
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m1', campaignOnly: true,
    text: 'Первая вылазка: несколько кварталов, слабые мертвецы.',
    layout: { tw: 3, th: 2 },
    zombieTypes: ['walker', 'runner'],
    spawnPerCard: 1,
    rounds: base.rounds + 2, // +2 раунда: учебная миссия должна проходиться почти всегда
    events: base.events.filter((id) => id !== 'ev_hound'),
  }));

  // Кампания, миссия 3 «Лес»: 6 особых тайлов (кордон, бор ×3, просека ×2), один люк — колодец на кордоне,
  // особая колода появления (с Ночи по одному: Шатун/Бегун по очереди)
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m3', campaignOnly: true, num: 3, name: 'Лес',
    text: 'Лес за городом: кордон лесника, сосновый бор, просека ЛЭП.',
    layout: { tw: 3, th: 2 },
    scenarios: ['forest'],
    conditions: ['calm'],
    spawnPoints: { 1: 1, 2: 1, 3: 1, 4: 1 },
    spawnDeck: { sp_forest: 1 },
    zombieTypes: ['walker', 'runner'],
    events: [],
    decoys: false,
    fogBreak: 0,
    rounds: 12,
    roundsBonus: { 1: 3 }, // соло — 15 раундов
  }));

  // Кампания, миссия 4 «Трасса»: 8 обычных тайлов, 2 люка (с Ночи по 2 Шатуна), 2 притаившиеся стаи, бродячие бандиты
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m4', campaignOnly: true, num: 4, name: 'Трасса',
    text: 'Заправка у трассы: бандиты, стаи и люки, из которых ночью лезут мертвецы.',
    scenarios: ['highway'],
    conditions: ['calm'],
    spawnPoints: { 1: 2, 2: 2, 3: 2, 4: 2 },
    spawnDeck: { sp_chaos: 1 },
    loot: Object.assign({}, base.loot, { rig: 1, bandit_tt: 1 }), // сюрприз: 2 редких снаряжения, только здесь
    zombieTypes: ['walker', 'runner'],
    events: [],
    decoys: false,
    fogBreak: 0,
    rounds: 13,
    roundsBonus: { 1: -1 }, // соло — 12
  }));

  // Кампания, миссия 5 «Мост»: только банда Лесника (бандиты, 2 снайпера, Лесник), зомби нет
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m5', campaignOnly: true, num: 5, name: 'Мост',
    text: 'Блокпост у моста и лесопилка: банда Лесника.',
    scenarios: ['bridge'],
    conditions: ['calm'],
    spawnPoints: { 1: 0, 2: 0, 3: 0, 4: 0 },
    loot: Object.assign({}, base.loot, { ambush: 0 }), // засад нет: зомби в этой миссии не появляются
    events: [],
    decoys: false,
    fogBreak: 0,
    rounds: 10,
    roundsBonus: { 1: 1, 3: -2, 4: -3 }, // соло 11, пара 10, трое 8, четверо 7: большой отряд быстрее, но банда больше
  }));

  // Кампания, миссия 2 «Автобаза №3»: поле 3×2, люков нет (никто не появляется), стаи и Толстяки расставлены заданием
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m2', campaignOnly: true, num: 2, name: 'Автобаза',
    text: 'Автобаза на краю района: притаившиеся мертвецы и фургон во дворе.',
    layout: { tw: 3, th: 2 },
    scenarios: ['autobase'],
    conditions: ['calm'],
    spawnPoints: { 1: 0, 2: 0, 3: 0, 4: 0 },
    events: [], // без событий: только то, что расставлено заранее
    decoys: false,
    fogBreak: 0, // стопок в тумане нет — прорыв не нужен
    rounds: 10,
    roundsBonus: { 1: 5, 4: -2 }, // соло: +5 раундов (одному долго добивать двух Толстяков, а драка будит всех); четвёрка: −2 (быстро прочёсывает район)
  }));
})(typeof globalThis !== 'undefined' ? globalThis : window);
