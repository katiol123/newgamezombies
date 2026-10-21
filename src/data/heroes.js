/*
 * Герои и их таланты.
 * Пассивные способности и таланты описываются через mods/hooks (см. core.js),
 * поэтому новый герой не требует правок движка, если использует существующие ключи.
 *
 * Известные ключи модификаторов:
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
      id: 'boris', name: 'Борис', nick: 'Кувалда', role: 'Танк', color: '#c0392b',
      hp: 7, hand: 4, energy: 3,
      bio: 'Прораб со стройки на окраине. Медленный, упрямый, непробиваемый.',
      ability: 'Живой щит', abilityText: 'Зомби в его зоне атакуют только Бориса. Каждая карта, сброшенная им для защиты, блокирует +1. Толстая шкура: Заражение у него — только на «1».',
      deck: STARTER.concat(['sledge', 'ram', 'stance', 'roar']),
      talents: [['thick_skin', 'heavy_hand'], ['rock', 'retaliate']],
      mods: { taunt: 1, blockPerCard: 1, infectDie: -1 },
      art: 'hero_boris',
    },
    {
      id: 'marina', name: 'Марина', nick: 'Скальпель', role: 'Медик', color: '#e8e8e8',
      hp: 6, hand: 5, energy: 3,
      bio: 'Хирург районной больницы. Ушла с последней смены с полной сумкой.',
      ability: 'Полевой врач', abilityText: 'Раз за ход, 1 ⚡, герою в её зоне (можно себе): убрать 1 Рану ИЛИ обеззаразить: все его Заражения (в руке, колоде и сбросе) → Раны.',
      deck: STARTER.concat(['scalpel', 'bandage', 'adrenaline', 'coldcalc']),
      talents: [['sterile', 'steady'], ['second_wind', 'triage']],
      mods: { healAction: 1 },
      art: 'hero_marina',
    },
    {
      id: 'lisa', name: 'Лиза', nick: 'Тень', role: 'Разведчица', color: '#2e8b57',
      hp: 4, hand: 5, energy: 3,
      bio: 'Курьер и паркурщица. Знает каждую крышу квартала.',
      ability: 'Паркур', abilityText: 'Первый за ход выход из зоны с зомби ей ничего не стоит (Хватка не действует). Перелезает баррикады бесплатно.',
      deck: STARTER.concat(['knife', 'lure', 'rooftops', 'vanish']),
      talents: [['quick_fingers', 'sprint'], ['backstab', 'ghost']],
      mods: { freeEscape: (g) => (g.turn && g.turn.escaped ? 0 : 1), climb: 1 },
      art: 'hero_lisa',
    },
    {
      id: 'viktor', name: 'Виктор', nick: 'Гром', role: 'Стрелок', color: '#2d6fb5',
      hp: 6, hand: 5, energy: 3,
      bio: 'Участковый. Патронов мало, выдержки много.',
      ability: 'Выучка', abilityText: '+1 к дальности его дальних атак. Первый выстрел за ход — на 1 Шум тише.',
      deck: STARTER.concat(['sawnoff', 'pm', 'suppress', 'buttstroke']),
      talents: [['silencer', 'marksman'], ['quickdraw', 'ammo']],
      mods: { rangeBonus: 1, firstShotQuiet: 1 },
      art: 'hero_viktor',
    },
    {
      id: 'kira', name: 'Кира', nick: 'Ключ', role: 'Механик', color: '#d4a017',
      hp: 6, hand: 5, energy: 3,
      bio: 'Чинит всё, что ездит, и ломает всё, что ходит.',
      ability: 'Инженер', abilityText: 'Базовое действие «Баррикада» стоит ей 1 ⚡ вместо 2. Её баррикады прочнее на 1, ловушки — на 1 урон сильнее.',
      deck: STARTER.concat(['wrench', 'tripwire', 'improvise', 'weld']),
      talents: [['reinforce', 'shrapnel'], ['tinkerer', 'gadgets']],
      mods: { barricadeCost: -1, barricadeHp: 1, trapBonus: 1 },
      art: 'hero_kira',
    },
    {
      id: 'sava', name: 'Сава', nick: 'Сыч', role: 'Диверсант', color: '#6b5b95',
      hp: 5, hand: 5, energy: 3,
      bio: 'Бывший охотник. Ходит так тихо, что его не слышат даже мёртвые.',
      ability: 'Бесшумный', abilityText: 'Бродячие зомби не замечают Саву издалека — только из своей или соседней зоны. Двери под ним не скрипят.',
      deck: STARTER.concat(['silent_step', 'shiv', 'pebble', 'lurk']),
      talents: [['sharp', 'softfoot'], ['decoy', 'assassin']],
      mods: { stealthy: 1, silentDoors: 1 },
      art: 'hero_sava',
    },
    {
      id: 'gosha', name: 'Гоша', nick: 'Гудок', role: 'Дорожник', color: '#e67e22',
      hp: 7, hand: 5, energy: 3,
      bio: 'Бригадир ремонтной бригады. Тихо не умеет, зато умеет закатать в асфальт что угодно.',
      ability: 'Шумный и Заглушка', abilityText: 'Шумный: бродячие замечают Гошу за 2 зоны даже сквозь стены, укрытие ему не помогает, двери под ним скрипят на 2 зоны. Заглушка (1 ⚡, действие): в зоне с люком — люк молчит 2 раунда. Шум 1.',
      deck: STARTER.concat(['jackhammer', 'generator', 'cones', 'rebar']),
      talents: [['weld_seam', 'workwear'], ['foreman', 'overtime']],
      mods: { loud: 1, plugAction: 1 },
      art: 'hero_gosha',
    },
  ]);

  // ------------------------------------------------------------- Таланты ---
  // Уровень 2 — при 4 Опыта, уровень 3 — при 10 Опыта. Из пары выбирается один.
  const isMeleeCtx = (ctx) => ctx && ctx.kind === 'melee';
  ZG.Talents.addAll([
    // Борис
    { id: 'thick_skin', name: 'Толстая шкура', text: '+2 к Стойкости (можно пережить больше Ран).', mods: { hp: 2 } },
    { id: 'heavy_hand', name: 'Тяжёлая рука', text: '+1 урон всем твоим атакам ближнего боя.', mods: { meleeBonus: (g, h, ctx) => (isMeleeCtx(ctx) ? 1 : 0) } },
    { id: 'rock', name: 'Скала', text: '+1 к размеру руки.', mods: { handSize: 1 } },
    {
      id: 'retaliate', name: 'Ответный удар', text: 'Если в фазу зомби ты отразил весь урон — 2 урона одному зомби в твоей зоне.',
      hooks: { afterBlock(g, h, ctx) { if (ctx.taken === 0 && ctx.incoming > 0) ctx.E.retaliate(g, h, 2); } },
    },
    // Марина
    { id: 'sterile', name: 'Стерильность', text: 'Любое твоё лечение убирает на 1 Рану больше.', mods: { healBonus: 1 } },
    { id: 'steady', name: 'Конвейер', text: '«Полевого врача» можно применять дважды за ход.', mods: { healAction: 1 } },
    {
      id: 'second_wind', name: 'Второе дыхание', text: 'Раз за партию: когда герой в твоей зоне должен пасть, вместо этого он убирает 2 Раны.',
      mods: { secondWind: 1 },
    },
    {
      id: 'triage', name: 'Сортировка', text: 'В начале хода: +1 ⚡ за каждого раненого героя в твоей зоне (макс. +2).',
      mods: { energy: (g, h) => Math.min(2, g.heroes.filter((o) => o.onBoard && o.pos === h.pos && ZG.Engine.woundCount(g, o) > 0).length) },
    },
    // Лиза
    { id: 'quick_fingers', name: 'Ловкие пальцы', text: 'Обыск: тяни на 1 карту добычи больше. Первый Обыск за ход — 0 ⚡.', mods: { searchDraw: 1, freeFirstSearch: 1 } },
    {
      id: 'sprint', name: 'Спринт', text: '+1 ⚡ в начале хода, если в твоей зоне нет зомби.',
      mods: { energy: (g, h) => (ZG.Engine.zombiesAt(g, h.pos).length === 0 ? 1 : 0) },
    },
    {
      id: 'backstab', name: 'Удар в спину', text: 'Первая атака ближнего боя за ход: +2 урона.',
      mods: { meleeBonus: (g, h, ctx) => (isMeleeCtx(ctx) && !g.turn.meleeDone ? 2 : 0) },
    },
    {
      id: 'ghost', name: 'Призрак', text: 'Шатуны и Бегуны не атакуют тебя.',
      mods: { immuneAttack: (g, h, ctx) => (ctx && (ctx.type === 'walker' || ctx.type === 'runner') ? 1 : 0) },
    },
    // Виктор
    { id: 'silencer', name: 'Глушитель', text: 'Все твои выстрелы −1 Шум.', mods: { shotNoise: -1 } },
    { id: 'marksman', name: 'Пристрелка', text: '+1 урон всем твоим дальним атакам.', mods: { rangedBonus: (g, h, ctx) => (ctx && ctx.kind === 'ranged' ? 1 : 0) } },
    {
      id: 'quickdraw', name: 'Быстрая рука', text: 'Первая карта дальнего боя за ход стоит на 1 ⚡ меньше.',
      mods: { costDelta: (g, h, ctx) => (ctx && ctx.def.tags && ctx.def.tags.includes('ranged') && !g.turn.rangedPlayed ? -1 : 0) },
    },
    {
      id: 'ammo', name: 'Добивание', text: 'Убив зомби дальней атакой, возьми 1 карту (раз за ход).',
      hooks: { kill(g, h, ctx) { if (ctx.kind === 'ranged' && g.active === h.idx && g.turn && !g.turn.finisher) { g.turn.finisher = true; ctx.E.drawFor(g, h, 1); } } },
    },
    // Кира
    { id: 'reinforce', name: 'Армирование', text: 'Твои баррикады получают +2 прочности.', mods: { barricadeHp: 2 } },
    { id: 'shrapnel', name: 'Шрапнель', text: 'Твои ловушки наносят +1 урон.', mods: { trapBonus: 1 } },
    { id: 'tinkerer', name: 'Сигнализация', text: 'Твои ловушки работают как Приманки: зомби идут к ним, как к героям.', mods: { trapLure: 1 } },
    {
      id: 'gadgets', name: 'Самоделки', text: 'Первая карта масти Расчёт за ход стоит на 1 ⚡ меньше.',
      mods: { costDelta: (g, h, ctx) => (ctx && ctx.def.suit === 'mind' && !g.turn.mindPlayed ? -1 : 0) },
    },
    // Сава
    { id: 'sharp', name: 'Заточка', text: '«Нож в спину» наносит охотникам на 1 урон больше.', mods: { meleeBonus: (g, h, ctx) => (ctx && ctx.def && ctx.def.id === 'shiv' ? 1 : 0) } },
    { id: 'softfoot', name: 'Тихоход', text: 'Первый «Ход» за ход — бесплатно.', mods: { freeFirstMove: 1 } },
    { id: 'decoy', name: 'Мастер отвлечения', text: '«Камешек» слышен на 2 зоны дальше и даёт 1 карту.', mods: { pebblePlus: 1 } },
    {
      id: 'assassin', name: 'Убийца из тени', text: 'Убив бродячего зомби «Ножом в спину», получи +1 ⚡ (раз за ход).',
      hooks: { kill(g, h, ctx) { if (ctx.kind === 'silent' && g.active === h.idx && g.turn && !g.turn.assassin) { g.turn.assassin = true; h.energy += 1; } } },
    },
    // Гоша
    { id: 'weld_seam', name: 'Сварной шов', text: 'Заглушка держит на 1 раунд дольше.', mods: { plugRounds: 1 } },
    { id: 'workwear', name: 'Спецовка', text: '+1 Стойкость.', mods: { hp: 1 } },
    { id: 'foreman', name: 'Бригадир', text: 'После Заглушки возьми 1 карту и получи 1 Блок.', mods: { plugBonus: 1 } },
    { id: 'overtime', name: 'Сверхурочные', text: '«Отбойный молоток» стоит 1 ⚡.', mods: { costDelta: (g, h, ctx) => (ctx && ctx.def && ctx.def.id === 'jackhammer' ? -1 : 0) } },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
