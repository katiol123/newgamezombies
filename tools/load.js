// Загружает игровую логику в Node (без отрисовки). Порядок как в index.html.
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/core/core.js',
  'src/data/base.js',
  'src/data/cards.js',
  'src/data/heroes.js',
  'src/data/tiles.js',
  'src/data/spawns.js',
  'src/data/scenarios.js',
  'src/data/events.js',
  'src/data/missions.js',
  'src/data/campaign.js',
  'src/data/levels.js',
  'src/engine/board.js',
  'src/engine/engine.js',
  'src/engine/campaign.js',
  'src/ai/bot.js',
];
FILES.forEach((f) => require(path.join(ROOT, f)));
module.exports = globalThis.ZG;
module.exports.FILES = FILES;
