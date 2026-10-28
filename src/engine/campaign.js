/*
 * Campaign mode: the state between missions (plain JSON) and all its rules.
 * Rules — docs/CAMPAIGN.md, parameters and prices — src/data/campaign.js (ZG.CAMPAIGN).
 *
 * Flow: create() → startMission() gives options for Engine.create → the game →
 *        finishMission() processes the results (wear, morale, tickets, health, the fallen, the wandering) →
 *        shelter actions (sell/move/give/heal/repair/build/hire/setControl) → startMission() …
 * All shelter actions return null on success or an error text.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const Rng = ZG.Rng;
  const CFG = () => ZG.CAMPAIGN;

  const C = {};

  // ------------------------------------------------------------ creation
  C.create = function (opts) {
    const seed = String(opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9));
    const c = {
      v: 1, seed, rng: Rng.seedFrom('camp-' + seed), name: opts.name || 'Campaign',
      created: Date.now(), updated: Date.now(),
      difficultyId: opts.difficultyId || 'survivor', players: opts.players || 1,
      squad: opts.heroes.length, missionNo: 0, chainLength: CFG().chain.length,
      status: 'ready', // ready — can go on a mission; mission — a mission is in progress; over — failed; won — completed
      roster: [], fallen: [], wanderers: [], nextKey: 1, report: null, current: null, endReason: null,
      retreats: CFG().retreats || 0, // how many more times the squad can retreat and replay a mission
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

  C.retreatsLeft = (c) => (c.retreats == null ? CFG().retreats || 0 : c.retreats); // old saves — with a full stock
  // Squad for a mission: from minSquad to 4 heroes; mission difficulty is based on the number who went out.
  // c.squad — the squad size at the start of the campaign: fewer cannot be taken while the shelter has enough heroes on their feet (Grit 2+).
  C.MAX_SQUAD = 4;
  C.minSquad = (c) => Math.min(c.squad, c.roster.filter((h) => C.hp(h) >= 2).length) || 1;
  C.rosterCap = (c) => Math.max(c.squad + 2, C.MAX_SQUAD); // shelter: can grow to a full squad of 4
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
    if (d.campaignOnly) return null; // unique campaign cards cannot be sold
    return CFG().prices.sell[d.rarity || 'common'];
  };
  // Valuable: the price is unknown until sold — the fence pays from VAL_MIN to VAL_MAX tickets
  C.VAL_MIN = 2; C.VAL_MAX = 8;
  C.isValuable$ = (id) => !!(ZG.Cards.get(id) || {}).valuable;
  C.appraise = (c) => C.VAL_MIN + Rng.int(c, C.VAL_MAX - C.VAL_MIN + 1);
  C.repairPrice = (id) => { const r = CFG().prices.repair; return typeof r === 'number' ? r : r[ZG.Cards.get(id).rarity || 'common']; };
  C.sellValue = (h) => h.chest.concat(h.junk, h.equip).reduce((s, it) => s + (C.isValuable$(it.id) ? (C.VAL_MIN + C.VAL_MAX) / 2 : C.price(it.id) || 0), 0);
  C.mission = (c) => ({ no: c.missionNo + 1, total: c.chainLength });
  // Relations: a −3…+3 scale for each pair (Enemies … Friends); Friends (+3) — Bond
  const pairKey = (a, b) => [a, b].sort().join('|');
  C.rel = (c, a, b) => (c.rel || {})[pairKey(a, b)] || 0;
  C.relName = (n) => (n >= 3 ? 'Friends' : n >= 1 ? 'Pals' : n <= -3 ? 'Enemies' : n <= -1 ? 'Dislike' : 'Neutral');
  C.relSet = (c, a, b, n) => { c.rel = c.rel || {}; c.rel[pairKey(a, b)] = Math.max(-3, Math.min(3, n)); };
  C.bonds = (c) => Object.entries(c.rel || {}).filter(([k, n]) => n >= 3).map(([k]) => k.split('|')).filter(([a, b]) => C.hero(c, a) && C.hero(c, b));
  C.bondsOf = (c, id) => C.bonds(c).filter((p) => p.includes(id)).map((p) => (p[0] === id ? p[1] : p[0]));
  C.STASH = ['medkit', 'bandage_roll', 'energy', 'chocolate', 'canned', 'grenade'];
  C.missionDef = (c) => CFG().chain[Math.min(c.missionNo, CFG().chain.length - 1)] || {};

  // ------------------------------------------------------------ mission
  // Options for ZG.Engine.create: the squad from the roster, hero carry-over, wandering threats.
  C.startMission = function (c, squadIds) {
    if (c.status !== 'ready') return { error: 'The campaign is not ready for a mission.' };
    if (c.eventDraw && !c.eventDraw.done) C.resolveEvent(c, C.eventAI(c)); // an unresolved shelter event is resolved "AI style"
    const ids = squadIds || c.roster.slice(0, c.squad).map((h) => h.id);
    // heroes — from minSquad (the starting size, if enough are on their feet) to 4; the mission is calculated for the actual squad
    const lo = C.minSquad(c), hi = Math.min(C.MAX_SQUAD, c.roster.length);
    if (ids.length < lo || ids.length > hi) return { error: lo === hi ? `Choose ${lo} ${ZG.util.plural(lo, 'hero', 'heroes', 'heroes')}.` : `Choose from ${lo} to ${hi} heroes.` };
    if (ids.some((id) => !C.hero(c, id))) return { error: 'This hero is not in the shelter.' };
    // junk is sold automatically when leaving
    c.lastJunkSale = [];
    c.roster.forEach((h) => {
      h.junk.forEach((it) => {
        if (C.isValuable$(it.id)) { const p = C.appraise(c); h.talons += p; c.haul = (c.haul || 0) + p; c.lastJunkSale.push({ hero: h.id, price: p }); }
        else h.talons += C.price(it.id) || 0;
      });
      h.junk = h.junk.filter((it) => C.price(it.id) == null && !C.isValuable$(it.id)); // unique campaign cards cannot be sold — they stay
    });
    c.current = { squad: ids.slice(), seed: `${c.seed}-m${c.missionNo + 1}` };
    c.lastSquad = ids.slice();
    c.status = 'mission';
    c.updated = Date.now();
    const M = CFG().morale;
    const md = C.missionDef(c);
    return {
      seed: c.current.seed, difficultyId: c.difficultyId, fog: true, missions: true, partySize: ids.length, retreats: C.retreatsLeft(c),
      campaign: true, xpLevels: CFG().xpLevels.slice(),
      scenarioId: md.scenarioId, conditionId: md.conditionId, tileRules: md.tiles || null, levelId: md.levelId, special: md.special || null, stories: md.stories || null, missionTitle: md.name ? `Mission ${c.missionNo + 1}: ${md.name}` : null,
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

  // Mission results. Returns the report for the shelter screen (and stores it in c.report).
  C.finishMission = function (c, g) {
    if (c.status !== 'mission') return c.report; // results already applied
    const P = CFG().prices, M = CFG().morale;
    const rng = c; // Rng works with an object that has an rng field
    const res = g.result || { win: false, stars: 0, reason: 'Mission aborted.' };
    const squad = c.current ? c.current.squad : g.heroes.map((h) => h.id);
    const rep = { missionNo: c.missionNo + 1, win: !!res.win, stars: res.stars || 0, reason: res.reason, heroes: {}, lost: [], wanderers: [] };
    rep.retreat = !res.win && C.retreatsLeft(c) > 0 && !!res.reason; // a failure is not the end while there are retreats left
    const line = (id, text) => (rep.heroes[id] = rep.heroes[id] || { lines: [], talons: 0, morale: 0 }).lines.push(text);
    // memorable campaign events (for the epilogue)
    c.flags = c.flags || {};
    const kb = (g.stats && g.stats.killsBy) || {};
    if (kb.bear) c.flags.bear = true;
    if (kb.forester) c.flags.forester = true;
    if (g.scenarioId === 'market' && g.obj && g.obj.butcherDead) c.flags.butcher = true;
    if (g.scenarioId === 'pogost' && kb.brute) c.flags.brutes = kb.brute; // how many Brutes were killed at the Cross
    if (g.scenarioId === 'bridge' && res.win) c.flags.bridge = g.obj && g.obj.way === 'quiet' ? 'quiet' : 'force'; // how the key was obtained (or the gang wiped out)
    if (g.scenarioId === 'forest' && g.obj && g.obj.attempted) c.flags.signal = true;
    // the journey's history — for the epilogue (chapters per mission)
    (c.history = c.history || []).push({ no: c.missionNo + 1, scenarioId: g.scenarioId, win: !!res.win, stars: res.stars || 0, retreat: rep.retreat });
    if (g.scenarioId === 'wedding' && g.obj) c.flags.gleb = g.obj.rescued ? 'rescued' : g.obj.executed ? 'executed' : c.flags.gleb;
    const moraleAdd = (h, n, why) => { if (!n) return; h.morale += n; rep.heroes[h.id] = rep.heroes[h.id] || { lines: [], talons: 0, morale: 0 }; rep.heroes[h.id].morale += n; line(h.id, `${n > 0 ? '+' : '−'}${Math.abs(n)} morale — ${why}`); };
    const talonsAdd = (h, n, why) => { if (!n) return; h.talons += n; rep.heroes[h.id] = rep.heroes[h.id] || { lines: [], talons: 0, morale: 0 }; rep.heroes[h.id].talons += n; line(h.id, `+${n} 🎫 — ${why}`); };

    // cards brought from the shelter: key → item (wear follows the card even if it was handed over in combat)
    const carriedItems = {}, carriedBy = {};
    squad.forEach((id) => { const h = C.hero(c, id); if (h) h.equip.forEach((it) => { carriedItems[it.key] = it; carriedBy[it.key] = h; }); });
    // break chance — the worst among all heroes whose hands the card passed through during the mission (handovers do not dodge wear)
    const handy = (id) => { const gh = g.heroes.find((x) => x.id === id); return !!gh && gh.talents.includes('sh_handy'); };
    const breakChance = (ids) => Math.max(...ids.map((id) => (handy(id) ? 0.25 : CFG().breakChance)));

    // relations at the start of the mission (morale on a loss, feuds in the squad)
    const relBefore = {};
    squad.forEach((a, i) => squad.slice(i + 1).forEach((b) => { relBefore[pairKey(a, b)] = C.rel(c, a, b); }));
    const relOf = (a, b) => relBefore[pairKey(a, b)] || 0;

    // 1) the fate of the participants
    const deaths = [];
    g.heroes.forEach((gh) => {
      const h = C.hero(c, gh.id);
      if (!h) return;
      if (gh.fallen) {
        deaths.push(gh.id);
        c.roster.splice(c.roster.indexOf(h), 1);
        c.fallen.push(gh.id);
        rep.lost.push({ id: gh.id, turned: !!gh.turned });
        // a fallen recruit's debt is written off; the fallen hero's property is lost together with their shelter
        return;
      }
      h.missions++;
      h.level = gh.level; h.xp = gh.xp; h.talents = gh.talents.slice(); h.perks = gh.perks.slice(); h.talentQueue = (gh.talentQueue || []).slice();
      h.missionsDone = (gh.missionsDone || h.missionsDone).slice();
      // health: Wound and Infection cards are destroyed, but lost Grit remains as an injury
      // the shelter keeps as much Grit as the hero had at the end of the mission
      // (Wound and Infection cards are destroyed, but the Grit lost to them remains an injury)
      // starting difficulty Wounds ("Nightmare") are not injuries: they are not counted
      const startW = gh.deck.concat(gh.hand, gh.discard, gh.exhaust || []).filter((u) => g.cards[u] === 'wound' && String(u).startsWith('sw')).length;
      const wounds = Math.max(0, ZG.Engine.hurtCount(g, gh) - startW);
      h.injury = Math.min(C.baseHp(h) + C.hpTalents(h) - 1, h.injury + wounds);
      if (wounds) line(h.id, `−${wounds} Grit (wounds and infections)`);
      // loot: loot cards from everything the hero has (brought ones — with their wear, new ones — intact)
      const found = [];
      gh.deck.concat(gh.hand, gh.discard, gh.exhaust || [], gh.equip).forEach((u) => {
        const id = g.cards[u], d = ZG.Cards.get(id);
        if (!(d.loot || d.campaignOnly)) return;
        const key = g.carried && g.carried[u];
        if (key && carriedItems[key]) {
          const it = carriedItems[key];
          delete carriedItems[key];
          if (!it.worn) { it.worn = true; line(h.id, `card "${d.name}" is about to break`); found.push(it); }
          else if (Rng.next(rng) < breakChance([carriedBy[key] && carriedBy[key].id, h.id].concat((g.carriedHolders && g.carriedHolders[u]) || []).filter(Boolean))) { line(h.id, `card "${d.name}" broke`); moraleAdd(h, -1, `card "${d.name}" broke`); }
          else { line(h.id, `card "${d.name}" survived (still about to break)`); found.push(it); }
        } else found.push(item(c, id));
      });
      h.equip = [];
      // retreat: Valuables are dropped on the run — otherwise it would pay to loot a safe to the last and retreat at once
      if (rep.retreat) { const lost = found.filter((it) => C.isValuable$(it.id)).length; if (lost) line(h.id, `${lost > 1 ? lost + ' Valuables dropped' : 'Valuable dropped'} during the retreat`); }
      found.filter((it) => !(rep.retreat && C.isValuable$(it.id))).forEach((it) => (C.isValuable$(it.id) ? h.junk : h.chest.length < C.chestCap(h) ? h.chest : h.junk).push(it)); // Valuables go straight to junk: handed to the fence when leaving
    });

    // 2) stars → tickets (with the recruit's debt), special achievements → morale
    squad.forEach((id) => {
      const h = C.hero(c, id); if (!h) return;
      const gh = g.heroes.find((x) => x.id === id);
      if (rep.stars) {
        let n = rep.stars * P.star + (C.has(h, 'sh_thrifty') ? rep.stars : 0);
        if (h.debt && h.debt.left > 0) {
          const payer = C.hero(c, h.debt.to);
          const part = Math.floor(n / 2);
          h.debt.left--;
          if (payer && part) { n -= part; talonsAdd(payer, part, `${ZG.Heroes.get(h.id).name}'s debt`); line(h.id, `−${part} 🎫 toward the debt (missions left: ${h.debt.left})`); }
          if (h.debt.left <= 0) h.debt = null;
        }
        talonsAdd(h, n, `${rep.stars} ★ mission`);
      }
      if (C.has(h, 'sh_scavenger') && gh && (gh.ms.searches || 0) >= 2) talonsAdd(h, 3, 'Looter');
      if (rep.stars >= 3) moraleAdd(h, 1, '3 ★ mission');
      if (gh && g.missionFirst === gh.idx) moraleAdd(h, 1, 'first to complete a secret mission');
      deaths.forEach((d) => { const r = relOf(h.id, d); if (r <= -3) moraleAdd(h, 2, `an enemy died: ${ZG.Heroes.get(d).name}`); else moraleAdd(h, r >= 3 ? -2 : -1, `lost ${r >= 3 ? 'a friend' : 'a comrade'}: ${ZG.Heroes.get(d).name}`); });
      // Enemies in the same squad: −1 morale to each
      squad.forEach((o) => { if (o !== id && relOf(id, o) <= -3 && !deaths.includes(o)) moraleAdd(h, -1, `in the same squad as an enemy (${ZG.Heroes.get(o).name})`); });
    });
    (g.putDown || []).forEach((p) => { const gh = g.heroes[p.hero]; const h = gh && C.hero(c, gh.id); if (h) moraleAdd(h, 2, `laid ${ZG.Heroes.get(p.turned).name} to rest`); });

    // 2b) relations: mission events + a joint 3 ★ mission (both survived) — +1
    rep.rel = [];
    squad.forEach((a, i) => squad.slice(i + 1).forEach((b) => {
      if (deaths.includes(a) || deaths.includes(b) || !C.hero(c, a) || !C.hero(c, b)) return;
      const k = pairKey(a, b), from = C.rel(c, a, b);
      const ev = ((g.relDelta || {})[k] || []).slice();
      let n = from + ev.reduce((s2, x) => s2 + x.d, 0);
      if (rep.stars >= 3) { ev.push({ d: 1, why: 'completed a mission together at 3 ★' }); n++; }
      C.relSet(c, a, b, n);
      const to = C.rel(c, a, b);
      if (to !== from) rep.rel.push({ a, b, from, to, why: ev.map((x) => `${x.d > 0 ? '+' : ''}${x.d} ${x.why}`) });
    }));

    // 2c) the rescued prisoner (mission 7) joins the shelter right away — at the squad's level; picks talents at the start of the next mission
    if (g.scenarioId === 'wedding' && g.obj && g.obj.rescued && !C.hero(c, 'gleb') && !c.fallen.includes('gleb')) {
      const lead = C.hero(c, squad[0]) || c.roster[0];
      const h = newHero(c, 'gleb', lead ? lead.player : 1, lead ? lead.ai : false);
      const lv = c.roster.length ? Math.max(1, Math.round(c.roster.reduce((a, x) => a + x.level, 0) / c.roster.length)) : 1;
      const XP = CFG().xpLevels;
      h.level = lv; h.xp = lv > 1 ? XP[lv - 2] : 0; h.talentQueue = Array.from({ length: lv - 1 }, (_, i) => i);
      c.roster.push(h);
      rep.joined = 'gleb';
    }

    // 3) the wandering: turned allies whose monster stayed on the board (or never appeared)
    const turnedNow = g.heroes.filter((gh) => gh.turned).map((gh) => gh.id);
    // in a mission without wanderers (noWanderers) the turned were not released — they have not gone anywhere
    const released = (id) => (g.wanderers || []).some((w) => w.type === 'turned_' + id);
    const alive = (id) => g.zombies.some((z) => z.type === 'turned_' + id) || (g.wanderers || []).some((w) => w.type === 'turned_' + id && !w.out) || (c.wanderers.includes(id) && !released(id) && !turnedNow.includes(id));
    c.wanderers = c.wanderers.concat(turnedNow).filter((id, i, a) => a.indexOf(id) === i && alive(id));
    rep.wanderers = c.wanderers.slice();

    // 4) between missions: rest, ration, recovery, bathhouse
    // retreat: survivors of the squad −1 morale, the mission will have to be replayed
    if (rep.retreat) squad.forEach((id) => { const h = C.hero(c, id); if (h) moraleAdd(h, -1, 'retreat'); });
    if (rep.win || rep.retreat) c.roster.forEach((h) => {
      const went = squad.includes(h.id);
      if (!went) {
        if (C.built(h, 'redcorner') && Rng.next(rng) < 0.5) line(h.id, 'Red Corner: morale did not drop');
        else moraleAdd(h, -1, 'sat it out in the shelter');
      }
      let heal = 0;
      if (h.talons >= P.ration) { h.talons -= P.ration; line(h.id, `−${P.ration} 🎫 ration`); heal++; }
      else if (!rep.retreat) moraleAdd(h, -1, 'could not afford a ration'); // after a retreat morale has already dropped — no double penalty
      if (!went) heal++; // rest
      if (C.built(h, 'infirmary')) heal++;
      if (C.has(h, 'sh_tough')) heal++;
      heal = Math.min(heal, h.injury);
      if (heal) { h.injury -= heal; line(h.id, `+${heal} Grit`); }
      if (h.morale < 3 && C.built(h, 'bath') && Rng.next(rng) < 0.5) moraleAdd(h, 1, 'bathhouse');
      if (C.built(h, 'stash')) {
        const it = item(c, Rng.pick(c, C.STASH));
        (h.chest.length < C.chestCap(h) ? h.chest : h.junk).push(it);
        line(h.id, `Stash: "${ZG.Cards.get(it.id).name}"`);
      }
      h.morale = Math.max(0, Math.min(M.max, h.morale));
    });
    c.roster.forEach((h) => { h.morale = Math.max(0, Math.min(M.max, h.morale)); }); // morale stays within the scale even on a failure

    if (rep.retreat) { c.retreats = C.retreatsLeft(c) - 1; rep.retreatsLeft = c.retreats; }
    else c.missionNo++;
    c.current = null;
    c.report = rep;
    c.updated = Date.now();
    if (!rep.win && !rep.retreat) { c.status = 'over'; c.endReason = 'Mission failed: ' + (rep.reason || '') + (c.retreats === 0 ? ' There is nowhere left to retreat.' : ''); }
    else if (c.missionNo >= c.chainLength) {
      c.status = 'won'; c.endReason = 'Campaign completed!';
      // the fence's last visit: Valuables carried out of the last mission are not lost
      rep.finalSale = [];
      c.roster.forEach((h) => { h.junk.concat(h.chest).filter((it) => C.isValuable$(it.id)).forEach(() => { const p = C.appraise(c); h.talons += p; c.haul = (c.haul || 0) + p; rep.finalSale.push({ hero: h.id, price: p }); }); h.junk = h.junk.filter((it) => !C.isValuable$(it.id)); h.chest = h.chest.filter((it) => !C.isValuable$(it.id)); });
    }
    else {
      c.status = 'ready';
      rep.hint = C.personaHint(c, g); // sometimes — a hint at the hidden personality of someone in the squad
      C.drawEvent(c); // shelter event phase: a card is drawn from the deck (8 events + 8 blanks)
      rep.hired = C.hireAI(c); // an AI squad hires recruits by itself
      c.roster.forEach((h) => { if (h.ai) C.autoManage(c, h.id); });
      C.checkSquad(c);
    }
    return rep;
  };

  // Hints at hidden personalities (src/ai/persona.js) in the shelter report: at most one and not always (50%),
  // not the same hero twice in a row, one hero trait at most twice per campaign. A mission event beats generic phrases.
  const HINTS = {
    honor: ['{n} silently tore up some note and threw it into the fire. "You don\'t sell out your own," was all {he|she} said.', '{n} has no time for talk behind people\'s backs: "Whoever sets up one of ours is no friend of mine."'],
    greedy: ['{n} is counting {his|her} share for the third time tonight.', '{n} is hiding something in {his|her} backpack — it jingles. No point asking.'],
    modest: ['{n} took nothing from the finds: "Not mine — I don\'t touch it."', 'While the spoils were being shared, {n} silently cleaned {his|her} weapon.'],
    spender: ['{n} does not save tickets: by morning all that is left of them is new trinkets.', '{n} blew every last ticket again — and does not seem to regret it one bit.'],
    thrifty: ['{n} sewed {his|her} tickets into the lining of {his|her} jacket. For a rainy day.', '{n} keeps an expenses notebook. A neat one, in columns.'],
    bold: ['{n} was the first to charge ahead again. More scars, but the same grin.', '{n} laughs at fear. It makes the others uneasy.'],
    careful: ['{n} sat over the district map for a long time and plotted a detour. Longer, but alive.', '{n} checked every door twice before lying down.'],
    generous: ['{n} gave {his|her} ration to someone who was worse off.', '{n} shared {his|her} last bandage and did not even notice.'],
    kind: ['{n} sat all evening with the refugee woman at the gate, though she never said a word.', '{n} feeds a stray dog at the gate. The dog will not leave anymore.'],
    brave: ['{n} volunteered for the night patrol — again.', 'When something scratched in the cellar, {n} was the first to grab the flashlight.'],
    loner: ['{n} slept apart from everyone again, by the far wall.', '{n} steers clear of the talk around the fire — sits in the dark, back to the flames.'],
    hater: ['Hearing about the Wolves, {n} silently started cleaning {his|her} guns.', '{n} keeps a scrap of a balaclava with a skull on it. Nobody asks why.'],
    haterDone: ['{n} carved new notches into {his|her} grip — one for each of the Wolves.'],
  };
  const FEMALE = ['marina', 'lisa', 'kira']; // gendered pronouns in the hints
  const traitKeys = (p) => [p.honor && 'honor', p.greed >= 2 && 'greedy', p.greed === 0 && 'modest', p.spend === 'spender' && 'spender', p.spend === 'thrifty' && 'thrifty',
    p.bold > 1.1 && 'bold', p.bold < 0.9 && 'careful', p.generous && 'generous', p.kind && 'kind', p.brave && 'brave', p.loner && 'loner', p.hatesBandits && 'hater'].filter(Boolean);
  C.personaHint = function (c, g) {
    if (!ZG.Persona) return null;
    c.hints = c.hints || {};
    const used = (id, k) => c.hints[id + ':' + k] || 0;
    const cands = [];
    const FIELD = ['bold', 'careful', 'loner', 'hater']; // traits seen only in action — about those who went on the mission
    c.roster.forEach((h) => {
      if (!h.ai || h.id === c.lastHintHero) return; // only AI heroes have a personality; not the same hero twice in a row
      const p = ZG.Persona.get(h.id), gh = g && g.heroes.find((x) => x.id === h.id);
      if (p.hatesBandits && gh && (gh.ms || {}).banditKills && used(h.id, 'haterDone') < 2) cands.push({ h, k: 'haterDone', w: 3 }); // a mission event
      traitKeys(p).forEach((k) => { if (used(h.id, k) < 2 && (!FIELD.includes(k) || gh)) cands.push({ h, k, w: 1 }); });
    });
    if (!cands.length) return null;
    const ev = cands.filter((x) => x.w > 1);
    if (!ev.length && Rng.next(c) >= 0.5) return null; // generic hints — not every time
    const pick = Rng.pick(c, ev.length ? ev : cands);
    c.hints[pick.h.id + ':' + pick.k] = used(pick.h.id, pick.k) + 1;
    c.lastHintHero = pick.h.id;
    const lines = HINTS[pick.k];
    const fem = FEMALE.includes(pick.h.id);
    return lines[(used(pick.h.id, pick.k) - 1) % lines.length].replace('{n}', ZG.Heroes.get(pick.h.id).name).replace(/\{([^|{}]*)\|([^{}]*)\}/g, (m, a, b) => (fem ? b : a));
  };

  // The squad cannot be assembled (the fallen are gone and there is not enough for hiring) — the campaign is over
  // the secret hero cannot be hired — only rescued
  C.hireable = (c) => ZG.Heroes.all().filter((d) => !d.secret).map((d) => d.id).filter((id) => !C.hero(c, id) && !c.fallen.includes(id) && !c.wanderers.includes(id));
  C.checkSquad = function (c) {
    if (c.status !== 'ready' || c.roster.length >= 1) return true; // you can go with an incomplete squad
    const can = C.hireable(c).length && c.roster.some((h) => h.talons + C.sellValue(h) >= CFG().prices.hire);
    if (!can) { c.status = 'over'; c.endReason = 'The squad cannot be assembled: not enough heroes and no tickets for hiring.'; }
    return !!can;
  };

  // ------------------------------------------------------------ shelter
  const LISTS = ['equip', 'chest', 'junk'];
  const cap = (h, list) => (list === 'equip' ? C.equipCap(h) : list === 'chest' ? C.chestCap(h) : Infinity);

  C.move = function (c, heroId, from, idx, to) {
    const h = C.hero(c, heroId);
    if (!h || !LISTS.includes(from) || !LISTS.includes(to) || !h[from][idx]) return 'No such card.';
    if (from === to) return null;
    if (to === 'equip' && C.isValuable$(h[from][idx].id)) return 'Valuables are not taken on a sortie — they go to the fence.';
    if (h[to].length >= cap(h, to)) return to === 'equip' ? 'Gear is full.' : 'The chest is full.';
    h[to].push(h[from].splice(idx, 1)[0]);
    return null;
  };
  C.give = function (c, fromId, from, idx, toId) {
    const a = C.hero(c, fromId), b = C.hero(c, toId);
    if (!a || !b || a === b || !LISTS.includes(from) || !a[from][idx]) return 'Cannot give that.';
    if (b.chest.length >= C.chestCap(b)) return `${ZG.Heroes.get(b.id).name}'s chest is full.`;
    b.chest.push(a[from].splice(idx, 1)[0]);
    return null;
  };
  C.sell = function (c, heroId, from, idx) {
    const h = C.hero(c, heroId), it = h && LISTS.includes(from) && h[from][idx];
    if (!it) return 'No such card.';
    const p = C.isValuable$(it.id) ? C.appraise(c) : C.price(it.id);
    if (p == null) return 'This card cannot be sold.';
    h[from].splice(idx, 1);
    h.talons += p;
    c.lastSale = { hero: h.id, id: it.id, price: p };
    return null;
  };
  C.heal = function (c, heroId) {
    const h = C.hero(c, heroId), p = CFG().prices.heal;
    if (!h || h.injury <= 0) return 'Nothing to heal.';
    if (h.talons < p) return 'Not enough tickets.';
    h.talons -= p; h.injury--;
    return null;
  };
  // ---------------- shelter event helpers
  C.moraleAdd = (c, h, n) => { if (h) h.morale = Math.max(0, Math.min(CFG().morale.max, h.morale + n)); };
  C.relAdd = (c, a, b, n) => C.relSet(c, a, b, C.rel(c, a, b) + n);
  C.putChest = (c, h, id) => (h.chest.length < C.chestCap(h) ? h.chest : h.junk).push(item(c, id));
  C.injure = (c, h, n) => { h.injury = Math.min(C.baseHp(h) + C.hpTalents(h) - 1, h.injury + n); };
  // The shelter event deck: 8 events, one card each + 8 blanks; when it runs out it is reshuffled
  C.eventDef = (id) => (ZG.SHELTER_EVENTS || []).find((d) => d.id === id) || null;
  C.drawEvent = function (c) {
    if (!c.eventDeck || !c.eventDeck.length) c.eventDeck = Rng.shuffle(c, (ZG.SHELTER_EVENTS || []).map((d) => d.id).concat((ZG.SHELTER_BLANKS || []).map((t, i) => 'blank' + i)));
    let id = c.eventDeck.pop();
    if (id === 'trader' && C.missionDef(c).trader && c.eventDeck.length) { c.eventDeck.unshift(id); id = c.eventDeck.pop(); } // the hawker does not come on the wandering peddler's evening
    const def = C.eventDef(id);
    if (!def) { c.eventDraw = { id, blank: true, done: true, result: (ZG.SHELTER_BLANKS || [])[+id.slice(5)] || 'A quiet night.' }; return c.eventDraw; }
    if (!def.need(c)) { c.eventDraw = { id, done: true, skipped: true, result: 'The card is not played: there are no participants for it right now.' }; return c.eventDraw; }
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
    if (!def || e.done) return 'No events.';
    const opt = def.options(c, e).find((o) => o.key === key);
    if (!opt || opt.off) return 'This option is not available right now.';
    e.key = key; e.choice = opt.label; e.done = true;
    e.byAI = !!(C.hero(c, e.decider) || {}).ai;
    e.result = def.apply(c, e, key);
    return null;
  };

  // Wandering peddler: a separate shelter event before a mission whose chain entry has a trader
  // (not a card from the event deck). The wares are fixed, any number of copies of each card.
  C.trader = (c) => (c.status === 'ready' ? C.missionDef(c).trader || null : null);
  C.buy = function (c, heroId, cardId) {
    const t = C.trader(c), h = C.hero(c, heroId);
    const ware = t && t.stock.find((w) => w.id === cardId);
    if (!ware) return 'There is no peddler here.';
    if (!h) return 'No such hero.';
    if (h.talons < ware.price) return 'Not enough tickets.';
    const to = h.equip.length < C.equipCap(h) ? h.equip : h.chest.length < C.chestCap(h) ? h.chest : null;
    if (!to) return 'Nowhere to put it: free up space in your gear or chest.';
    h.talons -= ware.price;
    to.push(item(c, cardId));
    (c.traderLog = c.traderLog || []).push({ no: c.missionNo, hero: h.id, id: cardId, ai: !!h.ai });
    return null;
  };
  // AI at the peddler: buys only what is useful to this particular hero (one copy each),
  // and only if a reserve for rations and injury healing remains after the purchase
  C.wareFit = function (c, h, id) {
    const def = ZG.Heroes.get(h.id);
    const own = h.equip.concat(h.chest, h.junk).map((it) => it.id);
    const cards = def.deck.concat(own).map((x) => ZG.Cards.get(x)).filter(Boolean);
    const tagged = (t) => cards.filter((d) => (d.tags || []).includes(t)).length;
    if (own.includes(id)) return 0; // one copy per hero
    if (id === 'tr_gasmask') { // the Infection threshold is not below 1: for Boris and on "Rookie" the filter gives nothing
      const diff = ZG.Difficulties.get(c.difficultyId);
      return (def.mods && def.mods.infectDie < 0) || (diff && diff.mods && diff.mods.infectDie < 0) ? 0 : 2 + (C.desperate(h) ? 1 : 0);
    }
    if (id === 'tr_binoculars') { const n = tagged('ranged'); return n >= 2 ? 3 : n; }
    if (id === 'tr_medbag') return def.mods && def.mods.healAction ? 3 : tagged('heal') >= 2 ? 1 : 0;
    return 0;
  };
  C.traderAI = function (c, h) {
    const t = C.trader(c);
    if (!t) return [];
    const reserve = C.reserveAI(h, 2), sp = C.persona(h).spend;
    const minFit = sp === 'thrifty' ? 2 : 1, maxBuy = sp === 'thrifty' ? 1 : sp === 'spender' ? 3 : 2; // the penny-pincher takes only the essentials, the spender — everything suitable
    const bought = [];
    const before = (c.traderLog || []).filter((x) => x.no === c.missionNo && x.hero === h.id).length; // already bought this visit
    t.stock.map((w) => ({ w, fit: C.wareFit(c, h, w.id) + (sp === 'spender' ? 1 : 0) })).filter((x) => x.fit >= minFit)
      .sort((a, b) => b.fit - a.fit || a.w.price - b.w.price)
      .forEach(({ w }) => {
        if (before + bought.length >= maxBuy || h.talons - w.price < reserve) return;
        if (!C.buy(c, h.id, w.id)) bought.push(w.id);
      });
    return bought;
  };

  // Shooting Range: once between missions, +1 XP for tickets; a new level — a talent is offered at the start of the mission
  C.canTrain = (c, h) => C.built(h, 'range') && h.trainedNo !== c.missionNo && c.status === 'ready';
  C.train = function (c, heroId) {
    const h = C.hero(c, heroId), p = CFG().prices.train;
    if (!h || !C.built(h, 'range')) return 'A Shooting Range is required.';
    if (!C.canTrain(c, h)) return 'Already trained at the range.';
    if (h.talons < p) return 'Not enough tickets.';
    h.talons -= p; h.trainedNo = c.missionNo;
    const before = h.xp; h.xp++;
    CFG().xpLevels.forEach((lv, i) => { if (before < lv && h.xp >= lv) { h.level = i + 2; (h.talentQueue = h.talentQueue || []).push(i); } });
    return null;
  };
  C.repair = function (c, heroId, from, idx) {
    const h = C.hero(c, heroId), it = h && LISTS.includes(from) && h[from][idx];
    if (!it || !it.worn) return 'The card does not need repair.';
    const p = C.repairPrice(it.id);
    if (!C.built(h, 'workshop')) return 'A Workshop is required.';
    if (h.talons < p) return 'Not enough tickets.';
    h.talons -= p; it.worn = false;
    return null;
  };
  C.build = function (c, heroId, bId) {
    const h = C.hero(c, heroId), b = ZG.Buildings.get(bId);
    if (!h || !b) return 'No such building.';
    if (C.built(h, bId)) return 'Already built.';
    if (h.talons < b.cost) return 'Not enough tickets.';
    h.talons -= b.cost; h.buildings.push(bId);
    return null;
  };
  // Hiring: one hero pays. They get the recruit's gift (a unique hero card) and a debt for the recruit's 3 missions.
  // AI in the shelter: if the squad is incomplete, an AI hero with enough tickets (with a reserve for rations) hires a recruit
  C.hireAI = function (c) {
    const P = CFG().prices, out = [];
    while (c.roster.length < c.squad) {
      const payer = c.roster.filter((h) => h.ai && h.talons >= P.hire + P.ration).sort((a, b) => b.talons - a.talons)[0];
      const pool = C.hireable(c);
      if (!payer || !pool.length) break;
      const id = Rng.pick(c, pool);
      if (C.hire(c, payer.id, id)) break;
      out.push({ payer: payer.id, id });
    }
    return out;
  };
  C.hire = function (c, payerId, newId) {
    const payer = C.hero(c, payerId), P = CFG().prices;
    if (c.status !== 'ready') return 'The campaign is not in the shelter.';
    if (!payer) return 'No such hero.';
    if (!C.hireable(c).includes(newId)) return 'This hero cannot be hired.';
    if (c.roster.length >= C.rosterCap(c)) return `The shelter is full (no more than ${C.rosterCap(c)} heroes).`;
    if (payer.talons < P.hire) return 'Not enough tickets.';
    payer.talons -= P.hire;
    const h = newHero(c, newId, payer.player, payer.ai);
    // starting ration: 1 common loot card in the gear
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
  // The AI arranges cards itself: the best go to gear (intact ones over worn ones),
  // valuable ones that do not fit go to the chest, unneeded ones go to junk (sold when leaving)
  C.cardScore = (it) => (ZG.Cards.get(it.id).value || 0) - (it.worn ? 3 : 0);
  C.isValuable = (it) => { const d = ZG.Cards.get(it.id); return !!d.campaignOnly || (d.rarity && d.rarity !== 'common') || (d.value || 0) >= 8; };
  // Desperation: at half Grit or below the hero takes even small stuff on a sortie (high risk of death),
  // and prioritizes healing and protection; normally small stuff is not taken and is sold.
  C.desperate = (h) => C.hp(h) * 2 <= C.baseHp(h) + C.hpTalents(h);
  // Hidden personality (src/ai/persona.js): a ticket reserve the AI does not spend. The penny-pincher saves "for a rainy day",
  // the spender keeps only enough for a ration
  C.persona = (h) => (ZG.Persona ? ZG.Persona.get(h.id) : { spend: 'normal', greed: 1 });
  C.reserveAI = (h, heals) => {
    const P = CFG().prices, sp = C.persona(h).spend;
    if (sp === 'spender') return P.ration;
    return P.ration + Math.min(h.injury, heals) * P.heal + (sp === 'thrifty' ? 8 : 0);
  };
  C.autoManage = function (c, heroId) {
    const h = C.hero(c, heroId);
    if (!h) return 'No such hero.';
    const desp = C.desperate(h);
    const sp = C.persona(h).spend;
    C.traderAI(c, h); // the peddler comes once per campaign — his wares matter more than buildings, which can wait
    // repair (if there is a Workshop): fix what goes on the sortie or is worth keeping — the most valuable first;
    // keep a reserve for rations and injury healing; do not fix small stuff that will go to junk
    if (C.built(h, 'workshop')) {
      const reserve = C.reserveAI(h, 2);
      const pool = h.equip.concat(h.chest, h.junk).filter((it) => it.worn && C.isValuable(it))
        .sort((a, b) => (ZG.Cards.get(b.id).value || 0) - (ZG.Cards.get(a.id).value || 0));
      pool.forEach((it) => {
        const price = C.repairPrice(it.id);
        if (h.talons - price >= reserve) { h.talons -= price; it.worn = false; }
      });
    }
    // buildings: the AI builds actively — by priority, keeping a reserve for rations and injury healing
    const BUILD_ORDER = ['stash', 'infirmary', 'range', 'storage', 'workshop', 'bath', 'redcorner'];
    const keep = C.reserveAI(h, 1);
    BUILD_ORDER.forEach((bId, i) => {
      const b = ZG.Buildings.get(bId);
      if (!b || C.built(h, bId) || h.talons - b.cost < keep) return;
      if (sp === 'thrifty' && i >= 3) return; // the penny-pincher builds only the essentials
      if (bId === 'workshop' && !h.equip.concat(h.chest, h.junk).some((it) => it.worn)) return; // a workshop — when there is something to fix
      if (bId === 'bath' && h.morale > 2 && sp !== 'spender') return; // the spender builds a bathhouse just because
      C.build(c, h.id, bId);
    });
    // Shooting Range: train if enough remains for a ration and a couple of heals afterwards
    if (C.canTrain(c, h) && h.talons - CFG().prices.train >= C.reserveAI(h, 2)) C.train(c, h.id);
    const survival = (it) => { const t = ZG.Cards.get(it.id).tags || []; return t.includes('heal') || t.includes('block') ? 4 : 0; };
    const score = (it) => C.cardScore(it) + (desp ? survival(it) : 0);
    const all = h.equip.concat(h.chest, h.junk).sort((a, b) => score(b) - score(a));
    h.equip = []; h.chest = []; h.junk = [];
    all.forEach((it) => {
      if (C.isValuable$(it.id)) { h.junk.push(it); return; } // the AI hands Valuables to the fence when leaving
      if (h.equip.length < C.equipCap(h) && !ZG.Cards.get(it.id).event && (desp || C.isValuable(it))) h.equip.push(it);
      else if (C.isValuable(it) && h.chest.length < C.chestCap(h)) h.chest.push(it);
      else h.junk.push(it);
    });
    return null;
  };

  C.setControl = function (c, heroId, player, ai) {
    const h = C.hero(c, heroId);
    if (!h) return 'No such hero.';
    if (player) h.player = player;
    if (ai != null) h.ai = !!ai;
    return null;
  };

  // ------------------------------------------------------------ saves
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
  C.remove = function (slot) { const st = storage(); try { if (st) st.removeItem(KEY + slot); } catch (e) { /* no access */ } };
  C.list = function () {
    const out = [];
    for (let i = 1; i <= C.SLOTS; i++) out.push({ slot: i, c: C.load(i) });
    return out;
  };

  ZG.Campaign = C;
})(typeof globalThis !== 'undefined' ? globalThis : window);
