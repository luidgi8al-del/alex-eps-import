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
  await new Promise(resolve => server.listen(8914, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, serviceWorkers: 'block', acceptDownloads: true });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript({ content: fs.readFileSync(path.join(root, 'tests/faux-serveur.js'), 'utf8') });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8914');
    await page.waitForTimeout(600);
    await page.evaluate(() => showCreneauExport({
      id: 'slot-pdf', activity_name: 'Natation', day_of_week: 'MERCREDI',
      start_time: '14:00', end_time: '15:30', responsible_teacher: 'Mme Schmitt'
    }, [{
      id: 'student-pdf', last_name: 'Évrard', first_name: 'Inès', division: '5-01',
      student_email: 'ines@example.fr', category: 'BENJAMIN', sex: 'F'
    }]));

    const popupCount = await page.evaluate(() => {
      window.__popupCount = 0;
      window.open = () => { window.__popupCount += 1; return null; };
      return window.__popupCount;
    });
    assert.equal(popupCount, 0);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-format="pdf"]').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'liste-natation.pdf');
    const bytes = fs.readFileSync(await download.path());
    assert.equal(bytes.subarray(0, 8).toString('latin1'), '%PDF-1.4');
    assert(bytes.length > 1000);
    assert.equal(await page.evaluate(() => window.__popupCount), 0);
    console.log('PASS AS slot PDF downloads a real file without opening a print window');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
