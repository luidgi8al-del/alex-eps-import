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
  await new Promise(resolve => server.listen(8912, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript({ content: fs.readFileSync(path.join(root, 'tests/faux-serveur.js'), 'utf8') });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto('http://127.0.0.1:8912');
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      document.getElementById('mainView').style.display = 'block';
      document.getElementById('tab-programmation').style.display = 'block';
      planningMode = 'calendrier';
      renderPlanningTab();
      const at = iso => new Date(iso + 'T12:00:00').getTime();
      calendarEvents = [
        { id: 'as', label: 'Sortie AS montagne', kind: 'SORTIE', start_date_epoch_millis: at('2026-10-12'), end_date_epoch_millis: at('2026-10-12'), comment: '' },
        { id: 'exam', label: 'Brevet blanc', kind: 'EXAMEN', start_date_epoch_millis: at('2027-03-02'), end_date_epoch_millis: at('2027-03-03'), comment: '' },
        { id: 'orientation', label: 'Ouverture Parcoursup', kind: 'AUTRE', start_date_epoch_millis: at('2027-01-18'), end_date_epoch_millis: at('2027-01-18'), comment: '' },
        { id: 'meeting', label: 'Conseil de classe T1', kind: 'BANALISEE', start_date_epoch_millis: at('2026-12-01'), end_date_epoch_millis: at('2026-12-01'), comment: '' }
      ];
      renderInstitutionCalendar();
    });

    assert.equal(await page.locator('[data-calendar-main]').count(), 2);
    assert.equal(await page.locator('[data-calendar-important]').count(), 3);
    assert.match(await page.locator('.calendar-tab-panel').innerText(), /Rappel des dates importantes/);

    await page.locator('[data-calendar-important="AS"]').click();
    assert.match(await page.locator('.calendar-date-list').innerText(), /Sortie AS montagne/);
    assert.doesNotMatch(await page.locator('.calendar-date-list').innerText(), /Brevet blanc/);

    await page.locator('[data-calendar-main="institution"]').click();
    assert.equal(await page.locator('[data-calendar-institution]').count(), 7);
    assert.match(await page.locator('.calendar-tab-panel').innerText(), /Conseil de classe T1/);
    await page.locator('[data-calendar-institution="ORIENTATION"]').click();
    assert.match(await page.locator('.calendar-date-list').innerText(), /Ouverture Parcoursup/);
    assert.doesNotMatch(await page.locator('.calendar-date-list').innerText(), /Conseil de classe T1/);
    assert.equal(await page.locator('.calendar-add-event').count(), 1);
    assert.equal(await page.locator('[data-calendar-main]').count(), 2);
    console.log('PASS institution calendar has two main tabs and filtered date categories');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
