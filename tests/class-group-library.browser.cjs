const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');try{res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const mode of ['desktop','mobile','pwa']){
  const c=await browser.newContext({viewport:mode==='desktop'?{width:1440,height:950}:{width:390,height:844},isMobile:mode!=='desktop',hasTouch:mode!=='desktop',serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  if(mode==='pwa')await c.addInitScript(()=>{const m=matchMedia;window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true,addEventListener(){},removeEventListener(){}}:m(q)});
  const p=await c.newPage(),errors=[];p.on('console',m=>{if(m.text().includes('Dossier debug'))console.log(m.text())});p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?'Composition copiée':undefined));await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  await p.evaluate(()=>{
   const read=lireTable;window.libraryRows={saved_teams:[{id:'composition',class_id:'cl-3e6',name:'Groupes partagés'}],saved_team_members:[{id:'m1',saved_team_id:'composition',student_id:'el-0',team_index:0},{id:'m2',saved_team_id:'composition',student_id:'el-1',team_index:1},{id:'m3',saved_team_id:'composition',student_id:'other-class',team_index:1}]};
   lireTable=async(table,url,options)=>libraryRows[table]?libraryRows[table].filter(options?.ou||(()=>true)):read(table,url,options);
   enregistrerLigne=async(table,row)=>{(libraryRows[table]??=[]).push(structuredClone(row))};
   showTab('outils');resetToolsWorkspace();openTool('vma');
  });await p.locator('#toolClass').selectOption('cl-3e6');await p.locator('#wfClassGroups').click();await p.getByRole('button',{name:'Groupes partagés',exact:true}).click();
  assert.equal(await p.evaluate(()=>vmaGroupAssignments['el-0']), '1');assert.equal(await p.evaluate(()=>vmaGroupAssignments['other-class']),undefined);
  await p.locator('#wfEditGroups').click();await p.locator('[data-wf-assign="el-0"]').selectOption('2');await p.locator('[data-wf-assign="el-2"]').selectOption('1');await p.locator('#wfSaveClassGroups').click();await p.waitForFunction(()=>libraryRows.saved_teams.length===2);
  assert.equal(await p.evaluate(()=>libraryRows.saved_team_members.find(r=>r.id==='m1').team_index),0);
  assert.equal(await p.evaluate(()=>libraryRows.saved_teams.length),2);
  await p.evaluate(async()=>{dashboardClass={row:__fauxServeur.DONNEES.classes[0],label:'3e6'};dashboardStudents=__fauxServeur.DONNEES.students;dashboardEvaluations=[];dashboardDispenses=[];suiviClasse=[];documentsClasse=[];rendusClasse=[];ecNotesChargees=true;ecResultatsTests=[{student_id:'el-0',session_id:'test-a',result_value:0,result_unit:'brouillon'},{student_id:'el-0',session_id:'test-b',result_value:0,result_unit:'/20'},{student_id:'el-0',session_id:'test-c',result_value:4,result_unit:'/20'}];dashboardTests=[{id:'test-a',test_name:'Sprint',created_at:1000},{id:'test-b',test_name:'Sprint',created_at:2000},{id:'test-c',test_name:'Sprint',created_at:3000}];ouvrirDetailClasse();await ouvrirDossierEleve('el-0');console.log('Dossier debug',dashboardStudents.map(s=>s.id),hoteDetail().innerText.slice(0,150))});
  await p.locator('[data-student-progress-tab="evaluations"]').click();assert.doesNotMatch(await p.locator('#studentProgressPanel').innerText(),/brouillon/);assert.match(await p.locator('#studentProgressPanel').innerText(),/0 \/20/);
  await p.locator('[data-student-progress-tab="participation"]').click();assert.match(await p.locator('#studentProgressPanel').innerText(),/Tests réalisés[\s\S]*2/);
  assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log('PASS',mode,'group library copies and dossier excludes drafts');await c.close();
 }
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
