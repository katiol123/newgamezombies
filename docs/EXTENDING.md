# How to extend Dead Block

The game is built so that new content is added as **data**, and new mechanics as **modifier keys and hooks**, without rewriting the engine.

```
src/core/core.js        content registries, RNG, the modifier (Mods) and hook system
src/data/*.js           ALL content: enemies, cards, heroes, talents, tiles, spawns, scenarios, conditions, levels
src/engine/board.js     building the board from tiles, paths, line of fire
src/engine/engine.js    the rules (state is plain JSON)
src/ai/bot.js           the AI for balance simulations and hints (knows no specific cards)
src/render/art.js       ALL graphics drawn in code, by key — replaceable with sprites
src/render/*.js         the board, tiles, card layout
src/ui/app.js           the interface
tools/sim.js            balance simulator;  tools/test.js — smoke tests
rules.html / print.html the rules and Print & Play — tables are built from the same data
```

## Extending “in breadth”

### A new card
```js
ZG.Cards.add({
  id: 'chainsaw', name: 'Chainsaw', suit: 'rage', cost: 2, shield: 0, noise: 2,
  type: 'Weapon', tags: ['melee'], loot: true, art: 'chainsaw', value: 13,
  text: 'Melee: 3 damage to each zombie in the zone. Noise 2.', chainText: '+1 damage.',
  target: { kind: 'zone', range: 0 },          // see the list of targets below
  play(c) { c.noise(2); c.zoneDamage(c.target, 3 + (c.chain ? 1 : 0), { kind: 'melee' }); },
});
```
Then add it to the level's loot deck (`levels.js → loot`) or to a hero's starting deck.

**Targets (`target.kind`)**: `zombie` (range 0 — your own zone; `ranged: true` — along the line of fire), `zone` (a zone with zombies on the line of fire), `move` (`steps`, `through`, `free`), `hero` (`range`, `self`, `wounded`), `cell` (any zone within N steps), `adj` (own/adjacent), `edge` (a passage for a barricade), `null` — no target.

**Effect API (`c`)**: `melee`, `rangedHit`, `zoneDamage`, `shot`, `noise`, `draw`, `energy`, `block`, `moveTo`, `heal`, `adrenaline`, `lure`, `trap`, `barricade`, `suppress`, `push`, `pull`, `status`, `equip`, `burnHeroes`, `zombie(uid)`; flags `c.chain`, `c.target`, `c.hero`, `c.g`, `c.E` (the full engine).

### A new enemy
```js
ZG.Zombies.add({
  id: 'spitter', name: 'Spitter', hp: 2, dmg: 1, speed: 1, xp: 2, armor: 0, threat: 4,
  text: 'In the zombie phase: 1 Wound to a hero within 2 zones in a straight line.', art: 'z_spitter',
  hooks: { zombiePhase(g, z, E) { /* ... */ } },
});
```
Add it to the spawn card rows (`spawns.js`) and draw `z_spitter` in `art.js` (or `ZG.Art.useImage('z_spitter', 'img/spitter.png')`). Flags: `big` (damage persists), `immobile`.

### A new hero
```js
ZG.Heroes.add({
  id: 'oleg', name: 'Oleg', nick: 'Dog', role: 'Dog Handler', color: '#8a6a3a',
  hp: 5, hand: 5, energy: 3, ability: 'Nose', abilityText: '…',
  deck: ['strike','strike','dash','step','look','cover', /* 4 of their own */],
  talents: [['t2a','t2b'], ['t3a','t3b']],
  mods: { /* passive via modifier keys */ }, hooks: { /* … */ },
  art: 'hero_oleg',
});
```

### A new tile, scenario, condition, level
* Tile — `ZG.Tiles.add({ map, doors, search, buildings, decor })`; the engine rotates it and checks connectivity itself.
* Scenario — an object with `setup / goals / isComplete / actions / doAction / botGoal / progress / roundEnd` (see `scenarios.js`; engine helpers: `placeCrates`, `placeTower`, `placeNests`, `spawnZombie`, `raiseAlarm`).
* Condition — `{ id, name, text, mods, setup }`.
* **Level (location)** — `ZG.Levels.add({ tiles, loot, spawnDeck, scenarios, conditions, rounds, phaseStarts, hunger, alarmThreshold, spawnPoints, layout })`. Level 2 can use a different tile set, board size (`layout: { tw: 4, th: 2 }`), enemy deck and pressure rules.

## Extending “in depth” (new mechanics)

**Modifiers.** Any source (hero, talent, gear, condition, scenario, difficulty) can declare `mods: { key: number | (g, hero, ctx) => number }`. The engine reads them with `ZG.Mods.value(g, hero, 'key', base, ctx)`. Already in use: `hp, handSize, energy, meleeBonus, rangedBonus, rangeBonus, shotNoise, noiseAlarm, taunt, blockPerCard, autoBlock, freeEscape, freeFirstSearch, freeFirstMove, barricadeCost, barricadeHp, trapBonus, healBonus, searchDraw, costDelta, immuneAttack, healAction, secondWind, maxRounds, alarmThreshold, phaseShift, searchCount, spawnPointsBonus, zombieSpeed`.

A new mechanic = a new key + one reading line in the engine. For example, “cold” (−1 ⚡ in the street at night): a condition with `mods: { energy: (g,h) => g.board.cells[h.pos].type==='street' && E.phase(g)>0 ? -1 : 0 }` — no engine change needed at all.

**Hooks.** `hooks: { turnStart, kill, afterBlock }` on heroes/talents/gear, `zombiePhase` on enemies, `roundEnd` on scenarios. To add a new point, call `ZG.Mods.emit(g, hero, 'name', ctx)` at the right place in `engine.js`.

**New player decisions.** The engine stops via `g.pending = { type: '…' }`; the interface shows a modal, the AI decides in `Bot.autoPending`.

## Graphics

### Sprite sizes
| What | Key | Size | Notes |
|---|---|---|---|
| Card illustration | the card's `art` field (`fist`, `sledge`, …) | **1024×512** (2:1), PNG/JPG | Cropped centred (“cover”); on cards with long text the window is lower — keep the essentials in the central band, ~60% of the height. No frame or text — the card layout draws those. |
| Hero portrait | `hero_<id>` | **1024×1024**, PNG | A bust, the face in the upper third. Used on the hero card (cropped from the top), the panel (52 px) and the round pawn on the board. |
| Zombie token on the board | `z_<type>` | **512×512**, PNG with transparency | The whole round token (with its rim). |
| Zombie portrait | `zp_<type>` | **512×512**, PNG | For the enemy reference. |
| Board tile | `tile_<id>` | **2048×2048** (print 15×15 cm ≈ 1772 px at 300 dpi) | Drawn in the original orientation (rot 0); walls/doors must match the tile's `map`. The game draws manhole and search icons itself. |
| Board tokens, exits | `tok_*`, `exit_*` | **256×256** (exits — 256×336) | PNG with transparency. |
| Conditions | `cond_*` | **800×440** | |
All drawings are functions in `ZG.Art` by key: cards (the card's `art`), heroes `hero_*`, zombie tokens `z_*` and portraits `zp_*`, board tokens `tok_*`, exits `exit_*`, conditions `cond_*`. Replacing one with a sprite is a single line:
```js
ZG.Art.useImage('hero_boris', 'img/heroes/boris.png');
```

## Sound
Sounds are set by key in `src/ui/sound.js` (files in `audio/`):

| Key | File | When it plays |
|---|---|---|
| `round` | `audio/tension.mp3` | the level intro, the start of each round |
| `zombies` | `audio/braam.mp3` | the “Zombie phase”, “Wave!”, “Breakout!” banners |
| `growl` | `audio/growl.mp3` | a zombie attacking a hero, “Ambush!” |
| `reveal` | `audio/psychedelic.mp3` | flipping a tile in the fog, “Night falls” |
| `music` | `audio/missions.mp3` | background music of a sortie: from the first view of the board to the end of the run, looped, with a smooth fade in and out (`ZG.Sound.music` / `stopMusic`) |

Small sounds (steps, hits, shots, cards, block, healing, barricade, explosion…) are synthesized with Web Audio — `ZG.Sound.sfx('shot')`. Any of them can be replaced with a file: `ZG.Sound.define('sfx_shot', 'audio/shot.mp3')`. Keys: `step, hstep, card, punch, hit, shot, blast, kill, block, chain, heal, infect, search, wood, bash, pickup, energy, click`; the mapping to board events is `SFX_MAP` in `src/render/boardview.js`.

To replace or add: `ZG.Sound.define('key', 'audio/file.mp3', { volume: 0.7, gap: 600 })`, to play: `ZG.Sound.play('key')`. The 🔊 button in the top bar mutes the sound (remembered).

## Infection and the turned
Level parameters: `infection: { die: 2, turnAt: 1, top: 4, hurts: true }` — on a die roll ≤ die a bite gives an Infection card (shuffled into the top `top` cards of the deck), `hurts` — an Infection counts as a Wound, `turnAt` — how many times an Infection must “sit out” in hand until the end of a turn for the hero to turn. `maxAttackers` — Crowding (how many zombies bite one hero per phase). `alarmThreshold`, `spawnPoints`, `startAlarm` accept a table by squad size `{ 1: …, 4: … }`; objectives scale their goal themselves (`g.heroes.length` in `setup`).

A turned hero is an ordinary enemy with id `turned_<hero>` (`base.js`); the art `z_turned_<hero>` / `zp_turned_<hero>` is drawn from the hero's portrait. Enemy flags: `breaker` (breaks a barricade in one hit), `climber` (climbs over barricades), `infects` (a hit is always an Infection), hook `onDeath(g, z, E)`.

## Balance
```
node tools/sim.js --all-pairs --games 40      # all hero pairs
node tools/sim.js --solo --games 40           # solo
node tools/sim.js --heroes kira,viktor --scenario radio --condition fog
node tools/sim.js --all-pairs --set '{"rounds":11}'   # try level parameters without editing files
node tools/test.js                            # smoke tests
```
The AI evaluates positions, not cards, so it “understands” new cards right away — handy for a first balance check.
