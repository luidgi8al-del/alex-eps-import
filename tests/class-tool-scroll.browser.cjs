const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/'));
    await page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '2400px';
      document.body.appendChild(filler);
      const overlay = document.createElement('div');
      overlay.className = 'ec-outil-fenetre';
      overlay.innerHTML = '<div class="ec-outil-barre">Classe</div><div class="ec-outil-corps"><div style="height:1800px">Test</div></div>';
      document.body.appendChild(overlay);
      document.body.classList.add('ec-outil-ouvert');
      document.documentElement.classList.add('ec-outil-ouvert');
    });
    const state = await page.evaluate(() => ({
      rootOverflow: getComputedStyle(document.documentElement).overflowY,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      toolScroll: document.querySelector('.ec-outil-corps').scrollHeight > document.querySelector('.ec-outil-corps').clientHeight
    }));
    assert.deepEqual(state, { rootOverflow: 'hidden', bodyOverflow: 'hidden', toolScroll: true });
    console.log('Défilement du test : page verrouillée, fenêtre défilante.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
