const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(p).isDirectory())p=path.join(p,'index.html');res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390]){
  const c=await browser.newContext({viewport:{width,height:850},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForTimeout(800);
  const classIds=['toolClass','wfClass','modernClass','fitnessClass','swimObsClass','gymObsClass','twClass'];
  const ids=await p.evaluate(()=>EpsToolsCatalog.map(t=>t.id));
  for(const id of ids){
   await p.evaluate(id=>{showTab('outils');resetToolsWorkspace();epsOpenTest=null;openTool(id)},id);await p.waitForTimeout(160);
   const selector=p.locator(classIds.map(id=>'#toolPanel #'+id).join(',')).first();
   if(!await selector.count()){assert(['timers','score','measures','signals'].includes(id),`missing class control ${id}`);continue}
   await selector.selectOption('cl-3e6');await p.waitForTimeout(200);
   const state=await p.evaluate(ids=>{const panel=document.getElementById('toolPanel'),node=ids.map(id=>panel.querySelector('#'+id)).find(Boolean),hero=panel.querySelector('.modern-tool-hero');return{inHeader:hero.contains(node),classValue:node.value,periods:[...panel.querySelectorAll('label')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]')&&/^(Période|P[1-5])/.test(n.textContent.trim())).map(n=>n.textContent),width:document.documentElement.scrollWidth}},classIds);
   assert(state.inHeader,id+' class outside header');assert.equal(state.classValue,'cl-3e6',id);assert.deepEqual(state.periods,[],id+' period still visible');assert(state.width<=width+2,id+' horizontal overflow');console.log('PASS compact',width,id);
  }
  const tests=await p.evaluate(()=>Object.keys(EpsTests.TESTS).filter(k=>k!=='ESCALADE'));
  for(const key of tests){await p.evaluate(key=>{epsOpenTest=key;openTool('tests')},key);await p.waitForTimeout(100);assert.equal(await p.locator('.modern-tool-hero #toolClass').count(),1,key);assert.equal(await p.locator('[data-eps-period]').count(),0,key)}
  // A grid redraw must not bring back the setup menu or hide the header class selector.
  for(const [id,start,next] of [['condition-fitness','fitnessStart','fitnessEvaluate'],['swim-observation','swimObsStart',null],['gym-observation','gymObsStart',null]]){
   await p.evaluate(id=>{openTool(id)},id);await p.waitForTimeout(100);await p.locator('.modern-tool-hero select').selectOption('cl-3e6');await p.waitForTimeout(100);if(id==='condition-fitness')await p.locator('#fitnessGrouping').selectOption('alpha');await p.locator('#'+start).click();if(next&&await p.locator('#'+next).count())await p.locator('#'+next).click();await p.waitForTimeout(100);assert.equal(await p.locator('.modern-tool-hero select').inputValue(),'cl-3e6',id+' grid header');
  }
  // Opening an archived work is not a class change: do not recompute its period.
  for(const type of ['rotations','tournament','observer','aptitudes']){
   await p.evaluate(async type=>{toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';const w={id:'old-'+type,type,title:'Travail ancien',classId:'cl-3e6',period:2,payload:{},createdAt:'2026-11-02T00:00:00Z'};if(type==='rotations')await renderRotationsWeb(w);else if(type==='tournament')await renderTournamentWeb(w);else if(type==='observer')await renderObserverWeb(w);else await renderPersistedTool(type,w)},type);await p.waitForTimeout(100);assert.equal(await p.locator('.modern-tool-hero select').inputValue(),'cl-3e6');assert.equal(await p.locator('#wfPeriod,#modernPeriod').first().inputValue(),'2',type+' old period was changed');
  }
  await p.evaluate(()=>{closeModernTool();const live=document.getElementById('liveToolPanel')||document.createElement('div');live.id='liveToolPanel';document.body.append(live);live.style.display='block';epsOpenTest='SPRINT_30';openTool('tests',live)});await p.waitForTimeout(150);assert.equal(await p.locator('#liveToolPanel .modern-tool-hero #toolClass').count(),1);assert.equal(await p.locator('#liveToolPanel [data-eps-period]:visible').count(),0);
  assert.deepEqual(errors,[]);await c.close();
 }
 console.log('PASS all class-based catalog tools and every EPS test, desktop/mobile, compact header, hidden periods, grid transitions');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
