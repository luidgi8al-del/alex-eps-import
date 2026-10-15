const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),reports=path.join(root,'../tmp/running-observation-tests');fs.mkdirSync(reports,{recursive:true});
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390,320]){
  const c=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  const p=await c.newPage(),errors=[],classWarnings=[];let cancelClassChange=false,cancelDistanceChange=false;
  p.setDefaultTimeout(15000);p.setDefaultNavigationTimeout(20000);
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{if(d.message().startsWith('Changer de distance')&&cancelDistanceChange)return d.dismiss();if(d.message().startsWith('Changer de classe')){classWarnings.push(d.message());if(cancelClassChange)return d.dismiss()}return d.accept(d.type()==='prompt'?'Observation test':undefined)});
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  await p.evaluate(()=>{__fauxServeur.DONNEES.eps_saved_tool_works=[];window.__writes=[];const save=enregistrerLigne;enregistrerLigne=async(table,row)=>{const result=await save(table,row);if(table==='eps_saved_tool_works'){__writes.push(structuredClone(row));const a=__fauxServeur.DONNEES.eps_saved_tool_works,index=a.findIndex(w=>w.id===row.id);index<0?a.push(row):a[index]=row}return result};window.__offset=0;const now=performance.now.bind(performance);performance.now=()=>now()+__offset;showTab('outils');resetToolsWorkspace();openTool('bac-eps')});
  await p.locator('[data-running-observation]').click();await p.waitForSelector('#wfClass');await p.locator('#wfClass').selectOption('cl-3e6');
  await p.waitForFunction(()=>document.querySelector('#wfClass')?.value==='cl-3e6'&&!toolPanel.inert);
  await p.locator('#wfClass').selectOption('');await p.waitForFunction(()=>!!document.querySelector('#wfFree')&&!toolPanel.inert);
  await p.locator('#wfClass').selectOption('cl-3e6');await p.waitForFunction(()=>document.querySelector('#wfClass')?.value==='cl-3e6'&&!toolPanel.inert);
  assert.equal(classWarnings.length,0,'No warning for first selection or switching an untouched worksheet');
  await p.locator('#wfStart').click();await p.waitForSelector('.ro-table');
  await p.waitForTimeout(150);assert.equal(await p.locator('.modern-tool-hero #wfClass').count(),1);assert.equal(await p.locator('#wfPeriod:visible').count(),0);
  await p.locator('[data-tool-create-group]').click();await p.locator('[data-tool-group-member="el-0"]').check();await p.locator('[data-tool-group-member="el-1"]').check();await p.locator('[data-group-save]').click();await p.waitForFunction(()=>document.querySelectorAll('[data-ro-row]').length===2);
  cancelClassChange=true;await p.locator('#wfClass').selectOption('');assert.equal(classWarnings.length,1);assert.equal(await p.locator('#wfClass').inputValue(),'cl-3e6');assert.equal(await p.locator('[data-ro-row]').count(),2);cancelClassChange=false;
  await p.locator('#wfEditGroups').click();await p.locator('[data-tool-group-member="el-1"]').uncheck();await p.locator('[data-group-cancel]').click();assert.equal(await p.locator('[data-ro-row]').count(),2);
  await p.locator('#wfEditGroups').click();await p.locator('[data-tool-group-member="el-1"]').uncheck();await p.locator('[data-group-save]').click();await p.waitForFunction(()=>document.querySelectorAll('[data-ro-row]').length===1);
  await p.locator('#roDistance').selectOption('250');await p.waitForFunction(()=>document.querySelector('.ro-table thead')?.textContent.includes('1er 125 m'));await p.locator('#roCount').selectOption('5');await p.waitForFunction(()=>document.querySelectorAll('[data-ro-run]').length===5);assert.match(await p.locator('.ro-table thead').innerText(),/1er 125 m/i);
  await p.locator('[data-ro-field="observerId"]').selectOption('el-1');await p.locator('[data-ro-run="4"]').click();assert.equal(await p.locator('[data-ro-field="observerId"]').inputValue(),'el-1');
  console.log('settings and observer carry-over',width);
  await p.locator('#roCount').selectOption('3');await p.waitForFunction(()=>document.querySelectorAll('[data-ro-run]').length===3);await p.locator('#roDistance').selectOption('500');await p.waitForFunction(()=>document.querySelector('.ro-table thead')?.textContent.includes('1er 250 m'));await p.locator('[data-ro-run="0"]').click();
  await p.locator('[data-ro-tap="el-0"]').click();await p.locator('[data-ro-mode="walk"]').click();await p.waitForFunction(()=>document.querySelector('[data-ro-tap="el-0"]')?.textContent.includes('Marche rapide'));
  await p.locator('[data-ro-tap="el-0"]').click();await p.locator('[data-ro-mode="run"]').click();
  await p.waitForFunction(()=>{const e=document.querySelectorAll('.ro-table td')[5];return e&&getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)'});
  await p.locator('#roDifficulty').evaluate(e=>{e.value='10';e.dispatchEvent(new Event('input',{bubbles:true}))});assert.equal(await p.locator('#roDifficultyLabel').innerText(),'10 %');
  console.log('mode and colours',width);
  for(let i=0;i<3;i++){
   await p.locator(`[data-ro-run="${i}"]`).click();await p.locator('#roStart').click();await p.waitForFunction(()=>document.getElementById('roStop'));
   assert(await p.locator('#roDistance').isDisabled());assert(await p.locator('#roCount').isDisabled());assert(await p.locator('#roDifficulty').isDisabled());
   await p.evaluate(()=>__offset+=60000);await p.locator('[data-ro-tap="el-0"]').click();await p.waitForFunction(()=>document.querySelector('[data-ro-tap="el-0"] [data-ro-stage]')?.textContent==='Clic → 500 m');
   await p.evaluate(()=>__offset+=70000);await p.locator('[data-ro-tap="el-0"]').click();await p.waitForFunction(()=>!document.getElementById('roStop'));
   const row=p.locator('[data-ro-row="el-0"]');assert.match(await row.locator('td').nth(7).innerText(),/Analyse masquée/);assert(!/A ralenti/.test(await row.locator('td').nth(7).innerText()));
   assert.equal(await row.locator('[data-ro-field="observerId"]').inputValue(),'el-1');await row.locator('[data-ro-field="analysis"]').selectOption('slower');await row.locator('[data-ro-field="advice"]').selectOption('slower');await row.locator('[data-ro-check]').click();await p.waitForFunction(()=>document.querySelector('.ro-ok')?.textContent);assert.match(await row.innerText(),/Cohérent/);
  }
  await p.locator('[data-ro-run="0"]').click();await p.locator('[data-ro-field="analysis"]').selectOption('faster');await p.locator('[data-ro-check]').click();await p.waitForSelector('.ro-review');
  await p.locator('[data-ro-field="analysis"]').selectOption('slower');await p.locator('[data-ro-check]').click();await p.waitForSelector('.ro-ok');
  const before=await p.evaluate(()=>__writes.length);await p.locator('#toolPanel .tool-direct-actions').first().getByRole('button',{name:/Enregistrer/}).first().click();if(await p.locator('#toolSaveConfirm').count())await p.locator('#toolSaveConfirm').click();await p.waitForFunction(n=>__writes.length>n,before);
  const saved=await p.evaluate(()=>__writes.at(-1)),payload=JSON.parse(saved.payload);assert.equal(saved.type,'running-observation');assert.equal(payload.values['el-0'].runs.length,5);assert.equal(payload.values['el-0'].runs[2].observerId,'el-1');assert(!payload.values['el-1']);assert.equal(payload.version,2);assert.equal(payload.difficulty,10);
  await p.evaluate(async id=>ouvrirSessionTestDepuisClasse(id,'cl-3e6',1,'3 × 500 m · Observation'),saved.id);await p.waitForSelector('.ro-table');assert.match(await p.locator('[data-ro-row="el-0"]').innerText(),/Cohérent/);
  assert.equal(await p.evaluate(async id=>{const t=(await EpsPortableWorks.classTests([],'cl-3e6')).find(t=>t.id===id);return EpsPortableWorks.completed(t,toolStudents)},saved.id),1);
  const doc=await p.evaluate(()=>EpsToolActionMenus.documentData(toolPanel));assert.equal(doc.rows.length,24);assert.equal(doc.rows.filter(r=>r[9]==='Cohérent').length,3);
  assert.match(await p.locator('[data-ro-score="el-0"]').innerText(),/\/ 12/);const graded=doc.rows.find(r=>r[9]==='Cohérent');assert.equal(graded[12],12);assert.equal(typeof graded[11],'number');
  await p.locator('[data-ro-tap="el-0"]').click();await p.locator('[data-ro-mode="walk"]').click();await p.waitForFunction(()=>document.querySelector('[data-ro-score="el-0"]')?.textContent==='12 / 12');
  cancelDistanceChange=true;await p.locator('#roDistance').selectOption('250');assert.equal(await p.locator('#roDistance').inputValue(),'500');assert.equal(await p.locator('[data-ro-score="el-0"]').innerText(),'12 / 12');cancelDistanceChange=false;
  await p.locator('#roCount').selectOption('1');await p.waitForFunction(()=>document.querySelector('[data-ro-score="el-0"]')?.textContent==='3 / 3');
  await p.locator('#roCount').selectOption('10');await p.waitForFunction(()=>document.querySelectorAll('[data-ro-run]').length===10);await p.locator('[data-ro-run="9"]').click();assert.equal(await p.locator('[data-ro-field="observerId"]').inputValue(),'el-1');
  await p.locator('#roCount').selectOption('3');await p.waitForFunction(()=>document.querySelector('[data-ro-score="el-0"]')?.textContent==='12 / 12');await p.locator('[data-ro-run="0"]').click();
  await p.locator('[data-ro-edit="el-0"]').click();await p.locator('#roFirst').fill('61');await p.locator('#roTotal').fill('60');await p.locator('dialog [data-apply]').click();assert.match(await p.locator('dialog [data-error]').innerText(),/positifs/);await p.locator('#roTotal').fill('122');await p.locator('dialog [data-apply]').click();await p.waitForSelector('dialog',{state:'detached'});assert.match(await p.locator('[data-ro-row="el-0"]').innerText(),/Analyse masquée/);
  assert(await p.evaluate(w=>document.documentElement.scrollWidth<=w+2,width),'document horizontal overflow');
  const sticky=await p.locator('.ro-table td:first-child').evaluate(el=>{const x=el.getBoundingClientRect().left;el.closest('.ro-scroll').scrollLeft=200;return Math.abs(el.getBoundingClientRect().left-x)<2});assert(sticky);
  await p.locator('.ro-scroll').evaluate(e=>e.scrollLeft=0);await p.locator('.ro-work').screenshot({path:path.join(reports,`observation-${width}.png`)});
  if(width===1280){
   const file=path.join(root,'../installation-manager-current/app/build/reports/running-observation-wire.json');
   const android=JSON.parse(fs.readFileSync(file,'utf8'));assert(android.values['el-0'],'Generate current Android fixture first');
   await p.evaluate(async payload=>renderRunningObservationWeb({classId:'cl-3e6',period:1,title:'Android → site → Android',payload}),android);
   assert.equal(await p.locator('[data-ro-row="el-0"] [data-ro-field="observerId"]').inputValue(),'el-1');
   await p.locator('[data-ro-edit="el-0"]').click();await p.locator('#roFirst').fill('61');await p.locator('#roTotal').fill('130');await p.locator('dialog [data-apply]').click();await p.locator('[data-ro-check="el-0"]').click();
   const before=await p.evaluate(()=>__writes.length);await p.locator('#toolPanel .tool-direct-actions').first().getByRole('button',{name:/Enregistrer/}).first().click();if(await p.locator('#toolSaveConfirm').count())await p.locator('#toolSaveConfirm').click();await p.waitForFunction(n=>__writes.length>n,before);
   const back=await p.evaluate(()=>__writes.at(-1).payload);fs.writeFileSync(path.join(root,'../installation-manager-current/app/build/reports/running-observation-browser-return.json'),back);
   console.log('PASS native fixture imported, edited and saved by browser for Android reimport');
  }
  assert.deepEqual(errors,[]);console.log('PASS',width,'groups cancel/save, three clocks, feedback, save/reopen class, export, correction, fixed names');await c.close();
 }
}finally{await browser.close();server.closeAllConnections();server.close()}})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
