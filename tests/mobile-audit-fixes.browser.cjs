// Local fictional pages only: never contact the school, PRONOTE or Supabase.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
// showTab intentionally does not return its asynchronous initializer. Observe the
// real call instead of racing it with the next tab after an arbitrary 150 ms.
async function openTabAndWaitForModule(page,tab){
 await page.evaluate(async tab=>{
  const names={cours:'initCoursTab',planning:'initPlanningTab',programmation:'initPlanningTab',unss:'initUnssTab',health:'initHealthTab',students:'ouvrirRepertoireEleves'};
  const name=names[tab],original=globalThis[name];let started,timer;
  if(typeof original!=='function')throw Error(`Missing initializer for ${tab}`);
  globalThis[name]=function(...args){const result=original.apply(this,args);started=Promise.resolve(result);return result;};
  try{
   showTab(tab);
   if(!started)throw Error(`Initializer not called for ${tab}`);
   await Promise.race([started,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`Initializer timed out for ${tab}`)),20000);})]);
  }finally{clearTimeout(timer);globalThis[name]=original;}
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 },tab);
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const [width,pwa] of [[320,false],[390,false],[390,true],[1440,false]]){
  const c=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  if(pwa)await c.addInitScript(()=>{const original=matchMedia;window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true,media:q,addEventListener(){},removeEventListener(){}}:original(q)});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  // Script readiness precedes the account check and the actual main view.
  await p.waitForSelector('#mainView',{state:'visible'});
  for(const tab of ['cours','planning','programmation','unss','health','students']){
   await openTabAndWaitForModule(p,tab);
   if(tab==='health')assert.equal(await p.locator('.dispense-step:visible').count(),3,'The actual three dispense steps were inspected');
   else if(tab!=='students')assert(await p.locator('.subtabbar:visible .subtabbtn').count()>1,`${tab}: the actual navigation was inspected`);
   const clipping=await p.locator('.subtabbar:visible .subtabbtn,.dispense-step:visible').evaluateAll(ns=>ns.filter(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).map(n=>n.textContent));
   assert.deepEqual(clipping,[],`${width} ${tab}: all tabs/dispense steps must fit`);
   if(tab==='students'&&width<768){
    await p.waitForSelector('.eleveTable .eleveTri');
    const small=await p.locator('.eleveTable .eleveTri,.eleveTable .eleveCoche input,.student-edit-button').evaluateAll(ns=>ns.filter(n=>{const r=n.getBoundingClientRect();return r.width<44||r.height<44}).map(n=>n.id||n.className));
    assert.deepEqual(small,[],`${width}: touch targets >=44px`);
    const checkbox=p.locator('#cocheToutesPages');await checkbox.check();assert(await checkbox.isChecked());assert.equal(await p.locator('[data-coche]:not(:checked)').count(),0);await checkbox.uncheck();assert.equal(await p.locator('[data-coche]:checked').count(),0);
    await p.locator('[data-coche]').first().check();assert(await checkbox.evaluate(n=>n.indeterminate));await checkbox.check();assert.equal(await p.locator('[data-coche]:not(:checked)').count(),0);await checkbox.uncheck();
    await p.locator('.eleveTri').first().click();
   }
  }
  await p.evaluate(()=>{showTab('outils');epsOpenTest='TROIS_500';openTool('tests');globalThis.elevesActifsPourSeance=(id,list)=>list});
  await p.locator('#toolClass').selectOption('cl-3e6');await p.waitForSelector('[data-run-student="el-3"]');
  await p.evaluate(()=>{const attach=EpsPronoteTools.attach;EpsPronoteTools.attach=(el,provider,...args)=>{if(el.id==='runningExport')window.__runningExportProvider=provider;return attach(el,provider,...args)};paintRunningSeriesTest(EpsTests.TESTS.TROIS_500)});
  const cells=p.locator('input[data-run-student="el-3"]');await cells.nth(0).fill('130');await cells.nth(1).fill('0');await cells.nth(2).fill('132');
  assert.equal(await cells.nth(1).getAttribute('aria-invalid'),'true');assert.equal(await p.locator('[data-run-score="el-3"]').innerText(),'Note : —');
  const documentRow=await p.evaluate(()=>runningDocumentData().rows.find(r=>r[0]===toolStudents.find(s=>s.id==='el-3').last_name));
  assert.equal(documentRow.at(-2),'');assert.equal(documentRow.at(-1),'Non noté');
  const pronoteRow=await p.evaluate(()=>__runningExportProvider().rows.find(r=>r.student.id==='el-3'));assert.equal(pronoteRow.score,undefined);assert.equal(pronoteRow.complete,false);
  await cells.nth(1).fill('131');assert.equal(await cells.nth(1).getAttribute('aria-invalid'),'false');assert.notEqual(await p.locator('[data-run-score="el-3"]').innerText(),'Note : —');
  await cells.nth(1).fill('-10');assert.equal(await cells.nth(1).getAttribute('aria-invalid'),'true');
  await cells.nth(1).fill('0');
  const saved=await p.evaluate(async()=>{const writes=[],original=enregistrerLigne;enregistrerLigne=async(t,row)=>{writes.push({t,row});return original(t,row)};await saveRunningSeries(EpsTests.TESTS.TROIS_500,false);enregistrerLigne=original;return writes.find(w=>w.t==='eps_test_results'&&w.row.student_id==='el-3').row});
  assert.match(saved.input_unit,/:times:130\|0\|132$/);assert.match(saved.result_unit,/en cours/);assert.equal(saved.result_value,0);
  assert.deepEqual(errors,[]);console.log(`PASS mobile fixes ${width}${pwa?' PWA':''}: tabs, dispense steps, student touch targets, invalid 3x500 display/export/draft`);await c.close();
 }
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
