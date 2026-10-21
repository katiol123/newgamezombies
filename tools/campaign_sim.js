#!/usr/bin/env node
/*
 * Симулятор кампании: ИИ проходит цепочку миссий с переносом героев между ними.
 *   node tools/campaign_sim.js [--runs N] [--heroes boris,lisa] [--difficulty novice] [--fast] [--seed S] [--verbose]
 * Между миссиями — простая политика убежища: продать хлам, лечиться, строить Лазарет/Склад, нанимать при нехватке.
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

// Политика убежища для ИИ (простая, но разумная)
function shelterAI(c) {
  c.roster.forEach((h) => {
    while (h.injury > 0 && !C.heal(c, h.id)) { /* лечимся, пока хватает */ }
    ['infirmary', 'storage', 'workshop', 'bath', 'redcorner'].forEach((b) => { if (h.talons >= ZG.Buildings.get(b).cost + 10) C.build(c, h.id, b); });
    h.chest.forEach((it, i) => { if (it.worn && C.built(h, 'workshop')) C.repair(c, h.id, 'chest', i); });
    // экипировка: лучшие карты из сундука (по ценности)
    while (h.equip.length < C.equipCap(h) && h.chest.length) {
      let best = 0; h.chest.forEach((it, i) => { if ((ZG.Cards.get(it.id).value || 0) > (ZG.Cards.get(h.chest[best].id).value || 0)) best = i; });
      C.move(c, h.id, 'chest', best, 'equip');
    }
  });
  while (c.roster.length < c.squad) {
    const payer = c.roster.slice().sort((a, b) => b.talons - a.talons)[0];
    const id = C.hireable(c)[0];
    if (!payer || !id || C.hire(c, payer.id, id)) break;
  }
  // отряд: самые здоровые
  return c.roster.slice().sort((a, b) => C.hp(b) - C.hp(a) || b.level - a.level).slice(0, c.squad).map((h) => h.id);
}

function run(o, k) {
  const c = C.create({ heroes: o.heroes.map((id) => ({ id })), seed: `${o.seed}-${k}`, difficultyId: o.difficulty });
  const trail = [];
  while (c.status === 'ready') {
    const squad = shelterAI(c);
    if (c.status !== 'ready' || squad.length < c.squad) { c.status = 'over'; c.endReason = 'Отряд не собрать'; break; }
    const opts = C.startMission(c, squad);
    if (opts.error) throw new Error(opts.error);
    opts.quiet = true;
    const g = ZG.Engine.create(opts);
    ZG.Bot.playGame(g, { depth2: !o.fast });
    const rep = C.finishMission(c, g);
    trail.push(`${rep.win ? 'W' : 'L'}${rep.stars}`);
    const pm = (perMission[rep.missionNo - 1] = perMission[rep.missionNo - 1] || { n: 0, w: 0 }); pm.n++; if (rep.win) pm.w++;
    if (o.verbose) console.log(`  миссия ${rep.missionNo}: ${rep.win ? 'победа' : 'провал'} ★${rep.stars} | ` + c.roster.map((h) => `${h.id} L${h.level} xp${h.xp} hp${C.hp(h)} мор${h.morale} 🎫${h.talons} экип${h.equip.length} сунд${h.chest.length}`).join('; ') + (rep.lost.length ? ` | выбыли: ${rep.lost.map((l) => l.id + (l.turned ? '(обращён)' : '')).join(',')}` : '') + (c.wanderers.length ? ` | бродят: ${c.wanderers.join(',')}` : ''));
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
  console.log(`#${k} ${c.status.padEnd(4)} миссий ${c.missionNo}/${c.chainLength} [${trail.join(' ')}] ${c.endReason || ''}`);
}
console.log('По миссиям (побед/сыграно): ' + perMission.map((m, i) => `${i + 1}: ${m.w}/${m.n}`).join('  '));
console.log(`\nКампаний пройдено: ${won}/${o.runs}; в среднем миссий: ${(reached / o.runs).toFixed(1)}; уровни выживших: ${levels.length ? (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1) : '-'}`);
