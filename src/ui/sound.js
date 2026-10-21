/*
 * ZG.Sound — звуки игры. Каждое событие — ключ; файл можно заменить или добавить:
 *     ZG.Sound.define('growl', 'audio/growl.mp3', { volume: 0.7, gap: 600 });
 * gap — минимальная пауза между повторами одного звука (мс), чтобы не было «каши».
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const defs = Object.create(null);
  const last = Object.create(null);
  const load = (k, d) => { try { const v = localStorage.getItem('zg_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem('zg_' + k, JSON.stringify(v)); } catch (e) { /* нет хранилища */ } };

  const Sound = {
    muted: load('muted', false),
    volume: load('volume', 0.8),
    define(key, src, opts) {
      opts = opts || {};
      const base = new Audio(src);
      base.preload = 'auto';
      defs[key] = { src, base, volume: opts.volume == null ? 1 : opts.volume, gap: opts.gap || 0 };
    },
    play(key, opts) {
      const d = defs[key];
      if (!d || this.muted) return;
      const now = performance.now();
      if (d.gap && last[key] && now - last[key] < d.gap) return;
      last[key] = now;
      try {
        const a = d.base.cloneNode();
        a.volume = Math.max(0, Math.min(1, d.volume * this.volume * ((opts && opts.volume) || 1)));
        if (opts && opts.rate) a.playbackRate = opts.rate;
        const p = a.play();
        if (p && p.catch) p.catch(() => { /* браузер ещё не разрешил звук до первого клика */ });
      } catch (e) { /* звук не критичен */ }
    },
    toggle() {
      this.muted = !this.muted; save('muted', this.muted);
      if (this.muted) this.stopMusic(0, true); else if (this._musicKey) this.music(this._musicKey);
      return this.muted;
    },
    // фоновая музыка: играет по кругу (или ms миллисекунд), плавно нарастает и затихает
    music(key, ms) {
      const d = defs[key];
      this._musicKey = key;
      if (!d || this.muted) return;
      this.stopMusic(0);
      this._musicKey = key;
      try {
        const a = d.base.cloneNode();
        const vol = Math.max(0, Math.min(1, d.volume * this.volume));
        a.volume = 0; a.currentTime = 0; a.loop = !ms;
        const p = a.play(); if (p && p.catch) p.catch(() => {});
        this._music = a;
        let v = 0; const up = setInterval(() => { v = Math.min(vol, v + vol / 10); a.volume = v; if (v >= vol) clearInterval(up); }, 60);
        if (ms) this._musicTimer = setTimeout(() => this.stopMusic(1500), ms);
      } catch (e) { /* звук не критичен */ }
    },
    stopMusic(fade, keepKey) {
      if (!keepKey) this._musicKey = null;
      const a = this._music; clearTimeout(this._musicTimer);
      if (!a) return;
      this._music = null;
      if (!fade) { a.pause(); return; }
      const step = a.volume / Math.max(1, fade / 60);
      const t = setInterval(() => { a.volume = Math.max(0, a.volume - step); if (a.volume <= 0.001) { clearInterval(t); a.pause(); } }, 60);
    },
    // мелкие звуки синтезируются Web Audio; любой можно заменить файлом: define('sfx_shot', 'audio/shot.mp3')
    sfx(name, opts) {
      if (this.muted) return;
      if (defs['sfx_' + name]) { this.play('sfx_' + name, opts); return; }
      const fn = SFX[name];
      if (!fn) return;
      const now = performance.now();
      const gap = (opts && opts.soft) ? 90 : 40;
      if (last['~' + name] && now - last['~' + name] < gap) return;
      last['~' + name] = now;
      try {
        const ac = ctx();
        if (!ac) return;
        if (ac.state === 'suspended') ac.resume();
        const out = ac.createGain();
        out.gain.value = this.volume * ((opts && opts.soft) ? 0.45 : 0.8);
        out.connect(ac.destination);
        fn(ac, out, ac.currentTime);
      } catch (e) { /* звук не критичен */ }
    },
  };

  // ---------------------------------------------------- синтез мелких звуков
  let AC = null;
  function ctx() { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; AC = C ? new C() : null; } return AC; }
  let noiseBuf = null;
  function noise(ac, out, t, dur, o) {
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur); f.Q.value = o.q || 0.7;
    const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(o.v || 0.6, t + (o.a || 0.005)); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(gn); gn.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  function tone(ac, out, t, dur, o) {
    const osc = ac.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(o.v || 0.4, t + (o.a || 0.005)); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gn); gn.connect(out); osc.start(t); osc.stop(t + dur + 0.05);
  }
  const SFX = {
    step(ac, o, t) { noise(ac, o, t, 0.12, { f: 260, v: 0.5 }); tone(ac, o, t, 0.1, { f: 70, f2: 45, v: 0.35 }); },           // шарканье зомби
    hstep(ac, o, t) { noise(ac, o, t, 0.07, { f: 900, v: 0.35 }); noise(ac, o, t + 0.13, 0.07, { f: 800, v: 0.3 }); },     // шаги героя
    card(ac, o, t) { noise(ac, o, t, 0.16, { type: 'bandpass', f: 2500, f2: 5000, q: 1.2, v: 0.35, a: 0.03 }); },          // шелест карты
    punch(ac, o, t) { tone(ac, o, t, 0.16, { f: 140, f2: 50, v: 0.8 }); noise(ac, o, t, 0.08, { f: 1800, v: 0.5 }); },     // удар
    hit(ac, o, t) { tone(ac, o, t, 0.12, { f: 220, f2: 90, type: 'triangle', v: 0.45 }); noise(ac, o, t, 0.1, { f: 1200, v: 0.45 }); },
    shot(ac, o, t) { noise(ac, o, t, 0.28, { type: 'highpass', f: 600, v: 0.9, a: 0.002 }); tone(ac, o, t, 0.2, { f: 160, f2: 40, v: 0.7 }); }, // выстрел
    blast(ac, o, t) { noise(ac, o, t, 0.9, { f: 1500, f2: 120, v: 1, a: 0.004 }); tone(ac, o, t, 0.7, { f: 90, f2: 30, v: 0.8 }); },            // взрыв
    kill(ac, o, t) { noise(ac, o, t, 0.22, { f: 500, f2: 150, q: 3, v: 0.6 }); tone(ac, o, t, 0.2, { f: 110, f2: 55, type: 'sawtooth', v: 0.15 }); },
    block(ac, o, t) { tone(ac, o, t, 0.25, { f: 1250, type: 'square', v: 0.08 }); tone(ac, o, t, 0.3, { f: 1870, v: 0.12 }); noise(ac, o, t, 0.05, { type: 'highpass', f: 3000, v: 0.3 }); },
    chain(ac, o, t) { [523, 659, 784, 1046].forEach((f, i) => tone(ac, o, t + i * 0.06, 0.3, { f, type: 'triangle', v: 0.22 })); },
    heal(ac, o, t) { [392, 523, 659].forEach((f, i) => tone(ac, o, t + i * 0.09, 0.45, { f, v: 0.2, a: 0.03 })); },
    infect(ac, o, t) { tone(ac, o, t, 0.6, { f: 300, f2: 120, type: 'sawtooth', v: 0.12 }); noise(ac, o, t, 0.5, { type: 'bandpass', f: 400, q: 6, v: 0.4, a: 0.05 }); },
    search(ac, o, t) { for (let i = 0; i < 4; i++) noise(ac, o, t + i * 0.07, 0.06, { type: 'bandpass', f: 1500 + i * 300, q: 2, v: 0.3 }); },
    wood(ac, o, t) { [0, 0.15].forEach((d) => { tone(ac, o, t + d, 0.09, { f: 180, f2: 120, type: 'triangle', v: 0.6 }); noise(ac, o, t + d, 0.06, { f: 900, v: 0.4 }); }); }, // баррикада
    bash(ac, o, t) { tone(ac, o, t, 0.12, { f: 120, f2: 70, type: 'triangle', v: 0.6 }); noise(ac, o, t, 0.15, { f: 700, v: 0.5 }); },
    pickup(ac, o, t) { tone(ac, o, t, 0.12, { f: 660, v: 0.2 }); tone(ac, o, t + 0.08, 0.16, { f: 990, v: 0.2 }); },
    energy(ac, o, t) { tone(ac, o, t, 0.25, { f: 440, f2: 880, type: 'triangle', v: 0.18 }); },
    door(ac, o, t) { tone(ac, o, t, 0.35, { f: 420, f2: 260, type: 'sawtooth', v: 0.05, a: 0.04 }); noise(ac, o, t + 0.05, 0.12, { f: 600, v: 0.3 }); }, // скрип двери
    wake(ac, o, t) { tone(ac, o, t, 0.25, { f: 180, f2: 320, type: 'sawtooth', v: 0.06 }); }, // зомби заметил
    thunder(ac, o, t) { noise(ac, o, t, 2.4, { f: 140, f2: 60, v: 0.55, a: 0.12 }); tone(ac, o, t + 0.05, 1.6, { f: 48, f2: 32, v: 0.3, a: 0.2 }); }, // дальний гром
    heart(ac, o, t) { tone(ac, o, t, 0.12, { f: 62, f2: 40, v: 0.45 }); tone(ac, o, t + 0.2, 0.12, { f: 58, f2: 38, v: 0.32 }); }, // тум-тум
    alarm(ac, o, t) { for (let i = 0; i < 2; i++) { tone(ac, o, t + i * 0.42, 0.4, { f: 620, f2: 940, type: 'sawtooth', v: 0.09, a: 0.02 }); tone(ac, o, t + i * 0.42 + 0.2, 0.22, { f: 940, f2: 620, type: 'sawtooth', v: 0.07 }); } }, // сирена тревоги
    click(ac, o, t) { tone(ac, o, t, 0.04, { f: 900, type: 'square', v: 0.05 }); },
  };
  ZG.Sound = Sound;

  // события игры → звуки
  Sound.define('round', 'audio/tension.mp3', { volume: 0.55, gap: 1500 });     // новый раунд, вступление
  Sound.define('zombies', 'audio/braam.mp3', { volume: 0.75, gap: 1200 });     // фаза зомби, волна, прорыв
  Sound.define('growl', 'audio/growl.mp3', { volume: 0.7, gap: 700 });        // атака зомби, засада
  Sound.define('reveal', 'audio/psychedelic.mp3', { volume: 0.6, gap: 1500 }); // туман: открытие тайла, смена суток
  Sound.define('music', 'audio/missions.mp3', { volume: 0.32 });                // «Время перемен» — фон всей вылазки
})(window);
