const fs = require('fs'), path = require('path'), http = require('http'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  try {
    res.setHeader('Content-Type', p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(p));
  } catch { res.statusCode = 404; res.end(); }
});

(async () => {
  await new Promise(resolve => server.listen(8903, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript({ content: fs.readFileSync(path.join(root, 'tests/faux-serveur.js'), 'utf8') });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8903');
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      document.getElementById('tab-home').style.display = 'none';
      document.getElementById('tab-unss').style.display = 'block';
      creneauPorteTout = true;
      affectationCreneauxActive = false;
      unssSlots = [{ id: 'slot-mobile', activity_name: 'Athlétisme', responsible_teacher: 'Louit', day_of_week: 'jeudi', start_time: '17:00', end_time: '19:00', location: 'piste', deleted: false }];
      unssStudents = [
        { id: 's1', last_name: 'Martin', first_name: 'Lina', school_class_label: '5-01' },
        { id: 's2', last_name: 'Bernard', first_name: 'Adam', school_class_label: '4-02' }
      ];
      unssInscriptions = [{ id: 'm1', slot_id: 'slot-mobile', student_id: 's1' }, { id: 'm2', slot_id: 'slot-mobile', student_id: 's2' }];
      unssSeances = [{ id: 'call1', slot_id: 'slot-mobile', date_epoch_millis: Date.now() - 86400000, deleted: false }];
      unssPresences = [{ id: 'p1', session_id: 'call1', student_id: 's1', present: true }, { id: 'p2', session_id: 'call1', student_id: 's2', present: true }];
      unssAppelSlotId = 'slot-mobile';
      renderUnssAppelTab();
    });
    await page.waitForTimeout(80);

    const mobile = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      return {
        call: box('#unssNouvelAppelMobile'),
        recorded: box('.as-call-kpi-recorded'),
        students: box('.as-call-kpi-students'),
        rate: box('.as-call-kpi-rate'),
        next: box('.as-next-card'),
        history: box('.as-call-main'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        columns: getComputedStyle(document.querySelector('.as-call-kpis')).gridTemplateColumns
      };
    });
    assert.equal(mobile.columns.split(' ').length, 2);
    assert(Math.abs(mobile.call.y - mobile.recorded.y) < 2, 'APPEL and registered calls must share the first row');
    assert(Math.abs(mobile.students.y - mobile.rate.y) < 2, 'students and attendance must share the second row');
    assert(mobile.students.y > mobile.call.y, 'students must be on the second row');
    assert(mobile.next.y > mobile.rate.y + mobile.rate.height, 'next session must follow the four phone cards');
    assert(mobile.history.y > mobile.next.y, 'the history stays below the next-session card on phones');
    assert.equal(mobile.overflow, 0);

    await page.click('#unssNouvelAppelMobile');
    await page.waitForSelector('#unssCallModalClose');
    assert.equal(await page.locator('#unssCallModalClose').count(), 1, 'the APPEL phone card must open a new attendance');
    await page.click('#unssCallModalClose');

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(80);
    const desktop = await page.evaluate(() => ({
      phoneAction: getComputedStyle(document.querySelector('#unssNouvelAppelMobile')).display,
      visibleKpis: [...document.querySelectorAll('.as-call-kpis article')].filter(node => getComputedStyle(node).display !== 'none').length,
      rows: [...document.querySelectorAll('.as-call-kpis article')].map(node => Math.round(node.getBoundingClientRect().y))
    }));
    assert.equal(desktop.phoneAction, 'none');
    assert.equal(desktop.visibleKpis, 3);
    assert.equal(new Set(desktop.rows).size, 1, 'the three desktop KPIs stay on their existing single row');
    console.log('PASS mobile-only AS call cards and unchanged desktop KPIs');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
