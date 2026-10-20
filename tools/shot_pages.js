// Скриншоты правил и печати: node tools/shot_pages.js <out-dir>
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  for (const f of ['rules', 'print']) {
    await page.goto('file://' + path.resolve(__dirname, '../' + f + '.html'));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${f}-1.png` });
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (const frac of [0.25, 0.5, 0.75]) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(h * frac));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${f}-${Math.round(frac * 100)}.png` });
    }
  }
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
