// Проверка Print & Play: печатный режим, PDF и переполнение текста на картах.
//   NODE_PATH=$(npm root -g) node tools/print_check.js [out.pdf]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, '../print.html'));
  await page.waitForTimeout(2500);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);
  const bad = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.slot .card').forEach((c) => {
      const name = c.querySelector('.card-name');
      const text = c.querySelector('.card-text');
      const id = c.dataset.id || (c.querySelector('.spawn-title') ? 'spawn' : '?');
      if (name && name.scrollWidth > name.clientWidth + 1) out.push(`${id}: название не влезает`);
      if (name && name.getClientRects().length && name.offsetHeight > 30) out.push(`${id}: название в 3+ строки`);
      if (text && text.scrollHeight > text.clientHeight + 1) out.push(`${id}: текст обрезан`);
      const r = c.getBoundingClientRect(), s = c.parentElement.getBoundingClientRect();
      if (r.width < s.width * 0.95) out.push(`${id}: карта меньше слота (${Math.round(r.width)} из ${Math.round(s.width)})`);
    });
    // планшеты героев: карта и треки не вылезают за рамку
    document.querySelectorAll('.hero-board').forEach((b) => {
      const id = (b.querySelector('.hero-name') || b.querySelector('[class*=name]') || {}).textContent || 'планшет';
      const br = b.getBoundingClientRect();
      b.querySelectorAll('.hero-card, .hb-tracks, .hero-card *').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width && (r.bottom > br.bottom + 1 || r.right > br.right + 1)) out.push(`планшет ${id.trim()}: «${(e.className || e.tagName).toString().slice(0, 30)}» вылезает за рамку`);
      });
      b.querySelectorAll('.hero-card').forEach((c) => { if (c.scrollHeight > c.clientHeight + 1) out.push(`планшет ${id.trim()}: карта героя обрезана`); });
    });
    return [...new Set(out)];
  });
  if (process.argv[2]) await page.pdf({ path: process.argv[2], format: 'A4', printBackground: true });
  console.log(bad.length ? bad.join('\n') : 'OK: все карты печатаются без переполнения');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
