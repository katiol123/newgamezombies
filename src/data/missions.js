/*
 * Секретные миссии. В начале партии каждый герой тайно тянет одну карту миссии.
 * Награду получает только тот, кто ПЕРВЫМ выполнит свою миссию; кто выполнил позже — ничего.
 * Поэтому миссию выгодно скрывать: союзник может «перебить» вашу цель.
 *
 * Поля: rarity ('common' ×2 в колоде, 'rare' ×1), stat — счётчик героя (h.ms[stat]), goal — сколько нужно,
 *       needsAlly / needsStealth / needsFog — если условие не выполняется, карта уходит под низ и тянется новая,
 *       reward(g, h, E) — награда, perk — постоянная пассивка (как талант: mods/hooks), traitor — карта предателя.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  ZG.Missions.addAll([
    {
      id: 'm_butcher', name: 'Мясник', rarity: 'common', stat: 'meleeKills', goal: 5,
      text: 'Убей 5 зомби в ближнем бою.', rewardText: '+3 опыта.',
      reward(g, h, E) { E.gainXp(g, h, 3); },
    },
    {
      id: 'm_scavenger', name: 'Барахольщик', rarity: 'common', stat: 'searches', goal: 3,
      text: 'Сделай 3 обыска.', rewardText: 'Редкая находка из колоды добычи — в руку.',
      reward(g, h, E) { E.giveRareLoot(g, h); },
    },
    {
      id: 'm_scout', name: 'Первопроходец', rarity: 'common', stat: 'reveals', goal: 2, needsFog: true,
      text: 'Разведай 2 закрытых тайла (шагни в туман). Нужен туман войны.', rewardText: 'Пассивка «Следопыт»: первое «Движение» за ход бесплатно.',
      perk: { name: 'Следопыт', text: 'Первое «Движение» за ход бесплатно.', mods: { freeFirstMove: 1 } },
    },
    {
      id: 'm_angel', name: 'Ангел-хранитель', rarity: 'common', stat: 'helps', goal: 3, needsAlly: true,
      text: 'Трижды помоги союзнику: передай ему карту, вылечи, обеззаразь или вытащи его. Нужен союзник.', rewardText: 'Аптечка в руку и +2 опыта.',
      reward(g, h, E) { E.giveCard(g, h, 'medkit'); E.gainXp(g, h, 2); },
    },
    {
      id: 'm_ghost', name: 'Невидимка', rarity: 'common', stat: 'unseen', goal: 4,
      text: 'Закончи 4 своих хода так, чтобы ни один зомби тебя не видел.', rewardText: 'Пассивка «Хладнокровие»: +1 к размеру руки.',
      perk: { name: 'Хладнокровие', text: '+1 к размеру руки.', mods: { handSize: 1 } },
    },
    {
      id: 'm_biggame', name: 'Крупная дичь', rarity: 'rare', stat: 'bigKills', goal: 1,
      text: 'Нанеси последний удар крупной цели (Громила, Гнездо, Ищейка, Обращённый).', rewardText: 'Пассивка «Трофей»: +1 Стойкость.',
      perk: { name: 'Трофей', text: '+1 Стойкость.', mods: { hp: 1 } },
    },
    {
      id: 'm_rampage', name: 'Мясорубка', rarity: 'rare', stat: 'bestTurnKills', goal: 3,
      text: 'Убей 3 зомби за один свой ход.', rewardText: 'Редкая находка в руку и +2 опыта.',
      reward(g, h, E) { E.giveRareLoot(g, h); E.gainXp(g, h, 2); },
    },
    {
      id: 'm_traitor', name: 'Предатель', rarity: 'rare', stat: 'betrayals', goal: 2, needsAlly: true, needsStealth: true, traitor: true,
      text: 'Дважды натрави на союзника зомби: разбуди или отвлеки его своим шумом или ударом — и он укусит союзника (хотя бы 1 урон). Нужны союзник и скрытность.',
      rewardText: 'Тебя раскрывают. Пассивка «Своя шкура»: каждую фазу зомби 1 урон по тебе блокируется.',
      perk: { name: 'Своя шкура', text: 'Каждую фазу зомби 1 урон по тебе блокируется.', mods: { autoBlock: 1 } },
    },
  ]);

  // состав колоды миссий: обычные ×2, редкие ×1
  ZG.MISSION_DECK = ZG.Missions.all().reduce((acc, m) => acc.concat(Array(m.rarity === 'rare' ? 1 : 2).fill(m.id)), []);
})(typeof globalThis !== 'undefined' ? globalThis : window);
