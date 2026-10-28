/*
 * Интерфейс: экраны (меню → подготовка → партия → итог), панель героев,
 * рука, действия, модальные окна, баннеры фаз и связь с BoardView.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const E = ZG.Engine;
  const CV = ZG.CardView;
  const CMP = ZG.Campaign;
  const el = CV.el, esc = CV.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('zg_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('zg_' + k, JSON.stringify(v)); } catch (e) { /* нет хранилища */ } },
  };

  // открытые секретные герои (спасены в кампании хотя бы раз) — появляются в выборе отряда одиночной игры
  ZG.unlockedHeroes = store.get('unlocked', []);
  ZG.unlockHero = (id) => { if (!ZG.unlockedHeroes.includes(id)) { ZG.unlockedHeroes.push(id); store.set('unlocked', ZG.unlockedHeroes); } };

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
      if (name === 'menu') { $('#btn-continue').style.display = store.get('save', null) ? '' : 'none'; if (ZG.Sound._musicKey === 'shelter') ZG.Sound.stopMusic(800); }
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
      $('#btn-new').onclick = () => { this.setupMode = 'single'; this.renderSetup(); this.show('setup'); };
      $('#btn-campaign').onclick = () => Slots.show();
      $('#btn-slots-back').onclick = () => this.show('menu');
      $('#btn-rules').onclick = () => Rules.open();
      $('#btn-gallery').onclick = () => Gallery.show();
      $('#btn-print').onclick = () => window.open('print.html', '_blank');
      const saved = store.get('save', null);
      $('#btn-continue').style.display = saved ? '' : 'none';
      $('#btn-continue').onclick = () => { const s = store.get('save', null); if (s) Game.resume(s); };
    },

    // ----------------------------------------------------- подготовка
    initSetup() {
      const s = this.setup;
      const heroesWrap = $('#setup-heroes');
      ZG.Heroes.visible().forEach((h) => {
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
      $('#btn-setup-back').onclick = () => (this.setupMode === 'camp' ? Slots.show() : this.show('menu'));
      $('#btn-start').onclick = () => {
        if (!s.heroes.length) return toast('Выберите хотя бы одного героя.');
        if (s.players === 2 && (!s.heroes.some((h) => h.player === 1 && !h.ai) || !s.heroes.some((h) => h.player === 2 && !h.ai))) return toast('У каждого игрока должен быть хотя бы один герой не под ИИ.');
        store.set('setup', s);
        if (this.setupMode === 'camp') {
          // новая кампания: отряд = выбранные герои (размер отряда фиксирован до конца)
          const c = CMP.create({ heroes: s.heroes.map((h) => ({ id: h.id, player: h.player, ai: !!h.ai })), difficultyId: s.difficulty, players: s.players, seed: s.seed || undefined, name: 'Кампания' });
          this.campaign = { c, slot: this.campSlot };
          CMP.save(c, this.campSlot);
          Game.startCampaignMission(c.roster.map((h) => h.id));
          return;
        }
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

    newCampaign(slot) {
      this.campSlot = slot;
      this.setupMode = 'camp';
      this.renderSetup();
      this.show('setup');
    },

    renderSetup() {
      const s = this.setup;
      const camp = this.setupMode === 'camp';
      $('#screen-setup').classList.toggle('camp', camp);
      $('#screen-setup .setup-head h2').textContent = camp ? 'Новая кампания' : 'Подготовка к вылазке';
      $$('#screen-setup .setup-grid .step-num').forEach((n, i) => { n.textContent = camp ? (i === 2 ? '2' : '') : String(i + 2); });
      $('#btn-start').textContent = camp ? 'Начать кампанию' : 'Начать вылазку';
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
        (camp ? ` <b>Размер отряда (${n}) фиксирован до конца кампании</b>: столько героев идёт на каждую миссию.` : '') +
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
      $('#btn-menu').onclick = async () => {
        // пока открыто меню, ИИ-герои ждут (иначе партия продолжается под окном)
        this.menuHold = true;
        if (!this.camp) {
          const yes = await Modal.show('<p class="confirm">Выйти в меню? Партия сохранится.</p>', [{ label: 'Отмена', value: false }, { label: 'Да', value: true, cls: 'primary' }]);
          this.menuHold = false;
          if (yes) this.leave();
          return;
        }
        // кампания: выход и отладочное завершение миссии (для проверки убежища без прохождения)
        const v = await Modal.show('<h2>Меню</h2><p>Миссия кампании сохранится в слоте.</p><p class="muted">🛠 Отладка: завершить миссию сразу — чтобы проверить переходы, покупки, износ и мораль.</p>',
          [{ label: 'Выйти в меню', value: 'exit' }, { label: '🛠 Победа ★', value: 'w1' }, { label: '🛠 Победа ★★', value: 'w2' }, { label: '🛠 Победа ★★★', value: 'w3' }, { label: '🛠 Провал', value: 'lose' }, { label: 'Отмена', cls: 'primary' }]);
        this.menuHold = false;
        if (v === 'exit') { this.leave(); return; }
        if (v && this.g && !this.g.result) {
          const g = this.g, win = v !== 'lose';
          g.result = { win, stars: win ? +v.slice(1) : 0, reason: win ? 'Отладка: миссия засчитана' : 'Отладка: миссия провалена', round: g.round };
          g.phase = 'over'; g.pending = null; g.active = null; g.turn = null;
          this.gameOver();
        }
      };
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
      // режим «стол»: поле под углом, как настоящая коробка на столе
      const tb = $('#btn-table');
      const applyTable = () => { const on = store.get('table', false) && innerWidth >= 900; document.querySelector('.board-wrap').classList.toggle('table', on); tb.classList.toggle('on', on); if (this.view) { this.view.table = on; this.view.resize(); } };
      tb.onclick = () => { store.set('table', !store.get('table', false)); applyTable(); };
      this.applyTable = applyTable;
      $('#deck-pile').onclick = () => this.showPile('deck');
      $('#discard-pile').onclick = () => this.showPile('discard');
      $('#exhaust-pile').onclick = () => this.showPile('exhaust');
      document.addEventListener('keydown', (ev) => this.onKey(ev));
      document.addEventListener('contextmenu', (ev) => { if (this.sel && App.screen === 'game') { ev.preventDefault(); this.cancelSel(); } });
    },

    // выход в меню посреди партии: сохраняем и «обрываем» все асинхронные цепочки этой партии
    // (ход ИИ, анимации, звуки, всплывающие окна) — они сверяют this.run и тихо завершаются
    leave() {
      this.save();
      this.run = (this.run || 0) + 1;
      this.busy = false; this.aiRunning = false; this.menuHold = false;
      document.body.classList.remove('busy');
      Modal.waiters.length = 0; // окна событий, ждавшие очереди, не всплывут в меню
      this.view.abort();
      $('#banner').className = 'banner';
      ZG.Sound.stopMusic(800);
      App.show('menu');
    },
    live(run) { return run === this.run && App.screen !== 'menu'; },
    newRun() {
      this.run = (this.run || 0) + 1;
      this.busy = false; this.aiRunning = false; this.menuHold = false;
      document.body.classList.remove('busy');
    },

    start(opts) {
      this.newRun();
      this.camp = opts.campaign ? App.campaign : null;
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

    // кампания: следующая миссия выбранным отрядом
    startCampaignMission(squad) {
      const camp = App.campaign;
      const opts = CMP.startMission(camp.c, squad);
      if (opts.error) { toast(opts.error); return false; }
      const sold = camp.c.lastJunkSale || [];
      if (sold.length) toast('Скупщик забрал Ценности: ' + Object.entries(sold.reduce((m, x) => ((m[x.hero] = (m[x.hero] || []).concat(x.price)), m), {})).map(([id, ps]) => `${ZG.Heroes.get(id).name} — ${ps.join(' и ')} 🎫`).join('; '), 6000);
      opts.players = camp.c.players;
      CMP.save(camp.c, camp.slot);
      this.start(opts);
      return true;
    },

    resume(save, camp) {
      this.newRun();
      this.camp = camp || null;
      try {
        const g = save.g;
        if (g.v !== 2) throw new Error('старая версия сохранения (поле стало больше)');
        const level = ZG.Levels.get(g.levelId);
        // поле детерминированно восстанавливается из сида
        const tmp = E.create({ seed: g.seed, heroes: g.heroes.map((h) => ({ id: h.id, player: h.player, ai: h.ai })), scenarioId: g.scenarioId, conditionId: g.conditionId, bonusId: g.bonusId, difficultyId: g.difficultyId, levelId: level.id, tileRules: g.tileRules, quiet: true });
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
      if (this.camp) {
        // кампания: незаконченная миссия хранится в слоте кампании
        const c = this.camp.c;
        if (!this.g || this.g.result) return;
        const b = this.g.board; this.g.board = null;
        const fx = this.g.fx; this.g.fx = [];
        c.game = this.g; CMP.save(c, this.camp.slot); c.game = null;
        this.g.board = b; this.g.fx = fx;
        return;
      }
      if (!this.g || this.g.result) { store.set('save', null); return; }
      const b = this.g.board; this.g.board = null;
      const fx = this.g.fx; this.g.fx = [];
      store.set('save', { g: this.g, players: this.players });
      this.g.board = b; this.g.fx = fx;
    },

    async afterShow(intro) {
      this.view.setGame(this.g, intro);
      if (this.applyTable) this.applyTable();
      ZG.Sound.music('music'); // «Время перемен» — с первого показа поля до конца вылазки
      this.g.fx = [];
      this.refresh();
      const run = this.run;
      if (intro) {
        await sleep(2700);
        if (!this.live(run)) return;
        const lv = ZG.Levels.get(this.g.levelId), ac = this.g.campaign && ZG.App.campaign, cm = ac && ZG.Campaign.missionDef(ac.c);
        if (cm && cm.name) await Banner.show(`МИССИЯ ${ac.c.missionNo + 1}`, cm.name.toUpperCase(), 'level');
        else await Banner.show(`УРОВЕНЬ ${lv.num}`, lv.name.toUpperCase(), 'level');
        if (cm && cm.stories && cm.stories.start && !(this.g.storySeen || {})[cm.stories.start]) { (this.g.storySeen = this.g.storySeen || {})[cm.stories.start] = true; await UI_FX.story.call(this, { id: cm.stories.start }); }
        if (!this.live(run)) return;
        await Modal.briefing(this.g);
        if (!this.live(run)) return;
        await Banner.show('РАУНД 1', E.phaseName(this.g, 0).toUpperCase(), 'round');
      }
      if (!this.live(run)) return;
      this.refresh();
      if (this.g.pending) await this.handlePending();
      this.maybeAutoBegin();
      // сохранение сделано посреди хода ИИ-героя (выход в меню) — он доигрывает свой ход
      const g = this.g;
      if (this.live(run) && !g.result && !g.pending && g.phase === 'heroes' && g.active != null && g.heroes[g.active].ai) this.runAI();
    },

    resize() { if (this.g && App.screen === 'game') { this.view.resize(); } },

    // ---------------------------------------------------- действия
    async act(a, opts) {
      if (this.busy || !this.g) return false;
      const g = this.g, run = this.run;
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
      if (!this.live(run)) return false;
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
      const run = this.run;
      while (g.fx.length && this.live(run)) {
        const evs = g.fx.splice(0);
        let batch = [];
        const flush = async () => { if (batch.length) { const b = batch; batch = []; this.refreshTop(); await this.view.play(b); } };
        for (const ev of evs) {
          if (!this.live(run)) return;
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
      const run = this.run;
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
          if (this.menuHold) await this.waitUnpause();
          if (!this.live(run)) return;
          await this.act({ t: 'begin', hero: h.idx });
        }
        if (this.live(run) && g.active != null && g.heroes[g.active].ai) await this.autoTurn(true);
      } finally { if (this.live(run)) this.aiRunning = false; }
      if (!this.live(run)) return;
      if (g.phase === 'heroes' && g.active == null && !g.result) this.maybeAutoBegin();
    },

    async handlePending() {
      const g = this.g;
      const p = g.pending;
      if (!p) return;
      // решения ИИ-героя принимает бот
      if (g.heroes[p.hero] && g.heroes[p.hero].ai) {
        const run = this.run;
        await sleep(300 / this.view.speed);
        if (this.menuHold) await this.waitUnpause();
        if (!this.live(run)) return;
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
      } else if (mode === 'ttshot') {
        const t = E.legal(g).filter((a) => a.t === 'ttshot').map((a) => a.zombie);
        if (!t.length) return toast('Некуда стрелять.');
        this.sel = { mode, targets: t };
        this.setHelp('Выстрел из ТТ: выберите врага в 0–2 зонах по прямой (2 урона, Шум 1).');
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
      } else if (s.mode === 'punch' || s.mode === 'ttshot') this.view.setHighlights({ zombies: s.targets });
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
          if (near) toast(E.exhausted(g, h) ? 'Герой обессилен: ходить нельзя — отдышитесь или сыграйте карту перемещения.' : `Не хватает ⚡: шаг стоит ${E.moveCost(g, h, p.cell)}, осталось ${h.energy}.`);
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
      } else if (s.mode === 'ttshot') {
        let z = p.zombie && s.targets.includes(p.zombie) ? p.zombie : null;
        if (!z && p.cell != null) { const zs = s.targets.filter((u) => (E.zombie(g, u) || {}).pos === p.cell); if (zs.length) z = pickBest(g, zs); }
        if (z) this.act({ t: 'ttshot', zombie: z }); else toast('Это не подходящая цель.');
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
      x = Math.max(8, x); y = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)); // высокая подсказка не уходит за край экрана
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
      const idx = g.active, run = this.run;
      for (let i = 0; i < 25 && g.active === idx && !g.result && !g.pending; i++) {
        const a = ZG.Bot.bestAction(g);
        if (!a) break;
        const cardEl = a.t === 'play' ? $(`#hand .card[data-uid="${a.card}"]`) : null;
        await this.act(a, { cardEl });
        await sleep(fromAI ? 380 / this.view.speed : 150);
        if ((this.paused && fromAI) || this.menuHold) { await this.waitUnpause(); }
        if (!this.live(run)) return;
      }
      if (this.live(run) && g.active === idx && !g.pending) await this.act({ t: 'end' });
    },

    waitUnpause() {
      const run = this.run;
      return new Promise((res) => { const t = setInterval(() => { if ((!this.paused && !this.menuHold) || !this.live(run)) { clearInterval(t); res(); } }, 200); });
    },

    showPile(which) {
      const g = this.g;
      if (!g || g.active == null) return;
      const h = g.heroes[g.active];
      // карты группируются по виду с количеством; в колоде порядок скрыт (сортировка по масти и названию)
      const pile = which === 'deck' ? h.deck : which === 'exhaust' ? (h.exhaust || []) : h.discard;
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
      const title = which === 'deck' ? `Колода: ${pile.length}` : which === 'exhaust' ? `Изнеможение: ${pile.length} / ${E.EXHAUST_AT}` : `Сброс: ${pile.length}`;
      const sub = which === 'deck' ? 'Порядок скрыт — показан состав.' : which === 'exhaust' ? `Карты, сброшенные на блок. Возвращаются в сброс только действием «Отдышаться» (3 ⚡, в зоне без зомби). При ${E.EXHAUST_AT}+ картах герой обессилен: рука −1, базовые действия недоступны.` : 'Перемешается в колоду, когда она закончится.';
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
      } else if (g.active != null && E.exhausted(g, g.heroes[g.active])) {
        html = '😮‍💨 Герой обессилен: рука −1, ходить и действовать без карт нельзя. «Отдышаться» (3 ⚡, в зоне без зомби) вернёт карты из Изнеможения.';
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
          s.title = `Раунд ${r}: ${E.phaseName(g, ph)}`;
          track.appendChild(s);
        }
      }
      $$('.rt-slot', track).forEach((s, i) => { s.classList.toggle('past', i + 1 < g.round); s.classList.toggle('now', i + 1 === g.round); });
      $('#phase-name').textContent = E.phaseName(g);
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
      // окно задач: номер, состояние (выполнено / провалено с причиной / новая задача)
      $('#goals').innerHTML = `<div class="goal-title"><span>Задание</span>${esc(E.scenario(g).name)}</div>` + goals.map((x, i) => {
        const st = x.failed ? 'failed' : x.done ? 'done' : x.isNew ? 'new' : '';
        const mark = x.failed ? '✕' : x.done ? '✓' : String(i + 1);
        return `<div class="goal ${st}"><i>${mark}</i><div class="goal-body">${x.isNew ? '<span class="goal-tag">Новая задача</span>' : ''}<span class="goal-text">${esc(x.text)}</span>${x.note ? `<small class="goal-note">${esc(x.note)}</small>` : ''}</div></div>`;
      }).join('') +
        (E.isComplete(g) ? (g.heroes.some((h) => h.onBoard && E.canEvac(g, h))
          ? `<div class="goal-evac">Эвакуация открыта: «${esc(E.scenario(g).exitLabel)}» — действие «Эвакуация» в этой зоне.</div>`
          : `<div class="goal-evac blocked">Эвакуация закрыта: ${esc(lcFirst(E.scenario(g).evacBlockedText || 'сейчас уйти нельзя.'))}</div>`) : '');
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
        const drawn = CV.artURL(h.turned ? 'z_turned_' + h.id : def.art, 96, 96, {});
        const face = h.turned ? def.turnedFace : def.face;
        if (face) { img.onerror = () => { img.onerror = null; img.src = drawn; }; img.src = face; } else img.src = drawn;
        const pw = el('div', 'hp-pwrap'); pw.appendChild(img);
        pw.appendChild(el('span', 'hp-lvl', String(h.level)));
        c.appendChild(pw);
        // треки: Стойкость (фишки-сердца в ячейках) и опыт (фишка скользит по шкале)
        // панель перерисовывается часто: изменение запоминаем на время анимации и продолжаем её
        // (отрицательный animation-delay), а не обнуляем при следующей перерисовке
        this.heroPrev = this.heroPrev || {}; this.heroAnim = this.heroAnim || {};
        const okN = hp - w - inf;
        const last = this.heroPrev[h.idx], now = performance.now();
        if (last && (last.ok !== okN || last.inf !== inf || last.xp !== h.xp)) this.heroAnim[h.idx] = { t0: now, base: last, hit: okN < last.ok };
        this.heroPrev[h.idx] = { ok: okN, inf, xp: h.xp };
        const an = this.heroAnim[h.idx], el0 = an ? now - an.t0 : Infinity;
        const prev = el0 < 1000 ? an.base : null, dl = prev ? ` style="animation-delay:-${Math.round(el0)}ms"` : '';
        const pips = [];
        for (let i = 0; i < hp; i++) {
          const st = i < okN ? 'ok' : i < hp - w ? 'inf' : 'hurt';
          const was = prev ? (i < prev.ok ? 'ok' : i < prev.ok + prev.inf ? 'inf' : 'hurt') : st;
          const anim = prev && was !== st ? (st === 'ok' ? ' gain' : was === 'ok' ? ' lose' : '') : '';
          pips.push(`<span class="slot"><i class="tok ${st}${anim}"${anim ? dl : ''}></i></span>`);
        }
        if (an && an.hit && el0 < 600 && h.onBoard) { c.classList.add('shake'); c.style.animationDelay = -Math.round(el0) + 'ms'; }
        const LV = g.xpLevels || E.XP_LEVELS;
        const XPMAX = LV[LV.length - 1], xpTo = Math.min(XPMAX, h.xp);
        const xpFrom = prev ? Math.min(XPMAX, prev.xp) + (xpTo - Math.min(XPMAX, prev.xp)) * Math.min(1, el0 / 1000) : xpTo;
        const xpNext = LV.find((v) => h.xp < v) || null;
        const status = E.sheltered(g, h) ? '🏠 В УКРЫТИИ' : h.onBoard && E.exhausted(g, h) ? '😮‍💨 ОБЕССИЛЕН' : h.turned ? 'ОБРАЩЁН' : h.fallen ? 'ПАЛ' : h.evacuated ? 'СПАСЁН' : h.idx === g.active ? 'ХОДИТ' : h.acted ? 'походил' : 'готов';
        const info = el('div', 'hp-info');
        info.innerHTML = `
          <div class="hp-name">${esc(def.name)} <small>${h.ai ? '🤖 ИИ' : this.players === 2 ? 'И' + h.player : ''}</small><span class="hp-status">${status}</span></div>
          <div class="trk trk-hp" title="Стойкость: ${okN} из ${hp}${inf ? ` · ☣ Заражений: ${inf}` : ''}"><b class="trk-l">♥</b><span class="slots">${pips.join('')}</span>${infHand && h.onBoard ? '<b class="inf-warn" title="Заражение в руке: в конце хода герой обратится! Нужна аптечка или Марина.">☣ В РУКЕ!</b>' : inf ? `<b class="inf-mark">☣${inf}</b>` : ''}</div>
          <div class="trk trk-xp" title="Опыт ${h.xp}${xpNext ? ' — следующий уровень на ' + xpNext : ''}"><b class="trk-l">🎖</b><span class="xp-line">${Array.from({ length: XPMAX + 1 }, (_, i) => `<i class="tick${LV.includes(i) ? ' gate' : ''}${i <= xpTo ? ' on' : ''}" style="left:${(i / XPMAX) * 100}%"></i>`).join('')}<i class="xp-tok" data-to="${(xpTo / XPMAX) * 100}" style="left:${(xpFrom / XPMAX) * 100}%"></i></span><b class="xp-n">${h.xp}</b></div>
          <div class="hp-meta">
            <span title="Размер руки: до стольких карт герой добирает в начале хода (не больше 3 за раз)">✋ ${E.handSize(g, h)}</span>
            <span title="Колода / сброс">🂠 ${h.deck.length}/${h.discard.length}</span>
            ${(h.exhaust || []).length ? `<span class="${E.exhausted(g, h) ? 'tired' : ''}" title="Изнеможение: карты, сброшенные на блок (при ${E.EXHAUST_AT}+ — обессилен). Вернуть — «Отдышаться».">😮‍💨 ${h.exhaust.length}/${E.EXHAUST_AT}</span>` : ''}
            ${h.block ? `<span title="Блок до следующего хода">🛡 ${h.block}</span>` : ''}
            ${g.heroes.some((o) => o !== h && o.onBoard && E.rel(g, h, o) <= -3) ? `<span class="enemy-rel" title="Враги: ${esc(g.heroes.filter((o) => o !== h && o.onBoard && E.rel(g, h, o) <= -3).map((o) => E.heroName(o)).join(', '))}. Закончил ход в тайле врага — у того −1 ⚡ в следующий ход.${h.irritated ? ' СЕЙЧАС: −1 ⚡ в следующий ход.' : ''}">⚔${h.irritated ? ' −1⚡' : ''}</span>` : ''}
            ${E.bondPartners(g, h).length ? `<span class="${h.bondReady || (h.idx === g.active && g.turn && g.turn.bond) ? 'bond-on' : ''}" title="Узы с: ${esc(E.bondPartners(g, h).map((o) => E.heroName(o)).join(', '))}. Если напарник заканчивает ход в твоём тайле, первая карта твоего следующего хода срабатывает со Связкой (если у неё есть эффект Связки).${h.bondReady ? ' СЕЙЧАС: готово!' : ''}">🤝${h.bondReady || (h.idx === g.active && g.turn && g.turn.bond) ? ' Узы!' : ''}</span>` : ''}
            ${h.adrenaline ? `<span title="Адреналин">+${h.adrenaline}⚡</span>` : ''}
            ${h.hidden ? '<span>👻</span>' : ''}
          </div>
          ${this.missionLine(h)}
          ${h.talents.length || (h.perks || []).length ? `<div class="hp-talents">${h.talents.map((t) => esc(ZG.Talents.get(t).name)).concat((h.perks || []).map((id) => '✦ ' + esc(ZG.Missions.get(id).perk.name))).join(' · ')}</div>` : ''}
          ${h.equip.length ? `<div class="hp-equip">${h.equip.map((u) => esc(E.cardDef(g, u).name)).join(' · ')}</div>` : ''}`;
        c.appendChild(info);
        // фишка опыта переезжает к новому значению
        const xt = info.querySelector('.xp-tok');
        if (xt) requestAnimationFrame(() => requestAnimationFrame(() => { xt.style.left = xt.dataset.to + '%'; }));
        const ml = info.querySelector('.hp-mission.mine');
        if (ml) ml.onclick = (ev) => {
          ev.stopPropagation();
          const m = ZG.Missions.get(h.mission);
          Modal.show(`<div class="kicker">Секретная миссия — ${esc(E.heroName(h))}</div><h2>${esc(m.name)}: ${E.missionProgress(g, h)}/${m.goal}</h2><p>${esc(m.text)}</p><p><b>Награда — только первому:</b> ${esc(m.rewardText)}</p>`, [{ label: 'Закрыть', cls: 'primary' }]);
        };
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
    async showMission(h) {
      const m = ZG.Missions.get(h.mission);
      (this.seenMission = this.seenMission || {})[h.idx] = true;
      this.refreshHeroes();
      await Modal.show(`<div class="kicker">Новая секретная миссия — ${esc(E.heroName(h))}</div><h2>${esc(m.name)}</h2><p>${esc(m.text)}</p><p><b>Награда — только первому:</b> ${esc(m.rewardText)}</p>`, [{ label: 'Понятно', cls: 'primary' }]);
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
      return `<div class="hp-mission mine" style="cursor:pointer" title="${esc(m.text)}\nНаграда (только первому): ${esc(m.rewardText)}">🂠 ${esc(m.name)}: ${E.missionProgress(g, h)}/${m.goal}${g.missionFirst != null ? ' · награда уже ушла' : ''}</div>`;
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
      $('#exhaust-count').textContent = h ? `${(h.exhaust || []).length}/${E.EXHAUST_AT}` : '–';
      $('#exhaust-pile').classList.toggle('tired', !!(h && E.exhausted(g, h)));
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
        if (playable && E.chainsNow(g, def)) {
          c.classList.add('chain-ready');
          c.appendChild(el('div', 'chain-ribbon', g.turn.bond && !g.turn.played && g.turn.lastSuit !== def.suit ? 'УЗЫ' : 'СВЯЗКА'));
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
      const tired = E.exhausted(g, h);
      const icon = (key, label, cost, ok, why, onclick, extra) => {
        if (!ok && tired && key !== 'rest') why = 'герой обессилен — сначала «Отдышаться»';
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
      icon('punch', 'Кулак', E.PUNCH_COST, has('punch'), !zHere ? 'в зоне нет зомби' : lack(E.PUNCH_COST), () => this.selectMode('punch'), this.sel && this.sel.mode === 'punch' ? ' sel' : '');
      if (ZG.Mods.flag(g, h, 'ttShot')) icon('ttshot', 'Выстрел из ТТ', 1, has('ttshot'), g.turn.ttShot ? 'уже стреляли в этот ход' : h.energy < 1 ? lack(1) : 'нет врага в 0–2 зонах по прямой', () => this.selectMode('ttshot'), (this.sel && this.sel.mode === 'ttshot' ? ' sel' : '') + ' gold');
      const bc = E.barricadeCost(g, h);
      icon('barricade', 'Баррикада', bc, has('barricade'), g.barricades.length >= 4 ? 'все 4 баррикады уже на поле' : lack(bc), () => this.selectMode('barricade'), this.sel && this.sel.mode === 'barricade' ? ' sel' : '');
      const gives = legal.filter((a) => a.t === 'give');
      const nearO = g.heroes.filter((o) => o !== h && o.onBoard && o.pos === h.pos);
      icon('give', 'Передать', 0, gives.length > 0, nearO.length && nearO.every((o) => E.rel(g, h, o) < 0) ? 'неприязнь: эти герои не передают друг другу карты' : g.turn.gave ? 'уже передавали в этот ход (Приятелям и Друзьям — без ограничений)' : !g.heroes.some((o) => o !== h && o.onBoard && o.pos === h.pos) ? 'рядом нет другого героя' : 'в руке нет находок, груза или карт кампании (базовые карты не передаются)', () => this.giveDialog());
      icon('rest', 'Отдышаться', 3, has('rest'), !(h.exhaust || []).length ? 'Изнеможение пусто (туда уходят карты, сброшенные на блок)' : zHere ? 'мешают зомби в зоне' : lack(3), () => this.act({ t: 'rest' }), tired ? ' gold' : '');
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
      if (ZG.Mods.flag(g, h, 'shoutAction')) icon('shout', 'Луженая глотка', 0, has('shout'), 'уже кричали в этот ход', () => this.act({ t: 'shout' }), ' gold');
      if (ZG.Mods.flag(g, h, 'foremanAction')) {
        const fl = legal.filter((a) => a.t === 'foreman');
        icon('foreman', 'Прораб', 1, fl.length > 0, g.turn.foreman ? 'уже командовали в этот ход' : h.energy < 1 ? lack(1) : 'рядом нет другого героя', async () => {
          const opts = fl.map((a) => a.hero);
          const i = opts.length === 1 ? opts[0] : await Modal.pickHero(g, opts);
          if (i != null) this.act({ t: 'foreman', hero: i });
        }, ' gold');
      }
      if (ZG.Mods.flag(g, h, 'plugAction')) icon('plug', 'Заглушка', E.plugCost(g, h), has('plug'), !g.spawnPoints.includes(h.pos) ? 'встаньте в зону с люком' : E.plugged(g, h.pos) ? 'люк уже заглушен' : lack(E.plugCost(g, h)), () => this.act({ t: 'plug' }), ' gold');
      const burns = legal.filter((a) => a.t === 'burn');
      const bitten = E.heroesAt(g, h.pos).some((o) => o.hand.some((u) => g.cards[u] === 'infection'));
      if (bitten) icon('cleanse', 'Прижечь укус', 2, burns.length > 0, E.zombiesAt(g, h.pos).length ? 'рядом зомби — не дадут (нужна зона без врагов)' : lack(2), async () => {
        const opts = burns.map((a) => a.hero);
        const i = opts.length === 1 ? opts[0] : await Modal.pickHero(g, opts);
        if (i != null) this.act({ t: 'burn', hero: i });
      }, ' gold');
      if (g.drops.length) icon('pickup', 'Подобрать', 1, has('pickup'), 'в зоне нет брошенного груза', () => this.act({ t: 'pickup' }));
      const sfH = E.safeAt(g, h.pos);
      if (sfH) icon('safe', 'Взлом', E.SAFE_COST, has('safe'), sfH.jammed ? 'сейф заклинило — сирена' : !sfH.deck.length ? 'сейф пуст' : zHere ? 'мешают зомби в зоне' : lack(E.SAFE_COST), () => this.act({ t: 'safe' }), ' gold');
      const sa = legal.filter((a) => a.t === 'scenario');
      sa.forEach((a) => icon('task', a.label, a.cost, true, '', () => this.act(a), ' gold'));
      if (E.isComplete(g)) icon('evac', 'Эвакуация', 0, has('evac'), 'дойдите до зоны выхода', async () => {
        const left = E.leftBehind(g, h);
        if (left.length) {
          const v = await Modal.show(`<h2>Уехать без товарища?</h2><p>${esc(left.map((o) => E.heroName(o)).join(', '))} совсем рядом с выходом (1–2 зоны). Если уехать сейчас, отношения с ${left.length > 1 ? 'ними' : 'ним'} упадут на 1.</p>`, [{ label: 'Уехать', value: 'go' }, { label: 'Подождать', cls: 'primary' }]);
          if (v !== 'go') return;
        }
        this.act({ t: 'evac' });
      }, ' gold');
      if (g.survivor) icon('heal', 'Спасти', 1, has('rescue'), 'дойдите до выжившего (SOS на поле)', () => this.act({ t: 'rescue' }), ' gold');
      if (g.campaign && g.retreats > 0) icon('evac', 'Отступить', null, has('retreat'), '', async () => {
        const v = await Modal.show(`<h2>Отступить в убежище?</h2><p>Задание будет сорвано, но все, кто ещё на ногах, вернутся в убежище (раны останутся). Наград за миссию не будет, каждому из отряда −1 мораль. Миссию предстоит переиграть.</p><p>Отступлений в запасе: <b>${g.retreats}</b> — это одно из них.</p>`, [{ label: 'Отступить', value: 'go' }, { label: 'Держимся', cls: 'primary' }]);
        if (v === 'go') this.act({ t: 'retreat' });
      });
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
      if (this._overFor === g) return; // уже завершается (например, конец хода ИИ и кнопка меню одновременно)
      this._overFor = g;
      ZG.Sound.stopMusic(2500);
      if (!this.camp) store.set('save', null);
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
      $('#btn-replay').style.display = this.camp ? 'none' : '';
      $('#btn-again').textContent = this.camp ? 'В убежище ▶' : 'Новая карта';
      if (this.camp) {
        // итоги сразу вносятся в кампанию (даже если игрок уйдёт в меню)
        const camp = this.camp;
        const rep = CMP.finishMission(camp.c, g);
        camp.c.game = null;
        const got = Object.values(rep.heroes).reduce((s, x) => s + x.talons, 0);
        $('#end-seed').insertAdjacentHTML('beforeend', `<div class="end-camp">Кампания: миссия ${rep.missionNo} из ${camp.c.chainLength}${got ? ` · заработано ${got} 🎫` : ''}${camp.c.status === 'over' ? ' · <b>кампания окончена</b>' : camp.c.status === 'won' ? ' · <b>кампания пройдена!</b>' : rep.retreat ? ` · <b>отступление</b> — миссию переиграете (отступлений в запасе: ${rep.retreatsLeft})` : ''}</div>`);
        CMP.save(camp.c, camp.slot);
        this.camp = null;
        $('#btn-again').onclick = () => Shelter.show();
      }
      App.show('end');
    },
  };

  // события движка, которые показывает интерфейс (баннеры и т. п.)
  const UI_FX = {
    async phase(ev) {
      this.refreshTop();
      if (ev.name === 'zombies') { this.refreshHand(); this.refreshActions(); this.defaultHelp(); await Banner.show('ФАЗА ЗОМБИ', 'мертвецы идут', 'zombies'); }
      else if (ev.name === 'heroes') { this.refresh(); await Banner.show('РАУНД ' + ev.round, E.phaseName(this.g).toUpperCase(), 'round'); }
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
        const v = await Modal.show(`<div class="kicker">Секретная миссия — ${esc(E.heroName(h))}</div><h2>${esc(m.name)}${m.rarity === 'rare' ? ' <small>(редкая)</small>' : ''}</h2><p>${esc(m.text)}</p><p><b>Награда — только если выполните ПЕРВЫМ:</b> ${esc(m.rewardText)}</p><p class="muted">Держите миссию в секрете: союзники могут успеть раньше. <b>Сменить миссию можно только сейчас</b>, один раз — потом она останется с вами до конца.</p>`, [{ label: 'Сменить (только сейчас)', value: 'redraw' }, { label: 'Понятно', cls: 'primary', value: 'ok' }]);
        // окно показывается посреди проигрывания событий (интерфейс занят) — меняем миссию прямо в движке
        if (v === 'redraw') { if (E.redrawMission(this.g, h)) { this.save(); return this.showMission(h); } toast('Подходящих миссий для смены нет.'); }
      }
      if (this.g.turn && this.g.turn.bond && !h.ai) toast('🤝 Узы: первая карта этого хода сработает со Связкой (если у неё есть такой эффект).', 3400);
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
      if (this.g.phase === 'zombies' && ev.why === 'Прорыв орды') await Banner.show('ПРОРЫВ!', ev.n ? `из тумана выходят ${ev.n} зомби` : 'стопка оказалась пустой — они ушли', 'wave');
      else await sleep(700);
    },
    async bump(ev) { this.view.play([ev]); toast('За поворотом — стена. Пройти здесь нельзя (⚡ потрачена).', 3000); await sleep(300); },
    async alarm(ev) {
      const a = $('#alarm-track'); a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump'); this.refreshTop();
      if (ev && ev.n > 0) { ZG.Sound.sfx('alarm'); this.view.play([{ t: 'alarm' }]); }
    },
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
      toast(`☣ ${E.heroName(this.g.heroes[ev.hero])}: укус! Заражение ×${ev.n} в руке — вылечите до конца своего хода, иначе обращение (аптечка, Марина или «Прижечь укус» — 2 ⚡, только в зоне без зомби).`, 5000);
      await sleep(250);
    },
    async mission(ev) {
      const h = this.g.heroes[ev.hero], m = ZG.Missions.get(ev.id);
      this.refreshHeroes();
      if (!ev.rewarded) { toast(`${E.heroName(h)} выполнил миссию «${m.name}», но не первым — без награды.`, 4000); return; }
      await Banner.show(m.traitor ? 'ПРЕДАТЕЛЬ!' : 'СЕКРЕТНАЯ МИССИЯ', `${E.heroName(h)}: «${m.name}» — ${m.rewardText}`, m.traitor ? 'wave' : 'night');
      toast(`${E.heroName(h)} — «${m.name}»: ${m.text} Награда: ${m.rewardText}`, 6000);
    },
    // сюжетная вставка кампании: иллюстрация (art/story/<id>.jpg) и художественный текст
    async story(ev) {
      const st = ZG.STORIES && ZG.STORIES[ev.id];
      if (!st) return;
      if (ev.pos != null) this.view.play([ev]);
      ZG.Sound.play('reveal');
      this.refresh();
      await Modal.show(`${storyArt(ev.id)}<div class="story-kicker">${esc(st.kicker || '')}</div><h2 class="story-title">${esc(st.title)}</h2><div class="story-text">${esc(st.text)}</div>`, [{ label: 'Дальше', cls: 'primary' }], null, 'story');
    },
    // поворот сюжета: старая задача провалена — записка с причиной и новая задача
    async twist(ev) {
      this.view.play([ev]);
      ZG.Sound.play('reveal');
      this.refresh();
      await Modal.show(`${ev.art ? storyArt(ev.art) : ''}<div class="twist-stamp">${esc(ev.title)}</div>
        <div class="twist-note">${esc(ev.text)}</div>
        <div class="twist-arrow">▼</div>
        <div class="twist-task"><span>Новая задача</span>${esc(ev.task)}</div>`, [{ label: 'В путь', cls: 'primary' }], null, 'twist');
    },
    async packcard(ev) {
      this.view.play([ev]);
      if (ev.pack) { ZG.Sound.play('zombies'); await Banner.show('СТАЯ!', `мертвецы выскакивают из-за фур — их потревожил ${ev.who}`, 'wave'); }
      else { toast('Карта «Стая/Пусто»: пусто.', 2200); await sleep(200); }
    },
    async trophy(ev) {
      this.view.play([ev]);
      const d = ZG.Cards.get(ev.card);
      await Banner.show('ТРОФЕЙ!', `${E.heroName(this.g.heroes[ev.hero])} получает «${d.name}»`, 'level');
    },
    async wakeall(ev) {
      this.view.play([ev]);
      await Banner.show(ev.title || 'ВСЕ ПРОСНУЛИСЬ!', ev.text || (ev.why ? `${ev.why}: мертвецы со всего квартала идут сюда` : 'мертвецы со всего квартала идут сюда'), 'wave');
    },
    async wanderer(ev) {
      this.view.play([ev]);
      await Banner.show('ОН ЗДЕСЬ!', `${ZG.Zombies.get(ev.ztype).name} бродит в этом квартале`, 'wave');
    },
    async infectTick(ev) { this.view.play([ev]); this.refreshHeroes(); await sleep(300); },
    async turn_hero(ev) {
      this.view.play([ev]);
      const h = this.g.heroes[ev.hero];
      this.refreshHeroes();
      const def = ZG.Heroes.get(h.id);
      if (def.pic && def.turnedPic) await TurnReveal.show(def, `${E.heroName(h)} больше не человек`);
      else await Banner.show('ОБРАЩЕНИЕ!', `${E.heroName(h)} больше не человек`, 'wave');
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
        const chain = E.chainsNow(g, def) ? ' (Связка!)' : '';
        return `сыграть «${def.name}»${t}${chain}`;
      }
      case 'move': return 'перейти в подсвеченную зону';
      case 'search': return 'обыскать зону';
      case 'punch': return 'ударить кулаком';
      case 'ttshot': return 'выстрелить из ТТ (2 урона, Шум 1)';
      case 'barricade': return 'поставить баррикаду';
      case 'heal': return 'обработать раны';
      case 'plug': return 'заглушить люк (2 раунда без зомби отсюда)';
      case 'shut': return 'закрыть двери помещения (укрытие: дальние зомби вас не видят)';
      case 'burn': return 'прижечь укус (Заражения в руке → Раны)';
      case 'cleanse': return 'обеззаразить укус (Заражения в руке → Раны)';
      case 'rest': return 'отдышаться';
      case 'shout': return 'крикнуть: бродячие в 2 зонах идут к Гоше';
      case 'foreman': return `прораб: ${E.heroName(g.heroes[a.hero])} получит +1 ⚡ в свой ход`;
      case 'give': return `передать «${E.cardDef(g, a.card).name}» → ${E.heroName(g.heroes[a.hero])}`;
      case 'scenario': return a.label;
      case 'evac': return 'эвакуироваться!';
      case 'rescue': return 'спасти выжившего';
      case 'pickup': return 'подобрать груз';
      case 'safe': return 'взломать сейф';
      default: return a.t;
    }
  }

  // Поведение врагов в зоне: текущий статус и что принесёт кубик бродяг (раз за фазу зомби)
  // кубик бродяги: без люков на 1–2 зомби стоит
  const wanderDie = (g) => (g.spawnPoints.length ? '<b>1–2</b> — к ближайшему люку; <b>3–4</b> — к центру поля; <b>5–6</b> — стоит.' : '<b>3–4</b> — к центру поля; <b>1–2</b> и <b>5–6</b> — стоит (люков нет).');
  function behaviorInfo(g, zs, zuid) {
    const die = g.phase === 'zombies' && g.zs && g.zs.wander ? ` <span class="tt-die">кубик этой фазы: ${g.zs.wander}</span>` : '';
    const rows = {};
    zs.forEach((z) => {
      const d = ZG.Zombies.get(z.type);
      if (d.immobile) return;
      const bandit = E.isBandit(z);
      let st, txt;
      const sp = E.zombieSpeed(g, z);
      if (!g.stealth) { st = 'идёт на врага'; txt = `Каждую фазу — до ${sp} ${ZG.util.plural(sp, 'шага', 'шагов', 'шагов')} к ближайшему ${bandit ? 'врагу (герой или зомби)' : 'герою, бандиту или приманке'}. Кубик не бросается.`; }
      else if (bandit && z.post) { const r = d.range != null ? d.range : 2; st = z.awake ? 'на посту' : 'дремлет'; txt = `${d.name} на посту: с места не уходит. Пока он в зоне выхода, уйти нельзя. ` + (z.awake ? `Стреляет во врага в своей зоне${r ? ` или на линии до ${r} ${ZG.util.plural(r, 'зоны', 'зон', 'зон')}` : ''}.` : 'Проснётся, если увидит героя или услышит шум; бродящего можно убрать «Удавкой» или «Ножом в спину».'); }
      else if (d.static) { st = 'на посту'; txt = `Не ходит, всегда начеку. Стреляет в ближайшего видимого героя на линии до ${d.range} зон: ${d.dmg} Раны, блок не спасает (только укрытие). Бесшумного замечает только вплотную. Кубик не бросается.`; }
      else if (d.patrol) {
        const t = E.banditTarget(g, z);
        if (z.awake) { st = 'охотится'; txt = `Как зомби-охотник: до ${sp} ${ZG.util.plural(sp, 'шага', 'шагов', 'шагов')} к ближайшему видимому врагу (герой или зомби), иначе — по следу. ${t ? 'Враг на линии — стоит и стреляет.' : `Бьёт в своей или соседней зоне`}: герою — Рана, зомби — ${d.foeDmg} урона.`; }
        else { st = 'бродит'; txt = 'Кубик бродяг, 1 шаг: <b>1–2</b> — к своему лагерю; <b>3–4</b> — к центру поля; <b>5–6</b> — стоит. Заметит или услышит врага — начнёт охотиться, как зомби.'; }
      }
      else if (d.hunter && z.lurk) { st = 'спит'; txt = 'Притаился, как любой другой: проснётся, если заметит героя (по общим правилам «Скрытности»), услышит шум, получит удар — или от звона ключей. Пока спит, любой герой в его зоне может снять с него ключ (1 ⚡).'; }
      else if (d.hunter) { st = 'охотится'; txt = `${z.relentless ? 'Идёт по следу: всегда знает, где вы. ' : ''}До ${sp} шагов за фазу к ближайшему видимому врагу; «Чутьё охотника» — видит и тихих героев. Бьёт только в своей зоне. Кубик не бросается.`; }
      else if (z.lurk && !z.post) { st = 'притаился'; txt = 'Стоит на месте и не бросает кубик. Проснётся, если увидит героя' + (bandit ? ' или зомби' : ' или бандита') + ', услышит шум или его ударят.'; }
      else if (d.crowd) {
        const sw = d.dmg + (z.blood || 0);
        st = z.awake ? 'охотится' : 'бродит';
        txt = `«Кровь» ${z.blood || 0}: «Размах» бьёт на ${sw} каждого в зоне — героев, бандитов и даже своих мертвецов. ` + (z.awake ? `До ${sp} ${ZG.util.plural(sp, 'шага', 'шагов', 'шагов')} за фазу только к живым (герои, бандиты) — в зону, где их больше всего; приманки не отвлекают. Цепь: тянет к себе самого раненого героя из соседней зоны.` : `Кубик бродяг, 1 шаг: ${wanderDie(g)} Увидит живого — начнёт охотиться.`);
      }
      else if (bandit && z.hunt) { st = 'загонщик'; txt = 'Поднят по тревоге: преследует отряд и стреляет во врага на линии до 2 зон. Кубик не бросается.'; }
      else if (bandit) {
        const t = E.banditTarget(g, z);
        if (z.awake && t) { st = 'стреляет'; txt = `Враг ${t.shot ? 'на линии выстрела' : 'в его зоне'}: стоит и ${t.shot ? 'стреляет' : 'бьёт'} — по герою 1 Рана, по зомби 2 урона, Шум на 2 зоны. Кубик не бросается.`; }
        else { st = z.awake ? 'настороже' : 'бродит'; txt = `Кубик бродяг, 1 шаг: <b>1–4</b> — к ближайшему луту (ящик или жетон Обыска; оказавшись у лута, сразу забирает его в мешок); <b>5–6</b> — стоит. Увидит врага на линии до 2 зон — начнёт стрелять. За врагами не гоняется.`; }
      } else if (z.awake) {
        st = 'охотится';
        txt = `Кубик не бросается: до ${sp} ${ZG.util.plural(sp, 'шага', 'шагов', 'шагов')} за фазу к ближайшему видимому врагу (герой, бандит, приманка), иначе — к последнему следу. Дойдя до следа и никого не увидев, снова бродит.`;
      } else {
        st = 'бродит';
        txt = `Кубик бродяг, 1 шаг: ${wanderDie(g)} Увидит героя или бандита — начнёт охотиться.`;
      }
      if (E.frenzied(g, z)) txt += ' <b>Буйство:</b> пока на тайле Креста — в фазу зомби действует дважды.';
      const key = st + '|' + txt; // одинаковое поведение разных врагов — одной строкой
      (rows[key] = rows[key] || { name: d.name, st, txt, n: 0, hl: false }).n++;
      if (z.uid === zuid) rows[key].hl = true;
    });
    const list = Object.values(rows);
    if (!list.length) return '';
    return `<div class="tt-behav"><div class="tt-behav-head">Поведение${die}</div>` + list.map((r) =>
      `<div class="${r.hl ? 'hl' : ''}"><span class="tt-st tt-st-${['бродит', 'притаился', 'настороже', 'спит', 'дремлет'].includes(r.st) ? 'calm' : 'hot'}">${r.st}</span><br><small>${r.txt}</small></div>`).join('') + '</div>';
  }
  // ------------------------------------------------------------ галерея сюжетных вставок
  const GALLERY = [
    ['Миссия 1 · Первая вылазка', ['m1_start', 'm1_first_kill', 'm1_night']],
    ['Миссия 2 · Автобаза №3', ['m2_start', 'm2_pack', 'm2_rouse', 'm2_keys']],
    ['Миссия 3 · Лес', ['m3_start', 'm3_battery', 'm3_bear', 'm3_twist', 'm3_bear_dead']],
    ['Миссия 4 · Трасса', ['m4_start', 'm4_bandit', 'm4_bitten', 'm4_fuel', 'm4_night']],
    ['Миссия 5 · Мост', ['m5_start', 'm5_sniper', 'm5_forester', 'm5_key', 'm5_saw', 'm5_forester_dead']],
    ['Миссия 6 · Погост', ['m6_start', 'm6_frenzy', 'm6_brutes', 'm6_radio']],
    ['Миссия 7 · Белый лебедь', ['m7_start', 'm7_scream', 'm7_prisoner', 'm7_rescue', 'm7_executed', 'm7_bride_dead']],
    ['Миссия 8 · Полдень и финал', ['m8_start', 'm8_butcher', 'm8_blood', 'm8_wolves', 'm8_butcher_dead', 'epilogue']],
    ['Убежище', ['retreat']],
  ];
  const Gallery = {
    show() {
      const box = $('#gallery-list');
      if (!box.children.length) {
        GALLERY.forEach(([title, ids]) => {
          const sec = el('section', 'gal-mission'); sec.appendChild(el('h3', '', title));
          const grid = el('div', 'gal-grid');
          ids.forEach((id, i) => {
            const st = ZG.STORIES[id] || {};
            const card = el('button', 'gal-card');
            // «Сигнал не прошёл» — текст в задании (окно поворота), здесь показываем его
            const text = id === 'm3_twist' ? ZG.Scenarios.get('forest').failText : st.text;
            card.innerHTML = `<canvas class="story-scene" data-scene="${id}" data-offset="${i * 1.7}" width="640" height="360"></canvas><span class="gal-cap"><small>${esc(st.kicker || '')}</small><b>${esc(st.title || id)}</b></span>`;
            card.onclick = () => this.open(id, st, text);
            grid.appendChild(card);
          });
          sec.appendChild(grid); box.appendChild(sec);
        });
        $('#btn-gallery-back').onclick = () => { this.close(); App.show('menu'); };
        $('#gallery-close').onclick = () => this.close();
        $('#gallery-view').onclick = (e) => { if (e.target.id === 'gallery-view') this.close(); };
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#gallery-view').classList.contains('on')) this.close(); });
      }
      App.show('gallery').then(() => ZG.StoryScenes.animate());
      setTimeout(() => ZG.StoryScenes.animate(), 60);
    },
    open(id, st, text) {
      const big = $('#gallery-big'); big.dataset.scene = id;
      $('#gallery-text').innerHTML = `<div class="story-kicker">${esc(st.kicker || '')}</div><h2 class="story-title">${esc(st.title || '')}</h2><div class="story-text">${esc(text || '')}</div>`;
      $('#gallery-view').classList.add('on');
      $$('#gallery-list canvas').forEach((c) => { c.dataset.paused = '1'; }); // пока смотрим одну — остальные стоят
      ZG.StoryScenes.animate();
      $('#gallery-close').focus();
    },
    close() {
      $('#gallery-view').classList.remove('on');
      $$('#gallery-list canvas').forEach((c) => { delete c.dataset.paused; });
      ZG.StoryScenes.animate();
    },
  };
  // место под иллюстрацию вставки: картинка, пока её нет — тёмная заставка с дымкой
  function storyArt(id) {
    // анимированная сцена (код) + картинка поверх, если она есть в art/story/
    setTimeout(() => ZG.StoryScenes && ZG.StoryScenes.animate(), 0);
    return `<div class="story-art"><canvas class="story-scene" data-scene="${id}" width="960" height="540"></canvas><img src="art/story/${id}.jpg" alt="" onerror="this.remove()"></div>`;
  }
  function zoneInfo(g, cell, zuid) {
    const c = g.board.cells[cell];
    if (E.hidden(g, cell)) {
      // закрытый тайл: известно только то, что лежит на рубашке
      const ti = c.tile, b = g.board;
      const n = E.fogTokens(g, ti);
      const known = [];
      if (g.spawnPoints.some((p) => b.cells[p].tile === ti)) known.push('люк');
      const cr = g.crates.filter((x) => !x.opened && b.cells[x.pos].tile === ti).length;
      if (cr) known.push(cr + ' ' + ZG.util.plural(cr, 'ящик', 'ящика', 'ящиков'));
      const fb = ZG.Levels.get(g.levelId).fogBreak, lim = fb == null ? 4 : fb;
      const tdef = ZG.Tiles.get(b.tiles[ti].id);
      if (tdef.unique) known.unshift(tdef.name);
      if (g.stackTiles && g.stackTiles.includes(ti)) known.push('карта «Стая/Пусто» — здесь может притаиться стая');
      return `<div class="tt-head">Не разведано</div><div>Где стены и что внутри — неизвестно. Войдите базовым «Движением» из соседней зоны.</div>` +
        (known.length ? `<div class="tt-gold">На рубашке: ${known.join(', ')}</div>` : '') +
        (n && !g.hideFogCounts ? `<div class="tt-red">Стопка: ${n} ${ZG.util.plural(n, 'жетон', 'жетона', 'жетонов')} лицом вниз — примерно половина может оказаться пустышками. При ${lim}+ — прорыв: тайл откроется сам.</div>` : '');
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
        const st = ''; // статус — в блоке «Поведение» ниже (один источник правды)
        const bag = list.reduce((a, z) => a.concat(z.bag || []), []);
        const bagTxt = bag.length ? `<br><span class="tt-gold">В мешке: ${bag.some((id) => ZG.Cards.get(id).kind === 'cargo') ? bag.filter((id) => ZG.Cards.get(id).kind === 'cargo').map((id) => '«' + ZG.Cards.get(id).name + '»').join(', ') + (bag.some((id) => ZG.Cards.get(id).kind !== 'cargo') ? ' и добыча' : '') : bag.length + ' ' + ZG.util.plural(bag.length, 'находка', 'находки', 'находок')} — выпадет, если его убить</span>` : '';
        return `<div class="${list.some((z) => z.uid === zuid) ? 'hl' : ''}"><b>${d.name}</b> ×${list.length}${st} <span>♥${d.hp}${list.some((z) => z.dmg) ? ' (ранен)' : ''} ✊${d.dmg} 👣${E.zombieSpeed(g, list[0])}</span>${bagTxt}<br><small>${esc(d.text)}</small></div>`;
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
    if (cell === g.exit) parts.push(!E.isComplete(g) ? `<div class="tt-gold">Эвакуация: ${esc(E.scenario(g).exitLabel)} — закрыта, пока не выполнена цель</div>`
      : g.heroes.some((h) => h.onBoard && E.canEvac(g, h)) ? `<div class="tt-gold">Эвакуация: ${esc(E.scenario(g).exitLabel)} — ОТКРЫТА</div>`
        : `<div class="tt-red">Эвакуация: ${esc(E.scenario(g).exitLabel)} — закрыта: ${esc(lcFirst(E.scenario(g).evacBlockedText || 'сейчас уйти нельзя'))}</div>`);
    if (g.frenzyTiles && g.frenzyTiles.includes(g.board.cells[cell].tile)) parts.push('<div class="tt-red">Сияющий крест — «Буйство»: мертвецы на этом тайле в фазу зомби действуют дважды</div>');
    if (g.obj && g.obj.camp === cell && g.scenarioId === 'wedding' && !g.obj.known) parts.push('<div class="tt-gold">У костра что-то лежит — подойдите ближе (на 2 зоны), чтобы разглядеть</div>');
    if (cell === g.tower) parts.push('<div class="tt-gold">Радиовышка</div>');
    if (cell === g.fire) parts.push('<div class="tt-gold">Горящий бензовоз — его зарево освещает всю трассу</div>');
    if (g.spawnPoints.includes(cell)) parts.push(E.plugged(g, cell) ? `<div class="tt-gold">Люк заглушен: молчит ещё ${g.plugs[cell] - g.round + 1} р.</div>` : '<div class="tt-red">Точка появления зомби</div>');
    const sf = E.safeAt(g, cell);
    if (sf) {
      const left = { v: sf.deck.filter((x) => x === 'valuable').length, e: sf.deck.filter((x) => x === 'empty').length, s: sf.deck.filter((x) => x === 'siren').length };
      const ah = g.active != null ? g.heroes[g.active] : null, noise = E.SAFE_NOISE + (ah && E.jingles(g, ah) ? 1 : 0);
      parts.push(sf.jammed ? `<div class="tt-red">${esc(sf.label)}: заклинило — сирена</div>` : !sf.deck.length ? `<div>${esc(sf.label)}: пуст</div>`
        : `<div class="tt-gold">${esc(sf.label)}: в стопке ${sf.deck.length} — Ценностей ${left.v}, «Пусто» ${left.e}, «Сирена» ${left.s} (шанс сирены 1 из ${sf.deck.length}). Вынуто Ценностей: ${sf.taken}. Взлом — ${E.SAFE_COST} ⚡ и Шум ${noise}${noise > E.SAFE_NOISE ? ' (звенит Ценность)' : ''}; Сирена — ещё Шум 3, сейф заклинит</div>`);
    }
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
    if (zs.length) parts.push(behaviorInfo(g, zs, zuid)); // поведение врагов — отдельным блоком в самом низу
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

  // ===================================== обращение: живой портрет перетекает в мёртвый
  const TurnReveal = {
    async show(def, sub) {
      ZG.Sound.play('zombies');
      const sp = Game.view ? Game.view.speed : 1;
      const o = el('div', 'turn-reveal');
      o.innerHTML = `<div class="tr-card"><img class="tr-live" src="${def.pic}"><img class="tr-dead" src="${def.turnedPic}"><div class="tr-flash"></div></div><div class="tr-title">ОБРАЩЕНИЕ!</div><div class="tr-sub">${esc(sub)}</div>`;
      o.style.setProperty('--sp', String(1 / sp));
      document.body.appendChild(o);
      void o.offsetWidth; o.classList.add('go');
      await sleep(2600 / sp);
      o.classList.add('out');
      await sleep(450 / sp);
      o.remove();
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
    waiters: [],
    escape() {
      if (this.onEscape) this.onEscape();
    },
    show(html, buttons, extraEl, cls) {
      // очередь окон: если открыто другое окно (брифинг), новое ждёт его закрытия, а не затирает
      if (this.open) return new Promise((r) => this.waiters.push(r)).then(() => this.show(html, buttons, extraEl, cls));
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
    close() {
      $('#modal').classList.remove('show'); this.open = false;
      const w = this.waiters.splice(0);
      if (w.length) setTimeout(() => w.forEach((f) => f()), 60);
    },
    confirm(html, onYes) { this.show(`<p class="confirm">${html}</p>`, [{ label: 'Отмена', value: false }, { label: 'Да', value: true, cls: 'primary' }]).then((v) => v && onYes()); },

    async briefing(g) {
      const sc = E.scenario(g);
      const wrap = el('div', 'brief-cards');
      wrap.appendChild(CV.scenarioCard(sc.id, { noSetup: true }));
      wrap.appendChild(CV.conditionCard(g.conditionId));
      const steps = sc.goals(g).map((x) => `<li>${esc(x.text)}${x.note ? ` <small class="muted">(${esc(x.note)})</small>` : ''}</li>`).join('');
      await this.show(`<div class="kicker">Брифинг</div><h2>${esc(sc.name)}</h2><ol class="brief-steps">${steps}</ol>
        ${g.special && g.special.length ? `<div class="special-box"><b>⚠ Особые условия миссии</b><ul>${g.special.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
        ${g.bonusId ? `<p>★ Бонусная цель (3-я звезда): <b>${esc(ZG.Bonuses.get(g.bonusId).name)}</b> — ${esc(ZG.Bonuses.get(g.bonusId).text)}</p>` : ''}
        <p class="muted">На поле: <b>лупы</b> — жетоны обыска, <b>ящики</b> — возможные грузы, <b>люки</b> — точки появления${g.safes && g.safes.length ? ', <b>стальной ящик с диском</b> — сейф' : ''}. Наводите курсор на зоны, чтобы узнать подробности.</p>`, [{ label: 'В бой', cls: 'primary', modal: true }], wrap, 'wide');
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
        const ex = (h.exhaust || []).length + picked.size;
        info.innerHTML = `Отражено картами: <b>${sum}</b> / ${p.remaining} → получите <b class="${taken ? 'bad' : 'good'}">${taken} урона</b>` + (taken ? ` <small>(за каждый кубик: 1–2 ☣ Заражение, 3–6 Рана)</small>` : '') + (left <= 0 ? ' <b class="bad">— ГЕРОЙ ПАДЁТ!</b>' : '')
          + `<br>Изнеможение: <b class="${ex >= E.EXHAUST_AT ? 'bad' : ''}">${ex} / ${E.EXHAUST_AT}</b>` + (ex >= E.EXHAUST_AT ? ' — <b class="bad">ОБЕССИЛЕН</b>: рука −1, базовые действия недоступны до «Отдышаться»' : '');
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
        <p>Атакуют: ${esc(attackers.join(', '))}. ${p.auto ? `Блок и снаряжение уже отразили <b>${p.auto}</b>.` : ''}<br>Сбросьте карты со щитом, чтобы отразить урон: они уйдут в <b>Изнеможение</b>, а не в сброс. Каждый неотражённый урон — карта Раны в ваш сброс.</p>`,
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

  // ======================================================= кампания: слоты
  const Slots = {
    show() { this.render(); App.show('slots'); },
    render() {
      const box = $('#slot-list');
      box.innerHTML = '';
      CMP.list().forEach(({ slot, c }) => {
        const d = el('div', 'camp-slot' + (c ? ' ' + c.status : ' empty'));
        d.appendChild(el('div', 'slot-n', 'Слот ' + slot));
        const body = el('div', 'slot-body');
        if (!c) body.innerHTML = '<span class="muted">пусто</span>';
        else {
          const st = { ready: 'в убежище', mission: 'идёт миссия', over: 'окончена', won: 'пройдена!' }[c.status];
          body.innerHTML = `<b>Миссия ${Math.min(c.chainLength, c.missionNo + 1)} из ${c.chainLength}</b> · ${st} · ${esc(ZG.Difficulties.get(c.difficultyId).name)}
            <div class="slot-heroes">${c.roster.map((h) => `<span>${esc(ZG.Heroes.get(h.id).name)} <small>ур.${h.level}</small></span>`).join('')}${c.fallen.map((id) => `<span class="dead">✝ ${esc(ZG.Heroes.get(id).name)}</span>`).join('')}</div>
            <small class="muted">${new Date(c.updated).toLocaleString('ru-RU')}</small>`;
        }
        d.appendChild(body);
        const btns = el('div', 'slot-btns');
        const add = (label, cls, fn) => { const b = el('button', 'btn ' + cls, label); b.onclick = fn; btns.appendChild(b); };
        if (!c) add('Новая кампания', 'primary', () => App.newCampaign(slot));
        else {
          add(c.status === 'over' || c.status === 'won' ? 'Итоги' : 'Продолжить', 'primary', () => Slots.open(slot));
          add('Удалить', 'ghost', async () => {
            const v = await Modal.show('<h2>Удалить кампанию?</h2><p>Прогресс в этом слоте пропадёт безвозвратно.</p>', [{ label: 'Удалить', value: 'del' }, { label: 'Отмена', cls: 'primary' }]);
            if (v === 'del') { CMP.remove(slot); this.render(); }
          });
        }
        d.appendChild(btns);
        box.appendChild(d);
      });
    },
    open(slot) {
      const c = CMP.load(slot);
      if (!c) return toast('Слот пуст.');
      App.campaign = { c, slot };
      if (c.status === 'mission' && c.game) { const g = c.game; c.game = null; Game.resume({ g, players: c.players }, App.campaign); }
      else if (c.status === 'mission' && c.current) { const sq = c.current.squad; c.status = 'ready'; Game.startCampaignMission(sq); } // миссия без сохранения — заново тем же отрядом (та же карта)
      else Shelter.show();
    },
  };

  // ======================================================= кампания: убежище
  const LIST_NAME = { equip: 'Экипировка', chest: 'Сундук', junk: 'Хлам' };
  const Shelter = {
    squad: [],
    show() {
      const c = App.campaign.c;
      const prev = (c.lastSquad || []).filter((id) => CMP.hero(c, id));
      this.squad = prev.concat(c.roster.map((h) => h.id).filter((id) => !prev.includes(id))).slice(0, c.squad);
      $('#btn-shelter-menu').onclick = () => App.show('menu');
      if (ZG.Sound._musicKey !== 'shelter') ZG.Sound.music('shelter'); // атмосфера убежища
      this.render();
      App.show('shelter');
    },
    save() { CMP.save(App.campaign.c, App.campaign.slot); },
    act(fn) { const err = fn(); if (err) toast(err); else this.save(); this.render(); },
    async go() {
      const c = App.campaign.c;
      if (!this.squad.length) return toast('Выберите хотя бы одного героя в отряд.');
      if (this.squad.length < c.squad) {
        const v = await Modal.show(`<h2>Неполный отряд</h2><p>В поход идут ${this.squad.length} из ${c.squad}. Миссия всё равно рассчитана на <b>${c.squad}</b> ${ZG.util.plural(c.squad, 'героя', 'героев', 'героев')}: врагов и задач будет как на полный отряд.</p>`, [{ label: 'Идти так', value: 'go' }, { label: 'Отмена', cls: 'primary' }]);
        if (v !== 'go') return;
      }
      if (c.players === 2) {
        const sq = this.squad.map((id) => CMP.hero(c, id));
        if (!sq.some((h) => h.player === 1 && !h.ai) || !sq.some((h) => h.player === 2 && !h.ai)) return toast('У каждого игрока в отряде должен быть герой не под ИИ.');
      }
      const empty = this.squad.map((id) => CMP.hero(c, id)).filter((h) => !h.equip.length && h.chest.length);
      if (empty.length) {
        const v = await Modal.show(`<h2>Экипировка пуста</h2><p>${empty.map((h) => esc(ZG.Heroes.get(h.id).name)).join(', ')}: в сундуке есть карты, но в поход ничего не взято. Взять лучшие карты из сундука?</p><p class="muted">Экипированные карты изнашиваются: после похода они станут «на грани поломки».</p>`,
          [{ label: 'Взять лучшие', value: 'fill', cls: 'primary' }, { label: 'Идти так', value: 'go' }, { label: 'Отмена' }]);
        if (!v) return;
        if (v === 'fill') {
          empty.forEach((h) => {
            while (h.equip.length < CMP.equipCap(h) && h.chest.length) {
              let best = 0;
              h.chest.forEach((it, i) => { if (!it.worn && (h.chest[best].worn || (ZG.Cards.get(it.id).value || 0) > (ZG.Cards.get(h.chest[best].id).value || 0))) best = i; });
              CMP.move(c, h.id, 'chest', best, 'equip');
            }
          });
          this.save();
        }
      }
      Game.startCampaignMission(this.squad.slice());
    },
    // фаза событий убежища: после миссии тянется карта; решение — за героем (ИИ решает сам, игрок — в этом окне)
    // вставка «Уходим» — один раз за кампанию, при первом отступлении
    async showRetreat(c) {
      const st = ZG.STORIES && ZG.STORIES.retreat;
      if (this._eventOpen || c.retreatSeen) return;
      c.retreatSeen = true; this.save();
      if (!st) return this.render();
      this._eventOpen = true;
      await Modal.show(`${storyArt('retreat')}<div class="story-kicker">${esc(st.kicker)}</div><h2 class="story-title">${esc(st.title)}</h2><div class="story-text">${esc(st.text)}</div>`, [{ label: 'Дальше', cls: 'primary' }], null, 'story');
      this._eventOpen = false;
      this.render(); // дальше — карта событий убежища и торговец
    },
    async showEvent(c) {
      const e = c.eventDraw; if (!e || e.seen || this._eventOpen) return;
      this._eventOpen = true;
      const def = CMP.eventDef(e.id);
      const nm = (id) => esc(ZG.Heroes.get(id).name);
      const head = `<div class="kicker">Событие убежища · карта из колоды</div>`;
      const card = (title, body, cls) => `<div class="ev-card ${cls || ''}"><div class="ev-back"></div><div class="ev-face"><div class="ev-title">${esc(title)}</div><div class="ev-text">${body}</div></div></div>`;
      if (!def) {
        await Modal.show(head + card('Тихая ночь', esc(e.result || ''), 'blank'), [{ label: 'Дальше', cls: 'primary' }], null, 'event');
      } else if (e.skipped) {
        await Modal.show(head + card(def.name, `<p>${esc(def.text)}</p><p class="muted">${esc(e.result)}</p>`), [{ label: 'Дальше', cls: 'primary' }], null, 'event');
      } else if (!e.done) {
        const opts = CMP.eventOptions(c);
        const v = await Modal.show(head + card(def.name, `<p>${esc(e.story)}</p><p class="muted">${esc(def.text)}</p>`),
          opts.map((o, i) => ({ label: o.label + (o.off ? ' — не хватает 🎫' : ''), value: o.key, cls: i === 0 ? 'primary' : '', modal: true, check: () => (o.off ? (toast('Не хватает талонов.'), false) : true) })), null, 'event');
        const err = CMP.resolveEvent(c, v);
        if (err) toast(err);
        await Modal.show(head + card(def.name, `<p>${esc(e.result || '')}</p>`), [{ label: 'Дальше', cls: 'primary' }], null, 'event');
      } else {
        await Modal.show(head + card(def.name, `<p>${esc(e.story)}</p><p><b>${nm(e.decider)}${e.byAI ? ' (ИИ)' : ''}: «${esc(e.choice)}».</b></p><p>${esc(e.result || '')}</p>`), [{ label: 'Дальше', cls: 'primary' }], null, 'event');
      }
      e.seen = true;
      this._eventOpen = false;
      this.save();
      this.render();
    },
    // эпилог кампании: финальная вставка и итоги пути
    epilogue(c) {
      const st = ZG.STORIES && ZG.STORIES.epilogue;
      if (!st) return;
      // эпилог собирается из глав пройденных миссий (ZG.EPILOGUE в data/campaign.js)
      const ep = ZG.epilogueFor(c);
      const facts = [];
      facts.push(`Выжили: ${c.roster.map((h) => `${esc(ZG.Heroes.get(h.id).name)} (ур. ${h.level})`).join(', ') || 'никто'}`);
      if (c.fallen.length) facts.push(`Не дошли: ${c.fallen.map((id) => '✝ ' + esc(ZG.Heroes.get(id).name)).join(', ')}`);
      ep.facts.forEach((t) => facts.push(esc(t)));
      if (c.wanderers.length) facts.push(`Где-то позади бродят обращённые: ${c.wanderers.map((id) => esc(ZG.Zombies.get('turned_' + id).name)).join(', ')}.`);
      Modal.show(`${storyArt('epilogue')}<div class="story-kicker">${esc(st.kicker)}</div><h2 class="story-title">${esc(st.title)}</h2><div class="story-text">${esc(ep.text)}</div><ul class="epi-facts">${facts.map((t) => `<li>${t}</li>`).join('')}</ul>`, [{ label: 'Конец пути', cls: 'primary' }], null, 'story');
    },
    render() {
      const c = App.campaign.c;
      const done = c.status === 'over' || c.status === 'won';
      $('#shelter-sub').innerHTML = done
        ? `<b class="${c.status}">${c.status === 'won' ? 'КАМПАНИЯ ПРОЙДЕНА' : 'КАМПАНИЯ ОКОНЧЕНА'}</b> — ${esc(c.endReason || '')}`
        : `${c.report && c.report.retreat ? 'Повтор: ' : ''}Впереди миссия ${c.missionNo + 1} из ${c.chainLength}${CMP.missionDef(c).name ? ': <b>' + esc(CMP.missionDef(c).name) + '</b>' : ' (случайная)'} · отряд: ${c.squad} · ${esc(ZG.Difficulties.get(c.difficultyId).name)} · отступлений: ${CMP.retreatsLeft(c)}${c.wanderers.length ? ` · <span class="bad">бродят: ${c.wanderers.map((id) => esc(ZG.Zombies.get('turned_' + id).name)).join(', ')}</span>` : ''}`;
      $('#btn-shelter-go').style.display = '';
      $('#btn-shelter-go').onclick = done ? () => App.newCampaign(App.campaign.slot) : () => this.go();
      $('#btn-shelter-go').textContent = done ? 'Новая кампания в этом слоте' : `В поход: миссия ${c.missionNo + 1} ▶`;
      if (done) $('#shelter-sub').insertAdjacentHTML('beforeend', `<div class="camp-sum">Пройдено миссий: <b>${c.missionNo - (c.status === 'over' ? 1 : 0)} из ${c.chainLength}</b>${c.fallen.length ? ` · выбыли: ${c.fallen.map((id) => '✝ ' + esc(ZG.Heroes.get(id).name)).join(', ')}` : ''}${c.roster.length ? ` · выжили: ${c.roster.map((h) => `${esc(ZG.Heroes.get(h.id).name)} (ур. ${h.level})`).join(', ')}` : ''}${c.roster.length ? `<br>Капитал выживших: <b>${c.roster.reduce((n, h) => n + h.talons, 0)} 🎫</b> (${c.roster.map((h) => `${esc(ZG.Heroes.get(h.id).name)} ${h.talons}`).join(', ')})` : ''}${c.haul ? ` · Ценности из сейфов принесли за кампанию: <b>${c.haul} 🎫</b>` : ''}</div>`);
      this.renderReport(c);
      if (c.status === 'won' && c.epilogueSeen) { const eb = el('button', 'rep-toggle', '📜 Эпилог'); eb.onclick = () => this.epilogue(c); $('#shelter-sub').appendChild(eb); }
      if (c.status === 'won' && !c.epilogueSeen) { c.epilogueSeen = true; this.save(); setTimeout(() => this.epilogue(c), 300); }
      if (c.report && c.report.retreat && !c.retreatSeen && !done && !this._eventOpen) setTimeout(() => this.showRetreat(c), 300); // первое отступление за кампанию — вставка «Уходим»
      else if (c.eventDraw && !c.eventDraw.seen && !done && !this._eventOpen) setTimeout(() => this.showEvent(c), 400);
      else if (!done && CMP.trader(c) && c.traderSeen !== c.missionNo && !this._eventOpen) setTimeout(() => this.showTrader(c), 450); // торговец — после карты событий
      const md = CMP.missionDef(c);
      if (!done && md.brief) $('#shelter-report').insertAdjacentHTML('beforeend', `<div class="rep-brief">${esc(md.brief)}</div>`);
      if (!done && md.special && md.special.length) $('#shelter-report').insertAdjacentHTML('beforeend', `<div class="special-box"><b>⚠ Особые условия миссии</b><ul>${md.special.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`);
      // отчёт и брифинг свёрнуты в одну строку (раскрываются по клику) — герои и карты видны сразу
      const rp = $('#shelter-report');
      rp.classList.toggle('collapsed', !this.reportOpen && rp.children.length > 1);
      if (rp.children.length > 1) {
        const tg = el('button', 'rep-toggle', this.reportOpen ? 'Свернуть ▴' : 'Отчёт и брифинг ▾');
        tg.onclick = () => { this.reportOpen = !this.reportOpen; this.render(); };
        rp.firstElementChild.appendChild(tg);
      }
      const box = $('#shelter-heroes');
      box.innerHTML = '';
      if (!c.roster.length) { this.renderHire(c, done); return; }
      if (!CMP.hero(c, this.sel)) this.sel = c.roster[0].id;
      // вкладки героев: переключение и цель для передачи карты (перетащите карту на вкладку)
      const tabs = el('div', 'sh-tabs');
      c.roster.forEach((h) => {
        const def = ZG.Heroes.get(h.id);
        const t = el('button', 'sh-tab' + (h.id === this.sel ? ' on' : '') + (this.squad.includes(h.id) ? ' in-squad' : ''));
        t.dataset.hero = h.id;
        t.style.setProperty('--hero', def.color);
        t.innerHTML = `<img src="${def.face || CV.artURL(def.art, 96, 96, {})}"><span><b>${esc(def.name)}</b><small>ур. ${h.level} · ♥ ${CMP.hp(h)}/${CMP.baseHp(h) + CMP.hpTalents(h)} · 🎫 ${h.talons}</small></span>${this.squad.includes(h.id) ? '<i class="sq">✓</i>' : ''}${h.ai ? '<i class="ai">🤖</i>' : ''}`;
        t.onclick = () => { this.sel = h.id; this.render(); };
        tabs.appendChild(t);
      });
      box.appendChild(tabs);
      box.appendChild(this.heroPanel(c, CMP.hero(c, this.sel), done));
      this.renderHire(c, done);
      this.bindDrag(c, CMP.hero(c, this.sel));
    },
    renderReport(c) {
      const r = c.report, box = $('#shelter-report');
      if (!r) { box.innerHTML = '<div class="rep-head">Отряд собран. Перед первым походом можно распределить экипировку и выбрать, кто управляет героями.</div>'; return; }
      const name = (id) => esc(ZG.Heroes.get(id).name);
      if (r.joined) ZG.unlockHero(r.joined); // спасённый герой открывается и для одиночной игры
      box.innerHTML = `<div class="rep-head ${r.win ? 'win' : 'lose'}"><b>Миссия ${r.missionNo}: ${r.win ? 'выполнена' : r.retreat ? 'отступление' : 'провалена'}</b> <span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</span> — ${esc(r.reason || '')}</div>
        ${r.lost.map((l) => `<div class="rep-lost">✝ ${name(l.id)} — ${l.turned ? 'обратился и теперь бродит по району' : 'пал и выбывает навсегда'}</div>`).join('')}
        ${r.joined ? `<div class="rep-bond">🔓 ${name(r.joined)} «${esc(ZG.Heroes.get(r.joined).nick)}» спасён и присоединяется к отряду — новый герой в убежище.</div>` : ''}
        ${(r.rel || []).filter((x) => CMP.hero(c, x.a) && CMP.hero(c, x.b)).map((x) => `<div class="rep-bond${x.to < x.from ? ' down' : ''}">${x.to >= 3 && x.from < 3 ? '🤝' : x.to <= -3 && x.from > -3 ? '⚔' : x.to > x.from ? '▲' : '▼'} ${name(x.a)} и ${name(x.b)}: ${CMP.relName(x.to)} (${x.from > 0 ? '+' : ''}${x.from} → ${x.to > 0 ? '+' : ''}${x.to}) <small>${esc(x.why.join(', '))}</small>${x.to >= 3 && x.from < 3 ? ' — теперь их связывают <b>Узы</b>' : ''}</div>`).join('')}
        ${r.retreat ? `<div class="rep-lost">↩ Отряд отступил в убежище — миссию ${r.missionNo} придётся переиграть. Отступлений в запасе: ${r.retreatsLeft}.</div>` : ''}
        ${r.hint ? `<div class="rep-hint">${esc(r.hint)}</div>` : ''}
        ${r.finalSale && r.finalSale.length ? `<div class="rep-bond">Скупщик в последний раз: ${r.finalSale.map((x) => `${name(x.hero)} +${x.price} 🎫`).join(', ')}</div>` : ''}
        <div class="rep-heroes">${Object.entries(r.heroes).filter(([id]) => CMP.hero(c, id)).map(([id, x]) => { const h = CMP.hero(c, id); return `<div><b>${name(id)}</b>: ${x.lines.map(esc).join(' · ') || '—'} <span class="rep-sum">→ ♥ ${CMP.hp(h)}/${CMP.baseHp(h)} · 🎫 ${h.talons} · мораль ${h.morale}</span></div>`; }).join('')}</div>`;
    },
    // отношения героя с остальными героями убежища
    relLine(c, h) {
      const tips = { 'Друзья': 'Узы: если друг заканчивает ход в тайле героя, первая карта его следующего хода срабатывает со Связкой. Гибель друга — −2 морали.', 'Приятели': 'Передают друг другу карты без ограничения «раз за ход».', 'Неприязнь': 'Не передают друг другу карты.', 'Враги': 'Не передают карты; закончил ход в тайле врага — у того −1 ⚡. В одном отряде — −1 морали каждому после миссии. Гибель врага — +2 морали.' };
      const items = c.roster.filter((o) => o !== h).map((o) => { const n = CMP.rel(c, h.id, o.id); return { o, n, name: CMP.relName(n) }; }).filter((x) => x.n !== 0)
        .map((x) => `<span class="rel r${x.n > 0 ? 'p' : 'n'}${Math.abs(x.n)}" title="${esc(tips[x.name] || '')}">${x.n >= 3 ? '🤝' : x.n <= -3 ? '⚔' : x.n > 0 ? '▲' : '▼'} ${esc(ZG.Heroes.get(x.o.id).name)}: ${x.name} (${x.n > 0 ? '+' : ''}${x.n})</span>`);
      return items.length ? `<div class="sh-bond">${items.join(' ')}</div>` : '';
    },
    heroPanel(c, h, done) {
      const def = ZG.Heroes.get(h.id), CFG = ZG.CAMPAIGN;
      const next = CFG.xpLevels.find((v) => h.xp < v);
      const m = h.morale, M = CFG.morale;
      const pips = Array.from({ length: M.max }, (_, i) => `<i class="${i < m ? 'on' : ''}"></i>`).join('');
      const temp = m <= 0 ? '2× «Уныние»' : m <= M.low ? '«Уныние»' : m >= M.max ? '«Кураж»' : '';
      const wrap = el('div', 'sh-main');
      wrap.style.setProperty('--hero', def.color);
      const top = el('div', 'sh-top2');
      top.innerHTML = `
        <img class="sh-pic" src="${def.pic || CV.artURL(def.art, 200, 200, {})}">
        <div class="sh-info">
          <div class="sh-name"><b>${esc(def.name)}</b> <small>«${esc(def.nick)}» · ${esc(def.role)}</small><span class="sh-talons" title="Личные талоны">🎫 ${h.talons}</span></div>
          <div class="sh-lvl">Уровень ${h.level} · 🎖 ${h.xp}${next ? ' / ' + next : ''}</div>
          <div class="sh-stats"><span title="Стойкость на следующую миссию (травмы снижают)">♥ ${CMP.hp(h)} / ${CMP.baseHp(h) + CMP.hpTalents(h)}</span>
            <span class="sh-morale m${m <= M.low ? 'low' : m >= M.max ? 'max' : ''}" title="Мораль ${m} из ${M.max}">Мораль <span class="pips">${pips}</span>${temp ? ` <small>${temp}</small>` : ''}</span></div>
          ${this.relLine(c, h)}
          ${h.talents.length ? `<div class="sh-tal">${h.talents.map((t) => esc(ZG.Talents.get(t).name)).join(' · ')}</div>` : ''}
          ${h.debt ? `<div class="sh-debt">Долг ${esc(ZG.Heroes.get(h.debt.to).name)}: половина талонов за звёзды ещё ${h.debt.left} ${ZG.util.plural(h.debt.left, 'миссию', 'миссии', 'миссий')}</div>` : ''}
          <div class="sh-actions"></div>
        </div>`;
      wrap.appendChild(top);
      const acts = $('.sh-actions', top);
      if (!done) {
        const add = (label, fn, cls) => { const b = el('button', 'btn small ' + (cls || ''), label); b.onclick = fn; acts.appendChild(b); };
        const inSq = this.squad.includes(h.id);
        add(inSq ? '✓ В отряде' : 'В отряд', () => {
          if (inSq) this.squad = this.squad.filter((x) => x !== h.id);
          else if (this.squad.length >= c.squad) return toast(`В поход идут не больше ${c.squad}. Сначала уберите кого-то из отряда.`);
          else this.squad.push(h.id);
          this.render();
        }, inSq ? 'primary' : '');
        const ctl = h.ai ? '🤖 ИИ' : c.players === 2 ? `🎮 Игрок ${h.player}` : '🎮 Игрок';
        add(ctl, () => this.act(() => {
          const err = c.players === 2
            ? (h.ai ? CMP.setControl(c, h.id, 1, false) : h.player === 1 ? CMP.setControl(c, h.id, 2, false) : CMP.setControl(c, h.id, null, true))
            : CMP.setControl(c, h.id, null, !h.ai);
          if (!err && h.ai) CMP.autoManage(c, h.id); // ИИ сразу раскладывает свои карты
          return err;
        }));
        if (h.injury > 0) add(`Лечить +1 ♥ (${CFG.prices.heal} 🎫)`, () => this.act(() => CMP.heal(c, h.id)));
        if (CMP.canTrain(c, h)) add(`🎯 Тир: +1 🎖 (${CFG.prices.train} 🎫)`, () => this.act(() => CMP.train(c, h.id)));
        if (h.ai) add('🤖 Разложить карты', () => this.act(() => CMP.autoManage(c, h.id)));
      }
      // постройки личного убежища: возведённые — в цвете, остальные — силуэтом с ценой
      const blds = el('div', 'sh-blds');
      ZG.Buildings.all().forEach((b) => {
        const have = CMP.built(h, b.id), poor = h.talons < b.cost;
        const t = el('button', 'sh-bld' + (have ? ' have' : poor ? ' poor' : ''));
        t.title = b.text;
        t.innerHTML = `<img src="${CV.artURL('bld_' + b.id, 120, 120, { off: !have })}"><b>${esc(b.name)}</b><small>${have ? '✓ построено' : `${b.cost} 🎫`}</small>`;
        t.onclick = async () => {
          if (have || done) return Modal.show(`<h2>${esc(b.name)}</h2><p>${esc(b.text)}</p>`, [{ label: 'Закрыть', cls: 'primary' }]);
          if (poor) return toast(`${b.name}: нужно ${b.cost} 🎫, у ${ZG.Heroes.get(h.id).name} — ${h.talons}.`);
          const v = await Modal.show(`<h2>Построить: ${esc(b.name)}</h2><p>${esc(b.text)}</p><p>Цена: <b>${b.cost} 🎫</b> из личного запаса (${h.talons} 🎫).</p>`, [{ label: `Построить (${b.cost} 🎫)`, value: 'y', cls: 'primary' }, { label: 'Отмена' }]);
          if (v) this.act(() => CMP.build(c, h.id, b.id));
        };
        blds.appendChild(t);
      });
      const bwrap = el('div', 'sh-bwrap');
      bwrap.appendChild(el('div', 'sh-row-h', 'Личное убежище'));
      bwrap.appendChild(blds);
      top.appendChild(bwrap);
      // зоны карт: перетаскивайте карты мышкой между зонами; клик — меню карты
      const zones = el('div', 'sh-zones');
      ['equip', 'chest', 'junk'].forEach((list) => {
        const capN = list === 'equip' ? CMP.equipCap(h) : list === 'chest' ? CMP.chestCap(h) : null;
        const z = el('div', 'sh-zone ' + list);
        const sum = list === 'junk' ? h.junk.reduce((s2, it) => s2 + (CMP.price(it.id) || 0), 0) : 0;
        const vals = list === 'junk' ? h.junk.filter((it) => CMP.isValuable$(it.id)).length : 0;
        z.appendChild(el('div', 'sh-row-h', `${LIST_NAME[list]}${capN != null ? ` ${h[list].length}/${capN}` : ''}${list === 'equip' ? ' <small>— замешается в колоду на миссию</small>' : list === 'junk' && h.junk.length ? ` <small>— продастся при выходе ≈ +${sum} 🎫${vals ? ` и ${vals} ${ZG.util.plural(vals, 'ценность', 'ценности', 'ценностей')} (по ${CMP.VAL_MIN}–${CMP.VAL_MAX} 🎫)` : ''}</small>` : ''}`));
        const drop = el('div', 'sh-drop');
        drop.dataset.list = list;
        h[list].forEach((it, i) => {
          const d = ZG.Cards.get(it.id);
          const w = el('div', 'sh-cw' + (it.worn ? ' worn' : ''));
          w.dataset.list = list; w.dataset.i = i;
          w.appendChild(CV.card(d));
          const p = CMP.price(it.id);
          w.appendChild(el('div', 'sh-price', CMP.isValuable$(it.id) ? `🎫 ${CMP.VAL_MIN}–${CMP.VAL_MAX}?` : p == null ? 'не продаётся' : `🎫 ${p}`));
          if (it.worn) w.appendChild(el('div', 'sh-worn', '⚠ на грани поломки'));
          drop.appendChild(w);
        });
        if (capN != null) for (let k = h[list].length; k < capN; k++) drop.appendChild(el('div', 'sh-empty', list === 'equip' ? 'место экипировки' : 'место в сундуке'));
        if (!h[list].length && capN == null) drop.appendChild(el('div', 'sh-empty wide', 'перетащите сюда то, что продать'));
        z.appendChild(drop);
        zones.appendChild(z);
      });
      const tr = !done && CMP.trader(c);
      if (tr) wrap.appendChild(this.traderShelf(c, h, tr));
      wrap.appendChild(zones);
      return wrap;
    },
    // полка странствующего торговца: товар для выбранного героя (сколько угодно экземпляров)
    traderShelf(c, h, tr) {
      const box = el('div', 'sh-zone sh-trader');
      const mine = (c.traderLog || []).filter((x) => x.no === c.missionNo && x.hero === h.id);
      box.appendChild(el('div', 'sh-row-h', `🛒 ${esc(tr.name)} <small>— только сейчас, перед миссией; товар больше нигде не найти. Покупки кладутся в экипировку (если есть место) или в сундук.</small>`));
      const row = el('div', 'sh-drop');
      tr.stock.forEach((w) => {
        const d = ZG.Cards.get(w.id), n = mine.filter((x) => x.id === w.id).length;
        const cw = el('div', 'sh-ware');
        cw.appendChild(CV.card(d));
        const b = el('button', 'btn small ' + (h.talons >= w.price ? 'primary' : 'poor'), `Купить · ${w.price} 🎫`);
        b.onclick = () => (h.talons < w.price ? toast(`Не хватает талонов: у ${ZG.Heroes.get(h.id).name} ${h.talons} 🎫.`) : this.act(() => CMP.buy(c, h.id, w.id)));
        cw.appendChild(b);
        if (n) cw.appendChild(el('div', 'sh-price', `куплено: ${n}`));
        if (h.equip.concat(h.chest).some((it) => it.id === w.id)) cw.appendChild(el('div', 'sh-price', 'уже есть — второй такой не складывается (запасной на случай поломки)'));
        row.appendChild(cw);
      });
      box.appendChild(row);
      return box;
    },
    // приход торговца — отдельное событие (не карта колоды событий убежища), раз перед миссией
    async showTrader(c) {
      const tr = CMP.trader(c);
      if (!tr || c.traderSeen === c.missionNo || this._eventOpen) return;
      this._eventOpen = true;
      const ai = (c.traderLog || []).filter((x) => x.no === c.missionNo && x.ai);
      const wares = tr.stock.map((w) => { const d = ZG.Cards.get(w.id); return `<li><b>${esc(d.name)}</b> — ${w.price} 🎫. ${esc(d.text.replace(/^Снаряжение\. /, ''))}</li>`; }).join('');
      const bought = ai.length ? `<p class="muted">ИИ уже решил: ${ai.map((x) => `${esc(ZG.Heroes.get(x.hero).name)} — «${esc(ZG.Cards.get(x.id).name)}»`).join(', ')}.</p>` : '';
      await Modal.show(`<div class="kicker">Особое событие · перед миссией</div><div class="ev-card"><div class="ev-back"></div><div class="ev-face"><div class="ev-title">${esc(tr.name)}</div><div class="ev-text"><p>${esc(tr.text)}</p><ul>${wares}</ul><p class="muted">Каждый герой покупает за свои талоны сколько угодно экземпляров. Полка торговца — в панели героя, до выхода в поход.</p>${bought}</div></div></div>`, [{ label: 'К прилавку', cls: 'primary' }], null, 'event');
      c.traderSeen = c.missionNo;
      this._eventOpen = false;
      this.save();
      this.render();
    },
    // перетаскивание карт мышью/пальцем: между зонами героя или на вкладку другого героя (передать в его сундук)
    bindDrag(c, h) {
      $$('#shelter-heroes .sh-cw').forEach((w) => {
        w.onpointerdown = (ev) => {
          if (ev.button !== 0 || c.status === 'over' || c.status === 'won') return;
          ev.preventDefault();
          const list = w.dataset.list, idx = +w.dataset.i;
          const sx = ev.clientX, sy = ev.clientY;
          const r = w.getBoundingClientRect();
          let ghost = null, over = null;
          const target = (e) => { const t = document.elementFromPoint(e.clientX, e.clientY); return t && (t.closest('.sh-drop') || t.closest('.sh-tab')); };
          const move = (e) => {
            if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) {
              ghost = w.cloneNode(true);
              ghost.classList.add('sh-ghost');
              ghost.style.width = r.width + 'px';
              document.body.appendChild(ghost);
              w.classList.add('dragging');
            }
            if (!ghost) return;
            // у края экрана страница убежища прокручивается сама (чтобы дотянуть карту до вкладки героя или сундука)
            const sc = $('.shelter');
            if (e.clientY < 80) sc.scrollTop -= 16; else if (e.clientY > window.innerHeight - 80) sc.scrollTop += 16;
            ghost.style.left = (e.clientX - r.width / 2) + 'px';
            ghost.style.top = (e.clientY - r.height / 2) + 'px';
            const t = target(e);
            if (t !== over) { if (over) over.classList.remove('drop-on'); over = t; if (over) over.classList.add('drop-on'); }
          };
          const up = (e) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (over) over.classList.remove('drop-on');
            if (!ghost) { this.cardMenu(c, h, list, idx); return; }
            ghost.remove(); w.classList.remove('dragging');
            const t = target(e);
            if (!t) return;
            if (t.classList.contains('sh-drop')) { if (t.dataset.list !== list) this.act(() => CMP.move(c, h.id, list, idx, t.dataset.list)); }
            else if (t.dataset.hero && t.dataset.hero !== h.id) this.act(() => CMP.give(c, h.id, list, idx, t.dataset.hero));
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        };
      });
    },
    async cardMenu(c, h, list, i) {
      const it = h[list][i], d = ZG.Cards.get(it.id), CFG = ZG.CAMPAIGN;
      const btns = [];
      ['equip', 'chest', 'junk'].filter((l) => l !== list).forEach((l) => btns.push({ label: { equip: 'В экипировку', chest: 'В сундук', junk: 'В хлам' }[l], value: 'mv:' + l }));
      const p = CMP.price(it.id), val = CMP.isValuable$(it.id);
      if (val) btns.push({ label: `Продать скупщику (${CMP.VAL_MIN}–${CMP.VAL_MAX} 🎫, цена неизвестна)`, value: 'sell' });
      else if (p != null) btns.push({ label: `Продать (+${p} 🎫)`, value: 'sell' });
      if (it.worn) btns.push({ label: `Починить (${CMP.repairPrice(it.id)} 🎫)${CMP.built(h, 'workshop') ? '' : ' — нужна Мастерская'}`, value: 'repair' });
      if (c.roster.length > 1) btns.push({ label: 'Передать…', value: 'give' });
      btns.push({ label: 'Закрыть', cls: 'primary' });
      const cel = CV.card(d);
      const note = it.worn ? '<p class="warn">⚠ На грани поломки: если снова взять её в поход, после миссии она сломается с шансом 50%.</p>'
        : list === 'equip' ? '<p class="muted">Экипированная карта замешивается в колоду на миссию. После похода она станет «на грани поломки».</p>' : '';
      const v = await Modal.show(`<div class="kicker">${esc(ZG.Heroes.get(h.id).name)} · ${LIST_NAME[list]}</div>${note}${val ? '<p class="muted">Скупщик назовёт цену только при продаже. Не продали — сдадите при выходе в поход (если лежит в хламе).</p>' : p == null ? '<p class="muted">Уникальная карта кампании — не продаётся.</p>' : ''}`, btns, cel, 'wide');
      if (!v) return;
      if (v.startsWith('mv:')) return this.act(() => CMP.move(c, h.id, list, i, v.slice(3)));
      if (v === 'sell') { this.act(() => CMP.sell(c, h.id, list, i)); if (val && c.lastSale) toast(`Скупщик повертел Ценность в руках и дал ${c.lastSale.price} 🎫.`); return; }
      if (v === 'repair') return this.act(() => CMP.repair(c, h.id, list, i));
      if (v === 'give') {
        const others = c.roster.filter((o) => o !== h);
        const to = await Modal.show(`<h2>Кому передать «${esc(d.name)}»?</h2><p class="muted">Карта ляжет в сундук получателя.</p>`, others.map((o) => ({ label: `${ZG.Heroes.get(o.id).name} (${o.chest.length}/${CMP.chestCap(o)})`, value: o.id })).concat([{ label: 'Отмена' }]));
        if (to) this.act(() => CMP.give(c, h.id, list, i, to));
      }
    },
    async buildMenu(c, h) {
      const rows = ZG.Buildings.all().map((b) => { const have = CMP.built(h, b.id), poor = !have && h.talons < b.cost; return `<div class="bld-row${have ? ' have' : ''}${poor ? ' poor' : ''}"><b>${esc(b.name)}</b> <small>${b.cost} 🎫${poor ? ` — не хватает ${b.cost - h.talons} 🎫` : ''}</small><div>${esc(b.text)}</div></div>`; }).join('');
      const btns = ZG.Buildings.all().filter((b) => !CMP.built(h, b.id) && h.talons >= b.cost).map((b) => ({ label: `${b.name} (${b.cost} 🎫)`, value: b.id }));
      btns.push({ label: 'Закрыть', cls: 'primary' });
      const v = await Modal.show(`<div class="kicker">Личное убежище — ${esc(ZG.Heroes.get(h.id).name)} · 🎫 ${h.talons}</div><h2>Постройки</h2><div class="bld-list">${rows}</div>`, btns, null, 'wide');
      if (v) this.act(() => CMP.build(c, h.id, v));
    },
    renderHire(c, done) {
      const box = $('#shelter-hire');
      const list = CMP.hireable(c);
      const P = ZG.CAMPAIGN.prices;
      if (done || !list.length) { box.innerHTML = ''; return; }
      const full = c.roster.length >= c.squad + 2;
      box.innerHTML = `<div class="hire-h"><b>Нанять героя — ${P.hire} 🎫</b> <small>Платит один герой: ему — уникальная карта-подарок новичка и долг (половина талонов новичка за звёзды в его первых 3 миссиях). Новичок приходит на 1-м уровне с обычной картой добычи. В убежище — не больше ${c.squad + 2} героев${full ? ' (сейчас полно)' : ''}.</small></div>`;
      const row = el('div', 'hire-list');
      list.forEach((id) => {
        const def = ZG.Heroes.get(id);
        const gift = def.gift ? ZG.Cards.get(def.gift) : null;
        const b = el('button', 'hire-card');
        b.style.setProperty('--hero', def.color);
        b.innerHTML = `<img src="${def.face || CV.artURL(def.art, 96, 96, {})}"><b>${esc(def.name)}</b><small>${esc(def.role)}</small>${gift ? `<small class="gift">🎁 ${esc(gift.name)}</small>` : ''}`;
        b.disabled = full;
        b.onclick = async () => {
          const payers = c.roster.filter((h) => h.talons >= P.hire);
          if (!payers.length) return toast(`Ни у кого нет ${P.hire} 🎫.`);
          const v = await Modal.show(`<h2>Нанять: ${esc(def.name)}</h2>${gift ? `<p>Подарок нанимателю: <b>${esc(gift.name)}</b> — ${esc(gift.text)}</p>` : ''}<p>Кто платит ${P.hire} 🎫?</p>`, payers.map((h) => ({ label: `${ZG.Heroes.get(h.id).name} (🎫 ${h.talons})`, value: h.id })).concat([{ label: 'Отмена' }]));
          if (v) this.act(() => CMP.hire(c, v, id));
        };
        row.appendChild(b);
      });
      box.appendChild(row);
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

  const lcFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  function toast(text, ms) {
    const t = $('#toast');
    t.innerHTML = esc(text);
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms || 2200);
  }

  ZG.App = App; ZG.Game = Game; ZG.Modal = Modal; ZG.Shelter = Shelter;
  document.addEventListener('DOMContentLoaded', () => App.init());
})(window);
