/*
 * Round events. At the start of each round (from the 2nd) a die is rolled: on a 6 (≈17%)
 * an event card is drawn, otherwise it is a lull. An event lasts until the end of the round
 * unless its text says otherwise.
 *
 * Fields: mods (like game conditions — active while the event is active),
 *       start(g, E) — one-time effect when drawn, tone: +1 good / −1 bad.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  // a random open zone of the required type with no heroes
  function freeCell(g, E, type) {
    const cells = g.board.cells.filter((c) => c.type === type && !E.hidden(g, c.i) && !E.heroesAt(g, c.i).length && c.i !== g.exit && !g.spawnPoints.includes(c.i));
    return cells.length ? ZG.Rng.pick(g, cells).i : null;
  }

  ZG.Events.addAll([
    {
      id: 'ev_radio', name: 'Radio Intercept', tone: 1, art: 'cargo_radio',
      text: 'A voice on the air: "…the cargo is in…". One unopened crate with cargo is marked. If there are none, a closed tile is revealed.',
      start(g, E) {
        const crate = g.crates.find((c) => !c.opened && c.card && !c.known);
        if (crate) { crate.known = true; E.log(g, 'Radio intercept: one of the crates definitely holds cargo!', 'good'); E.fx(g, { t: 'objective', pos: crate.pos, text: 'CARGO' }); return; }
        const hidden = g.revealed ? g.revealed.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0) : [];
        if (hidden.length) E.reveal(g, ZG.Rng.pick(g, hidden), 'Radio intercept');
      },
    },
    {
      id: 'ev_airdrop', name: 'Supply Drop', tone: 1, art: 'tok_crate',
      text: 'A helicopter passes over the block and drops a container: an "armory" token on a free street (Search +1 card). Alarm +1.',
      start(g, E) {
        const c = freeCell(g, E, 'street');
        if (c != null) { g.search.push({ pos: c, kind: 'armory' }); E.fx(g, { t: 'objective', pos: c, text: 'SUPPLIES' }); }
        E.raiseAlarm(g, 1, 'Helicopter');
      },
    },
    {
      id: 'ev_blackout', name: 'Blackout', tone: -1, art: 'cond_moon',
      text: 'The last streetlights die. This round, the range of all ranged attacks is −2 (minimum 1).',
      mods: { rangeBonus: -2 },
    },
    {
      id: 'ev_silence', name: 'Dead Silence', tone: 1, art: 'cond_calm',
      text: 'The city holds its breath. This round no zombies appear (neither from manholes nor from a Wave).',
      mods: { noSpawn: 1 },
    },
    {
      id: 'ev_gas', name: 'Gas Leak', tone: 0, art: 'molotov',
      text: 'A punctured pipe hisses in the street (gas token). At the end of the round — explosion: 3 damage to each zombie and 1 Wound to each hero in that zone. Lure them there!',
      start(g, E) {
        const c = freeCell(g, E, 'street');
        if (c != null) { g.hazard = { pos: c, dmg: 3 }; E.fx(g, { t: 'trap', pos: c }); }
      },
    },
    {
      id: 'ev_survivor', name: 'Cry for Help', tone: 1, art: 'hero_marina',
      text: 'A survivor has locked themselves in a building. Until the end of next round, a hero in their zone may rescue them for 1 ⚡: a loot card to hand and +2 XP.',
      start(g, E) {
        const c = freeCell(g, E, 'building');
        if (c != null) { g.survivor = { pos: c, until: g.round + 1 }; E.fx(g, { t: 'objective', pos: c, text: 'HELP!' }); }
      },
    },
    {
      id: 'ev_rush', name: 'Second Wind', tone: 1, art: 'can',
      text: 'Fear gives strength: each hero gains 1 Adrenaline token (+1 ⚡ on their turn).',
      start(g) { g.heroes.forEach((h) => { if (h.onBoard) h.adrenaline += 1; }); },
    },
    {
      id: 'ev_frenzy', name: 'Night Hunt', tone: -1, art: 'z_runner',
      text: 'The dead have smelled blood: this round all zombies move 1 zone farther.',
      mods: { zombieSpeed: 1 },
    },
    {
      id: 'ev_storm', name: 'Thunderstorm', tone: 1, art: 'cond_rain',
      text: 'Thunder drowns everything: this round noise does not raise the Alarm.',
      mods: { noiseAlarm: -9 },
    },
    {
      id: 'ev_hound', name: 'Hound', tone: -1, art: 'z_hound',
      text: 'A dead dog walks out of an alley: a Hound appears at the manhole farthest from the heroes. It always hunts and smells the nearest hero. This event never happens a second time.',
      start(g, E) {
        if (!g.spawnPoints.length || g.houndDone) return;
        g.houndDone = true; // the Hound — only once per game
        // the open manhole farthest from the heroes (a closed one works too: the dog walks out of the fog)
        let best = g.spawnPoints[0], bd = -1;
        g.spawnPoints.forEach((p) => { const d = E.distV(g, p); const m = Math.min(...g.heroes.filter((h) => h.onBoard).map((h) => d[h.pos])); if (m > bd && m !== Infinity) { bd = m; best = p; } });
        E.spawnZombie(g, 'hound', best, 'The Hound has picked up the trail');
      },
    },
    {
      id: 'ev_howl', name: 'Distant Howl', tone: -1, art: 'z_screamer',
      text: 'A howl sweeps over the block. Alarm +2, a Screamer appears at a random manhole.',
      start(g, E) {
        E.raiseAlarm(g, 2, 'Howl');
        if (g.spawnPoints.length) E.spawnZombie(g, 'screamer', ZG.Rng.pick(g, g.spawnPoints), 'A Screamer appears');
      },
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
