/*
 * The interface: screens (menu → setup → game → results), the hero panel,
 * the hand, actions, modal windows, phase banners and the link with BoardView.
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
    set(k, v) { try { localStorage.setItem('zg_' + k, JSON.stringify(v)); } catch (e) { /* no storage */ } },
  };

  // unlocked secret heroes (rescued in a campaign at least once) — appear in the single-game squad selection
  ZG.unlockedHeroes = store.get('unlocked', []);
  ZG.unlockHero = (id) => { if (!ZG.unlockedHeroes.includes(id)) { ZG.unlockedHeroes.push(id); store.set('unlocked', ZG.unlockedHeroes); } };

  // ================================================================ screens
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

    // ---------------------------------------------------------- menu
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

    // ----------------------------------------------------- setup
    initSetup() {
      const s = this.setup;
      const heroesWrap = $('#setup-heroes');
      ZG.Heroes.visible().forEach((h) => {
        const card = CV.heroCard(h.id, { bio: true, talents: false });
        card.classList.add('selectable');
        card.dataset.hero = h.id;
        const badge = el('div', 'pick-badge');
        card.appendChild(badge);
        // the "Player / AI" toggle for a chosen hero
        const aiBtn = el('button', 'ai-toggle', '🎮 Player');
        aiBtn.title = 'Who controls the hero: you or the AI';
        aiBtn.onclick = (ev) => {
          ev.stopPropagation();
          const x = s.heroes.find((q) => q.id === h.id);
          if (x) { x.ai = !x.ai; this.renderSetup(); }
        };
        card.appendChild(aiBtn);
        card.onclick = () => {
          const idx = s.heroes.findIndex((x) => x.id === h.id);
          if (idx < 0) {
            if (s.heroes.length >= 4) return toast('No more than 4 heroes.');
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
        [{ id: 'random', name: '🎲 Random' }].concat(list).forEach((o) => {
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
        if (!s.heroes.length) return toast('Choose at least one hero.');
        if (s.players === 2 && (!s.heroes.some((h) => h.player === 1 && !h.ai) || !s.heroes.some((h) => h.player === 2 && !h.ai))) return toast('Each player must have at least one hero not controlled by the AI.');
        store.set('setup', s);
        if (this.setupMode === 'camp') {
          // a new campaign: the squad = the chosen heroes (the starting squad size)
          const c = CMP.create({ heroes: s.heroes.map((h) => ({ id: h.id, player: h.player, ai: !!h.ai })), difficultyId: s.difficulty, players: s.players, seed: s.seed || undefined, name: 'Campaign' });
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
      $('#screen-setup .setup-head h2').textContent = camp ? 'New Campaign' : 'Preparing for the Sortie';
      $$('#screen-setup .setup-grid .step-num').forEach((n, i) => { n.textContent = camp ? (i === 2 ? '2' : '') : String(i + 2); });
      $('#btn-start').textContent = camp ? 'Start Campaign' : 'Start Sortie';
      $$('#setup-players button').forEach((b) => b.classList.toggle('on', +b.dataset.p === s.players));
      $$('#setup-heroes .hero-card').forEach((c) => {
        const h = s.heroes.find((x) => x.id === c.dataset.hero);
        c.classList.toggle('picked', !!h);
        c.classList.toggle('p2', !!h && h.player === 2);
        $('.pick-badge', c).textContent = h ? (h.ai ? 'AI' : s.players === 2 ? 'PLAYER ' + h.player : 'IN SQUAD') : '';
        c.classList.toggle('ai', !!h && !!h.ai);
        $('.ai-toggle', c).textContent = h && h.ai ? '🤖 AI' : '🎮 Player';
      });
      ['scenario', 'condition', 'difficulty'].forEach((k) => $$(`#setup-${k} .chip`).forEach((b) => b.classList.toggle('on', b.dataset.v === s[k])));
      const n = s.heroes.length;
      $('#setup-hint').innerHTML = n === 0 ? 'Choose heroes (1–4). 2 is recommended.'
        : `Squad: <b>${s.heroes.map((h) => ZG.Heroes.get(h.id).name + (s.players === 2 ? ` (P${h.player})` : '')).join(', ')}</b>. ` +
          (n === 1 ? 'Solo: one manhole and "Loner" (+1 hand size).' : n >= 3 ? 'More heroes — more spawn points.' : 'A great squad size.') +
          (s.players === 2 ? ' <i>Clicking a hero switches the player.</i>' : '') +
        (camp ? ` <b>Starting squad size (${n})</b>: at least this many heroes go on each mission while they are on their feet; hired recruits can bring the squad up to 4.` : '') +
        ` <i>The "🎮/🤖" button on a card hands the hero to the AI${s.heroes.length && s.heroes.every((x) => x.ai) ? ' (all heroes under the AI — spectator mode)' : ''}.</i>`;
      const scen = s.scenario === 'random' ? null : ZG.Scenarios.get(s.scenario);
      $('#setup-scen-desc').textContent = scen ? scen.brief : 'The task will be random: 4 kinds of goals.';
      const cond = s.condition === 'random' ? null : ZG.Conditions.get(s.condition);
      $('#setup-cond-desc').textContent = cond ? cond.text : 'The condition will be random: weather, finds or threats.';
    },
  };

  // =================================================================== the game
  const Game = {
    g: null,
    view: null,
    sel: null, // the selected card / mode
    busy: false,
    logSeen: 0,
    lastPlayer: null,

    init() {
      this.view = new ZG.BoardView($('#board'));
      this.view.onClick = (p) => this.onBoardClick(p);
      this.view.onHover = (h, changed) => this.onBoardHover(h, changed);
      $('#btn-end').onclick = () => this.endTurn();
      $('#btn-menu').onclick = async () => {
        // while the menu is open, AI heroes wait (otherwise the game would go on under the window)
        this.menuHold = true;
        if (!this.camp) {
          const yes = await Modal.show('<p class="confirm">Exit to the menu? The game will be saved.</p>', [{ label: 'Cancel', value: false }, { label: 'Yes', value: true, cls: 'primary' }]);
          this.menuHold = false;
          if (yes) this.leave();
          return;
        }
        // campaign: exit and a debug mission finish (to test the shelter without playing through)
        const v = await Modal.show('<h2>Menu</h2><p>The campaign mission will be saved in its slot.</p><p class="muted">🛠 Debug: finish the mission right away — to test transitions, purchases, wear and morale.</p>',
          [{ label: 'Exit to Menu', value: 'exit' }, { label: '🛠 Win ★', value: 'w1' }, { label: '🛠 Win ★★', value: 'w2' }, { label: '🛠 Win ★★★', value: 'w3' }, { label: '🛠 Fail', value: 'lose' }, { label: 'Cancel', cls: 'primary' }]);
        this.menuHold = false;
        if (v === 'exit') { this.leave(); return; }
        if (v && this.g && !this.g.result) {
          const g = this.g, win = v !== 'lose';
          g.result = { win, stars: win ? +v.slice(1) : 0, reason: win ? 'Debug: mission counted' : 'Debug: mission failed', round: g.round };
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
        pb.title = this.paused ? 'Resume AI' : 'Pause AI';
        if (!this.paused) { this.setHelp(null); this.maybeAutoBegin(); }
      };
      const sb = $('#btn-sound');
      const showSound = () => { sb.textContent = ZG.Sound.muted ? '🔇' : '🔊'; sb.title = ZG.Sound.muted ? 'Sound off' : 'Sound on'; };
      showSound();
      sb.onclick = () => { ZG.Sound.toggle(); showSound(); if (!ZG.Sound.muted) ZG.Sound.play('growl', { volume: 0.5 }); };
      // "table" mode: the board at an angle, like a real box on a table
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

    // exiting to the menu mid-game: save and "cut off" all async chains of this game
    // (AI turn, animations, sounds, pop-up windows) — they check this.run and quietly finish
    leave() {
      this.save();
      this.run = (this.run || 0) + 1;
      this.busy = false; this.aiRunning = false; this.menuHold = false;
      document.body.classList.remove('busy');
      Modal.waiters.length = 0; // event windows waiting in the queue will not pop up in the menu
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

    // campaign: the next mission with the chosen squad
    startCampaignMission(squad) {
      const camp = App.campaign;
      const opts = CMP.startMission(camp.c, squad);
      if (opts.error) { toast(opts.error); return false; }
      const sold = camp.c.lastJunkSale || [];
      if (sold.length) toast('The fence took the Valuables: ' + Object.entries(sold.reduce((m, x) => ((m[x.hero] = (m[x.hero] || []).concat(x.price)), m), {})).map(([id, ps]) => `${ZG.Heroes.get(id).name} — ${ps.join(' and ')} 🎫`).join('; '), 6000);
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
        if (g.v !== 2) throw new Error('an old save version (the board got bigger)');
        const level = ZG.Levels.get(g.levelId);
        // the board is restored deterministically from the seed
        const tmp = E.create({ seed: g.seed, heroes: g.heroes.map((h) => ({ id: h.id, player: h.player, ai: h.ai })), scenarioId: g.scenarioId, conditionId: g.conditionId, bonusId: g.bonusId, difficultyId: g.difficultyId, levelId: level.id, tileRules: g.tileRules, quiet: true });
        g.board = tmp.board;
        g.fx = []; g.log = g.log || [];
        this.g = g;
        this.players = save.players || 1;
        this.logSeen = 0;
        $('#log').innerHTML = '';
        App.show('game', 'shutter').then(() => this.afterShow(false));
      } catch (e) { console.error(e); toast('Could not load the save.'); }
    },

    save() {
      if (this.camp) {
        // campaign: an unfinished mission is stored in the campaign slot
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
      ZG.Sound.music('music'); // "Time of Change" — from the first board view to the end of the sortie
      this.g.fx = [];
      this.refresh();
      const run = this.run;
      if (intro) {
        await sleep(2700);
        if (!this.live(run)) return;
        const lv = ZG.Levels.get(this.g.levelId), ac = this.g.campaign && ZG.App.campaign, cm = ac && ZG.Campaign.missionDef(ac.c);
        if (cm && cm.name) await Banner.show(`MISSION ${ac.c.missionNo + 1}`, cm.name.toUpperCase(), 'level');
        else await Banner.show(`LEVEL ${lv.num}`, lv.name.toUpperCase(), 'level');
        if (cm && cm.stories && cm.stories.start && !(this.g.storySeen || {})[cm.stories.start]) { (this.g.storySeen = this.g.storySeen || {})[cm.stories.start] = true; await UI_FX.story.call(this, { id: cm.stories.start }); }
        if (!this.live(run)) return;
        await Modal.briefing(this.g);
        if (!this.live(run)) return;
        await Banner.show('ROUND 1', E.phaseName(this.g, 0).toUpperCase(), 'round');
      }
      if (!this.live(run)) return;
      this.refresh();
      if (this.g.pending) await this.handlePending();
      this.maybeAutoBegin();
      // the save was made in the middle of an AI hero's turn (exit to the menu) — it finishes its turn
      const g = this.g;
      if (this.live(run) && !g.result && !g.pending && g.phase === 'heroes' && g.active != null && g.heroes[g.active].ai) this.runAI();
    },

    resize() { if (this.g && App.screen === 'game') { this.view.resize(); } },

    // ---------------------------------------------------- actions
    async act(a, opts) {
      if (this.busy || !this.g) return false;
      const g = this.g, run = this.run;
      const before = { active: g.active, phase: g.phase, round: g.round };
      if (a.t === 'play' && opts && opts.cardEl) Fly.card(opts.cardEl, this.view, g.heroes[g.active]);
      const ok = E.act(g, a);
      if (!ok) { toast(g.lastError || 'Not allowed.'); return false; }
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

    // sequential playback of engine events: some — on the board, some — interface banners
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
      // AI heroes move by themselves once the humans have moved (or there are no humans in the squad)
      if (!human.length && ready.length) { this.runAI(); return; }
      if (ready.length === 1) this.act({ t: 'begin', hero: ready[0].idx });
      else this.refresh();
    },

    // The turn of an AI-controlled hero (the same bot as in the simulator)
    async runAI(heroIdx) {
      const g = this.g;
      if (this.aiRunning || !g || g.result || this.busy) return;
      const run = this.run;
      if (this.paused) { this.setHelp('⏸ Paused — the AI is waiting. Press ▶ in the top bar.'); return; }
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
      // the bot makes an AI hero's decisions
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
        Modal.confirm(`<b class="bad">☣ ${E.heroName(h)} has an Infection in hand!</b><br>If you end the turn now, the hero <b>will turn into a zombie</b>. A medkit or Marina (in the same zone) can save them. End the turn?`, doEnd);
        return;
      }
      if (unused > 0 && store.get('warnEnergy', true)) {
        Modal.confirm(`${E.heroName(h)} has ${unused} ⚡ left — the energy will be wasted. End the turn?` + (zHere ? `<br><small>There ${zHere === 1 ? 'is 1 zombie' : `are ${zHere} zombies`} in the zone — the shield cards left in hand will come in handy for defense.</small>` : ''), doEnd);
      } else doEnd();
    },

    // ------------------------------------------------- choosing a target
    selectCard(uid, cardEl) {
      const g = this.g;
      if (this.busy || g.active == null) return;
      const h = g.heroes[g.active];
      const def = E.cardDef(g, uid);
      if (def.unplayable) return toast(def.kind === 'wound' ? 'A Wound cannot be played. Healing will remove it.' : def.kind === 'cargo' ? 'Cargo cannot be played — deliver it.' : 'This card cannot be played.');
      const cost = E.cardCost(g, h, uid);
      if (cost > h.energy) return toast(`You need ${cost} ⚡, but only ${h.energy} left.`);
      const targets = E.targetsFor(g, h, def);
      if (!targets.length) return toast('No suitable target for this card.');
      if (!def.target) {
        // cards without a target — a second click (or Enter) plays them, so as not to play one by accident
        if (this.sel && this.sel.uid === uid) return this.act({ t: 'play', card: uid, target: null }, { cardEl });
        this.sel = { mode: 'confirm', uid, def, targets: [], cardEl };
        this.applyHighlights();
        this.refreshHand();
        this.setHelp(`"${esc(def.name)}": click the card again or press Enter to play it. <span class="muted">Esc — cancel</span>`);
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
        zombie: def.target.ranged ? 'Choose a zombie in the line of fire.' : 'Choose a zombie in your zone.',
        zone: 'Choose a zone with zombies in the line of fire.',
        move: 'Choose where to move.',
        hero: 'Choose a hero.',
        cell: 'Choose a zone for the lure.',
        adj: 'Choose your zone or an adjacent one.',
        edge: 'Choose an adjacent zone — the barricade goes on the passage.',
      }[k] + ' <span class="muted">RMB / Esc — cancel</span>';
    },

    selectMode(mode) {
      const g = this.g;
      if (this.busy || g.active == null) return;
      const h = g.heroes[g.active];
      if (this.sel && this.sel.mode === mode) return this.cancelSel();
      if (mode === 'barricade') {
        const t = E.legal(g).filter((a) => a.t === 'barricade').map((a) => a.to);
        if (!t.length) return toast('Cannot put a barricade here.');
        this.sel = { mode, targets: t };
        this.setHelp('Choose an adjacent zone — the barricade goes on the passage between the zones.');
      } else if (mode === 'punch') {
        const t = E.zombiesAt(g, h.pos).map((z) => z.uid);
        this.sel = { mode, targets: t };
        this.setHelp('Choose a zombie in your zone.');
      } else if (mode === 'ttshot') {
        const t = E.legal(g).filter((a) => a.t === 'ttshot').map((a) => a.zombie);
        if (!t.length) return toast('Nothing to shoot at.');
        this.sel = { mode, targets: t };
        this.setHelp('TT Shot: choose an enemy 0–2 zones away in a straight line (2 damage, Noise 1).');
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
        // by default — the available steps
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
        // clicking a hero — start their turn
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
          if (near) toast(E.exhausted(g, h) ? 'The hero is exhausted: cannot walk — catch your breath or play a movement card.' : `Not enough ⚡: a step costs ${E.moveCost(g, h, p.cell)}, ${h.energy} left.`);
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
        if (target == null) return toast('That is not a valid target.');
        this.act({ t: 'play', card: s.uid, target }, { cardEl: s.cardEl });
      } else if (s.mode === 'punch') {
        let z = p.zombie && s.targets.includes(p.zombie) ? p.zombie : null;
        if (!z && p.cell === g.heroes[g.active].pos) z = pickBest(g, s.targets);
        if (z) this.act({ t: 'punch', zombie: z });
      } else if (s.mode === 'ttshot') {
        let z = p.zombie && s.targets.includes(p.zombie) ? p.zombie : null;
        if (!z && p.cell != null) { const zs = s.targets.filter((u) => (E.zombie(g, u) || {}).pos === p.cell); if (zs.length) z = pickBest(g, zs); }
        if (z) this.act({ t: 'ttshot', zombie: z }); else toast('That is not a valid target.');
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
      x = Math.max(8, x); y = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)); // a tall tooltip does not go off the screen edge
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    },

    onKey(ev) {
      if (Modal.open) { if (ev.key === 'Escape') Modal.escape(); return; }
      if ($('#rules').classList.contains('show')) { if (ev.key === 'Escape') $('#rules').classList.remove('show'); return; }
      if (App.screen !== 'game') return;
      if (ev.key === 'Enter' && this.sel && this.sel.mode === 'confirm') this.act({ t: 'play', card: this.sel.uid, target: null }, { cardEl: this.sel.cardEl });
      else if (ev.key === 'Escape') this.cancelSel();
      else if (ev.key === 'e') this.endTurn();
      else if (ev.key === 'h') this.hint();
      else if (/^[1-9]$/.test(ev.key)) {
        const cards = $$('#hand .card');
        const c = cards[+ev.key - 1];
        if (c) c.click();
      }
    },

    // ---------------------------------------------------- hints
    hint() {
      const g = this.g;
      if (!g || this.busy || g.phase !== 'heroes') return;
      if (g.active == null) return toast('Choose a hero first (click a portrait).');
      const a = ZG.Bot.bestAction(g);
      if (!a) return toast('Tip: it looks better to end the turn and keep shield cards for defense.');
      toast('Tip: ' + describeAction(g, a), 4200);
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
      if (g.active == null) return toast('Choose a hero first.');
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
      // cards are grouped by kind with counts; in the deck the order is hidden (sorted by suit and name)
      const pile = which === 'deck' ? h.deck : which === 'exhaust' ? (h.exhaust || []) : h.discard;
      const groups = new Map();
      pile.forEach((u) => { const id = g.cards[u]; groups.set(id, (groups.get(id) || 0) + 1); });
      const order = { rage: 0, agility: 1, mind: 2, none: 3 };
      const ids = [...groups.keys()].sort((a, b) => {
        const da = ZG.Cards.get(a), db = ZG.Cards.get(b);
        return (order[da.suit] - order[db.suit]) || da.name.localeCompare(db.name, 'en');
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
      if (!ids.length) wrap.appendChild(el('p', 'muted', 'Empty.'));
      const wounds = groups.get('wound') || 0;
      const title = which === 'deck' ? `Deck: ${pile.length}` : which === 'exhaust' ? `Fatigue: ${pile.length} / ${E.EXHAUST_AT}` : `Discard: ${pile.length}`;
      const sub = which === 'deck' ? 'The order is hidden — the contents are shown.' : which === 'exhaust' ? `Cards discarded to block. They return to the discard only with the "Catch Breath" action (3 ⚡, in a zone without zombies). At ${E.EXHAUST_AT}+ cards the hero is exhausted: hand −1, basic actions unavailable.` : 'It is shuffled into the deck when the deck runs out.';
      Modal.show(`<h2>${title}</h2><p class="muted">${sub}${wounds ? ` Wounds: <b>${wounds}</b>.` : ''} Click a card to enlarge it.</p>`, [{ label: 'Close' }], wrap, 'wide');
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
        html = ready.length ? 'Choose the hero who acts next: click a portrait on the right or a piece on the board.' : '';
      } else if (g.active != null && g.heroes[g.active].ai) {
        html = `🤖 The AI is playing: ${esc(E.heroName(g.heroes[g.active]))}. Speed — the ×1/×2/×3 button, pause — ⏸.`;
      } else if (g.active != null && E.exhausted(g, g.heroes[g.active])) {
        html = '😮‍💨 The hero is exhausted: hand −1, cannot walk or act without cards. "Catch Breath" (3 ⚡, in a zone without zombies) returns the cards from Fatigue.';
      } else if (g.active != null) {
        html = 'Play cards or click an adjacent zone to walk. Shield cards left in hand will protect you in the zombie phase.';
      } else if (g.phase === 'zombies') html = 'Zombie turn…';
      box.innerHTML = html;
      box.classList.toggle('show', !!html);
    },

    // ======================================================= HUD rendering
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
          s.title = `Round ${r}: ${E.phaseName(g, ph)}`;
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
      $('#alarm-val').textContent = g.alarm >= th ? `${g.alarm}/${th} · WAVE!` : `${g.alarm}/${th}`;
      $('#alarm-val').classList.toggle('wave', g.alarm >= th);
      // goals
      const goals = E.scenario(g).goals(g);
      // the task window: number, state (done / failed with a reason / a new task)
      $('#goals').innerHTML = `<div class="goal-title"><span>Task</span>${esc(E.scenario(g).name)}</div>` + goals.map((x, i) => {
        const st = x.failed ? 'failed' : x.done ? 'done' : x.isNew ? 'new' : '';
        const mark = x.failed ? '✕' : x.done ? '✓' : String(i + 1);
        return `<div class="goal ${st}"><i>${mark}</i><div class="goal-body">${x.isNew ? '<span class="goal-tag">New task</span>' : ''}<span class="goal-text">${esc(x.text)}</span>${x.note ? `<small class="goal-note">${esc(x.note)}</small>` : ''}</div></div>`;
      }).join('') +
        (E.isComplete(g) ? (g.heroes.some((h) => h.onBoard && E.canEvac(g, h))
          ? `<div class="goal-evac">Evacuation open: "${esc(E.scenario(g).exitLabel)}" — the "Evacuate" action in that zone.</div>`
          : `<div class="goal-evac blocked">Evacuation closed: ${esc(lcFirst(E.scenario(g).evacBlockedText || 'you cannot leave right now.'))}</div>`) : '');
      const cond = ZG.Conditions.get(g.conditionId);
      const bonus = g.bonusId ? ZG.Bonuses.get(g.bonusId) : null;
      $('#cond').innerHTML = `<b>${esc(cond.name)}.</b> <span class="cond-full">${esc(cond.text)}</span>` + (bonus ? `<div class="bonus-line">★ <b>${esc(bonus.name)}:</b> <span class="cond-full">${esc(bonus.text)}</span> <span class="${bonus.check(g) ? 'ok' : ''}">(${esc(bonus.progress(g))})</span></div>` : '');
      if (g.event) {
        const ev = ZG.Events.get(g.event);
        $('#cond').innerHTML += `<div class="event-line tone${ev.tone > 0 ? 'pos' : ev.tone < 0 ? 'neg' : 'neu'}">⚑ <b>Event: ${esc(ev.name)}.</b> <span class="cond-full">${esc(ev.text)}</span></div>`;
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
        // tracks: Grit (heart pieces in slots) and XP (a piece slides along the scale)
        // the panel is redrawn often: the change is remembered for the duration of the animation and continued
        // (a negative animation-delay) rather than reset at the next redraw
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
        const status = E.sheltered(g, h) ? '🏠 IN COVER' : h.onBoard && E.exhausted(g, h) ? '😮‍💨 EXHAUSTED' : h.turned ? 'TURNED' : h.fallen ? 'FALLEN' : h.evacuated ? 'SAVED' : h.idx === g.active ? 'ACTING' : h.acted ? 'done' : 'ready';
        const info = el('div', 'hp-info');
        info.innerHTML = `
          <div class="hp-name">${esc(def.name)} <small>${h.ai ? '🤖 AI' : this.players === 2 ? 'P' + h.player : ''}</small><span class="hp-status">${status}</span></div>
          <div class="trk trk-hp" title="Grit: ${okN} of ${hp}${inf ? ` · ☣ Infections: ${inf}` : ''}"><b class="trk-l">♥</b><span class="slots">${pips.join('')}</span>${infHand && h.onBoard ? '<b class="inf-warn" title="An Infection in hand: at the end of the turn the hero will turn! A medkit or Marina is needed.">☣ IN HAND!</b>' : inf ? `<b class="inf-mark">☣${inf}</b>` : ''}</div>
          <div class="trk trk-xp" title="XP ${h.xp}${xpNext ? ' — next level at ' + xpNext : ''}"><b class="trk-l">🎖</b><span class="xp-line">${Array.from({ length: XPMAX + 1 }, (_, i) => `<i class="tick${LV.includes(i) ? ' gate' : ''}${i <= xpTo ? ' on' : ''}" style="left:${(i / XPMAX) * 100}%"></i>`).join('')}<i class="xp-tok" data-to="${(xpTo / XPMAX) * 100}" style="left:${(xpFrom / XPMAX) * 100}%"></i></span><b class="xp-n">${h.xp}</b></div>
          <div class="hp-meta">
            <span title="Hand size: the hero draws up to this many cards at the start of the turn (no more than 3 at a time)">✋ ${E.handSize(g, h)}</span>
            <span title="Deck / discard">🂠 ${h.deck.length}/${h.discard.length}</span>
            ${(h.exhaust || []).length ? `<span class="${E.exhausted(g, h) ? 'tired' : ''}" title="Fatigue: cards discarded to block (at ${E.EXHAUST_AT}+ — exhausted). Recover with &quot;Catch Breath&quot;.">😮‍💨 ${h.exhaust.length}/${E.EXHAUST_AT}</span>` : ''}
            ${h.block ? `<span title="Block until the next turn">🛡 ${h.block}</span>` : ''}
            ${g.heroes.some((o) => o !== h && o.onBoard && E.rel(g, h, o) <= -3) ? `<span class="enemy-rel" title="Enemies: ${esc(g.heroes.filter((o) => o !== h && o.onBoard && E.rel(g, h, o) <= -3).map((o) => E.heroName(o)).join(', '))}. Ending your turn on an enemy's tile — they get −1 ⚡ next turn.${h.irritated ? ' NOW: −1 ⚡ next turn.' : ''}">⚔${h.irritated ? ' −1⚡' : ''}</span>` : ''}
            ${E.bondPartners(g, h).length ? `<span class="${h.bondReady || (h.idx === g.active && g.turn && g.turn.bond) ? 'bond-on' : ''}" title="Bond with: ${esc(E.bondPartners(g, h).map((o) => E.heroName(o)).join(', '))}. If a partner ends their turn on your tile, the first card of your next turn triggers with a Chain (if it has a Chain effect).${h.bondReady ? ' NOW: ready!' : ''}">🤝${h.bondReady || (h.idx === g.active && g.turn && g.turn.bond) ? ' Bond!' : ''}</span>` : ''}
            ${h.adrenaline ? `<span title="Adrenaline">+${h.adrenaline}⚡</span>` : ''}
            ${h.hidden ? '<span>👻</span>' : ''}
          </div>
          ${this.missionLine(h)}
          ${h.talents.length || (h.perks || []).length ? `<div class="hp-talents">${h.talents.map((t) => esc(ZG.Talents.get(t).name)).concat((h.perks || []).map((id) => '✦ ' + esc(ZG.Missions.get(id).perk.name))).join(' · ')}</div>` : ''}
          ${h.equip.length ? `<div class="hp-equip">${h.equip.map((u) => esc(E.cardDef(g, u).name)).join(' · ')}</div>` : ''}`;
        c.appendChild(info);
        // the XP piece moves to the new value
        const xt = info.querySelector('.xp-tok');
        if (xt) requestAnimationFrame(() => requestAnimationFrame(() => { xt.style.left = xt.dataset.to + '%'; }));
        const ml = info.querySelector('.hp-mission.mine');
        if (ml) ml.onclick = (ev) => {
          ev.stopPropagation();
          const m = ZG.Missions.get(h.mission);
          Modal.show(`<div class="kicker">Secret mission — ${esc(E.heroName(h))}</div><h2>${esc(m.name)}: ${E.missionProgress(g, h)}/${m.goal}</h2><p>${esc(m.text)}</p><p><b>Reward — first only:</b> ${esc(m.rewardText)}</p>`, [{ label: 'Close', cls: 'primary' }]);
        };
        c.onclick = () => {
          if (g.phase === 'heroes' && g.active == null && h.onBoard && !h.acted) { if (h.ai) this.runAI(h.idx); else this.act({ t: 'begin', hero: h.idx }); }
          else Modal.heroInfo(h.id, h);
        };
        box.appendChild(c);
      });
    },

    // secret mission: your own is visible only to its player (and only to a human); a completed one — to everyone
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
      await Modal.show(`<div class="kicker">New secret mission — ${esc(E.heroName(h))}</div><h2>${esc(m.name)}</h2><p>${esc(m.text)}</p><p><b>Reward — first only:</b> ${esc(m.rewardText)}</p>`, [{ label: 'Got it', cls: 'primary' }]);
    },
    missionLine(h) {
      const g = this.g;
      if (!g.missions || !h.mission) return '';
      const m = ZG.Missions.get(h.mission);
      if (h.missionDone) {
        const won = g.missionFirst === h.idx;
        return `<div class="hp-mission ${won ? 'won' : 'late'}" title="${esc(m.text)}">${won ? '✦' : '✗'} ${esc(m.name)}${m.traitor && won ? ' — TRAITOR' : ''}${won ? '' : ' (not first)'}</div>`;
      }
      if (!this.canSeeMission(h)) return `<div class="hp-mission hidden" title="Secret mission — visible only to its owner">🂠 secret mission</div>`;
      return `<div class="hp-mission mine" style="cursor:pointer" title="${esc(m.text)}\nReward (first only): ${esc(m.rewardText)}">🂠 ${esc(m.name)}: ${E.missionProgress(g, h)}/${m.goal}${g.missionFirst != null ? ' · the reward is already gone' : ''}</div>`;
    },

    refreshHand() {
      const g = this.g;
      const hand = $('#hand');
      const h = g.active != null ? g.heroes[g.active] : null;
      const prev = new Set($$('.card', hand).map((c) => c.dataset.uid));
      hand.innerHTML = '';
      $('#hand-owner').innerHTML = h ? `${esc(E.heroName(h))}${this.players === 2 ? ` <small>· Player ${h.player}</small>` : ''}` : (g.phase === 'heroes' ? 'Choose a hero' : 'Zombie turn…');
      if (h) {
        const hs = E.handSize(g, h);
        const parts = E.handSizeParts(g, h).map((p, i) => (i ? `+${p.n} ${p.name}` : `${p.n} ${p.name}`)).join(', ');
        const hc = el('span', 'hand-size', `🂠 ${h.hand.length}/${hs}`);
        hc.title = `Hand size ${hs} = ${parts}.\nAt the start of the turn the hero draws up to this number, but no more than 3 at a time. Extra cards (over the limit) are not discarded.`;
        $('#hand-owner').appendChild(hc);
      }
      // energy
      const en = $('#energy');
      const sig = h ? h.idx + ':' + h.energy : '';
      if (en.dataset.sig === sig) { /* the orbs are not recreated — no repeated animation */ } else {
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
          c.appendChild(el('div', 'chain-ribbon', g.turn.bond && !g.turn.played && g.turn.lastSuit !== def.suit ? 'BOND' : 'CHAIN'));
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
      // gear
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
            const b = el('button', 'act big' + (x.ai ? ' ai' : ''), x.ai ? `🤖 AI turn: ${esc(E.heroName(x))}` : `▶ Turn: ${esc(E.heroName(x))}`);
            b.onclick = () => (x.ai ? this.runAI(x.idx) : this.act({ t: 'begin', hero: x.idx }));
            bar.appendChild(b);
          });
        }
        return;
      }
      const legal = E.legal(g);
      const has = (t) => legal.some((a) => a.t === t);
      const zHere = E.zombiesAt(g, h.pos).length;
      // a large icon: highlighted if available; dimmed with an explanation if not
      const tired = E.exhausted(g, h);
      const icon = (key, label, cost, ok, why, onclick, extra) => {
        if (!ok && tired && key !== 'rest') why = 'the hero is exhausted — "Catch Breath" first';
        const b = el('button', 'act-icon' + (ok ? ' ok' : ' off') + (extra || ''));
        const im = el('img'); im.src = CV.artURL('act_' + key, 112, 112, {}); im.alt = '';
        b.appendChild(im);
        b.appendChild(el('span', 'ai-label', label));
        if (cost != null) b.appendChild(el('span', 'ai-cost', cost + '⚡'));
        b.title = ok ? label + (cost != null ? ` (${cost} ⚡)` : '') : `${label}: ${why}`;
        b.onclick = () => { if (ok) onclick(); else toast(`${label}: ${why}`); };
        bar.appendChild(b);
      };
      const lack = (c) => `need ${c} ⚡ (${h.energy} left)`;
      const sc = E.searchCost(g, h);
      const searchHere = E.searchableHere(g, h) || g.crates.some((c) => c.pos === h.pos && !c.opened) || g.search.some((s) => s.pos === h.pos);
      icon('search', 'Search', sc, has('search'), !searchHere ? 'nothing to search in this zone' : zHere ? 'zombies in the zone are in the way' : lack(sc), () => this.act({ t: 'search' }));
      icon('punch', 'Punch', E.PUNCH_COST, has('punch'), !zHere ? 'no zombies in the zone' : lack(E.PUNCH_COST), () => this.selectMode('punch'), this.sel && this.sel.mode === 'punch' ? ' sel' : '');
      if (ZG.Mods.flag(g, h, 'ttShot')) icon('ttshot', 'TT Shot', 1, has('ttshot'), g.turn.ttShot ? 'already fired this turn' : h.energy < 1 ? lack(1) : 'no enemy 0–2 zones away in a straight line', () => this.selectMode('ttshot'), (this.sel && this.sel.mode === 'ttshot' ? ' sel' : '') + ' gold');
      const bc = E.barricadeCost(g, h);
      icon('barricade', 'Barricade', bc, has('barricade'), g.barricades.length >= 4 ? 'all 4 barricades are already on the board' : lack(bc), () => this.selectMode('barricade'), this.sel && this.sel.mode === 'barricade' ? ' sel' : '');
      const gives = legal.filter((a) => a.t === 'give');
      const nearO = g.heroes.filter((o) => o !== h && o.onBoard && o.pos === h.pos);
      icon('give', 'Give', 0, gives.length > 0, nearO.length && nearO.every((o) => E.rel(g, h, o) < 0) ? 'dislike: these heroes do not give each other cards' : g.turn.gave ? 'already gave this turn (to Pals and Friends — no limit)' : !g.heroes.some((o) => o !== h && o.onBoard && o.pos === h.pos) ? 'no other hero nearby' : 'no finds, cargo or campaign cards in hand (base cards cannot be given)', () => this.giveDialog());
      icon('rest', 'Catch Breath', 3, has('rest'), !(h.exhaust || []).length ? 'Fatigue is empty (cards discarded to block go there)' : zHere ? 'zombies in the zone are in the way' : lack(3), () => this.act({ t: 'rest' }), tired ? ' gold' : '');
      if (ZG.Mods.flag(g, h, 'healAction')) {
        const hl = legal.filter((a) => a.t === 'heal');
        icon('heal', 'Heal', 1, hl.length > 0, g.turn.healUsed >= ZG.Mods.value(g, h, 'healAction', 0) ? 'already healed this turn' : h.energy < 1 ? lack(1) : 'no wounded nearby', async () => {
          const opts = hl.map((a) => a.hero);
          const i = opts.length === 1 ? opts[0] : await Modal.pickHero(g, opts);
          if (i != null) this.act({ t: 'heal', hero: i });
        });
        const cl = legal.filter((a) => a.t === 'cleanse');
        if (cl.length || E.heroesAt(g, h.pos).some((o) => E.infectCount(g, o))) icon('cleanse', 'Disinfect', 1, cl.length > 0, g.turn.healUsed >= ZG.Mods.value(g, h, 'healAction', 0) ? 'already healed this turn' : h.energy < 1 ? lack(1) : 'the Infection must be in the hand of a hero nearby', async () => {
          const opts = cl.map((a) => a.hero);
          const i = opts.length === 1 ? opts[0] : await Modal.pickHero(g, opts);
          if (i != null) this.act({ t: 'cleanse', hero: i });
        }, ' gold');
      }
      if (g.board.cells[h.pos].bld) icon('door', 'Close Doors', 1, has('shut'), E.sheltered(g, h) ? 'you are already in cover' : h.energy < 1 ? lack(1) : 'all doors are already closed', () => this.act({ t: 'shut' }));
      if (ZG.Mods.flag(g, h, 'shoutAction')) icon('shout', 'Iron Lungs', 0, has('shout'), 'already shouted this turn', () => this.act({ t: 'shout' }), ' gold');
      if (ZG.Mods.flag(g, h, 'foremanAction')) {
        const fl = legal.filter((a) => a.t === 'foreman');
        icon('foreman', 'Site Boss', 1, fl.length > 0, g.turn.foreman ? 'already gave orders this turn' : h.energy < 1 ? lack(1) : 'no other hero nearby', async () => {
          const opts = fl.map((a) => a.hero);
          const i = opts.length === 1 ? opts[0] : await Modal.pickHero(g, opts);
          if (i != null) this.act({ t: 'foreman', hero: i });
        }, ' gold');
      }
      if (ZG.Mods.flag(g, h, 'plugAction')) icon('plug', 'Plug', E.plugCost(g, h), has('plug'), !g.spawnPoints.includes(h.pos) ? 'stand in a zone with a manhole' : E.plugged(g, h.pos) ? 'the manhole is already plugged' : lack(E.plugCost(g, h)), () => this.act({ t: 'plug' }), ' gold');
      const burns = legal.filter((a) => a.t === 'burn');
      const bitten = E.heroesAt(g, h.pos).some((o) => o.hand.some((u) => g.cards[u] === 'infection'));
      if (bitten) icon('cleanse', 'Cauterize Bite', 2, burns.length > 0, E.zombiesAt(g, h.pos).length ? 'zombies nearby — no chance (you need a zone without enemies)' : lack(2), async () => {
        const opts = burns.map((a) => a.hero);
        const i = opts.length === 1 ? opts[0] : await Modal.pickHero(g, opts);
        if (i != null) this.act({ t: 'burn', hero: i });
      }, ' gold');
      if (g.drops.length) icon('pickup', 'Pick Up', 1, has('pickup'), 'no dropped cargo in the zone', () => this.act({ t: 'pickup' }));
      const sfH = E.safeAt(g, h.pos);
      if (sfH) icon('safe', 'Crack', E.SAFE_COST, has('safe'), sfH.jammed ? 'the safe is jammed — siren' : !sfH.deck.length ? 'the safe is empty' : zHere ? 'zombies in the zone are in the way' : lack(E.SAFE_COST), () => this.act({ t: 'safe' }), ' gold');
      const sa = legal.filter((a) => a.t === 'scenario');
      sa.forEach((a) => icon('task', a.label, a.cost, true, '', () => this.act(a), ' gold'));
      if (E.isComplete(g)) icon('evac', 'Evacuate', 0, has('evac'), 'reach the exit zone', async () => {
        const left = E.leftBehind(g, h);
        if (left.length) {
          const v = await Modal.show(`<h2>Leave without a comrade?</h2><p>${esc(left.map((o) => E.heroName(o)).join(', '))} ${left.length > 1 ? 'are' : 'is'} right next to the exit (1–2 zones). If you leave now, your relations with ${left.length > 1 ? 'them' : 'them'} will drop by 1.</p>`, [{ label: 'Leave', value: 'go' }, { label: 'Wait', cls: 'primary' }]);
          if (v !== 'go') return;
        }
        this.act({ t: 'evac' });
      }, ' gold');
      if (g.survivor) icon('heal', 'Rescue', 1, has('rescue'), 'reach the survivor (SOS on the board)', () => this.act({ t: 'rescue' }), ' gold');
      if (g.campaign && g.retreats > 0) icon('evac', 'Retreat', null, has('retreat'), '', async () => {
        const v = await Modal.show(`<h2>Retreat to the shelter?</h2><p>The task will fail, but everyone still on their feet will return to the shelter (wounds remain). There will be no mission rewards, all Valuables from this mission will have to be dropped, and everyone in the squad gets −1 morale. The mission will have to be replayed.</p><p>Retreats left: <b>${g.retreats}</b> — this is one of them.</p>`, [{ label: 'Retreat', value: 'go' }, { label: 'Hold On', cls: 'primary' }]);
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
      if (this._overFor === g) return; // already finishing (for example, the end of an AI turn and the menu button at the same time)
      this._overFor = g;
      ZG.Sound.stopMusic(2500);
      if (!this.camp) store.set('save', null);
      await sleep(600);
      clearTimeout(toast._t); $('#toast').classList.remove('show'); // old tips do not hang over the results
      const r = g.result;
      const scr = $('#screen-end');
      const old = $('#end-missions'); if (old) old.remove();
      scr.className = 'screen ' + (r.win ? 'win' : 'lose');
      $('#end-title').textContent = r.win ? 'YOU SURVIVED' : 'THE BLOCK HAS FALLEN';
      $('#end-reason').textContent = r.reason;
      const stars = $('#end-stars');
      stars.innerHTML = '';
      const starHints = ['Victory', 'Nobody fell', g.bonusId ? ZG.Bonuses.get(g.bonusId).name : 'Bonus'];
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
        <div><b>${g.round}</b><span>round</span></div>
        <div><b>${st.kills}</b><span>killed</span></div>
        <div><b>${st.wounds + (st.infections || 0)}</b><span>wounds</span></div>${st.turned ? `<div><b>${st.turned}</b><span>turned</span></div>` : ''}
        <div><b>${st.chains}</b><span>chains</span></div>
        <div><b>${st.waves}</b><span>waves</span></div>
        <div><b>${st.searches}</b><span>searches</span></div>`;
      // revealing the secret missions
      if (g.missions) $('#end-stats').insertAdjacentHTML('afterend', `<div class="end-missions" id="end-missions">${g.heroes.filter((h) => h.mission).map((h) => { const m = ZG.Missions.get(h.mission); return `<span class="${g.missionFirst === h.idx ? 'won' : ''}">${esc(E.heroName(h))}: "${esc(m.name)}" ${h.missionDone ? (g.missionFirst === h.idx ? '✦ first' : '✓ too late') : `${E.missionProgress(g, h)}/${m.goal}`}</span>`; }).join('')}</div>`);
      $('#end-seed').textContent = `Seed: ${g.seed} · ${E.scenario(g).name} · ${ZG.Conditions.get(g.conditionId).name} · ${ZG.Difficulties.get(g.difficultyId).name}`;
      $('#btn-again').onclick = () => Game.start({ seed: String(Math.floor(Math.random() * 1e9)), heroes: g.heroes.map((h) => ({ id: h.id, player: h.player, ai: h.ai })), difficultyId: g.difficultyId, fog: g.fog, stealth: g.stealth, missions: g.missions, players: this.players });
      $('#btn-replay').onclick = () => Game.start({ seed: g.seed, heroes: g.heroes.map((h) => ({ id: h.id, player: h.player, ai: h.ai })), scenarioId: g.scenarioId, conditionId: g.conditionId, bonusId: g.bonusId, difficultyId: g.difficultyId, fog: g.fog, stealth: g.stealth, missions: g.missions, players: this.players });
      $('#btn-end-menu').onclick = () => App.show('menu');
      $('#btn-replay').style.display = this.camp ? 'none' : '';
      $('#btn-again').textContent = this.camp ? 'To the Shelter ▶' : 'New Map';
      if (this.camp) {
        // the results go into the campaign right away (even if the player leaves to the menu)
        const camp = this.camp;
        const rep = CMP.finishMission(camp.c, g);
        camp.c.game = null;
        const got = Object.values(rep.heroes).reduce((s, x) => s + x.talons, 0);
        $('#end-seed').insertAdjacentHTML('beforeend', `<div class="end-camp">Campaign: mission ${rep.missionNo} of ${camp.c.chainLength}${got ? ` · earned ${got} 🎫` : ''}${camp.c.status === 'over' ? ' · <b>the campaign is over</b>' : camp.c.status === 'won' ? ' · <b>campaign completed!</b>' : rep.retreat ? ` · <b>retreat</b> — you will replay the mission (retreats left: ${rep.retreatsLeft})` : ''}</div>`);
        CMP.save(camp.c, camp.slot);
        this.camp = null;
        $('#btn-again').onclick = () => Shelter.show();
      }
      App.show('end');
    },
  };

  // engine events shown by the interface (banners, etc.)
  const UI_FX = {
    async phase(ev) {
      this.refreshTop();
      if (ev.name === 'zombies') { this.refreshHand(); this.refreshActions(); this.defaultHelp(); await Banner.show('ZOMBIE PHASE', 'the dead are coming', 'zombies'); }
      else if (ev.name === 'heroes') { this.refresh(); await Banner.show('ROUND ' + ev.round, E.phaseName(this.g).toUpperCase(), 'round'); }
    },
    async dayphase(ev) {
      this.view.targetDark = this.view._darkFor();
      await Banner.show(ZG.PHASES[ev.phase].name.toUpperCase() + ' FALLS', ev.phase === 2 ? 'the dead are hungry: +1 speed' : 'more of the dead appear', 'night');
    },
    async wave() { this.view.play([{ t: 'wave' }]); await Banner.show('WAVE!', this.g.stealth ? 'the horde knows where you are!' : 'the alarm is overflowing', 'wave'); },
    async turn(ev) {
      const h = this.g.heroes[ev.hero];
      this.refresh();
      if (this.g.missions && h.mission && !h.ai && !h.missionDone && !(this.seenMission || {})[h.idx] && this.canSeeMission(h)) {
        (this.seenMission = this.seenMission || {})[h.idx] = true;
        const m = ZG.Missions.get(h.mission);
        const v = await Modal.show(`<div class="kicker">Secret mission — ${esc(E.heroName(h))}</div><h2>${esc(m.name)}${m.rarity === 'rare' ? ' <small>(rare)</small>' : ''}</h2><p>${esc(m.text)}</p><p><b>Reward — only if you complete it FIRST:</b> ${esc(m.rewardText)}</p><p class="muted">Keep your mission secret: your allies might get there first. <b>You can swap the mission only now</b>, once — after that it stays with you until the end.</p>`, [{ label: 'Swap (only now)', value: 'redraw' }, { label: 'Got it', cls: 'primary', value: 'ok' }]);
        // the window is shown in the middle of event playback (the interface is busy) — swap the mission right in the engine
        if (v === 'redraw') { if (E.redrawMission(this.g, h)) { this.save(); return this.showMission(h); } toast('There are no suitable missions to swap to.'); }
      }
      if (this.g.turn && this.g.turn.bond && !h.ai) toast('🤝 Bond: the first card this turn will trigger with a Chain (if it has such an effect).', 3400);
      if (this.g.turn && this.g.turn.relay) toast(`Relay: the first "${ZG.SUITS[this.g.turn.relay].name}" card will trigger with a Chain!`, 3200);
      if (this.players === 2 && !h.ai && this.lastPlayer !== h.player) {
        this.lastPlayer = h.player;
        await Banner.show('PLAYER ' + h.player, 'turn: ' + E.heroName(h), 'player');
      }
    },
    async event(ev) {
      const e = ZG.Events.get(ev.id);
      ZG.Sound.play('reveal');
      this.refreshTop();
      await Banner.show('EVENT: ' + e.name.toUpperCase(), e.tone > 0 ? 'luck smiles on you' : e.tone < 0 ? 'it is getting worse' : 'stay alert', e.tone < 0 ? 'wave' : 'night');
      toast(e.text, 6000);
    },
    async reveal(ev) {
      this.view.play([ev]);
      if (this.g.phase === 'zombies' && ev.why === 'Horde breakout') await Banner.show('BREAKOUT!', ev.n ? `${ev.n} zombies come out of the fog` : 'the stack turned out empty — they left', 'wave');
      else await sleep(700);
    },
    async bump(ev) { this.view.play([ev]); toast('Around the corner — a wall. No way through here (⚡ spent).', 3000); await sleep(300); },
    async alarm(ev) {
      const a = $('#alarm-track'); a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump'); this.refreshTop();
      if (ev && ev.n > 0) { ZG.Sound.sfx('alarm'); this.view.play([{ t: 'alarm' }]); }
    },
    async draw() { /* the draw animation — in refreshHand */ },
    async gameover() { /* handled after the queue */ },
    async talent(ev) {
      this.refreshHeroes();
      const h = this.g.heroes[ev.hero], t = ZG.Talents.get(ev.id);
      if (h && t && h.ai) { toast(`🤖 ${E.heroName(h)} takes the talent "${t.name}": ${t.text}`, 5000); await sleep(600); }
    },
    async infect(ev) {
      this.view.play([ev]);
      this.refreshHeroes();
      toast(`☣ ${E.heroName(this.g.heroes[ev.hero])}: bitten! Infection ×${ev.n} in hand — cure it before the end of your turn or you will turn (a medkit, Marina or "Cauterize Bite" — 2 ⚡, only in a zone without zombies).`, 5000);
      await sleep(250);
    },
    async mission(ev) {
      const h = this.g.heroes[ev.hero], m = ZG.Missions.get(ev.id);
      this.refreshHeroes();
      if (!ev.rewarded) { toast(`${E.heroName(h)} completed the mission "${m.name}", but not first — no reward.`, 4000); return; }
      await Banner.show(m.traitor ? 'TRAITOR!' : 'SECRET MISSION', `${E.heroName(h)}: "${m.name}" — ${m.rewardText}`, m.traitor ? 'wave' : 'night');
      toast(`${E.heroName(h)} — "${m.name}": ${m.text} Reward: ${m.rewardText}`, 6000);
    },
    // a campaign story insert: an illustration (art/story/<id>.jpg) and fiction text
    async story(ev) {
      const st = ZG.STORIES && ZG.STORIES[ev.id];
      if (!st) return;
      if (ev.pos != null) this.view.play([ev]);
      ZG.Sound.play('reveal');
      this.refresh();
      await Modal.show(`${storyArt(ev.id)}<div class="story-kicker">${esc(st.kicker || '')}</div><h2 class="story-title">${esc(st.title)}</h2><div class="story-text">${esc(st.text)}</div>`, [{ label: 'Next', cls: 'primary' }], null, 'story');
    },
    // a plot twist: the old task failed — a note with the reason and a new task
    async twist(ev) {
      this.view.play([ev]);
      ZG.Sound.play('reveal');
      this.refresh();
      await Modal.show(`${ev.art ? storyArt(ev.art) : ''}<div class="twist-stamp">${esc(ev.title)}</div>
        <div class="twist-note">${esc(ev.text)}</div>
        <div class="twist-arrow">▼</div>
        <div class="twist-task"><span>New task</span>${esc(ev.task)}</div>`, [{ label: 'Move Out', cls: 'primary' }], null, 'twist');
    },
    async packcard(ev) {
      this.view.play([ev]);
      if (ev.pack) { ZG.Sound.play('zombies'); await Banner.show('PACK!', `the dead leap out from behind the trucks — ${ev.who} disturbed them`, 'wave'); }
      else { toast('"Pack/Empty" card: empty.', 2200); await sleep(200); }
    },
    async trophy(ev) {
      this.view.play([ev]);
      const d = ZG.Cards.get(ev.card);
      await Banner.show('TROPHY!', `${E.heroName(this.g.heroes[ev.hero])} gets "${d.name}"`, 'level');
    },
    async wakeall(ev) {
      this.view.play([ev]);
      await Banner.show(ev.title || 'EVERYONE WOKE UP!', ev.text || (ev.why ? `${ev.why}: the dead from the whole block are coming here` : 'the dead from the whole block are coming here'), 'wave');
    },
    async wanderer(ev) {
      this.view.play([ev]);
      await Banner.show('HE IS HERE!', `${ZG.Zombies.get(ev.ztype).name} roams this block`, 'wave');
    },
    async infectTick(ev) { this.view.play([ev]); this.refreshHeroes(); await sleep(300); },
    async turn_hero(ev) {
      this.view.play([ev]);
      const h = this.g.heroes[ev.hero];
      this.refreshHeroes();
      const def = ZG.Heroes.get(h.id);
      if (def.pic && def.turnedPic) await TurnReveal.show(def, `${E.heroName(h)} is no longer human`);
      else await Banner.show('TURNING!', `${E.heroName(h)} is no longer human`, 'wave');
    },
    async play(ev) {
      this.view.play([ev]);
      if (ev.chain) {
        const def = ZG.Cards.get(this.g.cards[ev.card]);
        Banner.chain(ZG.SUITS[def.suit], def.chainText);
      }
      await sleep(120);
    },
    async spawncard(ev) { /* a spawn card — in the log */ },
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
          else t = ' → the highlighted zone';
        }
        const chain = E.chainsNow(g, def) ? ' (Chain!)' : '';
        return `play "${def.name}"${t}${chain}`;
      }
      case 'move': return 'move to the highlighted zone';
      case 'search': return 'search the zone';
      case 'punch': return 'punch';
      case 'ttshot': return 'fire the TT (2 damage, Noise 1)';
      case 'barricade': return 'put up a barricade';
      case 'heal': return 'treat wounds';
      case 'plug': return 'plug the manhole (2 rounds without zombies from here)';
      case 'shut': return 'close the building doors (cover: distant zombies cannot see you)';
      case 'burn': return 'cauterize the bite (Infections in hand → Wounds)';
      case 'cleanse': return 'disinfect the bite (Infections in hand → Wounds)';
      case 'rest': return 'catch your breath';
      case 'shout': return 'shout: wandering zombies within 2 zones go to Gosha';
      case 'foreman': return `site boss: ${E.heroName(g.heroes[a.hero])} will get +1 ⚡ on their turn`;
      case 'give': return `give "${E.cardDef(g, a.card).name}" → ${E.heroName(g.heroes[a.hero])}`;
      case 'scenario': return a.label;
      case 'evac': return 'evacuate!';
      case 'rescue': return 'rescue the survivor';
      case 'pickup': return 'pick up the cargo';
      case 'safe': return 'crack the safe';
      default: return a.t;
    }
  }

  // Enemy behavior in a zone: current status and what the wanderer die will bring (once per zombie phase)
  // the wanderer die: without manholes, on 1–2 the zombie stays
  const wanderDie = (g) => (g.spawnPoints.length ? '<b>1–2</b> — toward the nearest manhole; <b>3–4</b> — toward the board center; <b>5–6</b> — stays.' : '<b>3–4</b> — toward the board center; <b>1–2</b> and <b>5–6</b> — stays (no manholes).');
  function behaviorInfo(g, zs, zuid) {
    const die = g.phase === 'zombies' && g.zs && g.zs.wander ? ` <span class="tt-die">this phase's die: ${g.zs.wander}</span>` : '';
    const rows = {};
    zs.forEach((z) => {
      const d = ZG.Zombies.get(z.type);
      if (d.immobile) return;
      const bandit = E.isBandit(z);
      let st, txt;
      const sp = E.zombieSpeed(g, z);
      if (!g.stealth) { st = 'goes for the enemy'; txt = `Each phase — up to ${sp} ${ZG.util.plural(sp, 'step', 'steps', 'steps')} toward the nearest ${bandit ? 'enemy (a hero or a zombie)' : 'hero, bandit or lure'}. No die roll.`; }
      else if (bandit && z.post) { const r = d.range != null ? d.range : 2; st = z.awake ? 'on post' : 'dozing'; txt = `${d.name} on post: never leaves his spot. While he is in the exit zone, you cannot leave. ` + (z.awake ? `Shoots an enemy in his zone${r ? ` or in a line up to ${r} ${ZG.util.plural(r, 'zone', 'zones', 'zones')} away` : ''}.` : 'Wakes up if he sees a hero or hears noise; while he is not hunting he can be taken out with the "Garrote" or "Knife in the Back".'); }
      else if (d.static) { st = 'on post'; txt = `Does not move, always alert. Shoots the nearest visible hero in a line up to ${d.range} zones away: ${d.dmg} Wounds, blocking does not help (only cover). Notices a silent hero only up close. No die roll.`; }
      else if (d.patrol) {
        const t = E.banditTarget(g, z);
        if (z.awake) { st = 'hunting'; txt = `Like a hunting zombie: up to ${sp} ${ZG.util.plural(sp, 'step', 'steps', 'steps')} toward the nearest visible enemy (a hero or a zombie), otherwise — along the trail. ${t ? 'An enemy in the line of fire — stands and shoots.' : `Hits in his own or an adjacent zone`}: to a hero — a Wound, to a zombie — ${d.foeDmg} damage.`; }
        else { st = 'wandering'; txt = 'The wanderer die, 1 step: <b>1–2</b> — toward his camp; <b>3–4</b> — toward the board center; <b>5–6</b> — stays. If he sees or hears an enemy he starts hunting, like a zombie.'; }
      }
      else if (d.hunter && z.lurk) { st = 'asleep'; txt = 'Lurking, like any other: wakes up if he notices a hero (by the general "Stealth" rules), hears noise, takes a hit — or from the jingle of the keys. While he sleeps, any hero in his zone can take the key from him (1 ⚡).'; }
      else if (d.hunter) { st = 'hunting'; txt = `${z.relentless ? 'On the trail: always knows where you are. ' : ''}Up to ${sp} steps per phase toward the nearest visible enemy; "Hunter's Instinct" — sees quiet heroes too. Hits only in his own zone. No die roll.`; }
      else if (z.lurk && !z.post) { st = 'lurking'; txt = 'Stays put and does not roll the die. Wakes up if it sees a hero' + (bandit ? ' or a zombie' : ' or a bandit') + ', hears noise or gets hit.'; }
      else if (d.crowd) {
        const sw = d.dmg + (z.blood || 0);
        st = z.awake ? 'hunting' : 'wandering';
        txt = `"Blood" ${z.blood || 0}: the "Swing" hits everyone in the zone for ${sw} — heroes, bandits and even his own dead. ` + (z.awake ? `Up to ${sp} ${ZG.util.plural(sp, 'step', 'steps', 'steps')} per phase only toward the living (heroes, bandits) — to the zone with the most of them; lures do not distract him. Chain: pulls the most wounded hero from an adjacent zone to himself.` : `The wanderer die, 1 step: ${wanderDie(g)} If he sees someone living, he starts hunting.`);
      }
      else if (bandit && z.hunt) { st = 'hunter'; txt = 'Raised by the alarm: pursues the squad and shoots an enemy in a line up to 2 zones away. No die roll.'; }
      else if (bandit) {
        const t = E.banditTarget(g, z);
        if (z.awake && t) { st = 'shooting'; txt = `An enemy ${t.shot ? 'in the line of fire' : 'in his zone'}: stands and ${t.shot ? 'shoots' : 'hits'} — 1 Wound to a hero, 2 damage to a zombie, Noise for 2 zones. No die roll.`; }
        else { st = z.awake ? 'on guard' : 'wandering'; txt = `The wanderer die, 1 step: <b>1–4</b> — toward the nearest loot (a crate or a Search token; once next to the loot, he takes it into his bag at once); <b>5–6</b> — stays. If he sees an enemy in a line up to 2 zones away, he starts shooting. Does not chase enemies.`; }
      } else if (z.awake) {
        st = 'hunting';
        txt = `No die roll: up to ${sp} ${ZG.util.plural(sp, 'step', 'steps', 'steps')} per phase toward the nearest visible enemy (a hero, a bandit, a lure), otherwise — to the last trail. Having reached the trail and seen nobody, it wanders again.`;
      } else {
        st = 'wandering';
        txt = `The wanderer die, 1 step: ${wanderDie(g)} If it sees a hero or a bandit, it starts hunting.`;
      }
      if (E.frenzied(g, z)) txt += ' <b>Frenzy:</b> while on the Cross tile — acts twice in the zombie phase.';
      const key = st + '|' + txt; // the same behavior of different enemies — one line
      (rows[key] = rows[key] || { name: d.name, st, txt, n: 0, hl: false }).n++;
      if (z.uid === zuid) rows[key].hl = true;
    });
    const list = Object.values(rows);
    if (!list.length) return '';
    return `<div class="tt-behav"><div class="tt-behav-head">Behavior${die}</div>` + list.map((r) =>
      `<div class="${r.hl ? 'hl' : ''}"><span class="tt-st tt-st-${['wandering', 'lurking', 'on guard', 'asleep', 'dozing'].includes(r.st) ? 'calm' : 'hot'}">${r.st}</span><br><small>${r.txt}</small></div>`).join('') + '</div>';
  }
  // ------------------------------------------------------------ the story insert gallery
  const GALLERY = [
    ['Mission 1 · First Sortie', ['m1_start', 'm1_first_kill', 'm1_night']],
    ['Mission 2 · Motor Depot No. 3', ['m2_start', 'm2_pack', 'm2_rouse', 'm2_keys']],
    ['Mission 3 · The Forest', ['m3_start', 'm3_battery', 'm3_bear', 'm3_twist', 'm3_bear_dead']],
    ['Mission 4 · The Highway', ['m4_start', 'm4_bandit', 'm4_bitten', 'm4_fuel', 'm4_night']],
    ['Mission 5 · The Bridge', ['m5_start', 'm5_sniper', 'm5_forester', 'm5_key', 'm5_saw', 'm5_forester_dead']],
    ['Mission 6 · The Churchyard', ['m6_start', 'm6_frenzy', 'm6_brutes', 'm6_radio']],
    ['Mission 7 · White Swan', ['m7_start', 'm7_scream', 'm7_prisoner', 'm7_rescue', 'm7_executed', 'm7_bride_dead']],
    ['Mission 8 · High Noon and the Finale', ['m8_start', 'm8_butcher', 'm8_blood', 'm8_wolves', 'm8_butcher_dead', 'epilogue']],
    ['The Shelter', ['retreat']],
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
            // "The Signal Failed" — the text is in the task (the twist window), shown here
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
      $$('#gallery-list canvas').forEach((c) => { c.dataset.paused = '1'; }); // while watching one, the others stand still
      ZG.StoryScenes.animate();
      $('#gallery-close').focus();
    },
    close() {
      $('#gallery-view').classList.remove('on');
      $$('#gallery-list canvas').forEach((c) => { delete c.dataset.paused; });
      ZG.StoryScenes.animate();
    },
  };
  // a place for the insert illustration: a picture, and until there is one — a dark splash screen with haze
  function storyArt(id) {
    // an animated scene (code) + a picture over it, if there is one in art/story/
    setTimeout(() => ZG.StoryScenes && ZG.StoryScenes.animate(), 0);
    return `<div class="story-art"><canvas class="story-scene" data-scene="${id}" width="960" height="540"></canvas><img src="art/story/${id}.jpg" alt="" onerror="this.remove()"></div>`;
  }
  function zoneInfo(g, cell, zuid) {
    const c = g.board.cells[cell];
    if (E.hidden(g, cell)) {
      // a closed tile: only what lies on its back is known
      const ti = c.tile, b = g.board;
      const n = E.fogTokens(g, ti);
      const known = [];
      if (g.spawnPoints.some((p) => b.cells[p].tile === ti)) known.push('a manhole');
      const cr = g.crates.filter((x) => !x.opened && b.cells[x.pos].tile === ti).length;
      if (cr) known.push(cr + ' ' + ZG.util.plural(cr, 'crate', 'crates', 'crates'));
      const fb = ZG.Levels.get(g.levelId).fogBreak, lim = fb == null ? 4 : fb;
      const tdef = ZG.Tiles.get(b.tiles[ti].id);
      if (tdef.unique) known.unshift(tdef.name);
      if (g.stackTiles && g.stackTiles.includes(ti)) known.push('a "Pack/Empty" card — a pack may be lurking here');
      return `<div class="tt-head">Unscouted</div><div>Where the walls are and what is inside is unknown. Enter with a basic "Move" from an adjacent zone.</div>` +
        (known.length ? `<div class="tt-gold">On the back: ${known.join(', ')}</div>` : '') +
        (n && !g.hideFogCounts ? `<div class="tt-red">Stack: ${n} face-down ${ZG.util.plural(n, 'token', 'tokens', 'tokens')} — roughly half may turn out to be decoys. At ${lim}+ — a breakout: the tile opens by itself.</div>` : '');
    }
    const parts = [];
    const typeName = c.type === 'building' ? 'Interior' : c.type === 'blocked' ? 'Impassable' : 'Street';
    parts.push(`<div class="tt-head">${typeName}</div>`);
    const zs = E.zombiesAt(g, cell);
    if (zs.length) {
      const by = {};
      zs.forEach((z) => { const d = ZG.Zombies.get(z.type); (by[z.type] = by[z.type] || []).push(z); });
      parts.push('<div class="tt-z">' + Object.entries(by).map(([t, list]) => {
        const d = ZG.Zombies.get(t);
        const st = ''; // the status — in the "Behavior" block below (a single source of truth)
        const bag = list.reduce((a, z) => a.concat(z.bag || []), []);
        const bagTxt = bag.length ? `<br><span class="tt-gold">In the bag: ${bag.some((id) => ZG.Cards.get(id).kind === 'cargo') ? bag.filter((id) => ZG.Cards.get(id).kind === 'cargo').map((id) => '"' + ZG.Cards.get(id).name + '"').join(', ') + (bag.some((id) => ZG.Cards.get(id).kind !== 'cargo') ? ' and loot' : '') : bag.length + ' ' + ZG.util.plural(bag.length, 'find', 'finds', 'finds')} — drops if he is killed</span>` : '';
        return `<div class="${list.some((z) => z.uid === zuid) ? 'hl' : ''}"><b>${d.name}</b> ×${list.length}${st} <span>♥${d.hp}${list.some((z) => z.dmg) ? ' (wounded)' : ''} ✊${d.dmg} 👣${E.zombieSpeed(g, list[0])}</span>${bagTxt}<br><small>${esc(d.text)}</small></div>`;
      }).join('') + '</div>');
    }
    const hs = E.heroesAt(g, cell);
    if (hs.length) parts.push(`<div>Heroes: ${hs.map((h) => E.heroName(h)).join(', ')}</div>`);
    if (g.doors && c.bld) {
      const ent = E.entrances(g, c.bld);
      const open = ent.filter(([x, y]) => !E.doorClosed(g, x, y)).length;
      const loud = g.board.cells.some((x) => x.bld === c.bld && g.noise[x.i]);
      parts.push(open ? `<div class="tt-red">Doors: ${open} of ${ent.length} open — no cover ("Close Doors", 1 ⚡)</div>`
        : loud ? '<div class="tt-red">The doors are closed, but there was noise inside — no cover until the end of the round</div>'
        : '<div class="tt-gold">The doors are closed — cover: zombies more than 1 zone away cannot see the heroes here</div>');
    }
    if (cell === g.exit) parts.push(!E.isComplete(g) ? `<div class="tt-gold">Evacuation: ${esc(E.scenario(g).exitLabel)} — closed until the goal is completed</div>`
      : g.heroes.some((h) => h.onBoard && E.canEvac(g, h)) ? `<div class="tt-gold">Evacuation: ${esc(E.scenario(g).exitLabel)} — OPEN</div>`
        : `<div class="tt-red">Evacuation: ${esc(E.scenario(g).exitLabel)} — closed: ${esc(lcFirst(E.scenario(g).evacBlockedText || 'you cannot leave right now'))}</div>`);
    if (g.frenzyTiles && g.frenzyTiles.includes(g.board.cells[cell].tile)) parts.push('<div class="tt-red">The Shining Cross — "Frenzy": the dead on this tile act twice in the zombie phase</div>');
    if (g.obj && g.obj.camp === cell && g.scenarioId === 'wedding' && !g.obj.known) parts.push('<div class="tt-gold">Something lies by the campfire — come closer (within 2 zones) to make it out</div>');
    if (cell === g.tower) parts.push('<div class="tt-gold">Radio tower</div>');
    if (cell === g.fire) parts.push('<div class="tt-gold">A burning fuel tanker — its glow lights the whole highway</div>');
    if (g.spawnPoints.includes(cell)) parts.push(E.plugged(g, cell) ? `<div class="tt-gold">The manhole is plugged: silent for ${g.plugs[cell] - g.round + 1} more rd.</div>` : '<div class="tt-red">Zombie spawn point</div>');
    const sf = E.safeAt(g, cell);
    if (sf) {
      const left = { v: sf.deck.filter((x) => x === 'valuable').length, e: sf.deck.filter((x) => x === 'empty').length, s: sf.deck.filter((x) => x === 'siren').length };
      const ah = g.active != null ? g.heroes[g.active] : null, noise = E.SAFE_NOISE + (ah && E.jingles(g, ah) ? 1 : 0);
      parts.push(sf.jammed ? `<div class="tt-red">${esc(sf.label)}: jammed — siren</div>` : !sf.deck.length ? `<div>${esc(sf.label)}: empty</div>`
        : `<div class="tt-gold">${esc(sf.label)}: ${sf.deck.length} in the stack — Valuables ${left.v}, "Empty" ${left.e}, "Siren" ${left.s} (siren chance 1 in ${sf.deck.length}). Valuables taken: ${sf.taken}. Cracking — ${E.SAFE_COST} ⚡ and Noise ${noise}${noise > E.SAFE_NOISE ? ' (a Valuable jingles)' : ''}; the Siren — another Noise 3, the safe jams</div>`);
    }
    const cr = g.crates.find((x) => x.pos === cell);
    if (cr) parts.push(cr.opened ? '<div>An opened crate</div>' : '<div class="tt-gold">Crate: search to open it</div>');
    const s = g.search.find((x) => x.pos === cell);
    if (s) parts.push(`<div>Search token${s.kind === 'armory' ? ' (armory: draw 1 more card)' : ''}</div>`);
    if (g.traps.some((t) => t.pos === cell)) parts.push('<div class="tt-red">Tripwire</div>');
    if (g.lures.some((l) => l.pos === cell)) parts.push('<div>Lure</div>');
    if (g.drops.some((d) => d.pos === cell)) parts.push('<div class="tt-gold">Dropped cargo</div>');
    if (g.survivor && g.survivor.pos === cell) parts.push('<div class="tt-gold">A survivor calls for help: "Rescue" for 1 ⚡</div>');
    if (g.hazard && g.hazard.pos === cell) parts.push('<div class="tt-red">Gas leak: explosion at the end of the round (3 damage to zombies, 1 Wound to heroes)</div>');
    if (cr && !cr.opened && cr.known) parts.push('<div class="tt-gold">Radio intercept: cargo here!</div>');
    if (g.noise[cell]) parts.push(`<div>Noise: ${g.noise[cell]}</div>`);
    if (zs.length) parts.push(behaviorInfo(g, zs, zuid)); // enemy behavior — a separate block at the very bottom
    return parts.length > 1 || c.type !== 'street' ? parts.join('') : '';
  }

  // ================================================================ banners
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
      c.innerHTML = 'CHAIN!' + (text ? `<small>${esc(text)}</small>` : '');
      c.style.setProperty('--suit', suit.color);
      c.classList.remove('go'); void c.offsetWidth; c.classList.add('go');
    },
  };

  // ===================================== turning: a living portrait flows into a dead one
  const TurnReveal = {
    async show(def, sub) {
      ZG.Sound.play('zombies');
      const sp = Game.view ? Game.view.speed : 1;
      const o = el('div', 'turn-reveal');
      o.innerHTML = `<div class="tr-card"><img class="tr-live" src="${def.pic}"><img class="tr-dead" src="${def.turnedPic}"><div class="tr-flash"></div></div><div class="tr-title">TURNING!</div><div class="tr-sub">${esc(sub)}</div>`;
      o.style.setProperty('--sp', String(1 / sp));
      document.body.appendChild(o);
      void o.offsetWidth; o.classList.add('go');
      await sleep(2600 / sp);
      o.classList.add('out');
      await sleep(450 / sp);
      o.remove();
    },
  };

  // ======================================================== card flight
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

  // ================================================================= modals
  const Modal = {
    open: false,
    waiters: [],
    escape() {
      if (this.onEscape) this.onEscape();
    },
    show(html, buttons, extraEl, cls) {
      // window queue: if another window (the briefing) is open, the new one waits for it to close instead of replacing it
      if (this.open) return new Promise((r) => this.waiters.push(r)).then(() => this.show(html, buttons, extraEl, cls));
      return new Promise((resolve) => {
        const escBtn = (buttons || []).find((b) => b.label === 'Close' || b.label === 'Cancel');
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
    confirm(html, onYes) { this.show(`<p class="confirm">${html}</p>`, [{ label: 'Cancel', value: false }, { label: 'Yes', value: true, cls: 'primary' }]).then((v) => v && onYes()); },

    async briefing(g) {
      const sc = E.scenario(g);
      const wrap = el('div', 'brief-cards');
      wrap.appendChild(CV.scenarioCard(sc.id, { noSetup: true }));
      wrap.appendChild(CV.conditionCard(g.conditionId));
      const steps = sc.goals(g).map((x) => `<li>${esc(x.text)}${x.note ? ` <small class="muted">(${esc(x.note)})</small>` : ''}</li>`).join('');
      await this.show(`<div class="kicker">Briefing</div><h2>${esc(sc.name)}</h2><ol class="brief-steps">${steps}</ol>
        ${g.special && g.special.length ? `<div class="special-box"><b>⚠ Special mission rules</b><ul>${g.special.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
        ${g.bonusId ? `<p>★ Bonus objective (3rd star): <b>${esc(ZG.Bonuses.get(g.bonusId).name)}</b> — ${esc(ZG.Bonuses.get(g.bonusId).text)}</p>` : ''}
        <p class="muted">On the board: <b>magnifiers</b> are search tokens, <b>crates</b> are possible cargo, <b>manholes</b> are spawn points${g.safes && g.safes.length ? ', <b>the steel box with a dial</b> is a safe' : ''}. Hover over zones for details.</p>`, [{ label: 'To battle', cls: 'primary', modal: true }], wrap, 'wide');
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
        info.innerHTML = `Blocked by cards: <b>${sum}</b> / ${p.remaining} → you take <b class="${taken ? 'bad' : 'good'}">${taken} damage</b>` + (taken ? ` <small>(per die: 1–2 ☣ Infection, 3–6 Wound)</small>` : '') + (left <= 0 ? ' <b class="bad">— THE HERO FALLS!</b>' : '')
          + `<br>Fatigue: <b class="${ex >= E.EXHAUST_AT ? 'bad' : ''}">${ex} / ${E.EXHAUST_AT}</b>` + (ex >= E.EXHAUST_AT ? ' — <b class="bad">EXHAUSTED</b>: hand −1, basic actions unavailable until “Catch Breath”' : '');
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
      return this.show(`<div class="kicker red">Attack!</div><h2>${esc(E.heroName(h))}: ${p.incoming} damage</h2>
        <p>Attackers: ${esc(attackers.join(', '))}. ${p.auto ? `Block and gear have already stopped <b>${p.auto}</b>.` : ''}<br>Discard shield cards to block damage: they go to <b>Fatigue</b>, not the discard pile. Each unblocked damage puts a Wound card into your discard pile.</p>`,
      [{ label: 'Auto', value: 'auto' }, { label: 'Confirm', value: 'ok', cls: 'primary' }], holder, 'wide').then((v) => {
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
        this.show(`<div class="kicker gold">Level up</div><h2>${esc(E.heroName(h))} toughens up</h2><p>Choose a talent — it stays until the end of the game.</p>`, [], wrap, 'wide');
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
        this.show(`<div class="kicker gold">Search</div><h2>${esc(E.heroName(h))} finds…</h2><p>Take one card into your hand. The rest go to the bottom of the loot deck.</p>`, [], wrap, 'wide');
      });
    },

    pickHero(g, idxs) {
      const wrap = el('div', 'pick-heroes');
      return new Promise((resolve) => {
        idxs.forEach((i) => {
          const h = g.heroes[i];
          const b = el('button', 'btn', esc(E.heroName(h)) + ` <small>(${E.woundCount(g, h)} ${ZG.util.plural(E.woundCount(g, h), 'wound', 'wounds')}${E.infectCount(g, h) ? `, ☣${E.infectCount(g, h)}` : ''})</small>`);
          b.onclick = () => { this.close(); resolve(i); };
          wrap.appendChild(b);
        });
        this.show('<h2>Choose a hero</h2>', [{ label: 'Cancel', value: null }], wrap).then(resolve);
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
      return this.show(`<h2>Give a card</h2><p>To: ${heroes.length === 1 ? esc(E.heroName(g.heroes[hero])) : 'choose below'}.</p>`,
        [{ label: 'Cancel', value: null }, { label: 'Give', value: 'ok', cls: 'primary', check: () => card != null }], wrap, 'wide')
        .then((v) => (v ? { card, hero } : null));
    },

    zoomCard(def) {
      const c = CV.card(def);
      c.classList.add('zoomed');
      this.show('', [{ label: 'Close' }], c, 'zoom');
    },

    heroInfo(id, h) {
      const c = CV.heroCard(id, { bio: true, talents: true });
      c.classList.add('big');
      this.show('', [{ label: 'Close' }], c, 'wide');
    },
  };

  // ======================================================= campaign: slots
  const Slots = {
    show() { this.render(); App.show('slots'); },
    render() {
      const box = $('#slot-list');
      box.innerHTML = '';
      CMP.list().forEach(({ slot, c }) => {
        const d = el('div', 'camp-slot' + (c ? ' ' + c.status : ' empty'));
        d.appendChild(el('div', 'slot-n', 'Slot ' + slot));
        const body = el('div', 'slot-body');
        if (!c) body.innerHTML = '<span class="muted">empty</span>';
        else {
          const st = { ready: 'in the shelter', mission: 'mission in progress', over: 'ended', won: 'completed!' }[c.status];
          body.innerHTML = `<b>Mission ${Math.min(c.chainLength, c.missionNo + 1)} of ${c.chainLength}</b> · ${st} · ${esc(ZG.Difficulties.get(c.difficultyId).name)}
            <div class="slot-heroes">${c.roster.map((h) => `<span>${esc(ZG.Heroes.get(h.id).name)} <small>lv.${h.level}</small></span>`).join('')}${c.fallen.map((id) => `<span class="dead">✝ ${esc(ZG.Heroes.get(id).name)}</span>`).join('')}</div>
            <small class="muted">${new Date(c.updated).toLocaleString('en-US')}</small>`;
        }
        d.appendChild(body);
        const btns = el('div', 'slot-btns');
        const add = (label, cls, fn) => { const b = el('button', 'btn ' + cls, label); b.onclick = fn; btns.appendChild(b); };
        if (!c) add('New campaign', 'primary', () => App.newCampaign(slot));
        else {
          add(c.status === 'over' || c.status === 'won' ? 'Summary' : 'Continue', 'primary', () => Slots.open(slot));
          add('Delete', 'ghost', async () => {
            const v = await Modal.show('<h2>Delete the campaign?</h2><p>Progress in this slot will be lost for good.</p>', [{ label: 'Delete', value: 'del' }, { label: 'Cancel', cls: 'primary' }]);
            if (v === 'del') { CMP.remove(slot); this.render(); }
          });
        }
        d.appendChild(btns);
        box.appendChild(d);
      });
    },
    open(slot) {
      const c = CMP.load(slot);
      if (!c) return toast('The slot is empty.');
      App.campaign = { c, slot };
      if (c.status === 'mission' && c.game) { const g = c.game; c.game = null; Game.resume({ g, players: c.players }, App.campaign); }
      else if (c.status === 'mission' && c.current) { const sq = c.current.squad; c.status = 'ready'; Game.startCampaignMission(sq); } // an unsaved mission restarts with the same squad (same map)
      else Shelter.show();
    },
  };

  // ======================================================= campaign: the shelter
  const LIST_NAME = { equip: 'Loadout', chest: 'Chest', junk: 'Junk' };
  const Shelter = {
    squad: [],
    show() {
      const c = App.campaign.c;
      const prev = (c.lastSquad || []).filter((id) => CMP.hero(c, id));
      this.squad = prev.concat(c.roster.map((h) => h.id).filter((id) => !prev.includes(id))).slice(0, c.squad);
      $('#btn-shelter-menu').onclick = () => App.show('menu');
      if (ZG.Sound._musicKey !== 'shelter') ZG.Sound.music('shelter'); // shelter atmosphere
      this.render();
      App.show('shelter');
    },
    save() { CMP.save(App.campaign.c, App.campaign.slot); },
    act(fn) { const err = fn(); if (err) toast(err); else this.save(); this.render(); },
    async go() {
      const c = App.campaign.c;
      if (!this.squad.length) return toast('Pick at least one hero for the squad.');
      const lo = CMP.minSquad(c);
      if (this.squad.length < lo) return toast(`You must take at least ${lo} ${ZG.util.plural(lo, 'hero', 'heroes')}: that many started the campaign and are still on their feet.`);
      if (this.squad.length < c.squad) {
        const v = await Modal.show(`<h2>Short squad</h2><p>${this.squad.length} of ${c.squad} are heading out: there are no more heroes on their feet. The mission will be scaled for <b>${this.squad.length}</b> ${ZG.util.plural(this.squad.length, 'hero', 'heroes')}.</p>`, [{ label: 'Go anyway', value: 'go' }, { label: 'Cancel', cls: 'primary' }]);
        if (v !== 'go') return;
      }
      if (c.players === 2) {
        const sq = this.squad.map((id) => CMP.hero(c, id));
        if (!sq.some((h) => h.player === 1 && !h.ai) || !sq.some((h) => h.player === 2 && !h.ai)) return toast('Each player needs a hero in the squad that is not AI-controlled.');
      }
      const empty = this.squad.map((id) => CMP.hero(c, id)).filter((h) => !h.equip.length && h.chest.length);
      if (empty.length) {
        const v = await Modal.show(`<h2>Empty loadout</h2><p>${empty.map((h) => esc(ZG.Heroes.get(h.id).name)).join(', ')}: the chest has cards, but nothing was taken on the run. Take the best cards from the chest?</p><p class="muted">Equipped cards wear out: after the run they become “about to break”.</p>`,
          [{ label: 'Take the best', value: 'fill', cls: 'primary' }, { label: 'Go anyway', value: 'go' }, { label: 'Cancel' }]);
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
    // shelter event phase: after a mission a card is drawn; a hero decides (the AI decides itself, a player — in this window)
    // the “Pulling out” scene — once per campaign, on the first retreat
    async showRetreat(c) {
      const st = ZG.STORIES && ZG.STORIES.retreat;
      if (this._eventOpen || c.retreatSeen) return;
      c.retreatSeen = true; this.save();
      if (!st) return this.render();
      this._eventOpen = true;
      await Modal.show(`${storyArt('retreat')}<div class="story-kicker">${esc(st.kicker)}</div><h2 class="story-title">${esc(st.title)}</h2><div class="story-text">${esc(st.text)}</div>`, [{ label: 'Next', cls: 'primary' }], null, 'story');
      this._eventOpen = false;
      this.render(); // next — the shelter event card and the trader
    },
    async showEvent(c) {
      const e = c.eventDraw; if (!e || e.seen || this._eventOpen) return;
      this._eventOpen = true;
      const def = CMP.eventDef(e.id);
      const nm = (id) => esc(ZG.Heroes.get(id).name);
      const head = `<div class="kicker">Shelter event · card from the deck</div>`;
      const card = (title, body, cls) => `<div class="ev-card ${cls || ''}"><div class="ev-back"></div><div class="ev-face"><div class="ev-title">${esc(title)}</div><div class="ev-text">${body}</div></div></div>`;
      if (!def) {
        await Modal.show(head + card('A quiet night', esc(e.result || ''), 'blank'), [{ label: 'Next', cls: 'primary' }], null, 'event');
      } else if (e.skipped) {
        await Modal.show(head + card(def.name, `<p>${esc(def.text)}</p><p class="muted">${esc(e.result)}</p>`), [{ label: 'Next', cls: 'primary' }], null, 'event');
      } else if (!e.done) {
        const opts = CMP.eventOptions(c);
        const v = await Modal.show(head + card(def.name, `<p>${esc(e.story)}</p><p class="muted">${esc(def.text)}</p>`),
          opts.map((o, i) => ({ label: o.label + (o.off ? ' — not enough 🎫' : ''), value: o.key, cls: i === 0 ? 'primary' : '', modal: true, check: () => (o.off ? (toast('Not enough tickets.'), false) : true) })), null, 'event');
        const err = CMP.resolveEvent(c, v);
        if (err) toast(err);
        await Modal.show(head + card(def.name, `<p>${esc(e.result || '')}</p>`), [{ label: 'Next', cls: 'primary' }], null, 'event');
      } else {
        await Modal.show(head + card(def.name, `<p>${esc(e.story)}</p><p><b>${nm(e.decider)}${e.byAI ? ' (AI)' : ''}: “${esc(e.choice)}”.</b></p><p>${esc(e.result || '')}</p>`), [{ label: 'Next', cls: 'primary' }], null, 'event');
      }
      e.seen = true;
      this._eventOpen = false;
      this.save();
      this.render();
    },
    // campaign epilogue: the final scene and a summary of the journey
    epilogue(c) {
      const st = ZG.STORIES && ZG.STORIES.epilogue;
      if (!st) return;
      // the epilogue is assembled from the chapters of completed missions (ZG.EPILOGUE in data/campaign.js)
      const ep = ZG.epilogueFor(c);
      const facts = [];
      facts.push(`Survived: ${c.roster.map((h) => `${esc(ZG.Heroes.get(h.id).name)} (lv. ${h.level})`).join(', ') || 'no one'}`);
      if (c.fallen.length) facts.push(`Did not make it: ${c.fallen.map((id) => '✝ ' + esc(ZG.Heroes.get(id).name)).join(', ')}`);
      ep.facts.forEach((t) => facts.push(esc(t)));
      if (c.wanderers.length) facts.push(`Somewhere behind, the turned still roam: ${c.wanderers.map((id) => esc(ZG.Zombies.get('turned_' + id).name)).join(', ')}.`);
      Modal.show(`${storyArt('epilogue')}<div class="story-kicker">${esc(st.kicker)}</div><h2 class="story-title">${esc(st.title)}</h2><div class="story-text">${esc(ep.text)}</div><ul class="epi-facts">${facts.map((t) => `<li>${t}</li>`).join('')}</ul>`, [{ label: 'The end of the road', cls: 'primary' }], null, 'story');
    },
    render() {
      const c = App.campaign.c;
      const done = c.status === 'over' || c.status === 'won';
      $('#shelter-sub').innerHTML = done
        ? `<b class="${c.status}">${c.status === 'won' ? 'CAMPAIGN COMPLETE' : 'CAMPAIGN OVER'}</b> — ${esc(c.endReason || '')}`
        : `${c.report && c.report.retreat ? 'Replay: ' : ''}Next up: mission ${c.missionNo + 1} of ${c.chainLength}${CMP.missionDef(c).name ? ': <b>' + esc(CMP.missionDef(c).name) + '</b>' : ' (random)'} · squad: ${CMP.minSquad(c) < CMP.MAX_SQUAD ? `${CMP.minSquad(c)}–${Math.min(CMP.MAX_SQUAD, c.roster.length)}` : CMP.MAX_SQUAD} (difficulty scales with heroes sent) · ${esc(ZG.Difficulties.get(c.difficultyId).name)} · retreats: ${CMP.retreatsLeft(c)}${c.wanderers.length ? ` · <span class="bad">roaming: ${c.wanderers.map((id) => esc(ZG.Zombies.get('turned_' + id).name)).join(', ')}</span>` : ''}`;
      $('#btn-shelter-go').style.display = '';
      $('#btn-shelter-go').onclick = done ? () => App.newCampaign(App.campaign.slot) : () => this.go();
      $('#btn-shelter-go').textContent = done ? 'New campaign in this slot' : `Head out: mission ${c.missionNo + 1} ▶`;
      if (done) $('#shelter-sub').insertAdjacentHTML('beforeend', `<div class="camp-sum">Missions completed: <b>${c.missionNo - (c.status === 'over' ? 1 : 0)} of ${c.chainLength}</b>${c.fallen.length ? ` · lost: ${c.fallen.map((id) => '✝ ' + esc(ZG.Heroes.get(id).name)).join(', ')}` : ''}${c.roster.length ? ` · survived: ${c.roster.map((h) => `${esc(ZG.Heroes.get(h.id).name)} (lv. ${h.level})`).join(', ')}` : ''}${c.roster.length ? `<br>Survivors' savings: <b>${c.roster.reduce((n, h) => n + h.talons, 0)} 🎫</b> (${c.roster.map((h) => `${esc(ZG.Heroes.get(h.id).name)} ${h.talons}`).join(', ')})` : ''}${c.haul ? ` · Valuables from safes over the campaign: <b>${c.haul} 🎫</b>` : ''}</div>`);
      this.renderReport(c);
      if (c.status === 'won' && c.epilogueSeen) { const eb = el('button', 'rep-toggle', '📜 Epilogue'); eb.onclick = () => this.epilogue(c); $('#shelter-sub').appendChild(eb); }
      if (c.status === 'won' && !c.epilogueSeen) { c.epilogueSeen = true; this.save(); setTimeout(() => this.epilogue(c), 300); }
      if (c.report && c.report.retreat && !c.retreatSeen && !done && !this._eventOpen) setTimeout(() => this.showRetreat(c), 300); // the first retreat of the campaign — the “Pulling out” scene
      else if (c.eventDraw && !c.eventDraw.seen && !done && !this._eventOpen) setTimeout(() => this.showEvent(c), 400);
      else if (!done && CMP.trader(c) && c.traderSeen !== c.missionNo && !this._eventOpen) setTimeout(() => this.showTrader(c), 450); // the trader — after the event card
      const md = CMP.missionDef(c);
      if (!done && md.brief) $('#shelter-report').insertAdjacentHTML('beforeend', `<div class="rep-brief">${esc(md.brief)}</div>`);
      if (!done && md.special && md.special.length) $('#shelter-report').insertAdjacentHTML('beforeend', `<div class="special-box"><b>⚠ Special mission rules</b><ul>${md.special.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`);
      // the report and briefing are collapsed to one line (expand on click) — heroes and cards are visible at once
      const rp = $('#shelter-report');
      rp.classList.toggle('collapsed', !this.reportOpen && rp.children.length > 1);
      if (rp.children.length > 1) {
        const tg = el('button', 'rep-toggle', this.reportOpen ? 'Collapse ▴' : 'Report and briefing ▾');
        tg.onclick = () => { this.reportOpen = !this.reportOpen; this.render(); };
        rp.firstElementChild.appendChild(tg);
      }
      const box = $('#shelter-heroes');
      box.innerHTML = '';
      if (!c.roster.length) { this.renderHire(c, done); return; }
      if (!CMP.hero(c, this.sel)) this.sel = c.roster[0].id;
      // hero tabs: switching, and a drop target for giving a card (drag a card onto a tab)
      const tabs = el('div', 'sh-tabs');
      c.roster.forEach((h) => {
        const def = ZG.Heroes.get(h.id);
        const t = el('button', 'sh-tab' + (h.id === this.sel ? ' on' : '') + (this.squad.includes(h.id) ? ' in-squad' : ''));
        t.dataset.hero = h.id;
        t.style.setProperty('--hero', def.color);
        t.innerHTML = `<img src="${def.face || CV.artURL(def.art, 96, 96, {})}"><span><b>${esc(def.name)}</b><small>lv. ${h.level} · ♥ ${CMP.hp(h)}/${CMP.baseHp(h) + CMP.hpTalents(h)} · 🎫 ${h.talons}</small></span>${this.squad.includes(h.id) ? '<i class="sq">✓</i>' : ''}${h.ai ? '<i class="ai">🤖</i>' : ''}`;
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
      if (!r) { box.innerHTML = '<div class="rep-head">The squad is assembled. Before the first run you can distribute gear and choose who controls each hero.</div>'; return; }
      const name = (id) => esc(ZG.Heroes.get(id).name);
      if (r.joined) ZG.unlockHero(r.joined); // a rescued hero is unlocked for single games too
      box.innerHTML = `<div class="rep-head ${r.win ? 'win' : 'lose'}"><b>Mission ${r.missionNo}: ${r.win ? 'complete' : r.retreat ? 'retreat' : 'failed'}</b> <span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</span> — ${esc(r.reason || '')}</div>
        ${r.lost.map((l) => `<div class="rep-lost">✝ ${name(l.id)} — ${l.turned ? 'turned and now roams the district' : 'fell and is gone for good'}</div>`).join('')}
        ${r.joined ? `<div class="rep-bond">🔓 ${name(r.joined)} “${esc(ZG.Heroes.get(r.joined).nick)}” is rescued and joins the squad — a new hero in the shelter.</div>` : ''}
        ${(r.rel || []).filter((x) => CMP.hero(c, x.a) && CMP.hero(c, x.b)).map((x) => `<div class="rep-bond${x.to < x.from ? ' down' : ''}">${x.to >= 3 && x.from < 3 ? '🤝' : x.to <= -3 && x.from > -3 ? '⚔' : x.to > x.from ? '▲' : '▼'} ${name(x.a)} and ${name(x.b)}: ${CMP.relName(x.to)} (${x.from > 0 ? '+' : ''}${x.from} → ${x.to > 0 ? '+' : ''}${x.to}) <small>${esc(x.why.join(', '))}</small>${x.to >= 3 && x.from < 3 ? ' — they now share a <b>Bond</b>' : ''}</div>`).join('')}
        ${(r.hired || []).map((x) => `<div class="rep-bond">🤝 ${name(x.payer)} hires a recruit: ${name(x.id)} “${esc(ZG.Heroes.get(x.id).nick)}”.</div>`).join('')}
        ${r.retreat ? `<div class="rep-lost">↩ The squad fell back to the shelter — mission ${r.missionNo} must be replayed. Retreats left: ${r.retreatsLeft}.</div>` : ''}
        ${r.hint ? `<div class="rep-hint">${esc(r.hint)}</div>` : ''}
        ${r.finalSale && r.finalSale.length ? `<div class="rep-bond">The fence, one last time: ${r.finalSale.map((x) => `${name(x.hero)} +${x.price} 🎫`).join(', ')}</div>` : ''}
        <div class="rep-heroes">${Object.entries(r.heroes).filter(([id]) => CMP.hero(c, id)).map(([id, x]) => { const h = CMP.hero(c, id); return `<div><b>${name(id)}</b>: ${x.lines.map(esc).join(' · ') || '—'} <span class="rep-sum">→ ♥ ${CMP.hp(h)}/${CMP.baseHp(h)} · 🎫 ${h.talons} · morale ${h.morale}</span></div>`; }).join('')}</div>`;
    },
    // a hero's relations with the other shelter heroes
    relLine(c, h) {
      const tips = { 'Friends': 'Bond: if a friend ends their turn in the hero’s tile, the first card of the hero’s next turn triggers its Chain. A friend’s death — −2 morale.', 'Pals': 'They give each other cards without the “once per turn” limit.', 'Dislike': 'They do not give each other cards.', 'Enemies': 'They do not give cards; ending a turn in an enemy’s tile costs that enemy −1 ⚡. In the same squad — −1 morale each after the mission. An enemy’s death — +2 morale.' };
      const items = c.roster.filter((o) => o !== h).map((o) => { const n = CMP.rel(c, h.id, o.id); return { o, n, name: CMP.relName(n) }; }).filter((x) => x.n !== 0)
        .map((x) => `<span class="rel r${x.n > 0 ? 'p' : 'n'}${Math.abs(x.n)}" title="${esc(tips[x.name] || '')}">${x.n >= 3 ? '🤝' : x.n <= -3 ? '⚔' : x.n > 0 ? '▲' : '▼'} ${esc(ZG.Heroes.get(x.o.id).name)}: ${x.name} (${x.n > 0 ? '+' : ''}${x.n})</span>`);
      return items.length ? `<div class="sh-bond">${items.join(' ')}</div>` : '';
    },
    heroPanel(c, h, done) {
      const def = ZG.Heroes.get(h.id), CFG = ZG.CAMPAIGN;
      const next = CFG.xpLevels.find((v) => h.xp < v);
      const m = h.morale, M = CFG.morale;
      const pips = Array.from({ length: M.max }, (_, i) => `<i class="${i < m ? 'on' : ''}"></i>`).join('');
      const temp = m <= 0 ? '2× “Despair”' : m <= M.low ? '“Despair”' : m >= M.max ? '“Courage”' : '';
      const wrap = el('div', 'sh-main');
      wrap.style.setProperty('--hero', def.color);
      const top = el('div', 'sh-top2');
      top.innerHTML = `
        <img class="sh-pic" src="${def.pic || CV.artURL(def.art, 200, 200, {})}">
        <div class="sh-info">
          <div class="sh-name"><b>${esc(def.name)}</b> <small>“${esc(def.nick)}” · ${esc(def.role)}</small><span class="sh-talons" title="Personal tickets">🎫 ${h.talons}</span></div>
          <div class="sh-lvl">Level ${h.level} · 🎖 ${h.xp}${next ? ' / ' + next : ''}</div>
          <div class="sh-stats"><span title="Grit for the next mission (injuries lower it)">♥ ${CMP.hp(h)} / ${CMP.baseHp(h) + CMP.hpTalents(h)}</span>
            <span class="sh-morale m${m <= M.low ? 'low' : m >= M.max ? 'max' : ''}" title="Morale ${m} of ${M.max}">Morale <span class="pips">${pips}</span>${temp ? ` <small>${temp}</small>` : ''}</span></div>
          ${this.relLine(c, h)}
          ${h.talents.length ? `<div class="sh-tal">${h.talents.map((t) => esc(ZG.Talents.get(t).name)).join(' · ')}</div>` : ''}
          ${h.debt ? `<div class="sh-debt">Owes ${esc(ZG.Heroes.get(h.debt.to).name)}: half of star tickets for ${h.debt.left} more ${ZG.util.plural(h.debt.left, 'mission', 'missions')}</div>` : ''}
          <div class="sh-actions"></div>
        </div>`;
      wrap.appendChild(top);
      const acts = $('.sh-actions', top);
      if (!done) {
        const add = (label, fn, cls) => { const b = el('button', 'btn small ' + (cls || ''), label); b.onclick = fn; acts.appendChild(b); };
        const inSq = this.squad.includes(h.id);
        add(inSq ? '✓ In squad' : 'Add to squad', () => {
          if (inSq) this.squad = this.squad.filter((x) => x !== h.id);
          else if (this.squad.length >= CMP.MAX_SQUAD) return toast(`No more than ${CMP.MAX_SQUAD} heroes go on a run. Remove someone from the squad first.`);
          else this.squad.push(h.id);
          this.render();
        }, inSq ? 'primary' : '');
        const ctl = h.ai ? '🤖 AI' : c.players === 2 ? `🎮 Player ${h.player}` : '🎮 Player';
        add(ctl, () => this.act(() => {
          const err = c.players === 2
            ? (h.ai ? CMP.setControl(c, h.id, 1, false) : h.player === 1 ? CMP.setControl(c, h.id, 2, false) : CMP.setControl(c, h.id, null, true))
            : CMP.setControl(c, h.id, null, !h.ai);
          if (!err && h.ai) CMP.autoManage(c, h.id); // the AI arranges its cards right away
          return err;
        }));
        if (h.injury > 0) add(`Heal +1 ♥ (${CFG.prices.heal} 🎫)`, () => this.act(() => CMP.heal(c, h.id)));
        if (CMP.canTrain(c, h)) add(`🎯 Range: +1 🎖 (${CFG.prices.train} 🎫)`, () => this.act(() => CMP.train(c, h.id)));
        if (h.ai) add('🤖 Arrange cards', () => this.act(() => CMP.autoManage(c, h.id)));
      }
      // personal shelter buildings: built ones in colour, the rest as silhouettes with a price
      const blds = el('div', 'sh-blds');
      ZG.Buildings.all().forEach((b) => {
        const have = CMP.built(h, b.id), poor = h.talons < b.cost;
        const t = el('button', 'sh-bld' + (have ? ' have' : poor ? ' poor' : ''));
        t.title = b.text;
        t.innerHTML = `<img src="${CV.artURL('bld_' + b.id, 120, 120, { off: !have })}"><b>${esc(b.name)}</b><small>${have ? '✓ built' : `${b.cost} 🎫`}</small>`;
        t.onclick = async () => {
          if (have || done) return Modal.show(`<h2>${esc(b.name)}</h2><p>${esc(b.text)}</p>`, [{ label: 'Close', cls: 'primary' }]);
          if (poor) return toast(`${b.name}: needs ${b.cost} 🎫, ${ZG.Heroes.get(h.id).name} has ${h.talons}.`);
          const v = await Modal.show(`<h2>Build: ${esc(b.name)}</h2><p>${esc(b.text)}</p><p>Cost: <b>${b.cost} 🎫</b> from personal savings (${h.talons} 🎫).</p>`, [{ label: `Build (${b.cost} 🎫)`, value: 'y', cls: 'primary' }, { label: 'Cancel' }]);
          if (v) this.act(() => CMP.build(c, h.id, b.id));
        };
        blds.appendChild(t);
      });
      const bwrap = el('div', 'sh-bwrap');
      bwrap.appendChild(el('div', 'sh-row-h', 'Personal shelter'));
      bwrap.appendChild(blds);
      top.appendChild(bwrap);
      // card zones: drag cards with the mouse between zones; click opens the card menu
      const zones = el('div', 'sh-zones');
      ['equip', 'chest', 'junk'].forEach((list) => {
        const capN = list === 'equip' ? CMP.equipCap(h) : list === 'chest' ? CMP.chestCap(h) : null;
        const z = el('div', 'sh-zone ' + list);
        const sum = list === 'junk' ? h.junk.reduce((s2, it) => s2 + (CMP.price(it.id) || 0), 0) : 0;
        const vals = list === 'junk' ? h.junk.filter((it) => CMP.isValuable$(it.id)).length : 0;
        z.appendChild(el('div', 'sh-row-h', `${LIST_NAME[list]}${capN != null ? ` ${h[list].length}/${capN}` : ''}${list === 'equip' ? ' <small>— shuffled into the deck for the mission</small>' : list === 'junk' && h.junk.length ? ` <small>— sold on heading out ≈ +${sum} 🎫${vals ? ` and ${vals} ${ZG.util.plural(vals, 'Valuable', 'Valuables')} (${CMP.VAL_MIN}–${CMP.VAL_MAX} 🎫 each)` : ''}</small>` : ''}`));
        const drop = el('div', 'sh-drop');
        drop.dataset.list = list;
        h[list].forEach((it, i) => {
          const d = ZG.Cards.get(it.id);
          const w = el('div', 'sh-cw' + (it.worn ? ' worn' : ''));
          w.dataset.list = list; w.dataset.i = i;
          w.appendChild(CV.card(d));
          const p = CMP.price(it.id);
          w.appendChild(el('div', 'sh-price', CMP.isValuable$(it.id) ? `🎫 ${CMP.VAL_MIN}–${CMP.VAL_MAX}?` : p == null ? 'not for sale' : `🎫 ${p}`));
          if (it.worn) w.appendChild(el('div', 'sh-worn', '⚠ about to break'));
          drop.appendChild(w);
        });
        if (capN != null) for (let k = h[list].length; k < capN; k++) drop.appendChild(el('div', 'sh-empty', list === 'equip' ? 'loadout slot' : 'chest slot'));
        if (!h[list].length && capN == null) drop.appendChild(el('div', 'sh-empty wide', 'drag here what you want to sell'));
        z.appendChild(drop);
        zones.appendChild(z);
      });
      const tr = !done && CMP.trader(c);
      if (tr) wrap.appendChild(this.traderShelf(c, h, tr));
      wrap.appendChild(zones);
      return wrap;
    },
    // the travelling trader's shelf: goods for the selected hero (any number of copies)
    traderShelf(c, h, tr) {
      const box = el('div', 'sh-zone sh-trader');
      const mine = (c.traderLog || []).filter((x) => x.no === c.missionNo && x.hero === h.id);
      box.appendChild(el('div', 'sh-row-h', `🛒 ${esc(tr.name)} <small>— only now, before the mission; these goods are found nowhere else. Purchases go to the loadout (if there is room) or the chest.</small>`));
      const row = el('div', 'sh-drop');
      tr.stock.forEach((w) => {
        const d = ZG.Cards.get(w.id), n = mine.filter((x) => x.id === w.id).length;
        const cw = el('div', 'sh-ware');
        cw.appendChild(CV.card(d));
        const b = el('button', 'btn small ' + (h.talons >= w.price ? 'primary' : 'poor'), `Buy · ${w.price} 🎫`);
        b.onclick = () => (h.talons < w.price ? toast(`Not enough tickets: ${ZG.Heroes.get(h.id).name} has ${h.talons} 🎫.`) : this.act(() => CMP.buy(c, h.id, w.id)));
        cw.appendChild(b);
        if (n) cw.appendChild(el('div', 'sh-price', `bought: ${n}`));
        if (h.equip.concat(h.chest).some((it) => it.id === w.id)) cw.appendChild(el('div', 'sh-price', 'already owned — a second one does not stack (a spare in case it breaks)'));
        row.appendChild(cw);
      });
      box.appendChild(row);
      return box;
    },
    // the trader's arrival is a separate event (not a card from the shelter event deck), once before a mission
    async showTrader(c) {
      const tr = CMP.trader(c);
      if (!tr || c.traderSeen === c.missionNo || this._eventOpen) return;
      this._eventOpen = true;
      const ai = (c.traderLog || []).filter((x) => x.no === c.missionNo && x.ai);
      const wares = tr.stock.map((w) => { const d = ZG.Cards.get(w.id); return `<li><b>${esc(d.name)}</b> — ${w.price} 🎫. ${esc(d.text.replace(/^Gear\. /, ''))}</li>`; }).join('');
      const bought = ai.length ? `<p class="muted">The AI has already chosen: ${ai.map((x) => `${esc(ZG.Heroes.get(x.hero).name)} — “${esc(ZG.Cards.get(x.id).name)}”`).join(', ')}.</p>` : '';
      await Modal.show(`<div class="kicker">Special event · before the mission</div><div class="ev-card"><div class="ev-back"></div><div class="ev-face"><div class="ev-title">${esc(tr.name)}</div><div class="ev-text"><p>${esc(tr.text)}</p><ul>${wares}</ul><p class="muted">Each hero buys any number of copies with their own tickets. The trader's shelf is in the hero panel until you head out.</p>${bought}</div></div></div>`, [{ label: 'To the stall', cls: 'primary' }], null, 'event');
      c.traderSeen = c.missionNo;
      this._eventOpen = false;
      this.save();
      this.render();
    },
    // dragging cards with mouse/finger: between a hero's zones or onto another hero's tab (into their chest)
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
            // near the screen edge the shelter page scrolls by itself (so a card can reach a hero tab or the chest)
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
      ['equip', 'chest', 'junk'].filter((l) => l !== list).forEach((l) => btns.push({ label: { equip: 'To loadout', chest: 'To chest', junk: 'To junk' }[l], value: 'mv:' + l }));
      const p = CMP.price(it.id), val = CMP.isValuable$(it.id);
      if (val) btns.push({ label: `Sell to the fence (${CMP.VAL_MIN}–${CMP.VAL_MAX} 🎫, price unknown)`, value: 'sell' });
      else if (p != null) btns.push({ label: `Sell (+${p} 🎫)`, value: 'sell' });
      if (it.worn) btns.push({ label: `Repair (${CMP.repairPrice(it.id)} 🎫)${CMP.built(h, 'workshop') ? '' : ' — needs a Workshop'}`, value: 'repair' });
      if (c.roster.length > 1) btns.push({ label: 'Give…', value: 'give' });
      btns.push({ label: 'Close', cls: 'primary' });
      const cel = CV.card(d);
      const note = it.worn ? '<p class="warn">⚠ About to break: if it goes on another run, it breaks after the mission with a 50% chance.</p>'
        : list === 'equip' ? '<p class="muted">An equipped card is shuffled into the deck for the mission. After the run it becomes “about to break”.</p>' : '';
      const v = await Modal.show(`<div class="kicker">${esc(ZG.Heroes.get(h.id).name)} · ${LIST_NAME[list]}</div>${note}${val ? '<p class="muted">The fence names a price only when you sell. If you do not sell, it is sold when you head out (if it is in the junk).</p>' : p == null ? '<p class="muted">A unique campaign card — not for sale.</p>' : ''}`, btns, cel, 'wide');
      if (!v) return;
      if (v.startsWith('mv:')) return this.act(() => CMP.move(c, h.id, list, i, v.slice(3)));
      if (v === 'sell') { this.act(() => CMP.sell(c, h.id, list, i)); if (val && c.lastSale) toast(`The fence turned the Valuable over in his hands and paid ${c.lastSale.price} 🎫.`); return; }
      if (v === 'repair') return this.act(() => CMP.repair(c, h.id, list, i));
      if (v === 'give') {
        const others = c.roster.filter((o) => o !== h);
        const to = await Modal.show(`<h2>Give “${esc(d.name)}” to whom?</h2><p class="muted">The card goes into the recipient's chest.</p>`, others.map((o) => ({ label: `${ZG.Heroes.get(o.id).name} (${o.chest.length}/${CMP.chestCap(o)})`, value: o.id })).concat([{ label: 'Cancel' }]));
        if (to) this.act(() => CMP.give(c, h.id, list, i, to));
      }
    },
    async buildMenu(c, h) {
      const rows = ZG.Buildings.all().map((b) => { const have = CMP.built(h, b.id), poor = !have && h.talons < b.cost; return `<div class="bld-row${have ? ' have' : ''}${poor ? ' poor' : ''}"><b>${esc(b.name)}</b> <small>${b.cost} 🎫${poor ? ` — ${b.cost - h.talons} 🎫 short` : ''}</small><div>${esc(b.text)}</div></div>`; }).join('');
      const btns = ZG.Buildings.all().filter((b) => !CMP.built(h, b.id) && h.talons >= b.cost).map((b) => ({ label: `${b.name} (${b.cost} 🎫)`, value: b.id }));
      btns.push({ label: 'Close', cls: 'primary' });
      const v = await Modal.show(`<div class="kicker">Personal shelter — ${esc(ZG.Heroes.get(h.id).name)} · 🎫 ${h.talons}</div><h2>Buildings</h2><div class="bld-list">${rows}</div>`, btns, null, 'wide');
      if (v) this.act(() => CMP.build(c, h.id, v));
    },
    renderHire(c, done) {
      const box = $('#shelter-hire');
      const list = CMP.hireable(c);
      const P = ZG.CAMPAIGN.prices;
      if (done || !list.length) { box.innerHTML = ''; return; }
      const full = c.roster.length >= CMP.rosterCap(c);
      box.innerHTML = `<div class="hire-h"><b>Hire a hero — ${P.hire} 🎫</b> <small>One hero pays: they get the recruit's unique gift card and a debt (half of the recruit's star tickets in their first 3 missions). The recruit arrives at level 1 with an ordinary loot card. The shelter holds at most ${CMP.rosterCap(c)} heroes${full ? ' (full now)' : ''}.</small></div>`;
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
          if (!payers.length) return toast(`No one has ${P.hire} 🎫.`);
          const v = await Modal.show(`<h2>Hire: ${esc(def.name)}</h2>${gift ? `<p>Gift for the hirer: <b>${esc(gift.name)}</b> — ${esc(gift.text)}</p>` : ''}<p>Who pays ${P.hire} 🎫?</p>`, payers.map((h) => ({ label: `${ZG.Heroes.get(h.id).name} (🎫 ${h.talons})`, value: h.id })).concat([{ label: 'Cancel' }]));
          if (v) this.act(() => CMP.hire(c, v, id));
        };
        row.appendChild(b);
      });
      box.appendChild(row);
    },
  };

  // ================================================================= rules
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
