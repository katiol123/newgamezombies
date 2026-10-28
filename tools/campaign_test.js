#!/usr/bin/env node
// Campaign rule checks (fast, deterministic). node tools/campaign_test.js
const ZG = require('./load');
const E = ZG.Engine, C = ZG.Campaign;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// 1) carry-over: level, injuries, loadout, temporary cards
{
  const c = C.create({ heroes: [{ id: 'boris' }, { id: 'lisa' }], seed: 't1' });
  const b = C.hero(c, 'boris');
  b.level = 2; b.xp = 5; b.talents = ['thick_skin']; b.injury = 2; b.morale = 0;
  b.equip.push({ key: 'kX', id: 'crowbar', worn: false });
  const opts = C.startMission(c, ['boris', 'lisa']); opts.quiet = true;
  const g = E.create(opts);
  const h = g.heroes[0];
  ok(h.level === 2 && h.xp === 5 && h.talents.includes('thick_skin'), 'level and talents carry over');
  ok(E.maxHp(g, h) === ZG.Heroes.get('boris').hp + 2 - 2, 'injuries lower Grit (Thick Skin +2, injuries −2)');
  const all = h.deck.concat(h.hand);
  ok(all.filter((u) => g.cards[u] === 'despair').length === 2, 'morale 0 → two “Despair” cards in the deck');
  ok(all.some((u) => g.cards[u] === 'crowbar') && Object.values(g.carried).includes('kX'), 'loadout shuffled into the deck and marked');
}

// 2) Despair: −1 ⚡ when drawn and discarded at the end of the turn
{
  const g = E.create({ heroes: [{ id: 'boris' }], seed: 't2', quiet: true });
  const h = g.heroes[0];
  const u = E.newUid(g, 'c'); g.cards[u] = 'despair'; h.deck.unshift(u);
  h.hand.splice(0, 1).forEach((x) => h.discard.push(x)); // make room for the draw
  E.act(g, { t: 'begin', hero: 0 });
  const base = ZG.Heroes.get('boris').energy;
  ok(h.hand.includes(u) && h.energy === base - 1, `Despair at the start of the turn: ${h.energy} ⚡ of ${base}`);
  E.act(g, { t: 'end' });
  ok(!h.hand.includes(u) && h.discard.includes(u), 'Despair went to the discard at the end of the turn');
}

// 3) Courage: +2 cards, +1 ⚡, +1 damage
{
  const g = E.create({ heroes: [{ id: 'boris' }], seed: 't3', quiet: true });
  const h = g.heroes[0];
  E.act(g, { t: 'begin', hero: 0 });
  const u = E.newUid(g, 'c'); g.cards[u] = 'courage'; h.hand.push(u);
  const en = h.energy, hand = h.hand.length;
  ok(E.act(g, { t: 'play', card: u, target: null }) !== false, 'Courage played');
  ok(h.energy === en + 1 && h.hand.length === hand - 1 + 2 && g.turn.courage, 'Courage: +1 ⚡, +2 cards, damage bonus on');
}

// 4) wandering threat: appears on the last closed tile without a roll
{
  const g = E.create({ heroes: [{ id: 'boris' }], seed: 't4', quiet: true, fog: true, wanderers: ['turned_lisa'] });
  const hidden = g.revealed.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  hidden.slice(0, -1).forEach((ti) => { g.revealed[ti] = true; }); // all but one are revealed “quietly”
  const lastTi = hidden[hidden.length - 1];
  E.reveal(g, lastTi, 'test');
  const z = g.zombies.find((x) => x.type === 'turned_lisa');
  ok(z && g.board.cells[z.pos].tile === lastTi && g.wanderers[0].out, 'Turned Lisa appeared on the last tile');
  ok(z && z.awake === false, 'in stealth mode it appears wandering');
}

// 5) repeating a secret mission: experience instead of the reward
{
  const g = E.create({ heroes: [{ id: 'boris', carry: { missionsDone: ['m_butcher'] } }], seed: 't5', quiet: true });
  const h = g.heroes[0];
  h.mission = 'm_butcher'; h.ms.meleeKills = 99;
  const xp = h.xp, perks = h.perks.length;
  E.checkMissions(g);
  ok(h.missionDone && h.xp === xp + 2 && h.perks.length === perks, 'repeated mission: +2 🎖 instead of the reward');
}

// 6) late level: a choice from the shared shelter talents
{
  const g = E.create({ heroes: [{ id: 'boris', carry: { level: 3, xp: 17, talents: ['thick_skin', 'rock'] } }], seed: 't6', quiet: true, xpLevels: [4, 10, 18, 28] });
  const h = g.heroes[0];
  E.gainXp(g, h, 1);
  ok(h.level === 4 && g.pending && g.pending.type === 'talent' && g.pending.options.length === 2 && g.pending.options.every((id) => ZG.Talents.get(id).shelter), `level 4: shared talents ${g.pending && g.pending.options.join(',')}`);
}

// 7) wear: a brought card → “about to break”; again → a roll; a found card stays intact
{
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't7' });
  const b = C.hero(c, 'boris');
  b.equip.push({ key: 'kA', id: 'crowbar', worn: false }, { key: 'kB', id: 'spear', worn: true });
  const opts = C.startMission(c, ['boris']); opts.quiet = true;
  const g = E.create(opts);
  const u = E.newUid(g, 'c'); g.cards[u] = 'bat'; g.heroes[0].hand.push(u); // “found” a bat
  g.result = { win: true, stars: 1, reason: 'test' };
  C.finishMission(c, g);
  const all = b.chest.concat(b.junk);
  const a = all.find((x) => x.key === 'kA'), s = all.find((x) => x.key === 'kB'), bat = all.find((x) => x.id === 'bat');
  ok(a && a.worn, 'an intact brought card became “about to break”');
  ok(bat && !bat.worn, 'the found card is intact');
  ok(c.report.heroes.boris.lines.some((l) => l.includes('Homemade Spear')), 'the worn card was rolled for (broke or survived)');
  ok(b.talons === 5 - 2, `tickets: 5 for a star − 2 ration = ${b.talons}`);
}

// 8) unique mission tiles: mandatory in play and closed from the start, none excluded
{
  let bad = 0;
  for (let k = 0; k < 60; k++) {
    const g = E.create({ heroes: [{ id: 'boris' }], seed: 't8-' + k, quiet: true, fog: true, tileRules: { required: ['school'], exclude: ['market'] } });
    const ids = g.board.tiles.map((t) => t.id), si = ids.indexOf('school');
    if (si < 0 || ids.includes('market') || g.revealed[si]) bad++;
  }
  ok(!bad, 'the mandatory tile is always in play and closed, none excluded (60 layouts)');
}

// 9) mission bosses are wandering threats
{
  const ZGc = ZG.CAMPAIGN, keep = ZGc.chain[0];
  ZGc.chain[0] = { bosses: ['brute'], tiles: { required: ['school'] } };
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't9' });
  const opts = C.startMission(c);
  ok(opts.wanderers.includes('brute') && opts.tileRules.required[0] === 'school', 'mission description: the boss and the unique tile are passed to the game');
  ZGc.chain[0] = keep;
}

// 10) a level on the mission's last action: the talent is not lost
{
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't10' });
  let opts = C.startMission(c); opts.quiet = true;
  let g = E.create(opts);
  const h = g.heroes[0];
  h.xp = 3; g.result = { win: true, stars: 1, reason: 'test' };
  E.gainXp(g, h, 1);
  C.finishMission(c, g);
  const b = C.hero(c, 'boris');
  ok(b.level === 2 && b.talentQueue.length === 1, 'the unchosen talent is kept in the campaign');
  opts = C.startMission(c); opts.quiet = true;
  g = E.create(opts);
  ok(g.pending && g.pending.type === 'talent' && g.pending.hero === 0, 'and offered at the start of the next mission');
  ok(C.finishMission(c, Object.assign(g, { result: { win: true, stars: 1 } })) && C.finishMission(c, g) === c.report && c.missionNo === 2, 'results are not applied twice');
}

// 11) unique cards in the junk are not lost on heading out; a recruit's starting card is not an event
{
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't11' });
  const b = C.hero(c, 'boris');
  b.junk.push({ key: 'kg', id: 'gift_map', worn: false }, { key: 'kc', id: 'crowbar', worn: false });
  C.startMission(c);
  ok(b.junk.length === 1 && b.junk[0].id === 'gift_map' && b.talons === 2, 'the unique card stayed in the junk, the ordinary one was sold');
  let bad = 0;
  for (let k = 0; k < 40; k++) {
    const c2 = C.create({ heroes: [{ id: 'boris' }], seed: 't11h' + k });
    C.hero(c2, 'boris').talons = 99;
    C.hire(c2, 'boris', 'lisa');
    if (ZG.Cards.get(C.hero(c2, 'lisa').equip[0].id).event) bad++;
  }
  ok(!bad, "a recruit's starting card is never an event");
}

// 12) a wandering boss appears even if tokens of its type have run out
{
  const g = E.create({ heroes: [{ id: 'boris' }], seed: 't12', quiet: true, fog: true, wanderers: ['brute'] });
  const open = g.board.cells.find((cl) => !E.hidden(g, cl.i) && cl.type === 'street').i;
  E.spawnZombie(g, 'brute', open, null, true, true); E.spawnZombie(g, 'brute', open, null, true, true);
  const hidden = g.revealed.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  hidden.slice(0, -1).forEach((ti) => { g.revealed[ti] = true; });
  E.reveal(g, hidden[hidden.length - 1], 'test');
  ok(g.zombies.filter((z) => z.type === 'brute').length === 3, 'the boss appeared beyond the token limit');
}

// 13) wear: the break chance is the worse of the two owners (giving it to “Handy” does not help)
{
  const rate = (startHandy, endHandy, give) => {
    let broke = 0;
    for (let k = 0; k < 400; k++) {
      const c = C.create({ heroes: [{ id: 'boris' }, { id: 'lisa' }], seed: 't13-' + k + startHandy + endHandy + give });
      const b = C.hero(c, 'boris'), l = C.hero(c, 'lisa');
      if (startHandy) b.talents.push('sh_handy');
      if (endHandy) l.talents.push('sh_handy');
      b.equip.push({ key: 'kw', id: 'crowbar', worn: true });
      const opts = C.startMission(c, ['boris', 'lisa']); opts.quiet = true;
      const g = E.create(opts);
      const gb = g.heroes[0], gl = g.heroes[1];
      const u = Object.keys(g.carried).find((x) => g.carried[x] === 'kw');
      if (give) { for (const pile of ['deck', 'hand', 'discard']) { const i = gb[pile].indexOf(u); if (i >= 0) gb[pile].splice(i, 1); } gl.hand.push(u); g.carriedHolders[u].push('lisa'); }
      g.result = { win: true, stars: 1 };
      C.finishMission(c, g);
      if (!C.hero(c, 'boris').chest.concat(C.hero(c, 'lisa').chest, b.junk, l.junk).some((it) => it.key === 'kw')) broke++;
    }
    return broke / 400;
  };
  const own = rate(true, false, false), toHandy = rate(false, true, true), fromHandy = rate(true, false, true);
  ok(own < 0.33, `Handy carried it himself: breaks ${Math.round(own * 100)}% (≈25%)`);
  ok(toHandy > 0.42, `given to Handy in battle: ${Math.round(toHandy * 100)}% (≈50%)`);
  ok(fromHandy > 0.42, `Handy took it, gave it to another in battle: ${Math.round(fromHandy * 100)}% (≈50%)`);
}

// 14) passing with “Give” and back: holders are remembered, the chance is the worse one
{
  const c = C.create({ heroes: [{ id: 'boris' }, { id: 'lisa' }], seed: 't14' });
  C.hero(c, 'boris').talents.push('sh_handy');
  C.hero(c, 'boris').equip.push({ key: 'kq', id: 'crowbar', worn: true });
  const opts = C.startMission(c, ['boris', 'lisa']); opts.quiet = true;
  const g = E.create(opts);
  const u = Object.keys(g.carried).find((x) => g.carried[x] === 'kq');
  const gb = g.heroes[0];
  for (const pile of ['deck', 'discard']) { const i = gb[pile].indexOf(u); if (i >= 0) { gb[pile].splice(i, 1); gb.hand.push(u); } }
  E.act(g, { t: 'begin', hero: 0 });
  const okGive = E.act(g, { t: 'give', card: u, hero: 1 });
  ok(okGive && g.carriedHolders[u].join() === 'boris,lisa', `giving recorded the holder: ${g.carriedHolders[u]}`);
}

// 15) Infections also carry over as lost Grit
{
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't15' });
  const opts = C.startMission(c); opts.quiet = true;
  const g = E.create(opts);
  const h = g.heroes[0];
  ['wound', 'infection', 'infection'].forEach((id) => { const u = E.newUid(g, 'c'); g.cards[u] = id; h.discard.push(u); });
  g.result = { win: true, stars: 1 };
  C.finishMission(c, g);
  ok(C.hero(c, 'boris').injury === 3 - 1, `1 Wound + 2 Infections − ration = injuries ${C.hero(c, 'boris').injury}`);
}

// 16) the AI arranges cards itself: the best to the loadout, valuable ones to the chest, trifles to the junk
{
  const c = C.create({ heroes: [{ id: 'boris', ai: true }], seed: 't16' });
  const b = C.hero(c, 'boris');
  ['chocolate', 'katana', 'brick', 'medkit', 'bat', 'crowbar', 'spear', 'vest', 'energy'].forEach((id, i) => b.chest.push({ key: 'a' + i, id, worn: id === 'medkit' }));
  C.autoManage(c, 'boris');
  ok(b.equip.map((x) => x.id).join() === 'katana,bat,vest' || b.equip.length === 3, `loadout: ${b.equip.map((x) => x.id)}`);
  ok(b.chest.every((x) => C.isValuable(x)) && b.junk.every((x) => !C.isValuable(x) || b.chest.length >= C.chestCap(b)), `chest: ${b.chest.map((x) => x.id)} · junk: ${b.junk.map((x) => x.id)}`);
  ok(b.junk.some((x) => x.id === 'chocolate') && !b.equip.some((x) => x.id === 'medkit'), 'chocolate goes to the junk, a worn medkit does not push out intact cards');
}

// 17) desperation: with low Grit the AI takes trifles on the run instead of selling them
{
  const c = C.create({ heroes: [{ id: 'lisa', ai: true }], seed: 't17' });
  const l = C.hero(c, 'lisa');
  ['katana', 'chocolate', 'bandage_roll'].forEach((id, i) => l.chest.push({ key: 'd' + i, id, worn: false }));
  C.autoManage(c, 'lisa');
  ok(l.equip.length === 1 && l.junk.length === 2, `healthy: only valuable cards on the run (${l.equip.map((x) => x.id)}), trifles to the junk`);
  l.injury = 2; // 2 of 4
  C.autoManage(c, 'lisa');
  ok(l.equip.length === 3 && !l.junk.length && l.equip[1].id === 'bandage_roll', `wounded: takes everything, healing first (${l.equip.map((x) => x.id)})`);
}

// 18) mission 1: a 3×2 board, only Shamblers and Runners, 1 zombie per spawn card
{
  const g = E.create({ levelId: 'camp_m1', heroes: [{ id: 'boris' }], seed: 't18', quiet: true });
  const open = g.board.cells.find((cl) => !E.hidden(g, cl.i) && cl.type === 'street').i;
  const a = E.spawnZombie(g, 'brute', open, null, true, true), b = E.spawnZombie(g, 'hound', open, null, true, true);
  ok(g.board.tiles.length === 6, 'a board of 6 tiles');
  ok(a && a.type === 'walker' && b && b.type === 'runner', `strong ones replaced: Brute→${a && a.type}, Hound→${b && b.type}`);
  ok(g.zombies.every((z) => ['walker', 'runner', 'nest'].includes(z.type)), 'only weak ones on the board (and objective nests)');
}

// 19) mission 2: the motor depot at the edge, the van is the exit, Bloaters and 2 packs lurk, no manholes
{
  const c = C.create({ heroes: [{ id: 'boris' }, { id: 'lisa' }], seed: 't19' });
  c.missionNo = 1;
  const opts = C.startMission(c); opts.quiet = true;
  const g = E.create(opts);
  const ut = g.board.tiles.findIndex((t) => t.id === 'autobase');
  ok(ut >= 0 && g.board.tiles[ut].tx === 2 && !g.revealed[ut] && g.board.cells[g.exit].tile === ut, 'the motor depot in the far column, closed, the van on it');
  ok(!g.spawnPoints.length && g.scenarioId === 'autobase', 'no manholes, the “Motor Depot” objective');
  const lurk = g.zombies.filter((z) => z.lurk && !z.awake);
  ok(lurk.filter((z) => z.type === 'fatso').length === 2 && lurk.length === 2 + 6 && lurk.filter((z) => z.type === "fatso").every((z) => z.keepDmg), `2 Bloaters lurk (wounds do not heal) and 2 packs of 3: ${lurk.length}`);
  ok(g.stackTiles.length === 4 && g.hideFogCounts, '“Pack/Empty” cards on 4 tiles, counters hidden');
}

// 20) the AI repairs valuable worn cards if it has a Workshop and tickets beyond its reserve; it does not repair trifles
{
  const c = C.create({ heroes: [{ id: 'boris', ai: true }], seed: 't20' });
  const b = C.hero(c, 'boris');
  b.chest.push({ key: 'r1', id: 'katana', worn: true }, { key: 'r2', id: 'chocolate', worn: true }, { key: 'r3', id: 'bat', worn: true });
  b.talons = 10;
  C.autoManage(c, 'boris');
  ok([b.equip, b.chest, b.junk].flat().every((it) => it.worn), 'without a Workshop it repairs nothing');
  b.buildings.push('workshop');
  C.autoManage(c, 'boris');
  const all = [b.equip, b.chest, b.junk].flat();
  ok(!all.find((it) => it.id === 'katana').worn && !all.find((it) => it.id === 'bat').worn && all.find((it) => it.id === 'chocolate').worn && b.talons === 10 - 3 - 2, `repaired the katana and the bat, not the chocolate; tickets ${b.talons}`);
  const c2 = C.create({ heroes: [{ id: 'boris', ai: true }], seed: 't20b' });
  const b2 = C.hero(c2, 'boris'); b2.buildings.push('workshop'); b2.talons = 3; b2.chest.push({ key: 'q', id: 'katana', worn: true });
  C.autoManage(c2, 'boris');
  ok(b2.equip[0].worn && b2.talons === 3, 'does not spend the last tickets needed for the ration');
}

// 21) The travelling trader: only before mission 7; unlimited goods; the AI buys what suits it and keeps a reserve
{
  const c = C.create({ heroes: [{ id: 'marina', ai: true }, { id: 'boris', ai: true }, { id: 'viktor' }], seed: 't21' });
  c.missionNo = 5;
  ok(!C.trader(c), 'no trader before mission 6');
  c.missionNo = 6;
  const tr = C.trader(c);
  ok(tr && tr.stock.length === 3 && tr.stock.every((w) => ZG.Cards.get(w.id).rarity === 'unique' && ZG.Cards.get(w.id).equip), 'before mission 7 — a trader with 3 unique gear cards');
  ok(tr.stock.every((w) => !Object.keys(ZG.Levels.get('camp_m7').loot).includes(w.id) && !Object.keys(ZG.Levels.get('outskirts').loot).includes(w.id)), 'the goods are not in the loot decks');
  const m = C.hero(c, 'marina'), b = C.hero(c, 'boris'), v = C.hero(c, 'viktor');
  m.talons = 30; b.talons = 30;
  C.autoManage(c, 'marina'); C.autoManage(c, 'boris');
  const owns = (h, id) => h.equip.concat(h.chest, h.junk).filter((it) => it.id === id).length;
  ok(owns(m, 'tr_medbag') === 1 && owns(m, 'tr_gasmask') === 0 && owns(m, 'tr_binoculars') === 0, 'Marina (AI, thrifty) takes only what she needs most — the medic bag');
  ok(owns(b, 'tr_gasmask') === 0 && owns(b, 'tr_medbag') === 0, 'Boris (AI) skips the gas mask — he barely gets infected anyway');
  C.autoManage(c, 'marina');
  ok(owns(m, 'tr_medbag') === 1, 'a repeated AI arrangement does not buy duplicates');
  v.talons = 21;
  ok(!C.buy(c, 'viktor', 'tr_binoculars') && !C.buy(c, 'viktor', 'tr_binoculars') && owns(v, 'tr_binoculars') === 2 && v.talons === 5, 'a player buys any number of copies of one card');
  ok(C.buy(c, 'viktor', 'tr_gasmask') === 'Not enough tickets.', 'refused without tickets');
  ok(C.price('tr_binoculars') == null, "the trader's goods cannot be sold");
  const c2 = C.create({ heroes: [{ id: 'marina', ai: true }], seed: 't21b' }); c2.missionNo = 6;
  const m2 = C.hero(c2, 'marina'); m2.talons = 11;
  C.autoManage(c2, 'marina');
  ok(m2.talons === 11, 'the AI does not spend tickets if it would not have enough for the ration');
  c.status = 'mission';
  ok(!C.trader(c), 'no trader during a run');
  c.status = 'ready'; c.missionNo = 7;
  ok(!C.trader(c), 'the trader does not return after mission 7');
}

// 22) The safe and Valuables: a 4/1/1 stack, cracking costs 2 ⚡ and noise, jingle +1, only finds drop, sale for 2–8
{
  const g = E.create({ seed: 't22', heroes: [{ id: 'boris' }, { id: 'lisa' }], quiet: true });
  const h = g.heroes[0];
  g.zombies.length = 0;
  const sf = E.placeSafe(g, h.pos, 'Safe');
  ok(sf.deck.filter((x) => x === 'valuable').length === 4 && sf.deck.includes('empty') && sf.deck.includes('siren'), 'safe stack: 4 Valuables, Empty, Siren');
  sf.deck = ['valuable', 'empty', 'siren'];
  E.act(g, { t: 'begin', hero: 0 }); h.energy = 6;
  const a0 = g.alarm;
  ok(E.act(g, { t: 'safe' }) && h.hand.some((u) => g.cards[u] === 'valuable') && h.energy === 4 && g.alarm > a0, 'cracking: a Valuable to hand, −2 ⚡, noise raised the Alarm');
  const a1 = g.alarm;
  E.act(g, { t: 'safe' });
  ok(g.alarm - a1 === E.SAFE_NOISE + 1, 'a Valuable jingles: cracking Noise +1');
  h.energy = 6; E.act(g, { t: 'safe' });
  ok(sf.jammed && !E.legal(g).some((a) => a.t === 'safe'), 'siren — the safe jammed, cracking unavailable');
  ok(h.hand.filter((u) => g.cards[u] === 'valuable').length === 0 && g.drops.some((d) => g.board.adj[h.pos].includes(d.pos) && d.card === 'valuable'), 'siren: a Valuable flew into an adjacent zone');
  E.giveCard(g, h, 'valuable');
  ok(E.blockValue(g, h, h.hand.find((u) => g.cards[u] === 'valuable')) === 0, 'a Valuable cannot block');
  // falling: only finds drop (basic cards stay)
  const g2 = E.create({ seed: 't22b', heroes: [{ id: 'boris' }, { id: 'lisa' }], quiet: true });
  const b = g2.heroes[0];
  E.giveCard(g2, b, 'valuable'); E.giveCard(g2, b, 'medkit');
  const before = g2.drops.length;
  for (let i = 0; i < 20; i++) { const u = E.newUid(g2, 'w'); g2.cards[u] = 'wound'; b.deck.push(u); }
  E.turnHero(g2, b);
  const dropped = g2.drops.slice(before).map((d) => d.card);
  ok(dropped.length === 2 && dropped.every((id) => ZG.Cards.get(id).loot || ZG.Cards.get(id).campaignOnly), `on turning 2 finds dropped: ${dropped.join(', ')}`);
  // campaign: sale at an unknown price, the AI puts them in the junk
  const c = C.create({ heroes: [{ id: 'marina', ai: true }], seed: 't22c' });
  const m = C.hero(c, 'marina');
  m.chest.push({ key: 'v1', id: 'valuable', worn: false }, { key: 'v2', id: 'valuable', worn: false });
  C.autoManage(c, 'marina');
  ok(m.junk.filter((it) => it.id === 'valuable').length === 2, 'the AI puts Valuables in the junk');
  const t0 = m.talons;
  ok(!C.sell(c, 'marina', 'junk', m.junk.findIndex((it) => it.id === 'valuable')) && m.talons - t0 >= 2 && m.talons - t0 <= 8, `selling a Valuable: +${m.talons - t0} 🎫 (2–8)`);
  const t1 = m.talons; C.startMission(c);
  ok(m.talons - t1 >= 2 && m.talons - t1 <= 8 && !m.junk.some((it) => it.id === 'valuable'), 'on heading out the Valuable from the junk was sold');
}

// 23) Hidden AI personalities: an honest one swaps the “Traitor” and does not count it; a spendthrift and a miser at the trader
{
  const g = E.create({ seed: 't23', heroes: [{ id: 'boris', ai: true }, { id: 'lisa', ai: true }], quiet: true });
  const b = g.heroes[0];
  b.mission = 'm_traitor'; b.ms = {}; b.missionRedrawn = false; b.missionKept = false;
  g.active = null; ZG.Bot.playTurn(g, { depth2: false });
  ok(b.mission !== 'm_traitor', `honest Boris swapped the “Traitor” card (now ${b.mission})`);
  const g2 = E.create({ seed: 't23b', heroes: [{ id: 'viktor', ai: true }, { id: 'lisa', ai: true }], quiet: true });
  const v = g2.heroes[0], l = g2.heroes[1];
  v.mission = 'm_traitor'; v.ms = {};
  g2.zombies.length = 0;
  const z = E.spawnZombie(g2, 'walker', l.pos, null, true, true, true); z.awake = true; z.wokenBy = 0; z.trail = l.pos;
  v.pos = g2.board.cells.find((cc) => cc.type === 'street' && E.distV(g2, l.pos)[cc.i] > 4).i;
  E.act(g2, { t: 'begin', hero: 0 }); E.act(g2, { t: 'end' }); E.act(g2, { t: 'begin', hero: 1 }); E.act(g2, { t: 'end' });
  ZG.Bot.autoPending(g2);
  ok(!(v.ms.betrayals > 0), 'an honest AI does not count a lured zombie as a betrayal');
  const c = C.create({ heroes: [{ id: 'lisa', ai: true }, { id: 'marina', ai: true }], seed: 't23c' });
  c.missionNo = 6;
  const li = C.hero(c, 'lisa'), ma = C.hero(c, 'marina');
  li.talons = 40; ma.talons = 40;
  C.autoManage(c, 'lisa'); C.autoManage(c, 'marina');
  const buys = (id) => (c.traderLog || []).filter((x) => x.hero === id).length;
  ok(buys('lisa') >= 2 && buys('marina') === 1, `spendthrift Lisa bought ${buys('lisa')}, miser Marina — ${buys('marina')}`);
  C.autoManage(c, 'lisa');
  ok(buys('lisa') <= 3, 'the spendthrift does not buy out the stall again and again (no more than 3 per visit)');
}

// 24) Retreat: a failure is not the end of the campaign while retreats remain; the mission is replayed
{
  const c = C.create({ heroes: [{ id: 'boris', ai: true }, { id: 'kira', ai: true }], seed: 't24' });
  ok(C.retreatsLeft(c) === ZG.CAMPAIGN.retreats && ZG.CAMPAIGN.retreats > 0, 'retreats available at the start of the campaign');
  const g = E.create(C.startMission(c));
  ok(g.retreats === C.retreatsLeft(c), 'the retreat count is passed into the mission');
  E.act(g, { t: 'begin', hero: 0 });
  ok(E.legal(g).some((a) => a.t === 'retreat') && E.act(g, { t: 'retreat' }) && g.result && !g.result.win && g.result.retreat, 'the “Retreat” action ends the mission with a retreat');
  E.giveCard(g, g.heroes[1], 'valuable'); // a Valuable from the safe — lost on retreat
  const m0 = C.hero(c, 'kira').morale;
  const rep = C.finishMission(c, g);
  ok(rep.retreat && c.missionNo === 0 && c.status === 'ready' && c.retreats === ZG.CAMPAIGN.retreats - 1, 'after a retreat — mission 1 again, retreats −1');
  ok(C.hero(c, 'kira').morale === Math.max(0, m0 - 1) && c.roster.length === 2, 'retreat: −1 morale, survivors in the shelter');
  ok(!C.hero(c, 'kira').junk.concat(C.hero(c, 'kira').chest).some((it) => it.id === 'valuable'), 'retreat: Valuables abandoned');
  c.retreats = 0;
  const g2 = E.create(C.startMission(c));
  E.act(g2, { t: 'begin', hero: 0 });
  ok(!E.legal(g2).some((a) => a.t === 'retreat'), 'no retreating without retreats left');
  g2.result = { win: false, stars: 0, reason: 'All heroes have fallen.' };
  C.finishMission(c, g2);
  ok(c.status === 'over', 'a failure with no retreats left — end of the campaign');
}

// 25) Actual squad: started with two, hired a third — you can go as three, difficulty by those sent; fewer than the starting squad only if there are no people
{
  const c = C.create({ heroes: [{ id: 'boris' }, { id: 'kira' }], seed: 't25' });
  C.hero(c, 'boris').talons = 30;
  ok(!C.hire(c, 'boris', 'viktor') && c.roster.length === 3, 'hired a third hero');
  const o3 = C.startMission(c, ['boris', 'kira', 'viktor']);
  ok(!o3.error && o3.partySize === 3, 'three can go, a mission for 3 heroes');
  c.status = 'ready'; c.current = null;
  ok(!!C.startMission(c, ['boris']).error, 'cannot take one while two are on their feet');
  c.roster = c.roster.filter((h) => h.id === 'boris'); c.fallen.push('kira', 'viktor');
  const o1 = C.startMission(c, ['boris']);
  ok(!o1.error && o1.partySize === 1, 'only one left — goes alone, a mission for 1 hero');
  ok(C.rosterCap({ squad: 2 }) === 4 && C.rosterCap({ squad: 4 }) === 6, 'shelter: up to 4 heroes (or the starting squad +2)');
}

console.log(fails ? `\n${fails} checks failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
