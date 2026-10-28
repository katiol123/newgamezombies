/*
 * Secret missions. At the start of the game each hero secretly draws one mission card.
 * Only the hero who completes their mission FIRST gets the reward; anyone who completes it later gets nothing.
 * So it pays to keep your mission hidden: an ally may "steal" your goal.
 *
 * Fields: rarity ('common' ×2 in the deck, 'rare' ×1), stat — hero counter (h.ms[stat]), goal — how many are needed,
 *       needsAlly / needsStealth / needsFog / needsBandits / needsSafe — if the condition is not met, the card goes to the bottom and a new one is drawn,
 *       reward(g, h, E) — reward, perk — permanent passive (like a talent: mods/hooks), traitor — the traitor card.
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  // Reward strength follows the chance of completing it first (simulator measurement): the rarer, the more generous.
  //   ~40%: small one-off · ~30%: find/XP · ~25%: passive · ~13%: strong passive · <10%: very strong.
  ZG.Missions.addAll([
    {
      id: 'm_butcher', name: 'Hacker', rarity: 'common', stat: 'meleeKills', goal: 5,
      text: 'Kill 5 zombies in melee.', rewardText: '+3 XP.',
      reward(g, h, E) { E.gainXp(g, h, 3); },
    },
    {
      id: 'm_scavenger', name: 'Pack Rat', rarity: 'common', stat: 'searches', goal: 4,
      text: 'Make 4 Searches.', rewardText: 'A rare find from the loot deck — to your hand.',
      reward(g, h, E) { E.giveRareLoot(g, h); },
    },
    {
      id: 'm_scout', name: 'Pathfinder', rarity: 'common', stat: 'reveals', goal: 3, needsFog: true,
      text: 'Scout 3 closed tiles (step into the fog). Requires Fog of War.', rewardText: 'Passive "Tracker": your first "Move" each turn is free.',
      perk: { name: 'Tracker', text: 'Your first "Move" each turn is free.', mods: { freeFirstMove: 1 } },
    },
    {
      id: 'm_angel', name: 'Guardian Angel', rarity: 'common', stat: 'helps', goal: 2, needsAlly: true,
      text: 'Help an ally twice: heal them, disinfect them, pull them out, give them a find or cargo (any card if they are wounded). A handover counts once per turn and never twice with the same card. Requires an ally.', rewardText: 'A Medkit to your hand.',
      reward(g, h, E) { E.giveCard(g, h, 'medkit'); },
    },
    {
      id: 'm_ghost', name: 'Invisible', rarity: 'common', stat: 'unseen', goal: 2,
      text: 'End 2 of your turns near zombies (within 3 zones) without any of them seeing you.', rewardText: '+2 XP.',
      reward(g, h, E) { E.gainXp(g, h, 2); },
    },
    {
      id: 'm_biggame', name: 'Big Game', rarity: 'rare', stat: 'bigKills', goal: 1,
      text: 'Land the killing blow on a large target (Brute, Nest, Hound, Turned).', rewardText: 'Passive "Trophy": +1 Grit and +1 hand size.',
      perk: { name: 'Trophy', text: '+1 Grit and +1 hand size.', mods: { hp: 1, handSize: 1 } },
    },
    {
      id: 'm_rampage', name: 'Meat Grinder', rarity: 'rare', stat: 'bestTurnKills', goal: 3,
      text: 'Kill 3 zombies in a single turn of yours.', rewardText: 'A rare find to your hand and +2 XP.',
      reward(g, h, E) { E.giveRareLoot(g, h); E.gainXp(g, h, 2); },
    },
    {
      id: 'm_traitor', name: 'Traitor', rarity: 'rare', stat: 'betrayals', goal: 2, needsAlly: true, needsStealth: true, traitor: true,
      text: 'Set zombies on your allies: wake or distract them with your noise or a blow — and over the mission let them attack your allies for a total of 2 damage (attack strength counts even if blocked). Requires an ally and stealth.',
      rewardText: 'You are exposed. Passive "Save Your Own Skin": +1 ⚡ every turn and 1 damage against you in the zombie phase is blocked.',
      perk: { name: 'Save Your Own Skin', text: '+1 ⚡ every turn; 1 damage in the zombie phase is blocked.', mods: { autoBlock: 1, energy: 1 } },
    },
    {
      id: 'm_sniper', name: 'Keen Eye', rarity: 'common', stat: 'farKills', goal: 2,
      text: 'Kill 2 zombies with ranged attacks at a target outside your zone (thrown items — brick, Molotov — count too).', rewardText: '+2 XP.',
      reward(g, h, E) { E.gainXp(g, h, 2); },
    },
    {
      id: 'm_silent', name: 'Silent Death', rarity: 'common', stat: 'quietKills', goal: 1, needsStealth: true,
      text: 'Kill a zombie that was not hunting you (wandering or lurking). Requires stealth.', rewardText: '"Garrote" — to your hand.',
      reward(g, h, E) { E.giveCard(g, h, 'garrote'); },
    },
    {
      id: 'm_unbreakable', name: 'Unbreakable', rarity: 'common', stat: 'blocked', goal: 6,
      text: 'Block 6 damage over the mission (with cards, Block, gear).', rewardText: 'Immediately remove 2 Wounds or Infections.',
      reward(g, h, E) { E.healWounds(g, h, 2, true); },
    },
    {
      id: 'm_cool', name: 'Cool Head', rarity: 'rare', stat: 'coolHead', goal: 2,
      text: 'Twice survive a zombie phase in a zone with 3+ hunting zombies without taking a single Wound.', rewardText: 'Passive "Ice in the Veins": every card discarded to block blocks +1.',
      perk: { name: 'Ice in the Veins', text: 'Every card discarded to block blocks +1.', mods: { blockPerCard: 1 } },
    },
    {
      id: 'm_bounty', name: 'Bounty Hunter', rarity: 'rare', stat: 'banditKills', goal: 2, needsBandits: true,
      text: 'Land the killing blow on two bandits. Requires bandits on the board.', rewardText: 'Passive "Eagle Eye": your ranged attacks get +1 range.',
      perk: { name: 'Eagle Eye', text: 'Your ranged attacks get +1 range.', mods: { rangeBonus: 1 } },
    },
    {
      id: 'm_fence', name: 'Safecracker', rarity: 'common', stat: 'safeLoot', goal: 1, needsSafe: true,
      text: 'Take a Valuable out of a safe. Requires a safe on the board.', rewardText: '+2 XP.',
      reward(g, h, E) { E.gainXp(g, h, 2); },
    },
  ]);

  // mission deck composition: common ×2, rare ×1
  ZG.MISSION_DECK = ZG.Missions.all().reduce((acc, m) => acc.concat(Array(m.rarity === 'rare' ? 1 : 2).fill(m.id)), []);
})(typeof globalThis !== 'undefined' ? globalThis : window);
