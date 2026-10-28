/*
 * Heroes and their talents.
 * Passive abilities and talents are described via mods/hooks (see core.js),
 * so a new hero needs no engine changes as long as it uses existing keys.
 *
 * Known modifier keys:
 *   hp, handSize, energy, meleeBonus, rangedBonus, rangeBonus, shotNoise,
 *   taunt, blockPerCard, autoBlock, freeEscape, freeFirstSearch, freeFirstMove,
 *   barricadeCost, barricadeHp, trapBonus, healBonus, searchDraw, costDelta,
 *   immuneAttack, healAction, trapLure, secondWind
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const STARTER = ['strike', 'strike', 'dash', 'step', 'look', 'cover'];

  ZG.Heroes.addAll([
    {
      id: 'boris', pic: 'art/heroes/boris.jpg', face: 'art/heroes/boris_face.jpg', turnedPic: 'art/heroes/boris_turned.jpg', turnedFace: 'art/heroes/boris_turned_face.jpg', name: 'Boris', nick: 'Sledge', role: 'Tank', color: '#c0392b',
      hp: 7, hand: 4, energy: 3,
      bio: 'A foreman from a building site on the outskirts. Slow, stubborn, unbreakable.',
      ability: 'Living Shield', abilityText: 'Zombies in his zone attack only Boris. Every card he discards to block blocks +1. He only gets Infected on a "1".',
      deck: STARTER.concat(['sledge', 'ram', 'stance', 'roar']),
      talents: [['thick_skin', 'heavy_hand'], ['rock', 'retaliate']],
      mods: { taunt: 1, blockPerCard: 1, infectDie: -1 },
      art: 'hero_boris',
    },
    {
      id: 'marina', pic: 'art/heroes/marina.jpg', face: 'art/heroes/marina_face.jpg', turnedPic: 'art/heroes/marina_turned.jpg', turnedFace: 'art/heroes/marina_turned_face.jpg', name: 'Marina', nick: 'Scalpel', role: 'Medic', color: '#e8e8e8',
      hp: 6, hand: 5, energy: 3,
      bio: 'A surgeon at the district hospital. Walked off her last shift with a full bag.',
      ability: 'Field Doctor', abilityText: 'Once per turn, 1 ⚡, for a hero in her zone (herself included): remove 1 Wound OR disinfect: all of their Infections (hand, deck and discard) → Wounds.',
      deck: STARTER.concat(['scalpel', 'bandage', 'adrenaline', 'coldcalc']),
      talents: [['sterile', 'steady'], ['second_wind', 'triage']],
      mods: { healAction: 1 },
      art: 'hero_marina',
    },
    {
      id: 'lisa', pic: 'art/heroes/lisa.jpg', face: 'art/heroes/lisa_face.jpg', turnedPic: 'art/heroes/lisa_turned.jpg', turnedFace: 'art/heroes/lisa_turned_face.jpg', name: 'Lisa', nick: 'Shadow', role: 'Scout', color: '#2e8b57',
      hp: 4, hand: 4, energy: 3,
      bio: 'A courier and free-runner. Knows every rooftop on the block.',
      ability: 'Parkour', abilityText: 'Her first exit per turn from a zone with zombies costs her nothing (Grip does not apply). Climbs barricades for free.',
      deck: STARTER.concat(['knife', 'lure', 'rooftops', 'vanish']),
      talents: [['quick_fingers', 'sprint'], ['backstab', 'ghost']],
      mods: { freeEscape: (g) => (g.turn && g.turn.escaped ? 0 : 1), climb: 1 },
      art: 'hero_lisa',
    },
    {
      id: 'viktor', pic: 'art/heroes/viktor.jpg', face: 'art/heroes/viktor_face.jpg', turnedPic: 'art/heroes/viktor_turned.jpg', turnedFace: 'art/heroes/viktor_turned_face.jpg', name: 'Viktor', nick: 'Thunder', role: 'Gunner', color: '#2d6fb5',
      hp: 6, hand: 5, energy: 3,
      bio: 'The local beat cop. Short on bullets, long on patience.',
      ability: 'Training', abilityText: '+1 range to his ranged attacks. His first shot each turn makes 1 less Noise.',
      deck: STARTER.concat(['sawnoff', 'pm', 'suppress', 'buttstroke']),
      talents: [['silencer', 'marksman'], ['quickdraw', 'ammo']],
      mods: { rangeBonus: 1, firstShotQuiet: 1 },
      art: 'hero_viktor',
    },
    {
      id: 'kira', pic: 'art/heroes/kira.jpg', face: 'art/heroes/kira_face.jpg', turnedPic: 'art/heroes/kira_turned.jpg', turnedFace: 'art/heroes/kira_turned_face.jpg', name: 'Kira', nick: 'Wrench', role: 'Mechanic', color: '#d4a017',
      hp: 6, hand: 5, energy: 3,
      bio: 'Fixes anything that drives and breaks anything that walks.',
      ability: 'Engineer', abilityText: 'The basic "Barricade" action costs her 1 ⚡ instead of 2. Her barricades are 1 sturdier, her traps deal 1 more damage.',
      deck: STARTER.concat(['wrench', 'tripwire', 'improvise', 'weld']),
      talents: [['reinforce', 'shrapnel'], ['tinkerer', 'gadgets']],
      mods: { barricadeCost: -1, barricadeHp: 1, trapBonus: 1 },
      art: 'hero_kira',
    },
    {
      id: 'sava', pic: 'art/heroes/sava.jpg', face: 'art/heroes/sava_face.jpg', turnedPic: 'art/heroes/sava_turned.jpg', turnedFace: 'art/heroes/sava_turned_face.jpg', name: 'Sava', nick: 'Owl', role: 'Saboteur', color: '#6b5b95',
      hp: 4, hand: 5, energy: 3,
      bio: 'A former hunter. Moves so quietly that even the dead cannot hear him.',
      ability: 'Silent', abilityText: 'Wandering zombies do not notice Sava from afar — only from their own or an adjacent zone. Doors do not creak under him.',
      deck: STARTER.concat(['silent_step', 'shiv', 'pebble', 'lurk']),
      talents: [['sharp', 'softfoot'], ['decoy', 'assassin']],
      mods: { stealthy: 1, silentDoors: 1 },
      art: 'hero_sava',
    },
    {
      id: 'gosha', pic: 'art/heroes/gosha.jpg', face: 'art/heroes/gosha_face.jpg', turnedPic: 'art/heroes/gosha_turned.jpg', turnedFace: 'art/heroes/gosha_turned_face.jpg', name: 'Gosha', nick: 'Foghorn', role: 'Roadworker', color: '#e67e22',
      hp: 7, hand: 6, energy: 3,
      bio: 'Foreman of a road crew. Cannot do quiet, but can roll anything flat into asphalt.',
      ability: 'Loud & Plug', abilityText: 'Loud: wandering zombies notice Gosha 2 zones away even through walls, cover does not help him, doors creak under him for 2 zones. Plug (1 ⚡, action): in a zone with a manhole — the manhole stays silent for 2 rounds. Noise 1.',
      deck: STARTER.concat(['jackhammer', 'generator', 'cones', 'rebar']),
      talents: [['weld_seam', 'workwear'], ['foreman', 'overtime']],
      mods: { loud: 1, plugAction: 1 },
      art: 'hero_gosha',
    },
    {
      // secret hero: appears only after being rescued from captivity (campaign, mission 7); cannot be hired; in single play — after the first rescue
      id: 'gleb', secret: true, pic: 'art/heroes/gleb.jpg', face: 'art/heroes/gleb_face.jpg', turnedPic: 'art/heroes/gleb_turned.jpg', turnedFace: 'art/heroes/gleb_turned_face.jpg', name: 'Gleb', nick: 'Double-Tap', role: 'Duelist', color: '#6a8a4a',
      hp: 4, hand: 4, energy: 3,
      bio: 'A shooting-club instructor. The convoy took him on as a guide, the Wolves took him prisoner. Shoots with both hands and thinks it looks cool.',
      ability: 'Akimbo', abilityText: 'A ranged card played right after another ranged card costs 0 ⚡ (once per turn). Flaws: "Reload" — after such a double tap, −1 ⚡ next turn; "Hands Full" — Punch unavailable; "Loud Barrels" — all his shots +1 Noise.',
      deck: STARTER.concat(['gl_left', 'gl_right', 'gl_fan', 'gl_reload']),
      talents: [['gl_steady', 'gl_speedload'], ['gl_macedon', 'gl_rain']],
      mods: { doublet: 1, noPunch: 1, shotNoise: 1 },
      art: 'hero_gleb',
    },
  ]);
  // heroes visible in squad selection, print and simulators: secret ones only once unlocked (ZG.unlockedHeroes)
  ZG.Heroes.visible = () => ZG.Heroes.all().filter((h) => !h.secret || (ZG.unlockedHeroes || []).includes(h.id));

  // ------------------------------------------------------------- Talents ---
  // Level 2 — at 4 XP, level 3 — at 10 XP. One of each pair is chosen.
  const isMeleeCtx = (ctx) => ctx && ctx.kind === 'melee';
  ZG.Talents.addAll([
    // Boris
    { id: 'thick_skin', name: 'Thick Skin', text: '+2 Grit (survive more Wounds).', mods: { hp: 2 } },
    { id: 'heavy_hand', name: 'Heavy Hand', text: '+1 damage to all your melee attacks.', mods: { meleeBonus: (g, h, ctx) => (isMeleeCtx(ctx) ? 1 : 0) } },
    { id: 'rock', name: 'Rock', text: '+1 hand size.', mods: { handSize: 1 } },
    {
      id: 'retaliate', name: 'Retaliation', text: 'If you blocked 2+ damage in the zombie phase — 2 damage to one zombie in your zone.',
      hooks: { afterBlock(g, h, ctx) { if (ctx.incoming - ctx.taken >= 2) ctx.E.retaliate(g, h, 2); } },
    },
    // Marina
    { id: 'sterile', name: 'Sterile', text: 'All your healing removes 1 more Wound.', mods: { healBonus: 1 } },
    { id: 'steady', name: 'Conveyor', text: '"Field Doctor" can be used twice per turn.', mods: { healAction: 1 } },
    {
      id: 'second_wind', name: 'Second Wind', text: 'Once per game: when a hero in your zone would fall, they remove 2 Wounds instead.',
      mods: { secondWind: 1 },
    },
    {
      id: 'triage', name: 'Triage', text: 'At the start of your turn: +1 ⚡ for each wounded hero in your zone (max +2).',
      mods: { energy: (g, h) => Math.min(2, g.heroes.filter((o) => o.onBoard && o.pos === h.pos && ZG.Engine.woundCount(g, o) > 0).length) },
    },
    // Lisa
    { id: 'quick_fingers', name: 'Quick Fingers', text: 'Search: draw 1 more loot card. Your first Search each turn costs 0 ⚡.', mods: { searchDraw: 1, freeFirstSearch: 1 } },
    {
      id: 'sprint', name: 'Sprint', text: '+1 ⚡ at the start of your turn if there are no zombies in your zone.',
      mods: { energy: (g, h) => (ZG.Engine.zombiesAt(g, h.pos).length === 0 ? 1 : 0) },
    },
    {
      id: 'backstab', name: 'Backstab', text: 'Your first melee attack each turn: +2 damage.',
      mods: { meleeBonus: (g, h, ctx) => (isMeleeCtx(ctx) && !g.turn.meleeDone ? 2 : 0) },
    },
    {
      id: 'ghost', name: 'Ghost', text: 'Shamblers and Runners do not attack you.',
      mods: { immuneAttack: (g, h, ctx) => (ctx && (ctx.type === 'walker' || ctx.type === 'runner') ? 1 : 0) },
    },
    // Viktor
    { id: 'silencer', name: 'Silencer', text: 'All your shots −1 Noise.', mods: { shotNoise: -1 } },
    { id: 'marksman', name: 'Zeroed In', text: '+1 damage to all your ranged attacks.', mods: { rangedBonus: (g, h, ctx) => (ctx && ctx.kind === 'ranged' ? 1 : 0) } },
    {
      id: 'quickdraw', name: 'Quick Draw', text: 'Your first ranged card each turn costs 1 ⚡ less.',
      mods: { costDelta: (g, h, ctx) => (ctx && ctx.def.tags && ctx.def.tags.includes('ranged') && !g.turn.rangedPlayed ? -1 : 0) },
    },
    {
      id: 'ammo', name: 'Finisher', text: 'When you kill a zombie with a ranged attack, draw 1 card (once per turn).',
      hooks: { kill(g, h, ctx) { if (ctx.kind === 'ranged' && g.active === h.idx && g.turn && !g.turn.finisher) { g.turn.finisher = true; ctx.E.drawFor(g, h, 1); } } },
    },
    // Kira
    { id: 'reinforce', name: 'Rebar', text: 'Your barricades get +2 durability.', mods: { barricadeHp: 2 } },
    { id: 'shrapnel', name: 'Shrapnel', text: 'Your traps deal +1 damage, and the shrapnel deals 1 damage to each enemy in adjacent zones.', mods: { trapBonus: 1, trapSplash: 1 } },
    { id: 'tinkerer', name: 'Alarm Rig', text: 'Your traps work as Lures: zombies go to them as if they were heroes.', mods: { trapLure: 1 } },
    {
      id: 'gadgets', name: 'Gadgets', text: 'Your first Mind card each turn costs 1 ⚡ less.',
      mods: { costDelta: (g, h, ctx) => (ctx && ctx.def.suit === 'mind' && !g.turn.mindPlayed ? -1 : 0) },
    },
    // Sava
    { id: 'sharp', name: 'Whetted Blade', text: '+1 damage to all your melee attacks against hunting and lurking enemies (zombies, bandits, etc.).', mods: { meleeVsAlert: 1 } },
    { id: 'softfoot', name: 'Soft Step', text: 'Your first "Move" each turn is free.', mods: { freeFirstMove: 1 } },
    { id: 'decoy', name: 'Master of Distraction', text: '"Pebble" is heard 2 zones farther and draws 1 card. Your first "Pebble" each turn also gives +1 ⚡.', mods: { pebblePlus: 1 } },
    {
      id: 'assassin', name: 'Shadow Killer', text: 'When you kill a wandering zombie with "Knife in the Back", gain +1 ⚡ (once per turn).',
      hooks: { kill(g, h, ctx) { if (ctx.kind === 'silent' && g.active === h.idx && g.turn && !g.turn.assassin) { g.turn.assassin = true; h.energy += 1; } } },
    },
    // Gosha
    { id: 'weld_seam', name: 'Weld Seam', text: 'Plug holds 1 round longer and costs 0 ⚡.', mods: { plugRounds: 1, plugCost: -1 } },
    // old ids (workwear, overtime) kept so saved campaigns do not break
    { id: 'workwear', name: 'Iron Lungs', text: 'Once per turn, 0 ⚡: shout — every wandering zombie within 2 zones of you comes to you. Alarm does not rise.', mods: { shoutAction: 1 } },
    { id: 'foreman', name: 'Crew Chief', text: 'After a Plug, draw 1 card and gain 1 Block.', mods: { plugBonus: 1 } },
    { id: 'overtime', name: 'Site Boss', text: 'Once per turn, 1 ⚡: another hero in your zone gets +1 ⚡ at the start of their next turn.', mods: { foremanAction: 1 } },
    // Gleb
    { id: 'gl_steady', name: 'Steady Hand', text: '+1 range to your shots.', mods: { rangeBonus: 1 } },
    { id: 'gl_speedload', name: 'Speed Loader', text: '"Reload" costs no ⚡ if you did not move during the double-tap turn (neither by step nor by card).', mods: { speedload: 1 } },
    { id: 'gl_macedon', name: 'Gunslinger', text: '"Akimbo" triggers twice per turn ("Reload" penalty is still −1 ⚡).', mods: { doubletMax: 1 } },
    { id: 'gl_rain', name: 'Lead Rain', text: 'Your shots at a zone ("Fan Fire" etc.) deal +1 damage.', mods: { rangedBonus: (g, h, ctx) => (ctx && ctx.def && ctx.def.target && ctx.def.target.kind === 'zone' ? 1 : 0) } },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
