/*
 * Action cards: starter cards, hero signature cards and loot.
 *
 * Card fields:
 *   suit     — suit (rage / agility / mind)
 *   cost     — cost in Energy (⚡)
 *   shield   — shield: how much damage it blocks if discarded during a zombie attack
 *   noise    — noise (raises Alarm), for ranged attacks
 *   target   — what is chosen when played (see engine/targets)
 *   play(ctx)— effect; ctx.chain === true if a Chain triggered
 *   consumable — removed from the game after being played
 *   equip    — gear: after being played it stays in front of the hero and gives mods/hooks
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  const MELEE = { kind: 'zombie', range: 0 };

  // ------------------------------------------------------------ Starter ---
  ZG.Cards.addAll([
    {
      id: 'strike', name: 'Strike', suit: 'rage', cost: 1, shield: 1, type: 'Attack', tags: ['melee'],
      text: 'Melee: 2 damage.', chainText: '+1 damage.', art: 'fist', value: 6,
      target: MELEE,
      play(c) { c.melee(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'dash', name: 'Dash', suit: 'agility', cost: 1, shield: 0, type: 'Movement', tags: ['move'],
      text: 'Move 1–2 zones.', chainText: 'draw 1 card.', art: 'boot', value: 6,
      target: { kind: 'move', steps: 2 },
      play(c) { c.moveTo(c.target); if (c.chain) c.draw(1); },
    },
    {
      id: 'step', name: 'Scurry', suit: 'agility', cost: 0, shield: 0, type: 'Movement', tags: ['move'],
      text: 'Move 1 zone.', chainText: '+1 ⚡.', art: 'step', value: 5,
      target: { kind: 'move', steps: 1 },
      play(c) { c.moveTo(c.target); if (c.chain) c.energy(1); },
    },
    {
      id: 'look', name: 'Look Around', suit: 'mind', cost: 0, shield: 0, type: 'Tactic', tags: ['draw'],
      text: 'Draw 1 card.', chainText: '+1 ⚡.', art: 'eye', value: 4,
      target: null,
      play(c) { c.draw(1); if (c.chain) c.energy(1); },
    },
    {
      id: 'cover', name: 'Take Cover', suit: 'mind', cost: 1, shield: 1, type: 'Defense', tags: ['block'],
      text: 'Gain 1 Block until your next turn.', chainText: '+2 Block.', art: 'shield', value: 6,
      target: null,
      play(c) { c.block(1 + (c.chain ? 2 : 0)); },
    },
  ]);

  // ------------------------------------------------------ Boris "Sledge" ---
  ZG.Cards.addAll([
    {
      id: 'sledge', name: 'Sledgehammer', suit: 'rage', cost: 2, shield: 1, type: 'Attack', tags: ['melee'], hero: 'boris',
      text: 'Melee: 4 damage.', chainText: 'another 2 damage to each other zombie in the zone.', art: 'sledge', value: 12,
      target: MELEE,
      play(c) {
        const zone = c.zombie(c.target) && c.zombie(c.target).pos;
        c.melee(c.target, 4);
        if (c.chain && zone != null) c.zoneDamage(zone, 2, { kind: 'melee', exclude: c.target });
      },
    },
    {
      id: 'ram', name: 'Ram', suit: 'rage', cost: 1, shield: 1, type: 'Attack', tags: ['melee', 'move'], hero: 'boris',
      text: 'Move 1 zone (Grip does not apply), then 1 damage to each zombie in the new zone.', chainText: '2 damage instead of 1.', art: 'ram', value: 10,
      target: { kind: 'move', steps: 1, free: true },
      play(c) { c.moveTo(c.target); c.zoneDamage(c.hero.pos, c.chain ? 2 : 1, { kind: 'melee' }); },
    },
    {
      id: 'stance', name: 'Stand Firm', suit: 'mind', cost: 1, shield: 1, type: 'Defense', tags: ['block'], hero: 'boris',
      text: 'Gain 4 Block until your next turn. Each zombie that attacked you in the zombie phase takes 1 damage.', chainText: '+1 ⚡.', art: 'stance', value: 10,
      target: null,
      play(c) { c.block(4); c.thorns(1); if (c.chain) c.energy(1); },
    },
    {
      id: 'roar', name: 'War Cry', suit: 'rage', cost: 0, shield: 0, noise: 1, type: 'Tactic', tags: ['taunt'], hero: 'boris',
      text: 'Noise 1. Draw 1 card. All zombies within 2 zones of you shift 1 zone toward you.', chainText: '+1 ⚡.', art: 'roar', value: 8,
      target: null,
      play(c) { c.noise(1); c.draw(1); c.pull(2); if (c.chain) c.energy(1); },
    },
  ]);

  // --------------------------------------------------- Marina "Scalpel" ---
  ZG.Cards.addAll([
    {
      id: 'scalpel', name: 'Scalpel', suit: 'agility', cost: 0, shield: 0, type: 'Attack', tags: ['melee'], hero: 'marina',
      text: 'Melee: 2 damage (right in the temple).', chainText: '+1 damage.', art: 'scalpel', value: 9,
      target: MELEE,
      play(c) { c.melee(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'bandage', name: 'Dressing', suit: 'mind', cost: 1, shield: 1, type: 'Healing', tags: ['heal'], hero: 'marina',
      text: 'A hero in your zone (yourself included) removes 2 Wounds.', chainText: 'and gains 1 Block; you gain +1 🎖 XP.', art: 'bandage', value: 10,
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.chainXp(); c.heal(c.target, 2); if (c.chain) c.block(1, c.target); },
    },
    {
      id: 'adrenaline', name: 'Adrenaline', suit: 'agility', cost: 0, shield: 1, type: 'Support', tags: ['support'], hero: 'marina',
      text: 'Another hero within 2 zones gains 2 Adrenaline tokens (+1 ⚡ each on their turn).', chainText: '+1 token.', art: 'syringe', value: 9,
      target: { kind: 'hero', range: 2, self: false },
      play(c) { c.adrenaline(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'coldcalc', name: 'Cold Calculation', suit: 'mind', cost: 1, shield: 1, type: 'Tactic', tags: ['draw'], hero: 'marina',
      text: 'Draw 2 cards.', chainText: '+1 ⚡.', art: 'brain', value: 8,
      target: null,
      play(c) { c.draw(2); if (c.chain) c.energy(1); },
    },
  ]);

  // ---------------------------------------------------------- Lisa "Shadow" ---
  ZG.Cards.addAll([
    // --- Sava ---
    {
      id: 'silent_step', name: 'Silent Step', suit: 'agility', cost: 1, shield: 1, type: 'Movement', tags: ['move'], hero: 'sava',
      text: 'Move 1–2 zones, even through zombies, ignoring Grip. Until the end of this turn wandering zombies do not notice you.', chainText: 'draw 1 card and +1 🎖 XP.', art: 'silentstep', value: 8,
      target: { kind: 'move', steps: 2, through: true, free: true },
      play(c) { c.chainXp(); if (c.g.turn) c.g.turn.quiet = true; c.moveTo(c.target); if (c.chain) c.draw(1); },
    },
    {
      id: 'shiv', name: 'Knife in the Back', suit: 'agility', cost: 1, shield: 0, type: 'Attack', tags: ['melee'], hero: 'sava',
      text: 'A wandering (non-large) one — kill silently. A hunting one — 2 damage.', chainText: '+1 damage to a hunting one.', art: 'knife', value: 9,
      target: MELEE,
      play(c) {
        const z = c.zombie(c.target);
        if (z && c.g.stealth && !z.awake && !ZG.Zombies.get(z.type).big) c.silentKill(c.target);
        else c.melee(c.target, 2 + (c.chain ? 1 : 0));
      },
    },
    {
      id: 'pebble', name: 'Pebble', suit: 'mind', cost: 0, shield: 1, type: 'Tactic', tags: ['lure'], hero: 'sava',
      text: 'Noise in a zone within 2 zones of you (no Alarm). Zombies within 2 zones of it go to check.', chainText: 'heard 1 zone farther.', art: 'pebble', value: 8,
      target: { kind: 'cell', range: 2 },
      play(c) {
        const plus = ZG.Mods.flag(c.g, c.hero, 'pebblePlus');
        c.pebble(c.target, 2 + (c.chain ? 1 : 0) + (plus ? 2 : 0));
        if (plus) { c.draw(1); if (c.g.turn && !c.g.turn.pebbleEnergy) { c.g.turn.pebbleEnergy = true; c.hero.energy += 1; } } // "Master of Distraction"
      },
    },
    {
      id: 'lurk', name: 'Lie Low', suit: 'mind', cost: 1, shield: 2, type: 'Tactic', hero: 'sava',
      text: 'Until your turn you can be seen only from your own zone (except by a raging horde).', chainText: '+1 Block.', art: 'lurk', value: 8,
      target: null,
      play(c) { c.hero.lurk = true; if (c.chain) c.block(1); },
    },
    {
      id: 'knife', name: 'Knife', suit: 'agility', cost: 0, shield: 0, type: 'Attack', tags: ['melee'], hero: 'lisa',
      text: 'Melee: 1 damage.', chainText: '+1 damage and draw 1 card.', art: 'knife', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 1 + (c.chain ? 1 : 0)); if (c.chain) c.draw(1); },
    },
    {
      id: 'lure', name: 'Distract', suit: 'mind', cost: 1, shield: 1, type: 'Tactic', tags: ['lure'], hero: 'lisa',
      text: 'Place a Lure in a zone within 3 zones of you. Until the end of the round zombies treat it as a hero. Alarm +1.', chainText: '+1 ⚡.', art: 'bottle', value: 9,
      target: { kind: 'cell', range: 3 },
      play(c) { c.lure(c.target, 1); if (c.chain) c.energy(1); },
    },
    {
      id: 'rooftops', name: 'Over the Roofs', suit: 'agility', cost: 2, shield: 0, type: 'Movement', tags: ['move'], hero: 'lisa',
      text: 'Move 1–3 zones, even through zones with zombies. Grip does not apply.', chainText: '+1 ⚡ and +1 🎖 XP.', art: 'roof', value: 9,
      target: { kind: 'move', steps: 3, through: true },
      play(c) { c.chainXp(); c.moveTo(c.target); if (c.chain) c.energy(1); },
    },
    {
      id: 'vanish', name: 'Vanish', suit: 'agility', cost: 2, shield: 1, type: 'Defense', tags: ['stealth'], hero: 'lisa',
      text: 'Until your next turn you are Invisible: zombies do not attack or pursue you.', chainText: 'draw 1 card.', art: 'mask', value: 9,
      target: null,
      play(c) { c.status('hidden'); if (c.chain) c.draw(1); },
    },
  ]);

  // ------------------------------------------------------- Viktor "Thunder" ---
  ZG.Cards.addAll([
    {
      id: 'sawnoff', name: 'Sawn-Off', suit: 'rage', cost: 2, shield: 0, noise: 2, type: 'Attack', tags: ['ranged', 'gun'], hero: 'viktor',
      text: 'Ranged, range 0–1. 2 damage to each zombie in the zone. Noise 2.', chainText: '+1 damage to each.', art: 'shotgun', value: 12,
      target: { kind: 'zone', range: 1, ranged: true },
      play(c) { c.shot(2); c.zoneDamage(c.target, 2 + (c.chain ? 1 : 0), { kind: 'ranged' }); },
    },
    {
      id: 'pm', name: 'Service Pistol', suit: 'mind', cost: 1, shield: 0, noise: 1, type: 'Attack', tags: ['ranged', 'gun'], hero: 'viktor',
      text: 'Ranged, range 0–3. 2 damage. Noise 1.', chainText: 'draw 1 card.', art: 'pistol', value: 10,
      target: { kind: 'zombie', range: 3, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 2); if (c.chain) c.draw(1); },
    },
    {
      id: 'suppress', name: 'Suppressing Fire', suit: 'mind', cost: 1, shield: 1, noise: 1, type: 'Tactic', tags: ['ranged', 'gun', 'control'], hero: 'viktor',
      text: 'Range 0–2. Zombies in the chosen zone are Pinned: they do not move this round. Noise 1.', chainText: '1 damage to each of them.', art: 'suppress', value: 9,
      target: { kind: 'zone', range: 2, ranged: true },
      play(c) { c.shot(1); c.suppress(c.target); if (c.chain) c.zoneDamage(c.target, 1, { kind: 'ranged' }); },
    },
    {
      id: 'buttstroke', name: 'Rifle Butt', suit: 'rage', cost: 1, shield: 1, type: 'Attack', tags: ['melee'], hero: 'viktor',
      text: 'Melee: 2 damage. If the target survives it is Pinned: it does not move this round.', chainText: '+1 damage.', art: 'butt', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 2 + (c.chain ? 1 : 0)); const z = c.zombie(c.target); if (z) z.suppressed = true; },
    },
  ]);

  // -------------------------------------------------------- Kira "Wrench" ---
  ZG.Cards.addAll([
    {
      id: 'wrench', name: 'Adjustable Wrench', suit: 'rage', cost: 1, shield: 1, type: 'Attack', tags: ['melee'], hero: 'kira',
      text: 'Melee: 2 damage.', chainText: '+2 damage.', art: 'wrench', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 2 + (c.chain ? 2 : 0)); },
    },
    {
      id: 'tripwire', name: 'Tripwire', suit: 'mind', cost: 1, shield: 0, type: 'Trap', tags: ['trap'], hero: 'kira',
      text: 'Place a Trap in your zone or an adjacent one. When a zombie enters it — 2 damage to each zombie in the zone, Noise 2.', chainText: 'the Trap deals 3.', art: 'trap', value: 10,
      target: { kind: 'adj', self: true },
      play(c) { c.trap(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'improvise', name: 'Ingenuity', suit: 'mind', cost: 0, shield: 1, type: 'Tactic', tags: ['draw'], hero: 'kira',
      text: 'Draw 1 card.', chainText: 'draw 1 more and +1 ⚡.', art: 'gear', value: 7,
      target: null,
      play(c) { c.draw(c.chain ? 2 : 1); if (c.chain) c.energy(1); },
    },
    {
      id: 'weld', name: 'Welding', suit: 'mind', cost: 0, shield: 1, type: 'Fortification', tags: ['barricade'], hero: 'kira',
      text: 'Put a Barricade (durability 4) on a passage out of your zone.', chainText: '+1 ⚡.', art: 'weld', value: 9,
      target: { kind: 'edge' },
      play(c) { c.barricade(c.target, 4); if (c.chain) c.energy(1); },
    },
    // --- Gosha ---
    {
      id: 'jackhammer', name: 'Jackhammer', suit: 'rage', cost: 1, shield: 0, noise: 2, type: 'Attack', tags: ['melee'], hero: 'gosha',
      text: 'Melee: 3 damage to each zombie in your zone. Noise 2.', chainText: '+1 damage to each.', art: 'jackhammer', value: 12,
      target: { kind: 'zone', range: 0 },
      play(c) { c.noise(2); c.zoneDamage(c.target, 3 + (c.chain ? 1 : 0), { kind: 'melee' }); },
    },
    {
      id: 'generator', name: 'Generator', suit: 'mind', cost: 1, shield: 1, type: 'Tactic', tags: ['lure', 'taunt'], hero: 'gosha',
      text: 'You start a generator: a Lure in your zone until the end of the round, Alarm +2. Gain 2 Block.', chainText: 'Alarm only +1.', art: 'generator', value: 9,
      target: null,
      play(c) { c.lure(c.hero.pos, c.chain ? 1 : 2); c.block(2); },
    },
    {
      id: 'cones', name: 'Roadblock', suit: 'agility', cost: 1, shield: 1, type: 'Tactic', hero: 'gosha',
      text: 'All zombies in your zone are pinned until the end of the round (they do not move). Noise 1.', chainText: '+1 Block.', art: 'cones', value: 8,
      target: null,
      play(c) { c.noise(1); c.suppress(c.hero.pos); if (c.chain) c.block(1); },
    },
    {
      id: 'rebar', name: 'Rebar', suit: 'rage', cost: 1, shield: 2, type: 'Attack', tags: ['melee'], hero: 'gosha',
      text: 'Melee: 2 damage.', chainText: 'knock the target into an adjacent zone.', art: 'rebar', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 2); if (c.chain && c.zombie(c.target)) c.push(c.target); },
    },
  ]);

  // ---------------------------------------------------------------- Loot ---
  ZG.Cards.addAll([
    {
      id: 'bat', name: 'Baseball Bat', suit: 'rage', cost: 1, shield: 1, type: 'Weapon', tags: ['melee'], loot: true, rarity: 'rare',
      text: 'Melee: 3 damage.', chainText: '+1 damage.', art: 'bat', value: 10,
      target: MELEE,
      play(c) { c.melee(c.target, 3 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'machete', name: 'Machete', suit: 'rage', cost: 1, shield: 1, type: 'Weapon', tags: ['melee'], loot: true, rarity: 'rare',
      text: 'Melee: 2 damage to the target and 2 damage to one more zombie in the zone.', chainText: '+1 damage to both.', art: 'machete', value: 11,
      target: MELEE,
      play(c) {
        const z = c.zombie(c.target);
        const zone = z && z.pos;
        const n = 2 + (c.chain ? 1 : 0);
        c.melee(c.target, n);
        if (zone != null) c.zoneDamage(zone, n, { kind: 'melee', exclude: c.target, max: 1 });
      },
    },
    {
      id: 'spear', name: 'Homemade Spear', suit: 'agility', cost: 1, shield: 1, type: 'Weapon', tags: ['melee'], loot: true, rarity: 'common',
      text: 'Melee with reach: 2 damage to a zombie in your zone or an adjacent one (in a straight line).', chainText: '+1 damage.', art: 'spear', value: 9,
      target: { kind: 'zombie', range: 1, reach: true },
      play(c) { c.melee(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'crowbar', name: 'Crowbar', suit: 'rage', cost: 1, shield: 2, type: 'Weapon', tags: ['melee'], loot: true, rarity: 'common',
      text: 'Melee: 2 damage.', chainText: 'draw 1 card.', art: 'crowbar', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 2); if (c.chain) c.draw(1); },
    },
    {
      id: 'pistol', name: 'Pistol', suit: 'mind', cost: 1, shield: 0, noise: 1, type: 'Weapon', tags: ['ranged', 'gun'], loot: true, rarity: 'rare',
      text: 'Ranged, range 0–3. 2 damage. Noise 1.', chainText: '+1 damage.', art: 'pistol', value: 10,
      target: { kind: 'zombie', range: 3, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'shotgun', name: 'Shotgun', suit: 'rage', cost: 2, shield: 0, noise: 2, type: 'Weapon', tags: ['ranged', 'gun'], loot: true, rarity: 'unique',
      text: 'Ranged, range 0–1. 2 damage to each zombie in the zone. Noise 2.', chainText: '+1 damage to each.', art: 'shotgun', value: 12,
      target: { kind: 'zone', range: 1, ranged: true },
      play(c) { c.shot(2); c.zoneDamage(c.target, 2 + (c.chain ? 1 : 0), { kind: 'ranged' }); },
    },
    {
      id: 'molotov', name: 'Molotov Cocktail', suit: 'rage', cost: 1, shield: 0, noise: 1, type: 'Consumable', tags: ['ranged', 'fire'], loot: true, rarity: 'rare', consumable: true,
      text: 'Range 1–2. 3 damage to each zombie in the zone (and 1 to each hero there). Noise 1. Removed from play.', chainText: '+1 damage to zombies.', art: 'molotov', value: 12,
      target: { kind: 'zone', range: 2, min: 1, ranged: true },
      play(c) { c.shot(1, true); c.zoneDamage(c.target, 3 + (c.chain ? 1 : 0), { kind: 'fire' }); c.burnHeroes(c.target, 1); },
    },
    {
      id: 'firecracker', name: 'Firecracker', suit: 'mind', cost: 0, shield: 0, type: 'Consumable', tags: ['lure'], loot: true, rarity: 'rare', consumable: true,
      text: 'Place a Lure in a zone within 4 zones of you. Alarm +1. Removed from play.', chainText: '+1 ⚡.', art: 'firecracker', value: 8,
      target: { kind: 'cell', range: 4 },
      play(c) { c.lure(c.target, 1); if (c.chain) c.energy(1); },
    },
    {
      id: 'medkit', name: 'Medkit', suit: 'mind', cost: 1, shield: 0, type: 'Consumable', tags: ['heal'], loot: true, rarity: 'common', consumable: true,
      text: 'A hero in your zone removes 2 Wounds or Infections (Infections first). Removed from play.', chainText: '+1 Wound.', art: 'medkit', value: 11, cures: true,
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 2 + (c.chain ? 1 : 0), true); },
    },
    {
      id: 'energy', name: 'Energy Drink', suit: 'agility', cost: 0, shield: 0, type: 'Consumable', tags: ['energy'], loot: true, rarity: 'common', consumable: true,
      text: '+2 ⚡. Removed from play.', chainText: 'draw 1 card.', art: 'can', value: 7,
      target: null,
      play(c) { c.energy(2); if (c.chain) c.draw(1); },
    },
    {
      id: 'chocolate', name: 'Chocolate Bar', suit: 'agility', cost: 0, shield: 1, type: 'Consumable', tags: ['draw'], loot: true, rarity: 'common', consumable: true,
      text: '+1 ⚡ and draw 1 card. Removed from play.', chainText: '+1 ⚡.', art: 'choco', value: 6,
      target: null,
      play(c) { c.energy(1 + (c.chain ? 1 : 0)); c.draw(1); },
    },
    // --- common "two-path" finds: quiet (Garrote) and forceful (Grenade) ---
    {
      id: 'garrote', name: 'Garrote', suit: 'agility', cost: 1, shield: 1, type: 'Weapon', tags: ['melee', 'stealth'], loot: true, rarity: 'common',
      text: 'A wandering or lurking enemy (non-large) in your zone — kill silently. A hunting one — 1 damage.', chainText: 'draw 1 card.', art: 'garrote', value: 8,
      target: MELEE,
      play(c) {
        const z = c.zombie(c.target);
        if (z && c.g.stealth && !z.awake && !ZG.Zombies.get(z.type).big) c.silentKill(c.target);
        else c.melee(c.target, 1);
        if (c.chain) c.draw(1);
      },
    },
    {
      id: 'grenade', name: 'Pipe Grenade', suit: 'rage', cost: 1, shield: 0, noise: 3, type: 'Consumable', tags: ['ranged'], loot: true, rarity: 'common', consumable: true,
      text: 'Range 1–2. 2 damage to each enemy in the zone. Noise 3. Removed from play.', chainText: '+1 damage.', art: 'grenade', value: 8,
      target: { kind: 'zone', range: 2, min: 1, ranged: true },
      play(c) { c.shot(3, true); c.zoneDamage(c.target, 2 + (c.chain ? 1 : 0), { kind: 'ranged' }); },
    },
    {
      id: 'sneakers', name: 'Sneakers', suit: 'agility', cost: 1, shield: 1, type: 'Gear', tags: ['equip'], loot: true, rarity: 'rare', equip: true,
      text: 'Gear. Your first basic "Move" each turn costs 0 ⚡.', art: 'sneaker', value: 9,
      target: null,
      mods: { freeFirstMove: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'backpack', name: 'Backpack', suit: 'mind', cost: 1, shield: 1, type: 'Gear', tags: ['equip'], loot: true, rarity: 'rare', equip: true,
      text: 'Gear. +1 hand size.', art: 'backpack', value: 9,
      target: null,
      mods: { handSize: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'vest', name: 'Body Armor', suit: 'mind', cost: 1, shield: 2, type: 'Gear', tags: ['equip'], loot: true, rarity: 'rare', equip: true,
      text: 'Gear. Automatically blocks 1 damage each zombie phase.', art: 'vest', value: 10,
      target: null,
      mods: { autoBlock: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'flashlight', name: 'Flashlight', suit: 'mind', cost: 1, shield: 1, type: 'Gear', tags: ['equip'], loot: true, rarity: 'rare', equip: true,
      text: 'Gear. Search: draw 1 more loot card.', art: 'flashlight', value: 8,
      target: null,
      mods: { searchDraw: 1 },
      play(c) { c.equip(); },
    },
    // --- newer finds (rarity: common ×4, rare ×2, unique ×1) ---
    {
      id: 'katana', name: 'Katana', suit: 'rage', cost: 1, shield: 1, type: 'Gear', tags: ['equip'], loot: true, rarity: 'unique', equip: true,
      text: 'Gear. Your melee attacks deal +1 damage.', chainText: 'when equipped, 2 damage at once to a zombie in your zone.', art: 'katana', value: 12,
      target: null,
      mods: { meleeBonus: (g, h, ctx) => (ctx && ctx.kind === 'melee' ? 1 : 0) },
      play(c) { c.equip(); if (c.chain) c.zoneDamage(c.hero.pos, 2, { kind: 'melee', max: 1 }); },
    },
    {
      id: 'army_medkit', name: 'Army Medkit', suit: 'mind', cost: 1, shield: 0, type: 'Consumable', tags: ['heal'], loot: true, rarity: 'unique', consumable: true, cures: true,
      text: 'A hero in your zone removes 3 Wounds or Infections (Infections first) and gains 1 Block. Removed from play.', chainText: 'the next turn (another hero\'s, or yours when solo) gets +1 ⚡.', art: 'medkit', value: 13,
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 3, true); c.block(1, c.target); if (c.chain) c.relayEnergy(1); },
    },
    {
      id: 'smoke', name: 'Smoke Grenade', suit: 'mind', cost: 1, shield: 1, type: 'Consumable', tags: ['stealth'], loot: true, rarity: 'rare', consumable: true,
      text: 'Zombies in your zone lose the trail and wander (without stealth — pinned). No Grip here until the end of the turn. Removed from play.', chainText: 'heroes in the zone lie low until their turn.', art: 'smoke', value: 10,
      target: null,
      play(c) { c.smoke(c.hero.pos); if (c.chain) c.E.heroesAt(c.g, c.hero.pos).forEach((o) => { o.lurk = true; }); },
    },
    {
      id: 'nailgun', name: 'Nail Gun', suit: 'agility', cost: 1, shield: 0, type: 'Weapon', tags: ['ranged'], loot: true, rarity: 'rare',
      text: 'Ranged, range 0–2. 2 damage. Silent.', chainText: 'the target is pinned until the end of the round.', art: 'nailgun', value: 10,
      target: { kind: 'zombie', range: 2, ranged: true },
      play(c) { c.rangedHit(c.target, 2); if (c.chain) c.pin(c.target); },
    },
    {
      id: 'rope', name: 'Rope', suit: 'agility', cost: 1, shield: 1, type: 'Movement', tags: ['move'], loot: true, rarity: 'rare',
      text: 'Move 1–2 zones over barricades and through zombies, ignoring Grip.', chainText: 'pull a hero from your zone along with you.', art: 'rope', value: 9,
      target: { kind: 'move', steps: 2, through: true, free: true, climb: true },
      play(c) { const from = c.hero.pos; c.moveTo(c.target); if (c.chain) c.carry(from, c.target); },
    },
    {
      id: 'brick', name: 'Brick', suit: 'rage', cost: 0, shield: 1, type: 'Weapon', tags: ['ranged'], loot: true, rarity: 'common',
      text: 'Throw, range 0–1: 1 damage. Silent.', chainText: '+1 damage.', art: 'brick', value: 6,
      target: { kind: 'zombie', range: 1, ranged: true },
      play(c) { c.rangedHit(c.target, 1 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'bandage_roll', name: 'Bandage', suit: 'mind', cost: 0, shield: 1, type: 'Consumable', tags: ['heal'], loot: true, rarity: 'common', consumable: true,
      text: 'A hero in your zone removes 1 Wound. Removed from play.', chainText: 'or 1 Infection instead of a Wound.', art: 'bandage', value: 6,
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 1, !!c.chain); },
    },
    {
      id: 'whistle', name: 'Whistle', suit: 'mind', cost: 0, shield: 1, type: 'Tactic', tags: ['lure'], loot: true, rarity: 'common',
      text: 'A Lure in your zone or an adjacent one until the end of the round. Alarm +1.', chainText: 'Alarm does not rise.', art: 'whistle', value: 6,
      target: { kind: 'adjcell' },
      play(c) { c.lure(c.target, c.chain ? 0 : 1); },
    },
    {
      id: 'canned', name: 'Canned Stew', suit: 'agility', cost: 0, shield: 1, type: 'Consumable', tags: ['energy'], loot: true, rarity: 'common', consumable: true,
      text: '+1 ⚡ and remove 1 Wound from your hand. Removed from play.', chainText: 'draw 1 card.', art: 'canned', value: 7,
      target: null,
      play(c) { c.energy(1); c.dropWoundFromHand(); if (c.chain) c.draw(1); },
    },
    {
      id: 'ambush', name: 'Ambush!', suit: 'none', cost: null, shield: 0, type: 'Event', tags: ['event'], loot: true, event: true,
      text: 'Reveal at once: a Shambler appears in your zone (at night — a Runner). The Search ends — keep only the loot cards already drawn.', art: 'ambush', value: 0,
      unplayable: true,
    },
  ]);

  // --- Gleb "Double-Tap": paired pistols (secret campaign hero) ---
  ZG.Cards.addAll([
    {
      id: 'gl_left', name: 'Left Barrel', suit: 'agility', cost: 1, shield: 0, noise: 1, type: 'Attack', tags: ['ranged', 'gun'], hero: 'gleb',
      text: 'Ranged, range 0–2. 2 damage. Noise 1.', chainText: '+1 damage.', art: 'pistol', value: 10,
      target: { kind: 'zombie', range: 2, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'gl_right', name: 'Right Barrel', suit: 'agility', cost: 1, shield: 0, noise: 1, type: 'Attack', tags: ['ranged', 'gun'], hero: 'gleb',
      text: 'Ranged, range 0–2. 2 damage. Noise 1.', chainText: 'draw 1 card.', art: 'pistol', value: 10,
      target: { kind: 'zombie', range: 2, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 2); if (c.chain) c.draw(1); },
    },
    {
      id: 'gl_fan', name: 'Fan Fire', suit: 'rage', cost: 2, shield: 0, noise: 2, type: 'Attack', tags: ['ranged', 'gun'], hero: 'gleb',
      text: 'Ranged, range 0–1. 1 damage to each enemy in the zone. Noise 2.', chainText: '+1 damage to each.', art: 'shotgun', value: 11,
      target: { kind: 'zone', range: 1, ranged: true },
      play(c) { c.shot(2); c.zoneDamage(c.target, 1 + (c.chain ? 1 : 0), { kind: 'ranged' }); },
    },
    {
      id: 'gl_reload', name: 'Reload', suit: 'mind', cost: 0, shield: 1, type: 'Tactic', tags: [], hero: 'gleb',
      text: 'Draw 1 card. Removes the "Reload" penalty for next turn.', chainText: '+1 ⚡.', art: 'gear', value: 8,
      target: null,
      play(c) { c.draw(1); c.hero.reloadPending = false; c.hero.reloadDue = 0; if (c.chain) c.energy(1); },
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
