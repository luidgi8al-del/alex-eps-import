const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(p).isDirectory())p=path.join(p,'index.html');res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8').replace('const MAINTENANT = new Date().toISOString();',"const MAINTENANT = '2020-01-01T00:00:00Z';").replace('Storage.prototype.setItem = function () { /* le banc d\'essai n\'ecrit rien */ };','/* isolated context: real local storage for recovery */')});const p=await context.newPage();p.on('dialog',d=>d.accept());
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof EpsToolResume==='object');
  await p.evaluate(()=>{globalThis.elevesActifsPourSeance=(id,list)=>list;showTab('outils');resetToolsWorkspace();epsOpenTest='TROIS_500';openTool('tests')});
  await p.locator('#toolClass').selectOption('cl-3e6');await p.waitForSelector('[data-run-student="el-3"]');
  const student=await p.locator('[data-run-student]').first().getAttribute('data-run-student');await p.locator('[data-run-student]').first().fill('315');
  assert.equal(await p.evaluate(id=>EpsToolResume.read().payload.values[id][0],student),'315');
  await p.evaluate(()=>closeModernTool());await p.waitForSelector('.tool-resume-card');assert.match(await p.locator('.tool-resume-card').innerText(),/Brouillon/);
  await p.reload();await p.waitForFunction(()=>typeof EpsToolResume==='object');await p.waitForTimeout(900);await p.evaluate(()=>{showTab('outils');resetToolsWorkspace()});await p.locator('.tool-resume-card').click();
  await p.waitForSelector(`[data-run-student="${student}"]`);assert.equal(await p.locator(`[data-run-student="${student}"]`).first().inputValue(),'315');
  await p.locator('#runningManageGroups').click();await p.locator('[data-running-group-student]').first().check();await p.locator('#runningSaveGroup').click();const before=await p.evaluate(()=>structuredClone(runningGroups));
  await p.locator('[data-running-group="0"]').dispatchEvent('pointerdown',{clientX:10,clientY:10});await p.waitForTimeout(700);await p.locator('[data-running-group="0"]').dispatchEvent('pointerup',{clientX:10,clientY:10});
  await p.locator(`[data-running-group-student="${before[0][0]}"]`).uncheck();await p.locator('#runningSaveGroup').click();assert.equal(await p.evaluate(()=>runningGroups[0].length),0);await p.locator('#toolUndo').click();assert.deepEqual(await p.evaluate(()=>runningGroups),before);
  await p.evaluate(()=>{session.user_id='different-account'});assert.equal(await p.evaluate(()=>EpsToolResume.read()),null);await p.evaluate(()=>{session.user_id='prof-test';closeModernTool()});
  await p.evaluate(async()=>await openSettings());await p.waitForSelector('#settingsCategories');
  for(const cat of ['account','sync','visual','admin']){await p.locator(`[data-settings-category="${cat}"]`).click();assert.equal(await p.locator('[data-settings-group]:visible').evaluateAll((nodes,c)=>nodes.every(n=>n.dataset.settingsGroup===c),cat),true);assert((await p.locator(`[data-settings-group="${cat}"]:visible`).count())>0);}
  await context.close();
 }
 console.log('PASS desktop/mobile: fast close/reload resumes exact 3x500 draft, undo group removal, account isolation, four settings categories');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
