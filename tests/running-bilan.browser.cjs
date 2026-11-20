const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bilan /20</title>')});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390,320]){
  const p=await browser.newPage({viewport:{width,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}`);
  await p.addStyleTag({path:path.join(root,'styles/site.css')});await p.addStyleTag({path:path.join(root,'styles/running-bilan.css')});
  await p.evaluate(()=>{
   globalThis.toolClassId='c';globalThis.epsTestPeriod=1;globalThis.session={user_id:'teacher'};globalThis.writes=[];globalThis.failOnce=true;
   globalThis.toolStudents=[{id:'a',last_name:'ALPHA',first_name:'Élève'},{id:'b',last_name:'BETA',first_name:'Élève'},{id:'z',last_name:'Sans résultat'},{id:'d',last_name:'Incomplet uniquement'}];globalThis.studentLabel=s=>`${s.last_name} ${s.first_name||''}`;
   const sessions=[1,2,3,4,5].map(n=>({id:String(n),class_id:'c',period_number:n<3?1:2,test_name:'3 × 500 m',created_at:Date.UTC(2026,8,n)}));
   const unit='runs:500:3:group:0:difficulty:0:mode:run:times:315|315|315';
   const data={eps_test_sessions:[...sessions,{...sessions[0],id:'other',class_id:'other-class'}],eps_test_results:sessions.flatMap((s,i)=>i<4?['a','b'].map(id=>({session_id:s.id,student_id:id,result_value:(id==='a'?[6,8,9,10]:[10,9,8,6])[i],result_unit:'/12',input_unit:unit})):['a','d'].map(id=>({session_id:s.id,student_id:id,result_value:8,result_unit:'/12 · en cours',input_unit:unit.replace('315|315|315','315|315|')}))),cycles:[{id:'cycle',class_id:'c',apsa_name:'Demi-fond'}],evaluations:[{id:'final',cycle_id:'cycle',type:'FINALE',label:'Finale existante'}]};
   globalThis.testData=data;globalThis.modeHorsConnexion={lire:async(table,{ou})=>({rows:data[table].filter(ou)}),enregistrer:async(table,id,row)=>{if(table==='evaluation_scores'&&globalThis.failOnce){globalThis.failOnce=false;throw Error('Simulation interruption')}globalThis.writes=globalThis.writes.filter(w=>w.row.id!==id);globalThis.writes.push({table,row})}};
  });
  for(const name of ['running-bilan-model.js','running-bilan.js','running-final.js'])await p.addScriptTag({path:path.join(root,name)});
  await p.evaluate(()=>openRunningFinal());assert.equal(await p.locator('[data-session]').count(),5);
  await p.locator('[data-scope]').selectOption('period');assert.equal(await p.locator('[data-session]').count(),2);await p.locator('[data-scope]').selectOption('all');
  await p.locator('[data-continue]').click();assert.equal(await p.locator('[data-score="0"]').inputValue(),'14.25');assert.equal(await p.locator('[data-score="1"]').inputValue(),'12.75');assert.equal(await p.locator('[data-score="2"]').isDisabled(),true);assert.equal(await p.locator('[data-score="3"]').isDisabled(),true);
  await p.locator('[data-method]').selectOption('mean');assert.equal(await p.locator('[data-score="0"]').inputValue(),'13.25');
  await p.locator('[data-method]').selectOption('recent');assert.equal(await p.locator('[data-score="0"]').inputValue(),'13.94');
  await p.locator('[data-method]').selectOption('progress');await p.locator('.bilan-student').first().locator('summary').click();await p.locator('[data-justify="a:5"]').check();assert.equal(await p.locator('[data-score="0"]').inputValue(),'14.75');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const box=await p.locator('dialog').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
  await p.locator('[data-target]').selectOption('final');await p.locator('[data-score="0"]').fill('16.5');
  await p.locator('[data-save]').click();assert.match(await p.locator('dialog [role=status]').innerText(),/interruption/);
  await p.locator('[data-save]').click();await p.getByText('Bilan ajouté à l’évaluation finale /20',{exact:true}).waitFor();
  const writes=await p.evaluate(()=>globalThis.writes);assert.equal(writes.filter(w=>w.table==='evaluation_criteria').length,1);assert.equal(writes.find(w=>w.table==='evaluation_criteria').row.max_points,20);assert.equal(writes.find(w=>w.table==='evaluation_criteria').row.evaluation_id,'final');assert.deepEqual(writes.filter(w=>w.table==='evaluation_scores').map(w=>w.row.points),[16.5,12.75]);assert.equal(writes.some(w=>w.table==='eps_test_results'),false);assert.deepEqual(errors,[]);
  await fs.promises.mkdir(path.join(root,'output/running-bilan'),{recursive:true});
  await p.evaluate(()=>{document.querySelector('dialog').close();return openRunningFinal()});await p.locator('[data-continue]').click();await p.screenshot({path:path.join(root,`output/running-bilan/bilan-${width}.png`),fullPage:true});
  await p.locator('[data-save]').click();await p.getByText('Bilan ajouté à l’évaluation finale /20',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>writes.find(w=>w.table==='evaluations').row.type),'FINALE');
  await p.evaluate(()=>{document.querySelector('dialog').close();testData.eps_test_results.find(r=>r.session_id==='1'&&r.student_id==='a').input_unit=testData.eps_test_results[0].input_unit.replace(':difficulty:0:',':difficulty:10:');return openRunningFinal()});
  await p.locator('[data-continue]').click();assert.equal(await p.locator('[data-save]').isDisabled(),true);
  assert.equal(await p.locator('[data-mixed-conditions]').count(),1,'Mixed conditions must offer an explicit way to save without evolution');
  assert.match(await p.locator('.bilan-save-check').innerText(),/ALPHA/);
  assert.equal(await p.locator('[data-score="0"]').inputValue(),'13.25');
  await p.locator('[data-mixed-conditions]').check();assert.equal(await p.locator('[data-save]').isEnabled(),true);
  // Changing the sample requires a fresh confirmation.
  await p.locator('[data-method]').selectOption('mean');assert.equal(await p.locator('[data-mixed-conditions]').isChecked(),false);assert.equal(await p.locator('[data-save]').isDisabled(),true);
  await p.locator('[data-mixed-conditions]').check();const beforeInvalid=await p.evaluate(()=>writes.length);await p.locator('[data-score="0"]').fill('21');await p.locator('[data-save]').click();assert.match(await p.locator('dialog [role=status]').innerText(),/valeur empêche/);assert.equal(await p.evaluate(()=>writes.length),beforeInvalid);
  await p.locator('[data-score="0"]').fill('13.25');await p.locator('[data-save]').click();await p.getByText('Bilan ajouté à l’évaluation finale /20',{exact:true}).waitFor();
  const mixed=await p.evaluate(()=>writes.filter(w=>w.table==='evaluation_criteria').at(-1));assert.match(mixed.row.label,/sans évolution/);
  assert.deepEqual(await p.evaluate(id=>writes.filter(w=>w.table==='evaluation_scores'&&w.row.criterion_id===id).map(w=>w.row.points),mixed.row.id),[13.25,13.75]);
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS 3x500 /20 desktop/mobile: all periods, class isolation, 3 methods, justification, edit, partial-write retry, mixed conditions acknowledged without evolution, invalid mark explained, max_points=20, original sessions untouched');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
