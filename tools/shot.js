// Скриншоты интерфейса: node tools/shot.js <out-dir> [scenario]
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/01-menu.png' });
  await page.click('#btn-new');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + '/02-setup.png' });
  await page.click('#btn-start');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: out + '/03-intro.png' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out + '/04-brief.png' });
  await page.click('#modal .btn.primary').catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '/05-game.png' });
  // начать ход первым героем
  await page.click('#actions .act.big').catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + '/06-turn.png' });
  await page.hover('#hand .card:nth-child(1)').catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + '/07-hover.png' });
  // автоходы на несколько раундов
  for (let i = 0; i < 6; i++) {
    await page.evaluate(async () => {
      const G = window.ZG.Game;
      if (G.g.phase === 'heroes' && G.g.active == null) { const h = G.g.heroes.find((x) => x.onBoard && !x.acted); if (h) await G.act({ t: 'begin', hero: h.idx }); }
      await G.autoTurn();
    });
    for (let k = 0; k < 20; k++) {
      const pending = await page.evaluate(() => !!(window.ZG.Game.g.pending) && document.querySelector('#modal').classList.contains('show'));
      if (pending) { await page.click('#modal .btn.primary').catch(() => {}); await page.click('#modal .talent-card').catch(() => {}); }
      const busy = await page.evaluate(() => window.ZG.Game.busy);
      if (!busy) break;
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: out + '/08-later.png' });
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
