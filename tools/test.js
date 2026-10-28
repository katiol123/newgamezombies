#!/usr/bin/env node
// Engine smoke tests: AI games with all heroes/objectives/conditions + invariants.
const ZG = require('./load');
const E = ZG.Engine;
let fails = 0;
function check(cond, msg) { if (!cond) { fails++; console.error('FAIL:', msg); } }

const heroes = ZG.Heroes.visible().map((h) => h.id);
const lvl = ZG.Levels.get('outskirts');
let n = 0;
lvl.scenarios.forEach((sc) => lvl.conditions.forEach((cond, ci) => {
  const team = [heroes[ci % 5], heroes[(ci + 2) % 5]].concat(ci % 3 === 0 ? [heroes[(ci + 4) % 5]] : []);
  const g = E.create({ seed: `t-${sc}-${cond}`, quiet: true, heroes: team.map((id) => ({ id })), scenarioId: sc, conditionId: cond });
  // the board is connected, key points are on passable cells
  const d = E.dist(g, g.start);
  check(d[g.exit] < Infinity, `${sc}/${cond}: exit unreachable`);
  g.spawnPoints.forEach((p) => check(d[p] < Infinity, 'manhole unreachable'));
  g.crates.forEach((c) => check(d[c.pos] < Infinity, 'crate unreachable'));
  try { ZG.Bot.playGame(g); } catch (e) { fails++; console.error('EXCEPTION', sc, cond, e.stack); return; }
  check(!!g.result, `${sc}/${cond}: the game did not finish`);
  // each hero card is in exactly one place
  g.heroes.forEach((h) => {
    const all = h.deck.concat(h.hand, h.discard, h.equip);
    check(new Set(all).size === all.length, 'duplicate card for ' + h.id);
  });
  n++;
}));
// tile design rule: side midpoints are passable, the tile is connected inside
ZG.Tiles.all().forEach((t) => {
  [[1, 0], [0, 1], [2, 1], [1, 2]].forEach(([x, y]) => check(t.map[y][x] !== '#', `tile ${t.id}: side midpoint [${x},${y}] is impassable`));
  const b = ZG.Board.fromPlaced([{ id: t.id, rot: 0, tx: 0, ty: 0 }], 1, 1);
  const open = b.cells.filter((c) => c.type !== 'blocked');
  const d = ZG.Board.bfs(b, open[0].i);
  check(open.every((c) => d[c.i] < Infinity), `tile ${t.id}: not all zones are connected inside`);
});
// any layout is connected
for (let k = 0; k < 500; k++) {
  const r = { rng: k * 7919 + 1 };
  const ids = ZG.Rng.shuffle(r, lvl.tiles.slice());
  const { tw, th } = lvl.layout;
  const placed = []; for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) placed.push({ id: ids[(ty * tw + tx) % ids.length], rot: ZG.Rng.int(r, 4), tx, ty });
  const b = ZG.Board.fromPlaced(placed, tw, th);
  const open = b.cells.filter((c) => c.type !== 'blocked');
  const d = ZG.Board.bfs(b, open[0].i);
  if (open.some((c) => d[c.i] === Infinity)) { check(false, 'disconnected layout #' + k); break; }
}
// reproducibility by seed
const a = E.create({ seed: 'repro', quiet: true, heroes: [{ id: 'lisa' }, { id: 'kira' }] });
const b = E.create({ seed: 'repro', quiet: true, heroes: [{ id: 'lisa' }, { id: 'kira' }] });
ZG.Bot.playGame(a); ZG.Bot.playGame(b);
check(a.round === b.round && a.stats.kills === b.stats.kills && a.result.win === b.result.win, 'the game does not reproduce from its seed');
console.log(`${n} games played, errors: ${fails}`);
process.exit(fails ? 1 : 0);
