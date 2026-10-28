/*
 * Scenarios (mission goals), game conditions and difficulty levels.
 *
 * A scenario describes:
 *   setup(g, E)              — place crates/tower/nests (E — the engine API)
 *   goals(g)                 — list of goals for the interface [{text, done}]
 *   isComplete(g)            — whether evacuation is open
 *   actions(g, hero, E)      — extra hero actions
 *   botGoal(g, hero, E)      — where the bot should head (a cell)
 *   progress(g)              — numeric progress (for the bot and statistics)
 *   roundEnd(g, E)           — effects at the end of the round
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  const E0 = () => ZG.Engine;
  // Shared "find cargo in crates → deliver it" logic
  // cargo held by the squad: in hands + lying on the ground (dropW — its weight; for AI progress it is half, otherwise the bot will not pick it up)
  function cargoInHands(g, cargoId, dropW) {
    let n = 0;
    g.heroes.forEach((h) => h.hand.forEach((u) => { if (g.cards[u] === cargoId) n++; }));
    return n + g.drops.filter((d) => d.card === cargoId).length * (dropW == null ? 1 : dropW);
  }
  function fetchBotGoal(g, hero, E, cargoId, deliverCell) {
    const carrying = hero.hand.some((u) => g.cards[u] === cargoId);
    // cargo dropped by a fallen hero must also be picked up: cargoInHands counts it as "available", so crates are targeted only beyond it
    const drops = g.drops.filter((d) => d.card === cargoId).map((d) => d.pos);
    const need = g.obj.need - g.obj.delivered - cargoInHands(g, cargoId);
    const options = drops.concat(need > 0 ? g.crates.filter((c) => !c.opened).map((c) => c.pos) : []);
    if ((need > 0 || drops.length) && options.length) {
      const near = E.nearest(g, hero.pos, options);
      if (!carrying) return near;
      // grab more on the way if a crate is closer than the delivery point
      const d = E.dist(g, hero.pos);
      if (d[near] < d[deliverCell]) return near;
    }
    return carrying ? deliverCell : null;
  }
  function deliverAction(g, hero, cargoId, cell, label) {
    if (hero.pos !== cell) return [];
    const uid = hero.hand.find((u) => g.cards[u] === cargoId);
    if (!uid) return [];
    return [{ t: 'scenario', key: 'deliver', cost: 0, label }];
  }
  function doDeliver(g, hero, E, cargoId, what) {
    const uid = hero.hand.find((u) => g.cards[u] === cargoId);
    hero.hand.splice(hero.hand.indexOf(uid), 1);
    g.obj.delivered++;
    E.log(g, `${E.heroName(hero)} delivers: ${what} (${g.obj.delivered}/${g.obj.need}).`, 'good');
    E.fx(g, { t: 'objective', pos: hero.pos, text: `${g.obj.delivered}/${g.obj.need}` });
  }

  ZG.Scenarios.addAll([
    {
      setupText: 'Crates: 4, with jerrycans: 2 (with 3–4 heroes: 5 crates, 3 jerrycans — all needed). Exit — the Car.', id: 'fuel', name: 'Running on Empty', short: 'Find 2 jerrycans and fuel up the car.',
      brief: 'The car at the edge of the block has died. Jerrycans are hidden around — but not every crate holds fuel.',
      crates: 4, real: 2, cargo: 'cargo_fuel', exitLabel: 'Car', exitArt: 'exit_car',
      setup(g, E) { const big = ZG.Engine.party(g) >= 3 ? 1 : 0; g.obj = { delivered: 0, need: 2 + big }; E.placeCrates(g, this.crates + big, this.real + big, this.cargo); },
      goals(g) {
        return [
          { text: `Fuel the car: ${g.obj.delivered}/${g.obj.need} jerrycans`, done: g.obj.delivered >= g.obj.need },
          { text: 'All survivors get in the car', done: false },
        ];
      },
      isComplete(g) { return g.obj.delivered >= g.obj.need; },
      actions(g, hero) { return deliverAction(g, hero, this.cargo, g.exit, 'Fuel the car'); },
      doAction(g, hero, key, E) { if (key === 'deliver') doDeliver(g, hero, E, this.cargo, 'a jerrycan'); },
      botGoal(g, hero, E) { return fetchBotGoal(g, hero, E, this.cargo, g.exit); },
      progress(g) { return g.obj.delivered * 2 + cargoInHands(g, this.cargo, 0.5); },
    },
    {
      setupText: 'Crates: 7, with medicine: 6 (need 3, with 3–4 heroes — 4). Exit — the Ambulance.', id: 'meds', name: 'Medicine Run', short: 'Gather medicine for the ambulance (3, with 3–4 heroes — 4).',
      brief: 'The ambulance is full of wounded who need medicine. Seven crates, six with medicine; three are needed (four for a big squad).',
      crates: 7, real: 6, cargo: 'cargo_meds', exitLabel: 'Ambulance', exitArt: 'exit_ambulance',
      setup(g, E) { const L = ZG.Levels.get(g.levelId), n = ZG.Engine.party(g); g.obj = { delivered: 0, need: (L.medsNeed && L.medsNeed[n]) || (n >= 3 ? 4 : 3) }; E.placeCrates(g, this.crates, this.real, this.cargo); }, // a level may set its own number (training M1 — 3 for any squad)
      goals(g) {
        return [
          { text: `Load the medicine: ${g.obj.delivered}/${g.obj.need}`, done: g.obj.delivered >= g.obj.need },
          { text: 'All survivors leave in the ambulance', done: false },
        ];
      },
      isComplete(g) { return g.obj.delivered >= g.obj.need; },
      actions(g, hero) { return deliverAction(g, hero, this.cargo, g.exit, 'Load the medicine'); },
      doAction(g, hero, key, E) { if (key === 'deliver') doDeliver(g, hero, E, this.cargo, 'medicine'); },
      botGoal(g, hero, E) { return fetchBotGoal(g, hero, E, this.cargo, g.exit); },
      progress(g) { return g.obj.delivered * 2 + cargoInHands(g, this.cargo, 0.5); },
    },
    {
      setupText: 'Crates: 3, with the radio: 1. Tower — the building in the middle column (that tile is open from the start). Exit (Helicopter) — the street zone nearest the tower. Transmission: 2 rounds, with 3–4 heroes — 3.', id: 'radio', name: 'Last Broadcast', short: 'Find the radio, go on air from the tower, hold out 2 rounds (3 with 3–4 heroes) and fly away.',
      brief: 'Rescuers are waiting for a signal. The radio is in one of three crates. Broadcasting from the tower is heard across the whole block.',
      crates: 3, real: 1, cargo: 'cargo_radio', exitLabel: 'Helicopter', exitArt: 'exit_heli',
      setup(g, E) {
        g.obj = { delivered: 0, need: 1, transmit: 0, transmitNeed: ZG.Engine.party(g) >= 3 ? 3 : 2, on: false };
        g.tower = E.placeTower(g);
        E.placeExitNear(g, g.tower);
        // in the fog the start tile and the tower tile are open (the helicopter lands there)
        if (g.revealed) g.revealed = g.board.tiles.map((t, i) => i === g.board.cells[g.start].tile || i === g.board.cells[g.tower].tile);
        E.placeCrates(g, this.crates, this.real, this.cargo, [g.tower]);
      },
      goals(g) {
        return [
          { text: 'Bring the radio to the tower', done: g.obj.on },
          { text: `Transmission: ${g.obj.transmit}/${g.obj.transmitNeed} rounds (hero on the tower)`, done: g.obj.transmit >= g.obj.transmitNeed },
          { text: 'All survivors fly away by helicopter', done: false },
        ];
      },
      isComplete(g) { return g.obj.transmit >= g.obj.transmitNeed; },
      actions(g, hero) {
        if (g.obj.on || hero.pos !== g.tower) return [];
        if (!hero.hand.some((u) => g.cards[u] === this.cargo)) return [];
        return [{ t: 'scenario', key: 'activate', cost: 1, label: 'Go on Air' }];
      },
      doAction(g, hero, key, E) {
        if (key !== 'activate') return;
        const uid = hero.hand.find((u) => g.cards[u] === this.cargo);
        hero.hand.splice(hero.hand.indexOf(uid), 1);
        g.obj.on = true;
        E.raiseAlarm(g, 2, 'On the air');
        E.log(g, `${E.heroName(hero)} switches on the radio! Hold the tower for ${g.obj.transmitNeed} rounds.`, 'good');
        E.fx(g, { t: 'objective', pos: hero.pos, text: 'ON AIR' });
      },
      roundEnd(g, E) {
        if (!g.obj.on || g.obj.transmit >= g.obj.transmitNeed) return;
        const held = g.heroes.some((h) => h.onBoard && h.pos === g.tower);
        if (held) {
          g.obj.transmit++;
          E.log(g, `Transmitting: ${g.obj.transmit}/${g.obj.transmitNeed}.`, 'good');
          E.fx(g, { t: 'objective', pos: g.tower, text: `${g.obj.transmit}/${g.obj.transmitNeed}` });
          if (g.obj.transmit >= g.obj.transmitNeed) E.log(g, 'The helicopter is on its way! Run to the landing pad.', 'good');
        } else E.log(g, 'Nobody on the tower — transmission interrupted.', 'bad');
      },
      botGoal(g, hero, E) {
        if (!g.obj.on) {
          if (hero.hand.some((u) => g.cards[u] === this.cargo)) return g.tower;
          if (cargoInHands(g, this.cargo) > 0) return g.tower;
          const opts = g.crates.filter((c) => !c.opened).map((c) => c.pos).concat(g.drops.map((d) => d.pos));
          return E.nearest(g, hero.pos, opts);
        }
        if (g.obj.transmit < g.obj.transmitNeed) return g.tower;
        return null;
      },
      progress(g) { return (g.obj.on ? 2 : cargoInHands(g, this.cargo, 0.5)) + g.obj.transmit * 1.5; },
    },
    {
      setupText: 'Nests: solo 1, two 2, three–four 3 (tile centers, starting from the right column). No crates. Exit — the Pickup.', id: 'nests', name: 'Burn the Nests', short: 'Destroy the nests (1–3 depending on the number of heroes) and leave.',
      brief: 'The infection spreads from nests. While they live the block cannot be cleared. Nests spawn the dead by themselves.',
      exitLabel: 'Pickup', exitArt: 'exit_car',
      setup(g, E) { const n = Math.min(3, ZG.Engine.party(g) === 1 ? 1 : ZG.Engine.party(g) >= 3 ? 3 : 2); g.obj = { nests: n }; E.placeNests(g, n); },
      nestsLeft(g) { return g.zombies.filter((z) => z.type === 'nest').length; },
      goals(g) {
        const left = this.nestsLeft(g);
        return [
          { text: `Destroy the nests: ${g.obj.nests - left}/${g.obj.nests}`, done: left === 0 },
          { text: 'All survivors leave in the pickup', done: false },
        ];
      },
      isComplete(g) { return this.nestsLeft(g) === 0; },
      actions() { return []; },
      botGoal(g, hero, E) {
        const nests = g.zombies.filter((z) => z.type === 'nest').map((z) => z.pos);
        return nests.length ? E.nearest(g, hero.pos, nests) : null;
      },
      progress(g) { return (g.obj.nests - this.nestsLeft(g)) * 2; },
    },
    // --- Campaign, mission 3 "Forest": find the battery → signal from the tower → twist: return to the van ---
    {
      id: 'forest', campaignOnly: true, name: 'Signal from the Forest',
      short: 'Find the battery in the pine woods, carry it to the fire tower and send a signal.',
      brief: 'The convoy has stopped beyond the forest. A helicopter will pick up whoever sends a signal. There is a fire tower with a radio in the clearing, but its battery died long ago.',
      setupText: 'A 3×2 board of forest tiles: Ranger Station (start; the well is a spawn point; the van is in the yard), Pine Forest ×3, Power Line Clearing ×2. The fire tower is in the clearing in the far column (that tile is open from the start). Put the "Tower" story event card face down nearby without reading it: draw it when a hero with the battery sends the signal from the tower. A crate in the center of each pine forest; one of them holds the battery. A Rogue Bear lurks in one of the pine forests. On the 4 closed tiles — "Pack/Empty" cards (1 "Pack").',
      exitLabel: 'Van', exitArt: 'exit_van',
      packs: { 1: ['walker', 'walker', 'runner'], 2: ['walker', 'walker', 'runner'], 3: ['walker', 'walker', 'walker', 'runner', 'runner'], 4: ['walker', 'walker', 'walker', 'runner', 'runner', 'runner'] },
      failTitle: 'The Signal Failed',
      failText: 'The battery clicked into place, the radio lamps filled with a murky light — and the speaker hissed with empty, dead air. The antenna cable is chewed through to the copper. On the pole — tufts of brown fur and deep claw furrows, as if the beast knew that someone would call for help here. A note is pinned to the radio, scratched in charcoal by a shaking hand: "No signal. The convoy will spend the night at the bridge on the highway and leave at dawn. Catch up. Stay out of the pine woods. — The Forester." Below, in different handwriting, sweeping and crooked: "HE IS NOT THE FORESTER ANYMORE".',
      newTask: 'Return to the van at the ranger station and all drive off to the bridge',
      // cardboard version: a sealed story event card — the players do not know in advance what happens after the signal
      plotCard: {
        name: 'Tower',
        when: 'Draw it when a hero with the battery on the tower cell spends 1 ⚡ on "Send Signal".',
        effect: 'The signal failed: discard the battery. Noise 2 from the tower. The radio crackle woke the well: awake Shambler ×2 + Runner (3–4 heroes: Shambler ×3 + Runner) appear in the well zone and head for the van. New task: return to the van at the ranger station and all drive off.',
      },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng;
        const at = (ti, lx, ly) => b.cells.find((c) => c.tile === ti && c.lx === lx && c.ly === ly);
        const kt = b.cells[g.start].tile;
        const kdef = ZG.Tiles.get('kordon');
        g.spawnPoints = [at(kt, kdef.manhole[0], kdef.manhole[1]).i]; // the well at the ranger station
        g.exit = at(kt, kdef.van[0], kdef.van[1]).i; // the van in the yard
        const bors = b.tiles.map((t, i) => (t.id === 'bor' ? i : -1)).filter((i) => i >= 0);
        const pros = b.tiles.map((t, i) => (t.id === 'proseka' ? i : -1)).filter((i) => i >= 0);
        const far = Math.max.apply(null, pros.map((i) => b.tiles[i].tx));
        const tt = Rng.pick(g, pros.filter((i) => b.tiles[i].tx === far)); // the tower is in the far clearing
        g.tower = [at(tt, 0, 0), at(tt, 0, 2)].sort((a, b) => a.y - b.y || b.x - a.x)[0].i; // the upper corner — away from the tile caption
        g.towerLabel = 'TOWER';
        // crates: one in the center of each pine forest, one of them holds the battery
        const real = Rng.int(g, bors.length);
        bors.forEach((ti, k) => g.crates.push({ pos: at(ti, 1, 1).i, card: k === real ? 'cargo_battery' : null, opened: false }));
        // the Rogue Bear lurks in one of the pine forests
        const bt = Rng.pick(g, bors);
        const bear = E.lurker(g, 'bear', at(bt, 1, 2).i);
        g.obj = { attempted: false, bear: bear && bear.uid };
        // fog: the ranger station and the tower tile are open (the tower is visible above the forest)
        if (g.revealed) g.revealed = b.tiles.map((t, i) => i === kt || i === tt);
        // one pack under the "Pack/Empty" cards on closed tiles
        const cand = b.tiles.map((t, i) => i).filter((i) => i !== kt && i !== tt);
        E.placePacks(g, cand, 1, this.packs[Math.min(4, ZG.Engine.party(g))]);
      },
      hasBattery(g) { return g.heroes.some((h) => h.hand.some((u) => g.cards[u] === 'cargo_battery')) || g.drops.some((d) => d.card === 'cargo_battery'); },
      goals(g) {
        if (!g.obj.attempted) {
          return [
            { text: 'Find the battery in the pine woods (crates)', done: this.hasBattery(g) },
            { text: 'Carry it to the fire tower and send a signal', done: false },
          ];
        }
        return [
          { text: 'Find the battery in the pine woods', done: true },
          { text: 'Send a signal from the fire tower', failed: true, note: 'The antenna is chewed through — no signal' },
          { text: this.newTask, isNew: true, done: false },
        ];
      },
      isComplete(g) { return g.obj.attempted; },
      actions(g, hero) {
        if (g.obj.attempted || hero.pos !== g.tower) return [];
        if (!hero.hand.some((u) => g.cards[u] === 'cargo_battery')) return [];
        return [{ t: 'scenario', key: 'signal', cost: 1, label: 'Send Signal' }];
      },
      doAction(g, hero, key, E) {
        if (key !== 'signal') return;
        const uid = hero.hand.find((u) => g.cards[u] === 'cargo_battery');
        hero.hand.splice(hero.hand.indexOf(uid), 1);
        g.obj.attempted = true;
        E.hear(g, g.tower, 2, hero.idx); // the radio crackle carries through the forest
        E.log(g, `${E.heroName(hero)} connects the battery… ${this.failTitle}! The antenna is chewed through, the forester left a note: the convoy is waiting at the bridge. New task — return to the van and drive off.`, 'bad');
        E.fx(g, { t: 'twist', title: this.failTitle, text: this.failText, task: this.newTask, pos: hero.pos, art: g.stories && g.stories.twist });
        // the radio crackle woke the well: a pack climbs out of the well shaft by the van — the way back will be hard
        const well = g.spawnPoints[0];
        if (well != null) {
          (ZG.Engine.party(g) >= 3 ? ['walker', 'walker', 'walker', 'runner'] : ['walker', 'walker', 'runner']).forEach((type) => { const z = E.spawnZombie(g, type, well, null, true, true, true); if (z) { z.awake = true; z.trail = g.exit; } });
          E.log(g, 'The dead are clawing their way out of the well at the ranger station — right by the van!', 'bad');
        }
      },
      botGoal(g, hero, E) {
        if (g.obj.attempted) return null;
        if (hero.hand.some((u) => g.cards[u] === 'cargo_battery')) return g.tower;
        const drops = g.drops.filter((d) => d.card === 'cargo_battery').map((d) => d.pos);
        if (drops.length) return E.nearest(g, hero.pos, drops);
        if (g.heroes.some((h) => h.hand.some((u) => g.cards[u] === 'cargo_battery'))) return g.tower;
        const opts = g.crates.filter((c) => !c.opened).map((c) => c.pos);
        return opts.length ? E.nearest(g, hero.pos, opts) : null;
      },
      progress(g) { return g.obj.attempted ? 9 : (this.hasBattery(g) ? 2 : 0); }, // the signal weighs a lot: after it everyone is far from the van
    },
    // --- Campaign, mission 7 "White Swan": kill the Bitten Bride and leave; the Wolves' prisoner is a hidden opportunity ---
    // --- Campaign, mission 6: the forest road and the churchyard with the Shining Cross ---
    {
      id: 'pogost', campaignOnly: true, name: 'The Churchyard',
      short: 'Take the radio from the lodge by the Shining Cross and leave by the road at the right edge. By the Cross the dead go into a frenzy — they act twice.',
      brief: 'Across the river the road runs through a forest and an old cemetery. A huge cross glows above the churchyard. In the lodge by the Cross is the watchman\'s radio.',
      setupText: 'A 4×2 board: forest in the two left columns (Pine Forest ×2, Power Line Clearing ×2), cemetery in the two right ones (Old Graves, Crypts, Chapel and the Shining Cross — the Cross in a random cemetery column). Start — at the left edge, exit — at the right edge on a cemetery tile without the Cross. Open from the start: start, exit and the Cross (its light is visible from afar). A crate with the radio is in the lodge by the Cross. Ambushes (lurking in the centers of two different random cemetery tiles, not the Cross): A — Brutes and Grabbers (solo: 3 Brutes and a Grabber; duo, trio, four: 3 Brutes and 2 Grabbers); B — 3 Runners and a Screamer (duo: + Grabber; trio and four: + Grabber and Brute). When the radio is taken from the crate it comes alive: its wheeze is heard 4 zones from the lodge (Alarm does not rise). The radio must be carried out: the one carrying it leaves first. Manholes: 2, in random cemetery tiles, not the exit tile. The forest is empty.',
      exitLabel: 'Road to the Suburb', exitArt: 'exit_van', cargo: 'cargo_lodge_radio',
      ambushA: { 1: ['brute', 'brute', 'brute', 'grabber'], 2: ['brute', 'brute', 'brute', 'grabber', 'grabber'], 3: ['brute', 'brute', 'brute', 'grabber', 'grabber'], 4: ['brute', 'brute', 'brute', 'grabber', 'grabber'] },
      ambushB: { 1: ['runner', 'runner', 'runner', 'screamer'], 2: ['runner', 'runner', 'runner', 'screamer', 'grabber'], 3: ['runner', 'runner', 'runner', 'screamer', 'grabber', 'brute'], 4: ['runner', 'runner', 'runner', 'screamer', 'grabber', 'brute'] },
      crackle: 4, // noise radius when the radio is taken from the crate
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng, n = Math.min(4, ZG.Engine.party(g));
        const at = (ti, p) => b.cells.find((c) => c.tile === ti && c.lx === p[0] && c.ly === p[1]);
        const street = (ti) => b.cells.filter((c) => c.tile === ti && c.type === 'street');
        const yard = ['pogost_graves', 'pogost_crypts', 'pogost_chapel', 'krest'];
        const cem = b.tiles.map((t, i) => (yard.includes(t.id) ? i : -1)).filter((i) => i >= 0);
        const kr = b.tiles.findIndex((t) => t.id === 'krest');
        const maxTx = Math.max.apply(null, b.tiles.map((t) => t.tx));
        const st = b.cells[g.start].tile;
        // "Frenzy": the Cross tile
        g.frenzyTiles = kr >= 0 ? [kr] : [];
        // exit — at the right edge on a cemetery tile without the Cross
        const exT = cem.filter((i) => b.tiles[i].tx === maxTx && i !== kr);
        const exTile = exT.length ? Rng.pick(g, exT) : b.cells[g.exit].tile;
        const edge = b.cells.filter((c) => c.tile === exTile && c.x === b.w - 1 && c.type === 'street');
        if (edge.length) g.exit = Rng.pick(g, edge).i;
        // the radio — in a crate in the lodge by the Cross
        g.obj = { found: false, crate: null, brutes: false };
        if (kr >= 0) { const lodge = at(kr, ZG.Tiles.get('krest').lodge).i; g.crates.push({ pos: lodge, card: this.cargo, opened: false }); g.obj.crate = lodge; }
        // manholes: 2, in random tiles (not the start or exit tile)
        const holeTiles = Rng.shuffle(g, cem.filter((i) => i !== exTile)).slice(0, 2); // manholes in the cemetery: the forest stays quiet
        g.spawnPoints = holeTiles.map((ti) => { const m = b.cells.find((c) => c.tile === ti && c.manhole); const ok = (c) => c && c.i !== g.start && c.i !== g.exit && c.i !== g.obj.crate && c.type === 'street'; return (ok(m) ? m : Rng.pick(g, street(ti).filter(ok))).i; });
        // ambushes — in the centers of two different random cemetery tiles
        const amb = Rng.shuffle(g, cem.filter((i) => i !== kr)).slice(0, 2); // ambushes not on the Cross tile (it is hot enough by the radio)
        const lurk = (ti, list) => { const mid = at(ti, [1, 1]); const cell = mid && mid.type !== 'blocked' ? mid : Rng.pick(g, street(ti)); list.forEach((type) => E.lurker(g, type, cell.i)); };
        lurk(amb[0], this.ambushA[n]);
        lurk(amb[1], this.ambushB[n]);
        g.hideFogCounts = true; // fog token counters do not give the ambushes away
        // fog: start, exit and the Cross (light visible from afar)
        if (g.revealed) g.revealed = b.tiles.map((t, i) => i === st || i === exTile || i === kr);
      },
      hasRadio(g) { return g.heroes.some((h) => h.hand.some((u) => g.cards[u] === this.cargo)) || g.drops.some((d) => d.card === this.cargo); },
      watch(g, E) {
        if (!g.obj.found && g.heroes.some((h) => h.hand.some((u) => g.cards[u] === this.cargo))) {
          g.obj.found = true;
          // the radio comes alive in your hands: the hiss of static carries across the churchyard — the noise wakes the ambushes
          E.log(g, 'The radio comes alive in your hands: crackle and hissing static carry across the whole churchyard!', 'bad');
          E.fx(g, { t: 'noise', pos: g.obj.crate, n: this.crackle });
          E.hear(g, g.obj.crate, this.crackle);
        }
        if (!g.obj.brutes && g.zombies.some((z) => z.type === 'brute' && z.awake)) { g.obj.brutes = true; E.storyEvent(g, 'brutes'); }
      },
      goals(g) {
        return [
          { text: 'Take the radio from the lodge by the Shining Cross (crate)', done: g.obj.found },
          { text: 'Carry the radio out by the road at the right edge — you cannot leave without it', done: !!g.obj.out },
        ];
      },
      isComplete(g) { return g.obj.found; },
      // the one carrying the radio leaves first; the rest — after them
      canEvac(g, h) { return !!g.obj.out || h.hand.some((u) => g.cards[u] === this.cargo); },
      evacBlockedText: 'You cannot leave without the radio: the one carrying it leaves first (dropped it — pick it up).',
      onEvac(g, h) { if (h.hand.some((u) => g.cards[u] === this.cargo)) g.obj.out = true; },
      botGoalDone(g) { if (g.obj.out) return null; const d = g.drops.find((x) => x.card === this.cargo); return d ? d.pos : null; },
      actions() { return []; },
      botGoal(g) { if (g.obj.found) return null; const d = g.drops.find((x) => x.card === this.cargo); return d ? d.pos : g.obj.crate; },
      progress(g) { return g.obj.found ? 5 : 0; },
      timeoutText: 'Dawn never came: the churchyard did not let the living go.',
    },
    {
      id: 'wedding', campaignOnly: true, name: 'White Swan',
      short: 'Kill the Bitten Bride — her wail holds the whole suburb — and leave by the north road.',
      brief: 'The White Swan restaurant on the way out of the suburb. A wedding was held here on the day it all began. The bride still wanders the hall with her guests, and her scream draws the dead from all around. At the far edge, by the road, the Wolves have a campfire going.',
      setupText: 'A 4×2 board: the White Swan Restaurant (left column) and the Wolves Camp (right column) + 6 ordinary tiles. Start — a random tile of the second column. The wedding pack (the Bitten Bride, a Bloater, 3 Runners) — in the restaurant hall, wandering. In the corner of the hall — the "Manager\'s Safe" (safe token stack: 4 Valuables, Empty, Siren). At the camp — 5 Cutthroats (wandering) and a Sniper on the tower (alert). By the campfire — a "?" event token: put this mission\'s story event card face down nearby and do not read it. Manholes: a random tile of the 2nd column and a random tile of the 3rd. Exit — at the right edge on the other tile of the right column. Open from the start: start, restaurant, camp, exit.',
      exitLabel: 'North Road', exitArt: 'exit_van',
      deadline: 14, // the prisoner is executed at the end of this round (bots rescue him ~1/3 of the time)
      brideWounds: { 1: 4, 2: 0, 3: 0, 4: 1 }, // damage tokens on the bride at the start (the groom got a hit in) — evens out difficulty for 1–4 heroes
      plotCard: {
        name: 'The Prisoner',
        when: 'Draw it when a hero comes within 2 zones of the "?" token by the campfire.',
        effect: 'By the campfire — a bound man: the Wolves\' prisoner. Until round 14 ends he can be freed: a hero in his zone, with no bandits in it, spends 1 ⚡. At the end of round 14 the Wolves execute him. If rescued, Gleb "Double-Tap" joins the squad in the shelter after the mission.',
      },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng;
        const at = (ti, p) => b.cells.find((c) => c.tile === ti && c.lx === p[0] && c.ly === p[1]);
        const col = (tx) => b.tiles.map((t, i) => (t.tx === tx ? i : -1)).filter((i) => i >= 0);
        const maxTx = Math.max.apply(null, b.tiles.map((t) => t.tx));
        const bq = b.tiles.findIndex((t) => t.id === 'banquet'), wc = b.tiles.findIndex((t) => t.id === 'wolfcamp');
        const street = (ti) => b.cells.filter((c) => c.tile === ti && c.type === 'street');
        // start — a random tile of the second column
        const st = Rng.pick(g, col(1).filter((i) => i !== bq && i !== wc));
        const sc = street(st);
        g.start = (sc.find((c) => c.lx === 1 && c.ly === 1) || Rng.pick(g, sc.length ? sc : b.cells.filter((c) => c.tile === st && c.type !== 'blocked'))).i;
        g.heroes.forEach((h) => { h.pos = g.start; });
        // exit — at the right edge on the other tile of the right column
        const ex = col(maxTx).filter((i) => i !== wc);
        const exTile = ex.length ? Rng.pick(g, ex) : wc;
        const edge = b.cells.filter((c) => c.tile === exTile && c.x === b.w - 1 && c.type === 'street');
        g.exit = (edge.length ? Rng.pick(g, edge) : Rng.pick(g, street(exTile))).i;
        // manholes: a random tile of the 2nd column and of the 3rd
        const hole = (ti) => { const m = b.cells.find((c) => c.tile === ti && c.manhole); const ok = (c) => c && c.i !== g.start && c.i !== g.exit && c.type !== 'blocked'; return ok(m) ? m.i : Rng.pick(g, street(ti).filter(ok)).i; };
        g.spawnPoints = [hole(Rng.pick(g, col(1).filter((i) => i !== bq && i !== wc))), hole(Rng.pick(g, col(2)))];
        g.obj = { brideDead: false, known: false, rescued: false, executed: false, camp: null, bride: null };
        // the wedding pack — wandering in the restaurant hall
        if (bq >= 0) {
          const lair = at(bq, ZG.Tiles.get('banquet').lair).i;
          E.placeSafe(g, at(bq, [0, 0]).i, 'Manager\'s Safe'); // the wedding envelopes are still in the safe
          ['bride', 'fatso', 'runner', 'runner', 'runner'].forEach((type) => { const z = E.spawnZombie(g, type, lair, null, true, true, true); if (z) { z.awake = false; z.trail = null; if (type === 'bride') { g.obj.bride = z.uid; z.dmg = this.brideWounds[Math.min(4, ZG.Engine.party(g))] || 0; } } });
        }
        // Wolves camp: 5 cutthroats wander, the sniper on the tower is alert, the prisoner by the campfire ("?" token)
        if (wc >= 0) {
          const W = ZG.Tiles.get('wolfcamp');
          g.obj.camp = at(wc, W.camp).i;
          const cells = b.cells.filter((c) => c.tile === wc && c.type !== 'blocked' && c.lx + c.ly > 0);
          for (let k = 0; k < 5; k++) {
            const z = E.spawnZombie(g, 'raider', cells[k % cells.length].i, null, true, true, true);
            if (!z) continue;
            z.awake = false; z.trail = null; z.home = g.obj.camp;
            const i = g.lootDeck.findIndex((id) => id !== 'ambush'); z.bag = i >= 0 ? [g.lootDeck.splice(i, 1)[0]] : [];
          }
          const sn = E.spawnZombie(g, 'sniper', at(wc, W.perch).i, null, true, true, true); if (sn) { sn.awake = true; sn.trail = null; }
        }
        // fog: start, exit, restaurant (light in the windows) and camp (campfire) are visible from the start
        if (g.revealed) g.revealed = b.tiles.map((t, i) => i === st || i === exTile || i === bq || i === wc);
      },
      bride(g) { return g.zombies.find((z) => z.uid === g.obj.bride); },
      // the prisoner is noticed during play: a hero came within 2 zones of the campfire
      watch(g, E) {
        if (g.sim || g.obj.known || g.obj.camp == null) return;
        const d = E.distV(g, g.obj.camp);
        if (!g.heroes.some((h) => h.onBoard && d[h.pos] <= 2)) return;
        g.obj.known = true;
        E.log(g, `By the Wolves' campfire — a bound man! He can be freed until the end of round ${this.deadline} (a hero in his zone, no bandits in it: 1 ⚡).`, 'warn');
        E.fx(g, { t: 'objective', pos: g.obj.camp, text: 'Prisoner!' });
        E.storyEvent(g, 'prisoner');
      },
      goals(g) {
        const out = [
          { text: 'Kill the Bitten Bride', done: g.obj.brideDead },
          { text: 'All survivors leave by the north road', done: false },
        ];
        if (g.obj.known) out.splice(1, 0, g.obj.executed ? { text: 'Free the prisoner', failed: true, note: 'the Wolves executed him' } : { text: `Free the prisoner (before the end of round ${this.deadline})`, done: g.obj.rescued, isNew: !g.obj.rescued, note: 'optional' });
        return out;
      },
      isComplete(g) { return g.obj.brideDead; },
      onKill(g, z, heroIdx, E) { if (z.uid === g.obj.bride) { g.obj.brideDead = true; E.log(g, 'The bride is dead. The suburb falls quiet — for the first time in many nights.', 'good'); } },
      actions(g, hero) {
        const o = g.obj;
        if (!o.known || o.rescued || o.executed || hero.pos !== o.camp) return [];
        if (g.zombies.some((z) => z.pos === hero.pos && ZG.Engine.isBandit(z))) return [];
        return [{ t: 'scenario', key: 'free', cost: 1, label: 'Free the Prisoner' }];
      },
      doAction(g, hero, key, E) {
        if (key !== 'free') return;
        g.obj.rescued = true;
        E.log(g, `${E.heroName(hero)} cuts the ropes. The prisoner is alive: "Gleb. I can shoot. The rest — later."`, 'good');
        E.fx(g, { t: 'objective', pos: hero.pos, text: 'Rescued!' });
        E.storyEvent(g, 'rescue');
      },
      roundEnd(g, E) {
        const o = g.obj;
        if (o.rescued || o.executed || g.round < this.deadline) return;
        o.executed = true;
        E.log(g, 'The Wolves executed the prisoner by the campfire. The shot is heard across the whole suburb.', 'bad');
        E.hear(g, o.camp, 3);
        if (o.known) E.storyEvent(g, 'executed');
      },
      botGoal(g, hero, E) {
        const o = g.obj;
        // the prisoner: if he is already known and there is time (no bandits in his zone — otherwise clear the approach first)
        if (o.known && !o.rescued && !o.executed && g.round <= this.deadline) {
          const d = E.distV(g, hero.pos)[o.camp];
          if (d <= (this.deadline - g.round + 1) * 3) return o.camp;
        }
        if (!o.brideDead) { const b = this.bride(g); if (b) return b.pos; }
        return null;
      },
      // the bride is dead: while there is time — to the prisoner (or check the "?" token by the campfire), otherwise to the exit
      botGoalDone(g, hero, E) {
        const o = g.obj;
        // to the prisoner (or check the "?" token by the campfire — everyone can see it) — if there is time to get back to the exit
        if (o.rescued || o.executed || g.round > this.deadline) return null;
        if (!o.known && E.party(g) === 1) return null; // a loner does not risk scouting the Wolves camp
        const d = E.distV(g, hero.pos), back = E.distV(g, o.camp)[g.exit];
        const left = E.maxRounds(g) - g.round;
        return (d[o.camp] + back) / 2 + 2 <= left ? o.camp : null;
      },
      progress(g) {
        const b = this.bride(g), d = ZG.Zombies.get('bride');
        return (g.obj.brideDead ? 6 : b ? (b.dmg / d.hp) * 4 : 0) + (g.obj.rescued ? 2 : 0);
      },
      timeoutText(g) { return g.obj.brideDead ? 'Dawn never came: the suburb fell quiet, but you never reached the north road.' : "Dawn never came: the bride's wail gathered the whole suburb."; },
    },
    // --- Campaign, mission 8: the Butcher at the farmers market, the Wolves by the road ---
    {
      id: 'market', campaignOnly: true, name: 'High Noon',
      short: 'Break through the market and the Wolves camp to the road at the right edge. The Butcher in the middle hits everyone around him — strangers and his own.',
      brief: 'The farmers market at noon. The Butcher roams the middle of the meat row: chain, hook, cleaver. To the right, by the north road, are the Wolves. The only way through is past them.',
      setupText: 'A 5×2 board: the Farmers Market (west rows — 2nd column, meat row — 3rd, east rows — 4th), the Wolves Camp — in the right column. All tiles are open (daytime), no manholes. Start — at the left edge. The Butcher and his retinue (solo: a Shambler; duo: Shambler and Runner; trio: Bloater and Shambler; four: Bloater, Shambler and Runner) — in the meat row, a Screamer barker — in the center of the west rows; in the east rows — the "Market Till" (safe token stack: 4 Valuables, Empty, Siren); neutral strips — the dead wander in the center of a random ordinary tile in the 2nd column and in the 4th column (left / right: solo — Shambler and Runner / Shambler; duo — Shambler and Runner / Shambler and Runner; trio — 2 Shamblers and Runner / Shambler and Runner; four — 2 Shamblers and Runner / 2 Shamblers and Runner). At the camp — Cutthroats (solo 2, duo 3, trio 5, four 7; wandering near the camp), a Sniper on the tower; in the exit zone at the right edge — a roadblock of Cutthroats on post (solo 2, duo 3, trio 4, four 4; sentries never leave their post — their wounds do not heal at the end of the round); on the adjacent tile of the right column — Looter bandits (2 / 1 / 2 / 2). Every bandit has a loot card in his bag. Everything on the board wanders from the start.',
      exitLabel: 'North Road', exitArt: 'exit_van',
      retinue: { 1: ['walker'], 2: ['walker', 'runner'], 3: ['fatso', 'walker'], 4: ['fatso', 'walker', 'runner'] },
      strips: { 1: [['walker', 'runner'], ['walker']], 2: [['walker', 'runner'], ['walker', 'runner']], 3: [['walker', 'walker', 'runner'], ['walker', 'runner']], 4: [['walker', 'walker', 'runner'], ['walker', 'walker', 'runner']] },
      raiders: { 1: 2, 2: 3, 3: 5, 4: 7 },
      looters: { 1: 2, 2: 1, 3: 2, 4: 2 },
      guards: { 1: 2, 2: 3, 3: 4, 4: 4 }, // roadblock in the exit zone
      reinforce: 2, // Cutthroats per Wave
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng, n = Math.min(4, ZG.Engine.party(g));
        const tid = (id) => b.tiles.findIndex((t) => t.id === id);
        const at = (ti, p) => b.cells.find((c) => c.tile === ti && c.lx === p[0] && c.ly === p[1]);
        const street = (ti) => b.cells.filter((c) => c.tile === ti && c.type === 'street');
        const wander = (type, cell) => { const z = E.spawnZombie(g, type, cell, null, true, true, true); if (z) { z.awake = false; z.trail = null; } return z; };
        const bag = (z) => { const i = g.lootDeck.findIndex((id) => id !== 'ambush'); z.bag = i >= 0 ? [g.lootDeck.splice(i, 1)[0]] : []; };
        const maxTx = Math.max.apply(null, b.tiles.map((t) => t.tx));
        const km = tid('kolhoz'), kw = tid('kolhoz_w'), ke = tid('kolhoz_e'), wc = tid('wolfcamp');
        const market = [km, kw, ke].filter((i) => i >= 0);
        g.obj = { butcher: null, butcherDead: false, camp: null };
        // exit — at the right edge on the Wolves Camp tile: you will have to break through the camp
        if (wc >= 0) {
          const P = ZG.Tiles.get('wolfcamp').perch;
          const edge = b.cells.filter((c) => c.tile === wc && c.x === b.w - 1 && c.type === 'street' && !(c.lx === P[0] && c.ly === P[1])); // not on the sniper tower
          if (edge.length) g.exit = Rng.pick(g, edge).i;
        }
        const st = b.cells[g.start].tile;
        // the Butcher and his retinue — in the meat row
        const lair = km >= 0 ? at(km, ZG.Tiles.get('kolhoz').lair).i : street(b.tiles.findIndex((t) => t.tx === Math.floor(maxTx / 2)))[0].i;
        const kassa = ke >= 0 ? at(ke, [0, 1]) : km >= 0 ? at(km, [2, 1]) : null;
        if (kassa) E.placeSafe(g, kassa.i, 'Market Till'); // the day's takings — in the east rows, away from the meat row
        const bz = wander('butcher', lair);
        if (bz) g.obj.butcher = bz.uid;
        this.retinue[n].forEach((type) => wander(type, lair));
        // the Screamer barker — in the west rows, on the way to the Butcher (without them — in the corner of the main row)
        if (kw >= 0) wander('screamer', at(kw, [1, 1]).i);
        else if (km >= 0) wander('screamer', at(km, [0, 1]).i);
        // neutral strips: tiles between the start and the market and between the market and the camp
        const mx = km >= 0 ? b.tiles[km].tx : Math.floor(maxTx / 2);
        const plain = b.tiles.map((t, i) => i).filter((i) => i !== st && i !== wc && !market.includes(i) && b.tiles[i].tx > 0 && b.tiles[i].tx < maxTx);
        const sides = [plain.filter((i) => b.tiles[i].tx <= mx), plain.filter((i) => b.tiles[i].tx > mx)];
        this.strips[n].forEach((pack, side) => {
          const tiles = sides[side].length ? sides[side] : plain;
          if (!tiles.length) return;
          const ti = Rng.pick(g, tiles);
          const mid = at(ti, [1, 1]);
          const cell = mid && mid.type !== 'blocked' ? mid : Rng.pick(g, street(ti).length ? street(ti) : b.cells.filter((c) => c.tile === ti && c.type !== 'blocked'));
          pack.forEach((type) => wander(type, cell.i));
        });
        // Wolves camp: Cutthroats wander near the camp, a Sniper on the tower, looters with bags — nearby
        if (wc >= 0) {
          const W = ZG.Tiles.get('wolfcamp');
          g.obj.camp = at(wc, W.camp).i;
          const cells = b.cells.filter((c) => c.tile === wc && c.type !== 'blocked' && c.i !== g.exit && !(c.lx === W.perch[0] && c.ly === W.perch[1]));
          for (let k = 0; k < this.raiders[n]; k++) {
            const z = wander('raider', cells[k % cells.length].i);
            if (z) { z.home = g.obj.camp; bag(z); }
          }
          const sn = E.spawnZombie(g, 'sniper', at(wc, W.perch).i, null, true, true, true); if (sn) { sn.awake = true; sn.trail = null; }
          // roadblock on the road: Cutthroats on post in the exit zone — while a bandit is there, you cannot leave
          for (let k = 0; k < this.guards[n]; k++) { const z = wander('raider', g.exit); if (z) { z.post = true; z.home = g.exit; bag(z); } }
          // looters — on the adjacent tile of the right column (or at the camp)
          const other = b.tiles.map((t, i) => i).filter((i) => b.tiles[i].tx === maxTx && i !== wc);
          const lt = other.length ? other[0] : wc;
          const lc = b.cells.filter((c) => c.tile === lt && c.type === 'street' && c.i !== g.exit);
          for (let k = 0; k < this.looters[n]; k++) { const z = wander('bandit', Rng.pick(g, lc).i); if (z) bag(z); }
        }
        // daytime: everything is in plain sight
        if (g.revealed) g.revealed = b.tiles.map(() => true);
      },
      butcher(g) { return g.zombies.find((z) => z.uid === g.obj.butcher); },
      goals(g) {
        const blocked = g.zombies.some((z) => z.pos === g.exit && ZG.Engine.isBandit(z));
        return [
          { text: 'Clear the Wolves roadblock off the road (no bandits may remain in the exit zone)', done: !blocked },
          { text: 'Break through the Wolves camp to the road at the right edge', done: false },
          { text: 'Kill the Butcher', done: g.obj.butcherDead, note: 'optional' },
        ];
      },
      isComplete() { return true; },
      actions() { return []; },
      canEvac(g, h, E) { return !E.zombiesAt(g, g.exit).some((z) => E.isBandit(z)); },
      evacBlockedText: 'The Wolves have a roadblock on the road — clear them out of this zone first.',
      onKill(g, z, heroIdx, E) { if (z.uid === g.obj.butcher) { g.obj.butcherDead = true; E.log(g, 'The Butcher crashed onto his own counter. The chain clinked one last time.', 'good'); } },
      // Wave: instead of spawn cards — Wolves reinforcements from the road, hunting at once
      onWave(g, E, extra) {
        const b = g.board;
        const edge = b.cells.filter((c) => c.x === b.w - 1 && c.type === 'street' && c.i !== g.exit); // not into the exit zone: the roadblock does not "close" by itself
        if (!edge.length) return;
        for (let k = 0; k < extra * this.reinforce; k++) {
          const z = E.spawnZombie(g, 'raider', ZG.Rng.pick(g, edge).i, null, true, true, true);
          if (!z) continue;
          z.awake = true; z.hunt = true; z.home = g.obj.camp;
          const live = g.heroes.filter((h) => h.onBoard && !h.hidden);
          const d = E.distV(g, z.pos);
          live.sort((a, c) => d[a.pos] - d[c.pos]);
          z.trail = live.length ? live[0].pos : z.pos;
        }
        E.log(g, `Wolves reinforcements: ${extra * this.reinforce} ${ZG.util.plural(extra * this.reinforce, 'Cutthroat', 'Cutthroats', 'Cutthroats')} pulled up from the road and are heading for the noise!`, 'bad');
        E.fx(g, { t: 'objective', pos: edge[0].i, text: 'Wolves reinforcements!' });
        E.storyEvent(g, 'wolves');
      },
      botGoal() { return null; },
      progress(g) {
        const b = g.board, x = (h) => (h.evacuated ? b.w : b.cells[h.pos].x);
        const alive = g.heroes.filter((h) => !h.fallen);
        return (alive.length ? alive.reduce((s, h) => s + x(h), 0) / alive.length / b.w : 0) * 5 + (g.obj.butcherDead ? 2 : 0);
      },
      timeoutText: 'The sun has gone behind the roofs: the market is swarming with the dead, and the Wolves have blocked the road.',
    },
    // --- Campaign, mission 4: jerrycans on the highway, bandits — a third side ---
    {
      id: 'highway', campaignOnly: true, name: 'Gas and Gunpowder',
      short: 'Find jerrycans in the crates, fuel up the van and drive off. Bandits are also looking for gas and shoot at everything living — and dead.',
      brief: 'The van ran dry by the highway. The gas is in crates around the area. Bandits roam nearby: they shoot at the living and the dead alike, and the gunfire draws the dead out of the manholes.',
      setupText: 'A 4×2 board (8 ordinary tiles), all tiles open: a fuel tanker is burning, its glow lights the whole highway. Crates: 4 (3–4 heroes: 6), jerrycans: 3 (3–4 heroes: 5), needed: 2 (3–4 heroes: 3). Exit — the van at the right edge. 2 packs are placed at once in the centers of two random tiles (not the start or exit tile) and wander from the first round. Bandits (solo 2, duo and trio 3, four 4) wander on different tiles without packs; each has 1 loot card in his bag. 2 manholes: quiet at Dusk, from Night — 2 Shamblers out of each.',
      exitLabel: 'Van', exitArt: 'exit_van', cargo: 'cargo_fuel',
      packs: { 1: ['walker', 'walker', 'runner'], 2: ['walker', 'walker', 'runner', 'runner'], 3: ['walker', 'walker', 'walker', 'runner', 'runner'], 4: ['walker', 'walker', 'walker', 'runner', 'runner', 'runner'] },
      bandits: { 1: 2, 2: 3, 3: 3, 4: 4 },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng, big = ZG.Engine.party(g) >= 3 ? 1 : 0;
        g.obj = { delivered: 0, need: 2 + big };
        E.placeCrates(g, 4 + big * 2, 3 + big * 2, this.cargo); // a big squad gets a spare jerrycan (bandits carry them off)
        const st = b.cells[g.start].tile, et = b.cells[g.exit].tile;
        const cand = b.tiles.map((t, i) => i).filter((i) => i !== st && i !== et);
        // no fog: the burning tanker lights the whole highway (it lies on one of the tiles — decor and the source of the glow)
        if (g.revealed) g.revealed = b.tiles.map(() => true);
        const fireCells = b.cells.filter((c) => c.type === 'street' && c.tile !== st && c.tile !== et && !g.crates.some((x) => x.pos === c.i) && !g.search.some((x) => x.pos === c.i) && !g.spawnPoints.includes(c.i));
        if (fireCells.length) g.fire = Rng.pick(g, fireCells).i;
        // 2 packs — on the board at once, in the centers of two random tiles, wandering from the first round (chaos from the very start)
        g.obj.packTiles = Rng.shuffle(g, cand.slice()).slice(0, 2);
        g.obj.packTiles.forEach((ti) => {
          const mid = b.cells.find((c) => c.tile === ti && c.lx === 1 && c.ly === 1);
          const cell = mid && mid.type !== 'blocked' ? mid : b.cells.find((c) => c.tile === ti && c.type !== 'blocked');
          this.packs[Math.min(4, ZG.Engine.party(g))].forEach((type) => { const z = E.spawnZombie(g, type, cell.i, null, true, true, true); if (z) { z.awake = false; z.trail = null; } });
        });
        // bandits wander on tiles without packs; each carries a loot card in his bag
        const n = this.bandits[Math.min(4, ZG.Engine.party(g))];
        Rng.shuffle(g, cand.filter((i) => !g.obj.packTiles.includes(i))).concat(g.obj.packTiles).slice(0, n).forEach((ti) => {
          const cells = b.cells.filter((c) => c.tile === ti && c.type === 'street' && !(c.lx === 1 && c.ly === 1));
          const z = E.spawnZombie(g, 'bandit', Rng.pick(g, cells.length ? cells : b.cells.filter((c) => c.tile === ti && c.type !== 'blocked')).i, null, true, true, true);
          if (!z) return;
          z.awake = false; z.trail = null;
          const i = g.lootDeck.findIndex((id) => id !== 'ambush');
          z.bag = i >= 0 ? [g.lootDeck.splice(i, 1)[0]] : [];
        });
      },
      inBags(g) { return g.zombies.reduce((n, z) => n + (z.bag || []).filter((c) => c === this.cargo).length, 0); },
      goals(g) {
        const bag = this.inBags(g);
        return [
          { text: `Fuel the van: ${g.obj.delivered}/${g.obj.need} jerrycans`, done: g.obj.delivered >= g.obj.need, note: bag ? `In bandit bags: ${bag} — take them` : null },
          { text: 'All survivors drive off', done: false },
        ];
      },
      isComplete(g) { return g.obj.delivered >= g.obj.need; },
      actions(g, hero) { return deliverAction(g, hero, this.cargo, g.exit, 'Fuel the van'); },
      doAction(g, hero, key, E) { if (key === 'deliver') doDeliver(g, hero, E, this.cargo, 'a jerrycan'); },
      botGoal(g, hero, E) {
        const goal = fetchBotGoal(g, hero, E, this.cargo, g.exit);
        if (goal != null) return goal;
        // jerrycans held by bandits: hunt for the bag
        const need = g.obj.need - g.obj.delivered - cargoInHands(g, this.cargo);
        const thieves = g.zombies.filter((z) => (z.bag || []).includes(this.cargo)).map((z) => z.pos); // also in the fog: a crate vanished from a tile back — it is clear who took it
        return need > 0 && thieves.length ? E.nearest(g, hero.pos, thieves) : null;
      },
      progress(g) { return g.obj.delivered * 2 + cargoInHands(g, this.cargo, 0.5); },
    },
    // --- Campaign, mission 5: the bridge, the Forester's gang; two paths — quietly (the key) or by force (wipe them out) ---
    {
      id: 'bridge', campaignOnly: true, name: 'Bridge Toll',
      short: 'Get onto the bridge: quietly take the barrier key from the sleeping Forester or wipe out his gang — and everyone leaves over the bridge.',
      brief: "The Forester's gang holds the bridge: two snipers, a sentry at the barrier and the boss himself. The barrier opens with the key on the Forester's belt — or once the road is empty.",
      setupText: 'A 4×2 board: the Bridge Checkpoint (right column; open from the start) and the Sawmill (third column) + 6 ordinary tiles. Exit — the barrier at the Checkpoint. Checkpoint: a sniper on the tower, a sentry dozing at the barrier — he never leaves his post (while an enemy is in the barrier zone you cannot leave), sandbags (a hero in that zone is immune to shots), the booth — the gang\'s weapons cache. Sawmill: the Forester sleeps in the hut — the barrier key is on his belt. While the Forester sleeps, any hero in his zone may take the key with the "Take the Key" action (1 ⚡); the sleeping Forester notices heroes by the normal lurking rules (you can sneak up by the "Stealth" rules). A killed Forester drops the key; a second sniper on the log pile, the saw frame (control panel: 1 ⚡, once per mission — 4 damage to every enemy in the saw zone, Noise 3, Alarm +2). When the key is taken, the "toll" tokens jingle: the Forester wakes and follows the trail, the whole gang rises — wanderers become hunters (they pursue the squad). Wandering bandits: solo 3, duo 5, trio 6, four 8 — on ordinary tiles, not the start tile. Rounds: solo 12, duo 11, trio 9, four 8. No zombies. The task is complete if the squad has the key OR the gang is wiped out completely.',
      exitLabel: 'Bridge', exitArt: 'exit_van',
      bandits: { 1: 3, 2: 5, 3: 6, 4: 8 },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng;
        const at = (ti, p) => b.cells.find((c) => c.tile === ti && c.lx === p[0] && c.ly === p[1]);
        const cp = b.tiles.findIndex((t) => t.id === 'checkpoint'), sm = b.tiles.findIndex((t) => t.id === 'sawmill');
        const CP = ZG.Tiles.get('checkpoint'), SM = ZG.Tiles.get('sawmill');
        const st = b.cells[g.start].tile;
        g.obj = { open: false, saw: null, console: null, sawUsed: false };
        if (cp >= 0) {
          g.exit = at(cp, CP.barrier).i;
          g.cover = CP.cover.map((p) => at(cp, p).i);
          // the sentry at the barrier: while there is an enemy in the barrier zone the barrier cannot be raised
          const guard = E.lurker(g, 'guard', g.exit);
          if (guard) { guard.post = true; const i = g.lootDeck.findIndex((id) => id !== 'ambush'); guard.bag = i >= 0 ? [g.lootDeck.splice(i, 1)[0]] : []; }
          const s1 = E.spawnZombie(g, 'sniper', at(cp, CP.perch).i, null, true, true, true); if (s1) { s1.awake = true; s1.trail = null; } // the sniper is alert from the very start
        }
        if (sm >= 0) {
          const f = E.lurker(g, 'forester', at(sm, SM.lair).i);
          if (f) f.bag = ['cargo_key']; // the barrier key is on the Forester's belt (it drops if he is killed)
          const s2 = E.spawnZombie(g, 'sniper', at(sm, SM.perch).i, null, true, true, true); if (s2) { s2.awake = true; s2.trail = null; }
          g.obj.saw = at(sm, SM.saw).i; g.obj.console = at(sm, SM.console).i;
        }
        // fog: the start and the checkpoint are open (the bridge is visible from afar)
        g.hideFogCounts = true; // where the bandits roam is unknown
        if (g.revealed) g.revealed = b.tiles.map((t, i) => i === st || i === cp);
        // wandering bandits: on ordinary tiles (not the start), each with a loot card in his bag
        const tiles = b.tiles.map((t, i) => i).filter((i) => i !== st && i !== cp && i !== sm);
        const n = this.bandits[Math.min(4, ZG.Engine.party(g))];
        const order = Rng.shuffle(g, tiles.slice());
        for (let k = 0; k < n; k++) {
          const ti = order[k % order.length];
          const cells = b.cells.filter((c) => c.tile === ti && c.type === 'street' && !g.zombies.some((z) => z.pos === c.i));
          const z = E.spawnZombie(g, 'bandit', Rng.pick(g, cells.length ? cells : b.cells.filter((c) => c.tile === ti && c.type !== 'blocked')).i, null, true, true, true);
          if (!z) continue;
          z.awake = false; z.trail = null;
          const i = g.lootDeck.findIndex((id) => id !== 'ambush');
          z.bag = i >= 0 ? [g.lootDeck.splice(i, 1)[0]] : [];
        }
      },
      evacBlockedText: 'An enemy is at the barrier — remove him first.',
      timeoutText: "Dawn never came: the Forester's gang blocked the bridge.",
      canEvac(g, h, E) { return !E.zombiesAt(g, g.exit).some((z) => E.isBandit(z)); },
      hasKey(g) { return g.heroes.some((h) => h.hand.some((u) => g.cards[u] === 'cargo_key')); },
      left(g) { return g.zombies.filter((z) => ZG.Engine.isBandit(z)).length; },
      goals(g) {
        const left = this.left(g), key = g.obj.open || this.hasKey(g);
        return [
          { text: 'Path A, quietly: take the key from the sleeping Forester\'s belt', done: key, note: left && !key ? 'while the Forester sleeps, any hero in his zone can take the key (1 ⚡)' : null },
          { text: `OR path B, by force: kill the Forester (he drops the key) or wipe out the gang — ${left} left`, done: left === 0 },
          { text: 'Everyone leaves over the bridge through the barrier', done: false, note: E0().zombiesAt(g, g.exit).some((z) => E0().isBandit(z)) ? 'A sentry is at the barrier — remove him' : null },
        ];
      },
      isComplete(g) {
        if (!g.obj.open && this.hasKey(g)) {
          g.obj.open = true; // the key is taken — the barrier stays open until the end of the mission
          if (!g.obj.way) g.obj.way = 'force'; // the key was picked up from the dead Forester
          // "jingle of tolls": the tokens on the cord jingled — the Forester wakes and follows the thief's trail
          const E = ZG.Engine, holder = g.heroes.find((h) => h.hand.some((u) => g.cards[u] === 'cargo_key'));
          const f = g.zombies.find((z) => z.type === 'forester');
          if (f && holder) {
            f.lurk = false; f.relentless = true; // follows the thief's trail until the end of the mission
            if (!f.awake) { f.awake = true; E.fx(g, { t: 'zwake', zombie: f.uid, pos: f.pos, sound: true }); E.storyEvent(g, 'bossWake'); }
            f.trail = holder.pos;
          }
          if (holder) {
            // "On your feet!" — the Forester raises the whole gang: snipers and wanderers wake and know where to look
            g.zombies.forEach((z) => { if (!E.isBandit(z) || z === f) return; z.lurk = false; if (!z.post && !ZG.Zombies.get(z.type).static) { z.hunt = true; z.relentless = true; } if (!z.awake) { z.awake = true; E.fx(g, { t: 'zwake', zombie: z.uid, pos: z.pos, sound: true }); } z.trail = holder.pos; });
            E.log(g, 'The "toll" tokens jingled on the cord… The Forester roars "ON YOUR FEET!" — the whole gang is up: the wanderers drop their looting and close in on the thief.', 'bad');
            E.fx(g, { t: 'wakeall', pos: holder.pos, title: 'ON YOUR FEET!', text: 'The Forester raised the gang: snipers alert, wanderers closing in' });
          }
        }
        return g.obj.open || this.left(g) === 0;
      },
      forester(g) { return g.zombies.find((z) => z.type === 'forester'); },
      actions(g, hero) {
        const out = [];
        const f = this.forester(g);
        if (f && f.lurk && !f.awake && hero.pos === f.pos && (f.bag || []).includes('cargo_key')) out.push({ t: 'scenario', key: 'pickpocket', cost: 1, label: 'Take the Key from the Sleeping Forester' });
        if (!g.obj.sawUsed && g.obj.console != null && hero.pos === g.obj.console) out.push({ t: 'scenario', key: 'saw', cost: 1, label: 'Start the Saw' });
        return out;
      },
      doAction(g, hero, key, E) {
        if (key === 'pickpocket') {
          const f = this.forester(g);
          if (!f || !(f.bag || []).includes('cargo_key')) return;
          f.bag.splice(f.bag.indexOf('cargo_key'), 1);
          g.obj.way = 'quiet'; // the key was taken from the sleeper
          E.giveCard(g, hero, 'cargo_key');
          E.log(g, `${E.heroName(hero)} carefully takes the key off the sleeping Forester's belt…`, 'good');
          E.storyEvent(g, 'cargo');
          this.isComplete(g); // the jingle of tolls — the Forester wakes up
          return;
        }
        if (key !== 'saw') return;
        g.obj.sawUsed = true;
        const victims = E.zombiesAt(g, g.obj.saw);
        E.log(g, `${E.heroName(hero)} starts the saw!${victims.length ? ' The blade roars and tears into everyone near the saw.' : ' The blade roars at nothing.'}`, victims.length ? 'good' : 'warn');
        E.fx(g, { t: 'explode', pos: g.obj.saw });
        victims.forEach((z) => E.damageZombie(g, z, 4, hero.idx, 'trap'));
        E.hear(g, g.obj.saw, 3, hero.idx);
        E.raiseAlarm(g, 2, 'The roar of the saw');
        E.storyEvent(g, 'saw');
      },
      botGoal(g, hero, E) {
        if (this.isComplete(g)) return null;
        const drops = g.drops.filter((d) => d.card === 'cargo_key').map((d) => d.pos);
        if (drops.length) return E.nearest(g, hero.pos, drops);
        if (this.isComplete(g)) return null;
        // the key — with the Forester (or whoever picked it up): take it from the sleeper or by force
        const thief = g.zombies.filter((z) => (z.bag || []).includes('cargo_key')).map((z) => z.pos);
        if (thief.length) return E.nearest(g, hero.pos, thief);
        const foes = g.zombies.filter((z) => E.isBandit(z)).map((z) => z.pos);
        return foes.length ? E.nearest(g, hero.pos, foes) : null;
      },
      progress(g) { return (this.isComplete(g) ? 6 : 0) + (12 - Math.min(12, this.left(g))) * 0.25; },
    },
    // --- Campaign, mission 2 (special rules): only through the campaign chain ---
    {
      id: 'autobase', campaignOnly: true, name: 'Motor Depot No. 3',
      short: 'Eliminate the two Bloaters in the depot garage bay and drive off in the van.',
      brief: 'Two bloated dead have holed up in the depot garage bay, and in the yard a fueled-up van is waiting — the last chance to get out of the district.',
      setupText: 'A 3×2 board, no manholes. The unique "Motor Depot No. 3" tile — in the right (far) column, random row; it lies face down, but its position is known; in the garage bay — 2 lurking Bloaters and the "Depot Boss\'s Safe" (in a free zone of the bay; safe token stack: 4 Valuables, Empty, Siren), in the yard — the van (exit). On the other 4 closed tiles put 4 "Pack/Empty" cards face down (2 and 2): when a tile with a "Pack" is revealed, place a pack in its center — 2 Shamblers and a Runner (solo: 1 Shambler; with 3 heroes: 4 Shamblers and 3 Runners; with 4: 5 and 4). The wounds of the Bloater drivers do not heal at the end of the round (mark them with tokens until the end of the mission). 10 rounds (solo — 15, four — 8). Lurking zombies do not wander until woken (they see a hero or hear noise). Only the start tile is open.',
      exitLabel: 'Van', exitArt: 'exit_van',
      // composition of one pack (both packs are the same) — by squad size
      stacks: { 1: ['walker'], 2: ['walker', 'walker', 'runner'], 3: ['walker', 'walker', 'walker', 'walker', 'runner', 'runner', 'runner'], 4: ['walker', 'walker', 'walker', 'walker', 'walker', 'runner', 'runner', 'runner', 'runner'] },
      setup(g, E) {
        const b = g.board, Rng = ZG.Rng;
        const ut = b.tiles.findIndex((t) => t.id === 'autobase');
        const at = (ti, lx, ly) => b.cells.find((c) => c.tile === ti && c.lx === lx && c.ly === ly);
        const st = b.cells[g.start].tile;
        g.obj = { bosses: [], total: 2 };
        if (ut >= 0) {
          const van = ZG.Tiles.get('autobase').van;
          g.exit = at(ut, van[0], van[1]).i;
          // two lurking Bloaters in the garage bay
          const box = b.cells.filter((c) => c.tile === ut && c.type === 'building');
          box.slice(0, 2).forEach((c) => {
            const z = E.lurker(g, 'fatso', c.i);
            if (z) { z.keepDmg = true; g.obj.bosses.push(z.uid); } // the Bloater drivers' wounds do not heal: they can be worn down over several rounds
          });
          // the depot boss's safe — in the neighboring corner of the bay: cracking noise may wake the Bloaters
          if (box[2]) E.placeSafe(g, box[2].i, "Depot Boss's Safe");
        }
        // fog: only the start tile is open; the depot's position is known (its back is special)
        if (g.revealed) g.revealed = b.tiles.map((t, i) => i === st);
        // packs: 4 "Pack/Empty" cards on the other closed tiles — where the packs are is unknown
        const cand = b.tiles.map((t, i) => i).filter((i) => i !== ut && i !== st);
        E.placePacks(g, cand, 2, this.stacks[Math.min(4, ZG.Engine.party(g))]);
      },
      // Special rule: a fight with the Bloaters wakes everyone. The "Pack/Empty" cards are flipped:
      // tiles with packs are revealed, the packs burst out already hunting.
      rouse(g, z, E) {
        if (g.obj.roused || !g.obj.bosses.includes(z.uid)) return;
        g.obj.roused = true;
        if (g.stories && g.stories.packReveal) (g.storySeen = g.storySeen || {})[g.stories.packReveal] = true; // the fight has its own story insert — the pack is not shown separately
        (g.stackTiles || []).forEach((ti) => {
          if (g.revealed && !g.revealed[ti] && g.zombies.some((q) => g.board.cells[q.pos].tile === ti)) E.reveal(g, ti, 'A pack burst out of the yard');
        });
        g.stackTiles = [];
        E.wakeAll(g, z.pos, 'Fight in the garage bay');
        E.storyEvent(g, 'rouse');
      },
      onKill(g, z, heroIdx, E) { if (g.obj.bosses.includes(z.uid) && this.bossesLeft(g) === 0) E.storyEvent(g, 'bossesDown'); },
      onZombieHit(g, z, heroIdx, E) { this.rouse(g, z, E); },
      onZombieAttack(g, z, h, E) { this.rouse(g, z, E); },
      bossesLeft(g) { return g.zombies.filter((z) => g.obj.bosses.includes(z.uid)).length; },
      goals(g) {
        const left = this.bossesLeft(g);
        return [
          { text: `Eliminate the Bloaters in the garage bay: ${g.obj.total - left}/${g.obj.total}`, done: left === 0 },
          { text: 'All survivors leave in the van', done: false },
        ];
      },
      isComplete(g) { return this.bossesLeft(g) === 0; },
      actions() { return []; },
      botGoal(g, hero, E) {
        const bosses = g.zombies.filter((z) => g.obj.bosses.includes(z.uid)).map((z) => z.pos);
        return bosses.length ? E.nearest(g, hero.pos, bosses) : null;
      },
      progress(g) { return (g.obj.total - this.bossesLeft(g)) * 3; },
    },
  ]);

  // ------------------------------------------------------- Game conditions ---
  ZG.Conditions.addAll([
    { id: 'calm', name: 'Quiet Evening', text: 'No special conditions.', tone: 0, art: 'cond_calm' },
    { id: 'noon', name: 'Clear Noon', text: 'No special conditions.', tone: 0, art: 'cond_noon' }, // mission 8: daytime, "evening" does not fit
    { id: 'fog', name: 'Smog', text: 'The range of all ranged attacks is −1 (minimum 1). Zombies see targets only on their own tile and the tiles adjacent by a side — the rest stay put.', tone: 0, mods: { rangeBonus: -1, fogTiles: 1 }, art: 'cond_fog' },
    { id: 'rain', name: 'Downpour', text: 'Every noisy action raises the Alarm by 1 less.', tone: 1, mods: { noiseAlarm: -1 }, art: 'cond_rain' },
    { id: 'fullmoon', name: 'Full Moon', text: 'The Dead of Night comes 1 round earlier.', tone: -1, mods: { deepShift: 1 }, art: 'cond_moon' },
    {
      id: 'convoy', name: 'Abandoned Convoy', text: '+3 Search tokens on the streets. Alarm starts at 2.', tone: 0, art: 'cond_convoy',
      setup(g, E) { E.addStreetSearch(g, 3); g.alarm += 2; },
    },
    {
      id: 'swarm', name: 'Hungry Swarm', text: 'At the start of the game a Shambler stands at every spawn point. Each hero starts with 1 loot card.', tone: -1, art: 'cond_swarm',
      setup(g, E) { g.spawnPoints.forEach((p) => E.spawnZombie(g, 'walker', p)); g.heroes.forEach((h) => E.giveLoot(g, h)); },
    },
    {
      id: 'stash', name: 'Stash', text: 'Each hero starts with 1 loot card.', tone: 1, art: 'cond_stash',
      setup(g, E) { g.heroes.forEach((h) => E.giveLoot(g, h)); },
    },
  ]);

  // ------------------------------------------- Bonus goals (3rd star) ---
  // One card is drawn at the start of the game. check(g) is checked on victory.
  ZG.Bonuses.addAll([
    { id: 'quiet', name: 'Quiet as a Mouse', text: 'Win without triggering a single Wave.', check: (g) => g.stats.waves === 0, progress: (g) => `waves: ${g.stats.waves}` },
    { track: 'Counter: +1 for each zombie killed.', id: 'hunter', name: 'Hunter', text: 'Kill 6 zombies per hero (at least 12).', check: (g) => g.stats.kills >= Math.max(12, 6 * ZG.Engine.party(g)), progress: (g) => `${g.stats.kills}/${Math.max(12, 6 * ZG.Engine.party(g))}` },
    { track: 'Counter: +1 for each Search (opening a crate too).', id: 'scavenger', name: 'Scavenger', text: 'Make 4 Searches.', check: (g) => g.stats.searches >= 4, progress: (g) => `${g.stats.searches}/4` },
    { id: 'blitz', name: 'Blitz', text: 'Evacuate before the Dead of Night.', check: (g) => ZG.Engine.phase(g) < 2, progress: (g) => `round ${g.round}` },
    { track: 'Counter: +1 for each Chain triggered.', id: 'combo', name: 'Teamwork', text: 'Play 8 Chains.', check: (g) => g.stats.chains >= 8, progress: (g) => `${g.stats.chains}/8` },
    { track: 'Counter: +1 for each Wound taken.', id: 'unscathed', name: 'Not a Scratch', text: 'Win taking no more than 1 Wound for the whole squad over the game.', check: (g) => g.stats.wounds <= 1 && !g.heroes.some((h) => h.fallen), progress: (g) => `wounds: ${g.stats.wounds}/1` },
    { track: 'Counter: +1 for each damage to large targets — Bloaters, Brutes, Nests and bosses.', id: 'biggame', name: 'Big Game', text: 'Deal 6 damage to large targets — Bloaters, Brutes, Nests and bosses.', check: (g) => (g.stats.bigDmg || 0) >= 6, progress: (g) => `${g.stats.bigDmg || 0}/6` },
  ]);

  // ---------------------------------------------------------- Difficulty ---
  ZG.Difficulties.addAll([
    { id: 'novice', name: 'Rookie', text: '+2 rounds, Night and Dead of Night come 2 rounds later, Wave threshold +2, 1 fewer manhole, Infection only on a die roll of 1, each hero starts with a loot card.', mods: { maxRounds: 2, alarmThreshold: 2, phaseShift: -2, infectDie: -1, spawnPointsBonus: -1 }, startLoot: 1 },
    { id: 'survivor', name: 'Survivor', text: 'Standard rules.', mods: {} },
    { id: 'nightmare', name: 'Nightmare', text: '−1 round, Wave threshold −1 (not below 3), Hunger already from Night, each hero has a Wound in their deck; with 3+ heroes +1 manhole.', mods: { maxRounds: -1, alarmThreshold: -1, spawnPointsBonus: (g) => (ZG.Engine.party(g) >= 3 ? 1 : 0), zombieSpeed: (g) => (ZG.Engine.phase(g) === 1 ? 1 : 0) }, startWounds: 1 },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
