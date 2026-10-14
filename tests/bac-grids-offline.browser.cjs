const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const c=await browser.newContext({viewport:{width:390,height:844}});
 await c.addInitScript({content:`const savedSet=Storage.prototype.setItem;const savedRegister=navigator.serviceWorker.register.bind(navigator.serviceWorker);${fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')};Storage.prototype.setItem=savedSet;navigator.serviceWorker.register=savedRegister;__fauxServeur.DONNEES.eps_schema_marks.push({name:'as_slot_assignments'});const fake=window.fetch;window.fetch=(url,opts)=>!navigator.onLine&&String(url).includes('supabase.co')?Promise.reject(new TypeError('Failed to fetch')):fake(url,opts);`});
 const p=await c.newPage();p.on('dialog',d=>d.accept());
 await p.goto(`http://127.0.0.1:${server.address().port}/index.html`);await p.evaluate(()=>demarrerModeHorsConnexion());await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForFunction(()=>automaticOfflineState==='ready',null,{timeout:120000});
 await c.setOffline(true);await p.reload();await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);await p.evaluate(()=>demarrerModeHorsConnexion());
 const saved=[];
 for(const activity of Object.keys(require('../bac-rubrics.js'))){
  await p.evaluate(async activity=>{const s=EpsBacRubrics[activity],v={degrees:[],notes:[],choices:[],params:{},observation:'Hors ligne'};for(const field of s.fields||[])v.params[field.key]=field.options[0][0];s.criteria.forEach((c,i)=>{v.degrees[i]=0;v.notes[i]=c.choices?c.choices[0][0].value:c.degrees[0].range[0];v.choices[i]=c.choices?0:null});showTab('outils');toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';await renderBacGridWeb({classId:'cl-3e6',period:1,title:s.label+' hors ligne',payload:{rubricVersion:1,activity,values:{'el-0':v},groups:[{id:'g',name:'Groupe terrain'}],assignments:{'el-0':'g'},activeGroup:'g'}})},activity);
  await p.locator('#toolPanel .tool-direct-actions').first().getByRole('button',{name:/Enregistrer/}).first().click();if(await p.locator('#toolSaveConfirm').count())await p.locator('#toolSaveConfirm').click();await p.waitForFunction(()=>document.getElementById('wfStatus')?.textContent.startsWith('Enregistré'));
  const work=await p.evaluate(async activity=>(await EpsToolWorks.read()).find(w=>w.type==='bac-grid'&&w.payload.activity===activity),activity);assert(work);saved.push(work);
 }
 await p.reload();await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);await p.evaluate(()=>demarrerModeHorsConnexion());
 for(const work of saved){
  const reopened=await p.evaluate(async id=>{const w=(await EpsToolWorks.read()).find(w=>w.id===id);showTab('outils');toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';await renderBacGridWeb(w);return w},work.id);assert.deepEqual(reopened.payload,work.payload);
  await p.locator('[data-grid-info="0:0"]').click();assert((await p.locator('dialog .bac-description').textContent()).length>20);await p.locator('dialog [data-close]').click();assert.equal(await p.locator('#bacObservation').inputValue(),'Hors ligne');
 }
 const pending=await p.evaluate(async()=>{const {countPendingOperations}=await import('./pwa/sync/outbox.js');return countPendingOperations()});assert(pending>=9);
 await p.evaluate(()=>{const prev=fetch;window.__arrived=[];window.fetch=async(url,opts={})=>{if(String(url).includes('/rest/v1/eps_saved_tool_works')&&['POST','PATCH'].includes(opts.method))window.__arrived.push(JSON.parse(opts.body));return prev(url,opts)}});
 await c.setOffline(false);await p.evaluate(async()=>{await(await demarrerModeHorsConnexion()).synchroniser()});await p.waitForFunction(()=>new Set(__arrived.filter(r=>r.type==='bac-grid').map(r=>JSON.parse(r.payload).activity)).size===9);
 const arrived=await p.evaluate(()=>__arrived.filter(r=>r.type==='bac-grid'));for(const w of saved)assert(arrived.some(r=>r.id===w.id&&JSON.parse(r.payload).activity===w.payload.activity));
 console.log('PASS nine grids: PWA offline reload, full descriptors, notes/groups saved, second reload, queued sync to simulated server');await c.close();
}finally{await browser.close();server.closeAllConnections();server.close()}})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
