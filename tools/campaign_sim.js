#!/usr/bin/env node
/*
 * Campaign simulator: the AI plays through the mission chain, carrying heroes between missions.
 *   node tools/campaign_sim.js [--runs N] [--heroes boris,lisa] [--difficulty novice] [--fast] [--seed S] [--verbose]
 * Between missions — a simple shelter policy: sell junk, heal, build the Infirmary/Storeroom, hire when short-handed.
 */
const ZG = require('./load');
const C = ZG.Campaign;

function args() {
  const a = process.argv.slice(2), o = { runs: 20, heroes: ['boris', 'lisa'], seed: 'camp', verbose: false, difficulty: 'survivor', fast: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--runs') o.runs = +a[++i];
    else if (a[i] === '--heroes') o.heroes = a[++i].split(',');
    else if (a[i] === '--seed') o.seed = a[++i];
    else if (a[i] === '--verbose') o.verbose = true;
    else if (a[i] === '--difficulty') o.difficulty = a[++i];
    else if (a[i] === '--fast') o.fast = true;
  }
  return o;
}

// Shelter policy for the AI (simple but reasonable)
function shelterAI(c) {
  c.roster.forEach((h) => {
    while (h.injury > 0 && !C.heal(c, h.id)) { /* heal while we can afford it */ }
    C.autoManage(c, h.id); // buildings, the range and card layout — as for AI heroes in the game
    h.chest.forEach((it, i) => { if (it.worn && C.built(h, 'workshop')) C.repair(c, h.id, 'chest', i); });
    // loadout: the best cards from the chest (by value)
    while (h.equip.length < C.equipCap(h) && h.chest.length) {
      let best = 0; h.chest.forEach((it, i) => { if ((ZG.Cards.get(it.id).value || 0) > (ZG.Cards.get(h.chest[best].id).value || 0)) best = i; });
      C.move(c, h.id, 'chest', best, 'equip');
    }
  });
  if (c.eventDraw && !c.eventDraw.done) C.resolveEvent(c, C.eventAI(c)); // shelter event — the bot decides
  while (c.roster.length < c.squad) {
    const payer = c.roster.slice().sort((a, b) => b.talons - a.talons)[0];
    const id = C.hireable(c)[0];
    if (!payer || !id || C.hire(c, payer.id, id)) break;
  }
  // squad: the healthiest
  return c.roster.slice().sort((a, b) => C.hp(b) - C.hp(a) || b.level - a.level).slice(0, c.squad).map((h) => h.id);
}

function run(o, k) {
  const c = C.create({ heroes: o.heroes.map((id) => ({ id, ai: true })), seed: `${o.seed}-${k}`, difficultyId: o.difficulty });
  const trail = [];
  while (c.status === 'ready') {
    const squad = shelterAI(c);
    if (c.status !== 'ready' || !squad.length) { c.status = 'over'; c.endReason = 'Cannot field a squad'; break; }
    const opts = C.startMission(c, squad);
    if (opts.error) throw new Error(opts.error);
    opts.quiet = true;
    const g = ZG.Engine.create(opts);
    ZG.Bot.playGame(g, { depth2: !o.fast });
    const rep = C.finishMission(c, g);
    trail.push(`${rep.win ? 'W' : rep.retreat ? 'R' : 'L'}${rep.stars}`);
    const pm = (perMission[rep.missionNo - 1] = perMission[rep.missionNo - 1] || { n: 0, w: 0, wounds: 0, clean: 0 }); pm.n++; if (rep.win) pm.w++;
    pm.wounds += g.stats.wounds; if (!g.stats.wounds) pm.clean++; // squad wounds per mission; “clean” missions have no wounds at all
    if (o.verbose) console.log(`  mission ${rep.missionNo}: ${rep.win ? 'win' : 'loss'} ★${rep.stars} | ` + c.roster.map((h) => `${h.id} L${h.level} xp${h.xp} hp${C.hp(h)} mor${h.morale} 🎫${h.talons} eq${h.equip.length} ch${h.chest.length}`).join('; ') + (rep.lost.length ? ` | lost: ${rep.lost.map((l) => l.id + (l.turned ? '(turned)' : '')).join(',')}` : '') + (c.wanderers.length ? ` | roaming: ${c.wanderers.join(',')}` : ''));
  }
  return { c, trail };
}

const o = args();
let won = 0, reached = 0;
const perMission = [];
const levels = [];
for (let k = 0; k < o.runs; k++) {
  const { c, trail } = run(o, k);
  if (c.status === 'won') won++;
  reached += c.missionNo;
  c.roster.forEach((h) => levels.push(h.level));
  console.log(`#${k} ${c.status.padEnd(4)} missions ${c.missionNo}/${c.chainLength} [${trail.join(' ')}] ${c.endReason || ''}`);
}
console.log('By mission (wins/played): ' + perMission.map((m, i) => `${i + 1}: ${m.w}/${m.n}`).join('  '));
console.log('Squad wounds per mission (average) / missions without wounds: ' + perMission.map((m, i) => `${i + 1}: ${(m.wounds / m.n).toFixed(1)} / ${Math.round((100 * m.clean) / m.n)}%`).join('  '));
console.log(`\nCampaigns completed: ${won}/${o.runs}; average missions: ${(reached / o.runs).toFixed(1)}; survivor levels: ${levels.length ? (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1) : '-'}`);
