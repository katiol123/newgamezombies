/*
 * Campaign mode data: parameters, prices, shelter buildings, shared talents, temporary morale cards.
 * Rules — docs/CAMPAIGN.md. Logic — src/engine/campaign.js.
 */
(function (G) {
  const ZG = G.ZG;

  ZG.CAMPAIGN = {
    xpLevels: [4, 10, 18, 28], // levels 2–5; levels 4 and 5 give shared shelter talents
    // The mission chain. Description fields (all optional):
    //   name, brief — title and briefing for the shelter; scenarioId, conditionId — task and condition (otherwise random);
    //   tiles: { required: ['id' | { id, tx, ty }], exclude: ['id'] } — unique tiles and pool exclusions;
    //   bosses: ['zombieType'] — location bosses (Wandering threat: appear when tiles are revealed).
    //   levelId — an easier/special level; special: ['text'] — special conditions (the game highlights them).
    // Missions 1–5 are story missions (their own levels, tasks, special rules); beyond that — random ones from single-sortie mode for now.
    chain: [
      { name: 'First Sortie', brief: 'The first sortie from the shelter. An ambulance full of wounded is stuck in the next block: the driver is alive, but without medicine the wounded will not last until morning. Gather medicine from the crates, load it into the ambulance and drive off with it. There are few dead here — only Shamblers and Runners, and fewer than usual come from the manholes.', levelId: 'camp_m1', scenarioId: 'meds', stories: { start: 'm1_start', firstKill: 'm1_first_kill', night: 'm1_night' },
        special: ['Training mission: 3 medicine needed for any squad size; Infection only on a "1"; fewer manholes (solo 2, duo 1, trio 2, four 3), higher Wave threshold.'] },
      {
        name: 'Motor Depot No. 3',
        levelId: 'camp_m2', scenarioId: 'autobase', conditionId: 'calm', tiles: { required: [{ id: 'autobase', tx: -1 }] }, // at the far edge of the district
        stories: { start: 'm2_start', packReveal: 'm2_pack', rouse: 'm2_rouse', bossesDown: 'm2_keys' },
        brief: 'At night the radio caught a scrap of a broadcast: an emergency convoy is leaving the city at dawn by the bypass road — they will not wait for anyone. On foot you will not make it. At Motor Depot No. 3 there is a fueled-up van, but two drivers locked themselves in the garage bay on the first night — in a week they ate the whole canteen and turned into swollen Bloaters. They have the van keys. And two packs of the dead lurk in the neighboring yards: where exactly, nobody knows. There are no manholes in these blocks — no new dead will crawl up from underground. Kill both Bloaters and drive off together.',
        special: [
          'A fight with the Bloaters (the first hit on a Bloater or its hit on a hero) wakes everyone: flip all "Pack/Empty" cards — reveal the tiles with packs, all zombies on the map wake up and head for the fight.',
          'In the depot garage bay — the "Depot Boss\'s Safe" (see the "Safes and Valuables" rules): the Bloaters next door hear the cracking noise.',
          'Training mission: the wounds of the two Bloater drivers do not heal at the end of the round; Infection only on a "1".',
        ],
      },
      {
        name: 'The Forest',
        levelId: 'camp_m3', scenarioId: 'forest', conditionId: 'calm',
        stories: { start: 'm3_start', cargo: 'm3_battery', bossWake: 'm3_bear', twist: 'm3_twist', bossKill: 'm3_bear_dead' },
        tiles: { required: [{ id: 'kordon', tx: 0 }, 'bor', 'bor', 'bor', { id: 'proseka', tx: -1 }, 'proseka'], startTile: 'kordon' }, // the clearing with the tower — in the far column
        brief: 'The van broke out of the city after the convoy, but beyond the forest the convoy stopped, and then went off the air altogether. The last thing we caught: "…a helicopter will pick up whoever sends a signal…". The old ranger station is empty and eerie — at night the well in the yard scratches from the inside. A fire tower with a radio sticks up above the forest, but its battery died long ago. Somewhere in the pine woods the ranger kept a spare battery. And they say an infected rogue bear roams those same woods — you do not have to meet it, but the fat of such a beast is worth more than any medkit.',
      },
      {
        name: 'The Highway',
        levelId: 'camp_m4', scenarioId: 'highway', conditionId: 'calm',
        stories: { start: 'm4_start', firstBandit: 'm4_bandit', banditBitten: 'm4_bitten', cargo: 'm4_fuel', night: 'm4_night' },
        special: [
          'No fog: the burning fuel tanker lights the whole highway — all tiles are open from the start of the mission.',
        ],
        brief: 'Twenty kilometers of highway to the bridge, and the fuel needle hit zero back in the forest. The van rolled up to an old gas station and died. On the exit ramp a fuel tanker lies overturned and burning — its glow floods the highway with orange light for a kilometer around: everything is in plain sight, nowhere to hide. The pumps are dry, but there are abandoned cars and crates around, there must be jerrycans somewhere. The trouble is, we are not the only ones looking for gas: bandits rule the highway. They shoot at everything that moves — the living and the dead alike — and the gunfire draws the dead out of the manholes. Let them tear at each other — just do not end up between them.',
      },
      {
        name: 'The Bridge',
        levelId: 'camp_m5', scenarioId: 'bridge', conditionId: 'calm', noWanderers: true,
        tiles: { required: [{ id: 'checkpoint', tx: -1 }, { id: 'sawmill', tx: 2 }] },
        stories: { start: 'm5_start', firstSniper: 'm5_sniper', bossWake: 'm5_forester', cargo: 'm5_key', saw: 'm5_saw', bossKill: 'm5_forester_dead' },
        brief: 'The van is fueled with gas taken from the bandits. Every one of them had a brand on his wrist — a bear\'s paw, and one, dying by a pump, wheezed: "The Forester… will… meet you." The note from the tower called us to the bridge — and we go to the bridge, because there is no other road. The convoy, if it is still there, is on the other side of the barrier. No dead are to be seen here: the Forester\'s gang cleaned out the area. Two snipers hold the road, and the Forester himself, they say, sees in the dark and hears the grass grow. There are different ways through: quietly take the barrier key off the sleeping Forester\'s belt — sneaking up on him in the hut at the sawmill — or wipe out the whole gang. Your call.',
        special: [
          'There are no "Ambush" cards in the loot deck. Turned allies from past missions do not roam in this mission.',
          'The barrier is guarded by a Sentry: while there is an enemy in the barrier zone, you cannot leave over the bridge — even when the task is complete.',
          '"On your feet!": as soon as the squad has the barrier key (taken from the sleeping Forester or picked up after his death), the "toll" tokens jingle. The Forester (if alive) wakes and until the end of the mission always knows where the heroes are; wanderers drop their looting and become hunters — they pursue the squad and do not roll the wanderer die; the snipers and the Sentry stay put.',
        ],
      },
      {
        name: 'The Churchyard', levelId: 'camp_m6', scenarioId: 'pogost', conditionId: 'calm',
        tiles: { required: [{ id: 'bor', tx: 0 }, { id: 'proseka', tx: 0 }, { id: 'bor', tx: 1 }, { id: 'proseka', tx: 1 }, { id: 'krest', tx: [2, -1] }, { id: 'pogost_graves', tx: [2, -1] }, { id: 'pogost_crypts', tx: [2, -1] }, { id: 'pogost_chapel', tx: [2, -1] }] },
        stories: { start: 'm6_start', frenzy: 'm6_frenzy', brutes: 'm6_brutes', cargo: 'm6_radio' },
        special: [
          'Frenzy: the dead on the Shining Cross tile act twice in the zombie phase — they move and attack, then move and attack again (special abilities — twice too). One that leaves the tile during its second action stops at once: the frenzy fades.',
          'The radio comes alive in your hands: when it is taken out of the crate, its wheeze is heard 4 zones from the lodge (the dead wake up and head for the sound; Alarm does not rise). You cannot leave without the radio: the one carrying it leaves by the road first.',
        ],
        brief: 'The barrier is up, the bridge is behind us. No convoy — only tire tracks on the wet asphalt, leading into the forest across the river. The van has gas for a couple dozen kilometers, and without a radio we are driving blind. The road to the suburb runs through pine woods and an old cemetery. A huge cross glows above the churchyard — with an even white light, without wires or fire. They say the cemetery watchman had a radio. And they say the dead by that cross know no fatigue. Take the radio from the lodge by the Cross and leave by the road to the suburb.',
      },
      {
        name: 'White Swan', levelId: 'camp_m7', scenarioId: 'wedding', conditionId: 'calm',
        // before the mission a wandering peddler visits the shelter (a separate event, not a card from the event deck)
        trader: {
          name: 'Wandering Peddler',
          text: 'A bicycle pulls up to the shelter towing a trailer made from a baby stroller, piled high with canvas bundles. The owner is a dried-up old man in a greatcoat without shoulder straps, with a cataract in one eye. "They opened the bridge — so there is a road for me too. I take tickets, I take ammo, I do not take tins — got plenty of my own." He has little to sell, but you will not find it anywhere else. And he will not stay past morning.',
          stock: [{ id: 'tr_gasmask', price: 7 }, { id: 'tr_binoculars', price: 8 }, { id: 'tr_medbag', price: 7 }], // affordable after 6 missions (heroes usually have 5–12 🎫)
        },
        tiles: { required: [{ id: 'banquet', tx: 0 }, { id: 'wolfcamp', tx: -1 }] },
        stories: { start: 'm7_start', bossScream: 'm7_scream', prisoner: 'm7_prisoner', rescue: 'm7_rescue', executed: 'm7_executed', bossKill: 'm7_bride_dead' },
        brief: 'The suburb gave us a breather and a radio with a cracked speaker. Through the static — the voice of the convoy: "…north road… do not stop at the restaurant…". There is only one north road, and it runs past the White Swan restaurant. On the day it all began, a wedding was being held there. The guests still have not left. And at night a woman\'s scream carries over the suburb — such that the dead raise their heads a kilometer away. While she screams, the road cannot be passed. At the far edge, right by the road, someone\'s campfire is burning: strange cars, a tower, people in balaclavas with skulls. Back at the bridge there were whispers about a gang called the Wolves.',
      },
      {
        name: 'High Noon', levelId: 'camp_m8', scenarioId: 'market', conditionId: 'noon',
        tiles: { required: [{ id: 'kolhoz_w', tx: 1 }, { id: 'kolhoz', tx: 2 }, { id: 'kolhoz_e', tx: 3 }, { id: 'wolfcamp', tx: -1 }] },
        stories: { start: 'm8_start', bossWake: 'm8_butcher', blood: 'm8_blood', wolves: 'm8_wolves', bossKill: 'm8_butcher_dead' },
        special: [
          'Daytime: no dusk and no night — the time of day does not change, the tiles are open from the start of the mission.',
          'Wolves reinforcements: no manholes; on a Wave, instead of spawn cards, 2 hunting Cutthroats appear at the right edge of the board for each Wave.',
          'Roadblock: while there is a bandit in the exit zone, you cannot leave.',
        ],
        brief: 'The north road led to the district town and ran straight into the farmers market: no way around, only straight through the rows. Beyond the market, at the north exit, is the Wolves camp: cars across the road, a tower with a sniper, a roadblock on the exit itself. By day the dead are sluggish, but at noon the sun stands so that there is nowhere to hide: everything in plain sight, no dusk, no night. The locals whispered that since the first day someone has been butchering carcasses in the meat row — and it is not a man. Cross the market and break through the Wolves camp to the road at the right edge.',
      },
    ],
    retreats: 2, // retreats per campaign: a failed (or abandoned) mission is not the end — the squad goes back to the shelter and replays it
    morale: { start: 3, max: 6, low: 1 }, // ≤ low — "Despair" (two at 0), = max — "Courage"
    slots: { equip: 3, chest: 4, chestBig: 6 },
    breakChance: 0.5,
    prices: {
      star: 5, // tickets to each participant per mission star
      sell: { common: 2, rare: 5, unique: 8 }, // campaign-only cards cannot be sold
      heal: 4, // +1 Grit
      repair: { common: 1, rare: 2, unique: 3 },
      hire: 10, // hiring a recruit (was 18 — heroes have 2–7 🎫 left after a mission, a replacement could not be afforded)
      train: 6, // Shooting Range: +1 XP
      hireTalons: 4, // a recruit arrives with a small stash of tickets
      ration: 2, // ration: everyone pays between missions
    },
  };

  // Buildings are personal: each hero builds in their own shelter with their own tickets
  ZG.Buildings = ZG.Buildings || (function () {
    const items = {};
    return {
      add(d) { items[d.id] = d; },
      get(id) { return items[id]; },
      all() { return Object.values(items); },
    };
  })();
  [
    { id: 'infirmary', name: 'Infirmary', cost: 15, text: 'Between missions +1 Grit on top of the usual.' },
    { id: 'storage', name: 'Storeroom', cost: 12, text: 'The chest grows from 4 to 6 slots.' },
    { id: 'workshop', name: 'Workshop', cost: 10, text: 'Lets you repair cards that are "about to break" (1 / 2 / 3 🎫 — common / rare / unique).' },
    { id: 'redcorner', name: 'Red Corner', cost: 10, text: 'If the hero is not taken on a mission, there is a 50% chance their morale does not drop.' },
    { id: 'bath', name: 'Bathhouse', cost: 10, text: 'Between missions, if morale is below 3, a 50% chance of +1 morale.' },
    { id: 'range', name: 'Shooting Range', cost: 10, text: 'Once between missions: train for 6 🎫 — +1 XP.' },
    { id: 'stash', name: 'Stash', cost: 14, text: 'After each mission a random consumable goes into the chest: Medkit, Bandage, Energy Drink, Chocolate Bar, Canned Stew or Pipe Grenade.' },
  ].forEach((b) => ZG.Buildings.add(b));

  // Shared shelter talents (campaign levels 4 and 5: choose from 2 random ones)
  ZG.Talents.addAll([
    { id: 'sh_tough', shelter: true, name: 'Hardy', text: 'Between missions +1 Grit on top of the usual.' },
    { id: 'sh_handy', shelter: true, name: 'Handy', text: 'Cards that were only in your hands during a mission break with a 25% chance instead of 50%.' },
    { id: 'sh_hoarder', shelter: true, name: 'Hoarder', text: '+2 slots in your chest.' },
    { id: 'sh_thrifty', shelter: true, name: 'Thrifty', text: '+1 ticket for each star of a mission you took part in.' },
    { id: 'sh_packer', shelter: true, name: 'Well-Packed', text: '4 gear slots instead of 3.' },
    { id: 'sh_ready', shelter: true, name: 'Ready', text: 'Start the mission with +1 card in hand.', mods: { startDraw: 1 } },
    { id: 'sh_scavenger', shelter: true, name: 'Looter', text: '+3 tickets for a mission in which you made 2+ Searches.' },
  ]);

  // Recruit gifts: a unique hero card (campaign only, cannot be sold) — goes to the hirer when hiring
  const GIFT = { kind: 'gift', campaignOnly: true, rarity: 'unique', type: 'Gift', value: 11 };
  ZG.Cards.addAll([
    Object.assign({}, GIFT, {
      id: 'gift_helmet', name: "Foreman's Hard Hat", from: 'boris', suit: 'mind', cost: 1, shield: 2, tags: ['block'],
      text: 'Gain 3 Block.', chainText: '+1 Block and draw 1 card.', art: 'shield', target: null,
      play(c) { c.block(3 + (c.chain ? 1 : 0)); if (c.chain) c.draw(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_kit', name: 'Field Kit', from: 'marina', suit: 'mind', cost: 1, shield: 1, tags: ['heal'],
      text: 'A hero in your zone (yourself included) removes 1 Wound or Infection. Draw 1 card.', chainText: 'removes 1 more.', art: 'medkit',
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 1 + (c.chain ? 1 : 0), true); c.draw(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_map', name: 'Rooftop Map', from: 'lisa', suit: 'agility', cost: 1, shield: 1, tags: ['move'],
      text: 'Move 1–3 zones, even through zombies; Grip does not apply. Draw 1 card.', chainText: '+1 ⚡.', art: 'roof',
      target: { kind: 'move', steps: 3, through: true },
      play(c) { c.moveTo(c.target); c.draw(1); if (c.chain) c.energy(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_rifle', name: 'Trophy Rifle', from: 'viktor', suit: 'mind', cost: 1, shield: 0, noise: 1, tags: ['ranged', 'gun'],
      text: 'Ranged, range 0–3. 3 damage. Noise 1.', chainText: '+1 damage.', art: 'pistol',
      target: { kind: 'zombie', range: 3, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 3 + (c.chain ? 1 : 0)); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_toolbox', name: 'Toolbox', from: 'kira', suit: 'mind', cost: 1, shield: 1, tags: ['barricade'],
      text: 'Put a Barricade (durability 5) on a passage out of your zone. Draw 1 card.', chainText: '+1 ⚡.', art: 'weld',
      target: { kind: 'edge' },
      play(c) { c.barricade(c.target, 5); c.draw(1); if (c.chain) c.energy(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_lure', name: 'Decoy Call', from: 'sava', suit: 'mind', cost: 0, shield: 1, tags: ['lure'],
      text: 'Noise in a zone within 3 zones of you (no Alarm). Zombies within 3 zones of it go to check. Draw 1 card.', chainText: 'heard 1 zone farther.', art: 'whistle',
      target: { kind: 'cell', range: 3 },
      play(c) { c.pebble(c.target, 3 + (c.chain ? 1 : 0)); c.draw(1); },
    }),
    Object.assign({}, GIFT, {
      id: 'gift_flare', name: 'Road Flare', from: 'gosha', suit: 'rage', cost: 1, shield: 0, tags: ['lure'],
      text: 'Place a Lure in a zone within 3 zones of you: until the end of the round zombies treat it as a hero. Alarm does not rise.', chainText: 'draw 1 card.', art: 'firecracker',
      target: { kind: 'cell', range: 3 },
      play(c) { c.lure(c.target, 0); if (c.chain) c.draw(1); },
    }),
  ]);
  ZG.Cards.all().filter((d) => d.kind === 'gift').forEach((d) => { ZG.Heroes.get(d.from).gift = d.id; });

  // --- Campaign story inserts: fiction text at key moments of the missions ---
  // Illustration — art/story/<id>.jpg (16:9); until the file exists, a dark splash screen is shown.
  ZG.STORIES = {
    m1_start: { kicker: 'Mission 1', title: 'First Step Outside', text: 'The shelter door shut behind us with a sound like a coffin lid slamming. The street smells of wet asphalt, burning and something cloyingly sweet — the smell of meat left out in the sun. On the playground the swings are creaking, though there is no wind. Somewhere behind the garages someone is slowly, wheezingly, drawing in air. We were not expected here. But we have already been smelled.' },
    m1_first_kill: { kicker: 'First Blood', title: 'Neighbors', text: 'He fell face-first into a puddle and did not get up again. Only now can you see: he is wearing slippers and a flowered bathrobe, with a key on a string around his neck, the way children wear them. Maybe he lived one floor up. Maybe he said hello in the elevator. His fingers still clutch a bag of bread — hard as stone. Do not look at the face. It is not a person anymore. It is not a person anymore.' },
    m1_night: { kicker: 'Night Falls', title: 'Darkness from Below', text: 'The streetlights never came on. The darkness did not come from above — it rose from below: from the manholes, from the basements, from the gaping doorways. With it rose a sound — hundreds of shuffling feet, as if the whole district had got out of bed at once and wandered to the kitchen. Somewhere a window slammed, and from the darkness came a howl in reply. Not a dog\'s. A human\'s.' },
    m2_start: { kicker: 'Mission 2', title: 'The Depot Gates', text: 'The gates are warped; on the chain-link — shreds of a jacket and brown smears dried in the shape of palms. As if someone had tried for a long time to get out. From the inside. In the guard booth a radio drones, playing the same song over and over. The garage bay reeks of diesel and rot. In there, in the dark between the lifts, something is breathing heavily — through two throats at once.' },
    m2_pack: { kicker: 'Lurking', title: 'The Pack', text: 'At first it looked like a heap of garbage bags by the fence. Then the bags turned their heads. They lay in a tangle, packed tight, the way stray dogs sleep in winter, and rose one after another, snapping their stiffened joints like dry branches. Not one made a sound. They just watched. And waited to see who would run first.' },
    m2_rouse: { kicker: 'Fight in the Garage', title: 'The Drivers', text: 'The Bloater crashed onto a hood, and the delivery van\'s alarm wailed across the whole block. The second one slowly straightened up by the lift — in greasy overalls, with a badge reading "Driver, 1st class". His belly burst at the seam, and something black poured onto the concrete. And then from all sides — from behind the garages, from the inspection pits, from under the cars — came an answer. The block has woken up. The block is coming here.' },
    m2_keys: { kicker: 'The Keys', title: 'The Girl with Bows', text: 'The keys had to be dug out of a breast pocket. The key fob — a plastic icon and a photo of a girl with bows in her hair — was stuck together with blood. The van\'s engine coughed like it had a cold, and started. The girl in the photo was smiling. Nobody threw her away.' },
    m3_start: { kicker: 'Mission 3', title: 'The Ranger Station', text: 'The forest is silent the way people are silent at a funeral. At the ranger station the doors are wide open; on the table — cold tea and an open logbook: the last entry was made a week ago and breaks off mid-word. The well in the yard is covered with boards and weighed down with a stone. The boards are twitching. From below, from the depths, someone is scraping their nails along the wet log shaft — patiently, without stopping.' },
    m3_battery: { kicker: 'A Find', title: '"Mishka Comes at Night"', text: 'The crate is nailed shut from the inside. In it — a battery, carefully wrapped in a quilted jacket, and on top a child\'s drawing: a house, fir trees, the sun and a big brown beast with red eyes. Signed in crooked letters: "MISHKA COMES AT NIGHT". Somewhere deep in the pines a thick branch cracked. Then another. Closer.' },
    m3_bear: { kicker: 'He Woke Up', title: 'The Rogue', text: 'First came the smell — sweet, rotten, animal. Then a mountain of matted fur rose from under an upturned root. The bear stood up on its hind legs, and you could see: half its muzzle is gone, teeth show white through the cheek, and a broken boar-spear sticks out of its side — the ranger sold his life dearly. The beast did not roar. It drew in the air, turned its head toward where we stand — and came.' },
    m3_twist: { kicker: 'The Tower', title: 'The Signal Failed', text: '' }, // the text is in the task (the plot-twist window), here only the illustration
    m3_bear_dead: { kicker: 'Trophy', title: 'The Last Round', text: 'The bear sank slowly, like a felled tree, and was still scraping the ground with its claws when nothing alive was left in it. A scrap of canvas jacket with a "Forest Guard" patch was stuck in its teeth. The fat on its flanks smells of iron and pine needles. They say it closes wounds overnight. Better not to think about what the beast fed on this autumn.' },
    m4_start: { kicker: 'Mission 4', title: 'The Glow', text: 'An overturned fuel tanker is burning on the highway exit. The flames roar like a living thing and flood everything with orange light — the shadows dance, and behind the trucks something that does not hide from fire is moving. The gas station greets us with the smell of soot and gasoline that evaporated a week ago. On the store window — a crooked slogan in red paint: "EVERYTHING HERE IS OURS". Under it lies the one who argued. Someone\'s hand is wired to a pump with a "Register closed" sign. Somewhere behind the trucks a rifle bolt clicks, and a hoarse voice laughs — long, merry, terrible.' },
    m4_bandit: { kicker: 'A Third Side', title: 'Masters of the Highway', text: 'He stepped out from behind a truck — tracksuit, balaclava, pistol in a lowered hand — and shot not at us, but at a Shambler by the roadside. Lazily, as if at an empty bottle. On his wrist was a dark brand — a burned-in bear\'s paw. Then he slowly turned his head. For people like him the end of the world is a holiday: no laws, no witnesses. The dead are targets to them. So are we.' },
    m4_bitten: { kicker: 'Turncoat', title: 'No Longer His Face', text: 'The bandit fired to his last bullet, and then just screamed until they dragged him down. The scream broke off on a high note. For a minute it was quiet. Then his fingers twitched, felt for the empty pistol — and let go. He got up clumsily, like a drunk, and turned toward us. The balaclava had slipped, and under it — the face of a mere boy. Not his anymore.' },
    m4_fuel: { kicker: 'A Find', title: '"Sashka\'s. Hands Off"', text: 'The jerrycan is heavy, full, the gasoline sloshing in it — the sweetest sound in weeks. Scratched into the handle with a knife: "Sashka\'s. Hands off". Sashka, it seems, is not coming back. Behind us, by the trucks, the gunfire suddenly stopped. Silence on the highway is scarier than shots: it means someone is already finishing someone off.' },
    m4_night: { kicker: 'Night Falls', title: 'The Dinner Bell', text: 'With the dark the manholes on the highway came alive. The lids jump like on boiling pots, and from under them they crawl — slowly: one hand, the other, a shoulder. The bandits\' shots roll along the empty road, and each one is like a dinner bell. The dead walk toward the sound. And the sound is everywhere.' },
    m5_start: { kicker: 'Mission 5', title: 'The Toll', text: 'Dawn never came — the gray sky just grew lighter, like murky water. The van crawled up the last hill before the river. There it is, the bridge. No convoy. Its trucks stand at the barrier: doors flung open, tarps slashed, on the asphalt — suitcases, children\'s shoes, spent cartridges. A bearskin is nailed to the checkpoint booth, and under it a sign written in charcoal — in the same hand as the note on the tower: "PASSAGE — FOR A TOLL. THE FORESTER". Now it is clear who "chewed through" the antenna. And clear who added "HE IS NOT THE FORESTER ANYMORE" at the bottom — someone who tried to warn us.' },
    m5_sniper: { kicker: 'In the Crosshairs', title: 'The Glint', text: 'Something flashed briefly on the tower — like a reflected sunbeam. Only there is no sun. A bullet chipped the asphalt right at our feet and ricocheted into the river. Up top someone lazily worked a rifle bolt. They are in no hurry: from the tower the whole road is visible, and the only cover is the sandbags by the booth. A hundred paces to the bridge. A hundred paces under the gun.' },
    m5_forester: { kicker: 'He Woke Up', title: 'The Forester', text: 'The hut door flew open from a kick. On the threshold — a huge old man in a bearskin: the beast\'s head for a hood, claws sewn onto his mittens. In his hand a splitting axe, dark all the way to the handle. He does not shout or threaten — he draws in the air, just like that bear in the pine woods. "I can smell you, city folk," he says almost tenderly. "The forest tells me everything." And he walks straight at us — silently, as if there were moss underfoot instead of wood chips.' },
    m5_key: { kicker: 'A Find', title: 'The Tolls', text: 'The key hung on the Forester\'s belt, on the same cord as the "tolls": watches, rings, baptismal crosses, a child\'s bead bracelet. Above the table — a map of the highway with the ranger station, the gas station and the bridge circled in red: our whole road, step by step. We were led here all the way from the forest. The barrier can be raised now. All that is left is to reach it alive.' },
    m5_saw: { kicker: 'The Sawmill', title: 'The Roar', text: 'The panel clicked, and the old saw roared like a wounded beast. The blade screamed, chips flew — and not only chips. The roar rolled over the whole area: now everyone with ears knows about us. But those who stood by the saw have nothing left to hear with.' },
    m5_forester_dead: { kicker: 'End of the Road', title: 'The Skin', text: 'The Forester fell slowly, clutching at the skin as if the beast on him were still alive. The bear\'s head slipped off, and under it was an ordinary old man with a gray beard and tired eyes. A photo fell out of his breast pocket: himself, young, in a forest guard uniform, and a girl with bows holding a drawing — "MISHKA COMES AT NIGHT". The axe stayed lying in a puddle. He does not need it anymore. It will come in handy for us.' },
    m6_start: { kicker: 'Mission 6', title: 'The Churchyard', text: 'The bridge was behind us, and the river cut off the city like a knife. The road dives into pine woods: so quiet you can hear drops falling from the branches. Not a single dead one — as if the forest will not let them in. And ahead, above the treetops, stands a light. Even, white, lifeless. A huge cross above the old cemetery burns without wires or fire, and the closer you get, the clearer it becomes: the silence in the forest is no gift. Everyone who died here went there, to the light.' },
    m6_frenzy: { kicker: 'Frenzy', title: 'By the Cross', text: 'In the light of the Cross the dead move differently. They do not shuffle — they lunge forward, as if someone were hurrying them. A blow, another blow, a step — and another blow before you can raise your hands. The light falls on them evenly, as on an icon, and in it they know no fatigue. Once they leave the circle they are just the dead again: slow, dull, hungry. The main thing is not to stand in that light.' },
    m6_brutes: { kicker: 'Ambush', title: 'The Gravediggers', text: 'The earth between the grave fences stirred, and from behind a crypt they rose — huge, in torn overalls, with shovels grown into their palms. Gravediggers, morgue orderlies, who can tell now. Behind them, on long arms, the Grabbers glide: once they grip you, you will not break free. They have waited here a long time. They knew the living would come for the light.' },
    m6_radio: { kicker: 'The Lodge', title: 'The Radio', text: 'The lodge smells of wax and damp earth. On the table — a visitors\' log, the last entry a week old: "The light does not go out. They come to it. I do not go outside." The radio lies under the log, heavy, army-issue, with a cracked speaker. The watchman is nowhere. Only the cellar door is locked from the inside — and cold seeps out from under it.' },
    m7_start: { kicker: 'Mission 7', title: 'Kiss the Bride', text: 'The white ribbons on the fence have turned black from the rain. On the asphalt by the entrance — scattered rice and a shoe with a broken heel. Behind the banquet hall window the guests slowly circle: some in jackets, some already without faces. There is no music. But they dance anyway. In the middle of the hall she stands — in a veil, with a wreath of fake daisies. The dress on her shoulder is dark and stiff. She turns her head to the window, to us, and smiles quietly, almost tenderly.' },
    m7_scream: { kicker: 'The Wail', title: 'Kiss! Kiss!', text: 'The scream starts low, like a hum in the pipes, and climbs higher and higher until it becomes a saw screeching on glass. It rings in your teeth, your temples, your bones. Your hands will not obey, the cards slip from your fingers. And somewhere beyond the houses, far, far away, someone answers her — first one voice, then a dozen.' },
    m7_prisoner: { kicker: 'By the Campfire', title: 'The Prisoner', text: 'It is not a sack by the campfire. It is a man — hands twisted with wire behind a post, face caked in dried blood. He raises his head and looks straight at us, through the smoke. His lips move without a sound: "Hurry." Two empty holsters lie on a crate nearby. One of the Wolves checks his watch and says something to the others. They laugh.' },
    m7_rescue: { kicker: 'Free', title: 'Gleb', text: 'The wire snaps, and he falls into our arms — light as a teenager. Right away, without getting up, he gropes through the crate: two pistols, both into holsters, crossed. "Gleb. I led the convoy. As far as the bridge. After that — them." He nods at the balaclavas. "I shoot with both hands. It looks good. The rest — later." In his eyes — nothing but a count of rounds.' },
    m7_executed: { kicker: 'Too Late', title: 'A Shot by the Fire', text: 'One dry pop — and the man at the post went limp, hanging on the wire. The leader of the Wolves puts his pistol away, spits into the fire and looks our way. He knew we were here. He wanted us to see.' },
    m7_bride_dead: { kicker: 'Silence', title: 'The Veil', text: 'She falls slowly, as in slow motion, and the veil settles on the asphalt as a white patch. The wreath rolls to the curb. For the first time in many nights the suburb is quiet — so quiet you can hear dripping from the roof. One of us picks up the shoe with the broken heel and sets it on the restaurant steps. Straight, toe toward the door.' },
    m8_start: { kicker: 'Mission 8', title: 'High Noon', text: 'The sun stands right above the market, and the shadows hide under the counters. The striped awnings have faded to white, flies drone over the rows — there are more of them here than air. In the middle of the square someone in a market woman\'s apron is still calling out to buyers: wheezing, wheezing without words, and the dead turn their heads toward that wheeze. And from deep in the market, from the meat row, comes a steady "thock… thock…" — as if someone were chopping carcasses. For a week straight. No lunch break.' },
    m8_butcher: { kicker: 'The Meat Row', title: 'The Butcher', text: 'He comes out from under the awning, stooping — otherwise he would not fit. An apron down to his knees, black and stiff as roofing felt. A cleaver in one hand, in the other — a chain with a hook, and the hook drags along the concrete, striking sparks. The dead around him do not shy away: to him they are his own, furniture. He raises his head and draws in the air. He smells the living. And he goes where there are more of them.' },
    m8_blood: { kicker: 'Fresh Meat', title: 'Blood', text: 'Someone fell next to him — and the Butcher seemed to take a breath. His wounds close up, his apron gleams fresh, and the next time the cleaver comes down harder. Every death near him goes onto his counter. But a strong blow knocks the blood back out: hit rarely, but hit hard.' },
    m8_wolves: { kicker: 'Reinforcements', title: 'The Wolves', text: 'The noise at the market was heard on the road. Out of a cloud of dust rolls a pickup with a skull painted on the hood; men in balaclavas jump from the bed while it is still moving. They do not shout or shoot blindly — they fan out into a line, like on a hunt. The Wolves are coming toward the sound.' },
    m8_butcher_dead: { kicker: 'Silence', title: 'The Counter', text: 'The Butcher falls face-first onto his own counter, and the boards give way under him. The chain clinks one last time and goes still. The cleaver stays stuck in the chopping block — straight, as if left there until tomorrow. The flies settle at once. The hook is still warm; one of us winds the chain around a hand — it will come in handy.' },
    retreat: { kicker: 'Retreat', title: 'Fall Back', text: 'Someone was the first to shout "Fall back!" — and nobody argued. A road flare hissed on the asphalt, flooding the street with red, and from the smoke behind it more and more silhouettes rose. We ran without looking back, dragging the one who limped, dropping everything that slowed us down. The shelter door slammed, the bolt slid into place, and fingers scraped at the iron for a long time after. The task stayed out there, in the street. But we are here. And tomorrow we will go back for it.' },
    epilogue: { kicker: 'Epilogue', title: 'Dawn', text: 'Dawn came after all. Pale as a washed-out sheet, it rose over the suburb, and in its light you could see how many roads we had traveled and how many we had left behind on them. The van coughs, the tank is nearly empty, all of us have new scars — outside and in. But we are alive. And somewhere ahead, around the next bend, the convoy\'s campfire may still be burning.' },
  };

  // --- Bandits (mission 4 and later): a third side ---
  // To a bandit, heroes and zombies are both enemies (equally); zombies hunt bandits too. They wound but do not infect.
  ZG.Zombies.add({
    id: 'bandit', name: 'Bandit', hp: 3, dmg: 1, foeDmg: 2, speed: 1, xp: 2, armor: 0, threat: 4, faction: 'bandit', human: true,
    text: 'A third side: both heroes and zombies are his enemies. Shoots 2 zones away (Noise; to a hero — only a Wound, to a zombie — 2 damage). Steals loot into his bag; killed — drops the bag, devoured — rises as a Shambler.',
    art: 'z_bandit',
    onDeath(g, z, E, kind) { E.banditDeath(g, z, kind); },
  });

  // --- Mission 7 "White Swan": the Bitten Bride and the Wolves Cutthroats ---
  ZG.Zombies.addAll([
    {
      id: 'bride', name: 'Bitten Bride', hp: 9, dmg: 2, speed: 1, xp: 10, armor: 0, threat: 12, big: true, boss: true,
      text: 'Boss. 9 ♥, hits for 2. One ability per phase: if a hero is in her zone — she strikes (2 damage); otherwise, if hunting and seeing heroes in adjacent zones, she screams: a "Bride\'s Wail" (a useless card) is shuffled into each of their decks, and the scream is heard 2 zones away.',
      art: 'z_bride',
      hooks: {
        zombiePhase(g, z, E) {
          if (z.attackedPhase === g.zphase || (g.stealth && !z.awake)) return; // already struck this phase or not hunting
          if (E.heroesAt(g, z.pos).length) return;
          const near = g.heroes.filter((h) => h.onBoard && !h.hidden && g.board.adj[z.pos].includes(h.pos) && (!g.stealth || E.sees(g, z, h)));
          if (!near.length) return;
          near.forEach((h) => E.shuffleIn(g, h, 'bride_wail'));
          E.log(g, `The bride screams! ${near.map((h) => E.heroName(h)).join(', ')}: "Bride's Wail" into the deck.`, 'bad');
          E.fx(g, { t: 'scream', pos: z.pos, zombie: z.uid });
          E.hear(g, z.pos, 2);
          E.storyEvent(g, 'bossScream');
        },
      },
    },
    {
      id: 'raider', name: 'Cutthroat', hp: 3, dmg: 1, foeDmg: 2, speed: 1, xp: 3, armor: 1, threat: 6, faction: 'bandit', human: true,
      hunter: true, patrol: true, range: 1,
      text: 'The Wolves gang. Armor 1. Wanders like a zombie (die: 1–2 — toward his camp, 3–4 — toward the center, 5–6 — stays) and, like a zombie, starts hunting when he sees or hears an enemy. Sawn-off: hits in his own or an adjacent zone — a Wound to a hero (no Infection), 2 damage to a zombie. Killed — drops his bag; devoured — rises as a Shambler.',
      art: 'z_raider',
      onDeath(g, z, E, kind) { E.banditDeath(g, z, kind); },
    },
  ]);
  // finds of mission 7 (only in its loot deck): rare — 2 cards, unique — 1
  ZG.Cards.addAll([
    {
      id: 'hunt_double', name: 'Double-Barrel Hunting Rifle', suit: 'rage', cost: 2, shield: 0, noise: 2, type: 'Weapon', tags: ['ranged', 'gun'],
      loot: true, rarity: 'rare', value: 12,
      text: 'Ranged, range 0–1. 3 damage to the target and 1 damage to one more enemy in its zone. Noise 2.', chainText: '+1 damage to the target.', art: 'shotgun',
      target: { kind: 'zombie', range: 1, ranged: true },
      play(c) {
        const z = c.zombie(c.target); const zone = z && z.pos;
        c.shot(2); c.rangedHit(c.target, 3 + (c.chain ? 1 : 0));
        if (zone != null) c.zoneDamage(zone, 1, { kind: 'ranged', exclude: c.target, max: 1 });
      },
    },
    {
      id: 'silver_knife', name: 'Silver Knife', suit: 'agility', cost: 1, shield: 1, type: 'Weapon', tags: ['melee'],
      loot: true, rarity: 'unique', value: 13,
      text: 'Unique. Melee: 2 damage, against a large target (boss, Bloater, Brute) — 4. Silent.', chainText: 'draw 1 card.', art: 'knife',
      target: { kind: 'zombie', range: 0 },
      play(c) { const z = c.zombie(c.target); const big = z && ZG.Zombies.get(z.type).big; c.melee(c.target, big ? 4 : 2); if (c.chain) c.draw(1); },
    },
  ]);
  // --- Mission 8 "High Noon": the Butcher of the farmers market ---
  ZG.Zombies.addAll([
    {
      id: 'butcher', name: 'The Butcher', hp: 12, dmg: 2, speed: 1, xp: 12, armor: 1, threat: 14, big: true, boss: true,
      swing: true, blood: true, crowd: true, trophy: 'butcher_hook',
      text: 'Boss. 12 ♥, armor 1. "Hook Swing": hits everyone in his zone — heroes, bandits and his own zombies — for 2 + "Blood". Chain: after attacking he pulls the most wounded living one from an adjacent zone into his zone. "Fresh Meat": any death in his zone or an adjacent one (except those he cut down himself with the "Swing") — +2 ♥ and a "Blood" token (+1 to the "Swing", no limit); a hit of 3+ damage knocks a token off. He only goes toward the living — where there are the most of them.',
      art: 'z_butcher',
      hooks: {
        zombiePhase(g, z, E) {
          if (g.stealth && !z.awake) return;
          // chain with a hook: pulls the most wounded hero (otherwise — a bandit) from adjacent zones into his zone
          const adj = g.board.adj[z.pos];
          const hs = g.heroes.filter((h) => h.onBoard && !h.hidden && adj.includes(h.pos)).sort((a, b) => E.hurtCount(g, b) - E.hurtCount(g, a));
          const bs = g.zombies.filter((o) => E.isBandit(o) && adj.includes(o.pos) && !ZG.Zombies.get(o.type).static && !o.post);
          if (hs.length) { const h = hs[0], from = h.pos; h.pos = z.pos; E.log(g, `The Butcher's chain lashes around ${E.heroAcc(h)} and drags them to him!`, 'bad'); E.fx(g, { t: 'hmove', hero: h.idx, from, to: z.pos }); E.fx(g, { t: 'chain', pos: z.pos, from }); }
          else if (bs.length) { const o = bs[0], from = o.pos; o.pos = z.pos; E.log(g, "The Butcher's chain drags a bandit in.", 'dim'); E.fx(g, { t: 'zmove', zombie: o.uid, from, to: z.pos }); E.fx(g, { t: 'chain', pos: z.pos, from }); }
        },
      },
    },
  ]);
  ZG.Cards.addAll([
    {
      id: 'butcher_hook', name: "Butcher's Hook", suit: 'rage', cost: 2, shield: 1, type: 'Weapon · trophy', tags: ['melee'],
      loot: true, rarity: 'unique', value: 14,
      text: 'Unique. Pull an enemy from an adjacent zone into yours and deal 3 damage to it (or 3 damage to an enemy in your zone).', chainText: '+1 damage.', art: 'butcher_hook',
      target: { kind: 'zombie', range: 1 },
      play(c) { const z = c.zombie(c.target); if (z && z.pos !== c.hero.pos && !ZG.Zombies.get(z.type).static && !ZG.Zombies.get(z.type).immobile) { const from = z.pos; z.pos = c.hero.pos; c.E.fx(c.g, { t: 'zmove', zombie: z.uid, from, to: z.pos }); } c.melee(c.target, 3 + (c.chain ? 1 : 0)); },
    },
  ]);
  // Wares of the wandering peddler (before mission 7): unique gear not found anywhere else.
  // Bought for tickets in the shelter, any number of copies; cannot be sold.
  const WARES = { type: 'Gear', tags: ['equip'], loot: true, rarity: 'unique', campaignOnly: true, trader: true, equip: true, cost: 1 };
  ZG.Cards.addAll([
    Object.assign({}, WARES, {
      id: 'tr_gasmask', name: 'GP-5 Gas Mask', suit: 'mind', shield: 1, value: 12, art: 'gasmask',
      text: 'Gear. Infection die −1.', chainText: 'remove 1 Infection or Wound.',
      target: null, mods: { infectDie: -1 },
      play(c) { c.equip(); if (c.chain) c.heal(c.hero.idx, 1, true); },
    }),
    Object.assign({}, WARES, {
      id: 'tr_binoculars', name: 'Field Binoculars', suit: 'agility', shield: 1, value: 12, art: 'binoculars',
      text: 'Gear. Ranged attacks +1 range.', chainText: 'draw 1 card.',
      target: null, mods: { rangeBonus: 1 },
      play(c) { c.equip(); if (c.chain) c.draw(1); },
    }),
    Object.assign({}, WARES, {
      id: 'tr_medbag', name: "Medic's Bag", suit: 'mind', shield: 1, value: 12, art: 'medbag',
      text: 'Gear. Your healing removes 1 more Wound.', chainText: 'remove 1 Wound from yourself.',
      target: null, mods: { healBonus: 1 },
      play(c) { c.equip(); if (c.chain) c.heal(c.hero.idx, 1); },
    }),
  ]);
  ZG.Cards.addAll([
    {
      id: 'bride_wail', name: "Bride's Wail", suit: 'none', cost: null, shield: 0, kind: 'junk', type: 'Hindrance',
      text: 'Cannot be played or discarded to block. The scream is still ringing in your ears — it just takes up a slot in your hand until the end of the mission.',
      art: 'despair', unplayable: true, value: -6,
    },
  ]);

  // --- Bridge (mission 5): the Forester's gang — snipers and the Forester himself ---
  ZG.Zombies.addAll([
    {
      id: 'sniper', name: 'Sniper', hp: 2, dmg: 2, speed: 0, xp: 3, armor: 0, threat: 6, faction: 'bandit', human: true,
      static: true, watch: true, pierce: true, range: 5, sight: 5,
      text: 'Does not move, always alert. Shoots 5 zones away: 2 Wounds that cannot be blocked (sandbags save you). Notices a silent hero only up close. Cannot be shifted by cards ("War Cry", "Rebar").',
      art: 'z_sniper',
      onDeath(g, z, E, kind) { E.banditDeath(g, z, kind); },
    },
    {
      id: 'guard', name: 'Sentry', hp: 3, dmg: 1, speed: 0, xp: 2, armor: 0, threat: 4, faction: 'bandit', human: true,
      static: true,
      text: 'A bandit on post: never leaves his spot and cannot be shifted by cards ("War Cry", "Rebar"). Dozes until he sees a hero or hears noise; once awake — hits an enemy in his zone or shoots 2 zones away (Noise; to a hero — only a Wound). Killed — drops his bag.',
      art: 'z_guard',
      onDeath(g, z, E, kind) { E.banditDeath(g, z, kind); },
    },
    {
      id: 'forester', name: 'The Forester', hp: 8, dmg: 4, speed: 2, xp: 8, armor: 1, threat: 10, faction: 'bandit', human: true,
      big: true, boss: true, hunter: true, tracker: true, range: 0, quietAttack: true, verb: 'hacks with his axe at', trophy: 'forester_axe',
      text: 'The gang leader. Armor 1, axe for 4 (Wounds only), 2 steps per phase. While asleep — lurking like any other. "Hunter\'s Instinct": once awake he sees heroes affected by stealth effects (Silent, "Silent Step", "Lie Low"). Killed — drops the key; the killer gets "Forester\'s Axe".',
      art: 'z_forester',
      onDeath(g, z, E, kind) { E.banditDeath(g, z, kind); }, // drops the barrier key
    },
  ]);
  ZG.Cards.addAll([
    {
      id: 'forester_axe', name: "Forester's Axe", suit: 'rage', cost: 2, shield: 1, type: 'Weapon · trophy', tags: ['melee'],
      loot: true, rarity: 'unique', value: 14,
      text: 'Melee: 4 damage to the target.', chainText: '2 damage to another enemy in the zone.', art: 'forester_axe',
      target: { kind: 'zombie', range: 0 },
      play(c) {
        const z = c.zombie(c.target);
        const zone = z && z.pos;
        c.melee(c.target, 4);
        if (c.chain && zone != null) c.zoneDamage(zone, 2, { kind: 'melee', exclude: c.target, max: 1 });
      },
    },
    {
      id: 'cargo_key', name: 'Barrier Key', suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'key',
      type: 'Cargo', text: 'Cargo. Takes up a slot in your hand. Cannot be played or discarded.\nWhile the squad has the key, the bridge barrier is open.',
      art: 'cargo_key', unplayable: true, value: 0,
    },
  ]);

  // A surprise of the "Highway" mission: 2 rare pieces of gear exist only in its loot deck (not described in the rules)
  ZG.Cards.addAll([
    {
      id: 'rig', name: 'Load-Bearing Vest', suit: 'mind', cost: 1, shield: 1, type: 'Gear', tags: ['equip'], loot: true, rarity: 'rare', equip: true,
      text: 'Gear. +1 hand size. Your first Search each turn costs 0 ⚡.', art: 'rig', value: 11,
      target: null,
      mods: { handSize: 1, freeFirstSearch: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'bandit_tt', name: "Bandit's Pistol", suit: 'mind', cost: 1, shield: 1, type: 'Gear', tags: ['equip', 'gun'], loot: true, rarity: 'rare', equip: true,
      text: 'Gear. A zeroed-in TT pistol in a holster. While equipped — the basic action "TT Shot" (once per turn): 1 ⚡, 2 damage to an enemy 0–2 zones away, Noise 1.', art: 'bandit_tt', value: 11,
      target: null,
      mods: { ttShot: 1 },
      play(c) { c.equip(); },
    },
    // the "TT Shot" action itself (not a deck card: played as a basic action of the equipped "Bandit's Pistol")
    {
      id: 'tt_shot', name: 'TT Shot', suit: 'none', cost: 1, shield: 0, noise: 1, type: 'Action', tags: ['ranged', 'gun'], internal: true,
      text: 'Ranged, range 0–2. 2 damage. Noise 1.', art: 'bandit_tt', value: 0,
      target: { kind: 'zombie', range: 2, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 2); },
    },
  ]);

  // --- Forest (mission 3) ---
  // Mini-boss: optional; killing it gives XP and a unique trophy straight to the killer's hand
  ZG.Zombies.add({
    id: 'bear', name: 'Rogue Bear', hp: 8, dmg: 3, speed: 1, xp: 6, armor: 1, threat: 9, big: true, boss: true, trophy: 'bear_fat',
    text: 'Forest mini-boss. Large target (damage persists), armor 1, hits for 3. Lurks in its den. Whoever kills it gets "Bear Fat".', art: 'z_bear',
  });
  ZG.Cards.addAll([
    {
      id: 'bear_fat', name: 'Bear Fat', suit: 'none', cost: 1, shield: 0, type: 'Consumable · trophy', tags: ['heal'],
      loot: true, rarity: 'unique', consumable: true, value: 13,
      text: 'Unique. Remove 2 Wounds and gain 2 Block. Removed from play.', art: 'bearfat',
      target: null,
      play(c) { c.heal(c.hero.idx, 2); c.block(2); },
    },
    {
      // Valuable: only from safes. Cargo — takes up your hand; jingles; after the mission it sells for an unknown price
      id: 'valuable', name: 'Valuable', suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'valuable', valuable: true, campaignOnly: true,
      type: 'Valuable', text: 'Takes up a slot in your hand, cannot be played or discarded. Jingles: while it is in your hand, your noisy actions get Noise +1 (does not stack). After the mission it goes to junk and is handed to the fence when you leave (or sell it earlier) — the price is unknown, from 2 to 8 🎫.',
      art: 'valuable', unplayable: true, value: 0,
    },
    {
      id: 'cargo_lodge_radio', name: "Watchman's Radio", suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'lodge_radio',
      type: 'Cargo', text: 'Cargo. Takes up a slot in your hand. Cannot be played or discarded.\nCarry it out of the churchyard.',
      art: 'cargo_radio', unplayable: true, value: 0,
    },
    {
      id: 'cargo_battery', name: 'Battery', suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'battery',
      type: 'Cargo', text: 'Cargo. Takes up a slot in your hand. Cannot be played or discarded.\nCarry it to the fire tower.',
      art: 'battery', unplayable: true, value: 0,
    },
  ]);
  // Forest spawn card (from the well at the ranger station): quiet at Dusk; from Night — one at a time, Shambler and Runner alternating
  ZG.SpawnCards.add({
    id: 'sp_forest', rows: [[], ['walker'], ['walker']],
    rowFn(g, E) {
      if (E.phase(g) === 0) return [];
      g.forestSpawn = (g.forestSpawn || 0) + 1;
      return [g.forestSpawn % 2 ? 'walker' : 'runner'];
    },
  });
  // Highway (mission 4): the manholes are silent at Dusk, from Night 2 Shamblers out of each
  // "White Swan": wedding guests crawl out of the manholes — runners from the very start, bloaters at night
  ZG.SpawnCards.add({ id: 'sp_wedding', rows: [[], ['runner', 'walker'], ['fatso', 'runner']] });
  // "Churchyard": quiet from the manholes at Dusk, at Night — a Shambler and a Runner, in the Dead of Night — 2 Shamblers and a Runner
  ZG.SpawnCards.add({ id: 'sp_pogost', rows: [[], ['walker', 'runner'], ['walker', 'walker', 'runner']] });
  ZG.SpawnCards.add({ id: 'sp_chaos', rows: [[], ['walker', 'walker'], ['walker', 'walker']] });

  // Temporary morale cards: shuffled into the deck for the next mission only
  ZG.Cards.addAll([
    {
      id: 'despair', name: 'Despair', suit: 'none', cost: null, shield: 0, kind: 'temp',
      type: 'Morale', text: 'Cannot be played. When it comes into your hand — −1 ⚡.\nGoes to the discard at the end of the turn.',
      art: 'despair', unplayable: true, drainOnDraw: true, discardEndTurn: true, value: -6,
    },
    {
      id: 'courage', name: 'Courage', suit: 'none', cost: 0, shield: 0, kind: 'temp', consumable: true,
      type: 'Morale', text: 'Draw 2 cards, +1 ⚡. All your attacks this turn deal +1 damage.\nRemoved from play after being played.',
      art: 'courage', value: 12,
      target: null,
      play(c) { c.draw(2); c.energy(1); if (c.g.turn) c.g.turn.courage = true; },
    },
  ]);
})(typeof globalThis !== "undefined" ? globalThis : window);

// ============================================================ shelter events
// Deck: 8 events, 1 card each + 8 blanks ("Quiet Night"). After each successful mission one card is drawn.
// The named hero decides: under the AI — the bot decides, under a player — the player.
// need(c) — whether it can be played (otherwise the card goes away with no effect); setup(c) — participants; options(c, e) — choices;
// ai(c, e) — the bot's choice; apply(c, e, key) — consequences, returns the outcome text. Helpers — ZG.Campaign (C).
(function (G) {
  const ZG = G.ZG;
  const C = () => ZG.Campaign;
  const name = (id) => ZG.Heroes.get(id).name;
  const R = () => ZG.CAMPAIGN.prices;
  const reserve = (h) => (C().reserveAI ? C().reserveAI(h, 2) : R().ration + Math.min(h.injury, 2) * R().heal); // AI reserve: a ration and a couple of heals (adjusted for personality)
  const pers = (id) => (ZG.Persona ? ZG.Persona.get(id) : { spend: 'normal' }); // the hero's hidden personality
  const richest = (c) => c.roster.slice().sort((a, b) => b.talons - a.talons)[0];
  const rareLoot = () => Object.keys(ZG.Levels.get('outskirts').loot).filter((id) => { const d = ZG.Cards.get(id); return !d.event && d.rarity === 'rare'; });
  ZG.SHELTER_EVENTS = [
    {
      id: 'ration', name: 'A Ration on Credit',
      text: 'The poorest hero asks the richest for 2 🎫 for a ration. Share — no consequences; refuse — relations between them −1. If there is only one hero in the shelter, the card is not played.',
      need: (c) => { const s = c.roster.slice().sort((a, b) => a.talons - b.talons); return s.length >= 2 && s[s.length - 1].talons >= 2 && s[0].talons < s[s.length - 1].talons; },
      setup: (c) => { const s = c.roster.slice().sort((a, b) => a.talons - b.talons); return { decider: s[s.length - 1].id, other: s[0].id }; },
      story: (c, e) => `Pockets are nearly empty: ${name(e.other)} (🎫 ${C().hero(c, e.other).talons}) asks for 2 tickets for a ration. The best-stocked one decides — ${name(e.decider)} (🎫 ${C().hero(c, e.decider).talons}).`,
      options: () => [{ key: 'give', label: 'Give 2 🎫' }, { key: 'no', label: 'Refuse (relations −1)' }],
      ai: (c, e) => { const h = C().hero(c, e.decider), p = pers(h.id); if (p.spend === 'thrifty' && !p.kind && C().rel(c, e.decider, e.other) < 1) return 'no'; return h.talons - 2 >= reserve(h) && C().rel(c, e.decider, e.other) > -3 ? 'give' : 'no'; },
      apply: (c, e, key) => {
        const a = C().hero(c, e.decider), b = C().hero(c, e.other);
        if (key === 'give' && a.talons >= 2) { a.talons -= 2; b.talons += 2; return `${name(e.decider)} gives 2 🎫 — ${name(e.other)} will not go without a ration.`; }
        C().relAdd(c, e.decider, e.other, -1); return `${name(e.decider)} refuses. Relations with ${name(e.other)} −1.`;
      },
    },
    {
      id: 'refugees', name: 'Refugees at the Gate',
      text: 'A woman with two children asks for food. The richest decides: feed them (3 🎫) — +1 morale for everyone; turn them away — −1 morale for the one who decided.',
      need: (c) => c.roster.length >= 1,
      setup: (c) => ({ decider: richest(c).id }),
      story: (c, e) => `At the gate — a woman with two children. The children are silent and stare at your tins. ${name(e.decider)} decides (🎫 ${C().hero(c, e.decider).talons}).`,
      options: (c, e) => [{ key: 'feed', label: 'Feed them (3 🎫)', off: C().hero(c, e.decider).talons < 3 }, { key: 'no', label: 'Turn them away (−1 morale)' }],
      ai: (c, e) => { const h = C().hero(c, e.decider), p = pers(h.id); return h.talons - 3 >= (p.kind ? R().ration : reserve(h)) && (p.kind || p.spend !== 'thrifty') ? 'feed' : 'no'; }, // the compassionate one shares their last
      apply: (c, e, key) => {
        const h = C().hero(c, e.decider);
        if (key === 'feed' && h.talons >= 3) { h.talons -= 3; c.roster.forEach((o) => C().moraleAdd(c, o, 1)); return 'The refugees were fed. For the first time in a long while someone in the shelter smiled: +1 morale for everyone.'; }
        C().moraleAdd(c, h, -1); return `The gate is shut. ${name(e.decider)} cannot sleep for a long time: −1 morale.`;
      },
    },
    {
      id: 'stranger', name: 'The Bitten Stranger',
      text: 'At night a wounded man knocks at the gate. Let him in: 50% — he thanks you with a rare card (into the decider\'s chest), 50% — he turns at night: a random hero −1 Grit, the decider −1 morale. Do not open — nothing.',
      need: (c) => c.roster.length >= 1,
      setup: (c) => ({ decider: ZG.Rng.pick(c, c.roster).id }),
      story: (c, e) => `Deep in the night — a weak knock at the gate. Behind it a man, his sleeve bloody: "It's a nail… just a nail." ${name(e.decider)} decides.`,
      options: () => [{ key: 'open', label: 'Let him in (risky)' }, { key: 'no', label: 'Do not open' }],
      ai: (c, e) => { const p = pers(e.decider); return (p.kind || p.brave) && c.roster.every((h) => C().hp(h) >= 3) ? 'open' : 'no'; }, // only the kind or the brave let him in
      apply: (c, e, key) => {
        if (key !== 'open') return 'The knocking dies down by morning. Nobody goes out to check.';
        const h = C().hero(c, e.decider);
        if (ZG.Rng.next(c) < 0.5) { const id = ZG.Rng.pick(c, rareLoot()); C().putChest(c, h, id); return `The stranger turned out to be honest. Leaving at dawn, he left ${name(e.decider)} "${ZG.Cards.get(id).name}".`; }
        const v = ZG.Rng.pick(c, c.roster); C().injure(c, v, 1); C().moraleAdd(c, h, -1);
        return `Toward morning the stranger got up — no longer human. ${name(v.id)} was hurt in the struggle (−1 Grit), ${name(e.decider)} blames themselves (−1 morale).`;
      },
    },
    {
      id: 'quarrel', name: 'A Quarrel',
      text: 'The two heroes with the worst relations quarrel. One of them decides: give in — relations +1, their morale −1; stand firm — relations −1. Needs 2+ heroes.',
      need: (c) => c.roster.length >= 2,
      setup: (c) => {
        let best = null;
        c.roster.forEach((a, i) => c.roster.slice(i + 1).forEach((b) => { const r = C().rel(c, a.id, b.id); if (!best || r < best.r) best = { r, a: a.id, b: b.id }; }));
        return ZG.Rng.next(c) < 0.5 ? { decider: best.a, other: best.b } : { decider: best.b, other: best.a };
      },
      story: (c, e) => `Over the last tin of stew ${name(e.decider)} and ${name(e.other)} are at each other's throats. One more word and it will come to fists. ${name(e.decider)} decides.`,
      options: () => [{ key: 'yield', label: 'Give in (relations +1, morale −1)' }, { key: 'stand', label: 'Stand firm (relations −1)' }],
      ai: (c, e) => (pers(e.decider).kind || C().hero(c, e.decider).morale >= 4 ? 'yield' : 'stand'),
      apply: (c, e, key) => {
        if (key === 'yield') { C().relAdd(c, e.decider, e.other, 1); C().moraleAdd(c, C().hero(c, e.decider), -1); return `${name(e.decider)} gives in. It stings, but peace is worth more: relations +1, morale −1.`; }
        C().relAdd(c, e.decider, e.other, -1); return `Neither gave in. Relations between ${name(e.decider)} and ${name(e.other)} −1.`;
      },
    },
    {
      id: 'trader', name: 'The Hawker',
      text: 'A trader with a cart offers a rare card for 6 🎫. The richest decides: buy it (the card goes to their chest) or decline.',
      need: (c) => c.roster.length >= 1,
      setup: (c) => ({ decider: richest(c).id, card: ZG.Rng.pick(c, rareLoot()) }),
      story: (c, e) => `A cart rolls up to the gate, squeaking down the whole street. A trader in a gas mask silently shows his wares: "${ZG.Cards.get(e.card).name}". The price is 6 🎫. ${name(e.decider)} decides (🎫 ${C().hero(c, e.decider).talons}).`,
      options: (c, e) => [{ key: 'buy', label: 'Buy (6 🎫)', off: C().hero(c, e.decider).talons < 6 }, { key: 'no', label: 'Decline' }],
      ai: (c, e) => { const h = C().hero(c, e.decider); return pers(h.id).spend !== 'thrifty' && h.talons - 6 >= reserve(h) ? 'buy' : 'no'; },
      apply: (c, e, key) => {
        const h = C().hero(c, e.decider);
        if (key === 'buy' && h.talons >= 6) { h.talons -= 6; C().putChest(c, h, e.card); return `${name(e.decider)} buys "${ZG.Cards.get(e.card).name}".`; }
        return 'The cart squeaks on down the street.';
      },
    },
    {
      id: 'basement', name: 'The Locked Cellar',
      text: 'A locked door was found under the shelter. Break it open: 50% — 2 consumables into the decider\'s chest, 50% — a dead one inside: the decider −1 Grit. Board it up — nothing.',
      need: (c) => c.roster.length >= 1,
      setup: (c) => ({ decider: ZG.Rng.pick(c, c.roster).id }),
      story: (c, e) => `Clearing rubble, ${name(e.decider)} finds an iron door in the floor with a rusty lock. Cold seeps out from under it… and something else.`,
      options: () => [{ key: 'open', label: 'Break it open (risky)' }, { key: 'no', label: 'Board it up' }],
      ai: (c, e) => (C().hp(C().hero(c, e.decider)) >= (pers(e.decider).brave ? 3 : 5) ? 'open' : 'no'),
      apply: (c, e, key) => {
        if (key !== 'open') return 'The door was boarded up. Sometimes at night something scratches down there.';
        const h = C().hero(c, e.decider);
        if (ZG.Rng.next(c) < 0.5) { const a = ZG.Rng.pick(c, C().STASH), b = ZG.Rng.pick(c, C().STASH); C().putChest(c, h, a); C().putChest(c, h, b); return `A pre-war storeroom! ${name(e.decider)} takes "${ZG.Cards.get(a).name}" and "${ZG.Cards.get(b).name}".`; }
        C().injure(c, h, 1); return `Someone was waiting in the dark of the cellar. ${name(e.decider)} fought it off, but got hurt (−1 Grit).`;
      },
    },
    {
      id: 'watch', name: 'Night Watch',
      text: 'Someone has to stay awake all night. The hero with the highest morale decides: volunteer — their morale −1, relations with the others +1; draw lots — a random other hero −1 morale. Needs 2+ heroes.',
      need: (c) => c.roster.length >= 2,
      setup: (c) => ({ decider: c.roster.slice().sort((a, b) => b.morale - a.morale)[0].id }),
      story: (c, e) => `All night something prowls along the walls outside. Someone will have to sit by the window until dawn. ${name(e.decider)} decides.`,
      options: () => [{ key: 'self', label: 'Volunteer' }, { key: 'lots', label: 'Draw lots' }],
      ai: (c, e) => (pers(e.decider).brave || C().hero(c, e.decider).morale >= 5 ? 'self' : 'lots'),
      apply: (c, e, key) => {
        const h = C().hero(c, e.decider);
        if (key === 'self') { C().moraleAdd(c, h, -1); c.roster.forEach((o) => { if (o !== h) C().relAdd(c, h.id, o.id, 1); }); return `${name(e.decider)} keeps watch all night: morale −1, but the others will remember it (relations +1).`; }
        const v = ZG.Rng.pick(c, c.roster.filter((o) => o !== h)); C().moraleAdd(c, v, -1); return `The lot fell to ${name(v.id)}: a sleepless night, morale −1.`;
      },
    },
    {
      id: 'generator', name: 'The Generator Broke',
      text: 'The generator died. The owner of the Workshop decides (if none — the richest): fix it for 4 🎫 (with a Workshop — 2 🎫) — +1 morale for everyone; sit in the dark — −1 morale for everyone.',
      need: (c) => c.roster.length >= 1,
      setup: (c) => ({ decider: (c.roster.find((h) => C().built(h, 'workshop')) || richest(c)).id }),
      cost: (c, e) => (C().built(C().hero(c, e.decider), 'workshop') ? 2 : 4),
      story: (c, e) => `The generator coughed and went quiet. In the dark every rustle behind the wall sounds like footsteps. ${name(e.decider)} decides (🎫 ${C().hero(c, e.decider).talons}).`,
      options(c, e) { const p = this.cost(c, e); return [{ key: 'fix', label: `Fix it (${p} 🎫)`, off: C().hero(c, e.decider).talons < p }, { key: 'no', label: 'Sit in the dark (−1 morale for everyone)' }]; },
      ai(c, e) { const h = C().hero(c, e.decider); return h.talons - this.cost(c, e) >= reserve(h) ? 'fix' : 'no'; },
      apply(c, e, key) {
        const h = C().hero(c, e.decider), p = this.cost(c, e);
        if (key === 'fix' && h.talons >= p) { h.talons -= p; c.roster.forEach((o) => C().moraleAdd(c, o, 1)); return `${name(e.decider)} gets the generator running. Light! +1 morale for everyone.`; }
        c.roster.forEach((o) => C().moraleAdd(c, o, -1)); return 'A night in the dark. Nobody slept: −1 morale for everyone.';
      },
    },
  ];
  ZG.SHELTER_BLANKS = [
    'A quiet night. Not even the dogs are howling.', 'Rain drums on the roof until morning. You sleep surprisingly well.',
    'Someone found a deck of cards. You played until dawn.', 'The night passed calmly. Suspiciously calmly.',
    'Nothing but static on the radio. But someone keeps stubbornly turning the dial.', 'The morning is gray, as always. Nothing happened.',
    'A warehouse burned in the distance. The glow lasted until morning, but nobody came to you.', 'Silence. Even the dead seem tired.',
  ];
})(typeof globalThis !== 'undefined' ? globalThis : window);

// ============================================================ campaign epilogue
// Built from chapters per mission: each completed mission adds a sentence to the text (line) and a line to the summary (fact).
// A new mission in the chain — a new entry in chapters (no — its number); the epilogue code does not need changing.
// c — the campaign (c.flags — memorable events, c.history — [{ no, scenarioId, win, stars }]), m — this mission's history entry.
(function (G) {
  const ZG = G.ZG;
  const name = (id) => ZG.Heroes.get(id).name;
  ZG.EPILOGUE = {
    intro: 'Dawn came after all. Pale as a washed-out sheet, it rose over the suburb, and in its light you could see how many roads we had traveled and how many we had left behind on them.',
    chapters: [
      { no: 1, line: (c, m) => (m && m.stars >= 3 ? 'The ambulance from the first sortie made it — every last one of the wounded.' : 'The ambulance from the first sortie drove off into the night — we never found out whether they all made it.') },
      { no: 2, line: () => 'The van keys still smell of Motor Depot No. 3: engine oil and whatever lay under the lift.' },
      {
        no: 3,
        line: (c) => (c.flags.bear ? 'The rogue bear\'s fat ran out long ago, but the scars from its claws did not.' : 'A bear still roams the pine woods by the ranger station — sometimes it feels like it is following us.'),
        fact: (c) => (c.flags.bear ? 'The rogue bear of the pine woods is dead — its fat saved more than one life.' : 'The rogue bear still roams the pine woods.'),
      },
      { no: 4, line: () => 'The tanker at the gas station has probably burned out by now. The bandits with the bear-paw brand have not.' },
      {
        no: 5,
        line: (c) => (c.flags.bridge === 'quiet' ? 'We crossed the bridge quietly — with the key taken from the sleeping Forester. He woke up when it was already too late.' : 'We took the bridge by force. The Forester\'s axe now hangs in our van.'),
        fact: (c) => (c.flags.bridge === 'quiet' ? 'The bridge was crossed quietly: the Forester woke when you already had the key.' : c.flags.bridge ? 'The bridge was taken by force: the Forester is dead, his axe now serves you.' : null),
      },
      {
        no: 6,
        line: (c) => 'The cross above the churchyard across the river is probably still burning.' + (c.flags.brutes ? ' The gravediggers who guarded its light we laid in their own earth.' : ' We carried the radio out of the lodge and never once looked back.'),
        fact: (c) => (c.flags.brutes ? `Brutes killed at the Shining Cross: ${c.flags.brutes}.` : null),
      },
      {
        no: 7,
        line: (c) => 'A white veil was left on the steps of the White Swan, and for the first time in many nights the suburb fell quiet.' + (c.flags.gleb === 'rescued' ? ' Gleb cleans his pistols in the back seat and hardly speaks — but he watches the road as if he knows it all the way to the end.' : c.flags.gleb === 'executed' ? ' We still hear the shot by the Wolves\' campfire — every time we close our eyes.' : ''),
        fact: (c) => (c.flags.gleb === 'rescued' ? 'The Wolves\' prisoner was rescued: Gleb "Double-Tap" goes with us.' : c.flags.gleb === 'executed' ? 'We were too late to save the prisoner at the Wolves\' campfire.' : null),
      },
      {
        no: 8,
        line: (c) => (c.flags.butcher ? 'The cleaver no longer thuds at the farmers market. The Butcher\'s hook hangs in our van — nobody remembers who hung it there.' : 'They say the cleaver still thuds at the farmers market: thock… thock… — right at noon.'),
        fact: (c) => (c.flags.butcher ? 'The Butcher of the farmers market is dead.' : 'The Butcher still chops carcasses in the meat row.'),
      },
    ],
    outro: (c) => {
      const lost = c.fallen.length;
      return ('The van coughs, the tank is nearly empty, all of us have new scars — outside and in.' + (lost ? ` There are ${['', 'one', 'two', 'three', 'four', 'five'][lost] || lost} fewer of us: ${c.fallen.map(name).join(', ')} — we remember.` : ' And yet we all made it — every last one.')) +
        ' But we are alive. And somewhere ahead, around the next bend, the convoy\'s campfire may still be burning.';
    },
  };
  // epilogue text and summary for campaign c
  ZG.epilogueFor = function (c) {
    const E = ZG.EPILOGUE, f = c.flags = c.flags || {};
    const hist = c.history || [];
    const passed = (no) => (hist.length ? hist.some((m) => m.no === no && m.win) : c.missionNo >= no);
    const parts = [E.intro], facts = [];
    E.chapters.forEach((ch) => {
      if (!passed(ch.no)) return;
      const m = hist.find((x) => x.no === ch.no && x.win) || hist.find((x) => x.no === ch.no); // after a retreat the mission is replayed — take the winning run
      const line = ch.line && ch.line(c, m); if (line) parts.push(line);
      const fact = ch.fact && ch.fact(c, m); if (fact) facts.push(fact);
    });
    parts.push(E.outro(c));
    return { text: parts.join(' '), facts, f };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
