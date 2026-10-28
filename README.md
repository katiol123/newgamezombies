# DEAD BLOCK

A cooperative zombie board game: **Level 1 “The Outskirts”** plus an 8-mission campaign. A digital prototype (plays in the browser) + a full **Print & Play** for the cardboard version.

* 1–4 heroes, solo or two players at one screen (hot-seat); any hero can be handed to the AI — up to a spectator mode where the whole squad plays itself
* a procedural board of random tiles (random rotations), objectives, game conditions, 3 difficulty levels
* a combat card system: suits and **Chains**, cards in hand = **defense**, Wounds clog your deck, loot improves it
* round events (a die: on a 6 — an event card), fog of war, stealth
* **Alarm → Wave**, the night progressing, “Hunger” in the Dead of Night, large targets, barricades, traps, lures
* heroes with different roles and talent branches

## Running
Open `index.html` in a browser (no build needed). Or: `npx http-server -c-1 .`

* `rules.html` — the rulebook (tables are built from the game data)
* `print.html` — print sheets: cards 63×88 mm, tiles 15×15 cm, tokens, boards

## Development
```
node tools/test.js                         # engine smoke tests
node tools/sim.js --all-pairs --games 40   # AI balance simulation
node tools/trace.js <seed> boris,lisa fuel # the log of one game
NODE_PATH=$(npm root -g) node tools/print_check.js out.pdf  # print check (PDF, text overflow)
```
How to add heroes, cards, enemies, locations and mechanics — `docs/EXTENDING.md`.
All graphics are drawn in code in `src/render/art.js` and can be replaced with sprites in one line: `ZG.Art.useImage('key', 'path.png')`.
