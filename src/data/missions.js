/*
 * Секретные миссии. В начале партии каждый герой тайно тянет одну карту миссии.
 * Награду получает только тот, кто ПЕРВЫМ выполнит свою миссию; кто выполнил позже — ничего.
 * Поэтому миссию выгодно скрывать: союзник может «перебить» вашу цель.
 *
 * Поля: rarity ('common' ×2 в колоде, 'rare' ×1), stat — счётчик героя (h.ms[stat]), goal — сколько нужно,
 *       needsAlly / needsStealth / needsFog / needsBandits — если условие не выполняется, карта уходит под низ и тянется новая,
 *       reward(g, h, E) — награда, perk — постоянная пассивка (как талант: mods/hooks), traitor — карта предателя.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  // Сила награды — по шансу выполнить первым (замер симулятором): чем реже, тем щедрее.
  //   ~40%: разовая мелочь · ~30%: находка/опыт · ~25%: пассивка · ~13%: сильная пассивка · <10%: очень сильная.
  ZG.Missions.addAll([
    {
      id: 'm_butcher', name: 'Рубака', rarity: 'common', stat: 'meleeKills', goal: 5,
      text: 'Убей 5 зомби в ближнем бою.', rewardText: '+3 опыта.',
      reward(g, h, E) { E.gainXp(g, h, 3); },
    },
    {
      id: 'm_scavenger', name: 'Барахольщик', rarity: 'common', stat: 'searches', goal: 4,
      text: 'Сделай 4 обыска.', rewardText: 'Редкая находка из колоды добычи — в руку.',
      reward(g, h, E) { E.giveRareLoot(g, h); },
    },
    {
      id: 'm_scout', name: 'Первопроходец', rarity: 'common', stat: 'reveals', goal: 3, needsFog: true,
      text: 'Разведай 3 закрытых тайла (шагни в туман). Нужен туман войны.', rewardText: 'Пассивка «Следопыт»: первое «Движение» за ход бесплатно.',
      perk: { name: 'Следопыт', text: 'Первое «Движение» за ход бесплатно.', mods: { freeFirstMove: 1 } },
    },
    {
      id: 'm_angel', name: 'Ангел-хранитель', rarity: 'common', stat: 'helps', goal: 2, needsAlly: true,
      text: 'Дважды помоги союзнику: вылечи, обеззаразь, вытащи его, передай ему находку или груз (раненому — любую карту). Передача засчитывается раз за ход и не дважды одной картой. Нужен союзник.', rewardText: 'Аптечка в руку.',
      reward(g, h, E) { E.giveCard(g, h, 'medkit'); },
    },
    {
      id: 'm_ghost', name: 'Невидимка', rarity: 'common', stat: 'unseen', goal: 2,
      text: 'Закончи 2 своих хода рядом с зомби (в 3 зонах), но так, чтобы ни один тебя не видел.', rewardText: '+2 опыта.',
      reward(g, h, E) { E.gainXp(g, h, 2); },
    },
    {
      id: 'm_biggame', name: 'Крупная дичь', rarity: 'rare', stat: 'bigKills', goal: 1,
      text: 'Нанеси последний удар крупной цели (Громила, Гнездо, Ищейка, Обращённый).', rewardText: 'Пассивка «Трофей»: +1 Стойкость и +1 к размеру руки.',
      perk: { name: 'Трофей', text: '+1 Стойкость и +1 к размеру руки.', mods: { hp: 1, handSize: 1 } },
    },
    {
      id: 'm_rampage', name: 'Мясорубка', rarity: 'rare', stat: 'bestTurnKills', goal: 3,
      text: 'Убей 3 зомби за один свой ход.', rewardText: 'Редкая находка в руку и +2 опыта.',
      reward(g, h, E) { E.giveRareLoot(g, h); E.gainXp(g, h, 2); },
    },
    {
      id: 'm_traitor', name: 'Предатель', rarity: 'rare', stat: 'betrayals', goal: 2, needsAlly: true, needsStealth: true, traitor: true,
      text: 'Натрави на союзников зомби: разбуди или отвлеки их своим шумом или ударом — и пусть за миссию они атакуют союзников в сумме на 2 урона (считается сила атаки, даже если её заблокировали). Нужны союзник и скрытность.',
      rewardText: 'Тебя раскрывают. Пассивка «Своя шкура»: +1 ⚡ каждый ход и 1 урон по тебе в фазу зомби блокируется.',
      perk: { name: 'Своя шкура', text: '+1 ⚡ каждый ход; 1 урон в фазу зомби блокируется.', mods: { autoBlock: 1, energy: 1 } },
    },
    {
      id: 'm_sniper', name: 'Снайпер', rarity: 'common', stat: 'farKills', goal: 2,
      text: 'Убей 2 зомби дальним боем по цели не в своей зоне (метательное — кирпич, коктейль — тоже считается).', rewardText: '+2 опыта.',
      reward(g, h, E) { E.gainXp(g, h, 2); },
    },
    {
      id: 'm_silent', name: 'Тихая смерть', rarity: 'common', stat: 'quietKills', goal: 1, needsStealth: true,
      text: 'Убей зомби, который на тебя не охотился (бродячего или притаившегося). Нужна скрытность.', rewardText: '«Удавка» — в руку.',
      reward(g, h, E) { E.giveCard(g, h, 'garrote'); },
    },
    {
      id: 'm_unbreakable', name: 'Несгибаемый', rarity: 'common', stat: 'blocked', goal: 6,
      text: 'Заблокируй за миссию 6 урона (картами, Блоком, снаряжением).', rewardText: 'Сразу убери 2 Раны или Заражения.',
      reward(g, h, E) { E.healWounds(g, h, 2, true); },
    },
    {
      id: 'm_cool', name: 'Хладнокровие', rarity: 'rare', stat: 'coolHead', goal: 2,
      text: 'Дважды переживи фазу зомби в зоне с 3+ охотящимися зомби, не получив ни одной Раны.', rewardText: 'Пассивка «Хладнокровный»: каждая карта, сброшенная для защиты, блокирует +1.',
      perk: { name: 'Хладнокровный', text: 'Каждая карта, сброшенная для защиты, блокирует +1.', mods: { blockPerCard: 1 } },
    },
    {
      id: 'm_bounty', name: 'Охотник за головами', rarity: 'rare', stat: 'banditKills', goal: 2, needsBandits: true,
      text: 'Нанеси последний удар двум бандитам. Нужны бандиты на поле.', rewardText: 'Пассивка «Глаз-алмаз»: дальность твоих дальних атак +1.',
      perk: { name: 'Глаз-алмаз', text: 'Дальность твоих дальних атак +1.', mods: { rangeBonus: 1 } },
    },
  ]);

  // состав колоды миссий: обычные ×2, редкие ×1
  ZG.MISSION_DECK = ZG.Missions.all().reduce((acc, m) => acc.concat(Array(m.rarity === 'rare' ? 1 : 2).fill(m.id)), []);
})(typeof globalThis !== 'undefined' ? globalThis : window);
