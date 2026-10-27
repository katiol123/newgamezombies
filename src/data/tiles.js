/*
 * Тайлы поля 3×3 зоны (физически — квадратные картонные тайлы 15×15 см).
 *   map:    '.' улица, буква — помещение (здание), '#' — непроходимо (машина, деревья, завал)
 *   doors:  проходы между ячейками [x1,y1,x2,y2] (улица↔здание, здание↔здание)
 *   search: ячейки с жетоном Обыска; armory — «оружейный» обыск (тяни на 1 карту больше)
 *   manhole: место люка (точки появления), напечатанное на тайле
 *   decor:  чисто визуальные элементы (для отрисовки)
 * Тайл поворачивается на 0/90/180/270°.
 *
 * ПРАВИЛО ДИЗАЙНА ТАЙЛА (гарантирует связность любой раскладки, в т.ч. в тумане):
 *   1) середина каждой стороны (зоны [1,0] [0,1] [2,1] [1,2]) проходима: улица
 *      или помещение — тогда у него есть вход прямо с этой стороны тайла;
 *   2) все зоны тайла достижимы друг из друга внутри тайла.
 * Проверяется автоматически (tools/test.js).
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  ZG.Tiles.addAll([
    // --- Лес (кампания, миссия 3): особые тайлы, в пул уровня не входят ---
    {
      id: 'kordon', name: 'Кордон лесника', num: 'Л1', unique: true, ground: 'dirt',
      manhole: [0, 2], // старый колодец — из него лезут мертвецы
      map: ['AA.', 'AA.', '...'], doors: [[1, 1, 2, 1], [0, 1, 0, 2]], search: [[1, 0]],
      buildings: { A: { floor: 'wood', label: 'Изба' } },
      decor: [{ k: 'table', x: 0, y: 0 }, { k: 'bed', x: 1, y: 0 }, { k: 'well', x: 0, y: 2 }, { k: 'woodpile', x: 2, y: 0 }],
      van: [2, 2], // здесь стоит «буханка»
    },
    {
      id: 'bor', name: 'Сосновый бор', num: 'Л2', unique: true, ground: 'grass',
      map: ['#.#', '...', '#.#'], doors: [], search: [],
      buildings: {},
      decor: [{ k: 'pines', x: 0, y: 0 }, { k: 'pines', x: 2, y: 0 }, { k: 'pines', x: 0, y: 2 }, { k: 'pines', x: 2, y: 2 }, { k: 'stump', x: 1, y: 0 }, { k: 'logs', x: 2, y: 1 }],
    },
    {
      id: 'proseka', name: 'Просека ЛЭП', num: 'Л3', unique: true, ground: 'grass',
      map: ['...', '.#.', '...'], doors: [], search: [[0, 0]],
      buildings: {},
      decor: [{ k: 'pylon', x: 1, y: 1 }, { k: 'stump', x: 2, y: 2 }, { k: 'pine', x: 2, y: 0 }],
    },
    // --- Погост (кампания, миссия 6): старое кладбище за рекой ---
    {
      id: 'pogost_graves', name: 'Старые могилы', num: 'П1', unique: true, ground: 'grass',
      map: ['...', '...', '...'], doors: [], search: [[2, 0]],
      buildings: {},
      decor: [{ k: 'graves', x: 0, y: 0 }, { k: 'graves', x: 2, y: 2 }, { k: 'graves', x: 0, y: 2 }, { k: 'fence', x: 1, y: 0 }, { k: 'pine', x: 2, y: 1 }],
    },
    {
      id: 'pogost_crypts', name: 'Склепы', num: 'П2', unique: true, ground: 'grass',
      map: ['#..', '...', '..#'], doors: [], search: [[2, 0]],
      buildings: {},
      decor: [{ k: 'crypt', x: 0, y: 0 }, { k: 'crypt', x: 2, y: 2 }, { k: 'graves', x: 1, y: 0 }, { k: 'graves', x: 0, y: 2 }, { k: 'fence', x: 2, y: 1 }],
    },
    {
      id: 'pogost_chapel', name: 'Часовня', num: 'П3', unique: true, ground: 'grass',
      map: ['AA.', 'AA.', '...'], doors: [[1, 1, 2, 1], [0, 1, 0, 2]], search: [[0, 0, 'armory']],
      buildings: { A: { floor: 'wood', label: 'Часовня' } },
      decor: [{ k: 'pews', x: 0, y: 0 }, { k: 'pews', x: 1, y: 0 }, { k: 'candles', x: 1, y: 1 }, { k: 'graves', x: 2, y: 2 }, { k: 'graves', x: 0, y: 2 }],
    },
    {
      id: 'krest', name: 'Сияющий крест', num: 'П4', unique: true, ground: 'grass',
      map: ['A..', '...', '...'], doors: [[0, 0, 1, 0], [0, 0, 0, 1]], search: [],
      buildings: { A: { floor: 'wood', label: 'Сторожка' } },
      decor: [{ k: 'big_cross', x: 1, y: 1 }, { k: 'graves', x: 2, y: 0 }, { k: 'graves', x: 0, y: 2 }, { k: 'graves', x: 2, y: 2 }, { k: 'table', x: 0, y: 0 }],
      lodge: [0, 0], // сторожка: здесь рация
      frenzy: true, // «Буйство»: мертвецы на этом тайле действуют дважды
    },
    // --- Мост (кампания, миссия 5): логово банды Лесника ---
    {
      id: 'checkpoint', name: 'Блокпост у моста', num: 'М1', unique: true,
      map: ['A.#', '...', '...'], doors: [[0, 0, 0, 1], [0, 0, 1, 0]], search: [[0, 0, 'armory']],
      buildings: { A: { floor: 'wood', label: 'Будка' } },
      decor: [{ k: 'blocks', x: 2, y: 0 }, { k: 'sandbags', x: 1, y: 1 }, { k: 'sniper_tower', x: 0, y: 2 }, { k: 'barrier', x: 2, y: 1 }, { k: 'table', x: 0, y: 0 }],
      barrier: [2, 1], // шлагбаум на мост — выход
      perch: [0, 2], // вышка снайпера
      cover: [[1, 1]], // мешки с песком: укрытие от выстрелов
    },
    {
      id: 'sawmill', name: 'Лесопилка', num: 'М2', unique: true, ground: 'dirt',
      map: ['A..', 'A..', '...'], doors: [[0, 0, 1, 0], [0, 1, 1, 1]], search: [],
      buildings: { A: { floor: 'wood', label: 'Изба Лесника' } },
      decor: [{ k: 'bed', x: 0, y: 0 }, { k: 'bearskin', x: 0, y: 0 }, { k: 'table', x: 0, y: 1 }, { k: 'logstack', x: 2, y: 0 }, { k: 'saw', x: 1, y: 1 }, { k: 'console', x: 2, y: 1 }, { k: 'woodpile', x: 1, y: 2 }],
      lair: [0, 0], // здесь спит Лесник
      perch: [2, 0], // штабель брёвен — позиция второго снайпера
      saw: [1, 1], // пилорама: зона ловушки
      console: [2, 1], // пульт пилорамы
    },
    // уникальные тайлы миссии 8: колхозный рынок (один тайл — поле 5×2; два — западные и восточные ряды, поле 4×2)
    {
      id: 'kolhoz', name: 'Колхозный рынок', num: 'М8', unique: true,
      map: ['...', '...', '...'], doors: [], search: [[0, 0, 'armory'], [2, 0, 'armory'], [1, 2, 'armory']],
      buildings: {},
      decor: [{ k: 'stall', x: 0, y: 0 }, { k: 'stall', x: 2, y: 0 }, { k: 'crates_pile', x: 1, y: 2 }, { k: 'stall', x: 0, y: 2 }, { k: 'stall', x: 2, y: 2 }, { k: 'cart', x: 0, y: 1 }],
      lair: [1, 1], // мясной ряд: здесь Мясник
    },
    {
      id: 'kolhoz_w', name: 'Рынок · западные ряды', num: 'М8', unique: true,
      map: ['...', '...', '...'], doors: [], search: [[1, 0, 'armory'], [1, 2, 'armory']],
      buildings: {},
      decor: [{ k: 'stall', x: 0, y: 0 }, { k: 'stall', x: 1, y: 0 }, { k: 'stall', x: 0, y: 2 }, { k: 'cart', x: 1, y: 2 }, { k: 'crates_pile', x: 2, y: 2 }],
      lair: [2, 1], // мясной ряд на стыке двух тайлов
    },
    {
      id: 'kolhoz_e', name: 'Рынок · восточные ряды', num: 'М8', unique: true,
      map: ['...', '...', '...'], doors: [], search: [[1, 1, 'armory']],
      buildings: {},
      decor: [{ k: 'stall', x: 1, y: 0 }, { k: 'stall', x: 2, y: 0 }, { k: 'stall', x: 2, y: 2 }, { k: 'trash', x: 0, y: 2 }],
    },
    // уникальные тайлы миссии 7: ресторан, где играли свадьбу, и стоянка банды «Волки»
    {
      id: 'banquet', name: 'Ресторан «Белый лебедь»', num: 'М7', unique: true,
      map: ['AAA', 'AAA', '...'], doors: [[0, 1, 0, 2], [2, 1, 2, 2]], search: [[2, 0, 'armory']],
      buildings: { A: { floor: 'wood', label: 'Банкетный зал' } },
      decor: [{ k: 'table', x: 0, y: 0 }, { k: 'table', x: 1, y: 0 }, { k: 'table', x: 0, y: 1 }, { k: 'counter', x: 2, y: 1 }, { k: 'car', x: 1, y: 2 }],
      lair: [1, 1], // здесь бродит свадебная стая
    },
    {
      id: 'wolfcamp', name: 'Стоянка «Волков»', num: 'М7', unique: true, ground: 'dirt',
      map: ['A..', '...', '...'], doors: [[0, 0, 1, 0]], search: [[0, 0, 'armory']],
      buildings: { A: { floor: 'wood', label: 'Сторожка' } },
      decor: [{ k: 'sniper_tower', x: 2, y: 0 }, { k: 'tires', x: 0, y: 2 }, { k: 'crates_pile', x: 2, y: 2 }, { k: 'woodpile', x: 1, y: 2 }, { k: 'barrier', x: 2, y: 1 }],
      perch: [2, 0], // вышка снайпера
      camp: [1, 1], // костёр и пленник
    },
    // уникальный тайл кампании (миссия 2): в пул уровня не входит, ставится правилами миссии
    {
      id: 'autobase', name: 'Автобаза №3', num: 'А3', unique: true,
      map: ['AA.', 'AA.', '...'], doors: [[1, 1, 2, 1], [0, 1, 0, 2]], search: [[0, 1, 'armory']],
      buildings: { A: { floor: 'concrete', label: 'Бокс' } },
      decor: [{ k: 'workbench', x: 0, y: 0 }, { k: 'tires', x: 1, y: 0 }, { k: 'locker', x: 1, y: 1 }, { k: 'cones', x: 0, y: 2 }],
      van: [2, 2], // где стоит фургон (выход миссии)
    },
    {
      id: 'crossroad', name: 'Перекрёсток', num: '01',
      manhole: [2, 1], map: ['...', '.#.', '...'], doors: [], search: [[0, 0]],
      buildings: {},
      decor: [{ k: 'bus', x: 1, y: 1 }, { k: 'zebra', x: 1, y: 0 }, { k: 'zebra', x: 1, y: 2 }, { k: 'trash', x: 0, y: 0 }],
    },
    {
      id: 'shop', name: 'Магазин 24/7', num: '02',
      manhole: [2, 2], map: ['AA.', 'AA.', '...'], doors: [[1, 1, 2, 1], [0, 1, 0, 2]], search: [[0, 0], [1, 1]],
      buildings: { A: { floor: 'tiles', label: '24/7' } },
      decor: [{ k: 'shelf', x: 0, y: 0 }, { k: 'shelf', x: 1, y: 0 }, { k: 'counter', x: 1, y: 1 }, { k: 'cart', x: 2, y: 2 }],
    },
    {
      id: 'house', name: 'Жилой дом', num: '03',
      manhole: [2, 0], map: ['AA.', 'A..', '..#'], doors: [[1, 0, 1, 1], [0, 1, 0, 2]], search: [[0, 0], [1, 0]],
      buildings: { A: { floor: 'wood', label: 'Подъезд 2' } },
      decor: [{ k: 'bed', x: 0, y: 0 }, { k: 'sofa', x: 1, y: 0 }, { k: 'table', x: 0, y: 1 }, { k: 'dumpster', x: 2, y: 2 }],
    },
    {
      id: 'gas', name: 'Заправка', num: '04',
      manhole: [0, 0], map: ['.A.', '...', '#.#'], doors: [[1, 0, 1, 1]], search: [[1, 0], [2, 1]],
      buildings: { A: { floor: 'tiles', label: 'АЗС' } },
      decor: [{ k: 'pump', x: 0, y: 2 }, { k: 'pump', x: 2, y: 2 }, { k: 'canopy', x: 1, y: 2 }, { k: 'car', x: 2, y: 1 }],
    },
    {
      id: 'pharmacy', name: 'Аптека', num: '05',
      manhole: [2, 0], map: ['...', 'AA.', '.A.'], doors: [[1, 1, 2, 1], [0, 1, 0, 0], [1, 2, 0, 2]], search: [[0, 1], [1, 2]],
      buildings: { A: { floor: 'clinic', label: 'Аптека' } },
      decor: [{ k: 'cross', x: 1, y: 1 }, { k: 'shelf', x: 0, y: 1 }, { k: 'counter', x: 1, y: 2 }, { k: 'car', x: 0, y: 0 }],
    },
    {
      id: 'park', name: 'Сквер', num: '06',
      manhole: [2, 0], map: ['#..', '...', '..#'], doors: [], search: [[2, 0]],
      buildings: {},
      decor: [{ k: 'trees', x: 0, y: 0 }, { k: 'trees', x: 2, y: 2 }, { k: 'bench', x: 2, y: 0 }, { k: 'fountain', x: 1, y: 1 }],
      ground: 'grass',
    },
    {
      id: 'garages', name: 'Гаражи', num: '07',
      manhole: [1, 0], map: ['A.B', '...', '#..'], doors: [[0, 0, 0, 1], [2, 0, 2, 1]], search: [[0, 0], [2, 0]],
      buildings: { A: { floor: 'concrete', label: 'Гараж 13' }, B: { floor: 'concrete', label: 'Гараж 14' } },
      decor: [{ k: 'workbench', x: 0, y: 0 }, { k: 'tires', x: 2, y: 0 }, { k: 'car', x: 0, y: 2 }],
    },
    {
      id: 'police', name: 'Опорный пункт', num: '08',
      manhole: [0, 2], map: ['AAA', '.A.', '...'], doors: [[1, 1, 1, 2], [0, 0, 0, 1]], search: [[0, 0], [2, 0, 'armory']],
      buildings: { A: { floor: 'concrete', label: 'Полиция' } },
      decor: [{ k: 'desk', x: 0, y: 0 }, { k: 'locker', x: 2, y: 0 }, { k: 'desk', x: 1, y: 1 }, { k: 'police_car', x: 2, y: 2 }],
    },
    {
      id: 'construction', name: 'Стройка', num: '09',
      manhole: [2, 0], map: ['#..', '.#.', '..A'], doors: [[2, 2, 1, 2], [2, 2, 2, 1]], search: [[2, 2], [0, 1]],
      buildings: { A: { floor: 'wood', label: 'Бытовка' } },
      decor: [{ k: 'crane', x: 0, y: 0 }, { k: 'pipes', x: 1, y: 1 }, { k: 'cones', x: 0, y: 1 }, { k: 'workbench', x: 2, y: 2 }],
      ground: 'dirt',
    },
    {
      // коридор с двумя классами: много дверей — рай для скрытности
      id: 'school', name: 'Школа', num: '10',
      manhole: [2, 2], map: ['A.B', 'KKK', '...'], doors: [[0, 0, 0, 1], [2, 0, 2, 1], [1, 1, 1, 0], [1, 1, 1, 2]], search: [[0, 0], [2, 0]],
      buildings: { A: { floor: 'wood', label: 'Класс 5А' }, B: { floor: 'wood', label: 'Класс 5Б' }, K: { floor: 'tiles', label: 'Школа' } },
      decor: [{ k: 'desks', x: 0, y: 0 }, { k: 'desks', x: 2, y: 0 }, { k: 'locker', x: 1, y: 1 }, { k: 'trash', x: 0, y: 2 }],
    },
    {
      // лабиринт прилавков: короткая линия огня, много обыска
      id: 'market', name: 'Рынок', num: '11',
      manhole: [2, 1], map: ['A.#', '...', '#.B'], doors: [[0, 0, 1, 0], [2, 2, 1, 2]], search: [[0, 0], [2, 2], [1, 1]],
      buildings: { A: { floor: 'concrete', label: 'Ларёк' }, B: { floor: 'tiles', label: 'Шаурма' } },
      decor: [{ k: 'stall', x: 2, y: 0 }, { k: 'stall', x: 0, y: 2 }, { k: 'crates_pile', x: 1, y: 1 }, { k: 'counter', x: 0, y: 0 }, { k: 'counter', x: 2, y: 2 }],
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
