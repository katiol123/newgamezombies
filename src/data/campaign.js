/*
 * Данные режима кампании: параметры, цены, постройки убежища, общие таланты, временные карты морали.
 * Правила — docs/CAMPAIGN.md. Логика — src/engine/campaign.js.
 */
(function (G) {
  const ZG = G.ZG;

  ZG.CAMPAIGN = {
    xpLevels: [4, 10, 18, 28], // уровни 2–5; на 4-м и 5-м — общие таланты убежища
    chainLength: 6, // пока: цепочка случайных миссий из режима одиночной вылазки
    morale: { start: 3, max: 6, low: 1 }, // ≤ low — «Уныние» (на 0 — два), = max — «Кураж»
    slots: { equip: 3, chest: 4, chestBig: 6 },
    breakChance: 0.5,
    prices: {
      star: 5, // талонов каждому участнику за звезду миссии
      sell: { common: 2, rare: 5, unique: 8 }, // карты «только из кампании» не продаются
      heal: 4, // +1 Стойкость
      repair: 4,
      hire: 30,
      ration: 2, // паёк: платят все между миссиями
    },
  };

  // Постройки — личные: каждый герой строит в своём убежище за свои талоны
  ZG.Buildings = ZG.Buildings || (function () {
    const items = {};
    return {
      add(d) { items[d.id] = d; },
      get(id) { return items[id]; },
      all() { return Object.values(items); },
    };
  })();
  [
    { id: 'infirmary', name: 'Лазарет', cost: 25, text: 'Между миссиями +1 Стойкость сверх обычного.' },
    { id: 'storage', name: 'Склад', cost: 20, text: 'Сундук расширяется с 4 до 6 мест.' },
    { id: 'workshop', name: 'Мастерская', cost: 15, text: 'Можно чинить карты «на грани поломки» (4 талона за карту).' },
    { id: 'redcorner', name: 'Красный уголок', cost: 15, text: 'Если герой не взят на миссию, мораль с шансом 50% не падает.' },
    { id: 'bath', name: 'Баня', cost: 15, text: 'Между миссиями, если мораль ниже 3, с шансом 50% +1 мораль.' },
  ].forEach((b) => ZG.Buildings.add(b));

  // Общие таланты убежища (4-й и 5-й уровни кампании: 2 случайных на выбор)
  ZG.Talents.addAll([
    { id: 'sh_tough', shelter: true, name: 'Живучий', text: 'Между миссиями +1 Стойкость сверх обычного.' },
    { id: 'sh_handy', shelter: true, name: 'Рукастый', text: 'Твои карты ломаются с шансом 25%, а не 50%.' },
    { id: 'sh_hoarder', shelter: true, name: 'Барахольщик', text: '+2 места в твоём сундуке.' },
    { id: 'sh_thrifty', shelter: true, name: 'Бережливый', text: '+1 талон за каждую звезду миссии, в которой ты участвовал.' },
    { id: 'sh_packer', shelter: true, name: 'Запасливый', text: '4 места экипировки вместо 3.' },
    { id: 'sh_ready', shelter: true, name: 'Собранный', text: 'Начинаешь миссию с +1 картой в руке.', mods: { startDraw: 1 } },
    { id: 'sh_scavenger', shelter: true, name: 'Мародёр', text: '+3 талона за миссию, в которой ты сделал 2+ Обыска.' },
  ]);

  // Временные карты морали: замешиваются в колоду только на ближайшую миссию
  ZG.Cards.addAll([
    {
      id: 'despair', name: 'Уныние', suit: 'none', cost: null, shield: 0, kind: 'temp',
      type: 'Мораль', text: 'Нельзя сыграть. Когда приходит в руку — −1 ⚡.\nВ конце хода уходит в сброс.',
      art: 'despair', unplayable: true, drainOnDraw: true, discardEndTurn: true, value: -6,
    },
    {
      id: 'courage', name: 'Кураж', suit: 'none', cost: 0, shield: 0, kind: 'temp', consumable: true,
      type: 'Мораль', text: 'Возьми 2 карты, +1 ⚡. Все твои атаки в этот ход наносят +1 урон.\nПосле розыгрыша убирается из игры.',
      art: 'courage', value: 12,
      target: null,
      play(c) { c.draw(2); c.energy(1); if (c.g.turn) c.g.turn.courage = true; },
    },
  ]);
})(typeof globalThis !== "undefined" ? globalThis : window);
