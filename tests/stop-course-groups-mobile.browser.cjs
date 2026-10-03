const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{
 await new Promise(resolve=>server.listen(8916,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  const page=await context.newPage();await page.goto('http://127.0.0.1:8916');await page.waitForTimeout(700);
  await page.evaluate(()=>{
   document.body.innerHTML='<div id="epsTestBody"></div>';
   toolStudents=[{id:'a',first_name:'Lina',last_name:'Martin'},{id:'b',first_name:'Adam',last_name:'Bernard'}];
   toolClassId='classe';epsTestPeriod=1;stopSessions=[];stopGroupCount=0;stopGroupAssignments={};stopActiveGroup=0;stopGroupEditing=null;stopGroupSelection=new Set();
   paintStopCourseTest({label:'Arrêt course',protocol:'Test'});
  });
  await page.locator('#stopCreateGroup').tap();
  const first=page.locator('[data-stop-pick-row="a"]');
  assert.equal(await first.getAttribute('aria-pressed'),'false');
  await first.tap();
  assert.equal(await first.getAttribute('aria-pressed'),'true');
  assert.equal(await first.locator('.stop-group-check').textContent(),'✓');
  assert.equal(await page.locator('#stopApplyGroup').isEnabled(),true);
  await first.tap();assert.equal(await first.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#stopApplyGroup').isDisabled(),true);
  await first.tap();await page.locator('[data-stop-pick-row="b"]').tap();await page.locator('#stopApplyGroup').tap();
  assert.match(await page.locator('[data-stop-group="1"]').textContent(),/2/);
  console.log('Arrêt course mobile : sélection de toute la ligne et validation du groupe OK');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
