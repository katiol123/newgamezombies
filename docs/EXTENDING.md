# Как расширять «Мёртвый квартал»

Игра построена так, чтобы новый контент добавлялся **данными**, а новые механики — **ключами модификаторов и хуками**, без переписывания движка.

```
src/core/core.js        реестры контента, ГСЧ, система модификаторов (Mods) и хуков
src/data/*.js           ВЕСЬ контент: враги, карты, герои, таланты, тайлы, появление, сценарии, условия, уровни
src/engine/board.js     сборка поля из тайлов, пути, линия огня
src/engine/engine.js    правила (состояние — чистый JSON)
src/ai/bot.js           ИИ для симуляций баланса и подсказок (не знает конкретных карт)
src/render/art.js       ВСЯ графика кодом, по ключам — заменяется спрайтами
src/render/*.js         поле, тайлы, вёрстка карт
src/ui/app.js           интерфейс
tools/sim.js            симулятор баланса;  tools/test.js — дымовые тесты
rules.html / print.html правила и Print & Play — таблицы строятся из тех же данных
```

## Расширение «в ширину»

### Новая карта
```js
ZG.Cards.add({
  id: 'chainsaw', name: 'Бензопила', suit: 'rage', cost: 2, shield: 0, noise: 2,
  type: 'Оружие', tags: ['melee'], loot: true, art: 'chainsaw', value: 13,
  text: 'Ближний бой: 3 урона каждому зомби в зоне. Шум 2.', chainText: '+1 урон.',
  target: { kind: 'zone', range: 0 },          // см. список целей ниже
  play(c) { c.noise(2); c.zoneDamage(c.target, 3 + (c.chain ? 1 : 0), { kind: 'melee' }); },
});
```
Затем добавьте её в колоду добычи уровня (`levels.js → loot`) или в стартовую колоду героя.

**Цели (`target.kind`)**: `zombie` (range 0 — своя зона; `ranged: true` — по линии огня), `zone` (зона с зомби на линии огня), `move` (`steps`, `through`, `free`), `hero` (`range`, `self`, `wounded`), `cell` (любая зона в N шагах), `adj` (своя/соседняя), `edge` (проход для баррикады), `null` — без цели.

**API эффекта (`c`)**: `melee`, `rangedHit`, `zoneDamage`, `shot`, `noise`, `draw`, `energy`, `block`, `moveTo`, `heal`, `adrenaline`, `lure`, `trap`, `barricade`, `suppress`, `push`, `pull`, `status`, `equip`, `burnHeroes`, `zombie(uid)`; флаги `c.chain`, `c.target`, `c.hero`, `c.g`, `c.E` (полный движок).

### Новый враг
```js
ZG.Zombies.add({
  id: 'spitter', name: 'Плевун', hp: 2, dmg: 1, speed: 1, xp: 2, armor: 0, threat: 4,
  text: 'В фазу зомби: 1 Рана герою в 2 зонах по прямой.', art: 'z_spitter',
  hooks: { zombiePhase(g, z, E) { /* ... */ } },
});
```
Добавьте его в строки карт появления (`spawns.js`) и нарисуйте `z_spitter` в `art.js` (или `ZG.Art.useImage('z_spitter', 'img/spitter.png')`). Флаги: `big` (урон сохраняется), `immobile`.

### Новый герой
```js
ZG.Heroes.add({
  id: 'oleg', name: 'Олег', nick: 'Пёс', role: 'Кинолог', color: '#8a6a3a',
  hp: 5, hand: 5, energy: 3, ability: 'Нюх', abilityText: '…',
  deck: ['strike','strike','dash','step','look','cover', /* 4 своих */],
  talents: [['t2a','t2b'], ['t3a','t3b']],
  mods: { /* пассивка через ключи модификаторов */ }, hooks: { /* … */ },
  art: 'hero_oleg',
});
```

### Новый тайл, сценарий, условие, уровень
* Тайл — `ZG.Tiles.add({ map, doors, search, buildings, decor })`; движок сам повернёт и проверит связность.
* Сценарий — объект с `setup / goals / isComplete / actions / doAction / botGoal / progress / roundEnd` (см. `scenarios.js`; помощники движка: `placeCrates`, `placeTower`, `placeNests`, `spawnZombie`, `raiseAlarm`).
* Условие — `{ id, name, text, mods, setup }`.
* **Уровень (локация)** — `ZG.Levels.add({ tiles, loot, spawnDeck, scenarios, conditions, rounds, phaseStarts, hunger, alarmThreshold, spawnPoints, layout })`. Уровень 2 может использовать другой набор тайлов, размер поля (`layout: { tw: 4, th: 2 }`), колоду врагов и правила давления.

## Расширение «в глубину» (новые механики)

**Модификаторы.** Любой источник (герой, талант, снаряжение, условие, сценарий, сложность) может объявить `mods: { ключ: число | (g, hero, ctx) => число }`. Движок читает их через `ZG.Mods.value(g, hero, 'ключ', base, ctx)`. Уже используются: `hp, handSize, energy, meleeBonus, rangedBonus, rangeBonus, shotNoise, noiseAlarm, taunt, blockPerCard, autoBlock, freeEscape, freeFirstSearch, freeFirstMove, barricadeCost, barricadeHp, trapBonus, healBonus, searchDraw, costDelta, immuneAttack, healAction, secondWind, maxRounds, alarmThreshold, phaseShift, searchCount, spawnPointsBonus, zombieSpeed`.

Новая механика = новый ключ + одна строка чтения в движке. Например, «холод» (−1 ⚡ на улице ночью): условие `mods: { energy: (g,h) => g.board.cells[h.pos].type==='street' && E.phase(g)>0 ? -1 : 0 }` — движок менять не нужно вовсе.

**Хуки.** `hooks: { turnStart, kill, afterBlock }` у героев/талантов/снаряжения, `zombiePhase` у врагов, `roundEnd` у сценариев. Добавить новую точку — вызвать `ZG.Mods.emit(g, hero, 'имя', ctx)` в нужном месте `engine.js`.

**Новые решения игрока.** Движок останавливается через `g.pending = { type: '…' }`; интерфейс показывает модалку, ИИ решает в `Bot.autoPending`.

## Графика

### Размеры спрайтов
| Что | Ключ | Размер | Примечания |
|---|---|---|---|
| Иллюстрация карты | поле `art` карты (`fist`, `sledge`, …) | **1024×512** (2:1), PNG/JPG | Обрезается по центру «cover»; на картах с длинным текстом окно ниже — держите главное в центральной полосе ~60% высоты. Без рамки и текста — их рисует вёрстка карты. |
| Портрет героя | `hero_<id>` | **1024×1024**, PNG | Бюст, лицо в верхней трети. Используется в карточке героя (обрезка сверху), панели (52 px) и в круглой фишке на поле. |
| Жетон зомби на поле | `z_<type>` | **512×512**, PNG с прозрачностью | Круглый жетон целиком (с ободком). |
| Портрет зомби | `zp_<type>` | **512×512**, PNG | Для справочника врагов. |
| Тайл поля | `tile_<id>` | **2048×2048** (печать 15×15 см ≈ 1772 px при 300 dpi) | Рисуется в исходной ориентации (rot 0); стены/двери должны совпадать с `map` тайла. Значки люков и обыска игра дорисует сама. |
| Жетоны поля, выходы | `tok_*`, `exit_*` | **256×256** (выходы — 256×336) | PNG с прозрачностью. |
| Условия | `cond_*` | **800×440** | |
Все рисунки — функции в `ZG.Art` по ключам: карты (`art` карты), герои `hero_*`, жетоны зомби `z_*` и портреты `zp_*`, жетоны поля `tok_*`, выходы `exit_*`, условия `cond_*`. Замена на спрайт — одна строка:
```js
ZG.Art.useImage('hero_boris', 'img/heroes/boris.png');
```

## Звук
Звуки задаются ключами в `src/ui/sound.js` (файлы в `audio/`):

| Ключ | Файл | Когда звучит |
|---|---|---|
| `round` | `audio/tension.mp3` | вступление к уровню, начало каждого раунда |
| `zombies` | `audio/braam.mp3` | баннеры «Фаза зомби», «Волна!», «Прорыв!» |
| `growl` | `audio/growl.mp3` | атака зомби на героя, «Засада!» |
| `reveal` | `audio/psychedelic.mp3` | переворот тайла в тумане, «Наступает Ночь» |
| `mission` | `audio/missions.mp3` («Время перемен») | секретная миссия: показ своей карты и выполнение первым (музыка, ~10–15 с с затуханием, `ZG.Sound.music`) |

Мелкие звуки (шаги, удары, выстрелы, карты, блок, лечение, баррикада, взрыв…) синтезируются Web Audio — `ZG.Sound.sfx('shot')`. Любой из них заменяется файлом: `ZG.Sound.define('sfx_shot', 'audio/shot.mp3')`. Ключи: `step, hstep, card, punch, hit, shot, blast, kill, block, chain, heal, infect, search, wood, bash, pickup, energy, click`; соответствие событиям поля — `SFX_MAP` в `src/render/boardview.js`.

Заменить или добавить: `ZG.Sound.define('ключ', 'audio/файл.mp3', { volume: 0.7, gap: 600 })`, проиграть: `ZG.Sound.play('ключ')`. Кнопка 🔊 в верхней панели выключает звук (запоминается).

## Заражение и обращённые
Параметры уровня: `infection: { die: 2, turnAt: 1, top: 4, hurts: true }` — на кубике ≤ die укус даёт карту Заражения (замешивается в верхние `top` карт колоды), `hurts` — Заражение считается Раной, `turnAt` — сколько раз Заражение должно «досидеть» в руке до конца хода, чтобы герой обратился. `maxAttackers` — Теснота (сколько зомби кусают одного героя за фазу). `alarmThreshold`, `spawnPoints`, `startAlarm` принимают таблицу по размеру отряда `{ 1: …, 4: … }`; задания масштабируют цель сами (`g.heroes.length` в `setup`).

Обращённый герой — обычный враг с id `turned_<герой>` (`base.js`), арт `z_turned_<герой>` / `zp_turned_<герой>` рисуется из портрета героя. Флаги врагов: `breaker` (ломает баррикаду с удара), `climber` (лезет через баррикады), `infects` (удар всегда Заражение), хук `onDeath(g, z, E)`.

## Баланс
```
node tools/sim.js --all-pairs --games 40      # все пары героев
node tools/sim.js --solo --games 40           # соло
node tools/sim.js --heroes kira,viktor --scenario radio --condition fog
node tools/sim.js --all-pairs --set '{"rounds":11}'   # проба параметров уровня без правки файлов
node tools/test.js                            # дымовые тесты
```
ИИ оценивает позиции, а не карты, поэтому новые карты он «понимает» сразу — удобно для первичной проверки баланса.
