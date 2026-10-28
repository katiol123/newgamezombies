/*
 * Spawn cards. Each card has three rows: Dusk / Night / Dead of Night.
 * A row is the list of enemies that come out of the spawn point.
 * Special cards (event) trigger instead of a normal spawn.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const W = 'walker', R = 'runner', S = 'screamer', F = 'fatso', B = 'brute', P = 'plague', H = 'grabber';

  ZG.SpawnCards.addAll([
    { id: 'sp_w1', rows: [[W], [W], [F]] },
    { id: 'sp_w2', rows: [[W], [R, W], [R, W]] },
    { id: 'sp_w3', rows: [[W, W], [W, W], [W, W]] },
    { id: 'sp_r1', rows: [[R], [R], [R, R]] },
    { id: 'sp_r2', rows: [[], [R, W], [R, R]] },
    { id: 'sp_f1', rows: [[], [F], [F, W]] },
    { id: 'sp_f2', rows: [[W], [F], [F]] },
    { id: 'sp_s1', rows: [[], [S], [S, W]] },
    { id: 'sp_s2', rows: [[S], [S], [S, W]] },
    { id: 'sp_e1', rows: [[], [R], [R]] },
    { id: 'sp_e2', rows: [[], [W], [W]] },
    { id: 'sp_b1', rows: [[], [], [B]] },
    { id: 'sp_b2', rows: [[W], [F], [B]] },
    { id: 'sp_pl', rows: [[], [P], [P, W]] },
    { id: 'sp_gr', rows: [[], [H], [H, W]] },
    {
      id: 'sp_sewer', name: 'Sewer', event: true,
      text: 'A Shambler comes out of this manhole and out of another random one.',
      run(g, E, point) {
        E.spawnZombie(g, W, point);
        const others = g.spawnPoints.filter((p) => p !== point);
        if (others.length) E.spawnZombie(g, W, ZG.Rng.pick(g, others));
      },
    },
    {
      id: 'sp_siren', name: 'Car Alarm', event: true,
      text: 'Somewhere a car alarm is wailing. Alarm +2.',
      run(g, E) { E.raiseAlarm(g, 2, 'Car alarm'); },
    },
  ]);

  ZG.SPAWN_DECK_L1 = {
    sp_w1: 3, sp_w2: 2, sp_w3: 2, sp_r1: 2, sp_r2: 1, sp_f1: 2, sp_f2: 1,
    sp_s1: 1, sp_s2: 1, sp_e1: 2, sp_e2: 2, sp_b1: 1, sp_b2: 1, sp_pl: 2, sp_gr: 2, sp_sewer: 1, sp_siren: 1,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
