#!/usr/bin/env node
// Дымовые тесты движка: партии ИИ со всеми героями/заданиями/условиями + инварианты.
const ZG = require('./load');
const E = ZG.Engine;
let fails = 0;
function check(cond, msg) { if (!cond) { fails++; console.error('FAIL:', msg); } }

const heroes = ZG.Heroes.all().map((h) => h.id);
const lvl = ZG.Levels.get('outskirts');
let n = 0;
lvl.scenarios.forEach((sc) => lvl.conditions.forEach((cond, ci) => {
  const team = [heroes[ci % 5], heroes[(ci + 2) % 5]].concat(ci % 3 === 0 ? [heroes[(ci + 4) % 5]] : []);
  const g = E.create({ seed: `t-${sc}-${cond}`, quiet: true, heroes: team.map((id) => ({ id })), scenarioId: sc, conditionId: cond });
  // поле связно, ключевые точки на проходимых клетках
  const d = E.dist(g, g.start);
  check(d[g.exit] < Infinity, `${sc}/${cond}: выход недостижим`);
  g.spawnPoints.forEach((p) => check(d[p] < Infinity, 'люк недостижим'));
  g.crates.forEach((c) => check(d[c.pos] < Infinity, 'ящик недостижим'));
  try { ZG.Bot.playGame(g); } catch (e) { fails++; console.error('EXCEPTION', sc, cond, e.stack); return; }
  check(!!g.result, `${sc}/${cond}: партия не завершилась`);
  // каждая карта героя ровно в одном месте
  g.heroes.forEach((h) => {
    const all = h.deck.concat(h.hand, h.discard, h.equip);
    check(new Set(all).size === all.length, 'дубликат карты у ' + h.id);
  });
  n++;
}));
// правило дизайна тайлов: середины сторон проходимы, тайл связен внутри
ZG.Tiles.all().forEach((t) => {
  [[1, 0], [0, 1], [2, 1], [1, 2]].forEach(([x, y]) => check(t.map[y][x] !== '#', `тайл ${t.id}: середина стороны [${x},${y}] непроходима`));
  const b = ZG.Board.fromPlaced([{ id: t.id, rot: 0, tx: 0, ty: 0 }], 1, 1);
  const open = b.cells.filter((c) => c.type !== 'blocked');
  const d = ZG.Board.bfs(b, open[0].i);
  check(open.every((c) => d[c.i] < Infinity), `тайл ${t.id}: не все зоны связаны внутри`);
});
// любая раскладка связна
for (let k = 0; k < 500; k++) {
  const r = { rng: k * 7919 + 1 };
  const ids = ZG.Rng.shuffle(r, lvl.tiles.slice());
  const { tw, th } = lvl.layout;
  const placed = []; for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) placed.push({ id: ids[(ty * tw + tx) % ids.length], rot: ZG.Rng.int(r, 4), tx, ty });
  const b = ZG.Board.fromPlaced(placed, tw, th);
  const open = b.cells.filter((c) => c.type !== 'blocked');
  const d = ZG.Board.bfs(b, open[0].i);
  if (open.some((c) => d[c.i] === Infinity)) { check(false, 'несвязная раскладка #' + k); break; }
}
// воспроизводимость по сиду
const a = E.create({ seed: 'repro', quiet: true, heroes: [{ id: 'lisa' }, { id: 'kira' }] });
const b = E.create({ seed: 'repro', quiet: true, heroes: [{ id: 'lisa' }, { id: 'kira' }] });
ZG.Bot.playGame(a); ZG.Bot.playGame(b);
check(a.round === b.round && a.stats.kills === b.stats.kills && a.result.win === b.result.win, 'партия не воспроизводится по сиду');
console.log(`${n} партий сыграно, ошибок: ${fails}`);
process.exit(fails ? 1 : 0);
