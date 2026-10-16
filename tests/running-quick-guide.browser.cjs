const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),reports=path.join(root,'../tmp/running-guide');fs.mkdirSync(reports,{recursive:true});
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390,320]){
  const c=await browser.newContext({viewport:{width,height:900},isMobile:width<600,serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8').replace('Storage.prototype.setItem = function () { /* le banc d\'essai n\'ecrit rien */ };','/* isolated storage */')});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  const open=async()=>{await p.evaluate(()=>{showTab('outils');resetToolsWorkspace();epsOpenTest='TROIS_500';openTool('tests')});await p.waitForSelector('[data-running-help]')};
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);await open();
  await p.waitForSelector('[data-guide-start]');await p.locator('[data-guide-start]').click();assert.match(await p.locator('.running-guide-card').innerText(),/1 \/ 4/);
  await p.locator('#toolClass').selectOption('cl-3e6');await p.waitForSelector('[data-run-student="el-3"]');
  await p.locator('[data-guide-next]').click();assert.match(await p.locator('.running-guide-card').innerText(),/2 \/ 4/);
  await p.locator('#runningManageGroups').click();await p.locator('[data-running-group-student]').first().check();await p.locator('#runningSaveGroup').click();
  await p.locator('[data-guide-next]').click();await p.locator('[data-run-student]').first().fill('315');
  const before=await p.evaluate(()=>JSON.stringify({values:runningValues,groups:runningGroups}));
  await p.locator('[data-guide-next]').click();assert.match(await p.locator('.running-guide-card').innerText(),/4 \/ 4/);
  await p.screenshot({path:path.join(reports,`guide-save-${width}.png`)});
  await p.locator('[data-guide-exit]').click();assert.equal(await p.locator('.running-guide-card').count(),0);
  await p.locator('[data-running-help]').click();await p.locator('[data-guide-done]').click();
  assert.equal(await p.evaluate(()=>JSON.stringify({values:runningValues,groups:runningGroups})),before,'help must preserve times and groups');
  assert.equal(await p.evaluate(()=>localStorage.getItem(`eps_tool_help:${session.user_id}:TROIS_500:v1`)),'done');
  await p.reload();await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);await open();await p.waitForTimeout(100);
  assert.equal(await p.locator('.running-guide-card').count(),0,'acknowledgment survives reload');
  await p.locator('[data-running-help]').click();await p.locator('[data-guide-start]').click();
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
  await p.screenshot({path:path.join(reports,`guide-class-${width}.png`)});
  await p.evaluate(()=>{session.user_id='second-teacher';EpsRunningQuickGuide.attach()});await p.waitForSelector('[data-guide-start]');
  await p.evaluate(()=>{epsOpenTest='SPRINT_30';drawEpsTests()});await p.waitForTimeout(150);assert.equal(await p.locator('[data-running-help],.running-guide-card').count(),0,'only classic 3x500');
  assert.deepEqual(errors,[]);console.log('quick guide OK',width);await c.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
