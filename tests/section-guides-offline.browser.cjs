const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const c=await browser.newContext({viewport:{width:390,height:844}});
 await c.addInitScript({content:`const savedSet=Storage.prototype.setItem;const savedRegister=navigator.serviceWorker.register.bind(navigator.serviceWorker);${fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')};Storage.prototype.setItem=savedSet;navigator.serviceWorker.register=savedRegister;__fauxServeur.DONNEES.eps_schema_marks.push({name:'as_slot_assignments'});const fake=window.fetch;window.fetch=(url,opts)=>!navigator.onLine&&String(url).includes('supabase.co')?Promise.reject(new TypeError('Failed to fetch')):fake(url,opts);`});
 const p=await c.newPage();await p.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await p.evaluate(()=>demarrerModeHorsConnexion());await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForFunction(()=>automaticOfflineState==='ready',null,{timeout:120000});
 await c.setOffline(true);await p.reload();await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
 await p.evaluate(()=>showTab('home'));
 await p.locator('[data-section-start]').click();assert.match(await p.locator('.section-guide').innerText(),/1 \/ 3/);
 await p.locator('[data-section-next]').click();await p.locator('[data-section-next]').click();await p.locator('[data-section-next]').click();
 await p.reload();await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);await p.evaluate(()=>showTab('home'));await p.waitForSelector('[data-section-help]');assert.equal(await p.locator('.section-guide-content').count(),0);
 await p.locator('[data-section-help]').click();await p.waitForSelector('[data-section-start]');
 const topics=await p.evaluate(async()=>Object.keys(await (await fetch('section-guides.json?v=20261016-1')).json()));assert.equal(topics.length,15);
 console.log('PASS PWA offline: all 15 guides cached, walkthrough, acknowledgment after reload, help reopened');await c.close();
}finally{await browser.close();server.closeAllConnections();server.close()}})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
