const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/test-blank') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<!doctype html><meta charset="utf-8"><div id="equipTab-materiel"></div><div id="equipTab-epi"></div>'); }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, bytes) => {
    res.writeHead(error ? 404 : 200, {'Content-Type': (file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html') + '; charset=utf-8'});
    res.end(error ? '' : bytes);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'});
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(origin + '/test-blank');
    await page.evaluate(() => {
      window.session = {user_id: 'other-teacher', email: 'synthetic@example.test'};
      window.writes = [];
      window.enregistrerLigne = async (table, row) => { window.writes.push({table, row}); };
      window.lireTable = async () => window.fakeInspections || [];
    });
    await page.addScriptTag({url: origin + '/equipement.js'});
    const marker = '<b data-injected="true">Texte & "guillemets"</b>';
    await page.evaluate(value => {
      equipmentList = [{id: 'equipment-1', user_id: 'original-teacher', name: value, location: value,
        category: value, quantity_initial: 5, quantity_current: 2, quantity_lost: 0,
        quantity_out_of_service: 0, low_stock_threshold: 2, comment: value}];
      renderEquipment();
    }, marker);
    assert.equal(await page.locator('[data-injected]').count(), 0);
    assert((await page.locator('#equipTab-materiel').innerText()).includes(marker));
    await page.locator('[data-open-equip]').click();
    assert.equal(await page.locator('[data-equip-field="comment"]').inputValue(), marker);
    assert.equal(await page.locator('[data-injected]').count(), 0);
    for (const value of ['-1', '1.5', '2147483648']) {
      await page.locator('[data-equip-field="quantity_current"]').fill(value);
      await page.locator('#saveEquipBtn').click();
      assert.match(await page.locator('#equipOk').innerText(), /quantité entière/);
      assert.equal(await page.evaluate(() => writes.length), 0);
    }
    await page.locator('[data-equip-field="quantity_current"]').fill('4');
    await page.locator('[data-equip-field="low_stock_threshold"]').fill('');
    await page.locator('#saveEquipBtn').click();
    const writes = await page.evaluate(() => window.writes);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].row.user_id, 'original-teacher');
    assert.equal(writes[0].row.quantity_current, 4);
    assert.equal(writes[0].row.low_stock_threshold, null);
    await page.evaluate(value => {
      epiList = [{id: 'epi-1', internal_id: value, manufacturer: value, model: value,
        category: value, status: 'EN_SERVICE', next_inspection_date_epoch_millis: 1}];
      fakeInspections = [{epi_id: 'epi-1', inspector: value, observations: value, result: value}];
      renderEpi();
    }, marker);
    assert.equal(await page.locator('[data-injected]').count(), 0);
    await page.locator('[data-open-epi]').click();
    await page.locator('#inspBy').waitFor();
    assert.equal(await page.locator('[data-injected]').count(), 0);
    assert.equal(await page.locator('[data-epi-field="internal_id"]').inputValue(), marker);
    assert((await page.locator('#equipTab-epi').innerText()).includes(marker));
    console.log('PASS matériel/EPI : textes inertes, attributs intacts, quantités valides et auteur conservé');
    await context.close();

    const manager = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'});
    await manager.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await manager.addInitScript(() => {
      localStorage.setItem('eps_installation_manager_session', JSON.stringify({user_id: 'synthetic-manager', email: 'MANAGER@example.test', access_token: 'synthetic-token', refresh_token: 'synthetic-refresh'}));
      const reports = ['a', 'b'].map(id => ({id, description: `Signalement ${id}`, installation_name: 'Gymnase', status: 'SIGNALE', urgency: 'NORMAL', reported_at: '2026-10-24T10:00:00Z'}));
      let revision = 1;
      let refresh;
      window.setInterval = (callback, ms) => { if (ms === 30000) refresh = callback; return 1; };
      window.auditRefresh = () => { revision++; refresh(); return revision; };
      window.auditFailNext = false;
      window.auditExpireNext = false;
      window.auditHoldNext = false;
      window.auditSetStatus = status => { reports[0].status = status; };
      window.auditSent = [];
      window.fetch = async (input, options = {}) => {
        const url = new URL(String(input), location.href);
        let body = null;
        let status = 200;
        if (url.pathname.endsWith('/token')) body = {access_token: 'renewed-token', refresh_token: 'renewed-refresh', user: {id: 'synthetic-manager', email: 'manager@example.test'}};
        else if (url.pathname.endsWith('/eps_installation_manager_context')) body = {is_manager: true};
        else if (url.pathname.endsWith('/eps_installation_facilities')) body = [{name: 'Gymnase'}];
        else if (url.pathname.endsWith('/sport_installation_incidents')) {
          if (window.auditExpireNext) { window.auditExpireNext = false; return new Response('{}', {status: 401}); }
          body = structuredClone(reports);
          if (window.auditHoldNext) {
            window.auditHoldNext = false;
            await new Promise(resolve => { window.auditRelease = resolve; });
          }
        }
        else if (url.pathname.endsWith('/eps_installation_interventions')) body = [{status: 'SIGNALE', note: `Historique v${revision}`, created_at: '2026-10-24T10:00:00Z'}];
        else if (url.pathname.endsWith('/eps_update_installation_report')) {
          const data = JSON.parse(options.body);
          if (window.auditFailNext) { window.auditFailNext = false; status = 500; body = {message: 'Échec simulé'}; }
          else { reports.find(row => row.id === data.p_incident_id).status = data.p_status; window.auditSent.push(data); }
        }
        return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
      };
    });
    const m = await manager.newPage();
    await m.goto(origin + '/responsable-installations.html');
    await m.locator('[data-report="a"]').first().click();
    await m.locator('#interventionNote').fill('Vérifier les fixations demain');
    await m.evaluate(() => {
      window.oldEditor = document.getElementById('interventionNote');
      oldEditor.focus(); oldEditor.setSelectionRange(5, 9);
      auditRefresh();
    });
    await m.waitForFunction(() => document.getElementById('reportTimeline')?.textContent.includes('Historique v2'));
    const draft = await m.evaluate(() => ({same: oldEditor === document.getElementById('interventionNote'), focus: document.activeElement === oldEditor, value: oldEditor.value, start: oldEditor.selectionStart, end: oldEditor.selectionEnd}));
    assert.deepEqual(draft, {same: true, focus: true, value: 'Vérifier les fixations demain', start: 5, end: 9});
    await m.evaluate(() => { auditExpireNext = true; auditRefresh(); });
    await m.waitForFunction(() => document.getElementById('reportTimeline')?.textContent.includes('Historique v3'));
    assert.equal(await m.locator('#interventionNote').inputValue(), 'Vérifier les fixations demain');
    assert.equal(await m.evaluate(() => JSON.parse(localStorage.getItem('eps_installation_manager_session')).user_id), 'synthetic-manager');
    assert.equal(await m.evaluate(() => oldEditor === document.getElementById('interventionNote')), true);
    await m.evaluate(() => { auditHoldNext = true; auditRefresh(); });
    await m.waitForFunction(() => typeof auditRelease === 'function');
    await m.evaluate(() => { auditSetStatus('EN_COURS'); auditRefresh(); });
    await m.locator('[data-next="RESOLU"]').waitFor();
    await m.evaluate(() => auditRelease());
    await m.waitForTimeout(100);
    assert.equal(await m.locator('[data-next]').getAttribute('data-next'), 'RESOLU');
    assert.equal(await m.locator('#interventionNote').inputValue(), 'Vérifier les fixations demain');
    await m.evaluate(() => { auditSetStatus('SIGNALE'); auditRefresh(); });
    await m.locator('[data-next="EN_COURS"]').waitFor();
    await m.locator('#detailBack').click();
    await m.locator('[data-report="b"]').first().click();
    assert.equal(await m.locator('#interventionNote').inputValue(), '');
    await m.locator('#detailBack').click();
    await m.locator('[data-report="a"]').first().click();
    assert.equal(await m.locator('#interventionNote').inputValue(), 'Vérifier les fixations demain');
    await m.evaluate(() => { auditFailNext = true; });
    await m.locator('[data-next]').click();
    await m.waitForFunction(() => document.getElementById('detailError').textContent.includes('conservé'));
    assert.equal(await m.locator('#interventionNote').inputValue(), 'Vérifier les fixations demain');
    await m.locator('[data-next]').click();
    await m.locator('[data-next="RESOLU"]').waitFor();
    assert.equal(await m.locator('#interventionNote').inputValue(), '');
    assert.deepEqual(await m.evaluate(() => auditSent), [{p_incident_id: 'a', p_status: 'EN_COURS', p_note: 'Vérifier les fixations demain'}]);
    await m.locator('#interventionNote').fill('Brouillon privé');
    await m.locator('#logoutBtn').click();
    assert.equal(await m.locator('#detailContent').innerText(), '');
    assert.equal(await m.evaluate(() => localStorage.getItem('eps_installation_manager_session')), null);
    console.log('PASS responsable : commentaire/curseur préservés au rafraîchissement et renouvellement 401, réponses inversées ignorées, retour de fiche, échec, succès et déconnexion');
    await manager.close();
  } finally {
    await browser.close();
    server.closeAllConnections(); server.close();
  }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
