/*
 * BoardView — отрисовка поля на canvas и проигрывание анимаций.
 *
 * Слои: статичное поле (тайлы, «печать на картоне») → следы (кровь, копоть) →
 * жетоны → подсветка целей → фишки → эффекты → освещение (ночь, фонари) → погода.
 *
 * Модель (g) — источник истины. Фишки имеют «отображаемое» состояние, которое
 * догоняет модель через очередь fx-событий (многошаговые анимации).
 */
(function (G) {
  'use strict';
  // событие поля → мелкий звук (ZG.Sound.sfx)
  const SFX_MAP = { hmove: 'hstep', shot: 'shot', kill: 'kill', explode: 'blast', blocked: 'block', blockcard: 'block', heal: 'heal', infect: 'infect', barricade: 'wood', bash: 'bash', crate: 'search', loot: 'search', give: 'pickup', adrenaline: 'energy', energy: 'energy', trap: 'click', suppress: 'shot', levelup: 'chain', door: 'door' };
  const ZG = G.ZG;
  const Art = ZG.Art;
  const hash = Art.hash;
  const TAU = Math.PI * 2;
  const ease = {
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };

  class BoardView {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = opts || {};
      this.g = null;
      this.cell = 90;
      this.pad = 18;
      this.zombies = new Map();
      this.heroes = new Map();
      this.particles = [];
      this.floats = [];
      this.effects = [];
      this.highlights = null;
      this.hover = null;
      this.shake = 0;
      this.flash = null;
      this.time = 0;
      this.darkness = 0;
      this.targetDark = 0;
      this.queue = [];
      this.playing = false;
      this.batch = new Set();
      this.intro = null;
      this.onClick = null;
      this.onHover = null;
      this.speed = 1;
      this._bind();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    // ------------------------------------------------------------ setup
    setGame(g, intro) {
      this.g = g;
      this.zombies.clear();
      this.heroes.clear();
      this.particles = []; this.floats = []; this.effects = [];
      this.queue = []; this.playing = false;
      this.decals = null;
      this.resize();
      g.zombies.forEach((z) => this._addZombie(z.uid, z.type, z.pos, 1));
      g.heroes.forEach((h) => { if (h.onBoard) this._addHero(h.idx, h.pos); });
      this._layout(true);
      this.targetDark = this._darkFor();
      this.darkness = this.targetDark;
      if (intro) this.intro = { t0: performance.now(), dur: 2600 };
      this.shown = g.revealed ? g.revealed.slice() : null;
      this.flips = {};
    }

    resize() {
      if (!this.g) return;
      const wrap = this.canvas.parentElement;
      const W = wrap.clientWidth, H = wrap.clientHeight;
      const b = this.g.board;
      this.cell = Math.max(40, Math.floor(Math.min((W - this.pad * 2) / b.w, (H - this.pad * 2) / b.h)));
      const cw = this.cell * b.w + this.pad * 2, ch = this.cell * b.h + this.pad * 2;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      this.canvas.width = Math.round(cw * dpr);
      this.canvas.height = Math.round(ch * dpr);
      this.canvas.style.width = cw + 'px';
      this.canvas.style.height = ch + 'px';
      this.W = cw; this.H = ch;
      this.staticLayer = this._renderStatic();
      const oldDecals = this.decals;
      this.decals = document.createElement('canvas');
      this.decals.width = this.canvas.width; this.decals.height = this.canvas.height;
      if (oldDecals) this.decals.getContext('2d').drawImage(oldDecals, 0, 0, this.decals.width, this.decals.height);
      this.lightCanvas = document.createElement('canvas');
      this.lightCanvas.width = this.canvas.width; this.lightCanvas.height = this.canvas.height;
      this._layout(true);
    }

    cellXY(i) {
      const b = this.g.board;
      const x = i % b.w, y = Math.floor(i / b.w);
      return { x: this.pad + (x + 0.5) * this.cell, y: this.pad + (y + 0.5) * this.cell };
    }
    cellAt(px, py) {
      const b = this.g.board;
      const x = Math.floor((px - this.pad) / this.cell), y = Math.floor((py - this.pad) / this.cell);
      if (x < 0 || y < 0 || x >= b.w || y >= b.h) return null;
      return y * b.w + x;
    }

    // ------------------------------------------------------ сущности
    _addZombie(uid, type, cell, scale) {
      const p = this.cellXY(cell);
      const zm = this.g && this.g.zombies.find((q) => q.uid === uid);
      this.zombies.set(uid, { uid, type, cell, x: p.x, y: p.y, scale: scale == null ? 0 : scale, alpha: 1, rot: 0, flash: 0, lunge: null, hop: 0, dying: null, born: this.time, awake: zm ? zm.awake !== false : true });
    }
    _addHero(idx, cell) {
      const p = this.cellXY(cell);
      this.heroes.set(idx, { idx, cell, x: p.x, y: p.y, scale: 1, alpha: 1, flash: 0, flashColor: '#c0392b', hop: 0, gone: false });
    }

    // раскладка фишек внутри зоны
    _layout(snap) {
      if (!this.g) return;
      const groups = new Map();
      const push = (cell, e) => { if (!groups.has(cell)) groups.set(cell, []); groups.get(cell).push(e); };
      this.heroes.forEach((e) => { if (!e.gone) push(e.cell, e); });
      this.zombies.forEach((e) => { if (!e.dying) push(e.cell, e); });
      const extras = new Set();
      this.g.crates.forEach((c) => { if (!c.opened) extras.add(c.pos); });
      this.g.search.forEach((s) => extras.add(s.pos));
      this.overflow = new Map();
      groups.forEach((list, cell) => {
        const c = this.cellXY(cell);
        // не больше 9 мест в зоне: герои, затем самые опасные зомби; остальные — «+N» в последнем месте
        list.sort((a, b) => (a.uid ? 1 : 0) - (b.uid ? 1 : 0) || (b.uid ? ZG.Zombies.get(b.type).threat : 0) - (a.uid ? ZG.Zombies.get(a.type).threat : 0));
        const n = Math.min(9, list.length);
        const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
        const rows = Math.ceil(n / cols);
        const span = this.cell * (n === 1 ? 0 : 0.56);
        const r = this.cell * (n <= 1 ? 0.3 : n <= 4 ? 0.22 : 0.135);
        list.forEach((e, k) => {
          const slot = Math.min(k, 8);
          const cx = cols === 1 ? 0 : ((slot % cols) / (cols - 1) - 0.5) * span;
          const cy = rows === 1 ? 0 : (Math.floor(slot / cols) / (rows - 1) - 0.5) * span;
          e.tx = c.x + cx;
          e.ty = c.y + cy + (n === 1 && extras.has(cell) ? this.cell * 0.08 : 0);
          e.r = r * (e.uid && ZG.Zombies.get(e.type).big ? (n > 4 ? 1.15 : 1.35) : 1);
          e.over = list.length > 9 && k > 8;
          e.crowd = list.filter((q) => q.uid).length; e.slot = k;
          if (snap) { e.x = e.tx; e.y = e.ty; }
        });
        if (list.length > 9) this.overflow.set(cell, { x: list[8].tx, y: list[8].ty, n: list.length - 8, r });
      });
    }

    _darkFor() {
      if (!this.g) return 0;
      const ph = ZG.Engine.phase(this.g);
      return [0.2, 0.42, 0.58][ph] || 0.2;
    }

    // ------------------------------------------------------------ ввод
    _bind() {
      const pos = (ev) => {
        const r = this.canvas.getBoundingClientRect();
        return { x: ((ev.clientX - r.left) / r.width) * this.W, y: ((ev.clientY - r.top) / r.height) * this.H };
      };
      this.canvas.addEventListener('mousemove', (ev) => {
        if (!this.g) return;
        const p = pos(ev);
        const cell = this.cellAt(p.x, p.y);
        const z = this._zombieAt(p.x, p.y);
        const changed = !this.hover || this.hover.cell !== cell || this.hover.zombie !== (z && z.uid);
        this.hover = { cell, zombie: z && z.uid, x: p.x, y: p.y, cx: ev.clientX, cy: ev.clientY };
        if (this.onHover) this.onHover(this.hover, changed);
      });
      this.canvas.addEventListener('mouseleave', () => { this.hover = null; if (this.onHover) this.onHover(null, true); });
      this.canvas.addEventListener('click', (ev) => {
        if (!this.g || !this.onClick) return;
        const p = pos(ev);
        const z = this._zombieAt(p.x, p.y);
        this.onClick({ cell: this.cellAt(p.x, p.y), zombie: z && z.uid });
      });
    }
    _zombieAt(x, y) {
      let best = null, bd = Infinity;
      this.zombies.forEach((e) => {
        if (e.dying) return;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < e.r * 1.05 && d < bd) { bd = d; best = e; }
      });
      return best;
    }

    setHighlights(h) { this.highlights = h; }

    // =============================================== очередь анимаций
    play(events) {
      if (!events || !events.length) return Promise.resolve();
      return new Promise((resolve) => {
        this.queue.push({ events: events.slice(), resolve });
        if (!this.playing) this._next();
      });
    }
    get busy() { return this.playing || this.queue.length > 0; }

    async _next() {
      const job = this.queue.shift();
      if (!job) { this.playing = false; this._sync(); return; }
      this.playing = true;
      for (let i = 0; i < job.events.length; i++) {
        const ev = job.events[i];
        const nextEv = job.events[i + 1];
        let wait = 0;
        try { wait = this._handle(ev, nextEv) || 0; } catch (e) { console.error(e); }
        if (wait > 0) await this._wait(wait);
      }
      this.batch.clear();
      await this._wait(80);
      this._sync();
      job.resolve();
      this._next();
    }
    _wait(ms) { return new Promise((r) => setTimeout(r, ms / this.speed)); }

    // привести отображение в соответствие с моделью
    _sync(force) {
      const g = this.g;
      if (!g) return;
      // пока интерфейс проигрывает очередь событий, модель уже «впереди» — не прыгаем к её итогу,
      // иначе ещё не показанные шаги зомби выглядят как телепорт (полная сверка — в конце очереди)
      if (this.hold && !force) return;
      if (g.revealed) this.shown = g.revealed.slice();
      const alive = new Set(g.zombies.map((z) => z.uid));
      this.zombies.forEach((e, uid) => { if (!alive.has(uid) && !e.dying) this.zombies.delete(uid); });
      g.zombies.forEach((z) => {
        const e = this.zombies.get(z.uid);
        if (!e) this._addZombie(z.uid, z.type, z.pos, 1);
        else { e.cell = z.pos; e.awake = z.awake !== false; if (e.scale < 1 && !e.dying) e.scale = 1; }
      });
      g.heroes.forEach((h) => {
        const e = this.heroes.get(h.idx);
        if (h.onBoard) { if (!e) this._addHero(h.idx, h.pos); else { e.cell = h.pos; e.gone = false; e.alpha = 1; e.scale = 1; } }
        else if (e) e.gone = true;
      });
      this.targetDark = this._darkFor();
      this._layout(false);
    }

    _ent(ev) {
      if (ev.zombie) return this.zombies.get(ev.zombie);
      if (ev.hero != null) return this.heroes.get(ev.hero);
      return null;
    }
    _posOf(ev) {
      const e = this._ent(ev);
      if (e) return { x: e.x, y: e.y };
      if (ev.pos != null) return this.cellXY(ev.pos);
      return { x: this.W / 2, y: this.H / 2 };
    }

    _handle(ev, nextEv) {
      const C = this.cell;
      if (ZG.Sound && ZG.Sound.sfx) {
        const k = ev.t === 'hit' ? (ev.kind === 'melee' ? 'punch' : 'hit') : ev.t === 'play' ? (ev.chain ? 'chain' : 'card') : SFX_MAP[ev.t];
        if (k) ZG.Sound.sfx(k);
      }
      switch (ev.t) {
        case 'zmove': {
          // все шаги одной волны идут разом; между волнами — пауза (событие zwave)
          const e = this.zombies.get(ev.zombie);
          if (!e) return 0;
          e.cell = ev.to; e.hop = 1;
          this._layout(false);
          this._dust(this.cellXY(ev.to), 3, '#6b5d4a');
          if (ZG.Sound && ZG.Sound.sfx) ZG.Sound.sfx('step', { soft: true });
          return nextEv && (nextEv.t === 'zmove' || nextEv.t === 'bash') ? 0 : 420;
        }
        case 'zwave': return 420;
        case 'zwake': {
          const e = this.zombies.get(ev.zombie);
          if (!e) return 0;
          e.awake = true; e.flash = 1;
          this._float(e.x, e.y - this.cell * 0.32, ev.sound ? '?!' : '!', '#ff5a3a', 1.3);
          if (ZG.Sound && ZG.Sound.sfx) ZG.Sound.sfx('wake', { soft: true });
          return 60;
        }
        case 'zsleep': {
          const e = this.zombies.get(ev.zombie);
          if (!e) return 0;
          e.awake = false;
          this._float(e.x, e.y - this.cell * 0.32, '?', '#9aa4b0', 1.1);
          return 40;
        }
        case 'hmove': {
          const e = this.heroes.get(ev.hero);
          if (!e) return 0;
          e.cell = ev.to; e.hop = 1;
          this._layout(false);
          this._dust(this.cellXY(ev.to), 4, '#8a7a66');
          return 260;
        }
        case 'spawn': {
          if (!this.zombies.has(ev.zombie)) this._addZombie(ev.zombie, ev.ztype, ev.pos, 0);
          this._layout(false);
          const p = this.cellXY(ev.pos);
          this._ring(p, '#6e8b4c', C * 0.5, 500);
          this._dust(p, 10, '#3a3028');
          return 110;
        }
        case 'attack': {
          if (ZG.Sound) ZG.Sound.play('growl');
          const z = this.zombies.get(ev.zombie);
          const h = this.heroes.get(ev.hero);
          if (z && h) {
            z.lunge = { t0: this.time, tx: h.x, ty: h.y };
            setTimeout(() => { h.flash = 1; h.flashColor = '#c0392b'; this._blood({ x: h.x, y: h.y }, 5); }, 160 / this.speed);
          }
          return 170;
        }
        case 'hit': {
          const e = this.zombies.get(ev.zombie);
          const p = e ? { x: e.x, y: e.y } : this.cellXY(ev.pos);
          if (e) { e.flash = 1; e.shakeT = this.time; }
          this._float(p.x, p.y - C * 0.2, '−' + ev.n, ev.n > 0 ? '#ffd36b' : '#999', 1.1);
          this._blood(p, 4 + ev.n * 2);
          this.addShake(2 + ev.n);
          return 150;
        }
        case 'kill': {
          const e = this.zombies.get(ev.zombie);
          if (e) { e.dying = { t0: this.time }; this._splat(e.x, e.y, e.r * 1.4); this._blood({ x: e.x, y: e.y }, 14); }
          const p = e ? e : this.cellXY(ev.pos);
          this._float(p.x, p.y - C * 0.35, '✝', '#e8dcc0', 1.3);
          return 220;
        }
        case 'shot': {
          const from = this.heroes.get(ev.hero) || this.cellXY(ev.from);
          const to = ev.to != null ? this.cellXY(ev.to) : from;
          this.effects.push({ type: 'tracer', x1: from.x, y1: from.y, x2: to.x, y2: to.y, t0: this.time, dur: 0.28 });
          this._spark(from, 10, '#ffd36b');
          this.addShake(5);
          this.flash = { color: 'rgba(255,220,150,0.12)', t0: this.time, dur: 0.12 };
          return 220;
        }
        case 'zone': {
          const p = this.cellXY(ev.pos);
          if (ev.kind === 'fire') {
            this.effects.push({ type: 'fire', x: p.x, y: p.y, t0: this.time, dur: 1.4 });
            this._spark(p, 30, '#ff8a1c');
            this._scorch(p.x, p.y, C * 0.45);
            this.addShake(8);
          } else this._ring(p, ev.kind === 'ranged' ? '#ffd36b' : '#e74c3c', C * 0.55, 350);
          return 120;
        }
        case 'explode': {
          const p = this.cellXY(ev.pos);
          this.effects.push({ type: 'boom', x: p.x, y: p.y, t0: this.time, dur: 0.7 });
          this._spark(p, 40, '#ffb347');
          this._dust(p, 16, '#444');
          this._scorch(p.x, p.y, C * 0.5);
          this.addShake(14);
          this.flash = { color: 'rgba(255,200,120,0.35)', t0: this.time, dur: 0.25 };
          return 420;
        }
        case 'noise': {
          const p = this.cellXY(ev.pos);
          for (let i = 0; i < Math.min(3, ev.n); i++) setTimeout(() => this._ring(p, '#e0a83a', C * (0.7 + i * 0.2), 700), i * 120);
          return 0;
        }
        case 'wound': {
          const h = this.heroes.get(ev.hero);
          const p = h || this.cellXY(ev.pos);
          if (h) { h.flash = 1; h.flashColor = '#ff2a1a'; }
          this._float(p.x, p.y - C * 0.3, '−' + ev.n + ' ♥', '#ff4a3a', 1.4);
          this._blood(p, 12);
          this.addShake(10);
          this.flash = { color: 'rgba(160,0,0,0.25)', t0: this.time, dur: 0.35 };
          return 450;
        }
        case 'blocked': {
          const h = this.heroes.get(ev.hero);
          const p = h || this.cellXY(ev.pos);
          this.effects.push({ type: 'bubble', ent: h, x: p.x, y: p.y, t0: this.time, dur: 0.7, color: '#8fc3ff' });
          this._float(p.x, p.y - C * 0.42, 'блок ' + ev.n, '#9fd0ff', 1);
          return 320;
        }
        case 'heal': {
          const h = this.heroes.get(ev.hero);
          const p = h || this.cellXY(ev.pos);
          for (let i = 0; i < 10; i++) this.particles.push({ x: p.x + (Math.random() - 0.5) * C * 0.4, y: p.y, vx: 0, vy: -30 - Math.random() * 40, life: 1.2, t: 0, size: C * 0.08, color: '#6fe08a', shape: 'plus' });
          this._float(p.x, p.y - C * 0.35, '+' + ev.n + ' ♥', '#6fe08a', 1.1);
          return 300;
        }
        case 'shield': {
          const h = this.heroes.get(ev.hero);
          const p = h || this.cellXY(ev.pos);
          this.effects.push({ type: 'bubble', ent: h, x: p.x, y: p.y, t0: this.time, dur: 0.9, color: '#8fa3b5' });
          return 200;
        }
        case 'adrenaline': {
          const p = this._posOf(ev);
          this._spark(p, 14, '#ffd36b');
          this._float(p.x, p.y - C * 0.35, '+' + ev.n + ' ⚡', '#ffd36b', 1);
          return 250;
        }
        case 'hidden': {
          const p = this._posOf(ev);
          this._dust(p, 18, '#556');
          return 300;
        }
        case 'lure': {
          const from = ev.from != null ? this.cellXY(ev.from) : this.cellXY(ev.pos);
          const to = this.cellXY(ev.pos);
          this.effects.push({ type: 'arc', x1: from.x, y1: from.y, x2: to.x, y2: to.y, t0: this.time, dur: 0.5 });
          setTimeout(() => { this._ring(to, '#e0a83a', C * 0.8, 800); this._spark(to, 12, '#ffd36b'); }, 500 / this.speed);
          return 550;
        }
        case 'trap': { this._ring(this.cellXY(ev.pos), '#c0392b', C * 0.4, 400); return 200; }
        case 'barricade': {
          const a = this.cellXY(ev.a), b = this.cellXY(ev.b);
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          this._dust(m, 12, '#8a6a3a'); this.addShake(4);
          return 250;
        }
        case 'bash': {
          const a = this.cellXY(ev.pos), b = this.cellXY(ev.to);
          this._spark({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 8, '#c9a46a');
          this.addShake(3);
          return 120;
        }
        case 'suppress': {
          const p = this.cellXY(ev.pos);
          for (let i = 0; i < 6; i++) setTimeout(() => this._spark({ x: p.x + (Math.random() - 0.5) * C * 0.7, y: p.y + (Math.random() - 0.5) * C * 0.7 }, 4, '#ffd36b'), i * 50);
          return 300;
        }
        case 'levelup': {
          const p = this._posOf(ev);
          this.effects.push({ type: 'pillar', x: p.x, y: p.y, t0: this.time, dur: 1.2, color: '#f0c040' });
          this._spark(p, 30, '#f0c040');
          return 500;
        }
        case 'evac': {
          const h = this.heroes.get(ev.hero);
          if (h) {
            this.effects.push({ type: 'pillar', x: h.x, y: h.y, t0: this.time, dur: 1.4, color: '#bfe8ff' });
            h.evacT = this.time;
          }
          return 900;
        }
        case 'fall': {
          const h = this.heroes.get(ev.hero);
          if (h) { h.fallT = this.time; this._splat(h.x, h.y, this.cell * 0.4); }
          this.flash = { color: 'rgba(120,0,0,0.5)', t0: this.time, dur: 0.8 };
          this.addShake(16);
          return 1100;
        }
        case 'infect': {
          const h = this.heroes.get(ev.hero);
          const p = h || this.cellXY(ev.pos);
          if (h) { h.flash = 1; h.flashColor = '#9be04a'; }
          this._float(p.x, p.y - C * 0.55, '☣ ×' + ev.n, '#9be04a', 1.5);
          for (let i = 0; i < 14; i++) this.particles.push({ x: p.x + (Math.random() - 0.5) * C * 0.4, y: p.y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 1.4, t: 0, size: C * (0.03 + Math.random() * 0.04), color: '#9be04a', shape: 'puff' });
          return 380;
        }
        case 'infectTick': {
          const h = this.heroes.get(ev.hero);
          const p = h || this.cellXY(ev.pos);
          this._float(p.x, p.y - C * 0.5, '☣', '#c8ff6a', 1.8);
          this._ring(p, '#9be04a', C * 0.6, 600);
          return 300;
        }
        case 'turn_hero': {
          // многошаговое обращение: зелёная вспышка → судороги → фишка «переворачивается»
          const h = this.heroes.get(ev.hero);
          const p = h || this.cellXY(ev.pos);
          if (ZG.Sound) ZG.Sound.play('growl', { rate: 0.8 });
          if (h) { h.flash = 1; h.flashColor = '#9be04a'; h.shakeT = this.time; }
          this._ring(p, '#9be04a', C * 0.9, 900);
          this.flash = { color: 'rgba(80,140,30,0.35)', t0: this.time, dur: 0.6 };
          setTimeout(() => {
            if (h) h.fallT = this.time;
            this.effects.push({ type: 'pillar', x: p.x, y: p.y, t0: this.time, dur: 1.1, color: '#9be04a' });
            this._spark(p, 26, '#c8ff6a');
            this.addShake(12);
          }, 450 / this.speed);
          return 1000;
        }
        case 'crate': {
          const p = this.cellXY(ev.pos);
          this._spark(p, ev.found ? 30 : 12, ev.found ? '#f0c040' : '#c9a46a');
          if (ev.found) this.effects.push({ type: 'pillar', x: p.x, y: p.y, t0: this.time, dur: 1, color: '#f0c040' });
          return ev.found ? 500 : 250;
        }
        case 'loot': {
          const p = this.cellXY(ev.pos);
          this._spark(p, 10, '#e8dcc0');
          return 200;
        }
        case 'ambush': {
          if (ZG.Sound) ZG.Sound.play('growl', { rate: 1.15 });
          const p = this.cellXY(ev.pos);
          this._float(p.x, p.y - C * 0.45, 'ЗАСАДА!', '#ff4a3a', 1.5);
          this.flash = { color: 'rgba(160,0,0,0.3)', t0: this.time, dur: 0.4 };
          this.addShake(8);
          return 400;
        }
        case 'objective': {
          const p = this.cellXY(ev.pos);
          this._float(p.x, p.y - C * 0.4, ev.text, '#f0c040', 1.5);
          this.effects.push({ type: 'pillar', x: p.x, y: p.y, t0: this.time, dur: 1, color: '#f0c040' });
          return 450;
        }
        case 'play': {
          const h = this.heroes.get(ev.hero);
          if (h) {
            const def = ZG.Cards.get(this.g.cards[ev.card] || 'strike');
            const s = ZG.SUITS[def.suit] || ZG.SUITS.none;
            this._ring(h, s.color, this.cell * (ev.chain ? 0.7 : 0.45), ev.chain ? 600 : 350);
            if (ev.chain) this._spark(h, 16, s.color);
          }
          return 120;
        }
        case 'dayphase': this.targetDark = this._darkFor(); return 0;
        case 'reveal': {
          if (ZG.Sound) ZG.Sound.play('reveal');
          // многошаговый переворот тайла: подъём → поворот ребром → открытие с пылью
          this.flips[ev.tile] = this.time;
          const t = this.g.board.tiles[ev.tile];
          const cx = this.pad + (t.tx * 3 + 1.5) * C, cy = this.pad + (t.ty * 3 + 1.5) * C;
          setTimeout(() => {
            if (this.shown) this.shown[ev.tile] = true;
            this._dust({ x: cx, y: cy }, 26, '#5a4a3a');
            this.addShake(ev.n ? 9 : 4);
            if (ev.n) this._float(cx, cy - C * 0.6, `☠ ${ev.n}`, '#ff6a5a', 1.6);
          }, 380 / this.speed);
          return ev.n ? 900 : 650;
        }
        case 'bump': {
          const h = this.heroes.get(ev.hero), to = this.cellXY(ev.to);
          if (h) { h.lunge = { t0: this.time, tx: to.x, ty: to.y }; }
          this._float(to.x, to.y - C * 0.2, 'стена!', '#e8dcc0', 1);
          this.addShake(3);
          return 300;
        }
        case 'wave': this.effects.push({ type: 'siren', t0: this.time, dur: 1.6 }); this.addShake(6); return 300;
        default: return 0;
      }
    }

    // --------------------------------------------------------- частицы
    addShake(n) { this.shake = Math.min(22, this.shake + n); }
    _float(x, y, text, color, scale) { this.floats.push({ x, y, text, color, scale: scale || 1, t: 0, life: 1.3 }); }
    _ring(p, color, r, ms) { this.effects.push({ type: 'ring', x: p.x, y: p.y, color, r, t0: this.time, dur: ms / 1000 }); }
    _dust(p, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = 10 + Math.random() * 30;
        this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5, t: 0, size: this.cell * (0.04 + Math.random() * 0.05), color, shape: 'puff' });
      }
    }
    _spark(p, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = 40 + Math.random() * 140;
        this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.5, t: 0, size: 1.5 + Math.random() * 2.5, color, shape: 'spark', drag: 3 });
      }
    }
    _blood(p, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = 20 + Math.random() * 90;
        this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, t: 0, size: 1.5 + Math.random() * 3, color: '#7a0c06', shape: 'drop', drag: 4, decal: Math.random() < 0.35 });
      }
    }
    _splat(x, y, r) {
      const c = this.decals.getContext('2d');
      c.save(); c.scale(this.dpr, this.dpr);
      c.fillStyle = 'rgba(90,8,4,0.55)';
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * TAU, d = Math.random() * r * 0.8;
        c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.15 + Math.random() * 0.3), 0, TAU); c.fill();
      }
      c.restore();
    }
    _scorch(x, y, r) {
      const c = this.decals.getContext('2d');
      c.save(); c.scale(this.dpr, this.dpr);
      const gr = c.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, 'rgba(10,8,6,.6)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.restore();
    }

    // ============================================================ кадр
    _loop(ts) {
      const now = ts / 1000;
      const dt = Math.min(0.05, now - (this._last || now));
      this._last = now;
      this.time += dt * this.speed;
      if (this.g && this.staticLayer) this._frame(dt * this.speed);
      requestAnimationFrame(this._loop);
    }

    _frame(dt) {
      const ctx = this.ctx;
      const g = this.g;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      // тряска
      this.shake = Math.max(0, this.shake - dt * 40);
      const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
      ctx.save();
      ctx.translate(sx, sy);

      // вступление: тайлы падают по одному
      const intro = this.intro;
      if (intro) {
        const k = (performance.now() - intro.t0) / intro.dur;
        if (k >= 1) this.intro = null;
        else { this._drawIntro(ctx, k); ctx.restore(); return; }
      }

      ctx.drawImage(this.staticLayer, 0, 0, this.W, this.H);
      ctx.drawImage(this.decals, 0, 0, this.W, this.H);
      this._drawTokens(ctx);
      this._drawFog(ctx);
      this._drawHighlights(ctx);

      // движение фишек
      const k = 1 - Math.pow(0.0005, dt);
      const ents = [];
      this.zombies.forEach((e) => ents.push(e));
      this.heroes.forEach((e) => ents.push(e));
      ents.forEach((e) => {
        if (e.tx == null) { e.tx = e.x; e.ty = e.y; }
        e.x += (e.tx - e.x) * k * 1.2;
        e.y += (e.ty - e.y) * k * 1.2;
        e.hop = Math.max(0, (e.hop || 0) - dt * 3.2);
        e.flash = Math.max(0, (e.flash || 0) - dt * 3);
        if (e.scale < 1 && !e.dying && !e.fallT && !e.evacT) e.scale = Math.min(1, e.scale + dt * 3.5);
      });
      // зомби снизу вверх по экрану, герои — всегда поверх зомби
      ents.sort((a, b) => (a.uid ? 0 : 1) - (b.uid ? 0 : 1) || a.y - b.y);
      ents.forEach((e) => (e.uid ? this._drawZombie(ctx, e) : this._drawHero(ctx, e)));
      // удалить умерших
      this.zombies.forEach((e, uid) => { if (e.dying && this.time - e.dying.t0 > 0.6) this.zombies.delete(uid); });

      (this.overflow || new Map()).forEach((o, cell) => {
        if (this.hiddenCell(cell)) return;
        ctx.save();
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.05, 0, TAU); ctx.fillStyle = 'rgba(60,8,4,.92)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#ff6a5a'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `${Math.round(o.r * 0.9)}px 'Russo One', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+' + o.n, o.x, o.y + 1);
        ctx.restore();
      });
      this._drawEffects(ctx, dt);
      this._drawParticles(ctx, dt);
      this._drawLighting(ctx, dt);
      this._drawWeather(ctx);
      this._drawFloats(ctx, dt);
      ctx.restore();

      if (this.flash) {
        const f = (this.time - this.flash.t0) / this.flash.dur;
        if (f >= 1) this.flash = null;
        else { ctx.fillStyle = this.flash.color; ctx.globalAlpha = 1 - f; ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1; }
      }
    }

    _drawIntro(ctx, k) {
      const g = this.g, b = g.board;
      ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, this.W, this.H);
      const n = b.tiles.length;
      const T = 3 * this.cell;
      b.tiles.forEach((t, i) => {
        const start = (i / n) * 0.6;
        let p = Math.max(0, Math.min(1, (k - start) / 0.3));
        if (p <= 0) return;
        const e = ease.back(p);
        const sxp = this.pad + t.tx * T, syp = this.pad + t.ty * T;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p * 2);
        ctx.translate(sxp + T / 2, syp + T / 2 - (1 - e) * 60);
        ctx.rotate((1 - e) * (i % 2 ? 0.25 : -0.25));
        ctx.scale(0.8 + e * 0.2, 0.8 + e * 0.2);
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 30 * (1 - p) + 4; ctx.shadowOffsetY = 12 * (1 - p);
        ctx.drawImage(this.staticLayer, sxp * this.dpr, syp * this.dpr, T * this.dpr, T * this.dpr, -T / 2, -T / 2, T, T);
        ctx.restore();
      });
      if (k > 0.75) {
        const a = (k - 0.75) / 0.25;
        ctx.globalAlpha = a;
        this._drawTokens(ctx);
        ctx.globalAlpha = 1;
      }
    }

    // ---------------------------------------------------------- жетоны
    _drawTokens(ctx) {
      const g = this.g, C = this.cell, t = this.time;
      // точки появления
      g.spawnPoints.forEach((p, i) => {
        const c = this.cellXY(p);
        const x = c.x + C * 0.22, y = c.y - C * 0.22, s = C * 0.42;
        const pulse = 0.5 + Math.sin(t * 3 + i) * 0.5;
        const gl = ctx.createRadialGradient(x, y, s * 0.2, x, y, s);
        gl.addColorStop(0, `rgba(200,40,20,${0.25 + pulse * 0.25})`); gl.addColorStop(1, 'rgba(200,40,20,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
        Art.draw(ctx, 'tok_spawn', x - s / 2, y - s / 2, s, s, {});
      });
      // выход
      const sc = ZG.Scenarios.get(g.scenarioId);
      const ex = this.cellXY(g.exit);
      const open = ZG.Engine.isComplete(g);
      if (open) {
        const gl = ctx.createRadialGradient(ex.x, ex.y, 2, ex.x, ex.y, C * 0.7);
        const pulse = 0.35 + Math.sin(t * 4) * 0.15;
        gl.addColorStop(0, `rgba(120,255,160,${pulse})`); gl.addColorStop(1, 'rgba(120,255,160,0)');
        ctx.fillStyle = gl; ctx.fillRect(ex.x - C, ex.y - C, C * 2, C * 2);
      }
      ctx.save();
      ctx.globalAlpha = open ? 1 : 0.85;
      Art.draw(ctx, sc.exitArt || 'exit_car', ex.x - C * 0.32, ex.y - C * 0.42, C * 0.64, C * 0.84, { arrived: open, t });
      ctx.restore();
      this._label(ctx, ex.x, ex.y - C * 0.44, (sc.exitLabel || 'Выход').toUpperCase(), open ? '#7dffa0' : '#e8dcc0');
      // вышка
      if (g.tower != null) {
        const c = this.cellXY(g.tower);
        Art.draw(ctx, 'tok_tower', c.x - C * 0.4, c.y - C * 0.45, C * 0.5, C * 0.6, { on: g.obj.on });
        this._label(ctx, c.x, c.y + C * 0.42, 'ВЫШКА', g.obj.on ? '#ff8a7a' : '#e8dcc0');
      }
      // ящики и обыск
      g.crates.forEach((cr) => {
        const c = this.cellXY(cr.pos);
        const s = C * 0.36;
        const bob = cr.opened ? 0 : Math.sin(t * 2 + cr.pos) * 1.5;
        Art.draw(ctx, 'tok_crate', c.x - s / 2 - C * 0.24, c.y - s / 2 - C * 0.24 + bob, s, s, { opened: cr.opened });
      });
      g.search.forEach((s) => {
        const c = this.cellXY(s.pos);
        const sz = C * 0.3;
        Art.draw(ctx, 'tok_search', c.x - sz / 2 - C * 0.26, c.y - sz / 2 - C * 0.26, sz, sz, { armory: s.kind === 'armory' });
      });
      g.drops.forEach((d) => {
        const c = this.cellXY(d.pos);
        Art.draw(ctx, 'tok_drop', c.x + C * 0.12, c.y - C * 0.45, C * 0.3, C * 0.3, { card: d.card });
      });
      g.traps.forEach((tr) => {
        const c = this.cellXY(tr.pos);
        Art.draw(ctx, 'tok_trap', c.x - C * 0.18 + C * 0.24, c.y - C * 0.18 + C * 0.24, C * 0.36, C * 0.36, {});
      });
      g.lures.forEach((l) => {
        const c = this.cellXY(l.pos);
        Art.draw(ctx, 'tok_lure', c.x - C * 0.3, c.y - C * 0.3, C * 0.6, C * 0.6, { t });
      });
      // последний след: охотники, которые никого не видят, идут сюда
      if (g.stealth) {
        const trails = new Set();
        g.zombies.forEach((z) => { if (z.awake && z.trail != null && z.trail !== z.pos && !g.heroes.some((hh) => hh.onBoard && hh.pos === z.trail)) trails.add(z.trail); });
        trails.forEach((cell) => {
          const c = this.cellXY(cell);
          ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.15; ctx.fillStyle = '#c0392b';
          for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.ellipse(c.x - C * 0.08 + k * C * 0.16, c.y + C * 0.12 - k * C * 0.14, C * 0.05, C * 0.08, 0.3, 0, TAU); ctx.fill(); }
          ctx.font = `bold ${Math.round(C * 0.16)}px 'Russo One', sans-serif`; ctx.textAlign = 'center'; ctx.fillText('?', c.x + C * 0.2, c.y - C * 0.12);
          ctx.restore();
        });
      }
      // помещения-укрытия с героями: зелёный контур и подпись
      if (g.doors) {
        const done = new Set();
        g.heroes.forEach((hh) => {
          if (!ZG.Engine.sheltered(g, hh)) return;
          const bld = g.board.cells[hh.pos].bld;
          if (done.has(bld)) return; done.add(bld);
          const cells = g.board.cells.filter((c) => c.bld === bld);
          ctx.save();
          ctx.strokeStyle = `rgba(111,224,138,${0.55 + Math.sin(t * 2) * 0.2})`; ctx.lineWidth = 3; ctx.setLineDash([8, 5]);
          cells.forEach((c) => { const p = this.cellXY(c.i); ctx.strokeRect(p.x - C / 2 + 4, p.y - C / 2 + 4, C - 8, C - 8); });
          ctx.setLineDash([]);
          const p0 = this.cellXY(cells[0].i);
          ctx.font = `bold ${Math.max(10, Math.round(C * 0.13))}px 'Russo One', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          const tw = ctx.measureText('УКРЫТИЕ').width + 10;
          ctx.fillStyle = 'rgba(10,30,15,.85)'; Art.rr(ctx, p0.x - tw / 2, p0.y - C / 2 + 6, tw, C * 0.17, 4); ctx.fill();
          ctx.fillStyle = '#8ff0a6'; ctx.fillText('УКРЫТИЕ', p0.x, p0.y - C / 2 + 8);
          ctx.restore();
        });
      }
      // двери на входах в помещения: закрытая — створка поперёк прохода, открытая — распахнута
      if (g.doors) {
        if (!this.entranceList || this.entranceBoard !== g.board) {
          const seen = new Set(); this.entranceList = []; this.entranceBoard = g.board;
          g.board.cells.forEach((c) => { if (c.bld) g.board.adj[c.i].forEach((n) => { if (g.board.cells[n].bld !== c.bld) { const k = Math.min(c.i, n) + '-' + Math.max(c.i, n); if (!seen.has(k)) { seen.add(k); this.entranceList.push([c.i, n, k]); } } }); });
        }
        this.entranceList.forEach(([ia, ib, k]) => {
          if (ZG.Engine.hidden(g, ia) && ZG.Engine.hidden(g, ib)) return;
          const a = this.cellXY(ia), b = this.cellXY(ib);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const horiz = Math.abs(a.x - b.x) > 1; // соседи по горизонтали — дверь вертикальная
          const open = !!g.doors[k];
          ctx.save();
          ctx.translate(mx, my);
          if (horiz) ctx.rotate(Math.PI / 2);
          const L = C * 0.5, T = C * 0.12;
          if (open) {
            // открытый проём: пунктир + распахнутая створка
            ctx.setLineDash([C * 0.05, C * 0.04]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(168,200,190,.7)';
            ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke(); ctx.setLineDash([]);
            ctx.save(); ctx.translate(-L / 2, 0); ctx.rotate(-1.2);
            Art.rr(ctx, 0, -T * 0.35, L * 0.9, T * 0.7, 2); ctx.fillStyle = '#4f6b66'; ctx.fill();
            ctx.lineWidth = 1.2; ctx.strokeStyle = '#0d1412'; ctx.stroke();
            ctx.restore();
          } else {
            // закрытая: стальная створка с обводкой и ручкой
            Art.rr(ctx, -L / 2, -T / 2, L, T, 3); ctx.fillStyle = '#5f8079'; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = '#0d1412'; ctx.stroke();
            ctx.strokeStyle = 'rgba(220,240,230,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-L / 2 + 3, -T * 0.18); ctx.lineTo(L / 2 - 3, -T * 0.18); ctx.stroke();
            ctx.fillStyle = '#f0d070'; ctx.beginPath(); ctx.arc(L * 0.3, 0, T * 0.25, 0, TAU); ctx.fill(); ctx.strokeStyle = '#0d1412'; ctx.stroke();
          }
          ctx.restore();
        });
      }
      // баррикады — на границе зон
      g.barricades.forEach((bz) => {
        const a = this.cellXY(bz.a), b = this.cellXY(bz.b);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const horiz = Math.abs(a.x - b.x) > 1;
        ctx.save();
        ctx.translate(mx, my);
        if (horiz) ctx.rotate(Math.PI / 2);
        for (let i = -1; i <= 1; i++) {
          ctx.save();
          ctx.rotate(i * 0.12);
          Art.rr(ctx, -C * 0.42, i * C * 0.06 - C * 0.035, C * 0.84, C * 0.07, 2);
          ctx.fillStyle = i ? '#8a6a3a' : '#a07a42'; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = '#2a1c0c'; ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = '#d8d0c0';
        for (let i = 0; i < bz.hp; i++) { ctx.beginPath(); ctx.arc(-C * 0.3 + i * C * 0.1, -C * 0.12, C * 0.03, 0, TAU); ctx.fill(); }
        ctx.restore();
      });
      // события: газ, выживший, помеченный ящик
      if (g.hazard) {
        const c = this.cellXY(g.hazard.pos);
        const pulse = 0.5 + Math.sin(t * 5) * 0.5;
        const gr = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, C * 0.5);
        gr.addColorStop(0, `rgba(140,220,60,${0.35 + pulse * 0.25})`); gr.addColorStop(1, 'rgba(140,220,60,0)');
        ctx.fillStyle = gr; ctx.fillRect(c.x - C / 2, c.y - C / 2, C, C);
        this._label(ctx, c.x, c.y - C * 0.4, '☢ ГАЗ', '#c8ff7a');
      }
      if (g.survivor) {
        const c = this.cellXY(g.survivor.pos);
        const s = C * 0.34 * (1 + Math.sin(t * 6) * 0.06);
        ctx.save(); ctx.beginPath(); ctx.arc(c.x + C * 0.24, c.y + C * 0.22, s / 2, 0, TAU); ctx.fillStyle = '#e8e8e8'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#f0c040'; ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.font = `bold ${Math.round(C * 0.11)}px 'Russo One', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SOS', c.x + C * 0.24, c.y + C * 0.23); ctx.restore();
      }
      g.crates.forEach((cr) => {
        if (!cr.known || cr.opened) return;
        const c = this.cellXY(cr.pos);
        ctx.strokeStyle = `rgba(240,192,64,${0.6 + Math.sin(t * 4) * 0.4})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(c.x - C * 0.24, c.y - C * 0.24, C * 0.24, 0, TAU); ctx.stroke();
      });
      // шум
      Object.keys(g.noise).forEach((cell) => {
        const c = this.cellXY(+cell);
        Art.draw(ctx, 'noiseIcon', c.x + C * 0.22, c.y - C * 0.46, C * 0.22, C * 0.22);
      });
    }

    _label(ctx, x, y, text, color) {
      ctx.save();
      ctx.font = `bold ${Math.round(this.cell * 0.11)}px 'Russo One', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = 'rgba(10,8,6,.75)';
      Art.rr(ctx, x - w / 2, y - this.cell * 0.075, w, this.cell * 0.15, 3); ctx.fill();
      ctx.fillStyle = color; ctx.fillText(text, x, y + 1);
      ctx.restore();
    }

    _drawHighlights(ctx) {
      const h = this.highlights;
      const C = this.cell;
      const t = this.time;
      if (this.hover && this.hover.cell != null) {
        const c = this.cellXY(this.hover.cell);
        ctx.strokeStyle = 'rgba(255,240,200,.35)'; ctx.lineWidth = 2;
        ctx.strokeRect(c.x - C / 2 + 2, c.y - C / 2 + 2, C - 4, C - 4);
      }
      if (!h) return;
      const pulse = 0.5 + Math.sin(t * 5) * 0.5;
      (h.cells || []).forEach((cell) => {
        const c = this.cellXY(cell);
        ctx.fillStyle = h.color || 'rgba(240,192,64,.18)';
        ctx.globalAlpha = 0.5 + pulse * 0.5;
        ctx.fillRect(c.x - C / 2 + 3, c.y - C / 2 + 3, C - 6, C - 6);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = h.stroke || '#f0c040'; ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 30;
        ctx.strokeRect(c.x - C / 2 + 4, c.y - C / 2 + 4, C - 8, C - 8);
        ctx.setLineDash([]);
        if (h.explore && h.explore.includes(cell)) {
          ctx.save();
          ctx.font = `${Math.round(C * 0.42)}px 'Russo One', sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.55 + pulse * 0.4;
          ctx.fillStyle = '#ffd36b'; ctx.fillText('?', c.x, c.y);
          ctx.font = `bold ${Math.round(C * 0.1)}px 'Russo One', sans-serif`;
          ctx.fillText('РАЗВЕДКА', c.x, c.y + C * 0.28);
          ctx.restore();
        }
        if (h.costs && h.costs[cell] != null) {
          ctx.font = `bold ${Math.round(C * 0.14)}px 'Russo One', sans-serif`;
          ctx.fillStyle = '#ffd36b'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.fillText(h.costs[cell] + '⚡', c.x + C / 2 - 8, c.y - C / 2 + 8);
          ctx.textBaseline = 'alphabetic';
        }
      });
      (h.zombies || []).forEach((uid) => {
        const e = this.zombies.get(uid);
        if (!e) return;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.15 + pulse * 0.1), 0, TAU);
        ctx.strokeStyle = h.zstroke || '#ff5040'; ctx.lineWidth = 3; ctx.stroke();
        // прицел
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(t);
        ctx.strokeStyle = 'rgba(255,80,64,.8)'; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(e.r * 1.3, 0); ctx.lineTo(e.r * 1.6, 0); ctx.stroke(); }
        ctx.restore();
      });
      if (h.path) {
        ctx.strokeStyle = 'rgba(240,192,64,.7)'; ctx.lineWidth = 3; ctx.setLineDash([2, 8]);
        ctx.beginPath();
        h.path.forEach((cell, i) => { const c = this.cellXY(cell); if (i) ctx.lineTo(c.x, c.y); else ctx.moveTo(c.x, c.y); });
        ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // ---------------------------------------------------------- фишки
    hiddenCell(cell) {
      if (!this.shown) return false;
      return !this.shown[this.g.board.cells[cell].tile];
    }

    // рубашки закрытых тайлов: что известно — люки, ящики, вышка; скопление зомби — числом
    _drawFog(ctx) {
      if (!this.shown) return;
      const g = this.g, b = g.board, C = this.cell, T = 3 * C, t = this.time;
      b.tiles.forEach((tile, ti) => {
        const flip = this.flips[ti];
        if (this.shown[ti] && (flip == null || t - flip > 0.75)) return;
        let sx = 1, lift = 0;
        if (flip != null) {
          const k = Math.min(1, (t - flip) / 0.75);
          lift = Math.sin(Math.min(1, k * 2) * Math.PI / 2) * 10;
          sx = k < 0.5 ? 1 - k * 2 : 0;
          if (sx <= 0.01) return;
        }
        const x = this.pad + tile.tx * T, y = this.pad + tile.ty * T;
        ctx.save();
        ctx.translate(x + T / 2, y + T / 2 - lift);
        ctx.scale(sx, 1);
        ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 10 + lift; ctx.shadowOffsetY = 4 + lift;
        const gr = ctx.createLinearGradient(-T / 2, -T / 2, T / 2, T / 2);
        gr.addColorStop(0, '#2b211a'); gr.addColorStop(1, '#1a1410');
        ctx.fillStyle = gr; ctx.fillRect(-T / 2 + 2, -T / 2 + 2, T - 4, T - 4);
        ctx.shadowColor = 'transparent';
        ctx.save();
        ctx.beginPath(); ctx.rect(-T / 2 + 2, -T / 2 + 2, T - 4, T - 4); ctx.clip();
        ctx.strokeStyle = 'rgba(224,168,58,.06)'; ctx.lineWidth = C * 0.12;
        for (let i = -T; i < T * 2; i += C * 0.35) { ctx.beginPath(); ctx.moveTo(-T / 2 + i, -T / 2); ctx.lineTo(-T / 2 + i - T, T / 2); ctx.stroke(); }
        // клубящийся туман
        for (let i = 0; i < 5; i++) {
          const fx = Math.sin(t * 0.3 + i * 1.7 + ti) * T * 0.3, fy = Math.cos(t * 0.25 + i * 2.1 + ti) * T * 0.3;
          const fg = ctx.createRadialGradient(fx, fy, 2, fx, fy, T * 0.45);
          fg.addColorStop(0, 'rgba(150,140,130,.10)'); fg.addColorStop(1, 'rgba(150,140,130,0)');
          ctx.fillStyle = fg; ctx.fillRect(-T / 2, -T / 2, T, T);
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(224,168,58,.35)'; ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
        ctx.strokeRect(-T / 2 + 6, -T / 2 + 6, T - 12, T - 12); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(232,220,192,.18)'; ctx.font = `${Math.round(C * 1.1)}px 'Russo One', sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, -C * 0.1);
        ctx.fillStyle = 'rgba(232,220,192,.55)'; ctx.font = `${Math.round(C * 0.12)}px 'Russo One', sans-serif`;
        ctx.fillText('НЕ РАЗВЕДАНО', 0, C * 0.55);
        // известные объекты
        const icons = [];
        g.spawnPoints.forEach((p) => { if (b.cells[p].tile === ti) icons.push('tok_spawn'); });
        g.crates.forEach((c) => { if (!c.opened && b.cells[c.pos].tile === ti) icons.push('tok_crate'); });
        if (g.tower != null && b.cells[g.tower].tile === ti) icons.push('tok_tower');
        const s = C * 0.42;
        icons.forEach((k, i) => Art.draw(ctx, k, -((icons.length - 1) * s * 1.1) / 2 + i * s * 1.1 - s / 2, C * 0.8, s, s, {}));
        const n = g.zombies.filter((z) => b.cells[z.pos].tile === ti).length;
        if (n) {
          const pulse = 1 + Math.sin(t * 4 + ti) * 0.06;
          ctx.save(); ctx.translate(0, -C * 0.85); ctx.scale(pulse, pulse);
          ctx.fillStyle = 'rgba(120,10,6,.85)'; ctx.beginPath(); ctx.arc(0, 0, C * 0.3, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = '#ff6a5a'; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = `${Math.round(C * 0.2)}px 'Russo One', sans-serif`;
          ctx.fillText('☠' + n, 0, 1);
          ctx.restore();
        }
        ctx.restore();
      });
    }

    _drawZombie(ctx, e) {
      const g = this.g;
      if (this.hiddenCell(e.cell) && !e.dying) return;
      if (e.over && !e.dying) return;
      const z = g.zombies.find((q) => q.uid === e.uid);
      const def = ZG.Zombies.get(e.type);
      let x = e.x, y = e.y;
      const r = e.r || this.cell * 0.2;
      let scale = e.scale, alpha = 1, rot = 0;
      // лицом к ближайшему герою
      let best = null, bd = Infinity;
      this.heroes.forEach((h) => { if (!h.gone) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } } });
      if (best && bd > 1) rot = Math.atan2(best.y - y, best.x - x) + Math.PI / 2;
      // рывок атаки
      if (e.lunge) {
        const lt = (this.time - e.lunge.t0) / 0.38;
        if (lt >= 1) e.lunge = null;
        else { const a = Math.sin(lt * Math.PI); x += (e.lunge.tx - x) * a * 0.45; y += (e.lunge.ty - y) * a * 0.45; scale *= 1 + a * 0.15; }
      }
      if (e.dying) {
        const dt = (this.time - e.dying.t0) / 0.6;
        alpha = 1 - dt; scale *= 1 - dt * 0.4; rot += dt * 2;
      }
      if (e.shakeT && this.time - e.shakeT < 0.25) x += Math.sin((this.time - e.shakeT) * 80) * 3;
      // шатание
      if (!e.dying && !def.immobile) rot += Math.sin(this.time * 2.2 + hash(e.uid.length + e.uid.charCodeAt(1))) * 0.12;
      const hop = Math.sin((e.hop || 0) * Math.PI) * r * 0.5;
      ctx.save();
      ctx.globalAlpha = alpha;
      // тень
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(x + 2, y + r * 0.35 + 2, r * scale, r * 0.55 * scale, 0, 0, TAU); ctx.fill();
      const s = r * 2 * scale;
      const sleeping = g.stealth && e.awake === false && !def.immobile;
      if (sleeping) ctx.globalAlpha = alpha * 0.82;
      Art.draw(ctx, 'z_' + e.type, x - s / 2, y - s / 2 - hop, s, s, { rot, t: this.time });
      ctx.globalAlpha = alpha;
      if (sleeping && !e.dying) {
        // бродит: светлый пунктирный ободок (без ctx.filter — он не везде работает)
        ctx.save(); ctx.setLineDash([3, 3]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(200,215,230,.85)';
        ctx.beginPath(); ctx.arc(x, y - hop, s * 0.52, 0, TAU); ctx.stroke(); ctx.restore();
      }
      if (g.stealth && !def.immobile && !e.dying && (e.crowd || 0) >= 5) {
        // толпа: один общий значок на зону — «!×N» охотников (или «z», если все бродят)
        if (e.slot === 0) {
          let hunt = 0, all = 0;
          this.zombies.forEach((q) => { if (q.cell === e.cell && !q.dying && !ZG.Zombies.get(q.type).immobile) { all++; if (q.awake !== false) hunt++; } });
          const c = this.cellXY(e.cell), C = this.cell;
          const label = hunt ? `!×${hunt}` : `z×${all}`;
          ctx.font = `bold ${Math.round(C * 0.17)}px 'Russo One', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const w = ctx.measureText(label).width + 12;
          ctx.fillStyle = hunt ? '#c0392b' : '#4a5560'; Art.rr(ctx, c.x - w / 2, c.y - C * 0.47, w, C * 0.2, 6); ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = '#0d0a08'; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.fillText(label, c.x, c.y - C * 0.37);
        }
      } else if (g.stealth && !def.immobile && !e.dying) {
        // значок состояния: «z» — бродит, «!» — охотится
        const bx = x + s * 0.36, by = y - s * 0.36 - hop, br = Math.max(5, s * 0.17);
        ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU);
        ctx.fillStyle = sleeping ? '#4a5560' : '#c0392b'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#0d0a08'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(br * 1.4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(sleeping ? 'z' : '!', bx, by + 1);
      }
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = e.flash * 0.7;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - hop, s * 0.45, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = alpha;
      // здоровье
      if (z && !e.dying) {
        const left = def.hp - z.dmg;
        if (def.hp > 1) {
          const pw = Math.min(r * 0.36, (r * 1.8) / def.hp);
          const total = pw * def.hp;
          for (let i = 0; i < def.hp; i++) {
            ctx.fillStyle = i < left ? (def.big ? '#ff6a4a' : '#e8dcc0') : 'rgba(40,30,25,.8)';
            ctx.fillRect(x - total / 2 + i * pw + 1, y + r * 0.95 - hop, pw - 2, Math.max(3, r * 0.14));
          }
        }
        if (z.suppressed) { ctx.font = `${Math.round(r * 0.8)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('⛓', x + r * 0.8, y - r * 0.7); }
      }
      ctx.restore();
    }

    _drawHero(ctx, e) {
      const g = this.g;
      const h = g.heroes[e.idx];
      if (!h) return;
      if (e.gone && !e.fallT && !e.evacT) return;
      const def = ZG.Heroes.get(h.id);
      const r = (e.r || this.cell * 0.28) * 1.05;
      let x = e.x, y = e.y, alpha = h.hidden ? 0.45 : 1, scale = e.scale;
      if (e.evacT) { const k = (this.time - e.evacT) / 0.9; if (k > 1) return; y -= k * this.cell * 0.6; alpha = 1 - k; }
      if (e.fallT) { const k = (this.time - e.fallT) / 1; if (k > 1) return; scale *= 1 - k * 0.5; alpha = 1 - k; }
      if (e.lunge) {
        const lt = (this.time - e.lunge.t0) / 0.35;
        if (lt >= 1) e.lunge = null;
        else { const a = Math.sin(lt * Math.PI); x += (e.lunge.tx - x) * a * 0.35; y += (e.lunge.ty - y) * a * 0.35; }
      }
      const hop = Math.sin((e.hop || 0) * Math.PI) * r * 0.45;
      const active = this.g.active === e.idx;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.ellipse(x + 2, y + r * 0.4 + 2, r * scale, r * 0.6 * scale, 0, 0, TAU); ctx.fill();
      if (active) {
        const p = 0.5 + Math.sin(this.time * 4) * 0.5;
        const gl = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.8);
        gl.addColorStop(0, `rgba(240,192,64,${0.35 + p * 0.25})`); gl.addColorStop(1, 'rgba(240,192,64,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill();
      }
      y -= hop;
      const R = r * scale;
      // база
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU);
      ctx.fillStyle = '#1a1512'; ctx.fill();
      ctx.lineWidth = R * 0.2; ctx.strokeStyle = h.player === 2 ? '#3fa7d6' : '#f0c040'; ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, R * 0.86, 0, TAU); ctx.clip();
      Art.draw(ctx, def.art, x - R * 0.86, y - R * 0.86, R * 1.72, R * 1.72, {});
      ctx.restore();
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, R * 1.1, 0, TAU); ctx.stroke();
      if (e.flash > 0) {
        ctx.globalAlpha = e.flash * 0.6 * alpha;
        ctx.fillStyle = e.flashColor || '#c0392b'; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = alpha;
      }
      // блок
      if (h.block > 0) {
        const bx = x + R * 0.8, by = y - R * 0.8;
        Art.draw(ctx, 'shieldIcon', bx - R * 0.35, by - R * 0.35, R * 0.7, R * 0.7);
        ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(R * 0.4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(h.block, bx, by + 1);
      }
      // имя
      ctx.font = `bold ${Math.round(Math.max(9, R * 0.32))}px 'Russo One', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      // укрытие: значок домика над фишкой
      const hh = this.g.heroes[e.idx];
      if (hh && ZG.Engine.sheltered(this.g, hh)) {
        ctx.save(); ctx.translate(x - R * 0.85, y - R * 0.95);
        const u = R * 0.42;
        ctx.beginPath(); ctx.moveTo(0, -u); ctx.lineTo(u, -u * 0.1); ctx.lineTo(u * 0.7, -u * 0.1); ctx.lineTo(u * 0.7, u * 0.8); ctx.lineTo(-u * 0.7, u * 0.8); ctx.lineTo(-u * 0.7, -u * 0.1); ctx.lineTo(-u, -u * 0.1); ctx.closePath();
        ctx.fillStyle = '#6fbf73'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#111'; ctx.stroke();
        ctx.restore();
      }
      // в тесной зоне — короткое имя, чтобы подписи соседей не налезали
      let crowd = 0; this.heroes.forEach((o) => { if (!o.gone && o.cell === e.cell) crowd++; }); this.zombies.forEach((o) => { if (!o.dying && o.cell === e.cell) crowd++; });
      const label = crowd > 1 ? def.name.slice(0, 3) : def.name;
      const nw = ctx.measureText(label).width + 8, nh = Math.max(11, R * 0.4);
      ctx.fillStyle = 'rgba(10,8,6,.85)'; Art.rr(ctx, x - nw / 2, y + R * 1.08, nw, nh, 3); ctx.fill();
      ctx.fillStyle = active ? '#ffd36b' : '#e8dcc0'; ctx.fillText(label, x, y + R * 1.12);
      ctx.restore();
    }

    // -------------------------------------------------------- эффекты
    _drawEffects(ctx) {
      const t = this.time;
      this.effects = this.effects.filter((f) => t - f.t0 < f.dur);
      this.effects.forEach((f) => {
        const k = (t - f.t0) / f.dur;
        ctx.save();
        switch (f.type) {
          case 'ring':
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = f.color; ctx.lineWidth = 4 * (1 - k) + 1;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r * ease.out(k), 0, TAU); ctx.stroke();
            break;
          case 'tracer': {
            ctx.globalAlpha = 1 - k;
            const gr = ctx.createLinearGradient(f.x1, f.y1, f.x2, f.y2);
            gr.addColorStop(0, 'rgba(255,240,180,0)'); gr.addColorStop(1, 'rgba(255,220,120,1)');
            ctx.strokeStyle = gr; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
            break;
          }
          case 'arc': {
            const p = ease.inOut(Math.min(1, k));
            const x = f.x1 + (f.x2 - f.x1) * p, y = f.y1 + (f.y2 - f.y1) * p - Math.sin(p * Math.PI) * this.cell * 0.8;
            ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.arc(x, y, this.cell * 0.06, 0, TAU); ctx.fill();
            break;
          }
          case 'boom': {
            const r = this.cell * 0.9 * ease.out(k);
            const gr = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, r);
            gr.addColorStop(0, `rgba(255,250,200,${1 - k})`); gr.addColorStop(0.4, `rgba(255,140,40,${(1 - k) * 0.9})`); gr.addColorStop(1, 'rgba(80,20,0,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
            break;
          }
          case 'fire': {
            for (let i = 0; i < 6; i++) {
              const ox = (hash(i) - 0.5) * this.cell * 0.7, oy = (hash(i + 4) - 0.5) * this.cell * 0.6;
              ctx.globalAlpha = 1 - k;
              ctx.save(); ctx.translate(f.x + ox, f.y + oy); ctx.scale(this.cell / 120, this.cell / 120 * (1 + Math.sin(t * 20 + i) * 0.15));
              Art.flame(ctx, 0, 0, 1.2);
              ctx.restore();
            }
            break;
          }
          case 'bubble': {
            const x = f.ent ? f.ent.x : f.x, y = f.ent ? f.ent.y : f.y;
            ctx.globalAlpha = (1 - k) * 0.8;
            ctx.strokeStyle = f.color; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(x, y, this.cell * (0.35 + k * 0.1), 0, TAU); ctx.stroke();
            ctx.fillStyle = f.color; ctx.globalAlpha = (1 - k) * 0.15; ctx.fill();
            break;
          }
          case 'pillar': {
            const w = this.cell * 0.5 * (1 - k * 0.5);
            const gr = ctx.createLinearGradient(f.x, f.y - this.cell * 2, f.x, f.y);
            gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, f.color);
            ctx.globalAlpha = Math.sin(k * Math.PI) * 0.7;
            ctx.fillStyle = gr; ctx.fillRect(f.x - w / 2, f.y - this.cell * 2, w, this.cell * 2);
            break;
          }
          case 'siren': {
            ctx.globalAlpha = Math.abs(Math.sin(k * Math.PI * 3)) * 0.3;
            ctx.fillStyle = '#c0392b'; ctx.fillRect(0, 0, this.W, this.H);
            break;
          }
        }
        ctx.restore();
      });
    }

    _drawParticles(ctx, dt) {
      const dctx = this.decals.getContext('2d');
      this.particles = this.particles.filter((p) => {
        p.t += dt;
        if (p.t >= p.life) {
          if (p.decal) { dctx.save(); dctx.scale(this.dpr, this.dpr); dctx.fillStyle = 'rgba(90,8,4,.6)'; dctx.beginPath(); dctx.arc(p.x, p.y, p.size, 0, TAU); dctx.fill(); dctx.restore(); }
          return false;
        }
        const drag = p.drag || 1.5;
        p.vx *= Math.exp(-drag * dt); p.vy *= Math.exp(-drag * dt);
        p.x += p.vx * dt; p.y += p.vy * dt;
        const a = 1 - p.t / p.life;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.shape === 'puff') { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.t * 2), 0, TAU); ctx.globalAlpha = a * 0.5; ctx.fill(); }
        else if (p.shape === 'plus') { const s = p.size; ctx.fillRect(p.x - s / 2, p.y - s / 6, s, s / 3); ctx.fillRect(p.x - s / 6, p.y - s / 2, s / 3, s); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
        return true;
      });
      ctx.globalAlpha = 1;
    }

    _drawFloats(ctx, dt) {
      this.floats = this.floats.filter((f) => {
        f.t += dt;
        if (f.t > f.life) return false;
        const k = f.t / f.life;
        const pop = k < 0.15 ? ease.back(k / 0.15) : 1;
        ctx.save();
        ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        ctx.translate(f.x, f.y - k * this.cell * 0.45);
        ctx.scale(pop * f.scale, pop * f.scale);
        ctx.font = `bold ${Math.round(this.cell * 0.2)}px 'Russo One', sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
        ctx.restore();
        return true;
      });
    }

    // ночь: тёмный слой с «дырами» света вокруг героев и огня
    _drawLighting(ctx, dt) {
      this.darkness += (this.targetDark - this.darkness) * Math.min(1, dt * 1.5);
      if (this.darkness < 0.02) return;
      const lc = this.lightCanvas;
      const l = lc.getContext('2d');
      l.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      l.globalCompositeOperation = 'source-over';
      l.clearRect(0, 0, this.W, this.H);
      l.fillStyle = `rgba(6,8,22,${this.darkness})`;
      l.fillRect(0, 0, this.W, this.H);
      l.globalCompositeOperation = 'destination-out';
      const light = (x, y, r, a) => {
        const gr = l.createRadialGradient(x, y, r * 0.15, x, y, r);
        gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        l.fillStyle = gr; l.beginPath(); l.arc(x, y, r, 0, TAU); l.fill();
      };
      const flick = 1 + Math.sin(this.time * 13) * 0.02 + Math.sin(this.time * 7.3) * 0.02;
      this.heroes.forEach((e) => { if (!e.gone) light(e.x, e.y, this.cell * 1.7 * flick, 0.95); });
      this.effects.forEach((f) => { if (f.type === 'fire' || f.type === 'boom') light(f.x, f.y, this.cell * 1.4, 0.9); });
      if (ZG.Engine.isComplete(this.g)) { const ex = this.cellXY(this.g.exit); light(ex.x, ex.y, this.cell * 1.1, 0.8); }
      this.g.lures.forEach((lu) => { const c = this.cellXY(lu.pos); light(c.x, c.y, this.cell * 0.8, 0.6); });
      ctx.drawImage(lc, 0, 0, this.W, this.H);
      // виньетка
      const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.25 + this.darkness * 0.5})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
    }

    _drawWeather(ctx) {
      const cond = this.g.conditionId;
      const t = this.time;
      if (cond === 'rain') {
        ctx.strokeStyle = 'rgba(180,200,255,.25)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 140; i++) {
          const x = (hash(i) * this.W + t * 60) % this.W;
          const y = (hash(i + 300) * this.H + t * (500 + hash(i) * 300)) % this.H;
          ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 14);
        }
        ctx.stroke();
      } else if (cond === 'fog') {
        for (let i = 0; i < 5; i++) {
          const x = ((t * (8 + i * 3) + i * 300) % (this.W + 600)) - 300;
          const y = (i / 5) * this.H + Math.sin(t * 0.3 + i) * 30;
          const gr = ctx.createRadialGradient(x, y, 10, x, y, 280);
          gr.addColorStop(0, 'rgba(200,205,210,.22)'); gr.addColorStop(1, 'rgba(200,205,210,0)');
          ctx.fillStyle = gr; ctx.fillRect(x - 280, y - 280, 560, 560);
        }
      } else if (cond === 'fullmoon') {
        const gr = ctx.createRadialGradient(this.W * 0.85, -40, 10, this.W * 0.85, -40, this.W * 0.6);
        gr.addColorStop(0, 'rgba(255,220,180,.18)'); gr.addColorStop(1, 'rgba(255,220,180,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, this.W, this.H);
      }
      // пепел/пыль в воздухе
      ctx.fillStyle = 'rgba(230,220,200,.25)';
      for (let i = 0; i < 30; i++) {
        const x = (hash(i + 900) * this.W + Math.sin(t * 0.3 + i) * 40 + t * 6) % this.W;
        const y = (hash(i + 700) * this.H + t * (5 + hash(i) * 8)) % this.H;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    // ================================================ статичное поле
    _renderStatic() {
      const g = this.g, b = g.board, C = this.cell;
      const cv = document.createElement('canvas');
      cv.width = Math.round(this.W * this.dpr); cv.height = Math.round(this.H * this.dpr);
      const ctx = cv.getContext('2d');
      ctx.scale(this.dpr, this.dpr);
      ZG.TileRender.drawBoard(ctx, g, this.pad, C, { labels: true });
      return cv;
    }
  }

  ZG.BoardView = BoardView;
})(typeof globalThis !== 'undefined' ? globalThis : window);
