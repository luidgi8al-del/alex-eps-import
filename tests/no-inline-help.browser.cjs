const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),reports=path.join(root,'../tmp/no-inline-help');fs.mkdirSync(reports,{recursive:true});
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390]){
  const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  for(const topic of ['home','classes','cours','planning','programmation','equipement','unss','outils','health','students','emails','help','settings']){
   await p.evaluate(t=>{document.getElementById('settingsOverlay').classList.remove('open');showTab(t)},topic);
   assert.equal(await p.locator('.section-guide,.running-guide-card,[data-running-help],[data-section-help]').count(),0);
   if(topic==='home')await p.screenshot({path:path.join(reports,`home-${width}.png`)});
   if(topic==='help')assert(await p.locator('.helpTopic').count()>0,'main Help still contains its topics');
  }
  await p.evaluate(()=>{document.getElementById('settingsOverlay').classList.remove('open');showTab('outils');epsOpenTest='TROIS_500';openTool('tests')});
  await p.waitForSelector('.running-grid');assert.equal(await p.locator('.section-guide,.running-guide-card,[data-running-help]').count(),0);
  assert.deepEqual(errors,[]);await c.close();console.log('PASS no extra help row, all main tabs and 3x500:',width);
 }
 const manager=await browser.newContext({viewport:{width:390,height:844}});
 await manager.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const mp=await manager.newPage();await mp.goto(`http://127.0.0.1:${server.address().port}/responsable-installations.html?android=1`);
 await mp.evaluate(()=>{document.getElementById('authPage').hidden=true;const page=document.getElementById('managerPage');page.dataset.guideOwner='manager-test';page.hidden=false});
 assert.equal(await mp.locator('.section-guide,[data-section-help]').count(),0);await manager.close();console.log('PASS manager page: no inline help');
 const c=await browser.newContext({viewport:{width:390,height:844}});
 await c.addInitScript({content:`const savedSet=Storage.prototype.setItem;const savedRegister=navigator.serviceWorker.register.bind(navigator.serviceWorker);${fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')};Storage.prototype.setItem=savedSet;navigator.serviceWorker.register=savedRegister;__fauxServeur.DONNEES.eps_schema_marks.push({name:'as_slot_assignments'});const fake=window.fetch;window.fetch=(url,opts)=>!navigator.onLine&&String(url).includes('supabase.co')?Promise.reject(new TypeError('Failed to fetch')):fake(url,opts);`});
 const p=await c.newPage();await p.goto(`http://127.0.0.1:${server.address().port}/index.html`);await p.evaluate(()=>demarrerModeHorsConnexion());await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForFunction(()=>automaticOfflineState==='ready',null,{timeout:120000});await c.setOffline(true);await p.reload();await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
 assert.equal(await p.locator('.section-guide,[data-section-help]').count(),0);await p.evaluate(()=>showTab('help'));assert(await p.locator('.helpTopic').count()>0);await c.close();console.log('PASS PWA offline: no inline help, main help remains available');
}finally{await browser.close();server.closeAllConnections();server.close()}})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
