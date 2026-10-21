/*
 * Карты действий: стартовые, именные карты героев и добыча.
 *
 * Поля карты:
 *   suit     — масть (rage / agility / mind)
 *   cost     — цена в Энергии (⚡)
 *   shield   — щит: сколько урона блокирует, если сбросить карту при атаке зомби
 *   noise    — шум (поднимает Тревогу), для атак дальнего боя
 *   target   — что выбирается при розыгрыше (см. engine/targets)
 *   play(ctx)— эффект; ctx.chain === true, если сработала Связка
 *   consumable — после розыгрыша убирается из игры
 *   equip    — снаряжение: после розыгрыша лежит перед героем и даёт mods/hooks
 */
(function (G) {
  'use strict';
  const ZG = G.ZG;

  const MELEE = { kind: 'zombie', range: 0 };

  // ------------------------------------------------------------ Стартовые ---
  ZG.Cards.addAll([
    {
      id: 'strike', name: 'Удар', suit: 'rage', cost: 1, shield: 1, type: 'Атака', tags: ['melee'],
      text: 'Ближний бой: 2 урона.', chainText: '+1 урон.', art: 'fist', value: 6,
      target: MELEE,
      play(c) { c.melee(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'dash', name: 'Рывок', suit: 'agility', cost: 1, shield: 0, type: 'Движение', tags: ['move'],
      text: 'Переместись на 1–2 зоны.', chainText: 'возьми 1 карту.', art: 'boot', value: 6,
      target: { kind: 'move', steps: 2 },
      play(c) { c.moveTo(c.target); if (c.chain) c.draw(1); },
    },
    {
      id: 'step', name: 'Перебежка', suit: 'agility', cost: 0, shield: 0, type: 'Движение', tags: ['move'],
      text: 'Переместись на 1 зону.', chainText: '+1 ⚡.', art: 'step', value: 5,
      target: { kind: 'move', steps: 1 },
      play(c) { c.moveTo(c.target); if (c.chain) c.energy(1); },
    },
    {
      id: 'look', name: 'Осмотреться', suit: 'mind', cost: 0, shield: 0, type: 'Тактика', tags: ['draw'],
      text: 'Возьми 1 карту.', chainText: '+1 ⚡.', art: 'eye', value: 4,
      target: null,
      play(c) { c.draw(1); if (c.chain) c.energy(1); },
    },
    {
      id: 'cover', name: 'Укрытие', suit: 'mind', cost: 0, shield: 1, type: 'Защита', tags: ['block'],
      text: 'Получи 1 Блок до своего следующего хода.', chainText: '+2 Блока.', art: 'shield', value: 6,
      target: null,
      play(c) { c.block(1 + (c.chain ? 2 : 0)); },
    },
  ]);

  // ------------------------------------------------------ Борис «Кувалда» ---
  ZG.Cards.addAll([
    {
      id: 'sledge', name: 'Кувалда', suit: 'rage', cost: 2, shield: 1, type: 'Атака', tags: ['melee'], hero: 'boris',
      text: 'Ближний бой: 4 урона.', chainText: 'ещё 2 урона каждому другому зомби в зоне.', art: 'sledge', value: 12,
      target: MELEE,
      play(c) {
        const zone = c.zombie(c.target) && c.zombie(c.target).pos;
        c.melee(c.target, 4);
        if (c.chain && zone != null) c.zoneDamage(zone, 2, { kind: 'melee', exclude: c.target });
      },
    },
    {
      id: 'ram', name: 'Таран', suit: 'rage', cost: 1, shield: 1, type: 'Атака', tags: ['melee', 'move'], hero: 'boris',
      text: 'Переместись на 1 зону (Хватка не действует), затем 1 урон каждому зомби в новой зоне.', chainText: '2 урона вместо 1.', art: 'ram', value: 10,
      target: { kind: 'move', steps: 1, free: true },
      play(c) { c.moveTo(c.target); c.zoneDamage(c.hero.pos, c.chain ? 2 : 1, { kind: 'melee' }); },
    },
    {
      id: 'stance', name: 'Стойка', suit: 'mind', cost: 1, shield: 1, type: 'Защита', tags: ['block'], hero: 'boris',
      text: 'Получи 4 Блока до своего следующего хода. Каждый зомби, атаковавший тебя в фазу зомби, получает 1 урон.', chainText: '+1 ⚡.', art: 'stance', value: 10,
      target: null,
      play(c) { c.block(4); c.thorns(1); if (c.chain) c.energy(1); },
    },
    {
      id: 'roar', name: 'Боевой клич', suit: 'rage', cost: 0, shield: 0, noise: 1, type: 'Тактика', tags: ['taunt'], hero: 'boris',
      text: 'Шум 1. Возьми 1 карту. Все зомби в 2 зонах от тебя сдвигаются на 1 зону к тебе.', chainText: '+1 ⚡.', art: 'roar', value: 8,
      target: null,
      play(c) { c.noise(1); c.draw(1); c.pull(2); if (c.chain) c.energy(1); },
    },
  ]);

  // --------------------------------------------------- Марина «Скальпель» ---
  ZG.Cards.addAll([
    {
      id: 'scalpel', name: 'Скальпель', suit: 'agility', cost: 0, shield: 0, type: 'Атака', tags: ['melee'], hero: 'marina',
      text: 'Ближний бой: 2 урона (точно в висок).', chainText: '+1 урон.', art: 'scalpel', value: 9,
      target: MELEE,
      play(c) { c.melee(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'bandage', name: 'Перевязка', suit: 'mind', cost: 1, shield: 1, type: 'Лечение', tags: ['heal'], hero: 'marina',
      text: 'Герой в твоей зоне (можно себя) убирает 2 Раны.', chainText: 'и получает 1 Блок.', art: 'bandage', value: 10,
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 2); if (c.chain) c.block(1, c.target); },
    },
    {
      id: 'adrenaline', name: 'Адреналин', suit: 'agility', cost: 0, shield: 1, type: 'Поддержка', tags: ['support'], hero: 'marina',
      text: 'Другой герой в 2 зонах получает 2 жетона Адреналина (+1 ⚡ каждый в его ход).', chainText: '+1 жетон.', art: 'syringe', value: 9,
      target: { kind: 'hero', range: 2, self: false },
      play(c) { c.adrenaline(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'coldcalc', name: 'Холодный расчёт', suit: 'mind', cost: 1, shield: 1, type: 'Тактика', tags: ['draw'], hero: 'marina',
      text: 'Возьми 2 карты.', chainText: '+1 ⚡.', art: 'brain', value: 8,
      target: null,
      play(c) { c.draw(2); if (c.chain) c.energy(1); },
    },
  ]);

  // ---------------------------------------------------------- Лиза «Тень» ---
  ZG.Cards.addAll([
    // --- Сава ---
    {
      id: 'silent_step', name: 'Тихий шаг', suit: 'agility', cost: 1, shield: 1, type: 'Движение', tags: ['move'], hero: 'sava',
      text: 'Пройди 1–2 зоны, можно сквозь зомби, без Хватки. В конце этого хода бродячие тебя не замечают.', chainText: 'возьми 1 карту.', art: 'silentstep', value: 8,
      target: { kind: 'move', steps: 2, through: true, free: true },
      play(c) { if (c.g.turn) c.g.turn.quiet = true; c.moveTo(c.target); if (c.chain) c.draw(1); },
    },
    {
      id: 'shiv', name: 'Нож в спину', suit: 'agility', cost: 1, shield: 0, type: 'Атака', tags: ['melee'], hero: 'sava',
      text: 'Бродячего (не крупного) — убить беззвучно. Охотнику — 2 урона.', chainText: '+1 урон охотнику.', art: 'knife', value: 9,
      target: MELEE,
      play(c) {
        const z = c.zombie(c.target);
        if (z && c.g.stealth && !z.awake && !ZG.Zombies.get(z.type).big) c.silentKill(c.target);
        else c.melee(c.target, 2 + (c.chain ? 1 : 0));
      },
    },
    {
      id: 'pebble', name: 'Камешек', suit: 'mind', cost: 0, shield: 1, type: 'Тактика', tags: ['lure'], hero: 'sava',
      text: 'Шум в зоне в 2 зонах от тебя (без Тревоги). Зомби в 2 зонах от неё идут проверить.', chainText: 'слышно на 1 зону дальше.', art: 'pebble', value: 8,
      target: { kind: 'cell', range: 2 },
      play(c) { const plus = ZG.Mods.flag(c.g, c.hero, 'pebblePlus'); c.pebble(c.target, 2 + (c.chain ? 1 : 0) + (plus ? 2 : 0)); if (plus) c.draw(1); },
    },
    {
      id: 'lurk', name: 'Затаиться', suit: 'mind', cost: 1, shield: 2, type: 'Тактика', hero: 'sava',
      text: 'До своего хода тебя видят только из твоей зоны (кроме ярости орды).', chainText: '+1 Блок.', art: 'lurk', value: 8,
      target: null,
      play(c) { c.hero.lurk = true; if (c.chain) c.block(1); },
    },
    {
      id: 'knife', name: 'Нож', suit: 'agility', cost: 0, shield: 0, type: 'Атака', tags: ['melee'], hero: 'lisa',
      text: 'Ближний бой: 1 урон.', chainText: '+1 урон и возьми 1 карту.', art: 'knife', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 1 + (c.chain ? 1 : 0)); if (c.chain) c.draw(1); },
    },
    {
      id: 'lure', name: 'Отвлечь', suit: 'mind', cost: 1, shield: 1, type: 'Тактика', tags: ['lure'], hero: 'lisa',
      text: 'Положи Приманку в зону в 3 зонах от тебя. До конца раунда зомби считают её героем. Тревога +1.', chainText: '+1 ⚡.', art: 'bottle', value: 9,
      target: { kind: 'cell', range: 3 },
      play(c) { c.lure(c.target, 1); if (c.chain) c.energy(1); },
    },
    {
      id: 'rooftops', name: 'По крышам', suit: 'agility', cost: 2, shield: 0, type: 'Движение', tags: ['move'], hero: 'lisa',
      text: 'Переместись на 1–3 зоны, можно сквозь зоны с зомби. Хватка не действует.', chainText: '+1 ⚡.', art: 'roof', value: 9,
      target: { kind: 'move', steps: 3, through: true },
      play(c) { c.moveTo(c.target); if (c.chain) c.energy(1); },
    },
    {
      id: 'vanish', name: 'Раствориться', suit: 'agility', cost: 2, shield: 1, type: 'Защита', tags: ['stealth'], hero: 'lisa',
      text: 'До своего следующего хода ты Невидима: зомби не атакуют и не преследуют тебя.', chainText: 'возьми 1 карту.', art: 'mask', value: 9,
      target: null,
      play(c) { c.status('hidden'); if (c.chain) c.draw(1); },
    },
  ]);

  // ------------------------------------------------------- Виктор «Гром» ---
  ZG.Cards.addAll([
    {
      id: 'sawnoff', name: 'Обрез', suit: 'rage', cost: 2, shield: 0, noise: 2, type: 'Атака', tags: ['ranged', 'gun'], hero: 'viktor',
      text: 'Дальний бой, дальность 0–1. 2 урона каждому зомби в зоне. Шум 2.', chainText: '+1 урон каждому.', art: 'shotgun', value: 12,
      target: { kind: 'zone', range: 1, ranged: true },
      play(c) { c.shot(2); c.zoneDamage(c.target, 2 + (c.chain ? 1 : 0), { kind: 'ranged' }); },
    },
    {
      id: 'pm', name: 'Табельный ПМ', suit: 'mind', cost: 1, shield: 0, noise: 1, type: 'Атака', tags: ['ranged', 'gun'], hero: 'viktor',
      text: 'Дальний бой, дальность 0–3. 2 урона. Шум 1.', chainText: 'возьми 1 карту.', art: 'pistol', value: 10,
      target: { kind: 'zombie', range: 3, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 2); if (c.chain) c.draw(1); },
    },
    {
      id: 'suppress', name: 'Огонь на подавление', suit: 'mind', cost: 1, shield: 1, noise: 1, type: 'Тактика', tags: ['ranged', 'gun', 'control'], hero: 'viktor',
      text: 'Дальность 0–2. Зомби в выбранной зоне Прижаты: не двигаются в этот раунд. Шум 1.', chainText: '1 урон каждому из них.', art: 'suppress', value: 9,
      target: { kind: 'zone', range: 2, ranged: true },
      play(c) { c.shot(1); c.suppress(c.target); if (c.chain) c.zoneDamage(c.target, 1, { kind: 'ranged' }); },
    },
    {
      id: 'buttstroke', name: 'Приклад', suit: 'rage', cost: 1, shield: 1, type: 'Атака', tags: ['melee'], hero: 'viktor',
      text: 'Ближний бой: 2 урона. Если цель выжила — она Прижата: не двигается в этот раунд.', chainText: '+1 урон.', art: 'butt', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 2 + (c.chain ? 1 : 0)); const z = c.zombie(c.target); if (z) z.suppressed = true; },
    },
  ]);

  // -------------------------------------------------------- Кира «Ключ» ---
  ZG.Cards.addAll([
    {
      id: 'wrench', name: 'Разводной ключ', suit: 'rage', cost: 1, shield: 1, type: 'Атака', tags: ['melee'], hero: 'kira',
      text: 'Ближний бой: 2 урона.', chainText: '+2 урона.', art: 'wrench', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 2 + (c.chain ? 2 : 0)); },
    },
    {
      id: 'tripwire', name: 'Растяжка', suit: 'mind', cost: 1, shield: 0, type: 'Ловушка', tags: ['trap'], hero: 'kira',
      text: 'Положи Ловушку в свою или соседнюю зону. Когда туда входит зомби — 2 урона каждому зомби в зоне, Шум 2.', chainText: 'Ловушка наносит 3.', art: 'trap', value: 10,
      target: { kind: 'adj', self: true },
      play(c) { c.trap(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'improvise', name: 'Смекалка', suit: 'mind', cost: 0, shield: 1, type: 'Тактика', tags: ['draw'], hero: 'kira',
      text: 'Возьми 1 карту.', chainText: 'возьми ещё 1 и +1 ⚡.', art: 'gear', value: 7,
      target: null,
      play(c) { c.draw(c.chain ? 2 : 1); if (c.chain) c.energy(1); },
    },
    {
      id: 'weld', name: 'Сварка', suit: 'mind', cost: 0, shield: 1, type: 'Укрепление', tags: ['barricade'], hero: 'kira',
      text: 'Поставь Баррикаду (прочность 4) на проход из твоей зоны.', chainText: '+1 ⚡.', art: 'weld', value: 9,
      target: { kind: 'edge' },
      play(c) { c.barricade(c.target, 4); if (c.chain) c.energy(1); },
    },
    // --- Гоша ---
    {
      id: 'jackhammer', name: 'Отбойный молоток', suit: 'rage', cost: 1, shield: 0, noise: 2, type: 'Атака', tags: ['melee'], hero: 'gosha',
      text: 'Ближний бой: 3 урона каждому зомби в твоей зоне. Шум 2.', chainText: '+1 урон каждому.', art: 'jackhammer', value: 12,
      target: { kind: 'zone', range: 0 },
      play(c) { c.noise(2); c.zoneDamage(c.target, 3 + (c.chain ? 1 : 0), { kind: 'melee' }); },
    },
    {
      id: 'generator', name: 'Генератор', suit: 'mind', cost: 1, shield: 1, type: 'Тактика', tags: ['lure', 'taunt'], hero: 'gosha',
      text: 'Заводишь генератор: Приманка в твоей зоне до конца раунда, Тревога +2. Получи 2 Блока.', chainText: 'Тревога только +1.', art: 'generator', value: 9,
      target: null,
      play(c) { c.lure(c.hero.pos, c.chain ? 1 : 2); c.block(2); },
    },
    {
      id: 'cones', name: 'Ограждение', suit: 'agility', cost: 1, shield: 1, type: 'Тактика', hero: 'gosha',
      text: 'Все зомби в твоей зоне прижаты до конца раунда (не ходят). Шум 1.', chainText: '+1 Блок.', art: 'cones', value: 8,
      target: null,
      play(c) { c.noise(1); c.suppress(c.hero.pos); if (c.chain) c.block(1); },
    },
    {
      id: 'rebar', name: 'Арматура', suit: 'rage', cost: 1, shield: 2, type: 'Атака', tags: ['melee'], hero: 'gosha',
      text: 'Ближний бой: 2 урона.', chainText: 'отбрось цель в соседнюю зону.', art: 'rebar', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 2); if (c.chain && c.zombie(c.target)) c.push(c.target); },
    },
  ]);

  // ---------------------------------------------------------------- Добыча ---
  ZG.Cards.addAll([
    {
      id: 'bat', name: 'Бита', suit: 'rage', cost: 1, shield: 1, type: 'Оружие', tags: ['melee'], loot: true, rarity: 'rare',
      text: 'Ближний бой: 3 урона.', chainText: '+1 урон.', art: 'bat', value: 10,
      target: MELEE,
      play(c) { c.melee(c.target, 3 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'machete', name: 'Мачете', suit: 'rage', cost: 1, shield: 1, type: 'Оружие', tags: ['melee'], loot: true, rarity: 'rare',
      text: 'Ближний бой: 2 урона цели и 2 урона ещё одному зомби в зоне.', chainText: '+1 урон обоим.', art: 'machete', value: 11,
      target: MELEE,
      play(c) {
        const z = c.zombie(c.target);
        const zone = z && z.pos;
        const n = 2 + (c.chain ? 1 : 0);
        c.melee(c.target, n);
        if (zone != null) c.zoneDamage(zone, n, { kind: 'melee', exclude: c.target, max: 1 });
      },
    },
    {
      id: 'spear', name: 'Самодельное копьё', suit: 'agility', cost: 1, shield: 1, type: 'Оружие', tags: ['melee'], loot: true, rarity: 'common',
      text: 'Ближний бой с досягаемостью: 2 урона зомби в твоей или соседней зоне (по прямой).', chainText: '+1 урон.', art: 'spear', value: 9,
      target: { kind: 'zombie', range: 1, reach: true },
      play(c) { c.melee(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'crowbar', name: 'Монтировка', suit: 'rage', cost: 1, shield: 2, type: 'Оружие', tags: ['melee'], loot: true, rarity: 'common',
      text: 'Ближний бой: 2 урона.', chainText: 'возьми 1 карту.', art: 'crowbar', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 2); if (c.chain) c.draw(1); },
    },
    {
      id: 'pistol', name: 'Пистолет', suit: 'mind', cost: 1, shield: 0, noise: 1, type: 'Оружие', tags: ['ranged', 'gun'], loot: true, rarity: 'rare',
      text: 'Дальний бой, дальность 0–3. 2 урона. Шум 1.', chainText: '+1 урон.', art: 'pistol', value: 10,
      target: { kind: 'zombie', range: 3, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'shotgun', name: 'Дробовик', suit: 'rage', cost: 2, shield: 0, noise: 2, type: 'Оружие', tags: ['ranged', 'gun'], loot: true, rarity: 'unique',
      text: 'Дальний бой, дальность 0–1. 2 урона каждому зомби в зоне. Шум 2.', chainText: '+1 урон каждому.', art: 'shotgun', value: 12,
      target: { kind: 'zone', range: 1, ranged: true },
      play(c) { c.shot(2); c.zoneDamage(c.target, 2 + (c.chain ? 1 : 0), { kind: 'ranged' }); },
    },
    {
      id: 'molotov', name: 'Коктейль Молотова', suit: 'rage', cost: 1, shield: 0, noise: 1, type: 'Расходник', tags: ['ranged', 'fire'], loot: true, rarity: 'rare', consumable: true,
      text: 'Дальность 1–2. 3 урона каждому зомби в зоне (и героям там — по 1). Шум 1. Уходит из игры.', chainText: '+1 урон зомби.', art: 'molotov', value: 12,
      target: { kind: 'zone', range: 2, min: 1, ranged: true },
      play(c) { c.shot(1, true); c.zoneDamage(c.target, 3 + (c.chain ? 1 : 0), { kind: 'fire' }); c.burnHeroes(c.target, 1); },
    },
    {
      id: 'firecracker', name: 'Петарда', suit: 'mind', cost: 0, shield: 0, type: 'Расходник', tags: ['lure'], loot: true, rarity: 'rare', consumable: true,
      text: 'Положи Приманку в зону в 4 зонах от тебя. Тревога +1. Уходит из игры.', chainText: '+1 ⚡.', art: 'firecracker', value: 8,
      target: { kind: 'cell', range: 4 },
      play(c) { c.lure(c.target, 1); if (c.chain) c.energy(1); },
    },
    {
      id: 'medkit', name: 'Аптечка', suit: 'mind', cost: 1, shield: 0, type: 'Расходник', tags: ['heal'], loot: true, rarity: 'common', consumable: true,
      text: 'Герой в твоей зоне убирает 2 Раны или Заражения (сначала Заражения). Уходит из игры.', chainText: '+1 Рана.', art: 'medkit', value: 11, cures: true,
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 2 + (c.chain ? 1 : 0), true); },
    },
    {
      id: 'energy', name: 'Энергетик', suit: 'agility', cost: 0, shield: 0, type: 'Расходник', tags: ['energy'], loot: true, rarity: 'common', consumable: true,
      text: '+2 ⚡. Уходит из игры.', chainText: 'возьми 1 карту.', art: 'can', value: 7,
      target: null,
      play(c) { c.energy(2); if (c.chain) c.draw(1); },
    },
    {
      id: 'chocolate', name: 'Шоколадка', suit: 'agility', cost: 0, shield: 1, type: 'Расходник', tags: ['draw'], loot: true, rarity: 'common', consumable: true,
      text: '+1 ⚡ и возьми 1 карту. Уходит из игры.', chainText: '+1 ⚡.', art: 'choco', value: 6,
      target: null,
      play(c) { c.energy(1 + (c.chain ? 1 : 0)); c.draw(1); },
    },
    {
      id: 'sneakers', name: 'Кроссовки', suit: 'agility', cost: 1, shield: 1, type: 'Снаряжение', tags: ['equip'], loot: true, rarity: 'rare', equip: true,
      text: 'Снаряжение. Первое базовое «Движение» за ход стоит 0 ⚡.', art: 'sneaker', value: 9,
      target: null,
      mods: { freeFirstMove: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'backpack', name: 'Рюкзак', suit: 'mind', cost: 1, shield: 1, type: 'Снаряжение', tags: ['equip'], loot: true, rarity: 'rare', equip: true,
      text: 'Снаряжение. +1 к размеру руки.', art: 'backpack', value: 9,
      target: null,
      mods: { handSize: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'vest', name: 'Бронежилет', suit: 'mind', cost: 1, shield: 2, type: 'Снаряжение', tags: ['equip'], loot: true, rarity: 'rare', equip: true,
      text: 'Снаряжение. Каждую фазу зомби автоматически блокирует 1 урон.', art: 'vest', value: 10,
      target: null,
      mods: { autoBlock: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'flashlight', name: 'Фонарик', suit: 'mind', cost: 1, shield: 1, type: 'Снаряжение', tags: ['equip'], loot: true, rarity: 'rare', equip: true,
      text: 'Снаряжение. Обыск: тяни на 1 карту добычи больше.', art: 'flashlight', value: 8,
      target: null,
      mods: { searchDraw: 1 },
      play(c) { c.equip(); },
    },
    // --- новые находки (редкость: обычная ×4, редкая ×2, уникальная ×1) ---
    {
      id: 'katana', name: 'Катана', suit: 'rage', cost: 1, shield: 1, type: 'Снаряжение', tags: ['equip'], loot: true, rarity: 'unique', equip: true,
      text: 'Снаряжение. Твои атаки ближнего боя +1 урон.', chainText: 'надевая, сразу 2 урона зомби в твоей зоне.', art: 'katana', value: 12,
      target: null,
      mods: { meleeBonus: (g, h, ctx) => (ctx && ctx.kind === 'melee' ? 1 : 0) },
      play(c) { c.equip(); if (c.chain) c.zoneDamage(c.hero.pos, 2, { kind: 'melee', max: 1 }); },
    },
    {
      id: 'army_medkit', name: 'Армейская аптечка', suit: 'mind', cost: 1, shield: 0, type: 'Расходник', tags: ['heal'], loot: true, rarity: 'unique', consumable: true, cures: true,
      text: 'Герой в твоей зоне убирает 3 Раны или Заражения и получает 1 Блок. Уходит из игры.', chainText: 'следующий герой начнёт ход с +1 ⚡.', art: 'medkit', value: 13,
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 3, true); c.block(1, c.target); if (c.chain) c.relayEnergy(1); },
    },
    {
      id: 'smoke', name: 'Дымовая шашка', suit: 'mind', cost: 1, shield: 1, type: 'Расходник', tags: ['stealth'], loot: true, rarity: 'rare', consumable: true,
      text: 'Зомби в твоей зоне теряют след и бродят (без скрытности — прижаты). До конца хода здесь нет Хватки. Уходит из игры.', chainText: 'герои в зоне затаились до своего хода.', art: 'smoke', value: 10,
      target: null,
      play(c) { c.smoke(c.hero.pos); if (c.chain) c.E.heroesAt(c.g, c.hero.pos).forEach((o) => { o.lurk = true; }); },
    },
    {
      id: 'nailgun', name: 'Гвоздомёт', suit: 'agility', cost: 1, shield: 0, type: 'Оружие', tags: ['ranged'], loot: true, rarity: 'rare',
      text: 'Дальний бой, дальность 0–2. 2 урона. Бесшумно.', chainText: 'цель прижата до конца раунда.', art: 'nailgun', value: 10,
      target: { kind: 'zombie', range: 2, ranged: true },
      play(c) { c.rangedHit(c.target, 2); if (c.chain) c.pin(c.target); },
    },
    {
      id: 'rope', name: 'Верёвка', suit: 'agility', cost: 1, shield: 1, type: 'Движение', tags: ['move'], loot: true, rarity: 'rare',
      text: 'Пройди 1–2 зоны через баррикады и сквозь зомби, без Хватки.', chainText: 'тащи с собой героя из зоны.', art: 'rope', value: 9,
      target: { kind: 'move', steps: 2, through: true, free: true, climb: true },
      play(c) { const from = c.hero.pos; c.moveTo(c.target); if (c.chain) c.carry(from, c.target); },
    },
    {
      id: 'brick', name: 'Кирпич', suit: 'rage', cost: 0, shield: 1, type: 'Оружие', tags: ['ranged'], loot: true, rarity: 'common',
      text: 'Бросок, дальность 0–1: 1 урон. Бесшумно.', chainText: '+1 урон.', art: 'brick', value: 6,
      target: { kind: 'zombie', range: 1, ranged: true },
      play(c) { c.rangedHit(c.target, 1 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'bandage_roll', name: 'Бинт', suit: 'mind', cost: 0, shield: 1, type: 'Расходник', tags: ['heal'], loot: true, rarity: 'common', consumable: true,
      text: 'Герой в твоей зоне убирает 1 Рану. Уходит из игры.', chainText: 'или 1 Заражение вместо Раны.', art: 'bandage', value: 6,
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 1, !!c.chain); },
    },
    {
      id: 'whistle', name: 'Свисток', suit: 'mind', cost: 0, shield: 1, type: 'Тактика', tags: ['lure'], loot: true, rarity: 'common',
      text: 'Приманка в своей или соседней зоне до конца раунда. Тревога +1.', chainText: 'Тревога не растёт.', art: 'whistle', value: 6,
      target: { kind: 'adjcell' },
      play(c) { c.lure(c.target, c.chain ? 0 : 1); },
    },
    {
      id: 'canned', name: 'Тушёнка', suit: 'agility', cost: 0, shield: 1, type: 'Расходник', tags: ['energy'], loot: true, rarity: 'common', consumable: true,
      text: '+1 ⚡ и убери 1 Рану из своей руки. Уходит из игры.', chainText: 'возьми 1 карту.', art: 'canned', value: 7,
      target: null,
      play(c) { c.energy(1); c.dropWoundFromHand(); if (c.chain) c.draw(1); },
    },
    {
      id: 'ambush', name: 'Засада!', suit: 'none', cost: null, shield: 0, type: 'Событие', tags: ['event'], loot: true, event: true,
      text: 'Сразу раскрой: в твоей зоне появляется Шатун (ночью — Бегун). Обыск прерывается — оставь лишь уже вытянутые карты добычи.', art: 'ambush', value: 0,
      unplayable: true,
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
