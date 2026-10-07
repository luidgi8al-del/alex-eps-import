const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  } catch { res.statusCode = 404; res.end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await context.addInitScript({ content: fs.readFileSync(path.join(root, 'tests/faux-serveur.js'), 'utf8') });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => typeof epsPageFullyReady !== 'undefined' && epsPageFullyReady);
      await page.evaluate(() => {
        Object.assign(__fauxServeur.DONNEES.health_dispensations[0], {
          aptitude: 'SPORT_ADAPTE', adapted_activities: 'Natation possible'
        });
        showTab('health');
      });
      await page.locator('[data-dispense-vue="toutes"]').click();
      const row = page.locator('tr').filter({ has: page.locator('[data-fiche="hd-1"]') });
      assert.match(await row.innerText(), /Sport adapté possible/);
      assert.match(await row.innerText(), /Natation possible/);
      assert.equal(await page.locator('th').filter({ hasText: 'Aptitude / sport adapté' }).count(), 2);
      assert.equal(await row.locator('.health-adaptation-mobile').isVisible(), width === 390);
      await context.close();
    }
    console.log('Sport adapté visible dans Tous les dispensés : ordinateur et mobile.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
