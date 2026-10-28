/*
 * Levels. A level = a set of tiles + decks + scenarios + pressure parameters.
 * A new level (a new location) is added as a single object.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  ZG.Levels.add({
    id: 'outskirts',
    num: 1,
    name: 'Outskirts',
    subtitle: 'Level 1',
    text: 'A bedroom district on the edge of town. The first night after the fall.',
    layout: { tw: 4, th: 2 }, // 4×2 tiles = a 12×6 zone board
    tiles: ['crossroad', 'shop', 'house', 'gas', 'pharmacy', 'park', 'garages', 'police', 'construction', 'school', 'market'],
    // loot deck by rarity: common ×4, rare ×2, unique ×1 (+ Ambushes)
    loot: {
      spear: 4, crowbar: 4, medkit: 4, energy: 4, chocolate: 4, brick: 4, bandage_roll: 4, whistle: 4, canned: 4, garrote: 4, grenade: 4,
      bat: 2, machete: 2, pistol: 2, molotov: 2, firecracker: 2, sneakers: 2, backpack: 2, vest: 2, flashlight: 2, smoke: 2, nailgun: 2, rope: 2,
      shotgun: 1, katana: 1, army_medkit: 1,
      ambush: 6,
    },
    spawnDeck: ZG.SPAWN_DECK_L1,
    scenarios: ['fuel', 'meds', 'radio', 'nests'],
    conditions: ['calm', 'fog', 'rain', 'fullmoon', 'convoy', 'swarm', 'stash'],
    bonuses: ['quiet', 'hunter', 'scavenger', 'blitz', 'combo', 'unscathed', 'biggame'],
    rounds: 14,
    phaseStarts: [1, 4, 7], // Dusk from round 1, Night from round 4, Dead of Night from round 7
    hunger: { 2: 1 }, // Dead of Night: zombies +1 speed
    alarmThreshold: { 1: 4, 2: 5, 3: 6, 4: 4 }, // Wave threshold by squad size: a big squad makes more noise
    roundsBonus: { 3: 2, 4: 2 }, // a big squad has more goals — and a spare round
    startAlarm: { 3: 1, 4: 1 }, // a big squad is noisy: starting Alarm (below the Wave threshold)
    spawnPoints: { 1: 2, 2: 3, 3: 4, 4: 4 },
    events: ['ev_radio', 'ev_airdrop', 'ev_blackout', 'ev_silence', 'ev_gas', 'ev_survivor', 'ev_rush', 'ev_frenzy', 'ev_storm', 'ev_howl', 'ev_hound'],
    eventChance: 1 / 6, // at the start of a round (from the 2nd) a die: on a 6 — an event, otherwise a lull
    // bite: d6 ≤ die — Infection (hand: straight to hand; otherwise into the top `top` cards of the deck), otherwise a Wound;
    // an Infection is also a Wound (hurts); turning happens when an Infection has "sat" in hand until the end of a turn turnAt times
    infection: { die: 2, turnAt: 1, hand: true, hurts: true },
    maxAttackers: 3, // Crowding: no more than 3 zombies bite a hero per phase (the most dangerous ones)
    stealth: true, // stealth: zombies wander until they notice heroes (maximum Alarm gives everyone away)
    doors: true, // doors on building entrances: closed at the start, cover from distant zombies
    fog: true, // "Fog of War": tiles other than the start and exit tiles stay closed until scouted
    fogBreak: 8, // this many tokens in a closed tile's stack (zombies + decoys) — and it opens by itself
    decoys: true, // decoys: in the fog each zombie gets 2 tokens, each a 50/50 zombie or decoy
    drawMax: 3, // draw at the start of the turn — up to hand size, but no more than 3 cards
    hordeAlarm: 8, // in the "Special abilities" step: Alarm +1 for every 8 zombies on the board
    pool: { walker: 16, runner: 6, fatso: 4, screamer: 3, brute: 2, plague: 3, grabber: 3, hound: 1 }, // tokens in the box
  });

  // Campaign, mission 1: an easier Outskirts — a 3×2 tile board, only Shamblers and Runners, 1 zombie appears per manhole
  const base = ZG.Levels.get('outskirts');
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m1', campaignOnly: true,
    text: 'First sortie: a few blocks, weak dead.',
    layout: { tw: 3, th: 2 },
    zombieTypes: ['walker', 'runner'],
    spawnPerCard: 1,
    rounds: base.rounds + 2, // +2 rounds: the training mission should almost always be beatable
    spawnPoints: { 1: 2, 2: 1, 3: 2, 4: 3 }, // training: fewer manholes than on the Outskirts (2/3/4/4)
    infection: Object.assign({}, base.infection, { die: 1 }), // training: Infection only on a "1"
    alarmThreshold: { 1: 6, 2: 7, 3: 8, 4: 6 }, // and the Wave comes later (Outskirts: 4/5/6/4)
    medsNeed: { 1: 3, 2: 3, 3: 3, 4: 3 }, // training: 3 medicine for any squad (on the Outskirts 3–4 heroes need 4)
    startAlarm: {},
    roundsBonus: { 1: -2, 2: 2, 3: 1, 4: 0 }, // tuned for ~80% wins at any squad size
    events: base.events.filter((id) => id !== 'ev_hound'),
    scenarios: ['meds'], // story: medicine for the ambulance (no helicopter and nests — they break the story)
    bonuses: base.bonuses.filter((id) => id !== 'biggame'), // no Bloaters or Brutes here
  }));

  // Campaign, mission 3 "Forest": 6 special tiles (ranger station, pine forest ×3, clearing ×2), one manhole — the well at the station,
  // a special spawn deck (from Night, one at a time: Shambler/Runner alternating)
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m3', campaignOnly: true, num: 3, name: 'Forest',
    text: 'The forest outside town: a ranger station, pine woods, a power line clearing.',
    layout: { tw: 3, th: 2 },
    scenarios: ['forest'],
    bonuses: base.bonuses.filter((id) => id !== 'biggame'),
    conditions: ['calm'],
    spawnPoints: { 1: 1, 2: 1, 3: 1, 4: 1 },
    spawnDeck: { sp_forest: 1 },
    zombieTypes: ['walker', 'runner'],
    events: [],
    decoys: false,
    fogBreak: 0,
    rounds: 12,
    roundsBonus: { 1: 3 }, // solo — 15 rounds
  }));

  // Campaign, mission 4 "Highway": 8 ordinary tiles, 2 manholes (from Night 2 Shamblers each), 2 lurking packs, wandering bandits
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m4', campaignOnly: true, num: 4, name: 'Highway',
    text: 'A gas station by the highway: bandits, packs and manholes the dead crawl out of at night.',
    scenarios: ['highway'],
    bonuses: base.bonuses.filter((id) => id !== 'biggame'),
    conditions: ['calm'],
    spawnPoints: { 1: 2, 2: 2, 3: 2, 4: 2 },
    spawnDeck: { sp_chaos: 1 },
    loot: Object.assign({}, base.loot, { rig: 1, bandit_tt: 1 }), // a surprise: 2 rare pieces of gear, only here
    zombieTypes: ['walker', 'runner'],
    events: [],
    decoys: false,
    fogBreak: 0,
    rounds: 13,
    roundsBonus: { 1: -1 }, // solo — 12
  }));

  // Campaign, mission 5 "Bridge": only the Forester's gang (bandits, 2 snipers, the Forester), no zombies
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m5', campaignOnly: true, num: 5, name: 'Bridge',
    text: "The bridge checkpoint and the sawmill: the Forester's gang.",
    scenarios: ['bridge'],
    bonuses: base.bonuses.filter((id) => id !== 'biggame' && id !== 'quiet'), // no zombies: a Wave brings nothing
    conditions: ['calm'],
    spawnPoints: { 1: 0, 2: 0, 3: 0, 4: 0 },
    loot: Object.assign({}, base.loot, { ambush: 0 }), // no ambushes: no zombies appear in this mission
    events: [],
    decoys: false,
    fogBreak: 0,
    rounds: 11,
    roundsBonus: { 1: 1, 3: -2, 4: -3 }, // solo 12, duo 11, trio 9, four 8: a big squad is faster, but the gang is bigger
  }));

  // Campaign, mission 6 "Across the River": an ordinary suburb, no helicopter task (the heroes leave in the van — as in the epilogue)
  // Campaign, mission 6 "Churchyard": forest (2 left columns) and an old cemetery (2 right ones) with the Shining Cross
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m6', campaignOnly: true, num: 6, name: 'Churchyard',
    text: 'A forest road across the river and an old cemetery with a cross glowing above it.',
    scenarios: ['pogost'],
    conditions: ['calm'],
    spawnPoints: { 1: 2, 2: 2, 3: 2, 4: 2 }, // placed by the mission: 2 manholes in random tiles
    spawnDeck: { sp_pogost: 1 },
    zombieTypes: ['walker', 'runner', 'brute', 'grabber', 'screamer'], // churchyard ambushes
    events: [],
    rounds: 14,
    roundsBonus: { 2: -2, 3: -2, 4: -3 }, // a big squad takes longer to reach the exit — it gets less time
    startAlarm: { 3: 1, 4: 1 },
    alarmThreshold: { 1: 5, 2: 5, 3: 4, 4: 3 }, // a big squad is noisy — the Wave at the Cross comes more often
  }));

  // Campaign, mission 7 "White Swan": the bride and her retinue, the Wolves gang, two manholes (2nd and 3rd columns)
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m7', campaignOnly: true, num: 7, name: 'White Swan',
    text: 'A suburb across the river: the restaurant where a wedding was held, and the Wolves gang camp.',
    scenarios: ['wedding'],
    bonuses: base.bonuses.filter((id) => id !== 'biggame'),
    conditions: ['calm'],
    spawnPoints: { 1: 2, 2: 2, 3: 2, 4: 2 }, // placed by the mission: 2nd and 3rd columns
    spawnDeck: { sp_wedding: 1 },
    loot: Object.assign({}, base.loot, { hunt_double: 2, silver_knife: 1 }), // finds unique to this mission: rare ×2, unique ×1
    zombieTypes: ['walker', 'runner', 'fatso'],
    events: [],
    rounds: 16,
    roundsBonus: { 1: 3, 4: 1 }, // a loner needs longer to finish off the bride and the pack; four need longer to all reach the exit
    alarmThreshold: { 1: 7, 2: 6, 3: 6, 4: 6 }, // even difficulty for 1–4 heroes (the base level gives four a threshold of 4)
  }));

  // Campaign, mission 8 "High Noon": the farmers market by day — no fog, no manholes, no dusk, everything is on the board from the start.
  // 5×2 board: the market in the center, neutral strips on the sides (the 4×2 variant was tested: difficulty depends more on squad size).
  const m8 = {
    campaignOnly: true, num: 8, name: 'High Noon',
    text: 'The farmers market at noon: the Butcher in the meat row, the Wolves by the road.',
    scenarios: ['market'],
    conditions: ['noon'],
    bonuses: base.bonuses.filter((id) => id !== 'blitz'), // "before Dead of Night" — meaningless by day
    dayOnly: true, // no dusk, no night: the whole fight is in daylight
    phaseStarts: [1, 999, 999],
    fog: false,
    spawnPoints: { 1: 0, 2: 0, 3: 0, 4: 0 }, // no manholes: the Wave is Wolves reinforcements
    events: [],
    decoys: false,
    fogBreak: 0,
    startAlarm: {},
    rounds: 12,
    roundsBonus: {},
    alarmThreshold: { 1: 6, 2: 6, 3: 6, 4: 6 },
  };
  ZG.Levels.add(Object.assign({}, base, m8, { id: 'camp_m8', layout: { tw: 5, th: 2 } }));

  // Campaign, mission 2 "Motor Depot No. 3": 3×2 board, no manholes (nothing spawns), packs and Bloaters placed by the mission
  ZG.Levels.add(Object.assign({}, base, {
    id: 'camp_m2', campaignOnly: true, num: 2, name: 'Motor Depot',
    text: 'A motor depot on the edge of the district: lurking dead and a van in the yard.',
    layout: { tw: 3, th: 2 },
    scenarios: ['autobase'],
    conditions: ['calm'],
    spawnPoints: { 1: 0, 2: 0, 3: 0, 4: 0 },
    events: [], // no events: only what is placed in advance
    decoys: false,
    fogBreak: 0, // no stacks in the fog — no breakout needed
    rounds: 10,
    roundsBonus: { 1: 5, 4: -2 }, // solo: +5 rounds (one hero needs long to finish two Bloaters, and the fight wakes everyone); four: −2 (sweeps the district fast)
    infection: Object.assign({}, base.infection, { die: 1 }), // training: Infection only on a "1"
  }));
})(typeof globalThis !== 'undefined' ? globalThis : window);
