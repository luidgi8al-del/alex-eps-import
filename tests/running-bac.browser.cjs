const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));}catch{res.statusCode=404;res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390]){
  const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});const p=await c.newPage(),errors=[],alerts=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{alerts.push(d.message());d.accept()});
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForSelector('#mainView[style*="block"]');
  await p.evaluate(async()=>{await demarrerModeHorsConnexion();
   globalThis.bacTestStore=structuredClone(__fauxServeur.DONNEES);for(const table of ['eps_test_sessions','eps_test_results','evaluations','evaluation_criteria','evaluation_scores'])bacTestStore[table]=[];
   modeHorsConnexion={lire:async(table,options={})=>({rows:(bacTestStore[table]||[]).filter(r=>!r.deleted&&(!options.ou||options.ou(r)))}),enregistrer:async(table,id,row)=>{bacTestStore[table]||=[];const i=bacTestStore[table].findIndex(r=>r.id===id);if(i>=0)bacTestStore[table][i]=structuredClone(row);else bacTestStore[table].push(structuredClone(row));}};
   lireTable=async(table,query,options={})=>(bacTestStore[table]||[]).filter(r=>!r.deleted&&(!options.ou||options.ou(r)));
   enregistrerLigne=async(table,row)=>modeHorsConnexion.enregistrer(table,row.id,row);
   showTab('outils');epsOpenCategory='Athle';epsOpenTest='TROIS_500';openTool('tests');
  });
  await p.locator('#toolClass').selectOption('cl-3e6');await p.waitForSelector('#runningIsBac');await p.waitForFunction(()=>RunningBac.state.cycles.length>0);await p.waitForTimeout(350);
  await p.locator('#runningIsBac').check();await p.waitForSelector('[data-bac-afl23]');
  const id=await p.locator('[data-bac-afl23]').first().getAttribute('data-bac-afl23');await p.evaluate(id=>{runningValues[id]=['315','318','320'];paintRunningSeriesTest(EpsTests.TESTS.TROIS_500)},id);
  await p.locator(`[data-bac-afl23="${id}"]`).fill('9');await p.evaluate(()=>saveRunningSeries(EpsTests.TESTS.TROIS_500,false));assert.match(alerts.pop(),/0 et 8/);assert.equal(await p.evaluate(()=>bacTestStore.evaluations.length),0);
  await p.locator(`[data-bac-afl23="${id}"]`).fill('5');
  const afl1=await p.evaluate(id=>runningSummary(toolStudents.find(s=>String(s.id)===id)).total,id);
  await p.evaluate(()=>saveRunningSeries(EpsTests.TESTS.TROIS_500,false));
  let data=await p.evaluate(()=>bacTestStore);assert.equal(data.evaluations.length,1);assert.equal(data.evaluations[0].type,'FINALE');assert.equal(data.evaluation_criteria.length,2);assert.deepEqual(data.evaluation_criteria.map(r=>r.max_points),[12,8]);
  const source=await p.evaluate(()=>runningSessionId);assert(data.eps_test_results.every(r=>r.input_unit.includes(':bac:1:')));
  await p.evaluate(id=>openRunningSession(id,EpsTests.TESTS.TROIS_500),source);assert.equal(await p.locator('#runningIsBac').isChecked(),true);assert.equal(await p.locator(`[data-bac-afl23="${id}"]`).inputValue(),'5');
  await p.locator(`[data-bac-afl23="${id}"]`).fill('6');await p.evaluate(()=>saveRunningSeries(EpsTests.TESTS.TROIS_500,false));
  data=await p.evaluate(()=>bacTestStore);assert.equal(data.evaluations.length,1);assert.equal(data.evaluation_criteria.length,2);const af1row=data.evaluation_scores.find(r=>r.student_id===id&&r.criterion_id.endsWith('-afl1')),af23row=data.evaluation_scores.find(r=>r.student_id===id&&r.criterion_id.endsWith('-afl23'));assert.equal(af1row.points,afl1);assert.equal(af23row.points,6);
  const missing=data.evaluation_scores.filter(r=>r.student_id!==id);assert(missing.every(r=>r.points===null&&r.deleted));
  assert.equal(await p.locator(`[data-bac-total="${id}"]`).innerText(),(afl1+6).toLocaleString('fr-FR',{maximumFractionDigits:2}));
  if(width===390)assert.equal(await p.locator('#runningBacPanel table').evaluate(t=>t.scrollWidth>t.parentElement.clientWidth),false);
  await fs.promises.mkdir(path.join(root,'output/running-bac'),{recursive:true});await p.screenshot({path:path.join(root,`output/running-bac/bac-${width}.png`),fullPage:true});assert.deepEqual(alerts,[]);assert.deepEqual(errors,[]);await c.close();
 }
 console.log('PASS BAC 3x500 desktop/mobile: marker and AFL persist; two criteria /12 + /8; same final updated; no duplicate; missing is not zero');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
