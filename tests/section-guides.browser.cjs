const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),reports=path.join(root,'../tmp/section-guides');fs.mkdirSync(reports,{recursive:true});
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390,320]){
  const c=await browser.newContext({viewport:{width,height:900},isMobile:width<600,serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8').replace('Storage.prototype.setItem = function () { /* le banc d\'essai n\'ecrit rien */ };','/* isolated preferences */')});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  for(const topic of ['home','classes','cours','planning','programmation','equipement','unss','outils','health','students','emails','help','settings']){
   await p.evaluate(t=>{document.getElementById('settingsOverlay').classList.remove('open');showTab(t)},topic);
   await p.waitForSelector('.section-guide');
   if(topic==='classes')await p.evaluate(()=>document.getElementById('classeSelecteurOverlay').classList.remove('open'));
   await p.waitForFunction(t=>{const id=document.querySelector('.section-guide')?.dataset.guideTopic;return id===t||t==='classes'&&id==='class-detail'},topic);
   await p.locator('[data-section-help]').click();await p.locator('[data-section-start]').click();
   assert.equal(await p.locator('.section-guide').count(),1);
   await p.locator('[data-section-next]').click();await p.locator('[data-section-back]').click();await p.locator('[data-section-next]').click();await p.locator('[data-section-next]').click();
   await p.locator('[data-section-next]').click();assert.equal(await p.locator('.section-guide-content').count(),0);
   if(topic==='home'||topic==='settings'){await p.locator('[data-section-help]').click();await p.locator('[data-section-start]').click();await p.screenshot({path:path.join(reports,`${topic}-${width}.png`)});await p.locator('[data-section-exit]').click()}
   assert(await p.locator('.section-guide').evaluate(e=>e.getBoundingClientRect().right<=innerWidth+2),'guide fits viewport');
  }
  await p.reload();await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);await p.evaluate(()=>showTab('home'));await p.waitForSelector('[data-section-help]');assert.equal(await p.locator('.section-guide-content').count(),0);
  await p.evaluate(()=>{session.user_id='second-teacher';EpsSectionGuides.refresh()});await p.waitForSelector('[data-section-start]');
  await p.evaluate(()=>{showTab('outils');epsOpenTest='TROIS_500';openTool('tests')});await p.waitForSelector('[data-running-help]');await p.waitForFunction(()=>!document.querySelector('.section-guide'));
  assert.deepEqual(errors,[]);console.log('All main guides OK',width);await c.close();
 }
 const c=await browser.newContext({viewport:{width:390,height:844}});await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const p=await c.newPage();
 await p.goto(`http://127.0.0.1:${server.address().port}/responsable-installations.html?android=1`);assert.equal(await p.locator('.section-guide').count(),0);
 await p.evaluate(()=>{document.getElementById('authPage').hidden=true;const page=document.getElementById('managerPage');page.dataset.guideOwner='manager-test';page.hidden=false});await p.waitForSelector('[data-guide-topic="manager"]');
 await p.locator('[data-section-start]').click();assert.match(await p.locator('.section-guide').innerText(),/signalements/);assert(!/Classe|E-mails/.test(await p.locator('.section-guide').innerText()));
 await p.screenshot({path:path.join(reports,'manager-390.png')});await p.evaluate(()=>{document.getElementById('managerPage').hidden=true;document.getElementById('authPage').hidden=false});await p.waitForFunction(()=>!document.querySelector('.section-guide'));await c.close();
 console.log('Manager guide: hidden before authorization, installations only');
}finally{await browser.close();server.closeAllConnections();server.close()}})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
