# Иллюстрации сюжетных вставок кампании

Сейчас каждая вставка рисуется кодом — стилизованная анимированная сцена (`src/render/storyscenes.js`, по сцене на id). Все сцены можно посмотреть в главном меню → «Галерея». Картинка ниже необязательна: если положить файл `art/story/<id>.jpg`, он покажется поверх анимированной сцены.

Файл кладётся в `art/story/<id>.jpg`. Формат **16:9** (например, 1920×1080; в игре показывается примерно 640×360, верх окна вставки). Пока файла нет, игра показывает тёмную заставку с красной дымкой.

Общий стиль (добавлять в начало каждого промпта, как у портретов героев):
`graphic novel illustration, bold ink outlines, flat muted colors with rust red and sickly green accents, post-Soviet Russian suburb, cinematic wide shot, horror atmosphere, no text, 16:9`

| id | Момент | Промпт (англ.) |
|---|---|---|
| m1_start | Миссия 1, пролог | a heavy steel shelter door closing behind silhouettes of survivors, empty wet courtyard of Soviet apartment blocks at dusk, a children's swing moving by itself, smoke on the horizon, something breathing behind rusty garages |
| m1_first_kill | Первое убийство зомби | a dead zombie lying face down in a puddle, wearing house slippers and a flowered bathrobe, a key on a string around the neck, a bag of stale bread in its hand, survivors' boots at the edge of frame |
| m1_night | Наступает ночь (миссия 1) | night falls over a Soviet district, streetlights dead, darkness rising from open manholes and basement doors, hundreds of shambling silhouettes in doorways, one lit window |
| m2_start | Миссия 2, пролог | twisted gates of a Soviet truck depot, chain-link fence with torn jacket scraps and dried bloody handprints, guard booth with an old radio, dark garage box with two huge shapes breathing between car lifts |
| m2_pack | Стая обнаружена | a pile of what looks like garbage bags by a fence turns out to be a pack of zombies lying huddled like stray dogs, heads turning toward the viewer, frost, silence |
| m2_rouse | Драка с Толстяками | bloated zombie truck driver in an oily work suit rising by a car lift, belly torn open, a van alarm flashing, zombies pouring from garages and inspection pits toward the light |
| m2_keys | Ключи от «буханки» | close-up of a hand pulling van keys from a bloody breast pocket, keychain with a tiny plastic icon and a photo of a girl with big white bows, UAZ van dashboard in the background |
| m3_start | Миссия 3, пролог | abandoned forester's cordon in a dark pine forest, door wide open, cold tea and an open logbook on the table, a well covered with planks and a stone in the yard, planks trembling, fog between pines |
| m3_battery | Найден аккумулятор | an opened wooden crate in a pine forest, a car battery wrapped in a quilted jacket, a child's crayon drawing on top: house, fir trees, sun and a huge brown bear with red eyes |
| m3_bear | Медведь проснулся | a rotting zombie bear rising on hind legs from under an uprooted tree, half of its muzzle missing with teeth showing through the cheek, a broken boar spear stuck in its side, forest gloom |
| m3_twist | Сигнал не прошёл | fire lookout tower radio room at dusk, radio glowing dimly, antenna cable chewed through, deep claw marks and tufts of brown fur on the post, a charcoal note pinned to the radio |
| m3_bear_dead | Медведь убит | dead zombie bear collapsed like a felled tree, a scrap of canvas forest-ranger jacket with a patch caught in its teeth, survivors standing over it, pine needles, cold light |
| m4_start | Миссия 4, пролог | an overturned burning fuel tanker at a highway exit lighting everything in orange glow, abandoned gas station with red graffiti on the glass, dark trucks, shadows dancing, a hand wired to a fuel pump |
| m4_bandit | Первый бандит | a bandit in a tracksuit and black balaclava stepping from behind a truck, lazily shooting a zombie on the roadside with a TT pistol, turning his head toward the viewer, firelight |
| m4_bitten | Бандит обратился | a young bandit rising as a zombie, balaclava slipped off revealing a boyish face with dead eyes, an empty pistol falling from his fingers, highway at night, fire glow |
| m4_fuel | Найдена канистра | close-up of a full jerrycan with words scratched into the handle with a knife, survivor's hands, gas station at night, silence after gunfire, smoke |
| m4_night | Ночь на трассе (миссия 4) | manhole covers on a night highway jumping like lids on boiling pots, pale hands crawling out, distant muzzle flashes of bandits, burning tanker glow on the horizon |
| m5_start | Миссия 5, пролог | grey dawn over a river bridge, abandoned convoy trucks with doors open and slashed tarps, suitcases and children's shoes on the asphalt, a bandit checkpoint booth with a bear skin nailed to it and a charcoal sign, a striped barrier |
| m5_sniper | Первый выстрел снайпера | view from the road toward a wooden watchtower, a glint of a scope at the top, a bullet chipping asphalt at the viewer's feet, sandbags by the booth, tense grey morning |
| m5_forester | Лесник проснулся | a huge old man in a bear skin with the bear's head as a hood and claws sewn on mittens, holding a dark bloodied splitting axe, stepping out of a log cabin at a sawmill, sniffing the air |
| m5_key | Ключ снят | close-up of a key on a string with dozens of tin tokens, watches, rings, small crosses and a beaded child's bracelet, a highway map on the wall with the forest cordon, gas station and bridge circled in red |
| m5_saw | Пилорама | an old sawmill roaring to life, a huge spinning circular saw blade throwing wood chips and dark spray, bandit silhouettes recoiling, motion blur |
| m5_forester_dead | Лесник убит | the dead forester lying in a puddle, the bear head hood slipped off revealing a tired old man with a grey beard, an old photo fallen from his pocket: young ranger and a girl with bows holding a bear drawing, axe beside him |
