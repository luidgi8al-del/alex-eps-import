const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(8892,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1500,height:900},serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});const page=await context.newPage();await page.goto('http://127.0.0.1:8892/#emails');await page.waitForTimeout(700);
 await page.click('[data-tab="emails"]');await page.waitForSelector('#tab-emails:not([style*="display: none"])');
 assert.equal(await page.locator('#emailHubCompose').isVisible(),true);assert.equal(await page.locator('#emailHubHistory').isVisible(),false);
 await page.click('[data-email-hub-view="history"]');assert.equal(await page.locator('#emailHubHistory').isVisible(),true);
 const desktop=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,columns:getComputedStyle(document.querySelector('.email-hub')).gridTemplateColumns}));assert.equal(desktop.overflow,0);assert.equal(desktop.columns.split(' ').length,2);
 await page.setViewportSize({width:720,height:900});await page.waitForTimeout(80);const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,columns:getComputedStyle(document.querySelector('.email-hub')).gridTemplateColumns}));assert.equal(mobile.overflow,0);assert.equal(mobile.columns.split(' ').length,1);
 console.log('email-hub browser: navigation and responsive layout OK');
 }finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
