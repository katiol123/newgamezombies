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
      id: 'strike', name: 'Удар', suit: 'rage', cost: 1, shield: 0, type: 'Атака', tags: ['melee'],
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
      text: 'Получи 2 Блока до своего следующего хода.', chainText: '+1 Блок.', art: 'shield', value: 6,
      target: null,
      play(c) { c.block(2 + (c.chain ? 1 : 0)); },
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
      text: 'Ближний бой: 1 урон.', chainText: '+2 урона.', art: 'scalpel', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 1 + (c.chain ? 2 : 0)); },
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
      id: 'rooftops', name: 'По крышам', suit: 'agility', cost: 1, shield: 0, type: 'Движение', tags: ['move'], hero: 'lisa',
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
  ]);

  // ---------------------------------------------------------------- Добыча ---
  ZG.Cards.addAll([
    {
      id: 'bat', name: 'Бита', suit: 'rage', cost: 1, shield: 1, type: 'Оружие', tags: ['melee'], loot: true,
      text: 'Ближний бой: 3 урона.', chainText: '+1 урон.', art: 'bat', value: 10,
      target: MELEE,
      play(c) { c.melee(c.target, 3 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'machete', name: 'Мачете', suit: 'rage', cost: 1, shield: 1, type: 'Оружие', tags: ['melee'], loot: true,
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
      id: 'spear', name: 'Самодельное копьё', suit: 'agility', cost: 1, shield: 1, type: 'Оружие', tags: ['melee'], loot: true,
      text: 'Ближний бой с досягаемостью: 2 урона зомби в твоей или соседней зоне (по прямой).', chainText: '+1 урон.', art: 'spear', value: 9,
      target: { kind: 'zombie', range: 1, reach: true },
      play(c) { c.melee(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'crowbar', name: 'Монтировка', suit: 'rage', cost: 1, shield: 2, type: 'Оружие', tags: ['melee'], loot: true,
      text: 'Ближний бой: 2 урона.', chainText: 'возьми 1 карту.', art: 'crowbar', value: 8,
      target: MELEE,
      play(c) { c.melee(c.target, 2); if (c.chain) c.draw(1); },
    },
    {
      id: 'pistol', name: 'Пистолет', suit: 'mind', cost: 1, shield: 0, noise: 1, type: 'Оружие', tags: ['ranged', 'gun'], loot: true,
      text: 'Дальний бой, дальность 0–3. 2 урона. Шум 1.', chainText: '+1 урон.', art: 'pistol', value: 10,
      target: { kind: 'zombie', range: 3, ranged: true },
      play(c) { c.shot(1); c.rangedHit(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'shotgun', name: 'Дробовик', suit: 'rage', cost: 2, shield: 0, noise: 2, type: 'Оружие', tags: ['ranged', 'gun'], loot: true,
      text: 'Дальний бой, дальность 0–1. 2 урона каждому зомби в зоне. Шум 2.', chainText: '+1 урон каждому.', art: 'shotgun', value: 12,
      target: { kind: 'zone', range: 1, ranged: true },
      play(c) { c.shot(2); c.zoneDamage(c.target, 2 + (c.chain ? 1 : 0), { kind: 'ranged' }); },
    },
    {
      id: 'molotov', name: 'Коктейль Молотова', suit: 'rage', cost: 1, shield: 0, noise: 1, type: 'Расходник', tags: ['ranged', 'fire'], loot: true, consumable: true,
      text: 'Дальность 1–2. 3 урона каждому зомби в зоне (и героям там — по 1). Шум 1. Уходит из игры.', chainText: '+1 урон зомби.', art: 'molotov', value: 12,
      target: { kind: 'zone', range: 2, min: 1, ranged: true },
      play(c) { c.shot(1, true); c.zoneDamage(c.target, 3 + (c.chain ? 1 : 0), { kind: 'fire' }); c.burnHeroes(c.target, 1); },
    },
    {
      id: 'firecracker', name: 'Петарда', suit: 'mind', cost: 0, shield: 0, type: 'Расходник', tags: ['lure'], loot: true, consumable: true,
      text: 'Положи Приманку в зону в 4 зонах от тебя. Тревога +1. Уходит из игры.', chainText: '+1 ⚡.', art: 'firecracker', value: 8,
      target: { kind: 'cell', range: 4 },
      play(c) { c.lure(c.target, 1); if (c.chain) c.energy(1); },
    },
    {
      id: 'medkit', name: 'Аптечка', suit: 'mind', cost: 1, shield: 0, type: 'Расходник', tags: ['heal'], loot: true, consumable: true,
      text: 'Герой в твоей зоне убирает 2 Раны. Уходит из игры.', chainText: '+1 Рана.', art: 'medkit', value: 11,
      target: { kind: 'hero', range: 0, self: true, wounded: true },
      play(c) { c.heal(c.target, 2 + (c.chain ? 1 : 0)); },
    },
    {
      id: 'energy', name: 'Энергетик', suit: 'agility', cost: 0, shield: 0, type: 'Расходник', tags: ['energy'], loot: true, consumable: true,
      text: '+2 ⚡. Уходит из игры.', chainText: 'возьми 1 карту.', art: 'can', value: 7,
      target: null,
      play(c) { c.energy(2); if (c.chain) c.draw(1); },
    },
    {
      id: 'chocolate', name: 'Шоколадка', suit: 'agility', cost: 0, shield: 1, type: 'Расходник', tags: ['draw'], loot: true, consumable: true,
      text: '+1 ⚡ и возьми 1 карту. Уходит из игры.', chainText: '+1 ⚡.', art: 'choco', value: 6,
      target: null,
      play(c) { c.energy(1 + (c.chain ? 1 : 0)); c.draw(1); },
    },
    {
      id: 'sneakers', name: 'Кроссовки', suit: 'agility', cost: 1, shield: 1, type: 'Снаряжение', tags: ['equip'], loot: true, equip: true,
      text: 'Снаряжение. Первое базовое действие «Ход» за ход стоит 0 ⚡.', art: 'sneaker', value: 9,
      target: null,
      mods: { freeFirstMove: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'backpack', name: 'Рюкзак', suit: 'mind', cost: 1, shield: 1, type: 'Снаряжение', tags: ['equip'], loot: true, equip: true,
      text: 'Снаряжение. +1 к размеру руки.', art: 'backpack', value: 9,
      target: null,
      mods: { handSize: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'vest', name: 'Бронежилет', suit: 'mind', cost: 1, shield: 2, type: 'Снаряжение', tags: ['equip'], loot: true, equip: true,
      text: 'Снаряжение. Каждую фазу зомби автоматически блокирует 1 урон.', art: 'vest', value: 10,
      target: null,
      mods: { autoBlock: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'flashlight', name: 'Фонарик', suit: 'mind', cost: 1, shield: 1, type: 'Снаряжение', tags: ['equip'], loot: true, equip: true,
      text: 'Снаряжение. Обыск: тяни на 1 карту добычи больше.', art: 'flashlight', value: 8,
      target: null,
      mods: { searchDraw: 1 },
      play(c) { c.equip(); },
    },
    {
      id: 'ambush', name: 'Засада!', suit: 'none', cost: null, shield: 0, type: 'Событие', tags: ['event'], loot: true, event: true,
      text: 'Сразу раскрой: в твоей зоне появляется Шатун (ночью — Бегун). Обыск прерывается — оставь лишь уже вытянутые карты добычи.', art: 'ambush', value: 0,
      unplayable: true,
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
