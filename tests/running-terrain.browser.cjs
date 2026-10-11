const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const f=path.join(root,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
for(const mode of ['desktop','mobile','pwa']){
 const c=await browser.newContext({viewport:mode==='desktop'?{width:1440,height:950}:{width:390,height:844},isMobile:mode!=='desktop',hasTouch:mode!=='desktop',serviceWorkers:'block'});
 await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await c.addInitScript({content:"const testSetItem=Storage.prototype.setItem;\n"+fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')+"\nStorage.prototype.setItem=testSetItem;"});
 if(mode==='pwa')await c.addInitScript(()=>{const m=matchMedia;window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true,addEventListener(){},removeEventListener(){}}:m(q)});
 const p=await c.newPage(),errors=[];p.setDefaultTimeout(18000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
 await p.evaluate(async()=>{
  const read=lireTable;window.trialDb={};lireTable=async(table,url,options)=>{if(['eps_test_sessions','eps_test_results'].includes(table)){let rows=Object.values(trialDb[table]||{});for(const [k,v] of new URL('http://fixture/'+url).searchParams)if(v.startsWith('eq.'))rows=rows.filter(r=>String(r[k])===v.slice(3));return rows;}return read(table,url,options);};
  enregistrerLigne=async(table,row)=>{trialDb[table]??={};trialDb[table][row.id]=structuredClone(row);const rows=__fauxServeur.DONNEES[table];if(rows){const i=rows.findIndex(r=>r.id===row.id);if(i<0)rows.push(structuredClone(row));else rows[i]=structuredClone(row);}if(window.trialFail&&table==='eps_test_results')throw Error('Écriture interrompue pour le test');};
  showTab('outils');toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';toolPanel.classList.add('modern-tool-panel');
  await loadToolClasses();toolClassId='cl-3e6';await loadToolStudents(toolClassId);epsOpenTest='TROIS_500';epsTestStarted=true;resetRunningSession();drawEpsTests();
 });await p.locator('#runningTerrainToggle').waitFor();assert.match(await p.locator('#runningTerrainToggle').innerText(),/Essayer/);await p.locator('#runningTerrainToggle').click();
 assert.equal(await p.locator('#runningTerrainPreparation').isVisible(),true);assert.equal(await p.locator('.running-grid-wrap').isVisible(),false);
 await p.locator('#runningAutoGroups').click();assert.equal(await p.evaluate(()=>runningGroups.length),2);await p.locator('#runningTerrainBegin').click();
 assert.equal(await p.locator('#runningTerrainPreparation').isVisible(),false);assert.equal(await p.locator('.running-settings').isVisible(),false);assert.equal(await p.locator('.running-grid-wrap').isVisible(),true);
 const inputs=p.locator('input[data-run-student]');const first=await inputs.nth(0).getAttribute('data-run-student');
 await inputs.nth(0).fill('315');await inputs.nth(0).press('Enter');assert.equal(await inputs.nth(1).evaluate(e=>e===document.activeElement),true);
 await inputs.nth(1).fill('320');await inputs.nth(1).press('Enter');await inputs.nth(2).fill('325');await inputs.nth(2).press('Enter');assert.equal(await inputs.nth(3).evaluate(e=>e===document.activeElement),true);
 assert.match(await p.locator('#runningTerrainProgress').innerText(),/1 \/ 8/);
 await p.locator('#runningTerrainGroup').selectOption('1');await inputs.nth(0).fill('330');await inputs.nth(0).press('Enter');
 const second=await inputs.nth(0).getAttribute('data-run-student');
 await p.locator('#runningTerrainEdit').click();assert.equal(await p.locator('.running-settings').isVisible(),true);await p.locator('#runningTerrainBegin').click();assert.equal(await p.locator('#runningTerrainGroup').inputValue(),'1');assert.equal(await inputs.nth(0).inputValue(),'330');
 await p.evaluate(()=>window.trialFail=true);await p.locator('#runningTerrainLater').click();await p.waitForFunction(()=>document.getElementById('runningTerrainMessage')?.textContent.includes('non confirmé'));assert.equal(await inputs.nth(0).inputValue(),'330');const retryId=await p.evaluate(()=>runningSessionId);
 await p.evaluate(()=>window.trialFail=false);await p.locator('#runningTerrainLater').click();await p.locator('#runningTerrainResume').waitFor();const id=await p.evaluate(()=>runningSessionId);assert(id);assert.equal(id,retryId);assert.match(await p.locator('.running-terrain-bilan').innerText(),/prête à reprendre/);
 await p.locator('#runningTerrainResume').click();assert.equal(await p.locator('#runningTerrainGroup').inputValue(),'1');assert.equal(await inputs.nth(0).inputValue(),'330');assert.equal(await inputs.nth(1).evaluate(e=>e===document.activeElement),true);
 await p.evaluate(async sessionId=>{resetRunningSession();await openRunningSession(sessionId,EpsTests.TESTS.TROIS_500)},id);assert.equal(await p.locator('#runningTerrainGroup').inputValue(),'1');assert.equal(await inputs.nth(0).inputValue(),'330');
 await p.locator('#runningTerrainGroup').selectOption('0');assert.equal(await p.locator(`input[data-run-student="${first}"][data-run-index="0"]`).inputValue(),'315');
 await p.locator('#runningTerrainFinish').click();await p.locator('#runningTerrainResume').waitFor();assert.match(await p.locator('.running-terrain-bilan').innerText(),/7 à compléter/);assert.equal(await p.evaluate(()=>Object.keys(trialDb.eps_test_sessions).length),1);
 await p.locator('#runningTerrainClass').click();await p.locator(`[data-ec-open-test="${id}"]`).first().waitFor();await p.locator(`[data-ec-open-test="${id}"]`).first().click();await p.locator('#runningTerrainToggle').waitFor();
 await p.locator('#runningTerrainToggle').click();assert.equal(await p.locator('#epsEditPreparation').isVisible(),true);assert.equal(await p.locator('#runningSave').isVisible(),true);assert.equal(await p.evaluate(()=>runningValues[Object.keys(runningValues).find(k=>runningValues[k][0]==='315')][0]),'315');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);console.log('PASS',mode,'prepare, groups, Enter, save, resume, current UI preserved');await c.close();
}
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
