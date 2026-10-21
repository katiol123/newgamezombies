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
      squad: opts.heroes.length, missionNo: 0, chainLength: CFG().chainLength,
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
  C.hp = (h) => Math.max(1, C.baseHp(h) - h.injury);
  C.price = (id) => {
    const d = ZG.Cards.get(id);
    if (d.campaignOnly) return null; // уникальные карты кампании не продаются
    return CFG().prices.sell[d.rarity || 'common'];
  };
  C.mission = (c) => ({ no: c.missionNo + 1, total: c.chainLength });

  // ------------------------------------------------------------ миссия
  // Опции для ZG.Engine.create: отряд из ростера, перенос героев, блуждающие угрозы.
  C.startMission = function (c, squadIds) {
    if (c.status !== 'ready') return { error: 'Кампания не готова к миссии.' };
    const ids = squadIds || c.roster.slice(0, c.squad).map((h) => h.id);
    if (ids.length !== c.squad) return { error: `Нужно выбрать ровно ${c.squad} ${ZG.util.plural(c.squad, 'героя', 'героев', 'героев')}.` };
    if (ids.some((id) => !C.hero(c, id))) return { error: 'Этого героя нет в убежище.' };
    // хлам при выходе продаётся автоматически
    c.roster.forEach((h) => { h.junk.forEach((it) => { h.talons += C.price(it.id) || 0; }); h.junk = []; });
    c.current = { squad: ids.slice(), seed: `${c.seed}-m${c.missionNo + 1}` };
    c.status = 'mission';
    c.updated = Date.now();
    const M = CFG().morale;
    return {
      seed: c.current.seed, difficultyId: c.difficultyId, fog: true, missions: true,
      campaign: true, xpLevels: CFG().xpLevels.slice(),
      wanderers: c.wanderers.map((id) => 'turned_' + id).filter((t) => ZG.Zombies.has(t)),
      heroes: ids.map((id) => {
        const h = C.hero(c, id);
        const temp = h.morale <= 0 ? ['despair', 'despair'] : h.morale <= M.low ? ['despair'] : h.morale >= M.max ? ['courage'] : [];
        return {
          id, player: h.player, ai: h.ai,
          carry: { level: h.level, xp: h.xp, talents: h.talents, perks: h.perks, missionsDone: h.missionsDone, injury: h.injury, cards: h.equip.map((it) => ({ key: it.key, id: it.id })), temp },
        };
      }),
    };
  };

  // Итоги миссии. Возвращает отчёт для экрана убежища (и кладёт его в c.report).
  C.finishMission = function (c, g) {
    const P = CFG().prices, M = CFG().morale;
    const rng = c; // Rng работает с объектом, у которого есть поле rng
    const res = g.result || { win: false, stars: 0, reason: 'Миссия прервана.' };
    const squad = c.current ? c.current.squad : g.heroes.map((h) => h.id);
    const rep = { missionNo: c.missionNo + 1, win: !!res.win, stars: res.stars || 0, reason: res.reason, heroes: {}, lost: [], wanderers: [] };
    const line = (id, text) => (rep.heroes[id] = rep.heroes[id] || { lines: [], talons: 0, morale: 0 }).lines.push(text);
    const moraleAdd = (h, n, why) => { if (!n) return; h.morale += n; rep.heroes[h.id] = rep.heroes[h.id] || { lines: [], talons: 0, morale: 0 }; rep.heroes[h.id].morale += n; line(h.id, `${n > 0 ? '+' : ''}${n} мораль — ${why}`); };
    const talonsAdd = (h, n, why) => { if (!n) return; h.talons += n; rep.heroes[h.id] = rep.heroes[h.id] || { lines: [], talons: 0, morale: 0 }; rep.heroes[h.id].talons += n; line(h.id, `+${n} 🎫 — ${why}`); };

    // карты, принесённые из убежища: key → предмет (износ следует за картой, даже если её передали в бою)
    const carriedItems = {};
    squad.forEach((id) => { const h = C.hero(c, id); if (h) h.equip.forEach((it) => { carriedItems[it.key] = it; }); });

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
      h.level = gh.level; h.xp = gh.xp; h.talents = gh.talents.slice(); h.perks = gh.perks.slice();
      h.missionsDone = (gh.missionsDone || h.missionsDone).slice();
      // здоровье: карты Ран и Заражений уничтожаются, но потерянная Стойкость остаётся травмой
      const wounds = gh.deck.concat(gh.hand, gh.discard).filter((u) => g.cards[u] === 'wound').length;
      h.injury = Math.min(C.baseHp(h) - 1, h.injury + wounds);
      if (wounds) line(h.id, `${wounds} ${ZG.util.plural(wounds, 'рана', 'раны', 'ран')} → травмы`);
      // добыча: карты добычи из всего, что у героя (принесённые — со своим износом, новые — целые)
      const found = [];
      gh.deck.concat(gh.hand, gh.discard, gh.equip).forEach((u) => {
        const id = g.cards[u], d = ZG.Cards.get(id);
        if (!(d.loot || d.campaignOnly)) return;
        const key = g.carried && g.carried[u];
        if (key && carriedItems[key]) {
          const it = carriedItems[key];
          delete carriedItems[key];
          if (!it.worn) { it.worn = true; line(h.id, `«${d.name}» на грани поломки`); found.push(it); }
          else if (Rng.next(rng) < (C.has(h, 'sh_handy') ? 0.25 : CFG().breakChance)) { line(h.id, `«${d.name}» сломалась`); moraleAdd(h, -1, `сломалась «${d.name}»`); }
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
      deaths.forEach((d) => moraleAdd(h, -1, `потеря: ${ZG.Heroes.get(d).name}`));
    });
    (g.putDown || []).forEach((p) => { const gh = g.heroes[p.hero]; const h = gh && C.hero(c, gh.id); if (h) moraleAdd(h, 2, `упокоил ${ZG.Heroes.get(p.turned).name}`); });

    // 3) блуждающие: обращённые союзники, чей монстр остался на поле (или так и не появился)
    const turnedNow = g.heroes.filter((gh) => gh.turned).map((gh) => gh.id);
    const alive = (id) => g.zombies.some((z) => z.type === 'turned_' + id) || (g.wanderers || []).some((w) => w.type === 'turned_' + id && !w.out);
    c.wanderers = c.wanderers.concat(turnedNow).filter((id, i, a) => a.indexOf(id) === i && alive(id));
    rep.wanderers = c.wanderers.slice();

    // 4) между миссиями: отдых, паёк, восстановление, баня
    c.roster.forEach((h) => {
      const went = squad.includes(h.id);
      if (!went) {
        if (C.built(h, 'redcorner') && Rng.next(rng) < 0.5) line(h.id, 'Красный уголок: мораль не упала');
        else moraleAdd(h, -1, 'отсиживался в убежище');
      }
      let heal = 0;
      if (h.talons >= P.ration) { h.talons -= P.ration; line(h.id, `−${P.ration} 🎫 паёк`); heal++; }
      else moraleAdd(h, -1, 'не хватило на паёк');
      if (heal) {
        if (!went) heal++;
        if (C.built(h, 'infirmary')) heal++;
        if (C.has(h, 'sh_tough')) heal++;
      }
      heal = Math.min(heal, h.injury);
      if (heal) { h.injury -= heal; line(h.id, `+${heal} Стойкость`); }
      if (h.morale < 3 && C.built(h, 'bath') && Rng.next(rng) < 0.5) moraleAdd(h, 1, 'баня');
      h.morale = Math.max(0, Math.min(M.max, h.morale));
    });

    c.missionNo++;
    c.current = null;
    c.report = rep;
    c.updated = Date.now();
    if (!rep.win) { c.status = 'over'; c.endReason = 'Миссия провалена: ' + (rep.reason || ''); }
    else if (c.missionNo >= c.chainLength) { c.status = 'won'; c.endReason = 'Кампания пройдена!'; }
    else { c.status = 'ready'; C.checkSquad(c); }
    return rep;
  };

  // Отряд нельзя собрать (выбыли, а на наём не хватает) — кампания окончена
  C.hireable = (c) => ZG.Heroes.all().map((d) => d.id).filter((id) => !C.hero(c, id) && !c.fallen.includes(id) && !c.wanderers.includes(id));
  C.checkSquad = function (c) {
    if (c.status !== 'ready' || c.roster.length >= c.squad) return true;
    const can = C.hireable(c).length && c.roster.some((h) => h.talons >= CFG().prices.hire);
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
    if (!a || !b || a === b || !a[from] || !a[from][idx]) return 'Нельзя передать.';
    if (b.chest.length >= C.chestCap(b)) return `Сундук ${ZG.Heroes.get(b.id).name} заполнен.`;
    b.chest.push(a[from].splice(idx, 1)[0]);
    return null;
  };
  C.sell = function (c, heroId, from, idx) {
    const h = C.hero(c, heroId), it = h && h[from] && h[from][idx];
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
  C.repair = function (c, heroId, from, idx) {
    const h = C.hero(c, heroId), it = h && h[from] && h[from][idx], p = CFG().prices.repair;
    if (!it || !it.worn) return 'Карта не нуждается в ремонте.';
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
    if (!payer) return 'Нет такого героя.';
    if (!C.hireable(c).includes(newId)) return 'Этого героя нельзя нанять.';
    if (c.roster.length >= c.squad + 2) return 'Убежище переполнено (не больше размера отряда +2).';
    if (payer.talons < P.hire) return 'Не хватает талонов.';
    payer.talons -= P.hire;
    const h = newHero(c, newId, payer.player, payer.ai);
    // стартовый паёк: 1 обычная карта добычи в экипировке
    const lvl = ZG.Levels.get('outskirts');
    const commons = Object.keys(lvl.loot).filter((id) => (ZG.Cards.get(id).rarity || 'common') === 'common');
    if (commons.length) h.equip.push(item(c, Rng.pick(c, commons)));
    const gift = ZG.Heroes.get(newId).gift;
    if (gift && ZG.Cards.has(gift)) (payer.chest.length < C.chestCap(payer) ? payer.chest : payer.junk).push(item(c, gift));
    h.debt = { to: payer.id, left: 3 };
    c.roster.push(h);
    payer.morale = Math.min(CFG().morale.max, payer.morale + 1);
    if (c.status === 'over' && c.roster.length >= c.squad) c.status = 'ready';
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
