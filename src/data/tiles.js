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
