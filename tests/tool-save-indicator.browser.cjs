const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(p).isDirectory())p=path.join(p,'index.html');res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  const page=await context.newPage();page.on('dialog',d=>d.accept());await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>typeof EpsToolSave==='object');
  await page.evaluate(()=>{showTab('outils');openTool('aptitudes')});await page.waitForSelector('.tool-save-indicator');
  const colour=()=>page.locator('.tool-save-indicator').getAttribute('data-state');assert.equal(await colour(),'red');
  await page.evaluate(()=>{const p=document.getElementById('toolPanel');p.insertAdjacentHTML('beforeend','<input id="proofInput"><button id="proofSave">Enregistrer</button>');globalThis.toolPanel=p;document.getElementById('proofSave').onclick=async()=>EpsToolSave.written(true)});
  await page.locator('#proofInput').fill('7');await page.locator('#proofSave').click();assert.equal(await colour(),'orange');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('eps:pwa-sync-state',{detail:{state:'synced',pending:0,conflicts:0,at:new Date().toISOString()}})));assert.equal(await colour(),'green');
  await page.locator('#proofInput').fill('8');assert.equal(await colour(),'red');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('eps:pwa-sync-state',{detail:{state:'synced',pending:0,conflicts:0}})));assert.equal(await colour(),'red');
  await page.evaluate(()=>{const t=EpsToolSave.begin();EpsToolSave.written(true);EpsToolSave.failed();EpsToolSave.finish(t)});assert.equal(await colour(),'red');
  await page.evaluate(()=>{const t=EpsToolSave.begin();EpsToolSave.written(true);EpsToolSave.dirty();EpsToolSave.finish(t)});assert.equal(await colour(),'red');
  await page.evaluate(()=>{const t=EpsToolSave.begin();EpsToolSave.written(false);EpsToolSave.finish(t)});assert.equal(await colour(),'green');
  const box=await page.locator('.tool-close-controls').boundingBox();assert(box.x>=0&&box.x+box.width<=(mobile?390:1280));
  await context.close();
 }
 console.log('PASS tool dot desktop/mobile: red edit, orange local save, green remote acknowledgement, failed/partial/concurrent save stays red, header fits');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
