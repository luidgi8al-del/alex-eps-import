const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));}catch{res.statusCode=404;res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [390,1440]) {
  const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await c.addInitScript({content:'const navRealSet=Storage.prototype.setItem;'+fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')+';Storage.prototype.setItem=navRealSet;'});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForSelector('#mainView[style*="block"]');
  await p.evaluate(()=>EpsMobileDisplay.setMode('mobile'));
  await p.locator('#mobileHome .tool-resume-card').click();await p.waitForFunction(()=>history.state?.tool===true);
  await p.goBack();await p.waitForFunction(()=>currentWebTab==='home');assert.equal(await p.locator('#mobileHome').isVisible(),true);
  await p.locator('#mobileBottomNav [data-mobile-tab=outils]').click();await p.locator('[data-activity="Athlétisme"]').click();await p.waitForFunction(()=>history.state?.workspace?.activity==='Athlétisme');
  await p.goBack();await p.waitForSelector('[data-activity="Athlétisme"]',{state:'visible'});
  await p.locator('[data-activity="Athlétisme"]').click();await p.locator('[data-open-modern="tests"]').click();await p.locator('[data-eps-test="TROIS_500"]').click();await p.waitForFunction(()=>history.state?.tool===true);
  // A pristine tool does not ask for confirmation.
  assert.equal(await p.evaluate(()=>EpsToolSave.hasUnsaved()),false);
  await p.goBack();await p.waitForSelector('#toolsActivityBack',{state:'visible'});assert.equal(await p.locator('.tools-section-head h3').last().innerText(),'Athlétisme');
  await p.locator('[data-open-modern="tests"]').click();await p.locator('[data-eps-test="TROIS_500"]').click();await p.waitForFunction(()=>history.state?.tool===true);
  await p.locator('#toolClass').selectOption('cl-3e6');await p.waitForSelector('[data-run-student]');await p.locator('[data-run-student]').first().fill('315');
  const student=await p.locator('[data-run-student]').first().getAttribute('data-run-student');
  p.once('dialog',d=>d.dismiss());await p.goBack();await p.waitForFunction(()=>history.state?.tool===true);assert.equal(await p.locator('[data-run-student]').first().inputValue(),'315');
  p.once('dialog',d=>d.accept());await p.goBack();await p.waitForSelector('#toolsActivityBack',{state:'visible'});assert.equal(await p.evaluate(id=>EpsToolResume.read().payload.values[id][0],student),'315');
  await p.goBack();await p.waitForSelector('[data-activity="Athlétisme"]',{state:'visible'});await p.goBack();await p.waitForFunction(()=>currentWebTab==='home');
  // Ordinary tabs restore their previous screen instead of leaving the document.
  await p.locator('#mobileHome [data-mobile-tab=planning]').click();await p.waitForFunction(()=>currentWebTab==='planning');await p.goBack();await p.waitForFunction(()=>currentWebTab==='home');
  await p.locator('#mobileHome .tool-resume-card').click();await p.waitForFunction(()=>history.state?.tool===true);await p.evaluate(()=>closeModernTool());await p.waitForFunction(()=>currentWebTab==='home');
  assert.deepEqual(errors,[]);await c.close();
 }
 console.log('PASS phone/browser Back: resumed tool to home; category and tool origin; untouched tool without warning; cancel preserves values; confirmed Back captures draft; tabs restore origin');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
