const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),reports=path.join(root,'../tmp/bac-tests');fs.mkdirSync(reports,{recursive:true});
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390,320]){
  const c=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?'Escalade test':undefined));
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  await p.evaluate(()=>{__fauxServeur.DONNEES.eps_saved_tool_works=[];window.__bacWrites=[];const save=enregistrerLigne;enregistrerLigne=async(table,row)=>{const result=await save(table,row);if(table==='eps_saved_tool_works'){__bacWrites.push(structuredClone(row));const a=__fauxServeur.DONNEES.eps_saved_tool_works,index=a.findIndex(w=>w.id===row.id);index<0?a.push(row):a[index]=row}return result};showTab('outils');resetToolsWorkspace();openTool('bac-eps')});
  await p.locator('[data-bac-open="3x500"]').click();await p.waitForSelector('#toolClass');assert.match(await p.locator('#toolPanel').innerText(),/3 × 500/);
  await p.evaluate(()=>openTool('bac-eps'));assert.equal(await p.locator('.bac-tool-catalog article').count(),11);
  for(const href of await p.locator('.bac-tool-catalog a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))))assert(fs.existsSync(path.join(root,href)),href);
  await p.locator('[data-bac-open="escalade"]').click();await p.waitForSelector('#wfClass');await p.locator('#wfClass').selectOption('cl-3e6');await p.locator('#wfStart').click();
  await p.waitForSelector('#bacRoute');await p.waitForTimeout(200);
  assert.equal(await p.locator('.modern-tool-hero #wfClass').count(),1);
  assert.equal(await p.locator('#wfPeriod:visible').count(),0);
  assert.match(await p.locator('#bacTotal').innerText(),/À évaluer/);
  const pupil=await p.locator('.bac-student h3').first().innerText();
  for(let i=0;i<2;i++)for(let d=0;d<4;d++){
   await p.locator(`[data-bac-info="${i}:${d}"]`).click();
   const expected=JSON.parse(fs.readFileSync(path.join(root,'bac_referentiels/escalade-afl1.json'))).criteria[i].degrees[d];
   assert.equal(await p.locator('dialog .bac-description').innerText(),expected);
   await p.locator('dialog [data-close]').click();
  }
  assert.match(await p.locator('#bacTotal').innerText(),/À évaluer/,'Reading descriptors cannot assign notes');
  await p.locator('[data-bac-note="0:0"]').click();assert.match(await p.locator('#bacTotal').innerText(),/À évaluer/);
  await p.locator('#bacRoute').selectOption('6a');assert.equal(await p.locator('[data-bac-score="0"]').innerText(),'0,00 /6');
  await p.locator('[data-bac-note="1:3"]').click();assert.equal(await p.locator('#bacTotal').innerText(),'6,00 /12');
  await p.locator('#bacRoute').selectOption('4a');assert.equal(await p.locator('[data-bac-score="0"]').innerText(),'1,50 /6');assert.equal(await p.locator('[data-bac-score="1"]').innerText(),'4,50 /6');
  await p.locator('#bacManual').check();assert.equal(await p.locator('input[type=range]:visible').count(),0);
  await p.locator('[data-bac-note="0:0"]').click();await p.locator('#bacSlider').fill('0');await p.locator('#bacSlider').dispatchEvent('change');await p.locator('dialog [data-close]').click();assert.equal(await p.locator('[data-bac-score="0"]').innerText(),'0,00 /6');
  await p.locator('[data-bac-note="1:3"]').click();await p.locator('#bacSlider').fill('5.4');await p.locator('#bacSlider').dispatchEvent('change');await p.locator('dialog [data-close]').click();assert.equal(await p.locator('#bacTotal').innerText(),'5,40 /12');
  await p.locator('#bacNext').click();await p.waitForFunction(()=>document.querySelector('#bacTotal')?.textContent.includes('À évaluer'));await p.locator('#bacPrev').click();await p.waitForFunction(()=>document.querySelector('#bacTotal')?.textContent==='5,40 /12');assert.equal(await p.locator('.bac-student h3').first().innerText(),pupil);
  await p.locator('#toolPanel .tool-direct-actions').first().getByRole('button',{name:/Enregistrer/}).first().click();
  if(await p.locator('#toolSaveConfirm').count())await p.locator('#toolSaveConfirm').click();await p.waitForFunction(()=>__bacWrites.length>0);
  const saved=await p.evaluate(()=>__bacWrites.at(-1));assert.equal(saved.type,'bac-climb');assert.equal(saved.class_id,'cl-3e6');const payload=JSON.parse(saved.payload);assert(payload.manual);assert.equal(payload.rubricVersion,1);assert.equal(Object.keys(payload.values).length,1);
  await p.evaluate(async id=>{await ouvrirSessionTestDepuisClasse(id,'cl-3e6',1,'Escalade · AFL1 /12')},saved.id);assert.equal(await p.locator('#bacTotal').innerText(),'5,40 /12');
  assert(await p.locator('#bacManual').isChecked());assert.equal(await p.locator('#bacRoute').inputValue(),'4a');
  const doc=await p.evaluate(()=>EpsToolActionMenus.documentData(toolPanel));assert.equal(doc.rows.length,8);assert(doc.rows.some(r=>r[6]===5.4));
  const list=await p.evaluate(()=>EpsPortableWorks.classTests([],'cl-3e6'));assert(list.some(r=>r.id===saved.id&&r.test_name==='Escalade · AFL1 /12'));
  assert.equal(await p.evaluate(async()=>{const t=(await EpsPortableWorks.classTests([],'cl-3e6')).find(t=>t.test_name==='Escalade · AFL1 /12');return EpsPortableWorks.completed(t,toolStudents)}),1);
  const pupilId=Object.keys(payload.values)[0];
  await p.locator('[data-tool-create-group]').click();await p.locator(`[data-tool-group-member="${pupilId}"]`).check();await p.locator('[data-group-save]').click();assert.equal(await p.locator('#bacTotal').innerText(),'5,40 /12');
  await p.locator('#wfEditGroups').click();await p.locator(`[data-tool-group-member="${pupilId}"]`).uncheck();await p.locator('[data-group-cancel]').click();assert.equal(await p.locator('#bacTotal').innerText(),'5,40 /12');
  await p.locator('#wfEditGroups').click();await p.locator(`[data-tool-group-member="${pupilId}"]`).uncheck();await p.locator('[data-group-save]').click();
  await p.locator('[data-tool-create-group]').click();await p.locator(`[data-tool-group-member="${pupilId}"]`).check();await p.locator('[data-group-save]').click();assert.equal(await p.locator('#bacTotal').innerText(),'5,40 /12');
  const count=await p.evaluate(()=>__bacWrites.length);await p.locator('#toolPanel .tool-direct-actions').first().getByRole('button',{name:/Enregistrer/}).first().click();if(await p.locator('#toolSaveConfirm').count())await p.locator('#toolSaveConfirm').click();await p.waitForFunction(n=>__bacWrites.length>n,count);
  const grouped=JSON.parse(await p.evaluate(()=>__bacWrites.at(-1).payload));assert.equal(grouped.groups.length,2);assert.equal(grouped.assignments[pupilId],grouped.groups[1].id);assert.deepEqual(grouped.values,payload.values);
  assert(await p.evaluate(w=>document.documentElement.scrollWidth<=w+2,width),'horizontal overflow '+width);
  await p.locator('.bac-student').screenshot({path:path.join(reports,`escalade-${width}.png`)});
  assert.deepEqual(errors,[]);console.log('PASS',width,'catalogue, 3x500, full descriptors, both criteria, manual slider, pupil independence, save/reopen, export, class, no overflow');await c.close();
 }
}finally{await browser.close();server.closeAllConnections();server.close()}})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
