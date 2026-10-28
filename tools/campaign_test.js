#!/usr/bin/env node
// Проверки правил кампании (быстрые, детерминированные). node tools/campaign_test.js
const ZG = require('./load');
const E = ZG.Engine, C = ZG.Campaign;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// 1) перенос: уровень, травмы, экипировка, временные карты
{
  const c = C.create({ heroes: [{ id: 'boris' }, { id: 'lisa' }], seed: 't1' });
  const b = C.hero(c, 'boris');
  b.level = 2; b.xp = 5; b.talents = ['thick_skin']; b.injury = 2; b.morale = 0;
  b.equip.push({ key: 'kX', id: 'crowbar', worn: false });
  const opts = C.startMission(c, ['boris', 'lisa']); opts.quiet = true;
  const g = E.create(opts);
  const h = g.heroes[0];
  ok(h.level === 2 && h.xp === 5 && h.talents.includes('thick_skin'), 'уровень и таланты переносятся');
  ok(E.maxHp(g, h) === ZG.Heroes.get('boris').hp + 2 - 2, 'травмы снижают Стойкость (Толстая шкура +2, травмы −2)');
  const all = h.deck.concat(h.hand);
  ok(all.filter((u) => g.cards[u] === 'despair').length === 2, 'мораль 0 → два «Уныния» в колоде');
  ok(all.some((u) => g.cards[u] === 'crowbar') && Object.values(g.carried).includes('kX'), 'экипировка замешана в колоду и помечена');
}

// 2) Уныние: −1 ⚡ при приходе в руку и сброс в конце хода
{
  const g = E.create({ heroes: [{ id: 'boris' }], seed: 't2', quiet: true });
  const h = g.heroes[0];
  const u = E.newUid(g, 'c'); g.cards[u] = 'despair'; h.deck.unshift(u);
  h.hand.splice(0, 1).forEach((x) => h.discard.push(x)); // освободим место под добор
  E.act(g, { t: 'begin', hero: 0 });
  const base = ZG.Heroes.get('boris').energy;
  ok(h.hand.includes(u) && h.energy === base - 1, `Уныние в начале хода: ${h.energy} ⚡ из ${base}`);
  E.act(g, { t: 'end' });
  ok(!h.hand.includes(u) && h.discard.includes(u), 'Уныние ушло в сброс в конце хода');
}

// 3) Кураж: +2 карты, +1 ⚡, +1 урон
{
  const g = E.create({ heroes: [{ id: 'boris' }], seed: 't3', quiet: true });
  const h = g.heroes[0];
  E.act(g, { t: 'begin', hero: 0 });
  const u = E.newUid(g, 'c'); g.cards[u] = 'courage'; h.hand.push(u);
  const en = h.energy, hand = h.hand.length;
  ok(E.act(g, { t: 'play', card: u, target: null }) !== false, 'Кураж сыгран');
  ok(h.energy === en + 1 && h.hand.length === hand - 1 + 2 && g.turn.courage, 'Кураж: +1 ⚡, +2 карты, бонус к урону включён');
}

// 4) блуждающая угроза: на последнем закрытом тайле появляется без броска
{
  const g = E.create({ heroes: [{ id: 'boris' }], seed: 't4', quiet: true, fog: true, wanderers: ['turned_lisa'] });
  const hidden = g.revealed.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  hidden.slice(0, -1).forEach((ti) => { g.revealed[ti] = true; }); // все, кроме одного, открыты «тихо»
  const lastTi = hidden[hidden.length - 1];
  E.reveal(g, lastTi, 'тест');
  const z = g.zombies.find((x) => x.type === 'turned_lisa');
  ok(z && g.board.cells[z.pos].tile === lastTi && g.wanderers[0].out, 'обращённая Лиза появилась на последнем тайле');
  ok(z && z.awake === false, 'в режиме скрытности появляется бродячей');
}

// 5) повтор секретной миссии: опыт вместо награды
{
  const g = E.create({ heroes: [{ id: 'boris', carry: { missionsDone: ['m_butcher'] } }], seed: 't5', quiet: true });
  const h = g.heroes[0];
  h.mission = 'm_butcher'; h.ms.meleeKills = 99;
  const xp = h.xp, perks = h.perks.length;
  E.checkMissions(g);
  ok(h.missionDone && h.xp === xp + 2 && h.perks.length === perks, 'повторная миссия: +2 🎖 вместо награды');
}

// 6) поздний уровень: выбор из общих талантов убежища
{
  const g = E.create({ heroes: [{ id: 'boris', carry: { level: 3, xp: 17, talents: ['thick_skin', 'rock'] } }], seed: 't6', quiet: true, xpLevels: [4, 10, 18, 28] });
  const h = g.heroes[0];
  E.gainXp(g, h, 1);
  ok(h.level === 4 && g.pending && g.pending.type === 'talent' && g.pending.options.length === 2 && g.pending.options.every((id) => ZG.Talents.get(id).shelter), `4-й уровень: общие таланты ${g.pending && g.pending.options.join(',')}`);
}

// 7) износ: принесённая карта → «на грани»; повторно → бросок; найденная — целая
{
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't7' });
  const b = C.hero(c, 'boris');
  b.equip.push({ key: 'kA', id: 'crowbar', worn: false }, { key: 'kB', id: 'spear', worn: true });
  const opts = C.startMission(c, ['boris']); opts.quiet = true;
  const g = E.create(opts);
  const u = E.newUid(g, 'c'); g.cards[u] = 'bat'; g.heroes[0].hand.push(u); // «нашёл» биту
  g.result = { win: true, stars: 1, reason: 'тест' };
  C.finishMission(c, g);
  const all = b.chest.concat(b.junk);
  const a = all.find((x) => x.key === 'kA'), s = all.find((x) => x.key === 'kB'), bat = all.find((x) => x.id === 'bat');
  ok(a && a.worn, 'целая принесённая карта стала «на грани»');
  ok(bat && !bat.worn, 'найденная карта целая');
  ok(c.report.heroes.boris.lines.some((l) => l.includes('Самодельное копьё')), 'по изношенной карте был бросок (сломалась или уцелела)');
  ok(b.talons === 5 - 2, `талоны: 5 за звезду − 2 паёк = ${b.talons}`);
}

// 8) уникальные тайлы миссии: обязательные в игре и закрыты с начала, исключённых нет
{
  let bad = 0;
  for (let k = 0; k < 60; k++) {
    const g = E.create({ heroes: [{ id: 'boris' }], seed: 't8-' + k, quiet: true, fog: true, tileRules: { required: ['school'], exclude: ['market'] } });
    const ids = g.board.tiles.map((t) => t.id), si = ids.indexOf('school');
    if (si < 0 || ids.includes('market') || g.revealed[si]) bad++;
  }
  ok(!bad, 'обязательный тайл всегда в игре и закрыт, исключённого нет (60 раскладок)');
}

// 9) боссы миссии — блуждающие угрозы
{
  const ZGc = ZG.CAMPAIGN, keep = ZGc.chain[0];
  ZGc.chain[0] = { bosses: ['brute'], tiles: { required: ['school'] } };
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't9' });
  const opts = C.startMission(c);
  ok(opts.wanderers.includes('brute') && opts.tileRules.required[0] === 'school', 'описание миссии: босс и уникальный тайл передаются в партию');
  ZGc.chain[0] = keep;
}

// 10) уровень на последнем действии миссии: талант не теряется
{
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't10' });
  let opts = C.startMission(c); opts.quiet = true;
  let g = E.create(opts);
  const h = g.heroes[0];
  h.xp = 3; g.result = { win: true, stars: 1, reason: 'тест' };
  E.gainXp(g, h, 1);
  C.finishMission(c, g);
  const b = C.hero(c, 'boris');
  ok(b.level === 2 && b.talentQueue.length === 1, 'невыбранный талант сохранён в кампании');
  opts = C.startMission(c); opts.quiet = true;
  g = E.create(opts);
  ok(g.pending && g.pending.type === 'talent' && g.pending.hero === 0, 'и предлагается в начале следующей миссии');
  ok(C.finishMission(c, Object.assign(g, { result: { win: true, stars: 1 } })) && C.finishMission(c, g) === c.report && c.missionNo === 2, 'итоги не вносятся дважды');
}

// 11) уникальные карты в хламе не пропадают при выходе; стартовая карта новичка — не событие
{
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't11' });
  const b = C.hero(c, 'boris');
  b.junk.push({ key: 'kg', id: 'gift_map', worn: false }, { key: 'kc', id: 'crowbar', worn: false });
  C.startMission(c);
  ok(b.junk.length === 1 && b.junk[0].id === 'gift_map' && b.talons === 2, 'уникальная карта осталась в хламе, обычная продана');
  let bad = 0;
  for (let k = 0; k < 40; k++) {
    const c2 = C.create({ heroes: [{ id: 'boris' }], seed: 't11h' + k });
    C.hero(c2, 'boris').talons = 99;
    C.hire(c2, 'boris', 'lisa');
    if (ZG.Cards.get(C.hero(c2, 'lisa').equip[0].id).event) bad++;
  }
  ok(!bad, 'стартовая карта новичка никогда не событие');
}

// 12) босс-блуждающий появляется, даже если жетоны его типа кончились
{
  const g = E.create({ heroes: [{ id: 'boris' }], seed: 't12', quiet: true, fog: true, wanderers: ['brute'] });
  const open = g.board.cells.find((cl) => !E.hidden(g, cl.i) && cl.type === 'street').i;
  E.spawnZombie(g, 'brute', open, null, true, true); E.spawnZombie(g, 'brute', open, null, true, true);
  const hidden = g.revealed.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  hidden.slice(0, -1).forEach((ti) => { g.revealed[ti] = true; });
  E.reveal(g, hidden[hidden.length - 1], 'тест');
  ok(g.zombies.filter((z) => z.type === 'brute').length === 3, 'босс появился сверх лимита жетонов');
}

// 13) износ: шанс поломки — худший из двух владельцев (передача «Рукастому» не помогает)
{
  const rate = (startHandy, endHandy, give) => {
    let broke = 0;
    for (let k = 0; k < 400; k++) {
      const c = C.create({ heroes: [{ id: 'boris' }, { id: 'lisa' }], seed: 't13-' + k + startHandy + endHandy + give });
      const b = C.hero(c, 'boris'), l = C.hero(c, 'lisa');
      if (startHandy) b.talents.push('sh_handy');
      if (endHandy) l.talents.push('sh_handy');
      b.equip.push({ key: 'kw', id: 'crowbar', worn: true });
      const opts = C.startMission(c, ['boris', 'lisa']); opts.quiet = true;
      const g = E.create(opts);
      const gb = g.heroes[0], gl = g.heroes[1];
      const u = Object.keys(g.carried).find((x) => g.carried[x] === 'kw');
      if (give) { for (const pile of ['deck', 'hand', 'discard']) { const i = gb[pile].indexOf(u); if (i >= 0) gb[pile].splice(i, 1); } gl.hand.push(u); g.carriedHolders[u].push('lisa'); }
      g.result = { win: true, stars: 1 };
      C.finishMission(c, g);
      if (!C.hero(c, 'boris').chest.concat(C.hero(c, 'lisa').chest, b.junk, l.junk).some((it) => it.key === 'kw')) broke++;
    }
    return broke / 400;
  };
  const own = rate(true, false, false), toHandy = rate(false, true, true), fromHandy = rate(true, false, true);
  ok(own < 0.33, `Рукастый донёс сам: ломается ${Math.round(own * 100)}% (≈25%)`);
  ok(toHandy > 0.42, `передал Рукастому в бою: ${Math.round(toHandy * 100)}% (≈50%)`);
  ok(fromHandy > 0.42, `Рукастый взял, отдал в бою другому: ${Math.round(fromHandy * 100)}% (≈50%)`);
}

// 14) передача действием «Передать» и обратно: держатели запоминаются, шанс — худший
{
  const c = C.create({ heroes: [{ id: 'boris' }, { id: 'lisa' }], seed: 't14' });
  C.hero(c, 'boris').talents.push('sh_handy');
  C.hero(c, 'boris').equip.push({ key: 'kq', id: 'crowbar', worn: true });
  const opts = C.startMission(c, ['boris', 'lisa']); opts.quiet = true;
  const g = E.create(opts);
  const u = Object.keys(g.carried).find((x) => g.carried[x] === 'kq');
  const gb = g.heroes[0];
  for (const pile of ['deck', 'discard']) { const i = gb[pile].indexOf(u); if (i >= 0) { gb[pile].splice(i, 1); gb.hand.push(u); } }
  E.act(g, { t: 'begin', hero: 0 });
  const okGive = E.act(g, { t: 'give', card: u, hero: 1 });
  ok(okGive && g.carriedHolders[u].join() === 'boris,lisa', `передача записала держателя: ${g.carriedHolders[u]}`);
}

// 15) Заражения тоже переносятся как потерянная Стойкость
{
  const c = C.create({ heroes: [{ id: 'boris' }], seed: 't15' });
  const opts = C.startMission(c); opts.quiet = true;
  const g = E.create(opts);
  const h = g.heroes[0];
  ['wound', 'infection', 'infection'].forEach((id) => { const u = E.newUid(g, 'c'); g.cards[u] = id; h.discard.push(u); });
  g.result = { win: true, stars: 1 };
  C.finishMission(c, g);
  ok(C.hero(c, 'boris').injury === 3 - 1, `1 Рана + 2 Заражения − паёк = травмы ${C.hero(c, 'boris').injury}`);
}

// 16) ИИ сам раскладывает карты: лучшее — в экипировку, ценное — в сундук, мелочь — в хлам
{
  const c = C.create({ heroes: [{ id: 'boris', ai: true }], seed: 't16' });
  const b = C.hero(c, 'boris');
  ['chocolate', 'katana', 'brick', 'medkit', 'bat', 'crowbar', 'spear', 'vest', 'energy'].forEach((id, i) => b.chest.push({ key: 'a' + i, id, worn: id === 'medkit' }));
  C.autoManage(c, 'boris');
  ok(b.equip.map((x) => x.id).join() === 'katana,bat,vest' || b.equip.length === 3, `экипировка: ${b.equip.map((x) => x.id)}`);
  ok(b.chest.every((x) => C.isValuable(x)) && b.junk.every((x) => !C.isValuable(x) || b.chest.length >= C.chestCap(b)), `сундук: ${b.chest.map((x) => x.id)} · хлам: ${b.junk.map((x) => x.id)}`);
  ok(b.junk.some((x) => x.id === 'chocolate') && !b.equip.some((x) => x.id === 'medkit'), 'шоколад — в хлам, изношенная аптечка не вытесняет целые карты');
}

// 17) отчаяние: при низкой Стойкости ИИ берёт в поход и мелочь вместо продажи
{
  const c = C.create({ heroes: [{ id: 'lisa', ai: true }], seed: 't17' });
  const l = C.hero(c, 'lisa');
  ['katana', 'chocolate', 'bandage_roll'].forEach((id, i) => l.chest.push({ key: 'd' + i, id, worn: false }));
  C.autoManage(c, 'lisa');
  ok(l.equip.length === 1 && l.junk.length === 2, `здорова: в поход только ценное (${l.equip.map((x) => x.id)}), мелочь в хлам`);
  l.injury = 2; // 2 из 4
  C.autoManage(c, 'lisa');
  ok(l.equip.length === 3 && !l.junk.length && l.equip[1].id === 'bandage_roll', `ранена: берёт всё, лечение вперёд (${l.equip.map((x) => x.id)})`);
}

// 18) миссия 1: поле 3×2, только Шатуны и Бегуны, 1 зомби с карты появления
{
  const g = E.create({ levelId: 'camp_m1', heroes: [{ id: 'boris' }], seed: 't18', quiet: true });
  const open = g.board.cells.find((cl) => !E.hidden(g, cl.i) && cl.type === 'street').i;
  const a = E.spawnZombie(g, 'brute', open, null, true, true), b = E.spawnZombie(g, 'hound', open, null, true, true);
  ok(g.board.tiles.length === 6, 'поле из 6 тайлов');
  ok(a && a.type === 'walker' && b && b.type === 'runner', `сильные заменены: Громила→${a && a.type}, Ищейка→${b && b.type}`);
  ok(g.zombies.every((z) => ['walker', 'runner', 'nest'].includes(z.type)), 'на поле только слабые (и гнёзда задания)');
}

// 19) миссия 2: автобаза на краю, фургон — выход, Толстяки и 2 стаи притаились, люков нет
{
  const c = C.create({ heroes: [{ id: 'boris' }, { id: 'lisa' }], seed: 't19' });
  c.missionNo = 1;
  const opts = C.startMission(c); opts.quiet = true;
  const g = E.create(opts);
  const ut = g.board.tiles.findIndex((t) => t.id === 'autobase');
  ok(ut >= 0 && g.board.tiles[ut].tx === 2 && !g.revealed[ut] && g.board.cells[g.exit].tile === ut, 'автобаза в дальнем столбце, закрыта, фургон на ней');
  ok(!g.spawnPoints.length && g.scenarioId === 'autobase', 'люков нет, задание «Автобаза»');
  const lurk = g.zombies.filter((z) => z.lurk && !z.awake);
  ok(lurk.filter((z) => z.type === 'fatso').length === 2 && lurk.length === 2 + 10, `притаились 2 Толстяка и 2 стаи по 5: ${lurk.length}`);
  ok(g.stackTiles.length === 4 && g.hideFogCounts, 'на 4 тайлах карты «Стая/Пусто», счётчики скрыты');
}

// 20) ИИ чинит ценные изношенные карты, если есть Мастерская и талоны сверх запаса; мелочь не чинит
{
  const c = C.create({ heroes: [{ id: 'boris', ai: true }], seed: 't20' });
  const b = C.hero(c, 'boris');
  b.chest.push({ key: 'r1', id: 'katana', worn: true }, { key: 'r2', id: 'chocolate', worn: true }, { key: 'r3', id: 'bat', worn: true });
  b.talons = 10;
  C.autoManage(c, 'boris');
  ok([b.equip, b.chest, b.junk].flat().every((it) => it.worn), 'без Мастерской ничего не чинит');
  b.buildings.push('workshop');
  C.autoManage(c, 'boris');
  const all = [b.equip, b.chest, b.junk].flat();
  ok(!all.find((it) => it.id === 'katana').worn && !all.find((it) => it.id === 'bat').worn && all.find((it) => it.id === 'chocolate').worn && b.talons === 10 - 3 - 2, `починил катану и биту, шоколад нет; талонов ${b.talons}`);
  const c2 = C.create({ heroes: [{ id: 'boris', ai: true }], seed: 't20b' });
  const b2 = C.hero(c2, 'boris'); b2.buildings.push('workshop'); b2.talons = 3; b2.chest.push({ key: 'q', id: 'katana', worn: true });
  C.autoManage(c2, 'boris');
  ok(b2.equip[0].worn && b2.talons === 3, 'не тратит последние талоны, нужные на паёк');
}

// 21) Странствующий торговец: только перед миссией 7; товар без лимита; ИИ покупает то, что ему подходит, и оставляет запас
{
  const c = C.create({ heroes: [{ id: 'marina', ai: true }, { id: 'boris', ai: true }, { id: 'viktor' }], seed: 't21' });
  c.missionNo = 5;
  ok(!C.trader(c), 'перед миссией 6 торговца нет');
  c.missionNo = 6;
  const tr = C.trader(c);
  ok(tr && tr.stock.length === 3 && tr.stock.every((w) => ZG.Cards.get(w.id).rarity === 'unique' && ZG.Cards.get(w.id).equip), 'перед миссией 7 — торговец с 3 уникальными картами снаряжения');
  ok(tr.stock.every((w) => !Object.keys(ZG.Levels.get('camp_m7').loot).includes(w.id) && !Object.keys(ZG.Levels.get('outskirts').loot).includes(w.id)), 'товара нет в колодах добычи');
  const m = C.hero(c, 'marina'), b = C.hero(c, 'boris'), v = C.hero(c, 'viktor');
  m.talons = 30; b.talons = 30;
  C.autoManage(c, 'marina'); C.autoManage(c, 'boris');
  const owns = (h, id) => h.equip.concat(h.chest, h.junk).filter((it) => it.id === id).length;
  ok(owns(m, 'tr_medbag') === 1 && owns(m, 'tr_gasmask') === 0 && owns(m, 'tr_binoculars') === 0, 'Марина (ИИ, бережливая) берёт только самое нужное — сумку санитара');
  ok(owns(b, 'tr_gasmask') === 0 && owns(b, 'tr_medbag') === 0, 'Борис (ИИ) противогаз не берёт — он и так почти не заражается');
  C.autoManage(c, 'marina');
  ok(owns(m, 'tr_medbag') === 1, 'повторная раскладка ИИ не скупает дубли');
  v.talons = 21;
  ok(!C.buy(c, 'viktor', 'tr_binoculars') && !C.buy(c, 'viktor', 'tr_binoculars') && owns(v, 'tr_binoculars') === 2 && v.talons === 5, 'игрок покупает сколько угодно экземпляров одной карты');
  ok(C.buy(c, 'viktor', 'tr_gasmask') === 'Не хватает талонов.', 'без талонов — отказ');
  ok(C.price('tr_binoculars') == null, 'товар торговца не продаётся');
  const c2 = C.create({ heroes: [{ id: 'marina', ai: true }], seed: 't21b' }); c2.missionNo = 6;
  const m2 = C.hero(c2, 'marina'); m2.talons = 11;
  C.autoManage(c2, 'marina');
  ok(m2.talons === 11, 'ИИ не тратит талоны, если после покупки не хватит на паёк');
  c.status = 'mission';
  ok(!C.trader(c), 'в походе торговца нет');
  c.status = 'ready'; c.missionNo = 7;
  ok(!C.trader(c), 'после миссии 7 торговец не возвращается');
}

// 22) Сейф и Ценности: стопка 4/1/1, взлом 2 ⚡ и шум, звон +1, выпадение только находок, продажа 2–8
{
  const g = E.create({ seed: 't22', heroes: [{ id: 'boris' }, { id: 'lisa' }], quiet: true });
  const h = g.heroes[0];
  g.zombies.length = 0;
  const sf = E.placeSafe(g, h.pos, 'Сейф');
  ok(sf.deck.filter((x) => x === 'valuable').length === 4 && sf.deck.includes('empty') && sf.deck.includes('siren'), 'стопка сейфа: 4 Ценности, Пусто, Сирена');
  sf.deck = ['valuable', 'empty', 'siren'];
  E.act(g, { t: 'begin', hero: 0 }); h.energy = 6;
  const a0 = g.alarm;
  ok(E.act(g, { t: 'safe' }) && h.hand.some((u) => g.cards[u] === 'valuable') && h.energy === 4 && g.alarm > a0, 'взлом: Ценность в руку, −2 ⚡, шум поднял Тревогу');
  const a1 = g.alarm;
  E.act(g, { t: 'safe' });
  ok(g.alarm - a1 === E.SAFE_NOISE + 1, 'Ценность звенит: Шум взлома +1');
  h.energy = 6; E.act(g, { t: 'safe' });
  ok(sf.jammed && !E.legal(g).some((a) => a.t === 'safe'), 'сирена — сейф заклинило, взлом недоступен');
  ok(h.hand.filter((u) => g.cards[u] === 'valuable').length === 0 && g.drops.some((d) => d.pos === h.pos && d.card === 'valuable'), 'сирена: Ценность выпала из руки в зону');
  E.giveCard(g, h, 'valuable');
  ok(E.blockValue(g, h, h.hand.find((u) => g.cards[u] === 'valuable')) === 0, 'Ценностью нельзя блокировать');
  // падение: выпадают только находки (базовые карты остаются)
  const g2 = E.create({ seed: 't22b', heroes: [{ id: 'boris' }, { id: 'lisa' }], quiet: true });
  const b = g2.heroes[0];
  E.giveCard(g2, b, 'valuable'); E.giveCard(g2, b, 'medkit');
  const before = g2.drops.length;
  for (let i = 0; i < 20; i++) { const u = E.newUid(g2, 'w'); g2.cards[u] = 'wound'; b.deck.push(u); }
  E.turnHero(g2, b);
  const dropped = g2.drops.slice(before).map((d) => d.card);
  ok(dropped.length === 2 && dropped.every((id) => ZG.Cards.get(id).loot || ZG.Cards.get(id).campaignOnly), `при обращении выпали 2 находки: ${dropped.join(', ')}`);
  // кампания: продажа по неизвестной цене, ИИ сдаёт в хлам
  const c = C.create({ heroes: [{ id: 'marina', ai: true }], seed: 't22c' });
  const m = C.hero(c, 'marina');
  m.chest.push({ key: 'v1', id: 'valuable', worn: false }, { key: 'v2', id: 'valuable', worn: false });
  C.autoManage(c, 'marina');
  ok(m.junk.filter((it) => it.id === 'valuable').length === 2, 'ИИ кладёт Ценности в хлам');
  const t0 = m.talons;
  ok(!C.sell(c, 'marina', 'junk', m.junk.findIndex((it) => it.id === 'valuable')) && m.talons - t0 >= 2 && m.talons - t0 <= 8, `продажа Ценности: +${m.talons - t0} 🎫 (2–8)`);
  const t1 = m.talons; C.startMission(c);
  ok(m.talons - t1 >= 2 && m.talons - t1 <= 8 && !m.junk.some((it) => it.id === 'valuable'), 'при выходе Ценность из хлама продана');
}

// 23) Скрытые характеры ИИ: честный меняет «Предателя» и не засчитывает его; транжира и копуша у торговца
{
  const g = E.create({ seed: 't23', heroes: [{ id: 'boris', ai: true }, { id: 'lisa', ai: true }], quiet: true });
  const b = g.heroes[0];
  b.mission = 'm_traitor'; b.ms = {}; b.missionRedrawn = false; b.missionKept = false;
  g.active = null; ZG.Bot.playTurn(g, { depth2: false });
  ok(b.mission !== 'm_traitor', `честный Борис сменил карту «Предатель» (теперь ${b.mission})`);
  const g2 = E.create({ seed: 't23b', heroes: [{ id: 'viktor', ai: true }, { id: 'lisa', ai: true }], quiet: true });
  const v = g2.heroes[0], l = g2.heroes[1];
  v.mission = 'm_traitor'; v.ms = {};
  g2.zombies.length = 0;
  const z = E.spawnZombie(g2, 'walker', l.pos, null, true, true, true); z.awake = true; z.wokenBy = 0; z.trail = l.pos;
  v.pos = g2.board.cells.find((cc) => cc.type === 'street' && E.distV(g2, l.pos)[cc.i] > 4).i;
  E.act(g2, { t: 'begin', hero: 0 }); E.act(g2, { t: 'end' }); E.act(g2, { t: 'begin', hero: 1 }); E.act(g2, { t: 'end' });
  ZG.Bot.autoPending(g2);
  ok(!(v.ms.betrayals > 0), 'честному ИИ натравленный зомби предательство не засчитывает');
  const c = C.create({ heroes: [{ id: 'lisa', ai: true }, { id: 'marina', ai: true }], seed: 't23c' });
  c.missionNo = 6;
  const li = C.hero(c, 'lisa'), ma = C.hero(c, 'marina');
  li.talons = 40; ma.talons = 40;
  C.autoManage(c, 'lisa'); C.autoManage(c, 'marina');
  const buys = (id) => (c.traderLog || []).filter((x) => x.hero === id).length;
  ok(buys('lisa') >= 2 && buys('marina') === 1, `транжира Лиза купила ${buys('lisa')}, копуша Марина — ${buys('marina')}`);
  C.autoManage(c, 'lisa');
  ok(buys('lisa') <= 3, 'транжира не скупает прилавок раз за разом (не больше 3 за заход)');
}

console.log(fails ? `\n${fails} проверок не прошло` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
