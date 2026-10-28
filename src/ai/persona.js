/*
 * Hero personalities for the AI — hidden data: never shown anywhere in the game.
 * They only affect choices where a hero has a choice (missions, safe, Valuables, risk in combat,
 * shelter spending, the peddler, shelter events).
 *
 *   honor    — honest: never betrays (swaps the "Traitor" card, and if it cannot be swapped — does not pursue it)
 *   greed    — appetite for loot: 0 — leaves safes alone (unless it is their mission), 1 — normal, 2 — greedy, cracks to the last
 *   spend    — shelter spending: 'thrifty' saves for a rainy day, 'normal', 'spender' spends at the first chance
 *   bold     — combat risk: <1 cautious, >1 itching for a fight
 *   ambition — zeal for the secret mission: multiplier on its value
 *   generous — will hand a Valuable to a pal sooner, before falling (not at the last moment)
 *   kind     — compassion in shelter events (feed refugees, let a stranger in, give way in a quarrel)
 *   brave    — volunteers for watch duty and opens the cellar
 *   loner    — antisocial: keeps away from other heroes on the board (on their turn avoids their zones and adjacent ones)
 *   hatesBandits — hates bandits: on their turn hits them first and goes after them (if there is time and strength)
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const BASE = { honor: false, greed: 1, spend: 'normal', bold: 1, ambition: 1, generous: false, kind: false, brave: false, loner: false, hatesBandits: false };
  const P = {
    // foreman: stubborn and straightforward — will not sell out his own; builds solidly, first into a fight
    boris: { honor: true, greed: 1, spend: 'normal', bold: 1.3, ambition: 0.8, brave: true },
    // surgeon: her oath — will not betray; saves for healing, careful, shares, pities people
    marina: { honor: true, greed: 0, spend: 'thrifty', bold: 0.8, generous: true, kind: true },
    // courier and free-runner: lives for today — spends at once, goes for safes, chases her goal
    lisa: { greed: 2, spend: 'spender', bold: 1, ambition: 1.3 },
    // beat cop: the law is the law — does not betray or loot; thrifty and composed
    viktor: { honor: true, greed: 0, spend: 'thrifty', bold: 1, kind: true, brave: true },
    // mechanic: "breaks anything that walks" — bold and reckless, will not miss her chance
    kira: { greed: 1, spend: 'normal', bold: 1.3, ambition: 1.3, brave: true },
    // hunter: a quiet, patient loner — keeps away from the squad, cautious, saves, does not take others' things, but never abandons his own
    sava: { honor: true, greed: 0, spend: 'thrifty', bold: 0.8, generous: true, loner: true },
    // road crew boss: loud and greedy — spends freely, jumps into fights, bails out his own
    gosha: { greed: 2, spend: 'spender', bold: 1.3, ambition: 0.8, generous: true, brave: true },
    // gunman freed from the Wolves: hates bandits — hits them first; a gambler, takes risks for profit
    gleb: { greed: 2, spend: 'spender', bold: 1.2, ambition: 1.5, hatesBandits: true },
  };
  ZG.Persona = {
    get: (id) => Object.assign({}, BASE, P[id] || {}),
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
