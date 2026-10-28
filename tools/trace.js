#!/usr/bin/env node
// Prints the log of one AI game: node tools/trace.js [seed] [heroes] [scenario]
const ZG = require('./load');
const seed = process.argv[2] || 't1';
const heroes = (process.argv[3] || 'boris,lisa').split(',');
const g = ZG.Engine.create({ seed, heroes: heroes.map((id) => ({ id })), scenarioId: process.argv[4] || undefined });
function ascii(g) {
  const b = g.board; let s = '';
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x, c = b.cells[i];
      let ch = c.type === 'blocked' ? '#' : c.type === 'building' ? ':' : '.';
      if (g.search.some((q) => q.pos === i)) ch = '?';
      if (g.crates.some((q) => q.pos === i && !q.opened)) ch = 'C';
      if (g.spawnPoints.includes(i)) ch = 'S';
      if (i === g.exit) ch = 'X';
      if (i === g.tower) ch = 'T';
      const zs = g.zombies.filter((z) => z.pos === i).length; if (zs) ch = String(Math.min(9, zs));
      const h = g.heroes.find((h) => h.onBoard && h.pos === i); if (h) ch = h.id[0].toUpperCase();
      s += ch + ' ';
    }
    s += '\n';
  }
  return s;
}
console.log(ascii(g));
let lastRound = 0;
let guard = 0;
while (!g.result && guard++ < 400) {
  ZG.Bot.autoPending(g);
  if (g.phase === 'heroes') ZG.Bot.playTurn(g);
  if (g.round !== lastRound && g.phase === 'heroes') { lastRound = g.round; console.log(`\n== R${g.round} alarm ${g.alarm} zombies ${g.zombies.length}`); console.log(ascii(g)); }
}
g.log.forEach((l) => console.log(`[${l.round}] ${l.text}`));
console.log(g.result);
