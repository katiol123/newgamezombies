/*
 * Base reference data: suits, times of day, enemies, utility cards.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  // Three suits. Play a card of the same suit as the previous one to trigger a "Chain".
  ZG.SUITS = {
    rage: { id: 'rage', name: 'Rage', color: '#c0392b', dark: '#7b1e14', icon: 'suit_rage' },
    agility: { id: 'agility', name: 'Agility', color: '#2e8b57', dark: '#17543a', icon: 'suit_agility' },
    mind: { id: 'mind', name: 'Mind', color: '#2d6fb5', dark: '#173d66', icon: 'suit_mind' },
    none: { id: 'none', name: '—', color: '#6b6258', dark: '#3a342e', icon: null },
  };

  // Times of day: pick the row of the spawn card.
  ZG.PHASES = [
    { id: 0, name: 'Dusk', color: '#d9c7a3' },
    { id: 1, name: 'Night', color: '#e0a83a' },
    { id: 2, name: 'Dead of Night', color: '#c0392b' },
  ];

  // ---------------------------------------------------------------- Enemies ---
  ZG.Zombies.addAll([
    {
      id: 'walker', name: 'Shambler', hp: 2, dmg: 1, speed: 1, xp: 0, armor: 0, threat: 2,
      text: 'Slow, but there are many of them.', art: 'z_walker',
    },
    {
      id: 'runner', name: 'Runner', hp: 1, dmg: 1, speed: 2, xp: 0, armor: 0, threat: 3,
      text: 'Moves 2 zones. Fragile.', art: 'z_runner',
    },
    {
      id: 'screamer', name: 'Screamer', hp: 1, dmg: 0, speed: 1, xp: 0, armor: 0, threat: 4,
      text: 'Does not attack. In the zombie phase, if a hero is within 2 zones of it: Alarm +1.', art: 'z_screamer',
      hooks: { zombiePhase(g, z, E) { const d = E.dist(g, z.pos); if (g.heroes.some((h) => h.onBoard && d[h.pos] <= 2)) E.raiseAlarm(g, 1, 'The Screamer howls'); } },
    },
    {
      id: 'fatso', name: 'Bloater', hp: 4, dmg: 2, speed: 1, xp: 2, armor: 0, threat: 4,
      text: 'Tough. Hits for 2.', art: 'z_fatso',
    },
    {
      id: 'brute', name: 'Brute', hp: 7, dmg: 3, speed: 1, xp: 5, armor: 1, threat: 8, big: true,
      text: 'Large target: damage persists. Armor 1: each damage effect against it is −1.', art: 'z_brute',
    },
    {
      id: 'plague', name: 'Plaguebearer', hp: 4, dmg: 1, speed: 1, xp: 3, armor: 0, threat: 7, infects: true,
      text: 'Infectious: every unblocked bite is an Infection, no roll.', art: 'z_plague',
    },
    {
      id: 'grabber', name: 'Grabber', hp: 5, dmg: 1, speed: 1, xp: 3, armor: 1, threat: 6, grip: true,
      text: 'Long arms: leaving its zone costs +1 ⚡ more (on top of Grip). Armor 1.', art: 'z_grabber',
    },
    {
      id: 'hound', name: 'Hound', hp: 4, dmg: 2, speed: 2, xp: 5, armor: 0, threat: 9, big: true, relentless: true,
      text: 'A dead dog: always hunting, it smells the nearest hero at any distance. Moves 2 zones. Appears only from the "Hound" event.', art: 'z_hound',
    },
    {
      id: 'nest', name: 'Nest', hp: 5, dmg: 0, speed: 0, xp: 3, armor: 0, threat: 5, immobile: true, big: true,
      text: 'Large target: damage persists. Does not move. In the zombie phase it spawns a Shambler in its zone (a Runner in the Dead of Night).', art: 'z_nest',
      hooks: { zombiePhase(g, z, E) { const t = E.phase(g) >= 2 ? 'runner' : 'walker'; E.spawnZombie(g, t, z.pos, 'The Nest spawns: ' + ZG.Zombies.get(t).name); } },
    },
  ]);

  // ------------------------------------------- Turned heroes (special) ---
  // The hero's token is flipped to this side. Behaves like an ordinary zombie,
  // plus the special property from the text. All are large targets (damage persists).
  ZG.Zombies.addAll([
    {
      id: 'turned_boris', name: 'Turned Boris', hp: 8, dmg: 2, speed: 1, xp: 5, armor: 1, threat: 9, big: true, turned: 'boris',
      text: 'Armor 1. Battering ram: smashes a barricade in one hit.', art: 'z_turned_boris', breaker: true,
    },
    {
      id: 'turned_marina', name: 'Turned Marina', hp: 5, dmg: 1, speed: 1, xp: 4, armor: 0, threat: 7, big: true, turned: 'marina',
      text: 'Infectious: every unblocked hit of hers is an Infection, no roll.', art: 'z_turned_marina', infects: true,
    },
    {
      id: 'turned_lisa', name: 'Turned Lisa', hp: 4, dmg: 1, speed: 3, xp: 4, armor: 0, threat: 8, big: true, turned: 'lisa',
      text: 'Swift: moves 3 zones and climbs over barricades.', art: 'z_turned_lisa', climber: true,
    },
    {
      id: 'turned_viktor', name: 'Turned Viktor', hp: 6, dmg: 2, speed: 1, xp: 5, armor: 0, threat: 9, big: true, turned: 'viktor',
      text: 'Shoots out of habit: in the zombie phase, 1 damage to a hero in the line of fire 1–2 zones away (a Wound, no roll).', art: 'z_turned_viktor',
      hooks: { zombiePhase(g, z, E) { E.turnedShot(g, z, 2); } },
    },
    {
      id: 'turned_kira', name: 'Turned Kira', hp: 6, dmg: 2, speed: 1, xp: 5, armor: 0, threat: 8, big: true, turned: 'kira',
      text: 'Homemade bomb on her belt: when she is killed it explodes — 2 damage to every zombie and 1 Wound to every hero in her zone.', art: 'z_turned_kira',
      onDeath(g, z, E) { E.blast(g, z.pos, 2, 1); },
    },
    {
      id: 'turned_sava', name: 'Turned Sava', hp: 5, dmg: 1, speed: 2, xp: 4, armor: 0, threat: 8, big: true, turned: 'sava',
      text: 'Merciless: always hunting and never loses the trail; moves 2 zones.', art: 'z_turned_sava', relentless: true,
    },
    {
      id: 'turned_gosha', name: 'Turned Gosha', hp: 7, dmg: 2, speed: 1, xp: 5, armor: 1, threat: 9, big: true, turned: 'gosha',
      text: 'Rattles: in the zombie phase, Alarm +1. Armor 1.', art: 'z_turned_gosha',
      hooks: { zombiePhase(g, z, E) { E.raiseAlarm(g, 1, 'Turned Gosha rattles'); } },
    },
    {
      id: 'turned_gleb', name: 'Turned Gleb', hp: 5, dmg: 3, speed: 1, xp: 5, armor: 0, threat: 9, big: true, turned: 'gleb',
      text: 'Two-handed grip: strikes with both hands at once — 3 damage.', art: 'z_turned_gleb',
    },
  ]);

  // ---------------------------------------------------------- Utility ---
  ZG.Cards.addAll([
    {
      id: 'wound', name: 'Wound', suit: 'none', cost: null, shield: 0, kind: 'wound',
      type: 'Wound', text: 'Cannot be played or discarded to block.\nRemoved by healing.',
      art: 'wound', unplayable: true, value: -10,
    },
    {
      id: 'infection', name: 'Infection', suit: 'none', cost: null, shield: 0, kind: 'infection',
      type: 'Bite', text: 'Cannot be played, given or discarded to block. Counts as a Wound.\nIf it is in your hand at the end of your turn — TURNING! Saved by a medkit, Marina, "Cauterize Bite".',
      art: 'infection', unplayable: true, value: -14,
    },
    {
      id: 'cargo_fuel', name: 'Jerrycan', suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'fuel',
      type: 'Cargo', text: 'Cargo. Takes up a slot in your hand. Cannot be played or discarded.\nDeliver it to the vehicle zone.',
      art: 'cargo_fuel', unplayable: true, value: 0,
    },
    {
      id: 'cargo_radio', name: 'Radio', suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'radio',
      type: 'Cargo', text: 'Cargo. Takes up a slot in your hand. Cannot be played or discarded.\nCarry it to the tower.',
      art: 'cargo_radio', unplayable: true, value: 0,
    },
    {
      id: 'cargo_meds', name: 'Medicine', suit: 'none', cost: null, shield: 0, kind: 'cargo', cargo: 'meds',
      type: 'Cargo', text: 'Cargo. Takes up a slot in your hand. Cannot be played or discarded.\nDeliver it to the ambulance.',
      art: 'cargo_meds', unplayable: true, value: 0,
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
