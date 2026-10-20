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
    toggle() { this.muted = !this.muted; save('muted', this.muted); return this.muted; },
  };
  ZG.Sound = Sound;

  // события игры → звуки
  Sound.define('round', 'audio/tension.mp3', { volume: 0.55, gap: 1500 });     // новый раунд, вступление
  Sound.define('zombies', 'audio/braam.mp3', { volume: 0.75, gap: 1200 });     // фаза зомби, волна, прорыв
  Sound.define('growl', 'audio/growl.mp3', { volume: 0.7, gap: 700 });        // атака зомби, засада
  Sound.define('reveal', 'audio/psychedelic.mp3', { volume: 0.6, gap: 1500 }); // туман: открытие тайла, смена суток
})(window);
