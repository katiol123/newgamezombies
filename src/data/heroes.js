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
      id: 'boris', pic: 'art/heroes/boris.jpg', face: 'art/heroes/boris_face.jpg', turnedPic: 'art/heroes/boris_turned.jpg', turnedFace: 'art/heroes/boris_turned_face.jpg', name: 'Борис', nick: 'Кувалда', role: 'Танк', color: '#c0392b',
      hp: 7, hand: 4, energy: 3,
      bio: 'Прораб со стройки на окраине. Медленный, упрямый, непробиваемый.',
      ability: 'Живой щит', abilityText: 'Зомби в его зоне атакуют только Бориса. Каждая карта, сброшенная им для защиты, блокирует +1, и ещё 1 урон за фазу он держит сам. Заражение у него — только на «1».',
      deck: STARTER.concat(['sledge', 'ram', 'stance', 'roar']),
      talents: [['thick_skin', 'heavy_hand'], ['rock', 'retaliate']],
      mods: { taunt: 1, blockPerCard: 1, infectDie: -1, autoBlock: 1 },
      art: 'hero_boris',
    },
    {
      id: 'marina', pic: 'art/heroes/marina.jpg', face: 'art/heroes/marina_face.jpg', turnedPic: 'art/heroes/marina_turned.jpg', turnedFace: 'art/heroes/marina_turned_face.jpg', name: 'Марина', nick: 'Скальпель', role: 'Медик', color: '#e8e8e8',
      hp: 6, hand: 5, energy: 3,
      bio: 'Хирург районной больницы. Ушла с последней смены с полной сумкой.',
      ability: 'Полевой врач', abilityText: 'Раз за ход, 1 ⚡, герою в её зоне (можно себе): убрать 1 Рану ИЛИ обеззаразить: все его Заражения (в руке, колоде и сбросе) → Раны.',
      deck: STARTER.concat(['scalpel', 'bandage', 'adrenaline', 'coldcalc']),
      talents: [['sterile', 'steady'], ['second_wind', 'triage']],
      mods: { healAction: 1 },
      art: 'hero_marina',
    },
    {
      id: 'lisa', pic: 'art/heroes/lisa.jpg', face: 'art/heroes/lisa_face.jpg', turnedPic: 'art/heroes/lisa_turned.jpg', turnedFace: 'art/heroes/lisa_turned_face.jpg', name: 'Лиза', nick: 'Тень', role: 'Разведчица', color: '#2e8b57',
      hp: 4, hand: 4, energy: 3,
      bio: 'Курьер и паркурщица. Знает каждую крышу квартала.',
      ability: 'Паркур', abilityText: 'Первый за ход выход из зоны с зомби ей ничего не стоит (Хватка не действует). Перелезает баррикады бесплатно.',
      deck: STARTER.concat(['knife', 'lure', 'rooftops', 'vanish']),
      talents: [['quick_fingers', 'sprint'], ['backstab', 'ghost']],
      mods: { freeEscape: (g) => (g.turn && g.turn.escaped ? 0 : 1), climb: 1 },
      art: 'hero_lisa',
    },
    {
      id: 'viktor', pic: 'art/heroes/viktor.jpg', face: 'art/heroes/viktor_face.jpg', turnedPic: 'art/heroes/viktor_turned.jpg', turnedFace: 'art/heroes/viktor_turned_face.jpg', name: 'Виктор', nick: 'Гром', role: 'Стрелок', color: '#2d6fb5',
      hp: 6, hand: 5, energy: 3,
      bio: 'Участковый. Патронов мало, выдержки много.',
      ability: 'Выучка', abilityText: '+1 к дальности его дальних атак. Первый выстрел за ход — на 1 Шум тише.',
      deck: STARTER.concat(['sawnoff', 'pm', 'suppress', 'buttstroke']),
      talents: [['silencer', 'marksman'], ['quickdraw', 'ammo']],
      mods: { rangeBonus: 1, firstShotQuiet: 1 },
      art: 'hero_viktor',
    },
    {
      id: 'kira', pic: 'art/heroes/kira.jpg', face: 'art/heroes/kira_face.jpg', turnedPic: 'art/heroes/kira_turned.jpg', turnedFace: 'art/heroes/kira_turned_face.jpg', name: 'Кира', nick: 'Ключ', role: 'Механик', color: '#d4a017',
      hp: 6, hand: 5, energy: 3,
      bio: 'Чинит всё, что ездит, и ломает всё, что ходит.',
      ability: 'Инженер', abilityText: 'Базовое действие «Баррикада» стоит ей 1 ⚡ вместо 2. Её баррикады прочнее на 1, ловушки — на 1 урон сильнее.',
      deck: STARTER.concat(['wrench', 'tripwire', 'improvise', 'weld']),
      talents: [['reinforce', 'shrapnel'], ['tinkerer', 'gadgets']],
      mods: { barricadeCost: -1, barricadeHp: 1, trapBonus: 1 },
      art: 'hero_kira',
    },
    {
      id: 'sava', pic: 'art/heroes/sava.jpg', face: 'art/heroes/sava_face.jpg', turnedPic: 'art/heroes/sava_turned.jpg', turnedFace: 'art/heroes/sava_turned_face.jpg', name: 'Сава', nick: 'Сыч', role: 'Диверсант', color: '#6b5b95',
      hp: 4, hand: 5, energy: 3,
      bio: 'Бывший охотник. Ходит так тихо, что его не слышат даже мёртвые.',
      ability: 'Бесшумный', abilityText: 'Бродячие зомби не замечают Саву издалека — только из своей или соседней зоны. Двери под ним не скрипят.',
      deck: STARTER.concat(['silent_step', 'shiv', 'pebble', 'lurk']),
      talents: [['sharp', 'softfoot'], ['decoy', 'assassin']],
      mods: { stealthy: 1, silentDoors: 1 },
      art: 'hero_sava',
    },
    {
      id: 'gosha', pic: 'art/heroes/gosha.jpg', face: 'art/heroes/gosha_face.jpg', turnedPic: 'art/heroes/gosha_turned.jpg', turnedFace: 'art/heroes/gosha_turned_face.jpg', name: 'Гоша', nick: 'Гудок', role: 'Дорожник', color: '#e67e22',
      hp: 7, hand: 6, energy: 3,
      bio: 'Бригадир ремонтной бригады. Тихо не умеет, зато умеет закатать в асфальт что угодно.',
      ability: 'Шумный и Заглушка', abilityText: 'Шумный: бродячие замечают Гошу за 2 зоны даже сквозь стены, укрытие ему не помогает, двери под ним скрипят на 2 зоны. Заглушка (1 ⚡, действие): в зоне с люком — люк молчит 2 раунда. Шум 1.',
      deck: STARTER.concat(['jackhammer', 'generator', 'cones', 'rebar']),
      talents: [['weld_seam', 'workwear'], ['foreman', 'overtime']],
      mods: { loud: 1, plugAction: 1 },
      art: 'hero_gosha',
    },
    {
      // секретный герой: появляется только после спасения из плена (кампания, миссия 7); не нанимается, в одиночной игре — после первого спасения
      id: 'gleb', secret: true, pic: 'art/heroes/gleb.jpg', face: 'art/heroes/gleb_face.jpg', turnedPic: 'art/heroes/gleb_turned.jpg', turnedFace: 'art/heroes/gleb_turned_face.jpg', name: 'Глеб', nick: 'Дуплет', role: 'Дуэлянт', color: '#6a8a4a',
      hp: 4, hand: 4, energy: 3,
      bio: 'Инструктор стрелкового клуба. Колонна взяла его проводником, «Волки» — в плен. Стреляет с двух рук и думает, что это красиво.',
      ability: 'По-македонски', abilityText: 'Карта дальнего боя, сыгранная сразу после другой карты дальнего боя, стоит 0 ⚡ (раз за ход). Изъяны: «Перезарядка» — после такого дуплета в следующий ход −1 ⚡; «Руки заняты» — Кулак недоступен; «Громкие стволы» — все его выстрелы +1 Шум.',
      deck: STARTER.concat(['gl_left', 'gl_right', 'gl_fan', 'gl_reload']),
      talents: [['gl_steady', 'gl_speedload'], ['gl_macedon', 'gl_rain']],
      mods: { doublet: 1, noPunch: 1, shotNoise: 1 },
      art: 'hero_gleb',
    },
  ]);
  // герои, видимые в выборе отряда, печати и симуляторах: секретные — только открытые (ZG.unlockedHeroes)
  ZG.Heroes.visible = () => ZG.Heroes.all().filter((h) => !h.secret || (ZG.unlockedHeroes || []).includes(h.id));

  // ------------------------------------------------------------- Таланты ---
  // Уровень 2 — при 4 Опыта, уровень 3 — при 10 Опыта. Из пары выбирается один.
  const isMeleeCtx = (ctx) => ctx && ctx.kind === 'melee';
  ZG.Talents.addAll([
    // Борис
    { id: 'thick_skin', name: 'Толстая шкура', text: '+2 к Стойкости (можно пережить больше Ран).', mods: { hp: 2 } },
    { id: 'heavy_hand', name: 'Тяжёлая рука', text: '+1 урон всем твоим атакам ближнего боя.', mods: { meleeBonus: (g, h, ctx) => (isMeleeCtx(ctx) ? 1 : 0) } },
    { id: 'rock', name: 'Скала', text: '+1 к размеру руки.', mods: { handSize: 1 } },
    {
      id: 'retaliate', name: 'Ответный удар', text: 'Если в фазу зомби ты отразил 2+ урона — 2 урона одному зомби в твоей зоне.',
      hooks: { afterBlock(g, h, ctx) { if (ctx.incoming - ctx.taken >= 2) ctx.E.retaliate(g, h, 2); } },
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
    { id: 'shrapnel', name: 'Шрапнель', text: 'Твои ловушки наносят +1 урон, а осколки — 1 урон каждому врагу в соседних зонах.', mods: { trapBonus: 1, trapSplash: 1 } },
    { id: 'tinkerer', name: 'Сигнализация', text: 'Твои ловушки работают как Приманки: зомби идут к ним, как к героям.', mods: { trapLure: 1 } },
    {
      id: 'gadgets', name: 'Самоделки', text: 'Первая карта масти Расчёт за ход стоит на 1 ⚡ меньше.',
      mods: { costDelta: (g, h, ctx) => (ctx && ctx.def.suit === 'mind' && !g.turn.mindPlayed ? -1 : 0) },
    },
    // Сава
    { id: 'sharp', name: 'Заточка', text: '+1 урон всем твоим атакам ближнего боя по врагам-охотникам и притаившимся (зомби, бандиты и др.).', mods: { meleeVsAlert: 1 } },
    { id: 'softfoot', name: 'Тихоход', text: 'Первое «Движение» за ход — бесплатно.', mods: { freeFirstMove: 1 } },
    { id: 'decoy', name: 'Мастер отвлечения', text: '«Камешек» слышен на 2 зоны дальше и даёт 1 карту. Первый «Камешек» за ход даёт ещё +1 ⚡.', mods: { pebblePlus: 1 } },
    {
      id: 'assassin', name: 'Убийца из тени', text: 'Убив бродячего зомби «Ножом в спину», получи +1 ⚡ (раз за ход).',
      hooks: { kill(g, h, ctx) { if (ctx.kind === 'silent' && g.active === h.idx && g.turn && !g.turn.assassin) { g.turn.assassin = true; h.energy += 1; } } },
    },
    // Гоша
    { id: 'weld_seam', name: 'Сварной шов', text: 'Заглушка держит на 1 раунд дольше и стоит 0 ⚡.', mods: { plugRounds: 1, plugCost: -1 } },
    // id прежние (workwear, overtime) — чтобы не ломать сохранённые кампании
    { id: 'workwear', name: 'Луженая глотка', text: 'Раз за ход, 0 ⚡: крикни — все бродячие в 2 зонах от тебя идут к тебе. Тревога не растёт.', mods: { shoutAction: 1 } },
    { id: 'foreman', name: 'Бригадир', text: 'После Заглушки возьми 1 карту и получи 1 Блок.', mods: { plugBonus: 1 } },
    { id: 'overtime', name: 'Прораб', text: 'Раз за ход, 1 ⚡: другой герой в твоей зоне получит +1 ⚡ в начале своего следующего хода.', mods: { foremanAction: 1 } },
    // Глеб
    { id: 'gl_steady', name: 'Твёрдая рука', text: '+1 к дальности твоих выстрелов.', mods: { rangeBonus: 1 } },
    { id: 'gl_speedload', name: 'Быстрая перезарядка', text: '«Перезарядка» не отнимает ⚡, если в ход дуплета ты не двигался (ни шагом, ни картой).', mods: { speedload: 1 } },
    { id: 'gl_macedon', name: 'Македонец', text: '«По-македонски» срабатывает дважды за ход (штраф «Перезарядки» — всё равно −1 ⚡).', mods: { doubletMax: 1 } },
    { id: 'gl_rain', name: 'Свинцовый дождь', text: 'Твои выстрелы по зоне («Веер» и др.) наносят +1 урон.', mods: { rangedBonus: (g, h, ctx) => (ctx && ctx.def && ctx.def.target && ctx.def.target.kind === 'zone' ? 1 : 0) } },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
