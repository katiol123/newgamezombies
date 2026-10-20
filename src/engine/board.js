/*
 * Поле: процедурная сборка из тайлов, граф проходимости, пути и линия видимости.
 * Поле неизменно после генерации и разделяется между клонами состояния.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const Rng = ZG.Rng;
  const T = 3; // размер тайла в зонах

  function rotPoint(x, y, r) {
    for (let i = 0; i < r; i++) { const nx = T - 1 - y; y = x; x = nx; }
    return [x, y];
  }

  function build(level, g) {
    const { tw, th } = level.layout;
    const pool = Rng.shuffle(g, level.tiles.slice());
    const placed = [];
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        placed.push({ id: pool[(ty * tw + tx) % pool.length], rot: Rng.int(g, 4), tx, ty });
      }
    }
    return fromPlaced(placed, tw, th);
  }

  // собрать поле из уже разложенных тайлов (используется и для печати отдельных тайлов)
  function fromPlaced(placed, tw, th) {
    const W = tw * T, H = th * T;
    const cells = [];
    for (let i = 0; i < W * H; i++) cells.push(null);
    const doors = [];
    placed.forEach((p, ti) => {
      const def = ZG.Tiles.get(p.id);
      for (let ly = 0; ly < T; ly++) {
        for (let lx = 0; lx < T; lx++) {
          const ch = def.map[ly][lx];
          const [rx, ry] = rotPoint(lx, ly, p.rot);
          const x = p.tx * T + rx, y = p.ty * T + ry;
          const isB = ch !== '.' && ch !== '#';
          cells[y * W + x] = {
            i: y * W + x, x, y, tile: ti,
            type: ch === '.' ? 'street' : ch === '#' ? 'blocked' : 'building',
            bld: isB ? ti + ':' + ch : null,
            floor: isB ? def.buildings[ch].floor : null,
            ground: def.ground || 'asphalt',
            search: null,
          };
        }
      }
      def.doors.forEach(([x1, y1, x2, y2]) => {
        const [a1, b1] = rotPoint(x1, y1, p.rot), [a2, b2] = rotPoint(x2, y2, p.rot);
        doors.push([(p.ty * T + b1) * W + p.tx * T + a1, (p.ty * T + b2) * W + p.tx * T + a2]);
      });
      if (def.manhole) {
        const [mx, my] = rotPoint(def.manhole[0], def.manhole[1], p.rot);
        cells[(p.ty * T + my) * W + p.tx * T + mx].manhole = true;
      }
      def.search.forEach(([sx, sy, kind]) => {
        const [rx, ry] = rotPoint(sx, sy, p.rot);
        cells[(p.ty * T + ry) * W + p.tx * T + rx].tileSearch = kind || 'normal';
      });
    });
    const doorSet = new Set(doors.map(([a, b]) => Math.min(a, b) + '-' + Math.max(a, b)));
    const adj = cells.map(() => []);
    const walls = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = cells[y * W + x];
        [[1, 0], [0, 1]].forEach(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          if (nx >= W || ny >= H) return;
          const b = cells[ny * W + nx];
          if (a.type === 'blocked' || b.type === 'blocked') return;
          let open;
          if (a.type === 'street' && b.type === 'street') open = true;
          else if (a.bld && a.bld === b.bld) open = true;
          else open = doorSet.has(Math.min(a.i, b.i) + '-' + Math.max(a.i, b.i));
          if (open) { adj[a.i].push(b.i); adj[b.i].push(a.i); }
          else walls.push([a.i, b.i]);
        });
      }
    }
    return { w: W, h: H, cells, adj, walls, doors, tiles: placed };
  }

  function connected(board) {
    const open = board.cells.filter((c) => c.type !== 'blocked');
    if (!open.length) return false;
    const seen = new Set([open[0].i]);
    const q = [open[0].i];
    while (q.length) {
      const c = q.shift();
      board.adj[c].forEach((n) => { if (!seen.has(n)) { seen.add(n); q.push(n); } });
    }
    return seen.size === open.length;
  }

  function generate(level, g) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const b = build(level, g);
      if (connected(b)) return b;
    }
    throw new Error('board generation failed');
  }

  // BFS. passable(a, b) -> стоимость шага (1) или false.
  function bfs(board, from, passable) {
    const dist = new Array(board.cells.length).fill(Infinity);
    const sources = Array.isArray(from) ? from : [from];
    const q = [];
    sources.forEach((s) => { dist[s] = 0; q.push(s); });
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      for (const n of board.adj[c]) {
        if (dist[n] !== Infinity) continue;
        if (passable && !passable(c, n)) continue;
        dist[n] = dist[c] + 1;
        q.push(n);
      }
    }
    return dist;
  }

  function isAdj(board, a, b) { return board.adj[a].includes(b); }

  // Линия видимости — по прямой (строка/столбец) через открытые проходы.
  function lineCells(board, from, maxRange) {
    const out = [{ cell: from, dist: 0 }];
    const c0 = board.cells[from];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      let prev = from, x = c0.x, y = c0.y;
      for (let d = 1; d <= maxRange; d++) {
        x += dx; y += dy;
        if (x < 0 || y < 0 || x >= board.w || y >= board.h) break;
        const ni = y * board.w + x;
        if (!isAdj(board, prev, ni)) break;
        out.push({ cell: ni, dist: d });
        prev = ni;
      }
    });
    return out;
  }

  ZG.Board = { generate, fromPlaced, bfs, lineCells, isAdj, rotPoint, TILE: T };
})(typeof globalThis !== 'undefined' ? globalThis : window);
