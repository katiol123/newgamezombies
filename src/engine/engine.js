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
  const XP_LEVELS = [4, 10];
  const MAX_BARRICADES = 4;
  const MAX_TRAPS = 3;
  const MAX_EQUIP = 2;

  const E = {};
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
  E.maxHp = (g, h) => Mods.value(g, h, 'hp', ZG.Heroes.get(h.id).hp);
  // «Одиночка»: в соло герой держит на 1 карту больше
  E.handSize = (g, h) => Mods.value(g, h, 'handSize', ZG.Heroes.get(h.id).hand) + (g.heroes.length === 1 ? 1 : 0);
  E.activeHero = (g) => (g.active == null ? null : g.heroes[g.active]);
  E.maxRounds = (g) => Mods.value(g, null, 'maxRounds', ZG.Levels.get(g.levelId).rounds);
  E.alarmThreshold = (g) => Math.max(3, Mods.value(g, null, 'alarmThreshold', ZG.Levels.get(g.levelId).alarmThreshold));
  E.phase = function (g, round) {
    const lvl = ZG.Levels.get(g.levelId);
    const r = (round || g.round) + Mods.value(g, null, 'phaseShift', 0);
    let p = 0;
    lvl.phaseStarts.forEach((s, i) => { if (r >= s) p = i; });
    return p;
  };
  E.scenario = (g) => ZG.Scenarios.get(g.scenarioId);
  E.isComplete = (g) => E.scenario(g).isComplete(g);
  E.barricadeAt = (g, a, b) => g.barricades.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  E.dist = (g, from, passable) => Board.bfs(g.board, from, passable);
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
    c.board = b; c.quiet = true;
    return c;
  };

  // ============================================================== создание
  E.create = function (opts) {
    const level = ZG.Levels.get(opts.levelId || 'outskirts');
    const seed = String(opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9));
    const g = {
      v: 1, seed, rng: Rng.seedFrom(seed), levelId: level.id,
      scenarioId: null, conditionId: null, difficultyId: opts.difficultyId || 'survivor',
      cards: {}, nextUid: 1, heroes: [], zombies: [], crates: [], search: [], drops: [],
      lures: [], traps: [], barricades: [], noise: {}, spawnPoints: [],
      lootDeck: [], lootDiscard: [], spawnDeck: [], spawnDiscard: [],
      round: 1, alarm: 0, phase: 'heroes', active: null, turn: null, pending: null, zs: null,
      obj: {}, result: null, quiet: !!opts.quiet,
      stats: { kills: 0, killsBy: {}, wounds: 0, searches: 0, waves: 0, spawned: 0, fell: 0, cardsPlayed: 0, chains: 0 },
      log: [], fx: [],
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
        acted: false, onBoard: true, fallen: false, evacuated: false, hidden: false, secondWindUsed: false,
      };
      def.deck.forEach((cid) => { const u = E.newUid(g, 'c'); g.cards[u] = cid; h.deck.push(u); });
      Rng.shuffle(g, h.deck);
      g.heroes.push(h);
    });

    placeStartExit(g, level);
    // колоды
    Object.entries(level.loot).forEach(([id, n]) => { for (let i = 0; i < n; i++) g.lootDeck.push(id); });
    Rng.shuffle(g, g.lootDeck);
    Object.entries(level.spawnDeck).forEach(([id, n]) => { for (let i = 0; i < n; i++) g.spawnDeck.push(id); });
    Rng.shuffle(g, g.spawnDeck);

    g.heroes.forEach((h) => { h.pos = g.start; });
    E.scenario(g).setup(g, E);
    placeSearch(g);
    const diff = ZG.Difficulties.get(g.difficultyId);
    if (diff.startWounds) g.heroes.forEach((h) => { for (let i = 0; i < diff.startWounds; i++) { const u = E.newUid(g, 'w'); g.cards[u] = 'wound'; h.deck.push(u); } Rng.shuffle(g, h.deck); });
    if (diff.startLoot) g.heroes.forEach((h) => { for (let i = 0; i < diff.startLoot; i++) E.giveLoot(g, h); });
    const cond = ZG.Conditions.get(g.conditionId);
    if (cond.setup) cond.setup(g, E);

    // начальное появление
    g.spawnPoints.forEach((p) => drawSpawn(g, p));
    E.log(g, `Уровень ${level.num}: ${level.name}. Задание — «${E.scenario(g).name}». Условие — «${cond.name}».`, 'title');
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
    const streets = b.cells.filter((c) => c.type === 'street');
    const minX = Math.min.apply(null, streets.map((c) => c.x)), maxX = Math.max.apply(null, streets.map((c) => c.x));
    g.start = Rng.pick(g, streets.filter((c) => c.x === minX)).i;
    g.exit = Rng.pick(g, streets.filter((c) => c.x === maxX && c.i !== g.start)).i;
    const n = level.spawnPoints[Math.min(4, g.heroes.length)] + Mods.value(g, null, 'spawnPointsBonus', 0);
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
  // Вышка: в здании на тайле среднего столбца (в ряду без старта, если можно)
  E.placeTower = function (g) {
    const b = g.board;
    const midX = Math.floor(b.tiles.reduce((m, t) => Math.max(m, t.tx), 0) / 2);
    const startRow = b.tiles[tileOf(g, g.start)].ty;
    const mids = b.tiles.map((t, i) => ({ t, i })).filter((x) => x.t.tx === midX).sort((x, y) => (x.t.ty === startRow) - (y.t.ty === startRow));
    for (const m of mids) {
      const c = b.cells.filter((x) => x.tile === m.i && x.type === 'building');
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
      E.fx(g, { t: 'draw', hero: h.idx, card: u });
    }
    return drawn;
  }

  function addWounds(g, h, n, silent) {
    for (let i = 0; i < n; i++) {
      const u = E.newUid(g, 'w'); g.cards[u] = 'wound'; h.discard.push(u);
    }
    if (!silent) g.stats.wounds += n;
    checkFall(g, h);
  }
  E.addWounds = addWounds;

  function healWounds(g, h, n) {
    let left = n;
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
    if (E.woundCount(g, h) < E.maxHp(g, h)) return;
    const saver = g.heroes.find((o) => o.onBoard && o.pos === h.pos && !o.secondWindUsed && Mods.flag(g, o, 'secondWind'));
    if (saver) {
      saver.secondWindUsed = true;
      healWounds(g, h, 2);
      E.log(g, `${E.heroName(saver)}: «Второе дыхание»! ${E.heroName(h)} остаётся в строю.`, 'good');
      return;
    }
    h.onBoard = false; h.fallen = true;
    g.stats.fell++;
    h.hand.filter((u) => ZG.Cards.get(g.cards[u]).kind === 'cargo').forEach((u) => g.drops.push({ pos: h.pos, card: g.cards[u] }));
    h.hand = h.hand.filter((u) => ZG.Cards.get(g.cards[u]).kind !== 'cargo');
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
  E.spawnZombie = function (g, type, pos, why, silent) {
    const pool = (ZG.Levels.get(g.levelId).pool || {})[type];
    if (pool && g.zombies.filter((x) => x.type === type).length >= pool) {
      // жетоны кончились: вместо появления каждый такой зомби делает лишний шаг
      E.log(g, `Жетоны «${ZG.Zombies.get(type).name}» кончились — все они делают лишний шаг!`, 'bad');
      g.zombies.filter((x) => x.type === type).forEach((x) => moveZombieStep(g, x));
      return null;
    }
    const z = { uid: E.newUid(g, 'z'), type, pos, dmg: 0, suppressed: false };
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
    const def = ZG.Zombies.get(z.type);
    const eff = Math.max(0, n - (def.armor || 0));
    if (!g.zombies.includes(z)) return false;
    z.dmg += eff;
    E.fx(g, { t: 'hit', zombie: z.uid, pos: z.pos, n: eff, kind });
    if (z.dmg >= def.hp) {
      g.zombies.splice(g.zombies.indexOf(z), 1);
      g.stats.kills++;
      g.stats.killsBy[z.type] = (g.stats.killsBy[z.type] || 0) + 1;
      E.fx(g, { t: 'kill', zombie: z.uid, pos: z.pos, ztype: z.type });
      if (heroIdx != null) {
        const h = g.heroes[heroIdx];
        gainXp(g, h, def.xp);
        Mods.emit(g, h, 'kill', { zombie: z, kind, E });
      }
      return true;
    }
    return false;
  }
  E.damageZombie = damageZombie;
  E.gainXp = function (g, h, n) { gainXp(g, h, n); };

  function gainXp(g, h, n) {
    const before = h.xp;
    h.xp += n;
    XP_LEVELS.forEach((lv, i) => {
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
    g.pending = { type: 'talent', hero: h.idx, options: ZG.Heroes.get(h.id).talents[tier].slice() };
  }

  E.retaliate = function (g, h, n) {
    const zs = killOrder(g, E.zombiesAt(g, h.pos), n);
    if (zs.length) { E.log(g, `${E.heroName(h)} отвечает ударом.`, 'good'); damageZombie(g, zs[0], n, h.idx, 'melee'); }
  };

  function enterCell(g, z, cell) {
    const from = z.pos;
    z.pos = cell;
    E.fx(g, { t: 'zmove', zombie: z.uid, from, to: cell });
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
      t.push({ pos: h.pos, noise: 1 + (g.noise[h.pos] || 0), wounds: E.woundCount(g, h), idx: h.idx });
    });
    g.lures.forEach((l) => t.push({ pos: l.pos, lure: true, noise: g.noise[l.pos] || 0, wounds: 99, idx: 99 }));
    g.traps.forEach((tr) => { if (tr.owner != null && Mods.flag(g, g.heroes[tr.owner], 'trapLure')) t.push({ pos: tr.pos, lure: true, noise: g.noise[tr.pos] || 0, wounds: 99, idx: 98 }); });
    return t;
  }

  function moveZombieStep(g, z) {
    const targets = zombieTargets(g, z);
    if (!targets.length) return false;
    if (targets.some((t) => t.pos === z.pos)) return false;
    const noBarr = (a, b) => !E.barricadeAt(g, a, b);
    let dz = E.dist(g, z.pos, noBarr);
    let viaBarricade = false;
    if (!targets.some((t) => dz[t.pos] < Infinity)) { dz = E.dist(g, z.pos); viaBarricade = true; }
    let best = null;
    targets.forEach((t) => {
      if (dz[t.pos] === Infinity) return;
      // ближайшая цель; ничья → приманка, затем больше шума, затем меньше Ран
      const key = (x) => [dz[x.pos], x.lure ? 0 : 1, -x.noise, x.wounds, x.idx];
      if (!best) { best = t; return; }
      const a = key(t), b = key(best);
      for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { if (a[i] < b[i]) best = t; break; } }
    });
    if (!best) return false;
    // Туман: зомби видит цель только на своём или соседнем (по стороне) тайле
    if (Mods.flag(g, null, 'fogTiles')) {
      const a = g.board.tiles[tileOf(g, z.pos)], b = g.board.tiles[tileOf(g, best.pos)];
      if (Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) > 1) return false;
    }
    const dt = E.dist(g, best.pos, viaBarricade ? null : noBarr);
    const next = g.board.adj[z.pos].find((n) => dt[n] === dt[z.pos] - 1 && (viaBarricade || noBarr(z.pos, n)));
    if (next == null) return false;
    const bar = E.barricadeAt(g, z.pos, next);
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
    enterCell(g, z, next);
    return true;
  }

  function drawSpawn(g, point) {
    if (!g.spawnDeck.length) { g.spawnDeck = Rng.shuffle(g, g.spawnDiscard); g.spawnDiscard = []; }
    const id = g.spawnDeck.shift();
    if (!id) return;
    g.spawnDiscard.push(id);
    const card = ZG.SpawnCards.get(id);
    E.fx(g, { t: 'spawncard', card: id, pos: point });
    if (card.event) { E.log(g, `Событие: ${card.name}. ${card.text}`, 'warn'); card.run(g, E); return; }
    const row = card.rows[E.phase(g)];
    row.forEach((type) => E.spawnZombie(g, type, point));
  }

  // ---------------------------------------------------- фаза зомби (автомат)
  function startZombiePhase(g) {
    g.phase = 'zombies';
    g.active = null; g.turn = null;
    g.zs = { step: 'move', queue: null };
    E.log(g, `— Фаза зомби (раунд ${g.round}) —`, 'phase');
    E.fx(g, { t: 'phase', name: 'zombies' });
    runZombies(g);
  }

  function runZombies(g) {
    while (g.phase === 'zombies' && !g.pending && !g.result) {
      const zs = g.zs;
      if (zs.step === 'move') {
        const order = g.zombies.slice();
        order.forEach((z) => {
          if (!g.zombies.includes(z)) return;
          const def = ZG.Zombies.get(z.type);
          if (def.immobile || z.suppressed) return;
          const speed = E.zombieSpeed(g, z);
          for (let s = 0; s < speed; s++) if (!moveZombieStep(g, z)) break;
        });
        zs.step = 'attack';
      } else if (zs.step === 'attack') {
        if (!zs.queue) zs.queue = buildAttacks(g);
        if (zs.queue.length) { prepareBlock(g, zs.queue[0]); continue; }
        zs.step = 'special';
      } else if (zs.step === 'special') {
        const horde = ZG.Levels.get(g.levelId).hordeAlarm;
        const mobile = g.zombies.filter((z) => !ZG.Zombies.get(z.type).immobile).length;
        if (horde && mobile >= horde) E.raiseAlarm(g, Math.floor(mobile / horde), `Орда (${mobile} на поле) гудит`);
        g.zombies.slice().forEach((z) => {
          const def = ZG.Zombies.get(z.type);
          if (def.hooks && def.hooks.zombiePhase) def.hooks.zombiePhase(g, z, E);
        });
        zs.step = 'spawn';
      } else if (zs.step === 'spawn') {
        const th = E.alarmThreshold(g);
        let extra = 0;
        while (g.alarm >= th) { g.alarm -= th; extra++; }
        if (extra) {
          g.stats.waves += extra;
          E.log(g, `ВОЛНА! Тревога переполнена — из каждой точки появления лишняя карта (×${extra}).`, 'bad');
          E.fx(g, { t: 'wave' });
        }
        g.spawnPoints.forEach((p) => { for (let k = 0; k <= extra; k++) drawSpawn(g, p); });
        zs.step = 'end';
      } else if (zs.step === 'end') {
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
    g.zombies.forEach((z) => {
      const def = ZG.Zombies.get(z.type);
      if (def.dmg <= 0) return;
      let hs = E.heroesAt(g, z.pos).filter((h) => !h.hidden && !Mods.flag(g, h, 'immuneAttack', { type: z.type }));
      if (!hs.length) return;
      const taunt = hs.filter((h) => Mods.flag(g, h, 'taunt'));
      if (taunt.length) hs = taunt;
      hs.sort((a, b) => E.woundCount(g, a) - E.woundCount(g, b) || a.idx - b.idx);
      const h = hs[0];
      (byHero[h.idx] = byHero[h.idx] || { hero: h.idx, incoming: 0, attackers: [] });
      byHero[h.idx].incoming += def.dmg;
      g.stats.incoming = (g.stats.incoming || 0) + def.dmg;
      byHero[h.idx].attackers.push(z.uid);
      E.fx(g, { t: 'attack', zombie: z.uid, hero: h.idx, pos: z.pos, n: def.dmg });
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
    addWounds(g, h, taken);
    if (h.onBoard && h.thorns) {
      entry.attackers.forEach((u) => { const z = E.zombie(g, u); if (z) damageZombie(g, z, h.thorns, h.idx, 'melee'); });
    }
    if (h.onBoard) Mods.emit(g, h, 'afterBlock', { incoming: entry.incoming, taken, E });
  }

  function endRound(g) {
    const sc = E.scenario(g);
    if (sc.roundEnd) sc.roundEnd(g, E);
    g.lures = [];
    g.noise = {};
    g.relaySuit = null;
    g.zombies.forEach((z) => { z.suppressed = false; if (!ZG.Zombies.get(z.type).big) z.dmg = 0; });
    if (g.round >= E.maxRounds(g)) {
      finish(g, false, 'Рассвет не наступил: Орда поглотила квартал.');
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
    }
    E.log(g, `— Раунд ${g.round} из ${E.maxRounds(g)} —`, 'phase');
    E.fx(g, { t: 'phase', name: 'heroes', round: g.round });
  }

  // ============================================================== ход героя
  function beginTurn(g, idx) {
    const h = g.heroes[idx];
    g.active = idx;
    h.block = 0;
    h.thorns = 0;
    h.hidden = false;
    g.turn = { lastSuit: g.relaySuit || null, relay: g.relaySuit || null, played: 0, moves: 0, searched: 0, healUsed: 0, gave: false, meleeDone: false, rangedPlayed: false, mindPlayed: false, shots: 0 };
    const hs = E.handSize(g, h);
    const cap = ZG.Levels.get(g.levelId).drawMax || 99;
    if (h.hand.length < hs) drawCards(g, h, Math.min(cap, hs - h.hand.length));
    let en = Mods.value(g, h, 'energy', ZG.Heroes.get(h.id).energy) + h.adrenaline;
    if (E.woundCount(g, h) === E.maxHp(g, h) - 1) {
      en += 1;
      E.log(g, `${E.heroName(h)} на грани — +1 ⚡.`, 'warn');
    }
    h.adrenaline = 0;
    h.energy = en;
    E.log(g, `Ход: ${E.heroName(h)} (${en} ⚡).`, 'turn');
    E.fx(g, { t: 'turn', hero: idx });
    Mods.emit(g, h, 'turnStart', { E });
  }

  function endTurn(g) {
    const h = E.activeHero(g);
    if (h) h.acted = true;
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
    if (def.target && def.target.kind === 'move' && !def.target.free && !def.target.through && E.zombiesAt(g, h.pos).length && !Mods.flag(g, h, 'freeEscape')) c++;
    return c;
  };

  E.rangeOf = function (g, h, spec) {
    if (!spec.ranged) return spec.range;
    return Math.max(spec.range ? 1 : 0, spec.range + Mods.value(g, h, 'rangeBonus', 0));
  };

  function heroPass(g, h, through) {
    const climb = Mods.flag(g, h, 'climb');
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
        const cells = Board.lineCells(b, h.pos, R).filter((c) => c.dist >= (spec.min || 0)).map((c) => c.cell);
        return g.zombies.filter((z) => cells.includes(z.pos)).map((z) => z.uid);
      }
      case 'zone': {
        const R = E.rangeOf(g, h, spec);
        return Board.lineCells(b, h.pos, R).filter((c) => c.dist >= (spec.min || 0) && E.zombiesAt(g, c.cell).length).map((c) => c.cell);
      }
      case 'move': {
        const pass = heroPass(g, h, spec.through);
        const d = E.dist(g, h.pos, pass);
        return b.cells.filter((c) => d[c.i] >= 1 && d[c.i] <= spec.steps).map((c) => c.i);
      }
      case 'hero': {
        const d = E.dist(g, h.pos);
        return g.heroes.filter((o) => o.onBoard && d[o.pos] <= spec.range && (spec.self || o !== h) && (!spec.wounded || E.woundCount(g, o) > 0)).map((o) => o.idx);
      }
      case 'cell': {
        const d = E.dist(g, h.pos);
        return b.cells.filter((c) => d[c.i] >= 1 && d[c.i] <= spec.range).map((c) => c.i);
      }
      case 'adj': {
        if (g.traps.length >= MAX_TRAPS) return [];
        return [h.pos].concat(b.adj[h.pos]).filter((c) => !g.traps.some((t) => t.pos === c));
      }
      case 'edge': {
        if (g.barricades.length >= MAX_BARRICADES) return [];
        return b.adj[h.pos].filter((n) => !E.barricadeAt(g, h.pos, n));
      }
      default: return [];
    }
  };

  function moveCost(g, h, to) {
    let c = 1;
    if (!Mods.flag(g, h, 'freeEscape') && E.zombiesAt(g, h.pos).length) c++;
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
    g.board.adj[h.pos].forEach((n) => { if (moveCost(g, h, n) <= h.energy) out.push({ t: 'move', to: n }); });
    if (searchableHere(g, h) && searchCost(g, h) <= h.energy) out.push({ t: 'search' });
    if (h.energy >= 1) E.zombiesAt(g, h.pos).forEach((z) => out.push({ t: 'punch', zombie: z.uid }));
    if (h.energy >= 1 && g.drops.some((d) => d.pos === h.pos)) out.push({ t: 'pickup' });
    if (h.energy >= barricadeCost(g, h) && g.barricades.length < MAX_BARRICADES) {
      g.board.adj[h.pos].forEach((n) => { if (!E.barricadeAt(g, h.pos, n)) out.push({ t: 'barricade', to: n }); });
    }
    if (Mods.flag(g, h, 'healAction') && g.turn.healUsed < Mods.value(g, h, 'healAction', 0) && h.energy >= 1) {
      E.heroesAt(g, h.pos).forEach((o) => { if (E.woundCount(g, o) > 0) out.push({ t: 'heal', hero: o.idx }); });
    }
    if (h.energy >= 3 && h.hand.some((u) => g.cards[u] === 'wound') && !E.zombiesAt(g, h.pos).length) out.push({ t: 'rest' });
    if (!g.turn.gave) {
      E.heroesAt(g, h.pos).forEach((o) => {
        if (o === h) return;
        h.hand.forEach((u) => { if (g.cards[u] !== 'wound') out.push({ t: 'give', card: u, hero: o.idx }); });
      });
    }
    E.scenario(g).actions(g, h, E).forEach((a) => { if (a.cost <= h.energy) out.push({ t: 'scenario', key: a.key, cost: a.cost, label: a.label }); });
    if (E.isComplete(g) && h.pos === g.exit) out.push({ t: 'evac' });
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
        if (!g.board.adj[h.pos].includes(a.to)) return fail(g, 'Туда не пройти.');
        const c = moveCost(g, h, a.to);
        if (c > h.energy) return fail(g, 'Не хватает энергии.');
        spend(g, h, c);
        g.turn.moves++;
        moveHero(g, h, a.to);
        return true;
      }
      case 'search': {
        if (!searchableHere(g, h)) return fail(g, 'Здесь нечего обыскивать (или мешают зомби).');
        const c = searchCost(g, h);
        if (c > h.energy) return fail(g, 'Не хватает энергии.');
        spend(g, h, c);
        g.turn.searched++;
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
        E.log(g, `${E.heroName(h)} подбирает груз.`, 'good');
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
        E.log(g, `${E.heroName(h)} обрабатывает раны: ${E.heroName(o)} −${n} Рана.`, 'good');
        return true;
      }
      case 'rest': {
        if (h.energy < 3) return fail(g, 'Нужно 3 ⚡.');
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
        if (g.turn.gave || i < 0 || !o.onBoard || o.pos !== h.pos || o === h) return fail(g, 'Передать нельзя.');
        h.hand.splice(i, 1); o.hand.push(a.card);
        g.turn.gave = true;
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
      case 'evac': {
        if (!E.isComplete(g) || h.pos !== g.exit) return fail(g, 'Эвакуация ещё не готова.');
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
    if (g.turn && E.zombiesAt(g, from).length) g.turn.escaped = true;
    h.pos = to;
    E.fx(g, { t: 'hmove', hero: h.idx, from, to });
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
    if (chain) g.stats.chains++;
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
      melee(uid, n) {
        const z = E.zombie(g, uid); if (!z) return;
        const dmg = n + Mods.value(g, h, 'meleeBonus', 0, { kind: 'melee', def });
        g.turn.meleeDone = true;
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
        if (opts.kind === 'melee') g.turn.meleeDone = true;
      },
      shot(n) {
        let noise = n + Mods.value(g, h, 'shotNoise', 0);
        if (g.turn.shots === 0 && Mods.flag(g, h, 'firstShotQuiet')) noise--;
        g.turn.shots++;
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
      heal(heroIdx, n) {
        const o = g.heroes[heroIdx];
        const healed = healWounds(g, o, n + Mods.value(g, h, 'healBonus', 0));
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
        E.raiseAlarm(g, Math.max(0, alarm + Mods.value(g, h, 'noiseAlarm', 0)), 'Приманка');
      },
      trap(cell, dmg) {
        g.traps.push({ pos: cell, dmg: dmg + Mods.value(g, h, 'trapBonus', 0), owner: h.idx });
        E.fx(g, { t: 'trap', pos: cell });
      },
      barricade(cell, hp) { placeBarricade(g, h, cell, hp); },
      suppress(cell) {
        E.zombiesAt(g, cell).forEach((z) => { z.suppressed = true; });
        E.fx(g, { t: 'suppress', pos: cell });
      },
      push(uid) {
        const z = E.zombie(g, uid);
        if (!z || ZG.Zombies.get(z.type).immobile) return;
        const opts = g.board.adj[z.pos].filter((n) => !E.barricadeAt(g, z.pos, n) && !E.heroesAt(g, n).length);
        if (opts.length) enterCell(g, z, opts[0]);
      },
      pull(radius) {
        const open = (a, b) => !E.barricadeAt(g, a, b);
        const d = E.dist(g, h.pos, open);
        g.zombies.slice().forEach((z) => {
          if (!g.zombies.includes(z) || d[z.pos] === 0 || d[z.pos] > radius || ZG.Zombies.get(z.type).immobile) return;
          const next = g.board.adj[z.pos].find((n) => d[n] === d[z.pos] - 1 && open(z.pos, n));
          if (next != null) enterCell(g, z, next);
        });
      },
      thorns(n) { h.thorns = (h.thorns || 0) + n; },
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
