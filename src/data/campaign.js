/*
 * Данные режима кампании: параметры, цены, постройки убежища, общие таланты, временные карты морали.
 * Правила — docs/CAMPAIGN.md. Логика — src/engine/campaign.js.
 */
(function (G) {
  const ZG = G.ZG;

  ZG.CAMPAIGN = {
    xpLevels: [4, 10, 18, 28], // уровни 2–5; на 4-м и 5-м — общие таланты убежища
    // Цепочка миссий. Поля описания (все необязательны):
    //   name, brief — название и вводная для убежища; scenarioId, conditionId — задание и условие (иначе случайные);
    //   tiles: { required: ['id' | { id, tx, ty }], exclude: ['id'] } — уникальные тайлы и исключения из пула;
    //   bosses: ['zombieType'] — боссы локации (Блуждающая угроза: появляются при открытии тайлов).
    // Пока все миссии — случайные из режима одиночной вылазки.
    chain: [{}, {}, {}, {}, {}, {}],
    morale: { start: 3, max: 6, low: 1 }, // ≤ low — «Уныние» (на 0 — два), = max — «Кураж»
    slots: { equip: 3, chest: 4, chestBig: 6 },
    breakChance: 0.5,
    prices: {
      star: 5, // талонов каждому участнику за звезду миссии
      sell: { common: 2, rare: 5, unique: 8 }, // карты «только из кампании» не продаются
      heal: 4, // +1 Стойкость
      repair: { common: 1, rare: 2, unique: 3 },
      hire: 18,
      hireTalons: 4, // новичок приходит с небольшим запасом талонов
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
    { id: 'infirmary', name: 'Лазарет', cost: 15, text: 'Между миссиями +1 Стойкость сверх обычного.' },
    { id: 'storage', name: 'Склад', cost: 12, text: 'Сундук расширяется с 4 до 6 мест.' },
    { id: 'workshop', name: 'Мастерская', cost: 10, text: 'Можно чинить карты «на грани поломки» (1 / 2 / 3 🎫 — обычная / редкая / уникальная).' },
    { id: 'redcorner', name: 'Красный уголок', cost: 10, text: 'Если герой не взят на миссию, мораль с шансом 50% не падает.' },
    { id: 'bath', name: 'Баня', cost: 10, text: 'Между миссиями, если мораль ниже 3, с шансом 50% +1 мораль.' },
  ].forEach((b) => ZG.Buildings.add(b));

  // Общие таланты убежища (4-й и 5-й уровни кампании: 2 случайных на выбор)
  ZG.Talents.addAll([
    { id: 'sh_tough', shelter: true, name: 'Живучий', text: 'Между миссиями +1 Стойкость сверх обычного.' },
    { id: 'sh_handy', shelter: true, name: 'Рукастый', text: 'Карты, которые за миссию побывали только в твоих руках, ломаются с шансом 25%, а не 50%.' },
    { id: 'sh_hoarder', shelter: true, name: 'Барахольщик', text: '+2 места в твоём сундуке.' },
    { id: 'sh_thrifty', shelter: true, name: 'Бережливый', text: '+1 талон за каждую звезду миссии, в которой ты участвовал.' },
    { id: 'sh_packer', shelter: true, name: 'Запасливый', text: '4 места экипировки вместо 3.' },
    { id: 'sh_ready', shelter: true, name: 'Собранный', text: 'Начинаешь миссию с +1 картой в руке.', mods: { startDraw: 1 } },
    { id: 'sh_scavenger', shelter: true, name: 'Мародёр', text: '+3 талона за миссию, в которой ты сделал 2+ Обыска.' },
  ]);

  // Подарки новичка: уникальная карта героя (только в кампании, не продаётся) — нанимателю при найме
  const GIFT = { kind: 'gift', campaignOnly: true, rarity: 'unique', type: 'Подарок', value: 11 };
  ZG.Cards.addAll([
    Object.assign({}, GIFT, {
      id: 'gift_helmet', name: 'Каска бригадира', from: 'boris', suit: 'mind', cost: 1, shield: 2, tags: ['block'],
      text: 'Получи 3 Блока.', chainText: '+1 Блок и возьми 1 карту.', art: 'shield', target: null,
      play(c) { c.block(3 + (c.chain ? 1 : 0)); if (c.chain) c.draw(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_kit', name: 'Полевой набор', from: 'marina', suit: 'mind', cost: 1, shield: 1, tags: ['heal'],
      text: 'Герой в твоей зоне (можно себя) убирает 1 Рану или Заражение. Возьми 1 карту.', chainText: 'убирает ещё 1.', art: 'medkit',
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 1 + (c.chain ? 1 : 0), true); c.draw(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_map', name: 'Карта крыш', from: 'lisa', suit: 'agility', cost: 1, shield: 1, tags: ['move'],
      text: 'Переместись на 1–3 зоны, можно сквозь зоны с зомби. Хватка не действует. Возьми 1 карту.', chainText: '+1 ⚡.', art: 'roof',
      target: { kind: 'move', steps: 3, through: true },
      play(c) { c.moveTo(c.target); c.draw(1); if (c.chain) c.energy(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_rifle', name: 'Трофейная винтовка', from: 'viktor', suit: 'mind', cost: 1, shield: 0, noise: 1, tags: ['ranged', 'gun'],
      text: 'Дальний бой, дальность 0–3. 3 урона. Шум 1.', chainText: '+1 урон.', art: 'pistol',
      target: { kind: 'zombie', range: 3, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 3 + (c.chain ? 1 : 0)); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_toolbox', name: 'Ящик инструментов', from: 'kira', suit: 'mind', cost: 1, shield: 1, tags: ['barricade'],
      text: 'Поставь Баррикаду (прочность 5) на проход из твоей зоны. Возьми 1 карту.', chainText: '+1 ⚡.', art: 'weld',
      target: { kind: 'edge' },
      play(c) { c.barricade(c.target, 5); c.draw(1); if (c.chain) c.energy(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_lure', name: 'Манок', from: 'sava', suit: 'mind', cost: 0, shield: 1, tags: ['lure'],
      text: 'Шум в зоне в 3 зонах от тебя (без Тревоги). Зомби в 3 зонах от неё идут проверить. Возьми 1 карту.', chainText: 'слышно на 1 зону дальше.', art: 'whistle',
      target: { kind: 'cell', range: 3 },
      play(c) { c.pebble(c.target, 3 + (c.chain ? 1 : 0)); c.draw(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_flare', name: 'Фальшфейер', from: 'gosha', suit: 'rage', cost: 1, shield: 0, tags: ['lure'],
      text: 'Положи Приманку в зону в 3 зонах от тебя: до конца раунда зомби считают её героем. Тревога не растёт.', chainText: 'возьми 1 карту.', art: 'firecracker',
      target: { kind: 'cell', range: 3 },
      play(c) { c.lure(c.target, 0); if (c.chain) c.draw(1); },
    }),
  ]);
  ZG.Cards.all().filter((d) => d.kind === 'gift').forEach((d) => { ZG.Heroes.get(d.from).gift = d.id; });

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
