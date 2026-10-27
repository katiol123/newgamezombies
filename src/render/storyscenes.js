/*
 * Стилизованные анимированные иллюстрации сюжетных вставок.
 * Каждая сцена — символическая композиция (силуэты, свет, туман, предмет-символ), без детальных сцен.
 * Сцена рисуется в логическом пространстве 1600×900: SCENES[id](ctx, t), t — секунды.
 * Если в art/story/<id>.jpg появится картинка, окно вставки покажет её поверх сцены.
 */
(function (G) {
  'use strict';
  const W = 1600, H = 900, TAU = Math.PI * 2;
  const INK = '#0d0a08', PAPER = '#e8dcc0', BLOOD = '#c0392b', GOLD = '#e0a83a', SICK = '#8fc35a';

  // ---------- кэш текстур (растр, зерно) ----------
  const cache = {};
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function dots(color) {
    const k = 'dots' + color;
    if (cache[k]) return cache[k];
    const c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = color;
    for (let y = 0; y < H; y += 11) for (let i = (y / 11) % 2 ? 5.5 : 0; i < W; i += 11) { x.beginPath(); x.arc(i, y, 2.2, 0, TAU); x.fill(); }
    return (cache[k] = c);
  }
  function noise() {
    if (cache.noise) return cache.noise;
    const c = canvas(512, 512), x = c.getContext('2d'), img = x.createImageData(512, 512), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 22; }
    x.putImageData(img, 0, 0);
    return (cache.noise = c);
  }
  // ---------- общие приёмы ----------
  function sky(c, stops) { const g = c.createLinearGradient(0, 0, 0, H); stops.forEach(([p, col]) => g.addColorStop(p, col)); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  function tex(c, color, a) { c.save(); c.globalAlpha = a; c.drawImage(dots(color || INK), 0, 0); c.restore(); }
  function grain(c, t) { const n = noise(), ox = Math.floor((t * 97) % 512), oy = Math.floor((t * 61) % 512); c.save(); c.globalAlpha = 0.9; for (let y = -oy; y < H; y += 512) for (let x = -ox; x < W; x += 512) c.drawImage(n, x, y); c.restore(); }
  function vignette(c, a) { const g = c.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H / 2, W * 0.72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  function glow(c, x, y, r, color, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color.replace('A', a)); g.addColorStop(1, color.replace('A', 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  // дым/туман: детерминированные «клубы» по фазе
  function smoke(c, x, y, t, o) {
    o = Object.assign({ n: 24, h: 420, spread: 80, r: 90, color: 'rgba(120,170,80,A)', a: 0.08, speed: 0.08, sway: 40 }, o);
    c.save(); c.globalCompositeOperation = o.blend || 'source-over';
    for (let i = 0; i < o.n; i++) {
      const p = (t * o.speed + i / o.n) % 1, s = Math.sin(i * 12.9898) * 0.5;
      const px = x + s * o.spread + Math.sin(t * 0.7 + p * 5 + i) * o.sway * p, py = y - p * o.h, rad = o.r * (0.4 + p);
      glow(c, px, py, rad, o.color, o.a * Math.sin(p * Math.PI));
    }
    c.restore();
  }
  // мертвец-силуэт (стилизованный: длинный, сгорбленный, руки вперёд)
  function walker(c, x, y, s, t, o) {
    o = o || {};
    const sw = Math.sin(t * 1.3 + (o.ph || 0));
    c.save(); c.translate(x, y); c.scale(s * (o.flip ? -1 : 1), s); c.rotate(sw * 0.05);
    c.fillStyle = o.fill || INK;
    c.beginPath(); c.moveTo(-14, 0); c.lineTo(-10, -46); c.quadraticCurveTo(-20, -80, -6, -102); c.lineTo(10, -98); c.quadraticCurveTo(22, -72, 14, -44); c.lineTo(17, 0); c.lineTo(5, 0); c.lineTo(2, -36); c.lineTo(-2, -36); c.lineTo(-4, 0); c.closePath(); c.fill();
    c.lineWidth = 7; c.lineCap = 'round'; c.strokeStyle = c.fillStyle;
    c.beginPath(); c.moveTo(6, -86); c.lineTo(36 + sw * 3, -80); c.lineTo(44 + sw * 3, -66); c.stroke();
    c.beginPath(); c.moveTo(-2, -80); c.lineTo(28 + sw * 2, -70); c.lineTo(34 + sw * 2, -56); c.stroke();
    c.beginPath(); c.ellipse(5, -113, 10, 12.5, 0.2 + sw * 0.08, 0, TAU); c.fill();
    if (o.eyes) { c.fillStyle = o.eyes; c.beginPath(); c.arc(9, -114, 1.8, 0, TAU); c.arc(2, -114, 1.8, 0, TAU); c.fill(); }
    c.restore();
  }
  // мазковый текст (надписи краской/углём)
  function scrawl(c, text, x, y, size, color, rot, t) {
    c.save(); c.translate(x, y); c.rotate(rot || 0); c.font = `900 ${size}px Impact, 'Arial Black', sans-serif`; c.textAlign = 'center';
    c.fillStyle = color; c.fillText(text, 0, 0);
    c.globalAlpha = 0.5; for (let i = 0; i < 6; i++) { const dx = (Math.sin(i * 7.1) * 0.3) * c.measureText(text).width; c.fillRect(dx, size * 0.1, 3, size * (0.4 + (i % 3) * 0.3) * (t != null ? Math.min(1, t) : 1)); } // потёки
    c.restore();
  }
  function frame(c) { c.lineWidth = 18; c.strokeStyle = INK; c.strokeRect(0, 0, W, H); }
  function flame(c, x, y, w, h, t, seed) {
    const n = 13;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, k = Math.sin(i * 12.3 + seed) * 0.5 + 0.5;
      const fx = x - w / 2 + u * w + Math.sin(t * 4 + i * 2.1 + seed) * 14, base = Math.sin(u * Math.PI);
      const fh = h * 1.7 * (0.3 + 0.7 * base) * (0.35 + 0.65 * k) * (0.7 + 0.3 * Math.abs(Math.sin(t * (2.6 + k) + i)));
      const fw = (w / n) * (1.4 + k) * (pass ? 0.45 : 1), lean = Math.sin(t * 2 + i) * fw * 0.6;
      c.beginPath(); c.moveTo(fx - fw, y); c.bezierCurveTo(fx - fw * 0.9, y - fh * 0.5, fx + lean - fw * 0.2, y - fh * 0.8, fx + lean, y - fh);
      c.bezierCurveTo(fx + lean + fw * 0.2, y - fh * 0.7, fx + fw * 0.9, y - fh * 0.4, fx + fw, y); c.closePath();
      c.fillStyle = pass ? '#fff1a8' : (i % 3 ? '#ff7a20' : '#ffb030'); c.globalAlpha = pass ? 0.9 : 0.85; c.fill();
    }
    c.globalAlpha = 1;
  }
  function pines(c, y, color, seed, n, hmin, hmax) {
    c.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = ((Math.sin(i * 91.3 + seed) * 0.5 + 0.5) * (W + 200)) - 100, h = hmin + (Math.sin(i * 17.7 + seed) * 0.5 + 0.5) * (hmax - hmin), w = h * 0.22;
      c.beginPath(); c.moveTo(x, y - h); for (let k = 1; k <= 5; k++) { c.lineTo(x + w * k / 5, y - h + h * k / 5 - h * 0.04); c.lineTo(x + w * k / 9, y - h + h * k / 5); } c.lineTo(x + 3, y); c.lineTo(x - 3, y);
      for (let k = 5; k >= 1; k--) { c.lineTo(x - w * k / 9, y - h + h * k / 5); c.lineTo(x - w * k / 5, y - h + h * k / 5 - h * 0.04); } c.closePath(); c.fill();
    }
  }
  function eyesPair(c, x, y, s, open, color) { if (open <= 0) return; c.fillStyle = color || BLOOD; c.save(); c.translate(x, y); c.scale(s, s * open); c.beginPath(); c.ellipse(-9, 0, 5, 3, 0, 0, TAU); c.ellipse(9, 0, 5, 3, 0, 0, TAU); c.fill(); c.restore(); glow(c, x, y, 40 * s, 'rgba(192,57,43,A)', 0.25 * open); }

  // ============================== СЦЕНЫ ==============================
  const S = {};

  // --- Миссия 1 ---
  S.m1_start = (c, t) => { // дверь убежища закрывается: щель света, за ней качели качаются сами
    sky(c, [[0, '#14110f'], [1, '#050404']]);
    const gap = 70 + Math.sin(t * 0.35) * 40; // щель дышит
    c.save(); c.beginPath(); c.rect(W / 2 - gap / 2, 80, gap, 740); c.clip();
    sky(c, [[0, '#6d6a62'], [0.7, '#a89a80'], [1, '#3a3530']]);
    const a = Math.sin(t * 1.2) * 0.45; c.save(); c.translate(W / 2 + 10, 420); c.rotate(a); c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(-14, 0); c.lineTo(-14, 220); c.moveTo(14, 0); c.lineTo(14, 220); c.stroke(); c.fillStyle = INK; c.fillRect(-26, 218, 52, 10); c.restore(); // качели
    c.fillStyle = INK; c.fillRect(W / 2 - 200, 410, 400, 8);
    smoke(c, W / 2, 820, t, { n: 10, h: 300, spread: 30, r: 60, color: 'rgba(200,190,170,A)', a: 0.12, speed: 0.05 });
    c.restore();
    c.fillStyle = INK; c.fillRect(W / 2 - gap / 2 - 30, 80, 30, 740); c.fillRect(W / 2 + gap / 2, 80, 30, 740); // торцы створок
    glow(c, W / 2, 450, 380, 'rgba(255,230,180,A)', 0.12);
    c.font = "italic 46px Georgia, serif"; c.textAlign = 'center'; c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText('…нас уже учуяли', W / 2, 872); c.fillStyle = '#e0503a'; c.fillText('…нас уже учуяли', W / 2, 872); // подпись крупнее и с обводкой — читается и в маленьком окне
    tex(c, '#000', 0.25); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m1_first_kill = (c, t) => { // лужа: отражение окна, тапок, ключ на шнурке; круги по воде
    sky(c, [[0, '#1d1b1a'], [1, '#0b0a09']]);
    c.save(); c.translate(W / 2, 520); c.scale(1, 0.32);
    const g = c.createRadialGradient(0, 0, 50, 0, 0, 640); g.addColorStop(0, '#3a4652'); g.addColorStop(1, '#141820'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 640, 0, TAU); c.fill();
    c.fillStyle = 'rgba(240,200,110,.55)'; c.fillRect(-140, -260, 90, 120); c.fillRect(-30, -260, 90, 120); // отражённое окно
    for (let k = 0; k < 4; k++) { const p = (t * 0.25 + k / 4) % 1; c.strokeStyle = `rgba(232,220,192,${0.35 * (1 - p)})`; c.lineWidth = 6; c.beginPath(); c.arc(120, 40, 40 + p * 520, 0, TAU); c.stroke(); }
    c.restore();
    c.fillStyle = INK; c.beginPath(); c.ellipse(1080, 610, 120, 44, -0.2, 0, TAU); c.fill(); c.fillStyle = '#7a5a8a'; c.beginPath(); c.ellipse(1080, 600, 104, 30, -0.2, 0, TAU); c.fill(); // тапок
    c.fillStyle = '#d8a0c0'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(1020 + i * 28, 596 + Math.sin(i) * 6, 7, 0, TAU); c.fill(); } // цветочки
    const sw = Math.sin(t * 1.6) * 0.18; c.save(); c.translate(480, 120); c.rotate(sw); c.strokeStyle = '#c8b08a'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 300); c.stroke();
    c.fillStyle = GOLD; c.beginPath(); c.arc(0, 318, 18, 0, TAU); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(0, 318, 7, 0, TAU); c.fill(); c.fillStyle = GOLD; c.fillRect(-5, 334, 10, 54); c.fillRect(5, 368, 12, 6); c.fillRect(5, 380, 9, 6); c.restore(); // ключ на шнурке
    c.fillStyle = PAPER; c.font = "900 64px Impact, sans-serif"; c.textAlign = 'right'; c.globalAlpha = 0.9; c.fillText('ЭТО БОЛЬШЕ', 1500, 200); c.fillStyle = BLOOD; c.fillText('НЕ ЧЕЛОВЕК', 1500, 270); c.globalAlpha = 1;
    tex(c, '#000', 0.2); vignette(c, 0.65); grain(c, t); frame(c);
  };
  S.m1_night = (c, t) => { // темнота поднимается снизу: ряд силуэтов, зелёный свет из люков
    sky(c, [[0, '#1c2230'], [0.6, '#3a2c2c'], [1, '#0a0809']]);
    c.fillStyle = '#1a1c22'; for (let i = 0; i < 9; i++) { const x = i * 190 - 40, h = 260 + (i % 3) * 70; c.fillRect(x, 600 - h, 170, h); c.fillStyle = 'rgba(240,192,96,.9)'; if (i === 2 && Math.sin(t * 0.8) > -0.7) c.fillRect(x + 60, 600 - h + 60, 18, 22); c.fillStyle = '#1a1c22'; }
    c.fillStyle = '#0c0b0b'; c.fillRect(0, 600, W, 300);
    c.save(); c.globalCompositeOperation = 'lighter';
    [[400, 700], [1200, 740]].forEach(([x, y], k) => { glow(c, x, y, 260, 'rgba(140,200,90,A)', 0.35 + Math.sin(t * 2 + k) * 0.08); smoke(c, x, y, t + k * 3, { n: 18, h: 520, spread: 70, r: 110, a: 0.07 }); });
    c.restore();
    for (let i = 0; i < 14; i++) { const x = 60 + i * 112 + Math.sin(i * 3) * 30, s = 1.4 + (i % 3) * 0.35; walker(c, x, 640 + (i % 3) * 60, s, t, { ph: i, eyes: Math.sin(t + i * 2) > -0.9 ? BLOOD : null, flip: i % 2 }); }
    tex(c, '#000', 0.25); vignette(c, 0.75); grain(c, t); frame(c);
  };

  // --- Миссия 2 ---
  S.m2_start = (c, t) => { // сетка-рабица с отпечатками ладоней, тёмный бокс и два дыхания
    sky(c, [[0, '#2a2622'], [1, '#0e0c0b']]);
    c.fillStyle = '#050404'; c.fillRect(420, 260, 760, 560); // проём бокса
    const br = (Math.sin(t * 1.1) + 1) / 2, br2 = (Math.sin(t * 1.1 + 2.2) + 1) / 2;
    eyesPair(c, 640, 520, 1.3, Math.min(1, br * 1.4), GOLD); eyesPair(c, 960, 500, 1.6, Math.min(1, br2 * 1.4), GOLD);
    smoke(c, 640, 560, t, { n: 6, h: 90, spread: 20, r: 50, color: 'rgba(200,190,170,A)', a: 0.15 * br, speed: 0.3, sway: 10 });
    smoke(c, 960, 540, t + 1, { n: 6, h: 90, spread: 20, r: 60, color: 'rgba(200,190,170,A)', a: 0.15 * br2, speed: 0.3, sway: 10 });
    c.strokeStyle = 'rgba(160,160,150,.5)'; c.lineWidth = 3;
    for (let i = -20; i < 40; i++) { c.beginPath(); c.moveTo(i * 60, 0); c.lineTo(i * 60 + 900, 900); c.stroke(); c.beginPath(); c.moveTo(i * 60, 0); c.lineTo(i * 60 - 900, 900); c.stroke(); }
    [[300, 300, -0.3], [360, 420, 0.2], [1280, 360, 0.4], [1220, 520, -0.1], [330, 620, 0.1]].forEach(([x, y, r]) => { c.save(); c.translate(x, y); c.rotate(r); c.fillStyle = 'rgba(140,30,20,.75)'; c.beginPath(); c.ellipse(0, 0, 34, 42, 0, 0, TAU); c.fill(); for (let f = 0; f < 4; f++) { c.beginPath(); c.ellipse(-24 + f * 16, -56 - (f % 2) * 8, 7, 20, 0, 0, TAU); c.fill(); } c.fillRect(-4, 40, 6, 60 + Math.sin(t + x) * 4); c.restore(); });
    tex(c, '#000', 0.2); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m2_pack = (c, t) => { // мешки у забора открывают глаза один за другим
    sky(c, [[0, '#262a2e'], [1, '#0c0d0e']]);
    c.fillStyle = '#16181a'; c.fillRect(0, 300, W, 30); for (let i = 0; i < 30; i++) c.fillRect(i * 56, 300, 12, 360); // забор
    c.fillStyle = '#0b0c0d'; c.fillRect(0, 660, W, 240);
    for (let i = 0; i < 9; i++) {
      const x = 180 + i * 150, y = 700 + (i % 2) * 40, w = 140 + (i % 3) * 30, h = 110 + (i % 2) * 30;
      c.fillStyle = '#2e3236'; c.beginPath(); c.moveTo(x - w / 2, y); c.quadraticCurveTo(x - w / 2, y - h, x - w * 0.1, y - h * 0.95); c.lineTo(x, y - h - 18); c.lineTo(x + w * 0.1, y - h * 0.95); c.quadraticCurveTo(x + w / 2, y - h, x + w / 2, y); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(170,185,200,.35)'; c.lineWidth = 3; c.stroke(); // лунный контур мешка — силуэты читаются на тёмном фоне
      c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 4; c.beginPath(); c.moveTo(x - w * 0.12, y - h * 0.9); c.lineTo(x + w * 0.12, y - h * 0.9); c.stroke(); // завязка
      const open = Math.max(0, Math.min(1, (t * 0.6 - i * 0.35) % 6)); eyesPair(c, x, y - h * 0.55, 0.9, open);
    }
    c.fillStyle = 'rgba(200,220,240,.06)'; for (let i = 0; i < 120; i++) { const x = (i * 137 + t * 30) % W, y = (i * 71 + t * 60) % H; c.fillRect(x, y, 2, 2); } // иней в воздухе
    tex(c, '#000', 0.25); vignette(c, 0.75); grain(c, t); frame(c);
  };
  S.m2_rouse = (c, t) => { // мигалка сигнализации, лучи, со всех сторон сходятся силуэты
    sky(c, [[0, '#1a0f0c'], [1, '#050303']]);
    const a = t * 2.4; c.save(); c.globalCompositeOperation = 'lighter';
    for (const k of [0, Math.PI]) { c.beginPath(); c.moveTo(W / 2, 470); c.arc(W / 2, 470, 1400, a + k - 0.25, a + k + 0.25); c.closePath(); const g = c.createRadialGradient(W / 2, 470, 10, W / 2, 470, 1200); g.addColorStop(0, 'rgba(255,140,40,.45)'); g.addColorStop(1, 'rgba(255,80,20,0)'); c.fillStyle = g; c.fill(); }
    c.restore();
    c.fillStyle = '#1a1210'; c.beginPath(); c.ellipse(W / 2, 520, 160, 60, 0, 0, TAU); c.fill(); // капот
    c.fillStyle = Math.sin(t * 9) > 0 ? '#ff7a20' : '#5a2a10'; c.beginPath(); c.arc(W / 2, 470, 24, 0, TAU); c.fill();
    for (let i = 0; i < 18; i++) { const ang = i / 18 * TAU, d = 700 - ((t * 40 + i * 37) % 420), x = W / 2 + Math.cos(ang) * d * 1.3, y = 560 + Math.sin(ang) * d * 0.45; walker(c, x, y + 60, 0.9 + (y - 300) / 600, t, { ph: i, flip: Math.cos(ang) > 0, eyes: BLOOD }); }
    tex(c, '#000', 0.25); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m2_keys = (c, t) => { // ключи, брелок-иконка, фото девочки с бантами; капля крови
    sky(c, [[0, '#211c18'], [1, '#0b0908']]);
    c.save(); c.translate(980, 430); c.rotate(-0.08); c.fillStyle = '#e2d6bc'; c.fillRect(-170, -220, 340, 420); c.fillStyle = '#b8ab92'; c.fillRect(-140, -190, 280, 300); // фото
    c.fillStyle = '#5a4a3a'; c.beginPath(); c.arc(0, -50, 70, 0, TAU); c.fill(); c.fillRect(-80, 10, 160, 100); // силуэт девочки
    c.fillStyle = PAPER; [[-1, 1], [1, 1]].forEach(([s]) => { c.save(); c.translate(s * 76, -110); c.beginPath(); c.moveTo(0, 0); c.lineTo(s * 46, -30); c.lineTo(s * 46, 30); c.closePath(); c.moveTo(0, 0); c.lineTo(-s * 6, -26); c.lineTo(-s * 6, 26); c.closePath(); c.fill(); c.restore(); }); // банты
    c.fillStyle = 'rgba(140,25,15,.8)'; c.beginPath(); c.ellipse(90, 130, 90, 40, 0.4, 0, TAU); c.fill(); c.restore();
    c.save(); c.translate(500, 300); c.rotate(Math.sin(t) * 0.06); c.strokeStyle = '#9aa0a6'; c.lineWidth = 8; c.beginPath(); c.arc(0, 0, 50, 0, TAU); c.stroke();
    c.fillStyle = '#9aa0a6'; c.fillRect(-6, 50, 12, 200); c.fillRect(6, 210, 24, 10); c.fillRect(6, 232, 18, 10); c.fillStyle = GOLD; c.fillRect(-60, 30, 40, 54); c.fillStyle = '#7a1a10'; c.fillRect(-50, 40, 20, 30); c.restore(); // ключ и иконка
    const p = (t * 0.4) % 1; c.fillStyle = BLOOD; c.beginPath(); c.ellipse(560, 560 + p * 300, 9, 13, 0, 0, TAU); c.fill(); // капля
    c.fillStyle = 'rgba(192,57,43,.6)'; c.beginPath(); c.ellipse(560, 870, 30 + p * 20, 6, 0, 0, TAU); c.fill();
    tex(c, '#000', 0.2); vignette(c, 0.65); grain(c, t); frame(c);
  };

  // --- Миссия 3 ---
  S.m3_start = (c, t) => { // колодец сверху: доски, камень, царапины изнутри; сосны по кругу
    sky(c, [[0, '#121a14'], [1, '#050806']]);
    for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, r = 520 + (i % 3) * 60; c.fillStyle = i % 2 ? '#0e1a10' : '#152618'; c.save(); c.translate(W / 2 + Math.cos(a) * r, 450 + Math.sin(a) * r * 0.6); c.beginPath(); for (let k = 0; k < 14; k++) { const q = k % 2 ? 60 : 100; c.lineTo(Math.cos(k / 14 * TAU) * q, Math.sin(k / 14 * TAU) * q); } c.fill(); c.restore(); }
    c.fillStyle = '#4a4440'; c.beginPath(); c.arc(W / 2, 450, 260, 0, TAU); c.fill(); c.fillStyle = '#020302'; c.beginPath(); c.arc(W / 2, 450, 200, 0, TAU); c.fill();
    const jolt = Math.sin(t * 7) > 0.85 ? 4 : 0;
    for (let i = -1; i <= 1; i++) { c.save(); c.translate(W / 2 + i * 120, 450 + jolt * (i + 2) * 0.4); c.rotate(i * 0.04); c.fillStyle = '#6a5034'; c.fillRect(-55, -240, 110, 480); c.strokeStyle = '#3a2814'; c.lineWidth = 3; c.strokeRect(-55, -240, 110, 480); c.restore(); }
    c.fillStyle = '#7a7470'; c.beginPath(); c.ellipse(W / 2 + 20, 440 + jolt, 90, 64, 0.3, 0, TAU); c.fill(); // камень
    c.strokeStyle = 'rgba(200,200,190,.6)'; c.lineWidth = 3; for (let i = 0; i < 5; i++) { const p = (t * 0.5 + i * 0.2) % 1; c.globalAlpha = 1 - p; c.beginPath(); c.moveTo(W / 2 - 230 + i * 6, 400 + i * 22); c.lineTo(W / 2 - 230 + i * 6 + 40 * p, 430 + i * 22); c.stroke(); } c.globalAlpha = 1;
    smoke(c, W / 2, 900, t, { n: 16, h: 700, spread: 600, r: 200, color: 'rgba(170,190,170,A)', a: 0.05, speed: 0.03 });
    tex(c, '#000', 0.25); vignette(c, 0.75); grain(c, t); frame(c);
  };
  S.m3_battery = (c, t) => { // детский рисунок мелками: дом, ёлки, солнце и большой бурый зверь
    sky(c, [[0, '#ece2c8'], [1, '#d8caa8']]);
    const j = (k) => Math.sin(t * 8 + k) * 2.2; // «дрожь» мелка
    const line = (pts, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x + j(i), y + j(i + 3)) : c.moveTo(x + j(i), y + j(i + 3)))); c.stroke(); };
    line([[300, 620], [300, 430], [430, 330], [560, 430], [560, 620], [300, 620]], '#8a3a2a', 10); line([[390, 620], [390, 530], [460, 530], [460, 620]], '#4a3a2a', 8); // дом
    [[700, 640], [820, 650], [1460, 640]].forEach(([x, y], k) => line([[x, y], [x - 50, y], [x, y - 160], [x + 50, y], [x, y]], '#2a6a3a', 10));
    c.strokeStyle = '#e0a020'; c.lineWidth = 8; c.beginPath(); c.arc(1380 + j(1), 170 + j(2), 60, 0, TAU); c.stroke(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + t * 0.2; line([[1380 + Math.cos(a) * 80, 170 + Math.sin(a) * 80], [1380 + Math.cos(a) * 120, 170 + Math.sin(a) * 120]], '#e0a020', 6); }
    c.fillStyle = 'rgba(90,58,30,.85)'; c.beginPath(); c.ellipse(1080 + j(4), 520, 200, 150, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(1000 + j(5), 360, 80, 0, TAU); c.fill(); c.beginPath(); c.arc(950, 300, 26, 0, TAU); c.arc(1050, 300, 26, 0, TAU); c.fill(); // зверь
    [[930, 620], [1220, 620]].forEach(([x, y]) => line([[x, y], [x - 20, y + 60], [x + 30, y + 60]], '#5a3a1e', 14));
    const blink = Math.sin(t * 2) > 0.9 ? 0.2 : 1; c.fillStyle = '#d02010'; c.beginPath(); c.ellipse(975, 350, 12, 12 * blink, 0, 0, TAU); c.ellipse(1025, 350, 12, 12 * blink, 0, 0, TAU); c.fill();
    c.fillStyle = '#2a2a6a'; c.font = "bold 58px 'Comic Sans MS', 'Segoe Print', cursive"; c.textAlign = 'center'; c.save(); c.translate(800, 820); c.rotate(-0.03); c.fillText('МИША ПРИХОДИТ НОЧЬЮ', j(9), 0); c.restore();
    c.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 800; i++) c.fillRect((i * 97) % W, (i * 61) % H, 3, 1); // фактура бумаги
    vignette(c, 0.45); grain(c, t); frame(c);
  };
  S.m3_bear = (c, t) => { // огромный силуэт встаёт: половина морды — белые зубы, пар дыхания
    sky(c, [[0, '#0f1410'], [1, '#040504']]);
    pines(c, 900, '#0a120c', 3, 20, 500, 900);
    const rise = Math.min(1, t * 0.25 % 4), y = 900 - 120 * rise;
    c.fillStyle = '#060706'; c.beginPath(); c.moveTo(W / 2 - 360, 900); c.quadraticCurveTo(W / 2 - 380, y - 360, W / 2 - 160, y - 480); c.lineTo(W / 2 - 120, y - 560); c.lineTo(W / 2 - 60, y - 520); c.lineTo(W / 2 + 60, y - 520); c.lineTo(W / 2 + 120, y - 560); c.lineTo(W / 2 + 160, y - 480); c.quadraticCurveTo(W / 2 + 380, y - 360, W / 2 + 360, 900); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(160,200,140,.45)'; c.lineWidth = 6; c.stroke(); // холодный контурный свет — силуэт медведя виден на фоне леса
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, W / 2, y - 420, 420, 'rgba(120,160,110,A)', 0.12); c.restore();
    c.fillStyle = PAPER; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(W / 2 + 10 + i * 18, y - 330); c.lineTo(W / 2 + 18 + i * 18, y - 290 - (i % 2) * 10); c.lineTo(W / 2 + 26 + i * 18, y - 330); c.fill(); } // зубы сквозь щёку
    c.strokeStyle = PAPER; c.lineWidth = 3; c.beginPath(); c.arc(W / 2 + 70, y - 330, 70, 0.2, 2.6); c.stroke();
    eyesPair(c, W / 2 - 40, y - 420, 1.8, 1, '#d8ff4a');
    const br = (Math.sin(t * 0.9) + 1) / 2; smoke(c, W / 2 + 40, y - 300, t, { n: 8, h: 160, spread: 30, r: 70, color: 'rgba(220,220,210,A)', a: 0.18 * br, speed: 0.4, sway: 30 });
    c.save(); c.translate(W / 2 + 250, y - 200); c.rotate(-0.7); c.fillStyle = '#5a4030'; c.fillRect(-8, -260, 16, 300); c.fillStyle = '#9aa0a6'; c.beginPath(); c.moveTo(-14, -260); c.lineTo(0, -320); c.lineTo(14, -260); c.fill(); c.restore(); // обломок рогатины
    tex(c, '#000', 0.25); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m3_twist = (c, t) => { // вышка, радиоволны рвутся, перегрызенный кабель искрит, борозды когтей
    sky(c, [[0, '#4a3a30'], [0.55, '#2a2420'], [1, '#0e0b0a']]);
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 760, 300, 520, 'rgba(200,150,110,A)', 0.18); c.restore(); // зарево за вышкой — силуэт читается
    c.strokeStyle = INK; c.lineWidth = 10; c.beginPath(); c.moveTo(560, 900); c.lineTo(760, 160); c.lineTo(960, 900); c.stroke();
    c.lineWidth = 6; for (let i = 0; i < 7; i++) { const y = 260 + i * 95, k = (y - 160) / 740; c.beginPath(); c.moveTo(760 - 200 * k, y); c.lineTo(760 + 200 * k, y + 95); c.moveTo(760 + 200 * k, y); c.lineTo(760 - 200 * k, y + 95); c.stroke(); }
    c.fillStyle = INK; c.fillRect(690, 120, 140, 60);
    for (let k = 0; k < 5; k++) { const p = (t * 0.5 + k / 5) % 1, r = 60 + p * 700; c.strokeStyle = `rgba(232,220,192,${0.6 * (1 - p)})`; c.lineWidth = 6; c.setLineDash([60 * (1 - p) + 5, 40 + p * 120]); c.beginPath(); c.arc(760, 150, r, -2.6, -0.5); c.stroke(); } c.setLineDash([]);
    c.strokeStyle = '#3a3a3a'; c.lineWidth = 9; c.beginPath(); c.moveTo(830, 160); c.quadraticCurveTo(1100, 260, 1180, 520); c.stroke(); c.beginPath(); c.moveTo(1200, 580); c.quadraticCurveTo(1260, 760, 1300, 900); c.stroke();
    if (Math.sin(t * 11) > 0.3) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 1190, 550, 90, 'rgba(255,220,120,A)', 0.8); c.strokeStyle = '#fff3a0'; c.lineWidth = 3; for (let i = 0; i < 6; i++) { const a = i + t * 13; c.beginPath(); c.moveTo(1190, 550); c.lineTo(1190 + Math.cos(a) * 50, 550 + Math.sin(a) * 50); c.stroke(); } c.restore(); }
    c.strokeStyle = 'rgba(232,220,192,.7)'; c.lineWidth = 10; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(250 + i * 36, 300); c.lineTo(300 + i * 36, 560); c.stroke(); } // борозды когтей
    c.fillStyle = '#6a4a2a'; for (let i = 0; i < 12; i++) { c.save(); c.translate(240 + (i * 37) % 200, 600 + (i * 53) % 120); c.rotate(i); c.fillRect(0, 0, 18, 4); c.restore(); } // шерсть
    tex(c, '#000', 0.2); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m3_bear_dead = (c, t) => { // туша лежит, как подрубленное дерево; лоскут с нашивкой; падает хвоя
    sky(c, [[0, '#1a1e1a'], [1, '#080908']]);
    pines(c, 700, '#0c120d', 9, 16, 300, 650);
    c.fillStyle = '#0a0b0a'; c.fillRect(0, 700, W, 200);
    glow(c, W / 2, 620, 760, 'rgba(150,170,190,A)', 0.3); // холодный утренний свет из-за туши
    c.fillStyle = '#040504';
    c.beginPath(); c.moveTo(W / 2 - 540, 760); // туша: неровный, свалявшийся мех по верхнему краю
    for (let i = 0; i <= 60; i++) { const u = i / 60, x = W / 2 - 540 + u * 1080, y = 720 - Math.sin(u * Math.PI) * 120 - (i % 2 ? 0 : 14 + Math.sin(i * 3.1) * 8); c.lineTo(x, y); }
    c.lineTo(W / 2 + 540, 790); c.lineTo(W / 2 - 540, 790); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(W / 2 + 560, 720, 120, 78, 0.25, 0, TAU); c.fill(); c.beginPath(); c.arc(W / 2 + 520, 650, 26, 0, TAU); c.arc(W / 2 + 610, 660, 24, 0, TAU); c.fill(); // голова, уши
    c.fillStyle = PAPER; for (let f = 0; f < 4; f++) { c.beginPath(); c.moveTo(W / 2 + 640 + f * 10, 740); c.lineTo(W / 2 + 648 + f * 10, 760); c.lineTo(W / 2 + 652 + f * 10, 740); c.fill(); } // оскал
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(150,170,190,.35)'; c.lineWidth = 3; c.beginPath(); for (let i = 0; i <= 60; i++) { const u = i / 60; c.lineTo(W / 2 - 540 + u * 1080, 718 - Math.sin(u * Math.PI) * 120 - (i % 2 ? 0 : 14 + Math.sin(i * 3.1) * 8)); } c.stroke(); c.restore(); // контровой свет по меху
    c.save(); c.translate(W / 2 + 560, 700); c.rotate(0.3); c.fillStyle = '#4a5a3a'; c.fillRect(-40, -20, 100, 60); c.fillStyle = GOLD; c.beginPath(); c.moveTo(0, -6); c.lineTo(22, -6); c.lineTo(22, 16); c.lineTo(11, 26); c.lineTo(0, 16); c.closePath(); c.fill(); c.restore(); // лоскут «Лесная охрана»
    c.fillStyle = '#4a6a3a'; for (let i = 0; i < 60; i++) { const x = (i * 211) % W + Math.sin(t + i) * 20, y = ((i * 97 + t * 50) % 900); c.save(); c.translate(x, y); c.rotate(t + i); c.fillRect(0, 0, 14, 2); c.restore(); }
    c.fillStyle = PAPER; c.font = "italic 40px Georgia, serif"; c.textAlign = 'left'; c.globalAlpha = 0.85; c.fillText('Лучше не думать, чем он кормился этой осенью.', 110, 150); c.globalAlpha = 1;
    tex(c, '#000', 0.25); vignette(c, 0.7); grain(c, t); frame(c);
  };

  // --- Миссия 4 ---
  S.m4_start = (c, t) => { // зарево: перевёрнутый бензовоз в огне, столбы дыма, надпись краской
    sky(c, [[0, '#1a0c08'], [0.6, '#5a2010'], [1, '#120806']]);
    smoke(c, 900, 560, t, { n: 26, h: 700, spread: 120, r: 200, color: 'rgba(30,20,18,A)', a: 0.35, speed: 0.05, sway: 120 });
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 900, 560, 700, 'rgba(255,120,40,A)', 0.35 + Math.sin(t * 7) * 0.05); c.restore();
    c.save(); c.translate(900, 600); c.rotate(-0.12); c.fillStyle = INK; c.beginPath(); c.ellipse(0, 0, 380, 90, 0, 0, TAU); c.fill(); c.fillRect(330, -110, 160, 150); c.restore(); // цистерна и кабина
    flame(c, 900, 600, 760, 360, t, 1);
    c.fillStyle = '#050303'; c.fillRect(0, 700, W, 200);
    c.save(); c.translate(200, 700); c.fillStyle = INK; c.fillRect(-150, -330, 300, 330); c.restore(); // ларёк заправки
    scrawl(c, 'ЗДЕСЬ ВСЁ', 200, 470, 50, BLOOD, -0.08, t * 0.3); scrawl(c, 'НАШЕ', 200, 540, 64, BLOOD, -0.05, t * 0.3);
    tex(c, '#000', 0.2); vignette(c, 0.6); grain(c, t); frame(c);
  };
  S.m4_bandit = (c, t) => { // балаклава крупно: прорезь глаз, вспышка выстрела, клеймо-лапа на запястье
    sky(c, [[0, '#1c1a1a'], [1, '#080707']]);
    c.fillStyle = '#0a0a0c'; c.beginPath(); c.ellipse(560, 470, 300, 380, 0, 0, TAU); c.fill(); // голова в балаклаве
    c.fillStyle = '#b07a52'; c.fillRect(330, 360, 460, 110); // прорезь
    const look = Math.sin(t * 0.8) * 30; c.fillStyle = PAPER; c.beginPath(); c.ellipse(450 + look * 0.3, 415, 40, 22, 0, 0, TAU); c.ellipse(670 + look * 0.3, 415, 40, 22, 0, 0, TAU); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(455 + look, 415, 13, 0, TAU); c.arc(675 + look, 415, 13, 0, TAU); c.fill();
    c.strokeStyle = INK; c.lineWidth = 10; c.beginPath(); c.moveTo(370, 368); c.lineTo(510, 395); c.moveTo(750, 368); c.lineTo(610, 395); c.stroke();
    c.fillStyle = '#b07a52'; c.beginPath(); c.ellipse(560, 600, 60, 18, 0, 0, TAU); c.fill(); // рот
    c.fillStyle = '#b07a52'; c.save(); c.translate(1140, 560); c.rotate(-0.3); c.fillRect(-160, -40, 320, 80); c.restore(); // запястье
    c.save(); c.translate(1100, 560); c.fillStyle = '#5a1a10'; c.beginPath(); c.ellipse(0, 10, 26, 20, 0, 0, TAU); c.fill(); for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-24 + i * 16, -20 - (i % 2) * 6, 8, 0, TAU); c.fill(); } c.restore(); // клеймо-лапа
    const f = (t * 0.7) % 1; if (f < 0.12) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 1400, 470, 260, 'rgba(255,220,120,A)', 1 - f * 8); c.fillStyle = '#fff3a0'; c.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r = i % 2 ? 40 : 140; c.lineTo(1400 + Math.cos(a) * r, 470 + Math.sin(a) * r * 0.6); } c.fill(); c.restore(); }
    c.fillStyle = INK; c.save(); c.translate(1330, 500); c.rotate(-0.3); c.fillRect(-40, -18, 120, 30); c.fillRect(-40, -18, 30, 80); c.restore(); // пистолет
    tex(c, '#000', 0.25); vignette(c, 0.65); grain(c, t); frame(c);
  };
  S.m4_bitten = (c, t) => { // лицо пополам: живая тёплая половина и мёртвая зелёная; балаклава сползает наискосок
    const k = (Math.sin(t * 0.5) + 1) / 2; // насколько «уже не его»
    sky(c, [[0, '#121614'], [1, '#050605']]);
    const cx = 800, cy = 480;
    c.save(); c.beginPath(); c.ellipse(cx, cy, 240, 320, 0, 0, TAU); c.clip();
    c.fillStyle = '#b07a52'; c.fillRect(cx - 260, cy - 340, 520, 680); // живая кожа
    c.fillStyle = '#7a9a6a'; c.beginPath(); c.moveTo(cx - 260 + k * 160, cy - 340); c.lineTo(cx + 260, cy - 340); c.lineTo(cx + 260, cy + 340); c.lineTo(cx - 60 + k * 120, cy + 340); c.closePath(); c.fill(); // мёртвая половина растёт
    c.strokeStyle = 'rgba(30,60,30,.65)'; c.lineWidth = 3; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(cx + 40 + i * 30, cy + 40); c.quadraticCurveTo(cx + 60 + i * 30, cy + 120, cx + 30 + i * 30, cy + 220); c.stroke(); } // вены
    c.fillStyle = '#0a0a0c'; c.beginPath(); c.moveTo(cx - 260, cy - 340); c.lineTo(cx + 260, cy - 340); c.lineTo(cx + 260, cy - 120 + k * 40); c.lineTo(cx - 260, cy - 260 + k * 180); c.closePath(); c.fill(); // балаклава, съехавшая наискосок
    c.restore();
    c.fillStyle = PAPER; c.beginPath(); c.ellipse(cx - 90, cy - 10, 34, 18, 0, 0, TAU); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(cx - 90, cy - 10, 12, 0, TAU); c.fill(); // живой глаз
    c.fillStyle = '#e8f0d8'; c.beginPath(); c.ellipse(cx + 90, cy - 10, 34, 18, 0, 0, TAU); c.fill(); c.fillStyle = `rgba(150,170,140,${1 - k * 0.6})`; c.beginPath(); c.arc(cx + 90, cy - 10, 10, 0, TAU); c.fill(); // мёртвый, мутный
    c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.moveTo(cx - 40, cy + 150); c.quadraticCurveTo(cx, cy + 160 + k * 20, cx + 60, cy + 140 + k * 30); c.stroke(); // рот перекашивается
    const fall = (t * 0.4) % 1; c.save(); c.translate(1260, 300 + fall * 640); c.rotate(fall * 6); c.fillStyle = INK; c.fillRect(-50, -14, 100, 28); c.fillRect(-50, -14, 26, 70); c.restore(); // падающий пистолет
    tex(c, '#000', 0.25); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m4_fuel = (c, t) => { // канистра с плещущимся бензином, нацарапанная надпись
    sky(c, [[0, '#1a1410'], [1, '#080605']]);
    c.save(); c.translate(W / 2, 470); c.rotate(-0.05);
    c.fillStyle = '#6a1e14'; c.beginPath(); c.moveTo(-230, -260); c.lineTo(160, -260); c.lineTo(230, -190); c.lineTo(230, 300); c.lineTo(-230, 300); c.closePath(); c.fill();
    c.fillStyle = INK; c.fillRect(-170, -330, 200, 50); c.fillRect(-40, -380, 60, 60); c.fillStyle = '#6a1e14'; c.fillRect(-150, -320, 160, 30);
    c.save(); c.beginPath(); c.rect(-210, -240, 420, 520); c.clip(); // «окно» уровня топлива
    c.fillStyle = 'rgba(255,190,80,.55)'; c.beginPath(); c.moveTo(-210, 300); for (let x = -210; x <= 210; x += 10) c.lineTo(x, -20 + Math.sin(x * 0.02 + t * 3) * 22 + Math.sin(t * 1.3) * (x / 210) * 30); c.lineTo(210, 300); c.closePath(); c.fill(); c.restore();
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 8; c.beginPath(); c.moveTo(-200, -120); c.lineTo(200, 160); c.moveTo(200, -120); c.lineTo(-200, 160); c.stroke(); // штамповка «Х»
    c.restore();
    c.strokeStyle = PAPER; c.lineWidth = 3; c.font = "bold 42px 'Courier New', monospace"; c.textAlign = 'center'; c.save(); c.translate(W / 2 - 30, 130); c.rotate(-0.04); c.strokeText('САШКИНА. НЕ ТРОГАТЬ', 0, 0); c.restore();
    tex(c, '#000', 0.2); vignette(c, 0.65); grain(c, t); frame(c);
  };
  S.m4_night = (c, t) => { // ночная трасса в перспективе: крышки люков подпрыгивают, вдали вспышки
    sky(c, [[0, '#0c0e16'], [0.45, '#1a1420'], [1, '#050404']]);
    c.fillStyle = '#0d0c0c'; c.beginPath(); c.moveTo(0, 900); c.lineTo(760, 380); c.lineTo(840, 380); c.lineTo(W, 900); c.fill();
    c.strokeStyle = 'rgba(232,220,192,.5)'; c.lineWidth = 6; c.setLineDash([40, 50]); c.lineDashOffset = -t * 120; c.beginPath(); c.moveTo(800, 380); c.lineTo(800, 900); c.stroke(); c.setLineDash([]);
    [[0.25, -1], [0.45, 1], [0.7, -1], [0.95, 1]].forEach(([d, side], i) => { const y = 380 + d * 520, x = 800 + side * d * 300, s = 0.3 + d; const jump = Math.max(0, Math.sin(t * 4 + i * 1.7)) * 30 * s;
      c.save(); c.globalCompositeOperation = 'lighter'; glow(c, x, y, 120 * s, 'rgba(140,200,90,A)', 0.3); c.restore();
      c.fillStyle = '#000'; c.beginPath(); c.ellipse(x, y, 70 * s, 18 * s, 0, 0, TAU); c.fill();
      // из щели под крышкой — зеленоватый свет; рука с пальцами цепляется за край крышки (раньше — чёрный брусок, читался как полоса)
      const lift = Math.min(1, jump / (30 * s));
      if (lift > 0.2) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, x, y - 4 * s, 70 * s, 'rgba(150,220,100,A)', 0.4 * lift); c.restore(); }
      c.fillStyle = '#4a4a46'; c.beginPath(); c.ellipse(x + 10 * s, y - jump, 68 * s, 16 * s, 0.1, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 2; c.stroke();
      if (lift > 0.35) {
        const k = s * 1.8, hx = x - 16 * s, top = y - jump + 10 * s; // край крышки; рука крупнее — читается и в маленьком окне
        c.fillStyle = '#8a977a'; c.strokeStyle = INK; c.lineWidth = Math.max(1.5, 2.5 * k);
        c.beginPath(); c.moveTo(hx - 10 * k, y + 2 * k); c.lineTo(hx - 9 * k, top); c.lineTo(hx + 10 * k, top); c.lineTo(hx + 11 * k, y + 2 * k); c.closePath(); c.fill(); c.stroke(); // предплечье из щели
        for (let f = 0; f < 4; f++) { c.beginPath(); c.ellipse(hx - 7 * k + f * 5 * k, top - 6 * k, 2.6 * k, 8 * k, (f - 1.5) * 0.22, 0, TAU); c.fill(); c.stroke(); } // пальцы на краю крышки
      }
    });
    for (let i = 0; i < 3; i++) { const f = (t * 0.9 + i * 0.33) % 1; if (f < 0.1) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 300 + i * 500, 360 - i * 10, 60, 'rgba(255,220,140,A)', 1 - f * 10); c.restore(); } }
    tex(c, '#000', 0.25); vignette(c, 0.75); grain(c, t); frame(c);
  };

  // --- Миссия 5 ---
  S.m5_start = (c, t) => { // мост в тумане: фермы, шлагбаум, распятая шкура, табличка углём
    sky(c, [[0, '#7a7a74'], [0.6, '#9a9284'], [1, '#2a2826']]);
    c.strokeStyle = 'rgba(30,30,32,.8)'; c.lineWidth = 8; c.beginPath(); c.moveTo(0, 520); c.lineTo(W, 380); c.moveTo(0, 600); c.lineTo(W, 470); c.stroke();
    for (let i = 0; i < 16; i++) { const x = i * 110, y1 = 520 - i * 110 * 140 / W, y2 = 600 - i * 110 * 130 / W; c.beginPath(); c.moveTo(x, y1); c.lineTo(x + 55, y2); c.lineTo(x + 110, y1 - 9); c.stroke(); }
    smoke(c, W / 2, 700, t, { n: 20, h: 300, spread: 900, r: 300, color: 'rgba(200,196,186,A)', a: 0.1, speed: 0.02 });
    c.fillStyle = '#2a2826'; c.fillRect(0, 700, W, 200);
    for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? PAPER : BLOOD; c.save(); c.translate(320, 690); c.rotate(-0.06 + Math.sin(t * 0.5) * 0.01); c.fillRect(i * 80, -10, 80, 20); c.restore(); }
    c.fillStyle = INK; c.fillRect(300, 640, 24, 120);
    const sw = Math.sin(t * 0.8) * 0.02; c.save(); c.translate(1220, 380); c.rotate(sw); c.fillStyle = '#3a281c'; // шкура
    c.beginPath(); c.moveTo(0, -150); c.bezierCurveTo(90, -150, 70, -60, 120, -50); c.lineTo(180, -100); c.lineTo(160, -20); c.bezierCurveTo(120, 30, 140, 120, 120, 170); c.lineTo(180, 230); c.lineTo(100, 210); c.bezierCurveTo(60, 260, -60, 260, -100, 210); c.lineTo(-180, 230); c.lineTo(-120, 170); c.bezierCurveTo(-140, 120, -120, 30, -160, -20); c.lineTo(-180, -100); c.lineTo(-120, -50); c.bezierCurveTo(-70, -60, -90, -150, 0, -150); c.fill();
    c.beginPath(); c.arc(0, -170, 50, 0, TAU); c.fill(); eyesPair(c, 0, -175, 0.8, 1, '#d8ff4a'); c.restore();
    c.save(); c.translate(1220, 690); c.rotate(-0.03); c.fillStyle = '#d8cfb8'; c.fillRect(-190, -50, 380, 100); c.fillStyle = '#1a1410'; c.font = "bold 34px 'Courier New', monospace"; c.textAlign = 'center'; c.fillText('ПРОЕЗД — ПО ПОШЛИНЕ', 0, -6); c.fillText('ЛЕСНИК', 0, 34); c.restore();
    tex(c, '#000', 0.2); vignette(c, 0.55); grain(c, t); frame(c);
  };
  S.m5_sniper = (c, t) => { // прицел скользит по дороге, блик на вышке, след пули
    sky(c, [[0, '#6e6c66'], [1, '#2a2826']]);
    c.fillStyle = '#3a3836'; c.beginPath(); c.moveTo(0, 900); c.lineTo(700, 420); c.lineTo(900, 420); c.lineTo(W, 900); c.fill();
    c.fillStyle = '#5a5248'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(520 + i * 40, 720 + (i % 2) * 20, 50, 26, 0, 0, TAU); c.fill(); } // мешки с песком
    c.fillStyle = INK; c.fillRect(1380, 160, 18, 300); c.fillRect(1340, 140, 100, 40);
    const gl = (Math.sin(t * 2.2) + 1) / 2; c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 1390, 160, 80, 'rgba(255,255,220,A)', 0.4 + gl * 0.6); c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? 6 : 40 * (0.6 + gl); c.lineTo(1390 + Math.cos(a) * r, 160 + Math.sin(a) * r); } c.fill(); c.restore();
    const cx = 800 + Math.sin(t * 0.6) * 260, cy = 640 + Math.cos(t * 0.45) * 80;
    c.strokeStyle = BLOOD; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, 120, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(cx - 160, cy); c.lineTo(cx - 30, cy); c.moveTo(cx + 30, cy); c.lineTo(cx + 160, cy); c.moveTo(cx, cy - 160); c.lineTo(cx, cy - 30); c.moveTo(cx, cy + 30); c.lineTo(cx, cy + 160); c.stroke();
    const f = (t * 0.35) % 1; if (f < 0.15) { c.strokeStyle = `rgba(255,240,200,${1 - f * 6})`; c.lineWidth = 3; c.beginPath(); c.moveTo(1390, 170); c.lineTo(cx, cy); c.stroke(); }
    tex(c, '#000', 0.2); vignette(c, 0.6); grain(c, t); frame(c);
  };
  S.m5_forester = (c, t) => { // огромный силуэт в дверном проёме: медвежья голова-капюшон, колун; втягивает воздух
    sky(c, [[0, '#120e0b'], [1, '#050403']]);
    c.fillStyle = '#d8b070'; c.fillRect(560, 100, 480, 800); glow(c, 800, 500, 520, 'rgba(255,200,120,A)', 0.25); // свет из избы
    const br = Math.sin(t * 0.7) * 10;
    c.fillStyle = INK; c.beginPath(); c.moveTo(560, 900); c.lineTo(600, 420 + br); c.quadraticCurveTo(620, 330, 690, 300); c.lineTo(910, 300); c.quadraticCurveTo(980, 330, 1000, 420 + br); c.lineTo(1040, 900); c.closePath(); c.fill(); // плечи-шкура
    c.beginPath(); c.ellipse(800, 230 + br * 0.5, 120, 100, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(710, 150 + br * 0.5, 30, 0, TAU); c.arc(890, 150 + br * 0.5, 30, 0, TAU); c.fill(); // голова зверя
    c.fillStyle = PAPER; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(752 + i * 30, 300); c.lineTo(762 + i * 30, 330); c.lineTo(772 + i * 30, 300); c.fill(); }
    eyesPair(c, 800, 250, 1, 1, '#d8ff4a');
    c.save(); c.translate(1080, 640); c.rotate(0.3 + Math.sin(t * 0.7) * 0.03); c.fillStyle = INK; c.fillRect(-10, -340, 20, 420); c.beginPath(); c.moveTo(-10, -340); c.lineTo(-110, -380); c.quadraticCurveTo(-130, -300, -110, -250); c.lineTo(-10, -280); c.fill(); c.fillStyle = 'rgba(140,25,15,.7)'; c.beginPath(); c.ellipse(-80, -310, 18, 34, 0.2, 0, TAU); c.fill(); c.restore();
    smoke(c, 800, 330, t, { n: 8, h: 120, spread: 20, r: 50, color: 'rgba(220,210,190,A)', a: 0.12, speed: 0.35, sway: 15 });
    c.fillStyle = PAPER; c.font = "italic 30px Georgia, serif"; c.textAlign = 'center'; c.globalAlpha = 0.85; c.fillText('«Чую вас, городские…»', 800, 860); c.globalAlpha = 1;
    tex(c, '#000', 0.25); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m5_key = (c, t) => { // ключ на шнурке среди жестяных «пошлин», качается; красные круги на карте
    sky(c, [[0, '#1c1a16'], [1, '#090806']]);
    c.strokeStyle = 'rgba(232,220,192,.12)'; c.lineWidth = 3; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, 100 + i * 100); c.bezierCurveTo(400, 60 + i * 110, 900, 160 + i * 90, W, 80 + i * 100); c.stroke(); } // линии карты
    [[300, 260], [760, 640], [1300, 300]].forEach(([x, y], i) => { c.strokeStyle = BLOOD; c.lineWidth = 6; c.beginPath(); c.ellipse(x, y, 90 + Math.sin(t * 2 + i) * 4, 60, 0.2, 0, TAU); c.stroke(); });
    const a = Math.sin(t * 1.2) * 0.25; c.save(); c.translate(W / 2, 40); c.rotate(a);
    c.strokeStyle = '#8a7a5a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-200, 500, 0, 640); c.quadraticCurveTo(200, 500, 0, 0); c.stroke();
    const items = 16; for (let i = 0; i < items; i++) { const u = i / (items - 1), x = (u < 0.5 ? -1 : 1) * Math.sin(u * Math.PI) * 170, y = 80 + Math.sin(u * Math.PI) * 480 + u * 60;
      c.save(); c.translate(x, y); c.rotate(Math.sin(t * 2 + i) * 0.3);
      const k = i % 4; if (k === 0) { c.fillStyle = '#9aa0a6'; c.beginPath(); c.arc(0, 0, 18, 0, TAU); c.fill(); } else if (k === 1) { c.strokeStyle = GOLD; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.stroke(); } else if (k === 2) { c.fillStyle = '#c8c0b0'; c.fillRect(-4, -18, 8, 36); c.fillRect(-12, -8, 24, 8); } else { ['#c0392b', '#e0a83a', '#4a7ab0'].forEach((col, j) => { c.fillStyle = col; c.beginPath(); c.arc(-14 + j * 14, 0, 7, 0, TAU); c.fill(); }); }
      c.restore(); }
    c.fillStyle = GOLD; c.beginPath(); c.arc(0, 660, 30, 0, TAU); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(0, 660, 12, 0, TAU); c.fill(); c.fillStyle = GOLD; c.fillRect(-8, 690, 16, 120); c.fillRect(8, 770, 26, 12); c.fillRect(8, 792, 18, 12);
    c.restore();
    tex(c, '#000', 0.2); vignette(c, 0.6); grain(c, t); frame(c);
  };
  S.m5_saw = (c, t) => { // крутящийся диск, щепки и красные брызги летят веером
    sky(c, [[0, '#1a1410'], [1, '#070505']]);
    c.fillStyle = '#2a2420'; c.fillRect(0, 560, W, 80);
    c.save(); c.translate(800, 560); c.rotate(t * 9);
    c.fillStyle = '#b8bcc0'; c.beginPath(); for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU, r = i % 2 ? 260 : 300; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill();
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 10; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(0, 0, 80 + i * 30, i, i + 2); c.stroke(); }
    c.fillStyle = '#3a3836'; c.beginPath(); c.arc(0, 0, 50, 0, TAU); c.fill(); c.restore();
    for (let i = 0; i < 40; i++) { const p = (t * 1.5 + i / 40) % 1, a = -2.8 + (i % 7) * 0.12, d = 300 + p * 800; const x = 800 + Math.cos(a) * d, y = 560 + Math.sin(a) * d * 0.6 + p * p * 300;
      c.save(); c.translate(x, y); c.rotate(p * 12 + i); c.globalAlpha = 1 - p; c.fillStyle = i % 3 ? '#c8a070' : BLOOD; c.fillRect(-10, -3, i % 3 ? 22 : 10, i % 3 ? 6 : 10); c.restore(); }
    c.globalAlpha = 1;
    smoke(c, 800, 560, t, { n: 14, h: 400, spread: 200, r: 140, color: 'rgba(200,170,130,A)', a: 0.08, speed: 0.3 });
    tex(c, '#000', 0.25); vignette(c, 0.65); grain(c, t); frame(c);
  };
  S.m5_forester_dead = (c, t) => { // сползшая медвежья голова, старое фото, топор в луже
    sky(c, [[0, '#1c1d1c'], [1, '#090909']]);
    c.save(); c.translate(W / 2, 700); c.scale(1, 0.3); const g = c.createRadialGradient(0, 0, 40, 0, 0, 700); g.addColorStop(0, '#3a4048'); g.addColorStop(1, '#141618'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 700, 0, TAU); c.fill();
    for (let k = 0; k < 3; k++) { const p = (t * 0.2 + k / 3) % 1; c.strokeStyle = `rgba(232,220,192,${0.3 * (1 - p)})`; c.lineWidth = 6; c.beginPath(); c.arc(-200, 0, 40 + p * 500, 0, TAU); c.stroke(); } c.restore();
    c.fillStyle = '#2a1e14'; c.beginPath(); c.ellipse(420, 600, 160, 110, -0.4, 0, TAU); c.fill(); c.beginPath(); c.arc(320, 500, 40, 0, TAU); c.arc(500, 470, 40, 0, TAU); c.fill(); // голова-шкура
    c.save(); c.translate(1150, 720); c.rotate(0.2); c.fillStyle = '#5a4030'; c.fillRect(-200, -10, 300, 20); c.fillStyle = '#7a8086'; c.beginPath(); c.moveTo(100, -10); c.lineTo(190, -60); c.quadraticCurveTo(210, 10, 190, 60); c.lineTo(100, 10); c.fill(); c.restore(); // топор
    const drift = Math.sin(t * 0.6) * 20; c.save(); c.translate(820 + drift, 360 + Math.cos(t * 0.5) * 10); c.rotate(-0.12 + drift * 0.002);
    c.fillStyle = '#d8cfb8'; c.fillRect(-170, -120, 340, 240); c.fillStyle = '#8a8070'; c.fillRect(-150, -100, 300, 180);
    c.fillStyle = '#3a4a3a'; c.beginPath(); c.arc(-60, -30, 34, 0, TAU); c.fill(); c.fillRect(-100, 0, 80, 80); // молодой лесник
    c.fillStyle = '#4a3a2a'; c.beginPath(); c.arc(60, 10, 26, 0, TAU); c.fill(); c.fillRect(30, 30, 60, 50); c.fillStyle = PAPER; c.fillRect(20, -16, 18, 14); c.fillRect(82, -16, 18, 14); // девочка с бантами
    c.fillStyle = '#efe6d0'; c.fillRect(70, 40, 60, 44); c.fillStyle = '#5a3a1e'; c.beginPath(); c.ellipse(100, 64, 18, 14, 0, 0, TAU); c.fill(); c.fillStyle = '#d02010'; c.fillRect(92, 58, 4, 4); c.fillRect(102, 58, 4, 4); // её рисунок
    c.restore();
    tex(c, '#000', 0.2); vignette(c, 0.65); grain(c, t); frame(c);
  };

  // --- Миссия 6 и эпилог ---
  // --- Миссия 6 «Погост» ---
  function pineSil(c, x, y, h, col) { c.fillStyle = col || INK; c.beginPath(); c.moveTo(x, y - h); for (let k = 0; k < 5; k++) { const yy = y - h + (k + 1) * h / 5, w = (k + 1) * h * 0.09; c.lineTo(x + w, yy); c.lineTo(x + w * 0.45, yy); } for (let k = 4; k >= 0; k--) { const yy = y - h + (k + 1) * h / 5, w = (k + 1) * h * 0.09; c.lineTo(x - w * 0.45, yy); c.lineTo(x - w, yy); } c.closePath(); c.fill(); c.fillRect(x - h * 0.02, y - 4, h * 0.04, 30); }
  function crossGlow(c, x, y, s, t) { // сияющий крест: ровный белый свет без огня
    const p = 0.85 + Math.sin(t * 1.3) * 0.08;
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, x, y, 420 * s * p, 'rgba(255,250,215,A)', 0.35); c.restore();
    c.fillStyle = '#fffdf2'; c.strokeStyle = '#8a6a28'; c.lineWidth = 4 * s;
    c.beginPath(); c.rect(x - 14 * s, y - 130 * s, 28 * s, 260 * s); c.rect(x - 74 * s, y - 80 * s, 148 * s, 26 * s); c.fill(); c.stroke();
    c.fillStyle = '#fffdf2'; c.fillRect(x - 12 * s, y - 78 * s, 24 * s, 22 * s); // перекрестье без шва
  }
  S.m6_start = (c, t) => { // лесная дорога ночью; над соснами стоит белый свет креста
    sky(c, [[0, '#0e1218'], [0.6, '#1a2026'], [1, '#07090a']]);
    crossGlow(c, 1100, 300, 0.9, t);
    for (let i = 0; i < 16; i++) { const x = i * 110 - 40 + (i % 2) * 30, h = 300 + (i * 53 % 160); if (x > 1020 && x < 1180) continue; pineSil(c, x, 640, h, i % 3 ? '#0a0d0c' : '#111614'); }
    c.fillStyle = '#16181a'; c.beginPath(); c.moveTo(560, 900); c.lineTo(760, 620); c.lineTo(860, 620); c.lineTo(1100, 900); c.fill(); // дорога в лес
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,250,215,.06)'; c.beginPath(); c.moveTo(760, 620); c.lineTo(860, 620); c.lineTo(1100, 900); c.lineTo(560, 900); c.fill(); c.restore(); // отсвет на асфальте
    for (let i = 0; i < 30; i++) { const p = (t * 0.25 + i / 30) % 1; c.fillStyle = `rgba(200,210,220,${0.35 * (1 - p)})`; c.fillRect((i * 331) % W, p * 900, 2, 10); } // капли с веток
    smoke(c, 800, 760, t, { n: 12, h: 120, spread: 500, r: 160, color: 'rgba(160,170,180,A)', a: 0.07, speed: 0.04, sway: 120 }); // туман у земли
    tex(c, '#000', 0.2); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m6_frenzy = (c, t) => { // в свете креста мертвецы рвутся вперёд — двойные силуэты-«эхо»
    sky(c, [[0, '#1a1c22'], [1, '#08080a']]);
    crossGlow(c, 800, 300, 1.1, t);
    c.fillStyle = '#121416'; c.fillRect(0, 760, W, 140);
    [[330, 3.0, 0], [600, 3.4, 1], [1010, 3.3, 0], [1280, 3.0, 1]].forEach(([x, s, f], i) => {
      const lunge = ((t * 1.8 + i * 0.4) % 1), dx = (f ? -1 : 1) * (lunge < 0.5 ? lunge : 1 - lunge) * 120;
      c.globalAlpha = 0.35; walker(c, x + dx * 0.4, 840, s, t, { ph: i, flip: !!f, fill: '#3a3e46' }); // эхо первого рывка
      c.globalAlpha = 1; walker(c, x + dx, 840, s, t * 3, { ph: i, flip: !!f, fill: '#0c0d10', eyes: '#fff8d8' });
    });
    c.strokeStyle = 'rgba(255,250,215,.35)'; c.lineWidth = 3; for (let i = 0; i < 10; i++) { const p = (t * 1.5 + i / 10) % 1, x = 200 + i * 130; c.beginPath(); c.moveTo(x - 40 * p, 650 - p * 40); c.lineTo(x - 40 * p - 60, 650 - p * 40); c.stroke(); } // линии рывка
    c.fillStyle = PAPER; c.font = "900 66px Impact, sans-serif"; c.textAlign = 'center'; c.globalAlpha = 0.85; c.fillText('ЕЩЁ РАЗ', 800, 120); c.globalAlpha = 1;
    tex(c, '#000', 0.2); vignette(c, 0.65); grain(c, t); frame(c);
  };
  S.m6_brutes = (c, t) => { // из-за склепа поднимаются громадные «могильщики», по бокам — длиннорукие Хваты
    sky(c, [[0, '#14161c'], [1, '#060607']]);
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 1400, 160, 380, 'rgba(255,250,215,A)', 0.25); glow(c, 800, 480, 520, 'rgba(200,210,230,A)', 0.12); c.restore(); // свет креста сбоку и подсветка за склепом
    c.fillStyle = '#101214'; c.fillRect(0, 720, W, 180);
    const rise = Math.min(1, ((t * 0.3) % 1.6));
    [[640, 2.6], [800, 3.0], [960, 2.6]].forEach(([x, s], i) => { // громилы: широкие плечи, лопаты
      const y = 720 + (1 - rise) * 260 * (1 + i * 0.1);
      c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = '#0a0b0c';
      c.strokeStyle = 'rgba(255,245,210,.55)'; c.lineWidth = 2.5; // контурный свет от Креста
      c.beginPath(); c.moveTo(-46, 0); c.lineTo(-54, -100); c.quadraticCurveTo(-50, -150, -20, -158); c.lineTo(20, -158); c.quadraticCurveTo(50, -150, 54, -100); c.lineTo(46, 0); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, -176, 20, 22, 0, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = '#3a3630'; c.lineWidth = 6; c.beginPath(); c.moveTo(52, -110); c.lineTo(80, -10); c.stroke(); c.fillStyle = '#5a564e'; c.fillRect(70, -14, 22, 26); // лопата
      eyesPair(c, 0, -178, 0.6, rise);
      c.restore();
    });
    c.fillStyle = '#3a3830'; c.fillRect(560, 620, 480, 120); c.fillStyle = '#2a2822'; c.beginPath(); c.moveTo(540, 620); c.lineTo(800, 540); c.lineTo(1060, 620); c.fill(); // склеп (передний план)
    c.fillStyle = '#7a766c'; c.fillRect(790, 500, 20, 60); c.fillRect(770, 515, 60, 14);
    [[260, 0], [1340, 1]].forEach(([x, f], i) => { // хваты: длинные руки тянутся к зрителю
      c.save(); c.translate(x, 760); c.scale(f ? -2 : 2, 2); c.fillStyle = '#0c0d0e';
      c.strokeStyle = 'rgba(255,245,210,.5)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-14, 0); c.lineTo(-10, -90); c.lineTo(10, -94); c.lineTo(14, 0); c.fill(); c.stroke(); c.beginPath(); c.ellipse(2, -106, 10, 12, 0, 0, TAU); c.fill(); c.stroke();
      eyesPair(c, 4, -108, 0.35, 1);
      const reach = 60 + Math.sin(t * 1.4 + i) * 20; c.strokeStyle = '#4a4c50'; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(6, -80); c.quadraticCurveTo(50, -90, 60 + reach, -60); c.stroke(); c.beginPath(); c.moveTo(0, -70); c.quadraticCurveTo(40, -60, 50 + reach, -30); c.stroke();
      c.restore();
    });
    tex(c, '#000', 0.22); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m6_radio = (c, t) => { // сторожка: рация на журнале, свеча, запертый подпол, из-под двери тянет холодом
    sky(c, [[0, '#1c1612'], [1, '#0a0806']]);
    const fl = 0.85 + Math.sin(t * 7) * 0.08 + Math.sin(t * 17) * 0.04;
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 520, 420, 520 * fl, 'rgba(255,190,100,A)', 0.3); c.restore();
    c.fillStyle = '#3a2818'; c.fillRect(160, 540, 820, 40); c.fillRect(200, 580, 30, 300); c.fillRect(910, 580, 30, 300); // стол
    c.fillStyle = '#e4dcc4'; c.save(); c.translate(560, 520); c.rotate(-0.05); c.fillRect(-170, -20, 340, 40); c.strokeStyle = 'rgba(60,40,20,.5)'; c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-150, -10 + i * 5); c.lineTo(150, -10 + i * 5); c.stroke(); } c.restore(); // журнал
    c.fillStyle = '#3a4234'; c.fillRect(440, 400, 240, 120); c.strokeStyle = INK; c.lineWidth = 5; c.strokeRect(440, 400, 240, 120); // рация
    c.fillStyle = '#1a1c18'; for (let i = 0; i < 5; i++) for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(470 + i * 18, 430 + k * 18, 5, 0, TAU); c.fill(); } // разбитый динамик
    c.strokeStyle = '#c8c0b0'; c.lineWidth = 2; c.beginPath(); c.moveTo(470, 425); c.lineTo(540, 490); c.moveTo(520, 425); c.lineTo(480, 495); c.stroke(); // трещины
    c.fillStyle = '#8a8478'; c.beginPath(); c.arc(600, 440, 16, 0, TAU); c.arc(640, 440, 12, 0, TAU); c.fill(); c.strokeStyle = '#2a2a26'; c.lineWidth = 5; c.beginPath(); c.moveTo(660, 400); c.lineTo(700, 260); c.stroke(); // ручки и антенна
    c.fillStyle = '#e8e0c8'; c.fillRect(250, 450, 26, 90); c.fillStyle = '#ffcc55'; c.beginPath(); c.ellipse(263, 438 + Math.sin(t * 9) * 2, 9, 16, 0, 0, TAU); c.fill(); // свеча
    c.fillStyle = '#2a1e14'; c.fillRect(1100, 640, 340, 200); c.strokeStyle = '#141008'; c.lineWidth = 8; c.strokeRect(1100, 640, 340, 200); c.fillStyle = '#6a6a66'; c.fillRect(1250, 720, 40, 16); // люк в подпол, засов изнутри
    smoke(c, 1270, 650, t, { n: 10, h: 160, spread: 140, r: 70, color: 'rgba(180,200,220,A)', a: 0.1, speed: 0.06, sway: 30 }); // холод из-под двери
    c.fillStyle = 'rgba(232,220,192,.85)'; c.font = "italic 40px Georgia, serif"; c.textAlign = 'center'; c.fillText('«Свет не гаснет. Они идут к нему.»', 800, 150);
    tex(c, '#000', 0.2); vignette(c, 0.7); grain(c, t); frame(c);
  };
  // --- Миссия 7 «Белый лебедь» ---
  function veilFigure(c, x, y, s, t, o) { // невеста: белое платье и фата, голова медленно поворачивается
    o = o || {};
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = o.dress || '#e8e2d6'; c.beginPath(); c.moveTo(-60, 0); c.quadraticCurveTo(-30, -110, -16, -150); c.lineTo(16, -150); c.quadraticCurveTo(30, -110, 60, 0); c.closePath(); c.fill();
    c.fillStyle = 'rgba(150,20,14,.85)'; c.beginPath(); c.ellipse(-8, -130, 10, 14, 0.3, 0, TAU); c.fill(); // тёмное пятно на плече
    const turn = Math.sin(t * 0.4) * 6;
    c.fillStyle = 'rgba(236,230,220,.55)'; c.beginPath(); c.moveTo(-6 + turn, -190); c.quadraticCurveTo(-60, -150, -52, -60); c.lineTo(52, -60); c.quadraticCurveTo(60, -150, 6 + turn, -190); c.fill(); // фата
    c.fillStyle = '#b8c2a8'; c.beginPath(); c.ellipse(turn, -168, 15, 19, 0, 0, TAU); c.fill();
    c.fillStyle = '#e8d070'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(turn - 14 + i * 7, -186, 3, 0, TAU); c.fill(); } // венок
    if (o.eyes !== false) { c.fillStyle = BLOOD; c.beginPath(); c.arc(turn - 6, -170, 2.4, 0, TAU); c.arc(turn + 6, -170, 2.4, 0, TAU); c.fill(); }
    c.restore();
  }
  function bandit(c, x, y, s, t, o) { // силуэт «Волка» в балаклаве с черепом
    o = o || {};
    c.save(); c.translate(x, y); c.scale(s * (o.flip ? -1 : 1), s);
    c.fillStyle = INK; c.beginPath(); c.moveTo(-24, 0); c.lineTo(-20, -90); c.quadraticCurveTo(0, -110, 20, -90); c.lineTo(24, 0); c.fill();
    c.beginPath(); c.ellipse(0, -118, 15, 19, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(216,208,192,.85)'; c.beginPath(); c.ellipse(0, -114, 9, 11, 0, 0, TAU); c.fill(); // череп-принт
    c.fillStyle = INK; c.beginPath(); c.arc(-4, -116, 2.6, 0, TAU); c.arc(4, -116, 2.6, 0, TAU); c.fill();
    if (o.glow) { c.fillStyle = `rgba(255,120,40,${o.glow})`; c.fillRect(-24, -92, 48, 5); } // отсвет костра
    c.restore();
  }
  S.m7_start = (c, t) => { // окно банкетного зала: мёртвые гости кружат без музыки, в центре — невеста
    sky(c, [[0, '#14121a'], [1, '#050405']]);
    c.fillStyle = '#2a2018'; c.fillRect(220, 120, 1160, 560); // рама окна
    const g = c.createLinearGradient(0, 140, 0, 660); g.addColorStop(0, '#5a4630'); g.addColorStop(1, '#2a1c12'); c.fillStyle = g; c.fillRect(240, 140, 1120, 520); // тёплый тусклый свет зала
    c.save(); c.beginPath(); c.rect(240, 140, 1120, 520); c.clip();
    c.save(); c.globalCompositeOperation = 'lighter'; [500, 800, 1100].forEach((x, i) => glow(c, x, 170, 160, 'rgba(255,200,120,A)', 0.18 + Math.sin(t * 3 + i) * 0.04)); c.restore(); // люстры
    for (let i = 0; i < 9; i++) { const ph = t * 0.35 + i * 0.7, x = 800 + Math.cos(ph) * (200 + (i % 3) * 120), y = 640 + Math.sin(ph) * 20; if (Math.abs(x - 800) < 60) continue; walker(c, x, y, 1.6 + (i % 2) * 0.2, t, { ph: i, flip: Math.sin(ph) > 0, fill: '#1a1410' }); }
    veilFigure(c, 800, 650, 1.6, t);
    c.restore();
    c.fillStyle = INK; c.fillRect(790, 120, 20, 560); c.fillRect(220, 400, 1160, 16); // переплёт
    c.fillStyle = '#0c0a0a'; c.fillRect(0, 720, W, 180); // асфальт
    c.fillStyle = 'rgba(232,220,192,.55)'; for (let i = 0; i < 90; i++) { c.fillRect((i * 173) % W, 740 + (i * 61) % 150, 4, 2); } // рассыпанный рис
    c.save(); c.translate(1180, 820); c.rotate(-0.3); c.fillStyle = '#e8e2d6'; c.beginPath(); c.moveTo(-50, 0); c.quadraticCurveTo(-10, -26, 40, -14); c.lineTo(46, 4); c.closePath(); c.fill(); c.restore(); // туфля без каблука
    c.strokeStyle = 'rgba(200,190,180,.35)'; c.lineWidth = 8; for (let i = 0; i < 6; i++) { const x = 120 + i * 260; c.beginPath(); c.moveTo(x, 700); c.quadraticCurveTo(x + 30, 760 + Math.sin(t + i) * 10, x + 10, 840); c.stroke(); } // ленты на ограде
    tex(c, '#000', 0.22); vignette(c, 0.75); grain(c, t); frame(c);
  };
  S.m7_scream = (c, t) => { // вопль: волны звука из раскрытого рта, карты вылетают из рук
    sky(c, [[0, '#1c1424'], [1, '#07050a']]);
    const sh = Math.sin(t * 40) * 4; c.save(); c.translate(sh, -sh);
    for (let k = 0; k < 7; k++) { const p = (t * 0.6 + k / 7) % 1; c.strokeStyle = `rgba(200,140,255,${0.55 * (1 - p)})`; c.lineWidth = 10 * (1 - p) + 2; c.beginPath(); c.ellipse(800, 470, 80 + p * 760, 60 + p * 460, 0, 0, TAU); c.stroke(); }
    c.fillStyle = 'rgba(236,230,220,.5)'; c.beginPath(); c.moveTo(800, 170); c.quadraticCurveTo(560, 330, 600, 760); c.lineTo(1000, 760); c.quadraticCurveTo(1040, 330, 800, 170); c.fill(); // фата
    c.fillStyle = '#b8c2a8'; c.beginPath(); c.ellipse(800, 420, 120, 160, 0, 0, TAU); c.fill(); // лицо
    c.fillStyle = BLOOD; c.beginPath(); c.arc(756, 380, 12, 0, TAU); c.arc(844, 380, 12, 0, TAU); c.fill();
    const m = 0.85 + Math.sin(t * 6) * 0.15; c.fillStyle = '#1a0405'; c.beginPath(); c.ellipse(800, 500, 46, 80 * m, 0, 0, TAU); c.fill(); // распахнутый рот
    c.restore();
    for (let i = 0; i < 6; i++) { const p = (t * 0.35 + i / 6) % 1, x = 800 + Math.cos(i * 1.7) * p * 900, y = 470 + Math.sin(i * 1.7) * p * 520; c.save(); c.translate(x, y); c.rotate(p * 6 + i); c.globalAlpha = 1 - p; c.fillStyle = PAPER; c.fillRect(-36, -50, 72, 100); c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(-36, -50, 72, 100); c.restore(); } // карты из рук
    tex(c, '#000', 0.2); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m7_prisoner = (c, t) => { // костёр, человек у столба, «Волки» смеются; один смотрит на часы
    sky(c, [[0, '#0e0c10'], [1, '#050404']]);
    c.fillStyle = '#0c0a08'; c.fillRect(0, 700, W, 200);
    const f = 0.8 + Math.sin(t * 9) * 0.1 + Math.sin(t * 23) * 0.05;
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 800, 720, 520 * f, 'rgba(255,120,40,A)', 0.35); c.restore();
    for (let i = 0; i < 5; i++) { const ph = t * 4 + i; c.fillStyle = i % 2 ? '#ffb040' : '#ff6a20'; c.beginPath(); c.moveTo(740 + i * 30, 740); c.quadraticCurveTo(760 + i * 28 + Math.sin(ph) * 10, 640 - (i % 3) * 30, 770 + i * 25, 600 - (i % 2) * 40 + Math.sin(ph) * 15); c.quadraticCurveTo(780 + i * 26, 680, 800 + i * 25, 740); c.fill(); }
    smoke(c, 800, 600, t, { n: 14, h: 480, spread: 40, r: 90, color: 'rgba(120,110,100,A)', a: 0.12, speed: 0.06 });
    c.fillStyle = '#3a2a1e'; c.fillRect(1086, 260, 24, 460); // столб
    const up = Math.max(0, Math.sin(t * 0.5)); // поднимает голову
    c.fillStyle = '#4a382c'; c.strokeStyle = 'rgba(255,150,70,.85)'; c.lineWidth = 5; // отсвет костра по контуру — пленник читается
    c.beginPath(); c.moveTo(1060, 700); c.lineTo(1066, 470); c.quadraticCurveTo(1098, 440, 1130, 470); c.lineTo(1136, 700); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#9a7a64'; c.beginPath(); c.ellipse(1098 + 6 * (1 - up), 430 + 18 * (1 - up), 22, 27, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = 'rgba(150,30,20,.8)'; c.beginPath(); c.ellipse(1090 + 6 * (1 - up), 420 + 18 * (1 - up), 8, 6, 0, 0, TAU); c.fill(); // кровь на лице
    c.strokeStyle = '#9aa0a6'; c.lineWidth = 3; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(1098, 520 + i * 22, 44, 9, 0, 0, TAU); c.stroke(); } // проволока
    c.fillStyle = INK; c.beginPath(); c.arc(1091 + 6 * (1 - up), 430 + 18 * (1 - up), 2.6, 0, TAU); c.arc(1105 + 6 * (1 - up), 430 + 18 * (1 - up), 2.6, 0, TAU); c.fill();
    c.fillStyle = '#4a3a28'; c.fillRect(300, 640, 160, 70); c.fillStyle = '#2a1e14'; [330, 400].forEach((x) => { c.save(); c.translate(x, 640); c.rotate(x === 330 ? -0.5 : 0.5); c.fillRect(-12, -46, 24, 50); c.restore(); }); // ящик и две пустые кобуры
    [[520, 1.7, 0], [640, 1.9, 1], [1300, 1.8, 0], [1440, 1.6, 1]].forEach(([x, s, fl], i) => bandit(c, x, 720, s, t, { flip: fl, glow: 0.4 * f }));
    c.save(); c.translate(1300, 560); c.strokeStyle = GOLD; c.lineWidth = 3; c.beginPath(); c.arc(-30, 0, 9, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(-30, 0); c.lineTo(-30 + Math.cos(t * 2) * 7, Math.sin(t * 2) * 7); c.stroke(); c.restore(); // часы
    tex(c, '#000', 0.22); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m7_rescue = (c, t) => { // кусачки рвут проволоку; два пистолета крест-накрест; первый серый свет
    sky(c, [[0, '#3a3a44'], [0.6, '#5a5048'], [1, '#1a1614']]);
    const cut = Math.min(1, (t * 0.4) % 2.2);
    c.strokeStyle = '#9aa0a6'; c.lineWidth = 8; c.beginPath(); c.moveTo(200, 300); c.lineTo(780 - (cut > 0.8 ? 60 : 0), 300 + (cut > 0.8 ? 80 : 0)); c.moveTo(820 + (cut > 0.8 ? 60 : 0), 300 + (cut > 0.8 ? 80 : 0)); c.lineTo(1400, 300); c.stroke(); // проволока
    if (cut > 0.75 && cut < 0.95) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 800, 300, 90, 'rgba(255,240,200,A)', 0.9); c.restore(); }
    c.save(); c.translate(800, 300); const k = cut < 0.8 ? 0.35 - cut * 0.4 : 0.03; // кусачки
    [-1, 1].forEach((d) => { c.save(); c.rotate(d * k); c.fillStyle = '#c0392b'; c.fillRect(-14 + d * 6, 40, 22, 200); c.fillStyle = '#6a6e72'; c.beginPath(); c.moveTo(d * 4, 40); c.lineTo(d * 20, -30); c.lineTo(d * 2, -40); c.fill(); c.restore(); });
    c.restore();
    // два пистолета крест-накрест: затвор, ствол, рукоять под углом, спусковая скоба
    [[-1, 560], [1, 1040]].forEach(([d, x]) => {
      c.save(); c.translate(x, 640); c.rotate(d * 0.5); c.scale(d, 1);
      c.fillStyle = '#4a4e54'; c.strokeStyle = INK; c.lineWidth = 6;
      c.beginPath(); c.moveTo(-170, -40); c.lineTo(110, -40); c.lineTo(110, 10); c.lineTo(-170, 10); c.closePath(); c.fill(); c.stroke(); // затвор
      c.fillStyle = '#2a2e32'; c.fillRect(-196, -24, 30, 22); c.strokeRect(-196, -24, 30, 22); // дуло
      c.fillStyle = '#5a3a24'; c.beginPath(); c.moveTo(40, 10); c.lineTo(110, 10); c.lineTo(140, 150); c.lineTo(76, 160); c.closePath(); c.fill(); c.stroke(); // рукоять
      c.beginPath(); c.arc(20, 30, 28, 0, Math.PI); c.stroke(); // скоба
      c.strokeStyle = 'rgba(232,220,192,.35)'; c.lineWidth = 3; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(40 + i * 12, -34); c.lineTo(40 + i * 12, 4); c.stroke(); } // насечки
      c.restore();
    });
    c.fillStyle = PAPER; c.font = "900 66px Impact, sans-serif"; c.textAlign = 'center'; c.globalAlpha = 0.9; c.fillText('СТРЕЛЯЮ С ДВУХ РУК', 800, 830); c.globalAlpha = 1;
    tex(c, '#000', 0.18); vignette(c, 0.55); grain(c, t); frame(c);
  };
  S.m7_executed = (c, t) => { // костёр, обмякшая фигура на столбе; вспышка выстрела повторяется в памяти
    sky(c, [[0, '#120a0a'], [1, '#040303']]);
    c.fillStyle = '#0c0a08'; c.fillRect(0, 700, W, 200);
    const f = 0.8 + Math.sin(t * 8) * 0.1; c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 900, 720, 620 * f, 'rgba(255,110,40,A)', 0.45); c.restore();
    for (let i = 0; i < 4; i++) { const ph = t * 4 + i; c.fillStyle = i % 2 ? '#ffb040' : '#ff6a20'; c.beginPath(); c.moveTo(860 + i * 26, 740); c.quadraticCurveTo(870 + i * 26 + Math.sin(ph) * 8, 660, 880 + i * 22, 620 + Math.sin(ph) * 14); c.quadraticCurveTo(890 + i * 24, 690, 905 + i * 24, 740); c.fill(); } // костёр
    c.fillStyle = '#3a2a1e'; c.fillRect(1086, 260, 24, 460);
    c.fillStyle = '#4a382c'; c.strokeStyle = 'rgba(255,150,70,.8)'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(1066, 700); c.lineTo(1070, 480); c.quadraticCurveTo(1100, 460, 1128, 480); c.lineTo(1132, 700); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#9a7a64'; c.beginPath(); c.ellipse(1112, 500, 22, 26, 0.6, 0, TAU); c.fill(); c.stroke(); // голова упала на грудь
    c.strokeStyle = '#9aa0a6'; c.lineWidth = 3; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(1098, 540 + i * 22, 44, 9, 0, 0, TAU); c.stroke(); }
    bandit(c, 820, 720, 2, t, { glow: 0.4 });
    const fl = (t * 0.5) % 1; if (fl < 0.06) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 900, 470, 160, 'rgba(255,240,180,A)', 1 - fl * 15); c.restore(); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, 0, W, H); }
    c.strokeStyle = INK; c.lineWidth = 12; c.beginPath(); c.moveTo(860, 520); c.lineTo(920, 470); c.stroke(); // рука с пистолетом
    smoke(c, 760, 620, t, { n: 12, h: 460, spread: 40, r: 80, color: 'rgba(110,100,95,A)', a: 0.12, speed: 0.05 });
    c.fillStyle = 'rgba(192,57,43,.9)'; c.font = "italic 46px Georgia, serif"; c.textAlign = 'center'; c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText('Он знал, что мы смотрим.', 800, 860); c.fillText('Он знал, что мы смотрим.', 800, 860);
    tex(c, '#000', 0.25); vignette(c, 0.75); grain(c, t); frame(c);
  };
  S.m7_bride_dead = (c, t) => { // фата белым пятном на мокром асфальте, венок у бордюра, туфля на ступенях; капли
    sky(c, [[0, '#2a2e34'], [1, '#121416']]);
    c.fillStyle = '#1c1e22'; c.fillRect(0, 520, W, 380);
    c.fillStyle = '#3a3a3e'; c.fillRect(1100, 380, 500, 40); c.fillRect(1060, 420, 540, 40); c.fillRect(1020, 460, 580, 60); // ступени
    c.fillStyle = '#2a2420'; c.fillRect(1240, 200, 220, 180); c.strokeStyle = 'rgba(232,226,214,.6)'; c.lineWidth = 6; c.beginPath(); c.moveTo(1240, 210); c.quadraticCurveTo(1350, 260, 1460, 210); c.stroke(); // дверь ресторана и лента
    c.save(); c.translate(1340, 372); c.scale(2, 2); c.fillStyle = '#ece6dc'; c.beginPath(); c.moveTo(-40, 0); c.quadraticCurveTo(-4, -26, 36, -14); c.lineTo(40, 0); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); c.restore(); // туфля носком к двери
    // фата: кружевное полотно с волнистым краем и складками, пятно крови
    const veil = () => { c.beginPath(); c.moveTo(240, 720); c.bezierCurveTo(300, 600, 560, 580, 700, 630); c.bezierCurveTo(800, 660, 880, 700, 860, 740); c.bezierCurveTo(760, 800, 420, 820, 240, 720); c.closePath(); };
    c.save(); c.globalAlpha = 0.5; c.fillStyle = '#ece6dc'; veil(); c.fill(); c.restore(); // прозрачный тюль: сквозь него виден мокрый асфальт
    c.save(); veil(); c.clip(); c.strokeStyle = 'rgba(110,100,92,.35)'; c.lineWidth = 6; [[330, 0.1], [470, -0.05], [610, 0.08]].forEach(([x, r]) => { c.beginPath(); c.moveTo(x, 600); c.quadraticCurveTo(x + 40, 700, x + 10 + r * 100, 820); c.stroke(); }); c.restore(); // мягкие складки
    c.save(); c.setLineDash([3, 9]); c.lineCap = 'round'; c.lineWidth = 6; c.strokeStyle = 'rgba(250,248,240,.85)'; veil(); c.stroke(); c.restore(); // кружевная кайма
    c.fillStyle = 'rgba(150,20,14,.75)'; c.beginPath(); c.ellipse(520, 700, 60, 22, 0.2, 0, TAU); c.fill();
    c.save(); c.translate(270, 700); c.rotate(-0.3 + Math.sin(t * 0.6) * 0.03); c.strokeStyle = '#6a8a3a'; c.lineWidth = 9; c.beginPath(); c.ellipse(0, 0, 60, 34, 0, 0, TAU); c.stroke(); c.fillStyle = '#f4f4e8'; for (let i = 0; i < 9; i++) { const a = i * TAU / 9; c.beginPath(); c.arc(Math.cos(a) * 60, Math.sin(a) * 34, 12, 0, TAU); c.fill(); c.fillStyle = '#e8d070'; c.beginPath(); c.arc(Math.cos(a) * 60, Math.sin(a) * 34, 4.5, 0, TAU); c.fill(); c.fillStyle = '#f4f4e8'; } c.restore(); // венок там, где была голова
    for (let i = 0; i < 7; i++) { const p = (t * 0.07 + i / 7) % 1; c.fillStyle = 'rgba(244,244,232,.85)'; c.beginPath(); c.ellipse(380 + i * 110 + p * 120, 760 + Math.sin(i * 2 + p * 6) * 30, 9, 5, i, 0, TAU); c.fill(); } // лепестки ветер гонит по асфальту
    for (let i = 0; i < 40; i++) { const p = (t * 0.8 + i / 40) % 1, x = (i * 397) % W, y = p * 900; c.fillStyle = 'rgba(200,210,220,.35)'; c.fillRect(x, y, 2, 14); } // дождь
    for (let k = 0; k < 3; k++) { const p = (t * 0.4 + k / 3) % 1; c.strokeStyle = `rgba(200,210,220,${0.4 * (1 - p)})`; c.lineWidth = 2; c.beginPath(); c.ellipse(260 + k * 520, 800, 20 + p * 80, 6 + p * 20, 0, 0, TAU); c.stroke(); } // круги на лужах
    tex(c, '#000', 0.18); vignette(c, 0.6); grain(c, t); frame(c);
  };
  // --- миссия 8 «Полдень»: колхозный рынок, Мясник, «Волки» ---
  function awning(c, x, y, w, h, a, b) { // полосатый выгоревший навес прилавка
    const n = Math.max(3, Math.round(w / 40));
    for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? a : b; c.beginPath(); c.moveTo(x + (w / n) * i, y); c.lineTo(x + (w / n) * (i + 1), y); c.lineTo(x + (w / n) * (i + 1) + 6, y + h); c.lineTo(x + (w / n) * i + 6, y + h); c.closePath(); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x + 6, y + h, w, 10); // кромка тени
  }
  function flies(c, x, y, r, t, n) { c.fillStyle = INK; for (let i = 0; i < n; i++) { const a = t * (1.5 + (i % 5) * 0.4) + i * 2.1; c.beginPath(); c.arc(x + Math.cos(a) * r * (0.4 + (i % 3) * 0.3), y + Math.sin(a * 1.3) * r * 0.5, 2.6, 0, TAU); c.fill(); } }
  function cleaver(c, x, y) { // тесак: широкое прямоугольное лезвие с отверстием и тёмной кромкой
    c.fillStyle = '#9aa0a6'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 34, y); c.lineTo(x + 40, y + 74); c.lineTo(x - 30, y + 80); c.lineTo(x - 30, y + 6); c.closePath(); c.fill();
    c.strokeStyle = '#3a3e42'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#dfe3e6'; c.beginPath(); c.moveTo(x + 40, y + 74); c.lineTo(x - 30, y + 80); c.lineTo(x - 30, y + 70); c.lineTo(x + 39, y + 64); c.closePath(); c.fill(); // заточка
    c.fillStyle = '#2a2420'; c.beginPath(); c.arc(x - 18, y + 18, 6, 0, TAU); c.fill(); // отверстие
    c.fillStyle = 'rgba(140,20,14,.75)'; c.beginPath(); c.moveTo(x + 10, y + 66); c.quadraticCurveTo(x + 6, y + 40, x + 14, y + 30); c.quadraticCurveTo(x + 20, y + 46, x + 24, y + 66); c.fill(); // потёк крови
  }
  function carcass(c, x, y, s) { // туша на крюке: окорок с рёбрами и полоской жира
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#6a1e18'; c.beginPath(); c.moveTo(-10, 0); c.quadraticCurveTo(-46, 40, -40, 120); c.quadraticCurveTo(-30, 170, 0, 180); c.quadraticCurveTo(34, 170, 38, 110); c.quadraticCurveTo(40, 40, 10, 0); c.closePath(); c.fill();
    c.strokeStyle = '#d8c0a8'; c.lineWidth = 5; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-30, 50 + i * 22); c.quadraticCurveTo(-4, 44 + i * 22, 14, 56 + i * 22); c.stroke(); } // рёбра
    c.fillStyle = '#e8d6bc'; c.beginPath(); c.moveTo(22, 20); c.quadraticCurveTo(44, 90, 30, 160); c.lineTo(22, 158); c.quadraticCurveTo(32, 90, 14, 24); c.fill(); // жир
    c.restore();
  }
  function butcherFig(c, x, y, s, t, o) { // Мясник: громада в фартуке, тесак, цепь с крюком
    o = o || {};
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = o.fill || '#2a1e18';
    c.beginPath(); c.moveTo(-58, 0); c.quadraticCurveTo(-78, -90, -72, -150); c.quadraticCurveTo(-70, -205, -24, -222); c.quadraticCurveTo(0, -214, 24, -222); c.quadraticCurveTo(70, -205, 72, -150); c.quadraticCurveTo(78, -90, 58, 0); c.closePath(); c.fill(); // сгорбленная туша
    c.fillStyle = '#5a1e16'; c.beginPath(); c.moveTo(-40, -4); c.quadraticCurveTo(-52, -90, -34, -158); c.lineTo(34, -158); c.quadraticCurveTo(52, -90, 40, -4); c.closePath(); c.fill(); // фартук
    c.strokeStyle = '#5a1e16'; c.lineWidth = 7; c.beginPath(); c.moveTo(-30, -156); c.lineTo(-14, -214); c.moveTo(30, -156); c.lineTo(14, -214); c.stroke(); // лямки
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-36, -100); c.quadraticCurveTo(0, -92, 36, -100); c.stroke(); // завязки
    c.fillStyle = 'rgba(150,24,18,.7)'; [[-14, -110, 18], [20, -70, 24], [-24, -40, 14], [8, -130, 10]].forEach(([px, py, r]) => { c.beginPath(); c.ellipse(px, py, r, r * 1.4, 0.3, 0, TAU); c.fill(); }); // пятна
    c.fillStyle = o.fill || '#2a1e18'; c.beginPath(); c.ellipse(0, -232, 30, 30, 0, 0, TAU); c.fill(); // голова, втянутая в плечи
    c.fillStyle = '#8a6a58'; c.beginPath(); c.ellipse(0, -228, 22, 22, 0, 0, TAU); c.fill(); // лицо
    eyesPair(c, 0, -234, 0.8, o.eyes == null ? 1 : o.eyes);
    c.strokeStyle = '#1a0f0a'; c.lineWidth = 3; c.beginPath(); c.moveTo(-10, -214); c.lineTo(10, -214); c.stroke();
    // правая рука с тесаком: поднимается и опускается
    const ch = o.chop == null ? 0 : o.chop;
    c.save(); c.translate(64, -180); c.rotate(-1.2 + ch * 1.6);
    c.fillStyle = o.fill || '#2a1e18'; c.fillRect(-12, 0, 24, 110);
    c.fillStyle = '#5a3420'; c.fillRect(-7, 96, 14, 44); // рукоять
    cleaver(c, -10, 136);
    c.restore();
    c.fillStyle = o.fill || '#2a1e18'; c.save(); c.translate(-64, -180); c.rotate(0.35); c.fillRect(-12, 0, 24, 110); c.restore(); // левая рука (держит цепь)
    c.restore();
  }
  function chain(c, x0, y0, x1, y1, sag, t) { // провисшая цепь звеньями и крюк на конце
    c.save(); c.strokeStyle = '#8a8e92'; c.lineWidth = 5;
    for (let i = 0; i < 18; i++) {
      const p = i / 18, mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
      const x = (1 - p) * (1 - p) * x0 + 2 * (1 - p) * p * mx + p * p * x1, y = (1 - p) * (1 - p) * y0 + 2 * (1 - p) * p * my + p * p * y1;
      c.beginPath(); c.ellipse(x, y, 9, 5, i % 2 ? 0.6 : -0.6, 0, TAU); c.stroke();
    }
    c.strokeStyle = '#a8acb0'; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.arc(x1, y1 + 30, 30, -Math.PI / 2, Math.PI * 0.9); c.stroke(); // крюк
    c.restore();
  }
  S.m8_start = (c, t) => { // полдень над рынком: выгоревшие навесы, марево, мухи, в глубине — тень с тесаком
    sky(c, [[0, '#e8e4d4'], [0.45, '#d8ccb0'], [1, '#8a7a5e']]);
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 800, 40, 520, 'rgba(255,250,220,A)', 0.55); c.restore(); // солнце в зените
    c.fillStyle = '#a89878'; c.fillRect(0, 520, W, 380); // площадь
    // дальние ряды: навесы и тёмный проём мясного ряда
    c.fillStyle = '#5a4a38'; c.fillRect(560, 300, 480, 220); c.fillStyle = '#1a120c'; c.fillRect(640, 360, 320, 160);
    awning(c, 540, 270, 520, 50, '#c8b8a0', '#a85848');
    const ch = (Math.sin(t * 2.4) + 1) / 2; butcherFig(c, 800, 520, 0.62, t, { fill: '#100a08', eyes: 0, chop: ch }); // силуэт в глубине
    if (ch > 0.95) { c.fillStyle = 'rgba(232,220,192,.9)'; c.font = "900 44px Impact, sans-serif"; c.textAlign = 'center'; c.fillText('ТУК', 930, 350); }
    [[60, 340, 420], [1120, 340, 420]].forEach(([x, y, w]) => { c.fillStyle = '#6a5a44'; c.fillRect(x, y + 40, w, 200); awning(c, x - 20, y, w + 40, 60, '#d8ccb4', '#5a7a9a'); }); // боковые прилавки
    // зазывала посреди площади: хрипит, мертвецы поворачивают головы
    walker(c, 800, 760, 2.1, t, { fill: '#2a2018' });
    c.fillStyle = '#c86a5a'; c.fillRect(780, 640, 40, 70); // фартук торговки
    for (let k = 0; k < 3; k++) { const p = (t * 0.7 + k / 3) % 1; c.strokeStyle = `rgba(60,40,30,${0.5 * (1 - p)})`; c.lineWidth = 4; c.beginPath(); c.arc(830, 535, 20 + p * 90, -0.8, 0.8); c.stroke(); } // хрип
    [[300, 800, 1.7, 0], [480, 780, 1.5, 0], [1180, 800, 1.7, 1], [1360, 790, 1.5, 1]].forEach(([x, y, s, f], i) => walker(c, x, y, s, t, { ph: i, flip: !f, fill: '#2a2018' }));
    flies(c, 800, 600, 260, t, 26); flies(c, 300, 600, 120, t + 3, 10); flies(c, 1300, 600, 120, t + 5, 10);
    // марево
    c.save(); c.globalAlpha = 0.12; c.strokeStyle = '#fff'; c.lineWidth = 3; for (let i = 0; i < 8; i++) { c.beginPath(); for (let x = 0; x <= W; x += 40) c.lineTo(x, 520 + i * 12 + Math.sin(x * 0.02 + t * 3 + i) * 4); c.stroke(); } c.restore();
    tex(c, '#3a2a1a', 0.12); vignette(c, 0.35); grain(c, t); frame(c);
  };
  S.m8_butcher = (c, t) => { // Мясник выходит из-под навеса: цепь с крюком волочится, искры, вокруг безразличные мертвецы
    sky(c, [[0, '#d8ccb0'], [1, '#7a6a50']]);
    c.fillStyle = '#9a8a6a'; c.fillRect(0, 700, W, 200);
    c.fillStyle = '#3a2a1e'; c.fillRect(0, 120, W, 40); for (let i = 0; i < 7; i++) { const x = 120 + i * 230, sw = Math.sin(t * 0.8 + i) * 0.06; c.save(); c.translate(x, 160); c.rotate(sw); c.strokeStyle = '#8a8e92'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 50); c.stroke(); c.lineWidth = 5; c.beginPath(); c.arc(0, 62, 12, -Math.PI / 2, Math.PI * 0.8); c.stroke(); carcass(c, 0, 66, 0.9); c.restore(); } // туши на крюках
    awning(c, 0, 80, W, 50, '#c8b8a0', '#a85848');
    [[260, 1.8, 0], [420, 1.6, 1], [1220, 1.7, 1], [1400, 1.9, 0]].forEach(([x, s, f], i) => walker(c, x, 760, s, t, { ph: i, flip: !!f, fill: '#2a2018' }));
    const step = Math.sin(t * 1.2) * 10;
    butcherFig(c, 800 + step, 790, 1.9, t, { chop: (Math.sin(t * 1.6) + 1) / 2 });
    chain(c, 800 + step - 122, 500, 520 + step, 760, 80 + Math.sin(t * 2) * 20, t);
    const sp = (t * 1.5) % 1; if (sp < 0.4) { c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i - 4) * 0.25; c.strokeStyle = `rgba(255,${200 - i * 10},80,${1 - sp * 2.5})`; c.lineWidth = 3; c.beginPath(); c.moveTo(520 + step, 820); c.lineTo(520 + step + Math.cos(a) * (40 + sp * 160), 820 + Math.sin(a) * (40 + sp * 120)); c.stroke(); } c.restore(); } // искры от крюка
    flies(c, 800, 480, 160, t, 18);
    tex(c, '#2a1a10', 0.14); vignette(c, 0.5); grain(c, t); frame(c);
  };
  S.m8_blood = (c, t) => { // кровь тянется к Мяснику со всех сторон, раны стягиваются; пульс
    sky(c, [[0, '#2a0c0a'], [1, '#0a0303']]);
    const beat = Math.pow(Math.max(0, Math.sin(t * 3.2)), 8);
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 800, 520, 480 + beat * 80, 'rgba(200,30,20,A)', 0.35 + beat * 0.3); c.restore();
    for (let i = 0; i < 14; i++) { // струйки крови текут к нему по земле
      const a = i * TAU / 14 + 0.2, r0 = 760;
      c.strokeStyle = 'rgba(150,20,14,.8)'; c.lineWidth = 7; c.beginPath();
      for (let k = 0; k <= 20; k++) { const p = k / 20, r = r0 * (1 - p) + 60; c.lineTo(800 + Math.cos(a + Math.sin(p * 6 + i) * 0.06) * r, 760 + Math.sin(a) * r * 0.22); }
      c.stroke();
      const p = (t * 0.35 + i / 14) % 1, r = r0 * (1 - p) + 60; c.fillStyle = '#e04030'; c.beginPath(); c.arc(800 + Math.cos(a) * r, 760 + Math.sin(a) * r * 0.22, 8, 0, TAU); c.fill();
    }
    [[260, 1], [1340, 0]].forEach(([x, f]) => { c.save(); c.translate(x, 800); c.rotate(f ? 1.45 : -1.45); walker(c, 0, 0, 1.6, 0, { fill: '#1a0806' }); c.restore(); }); // упавшие рядом
    butcherFig(c, 800, 790, 1.7 + beat * 0.04, t, { fill: '#1a0c08', chop: 0.2 });
    c.fillStyle = PAPER; c.font = "900 64px Impact, sans-serif"; c.textAlign = 'center'; c.globalAlpha = 0.85 + beat * 0.15; c.fillText('СВЕЖЕЕ МЯСО', 800, 140); c.globalAlpha = 1;
    tex(c, '#000', 0.22); vignette(c, 0.7); grain(c, t); frame(c);
  };
  S.m8_wolves = (c, t) => { // пикап с черепом в облаке пыли; «Волки» спрыгивают с кузова и расходятся цепью
    sky(c, [[0, '#e0d6bc'], [0.55, '#c8b48e'], [1, '#6a5a40']]);
    c.fillStyle = '#7a6a4e'; c.beginPath(); c.moveTo(0, 900); c.lineTo(640, 470); c.lineTo(960, 470); c.lineTo(W, 900); c.fill(); // дорога
    c.strokeStyle = 'rgba(232,220,192,.5)'; c.lineWidth = 8; c.setLineDash([40, 40]); c.lineDashOffset = -t * 160; c.beginPath(); c.moveTo(800, 470); c.lineTo(800, 900); c.stroke(); c.setLineDash([]);
    smoke(c, 800, 560, t, { n: 18, h: 260, spread: 300, r: 160, color: 'rgba(200,180,140,A)', a: 0.2, speed: 0.12, sway: 80 }); // пыль
    const bob = Math.sin(t * 9) * 3, vy = 600 + bob;
    c.fillStyle = '#2a2a26'; c.fillRect(620, vy - 120, 360, 130); c.fillRect(680, vy - 210, 240, 100); // кабина и кузов
    c.fillStyle = '#3a4048'; c.fillRect(700, vy - 196, 200, 60); // стекло
    c.fillStyle = '#e8e0d0'; c.beginPath(); c.ellipse(800, vy - 70, 44, 40, 0, 0, TAU); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(784, vy - 76, 10, 0, TAU); c.arc(816, vy - 76, 10, 0, TAU); c.fill(); c.fillRect(788, vy - 50, 24, 10); // череп на капоте
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 660, vy - 40, 60, 'rgba(255,240,200,A)', 0.5); glow(c, 940, vy - 40, 60, 'rgba(255,240,200,A)', 0.5); c.restore(); // фары днём
    c.fillStyle = INK; c.beginPath(); c.arc(670, vy + 14, 30, 0, TAU); c.arc(930, vy + 14, 30, 0, TAU); c.fill();
    const j = (t * 0.6) % 1; // прыгает с кузова
    bandit(c, 640 - j * 200, vy - 120 + Math.sin(j * Math.PI) * -60 + j * 220, 1.6, t, { flip: 1 });
    [[300, 820, 1.9, 1], [480, 760, 1.6, 1], [1120, 760, 1.6, 0], [1300, 820, 1.9, 0]].forEach(([x, y, s, f], i) => bandit(c, x + Math.sin(t * 0.6 + i) * 10 * (f ? -1 : 1), y, s, t, { flip: f }));
    tex(c, '#3a2a1a', 0.14); vignette(c, 0.45); grain(c, t); frame(c);
  };
  S.m8_butcher_dead = (c, t) => { // проломленный прилавок, тесак в колоде, цепь на земле, мухи в столбе солнца
    sky(c, [[0, '#cfc2a4'], [1, '#6a5a44']]);
    c.fillStyle = '#8a7a5c'; c.fillRect(0, 640, W, 260);
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,250,220,.18)'; c.beginPath(); c.moveTo(620, 0); c.lineTo(900, 0); c.lineTo(1100, 900); c.lineTo(560, 900); c.fill(); c.restore(); // столб солнца сквозь прореху в навесе
    awning(c, 0, 40, 600, 50, '#c8b8a0', '#a85848'); awning(c, 940, 40, 660, 50, '#c8b8a0', '#a85848');
    // проломленный прилавок
    c.fillStyle = '#5a3e28'; c.save(); c.translate(560, 640); c.rotate(0.18); c.fillRect(0, -30, 260, 30); c.restore(); c.save(); c.translate(1080, 640); c.rotate(-0.22); c.fillRect(-260, -30, 260, 30); c.restore();
    c.fillStyle = '#3a2618'; c.fillRect(560, 640, 20, 120); c.fillRect(1060, 640, 20, 120);
    // Мясник лицом в обломках: горб спины, лямки фартука, свисающая рука
    c.fillStyle = '#2a1e18'; c.beginPath(); c.moveTo(600, 700); c.quadraticCurveTo(640, 560, 820, 548); c.quadraticCurveTo(1000, 560, 1040, 700); c.closePath(); c.fill();
    c.strokeStyle = '#5a1e16'; c.lineWidth = 12; c.beginPath(); c.moveTo(740, 560); c.lineTo(780, 700); c.moveTo(900, 560); c.lineTo(860, 700); c.stroke(); c.lineWidth = 8; c.beginPath(); c.moveTo(700, 630); c.quadraticCurveTo(820, 612, 940, 630); c.stroke();
    c.fillStyle = '#2a1e18'; c.beginPath(); c.ellipse(1010, 610, 46, 40, 0.3, 0, TAU); c.fill(); // затылок
    c.save(); c.translate(620, 640); c.rotate(0.3); c.fillStyle = '#2a1e18'; c.fillRect(-20, 0, 40, 130); c.fillStyle = '#8a6a58'; c.beginPath(); c.ellipse(0, 140, 24, 18, 0, 0, TAU); c.fill(); c.restore(); // рука свесилась с прилавка
    c.fillStyle = 'rgba(130,18,12,.8)'; c.beginPath(); c.ellipse(820, 790, 260, 36, 0, 0, TAU); c.fill(); // лужа
    // колода с тесаком
    c.fillStyle = '#6a4a30'; c.fillRect(1260, 560, 180, 160); c.fillStyle = '#8a6a48'; c.beginPath(); c.ellipse(1350, 560, 90, 24, 0, 0, TAU); c.fill();
    c.save(); c.translate(1350, 556); c.rotate(-0.12); c.fillStyle = '#5a3420'; c.fillRect(-8, -150, 16, 64); cleaver(c, 10, -90); c.restore(); // тесак в колоде
    chain(c, 360, 680, 220, 700, 30, t);
    flies(c, 820, 600, 160, t, 30); flies(c, 1350, 470, 60, t + 2, 8);
    tex(c, '#2a1a10', 0.14); vignette(c, 0.45); grain(c, t); frame(c);
  };
  S.epilogue = (c, t) => { // рассвет поднимается над пригородом, крошечная «буханка», длинные тени, вдали костёр
    const rise = Math.min(1, (t % 30) / 18);
    sky(c, [[0, `rgb(${40 + rise * 60},${44 + rise * 50},${60 + rise * 40})`], [0.55, `rgb(${120 + rise * 100},${90 + rise * 70},${70 + rise * 40})`], [1, '#1a1612']]);
    const sy = 640 - rise * 260; c.save(); c.globalCompositeOperation = 'lighter'; glow(c, W / 2, sy, 600, 'rgba(255,200,140,A)', 0.4 * rise + 0.1); c.restore();
    c.fillStyle = '#f0e0c0'; c.beginPath(); c.arc(W / 2, sy, 70, 0, TAU); c.fill();
    c.fillStyle = '#1a1612'; for (let i = 0; i < 14; i++) { const x = i * 120 - 20, h = 80 + (i * 37 % 90); c.fillRect(x, 600 - h, 100, h); c.beginPath(); c.moveTo(x - 10, 600 - h); c.lineTo(x + 50, 560 - h); c.lineTo(x + 110, 600 - h); c.fill(); } // пригород
    c.fillStyle = '#0e0c0a'; c.beginPath(); c.moveTo(0, 900); c.lineTo(760, 600); c.lineTo(840, 600); c.lineTo(W, 900); c.fill();
    const vx = 800 + Math.sin(t * 0.2) * 4; c.fillStyle = INK; c.fillRect(vx - 40, 720, 80, 40); c.fillRect(vx - 30, 700, 60, 24); c.beginPath(); c.arc(vx - 24, 760, 9, 0, TAU); c.arc(vx + 24, 760, 9, 0, TAU); c.fill(); // «буханка»
    c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.moveTo(vx - 40, 760); c.lineTo(vx - 40 - 260 * (1 - rise * 0.5), 900); c.lineTo(vx + 40 - 200 * (1 - rise * 0.5), 900); c.lineTo(vx + 40, 760); c.fill(); // длинная тень
    const fl = 0.6 + Math.sin(t * 9) * 0.2; c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 1420, 590, 50, 'rgba(255,140,60,A)', fl); c.restore(); // костёр колонны вдали
    smoke(c, 1420, 590, t, { n: 8, h: 200, spread: 10, r: 30, color: 'rgba(200,190,180,A)', a: 0.1, speed: 0.15, sway: 20 });
    vignette(c, 0.5); grain(c, t); frame(c);
  };

  // анимация сцен на странице: все canvas.story-scene[data-scene], пока они в документе
  let running = false;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function paint(cv, t) {
    const id = cv.dataset.scene, fn = S[id]; if (!fn) return;
    const c = cv.getContext('2d'), k = cv.width / W;
    c.setTransform(k, 0, 0, k, 0, 0); c.filter = 'none';
    try { fn(c, t); } catch (e) { console.error('scene', id, e); }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  function animate() {
    if (running) return;
    running = true;
    const t0 = performance.now();
    const loop = (now) => {
      const list = [...document.querySelectorAll('canvas.story-scene[data-scene]')].filter((cv) => cv.isConnected && cv.offsetParent !== null && !cv.dataset.paused);
      if (!list.length) { running = false; return; }
      const t = (now - t0) / 1000 + 3;
      list.forEach((cv) => { if (reduce) { if (!cv.dataset.drawn) { paint(cv, 4); cv.dataset.drawn = '1'; } } else paint(cv, t + (+cv.dataset.offset || 0)); });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  G.StoryScenes = { SCENES: S, W, H, paint, animate };
  if (G.ZG) G.ZG.StoryScenes = G.StoryScenes;
})(typeof window !== 'undefined' ? window : globalThis);
