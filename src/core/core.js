/*
 * DEAD BLOCK — the core.
 * The ZG namespace, content registries, deterministic RNG, modifiers and hooks.
 * The file works both in the browser (<script>) and in Node (require) — no build step.
 */
(function (G) {
  'use strict';
  const ZG = (G.ZG = G.ZG || {});
  ZG.VERSION = '1.0.0';

  // ---------------------------------------------------------------------------
  // Registries. Any new content (hero, card, enemy, tile, scenario, level)
  // is added with a ZG.<Registry>.add({...}) call — the engine hardcodes nothing.
  // ---------------------------------------------------------------------------
  function makeRegistry(kind) {
    const items = Object.create(null);
    return {
      kind,
      add(def) {
        if (!def || !def.id) throw new Error(kind + ': id is required');
        items[def.id] = def;
        return def;
      },
      addAll(list) { list.forEach((d) => this.add(d)); },
      get(id) {
        const d = items[id];
        if (!d) throw new Error(kind + ' not found: ' + id);
        return d;
      },
      has(id) { return !!items[id]; },
      all() { return Object.values(items); },
    };
  }

  ZG.Cards = makeRegistry('card');
  ZG.Heroes = makeRegistry('hero');
  ZG.Talents = makeRegistry('talent');
  ZG.Zombies = makeRegistry('zombie');
  ZG.Tiles = makeRegistry('tile');
  ZG.SpawnCards = makeRegistry('spawn');
  ZG.Scenarios = makeRegistry('scenario');
  ZG.Conditions = makeRegistry('condition');
  ZG.Levels = makeRegistry('level');
  ZG.Difficulties = makeRegistry('difficulty');
  ZG.Bonuses = makeRegistry('bonus');
  ZG.Events = makeRegistry('event');
  ZG.Missions = makeRegistry('mission');

  // ---------------------------------------------------------------------------
  // Deterministic RNG (mulberry32). Its state lives in the game object,
  // so a game is fully reproducible from its seed and is cloned together with it.
  // ---------------------------------------------------------------------------
  const Rng = {
    seedFrom(str) {
      let h = 1779033703 ^ String(str).length;
      for (let i = 0; i < String(str).length; i++) {
        h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
      }
      return h >>> 0;
    },
    next(g) {
      let s = (g.rng = (g.rng + 0x6d2b79f5) | 0);
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(g, n) { return Math.floor(Rng.next(g) * n); },
    pick(g, arr) { return arr[Rng.int(g, arr.length)]; },
    shuffle(g, arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Rng.int(g, i + 1);
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
  };
  ZG.Rng = Rng;

  // ---------------------------------------------------------------------------
  // Modifiers and hooks.
  // A source (hero, talent, gear, game condition, difficulty) may have:
  //   mods:  { handSize: 1, meleeBonus: (g, hero, ctx) => 1, ... }
  //   hooks: { turnStart(g, hero), kill(g, hero, ctx), ... }
  // A new mechanic = a new modifier/hook key + reading it in the engine.
  // ---------------------------------------------------------------------------
  const Mods = {
    sources(g, hero) {
      const list = [];
      if (hero) {
        list.push(ZG.Heroes.get(hero.id));
        hero.talents.forEach((t) => list.push(ZG.Talents.get(t)));
        (hero.perks || []).forEach((id) => list.push(ZG.Missions.get(id).perk)); // passives from secret missions
        const seen = new Set(); // identical gear does not stack: two gas masks act as one
        hero.equip.forEach((uid) => { const id = g.cards[uid]; if (seen.has(id)) return; seen.add(id); list.push(ZG.Cards.get(id)); });
      }
      if (g.conditionId) list.push(ZG.Conditions.get(g.conditionId));
      if (g.difficultyId) list.push(ZG.Difficulties.get(g.difficultyId));
      if (g.scenarioId) list.push(ZG.Scenarios.get(g.scenarioId));
      if (g.event) list.push(ZG.Events.get(g.event)); // the round event
      return list;
    },
    value(g, hero, key, base, ctx) {
      let v = base;
      for (const src of Mods.sources(g, hero)) {
        const m = src.mods && src.mods[key];
        if (m == null) continue;
        v += (typeof m === 'function' ? m(g, hero, ctx) : m) || 0;
      }
      return v;
    },
    flag(g, hero, key, ctx) { return Mods.value(g, hero, key, 0, ctx) > 0; },
    emit(g, hero, name, ctx) {
      for (const src of Mods.sources(g, hero)) {
        const h = src.hooks && src.hooks[name];
        if (h) h(g, hero, ctx || {});
      }
    },
  };
  ZG.Mods = Mods;

  ZG.util = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    // English plural: "1 zombie", "2 zombies" (the few/many forms are kept in the signature for compatibility)
    plural(n, one, few, many) { return Math.abs(n) === 1 ? one : (many || few); },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ZG;
})(typeof globalThis !== 'undefined' ? globalThis : window);
