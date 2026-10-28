# Campaign mode — design (draft)

This document records the agreed decisions. The “Open questions” section lists what is still under discussion.

## Structure

- There are more than 5 missions, many and varied. For now — a linear mission chain (no choice of the next mission; it may appear later).
- The chain starts with simple introductory/training missions with special rules (win chance ~80%). Random missions from the single-sortie mode (balanced at ~50% per run) — roughly from mission 3. Currently missions 1–8 are story missions, random ones follow.
- Later missions have their own conditions and unique tiles.
- There is no “no fog” mode in the campaign: fog of war is always on.
- Retreat (2 per campaign, `CAMPAIGN.retreats`). A failed mission (objective not completed, time ran out, everyone died) does not end the campaign while retreats remain: the squad returns to the shelter, the mission does not count and is replayed. You can also retreat voluntarily — the “Retreat” action on any turn (a decision for the whole squad): the objective is aborted, but everyone on their feet returns (wounds remain as injuries). The cost: −1 retreat, no mission rewards, Valuables from this mission are abandoned (so you cannot loot the safe to the last and then retreat at once), −1 morale for each squad member; the ration, rest and shelter event — as after a normal mission. The fallen do not return. With no retreats left, a failure ends the campaign.
- The first retreat of the campaign comes with the “Pulling out” story scene (scene `retreat`, shown once on entering the shelter; also in the gallery).
- The AI retreats on its own only if only bots are alive, the objective is not complete and one hero is left standing (retreating earlier loses winnable games: in M1 four heroes lost ~10% of wins that way).
- Bots (`tools/campaign_sim.js --fast`, the Boris+Lisa pair and a trio): retreats save survivors, but the pair still often loses heroes in the first missions, and there is nothing to hire a replacement with — bots rarely reach the finale.
- If the squad cannot be filled to the required size (heroes are gone, not enough tickets to hire) — the campaign is over.
- A fallen hero (killed, not turned) leaves the campaign for good.

## Mission tiles

1. The mission sets mandatory unique tiles (and, if needed, their positions).
2. The rest up to the board size (currently 4×2 = 8) is drawn at random from the base pool.
3. All tiles are shuffled and laid out.
4. By default unique tiles are not placed on the starting tile (it is open from the start of the game), unless the mission says otherwise.
5. A mission can exclude tiles from the base pool.

## Wandering threat

A general rule for turned allies from past missions and for location bosses (unless the mission or enemy description says otherwise):

- When each tile is revealed, a die is rolled for each threat; on a “6” it appears on that tile.
- If the last closed tile is revealed, all threats that have not yet appeared appear there without a roll.
- A separate roll for each threat, no limit on their number.
- It appears in the tile zone farthest from the heroes; in stealth mode — wandering.
- Mass reveal (a fog breakout): a roll for each revealed tile; if none came up and there are no closed tiles left, the remaining threats appear in the last revealed one.

A turned ally carries over to the next mission if it remained on the board at the end of the mission. No strengthening between missions (for now).
When a hero dies or turns, their cargo and 2 random cards from their deck drop in their zone — they can be picked up. Killing a turned hero drops nothing — only experience, as for a strong enemy.

## Currency

The currency is **tickets** 🎫. Each hero has their own ticket supply; all purchases (buildings, healing, repair) are personal, for their own personal shelter. Sources:
- a reward for each mission star earned, to each participant — so stars matter in the campaign;
- selling collected loot cards between missions (price by rarity) — the seller gets the tickets.

## What carries over between missions

- Hero level (levelling in the campaign is slower than in a single mission).
- Talents.
- Passives from secret missions. If a mission card comes up whose reward has already been received, experience is given instead of the reward.
- Loot cards — see “Shelter”: loadout (up to 3), chest, junk.
- Unique cards: found in certain missions or earned for a special condition (for example, an optional kill of a special mission enemy); they appear nowhere else.
- Health. The shelter carries over as much Grit as the hero had at the end of the mission. Wound and Infection cards are removed from the deck (the hero gets first aid), but the Grit lost to them does not come back by itself: the hero goes into the next mission with Grit reduced by the number of untreated wounds. Between missions +1 Grit is restored automatically and +1 more with the Infirmary; the rest is healed for tickets.

Heroes grow stronger — missions must grow stronger too; balance tests should take this growth into account.

## Short squad
A mission can be taken with anywhere from the minimum squad to 4 heroes. The minimum is the number of heroes who started the campaign and are still on their feet; if fewer are left, the remaining ones go. Difficulty (enemies, objectives, rounds, “Loner”) is scaled for the number of heroes actually sent.

## Shelter (between missions)

### Buildings (personal: each hero builds in their own shelter with their own tickets)
- **Infirmary** — between missions each hero restores another +1 Grit.
- **Storeroom** — each hero's chest expands from 4 to 6 slots.
- **Workshop** — repairs cards that are “about to break”.
- **Red Corner** — if the hero is not taken on a mission, morale does not drop with a 50% chance.
- **Bathhouse** — between missions, if morale is below 3, +1 morale with a 50% chance.
- **Shooting Range** (10 🎫) — once between missions: train for 6 🎫 → +1 experience (a new level — the talent is offered at the start of the mission).
- **Stash** (14 🎫) — after each mission a random consumable goes into the chest (or the junk if the chest is full): Medkit, Bandage, Energy Drink, Chocolate Bar, Canned Stew or a Pipe Grenade.
(If tests show that one of the morale buildings is useless, give it an extra effect.)

### Relations
A scale for each pair of heroes: −3 Enemies · −1…−2 Dislike · 0 · +1…+2 Pals · +3 Friends. Changes during a mission accumulate and apply after it; each reason at most once per pair per mission.
- **+1:** healing a comrade (healing, disinfecting, cauterizing, healing cards); a rescue — killed a zombie that bit a comrade in the last zombie phase; a 3 ★ mission with both surviving.
- **−1:** a comrade was bitten by a zombie this hero woke/led in; evacuating while a comrade is 1–2 zones from the exit (the player gets a warning; the AI waits for the comrade if nothing threatens it); refusing in the “Ration on credit” event.
- **No change:** giving cards in battle and gifts in the shelter (otherwise — abuse).
- **Effects:** Friends — Bond (a comrade ended their turn in your tile → your first card next turn plays with its Chain, if it has a Chain effect; a friend's death −2 morale). Pals — give cards without the “once per turn” limit. Dislike — do not give cards. Enemies — do not give cards; ending a turn in an enemy's tile → that enemy has −1 ⚡ next turn; both in the squad → −1 morale each after the mission; an enemy's death — +2 morale.

### Shelter events
A deck of 16 cards: 8 events (one each) and 8 blanks (“A quiet night” — nothing happens). After each successful mission there is an event phase: one card is drawn (when the deck runs out it is reshuffled). The hero named on the card decides: under the AI the bot decides (it keeps a reserve of tickets for the ration and healing), under a player — the player. If the card has no participants (for example, there is only one hero in the shelter), it is not played.
- **Ration on credit** — the poorest asks the richest for 2 🎫: give — no consequences; refuse — relations −1. Needs 2+ heroes.
- **Refugees at the Gate** — the richest decides: feed them (3 🎫) — +1 morale to everyone; drive them off — −1 morale to the one who decided.
- **The Bitten Stranger** — a random hero decides: let them in — 50% a rare card into their chest, 50% the stranger turns: a random hero −1 Grit, the decider −1 morale; keep the door shut — nothing.
- **A Quarrel** — the two with the worst relations, one of them decides: give in — relations +1, their morale −1; stand firm — relations −1. Needs 2+ heroes.
- **The Hawker** — the richest decides: buy a rare card for 6 🎫 or refuse.
- **The Locked Cellar** — a random hero decides: break in — 50% two consumables into the chest, 50% −1 Grit; board it up — nothing.
- **Night Watch** — the hero with the highest morale decides: volunteer — their morale −1, relations with the others +1; draw lots — a random other hero −1 morale. Needs 2+ heroes.
- **The Generator Broke** — the Workshop owner decides (if none — the richest): repair it for 4 🎫 (with a Workshop — 2 🎫) — +1 morale to everyone; sit in the dark — −1 morale to everyone.

### The wandering peddler
A separate shelter event (not a card from the event deck): only before mission 7 “White Swan” (in the chain — the `trader` field of the mission entry; `C.trader(c)`). The event deck card is played first, then the trader window; the shelf of goods is in each hero's panel until the squad heads out.
- The goods are fixed — 3 unique gear cards that are in no loot deck; each hero buys any number of copies with their own tickets (`C.buy`): “GP-5 Gas Mask” (7 🎫: Infection die −1; Chain — remove 1 Infection or Wound), “Field Binoculars” (8 🎫: ranged attack range +1; Chain — draw a card), “Medic's Bag” (7 🎫: healing removes 1 more Wound; Chain — remove a Wound from yourself). A purchase goes to the loadout if there is room, otherwise to the chest. The goods cannot be sold. Identical gear does not stack: a second identical item in the loadout adds nothing (a spare in case of breakage).
- The AI (`C.traderAI`, at the start of `autoManage` — before buildings, since the trader comes once per campaign): buys only what suits the hero, one copy each — binoculars for shooters (2+ ranged cards in the hero's deck or gear), the bag for Marina (or a hero with 2+ healing cards), the gas mask for everyone except those who rarely get infected anyway (Boris); no more than 2 cards and only if a reserve for the ration and injury healing remains after the purchase.

### The safe and Valuables
The objective places the safe (`E.placeSafe`): in M2 — the “Depot Boss's Safe” in a garage bay next to the lurking Bloaters (the cracking noise may wake them, and a fight with them wakes everyone), in M7 — the “Manager's Safe” in the banquet hall, in M8 — the “Market Till” in the east rows (away from the Butcher). A stack of 6 tokens: 4 “Valuable”, 1 “Empty”, 1 “Siren”; cracking — 2 ⚡ and Noise 2 (a zone without zombies), “Siren” — an extra Noise 3 (Alarm +3, heard 4 zones away), the safe jams, the safecracker drops one Valuable — it flies into an adjacent zone. A Valuable (`valuable`) is cargo in hand, it jingles (+1 Noise to noisy actions, does not stack), can be given; in the shelter it sells at an unknown price of 2–8 🎫 (`C.appraise`), the AI puts it in the junk — it is sold on heading out. When a hero falls or turns, their objective cargo and 2 random finds (which may include Valuables) stay in the zone.
- The AI cracks the safe as a separate decision (`wantSafe`, without “peeking” at the stack): in the campaign for tickets or with the “Safecracker” card; it does not crack if few tokens are left (the siren is 1 of the remaining), less than 4 rounds remain, it is badly wounded, the Alarm is close to a Wave, hunters are right next to it or it already holds 2 Valuables. It does not give Valuables away — unless it is about to fall and a pal or friend is nearby.
- The “Safecracker” secret objective (common, only with a safe): take a Valuable out of the safe, +2 experience; bots complete it first ~35% of the time in M7 and ~17% in M8.

### Hidden AI personalities (development only — never shown in the game)
`src/ai/persona.js`, `ZG.Persona.get(id)`. Traits: `honor` (honest: swaps the “Traitor”, and if it cannot swap — does not fulfil it; it is not credited either), `greed` (0 — the safe only for an objective, 2 — cracks to the last and does not give Valuables away), `spend` (`thrifty` — reserve +8 🎫, builds only the Stash/Infirmary/Shooting Range, takes the one most needed item from the trader, spends nothing on events; `spender` — keeps only enough for the ration, builds the bathhouse too, up to 3 items from the trader per visit), `bold` (risk in combat: a “courage” multiplier for the acting hero and a discount on its own risk), `ambition` (the weight of the secret mission), `generous` (gives a Valuable to a pal sooner), `kind` and `brave` (choices in shelter events: feed the refugees, let the stranger in, give in; the watch, the cellar).
- Boris — honest, bold, takes the watch himself. Marina — honest, thrifty, careful, generous, kind, does not touch safes. Lisa — a greedy, ambitious spendthrift. Viktor — honest and thrifty, does not loot, kind and bold. Kira — bold, a gambler. Sava — an antisocial loner (`loner`: on his turn a penalty for a zone with another hero and the adjacent ones, except the exit), honest, thrifty, careful, generous, does not touch safes. Gosha — a greedy spendthrift, bold, generous. Gleb — hates bandits (`hatesBandits`: on his turn a living bandit −140, its wounds are a joy, a pull towards the nearest visible one — while there is time and strength), a greedy spendthrift, a gambler, presses on to his goal.

### Personality hints
After a mission the shelter report sometimes shows one italic line — an indirect hint at the hidden personality of someone in the squad (“Sava slept apart from everyone again”). No more than one hint at a time and only half the time; not the same hero twice in a row; one trait of a hero — no more than twice per campaign. If the mission had a characteristic event (Gleb finishing off bandits), a hint about it comes first. The phrases are `HINTS` in `src/engine/campaign.js` (`{he|she}`, `{his|her}` — chosen by the hero's gender).

### Card wear
Wear comes from runs: what matters is whether the hero took the card on the mission (equipped it before the mission).
- A card found during a mission comes back to the shelter intact.
- An intact card that was equipped and taken on a mission becomes “about to break” at the end of the mission without any check (the card shows a warning icon).
- A card that is “about to break” and taken on a mission again is checked at the end of the mission: with a 50% chance it breaks for good; if it survives, it stays about to break.
- Not taken on a mission — no wear and no checks.
- The Workshop repairs a card: it is intact again.
- The break chance is the worst among all heroes whose hands the card passed through during the mission (taken on the run, received by giving, picked up after a drop). After the mission the card stays with whoever had it at the end. A brought card that was dropped and picked up keeps its wear.

Example: found a card in mission 1 → equipped it for mission 2 → after mission 2 it is “about to break” → equipped it for mission 3 → after mission 3 a 50% roll.

### Cards between missions
- **Loadout** — up to 3 cards per hero; at the start of the next mission they are shuffled into their deck.
- **Chest** — each hero has their own, 4 slots (with a Storeroom — 6). Cards can be given between heroes (as in battle).
- **Junk** — everything that did not fit goes here right after the mission; cards can be moved between the chest and the junk. Whatever was not sold manually and not put into the chest or loadout is sold automatically on heading out for the next mission.

### Cards of AI heroes
On returning to the shelter (and on hiring) an AI hero arranges its cards itself: the best go to the loadout (intact ones before worn ones), valuable ones that did not fit go to the chest, trifles (common cards with a value of 7 or less) go to the junk for sale.
Desperation: if Grit has dropped to half or lower, the hero takes even trifles on the run instead of selling them, and prioritizes healing and defense — the risk of death is high, it clings to any chance.

### Levels and shared talents
- Experience thresholds in the campaign: level 2 — 4 🎖, level 3 — 10 🎖, level 4 — 18 🎖, level 5 — 28 🎖 (for now; refine by balance tests, possibly raise).
- At levels 2 and 3 — a choice from the hero's own talents, as now.
- At levels 4 and 5 — 2 random shared talents from the pool to choose from (excluding those already taken).
- Shared talents are simple, mostly for the shelter; with no way to abuse them by giving cards between heroes.

The pool (draft):
- **Hardy** — between missions +1 Grit on top of the usual.
- **Handy** — cards that were only in your hands during a mission break with a 25% chance instead of 50%.
- **Hoarder** — +2 slots in your chest.
- **Thrifty** — +1 ticket for each star of a mission you took part in. (The “+1 ticket per card sold” variant was rejected: abuse through giving cards.)
- **Well-Packed** — 4 loadout slots instead of 3.
- **Ready** — start a mission with +1 card in hand.
- **Looter** — +3 tickets for a mission in which you made 2+ Searches.

### Training missions M1–M2 (~80% wins)
The goal is about 80% wins with any squad size (level 1 heroes, bots, 100 games each). Before: M1 61/45/54/64%, M2 39/41/68/71% — the campaign most often broke off at the very start.
- M1 (`camp_m1`): manholes solo 2, pair 1, three 2, four 3 (the Outskirts have 2/3/4/4); Wave threshold 6/7/8/6; no starting Alarm; rounds solo −2, pair +2, three +1; 3 medicine needed with any squad (`medsNeed`); Infection only on a “1”. Now 76/80/82/84%.
- M2 (`camp_m2`, `autobase`): the wounds of the Bloater drivers do not heal at the end of the round (`z.keepDmg`) — a Bloater has 4 ♥, and a lone hero could not take them out in one turn and fought until dawn; packs solo — 1 Shambler, pair — 2 Shamblers and a Runner; Infection only on a “1”. Now 83/80/86/77%.

## Squad and hiring
- The starting squad size (1–4) is chosen at the start of the campaign. From that size up to 4 heroes go on a mission (if the shelter has that many): hired a third for a pair — you can go as three. Mission difficulty (enemies, rounds, Wave threshold) is based on the number of heroes **sent** (`partySize` = the mission squad). You cannot take fewer than the starting size while the shelter has enough heroes on their feet (Grit 2+) — otherwise you could send one levelled-up hero against “solo” enemies. If there are not enough people (dead, badly wounded), those who are left go, and the mission is scaled for them.
- At the start the shelter has exactly as many heroes as the squad; spares come only through hiring.
- Roster: no more than max(starting squad +2, 4) — a pair can grow into a full squad.
- Ration: between missions ALL heroes pay 2 tickets each from their own supply. The ration is the condition for the automatic restoration of +1 Grit between missions.

- Rotation: before a mission you choose who goes; those left behind rest (+1 Grit on top of the usual). Only mission participants get experience.
- Hiring: one hero pays; the price is 10 🎫 (≈ the income from one good mission; it used to be 18 — after a mission heroes have 2–7 🎫 left, so a dead hero could not be replaced); AI heroes top up the squad themselves if someone has 10 🎫 + the ration; the recruit arrives at level 1 with a “starter ration” — 1 common loot card in the loadout; only heroes who have never left the campaign can be hired (a turned one cannot, while it roams).
- Bonuses for the hirer (both at once):
  - **The recruit's gift** — this hero's unique card, which cannot be obtained any other way, goes straight into the hirer's chest;
  - **Debt** — in the first 3 missions the recruit takes part in (skipped ones do not count), they give the hirer half of their star tickets.

### Hero balance (Boris)
Boris was noticeably tougher than everyone (Grit 7, “Living Shield” with +1 block per card and 1 more damage per phase “on his own”): in a campaign with permanent death this made him mandatory. “Absorbs 1 damage on his own” was removed, Grit 7 stayed. Measurement (all pairs, missions 2–6, level 2 heroes, 90 missions per hero): Boris's death rate 17% → 23% (others 23–30%), wins 57% → 51% (others 39–57%). Gleb is the secret hero, complex and ambiguous on purpose; we leave him alone.

## Morale
A 0–6 scale, a new hero starts at 3. It does not drift back to the middle by itself (for now).

It drops:
- skipped a mission (sat it out in the shelter) — −1;
- not enough tickets for the ration (went hungry, no +1 Grit) — −1;
- an ally died or turned in the mission (for all participants) — −1;
- their card broke — −1.

It rises:
- a mission completed with 3 stars — +1;
- was first to complete their secret mission — +1;
- killed a turned former ally — +2;
- hired a recruit — +1.

Temporary cards (only for the next mission, shuffled into the deck on heading out):
- morale ≤ 1 — **“Despair”** (two at morale 0). It cannot be played. When it comes into hand — immediately −1 ⚡; at the end of the turn it goes to the discard by itself (after a reshuffle it may come again). In total each appearance eats 1 ⚡ and 1 card draw.
- morale 6 — **“Courage”**: 0 ⚡, draw 2 cards, +1 ⚡, all your attacks this turn deal +1 damage; removed from the game after it is played.

## Saving and players
- Several campaign save slots.
- As in a single mission: 1 or 2 players (hot-seat); for each hero you choose who controls it — a player or the AI (you can give all of them to the AI).

## Open questions

- Level thresholds in the campaign and at which levels shared talents come.
- The content of the mission chain: unique tiles, conditions, bosses, unique cards.
- Prices: buildings, repair, healing, selling.


The experience icon is the medal 🎖 (★ is kept only for mission stars).

## How to describe a chain mission (for development)

The chain is `ZG.CAMPAIGN.chain` in `src/data/campaign.js`, one description per mission. All fields are optional:
- `name`, `brief` — the name and the introduction (shown in the shelter before heading out);
- `scenarioId`, `conditionId` — the objective and the condition (without them — random, as in a single sortie);
- `tiles: { required: ['id' | { id, tx, ty }], exclude: ['id'] }` — unique tiles and exclusions from the base pool;
- `bosses: ['zombieType']` — location bosses, subject to the Wandering threat rule.
- `levelId` — a special level (a board of a different size, other enemies, etc.), for example `camp_m1`;
- `special: ['text', …]` — special rules: changed base rules of the mission. The game marks them in the shelter and in the briefing. Changing the number and type of enemies does not count as a special rule.

Mission 1 “First Sortie” (`camp_m1`): a random objective, a 3×2 board (6 tiles from the base pool), only Shamblers and Runners as enemies, each manhole spawns 1 zombie per spawn card. No special rules.

For now, chain missions after the last story mission are random.

Mission 2 “Motor Depot No. 3” (`camp_m2`, objective `autobase`), the start of the story: the emergency convoy leaves at dawn, a van from the motor depot is needed; the keys are with two turned Bloater drivers in a garage bay.
- A 3×2 board, no manholes — no one spawns, no events.
- The unique “Motor Depot No. 3” tile is in the far (right) column, random row; its place is known (a special back), only the starting tile is open.
- 2 lurking Bloaters in the garage bay. On the other 4 closed tiles — 4 “Pack/Empty” cards face down (2 “Packs”): when a tile with a “Pack” is revealed, a pack is placed in its centre. The player knows who is waiting, but not where.
- A pack: solo — 2 Shamblers + 2 Runners; pair — 3 + 2; three — 4 + 3; four — 5 + 4. Rounds: 10 (solo 15, four 8).
- Lurking zombies stay in place until woken (the “Lurking” mode is described in the general rules, the “Stealth” section).
- A special rule (the only one, marked in the game): a fight with the Bloaters — the first hit on a Bloater or its hit on a hero — wakes everyone: the “Pack/Empty” cards are flipped, the tiles with packs are revealed, all zombies wake up and head for the fight.
- Goal: kill both Bloaters and all drive away in the van. Bots (with the “a fight wakes everyone” rule): solo 81%, pair 87%, three 90%, four 91% (squads that are weak in combat, like Lisa, are lower: their strength is in stealth objectives).

Mission 3 “The Forest” (`camp_m3`, objective `forest`), the story continues: the convoy has stopped beyond the forest; contact goes through the radio on the fire lookout tower.
- A 3×2 board made only of forest tiles: the Ranger Station (start; the well is the only spawn point; the van in the yard is the exit), Pine Forest ×3, Power Line Clearing ×2. No ordinary tiles.
- A special spawn card: at Dusk — no one; from Night on — one zombie at a time, alternating Shambler and Runner.
- The fire lookout tower is in the corner of one of the clearings; that tile is open from the start. In the centre of each pine forest there is a crate, one of them holds the battery (cargo).
- On the 4 closed tiles — “Pack/Empty” cards (1 “Pack”). A pack: solo and pair — 2 Shamblers + a Runner; three — 3 + 2; four — 3 + 3.
- The mini-boss Rogue Bear (8 Grit, 3 damage, armor 1, +6 experience) lurks in one of the pine forests; it wakes by the general “Lurking” rule. Whoever kills it gets a trophy — the unique consumable “Bear Fat” (remove 2 Wounds and gain 2 Block; sells for 8, repair 3).
- The objective: find the battery → carry it to the tower → the “Send a signal” action (1 ⚡). The twist: the signal does not get through (the antenna is chewed through, the forester's note — the convoy is waiting at the bridge), a new task appears — return to the van and all drive away. The players do not know in advance what happens after the signal: the objective and setup say nothing about it. In the cardboard version the outcome is written on a sealed “Tower” story event card (the “Campaign: story events” sheet in print.html), drawn when the signal is sent.
- No special rules. Rounds: 12 (solo 15). Bots: solo 83%, pair 85%, three 82%, four 88%; the bear is killed in ~20% of games.

Mission 4 “The Highway” (`camp_m4`, objective `highway` “Gas and Gunpowder”): a fun, unpredictable chaos — three sides on the board.
- A 4×2 board (8 ordinary tiles). Special rules: no fog (an overturned fuel tanker is burning — its glow lights up the whole highway); 2 identical packs (solo 2 Shamblers + a Runner; pair 2 + 2; three 3 + 2; four 3 + 3) are placed right away in the centres of two random tiles (except the starting and exit tiles) and wander from the first round.
- 2 manholes: quiet at Dusk, from Night on — 2 Shamblers from each (card `sp_chaos`).
- The objective: find jerrycans (4 crates, 3 jerrycans, 2 needed; with 3–4 heroes — 6 / 5 / 3), fuel the van at the right edge, all drive away. 13 rounds (solo 12).
- Bandits — a new enemy, a third side (solo 2, pair and three 3, four 4; they wander the tiles without packs; each has a loot card in its bag): heroes and zombies are equally enemies to them, and zombies hunt bandits the same way. A bandit hits in its zone or shoots along a line up to 2 zones and does not chase enemies; the wanderers' die: 1–4 — towards the nearest loot, 5–6 — stays; the “Looter” passive: next to loot, it takes it into its bag (that is how jerrycans go missing too). An attack is Noise for 2 zones; to a hero only a Wound (no Infection), to a zombie 2 damage. Killed — drops its bag; mauled — rises as a Shambler. 3 ♥, +2 experience.
- A surprise (not described in the rules): this mission's loot deck has 2 rare gear cards: the “Load-Bearing Vest” (+1 hand size, the first Search each turn — 0 ⚡) and “Bandit's Pistol” (while equipped — the basic “TT Shot” action once per turn: 1 ⚡, 2 damage to an enemy 0–2 zones away in a straight line, Noise 1; useful for any hero, not only shooters).
- Bots (level 1 heroes): solo ~83%, pair ~80%, three ~70–75%, four ~80%. Per game: 3–7 bandit attacks, 2–3.5 zombies killed by bandits, ~0.5–0.7 bandits mauled, 0.5–0.7 crates/caches cleaned out, ~0.4–0.55 jerrycans stolen.

Mission 5 “The Bridge” (`camp_m5`, objective `bridge` “Bridge Toll”): only the Forester's gang, no zombies. Links to earlier missions: the note “the convoy is waiting at the bridge” from mission 3 was bait; the tufts of fur and the “chewed” cable were the work of the Forester in a bear skin; the bandits of mission 4 have a paw brand on their wrists; the postscript “HE'S NOT A FORESTER ANY MORE” is a warning.
- A 4×2 board: the unique tiles “Bridge Checkpoint” (right column, open from the start) and “Sawmill” (third column) + 6 ordinary ones. Special rules (shown before the mission): no “Ambushes” in the loot deck, turned allies do not roam; while an enemy is in the barrier zone, you cannot leave; “Rise and shine!” (the squad has the key → the “toll” tokens jingle: the Forester always knows where the heroes are, wanderers become beaters). The number and makeup of enemies (no zombies, only the gang) do not count as special rules — they are described in the briefing and on the enemy cards.
- The checkpoint: the barrier (the exit); the Sentry at the barrier (a separate unit: does not leave its post, cannot be moved by cards) — while it is in the zone, you cannot leave; a sniper on the tower; sandbags (cover: heroes there are not shot at); the booth — a weapons cache.
- The sawmill: the hut where the Forester sleeps (the key is on his belt); a second sniper on a log pile; the saw (the control panel: 1 ⚡, once per mission — 4 damage to all enemies in the saw zone, Noise 3, Alarm +2).
- Two ways (no button to choose — what you do is what counts): quiet — sneak up to the sleeping Forester (by the general “Stealth” rules; asleep he is an ordinary lurker) and take the key with the “Take the key” action (1 ⚡, any hero in his zone); forceful — kill the Forester (the key drops from his bag) or wipe out the whole gang. Once the key is taken, the “toll” tokens jingle: the Forester wakes up and follows the trail until the end of the mission, the gang rises (“Rise and shine!”), wanderers become beaters.
- Enemies: wanderers (solo 3, pair 5, three 6, four 8), 2 snipers (they do not move, are always alert, shoot 5 zones: 2 Wounds that cannot be blocked; a silent hero is spotted only up close), the Forester (8 ♥, armor 1, an axe for 4, 2 steps per phase, “Hunter's Instinct” — once awake, sees heroes under stealth effects; asleep he is an ordinary lurker; trophy — the “Forester's Axe”: 4 damage, Chain +2 damage to another enemy). Rounds: solo 12, pair 11, three 9, four 8.
- New ordinary finds in the shared pool (4 copies each): the “Garrote” (silently kill a wandering/lurking non-large enemy — for example, the sentry) and the “Pipe Grenade” (2 damage to all enemies in a zone 1–2 away, Noise 3 — against the sniper and clusters of enemies).
- Bots (level 1 heroes, 35 games each): solo ~37%, pair ~43%, three ~57%, four ~51% — noticeably harder than earlier missions (80–90% there); easier with campaign levelling.

Mission 6 “The Churchyard” (`camp_m6`, objective `pogost`) — after “The Bridge”: the road beyond the river goes through a pine wood and an old cemetery. The goal is to take the watchman's radio from the lodge by the Shining Cross and leave by the road at the right edge (this radio is later heard in the M7 briefing).
- The “Frenzy” special rule: the dead on the Cross tile act twice in the zombie phase (move and attack, then move and attack again; special abilities, such as the Screamer's howl, also twice). One that leaves the tile in the second pass stops at once. In the engine — `g.frenzyTiles`, `E.frenzied`, the second pass of the zombie phase (`zs.frenzy`).
- A 4×2 board: forest in the two left columns (Pine Forest ×2, Power Line Clearing ×2 — quiet, no enemies), the cemetery in the two right ones: “Old Graves”, “Crypts”, “Chapel”, “Shining Cross” (the Cross column is random — `tx: [2, -1]` in `tiles.required`). The start is at the left edge, the exit at the right edge on a cemetery tile without the Cross. Open: the start, the exit, the Cross.
- Ambushes (lurking in the centres of two different random cemetery tiles, except the Cross): A — solo 3 Brutes + a Grabber, otherwise 3 Brutes + 2 Grabbers; B — 3 Runners + a Screamer (pair + a Grabber, three and four + a Grabber and a Brute). Ambushes are lurking stacks (they stay put until they see a hero, hear a noise or get hit; once awake they hunt, and having lost the trail they wander); the token counts in the fog are hidden.
- The radio is taken from a crate in the lodge; in hand it comes to life — it can be heard 4 zones from the lodge (it wakes ambushes, the Alarm does not rise). The radio must be carried out: its carrier is the first to leave by the road (`canEvac`, `onEvac`).
- Manholes: 2 on random cemetery tiles (except the exit) — the forest is quiet; deck `sp_pogost`: Dusk — quiet, Night — a Shambler + a Runner, Dead of Night — 2 Shamblers + a Runner. 14 rounds (pair and three −2, four −3), Wave threshold 5 / 5 / 4 / 3, starting Alarm for three and four — 1.
- Bots (level 2–3 heroes with gear, “Survivor”, 40–60 games): wins solo 55%, pair 62%, three 40%, four 47%.

Mission 7 “White Swan” (`camp_m7`, objective `wedding`) — after “Beyond the river”: the convoy's radio says to take the northern road, and it runs past a restaurant where a wedding was held on the day of the outbreak. The goal is to kill the Bitten Bride (her wail holds the suburb) and leave by the northern road.
- A 4×2 board: “White Swan Restaurant” (left column) and “Wolves Camp” (right) + 6 ordinary tiles. The start is a random tile in column 2; the exit is another tile in the right column. Manholes: a random tile in column 2 and a random tile in column 3. Open from the start: the start, the restaurant, the camp, the exit.
- The wedding pack in the hall (wandering): the Bitten Bride (a boss: 9 ♥, hit 2; one ability per phase: hits a hero in her zone, otherwise, while hunting, wails at visible heroes in adjacent zones — a useless “Bride's Wail” card is shuffled into their decks, the wail is heard 2 zones away) + a Bloater + 3 Runners. Solo: the bride starts with 4 damage tokens, four heroes — 1 (“the groom managed to strike”).
- The Wolves Camp: 5 Cutthroats (3 ♥, armor 1, a sawn-off for 0–1 zones: a Wound to a hero, 2 damage to a zombie; they wander like zombies — die 1–2 towards their camp, 3–4 towards the centre, 5–6 stay — and hunt like zombies) and a Sniper on the tower (as at the bridge).
- A mystery: a “?” token by the campfire. Coming within 2 zones triggers the “The Prisoner” story scene and a new optional goal: free him before the end of round 14 (a hero in his zone, no bandits in it, 1 ⚡). Too late — an execution. The prisoner is not mentioned in the goals or the briefing; in the cardboard version — a sealed “The Prisoner” story event card.
- The reward for the rescue is the secret hero Gleb “Double-Tap”: he joins the shelter at once (at the squad's average level, choosing talents at the start of the next mission), cannot be hired; after the first rescue he is also unlocked for single games.
- Spawn deck `sp_wedding`: Dusk — quiet, Night — a Runner + a Shambler, Dead of Night — a Bloater + a Runner. 16 rounds (solo 19, four 17); Wave threshold 7 / 6 / 6 / 6.
- Finds unique to this mission: the “Double-Barrel Hunting Rifle” (rare ×2: 3 damage to the target + 1 to a neighbour, 0–1 zones) and the “Silver Knife” (unique ×1: melee 2, 4 against a large target).
- Bots (level 2–3 heroes with gear, “Survivor”, 80 games each): wins solo 31%, pair 36%, three 35%, four 28%; the prisoner rescued 4 / 21 / 24 / 24% (after the bride's death the AI goes to check the “?” token by the campfire if it has time to get back to the exit; solo it does not take the risk); without a single wound — 1–3% (solo 16%).


Mission 8 “High Noon” (`camp_m8`, objective `market`) — after “White Swan”: the northern road runs into the district town's farmers' market, and beyond it, at the way out, is the Wolves camp. The goal is to break through the market and the camp to the road at the right edge; killing the Butcher is optional.
- Special rules: “Day” (no dusk or night, all tiles open), “Wolves reinforcements” (no manholes; for each Wave — 2 beater Cutthroats at the right edge), “Roadblock” (while a bandit is in the exit zone, you cannot leave).
- A 5×2 board (a 4×2 variant was tested and dropped: solo 33%, four 73% — the difficulty depended heavily on squad size). The west rows — column 2, the “Farmers Market” (the meat row) — column 3, the east rows — column 4, the “Wolves Camp” — column 5. The start is at the left edge, the exit at the right edge on the camp tile.
- The Butcher (a boss: 12 ♥, armor 1, hit 2, speed 1). “Swing”: hits everyone in his zone — heroes, bandits and his own zombies — for 2 + “Blood”. The chain: after an attack he pulls the most wounded hero from an adjacent zone (no hero — a bandit). “Fresh Meat”: any death in his or an adjacent zone (except those he cut down himself with the “Swing”) — +2 ♥ and a “Blood” token (no limit); a hit for 3+ damage knocks a token off. “Nose for a crowd”: he goes only for the living (heroes, bandits), to the visible zone where there are the most of them; lures and zombies do not distract him. Trophy — the “Butcher's Hook”.
- The Butcher's retinue (wandering): solo — a Shambler; pair — a Shambler and a Runner; three — a Bloater and a Shambler; four — a Bloater, a Shambler and a Runner. A Screamer hawker is in the centre of the west rows (its howl raises the Alarm → Wolves reinforcements).
- Neutral strips (ordinary wanderers): columns 2 and 4 — solo a Shambler + a Runner / a Shambler; pair a Shambler + a Runner / a Shambler + a Runner; three 2 Shamblers + a Runner / a Shambler + a Runner; four 2 Shamblers + a Runner / 2 Shamblers + a Runner.
- The Wolves: Cutthroats at the camp 2 / 3 / 5 / 7, a Sniper on the tower, the roadblock on post in the exit zone 2 / 3 / 4 / 4 (sentries on post do not heal their wounds at the end of the round — otherwise the roadblock “regrew” and the squad got stuck on it until the timeout), looters on the adjacent tile of the right column 2 / 1 / 2 / 2; each bandit has a loot card in its bag.
- 12 rounds, Wave threshold 6, the “Clear Noon” condition (no effects), the “Blitz” bonus excluded.
- Bots (level 2–3 heroes with gear, “Survivor”, 60 games each): wins solo 32%, pair 48%, three 38%, four 53%. The AI storms the roadblock: when the objective is complete and enemies hold the exit, damage to them weighs more, and heroes' caution within 3 zones of the exit is lowered (except for those on their last wound); four-hero timeouts — 20 of 100 (were 32), no one “stands two steps away” from the exit any more; the Butcher is killed 10–45% of the time (more often by a big squad). The AI values damage to the roadblock in the exit zone (without that, four heroes got stuck on the post and lost on time).

## Gleb “Double-Tap” (the secret hero)
A duellist with paired pistols: Grit 4, hand 4. “Two-Handed”: a ranged card right after another one costs 0 ⚡ (once per turn). Flaws: “Reload” (after a double tap −1 ⚡ next turn), “Hands Full” (Punch unavailable), “Loud Barrels” (+1 Noise to each shot). Cards: Left Barrel, Right Barrel (Agility — they chain with each other), Fan Fire (on a zone), Reload. Talents: Steady Hand / Speed Loader; Gunslinger / Lead Rain.

## Epilogue
Shown once after winning the last mission of the chain (again — with the “📜 Epilogue” button). The text is assembled from chapters: the introduction → a line from each completed mission (depending on how it went: `c.flags`, stars from `c.history`) → the finale (how many made it, whom they lost). Below — the summary: survivors, the fallen, the chapters' fact lines, the roaming turned.
- The data is `ZG.EPILOGUE` in `src/data/campaign.js`: `intro`, `chapters: [{ no, line(c, m), fact(c, m) }]`, `outro(c)`.
- **A new chain mission = a new entry in `chapters`** with its number (and, if needed, a flag in `C.finishMission`, for example `c.flags.gleb`). The epilogue code does not need changes; the finale always comes after the last chapter.

## Story scenes

A mission sets `stories: { event: id }`, the texts are `ZG.STORIES` in `src/data/campaign.js`, the illustrations `art/story/<id>.jpg` (16:9; prompts — `docs/STORY_ART.md`). Each scene is shown once per mission, only in the campaign. Events: `start` (the prologue before the briefing), `firstKill`, `night`, `packReveal`, `rouse`, `bossesDown`, `cargo` (the first cargo from a crate), `bossWake`, `bossKill`, `twist` (an illustration for the twist window), `firstBandit`, `banditBitten`, `firstSniper`, `saw`, `blood` (the first death next to the Butcher), `wolves` (Wolves reinforcements on a Wave), `frenzy` (the first “Frenzy” at the Cross), `brutes` (the Brutes woke up in the churchyard).
