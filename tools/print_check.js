// Print & Play check: print mode, PDF and text overflow on cards.
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
      if (name && name.scrollWidth > name.clientWidth + 1) out.push(`${id}: name does not fit`);
      if (name && name.getClientRects().length && name.offsetHeight > 30) out.push(`${id}: name takes 3+ lines`);
      if (text && text.scrollHeight > text.clientHeight + 1) out.push(`${id}: text is cut off`);
      const r = c.getBoundingClientRect(), s = c.parentElement.getBoundingClientRect();
      if (r.width < s.width * 0.95) out.push(`${id}: card smaller than its slot (${Math.round(r.width)} of ${Math.round(s.width)})`);
    });
    // hero boards: the card and tracks do not stick out of the frame
    document.querySelectorAll('.hero-board').forEach((b) => {
      const id = (b.querySelector('.hero-name') || b.querySelector('[class*=name]') || {}).textContent || 'board';
      const br = b.getBoundingClientRect();
      b.querySelectorAll('.hero-card, .hb-tracks, .hero-card *').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width && (r.bottom > br.bottom + 1 || r.right > br.right + 1)) out.push(`board ${id.trim()}: “${(e.className || e.tagName).toString().slice(0, 30)}” sticks out of the frame`);
      });
      b.querySelectorAll('.hero-card').forEach((c) => { if (c.scrollHeight > c.clientHeight + 1) out.push(`board ${id.trim()}: hero card is cut off`); });
    });
    return [...new Set(out)];
  });
  if (process.argv[2]) await page.pdf({ path: process.argv[2], format: 'A4', printBackground: true });
  console.log(bad.length ? bad.join('\n') : 'OK: all cards print without overflow');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
