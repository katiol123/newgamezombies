// UI screenshots: node tools/shot.js <out-dir> [scenario]
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
  // start the turn with the first hero
  await page.click('#actions .act.big').catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + '/06-turn.png' });
  await page.hover('#hand .card:nth-child(1)').catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + '/07-hover.png' });
  // auto-turns for a few turns (modals are closed “like a player”)
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => {
      window.__done = false;
      const G = window.ZG.Game;
      (async () => {
        if (G.g.phase === 'heroes' && G.g.active == null) { const h = G.g.heroes.find((x) => x.onBoard && !x.acted); if (h) await G.act({ t: 'begin', hero: h.idx }); }
        await G.autoTurn();
      })().finally(() => { window.__done = true; });
    });
    for (let k = 0; k < 120; k++) {
      if (await page.evaluate(() => document.querySelector('#modal').classList.contains('show'))) {
        if (i === 2) await page.screenshot({ path: out + '/09-modal.png' });
        await page.click('#modal .loot-pick .card', { timeout: 300 }).catch(() => {});
        await page.click('#modal .talent-card', { timeout: 300 }).catch(() => {});
        await page.click('#modal .btn.primary', { timeout: 300 }).catch(() => {});
      }
      const done = await page.evaluate(() => window.__done && !window.ZG.Game.busy && !window.ZG.Game.g.pending);
      if (done) break;
      await page.waitForTimeout(300);
    }
    if (await page.evaluate(() => !!window.ZG.Game.g.result)) break;
  }
  await page.screenshot({ path: out + '/08-later.png' });
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
