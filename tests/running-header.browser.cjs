const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(p).isDirectory())p=path.join(p,'index.html');res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,768,390]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  const p=await context.newPage();let confirmChange=false;const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>confirmChange?d.accept():d.dismiss());await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForTimeout(900);
  await p.evaluate(()=>{showTab('outils');epsOpenTest='TROIS_500';openTool('tests');globalThis.elevesActifsPourSeance=(id,list)=>list;ecPeriodeDuJour=()=>3});await p.locator('#toolClass').selectOption('cl-3e6');await p.waitForSelector('[data-run-student="el-3"]');
  assert.equal(await p.locator('.modern-tool-hero #toolClass').count(),1);assert.equal(await p.locator('[data-eps-period]').count(),0);assert.equal(await p.locator('.eps-test-context').count(),0);assert(!/P[1-5]/.test(await p.locator('.modern-tool-hero').innerText()));assert.equal(await p.evaluate(()=>epsTestPeriod),3);
  const hero=await p.locator('.modern-tool-hero').boundingBox(),select=await p.locator('#toolClass').boundingBox(),close=await p.locator('#closeToolBtn').boundingBox(),start=await p.locator('#epsBegin').boundingBox(),title=await p.locator('.modern-tool-hero h2').boundingBox();
  assert(select.x>=0&&select.x+select.width<=width);assert(close.x>=0&&close.x+close.width<=width);assert(start.y>=hero.y+hero.height-2&&start.y<hero.y+hero.height+100);
  if(width>650){assert(select.x>title.x+title.width);assert(select.x+select.width<close.x)}
  await p.locator('[data-run-student="el-3"]').first().fill('315');await p.locator('#epsBegin').click();assert.equal(await p.locator('.modern-tool-hero #toolClass').count(),1);assert.equal(await p.locator('#epsBegin').count(),0);
  await p.locator('#toolClass').selectOption('cl-2nde1');assert.equal(await p.locator('#toolClass').inputValue(),'cl-3e6');assert.equal(await p.locator('[data-run-student="el-3"]').first().inputValue(),'315');
  confirmChange=true;await p.locator('#toolClass').selectOption('cl-2nde1');await p.waitForSelector('[data-run-student="el-11"]');assert.equal(await p.evaluate(()=>toolClassId),'cl-2nde1');assert.equal(await p.evaluate(()=>epsTestPeriod),3);
  const classification=await p.evaluate(async()=>{
   const data=__fauxServeur.DONNEES;data.eps_test_sessions.push({id:'running-old',class_id:'cl-3e6',user_id:'prof-test',period_number:2,test_name:'3 × 500 m',created_at:Date.UTC(2026,10,2),updated_at:'2026-11-02T12:00:00Z',deleted:false});
   data.eps_test_results.push({id:'running-row',session_id:'running-old',student_id:'el-3',user_id:'prof-test',input_value:195,result_value:7,input_unit:'runs:500:3:group:0:difficulty:0:mode:run:times:315|318|320',result_unit:'/12',deleted:false});
   // The earlier fixture tables have already been cached by the offline engine.
   // Supply this newly introduced session explicitly, without altering the real adapter.
   const originalRead=lireTable;lireTable=async(table,path,options={})=>['eps_test_sessions','eps_test_results'].includes(table)?data[table].filter(options.ou||(()=>true)).sort(options.trier):originalRead(table,path,options);
   await ouvrirSessionTrois500DepuisClasse('running-old','cl-3e6',2);
   const writes=[],original=enregistrerLigne;enregistrerLigne=async(table,row)=>{writes.push({table,row});return original(table,row)};
   await saveRunningSeries(EpsTests.TESTS.TROIS_500,false);enregistrerLigne=original;lireTable=originalRead;
   const stored=writes.find(w=>w.table==='eps_test_sessions').row;return{period:epsTestPeriod,storedPeriod:stored.period_number,storedClass:stored.class_id,id:stored.id};
  });assert.deepEqual(classification,{period:2,storedPeriod:2,storedClass:'cl-3e6',id:'running-old'});assert.equal(await p.locator('[data-eps-period]').count(),0);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS 3x500 header desktop/tablet/mobile: one class selector in header, no period controls, start button raised, class change protected, automatic classification preserved');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
