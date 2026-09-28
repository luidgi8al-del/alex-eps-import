const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(8894,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1400,height:900},serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
 const page=await context.newPage();await page.goto('http://127.0.0.1:8894');await page.waitForTimeout(900);
 await page.evaluate(()=>showTab('unss'));await page.waitForTimeout(1000);
 await page.evaluate(()=>{unssSlots=[{id:'test1',activity_name:'Aquathlon',responsible_teacher:'Regnier',day_of_week:'mercredi',start_time:'13:00:00',end_time:'15:30:00'},{id:'test2',activity_name:'Natation',responsible_teacher:'M. Thooris',day_of_week:'lundi',start_time:'12:00',end_time:'13:00'}];renderUnssSlotsTab();});
 const downloadBox=await page.locator('#unssSlotsDownloadBtn').boundingBox(),addBox=await page.locator('#unssSlotAddBtn').boundingBox();assert(downloadBox.x<addBox.x);
 await page.click('#unssSlotsDownloadBtn');const downloading=page.waitForEvent('download');await page.click('[data-format="csv"]');const download=await downloading;assert.equal(download.suggestedFilename(),'creneaux-aslvh.csv');
 const csv=fs.readFileSync(await download.path(),'utf8');assert(csv.includes('Aquathlon')&&csv.includes('M. Regnier')&&csv.includes('Mme Thooris')&&csv.includes('15h30'));assert.equal(csv.split('\r\n').length,3);
 await page.click('#unssSlotsDownloadBtn');const opening=page.waitForEvent('popup');await page.click('[data-format="pdf"]');const popup=await opening;await popup.waitForLoadState();assert.equal(await popup.locator('tbody tr').count(),2);assert((await popup.locator('body').innerText()).includes('Mme Thooris'));
 await popup.screenshot({path:path.join(process.env.TEMP,'as-slots-summary-preview.png'),fullPage:true});
 console.log('PASS button placement, CSV download and printable PDF table; no network or emails sent');
 }finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
