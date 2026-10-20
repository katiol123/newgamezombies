/*
 * События раунда. В начале каждого раунда (со 2-го) бросается кубик: на 6 (≈17%)
 * тянется карта события, иначе — затишье. Событие действует до конца раунда,
 * если в тексте не сказано иное.
 *
 * Поля: mods (как у условий партии — действуют, пока событие активно),
 *       start(g, E) — разовый эффект при вытягивании, tone: +1 хорошее / −1 плохое.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  // случайная открытая зона нужного типа, где нет героев
  function freeCell(g, E, type) {
    const cells = g.board.cells.filter((c) => c.type === type && !E.hidden(g, c.i) && !E.heroesAt(g, c.i).length && c.i !== g.exit && !g.spawnPoints.includes(c.i));
    return cells.length ? ZG.Rng.pick(g, cells).i : null;
  }

  ZG.Events.addAll([
    {
      id: 'ev_radio', name: 'Радиоперехват', tone: 1, art: 'cargo_radio',
      text: 'В эфире голос: «…груз в…». Один нераскрытый ящик с грузом помечается. Если таких нет — открывается закрытый тайл.',
      start(g, E) {
        const crate = g.crates.find((c) => !c.opened && c.card && !c.known);
        if (crate) { crate.known = true; E.log(g, 'Радиоперехват: один из ящиков точно с грузом!', 'good'); E.fx(g, { t: 'objective', pos: crate.pos, text: 'ГРУЗ' }); return; }
        const hidden = g.revealed ? g.revealed.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0) : [];
        if (hidden.length) E.reveal(g, ZG.Rng.pick(g, hidden), 'Радиоперехват');
      },
    },
    {
      id: 'ev_airdrop', name: 'Сброс припасов', tone: 1, art: 'tok_crate',
      text: 'Над кварталом проходит вертолёт и сбрасывает контейнер: на свободной улице — жетон «оружейки» (обыск +1 карта). Тревога +1.',
      start(g, E) {
        const c = freeCell(g, E, 'street');
        if (c != null) { g.search.push({ pos: c, kind: 'armory' }); E.fx(g, { t: 'objective', pos: c, text: 'ПРИПАСЫ' }); }
        E.raiseAlarm(g, 1, 'Вертолёт');
      },
    },
    {
      id: 'ev_blackout', name: 'Блэкаут', tone: -1, art: 'cond_moon',
      text: 'Гаснут последние фонари. В этом раунде дальность всех дальних атак −2 (минимум 1).',
      mods: { rangeBonus: -2 },
    },
    {
      id: 'ev_silence', name: 'Мёртвая тишина', tone: 1, art: 'cond_calm',
      text: 'Город замер. В этом раунде зомби не появляются (ни с люков, ни Волной).',
      mods: { noSpawn: 1 },
    },
    {
      id: 'ev_gas', name: 'Утечка газа', tone: 0, art: 'molotov',
      text: 'На улице шипит пробитая труба (жетон газа). В конце раунда — взрыв: 3 урона каждому зомби и 1 Рана каждому герою в этой зоне. Заманите их туда!',
      start(g, E) {
        const c = freeCell(g, E, 'street');
        if (c != null) { g.hazard = { pos: c, dmg: 3 }; E.fx(g, { t: 'trap', pos: c }); }
      },
    },
    {
      id: 'ev_survivor', name: 'Крик о помощи', tone: 1, art: 'hero_marina',
      text: 'В здании заперся выживший. До конца следующего раунда герой в его зоне может за 1 ⚡ спасти его: карта добычи в руку и +2 опыта.',
      start(g, E) {
        const c = freeCell(g, E, 'building');
        if (c != null) { g.survivor = { pos: c, until: g.round + 1 }; E.fx(g, { t: 'objective', pos: c, text: 'ПОМОГИТЕ!' }); }
      },
    },
    {
      id: 'ev_rush', name: 'Прилив сил', tone: 1, art: 'can',
      text: 'Страх придаёт сил: каждый герой получает 1 жетон Адреналина (+1 ⚡ в свой ход).',
      start(g) { g.heroes.forEach((h) => { if (h.onBoard) h.adrenaline += 1; }); },
    },
    {
      id: 'ev_frenzy', name: 'Ночной гон', tone: -1, art: 'z_runner',
      text: 'Мертвецы почуяли кровь: в этом раунде все зомби ходят на 1 зону дальше.',
      mods: { zombieSpeed: 1 },
    },
    {
      id: 'ev_storm', name: 'Гроза', tone: 1, art: 'cond_rain',
      text: 'Гром заглушает всё: в этом раунде шум не поднимает Тревогу.',
      mods: { noiseAlarm: -9 },
    },
    {
      id: 'ev_howl', name: 'Вой вдали', tone: -1, art: 'z_screamer',
      text: 'Над кварталом проносится вой. Тревога +2, у случайного люка появляется Крикун.',
      start(g, E) {
        E.raiseAlarm(g, 2, 'Вой');
        if (g.spawnPoints.length) E.spawnZombie(g, 'screamer', ZG.Rng.pick(g, g.spawnPoints), 'Появляется Крикун');
      },
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
