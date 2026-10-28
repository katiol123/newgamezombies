/*
 * Board tiles of 3×3 zones (physically — square cardboard tiles 15×15 cm).
 *   map:    '.' street, a letter — an interior (building), '#' — impassable (car, trees, rubble)
 *   doors:  passages between cells [x1,y1,x2,y2] (street↔building, building↔building)
 *   search: cells with a Search token; armory — an "armory" search (draw 1 more card)
 *   manhole: the manhole position (spawn point) printed on the tile
 *   decor:  purely visual elements (for rendering)
 * A tile is rotated by 0/90/180/270°.
 *
 * TILE DESIGN RULE (guarantees connectivity of any layout, including in fog):
 *   1) the middle of each side (zones [1,0] [0,1] [2,1] [1,2]) is passable: a street
 *      or an interior — then it has an entrance right from that side of the tile;
 *   2) all zones of the tile can reach each other inside the tile.
 * Checked automatically (tools/test.js).
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  ZG.Tiles.addAll([
    // --- Forest (campaign, mission 3): special tiles, not in the level pool ---
    {
      id: 'kordon', name: 'Ranger Station', num: 'F1', unique: true, ground: 'dirt',
      manhole: [0, 2], // the old well — the dead climb out of it
      map: ['AA.', 'AA.', '...'], doors: [[1, 1, 2, 1], [0, 1, 0, 2]], search: [[1, 0]],
      buildings: { A: { floor: 'wood', label: 'Cabin' } },
      decor: [{ k: 'table', x: 0, y: 0 }, { k: 'bed', x: 1, y: 0 }, { k: 'well', x: 0, y: 2 }, { k: 'woodpile', x: 2, y: 0 }],
      van: [2, 2], // the van is parked here
    },
    {
      id: 'bor', name: 'Pine Forest', num: 'F2', unique: true, ground: 'grass',
      map: ['#.#', '...', '#.#'], doors: [], search: [],
      buildings: {},
      decor: [{ k: 'pines', x: 0, y: 0 }, { k: 'pines', x: 2, y: 0 }, { k: 'pines', x: 0, y: 2 }, { k: 'pines', x: 2, y: 2 }, { k: 'stump', x: 1, y: 0 }, { k: 'logs', x: 2, y: 1 }],
    },
    {
      id: 'proseka', name: 'Power Line Clearing', num: 'F3', unique: true, ground: 'grass',
      map: ['...', '.#.', '...'], doors: [], search: [[0, 0]],
      buildings: {},
      decor: [{ k: 'pylon', x: 1, y: 1 }, { k: 'stump', x: 2, y: 2 }, { k: 'pine', x: 2, y: 0 }],
    },
    // --- Churchyard (campaign, mission 6): the old cemetery across the river ---
    {
      id: 'pogost_graves', name: 'Old Graves', num: 'C1', unique: true, ground: 'grass',
      map: ['...', '...', '...'], doors: [], search: [[2, 0]],
      buildings: {},
      decor: [{ k: 'graves', x: 0, y: 0 }, { k: 'graves', x: 2, y: 2 }, { k: 'graves', x: 0, y: 2 }, { k: 'fence', x: 1, y: 0 }, { k: 'pine', x: 2, y: 1 }],
    },
    {
      id: 'pogost_crypts', name: 'Crypts', num: 'C2', unique: true, ground: 'grass',
      map: ['#..', '...', '..#'], doors: [], search: [[2, 0]],
      buildings: {},
      decor: [{ k: 'crypt', x: 0, y: 0 }, { k: 'crypt', x: 2, y: 2 }, { k: 'graves', x: 1, y: 0 }, { k: 'graves', x: 0, y: 2 }, { k: 'fence', x: 2, y: 1 }],
    },
    {
      id: 'pogost_chapel', name: 'Chapel', num: 'C3', unique: true, ground: 'grass',
      map: ['AA.', 'AA.', '...'], doors: [[1, 1, 2, 1], [0, 1, 0, 2]], search: [[0, 0, 'armory']],
      buildings: { A: { floor: 'wood', label: 'Chapel' } },
      decor: [{ k: 'pews', x: 0, y: 0 }, { k: 'pews', x: 1, y: 0 }, { k: 'candles', x: 1, y: 1 }, { k: 'graves', x: 2, y: 2 }, { k: 'graves', x: 0, y: 2 }],
    },
    {
      id: 'krest', name: 'Shining Cross', num: 'C4', unique: true, ground: 'grass',
      map: ['A..', '...', '...'], doors: [[0, 0, 1, 0], [0, 0, 0, 1]], search: [],
      buildings: { A: { floor: 'wood', label: 'Lodge' } },
      decor: [{ k: 'big_cross', x: 1, y: 1 }, { k: 'graves', x: 2, y: 0 }, { k: 'graves', x: 0, y: 2 }, { k: 'graves', x: 2, y: 2 }, { k: 'table', x: 0, y: 0 }],
      lodge: [0, 0], // the watchman's lodge: the radio is here
      frenzy: true, // "Frenzy": the dead on this tile act twice
    },
    // --- Bridge (campaign, mission 5): the Forester's gang lair ---
    {
      id: 'checkpoint', name: 'Bridge Checkpoint', num: 'Br1', unique: true,
      map: ['A.#', '...', '...'], doors: [[0, 0, 0, 1], [0, 0, 1, 0]], search: [[0, 0, 'armory']],
      buildings: { A: { floor: 'wood', label: 'Booth' } },
      decor: [{ k: 'blocks', x: 2, y: 0 }, { k: 'sandbags', x: 1, y: 1 }, { k: 'sniper_tower', x: 0, y: 2 }, { k: 'barrier', x: 2, y: 1 }, { k: 'table', x: 0, y: 0 }],
      barrier: [2, 1], // the barrier onto the bridge — the exit
      perch: [0, 2], // sniper tower
      cover: [[1, 1]], // sandbags: cover from shots
    },
    {
      id: 'sawmill', name: 'Sawmill', num: 'Br2', unique: true, ground: 'dirt',
      map: ['A..', 'A..', '...'], doors: [[0, 0, 1, 0], [0, 1, 1, 1]], search: [],
      buildings: { A: { floor: 'wood', label: "Forester's Hut" } },
      decor: [{ k: 'bed', x: 0, y: 0 }, { k: 'bearskin', x: 0, y: 0 }, { k: 'table', x: 0, y: 1 }, { k: 'logstack', x: 2, y: 0 }, { k: 'saw', x: 1, y: 1 }, { k: 'console', x: 2, y: 1 }, { k: 'woodpile', x: 1, y: 2 }],
      lair: [0, 0], // the Forester sleeps here
      perch: [2, 0], // log pile — the second sniper's position
      saw: [1, 1], // the saw frame: trap zone
      console: [2, 1], // saw control panel
    },
    // unique tiles of mission 8: the collective-farm market (one tile — 5×2 board; two — west and east rows, 4×2 board)
    {
      id: 'kolhoz', name: 'Farmers Market', num: 'Mk1', unique: true,
      map: ['...', '...', '...'], doors: [], search: [[0, 0, 'armory'], [2, 0, 'armory'], [1, 2, 'armory']],
      buildings: {},
      decor: [{ k: 'stall', x: 0, y: 0 }, { k: 'stall', x: 2, y: 0 }, { k: 'crates_pile', x: 1, y: 2 }, { k: 'stall', x: 0, y: 2 }, { k: 'stall', x: 2, y: 2 }, { k: 'cart', x: 0, y: 1 }],
      lair: [1, 1], // the meat row: the Butcher is here
    },
    {
      id: 'kolhoz_w', name: 'Market · West Rows', num: 'Mk2', unique: true,
      map: ['...', '...', '...'], doors: [], search: [[1, 0, 'armory'], [1, 2, 'armory']],
      buildings: {},
      decor: [{ k: 'stall', x: 0, y: 0 }, { k: 'stall', x: 1, y: 0 }, { k: 'stall', x: 0, y: 2 }, { k: 'cart', x: 1, y: 2 }, { k: 'crates_pile', x: 2, y: 2 }],
      lair: [2, 1], // the meat row where two tiles meet
    },
    {
      id: 'kolhoz_e', name: 'Market · East Rows', num: 'Mk3', unique: true,
      map: ['...', '...', '...'], doors: [], search: [[1, 1, 'armory']],
      buildings: {},
      decor: [{ k: 'stall', x: 1, y: 0 }, { k: 'stall', x: 2, y: 0 }, { k: 'stall', x: 2, y: 2 }, { k: 'trash', x: 0, y: 2 }],
    },
    // unique tiles of mission 7: the restaurant where the wedding was held, and the Wolves gang camp
    {
      id: 'banquet', name: 'White Swan Restaurant', num: 'Sw1', unique: true,
      map: ['AAA', 'AAA', '...'], doors: [[0, 1, 0, 2], [2, 1, 2, 2]], search: [[2, 0, 'armory']],
      buildings: { A: { floor: 'wood', label: 'Banquet Hall' } },
      decor: [{ k: 'table', x: 0, y: 0 }, { k: 'table', x: 1, y: 0 }, { k: 'table', x: 0, y: 1 }, { k: 'counter', x: 2, y: 1 }, { k: 'car', x: 1, y: 2 }],
      lair: [1, 1], // the wedding pack roams here
    },
    {
      id: 'wolfcamp', name: 'Wolves Camp', num: 'Wf1', unique: true, ground: 'dirt',
      map: ['A..', '...', '...'], doors: [[0, 0, 1, 0]], search: [[0, 0, 'armory']],
      buildings: { A: { floor: 'wood', label: 'Guardhouse' } },
      decor: [{ k: 'sniper_tower', x: 2, y: 0 }, { k: 'tires', x: 0, y: 2 }, { k: 'crates_pile', x: 2, y: 2 }, { k: 'woodpile', x: 1, y: 2 }, { k: 'barrier', x: 2, y: 1 }],
      perch: [2, 0], // sniper tower
      camp: [1, 1], // campfire and the prisoner
    },
    // unique campaign tile (mission 2): not in the level pool, placed by the mission rules
    {
      id: 'autobase', name: 'Motor Depot No. 3', num: 'D3', unique: true,
      map: ['AA.', 'AA.', '...'], doors: [[1, 1, 2, 1], [0, 1, 0, 2]], search: [[0, 1, 'armory']],
      buildings: { A: { floor: 'concrete', label: 'Garage Bay' } },
      decor: [{ k: 'workbench', x: 0, y: 0 }, { k: 'tires', x: 1, y: 0 }, { k: 'locker', x: 1, y: 1 }, { k: 'cones', x: 0, y: 2 }],
      van: [2, 2], // where the van stands (mission exit)
    },
    {
      id: 'crossroad', name: 'Crossroads', num: '01',
      manhole: [2, 1], map: ['...', '.#.', '...'], doors: [], search: [[0, 0]],
      buildings: {},
      decor: [{ k: 'bus', x: 1, y: 1 }, { k: 'zebra', x: 1, y: 0 }, { k: 'zebra', x: 1, y: 2 }, { k: 'trash', x: 0, y: 0 }],
    },
    {
      id: 'shop', name: '24/7 Store', num: '02',
      manhole: [2, 2], map: ['AA.', 'AA.', '...'], doors: [[1, 1, 2, 1], [0, 1, 0, 2]], search: [[0, 0], [1, 1]],
      buildings: { A: { floor: 'tiles', label: '24/7' } },
      decor: [{ k: 'shelf', x: 0, y: 0 }, { k: 'shelf', x: 1, y: 0 }, { k: 'counter', x: 1, y: 1 }, { k: 'cart', x: 2, y: 2 }],
    },
    {
      id: 'house', name: 'Apartment Block', num: '03',
      manhole: [2, 0], map: ['AA.', 'A..', '..#'], doors: [[1, 0, 1, 1], [0, 1, 0, 2]], search: [[0, 0], [1, 0]],
      buildings: { A: { floor: 'wood', label: 'Entrance 2' } },
      decor: [{ k: 'bed', x: 0, y: 0 }, { k: 'sofa', x: 1, y: 0 }, { k: 'table', x: 0, y: 1 }, { k: 'dumpster', x: 2, y: 2 }],
    },
    {
      id: 'gas', name: 'Gas Station', num: '04',
      manhole: [0, 0], map: ['.A.', '...', '#.#'], doors: [[1, 0, 1, 1]], search: [[1, 0], [2, 1]],
      buildings: { A: { floor: 'tiles', label: 'Gas Station' } },
      decor: [{ k: 'pump', x: 0, y: 2 }, { k: 'pump', x: 2, y: 2 }, { k: 'canopy', x: 1, y: 2 }, { k: 'car', x: 2, y: 1 }],
    },
    {
      id: 'pharmacy', name: 'Pharmacy', num: '05',
      manhole: [2, 0], map: ['...', 'AA.', '.A.'], doors: [[1, 1, 2, 1], [0, 1, 0, 0], [1, 2, 0, 2]], search: [[0, 1], [1, 2]],
      buildings: { A: { floor: 'clinic', label: 'Pharmacy' } },
      decor: [{ k: 'cross', x: 1, y: 1 }, { k: 'shelf', x: 0, y: 1 }, { k: 'counter', x: 1, y: 2 }, { k: 'car', x: 0, y: 0 }],
    },
    {
      id: 'park', name: 'Park', num: '06',
      manhole: [2, 0], map: ['#..', '...', '..#'], doors: [], search: [[2, 0]],
      buildings: {},
      decor: [{ k: 'trees', x: 0, y: 0 }, { k: 'trees', x: 2, y: 2 }, { k: 'bench', x: 2, y: 0 }, { k: 'fountain', x: 1, y: 1 }],
      ground: 'grass',
    },
    {
      id: 'garages', name: 'Garages', num: '07',
      manhole: [1, 0], map: ['A.B', '...', '#..'], doors: [[0, 0, 0, 1], [2, 0, 2, 1]], search: [[0, 0], [2, 0]],
      buildings: { A: { floor: 'concrete', label: 'Garage 13' }, B: { floor: 'concrete', label: 'Garage 14' } },
      decor: [{ k: 'workbench', x: 0, y: 0 }, { k: 'tires', x: 2, y: 0 }, { k: 'car', x: 0, y: 2 }],
    },
    {
      id: 'police', name: 'Police Post', num: '08',
      manhole: [0, 2], map: ['AAA', '.A.', '...'], doors: [[1, 1, 1, 2], [0, 0, 0, 1]], search: [[0, 0], [2, 0, 'armory']],
      buildings: { A: { floor: 'concrete', label: 'Police' } },
      decor: [{ k: 'desk', x: 0, y: 0 }, { k: 'locker', x: 2, y: 0 }, { k: 'desk', x: 1, y: 1 }, { k: 'police_car', x: 2, y: 2 }],
    },
    {
      id: 'construction', name: 'Building Site', num: '09',
      manhole: [2, 0], map: ['#..', '.#.', '..A'], doors: [[2, 2, 1, 2], [2, 2, 2, 1]], search: [[2, 2], [0, 1]],
      buildings: { A: { floor: 'wood', label: 'Site Trailer' } },
      decor: [{ k: 'crane', x: 0, y: 0 }, { k: 'pipes', x: 1, y: 1 }, { k: 'cones', x: 0, y: 1 }, { k: 'workbench', x: 2, y: 2 }],
      ground: 'dirt',
    },
    {
      // a corridor with two classrooms: lots of doors — a paradise for stealth
      id: 'school', name: 'School', num: '10',
      manhole: [2, 2], map: ['A.B', 'KKK', '...'], doors: [[0, 0, 0, 1], [2, 0, 2, 1], [1, 1, 1, 0], [1, 1, 1, 2]], search: [[0, 0], [2, 0]],
      buildings: { A: { floor: 'wood', label: 'Class 5A' }, B: { floor: 'wood', label: 'Class 5B' }, K: { floor: 'tiles', label: 'School' } },
      decor: [{ k: 'desks', x: 0, y: 0 }, { k: 'desks', x: 2, y: 0 }, { k: 'locker', x: 1, y: 1 }, { k: 'trash', x: 0, y: 2 }],
    },
    {
      // a maze of stalls: short lines of fire, lots of searching
      id: 'market', name: 'Market', num: '11',
      manhole: [2, 1], map: ['A.#', '...', '#.B'], doors: [[0, 0, 1, 0], [2, 2, 1, 2]], search: [[0, 0], [2, 2], [1, 1]],
      buildings: { A: { floor: 'concrete', label: 'Kiosk' }, B: { floor: 'tiles', label: 'Shawarma' } },
      decor: [{ k: 'stall', x: 2, y: 0 }, { k: 'stall', x: 0, y: 2 }, { k: 'crates_pile', x: 1, y: 1 }, { k: 'counter', x: 0, y: 0 }, { k: 'counter', x: 2, y: 2 }],
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
