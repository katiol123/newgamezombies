/*
 * CardView — DOM layout of cards, heroes, conditions, scenarios, spawn cards.
 * The same layout is used in the game and on the print sheets (print.html).
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;
  const Art = ZG.Art;
  const artCache = new Map();

  function artURL(key, w, h, opts) {
    const k = key + '|' + w + 'x' + h + '|' + JSON.stringify(opts || {});
    if (!artCache.has(k)) artCache.set(k, Art.canvas(key, w, h, opts, 2).toDataURL());
    return artCache.get(k);
  }
  Art.onChange = () => {
    artCache.clear();
    if (ZG.Game && ZG.Game.g && ZG.Game.view) { ZG.Game.view.resize(); ZG.Game.refresh(); }
  };

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>'); }

  // keyword highlighting in rules text
  function rich(text) {
    return esc(text)
      .replace(/(\d+ damage)/g, '<b class="kw-dmg">$1</b>')
      .replace(/(Melee|Ranged|range [0-9–-]+)/g, '<b class="kw">$1</b>')
      .replace(/(Noise \d)/g, '<b class="kw-noise">$1</b>')
      .replace(/(\+?\d+ ⚡|⚡)/g, '<b class="kw-energy">$1</b>')
      .replace(/\b(Blocks?|Wounds?)\b/g, '<b class="kw">$1</b>');
  }
  ZG.rich = rich;

  function iconImg(key, cls, size) {
    const i = el('img', cls);
    i.src = artURL(key, size || 32, size || 32, {});
    i.alt = '';
    return i;
  }

  function card(defOrId, opts) {
    opts = opts || {};
    const def = typeof defOrId === 'string' ? ZG.Cards.get(defOrId) : defOrId;
    const suit = ZG.SUITS[def.suit] || ZG.SUITS.none;
    // text density: long cards get a smaller font and a shorter illustration
    const len = (def.text || '').length + (def.chainText ? def.chainText.length + 12 : 0);
    const dense = len > 115 ? ' denser' : len > 68 ? ' dense' : '';
    const c = el('div', `card suit-${suit.id} kind-${def.kind || 'action'}${opts.small ? ' small' : ''}${dense}`);
    c.dataset.id = def.id;
    const head = el('div', 'card-head');
    if (def.cost != null) {
      const cost = el('div', 'card-cost');
      cost.innerHTML = `<span>${opts.cost != null ? opts.cost : def.cost}</span>`;
      if (opts.cost != null && opts.cost !== def.cost) cost.classList.add(opts.cost < def.cost ? 'cheaper' : 'pricier');
      head.appendChild(cost);
    }
    // title font size — by the longest word (words are not hyphenated)
    const longest = Math.max.apply(null, def.name.split(/\s+/).map((w) => w.length));
    head.appendChild(el('div', 'card-name' + (longest > 10 ? ' xlong' : longest > 8 ? ' long' : ''), esc(def.name)));
    if (suit.icon) head.appendChild(iconImg(suit.icon, 'card-suit', 32));
    c.appendChild(head);
    const art = el('div', 'card-art');
    const img = el('img');
    img.src = artURL(def.art || def.id, 200, 100, { suit: def.suit });
    img.alt = '';
    art.appendChild(img);
    c.appendChild(art);
    const typeLine = [def.type];
    if (def.hero) typeLine.push(ZG.Heroes.get(def.hero).name);
    if (def.trader) typeLine.push('Peddler');
    else if (def.loot) typeLine.push({ rare: 'Rare', unique: 'Unique' }[def.rarity] || 'Loot');
    if (def.rarity && def.rarity !== 'common') c.classList.add('r-' + def.rarity);
    if (def.rarity && def.rarity !== 'common') c.appendChild(el('div', 'rarity-gem', def.rarity === 'unique' ? '★' : '◆'));
    c.appendChild(el('div', 'card-type', esc(typeLine.join(' · '))));
    const body = el('div', 'card-text');
    body.innerHTML = rich(def.text);
    if (def.chainText) {
      const ch = el('div', 'card-chain');
      ch.innerHTML = `<span class="chain-tag" style="--suit:${suit.color}">Chain</span> ${rich(def.chainText)}`;
      body.appendChild(ch);
    }
    c.appendChild(body);
    const foot = el('div', 'card-foot');
    if (def.shield) {
      const s = el('div', 'card-shield');
      s.appendChild(iconImg('shieldIcon', '', 28));
      s.appendChild(el('span', '', String(def.shield + (opts.blockBonus || 0))));
      s.title = 'Shield: discard during an attack to block this much damage';
      foot.appendChild(s);
    }
    if (def.noise) {
      const n = el('div', 'card-noise');
      n.appendChild(iconImg('noiseIcon', '', 28));
      n.appendChild(el('span', '', String(def.noise)));
      n.title = 'Noise: raises the Alarm';
      foot.appendChild(n);
    }
    if (def.consumable) foot.appendChild(el('div', 'card-flag', 'CONSUMABLE'));
    if (def.equip) foot.appendChild(el('div', 'card-flag', 'GEAR'));
    c.appendChild(foot);
    c.appendChild(el('div', 'card-gloss'));
    return c;
  }

  function cardBack(kind) {
    const c = el('div', 'card card-back back-' + (kind || 'hero'));
    c.innerHTML = `<div class="back-inner"><div class="back-logo">DEAD<br>BLOCK</div><div class="back-sub">${kind === 'loot' ? 'LOOT' : kind === 'spawn' ? 'SPAWN' : 'ACTION'}</div></div>`;
    return c;
  }

  function heroCard(id, opts) {
    opts = opts || {};
    const def = ZG.Heroes.get(id);
    const c = el('div', 'hero-card' + (opts.compact ? ' compact' : ''));
    c.style.setProperty('--hero', def.color);
    const portrait = el('div', 'hero-portrait');
    const img = el('img');
    // the hero illustration (if any), otherwise a portrait drawn in code
    const drawn = artURL(def.art, 200, 200, {});
    if (def.pic) { img.onerror = () => { img.onerror = null; img.src = drawn; }; img.src = def.pic; portrait.classList.add('pic'); } else img.src = drawn;
    portrait.appendChild(img);
    c.appendChild(portrait);
    const info = el('div', 'hero-info');
    info.innerHTML = `
      <div class="hero-role">${esc(def.role)}</div>
      <div class="hero-name">${esc(def.name)} <span>“${esc(def.nick)}”</span></div>
      <div class="hero-stats">
        <span title="Grit: how many Wounds they can take">♥ ${def.hp}</span>
        <span title="Hand size">🂠 ${def.hand}</span>
        <span title="Energy per turn">⚡ ${def.energy}</span>
      </div>
      <div class="hero-ability"><b>${esc(def.ability)}.</b> ${rich(def.abilityText)}</div>
      ${opts.bio ? `<div class="hero-bio">${esc(def.bio)}</div>` : ''}
      ${opts.talents ? `<div class="hero-talents">${def.talents.map((tier, i) => `<div class="tier"><span class="tier-lv">Lv.${i + 2}</span>${tier.map((t) => { const td = ZG.Talents.get(t); return `<div class="talent"><b>${esc(td.name)}</b> ${esc(td.text)}</div>`; }).join('<i>or</i>')}</div>`).join('')}</div>` : ''}
    `;
    c.appendChild(info);
    return c;
  }

  function talentCard(id) {
    const t = ZG.Talents.get(id);
    const c = el('div', 'talent-card');
    c.innerHTML = `<div class="talent-name">${esc(t.name)}</div><div class="talent-text">${rich(t.text)}</div>`;
    return c;
  }

  function spawnCard(id) {
    const def = ZG.SpawnCards.get(id);
    const c = el('div', 'card spawn-card');
    if (def.event) {
      c.innerHTML = `<div class="spawn-title">EVENT</div><div class="spawn-event-name">${esc(def.name)}</div><div class="spawn-event-text">${esc(def.text)}</div>`;
      return c;
    }
    c.appendChild(el('div', 'spawn-title', 'SPAWN'));
    def.rows.forEach((row, i) => {
      const r = el('div', 'spawn-row');
      r.style.setProperty('--phase', ZG.PHASES[i].color);
      r.appendChild(el('div', 'spawn-phase', ZG.PHASES[i].name));
      const z = el('div', 'spawn-z');
      if (!row.length) z.appendChild(el('span', 'spawn-empty', 'silence'));
      row.forEach((t) => {
        const im = el('img');
        im.src = artURL('z_' + t, 48, 48, {});
        im.title = ZG.Zombies.get(t).name;
        z.appendChild(im);
      });
      r.appendChild(z);
      c.appendChild(r);
    });
    return c;
  }

  function zombieCard(id) {
    const def = ZG.Zombies.get(id);
    const c = el('div', 'zombie-card');
    const img = el('img');
    const hd = def.turned && ZG.Heroes.get(def.turned);
    const drawn = artURL(def.id === 'nest' ? 'z_nest' : 'zp_' + def.id, 96, 96, { t: 0 });
    if (hd && hd.turnedFace) { img.onerror = () => { img.onerror = null; img.src = drawn; }; img.src = hd.turnedFace; img.classList.add('pic'); } else img.src = drawn;
    c.appendChild(img);
    const info = el('div', 'zinfo');
    info.innerHTML = `<div class="zname">${esc(def.name)}</div>
      <div class="zstats"><span title="Health">♥ ${def.hp}</span><span title="Damage">✊ ${def.dmg}</span><span title="Speed">👣 ${def.speed}</span><span title="XP for the kill">🎖 ${def.xp}</span></div>
      <div class="ztext">${esc(def.text)}</div>`;
    c.appendChild(info);
    return c;
  }

  function conditionCard(id) {
    const def = ZG.Conditions.get(id);
    const c = el('div', 'cond-card tone' + (def.tone > 0 ? 'pos' : def.tone < 0 ? 'neg' : 'neu'));
    const img = el('img');
    img.src = artURL(def.art, 200, 110, {});
    c.appendChild(img);
    c.appendChild(el('div', 'cond-name', esc(def.name)));
    c.appendChild(el('div', 'cond-text', esc(def.text)));
    return c;
  }

  function eventCard(id) {
    const def = ZG.Events.get(id);
    const c = el('div', 'scen-card event-card tone' + (def.tone > 0 ? 'pos' : def.tone < 0 ? 'neg' : 'neu'));
    c.innerHTML = `<div class="scen-kicker">ROUND EVENT</div><div class="scen-name">${esc(def.name)}</div><div class="scen-brief">${esc(def.text)}</div>`;
    return c;
  }

  function missionCard(id) {
    const m = ZG.Missions.get(id);
    const c = el('div', 'scen-card mission-card' + (m.rarity === 'rare' ? ' rare' : '') + (m.traitor ? ' traitor' : ''));
    const req = [m.needsAlly && 'needs an ally', m.needsStealth && 'needs stealth', m.needsFog && 'needs fog', m.needsBandits && 'needs bandits', m.needsSafe && 'needs a safe'].filter(Boolean);
    c.innerHTML = `<div class="scen-kicker">SECRET MISSION${m.rarity === 'rare' ? ' · RARE' : ''}</div><div class="scen-name">${esc(m.name)}</div><div class="scen-brief">${esc(m.text)}</div>${req.length ? `<div class="scen-setup"><b>⚑ ${esc(req.join(', '))}</b></div>` : ''}<div class="scen-short">Reward (first only): ${esc(m.rewardText)}</div><div class="scen-setup">Progress: ${'□ '.repeat(m.goal)}</div>`;
    return c;
  }

  // o.noSetup — without "Setup" (in the digital game the board is already laid out; this is an instruction for the cardboard version)
  function scenarioCard(id, o) {
    const def = ZG.Scenarios.get(id);
    const c = el('div', 'scen-card');
    c.innerHTML = `<div class="scen-kicker">TASK</div><div class="scen-name">${esc(def.name)}</div><div class="scen-brief">${esc(def.brief)}</div><div class="scen-short">${esc(def.short)}</div>${def.setupText && !(o && o.noSetup) ? `<div class="scen-setup"><b>Setup:</b> ${esc(def.setupText)}</div>` : ''}`;
    const img = el('img');
    img.src = artURL(def.exitArt || 'exit_car', 64, 84, {});
    img.className = 'scen-exit';
    c.appendChild(img);
    return c;
  }

  // a campaign story event card (cardboard version): drawn when its condition is met, not read in advance
  function plotCard(id) {
    const def = ZG.Scenarios.get(id), pc = def.plotCard;
    const c = el('div', 'scen-card plot-card');
    c.innerHTML = `<div class="scen-kicker">STORY EVENT · ${esc(def.name)}</div><div class="scen-name">${esc(pc.name)}</div><div class="scen-setup"><b>When:</b> ${esc(pc.when)}</div><div class="scen-brief">${esc(def.failText || '')}</div><div class="scen-short">${esc(pc.effect)}</div>`;
    return c;
  }

  // Text fitting: if the text does not fit on a particular font/system — shrink the font size,
  // and then the illustration height, until the "Chain" line is fully visible.
  function fit(c) {
    const run = () => {
      const t = c.querySelector('.card-text');
      if (!t || !t.clientHeight) return;
      let fs = parseFloat(getComputedStyle(t).fontSize);
      const art = c.querySelector('.card-art');
      for (let i = 0; i < 14 && t.scrollHeight > t.clientHeight + 1; i++) {
        if (fs > 8) { fs -= 0.5; t.style.fontSize = fs + 'px'; t.style.lineHeight = '1.07'; }
        else if (art && art.offsetHeight > 30) art.style.height = (art.offsetHeight - 6) + 'px';
        else break;
      }
    };
    if (c.isConnected) run(); else requestAnimationFrame(run);
  }

  ZG.CardView = { missionCard, eventCard, fit, card, cardBack, heroCard, talentCard, spawnCard, zombieCard, conditionCard, scenarioCard, plotCard, artURL, el, esc };
})(typeof globalThis !== 'undefined' ? globalThis : window);
