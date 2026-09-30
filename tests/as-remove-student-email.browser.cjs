const fs = require('fs'), path = require('path'), http = require('http'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  try { res.setHeader('Content-Type', p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(p)); }
  catch { res.statusCode = 404; res.end(); }
});

(async () => {
  await new Promise(resolve => server.listen(8904, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript({ content: fs.readFileSync(path.join(root, 'tests/faux-serveur.js'), 'utf8') });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8904');
    await page.waitForTimeout(800);
    await page.evaluate(async () => {
      document.getElementById('tab-home').style.display = 'none';
      document.getElementById('tab-unss').style.display = 'block';
      creneauPorteTout = true;
      const slot = { id: 'slot-remove', activity_name: 'Escalade', responsible_teacher: 'Louit', day_of_week: 'mercredi', start_time: '14:00', end_time: '16:00', location: 'Gymnase', deleted: false };
      unssSlots = [slot];
      unssStudents = [{ id: 'student-remove', last_name: 'Martin', first_name: 'Lina', division: '5-01', parent_email: 'parent@example.test', licensed: true }];
      unssInscriptions = [{ id: 'membership-remove', slot_id: 'slot-remove', student_id: 'student-remove', deleted: false }];
      unssSeances = [];
      const originalFetch = window.fetch;
      window.__removalMail = null;
      window.fetch = (url, options) => {
        if (String(url).includes('/functions/v1/eps-as-slot-email')) {
          window.__removalMail = JSON.parse(options.body);
          return Promise.resolve(new Response(JSON.stringify({ ok: true, sent: 1, failed: 0, missing: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return originalFetch(url, options);
      };
      await ouvrirElevesCreneau(slot);
    });
    await page.click('[data-retirer="student-remove"]');
    await page.waitForSelector('#asRemoveStudentOverlay');
    assert.equal(await page.locator('#asRemoveOnly').isVisible(), true);
    assert.equal(await page.locator('#asRemoveAndEmail').isVisible(), true);
    await page.click('#asRemoveAndEmail');
    assert.deepEqual(await page.locator('#asRemovalReasonSelect option').allTextContents(), [
      'Trop d’absences', 'Comportement inadéquat avec l’activité', 'Motif libre'
    ]);
    await page.selectOption('#asRemovalReasonSelect', 'free');
    await page.click('#asRemovalConfirm');
    assert.match(await page.locator('#asRemovalResult').textContent(), /Indiquez le motif libre/);
    await page.fill('#asRemovalFreeText', 'Choix concerté avec la famille');
    await page.click('#asRemovalConfirm');
    await page.waitForSelector('#asRemovalFinish');
    assert.match(await page.locator('.as-removal-success').textContent(), /1 e-mail\(s\) envoyé\(s\) aux parents/);
    const result = await page.evaluate(() => ({ body: window.__removalMail, remaining: unssInscriptions.length }));
    assert.equal(result.remaining, 0);
    assert.equal(result.body.mode, 'removal_notice');
    assert.equal(result.body.membershipId, 'membership-remove');
    assert.equal(result.body.studentId, 'student-remove');
    assert.equal(result.body.audience, 'parents_personalized');
    assert.match(result.body.message, /Choix concerté avec la famille/);
    console.log('PASS remove-only or parent-email workflow with mandatory reason');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
