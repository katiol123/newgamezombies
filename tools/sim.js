#!/usr/bin/env node
/*
 * Симулятор баланса: прогоняет партии ИИ и печатает статистику.
 *
 *   node tools/sim.js [--games N] [--heroes boris,lisa] [--scenario fuel] [--condition fog]
 *                     [--difficulty survivor] [--all-pairs] [--solo] [--fast] [--seed S] [--json] [--set '{"rounds":11}']
 */
const ZG = require('./load');

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { games: 40, heroes: null, scenario: null, condition: null, difficulty: 'survivor', allPairs: false, solo: false, fast: false, seed: 'sim', json: false, trios: false };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--games') o.games = +a[++i];
    else if (k === '--heroes') o.heroes = a[++i].split(',');
    else if (k === '--scenario') o.scenario = a[++i];
    else if (k === '--condition') o.condition = a[++i];
    else if (k === '--difficulty') o.difficulty = a[++i];
    else if (k === '--all-pairs') o.allPairs = true;
    else if (k === '--solo') o.solo = true;
    else if (k === '--trios') o.trios = true;
    else if (k === '--fast') o.fast = true;
    else if (k === '--seed') o.seed = a[++i];
    else if (k === '--json') o.json = true;
    else if (k === '--nofog') o.fog = false;
    else if (k === '--set') Object.assign(ZG.Levels.get('outskirts'), JSON.parse(a[++i])); // проба параметров уровня
  }
  return o;
}

function runBatch(heroIds, o, tag) {
  const res = { games: 0, wins: 0, stars: 0, rounds: 0, kills: 0, wounds: 0, fell: 0, waves: 0, chains: 0, played: 0, byScenario: {}, reasons: {} };
  for (let i = 0; i < o.games; i++) {
    const g = ZG.Engine.create({
      seed: `${o.seed}-${tag}-${i}`, quiet: true, difficultyId: o.difficulty,
      heroes: heroIds.map((id, k) => ({ id, player: (k % 2) + 1 })),
      scenarioId: o.scenario || undefined, conditionId: o.condition || undefined, fog: o.fog,
    });
    ZG.Bot.playGame(g, { depth2: !o.fast });
    res.games++;
    const r = g.result || { win: false, reason: 'timeout', stars: 0 };
    if (r.win) { res.wins++; res.stars += r.stars; }
    res.rounds += g.round; res.kills += g.stats.kills; res.wounds += g.stats.wounds; res.fell += g.stats.fell;
    res.waves += g.stats.waves; res.infections = (res.infections || 0) + (g.stats.infections || 0); res.turned = (res.turned || 0) + (g.stats.turned || 0); res.chains += g.stats.chains; res.played += g.stats.cardsPlayed;
    const sc = (res.byScenario[g.scenarioId] = res.byScenario[g.scenarioId] || { n: 0, w: 0 });
    sc.n++; if (r.win) sc.w++;
    res.reasons[r.reason] = (res.reasons[r.reason] || 0) + 1;
  }
  return res;
}

function fmt(heroIds, r) {
  const pct = (x) => ((100 * x) / r.games).toFixed(0) + '%';
  const sc = Object.entries(r.byScenario).map(([k, v]) => `${k} ${v.w}/${v.n}`).join(' ');
  return `${heroIds.join('+').padEnd(22)} win ${pct(r.wins).padStart(4)}  ★avg ${(r.stars / Math.max(1, r.wins)).toFixed(2)}  rnd ${(r.rounds / r.games).toFixed(1)}  kills ${(r.kills / r.games).toFixed(1)}  wounds ${(r.wounds / r.games).toFixed(1)}  fell ${(r.fell / r.games).toFixed(2)}  waves ${(r.waves / r.games).toFixed(1)}  chain% ${((100 * r.chains) / Math.max(1, r.played)).toFixed(0)}  infect ${((r.infections || 0) / r.games).toFixed(1)}  turned ${((r.turned || 0) / r.games).toFixed(2)}  | ${sc}`;
}

function main() {
  const o = parseArgs();
  const all = ZG.Heroes.all().map((h) => h.id);
  let combos = [];
  if (o.allPairs) { for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) combos.push([all[i], all[j]]); }
  else if (o.solo) combos = all.map((h) => [h]);
  else if (o.trios) { for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) for (let k = j + 1; k < all.length; k++) combos.push([all[i], all[j], all[k]]); }
  else combos = [o.heroes || ['boris', 'lisa']];
  const t0 = Date.now();
  const out = [];
  let tot = { g: 0, w: 0 };
  combos.forEach((c, i) => {
    const r = runBatch(c, o, i);
    out.push({ heroes: c, ...r });
    tot.g += r.games; tot.w += r.wins;
    if (!o.json) console.log(fmt(c, r));
  });
  if (o.json) console.log(JSON.stringify(out, null, 1));
  else {
    const per = {};
    out.forEach((r) => r.heroes.forEach((h) => { per[h] = per[h] || { g: 0, w: 0 }; per[h].g += r.games; per[h].w += r.wins; }));
    console.log('\nПо героям: ' + Object.entries(per).map(([h, v]) => `${h} ${((100 * v.w) / v.g).toFixed(0)}%`).join('  '));
    console.log(`Итого: ${tot.w}/${tot.g} = ${((100 * tot.w) / tot.g).toFixed(1)}%  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}
main();
