/*
 * Режим кампании: состояние между миссиями (чистый JSON) и все его правила.
 * Правила — docs/CAMPAIGN.md, параметры и цены — src/data/campaign.js (ZG.CAMPAIGN).
 *
 * Поток: create() → startMission() даёт опции для Engine.create → партия →
 *        finishMission() разбирает итоги (износ, мораль, талоны, здоровье, выбывшие, блуждающие) →
 *        действия в убежище (sell/move/give/heal/repair/build/hire/setControl) → startMission() …
 * Все действия убежища возвращают null при успехе или текст ошибки.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const Rng = ZG.Rng;
  const CFG = () => ZG.CAMPAIGN;

  const C = {};

  // ------------------------------------------------------------ создание
  C.create = function (opts) {
    const seed = String(opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9));
    const c = {
      v: 1, seed, rng: Rng.seedFrom('camp-' + seed), name: opts.name || 'Кампания',
      created: Date.now(), updated: Date.now(),
      difficultyId: opts.difficultyId || 'survivor', players: opts.players || 1,
      squad: opts.heroes.length, missionNo: 0, chainLength: CFG().chain.length,
      status: 'ready', // ready — можно идти на миссию; mission — идёт миссия; over — провал; won — пройдена
      roster: [], fallen: [], wanderers: [], nextKey: 1, report: null, current: null, endReason: null,
    };
    opts.heroes.forEach((hs) => c.roster.push(newHero(c, hs.id, hs.player, hs.ai)));
    return c;
  };

  function newHero(c, id, player, ai) {
    return {
      id, player: player || 1, ai: !!ai, level: 1, xp: 0, talents: [], perks: [], missionsDone: [],
      injury: 0, morale: CFG().morale.start, talons: 0,
      equip: [], chest: [], junk: [], buildings: [], debt: null, missions: 0,
    };
  }
  function item(c, id, worn) { return { key: 'k' + c.nextKey++, id, worn: !!worn }; }

  C.hero = (c, id) => c.roster.find((h) => h.id === id);
  C.has = (h, talentId) => h.talents.includes(talentId);
  C.built = (h, b) => h.buildings.includes(b);
  C.equipCap = (h) => CFG().slots.equip + (C.has(h, 'sh_packer') ? 1 : 0);
  C.chestCap = (h) => (C.built(h, 'storage') ? CFG().slots.chestBig : CFG().slots.chest) + (C.has(h, 'sh_hoarder') ? 2 : 0);
  C.baseHp = (h) => ZG.Heroes.get(h.id).hp;
  C.hpTalents = (h) => h.talents.reduce((s, t) => { const m = ZG.Talents.get(t).mods; return s + (m && typeof m.hp === 'number' ? m.hp : 0); }, 0);
  C.hp = (h) => Math.max(1, C.baseHp(h) + C.hpTalents(h) - h.injury);
  C.price = (id) => {
    const d = ZG.Cards.get(id);
    if (d.campaignOnly) return null; // уникальные карты кампании не продаются
    return CFG().prices.sell[d.rarity || 'common'];
  };
  C.repairPrice = (id) => { const r = CFG().prices.repair; return typeof r === 'number' ? r : r[ZG.Cards.get(id).rarity || 'common']; };
  C.sellValue = (h) => h.chest.concat(h.junk, h.equip).reduce((s, it) => s + (C.price(it.id) || 0), 0);
  C.mission = (c) => ({ no: c.missionNo + 1, total: c.chainLength });
  // Отношения: шкала −3…+3 для каждой пары (Враги … Друзья); Друзья (+3) — Узы
  const pairKey = (a, b) => [a, b].sort().join('|');
  C.rel = (c, a, b) => (c.rel || {})[pairKey(a, b)] || 0;
  C.relName = (n) => (n >= 3 ? 'Друзья' : n >= 1 ? 'Приятели' : n <= -3 ? 'Враги' : n <= -1 ? 'Неприязнь' : 'Нейтрально');
  C.relSet = (c, a, b, n) => { c.rel = c.rel || {}; c.rel[pairKey(a, b)] = Math.max(-3, Math.min(3, n)); };
  C.bonds = (c) => Object.entries(c.rel || {}).filter(([k, n]) => n >= 3).map(([k]) => k.split('|')).filter(([a, b]) => C.hero(c, a) && C.hero(c, b));
  C.bondsOf = (c, id) => C.bonds(c).filter((p) => p.includes(id)).map((p) => (p[0] === id ? p[1] : p[0]));
  C.STASH = ['medkit', 'bandage_roll', 'energy', 'chocolate', 'canned', 'grenade'];
  C.missionDef = (c) => CFG().chain[Math.min(c.missionNo, CFG().chain.length - 1)] || {};

  // ------------------------------------------------------------ миссия
  // Опции для ZG.Engine.create: отряд из ростера, перенос героев, блуждающие угрозы.
  C.startMission = function (c, squadIds) {
    if (c.status !== 'ready') return { error: 'Кампания не готова к миссии.' };
    if (c.eventDraw && !c.eventDraw.done) C.resolveEvent(c, C.eventAI(c)); // нерешённое событие убежища решается «по-ИИ»
    const ids = squadIds || c.roster.slice(0, c.squad).map((h) => h.id);
    // героев можно взять меньше размера отряда (например, после потерь), но миссия считается на полный отряд
    if (!ids.length || ids.length > c.squad) return { error: `Нужно выбрать от 1 до ${c.squad} ${ZG.util.plural(c.squad, 'героя', 'героев', 'героев')}.` };
    if (ids.some((id) => !C.hero(c, id))) return { error: 'Этого героя нет в убежище.' };
    // хлам при выходе продаётся автоматически
    c.roster.forEach((h) => { h.junk.forEach((it) => { h.talons += C.price(it.id) || 0; }); h.junk = h.junk.filter((it) => C.price(it.id) == null); }); // уникальные карты кампании не продаются — остаются
    c.current = { squad: ids.slice(), seed: `${c.seed}-m${c.missionNo + 1}` };
    c.lastSquad = ids.slice();
    c.status = 'mission';
    c.updated = Date.now();
    const M = CFG().morale;
    const md = C.missionDef(c);
    return {
      seed: c.current.seed, difficultyId: c.difficultyId, fog: true, missions: true, partySize: c.squad,
      campaign: true, xpLevels: CFG().xpLevels.slice(),
      scenarioId: md.scenarioId, conditionId: md.conditionId, tileRules: md.tiles || null, levelId: md.levelId, special: md.special || null, stories: md.stories || null, missionTitle: md.name ? `Миссия ${c.missionNo + 1}: ${md.name}` : null,
      bonds: C.bonds(c).filter(([a, b]) => ids.includes(a) && ids.includes(b)),
      rel: Object.fromEntries(Object.entries(c.rel || {}).filter(([k]) => k.split('|').every((id) => ids.includes(id)))),
      wanderers: md.noWanderers ? (md.bosses || []) : c.wanderers.map((id) => 'turned_' + id).filter((t) => ZG.Zombies.has(t)).concat(md.bosses || []),
      heroes: ids.map((id) => {
        const h = C.hero(c, id);
        const temp = h.morale <= 0 ? ['despair', 'despair'] : h.morale <= M.low ? ['despair'] : h.morale >= M.max ? ['courage'] : [];
        return {
          id, player: h.player, ai: h.ai,
          carry: { level: h.level, xp: h.xp, talents: h.talents, talentQueue: h.talentQueue || [], perks: h.perks, missionsDone: h.missionsDone, injury: h.injury, cards: h.equip.map((it) => ({ key: it.key, id: it.id })), temp },
        };
      }),
    };
  };

  // Итоги миссии. Возвращает отчёт для экрана убежища (и кладёт его в c.report).
  C.finishMission = function (c, g) {
    if (c.status !== 'mission') return c.report; // итоги уже внесены
    const P = CFG().prices, M = CFG().morale;
    const rng = c; // Rng работает с объектом, у которого есть поле rng
    const res = g.result || { win: false, stars: 0, reason: 'Миссия прервана.' };
    const squad = c.current ? c.current.squad : g.heroes.map((h) => h.id);
    const rep = { missionNo: c.missionNo + 1, win: !!res.win, stars: res.stars || 0, reason: res.reason, heroes: {}, lost: [], wanderers: [] };
    const line = (id, text) => (rep.heroes[id] = rep.heroes[id] || { lines: [], talons: 0, morale: 0 }).lines.push(text);
    // памятные события кампании (для эпилога)
    c.flags = c.flags || {};
    const kb = (g.stats && g.stats.killsBy) || {};
    if (kb.bear) c.flags.bear = true;
    if (kb.forester) c.flags.forester = true;
    if (g.scenarioId === 'market' && g.obj && g.obj.butcherDead) c.flags.butcher = true;
    if (g.scenarioId === 'bridge' && res.win) c.flags.bridge = g.obj && g.obj.way === 'quiet' ? 'quiet' : 'force'; // как добыт ключ (или банда перебита)
    if (g.scenarioId === 'forest' && g.obj && g.obj.attempted) c.flags.signal = true;
    // история похода — для эпилога (главы по миссиям)
    (c.history = c.history || []).push({ no: c.missionNo + 1, scenarioId: g.scenarioId, win: !!res.win, stars: res.stars || 0 });
    if (g.scenarioId === 'wedding' && g.obj) c.flags.gleb = g.obj.rescued ? 'rescued' : g.obj.executed ? 'executed' : c.flags.gleb;
    const moraleAdd = (h, n, why) => { if (!n) return; h.morale += n; rep.heroes[h.id] = rep.heroes[h.id] || { lines: [], talons: 0, morale: 0 }; rep.heroes[h.id].morale += n; line(h.id, `${n > 0 ? '+' : ''}${n} мораль — ${why}`); };
    const talonsAdd = (h, n, why) => { if (!n) return; h.talons += n; rep.heroes[h.id] = rep.heroes[h.id] || { lines: [], talons: 0, morale: 0 }; rep.heroes[h.id].talons += n; line(h.id, `+${n} 🎫 — ${why}`); };

    // карты, принесённые из убежища: key → предмет (износ следует за картой, даже если её передали в бою)
    const carriedItems = {}, carriedBy = {};
    squad.forEach((id) => { const h = C.hero(c, id); if (h) h.equip.forEach((it) => { carriedItems[it.key] = it; carriedBy[it.key] = h; }); });
    // шанс поломки — худший среди всех героев, в чьих руках карта побывала за миссию (передачи не обходят износ)
    const handy = (id) => { const gh = g.heroes.find((x) => x.id === id); return !!gh && gh.talents.includes('sh_handy'); };
    const breakChance = (ids) => Math.max(...ids.map((id) => (handy(id) ? 0.25 : CFG().breakChance)));

    // отношения на начало миссии (мораль при потере, вражда в отряде)
    const relBefore = {};
    squad.forEach((a, i) => squad.slice(i + 1).forEach((b) => { relBefore[pairKey(a, b)] = C.rel(c, a, b); }));
    const relOf = (a, b) => relBefore[pairKey(a, b)] || 0;

    // 1) судьба участников
    const deaths = [];
    g.heroes.forEach((gh) => {
      const h = C.hero(c, gh.id);
      if (!h) return;
      if (gh.fallen) {
        deaths.push(gh.id);
        c.roster.splice(c.roster.indexOf(h), 1);
        c.fallen.push(gh.id);
        rep.lost.push({ id: gh.id, turned: !!gh.turned });
        // долг новичка, который выбыл, — списан; имущество выбывшего пропадает вместе с его убежищем
        return;
      }
      h.missions++;
      h.level = gh.level; h.xp = gh.xp; h.talents = gh.talents.slice(); h.perks = gh.perks.slice(); h.talentQueue = (gh.talentQueue || []).slice();
      h.missionsDone = (gh.missionsDone || h.missionsDone).slice();
      // здоровье: карты Ран и Заражений уничтожаются, но потерянная Стойкость остаётся травмой
      // в убежище переносится столько Стойкости, сколько было на момент окончания миссии
      // (карты Ран и Заражений уничтожаются, а потерянная от них Стойкость остаётся травмой)
      // стартовые Раны сложности («Кошмар») — не травмы: их не считаем
      const startW = gh.deck.concat(gh.hand, gh.discard, gh.exhaust || []).filter((u) => g.cards[u] === 'wound' && String(u).startsWith('sw')).length;
      const wounds = Math.max(0, ZG.Engine.hurtCount(g, gh) - startW);
      h.injury = Math.min(C.baseHp(h) + C.hpTalents(h) - 1, h.injury + wounds);
      if (wounds) line(h.id, `−${wounds} Стойкость (раны и заражения)`);
      // добыча: карты добычи из всего, что у героя (принесённые — со своим износом, новые — целые)
      const found = [];
      gh.deck.concat(gh.hand, gh.discard, gh.exhaust || [], gh.equip).forEach((u) => {
        const id = g.cards[u], d = ZG.Cards.get(id);
        if (!(d.loot || d.campaignOnly)) return;
        const key = g.carried && g.carried[u];
        if (key && carriedItems[key]) {
          const it = carriedItems[key];
          delete carriedItems[key];
          if (!it.worn) { it.worn = true; line(h.id, `«${d.name}» на грани поломки`); found.push(it); }
          else if (Rng.next(rng) < breakChance([carriedBy[key] && carriedBy[key].id, h.id].concat((g.carriedHolders && g.carriedHolders[u]) || []).filter(Boolean))) { line(h.id, `«${d.name}» сломалась`); moraleAdd(h, -1, `сломалась «${d.name}»`); }
          else { line(h.id, `«${d.name}» уцелела (всё ещё на грани)`); found.push(it); }
        } else found.push(item(c, id));
      });
      h.equip = [];
      found.forEach((it) => (h.chest.length < C.chestCap(h) ? h.chest : h.junk).push(it));
    });

    // 2) звёзды → талоны (с долгом новичка), особые достижения → мораль
    squad.forEach((id) => {
      const h = C.hero(c, id); if (!h) return;
      const gh = g.heroes.find((x) => x.id === id);
      if (rep.stars) {
        let n = rep.stars * P.star + (C.has(h, 'sh_thrifty') ? rep.stars : 0);
        if (h.debt && h.debt.left > 0) {
          const payer = C.hero(c, h.debt.to);
          const part = Math.floor(n / 2);
          h.debt.left--;
          if (payer && part) { n -= part; talonsAdd(payer, part, `долг ${ZG.Heroes.get(h.id).name}`); line(h.id, `−${part} 🎫 в уплату долга (осталось миссий: ${h.debt.left})`); }
          if (h.debt.left <= 0) h.debt = null;
        }
        talonsAdd(h, n, `${rep.stars} ★ миссии`);
      }
      if (C.has(h, 'sh_scavenger') && gh && (gh.ms.searches || 0) >= 2) talonsAdd(h, 3, 'Мародёр');
      if (rep.stars >= 3) moraleAdd(h, 1, 'миссия на 3 ★');
      if (gh && g.missionFirst === gh.idx) moraleAdd(h, 1, 'первым выполнил секретную миссию');
      deaths.forEach((d) => { const r = relOf(h.id, d); if (r <= -3) moraleAdd(h, 2, `погиб враг: ${ZG.Heroes.get(d).name}`); else moraleAdd(h, r >= 3 ? -2 : -1, `потеря${r >= 3 ? ' друга' : ''}: ${ZG.Heroes.get(d).name}`); });
      // Враги в одном отряде: −1 мораль каждому
      squad.forEach((o) => { if (o !== id && relOf(id, o) <= -3 && !deaths.includes(o)) moraleAdd(h, -1, `в одном отряде с врагом (${ZG.Heroes.get(o).name})`); });
    });
    (g.putDown || []).forEach((p) => { const gh = g.heroes[p.hero]; const h = gh && C.hero(c, gh.id); if (h) moraleAdd(h, 2, `упокоил ${ZG.Heroes.get(p.turned).name}`); });

    // 2б) отношения: события миссии + совместный поход на 3 ★ (оба выжили) — +1
    rep.rel = [];
    squad.forEach((a, i) => squad.slice(i + 1).forEach((b) => {
      if (deaths.includes(a) || deaths.includes(b) || !C.hero(c, a) || !C.hero(c, b)) return;
      const k = pairKey(a, b), from = C.rel(c, a, b);
      const ev = ((g.relDelta || {})[k] || []).slice();
      let n = from + ev.reduce((s2, x) => s2 + x.d, 0);
      if (rep.stars >= 3) { ev.push({ d: 1, why: 'прошли миссию вместе на 3 ★' }); n++; }
      C.relSet(c, a, b, n);
      const to = C.rel(c, a, b);
      if (to !== from) rep.rel.push({ a, b, from, to, why: ev.map((x) => `${x.d > 0 ? '+' : ''}${x.d} ${x.why}`) });
    }));

    // 2в) спасённый пленник (миссия 7) сразу присоединяется к убежищу — на уровне отряда; таланты выберет в начале следующей миссии
    if (g.scenarioId === 'wedding' && g.obj && g.obj.rescued && !C.hero(c, 'gleb') && !c.fallen.includes('gleb')) {
      const lead = C.hero(c, squad[0]) || c.roster[0];
      const h = newHero(c, 'gleb', lead ? lead.player : 1, lead ? lead.ai : false);
      const lv = c.roster.length ? Math.max(1, Math.round(c.roster.reduce((a, x) => a + x.level, 0) / c.roster.length)) : 1;
      const XP = CFG().xpLevels;
      h.level = lv; h.xp = lv > 1 ? XP[lv - 2] : 0; h.talentQueue = Array.from({ length: lv - 1 }, (_, i) => i);
      c.roster.push(h);
      rep.joined = 'gleb';
    }

    // 3) блуждающие: обращённые союзники, чей монстр остался на поле (или так и не появился)
    const turnedNow = g.heroes.filter((gh) => gh.turned).map((gh) => gh.id);
    // в миссию без блуждающих (noWanderers) обращённые не выпускались — они никуда не делись
    const released = (id) => (g.wanderers || []).some((w) => w.type === 'turned_' + id);
    const alive = (id) => g.zombies.some((z) => z.type === 'turned_' + id) || (g.wanderers || []).some((w) => w.type === 'turned_' + id && !w.out) || (c.wanderers.includes(id) && !released(id) && !turnedNow.includes(id));
    c.wanderers = c.wanderers.concat(turnedNow).filter((id, i, a) => a.indexOf(id) === i && alive(id));
    rep.wanderers = c.wanderers.slice();

    // 4) между миссиями: отдых, паёк, восстановление, баня
    if (rep.win) c.roster.forEach((h) => {
      const went = squad.includes(h.id);
      if (!went) {
        if (C.built(h, 'redcorner') && Rng.next(rng) < 0.5) line(h.id, 'Красный уголок: мораль не упала');
        else moraleAdd(h, -1, 'отсиживался в убежище');
      }
      let heal = 0;
      if (h.talons >= P.ration) { h.talons -= P.ration; line(h.id, `−${P.ration} 🎫 паёк`); heal++; }
      else moraleAdd(h, -1, 'не хватило на паёк');
      if (!went) heal++; // отдых
      if (C.built(h, 'infirmary')) heal++;
      if (C.has(h, 'sh_tough')) heal++;
      heal = Math.min(heal, h.injury);
      if (heal) { h.injury -= heal; line(h.id, `+${heal} Стойкость`); }
      if (h.morale < 3 && C.built(h, 'bath') && Rng.next(rng) < 0.5) moraleAdd(h, 1, 'баня');
      if (C.built(h, 'stash')) {
        const it = item(c, Rng.pick(c, C.STASH));
        (h.chest.length < C.chestCap(h) ? h.chest : h.junk).push(it);
        line(h.id, `Схрон: «${ZG.Cards.get(it.id).name}»`);
      }
      h.morale = Math.max(0, Math.min(M.max, h.morale));
    });

    c.missionNo++;
    c.current = null;
    c.report = rep;
    c.updated = Date.now();
    if (!rep.win) { c.status = 'over'; c.endReason = 'Миссия провалена: ' + (rep.reason || ''); }
    else if (c.missionNo >= c.chainLength) { c.status = 'won'; c.endReason = 'Кампания пройдена!'; }
    else {
      c.status = 'ready';
      C.drawEvent(c); // фаза событий убежища: тянется карта из колоды (8 событий + 8 пустых)
      c.roster.forEach((h) => { if (h.ai) C.autoManage(c, h.id); });
      C.checkSquad(c);
    }
    return rep;
  };

  // Отряд нельзя собрать (выбыли, а на наём не хватает) — кампания окончена
  // секретного героя не нанять — только спасти
  C.hireable = (c) => ZG.Heroes.all().filter((d) => !d.secret).map((d) => d.id).filter((id) => !C.hero(c, id) && !c.fallen.includes(id) && !c.wanderers.includes(id));
  C.checkSquad = function (c) {
    if (c.status !== 'ready' || c.roster.length >= 1) return true; // идти можно и неполным отрядом
    const can = C.hireable(c).length && c.roster.some((h) => h.talons + C.sellValue(h) >= CFG().prices.hire);
    if (!can) { c.status = 'over'; c.endReason = 'Отряд не собрать: героев не хватает, а талонов на наём нет.'; }
    return !!can;
  };

  // ------------------------------------------------------------ убежище
  const LISTS = ['equip', 'chest', 'junk'];
  const cap = (h, list) => (list === 'equip' ? C.equipCap(h) : list === 'chest' ? C.chestCap(h) : Infinity);

  C.move = function (c, heroId, from, idx, to) {
    const h = C.hero(c, heroId);
    if (!h || !LISTS.includes(from) || !LISTS.includes(to) || !h[from][idx]) return 'Нет такой карты.';
    if (from === to) return null;
    if (h[to].length >= cap(h, to)) return to === 'equip' ? 'Экипировка заполнена.' : 'Сундук заполнен.';
    h[to].push(h[from].splice(idx, 1)[0]);
    return null;
  };
  C.give = function (c, fromId, from, idx, toId) {
    const a = C.hero(c, fromId), b = C.hero(c, toId);
    if (!a || !b || a === b || !LISTS.includes(from) || !a[from][idx]) return 'Нельзя передать.';
    if (b.chest.length >= C.chestCap(b)) return `Сундук ${ZG.Heroes.get(b.id).name} заполнен.`;
    b.chest.push(a[from].splice(idx, 1)[0]);
    return null;
  };
  C.sell = function (c, heroId, from, idx) {
    const h = C.hero(c, heroId), it = h && LISTS.includes(from) && h[from][idx];
    if (!it) return 'Нет такой карты.';
    const p = C.price(it.id);
    if (p == null) return 'Эту карту нельзя продать.';
    h[from].splice(idx, 1);
    h.talons += p;
    return null;
  };
  C.heal = function (c, heroId) {
    const h = C.hero(c, heroId), p = CFG().prices.heal;
    if (!h || h.injury <= 0) return 'Лечить нечего.';
    if (h.talons < p) return 'Не хватает талонов.';
    h.talons -= p; h.injury--;
    return null;
  };
  // ---------------- помощники событий убежища
  C.moraleAdd = (c, h, n) => { if (h) h.morale = Math.max(0, Math.min(CFG().morale.max, h.morale + n)); };
  C.relAdd = (c, a, b, n) => C.relSet(c, a, b, C.rel(c, a, b) + n);
  C.putChest = (c, h, id) => (h.chest.length < C.chestCap(h) ? h.chest : h.junk).push(item(c, id));
  C.injure = (c, h, n) => { h.injury = Math.min(C.baseHp(h) + C.hpTalents(h) - 1, h.injury + n); };
  // Колода событий убежища: 8 событий по одной карте + 8 пустых; кончилась — перемешивается заново
  C.eventDef = (id) => (ZG.SHELTER_EVENTS || []).find((d) => d.id === id) || null;
  C.drawEvent = function (c) {
    if (!c.eventDeck || !c.eventDeck.length) c.eventDeck = Rng.shuffle(c, (ZG.SHELTER_EVENTS || []).map((d) => d.id).concat((ZG.SHELTER_BLANKS || []).map((t, i) => 'blank' + i)));
    const id = c.eventDeck.pop();
    const def = C.eventDef(id);
    if (!def) { c.eventDraw = { id, blank: true, done: true, result: (ZG.SHELTER_BLANKS || [])[+id.slice(5)] || 'Тихая ночь.' }; return c.eventDraw; }
    if (!def.need(c)) { c.eventDraw = { id, done: true, skipped: true, result: 'Карта не разыгрывается: сейчас для неё нет участников.' }; return c.eventDraw; }
    const e = Object.assign({ id }, def.setup(c));
    e.story = def.story(c, e);
    c.eventDraw = e;
    if (C.hero(c, e.decider) && C.hero(c, e.decider).ai) C.resolveEvent(c, C.eventAI(c));
    return e;
  };
  C.eventOptions = (c) => { const e = c.eventDraw, def = e && C.eventDef(e.id); return def && !e.done ? def.options(c, e) : []; };
  C.eventAI = (c) => { const e = c.eventDraw, def = e && C.eventDef(e.id); if (!def) return null; const k = def.ai(c, e); const opt = def.options(c, e).find((o) => o.key === k && !o.off); return opt ? k : def.options(c, e).find((o) => !o.off).key; };
  C.resolveEvent = function (c, key) {
    const e = c.eventDraw, def = e && C.eventDef(e.id);
    if (!def || e.done) return 'Событий нет.';
    const opt = def.options(c, e).find((o) => o.key === key);
    if (!opt || opt.off) return 'Этот вариант сейчас недоступен.';
    e.key = key; e.choice = opt.label; e.done = true;
    e.byAI = !!(C.hero(c, e.decider) || {}).ai;
    e.result = def.apply(c, e, key);
    return null;
  };

  // Тир: раз между миссиями, +1 опыт за талоны; новый уровень — талант предложат в начале миссии
  C.canTrain = (c, h) => C.built(h, 'range') && h.trainedNo !== c.missionNo && c.status === 'ready';
  C.train = function (c, heroId) {
    const h = C.hero(c, heroId), p = CFG().prices.train;
    if (!h || !C.built(h, 'range')) return 'Нужен Тир.';
    if (!C.canTrain(c, h)) return 'В тире уже тренировались.';
    if (h.talons < p) return 'Не хватает талонов.';
    h.talons -= p; h.trainedNo = c.missionNo;
    const before = h.xp; h.xp++;
    CFG().xpLevels.forEach((lv, i) => { if (before < lv && h.xp >= lv) { h.level = i + 2; (h.talentQueue = h.talentQueue || []).push(i); } });
    return null;
  };
  C.repair = function (c, heroId, from, idx) {
    const h = C.hero(c, heroId), it = h && LISTS.includes(from) && h[from][idx];
    if (!it || !it.worn) return 'Карта не нуждается в ремонте.';
    const p = C.repairPrice(it.id);
    if (!C.built(h, 'workshop')) return 'Нужна Мастерская.';
    if (h.talons < p) return 'Не хватает талонов.';
    h.talons -= p; it.worn = false;
    return null;
  };
  C.build = function (c, heroId, bId) {
    const h = C.hero(c, heroId), b = ZG.Buildings.get(bId);
    if (!h || !b) return 'Нет такой постройки.';
    if (C.built(h, bId)) return 'Уже построено.';
    if (h.talons < b.cost) return 'Не хватает талонов.';
    h.talons -= b.cost; h.buildings.push(bId);
    return null;
  };
  // Наём: платит один герой. Ему — подарок новичка (уникальная карта героя) и долг на 3 миссии новичка.
  C.hire = function (c, payerId, newId) {
    const payer = C.hero(c, payerId), P = CFG().prices;
    if (c.status !== 'ready') return 'Кампания не в убежище.';
    if (!payer) return 'Нет такого героя.';
    if (!C.hireable(c).includes(newId)) return 'Этого героя нельзя нанять.';
    if (c.roster.length >= c.squad + 2) return 'Убежище переполнено (не больше размера отряда +2).';
    if (payer.talons < P.hire) return 'Не хватает талонов.';
    payer.talons -= P.hire;
    const h = newHero(c, newId, payer.player, payer.ai);
    // стартовый паёк: 1 обычная карта добычи в экипировке
    const lvl = ZG.Levels.get('outskirts');
    const commons = Object.keys(lvl.loot).filter((id) => { const d = ZG.Cards.get(id); return !d.event && (d.rarity || 'common') === 'common'; });
    if (commons.length) h.equip.push(item(c, Rng.pick(c, commons)));
    const gift = ZG.Heroes.get(newId).gift;
    if (gift && ZG.Cards.has(gift)) (payer.chest.length < C.chestCap(payer) ? payer.chest : payer.junk).push(item(c, gift));
    h.debt = { to: payer.id, left: 3 };
    h.talons = P.hireTalons || 0;
    c.roster.push(h);
    if (h.ai) C.autoManage(c, h.id);
    if (payer.ai) C.autoManage(c, payer.id);
    payer.morale = Math.min(CFG().morale.max, payer.morale + 1);
    return null;
  };
  // ИИ раскладывает карты сам: лучшие — в экипировку (целые важнее изношенных),
  // ценные, но не поместившиеся — в сундук, ненужное — в хлам (продастся при выходе)
  C.cardScore = (it) => (ZG.Cards.get(it.id).value || 0) - (it.worn ? 3 : 0);
  C.isValuable = (it) => { const d = ZG.Cards.get(it.id); return !!d.campaignOnly || (d.rarity && d.rarity !== 'common') || (d.value || 0) >= 8; };
  // Отчаяние: Стойкость на половине и ниже — герой берёт в поход даже мелочь (риск смерти велик),
  // а лечение и защиту ставит в приоритет; обычно мелочь не берёт и продаёт.
  C.desperate = (h) => C.hp(h) * 2 <= C.baseHp(h) + C.hpTalents(h);
  C.autoManage = function (c, heroId) {
    const h = C.hero(c, heroId);
    if (!h) return 'Нет такого героя.';
    const desp = C.desperate(h);
    // ремонт (если есть Мастерская): чинить то, что пойдёт в поход или стоит хранить, — самое ценное первым;
    // оставить запас на паёк и лечение травм; мелочь, которая уйдёт в хлам, не чинить
    if (C.built(h, 'workshop')) {
      const P = CFG().prices;
      const reserve = P.ration + Math.min(h.injury, 2) * P.heal;
      const pool = h.equip.concat(h.chest, h.junk).filter((it) => it.worn && C.isValuable(it))
        .sort((a, b) => (ZG.Cards.get(b.id).value || 0) - (ZG.Cards.get(a.id).value || 0));
      pool.forEach((it) => {
        const price = C.repairPrice(it.id);
        if (h.talons - price >= reserve) { h.talons -= price; it.worn = false; }
      });
    }
    // постройки: ИИ строит активно — по приоритету, оставляя запас на паёк и лечение травм
    const BUILD_ORDER = ['stash', 'infirmary', 'range', 'storage', 'workshop', 'bath', 'redcorner'];
    const keep = CFG().prices.ration + Math.min(h.injury, 1) * CFG().prices.heal;
    BUILD_ORDER.forEach((bId) => {
      const b = ZG.Buildings.get(bId);
      if (!b || C.built(h, bId) || h.talons - b.cost < keep) return;
      if (bId === 'workshop' && !h.equip.concat(h.chest, h.junk).some((it) => it.worn)) return; // мастерская — когда есть что чинить
      if (bId === 'bath' && h.morale > 2) return;
      C.build(c, h.id, bId);
    });
    // Тир: тренироваться, если после этого хватает на паёк и пару лечений
    if (C.canTrain(c, h) && h.talons - CFG().prices.train >= CFG().prices.ration + Math.min(h.injury, 2) * CFG().prices.heal) C.train(c, h.id);
    const survival = (it) => { const t = ZG.Cards.get(it.id).tags || []; return t.includes('heal') || t.includes('block') ? 4 : 0; };
    const score = (it) => C.cardScore(it) + (desp ? survival(it) : 0);
    const all = h.equip.concat(h.chest, h.junk).sort((a, b) => score(b) - score(a));
    h.equip = []; h.chest = []; h.junk = [];
    all.forEach((it) => {
      if (h.equip.length < C.equipCap(h) && !ZG.Cards.get(it.id).event && (desp || C.isValuable(it))) h.equip.push(it);
      else if (C.isValuable(it) && h.chest.length < C.chestCap(h)) h.chest.push(it);
      else h.junk.push(it);
    });
    return null;
  };

  C.setControl = function (c, heroId, player, ai) {
    const h = C.hero(c, heroId);
    if (!h) return 'Нет такого героя.';
    if (player) h.player = player;
    if (ai != null) h.ai = !!ai;
    return null;
  };

  // ------------------------------------------------------------ сохранения
  const KEY = 'zg.campaign.slot.';
  C.SLOTS = 5;
  function storage() { try { return G.localStorage || null; } catch (e) { return null; } }
  C.save = function (c, slot) {
    const st = storage(); if (!st) return false;
    c.slot = slot; c.updated = Date.now();
    try { st.setItem(KEY + slot, JSON.stringify(c)); return true; } catch (e) { return false; }
  };
  C.load = function (slot) {
    const st = storage(); if (!st) return null;
    try { const raw = st.getItem(KEY + slot); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  };
  C.remove = function (slot) { const st = storage(); try { if (st) st.removeItem(KEY + slot); } catch (e) { /* нет доступа */ } };
  C.list = function () {
    const out = [];
    for (let i = 1; i <= C.SLOTS; i++) out.push({ slot: i, c: C.load(i) });
    return out;
  };

  ZG.Campaign = C;
})(typeof globalThis !== 'undefined' ? globalThis : window);
