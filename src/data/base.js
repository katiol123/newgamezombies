/*
 * Базовые справочники: масти, фазы суток, враги, служебные карты.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  // Три масти. Сыграй карту той же масти, что и предыдущая, — сработает «Связка».
  ZG.SUITS = {
    rage: { id: 'rage', name: 'Ярость', color: '#c0392b', dark: '#7b1e14', icon: 'suit_rage' },
    agility: { id: 'agility', name: 'Сноровка', color: '#2e8b57', dark: '#17543a', icon: 'suit_agility' },
    mind: { id: 'mind', name: 'Расчёт', color: '#2d6fb5', dark: '#173d66', icon: 'suit_mind' },
    none: { id: 'none', name: '—', color: '#6b6258', dark: '#3a342e', icon: null },
  };

  // Фазы суток: определяют строку карты появления.
  ZG.PHASES = [
    { id: 0, name: 'Сумерки', color: '#d9c7a3' },
    { id: 1, name: 'Ночь', color: '#e0a83a' },
    { id: 2, name: 'Глухая ночь', color: '#c0392b' },
  ];

  // ---------------------------------------------------------------- Враги ---
  ZG.Zombies.addAll([
    {
      id: 'walker', name: 'Шатун', hp: 2, dmg: 1, speed: 1, xp: 1, armor: 0, threat: 2,
      text: 'Медленный, но их много.', art: 'z_walker',
    },
    {
      id: 'runner', name: 'Бегун', hp: 1, dmg: 1, speed: 2, xp: 1, armor: 0, threat: 3,
      text: 'Ходит на 2 зоны. Хрупкий.', art: 'z_runner',
    },
    {
      id: 'screamer', name: 'Крикун', hp: 1, dmg: 0, speed: 1, xp: 2, armor: 0, threat: 4,
      text: 'Не атакует. В фазу зомби, если герой в 2 зонах от него: Тревога +1.', art: 'z_screamer',
      hooks: { zombiePhase(g, z, E) { const d = E.dist(g, z.pos); if (g.heroes.some((h) => h.onBoard && d[h.pos] <= 2)) E.raiseAlarm(g, 1, 'Крикун воет'); } },
    },
    {
      id: 'fatso', name: 'Толстяк', hp: 4, dmg: 2, speed: 1, xp: 2, armor: 0, threat: 4,
      text: 'Живучий. Бьёт на 2.', art: 'z_fatso',
    },
    {
      id: 'brute', name: 'Громила', hp: 7, dmg: 3, speed: 1, xp: 5, armor: 1, threat: 8, big: true,
      text: 'Крупная цель: урон сохраняется. Броня 1: каждый эффект урона по нему −1.', art: 'z_brute',
    },
    {
      id: 'nest', name: 'Гнездо', hp: 7, dmg: 0, speed: 0, xp: 3, armor: 0, threat: 5, immobile: true, big: true,
      text: 'Крупная цель: урон сохраняется. Не движется. В фазу зомби порождает Шатуна в своей зоне (в Глухую ночь — Бегуна).', art: 'z_nest',
      hooks: { zombiePhase(g, z, E) { const t = E.phase(g) >= 2 ? 'runner' : 'walker'; E.spawnZombie(g, t, z.pos, 'Гнездо порождает: ' + ZG.Zombies.get(t).name); } },
    },
  ]);

  // ---------------------------------------------------------- Служебные ---
  ZG.Cards.addAll([
    {
      id: 'wound', name: 'Рана', suit: 'none', cost: null, shield: 0, kind: 'wound',
      type: 'Рана', text: 'Нельзя сыграть или сбросить для защиты.\nУбирается лечением или действием «Отдышаться».',
      art: 'wound', unplayable: true, value: -10,
    },
    {
      id: 'cargo_fuel', name: 'Канистра', suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'fuel',
      type: 'Груз', text: 'Груз. Занимает место в руке. Нельзя сыграть или сбросить.\nДоставь в зону машины.',
      art: 'cargo_fuel', unplayable: true, value: 0,
    },
    {
      id: 'cargo_radio', name: 'Рация', suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'radio',
      type: 'Груз', text: 'Груз. Занимает место в руке. Нельзя сыграть или сбросить.\nОтнеси на вышку.',
      art: 'cargo_radio', unplayable: true, value: 0,
    },
    {
      id: 'cargo_meds', name: 'Медикаменты', suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'meds',
      type: 'Груз', text: 'Груз. Занимает место в руке. Нельзя сыграть или сбросить.\nДоставь к скорой.',
      art: 'cargo_meds', unplayable: true, value: 0,
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
