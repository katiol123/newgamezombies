/*
 * TileRender — рисует поле «как напечатанный картон»: асфальт, полы, стены,
 * двери, разметку зон, декор, швы между тайлами и подписи.
 * Используется и игрой, и страницей печати (print.html).
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const Art = ZG.Art;
  const hash = Art.hash;
  const TAU = Math.PI * 2;
  const INK = '#15110e';

  const FLOORS = {
    tiles: { base: '#b9b1a0', alt: '#a8a08e', pattern: 'check' },
    wood: { base: '#8a6440', alt: '#7a5636', pattern: 'planks' },
    concrete: { base: '#7d7a74', alt: '#706d67', pattern: 'slab' },
    clinic: { base: '#cfd8d6', alt: '#bcc8c6', pattern: 'check' },
  };
  const GROUNDS = { asphalt: ['#3d3c3a', '#353432'], grass: ['#3f5a2c', '#36502a'], dirt: ['#6b5338', '#5e4930'] };

  function cellRect(pad, C, c) { return { x: pad + c.x * C, y: pad + c.y * C }; }

  function noise(ctx, x, y, w, h, seed, color, n, size) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const px = x + hash(seed + i * 3.1) * w, py = y + hash(seed + i * 7.7) * h;
      const s = size * (0.4 + hash(seed + i) * 0.9);
      ctx.fillRect(px, py, s, s);
    }
  }

  function drawGround(ctx, c, r, C) {
    if (c.type === 'building') {
      const f = FLOORS[c.floor] || FLOORS.concrete;
      ctx.fillStyle = f.base; ctx.fillRect(r.x, r.y, C, C);
      if (f.pattern === 'check') {
        const n = 6, s = C / n;
        ctx.fillStyle = f.alt;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) ctx.fillRect(r.x + i * s, r.y + j * s, s, s);
      } else if (f.pattern === 'planks') {
        ctx.strokeStyle = 'rgba(40,24,10,.45)'; ctx.lineWidth = 1;
        const n = 7, s = C / n;
        for (let j = 0; j <= n; j++) { ctx.beginPath(); ctx.moveTo(r.x, r.y + j * s); ctx.lineTo(r.x + C, r.y + j * s); ctx.stroke(); }
        for (let j = 0; j < n; j++) { const o = hash(c.i * 13 + j) * C; ctx.beginPath(); ctx.moveTo(r.x + o, r.y + j * s); ctx.lineTo(r.x + o, r.y + (j + 1) * s); ctx.stroke(); }
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, C / 2, C / 2); ctx.strokeRect(r.x + C / 2, r.y + C / 2, C / 2, C / 2);
      }
      noise(ctx, r.x, r.y, C, C, c.i * 31, 'rgba(0,0,0,.08)', 40, 2);
      // мягкая тень у стен
      const gr = ctx.createRadialGradient(r.x + C / 2, r.y + C / 2, C * 0.2, r.x + C / 2, r.y + C / 2, C * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.28)');
      ctx.fillStyle = gr; ctx.fillRect(r.x, r.y, C, C);
      return;
    }
    const gcol = GROUNDS[c.ground] || GROUNDS.asphalt;
    ctx.fillStyle = gcol[0]; ctx.fillRect(r.x, r.y, C, C);
    noise(ctx, r.x, r.y, C, C, c.i * 17, gcol[1], 70, 3);
    noise(ctx, r.x, r.y, C, C, c.i * 23, 'rgba(255,255,255,.05)', 50, 2);
    if (c.ground === 'grass') {
      ctx.strokeStyle = 'rgba(120,160,70,.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 40; i++) { const px = r.x + hash(c.i + i) * C, py = r.y + hash(c.i * 2 + i) * C; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 1, py - 4); ctx.stroke(); }
    } else if (c.ground !== 'dirt') {
      // трещины
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        if (hash(c.i * 5 + k) < 0.5) continue;
        let px = r.x + hash(c.i + k * 9) * C, py = r.y + hash(c.i + k * 11) * C;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let s = 0; s < 4; s++) { px += (hash(c.i + s + k) - 0.5) * C * 0.3; py += (hash(c.i * 3 + s + k) - 0.3) * C * 0.25; ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
  }

  // ------------------------------------------------------------ декор
  const DECOR = {
    bus(ctx, C) {
      Art.rr(ctx, -C * 0.24, -C * 0.46, C * 0.48, C * 0.92, 6); ctx.fillStyle = '#c99a1a'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = '#2a3036'; for (let i = 0; i < 5; i++) ctx.fillRect(-C * 0.19, -C * 0.38 + i * C * 0.15, C * 0.38, C * 0.09);
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(-C * 0.24, C * 0.1, C * 0.48, C * 0.06);
      ctx.fillStyle = '#6b2a10'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-C * 0.15 + hash(i) * C * 0.3, -C * 0.3 + hash(i + 5) * C * 0.6, C * 0.03, 0, TAU); ctx.fill(); }
    },
    car(ctx, C, color) {
      Art.rr(ctx, -C * 0.17, -C * 0.33, C * 0.34, C * 0.66, 8); ctx.fillStyle = color || '#7a3a32'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = '#1f2a33'; Art.rr(ctx, -C * 0.13, -C * 0.2, C * 0.26, C * 0.12, 3); ctx.fill(); Art.rr(ctx, -C * 0.13, C * 0.14, C * 0.26, C * 0.08, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-C * 0.12, -C * 0.06, C * 0.24, C * 0.18);
      ctx.strokeStyle = 'rgba(200,220,230,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-C * 0.1, -C * 0.18); ctx.lineTo(-C * 0.02, -C * 0.1); ctx.lineTo(-C * 0.06, -C * 0.02); ctx.stroke();
    },
    police_car(ctx, C) { DECOR.car(ctx, C, '#e8e8e8'); ctx.fillStyle = '#2d6fb5'; ctx.fillRect(-C * 0.17, -C * 0.02, C * 0.34, C * 0.05); ctx.fillStyle = '#c0392b'; ctx.fillRect(-C * 0.06, -C * 0.03, C * 0.05, C * 0.04); ctx.fillStyle = '#2d6fb5'; ctx.fillRect(C * 0.01, -C * 0.03, C * 0.05, C * 0.04); },
    pump(ctx, C) {
      ctx.fillStyle = '#5a5a5a'; Art.rr(ctx, -C * 0.4, -C * 0.12, C * 0.8, C * 0.24, 4); ctx.fill();
      for (let i = -1; i <= 1; i += 2) { Art.rr(ctx, i * C * 0.2 - C * 0.1, -C * 0.16, C * 0.2, C * 0.32, 3); ctx.fillStyle = '#b8321e'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#e8dcc0'; ctx.fillRect(i * C * 0.2 - C * 0.06, -C * 0.1, C * 0.12, C * 0.07); }
    },
    canopy(ctx, C) { ctx.fillStyle = 'rgba(200,40,30,.18)'; ctx.fillRect(-C * 0.5, -C * 0.5, C, C); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * C * 0.2, -C * 0.5); ctx.lineTo(i * C * 0.2, C * 0.5); ctx.stroke(); } },
    trees(ctx, C) {
      [[-0.2, -0.18, 0.24], [0.18, -0.05, 0.2], [-0.05, 0.22, 0.22]].forEach(([x, y, r], i) => {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x * C + 4, y * C + 5, r * C, 0, TAU); ctx.fill();
        const gr = ctx.createRadialGradient(x * C - r * C * 0.3, y * C - r * C * 0.3, 2, x * C, y * C, r * C);
        gr.addColorStop(0, '#5f8a3a'); gr.addColorStop(1, '#253a18');
        ctx.fillStyle = gr; ctx.beginPath();
        for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, rr = r * C * (0.85 + hash(i * 10 + k) * 0.25); ctx.lineTo(x * C + Math.cos(a) * rr, y * C + Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#18240f'; ctx.stroke();
      });
    },
    bench(ctx, C) { ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-C * 0.28, C * 0.18, C * 0.56, C * 0.08); ctx.fillRect(-C * 0.28, C * 0.29, C * 0.56, C * 0.05); },
    fountain(ctx, C) { ctx.fillStyle = '#7d7a74'; ctx.beginPath(); ctx.arc(0, 0, C * 0.22, 0, TAU); ctx.fill(); ctx.fillStyle = '#2f4a5a'; ctx.beginPath(); ctx.arc(0, 0, C * 0.17, 0, TAU); ctx.fill(); ctx.fillStyle = '#7d7a74'; ctx.beginPath(); ctx.arc(0, 0, C * 0.05, 0, TAU); ctx.fill(); },
    trash(ctx, C) { ctx.fillStyle = '#2f3a2f'; ctx.beginPath(); ctx.arc(C * 0.3, C * 0.3, C * 0.08, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(200,190,170,.5)'; for (let i = 0; i < 6; i++) ctx.fillRect(C * (0.15 + hash(i) * 0.3), C * (0.15 + hash(i + 3) * 0.3), 4, 3); },
    dumpster(ctx, C) { Art.rr(ctx, -C * 0.32, -C * 0.2, C * 0.64, C * 0.4, 3); ctx.fillStyle = '#2e5a3a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.moveTo(0, -C * 0.2); ctx.lineTo(0, C * 0.2); ctx.stroke(); },
    cart(ctx, C) { ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.strokeRect(C * 0.1, C * 0.1, C * 0.22, C * 0.16); },
    cones(ctx, C) { [[-0.25, -0.2], [0.2, 0.15], [-0.1, 0.28]].forEach(([x, y]) => { ctx.fillStyle = '#e8701a'; ctx.beginPath(); ctx.moveTo(x * C, y * C - C * 0.07); ctx.lineTo(x * C + C * 0.05, y * C + C * 0.05); ctx.lineTo(x * C - C * 0.05, y * C + C * 0.05); ctx.fill(); }); },
    pipes(ctx, C) { for (let i = 0; i < 4; i++) { Art.rr(ctx, -C * 0.4, -C * 0.3 + i * C * 0.15, C * 0.8, C * 0.13, C * 0.06); ctx.fillStyle = i % 2 ? '#5a6a7a' : '#6a7a8a'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(C * 0.36, -C * 0.235 + i * C * 0.15, C * 0.04, 0, TAU); ctx.fill(); } },
    crane(ctx, C) {
      ctx.fillStyle = '#d4a017'; ctx.fillRect(-C * 0.2, -C * 0.2, C * 0.4, C * 0.4);
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-C * 0.2, -C * 0.2, C * 0.4, C * 0.4);
      ctx.beginPath(); ctx.moveTo(-C * 0.2, -C * 0.2); ctx.lineTo(C * 0.2, C * 0.2); ctx.moveTo(C * 0.2, -C * 0.2); ctx.lineTo(-C * 0.2, C * 0.2); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-C * 0.05, -C * 0.5, C * 0.1, C * 0.3);
    },
    shelf(ctx, C) { for (let i = 0; i < 2; i++) { ctx.fillStyle = '#5a4a3a'; ctx.fillRect(-C * 0.36, -C * 0.3 + i * C * 0.4, C * 0.72, C * 0.14); for (let k = 0; k < 7; k++) { ctx.fillStyle = ['#c0392b', '#2d6fb5', '#e0a83a', '#2e8b57'][(k + i) % 4]; ctx.fillRect(-C * 0.34 + k * C * 0.1, -C * 0.28 + i * C * 0.4, C * 0.07, C * 0.1); } } },
    counter(ctx, C) { ctx.fillStyle = '#4a3a2e'; ctx.fillRect(-C * 0.38, C * 0.18, C * 0.76, C * 0.14); ctx.fillStyle = '#888'; ctx.fillRect(C * 0.15, C * 0.2, C * 0.12, C * 0.08); },
    bed(ctx, C) { Art.rr(ctx, -C * 0.3, -C * 0.38, C * 0.34, C * 0.56, 4); ctx.fillStyle = '#6a7a9a'; ctx.fill(); ctx.fillStyle = '#e8e2d4'; ctx.fillRect(-C * 0.27, -C * 0.35, C * 0.28, C * 0.12); ctx.fillStyle = 'rgba(120,10,6,.5)'; ctx.beginPath(); ctx.arc(-C * 0.1, 0, C * 0.06, 0, TAU); ctx.fill(); },
    sofa(ctx, C) { Art.rr(ctx, -C * 0.32, -C * 0.36, C * 0.64, C * 0.22, 5); ctx.fillStyle = '#7a3a2a'; ctx.fill(); },
    table(ctx, C) { ctx.fillStyle = '#5a3e26'; ctx.beginPath(); ctx.arc(0, 0, C * 0.16, 0, TAU); ctx.fill(); ctx.fillStyle = '#4a3020'; for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; ctx.fillRect(Math.cos(a) * C * 0.24 - 4, Math.sin(a) * C * 0.24 - 4, 8, 8); } },
    desk(ctx, C) { ctx.fillStyle = '#4a4440'; ctx.fillRect(-C * 0.3, -C * 0.12, C * 0.6, C * 0.24); ctx.fillStyle = '#e8e2d4'; ctx.fillRect(-C * 0.2, -C * 0.08, C * 0.12, C * 0.09); ctx.fillRect(C * 0.02, -C * 0.06, C * 0.14, C * 0.1); },
    locker(ctx, C) { for (let i = 0; i < 4; i++) { ctx.fillStyle = '#3d5a6a'; ctx.fillRect(-C * 0.38 + i * C * 0.19, -C * 0.4, C * 0.17, C * 0.18); ctx.fillStyle = '#ddd'; ctx.fillRect(-C * 0.3 + i * C * 0.19, -C * 0.32, 2, 4); } },
    workbench(ctx, C) { ctx.fillStyle = '#6b5233'; ctx.fillRect(-C * 0.38, -C * 0.4, C * 0.76, C * 0.16); ctx.fillStyle = '#999'; ctx.fillRect(-C * 0.3, -C * 0.37, C * 0.12, C * 0.04); ctx.fillRect(C * 0.05, -C * 0.38, C * 0.04, C * 0.1); },
    tires(ctx, C) { [[-0.2, -0.2], [0.1, -0.25], [-0.25, 0.15]].forEach(([x, y]) => { ctx.strokeStyle = '#111'; ctx.lineWidth = C * 0.05; ctx.beginPath(); ctx.arc(x * C, y * C, C * 0.08, 0, TAU); ctx.stroke(); }); },
    cross(ctx, C) { ctx.fillStyle = '#2e8b57'; ctx.fillRect(-C * 0.05, -C * 0.15, C * 0.1, C * 0.3); ctx.fillRect(-C * 0.15, -C * 0.05, C * 0.3, C * 0.1); },
    zebra(ctx, C) { ctx.fillStyle = 'rgba(230,225,210,.55)'; for (let i = 0; i < 5; i++) ctx.fillRect(-C * 0.4 + i * C * 0.17, -C * 0.12, C * 0.09, C * 0.24); },
  };

  function drawDecor(ctx, board, pad, C) {
    board.tiles.forEach((p) => {
      const def = ZG.Tiles.get(p.id);
      (def.decor || []).forEach((d) => {
        const [rx, ry] = ZG.Board.rotPoint(d.x, d.y, p.rot);
        const x = pad + (p.tx * 3 + rx + 0.5) * C, y = pad + (p.ty * 3 + ry + 0.5) * C;
        const fn = DECOR[d.k];
        if (!fn) return;
        ctx.save(); ctx.translate(x, y); ctx.rotate((p.rot * Math.PI) / 2);
        fn(ctx, C);
        ctx.restore();
      });
    });
  }

  function edgeLine(ctx, ax, ay, bx, by) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }

  function drawEdges(ctx, board, pad, C) {
    const b = board;
    const doorSet = new Set(b.doors.map(([a, c]) => Math.min(a, c) + '-' + Math.max(a, c)));
    const wallW = Math.max(3, C * 0.07);
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const c = b.cells[y * b.w + x];
        const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        dirs.forEach(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          const out = nx < 0 || ny < 0 || nx >= b.w || ny >= b.h;
          const n = out ? null : b.cells[ny * b.w + nx];
          if (!out && (dx < 0 || dy < 0)) return; // каждое ребро один раз
          const x0 = pad + (x + (dx > 0 ? 1 : 0)) * C, y0 = pad + (y + (dy > 0 ? 1 : 0)) * C;
          const ex = dx !== 0 ? x0 : x0 + C, ey = dy !== 0 ? y0 : y0 + C;
          const sx = dx !== 0 ? x0 : pad + x * C, sy = dy !== 0 ? y0 : pad + y * C;
          if (out) {
            if (c.type === 'building') { ctx.strokeStyle = INK; ctx.lineWidth = wallW; edgeLine(ctx, sx, sy, ex, ey); }
            return;
          }
          const isB = c.type === 'building' || n.type === 'building';
          const key = Math.min(c.i, n.i) + '-' + Math.max(c.i, n.i);
          if (c.bld && c.bld === n.bld) {
            ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); edgeLine(ctx, sx, sy, ex, ey); ctx.setLineDash([]);
            return;
          }
          if (isB) {
            const door = doorSet.has(key);
            ctx.lineCap = 'square';
            if (door) {
              const L = C * 0.3;
              const mx = (sx + ex) / 2, my = (sy + ey) / 2;
              const ux = dx !== 0 ? 0 : 1, uy = dy !== 0 ? 0 : 1;
              ctx.strokeStyle = INK; ctx.lineWidth = wallW;
              edgeLine(ctx, sx, sy, mx - ux * L, my - uy * L);
              edgeLine(ctx, mx + ux * L, my + uy * L, ex, ey);
              // дверная створка
              ctx.strokeStyle = '#a07a42'; ctx.lineWidth = Math.max(2, wallW * 0.5);
              const hx = mx - ux * L, hy = my - uy * L;
              const ang = dx !== 0 ? (dx > 0 ? -0.6 : 0.6) : (dy > 0 ? 0.6 : -0.6);
              ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
              edgeLine(ctx, 0, 0, ux * L * 1.7, uy * L * 1.7);
              ctx.restore();
              ctx.strokeStyle = 'rgba(232,220,192,.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
              ctx.beginPath(); ctx.arc(hx, hy, L * 1.7, dx !== 0 ? Math.PI / 2 - 0.1 : -0.1, dx !== 0 ? Math.PI / 2 + 0.7 : 0.7); ctx.stroke();
              ctx.setLineDash([]);
            } else {
              ctx.strokeStyle = INK; ctx.lineWidth = wallW; edgeLine(ctx, sx, sy, ex, ey);
              ctx.strokeStyle = 'rgba(232,220,192,.25)'; ctx.lineWidth = 1.2;
              const off = wallW * 0.35;
              edgeLine(ctx, sx + (dy ? 0 : -off), sy + (dx ? 0 : -off), ex + (dy ? 0 : -off), ey + (dx ? 0 : -off));
            }
            return;
          }
          if (c.type === 'street' && n.type === 'street') {
            ctx.strokeStyle = 'rgba(232,220,192,.32)'; ctx.lineWidth = Math.max(1.5, C * 0.018);
            ctx.setLineDash([C * 0.09, C * 0.07]); edgeLine(ctx, sx, sy, ex, ey); ctx.setLineDash([]);
          }
        });
      }
    }
  }

  function drawBlocked(ctx, c, r, C) {
    // непроходимая зона — штриховка опасности по краю
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, C, C); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = C * 0.05;
    for (let i = -C; i < C * 2; i += C * 0.16) edgeLine(ctx, r.x + i, r.y, r.x + i - C, r.y + C);
    ctx.restore();
    ctx.strokeStyle = 'rgba(192,57,43,.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(r.x + 3, r.y + 3, C - 6, C - 6); ctx.setLineDash([]);
  }

  function drawBoard(ctx, g, pad, C, opts) {
    opts = opts || {};
    const b = g.board || g;
    const W = b.w * C + pad * 2, H = b.h * C + pad * 2;
    // рамка картона
    if (!opts.noFrame) {
      ctx.fillStyle = '#1a1410'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a2018'; Art.rr(ctx, 2, 2, W - 4, H - 4, 8); ctx.fill();
    }
    b.cells.forEach((c) => drawGround(ctx, c, cellRect(pad, C, c), C));
    b.cells.forEach((c) => { if (c.type === 'blocked') drawBlocked(ctx, c, cellRect(pad, C, c), C); });
    drawDecor(ctx, b, pad, C);
    drawEdges(ctx, b, pad, C);
    // швы тайлов и подписи
    b.tiles.forEach((p) => {
      const def = ZG.Tiles.get(p.id);
      const x = pad + p.tx * 3 * C, y = pad + p.ty * 3 * C;
      ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, 3 * C - 2, 3 * C - 2);
      ctx.strokeStyle = 'rgba(255,240,210,.08)'; ctx.lineWidth = 1; ctx.strokeRect(x + 3, y + 3, 3 * C - 6, 3 * C - 6);
      if (opts.labels !== false) {
        ctx.save();
        ctx.font = `bold ${Math.max(8, Math.round(C * 0.085))}px 'Russo One', sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        const text = `${def.num} · ${def.name.toUpperCase()}`;
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(10,8,6,.55)'; ctx.fillRect(x + 4, y + 3 * C - C * 0.14 - 4, tw + 8, C * 0.14);
        ctx.fillStyle = 'rgba(232,220,192,.75)'; ctx.fillText(text, x + 8, y + 3 * C - 5);
        ctx.restore();
      }
    });
    // общая виньетка печати
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  ZG.TileRender = { drawBoard, DECOR };
})(typeof globalThis !== 'undefined' ? globalThis : window);
