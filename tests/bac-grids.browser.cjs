const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const S=require('../bac-rubrics.js'),M=require('../bac-grids-model.js'),root=path.resolve(__dirname,'..'),reports=path.join(root,'../tmp/bac-grids-tests');fs.mkdirSync(reports,{recursive:true});
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390,320]){
  const c=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?'Bac test':undefined));
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  await p.evaluate(()=>{__fauxServeur.DONNEES.eps_saved_tool_works=[];window.__bacWrites=[];const save=enregistrerLigne;enregistrerLigne=async(table,row)=>{const result=await save(table,row);if(table==='eps_saved_tool_works'){__bacWrites.push(structuredClone(row));const a=__fauxServeur.DONNEES.eps_saved_tool_works,index=a.findIndex(w=>w.id===row.id);index<0?a.push(row):a[index]=row}return result};showTab('outils');resetToolsWorkspace();openTool('bac-eps')});
  assert.equal(await p.locator('[data-bac-open]').count(),11);
  for(const spec of Object.values(S)){
   await p.evaluate(()=>openTool('bac-eps'));await p.locator(`[data-bac-open="${spec.id}"]`).click();await p.waitForSelector('#wfClass');await p.locator('#wfClass').selectOption('cl-3e6');await p.locator('#wfStart').click();await p.waitForSelector('#bacGridTotal');
   await p.waitForTimeout(100);assert.equal(await p.locator('.modern-tool-hero #wfClass').count(),1);assert.equal(await p.locator('#wfPeriod:visible').count(),0);
   for(let i=0;i<2;i++)for(let d=0;d<4;d++){
    await p.locator(`[data-grid-info="${i}:${d}"]`).click();assert.equal(await p.locator('dialog .bac-description').textContent(),spec.criteria[i].degrees[d].text);await p.locator('dialog [data-close]').click();
   }
   assert.match(await p.locator('#bacGridTotal').innerText(),/À compléter/,'Information does not grade');
   const params={};for(const field of spec.fields||[]){params[field.key]=field.options.at(-1)[0];await p.locator(`[data-bac-param="${field.key}"]`).selectOption(params[field.key])}
   let v={params};for(let i=0;i<2;i++){
    const c=spec.criteria[i],d=3;await p.locator(`[data-grid-note="${i}:${d}"]`).click();
    if(c.choices){const k=c.choices[d].length-1;await p.locator(`[data-choice="${k}"]`).click();v=M.setNote(v,i,d,c.choices[d][k].value,k)}
    else{const n=c.degrees[d].range[1];await p.locator('#bacGridSlider').fill(String(n));await p.locator('#bacGridSlider').dispatchEvent('change');await p.locator('[data-validate]').click();v=M.setNote(v,i,d,n)}
   }
   const expected=M.total(spec,v),text=expected.toLocaleString('fr-FR',{maximumFractionDigits:2})+' /12';assert.equal(await p.locator('#bacGridTotal').innerText(),text);
   await p.locator('#bacObservation').fill('Observation conservée');await p.locator('#bacNext').click();await p.waitForFunction(()=>document.querySelector('#bacGridTotal')?.textContent.includes('À compléter'));await p.locator('#bacPrev').click();await p.waitForFunction(t=>document.querySelector('#bacGridTotal')?.textContent===t,text);
   const before=await p.evaluate(()=>__bacWrites.length);await p.locator('#toolPanel .tool-direct-actions').first().getByRole('button',{name:/Enregistrer/}).first().click();if(await p.locator('#toolSaveConfirm').count())await p.locator('#toolSaveConfirm').click();await p.waitForFunction(n=>__bacWrites.length>n,before);
   const saved=await p.evaluate(()=>__bacWrites.at(-1)),payload=JSON.parse(saved.payload);assert.equal(payload.activity,spec.id);assert.equal(saved.type,'bac-grid');
   await p.evaluate(async ({id,label})=>ouvrirSessionTestDepuisClasse(id,'cl-3e6',1,label+' · Bac AFL1 /12'),{id:saved.id,label:spec.label});assert.equal(await p.locator('#bacGridTotal').innerText(),text);assert.equal(await p.locator('#bacObservation').inputValue(),'Observation conservée');
   const doc=await p.evaluate(()=>EpsToolActionMenus.documentData(toolPanel));assert.equal(doc.rows.length,8);assert.equal(doc.rows[0].at(-1),expected);
   assert.equal(await p.evaluate(async id=>{const t=(await EpsPortableWorks.classTests([],'cl-3e6')).find(t=>t.id===id);return EpsPortableWorks.completed(t,toolStudents)},saved.id),1);
   if(spec.id==='musculation'){
    const pupil=Object.keys(payload.values)[0];await p.locator('[data-tool-create-group]').click();await p.locator(`[data-tool-group-member="${pupil}"]`).check();await p.locator('[data-group-save]').click();assert.equal(await p.locator('#bacGridTotal').innerText(),text);
    await p.locator('#wfEditGroups').click();await p.locator(`[data-tool-group-member="${pupil}"]`).uncheck();await p.locator('[data-group-cancel]').click();assert.equal(await p.locator('#bacGridTotal').innerText(),text);
   }
   assert(await p.evaluate(w=>document.documentElement.scrollWidth<=w+2,width),'horizontal overflow '+width+' '+spec.id);
   if(['musculation','sauvetage','volley_ball'].includes(spec.id))await p.locator('.bac-student').screenshot({path:path.join(reports,`${spec.id}-${width}.png`)});
   console.log('PASS',width,spec.id,'full descriptors, grade, save/reopen class, export, pupil independence, layout');
  }
  assert.deepEqual(errors,[]);await c.close();
 }
}finally{await browser.close();server.closeAllConnections();server.close()}})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
