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

console.log(fails ? `\n${fails} проверок не прошло` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
