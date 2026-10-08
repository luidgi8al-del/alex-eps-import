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
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext({serviceWorkers:'block'});
    const requests = [];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = request.url();
      if (new URL(url).hostname === '127.0.0.1') return route.continue();
      requests.push([url,request.method(),request.postData()]);
      if (url.endsWith('/auth/v1/user') && request.method() === 'GET') return route.fulfill({status:200,json:{email:'responsable@example.fr'}});
      if (url.endsWith('/auth/v1/user') && request.method() === 'PUT') return route.fulfill({status:200,json:{id:'manager'}});
      if (url.includes('eps_installation_manager_context')) return route.fulfill({status:200,json:{is_manager:true,institution_id:'school'}});
      if (url.includes('sport_installation_incidents')) return route.fulfill({status:200,json:[]});
      if (url.includes('eps_installation_facilities')) return route.fulfill({status:200,json:[]});
      return route.fulfill({status:404,json:{}});
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/responsable-installations.html#access_token=invite-token&refresh_token=refresh-token&type=invite`);
    assert.equal(await page.locator('#authTitle').textContent(), 'Créer votre mot de passe');
    assert.equal(await page.locator('#loginEmail').inputValue(), 'responsable@example.fr');
    assert.equal(await page.locator('#recoverPassword').isHidden(), true);
    await page.locator('#loginPassword').fill('motdepasse-test');
    await page.locator('#loginSubmit').click();
    await page.locator('#managerPage').waitFor({state:'visible'});
    assert(requests.some(([url,method,body]) => url.endsWith('/auth/v1/user') && method === 'PUT' && JSON.parse(body).password === 'motdepasse-test'));
    assert(!requests.some(([url]) => url.includes('/signup')));
    console.log('PASS Invitation responsable : choix du mot de passe et aucun signup public');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
