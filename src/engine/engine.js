/*
 * The rules engine of "Dead Block".
 *
 * The game state is a plain JSON object (except the shared immutable board field),
 * so it is easy to save, clone for the AI and run in the simulator.
 *
 * Control flow:
 *   g = Engine.create(opts)
 *   Engine.legal(g)        — list of legal actions (for the AI and highlighting)
 *   Engine.act(g, action)  — apply an action; the engine itself runs through
 *                            the automatic steps (zombie phase) until the next decision.
 *   g.pending              — a decision the engine is waiting for (block, talent choice)
 *   g.fx / g.log           — events for animations and the log
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const Rng = ZG.Rng, Mods = ZG.Mods, Board = ZG.Board;
  // XP thresholds for levels 2 and 3 (shared by all heroes; the interface draws the track from them)
  const XP_LEVELS = [4, 10];
  const REPEAT_MISSION_XP = 2; // campaign: a repeated mission whose reward was already received
  const MAX_BARRICADES = 4;
  const MAX_TRAPS = 3;
  const MAX_EQUIP = 2;

  const E = {};
  E.XP_LEVELS = XP_LEVELS;
  ZG.Engine = E;

  // ================================================================ utilities
  E.log = function (g, text, kind) {
    if (g.quiet) return;
    g.log.push({ text, kind: kind || 'info', round: g.round });
  };
  E.fx = function (g, ev) { if (!g.quiet) g.fx.push(ev); };
  E.heroName = (h) => ZG.Heroes.get(h.id).name;
  // grammar for the log: English needs no cases — only the hero's gender for pronouns (he/she, his/her)
  const DECL = { marina: [null, null, 1], lisa: [null, null, 1], kira: [null, null, 1] };
  E.heroAcc = (h) => (DECL[h.id] || [])[0] || E.heroName(h);
  E.heroGen = (h) => E.heroName(h) + "'s"; // possessive: "Marina's"
  E.fem = (h) => !!(DECL[h.id] || [])[2];
  E.g = (h, m, f) => (E.fem(h) ? f : m); // form by the hero's gender (he/she, his/her)
  E.cardDef = (g, uid) => ZG.Cards.get(g.cards[uid]);
  E.zombiesAt = (g, cell) => g.zombies.filter((z) => z.pos === cell);
  E.heroesAt = (g, cell) => g.heroes.filter((h) => h.onBoard && h.pos === cell);
  E.zombie = (g, uid) => g.zombies.find((z) => z.uid === uid);
  E.newUid = (g, prefix) => prefix + (g.nextUid++);
  E.woundCount = (g, h) => h.deck.concat(h.hand, h.discard).filter((u) => g.cards[u] === 'wound').length;
  E.infectCount = (g, h) => h.deck.concat(h.hand, h.discard).filter((u) => g.cards[u] === 'infection').length;
  // Wounds for falling, "On the Edge" and target choice: an Infection is also a Wound (if hurts)
  E.hurtCount = (g, h) => E.woundCount(g, h) + ((ZG.Levels.get(g.levelId).infection || {}).hurts ? E.infectCount(g, h) : 0);
  E.infectTurnAt = (g) => ((ZG.Levels.get(g.levelId).infection || {}).turnAt || 3);
  // injuries (campaign): untreated wounds from past missions lower Grit
  E.maxHp = (g, h) => Math.max(1, Mods.value(g, h, 'hp', ZG.Heroes.get(h.id).hp) - (h.injury || 0));
  // "Loner": when solo the hero holds 1 more card
  // Fatigue: cards discarded to block go to the fatigue pile (not the discard) and return only with "Catch Breath".
  // 3+ cards in the pile — the hero is "Exhausted": hand −1, basic non-card actions are unavailable, including movement (except "Catch Breath")
  E.EXHAUST_AT = 3;
  E.exhausted = (g, h) => (h.exhaust || []).length >= E.EXHAUST_AT;
  // squad size for scaling difficulty: the number of heroes who went on the mission
  E.party = (g) => g.partySize || g.heroes.length;
  E.PUNCH_COST = 2; // a basic blow without a card is expensive: fat enemies cannot be punched to death in a turn
  E.TIRED_LOCK = ['move', 'shout', 'foreman', 'search', 'punch', 'pickup', 'barricade', 'heal', 'cleanse', 'burn', 'plug', 'shut', 'give', 'ttshot'];
  // Relations (campaign): a −3…+3 scale for each pair. g.relStart — at the start of the mission (effects), g.relDelta — changes during the mission.
  // Friends (+3) — Bond; Pals (+1…+2) — giving without the "once per turn" limit; Dislike (−1…−2) — no giving;
  // Enemies (−3) — ending your turn on an enemy's tile: they get −1 ⚡ next turn.
  E.relKey = (a, b) => [a, b].sort().join('|');
  E.rel = (g, a, b) => ((g.relStart || {})[E.relKey(a.id || a, b.id || b)] || 0);
  // relation change during a mission: each reason at most once per pair per mission
  E.relBump = function (g, a, b, d, why, text) {
    if (!g.campaign || !a || !b || a === b) return;
    const k = E.relKey(a.id, b.id);
    g.relWhy = g.relWhy || {};
    if (g.relWhy[k + '#' + why]) return;
    g.relWhy[k + '#' + why] = 1;
    g.relDelta = g.relDelta || {};
    (g.relDelta[k] = g.relDelta[k] || []).push({ d, why: text });
    E.log(g, `Relations between ${E.heroName(a)} and ${E.heroName(b)}: ${d > 0 ? '+' : '−'}${Math.abs(d)} — ${text}.`, d > 0 ? 'good' : 'warn');
  };
  // Bond (campaign): a partner ended their turn on your tile — the first card of your next turn triggers with a Chain
  E.bondPartners = (g, h) => (g.bonds || []).filter((p) => p.includes(h.id)).map((p) => g.heroes.find((o) => o.id === (p[0] === h.id ? p[1] : p[0]))).filter((o) => o && o.onBoard);
  E.chainsNow = (g, def) => !!g.turn && def.suit !== 'none' && (g.turn.lastSuit === def.suit || (!!g.turn.bond && !g.turn.played && !!def.chainText));
  // giving: normally once per turn; Pals and Friends — no limit, with Dislike and Enmity — not allowed
  E.canGiveTo = (g, h, o) => { const r = E.rel(g, h, o); return r >= 0 && (!g.turn.gave || r >= 1); };
  E.handSize = (g, h) => Mods.value(g, h, 'handSize', ZG.Heroes.get(h.id).hand) + (E.party(g) === 1 ? 1 : 0) - (E.exhausted(g, h) ? 1 : 0);
  // what makes up hand size (for the interface tooltip)
  E.handSizeParts = function (g, h) {
    const parts = [{ name: 'Hero base', n: ZG.Heroes.get(h.id).hand }];
    Mods.sources(g, h).forEach((src) => {
      const m = src.mods && src.mods.handSize;
      const n = m == null ? 0 : typeof m === 'function' ? m(g, h) : m;
      if (n) parts.push({ name: src.name, n });
    });
    if (E.party(g) === 1) parts.push({ name: 'Loner (solo)', n: 1 });
    if (E.exhausted(g, h)) parts.push({ name: 'Exhausted', n: -1 });
    return parts;
  };
  E.activeHero = (g) => (g.active == null ? null : g.heroes[g.active]);
  E.maxRounds = (g) => { const l = ZG.Levels.get(g.levelId); return Mods.value(g, null, 'maxRounds', l.rounds + ((l.roundsBonus || {})[Math.min(4, E.party(g))] || 0)); };
  E.alarmThreshold = (g) => {
    // Wave threshold: a number or a table by squad size { 1: 6, 4: 5 }
    const t = ZG.Levels.get(g.levelId).alarmThreshold;
    const base = typeof t === 'number' ? t : t[Math.min(4, E.party(g))];
    return Math.max(3, Mods.value(g, null, 'alarmThreshold', base));
  };
  E.phase = function (g, round) {
    const lvl = ZG.Levels.get(g.levelId);
    const r = (round || g.round) + Mods.value(g, null, 'phaseShift', 0);
    const deep = Mods.value(g, null, 'deepShift', 0); // shifts only the Dead of Night
    let p = 0;
    lvl.phaseStarts.forEach((s, i) => { if (r + (i === 2 ? deep : 0) >= s) p = i; });
    return p;
  };
  // phase name: a "day only" level (dayOnly) knows neither dusk nor night
  E.phaseName = (g, ph) => (ZG.Levels.get(g.levelId).dayOnly ? 'Day' : ZG.PHASES[ph == null ? E.phase(g) : ph].name);
  E.scenario = (g) => ZG.Scenarios.get(g.scenarioId);
  E.isComplete = (g) => E.scenario(g).isComplete(g);
  E.barricadeAt = (g, a, b) => g.barricades.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  // ---- Doors and cover: an entrance to an interior (a passage between an interior and a street/another interior) ----
  const doorKey = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
  E.isEntrance = (g, a, b) => {
    const ca = g.board.cells[a], cb = g.board.cells[b];
    return !!(ca.bld || cb.bld) && ca.bld !== cb.bld;
  };
  E.doorClosed = (g, a, b) => !!g.doors && E.isEntrance(g, a, b) && !g.doors[doorKey(a, b)];
  // all entrances of an interior (bld) — pairs [inside, outside]
  E.entrances = (g, bld) => {
    const out = [];
    g.board.cells.forEach((c) => { if (c.bld === bld) g.board.adj[c.i].forEach((n) => { if (g.board.cells[n].bld !== bld) out.push([c.i, n]); }); });
    return out;
  };
  // a hero in cover: in an interior, all doors closed, no noise made inside
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
      // creak: a noise token on the outer side of the door, Alarm does not rise
      const outside = g.board.cells[a].bld && g.board.cells[b].bld !== g.board.cells[a].bld && g.board.cells[b].type === 'street' ? b : g.board.cells[a].type === 'street' ? a : b;
      g.noise[outside] = (g.noise[outside] || 0) + 1;
      E.fx(g, { t: 'noise', pos: outside, n: 1 });
      E.hear(g, outside, Mods.flag(g, hero, 'loud') ? 2 : 1, hero.idx);
      E.log(g, `${E.heroName(hero)} opens a door — creak!`, 'dim');
    }
  }
  E.openDoor = openDoor;

  // ---- Stealth: zombies "wander" until they notice a hero; "hunting" ones go to the hero or to their last trail ----
  const SIGHT = 4; // sight range in a straight line
  E.alerted = (g) => !!g.stealth && g.alertUntil >= g.round;
  // does the zombie see the hero: own zone, adjacent (through a passage) or a straight line through open passages
  E.sees = function (g, z, h) {
    if (!h.onBoard || h.hidden || E.hidden(g, z.pos)) return false;
    const zd = ZG.Zombies.get(z.type);
    // "Hunter's Instinct" (the Forester) works only when awake; asleep he notices heroes by the normal lurking rules
    const tracker = zd.tracker && !z.lurk;
    if (E.alerted(g) || zd.relentless || z.relentless) return true; // Wave / Relentless (or following a trail): they know where everyone is
    if (z.pos === h.pos) return true;
    // "Hunter's Instinct" (the Forester): notices those lying low, the silent and those using "Silent Step"
    if (h.lurk && !tracker) return false; // "Lie Low": seen only in your own zone
    // wandering zombies do not notice the silent hero (Sava) or someone using "Silent Step"
    const quiet = !z.awake && g.turn && g.active === h.idx && g.turn.quiet && !tracker;
    if (quiet) return false;
    if (g.board.adj[z.pos].includes(h.pos)) return true;
    if ((!z.awake || zd.watch) && Mods.flag(g, h, 'stealthy') && !tracker) return false; // the silent are not noticed from afar (nor by a sniper on post)
    if (Mods.flag(g, h, 'loud') && E.distV(g, z.pos)[h.pos] <= 2) return true; // the loud one is heard 2 zones away
    if (E.sheltered(g, h)) return false;
    return lineSight(g, z.pos, h.pos, zd.sight);
  };
  // line of sight: up to SIGHT zones in a straight line through open passages (closed doors block the view)
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
  // ---- Bandits: a third side. To a bandit both heroes and zombies are enemies (equally); to zombies — both heroes and bandits ----
  // Campaign story inserts: atmospheric text (and an illustration) at a key moment of the mission, once per game.
  // The mission sets g.stories: { event: insert id } (id — a ZG.STORIES key).
  E.story = function (g, id) {
    if (!g.campaign || !id || !ZG.STORIES || !ZG.STORIES[id]) return;
    g.storySeen = g.storySeen || {};
    if (g.storySeen[id]) return;
    g.storySeen[id] = true;
    E.fx(g, { t: 'story', id });
  };
  E.storyEvent = (g, key) => E.story(g, g.stories && g.stories[key]);
  // a task may forbid evacuation (for example, while a sentry stands at the barrier)
  // in combat you can only give what was found: finds, mission cargo and campaign cards (gifts, trophies); the hero's base cards — no
  E.canGive = (g, uid) => { const d = ZG.Cards.get(g.cards[uid]); return !!(d && (d.loot || d.kind === 'cargo' || d.campaignOnly)); };
  E.canEvac = (g, h) => { const sc = E.scenario(g); return !sc.canEvac || sc.canEvac(g, h, E); };
  // "Frenzy": a dead one (not a bandit) on a tile from g.frenzyTiles acts twice in the zombie phase
  E.frenzied = (g, z) => !!(g.frenzyTiles && z && !E.isBandit(z) && g.frenzyTiles.includes(g.board.cells[z.pos].tile));
  E.isBandit = (z) => !!z && ZG.Zombies.get(z.type).faction === 'bandit';
  // does a creature see another creature (zombie ↔ bandit): own zone, adjacent or a straight line
  E.seesFoe = function (g, z, o) {
    if (E.hidden(g, z.pos) || E.hidden(g, o.pos)) return false;
    if (z.pos === o.pos || g.board.adj[z.pos].includes(o.pos)) return true;
    return lineSight(g, z.pos, o.pos, ZG.Zombies.get(z.type).sight);
  };
  // enemy creatures (not heroes): for a bandit — mobile zombies, for a zombie — bandits
  E.foesOf = (g, z) => g.zombies.filter((o) => o !== z && E.isBandit(o) !== E.isBandit(z) && !ZG.Zombies.get(o.type).immobile);
  // whom a creature sees: heroes + enemy creatures (positions)
  E.seenFoes = (g, z) => g.heroes.filter((h) => E.sees(g, z, h)).map((h) => ({ pos: h.pos, hero: h }))
    .concat(E.foesOf(g, z).filter((o) => E.seesFoe(g, z, o)).map((o) => ({ pos: o.pos, foe: o })));
  // a bandit's target: an enemy in his zone (all equal — random), otherwise the nearest one in the line of fire (up to 2 zones)
  const BANDIT_RANGE = 2;
  E.banditTarget = function (g, z, pick) {
    if (E.hidden(g, z.pos) || (g.stealth && !z.awake)) return null;
    const range = ZG.Zombies.get(z.type).range != null ? ZG.Zombies.get(z.type).range : BANDIT_RANGE;
    const at = (cell) => E.heroesAt(g, cell).filter((h) => !h.hidden).map((h) => ({ hero: h, pos: cell }))
      .concat(E.foesOf(g, z).filter((o) => o.pos === cell).map((o) => ({ foe: o, pos: cell })));
    const here = at(z.pos);
    if (here.length) return pick && here.length > 1 ? Rng.pick(g, here) : here[0];
    if (!range) return null; // melee only
    const line = E.line(g, z.pos, range).filter((c) => c.dist >= 1).sort((a, b) => a.dist - b.dist);
    for (const c of line) {
      // cover (sandbags): heroes in this zone are not shot at; a shot needs a direct line of sight (a closed door always protects)
      const list = at(c.cell).filter((t) => (t.hero ? E.sees(g, z, t.hero) && !(g.cover || []).includes(c.cell) && lineSight(g, z.pos, c.cell, range) && !E.sheltered(g, t.hero) : lineSight(g, z.pos, c.cell, range)));
      if (list.length) return Object.assign(pick && list.length > 1 ? Rng.pick(g, list) : list[0], { shot: true });
    }
    return null;
  };
  // Lurking packs under "Pack/Empty" cards: a face-down card is put on each candidate tile,
  // n of them are "Pack". The pack lurks in the center of the tile; token counters above the fog are hidden (so as not to give away the spot).
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
  // a lurking zombie (stays put until woken)
  E.lurker = function (g, type, cell) {
    const z = E.spawnZombie(g, type, cell, null, true, true, true);
    if (z) { z.awake = false; z.lurk = true; z.trail = null; }
    return z;
  };
  // wakes every zombie on the board and removes "lurking"; everyone heads for the event's location
  E.wakeAll = function (g, cell, why) {
    g.zombies.forEach((z) => { if (ZG.Zombies.get(z.type).immobile) return; z.lurk = false; wake(g, z, cell, true); });
    E.log(g, `${why}: every zombie in the block woke up and is coming here!`, 'bad');
    E.fx(g, { t: 'wakeall', pos: cell, why });
  };
  function wake(g, z, trail, sound, by) {
    if (!z.awake) { z.awake = true; E.fx(g, { t: 'zwake', zombie: z.uid, pos: z.pos, sound: !!sound }); if (ZG.Zombies.get(z.type).boss) E.storyEvent(g, 'bossWake'); }
    if (z.lurk && !z.post) { if (ZG.Zombies.get(z.type).tracker) z.relentless = true; z.lurk = false; } // the woken no longer lurk (and the Forester never loses the trail); a sentry stays on post
    if (by != null) z.wokenBy = by; // who set it on (for the "Traitor" mission)
    if (trail != null) z.trail = trail;
  }
  // zombies notice heroes (after every hero action and in the zombie phase)
  // skip — the index of a hero not checked yet (the silent one on their own turn: noticed at the end of the turn)
  E.perceive = function (g, skip) {
    const sc = E.scenario(g);
    if (sc.watch) sc.watch(g, E); // tasks with their own "traps" (for example, "Pack/Empty" cards on an open board)
    if (!g.stealth) return;
    g.zombies.forEach((z) => {
      if (ZG.Zombies.get(z.type).immobile) return;
      const seen = E.seenFoes(g, z).filter((t) => !t.hero || t.hero.idx !== skip);
      if (!seen.length) return;
      if (seen.length > 1) { const d = E.distV(g, z.pos); seen.sort((a, b) => d[a.pos] - d[b.pos]); }
      wake(g, z, seen[0].pos);
    });
  };
  // noise is heard radius zones away: wanderers wake up, and everyone who does not see a hero goes to check
  E.hear = function (g, cell, radius, by) {
    if (!g.stealth || radius <= 0 || cell == null) return;
    const d = E.distV(g, cell);
    g.zombies.forEach((z) => {
      if (ZG.Zombies.get(z.type).immobile || E.hidden(g, z.pos) || d[z.pos] > radius) return;
      if (z.awake && E.seenFoes(g, z).length) return; // sees an enemy — not distracted
      wake(g, z, cell, true, by);
    });
  };
  // end of the zombie phase: whoever does not see a hero and has reached the last trail loses it and wanders again
  function loseTrack(g) {
    if (!g.stealth) return;
    g.zombies.forEach((z) => {
      if (!z.awake || z.relentless || ZG.Zombies.get(z.type).relentless || ZG.Zombies.get(z.type).immobile || ZG.Zombies.get(z.type).watch) return; // a sniper is always on post; one following a trail does not lose it
      const seen = E.seenFoes(g, z);
      if (seen.length) { z.trail = seen[0].pos; return; }
      if (z.trail != null && z.trail !== z.pos && E.distV(g, z.pos)[z.trail] !== Infinity) return; // follows the last trail (if it can be reached)
      z.awake = false; z.trail = null; z.wokenBy = null;
      E.fx(g, { t: 'zsleep', zombie: z.uid, pos: z.pos });
    });
  }
  // where a wandering zombie shambles (one die per phase): 1–2 toward the nearest manhole, 3–4 toward the board center, 5–6 stays
  function wanderGoal(g, z) {
    const r = (g.zs && g.zs.wander) || 6;
    if (r >= 5) return null;
    const d = E.distV(g, z.pos);
    let goal = null;
    // cutthroat: instead of a manhole — toward his camp (1–2), toward the center (3–4), stays (5–6)
    if (ZG.Zombies.get(z.type).patrol && r <= 2) return z.home != null && z.home !== z.pos ? z.home : null;
    const loot = E.isBandit(z) && !ZG.Zombies.get(z.type).patrol && r <= 4 ? E.lootSpots(g).filter((p) => !E.hidden(g, p) && d[p] < Infinity) : [];
    if (loot.length) {
      // looter bandit: instead of a manhole — toward the nearest crate or Search token (when he gets there — he cleans it out)
      loot.forEach((p) => { if (goal == null || d[p] < d[goal]) goal = p; });
    } else if (E.isBandit(z) && !ZG.Zombies.get(z.type).patrol) {
      return null; // no loot in sight — stays
    } else if (r <= 2 && !ZG.Zombies.get(z.type).patrol) {
      g.spawnPoints.forEach((p) => { if (!E.hidden(g, p) && (goal == null || d[p] < d[goal])) goal = p; });
    } else {
      const b = g.board, cx = (b.w - 1) / 2, cy = (b.h - 1) / 2;
      // the passable zone nearest the center
      let best = null, bk = Infinity;
      b.cells.forEach((c) => { if (c.type === 'blocked' || E.hidden(g, c.i) || d[c.i] === Infinity) return; const k = Math.abs(c.x - cx) + Math.abs(c.y - cy); if (k < bk) { bk = k; best = c.i; } });
      goal = best;
    }
    return goal === z.pos ? null : goal;
  }
  // Looting: a bandit on a closed crate or Search token takes the loot into his bag (it drops when he is killed)
  E.banditLoot = function (g, z) {
    const zd = ZG.Zombies.get(z.type);
    if (z.lurk || z.hunt || z.post || zd.static || zd.hunter) return; // sentries, hunters, snipers and the boss leave loot alone — wanderers loot
    if (E.hidden(g, z.pos)) {
      // in the fog: on a 1–4 of the wanderer die the bandit cleans out the nearest crate/cache on his tile (the token stays on the tile back)
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
      E.log(g, cr.card ? `A bandit breaks open a crate and takes "${ZG.Cards.get(cr.card).name}"! Kill him to get it back.` : 'A bandit breaks open a crate — empty.', cr.card ? 'bad' : 'dim');
    } else {
      g.search.splice(g.search.indexOf(st), 1);
      const i = g.lootDeck.findIndex((id) => id !== 'ambush');
      if (i >= 0) z.bag.push(g.lootDeck.splice(i, 1)[0]);
      E.log(g, 'A bandit cleans out a cache: the find goes into his bag.', 'warn');
    }
    E.fx(g, { t: 'loot_bandit', zombie: z.uid, pos: z.pos });
  };
  // a bandit's death: the bag spills out in the zone; devoured by zombies — he rises as a Shambler
  E.banditDeath = function (g, z, kind) {
    (z.bag || []).forEach((card) => g.drops.push({ pos: z.pos, card }));
    if ((z.bag || []).length) E.log(g, `Loot spills out of the bandit's bag (${z.bag.length}) — pick it up.`, 'good');
    if (kind === 'bite') {
      g.stats.banditBitten = (g.stats.banditBitten || 0) + 1;
      E.storyEvent(g, 'banditBitten');
      E.log(g, 'The devoured bandit twitches… and rises as a Shambler.', 'bad');
      const w = E.spawnZombie(g, 'walker', z.pos, null, true, true, true);
      if (w) { w.awake = true; w.trail = z.pos; }
    }
  };
  // what a bandit can clean out: closed crates and Search tokens
  E.lootSpots = (g) => g.crates.filter((c) => !c.opened).map((c) => c.pos).concat(g.search.map((x) => x.pos));
  E.dist = (g, from, passable) => Board.bfs(g.board, from, passable);
  // ---- Fog of War: closed tiles ----
  E.hidden = (g, cell) => !!g.revealed && !g.revealed[g.board.cells[cell].tile];
  // distance only across open tiles (what heroes and zombies can see)
  E.distV = (g, from, passable) => Board.bfs(g.board, from, (a, b) => !E.hidden(g, b) && (!passable || passable(a, b)));
  E.line = (g, from, R) => Board.lineCells(g.board, from, R, (c) => E.hidden(g, c));
  E.reveal = function (g, ti, why) {
    if (!g.revealed || g.revealed[ti]) return;
    g.revealed[ti] = true;
    const def = ZG.Tiles.get(g.board.tiles[ti].id);
    const n = g.zombies.filter((z) => g.board.cells[z.pos].tile === ti).length;
    resolveDecoys(g, ti);
    const nb = g.zombies.filter((z) => g.board.cells[z.pos].tile === ti && E.isBandit(z)).length, nz = n - nb;
    E.log(g, `${why || 'Scouting'}: tile "${def.name}" revealed${nz ? ` — ${nz} ${ZG.util.plural(nz, 'zombie', 'zombies', 'zombies')} there` : ''}${nb ? `${nz ? ' and' : ' —'} ${nb} ${ZG.util.plural(nb, 'bandit', 'bandits', 'bandits')}${nz ? '' : ' there'}` : ''}${n ? '!' : '.'}`, n ? 'bad' : 'info');
    E.fx(g, { t: 'reveal', tile: ti, n, why });
    const here = g.zombies.filter((z) => g.board.cells[z.pos].tile === ti);
    if (g.stackTiles && g.stackTiles.includes(ti) && here.some((z) => z.lurk)) E.storyEvent(g, 'packReveal');
    if (here.some((z) => E.isBandit(z))) E.storyEvent(g, 'firstBandit');
    wanderCheck(g, ti);
  };
  // Wandering threat (turned allies from past missions, location bosses): when a tile is revealed —
  // a die for each, on a "6" it appears here; on the last closed tile — without a roll.
  // Appears in the zone of the tile farthest from the heroes; wandering in stealth mode.
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
      E.log(g, `${last ? 'The last tile' : 'A "6" on the die'}: ${zd.name} is roaming here!`, 'bad');
      E.fx(g, { t: 'wanderer', ztype: w.type, pos: cell, zombie: z && z.uid });
    });
  }
  // revealing decoys when a tile is flipped
  function resolveDecoys(g, ti) {
    const list = E.decoysOn(g, ti);
    if (!list.length) return;
    g.decoys = g.decoys.filter((d) => !list.includes(d));
    const cnt = { gone: 0, lair: 0, ambush: 0, tracks: 0 };
    list.forEach((d) => {
      cnt[d.kind]++;
      if (d.kind === 'gone') (g.decoyBag = g.decoyBag || []).push('gone'); // "Gone" goes back into the bag
      if (d.kind === 'lair') {
        g.search.push({ pos: d.pos, kind: 'armory' });
        E.fx(g, { t: 'objective', pos: d.pos, text: 'LAIR' });
      } else if (d.kind === 'ambush') {
        const p = E.nearest(g, d.pos, g.spawnPoints.filter((x) => !E.plugged || !E.plugged(g, x)));
        if (p != null) { E.fx(g, { t: 'objective', pos: p, text: 'AMBUSH!' }); drawSpawn(g, p); }
      } else if (d.kind === 'tracks') {
        const dd = E.distV(g, d.pos);
        let best = null;
        g.zombies.forEach((z) => { if (!ZG.Zombies.get(z.type).immobile && !E.hidden(g, z.pos) && dd[z.pos] < Infinity && (!best || dd[z.pos] < dd[best.pos])) best = z; });
        if (best) { if (g.stealth) wake(g, best, d.pos, true); else g.noise[d.pos] = (g.noise[d.pos] || 0) + 1; }
        E.fx(g, { t: 'objective', pos: d.pos, text: 'TRACKS' });
      }
    });
    const parts = [];
    if (cnt.gone) parts.push(`${cnt.gone} — "gone"`);
    if (cnt.lair) parts.push('a lair with supplies');
    if (cnt.ambush) parts.push('ambush: zombies crawl out of the nearest manhole');
    if (cnt.tracks) parts.push('fresh tracks — someone is coming here');
    E.log(g, `Decoys in the fog: ${parts.join(', ')}.`, cnt.ambush ? 'bad' : 'info');
    if (cnt.gone && cnt.gone === list.length) E.fx(g, { t: 'objective', pos: list[0].pos, text: 'EMPTY' });
  }
  // adjacent zones of closed tiles (by side) that one can try to step into
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
    c.board = b; c.quiet = true; c.sim = true; // a copy for bot lookahead: the task's hidden traps do not trigger in it
    return c;
  };

  // ============================================================== creation
  E.create = function (opts) {
    const level = ZG.Levels.get(opts.levelId || 'outskirts');
    const seed = String(opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9));
    const g = {
      v: 2, seed, rng: Rng.seedFrom(seed), levelId: level.id,
      scenarioId: null, conditionId: null, difficultyId: opts.difficultyId || 'survivor',
      cards: {}, nextUid: 1, heroes: [], zombies: [], crates: [], safes: [], search: [], drops: [],
      lures: [], traps: [], barricades: [], doors: level.doors ? {} : null, noise: {}, spawnPoints: [],
      lootDeck: [], lootDiscard: [], spawnDeck: [], spawnDiscard: [],
      round: 1, alarm: 0, phase: 'heroes', active: null, turn: null, pending: null, zs: null,
      obj: {}, result: null, quiet: !!opts.quiet,
      stats: { kills: 0, killsBy: {}, wounds: 0, searches: 0, waves: 0, spawned: 0, fell: 0, cardsPlayed: 0, chains: 0 },
      log: [], fx: [],
      campaign: !!opts.campaign, xpLevels: opts.xpLevels || null, tileRules: opts.tileRules || null, special: opts.special || null, stories: opts.stories || null, storySeen: {}, missionTitle: opts.missionTitle || null, bonds: (opts.bonds || []).map((p) => p.slice()), relStart: Object.assign({}, opts.rel || {}), partySize: opts.partySize || null, retreats: opts.retreats || 0,
      wanderers: (opts.wanderers || []).map((type) => ({ type, out: false })),
    };
    g.board = Board.generate(level, g);
    g.scenarioId = opts.scenarioId || Rng.pick(g, level.scenarios);
    g.conditionId = opts.conditionId || Rng.pick(g, level.conditions);
    g.bonusId = opts.bonusId || (level.bonuses ? Rng.pick(g, level.bonuses) : null);

    // heroes
    opts.heroes.forEach((hs, idx) => {
      const def = ZG.Heroes.get(hs.id);
      const h = {
        idx, id: def.id, player: hs.player || 1, pos: null, deck: [], hand: [], discard: [], exhaust: [], equip: [],
        energy: 0, adrenaline: 0, block: 0, xp: 0, level: 1, talents: [], talentQueue: [],
        ai: !!hs.ai, infection: 0, ms: {}, mission: null, missionDone: false, perks: [], acted: false, onBoard: true, fallen: false, evacuated: false, hidden: false, secondWindUsed: false,
      };
      def.deck.forEach((cid) => { const u = E.newUid(g, 'c'); g.cards[u] = cid; h.deck.push(u); });
      // campaign: the hero arrives with their level, talents, injuries, gear and temporary morale cards
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
    g.stealth = opts.stealth != null ? !!opts.stealth : !!level.stealth; // stealth: zombies do not know where the heroes are
    g.alertUntil = 0; // until which round the horde knows where all heroes are (after a Wave)
    g.revealed = g.fog ? g.board.tiles.map((t, i) => i === tileOf(g, g.start) || i === tileOf(g, g.exit)) : null;
    // decks
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

    // a big squad is noisy: the Alarm is higher at the start of the game (level: startAlarm by number of heroes)
    g.alarm += (level.startAlarm || {})[Math.min(4, E.party(g))] || 0;
    // secret missions: each draws a card in secret; an unsuitable one (no ally/stealth/fog) goes to the bottom, draw a new one
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
    // starting hand: each hero immediately draws a full hand
    g.heroes.forEach((h) => drawCards(g, h, Math.max(0, E.handSize(g, h) - h.hand.length) + Mods.value(g, h, 'startDraw', 0)));
    g.fx = [];
    queueTalent(g); // campaign: a talent not chosen in the last mission is offered right away
    // initial spawning
    g.spawnPoints.forEach((p) => drawSpawn(g, p));
    E.log(g, `${g.missionTitle || `${level.campaignOnly ? 'Mission' : 'Level'} ${level.num}: ${level.name}`}. Task — "${E.scenario(g).name}". Condition — "${cond.name}".`, 'title');
    E.log(g, E.scenario(g).short, 'info');
    return g;
  };

  function edgeStreets(g) {
    const b = g.board;
    return b.cells.filter((c) => c.type === 'street' && (c.x === 0 || c.y === 0 || c.x === b.w - 1 || c.y === b.h - 1));
  }

  // Setup can be reproduced by hand (see the rules, "Setup"):
  //   start — a street zone at the left edge, exit — a street zone at the right edge,
  //   manholes — on the tiles' manhole icons, starting from the right column.
  const tileOf = (g, cell) => g.board.cells[cell].tile;
  E.tileOf = tileOf;
  function tilesByColumn(g, exclude) {
    // tiles from the far (right) column to the near one, randomly within a column
    const tiles = g.board.tiles.map((t, i) => ({ t, i })).filter((x) => !(exclude || []).includes(x.i));
    const cols = {};
    tiles.forEach((x) => { (cols[x.t.tx] = cols[x.t.tx] || []).push(x.i); });
    return Object.keys(cols).map(Number).sort((a, b) => b - a).reduce((acc, k) => acc.concat(Rng.shuffle(g, cols[k])), []);
  }
  E.tilesByColumn = tilesByColumn;
  function placeStartExit(g, level) {
    const b = g.board;
    // start: a random tile of the left column, a zone at the left edge of the board; exit — the same on the right
    const maxTx = Math.max.apply(null, b.tiles.map((t) => t.tx));
    const reqIds = ((g.tileRules && g.tileRules.required) || []).map((r) => (typeof r === 'string' ? r : r.id));
    const edgeZone = (tx, x) => {
      const col = b.tiles.map((t, i) => ({ t, i })).filter((o) => o.t.tx === tx);
      const free = col.filter((o) => !reqIds.includes(o.t.id)); // the mission's unique tiles are not revealed in advance
      const tiles = (free.length ? free : col).map((o) => o.i);
      const ti = Rng.pick(g, tiles);
      const on = b.cells.filter((c) => c.tile === ti && c.x === x && c.type !== 'blocked');
      const st = on.filter((c) => c.type === 'street');
      return Rng.pick(g, st.length ? st : on).i;
    };
    const startId = g.tileRules && g.tileRules.startTile;
    const st = startId != null ? b.tiles.findIndex((t) => t.id === startId) : -1;
    if (st >= 0) { // the mission sets the start tile
      const on = b.cells.filter((c) => c.tile === st && c.type !== 'blocked');
      const edge = on.filter((c) => c.x === 0 && c.type === 'street');
      g.start = Rng.pick(g, edge.length ? edge : on.filter((c) => c.type === 'street').length ? on.filter((c) => c.type === 'street') : on).i;
    } else g.start = edgeZone(0, 0);
    g.exit = edgeZone(maxTx, b.w - 1);
    const base = level.spawnPoints[Math.min(4, E.party(g))];
    const n = base ? Math.max(0, base + Mods.value(g, null, 'spawnPointsBonus', 0)) : 0; // a level without manholes — difficulty does not add any
    const startTile = tileOf(g, g.start);
    g.spawnPoints = [];
    tilesByColumn(g, [startTile, tileOf(g, g.exit)]).slice(0, n).forEach((ti) => {
      let cell = b.cells.find((c) => c.tile === ti && c.manhole);
      if (!cell || cell.i === g.exit) cell = Rng.pick(g, b.cells.filter((c) => c.tile === ti && c.type === 'street' && c.i !== g.exit));
      g.spawnPoints.push(cell.i);
    });
  }

  // Crates: one on each of N different tiles (except the start), from the far column;
  // on a tile — a search spot in a building (otherwise any search spot).
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
  // Exit by a point: the nearest (by steps) street zone; on a tie — further right
  E.placeExitNear = function (g, cell) {
    const d = E.dist(g, cell);
    const bad = new Set([g.start].concat(g.spawnPoints));
    const ti = g.board.cells[cell].tile;
    const onTile = g.board.cells.some((c) => c.tile === ti && c.type === 'street' && !bad.has(c.i));
    let best = null;
    g.board.cells.forEach((c) => {
      if (c.type !== 'street' || bad.has(c.i) || d[c.i] === Infinity) return;
      if (onTile && c.tile !== ti) return; // the landing — on the tower tile (it is open)
      if (!best || d[c.i] < d[best.i] || (d[c.i] === d[best.i] && c.x > best.x)) best = c;
    });
    if (best) g.exit = best.i;
  };
  // Tower: in a building on a tile of the middle column (in a row without the start, if possible)
  E.placeTower = function (g) {
    const b = g.board;
    const midX = Math.floor(b.tiles.reduce((m, t) => Math.max(m, t.tx), 0) / 2);
    const startRow = b.tiles[tileOf(g, g.start)].ty;
    // the mission's unique tiles (campaign) are not revealed in advance — no tower on them
    const reqIds = ((g.tileRules && g.tileRules.required) || []).map((r) => (typeof r === 'string' ? r : r.id));
    const mids = b.tiles.map((t, i) => ({ t, i })).filter((x) => x.t.tx === midX && !reqIds.includes(x.t.id)).sort((x, y) => (x.t.ty === startRow) - (y.t.ty === startRow));
    for (const m of mids) {
      const c = b.cells.filter((x) => x.tile === m.i && x.type === 'building');
      if (c.length) return (c.find((x) => x.tileSearch) || c[0]).i;
    }
    // no buildings in the middle column — tiles from right to left (except the start)
    for (const ti of tilesByColumn(g, [tileOf(g, g.start)].concat(b.tiles.map((t, i) => (reqIds.includes(t.id) ? i : -1)).filter((i) => i >= 0)))) {
      const c = b.cells.filter((x) => x.tile === ti && x.type === 'building');
      if (c.length) return (c.find((x) => x.tileSearch) || c[0]).i;
    }
    return b.cells.find((x) => x.type === 'building').i;
  };
  // Nests: in the center of tiles, starting from the right column (the center is impassable — an adjacent zone)
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

  // ============================================================== decks
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
        E.log(g, `${E.heroName(h)} shuffles the discard.`, 'dim');
        E.fx(g, { t: 'shuffle', hero: h.idx });
      }
      const u = h.deck.shift();
      h.hand.push(u);
      drawn++;
      if (ZG.Cards.get(g.cards[u]).drainOnDraw) {
        if (g.turn && g.active === h.idx && !g.turn.starting) { h.energy = Math.max(0, h.energy - 1); E.log(g, `${E.heroName(h)}: "Despair" — −1 ⚡.`, 'warn'); }
        else h.drainDue = (h.drainDue || 0) + 1;
      }
      E.fx(g, { t: 'draw', hero: h.idx, card: u });
    }
    return drawn;
  }

  // A bite: a die for each unblocked zombie hit. 1..die — Infection, otherwise a Wound.
  function bite(g, h, n, attackers) {
    if (n <= 0) return;
    const inf = ZG.Levels.get(g.levelId).infection;
    // one roll per biting zombie (not per point of damage); an infectious one (Turned Marina) — Infection without a roll
    const all = (attackers || []).map((u) => E.zombie(g, u)).filter(Boolean);
    const list = all.filter((z) => !E.isBandit(z)); // bandits wound but do not infect
    const rolls = all.length && !list.length ? 0 : Math.min(n, Math.max(1, list.length));
    let infections = 0;
    for (let i = 0; i < rolls; i++) {
      const z = list[i];
      const always = z && ZG.Zombies.get(z.type).infects;
      const roll = 1 + Rng.int(g, 6);
      if (inf && (always || roll <= Math.max(1, Mods.value(g, h, 'infectDie', inf.die)))) infections++; // the Infection die never goes below 1: there is no full immunity
    }
    const wounds = n - infections;
    if (infections) {
      // the Infection card is shuffled into the draw deck — the bite will make itself felt soon
      for (let i = 0; i < infections; i++) { const u = E.newUid(g, 'i'); g.cards[u] = 'infection'; if (inf.hand) { h.hand.push(u); continue; } const span = inf.top ? Math.min(inf.top, h.deck.length) : h.deck.length; h.deck.splice(Rng.int(g, span + 1), 0, u); }
      g.stats.infections = (g.stats.infections || 0) + infections;
      E.log(g, `${E.heroName(h)}: bitten! Infection ×${infections}${inf.hand ? ' — into hand' : ' (shuffled into the deck)'}.`, 'bad');
      E.fx(g, { t: 'infect', hero: h.idx, pos: h.pos, n: infections });
    }
    addWounds(g, h, wounds);
  }
  E.bite = bite;

  // End of turn: each Infection in hand advances the track, the card goes to the discard
  function tickInfection(g, h) {
    const inHand = h.hand.filter((u) => g.cards[u] === 'infection');
    if (!inHand.length) return;
    h.infection += inHand.length;
    h.hand = h.hand.filter((u) => g.cards[u] !== 'infection');
    inHand.forEach((u) => h.discard.push(u));
    const at = E.infectTurnAt(g);
    E.log(g, `${E.heroName(h)}: the infection spreads — ${Math.min(h.infection, at)}/${at}.`, 'bad');
    E.fx(g, { t: 'infectTick', hero: h.idx, pos: h.pos, n: h.infection, at });
    if (h.infection >= at) turnHero(g, h);
  }

  // all mission cargo drops in the zone; besides it — 2 random FINDS of the hero (finds, trophies, campaign cards, valuables; not base cards)
  function dropBelongings(g, h) {
    const drop = (u) => g.drops.push({ pos: h.pos, card: g.cards[u], carried: g.carried && g.carried[u], holders: g.carriedHolders && g.carriedHolders[u] });
    const cargo = (d) => d.kind === 'cargo' && !d.valuable;
    h.hand.filter((u) => cargo(ZG.Cards.get(g.cards[u]))).forEach(drop);
    const pool = h.deck.concat(h.hand, h.discard, h.exhaust || [], h.equip).filter((u) => { const d = ZG.Cards.get(g.cards[u]); return (d.loot || d.campaignOnly) && !cargo(d) && d.kind !== 'wound' && d.kind !== 'infection'; });
    const lost = Rng.shuffle(g, pool).slice(0, 2);
    lost.forEach(drop);
    ['deck', 'hand', 'discard', 'exhaust', 'equip'].forEach((k) => { if (h[k]) h[k] = h[k].filter((u) => !lost.includes(u)); });
    h.hand = h.hand.filter((u) => !cargo(ZG.Cards.get(g.cards[u])));
  }

  // Turning: the hero's token is flipped to a special monster
  function turnHero(g, h) {
    if (!h.onBoard) return;
    h.onBoard = false; h.fallen = true; h.turned = true;
    g.stats.fell++; g.stats.turned = (g.stats.turned || 0) + 1;
    E.deathNear(g, h.pos);
    dropBelongings(g, h);
    const type = 'turned_' + h.id;
    E.log(g, `${E.heroName(h)} turns! Before you — ${ZG.Zombies.has(type) ? ZG.Zombies.get(type).name : 'a Shambler'}.`, 'bad');
    E.fx(g, { t: 'turn_hero', hero: h.idx, pos: h.pos });
    E.spawnZombie(g, ZG.Zombies.has(type) ? type : 'walker', h.pos, null, true);
    if (g.active === h.idx) { g.active = null; g.turn = null; }
    checkEnd(g);
  }
  E.turnHero = turnHero;

  // properties of the turned
  E.turnedShot = function (g, z, R) {
    const target = Board.lineCells(g.board, z.pos, R, (c) => E.hidden(g, c)).filter((c) => c.dist >= 1).map((c) => E.heroesAt(g, c.cell)).find((hs) => hs.length);
    if (!target) return;
    const h = target[0];
    E.log(g, `${ZG.Zombies.get(z.type).name} shoots at ${E.heroAcc(h)}!`, 'bad');
    E.fx(g, { t: 'shot', hero: null, from: z.pos, to: h.pos });
    addWounds(g, h, 1);
  };
  E.blast = function (g, pos, dmg, wounds) {
    E.log(g, 'Explosion!', 'warn');
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
      // medicine removes Infections first
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
      healWounds(g, h, 2); // strictly by the talent text: only Wounds (Infections remain)
      E.log(g, `${E.heroName(saver)}: "Second Wind"! ${E.heroName(h)} stays in the fight.`, 'good');
      checkFall(g, h); // if two were not enough — they fall after all
      return;
    }
    h.onBoard = false; h.fallen = true;
    g.stats.fell++;
    E.deathNear(g, h.pos);
    dropBelongings(g, h);
    E.log(g, `${E.heroName(h)} falls… and a minute later gets up again — as a Shambler.`, 'bad');
    E.fx(g, { t: 'fall', hero: h.idx, pos: h.pos });
    E.spawnZombie(g, 'walker', h.pos, null, true);
    if (g.active === h.idx) { g.active = null; g.turn = null; }
    checkEnd(g);
  }

  function checkEnd(g) {
    if (g.result) return;
    const living = g.heroes.filter((h) => !h.fallen);
    if (!living.length) return finish(g, false, 'All heroes have fallen.');
    if (living.every((h) => h.evacuated)) return finish(g, true, 'Survivors evacuated!');
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
    E.log(g, (win ? 'VICTORY. ' : 'DEFEAT. ') + reason, win ? 'title' : 'bad');
    E.fx(g, { t: 'gameover', win });
  }

  // ============================================================== zombies
  // Decoys: in the fog each zombie gets 2 face-down tokens — each a 50/50 zombie or decoy.
  // Decoys (bag of 20): 17 "Gone", 1 "Lair", 1 "Ambush from Above", 1 "Tracks".
  // decoy bag (without replacement): 17 "Gone", one of each special; "Gone" returns to the bag when revealed, specials leave the game
  function rollDecoy(g) {
    if (!g.decoyBag) g.decoyBag = Array(17).fill('gone').concat(['lair', 'ambush', 'tracks']);
    if (!g.decoyBag.length) return null;
    return g.decoyBag.splice(Rng.int(g, g.decoyBag.length), 1)[0];
  }
  E.decoysOn = (g, ti) => (g.decoys || []).filter((d) => g.board.cells[d.pos].tile === ti);
  // how many tokens lie stacked on a closed tile (zombies + decoys)
  E.fogTokens = (g, ti, mobileOnly) => g.zombies.filter((z) => g.board.cells[z.pos].tile === ti && (!mobileOnly || !ZG.Zombies.get(z.type).immobile)).length + E.decoysOn(g, ti).length;
  E.spawnZombie = function (g, type, pos, why, silent, real, force) {
    // easier levels (zombieTypes): foreign types are replaced with weak ones — fast ones by a Runner, the rest by a Shambler
    // (turned allies and the task's immobile targets — as they are)
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
      // out of tokens: instead of spawning, all such zombies take an extra step (once per spawn card)
      g.poolMoved = g.poolMoved || {};
      if (g.poolMoved[type]) return null;
      g.poolMoved[type] = true;
      E.log(g, `Out of "${ZG.Zombies.get(type).name}" tokens — all of them take an extra step!`, 'bad');
      g.zombies.filter((x) => x.type === type).forEach((x) => moveZombieStep(g, x, g.zs && g.zs.goals));
      return null;
    }
    const zd = ZG.Zombies.get(type);
    const z = { uid: E.newUid(g, 'z'), type, pos, dmg: 0, suppressed: false, awake: !g.stealth || !!zd.relentless || (!E.hidden(g, pos) && (E.alerted(g) || E.heroesAt(g, pos).some((h) => !h.hidden))), trail: null };
    if (z.awake && g.stealth && !zd.relentless) z.trail = pos; // appeared next to a hero — hunts right away
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
    if (why) E.log(g, `${why}: Alarm +${n} (${g.alarm}/${E.alarmThreshold(g)}).`, 'warn');
  };

  // a "Valuable" jingles: a hero with a valuable in hand makes noisy actions 1 louder (several valuables do not stack)
  E.jingles = (g, h) => !!h && h.hand.some((u) => ZG.Cards.get(g.cards[u]).valuable);
  function makeNoise(g, h, cell, n) {
    if (n <= 0) return;
    if (E.jingles(g, h)) n += 1;
    g.noise[cell] = (g.noise[cell] || 0) + n;
    const a = Math.max(0, n + Mods.value(g, h, 'noiseAlarm', 0));
    E.fx(g, { t: 'noise', pos: cell, n });
    E.hear(g, cell, 1 + n, h ? h.idx : null);
    E.raiseAlarm(g, a, 'Noise');
  }

  // target priority when damage is auto-distributed across a zone
  function killOrder(g, list, dmg) {
    return list.slice().sort((a, b) => {
      const da = ZG.Zombies.get(a.type), db = ZG.Zombies.get(b.type);
      const ka = da.hp - a.dmg <= dmg - da.armor ? 1 : 0, kb = db.hp - b.dmg <= dmg - db.armor ? 1 : 0;
      if (ka !== kb) return kb - ka;
      return db.threat - da.threat;
    });
  }

  function damageZombie(g, z, n, heroIdx, kind) {
    // "Whetted Blade": melee against a hunting or lurking enemy (before the blow wakes it); without stealth all enemies are hunting
    if (kind === 'melee' && heroIdx != null && g.heroes[heroIdx] && Mods.flag(g, g.heroes[heroIdx], 'meleeVsAlert') && (!g.stealth || z.awake || z.lurk)) n += 1;
    // any hero attack gives away their cover until the end of the round (even a silent one)
    if (heroIdx != null && kind !== 'trap' && kind !== 'silent' && g.heroes[heroIdx]) (g.loud = g.loud || {})[g.heroes[heroIdx].pos] = 1;
    const unaware = g.stealth && !z.awake; // "Silent Death": the zombie was not hunting yet (wandering or lurking)
    if (g.stealth && heroIdx != null && g.heroes[heroIdx] && kind !== 'silent') wake(g, z, g.heroes[heroIdx].pos, false, heroIdx); // it was attacked
    const def = ZG.Zombies.get(z.type);
    if (heroIdx != null && E.scenario(g).onZombieHit) E.scenario(g).onZombieHit(g, z, heroIdx, E); // the task's special rules
    if (g.turn && g.turn.courage && heroIdx === g.active && (kind === 'melee' || kind === 'ranged' || kind === 'fire')) n += 1;
    const eff = Math.max(0, n - (def.armor || 0));
    if (!g.zombies.includes(z)) return false;
    z.dmg += eff;
    // the Butcher: a strong blow (3+ damage at once) knocks off one "Blood" token
    if (def.blood && eff >= 3 && z.blood > 0) { z.blood--; E.log(g, `The blow knocks "Blood" off the Butcher — tokens: ${z.blood}.`, 'good'); E.fx(g, { t: 'objective', pos: z.pos, text: '−Blood' }); }
    if (def.big || z.type === 'fatso') g.stats.bigDmg = (g.stats.bigDmg || 0) + eff;
    E.fx(g, { t: 'hit', zombie: z.uid, pos: z.pos, n: eff, kind });
    if (z.dmg >= def.hp) {
      g.zombies.splice(g.zombies.indexOf(z), 1);
      E.deathNear(g, z.pos, kind);
      g.stats.kills++;
      g.stats.killsBy[z.type] = (g.stats.killsBy[z.type] || 0) + 1;
      if (kind === 'shot') g.stats.banditKills = (g.stats.banditKills || 0) + 1; // zombies killed by bandits
      E.fx(g, { t: 'kill', zombie: z.uid, pos: z.pos, ztype: z.type });
      if (def.onDeath) def.onDeath(g, z, E, kind, heroIdx);
      if (E.scenario(g).onKill) E.scenario(g).onKill(g, z, heroIdx, E);
      if (heroIdx != null) { E.storyEvent(g, 'firstKill'); if (def.boss) E.storyEvent(g, 'bossKill'); }
      if (heroIdx != null) {
        const h = g.heroes[heroIdx];
        // relations: killed a zombie that bit a comrade in the last zombie phase
        if (z.bitPhase === g.zphase) (z.bitHeroes || []).forEach((i) => { if (i !== heroIdx && g.heroes[i] && g.heroes[i].onBoard) E.relBump(g, h, g.heroes[i], 1, 'saved', `rescue: ${E.heroName(h)} kills the zombie that bit ${E.heroName(g.heroes[i])}`); });
        if (kind === 'melee' || kind === 'silent') ms(h, 'meleeKills');
        if (def.big) ms(h, 'bigKills');
        if ((kind === 'ranged' || kind === 'fire') && z.pos !== h.pos) ms(h, 'farKills'); // "Keen Eye": from a distance
        if (unaware && !E.isBandit(z)) ms(h, 'quietKills'); // "Silent Death"
        if (E.isBandit(z)) ms(h, 'banditKills'); // "Bounty Hunter"
        if (g.turn && g.active === heroIdx) { g.turn.kills = (g.turn.kills || 0) + 1; h.ms.bestTurnKills = Math.max(h.ms.bestTurnKills || 0, g.turn.kills); }
        gainXp(g, h, def.xp);
        if (def.turned) (g.putDown = g.putDown || []).push({ hero: heroIdx, turned: def.turned }); // laid a former ally to rest
        if (def.trophy) { // a mini-boss trophy — straight to the killer's hand
          E.giveCard(g, h, def.trophy);
          E.log(g, `${E.heroName(h)} takes a trophy: "${ZG.Cards.get(def.trophy).name}"!`, 'good');
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

  // the Butcher's "Fresh Meat": any death in his zone or an adjacent one heals 2 ♥ and gives a "Blood" token (+1 to the "Swing", no limit)
  E.deathNear = function (g, pos, kind) {
    if (kind === 'swing') return; // those the Butcher cut down himself with the "Swing" do not count: blood comes from others' deaths
    g.zombies.forEach((b) => {
      const bd = ZG.Zombies.get(b.type);
      if (!bd.blood || (b.pos !== pos && !g.board.adj[b.pos].includes(pos))) return;
      b.dmg = Math.max(0, b.dmg - 2);
      b.blood = (b.blood || 0) + 1; // no limit (design decision)
      E.log(g, `The Butcher smells fresh meat: +2 ♥, "Blood" ${b.blood} ("Swing" hits for ${bd.dmg + b.blood}).`, 'bad');
      E.fx(g, { t: 'blood', zombie: b.uid, pos: b.pos, n: b.blood });
      E.storyEvent(g, 'blood');
    });
  };
  // shuffle a card into the hero's deck (at a random spot)
  E.shuffleIn = function (g, h, id) { const u = E.newUid(g, 'c'); g.cards[u] = id; h.deck.splice(Rng.int(g, h.deck.length + 1), 0, u); };
  E.healWounds = (g, h, n, cures) => healWounds(g, h, n, cures);
  E.giveCard = function (g, h, id) { const u = E.newUid(g, 'c'); g.cards[u] = id; h.hand.push(u); };
  // a rare or unique find from the loot deck (if there are none — a common one)
  E.giveRareLoot = function (g, h) {
    const i = g.lootDeck.findIndex((id) => ['rare', 'unique'].includes(ZG.Cards.get(id).rarity));
    if (i >= 0) { const id = g.lootDeck.splice(i, 1)[0]; E.giveCard(g, h, id); E.log(g, `${E.heroName(h)} receives "${ZG.Cards.get(id).name}".`, 'good'); }
    else E.giveLoot(g, h);
  };
  // secret mission progress counter
  const ms = (h, key, n) => { h.ms = h.ms || {}; h.ms[key] = (h.ms[key] || 0) + (n == null ? 1 : n); };
  E.ms = ms;
  // whether a mission fits this game (ally, stealth, fog)
  E.missionFits = (g, m) => !((m.needsAlly && g.heroes.length < 2) || (m.needsStealth && !g.stealth) || (m.needsFog && !g.fog) || (m.needsBandits && !g.zombies.some((z) => E.isBandit(z))) || (m.needsSafe && !(g.safes || []).length));
  // changing a mission: only right on receiving it — at the start of the hero's first turn, before any action
  E.redrawMission = function (g, h) {
    if (!g.missions || !h.mission || h.missionDone || h.missionRedrawn || h.missionKept || !g.missionDeck.length) return false;
    const old = h.mission;
    const i = g.missionDeck.findIndex((id) => id !== old && E.missionFits(g, ZG.Missions.get(id)));
    if (i < 0) return false; // no suitable cards — the swap is not spent
    const id = g.missionDeck.splice(i, 1)[0];
    g.missionDeck.push(old);
    h.mission = id;
    h.missionRedrawn = true; h.ms = {};
    E.log(g, `${E.heroName(h)} swaps their secret mission.`, 'dim');
    return true;
  };
  E.missionProgress = (g, h) => { const m = h.mission && ZG.Missions.get(h.mission); return m ? Math.min(m.goal, (h.ms && h.ms[m.stat]) || 0) : 0; };
  // checking missions: the reward goes only to the first to complete
  E.checkMissions = function (g) {
    if (!g.missions) return;
    g.heroes.forEach((h) => {
      if (!h.mission || h.missionDone || h.fallen) return; // a fallen hero can no longer complete a mission
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
        E.log(g, repeat ? `${E.heroName(h)} completes "${m.name}" FIRST again — the reward was already received earlier, instead +${REPEAT_MISSION_XP} 🎖.` : `${E.heroName(h)} completes the secret mission "${m.name}" FIRST! Reward: ${m.rewardText}`, m.traitor ? 'bad' : 'good');
        E.fx(g, { t: 'mission', hero: h.idx, id: m.id, rewarded: true });
        // betrayal is not forgotten: relations with everyone in the squad worsen
        if (m.traitor) g.heroes.forEach((o) => { if (o !== h) E.relBump(g, h, o, -2, 'traitor', 'set the squad up for the zombies'); });
      } else {
        E.log(g, `${E.heroName(h)} completes the mission "${m.name}", but someone got there first — no reward.`, 'dim');
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
        E.log(g, `${E.heroName(h)} toughens up — level ${h.level}!`, 'good');
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
    // late levels (campaign): 2 random shared shelter talents from the pool
    const options = own ? own.slice() : Rng.shuffle(g, ZG.Talents.all().filter((t) => t.shelter && !h.talents.includes(t.id)).map((t) => t.id)).slice(0, 2);
    if (!options.length) { h.talentQueue.shift(); return queueTalent(g); }
    g.pending = { type: 'talent', hero: h.idx, options };
  }

  E.retaliate = function (g, h, n) {
    const zs = killOrder(g, E.zombiesAt(g, h.pos), n);
    if (zs.length) { E.log(g, `${E.heroName(h)} strikes back.`, 'good'); damageZombie(g, zs[0], n, h.idx, 'melee'); }
  };

  function enterCell(g, z, cell) {
    const from = z.pos;
    openDoor(g, from, cell, null);
    z.pos = cell;
    E.fx(g, { t: 'zmove', zombie: z.uid, from, to: cell });
    if (E.isBandit(z)) { E.banditLoot(g, z); if (E.scenario(g).watch) E.scenario(g).watch(g, E); } // bandit passive: next to loot — takes it at once
    const trap = g.traps.find((t) => t.pos === cell);
    if (trap) {
      g.traps.splice(g.traps.indexOf(trap), 1);
      E.log(g, 'The tripwire goes off!', 'good');
      E.fx(g, { t: 'explode', pos: cell });
      killOrder(g, E.zombiesAt(g, cell), trap.dmg).forEach((zz) => damageZombie(g, zz, trap.dmg, trap.owner, 'trap'));
      // "Shrapnel": fragments — 1 damage to each enemy in adjacent zones
      const owner = trap.owner != null && g.heroes[trap.owner];
      if (owner && Mods.flag(g, owner, 'trapSplash')) g.board.adj[cell].forEach((n) => E.zombiesAt(g, n).forEach((zz) => damageZombie(g, zz, 1, trap.owner, 'trap')));
      makeNoise(g, null, cell, 2);
    }
  }

  // targets for zombies: heroes (not invisible) and lures
  function zombieTargets(g, z) {
    const t = [];
    g.heroes.forEach((h) => {
      if (!h.onBoard || h.hidden) return;
      t.push({ pos: h.pos, noise: 1 + (g.noise[h.pos] || 0), wounds: E.hurtCount(g, h), idx: h.idx, shelter: E.sheltered(g, h) });
    });
    g.lures.forEach((l) => t.push({ pos: l.pos, lure: true, noise: g.noise[l.pos] || 0, wounds: 99, idx: 99 }));
    // noise without heroes (a door creak, an explosion) is also a target: zombies go to check
    Object.keys(g.noise).forEach((k) => { const c = +k; if (g.noise[c] > 0 && !E.heroesAt(g, c).length && !g.lures.some((l) => l.pos === c)) t.push({ pos: c, noise: g.noise[c], wounds: 98, idx: 97, sound: true }); });
    g.traps.forEach((tr) => { if (tr.owner != null && Mods.flag(g, g.heroes[tr.owner], 'trapLure')) t.push({ pos: tr.pos, lure: true, noise: g.noise[tr.pos] || 0, wounds: 99, idx: 98 }); });
    E.foesOf(g, z).forEach((o) => t.push({ pos: o.pos, noise: 1, wounds: 0, idx: 50 })); // the third side — the same kind of target
    return E.isBandit(z) ? t.filter((x) => !x.lure && !x.sound) : t;
  }

  // A zombie's target: the nearest visible hero / lure / empty noise (null — stay)
  function pickGoal(g, z) {
    if (g.stealth) {
      if (!z.awake) return z.lurk ? null : wanderGoal(g, z); // a lurking one waits in place until woken
      // a bandit: an enemy in his zone or in his line of fire — stands and shoots; otherwise does not pursue, keeps looting
      if (E.isBandit(z) && !ZG.Zombies.get(z.type).hunter && !z.hunt) return E.banditTarget(g, z) ? null : wanderGoal(g, z); // z.hunt — raised by the alarm: a hunter
      // the Butcher's "Nose for a Crowd": only toward the living (heroes and bandits), to the zone with the most of them; lures do not distract him
      if (ZG.Zombies.get(z.type).crowd) {
        const live = E.seenFoes(g, z), dz = E.distV(g, z.pos);
        const count = (p) => live.filter((t) => t.pos === p).length;
        let best = null;
        live.forEach((t) => { if (dz[t.pos] === Infinity) return; if (!best || count(t.pos) > count(best) || (count(t.pos) === count(best) && dz[t.pos] < dz[best])) best = t.pos; });
        if (best == null) return z.trail != null && z.trail !== z.pos ? z.trail : null;
        return best === z.pos ? null : best;
      }
      // a hunter: visible enemies (heroes, and bandits/zombies — for the other side) and lures; nobody visible — the last trail
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
      if (t.shelter && dz[t.pos] > 1 && g.board.cells[z.pos].bld !== g.board.cells[t.pos].bld) return; // cover: cannot be seen behind closed doors
      if (dz[t.pos] === Infinity) return;
      // the nearest target; on a tie → a lure, then more noise, then fewer Wounds
      const key = (x) => [dz[x.pos], x.lure ? 0 : x.sound ? 2 : 1, -x.noise, x.wounds, x.idx];
      if (!best) { best = t; return; }
      const a = key(t), b = key(best);
      for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { if (a[i] < b[i]) best = t; break; } }
    });
    if (!best) return null;
    // Smog: a zombie sees a target only on its own tile or one adjacent by a side
    if (Mods.flag(g, null, 'fogTiles')) {
      const a = g.board.tiles[tileOf(g, z.pos)], b = g.board.tiles[tileOf(g, best.pos)];
      if (Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) > 1) return null;
    }
    return best.pos;
  }

  // A zombie's step toward the target chosen at the start of the phase (goals: uid → cell). The target does not change mid-phase,
  // except when the zombie reaches an empty noise: then it looks for a new one.
  function moveZombieStep(g, z, goals) {
    if (E.hidden(g, z.pos)) return false; // in the fog zombies pile up at the manhole
    if (ZG.Zombies.get(z.type).static || z.post) return false; // in position (sniper, sentry)
    goals = goals || {};
    // came to an empty noise — "checked, nobody here": the token is removed, the zombie looks for a new target
    if (!g.stealth && g.noise[z.pos] && !E.heroesAt(g, z.pos).length && !g.lures.some((l) => l.pos === z.pos)) { delete g.noise[z.pos]; delete goals[z.uid]; }
    if (!(z.uid in goals)) goals[z.uid] = pickGoal(g, z);
    const goal = goals[z.uid];
    if (goal == null || goal === z.pos) return false;
    if (E.heroesAt(g, z.pos).some((h) => !h.hidden) || g.lures.some((l) => l.pos === z.pos)) return false; // ran into a hero or a lure on the way — stays
    if (z.awake && E.foesOf(g, z).some((o) => o.pos === z.pos)) return false; // locked in with an enemy of the other side
    if (E.isBandit(z) && z.awake && E.banditTarget(g, z)) return false; // a bandit saw a target in his line — stops to shoot
    const zdef = ZG.Zombies.get(z.type);
    const best = { pos: goal };
    const dt = E.distV(g, best.pos);
    // among equal steps — the one without a barricade
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
        E.log(g, `${def.name} smashes through the barricade.`, 'warn');
      }
      return false;
    }
    // a closed door: the zombie spends one step to fling it open
    if (E.doorClosed(g, z.pos, next)) {
      openDoor(g, z.pos, next, null);
      E.fx(g, { t: 'bash', pos: z.pos, to: next });
      return true;
    }
    enterCell(g, z, next);
    return true;
  }

  // Plug: the manhole stays silent until its term runs out (g.plugs[cell] = the last round)
  E.plugged = (g, cell) => !!(g.plugs && g.plugs[cell] >= g.round);
  function drawSpawn(g, point) {
    if (E.plugged(g, point)) { E.log(g, 'The plugged manhole stays silent.', 'good'); return; }
    if (!g.spawnDeck.length) { g.spawnDeck = Rng.shuffle(g, g.spawnDiscard); g.spawnDiscard = []; }
    const id = g.spawnDeck.shift();
    if (!id) return;
    g.spawnDiscard.push(id);
    g.poolMoved = {};
    const card = ZG.SpawnCards.get(id);
    E.fx(g, { t: 'spawncard', card: id, pos: point });
    if (card.event) { E.log(g, `Event: ${card.name}. ${card.text}`, 'warn'); card.run(g, E, point); return; }
    const lvl = ZG.Levels.get(g.levelId);
    const row = card.rowFn ? card.rowFn(g, E) : card.rows[E.phase(g)]; // rowFn — a card with a special spawn order
    (lvl.spawnPerCard ? row.slice(0, lvl.spawnPerCard) : row).forEach((type) => E.spawnZombie(g, type, point)); // easier levels: fewer zombies per card
  }

  // ---------------------------------------------------- zombie phase (automatic)
  function startZombiePhase(g) {
    g.phase = 'zombies';
    g.active = null; g.turn = null;
    g.zphase = (g.zphase || 0) + 1; // zombie phase number: "saved a comrade" — killed the one who bit them in the last phase
    g.zs = { step: 'move', queue: null, wander: 1 + Rng.int(g, 6) };
    E.log(g, `— Zombie phase (round ${g.round}) —`, 'phase');
    E.perceive(g);
    E.fx(g, { t: 'phase', name: 'zombies' });
    runZombies(g);
  }

  function runZombies(g) {
    while (g.phase === 'zombies' && !g.pending && !g.result) {
      const zs = g.zs;
      if (zs.step === 'move') {
        // in waves: all zombies take one step at once, then the next step — and so on up to max speed
        const left = new Map();
        const goals = g.zs.goals = {}; // each zombie's target is chosen once per phase
        const fz = zs.frenzy; // the second "Frenzy" turn: only the frenzied move, and only while they stay on the tile
        g.zombies.forEach((z) => { const sp = g.stealth && !z.awake ? 1 : E.zombieSpeed(g, z); /* wanderers — one step per phase */ if (!ZG.Zombies.get(z.type).immobile && !z.suppressed && sp > 0 && (!fz || fz.includes(z.uid))) left.set(z, sp); });
        for (let wave = 0; left.size; wave++) {
          if (wave) E.fx(g, { t: 'zwave' });
          [...left.keys()].forEach((z) => {
            if (!g.zombies.includes(z) || !moveZombieStep(g, z, goals) || left.get(z) <= 1 || (fz && !E.frenzied(g, z))) left.delete(z);
            else left.set(z, left.get(z) - 1);
          });
        }
        E.perceive(g); // shambled up to a hero — noticed them
        zs.step = 'attack';
      } else if (zs.step === 'attack') {
        // "Cool Head": who stands in a crowd (3+ hunting zombies in the zone; sleeping ones do not count) before the attacks — and how many wounds they have
        if (!zs.crowd) { zs.crowd = {}; g.heroes.forEach((h) => { if (!h.onBoard) return; const n = g.zombies.filter((z) => z.pos === h.pos && !E.isBandit(z) && !ZG.Zombies.get(z.type).immobile && (!g.stealth || z.awake)).length; if (n >= 3) zs.crowd[h.idx] = E.hurtCount(g, h); }); }
        if (!zs.queue) zs.queue = buildAttacks(g);
        if (zs.queue.length) { prepareBlock(g, zs.queue[0]); continue; }
        // "Frenzy" (the task tile, g.frenzyTiles): the dead on it take a second turn — move and attack again
        if (!zs.frenzy) {
          const fz = g.zombies.filter((z) => E.frenzied(g, z) && !ZG.Zombies.get(z.type).immobile);
          if (fz.length) {
            zs.frenzy = fz.map((z) => z.uid); zs.queue = null; zs.step = 'move';
            g.stats.frenzy = (g.stats.frenzy || 0) + fz.length;
            E.log(g, `Frenzy by the Cross: ${fz.length} ${ZG.util.plural(fz.length, 'dead one acts', 'dead act', 'dead act')} again!`, 'bad');
            E.fx(g, { t: 'frenzy', pos: fz[0].pos, zombies: zs.frenzy.slice() });
            E.storyEvent(g, 'frenzy');
            continue;
          }
        }
        Object.keys(zs.crowd || {}).forEach((i) => { const h = g.heroes[i]; if (h.onBoard && E.hurtCount(g, h) <= zs.crowd[i]) ms(h, 'coolHead'); });
        zs.step = 'special';
      } else if (zs.step === 'special') {
        const horde = ZG.Levels.get(g.levelId).hordeAlarm;
        const mobile = g.zombies.filter((z) => !ZG.Zombies.get(z.type).immobile && !E.isBandit(z) && !z.lurk).length; // lurking ones do not hum
        if (horde && mobile >= horde) E.raiseAlarm(g, 1, `The horde (${mobile} on the board) hums`);
        g.zombies.slice().forEach((z) => {
          const def = ZG.Zombies.get(z.type);
          if (def.hooks && def.hooks.zombiePhase) { def.hooks.zombiePhase(g, z, E); if (E.frenzied(g, z) && g.zombies.includes(z)) def.hooks.zombiePhase(g, z, E); } // "Frenzy": the special ability — twice
        });
        g.zombies.filter((z) => E.isBandit(z)).forEach((z) => E.banditLoot(g, z));
        // Breakout: if many zombies have piled up on a closed tile — it opens by itself
        const fb = ZG.Levels.get(g.levelId).fogBreak, lim = fb == null ? 4 : fb;
        if (g.revealed && lim) {
          g.board.tiles.forEach((t, ti) => {
            if (g.revealed[ti]) return;
            const n = E.fogTokens(g, ti, true); // by the tokens in the stack (decoys count too)
            if (n >= lim) E.reveal(g, ti, 'Horde breakout');
          });
        }
        zs.step = 'spawn';
      } else if (zs.step === 'spawn') {
        if (Mods.flag(g, null, 'noSpawn')) {
          E.log(g, 'Dead silence: nobody appears.', 'good');
          zs.step = 'end';
          continue;
        }
        const th = E.alarmThreshold(g);
        let extra = 0;
        while (g.alarm >= th) { g.alarm -= th; extra++; }
        if (extra) {
          g.stats.waves += extra;
          E.log(g, `WAVE! The Alarm overflows — an extra card from every spawn point (×${extra}).`, 'bad');
          E.fx(g, { t: 'wave' });
          if (g.stealth) {
            // the horde knows where all heroes are — until the end of the next round
            g.alertUntil = g.round + 1;
            E.log(g, 'The horde is enraged: every zombie knows where you are (until the end of the next round)!', 'bad');
            E.perceive(g);
          }
        }
        if (extra && E.scenario(g).onWave) E.scenario(g).onWave(g, E, extra); // a task may replace the Wave with its own (bandit reinforcements, etc.)
        g.spawnPoints.forEach((p) => { for (let k = 0; k <= extra; k++) drawSpawn(g, p); });
        zs.step = 'end';
      } else if (zs.step === 'end') {
        loseTrack(g);
        endRound(g);
      }
    }
  }

  // Hunger: in the times of day from level.hungerPhases all zombies move 1 zone farther
  E.zombieSpeed = function (g, z) {
    const def = ZG.Zombies.get(z.type);
    if (def.immobile) return 0;
    const lvl = ZG.Levels.get(g.levelId);
    return def.speed + ((lvl.hunger || {})[E.phase(g)] || 0) + Mods.value(g, null, 'zombieSpeed', 0);
  };

  function buildAttacks(g) {
    const byHero = {};
    // Crowding: no more than maxAttackers zombies bite one hero per phase (the most dangerous first)
    const cap = ZG.Levels.get(g.levelId).maxAttackers || Infinity;
    const order = g.zombies.slice().sort((a, b) => ZG.Zombies.get(b.type).dmg - ZG.Zombies.get(a.type).dmg);
    const toHero = (z, h, def, dmgOver) => {
      const dmg = dmgOver != null ? dmgOver : def.dmg;
      if (E.scenario(g).onZombieAttack) E.scenario(g).onZombieAttack(g, z, h, E); // the task's special rules
      (byHero[h.idx] = byHero[h.idx] || { hero: h.idx, incoming: 0, attackers: [] });
      byHero[h.idx].incoming += dmg;
      g.stats.incoming = (g.stats.incoming || 0) + dmg;
      byHero[h.idx].attackers.push(z.uid);
      if (z.wokenBy != null && z.wokenBy !== h.idx && g.heroes[z.wokenBy] && !(g.heroes[z.wokenBy].ai && ZG.Persona && ZG.Persona.get(g.heroes[z.wokenBy].id).honor)) ms(g.heroes[z.wokenBy], 'betrayals', dmg); // an honest AI refuses the "Traitor" // "Traitor": a zombie set on an ally attacks them (attack strength, before blocking)
      z.attackedPhase = g.zphase; // attacked this phase (the Bride: one ability per phase)
      E.fx(g, { t: 'attack', zombie: z.uid, hero: h.idx, pos: z.pos, n: dmg });
    };
    const fz = g.zs && g.zs.frenzy;
    order.forEach((z) => {
      const def = ZG.Zombies.get(z.type);
      if (!g.zombies.includes(z)) return; // died in this same fight
      if (fz && (!fz.includes(z.uid) || !E.frenzied(g, z))) return; // the second "Frenzy" attack — only the frenzied who stayed on the tile
      if (def.dmg <= 0 || (g.stealth && !z.awake)) return;
      if (def.swing) {
        // the Butcher's "Hook Swing": hits everyone in his zone — heroes, bandits and (incidentally) his own zombies
        const dmg = def.dmg + (z.blood || 0);
        const hs = E.heroesAt(g, z.pos).filter((h) => !h.hidden);
        const others = g.zombies.filter((o) => o !== z && o.pos === z.pos && !ZG.Zombies.get(o.type).immobile);
        if (!hs.length && !others.some((o) => E.isBandit(o))) return; // strikes only if the living are nearby
        E.log(g, `The Butcher swings his hook (${dmg} damage to everyone in the zone)!`, 'bad');
        E.fx(g, { t: 'swing', zombie: z.uid, pos: z.pos, n: dmg });
        hs.forEach((h) => toHero(z, h, def, dmg));
        others.forEach((o) => damageZombie(g, o, dmg, null, 'swing'));
        z.attackedPhase = g.zphase;
        return;
      }
      if (E.isBandit(z)) {
        // a bandit: a blow/shot at a random enemy in the zone or the nearest one in line; the shot is heard 2 zones away
        const t = E.banditTarget(g, z, true);
        if (!t) return;
        g.stats.banditShots = (g.stats.banditShots || 0) + 1;
        E.storyEvent(g, 'firstBandit'); // the first bandit attack (or the first bandit on an open tile)
        if (t.shot) E.fx(g, { t: 'shot', hero: null, from: z.pos, to: t.pos });
        if (!def.quietAttack) E.hear(g, z.pos, 2);
        if (def.id === 'sniper') E.storyEvent(g, 'firstSniper');
        if (t.hero && t.shot && def.pierce) {
          // rifle: the shot cannot be blocked with cards (only cover saves you)
          E.log(g, `${def.name} shoots ${E.heroAcc(t.hero)} — ${def.dmg} ${ZG.util.plural(def.dmg, 'Wound', 'Wounds', 'Wounds')}, blocking does not help!`, 'bad');
          E.fx(g, { t: 'wound', hero: t.hero.idx, pos: t.hero.pos, n: def.dmg });
          g.stats.incoming = (g.stats.incoming || 0) + def.dmg;
          addWounds(g, t.hero, def.dmg);
        } else if (t.hero) { E.log(g, `${def.name} ${t.shot ? 'shoots at' : def.verb || 'hits'} ${E.heroAcc(t.hero)}!`, 'bad'); toHero(z, t.hero, def); }
        else { E.log(g, `${def.name} ${t.shot ? 'shoots' : 'hits'} a zombie (${ZG.Zombies.get(t.foe.type).name}) — in the head!`, 'dim'); damageZombie(g, t.foe, def.foeDmg || def.dmg, null, 'shot'); }
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
      // to zombies a hero and a bandit are equal: whom to bite is random
      const victims = (hs.length ? [{ hero: hs[0] }] : []).concat(bandits.map((b) => ({ foe: b })));
      const v = victims.length > 1 ? Rng.pick(g, victims) : victims[0];
      if (v.foe) { E.log(g, `${def.name} sinks its teeth into a bandit!`, 'dim'); E.fx(g, { t: 'hit', zombie: v.foe.uid, pos: v.foe.pos, n: def.dmg, kind: 'bite' }); damageZombie(g, v.foe, def.dmg, null, 'bite'); return; }
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
    const wasTired = E.exhausted(g, h);
    h.exhaust = h.exhaust || [];
    uids.forEach((u) => {
      const i = h.hand.indexOf(u);
      if (i < 0) return;
      const v = blockValue(g, h, u);
      if (v <= 0) return;
      blocked += v;
      h.hand.splice(i, 1);
      h.exhaust.push(u);
      E.fx(g, { t: 'blockcard', hero: h.idx, card: u });
    });
    if (!wasTired && E.exhausted(g, h)) {
      E.log(g, `${E.heroName(h)} is exhausted (Fatigue ${h.exhaust.length}): hand −1, basic actions unavailable until they catch their breath.`, 'bad');
      E.fx(g, { t: 'tired', hero: h.idx, pos: h.pos });
    }
    const taken = Math.max(0, entry.remaining - blocked);
    const totalBlocked = entry.incoming - taken;
    if (totalBlocked > 0) ms(h, 'blocked', totalBlocked); // "Unbreakable"
    if (totalBlocked > 0) E.fx(g, { t: 'blocked', hero: h.idx, pos: h.pos, n: totalBlocked });
    if (taken > 0) {
      E.log(g, `${E.heroName(h)} takes ${taken} ${ZG.util.plural(taken, 'Wound', 'Wounds', 'Wounds')} (attack ${entry.incoming}, blocked ${totalBlocked}).`, 'bad');
      E.fx(g, { t: 'wound', hero: h.idx, pos: h.pos, n: taken });
    } else E.log(g, `${E.heroName(h)} fends off the attack (${entry.incoming}).`, 'good');
    g.pending = null;
    if (taken > 0) (entry.attackers || []).forEach((u) => {
      const z = E.zombie(g, u); if (!z) return;
      if (z.bitPhase !== g.zphase) { z.bitPhase = g.zphase; z.bitHeroes = []; }
      if (!z.bitHeroes.includes(h.idx)) z.bitHeroes.push(h.idx);
      // relations: bitten by a zombie another hero woke or led here
      if (z.wokenBy != null && z.wokenBy !== h.idx && g.heroes[z.wokenBy]) E.relBump(g, g.heroes[z.wokenBy], h, -1, 'lured', `bitten by a zombie ${E.heroName(g.heroes[z.wokenBy])} woke`);
    });
    bite(g, h, taken, entry.attackers);
    if (h.onBoard && h.thorns) {
      entry.attackers.forEach((u) => { const z = E.zombie(g, u); if (z) damageZombie(g, z, h.thorns, h.idx, 'melee'); });
    }
    if (h.onBoard) Mods.emit(g, h, 'afterBlock', { incoming: entry.incoming, taken, E });
  }

  function endRound(g) {
    const sc = E.scenario(g);
    if (sc.roundEnd) sc.roundEnd(g, E);
    // gas from the event explodes at the end of the round
    if (g.hazard) {
      const p = g.hazard.pos;
      E.log(g, 'The gas explodes!', 'warn');
      E.fx(g, { t: 'explode', pos: p });
      killOrder(g, E.zombiesAt(g, p), g.hazard.dmg).forEach((z) => damageZombie(g, z, g.hazard.dmg, null, 'fire'));
      E.heroesAt(g, p).forEach((h) => { E.log(g, `${E.heroName(h)} is caught in the blast.`, 'bad'); addWounds(g, h, 1); });
      g.hazard = null;
      if (g.result) return;
    }
    if (g.survivor && g.round >= g.survivor.until) { E.log(g, 'The cries have died down — the survivor was not saved.', 'dim'); g.survivor = null; }
    g.event = null;
    g.lures = [];
    g.noise = {};
    g.loud = {};
    g.relaySuit = null;
    g.zombies.forEach((z) => { z.suppressed = false; if (!ZG.Zombies.get(z.type).big && !z.post && !z.keepDmg) z.dmg = 0; }); // a sentry does not leave his post to bandage up, nor do the task's bosses (keepDmg): their wounds remain
    if (g.round >= E.maxRounds(g)) {
      const tt = E.scenario(g).timeoutText;
      finish(g, false, (typeof tt === 'function' ? tt.call(E.scenario(g), g) : tt) || 'Dawn never came: the Horde swallowed the block.');
      return;
    }
    g.round++;
    g.phase = 'heroes';
    g.zs = null;
    g.heroes.forEach((h) => { h.acted = !h.onBoard; });
    const ph = E.phase(g);
    if (ph !== E.phase(g, g.round - 1)) {
      E.log(g, `${ZG.PHASES[ph].name} falls. There will be more of the dead.`, 'bad');
      E.fx(g, { t: 'dayphase', phase: ph });
      if (ph === 1) E.storyEvent(g, 'night');
    }
    E.log(g, `— Round ${g.round} of ${E.maxRounds(g)} —`, 'phase');
    E.fx(g, { t: 'phase', name: 'heroes', round: g.round });
    rollEvent(g);
  }

  // Round events: a d6, on a 6 — an event card (a deck without repeats, then reshuffled)
  function rollEvent(g) {
    const lvl = ZG.Levels.get(g.levelId);
    if (!lvl.events || !lvl.events.length || g.round < 2) return;
    const roll = 1 + Rng.int(g, 6);
    if (roll < 7 - Math.round((lvl.eventChance || 0) * 6)) return; // a lull
    if (!g.eventDeck.length) g.eventDeck = Rng.shuffle(g, lvl.events.slice());
    const id = g.eventDeck.shift();
    const ev = ZG.Events.get(id);
    g.event = id;
    g.stats.events = (g.stats.events || 0) + 1;
    E.log(g, `Event: "${ev.name}". ${ev.text}`, ev.tone < 0 ? 'bad' : 'warn');
    E.fx(g, { t: 'event', id });
    if (ev.start) ev.start(g, E);
  }
  E.rollEvent = rollEvent;

  // ============================================================== hero turn
  function beginTurn(g, idx) {
    const h = g.heroes[idx];
    g.active = idx;
    g.turnHero = idx; // whose turn was last (for the AI: their secret mission)
    h.block = 0;
    h.thorns = 0;
    h.hidden = false;
    h.lurk = false;
    g.turn = { lastSuit: g.relaySuit || null, relay: g.relaySuit || null, played: 0, moves: 0, searched: 0, healUsed: 0, gave: false, meleeDone: false, rangedPlayed: false, mindPlayed: false, shots: 0 };
    const hs = E.handSize(g, h);
    const cap = ZG.Levels.get(g.levelId).drawMax || 99;
    if (h.bondReady) { g.turn.bond = true; h.bondReady = false; }
    g.turn.starting = true;
    if (h.hand.length < hs) drawCards(g, h, Math.min(cap, hs - h.hand.length));
    g.turn.starting = false;
    let en = Mods.value(g, h, 'energy', ZG.Heroes.get(h.id).energy) + h.adrenaline;
    if (E.hurtCount(g, h) === E.maxHp(g, h) - 1) {
      en += 1;
      E.log(g, `${E.heroName(h)} is on the edge — +1 ⚡.`, 'warn');
    }
    h.adrenaline = 0;
    if (h.drainDue) { en = Math.max(0, en - h.drainDue); E.log(g, `${E.heroName(h)}: "Despair" — −${h.drainDue} ⚡.`, 'warn'); h.drainDue = 0; }
    if (h.reloadDue) { en = Math.max(0, en - h.reloadDue); E.log(g, `${E.heroName(h)}: "Reload" — −${h.reloadDue} ⚡.`, 'warn'); h.reloadDue = 0; }
    if (h.irritated) { en = Math.max(0, en - 1); h.irritated = false; E.log(g, `${E.heroName(h)} is on edge because of an enemy — −1 ⚡.`, 'warn'); }
    h.energy = en;
    if (g.relayBonus) { h.energy += g.relayBonus; E.log(g, `${E.heroName(h)}: +${g.relayBonus} ⚡ from a comrade.`, 'good'); g.relayBonus = 0; }
    E.log(g, `Turn: ${E.heroName(h)} (${h.energy} ⚡).`, 'turn');
    E.fx(g, { t: 'turn', hero: idx });
    Mods.emit(g, h, 'turnStart', { E });
  }

  function endTurn(g) {
    const h = E.activeHero(g);
    E.perceive(g); // stealth: zombies "look around" at the end of each hero's turn (one common rule for everyone)
    if (h && h.onBoard) {
      // "Invisible": the turn counts only if zombies are nearby (within 3 zones), but none of them sees you
      const d = E.distV(g, h.pos);
      const near = g.zombies.some((z) => !ZG.Zombies.get(z.type).immobile && !E.hidden(g, z.pos) && d[z.pos] <= 3);
      if (near && !g.zombies.some((z) => !ZG.Zombies.get(z.type).immobile && E.sees(g, Object.assign({}, z, { awake: true }), h))) ms(h, 'unseen');
    }
    if (h) {
      h.acted = true;
      // temporary cards that go to the discard at the end of the turn (Despair)
      const gone = h.hand.filter((u) => ZG.Cards.get(g.cards[u]).discardEndTurn);
      if (gone.length) { h.hand = h.hand.filter((u) => !gone.includes(u)); h.discard.push(...gone); }
      tickInfection(g, h);
      // Gleb: after a double tap — "Reload" (−1 ⚡ next turn); "Speed Loader" — if he did not move
      if (h.reloadPending) { h.reloadPending = false; if (!(Mods.flag(g, h, 'speedload') && !(g.turn && g.turn.moved))) h.reloadDue = 1; } // the hero may have turned at the end of the turn — g.turn is already reset
      // Enemies: ending your turn on an enemy's tile — they get −1 ⚡ next turn
      if (h.onBoard) g.heroes.forEach((o) => {
        if (o === h || !o.onBoard || E.rel(g, h, o) > -3 || g.board.cells[o.pos].tile !== g.board.cells[h.pos].tile) return;
        o.irritated = true;
        E.log(g, `${E.heroName(h)} gets on ${E.heroName(o)}'s nerves — they get −1 ⚡ next turn.`, 'warn');
      });
      // Bond: ending your turn on a partner's tile — they play their next first card with a Chain
      if (h.onBoard) E.bondPartners(g, h).forEach((o) => {
        if (g.board.cells[o.pos].tile !== g.board.cells[h.pos].tile || o.bondReady) return;
        o.bondReady = true;
        E.log(g, `Bond: ${E.heroName(o)} is next to ${E.heroName(h)} — the first card of their next turn will trigger with a Chain.`, 'good');
      });
    }
    if (g.result) return;
    // Relay: the next hero may continue a Chain with the suit of the last card
    g.relaySuit = g.turn && g.turn.played ? g.turn.lastSuit : null;
    g.active = null; g.turn = null;
    if (g.result) return;
    if (g.heroes.every((x) => x.acted || !x.onBoard)) startZombiePhase(g);
  }

  // Gleb's "Akimbo": a ranged card right after another ranged card — free (once per turn; "Gunslinger" — twice)
  E.doubletReady = (g, h, def) => !!(g.turn && g.active === h.idx && Mods.flag(g, h, 'doublet') && g.turn.lastRanged && (g.turn.doublets || 0) < 1 + Mods.value(g, h, 'doubletMax', 0) && (def.tags || []).includes('ranged'));
  E.cardCost = function (g, h, uid) {
    const def = E.cardDef(g, uid);
    if (def.cost == null) return null;
    if (E.doubletReady(g, h, def)) return 0;
    let c = Math.max(0, def.cost + Mods.value(g, h, 'costDelta', 0, { def }));
    // Grip: leaving a zone with zombies costs +1 ⚡ for movement cards too
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

  // all targets for a card
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

  // A Grabber in the zone: leaving costs another +1 ⚡ ("Smoke Grenade" removes Grip in the zone until the end of the turn)
  E.plugCost = (g, h) => Math.max(0, 1 + Mods.value(g, h, 'plugCost', 0));
  // in stealth only hunters grip (a wanderer did not notice the hero — and does not grab)
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

  // =========================================================== the action list
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
    // cards
    const seen = new Set();
    h.hand.forEach((uid) => {
      const def = E.cardDef(g, uid);
      if (def.unplayable || def.cost == null) return;
      if (seen.has(def.id)) return;
      seen.add(def.id);
      if (E.cardCost(g, h, uid) > h.energy) return;
      E.targetsFor(g, h, def).forEach((t) => out.push({ t: 'play', card: uid, target: t }));
    });
    // basic ones
    g.board.adj[h.pos].forEach((n) => { if (!E.hidden(g, n) && moveCost(g, h, n) <= h.energy) out.push({ t: 'move', to: n }); });
    E.fogNeighbors(g, h.pos).forEach((n) => { if (moveCost(g, h, n) <= h.energy) out.push({ t: 'move', to: n, explore: true }); });
    if (searchableHere(g, h) && searchCost(g, h) <= h.energy) out.push({ t: 'search' });
    if (h.energy >= E.PUNCH_COST && !Mods.flag(g, h, 'noPunch')) E.zombiesAt(g, h.pos).forEach((z) => out.push({ t: 'punch', zombie: z.uid }));
    if (h.energy >= 1 && g.drops.some((d) => d.pos === h.pos)) out.push({ t: 'pickup' });
    { const sf = E.safeAt(g, h.pos); if (sf && !sf.jammed && sf.deck.length && h.energy >= E.SAFE_COST && !E.zombiesAt(g, h.pos).length) out.push({ t: 'safe' }); }
    if (h.energy >= barricadeCost(g, h) && g.barricades.length < MAX_BARRICADES) {
      g.board.adj[h.pos].forEach((n) => { if (!E.barricadeAt(g, h.pos, n)) out.push({ t: 'barricade', to: n }); });
    }
    if (Mods.flag(g, h, 'healAction') && g.turn.healUsed < Mods.value(g, h, 'healAction', 0) && h.energy >= 1) {
      E.heroesAt(g, h.pos).forEach((o) => {
        if (E.woundCount(g, o) > 0) out.push({ t: 'heal', hero: o.idx });
        if (E.infectCount(g, o)) out.push({ t: 'cleanse', hero: o.idx });
      });
    }
    if (h.energy >= 3 && (h.exhaust || []).length && !E.zombiesAt(g, h.pos).length) out.push({ t: 'rest' });
    // "TT Shot": the basic action of the equipped "Bandit's Pistol", once per turn
    if (Mods.flag(g, h, 'ttShot') && !g.turn.ttShot && h.energy >= 1) E.targetsFor(g, h, ZG.Cards.get('tt_shot')).forEach((t) => out.push({ t: 'ttshot', zombie: t }));
    if (g.missions && h.mission && !h.missionDone && !h.missionRedrawn && !h.missionKept && g.missionDeck.some((id) => id !== h.mission && E.missionFits(g, ZG.Missions.get(id)))) out.push({ t: 'mredraw' });
    // Gosha: "Iron Lungs" and "Site Boss" — once per turn
    if (Mods.flag(g, h, 'shoutAction') && !g.turn.shouted) out.push({ t: 'shout' });
    if (Mods.flag(g, h, 'foremanAction') && !g.turn.foreman && h.energy >= 1) E.heroesAt(g, h.pos).forEach((o) => { if (o !== h) out.push({ t: 'foreman', hero: o.idx }); });
    if (Mods.flag(g, h, 'plugAction') && g.spawnPoints.includes(h.pos) && !E.plugged(g, h.pos) && h.energy >= E.plugCost(g, h)) out.push({ t: 'plug' });
    const bld = g.board.cells[h.pos].bld;
    if (g.doors && bld && h.energy >= 1 && E.entrances(g, bld).some(([a, b]) => g.doors[doorKey(a, b)])) out.push({ t: 'shut' });
    // Cauterize Bite: 2 ⚡, for yourself or a comrade in your zone, even next to zombies
    // cauterizing a bite — only where there are no zombies: there is no time for it next to them
    if (h.energy >= 2 && !E.zombiesAt(g, h.pos).length) E.heroesAt(g, h.pos).forEach((o) => { if (o.hand.some((u) => g.cards[u] === 'infection')) out.push({ t: 'burn', hero: o.idx }); });
    {
      E.heroesAt(g, h.pos).forEach((o) => {
        if (o === h || !E.canGiveTo(g, h, o)) return;
        h.hand.forEach((u) => { if (E.canGive(g, u)) out.push({ t: 'give', card: u, hero: o.idx }); });
      });
    }
    E.scenario(g).actions(g, h, E).forEach((a) => { if (a.cost <= h.energy) out.push({ t: 'scenario', key: a.key, cost: a.cost, label: a.label }); });
    if (E.isComplete(g) && h.pos === g.exit && E.canEvac(g, h)) out.push({ t: 'evac' });
    if (g.survivor && g.survivor.pos === h.pos && h.energy >= 1) out.push({ t: 'rescue' });
    if (g.campaign && g.retreats > 0) out.push({ t: 'retreat' }); // retreat — a decision for the whole squad, available on any turn
    if (E.exhausted(g, h)) return out.filter((a) => !E.TIRED_LOCK.includes(a.t));
    return out;
  };

  // ============================================================= application
  E.act = function (g, a) {
    if (g.result) return false;
    g.lastError = null;
    if (g.pending) {
      const p = g.pending;
      if (a.t === 'block' && p.type === 'block') { resolveBlock(g, a.cards || []); }
      else if (a.t === 'loot' && p.type === 'loot') {
        const i = p.options.indexOf(a.id);
        if (i < 0) return fail(g, 'No such card.');
        const rest = p.options.slice(); rest.splice(i, 1);
        g.pending = null;
        keepLoot(g, g.heroes[p.hero], a.id, rest);
      }
      else if (a.t === 'talent' && p.type === 'talent') {
        if (!p.options.includes(a.id)) return fail(g, 'That talent is not among the choices.');
        const h = g.heroes[p.hero];
        h.talents.push(a.id);
        h.talentQueue.shift();
        g.pending = null;
        E.log(g, `${E.heroName(h)} gains the talent "${ZG.Talents.get(a.id).name}".`, 'good');
        E.fx(g, { t: 'talent', hero: h.idx, id: a.id });
        queueTalent(g);
      } else return fail(g, 'A decision must be made first.');
      if (!g.pending) queueTalent(g);
      if (g.phase === 'zombies' && !g.pending) runZombies(g);
      E.checkMissions(g);
      return true;
    }
    if (g.phase !== 'heroes') return fail(g, 'It is not the heroes phase.');
    if (a.t === 'begin') {
      if (g.active != null) return fail(g, 'A turn is already in progress.');
      const h = g.heroes[a.hero];
      if (!h || !h.onBoard || h.acted) return fail(g, 'This hero has already acted.');
      beginTurn(g, a.hero);
      return true;
    }
    const h = E.activeHero(g);
    if (!h) return fail(g, 'Choose a hero.');
    const ok = applyHeroAction(g, h, a);
    if (ok === false) return false;
    if (a.t !== 'mredraw') h.missionKept = true; // the first action — the mission is accepted, it can no longer be swapped
    E.checkMissions(g);
    queueTalent(g);
    return true;
  };

  function fail(g, msg) { g.lastError = msg; return false; }

  function spend(g, h, n) { h.energy -= n; }

  function applyHeroAction(g, h, a) {
    if (E.exhausted(g, h) && E.TIRED_LOCK.includes(a.t)) return fail(g, 'The hero is exhausted — catch your breath first.');
    if (a.t !== 'play' && a.t !== 'end' && g.turn) g.turn.lastRanged = false; // "akimbo" — only a card right after a card
    switch (a.t) {
      case 'end': endTurn(g); return true;
      case 'play': return playCard(g, h, a.card, a.target);
      case 'move': {
        const explore = E.hidden(g, a.to) && E.fogNeighbors(g, h.pos).includes(a.to);
        if (!explore && (!g.board.adj[h.pos].includes(a.to) || E.hidden(g, a.to))) return fail(g, 'You cannot go there.');
        const c = moveCost(g, h, a.to);
        if (c > h.energy) return fail(g, 'Not enough energy.');
        spend(g, h, c);
        g.turn.moves++;
        if (explore) {
          // scouting: reveal the tile; if the way is blocked the hero stays in place
          E.reveal(g, g.board.cells[a.to].tile, `${E.heroName(h)} scouts the block`);
          ms(h, 'reveals');
          if (!g.board.adj[h.pos].includes(a.to)) {
            E.log(g, 'Around the corner — a wall. No way through here.', 'warn');
            E.fx(g, { t: 'bump', hero: h.idx, pos: h.pos, to: a.to });
            return true;
          }
        }
        moveHero(g, h, a.to);
        return true;
      }
      case 'search': {
        if (!searchableHere(g, h)) return fail(g, 'Nothing to search here (or zombies are in the way).');
        const c = searchCost(g, h);
        if (c > h.energy) return fail(g, 'Not enough energy.');
        spend(g, h, c);
        g.turn.searched++;
        ms(h, 'searches');
        doSearch(g, h);
        return true;
      }
      case 'punch': {
        if (Mods.flag(g, h, 'noPunch')) return fail(g, 'Hands full of guns — no punching.');
        if (h.energy < E.PUNCH_COST) return fail(g, 'Not enough energy.');
        const z = E.zombie(g, a.zombie);
        if (!z || z.pos !== h.pos) return fail(g, 'The target is out of reach.');
        spend(g, h, E.PUNCH_COST);
        const bonus = Mods.value(g, h, 'meleeBonus', 0, { kind: 'melee' });
        g.turn.meleeDone = true;
        E.log(g, `${E.heroName(h)} hits with bare hands.`, 'dim');
        damageZombie(g, z, 1 + bonus, h.idx, 'melee');
        return true;
      }
      case 'pickup': {
        const d = g.drops.find((x) => x.pos === h.pos);
        if (!d || h.energy < 1) return fail(g, 'Nothing to pick up.');
        spend(g, h, 1);
        g.drops.splice(g.drops.indexOf(d), 1);
        const u = E.newUid(g, 'c'); g.cards[u] = d.card; h.hand.push(u);
        if (d.carried) { g.carried[u] = d.carried; g.carriedHolders[u] = (d.holders || []).concat(h.id); } // a card brought from the shelter keeps its wear
        E.log(g, `${E.heroName(h)} picks up: "${ZG.Cards.get(d.card).name}".`, 'good');
        if (ZG.Cards.get(d.card).kind === 'cargo' && !ZG.Cards.get(d.card).valuable) E.storyEvent(g, 'cargo');
        return true;
      }
      case 'safe': {
        const sf = E.safeAt(g, h.pos);
        if (!sf || sf.jammed || !sf.deck.length) return fail(g, 'This safe cannot be cracked anymore.');
        if (h.energy < E.SAFE_COST) return fail(g, 'Not enough energy.');
        if (E.zombiesAt(g, h.pos).length) return fail(g, 'Enemies in the zone are in the way.');
        spend(g, h, E.SAFE_COST);
        crackSafe(g, h, sf);
        return true;
      }
      case 'barricade': {
        const c = barricadeCost(g, h);
        if (c > h.energy || E.barricadeAt(g, h.pos, a.to) || !g.board.adj[h.pos].includes(a.to)) return fail(g, 'Cannot put a barricade there.');
        if (g.barricades.length >= MAX_BARRICADES) return fail(g, 'Out of barricade tokens.');
        spend(g, h, c);
        placeBarricade(g, h, a.to, 3);
        return true;
      }
      case 'heal': {
        const o = g.heroes[a.hero];
        if (!Mods.flag(g, h, 'healAction') || g.turn.healUsed >= Mods.value(g, h, 'healAction', 0) || h.energy < 1 || o.pos !== h.pos) return fail(g, 'Not allowed.');
        spend(g, h, 1);
        g.turn.healUsed++;
        const n = healWounds(g, o, 1 + Mods.value(g, h, 'healBonus', 0));
        if (o !== h) { ms(h, 'helps'); if (n) E.relBump(g, h, o, 1, 'healed', `healing: ${E.heroName(h)} → ${E.heroName(o)}`); }
        E.log(g, `${E.heroName(h)} treats wounds: ${E.heroName(o)} −${n} ${ZG.util.plural(n, 'Wound', 'Wounds', 'Wounds')}.`, 'good');
        return true;
      }
      case 'cleanse': {
        const o = g.heroes[a.hero];
        if (!Mods.flag(g, h, 'healAction') || g.turn.healUsed >= Mods.value(g, h, 'healAction', 0) || h.energy < 1 || o.pos !== h.pos) return fail(g, 'Not allowed.');
        const inf = o.hand.concat(o.deck, o.discard).filter((u) => g.cards[u] === 'infection');
        if (!inf.length) return fail(g, 'No Infections.');
        spend(g, h, 1);
        g.turn.healUsed++;
        inf.forEach((u) => { g.cards[u] = 'wound'; });
        if (o !== h) { ms(h, 'helps'); E.relBump(g, h, o, 1, 'healed', `healing: ${E.heroName(h)} → ${E.heroName(o)}`); }
        E.log(g, `${E.heroName(h)} opens and cauterizes the bite: ${E.heroGen(o)} ${inf.length} Infection → Wound.`, 'good');
        E.fx(g, { t: 'heal', hero: o.idx, n: inf.length, pos: o.pos });
        checkFall(g, o);
        return true;
      }
      case 'burn': {
        const o = g.heroes[a.hero];
        const bites = o ? o.hand.filter((u) => g.cards[u] === 'infection') : [];
        if (E.zombiesAt(g, h.pos).length) return fail(g, 'Zombies nearby — no chance to cauterize a bite. You need a zone without enemies.');
        if (h.energy < 2 || !bites.length || o.pos !== h.pos) return fail(g, 'Cannot cauterize.');
        spend(g, h, 2);
        bites.forEach((u) => { g.cards[u] = 'wound'; });
        if (o !== h) { ms(h, 'helps'); E.relBump(g, h, o, 1, 'healed', `healing: ${E.heroName(h)} → ${E.heroName(o)}`); }
        E.log(g, `${E.heroName(h)} cauterizes ${o === h ? 'a' : `${E.heroGen(o)}`} bite: Infection → Wound.`, 'good');
        E.fx(g, { t: 'heal', hero: o.idx, n: 0, pos: o.pos });
        return true;
      }
      case 'mredraw': return E.redrawMission(g, h) || fail(g, 'The mission can no longer be swapped.');
      case 'retreat': {
        if (!g.campaign || !(g.retreats > 0)) return fail(g, 'Nowhere to retreat.');
        E.log(g, `${E.heroName(h)} gives the order to fall back: the squad abandons the task and heads for the shelter.`, 'warn');
        finish(g, false, 'The squad retreated: the task failed, but the survivors made it back to the shelter.');
        g.result.retreat = true;
        return true;
      }
      case 'plug': {
        const cost = E.plugCost(g, h);
        if (!Mods.flag(g, h, 'plugAction') || !g.spawnPoints.includes(h.pos) || E.plugged(g, h.pos) || h.energy < cost) return fail(g, 'Cannot plug this.');
        spend(g, h, cost);
        const rounds = 2 + Mods.value(g, h, 'plugRounds', 0);
        (g.plugs = g.plugs || {})[h.pos] = g.round + rounds - 1;
        E.log(g, `${E.heroName(h)} plugs the manhole for ${rounds} ${ZG.util.plural(rounds, 'round', 'rounds', 'rounds')}.`, 'good');
        E.fx(g, { t: 'plug', pos: h.pos, hero: h.idx });
        makeNoise(g, h, h.pos, 1);
        if (Mods.flag(g, h, 'plugBonus')) { drawCards(g, h, 1); h.block += 1; }
        return true;
      }
      case 'shut': {
        const bld = g.board.cells[h.pos].bld;
        const open = bld ? E.entrances(g, bld).filter(([x, y]) => g.doors[doorKey(x, y)]) : [];
        if (h.energy < 1 || !open.length) return fail(g, 'Nothing to close.');
        spend(g, h, 1);
        open.forEach(([x, y]) => { delete g.doors[doorKey(x, y)]; E.fx(g, { t: 'door', a: x, b: y, open: false }); });
        E.log(g, `${E.heroName(h)} closes the doors${E.sheltered(g, h) ? ' — in cover' : ''}.`, 'info');
        return true;
      }
      case 'rest': {
        if (h.energy < 3 || !(h.exhaust || []).length || E.zombiesAt(g, h.pos).length) return fail(g, 'Cannot catch your breath now.');
        spend(g, h, 3);
        const n = h.exhaust.length;
        h.discard.push(...h.exhaust); h.exhaust = [];
        E.log(g, `${E.heroName(h)} catches their breath: ${n} ${ZG.util.plural(n, 'card', 'cards', 'cards')} from Fatigue — to the discard.`, 'good');
        E.fx(g, { t: 'rested', hero: h.idx, n, pos: h.pos });
        return true;
      }
      case 'give': {
        const o = g.heroes[a.hero];
        const i = h.hand.indexOf(a.card);
        if (!o || !E.canGiveTo(g, h, o) || i < 0 || !o.onBoard || o.pos !== h.pos || o === h || !E.canGive(g, a.card)) return fail(g, 'Cannot give that.');
        h.hand.splice(i, 1); o.hand.push(a.card);
        if (g.carriedHolders && g.carriedHolders[a.card]) g.carriedHolders[a.card].push(o.id); // campaign: wear accounts for everyone who held the card
        g.turn.gave = true;
        // help by giving: a find/cargo — to anyone, any card — to a wounded one; once per turn and not with the same card
        const cd = E.cardDef(g, a.card);
        g.helpedCards = g.helpedCards || {};
        if ((cd.loot || cd.kind === 'cargo' || E.hurtCount(g, o) > 0) && !g.turn.helpedGive && !g.helpedCards[a.card]) { g.turn.helpedGive = true; g.helpedCards[a.card] = 1; ms(h, 'helps'); }
        E.log(g, `${E.heroName(h)} gives "${E.cardDef(g, a.card).name}" → ${E.heroName(o)}.`, 'info');
        E.fx(g, { t: 'give', from: h.idx, to: o.idx, card: a.card });
        return true;
      }
      case 'scenario': {
        const acts = E.scenario(g).actions(g, h, E);
        const sa = acts.find((x) => x.key === a.key);
        if (!sa || sa.cost > h.energy) return fail(g, 'Not allowed.');
        spend(g, h, sa.cost);
        E.scenario(g).doAction(g, h, a.key, E);
        return true;
      }
      case 'shout': {
        if (!Mods.flag(g, h, 'shoutAction') || g.turn.shouted) return fail(g, 'You cannot shout again.');
        g.turn.shouted = true;
        g.noise[h.pos] = (g.noise[h.pos] || 0) + 1; // a noise token without Alarm — draws zombies even without stealth
        E.fx(g, { t: 'noise', pos: h.pos, n: 1 });
        E.hear(g, h.pos, 2, h.idx);
        E.log(g, `${E.heroName(h)} bellows across the whole block: "Over here, you freaks!"`, 'warn');
        return true;
      }
      case 'foreman': {
        const o = g.heroes[a.hero];
        if (!Mods.flag(g, h, 'foremanAction') || g.turn.foreman || h.energy < 1 || !o || o === h || !o.onBoard || o.pos !== h.pos) return fail(g, 'Nobody to give orders to.');
        spend(g, h, 1);
        g.turn.foreman = true;
        o.adrenaline += 1;
        E.fx(g, { t: 'adrenaline', hero: o.idx, pos: o.pos, n: 1 });
        E.log(g, `${E.heroName(h)} hands out orders: ${E.heroName(o)} will get +1 ⚡ at the start of their turn.`, 'good');
        return true;
      }
      case 'ttshot': {
        const def = ZG.Cards.get('tt_shot');
        if (!Mods.flag(g, h, 'ttShot') || g.turn.ttShot || h.energy < 1 || !E.targetsFor(g, h, def).includes(a.zombie)) return fail(g, 'Not allowed.');
        spend(g, h, 1);
        g.turn.ttShot = true;
        E.log(g, `${E.heroName(h)} fires the TT.`, 'info');
        def.play(makeCtx(g, h, def, a.zombie, false, () => {}));
        return true;
      }
      case 'rescue': {
        if (!g.survivor || g.survivor.pos !== h.pos || h.energy < 1) return fail(g, 'Nobody to rescue here.');
        spend(g, h, 1);
        g.survivor = null;
        E.log(g, `${E.heroName(h)} rescues the survivor! They share their supplies.`, 'good');
        E.fx(g, { t: 'objective', pos: h.pos, text: 'RESCUED' });
        E.giveLoot(g, h);
        gainXp(g, h, 2);
        return true;
      }
      case 'evac': {
        if (!E.isComplete(g) || h.pos !== g.exit) return fail(g, 'Evacuation is not ready yet.');
        if (!E.canEvac(g, h)) return fail(g, E.scenario(g).evacBlockedText || 'You cannot leave right now.');
        E.leftBehind(g, h).forEach((o) => E.relBump(g, h, o, -1, 'left', `evacuated without a comrade: ${E.heroName(o)} was right by the exit`));
        if (E.scenario(g).onEvac) E.scenario(g).onEvac(g, h, E); // the task notes what was carried out (for example, the radio)
        h.onBoard = false; h.evacuated = true;
        E.log(g, `${E.heroName(h)} evacuates!`, 'good');
        E.fx(g, { t: 'evac', hero: h.idx, pos: h.pos });
        checkEnd(g);
        if (!g.result) endTurn(g);
        return true;
      }
      default: return fail(g, 'Unknown action.');
    }
  }

  // comrades within 1–2 zones of the exit whom the evacuating hero would leave behind
  E.leftBehind = function (g, h) {
    if (!g.campaign || g.exit == null) return [];
    const d = E.distV(g, g.exit);
    return g.heroes.filter((o) => o !== h && o.onBoard && o.pos !== g.exit && d[o.pos] <= 2);
  };

  function moveHero(g, h, to) {
    const from = h.pos;
    if (g.turn && g.active === h.idx) g.turn.moved = true; // for Gleb's "Speed Loader"
    if (g.doors) {
      // doors along the way (a card may lead through several zones)
      // a path without fog and without zombies; if there is none (for example, "Over the Roofs") — simply without fog
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
    if (E.scenario(g).watch) E.scenario(g).watch(g, E); // the task's traps trigger right on entering
  }

  function placeBarricade(g, h, to, baseHp) {
    const hp = baseHp + Mods.value(g, h, 'barricadeHp', 0);
    g.barricades.push({ a: h.pos, b: to, hp, max: hp });
    E.log(g, `${E.heroName(h)} puts up a barricade (durability ${hp}).`, 'info');
    E.fx(g, { t: 'barricade', a: h.pos, b: to });
  }

  // ---- Safe: a "push your luck" minigame. A face-down stack of tokens: 4 "Valuable", 1 "Empty", 1 "Siren".
  // Cracking — 2 ⚡ and Noise 2: the top token is revealed. "Siren" — an extra Noise 3, the safe jams for good.
  E.SAFE_COST = 2;
  E.SAFE_NOISE = 2;
  E.SAFE_DECK = ['valuable', 'valuable', 'valuable', 'valuable', 'empty', 'siren'];
  E.safeAt = (g, pos) => (g.safes || []).find((s) => s.pos === pos) || null;
  E.placeSafe = function (g, pos, label) {
    const sf = { pos, deck: Rng.shuffle(g, E.SAFE_DECK.slice()), jammed: false, label: label || 'Safe', taken: 0 };
    (g.safes = g.safes || []).push(sf);
    return sf;
  };
  function crackSafe(g, h, sf) {
    makeNoise(g, h, h.pos, E.SAFE_NOISE);
    const tok = sf.deck.shift();
    if (tok === 'valuable') {
      E.giveCard(g, h, 'valuable');
      sf.taken++;
      ms(h, 'safeLoot');
      E.log(g, `${E.heroName(h)} cracks a compartment — a Valuable inside! (tokens left: ${sf.deck.length})`, 'good');
      E.fx(g, { t: 'safe', pos: h.pos, hero: h.idx, result: 'valuable' });
    } else if (tok === 'empty') {
      E.log(g, `${E.heroName(h)} cracks another compartment — empty. (tokens left: ${sf.deck.length})`, 'dim');
      E.fx(g, { t: 'safe', pos: h.pos, hero: h.idx, result: 'empty' });
    } else {
      sf.jammed = true;
      E.log(g, `${E.heroName(h)} trips the alarm: the "${sf.label}" wails like a siren and jams solid!`, 'bad');
      E.fx(g, { t: 'safe', pos: h.pos, hero: h.idx, result: 'siren' });
      makeNoise(g, null, h.pos, 3); // the siren — an extra Noise 3 (not the hero's jingle: the Valuable's +1 is not added)
      // in a panic the hero drops one Valuable from their hand — it flies into a random adjacent zone
      const vu = h.hand.find((u) => g.cards[u] === 'valuable');
      if (vu) {
        h.hand.splice(h.hand.indexOf(vu), 1);
        const near = g.board.adj[h.pos].filter((n) => !E.hidden(g, n));
        g.drops.push({ pos: near.length ? Rng.pick(g, near) : h.pos, card: 'valuable' });
        E.log(g, `In a panic ${E.heroName(h)} drops a Valuable — it flies into an adjacent zone.`, 'warn');
      }
    }
  }

  function doSearch(g, h) {
    g.stats.searches++;
    const crate = g.crates.find((c) => c.pos === h.pos && !c.opened);
    if (crate) {
      crate.opened = true;
      if (crate.card) {
        const u = E.newUid(g, 'c'); g.cards[u] = crate.card; h.hand.push(u);
        E.log(g, `${E.heroName(h)} breaks open the crate — inside: "${ZG.Cards.get(crate.card).name}"!`, 'good');
        gainXp(g, h, 1);
        E.fx(g, { t: 'crate', pos: h.pos, found: true, card: u, hero: h.idx });
        if (ZG.Cards.get(crate.card).kind === 'cargo') E.storyEvent(g, 'cargo');
        return;
      }
      E.log(g, `${E.heroName(h)} breaks open the crate — empty, but something useful turned up.`, 'info');
      E.fx(g, { t: 'crate', pos: h.pos, found: false });
      lootFor(g, h, 0);
      return;
    }
    const s = g.search.find((x) => x.pos === h.pos);
    g.search.splice(g.search.indexOf(s), 1);
    lootFor(g, h, s.kind === 'armory' ? 1 : 0);
  }

  // Search: draw 2 loot cards (+bonuses), keep one, the rest go to the bottom of the deck
  function lootFor(g, h, extraDraw) {
    const n = 2 + extraDraw + Mods.value(g, h, 'searchDraw', 0);
    const got = [];
    for (let guard = 0; got.length < n && guard < 12; guard++) {
      const id = drawLootId(g);
      if (!id) break;
      if (ZG.Cards.get(id).event) {
        g.lootDiscard.push(id);
        const type = E.phase(g) >= 1 ? 'runner' : 'walker';
        E.log(g, `Ambush! ${ZG.Zombies.get(type).name} leaps out of the darkness.`, 'bad');
        E.fx(g, { t: 'ambush', pos: h.pos });
        E.spawnZombie(g, type, h.pos, null, true);
        break; // an ambush interrupts the search
      }
      got.push(id);
    }
    if (!got.length) { E.log(g, 'Nothing useful was found.', 'dim'); return; }
    if (got.length === 1) return keepLoot(g, h, got[0], []);
    g.pending = { type: 'loot', hero: h.idx, options: got };
  }
  function keepLoot(g, h, keep, rest) {
    rest.forEach((id) => g.lootDeck.push(id));
    const u = E.newUid(g, 'c'); g.cards[u] = keep; h.hand.push(u);
    E.log(g, `${E.heroName(h)} finds: "${ZG.Cards.get(keep).name}".`, 'good');
    E.fx(g, { t: 'loot', hero: h.idx, card: u, pos: h.pos });
  }

  // ============================================================ playing a card
  function playCard(g, h, uid, target) {
    const i = h.hand.indexOf(uid);
    if (i < 0) return fail(g, 'The card is not in hand.');
    const def = E.cardDef(g, uid);
    if (def.unplayable) return fail(g, 'This card cannot be played.');
    const cost = E.cardCost(g, h, uid);
    if (cost > h.energy) return fail(g, 'Not enough energy.');
    const targets = E.targetsFor(g, h, def);
    if (!targets.some((t) => t === target)) return fail(g, 'Invalid target.');
    const doublet = E.doubletReady(g, h, def);
    spend(g, h, cost);
    h.hand.splice(i, 1);
    if (doublet) { g.turn.doublets = (g.turn.doublets || 0) + 1; h.reloadPending = true; E.log(g, `${E.heroName(h)} shoots akimbo: the second barrel is free (then "Reload").`, 'good'); }
    const byBond = g.turn.bond && !g.turn.played && !!def.chainText && !(def.suit !== 'none' && g.turn.lastSuit === def.suit);
    const chain = E.chainsNow(g, def);
    if (g.turn.bond && !g.turn.played) { g.turn.bondUsed = !!def.chainText; g.turn.bond = false; } // the bond burns out on the first card
    g.stats.cardsPlayed++;
    if (chain) { g.stats.chains++; g.turn.chains = (g.turn.chains || 0) + 1; }
    E.log(g, `${E.heroName(h)} plays "${def.name}"${byBond ? ' — BOND: CHAIN!' : chain ? ' — CHAIN!' : ''}.`, chain ? 'chain' : 'info');
    E.fx(g, { t: 'play', hero: h.idx, card: uid, chain, target, pos: h.pos });
    let dest = def.consumable ? 'removed' : 'discard';
    const c = makeCtx(g, h, def, target, chain, () => { dest = 'equip'; });
    def.play(c);
    if (dest === 'discard') h.discard.push(uid);
    else if (dest === 'equip') {
      h.equip.push(uid);
      if (h.equip.length > MAX_EQUIP) h.discard.push(h.equip.shift());
    }
    if (!g.turn) return true; // the hero fell/turned from the card's effect
    g.turn.lastSuit = def.suit;
    g.turn.lastRanged = (def.tags || []).includes('ranged');
    g.turn.played++;
    if (def.tags && def.tags.includes('ranged')) g.turn.rangedPlayed = true;
    if (def.suit === 'mind') g.turn.mindPlayed = true;
    return true;
  }

  function makeCtx(g, h, def, target, chain, onEquip) {
    const c = {
      g, hero: h, def, target, chain, E,
      zombie: (uid) => E.zombie(g, uid),
      // XP for a chain — only on a few unique hero cards (stated in their chain effect)
      chainXp() {
        if (!chain) return;
        E.log(g, `${E.heroName(h)}: chain — +1 🎖 XP.`, 'good');
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
        // "Sterile" etc.: the healing bonus removes only Wounds (Infections — only per the card's own text)
        const healed = healWounds(g, o, n, cures) + healWounds(g, o, Mods.value(g, h, 'healBonus', 0));
        if (o !== h && healed) { ms(h, 'helps'); E.relBump(g, h, o, 1, 'healed', `healing: ${E.heroName(h)} → ${E.heroName(o)}`); }
        E.log(g, `${E.heroName(o)}: −${healed} ${ZG.util.plural(healed, 'Wound', 'Wounds', 'Wounds')}.`, 'good');
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
        E.raiseAlarm(g, Math.max(0, alarm + Mods.value(g, h, 'noiseAlarm', 0)), 'Lure');
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
        E.log(g, `${E.heroName(h)}: smoke screen!`, 'info');
      },
      carry(from, to) {
        const o = g.heroes.find((x) => x.onBoard && x !== h && x.pos === from);
        if (o) { moveHero(g, o, to); ms(h, 'helps'); E.log(g, `${E.heroName(h)} pulls ${E.heroName(o)} along.`, 'info'); }
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
        if (!z || ZG.Zombies.get(z.type).immobile || ZG.Zombies.get(z.type).static || z.post) return; // snipers and sentries cannot be moved from their position
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
      // a silent kill (Knife in the Back on a wanderer): no noise, does not give away cover
      silentKill(uid) {
        const z = E.zombie(g, uid); if (!z) return;
        if (g.turn) g.turn.meleeDone = true;
        E.log(g, `${E.heroName(h)} silently takes out ${ZG.Zombies.get(z.type).name}.`, 'good');
        damageZombie(g, z, 99, h.idx, 'silent');
      },
      // a thrown pebble: a noise token without Alarm, heard radius zones away
      pebble(cell, radius) {
        g.noise[cell] = (g.noise[cell] || 0) + 1;
        E.fx(g, { t: 'lure', pos: cell, from: h.pos });
        E.fx(g, { t: 'noise', pos: cell, n: 1 });
        E.hear(g, cell, radius, h.idx);
      },
      status(key) { if (key === 'hidden') { h.hidden = true; E.fx(g, { t: 'hidden', hero: h.idx, pos: h.pos }); } },
      equip() { onEquip(); E.log(g, `${E.heroName(h)} equips: ${def.name}.`, 'info'); },
      burnHeroes(cell, n) {
        E.heroesAt(g, cell).forEach((o) => { E.log(g, `${E.heroName(o)} gets burned.`, 'bad'); addWounds(g, o, n); });
      },
    };
    return c;
  }

  // finding a target for the AI and hints
  E.goalFor = function (g, h) {
    if (E.isComplete(g)) { const sd = E.scenario(g).botGoalDone && E.scenario(g).botGoalDone(g, h, E); return sd == null ? g.exit : sd; } // task complete: the scenario's optional goals, otherwise the exit
    const sg = E.scenario(g).botGoal(g, h, E);
    return sg == null ? g.exit : sg;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
