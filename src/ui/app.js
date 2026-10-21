/*
 * Интерфейс: экраны (меню → подготовка → партия → итог), панель героев,
 * рука, действия, модальные окна, баннеры фаз и связь с BoardView.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const E = ZG.Engine;
  const CV = ZG.CardView;
  const el = CV.el, esc = CV.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('zg_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('zg_' + k, JSON.stringify(v)); } catch (e) { /* нет хранилища */ } },
  };

  // ================================================================ экраны
  const App = {
    screen: null,
    setup: store.get('setup', { players: 1, heroes: [{ id: 'boris', player: 1 }, { id: 'lisa', player: 1 }], scenario: 'random', condition: 'random', difficulty: 'survivor', seed: '' }),

    init() {
      this.initMenu();
      this.initSetup();
      Game.init();
      this.show('menu');
      window.addEventListener('resize', () => Game.resize());
    },

    async show(name, transition) {
      const next = $('#screen-' + name);
      const prev = this.screen && $('#screen-' + this.screen);
      if (transition === 'shutter') {
        const sh = $('#shutter');
        sh.classList.add('closing');
        await sleep(650);
        if (prev) prev.classList.remove('active');
        next.classList.add('active');
        this.screen = name;
        await sleep(250);
        sh.classList.remove('closing');
        sh.classList.add('opening');
        await sleep(700);
        sh.classList.remove('opening');
        return;
      }
      if (prev) { prev.classList.add('leaving'); await sleep(380); prev.classList.remove('active', 'leaving'); }
      next.classList.add('active', 'entering');
      this.screen = name;
      await sleep(30);
      next.classList.remove('entering');
    },

    // ---------------------------------------------------------- меню
    initMenu() {
      const cv = $('#title-canvas');
      const ctx = cv.getContext('2d');
      const loop = (ts) => {
        if (this.screen === 'menu') {
          const r = cv.getBoundingClientRect();
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ZG.Art.draw(ctx, 'title', 0, 0, r.width, r.height, { t: ts / 1000 });
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      $('#btn-new').onclick = () => this.show('setup');
      $('#btn-rules').onclick = () => Rules.open();
      $('#btn-print').onclick = () => window.open('print.html', '_blank');
      const saved = store.get('save', null);
      $('#btn-continue').style.display = saved ? '' : 'none';
      $('#btn-continue').onclick = () => { const s = store.get('save', null); if (s) Game.resume(s); };
    },

    // ----------------------------------------------------- подготовка
    initSetup() {
      const s = this.setup;
      const heroesWrap = $('#setup-heroes');
      ZG.Heroes.all().forEach((h) => {
        const card = CV.heroCard(h.id, { bio: true, talents: false });
        card.classList.add('selectable');
        card.dataset.hero = h.id;
        const badge = el('div', 'pick-badge');
        card.appendChild(badge);
        // переключатель «Игрок / ИИ» для взятого героя
        const aiBtn = el('button', 'ai-toggle', '🎮 Игрок');
        aiBtn.title = 'Кто управляет героем: вы или ИИ';
        aiBtn.onclick = (ev) => {
          ev.stopPropagation();
          const x = s.heroes.find((q) => q.id === h.id);
          if (x) { x.ai = !x.ai; this.renderSetup(); }
        };
        card.appendChild(aiBtn);
        card.onclick = () => {
          const idx = s.heroes.findIndex((x) => x.id === h.id);
          if (idx < 0) {
            if (s.heroes.length >= 4) return toast('Не больше 4 героев.');
            s.heroes.push({ id: h.id, player: s.players === 2 ? (s.heroes.filter((x) => x.player === 1).length > s.heroes.filter((x) => x.player === 2).length ? 2 : 1) : 1 });
          } else if (s.players === 2 && s.heroes[idx].player === 1) s.heroes[idx].player = 2;
          else s.heroes.splice(idx, 1);
          this.renderSetup();
        };
        card.oncontextmenu = (ev) => { ev.preventDefault(); Modal.heroInfo(h.id); };
        heroesWrap.appendChild(card);
      });
      $$('#setup-players button').forEach((b) => {
        b.onclick = () => {
          s.players = +b.dataset.p;
          s.heroes.forEach((h, i) => { h.player = s.players === 2 ? (i % 2) + 1 : 1; });
          this.renderSetup();
        };
      });
      const sel = (id, list, key, labelFn) => {
        const box = $(id);
        box.innerHTML = '';
        [{ id: 'random', name: '🎲 Случайно' }].concat(list).forEach((o) => {
          const b = el('button', 'chip', labelFn ? labelFn(o) : esc(o.name));
          b.dataset.v = o.id;
          b.onclick = () => { s[key] = o.id; this.renderSetup(); };
          box.appendChild(b);
        });
      };
      const lvl = ZG.Levels.get('outskirts');
      sel('#setup-scenario', lvl.scenarios.map((id) => ZG.Scenarios.get(id)), 'scenario');
      sel('#setup-condition', lvl.conditions.map((id) => ZG.Conditions.get(id)), 'condition');
      const db = $('#setup-difficulty');
      ZG.Difficulties.all().forEach((d) => {
        const b = el('button', 'chip', `<b>${esc(d.name)}</b><small>${esc(d.text)}</small>`);
        b.dataset.v = d.id;
        b.onclick = () => { s.difficulty = d.id; this.renderSetup(); };
        db.appendChild(b);
      });
      $('#setup-seed').value = s.seed || '';
      $('#setup-fog').checked = s.fog !== false;
      $('#setup-fog').onchange = (ev) => { s.fog = ev.target.checked; };
      $('#setup-missions').checked = s.missions !== false;
      $('#setup-missions').onchange = (ev) => { s.missions = ev.target.checked; };
      $('#setup-stealth').checked = s.stealth !== false;
      $('#setup-stealth').onchange = (ev) => { s.stealth = ev.target.checked; };
      $('#setup-seed').oninput = (ev) => { s.seed = ev.target.value.trim(); };
      $('#btn-setup-back').onclick = () => this.show('menu');
      $('#btn-start').onclick = () => {
        if (!s.heroes.length) return toast('Выберите хотя бы одного героя.');
        if (s.players === 2 && (!s.heroes.some((h) => h.player === 1 && !h.ai) || !s.heroes.some((h) => h.player === 2 && !h.ai))) return toast('У каждого игрока должен быть хотя бы один герой не под ИИ.');
        store.set('setup', s);
        Game.start({
          seed: s.seed || String(Math.floor(Math.random() * 1e9)),
          heroes: s.heroes.map((h) => ({ id: h.id, player: h.player, ai: !!h.ai })),
          scenarioId: s.scenario === 'random' ? undefined : s.scenario,
          conditionId: s.condition === 'random' ? undefined : s.condition,
          difficultyId: s.difficulty,
          fog: s.fog !== false,
          stealth: s.stealth !== false,
          missions: s.missions !== false,
          players: s.players,
        });
      };
      this.renderSetup();
    },

    renderSetup() {
      const s = this.setup;
      $$('#setup-players button').forEach((b) => b.classList.toggle('on', +b.dataset.p === s.players));
      $$('#setup-heroes .hero-card').forEach((c) => {
        const h = s.heroes.find((x) => x.id === c.dataset.hero);
        c.classList.toggle('picked', !!h);
        c.classList.toggle('p2', !!h && h.player === 2);
        $('.pick-badge', c).textContent = h ? (h.ai ? 'ИИ' : s.players === 2 ? 'ИГРОК ' + h.player : 'В ОТРЯДЕ') : '';
        c.classList.toggle('ai', !!h && !!h.ai);
        $('.ai-toggle', c).textContent = h && h.ai ? '🤖 ИИ' : '🎮 Игрок';
      });
      ['scenario', 'condition', 'difficulty'].forEach((k) => $$(`#setup-${k} .chip`).forEach((b) => b.classList.toggle('on', b.dataset.v === s[k])));
      const n = s.heroes.length;
      $('#setup-hint').innerHTML = n === 0 ? 'Выберите героев (1–4). Рекомендуется 2.'
        : `Отряд: <b>${s.heroes.map((h) => ZG.Heroes.get(h.id).name + (s.players === 2 ? ` (И${h.player})` : '')).join(', ')}</b>. ` +
          (n === 1 ? 'Соло: один люк и «Одиночка» (+1 к руке).' : n >= 3 ? 'Больше героев — больше точек появления.' : 'Отличный размер отряда.') +
          (s.players === 2 ? ' <i>Клик по герою переключает игрока.</i>' : '') +
        ` <i>Кнопка «🎮/🤖» на карточке — отдать героя ИИ${s.heroes.length && s.heroes.every((x) => x.ai) ? ' (все герои под ИИ — режим наблюдения)' : ''}.</i>`;
      const scen = s.scenario === 'random' ? null : ZG.Scenarios.get(s.scenario);
      $('#setup-scen-desc').textContent = scen ? scen.brief : 'Задание выпадет случайно: 4 варианта целей.';
      const cond = s.condition === 'random' ? null : ZG.Conditions.get(s.condition);
      $('#setup-cond-desc').textContent = cond ? cond.text : 'Условие выпадет случайно: погода, находки или угрозы.';
    },
  };

  // =================================================================== партия
  const Game = {
    g: null,
    view: null,
    sel: null, // выбранная карта / режим
    busy: false,
    logSeen: 0,
    lastPlayer: null,

    init() {
      this.view = new ZG.BoardView($('#board'));
      this.view.onClick = (p) => this.onBoardClick(p);
      this.view.onHover = (h, changed) => this.onBoardHover(h, changed);
      $('#btn-end').onclick = () => this.endTurn();
      $('#btn-menu').onclick = () => Modal.confirm('Выйти в меню? Партия сохранится.', () => { this.save(); App.show('menu'); $('#btn-continue').style.display = ''; });
      $('#btn-rules-in').onclick = () => Rules.open();
      $('#btn-hint').onclick = () => this.hint();
      $('#btn-auto').onclick = () => this.autoTurn();
      $('#btn-speed').onclick = () => {
        const sp = this.view.speed === 1 ? 2 : this.view.speed === 2 ? 3 : 1;
        this.view.speed = sp;
        $('#btn-speed').textContent = '×' + sp;
      };
      const pb = $('#btn-pause');
      pb.onclick = () => {
        this.paused = !this.paused;
        pb.textContent = this.paused ? '▶' : '⏸';
        pb.title = this.paused ? 'Продолжить ИИ' : 'Пауза ИИ';
        if (!this.paused) { this.setHelp(null); this.maybeAutoBegin(); }
      };
      const sb = $('#btn-sound');
      const showSound = () => { sb.textContent = ZG.Sound.muted ? '🔇' : '🔊'; sb.title = ZG.Sound.muted ? 'Звук выключен' : 'Звук включён'; };
      showSound();
      sb.onclick = () => { ZG.Sound.toggle(); showSound(); if (!ZG.Sound.muted) ZG.Sound.play('growl', { volume: 0.5 }); };
      $('#deck-pile').onclick = () => this.showPile('deck');
      $('#discard-pile').onclick = () => this.showPile('discard');
      document.addEventListener('keydown', (ev) => this.onKey(ev));
      document.addEventListener('contextmenu', (ev) => { if (this.sel && App.screen === 'game') { ev.preventDefault(); this.cancelSel(); } });
    },

    start(opts) {
      this.players = opts.players || 1;
      const g = E.create(opts);
      this.g = g;
      this.logSeen = 0;
      this.lastPlayer = null;
      this.seenMission = {};
      $('#log').innerHTML = '';
      this.paused = false;
      $('#btn-pause').textContent = '⏸';
      $('#btn-pause').style.display = opts.heroes.some((h) => h.ai) ? '' : 'none';
      App.show('game', 'shutter').then(() => this.afterShow(true));
    },

    resume(save) {
      try {
        const g = save.g;
        if (g.v !== 2) throw new Error('старая версия сохранения (поле стало больше)');
        const level = ZG.Levels.get(g.levelId);
        // поле детерминированно восстанавливается из сида
        const tmp = E.create({ seed: g.seed, heroes: g.heroes.map((h) => ({ id: h.id, player: h.player, ai: h.ai })), scenarioId: g.scenarioId, conditionId: g.conditionId, bonusId: g.bonusId, difficultyId: g.difficultyId, levelId: level.id, quiet: true });
        g.board = tmp.board;
        g.fx = []; g.log = g.log || [];
        this.g = g;
        this.players = save.players || 1;
        this.logSeen = 0;
        $('#log').innerHTML = '';
        App.show('game', 'shutter').then(() => this.afterShow(false));
      } catch (e) { console.error(e); toast('Не удалось загрузить сохранение.'); }
    },

    save() {
      if (!this.g || this.g.result) { store.set('save', null); return; }
      const b = this.g.board; this.g.board = null;
      const fx = this.g.fx; this.g.fx = [];
      store.set('save', { g: this.g, players: this.players });
      this.g.board = b; this.g.fx = fx;
    },

    async afterShow(intro) {
      this.view.setGame(this.g, intro);
      this.g.fx = [];
      this.refresh();
      if (intro) {
        await sleep(2700);
        await Banner.show(`УРОВЕНЬ ${ZG.Levels.get(this.g.levelId).num}`, ZG.Levels.get(this.g.levelId).name.toUpperCase(), 'level');
        await Modal.briefing(this.g);
        await Banner.show('РАУНД 1', ZG.PHASES[0].name.toUpperCase(), 'round');
      }
      this.refresh();
      this.maybeAutoBegin();
    },

    resize() { if (this.g && App.screen === 'game') { this.view.resize(); } },

    // ---------------------------------------------------- действия
    async act(a, opts) {
      if (this.busy || !this.g) return false;
      const g = this.g;
      const before = { active: g.active, phase: g.phase, round: g.round };
      if (a.t === 'play' && opts && opts.cardEl) Fly.card(opts.cardEl, this.view, g.heroes[g.active]);
      const ok = E.act(g, a);
      if (!ok) { toast(g.lastError || 'Нельзя.'); return false; }
      this.sel = null;
      this.view.setHighlights(null);
      this.busy = true;
      document.body.classList.add('busy');
      this.refreshLog();
      try { await this.playFx(); } catch (e) { console.error(e); }
      this.busy = false;
      document.body.classList.remove('busy');
      this.refresh();
      this.save();
      if (g.result) return this.gameOver();
      if (g.pending) return this.handlePending();
      if (before.phase !== g.phase || before.round !== g.round || (before.active != null && g.active == null)) this.maybeAutoBegin();
      return true;
    },

    // последовательное проигрывание событий движка: часть — на поле, часть — баннеры интерфейса
    async playFx() {
      const g = this.g;
      this.view.hold = true;
      try { await this._playFx(g); } finally { this.view.hold = false; this.view._sync(true); }
    },
    async _playFx(g) {
      while (g.fx.length) {
        const evs = g.fx.splice(0);
        let batch = [];
        const flush = async () => { if (batch.length) { const b = batch; batch = []; this.refreshTop(); await this.view.play(b); } };
        for (const ev of evs) {
          if (UI_FX[ev.t]) { await flush(); await UI_FX[ev.t].call(this, ev); }
          else batch.push(ev);
        }
        await flush();
      }
    },

    maybeAutoBegin() {
      const g = this.g;
      if (!g || g.result || g.pending || g.phase !== 'heroes' || g.active != null) return;
      const ready = g.heroes.filter((h) => h.onBoard && !h.acted);
      const human = ready.filter((h) => !h.ai);
      // ИИ-герои ходят сами, когда люди уже походили (или людей в отряде нет)
      if (!human.length && ready.length) { this.runAI(); return; }
      if (ready.length === 1) this.act({ t: 'begin', hero: ready[0].idx });
      else this.refresh();
    },

    // Ход героя под управлением ИИ (тот же бот, что в симуляторе)
    async runAI(heroIdx) {
      const g = this.g;
      if (this.aiRunning || !g || g.result || this.busy) return;
      if (this.paused) { this.setHelp('⏸ Пауза — ИИ ждёт. Нажмите ▶ в верхней панели.'); return; }
      this.aiRunning = true;
      try {
        if (g.phase === 'heroes' && g.active == null) {
          let h = heroIdx != null ? g.heroes[heroIdx] : null;
          if (!h) {
            const ready = g.heroes.filter((x) => x.onBoard && !x.acted && x.ai);
            ready.sort((a, b) => E.zombiesAt(g, b.pos).length - E.zombiesAt(g, a.pos).length || a.idx - b.idx);
            h = ready[0];
          }
          if (!h) return;
          await sleep(350 / this.view.speed);
          await this.act({ t: 'begin', hero: h.idx });
        }
        if (g.active != null && g.heroes[g.active].ai) await this.autoTurn(true);
      } finally { this.aiRunning = false; }
      if (g.phase === 'heroes' && g.active == null && !g.result) this.maybeAutoBegin();
    },

    async handlePending() {
      const g = this.g;
      const p = g.pending;
      if (!p) return;
      // решения ИИ-героя принимает бот
      if (g.heroes[p.hero] && g.heroes[p.hero].ai) {
        await sleep(300 / this.view.speed);
        if (p.type === 'block') return this.act({ t: 'block', cards: ZG.Bot.chooseBlock(g, p) });
        if (p.type === 'loot') return this.act({ t: 'loot', id: ZG.Bot.chooseLoot(g, p) });
        if (p.type === 'talent') return this.act({ t: 'talent', id: ZG.Bot.chooseTalent(g, p) });
      }
      if (p.type === 'block') {
        const cards = await Modal.block(g, p);
        await this.act({ t: 'block', cards });
      } else if (p.type === 'talent') {
        const id = await Modal.talent(g, p);
        await this.act({ t: 'talent', id });
      } else if (p.type === 'loot') {
        const id = await Modal.loot(g, p);
        await this.act({ t: 'loot', id });
      }
    },

    endTurn() {
      const g = this.g;
      if (!g || this.busy || g.active == null) return;
      const h = g.heroes[g.active];
      const unused = h.energy;
      const zHere = E.zombiesAt(g, h.pos).length;
      const doEnd = () => this.act({ t: 'end' });
      if (h.hand.some((u) => g.cards[u] === 'infection')) {
        Modal.confirm(`<b class="bad">☣ У ${E.heroName(h)} в руке Заражение!</b><br>Если завершить ход сейчас — герой <b>обратится в зомби</b>. Спасут аптечка или Марина (в той же зоне). Завершить ход?`, doEnd);
        return;
      }
      if (unused > 0 && store.get('warnEnergy', true)) {
        Modal.confirm(`У ${E.heroName(h)} осталось ${unused} ⚡ — энергия сгорит. Завершить ход?` + (zHere ? `<br><small>В зоне ${zHere} зомби — оставшиеся в руке карты со щитом пригодятся для защиты.</small>` : ''), doEnd);
      } else doEnd();
    },

    // ------------------------------------------------- выбор цели
    selectCard(uid, cardEl) {
      const g = this.g;
      if (this.busy || g.active == null) return;
      const h = g.heroes[g.active];
      const def = E.cardDef(g, uid);
      if (def.unplayable) return toast(def.kind === 'wound' ? 'Рану нельзя сыграть. Лечение уберёт её.' : def.kind === 'cargo' ? 'Груз нельзя сыграть — доставьте его.' : 'Эту карту нельзя сыграть.');
      const cost = E.cardCost(g, h, uid);
      if (cost > h.energy) return toast(`Нужно ${cost} ⚡, а осталось ${h.energy}.`);
      const targets = E.targetsFor(g, h, def);
      if (!targets.length) return toast('Нет подходящей цели для этой карты.');
      if (!def.target) {
        // карты без цели — второй клик (или Enter) разыгрывает, чтобы не сыграть случайно
        if (this.sel && this.sel.uid === uid) return this.act({ t: 'play', card: uid, target: null }, { cardEl });
        this.sel = { mode: 'confirm', uid, def, targets: [], cardEl };
        this.applyHighlights();
        this.refreshHand();
        this.setHelp(`«${esc(def.name)}»: кликните по карте ещё раз или нажмите Enter, чтобы сыграть. <span class="muted">Esc — отмена</span>`);
        return;
      }
      if (this.sel && this.sel.uid === uid) return this.cancelSel();
      this.sel = { mode: 'card', uid, def, targets, cardEl };
      this.applyHighlights();
      this.refreshHand();
      this.setHelp(this.targetHelp(def));
    },

    targetHelp(def) {
      const k = def.target.kind;
      return {
        zombie: def.target.ranged ? 'Выберите зомби на линии огня.' : 'Выберите зомби в своей зоне.',
        zone: 'Выберите зону с зомби на линии огня.',
        move: 'Выберите, куда переместиться.',
        hero: 'Выберите героя.',
        cell: 'Выберите зону для приманки.',
        adj: 'Выберите свою или соседнюю зону.',
        edge: 'Выберите соседнюю зону — баррикада встанет на проход.',
      }[k] + ' <span class="muted">ПКМ / Esc — отмена</span>';
    },

    selectMode(mode) {
      const g = this.g;
      if (this.busy || g.active == null) return;
      const h = g.heroes[g.active];
      if (this.sel && this.sel.mode === mode) return this.cancelSel();
      if (mode === 'barricade') {
        const t = E.legal(g).filter((a) => a.t === 'barricade').map((a) => a.to);
        if (!t.length) return toast('Нельзя поставить баррикаду.');
        this.sel = { mode, targets: t };
        this.setHelp('Выберите соседнюю зону — баррикада встанет на проход между зонами.');
      } else if (mode === 'punch') {
        const t = E.zombiesAt(g, h.pos).map((z) => z.uid);
        this.sel = { mode, targets: t };
        this.setHelp('Выберите зомби в своей зоне.');
      }
      this.applyHighlights();
    },

    cancelSel() {
      this.sel = null;
      this.applyHighlights();
      this.refreshHand();
      this.setHelp(null);
    },

    applyHighlights() {
      const g = this.g;
      const s = this.sel;
      if (!g || g.active == null || g.phase !== 'heroes') { this.view.setHighlights(null); return; }
      const h = g.heroes[g.active];
      if (!s) {
        // по умолчанию — доступные шаги
        const costs = {};
        const moves = E.legal(g).filter((a) => a.t === 'move');
        const cells = moves.map((a) => { costs[a.to] = E.moveCost(g, h, a.to); return a.to; });
        const explore = moves.filter((a) => a.explore).map((a) => a.to);
        this.view.setHighlights({ cells, costs, explore, color: 'rgba(240,192,64,.08)', stroke: 'rgba(240,192,64,.45)' });
        return;
      }
      if (s.mode === 'confirm') { this.view.setHighlights({ cells: [h.pos], color: 'rgba(240,192,64,.15)' }); return; }
      if (s.mode === 'card') {
        const k = s.def.target.kind;
        if (k === 'zombie') this.view.setHighlights({ zombies: s.targets });
        else if (k === 'hero') this.view.setHighlights({ cells: [...new Set(s.targets.map((i) => g.heroes[i].pos))], color: 'rgba(110,224,138,.18)', stroke: '#6fe08a' });
        else if (k === 'zone') this.view.setHighlights({ cells: s.targets, color: 'rgba(255,80,64,.18)', stroke: '#ff5040' });
        else this.view.setHighlights({ cells: s.targets });
      } else if (s.mode === 'punch') this.view.setHighlights({ zombies: s.targets });
      else this.view.setHighlights({ cells: s.targets });
    },

    onBoardClick(p) {
      const g = this.g;
      if (!g || this.busy || g.phase !== 'heroes') return;
      if (g.active == null) {
        // клик по герою — начать его ход
        const h = g.heroes.find((x) => x.onBoard && !x.acted && x.pos === p.cell);
        if (h) this.act({ t: 'begin', hero: h.idx });
        return;
      }
      const s = this.sel;
      if (!s) {
        if (p.cell != null && E.legal(g).some((a) => a.t === 'move' && a.to === p.cell)) this.act({ t: 'move', to: p.cell });
        else if (p.cell != null) {
          const h = g.heroes[g.active];
          const near = g.board.adj[h.pos].includes(p.cell) || E.fogNeighbors(g, h.pos).includes(p.cell);
          if (near) toast(`Не хватает ⚡: шаг стоит ${E.moveCost(g, h, p.cell)}, осталось ${h.energy}.`);
        }
        return;
      }
      if (s.mode === 'card') {
        const k = s.def.target.kind;
        let target;
        if (k === 'zombie') {
          target = p.zombie && s.targets.includes(p.zombie) ? p.zombie : null;
          if (!target && p.cell != null) { const zs = s.targets.filter((u) => (E.zombie(g, u) || {}).pos === p.cell); if (zs.length === 1) target = zs[0]; else if (zs.length) target = pickBest(g, zs); }
        } else if (k === 'hero') {
          const hs = s.targets.filter((i) => g.heroes[i].pos === p.cell);
          target = hs.length ? hs[0] : null;
          if (hs.length > 1) return Modal.pickHero(g, hs).then((i) => i != null && this.act({ t: 'play', card: s.uid, target: i }, { cardEl: s.cardEl }));
        } else target = s.targets.includes(p.cell) ? p.cell : null;
        if (target == null) return toast('Это не подходящая цель.');
        this.act({ t: 'play', card: s.uid, target }, { cardEl: s.cardEl });
      } else if (s.mode === 'punch') {
        let z = p.zombie && s.targets.includes(p.zombie) ? p.zombie : null;
        if (!z && p.cell === g.heroes[g.active].pos) z = pickBest(g, s.targets);
        if (z) this.act({ t: 'punch', zombie: z });
      } else if (s.mode === 'barricade') {
        if (s.targets.includes(p.cell)) this.act({ t: 'barricade', to: p.cell });
      }
    },

    onBoardHover(h) {
      const tip = $('#tooltip');
      if (!h || h.cell == null || !this.g) { tip.classList.remove('show'); return; }
      const html = zoneInfo(this.g, h.cell, h.zombie);
      if (!html) { tip.classList.remove('show'); return; }
      tip.innerHTML = html;
      tip.classList.add('show');
      const r = tip.getBoundingClientRect();
      let x = h.cx + 18, y = h.cy + 18;
      if (x + r.width > window.innerWidth - 8) x = h.cx - r.width - 18;
      if (y + r.height > window.innerHeight - 8) y = h.cy - r.height - 18;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    },

    onKey(ev) {
      if (Modal.open) { if (ev.key === 'Escape') Modal.escape(); return; }
      if ($('#rules').classList.contains('show')) { if (ev.key === 'Escape') $('#rules').classList.remove('show'); return; }
      if (App.screen !== 'game') return;
      if (ev.key === 'Enter' && this.sel && this.sel.mode === 'confirm') this.act({ t: 'play', card: this.sel.uid, target: null }, { cardEl: this.sel.cardEl });
      else if (ev.key === 'Escape') this.cancelSel();
      else if (ev.key === 'e' || ev.key === 'у') this.endTurn();
      else if (ev.key === 'h' || ev.key === 'р') this.hint();
      else if (/^[1-9]$/.test(ev.key)) {
        const cards = $$('#hand .card');
        const c = cards[+ev.key - 1];
        if (c) c.click();
      }
    },

    // ---------------------------------------------------- подсказки
    hint() {
      const g = this.g;
      if (!g || this.busy || g.phase !== 'heroes') return;
      if (g.active == null) return toast('Сначала выберите героя (клик по портрету).');
      const a = ZG.Bot.bestAction(g);
      if (!a) return toast('Совет: похоже, лучше завершить ход и держать карты со щитом для защиты.');
      toast('Совет: ' + describeAction(g, a), 4200);
      if (a.t === 'play') {
        const cardEl = $(`#hand .card[data-uid="${a.card}"]`);
        if (cardEl) { cardEl.classList.add('hinted'); setTimeout(() => cardEl.classList.remove('hinted'), 2500); }
        const def = E.cardDef(g, a.card);
        if (def.target) {
          const k = def.target.kind;
          if (k === 'zombie') this.view.setHighlights({ zombies: [a.target], zstroke: '#6fe08a' });
          else if (k === 'hero') this.view.setHighlights({ cells: [g.heroes[a.target].pos], stroke: '#6fe08a' });
          else this.view.setHighlights({ cells: [a.target], stroke: '#6fe08a', color: 'rgba(110,224,138,.2)' });
          setTimeout(() => this.applyHighlights(), 2500);
        }
      } else if (a.t === 'move') { this.view.setHighlights({ cells: [a.to], stroke: '#6fe08a', color: 'rgba(110,224,138,.2)' }); setTimeout(() => this.applyHighlights(), 2500); }
    },

    async autoTurn(fromAI) {
      const g = this.g;
      if (!g || this.busy || g.phase !== 'heroes') return;
      if (!fromAI && this.aiRunning) return;
      if (g.active == null) return toast('Сначала выберите героя.');
      const idx = g.active;
      for (let i = 0; i < 25 && g.active === idx && !g.result && !g.pending; i++) {
        const a = ZG.Bot.bestAction(g);
        if (!a) break;
        const cardEl = a.t === 'play' ? $(`#hand .card[data-uid="${a.card}"]`) : null;
        await this.act(a, { cardEl });
        await sleep(fromAI ? 380 / this.view.speed : 150);
        if (this.paused && fromAI) { await this.waitUnpause(); }
      }
      if (g.active === idx && !g.pending) await this.act({ t: 'end' });
    },

    waitUnpause() {
      return new Promise((res) => { const t = setInterval(() => { if (!this.paused) { clearInterval(t); res(); } }, 200); });
    },

    showPile(which) {
      const g = this.g;
      if (!g || g.active == null) return;
      const h = g.heroes[g.active];
      // карты группируются по виду с количеством; в колоде порядок скрыт (сортировка по масти и названию)
      const pile = which === 'deck' ? h.deck : h.discard;
      const groups = new Map();
      pile.forEach((u) => { const id = g.cards[u]; groups.set(id, (groups.get(id) || 0) + 1); });
      const order = { rage: 0, agility: 1, mind: 2, none: 3 };
      const ids = [...groups.keys()].sort((a, b) => {
        const da = ZG.Cards.get(a), db = ZG.Cards.get(b);
        return (order[da.suit] - order[db.suit]) || da.name.localeCompare(db.name, 'ru');
      });
      const blockBonus = ZG.Mods.value(g, h, 'blockPerCard', 0);
      const wrap = el('div', 'pile-cards');
      ids.forEach((id, i) => {
        const box = el('div', 'pile-item');
        const c = CV.card(id, { blockBonus });
        c.classList.add('deal');
        c.style.animationDelay = (i * 0.04) + 's';
        c.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
        c.onclick = () => Modal.zoomCard(ZG.Cards.get(id));
        box.appendChild(c);
        if (groups.get(id) > 1) box.appendChild(el('div', 'pile-count', '×' + groups.get(id)));
        wrap.appendChild(box);
      });
      if (!ids.length) wrap.appendChild(el('p', 'muted', 'Пусто.'));
      const wounds = groups.get('wound') || 0;
      const title = which === 'deck' ? `Колода: ${pile.length}` : `Сброс: ${pile.length}`;
      const sub = which === 'deck' ? 'Порядок скрыт — показан состав.' : 'Перемешается в колоду, когда она закончится.';
      Modal.show(`<h2>${title}</h2><p class="muted">${sub}${wounds ? ` Ран: <b>${wounds}</b>.` : ''} Клик по карте — увеличить.</p>`, [{ label: 'Закрыть' }], wrap, 'wide');
    },

    setHelp(html) {
      const box = $('#help-line');
      if (html) { box.innerHTML = html; box.classList.add('show'); }
      else this.defaultHelp();
    },
    defaultHelp() {
      const g = this.g, box = $('#help-line');
      if (!g) return;
      let html = '';
      if (g.phase === 'heroes' && g.active == null) {
        const ready = g.heroes.filter((h) => h.onBoard && !h.acted);
        html = ready.length ? 'Выберите героя, который ходит следующим: клик по портрету справа или фишке на поле.' : '';
      } else if (g.active != null && g.heroes[g.active].ai) {
        html = `🤖 Ходит ИИ: ${esc(E.heroName(g.heroes[g.active]))}. Скорость — кнопка ×1/×2/×3, пауза — ⏸.`;
      } else if (g.active != null) {
        html = 'Сыграйте карты или кликните по соседней зоне, чтобы пойти. Карты со щитом, оставшиеся в руке, защитят в фазу зомби.';
      } else if (g.phase === 'zombies') html = 'Ход зомби…';
      box.innerHTML = html;
      box.classList.toggle('show', !!html);
    },

    // ======================================================= отрисовка HUD
    refresh() {
      if (!this.g) return;
      this.refreshTop();
      this.refreshHeroes();
      this.refreshHand();
      this.refreshActions();
      this.refreshLog();
      this.applyHighlights();
      if (!this.sel) this.defaultHelp();
    },

    refreshTop() {
      const g = this.g;
      const max = E.maxRounds(g);
      const track = $('#round-track');
      if (track.childElementCount !== max) {
        track.innerHTML = '';
        for (let r = 1; r <= max; r++) {
          const ph = E.phase(g, r);
          const s = el('div', 'rt-slot ph' + ph, String(r));
          s.title = `Раунд ${r}: ${ZG.PHASES[ph].name}`;
          track.appendChild(s);
        }
      }
      $$('.rt-slot', track).forEach((s, i) => { s.classList.toggle('past', i + 1 < g.round); s.classList.toggle('now', i + 1 === g.round); });
      $('#phase-name').textContent = ZG.PHASES[E.phase(g)].name;
      $('#phase-name').className = 'ph' + E.phase(g);
      const th = E.alarmThreshold(g);
      const at = $('#alarm-track');
      if (at.childElementCount !== th) { at.innerHTML = ''; for (let i = 0; i < th; i++) at.appendChild(el('div', 'al-slot')); }
      $$('.al-slot', at).forEach((s, i) => s.classList.toggle('on', i < g.alarm));
      at.classList.toggle('danger', g.alarm >= th - 1);
      $('#alarm-val').textContent = g.alarm >= th ? `${g.alarm}/${th} · ВОЛНА!` : `${g.alarm}/${th}`;
      $('#alarm-val').classList.toggle('wave', g.alarm >= th);
      // цели
      const goals = E.scenario(g).goals(g);
      $('#goals').innerHTML = `<div class="goal-title">${esc(E.scenario(g).name)}</div>` + goals.map((x) => `<div class="goal ${x.done ? 'done' : ''}"><i></i>${esc(x.text)}</div>`).join('') +
        (E.isComplete(g) ? `<div class="goal-evac">Эвакуация открыта: «${esc(E.scenario(g).exitLabel)}» — действие «Эвакуация» в этой зоне.</div>` : '');
      const cond = ZG.Conditions.get(g.conditionId);
      const bonus = g.bonusId ? ZG.Bonuses.get(g.bonusId) : null;
      $('#cond').innerHTML = `<b>${esc(cond.name)}.</b> <span class="cond-full">${esc(cond.text)}</span>` + (bonus ? `<div class="bonus-line">★ <b>${esc(bonus.name)}:</b> <span class="cond-full">${esc(bonus.text)}</span> <span class="${bonus.check(g) ? 'ok' : ''}">(${esc(bonus.progress(g))})</span></div>` : '');
      if (g.event) {
        const ev = ZG.Events.get(g.event);
        $('#cond').innerHTML += `<div class="event-line tone${ev.tone > 0 ? 'pos' : ev.tone < 0 ? 'neg' : 'neu'}">⚑ <b>Событие: ${esc(ev.name)}.</b> <span class="cond-full">${esc(ev.text)}</span></div>`;
      }
      $('#cond').title = `${cond.name}: ${cond.text}` + (bonus ? `\n★ ${bonus.name}: ${bonus.text}` : '') + (g.event ? `\n⚑ ${ZG.Events.get(g.event).name}: ${ZG.Events.get(g.event).text}` : '');
      $('#zcount').textContent = g.zombies.length;
    },

    refreshHeroes() {
      const g = this.g;
      const box = $('#heroes');
      box.innerHTML = '';
      g.heroes.forEach((h) => {
        const def = ZG.Heroes.get(h.id);
        const hp = E.maxHp(g, h), w = E.woundCount(g, h), inf = E.infectCount(g, h);
        const infHand = h.hand.filter((u) => g.cards[u] === 'infection').length;
        const c = el('div', 'hp-card');
        if (infHand && h.onBoard) c.classList.add('infected');
        c.style.setProperty('--hero', def.color);
        if (h.idx === g.active) c.classList.add('active');
        if (h.acted && h.onBoard) c.classList.add('acted');
        if (!h.onBoard) c.classList.add(h.fallen ? 'fallen' : 'evac');
        if (g.phase === 'heroes' && g.active == null && h.onBoard && !h.acted) c.classList.add('ready');
        const img = el('img', 'hp-portrait');
        img.src = CV.artURL(def.art, 96, 96, {});
        c.appendChild(img);
        const pips = [];
        for (let i = 0; i < hp; i++) pips.push(`<i class="${i < hp - w - inf ? 'ok' : i < hp - w ? 'inf' : 'hurt'}"></i>`);
        const xpNext = h.xp < 4 ? 4 : h.xp < 10 ? 10 : null;
        const status = E.sheltered(g, h) ? '🏠 В УКРЫТИИ' : h.turned ? 'ОБРАЩЁН' : h.fallen ? 'ПАЛ' : h.evacuated ? 'СПАСЁН' : h.idx === g.active ? 'ХОДИТ' : h.acted ? 'походил' : 'готов';
        const info = el('div', 'hp-info');
        info.innerHTML = `
          <div class="hp-name">${esc(def.name)} <small>${h.ai ? '🤖 ИИ' : this.players === 2 ? 'И' + h.player : ''}</small><span class="hp-status">${status}</span></div>
          <div class="hp-pips" title="Стойкость: ${hp - w - inf} из ${hp}${inf ? ` · ☣ Заражений: ${inf}` : ''}">${pips.join('')}${infHand && h.onBoard ? '<b class="inf-warn" title="Заражение в руке: в конце хода герой обратится! Нужна аптечка или Марина.">☣ В РУКЕ!</b>' : inf ? `<b class="inf-mark">☣${inf}</b>` : ''}</div>
          <div class="hp-meta">
            <span title="Опыт / уровень">★ ${h.xp}${xpNext ? '/' + xpNext : ''} · ур.${h.level}</span>
            <span title="Размер руки: до стольких карт герой добирает в начале хода (не больше 3 за раз)">✋ ${E.handSize(g, h)}</span>
            <span title="Колода / сброс">🂠 ${h.deck.length}/${h.discard.length}</span>
            ${h.block ? `<span title="Блок до следующего хода">🛡 ${h.block}</span>` : ''}
            ${h.adrenaline ? `<span title="Адреналин">+${h.adrenaline}⚡</span>` : ''}
            ${h.hidden ? '<span>👻</span>' : ''}
          </div>
          ${this.missionLine(h)}
          ${h.talents.length || (h.perks || []).length ? `<div class="hp-talents">${h.talents.map((t) => esc(ZG.Talents.get(t).name)).concat((h.perks || []).map((id) => '✦ ' + esc(ZG.Missions.get(id).perk.name))).join(' · ')}</div>` : ''}
          ${h.equip.length ? `<div class="hp-equip">${h.equip.map((u) => esc(E.cardDef(g, u).name)).join(' · ')}</div>` : ''}`;
        c.appendChild(info);
        c.onclick = () => {
          if (g.phase === 'heroes' && g.active == null && h.onBoard && !h.acted) { if (h.ai) this.runAI(h.idx); else this.act({ t: 'begin', hero: h.idx }); }
          else Modal.heroInfo(h.id, h);
        };
        box.appendChild(c);
      });
    },

    // секретная миссия: своя видна только своему игроку (и только человеку); выполненная — всем
    canSeeMission(h) {
      const g = this.g;
      if (h.ai) return false;
      if (this.players !== 2) return true;
      const cur = g.active != null ? g.heroes[g.active] : null;
      return !!cur && !cur.ai && cur.player === h.player;
    },
    missionLine(h) {
      const g = this.g;
      if (!g.missions || !h.mission) return '';
      const m = ZG.Missions.get(h.mission);
      if (h.missionDone) {
        const won = g.missionFirst === h.idx;
        return `<div class="hp-mission ${won ? 'won' : 'late'}" title="${esc(m.text)}">${won ? '✦' : '✗'} ${esc(m.name)}${m.traitor && won ? ' — ПРЕДАТЕЛЬ' : ''}${won ? '' : ' (не первым)'}</div>`;
      }
      if (!this.canSeeMission(h)) return `<div class="hp-mission hidden" title="Секретная миссия — видна только её владельцу">🂠 секретная миссия</div>`;
      return `<div class="hp-mission mine" title="${esc(m.text)}\nНаграда (только первому): ${esc(m.rewardText)}">🂠 ${esc(m.name)}: ${E.missionProgress(g, h)}/${m.goal}${g.missionFirst != null ? ' · награда уже ушла' : ''}</div>`;
    },

    refreshHand() {
      const g = this.g;
      const hand = $('#hand');
      const h = g.active != null ? g.heroes[g.active] : null;
      const prev = new Set($$('.card', hand).map((c) => c.dataset.uid));
      hand.innerHTML = '';
      $('#hand-owner').innerHTML = h ? `${esc(E.heroName(h))}${this.players === 2 ? ` <small>· Игрок ${h.player}</small>` : ''}` : (g.phase === 'heroes' ? 'Выберите героя' : 'Ход зомби…');
      if (h) {
        const hs = E.handSize(g, h);
        const parts = E.handSizeParts(g, h).map((p, i) => (i ? `+${p.n} ${p.name}` : `${p.n} ${p.name}`)).join(', ');
        const hc = el('span', 'hand-size', `🂠 ${h.hand.length}/${hs}`);
        hc.title = `Размер руки ${hs} = ${parts}.\nВ начале хода герой добирает карты до этого числа, но не больше 3 за раз. Лишние карты (сверх лимита) не сбрасываются.`;
        $('#hand-owner').appendChild(hc);
      }
      // энергия
      const en = $('#energy');
      const sig = h ? h.idx + ':' + h.energy : '';
      if (en.dataset.sig === sig) { /* сферы не пересоздаём — без повторной анимации */ } else {
      const prevN = en.dataset.sig && h && en.dataset.sig.split(':')[0] === String(h.idx) ? +en.dataset.sig.split(':')[1] : -1;
      en.dataset.sig = sig;
      en.innerHTML = '';
      if (h) {
        const total = Math.max(h.energy, 3);
        for (let i = 0; i < total; i++) {
          const o = el('img', 'orb' + (i < h.energy ? '' : ' spent'));
          o.src = CV.artURL('energy', 40, 40, { empty: i >= h.energy });
          if (prevN >= 0) o.style.animation = 'none';
          en.appendChild(o);
        }
      }
      }
      $('#deck-count').textContent = h ? h.deck.length : '–';
      $('#discard-count').textContent = h ? h.discard.length : '–';
      if (!h) return;
      const n = h.hand.length;
      const blockBonus = ZG.Mods.value(g, h, 'blockPerCard', 0);
      h.hand.forEach((uid, i) => {
        const def = E.cardDef(g, uid);
        const cost = def.cost != null ? E.cardCost(g, h, uid) : null;
        const c = CV.card(def, { cost, blockBonus });
        c.dataset.uid = uid;
        const playable = !def.unplayable && cost != null && cost <= h.energy && E.targetsFor(g, h, def).length > 0;
        c.classList.toggle('playable', playable);
        c.classList.toggle('dim', !playable);
        if (playable && g.turn && g.turn.lastSuit === def.suit && def.suit !== 'none') {
          c.classList.add('chain-ready');
          c.appendChild(el('div', 'chain-ribbon', 'СВЯЗКА'));
        }
        if (this.sel && this.sel.uid === uid) c.classList.add('selected');
        if (!prev.has(uid)) { c.classList.add('drawn'); c.style.animationDelay = (i * 0.06) + 's'; }
        const mid = (n - 1) / 2;
        c.style.setProperty('--rot', ((i - mid) * Math.min(4, 24 / n)) + 'deg');
        c.style.setProperty('--lift', (Math.abs(i - mid) * Math.min(6, 30 / n)) + 'px');
        c.onclick = () => this.selectCard(uid, c);
        c.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); Modal.zoomCard(def); };
        const slot = el('div', 'hand-slot' + (this.sel && this.sel.uid === uid ? ' sel' : ''));
        slot.appendChild(c);
        hand.appendChild(slot);
        CV.fit(c);
      });
      // снаряжение
      const eq = $('#equip');
      eq.innerHTML = '';
      h.equip.forEach((u) => { const c = CV.card(E.cardDef(g, u), { small: true }); c.classList.add('equipped'); eq.appendChild(c); });
    },

    refreshActions() {
      const g = this.g;
      const bar = $('#actions');
      bar.innerHTML = '';
      const h = g.active != null ? g.heroes[g.active] : null;
      const aiTurn = !!h && h.ai;
      document.body.classList.toggle('ai-turn', aiTurn);
      $('#btn-end').disabled = !h || aiTurn;
      $('#btn-hint').disabled = !h; $('#btn-auto').disabled = !h;
      bar.classList.toggle('icons', !!h && g.phase === 'heroes');
      if (!h || g.phase !== 'heroes') {
        if (g.phase === 'heroes' && g.active == null) {
          g.heroes.filter((x) => x.onBoard && !x.acted).forEach((x) => {
            const b = el('button', 'act big' + (x.ai ? ' ai' : ''), x.ai ? `🤖 Ход ИИ: ${esc(E.heroName(x))}` : `▶ Ход: ${esc(E.heroName(x))}`);
            b.onclick = () => (x.ai ? this.runAI(x.idx) : this.act({ t: 'begin', hero: x.idx }));
            bar.appendChild(b);
          });
        }
        return;
      }
      const legal = E.legal(g);
      const has = (t) => legal.some((a) => a.t === t);
      const zHere = E.zombiesAt(g, h.pos).length;
      // крупный значок: подсвечен, если доступен; затемнён с объяснением, если нет
      const icon = (key, label, cost, ok, why, onclick, extra) => {
        const b = el('button', 'act-icon' + (ok ? ' ok' : ' off') + (extra || ''));
        const im = el('img'); im.src = CV.artURL('act_' + key, 112, 112, {}); im.alt = '';
        b.appendChild(im);
        b.appendChild(el('span', 'ai-label', label));
        if (cost != null) b.appendChild(el('span', 'ai-cost', cost + '⚡'));
        b.title = ok ? label + (cost != null ? ` (${cost} ⚡)` : '') : `${label}: ${why}`;
        b.onclick = () => { if (ok) onclick(); else toast(`${label}: ${why}`); };
        bar.appendChild(b);
      };
      const lack = (c) => `нужно ${c} ⚡ (осталось ${h.energy})`;
      const sc = E.searchCost(g, h);
      const searchHere = E.searchableHere(g, h) || g.crates.some((c) => c.pos === h.pos && !c.opened) || g.search.some((s) => s.pos === h.pos);
      icon('search', 'Обыск', sc, has('search'), !searchHere ? 'в этой зоне нечего обыскивать' : zHere ? 'мешают зомби в зоне' : lack(sc), () => this.act({ t: 'search' }));
      icon('punch', 'Кулак', 1, has('punch'), !zHere ? 'в зоне нет зомби' : lack(1), () => this.selectMode('punch'), this.sel && this.sel.mode === 'punch' ? ' sel' : '');
      const bc = E.barricadeCost(g, h);
      icon('barricade', 'Баррикада', bc, has('barricade'), g.barricades.length >= 4 ? 'все 4 баррикады уже на поле' : lack(bc), () => this.selectMode('barricade'), this.sel && this.sel.mode === 'barricade' ? ' sel' : '');
      const gives = legal.filter((a) => a.t === 'give');
      icon('give', 'Передать', 0, gives.length > 0, g.turn.gave ? 'уже передавали в этот ход' : 'рядом нет другого героя', () => this.giveDialog());
      const wHand = h.hand.some((u) => g.cards[u] === 'wound');
      icon('rest', 'Отдышаться', 3, has('rest'), !wHand ? 'в руке нет Ран' : zHere ? 'мешают зомби в зоне' : lack(3), () => this.act({ t: 'rest' }));
      if (ZG.Mods.flag(g, h, 'healAction')) {
        const hl = legal.filter((a) => a.t === 'heal');
        icon('heal', 'Лечить', 1, hl.length > 0, g.turn.healUsed >= ZG.Mods.value(g, h, 'healAction', 0) ? 'уже лечили в этот ход' : h.energy < 1 ? lack(1) : 'рядом нет раненых', async () => {
          const opts = hl.map((a) => a.hero);
          const i = opts.length === 1 ? opts[0] : await Modal.pickHero(g, opts);
          if (i != null) this.act({ t: 'heal', hero: i });
        });
        const cl = legal.filter((a) => a.t === 'cleanse');
        if (cl.length || E.heroesAt(g, h.pos).some((o) => E.infectCount(g, o))) icon('cleanse', 'Обеззаразить', 1, cl.length > 0, g.turn.healUsed >= ZG.Mods.value(g, h, 'healAction', 0) ? 'уже лечили в этот ход' : h.energy < 1 ? lack(1) : 'Заражение должно быть в руке героя рядом', async () => {
          const opts = cl.map((a) => a.hero);
          const i = opts.length === 1 ? opts[0] : await Modal.pickHero(g, opts);
          if (i != null) this.act({ t: 'cleanse', hero: i });
        }, ' gold');
      }
      if (g.board.cells[h.pos].bld) icon('door', 'Закрыть двери', 1, has('shut'), E.sheltered(g, h) ? 'вы уже в укрытии' : h.energy < 1 ? lack(1) : 'все двери уже закрыты', () => this.act({ t: 'shut' }));
      if (ZG.Mods.flag(g, h, 'plugAction')) icon('plug', 'Заглушка', E.plugCost(g, h), has('plug'), !g.spawnPoints.includes(h.pos) ? 'встаньте в зону с люком' : E.plugged(g, h.pos) ? 'люк уже заглушен' : lack(E.plugCost(g, h)), () => this.act({ t: 'plug' }), ' gold');
      const burns = legal.filter((a) => a.t === 'burn');
      if (burns.length) icon('cleanse', 'Прижечь укус', 2, true, '', async () => {
        const opts = burns.map((a) => a.hero);
        const i = opts.length === 1 ? opts[0] : await Modal.pickHero(g, opts);
        if (i != null) this.act({ t: 'burn', hero: i });
      }, ' gold');
      if (g.drops.length) icon('pickup', 'Подобрать', 1, has('pickup'), 'в зоне нет брошенного груза', () => this.act({ t: 'pickup' }));
      const sa = legal.filter((a) => a.t === 'scenario');
      sa.forEach((a) => icon('task', a.label, a.cost, true, '', () => this.act(a), ' gold'));
      if (E.isComplete(g)) icon('evac', 'Эвакуация', 0, has('evac'), 'дойдите до зоны выхода', () => this.act({ t: 'evac' }), ' gold');
      if (g.survivor) icon('heal', 'Спасти', 1, has('rescue'), 'дойдите до выжившего (SOS на поле)', () => this.act({ t: 'rescue' }), ' gold');
    },

    async giveDialog() {
      const g = this.g;
      const h = g.heroes[g.active];
      const opts = E.legal(g).filter((a) => a.t === 'give');
      const res = await Modal.give(g, h, opts);
      if (res) this.act({ t: 'give', card: res.card, hero: res.hero });
    },

    refreshLog() {
      const g = this.g;
      const box = $('#log');
      for (; this.logSeen < g.log.length; this.logSeen++) {
        const l = g.log[this.logSeen];
        const d = el('div', 'log-line ' + l.kind, esc(l.text));
        box.appendChild(d);
      }
      while (box.childElementCount > 200) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
    },

    async gameOver() {
      const g = this.g;
      store.set('save', null);
      await sleep(600);
      clearTimeout(toast._t); $('#toast').classList.remove('show'); // старые подсказки не висят поверх итогов
      const r = g.result;
      const scr = $('#screen-end');
      const old = $('#end-missions'); if (old) old.remove();
      scr.className = 'screen ' + (r.win ? 'win' : 'lose');
      $('#end-title').textContent = r.win ? 'ВЫ ВЫЖИЛИ' : 'КВАРТАЛ ПАЛ';
      $('#end-reason').textContent = r.reason;
      const stars = $('#end-stars');
      stars.innerHTML = '';
      const starHints = ['Победа', 'Никто не пал', g.bonusId ? ZG.Bonuses.get(g.bonusId).name : 'Бонус'];
      for (let i = 0; i < 3; i++) {
        const s = el('div', 'end-star');
        const im = el('img');
        im.src = CV.artURL('star', 80, 80, { off: i >= r.stars });
        s.appendChild(im);
        s.appendChild(el('small', '', starHints[i]));
        s.style.animationDelay = (0.6 + i * 0.35) + 's';
        if (i < r.stars) s.classList.add('got');
        stars.appendChild(s);
      }
      const st = g.stats;
      $('#end-stats').innerHTML = `
        <div><b>${g.round}</b><span>раунд</span></div>
        <div><b>${st.kills}</b><span>убито</span></div>
        <div><b>${st.wounds + (st.infections || 0)}</b><span>ран</span></div>${st.turned ? `<div><b>${st.turned}</b><span>обращено</span></div>` : ''}
        <div><b>${st.chains}</b><span>связок</span></div>
        <div><b>${st.waves}</b><span>волн</span></div>
        <div><b>${st.searches}</b><span>обысков</span></div>`;
      // раскрытие секретных миссий
      if (g.missions) $('#end-stats').insertAdjacentHTML('afterend', `<div class="end-missions" id="end-missions">${g.heroes.filter((h) => h.mission).map((h) => { const m = ZG.Missions.get(h.mission); return `<span class="${g.missionFirst === h.idx ? 'won' : ''}">${esc(E.heroName(h))}: «${esc(m.name)}» ${h.missionDone ? (g.missionFirst === h.idx ? '✦ первым' : '✓ поздно') : `${E.missionProgress(g, h)}/${m.goal}`}</span>`; }).join('')}</div>`);
      $('#end-seed').textContent = `Сид: ${g.seed} · ${E.scenario(g).name} · ${ZG.Conditions.get(g.conditionId).name} · ${ZG.Difficulties.get(g.difficultyId).name}`;
      $('#btn-again').onclick = () => Game.start({ seed: String(Math.floor(Math.random() * 1e9)), heroes: g.heroes.map((h) => ({ id: h.id, player: h.player, ai: h.ai })), difficultyId: g.difficultyId, fog: g.fog, stealth: g.stealth, missions: g.missions, players: this.players });
      $('#btn-replay').onclick = () => Game.start({ seed: g.seed, heroes: g.heroes.map((h) => ({ id: h.id, player: h.player, ai: h.ai })), scenarioId: g.scenarioId, conditionId: g.conditionId, bonusId: g.bonusId, difficultyId: g.difficultyId, fog: g.fog, stealth: g.stealth, missions: g.missions, players: this.players });
      $('#btn-end-menu').onclick = () => App.show('menu');
      App.show('end');
    },
  };

  // события движка, которые показывает интерфейс (баннеры и т. п.)
  const UI_FX = {
    async phase(ev) {
      this.refreshTop();
      if (ev.name === 'zombies') { this.refreshHand(); this.refreshActions(); this.defaultHelp(); await Banner.show('ФАЗА ЗОМБИ', 'мертвецы идут', 'zombies'); }
      else if (ev.name === 'heroes') { this.refresh(); await Banner.show('РАУНД ' + ev.round, ZG.PHASES[E.phase(this.g)].name.toUpperCase(), 'round'); }
    },
    async dayphase(ev) {
      this.view.targetDark = this.view._darkFor();
      await Banner.show('НАСТУПАЕТ ' + ZG.PHASES[ev.phase].name.toUpperCase(), ev.phase === 2 ? 'мертвецы голодны: +1 к скорости' : 'появляется больше мертвецов', 'night');
    },
    async wave() { this.view.play([{ t: 'wave' }]); await Banner.show('ВОЛНА!', this.g.stealth ? 'орда знает, где вы!' : 'тревога переполнена', 'wave'); },
    async turn(ev) {
      const h = this.g.heroes[ev.hero];
      this.refresh();
      if (this.g.missions && h.mission && !h.ai && !h.missionDone && !(this.seenMission || {})[h.idx] && this.canSeeMission(h)) {
        (this.seenMission = this.seenMission || {})[h.idx] = true;
        const m = ZG.Missions.get(h.mission);
        await Modal.show(`<div class="kicker">Секретная миссия — ${esc(E.heroName(h))}</div><h2>${esc(m.name)}${m.rarity === 'rare' ? ' <small>(редкая)</small>' : ''}</h2><p>${esc(m.text)}</p><p><b>Награда — только если выполните ПЕРВЫМ:</b> ${esc(m.rewardText)}</p><p class="muted">Держите миссию в секрете: союзники могут успеть раньше.</p>`, [{ label: 'Понятно', cls: 'primary' }]);
      }
      if (this.g.turn && this.g.turn.relay) toast(`Эстафета: первая карта масти «${ZG.SUITS[this.g.turn.relay].name}» сработает со Связкой!`, 3200);
      if (this.players === 2 && !h.ai && this.lastPlayer !== h.player) {
        this.lastPlayer = h.player;
        await Banner.show('ИГРОК ' + h.player, 'ход: ' + E.heroName(h), 'player');
      }
    },
    async event(ev) {
      const e = ZG.Events.get(ev.id);
      ZG.Sound.play('reveal');
      this.refreshTop();
      await Banner.show('СОБЫТИЕ: ' + e.name.toUpperCase(), e.tone > 0 ? 'удача улыбается' : e.tone < 0 ? 'становится хуже' : 'будьте начеку', e.tone < 0 ? 'wave' : 'night');
      toast(e.text, 6000);
    },
    async reveal(ev) {
      this.view.play([ev]);
      if (ev.n >= (ZG.Levels.get(this.g.levelId).fogBreak || 4) && this.g.phase === 'zombies') await Banner.show('ПРОРЫВ!', `из тумана выходят ${ev.n} зомби`, 'wave');
      else await sleep(700);
    },
    async bump(ev) { this.view.play([ev]); toast('За поворотом — стена. Пройти здесь нельзя (⚡ потрачена).', 3000); await sleep(300); },
    async alarm() { const a = $('#alarm-track'); a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump'); this.refreshTop(); },
    async draw() { /* анимация добора — в refreshHand */ },
    async gameover() { /* обрабатывается после очереди */ },
    async talent(ev) {
      this.refreshHeroes();
      const h = this.g.heroes[ev.hero], t = ZG.Talents.get(ev.id);
      if (h && t && h.ai) { toast(`🤖 ${E.heroName(h)} берёт талант «${t.name}»: ${t.text}`, 5000); await sleep(600); }
    },
    async infect(ev) {
      this.view.play([ev]);
      this.refreshHeroes();
      toast(`☣ ${E.heroName(this.g.heroes[ev.hero])}: укус! Заражение ×${ev.n} в руке — вылечите до конца своего хода, иначе обращение (аптечка, Марина или «Прижечь укус», 2 ⚡).`, 5000);
      await sleep(250);
    },
    async mission(ev) {
      const h = this.g.heroes[ev.hero], m = ZG.Missions.get(ev.id);
      this.refreshHeroes();
      if (!ev.rewarded) { toast(`${E.heroName(h)} выполнил миссию «${m.name}», но не первым — без награды.`, 4000); return; }
      await Banner.show(m.traitor ? 'ПРЕДАТЕЛЬ!' : 'СЕКРЕТНАЯ МИССИЯ', `${E.heroName(h)}: «${m.name}» — ${m.rewardText}`, m.traitor ? 'wave' : 'night');
      toast(`${E.heroName(h)} — «${m.name}»: ${m.text} Награда: ${m.rewardText}`, 6000);
    },
    async infectTick(ev) { this.view.play([ev]); this.refreshHeroes(); await sleep(300); },
    async turn_hero(ev) {
      this.view.play([ev]);
      const h = this.g.heroes[ev.hero];
      this.refreshHeroes();
      await Banner.show('ОБРАЩЕНИЕ!', `${E.heroName(h)} больше не человек`, 'wave');
    },
    async play(ev) {
      this.view.play([ev]);
      if (ev.chain) {
        const def = ZG.Cards.get(this.g.cards[ev.card]);
        Banner.chain(ZG.SUITS[def.suit], def.chainText);
      }
      await sleep(120);
    },
    async spawncard(ev) { /* карта появления — в журнале */ },
  };

  function pickBest(g, uids) {
    const zs = uids.map((u) => E.zombie(g, u)).filter(Boolean);
    zs.sort((a, b) => ZG.Zombies.get(b.type).threat - ZG.Zombies.get(a.type).threat);
    return zs.length ? zs[0].uid : null;
  }

  function describeAction(g, a) {
    const h = E.activeHero(g);
    switch (a.t) {
      case 'play': {
        const def = E.cardDef(g, a.card);
        let t = '';
        if (def.target) {
          if (def.target.kind === 'zombie') { const z = E.zombie(g, a.target); t = z ? ` → ${ZG.Zombies.get(z.type).name}` : ''; }
          else if (def.target.kind === 'hero') t = ' → ' + E.heroName(g.heroes[a.target]);
          else t = ' → подсвеченная зона';
        }
        const chain = g.turn && g.turn.lastSuit === def.suit ? ' (Связка!)' : '';
        return `сыграть «${def.name}»${t}${chain}`;
      }
      case 'move': return 'перейти в подсвеченную зону';
      case 'search': return 'обыскать зону';
      case 'punch': return 'ударить кулаком';
      case 'barricade': return 'поставить баррикаду';
      case 'heal': return 'обработать раны';
      case 'plug': return 'заглушить люк (2 раунда без зомби отсюда)';
      case 'shut': return 'закрыть двери помещения (укрытие: дальние зомби вас не видят)';
      case 'burn': return 'прижечь укус (Заражения в руке → Раны)';
      case 'cleanse': return 'обеззаразить укус (Заражения в руке → Раны)';
      case 'rest': return 'отдышаться';
      case 'give': return `передать «${E.cardDef(g, a.card).name}» → ${E.heroName(g.heroes[a.hero])}`;
      case 'scenario': return a.label;
      case 'evac': return 'эвакуироваться!';
      case 'rescue': return 'спасти выжившего';
      case 'pickup': return 'подобрать груз';
      default: return a.t;
    }
  }

  function zoneInfo(g, cell, zuid) {
    const c = g.board.cells[cell];
    if (E.hidden(g, cell)) {
      // закрытый тайл: известно только то, что лежит на рубашке
      const ti = c.tile, b = g.board;
      const n = g.zombies.filter((z) => b.cells[z.pos].tile === ti).length;
      const known = [];
      if (g.spawnPoints.some((p) => b.cells[p].tile === ti)) known.push('люк');
      const cr = g.crates.filter((x) => !x.opened && b.cells[x.pos].tile === ti).length;
      if (cr) known.push(cr + ' ' + ZG.util.plural(cr, 'ящик', 'ящика', 'ящиков'));
      const lim = ZG.Levels.get(g.levelId).fogBreak || 4;
      return `<div class="tt-head">Не разведано</div><div>Где стены и что внутри — неизвестно. Войдите базовым «Ходом» из соседней зоны.</div>` +
        (known.length ? `<div class="tt-gold">На рубашке: ${known.join(', ')}</div>` : '') +
        (n ? `<div class="tt-red">Стопка: ${n} зомби (состав неизвестен). При ${lim}+ — прорыв: тайл откроется сам.</div>` : '');
    }
    const parts = [];
    const typeName = c.type === 'building' ? 'Помещение' : c.type === 'blocked' ? 'Непроходимо' : 'Улица';
    parts.push(`<div class="tt-head">${typeName}</div>`);
    const zs = E.zombiesAt(g, cell);
    if (zs.length) {
      const by = {};
      zs.forEach((z) => { const d = ZG.Zombies.get(z.type); (by[z.type] = by[z.type] || []).push(z); });
      parts.push('<div class="tt-z">' + Object.entries(by).map(([t, list]) => {
        const d = ZG.Zombies.get(t);
        const st = g.stealth && !d.immobile ? (list.every((z) => z.awake) ? ' <span class="tt-red">охотится</span>' : list.some((z) => z.awake) ? ' <span class="tt-red">часть охотится</span>' : ' <span>бродит</span>') : '';
        return `<div class="${list.some((z) => z.uid === zuid) ? 'hl' : ''}"><b>${d.name}</b> ×${list.length}${st} <span>♥${d.hp}${list.some((z) => z.dmg) ? ' (ранен)' : ''} ✊${d.dmg} 👣${E.zombieSpeed(g, list[0])}</span><br><small>${esc(d.text)}</small></div>`;
      }).join('') + '</div>');
    }
    const hs = E.heroesAt(g, cell);
    if (hs.length) parts.push(`<div>Герои: ${hs.map((h) => E.heroName(h)).join(', ')}</div>`);
    if (g.doors && c.bld) {
      const ent = E.entrances(g, c.bld);
      const open = ent.filter(([x, y]) => !E.doorClosed(g, x, y)).length;
      const loud = g.board.cells.some((x) => x.bld === c.bld && g.noise[x.i]);
      parts.push(open ? `<div class="tt-red">Двери: открыто ${open} из ${ent.length} — укрытия нет («Закрыть двери», 1 ⚡)</div>`
        : loud ? '<div class="tt-red">Двери закрыты, но внутри шумели — укрытия нет до конца раунда</div>'
        : '<div class="tt-gold">Двери закрыты — укрытие: зомби дальше 1 зоны героев здесь не видят</div>');
    }
    if (cell === g.exit) parts.push(`<div class="tt-gold">Эвакуация: ${esc(E.scenario(g).exitLabel)} ${E.isComplete(g) ? '— ОТКРЫТА' : '— закрыта, пока не выполнена цель'}</div>`);
    if (cell === g.tower) parts.push('<div class="tt-gold">Радиовышка</div>');
    if (g.spawnPoints.includes(cell)) parts.push(E.plugged(g, cell) ? `<div class="tt-gold">Люк заглушен: молчит ещё ${g.plugs[cell] - g.round + 1} р.</div>` : '<div class="tt-red">Точка появления зомби</div>');
    const cr = g.crates.find((x) => x.pos === cell);
    if (cr) parts.push(cr.opened ? '<div>Вскрытый ящик</div>' : '<div class="tt-gold">Ящик: обыщите, чтобы вскрыть</div>');
    const s = g.search.find((x) => x.pos === cell);
    if (s) parts.push(`<div>Жетон обыска${s.kind === 'armory' ? ' (оружейка: тяните на 1 карту больше)' : ''}</div>`);
    if (g.traps.some((t) => t.pos === cell)) parts.push('<div class="tt-red">Растяжка</div>');
    if (g.lures.some((l) => l.pos === cell)) parts.push('<div>Приманка</div>');
    if (g.drops.some((d) => d.pos === cell)) parts.push('<div class="tt-gold">Брошенный груз</div>');
    if (g.survivor && g.survivor.pos === cell) parts.push('<div class="tt-gold">Выживший зовёт на помощь: «Спасти» за 1 ⚡</div>');
    if (g.hazard && g.hazard.pos === cell) parts.push('<div class="tt-red">Утечка газа: взрыв в конце раунда (3 урона зомби, 1 Рана героям)</div>');
    if (cr && !cr.opened && cr.known) parts.push('<div class="tt-gold">Радиоперехват: здесь груз!</div>');
    if (g.noise[cell]) parts.push(`<div>Шум: ${g.noise[cell]}</div>`);
    return parts.length > 1 || c.type !== 'street' ? parts.join('') : '';
  }

  // ================================================================ баннеры
  const Banner = {
    async show(title, sub, kind) {
      const snd = { level: 'round', round: 'round', zombies: 'zombies', wave: 'zombies', night: 'reveal' }[kind];
      if (snd) ZG.Sound.play(snd);
      const b = $('#banner');
      b.className = 'banner ' + (kind || '');
      $('#banner-title').textContent = title;
      $('#banner-sub').textContent = sub || '';
      void b.offsetWidth;
      b.classList.add('in');
      const dur = 1100 / (Game.view ? Game.view.speed : 1);
      await sleep(dur);
      b.classList.add('out');
      await sleep(400 / (Game.view ? Game.view.speed : 1));
      b.className = 'banner';
    },
    chain(suit, text) {
      const c = $('#chain-pop');
      c.innerHTML = 'СВЯЗКА!' + (text ? `<small>${esc(text)}</small>` : '');
      c.style.setProperty('--suit', suit.color);
      c.classList.remove('go'); void c.offsetWidth; c.classList.add('go');
    },
  };

  // ======================================================== полёт карты
  const Fly = {
    card(cardEl, view, hero) {
      if (!cardEl || !hero) return;
      const r = cardEl.getBoundingClientRect();
      const clone = cardEl.cloneNode(true);
      clone.classList.add('flying');
      clone.classList.remove('drawn', 'selected');
      clone.style.left = r.left + 'px'; clone.style.top = r.top + 'px';
      clone.style.width = r.width + 'px'; clone.style.height = r.height + 'px';
      document.body.appendChild(clone);
      const br = view.canvas.getBoundingClientRect();
      const p = view.cellXY(hero.pos);
      const tx = br.left + (p.x / view.W) * br.width - r.width / 2;
      const ty = br.top + (p.y / view.H) * br.height - r.height / 2;
      cardEl.style.visibility = 'hidden';
      clone.animate([
        { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
        { transform: `translate(${(tx - r.left) * 0.5}px, ${(ty - r.top) * 0.5 - 80}px) rotate(-6deg) scale(1.15)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${tx - r.left}px, ${ty - r.top}px) rotate(4deg) scale(0.35)`, opacity: 0 },
      ], { duration: 520, easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = () => clone.remove();
    },
  };

  // ================================================================= модалки
  const Modal = {
    open: false,
    escape() {
      if (this.onEscape) this.onEscape();
    },
    show(html, buttons, extraEl, cls) {
      return new Promise((resolve) => {
        const escBtn = (buttons || []).find((b) => b.label === 'Закрыть' || b.label === 'Отмена');
        this.onEscape = escBtn ? () => { this.close(); resolve(escBtn.value); } : null;
        const m = $('#modal');
        const box = $('#modal-box');
        box.className = 'modal-box ' + (cls || '');
        box.innerHTML = html;
        if (extraEl) box.appendChild(extraEl);
        const bar = el('div', 'modal-buttons');
        (buttons || []).forEach((b) => {
          const btn = el('button', 'btn ' + (b.cls || ''), b.label);
          btn.onclick = () => { if (b.check && !b.check()) return; this.close(); resolve(b.value); };
          bar.appendChild(btn);
        });
        if (buttons && buttons.length) box.appendChild(bar);
        m.classList.add('show');
        $$('.card', box).forEach((c) => CV.fit(c));
        this.open = true;
        m.onclick = (ev) => { if (ev.target === m && buttons && buttons.length === 1 && !buttons[0].modal) { this.close(); resolve(buttons[0].value); } };
      });
    },
    close() { $('#modal').classList.remove('show'); this.open = false; },
    confirm(html, onYes) { this.show(`<p class="confirm">${html}</p>`, [{ label: 'Отмена', value: false }, { label: 'Да', value: true, cls: 'primary' }]).then((v) => v && onYes()); },

    async briefing(g) {
      const sc = E.scenario(g);
      const wrap = el('div', 'brief-cards');
      wrap.appendChild(CV.scenarioCard(sc.id));
      wrap.appendChild(CV.conditionCard(g.conditionId));
      const steps = sc.goals(g).map((x) => `<li>${esc(x.text)}</li>`).join('');
      await this.show(`<div class="kicker">Брифинг</div><h2>${esc(sc.name)}</h2><p>${esc(sc.brief)}</p><ol class="brief-steps">${steps}</ol>
        ${g.bonusId ? `<p>★ Бонусная цель (3-я звезда): <b>${esc(ZG.Bonuses.get(g.bonusId).name)}</b> — ${esc(ZG.Bonuses.get(g.bonusId).text)}</p>` : ''}
        <p class="muted">На поле: <b>жёлтые «?»</b> — жетоны обыска, <b>ящики</b> — возможные грузы, <b>люки</b> — точки появления. Наводите курсор на зоны, чтобы узнать подробности.</p>`, [{ label: 'В бой', cls: 'primary', modal: true }], wrap, 'wide');
    },

    block(g, p) {
      const h = g.heroes[p.hero];
      const wrap = el('div', 'block-cards');
      const picked = new Set();
      const info = el('div', 'block-info');
      const cards = h.hand.filter((u) => E.blockValue(g, h, u) > 0);
      const update = () => {
        let sum = 0; picked.forEach((u) => { sum += E.blockValue(g, h, u); });
        const taken = Math.max(0, p.remaining - sum);
        const left = E.maxHp(g, h) - E.woundCount(g, h) - E.infectCount(g, h) - taken;
        info.innerHTML = `Отражено картами: <b>${sum}</b> / ${p.remaining} → получите <b class="${taken ? 'bad' : 'good'}">${taken} урона</b>` + (taken ? ` <small>(за каждый кубик: 1–2 ☣ Заражение, 3–6 Рана)</small>` : '') + (left <= 0 ? ' <b class="bad">— ГЕРОЙ ПАДЁТ!</b>' : '');
      };
      cards.forEach((u) => {
        const def = E.cardDef(g, u);
        const c = CV.card(def, { blockBonus: ZG.Mods.value(g, h, 'blockPerCard', 0) });
        c.classList.add('pickable');
        c.onclick = () => { if (picked.has(u)) picked.delete(u); else picked.add(u); c.classList.toggle('picked', picked.has(u)); update(); };
        wrap.appendChild(c);
      });
      const attackers = p.attackers.map((u) => E.zombie(g, u)).filter(Boolean).map((z) => ZG.Zombies.get(z.type).name);
      update();
      const holder = el('div');
      holder.appendChild(wrap); holder.appendChild(info);
      return this.show(`<div class="kicker red">Атака!</div><h2>${esc(E.heroName(h))}: ${p.incoming} урона</h2>
        <p>Атакуют: ${esc(attackers.join(', '))}. ${p.auto ? `Блок и снаряжение уже отразили <b>${p.auto}</b>.` : ''}<br>Сбросьте карты со щитом, чтобы отразить урон. Каждый неотражённый урон — карта Раны в ваш сброс.</p>`,
      [{ label: 'Авто', value: 'auto' }, { label: 'Подтвердить', value: 'ok', cls: 'primary' }], holder, 'wide').then((v) => {
        if (v === 'auto') return ZG.Bot.chooseBlock(g, p);
        return Array.from(picked);
      });
    },

    talent(g, p) {
      const h = g.heroes[p.hero];
      return new Promise((resolve) => {
        const wrap = el('div', 'talent-pick');
        p.options.forEach((id) => {
          const c = CV.talentCard(id);
          c.onclick = () => { this.close(); resolve(id); };
          wrap.appendChild(c);
        });
        this.show(`<div class="kicker gold">Новый уровень</div><h2>${esc(E.heroName(h))} закаляется</h2><p>Выберите талант — он останется до конца партии.</p>`, [], wrap, 'wide');
      });
    },

    loot(g, p) {
      const h = g.heroes[p.hero];
      return new Promise((resolve) => {
        const wrap = el('div', 'block-cards loot-pick');
        p.options.forEach((id, i) => {
          const c = CV.card(id);
          c.classList.add('pickable', 'deal');
          c.style.animationDelay = (i * 0.12) + 's';
          c.onclick = () => { this.close(); resolve(id); };
          c.oncontextmenu = (ev) => ev.preventDefault();
          wrap.appendChild(c);
        });
        this.show(`<div class="kicker gold">Обыск</div><h2>${esc(E.heroName(h))} находит…</h2><p>Возьмите одну карту в руку. Остальные уйдут под низ колоды добычи.</p>`, [], wrap, 'wide');
      });
    },

    pickHero(g, idxs) {
      const wrap = el('div', 'pick-heroes');
      return new Promise((resolve) => {
        idxs.forEach((i) => {
          const h = g.heroes[i];
          const b = el('button', 'btn', esc(E.heroName(h)) + ` <small>(${E.woundCount(g, h)} ран${E.infectCount(g, h) ? `, ☣${E.infectCount(g, h)}` : ''})</small>`);
          b.onclick = () => { this.close(); resolve(i); };
          wrap.appendChild(b);
        });
        this.show('<h2>Выберите героя</h2>', [{ label: 'Отмена', value: null }], wrap).then(resolve);
      });
    },

    give(g, h, opts) {
      const wrap = el('div', 'give');
      let card = null;
      const heroes = [...new Set(opts.map((a) => a.hero))];
      let hero = heroes[0];
      const cards = el('div', 'block-cards');
      [...new Set(opts.map((a) => a.card))].forEach((u) => {
        const c = CV.card(E.cardDef(g, u), { small: true });
        c.classList.add('pickable');
        c.onclick = () => { card = u; $$('.picked', cards).forEach((x) => x.classList.remove('picked')); c.classList.add('picked'); };
        cards.appendChild(c);
      });
      wrap.appendChild(cards);
      if (heroes.length > 1) {
        const hb = el('div', 'pick-heroes');
        heroes.forEach((i) => { const b = el('button', 'chip' + (i === hero ? ' on' : ''), esc(E.heroName(g.heroes[i]))); b.onclick = () => { hero = i; $$('.chip', hb).forEach((x) => x.classList.remove('on')); b.classList.add('on'); }; hb.appendChild(b); });
        wrap.appendChild(hb);
      }
      return this.show(`<h2>Передать карту</h2><p>Кому: ${heroes.length === 1 ? esc(E.heroName(g.heroes[hero])) : 'выберите ниже'}.</p>`,
        [{ label: 'Отмена', value: null }, { label: 'Передать', value: 'ok', cls: 'primary', check: () => card != null }], wrap, 'wide')
        .then((v) => (v ? { card, hero } : null));
    },

    zoomCard(def) {
      const c = CV.card(def);
      c.classList.add('zoomed');
      this.show('', [{ label: 'Закрыть' }], c, 'zoom');
    },

    heroInfo(id, h) {
      const c = CV.heroCard(id, { bio: true, talents: true });
      c.classList.add('big');
      this.show('', [{ label: 'Закрыть' }], c, 'wide');
    },
  };

  // ================================================================= правила
  const Rules = {
    open() {
      const m = $('#rules');
      if (!$('iframe', m)) { const f = el('iframe'); f.src = 'rules.html?embed=1'; m.querySelector('.rules-frame').appendChild(f); }
      m.classList.add('show');
      $('#rules-close').onclick = () => m.classList.remove('show');
    },
  };

  function toast(text, ms) {
    const t = $('#toast');
    t.innerHTML = esc(text);
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms || 2200);
  }

  ZG.App = App; ZG.Game = Game; ZG.Modal = Modal;
  document.addEventListener('DOMContentLoaded', () => App.init());
})(window);
