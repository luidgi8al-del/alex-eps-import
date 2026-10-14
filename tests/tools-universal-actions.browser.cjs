const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
for(const width of [1280,390]){
 const c=await browser.newContext({viewport:{width,height:900},hasTouch:width===390,isMobile:width===390,serviceWorkers:'block',acceptDownloads:true});await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{if(d.type()==='alert')console.log('ALERT',d.message());return d.accept(d.type()==='prompt'?'Vérification':undefined)});await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
 const ids=['multi-chrono','teams','tournament','rotations','observer','climb-observation','climb-test','condition-fitness','vma','aptitudes','swim','swim-observation','speed','impacts','acrosport','gym-observation','tests','measures','effort','random'];
 for(const id of (process.env.EPS_AUDIT_TOOLS?process.env.EPS_AUDIT_TOOLS.split(','):ids)){
  console.log('CHECK',width,id);
  await p.evaluate(id=>{showTab('outils');resetToolsWorkspace();epsOpenTest=id==='tests'?'SPRINT_30':null;openTool(id)},id);await p.waitForTimeout(120);
  if(id!=='measures')await p.locator('#toolPanel .modern-tool-hero select').first().selectOption('cl-3e6');await p.waitForTimeout(400);
  if(id==='condition-fitness')await p.locator('#fitnessGrouping').selectOption('alpha');
  if(id==='teams')await p.locator('#twGenerate').click();
  for(const button of ['epsBegin','vmaBegin','wfStart','fitnessStart','fitnessEvaluate','swimObsStart','swimObsEvaluate','gymObsStart']){const b=p.locator('#'+button);if(await b.count()&&await b.isVisible())await b.click()}
  const bar=p.locator('#toolPanel .tool-direct-actions').first();await bar.waitFor({timeout:5000});
  const labels=(await bar.locator(':scope>button').allTextContents()).map(s=>s.trim());assert(labels.some(s=>s.includes('Enregistrer')),id);for(const label of ['Nouvelle saisie','Exporter','Suppression'])assert(labels.some(s=>s.includes(label)),`${id} missing ${label}: ${labels}`);
  const data=await p.evaluate(()=>EpsToolActionMenus.documentData(document.getElementById('toolPanel')));assert(data.headers.length&&Array.isArray(data.rows),`${id} export empty schema`);
  await bar.getByRole('button',{name:'Exporter',exact:true}).click();const dialog=p.locator('dialog.tool-action-dialog');for(const label of ['PRONOTE · exporter les notes','PDF','Word (.docx)','Excel (.xlsx)'])assert.equal(await dialog.getByRole('button',{name:label,exact:true}).count(),1,id+' '+label);
  if(['vma','aptitudes','swim','swim-observation','speed','impacts','climb-observation','rotations','acrosport','teams','tournament','multi-chrono','tests'].includes(id))assert(await dialog.getByRole('button',{name:'PRONOTE · exporter les notes'}).isDisabled(),id+' fabricated grade');
  const download=p.waitForEvent('download');await dialog.getByRole('button',{name:'Excel (.xlsx)',exact:true}).click();const file=await download,bytes=fs.readFileSync(await file.path());assert(file.suggestedFilename().endsWith('.xlsx'));assert.equal(bytes.readUInt32LE(0),0x04034b50);
  await bar.getByRole('button',{name:'Nouvelle saisie'}).click();assert.equal(await dialog.getByRole('button',{name:'Retrouver un tableau enregistré',exact:true}).count(),1,id+' archive access');await dialog.getByRole('button',{name:'Fermer',exact:true}).click();
  await bar.getByRole('button',{name:'Suppression',exact:true}).click();for(const label of ['Réinitialiser les résultats','Supprimer les groupes','Annuler la dernière remise à zéro / suppression'])assert.equal(await dialog.getByRole('button',{name:label,exact:true}).count(),1,id+' '+label);await dialog.getByRole('button',{name:'Fermer',exact:true}).click();
  if(['tests','aptitudes','climb-test','condition-fitness','tournament','measures','effort'].includes(id)){
   const input=p.locator('#toolPanel input[data-eps-input],#toolPanel input[data-aptitude],#toolPanel input[data-climb-field],#toolPanel input[data-fit-field],#toolPanel input[data-match],#measureDistance,#effAge').first();if(await input.count()){
    await input.fill(id==='climb-test'?'4':'6');const before=await p.evaluate(()=>JSON.stringify(EpsToolActionMenus.documentData(document.getElementById('toolPanel'))));await bar.getByRole('button',{name:'Suppression',exact:true}).click();await dialog.getByRole('button',{name:'Réinitialiser les résultats',exact:true}).click();await p.locator('#toolUndo').waitFor({state:'attached',timeout:5000});
    await bar.getByRole('button',{name:'Suppression',exact:true}).click();await dialog.getByRole('button',{name:'Annuler la dernière remise à zéro / suppression',exact:true}).click();await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>JSON.stringify(EpsToolActionMenus.documentData(document.getElementById('toolPanel')))),before,id+' reset/undo data');
   }
  }
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),id+' page overflow');console.log('PASS universal',width,id,data.rows.length,'export rows');
 }
 if(!process.env.EPS_AUDIT_TOOLS){
  for(const key of await p.evaluate(()=>Object.keys(EpsTests.TESTS).filter(k=>k!=='ESCALADE'))){
   await p.evaluate(key=>{resetToolsWorkspace();epsOpenTest=key;openTool('tests')},key);await p.locator('#toolClass').selectOption('cl-3e6');const start=p.locator('#epsBegin');if(await start.count())await start.click();await p.locator('.tool-direct-actions').first().waitFor();const labels=await p.locator('.tool-direct-actions>button').allTextContents();for(const label of ['Enregistrer','Nouvelle saisie','Exporter','Suppression'])assert(labels.some(s=>s.includes(label)),key+' '+label);console.log('PASS EPS action contract',width,key);
  }
 }
 assert.deepEqual(errors,[]);await c.close();
}
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
