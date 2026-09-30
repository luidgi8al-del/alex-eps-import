const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});

(async () => {
  await new Promise(resolve => server.listen(8913, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript({ content: fs.readFileSync(path.join(root, 'tests/faux-serveur.js'), 'utf8') });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto('http://127.0.0.1:8913');
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      dashboardClass = { row: { id: 'cl-test' }, label: '6e1' };
      dashboardPeriod = 1;
      dashboardStudents = [
        { id: 's1', first_name: 'Lina', last_name: 'Martin' },
        { id: 's2', first_name: 'Adam', last_name: 'Bernard' }
      ];
      dashboardSlots = [{ id: 'slot-swim', day_of_week: 'MERCREDI', start_time: '10:00' }];
      dashboardActivities = [{ slot_id: 'slot-swim', period_number: 1, apsa_name: 'Natation' }];
      dashboardCycles = [{ id: 'cycle-swim', apsa_name: 'Natation', priority_objective: null }];
      dashboardEvaluations = [
        { id: 'eval-p', cycle_id: 'cycle-swim', type: 'PONCTUELLE', label: 'Équilibre', date_epoch_millis: Date.now() - 3000 },
        { id: 'eval-f', cycle_id: 'cycle-swim', type: 'FINALE', label: 'Bilan final', date_epoch_millis: Date.now() - 2000 }
      ];
      dashboardTests = [{ id: 'test-swim', class_id: 'cl-test', period_number: 1, test_name: 'Observation natation', created_at: Date.now(), deleted: false }];
      ecResultatsTests = [{ id: 'r1', session_id: 'test-swim', student_id: 's1', deleted: false }];
      ecCriteres = [];
      ecNotes = [];
      ecNotesChargees = true;
      ecFiltreEvaluations = 'Toutes';
      vueClasse = 'evaluations';
      const panel = document.getElementById('classDashboardPanel');
      panel.style.display = 'block';
      ecDessinerEvaluations(panel);
    });

    assert.equal(await page.locator('[data-ec-filtre-eval]').count(), 4);
    assert.equal(await page.locator('[data-ec-test-inline="test-swim"]').count(), 1);
    assert.match(await page.locator('[data-ec-test-inline="test-swim"]').innerText(), /créé depuis les outils/i);
    await page.locator('[data-ec-filtre-eval="Tests"]').evaluate(button => button.click());
    assert.equal(await page.locator('[data-ec-test-inline]').count(), 1);
    assert.equal(await page.locator('[data-ec-grille]').count(), 0);
    await page.locator('[data-ec-filtre-eval="Ponctuelles"]').evaluate(button => button.click());
    assert.equal(await page.locator('[data-ec-test-inline]').count(), 0);
    assert.match(await page.locator('.ec-evaluations-liste').innerText(), /Équilibre/);
    await page.locator('#ecActionsEvaluations').evaluate(button => button.click());
    assert.doesNotMatch(await page.locator('body').innerText(), /Tests EPS enregistrés/);
    console.log('PASS saved tool tests appear directly beside all, punctual and final evaluations');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
