/*
 * ИИ-игрок. Используется симулятором баланса и кнопкой «Подсказка» в интерфейсе.
 * Жадный поиск с просмотром на 2 действия вперёд и эвристической оценкой позиции.
 * Ничего не знает о конкретных картах — оценивает результат, поэтому
 * автоматически «понимает» новый контент.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const E = ZG.Engine;

  const W = {
    progress: 450, complete: 500, evac: 600, fallen: 2200, dist: 22, wound: 40, nearDeath: 70,
    unblocked: 55, death: 900, incoming: 5, adjThreat: 5, xp: 3, cardValue: 0.7, hand: 1.5,
    zombieThreat: 4, alarm: 7, crate: 650, search: 6, bigDmg: 25, partDmg: 6, adrenaline: 9, trap: 14, block: 2,
  };
  ZG.BotWeights = W;

  // Честное расстояние в тумане: по открытым тайлам — как есть, закрытые тайлы считаются
  // проходимыми насквозь (бот не знает, где там стены), цель на закрытом тайле — его центр.
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
    // угроза: зомби, которые успеют дойти до зоны героя в эту фазу
    const zoneIncoming = {};
    const reach = {};
    const noBarr = (x, y) => !E.barricadeAt(g, x, y);
    const targets = g.heroes.filter((h) => h.onBoard && !h.hidden).map((h) => ({ pos: h.pos, hero: h, shelter: E.sheltered(g, h) }))
      .concat(g.lures.map((l) => ({ pos: l.pos, lure: true })))
      .concat(g.stealth ? [] : Object.keys(g.noise).filter((k) => g.noise[k] > 0 && !E.heroesAt(g, +k).length).map((k) => ({ pos: +k })));
    g.zombies.forEach((z) => {
      const d = ZG.Zombies.get(z.type);
      s -= d.threat * W.zombieThreat;
      s += (z.dmg / d.hp) * d.threat * (d.big ? W.bigDmg : W.partDmg);
      if (d.dmg <= 0) return;
      const sp = z.suppressed ? 0 : E.zombieSpeed(g, z);
      if (E.hidden(g, z.pos)) return; // в тумане зомби не двигаются
      const dz = reach[z.pos] || (reach[z.pos] = E.distV(g, z.pos, noBarr));
      let best = Infinity;
      // скрытность: опасны только герои, которых этот зомби видит (бродячий их заметит в начале фазы)
      const seen = g.stealth ? targets.filter((t) => (t.hero ? E.sees(g, z, t.hero) : t.lure))
        : targets.filter((t) => !(t.shelter && dz[t.pos] > 1));
      seen.forEach((t) => { if (dz[t.pos] < best) best = dz[t.pos]; });
      if (best > sp) return;
      // идёт к ближайшей цели: если это приманка — героям не опасен
      seen.forEach((t) => { if (t.hero && dz[t.pos] === best) zoneIncoming[t.pos] = (zoneIncoming[t.pos] || 0) + d.dmg; });
    });
    s += g.traps.length * W.trap;
    // секретная миссия героя, который сейчас ходит: прогресс ценен, пока никто не успел первым
    const fh = g.missions && g.turnHero != null ? g.heroes[g.turnHero] : null;
    if (fh && fh.mission) {
      const m = ZG.Missions.get(fh.mission);
      if (g.missionFirst === fh.idx) s += 150;
      else if (g.missionFirst == null && !fh.missionDone) {
        s += (E.missionProgress(g, fh) / m.goal) * 120;
      }
    }
    // заглушенные люки: каждый раунд тишины — меньше зомби
    Object.keys(g.plugs || {}).forEach((k) => { const left = g.plugs[k] - g.round + 1; if (left > 0) s += left * 45; });
    g.heroes.forEach((h) => {
      if (h.fallen) { s -= W.fallen; return; }
      if (h.evacuated) { s += W.evac; return; }
      if (E.isComplete(g) && h.pos === g.exit) { s += W.evac * 0.9; return; } // эвакуация стоит 0⚡ — почти спасён
      const goal = fogTarget(g, E.goalFor(g, h));
      const d = fogDist(g, h.pos);
      const left = E.maxRounds(g) - g.round;
      const urg = (E.isComplete(g) ? 2.5 : 1) * (left <= 3 ? 1.8 : 1);
      if (goal != null && d[goal] < Infinity) s -= d[goal] * W.dist * urg;
      s += h.adrenaline * W.adrenaline + h.block * W.block;
      // заражение: каждая карта в руке в конце хода — шаг к обращению
      const at = E.infectTurnAt(g);
      const infHand = h.hand.filter((u) => g.cards[u] === 'infection').length;
      s -= (h.infection * 140 + infHand * 160 + E.infectCount(g, h) * 45) * (h.infection + infHand >= at - 1 ? 1.8 : 1);
      const hp = E.maxHp(g, h);
      const wounds = E.hurtCount(g, h);
      s -= wounds * W.wound;
      if (hp - wounds <= 1) s -= W.nearDeath;
      // ожидаемая атака
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
      s -= unb * W.unblocked + incoming * W.incoming;
      if (wounds + unb >= hp) s -= W.death;
      // соседняя угроза
      g.board.adj[h.pos].forEach((n) => { s -= (zoneIncoming[n] || 0) * W.adjThreat; });
      s += h.xp * W.xp;
      let val = 0;
      h.deck.concat(h.hand, h.discard, h.equip).forEach((u) => { val += ZG.Cards.get(g.cards[u]).value || 0; });
      s += val * W.cardValue + h.hand.length * W.hand;
    });
    s -= g.alarm * W.alarm;
    // событие «Утечка газа»: героям там стоять опасно, зомби там — хорошо
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

  // решения, которые принимает ИИ без перебора
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

  // талант — по оценке позиции (с небольшим случайным разбросом, без изменения ГСЧ партии)
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
    for (const u of cards) { if (rem <= 0) break; out.push(u); rem -= E.blockValue(g, h, u); }
    return out;
  }

  function candidateActions(g) {
    // give: ИИ передаёт только грузы — иначе слишком широкий перебор
    // «Ангел-хранитель» передаёт карты охотно, остальные — только грузы
    const h = g.active != null ? g.heroes[g.active] : null;
    const angel = h && h.mission === 'm_angel' && !h.missionDone && g.missionFirst == null;
    return E.legal(g).filter((a) => a.t !== 'mredraw' && (a.t !== 'give' || angel || ZG.Cards.get(g.cards[a.card]).kind === 'cargo'));
  }

  function bestAction(g, opts) {
    const depth2 = !opts || opts.depth2 !== false;
    const cands = candidateActions(g);
    // эвакуация доступна — уходим сразу (иначе оценка «после фазы зомби» нечестно пугает ИИ)
    const evac = cands.find((a) => a.t === 'evac');
    if (evac) return evac;
    const base = evaluate(g);
    const scored = [];
    cands.forEach((a) => {
      if (a.t === 'end') return;
      if (a.explore) {
        // шаг в туман оцениваем без подглядывания: насколько ближе к цели + любопытство
        const h = g.heroes[g.active];
        const goal = fogTarget(g, E.goalFor(g, h));
        if (goal == null) return;
        const d0 = fogDist(g, h.pos)[goal], d1 = fogDist(g, a.to)[goal];
        scored.push({ a, c: null, v: base + (d0 - d1) * W.dist + 4 - E.moveCost(g, h, a.to) });
        return;
      }
      const c = tryAct(g, a);
      if (!c) return;
      // ход завершился (эвакуация/смерть) — оцениваем как есть
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
    // лекарь ходит первым, если кому-то нужно обеззаразить укус; заражённые — после него
    const bitten = g.heroes.filter((o) => o.onBoard && o.hand.some((u) => g.cards[u] === 'infection'));
    const pri = (h) => (bitten.length && ZG.Mods.flag(g, h, 'healAction') ? 2 : 0) - (bitten.includes(h) && ready.some((m) => m !== h && ZG.Mods.flag(g, m, 'healAction')) ? 1 : 0);
    ready.sort((a, b) => pri(b) - pri(a) || E.zombiesAt(g, b.pos).length - E.zombiesAt(g, a.pos).length || a.idx - b.idx);
    return ready[0];
  }

  // Провести ход текущего (или следующего) героя целиком
  function playTurn(g, opts) {
    if (g.phase !== 'heroes' || g.result) return;
    if (g.active == null) {
      const h = chooseHero(g);
      if (!h) return;
      E.act(g, { t: 'begin', hero: h.idx });
    }
    const idx = g.active;
    // секретная миссия не стыкуется с героем — сменить (раз за партию)
    const me = g.heroes[idx];
    if (me && me.mission && !me.missionRedrawn && !me.missionDone && g.missionFirst == null) {
      const m = ZG.Missions.get(me.mission);
      if ((m.id === 'm_ghost' && ZG.Mods.flag(g, me, 'loud')) || m.traitor) E.act(g, { t: 'mredraw' });
    }
    for (let i = 0; i < 40; i++) {
      autoPending(g);
      if (g.active !== idx || g.result) return;
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
