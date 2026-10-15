const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),reports=path.join(root,'../tmp/tools-shortcuts');fs.mkdirSync(reports,{recursive:true});
const server=http.createServer((req,res)=>{try{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1280,390,320]){
  const c=await browser.newContext({viewport:{width,height:900},isMobile:width<600,serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await c.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  await p.evaluate(()=>{showTab('outils');resetToolsWorkspace()});await p.waitForSelector('.tools-resume-slot .tool-resume-card');
  const bar=p.locator('.tools-quick-access');
  assert.equal(await bar.count(),1);assert.equal(await p.locator('#toolsWorkspace > .tool-resume-card').count(),0);
  assert.deepEqual(await bar.locator(':scope > *').evaluateAll(a=>a.map(e=>e.querySelector('strong').textContent)),['Favoris','Reprendre mon travail','Bac EPS']);
  const boxes=await bar.locator(':scope > *').evaluateAll(a=>a.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y}}));
  if(width>700){assert.equal(boxes[0].y,boxes[2].y);assert(boxes[0].x<boxes[1].x&&boxes[1].x<boxes[2].x)}else assert(boxes[0].y<boxes[1].y&&boxes[1].y<boxes[2].y);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(reports,`tools-${width}.png`)});
  await p.locator('#toolsFavoritesShortcut').click();await p.waitForSelector('#toolsFavoritesBack');await p.locator('#toolsFavoritesBack').click();
  await p.locator('.tools-bac-shortcut').click();await p.waitForSelector('[data-bac-open="3x500"]');
  await p.evaluate(()=>{resetToolsWorkspace()});await p.waitForSelector('.tools-resume-slot .tool-resume-card');await p.locator('.tool-resume-card').click();await p.waitForFunction(()=>document.getElementById('toolsWorkspace').hidden);
  await p.evaluate(async()=>{EpsToolWorks.read=async()=>[];lireTable=async()=>[];resetToolsWorkspace();await EpsToolResume.offer(document.getElementById('toolsWorkspace'))});
  assert.equal(await p.locator('.tool-resume-card').count(),0);assert.match(await p.locator('.tools-resume-slot').innerText(),/Aucun travail/);
  assert.deepEqual(errors,[]);console.log('tools shortcuts OK',width);await c.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
