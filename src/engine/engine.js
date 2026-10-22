/*
 * Движок правил «Мёртвого квартала».
 *
 * Состояние игры — простой JSON-объект (кроме общего неизменного поля board),
 * поэтому его легко сохранить, клонировать для ИИ и прогонять в симуляторе.
 *
 * Поток управления:
 *   g = Engine.create(opts)
 *   Engine.legal(g)        — список допустимых действий (для ИИ и подсветки)
 *   Engine.act(g, action)  — применить действие; движок сам проходит
 *                            автоматические шаги (фаза зомби) до следующего решения.
 *   g.pending              — решение, которого ждёт движок (блок, выбор таланта)
 *   g.fx / g.log           — события для анимаций и журнал
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const Rng = ZG.Rng, Mods = ZG.Mods, Board = ZG.Board;
  // пороги опыта для уровней 2 и 3 (общие для всех героев; интерфейс рисует трек по ним)
  const XP_LEVELS = [4, 10];
  const REPEAT_MISSION_XP = 2; // кампания: повторно выпавшая миссия, награда за которую уже получена
  const MAX_BARRICADES = 4;
  const MAX_TRAPS = 3;
  const MAX_EQUIP = 2;

  const E = {};
  E.XP_LEVELS = XP_LEVELS;
  ZG.Engine = E;

  // ================================================================ утилиты
  E.log = function (g, text, kind) {
    if (g.quiet) return;
    g.log.push({ text, kind: kind || 'info', round: g.round });
  };
  E.fx = function (g, ev) { if (!g.quiet) g.fx.push(ev); };
  E.heroName = (h) => ZG.Heroes.get(h.id).name;
  E.cardDef = (g, uid) => ZG.Cards.get(g.cards[uid]);
  E.zombiesAt = (g, cell) => g.zombies.filter((z) => z.pos === cell);
  E.heroesAt = (g, cell) => g.heroes.filter((h) => h.onBoard && h.pos === cell);
  E.zombie = (g, uid) => g.zombies.find((z) => z.uid === uid);
  E.newUid = (g, prefix) => prefix + (g.nextUid++);
  E.woundCount = (g, h) => h.deck.concat(h.hand, h.discard).filter((u) => g.cards[u] === 'wound').length;
  E.infectCount = (g, h) => h.deck.concat(h.hand, h.discard).filter((u) => g.cards[u] === 'infection').length;
  // Раны для падения, «На грани» и выбора цели: Заражение тоже Рана (если hurts)
  E.hurtCount = (g, h) => E.woundCount(g, h) + ((ZG.Levels.get(g.levelId).infection || {}).hurts ? E.infectCount(g, h) : 0);
  E.infectTurnAt = (g) => ((ZG.Levels.get(g.levelId).infection || {}).turnAt || 3);
  // травмы (кампания): непролеченные раны прошлых миссий снижают Стойкость
  E.maxHp = (g, h) => Math.max(1, Mods.value(g, h, 'hp', ZG.Heroes.get(h.id).hp) - (h.injury || 0));
  // «Одиночка»: в соло герой держит на 1 карту больше
  E.handSize = (g, h) => Mods.value(g, h, 'handSize', ZG.Heroes.get(h.id).hand) + (g.heroes.length === 1 ? 1 : 0);
  // из чего складывается размер руки (для подсказки в интерфейсе)
  E.handSizeParts = function (g, h) {
    const parts = [{ name: 'База героя', n: ZG.Heroes.get(h.id).hand }];
    Mods.sources(g, h).forEach((src) => {
      const m = src.mods && src.mods.handSize;
      const n = m == null ? 0 : typeof m === 'function' ? m(g, h) : m;
      if (n) parts.push({ name: src.name, n });
    });
    if (g.heroes.length === 1) parts.push({ name: 'Одиночка (соло)', n: 1 });
    return parts;
  };
  E.activeHero = (g) => (g.active == null ? null : g.heroes[g.active]);
  E.maxRounds = (g) => { const l = ZG.Levels.get(g.levelId); return Mods.value(g, null, 'maxRounds', l.rounds + ((l.roundsBonus || {})[Math.min(4, g.heroes.length)] || 0)); };
  E.alarmThreshold = (g) => {
    // порог Волны: число или таблица по размеру отряда { 1: 6, 4: 5 }
    const t = ZG.Levels.get(g.levelId).alarmThreshold;
    const base = typeof t === 'number' ? t : t[Math.min(4, g.heroes.length)];
    return Math.max(3, Mods.value(g, null, 'alarmThreshold', base));
  };
  E.phase = function (g, round) {
    const lvl = ZG.Levels.get(g.levelId);
    const r = (round || g.round) + Mods.value(g, null, 'phaseShift', 0);
    const deep = Mods.value(g, null, 'deepShift', 0); // сдвиг только Глухой ночи
    let p = 0;
    lvl.phaseStarts.forEach((s, i) => { if (r + (i === 2 ? deep : 0) >= s) p = i; });
    return p;
  };
  E.scenario = (g) => ZG.Scenarios.get(g.scenarioId);
  E.isComplete = (g) => E.scenario(g).isComplete(g);
  E.barricadeAt = (g, a, b) => g.barricades.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  // ---- Двери и укрытия: вход в помещение (проход между помещением и улицей/другим помещением) ----
  const doorKey = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
  E.isEntrance = (g, a, b) => {
    const ca = g.board.cells[a], cb = g.board.cells[b];
    return !!(ca.bld || cb.bld) && ca.bld !== cb.bld;
  };
  E.doorClosed = (g, a, b) => !!g.doors && E.isEntrance(g, a, b) && !g.doors[doorKey(a, b)];
  // все входы помещения (bld) — пары [внутри, снаружи]
  E.entrances = (g, bld) => {
    const out = [];
    g.board.cells.forEach((c) => { if (c.bld === bld) g.board.adj[c.i].forEach((n) => { if (g.board.cells[n].bld !== bld) out.push([c.i, n]); }); });
    return out;
  };
  // герой в укрытии: в помещении, все двери закрыты, внутри не шумели
  E.sheltered = (g, h) => {
    if (!g.doors || !h.onBoard || Mods.flag(g, h, 'loud')) return false;
    const bld = g.board.cells[h.pos].bld;
    if (!bld) return false;
    if (g.board.cells.some((c) => c.bld === bld && (g.noise[c.i] || (g.loud && g.loud[c.i])))) return false;
    return E.entrances(g, bld).every(([a, b]) => !g.doors[doorKey(a, b)]);
  };
  function openDoor(g, a, b, hero) {
    if (!E.doorClosed(g, a, b)) return;
    g.doors[doorKey(a, b)] = true;
    E.fx(g, { t: 'door', a, b, open: true });
    if (hero && !Mods.flag(g, hero, 'silentDoors')) {
      // скрип: жетон шума на внешнюю сторону двери, Тревога не растёт
      const outside = g.board.cells[a].bld && g.board.cells[b].bld !== g.board.cells[a].bld && g.board.cells[b].type === 'street' ? b : g.board.cells[a].type === 'street' ? a : b;
      g.noise[outside] = (g.noise[outside] || 0) + 1;
      E.fx(g, { t: 'noise', pos: outside, n: 1 });
      E.hear(g, outside, Mods.flag(g, hero, 'loud') ? 2 : 1, hero.idx);
      E.log(g, `${E.heroName(hero)} открывает дверь — скрип!`, 'dim');
    }
  }
  E.openDoor = openDoor;

  // ---- Скрытность: зомби «бродят», пока не заметят героя; «охотятся» — идут к герою или к его последнему следу ----
  const SIGHT = 4; // дальность обзора по прямой
  E.alerted = (g) => !!g.stealth && g.alertUntil >= g.round;
  // видит ли зомби героя: своя зона, соседняя (по проходу) или прямая линия через открытые проходы
  E.sees = function (g, z, h) {
    if (!h.onBoard || h.hidden || E.hidden(g, z.pos)) return false;
    const zd = ZG.Zombies.get(z.type);
    // «Чутьё охотника» (Лесник) работает только у проснувшегося; спящий замечает героев по общим правилам притаившихся
    const tracker = zd.tracker && !z.lurk;
    if (E.alerted(g) || zd.relentless || z.relentless) return true; // Волна / Безжалостный (или идущий по следу): знают, где все
    if (z.pos === h.pos) return true;
    // «Чутьё охотника» (Лесник): замечает и затаившихся, и бесшумных, и идущих «Тихим шагом»
    if (h.lurk && !tracker) return false; // «Затаиться»: видят только в своей зоне
    // бродячие не замечают бесшумного героя (Тень) и того, кто идёт «Тихим шагом»
    const quiet = !z.awake && g.turn && g.active === h.idx && g.turn.quiet && !tracker;
    if (quiet) return false;
    if (g.board.adj[z.pos].includes(h.pos)) return true;
    if ((!z.awake || zd.watch) && Mods.flag(g, h, 'stealthy') && !tracker) return false; // бесшумного издалека не замечают (снайпер на посту — тоже)
    if (Mods.flag(g, h, 'loud') && E.distV(g, z.pos)[h.pos] <= 2) return true; // шумного слышно за 2 зоны
    if (E.sheltered(g, h)) return false;
    return lineSight(g, z.pos, h.pos, zd.sight);
  };
  // прямая видимость: до SIGHT зон по прямой через открытые проходы (двери закрыты — не видно)
  function lineSight(g, from, to, range) {
    const b = g.board, c0 = b.cells[from], R = range || SIGHT;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let prev = from, x = c0.x, y = c0.y;
      for (let d = 1; d <= R; d++) {
        x += dx; y += dy;
        if (x < 0 || y < 0 || x >= b.w || y >= b.h) break;
        const ni = y * b.w + x;
        if (!Board.isAdj(b, prev, ni) || E.hidden(g, ni) || E.doorClosed(g, prev, ni)) break;
        if (ni === to) return true;
        prev = ni;
      }
    }
    return false;
  }
  // ---- Бандиты: третья сторона. Для бандита враги — и герои, и зомби (одинаково); для зомби — и герои, и бандиты ----
  // Сюжетные вставки кампании: атмосферный текст (и иллюстрация) в ключевой момент миссии, раз за партию.
  // Миссия задаёт g.stories: { событие: id вставки } (id — ключ ZG.STORIES).
  E.story = function (g, id) {
    if (!g.campaign || !id || !ZG.STORIES || !ZG.STORIES[id]) return;
    g.storySeen = g.storySeen || {};
    if (g.storySeen[id]) return;
    g.storySeen[id] = true;
    E.fx(g, { t: 'story', id });
  };
  E.storyEvent = (g, key) => E.story(g, g.stories && g.stories[key]);
  // задание может запретить эвакуацию (например, пока у шлагбаума стоит часовой)
  // передать в бою можно только найденное: находки, грузы задания и карты кампании (подарки, трофеи); базовые карты героя — нет
  E.canGive = (g, uid) => { const d = ZG.Cards.get(g.cards[uid]); return !!(d && (d.loot || d.kind === 'cargo' || d.campaignOnly)); };
  E.canEvac = (g, h) => { const sc = E.scenario(g); return !sc.canEvac || sc.canEvac(g, h, E); };
  E.isBandit = (z) => !!z && ZG.Zombies.get(z.type).faction === 'bandit';
  // видит ли существо другое существо (зомби ↔ бандит): своя зона, соседняя или прямая линия
  E.seesFoe = function (g, z, o) {
    if (E.hidden(g, z.pos) || E.hidden(g, o.pos)) return false;
    if (z.pos === o.pos || g.board.adj[z.pos].includes(o.pos)) return true;
    return lineSight(g, z.pos, o.pos, ZG.Zombies.get(z.type).sight);
  };
  // существа-враги (не герои): для бандита — подвижные зомби, для зомби — бандиты
  E.foesOf = (g, z) => g.zombies.filter((o) => o !== z && E.isBandit(o) !== E.isBandit(z) && !ZG.Zombies.get(o.type).immobile);
  // кого видит существо: герои + существа-враги (позиции)
  E.seenFoes = (g, z) => g.heroes.filter((h) => E.sees(g, z, h)).map((h) => ({ pos: h.pos, hero: h }))
    .concat(E.foesOf(g, z).filter((o) => E.seesFoe(g, z, o)).map((o) => ({ pos: o.pos, foe: o })));
  // цель бандита: враг в своей зоне (все равноценны — случайный), иначе ближайший на линии выстрела (до 2 зон)
  const BANDIT_RANGE = 2;
  E.banditTarget = function (g, z, pick) {
    if (E.hidden(g, z.pos) || (g.stealth && !z.awake)) return null;
    const range = ZG.Zombies.get(z.type).range != null ? ZG.Zombies.get(z.type).range : BANDIT_RANGE;
    const at = (cell) => E.heroesAt(g, cell).filter((h) => !h.hidden).map((h) => ({ hero: h, pos: cell }))
      .concat(E.foesOf(g, z).filter((o) => o.pos === cell).map((o) => ({ foe: o, pos: cell })));
    const here = at(z.pos);
    if (here.length) return pick && here.length > 1 ? Rng.pick(g, here) : here[0];
    if (!range) return null; // только ближний бой
    const line = E.line(g, z.pos, range).filter((c) => c.dist >= 1).sort((a, b) => a.dist - b.dist);
    for (const c of line) {
      // укрытие (мешки с песком): по героям в этой зоне не стреляют; выстрел — только по прямой видимости (закрытая дверь защищает всегда)
      const list = at(c.cell).filter((t) => (t.hero ? E.sees(g, z, t.hero) && !(g.cover || []).includes(c.cell) && lineSight(g, z.pos, c.cell, range) && !E.sheltered(g, t.hero) : lineSight(g, z.pos, c.cell, range)));
      if (list.length) return Object.assign(pick && list.length > 1 ? Rng.pick(g, list) : list[0], { shot: true });
    }
    return null;
  };
  // Притаившиеся стаи под картами «Стая/Пусто»: на каждый тайл-кандидат кладётся карта рубашкой вверх,
  // n из них — «Стая». Стая притаилась в центре тайла; счётчики жетонов над туманом скрыты (чтобы не выдать место).
  E.placePacks = function (g, tiles, n, pack) {
    const b = g.board;
    g.stackTiles = (g.stackTiles || []).concat(tiles);
    g.hideFogCounts = true;
    const chosen = Rng.shuffle(g, tiles.slice()).slice(0, n);
    chosen.forEach((ti) => {
      const mid = b.cells.find((c) => c.tile === ti && c.lx === 1 && c.ly === 1);
      const cell = mid && mid.type !== 'blocked' ? mid : Rng.pick(g, b.cells.filter((c) => c.tile === ti && c.type !== 'blocked'));
      pack.forEach((type) => E.lurker(g, type, cell.i));
    });
    return chosen;
  };
  // притаившийся зомби (стоит на месте, пока не разбудят)
  E.lurker = function (g, type, cell) {
    const z = E.spawnZombie(g, type, cell, null, true, true, true);
    if (z) { z.awake = false; z.lurk = true; z.trail = null; }
    return z;
  };
  // будит всех зомби на поле и снимает «притаился»; все идут на место события
  E.wakeAll = function (g, cell, why) {
    g.zombies.forEach((z) => { if (ZG.Zombies.get(z.type).immobile) return; z.lurk = false; wake(g, z, cell, true); });
    E.log(g, `${why}: все зомби в квартале проснулись и идут сюда!`, 'bad');
    E.fx(g, { t: 'wakeall', pos: cell, why });
  };
  function wake(g, z, trail, sound, by) {
    if (!z.awake) { z.awake = true; E.fx(g, { t: 'zwake', zombie: z.uid, pos: z.pos, sound: !!sound }); if (ZG.Zombies.get(z.type).boss) E.storyEvent(g, 'bossWake'); }
    if (z.lurk && !z.post) { if (ZG.Zombies.get(z.type).tracker) z.relentless = true; z.lurk = false; } // проснувшийся больше не таится (Лесник ещё и не теряет след); часовой остаётся на посту
    if (by != null) z.wokenBy = by; // кто натравил (для миссии «Предатель»)
    if (trail != null) z.trail = trail;
  }
  // зомби замечают героев (после каждого действия героя и в фазу зомби)
  // skip — индекс героя, которого пока не проверяем (бесшумный в свой ход: его заметят в конце хода)
  E.perceive = function (g, skip) {
    const sc = E.scenario(g);
    if (sc.watch) sc.watch(g, E); // задания со своими «ловушками» (например, карты «Стая/Пусто» на открытом поле)
    if (!g.stealth) return;
    g.zombies.forEach((z) => {
      if (ZG.Zombies.get(z.type).immobile) return;
      const seen = E.seenFoes(g, z).filter((t) => !t.hero || t.hero.idx !== skip);
      if (!seen.length) return;
      if (seen.length > 1) { const d = E.distV(g, z.pos); seen.sort((a, b) => d[a.pos] - d[b.pos]); }
      wake(g, z, seen[0].pos);
    });
  };
  // шум слышен на radius зон: бродячие просыпаются, и все, кто не видит героя, идут проверить
  E.hear = function (g, cell, radius, by) {
    if (!g.stealth || radius <= 0 || cell == null) return;
    const d = E.distV(g, cell);
    g.zombies.forEach((z) => {
      if (ZG.Zombies.get(z.type).immobile || E.hidden(g, z.pos) || d[z.pos] > radius) return;
      if (z.awake && E.seenFoes(g, z).length) return; // видит врага — не отвлекается
      wake(g, z, cell, true, by);
    });
  };
  // конец фазы зомби: кто не видит героя и дошёл до последнего следа — теряет след и снова бродит
  function loseTrack(g) {
    if (!g.stealth) return;
    g.zombies.forEach((z) => {
      if (!z.awake || z.relentless || ZG.Zombies.get(z.type).relentless || ZG.Zombies.get(z.type).immobile || ZG.Zombies.get(z.type).watch) return; // снайпер всегда на посту; идущий по следу не теряет его
      const seen = E.seenFoes(g, z);
      if (seen.length) { z.trail = seen[0].pos; return; }
      if (z.trail != null && z.trail !== z.pos && E.distV(g, z.pos)[z.trail] !== Infinity) return; // идёт по последнему следу (если до него можно дойти)
      z.awake = false; z.trail = null; z.wokenBy = null;
      E.fx(g, { t: 'zsleep', zombie: z.uid, pos: z.pos });
    });
  }
  // куда бредёт бродячий зомби (кубик раз за фазу): 1–2 к ближайшему люку, 3–4 к центру поля, 5–6 стоит
  function wanderGoal(g, z) {
    const r = (g.zs && g.zs.wander) || 6;
    if (r >= 5) return null;
    const d = E.distV(g, z.pos);
    let goal = null;
    const loot = E.isBandit(z) && r <= 4 ? E.lootSpots(g).filter((p) => !E.hidden(g, p) && d[p] < Infinity) : [];
    if (loot.length) {
      // бандит-мародёр: вместо люка — к ближайшему ящику или жетону Обыска (дойдёт — обчистит)
      loot.forEach((p) => { if (goal == null || d[p] < d[goal]) goal = p; });
    } else if (E.isBandit(z)) {
      return null; // лута не видно — стоит
    } else if (r <= 2) {
      g.spawnPoints.forEach((p) => { if (!E.hidden(g, p) && (goal == null || d[p] < d[goal])) goal = p; });
    } else {
      const b = g.board, cx = (b.w - 1) / 2, cy = (b.h - 1) / 2;
      // ближайшая к центру проходимая зона
      let best = null, bk = Infinity;
      b.cells.forEach((c) => { if (c.type === 'blocked' || E.hidden(g, c.i) || d[c.i] === Infinity) return; const k = Math.abs(c.x - cx) + Math.abs(c.y - cy); if (k < bk) { bk = k; best = c.i; } });
      goal = best;
    }
    return goal === z.pos ? null : goal;
  }
  // Мародёрство: бандит на закрытом ящике или жетоне Обыска забирает добычу в мешок (выпадет, когда его убьют)
  E.banditLoot = function (g, z) {
    const zd = ZG.Zombies.get(z.type);
    if (z.lurk || z.hunt || z.post || zd.static || zd.hunter) return; // часовой, загонщик, снайпер и главарь лут не трогают — мародёрствуют бродяги
    if (E.hidden(g, z.pos)) {
      // в тумане: на «1–4» кубика бродяг бандит обчищает ближайший ящик/тайник своего тайла (фишка остаётся на рубашке)
      if (!g.zs || g.zs.wander > 4) return;
      const ti = g.board.cells[z.pos].tile;
      const spots = E.lootSpots(g).filter((p) => g.board.cells[p].tile === ti);
      if (!spots.length) return;
      z.pos = spots[0];
    }
    const cr = g.crates.find((c) => c.pos === z.pos && !c.opened);
    const st = g.search.find((x) => x.pos === z.pos);
    if (!cr && !st) return;
    z.bag = z.bag || [];
    if (cr) {
      cr.opened = true;
      if (cr.card) z.bag.push(cr.card);
      g.stats.banditLoot = (g.stats.banditLoot || 0) + 1; if (cr.card) g.stats.banditCargo = (g.stats.banditCargo || 0) + 1;
      E.log(g, cr.card ? `Бандит вскрывает ящик и забирает «${ZG.Cards.get(cr.card).name}»! Убейте его, чтобы вернуть.` : 'Бандит вскрывает ящик — пусто.', cr.card ? 'bad' : 'dim');
    } else {
      g.search.splice(g.search.indexOf(st), 1);
      const i = g.lootDeck.findIndex((id) => id !== 'ambush');
      if (i >= 0) z.bag.push(g.lootDeck.splice(i, 1)[0]);
      E.log(g, 'Бандит обчищает тайник: находка уходит к нему в мешок.', 'warn');
    }
    E.fx(g, { t: 'loot_bandit', zombie: z.uid, pos: z.pos });
  };
  // смерть бандита: мешок высыпается в зоне; загрызли зомби — встаёт Шатуном
  E.banditDeath = function (g, z, kind) {
    (z.bag || []).forEach((card) => g.drops.push({ pos: z.pos, card }));
    if ((z.bag || []).length) E.log(g, `Из мешка бандита высыпается добыча (${z.bag.length}) — подберите её.`, 'good');
    if (kind === 'bite') {
      g.stats.banditBitten = (g.stats.banditBitten || 0) + 1;
      E.storyEvent(g, 'banditBitten');
      E.log(g, 'Загрызенный бандит дёргается… и поднимается Шатуном.', 'bad');
      const w = E.spawnZombie(g, 'walker', z.pos, null, true, true, true);
      if (w) { w.awake = true; w.trail = z.pos; }
    }
  };
  // что может обчистить бандит: закрытые ящики и жетоны Обыска
  E.lootSpots = (g) => g.crates.filter((c) => !c.opened).map((c) => c.pos).concat(g.search.map((x) => x.pos));
  E.dist = (g, from, passable) => Board.bfs(g.board, from, passable);
  // ---- Туман войны: закрытые тайлы ----
  E.hidden = (g, cell) => !!g.revealed && !g.revealed[g.board.cells[cell].tile];
  // расстояние только по открытым тайлам (то, что видят герои и зомби)
  E.distV = (g, from, passable) => Board.bfs(g.board, from, (a, b) => !E.hidden(g, b) && (!passable || passable(a, b)));
  E.line = (g, from, R) => Board.lineCells(g.board, from, R, (c) => E.hidden(g, c));
  E.reveal = function (g, ti, why) {
    if (!g.revealed || g.revealed[ti]) return;
    g.revealed[ti] = true;
    const def = ZG.Tiles.get(g.board.tiles[ti].id);
    const n = g.zombies.filter((z) => g.board.cells[z.pos].tile === ti).length;
    resolveDecoys(g, ti);
    const nb = g.zombies.filter((z) => g.board.cells[z.pos].tile === ti && E.isBandit(z)).length, nz = n - nb;
    E.log(g, `${why || 'Разведка'}: открыт тайл «${def.name}»${nz ? ` — там ${nz} ${ZG.util.plural(nz, 'зомби', 'зомби', 'зомби')}` : ''}${nb ? `${nz ? ' и' : ' — там'} ${nb} ${ZG.util.plural(nb, 'бандит', 'бандита', 'бандитов')}` : ''}${n ? '!' : '.'}`, n ? 'bad' : 'info');
    E.fx(g, { t: 'reveal', tile: ti, n, why });
    const here = g.zombies.filter((z) => g.board.cells[z.pos].tile === ti);
    if (g.stackTiles && g.stackTiles.includes(ti) && here.some((z) => z.lurk)) E.storyEvent(g, 'packReveal');
    if (here.some((z) => E.isBandit(z))) E.storyEvent(g, 'firstBandit');
    wanderCheck(g, ti);
  };
  // Блуждающая угроза (обращённые союзники прошлых миссий, боссы локации): при открытии тайла —
  // кубик за каждую, на «6» появляется здесь; на последнем закрытом тайле — без броска.
  // Появляется в зоне тайла, самой дальней от героев; в скрытности — бродячей.
  function wanderCheck(g, ti) {
    if (!g.wanderers || !g.wanderers.length) return;
    const last = !g.revealed.some((r) => !r);
    g.wanderers.forEach((w) => {
      if (w.out) return;
      const roll = last ? null : Rng.int(g, 6) + 1;
      if (roll != null && roll !== 6) return;
      w.out = true;
      const zd = ZG.Zombies.get(w.type);
      const cells = g.board.cells.filter((c) => c.tile === ti && c.type !== 'blocked').map((c) => c.i);
      const dists = g.heroes.filter((h) => h.onBoard).map((h) => E.dist(g, h.pos));
      const far = (c) => Math.min(...dists.map((d) => (d[c] == null ? 99 : d[c])), 99);
      const cell = cells.sort((a, b) => far(b) - far(a) || a - b)[0];
      const z = E.spawnZombie(g, w.type, cell, null, true, true, true);
      if (!z) { w.out = false; return; }
      if (g.stealth && !zd.relentless) { z.awake = false; z.trail = null; }
      E.log(g, `${last ? 'Последний тайл' : 'На кубике «6»'}: здесь бродит ${zd.name}!`, 'bad');
      E.fx(g, { t: 'wanderer', ztype: w.type, pos: cell, zombie: z && z.uid });
    });
  }
  // раскрытие пустышек при перевороте тайла
  function resolveDecoys(g, ti) {
    const list = E.decoysOn(g, ti);
    if (!list.length) return;
    g.decoys = g.decoys.filter((d) => !list.includes(d));
    const cnt = { gone: 0, lair: 0, ambush: 0, tracks: 0 };
    list.forEach((d) => {
      cnt[d.kind]++;
      if (d.kind === 'gone') (g.decoyBag = g.decoyBag || []).push('gone'); // «Ушли» возвращается в мешок
      if (d.kind === 'lair') {
        g.search.push({ pos: d.pos, kind: 'armory' });
        E.fx(g, { t: 'objective', pos: d.pos, text: 'ЛОГОВО' });
      } else if (d.kind === 'ambush') {
        const p = E.nearest(g, d.pos, g.spawnPoints.filter((x) => !E.plugged || !E.plugged(g, x)));
        if (p != null) { E.fx(g, { t: 'objective', pos: p, text: 'ЗАСАДА!' }); drawSpawn(g, p); }
      } else if (d.kind === 'tracks') {
        const dd = E.distV(g, d.pos);
        let best = null;
        g.zombies.forEach((z) => { if (!ZG.Zombies.get(z.type).immobile && !E.hidden(g, z.pos) && dd[z.pos] < Infinity && (!best || dd[z.pos] < dd[best.pos])) best = z; });
        if (best) { if (g.stealth) wake(g, best, d.pos, true); else g.noise[d.pos] = (g.noise[d.pos] || 0) + 1; }
        E.fx(g, { t: 'objective', pos: d.pos, text: 'СЛЕДЫ' });
      }
    });
    const parts = [];
    if (cnt.gone) parts.push(`${cnt.gone} — «ушли»`);
    if (cnt.lair) parts.push('логово с припасами');
    if (cnt.ambush) parts.push('засада: зомби лезут из ближайшего люка');
    if (cnt.tracks) parts.push('свежие следы — кто-то идёт сюда');
    E.log(g, `Пустышки в тумане: ${parts.join(', ')}.`, cnt.ambush ? 'bad' : 'info');
    if (cnt.gone && cnt.gone === list.length) E.fx(g, { t: 'objective', pos: list[0].pos, text: 'ПУСТО' });
  }
  // соседние зоны закрытых тайлов (по стороне), куда можно попробовать шагнуть
  E.fogNeighbors = function (g, cell) {
    const b = g.board, c = b.cells[cell], out = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
      const n = y * b.w + x;
      if (E.hidden(g, n)) out.push(n);
    });
    return out;
  };
  E.nearest = function (g, from, cells) {
    if (!cells.length) return null;
    const d = E.dist(g, from);
    let best = null, bd = Infinity;
    cells.forEach((c) => { if (d[c] < bd) { bd = d[c]; best = c; } });
    return best;
  };

  E.clone = function (g) {
    const b = g.board, log = g.log, fx = g.fx;
    g.board = null; g.log = []; g.fx = [];
    const c = structuredClone(g);
    g.board = b; g.log = log; g.fx = fx;
    c.board = b; c.quiet = true; c.sim = true; // копия для просчёта бота: скрытые ловушки задания в ней не срабатывают
    return c;
  };

  // ============================================================== создание
  E.create = function (opts) {
    const level = ZG.Levels.get(opts.levelId || 'outskirts');
    const seed = String(opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9));
    const g = {
      v: 2, seed, rng: Rng.seedFrom(seed), levelId: level.id,
      scenarioId: null, conditionId: null, difficultyId: opts.difficultyId || 'survivor',
      cards: {}, nextUid: 1, heroes: [], zombies: [], crates: [], search: [], drops: [],
      lures: [], traps: [], barricades: [], doors: level.doors ? {} : null, noise: {}, spawnPoints: [],
      lootDeck: [], lootDiscard: [], spawnDeck: [], spawnDiscard: [],
      round: 1, alarm: 0, phase: 'heroes', active: null, turn: null, pending: null, zs: null,
      obj: {}, result: null, quiet: !!opts.quiet,
      stats: { kills: 0, killsBy: {}, wounds: 0, searches: 0, waves: 0, spawned: 0, fell: 0, cardsPlayed: 0, chains: 0 },
      log: [], fx: [],
      campaign: !!opts.campaign, xpLevels: opts.xpLevels || null, tileRules: opts.tileRules || null, special: opts.special || null, stories: opts.stories || null, storySeen: {}, missionTitle: opts.missionTitle || null,
      wanderers: (opts.wanderers || []).map((type) => ({ type, out: false })),
    };
    g.board = Board.generate(level, g);
    g.scenarioId = opts.scenarioId || Rng.pick(g, level.scenarios);
    g.conditionId = opts.conditionId || Rng.pick(g, level.conditions);
    g.bonusId = opts.bonusId || (level.bonuses ? Rng.pick(g, level.bonuses) : null);

    // герои
    opts.heroes.forEach((hs, idx) => {
      const def = ZG.Heroes.get(hs.id);
      const h = {
        idx, id: def.id, player: hs.player || 1, pos: null, deck: [], hand: [], discard: [], equip: [],
        energy: 0, adrenaline: 0, block: 0, xp: 0, level: 1, talents: [], talentQueue: [],
        ai: !!hs.ai, infection: 0, ms: {}, mission: null, missionDone: false, perks: [], acted: false, onBoard: true, fallen: false, evacuated: false, hidden: false, secondWindUsed: false,
      };
      def.deck.forEach((cid) => { const u = E.newUid(g, 'c'); g.cards[u] = cid; h.deck.push(u); });
      // кампания: герой приходит со своим уровнем, талантами, травмами, экипировкой и временными картами морали
      const cv = hs.carry;
      if (cv) {
        h.level = cv.level || 1; h.xp = cv.xp || 0; h.talents = (cv.talents || []).slice(); h.perks = (cv.perks || []).slice();
        h.injury = cv.injury || 0; h.missionsDone = (cv.missionsDone || []).slice(); h.talentQueue = (cv.talentQueue || []).slice();
        (cv.cards || []).forEach((it) => { const u = E.newUid(g, 'c'); g.cards[u] = it.id; h.deck.push(u); (g.carried = g.carried || {})[u] = it.key; (g.carriedHolders = g.carriedHolders || {})[u] = [h.id]; });
        (cv.temp || []).forEach((id) => { const u = E.newUid(g, 'c'); g.cards[u] = id; h.deck.push(u); });
      }
      Rng.shuffle(g, h.deck);
      g.heroes.push(h);
    });

    placeStartExit(g, level);
    g.fog = opts.fog != null ? !!opts.fog : !!level.fog;
    g.stealth = opts.stealth != null ? !!opts.stealth : !!level.stealth; // скрытность: зомби не знают, где герои
    g.alertUntil = 0; // до какого раунда орда знает, где все герои (после Волны)
    g.revealed = g.fog ? g.board.tiles.map((t, i) => i === tileOf(g, g.start) || i === tileOf(g, g.exit)) : null;
    // колоды
    Object.entries(level.loot).forEach(([id, n]) => { for (let i = 0; i < n; i++) g.lootDeck.push(id); });
    Rng.shuffle(g, g.lootDeck);
    Object.entries(level.spawnDeck).forEach(([id, n]) => { for (let i = 0; i < n; i++) g.spawnDeck.push(id); });
    Rng.shuffle(g, g.spawnDeck);
    g.eventDeck = Rng.shuffle(g, (level.events || []).slice());
    g.event = null;

    g.heroes.forEach((h) => { h.pos = g.start; });
    E.scenario(g).setup(g, E);
    placeSearch(g);
    const diff = ZG.Difficulties.get(g.difficultyId);
    if (diff.startWounds) g.heroes.forEach((h) => { for (let i = 0; i < diff.startWounds; i++) { const u = E.newUid(g, 'sw'); g.cards[u] = 'wound'; h.deck.push(u); } Rng.shuffle(g, h.deck); });
    if (diff.startLoot) g.heroes.forEach((h) => { for (let i = 0; i < diff.startLoot; i++) E.giveLoot(g, h); });
    const cond = ZG.Conditions.get(g.conditionId);
    if (cond.setup) cond.setup(g, E);

    // большой отряд шумит: Тревога в начале партии выше (уровень: startAlarm по числу героев)
    g.alarm += (level.startAlarm || {})[Math.min(4, g.heroes.length)] || 0;
    // секретные миссии: каждый тайно тянет карту; неподходящая (нет союзника/скрытности/тумана) — под низ, тянем новую
    g.missions = opts.missions != null ? !!opts.missions : level.missions !== false;
    if (g.missions) {
      g.missionDeck = Rng.shuffle(g, ZG.MISSION_DECK.slice());
      g.heroes.forEach((h) => {
        for (let guard = 0; guard < 30 && g.missionDeck.length; guard++) {
          const id = g.missionDeck.shift(), m = ZG.Missions.get(id);
          if (!E.missionFits(g, m)) { g.missionDeck.push(id); continue; }
          h.mission = id; break;
        }
      });
    }
    // стартовая рука: каждый герой сразу набирает полную руку
    g.heroes.forEach((h) => drawCards(g, h, Math.max(0, E.handSize(g, h) - h.hand.length) + Mods.value(g, h, 'startDraw', 0)));
    g.fx = [];
    queueTalent(g); // кампания: невыбранный в прошлой миссии талант предлагается сразу
    // начальное появление
    g.spawnPoints.forEach((p) => drawSpawn(g, p));
    E.log(g, `${g.missionTitle || `${level.campaignOnly ? 'Миссия' : 'Уровень'} ${level.num}: ${level.name}`}. Задание — «${E.scenario(g).name}». Условие — «${cond.name}».`, 'title');
    E.log(g, E.scenario(g).short, 'info');
    return g;
  };

  function edgeStreets(g) {
    const b = g.board;
    return b.cells.filter((c) => c.type === 'street' && (c.x === 0 || c.y === 0 || c.x === b.w - 1 || c.y === b.h - 1));
  }

  // Подготовка воспроизводима руками (см. правила, «Подготовка»):
  //   старт — уличная зона левого края, выход — уличная зона правого края,
  //   люки — на значках люков тайлов, начиная с правого столбца.
  const tileOf = (g, cell) => g.board.cells[cell].tile;
  E.tileOf = tileOf;
  function tilesByColumn(g, exclude) {
    // тайлы от дальнего (правого) столбца к ближнему, внутри столбца — случайно
    const tiles = g.board.tiles.map((t, i) => ({ t, i })).filter((x) => !(exclude || []).includes(x.i));
    const cols = {};
    tiles.forEach((x) => { (cols[x.t.tx] = cols[x.t.tx] || []).push(x.i); });
    return Object.keys(cols).map(Number).sort((a, b) => b - a).reduce((acc, k) => acc.concat(Rng.shuffle(g, cols[k])), []);
  }
  E.tilesByColumn = tilesByColumn;
  function placeStartExit(g, level) {
    const b = g.board;
    // старт: случайный тайл левого столбца, зона у левого края поля; выход — так же справа
    const maxTx = Math.max.apply(null, b.tiles.map((t) => t.tx));
    const reqIds = ((g.tileRules && g.tileRules.required) || []).map((r) => (typeof r === 'string' ? r : r.id));
    const edgeZone = (tx, x) => {
      const col = b.tiles.map((t, i) => ({ t, i })).filter((o) => o.t.tx === tx);
      const free = col.filter((o) => !reqIds.includes(o.t.id)); // уникальные тайлы миссии не открываются заранее
      const tiles = (free.length ? free : col).map((o) => o.i);
      const ti = Rng.pick(g, tiles);
      const on = b.cells.filter((c) => c.tile === ti && c.x === x && c.type !== 'blocked');
      const st = on.filter((c) => c.type === 'street');
      return Rng.pick(g, st.length ? st : on).i;
    };
    const startId = g.tileRules && g.tileRules.startTile;
    const st = startId != null ? b.tiles.findIndex((t) => t.id === startId) : -1;
    if (st >= 0) { // миссия задаёт стартовый тайл
      const on = b.cells.filter((c) => c.tile === st && c.type !== 'blocked');
      const edge = on.filter((c) => c.x === 0 && c.type === 'street');
      g.start = Rng.pick(g, edge.length ? edge : on.filter((c) => c.type === 'street').length ? on.filter((c) => c.type === 'street') : on).i;
    } else g.start = edgeZone(0, 0);
    g.exit = edgeZone(maxTx, b.w - 1);
    const base = level.spawnPoints[Math.min(4, g.heroes.length)];
    const n = base ? Math.max(0, base + Mods.value(g, null, 'spawnPointsBonus', 0)) : 0; // уровень без люков — сложность их не добавляет
    const startTile = tileOf(g, g.start);
    g.spawnPoints = [];
    tilesByColumn(g, [startTile, tileOf(g, g.exit)]).slice(0, n).forEach((ti) => {
      let cell = b.cells.find((c) => c.tile === ti && c.manhole);
      if (!cell || cell.i === g.exit) cell = Rng.pick(g, b.cells.filter((c) => c.tile === ti && c.type === 'street' && c.i !== g.exit));
      g.spawnPoints.push(cell.i);
    });
  }

  // Ящики: по одному на N разных тайлах (кроме стартового), от дальнего столбца;
  // на тайле — место обыска в здании (иначе любое место обыска).
  E.placeCrates = function (g, n, real, cargoId, avoid) {
    const b = g.board;
    const taken = new Set([g.start, g.exit].concat(g.spawnPoints, avoid || []));
    const picks = [];
    tilesByColumn(g, [tileOf(g, g.start)]).forEach((ti) => {
      if (picks.length >= n) return;
      const on = b.cells.filter((c) => c.tile === ti && !taken.has(c.i));
      const cell = on.find((c) => c.tileSearch && c.type === 'building') || on.find((c) => c.tileSearch) || on.find((c) => c.type === 'building') || on.find((c) => c.type === 'street');
      if (cell) picks.push(cell.i);
    });
    const realIdx = Rng.shuffle(g, picks.map((_, i) => i)).slice(0, real);
    picks.forEach((pos, i) => g.crates.push({ pos, card: realIdx.includes(i) ? cargoId : null, opened: false }));
  };
  // Выход у точки: ближайшая (по шагам) уличная зона; при равенстве — правее
  E.placeExitNear = function (g, cell) {
    const d = E.dist(g, cell);
    const bad = new Set([g.start].concat(g.spawnPoints));
    const ti = g.board.cells[cell].tile;
    const onTile = g.board.cells.some((c) => c.tile === ti && c.type === 'street' && !bad.has(c.i));
    let best = null;
    g.board.cells.forEach((c) => {
      if (c.type !== 'street' || bad.has(c.i) || d[c.i] === Infinity) return;
      if (onTile && c.tile !== ti) return; // посадка — на тайле вышки (он открыт)
      if (!best || d[c.i] < d[best.i] || (d[c.i] === d[best.i] && c.x > best.x)) best = c;
    });
    if (best) g.exit = best.i;
  };
  // Вышка: в здании на тайле среднего столбца (в ряду без старта, если можно)
  E.placeTower = function (g) {
    const b = g.board;
    const midX = Math.floor(b.tiles.reduce((m, t) => Math.max(m, t.tx), 0) / 2);
    const startRow = b.tiles[tileOf(g, g.start)].ty;
    // уникальные тайлы миссии (кампания) не открываются заранее — вышку на них не ставим
    const reqIds = ((g.tileRules && g.tileRules.required) || []).map((r) => (typeof r === 'string' ? r : r.id));
    const mids = b.tiles.map((t, i) => ({ t, i })).filter((x) => x.t.tx === midX && !reqIds.includes(x.t.id)).sort((x, y) => (x.t.ty === startRow) - (y.t.ty === startRow));
    for (const m of mids) {
      const c = b.cells.filter((x) => x.tile === m.i && x.type === 'building');
      if (c.length) return (c.find((x) => x.tileSearch) || c[0]).i;
    }
    // в среднем столбце нет зданий — тайлы справа налево (кроме стартового)
    for (const ti of tilesByColumn(g, [tileOf(g, g.start)].concat(b.tiles.map((t, i) => (reqIds.includes(t.id) ? i : -1)).filter((i) => i >= 0)))) {
      const c = b.cells.filter((x) => x.tile === ti && x.type === 'building');
      if (c.length) return (c.find((x) => x.tileSearch) || c[0]).i;
    }
    return b.cells.find((x) => x.type === 'building').i;
  };
  // Гнёзда: в центре тайлов, начиная с правого столбца (центр непроходим — соседняя зона)
  E.placeNests = function (g, n) {
    const b = g.board;
    tilesByColumn(g, [tileOf(g, g.start)]).slice(0, n).forEach((ti) => {
      const t = b.tiles[ti];
      const center = (t.ty * 3 + 1) * b.w + t.tx * 3 + 1;
      let cell = center;
      if (b.cells[center].type === 'blocked' || g.spawnPoints.includes(center) || center === g.exit) {
        cell = b.cells.find((c) => c.tile === ti && c.type !== 'blocked' && !g.spawnPoints.includes(c.i) && c.i !== g.exit && Math.abs(c.x - b.cells[center].x) + Math.abs(c.y - b.cells[center].y) === 1).i;
      }
      E.spawnZombie(g, 'nest', cell, null, true);
    });
  };
  function placeSearch(g) {
    const taken = new Set([g.start, g.exit].concat(g.crates.map((c) => c.pos), g.spawnPoints));
    g.board.cells.forEach((c) => { if (c.tileSearch && !taken.has(c.i)) g.search.push({ pos: c.i, kind: c.tileSearch }); });
  }
  E.addStreetSearch = function (g, n) {
    const taken = new Set([g.start, g.exit].concat(g.crates.map((c) => c.pos), g.spawnPoints, g.search.map((s) => s.pos)));
    const cells = g.board.cells.filter((c) => c.type === 'street' && !taken.has(c.i));
    Rng.shuffle(g, cells).slice(0, n).forEach((c) => g.search.push({ pos: c.i, kind: 'normal' }));
  };

  E.drawFor = function (g, h, n) { return drawCards(g, h, n); };

  // ============================================================== колоды
  function drawLootId(g) {
    if (!g.lootDeck.length) { g.lootDeck = Rng.shuffle(g, g.lootDiscard); g.lootDiscard = []; }
    return g.lootDeck.shift() || null;
  }
  E.giveLoot = function (g, h) {
    for (let guard = 0; guard < 10; guard++) {
      const id = drawLootId(g);
      if (!id) return;
      if (ZG.Cards.get(id).event) { g.lootDiscard.push(id); continue; }
      const u = E.newUid(g, 'c'); g.cards[u] = id; h.hand.push(u);
      return;
    }
  };

  function drawCards(g, h, n) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (!h.deck.length) {
        if (!h.discard.length) break;
        h.deck = Rng.shuffle(g, h.discard); h.discard = [];
        E.log(g, `${E.heroName(h)} перетасовывает сброс.`, 'dim');
        E.fx(g, { t: 'shuffle', hero: h.idx });
      }
      const u = h.deck.shift();
      h.hand.push(u);
      drawn++;
      if (ZG.Cards.get(g.cards[u]).drainOnDraw) {
        if (g.turn && g.active === h.idx && !g.turn.starting) { h.energy = Math.max(0, h.energy - 1); E.log(g, `${E.heroName(h)}: «Уныние» — −1 ⚡.`, 'warn'); }
        else h.drainDue = (h.drainDue || 0) + 1;
      }
      E.fx(g, { t: 'draw', hero: h.idx, card: u });
    }
    return drawn;
  }

  // Укус: за каждый неотражённый удар зомби — кубик. 1..die — Заражение, иначе Рана.
  function bite(g, h, n, attackers) {
    if (n <= 0) return;
    const inf = ZG.Levels.get(g.levelId).infection;
    // один бросок на каждого укусившего зомби (не на каждую единицу урона); заразный (Обращённая Марина) — Заражение без броска
    const all = (attackers || []).map((u) => E.zombie(g, u)).filter(Boolean);
    const list = all.filter((z) => !E.isBandit(z)); // бандиты ранят, но не заражают
    const rolls = all.length && !list.length ? 0 : Math.min(n, Math.max(1, list.length));
    let infections = 0;
    for (let i = 0; i < rolls; i++) {
      const z = list[i];
      const always = z && ZG.Zombies.get(z.type).infects;
      const roll = 1 + Rng.int(g, 6);
      if (inf && (always || roll <= Mods.value(g, h, 'infectDie', inf.die))) infections++;
    }
    const wounds = n - infections;
    if (infections) {
      // карта Заражения замешивается в колоду добора — укус скоро даст о себе знать
      for (let i = 0; i < infections; i++) { const u = E.newUid(g, 'i'); g.cards[u] = 'infection'; if (inf.hand) { h.hand.push(u); continue; } const span = inf.top ? Math.min(inf.top, h.deck.length) : h.deck.length; h.deck.splice(Rng.int(g, span + 1), 0, u); }
      g.stats.infections = (g.stats.infections || 0) + infections;
      E.log(g, `${E.heroName(h)}: укус! Заражение ×${infections}${inf.hand ? ' — в руку' : ' (замешано в колоду)'}.`, 'bad');
      E.fx(g, { t: 'infect', hero: h.idx, pos: h.pos, n: infections });
    }
    addWounds(g, h, wounds);
  }
  E.bite = bite;

  // Конец хода: каждое Заражение в руке двигает трек, карта уходит в сброс
  function tickInfection(g, h) {
    const inHand = h.hand.filter((u) => g.cards[u] === 'infection');
    if (!inHand.length) return;
    h.infection += inHand.length;
    h.hand = h.hand.filter((u) => g.cards[u] !== 'infection');
    inHand.forEach((u) => h.discard.push(u));
    const at = E.infectTurnAt(g);
    E.log(g, `${E.heroName(h)}: заражение растёт — ${Math.min(h.infection, at)}/${at}.`, 'bad');
    E.fx(g, { t: 'infectTick', hero: h.idx, pos: h.pos, n: h.infection, at });
    if (h.infection >= at) turnHero(g, h);
  }

  // 2 случайные карты героя (не Раны/Заражения/грузы) падают в зоне вместе с грузом
  function dropBelongings(g, h) {
    const drop = (u) => g.drops.push({ pos: h.pos, card: g.cards[u], carried: g.carried && g.carried[u], holders: g.carriedHolders && g.carriedHolders[u] });
    h.hand.filter((u) => ZG.Cards.get(g.cards[u]).kind === 'cargo').forEach(drop);
    const pool = h.deck.concat(h.hand, h.discard, h.equip).filter((u) => { const d = ZG.Cards.get(g.cards[u]); return !d.kind || d.kind === 'action'; });
    Rng.shuffle(g, pool).slice(0, 2).forEach(drop);
    h.hand = h.hand.filter((u) => ZG.Cards.get(g.cards[u]).kind !== 'cargo');
  }

  // Обращение: фишка героя переворачивается особым монстром
  function turnHero(g, h) {
    if (!h.onBoard) return;
    h.onBoard = false; h.fallen = true; h.turned = true;
    g.stats.fell++; g.stats.turned = (g.stats.turned || 0) + 1;
    dropBelongings(g, h);
    const type = 'turned_' + h.id;
    E.log(g, `${E.heroName(h)} обращается! Перед вами — ${ZG.Zombies.has(type) ? ZG.Zombies.get(type).name : 'Шатун'}.`, 'bad');
    E.fx(g, { t: 'turn_hero', hero: h.idx, pos: h.pos });
    E.spawnZombie(g, ZG.Zombies.has(type) ? type : 'walker', h.pos, null, true);
    if (g.active === h.idx) { g.active = null; g.turn = null; }
    checkEnd(g);
  }
  E.turnHero = turnHero;

  // свойства обращённых
  E.turnedShot = function (g, z, R) {
    const target = Board.lineCells(g.board, z.pos, R, (c) => E.hidden(g, c)).filter((c) => c.dist >= 1).map((c) => E.heroesAt(g, c.cell)).find((hs) => hs.length);
    if (!target) return;
    const h = target[0];
    E.log(g, `${ZG.Zombies.get(z.type).name} стреляет в ${E.heroName(h)}!`, 'bad');
    E.fx(g, { t: 'shot', hero: null, from: z.pos, to: h.pos });
    addWounds(g, h, 1);
  };
  E.blast = function (g, pos, dmg, wounds) {
    E.log(g, 'Взрыв!', 'warn');
    E.fx(g, { t: 'explode', pos });
    killOrder(g, E.zombiesAt(g, pos), dmg).forEach((z) => damageZombie(g, z, dmg, null, 'fire'));
    E.heroesAt(g, pos).forEach((h) => addWounds(g, h, wounds));
  };

  function addWounds(g, h, n, silent) {
    for (let i = 0; i < n; i++) {
      const u = E.newUid(g, 'w'); g.cards[u] = 'wound'; h.discard.push(u);
    }
    if (!silent) g.stats.wounds += n;
    checkFall(g, h);
  }
  E.addWounds = addWounds;

  function healWounds(g, h, n, cures) {
    let left = n;
    if (cures) {
      // лекарство сначала убирает Заражения
      for (const pile of ['hand', 'discard', 'deck']) {
        for (let i = h[pile].length - 1; i >= 0 && left > 0; i--) {
          if (g.cards[h[pile][i]] === 'infection') { h[pile].splice(i, 1); left--; }
        }
      }
    }
    for (const pile of ['hand', 'discard', 'deck']) {
      for (let i = h[pile].length - 1; i >= 0 && left > 0; i--) {
        if (g.cards[h[pile][i]] === 'wound') { h[pile].splice(i, 1); left--; }
      }
    }
    const healed = n - left;
    if (healed) E.fx(g, { t: 'heal', hero: h.idx, n: healed, pos: h.pos });
    return healed;
  }

  function checkFall(g, h) {
    if (!h.onBoard) return;
    if (E.hurtCount(g, h) < E.maxHp(g, h)) return;
    const saver = g.heroes.find((o) => o.onBoard && o.pos === h.pos && !o.secondWindUsed && Mods.flag(g, o, 'secondWind'));
    if (saver) {
      saver.secondWindUsed = true;
      healWounds(g, h, 2); // строго по тексту таланта: только Раны (Заражения остаются)
      E.log(g, `${E.heroName(saver)}: «Второе дыхание»! ${E.heroName(h)} остаётся в строю.`, 'good');
      checkFall(g, h); // если двух не хватило — всё же падает
      return;
    }
    h.onBoard = false; h.fallen = true;
    g.stats.fell++;
    dropBelongings(g, h);
    E.log(g, `${E.heroName(h)} падает… и через минуту поднимается снова — уже Шатуном.`, 'bad');
    E.fx(g, { t: 'fall', hero: h.idx, pos: h.pos });
    E.spawnZombie(g, 'walker', h.pos, null, true);
    if (g.active === h.idx) { g.active = null; g.turn = null; }
    checkEnd(g);
  }

  function checkEnd(g) {
    if (g.result) return;
    const living = g.heroes.filter((h) => !h.fallen);
    if (!living.length) return finish(g, false, 'Все герои пали.');
    if (living.every((h) => h.evacuated)) return finish(g, true, 'Выжившие эвакуированы!');
  }

  function finish(g, win, reason) {
    g.result = { win, reason, stars: 0, round: g.round };
    if (win) {
      let s = 1;
      if (!g.heroes.some((h) => h.fallen)) s++;
      if (g.bonusId && ZG.Bonuses.get(g.bonusId).check(g)) s++;
      g.result.stars = s;
    }
    g.phase = 'over'; g.pending = null; g.active = null;
    E.log(g, (win ? 'ПОБЕДА. ' : 'ПОРАЖЕНИЕ. ') + reason, win ? 'title' : 'bad');
    E.fx(g, { t: 'gameover', win });
  }

  // ============================================================== зомби
  // Пустышки: в тумане за каждого зомби кладутся 2 жетона лицом вниз — каждый 50/50 зомби или пустышка.
  // Пустышки (мешок 20 шт.): 17 «Ушли», 1 «Логово», 1 «Засада сверху», 1 «Следы».
  // мешок пустышек (без возвращения): 17 «Ушли», по одной особой; «Ушли» при открытии возвращается в мешок, особые — выходят из игры
  function rollDecoy(g) {
    if (!g.decoyBag) g.decoyBag = Array(17).fill('gone').concat(['lair', 'ambush', 'tracks']);
    if (!g.decoyBag.length) return null;
    return g.decoyBag.splice(Rng.int(g, g.decoyBag.length), 1)[0];
  }
  E.decoysOn = (g, ti) => (g.decoys || []).filter((d) => g.board.cells[d.pos].tile === ti);
  // сколько жетонов лежит стопкой на закрытом тайле (зомби + пустышки)
  E.fogTokens = (g, ti, mobileOnly) => g.zombies.filter((z) => g.board.cells[z.pos].tile === ti && (!mobileOnly || !ZG.Zombies.get(z.type).immobile)).length + E.decoysOn(g, ti).length;
  E.spawnZombie = function (g, type, pos, why, silent, real, force) {
    // облегчённые уровни (zombieTypes): чужие типы подменяются слабыми — быстрые Бегуном, прочие Шатуном
    // (обращённые союзники и неподвижные цели задания — как есть)
    const allow = ZG.Levels.get(g.levelId).zombieTypes;
    if (allow && !allow.includes(type)) { const zx = ZG.Zombies.get(type); if (!zx.turned && !zx.immobile && !zx.boss && !zx.faction) type = zx.speed >= 2 && allow.includes('runner') ? 'runner' : allow[0]; }
    const zd0 = ZG.Zombies.get(type);
    if (!real && ZG.Levels.get(g.levelId).decoys && g.revealed && E.hidden(g, pos) && !zd0.immobile && !zd0.relentless && !zd0.turned) {
      let first = null;
      for (let k = 0; k < 2; k++) {
        if (Rng.int(g, 2) === 0) { const z = E.spawnZombie(g, type, pos, null, true, true); first = first || z; }
        else { const kind = rollDecoy(g); if (kind) { (g.decoys = g.decoys || []).push({ pos, kind }); E.fx(g, { t: 'spawn', pos, decoy: true }); } }
      }
      if (why && !silent) E.log(g, why + '.', 'warn');
      return first;
    }
    const pool = (ZG.Levels.get(g.levelId).pool || {})[type];
    if (pool && !force && g.zombies.filter((x) => x.type === type).length >= pool) {
      // жетоны кончились: вместо появления все такие зомби делают лишний шаг (раз за карту появления)
      g.poolMoved = g.poolMoved || {};
      if (g.poolMoved[type]) return null;
      g.poolMoved[type] = true;
      E.log(g, `Жетоны «${ZG.Zombies.get(type).name}» кончились — все они делают лишний шаг!`, 'bad');
      g.zombies.filter((x) => x.type === type).forEach((x) => moveZombieStep(g, x, g.zs && g.zs.goals));
      return null;
    }
    const zd = ZG.Zombies.get(type);
    const z = { uid: E.newUid(g, 'z'), type, pos, dmg: 0, suppressed: false, awake: !g.stealth || !!zd.relentless || (!E.hidden(g, pos) && (E.alerted(g) || E.heroesAt(g, pos).some((h) => !h.hidden))), trail: null };
    if (z.awake && g.stealth && !zd.relentless) z.trail = pos; // появился рядом с героем — сразу охотится
    g.zombies.push(z);
    g.stats.spawned++;
    E.fx(g, { t: 'spawn', zombie: z.uid, pos, ztype: type });
    if (why && !silent) E.log(g, why + '.', 'warn');
    return z;
  };

  E.raiseAlarm = function (g, n, why) {
    if (n <= 0) return;
    g.alarm += n;
    E.fx(g, { t: 'alarm', n });
    if (why) E.log(g, `${why}: Тревога +${n} (${g.alarm}/${E.alarmThreshold(g)}).`, 'warn');
  };

  function makeNoise(g, h, cell, n) {
    if (n <= 0) return;
    g.noise[cell] = (g.noise[cell] || 0) + n;
    const a = Math.max(0, n + Mods.value(g, h, 'noiseAlarm', 0));
    E.fx(g, { t: 'noise', pos: cell, n });
    E.hear(g, cell, 1 + n, h ? h.idx : null);
    E.raiseAlarm(g, a, 'Шум');
  }

  // приоритет целей при автоматическом распределении урона по зоне
  function killOrder(g, list, dmg) {
    return list.slice().sort((a, b) => {
      const da = ZG.Zombies.get(a.type), db = ZG.Zombies.get(b.type);
      const ka = da.hp - a.dmg <= dmg - da.armor ? 1 : 0, kb = db.hp - b.dmg <= dmg - db.armor ? 1 : 0;
      if (ka !== kb) return kb - ka;
      return db.threat - da.threat;
    });
  }

  function damageZombie(g, z, n, heroIdx, kind) {
    // любая атака героя выдаёт его укрытие до конца раунда (даже бесшумная)
    if (heroIdx != null && kind !== 'trap' && kind !== 'silent' && g.heroes[heroIdx]) (g.loud = g.loud || {})[g.heroes[heroIdx].pos] = 1;
    if (g.stealth && heroIdx != null && g.heroes[heroIdx] && kind !== 'silent') wake(g, z, g.heroes[heroIdx].pos, false, heroIdx); // на него напали
    const def = ZG.Zombies.get(z.type);
    if (heroIdx != null && E.scenario(g).onZombieHit) E.scenario(g).onZombieHit(g, z, heroIdx, E); // особые правила задания
    if (g.turn && g.turn.courage && heroIdx === g.active && (kind === 'melee' || kind === 'ranged' || kind === 'fire')) n += 1;
    const eff = Math.max(0, n - (def.armor || 0));
    if (!g.zombies.includes(z)) return false;
    z.dmg += eff;
    if (def.big || z.type === 'fatso') g.stats.bigDmg = (g.stats.bigDmg || 0) + eff;
    E.fx(g, { t: 'hit', zombie: z.uid, pos: z.pos, n: eff, kind });
    if (z.dmg >= def.hp) {
      g.zombies.splice(g.zombies.indexOf(z), 1);
      g.stats.kills++;
      g.stats.killsBy[z.type] = (g.stats.killsBy[z.type] || 0) + 1;
      if (kind === 'shot') g.stats.banditKills = (g.stats.banditKills || 0) + 1; // зомби, убитые бандитами
      E.fx(g, { t: 'kill', zombie: z.uid, pos: z.pos, ztype: z.type });
      if (def.onDeath) def.onDeath(g, z, E, kind, heroIdx);
      if (E.scenario(g).onKill) E.scenario(g).onKill(g, z, heroIdx, E);
      if (heroIdx != null) { E.storyEvent(g, 'firstKill'); if (def.boss) E.storyEvent(g, 'bossKill'); }
      if (heroIdx != null) {
        const h = g.heroes[heroIdx];
        if (kind === 'melee' || kind === 'silent') ms(h, 'meleeKills');
        if (def.big) ms(h, 'bigKills');
        if (g.turn && g.active === heroIdx) { g.turn.kills = (g.turn.kills || 0) + 1; h.ms.bestTurnKills = Math.max(h.ms.bestTurnKills || 0, g.turn.kills); }
        gainXp(g, h, def.xp);
        if (def.turned) (g.putDown = g.putDown || []).push({ hero: heroIdx, turned: def.turned }); // упокоил бывшего союзника
        if (def.trophy) { // трофей мини-босса — сразу в руку убившему
          E.giveCard(g, h, def.trophy);
          E.log(g, `${E.heroName(h)} добывает трофей: «${ZG.Cards.get(def.trophy).name}»!`, 'good');
          E.fx(g, { t: 'trophy', hero: h.idx, card: def.trophy, pos: z.pos, ztype: z.type });
        }
        Mods.emit(g, h, 'kill', { zombie: z, kind, E });
      }
      return true;
    }
    return false;
  }
  E.damageZombie = damageZombie;
  E.gainXp = function (g, h, n) { gainXp(g, h, n); };

  E.giveCard = function (g, h, id) { const u = E.newUid(g, 'c'); g.cards[u] = id; h.hand.push(u); };
  // редкая или уникальная находка из колоды добычи (если таких нет — обычная)
  E.giveRareLoot = function (g, h) {
    const i = g.lootDeck.findIndex((id) => ['rare', 'unique'].includes(ZG.Cards.get(id).rarity));
    if (i >= 0) { const id = g.lootDeck.splice(i, 1)[0]; E.giveCard(g, h, id); E.log(g, `${E.heroName(h)} получает «${ZG.Cards.get(id).name}».`, 'good'); }
    else E.giveLoot(g, h);
  };
  // счётчик прогресса секретной миссии
  const ms = (h, key, n) => { h.ms = h.ms || {}; h.ms[key] = (h.ms[key] || 0) + (n == null ? 1 : n); };
  E.ms = ms;
  // подходит ли миссия к этой партии (союзник, скрытность, туман)
  E.missionFits = (g, m) => !((m.needsAlly && g.heroes.length < 2) || (m.needsStealth && !g.stealth) || (m.needsFog && !g.fog));
  // смена миссии: раз за партию, в свой ход, пока миссия не выполнена; прогресс начинается заново
  E.redrawMission = function (g, h) {
    if (!g.missions || !h.mission || h.missionDone || h.missionRedrawn || !g.missionDeck.length) return false;
    const old = h.mission;
    const i = g.missionDeck.findIndex((id) => id !== old && E.missionFits(g, ZG.Missions.get(id)));
    if (i < 0) return false; // подходящих карт нет — смена не тратится
    const id = g.missionDeck.splice(i, 1)[0];
    g.missionDeck.push(old);
    h.mission = id;
    h.missionRedrawn = true; h.ms = {};
    E.log(g, `${E.heroName(h)} меняет секретную миссию.`, 'dim');
    return true;
  };
  E.missionProgress = (g, h) => { const m = h.mission && ZG.Missions.get(h.mission); return m ? Math.min(m.goal, (h.ms && h.ms[m.stat]) || 0) : 0; };
  // проверка миссий: награда — только первому выполнившему
  E.checkMissions = function (g) {
    if (!g.missions) return;
    g.heroes.forEach((h) => {
      if (!h.mission || h.missionDone || h.fallen) return; // павший герой миссию уже не выполнит
      const m = ZG.Missions.get(h.mission);
      if (E.missionProgress(g, h) < m.goal) return;
      h.missionDone = true;
      if (g.missionFirst == null && !h.fallen) {
        g.missionFirst = h.idx;
        const repeat = h.missionsDone && h.missionsDone.includes(m.id);
        if (repeat) gainXp(g, h, REPEAT_MISSION_XP);
        else {
          if (m.perk) h.perks.push(m.id);
          if (m.reward) m.reward(g, h, E);
          if (h.missionsDone) h.missionsDone.push(m.id);
        }
        E.log(g, repeat ? `${E.heroName(h)} снова выполняет «${m.name}» ПЕРВЫМ — награда уже получена раньше, вместо неё +${REPEAT_MISSION_XP} 🎖.` : `${E.heroName(h)} выполняет секретную миссию «${m.name}» ПЕРВЫМ! Награда: ${m.rewardText}`, m.traitor ? 'bad' : 'good');
        E.fx(g, { t: 'mission', hero: h.idx, id: m.id, rewarded: true });
      } else {
        E.log(g, `${E.heroName(h)} выполняет миссию «${m.name}», но кто-то успел раньше — награды нет.`, 'dim');
        E.fx(g, { t: 'mission', hero: h.idx, id: m.id, rewarded: false });
      }
    });
  };
  E.gainXp = (g, h, n) => gainXp(g, h, n);
  function gainXp(g, h, n) {
    const before = h.xp;
    h.xp += n;
    (g.xpLevels || XP_LEVELS).forEach((lv, i) => {
      if (before < lv && h.xp >= lv) {
        h.level = i + 2;
        h.talentQueue.push(i);
        E.log(g, `${E.heroName(h)} закаляется — уровень ${h.level}!`, 'good');
        E.fx(g, { t: 'levelup', hero: h.idx, pos: h.pos });
      }
    });
    queueTalent(g);
  }
  function queueTalent(g) {
    if (g.pending || g.result) return;
    const h = g.heroes.find((x) => x.talentQueue.length && !x.fallen);
    if (!h) return;
    const tier = h.talentQueue[0];
    const own = ZG.Heroes.get(h.id).talents[tier];
    // поздние уровни (кампания): 2 случайных общих таланта убежища из пула
    const options = own ? own.slice() : Rng.shuffle(g, ZG.Talents.all().filter((t) => t.shelter && !h.talents.includes(t.id)).map((t) => t.id)).slice(0, 2);
    if (!options.length) { h.talentQueue.shift(); return queueTalent(g); }
    g.pending = { type: 'talent', hero: h.idx, options };
  }

  E.retaliate = function (g, h, n) {
    const zs = killOrder(g, E.zombiesAt(g, h.pos), n);
    if (zs.length) { E.log(g, `${E.heroName(h)} отвечает ударом.`, 'good'); damageZombie(g, zs[0], n, h.idx, 'melee'); }
  };

  function enterCell(g, z, cell) {
    const from = z.pos;
    openDoor(g, from, cell, null);
    z.pos = cell;
    E.fx(g, { t: 'zmove', zombie: z.uid, from, to: cell });
    if (E.isBandit(z)) { E.banditLoot(g, z); if (E.scenario(g).watch) E.scenario(g).watch(g, E); } // пассивка бандита: оказался у лута — сразу забирает себе
    const trap = g.traps.find((t) => t.pos === cell);
    if (trap) {
      g.traps.splice(g.traps.indexOf(trap), 1);
      E.log(g, 'Растяжка срабатывает!', 'good');
      E.fx(g, { t: 'explode', pos: cell });
      killOrder(g, E.zombiesAt(g, cell), trap.dmg).forEach((zz) => damageZombie(g, zz, trap.dmg, trap.owner, 'trap'));
      makeNoise(g, null, cell, 2);
    }
  }

  // цели для зомби: герои (не невидимые) и приманки
  function zombieTargets(g, z) {
    const t = [];
    g.heroes.forEach((h) => {
      if (!h.onBoard || h.hidden) return;
      t.push({ pos: h.pos, noise: 1 + (g.noise[h.pos] || 0), wounds: E.hurtCount(g, h), idx: h.idx, shelter: E.sheltered(g, h) });
    });
    g.lures.forEach((l) => t.push({ pos: l.pos, lure: true, noise: g.noise[l.pos] || 0, wounds: 99, idx: 99 }));
    // шум без героев (скрип двери, взрыв) — тоже цель: зомби идут проверить
    Object.keys(g.noise).forEach((k) => { const c = +k; if (g.noise[c] > 0 && !E.heroesAt(g, c).length && !g.lures.some((l) => l.pos === c)) t.push({ pos: c, noise: g.noise[c], wounds: 98, idx: 97, sound: true }); });
    g.traps.forEach((tr) => { if (tr.owner != null && Mods.flag(g, g.heroes[tr.owner], 'trapLure')) t.push({ pos: tr.pos, lure: true, noise: g.noise[tr.pos] || 0, wounds: 99, idx: 98 }); });
    E.foesOf(g, z).forEach((o) => t.push({ pos: o.pos, noise: 1, wounds: 0, idx: 50 })); // третья сторона — такая же цель
    return E.isBandit(z) ? t.filter((x) => !x.lure && !x.sound) : t;
  }

  // Цель зомби: ближайший видимый герой / приманка / пустой шум (null — стоять)
  function pickGoal(g, z) {
    if (g.stealth) {
      if (!z.awake) return z.lurk ? null : wanderGoal(g, z); // притаившийся ждёт на месте, пока не разбудят
      // бандит: враг в своей зоне или на линии выстрела — стоит и стреляет; иначе не преследует, а мародёрствует дальше
      if (E.isBandit(z) && !ZG.Zombies.get(z.type).hunter && !z.hunt) return E.banditTarget(g, z) ? null : wanderGoal(g, z); // z.hunt — поднятый по тревоге: загонщик
      // охотник: видимые враги (герои, а также бандиты/зомби — для другой стороны) и приманки; никого не видно — последний след
      const cand = E.seenFoes(g, z).map((t) => ({ pos: t.pos, k: 1 })).concat(E.isBandit(z) ? [] : g.lures.map((l) => ({ pos: l.pos, k: 0 })));
      if (!cand.length && z.trail != null) cand.push({ pos: z.trail, k: 2 });
      if (!cand.length || cand.some((c) => c.pos === z.pos && c.k < 2)) return null;
      const dz = E.distV(g, z.pos);
      let best = null;
      cand.forEach((c) => { if (dz[c.pos] === Infinity) return; if (!best || dz[c.pos] < dz[best.pos] || (dz[c.pos] === dz[best.pos] && c.k < best.k)) best = c; });
      return best && best.pos !== z.pos ? best.pos : null;
    }
    if (E.isBandit(z) && E.banditTarget(g, z)) return null;
    const targets = zombieTargets(g, z);
    if (!targets.length) return null;
    if (targets.some((t) => t.pos === z.pos)) return null;
    const dz = E.distV(g, z.pos);
    let best = null;
    targets.forEach((t) => {
      if (t.shelter && dz[t.pos] > 1 && g.board.cells[z.pos].bld !== g.board.cells[t.pos].bld) return; // укрытие: из-за закрытых дверей не видно
      if (dz[t.pos] === Infinity) return;
      // ближайшая цель; ничья → приманка, затем больше шума, затем меньше Ран
      const key = (x) => [dz[x.pos], x.lure ? 0 : x.sound ? 2 : 1, -x.noise, x.wounds, x.idx];
      if (!best) { best = t; return; }
      const a = key(t), b = key(best);
      for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { if (a[i] < b[i]) best = t; break; } }
    });
    if (!best) return null;
    // Туман: зомби видит цель только на своём или соседнем (по стороне) тайле
    if (Mods.flag(g, null, 'fogTiles')) {
      const a = g.board.tiles[tileOf(g, z.pos)], b = g.board.tiles[tileOf(g, best.pos)];
      if (Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) > 1) return null;
    }
    return best.pos;
  }

  // Шаг зомби к цели, выбранной в начале фазы (goals: uid → клетка). Цель не меняется посреди фазы,
  // кроме случая, когда зомби дошёл до пустого шума: тогда он ищет новую.
  function moveZombieStep(g, z, goals) {
    if (E.hidden(g, z.pos)) return false; // в тумане зомби копятся у люка
    if (ZG.Zombies.get(z.type).static || z.post) return false; // на позиции (снайпер, часовой)
    goals = goals || {};
    // пришёл на пустой шум — «проверил, никого»: жетон снят, зомби ищет новую цель
    if (!g.stealth && g.noise[z.pos] && !E.heroesAt(g, z.pos).length && !g.lures.some((l) => l.pos === z.pos)) { delete g.noise[z.pos]; delete goals[z.uid]; }
    if (!(z.uid in goals)) goals[z.uid] = pickGoal(g, z);
    const goal = goals[z.uid];
    if (goal == null || goal === z.pos) return false;
    if (E.heroesAt(g, z.pos).some((h) => !h.hidden) || g.lures.some((l) => l.pos === z.pos)) return false; // по пути наткнулся на героя или приманку — остаётся
    if (z.awake && E.foesOf(g, z).some((o) => o.pos === z.pos)) return false; // сцепился с врагом другой стороны
    if (E.isBandit(z) && z.awake && E.banditTarget(g, z)) return false; // бандит увидел цель на линии — останавливается стрелять
    const zdef = ZG.Zombies.get(z.type);
    const best = { pos: goal };
    const dt = E.distV(g, best.pos);
    // из равных шагов — тот, где нет баррикады
    const steps = g.board.adj[z.pos].filter((n) => dt[n] === dt[z.pos] - 1);
    const next = steps.find((n) => zdef.climber || !E.barricadeAt(g, z.pos, n)) ?? steps[0];
    if (next == null) return false;
    const bar = zdef.climber ? null : E.barricadeAt(g, z.pos, next);
    if (bar && zdef.breaker) bar.hp = 0;
    if (bar) {
      const def = ZG.Zombies.get(z.type);
      bar.hp -= Math.max(1, def.dmg);
      E.fx(g, { t: 'bash', pos: z.pos, to: next });
      if (bar.hp <= 0) {
        g.barricades.splice(g.barricades.indexOf(bar), 1);
        E.log(g, `${def.name} проламывает баррикаду.`, 'warn');
      }
      return false;
    }
    // закрытая дверь: зомби тратит один шаг, чтобы её распахнуть
    if (E.doorClosed(g, z.pos, next)) {
      openDoor(g, z.pos, next, null);
      E.fx(g, { t: 'bash', pos: z.pos, to: next });
      return true;
    }
    enterCell(g, z, next);
    return true;
  }

  // Заглушка: люк молчит, пока не кончится срок (g.plugs[клетка] = последний раунд)
  E.plugged = (g, cell) => !!(g.plugs && g.plugs[cell] >= g.round);
  function drawSpawn(g, point) {
    if (E.plugged(g, point)) { E.log(g, 'Заглушенный люк молчит.', 'good'); return; }
    if (!g.spawnDeck.length) { g.spawnDeck = Rng.shuffle(g, g.spawnDiscard); g.spawnDiscard = []; }
    const id = g.spawnDeck.shift();
    if (!id) return;
    g.spawnDiscard.push(id);
    g.poolMoved = {};
    const card = ZG.SpawnCards.get(id);
    E.fx(g, { t: 'spawncard', card: id, pos: point });
    if (card.event) { E.log(g, `Событие: ${card.name}. ${card.text}`, 'warn'); card.run(g, E, point); return; }
    const lvl = ZG.Levels.get(g.levelId);
    const row = card.rowFn ? card.rowFn(g, E) : card.rows[E.phase(g)]; // rowFn — карта с особым порядком появления
    (lvl.spawnPerCard ? row.slice(0, lvl.spawnPerCard) : row).forEach((type) => E.spawnZombie(g, type, point)); // облегчённые уровни: меньше зомби с карты
  }

  // ---------------------------------------------------- фаза зомби (автомат)
  function startZombiePhase(g) {
    g.phase = 'zombies';
    g.active = null; g.turn = null;
    g.zs = { step: 'move', queue: null, wander: 1 + Rng.int(g, 6) };
    E.log(g, `— Фаза зомби (раунд ${g.round}) —`, 'phase');
    E.perceive(g);
    E.fx(g, { t: 'phase', name: 'zombies' });
    runZombies(g);
  }

  function runZombies(g) {
    while (g.phase === 'zombies' && !g.pending && !g.result) {
      const zs = g.zs;
      if (zs.step === 'move') {
        // волнами: все зомби делают по шагу одновременно, затем следующий шаг — и так до макс. скорости
        const left = new Map();
        const goals = g.zs.goals = {}; // цель каждого зомби выбирается один раз за фазу
        g.zombies.forEach((z) => { const sp = g.stealth && !z.awake ? 1 : E.zombieSpeed(g, z); /* бродячие — шаг за фазу */ if (!ZG.Zombies.get(z.type).immobile && !z.suppressed && sp > 0) left.set(z, sp); });
        for (let wave = 0; left.size; wave++) {
          if (wave) E.fx(g, { t: 'zwave' });
          [...left.keys()].forEach((z) => {
            if (!g.zombies.includes(z) || !moveZombieStep(g, z, goals) || left.get(z) <= 1) left.delete(z);
            else left.set(z, left.get(z) - 1);
          });
        }
        E.perceive(g); // добрели до героя — заметили
        zs.step = 'attack';
      } else if (zs.step === 'attack') {
        if (!zs.queue) zs.queue = buildAttacks(g);
        if (zs.queue.length) { prepareBlock(g, zs.queue[0]); continue; }
        zs.step = 'special';
      } else if (zs.step === 'special') {
        const horde = ZG.Levels.get(g.levelId).hordeAlarm;
        const mobile = g.zombies.filter((z) => !ZG.Zombies.get(z.type).immobile && !E.isBandit(z)).length;
        if (horde && mobile >= horde) E.raiseAlarm(g, 1, `Орда (${mobile} на поле) гудит`);
        g.zombies.slice().forEach((z) => {
          const def = ZG.Zombies.get(z.type);
          if (def.hooks && def.hooks.zombiePhase) def.hooks.zombiePhase(g, z, E);
        });
        g.zombies.filter((z) => E.isBandit(z)).forEach((z) => E.banditLoot(g, z));
        // Прорыв: если в закрытом тайле скопилось много зомби — он открывается сам
        const fb = ZG.Levels.get(g.levelId).fogBreak, lim = fb == null ? 4 : fb;
        if (g.revealed && lim) {
          g.board.tiles.forEach((t, ti) => {
            if (g.revealed[ti]) return;
            const n = E.fogTokens(g, ti, true); // по жетонам в стопке (пустышки тоже считаются)
            if (n >= lim) E.reveal(g, ti, 'Прорыв орды');
          });
        }
        zs.step = 'spawn';
      } else if (zs.step === 'spawn') {
        if (Mods.flag(g, null, 'noSpawn')) {
          E.log(g, 'Мёртвая тишина: никто не появляется.', 'good');
          zs.step = 'end';
          continue;
        }
        const th = E.alarmThreshold(g);
        let extra = 0;
        while (g.alarm >= th) { g.alarm -= th; extra++; }
        if (extra) {
          g.stats.waves += extra;
          E.log(g, `ВОЛНА! Тревога переполнена — из каждой точки появления лишняя карта (×${extra}).`, 'bad');
          E.fx(g, { t: 'wave' });
          if (g.stealth) {
            // орда знает, где все герои — до конца следующего раунда
            g.alertUntil = g.round + 1;
            E.log(g, 'Орда в ярости: все зомби знают, где вы (до конца следующего раунда)!', 'bad');
            E.perceive(g);
          }
        }
        g.spawnPoints.forEach((p) => { for (let k = 0; k <= extra; k++) drawSpawn(g, p); });
        zs.step = 'end';
      } else if (zs.step === 'end') {
        loseTrack(g);
        endRound(g);
      }
    }
  }

  // Голод: в фазы суток из level.hungerPhases все зомби ходят на 1 зону дальше
  E.zombieSpeed = function (g, z) {
    const def = ZG.Zombies.get(z.type);
    if (def.immobile) return 0;
    const lvl = ZG.Levels.get(g.levelId);
    return def.speed + ((lvl.hunger || {})[E.phase(g)] || 0) + Mods.value(g, null, 'zombieSpeed', 0);
  };

  function buildAttacks(g) {
    const byHero = {};
    // Теснота: одного героя за фазу кусают не больше maxAttackers зомби (самые опасные — первыми)
    const cap = ZG.Levels.get(g.levelId).maxAttackers || Infinity;
    const order = g.zombies.slice().sort((a, b) => ZG.Zombies.get(b.type).dmg - ZG.Zombies.get(a.type).dmg);
    const toHero = (z, h, def) => {
      if (E.scenario(g).onZombieAttack) E.scenario(g).onZombieAttack(g, z, h, E); // особые правила задания
      (byHero[h.idx] = byHero[h.idx] || { hero: h.idx, incoming: 0, attackers: [] });
      byHero[h.idx].incoming += def.dmg;
      g.stats.incoming = (g.stats.incoming || 0) + def.dmg;
      byHero[h.idx].attackers.push(z.uid);
      E.fx(g, { t: 'attack', zombie: z.uid, hero: h.idx, pos: z.pos, n: def.dmg });
    };
    order.forEach((z) => {
      const def = ZG.Zombies.get(z.type);
      if (!g.zombies.includes(z)) return; // погиб в этой же схватке
      if (def.dmg <= 0 || (g.stealth && !z.awake)) return;
      if (E.isBandit(z)) {
        // бандит: удар/выстрел по случайному врагу в зоне или по ближайшему на линии; выстрел слышен на 2 зоны
        const t = E.banditTarget(g, z, true);
        if (!t) return;
        g.stats.banditShots = (g.stats.banditShots || 0) + 1;
        E.storyEvent(g, 'firstBandit'); // первая атака бандита (или первый бандит на открытом тайле)
        if (t.shot) E.fx(g, { t: 'shot', hero: null, from: z.pos, to: t.pos });
        if (!def.quietAttack) E.hear(g, z.pos, 2);
        if (def.id === 'sniper') E.storyEvent(g, 'firstSniper');
        if (t.hero && t.shot && def.pierce) {
          // винтовка: выстрел не блокируется картами (спасают только укрытия)
          E.log(g, `${def.name} стреляет в ${E.heroName(t.hero)} — ${def.dmg} ${ZG.util.plural(def.dmg, 'Рана', 'Раны', 'Ран')}, блок не спасает!`, 'bad');
          E.fx(g, { t: 'wound', hero: t.hero.idx, pos: t.hero.pos, n: def.dmg });
          g.stats.incoming = (g.stats.incoming || 0) + def.dmg;
          addWounds(g, t.hero, def.dmg);
        } else if (t.hero) { E.log(g, `${def.name} ${t.shot ? 'стреляет в' : def.verb || 'бьёт'} ${E.heroName(t.hero)}!`, 'bad'); toHero(z, t.hero, def); }
        else { E.log(g, `${def.name} ${t.shot ? 'стреляет в' : 'бьёт'} зомби (${ZG.Zombies.get(t.foe.type).name}) — в голову!`, 'dim'); damageZombie(g, t.foe, def.foeDmg || def.dmg, null, 'shot'); }
        return;
      }
      let hs = E.heroesAt(g, z.pos).filter((h) => !h.hidden && !Mods.flag(g, h, 'immuneAttack', { type: z.type }) && !(byHero[h.idx] && byHero[h.idx].attackers.length >= cap));
      const bandits = E.foesOf(g, z).filter((o) => o.pos === z.pos);
      if (!hs.length && !bandits.length) return;
      if (hs.length) {
        const taunt = hs.filter((h) => Mods.flag(g, h, 'taunt'));
        if (taunt.length) hs = taunt;
        hs.sort((a, b) => E.hurtCount(g, a) - E.hurtCount(g, b) || a.idx - b.idx);
      }
      // герой и бандит для зомби равноценны: кого укусить — случайно
      const victims = (hs.length ? [{ hero: hs[0] }] : []).concat(bandits.map((b) => ({ foe: b })));
      const v = victims.length > 1 ? Rng.pick(g, victims) : victims[0];
      if (v.foe) { E.log(g, `${def.name} вгрызается в бандита!`, 'dim'); E.fx(g, { t: 'hit', zombie: v.foe.uid, pos: v.foe.pos, n: def.dmg, kind: 'bite' }); damageZombie(g, v.foe, def.dmg, null, 'bite'); return; }
      const h = v.hero;
      toHero(z, h, def);
    });
    return Object.values(byHero).sort((a, b) => a.hero - b.hero);
  }

  function blockValue(g, h, uid) {
    const d = E.cardDef(g, uid);
    if (d.kind === 'wound' || d.kind === 'cargo' || !d.shield) return 0;
    return d.shield + Mods.value(g, h, 'blockPerCard', 0);
  }
  E.blockValue = blockValue;

  function prepareBlock(g, entry) {
    const h = g.heroes[entry.hero];
    if (!h.onBoard) { g.zs.queue.shift(); return; }
    let rem = entry.incoming;
    const tok = Math.min(h.block, rem); h.block -= tok; rem -= tok;
    const auto = Math.min(rem, Mods.value(g, h, 'autoBlock', 0)); rem -= auto;
    entry.auto = tok + auto;
    entry.remaining = rem;
    if (rem > 0 && h.hand.some((u) => blockValue(g, h, u) > 0)) {
      g.pending = { type: 'block', hero: h.idx, incoming: entry.incoming, remaining: rem, auto: entry.auto, attackers: entry.attackers };
      return;
    }
    resolveBlock(g, []);
  }

  function resolveBlock(g, uids) {
    const entry = g.zs.queue.shift();
    const h = g.heroes[entry.hero];
    let blocked = 0;
    uids.forEach((u) => {
      const i = h.hand.indexOf(u);
      if (i < 0) return;
      const v = blockValue(g, h, u);
      if (v <= 0) return;
      blocked += v;
      h.hand.splice(i, 1);
      h.discard.push(u);
      E.fx(g, { t: 'blockcard', hero: h.idx, card: u });
    });
    const taken = Math.max(0, entry.remaining - blocked);
    const totalBlocked = entry.incoming - taken;
    if (totalBlocked > 0) E.fx(g, { t: 'blocked', hero: h.idx, pos: h.pos, n: totalBlocked });
    if (taken > 0) {
      E.log(g, `${E.heroName(h)} получает ${taken} ${ZG.util.plural(taken, 'Рану', 'Раны', 'Ран')} (атака ${entry.incoming}, отражено ${totalBlocked}).`, 'bad');
      E.fx(g, { t: 'wound', hero: h.idx, pos: h.pos, n: taken });
    } else E.log(g, `${E.heroName(h)} отражает атаку (${entry.incoming}).`, 'good');
    g.pending = null;
    if (taken >= 2) {
      // «Предатель»: укус (2+ урона) от зомби, которого разбудил или отвлёк другой герой
      const by = new Set();
      (entry.attackers || []).forEach((u) => { const z = E.zombie(g, u); if (z && z.wokenBy != null && z.wokenBy !== h.idx) by.add(z.wokenBy); });
      by.forEach((i) => { if (g.heroes[i]) ms(g.heroes[i], 'betrayals'); });
    }
    bite(g, h, taken, entry.attackers);
    if (h.onBoard && h.thorns) {
      entry.attackers.forEach((u) => { const z = E.zombie(g, u); if (z) damageZombie(g, z, h.thorns, h.idx, 'melee'); });
    }
    if (h.onBoard) Mods.emit(g, h, 'afterBlock', { incoming: entry.incoming, taken, E });
  }

  function endRound(g) {
    const sc = E.scenario(g);
    if (sc.roundEnd) sc.roundEnd(g, E);
    // газ из события взрывается в конце раунда
    if (g.hazard) {
      const p = g.hazard.pos;
      E.log(g, 'Газ взрывается!', 'warn');
      E.fx(g, { t: 'explode', pos: p });
      killOrder(g, E.zombiesAt(g, p), g.hazard.dmg).forEach((z) => damageZombie(g, z, g.hazard.dmg, null, 'fire'));
      E.heroesAt(g, p).forEach((h) => { E.log(g, `${E.heroName(h)} задет взрывом.`, 'bad'); addWounds(g, h, 1); });
      g.hazard = null;
      if (g.result) return;
    }
    if (g.survivor && g.round >= g.survivor.until) { E.log(g, 'Крики стихли — выжившего не спасли.', 'dim'); g.survivor = null; }
    g.event = null;
    g.lures = [];
    g.noise = {};
    g.loud = {};
    g.relaySuit = null;
    g.zombies.forEach((z) => { z.suppressed = false; if (!ZG.Zombies.get(z.type).big) z.dmg = 0; });
    if (g.round >= E.maxRounds(g)) {
      finish(g, false, E.scenario(g).timeoutText || 'Рассвет не наступил: Орда поглотила квартал.');
      return;
    }
    g.round++;
    g.phase = 'heroes';
    g.zs = null;
    g.heroes.forEach((h) => { h.acted = !h.onBoard; });
    const ph = E.phase(g);
    if (ph !== E.phase(g, g.round - 1)) {
      E.log(g, `Наступает ${ZG.PHASES[ph].name}. Мертвецов станет больше.`, 'bad');
      E.fx(g, { t: 'dayphase', phase: ph });
      if (ph === 1) E.storyEvent(g, 'night');
    }
    E.log(g, `— Раунд ${g.round} из ${E.maxRounds(g)} —`, 'phase');
    E.fx(g, { t: 'phase', name: 'heroes', round: g.round });
    rollEvent(g);
  }

  // События раунда: кубик d6, на 6 — карта события (колода без повторов, потом перемешивается)
  function rollEvent(g) {
    const lvl = ZG.Levels.get(g.levelId);
    if (!lvl.events || !lvl.events.length || g.round < 2) return;
    const roll = 1 + Rng.int(g, 6);
    if (roll < 7 - Math.round((lvl.eventChance || 0) * 6)) return; // затишье
    if (!g.eventDeck.length) g.eventDeck = Rng.shuffle(g, lvl.events.slice());
    const id = g.eventDeck.shift();
    const ev = ZG.Events.get(id);
    g.event = id;
    g.stats.events = (g.stats.events || 0) + 1;
    E.log(g, `Событие: «${ev.name}». ${ev.text}`, ev.tone < 0 ? 'bad' : 'warn');
    E.fx(g, { t: 'event', id });
    if (ev.start) ev.start(g, E);
  }
  E.rollEvent = rollEvent;

  // ============================================================== ход героя
  function beginTurn(g, idx) {
    const h = g.heroes[idx];
    g.active = idx;
    g.turnHero = idx; // чей ход был последним (для ИИ: его секретная миссия)
    h.block = 0;
    h.thorns = 0;
    h.hidden = false;
    h.lurk = false;
    g.turn = { lastSuit: g.relaySuit || null, relay: g.relaySuit || null, played: 0, moves: 0, searched: 0, healUsed: 0, gave: false, meleeDone: false, rangedPlayed: false, mindPlayed: false, shots: 0 };
    const hs = E.handSize(g, h);
    const cap = ZG.Levels.get(g.levelId).drawMax || 99;
    g.turn.starting = true;
    if (h.hand.length < hs) drawCards(g, h, Math.min(cap, hs - h.hand.length));
    g.turn.starting = false;
    let en = Mods.value(g, h, 'energy', ZG.Heroes.get(h.id).energy) + h.adrenaline;
    if (E.hurtCount(g, h) === E.maxHp(g, h) - 1) {
      en += 1;
      E.log(g, `${E.heroName(h)} на грани — +1 ⚡.`, 'warn');
    }
    h.adrenaline = 0;
    if (h.drainDue) { en = Math.max(0, en - h.drainDue); E.log(g, `${E.heroName(h)}: «Уныние» — −${h.drainDue} ⚡.`, 'warn'); h.drainDue = 0; }
    h.energy = en;
    if (g.relayBonus) { h.energy += g.relayBonus; E.log(g, `${E.heroName(h)}: +${g.relayBonus} ⚡ от товарища.`, 'good'); g.relayBonus = 0; }
    E.log(g, `Ход: ${E.heroName(h)} (${h.energy} ⚡).`, 'turn');
    E.fx(g, { t: 'turn', hero: idx });
    Mods.emit(g, h, 'turnStart', { E });
  }

  function endTurn(g) {
    const h = E.activeHero(g);
    E.perceive(g); // скрытность: зомби «оглядываются» в конце хода каждого героя (одно общее правило для всех)
    if (h && h.onBoard) {
      // «Невидимка»: ход засчитывается, только если зомби рядом (в 3 зонах), но ни один тебя не видит
      const d = E.distV(g, h.pos);
      const near = g.zombies.some((z) => !ZG.Zombies.get(z.type).immobile && !E.hidden(g, z.pos) && d[z.pos] <= 3);
      if (near && !g.zombies.some((z) => !ZG.Zombies.get(z.type).immobile && E.sees(g, Object.assign({}, z, { awake: true }), h))) ms(h, 'unseen');
    }
    if (h) {
      h.acted = true;
      // временные карты, уходящие в сброс в конце хода (Уныние)
      const gone = h.hand.filter((u) => ZG.Cards.get(g.cards[u]).discardEndTurn);
      if (gone.length) { h.hand = h.hand.filter((u) => !gone.includes(u)); h.discard.push(...gone); }
      tickInfection(g, h);
    }
    if (g.result) return;
    // Эстафета: следующий герой может продолжить Связку мастью последней карты
    g.relaySuit = g.turn && g.turn.played ? g.turn.lastSuit : null;
    g.active = null; g.turn = null;
    if (g.result) return;
    if (g.heroes.every((x) => x.acted || !x.onBoard)) startZombiePhase(g);
  }

  E.cardCost = function (g, h, uid) {
    const def = E.cardDef(g, uid);
    if (def.cost == null) return null;
    let c = Math.max(0, def.cost + Mods.value(g, h, 'costDelta', 0, { def }));
    // Хватка: выход из зоны с зомби стоит +1 ⚡ и для карт перемещения
    if (def.target && def.target.kind === 'move' && !def.target.free && !def.target.through) {
      if (E.gripBase(g, h) && !Mods.flag(g, h, 'freeEscape')) c++;
      c += E.gripExtra(g, h);
    }
    return c;
  };

  E.rangeOf = function (g, h, spec) {
    if (!spec.ranged) return spec.range;
    return Math.max(spec.range ? 1 : 0, spec.range + Mods.value(g, h, 'rangeBonus', 0));
  };

  function heroPass(g, h, through, climbSpec) {
    const climb = climbSpec || Mods.flag(g, h, 'climb');
    return (a, b) => {
      if (E.barricadeAt(g, a, b) && !climb) return false;
      if (!through && a !== h.pos && E.zombiesAt(g, a).length) return false;
      return true;
    };
  }

  // все цели для карты
  E.targetsFor = function (g, h, def) {
    const spec = def.target;
    if (!spec) return [null];
    const b = g.board;
    switch (spec.kind) {
      case 'zombie': {
        if (spec.range === 0 && !spec.ranged) return E.zombiesAt(g, h.pos).map((z) => z.uid);
        const R = E.rangeOf(g, h, spec);
        const cells = E.line(g, h.pos, R).filter((c) => c.dist >= (spec.min || 0)).map((c) => c.cell);
        return g.zombies.filter((z) => cells.includes(z.pos)).map((z) => z.uid);
      }
      case 'zone': {
        const R = E.rangeOf(g, h, spec);
        return E.line(g, h.pos, R).filter((c) => c.dist >= (spec.min || 0) && E.zombiesAt(g, c.cell).length).map((c) => c.cell);
      }
      case 'move': {
        const pass = heroPass(g, h, spec.through, spec.climb);
        const d = E.distV(g, h.pos, pass);
        return b.cells.filter((c) => d[c.i] >= 1 && d[c.i] <= spec.steps).map((c) => c.i);
      }
      case 'hero': {
        const d = E.distV(g, h.pos);
        return g.heroes.filter((o) => o.onBoard && d[o.pos] <= spec.range && (spec.self || o !== h) && (!spec.wounded || E.woundCount(g, o) > 0 || (def.cures && E.infectCount(g, o) > 0))).map((o) => o.idx);
      }
      case 'cell': {
        const d = E.distV(g, h.pos);
        return b.cells.filter((c) => d[c.i] >= 1 && d[c.i] <= spec.range).map((c) => c.i);
      }
      case 'adjcell': return [h.pos].concat(b.adj[h.pos]).filter((c) => !E.hidden(g, c));
      case 'adj': {
        if (g.traps.length >= MAX_TRAPS) return [];
        return [h.pos].concat(b.adj[h.pos]).filter((c) => !E.hidden(g, c) && !g.traps.some((t) => t.pos === c));
      }
      case 'edge': {
        if (g.barricades.length >= MAX_BARRICADES) return [];
        return b.adj[h.pos].filter((n) => !E.hidden(g, n) && !E.barricadeAt(g, h.pos, n));
      }
      default: return [];
    }
  };

  // Хват в зоне: выход стоит ещё +1 ⚡ («Дымовая шашка» снимает Хватку в зоне до конца хода)
  E.plugCost = (g, h) => Math.max(0, 1 + Mods.value(g, h, 'plugCost', 0));
  // в скрытности держат только охотники (бродячий героя не заметил — и не хватает)
  const grabbers = (g, h) => (g.turn && g.turn.noGrip === h.pos ? [] : E.zombiesAt(g, h.pos).filter((z) => !g.stealth || z.awake));
  E.gripExtra = (g, h) => (grabbers(g, h).some((z) => ZG.Zombies.get(z.type).grip) ? 1 : 0);
  E.gripBase = (g, h) => (grabbers(g, h).length ? 1 : 0);
  function moveCost(g, h, to) {
    let c = 1;
    if (!Mods.flag(g, h, 'freeEscape') && E.gripBase(g, h)) c++;
    c += E.gripExtra(g, h);
    if (!Mods.flag(g, h, 'climb') && E.barricadeAt(g, h.pos, to)) c++;
    if (g.turn.moves === 0 && Mods.flag(g, h, 'freeFirstMove')) c--;
    return Math.max(0, c);
  }
  E.moveCost = moveCost;
  function searchCost(g, h) { return g.turn.searched === 0 && Mods.flag(g, h, 'freeFirstSearch') ? 0 : 1; }
  function barricadeCost(g, h) { return Math.max(0, 2 + Mods.value(g, h, 'barricadeCost', 0)); }
  E.searchCost = searchCost;
  E.barricadeCost = barricadeCost;

  function searchableHere(g, h) {
    if (E.zombiesAt(g, h.pos).length) return false;
    return g.crates.some((c) => c.pos === h.pos && !c.opened) || g.search.some((s) => s.pos === h.pos);
  }
  E.searchableHere = searchableHere;

  // =========================================================== список действий
  E.legal = function (g) {
    const out = [];
    if (g.result) return out;
    if (g.pending) {
      if (g.pending.type === 'talent') g.pending.options.forEach((id) => out.push({ t: 'talent', id }));
      if (g.pending.type === 'block') out.push({ t: 'block', cards: [] });
      if (g.pending.type === 'loot') g.pending.options.forEach((id) => out.push({ t: 'loot', id }));
      return out;
    }
    if (g.phase !== 'heroes') return out;
    const h = E.activeHero(g);
    if (!h) {
      g.heroes.forEach((x) => { if (x.onBoard && !x.acted) out.push({ t: 'begin', hero: x.idx }); });
      return out;
    }
    out.push({ t: 'end' });
    // карты
    const seen = new Set();
    h.hand.forEach((uid) => {
      const def = E.cardDef(g, uid);
      if (def.unplayable || def.cost == null) return;
      if (seen.has(def.id)) return;
      seen.add(def.id);
      if (E.cardCost(g, h, uid) > h.energy) return;
      E.targetsFor(g, h, def).forEach((t) => out.push({ t: 'play', card: uid, target: t }));
    });
    // базовые
    g.board.adj[h.pos].forEach((n) => { if (!E.hidden(g, n) && moveCost(g, h, n) <= h.energy) out.push({ t: 'move', to: n }); });
    E.fogNeighbors(g, h.pos).forEach((n) => { if (moveCost(g, h, n) <= h.energy) out.push({ t: 'move', to: n, explore: true }); });
    if (searchableHere(g, h) && searchCost(g, h) <= h.energy) out.push({ t: 'search' });
    if (h.energy >= 1) E.zombiesAt(g, h.pos).forEach((z) => out.push({ t: 'punch', zombie: z.uid }));
    if (h.energy >= 1 && g.drops.some((d) => d.pos === h.pos)) out.push({ t: 'pickup' });
    if (h.energy >= barricadeCost(g, h) && g.barricades.length < MAX_BARRICADES) {
      g.board.adj[h.pos].forEach((n) => { if (!E.barricadeAt(g, h.pos, n)) out.push({ t: 'barricade', to: n }); });
    }
    if (Mods.flag(g, h, 'healAction') && g.turn.healUsed < Mods.value(g, h, 'healAction', 0) && h.energy >= 1) {
      E.heroesAt(g, h.pos).forEach((o) => {
        if (E.woundCount(g, o) > 0) out.push({ t: 'heal', hero: o.idx });
        if (E.infectCount(g, o)) out.push({ t: 'cleanse', hero: o.idx });
      });
    }
    if (h.energy >= 3 && h.hand.some((u) => g.cards[u] === 'wound') && !E.zombiesAt(g, h.pos).length) out.push({ t: 'rest' });
    // «Выстрел из ТТ»: базовое действие надетого «Ствола бандита», раз за ход
    if (Mods.flag(g, h, 'ttShot') && !g.turn.ttShot && h.energy >= 1) E.targetsFor(g, h, ZG.Cards.get('tt_shot')).forEach((t) => out.push({ t: 'ttshot', zombie: t }));
    if (g.missions && h.mission && !h.missionDone && !h.missionRedrawn && g.missionDeck.some((id) => id !== h.mission && E.missionFits(g, ZG.Missions.get(id)))) out.push({ t: 'mredraw' });
    if (Mods.flag(g, h, 'plugAction') && g.spawnPoints.includes(h.pos) && !E.plugged(g, h.pos) && h.energy >= E.plugCost(g, h)) out.push({ t: 'plug' });
    const bld = g.board.cells[h.pos].bld;
    if (g.doors && bld && h.energy >= 1 && E.entrances(g, bld).some(([a, b]) => g.doors[doorKey(a, b)])) out.push({ t: 'shut' });
    // Прижечь укус: 2 ⚡, себе или товарищу в своей зоне, даже рядом с зомби
    // прижечь укус — только там, где нет зомби: рядом с ними на это нет времени
    if (h.energy >= 2 && !E.zombiesAt(g, h.pos).length) E.heroesAt(g, h.pos).forEach((o) => { if (o.hand.some((u) => g.cards[u] === 'infection')) out.push({ t: 'burn', hero: o.idx }); });
    if (!g.turn.gave) {
      E.heroesAt(g, h.pos).forEach((o) => {
        if (o === h) return;
        h.hand.forEach((u) => { if (E.canGive(g, u)) out.push({ t: 'give', card: u, hero: o.idx }); });
      });
    }
    E.scenario(g).actions(g, h, E).forEach((a) => { if (a.cost <= h.energy) out.push({ t: 'scenario', key: a.key, cost: a.cost, label: a.label }); });
    if (E.isComplete(g) && h.pos === g.exit && E.canEvac(g, h)) out.push({ t: 'evac' });
    if (g.survivor && g.survivor.pos === h.pos && h.energy >= 1) out.push({ t: 'rescue' });
    return out;
  };

  // ============================================================= применение
  E.act = function (g, a) {
    if (g.result) return false;
    g.lastError = null;
    if (g.pending) {
      const p = g.pending;
      if (a.t === 'block' && p.type === 'block') { resolveBlock(g, a.cards || []); }
      else if (a.t === 'loot' && p.type === 'loot') {
        const i = p.options.indexOf(a.id);
        if (i < 0) return fail(g, 'Такой карты нет.');
        const rest = p.options.slice(); rest.splice(i, 1);
        g.pending = null;
        keepLoot(g, g.heroes[p.hero], a.id, rest);
      }
      else if (a.t === 'talent' && p.type === 'talent') {
        if (!p.options.includes(a.id)) return fail(g, 'Такого таланта нет в выборе.');
        const h = g.heroes[p.hero];
        h.talents.push(a.id);
        h.talentQueue.shift();
        g.pending = null;
        E.log(g, `${E.heroName(h)} получает талант «${ZG.Talents.get(a.id).name}».`, 'good');
        E.fx(g, { t: 'talent', hero: h.idx, id: a.id });
        queueTalent(g);
      } else return fail(g, 'Сначала нужно принять решение.');
      if (!g.pending) queueTalent(g);
      if (g.phase === 'zombies' && !g.pending) runZombies(g);
      E.checkMissions(g);
      return true;
    }
    if (g.phase !== 'heroes') return fail(g, 'Сейчас не фаза героев.');
    if (a.t === 'begin') {
      if (g.active != null) return fail(g, 'Ход уже идёт.');
      const h = g.heroes[a.hero];
      if (!h || !h.onBoard || h.acted) return fail(g, 'Этот герой уже ходил.');
      beginTurn(g, a.hero);
      return true;
    }
    const h = E.activeHero(g);
    if (!h) return fail(g, 'Выберите героя.');
    const ok = applyHeroAction(g, h, a);
    if (ok === false) return false;
    E.checkMissions(g);
    queueTalent(g);
    return true;
  };

  function fail(g, msg) { g.lastError = msg; return false; }

  function spend(g, h, n) { h.energy -= n; }

  function applyHeroAction(g, h, a) {
    switch (a.t) {
      case 'end': endTurn(g); return true;
      case 'play': return playCard(g, h, a.card, a.target);
      case 'move': {
        const explore = E.hidden(g, a.to) && E.fogNeighbors(g, h.pos).includes(a.to);
        if (!explore && (!g.board.adj[h.pos].includes(a.to) || E.hidden(g, a.to))) return fail(g, 'Туда не пройти.');
        const c = moveCost(g, h, a.to);
        if (c > h.energy) return fail(g, 'Не хватает энергии.');
        spend(g, h, c);
        g.turn.moves++;
        if (explore) {
          // разведка: открываем тайл; если путь перекрыт — герой остаётся на месте
          E.reveal(g, g.board.cells[a.to].tile, `${E.heroName(h)} разведывает квартал`);
          ms(h, 'reveals');
          if (!g.board.adj[h.pos].includes(a.to)) {
            E.log(g, 'За поворотом — стена. Пройти здесь нельзя.', 'warn');
            E.fx(g, { t: 'bump', hero: h.idx, pos: h.pos, to: a.to });
            return true;
          }
        }
        moveHero(g, h, a.to);
        return true;
      }
      case 'search': {
        if (!searchableHere(g, h)) return fail(g, 'Здесь нечего обыскивать (или мешают зомби).');
        const c = searchCost(g, h);
        if (c > h.energy) return fail(g, 'Не хватает энергии.');
        spend(g, h, c);
        g.turn.searched++;
        ms(h, 'searches');
        doSearch(g, h);
        return true;
      }
      case 'punch': {
        if (h.energy < 1) return fail(g, 'Не хватает энергии.');
        const z = E.zombie(g, a.zombie);
        if (!z || z.pos !== h.pos) return fail(g, 'Цель вне досягаемости.');
        spend(g, h, 1);
        const bonus = Mods.value(g, h, 'meleeBonus', 0, { kind: 'melee' });
        g.turn.meleeDone = true;
        E.log(g, `${E.heroName(h)} бьёт голыми руками.`, 'dim');
        damageZombie(g, z, 1 + bonus, h.idx, 'melee');
        return true;
      }
      case 'pickup': {
        const d = g.drops.find((x) => x.pos === h.pos);
        if (!d || h.energy < 1) return fail(g, 'Нечего поднять.');
        spend(g, h, 1);
        g.drops.splice(g.drops.indexOf(d), 1);
        const u = E.newUid(g, 'c'); g.cards[u] = d.card; h.hand.push(u);
        if (d.carried) { g.carried[u] = d.carried; g.carriedHolders[u] = (d.holders || []).concat(h.id); } // принесённая карта сохраняет износ
        E.log(g, `${E.heroName(h)} подбирает: «${ZG.Cards.get(d.card).name}».`, 'good');
        if (ZG.Cards.get(d.card).kind === 'cargo') E.storyEvent(g, 'cargo');
        return true;
      }
      case 'barricade': {
        const c = barricadeCost(g, h);
        if (c > h.energy || E.barricadeAt(g, h.pos, a.to) || !g.board.adj[h.pos].includes(a.to)) return fail(g, 'Нельзя поставить баррикаду.');
        if (g.barricades.length >= MAX_BARRICADES) return fail(g, 'Жетоны баррикад закончились.');
        spend(g, h, c);
        placeBarricade(g, h, a.to, 3);
        return true;
      }
      case 'heal': {
        const o = g.heroes[a.hero];
        if (!Mods.flag(g, h, 'healAction') || g.turn.healUsed >= Mods.value(g, h, 'healAction', 0) || h.energy < 1 || o.pos !== h.pos) return fail(g, 'Нельзя.');
        spend(g, h, 1);
        g.turn.healUsed++;
        const n = healWounds(g, o, 1 + Mods.value(g, h, 'healBonus', 0));
        if (o !== h) ms(h, 'helps');
        E.log(g, `${E.heroName(h)} обрабатывает раны: ${E.heroName(o)} −${n} Рана.`, 'good');
        return true;
      }
      case 'cleanse': {
        const o = g.heroes[a.hero];
        if (!Mods.flag(g, h, 'healAction') || g.turn.healUsed >= Mods.value(g, h, 'healAction', 0) || h.energy < 1 || o.pos !== h.pos) return fail(g, 'Нельзя.');
        const inf = o.hand.concat(o.deck, o.discard).filter((u) => g.cards[u] === 'infection');
        if (!inf.length) return fail(g, 'Заражений нет.');
        spend(g, h, 1);
        g.turn.healUsed++;
        inf.forEach((u) => { g.cards[u] = 'wound'; });
        if (o !== h) ms(h, 'helps');
        E.log(g, `${E.heroName(h)} вскрывает и прижигает укус: у ${E.heroName(o)} ${inf.length} Заражение → Рана.`, 'good');
        E.fx(g, { t: 'heal', hero: o.idx, n: inf.length, pos: o.pos });
        checkFall(g, o);
        return true;
      }
      case 'burn': {
        const o = g.heroes[a.hero];
        const bites = o ? o.hand.filter((u) => g.cards[u] === 'infection') : [];
        if (E.zombiesAt(g, h.pos).length) return fail(g, 'Рядом зомби — прижечь укус не дадут. Нужна зона без врагов.');
        if (h.energy < 2 || !bites.length || o.pos !== h.pos) return fail(g, 'Прижечь нельзя.');
        spend(g, h, 2);
        bites.forEach((u) => { g.cards[u] = 'wound'; });
        if (o !== h) ms(h, 'helps');
        E.log(g, `${E.heroName(h)} прижигает укус${o === h ? '' : ` у ${E.heroName(o)}`}: Заражение → Рана.`, 'good');
        E.fx(g, { t: 'heal', hero: o.idx, n: 0, pos: o.pos });
        return true;
      }
      case 'mredraw': return E.redrawMission(g, h) || fail(g, 'Сменить миссию уже нельзя.');
      case 'plug': {
        const cost = E.plugCost(g, h);
        if (!Mods.flag(g, h, 'plugAction') || !g.spawnPoints.includes(h.pos) || E.plugged(g, h.pos) || h.energy < cost) return fail(g, 'Заглушить нельзя.');
        spend(g, h, cost);
        const rounds = 2 + Mods.value(g, h, 'plugRounds', 0);
        (g.plugs = g.plugs || {})[h.pos] = g.round + rounds - 1;
        E.log(g, `${E.heroName(h)} заглушает люк на ${rounds} ${ZG.util.plural(rounds, 'раунд', 'раунда', 'раундов')}.`, 'good');
        E.fx(g, { t: 'plug', pos: h.pos, hero: h.idx });
        makeNoise(g, h, h.pos, 1);
        if (Mods.flag(g, h, 'plugBonus')) { drawCards(g, h, 1); h.block += 1; }
        return true;
      }
      case 'shut': {
        const bld = g.board.cells[h.pos].bld;
        const open = bld ? E.entrances(g, bld).filter(([x, y]) => g.doors[doorKey(x, y)]) : [];
        if (h.energy < 1 || !open.length) return fail(g, 'Закрывать нечего.');
        spend(g, h, 1);
        open.forEach(([x, y]) => { delete g.doors[doorKey(x, y)]; E.fx(g, { t: 'door', a: x, b: y, open: false }); });
        E.log(g, `${E.heroName(h)} закрывает двери${E.sheltered(g, h) ? ' — в укрытии' : ''}.`, 'info');
        return true;
      }
      case 'rest': {
        if (h.energy < 3 || !h.hand.some((u) => g.cards[u] === 'wound') || E.zombiesAt(g, h.pos).length) return fail(g, 'Отдышаться нельзя.');
        spend(g, h, 3);
        const i = h.hand.findIndex((u) => g.cards[u] === 'wound');
        if (i >= 0) h.hand.splice(i, 1);
        E.log(g, `${E.heroName(h)} переводит дух и перевязывает рану.`, 'good');
        E.fx(g, { t: 'heal', hero: h.idx, n: 1, pos: h.pos });
        return true;
      }
      case 'give': {
        const o = g.heroes[a.hero];
        const i = h.hand.indexOf(a.card);
        if (g.turn.gave || i < 0 || !o.onBoard || o.pos !== h.pos || o === h || !E.canGive(g, a.card)) return fail(g, 'Передать нельзя.');
        h.hand.splice(i, 1); o.hand.push(a.card);
        if (g.carriedHolders && g.carriedHolders[a.card]) g.carriedHolders[a.card].push(o.id); // кампания: износ учитывает всех, кто держал карту
        g.turn.gave = true;
        // помощь передачей: находку/груз — любому, любую карту — раненому; раз за ход и не одной и той же картой
        const cd = E.cardDef(g, a.card);
        g.helpedCards = g.helpedCards || {};
        if ((cd.loot || cd.kind === 'cargo' || E.hurtCount(g, o) > 0) && !g.turn.helpedGive && !g.helpedCards[a.card]) { g.turn.helpedGive = true; g.helpedCards[a.card] = 1; ms(h, 'helps'); }
        E.log(g, `${E.heroName(h)} передаёт «${E.cardDef(g, a.card).name}» → ${E.heroName(o)}.`, 'info');
        E.fx(g, { t: 'give', from: h.idx, to: o.idx, card: a.card });
        return true;
      }
      case 'scenario': {
        const acts = E.scenario(g).actions(g, h, E);
        const sa = acts.find((x) => x.key === a.key);
        if (!sa || sa.cost > h.energy) return fail(g, 'Нельзя.');
        spend(g, h, sa.cost);
        E.scenario(g).doAction(g, h, a.key, E);
        return true;
      }
      case 'ttshot': {
        const def = ZG.Cards.get('tt_shot');
        if (!Mods.flag(g, h, 'ttShot') || g.turn.ttShot || h.energy < 1 || !E.targetsFor(g, h, def).includes(a.zombie)) return fail(g, 'Нельзя.');
        spend(g, h, 1);
        g.turn.ttShot = true;
        E.log(g, `${E.heroName(h)} стреляет из ТТ.`, 'info');
        def.play(makeCtx(g, h, def, a.zombie, false, () => {}));
        return true;
      }
      case 'rescue': {
        if (!g.survivor || g.survivor.pos !== h.pos || h.energy < 1) return fail(g, 'Здесь некого спасать.');
        spend(g, h, 1);
        g.survivor = null;
        E.log(g, `${E.heroName(h)} спасает выжившего! Тот делится припасами.`, 'good');
        E.fx(g, { t: 'objective', pos: h.pos, text: 'СПАСЁН' });
        E.giveLoot(g, h);
        gainXp(g, h, 2);
        return true;
      }
      case 'evac': {
        if (!E.isComplete(g) || h.pos !== g.exit) return fail(g, 'Эвакуация ещё не готова.');
        if (!E.canEvac(g, h)) return fail(g, E.scenario(g).evacBlockedText || 'Сейчас уйти нельзя.');
        h.onBoard = false; h.evacuated = true;
        E.log(g, `${E.heroName(h)} эвакуируется!`, 'good');
        E.fx(g, { t: 'evac', hero: h.idx, pos: h.pos });
        checkEnd(g);
        if (!g.result) endTurn(g);
        return true;
      }
      default: return fail(g, 'Неизвестное действие.');
    }
  }

  function moveHero(g, h, to) {
    const from = h.pos;
    if (g.doors) {
      // двери по пути (карта может провести через несколько зон)
      // путь без тумана и без зомби; если его нет (например, «По крышам») — просто без тумана
      let d = Board.bfs(g.board, to, (a, b) => !E.hidden(g, b) && (b === from || !E.zombiesAt(g, b).length));
      if (!isFinite(d[from])) d = Board.bfs(g.board, to, (a, b) => !E.hidden(g, b));
      let cur = from;
      if (!isFinite(d[from]) && g.board.adj[from].includes(to)) openDoor(g, from, to, h);
      for (let k = 0; k < 12 && cur !== to && isFinite(d[cur]); k++) {
        const nx = g.board.adj[cur].find((n) => d[n] === d[cur] - 1);
        if (nx == null) break;
        openDoor(g, cur, nx, h);
        cur = nx;
      }
    }
    if (g.turn && E.zombiesAt(g, from).length) g.turn.escaped = true;
    h.pos = to;
    E.fx(g, { t: 'hmove', hero: h.idx, from, to });
    if (E.scenario(g).watch) E.scenario(g).watch(g, E); // ловушки задания срабатывают сразу при входе
  }

  function placeBarricade(g, h, to, baseHp) {
    const hp = baseHp + Mods.value(g, h, 'barricadeHp', 0);
    g.barricades.push({ a: h.pos, b: to, hp, max: hp });
    E.log(g, `${E.heroName(h)} ставит баррикаду (прочность ${hp}).`, 'info');
    E.fx(g, { t: 'barricade', a: h.pos, b: to });
  }

  function doSearch(g, h) {
    g.stats.searches++;
    const crate = g.crates.find((c) => c.pos === h.pos && !c.opened);
    if (crate) {
      crate.opened = true;
      if (crate.card) {
        const u = E.newUid(g, 'c'); g.cards[u] = crate.card; h.hand.push(u);
        E.log(g, `${E.heroName(h)} вскрывает ящик — внутри «${ZG.Cards.get(crate.card).name}»!`, 'good');
        gainXp(g, h, 1);
        E.fx(g, { t: 'crate', pos: h.pos, found: true, card: u, hero: h.idx });
        if (ZG.Cards.get(crate.card).kind === 'cargo') E.storyEvent(g, 'cargo');
        return;
      }
      E.log(g, `${E.heroName(h)} вскрывает ящик — пусто, но кое-что полезное нашлось.`, 'info');
      E.fx(g, { t: 'crate', pos: h.pos, found: false });
      lootFor(g, h, 0);
      return;
    }
    const s = g.search.find((x) => x.pos === h.pos);
    g.search.splice(g.search.indexOf(s), 1);
    lootFor(g, h, s.kind === 'armory' ? 1 : 0);
  }

  // Обыск: тяните 2 карты добычи (+бонусы), одну оставьте, остальные — под низ колоды
  function lootFor(g, h, extraDraw) {
    const n = 2 + extraDraw + Mods.value(g, h, 'searchDraw', 0);
    const got = [];
    for (let guard = 0; got.length < n && guard < 12; guard++) {
      const id = drawLootId(g);
      if (!id) break;
      if (ZG.Cards.get(id).event) {
        g.lootDiscard.push(id);
        const type = E.phase(g) >= 1 ? 'runner' : 'walker';
        E.log(g, `Засада! Из темноты выскакивает ${ZG.Zombies.get(type).name}.`, 'bad');
        E.fx(g, { t: 'ambush', pos: h.pos });
        E.spawnZombie(g, type, h.pos, null, true);
        break; // засада прерывает обыск
      }
      got.push(id);
    }
    if (!got.length) { E.log(g, 'Ничего полезного не найдено.', 'dim'); return; }
    if (got.length === 1) return keepLoot(g, h, got[0], []);
    g.pending = { type: 'loot', hero: h.idx, options: got };
  }
  function keepLoot(g, h, keep, rest) {
    rest.forEach((id) => g.lootDeck.push(id));
    const u = E.newUid(g, 'c'); g.cards[u] = keep; h.hand.push(u);
    E.log(g, `${E.heroName(h)} находит: «${ZG.Cards.get(keep).name}».`, 'good');
    E.fx(g, { t: 'loot', hero: h.idx, card: u, pos: h.pos });
  }

  // ============================================================ розыгрыш карты
  function playCard(g, h, uid, target) {
    const i = h.hand.indexOf(uid);
    if (i < 0) return fail(g, 'Карты нет в руке.');
    const def = E.cardDef(g, uid);
    if (def.unplayable) return fail(g, 'Эту карту нельзя сыграть.');
    const cost = E.cardCost(g, h, uid);
    if (cost > h.energy) return fail(g, 'Не хватает энергии.');
    const targets = E.targetsFor(g, h, def);
    if (!targets.some((t) => t === target)) return fail(g, 'Неверная цель.');
    spend(g, h, cost);
    h.hand.splice(i, 1);
    const chain = def.suit !== 'none' && g.turn.lastSuit === def.suit;
    g.stats.cardsPlayed++;
    if (chain) { g.stats.chains++; g.turn.chains = (g.turn.chains || 0) + 1; }
    E.log(g, `${E.heroName(h)} играет «${def.name}»${chain ? ' — СВЯЗКА!' : ''}.`, chain ? 'chain' : 'info');
    E.fx(g, { t: 'play', hero: h.idx, card: uid, chain, target, pos: h.pos });
    let dest = def.consumable ? 'removed' : 'discard';
    const c = makeCtx(g, h, def, target, chain, () => { dest = 'equip'; });
    def.play(c);
    if (dest === 'discard') h.discard.push(uid);
    else if (dest === 'equip') {
      h.equip.push(uid);
      if (h.equip.length > MAX_EQUIP) h.discard.push(h.equip.shift());
    }
    if (!g.turn) return true; // герой пал/обратился от эффекта карты
    g.turn.lastSuit = def.suit;
    g.turn.played++;
    if (def.tags && def.tags.includes('ranged')) g.turn.rangedPlayed = true;
    if (def.suit === 'mind') g.turn.mindPlayed = true;
    return true;
  }

  function makeCtx(g, h, def, target, chain, onEquip) {
    const c = {
      g, hero: h, def, target, chain, E,
      zombie: (uid) => E.zombie(g, uid),
      // опыт за связку — только у немногих уникальных карт героев (написано в их эффекте связки)
      chainXp() {
        if (!chain) return;
        E.log(g, `${E.heroName(h)}: связка — +1 🎖 опыта.`, 'good');
        gainXp(g, h, 1);
      },
      melee(uid, n) {
        const z = E.zombie(g, uid); if (!z) return;
        const dmg = n + Mods.value(g, h, 'meleeBonus', 0, { kind: 'melee', def });
        if (g.turn) g.turn.meleeDone = true;
        damageZombie(g, z, dmg, h.idx, 'melee');
      },
      rangedHit(uid, n) {
        const z = E.zombie(g, uid); if (!z) return;
        damageZombie(g, z, n + Mods.value(g, h, 'rangedBonus', 0, { kind: 'ranged', def }), h.idx, 'ranged');
      },
      zoneDamage(cell, n, opts) {
        opts = opts || {};
        let list = E.zombiesAt(g, cell).filter((z) => z.uid !== opts.exclude);
        const bonusKey = opts.kind === 'melee' ? 'meleeBonus' : opts.kind === 'ranged' ? 'rangedBonus' : null;
        const bonus = bonusKey ? Mods.value(g, h, bonusKey, 0, { kind: opts.kind, def }) : 0;
        list = killOrder(g, list, n + bonus);
        if (opts.max) list = list.slice(0, opts.max);
        E.fx(g, { t: 'zone', pos: cell, kind: opts.kind });
        list.forEach((z) => damageZombie(g, z, n + bonus, h.idx, opts.kind));
        if (opts.kind === 'melee' && g.turn) g.turn.meleeDone = true;
      },
      shot(n) {
        let noise = n + Mods.value(g, h, 'shotNoise', 0);
        if (g.turn && g.turn.shots === 0 && Mods.flag(g, h, 'firstShotQuiet')) noise--;
        if (g.turn) g.turn.shots++;
        E.fx(g, { t: 'shot', hero: h.idx, from: h.pos, to: typeof target === 'number' ? target : (E.zombie(g, target) || {}).pos });
        makeNoise(g, h, h.pos, Math.max(0, noise));
      },
      noise(n) { makeNoise(g, h, h.pos, n); },
      draw(n) { drawCards(g, h, n); },
      energy(n) { h.energy += n; E.fx(g, { t: 'energy', hero: h.idx, n }); },
      block(n, heroIdx) {
        const o = heroIdx != null ? g.heroes[heroIdx] : h;
        o.block += n;
        E.fx(g, { t: 'shield', hero: o.idx, pos: o.pos, n });
      },
      moveTo(cell) { moveHero(g, h, cell); },
      heal(heroIdx, n, cures) {
        const o = g.heroes[heroIdx];
        // «Стерильность» и т. п.: бонус к лечению убирает только Раны (Заражения — лишь по тексту самой карты)
        const healed = healWounds(g, o, n, cures) + healWounds(g, o, Mods.value(g, h, 'healBonus', 0));
        if (o !== h && healed) ms(h, 'helps');
        E.log(g, `${E.heroName(o)}: −${healed} ${ZG.util.plural(healed, 'Рана', 'Раны', 'Ран')}.`, 'good');
      },
      adrenaline(heroIdx, n) {
        const o = g.heroes[heroIdx];
        o.adrenaline += n;
        E.fx(g, { t: 'adrenaline', hero: o.idx, pos: o.pos, n });
      },
      lure(cell, alarm) {
        g.lures.push({ pos: cell });
        E.fx(g, { t: 'lure', pos: cell, from: h.pos });
        E.hear(g, cell, 3, h.idx);
        E.raiseAlarm(g, Math.max(0, alarm + Mods.value(g, h, 'noiseAlarm', 0)), 'Приманка');
      },
      trap(cell, dmg) {
        g.traps.push({ pos: cell, dmg: dmg + Mods.value(g, h, 'trapBonus', 0), owner: h.idx });
        E.fx(g, { t: 'trap', pos: cell });
      },
      barricade(cell, hp) { placeBarricade(g, h, cell, hp); },
      relayEnergy(n) { g.relayBonus = (g.relayBonus || 0) + n; },
      pin(uid) { const z = E.zombie(g, uid); if (z) { z.suppressed = true; E.fx(g, { t: 'suppress', pos: z.pos }); } },
      smoke(cell) {
        E.zombiesAt(g, cell).forEach((z) => {
          if (g.stealth && !ZG.Zombies.get(z.type).relentless) { if (z.awake) E.fx(g, { t: 'zsleep', zombie: z.uid, pos: z.pos }); z.awake = false; z.trail = null; }
          else if (!g.stealth) z.suppressed = true;
        });
        if (g.turn) g.turn.noGrip = cell;
        E.fx(g, { t: 'hidden', hero: h.idx, pos: cell });
        E.log(g, `${E.heroName(h)}: дымовая завеса!`, 'info');
      },
      carry(from, to) {
        const o = g.heroes.find((x) => x.onBoard && x !== h && x.pos === from);
        if (o) { moveHero(g, o, to); ms(h, 'helps'); E.log(g, `${E.heroName(h)} вытаскивает за собой ${E.heroName(o)}.`, 'info'); }
      },
      dropWoundFromHand() {
        const i = h.hand.findIndex((u) => g.cards[u] === 'wound');
        if (i >= 0) { h.hand.splice(i, 1); E.fx(g, { t: 'heal', hero: h.idx, n: 1, pos: h.pos }); }
      },
      suppress(cell) {
        E.zombiesAt(g, cell).forEach((z) => { z.suppressed = true; });
        E.fx(g, { t: 'suppress', pos: cell });
      },
      push(uid) {
        const z = E.zombie(g, uid);
        if (!z || ZG.Zombies.get(z.type).immobile || ZG.Zombies.get(z.type).static || z.post) return; // снайпера и часового с позиции не сдвинуть
        const opts = g.board.adj[z.pos].filter((n) => !E.barricadeAt(g, z.pos, n) && !E.heroesAt(g, n).length);
        if (opts.length) enterCell(g, z, opts[0]);
      },
      pull(radius) {
        const open = (a, b) => !E.barricadeAt(g, a, b);
        const d = E.distV(g, h.pos, open);
        g.zombies.slice().forEach((z) => {
          if (!g.zombies.includes(z) || d[z.pos] === 0 || d[z.pos] > radius || ZG.Zombies.get(z.type).immobile || ZG.Zombies.get(z.type).static || z.post) return;
          const next = g.board.adj[z.pos].find((n) => d[n] === d[z.pos] - 1 && open(z.pos, n));
          if (next != null) enterCell(g, z, next);
        });
      },
      thorns(n) { h.thorns = (h.thorns || 0) + n; },
      // беззвучное убийство (Нож в спину по бродячему): без шума, укрытие не выдаёт
      silentKill(uid) {
        const z = E.zombie(g, uid); if (!z) return;
        if (g.turn) g.turn.meleeDone = true;
        E.log(g, `${E.heroName(h)} бесшумно убирает ${ZG.Zombies.get(z.type).name}.`, 'good');
        damageZombie(g, z, 99, h.idx, 'silent');
      },
      // брошенный камешек: жетон шума без Тревоги, слышен на radius зон
      pebble(cell, radius) {
        g.noise[cell] = (g.noise[cell] || 0) + 1;
        E.fx(g, { t: 'lure', pos: cell, from: h.pos });
        E.fx(g, { t: 'noise', pos: cell, n: 1 });
        E.hear(g, cell, radius, h.idx);
      },
      status(key) { if (key === 'hidden') { h.hidden = true; E.fx(g, { t: 'hidden', hero: h.idx, pos: h.pos }); } },
      equip() { onEquip(); E.log(g, `${E.heroName(h)} надевает: ${def.name}.`, 'info'); },
      burnHeroes(cell, n) {
        E.heroesAt(g, cell).forEach((o) => { E.log(g, `${E.heroName(o)} обжигается.`, 'bad'); addWounds(g, o, n); });
      },
    };
    return c;
  }

  // поиск цели для ИИ и подсказок
  E.goalFor = function (g, h) {
    if (E.isComplete(g)) return g.exit;
    const sg = E.scenario(g).botGoal(g, h, E);
    return sg == null ? g.exit : sg;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
