/*
 * Сценарии (цели миссии), условия партии и уровни сложности.
 *
 * Сценарий описывает:
 *   setup(g, E)              — расставить ящики/вышку/гнёзда (E — API движка)
 *   goals(g)                 — список целей для интерфейса [{text, done}]
 *   isComplete(g)            — открыта ли эвакуация
 *   actions(g, hero, E)      — дополнительные действия героя
 *   botGoal(g, hero, E)      — куда стремиться боту (ячейка)
 *   progress(g)              — числовой прогресс (для бота и статистики)
 *   roundEnd(g, E)           — эффекты в конце раунда
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  // Общая логика «найти груз в ящиках → доставить»
  function cargoInHands(g, cargoId) {
    let n = 0;
    g.heroes.forEach((h) => h.hand.forEach((u) => { if (g.cards[u] === cargoId) n++; }));
    return n + g.drops.filter((d) => d.card === cargoId).length;
  }
  function fetchBotGoal(g, hero, E, cargoId, deliverCell) {
    const carrying = hero.hand.some((u) => g.cards[u] === cargoId);
    const need = g.obj.need - g.obj.delivered - cargoInHands(g, cargoId);
    const options = g.crates.filter((c) => !c.opened).map((c) => c.pos)
      .concat(g.drops.filter((d) => d.card === cargoId).map((d) => d.pos));
    if (need > 0 && options.length) {
      const near = E.nearest(g, hero.pos, options);
      if (!carrying) return near;
      // по пути заберём ещё, если ящик ближе, чем точка доставки
      const d = E.dist(g, hero.pos);
      if (d[near] < d[deliverCell]) return near;
    }
    return carrying ? deliverCell : null;
  }
  function deliverAction(g, hero, cargoId, cell, label) {
    if (hero.pos !== cell) return [];
    const uid = hero.hand.find((u) => g.cards[u] === cargoId);
    if (!uid) return [];
    return [{ t: 'scenario', key: 'deliver', cost: 0, label }];
  }
  function doDeliver(g, hero, E, cargoId, what) {
    const uid = hero.hand.find((u) => g.cards[u] === cargoId);
    hero.hand.splice(hero.hand.indexOf(uid), 1);
    g.obj.delivered++;
    E.log(g, `${E.heroName(hero)} доставляет: ${what} (${g.obj.delivered}/${g.obj.need}).`, 'good');
    E.fx(g, { t: 'objective', pos: hero.pos, text: `${g.obj.delivered}/${g.obj.need}` });
  }

  ZG.Scenarios.addAll([
    {
      setupText: 'Ящики: 4, с канистрами: 2. Выход — Машина.', id: 'fuel', name: 'Бензин на исходе', short: 'Найди 2 канистры и заправь машину.',
      brief: 'Машина на краю квартала заглохла. В округе спрятаны канистры — но не во всех ящиках бензин.',
      crates: 4, real: 2, cargo: 'cargo_fuel', exitLabel: 'Машина', exitArt: 'exit_car',
      setup(g, E) { g.obj = { delivered: 0, need: 2 }; E.placeCrates(g, this.crates, this.real, this.cargo); },
      goals(g) {
        return [
          { text: `Заправить машину: ${g.obj.delivered}/${g.obj.need} канистры`, done: g.obj.delivered >= g.obj.need },
          { text: 'Все выжившие садятся в машину', done: false },
        ];
      },
      isComplete(g) { return g.obj.delivered >= g.obj.need; },
      actions(g, hero) { return deliverAction(g, hero, this.cargo, g.exit, 'Заправить машину'); },
      doAction(g, hero, key, E) { if (key === 'deliver') doDeliver(g, hero, E, this.cargo, 'канистра'); },
      botGoal(g, hero, E) { return fetchBotGoal(g, hero, E, this.cargo, g.exit); },
      progress(g) { return g.obj.delivered * 2 + cargoInHands(g, this.cargo); },
    },
    {
      setupText: 'Ящики: 5, с медикаментами: 4 (нужно 3). Выход — Скорая.', id: 'meds', name: 'Лекарство', short: 'Собери 3 упаковки медикаментов для скорой.',
      brief: 'В скорой — раненые, которым нужны лекарства. Пять ящиков, в четырёх — медикаменты; нужно три.',
      crates: 5, real: 4, cargo: 'cargo_meds', exitLabel: 'Скорая', exitArt: 'exit_ambulance',
      setup(g, E) { g.obj = { delivered: 0, need: 3 }; E.placeCrates(g, this.crates, this.real, this.cargo); },
      goals(g) {
        return [
          { text: `Погрузить медикаменты: ${g.obj.delivered}/${g.obj.need}`, done: g.obj.delivered >= g.obj.need },
          { text: 'Все выжившие уезжают на скорой', done: false },
        ];
      },
      isComplete(g) { return g.obj.delivered >= g.obj.need; },
      actions(g, hero) { return deliverAction(g, hero, this.cargo, g.exit, 'Погрузить медикаменты'); },
      doAction(g, hero, key, E) { if (key === 'deliver') doDeliver(g, hero, E, this.cargo, 'медикаменты'); },
      botGoal(g, hero, E) { return fetchBotGoal(g, hero, E, this.cargo, g.exit); },
      progress(g) { return g.obj.delivered * 2 + cargoInHands(g, this.cargo); },
    },
    {
      setupText: 'Ящики: 3, с рацией: 1. Вышка — здание среднего столбца (этот тайл открыт сразу). Выход (Вертолёт) — ближайшая к вышке уличная зона.', id: 'radio', name: 'Последний эфир', short: 'Найди рацию, выйди в эфир с вышки, продержись 2 раунда и улетай.',
      brief: 'Спасатели ждут сигнала. Рация в одном из трёх ящиков. Передача с вышки шумит на весь квартал.',
      crates: 3, real: 1, cargo: 'cargo_radio', exitLabel: 'Вертолёт', exitArt: 'exit_heli',
      setup(g, E) {
        g.obj = { delivered: 0, need: 1, transmit: 0, transmitNeed: 2, on: false };
        g.tower = E.placeTower(g);
        E.placeExitNear(g, g.tower);
        // в тумане открыты стартовый тайл и тайл вышки (вертолёт садится на нём)
        if (g.revealed) g.revealed = g.board.tiles.map((t, i) => i === g.board.cells[g.start].tile || i === g.board.cells[g.tower].tile);
        E.placeCrates(g, this.crates, this.real, this.cargo, [g.tower]);
      },
      goals(g) {
        return [
          { text: 'Принести рацию на вышку', done: g.obj.on },
          { text: `Передача: ${g.obj.transmit}/${g.obj.transmitNeed} раунда (герой на вышке)`, done: g.obj.transmit >= g.obj.transmitNeed },
          { text: 'Все выжившие улетают на вертолёте', done: false },
        ];
      },
      isComplete(g) { return g.obj.transmit >= g.obj.transmitNeed; },
      actions(g, hero) {
        if (g.obj.on || hero.pos !== g.tower) return [];
        if (!hero.hand.some((u) => g.cards[u] === this.cargo)) return [];
        return [{ t: 'scenario', key: 'activate', cost: 1, label: 'Выйти в эфир' }];
      },
      doAction(g, hero, key, E) {
        if (key !== 'activate') return;
        const uid = hero.hand.find((u) => g.cards[u] === this.cargo);
        hero.hand.splice(hero.hand.indexOf(uid), 1);
        g.obj.on = true;
        E.raiseAlarm(g, 2, 'Эфир пошёл');
        E.log(g, `${E.heroName(hero)} включает рацию! Держите вышку ${g.obj.transmitNeed} раунда.`, 'good');
        E.fx(g, { t: 'objective', pos: hero.pos, text: 'ЭФИР' });
      },
      roundEnd(g, E) {
        if (!g.obj.on || g.obj.transmit >= g.obj.transmitNeed) return;
        const held = g.heroes.some((h) => h.onBoard && h.pos === g.tower);
        if (held) {
          g.obj.transmit++;
          E.log(g, `Передача идёт: ${g.obj.transmit}/${g.obj.transmitNeed}.`, 'good');
          E.fx(g, { t: 'objective', pos: g.tower, text: `${g.obj.transmit}/${g.obj.transmitNeed}` });
          if (g.obj.transmit >= g.obj.transmitNeed) E.log(g, 'Вертолёт вылетел! Бегите к площадке.', 'good');
        } else E.log(g, 'На вышке никого — передача прервана.', 'bad');
      },
      botGoal(g, hero, E) {
        if (!g.obj.on) {
          if (hero.hand.some((u) => g.cards[u] === this.cargo)) return g.tower;
          if (cargoInHands(g, this.cargo) > 0) return g.tower;
          const opts = g.crates.filter((c) => !c.opened).map((c) => c.pos).concat(g.drops.map((d) => d.pos));
          return E.nearest(g, hero.pos, opts);
        }
        if (g.obj.transmit < g.obj.transmitNeed) return g.tower;
        return null;
      },
      progress(g) { return (g.obj.on ? 2 : cargoInHands(g, this.cargo)) + g.obj.transmit * 1.5; },
    },
    {
      setupText: 'Гнёзда: 2, в соло 1 (центры тайлов правого столбца). Ящиков нет. Выход — Пикап.', id: 'nests', name: 'Выжечь гнёзда', short: 'Уничтожь гнёзда (2, в соло 1) и уходи.',
      brief: 'Зараза разрастается из гнёзд. Пока они живы, квартал не очистить. Гнёзда сами порождают мертвецов.',
      exitLabel: 'Пикап', exitArt: 'exit_car',
      setup(g, E) { const n = g.heroes.length === 1 ? 1 : 2; g.obj = { nests: n }; E.placeNests(g, n); },
      nestsLeft(g) { return g.zombies.filter((z) => z.type === 'nest').length; },
      goals(g) {
        const left = this.nestsLeft(g);
        return [
          { text: `Уничтожить гнёзда: ${g.obj.nests - left}/${g.obj.nests}`, done: left === 0 },
          { text: 'Все выжившие уезжают на пикапе', done: false },
        ];
      },
      isComplete(g) { return this.nestsLeft(g) === 0; },
      actions() { return []; },
      botGoal(g, hero, E) {
        const nests = g.zombies.filter((z) => z.type === 'nest').map((z) => z.pos);
        return nests.length ? E.nearest(g, hero.pos, nests) : null;
      },
      progress(g) { return (g.obj.nests - this.nestsLeft(g)) * 2; },
    },
  ]);

  // ------------------------------------------------------- Условия партии ---
  ZG.Conditions.addAll([
    { id: 'calm', name: 'Тихий вечер', text: 'Без особых условий.', tone: 0, art: 'cond_calm' },
    { id: 'fog', name: 'Смог', text: 'Дальность всех дальних атак −1 (минимум 1). Зомби видят цели только на своём и соседних по стороне тайлах — остальные стоят на месте.', tone: 0, mods: { rangeBonus: -1, fogTiles: 1 }, art: 'cond_fog' },
    { id: 'rain', name: 'Ливень', text: 'Каждое шумное действие поднимает Тревогу на 1 меньше.', tone: 1, mods: { noiseAlarm: -1 }, art: 'cond_rain' },
    { id: 'fullmoon', name: 'Полнолуние', text: 'Ночь и Глухая ночь наступают на 1 раунд раньше.', tone: -1, mods: { phaseShift: 1 }, art: 'cond_moon' },
    {
      id: 'convoy', name: 'Брошенный конвой', text: '+3 жетона Обыска на улицах. Тревога начинается с 2.', tone: 0, art: 'cond_convoy',
      setup(g, E) { E.addStreetSearch(g, 3); g.alarm += 2; },
    },
    {
      id: 'swarm', name: 'Голодный рой', text: 'В начале партии у каждой точки появления стоит Шатун. Каждый герой начинает с 1 картой добычи.', tone: -1, art: 'cond_swarm',
      setup(g, E) { g.spawnPoints.forEach((p) => E.spawnZombie(g, 'walker', p)); g.heroes.forEach((h) => E.giveLoot(g, h)); },
    },
    {
      id: 'stash', name: 'Схрон', text: 'Каждый герой начинает с 1 картой добычи. Тревога начинается с 3.', tone: 1, art: 'cond_stash',
      setup(g, E) { g.heroes.forEach((h) => E.giveLoot(g, h)); g.alarm += 3; },
    },
  ]);

  // ------------------------------------------- Бонусные цели (3-я звезда) ---
  // Одна карта тянется в начале партии. check(g) проверяется при победе.
  ZG.Bonuses.addAll([
    { id: 'quiet', name: 'Тише воды', text: 'Победить, не вызвав ни одной Волны.', check: (g) => g.stats.waves === 0, progress: (g) => `волн: ${g.stats.waves}` },
    { track: 'Счётчик: +1 за каждого убитого зомби.', id: 'hunter', name: 'Охотник', text: 'Убить по 6 зомби на героя (минимум 12).', check: (g) => g.stats.kills >= Math.max(12, 6 * g.heroes.length), progress: (g) => `${g.stats.kills}/${Math.max(12, 6 * g.heroes.length)}` },
    { track: 'Счётчик: +1 за каждый Обыск (вскрытие ящика тоже).', id: 'scavenger', name: 'Мародёр', text: 'Сделать 4 Обыска.', check: (g) => g.stats.searches >= 4, progress: (g) => `${g.stats.searches}/4` },
    { id: 'blitz', name: 'Блиц', text: 'Эвакуироваться до Глухой ночи.', check: (g) => ZG.Engine.phase(g) < 2, progress: (g) => `раунд ${g.round}` },
    { track: 'Счётчик: +1 за каждую сработавшую Связку.', id: 'combo', name: 'Слаженность', text: 'Сыграть 8 Связок.', check: (g) => g.stats.chains >= 8, progress: (g) => `${g.stats.chains}/8` },
    { track: 'Счётчик: +1 за каждую полученную Рану.', id: 'unscathed', name: 'Ни царапины', text: 'Победить, получив за партию не больше 1 Раны на весь отряд.', check: (g) => g.stats.wounds <= 1 && !g.heroes.some((h) => h.fallen), progress: (g) => `ран: ${g.stats.wounds}/1` },
    { track: 'Счётчик: +1 за каждый урон по Толстякам, Громилам и Гнёздам.', id: 'biggame', name: 'Крупная дичь', text: 'Нанести 6 урона Толстякам, Громилам и Гнёздам.', check: (g) => (g.stats.bigDmg || 0) >= 6, progress: (g) => `${g.stats.bigDmg || 0}/6` },
  ]);

  // ---------------------------------------------------------- Сложность ---
  ZG.Difficulties.addAll([
    { id: 'novice', name: 'Новичок', text: '+2 раунда, Ночь и Глухая ночь наступают на 2 раунда позже, порог Волны +2, каждый герой начинает с картой добычи.', mods: { maxRounds: 2, alarmThreshold: 2, phaseShift: -2 }, startLoot: 1 },
    { id: 'survivor', name: 'Выживший', text: 'Стандартные правила.', mods: {} },
    { id: 'nightmare', name: 'Кошмар', text: '−1 раунд, порог Волны −1, Голод уже с Ночи, у каждого героя Рана в колоде; при 3+ героях +1 люк.', mods: { maxRounds: -1, alarmThreshold: -1, spawnPointsBonus: (g) => (g.heroes.length >= 3 ? 1 : 0), zombieSpeed: (g) => (ZG.Engine.phase(g) === 1 ? 1 : 0) }, startWounds: 1 },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
