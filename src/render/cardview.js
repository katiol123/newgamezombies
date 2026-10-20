/*
 * CardView — DOM-вёрстка карт, героев, условий, сценариев, карт появления.
 * Одна и та же вёрстка используется в игре и на листах печати (print.html).
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
  Art.onChange = () => artCache.clear();

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>'); }

  // подсветка ключевых слов в тексте правил
  function rich(text) {
    return esc(text)
      .replace(/(\d+ урон[а-я]*)/g, '<b class="kw-dmg">$1</b>')
      .replace(/(Ближний бой|Дальний бой|дальность [0-9–-]+)/g, '<b class="kw">$1</b>')
      .replace(/(Шум \d)/g, '<b class="kw-noise">$1</b>')
      .replace(/(\+?\d+ ⚡|⚡)/g, '<b class="kw-energy">$1</b>')
      .replace(/(Блок[а-я]*|Ран[аыу]?)/g, '<b class="kw">$1</b>');
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
    const c = el('div', `card suit-${suit.id} kind-${def.kind || 'action'}${opts.small ? ' small' : ''}`);
    c.dataset.id = def.id;
    const head = el('div', 'card-head');
    if (def.cost != null) {
      const cost = el('div', 'card-cost');
      cost.innerHTML = `<span>${opts.cost != null ? opts.cost : def.cost}</span>`;
      if (opts.cost != null && opts.cost !== def.cost) cost.classList.add(opts.cost < def.cost ? 'cheaper' : 'pricier');
      head.appendChild(cost);
    }
    head.appendChild(el('div', 'card-name', esc(def.name)));
    if (suit.icon) head.appendChild(iconImg(suit.icon, 'card-suit', 32));
    c.appendChild(head);
    const art = el('div', 'card-art');
    const img = el('img');
    img.src = artURL(def.art || def.id, 160, 96, { suit: def.suit });
    img.alt = '';
    art.appendChild(img);
    c.appendChild(art);
    const typeLine = [def.type];
    if (def.hero) typeLine.push(ZG.Heroes.get(def.hero).name);
    if (def.loot) typeLine.push('Добыча');
    c.appendChild(el('div', 'card-type', esc(typeLine.join(' · '))));
    const body = el('div', 'card-text');
    body.innerHTML = rich(def.text);
    if (def.chainText) {
      const ch = el('div', 'card-chain');
      ch.innerHTML = `<span class="chain-tag" style="--suit:${suit.color}">Связка</span> ${rich(def.chainText)}`;
      body.appendChild(ch);
    }
    c.appendChild(body);
    const foot = el('div', 'card-foot');
    if (def.shield) {
      const s = el('div', 'card-shield');
      s.appendChild(iconImg('shieldIcon', '', 28));
      s.appendChild(el('span', '', String(def.shield + (opts.blockBonus || 0))));
      s.title = 'Щит: сбрось при атаке, чтобы отразить столько урона';
      foot.appendChild(s);
    }
    if (def.noise) {
      const n = el('div', 'card-noise');
      n.appendChild(iconImg('noiseIcon', '', 28));
      n.appendChild(el('span', '', String(def.noise)));
      n.title = 'Шум: поднимает Тревогу';
      foot.appendChild(n);
    }
    if (def.consumable) foot.appendChild(el('div', 'card-flag', 'РАСХОДНИК'));
    if (def.equip) foot.appendChild(el('div', 'card-flag', 'СНАРЯЖЕНИЕ'));
    c.appendChild(foot);
    c.appendChild(el('div', 'card-gloss'));
    return c;
  }

  function cardBack(kind) {
    const c = el('div', 'card card-back back-' + (kind || 'hero'));
    c.innerHTML = `<div class="back-inner"><div class="back-logo">МЁРТВЫЙ<br>КВАРТАЛ</div><div class="back-sub">${kind === 'loot' ? 'ДОБЫЧА' : kind === 'spawn' ? 'ПОЯВЛЕНИЕ' : 'ДЕЙСТВИЕ'}</div></div>`;
    return c;
  }

  function heroCard(id, opts) {
    opts = opts || {};
    const def = ZG.Heroes.get(id);
    const c = el('div', 'hero-card' + (opts.compact ? ' compact' : ''));
    c.style.setProperty('--hero', def.color);
    const portrait = el('div', 'hero-portrait');
    const img = el('img');
    img.src = artURL(def.art, 200, 200, {});
    portrait.appendChild(img);
    c.appendChild(portrait);
    const info = el('div', 'hero-info');
    info.innerHTML = `
      <div class="hero-role">${esc(def.role)}</div>
      <div class="hero-name">${esc(def.name)} <span>«${esc(def.nick)}»</span></div>
      <div class="hero-stats">
        <span title="Стойкость: сколько Ран выдержит">♥ ${def.hp}</span>
        <span title="Размер руки">🂠 ${def.hand}</span>
        <span title="Энергия за ход">⚡ ${def.energy}</span>
      </div>
      <div class="hero-ability"><b>${esc(def.ability)}.</b> ${rich(def.abilityText)}</div>
      ${opts.bio ? `<div class="hero-bio">${esc(def.bio)}</div>` : ''}
      ${opts.talents ? `<div class="hero-talents">${def.talents.map((tier, i) => `<div class="tier"><span class="tier-lv">Ур.${i + 2}</span>${tier.map((t) => { const td = ZG.Talents.get(t); return `<div class="talent"><b>${esc(td.name)}</b> ${esc(td.text)}</div>`; }).join('<i>или</i>')}</div>`).join('')}</div>` : ''}
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
      c.innerHTML = `<div class="spawn-title">СОБЫТИЕ</div><div class="spawn-event-name">${esc(def.name)}</div><div class="spawn-event-text">${esc(def.text)}</div>`;
      return c;
    }
    c.appendChild(el('div', 'spawn-title', 'ПОЯВЛЕНИЕ'));
    def.rows.forEach((row, i) => {
      const r = el('div', 'spawn-row');
      r.style.setProperty('--phase', ZG.PHASES[i].color);
      r.appendChild(el('div', 'spawn-phase', ZG.PHASES[i].name));
      const z = el('div', 'spawn-z');
      if (!row.length) z.appendChild(el('span', 'spawn-empty', 'тишина'));
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
    img.src = artURL(def.id === 'nest' ? 'z_nest' : 'zp_' + def.id, 96, 96, { t: 0 });
    c.appendChild(img);
    const info = el('div', 'zinfo');
    info.innerHTML = `<div class="zname">${esc(def.name)}</div>
      <div class="zstats"><span title="Здоровье">♥ ${def.hp}</span><span title="Урон">✊ ${def.dmg}</span><span title="Скорость">👣 ${def.speed}</span><span title="Опыт за убийство">★ ${def.xp}</span></div>
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

  function scenarioCard(id) {
    const def = ZG.Scenarios.get(id);
    const c = el('div', 'scen-card');
    c.innerHTML = `<div class="scen-kicker">ЗАДАНИЕ</div><div class="scen-name">${esc(def.name)}</div><div class="scen-brief">${esc(def.brief)}</div><div class="scen-short">${esc(def.short)}</div>`;
    const img = el('img');
    img.src = artURL(def.exitArt || 'exit_car', 64, 84, {});
    img.className = 'scen-exit';
    c.appendChild(img);
    return c;
  }

  ZG.CardView = { card, cardBack, heroCard, talentCard, spawnCard, zombieCard, conditionCard, scenarioCard, artURL, el, esc };
})(typeof globalThis !== 'undefined' ? globalThis : window);
