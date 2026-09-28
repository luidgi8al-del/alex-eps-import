const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(8893,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1600,height:900},serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});const page=await context.newPage();await page.goto('http://127.0.0.1:8893');await page.waitForTimeout(900);
 const layout=await page.evaluate(()=>[...document.querySelectorAll('.homeModuleCard')].map(card=>{const title=card.querySelector('.homeModuleIntro').getBoundingClientRect(),box=card.getBoundingClientRect(),insight=card.querySelector('.homeModuleInsight').getBoundingClientRect();return{titleRatio:(title.top-box.top)/box.height,insightCenter:(insight.top+insight.height/2-box.top)/box.height}}));
 assert.equal(layout.length,4);layout.forEach(item=>{assert(item.titleRatio<.22);assert(item.insightCenter>.42&&item.insightCenter<.78)});
 await page.click('#homeToolsTitle');await page.waitForSelector('#tab-outils',{state:'visible'});
 await page.evaluate(()=>showTab('home'));await page.click('#homeAsTitle');await page.waitForSelector('#tab-unss',{state:'visible'});
 await page.evaluate(()=>showTab('home'));await page.click('#homeEquipmentTitle');await page.waitForSelector('#tab-equipement',{state:'visible'});
 await page.evaluate(()=>showTab('home'));await page.click('#homeProgrammingTitle');await page.waitForSelector('#tab-programmation',{state:'visible'});
 await page.evaluate(()=>showTab('home'));
 await page.click('[data-home-module="tools"]');await page.waitForSelector('.tools-section-head h3',{state:'visible'});assert.equal(await page.locator('.tools-section-head h3').first().textContent(),'Mes favoris');
 await page.evaluate(()=>showTab('home'));await page.click('[data-home-module="equipement"]');await page.waitForSelector('#tab-equipement',{state:'visible'});
 await page.evaluate(()=>showTab('home'));await page.click('[data-home-module="bac"]');await page.waitForSelector('[data-planningtab="bac"].active',{state:'visible',timeout:8000});
 console.log('PASS whole home cards open their modules and shortcuts open favorites, equipment and BAC');
 }finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
