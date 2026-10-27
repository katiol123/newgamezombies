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

  const E0 = () => ZG.Engine;
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
      setupText: 'Ящики: 4, с канистрами: 2 (при 3–4 героях: 5 ящиков, 3 канистры — нужны все). Выход — Машина.', id: 'fuel', name: 'Бензин на исходе', short: 'Найди 2 канистры и заправь машину.',
      brief: 'Машина на краю квартала заглохла. В округе спрятаны канистры — но не во всех ящиках бензин.',
      crates: 4, real: 2, cargo: 'cargo_fuel', exitLabel: 'Машина', exitArt: 'exit_car',
      setup(g, E) { const big = ZG.Engine.party(g) >= 3 ? 1 : 0; g.obj = { delivered: 0, need: 2 + big }; E.placeCrates(g, this.crates + big, this.real + big, this.cargo); },
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
      setupText: 'Ящики: 7, с медикаментами: 6 (нужно 3, при 3–4 героях — 4). Выход — Скорая.', id: 'meds', name: 'Лекарство', short: 'Собери медикаменты для скорой (3, при 3–4 героях — 4).',
      brief: 'В скорой — раненые, которым нужны лекарства. Семь ящиков, в шести — медикаменты; нужно три (большому отряду — четыре).',
      crates: 7, real: 6, cargo: 'cargo_meds', exitLabel: 'Скорая', exitArt: 'exit_ambulance',
      setup(g, E) { g.obj = { delivered: 0, need: ZG.Engine.party(g) >= 3 ? 4 : 3 }; E.placeCrates(g, this.crates, this.real, this.cargo); },
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
      setupText: 'Ящики: 3, с рацией: 1. Вышка — здание среднего столбца (этот тайл открыт сразу). Выход (Вертолёт) — ближайшая к вышке уличная зона. Передача: 2 раунда, при 3–4 героях — 3.', id: 'radio', name: 'Последний эфир', short: 'Найди рацию, выйди в эфир с вышки, продержись 2 раунда (при 3–4 героях — 3) и улетай.',
      brief: 'Спасатели ждут сигнала. Рация в одном из трёх ящиков. Передача с вышки шумит на весь квартал.',
      crates: 3, real: 1, cargo: 'cargo_radio', exitLabel: 'Вертолёт', exitArt: 'exit_heli',
      setup(g, E) {
        g.obj = { delivered: 0, need: 1, transmit: 0, transmitNeed: ZG.Engine.party(g) >= 3 ? 3 : 2, on: false };
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
      setupText: 'Гнёзда: соло 1, двое 2, трое–четверо 3 (центры тайлов, начиная с правого столбца). Ящиков нет. Выход — Пикап.', id: 'nests', name: 'Выжечь гнёзда', short: 'Уничтожь гнёзда (1–3 по числу героев) и уходи.',
      brief: 'Зараза разрастается из гнёзд. Пока они живы, квартал не очистить. Гнёзда сами порождают мертвецов.',
      exitLabel: 'Пикап', exitArt: 'exit_car',
      setup(g, E) { const n = Math.min(3, ZG.Engine.party(g) === 1 ? 1 : ZG.Engine.party(g) >= 3 ? 3 : 2); g.obj = { nests: n }; E.placeNests(g, n); },
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
    // --- Кампания, миссия 3 «Лес»: найти аккумулятор → подать сигнал с вышки → поворот: вернуться к машине ---
    {
      id: 'forest', campaignOnly: true, name: 'Сигнал из леса',
      short: 'Найди в бору аккумулятор, отнеси на пожарную вышку и подай сигнал.',
      brief: 'Колонна встала за лесом. Вертолёт заберёт тех, кто подаст сигнал. На просеке — пожарная вышка с рацией, но её батарея давно села.',
      setupText: 'Поле 3×2 из лесных тайлов: Кордон лесника (старт; колодец — точка появления; «буханка» во дворе), Сосновый бор ×3, Просека ЛЭП ×2. Пожарная вышка — на просеке в дальнем столбце (этот тайл открыт сразу). Карту сюжетного события «Вышка» положите рядом лицом вниз, не читая: её тянут, когда герой с аккумулятором подаёт сигнал с вышки. В центре каждого бора — ящик; в одном из них аккумулятор. В одном из боров притаился Медведь-шатун. На 4 закрытых тайла — карты «Стая/Пусто» (1 «Стая»).',
      exitLabel: 'Буханка', exitArt: 'exit_van',
      packs: { 1: ['walker', 'walker', 'runner'], 2: ['walker', 'walker', 'runner'], 3: ['walker', 'walker', 'walker', 'runner', 'runner'], 4: ['walker', 'walker', 'walker', 'runner', 'runner', 'runner'] },
      failTitle: 'Сигнал не прошёл',
      failText: 'Аккумулятор встал на место, лампы рации налились мутным светом — и динамик зашипел пустым, мёртвым эфиром. Антенный кабель перегрызен до меди. На столбе — клочья бурой шерсти и глубокие борозды от когтей, будто зверь знал, что здесь будут звать на помощь. К рации приколота записка, нацарапанная углём дрожащей рукой: «Связи нет. Колонна заночует у моста на трассе и уйдёт с рассветом. Догоняйте. В бор не ходите. — Лесник». Ниже, другим почерком, размашисто и криво: «ОН УЖЕ НЕ ЛЕСНИК».',
      newTask: 'Вернуться к «буханке» на кордоне и всем уехать к мосту',
      // картонная версия: запечатанная карта сюжетного события — что будет после сигнала, игроки заранее не знают
      plotCard: {
        name: 'Вышка',
        when: 'Тяните, когда герой с аккумулятором на клетке вышки тратит 1 ⚡ на «Подать сигнал».',
        effect: 'Сигнал не прошёл: сбросьте аккумулятор. Шум 2 от вышки. Треск рации разбудил колодец: в зоне колодца появляются бодрствующие Шатун ×2 + Бегун (3–4 героя: Шатун ×3 + Бегун), они идут к «буханке». Новая задача: вернуться к «буханке» на кордоне и всем уехать.',
      },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng;
        const at = (ti, lx, ly) => b.cells.find((c) => c.tile === ti && c.lx === lx && c.ly === ly);
        const kt = b.cells[g.start].tile;
        const kdef = ZG.Tiles.get('kordon');
        g.spawnPoints = [at(kt, kdef.manhole[0], kdef.manhole[1]).i]; // колодец на кордоне
        g.exit = at(kt, kdef.van[0], kdef.van[1]).i; // «буханка» во дворе
        const bors = b.tiles.map((t, i) => (t.id === 'bor' ? i : -1)).filter((i) => i >= 0);
        const pros = b.tiles.map((t, i) => (t.id === 'proseka' ? i : -1)).filter((i) => i >= 0);
        const far = Math.max.apply(null, pros.map((i) => b.tiles[i].tx));
        const tt = Rng.pick(g, pros.filter((i) => b.tiles[i].tx === far)); // вышка — на дальней просеке
        g.tower = [at(tt, 0, 0), at(tt, 0, 2)].sort((a, b) => a.y - b.y || b.x - a.x)[0].i; // угол повыше — подальше от подписи тайла
        g.towerLabel = 'ВЫШКА';
        // ящики: по одному в центре каждого бора, в одном — аккумулятор
        const real = Rng.int(g, bors.length);
        bors.forEach((ti, k) => g.crates.push({ pos: at(ti, 1, 1).i, card: k === real ? 'cargo_battery' : null, opened: false }));
        // Медведь-шатун притаился в одном из боров
        const bt = Rng.pick(g, bors);
        const bear = E.lurker(g, 'bear', at(bt, 1, 2).i);
        g.obj = { attempted: false, bear: bear && bear.uid };
        // туман: открыты кордон и тайл с вышкой (её видно над лесом)
        if (g.revealed) g.revealed = b.tiles.map((t, i) => i === kt || i === tt);
        // одна стая под картами «Стая/Пусто» на закрытых тайлах
        const cand = b.tiles.map((t, i) => i).filter((i) => i !== kt && i !== tt);
        E.placePacks(g, cand, 1, this.packs[Math.min(4, ZG.Engine.party(g))]);
      },
      hasBattery(g) { return g.heroes.some((h) => h.hand.some((u) => g.cards[u] === 'cargo_battery')) || g.drops.some((d) => d.card === 'cargo_battery'); },
      goals(g) {
        if (!g.obj.attempted) {
          return [
            { text: 'Найти в бору аккумулятор (ящики)', done: this.hasBattery(g) },
            { text: 'Отнести на пожарную вышку и подать сигнал', done: false },
          ];
        }
        return [
          { text: 'Найти в бору аккумулятор', done: true },
          { text: 'Подать сигнал с пожарной вышки', failed: true, note: 'Антенна перегрызена — связи нет' },
          { text: this.newTask, isNew: true, done: false },
        ];
      },
      isComplete(g) { return g.obj.attempted; },
      actions(g, hero) {
        if (g.obj.attempted || hero.pos !== g.tower) return [];
        if (!hero.hand.some((u) => g.cards[u] === 'cargo_battery')) return [];
        return [{ t: 'scenario', key: 'signal', cost: 1, label: 'Подать сигнал' }];
      },
      doAction(g, hero, key, E) {
        if (key !== 'signal') return;
        const uid = hero.hand.find((u) => g.cards[u] === 'cargo_battery');
        hero.hand.splice(hero.hand.indexOf(uid), 1);
        g.obj.attempted = true;
        E.hear(g, g.tower, 2, hero.idx); // треск рации разносится по лесу
        E.log(g, `${E.heroName(hero)} подключает аккумулятор… ${this.failTitle}! Антенна перегрызена, лесник оставил записку: колонна ждёт у моста. Новая задача — вернуться к «буханке» и уехать.`, 'bad');
        E.fx(g, { t: 'twist', title: this.failTitle, text: this.failText, task: this.newTask, pos: hero.pos, art: g.stories && g.stories.twist });
        // треск рации разбудил колодец: у «буханки» из сруба лезет стая — обратный путь будет нелёгким
        const well = g.spawnPoints[0];
        if (well != null) {
          (ZG.Engine.party(g) >= 3 ? ['walker', 'walker', 'walker', 'runner'] : ['walker', 'walker', 'runner']).forEach((type) => { const z = E.spawnZombie(g, type, well, null, true, true, true); if (z) { z.awake = true; z.trail = g.exit; } });
          E.log(g, 'Из колодца на кордоне, скребясь о сруб, лезут мертвецы — прямо у «буханки»!', 'bad');
        }
      },
      botGoal(g, hero, E) {
        if (g.obj.attempted) return null;
        if (hero.hand.some((u) => g.cards[u] === 'cargo_battery')) return g.tower;
        const drops = g.drops.filter((d) => d.card === 'cargo_battery').map((d) => d.pos);
        if (drops.length) return E.nearest(g, hero.pos, drops);
        if (g.heroes.some((h) => h.hand.some((u) => g.cards[u] === 'cargo_battery'))) return g.tower;
        const opts = g.crates.filter((c) => !c.opened).map((c) => c.pos);
        return opts.length ? E.nearest(g, hero.pos, opts) : null;
      },
      progress(g) { return g.obj.attempted ? 9 : (this.hasBattery(g) ? 2 : 0); }, // сигнал весит много: после него всем далеко до «буханки»
    },
    // --- Кампания, миссия 7 «Белый лебедь»: убить Укушенную невесту и уйти; пленник «Волков» — тайная возможность ---
    {
      id: 'wedding', campaignOnly: true, name: 'Белый лебедь',
      short: 'Убей Укушенную невесту — её вопль держит весь пригород — и уходи по северной дороге.',
      brief: 'Ресторан «Белый лебедь» на выезде из пригорода. Здесь играли свадьбу в тот день, когда всё началось. Невеста до сих пор бродит у зала со своими гостями, и её крик тянет мертвецов со всей округи. На дальнем краю, у дороги, жгут костёр «Волки».',
      setupText: 'Поле 4×2: Ресторан «Белый лебедь» (левый столбец) и Стоянка «Волков» (правый столбец) + 6 обычных тайлов. Старт — случайный тайл второго столбца. Свадебная стая (Укушенная невеста, Толстяк, 3 Бегуна) — в зале ресторана, бродит. На стоянке — 5 Головорезов (бродят) и Снайпер на вышке (начеку). У костра стоянки — жетон события «?»: положите рядом лицом вниз карту сюжетного события «Пленник» и не читайте её. Люки: случайный тайл 2-го столбца и случайный тайл 3-го. Выход — у правого края на другом тайле правого столбца. Открыты сразу: старт, ресторан, стоянка, выход.',
      exitLabel: 'Северная дорога', exitArt: 'exit_van',
      deadline: 14, // пленника казнят в конце этого раунда (боты: спасают ~1/3)
      brideWounds: { 1: 4, 2: 0, 3: 0, 4: 1 }, // жетоны урона на невесте в начале (жених успел ударить) — ровняет сложность для 1–4 героев
      plotCard: {
        name: 'Пленник',
        when: 'Тяните, когда герой подходит к жетону «?» у костра на 2 зоны или ближе.',
        effect: 'У костра — связанный человек: пленник «Волков». Пока не кончился 14-й раунд, его можно освободить: герой в его зоне, без бандитов в ней, тратит 1 ⚡. В конце 14-го раунда «Волки» его казнят. Спасённый — Глеб «Дуплет» — после миссии присоединяется к отряду в убежище.',
      },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng;
        const at = (ti, p) => b.cells.find((c) => c.tile === ti && c.lx === p[0] && c.ly === p[1]);
        const col = (tx) => b.tiles.map((t, i) => (t.tx === tx ? i : -1)).filter((i) => i >= 0);
        const maxTx = Math.max.apply(null, b.tiles.map((t) => t.tx));
        const bq = b.tiles.findIndex((t) => t.id === 'banquet'), wc = b.tiles.findIndex((t) => t.id === 'wolfcamp');
        const street = (ti) => b.cells.filter((c) => c.tile === ti && c.type === 'street');
        // старт — случайный тайл второго столбца
        const st = Rng.pick(g, col(1).filter((i) => i !== bq && i !== wc));
        const sc = street(st);
        g.start = (sc.find((c) => c.lx === 1 && c.ly === 1) || Rng.pick(g, sc.length ? sc : b.cells.filter((c) => c.tile === st && c.type !== 'blocked'))).i;
        g.heroes.forEach((h) => { h.pos = g.start; });
        // выход — у правого края на другом тайле правого столбца
        const ex = col(maxTx).filter((i) => i !== wc);
        const exTile = ex.length ? Rng.pick(g, ex) : wc;
        const edge = b.cells.filter((c) => c.tile === exTile && c.x === b.w - 1 && c.type === 'street');
        g.exit = (edge.length ? Rng.pick(g, edge) : Rng.pick(g, street(exTile))).i;
        // люки: случайный тайл 2-го столбца и 3-го
        const hole = (ti) => { const m = b.cells.find((c) => c.tile === ti && c.manhole); const ok = (c) => c && c.i !== g.start && c.i !== g.exit && c.type !== 'blocked'; return ok(m) ? m.i : Rng.pick(g, street(ti).filter(ok)).i; };
        g.spawnPoints = [hole(Rng.pick(g, col(1).filter((i) => i !== bq && i !== wc))), hole(Rng.pick(g, col(2)))];
        g.obj = { brideDead: false, known: false, rescued: false, executed: false, camp: null, bride: null };
        // свадебная стая — бродит в зале ресторана
        if (bq >= 0) {
          const lair = at(bq, ZG.Tiles.get('banquet').lair).i;
          ['bride', 'fatso', 'runner', 'runner', 'runner'].forEach((type) => { const z = E.spawnZombie(g, type, lair, null, true, true, true); if (z) { z.awake = false; z.trail = null; if (type === 'bride') { g.obj.bride = z.uid; z.dmg = this.brideWounds[Math.min(4, ZG.Engine.party(g))] || 0; } } });
        }
        // стоянка «Волков»: 5 головорезов бродят, снайпер на вышке начеку, у костра — пленник (жетон «?»)
        if (wc >= 0) {
          const W = ZG.Tiles.get('wolfcamp');
          g.obj.camp = at(wc, W.camp).i;
          const cells = b.cells.filter((c) => c.tile === wc && c.type !== 'blocked' && c.lx + c.ly > 0);
          for (let k = 0; k < 5; k++) {
            const z = E.spawnZombie(g, 'raider', cells[k % cells.length].i, null, true, true, true);
            if (!z) continue;
            z.awake = false; z.trail = null; z.home = g.obj.camp;
            const i = g.lootDeck.findIndex((id) => id !== 'ambush'); z.bag = i >= 0 ? [g.lootDeck.splice(i, 1)[0]] : [];
          }
          const sn = E.spawnZombie(g, 'sniper', at(wc, W.perch).i, null, true, true, true); if (sn) { sn.awake = true; sn.trail = null; }
        }
        // туман: старт, выход, ресторан (свет в окнах) и стоянка (костёр) видны сразу
        if (g.revealed) g.revealed = b.tiles.map((t, i) => i === st || i === exTile || i === bq || i === wc);
      },
      bride(g) { return g.zombies.find((z) => z.uid === g.obj.bride); },
      // пленника замечают по ходу игры: герой подошёл к костру на 2 зоны
      watch(g, E) {
        if (g.sim || g.obj.known || g.obj.camp == null) return;
        const d = E.distV(g, g.obj.camp);
        if (!g.heroes.some((h) => h.onBoard && d[h.pos] <= 2)) return;
        g.obj.known = true;
        E.log(g, `У костра «Волков» — связанный человек! Его можно освободить до конца ${this.deadline}-го раунда (герой в его зоне, без бандитов в ней: 1 ⚡).`, 'warn');
        E.fx(g, { t: 'objective', pos: g.obj.camp, text: 'Пленник!' });
        E.storyEvent(g, 'prisoner');
      },
      goals(g) {
        const out = [
          { text: 'Убить Укушенную невесту', done: g.obj.brideDead },
          { text: 'Все выжившие уходят по северной дороге', done: false },
        ];
        if (g.obj.known) out.splice(1, 0, g.obj.executed ? { text: 'Освободить пленника', failed: true, note: '«Волки» казнили его' } : { text: `Освободить пленника (до конца ${this.deadline}-го раунда)`, done: g.obj.rescued, isNew: !g.obj.rescued, note: 'необязательно' });
        return out;
      },
      isComplete(g) { return g.obj.brideDead; },
      onKill(g, z, heroIdx, E) { if (z.uid === g.obj.bride) { g.obj.brideDead = true; E.log(g, 'Невеста мертва. Пригород затихает — впервые за много ночей.', 'good'); } },
      actions(g, hero) {
        const o = g.obj;
        if (!o.known || o.rescued || o.executed || hero.pos !== o.camp) return [];
        if (g.zombies.some((z) => z.pos === hero.pos && ZG.Engine.isBandit(z))) return [];
        return [{ t: 'scenario', key: 'free', cost: 1, label: 'Освободить пленника' }];
      },
      doAction(g, hero, key, E) {
        if (key !== 'free') return;
        g.obj.rescued = true;
        E.log(g, `${E.heroName(hero)} режет верёвки. Пленник жив: «Глеб. Стрелять умею. Остальное — потом».`, 'good');
        E.fx(g, { t: 'objective', pos: hero.pos, text: 'Спасён!' });
        E.storyEvent(g, 'rescue');
      },
      roundEnd(g, E) {
        const o = g.obj;
        if (o.rescued || o.executed || g.round < this.deadline) return;
        o.executed = true;
        E.log(g, '«Волки» казнили пленника у костра. Выстрел слышен на весь пригород.', 'bad');
        E.hear(g, o.camp, 3);
        if (o.known) E.storyEvent(g, 'executed');
      },
      botGoal(g, hero, E) {
        const o = g.obj;
        // пленник: если о нём уже знают и успеваем (без бандитов в его зоне — иначе сначала зачистить подход)
        if (o.known && !o.rescued && !o.executed && g.round <= this.deadline) {
          const d = E.distV(g, hero.pos)[o.camp];
          if (d <= (this.deadline - g.round + 1) * 3) return o.camp;
        }
        if (!o.brideDead) { const b = this.bride(g); if (b) return b.pos; }
        return null;
      },
      // невеста мертва: пока есть время — к пленнику (или проверить жетон «?» у костра), иначе к выходу
      botGoalDone(g, hero, E) {
        const o = g.obj;
        if (o.rescued || o.executed || g.round > this.deadline) return null;
        return o.camp;
      },
      progress(g) {
        const b = this.bride(g), d = ZG.Zombies.get('bride');
        return (g.obj.brideDead ? 6 : b ? (b.dmg / d.hp) * 4 : 0) + (g.obj.rescued ? 2 : 0);
      },
      timeoutText: 'Рассвет не наступил: вопль невесты собрал весь пригород.',
    },
    // --- Кампания, миссия 4: канистры на трассе, бандиты — третья сторона ---
    {
      id: 'highway', campaignOnly: true, name: 'Бензин и порох',
      short: 'Найди канистры в ящиках, заправь «буханку» и уезжай. Бандиты тоже ищут бензин и стреляют во всё живое — и мёртвое.',
      brief: '«Буханка» обсохла у трассы. Бензин — в ящиках по округе. Вокруг бродят бандиты: стреляют и в живых, и в мёртвых, а пальба тянет мертвецов из люков.',
      setupText: 'Поле 4×2 (8 обычных тайлов), все тайлы открыты: горит бензовоз, зарево освещает всю трассу. Ящиков: 4 (3–4 героя: 6), канистр: 3 (3–4 героя: 5), нужно: 2 (3–4 героя: 3). Выход — «буханка» у правого края. 2 стаи выставляются сразу в центры двух случайных тайлов (кроме стартового и тайла выхода) и с первого раунда бродят. Бандиты (соло 2, пара и трое 3, четверо 4) бродят по разным тайлам без стай; у каждого в мешке 1 карта добычи. Люков 2: в Сумерки тихо, с Ночи — по 2 Шатуна из каждого.',
      exitLabel: 'Буханка', exitArt: 'exit_van', cargo: 'cargo_fuel',
      packs: { 1: ['walker', 'walker', 'runner'], 2: ['walker', 'walker', 'runner', 'runner'], 3: ['walker', 'walker', 'walker', 'runner', 'runner'], 4: ['walker', 'walker', 'walker', 'runner', 'runner', 'runner'] },
      bandits: { 1: 2, 2: 3, 3: 3, 4: 4 },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng, big = ZG.Engine.party(g) >= 3 ? 1 : 0;
        g.obj = { delivered: 0, need: 2 + big };
        E.placeCrates(g, 4 + big * 2, 3 + big * 2, this.cargo); // большому отряду — ещё запасная канистра (бандиты уносят)
        const st = b.cells[g.start].tile, et = b.cells[g.exit].tile;
        const cand = b.tiles.map((t, i) => i).filter((i) => i !== st && i !== et);
        // тумана нет: горящий бензовоз освещает всю трассу (он лежит на одном из тайлов — декор и источник зарева)
        if (g.revealed) g.revealed = b.tiles.map(() => true);
        const fireCells = b.cells.filter((c) => c.type === 'street' && c.tile !== st && c.tile !== et && !g.crates.some((x) => x.pos === c.i) && !g.search.some((x) => x.pos === c.i) && !g.spawnPoints.includes(c.i));
        if (fireCells.length) g.fire = Rng.pick(g, fireCells).i;
        // 2 стаи — сразу на поле, в центрах двух случайных тайлов, и с первого раунда бродят (хаос с самого начала)
        g.obj.packTiles = Rng.shuffle(g, cand.slice()).slice(0, 2);
        g.obj.packTiles.forEach((ti) => {
          const mid = b.cells.find((c) => c.tile === ti && c.lx === 1 && c.ly === 1);
          const cell = mid && mid.type !== 'blocked' ? mid : b.cells.find((c) => c.tile === ti && c.type !== 'blocked');
          this.packs[Math.min(4, ZG.Engine.party(g))].forEach((type) => { const z = E.spawnZombie(g, type, cell.i, null, true, true, true); if (z) { z.awake = false; z.trail = null; } });
        });
        // бандиты бродят по тайлам без стай; в мешке у каждого — карта добычи
        const n = this.bandits[Math.min(4, ZG.Engine.party(g))];
        Rng.shuffle(g, cand.filter((i) => !g.obj.packTiles.includes(i))).concat(g.obj.packTiles).slice(0, n).forEach((ti) => {
          const cells = b.cells.filter((c) => c.tile === ti && c.type === 'street' && !(c.lx === 1 && c.ly === 1));
          const z = E.spawnZombie(g, 'bandit', Rng.pick(g, cells.length ? cells : b.cells.filter((c) => c.tile === ti && c.type !== 'blocked')).i, null, true, true, true);
          if (!z) return;
          z.awake = false; z.trail = null;
          const i = g.lootDeck.findIndex((id) => id !== 'ambush');
          z.bag = i >= 0 ? [g.lootDeck.splice(i, 1)[0]] : [];
        });
      },
      inBags(g) { return g.zombies.reduce((n, z) => n + (z.bag || []).filter((c) => c === this.cargo).length, 0); },
      goals(g) {
        const bag = this.inBags(g);
        return [
          { text: `Заправить «буханку»: ${g.obj.delivered}/${g.obj.need} канистры`, done: g.obj.delivered >= g.obj.need, note: bag ? `У бандитов в мешках: ${bag} — отберите` : null },
          { text: 'Все выжившие уезжают', done: false },
        ];
      },
      isComplete(g) { return g.obj.delivered >= g.obj.need; },
      actions(g, hero) { return deliverAction(g, hero, this.cargo, g.exit, 'Заправить «буханку»'); },
      doAction(g, hero, key, E) { if (key === 'deliver') doDeliver(g, hero, E, this.cargo, 'канистра'); },
      botGoal(g, hero, E) {
        const goal = fetchBotGoal(g, hero, E, this.cargo, g.exit);
        if (goal != null) return goal;
        // канистры у бандитов: охота на мешок
        const need = g.obj.need - g.obj.delivered - cargoInHands(g, this.cargo);
        const thieves = g.zombies.filter((z) => (z.bag || []).includes(this.cargo)).map((z) => z.pos); // и в тумане: ящик пропал с рубашки — ясно, кто его унёс
        return need > 0 && thieves.length ? E.nearest(g, hero.pos, thieves) : null;
      },
      progress(g) { return g.obj.delivered * 2 + cargoInHands(g, this.cargo); },
    },
    // --- Кампания, миссия 5: мост, банда Лесника; два пути — тихо (ключ) или силой (зачистка) ---
    {
      id: 'bridge', campaignOnly: true, name: 'Пошлина за мост',
      short: 'Пройти на мост: тихо снять ключ от шлагбаума со спящего Лесника или перебить его банду — и всем уйти по мосту.',
      brief: 'Мост держит банда Лесника: два снайпера, часовой у шлагбаума и сам главарь. Шлагбаум откроет ключ с пояса Лесника — или пустая дорога.',
      setupText: 'Поле 4×2: Блокпост у моста (правый столбец; открыт сразу) и Лесопилка (третий столбец) + 6 обычных тайлов. Выход — шлагбаум на Блокпосте. Блокпост: снайпер на вышке, у шлагбаума дремлет часовой — с поста не уходит (пока в зоне шлагбаума враг — уйти нельзя), мешки с песком (герой в этой зоне неуязвим для выстрелов), будка — оружейный тайник банды. Лесопилка: в избе спит Лесник — ключ от шлагбаума у него на поясе. Пока Лесник спит, любой герой в его зоне может действием «Снять ключ» (1 ⚡) забрать ключ; спящий Лесник замечает героев по общим правилам притаившихся (подкрасться можно по правилам «Скрытности»). Убитый Лесник роняет ключ; второй снайпер на штабеле брёвен, пилорама (пульт: 1 ⚡, раз за миссию — 4 урона всем врагам в зоне пилы, Шум 3, Тревога +2). Когда ключ взят, звякают жетоны-«пошлины»: Лесник просыпается и идёт по следу, вся банда поднимается — бродяги становятся охотниками (преследуют отряд). Бандиты-бродяги: соло 3, пара 5, трое 6, четверо 8 — на обычных тайлах, кроме стартового. Раундов: соло 12, пара 11, трое 9, четверо 8. Зомби нет. Задание выполнено, если ключ у отряда ИЛИ банда перебита полностью.',
      exitLabel: 'Мост', exitArt: 'exit_van',
      bandits: { 1: 3, 2: 5, 3: 6, 4: 8 },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng;
        const at = (ti, p) => b.cells.find((c) => c.tile === ti && c.lx === p[0] && c.ly === p[1]);
        const cp = b.tiles.findIndex((t) => t.id === 'checkpoint'), sm = b.tiles.findIndex((t) => t.id === 'sawmill');
        const CP = ZG.Tiles.get('checkpoint'), SM = ZG.Tiles.get('sawmill');
        const st = b.cells[g.start].tile;
        g.obj = { open: false, saw: null, console: null, sawUsed: false };
        if (cp >= 0) {
          g.exit = at(cp, CP.barrier).i;
          g.cover = CP.cover.map((p) => at(cp, p).i);
          // часовой у шлагбаума: пока в зоне шлагбаума есть враг — его не поднять
          const guard = E.lurker(g, 'guard', g.exit);
          if (guard) { guard.post = true; const i = g.lootDeck.findIndex((id) => id !== 'ambush'); guard.bag = i >= 0 ? [g.lootDeck.splice(i, 1)[0]] : []; }
          const s1 = E.spawnZombie(g, 'sniper', at(cp, CP.perch).i, null, true, true, true); if (s1) { s1.awake = true; s1.trail = null; } // снайпер начеку с самого начала
        }
        if (sm >= 0) {
          const f = E.lurker(g, 'forester', at(sm, SM.lair).i);
          if (f) f.bag = ['cargo_key']; // ключ от шлагбаума — у Лесника на поясе (выпадет, если его убить)
          const s2 = E.spawnZombie(g, 'sniper', at(sm, SM.perch).i, null, true, true, true); if (s2) { s2.awake = true; s2.trail = null; }
          g.obj.saw = at(sm, SM.saw).i; g.obj.console = at(sm, SM.console).i;
        }
        // туман: открыты старт и блокпост (мост видно издалека)
        g.hideFogCounts = true; // где бродят бандиты — неизвестно
        if (g.revealed) g.revealed = b.tiles.map((t, i) => i === st || i === cp);
        // бандиты-бродяги: по обычным тайлам (кроме стартового), у каждого в мешке карта добычи
        const tiles = b.tiles.map((t, i) => i).filter((i) => i !== st && i !== cp && i !== sm);
        const n = this.bandits[Math.min(4, ZG.Engine.party(g))];
        const order = Rng.shuffle(g, tiles.slice());
        for (let k = 0; k < n; k++) {
          const ti = order[k % order.length];
          const cells = b.cells.filter((c) => c.tile === ti && c.type === 'street' && !g.zombies.some((z) => z.pos === c.i));
          const z = E.spawnZombie(g, 'bandit', Rng.pick(g, cells.length ? cells : b.cells.filter((c) => c.tile === ti && c.type !== 'blocked')).i, null, true, true, true);
          if (!z) continue;
          z.awake = false; z.trail = null;
          const i = g.lootDeck.findIndex((id) => id !== 'ambush');
          z.bag = i >= 0 ? [g.lootDeck.splice(i, 1)[0]] : [];
        }
      },
      evacBlockedText: 'У шлагбаума враг — сначала уберите его.',
      timeoutText: 'Рассвет не наступил: банда Лесника перекрыла мост.',
      canEvac(g, h, E) { return !E.zombiesAt(g, g.exit).some((z) => E.isBandit(z)); },
      hasKey(g) { return g.heroes.some((h) => h.hand.some((u) => g.cards[u] === 'cargo_key')); },
      left(g) { return g.zombies.filter((z) => ZG.Engine.isBandit(z)).length; },
      goals(g) {
        const left = this.left(g), key = g.obj.open || this.hasKey(g);
        return [
          { text: 'Путь А, тихо: снять ключ с пояса спящего Лесника', done: key, note: left && !key ? 'пока Лесник спит, ключ снимает любой герой в его зоне (1 ⚡)' : null },
          { text: `ИЛИ путь Б, силой: убить Лесника (ключ выпадет) или перебить банду — осталось ${left}`, done: left === 0 },
          { text: 'Всем уйти по мосту через шлагбаум', done: false, note: E0().zombiesAt(g, g.exit).some((z) => E0().isBandit(z)) ? 'У шлагбаума часовой — уберите его' : null },
        ];
      },
      isComplete(g) {
        if (!g.obj.open && this.hasKey(g)) {
          g.obj.open = true; // ключ добыт — шлагбаум открыт до конца миссии
          if (!g.obj.way) g.obj.way = 'force'; // ключ подобран с убитого Лесника
          // «звон пошлин»: жетоны на шнурке звякнули — Лесник просыпается и идёт по следу вора
          const E = ZG.Engine, holder = g.heroes.find((h) => h.hand.some((u) => g.cards[u] === 'cargo_key'));
          const f = g.zombies.find((z) => z.type === 'forester');
          if (f && holder) {
            f.lurk = false; f.relentless = true; // идёт по следу вора до конца миссии
            if (!f.awake) { f.awake = true; E.fx(g, { t: 'zwake', zombie: f.uid, pos: f.pos, sound: true }); E.storyEvent(g, 'bossWake'); }
            f.trail = holder.pos;
          }
          if (holder) {
            // «Подъём!» — Лесник поднимает всю банду: снайперы и бродяги просыпаются и знают, куда смотреть
            g.zombies.forEach((z) => { if (!E.isBandit(z) || z === f) return; z.lurk = false; if (!z.post && !ZG.Zombies.get(z.type).static) { z.hunt = true; z.relentless = true; } if (!z.awake) { z.awake = true; E.fx(g, { t: 'zwake', zombie: z.uid, pos: z.pos, sound: true }); } z.trail = holder.pos; });
            E.log(g, 'Жетоны-«пошлины» звякнули на шнурке… Лесник ревёт «ПОДЪЁМ!» — вся банда на ногах: бродяги бросают мародёрство и идут загоном на вора.', 'bad');
            E.fx(g, { t: 'wakeall', pos: holder.pos, title: 'ПОДЪЁМ!', text: 'Лесник поднял банду: снайперы начеку, бродяги идут загоном' });
          }
        }
        return g.obj.open || this.left(g) === 0;
      },
      forester(g) { return g.zombies.find((z) => z.type === 'forester'); },
      actions(g, hero) {
        const out = [];
        const f = this.forester(g);
        if (f && f.lurk && !f.awake && hero.pos === f.pos && (f.bag || []).includes('cargo_key')) out.push({ t: 'scenario', key: 'pickpocket', cost: 1, label: 'Снять ключ со спящего Лесника' });
        if (!g.obj.sawUsed && g.obj.console != null && hero.pos === g.obj.console) out.push({ t: 'scenario', key: 'saw', cost: 1, label: 'Запустить пилораму' });
        return out;
      },
      doAction(g, hero, key, E) {
        if (key === 'pickpocket') {
          const f = this.forester(g);
          if (!f || !(f.bag || []).includes('cargo_key')) return;
          f.bag.splice(f.bag.indexOf('cargo_key'), 1);
          g.obj.way = 'quiet'; // ключ снят со спящего
          E.giveCard(g, hero, 'cargo_key');
          E.log(g, `${E.heroName(hero)} осторожно снимает ключ с пояса спящего Лесника…`, 'good');
          E.storyEvent(g, 'cargo');
          this.isComplete(g); // звон «пошлин» — Лесник просыпается
          return;
        }
        if (key !== 'saw') return;
        g.obj.sawUsed = true;
        const victims = E.zombiesAt(g, g.obj.saw);
        E.log(g, `${E.heroName(hero)} запускает пилораму!${victims.length ? ' Диск ревёт и рвёт всех, кто у пилы.' : ' Диск ревёт вхолостую.'}`, victims.length ? 'good' : 'warn');
        E.fx(g, { t: 'explode', pos: g.obj.saw });
        victims.forEach((z) => E.damageZombie(g, z, 4, hero.idx, 'trap'));
        E.hear(g, g.obj.saw, 3, hero.idx);
        E.raiseAlarm(g, 2, 'Рёв пилорамы');
        E.storyEvent(g, 'saw');
      },
      botGoal(g, hero, E) {
        if (this.isComplete(g)) return null;
        const drops = g.drops.filter((d) => d.card === 'cargo_key').map((d) => d.pos);
        if (drops.length) return E.nearest(g, hero.pos, drops);
        if (this.isComplete(g)) return null;
        // ключ — у Лесника (или у того, кто его подобрал): снять со спящего или отобрать силой
        const thief = g.zombies.filter((z) => (z.bag || []).includes('cargo_key')).map((z) => z.pos);
        if (thief.length) return E.nearest(g, hero.pos, thief);
        const foes = g.zombies.filter((z) => E.isBandit(z)).map((z) => z.pos);
        return foes.length ? E.nearest(g, hero.pos, foes) : null;
      },
      progress(g) { return (this.isComplete(g) ? 6 : 0) + (12 - Math.min(12, this.left(g))) * 0.25; },
    },
    // --- Кампания, миссия 2 (особые правила): только через цепочку кампании ---
    {
      id: 'autobase', campaignOnly: true, name: 'Автобаза №3',
      short: 'Ликвидируй двух Толстяков в боксе автобазы и уезжай на фургоне.',
      brief: 'В боксе автобазы засели двое разжиревших мертвецов, а во дворе ждёт заправленная «буханка» — последний шанс выбраться из района.',
      setupText: 'Поле 3×2, люков нет. Уникальный тайл «Автобаза №3» — в правом (дальнем) столбце, строка случайна; лежит рубашкой вверх, но его место известно; в боксе — 2 притаившихся Толстяка, во дворе — фургон (выход). На 4 остальных закрытых тайла рубашкой вверх кладутся 4 карты «Стая/Пусто» (2 и 2): при открытии тайла с «Стаей» в его центр выставьте стаю — 3 Шатуна и 2 Бегуна (соло: 2 и 2; при 3 героях: 4 и 3; при 4: 5 и 4). Раундов 10 (соло — 15, четверо — 8). Притаившиеся зомби не бродят, пока их не разбудят (увидят героя или услышат шум). Открыт только стартовый тайл.',
      exitLabel: 'Фургон', exitArt: 'exit_van',
      // состав одной стаи (обе стаи одинаковые) — по размеру отряда
      stacks: { 1: ['walker', 'walker', 'runner', 'runner'], 2: ['walker', 'walker', 'walker', 'runner', 'runner'], 3: ['walker', 'walker', 'walker', 'walker', 'runner', 'runner', 'runner'], 4: ['walker', 'walker', 'walker', 'walker', 'walker', 'runner', 'runner', 'runner', 'runner'] },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng;
        const ut = b.tiles.findIndex((t) => t.id === 'autobase');
        const at = (ti, lx, ly) => b.cells.find((c) => c.tile === ti && c.lx === lx && c.ly === ly);
        const st = b.cells[g.start].tile;
        g.obj = { bosses: [], total: 2 };
        if (ut >= 0) {
          const van = ZG.Tiles.get('autobase').van;
          g.exit = at(ut, van[0], van[1]).i;
          // два притаившихся Толстяка в боксе
          b.cells.filter((c) => c.tile === ut && c.type === 'building').slice(0, 2).forEach((c) => {
            const z = E.lurker(g, 'fatso', c.i);
            if (z) g.obj.bosses.push(z.uid);
          });
        }
        // туман: открыт только стартовый тайл; где автобаза — известно (её рубашка особая)
        if (g.revealed) g.revealed = b.tiles.map((t, i) => i === st);
        // стаи: 4 карты «Стая/Пусто» на остальные закрытые тайлы — где стаи, неизвестно
        const cand = b.tiles.map((t, i) => i).filter((i) => i !== ut && i !== st);
        E.placePacks(g, cand, 2, this.stacks[Math.min(4, ZG.Engine.party(g))]);
      },
      // Особое правило: драка с Толстяками будит всех. Карты «Стая/Пусто» переворачиваются:
      // тайлы со стаями открываются, стаи вылетают уже охотящимися.
      rouse(g, z, E) {
        if (g.obj.roused || !g.obj.bosses.includes(z.uid)) return;
        g.obj.roused = true;
        if (g.stories && g.stories.packReveal) (g.storySeen = g.storySeen || {})[g.stories.packReveal] = true; // своя вставка у драки — стаю не показываем отдельно
        (g.stackTiles || []).forEach((ti) => {
          if (g.revealed && !g.revealed[ti] && g.zombies.some((q) => g.board.cells[q.pos].tile === ti)) E.reveal(g, ti, 'Стая вырвалась из двора');
        });
        g.stackTiles = [];
        E.wakeAll(g, z.pos, 'Драка в боксе');
        E.storyEvent(g, 'rouse');
      },
      onKill(g, z, heroIdx, E) { if (g.obj.bosses.includes(z.uid) && this.bossesLeft(g) === 0) E.storyEvent(g, 'bossesDown'); },
      onZombieHit(g, z, heroIdx, E) { this.rouse(g, z, E); },
      onZombieAttack(g, z, h, E) { this.rouse(g, z, E); },
      bossesLeft(g) { return g.zombies.filter((z) => g.obj.bosses.includes(z.uid)).length; },
      goals(g) {
        const left = this.bossesLeft(g);
        return [
          { text: `Ликвидировать Толстяков в боксе: ${g.obj.total - left}/${g.obj.total}`, done: left === 0 },
          { text: 'Все выжившие уезжают на фургоне', done: false },
        ];
      },
      isComplete(g) { return this.bossesLeft(g) === 0; },
      actions() { return []; },
      botGoal(g, hero, E) {
        const bosses = g.zombies.filter((z) => g.obj.bosses.includes(z.uid)).map((z) => z.pos);
        return bosses.length ? E.nearest(g, hero.pos, bosses) : null;
      },
      progress(g) { return (g.obj.total - this.bossesLeft(g)) * 3; },
    },
  ]);

  // ------------------------------------------------------- Условия партии ---
  ZG.Conditions.addAll([
    { id: 'calm', name: 'Тихий вечер', text: 'Без особых условий.', tone: 0, art: 'cond_calm' },
    { id: 'fog', name: 'Смог', text: 'Дальность всех дальних атак −1 (минимум 1). Зомби видят цели только на своём и соседних по стороне тайлах — остальные стоят на месте.', tone: 0, mods: { rangeBonus: -1, fogTiles: 1 }, art: 'cond_fog' },
    { id: 'rain', name: 'Ливень', text: 'Каждое шумное действие поднимает Тревогу на 1 меньше.', tone: 1, mods: { noiseAlarm: -1 }, art: 'cond_rain' },
    { id: 'fullmoon', name: 'Полнолуние', text: 'Глухая ночь наступает на 1 раунд раньше.', tone: -1, mods: { deepShift: 1 }, art: 'cond_moon' },
    {
      id: 'convoy', name: 'Брошенный конвой', text: '+3 жетона Обыска на улицах. Тревога начинается с 2.', tone: 0, art: 'cond_convoy',
      setup(g, E) { E.addStreetSearch(g, 3); g.alarm += 2; },
    },
    {
      id: 'swarm', name: 'Голодный рой', text: 'В начале партии у каждой точки появления стоит Шатун. Каждый герой начинает с 1 картой добычи.', tone: -1, art: 'cond_swarm',
      setup(g, E) { g.spawnPoints.forEach((p) => E.spawnZombie(g, 'walker', p)); g.heroes.forEach((h) => E.giveLoot(g, h)); },
    },
    {
      id: 'stash', name: 'Схрон', text: 'Каждый герой начинает с 1 картой добычи.', tone: 1, art: 'cond_stash',
      setup(g, E) { g.heroes.forEach((h) => E.giveLoot(g, h)); },
    },
  ]);

  // ------------------------------------------- Бонусные цели (3-я звезда) ---
  // Одна карта тянется в начале партии. check(g) проверяется при победе.
  ZG.Bonuses.addAll([
    { id: 'quiet', name: 'Тише воды', text: 'Победить, не вызвав ни одной Волны.', check: (g) => g.stats.waves === 0, progress: (g) => `волн: ${g.stats.waves}` },
    { track: 'Счётчик: +1 за каждого убитого зомби.', id: 'hunter', name: 'Охотник', text: 'Убить по 6 зомби на героя (минимум 12).', check: (g) => g.stats.kills >= Math.max(12, 6 * ZG.Engine.party(g)), progress: (g) => `${g.stats.kills}/${Math.max(12, 6 * ZG.Engine.party(g))}` },
    { track: 'Счётчик: +1 за каждый Обыск (вскрытие ящика тоже).', id: 'scavenger', name: 'Мародёр', text: 'Сделать 4 Обыска.', check: (g) => g.stats.searches >= 4, progress: (g) => `${g.stats.searches}/4` },
    { id: 'blitz', name: 'Блиц', text: 'Эвакуироваться до Глухой ночи.', check: (g) => ZG.Engine.phase(g) < 2, progress: (g) => `раунд ${g.round}` },
    { track: 'Счётчик: +1 за каждую сработавшую Связку.', id: 'combo', name: 'Слаженность', text: 'Сыграть 8 Связок.', check: (g) => g.stats.chains >= 8, progress: (g) => `${g.stats.chains}/8` },
    { track: 'Счётчик: +1 за каждую полученную Рану.', id: 'unscathed', name: 'Ни царапины', text: 'Победить, получив за партию не больше 1 Раны на весь отряд.', check: (g) => g.stats.wounds <= 1 && !g.heroes.some((h) => h.fallen), progress: (g) => `ран: ${g.stats.wounds}/1` },
    { track: 'Счётчик: +1 за каждый урон по Толстякам, Громилам и Гнёздам.', id: 'biggame', name: 'Крупная дичь', text: 'Нанести 6 урона Толстякам, Громилам и Гнёздам.', check: (g) => (g.stats.bigDmg || 0) >= 6, progress: (g) => `${g.stats.bigDmg || 0}/6` },
  ]);

  // ---------------------------------------------------------- Сложность ---
  ZG.Difficulties.addAll([
    { id: 'novice', name: 'Новичок', text: '+2 раунда, Ночь и Глухая ночь наступают на 2 раунда позже, порог Волны +2, на 1 люк меньше, Заражение только на 1 кубика, каждый герой начинает с картой добычи.', mods: { maxRounds: 2, alarmThreshold: 2, phaseShift: -2, infectDie: -1, spawnPointsBonus: -1 }, startLoot: 1 },
    { id: 'survivor', name: 'Выживший', text: 'Стандартные правила.', mods: {} },
    { id: 'nightmare', name: 'Кошмар', text: '−1 раунд, порог Волны −1 (не ниже 3), Голод уже с Ночи, у каждого героя Рана в колоде; при 3+ героях +1 люк.', mods: { maxRounds: -1, alarmThreshold: -1, spawnPointsBonus: (g) => (ZG.Engine.party(g) >= 3 ? 1 : 0), zombieSpeed: (g) => (ZG.Engine.phase(g) === 1 ? 1 : 0) }, startWounds: 1 },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
