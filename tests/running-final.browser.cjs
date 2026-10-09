const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=fs.readFileSync(path.join(__dirname,'../running-final.js'),'utf8');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test bilan</title>')});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  for(const width of [1280,390]) {
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   await page.evaluate(()=>{
    globalThis.toolClassId='c';globalThis.epsTestPeriod=1;globalThis.session={user_id:'teacher'};
    globalThis.toolStudents=[{id:'a',last_name:'ALPHA',first_name:'Élève'},{id:'b',last_name:'BETA',first_name:'Élève'},{id:'z',last_name:'Sans résultat'}];
    globalThis.studentLabel=s=>`${s.last_name} ${s.first_name||''}`;
    globalThis.writes=[];globalThis.failOnce=true;
    const sessions=[1,2,3].map((n)=>({id:String(n),class_id:'c',period_number:1,test_name:'3 × 500 m',created_at:Date.UTC(2026,8,n)}));
    const data={eps_test_sessions:sessions,eps_test_results:sessions.flatMap((s,i)=>['a','b'].map(id=>({session_id:s.id,student_id:id,result_value:id==='a'?6+2*i:10-2*i,result_unit:'/12',input_unit:'runs:500:3:group:0:difficulty:0:mode:run:times:315|318|320'}))),cycles:[{id:'cycle',class_id:'c',apsa_name:'Demi-fond'}],evaluations:[{id:'final',cycle_id:'cycle',type:'FINALE',label:'Finale existante'}]};
    globalThis.modeHorsConnexion={lire:async(table,{ou})=>({rows:data[table].filter(ou)}),enregistrer:async(table,id,row)=>{if(table==='evaluation_scores'&&globalThis.failOnce){globalThis.failOnce=false;throw Error('Simulation interruption')}globalThis.writes=globalThis.writes.filter(w=>w.row.id!==id);globalThis.writes.push({table,row})}};
   });
   await page.addScriptTag({content:source});await page.evaluate(()=>openRunningFinal());
   assert.equal(await page.locator('[data-score="0"]').inputValue(),'8');
   await page.locator('[data-mode]').selectOption('best');assert.equal(await page.locator('[data-score="0"]').inputValue(),'10');
   await page.locator('[data-mode]').selectOption('progress');assert.equal(await page.locator('[data-score="0"]').inputValue(),'9');
   await page.locator('[data-malus]').check();assert.equal(await page.locator('[data-score="1"]').inputValue(),'7');
   await page.locator('[data-session="1"]').uncheck();assert.equal(await page.locator('[data-score="0"]').inputValue(),'10');
   await page.locator('[data-all]').click();
   await page.locator('[data-score="0"]').fill('9.5');
   await page.locator('[data-save]').click();assert.match(await page.locator('[role="status"]').innerText(),/interruption/);
   await page.locator('[data-save]').click();await page.getByText('Bilan ajouté à l’évaluation finale',{exact:true}).waitFor();
   const writes=await page.evaluate(()=>globalThis.writes);
   assert.equal(writes.filter(w=>w.table==='evaluation_criteria').length,1);
   assert.equal(writes.find(w=>w.table==='evaluation_criteria').row.evaluation_id,'final');
   assert.deepEqual(writes.filter(w=>w.table==='evaluation_scores').map(w=>w.row.points),[9.5,7]);
   assert.equal(writes.some(w=>w.row.student_id==='z'),false);
   await page.close();
  }
  console.log('PASS desktop et mobile/PWA : sélection, trois méthodes, retouche, absence et reprise sans doublon.');
 } finally {await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
