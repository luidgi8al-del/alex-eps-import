const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const f=path.join(root,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
for(const mode of ['desktop','mobile','pwa']){
 const c=await browser.newContext({viewport:mode==='desktop'?{width:1440,height:950}:{width:390,height:844},isMobile:mode!=='desktop',hasTouch:mode!=='desktop',serviceWorkers:'block'});
 await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await c.addInitScript({content:"const testSetItem=Storage.prototype.setItem;\n"+fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')+"\nStorage.prototype.setItem=testSetItem;"});
 if(mode==='pwa')await c.addInitScript(()=>{const m=matchMedia;window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true,addEventListener(){},removeEventListener(){}}:m(q)});
 const p=await c.newPage(),errors=[];p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);console.log(mode,'loaded');
 await p.evaluate(async()=>{await openSettings();document.getElementById('visualSection').open=true});
 await p.locator('#visualTab-class').click();await p.locator('[data-class-visual="CLAIR"]').click();
 assert.equal(await p.evaluate(()=>loadPrefs().classVisual),'CLAIR');assert.equal(await p.locator('[data-class-visual="CLAIR"]').getAttribute('aria-pressed'),'true');
 await p.locator('#visualTab-weather').click();assert.equal(await p.locator('#settingsWeatherForm').isVisible(),true);await p.locator('#toggleHomeWeatherBtn').click();await p.waitForFunction(()=>document.getElementById('visualWeatherPanel')?.hidden===false);assert.equal(await p.locator('#visualSection').getAttribute('open'),'');
 await p.locator('#visualTab-home').click();assert.equal(await p.locator('#basicVisualBtn').isVisible(),true);console.log(mode,'settings OK');
 await p.evaluate(()=>{
  document.getElementById('settingsOverlay').classList.remove('open');
  document.querySelectorAll('[id^="tab-"]').forEach(e=>e.style.display=e.id==='tab-classes'?'block':'none');document.getElementById('subtab-classes').style.display='block';document.getElementById('classDashboardPanel').style.display='block';
  dashboardClass={row:__fauxServeur.DONNEES.classes[0],label:'3e6'};dashboardStudents=__fauxServeur.DONNEES.students.filter(s=>s.class_id==='cl-3e6');
  dashboardEvaluations=[];dashboardDispenses=[];suiviClasse=[];documentsClasse=[];rendusClasse=[];notesClasse=[];ecNotesChargees=true;
  dashboardTests=[{id:'test-v',class_id:'cl-3e6',test_name:'VMA à reprendre',period_number:1,created_at:1000}];ecResultatsTests=[{session_id:'test-v',student_id:'el-0',result_value:0,result_unit:'brouillon'},{session_id:'test-v',student_id:'el-1',result_value:0,result_unit:'/20'}];
  dashboardPeriod=1;vueClasse='bord';renderEcranClasse();window.pendingOpen=null;ecOuvrirTestEnFenetre=t=>window.pendingOpen=t.id;
 });
 console.log(mode,'board rendered',await p.locator('.ec-visuel-evaluation').count());await p.screenshot({path:path.join(root,'..','output',`classe-visuel-${mode}.png`),fullPage:true});assert.equal(await p.locator('.ec-visuel-navigation').count(),1);assert.match(await p.locator('.ec-visuel-evaluation').innerText(),/1 \/ 8 élèves/);await p.locator('.ec-visuel-evaluation').click();assert.equal(await p.evaluate(()=>pendingOpen),'test-v');
 assert.equal(await p.locator('#ecPreparerSeance').count(),1);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 for(const view of ['eleves','evaluations','groupes','documents','dispenses','suivi','recap']){
  await p.evaluate(v=>{vueClasse=v;renderEcranClasse()},view);assert.equal(await p.locator('.ec-visuel-navigation').count(),1);assert.equal(await p.locator(`[data-class-view="${view}"]`).getAttribute('aria-current'),'page');
 }
 await p.evaluate(()=>{savePrefs({...loadPrefs(),classVisual:'ACTUEL'});vueClasse='bord';renderEcranClasse()});assert.equal(await p.locator('.ec-visuel-navigation').count(),0);assert.equal(await p.locator('.ec-resume-quatre').count(),1);
 console.log(mode,'navigation OK');await p.evaluate(()=>savePrefs({...loadPrefs(),classVisual:'EVALUATIONS'}));await p.reload();await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);assert.equal(await p.evaluate(()=>classVisual()),'EVALUATIONS');
 assert.deepEqual(errors,[]);console.log('PASS',mode,'settings, persistence, class navigation, drafts, return to current');await c.close();
}
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
