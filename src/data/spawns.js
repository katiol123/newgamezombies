/*
 * Карты появления. Каждая карта — три строки: Сумерки / Ночь / Глухая ночь.
 * Строка — список врагов, которые выходят из точки появления.
 * Особые карты (event) срабатывают вместо обычного появления.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const W = 'walker', R = 'runner', S = 'screamer', F = 'fatso', B = 'brute';

  ZG.SpawnCards.addAll([
    { id: 'sp_w1', rows: [[W], [W], [W, W]] },
    { id: 'sp_w2', rows: [[W], [W, W], [W, W]] },
    { id: 'sp_w3', rows: [[W, W], [W, W], [W, W, W]] },
    { id: 'sp_r1', rows: [[R], [R], [R, R]] },
    { id: 'sp_r2', rows: [[], [R, W], [R, R]] },
    { id: 'sp_f1', rows: [[], [F], [F, W]] },
    { id: 'sp_f2', rows: [[W], [F], [F, F]] },
    { id: 'sp_s1', rows: [[], [S], [S, W]] },
    { id: 'sp_s2', rows: [[S], [S], [S, W]] },
    { id: 'sp_e1', rows: [[], [], [W]] },
    { id: 'sp_e2', rows: [[], [W], [W]] },
    { id: 'sp_b1', rows: [[], [], [B]] },
    { id: 'sp_b2', rows: [[W], [W], [B]] },
    {
      id: 'sp_sewer', name: 'Канализация', event: true,
      text: 'Из каждой точки появления выходит по Шатуну (Глухая ночь — по два).',
      run(g, E) {
        const n = E.phase(g) === 2 ? 2 : 1;
        g.spawnPoints.forEach((p) => { for (let i = 0; i < n; i++) E.spawnZombie(g, W, p); });
      },
    },
    {
      id: 'sp_siren', name: 'Сирена', event: true,
      text: 'Где-то воет сигнализация. Тревога +2.',
      run(g, E) { E.raiseAlarm(g, 2, 'Сирена'); },
    },
  ]);

  ZG.SPAWN_DECK_L1 = {
    sp_w1: 3, sp_w2: 2, sp_w3: 2, sp_r1: 2, sp_r2: 1, sp_f1: 2, sp_f2: 1,
    sp_s1: 1, sp_s2: 1, sp_e1: 2, sp_e2: 2, sp_b1: 1, sp_b2: 1, sp_sewer: 1, sp_siren: 1,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
