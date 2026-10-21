/*
 * ZG.Art — вся графика, нарисованная кодом.
 *
 * Каждый рисунок — функция draw(ctx, w, h, opts), рисующая в прямоугольнике (0,0,w,h).
 * Чтобы заменить рисунок на спрайт:
 *     ZG.Art.useImage('z_walker', 'img/zombies/walker.png');
 * После загрузки изображение автоматически используется вместо кода.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const draws = Object.create(null);
  const images = Object.create(null);

  const Art = {
    define(key, fn) { draws[key] = fn; },
    has(key) { return !!(draws[key] || images[key]); },
    image(key) { return images[key] || null; },
    useImage(key, url) {
      const img = new Image();
      img.onload = () => { images[key] = img; if (Art.onChange) Art.onChange(key); };
      img.src = url;
    },
    draw(ctx, key, x, y, w, h, opts) {
      ctx.save();
      ctx.translate(x, y);
      const img = images[key];
      if (img) ctx.drawImage(img, 0, 0, w, h);
      else if (draws[key]) draws[key](ctx, w, h, opts || {});
      else draws._missing(ctx, w, h, { key });
      ctx.restore();
    },
    // рисует в 100×100 единицах
    unit(ctx, w, h, fn) {
      ctx.save();
      ctx.scale(w / 100, h / 100);
      fn(ctx);
      ctx.restore();
    },
    canvas(key, w, h, opts, dpr) {
      const c = document.createElement('canvas');
      dpr = dpr || Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = w + 'px'; c.style.height = h + 'px';
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      Art.draw(ctx, key, 0, 0, w, h, opts);
      return c;
    },
  };
  ZG.Art = Art;

  // ---------------------------------------------------------- утилиты ---
  const INK = '#15110e';
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  Art.rr = rr;
  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function fillInk(ctx, color) { ctx.fillStyle = color || INK; ctx.fill(); }
  function strokeInk(ctx, w, color) { ctx.lineWidth = w; ctx.strokeStyle = color || INK; ctx.stroke(); }
  // детерминированный шум для текстур
  function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  Art.hash = hash;

  // фон карточной иллюстрации: градиент масти + полутон + виньетка
  function cardBg(ctx, w, h, color, dark) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 2, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    g.addColorStop(0, color);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    const step = Math.max(4, w / 22);
    for (let y = 0; y < h + step; y += step) {
      for (let x = (y / step) % 2 ? step / 2 : 0; x < w + step; x += step) {
        const r = step * 0.18 * (0.4 + y / h);
        circle(ctx, x, y, r); ctx.fill();
      }
    }
    // лучи
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.arc(w / 2, h / 2, Math.max(w, h), a, a + 0.12);
      ctx.fill();
    }
    ctx.restore();
  }
  Art.cardBg = cardBg;

  function iconArt(paint) {
    return (ctx, w, h, o) => {
      const s = ZG.SUITS[o.suit || 'none'] || ZG.SUITS.none;
      if (!o.noBg) cardBg(ctx, w, h, o.bg || s.color, o.bgDark || s.dark);
      const size = Math.min(w, h);
      ctx.save();
      ctx.translate((w - size) / 2, (h - size) / 2);
      Art.unit(ctx, size, size, (c) => {
        // тень-подложка
        c.save();
        c.translate(2.5, 3);
        c.globalAlpha = 0.35;
        paint(c, { shadow: true, ink: '#000' });
        c.restore();
        paint(c, { ink: INK });
      });
      ctx.restore();
    };
  }

  // ------------------------------------------------------- иконки карт ---
  const ICONS = {
    fist(c, o) {
      rr(c, 28, 34, 46, 38, 10); fillInk(c, o.ink);
      for (let i = 0; i < 4; i++) { rr(c, 29 + i * 11, 26, 11, 16, 5); fillInk(c, o.ink); }
      rr(c, 18, 44, 16, 22, 7); fillInk(c, o.ink);
      rr(c, 34, 70, 34, 16, 4); fillInk(c, o.ink);
      if (!o.shadow) { c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(29 + i * 11, 30); c.lineTo(29 + i * 11, 40); c.stroke(); } }
    },
    boot(c, o) {
      poly(c, [34, 16, 56, 16, 56, 58, 82, 66, 86, 80, 30, 80, 30, 60]); fillInk(c, o.ink);
      rr(c, 28, 80, 60, 7, 2); fillInk(c, o.ink);
      if (!o.shadow) { c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 2; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(38, 26 + i * 8); c.lineTo(52, 26 + i * 8); c.stroke(); } }
      speedLines(c, o, 10, 30);
    },
    step(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.4); c.translate(-50, -50);
      poly(c, [40, 22, 58, 22, 58, 56, 78, 62, 80, 74, 36, 74, 36, 58]); fillInk(c, o.ink);
      c.restore();
      for (let i = 0; i < 3; i++) { c.globalAlpha = o.shadow ? 0.35 : 0.5 - i * 0.12; circle(c, 22 - i * 4, 78 - i * 14, 4); fillInk(c, o.ink); }
      c.globalAlpha = 1;
    },
    eye(c, o) {
      c.beginPath(); c.moveTo(10, 50); c.quadraticCurveTo(50, 12, 90, 50); c.quadraticCurveTo(50, 88, 10, 50); fillInk(c, o.ink);
      if (!o.shadow) { circle(c, 50, 50, 17); c.fillStyle = '#e8dcc0'; c.fill(); circle(c, 50, 50, 9); fillInk(c); circle(c, 45, 45, 3.5); c.fillStyle = '#fff'; c.fill(); }
    },
    shield(c, o) {
      c.beginPath(); c.moveTo(50, 12); c.lineTo(82, 24); c.quadraticCurveTo(82, 66, 50, 88); c.quadraticCurveTo(18, 66, 18, 24); c.closePath(); fillInk(c, o.ink);
      if (!o.shadow) { c.beginPath(); c.moveTo(50, 22); c.lineTo(72, 30); c.quadraticCurveTo(72, 62, 50, 78); c.closePath(); c.fillStyle = 'rgba(255,255,255,.18)'; c.fill(); }
    },
    sledge(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.7); c.translate(-50, -50);
      rr(c, 46, 30, 8, 62, 3); fillInk(c, o.ink);
      rr(c, 24, 14, 52, 22, 3); fillInk(c, o.ink);
      if (!o.shadow) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(26, 16, 48, 5); }
      c.restore();
      impact(c, o, 80, 22);
    },
    ram(c, o) {
      c.beginPath(); c.moveTo(14, 70); c.quadraticCurveTo(30, 36, 62, 40); c.lineTo(62, 26); c.lineTo(88, 50); c.lineTo(62, 74); c.lineTo(62, 60); c.quadraticCurveTo(36, 58, 14, 70); fillInk(c, o.ink);
      speedLines(c, o, 6, 40);
    },
    stance(c, o) {
      ICONS.shield(c, o);
      if (!o.shadow) { c.fillStyle = '#e8dcc0'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('3', 50, 62); }
    },
    roar(c, o) {
      circle(c, 34, 50, 18); fillInk(c, o.ink);
      c.beginPath(); c.moveTo(40, 40); c.lineTo(58, 32); c.lineTo(58, 68); c.lineTo(40, 60); fillInk(c, o.ink);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(56, 50, 14 + i * 10, -0.7, 0.7); strokeInk(c, 5, o.ink); }
    },
    scalpel(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.8); c.translate(-50, -50);
      rr(c, 46, 44, 8, 46, 3); fillInk(c, o.ink);
      c.beginPath(); c.moveTo(46, 44); c.lineTo(54, 44); c.lineTo(54, 20); c.quadraticCurveTo(50, 8, 46, 22); fillInk(c, o.shadow ? o.ink : '#d8dde0');
      c.restore();
    },
    bandage(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.6); c.translate(-50, -50);
      rr(c, 16, 38, 68, 24, 10); fillInk(c, o.shadow ? o.ink : '#efe9dc');
      if (!o.shadow) { rr(c, 40, 38, 20, 24, 2); c.fillStyle = '#d9cdb0'; c.fill(); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { circle(c, 45 + i * 5, 45 + j * 9, 1.2); fillInk(c, '#8b7d60'); } }
      c.restore();
      if (!o.shadow) { c.fillStyle = '#c0392b'; c.fillRect(70, 12, 6, 18); c.fillRect(64, 18, 18, 6); }
    },
    syringe(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.8); c.translate(-50, -50);
      rr(c, 40, 30, 20, 44, 3); fillInk(c, o.ink);
      if (!o.shadow) { rr(c, 43, 46, 14, 25, 2); c.fillStyle = '#e0a83a'; c.fill(); }
      c.fillStyle = o.ink; c.fillRect(48, 12, 4, 18); c.fillRect(36, 74, 28, 5); c.fillRect(47, 79, 6, 10); c.fillRect(40, 88, 20, 4);
      c.restore();
      zap(c, o, 74, 70);
    },
    brain(c, o) {
      c.beginPath();
      c.arc(38, 44, 18, Math.PI * 0.6, Math.PI * 1.7); c.arc(55, 34, 16, Math.PI * 1.1, Math.PI * 1.9); c.arc(66, 52, 17, Math.PI * 1.5, Math.PI * 0.5); c.arc(48, 64, 16, 0, Math.PI * 0.9); c.closePath();
      fillInk(c, o.ink);
      if (!o.shadow) { c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(50, 22); c.quadraticCurveTo(44, 46, 54, 74); c.stroke(); c.beginPath(); c.moveTo(30, 48); c.quadraticCurveTo(40, 44, 44, 54); c.stroke(); c.beginPath(); c.moveTo(70, 46); c.quadraticCurveTo(60, 50, 60, 62); c.stroke(); }
    },
    silentstep(c, o) {
      ICONS.boot(c, o);
      if (!o.shadow) { c.strokeStyle = '#e8dcc0'; c.lineWidth = 3; c.beginPath(); c.arc(78, 26, 8, -1.2, 1.2); c.stroke(); c.beginPath(); c.arc(78, 26, 15, -1.0, 1.0); c.stroke(); c.fillStyle = '#c0392b'; c.save(); c.translate(78, 26); c.rotate(-0.8); c.fillRect(-18, -2, 36, 4); c.restore(); }
    },
    pebble(c, o) {
      c.beginPath(); c.ellipse(46, 62, 20, 15, -0.3, 0, 7); fillInk(c, o.shadow ? o.ink : '#8a8f96'); strokeInk(c, 3, o.ink);
      if (!o.shadow) { c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(40, 56, 7, 4, -0.3, 0, 7); c.fill(); }
      c.setLineDash([4, 5]); c.beginPath(); c.moveTo(60, 50); c.quadraticCurveTo(76, 18, 90, 22); strokeInk(c, 3, o.ink); c.setLineDash([]);
      for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(84, 22, 8 + i * 7, 0.6, 2.4); strokeInk(c, 2.5, o.shadow ? o.ink : '#e0a83a'); }
    },
    lurk(c, o) {
      // закрытый глаз под капюшоном
      c.beginPath(); c.moveTo(14, 70); c.quadraticCurveTo(14, 16, 50, 12); c.quadraticCurveTo(86, 16, 86, 70); c.quadraticCurveTo(70, 50, 50, 46); c.quadraticCurveTo(30, 50, 14, 70); fillInk(c, o.shadow ? o.ink : '#2a2438'); strokeInk(c, 3, o.ink);
      c.beginPath(); c.moveTo(30, 62); c.quadraticCurveTo(50, 74, 70, 62); strokeInk(c, 4, o.shadow ? o.ink : '#e8dcc0');
      if (!o.shadow) for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(36 + i * 9, 67 + (i % 3 ? 2 : 0)); c.lineTo(34 + i * 9, 74); strokeInk(c, 2, '#e8dcc0'); }
    },
    katana(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.7); c.translate(-50, -50);
      c.beginPath(); c.moveTo(47, 6); c.quadraticCurveTo(58, 34, 54, 66); c.lineTo(46, 66); c.quadraticCurveTo(50, 34, 47, 6); fillInk(c, o.shadow ? o.ink : '#dfe6ea'); strokeInk(c, 2.5, o.ink);
      c.fillStyle = o.shadow ? o.ink : '#c9a227'; c.fillRect(40, 66, 20, 5);
      rr(c, 46, 71, 8, 24, 2); fillInk(c, o.shadow ? o.ink : '#3a1a1a');
      if (!o.shadow) { c.strokeStyle = '#e0c070'; c.lineWidth = 1.5; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(46, 74 + i * 5); c.lineTo(54, 77 + i * 5); c.stroke(); } }
      c.restore();
    },
    smoke(c, o) {
      rr(c, 38, 56, 24, 34, 4); fillInk(c, o.shadow ? o.ink : '#5a6a5a'); strokeInk(c, 3, o.ink);
      c.fillStyle = o.ink; c.fillRect(44, 50, 12, 7);
      if (!o.shadow) { [[50, 34, 14], [34, 26, 11], [64, 22, 12], [48, 14, 9]].forEach(([x, y, r]) => { circle(c, x, y, r); c.fillStyle = 'rgba(210,215,210,.85)'; c.fill(); }); }
    },
    nailgun(c, o) {
      rr(c, 18, 30, 58, 22, 5); fillInk(c, o.shadow ? o.ink : '#e0a83a'); strokeInk(c, 3, o.ink);
      rr(c, 40, 50, 16, 34, 4); fillInk(c, o.ink);
      c.fillStyle = o.ink; c.fillRect(76, 36, 12, 10);
      if (!o.shadow) for (let i = 0; i < 3; i++) { c.fillStyle = '#cfd5d8'; c.fillRect(90 - i * 0, 38 + i * 0, 6, 2); }
    },
    rope(c, o) {
      c.strokeStyle = o.shadow ? o.ink : '#b08a4a'; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(30, 92); c.bezierCurveTo(10, 60, 70, 60, 50, 30); c.stroke();
      c.beginPath(); c.arc(50, 22, 10, 0.4, Math.PI * 1.6); strokeInk(c, 5, o.ink);
      c.beginPath(); c.moveTo(50, 12); c.lineTo(50, 32); strokeInk(c, 5, o.ink);
    },
    brick(c, o) {
      c.save(); c.translate(50, 54); c.rotate(-0.25); rr(c, -30, -14, 60, 28, 3); fillInk(c, o.shadow ? o.ink : '#a0482a'); strokeInk(c, 3, o.ink);
      if (!o.shadow) { c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-30, 0); c.lineTo(30, 0); c.moveTo(-6, -14); c.lineTo(-6, 0); c.moveTo(14, 0); c.lineTo(14, 14); c.stroke(); }
      c.restore(); speedLines(c, o, 6, 30);
    },
    whistle(c, o) {
      c.beginPath(); c.arc(40, 58, 20, 0, 7); fillInk(c, o.shadow ? o.ink : '#c0c6ca'); strokeInk(c, 3, o.ink);
      rr(c, 40, 38, 44, 16, 4); fillInk(c, o.shadow ? o.ink : '#c0c6ca'); strokeInk(c, 3, o.ink);
      if (!o.shadow) { circle(c, 40, 58, 7); fillInk(c); for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(84, 46, 8 + i * 7, -0.9, 0.9); strokeInk(c, 2.5, '#e0a83a'); } }
    },
    canned(c, o) {
      rr(c, 26, 34, 48, 50, 6); fillInk(c, o.shadow ? o.ink : '#9aa4aa'); strokeInk(c, 3, o.ink);
      c.beginPath(); c.ellipse(50, 34, 24, 6, 0, 0, 7); fillInk(c, o.shadow ? o.ink : '#c0c6ca'); strokeInk(c, 2.5, o.ink);
      if (!o.shadow) { c.fillStyle = '#c0392b'; c.fillRect(26, 48, 48, 18); c.fillStyle = '#e8dcc0'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillText('ГОСТ', 50, 61); }
    },
    jackhammer(c, o) {
      rr(c, 40, 20, 20, 50, 4); fillInk(c, o.shadow ? o.ink : '#e0a83a'); strokeInk(c, 3, o.ink);
      c.fillStyle = o.ink; c.fillRect(22, 14, 56, 9); c.fillRect(47, 70, 6, 20);
      poly(c, [44, 90, 56, 90, 50, 98]); fillInk(c, o.ink);
      if (!o.shadow) impact(c, o, 50, 92);
    },
    generator(c, o) {
      rr(c, 16, 36, 68, 44, 6); fillInk(c, o.shadow ? o.ink : '#c0392b'); strokeInk(c, 3, o.ink);
      c.fillStyle = o.ink; c.fillRect(22, 80, 10, 8); c.fillRect(68, 80, 10, 8);
      if (!o.shadow) { circle(c, 38, 58, 11); c.fillStyle = '#333'; c.fill(); zap(c, o, 66, 56); for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(84, 24, 8 + i * 8, -0.6, 0.9); strokeInk(c, 3, '#e0a83a'); } }
    },
    cones(c, o) {
      [[32, 0], [64, 6]].forEach(([x, d]) => { poly(c, [x, 18 + d, x + 16, 86, x - 16, 86]); fillInk(c, o.shadow ? o.ink : '#e8701a'); strokeInk(c, 3, o.ink); if (!o.shadow) { c.fillStyle = '#f0f0f0'; poly(c, [x - 6, 46 + d, x + 6, 46 + d, x + 9, 58 + d, x - 9, 58 + d]); c.fill(); } });
      rr(c, 8, 86, 84, 6, 2); fillInk(c, o.ink);
    },
    rebar(c, o) {
      c.save(); c.translate(50, 50); c.rotate(0.7);
      rr(c, -6, -44, 12, 88, 4); fillInk(c, o.shadow ? o.ink : '#8a5a3a'); strokeInk(c, 2.5, o.ink);
      if (!o.shadow) { c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 2; for (let i = -40; i < 44; i += 8) { c.beginPath(); c.moveTo(-6, i); c.lineTo(6, i + 5); c.stroke(); } }
      c.restore();
    },
    knife(c, o) {
      c.save(); c.translate(50, 50); c.rotate(0.75); c.translate(-50, -50);
      rr(c, 44, 58, 12, 30, 3); fillInk(c, o.ink);
      c.fillStyle = o.ink; c.fillRect(38, 54, 24, 6);
      c.beginPath(); c.moveTo(44, 54); c.lineTo(56, 54); c.lineTo(56, 22); c.lineTo(48, 8); c.lineTo(44, 20); fillInk(c, o.shadow ? o.ink : '#cfd5d8');
      c.restore();
    },
    bottle(c, o) {
      c.save(); c.translate(50, 50); c.rotate(0.5); c.translate(-50, -50);
      rr(c, 38, 40, 24, 46, 6); fillInk(c, o.ink);
      c.fillStyle = o.ink; c.fillRect(44, 22, 12, 20);
      c.restore();
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(28, 30, 8 + i * 8, Math.PI * 0.9, Math.PI * 1.6); strokeInk(c, 4, o.ink); }
    },
    roof(c, o) {
      poly(c, [8, 86, 8, 54, 30, 40, 52, 54, 52, 86]); fillInk(c, o.ink);
      poly(c, [56, 86, 56, 44, 76, 30, 96, 44, 96, 86]); fillInk(c, o.ink);
      if (!o.shadow) {
        c.beginPath(); c.moveTo(28, 34); c.quadraticCurveTo(52, 2, 76, 24); c.setLineDash([5, 5]); strokeInk(c, 3, '#f1e6c8'); c.setLineDash([]);
        circle(c, 30, 30, 6); fillInk(c, '#f1e6c8');
      }
    },
    mask(c, o) {
      c.beginPath(); c.moveTo(14, 36); c.quadraticCurveTo(50, 24, 86, 36); c.quadraticCurveTo(84, 66, 62, 66); c.quadraticCurveTo(50, 58, 38, 66); c.quadraticCurveTo(16, 66, 14, 36); fillInk(c, o.ink);
      if (!o.shadow) { c.beginPath(); c.ellipse(34, 44, 9, 5, 0.1, 0, 7); c.fillStyle = '#e8dcc0'; c.fill(); c.beginPath(); c.ellipse(66, 44, 9, 5, -0.1, 0, 7); c.fill(); }
      c.globalAlpha = 0.5; for (let i = 0; i < 4; i++) { c.fillStyle = o.ink; c.fillRect(20 + i * 18, 74 + (i % 2) * 6, 10, 3); } c.globalAlpha = 1;
    },
    shotgun(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.35); c.translate(-50, -50);
      rr(c, 8, 42, 62, 8, 2); fillInk(c, o.ink); rr(c, 8, 50, 58, 6, 2); fillInk(c, o.ink);
      poly(c, [66, 42, 90, 46, 92, 62, 80, 66, 66, 56]); fillInk(c, o.ink);
      c.restore();
      if (!o.shadow) muzzle(c, 10, 36);
    },
    pistol(c, o) {
      poly(c, [14, 34, 76, 34, 76, 48, 52, 48, 50, 76, 34, 76, 36, 48, 14, 48]); fillInk(c, o.ink);
      if (!o.shadow) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(16, 36, 58, 3); muzzle(c, 10, 41); }
    },
    suppress(c, o) {
      for (let i = 0; i < 4; i++) { rr(c, 10 + i * 6, 22 + i * 16, 56, 5, 2); fillInk(c, o.ink); }
      c.beginPath(); c.arc(74, 54, 16, 0, 7); strokeInk(c, 5, o.ink); c.fillStyle = o.ink; c.fillRect(72, 32, 4, 44); c.fillRect(52, 52, 44, 4);
    },
    butt(c, o) {
      c.save(); c.translate(50, 50); c.rotate(0.6); c.translate(-50, -50);
      rr(c, 44, 8, 10, 52, 2); fillInk(c, o.ink);
      poly(c, [40, 56, 58, 56, 64, 92, 36, 92]); fillInk(c, o.ink);
      c.restore();
      impact(c, o, 22, 76);
    },
    wrench(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.75); c.translate(-50, -50);
      rr(c, 44, 30, 12, 58, 4); fillInk(c, o.ink);
      circle(c, 50, 22, 16); fillInk(c, o.ink);
      if (!o.shadow) { c.save(); c.globalCompositeOperation = 'destination-out'; c.fillRect(44, 4, 12, 18); c.restore(); }
      c.restore();
    },
    trap(c, o) {
      c.beginPath(); c.moveTo(6, 70); c.lineTo(94, 70); c.setLineDash([6, 4]); strokeInk(c, 3, o.ink); c.setLineDash([]);
      rr(c, 34, 46, 32, 24, 4); fillInk(c, o.ink);
      if (!o.shadow) { c.fillStyle = '#c0392b'; circle(c, 50, 58, 5); c.fill(); }
      c.beginPath(); c.moveTo(56, 46); c.quadraticCurveTo(66, 30, 76, 32); strokeInk(c, 3, o.ink);
      if (!o.shadow) { c.fillStyle = '#ffd36b'; poly(c, [76, 22, 80, 30, 88, 28, 82, 34, 86, 42, 78, 36, 72, 42, 74, 34, 66, 30, 75, 30]); c.fill(); }
    },
    gear(c, o) {
      c.save(); c.translate(50, 50);
      for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.fillStyle = o.ink; c.fillRect(-6, -40, 12, 14); }
      circle(c, 0, 0, 28); fillInk(c, o.ink);
      if (!o.shadow) { circle(c, 0, 0, 11); c.fillStyle = 'rgba(255,255,255,.3)'; c.fill(); }
      c.restore();
    },
    weld(c, o) {
      for (let i = 0; i < 3; i++) { rr(c, 10, 22 + i * 22, 80, 12, 2); fillInk(c, o.ink); }
      c.fillStyle = o.ink; c.fillRect(22, 18, 8, 70); c.fillRect(70, 18, 8, 70);
      if (!o.shadow) sparks(c, 52, 40);
    },
    bat(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.8); c.translate(-50, -50);
      c.beginPath(); c.moveTo(46, 92); c.lineTo(54, 92); c.lineTo(58, 30); c.quadraticCurveTo(58, 10, 50, 10); c.quadraticCurveTo(42, 10, 42, 30); c.closePath(); fillInk(c, o.ink);
      if (!o.shadow) { c.strokeStyle = '#9aa0a6'; c.lineWidth = 1.5; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(40, 18 + i * 6); c.lineTo(60, 22 + i * 6); c.stroke(); } }
      c.restore();
      impact(c, o, 80, 22);
    },
    machete(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.8); c.translate(-50, -50);
      rr(c, 44, 64, 12, 28, 3); fillInk(c, o.ink);
      c.beginPath(); c.moveTo(43, 64); c.lineTo(57, 64); c.lineTo(62, 18); c.quadraticCurveTo(56, 6, 46, 12); c.closePath(); fillInk(c, o.shadow ? o.ink : '#bfc6ca');
      c.restore();
      slash(c, o);
    },
    spear(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.8); c.translate(-50, -50);
      rr(c, 47, 26, 6, 70, 2); fillInk(c, o.ink);
      c.beginPath(); c.moveTo(50, 2); c.lineTo(58, 28); c.lineTo(42, 28); c.closePath(); fillInk(c, o.shadow ? o.ink : '#c9ccce');
      c.fillStyle = o.ink; c.fillRect(44, 28, 12, 6);
      c.restore();
    },
    crowbar(c, o) {
      c.beginPath(); c.moveTo(20, 88); c.lineTo(72, 22); c.quadraticCurveTo(80, 10, 88, 18); strokeInk(c, 9, o.ink);
      c.beginPath(); c.moveTo(20, 88); c.lineTo(12, 84); strokeInk(c, 9, o.ink);
    },
    molotov(c, o) {
      rr(c, 36, 40, 28, 48, 8); fillInk(c, o.ink);
      c.fillStyle = o.ink; c.fillRect(44, 22, 12, 20);
      if (!o.shadow) { rr(c, 39, 60, 22, 25, 5); c.fillStyle = '#b36b12'; c.fill(); flame(c, 50, 20, 1); }
    },
    firecracker(c, o) {
      for (let i = 0; i < 3; i++) { rr(c, 28 + i * 14, 40, 12, 44, 3); fillInk(c, o.ink); }
      c.beginPath(); c.moveTo(48, 40); c.quadraticCurveTo(50, 24, 62, 20); strokeInk(c, 2.5, o.ink);
      if (!o.shadow) { c.fillStyle = '#ffd36b'; circle(c, 63, 19, 4); c.fill(); sparks(c, 66, 16); }
    },
    medkit(c, o) {
      rr(c, 16, 30, 68, 50, 6); fillInk(c, o.shadow ? o.ink : '#efe9dc');
      rr(c, 38, 20, 24, 12, 4); strokeInk(c, 5, o.ink);
      if (!o.shadow) { c.fillStyle = '#c0392b'; c.fillRect(44, 40, 12, 30); c.fillRect(35, 49, 30, 12); }
    },
    can(c, o) {
      rr(c, 32, 16, 36, 70, 6); fillInk(c, o.ink);
      if (!o.shadow) { c.fillStyle = '#7ec850'; poly(c, [54, 28, 42, 52, 52, 52, 46, 74, 60, 46, 50, 46]); c.fill(); }
    },
    choco(c, o) {
      rr(c, 22, 18, 56, 66, 4); fillInk(c, o.shadow ? o.ink : '#4a2a16');
      if (!o.shadow) { c.strokeStyle = '#2b170b'; c.lineWidth = 2; for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(22 + i * 18.6, 18); c.lineTo(22 + i * 18.6, 84); c.stroke(); } for (let j = 1; j < 4; j++) { c.beginPath(); c.moveTo(22, 18 + j * 16.5); c.lineTo(78, 18 + j * 16.5); c.stroke(); } c.fillStyle = '#c8a24a'; poly(c, [22, 54, 78, 46, 78, 84, 22, 84]); c.fill(); }
    },
    sneaker(c, o) {
      c.beginPath(); c.moveTo(10, 70); c.quadraticCurveTo(14, 44, 36, 42); c.lineTo(52, 30); c.lineTo(66, 50); c.quadraticCurveTo(88, 54, 92, 70); c.closePath(); fillInk(c, o.ink);
      rr(c, 8, 70, 86, 10, 4); fillInk(c, o.shadow ? o.ink : '#eee');
      speedLines(c, o, 4, 40);
    },
    backpack(c, o) {
      rr(c, 24, 22, 52, 66, 14); fillInk(c, o.ink);
      c.beginPath(); c.arc(50, 22, 12, Math.PI, 0); strokeInk(c, 6, o.ink);
      if (!o.shadow) { rr(c, 32, 56, 36, 24, 6); c.fillStyle = 'rgba(255,255,255,.18)'; c.fill(); }
    },
    vest(c, o) {
      c.beginPath(); c.moveTo(30, 14); c.lineTo(42, 14); c.quadraticCurveTo(50, 28, 58, 14); c.lineTo(70, 14); c.lineTo(82, 34); c.lineTo(76, 88); c.lineTo(24, 88); c.lineTo(18, 34); c.closePath(); fillInk(c, o.ink);
      if (!o.shadow) { c.fillStyle = 'rgba(255,255,255,.18)'; rr(c, 30, 44, 18, 14, 2); c.fill(); rr(c, 52, 44, 18, 14, 2); c.fill(); rr(c, 30, 64, 40, 14, 2); c.fill(); }
    },
    flashlight(c, o) {
      c.save(); c.translate(50, 50); c.rotate(-0.5); c.translate(-50, -50);
      rr(c, 20, 42, 40, 16, 4); fillInk(c, o.ink);
      poly(c, [58, 38, 72, 32, 72, 68, 58, 62]); fillInk(c, o.ink);
      if (!o.shadow) { c.fillStyle = 'rgba(255,240,180,.55)'; poly(c, [72, 32, 100, 14, 100, 86, 72, 68]); c.fill(); }
      c.restore();
    },
    ambush(c, o) {
      zombieHead(c, o, 50, 52, 30);
      if (!o.shadow) { c.fillStyle = '#ffd36b'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.fillText('!', 84, 30); }
    },
    wound(c, o) {
      c.beginPath(); c.moveTo(18, 30); c.lineTo(82, 70); strokeInk(c, 10, o.shadow ? o.ink : '#5a0d08');
      c.beginPath(); c.moveTo(30, 22); c.lineTo(76, 82); strokeInk(c, 6, o.shadow ? o.ink : '#5a0d08');
      if (!o.shadow) for (let i = 0; i < 9; i++) { circle(c, 20 + hash(i) * 60, 30 + hash(i + 9) * 50, 2 + hash(i + 3) * 4); fillInk(c, '#8e140c'); }
    },
    infection(c, o) {
      // знак биоопасности: три серпа вокруг кольца
      const col = o.shadow ? o.ink : '#9be04a';
      for (let i = 0; i < 3; i++) {
        c.save(); c.translate(50, 52); c.rotate(i * Math.PI * 2 / 3);
        c.beginPath(); c.arc(0, -20, 19, 0, Math.PI * 2); c.arc(0, -27, 12, 0, Math.PI * 2, true); fillInk(c, col);
        c.restore();
      }
      circle(c, 50, 52, 16); c.lineWidth = 6; c.strokeStyle = col; c.stroke();
      if (!o.shadow) { circle(c, 50, 52, 6); fillInk(c, INK); for (let i = 0; i < 7; i++) { circle(c, 18 + hash(i + 40) * 64, 14 + hash(i + 50) * 74, 1.5 + hash(i + 60) * 3); fillInk(c, '#6fa830'); } }
    },
    cargo_fuel(c, o) {
      poly(c, [24, 26, 66, 26, 78, 38, 78, 88, 24, 88]); fillInk(c, o.shadow ? o.ink : '#a31f14');
      if (!o.shadow) { c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(26, 30); c.lineTo(76, 86); c.moveTo(76, 40); c.lineTo(26, 86); c.stroke(); }
      rr(c, 30, 12, 26, 12, 3); strokeInk(c, 5, o.ink);
      c.fillStyle = o.ink; c.fillRect(64, 14, 8, 14);
    },
    cargo_radio(c, o) {
      rr(c, 22, 32, 56, 56, 6); fillInk(c, o.ink);
      c.fillStyle = o.ink; c.fillRect(62, 6, 5, 28);
      if (!o.shadow) { rr(c, 30, 40, 40, 16, 2); c.fillStyle = '#7ec850'; c.fill(); for (let i = 0; i < 3; i++) { circle(c, 36 + i * 14, 72, 5); c.fillStyle = '#c9b78f'; c.fill(); } }
    },
    cargo_meds(c, o) {
      rr(c, 18, 28, 64, 56, 6); fillInk(c, o.shadow ? o.ink : '#f2efe6');
      if (!o.shadow) { c.fillStyle = '#2d6fb5'; c.fillRect(18, 28, 64, 12); c.fillStyle = '#c0392b'; c.fillRect(44, 48, 12, 30); c.fillRect(35, 57, 30, 12); }
    },
  };

  // декоративные помощники
  function speedLines(c, o, x, y) { c.globalAlpha = o.shadow ? 0 : 0.6; for (let i = 0; i < 3; i++) { c.fillStyle = o.ink; c.fillRect(x, y + i * 12, 16 - i * 3, 3); } c.globalAlpha = 1; }
  function impact(c, o, x, y) { if (o.shadow) return; c.fillStyle = '#ffd36b'; c.save(); c.translate(x, y); for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.fillRect(-1.5, 6, 3, 9); } c.restore(); }
  function zap(c, o, x, y) { if (o.shadow) return; c.fillStyle = '#ffd36b'; poly(c, [x, y - 14, x - 8, y + 2, x - 1, y + 2, x - 5, y + 16, x + 7, y - 2, x, y - 2]); c.fill(); }
  function slash(c, o) { if (o.shadow) return; c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2; c.beginPath(); c.arc(30, 70, 40, -1.2, -0.3); c.stroke(); }
  function sparks(c, x, y) { c.fillStyle = '#ffd36b'; for (let i = 0; i < 10; i++) { const a = hash(i) * 6.28, r = 6 + hash(i + 4) * 14; c.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.5, 2.5); } }
  function muzzle(c, x, y) { c.fillStyle = '#ffd36b'; poly(c, [x, y, x - 8, y - 8, x - 4, y - 1, x - 12, y + 2, x - 4, y + 4, x - 8, y + 11]); c.fill(); }
  function flame(c, x, y, s) {
    c.fillStyle = '#ff8a1c'; c.beginPath(); c.moveTo(x, y - 18 * s); c.quadraticCurveTo(x + 12 * s, y, x, y + 6 * s); c.quadraticCurveTo(x - 12 * s, y, x, y - 18 * s); c.fill();
    c.fillStyle = '#ffd36b'; c.beginPath(); c.moveTo(x, y - 9 * s); c.quadraticCurveTo(x + 6 * s, y, x, y + 4 * s); c.quadraticCurveTo(x - 6 * s, y, x, y - 9 * s); c.fill();
  }
  Art.flame = flame;
  function zombieHead(c, o, x, y, r) {
    circle(c, x, y, r); fillInk(c, o.shadow ? o.ink : '#6f8f4e');
    if (o.shadow) return;
    c.fillStyle = INK; circle(c, x - r * 0.38, y - r * 0.1, r * 0.2); c.fill(); circle(c, x + r * 0.38, y - r * 0.1, r * 0.2); c.fill();
    c.fillStyle = '#e5d34d'; circle(c, x - r * 0.38, y - r * 0.1, r * 0.08); c.fill(); circle(c, x + r * 0.38, y - r * 0.1, r * 0.08); c.fill();
    c.fillStyle = INK; rr(c, x - r * 0.4, y + r * 0.35, r * 0.8, r * 0.25, 3); c.fill();
    c.fillStyle = '#e8dcc0'; for (let i = 0; i < 4; i++) c.fillRect(x - r * 0.35 + i * r * 0.2, y + r * 0.35, r * 0.1, r * 0.12);
    c.strokeStyle = '#3f5a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - r * 0.6, y - r * 0.6); c.lineTo(x - r * 0.2, y - r * 0.45); c.stroke();
  }
  Art.zombieHead = zombieHead;

  Object.keys(ICONS).forEach((k) => Art.define(k, iconArt(ICONS[k])));

  // ------------------------------------------- значки базовых действий ---
  const ACT = {
    search(c, o) { circle(c, 44, 42, 20); strokeInk(c, 9, o.ink); c.beginPath(); c.moveTo(58, 56); c.lineTo(78, 76); strokeInk(c, 13, o.ink); if (!o.shadow) { circle(c, 44, 42, 14); c.fillStyle = 'rgba(200,230,255,.35)'; c.fill(); } },
    punch: ICONS.fist,
    barricade(c, o) { for (let i = 0; i < 3; i++) { c.save(); c.translate(50, 30 + i * 20); c.rotate((i - 1) * 0.12); rr(c, -38, -7, 76, 14, 3); fillInk(c, o.shadow ? o.ink : ['#a07a42', '#8a6a3a', '#a07a42'][i]); strokeInk(c, 3, o.ink); c.restore(); } c.fillStyle = o.ink; c.fillRect(26, 18, 6, 64); c.fillRect(68, 18, 6, 64); },
    give(c, o) { c.beginPath(); c.moveTo(12, 40); c.lineTo(62, 40); c.lineTo(62, 28); c.lineTo(86, 48); c.lineTo(62, 68); c.lineTo(62, 56); c.lineTo(12, 56); c.closePath(); fillInk(c, o.ink); if (!o.shadow) { rr(c, 18, 70, 26, 18, 3); c.fillStyle = '#e8dcc0'; c.fill(); strokeInk(c, 2.5); } },
    rest(c, o) { c.beginPath(); c.moveTo(50, 84); c.bezierCurveTo(10, 56, 14, 22, 36, 22); c.bezierCurveTo(44, 22, 50, 30, 50, 34); c.bezierCurveTo(50, 30, 56, 22, 64, 22); c.bezierCurveTo(86, 22, 90, 56, 50, 84); fillInk(c, o.shadow ? o.ink : '#c0392b'); strokeInk(c, 4, o.ink); if (!o.shadow) { c.strokeStyle = '#fff'; c.lineWidth = 4; c.beginPath(); c.moveTo(24, 50); c.lineTo(38, 50); c.lineTo(44, 40); c.lineTo(52, 62); c.lineTo(58, 50); c.lineTo(76, 50); c.stroke(); } },
    heal(c, o) { rr(c, 38, 14, 24, 72, 4); fillInk(c, o.shadow ? o.ink : '#e8e8e8'); strokeInk(c, 4, o.ink); rr(c, 14, 38, 72, 24, 4); fillInk(c, o.shadow ? o.ink : '#e8e8e8'); strokeInk(c, 4, o.ink); if (!o.shadow) { c.fillStyle = '#c0392b'; c.fillRect(41, 17, 18, 66); c.fillRect(17, 41, 66, 18); } },
    cleanse(c, o) {
      // шприц с антидотом
      c.save(); c.translate(50, 50); c.rotate(-Math.PI / 4);
      rr(c, -10, -34, 20, 52, 4); fillInk(c, o.shadow ? o.ink : '#dfe9ee'); strokeInk(c, 4, o.ink);
      if (!o.shadow) { c.fillStyle = '#9be04a'; c.fillRect(-7, -8, 14, 23); }
      c.fillStyle = o.ink; c.fillRect(-16, -40, 32, 7); c.fillRect(-3, -50, 6, 12); c.fillRect(-1.5, 18, 3, 26);
      c.restore();
    },
    door(c, o) {
      rr(c, 26, 10, 48, 82, 3); fillInk(c, o.shadow ? o.ink : '#7a542c'); strokeInk(c, 4, o.ink);
      if (!o.shadow) { c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3; rr(c, 33, 18, 34, 28, 2); c.stroke(); rr(c, 33, 54, 34, 30, 2); c.stroke(); circle(c, 64, 52, 4); fillInk(c, '#e0c070'); }
    },
    plug(c, o) { circle(c, 50, 54, 34); fillInk(c, o.shadow ? o.ink : '#5a5a5a'); strokeInk(c, 4, o.ink); if (!o.shadow) { c.strokeStyle = '#2a2a2a'; c.lineWidth = 3; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(26, 54 + i * 9); c.lineTo(74, 54 + i * 9); c.stroke(); } } c.save(); c.translate(50, 30); c.rotate(-0.5); rr(c, -6, -26, 12, 34, 3); fillInk(c, o.shadow ? o.ink : '#e0a83a'); strokeInk(c, 2.5, o.ink); c.restore(); },
    pickup(c, o) { rr(c, 20, 36, 60, 46, 4); fillInk(c, o.shadow ? o.ink : '#9a6a32'); strokeInk(c, 4, o.ink); c.beginPath(); c.moveTo(50, 8); c.lineTo(66, 26); c.lineTo(56, 26); c.lineTo(56, 40); c.lineTo(44, 40); c.lineTo(44, 26); c.lineTo(34, 26); c.closePath(); fillInk(c, o.ink); },
    task(c, o) { poly(c, [50, 8, 61, 38, 94, 39, 68, 59, 77, 91, 50, 72, 23, 91, 32, 59, 6, 39, 39, 38]); fillInk(c, o.shadow ? o.ink : '#f0c040'); strokeInk(c, 4, o.ink); },
    evac(c, o) { c.beginPath(); c.moveTo(50, 8); c.lineTo(80, 42); c.lineTo(62, 42); c.lineTo(62, 88); c.lineTo(38, 88); c.lineTo(38, 42); c.lineTo(20, 42); c.closePath(); fillInk(c, o.shadow ? o.ink : '#6fe08a'); strokeInk(c, 4, o.ink); },
  };
  Object.keys(ACT).forEach((k) => Art.define('act_' + k, (ctx, w, h) => {
    const r = Math.min(w, h) / 2;
    const g = ctx.createRadialGradient(w / 2, h * 0.38, r * 0.1, w / 2, h / 2, r);
    g.addColorStop(0, '#5a4430'); g.addColorStop(1, '#1d1611');
    ctx.beginPath(); ctx.arc(w / 2, h / 2, r * 0.96, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = r * 0.08; ctx.strokeStyle = '#e0a83a'; ctx.stroke();
    ctx.save(); ctx.translate(w * 0.2, h * 0.2);
    Art.unit(ctx, w * 0.6, h * 0.6, (c) => { c.save(); c.translate(2.5, 3); c.globalAlpha = 0.4; ACT[k](c, { shadow: true, ink: '#000' }); c.restore(); ACT[k](c, { ink: '#e8dcc0' }); });
    ctx.restore();
  }));
  Art.ICONS = ICONS;

  Art.define('_missing', (ctx, w, h, o) => {
    cardBg(ctx, w, h, '#555', '#222');
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(h / 8)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(o.key || '?', w / 2, h / 2);
  });

  // ------------------------------------------------------------ масти ---
  Art.define('suit_rage', (ctx, w, h) => Art.unit(ctx, w, h, (c) => {
    poly(c, [50, 6, 62, 36, 94, 38, 68, 58, 78, 92, 50, 72, 22, 92, 32, 58, 6, 38, 38, 36]); c.fillStyle = ZG.SUITS.rage.color; c.fill(); strokeInk(c, 5);
  }));
  Art.define('suit_agility', (ctx, w, h) => Art.unit(ctx, w, h, (c) => {
    poly(c, [58, 4, 20, 56, 46, 56, 38, 96, 82, 40, 54, 40]); c.fillStyle = ZG.SUITS.agility.color; c.fill(); strokeInk(c, 5);
  }));
  Art.define('suit_mind', (ctx, w, h) => Art.unit(ctx, w, h, (c) => {
    poly(c, [50, 4, 94, 50, 50, 96, 6, 50]); c.fillStyle = ZG.SUITS.mind.color; c.fill(); strokeInk(c, 5);
    poly(c, [50, 26, 72, 50, 50, 74, 28, 50]); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
  }));
  Art.define('energy', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    circle(c, 50, 50, 46); c.fillStyle = o.empty ? '#2a2420' : '#e0a83a'; c.fill(); strokeInk(c, 6);
    poly(c, [56, 14, 28, 54, 48, 54, 40, 88, 72, 44, 52, 44]); c.fillStyle = o.empty ? '#4a3f36' : INK; c.fill();
  }));
  Art.define('shieldIcon', (ctx, w, h) => Art.unit(ctx, w, h, (c) => {
    c.beginPath(); c.moveTo(50, 6); c.lineTo(90, 20); c.quadraticCurveTo(90, 68, 50, 96); c.quadraticCurveTo(10, 68, 10, 20); c.closePath(); c.fillStyle = '#8fa3b5'; c.fill(); strokeInk(c, 6);
  }));
  Art.define('noiseIcon', (ctx, w, h) => Art.unit(ctx, w, h, (c) => {
    poly(c, [10, 38, 30, 38, 54, 16, 54, 84, 30, 62, 10, 62]); c.fillStyle = '#e0a83a'; c.fill(); strokeInk(c, 5);
    for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(56, 50, 16 + i * 14, -0.8, 0.8); strokeInk(c, 6, '#e0a83a'); }
  }));
  Art.define('skull', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    c.beginPath(); c.arc(50, 42, 34, Math.PI, 0); c.lineTo(84, 58); c.quadraticCurveTo(76, 66, 70, 66); c.lineTo(70, 84); c.lineTo(30, 84); c.lineTo(30, 66); c.quadraticCurveTo(24, 66, 16, 58); c.closePath();
    c.fillStyle = o.color || '#e8dcc0'; c.fill(); strokeInk(c, 4);
    c.fillStyle = INK; circle(c, 36, 48, 10); c.fill(); circle(c, 64, 48, 10); c.fill(); poly(c, [50, 58, 44, 70, 56, 70]); c.fill();
  }));
  Art.define('star', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    poly(c, [50, 4, 62, 36, 96, 38, 70, 58, 80, 94, 50, 74, 20, 94, 30, 58, 4, 38, 38, 36]); c.fillStyle = o.off ? '#3a332c' : '#f0c040'; c.fill(); strokeInk(c, 4);
  }));

  // ------------------------------------------------------- портреты ---
  function bust(c, skin, body, extra) {
    // плечи
    c.beginPath(); c.moveTo(8, 100); c.quadraticCurveTo(12, 70, 34, 66); c.lineTo(66, 66); c.quadraticCurveTo(88, 70, 92, 100); c.closePath(); c.fillStyle = body; c.fill(); strokeInk(c, 2.5);
    // шея
    c.fillStyle = skin; c.fillRect(42, 56, 16, 14);
    // голова
    c.beginPath(); c.ellipse(50, 42, 19, 23, 0, 0, 7); c.fillStyle = skin; c.fill(); strokeInk(c, 2.5);
    // тени лица
    c.fillStyle = 'rgba(0,0,0,.15)'; c.beginPath(); c.ellipse(57, 46, 10, 18, 0, -1.4, 1.6); c.fill();
    if (extra) extra(c);
  }
  function eyes(c, color, y) {
    y = y || 42;
    c.fillStyle = '#f2ead8'; c.beginPath(); c.ellipse(42, y, 4.5, 3, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(58, y, 4.5, 3, 0, 0, 7); c.fill();
    c.fillStyle = color || INK; circle(c, 42.5, y, 2.1); c.fill(); circle(c, 58.5, y, 2.1); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath(); c.moveTo(36, y - 6); c.lineTo(47, y - 5); c.moveTo(53, y - 5); c.lineTo(64, y - 6); c.stroke();
  }
  function portraitBg(ctx, w, h, color) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color); g.addColorStop(1, '#120e0b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#000';
    for (let i = 0; i < 30; i++) ctx.fillRect(hash(i) * w, 0, 1 + hash(i + 3) * 3, h);
    ctx.globalAlpha = 1;
  }
  const PORTRAITS = {
    boris: (c) => bust(c, '#d4a07a', '#c86a1a', (c) => {
      eyes(c, '#3a2a1a', 44);
      // борода
      c.beginPath(); c.moveTo(31, 46); c.quadraticCurveTo(32, 70, 50, 70); c.quadraticCurveTo(68, 70, 69, 46); c.quadraticCurveTo(60, 58, 50, 56); c.quadraticCurveTo(40, 58, 31, 46); c.fillStyle = '#5a3a22'; c.fill();
      // каска
      c.beginPath(); c.arc(50, 34, 23, Math.PI, 0); c.fillStyle = '#f0c040'; c.fill(); strokeInk(c, 2.5);
      c.fillStyle = '#f0c040'; rr(c, 22, 31, 56, 6, 2); c.fill(); strokeInk(c, 2);
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(46, 13, 8, 18);
      // светоотражающие полосы
      c.fillStyle = '#e8e8e8'; c.fillRect(20, 80, 60, 5);
    }),
    marina: (c) => bust(c, '#e6c3a5', '#e9e9e9', (c) => {
      eyes(c, '#2d6fb5', 41);
      // шапочка
      c.beginPath(); c.arc(50, 34, 21, Math.PI * 1.02, -0.02); c.quadraticCurveTo(70, 28, 30, 28); c.fillStyle = '#5aa6a0'; c.fill(); strokeInk(c, 2);
      // волосы
      c.fillStyle = '#3a2418'; c.beginPath(); c.moveTo(30, 34); c.quadraticCurveTo(26, 56, 32, 62); c.lineTo(34, 38); c.fill(); c.beginPath(); c.moveTo(70, 34); c.quadraticCurveTo(74, 56, 68, 62); c.lineTo(66, 38); c.fill();
      // маска на подбородке
      c.fillStyle = '#9fd0cc'; rr(c, 37, 52, 26, 12, 4); c.fill(); strokeInk(c, 1.5);
      // халат и стетоскоп
      c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(50, 70); c.lineTo(42, 100); c.moveTo(50, 70); c.lineTo(58, 100); c.stroke();
      c.strokeStyle = '#333'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(36, 68); c.quadraticCurveTo(40, 90, 52, 88); c.stroke();
      c.fillStyle = '#c0392b'; c.fillRect(64, 78, 8, 3); c.fillRect(66.5, 75.5, 3, 8);
    }),
    lisa: (c) => bust(c, '#c99a72', '#2e6b4a', (c) => {
      eyes(c, '#4e7a3a', 43);
      // капюшон
      c.beginPath(); c.moveTo(24, 66); c.quadraticCurveTo(20, 18, 50, 14); c.quadraticCurveTo(80, 18, 76, 66); c.quadraticCurveTo(70, 40, 50, 28); c.quadraticCurveTo(30, 40, 24, 66); c.fillStyle = '#1f4a33'; c.fill(); strokeInk(c, 2.5);
      // бандана
      c.beginPath(); c.moveTo(31, 50); c.lineTo(69, 50); c.lineTo(64, 64); c.lineTo(50, 70); c.lineTo(36, 64); c.closePath(); c.fillStyle = '#7a1f1f'; c.fill(); strokeInk(c, 1.5);
      c.fillStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 4; i++) { circle(c, 40 + i * 7, 58, 1.2); c.fill(); }
      // чёлка
      c.fillStyle = '#2a1a10'; poly(c, [34, 30, 56, 26, 46, 36, 40, 34]); c.fill();
    }),
    sava: (c) => bust(c, '#bf9474', '#3a3350', (c) => {
      eyes(c, '#9ab0c0', 43);
      // глубокий капюшон и тень на лице
      c.beginPath(); c.moveTo(22, 70); c.quadraticCurveTo(16, 14, 50, 10); c.quadraticCurveTo(84, 14, 78, 70); c.quadraticCurveTo(72, 34, 50, 24); c.quadraticCurveTo(28, 34, 22, 70); c.fillStyle = '#2a2438'; c.fill(); strokeInk(c, 2.5);
      c.fillStyle = 'rgba(10,8,20,.35)'; c.fillRect(30, 28, 40, 12);
      // шарф до носа
      c.beginPath(); c.moveTo(30, 48); c.lineTo(70, 48); c.lineTo(68, 66); c.lineTo(32, 66); c.closePath(); c.fillStyle = '#5a4e70'; c.fill(); strokeInk(c, 1.5);
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1.2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(33, 53 + i * 4); c.lineTo(67, 53 + i * 4); c.stroke(); }
      // перо на капюшоне (сыч)
      c.fillStyle = '#c9b78f'; poly(c, [70, 20, 80, 8, 76, 24]); c.fill();
    }),
    gosha: (c) => bust(c, '#d8a882', '#b8d02a', (c) => {
      eyes(c, '#5a3a1a', 44);
      // синяя кепка козырьком назад и наушники-противошумы
      c.beginPath(); c.arc(50, 33, 22, Math.PI, 0); c.closePath(); c.fillStyle = '#2d5fa0'; c.fill(); strokeInk(c, 2.5);
      c.fillStyle = '#1f4a80'; c.fillRect(64, 28, 16, 6);
      c.strokeStyle = '#222'; c.lineWidth = 3; c.beginPath(); c.arc(50, 34, 26, Math.PI * 1.05, -0.05); c.stroke();
      [[24, 44], [76, 44]].forEach(([x, y]) => { rr(c, x - 6, y - 9, 12, 18, 5); c.fillStyle = '#e8701a'; c.fill(); strokeInk(c, 2); });
      // щетина и широкая горластая ухмылка с щербинкой (без усов — усы у Виктора)
      c.fillStyle = 'rgba(60,40,30,.22)'; c.beginPath(); c.ellipse(50, 60, 15, 8, 0, 0, Math.PI); c.fill();
      c.fillStyle = '#5a1a14'; c.beginPath(); c.moveTo(39, 54); c.quadraticCurveTo(50, 66, 61, 54); c.closePath(); c.fill(); strokeInk(c, 1.5);
      c.fillStyle = '#f2ead8'; c.beginPath(); c.moveTo(41, 55); c.lineTo(59, 55); c.quadraticCurveTo(50, 59, 41, 55); c.fill();
      c.fillStyle = '#5a1a14'; c.fillRect(49, 55, 2, 2.5);
      // светоотражающие полосы на жилете
      c.fillStyle = '#e8e8d0'; c.fillRect(26, 82, 48, 4); c.fillRect(30, 90, 40, 4);
    }),
    viktor: (c) => bust(c, '#cfa07e', '#2b3f5c', (c) => {
      eyes(c, '#3a2a1a', 44);
      // усы
      c.fillStyle = '#3a2a1a'; c.beginPath(); c.moveTo(38, 54); c.quadraticCurveTo(50, 48, 62, 54); c.quadraticCurveTo(50, 52, 38, 54); c.fill();
      c.fillStyle = '#3a2a1a'; rr(c, 38, 52, 24, 4, 2); c.fill();
      // фуражка
      c.fillStyle = '#2b3f5c'; c.beginPath(); c.ellipse(50, 24, 26, 9, 0, 0, 7); c.fill(); strokeInk(c, 2);
      c.fillStyle = '#1a2638'; rr(c, 30, 24, 40, 10, 2); c.fill();
      c.fillStyle = INK; c.beginPath(); c.ellipse(50, 35, 20, 4, 0, 0, Math.PI); c.fill();
      c.fillStyle = '#c0392b'; c.fillRect(30, 30, 40, 3);
      c.fillStyle = '#e0a83a'; circle(c, 50, 26, 3.5); c.fill();
      // погоны
      c.fillStyle = '#e0a83a'; c.fillRect(16, 76, 14, 3); c.fillRect(70, 76, 14, 3);
    }),
    kira: (c) => bust(c, '#e2b896', '#4a4f57', (c) => {
      eyes(c, '#6b4a1a', 44);
      // волосы с хвостом
      c.fillStyle = '#b8481c'; c.beginPath(); c.arc(50, 34, 21, Math.PI, 0); c.fill();
      c.beginPath(); c.moveTo(68, 30); c.quadraticCurveTo(90, 40, 82, 70); c.quadraticCurveTo(78, 50, 66, 40); c.fill();
      // очки-гогглы
      c.fillStyle = '#333'; c.fillRect(28, 25, 44, 6);
      c.fillStyle = '#6ec6e8'; circle(c, 40, 28, 7); c.fill(); strokeInk(c, 2.5); circle(c, 60, 28, 7); c.fill(); strokeInk(c, 2.5);
      // масло на щеке
      c.fillStyle = 'rgba(30,20,10,.5)'; c.fillRect(56, 50, 8, 3);
      // комбинезон
      c.fillStyle = '#d4a017'; c.fillRect(34, 76, 6, 24); c.fillRect(60, 76, 6, 24);
    }),
  };
  Object.keys(PORTRAITS).forEach((id) => {
    Art.define('hero_' + id, (ctx, w, h, o) => {
      const def = ZG.Heroes.get(id);
      if (!o.noBg) portraitBg(ctx, w, h, def.color === '#e8e8e8' ? '#7a8c96' : def.color);
      const s = Math.min(w, h);
      ctx.save();
      ctx.translate((w - s) / 2, h - s);
      Art.unit(ctx, s, s, PORTRAITS[id]);
      ctx.restore();
    });
  });

  // --------------------------------- обращённые герои (оборот фишки героя) ---
  // портрет героя, «отравленный» трупной зеленью: светящиеся глаза, вены, кровь у рта
  function turnedFace(c, id) {
    PORTRAITS[id](c);
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(70,120,40,.42)'; c.fillRect(0, 0, 100, 100);
    c.restore();
    c.fillStyle = '#d8ff4a'; c.shadowColor = '#d8ff4a'; c.shadowBlur = 6;
    c.beginPath(); c.ellipse(41, 44, 3.4, 2.2, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(59, 44, 3.4, 2.2, 0, 0, 7); c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(40,10,40,.55)'; c.lineWidth = 1.2;
    [[32, 52, 38, 60, 35, 66], [66, 50, 62, 58, 67, 64], [44, 24, 48, 30, 45, 34]].forEach(([a, b, d, e, f, k]) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.lineTo(f, k); c.stroke(); });
    c.fillStyle = '#7a120c'; c.fillRect(46, 57, 2, 9); c.fillRect(52, 57, 1.6, 6);
    c.beginPath(); c.ellipse(50, 57, 6, 2, 0, 0, 7); c.fill();
  }
  const TURNED_RING = '#7fae3a';
  Object.keys(PORTRAITS).forEach((id) => {
    Art.define('zp_turned_' + id, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, TURNED_RING); g.addColorStop(1, '#0d0a08');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const s = Math.min(w, h);
      ctx.save(); ctx.translate((w - s) / 2, h - s); Art.unit(ctx, s, s, (c) => turnedFace(c, id)); ctx.restore();
    });
    Art.define('z_turned_' + id, (ctx, w, h) => {
      const def = ZG.Heroes.get(id);
      const r = Math.min(w, h) / 2;
      ctx.save(); ctx.translate(w / 2, h / 2);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7);
      const gr = ctx.createRadialGradient(0, -r * 0.4, r * 0.1, 0, 0, r);
      gr.addColorStop(0, '#4a6a2a'); gr.addColorStop(1, '#0d0a08');
      ctx.fillStyle = gr; ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, 7); ctx.clip();
      ctx.translate(-r * 0.9, -r * 0.88);
      Art.unit(ctx, r * 1.8, r * 1.8, (c) => turnedFace(c, id));
      ctx.restore();
      // двойной обод: цвет героя, поверх — рваная трупная зелень
      ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, 7); ctx.lineWidth = r * 0.14; ctx.strokeStyle = def ? def.color : TURNED_RING; ctx.stroke();
      ctx.setLineDash([r * 0.22, r * 0.14]); ctx.lineWidth = r * 0.08; ctx.strokeStyle = TURNED_RING; ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = Math.max(1, r * 0.04); ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, 7); ctx.stroke();
      // значок биоопасности сверху справа
      ctx.save(); ctx.translate(r * 0.42, -r * 0.84);
      ctx.beginPath(); ctx.arc(r * 0.17, r * 0.17, r * 0.2, 0, 7); ctx.fillStyle = INK; ctx.fill();
      Art.unit(ctx, r * 0.34, r * 0.34, (c) => ICONS.infection(c, { ink: INK }));
      ctx.restore();
      ctx.restore();
    });
  });

  // ------------------------------------------------- зомби (жетоны-лица) ---
  function zBust(c, p) {
    // плечи
    c.beginPath(); c.moveTo(4, 100); c.quadraticCurveTo(10, 70, 32, 66); c.lineTo(68, 66); c.quadraticCurveTo(90, 70, 96, 100); c.closePath();
    c.fillStyle = p.cloth; c.fill(); strokeInk(c, 2.5);
    if (p.rips) { c.fillStyle = p.skin; poly(c, [30, 78, 36, 72, 40, 84]); c.fill(); poly(c, [62, 80, 70, 74, 66, 90]); c.fill(); }
    c.fillStyle = p.skin; c.fillRect(42, 54, 16, 16);
    // голова
    c.save();
    c.translate(50, 42); c.rotate(p.tilt || 0); c.translate(-50, -42);
    c.beginPath(); c.ellipse(50, 42, p.hw || 20, p.hh || 23, 0, 0, 7); c.fillStyle = p.skin; c.fill(); strokeInk(c, 2.5);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(58, 46, (p.hw || 20) * 0.5, (p.hh || 23) * 0.8, 0, -1.4, 1.6); c.fill();
    // глаза
    const ey = p.eyeY || 40;
    c.fillStyle = INK; c.beginPath(); c.ellipse(41, ey, 6, 5, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(59, ey, 6, 5, 0, 0, 7); c.fill();
    c.fillStyle = p.eye || '#e5d34d'; circle(c, 41, ey, p.pupil || 2.4); c.fill(); circle(c, 59, ey, p.pupil || 2.4); c.fill();
    if (p.deadEye) { c.fillStyle = '#e8e4d8'; circle(c, 59, ey, 4.5); c.fill(); }
    // рот
    c.fillStyle = '#2a0a06';
    c.beginPath(); c.ellipse(50, p.mouthY || 56, p.mw || 9, p.mh || 4, 0, 0, 7); c.fill();
    c.fillStyle = '#e8dcc0';
    const mw = p.mw || 9, my = p.mouthY || 56, mh = p.mh || 4;
    for (let i = 0; i < 5; i++) { c.fillRect(50 - mw * 0.8 + i * mw * 0.38, my - mh, mw * 0.18, mh * 0.6); c.fillRect(50 - mw * 0.7 + i * mw * 0.36, my + mh * 0.45, mw * 0.16, mh * 0.55); }
    // раны, вены
    c.strokeStyle = 'rgba(60,20,10,.6)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(34, 30); c.lineTo(40, 34); c.lineTo(37, 37); c.stroke();
    c.fillStyle = '#7a120c'; circle(c, 64, 50, 2.5); c.fill(); c.fillRect(63, 50, 1.5, 7);
    if (p.hair) { c.fillStyle = p.hair; c.beginPath(); c.moveTo(30, 34); c.quadraticCurveTo(28, 14, 50, 17); c.quadraticCurveTo(72, 14, 70, 34); c.quadraticCurveTo(64, 22, 56, 26); c.quadraticCurveTo(48, 20, 40, 27); c.quadraticCurveTo(34, 24, 30, 34); c.fill(); }
    if (p.extra) p.extra(c);
    c.restore();
  }
  const ZSTYLE = {
    walker: { ring: '#6e8b4c', p: { skin: '#9fb57c', cloth: '#5b4f44', hair: '#3b3026', rips: true, deadEye: true, tilt: -0.12 } },
    runner: { ring: '#d4d94a', p: { skin: '#b5c48a', cloth: '#8a2a2a', hair: '#1a1a1a', hw: 17, eye: '#ff3a1a', pupil: 1.6, mw: 11, mh: 6, mouthY: 57, tilt: 0.18,
      extra: (c) => { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2.5; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(8, 34 + i * 10); c.lineTo(22, 34 + i * 10); c.stroke(); } } } },
    fatso: { ring: '#b08a3a', p: { skin: '#b9b06a', cloth: '#6b5d4a', hw: 27, hh: 25, eyeY: 38, mw: 8, mouthY: 55,
      extra: (c) => { c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.beginPath(); c.arc(50, 58, 16, 0.3, Math.PI - 0.3); c.stroke(); c.beginPath(); c.arc(50, 61, 19, 0.4, Math.PI - 0.4); c.stroke(); } } },
    screamer: { ring: '#b05cc4', p: { skin: '#b8c0a8', cloth: '#3d3550', hair: '#e8e0f0', hh: 26, mw: 7, mh: 11, mouthY: 58, eye: '#f0f0ff',
      extra: (c) => { c.strokeStyle = '#e7c6ff'; c.lineWidth = 3; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(50, 58, 20 + i * 9, 0.6, Math.PI - 0.6); c.stroke(); } } } },
    brute: { ring: '#c0392b', p: { skin: '#8aa060', cloth: '#333', hw: 24, hh: 22, eye: '#ff2a1a', mw: 12, mh: 5,
      extra: (c) => {
        c.fillStyle = '#6a6a6a'; c.beginPath(); c.arc(50, 34, 25, Math.PI * 1.05, -0.05); c.lineTo(75, 32); c.lineTo(25, 32); c.fill(); strokeInk(c, 2.5);
        c.fillStyle = '#aaa'; for (let i = 0; i < 5; i++) { circle(c, 30 + i * 10, 29, 1.6); c.fill(); }
        c.strokeStyle = '#4a1a10'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(62, 36); c.lineTo(70, 54); c.stroke();
      } } },
    plague: { ring: '#7fae3a', p: { skin: '#9fb06a', cloth: '#4a5a2a', hw: 19, eye: '#d8ff4a', mw: 10, mh: 5,
      extra: (c) => {
        // гнойники и капающая слизь
        c.fillStyle = '#c8e05a'; [[38, 32, 3.5], [62, 30, 2.8], [56, 50, 3], [36, 48, 2.4]].forEach(([x, y, r]) => { circle(c, x, y, r); c.fill(); });
        c.fillStyle = '#6a8a20'; c.fillRect(47, 60, 2.5, 10); c.fillRect(53, 60, 2, 7);
        c.strokeStyle = 'rgba(200,255,80,.6)'; c.lineWidth = 2; c.beginPath(); c.arc(50, 42, 30, 0.3, 1.2); c.stroke(); c.beginPath(); c.arc(50, 42, 30, 2.0, 2.8); c.stroke();
      } } },
    grabber: { ring: '#8a5a9a', p: { skin: '#a8a090', cloth: '#3a2e40', hw: 18, hh: 25, eye: '#ff8a3a', mw: 8,
      extra: (c) => {
        // длинные руки, тянущиеся вперёд
        c.strokeStyle = '#a8a090'; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(22, 78); c.quadraticCurveTo(8, 50, 18, 26); c.stroke();
        c.beginPath(); c.moveTo(78, 78); c.quadraticCurveTo(92, 50, 82, 26); c.stroke();
        c.lineWidth = 2.5; c.strokeStyle = INK; for (const [x, s] of [[18, -1], [82, 1]]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x, 26); c.lineTo(x + s * (i - 1) * 5, 16); c.stroke(); }
      } } },
  };
  Art.ZSTYLE = ZSTYLE;
  Object.keys(ZSTYLE).forEach((type) => {
    // портрет (для карт и подсказок)
    Art.define('zp_' + type, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, ZSTYLE[type].ring); g.addColorStop(1, '#0d0a08');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const s = Math.min(w, h);
      ctx.save(); ctx.translate((w - s) / 2, h - s); Art.unit(ctx, s, s, (c) => zBust(c, ZSTYLE[type].p)); ctx.restore();
    });
    // жетон на поле
    Art.define('z_' + type, (ctx, w, h, o) => {
      const st = ZSTYLE[type];
      const r = Math.min(w, h) / 2;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7);
      const gr = ctx.createRadialGradient(0, -r * 0.4, r * 0.1, 0, 0, r);
      gr.addColorStop(0, st.ring); gr.addColorStop(1, '#0d0a08');
      ctx.fillStyle = gr; ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, 7); ctx.clip();
      ctx.rotate((o.rot || 0) * 0.15);
      ctx.translate(-r * 0.86, -r * 0.92);
      Art.unit(ctx, r * 1.72, r * 1.72, (c) => zBust(c, st.p));
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, 7);
      ctx.lineWidth = r * (type === 'brute' ? 0.16 : 0.11); ctx.strokeStyle = st.ring; ctx.stroke();
      ctx.lineWidth = Math.max(1, r * 0.04); ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, 7); ctx.stroke();
      ctx.restore();
    });
  });
  // Ищейка — мёртвый пёс (отдельный рисунок, не человеческий бюст)
  function houndHead(c) {
    c.fillStyle = '#5a4a3a'; c.beginPath(); c.ellipse(50, 56, 26, 22, 0, 0, 7); c.fill(); strokeInk(c, 2.5);
    // уши
    c.fillStyle = '#4a3a2a'; poly(c, [28, 44, 22, 14, 42, 36]); c.fill(); strokeInk(c, 2); poly(c, [72, 44, 78, 14, 58, 36]); c.fill(); strokeInk(c, 2);
    // морда
    c.fillStyle = '#6a5a48'; c.beginPath(); c.ellipse(50, 70, 15, 11, 0, 0, 7); c.fill(); strokeInk(c, 2);
    c.fillStyle = INK; c.beginPath(); c.ellipse(50, 64, 5, 3.5, 0, 0, 7); c.fill();
    c.fillStyle = '#2a0a06'; c.beginPath(); c.ellipse(50, 76, 10, 4, 0, 0, 7); c.fill();
    c.fillStyle = '#e8dcc0'; for (let i = 0; i < 5; i++) { poly(c, [42 + i * 4, 74, 44 + i * 4, 79, 46 + i * 4, 74]); c.fill(); }
    // глаза и рёбра
    c.fillStyle = '#ff3a1a'; circle(c, 40, 50, 3.2); c.fill(); circle(c, 60, 50, 3.2); c.fill();
    c.strokeStyle = 'rgba(232,220,192,.5)'; c.lineWidth = 1.5; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(50, 98, 18 + i * 5, 3.6, 5.8); c.stroke(); }
  }
  Art.define('zp_hound', (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9a2a1a'); g.addColorStop(1, '#0d0a08');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const s = Math.min(w, h); ctx.save(); ctx.translate((w - s) / 2, h - s); Art.unit(ctx, s, s, houndHead); ctx.restore();
  });
  Art.define('z_hound', (ctx, w, h) => {
    const r = Math.min(w, h) / 2;
    ctx.save(); ctx.translate(w / 2, h / 2);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7);
    const gr = ctx.createRadialGradient(0, -r * 0.4, r * 0.1, 0, 0, r); gr.addColorStop(0, '#9a2a1a'); gr.addColorStop(1, '#0d0a08');
    ctx.fillStyle = gr; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, 7); ctx.clip(); ctx.translate(-r * 0.86, -r * 0.92); Art.unit(ctx, r * 1.72, r * 1.72, houndHead); ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, 7); ctx.lineWidth = r * 0.16; ctx.strokeStyle = '#c0392b'; ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.04); ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, 7); ctx.stroke();
    ctx.restore();
  });
  Art.define('z_nest', (ctx, w, h, o) => {
    const r = Math.min(w, h) / 2;
    const t = o.t || 0;
    ctx.save(); ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.sin(t * 0.8 + i) * 0.1;
      ctx.strokeStyle = '#4a1d3a'; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a + 0.4) * r * 0.6, Math.sin(a + 0.4) * r * 0.6, Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
      ctx.stroke();
    }
    const pulse = 1 + Math.sin(t * 2.2) * 0.05;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62 * pulse, 0, 7);
    const gr = ctx.createRadialGradient(-r * 0.15, -r * 0.2, 1, 0, 0, r * 0.62);
    gr.addColorStop(0, '#c45a8e'); gr.addColorStop(0.6, '#7a2456'); gr.addColorStop(1, '#3a0d28');
    ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = hash(i) * 6.28, d = hash(i + 7) * r * 0.4;
      ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.06 + hash(i + 2) * 0.08), 0, 7);
      ctx.fillStyle = '#e6b8cf'; ctx.fill();
    }
    ctx.restore();
  });

  // ------------------------------------------------------ жетоны поля ---
  Art.define('tok_crate', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    c.save(); c.translate(3, 4); rr(c, 12, 12, 76, 76, 6); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill(); c.restore();
    rr(c, 12, 12, 76, 76, 6); c.fillStyle = o.opened ? '#5a4a34' : '#9a6a32'; c.fill(); strokeInk(c, 4);
    c.strokeStyle = o.opened ? '#3a2e20' : '#6b4518'; c.lineWidth = 4;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(12, 12 + i * 19); c.lineTo(88, 12 + i * 19); c.stroke(); }
    c.beginPath(); c.moveTo(16, 16); c.lineTo(84, 84); c.moveTo(84, 16); c.lineTo(16, 84); c.lineWidth = 6; c.strokeStyle = o.opened ? '#4a3a28' : '#7d5222'; c.stroke();
    if (!o.opened) {
      circle(c, 50, 50, 20); c.fillStyle = '#f0c040'; c.fill(); strokeInk(c, 3.5);
      c.fillStyle = INK; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 50, 52);
    }
  }));
  Art.define('tok_search', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    circle(c, 52, 54, 40); c.fillStyle = 'rgba(0,0,0,.4)'; c.fill();
    circle(c, 50, 50, 40); c.fillStyle = o.armory ? '#c0392b' : '#e0a83a'; c.fill(); strokeInk(c, 4);
    circle(c, 50, 50, 31); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.stroke();
    circle(c, 45, 44, 14); strokeInk(c, 6); c.beginPath(); c.moveTo(55, 54); c.lineTo(70, 70); strokeInk(c, 9);
    if (o.armory) { c.fillStyle = '#fff'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.fillText('×2', 72, 34); }
  }));
  Art.define('tok_spawn', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    circle(c, 50, 50, 44); c.fillStyle = '#26221e'; c.fill();
    c.save(); circle(c, 50, 50, 44); c.clip();
    for (let i = -6; i < 8; i++) { c.fillStyle = i % 2 ? '#e0a83a' : '#1a1714'; poly(c, [i * 16, 0, i * 16 + 8, 0, i * 16 + 108, 100, i * 16 + 100, 100]); c.fill(); }
    c.restore();
    circle(c, 50, 50, 44); strokeInk(c, 4);
    circle(c, 50, 50, 30); c.fillStyle = '#3a342e'; c.fill(); strokeInk(c, 3);
    c.strokeStyle = '#1a1714'; c.lineWidth = 3; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(30, 50 + i * 8); c.lineTo(70, 50 + i * 8); c.stroke(); }
    if (o.label) { c.fillStyle = '#c0392b'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.fillText(o.label, 50, 98); }
  }));
  Art.define('tok_noise', (ctx, w, h) => ZG.Art.draw(ctx, 'noiseIcon', 0, 0, w, h));
  Art.define('tok_lure', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    const t = o.t || 0;
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.8 + i / 3) % 1);
      circle(c, 50, 50, 14 + k * 36); c.strokeStyle = `rgba(224,168,58,${1 - k})`; c.lineWidth = 4; c.stroke();
    }
    ICONS.bottle(c, { ink: '#2a1a0a' });
  }));
  Art.define('tok_trap', (ctx, w, h) => Art.unit(ctx, w, h, (c) => {
    circle(c, 50, 50, 34); c.fillStyle = 'rgba(192,57,43,.25)'; c.fill(); c.setLineDash([6, 5]); strokeInk(c, 3, '#c0392b'); c.setLineDash([]);
    ICONS.trap(c, { ink: INK });
  }));
  Art.define('tok_barricade', (ctx, w, h) => Art.unit(ctx, w, h, (c) => {
    for (let i = -1; i <= 1; i++) { c.save(); c.translate(50, 50 + i * 18); c.rotate(i * 0.08); rr(c, -46, -7, 92, 14, 3); c.fillStyle = i ? '#8a6a3a' : '#a07a42'; c.fill(); strokeInk(c, 3); c.fillStyle = '#555'; circle(c, -38, 0, 2.5); c.fill(); circle(c, 38, 0, 2.5); c.fill(); c.restore(); }
  }));
  Art.define('tok_hunt', (ctx, w, h) => Art.unit(ctx, w, h, (c) => { circle(c, 50, 50, 42); c.fillStyle = '#c0392b'; c.fill(); strokeInk(c, 5); c.fillStyle = '#fff'; c.font = 'bold 56px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 50, 54); }));
  Art.define('tok_trail', (ctx, w, h) => Art.unit(ctx, w, h, (c) => {
    circle(c, 50, 50, 44); c.fillStyle = '#e8dcc0'; c.fill(); strokeInk(c, 4);
    c.fillStyle = '#7a1f1f'; c.beginPath(); c.ellipse(36, 62, 9, 15, 0.3, 0, 7); c.fill(); c.beginPath(); c.ellipse(60, 40, 9, 15, 0.3, 0, 7); c.fill();
    c.fillStyle = INK; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('?', 74, 76);
  }));
  Art.define('tok_plug', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    circle(c, 50, 50, 44); c.fillStyle = '#3a3a3a'; c.fill(); strokeInk(c, 4);
    c.strokeStyle = '#e0a83a'; c.lineWidth = 7; c.beginPath(); c.moveTo(20, 20); c.lineTo(80, 80); c.moveTo(80, 20); c.lineTo(20, 80); c.stroke();
    if (o.n) { circle(c, 76, 24, 16); c.fillStyle = '#e0a83a'; c.fill(); strokeInk(c, 3); c.fillStyle = INK; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.n, 76, 26); }
  }));
  // пустышки (лицевая сторона; рубашка — как у зомби, tok_zback)
  Art.define('tok_decoy', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    circle(c, 50, 50, 46); c.fillStyle = { gone: '#4a4038', lair: '#8a6a32', ambush: '#7a1f1f', tracks: '#3a4a5a' }[o.kind || 'gone']; c.fill(); c.lineWidth = 4; c.strokeStyle = '#1a1410'; c.stroke();
    c.fillStyle = '#e8dcc0'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 15px sans-serif';
    c.fillText({ gone: 'УШЛИ', lair: 'ЛОГОВО', ambush: 'ЗАСАДА', tracks: 'СЛЕДЫ' }[o.kind || 'gone'], 50, 74);
    c.font = 'bold 34px sans-serif';
    c.fillText({ gone: '∅', lair: '⌂', ambush: '!', tracks: '👣' }[o.kind || 'gone'], 50, 42);
  }));
  Art.define('tok_door', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    rr(c, 8, 8, 84, 84, 10); c.fillStyle = o.open ? '#3a2e22' : '#5a3e20'; c.fill(); strokeInk(c, 4);
    if (o.open) { c.save(); c.translate(26, 20); c.rotate(-0.5); rr(c, 0, 0, 22, 62, 2); c.fillStyle = '#7a542c'; c.fill(); strokeInk(c, 3); c.restore(); c.fillStyle = '#e8dcc0'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText('ОТКР', 64, 86); }
    else { rr(c, 30, 14, 40, 72, 3); c.fillStyle = '#7a542c'; c.fill(); strokeInk(c, 3); circle(c, 62, 52, 4); c.fillStyle = '#e0c070'; c.fill(); }
  }));
  Art.define('tok_round', (ctx, w, h) => Art.unit(ctx, w, h, (c) => { circle(c, 50, 50, 44); c.fillStyle = '#f0c040'; c.fill(); strokeInk(c, 5); c.fillStyle = INK; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Р', 50, 54); }));
  Art.define('tok_alarm', (ctx, w, h) => Art.unit(ctx, w, h, (c) => { circle(c, 50, 50, 44); c.fillStyle = '#e0602a'; c.fill(); strokeInk(c, 5); c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 50, 54); }));
  Art.define('tok_start', (ctx, w, h) => Art.unit(ctx, w, h, (c) => { circle(c, 50, 50, 44); c.fillStyle = '#2e8b57'; c.fill(); strokeInk(c, 5); c.fillStyle = '#fff'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('СТАРТ', 50, 54); }));
  Art.define('tok_zback', (ctx, w, h) => Art.unit(ctx, w, h, (c) => {
    circle(c, 50, 50, 46); c.fillStyle = '#2b211a'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#7a0c06'; c.stroke();
    c.fillStyle = 'rgba(232,220,192,.35)'; c.font = 'bold 48px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 50, 54);
  }));
  Art.define('tok_tower', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.moveTo(30, 92); c.lineTo(50, 14); c.lineTo(70, 92); c.stroke();
    c.lineWidth = 3; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(34 + i * 4, 76 - i * 18); c.lineTo(66 - i * 4, 76 - i * 18); c.stroke(); }
    circle(c, 50, 14, 6); c.fillStyle = o.on ? '#e74c3c' : '#7a6a5a'; c.fill(); c.stroke();
    if (o.on) { for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(50, 14, 14 + i * 10, -2.5, -0.6); c.strokeStyle = '#e74c3c'; c.lineWidth = 3; c.stroke(); } }
  }));
  Art.define('tok_drop', (ctx, w, h, o) => Art.draw(ctx, o.card || 'cargo_fuel', 0, 0, w, h, { noBg: true }));

  function vehicle(c, body, top, extra) {
    rr(c, 22, 8, 56, 84, 12); c.fillStyle = 'rgba(0,0,0,.4)'; c.fill();
    rr(c, 20, 6, 56, 84, 12); c.fillStyle = body; c.fill(); strokeInk(c, 3);
    rr(c, 26, 22, 44, 18, 4); c.fillStyle = '#1f2a33'; c.fill();
    rr(c, 26, 66, 44, 12, 4); c.fillStyle = '#1f2a33'; c.fill();
    rr(c, 28, 40, 40, 26, 3); c.fillStyle = top; c.fill();
    c.fillStyle = '#ffe9a0'; c.fillRect(24, 6, 10, 4); c.fillRect(62, 6, 10, 4);
    if (extra) extra(c);
  }
  Art.define('exit_car', (ctx, w, h) => Art.unit(ctx, w, h, (c) => vehicle(c, '#3d6e8f', '#4f87ab')));
  Art.define('exit_ambulance', (ctx, w, h) => Art.unit(ctx, w, h, (c) => vehicle(c, '#eeeeee', '#ffffff', (c) => {
    c.fillStyle = '#c0392b'; c.fillRect(44, 44, 8, 20); c.fillRect(38, 50, 20, 8); c.fillStyle = '#2d6fb5'; c.fillRect(30, 40, 8, 4); c.fillStyle = '#c0392b'; c.fillRect(58, 40, 8, 4);
  })));
  Art.define('exit_heli', (ctx, w, h, o) => Art.unit(ctx, w, h, (c) => {
    circle(c, 50, 50, 44); c.fillStyle = '#2b2b2b'; c.fill(); strokeInk(c, 3);
    circle(c, 50, 50, 36); c.strokeStyle = '#e0a83a'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#e0a83a'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 50, 52);
    if (o.arrived) {
      c.save(); c.translate(50, 50); c.rotate((o.t || 0) * 12);
      c.fillStyle = 'rgba(30,30,30,.7)'; for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.fillRect(-3, 0, 6, 46); }
      c.restore();
    }
  }));

  // ---------------------------------------------------- условия партии ---
  Art.define('cond_calm', (ctx, w, h) => { cardBg(ctx, w, h, '#4a5a6a', '#1c2228'); Art.unit(ctx, w, h, (c) => { circle(c, 50, 46, 22); c.fillStyle = '#e8d8a0'; c.fill(); c.fillStyle = '#1c2228'; circle(c, 60, 40, 20); c.fill(); }); });
  Art.define('cond_fog', (ctx, w, h) => { cardBg(ctx, w, h, '#7a8a8a', '#2a3232'); Art.unit(ctx, w, h, (c) => { c.fillStyle = 'rgba(230,235,235,.55)'; for (let i = 0; i < 5; i++) { rr(c, 6 + (i % 2) * 14, 18 + i * 14, 80, 8, 4); c.fill(); } }); });
  Art.define('cond_rain', (ctx, w, h) => { cardBg(ctx, w, h, '#3a5a7a', '#141e2a'); Art.unit(ctx, w, h, (c) => { c.strokeStyle = 'rgba(200,220,255,.7)'; c.lineWidth = 2; for (let i = 0; i < 30; i++) { const x = hash(i) * 110 - 5, y = hash(i + 50) * 100; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 5, y + 14); c.stroke(); } }); });
  Art.define('cond_moon', (ctx, w, h) => { cardBg(ctx, w, h, '#5a3a6a', '#1a1022'); Art.unit(ctx, w, h, (c) => { circle(c, 50, 44, 26); c.fillStyle = '#f2e6c0'; c.fill(); c.fillStyle = 'rgba(0,0,0,.12)'; circle(c, 42, 38, 6); c.fill(); circle(c, 58, 52, 8); c.fill(); c.fillStyle = INK; poly(c, [0, 100, 0, 80, 20, 72, 34, 84, 50, 70, 70, 82, 86, 74, 100, 84, 100, 100]); c.fill(); }); });
  Art.define('cond_convoy', (ctx, w, h) => { cardBg(ctx, w, h, '#6a6a3a', '#22220e'); Art.unit(ctx, w, h, (c) => { c.save(); c.translate(50, 50); c.rotate(1.2); c.translate(-50, -50); c.scale(0.8, 0.8); c.translate(12, 12); vehicle(c, '#5a6a3a', '#6b7b4a'); c.restore(); }); });
  Art.define('cond_swarm', (ctx, w, h) => { cardBg(ctx, w, h, '#5a6a3a', '#1a2210'); Art.unit(ctx, w, h, (c) => { for (let i = 0; i < 6; i++) zombieHead(c, {}, 18 + (i % 3) * 32, 34 + Math.floor(i / 3) * 34, 13); }); });
  Art.define('cond_stash', (ctx, w, h) => { cardBg(ctx, w, h, '#7a5a2a', '#2a1e0e'); Art.unit(ctx, w, h, (c) => { ZG.Art.draw(c, 'tok_crate', 22, 22, 56, 56, {}); }); });

  // ------------------------------------------------------ титульный арт ---
  Art.define('title', (ctx, w, h, o) => {
    const t = o.t || 0;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#120b10'); sky.addColorStop(0.55, '#4a1a14'); sky.addColorStop(1, '#0b0807');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    // луна
    const mx = w * 0.72, my = h * 0.3, mr = Math.min(w, h) * 0.13;
    const mg = ctx.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 3);
    mg.addColorStop(0, 'rgba(240,200,140,.35)'); mg.addColorStop(1, 'rgba(240,200,140,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fillStyle = '#f0d8a8'; ctx.fill();
    ctx.fillStyle = 'rgba(120,60,40,.25)'; ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.25, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.18, 0, 7); ctx.fill();
    // силуэт города (3 слоя параллакса)
    [[0.62, '#1d0f0d', 0.12, 0.1], [0.7, '#140a09', 0.18, 0.2], [0.8, '#0a0605', 0.25, 0.35]].forEach(([base, col, var_, sp], li) => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, h);
      let x = -((t * 6 * sp) % 60);
      let i = li * 31;
      while (x < w + 60) {
        const bw = 30 + hash(i) * 70, bh = h * (var_ * (0.4 + hash(i + 1)));
        ctx.lineTo(x, h * base - bh); ctx.lineTo(x + bw, h * base - bh);
        if (hash(i + 2) > 0.7) { ctx.lineTo(x + bw * 0.5, h * base - bh - 20); }
        x += bw; i++;
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      // окна
      if (li === 1) {
        for (let k = 0; k < 40; k++) {
          const wx = hash(k + 100) * w, wy = h * (0.5 + hash(k + 200) * 0.18);
          const on = Math.sin(t * (0.5 + hash(k)) + k) > 0.6;
          ctx.fillStyle = on ? 'rgba(240,190,90,.7)' : 'rgba(240,190,90,.12)';
          ctx.fillRect(wx, wy, 4, 6);
        }
      }
    });
    // орда силуэтов
    for (let k = 0; k < 26; k++) {
      const zx = ((hash(k) * w * 1.2 + t * (8 + hash(k + 3) * 10)) % (w * 1.2)) - w * 0.1;
      const zy = h * (0.84 + hash(k + 5) * 0.1);
      const s = (0.6 + hash(k + 7) * 0.7) * (h / 500);
      const bob = Math.sin(t * 3 + k) * 2 * s;
      ctx.save(); ctx.translate(zx, zy + bob); ctx.scale(s, s);
      ctx.fillStyle = '#050303';
      ctx.beginPath(); ctx.arc(0, -52, 9, 0, 7); ctx.fill();
      ctx.fillRect(-9, -44, 18, 34);
      ctx.save(); ctx.translate(8, -40); ctx.rotate(-1.2 + Math.sin(t * 2 + k) * 0.15); ctx.fillRect(0, -3, 26, 6); ctx.restore();
      ctx.save(); ctx.translate(-6, -38); ctx.rotate(-1.4 + Math.cos(t * 2 + k) * 0.15); ctx.fillRect(0, -3, 24, 6); ctx.restore();
      ctx.fillRect(-8, -12, 7, 26 + Math.sin(t * 3 + k) * 4); ctx.fillRect(2, -12, 7, 26 - Math.sin(t * 3 + k) * 4);
      ctx.restore();
    }
    // туман
    for (let k = 0; k < 4; k++) {
      const fx = ((t * 15 * (k + 1)) % (w * 1.5)) - w * 0.25;
      const fg = ctx.createRadialGradient(fx, h * 0.85, 10, fx, h * 0.85, w * 0.35);
      fg.addColorStop(0, 'rgba(120,90,80,.12)'); fg.addColorStop(1, 'rgba(120,90,80,0)');
      ctx.fillStyle = fg; ctx.fillRect(0, 0, w, h);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
