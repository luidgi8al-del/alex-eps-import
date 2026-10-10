const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const mode of ['desktop','mobile','pwa']){
  const context=await browser.newContext({viewport:mode==='desktop'?{width:1440,height:950}:{width:390,height:844},isMobile:mode!=='desktop',hasTouch:mode!=='desktop',serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  if(mode==='pwa')await context.addInitScript(()=>{const old=matchMedia;window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true,media:q,addEventListener(){},removeEventListener(){}}:old(q)});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'Endurance':undefined));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  await page.evaluate(()=>{
   const read=lireTable;window.auditDb={};
   lireTable=async(table,url,options)=>{if(['eps_test_sessions','eps_test_results'].includes(table)){let rows=Object.values(auditDb[table]||{});for(const[k,v]of new URL('http://test/'+url).searchParams)if(v.startsWith('eq.'))rows=rows.filter(r=>String(r[k])===v.slice(3));return rows}return read(table,url,options)};
   enregistrerLigne=async(table,row)=>{auditDb[table]??={};auditDb[table][row.id]=structuredClone(row)};
   showTab('outils');resetToolsWorkspace();openTool('vma');
  });
  await page.locator('#toolClass').selectOption('cl-3e6');
  assert.equal(await page.locator('#vmaResults').isVisible(),false);
  await page.locator('#vmaBegin').click();assert.equal(await page.locator('#vmaPreparation').isVisible(),false);
  const input=page.locator('[data-vma-input]').first();const student=await input.getAttribute('data-vma-input');await input.fill('4');
  await page.locator('#wfEditGroups').click();assert.equal(await page.locator('#vmaResults').isVisible(),false);
  await page.locator('#wfAddGroup').click();await page.locator(`[data-wf-assign="${student}"]`).selectOption('1');await page.locator('#wfFinishGroups').click();
  assert.equal(await page.locator(`[data-vma-input="${student}"]`).inputValue(),'4');
  await page.locator('#vmaSaveBtn').click();await page.waitForFunction(()=>!!vmaSessionId);
  const id=await page.evaluate(()=>vmaSessionId);
  await page.locator('#vmaEditPreparation').click();await page.locator('#wfEditGroups').click();await page.locator(`[data-wf-assign="${student}"]`).selectOption('');
  await page.locator('#vmaBegin').click();await page.locator('#wfGroup').selectOption('');
  assert.equal(await page.locator(`[data-vma-input="${student}"]`).inputValue(),'4');
  await page.evaluate(id=>openVmaSession(id),id);
  assert.equal(await page.locator('#vmaPreparation').isVisible(),false);assert.equal(await page.locator('#vmaResults').isVisible(),true);
  await page.locator('#wfGroup').selectOption('1');assert.equal(await page.locator(`[data-vma-input="${student}"]`).inputValue(),'4');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  console.log('PASS',mode,'VMA préparation, groupes, conservation des valeurs et reprise');await context.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
