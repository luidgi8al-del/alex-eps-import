// Full application + real persistent browser profile; only synthetic account/server data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'eps-offline-session-'));
const fixture=fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8');
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':/\.(json|webmanifest)$/.test(file)?'application/json':'text/html'});res.end(e?'':b)})});
let context;
async function launch(offline){
 context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:390,height:844},serviceWorkers:'allow'});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await context.addInitScript({content:`
 const realSet=Storage.prototype.setItem,realGet=Storage.prototype.getItem,realRegister=navigator.serviceWorker.register.bind(navigator.serviceWorker);
 ${fixture}
 Storage.prototype.setItem=realSet;Storage.prototype.getItem=realGet;navigator.serviceWorker.register=realRegister;
 if(!localStorage.getItem('alex_eps_session'))localStorage.setItem('alex_eps_session',JSON.stringify({access_token:'fixture-expired-token',refresh_token:'fixture-refresh',user_id:'prof-test',email:'test@exemple.fr'}));
 __fauxServeur.DONNEES.eps_schema_marks.push({name:'as_slot_assignments'});
 window.__arrived=[];const fakeFetch=window.fetch;
 window.fetch=async(url,opts={})=>{
  if(!navigator.onLine&&String(url).includes('supabase.co'))throw new TypeError('Failed to fetch');
  if(String(url).includes('/rest/v1/')&&!String(url).includes('/rpc/')&&['POST','PATCH'].includes(opts.method)){
   const table=__fauxServeur.table(url),value=JSON.parse(opts.body),rows=__fauxServeur.DONNEES[table]||=[];
   for(const row of [].concat(value)){const index=rows.findIndex(r=>r.id===row.id);index<0?rows.push(row):rows[index]={...rows[index],...row};__arrived.push({table,row})}
  }
  return fakeFetch(url,opts);
 };`});
 await context.setOffline(offline);const p=await context.newPage();p.setDefaultTimeout(15000);p.on('dialog',d=>d.accept());return p;
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/index.html`;
 try{
  let p=await launch(false);await p.goto(url);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);await p.waitForFunction(()=>automaticOfflineState==='ready',null,{timeout:90000});
  // The class and students are read through the actual offline repository, not mocked UI stores.
  await context.setOffline(true);
  await p.evaluate(async()=>{showTab('outils');await loadToolClasses();toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';epsOpenCategory='Athle';epsOpenTest='TROIS_500';toolClassId=FREE_USE;await renderEpsTests()});
  await p.locator('#toolClass').selectOption('cl-3e6');await p.locator('#epsBegin').click();
  await p.locator('#runningManageGroups').click();await p.locator('[data-running-group-student="el-0"]').check();await p.locator('#runningSaveGroup').click();
  for(let n=0;n<3;n++){const field=p.locator(`input[data-run-student="el-0"][data-run-index="${n}"]`);await field.fill(['215','220','218'][n]);await field.press('Enter')}
  await p.locator('#runningSave').click();await p.waitForFunction(()=>!!runningSessionId);
  const expected=await p.evaluate(async()=>({id:runningSessionId,values:runningValues['el-0'],groups:runningGroups,pending:await(await import('./pwa/sync/outbox.js')).countPendingOperations()}));
  assert(expected.pending>0);assert.deepEqual(expected.values,['215','220','218']);assert.deepEqual(expected.groups,[['el-0']]);
  // Close the whole isolated browser, not just reload a tab. Reuse the on-disk profile offline.
  await context.close();context=null;p=await launch(true);await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  assert.equal(await p.evaluate(()=>navigator.onLine),false);assert.equal(await p.locator('#mainView').isVisible(),true);
  await p.evaluate(async id=>{await demarrerModeHorsConnexion();await ouvrirSessionTestDepuisClasse(id,'cl-3e6',1,'3 × 500 m')},expected.id);
  await p.waitForSelector('input[data-run-student="el-0"]');
  assert.deepEqual(await p.evaluate(()=>runningValues['el-0']),expected.values);assert.deepEqual(await p.evaluate(()=>runningGroups),expected.groups);
  assert.equal(await p.evaluate(async()=>await(await import('./pwa/sync/outbox.js')).countPendingOperations()),expected.pending);
  await context.setOffline(false);await p.evaluate(async()=>{await(await demarrerModeHorsConnexion()).synchroniser()});
  await p.waitForFunction(async()=>await(await import('./pwa/sync/outbox.js')).countPendingOperations()===0);
  const arrivals=await p.evaluate(id=>__arrived.filter(x=>x.row.id===id||x.row.session_id===id),expected.id);
  assert.equal(arrivals.filter(x=>x.table==='eps_test_sessions').length,1);const results=arrivals.filter(x=>x.table==='eps_test_results');assert.equal(results.length,1);assert.match(results[0].row.input_unit,/times:215\|220\|218/);assert.match(results[0].row.input_unit,/:group:0:/);
  await p.evaluate(async()=>{await(await demarrerModeHorsConnexion()).synchroniser()});assert.equal(await p.evaluate(id=>__arrived.filter(x=>x.row.id===id||x.row.session_id===id).length,expected.id),arrivals.length);
  console.log('PASS full PWA session: prepare online, class/group/3 typed results offline, save, entire browser close and restart offline from disk, same results/groups/pending queue, reconnect to fake server once without duplicates. No real account or server used.');
 }finally{await context?.close();server.closeAllConnections();server.close();if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('eps-offline-session-'))fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
