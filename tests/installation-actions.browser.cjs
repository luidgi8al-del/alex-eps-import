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
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript({ content: fs.readFileSync(path.join(root, 'tests/faux-serveur.js'), 'utf8') });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => typeof showTab === 'function' && !!window.__fauxServeur);
    await page.evaluate(() => showTab('equipement'));

    await page.locator('.installation-overview-card').first().waitFor();
    assert.equal(await page.locator('#installationOverview').isVisible(), true);
    assert.equal(await page.locator('#installationFollowView').isVisible(), false);
    assert.deepEqual(await page.locator('.installation-overview-stats strong').allTextContents(), ['1', '1', '1']);
    assert.equal(await page.locator('.installation-overview-card').count(), 3);

    await page.locator('[data-installation-filter="urgent"]').click();
    assert.equal(await page.locator('.installation-overview-card').count(), 1);
    await page.locator('[data-installation-filter="all"]').click();
    await page.locator('.installation-overview-card').first().getByRole('button', { name: 'Voir le suivi' }).click();
    await page.locator('#installationDialogOverlay').getByText('Panier de basket instable').waitFor();
    await page.locator('#installationDialogOverlay [data-installation-close]').click();

    await page.locator('[data-equiptab="installation-suivi"]').click();
    await page.locator('.installation-card').first().waitFor();
    assert.equal(await page.locator('#installationFollowView').isVisible(), true);
    assert.equal(await page.locator('#installationOverview').isVisible(), false);
    assert.equal(await page.locator('.installation-card').count(), 3);
    assert.equal(await page.locator('.installation-card [data-action="history"]').count(), 3);
    assert.equal(await page.locator('#installationManagerCard').isVisible(), false);
    await page.locator('#installationBackOverviewBtn').click();
    assert.equal(await page.locator('#installationOverview').isVisible(), true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#installationQuickReportBtn').click();
    await page.locator('#installationReportChoice').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS Installations : tableau de bord, filtres, suivi et affichage mobile');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
