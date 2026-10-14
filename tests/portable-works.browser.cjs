const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),reports=path.resolve(root,'../installation-manager-current/app/build/reports');
const android=JSON.parse(fs.readFileSync(path.join(reports,'portable-fixtures.json'),'utf8'));
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});let incoming=android;try{
for(const width of [1280,390]){
 const c=await browser.newContext({viewport:{width,height:900},hasTouch:width===390,isMobile:width===390,serviceWorkers:'block'});await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});await c.addInitScript(rows=>{__fauxServeur.DONNEES.eps_saved_tool_works=rows},incoming);
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?'Interop':undefined));await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
 await p.evaluate(()=>{window.__portableWrites=[];const save=enregistrerLigne;enregistrerLigne=async(table,row)=>{const result=await save(table,row);if(table==='eps_saved_tool_works'){__portableWrites.push(structuredClone(row));const a=__fauxServeur.DONNEES.eps_saved_tool_works,index=a.findIndex(w=>w.id===row.id);index<0?a.push(row):a[index]=row}return result}});
 for(const row of incoming){
  console.log('OPEN',width,row.type);
  await p.evaluate(async id=>{showTab('outils');resetToolsWorkspace();toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';const w=(await EpsToolWorks.read()).find(w=>w.id===id);if(w.compatibilityError)throw Error(w.compatibilityError);switch(w.type){case 'speed':case 'impacts':await renderPersistedTool(w.type,w);break;case 'multi-free':await renderMultiChronoWeb({freeWork:w});break;default:await ({measures:renderMeasures,effort:renderEffortWeb,random:renderRandomWeb,tournament:renderTournamentWeb,observer:renderObserverWeb,rotations:renderRotationsWeb})[w.type](w)}},row.id);
  await p.waitForTimeout(200);
  const data=await p.evaluate(()=>EpsToolActionMenus.documentData(toolPanel));assert(data?.headers?.length,`${row.type}: empty renderer`);
  if(row.type==='measures'){assert.equal(await p.locator('#measureDistance').inputValue(),'500');assert.equal(await p.locator('#measureMinutes').inputValue(),'2.5')}
  if(row.type==='effort')assert.equal(await p.locator('#effAge').inputValue(),'15');
  if(row.type==='speed')assert(await p.evaluate(()=>speedTimes['el-0'][1]===15));
  if(row.type==='impacts')assert.equal(await p.evaluate(()=>impactParEleve['el-0'][0].x),320);
  if(row.type==='multi-free')assert((await p.locator('#multiWorkspace').innerText()).includes('00:15'));
  const before=await p.evaluate(()=>__portableWrites.length);
  await p.locator('#toolPanel .tool-direct-actions').first().getByRole('button',{name:/Enregistrer/}).first().click();
  const name=p.locator('#toolSaveConfirm');if(await name.count())await name.click();
  await p.waitForFunction(n=>__portableWrites.length>n,before,{timeout:10000});
  const written=await p.evaluate(()=>__portableWrites.at(-1));const payload=JSON.parse(written.payload);
  assert.equal(written.id,row.id);assert.equal(written.class_id,'cl-3e6');assert.equal(written.period_number,2);assert.equal(written.created_at,'2026-10-01T10:00:00Z');assert.equal(payload.opaque.keep,true);assert.equal(payload._epsWorkVersion,1);
  if(row.type==='observer')assert.equal(payload.values['el-0']['Réussi'],4);
  if(row.type==='rotations')assert.equal(payload.assignments['el-0'],'g1');
  if(row.type==='multi-free'){assert.equal(payload.timers[0].ms,15432);assert.deepEqual(payload.timers[0].laps,[5000,10000]);assert.equal(payload.timers[0].enabled,false)}
  console.log('PASS roundtrip',width,row.type);
 }
 incoming=await p.evaluate(()=>__portableWrites);assert.equal(incoming.length,9);assert.deepEqual(errors,[]);
 const fromClass=await p.evaluate(async()=>{const cls=__fauxServeur.DONNEES.classes.find(c=>c.id==='cl-3e6');await openClassDashboard(cls,cls.name);return dashboardTests.filter(t=>t.id==='portable-multi-free').length});assert.equal(fromClass,1);
 // A canonical tombstone hides the old test-session representation, not just its new card.
 const tomb=await p.evaluate(async()=>{const r=__fauxServeur.DONNEES.eps_saved_tool_works.find(w=>w.type==='multi-free');await enregistrerLigne('eps_saved_tool_works',{...r,deleted:true,updated_at:new Date().toISOString()});const tests=await EpsPortableWorks.classTests([{id:r.id,test_name:'Multi-chrono'}],r.class_id);return tests.some(t=>t.id===r.id)});assert.equal(tomb,false);
 await c.close();
}
fs.writeFileSync(path.join(reports,'portable-browser-return.json'),JSON.stringify(incoming,null,2));
}finally{await browser.close();server.closeAllConnections();server.close()}})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
