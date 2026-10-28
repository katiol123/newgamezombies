/*
 * The AI player. Used by the balance simulator and the "Hint" button in the interface.
 * A greedy search with a 2-action lookahead and a heuristic position evaluation.
 * It knows nothing about specific cards — it evaluates the result, so it
 * automatically "understands" new content.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const E = ZG.Engine;

  const W = {
    progress: 450, complete: 500, evac: 600, fallen: 2200, dist: 22, wound: 40, nearDeath: 70,
    unblocked: 55, death: 900, incoming: 5, adjThreat: 5, xp: 6, cardValue: 0.7, chainReady: 3, chainDone: 6, reserve: 2.2, hand: 1.5,
    zombieThreat: 4, alarm: 7, crate: 650, search: 6, bigDmg: 25, partDmg: 6, adrenaline: 9, trap: 14, block: 2, exhaust: 12, tired: 90, bondWaste: 12,
  };
  ZG.BotWeights = W;

  // An honest distance in the fog: across open tiles — as is, closed tiles are treated
  // as passable throughout (the bot does not know where the walls are), a target on a closed tile — its center.
  function fogTarget(g, cell) {
    if (cell == null || !E.hidden(g, cell)) return cell;
    const t = g.board.tiles[g.board.cells[cell].tile];
    return (t.ty * 3 + 1) * g.board.w + t.tx * 3 + 1;
  }
  function fogDist(g, from) {
    if (!g.revealed) return E.dist(g, from);
    const b = g.board, dist = new Array(b.cells.length).fill(Infinity), q = [from];
    dist[from] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], cc = b.cells[c];
      const next = E.hidden(g, c) ? [] : b.adj[c].filter((n) => !E.hidden(g, n));
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const x = cc.x + dx, y = cc.y + dy;
        if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
        const n = y * b.w + x;
        if (E.hidden(g, n) || E.hidden(g, c)) next.push(n);
      });
      next.forEach((n) => { if (dist[n] === Infinity) { dist[n] = dist[c] + 1; q.push(n); } });
    }
    return dist;
  }

  function evaluate(g) {
    if (g.result) return g.result.win ? 1e6 + g.result.stars * 1e4 : -1e6;
    const sc = E.scenario(g);
    let s = sc.progress(g) * W.progress;
    if (E.isComplete(g)) s += W.complete;
    s += g.crates.filter((c) => c.opened).length * W.crate;
    s += g.stats.searches * W.search;
    // threat: zombies that will reach the hero's zone this phase
    const zoneIncoming = {};
    const reach = {};
    const noBarr = (x, y) => !E.barricadeAt(g, x, y);
    const targets = g.heroes.filter((h) => h.onBoard && !h.hidden).map((h) => ({ pos: h.pos, hero: h, shelter: E.sheltered(g, h) }))
      .concat(g.lures.map((l) => ({ pos: l.pos, lure: true })))
      .concat(g.stealth ? [] : Object.keys(g.noise).filter((k) => g.noise[k] > 0 && !E.heroesAt(g, +k).length).map((k) => ({ pos: +k })));
    // squad boldness: healthy heroes fight more readily (a killed/wounded enemy is worth more), badly hurt ones are more careful
    const alive = g.heroes.filter((h) => h.onBoard);
    const hurtAvg = alive.length ? alive.reduce((a, h) => a + E.hurtCount(g, h) / Math.max(1, E.maxHp(g, h)), 0) / alive.length : 0;
    const tp = g.turnHero != null && g.heroes[g.turnHero] ? ZG.Persona.get(g.heroes[g.turnHero].id) : null;
    const bold = (1.6 - 1.2 * Math.min(1, hurtAvg * 1.5)) * (tp ? tp.bold : 1); // 1.6 — all intact … 0.4 — all badly hurt; the acting hero's personality
    g.zombies.forEach((z) => {
      const d = ZG.Zombies.get(z.type);
      s -= d.threat * W.zombieThreat * bold;
      s += (z.dmg / d.hp) * d.threat * (d.big ? W.bigDmg : W.partDmg) * bold;
      if (d.dmg <= 0) return;
      const sp = z.suppressed ? 0 : E.zombieSpeed(g, z);
      if (E.hidden(g, z.pos)) return; // zombies do not move in the fog
      const dz = reach[z.pos] || (reach[z.pos] = E.distV(g, z.pos, noBarr));
      let best = Infinity;
      // stealth: only heroes this zombie sees are in danger (a wanderer notices them at the start of the phase)
      const seen = g.stealth ? targets.filter((t) => (t.hero ? E.sees(g, z, t.hero) : t.lure))
        : targets.filter((t) => !(t.shelter && dz[t.pos] > 1));
      seen.forEach((t) => { if (dz[t.pos] < best) best = dz[t.pos]; });
      if (best > sp) return;
      // heads for the nearest target: if it is a lure — not dangerous to heroes
      seen.forEach((t) => { if (t.hero && dz[t.pos] === best) zoneIncoming[t.pos] = (zoneIncoming[t.pos] || 0) + d.dmg; });
    });
    // third-side shooters (bandits, snipers): fire from afar along a line — a hero in the crosshairs risks a shot
    g.zombies.forEach((z) => {
      const d = ZG.Zombies.get(z.type);
      if (!d.faction || !d.range || E.hidden(g, z.pos) || (g.stealth && !z.awake)) return;
      const t = E.banditTarget(g, z);
      if (t && t.hero && t.shot) zoneIncoming[t.pos] = (zoneIncoming[t.pos] || 0) + d.dmg;
    });
    s += g.traps.length * W.trap;
    // the secret mission of the hero whose turn it is: progress is valuable while nobody has finished first
    const fh = g.missions && g.turnHero != null ? g.heroes[g.turnHero] : null;
    if (fh && fh.mission) {
      const m = ZG.Missions.get(fh.mission);
      if (g.missionFirst === fh.idx) s += 150;
      else if (g.missionFirst == null && !fh.missionDone) {
        const pf = ZG.Persona.get(fh.id);
        if (!(m.traitor && pf.honor)) s += (E.missionProgress(g, fh) / m.goal) * 80 * pf.ambition; // an honest one will not become a traitor
        if (m.traitor) s += traitorLure(g, fh);
      }
    }
    // a roadblock at the exit (a scenario with evacBlockedText): each blocking enemy in the exit zone is an obstacle, its wounds are progress
    // Assault: the task is complete, but enemies hold the exit — standing nearby is pointless (time runs out), break through:
    // each blocker and its wounds weigh more, and heroes near the exit are less cautious.
    const blockers = sc.evacBlockedText && E.isComplete(g) ? g.zombies.filter((z) => z.pos === g.exit && E.isBandit(z)) : [];
    blockers.forEach((z) => { const d = ZG.Zombies.get(z.type); s -= 220; s += (z.dmg / d.hp) * 180; });
    const exitD = blockers.length ? E.distV(g, g.exit) : null;
    const alone = g.heroes.filter((o) => o.onBoard).length === 1;
    // hates bandits: on their turn a living bandit is a thorn, its wounds a joy; drawn toward the nearest visible one
    if (fh && fh.onBoard && ZG.Persona.get(fh.id).hatesBandits) {
      const bs = g.zombies.filter((z) => E.isBandit(z) && !E.hidden(g, z.pos));
      bs.forEach((z) => { const d = ZG.Zombies.get(z.type); s -= 140; s += (z.dmg / d.hp) * 120; });
      if (bs.length && E.maxRounds(g) - g.round >= 4 && E.hurtCount(g, fh) * 2 < E.maxHp(g, fh)) {
        const dv = E.distV(g, fh.pos);
        const near = Math.min.apply(null, bs.map((z) => dv[z.pos]));
        if (near < Infinity) s -= Math.min(near, 8) * 25;
      }
    }
    // antisocial: on their turn keeps away from other heroes (except in the exit zone when it is time to leave)
    if (fh && fh.onBoard && ZG.Persona.get(fh.id).loner && !(E.isComplete(g) && fh.pos === g.exit)) {
      g.heroes.forEach((o) => {
        if (o === fh || !o.onBoard) return;
        if (o.pos === fh.pos) s -= 60; else if (g.board.adj[fh.pos].includes(o.pos)) s -= 10; // softer than a step toward the goal: keeps apart, but gets the job done
      });
    }
    // a safe beckons while there is time and strength (campaign — tickets, "Safecracker" — the mission): a slight pull toward it
    if (fh && fh.onBoard && (g.safes || []).length) s -= safePull(g, fh);
    // plugged manholes: every round of silence — fewer zombies
    Object.keys(g.plugs || {}).forEach((k) => { const left = g.plugs[k] - g.round + 1; if (left > 0) s += left * 45; });
    g.heroes.forEach((h) => {
      if (h.fallen) { s -= W.fallen; return; }
      if (h.evacuated) { s += W.evac; return; }
      if (E.isComplete(g) && h.pos === g.exit) { s += W.evac * 0.9; return; } // evacuation costs 0⚡ — almost saved
      const goal = fogTarget(g, E.goalFor(g, h));
      const d = fogDist(g, h.pos);
      const left = E.maxRounds(g) - g.round;
      const urg = (E.isComplete(g) ? 2.5 : 1) * (left <= 3 ? 1.8 : 1);
      if (goal != null && d[goal] < Infinity) s -= d[goal] * W.dist * urg;
      s += h.adrenaline * W.adrenaline + h.block * W.block;
      // Fatigue: block cards wait for "Catch Breath"; an exhausted hero has no basic actions and a hand of −1
      s -= (h.exhaust || []).length * W.exhaust + (E.exhausted(g, h) ? W.tired : 0);
      // infection: each card in hand at the end of the turn is a step toward turning
      const at = E.infectTurnAt(g);
      const infHand = h.hand.filter((u) => g.cards[u] === 'infection').length;
      s -= (h.infection * 140 + infHand * 160 + E.infectCount(g, h) * 45) * (h.infection + infHand >= at - 1 ? 1.8 : 1);
      const hp = E.maxHp(g, h);
      const wounds = E.hurtCount(g, h);
      // hero caution: the less Grit is left, the costlier the risk (0.55 — intact … 2 — on the edge)
      const hpLeft = hp - wounds;
      let risk = (hpLeft <= 1 ? 2 : hpLeft <= 2 ? 1.5 : 0.55 + 0.9 * (wounds / Math.max(1, hp))) * (2 - ZG.Persona.get(h.id).bold); // the bold are less careful
      if (exitD && exitD[h.pos] <= 3 && hpLeft > 1) risk *= alone ? 0.75 : 0.45; // roadblock assault: no hiding by the exit (except those on their last wound; a loner — more careful)
      s -= wounds * W.wound;
      if (hp - wounds <= 1) s -= W.nearDeath;
      // expected attack
      let incoming = 0;
      if (!h.hidden && zoneIncoming[h.pos]) {
        const here = E.heroesAt(g, h.pos).filter((o) => !o.hidden);
        const tank = here.find((o) => ZG.Mods.flag(g, o, 'taunt'));
        if (tank) incoming = tank === h ? zoneIncoming[h.pos] : 0;
        else {
          here.sort((a, b) => E.hurtCount(g, a) - E.hurtCount(g, b) || a.idx - b.idx);
          incoming = here[0] === h ? zoneIncoming[h.pos] : 0;
        }
      }
      let blockable = h.block + ZG.Mods.value(g, h, 'autoBlock', 0);
      h.hand.forEach((u) => { blockable += E.blockValue(g, h, u); });
      const unb = Math.max(0, incoming - blockable);
      s -= (unb * W.unblocked + incoming * W.incoming) * risk;
      if (wounds + unb >= hp) s -= W.death;
      // adjacent threat
      g.board.adj[h.pos].forEach((n) => { s -= (zoneIncoming[n] || 0) * W.adjThreat * risk; });
      s += h.xp * W.xp;
      let val = 0;
      h.deck.concat(h.hand, h.discard, h.equip).forEach((u) => { val += ZG.Cards.get(g.cards[u]).value || 0; });
      // a reserve of useful consumables: do not spend them for a chain or "spare" energy, wait for the moment.
      // Healing items are valuable while the hero is almost healthy; the rest — until the mission is near its end (in the campaign the reserve carries over).
      const roundsLeft = E.maxRounds(g) - g.round;
      const tail = g.campaign ? 1.4 : Math.min(1, roundsLeft / 5);
      const hurtR = E.hurtCount(g, h) / Math.max(1, E.maxHp(g, h));
      h.deck.concat(h.hand, h.discard).forEach((u) => {
        const cd = E.cardDef(g, u);
        if (!cd.consumable || !(cd.loot || cd.campaignOnly)) return;
        const heal = (cd.tags || []).includes('heal');
        const f = heal ? (infHand ? 0 : Math.max(0, 1 - hurtR * 1.6)) : 1;
        val += (cd.value || 0) * W.reserve * f * (heal ? Math.max(tail, 0.6) : tail) / W.cardValue;
      });
      s += val * W.cardValue + h.hand.length * W.hand;
    });
    // a prepared chain: after playing, a playable card of the same suit remains in hand —
    // teaches the AI to order its cards so chain effects trigger (without chasing them at any cost)
    if (g.turn && g.active != null) {
      const h = g.heroes[g.active];
      if (h && h.onBoard) {
        let n = 0;
        h.hand.forEach((u) => { const d = E.cardDef(g, u); if (d.chainText && !d.unplayable && E.chainsNow(g, d) && E.cardCost(g, h, u) <= h.energy) n++; });
        s += Math.min(1, n) * W.chainReady + (g.turn.chains || 0) * W.chainDone;
        // Bond: the first card of the turn has no Chain effect — the bonus was wasted
        if (g.turn.bondUsed === false) s -= W.bondWaste;
      }
    }
    s -= g.alarm * W.alarm;
    // campaign: a turn next to an enemy (the same tile) irritates them — −1 ⚡
    if (g.campaign && g.relStart && g.active != null) {
      const h = g.heroes[g.active];
      if (h && h.onBoard) g.heroes.forEach((o) => { if (o !== h && o.onBoard && E.rel(g, h, o) <= -3 && g.board.cells[o.pos].tile === g.board.cells[h.pos].tile) s -= 8; });
    }
    // the "Gas Leak" event: dangerous for heroes to stand there, good for zombies to be there
    if (g.hazard) {
      g.heroes.forEach((h) => { if (h.onBoard && h.pos === g.hazard.pos) s -= 60; });
      s += E.zombiesAt(g, g.hazard.pos).length * 6;
    }
    return s;
  }

  function tryAct(g, a) {
    const c = E.clone(g);
    if (!E.act(c, a)) return null;
    autoPending(c);
    return c;
  }

  // decisions the AI makes without searching
  function autoPending(g) {
    let guard = 0;
    while (g.pending && guard++ < 20) {
      const p = g.pending;
      if (p.type === 'block') E.act(g, { t: 'block', cards: chooseBlock(g, p) });
      else if (p.type === 'loot') E.act(g, { t: 'loot', id: chooseLoot(g, p) });
      else if (p.type === 'talent') E.act(g, { t: 'talent', id: chooseTalent(g, p) });
      else break;
    }
  }

  // a talent — by position evaluation (with a little random spread, without changing the game RNG)
  function chooseTalent(g, p) {
    let best = p.options[0], bv = -Infinity;
    p.options.forEach((id, i) => { const c = E.clone(g); E.act(c, { t: 'talent', id }); const v = evaluate(c) + ((g.round * 7 + i * 13) % 5); if (v > bv) { bv = v; best = id; } });
    return best;
  }

  function chooseLoot(g, p) {
    return p.options.slice().sort((a, b) => (ZG.Cards.get(b).value || 0) - (ZG.Cards.get(a).value || 0))[0];
  }

  function chooseBlock(g, p) {
    const h = g.heroes[p.hero];
    const cards = h.hand.filter((u) => E.blockValue(g, h, u) > 0)
      .sort((a, b) => (E.cardDef(g, a).value || 5) / E.blockValue(g, h, a) - (E.cardDef(g, b).value || 5) / E.blockValue(g, h, b));
    const out = [];
    let rem = p.remaining;
    const room = Math.max(0, E.EXHAUST_AT - 1 - (h.exhaust || []).length);
    let capRem = rem;
    cards.slice(0, room).forEach((u) => { capRem -= E.blockValue(g, h, u); });
    // "Exhausted" is costlier than one Wound: take 1 extra damage if the hero is not on the edge
    const danger = E.hurtCount(g, h) + Math.max(0, capRem) >= E.maxHp(g, h) - 1 || capRem >= 2;
    const limit = danger ? cards.length : room;
    for (const u of cards) { if (rem <= 0 || out.length >= limit) break; out.push(u); rem -= E.blockValue(g, h, u); }
    return out;
  }

  // "Traitor": valuable when zombies woken or distracted BY THEM end up next to an ally —
  // but only if there is no risk: the traitor is intact, the ally has room to fall, the mission is not burning
  function traitorLure(g, me) {
    if (ZG.Persona.get(me.id).honor) return 0;
    const left = E.maxRounds(g) - g.round;
    if (left < 4 || g.alarm >= E.alarmThreshold(g) - 1) return 0; // time and Alarm — no time for dirty tricks
    if (E.hurtCount(g, me) * 2 >= E.maxHp(g, me)) return 0; // hurt themselves — not now
    const prey = g.heroes.filter((o) => o !== me && o.onBoard && E.maxHp(g, o) - E.hurtCount(g, o) >= 4); // the ally can take a bite
    if (!prey.length) return 0;
    let v = 0;
    g.zombies.forEach((z) => {
      if (z.wokenBy !== me.idx || !z.awake || E.isBandit(z)) return;
      prey.forEach((o) => { if (o.pos === z.pos && me.pos !== z.pos) v += 90; else if (g.board.adj[z.pos].includes(o.pos)) v += 45; });
    });
    return Math.min(v, 180);
  }

  function candidateActions(g) {
    // give: the AI gives only cargo — otherwise the search is too wide
    // "Guardian Angel" gives cards gladly, the rest — only cargo
    const h = g.active != null ? g.heroes[g.active] : null;
    const angel = h && h.mission === 'm_angel' && !h.missionDone && g.missionFirst == null;
    // cracking a safe is decided separately (wantSafe) — the search would "peek" into the closed token stack
    return E.legal(g).filter((a) => a.t !== 'mredraw' && a.t !== 'safe' && a.t !== 'retreat' && (a.t !== 'give' || giveOk(g, h, a, angel)));
  }
  function giveOk(g, h, a, angel) {
    const d = ZG.Cards.get(g.cards[a.card]);
    // the AI does not give away a Valuable (the profit goes to someone else) — unless it is about to fall and a pal or friend is next to it
    if (d.valuable) { const p = ZG.Persona.get(h.id); return p.greed < 2 && E.maxHp(g, h) - E.hurtCount(g, h) <= (p.generous ? 3 : 2) && E.rel(g, h, g.heroes[a.hero]) >= 1; } // the greedy will not give it, the generous — sooner
    return angel || d.kind === 'cargo';
  }
  function safePull(g, h) {
    const sf = g.safes.find((x) => !x.jammed && x.deck.length >= 3);
    if (!sf) return 0;
    const fence = h.mission === 'm_fence' && !h.missionDone && g.missionFirst == null;
    const greed = ZG.Persona.get(h.id).greed;
    if (!fence && (!g.campaign || greed === 0)) return 0;
    if (h.hand.filter((u) => ZG.Cards.get(g.cards[u]).valuable).length >= 2) return 0;
    if (E.maxRounds(g) - g.round < 6 || E.hurtCount(g, h) * 2 >= E.maxHp(g, h)) return 0;
    const d = E.distV(g, h.pos)[sf.pos];
    return d === Infinity ? 0 : Math.min(d, 8) * (fence ? 60 : greed >= 2 ? 35 : 20);
  }
  // Safe: whether to crack one more compartment. The interest — tickets (campaign) or "Safecracker"; the risk — the siren (1 of the remaining tokens),
  // time, Alarm, own wounds, hunters nearby and a cluttered hand
  function wantSafe(g, h) {
    const sf = E.safeAt(g, h.pos);
    if (!sf || sf.jammed || !sf.deck.length || h.energy < E.SAFE_COST) return false;
    if (E.zombiesAt(g, h.pos).length) return false; // enemies in the zone (bandits and sleepers too) — cracking is impossible
    const fence = h.mission === 'm_fence' && !h.missionDone && g.missionFirst == null;
    const greed = ZG.Persona.get(h.id).greed;
    if (!fence && (!g.campaign || greed === 0)) return false; // the unmercenary cracks a safe only for a mission
    const vals = h.hand.filter((u) => ZG.Cards.get(g.cards[u]).valuable).length;
    if (vals >= (greed >= 2 ? 3 : 2) && !(fence && !(h.ms.safeLoot || 0))) return false; // the hand is cluttered already (the greedy tolerate more)
    if (sf.deck.length < (fence || greed >= 2 ? 2 : 3)) return false; // the siren is 1 of the remaining: the greedy risk it to the last
    if (E.maxRounds(g) - g.round < 4) return false;
    if (E.hurtCount(g, h) * 2 >= E.maxHp(g, h)) return false;
    if (g.alarm + E.SAFE_NOISE + (E.jingles(g, h) ? 1 : 0) >= E.alarmThreshold(g)) return false; // the noise must not trigger a Wave
    const d = E.distV(g, h.pos);
    if (g.zombies.some((z) => !E.isBandit(z) && (!g.stealth || z.awake) && d[z.pos] <= 1)) return false; // hunters right next to you
    return true;
  }

  // Retreat (campaign): only bots decide, when only bots are alive. The task is not complete and only one is left standing —
  // it will only get worse: lead the survivor out and replay the mission.
  function wantRetreat(g) {
    if (!g.campaign || !(g.retreats > 0) || E.isComplete(g) || !E.legal(g).some((a) => a.t === 'retreat')) return false;
    const live = g.heroes.filter((h) => !h.fallen && !h.evacuated);
    if (!live.length || live.some((h) => !h.ai)) return false;
    const fell = g.heroes.filter((h) => h.fallen).length;
    return g.heroes.length >= 2 && fell > 0 && live.length <= 1; // only one left standing — lead them out (retreating earlier loses winnable games)
  }

  function bestAction(g, opts) {
    const depth2 = !opts || opts.depth2 !== false;
    const cands = candidateActions(g);
    // evacuation is available — leave at once (otherwise the "after the zombie phase" evaluation unfairly scares the AI)
    const evac = cands.find((a) => a.t === 'evac');
    if (evac) {
      // campaign: a comrade within 1–2 zones of the exit — do not abandon them if nothing threatens you (otherwise relations −1)
      const h = g.heroes[g.active];
      const near = E.leftBehind(g, h);
      const threat = g.board.adj[h.pos].concat(h.pos).some((n) => E.zombiesAt(g, n).length);
      const last = E.maxRounds(g) - g.round <= 0;
      if (near.length && !threat && !last && E.maxHp(g, h) - E.hurtCount(g, h) > 1) return { t: 'end' };
      return evac;
    }
    const base = evaluate(g);
    const scored = [];
    cands.forEach((a) => {
      if (a.t === 'end') return;
      if (a.explore) {
        // a step into the fog is evaluated without peeking: how much closer to the goal + curiosity
        const h = g.heroes[g.active];
        const goal = fogTarget(g, E.goalFor(g, h));
        if (goal == null) return;
        const d0 = fogDist(g, h.pos)[goal], d1 = fogDist(g, a.to)[goal];
        scored.push({ a, c: null, v: base + (d0 - d1) * W.dist + 4 - E.moveCost(g, h, a.to) });
        return;
      }
      const c = tryAct(g, a);
      if (!c) return;
      // the turn has ended (evacuation/death) — evaluate as is
      scored.push({ a, c, v: evaluate(c) });
    });
    if (!scored.length) return null;
    scored.sort((x, y) => y.v - x.v);
    if (depth2) {
      scored.slice(0, 4).forEach((s) => {
        if (!s.c || s.c.active == null || s.c.phase !== 'heroes') return;
        let best = s.v;
        candidateActions(s.c).forEach((a2) => {
          if (a2.t === 'end') return;
          const c2 = tryAct(s.c, a2);
          if (c2) best = Math.max(best, evaluate(c2));
        });
        s.v2 = best;
      });
      scored.forEach((s) => { s.score = Math.max(s.v, (s.v2 != null ? s.v2 : s.v) - 0.5); });
      scored.sort((x, y) => y.score - x.score);
    } else scored.forEach((s) => { s.score = s.v; });
    const top = scored[0];
    if (top.score <= base + 0.01) return null;
    return top.a;
  }

  function chooseHero(g) {
    const ready = g.heroes.filter((h) => h.onBoard && !h.acted);
    // the healer goes first if someone needs a bite disinfected; the infected — after them
    const bitten = g.heroes.filter((o) => o.onBoard && o.hand.some((u) => g.cards[u] === 'infection'));
    const pri = (h) => (bitten.length && ZG.Mods.flag(g, h, 'healAction') ? 2 : 0) - (bitten.includes(h) && ready.some((m) => m !== h && ZG.Mods.flag(g, m, 'healAction')) ? 1 : 0);
    ready.sort((a, b) => pri(b) - pri(a) || E.zombiesAt(g, b.pos).length - E.zombiesAt(g, a.pos).length || a.idx - b.idx);
    return ready[0];
  }

  // Play the turn of the current (or next) hero in full
  function playTurn(g, opts) {
    if (g.phase !== 'heroes' || g.result) return;
    if (g.active == null) {
      const h = chooseHero(g);
      if (!h) return;
      E.act(g, { t: 'begin', hero: h.idx });
    }
    const idx = g.active;
    // the secret mission does not fit the hero — swap it (once per game)
    const me = g.heroes[idx];
    if (me && me.mission && !me.missionRedrawn && !me.missionDone && g.missionFirst == null) {
      const m = ZG.Missions.get(me.mission);
      if ((m.id === 'm_ghost' && ZG.Mods.flag(g, me, 'loud')) || (m.traitor && ZG.Persona.get(me.id).honor)) E.act(g, { t: 'mredraw' }); // an honest one swaps the "Traitor"; the rest keep it and play dirty when it is safe
    }
    if (wantRetreat(g)) { E.act(g, { t: 'retreat' }); return; }
    for (let i = 0; i < 40; i++) {
      autoPending(g);
      if (g.active !== idx || g.result) return;
      if (wantSafe(g, g.heroes[idx]) && E.act(g, { t: 'safe' })) continue; // did not work — act in the usual order
      const a = bestAction(g, opts);
      if (!a) break;
      E.act(g, a);
    }
    autoPending(g);
    if (g.active === idx) E.act(g, { t: 'end' });
    autoPending(g);
  }

  function playGame(g, opts) {
    let guard = 0;
    while (!g.result && guard++ < 500) {
      autoPending(g);
      if (g.phase === 'heroes') playTurn(g, opts);
    }
    return g;
  }

  ZG.Bot = { evaluate, bestAction, playTurn, playGame, chooseBlock, chooseLoot, chooseTalent, autoPending };
})(typeof globalThis !== 'undefined' ? globalThis : window);
