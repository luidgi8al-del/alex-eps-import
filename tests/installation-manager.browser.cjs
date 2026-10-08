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
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 850 } });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript(() => {
      const originalGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        if (key === 'eps_installation_manager_session') return JSON.stringify({access_token:'manager-token',refresh_token:'refresh',email:'responsable@example.fr'});
        return originalGet.call(this,key);
      };
      const originalFetch = window.fetch.bind(window);
      const rows = [
        {id:'r1',installation_name:'Gymnase',description:'Panier instable',urgency:'URGENT',status:'SIGNALE',reported_at:'2026-10-08T09:15:00Z',reported_by:'Prof A'},
        {id:'r2',installation_name:'Piscine',description:'Vestiaire fermé',urgency:'NORMAL',status:'EN_COURS',reported_at:'2026-10-07T10:00:00Z'},
        {id:'r3',installation_name:'Gymnase',description:'Filet réparé',urgency:'NORMAL',status:'RESOLU',reported_at:'2026-10-06T10:00:00Z'}
      ];
      window.fetch = async (url, options) => {
        const target = String(url);
        if (target.startsWith(location.origin)) return originalFetch(url,options);
        if (target.includes('eps_installation_manager_context')) return new Response(JSON.stringify({is_manager:true,institution_id:'school'}),{status:200});
        if (target.includes('eps_installation_facilities')) return new Response(JSON.stringify([{name:'Gymnase'},{name:'Piscine'}]),{status:200});
        if (target.includes('eps_update_installation_report')) {
          const body = JSON.parse(options.body);
          rows.find(row => row.id === body.p_incident_id).status = body.p_status;
          return new Response(JSON.stringify({id:body.p_incident_id,status:body.p_status}),{status:200});
        }
        if (target.includes('eps_installation_interventions')) return new Response('[]',{status:200});
        if (target.includes('sport_installation_incidents')) return new Response(JSON.stringify(rows),{status:200});
        return new Response('{}',{status:404});
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/responsable-installations.html`);
    await page.locator('.report-card').first().waitFor();
    assert.equal(await page.locator('#authPage').isVisible(), false);
    assert.deepEqual(await page.locator('.stats strong').allTextContents(), ['1','1','1']);
    await page.locator('[data-filter="urgent"]').click();
    assert.equal(await page.locator('.report-card').count(), 1);
    await page.locator('[data-filter="all"]').click();
    await page.locator('[data-report="r1"]').first().click();
    await page.locator('[data-next="EN_COURS"]').click();
    await page.locator('[data-next="RESOLU"]').waitFor();
    assert.equal(await page.locator('#progressCount').textContent(), '2');
    await page.locator('#facilitiesTab').click();
    assert.equal(await page.locator('.facility-card').count(), 2);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS Espace responsable : accès, suivi, statuts, filtres et mobile');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
